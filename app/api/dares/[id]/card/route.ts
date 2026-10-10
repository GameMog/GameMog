import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getDare, checkCard, decodeCard, cardBudgetOk, fromOwnPage, validPlayer } from '@/lib/dare';

export const runtime = 'nodejs';

/**
 * A dare's card, added after the dare was made (lib/dare-card.ts): the page can make the dare first, draw the card
 * with the target the server worked out, then send it here. Body: { sender, card }: only the dare's own sender, only
 * once, and only a 1200 x 630 JPEG under 350 KB (base64). Answers { card: true }, or { card: false } when it was left
 * off (the link previews with the game's cover).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!fromOwnPage(req)) return NextResponse.json({ error: 'Cards are sent from GameMog.' }, { status: 403 });
  const { id } = await ctx.params;
  const text = await req.text();
  if (text.length > 600_000) return NextResponse.json({ error: 'That card is too big.' }, { status: 413 });
  let b: Record<string, unknown>;
  try { b = JSON.parse(text) as Record<string, unknown>; } catch { return NextResponse.json({ error: 'That card did not come through.' }, { status: 400 }); }
  const dare = getDare(id);
  if (!dare || !b || !validPlayer(b.sender) || b.sender !== dare.sender) return NextResponse.json({ error: 'That dare is not available.' }, { status: 404 });
  if (dare.has_card) return NextResponse.json({ card: true });
  const bytes = decodeCard(b.card);
  if (!bytes || !checkCard(bytes).ok || !cardBudgetOk(bytes.length)) return NextResponse.json({ card: false });
  db.prepare('UPDATE dares SET card = ? WHERE id = ? AND card IS NULL').run(bytes, dare.id);
  return NextResponse.json({ card: true });
}
