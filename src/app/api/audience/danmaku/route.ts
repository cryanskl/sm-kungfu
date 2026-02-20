import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { transformDanmaku, influenceAwareDanmakuColor } from '@/lib/game/danmaku-transform';
import { cookies } from 'next/headers';
import { danmakuRateLimiter } from '@/lib/rate-limit';
import { detectInfluence } from '@/lib/game/audience-influence';
import { signCookie, verifyCookie } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: '弹幕不能为空' }, { status: 400 });
    }
    if (text.length > 50) {
      return NextResponse.json({ error: '弹幕最多50字' }, { status: 400 });
    }

    // 获取或生成 audience_id（签名验证防伪造）
    const cookieStore = await cookies();
    let audienceId = verifyCookie(cookieStore.get('wulin_audience_id')?.value);
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

    // 写入 DB
    await supabaseAdmin.from('danmaku').insert({
      id,
      game_id: gs.game_id,
      audience_id: audienceId,
      original_text: trimmed,
      wuxia_text: wuxiaText,
      color,
    });

    // 更新 game_state.danmaku（追加弹幕列表）
    const existing = Array.isArray(gs.danmaku) ? gs.danmaku : [];
    const newItem = { id, wuxiaText, color, createdAt: new Date().toISOString() };
    const updated = [...existing, newItem].slice(-30);

    await supabaseAdmin
      .from('game_state')
      .update({ danmaku: updated })
      .eq('id', 'current');

    // 原子化更新天意计数器（避免并发 read-modify-write 丢失计数）
    const HIGH_TRIGGER_THRESHOLDS: Record<string, number> = {
      divine_weapon: 15, mysterious_npc: 20, mass_heal: 12,
    };

    if (influences.length > 0) {
      const categories = influences.map(inf => inf.category);
      const heroTargets: Record<string, Record<string, number>> = {};
      for (const inf of influences) {
        if (inf.heroTarget) {
          if (!heroTargets[inf.category]) heroTargets[inf.category] = {};
          heroTargets[inf.category][inf.heroTarget] = 1;
        }
      }
      // 尝试使用原子 RPC；如果函数不存在则回退到非原子更新
      const { error: rpcError } = await supabaseAdmin.rpc('increment_influence', {
        p_categories: categories,
        p_hero_targets: heroTargets,
      });
      if (rpcError) {
        // RPC 不可用时回退到直接更新（有小概率丢失计数）
        const currentInfluence = gs.audience_influence || { counters: {}, heroTargets: {} };
        const counters = { ...currentInfluence.counters };
        const targets = { ...currentInfluence.heroTargets };
        for (const inf of influences) {
          counters[inf.category] = (counters[inf.category] || 0) + 1;
          if (inf.heroTarget) {
            if (!targets[inf.category]) targets[inf.category] = {};
            targets[inf.category] = { ...targets[inf.category] };
            targets[inf.category][inf.heroTarget] = (targets[inf.category][inf.heroTarget] || 0) + 1;
          }
        }
        await supabaseAdmin.from('game_state').update({
          audience_influence: { ...currentInfluence, counters, heroTargets: targets },
        }).eq('id', 'current');
      }

      // 高阈值效果触发检测：写入 lastTrigger 供前端全屏特效展示
      for (const det of influences) {
        const threshold = HIGH_TRIGGER_THRESHOLDS[det.category];
        if (!threshold) continue;

        const { data: latestGs } = await supabaseAdmin
          .from('game_state')
          .select('audience_influence')
          .eq('id', 'current')
          .single();
        const currentCount = latestGs?.audience_influence?.counters?.[det.category] || 0;
        if (currentCount >= threshold) {
          // 查找触发者显示名（英雄名或 audience_id 前8位）
          const myHero = (gs.heroes || []).find((h: any) => h.heroId === audienceId);
          const displayName = myHero?.heroName || audienceId.slice(0, 8);

          const updatedInfluence = { ...latestGs!.audience_influence };
          updatedInfluence.lastTrigger = {
            effectType: det.category,
            triggeredBy: audienceId,
            triggeredByName: displayName,
            timestamp: Date.now(),
          };
          await supabaseAdmin
            .from('game_state')
            .update({ audience_influence: updatedInfluence })
            .eq('id', 'current');
        }
      }
    }

    // 设置 cookie
    const response = NextResponse.json({ ok: true, danmaku: newItem });
    response.cookies.set('wulin_audience_id', signCookie(audienceId), {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
      sameSite: 'lax',
    });
    return response;
  } catch (err: any) {
    console.error('Danmaku error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
