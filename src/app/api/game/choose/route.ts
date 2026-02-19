import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getHeroIdFromCookies } from '@/lib/auth';
import * as C from '@/lib/game/constants';

export async function POST(request: NextRequest) {
  const { heroId } = getHeroIdFromCookies(request.cookies);
  if (!heroId) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  }

  const { gameId, encounterIds } = await request.json();
  if (!gameId || !Array.isArray(encounterIds) || encounterIds.length !== C.CHOICES_PER_HERO) {
    return NextResponse.json({ error: `Must choose exactly ${C.CHOICES_PER_HERO} encounters` }, { status: 400 });
  }

  // Verify game is in choosing phase
  const { data: game } = await supabaseAdmin.from('games').select('status').eq('id', gameId).single();
  if (!game?.status?.startsWith('choosing_')) {
    return NextResponse.json({ error: 'Not in choosing phase' }, { status: 409 });
  }

  // Verify hero is alive and get pending choices
  const { data: gh } = await supabaseAdmin
    .from('game_heroes')
    .select('id, pending_choices, chosen_encounters')
    .eq('game_id', gameId)
    .eq('hero_id', heroId)
    .eq('is_eliminated', false)
    .single();

  if (!gh) {
    return NextResponse.json({ error: 'Hero not found or eliminated' }, { status: 404 });
  }

  if (gh.chosen_encounters && (gh.chosen_encounters as string[]).length >= C.CHOICES_PER_HERO) {
    return NextResponse.json({ error: 'Already submitted choices' }, { status: 409 });
  }

  // Validate encounterIds exist in pending_choices
  const pendingIds = (gh.pending_choices as any[]).map((c: any) => c.id);
  const allValid = encounterIds.every((id: string) => pendingIds.includes(id));
  if (!allValid) {
    return NextResponse.json({ error: 'Invalid encounter IDs' }, { status: 400 });
  }

  // Write chosen encounters
  await supabaseAdmin.from('game_heroes').update({
    chosen_encounters: encounterIds,
  }).eq('id', gh.id);

  // Update hero_choice_status in game_state
  const { data: gs } = await supabaseAdmin.from('game_state').select('hero_choice_status').eq('id', 'current').single();
  const status = (gs?.hero_choice_status || {}) as Record<string, string>;
  status[heroId] = 'chosen';
  await supabaseAdmin.from('game_state').update({
    hero_choice_status: status,
    updated_at: new Date().toISOString(),
  }).eq('id', 'current');

  const chosen = (gh.pending_choices as any[]).filter((c: any) => encounterIds.includes(c.id));
  return NextResponse.json({ success: true, chosen });
}
