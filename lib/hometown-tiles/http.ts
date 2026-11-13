/**
 * Hometown hosting over HTTP (app/api/hometown/[...path], app/api/hometown/admin/[...path]): Web Request -> Response,
 * no Next import, so scripts/hometown-tiles-check.ts runs it as is.
 *
 * Public (HOMETOWN_TILES=on, else 404):
 *   GET|HEAD /api/hometown/tiles/{buildId}/hg1-{d}/0/{c}/{r}    a tile, the compiler's gzip bytes as stored
 *   GET|HEAD /api/hometown/manifests/{buildId}/{placeId}.json   the place's session descriptor + tile set
 *   GET|HEAD /api/hometown/builds/{buildId}.json                the build record
 *   GET      /api/hometown/places/{placeId}                     { status: 'built', buildId, manifest, lock } | 404
 *                                                               { status: 'not-built' } (the ask is queued for pre-warm)
 *   OPTIONS  any of them                                        204 (CORS preflight)
 * Versioned files are `public, max-age=31536000, immutable` with a strong ETag (If-None-Match: 304), served as
 * application/octet-stream with NO Content-Encoding (Mog City's wagmi/world/tiles-net.js gunzips a tile itself).
 * CORS: Mog City's origin only (https://mc.gamemog.com; outside production also http://localhost / 127.0.0.1 on any
 * port), `vary: origin`; any other origin gets no Access-Control-Allow-Origin. A key outside the grammar is 400.
 *
 * Admin (HOMETOWN_ADMIN_TOKEN set, else 404; Authorization: Bearer <token>, else 401):
 *   GET  /api/hometown/admin/status          usage, cap, free space, floor, builds, compile queue
 *   PUT  /api/hometown/admin/objects/{key}   upload one object (scripts/hometown-upload.ts), ifAbsent:
 *                                            tiles/ctx need x-content-sha256 = SHA-256 of the gunzipped bytes; a build
 *                                            record must hash to its own buildId; a manifest is taken only when every
 *                                            tile it lists is stored with its hash (so it goes last, and a half-uploaded
 *                                            place stays "not built"). 201 stored, 200 already there (same bytes), 409
 *                                            there with other bytes / incomplete, 400 tampered, 507 store full
 *   GET  /api/hometown/admin/gc              the GC plan: a DRY RUN, deletes nothing (?target_gb=1.5, ?keys=1)
 *   POST /api/hometown/admin/gc              { planId } from the dry run: applies that plan, refused if it changed
 *   GET  /api/hometown/admin/requests        the towns players asked for that are not built (pre-warm candidates)
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { BUILD_ID, FAMILIES, MAX_UPLOAD, PLACE_ID, PUBLIC, buildOfKey, contentType, manifestKey, maxUploadOf, parseKey, parseKeyString, tileKey, type Domain, type Family } from './keys.ts';
import { StoreFull, GB, type TileStore } from './store.ts';
import { planGc, applyGc } from './gc.ts';
import { gatherPins, type Pins } from './pins.ts';
import { CompileError, type createCompiler } from './compiler.ts';
import type { HometownConfig } from './config.ts';
import { TOWN_ID, storyLock, tilesIdOf, type ServiceLock } from '../hometown/ids.ts';
import { placeById } from '../places/search.ts';

export const IMMUTABLE = 'public, max-age=31536000, immutable, no-transform';
const SHORT = 'public, max-age=60';
const NO_STORE = 'no-store';

export type Deps = {
  cfg: HometownConfig; store: TileStore; compiler?: ReturnType<typeof createCompiler> | null; pins?: () => Pins; now?: () => number;
  /** called after an object is newly stored (the production builder derives a bundle's citypackage.json) */
  afterPut?: (key: string) => void;
};

const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const stable = (v: unknown): string => (Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`
    : JSON.stringify(v));

/** Mog City's origin, when the request is from it. */
export function allowedOrigin(origin: string | null, production: boolean): string | null {
  if (!origin) return null;
  if (origin === 'https://mc.gamemog.com') return origin;
  if (!production && /^http:\/\/(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$/.test(origin)) return origin;
  return null;
}
const cors = (req: Request, cfg: HometownConfig): Record<string, string> => {
  const o = allowedOrigin(req.headers.get('origin'), cfg.production);
  return o ? { 'access-control-allow-origin': o, 'access-control-expose-headers': 'etag, x-content-sha256', vary: 'origin' } : { vary: 'origin' };
};
const json = (req: Request, cfg: HometownConfig, status: number, body: unknown, cache = NO_STORE, extra: Record<string, string> = {}) =>
  new Response(req.method === 'HEAD' ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': cache, ...cors(req, cfg), ...extra } });
const notFound = () => new Response('Not found', { status: 404, headers: { 'cache-control': NO_STORE } });

/**
 * When each build was made: its build record's time (builds/<id>.json, stored once, ifAbsent, and never written again).
 * Without HOMETOWN_BUILD the "current" build was the one with the newest file, which a tile compiled or uploaded into
 * an older build on demand (or a re-uploaded manifest) moves: the record's time does not move.
 */
export function buildsBorn(store: TileStore): Map<string, number> {
  const born = new Map<string, number>();
  let names: string[] = [];
  try { names = readdirSync(path.join(store.root, 'builds')); } catch { return born; }
  for (const f of names) {
    const b = f.replace(/\.json$/, '');
    if (!f.endsWith('.json') || !BUILD_ID.test(b)) continue;
    try { born.set(b, statSync(path.join(store.root, 'builds', f)).mtimeMs); } catch { /* gone */ }
  }
  return born;
}

/** The build /places/{id} answers from: HOMETOWN_BUILD, else the newest build (by its record) holding that place's manifest. */
export function currentBuildFor(store: TileStore, cfg: HometownConfig, placeId: string): string | null {
  if (cfg.build) return store.has(manifestKey(cfg.build, placeId)) ? cfg.build : null;
  let best: string | null = null, at = -1;
  let builds: string[] = [];
  try { builds = readdirSync(path.join(store.root, 'manifests')).filter((b) => BUILD_ID.test(b)); } catch { return null; }
  const born = buildsBorn(store);
  for (const b of builds) {
    try { const m = statSync(store.file(manifestKey(b, placeId))).mtimeMs, t = born.get(b) ?? m; if (t > at || (t === at && best !== null && b > best)) { at = t; best = b; } } catch { /* not in this build */ }
  }
  return best;
}

/**
 * The builds never collected: HOMETOWN_BUILD; else, with no one build named, both the newest build by its record and
 * the one with the newest file (which used to be the only one kept), so an old build touched lately can never get the
 * new one collected. GC says which (currentFrom) and the owner should set HOMETOWN_BUILD.
 */
export function currentBuilds(store: TileStore, cfg: HometownConfig): string[] {
  if (cfg.build) return [cfg.build];
  const newest = new Map<string, number>();
  for (const e of store.list()) { const b = buildOfKey(e.key); if (b) newest.set(b, Math.max(newest.get(b) ?? 0, e.mtimeMs)); }
  const top = [...newest].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0]?.[0];
  const rec = [...buildsBorn(store)].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0]?.[0];
  return [...new Set([rec, top].filter((b): b is string => !!b))];
}
/** Where currentBuilds' answer comes from, for the GC's plan and the status page. */
export const currentFrom = (cfg: HometownConfig) => (cfg.build ? 'HOMETOWN_BUILD' : 'no HOMETOWN_BUILD: the newest build record and the build with the newest file are both kept');

/** A pre-warm ask worth keeping: a canonical town id (us-<GEOID>) the place search's gazetteer knows. */
export function askable(placeId: string): boolean {
  if (!TOWN_ID.test(placeId)) return false;
  try { return !!placeById(placeId); } catch { return false; }
}
const asked = new Map<string, number>();
function recordAsk(store: TileStore, placeId: string, now: number) {
  if ((asked.get(placeId) ?? 0) > now - 3600_000) return;
  asked.set(placeId, now);
  if (asked.size > 50_000) asked.clear();
  const f = store.statePath('requests.jsonl');
  try {
    let size = 0;
    try { size = statSync(f).size; } catch { /* first */ }
    if (size > 1024 * 1024) return;
    mkdirSync(path.dirname(f), { recursive: true });
    appendFileSync(f, `${JSON.stringify({ placeId, at: new Date(now).toISOString() })}\n`);
  } catch { /* a full disk: the ask is only a hint */ }
}

export async function publicResponse(req: Request, parts: string[], d: Deps): Promise<Response> {
  const { cfg, store } = d;
  if (!cfg.tiles) return notFound();
  if (req.method === 'OPTIONS') {
    const c = cors(req, cfg);
    return new Response(null, { status: 204, headers: { ...c, ...(c['access-control-allow-origin'] ? { 'access-control-allow-methods': 'GET, HEAD', 'access-control-max-age': '86400' } : {}) } });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(req, cfg, 405, { error: 'GET or HEAD only' });
  if (parts[0] === 'places' && parts.length === 2) {
    const placeId = parts[1];
    if (!PLACE_ID.test(placeId)) return json(req, cfg, 400, { error: 'bad place id' });
    const b = currentBuildFor(store, cfg, placeId);
    const got = b ? store.get(manifestKey(b, placeId)) : null;
    // (only a real US place is kept as a pre-warm ask: the grammar alone let any made-up id fill requests.jsonl)
    if (!b || !got) { if (askable(placeId)) recordAsk(store, placeId, (d.now ?? Date.now)()); return json(req, cfg, 404, { status: 'not-built', placeId }, SHORT); }
    const m = JSON.parse(got.body.toString('utf8'));
    return json(req, cfg, 200, { status: 'built', placeId, buildId: b, manifest: `/api/hometown/${manifestKey(b, placeId)}`, tileBase: '/api/hometown', tileSetHash: m.tileSetHash ?? null, tileCount: Array.isArray(m.tiles) ? m.tiles.length : null, lock: m.lock ?? null }, SHORT);
  }
  const k = parseKey(parts);
  if (!k || !PUBLIC.includes(k.family)) return json(req, cfg, 400, { error: 'not a hometown file' });
  let got = store.get(k.key);
  if (!got && k.family === 'tiles' && d.compiler && cfg.compile) {
    try {
      await d.compiler.compileTileBlock(k.buildId, k.domain as Domain, k.c!, k.r!);
      got = store.get(tileKey(k.buildId, k.domain as Domain, k.c!, k.r!));
    } catch (e) {
      if (e instanceof CompileError) return json(req, cfg, e.status, { error: e.message }, NO_STORE, e.retryAfter ? { 'retry-after': String(e.retryAfter) } : {});
      throw e;
    }
  }
  if (!got) return json(req, cfg, 404, { error: 'not built' }, SHORT);
  const headers: Record<string, string> = {
    'content-type': contentType(k.family), 'cache-control': IMMUTABLE, etag: got.etag, 'x-content-type-options': 'nosniff', ...cors(req, cfg),
  };
  const inm = req.headers.get('if-none-match');
  if (inm && inm.split(',').map((s) => s.trim().replace(/^W\//, '')).includes(got.etag)) return new Response(null, { status: 304, headers });
  headers['content-length'] = String(got.bytes);
  return new Response(req.method === 'HEAD' ? null : new Uint8Array(got.body), { status: 200, headers });
}

// ------------------------------------------------------------------------------------------------------------ admin
export function bearerMatches(req: Request, token: string | null): boolean {
  if (!token) return false;
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '');
  if (!m) return false;
  const h = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(h(m[1]), h(token));
}

async function readBody(req: Request, limit = MAX_UPLOAD): Promise<Buffer | null> {
  const n = Number(req.headers.get('content-length'));
  if (Number.isFinite(n) && n > limit) return null;
  const b = Buffer.from(await req.arrayBuffer());
  return b.length > limit ? null : b;
}

type Verdict = { ok: true } | { ok: false; status: number; error: string; missing?: number };
const bad = (status: number, error: string, missing?: number): Verdict => ({ ok: false, status, error, ...(missing != null ? { missing } : {}) });
const hex64 = (v: string | null): v is string => !!v && /^[0-9a-f]{64}$/.test(v);

/** A gzipped object whose gunzipped bytes start with `magic` and hash to x-content-sha256 (tiles, ctx, far). */
function verifyGz(body: Buffer, contentSha: string | null, magic: string, what: string): Verdict {
  if (!hex64(contentSha)) return bad(400, 'x-content-sha256 (the gunzipped bytes) is required');
  let raw: Buffer;
  try { raw = gunzipSync(body); } catch { return bad(400, 'not gzip'); }
  if (raw.subarray(0, 4).toString('latin1') !== magic) return bad(400, `not ${what}`);
  if (sha(raw) !== contentSha) return bad(400, 'content hash does not match x-content-sha256');
  return { ok: true };
}
/** A raw object hashing to x-content-sha256 (bundle files, src layers, DEM pieces). */
function verifyRaw(body: Buffer, contentSha: string | null): Verdict {
  if (!hex64(contentSha)) return bad(400, 'x-content-sha256 (the bytes) is required');
  return sha(body) === contentSha ? { ok: true } : bad(400, 'content hash does not match x-content-sha256');
}
const parseJson = (body: Buffer): Record<string, unknown> | null => { try { const j = JSON.parse(body.toString('utf8')); return j && typeof j === 'object' && !Array.isArray(j) ? j : null; } catch { return null; } };
/** A file list ({ files: { name: { sha256, bytes } } }) whose every entry is stored under `prefix` with those bytes. */
function listComplete(store: TileStore, prefix: string, files: unknown, self: string): Verdict {
  if (!files || typeof files !== 'object') return bad(400, 'files: { name: { sha256, bytes } }');
  let missing = 0, differ = 0, n = 0;
  for (const [name, e] of Object.entries(files as Record<string, { sha256?: unknown; bytes?: unknown }>)) {
    n++;
    if (name === self || !parseKeyString(`${prefix}/${name}`) || typeof e?.sha256 !== 'string') return bad(400, `bad file entry ${name.slice(0, 60)}`);
    const got = store.get(`${prefix}/${name}`);
    if (!got) { missing++; continue; }
    if (sha(got.body) !== e.sha256 || (e.bytes != null && e.bytes !== got.bytes)) differ++;
  }
  if (!n) return bad(400, 'an empty file list');
  if (differ) return bad(409, `${differ} stored file(s) differ from this list`);
  if (missing) return bad(409, `${missing} of its ${n} files are not uploaded yet (the list goes last)`, missing);
  return { ok: true };
}

/** Is this the object its key says it is? (an upload is checked before it is stored, forever) */
export function verifyObject(store: TileStore, key: string, body: Buffer, contentSha: string | null): Verdict {
  const k = parseKey(key.split('/'));
  if (!k) return bad(400, 'not a hometown key');
  if (body.length > maxUploadOf(k.family)) return bad(413, `over ${maxUploadOf(k.family)} bytes`);
  if (k.family === 'tiles') return verifyGz(body, contentSha, 'HTL1', 'an HTL1 tile');
  if (k.family === 'ctx') return verifyGz(body, contentSha, 'HTC1', 'an HTC1 context block');
  if (k.family === 'far') return verifyGz(body, contentSha, 'SFB1', 'an SFB1 far tile');
  if (k.family === 'dem') {
    if (k.file === 'meta.json') {
      const j = parseJson(body);
      if (!j || j.etag !== k.etag) return bad(400, 'a DEM meta.json names its own etag');
      return { ok: true };
    }
    return verifyRaw(body, contentSha);
  }
  if (k.family === 'src') {
    if (k.file!.endsWith('.parquet')) {
      if (body.length < 12 || body.subarray(0, 4).toString('latin1') !== 'PAR1' || body.subarray(-4).toString('latin1') !== 'PAR1') return bad(400, 'not a parquet file');
      return verifyRaw(body, contentSha);
    }
    const j = parseJson(body);
    if (!j) return bad(400, 'not JSON');
    if (k.file === 'region.json') {
      const ov = j.overture as { release?: unknown } | undefined;
      if (j.grid !== 'hg1' || j.domain !== k.domain || !Array.isArray(j.block) || j.block[0] !== k.c || j.block[1] !== k.r || ov?.release !== k.release) return bad(400, 'not this region\'s region.json');
      return verifyRaw(body, contentSha);
    }
    // files.json: every layer and region.json stored with its hash (so it goes last: a half-staged region is not staged)
    return listComplete(store, key.split('/').slice(0, 7).join('/'), j.files, 'files.json');
  }
  if (k.family === 'bundles') {
    const dir = key.split('/').slice(0, 5).join('/');
    if (k.file === 'citypackage.json') return bad(403, 'citypackage.json is written by this server from the bundle (never uploaded)');
    if (k.file === 'bundle.json') {
      const j = parseJson(body);
      if (!j || j.format !== 'hometown-bundle-files' || j.buildId !== k.buildId || j.placeId !== k.placeId || j.tilesId !== k.tilesId || j.variant !== k.variant) return bad(400, 'not this bundle\'s bundle.json');
      const files = j.files as Record<string, unknown> | undefined;
      for (const need of ['geodata.json', 'lock.json']) if (!files || !(need in files)) return bad(400, `a bundle lists ${need}`);
      return listComplete(store, dir, files, 'bundle.json');
    }
    const v = verifyRaw(body, contentSha);
    if (!v.ok) return v;
    if (k.file === 'lock.json') {
      const l = parseJson(body) as ServiceLock | null;
      if (!storyLock(l) || l!.place !== k.placeId || l!.buildId !== k.buildId || l!.tiles !== k.tilesId) return bad(400, 'not this bundle\'s lock (v2 or v3: its place, build and tiles)');
    }
    if (k.file === 'geodata.json') {
      const g = parseJson(body);
      if (!g || g.format !== 'hometown-bundle' || !g.PKG || !g.GEO) return bad(400, 'not a hometown bundle geodata.json');
    }
    return { ok: true };
  }
  const j = parseJson(body);
  if (!j) return bad(400, 'not JSON');
  if (k.family === 'builds') {
    if (j.format !== 'hometown-build' || typeof j.compilerVersion !== 'string' || j.grid !== 'hg1') return bad(400, 'not a hometown build record');
    const id = `htc-${j.compilerVersion}-hg1-b${sha(stable(j)).slice(0, 8)}`;
    if (id !== k.buildId) return bad(400, `the record hashes to ${id}, not ${k.buildId}`);
    return { ok: true };
  }
  if (k.family === 'frames') {
    // a frame: its own build and place, a lock v3 whose tiles is the hash of the build and its tile ids
    const lock = j.lock as ServiceLock | undefined, ids = j.tiles as unknown;
    if (j.format !== 'hometown-frame' || j.buildId !== k.buildId || j.placeId !== k.placeId || !Array.isArray(ids) || !ids.length || ids.some((t) => typeof t !== 'string' || !/^hg1-[a-z]+\/0\/[0-9]+\/[0-9]+$/.test(t))) return bad(400, 'not this place\'s frame in this build');
    if (!lock || storyLock(lock)?.formatVersion !== 3 || lock.place !== k.placeId || lock.buildId !== k.buildId) return bad(400, 'a frame carries its lock v3');
    if (lock.tiles !== tilesIdOf(k.buildId, ids as string[])) return bad(400, 'the frame\'s lock.tiles is not sha256(buildId + its sorted tile ids)');
    return { ok: true };
  }
  // a manifest: its own build and place, its tileSetHash, and every tile it lists already stored with its hash
  if (j.format !== 'hometown-session' || j.buildId !== k.buildId || j.placeId !== k.placeId || !Array.isArray(j.tiles)) return bad(400, 'not this place\'s session descriptor in this build');
  const tiles = j.tiles as { id: string; sha256: string }[];
  const lines = tiles.map((t) => `${t.id} ${t.sha256}\n`).sort().join('');
  if (typeof j.tileSetHash === 'string' && sha(lines) !== j.tileSetHash) return bad(400, 'tileSetHash does not match its tiles');
  if (!store.has(`builds/${k.buildId}.json`)) return bad(409, 'upload the build record first', 1);
  let missing = 0, differ = 0;
  for (const t of tiles) {
    const m = /^hg1-([a-z]+)\/0\/([0-9]+)\/([0-9]+)$/.exec(t.id);
    if (!m) return bad(400, `bad tile id ${String(t.id).slice(0, 40)}`);
    const got = store.get(tileKey(k.buildId, m[1] as Domain, Number(m[2]), Number(m[3])));
    if (!got) { missing++; continue; }
    try { if (sha(gunzipSync(got.body)) !== t.sha256) differ++; } catch { differ++; }
  }
  if (differ) return bad(409, `${differ} stored tile(s) differ from this descriptor`);
  if (missing) return bad(409, `${missing} of its ${tiles.length} tiles are not uploaded yet (the descriptor goes last)`, missing);
  return { ok: true };
}

/** What a PUT of an object answers, for the owner's token and a worker's alike (the token decides the families). */
export type PutResult = { status: number; body: Record<string, unknown> };
export async function putObject(req: Request, store: TileStore, key: string, families: Family[], afterPut?: (key: string) => void): Promise<PutResult> {
  const k = parseKeyString(key);
  if (!k) return { status: 400, body: { error: 'not a hometown key' } };
  if (!families.includes(k.family)) return { status: 403, body: { error: `this token may not upload ${k.family}` } };
  const body = await readBody(req, maxUploadOf(k.family));
  if (!body) return { status: 413, body: { error: `over ${maxUploadOf(k.family)} bytes` } };
  const v = verifyObject(store, key, body, req.headers.get('x-content-sha256'));
  if (!v.ok) return { status: v.status, body: { error: v.error, ...(v.missing != null ? { missing: v.missing } : {}) } };
  if (store.has(key)) {
    const had = store.get(key)!;
    return had.body.equals(body) ? { status: 200, body: { created: false, key } } : { status: 409, body: { error: 'stored with other bytes (objects never change)', key } };
  }
  const r = store.put(key, body);
  if (r.created) afterPut?.(key);
  return { status: r.created ? 201 : 200, body: { created: r.created, key } };
}

export async function adminResponse(req: Request, parts: string[], d: Deps): Promise<Response> {
  const { cfg, store } = d;
  if (!cfg.adminToken) return notFound();
  if (!bearerMatches(req, cfg.adminToken)) return json(req, cfg, 401, { error: 'unauthorized' });
  const now = (d.now ?? Date.now)();
  const pins = d.pins ?? (() => gatherPins(cfg.dataDir));
  try {
    if (req.method === 'GET' && parts[0] === 'status' && parts.length === 1) {
      const u = store.usage();
      const builds = new Map<string, { objects: number; bytes: number }>();
      for (const e of store.list()) { const b = buildOfKey(e.key) ?? e.key.split('/')[0]; const x = builds.get(b) ?? { objects: 0, bytes: 0 }; x.objects++; x.bytes += e.bytes; builds.set(b, x); }
      return json(req, cfg, 200, {
        tiles: cfg.tiles, compile: cfg.compile, store: store.describe(), usage: { ...u, usedGB: +(u.used / GB).toFixed(3), capGB: +(u.cap / GB).toFixed(3), freeGB: u.free == null ? null : +(u.free / GB).toFixed(3) },
        current: currentBuilds(store, cfg), currentFrom: currentFrom(cfg), builds: Object.fromEntries(builds), compiler: d.compiler ? { ...d.compiler.stats, waiting: d.compiler.waiting, active: d.compiler.active } : null,
      });
    }
    if (req.method === 'PUT' && parts[0] === 'objects' && parts.length > 1) {
      const r = await putObject(req, store, parts.slice(1).join('/'), FAMILIES, d.afterPut);
      return json(req, cfg, r.status, r.body);
    }
    if (parts[0] === 'gc' && parts.length === 1 && (req.method === 'GET' || req.method === 'POST')) {
      const url = new URL(req.url);
      const tg = url.searchParams.get('target_gb');
      // (a target that is not a number would compare false and plan to collect every unpinned build: refuse it)
      if (tg != null && tg !== '' && !(Number.isFinite(Number(tg)) && Number(tg) >= 0)) return json(req, cfg, 400, { error: 'target_gb is a number of GB, 0 or more' });
      const p = pins();
      const plan = planGc({ entries: store.list(), tmp: store.tmpFiles(), current: currentBuilds(store, cfg), currentFrom: currentFrom(cfg), pins: p.builds, pinsOk: p.ok, pinSources: [...p.sources, ...p.errors.map((e) => `ERROR ${e}`)], lastServed: store.lastServed(), targetBytes: tg != null && tg !== '' ? Number(tg) * GB : null, now, srcCapBytes: cfg.srcCapBytes });
      const view = (pl: typeof plan) => ({ ...pl, pinned: [...p.builds].sort(), delete: { ...pl.delete, keys: url.searchParams.get('keys') === '1' ? pl.delete.keys : pl.delete.keys.length }, tmp: { ...pl.tmp, keys: pl.tmp.keys.length } });
      if (req.method === 'GET') return json(req, cfg, 200, { dryRun: true, ...view(plan) });
      let planId = '';
      try { planId = String(((await req.json()) as { planId?: unknown }).planId ?? ''); } catch { /* none */ }
      if (!planId) return json(req, cfg, 400, { error: 'POST { planId } from GET /api/hometown/admin/gc (the dry run)' });
      try { return json(req, cfg, 200, { applied: true, planId, ...applyGc(store, plan, planId) }); } catch (e) { return json(req, cfg, 409, { error: (e as Error).message }); }
    }
    if (req.method === 'GET' && parts[0] === 'requests' && parts.length === 1) {
      let lines: string[] = [];
      try { lines = readFileSync(store.statePath('requests.jsonl'), 'utf8').split('\n').filter(Boolean); } catch { /* none yet */ }
      const n = new Map<string, number>();
      for (const l of lines) { try { const id = JSON.parse(l).placeId; n.set(id, (n.get(id) ?? 0) + 1); } catch { /* torn line */ } }
      return json(req, cfg, 200, { asks: lines.length, places: [...n].sort((a, b) => b[1] - a[1]).slice(0, 500).map(([placeId, count]) => ({ placeId, count })) });
    }
    return json(req, cfg, 404, { error: 'not found' });
  } catch (e) {
    if (e instanceof StoreFull) return json(req, cfg, 507, { error: e.message, why: e.why });
    throw e;
  }
}
