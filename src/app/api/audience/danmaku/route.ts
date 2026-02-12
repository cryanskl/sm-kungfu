import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { transformDanmaku, influenceAwareDanmakuColor } from '@/lib/game/danmaku-transform';
import { cookies } from 'next/headers';
import { danmakuRateLimiter } from '@/lib/rate-limit';
import { detectInfluence } from '@/lib/game/audience-influence';

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: '弹幕不能为空' }, { status: 400 });
    }
    if (text.length > 50) {
      return NextResponse.json({ error: '弹幕最多50字' }, { status: 400 });
    }

    // 获取或生成 audience_id
    const cookieStore = await cookies();
    let audienceId = cookieStore.get('wulin_audience_id')?.value;
    if (!audienceId) {
      audienceId = crypto.randomUUID();
    }

    // 限流检查
    const rl = danmakuRateLimiter.check(audienceId);
    if (!rl.allowed) {
      const wait = Math.ceil((rl.retryAfterMs || 0) / 1000);
      return NextResponse.json({ error: `少侠稍安勿躁，${wait}秒后再发` }, { status: 429 });
    }

    // 获取当前游戏状态（合并查询：game_id + heroes + danmaku + audience_influence）
    const { data: gs } = await supabaseAdmin
      .from('game_state')
      .select('game_id, heroes, danmaku, audience_influence')
      .eq('id', 'current')
      .single();

    if (!gs?.game_id) {
      return NextResponse.json({ error: '当前无进行中的比赛' }, { status: 400 });
    }

    // 转换弹幕
    const trimmed = text.trim();
    const wuxiaText = transformDanmaku(trimmed);
    const color = influenceAwareDanmakuColor(trimmed);
    const id = crypto.randomUUID();

    // 弹幕天意：关键词检测
    const heroNames = (gs.heroes || []).map((h: any) => h.heroName);
    const influences = detectInfluence(trimmed, heroNames);

    let currentInfluence = gs.audience_influence || {
      counters: {}, heroTargets: {}, lastResetRound: 0, activeEffects: [],
    };

    if (influences.length > 0) {
      currentInfluence = { ...currentInfluence, counters: { ...currentInfluence.counters }, heroTargets: { ...currentInfluence.heroTargets } };
      for (const inf of influences) {
        currentInfluence.counters[inf.category] = (currentInfluence.counters[inf.category] || 0) + 1;
        if (inf.heroTarget) {
          if (!currentInfluence.heroTargets[inf.category]) currentInfluence.heroTargets[inf.category] = {};
          currentInfluence.heroTargets[inf.category] = { ...currentInfluence.heroTargets[inf.category] };
          currentInfluence.heroTargets[inf.category][inf.heroTarget] =
            (currentInfluence.heroTargets[inf.category][inf.heroTarget] || 0) + 1;
        }
      }
    }

    // 写入 DB
    await supabaseAdmin.from('danmaku').insert({
      id,
      game_id: gs.game_id,
      audience_id: audienceId,
      original_text: trimmed,
      wuxia_text: wuxiaText,
      color,
    });

    // 更新 game_state.danmaku + audience_influence（单次 update）
    const existing = Array.isArray(gs.danmaku) ? gs.danmaku : [];
    const newItem = { id, wuxiaText, color, createdAt: new Date().toISOString() };
    const updated = [...existing, newItem].slice(-30);

    await supabaseAdmin
      .from('game_state')
      .update({
        danmaku: updated,
        ...(influences.length > 0 ? { audience_influence: currentInfluence } : {}),
      })
      .eq('id', 'current');

    // 设置 cookie
    const response = NextResponse.json({ ok: true, danmaku: newItem });
    response.cookies.set('wulin_audience_id', audienceId, {
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
      sameSite: 'lax',
    });
    return response;
  } catch (err: any) {
    console.error('Danmaku error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
