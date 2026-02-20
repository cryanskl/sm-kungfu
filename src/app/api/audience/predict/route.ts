import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getHeroIdFromCookies, signCookie, verifyCookie } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { heroId, type } = await request.json();
    if (!heroId || !type || !['elimination', 'champion'].includes(type)) {
      return NextResponse.json({ error: '参数有误' }, { status: 400 });
    }

    // 检测登录状态（与 bet/danmaku 一致）
    const { heroId: loggedInHeroId } = getHeroIdFromCookies(request.cookies);
    let audienceId: string;
    if (loggedInHeroId) {
      audienceId = loggedInHeroId;
    } else {
      const cookieStore = await cookies();
      audienceId = verifyCookie(cookieStore.get('wulin_audience_id')?.value) || crypto.randomUUID();
    }

    // 获取当前游戏状态
    const { data: gs } = await supabaseAdmin
      .from('game_state')
      .select('game_id, status, predictions, heroes')
      .eq('id', 'current')
      .single();

    if (!gs?.game_id) {
      return NextResponse.json({ error: '当前无比赛' }, { status: 400 });
    }

    // 允许预测的游戏阶段
    const allowedPattern = /^(choosing_\d|round_\d|semifinals|intro)$/;
    if (!allowedPattern.test(gs.status)) {
      return NextResponse.json({ error: '当前不可预测' }, { status: 400 });
    }

    // 验证目标英雄存在
    const heroes = gs.heroes || [];
    const targetHero = heroes.find((h: any) => h.heroId === heroId);
    if (!targetHero) {
      return NextResponse.json({ error: '未找到该英雄' }, { status: 400 });
    }
    // 淘汰预测：目标必须存活
    if (type === 'elimination' && targetHero.isEliminated) {
      return NextResponse.json({ error: '该英雄已淘汰' }, { status: 400 });
    }

    // 更新 game_state JSONB 中的 predictions
    const predictions = gs.predictions || { elimination: {}, champion: {} };
    predictions[type as 'elimination' | 'champion'][audienceId] = heroId;

    await supabaseAdmin
      .from('game_state')
      .update({ predictions })
      .eq('id', 'current');

    const response = NextResponse.json({ ok: true, type, heroId });

    // 匿名用户设置 cookie
    if (!loggedInHeroId) {
      const cookieStore = await cookies();
      const existingCookie = cookieStore.get('wulin_audience_id')?.value;
      if (!existingCookie) {
        response.cookies.set('wulin_audience_id', signCookie(audienceId), {
          httpOnly: true,
          maxAge: 60 * 60 * 24 * 30,
          path: '/',
          sameSite: 'lax',
        });
      }
    }

    return response;
  } catch (err: any) {
    console.error('Predict error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
