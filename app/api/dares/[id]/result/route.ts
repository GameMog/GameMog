import { NextResponse } from 'next/server';
import { getPlayableGameById } from '@/lib/db';
import { getDare, target, checkRun, describeRun, better, margin, marginText, recordDareEvent, validPlayer, fromOwnPage, ownerVisit } from '@/lib/dare';

export const runtime = 'nodejs';

/**
 * A dared player's finished run (lib/dare.ts). Body: { visitor, run }: the visitor's browser id (app/anon.ts playerId)
 * and their result message, as the game sent it. Answers { beaten, margin, marginText, you, them }: you and them are
 * lib/dare.ts Targets (them: null when the dare had no run to beat, and then nothing is beaten); margin is how far
 * ahead (negative: behind) in the board's first measure. Records the 'finished' step, and 'beaten' when it was.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!fromOwnPage(req)) return NextResponse.json({ error: 'Runs are posted from GameMog.' }, { status: 403 });
  const { id } = await ctx.params;
  const dare = getDare(id);
  const game = dare ? getPlayableGameById(dare.game_id) : undefined;
  if (!dare || !game) return NextResponse.json({ error: 'That dare is not available.' }, { status: 404 });
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: 'That run did not come through.' }, { status: 400 }); }
  if (!b || !validPlayer(b.visitor)) return NextResponse.json({ error: 'That run did not come through.' }, { status: 400 });
  const c = checkRun(game, b.run);
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: 422 });

  const you = describeRun(game, c.run), them = target(dare, game);
  const beaten = !!them && better(dare.board, c.run, them.run);
  const m = them ? margin(dare.board, c.run, them.run) : null;
  // (the sender's own runs and the owner's are not the funnel)
  if (b.visitor !== dare.sender && !ownerVisit(req)) {
    recordDareEvent(dare.id, b.visitor, 'finished');
    if (beaten) recordDareEvent(dare.id, b.visitor, 'beaten');
  }
  return NextResponse.json({ beaten, margin: m, marginText: m == null ? null : marginText(dare.board, m), you, them });
}
