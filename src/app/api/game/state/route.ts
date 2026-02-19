import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { mapGameStateRow, computeDynamicFields } from '@/lib/game/state-mapper';

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
      newAchievements: [],
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
  const withDynamic = computeDynamicFields(gameState, data);

  return NextResponse.json(withDynamic, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
