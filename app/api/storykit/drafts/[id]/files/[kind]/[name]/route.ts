import { storyStore, bearer, readCapped, LIMITS } from '@/lib/storykit-store';
import { storykitOff, json } from '@/lib/storykit-http';
import { saveVoiceClip } from '@/storykit/pack/voice-store.mjs';

export const runtime = 'nodejs';

/**
 * Store one file the creator's browser made for a draft (authorization: Bearer <token>; body: the file's bytes):
 *   PUT /api/storykit/drafts/<id>/files/glb/<cast id>                       a forged person (GLB 2.0, at most 3 MB)
 *   PUT /api/storykit/drafts/<id>/files/voice/<line hash>-<voice key>.ogg   a voice clip (Ogg Opus or .wav, 1 MB)
 *       headers x-voice-secs, x-voice-render-ms, x-voice-encode-ms, x-voice-device, x-voice-dtype
 *   PUT /api/storykit/drafts/<id>/files/art/<key-wide|key-square|avatar|head-<cast id>>.<jpg|webp|png>   (512 KB)
 *     -> { ok, file: { kind, name, hash, url: /storykit/f/<sha256>.<ext>, bytes } }
 * The limits per world are in lib/storykit-store.ts (LIMITS).
 *
 * A repo pack's voices (the committed test packs in public/storykit/packs/<id>/voice/, npm run storykit:pack) use the
 * same address with the id repo-<pack id>, on the local dev server only, without a token.
 */
type Ctx = { params: Promise<{ id: string; kind: string; name: string }> };
const MAX = { glb: LIMITS.glb.each, voice: LIMITS.voice.each, art: LIMITS.art.each } as Record<string, number>;

export async function PUT(req: Request, ctx: Ctx) {
  const off = storykitOff(req); if (off) return off;
  const { id, kind, name } = await ctx.params;
  const max = MAX[kind]; if (!max) return json({ error: 'A file is a glb, a voice clip or art.' }, 400);
  const h = req.headers;
  const meta = { secs: h.get('x-voice-secs'), renderMs: h.get('x-voice-render-ms'), encodeMs: h.get('x-voice-encode-ms'), device: h.get('x-voice-device'), dtype: h.get('x-voice-dtype') };

  const repo = /^repo-([a-z0-9][a-z0-9-]{1,39})$/.exec(id);
  if (repo) {
    if (process.env.NODE_ENV === 'production' || kind !== 'voice') return json({ error: 'Not found.' }, 404);
    const bytes = await readCapped(req, max); if (!bytes) return json({ error: `A clip is at most ${max >> 20} MB.` }, 413);
    const r = saveVoiceClip(process.cwd(), repo[1], name, bytes, meta);
    return r.ok ? json({ ok: true, entry: r.entry }) : json({ error: r.error }, r.status);
  }

  const s = storyStore(), d = s.auth(id, bearer(req));
  if (!d) return json({ error: 'No such draft, or not yours.' }, 404);
  const bytes = await readCapped(req, max);
  if (!bytes) return json({ error: `That file is over the ${kind} limit.` }, 413);
  const r = s.put(d, kind, decodeURIComponent(name), bytes, meta);
  return r.ok ? json(r) : json({ error: r.error }, r.status);
}
