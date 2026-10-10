import { NextResponse } from 'next/server';
import { getPlayableGameById } from '@/lib/db';
import { cleanName, cleanMessage } from '@/lib/names';
import {
  checkRun, checkCard, decodeCard, createDare, getDare, target, dareUrl, validPlayer, validDareId,
  rateOk, cardBudgetOk, clientKey, fromOwnPage, type DareRun,
} from '@/lib/dare';

export const runtime = 'nodejs';

const no = (error: string, status: number, field?: string) => NextResponse.json({ error, ...(field ? { field } : {}) }, { status });

/**
 * Send a dare (the dare loop, 10 Oct; lib/dare.ts). Body: { gameId, sender, name?, message?, parent?, run?, card? }.
 * sender: the browser's id (app/anon.ts playerId), kept private. run: the sender's result message, as the game sent it
 * to its page; checked, and refused with a reason when it does not pass. card: the base64 JPEG lib/dare-card.ts drew;
 * one that is not a 1200 x 630 JPEG under 350 KB is left off (the link then previews with the game's cover).
 * Answers { id, url, target, card } (target: what the dared player must beat, or null).
 */
export async function POST(req: Request) {
  if (!fromOwnPage(req)) return no('Dares are sent from GameMog.', 403);
  if (!rateOk(clientKey(req))) return no('Too many dares at once. Try again in a few minutes.', 429);
  const text = await req.text();
  if (text.length > 600_000) return no('That dare is too big.', 413);
  let b: Record<string, unknown>;
  try { b = JSON.parse(text) as Record<string, unknown>; } catch { return no('That dare did not come through.', 400); }
  if (!b || typeof b !== 'object') return no('That dare did not come through.', 400);

  const game = typeof b.gameId === 'string' ? getPlayableGameById(b.gameId) : undefined;
  if (!game) return no('That game is not available.', 404);
  if (!validPlayer(b.sender)) return no('That dare did not come through.', 400);
  const name = b.name == null || b.name === '' ? null : cleanName(b.name);
  if (name && !name.ok) return no(name.error, 400, 'name');
  const message = cleanMessage(b.message);
  if (!message.ok) return no(message.error, 400, 'message');

  let run: DareRun | null = null;
  if (b.run != null) {
    const c = checkRun(game, b.run);
    if (!c.ok) return no(c.error, 422, 'run');
    run = c.run;
  }
  // (an answer to a dare that is gone is a new dare)
  const parent = validDareId(b.parent) && getDare(b.parent) ? b.parent : null;
  let card: Uint8Array | null = null;
  if (b.card != null) {
    const bytes = decodeCard(b.card);
    if (bytes && checkCard(bytes).ok && cardBudgetOk(bytes.length)) card = bytes;
  }

  const id = createDare({ game, sender: b.sender, name: name?.ok ? name.value : null, message: message.value || null, parent, run, card });
  const d = getDare(id);
  return NextResponse.json({ id, url: dareUrl(game.slug, id), target: d ? target(d, game) : null, card: !!card });
}
