import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { TITLES, ARTIFACTS, PREDICTION_REWARDS } from '@/lib/game/constants';
import { mapGameStateRow } from '@/lib/game/state-mapper';
import { computeBattleStats } from '@/lib/game/battle-stats';
import { evaluateAndAwardAchievements } from '@/lib/game/achievements';

export async function POST(request: NextRequest) {
  try {

    const { gameId } = await request.json();
    if (!gameId) return NextResponse.json({ error: 'Missing gameId' }, { status: 400 });

    // 验证 gameId 是当前活跃的游戏
    const { data: gsCheck } = await supabaseAdmin.from('game_state').select('game_id').eq('id', 'current').single();
    if (gsCheck?.game_id && gsCheck.game_id !== gameId) {
      return NextResponse.json({ error: 'Game mismatch' }, { status: 400 });
    }

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
      const nowIso = new Date().toISOString();
      await supabaseAdmin.from('game_state').update({
        status: 'ended',
        phase_started_at: nowIso,
        updated_at: nowIso,
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

    // 提前获取全量事件（后续 taunt 统计 / 武林周刊 / 精彩回顾 共用，省掉 2 次多余查询）
    const { data: allGameEvents } = await supabaseAdmin
      .from('game_events')
      .select('*')
      .eq('game_id', gameId)
      .order('round')
      .order('sequence');

    // 嘴强王者（taunt 最多的）——从 allGameEvents 内存过滤
    const taunts = (allGameEvents || []).filter((e: any) => e.taunt != null);
    if (taunts.length > 0) {
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

    // --- 额外称号：基于事件统计 ---
    const awarded = new Set(titleAwards.map(t => t.heroId));
    const pushTitle = (heroId: string, heroName: string, titleKey: keyof typeof TITLES) => {
      // 每人只获得一个主要称号（避免重复）
      if (awarded.has(heroId)) return;
      awarded.add(heroId);
      const t = TITLES[titleKey];
      titleAwards.push({ heroId, heroName, title: t.name, icon: t.icon, points: t.points });
    };

    // 杀神（击杀数最多）
    const killCount = new Map<string, number>();
    for (const e of (allGameEvents || [])) {
      if (e.event_type === 'eliminated' && e.data?.killerId) {
        killCount.set(e.data.killerId, (killCount.get(e.data.killerId) || 0) + 1);
      }
      // 也统计造成淘汰的战斗事件
      if ((e.event_type === 'fight' || e.event_type === 'gang_up') && e.data?.eliminated) {
        killCount.set(e.hero_id, (killCount.get(e.hero_id) || 0) + 1);
      }
    }
    const topKiller = [...killCount.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topKiller && topKiller[1] >= 2) {
      const gh = gameHeroes.find((g: any) => g.hero_id === topKiller[0]);
      if (gh) pushTitle(gh.hero_id, gh.hero?.hero_name, 'KILLER');
    }

    // 不倒翁（非淘汰英雄中 HP 最高）
    const bestTank = gameHeroes
      .filter((gh: any) => !gh.is_eliminated)
      .sort((a: any, b: any) => (b.hp || 0) - (a.hp || 0))[0];
    if (bestTank) {
      pushTitle(bestTank.hero_id, bestTank.hero?.hero_name, 'TANK');
    }

    // 纵横家（背叛次数最多）
    const betrayCount = new Map<string, number>();
    for (const e of (allGameEvents || [])) {
      if (e.event_type === 'betray' && e.hero_id) {
        betrayCount.set(e.hero_id, (betrayCount.get(e.hero_id) || 0) + 1);
      }
    }
    const topSchemer = [...betrayCount.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topSchemer && topSchemer[1] >= 2) {
      const gh = gameHeroes.find((g: any) => g.hero_id === topSchemer[0]);
      if (gh) pushTitle(gh.hero_id, gh.hero?.hero_name, 'SCHEMER');
    }

    // 天命之人（曾跌至最低 HP 但最终存活且排名前半）
    const minHpByHero = new Map<string, number>();
    for (const gh of gameHeroes) {
      minHpByHero.set(gh.hero_id, gh.hp || 0);
    }
    // 从事件中追踪 HP 变化趋势（使用 hpDelta 最大负值的英雄）
    const totalDamageTaken = new Map<string, number>();
    for (const e of (allGameEvents || [])) {
      if (e.hp_delta && e.hp_delta < 0 && e.target_hero_id) {
        totalDamageTaken.set(e.target_hero_id, (totalDamageTaken.get(e.target_hero_id) || 0) + Math.abs(e.hp_delta));
      }
    }
    const midRank = Math.ceil(gameHeroes.length / 2);
    const clutchCandidates = gameHeroes
      .filter((gh: any) => !gh.is_eliminated && (repSorted.indexOf(gh) + 1) <= midRank)
      .sort((a: any, b: any) => (totalDamageTaken.get(b.hero_id) || 0) - (totalDamageTaken.get(a.hero_id) || 0));
    if (clutchCandidates.length > 0 && (totalDamageTaken.get(clutchCandidates[0].hero_id) || 0) > 50) {
      pushTitle(clutchCandidates[0].hero_id, clutchCandidates[0].hero?.hero_name, 'CLUTCH');
    }

    // 黑马（初始声望排名后半但最终排名前4）
    const initialRepOrder = [...gameHeroes].sort((a: any, b: any) => {
      const aBase = (a.hero?.strength || 0) + (a.hero?.inner_force || 0);
      const bBase = (b.hero?.strength || 0) + (b.hero?.inner_force || 0);
      return bBase - aBase;
    });
    const initialBottomHalf = new Set(initialRepOrder.slice(Math.ceil(initialRepOrder.length / 2)).map((g: any) => g.hero_id));
    const top4Ids = new Set(repSorted.slice(0, 4).map((g: any) => g.hero_id));
    for (const heroId of top4Ids) {
      if (initialBottomHalf.has(heroId)) {
        const gh = gameHeroes.find((g: any) => g.hero_id === heroId);
        if (gh) { pushTitle(gh.hero_id, gh.hero?.hero_name, 'DARK_HORSE'); break; }
      }
    }

    // 一代宗师（半决赛参与者，前4名中未获其他称号的）
    for (let i = 0; i < Math.min(4, repSorted.length); i++) {
      const gh = repSorted[i];
      pushTitle(gh.hero_id, gh.hero?.hero_name, 'TOP_4');
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

    // === 更新 heroes 赛季积分（批量化：1次SELECT + 并行UPDATE/UPSERT）===
    const top3Ids = new Set<string>();
    if (game.champion_hero_id) top3Ids.add(game.champion_hero_id);
    for (let i = 0; i < Math.min(3, repSorted.length); i++) {
      top3Ids.add(repSorted[i].hero_id);
    }

    const awardHeroIds = titleAwards.map(a => a.heroId);
    const [{ data: heroStats }, { data: existingLeaderboard }] = await Promise.all([
      supabaseAdmin.from('heroes').select('id, season_points, total_wins, total_games').in('id', awardHeroIds),
      supabaseAdmin.from('season_leaderboard').select('hero_id, champion_count').in('hero_id', awardHeroIds),
    ]);
    const heroStatsMap = new Map((heroStats || []).map(h => [h.id, h]));
    const leaderboardMap = new Map((existingLeaderboard || []).map(l => [l.hero_id, l]));

    await Promise.all(titleAwards.map(async (award) => {
      const hero = heroStatsMap.get(award.heroId);
      const isTop3 = top3Ids.has(award.heroId);
      const isChampion = award.title === TITLES.CHAMPION.name;
      const newPoints = (hero?.season_points || 0) + award.points;
      const newWins = (hero?.total_wins || 0) + (isTop3 ? 1 : 0);
      const newGames = (hero?.total_games || 0) + 1;

      await Promise.all([
        supabaseAdmin.from('heroes').update({
          season_points: newPoints,
          total_wins: newWins,
          total_games: newGames,
        }).eq('id', award.heroId),
        supabaseAdmin.from('season_leaderboard').upsert({
          hero_id: award.heroId,
          hero_name: award.heroName,
          faction: gameHeroes.find((g: any) => g.hero_id === award.heroId)?.hero?.faction || '少林',
          season_points: newPoints,
          champion_count: (leaderboardMap.get(award.heroId)?.champion_count || 0) + (isChampion ? 1 : 0),
          total_games: newGames,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'hero_id' }),
      ]);
    }));

    // === 押注结算（基于最终排名派奖）===
    // BET_RANK_PAYOUTS: { 1: 2x, 2: 1x, 3: 0.5x }
    const { data: allBets } = await supabaseAdmin
      .from('bets')
      .select('*')
      .eq('game_id', gameId)
      .eq('settled', false);

    // 构建英雄最终排名
    const heroFinalRank = new Map<string, number>();
    if (game.champion_hero_id) heroFinalRank.set(game.champion_hero_id, 1);
    let nextRank = 2;
    for (const gh of repSorted) {
      if (!heroFinalRank.has(gh.hero_id)) {
        heroFinalRank.set(gh.hero_id, nextRank++);
      }
    }

    const betTotal = (allBets || []).reduce((s: number, b: any) => s + (b.amount || 0), 0);

    // 计算每笔押注的赔付
    const betPayoutMap = new Map<string, number>(); // audience_id → total payout
    if (allBets && allBets.length > 0) {
      const { BET_RANK_PAYOUTS } = await import('@/lib/game/constants');
      for (const bet of allBets) {
        const rank = heroFinalRank.get(bet.hero_id) || 99;
        const multiplier = BET_RANK_PAYOUTS[rank] || 0;
        const payout = Math.floor((bet.amount || 0) * multiplier);
        await supabaseAdmin.from('bets').update({ settled: true, payout }).eq('id', bet.id);
        if (payout > 0) {
          betPayoutMap.set(bet.audience_id, (betPayoutMap.get(bet.audience_id) || 0) + payout);
        }
      }
      // 批量发放押注奖金
      if (betPayoutMap.size > 0) {
        const { data: betWinnerHeroes } = await supabaseAdmin
          .from('heroes').select('id, balance, is_npc').in('id', [...betPayoutMap.keys()]);
        await Promise.all((betWinnerHeroes || []).filter(h => !h.is_npc).map(h =>
          supabaseAdmin.from('heroes').update({
            balance: (h.balance ?? 10000) + (betPayoutMap.get(h.id) || 0),
          }).eq('id', h.id)
        ));
      }
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

    // 批量结算赢家神器 + 发放奖金
    const giftPayouts = winnerGifts.map(gift => {
      const artifactDef = artifactMap.get(gift.artifact_id);
      const multiplier = artifactDef?.multiplier ?? 2.0;
      return { ...gift, payout: Math.floor(gift.amount * multiplier) };
    });

    // 并行更新 artifact_gifts
    await Promise.all(giftPayouts.map(g =>
      supabaseAdmin.from('artifact_gifts').update({ settled: true, payout: g.payout }).eq('id', g.id)
    ));

    // 汇总每个赠送者的总奖金，批量查询 + 并行更新余额
    const gifterTotalPayout = new Map<string, number>();
    for (const g of giftPayouts) {
      if (g.payout > 0) gifterTotalPayout.set(g.audience_id, (gifterTotalPayout.get(g.audience_id) || 0) + g.payout);
    }
    if (gifterTotalPayout.size > 0) {
      const { data: gifters } = await supabaseAdmin
        .from('heroes').select('id, balance, is_npc').in('id', [...gifterTotalPayout.keys()]);
      await Promise.all((gifters || []).filter(g => !g.is_npc).map(gifter =>
        supabaseAdmin.from('heroes').update({
          balance: (gifter.balance ?? 10000) + (gifterTotalPayout.get(gifter.id) || 0),
        }).eq('id', gifter.id)
      ));
    }

    // 标记未中奖的神器赠送为已结算
    const loserGifts = (allGifts || []).filter((g: any) => g.hero_id !== championHeroId);
    if (loserGifts.length > 0) {
      const loserIds = loserGifts.map((g: any) => g.id);
      await supabaseAdmin.from('artifact_gifts').update({ settled: true, payout: 0 }).in('id', loserIds);
    }

    // === 观众预测结算 ===
    const { data: predictionState } = await supabaseAdmin
      .from('game_state')
      .select('predictions')
      .eq('id', 'current')
      .single();

    const predictions = predictionState?.predictions;
    const predictionResults: { correctElimination: number; correctChampion: string[] } = {
      correctElimination: 0,
      correctChampion: [],
    };

    if (predictions && championHeroId) {
      // Champion prediction settlement
      if (predictions.champion) {
        for (const [audienceId, predictedHeroId] of Object.entries(predictions.champion)) {
          if (predictedHeroId === championHeroId) {
            predictionResults.correctChampion.push(audienceId);
            // Award silver to logged-in heroes (same pattern as bet settlement)
            const { data: predHero } = await supabaseAdmin
              .from('heroes')
              .select('id, balance, is_npc')
              .eq('id', audienceId)
              .single();
            if (predHero && !predHero.is_npc) {
              await supabaseAdmin.from('heroes').update({
                balance: (predHero.balance ?? 10000) + PREDICTION_REWARDS.CHAMPION_LATE,
              }).eq('id', predHero.id);
            }
          }
        }
      }
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

    // === 计算武林周刊统计（使用上方已查询的 allGameEvents）===
    const battleStats = computeBattleStats(allGameEvents || [], heroNameMap);

    // === 成就评估 ===
    let newAchievements: any[] = [];
    try {
      newAchievements = await evaluateAndAwardAchievements(
        gameId, gameHeroes, allGameEvents || [], titleAwards, battleStats
      );
    } catch (err) {
      console.error('Achievement evaluation error:', err);
    }

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

    // 上局精彩大事记——从 allGameEvents 内存过滤+排序（省掉一次 DB 查询）
    const storyTypes = new Set(['director_event', 'scramble', 'speech', 'betray', 'ally_formed', 'comeback', 'hot_news', 'eliminated', 'champion']);
    const storyEvents = (allGameEvents || [])
      .filter((e: any) => storyTypes.has(e.event_type))
      .sort((a: any, b: any) => a.round !== b.round ? a.round - b.round : (b.priority || 0) - (a.priority || 0));

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
      // 批量查询所有赠送者名称
      const gifterIds = [...new Set(settledWinnerGifts.map((g: any) => g.audience_id))];
      const { data: gifterHeroes } = await supabaseAdmin
        .from('heroes').select('id, hero_name').in('id', gifterIds);
      const gifterNameMap = new Map((gifterHeroes || []).map(h => [h.id, h.hero_name]));

      for (const gift of settledWinnerGifts) {
        const betHeroName = heroNameMap.get(gift.hero_id) || '未知';
        const artDef = artifactMap.get(gift.artifact_id);
        betWinners.push({
          displayName: gifterNameMap.get(gift.audience_id) || gift.audience_id.slice(0, 8),
          betHeroName,
          amount: gift.amount,
          payout: gift.payout,
          rank: 1,
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
      new_achievements: newAchievements,
      prediction_results: predictionResults,
      phase_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Reset influence_used for all participants
    const endGameHeroIds = gameHeroes.map((gh: any) => gh.hero_id);
    await supabaseAdmin.from('heroes').update({ influence_used: false }).in('id', endGameHeroIds);

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
