import { NextResponse } from 'next/server';
import { dareView } from '@/lib/dare';

export const runtime = 'nodejs';

/** A dare as anyone may see it (lib/dare.ts DareView): the game, the name and message, and the target. Never the sender. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const view = dareView(id);
  if (!view) return NextResponse.json({ error: 'That dare is not available.' }, { status: 404 });
  return NextResponse.json(view);
}
