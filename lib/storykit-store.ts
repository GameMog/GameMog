/**
 * Story Kit world store: a creator's world on GameMog's own Render disk (no R2, no cloud storage; the owner, 4 Nov).
 * The heavy work (forge, voices, autopilot, key art and headshots) runs in the creator's browser; this server only
 * gates the pack and stores what the browser made.
 *
 * Layout (the Render disk is mounted at data/, render.yaml; the database is data/gamemog.db beside it):
 *   data/storykit/store.db                    drafts, their files and the blobs (SQLite, its own file)
 *   data/storykit/blobs/<h0h1>/<sha256>.<ext> every file once, named by the SHA-256 of its bytes. A Mog that keeps its
 *                                             parent's people and lines points at the same blobs, so it costs nothing
 * A file is served at /storykit/f/<sha256>.<ext> (app/storykit/f/[file]/route.ts): the same bytes forever, so it is
 * cached for a year as immutable. A draft's world (its runner pack, made from the gated pack and the files stored so
 * far) is /api/storykit/drafts/<id>/pack (no-store); sealing it freezes that pack as a content-hashed .json too.
 *
 * A draft is written to only with its token (sent once, when the draft is opened; only its SHA-256 is kept). A draft
 * that is not kept (published) and is untouched for STORYKIT_DRAFT_TTL_H hours (24) is abandoned: the sweep removes
 * it, then every blob no draft points at any more. The creator can also abandon it at once (DELETE).
 *
 * Everything here is behind STORYKIT=on (default off), so production is unchanged until the owner turns it on.
 */
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gatePack, toRunnerPack } from '../storykit/pack/gate.ts';
import { voicePlanOf } from '../storykit/pack/runner.ts';
import { storykitLive } from './storykit-switch.ts';

/** The store is there when the switch is on or owner-only (lib/storykit-switch.ts); who may write is the routes' check. */
export const storykitOn = () => storykitLive();

const MB = 1 << 20, KB = 1 << 10;
const envNum = (k: string, d: number) => { const v = Number(process.env[k]); return Number.isFinite(v) && v > 0 ? v : d; };

/**
 * The limits. A world (Night Shift: 3 people, 24 lines) is about 3.8 MB: 3.5 MB of GLBs, 253 KB of clips, a 19 KB
 * pack. The disk is 1 GB in all and holds gamemog.db too, so the Story Kit gets STORYKIT_DISK_MB (400) of it.
 */
export const LIMITS = {
  /** the source pack: the gate's own limit (storykit/pack/schema.mjs LIMITS.bytes) */
  pack: 160_000,
  glb: { each: 3 * MB, total: 16 * MB },
  voice: { each: 1 * MB, count: 600, total: 8 * MB },
  art: { each: 512 * KB, count: 16, total: 3 * MB },
  /** every distinct blob the world points at, inherited ones included */
  world: 24 * MB,
  get disk() { return envNum('STORYKIT_DISK_MB', 400) * MB; },
  /**
   * The size guard (the owner, 5 Nov): published worlds are kept for ever, so the store only grows. At this share of
   * the disk no new draft opens (and the build route refuses a story build before anything is spent); drafts already
   * open can still finish up to the whole disk. The owner's /admin shows the usage.
   */
  guardShare: 0.9,
  get guard() { return Math.floor(this.disk * this.guardShare); },
  /** drafts not yet kept, at once; drafts opened in any 24 hours */
  open: 60, perDay: 200,
  get ttlMs() { return envNum('STORYKIT_DRAFT_TTL_H', 24) * 3600_000; },
  /** the sweep runs at most this often on its own (open and put call it) */
  sweepEveryMs: 10 * 60_000,
};

export type Kind = 'glb' | 'voice' | 'art' | 'pack';
export const TYPES: Record<string, string> = {
  glb: 'model/gltf-binary', ogg: 'audio/ogg', wav: 'audio/wav', jpg: 'image/jpeg', webp: 'image/webp', png: 'image/png', json: 'application/json',
};
export const BLOB_FILE = /^([0-9a-f]{64})\.(glb|ogg|wav|jpg|webp|png|json)$/;
const CAST_ID = /^[a-z][a-z0-9-]{0,39}$/;
const CLIP = /^([0-9a-f]{8})-([0-9a-f]{8})\.(ogg|wav)$/;
const ART = /^(key-wide|key-square|head-[a-z][a-z0-9-]{0,39})\.(jpg|webp|png)$/;
const DRAFT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const blobUrl = (hash: string, ext: string) => `/storykit/f/${hash}.${ext}`;
/** a blob's served address, read back: its SHA-256 and extension */
const BLOB_REF = /^\/storykit\/f\/([0-9a-f]{64})\.([a-z]{3,4})$/;
const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const stable = (o: unknown): string => JSON.stringify(o, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));

type Fail = { ok: false; status: number; error: string };
export type StoreUsage = { used: number; disk: number; guard: number; share: number; guarded: boolean; blobs: number; kept: number; open: number; today: number; keptBytes: number };
/** What a new story world hears once the store is at its guard (LIMITS.guard). */
export const STORE_FULL = 'The Story Kit\'s store is nearly full, so new story worlds are paused for now. Published story worlds still play.';
/** The size guard for a new story world (the build route asks before anything is spent): its message, or null. */
export const storeGuard = (s: { used(): number }) => (s.used() >= LIMITS.guard ? STORE_FULL : null);
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });
type DraftRow = { id: string; token_hash: string; pack: string; parent: string | null; state: 'draft' | 'sealed' | 'kept'; game_id: string | null; world: string | null; created_at: number; touched_at: number };
type FileRow = { draft_id: string; kind: Kind; name: string; hash: string; ext: string; bytes: number; meta: string | null; inherited: number; at: number };

/** Is this a GLB 2.0 whose header, length and JSON chunk hold together? */
export function checkGlb(b: Uint8Array): string | null {
  if (b.length < 28) return 'too short to be a GLB';
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (v.getUint32(0, true) !== 0x46546c67) return 'not a GLB (no glTF magic)';
  if (v.getUint32(4, true) !== 2) return 'not glTF 2.0';
  if (v.getUint32(8, true) !== b.length) return 'its header gives another length';
  const jl = v.getUint32(12, true);
  if (v.getUint32(16, true) !== 0x4e4f534a || 20 + jl > b.length) return 'no JSON chunk';
  try { const j = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + jl))); if (j?.asset?.version !== '2.0') return 'its asset is not glTF 2.0'; } catch { return 'its JSON chunk does not parse'; }
  return null;
}
const ascii = (b: Uint8Array, a: number, z: number) => String.fromCharCode(...b.subarray(a, z));
function checkMagic(ext: string, b: Uint8Array): string | null {
  if (ext === 'ogg') return ascii(b, 0, 4) === 'OggS' ? null : 'not an Ogg file';
  if (ext === 'wav') return ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WAVE' ? null : 'not a WAV file';
  if (ext === 'jpg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? null : 'not a JPEG';
  if (ext === 'png') return b[0] === 0x89 && ascii(b, 1, 4) === 'PNG' ? null : 'not a PNG';
  if (ext === 'webp') return ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP' ? null : 'not a WebP';
  return null;
}
const num = (x: unknown, lo: number, hi: number) => (x != null && x !== '' && Number.isFinite(+x!) && +x! >= lo && +x! <= hi ? +x! : null);
const word = (x: unknown, re: RegExp) => (typeof x === 'string' && re.test(x) ? x : null);

export class StoryStore {
  readonly root: string;
  readonly db: DatabaseSync;
  private lastSweep = 0;
  private now: () => number;
  constructor(root: string, now: () => number = Date.now) {
    this.root = root; this.now = now;
    mkdirSync(path.join(root, 'blobs'), { recursive: true });
    this.db = new DatabaseSync(path.join(root, 'store.db'));
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS drafts (
        id         TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL,
        pack       TEXT NOT NULL,
        parent     TEXT,
        state      TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'sealed', 'kept')),
        game_id    TEXT,
        world      TEXT,
        created_at INTEGER NOT NULL,
        touched_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS files (
        draft_id  TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
        kind      TEXT NOT NULL,
        name      TEXT NOT NULL,
        hash      TEXT NOT NULL,
        ext       TEXT NOT NULL,
        bytes     INTEGER NOT NULL,
        meta      TEXT,
        inherited INTEGER NOT NULL DEFAULT 0,
        at        INTEGER NOT NULL,
        PRIMARY KEY (draft_id, kind, name)
      );
      CREATE INDEX IF NOT EXISTS files_by_hash ON files(hash);
      CREATE TABLE IF NOT EXISTS blobs (hash TEXT PRIMARY KEY, ext TEXT NOT NULL, bytes INTEGER NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS opened (at INTEGER NOT NULL);
    `);
  }

  blobPath(hash: string, ext: string) { return path.join(this.root, 'blobs', hash.slice(0, 2), `${hash}.${ext}`); }
  /** every stored blob's bytes */
  used(): number { return (this.db.prepare('SELECT COALESCE(SUM(bytes), 0) AS n FROM blobs').get() as { n: number }).n; }
  /** What the owner's /admin shows: the bytes stored against the disk and the guard, and the drafts by state. */
  usage(): StoreUsage {
    const used = this.used(), n = (q: string, ...a: number[]) => (this.db.prepare(q).get(...a) as { n: number }).n;
    return {
      used, disk: LIMITS.disk, guard: LIMITS.guard, share: LIMITS.disk ? used / LIMITS.disk : 1, guarded: used >= LIMITS.guard,
      blobs: n('SELECT COUNT(*) AS n FROM blobs'),
      kept: n("SELECT COUNT(*) AS n FROM drafts WHERE state = 'kept'"),
      open: n("SELECT COUNT(*) AS n FROM drafts WHERE state != 'kept'"),
      today: n('SELECT COUNT(*) AS n FROM opened WHERE at > ?', this.now() - 86400_000),
      keptBytes: n("SELECT COALESCE(SUM(bytes), 0) AS n FROM blobs WHERE hash IN (SELECT f.hash FROM files f JOIN drafts d ON d.id = f.draft_id WHERE d.state = 'kept')"),
    };
  }

  private draft(id: string) { return DRAFT_ID.test(id) ? (this.db.prepare('SELECT * FROM drafts WHERE id = ?').get(id) as DraftRow | undefined) : undefined; }
  private files(id: string) { return this.db.prepare('SELECT * FROM files WHERE draft_id = ? ORDER BY kind, name').all(id) as FileRow[]; }
  /** the distinct blobs a draft points at, and their bytes (a blob used twice counts once) */
  private footprint(id: string, kind?: Kind) {
    const q = kind ? 'SELECT COUNT(*) AS n, COALESCE(SUM(b.bytes), 0) AS bytes FROM (SELECT DISTINCT hash FROM files WHERE draft_id = ? AND kind = ?) f JOIN blobs b ON b.hash = f.hash'
      : 'SELECT COUNT(*) AS n, COALESCE(SUM(b.bytes), 0) AS bytes FROM (SELECT DISTINCT hash FROM files WHERE draft_id = ?) f JOIN blobs b ON b.hash = f.hash';
    return (kind ? this.db.prepare(q).get(id, kind) : this.db.prepare(q).get(id)) as { n: number; bytes: number };
  }

  /** The draft, when the token is its token. */
  auth(id: string, token: string | null | undefined): DraftRow | null {
    const d = this.draft(id); if (!d || !token) return null;
    const a = Buffer.from(sha(token), 'hex'), b = Buffer.from(d.token_hash, 'hex');
    return a.length === b.length && timingSafeEqual(a, b) ? d : null;
  }

  /**
   * Open a draft for a pack (the builder's output, or a creator's). The server gates it here; a refused pack opens
   * nothing. `parent`: the kept world a Mog remixes. Its city is locked by the gate, and its people whose sheets are
   * unchanged keep their GLBs, its lines unchanged in unchanged voices keep their clips (same blobs, no bytes).
   */
  open(input: unknown, opts: { parent?: string | null } = {}): { ok: true; id: string; token: string; warnings: string[]; inherited: number } | (Fail & { problems?: string[] }) {
    this.sweep();
    const t = this.now();
    if (this.used() >= LIMITS.guard) return fail(507, STORE_FULL);
    const open = (this.db.prepare("SELECT COUNT(*) AS n FROM drafts WHERE state != 'kept'").get() as { n: number }).n;
    if (open >= LIMITS.open) return fail(429, 'Too many worlds are being made right now. Try again later.');
    const today = (this.db.prepare('SELECT COUNT(*) AS n FROM opened WHERE at > ?').get(t - 86400_000) as { n: number }).n;
    if (today >= LIMITS.perDay) return fail(429, 'The Story Kit has made all the worlds it can today.');
    let parent: DraftRow | undefined;
    if (opts.parent) { parent = this.draft(opts.parent); if (!parent || parent.state !== 'kept') return fail(404, 'No published world to remix.'); }
    const parentPack = parent ? JSON.parse(parent.pack) : null;
    const g = gatePack(input, { parent: parentPack });
    if (!g.ok || !g.pack) return { ...fail(422, 'The story pack was refused.'), problems: g.problems };

    const id = randomUUID(), token = randomBytes(24).toString('base64url');
    let inherited = 0;
    this.db.exec('BEGIN');
    try {
      this.db.prepare('INSERT INTO drafts (id, token_hash, pack, parent, created_at, touched_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, sha(token), JSON.stringify(g.pack), parent?.id ?? null, t, t);
      this.db.prepare('INSERT INTO opened (at) VALUES (?)').run(t);
      this.db.prepare('DELETE FROM opened WHERE at < ?').run(t - 86400_000);
      if (parent) {
        const sheet = (p: any) => new Map<string, string>((p.cast || []).filter((c: any) => c.sheet).map((c: any) => [c.id, stable(c.sheet)]));
        const was = sheet(parentPack), now = sheet(g.pack);
        const clips = new Set(voicePlanOf(g.pack, '').lines.map((l: any) => l.clip));
        const ins = this.db.prepare('INSERT INTO files (draft_id, kind, name, hash, ext, bytes, meta, inherited, at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)');
        for (const f of this.files(parent.id)) {
          const keep = (f.kind === 'glb' && now.has(f.name) && now.get(f.name) === was.get(f.name)) || (f.kind === 'voice' && clips.has(f.name.replace(/\.(ogg|wav)$/, '')));
          if (keep) { ins.run(id, f.kind, f.name, f.hash, f.ext, f.bytes, f.meta, t); inherited++; }
        }
      }
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
    return { ok: true, id, token, warnings: g.warnings, inherited };
  }

  /**
   * Store one file of a draft: a forged person (glb, named by cast id), a voice clip (voice, <line hash>-<voice
   * key>.ogg|wav, a current line in its speaker's current voice), key art or a headshot (art: key-wide, key-square or
   * head-<cast id>, .jpg|.webp|.png). Replaces the draft's earlier file of that name.
   */
  put(d: DraftRow, kind: string, name: string, bytes: Uint8Array, meta: Record<string, unknown> = {}): { ok: true; file: { kind: Kind; name: string; hash: string; url: string; bytes: number; meta: unknown } } | Fail {
    this.sweep();
    if (!this.draft(d.id)) return fail(404, 'That draft no longer exists.');
    if (d.state === 'kept') return fail(409, 'A published world is not changed. Mog it instead.');
    const pack = JSON.parse(d.pack);
    let ext: string, max: number, total: number, count = Infinity, m: RegExpExecArray | null, keep: unknown = null;
    if (kind === 'glb') {
      if (!CAST_ID.test(name) || !pack.cast.some((c: any) => c.id === name && c.sheet)) return fail(404, `${name} is no one in this world with a sheet.`);
      ext = 'glb'; max = LIMITS.glb.each; total = LIMITS.glb.total;
    } else if (kind === 'voice') {
      if (!(m = CLIP.exec(name))) return fail(400, 'A clip is <line hash>-<voice key>.ogg or .wav.');
      const line = voicePlanOf(pack, '').lines.find((l: any) => l.clip === `${m![1]}-${m![2]}` && !l.rec);
      if (!line) return fail(409, `${m[1]}-${m[2]} is no line of this world in its speaker's current voice.`);
      ext = m[3]; max = LIMITS.voice.each; total = LIMITS.voice.total; count = LIMITS.voice.count;
      keep = { line: line.id, who: line.who, voice: line.voice, codec: ext === 'ogg' ? 'opus' : 'pcm16', secs: num(meta.secs, 0, 120), renderMs: num(meta.renderMs, 0, 6e5),
        encodeMs: num(meta.encodeMs, 0, 6e5), device: word(meta.device, /^(webgpu|wasm)$/), dtype: word(meta.dtype, /^(fp32|fp16|q8)$/) };
    } else if (kind === 'art') {
      if (!(m = ART.exec(name))) return fail(400, 'Art is key-wide, key-square or head-<cast id>, as .jpg, .webp or .png.');
      if (m[1].startsWith('head-') && !pack.cast.some((c: any) => c.id === m![1].slice(5))) return fail(404, `${m[1].slice(5)} is no one in this world.`);
      ext = m[2]; max = LIMITS.art.each; total = LIMITS.art.total; count = LIMITS.art.count;
    } else return fail(400, 'A file is a glb, a voice clip or art.');
    if (!(bytes instanceof Uint8Array) || bytes.length < 16) return fail(400, 'The file is empty.');
    if (bytes.length > max) return fail(413, `A ${kind} file is at most ${max / KB >= 1024 ? `${max / MB} MB` : `${max / KB} KB`}.`);
    const bad = kind === 'glb' ? checkGlb(bytes) : checkMagic(ext, bytes);
    if (bad) return fail(415, `${name}: ${bad}.`);

    const hash = sha(bytes), t = this.now();
    const known = this.db.prepare('SELECT bytes FROM blobs WHERE hash = ?').get(hash) as { bytes: number } | undefined;
    // what this file replaces: the same name, the same line or art in another format, and a frozen world pack
    const stem = name.replace(/\.[a-z]+$/, '');
    const replaced = (this.db.prepare("SELECT hash FROM files WHERE draft_id = ? AND ((kind = ? AND (name = ? OR name GLOB ?)) OR kind = 'pack')").all(d.id, kind, name, `${stem}.*`) as { hash: string }[]).map((r) => r.hash);
    // the limits, as they would be after this file: what it replaces no longer counts (unless another name uses it)
    const notReplaced = "NOT ((kind = ? AND (name = ? OR name GLOB ?)) OR kind = 'pack')", rep = [kind, name, `${stem}.*`];
    const others = (k?: Kind) => (this.db.prepare(`SELECT COALESCE(SUM(b.bytes), 0) AS bytes FROM (SELECT DISTINCT hash FROM files WHERE draft_id = ? ${k ? 'AND kind = ?' : ''} AND ${notReplaced}) f JOIN blobs b ON b.hash = f.hash`)
      .get(...(k ? [d.id, k, ...rep] : [d.id, ...rep])) as { bytes: number }).bytes;
    const usedHere = (k?: Kind) => !!this.db.prepare(`SELECT 1 FROM files WHERE draft_id = ? AND hash = ? ${k ? 'AND kind = ?' : ''} AND ${notReplaced} LIMIT 1`).get(...(k ? [d.id, hash, k, ...rep] : [d.id, hash, ...rep]));
    const nameCount = (this.db.prepare(`SELECT COUNT(*) AS n FROM files WHERE draft_id = ? AND kind = ? AND ${notReplaced}`).get(d.id, kind, ...rep) as { n: number }).n;
    if (nameCount + 1 > count) return fail(413, `A world has at most ${count} ${kind} files.`);
    if (others(kind as Kind) + (usedHere(kind as Kind) ? 0 : bytes.length) > total) return fail(413, `A world's ${kind} files are at most ${total / MB} MB in all.`);
    if (others() + (usedHere() ? 0 : bytes.length) > LIMITS.world) return fail(413, `A world is at most ${LIMITS.world / MB} MB in all.`);
    if (!known && this.used() + bytes.length > LIMITS.disk) return fail(507, 'The Story Kit store is full. Try again later.');

    if (!known) {
      const f = this.blobPath(hash, ext); mkdirSync(path.dirname(f), { recursive: true });
      const tmp = `${f}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
      writeFileSync(tmp, bytes); renameSync(tmp, f);
    }
    this.db.exec('BEGIN');
    try {
      if (!known) this.db.prepare('INSERT OR IGNORE INTO blobs (hash, ext, bytes, at) VALUES (?, ?, ?, ?)').run(hash, ext, bytes.length, t);
      // a clip re-rendered as WAV after an Ogg (or back) is the same line, and art the same picture: one file per stem
      if (kind !== 'glb') this.db.prepare('DELETE FROM files WHERE draft_id = ? AND kind = ? AND name GLOB ?').run(d.id, kind, `${stem}.*`);
      // a change unseals the world: its frozen pack no longer says what is stored
      this.db.prepare("DELETE FROM files WHERE draft_id = ? AND kind = 'pack'").run(d.id);
      this.db.prepare('INSERT OR REPLACE INTO files (draft_id, kind, name, hash, ext, bytes, meta, inherited, at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)')
        .run(d.id, kind, name, hash, ext, bytes.length, keep == null ? null : JSON.stringify(keep), t);
      this.db.prepare("UPDATE drafts SET touched_at = ?, state = 'draft', world = NULL WHERE id = ?").run(t, d.id);
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
    this.collect(replaced.filter((h) => h !== hash));
    return { ok: true, file: { kind: kind as Kind, name, hash, url: blobUrl(hash, ext), bytes: bytes.length, meta: keep } };
  }

  /**
   * The world as the engine plays it (the runner's pack, storykit/pack/gate.ts toRunnerPack): each person with a
   * stored GLB is drawn with it (the others are stand-ins), every stored clip is listed in the voice plan's own `clips`
   * by its content-hashed URL (lines without one stay subtitles), and the art by name.
   */
  world(id: string): Record<string, unknown> | null {
    const d = this.draft(id); if (!d) return null;
    const pack = JSON.parse(d.pack), files = this.files(id);
    const cast: Record<string, string> = {}, art: Record<string, string> = {}, clips: Record<string, unknown> = {};
    for (const f of files) {
      const url = blobUrl(f.hash, f.ext);
      if (f.kind === 'glb') cast[f.name] = url;
      else if (f.kind === 'art') art[f.name.replace(/\.[a-z]+$/, '')] = url;
      else if (f.kind === 'voice') { const base = f.name.replace(/\.(ogg|wav)$/, ''); clips[base] = { file: f.name, url, bytes: f.bytes, ...(f.meta ? JSON.parse(f.meta) : {}) }; }
    }
    const voice: Record<string, unknown> = { ...voicePlanOf(pack, ''), clips };
    return { ...toRunnerPack(pack, { cast, clips: 'cast/cast-clips.glb' }), voice, ...(Object.keys(art).length ? { art } : {}) };
  }

  /** What the creator's page shows: every file, what is missing, the bytes against the limits. */
  status(d: DraftRow) {
    const pack = JSON.parse(d.pack), files = this.files(d.id);
    const has = (k: Kind, n: string) => files.some((f) => f.kind === k && f.name.replace(/\.[a-z]+$/, '') === n);
    const lines = voicePlanOf(pack, '').lines;
    return {
      id: d.id, state: d.state, parent: d.parent, title: pack.title, city: pack.base?.city,
      world: d.world ? blobUrl(d.world, 'json') : null,
      files: files.map((f) => ({ kind: f.kind, name: f.name, url: blobUrl(f.hash, f.ext), bytes: f.bytes, inherited: !!f.inherited })),
      missing: {
        glb: pack.cast.filter((c: any) => c.sheet && !has('glb', c.id)).map((c: any) => c.id),
        voice: lines.filter((l: any) => !l.rec && !has('voice', l.clip)).map((l: any) => l.clip),
      },
      bytes: { glb: this.footprint(d.id, 'glb').bytes, voice: this.footprint(d.id, 'voice').bytes, art: this.footprint(d.id, 'art').bytes, world: this.footprint(d.id).bytes },
      limits: { glb: LIMITS.glb, voice: LIMITS.voice, art: LIMITS.art, world: LIMITS.world },
      expires: d.state === 'kept' ? null : d.touched_at + LIMITS.ttlMs,
    };
  }

  /** Freeze the world as it is now: its runner pack becomes a content-hashed .json (what a published world plays). */
  seal(d: DraftRow): { ok: true; url: string; hash: string; bytes: number } | Fail {
    if (d.state === 'kept' && d.world) return { ok: true, url: blobUrl(d.world, 'json'), hash: d.world, bytes: (this.db.prepare('SELECT bytes FROM blobs WHERE hash = ?').get(d.world) as { bytes: number }).bytes };
    const body = new TextEncoder().encode(JSON.stringify(this.world(d.id)));
    if (body.length > 4 * LIMITS.pack) return fail(413, 'The built world is too large.');
    const hash = sha(body), t = this.now();
    if (!this.db.prepare('SELECT 1 FROM blobs WHERE hash = ?').get(hash)) {
      if (this.used() + body.length > LIMITS.disk) return fail(507, 'The Story Kit store is full. Try again later.');
      const f = this.blobPath(hash, 'json'); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, body);
      this.db.prepare('INSERT OR IGNORE INTO blobs (hash, ext, bytes, at) VALUES (?, ?, ?, ?)').run(hash, 'json', body.length, t);
    }
    const old = d.world;
    this.db.prepare("INSERT OR REPLACE INTO files (draft_id, kind, name, hash, ext, bytes, meta, inherited, at) VALUES (?, 'pack', 'world.json', ?, 'json', ?, NULL, 0, ?)").run(d.id, hash, body.length, t);
    this.db.prepare("UPDATE drafts SET world = ?, state = CASE state WHEN 'kept' THEN 'kept' ELSE 'sealed' END, touched_at = ? WHERE id = ?").run(hash, t, d.id);
    if (old && old !== hash) this.collect([old]);
    return { ok: true, url: blobUrl(hash, 'json'), hash, bytes: body.length };
  }

  /** Publishing: a kept world is never swept (the publish route calls this with the game it became). */
  keep(id: string, gameId: string): boolean {
    const d = this.draft(id); if (!d) return false;
    if (!d.world) { const s = this.seal(d); if (!s.ok) return false; }
    return this.db.prepare("UPDATE drafts SET state = 'kept', game_id = ? WHERE id = ?").run(gameId, id).changes > 0;
  }
  /** A game taken down: its world goes back to being a draft, swept after the usual time unless kept again. */
  release(id: string): boolean {
    return this.db.prepare("UPDATE drafts SET state = 'draft', game_id = NULL, touched_at = ? WHERE id = ? AND state = 'kept'").run(this.now(), id).changes > 0;
  }

  /**
   * The owner's patch of a published (kept) world (app/api/storykit/admin/patch/route.ts, lib/storykit-publish.ts
   * patchStoryWorld): a new runner world in place of its sealed one, with the new clips it plays. Nothing changes
   * unless all of it holds:
   *   - `from`: the world the game plays now is this draft's sealed world (no patch over a patch the caller never saw);
   *   - `world`: the same world (its id), a runner world (storykit: 1), no larger than a sealed world may be;
   *   - `opening` (story-pack form, when given; null takes it out): the draft's own pack with it gates (rule 14, and the
   *     city lock against its parent for a Mog), and the world's opening is exactly what that pack makes of it
   *     (toRunnerPack), its voice plan's speakers and lines exactly the pack's (voicePlanOf);
   *   - `world.cast`: the world's cast as it was, but for a new body (`glb`) of a person who has a forged one (a cast
   *     member with a sheet, under the same name): nothing else of a person changes, and no one comes or goes;
   *   - `files`: voice clips the world's voice plan lists (voice.clips: <line hash>-<voice key>, a line of the world in
   *     its speaker's voice), each a real Ogg or WAV under the clip limit, and GLBs, each a real glTF 2.0 binary under
   *     the per-person cap that is a cast member's new body (world.cast[name].glb); each named in the world by its
   *     SHA-256;
   *   - every /storykit/f/ file the world names is stored (or sent), and all of it is within a world's limits.
   * Then the clips and bodies become the draft's (as files the creator's browser stored: a Mog of the world carries
   * them), the draft's pack takes the opening (a Mog keeps it), and the world is sealed as sent. The world it replaces
   * stays (a `was-<sha256>.json` row of the draft, never swept), and so does every file it names that the draft no
   * longer holds (a `was-<sha256>.<ext>` row: a replaced body), so patching back to it is a patch with that world.
   */
  patch(id: string, input: { world: unknown; files?: { ext: string; bytes: Uint8Array }[]; opening?: unknown; from?: string | null }):
    { ok: true; hash: string; url: string; bytes: number; was: string | null; clips: number; stored: number; bodies: number; worldBytes: number } | (Fail & { problems?: string[] }) {
    const d = this.draft(id);
    if (!d || d.state !== 'kept' || !d.world) return fail(404, 'No published story world to patch.');
    if (input.from !== undefined && input.from !== d.world) return fail(409, `The game plays ${input.from ?? 'no world'}, but its store draft is sealed as ${d.world}. Nothing was changed.`);
    const w = input.world as Record<string, any>;
    if (!w || typeof w !== 'object' || Array.isArray(w) || w.storykit !== 1) return fail(400, 'world: a runner world (storykit: 1).');
    const body = new TextEncoder().encode(JSON.stringify(w));
    if (body.length > 4 * LIMITS.pack) return fail(413, 'The world is too large.');
    const old = this.read(`${d.world}.json`);
    const was = old ? JSON.parse(old.bytes.toString('utf8')) : null;
    if (!was || w.id !== was.id) return fail(422, `world: it is another world (${String(w.id)}), not ${was?.id ?? 'this one'}.`);

    // the pack: the draft's own, with the opening when one is sent (null: none), gated as a pack is when it opens
    const problems: string[] = [];
    const pack = JSON.parse(d.pack);
    if ('opening' in input && input.opening !== undefined) { if (input.opening === null) delete pack.opening; else pack.opening = input.opening; }
    const parent = d.parent ? this.draft(d.parent) : undefined;
    const g = gatePack(pack, { parent: parent ? JSON.parse(parent.pack) : null });
    if (!g.ok || !g.pack) return { ...fail(422, 'The pack with this opening was refused.'), problems: g.problems };
    const made = toRunnerPack(g.pack), plan = voicePlanOf(g.pack, '');
    if (stable(w.opening ?? null) !== stable(made.opening ?? null)) problems.push(w.opening && !g.pack.opening ? 'world.opening: send the same opening in story-pack form (opening) so the pack is gated with it.' : 'world.opening: it is not the opening the pack makes (toRunnerPack).');
    if (stable(w.voice?.cast ?? null) !== stable(plan.cast)) problems.push('world.voice.cast: not the pack\'s speakers and voices (voicePlanOf).');
    if (stable(w.voice?.lines ?? null) !== stable(plan.lines)) problems.push('world.voice.lines: not the pack\'s lines (voicePlanOf).');

    // the cast: as it was, but for a new body of a person with a forged one (a cast member with a sheet, same name)
    const forged = new Map<string, string>();   // display name -> cast id, for the pack's people with a sheet
    const marks = Object.fromEntries(g.pack.cast.filter((c: any) => c.sheet).map((c: any) => [c.id, `@${c.id}`]));
    for (const [n, c] of Object.entries(toRunnerPack(g.pack, { cast: marks }).cast as Record<string, any>)) if (typeof c?.glb === 'string' && c.glb.startsWith('@')) forged.set(n, c.glb.slice(1));
    const bodies = new Map<string, { who: string; hash: string }>();   // cast id -> its new body
    const wc = (w.cast ?? {}) as Record<string, any>, oc = (was.cast ?? {}) as Record<string, any>;
    if (!w.cast || typeof w.cast !== 'object' || Array.isArray(w.cast)) problems.push('world.cast: the world\'s people, by name.');
    else for (const n of new Set([...Object.keys(oc), ...Object.keys(wc)])) {
      if (stable(wc[n] ?? null) === stable(oc[n] ?? null)) continue;
      const m = typeof wc[n]?.glb === 'string' ? BLOB_REF.exec(wc[n].glb) : null;
      if (!oc[n] || !wc[n] || !forged.has(n) || typeof oc[n].glb !== 'string' || !m || m[2] !== 'glb' || stable({ ...wc[n], glb: oc[n].glb }) !== stable(oc[n])) {
        problems.push(`world.cast.${n}: only a new body (glb, /storykit/f/<sha256>.glb) of a person with a forged one may change.`); continue;
      }
      bodies.set(forged.get(n)!, { who: n, hash: m[1] });
    }
    const newBodies = new Set([...bodies.values()].map((b) => b.hash));

    // the files sent: voice clips and new bodies only, real, within the limits, by their SHA-256
    const sent = new Map<string, { ext: string; bytes: Uint8Array }>();
    for (const [i, f] of (input.files ?? []).entries()) {
      if (!f || !/^(ogg|wav|glb)$/.test(f.ext) || !(f.bytes instanceof Uint8Array)) { problems.push(`files[${i}]: a voice clip (.ogg or .wav) or a person's body (.glb).`); continue; }
      const max = f.ext === 'glb' ? LIMITS.glb.each : LIMITS.voice.each;
      if (f.bytes.length < 16 || f.bytes.length > max) { problems.push(`files[${i}]: a ${f.ext === 'glb' ? 'body' : 'clip'} is 16 bytes to ${max / MB} MB.`); continue; }
      const bad = f.ext === 'glb' ? checkGlb(f.bytes) : checkMagic(f.ext, f.bytes); if (bad) { problems.push(`files[${i}]: ${bad}.`); continue; }
      const h = sha(f.bytes);
      if (f.ext === 'glb' && !newBodies.has(h)) { problems.push(`files[${i}]: a sent glb (${h.slice(0, 12)}…) is no cast member's new body (world.cast[name].glb).`); continue; }
      sent.set(h, f);
    }
    // the voice plan's clips: each a line of the world, its file named by its line, its url a clip of its own format
    const lineClips = new Set(plan.lines.map((l: any) => l.clip));
    const clips = Object.entries((w.voice?.clips ?? {}) as Record<string, any>);
    for (const [base, c] of clips) {
      const m = c?.url ? BLOB_REF.exec(c.url) : null;
      if (!lineClips.has(base)) problems.push(`world.voice.clips.${base}: no line of the world in its speaker's voice.`);
      if (!m || !/^(ogg|wav)$/.test(m[2]) || c.file !== `${base}.${m[2]}`) problems.push(`world.voice.clips.${base}: its file is ${base}.<ogg|wav> at /storykit/f/<sha256>.<same ext>.`);
    }
    // every file the world names: stored already, or sent; nothing sent that it does not name
    const refs = new Map<string, string>();
    for (const m of JSON.stringify(w).matchAll(/\/storykit\/f\/([0-9a-f]{64})\.([a-z]{3,4})/g)) refs.set(m[1], m[2]);
    let total = body.length, voice = 0, nVoice = 0, glb = 0;
    for (const [h, ext] of refs) {
      const known = this.db.prepare('SELECT ext, bytes FROM blobs WHERE hash = ?').get(h) as { ext: string; bytes: number } | undefined;
      const s = sent.get(h), bytes = known?.bytes ?? s?.bytes.length;
      if (known ? known.ext !== ext : !s || s.ext !== ext) { problems.push(`/storykit/f/${h}.${ext}: not stored, and not sent.`); continue; }
      total += bytes!; if (ext === 'ogg' || ext === 'wav') { voice += bytes!; nVoice++; } else if (ext === 'glb') glb += bytes!;
    }
    for (const h of sent.keys()) if (!refs.has(h)) problems.push(`a sent ${sent.get(h)!.ext} (${h.slice(0, 12)}…) is not named by the world.`);
    if (total > LIMITS.world) problems.push(`A world is at most ${LIMITS.world / MB} MB in all (this one: ${(total / MB).toFixed(1)} MB).`);
    if (voice > LIMITS.voice.total || nVoice > LIMITS.voice.count) problems.push(`A world's clips are at most ${LIMITS.voice.count} and ${LIMITS.voice.total / MB} MB in all.`);
    if (glb > LIMITS.glb.total) problems.push(`A world's bodies are at most ${LIMITS.glb.total / MB} MB in all.`);
    if (problems.length) return { ...fail(422, 'The patch was refused. Nothing was changed.'), problems };
    const fresh = [...sent].filter(([h]) => !this.db.prepare('SELECT 1 FROM blobs WHERE hash = ?').get(h));
    const hash = sha(body), t = this.now();
    const add = fresh.reduce((n, [, f]) => n + f.bytes.length, 0) + (this.db.prepare('SELECT 1 FROM blobs WHERE hash = ?').get(hash) ? 0 : body.length);
    if (this.used() + add > LIMITS.disk) return fail(507, 'The Story Kit store is full.');

    // write: the new blobs, then (one transaction) the clips, the pack, the sealed world and the one it replaces
    const write = (h: string, ext: string, b: Uint8Array) => {
      const f = this.blobPath(h, ext); mkdirSync(path.dirname(f), { recursive: true });
      const tmp = `${f}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`; writeFileSync(tmp, b); renameSync(tmp, f);
    };
    for (const [h, f] of fresh) write(h, f.ext, f.bytes);
    const newWorld = !this.db.prepare('SELECT 1 FROM blobs WHERE hash = ?').get(hash);
    if (newWorld) write(hash, 'json', body);
    const prior = d.world;
    let stored = 0;
    this.db.exec('BEGIN');
    try {
      const blob = this.db.prepare('INSERT OR IGNORE INTO blobs (hash, ext, bytes, at) VALUES (?, ?, ?, ?)');
      for (const [h, f] of fresh) blob.run(h, f.ext, f.bytes.length, t);
      if (newWorld) blob.run(hash, 'json', body.length, t);
      const file = this.db.prepare('INSERT OR REPLACE INTO files (draft_id, kind, name, hash, ext, bytes, meta, inherited, at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)');
      for (const [base, c] of clips) {
        const m = BLOB_REF.exec(c.url)!, h = m[1], ext = m[2];
        if (this.db.prepare("SELECT 1 FROM files WHERE draft_id = ? AND kind = 'voice' AND name = ? AND hash = ?").get(d.id, `${base}.${ext}`, h)) continue;
        const bytes = (this.db.prepare('SELECT bytes FROM blobs WHERE hash = ?').get(h) as { bytes: number }).bytes;
        const line = plan.lines.find((l: any) => l.clip === base) as any;
        const meta = { line: line.id, who: line.who, voice: line.voice, codec: ext === 'ogg' ? 'opus' : 'pcm16', secs: num(c.secs, 0, 120), renderMs: num(c.renderMs, 0, 6e5),
          encodeMs: num(c.encodeMs, 0, 6e5), device: word(c.device, /^(webgpu|wasm)$/), dtype: word(c.dtype, /^(fp32|fp16|q8)$/) };
        this.db.prepare("DELETE FROM files WHERE draft_id = ? AND kind = 'voice' AND name GLOB ?").run(d.id, `${base}.*`);
        file.run(d.id, 'voice', `${base}.${ext}`, h, ext, bytes, JSON.stringify(meta), t); stored++;
      }
      // a new body: the draft's file for that person (a Mog of the world inherits it, its sheet unchanged)
      for (const [who, b] of bodies) {
        if (this.db.prepare("SELECT 1 FROM files WHERE draft_id = ? AND kind = 'glb' AND name = ? AND hash = ?").get(d.id, who, b.hash)) continue;
        const bytes = (this.db.prepare('SELECT bytes FROM blobs WHERE hash = ?').get(b.hash) as { bytes: number }).bytes;
        this.db.prepare("DELETE FROM files WHERE draft_id = ? AND kind = 'glb' AND name = ?").run(d.id, who);
        file.run(d.id, 'glb', who, b.hash, 'glb', bytes, null, t);
      }
      // the world it replaces is kept (patching back is a patch with it); the sealed world is world.json, as seal() writes
      if (prior !== hash) {
        const pb = (this.db.prepare('SELECT bytes FROM blobs WHERE hash = ?').get(prior) as { bytes: number } | undefined)?.bytes ?? 0;
        file.run(d.id, 'pack', `was-${prior}.json`, prior, 'json', pb, null, t);
        // and every file it names that the draft no longer holds (a replaced body or clip), so it still plays
        for (const m of (old!.bytes.toString('utf8')).matchAll(/\/storykit\/f\/([0-9a-f]{64})\.([a-z]{3,4})/g)) {
          if (this.db.prepare('SELECT 1 FROM files WHERE draft_id = ? AND hash = ? LIMIT 1').get(d.id, m[1])) continue;
          const kb = this.db.prepare('SELECT ext, bytes FROM blobs WHERE hash = ?').get(m[1]) as { ext: string; bytes: number } | undefined;
          if (kb && kb.ext === m[2]) file.run(d.id, 'pack', `was-${m[1]}.${m[2]}`, m[1], m[2], kb.bytes, null, t);
        }
      }
      this.db.prepare("DELETE FROM files WHERE draft_id = ? AND kind = 'pack' AND name = ?").run(d.id, `was-${hash}.json`);
      // a kept file the draft holds again (patching back) needs no was- row
      this.db.prepare("DELETE FROM files WHERE draft_id = ? AND kind = 'pack' AND name GLOB 'was-*' AND name NOT GLOB '*.json' AND hash IN (SELECT hash FROM files WHERE draft_id = ? AND kind != 'pack')").run(d.id, d.id);
      file.run(d.id, 'pack', 'world.json', hash, 'json', body.length, null, t);
      this.db.prepare('UPDATE drafts SET pack = ?, world = ?, touched_at = ? WHERE id = ?').run(JSON.stringify(g.pack), hash, t, d.id);
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
    return { ok: true, hash, url: blobUrl(hash, 'json'), bytes: body.length, was: prior, clips: clips.length, stored, bodies: bodies.size, worldBytes: total };
  }

  /** Abandon a draft now (the creator's DELETE): its rows go, then every blob nothing else points at. */
  abandon(d: DraftRow): { ok: true; freed: number } | Fail {
    if (d.state === 'kept') return fail(409, 'A published world is not deleted here.');
    const hashes = this.files(d.id).map((f) => f.hash);
    this.db.prepare('DELETE FROM drafts WHERE id = ?').run(d.id);
    return { ok: true, freed: this.collect(hashes) };
  }

  /** Remove abandoned drafts (not kept, untouched for the TTL) and every blob no draft points at. */
  sweep(force = false): { drafts: number; blobs: number; freed: number } {
    const t = this.now();
    if (!force && t - this.lastSweep < LIMITS.sweepEveryMs) return { drafts: 0, blobs: 0, freed: 0 };
    this.lastSweep = t;
    const gone = this.db.prepare("SELECT id FROM drafts WHERE state != 'kept' AND touched_at < ?").all(t - LIMITS.ttlMs) as { id: string }[];
    for (const g of gone) this.db.prepare('DELETE FROM drafts WHERE id = ?').run(g.id);
    const orphans = (this.db.prepare('SELECT hash FROM blobs WHERE hash NOT IN (SELECT hash FROM files)').all() as { hash: string }[]).map((r) => r.hash);
    const before = orphans.length, freed = this.collect(orphans);
    return { drafts: gone.length, blobs: before, freed };
  }

  /** Delete these blobs if no file points at them any more; the bytes freed. */
  private collect(hashes: string[]): number {
    let freed = 0;
    for (const h of new Set(hashes)) {
      if (this.db.prepare('SELECT 1 FROM files WHERE hash = ? LIMIT 1').get(h)) continue;
      const b = this.db.prepare('SELECT ext, bytes FROM blobs WHERE hash = ?').get(h) as { ext: string; bytes: number } | undefined;
      if (!b) continue;
      rmSync(this.blobPath(h, b.ext), { force: true });
      this.db.prepare('DELETE FROM blobs WHERE hash = ?').run(h);
      freed += b.bytes;
    }
    return freed;
  }

  /** A stored blob by its served name (<sha256>.<ext>), or null. Only blobs a draft points at are in the table. */
  read(file: string): { bytes: Buffer; type: string; hash: string } | null {
    const m = BLOB_FILE.exec(file); if (!m) return null;
    const b = this.db.prepare('SELECT ext FROM blobs WHERE hash = ?').get(m[1]) as { ext: string } | undefined;
    if (!b || b.ext !== m[2]) return null;
    const f = this.blobPath(m[1], m[2]); if (!existsSync(f)) return null;
    return { bytes: readFileSync(f), type: TYPES[m[2]], hash: m[1] };
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __storykitStore: StoryStore | undefined;
}
/** The store on GameMog's disk (data/storykit), opened once per process. */
export const storyStore = () => (globalThis.__storykitStore ??= new StoryStore(path.join(process.cwd(), 'data', 'storykit')));

/** A request's body, refused past `max` bytes (a stated length is checked first; the stream is cut when it lies). */
export async function readCapped(req: Request, max: number): Promise<Uint8Array | null> {
  const stated = Number(req.headers.get('content-length') || 0);
  if (stated > max) return null;
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader(), parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) { await reader.cancel().catch(() => {}); return null; }
    parts.push(value);
  }
  const out = new Uint8Array(n); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
/** The draft token, from `authorization: Bearer <token>` (never from the address). */
export const bearer = (req: Request) => { const h = req.headers.get('authorization') || ''; return h.startsWith('Bearer ') ? h.slice(7).trim() : null; };
