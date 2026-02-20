import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getHeroIdFromCookies } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const { heroId } = getHeroIdFromCookies(request.cookies);
  if (!heroId) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  }

  const { targetHeroId, effectType } = await request.json();
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!targetHeroId || !UUID_RE.test(targetHeroId) || !['buff', 'debuff'].includes(effectType)) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  }

  if (targetHeroId === heroId) {
    return NextResponse.json({ error: 'Cannot influence yourself' }, { status: 400 });
  }

  // 检查游戏是否在活跃回合中
  const { data: gsPhase } = await supabaseAdmin.from('game_state').select('status').eq('id', 'current').single();
  const activeRoundStatuses = /^(choosing|resolving|round)_[1-5]$/;
  if (!gsPhase?.status || !activeRoundStatuses.test(gsPhase.status)) {
    return NextResponse.json({ error: 'Not in an active round' }, { status: 409 });
  }

  // 原子 conditional update：防止 TOCTOU 竞态导致双重触发
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('heroes')
    .update({ influence_used: true })
    .eq('id', heroId)
    .eq('influence_used', false)
    .select('id')
    .single();

  if (updateErr || !updated) {
    return NextResponse.json({ error: 'Influence already used this game' }, { status: 409 });
  }

  // Queue the influence effect（原子 append，带重试防并发覆盖）
  const newInfluence = { sourceHeroId: heroId, targetHeroId, effectType };
  let appended = false;

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: gs } = await supabaseAdmin
      .from('game_state')
      .select('pending_influences, updated_at')
      .eq('id', 'current')
      .single();

    const influences = [...((gs?.pending_influences || []) as any[]), newInfluence];
    const prevUpdatedAt = gs?.updated_at;

    // 乐观锁：只有 updated_at 未变时才写入，防止并发覆盖
    const now = new Date().toISOString();
    const { data: writeResult, error: writeErr } = await supabaseAdmin
      .from('game_state')
      .update({ pending_influences: influences, updated_at: now })
      .eq('id', 'current')
      .eq('updated_at', prevUpdatedAt || '')
      .select('id')
      .single();

    if (!writeErr && writeResult) {
      appended = true;
      break;
    }
    // updated_at 已变（被其他请求修改），重试
  }

  if (!appended) {
    // 3 次重试失败，回退 influence_used 允许玩家再试
    await supabaseAdmin.from('heroes').update({ influence_used: false }).eq('id', heroId);
    return NextResponse.json({ error: 'Server busy, please try again' }, { status: 503 });
  }

  return NextResponse.json({ success: true });
}
