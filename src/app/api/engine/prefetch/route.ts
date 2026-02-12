import { NextRequest, NextResponse } from 'next/server';
import { prefetchDecisions } from '@/lib/game/engine';
import { requireSession } from '@/lib/auth';

export const maxDuration = 30;

// 预取节流：同一 game+round 不重复触发
const recentPrefetch = new Map<string, number>();

export async function POST(request: NextRequest) {
  try {
    const authError = await requireSession();
    if (authError) return authError;
    const { gameId, roundNumber } = await request.json();

    if (!gameId || !roundNumber || roundNumber < 1 || roundNumber > 5) {
      return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
    }

    // 节流：同一 round 30 秒内不重复预取
    const key = `${gameId}_${roundNumber}`;
    const last = recentPrefetch.get(key);
    if (last && Date.now() - last < 30000) {
      return NextResponse.json({ ok: true, cached: true });
    }
    recentPrefetch.set(key, Date.now());
    // 清理旧条目
    if (recentPrefetch.size > 50) {
      const cutoff = Date.now() - 60000;
      for (const [k, v] of recentPrefetch) { if (v < cutoff) recentPrefetch.delete(k); }
    }

    const success = await prefetchDecisions(gameId, roundNumber);
    return NextResponse.json({ ok: success });
  } catch (err: any) {
    console.error('Prefetch error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
