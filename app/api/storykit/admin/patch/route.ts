import { readCapped, LIMITS } from '@/lib/storykit-store';
import { patchStoryWorld } from '@/lib/storykit-publish';
import { storykitOff, ownerRequest, json } from '@/lib/storykit-http';

export const runtime = 'nodejs';

/**
 * The owner's patch of a published story world: a new sealed world for the game, with the new voice clips and bodies it
 * plays (an opening added to The Velvet Run, 5 Nov; a cast member re-forged, the new GLB in place of the old one under
 * the same name). Owner only, whatever the switch: 404 unless the Story Kit is on for this request
 * (lib/storykit-switch.ts) and the request carries the owner's admin session (app/admin/session.ts).
 *   POST /api/storykit/admin/patch
 *     { slug, world: <runner world>, files: [{ ext: 'ogg' | 'wav' | 'glb', base64 }], opening?: <story-pack opening> | null }
 *     -> 200 { hash, url, was, clips, stored, bodies, bytes, worldBytes, game, drafts } | 404 | 409 | 413 | 422 { error, problems }
 * The checks and what changes: lib/storykit-store.ts StoryStore.patch, lib/storykit-publish.ts patchStoryWorld. The world
 * it replaces is kept: patching back is the same call with that world (fetch /storykit/f/<was>.json) and its opening
 * (null when it had none).
 */
const MAX = 4 * LIMITS.pack + Math.ceil((LIMITS.world * 4) / 3) + 64 * 1024;   // (the files: at most a whole world, as base64)

export async function POST(req: Request) {
  const off = storykitOff(req); if (off) return off;
  if (!ownerRequest(req)) return json({ error: 'Not found.' }, 404);
  const raw = await readCapped(req, MAX);
  if (!raw) return json({ error: `A patch is at most ${Math.floor(MAX / (1 << 20))} MB.` }, 413);
  let body: { slug?: unknown; world?: unknown; files?: unknown; opening?: unknown };
  try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { return json({ error: 'Send JSON: { slug, world, files }.' }, 400); }
  const list = body?.files ?? [];
  if (!Array.isArray(list) || list.length > 64) return json({ error: 'files: up to 64 of { ext, base64 }.' }, 400);
  const files: { ext: string; bytes: Uint8Array }[] = [];
  for (const f of list as { ext?: unknown; base64?: unknown }[]) {
    if (!f || typeof f.ext !== 'string' || typeof f.base64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(f.base64)) return json({ error: 'files: each { ext, base64 }.' }, 400);
    files.push({ ext: f.ext, bytes: new Uint8Array(Buffer.from(f.base64, 'base64')) });
  }
  const r = patchStoryWorld(body?.slug, { world: body?.world, files, ...('opening' in (body ?? {}) ? { opening: body.opening } : {}) });
  if (!r.ok) return json({ error: r.error, ...('problems' in r && r.problems ? { problems: r.problems } : {}) }, r.status);
  return json(r);
}
