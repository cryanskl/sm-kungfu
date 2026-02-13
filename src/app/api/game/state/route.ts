import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { mapGameStateRow } from '@/lib/game/state-mapper';
import { COUNTDOWN_SECONDS } from '@/lib/game/constants';

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
      serverTime: new Date().toISOString(),
      phaseElapsedMs: null,
      updatedAt: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }

  const gameState = mapGameStateRow(data);
  const now = Date.now();

  // 服务器权威时间
  gameState.serverTime = new Date(now).toISOString();

  // 服务器权威阶段已过时间（多设备同步）
  if (data.phase_started_at) {
    gameState.phaseElapsedMs = now - new Date(data.phase_started_at).getTime();
  }

  // 服务器权威倒计时：从 countdown_started_at 动态计算剩余秒数
  if (data.status === 'countdown') {
    // 优先 countdown_started_at，回退到 phase_started_at / updated_at
    const startedAt = data.countdown_started_at || data.phase_started_at || data.updated_at;
    if (startedAt) {
      const elapsed = (now - new Date(startedAt).getTime()) / 1000;
      gameState.countdownSeconds = Math.max(0, Math.ceil(COUNTDOWN_SECONDS - elapsed));
    }
    // 确保每次轮询 updatedAt 都不同，让客户端同步 effect 能触发
    gameState.updatedAt = new Date(now).toISOString();
  }

  return NextResponse.json(gameState, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
