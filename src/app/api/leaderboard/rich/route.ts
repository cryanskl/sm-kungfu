import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get('search')?.trim() || '';

  const { data, error } = await supabaseAdmin
    .from('heroes')
    .select('id, hero_name, balance')
    .order('balance', { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ top10: [], searchResult: null }, { status: 500 });
  }

  const ranked = (data || []).map((row, i) => ({
    heroId: row.id,
    heroName: row.hero_name,
    balance: row.balance ?? 10000,
    rank: i + 1,
  }));

  let searchResult = null;

  if (search) {
    const inTop = ranked.find(r => r.heroName.includes(search));
    if (inTop) {
      searchResult = inTop;
    } else {
      const { data: matched } = await supabaseAdmin
        .from('heroes')
        .select('id, hero_name, balance')
        .ilike('hero_name', `%${search}%`)
        .order('balance', { ascending: false })
        .limit(1);

      if (matched && matched.length > 0) {
        const hero = matched[0];
        const { count } = await supabaseAdmin
          .from('heroes')
          .select('*', { count: 'exact', head: true })
          .gt('balance', hero.balance);

        searchResult = {
          heroId: hero.id,
          heroName: hero.hero_name,
          balance: hero.balance ?? 10000,
          rank: (count ?? 0) + 1,
        };
      }
    }
  }

  return NextResponse.json({ top10: ranked, searchResult }, {
    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
  });
}
