import { NextResponse } from 'next/server';
import { getGameById, recordRun } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * A finished run, reported by the page hosting the game when the game frame
 * posts its result. It is what "has played" means for a Mog-off and what
 * "distinct players" counts. The player is the id this browser made for itself.
 */
export async function POST(req: Request) {
  let b: { gameId?: string; player?: string; level?: number };
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'Malformed request.' }, { status: 400 }); }
  if (typeof b.gameId !== 'string' || !getGameById(b.gameId)) return NextResponse.json({ error: 'No such game.' }, { status: 404 });
  if (typeof b.player !== 'string' || !/^[a-f0-9-]{16,64}$/.test(b.player)) return NextResponse.json({ error: 'Bad player id.' }, { status: 400 });
  const level = Number.isInteger(b.level) && b.level! > 0 && b.level! < 1000 ? b.level! : null;
  recordRun(b.gameId, b.player, level);
  return NextResponse.json({ ok: true });
}
