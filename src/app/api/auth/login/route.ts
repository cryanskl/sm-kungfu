import { NextResponse } from 'next/server';
import { generateOAuthState } from '@/lib/auth';

export async function GET() {
  const clientId = process.env.SECONDME_CLIENT_ID;
  const redirectUri = process.env.SECONDME_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: 'Missing OAuth config' }, { status: 500 });
  }

  // 生成 state 防 CSRF
  const state = generateOAuthState();

  const OAUTH_URL = 'https://go.second.me/oauth/';
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  });

  const response = NextResponse.redirect(`${OAUTH_URL}?${params.toString()}`);

  // state 存入 httpOnly cookie，callback 时校验
  response.cookies.set('wulin_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300,
  });

  return response;
}
