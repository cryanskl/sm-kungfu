import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { mapGameStateRow, computeDynamicFields } from '@/lib/game/state-mapper';
import { getHeroIdFromCookies } from '@/lib/auth';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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

  // Inject player-specific pending choices during choosing phase
  if (withDynamic.status?.startsWith('choosing_')) {
    const { heroId } = getHeroIdFromCookies(request.cookies);
    if (heroId && withDynamic.gameId) {
      const { data: gh } = await supabaseAdmin
        .from('game_heroes')
        .select('pending_choices')
        .eq('game_id', withDynamic.gameId)
        .eq('hero_id', heroId)
        .single();
      if (gh?.pending_choices) {
        withDynamic.pendingChoices = gh.pending_choices;
      }
    }
  }

  return NextResponse.json(withDynamic, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
