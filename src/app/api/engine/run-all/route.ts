import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { processRoundCore, getHeroSnapshots } from '@/lib/game/engine';
import { processSemifinalsCore } from '@/lib/game/finals-engine';
import { DIRECTOR_EVENTS } from '@/lib/game/prompts';

export const maxDuration = 300; // 5 分钟超时

/**
 * 批处理：顺序跑 R1-R5 + 半决赛，每回合保存快照到 game_state 表。
 * 由 start API fire-and-forget 触发。
 *
 * display_started_at 已由 start API 设置，时间线从 intro 就开始走。
 * 本端点只负责：算 → 存快照 → 更新 processedThrough。
 * 前端通过 computeDisplayRound(elapsed) 与 min(processedThrough, computed) 自然同步。
 */
export async function POST(request: NextRequest) {
  try {
    const { gameId } = await request.json();
    if (!gameId) return NextResponse.json({ error: 'Missing gameId' }, { status: 400 });

    const t0 = Date.now();
    console.log(`[RunAll] ▶ start batch processing game=${gameId.slice(0,8)}`);

    // 幂等锁：intro -> batch_processing
    const { data: game, error } = await supabaseAdmin
      .from('games')
      .update({ status: 'batch_processing' })
      .eq('id', gameId)
      .eq('status', 'intro')
      .select()
      .single();

    if (error || !game) {
      // 检查是否已经在 batch_processing 或更后面的状态
      const { data: currentGame } = await supabaseAdmin
        .from('games').select('status').eq('id', gameId).single();
      console.log(`[RunAll] ■ lock failed, current status=${currentGame?.status}`);
      return NextResponse.json({ status: currentGame?.status || 'unknown' });
    }

    // === 顺序处理 R1-R5 ===
    for (let round = 1; round <= 5; round++) {
      console.log(`[RunAll] ▶ processing round ${round}...`);
      const result = await processRoundCore(gameId, round);

      // 保存该回合快照到独立行
      await saveRoundSnapshot(gameId, round, result);

      // 更新 batch_progress（前端轮询时读取 processedThrough）
      await supabaseAdmin.from('game_state').update({
        batch_progress: {
          processedThrough: round,
          totalRounds: 6,
          startedAt: new Date(t0).toISOString(),
          lastUpdatedAt: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      }).eq('id', 'current');

      console.log(`[RunAll] ✓ round ${round} done (${Date.now()-t0}ms total)`);
    }

    // === 处理半决赛 ===
    console.log(`[RunAll] ▶ processing semifinals...`);
    const { result: semiResult, winners, artifactPool } = await processSemifinalsCore(gameId);

    // 保存半决赛快照
    await saveRoundSnapshot(gameId, 6, semiResult);

    // 更新 batch_progress
    await supabaseAdmin.from('game_state').update({
      batch_progress: {
        processedThrough: 6,
        totalRounds: 6,
        startedAt: new Date(t0).toISOString(),
        lastUpdatedAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    }).eq('id', 'current');

    console.log(`[RunAll] ✓ semifinals done (${Date.now()-t0}ms total)`);

    // === 更新结束状态（不设 display_started_at，start 已设）===
    const now = new Date().toISOString();

    if (winners.length >= 2 && artifactPool) {
      // 有两个胜者 → 暂停在 artifact_selection（前端通过 displayRound>=6 + games.status 检测）
      await supabaseAdmin.from('games').update({
        status: 'artifact_selection',
      }).eq('id', gameId);

      await supabaseAdmin.from('game_state').update({
        artifact_pool: artifactPool,
        updated_at: now,
      }).eq('id', 'current');
    } else {
      // 不足两人决赛，直接进 ending
      await supabaseAdmin.from('games').update({
        status: 'ending',
        champion_hero_id: winners[0]?.hero_id || null,
      }).eq('id', gameId);
    }

    console.log(`[RunAll] ✓ batch complete in ${Date.now()-t0}ms`);
    return NextResponse.json({ status: 'complete', processedThrough: 6 });
  } catch (err: any) {
    console.error('[RunAll] error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * 保存回合快照到 game_state 表的独立行（id='round_1', 'round_2', ...）。
 * 包含该回合结束后的英雄状态和事件列表。
 */
async function saveRoundSnapshot(
  gameId: string,
  roundNumber: number,
  result: { events: any[]; heroSnapshots: any[] },
) {
  const snapshots = result.heroSnapshots;

  const repRanking = [...snapshots]
    .filter((h: any) => !h.isEliminated)
    .sort((a: any, b: any) => b.reputation - a.reputation)
    .map((h: any, i: number) => ({
      heroId: h.heroId, heroName: h.heroName, faction: h.faction,
      value: h.reputation, rank: i + 1,
    }));

  const hotRanking = [...snapshots]
    .filter((h: any) => !h.isEliminated)
    .sort((a: any, b: any) => b.hot - a.hot)
    .map((h: any, i: number) => ({
      heroId: h.heroId, heroName: h.heroName, faction: h.faction,
      value: h.hot, rank: i + 1,
    }));

  const nextPreview = roundNumber < 5
    ? `下一回合：${DIRECTOR_EVENTS[roundNumber + 1]?.title || ''}`
    : roundNumber === 5 ? '盟主争夺战' : '巅峰对决';

  await supabaseAdmin.from('game_state').upsert({
    id: `round_${roundNumber}`,
    game_id: gameId,
    status: roundNumber <= 5 ? `round_${roundNumber}` : 'semifinals',
    current_round: roundNumber,
    phase: 'resolution',
    heroes: snapshots,
    recent_events: result.events,
    reputation_ranking: repRanking,
    hot_ranking: hotRanking,
    next_round_preview: nextPreview,
    updated_at: new Date().toISOString(),
  });
}
