import { NextRequest, NextResponse } from 'next/server';
import { startChoosing } from '@/lib/game/engine';

export async function POST(request: NextRequest) {
  const { gameId, roundNumber } = await request.json();
  if (!gameId || !roundNumber) {
    return NextResponse.json({ error: 'Missing gameId or roundNumber' }, { status: 400 });
  }

  const result = await startChoosing(gameId, roundNumber);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({ success: true });
}
