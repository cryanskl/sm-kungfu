// ============================================================
// 成就系统 — AI 武林大会
// ============================================================

import { supabaseAdmin } from '../supabase';
import type { Achievement, AchievementUnlock } from '../types';
import type { BattleStats } from './battle-stats';

// ============================================================
// 成就上下文（局内 + 跨局数据）
// ============================================================

export interface AchievementContext {
  heroId: string;
  heroName: string;
  isNpc: boolean;
  // 局内数据
  gameHero: any; // game_heroes row
  allEvents: any[];
  titleAwards: { heroId: string; title: string; points: number }[];
  battleStats: BattleStats;
  // 跨局数据
  lifetimeStats: Record<string, number>;
  existingAchievements: string[];
}

// ============================================================
// 成就定义
// ============================================================

interface AchievementDef extends Achievement {
  evaluate: (ctx: AchievementContext) => boolean;
}

const ACHIEVEMENTS: AchievementDef[] = [
  // === 局内即时 ===
  {
    id: 'first_blood',
    name: '先下手为强',
    description: '本局第一个发起攻击',
    icon: '🩸',
    category: 'instant',
    points: 10,
    evaluate: (ctx) => {
      const fights = ctx.allEvents.filter((e: any) => e.event_type === 'fight');
      return fights.length > 0 && fights[0].hero_id === ctx.heroId;
    },
  },
  {
    id: 'double_kill',
    name: '双杀',
    description: '一回合内攻击 2 个不同目标',
    icon: '⚔️',
    category: 'instant',
    points: 15,
    evaluate: (ctx) => {
      const roundTargets = new Map<number, Set<string>>();
      for (const e of ctx.allEvents) {
        if (e.hero_id !== ctx.heroId || e.event_type !== 'fight') continue;
        if (!roundTargets.has(e.round)) roundTargets.set(e.round, new Set());
        if (e.target_hero_id) roundTargets.get(e.round)!.add(e.target_hero_id);
      }
      return Array.from(roundTargets.values()).some(s => s.size >= 2);
    },
  },
  {
    id: 'iron_wall',
    name: '铜墙铁壁',
    description: '被围攻后存活且反击成功',
    icon: '🛡️',
    category: 'instant',
    points: 20,
    evaluate: (ctx) => {
      const wasGanged = ctx.allEvents.some((e: any) =>
        e.event_type === 'gang_up' && e.target_hero_id === ctx.heroId
      );
      const fought = ctx.allEvents.some((e: any) =>
        e.event_type === 'fight' && e.hero_id === ctx.heroId
      );
      return wasGanged && fought && !ctx.gameHero.is_eliminated;
    },
  },
  {
    id: 'death_pact_victor',
    name: '生死状胜者',
    description: '签生死状后获胜存活',
    icon: '📜',
    category: 'instant',
    points: 25,
    evaluate: (ctx) => {
      return ctx.gameHero.has_death_pact && !ctx.gameHero.is_eliminated;
    },
  },
  {
    id: 'betrayer_betrayed',
    name: '反噬',
    description: '被自己的盟友背叛',
    icon: '🗡️',
    category: 'instant',
    points: 10,
    evaluate: (ctx) => {
      return ctx.allEvents.some((e: any) =>
        e.event_type === 'betray' && e.target_hero_id === ctx.heroId
      );
    },
  },
  {
    id: 'scroll_master',
    name: '残卷争霸',
    description: 'R1 残卷争夺第一名',
    icon: '📖',
    category: 'instant',
    points: 15,
    evaluate: (ctx) => {
      const scrambles = ctx.allEvents.filter((e: any) =>
        e.event_type === 'scramble' && e.round === 1 && e.hero_id === ctx.heroId
      );
      return scrambles.some((e: any) => e.data?.won === true);
    },
  },
  {
    id: 'master_apprentice',
    name: '名师高徒',
    description: 'R2 被方丈收为弟子',
    icon: '🧙',
    category: 'instant',
    points: 15,
    evaluate: (ctx) => {
      return ctx.allEvents.some((e: any) =>
        e.round === 2 && e.hero_id === ctx.heroId && e.data?.isMaster === true
      );
    },
  },
  {
    id: 'most_wanted_survivor',
    name: '通缉令幸存者',
    description: 'R4 被通缉后存活到结束',
    icon: '🎯',
    category: 'instant',
    points: 20,
    evaluate: (ctx) => {
      const wasWanted = ctx.allEvents.some((e: any) =>
        e.round === 4 && e.data?.wantedHeroId === ctx.heroId
      );
      return wasWanted && !ctx.gameHero.is_eliminated;
    },
  },

  // === 跨局积累 ===
  {
    id: 'veteran_10',
    name: '江湖老手',
    description: '累计参赛 10 局',
    icon: '🎖️',
    category: 'accumulated',
    points: 20,
    evaluate: (ctx) => (ctx.lifetimeStats.totalGames || 0) >= 10,
  },
  {
    id: 'champion_3',
    name: '三冠王',
    description: '累计夺冠 3 次',
    icon: '👑',
    category: 'accumulated',
    points: 50,
    evaluate: (ctx) => (ctx.lifetimeStats.totalWins || 0) >= 3,
  },
  {
    id: 'betrayal_victim_5',
    name: '忍辱负重',
    description: '累计被背叛 5 次',
    icon: '💔',
    category: 'accumulated',
    points: 15,
    evaluate: (ctx) => (ctx.lifetimeStats.betrayedCount || 0) >= 5,
  },
  {
    id: 'all_factions',
    name: '百家争鸣',
    description: '以不同门派身份各赢过一局',
    icon: '🏯',
    category: 'accumulated',
    points: 40,
    evaluate: (ctx) => {
      const factions = ctx.lifetimeStats.winFactions;
      if (!factions) return false;
      // 至少 5 个不同门派获胜
      return typeof factions === 'number' && factions >= 5;
    },
  },
  {
    id: 'pacifist_win',
    name: '不战而胜',
    description: '从未主动攻击却进入四强',
    icon: '☮️',
    category: 'accumulated',
    points: 30,
    evaluate: (ctx) => {
      const attacked = ctx.allEvents.some((e: any) =>
        e.event_type === 'fight' && e.hero_id === ctx.heroId
      );
      const inTop4 = (ctx.gameHero.final_rank || 99) <= 4;
      return !attacked && inTop4;
    },
  },
  {
    id: 'train_master',
    name: '修炼狂人',
    description: '累计修炼 20 次',
    icon: '🧘',
    category: 'accumulated',
    points: 15,
    evaluate: (ctx) => (ctx.lifetimeStats.trainCount || 0) >= 20,
  },

  // === 隐藏成就 ===
  {
    id: 'sweeping_monk',
    name: '扫地僧',
    description: '???',
    icon: '🧹',
    category: 'hidden',
    points: 50,
    evaluate: (ctx) => {
      // 前 4 轮全修炼 + R5 签生死状后赢
      const trainRounds = new Set<number>();
      for (const e of ctx.allEvents) {
        if (e.hero_id === ctx.heroId && e.event_type === 'train') {
          trainRounds.add(e.round);
        }
      }
      const trainedR1to4 = [1, 2, 3, 4].every(r => trainRounds.has(r));
      return trainedR1to4 && ctx.gameHero.has_death_pact && !ctx.gameHero.is_eliminated;
    },
  },
  {
    id: 'phoenix',
    name: '浴火重生',
    description: '???',
    icon: '🔥',
    category: 'hidden',
    points: 30,
    evaluate: (ctx) => {
      // HP 曾降到 10 以下后回到 60 以上（通过事件推断）
      let hp = 80; // initial HP
      let hitLow = false;
      for (const e of ctx.allEvents) {
        if (e.hero_id !== ctx.heroId) continue;
        const delta = e.hp_delta || 0;
        if (e.event_type === 'fight' || e.event_type === 'gang_up') {
          if (e.target_hero_id === ctx.heroId) hp += delta;
        } else {
          hp += delta;
        }
        hp = Math.max(0, Math.min(80, hp));
        if (hp <= 10) hitLow = true;
        if (hitLow && hp >= 60) return true;
      }
      return false;
    },
  },
  {
    id: 'crowd_favorite',
    name: '万人迷',
    description: '???',
    icon: '💖',
    category: 'hidden',
    points: 25,
    evaluate: (ctx) => {
      // Hot 值超过 100
      return (ctx.gameHero.hot || 0) >= 100;
    },
  },
  {
    id: 'lone_wolf',
    name: '独狼',
    description: '???',
    icon: '🐺',
    category: 'hidden',
    points: 20,
    evaluate: (ctx) => {
      // 全程无结盟、无背叛、进入四强
      const allied = ctx.allEvents.some((e: any) =>
        (e.event_type === 'ally_formed' && (e.hero_id === ctx.heroId || e.target_hero_id === ctx.heroId))
      );
      const inTop4 = (ctx.gameHero.final_rank || 99) <= 4;
      return !allied && inTop4;
    },
  },
];

// ============================================================
// 成就评估与发放
// ============================================================

/**
 * 从本局事件中提取英雄统计数据
 */
function extractGameStats(heroId: string, allEvents: any[]): Record<string, number> {
  const stats: Record<string, number> = {
    killCount: 0,
    betrayedCount: 0,
    trainCount: 0,
    fightCount: 0,
    allyCount: 0,
  };

  for (const e of allEvents) {
    if (e.hero_id === heroId) {
      if (e.event_type === 'eliminated' && e.data?.killerId) stats.killCount++;
      if (e.event_type === 'train') stats.trainCount++;
      if (e.event_type === 'fight') stats.fightCount++;
      if (e.event_type === 'ally_formed') stats.allyCount++;
    }
    if (e.target_hero_id === heroId && e.event_type === 'betray') {
      stats.betrayedCount++;
    }
  }

  return stats;
}

/**
 * 评估并发放成就
 */
export async function evaluateAndAwardAchievements(
  gameId: string,
  gameHeroes: any[],
  allEvents: any[],
  titleAwards: { heroId: string; title: string; points: number }[],
  battleStats: BattleStats,
): Promise<AchievementUnlock[]> {
  const allUnlocks: AchievementUnlock[] = [];
  const heroIds = gameHeroes.map((gh: any) => gh.hero_id);

  // 批量查询：已解锁成就 + 英雄生涯数据（替代 N+1 串行查询）
  const [{ data: allExisting }, { data: allHeroRecords }] = await Promise.all([
    supabaseAdmin.from('hero_achievements').select('hero_id, achievement_id').in('hero_id', heroIds),
    supabaseAdmin.from('heroes').select('id, lifetime_stats, total_wins, total_games').in('id', heroIds),
  ]);

  const existingMap = new Map<string, Set<string>>();
  for (const a of allExisting || []) {
    if (!existingMap.has(a.hero_id)) existingMap.set(a.hero_id, new Set());
    existingMap.get(a.hero_id)!.add(a.achievement_id);
  }
  const heroRecordMap = new Map((allHeroRecords || []).map(h => [h.id, h]));

  // 内存评估（无 DB 调用）
  const pendingUpserts: { hero_id: string; achievement_id: string; game_id: string }[] = [];
  const pendingLifetimeUpdates: { heroId: string; lifetime: Record<string, number> }[] = [];

  for (const gh of gameHeroes) {
    const heroId = gh.hero_id;
    const heroName = gh.hero?.hero_name || '无名';
    const isNpc = gh.hero?.is_npc || false;
    const existingIds = existingMap.get(heroId) || new Set();
    const heroRecord = heroRecordMap.get(heroId);

    const lifetimeStats: Record<string, number> = {
      ...(heroRecord?.lifetime_stats || {}),
      totalWins: heroRecord?.total_wins || 0,
      totalGames: heroRecord?.total_games || 0,
    };

    const ctx: AchievementContext = {
      heroId, heroName, isNpc, gameHero: gh,
      allEvents, titleAwards, battleStats, lifetimeStats,
      existingAchievements: Array.from(existingIds),
    };

    for (const achievement of ACHIEVEMENTS) {
      if (existingIds.has(achievement.id)) continue;
      try {
        if (achievement.evaluate(ctx)) {
          pendingUpserts.push({ hero_id: heroId, achievement_id: achievement.id, game_id: gameId });
          allUnlocks.push({
            heroId, heroName,
            achievementId: achievement.id, achievementName: achievement.name,
            icon: achievement.icon, points: achievement.points,
          });
        }
      } catch { /* 评估出错跳过 */ }
    }

    const gameStats = extractGameStats(heroId, allEvents);
    const updatedLifetime: Record<string, number> = { ...lifetimeStats };
    updatedLifetime.killCount = (updatedLifetime.killCount || 0) + gameStats.killCount;
    updatedLifetime.betrayedCount = (updatedLifetime.betrayedCount || 0) + gameStats.betrayedCount;
    updatedLifetime.trainCount = (updatedLifetime.trainCount || 0) + gameStats.trainCount;
    updatedLifetime.fightCount = (updatedLifetime.fightCount || 0) + gameStats.fightCount;
    updatedLifetime.allyCount = (updatedLifetime.allyCount || 0) + gameStats.allyCount;
    pendingLifetimeUpdates.push({ heroId, lifetime: updatedLifetime });
  }

  // 批量写入（1次 upsert + 并行 update）
  await Promise.all([
    pendingUpserts.length > 0
      ? supabaseAdmin.from('hero_achievements').upsert(pendingUpserts, { onConflict: 'hero_id,achievement_id' })
      : Promise.resolve(),
    ...pendingLifetimeUpdates.map(u =>
      supabaseAdmin.from('heroes').update({ lifetime_stats: u.lifetime }).eq('id', u.heroId)
    ),
  ]);

  return allUnlocks;
}

/**
 * 即时成就评估（每轮结束后调用，不做 DB 写入）
 * 返回本轮新触发的成就 — 用于前端 toast 展示
 */
export function evaluateInstantAchievementsInMemory(
  gameHeroes: any[],
  allEvents: any[],
  alreadyAwarded: string[],
): AchievementUnlock[] {
  const newUnlocks: AchievementUnlock[] = [];
  const awardedSet = new Set(alreadyAwarded);

  for (const gh of gameHeroes) {
    const heroId = gh.hero_id;
    const heroName = gh.hero?.hero_name || '无名';

    const ctx: AchievementContext = {
      heroId,
      heroName,
      isNpc: gh.hero?.is_npc || false,
      gameHero: gh,
      allEvents,
      titleAwards: [],
      battleStats: {} as any,
      lifetimeStats: {},
      existingAchievements: [],
    };

    for (const achievement of ACHIEVEMENTS) {
      if (achievement.category !== 'instant') continue;
      const key = `${heroId}:${achievement.id}`;
      if (awardedSet.has(key)) continue;
      try {
        if (achievement.evaluate(ctx)) {
          awardedSet.add(key);
          newUnlocks.push({
            heroId,
            heroName,
            achievementId: achievement.id,
            achievementName: achievement.name,
            icon: achievement.icon,
            points: achievement.points,
          });
        }
      } catch { /* skip */ }
    }
  }

  return newUnlocks;
}

/**
 * 返回全量成就定义（不含 evaluate），用于前端展示
 */
export function getAllAchievementDefs(): Achievement[] {
  return ACHIEVEMENTS.map(({ evaluate, ...rest }) => rest);
}

/**
 * 获取英雄的所有成就
 */
export async function getHeroAchievements(heroId: string): Promise<Achievement[]> {
  const { data } = await supabaseAdmin
    .from('hero_achievements')
    .select('achievement_id')
    .eq('hero_id', heroId);

  if (!data) return [];

  const unlockedIds = new Set(data.map((a: any) => a.achievement_id));
  return ACHIEVEMENTS
    .filter(a => unlockedIds.has(a.id))
    .map(({ evaluate, ...rest }) => rest);
}
