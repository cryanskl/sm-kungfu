import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { MAX_SEATS, INITIAL_HP, INITIAL_MORALITY, INITIAL_CREDIT } from '@/lib/game/constants';
import { getHeroIdFromCookies } from '@/lib/auth';

// 非可加入的活跃状态
const ACTIVE_STATUSES = [
  'intro', 'round_1', 'round_2', 'round_3', 'round_4', 'round_5',
  'processing_1', 'processing_2', 'processing_3', 'processing_4', 'processing_5',
  'semifinals', 'final', 'ending',
];

/** 更新 game_state 中的 queue_count */
async function syncQueueCount() {
  const { count } = await supabaseAdmin
    .from('game_queue')
    .select('*', { count: 'exact', head: true });
  await supabaseAdmin.from('game_state').update({
    queue_count: count || 0,
    updated_at: new Date().toISOString(),
  }).eq('id', 'current');
  return count || 0;
}

/** 消费候补队列，把排队玩家自动入座到新对局 */
async function consumeQueue(gameId: string, startSeat: number) {
  const { data: queued } = await supabaseAdmin
    .from('game_queue')
    .select('hero_id')
    .order('queued_at', { ascending: true })
    .limit(MAX_SEATS - startSeat);

  if (!queued || queued.length === 0) return;

  let seat = startSeat;
  const consumed: string[] = [];
  for (const q of queued) {
    if (seat > MAX_SEATS) break;
    const { error } = await supabaseAdmin.from('game_heroes').insert({
      game_id: gameId,
      hero_id: q.hero_id,
      seat_number: seat,
      hp: INITIAL_HP,
      morality: INITIAL_MORALITY,
      credit: INITIAL_CREDIT,
    });
    if (!error) {
      consumed.push(q.hero_id);
      seat++;
    }
  }

  // 删除已消费的队列条目
  if (consumed.length > 0) {
    await supabaseAdmin.from('game_queue').delete().in('hero_id', consumed);
  }

  await syncQueueCount();
}

export async function POST(request: NextRequest) {
  const { userId, heroId } = getHeroIdFromCookies(request.cookies);
  if (!heroId || !userId) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  }

  // 归属校验：确认 hero 属于该 user
  const { data: heroCheck } = await supabaseAdmin
    .from('heroes').select('user_id').eq('id', heroId).single();
  if (!heroCheck || heroCheck.user_id !== userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    // 1) 查找等待中/倒计时的游戏
    let { data: game } = await supabaseAdmin
      .from('games')
      .select('*')
      .in('status', ['waiting', 'countdown'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // 2) 如果没有可加入的游戏，检查是否有活跃对局
    if (!game) {
      // 先查 game_state 缓存：如果已 ended/waiting，直接创建新局（不被旧 games 行卡住）
      const { data: cachedState } = await supabaseAdmin
        .from('game_state')
        .select('status')
        .eq('id', 'current')
        .single();
      const cachedStatus = cachedState?.status || 'waiting';
      const cacheIsIdle = ['ended', 'waiting'].includes(cachedStatus);

      // 仅当缓存显示活跃时才检查 games 表
      const { data: activeGame } = cacheIsIdle
        ? { data: null }
        : await supabaseAdmin
            .from('games')
            .select('id, status')
            .in('status', ACTIVE_STATUSES)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

      if (activeGame) {
        // 活跃对局进行中 → 加入候补队列
        await supabaseAdmin.from('game_queue').upsert(
          { hero_id: heroId, queued_at: new Date().toISOString() },
          { onConflict: 'hero_id' }
        );
        const queueCount = await syncQueueCount();

        // 计算该玩家在队列中的位置
        const { data: allQueued } = await supabaseAdmin
          .from('game_queue')
          .select('hero_id')
          .order('queued_at', { ascending: true });
        const position = (allQueued || []).findIndex(q => q.hero_id === heroId) + 1;

        return NextResponse.json({
          queued: true,
          position,
          queueCount,
          estimatedMinutes: Math.ceil(position / 12) * 3,
        });
      }

      // 没有活跃对局 → 创建新游戏
      const { data: newGame } = await supabaseAdmin
        .from('games')
        .insert({ status: 'waiting' })
        .select()
        .single();
      game = newGame;

      // 新游戏创建后，从候补队列消费玩家（座位 2 起，座位 1 给触发者）
      if (game) {
        // 先把触发者从队列中移除（如果之前排过队）
        await supabaseAdmin.from('game_queue').delete().eq('hero_id', heroId);
      }
    }

    if (!game) {
      return NextResponse.json({ error: 'Failed to create game' }, { status: 500 });
    }

    // 检查是否已入座
    const { data: existing } = await supabaseAdmin
      .from('game_heroes')
      .select('*')
      .eq('game_id', game.id)
      .eq('hero_id', heroId)
      .single();

    if (existing) {
      return NextResponse.json({ gameId: game.id, seat: existing.seat_number, status: 'already_joined' });
    }

    // 抢座：查找已占座位，取第一个空位
    const { data: occupied } = await supabaseAdmin
      .from('game_heroes')
      .select('seat_number')
      .eq('game_id', game.id);

    const takenSeats = new Set((occupied || []).map((r: any) => r.seat_number));
    if (takenSeats.size >= MAX_SEATS) {
      return NextResponse.json({ error: 'Game is full' }, { status: 400 });
    }

    let seatNumber = 1;
    while (takenSeats.has(seatNumber) && seatNumber <= MAX_SEATS) seatNumber++;

    // 插入（依赖 UNIQUE(game_id, seat_number) 约束兜底并发冲突）
    const { error: insertErr } = await supabaseAdmin
      .from('game_heroes')
      .insert({
        game_id: game.id,
        hero_id: heroId,
        seat_number: seatNumber,
        hp: INITIAL_HP,
        morality: INITIAL_MORALITY,
        credit: INITIAL_CREDIT,
      });

    // 唯一约束冲突 → 重试一次
    if (insertErr?.code === '23505') {
      const { data: retryOccupied } = await supabaseAdmin
        .from('game_heroes')
        .select('seat_number')
        .eq('game_id', game.id);
      const retryTaken = new Set((retryOccupied || []).map((r: any) => r.seat_number));
      let retrySeat = 1;
      while (retryTaken.has(retrySeat) && retrySeat <= MAX_SEATS) retrySeat++;
      if (retrySeat > MAX_SEATS) {
        return NextResponse.json({ error: 'Game is full' }, { status: 400 });
      }
      await supabaseAdmin.from('game_heroes').insert({
        game_id: game.id, hero_id: heroId, seat_number: retrySeat,
        hp: INITIAL_HP, morality: INITIAL_MORALITY, credit: INITIAL_CREDIT,
      });
    }

    // 新创建的游戏 → 消费候补队列
    const { data: occupiedAfter } = await supabaseAdmin
      .from('game_heroes')
      .select('seat_number')
      .eq('game_id', game.id);
    const nextSeat = (occupiedAfter || []).length + 1;
    if (nextSeat <= MAX_SEATS) {
      await consumeQueue(game.id, nextSeat);
    }

    // 第一个真人入座 → 触发倒计时
    const { data: humanHeroes } = await supabaseAdmin
      .from('game_heroes')
      .select('*, hero:heroes(*)')
      .eq('game_id', game.id);

    const humanCount = humanHeroes?.filter((gh: any) => !gh.hero?.is_npc).length || 0;

    if (humanCount >= 1 && game.status === 'waiting') {
      await supabaseAdmin
        .from('games')
        .update({ status: 'countdown' })
        .eq('id', game.id)
        .eq('status', 'waiting');  // optimistic lock: only update if still waiting
    }

    // 记录参赛活动
    await supabaseAdmin.from('activity_log').insert({
      hero_id: heroId,
      hero_name: null,
      event_type: 'join',
    }).then(() => {}, () => {});

    // 每次入座都更新 game_state 的英雄列表
    const { data: allGh } = await supabaseAdmin
      .from('game_heroes')
      .select('*, hero:heroes(*)')
      .eq('game_id', game.id)
      .order('seat_number');

    const heroSnapshots = allGh?.map((gh: any) => ({
      heroId: gh.hero_id,
      heroName: gh.hero?.hero_name || '无名',
      faction: gh.hero?.faction || '少林',
      personalityType: gh.hero?.personality_type || 'random',
      seatNumber: gh.seat_number,
      hp: gh.hp,
      maxHp: INITIAL_HP,
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
    })) || [];

    const newStatus = humanCount >= 1 && game.status === 'waiting' ? 'countdown' : game.status;
    await supabaseAdmin.from('game_state').upsert({
      id: 'current',
      game_id: game.id,
      status: newStatus,
      phase: 'waiting',
      heroes: heroSnapshots,
      countdown_seconds: newStatus === 'countdown' ? 30 : null,
      danmaku: [],
      recent_events: [],
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({
      gameId: game.id,
      seat: seatNumber,
      status: game.status === 'waiting' ? 'countdown' : game.status,
      humanCount,
    });
  } catch (err: any) {
    console.error('Join error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
