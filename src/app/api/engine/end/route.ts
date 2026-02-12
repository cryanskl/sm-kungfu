import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { TITLES, ARTIFACTS } from '@/lib/game/constants';
import { mapGameStateRow } from '@/lib/game/state-mapper';
import { computeBattleStats } from '@/lib/game/battle-stats';
import { requireSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const authError = await requireSession();
    if (authError) return authError;

    const { gameId } = await request.json();
    if (!gameId) return NextResponse.json({ error: 'Missing gameId' }, { status: 400 });

    // 幂等锁
    const { data: game, error } = await supabaseAdmin
      .from('games')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', gameId)
      .in('status', ['ending', 'processing_finals', 'processing_final'])
      .select()
      .single();

    if (error || !game) {
      // 游戏已结束但 game_state 可能还卡在 ending（比如服务器重启后）
      // 修复 game_state 使前端能正常跳到 ended
      await supabaseAdmin.from('game_state').update({
        status: 'ended',
        updated_at: new Date().toISOString(),
      }).eq('id', 'current').eq('status', 'ending');

      const { data: freshState } = await supabaseAdmin
        .from('game_state').select('*').eq('id', 'current').single();

      return NextResponse.json({
        status: 'already_ended',
        gameState: freshState ? mapGameStateRow(freshState) : undefined,
      });
    }

    // 获取所有英雄
    const { data: gameHeroes } = await supabaseAdmin
      .from('game_heroes')
      .select('*, hero:heroes(*)')
      .eq('game_id', gameId)
      .order('seat_number');

    if (!gameHeroes) return NextResponse.json({ status: 'ended' });

    const repSorted = [...gameHeroes].sort((a: any, b: any) => (b.reputation || 0) - (a.reputation || 0));
    const hotSorted = [...gameHeroes].sort((a: any, b: any) => (b.hot || 0) - (a.hot || 0));

    // === 颁发称号 + 积分 ===
    const titleAwards: { heroId: string; heroName: string; title: string; icon: string; points: number }[] = [];

    // 盟主
    if (game.champion_hero_id) {
      const champion = gameHeroes.find((gh: any) => gh.hero_id === game.champion_hero_id);
      if (champion) {
        titleAwards.push({
          heroId: champion.hero_id,
          heroName: champion.hero?.hero_name,
          title: TITLES.CHAMPION.name,
          icon: TITLES.CHAMPION.icon,
          points: TITLES.CHAMPION.points,
        });
        await supabaseAdmin.from('game_heroes').update({
          final_rank: 1,
          title: TITLES.CHAMPION.name,
        }).eq('id', champion.id);
      }
    }

    // 声望第1（如果不是盟主）
    if (repSorted[0] && repSorted[0].hero_id !== game.champion_hero_id) {
      titleAwards.push({
        heroId: repSorted[0].hero_id,
        heroName: repSorted[0].hero?.hero_name,
        title: TITLES.RUNNER_UP.name,
        icon: TITLES.RUNNER_UP.icon,
        points: TITLES.RUNNER_UP.points,
      });
    }

    // 热搜王
    if (hotSorted[0]) {
      titleAwards.push({
        heroId: hotSorted[0].hero_id,
        heroName: hotSorted[0].hero?.hero_name,
        title: TITLES.HOT_TOPIC.name,
        icon: TITLES.HOT_TOPIC.icon,
        points: TITLES.HOT_TOPIC.points,
      });
    }

    // 嘴强王者（taunt 最多的）
    const { data: taunts } = await supabaseAdmin
      .from('game_events')
      .select('hero_id, taunt')
      .eq('game_id', gameId)
      .not('taunt', 'is', null);

    if (taunts && taunts.length > 0) {
      const tauntCount = new Map<string, number>();
      for (const t of taunts) {
        if (t.hero_id) {
          tauntCount.set(t.hero_id, (tauntCount.get(t.hero_id) || 0) + 1);
        }
      }
      const topTalker = Array.from(tauntCount.entries()).sort((a, b) => b[1] - a[1])[0];
      if (topTalker) {
        const gh = gameHeroes.find((g: any) => g.hero_id === topTalker[0]);
        if (gh) {
          titleAwards.push({
            heroId: gh.hero_id,
            heroName: gh.hero?.hero_name,
            title: TITLES.TRASH_TALKER.name,
            icon: TITLES.TRASH_TALKER.icon,
            points: TITLES.TRASH_TALKER.points,
          });
        }
      }
    }

    // 给所有参赛者基础积分
    for (const gh of gameHeroes) {
      const existing = titleAwards.find(t => t.heroId === gh.hero_id);
      if (!existing) {
        titleAwards.push({
          heroId: gh.hero_id,
          heroName: gh.hero?.hero_name,
          title: TITLES.PARTICIPANT.name,
          icon: TITLES.PARTICIPANT.icon,
          points: TITLES.PARTICIPANT.points,
        });
      }
    }

    // === 更新 heroes 赛季积分 ===
    for (const award of titleAwards) {
      // 前三名都算胜场（盟主 + 声望前2/3）
      const top3Ids = new Set<string>();
      if (game.champion_hero_id) top3Ids.add(game.champion_hero_id);
      for (let i = 0; i < Math.min(3, repSorted.length); i++) {
        top3Ids.add(repSorted[i].hero_id);
      }
      const isTop3 = top3Ids.has(award.heroId);
      const isChampion = award.title === TITLES.CHAMPION.name;

      const { data: hero } = await supabaseAdmin
        .from('heroes')
        .select('season_points, total_wins, total_games')
        .eq('id', award.heroId)
        .single();

      if (hero) {
        await supabaseAdmin.from('heroes').update({
          season_points: (hero.season_points || 0) + award.points,
          total_wins: (hero.total_wins || 0) + (isTop3 ? 1 : 0),
          total_games: (hero.total_games || 0) + 1,
        }).eq('id', award.heroId);
      }

      // 更新排行榜
      await supabaseAdmin.from('season_leaderboard').upsert({
        hero_id: award.heroId,
        hero_name: award.heroName,
        faction: gameHeroes.find((g: any) => g.hero_id === award.heroId)?.hero?.faction || '少林',
        season_points: (hero?.season_points || 0) + award.points,
        champion_count: (hero?.total_wins || 0) + (isChampion ? 1 : 0),
        total_games: (hero?.total_games || 0) + 1,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'hero_id' });
    }

    // === 统一奖池制结算 ===
    // 奖池 = intro下注总额 + 神器购买总额
    // 只有给冠军买了神器的观众按比例分红

    // 1. 将所有 bets 标记为已结算（钱已入奖池，不再单独派奖）
    const { data: allBets } = await supabaseAdmin
      .from('bets')
      .select('*')
      .eq('game_id', gameId)
      .eq('settled', false);

    const betTotal = (allBets || []).reduce((s: number, b: any) => s + (b.amount || 0), 0);

    if (allBets && allBets.length > 0) {
      await supabaseAdmin.from('bets').update({ settled: true, payout: 0 }).eq('game_id', gameId).eq('settled', false);
    }

    // 2. 查询所有神器赠送
    const { data: allGifts } = await supabaseAdmin
      .from('artifact_gifts')
      .select('*')
      .eq('game_id', gameId)
      .eq('settled', false);

    const giftTotal = (allGifts || []).reduce((s: number, g: any) => s + (g.amount || 0), 0);
    const totalPrizePool = betTotal + giftTotal;

    // 3. 只有给冠军买了神器的观众分红
    const championHeroId = game.champion_hero_id;
    const winnerGifts = (allGifts || []).filter((g: any) => g.hero_id === championHeroId);
    const winnerTotal = winnerGifts.reduce((s: number, g: any) => s + (g.amount || 0), 0);

    // 构建 artifact_id → multiplier 映射
    const artifactMap = new Map(ARTIFACTS.map(a => [a.id, a]));

    for (const gift of winnerGifts) {
      const artifactDef = artifactMap.get(gift.artifact_id);
      const multiplier = artifactDef?.multiplier ?? 2.0;
      const payout = Math.floor(gift.amount * multiplier);
      await supabaseAdmin.from('artifact_gifts').update({
        settled: true,
        payout,
      }).eq('id', gift.id);

      // 发放奖金给登录用户
      if (payout > 0) {
        const { data: giftHero } = await supabaseAdmin
          .from('heroes')
          .select('id, balance, is_npc')
          .eq('id', gift.audience_id)
          .single();
        if (giftHero && !giftHero.is_npc) {
          await supabaseAdmin.from('heroes').update({
            balance: (giftHero.balance ?? 10000) + payout,
          }).eq('id', giftHero.id);
        }
      }
    }

    // 标记未中奖的神器赠送为已结算
    const loserGifts = (allGifts || []).filter((g: any) => g.hero_id !== championHeroId);
    if (loserGifts.length > 0) {
      const loserIds = loserGifts.map((g: any) => g.id);
      await supabaseAdmin.from('artifact_gifts').update({ settled: true, payout: 0 }).in('id', loserIds);
    }

    // 写入称号事件 — 武侠风叙事
    const titleNarrativeTemplates: Record<string, string[]> = {
      '武林盟主': [
        '{name} 一战定乾坤，傲立群雄之巅，受封「武林盟主」！自此号令天下，莫敢不从！',
        '天下英雄尽折腰！{name} 登临绝顶，加冕「武林盟主」！一代传奇，由此而始！',
        '{name} 横扫千军如卷席，当之无愧的「武林盟主」！江湖百年，难出其右！',
      ],
      '绝世高手': [
        '{name} 武功卓绝，虽差一步登顶，亦为当世罕见的「绝世高手」！江湖中人无不敬仰。',
        '虽未折桂，{name} 一身武艺已足以傲视群雄，获封「绝世高手」！来日再战，鹿死谁手犹未可知。',
        '{name} 实力深不可测，获封「绝世高手」！他日重来，必有一番风云！',
      ],
      '热搜体质': [
        '{name} 一举一动皆为焦点，获封「热搜体质」！江湖茶馆无人不谈其名，街头巷尾皆是传说。',
        '行走的话题中心！{name} 获封「热搜体质」！只要有ta在，江湖就不缺故事。',
      ],
      '嘴强王者': [
        '{name} 口若悬河、舌灿莲花，获封「嘴强王者」！三寸不烂之舌，胜过百万雄兵。',
        '不战而屈人之兵！{name} 凭一张利嘴获封「嘴强王者」！武功第几不好说，嘴上绝对天下第一。',
      ],
      '江湖豪杰': [
        '{name} 虽未折桂，但江湖路远，今日留名「江湖豪杰」，他日必有再会之期。',
        '{name} 行走江湖不留遗憾，获封「江湖豪杰」！好汉不提当年勇，来日方长。',
      ],
    };

    const getTitleNarrative = (heroName: string, title: string, icon: string, points: number): string => {
      const templates = titleNarrativeTemplates[title];
      if (templates) {
        const tpl = templates[Math.floor(Math.random() * templates.length)];
        return `${icon} ${tpl.replace(/\{name\}/g, heroName)}（+${points}积分）`;
      }
      return `${icon} ${heroName} 获封「${title}」！+${points}积分`;
    };

    const titleEvents = titleAwards.map((award, i) => ({
      game_id: gameId,
      round: 8,
      sequence: i,
      event_type: 'title_award',
      priority: 5,
      hero_id: award.heroId,
      narrative: getTitleNarrative(award.heroName, award.title, award.icon, award.points),
      data: { title: award.title, points: award.points },
    }));

    if (titleEvents.length > 0) {
      await supabaseAdmin.from('game_events').insert(titleEvents);
    }

    // === heroNameMap (used by multiple sections below) ===
    const heroNameMap = new Map(gameHeroes.map((gh: any) => [gh.hero_id, gh.hero?.hero_name || '无名']));

    // === 计算武林周刊统计 ===
    const { data: allGameEvents } = await supabaseAdmin
      .from('game_events')
      .select('*')
      .eq('game_id', gameId)
      .order('round')
      .order('sequence');

    const battleStats = computeBattleStats(allGameEvents || [], heroNameMap);

    // Fill in bestSurvivor (highest HP among non-eliminated)
    const survivors = gameHeroes
      .filter((gh: any) => !gh.is_eliminated)
      .sort((a: any, b: any) => (b.hp || 0) - (a.hp || 0));
    if (survivors.length > 0) {
      battleStats.bestSurvivor = {
        heroName: heroNameMap.get(survivors[0].hero_id) || '无名',
        remainingHp: survivors[0].hp || 0,
      };
    }

    // Fill in mostPopular (highest hot)
    if (hotSorted.length > 0) {
      battleStats.mostPopular = {
        heroName: heroNameMap.get(hotSorted[0].hero_id) || '无名',
        hotValue: hotSorted[0].hot || 0,
      };
    }

    // === 构建上局回顾数据 ===
    // 上局前8名（按声望排序）
    const lastGameTop8 = repSorted.slice(0, 8).map((gh: any, i: number) => ({
      heroId: gh.hero_id,
      heroName: gh.hero?.hero_name || '无名',
      faction: gh.hero?.faction || '少林',
      value: gh.reputation || 0,
      rank: i + 1,
    }));

    // 上局精彩大事记：优先剧情类事件，每回合挑1-2条，保证多样性
    // 剧情类（奇遇、背叛、结盟、夺宝、拜师、逆转等）
    const { data: storyEvents } = await supabaseAdmin
      .from('game_events')
      .select('round, event_type, narrative, priority, hero_id')
      .eq('game_id', gameId)
      .in('event_type', ['director_event', 'scramble', 'speech', 'betray', 'ally_formed', 'comeback', 'hot_news', 'eliminated', 'champion'])
      .order('round')
      .order('priority', { ascending: false });

    // 每回合最多取2条，总共不超过10条，确保覆盖多个回合
    const pickedByRound = new Map<number, number>();
    const picked: any[] = [];
    for (const e of (storyEvents || [])) {
      if (picked.length >= 10) break;
      // director_event 只取不超过1条（作为背景），其他类型优先
      if (e.event_type === 'director_event') {
        const count = pickedByRound.get(e.round) || 0;
        if (count >= 1) continue; // 已有该回合事件则跳过导演事件
      }
      const count = pickedByRound.get(e.round) || 0;
      if (count >= 2) continue;
      picked.push(e);
      pickedByRound.set(e.round, count + 1);
    }

    const lastGameHighlights = picked.map((e: any) => ({
      round: e.round,
      eventType: e.event_type,
      narrative: e.narrative,
      heroName: e.hero_id ? heroNameMap.get(e.hero_id) : undefined,
      priority: e.priority,
    }));

    // === 收集神器赢家（用于结局展示）===
    const betWinners: { displayName: string; betHeroName: string; amount: number; payout: number; rank: number; multiplier?: number }[] = [];
    // 重新查询已结算的获奖神器
    const { data: settledWinnerGifts } = await supabaseAdmin
      .from('artifact_gifts')
      .select('*')
      .eq('game_id', gameId)
      .eq('settled', true)
      .gt('payout', 0);

    if (settledWinnerGifts && settledWinnerGifts.length > 0) {
      for (const gift of settledWinnerGifts) {
        const { data: gifter } = await supabaseAdmin
          .from('heroes')
          .select('hero_name, is_npc')
          .eq('id', gift.audience_id)
          .single();
        const betHeroName = heroNameMap.get(gift.hero_id) || '未知';
        const artDef = artifactMap.get(gift.artifact_id);
        betWinners.push({
          displayName: gifter ? gifter.hero_name : gift.audience_id.slice(0, 8),
          betHeroName,
          amount: gift.amount,
          payout: gift.payout,
          rank: 1, // 冠军方
          multiplier: artDef?.multiplier,
        });
      }
    }
    betWinners.sort((a, b) => b.payout - a.payout);

    // === 富豪榜（非 NPC，按余额排序）===
    const { data: richHeroes } = await supabaseAdmin
      .from('heroes')
      .select('hero_name, faction, balance')
      .eq('is_npc', false)
      .order('balance', { ascending: false })
      .limit(10);

    const balanceRanking = (richHeroes || []).map((h: any, i: number) => ({
      heroName: h.hero_name,
      faction: h.faction || '少林',
      balance: h.balance ?? 10000,
      rank: i + 1,
    }));

    // === 更新 game_state ===
    const { data: leaderboard } = await supabaseAdmin
      .from('season_leaderboard')
      .select('*')
      .order('season_points', { ascending: false })
      .limit(20);

    const championGh = gameHeroes.find((g: any) => g.hero_id === game.champion_hero_id);

    await supabaseAdmin.from('game_state').upsert({
      id: 'current',
      game_id: gameId,
      status: 'ended',
      phase: 'ending',
      champion_name: championGh?.hero?.hero_name || '无人',
      recent_events: titleEvents,
      danmaku: [],
      season_leaderboard: leaderboard || [],
      last_game_top8: lastGameTop8,
      last_game_highlights: lastGameHighlights,
      bet_winners: betWinners,
      balance_ranking: balanceRanking,
      battle_stats: battleStats,
      updated_at: new Date().toISOString(),
    });

    // === 60 秒后创建下一局 ===
    // 由前端驱动：前端看到 ended 状态后等 60 秒调 /api/game/join 自动创建新局

    // Read fresh game_state for immediate client update
    const { data: freshState } = await supabaseAdmin
      .from('game_state').select('*').eq('id', 'current').single();

    return NextResponse.json({
      status: 'ended',
      champion: championGh?.hero?.hero_name || null,
      titleAwards,
      leaderboard: leaderboard || [],
      gameState: freshState ? mapGameStateRow(freshState) : undefined,
    });
  } catch (err: any) {
    console.error('End game error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
