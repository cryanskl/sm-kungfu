import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { cookies } from 'next/headers';
import { getHeroIdFromCookies } from '@/lib/auth';
import { BET_AMOUNTS } from '@/lib/game/constants';
import { betRateLimiter } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const { heroId, amount } = await request.json();
    if (!heroId || !amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: '参数有误' }, { status: 400 });
    }
    if (!(BET_AMOUNTS as readonly number[]).includes(amount)) {
      return NextResponse.json({ error: `金额必须为 ${BET_AMOUNTS.join('/')}` }, { status: 400 });
    }

    // 检测登录状态
    const { heroId: loggedInHeroId } = getHeroIdFromCookies(request.cookies);
    const isLoggedIn = !!loggedInHeroId;

    // 登录用户用 heroId 作为 audience_id，匿名用户用 cookie
    let audienceId: string;
    if (isLoggedIn) {
      audienceId = loggedInHeroId!;
    } else {
      const cookieStore = await cookies();
      audienceId = cookieStore.get('wulin_audience_id')?.value || crypto.randomUUID();
    }

    // 限流检查
    const rl = betRateLimiter.check(audienceId);
    if (!rl.allowed) {
      const wait = Math.ceil((rl.retryAfterMs || 0) / 1000);
      return NextResponse.json({ error: `少侠手速太快，${wait}秒后再试` }, { status: 429 });
    }

    // 获取当前游戏状态
    const { data: gs } = await supabaseAdmin
      .from('game_state')
      .select('game_id, status, betting_pool')
      .eq('id', 'current')
      .single();

    if (!gs?.game_id) {
      return NextResponse.json({ error: '当前无比赛' }, { status: 400 });
    }

    // 仅 intro 阶段可押注
    if (gs.status !== 'intro') {
      return NextResponse.json({ error: '押注窗口已关闭' }, { status: 400 });
    }

    // 检查是否已对此英雄押注（允许押多个不同英雄）
    const { data: existing } = await supabaseAdmin
      .from('bets')
      .select('id')
      .eq('game_id', gs.game_id)
      .eq('audience_id', audienceId)
      .eq('hero_id', heroId)
      .single();

    if (existing) {
      return NextResponse.json({ error: '已押注此侠客，请选其他人' }, { status: 400 });
    }

    // 登录用户：原子扣除余额（防止并发双花）
    let newBalance: number | undefined;
    if (isLoggedIn) {
      const { data: deducted, error: deductErr } = await supabaseAdmin
        .rpc('deduct_balance', { p_hero_id: loggedInHeroId, p_amount: amount });

      if (deductErr || deducted === null || deducted === undefined) {
        console.error('deduct_balance RPC failed:', { deductErr, deducted, loggedInHeroId, amount });
        // rpc 返回 -1 表示余额不足
        if (deducted === -1) {
          return NextResponse.json({ error: '银两不足' }, { status: 400 });
        }
        return NextResponse.json({ error: '扣款失败' }, { status: 500 });
      }
      if (deducted === -1) {
        return NextResponse.json({ error: '银两不足' }, { status: 400 });
      }
      newBalance = deducted;
    }

    // 写入 bets（不再存赔率，改用排名倍率结算）
    await supabaseAdmin.from('bets').insert({
      game_id: gs.game_id,
      audience_id: audienceId,
      hero_id: heroId,
      amount,
      odds_at_bet: 0,
    });

    // 获取英雄名（从 game_state.heroes 查）
    const { data: stateData } = await supabaseAdmin
      .from('game_state')
      .select('heroes')
      .eq('id', 'current')
      .single();
    const heroes = stateData?.heroes || [];
    const heroName = heroes.find((h: any) => h.heroId === heroId)?.heroName || '未知';

    // 更新 betting_pool（用于前端展示）
    const pool = gs.betting_pool || { totalPool: 0, heroPools: {}, isOpen: true };
    const heroPool = pool.heroPools?.[heroId]?.amount || 0;
    const newTotal = (pool.totalPool || 0) + amount;
    const newHeroAmount = heroPool + amount;

    const updatedHeroPools = { ...pool.heroPools };
    updatedHeroPools[heroId] = {
      heroName,
      amount: newHeroAmount,
      betCount: (updatedHeroPools[heroId]?.betCount || 0) + 1,
    };

    const updatedPool = {
      totalPool: newTotal,
      heroPools: updatedHeroPools,
      isOpen: true,
    };

    await supabaseAdmin
      .from('game_state')
      .update({ betting_pool: updatedPool })
      .eq('id', 'current');

    const response = NextResponse.json({
      ok: true,
      bet: { heroId, heroName, amount },
      pool: updatedPool,
      ...(newBalance !== undefined && { newBalance }),
    });

    // 匿名用户才设置 cookie
    if (!isLoggedIn) {
      response.cookies.set('wulin_audience_id', audienceId, {
        httpOnly: false,
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
        sameSite: 'lax',
      });
    }
    return response;
  } catch (err: any) {
    console.error('Bet error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
