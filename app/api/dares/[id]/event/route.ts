import { getDare, recordDareEvent, validPlayer, fromOwnPage, ownerVisit, type DareEvent } from '@/lib/dare';

export const runtime = 'nodejs';

const none = () => new Response(null, { status: 204 });
/** The steps a page reports itself; 'sent', 'finished' and 'beaten' are recorded by the routes that make them. */
const KINDS: DareEvent[] = ['opened', 'played', 'shared', 'mogged_back'];

/**
 * One step of a dare's funnel from its page (lib/dare.ts dare_events): { visitor, kind }, kind one of opened, played,
 * shared, mogged_back; once per dare, visitor and step. The checks of app/api/hit/route.ts; anything odd is dropped
 * quietly (204). The sender's own opens and plays are not counted; their shares are.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!fromOwnPage(req) || ownerVisit(req)) return none();
  const { id } = await ctx.params;
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return none(); }
  const kind = KINDS.find((k) => k === b?.kind);
  const dare = getDare(id);
  if (!dare || !kind || !validPlayer(b.visitor)) return none();
  if (b.visitor === dare.sender && kind !== 'shared') return none();
  recordDareEvent(dare.id, b.visitor, kind);
  return none();
}
