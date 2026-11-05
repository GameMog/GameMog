// Story Kit voice store: where the creator's browser puts the clips its voice pass made (storykit/voices/studio.html).
// A clip lands beside the built pack, and the pack's voice manifest records it by line hash:
//   public/storykit/packs/<id>/voice/<line hash>-<voice key>.ogg|wav   the clip (Ogg Opus, or WAV where the browser
//                                                                      has no Opus encoder)
//   public/storykit/packs/<id>/voice/manifest.json                     { v, pack, model, clips: { <line hash>-<voice
//                                                                      key>: { file, line, who, voice, hash, secs, ... } } }
// Only a clip for a line of the built pack, in its speaker's current voice, is taken: the name is checked against the
// built pack's voice.lines (scripts/storykit-pack.ts writes them). A changed line or voice block has a new name, so
// its old clip is simply no longer used (storykit:pack lists such clips as stale) and an unchanged one is kept.
// Used for committed repo packs on the local dev server (PUT /api/storykit/drafts/repo-<id>/files/voice/<name>,
// app/api/storykit/drafts/[id]/files/[kind]/[name]/route.ts) and the headless probes. A creator's world is stored by
// lib/storykit-store.ts instead (GameMog's disk, content-hashed, per-draft token).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const CLIP_FILE = /^([0-9a-f]{8})-([0-9a-f]{8})\.(ogg|wav)$/;
export const MAX_CLIP_BYTES = 2 << 20;
const PACK_ID = /^[a-z0-9][a-z0-9-]{1,39}$/;

export const voiceDir = (root, pack) => path.join(root, 'public/storykit/packs', pack, 'voice');

export function readManifest(root, pack) {
  const f = path.join(voiceDir(root, pack), 'manifest.json');
  try { const m = JSON.parse(readFileSync(f, 'utf8')); if (m && m.v === 1 && m.clips && typeof m.clips === 'object') return m; } catch {}
  return { v: 1, pack, model: null, clips: {} };
}

/** The built pack's voiced lines by clip name (line hash + voice key), or null when the pack is not built. */
function builtLines(root, pack) {
  const f = path.join(root, 'public/storykit/packs', `${pack}.json`);
  if (!existsSync(f)) return null;
  const v = JSON.parse(readFileSync(f, 'utf8')).voice;
  return v ? { model: v.model, lines: new Map((v.lines || []).map((l) => [l.clip, l])) } : null;
}

const num = (x, lo, hi) => (Number.isFinite(+x) && +x >= lo && +x <= hi ? +x : null);
const word = (x, re) => (typeof x === 'string' && re.test(x) ? x : null);

/**
 * Store one clip. bytes: Uint8Array; meta: what the browser measured ({ secs, renderMs, encodeMs, device, dtype }).
 * Returns { ok: true, entry } or { ok: false, status, error }.
 */
export function saveVoiceClip(root, pack, file, bytes, meta = {}) {
  if (!PACK_ID.test(String(pack))) return { ok: false, status: 400, error: 'Bad pack id.' };
  const m = CLIP_FILE.exec(String(file));
  if (!m) return { ok: false, status: 400, error: 'A clip is <line hash>-<voice key>.ogg or .wav.' };
  if (!(bytes instanceof Uint8Array) || bytes.length < 64 || bytes.length > MAX_CLIP_BYTES) return { ok: false, status: 413, error: `A clip is 64 B to ${MAX_CLIP_BYTES >> 20} MB.` };
  const magic = String.fromCharCode(...bytes.slice(0, 4)), ext = m[3];
  if ((ext === 'ogg' && magic !== 'OggS') || (ext === 'wav' && (magic !== 'RIFF' || String.fromCharCode(...bytes.slice(8, 12)) !== 'WAVE'))) return { ok: false, status: 415, error: `Not an ${ext} file.` };
  const built = builtLines(root, pack);
  if (!built) return { ok: false, status: 404, error: `No built pack ${pack} with voices (npm run storykit:pack -- ${pack}).` };
  const base = `${m[1]}-${m[2]}`, line = built.lines.get(base);
  if (!line) return { ok: false, status: 409, error: `${base} is no line of ${pack} in its speaker's current voice.` };

  const dir = voiceDir(root, pack); mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${file}.${process.pid}.tmp`);
  writeFileSync(tmp, bytes); renameSync(tmp, path.join(dir, file));
  const man = readManifest(root, pack);
  const old = man.clips[base];
  const entry = {
    file, line: line.id, who: line.who, voice: line.voice, hash: m[1], key: m[2], codec: ext === 'ogg' ? 'opus' : 'pcm16', bytes: bytes.length,
    secs: num(meta.secs, 0, 120), renderMs: num(meta.renderMs, 0, 6e5), encodeMs: num(meta.encodeMs, 0, 6e5),
    device: word(meta.device, /^(webgpu|wasm)$/), dtype: word(meta.dtype, /^(fp32|fp16|q8)$/), made: new Date().toISOString().slice(0, 19) + 'Z'
  };
  man.pack = pack; man.model = built.model; man.clips[base] = entry;
  man.clips = Object.fromEntries(Object.entries(man.clips).sort(([a], [b]) => (a < b ? -1 : 1)));
  const mf = path.join(dir, 'manifest.json'), mt = mf + `.${process.pid}.tmp`;
  writeFileSync(mt, JSON.stringify(man, null, 1) + '\n'); renameSync(mt, mf);
  return { ok: true, entry, replaced: !!old };
}

/** For storykit:pack: each built line voiced or pending, and clips no line uses any more (stale). */
export function voiceStatus(root, pack, lines) {
  const man = readManifest(root, pack), dir = voiceDir(root, pack);
  const ready = [], pending = [];
  // (a line with a shipped recording, `rec`, is ready: storykit/pack/registry.ts)
  for (const l of lines) { const c = man.clips[l.clip]; (l.rec || (c && existsSync(path.join(dir, c.file))) ? ready : pending).push(l); }
  const want = new Set(lines.map((l) => l.clip)), stale = Object.keys(man.clips).filter((k) => !want.has(k));
  const bytes = ready.reduce((s, l) => s + (man.clips[l.clip]?.bytes || 0), 0), secs = ready.reduce((s, l) => s + (man.clips[l.clip]?.secs ?? l.secs ?? 0), 0);
  return { ready, pending, stale, bytes, secs };
}
