import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getHeroIdFromCookies } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const { heroId } = getHeroIdFromCookies(request.cookies);
  if (!heroId) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  }

  const { targetHeroId, effectType } = await request.json();
  if (!targetHeroId || !['buff', 'debuff'].includes(effectType)) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  }

  if (targetHeroId === heroId) {
    return NextResponse.json({ error: 'Cannot influence yourself' }, { status: 400 });
  }

  // Check if already used this game
  const { data: hero } = await supabaseAdmin
    .from('heroes')
    .select('influence_used')
    .eq('id', heroId)
    .single();

  if (hero?.influence_used) {
    return NextResponse.json({ error: 'Influence already used this game' }, { status: 409 });
  }

  // Mark as used
  await supabaseAdmin.from('heroes').update({ influence_used: true }).eq('id', heroId);

  // Queue the influence effect
  const { data: gs } = await supabaseAdmin
    .from('game_state')
    .select('pending_influences')
    .eq('id', 'current')
    .single();

  const influences = (gs?.pending_influences || []) as any[];
  influences.push({ sourceHeroId: heroId, targetHeroId, effectType });

  await supabaseAdmin.from('game_state').update({
    pending_influences: influences,
    updated_at: new Date().toISOString(),
  }).eq('id', 'current');

  return NextResponse.json({ success: true });
}
