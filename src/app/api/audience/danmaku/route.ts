import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { transformDanmaku, randomDanmakuColor } from '@/lib/game/danmaku-transform';
import { cookies } from 'next/headers';

// 简易限流：audience_id → 上次发送时间
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 5000;

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
    const lastSent = rateLimitMap.get(audienceId) || 0;
    if (Date.now() - lastSent < RATE_LIMIT_MS) {
      const wait = Math.ceil((RATE_LIMIT_MS - (Date.now() - lastSent)) / 1000);
      return NextResponse.json({ error: `少侠稍安勿躁，${wait}秒后再发` }, { status: 429 });
    }
    rateLimitMap.set(audienceId, Date.now());

    // 获取当前游戏 ID
    const { data: gs } = await supabaseAdmin
      .from('game_state')
      .select('game_id')
      .eq('id', 'current')
      .single();

    if (!gs?.game_id) {
      return NextResponse.json({ error: '当前无进行中的比赛' }, { status: 400 });
    }

    // 转换弹幕
    const wuxiaText = transformDanmaku(text);
    const color = randomDanmakuColor();
    const id = crypto.randomUUID();

    // 写入 DB
    await supabaseAdmin.from('danmaku').insert({
      id,
      game_id: gs.game_id,
      audience_id: audienceId,
      original_text: text.trim(),
      wuxia_text: wuxiaText,
      color,
    });

    // 更新 game_state.danmaku（保留最近 30 条）
    const { data: currentState } = await supabaseAdmin
      .from('game_state')
      .select('danmaku')
      .eq('id', 'current')
      .single();

    const existing = Array.isArray(currentState?.danmaku) ? currentState.danmaku : [];
    const newItem = { id, wuxiaText, color, createdAt: new Date().toISOString() };
    const updated = [...existing, newItem].slice(-30);

    await supabaseAdmin
      .from('game_state')
      .update({ danmaku: updated })
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
