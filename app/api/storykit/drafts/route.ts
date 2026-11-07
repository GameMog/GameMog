import { storyStore, LIMITS, SHOWCASE_LIMITS } from '@/lib/storykit-store';
import { storykitOff, json } from '@/lib/storykit-http';

export const runtime = 'nodejs';

/**
 * Open a Story Kit draft (lib/storykit-store.ts). The server gates the pack (storykit/pack/gate.ts) and keeps it;
 * everything heavy is made in the creator's browser and stored with the token this returns, which is shown once.
 *   POST /api/storykit/drafts   { pack: <story pack v2>, parent?: <kept draft id, for a Mog> }
 *     -> 201 { id, token, limits, inherited, warnings } | 422 { error, problems } | 429 | 507
 * Off unless STORYKIT=on; refused like a build while NEXT_PUBLIC_BUILDS=off.
 */
export async function POST(req: Request) {
  const off = storykitOff(req); if (off) return off;
  if (process.env.NEXT_PUBLIC_BUILDS === 'off') return json({ error: 'Building worlds is coming soon.' }, 503);
  // (the largest pack any world may have, a Mog of a showcase's: the gate holds each pack to its own limit)
  if (Number(req.headers.get('content-length') || 0) > SHOWCASE_LIMITS.pack + 4096) return json({ error: `A story pack is at most ${SHOWCASE_LIMITS.pack} bytes.` }, 413);
  let body: { pack?: unknown; parent?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'Send JSON: { pack }.' }, 400); }
  const s = storyStore(), r = s.open(body?.pack, { parent: typeof body?.parent === 'string' ? body.parent : null });
  if (!r.ok) return json({ error: r.error, ...('problems' in r ? { problems: r.problems } : {}) }, r.status);
  const L = s.limitsOf(r.id);
  return json({ id: r.id, token: r.token, inherited: r.inherited, warnings: r.warnings,
    limits: { glb: L.glb, voice: L.voice, art: L.art, world: L.world, ttlHours: LIMITS.ttlMs / 3600_000 } }, 201);
}
