import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete('wulin_user_id');
  response.cookies.delete('wulin_hero_id');
  return response;
}
