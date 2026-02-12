import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get('search')?.trim() || '';

  // Always fetch top 10 by season_points descending
  const { data: top10, error: topErr } = await supabaseAdmin
    .from('season_leaderboard')
    .select('hero_id, hero_name, faction, season_points, champion_count, total_games')
    .order('season_points', { ascending: false })
    .limit(10);

  if (topErr) {
    return NextResponse.json({ top10: [], searchResult: null }, { status: 500 });
  }

  // Attach rank (1-based) to top 10
  const ranked = (top10 || []).map((row, i) => ({
    heroId: row.hero_id,
    heroName: row.hero_name,
    faction: row.faction,
    seasonPoints: row.season_points,
    championCount: row.champion_count,
    totalGames: row.total_games,
    rank: i + 1,
  }));

  let searchResult = null;

  if (search) {
    // Check if the search target is already in top 10
    const inTop = ranked.find(r => r.heroName.includes(search));
    if (inTop) {
      searchResult = inTop;
    } else {
      // Query the matching hero and compute their rank via counting
      const { data: matched } = await supabaseAdmin
        .from('season_leaderboard')
        .select('hero_id, hero_name, faction, season_points, champion_count, total_games')
        .ilike('hero_name', `%${search}%`)
        .order('season_points', { ascending: false })
        .limit(1);

      if (matched && matched.length > 0) {
        const hero = matched[0];
        // Count how many heroes have higher points to determine rank
        const { count } = await supabaseAdmin
          .from('season_leaderboard')
          .select('*', { count: 'exact', head: true })
          .gt('season_points', hero.season_points);

        searchResult = {
          heroId: hero.hero_id,
          heroName: hero.hero_name,
          faction: hero.faction,
          seasonPoints: hero.season_points,
          championCount: hero.champion_count,
          totalGames: hero.total_games,
          rank: (count ?? 0) + 1,
        };
      }
    }
  }

  return NextResponse.json({ top10: ranked, searchResult }, {
    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
  });
}
