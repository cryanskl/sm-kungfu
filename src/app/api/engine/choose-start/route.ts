import { NextRequest, NextResponse } from 'next/server';
import { startChoosing } from '@/lib/game/engine';
import { supabaseAdmin } from '@/lib/supabase';
import { requireEngineSecret } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const authErr = requireEngineSecret(request);
    if (authErr) return authErr;
    const { gameId, roundNumber } = await request.json();
    if (!gameId || !roundNumber) {
      return NextResponse.json({ error: 'Missing gameId or roundNumber' }, { status: 400 });
    }

    // 验证 gameId 是当前活跃的游戏
    const { data: gsCheck } = await supabaseAdmin.from('game_state').select('game_id').eq('id', 'current').single();
    if (gsCheck?.game_id && gsCheck.game_id !== gameId) {
      return NextResponse.json({ error: 'Game mismatch' }, { status: 400 });
    }

    const result = await startChoosing(gameId, roundNumber);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    // 返回最新 gameState，消除客户端 3 秒轮询等待
    const { data: gs } = await supabaseAdmin
      .from('game_state')
      .select('*')
      .eq('id', 'current')
      .single();

    return NextResponse.json({ success: true, gameState: gs });
  } catch (err: any) {
    console.error('[choose-start] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
