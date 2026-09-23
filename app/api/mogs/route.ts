import { NextResponse } from 'next/server';
import { castPick, mogOff } from '@/lib/db';

export const runtime = 'nodejs';

const VOTER = /^[a-f0-9-]{16,64}$/;

/** A Mog-off's standing, and this browser's pick and whether it has played both. */
export async function GET(req: Request) {
  const u = new URL(req.url), child = u.searchParams.get('child') ?? '', voter = u.searchParams.get('voter') ?? '';
  const m = mogOff(child, VOTER.test(voter) ? voter : undefined);
  return m ? NextResponse.json(m) : NextResponse.json({ error: 'Not a Mog.' }, { status: 404 });
}

/**
 * Pick the better of a Mog and the game it challenged. Anyone can pick; a pick
 * only counts toward the family's ranking once this browser has finished a
 * run in both games.
 */
export async function POST(req: Request) {
  let b: { child?: string; voter?: string; winner?: string | null };
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'Malformed request.' }, { status: 400 }); }
  if (typeof b.child !== 'string' || typeof b.voter !== 'string' || !VOTER.test(b.voter)) return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  if (b.winner !== null && typeof b.winner !== 'string') return NextResponse.json({ error: 'Bad pick.' }, { status: 400 });
  const m = castPick(b.child, b.voter, b.winner ?? null);
  return m ? NextResponse.json(m) : NextResponse.json({ error: 'That is not a Mog-off.' }, { status: 404 });
}
