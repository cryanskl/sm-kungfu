import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { processFinalCore } from '@/lib/game/finals-engine';
import { getHeroSnapshots } from '@/lib/game/engine';
import { mapGameStateRow } from '@/lib/game/state-mapper';
import { requireSession } from '@/lib/auth';

export const maxDuration = 60;

/**
 * 神兵助战结束后，处理决赛 + 进入 ending。
 * 替换原来的 /api/engine/final。
 */
export async function POST(request: NextRequest) {
  try {
    const authError = await requireSession();
    if (authError) return authError;

    const { gameId } = await request.json();
    if (!gameId) return NextResponse.json({ error: 'Missing gameId' }, { status: 400 });

    // 幂等锁：artifact_selection -> processing_final
    const { data: game, error } = await supabaseAdmin
      .from('games')
      .update({ status: 'processing_final' })
      .eq('id', gameId)
      .eq('status', 'artifact_selection')
      .select()
      .single();

    if (error || !game) {
      // 可能已经处理过了
      const { data: cached } = await supabaseAdmin
        .from('game_events')
        .select('*')
        .eq('game_id', gameId)
        .eq('round', 7)
        .order('sequence', { ascending: true });
      const finalEvents = (cached || []).filter((e: any) =>
        e.data?.phase === 'final' || e.data?.championHeroId
      );
      return NextResponse.json({ events: finalEvents });
    }

    // 运行决赛
    const { result, championId, runnerUpId } = await processFinalCore(gameId);

    // 保存决赛快照到 round_7
    const snapshots = result.heroSnapshots;
    await supabaseAdmin.from('game_state').upsert({
      id: 'round_7',
      game_id: gameId,
      status: 'ending',
      current_round: 7,
      phase: 'ending',
      heroes: snapshots,
      recent_events: result.events,
      updated_at: new Date().toISOString(),
    });

    // 更新 batch_progress
    await supabaseAdmin.from('game_state').update({
      batch_progress: {
        processedThrough: 7,
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    }).eq('id', 'current');

    // 设置游戏为 ending
    await supabaseAdmin.from('games').update({
      status: 'ending',
      champion_hero_id: championId,
    }).eq('id', gameId);

    // 更新 game_state 缓存到 ending
    const championGh = snapshots.find((h: any) => h.heroId === championId);
    await supabaseAdmin.from('game_state').update({
      status: 'ending',
      phase: 'ending',
      champion_name: championGh?.heroName || '无人',
      recent_events: result.events,
      artifact_pool: { ...(game as any).artifact_pool, isOpen: false },
      updated_at: new Date().toISOString(),
    }).eq('id', 'current');

    const { data: freshState } = await supabaseAdmin
      .from('game_state').select('*').eq('id', 'current').single();

    return NextResponse.json({
      events: result.events,
      gameState: freshState ? mapGameStateRow(freshState) : undefined,
    });
  } catch (err: any) {
    console.error('Run-final error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
