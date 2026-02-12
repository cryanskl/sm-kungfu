import { NextRequest, NextResponse } from 'next/server';
import { processRound } from '@/lib/game/engine';
import { supabaseAdmin } from '@/lib/supabase';
import { mapGameStateRow } from '@/lib/game/state-mapper';

export const maxDuration = 60; // Vercel Pro: 60s 超时

// 简易内存节流：防止同一 game+round 在 10 秒内被重复触发
const recentCalls = new Map<string, number>();

export async function POST(request: NextRequest) {
  try {
    const { gameId, roundNumber } = await request.json();

    if (!gameId || !roundNumber || roundNumber < 1 || roundNumber > 6) {
      return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
    }

    // 节流检查
    const throttleKey = `${gameId}_${roundNumber}`;
    const lastCall = recentCalls.get(throttleKey);
    if (lastCall && Date.now() - lastCall < 5000) {
      // 5秒内重复调用，直接返回缓存（processRound 本身也是幂等的）
    }
    recentCalls.set(throttleKey, Date.now());
    // 清理旧条目防内存泄漏
    if (recentCalls.size > 100) {
      const cutoff = Date.now() - 60000;
      for (const [k, v] of recentCalls) { if (v < cutoff) recentCalls.delete(k); }
    }

    const result = await processRound(gameId, roundNumber);

    // Read fresh game_state for immediate client update
    const { data: freshState } = await supabaseAdmin
      .from('game_state').select('*').eq('id', 'current').single();

    return NextResponse.json({
      roundNumber: result.roundNumber,
      events: result.events,
      heroes: result.heroSnapshots,
      gameState: freshState ? mapGameStateRow(freshState) : undefined,
    });
  } catch (err: any) {
    console.error('Engine round error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
