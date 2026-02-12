import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { SecondMeClient, shadesToAttributes } from '@/lib/game/secondme-client';
import { FACTION_BONUSES } from '@/lib/game/constants';
import { signCookie } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  if (!code) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?error=no_code`);
  }

  // OAuth state 校验（防 CSRF）
  const savedState = request.cookies.get('wulin_oauth_state')?.value;
  if (!state || !savedState || state !== savedState) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?error=invalid_state`);
  }

  try {
    // 1. 用授权码换 token
    //    端点: POST {base_url}/api/oauth/token/code
    //    格式: application/x-www-form-urlencoded（不是 JSON！）
    //    响应: { code: 0, data: { accessToken, refreshToken, ... } } （camelCase）
    const SM_BASE = 'https://app.mindos.com/gate/lab';
    const tokenRes = await fetch(`${SM_BASE}/api/oauth/token/code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.SECONDME_REDIRECT_URI || '',
        client_id: process.env.SECONDME_CLIENT_ID || '',
        client_secret: process.env.SECONDME_CLIENT_SECRET || '',
      }),
    });

    if (!tokenRes.ok) {
      console.error('Token exchange HTTP failed:', tokenRes.status, await tokenRes.text());
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?error=token_failed`);
    }

    const tokenResult = await tokenRes.json();
    if (tokenResult.code !== 0 || !tokenResult.data) {
      console.error('Token exchange API failed:', tokenResult);
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?error=token_failed`);
    }

    // 注意：响应字段是 camelCase（accessToken），不是 snake_case（access_token）
    const accessToken = tokenResult.data.accessToken;
    const refreshToken = tokenResult.data.refreshToken || '';

    // 2. 获取用户信息和性格
    const client = new SecondMeClient(accessToken);
    const [userInfo, shades] = await Promise.all([
      client.getUserInfo(),
      client.getShades(),
    ]);

    if (!userInfo) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?error=user_info_failed`);
    }

    const userId = String(userInfo.userId);

    // 3. 性格 → 属性映射
    const attrs = shadesToAttributes(shades);

    // 应用门派加成
    const factionBonus = FACTION_BONUSES[attrs.faction] || {};
    const finalAttrs = {
      strength: attrs.strength + (factionBonus.strength || 0),
      innerForce: attrs.innerForce + (factionBonus.innerForce || 0),
      agility: attrs.agility + (factionBonus.agility || 0),
      wisdom: attrs.wisdom + (factionBonus.wisdom || 0),
      constitution: attrs.constitution + (factionBonus.constitution || 0),
      charisma: attrs.charisma + (factionBonus.charisma || 0),
    };

    // 4. 英雄名 + 默认宣言（AI 宣言延迟到 engine/start 倒计时期间生成）
    const heroName = userInfo.name || `侠客${userId.slice(-4)}`;
    const catchphrase = '江湖路远，各位保重。';

    // 5. 创建或更新英雄
    const { data: hero } = await supabaseAdmin
      .from('heroes')
      .upsert({
        user_id: userId,
        is_npc: false,
        hero_name: heroName,
        faction: attrs.faction,
        personality_type: attrs.personalityType,
        catchphrase,
        avatar_url: userInfo.avatar || null,
        strength: finalAttrs.strength,
        inner_force: finalAttrs.innerForce,
        agility: finalAttrs.agility,
        wisdom: finalAttrs.wisdom,
        constitution: finalAttrs.constitution,
        charisma: finalAttrs.charisma,
        secondme_shades: shades,
        access_token: accessToken,
        refresh_token: refreshToken,
      }, { onConflict: 'user_id' })
      .select()
      .single();

    // 6. 记录登录活动
    await supabaseAdmin.from('activity_log').insert({
      hero_id: hero?.id,
      hero_name: heroName,
      event_type: 'login',
    }).then(() => {}, () => {}); // 不阻塞登录流程

    // 7. 设置签名 session cookie
    const response = NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/`);
    response.cookies.set('wulin_user_id', signCookie(userId), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    });
    response.cookies.set('wulin_hero_id', signCookie(hero?.id || ''), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    });
    // 清除 state cookie
    response.cookies.delete('wulin_oauth_state');

    return response;
  } catch (err) {
    console.error('Auth callback error:', err);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?error=unknown`);
  }
}
