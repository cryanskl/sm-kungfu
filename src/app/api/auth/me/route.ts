import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getHeroIdFromCookies } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const { userId, heroId } = getHeroIdFromCookies(request.cookies);

  if (!userId || !heroId) {
    return NextResponse.json({ user: null, hero: null });
  }

  const { data: hero } = await supabaseAdmin
    .from('heroes')
    .select('*')
    .eq('id', heroId)
    .single();

  return NextResponse.json({
    user: { userId },
    hero: hero ? {
      id: hero.id,
      heroName: hero.hero_name,
      faction: hero.faction,
      personalityType: hero.personality_type,
      catchphrase: hero.catchphrase,
      avatarUrl: hero.avatar_url,
      strength: hero.strength,
      innerForce: hero.inner_force,
      agility: hero.agility,
      wisdom: hero.wisdom,
      constitution: hero.constitution,
      charisma: hero.charisma,
      seasonPoints: hero.season_points,
      totalWins: hero.total_wins,
      totalGames: hero.total_games,
      balance: hero.balance ?? 10000,
    } : null,
  });
}
