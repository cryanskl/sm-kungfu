import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getHeroIdFromCookies } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const { userId, heroId } = getHeroIdFromCookies(request.cookies);
  if (!heroId || !userId) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  }

  // 归属校验
  const { data: heroCheck } = await supabaseAdmin
    .from('heroes').select('user_id').eq('id', heroId).single();
  if (!heroCheck || heroCheck.user_id !== userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // 查找 waiting/countdown 的游戏
  const { data: game } = await supabaseAdmin
    .from('games')
    .select('id, status')
    .in('status', ['waiting', 'countdown'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!game) {
    return NextResponse.json({ error: '对局已开始，无法退出' }, { status: 400 });
  }

  // 确认该玩家在对局中
  const { data: seat } = await supabaseAdmin
    .from('game_heroes')
    .select('id')
    .eq('game_id', game.id)
    .eq('hero_id', heroId)
    .single();

  if (!seat) {
    return NextResponse.json({ error: '你不在当前对局中' }, { status: 400 });
  }

  // 删除该玩家的 game_heroes 记录
  await supabaseAdmin
    .from('game_heroes')
    .delete()
    .eq('game_id', game.id)
    .eq('hero_id', heroId);

  // 刷新 game_state 的 heroes 快照
  const { data: allGh } = await supabaseAdmin
    .from('game_heroes')
    .select('*, hero:heroes(*)')
    .eq('game_id', game.id)
    .order('seat_number');

  const heroSnapshots = (allGh || []).map((gh: any) => ({
    heroId: gh.hero_id,
    heroName: gh.hero?.hero_name || '无名',
    faction: gh.hero?.faction || '少林',
    personalityType: gh.hero?.personality_type || 'random',
    seatNumber: gh.seat_number,
    hp: gh.hp,
    maxHp: 100,
    reputation: 0,
    hot: 0,
    morality: gh.morality || 50,
    credit: gh.credit || 50,
    isEliminated: false,
    allyHeroId: null,
    allyHeroName: null,
    martialArts: [],
    hasDeathPact: false,
    isNpc: gh.hero?.is_npc || false,
    catchphrase: gh.hero?.catchphrase || '……',
    avatarUrl: gh.hero?.avatar_url,
    strength: gh.hero?.strength || 10,
    innerForce: gh.hero?.inner_force || 10,
    agility: gh.hero?.agility || 10,
    wisdom: gh.hero?.wisdom || 10,
    constitution: gh.hero?.constitution || 10,
    charisma: gh.hero?.charisma || 10,
  }));

  // 如果没有真人玩家了，把状态退回 waiting
  const humanCount = (allGh || []).filter((gh: any) => !gh.hero?.is_npc).length;
  if (humanCount === 0 && game.status === 'countdown') {
    await supabaseAdmin
      .from('games')
      .update({ status: 'waiting' })
      .eq('id', game.id);
  }

  const newStatus = humanCount === 0 && game.status === 'countdown' ? 'waiting' : game.status;
  await supabaseAdmin.from('game_state').upsert({
    id: 'current',
    game_id: game.id,
    status: newStatus,
    heroes: heroSnapshots,
    updated_at: new Date().toISOString(),
  });

  return NextResponse.json({ status: 'left' });
}
