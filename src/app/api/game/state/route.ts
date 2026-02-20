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

  // ETag: 基于 updated_at 时间戳，避免无变化时传输全量数据
  const updatedAt = data.updated_at || '';
  const etag = `"${updatedAt}"`;
  const ifNoneMatch = request.headers.get('if-none-match');

  // 非 choosing 阶段可直接用 ETag 判断（choosing 阶段有玩家特定数据，不能 304）
  const isChoosing = data.status?.startsWith('choosing_');
  if (ifNoneMatch === etag && !isChoosing) {
    return new NextResponse(null, {
      status: 304,
      headers: { 'ETag': etag, 'Cache-Control': 'no-cache' },
    });
  }

  const gameState = mapGameStateRow(data);
  const withDynamic = computeDynamicFields(gameState, data);

  // Inject player-specific pending choices during choosing phase
  if (isChoosing) {
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

  // 移除仅供引擎内部使用的字段，减少轮询响应体积
  const { pendingInfluences, awardedAchievements, ...clientState } = withDynamic;

  return NextResponse.json(clientState, {
    headers: {
      'Cache-Control': 'no-cache',
      'ETag': etag,
    },
  });
}
