import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { mapGameStateRow } from '@/lib/game/state-mapper';
import { COUNTDOWN_SECONDS, computeDisplayRound } from '@/lib/game/constants';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('game_state')
    .select('*')
    .eq('id', 'current')
    .single();

  if (error || !data) {
    return NextResponse.json({
      gameId: null,
      gameNumber: 0,
      status: 'waiting',
      currentRound: 0,
      phase: 'waiting',
      theme: null,
      heroes: [],
      recentEvents: [],
      reputationRanking: [],
      hotRanking: [],
      nextRoundPreview: null,
      countdownSeconds: null,
      championName: null,
      seasonLeaderboard: [],
      bettingPool: null,
      danmaku: [],
      lastGameTop8: [],
      lastGameHighlights: [],
      queueCount: 0,
      updatedAt: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }

  const gameState = mapGameStateRow(data);

  // 服务器权威倒计时：从 countdown_started_at 动态计算剩余秒数
  if (data.status === 'countdown' && data.countdown_started_at) {
    const elapsed = (Date.now() - new Date(data.countdown_started_at).getTime()) / 1000;
    gameState.countdownSeconds = Math.max(0, Math.ceil(COUNTDOWN_SECONDS - elapsed));
  }

  // === 时间线驱动：display_started_at 在 start 时设置，包含 intro → R1-R5 → 半决赛 ===
  const batchProgress = data.batch_progress;
  const displayStartedAt = data.display_started_at;

  // 传递 batchProgress 给前端（用于可能的进度显示）
  if (batchProgress?.processedThrough >= 0) {
    gameState.batchProgress = batchProgress;
  }

  if (displayStartedAt) {
    const elapsed = (Date.now() - new Date(displayStartedAt).getTime()) / 1000;
    const computed = computeDisplayRound(elapsed);

    // computed=0 表示仍在 intro 阶段，不需要覆盖任何东西
    if (computed > 0 && batchProgress?.processedThrough > 0) {
      const displayRound = Math.min(batchProgress.processedThrough, computed);

      if (displayRound > 0) {
        // 并行加载：回合快照 + 实际游戏状态（用于 artifact_selection 检测）
        const [snapshotResult, gameResult] = await Promise.all([
          supabaseAdmin
            .from('game_state')
            .select('*')
            .eq('id', `round_${displayRound}`)
            .single(),
          supabaseAdmin
            .from('games')
            .select('status')
            .eq('id', data.game_id)
            .single(),
        ]);

        const roundSnapshot = snapshotResult.data;
        const actualGame = gameResult.data;

        if (roundSnapshot) {
          // 用快照数据覆盖返回值
          gameState.heroes = roundSnapshot.heroes || gameState.heroes;
          gameState.recentEvents = roundSnapshot.recent_events || gameState.recentEvents;
          gameState.reputationRanking = roundSnapshot.reputation_ranking || gameState.reputationRanking;
          gameState.hotRanking = roundSnapshot.hot_ranking || gameState.hotRanking;
          gameState.nextRoundPreview = roundSnapshot.next_round_preview || gameState.nextRoundPreview;
          gameState.currentRound = displayRound;

          // 计算显示状态
          if (displayRound <= 5) {
            gameState.status = `round_${displayRound}` as any;
          } else if (displayRound === 6) {
            gameState.status = 'semifinals';
          } else if (displayRound === 7) {
            gameState.status = 'ending';
          }
        }

        gameState.displayRound = displayRound;
        gameState.displayStartedAt = displayStartedAt;

        // 当半决赛显示完毕且游戏已进入 artifact_selection，通知前端
        if (displayRound >= 6 && actualGame?.status === 'artifact_selection') {
          gameState.status = 'artifact_selection';
          gameState.artifactPool = data.artifact_pool || gameState.artifactPool;
        }
      }
    }
  }

  return NextResponse.json(gameState, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
