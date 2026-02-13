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

  return NextResponse.json(gameState, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
