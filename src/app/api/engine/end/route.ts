import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { TITLES, BET_RANK_PAYOUTS } from '@/lib/game/constants';
import { mapGameStateRow } from '@/lib/game/state-mapper';

export async function POST(request: NextRequest) {
  try {
    const { gameId } = await request.json();
    if (!gameId) return NextResponse.json({ error: 'Missing gameId' }, { status: 400 });

    // 幂等锁
    const { data: game, error } = await supabaseAdmin
      .from('games')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', gameId)
      .in('status', ['ending', 'processing_finals'])
      .select()
      .single();

    if (error || !game) {
      return NextResponse.json({ status: 'already_ended' });
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

    // === P2: 押注结算（排名倍率制）===
    // 声望前3名获得对应排名的倍率奖励
    const top3HeroIds = new Map<string, number>(); // heroId → rank (1/2/3)
    for (let i = 0; i < Math.min(3, repSorted.length); i++) {
      top3HeroIds.set(repSorted[i].hero_id, i + 1);
    }

    const { data: allBets } = await supabaseAdmin
      .from('bets')
      .select('*')
      .eq('game_id', gameId)
      .eq('settled', false);

    if (allBets && allBets.length > 0) {
      for (const bet of allBets) {
        const rank = top3HeroIds.get(bet.hero_id);
        const multiplier = rank ? (BET_RANK_PAYOUTS[rank] ?? 0) : 0;
        const payout = multiplier > 0 ? Math.floor(bet.amount * multiplier) : 0;
        await supabaseAdmin.from('bets').update({
          settled: true,
          payout,
        }).eq('id', bet.id);

        // 登录用户赢注：将 payout 加回余额（NPC 不得钱）
        if (payout > 0) {
          const { data: betHero } = await supabaseAdmin
            .from('heroes')
            .select('id, balance, is_npc')
            .eq('id', bet.audience_id)
            .single();
          if (betHero && !betHero.is_npc) {
            await supabaseAdmin.from('heroes').update({
              balance: (betHero.balance ?? 10000) + payout,
            }).eq('id', betHero.id);
          }
        }
      }
    }

    // 写入称号事件
    const titleEvents = titleAwards.map((award, i) => ({
      game_id: gameId,
      round: 8,
      sequence: i,
      event_type: 'title_award',
      priority: 5,
      hero_id: award.heroId,
      narrative: `${award.icon} ${award.heroName} 获封「${award.title}」！+${award.points}积分`,
      data: { title: award.title, points: award.points },
    }));

    if (titleEvents.length > 0) {
      await supabaseAdmin.from('game_events').insert(titleEvents);
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

    const heroNameMap = new Map(gameHeroes.map((gh: any) => [gh.hero_id, gh.hero?.hero_name || '无名']));

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

    // === 收集押注赢家（用于结局展示）===
    const betWinners: { displayName: string; betHeroName: string; amount: number; payout: number; rank: number }[] = [];
    if (allBets && allBets.length > 0) {
      for (const bet of allBets) {
        const rank = top3HeroIds.get(bet.hero_id);
        if (!rank || bet.payout <= 0) continue;
        // 尝试查找英雄名（登录用户 audience_id = hero_id）
        const { data: bettor } = await supabaseAdmin
          .from('heroes')
          .select('hero_name, is_npc')
          .eq('id', bet.audience_id)
          .single();
        const betHeroName = heroNameMap.get(bet.hero_id) || '未知';
        betWinners.push({
          displayName: bettor ? bettor.hero_name : bet.audience_id.slice(0, 8),
          betHeroName,
          amount: bet.amount,
          payout: bet.payout,
          rank,
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
      season_leaderboard: leaderboard || [],
      last_game_top8: lastGameTop8,
      last_game_highlights: lastGameHighlights,
      bet_winners: betWinners,
      balance_ranking: balanceRanking,
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
