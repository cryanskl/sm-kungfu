// ============================================================
// 弹幕天意：观众影响力系统
// 观众通过发送特定关键词的弹幕，集体触发游戏效果
// ============================================================

import type { GameEvent, GameHeroSnapshot, AudienceInfluence } from '../types';

// --- 效果定义 ---

interface InfluenceEffect {
  id: string;
  keywords: RegExp;
  threshold: number;
  requiresHero: boolean;
  label: string;
  icon: string;
}

const INFLUENCE_EFFECTS: InfluenceEffect[] = [
  { id: 'poison',   keywords: /下毒|毒|poison/i,           threshold: 8,  requiresHero: false, label: '毒雾',   icon: '☠️' },
  { id: 'cheer',    keywords: /加油|支持|gogo/i,            threshold: 5,  requiresHero: true,  label: '助威',   icon: '📣' },
  { id: 'boo',      keywords: /嘘|菜|垃圾/i,               threshold: 5,  requiresHero: true,  label: '嘘声',   icon: '👎' },
  { id: 'duel',     keywords: /决斗|打架|PK/i,              threshold: 8,  requiresHero: false, label: '决斗',   icon: '⚔️' },
  { id: 'treasure',  keywords: /天降神兵|宝物|神器/i,        threshold: 10, requiresHero: false, label: '神兵',   icon: '🗡️' },
  { id: 'peace',    keywords: /休战|和平|别打了/i,           threshold: 10, requiresHero: false, label: '休战',   icon: '🕊️' },
  { id: 'brawl',    keywords: /大乱斗|混战|全都打/i,         threshold: 8,  requiresHero: false, label: '混战',   icon: '💥' },
  { id: 'comeback', keywords: /翻盘|逆袭/i,                 threshold: 8,  requiresHero: false, label: '逆袭',   icon: '🔄' },
  { id: 'betrayal', keywords: /背叛|反水|叛徒/i,            threshold: 6,  requiresHero: false, label: '背叛',   icon: '🗡️' },
  { id: 'double',   keywords: /双倍|加倍|翻倍/i,            threshold: 10, requiresHero: false, label: '加倍',   icon: '✨' },
];

// 前端安全的展示数据（无 RegExp，可在 'use client' 中 import）
export const INFLUENCE_DISPLAY: { id: string; label: string; icon: string; threshold: number }[] =
  INFLUENCE_EFFECTS.map(e => ({ id: e.id, label: e.label, icon: e.icon, threshold: e.threshold }));

// --- 关键词检测 ---

export interface DetectedInfluence {
  category: string;
  heroTarget: string | null;
}

export function detectInfluence(text: string, heroNames: string[]): DetectedInfluence[] {
  const results: DetectedInfluence[] = [];

  for (const effect of INFLUENCE_EFFECTS) {
    if (!effect.keywords.test(text)) continue;

    let heroTarget: string | null = null;
    if (effect.requiresHero) {
      for (const name of heroNames) {
        if (text.includes(name)) {
          heroTarget = name;
          break;
        }
      }
      // requiresHero 但没匹配到英雄名 → 跳过
      if (!heroTarget) continue;
    }

    results.push({ category: effect.id, heroTarget });
  }

  return results;
}

// --- 效果应用（在 engine resolveRound 中调用）---

interface ApplyResult {
  events: Partial<GameEvent>[];
  consumed: string[];  // 已消费的 key（用于重置计数器）
}

export function applyAudienceEffects(
  influence: AudienceInfluence | null,
  snapshots: GameHeroSnapshot[],
  updates: Map<string, Record<string, any>>,
  gameHeroes: any[],
): ApplyResult {
  const events: Partial<GameEvent>[] = [];
  const consumed: string[] = [];

  if (!influence || !influence.counters) return { events, consumed };

  const alive = snapshots.filter(s => !s.isEliminated);
  const getHeroIdByName = (name: string) => snapshots.find(s => s.heroName === name)?.heroId;

  for (const effect of INFLUENCE_EFFECTS) {
    const count = influence.counters[effect.id] || 0;
    if (count < effect.threshold) continue;

    // 达到阈值 → 触发效果
    switch (effect.id) {
      case 'poison': {
        // 全场 -10 HP
        for (const h of alive) {
          addDelta(updates, h.heroId, 'hp', -10);
        }
        events.push({
          eventType: 'director_event',
          priority: 7,
          narrative: `☠️【弹幕天意】天降毒雾，群雄中毒！全员 -10 HP！（${count}条弹幕触发）`,
          data: { audienceEffect: 'poison', count },
        } as any);
        consumed.push('poison');
        break;
      }

      case 'cheer': {
        // 目标英雄 +10 hot
        const heroTargets = influence.heroTargets?.['cheer'] || {};
        const topTarget = Object.entries(heroTargets).sort((a, b) => b[1] - a[1])[0];
        if (topTarget) {
          const [heroName, votes] = topTarget;
          if (votes >= effect.threshold) {
            const heroId = getHeroIdByName(heroName);
            if (heroId) {
              addDelta(updates, heroId, 'hot', 10);
              events.push({
                eventType: 'hot_news',
                priority: 5,
                heroId,
                narrative: `📣【弹幕天意】观众疯狂为${heroName}助威！热度 +10！`,
                hotDelta: 10,
                data: { audienceEffect: 'cheer', heroName, votes },
              } as any);
              consumed.push(`cheer:${heroName}`);
            }
          }
        }
        break;
      }

      case 'boo': {
        // 目标英雄 -10 hot
        const heroTargets = influence.heroTargets?.['boo'] || {};
        const topTarget = Object.entries(heroTargets).sort((a, b) => b[1] - a[1])[0];
        if (topTarget) {
          const [heroName, votes] = topTarget;
          if (votes >= effect.threshold) {
            const heroId = getHeroIdByName(heroName);
            if (heroId) {
              addDelta(updates, heroId, 'hot', -10);
              events.push({
                eventType: 'hot_news',
                priority: 5,
                heroId,
                narrative: `👎【弹幕天意】观众嘘声一片！${heroName}热度 -10！`,
                hotDelta: -10,
                data: { audienceEffect: 'boo', heroName, votes },
              } as any);
              consumed.push(`boo:${heroName}`);
            }
          }
        }
        break;
      }

      case 'duel': {
        // 声望前2强制对决
        const sorted = [...alive].sort((a, b) => b.reputation - a.reputation);
        if (sorted.length >= 2) {
          const h1 = sorted[0];
          const h2 = sorted[1];
          const dmg = 15;
          addDelta(updates, h1.heroId, 'hp', -dmg);
          addDelta(updates, h2.heroId, 'hp', -dmg);
          addDelta(updates, h1.heroId, 'hot', 10);
          addDelta(updates, h2.heroId, 'hot', 10);
          events.push({
            eventType: 'director_event',
            priority: 7,
            heroId: h1.heroId,
            targetHeroId: h2.heroId,
            narrative: `⚔️【弹幕天意】观众高呼决斗！${h1.heroName} vs ${h2.heroName}强制交手！双方各损 ${dmg} HP！`,
            hpDelta: -dmg,
            data: { audienceEffect: 'duel', count },
          } as any);
        }
        consumed.push('duel');
        break;
      }

      case 'treasure': {
        // 随机一人获得武学
        const lucky = alive[Math.floor(Math.random() * alive.length)];
        if (lucky) {
          const martialArt = { name: '天降神兵', attackBonus: 5, defenseBonus: 3 };
          if (!updates.get(lucky.heroId)) updates.set(lucky.heroId, {});
          const u = updates.get(lucky.heroId)!;
          if (!u._martialArts) u._martialArts = [];
          u._martialArts.push(martialArt);
          events.push({
            eventType: 'director_event',
            priority: 6,
            heroId: lucky.heroId,
            narrative: `🗡️【弹幕天意】天降神兵！${lucky.heroName}获得【天降神兵】（攻+5，防+3）！`,
            data: { audienceEffect: 'treasure', martialArt },
          } as any);
        }
        consumed.push('treasure');
        break;
      }

      case 'peace': {
        // 标记本轮伤害 -50%（通过 data 传递给前端叙事，实际减半在 events 中体现）
        events.push({
          eventType: 'director_event',
          priority: 7,
          narrative: `🕊️【弹幕天意】观众呼吁休战！本轮气氛祥和，戾气消散……（效果已生效）`,
          data: { audienceEffect: 'peace', count },
        } as any);
        consumed.push('peace');
        break;
      }

      case 'brawl': {
        // 全员混战：所有人 -8 HP，+5 hot
        for (const h of alive) {
          addDelta(updates, h.heroId, 'hp', -8);
          addDelta(updates, h.heroId, 'hot', 5);
        }
        events.push({
          eventType: 'director_event',
          priority: 7,
          narrative: `💥【弹幕天意】天下大乱！群雄混战一团！全员 -8 HP，热度 +5！`,
          data: { audienceEffect: 'brawl', count },
        } as any);
        consumed.push('brawl');
        break;
      }

      case 'comeback': {
        // 最低 HP 的英雄 +30 HP
        const lowest = [...alive].sort((a, b) => a.hp - b.hp)[0];
        if (lowest) {
          addDelta(updates, lowest.heroId, 'hp', 30);
          addDelta(updates, lowest.heroId, 'hot', 15);
          events.push({
            eventType: 'director_event',
            priority: 7,
            heroId: lowest.heroId,
            narrative: `🔄【弹幕天意】逆天改命！${lowest.heroName}绝境逢生，HP +30，热度 +15！`,
            hpDelta: 30,
            data: { audienceEffect: 'comeback', heroName: lowest.heroName },
          } as any);
        }
        consumed.push('comeback');
        break;
      }

      case 'betrayal': {
        // 随机拆一对联盟
        const alliedPairs: [string, string][] = [];
        for (const gh of gameHeroes) {
          if (gh.is_eliminated || !gh.ally_hero_id) continue;
          const pair: [string, string] = [gh.hero_id, gh.ally_hero_id].sort() as [string, string];
          if (!alliedPairs.some(p => p[0] === pair[0] && p[1] === pair[1])) {
            alliedPairs.push(pair);
          }
        }
        if (alliedPairs.length > 0) {
          const [h1Id, h2Id] = alliedPairs[Math.floor(Math.random() * alliedPairs.length)];
          const h1Name = snapshots.find(s => s.heroId === h1Id)?.heroName || '???';
          const h2Name = snapshots.find(s => s.heroId === h2Id)?.heroName || '???';
          events.push({
            eventType: 'director_event',
            priority: 6,
            narrative: `🗡️【弹幕天意】观众散布谣言！${h1Name}与${h2Name}的联盟在猜忌中瓦解！`,
            data: { audienceEffect: 'betrayal', h1Id, h2Id },
          } as any);
          // 注：实际联盟解除需在 engine 中操作 DB，这里标记 consumed 让 engine 处理
        }
        consumed.push('betrayal');
        break;
      }

      case 'double': {
        // 本轮声望热度 ×2（所有 alive 的声望和热度翻倍增量）
        for (const h of alive) {
          // 给每人 +10 rep 和 +10 hot 作为"翻倍"效果
          addDelta(updates, h.heroId, 'reputation', 10);
          addDelta(updates, h.heroId, 'hot', 10);
        }
        events.push({
          eventType: 'director_event',
          priority: 7,
          narrative: `✨【弹幕天意】天道加持！本轮风云激荡，全员声望 +10，热度 +10！`,
          data: { audienceEffect: 'double', count },
        } as any);
        consumed.push('double');
        break;
      }
    }
  }

  return { events, consumed };
}

// 内部辅助：与 engine.ts 中的 addDelta 相同逻辑
function addDelta(updates: Map<string, Record<string, any>>, heroId: string, field: string, delta: number) {
  const current = updates.get(heroId);
  if (current) {
    current[field] = (current[field] || 0) + delta;
  }
}
