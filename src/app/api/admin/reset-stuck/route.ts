import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireSession } from '@/lib/auth';

/**
 * 重置卡死的游戏：将 preparing/starting/intro/batch_processing 状态的游戏重置为 ended。
 * 同时清理 game_state 缓存。
 */
export async function POST(request: NextRequest) {
  const authError = await requireSession();
  if (authError) return authError;

  // 找到所有卡死的游戏
  const stuckStatuses = ['preparing', 'starting', 'intro', 'batch_processing', 'processing_final'];
  const { data: stuckGames } = await supabaseAdmin
    .from('games')
    .select('id, status, created_at')
    .in('status', stuckStatuses)
    .order('created_at', { ascending: false });

  if (!stuckGames || stuckGames.length === 0) {
    return NextResponse.json({ message: 'No stuck games found', reset: 0 });
  }

  // 将卡死的游戏标记为 ended
  const ids = stuckGames.map(g => g.id);
  await supabaseAdmin
    .from('games')
    .update({ status: 'ended' })
    .in('id', ids);

  // 重置 game_state 缓存
  await supabaseAdmin.from('game_state').upsert({
    id: 'current',
    status: 'waiting',
    current_round: 0,
    phase: 'waiting',
    heroes: [],
    recent_events: [],
    reputation_ranking: [],
    hot_ranking: [],
    batch_progress: {},
    display_started_at: null,
    updated_at: new Date().toISOString(),
  });

  return NextResponse.json({
    message: `Reset ${stuckGames.length} stuck game(s)`,
    reset: stuckGames.length,
    games: stuckGames.map(g => ({ id: g.id, wasStatus: g.status })),
  });
}
