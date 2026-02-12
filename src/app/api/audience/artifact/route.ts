import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { cookies } from 'next/headers';
import { getHeroIdFromCookies } from '@/lib/auth';
import { ARTIFACTS } from '@/lib/game/constants';

export async function POST(request: NextRequest) {
  try {
    const { artifactId, heroId } = await request.json();
    if (!artifactId || !heroId) {
      return NextResponse.json({ error: '参数有误' }, { status: 400 });
    }

    // 验证神器存在
    const artifactDef = ARTIFACTS.find(a => a.id === artifactId);
    if (!artifactDef) {
      return NextResponse.json({ error: '无效的神器' }, { status: 400 });
    }

    // 检测登录状态
    const { heroId: loggedInHeroId } = getHeroIdFromCookies(request.cookies);
    const isLoggedIn = !!loggedInHeroId;

    let audienceId: string;
    if (isLoggedIn) {
      audienceId = loggedInHeroId!;
    } else {
      const cookieStore = await cookies();
      audienceId = cookieStore.get('wulin_audience_id')?.value || crypto.randomUUID();
    }

    // 获取当前游戏状态
    const { data: gs } = await supabaseAdmin
      .from('game_state')
      .select('game_id, status, artifact_pool')
      .eq('id', 'current')
      .single();

    if (!gs?.game_id) {
      return NextResponse.json({ error: '当前无比赛' }, { status: 400 });
    }

    // 仅 artifact_selection 阶段可购买
    if (gs.status !== 'artifact_selection') {
      return NextResponse.json({ error: '神兵助战窗口已关闭' }, { status: 400 });
    }

    const pool = gs.artifact_pool;
    if (!pool || !pool.isOpen) {
      return NextResponse.json({ error: '神兵助战窗口已关闭' }, { status: 400 });
    }

    // 验证 heroId 是决赛选手之一
    const finalistIds = (pool.finalists || []).map((f: any) => f.heroId);
    if (!finalistIds.includes(heroId)) {
      return NextResponse.json({ error: '此侠客不是决赛选手' }, { status: 400 });
    }

    // 验证 artifactId 在可选列表中
    const available = (pool.availableArtifacts || []).map((a: any) => a.id);
    if (!available.includes(artifactId)) {
      return NextResponse.json({ error: '此神器不在可选列表中' }, { status: 400 });
    }

    // 检查唯一约束：每人每局只能买一件
    const { data: existing } = await supabaseAdmin
      .from('artifact_gifts')
      .select('id')
      .eq('game_id', gs.game_id)
      .eq('audience_id', audienceId)
      .single();

    if (existing) {
      return NextResponse.json({ error: '每局只能赠送一件神器' }, { status: 400 });
    }

    const amount = artifactDef.price;

    // 登录用户：原子扣除余额
    let newBalance: number | undefined;
    if (isLoggedIn) {
      const { data: deducted, error: deductErr } = await supabaseAdmin
        .rpc('deduct_balance', { p_hero_id: loggedInHeroId, p_amount: amount });

      if (deductErr || deducted === null || deducted === undefined) {
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

    // 插入 artifact_gifts
    await supabaseAdmin.from('artifact_gifts').insert({
      game_id: gs.game_id,
      audience_id: audienceId,
      hero_id: heroId,
      artifact_id: artifactId,
      amount,
    });

    // 获取赠送者名称
    let displayName = audienceId.slice(0, 8);
    if (isLoggedIn) {
      const { data: hero } = await supabaseAdmin
        .from('heroes')
        .select('hero_name')
        .eq('id', loggedInHeroId)
        .single();
      if (hero) displayName = hero.hero_name;
    }

    // 更新 game_state.artifact_pool 缓存
    const updatedPool = { ...pool };
    const finalist = updatedPool.finalists.find((f: any) => f.heroId === heroId);
    if (finalist) {
      finalist.totalValue += amount;
      finalist.giftCount += 1;
      finalist.artifacts.push({
        audienceId,
        displayName,
        artifactId,
        artifactName: artifactDef.name,
        amount,
      });
    }
    updatedPool.totalPrizePool = (pool.introBetTotal || 0) +
      updatedPool.finalists.reduce((s: number, f: any) => s + f.totalValue, 0);

    await supabaseAdmin
      .from('game_state')
      .update({ artifact_pool: updatedPool })
      .eq('id', 'current');

    const response = NextResponse.json({
      ok: true,
      gift: { artifactId, artifactName: artifactDef.name, heroId, amount },
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
    console.error('Artifact gift error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
