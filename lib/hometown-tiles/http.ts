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
import { BUILD_ID, PLACE_ID, PUBLIC, contentType, manifestKey, parseKey, tileKey, type Domain } from './keys.ts';
import { StoreFull, GB, type TileStore } from './store.ts';
import { planGc, applyGc } from './gc.ts';
import { gatherPins, type Pins } from './pins.ts';
import { CompileError, type createCompiler } from './compiler.ts';
import type { HometownConfig } from './config.ts';

export const IMMUTABLE = 'public, max-age=31536000, immutable, no-transform';
const SHORT = 'public, max-age=60';
const NO_STORE = 'no-store';
const MAX_UPLOAD = 16 * 1024 * 1024;

export type Deps = { cfg: HometownConfig; store: TileStore; compiler?: ReturnType<typeof createCompiler> | null; pins?: () => Pins; now?: () => number };

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

/** The build /places/{id} answers from: HOMETOWN_BUILD, else the newest build holding that place's manifest. */
export function currentBuildFor(store: TileStore, cfg: HometownConfig, placeId: string): string | null {
  if (cfg.build) return store.has(manifestKey(cfg.build, placeId)) ? cfg.build : null;
  let best: string | null = null, at = -1;
  let builds: string[] = [];
  try { builds = readdirSync(path.join(store.root, 'manifests')).filter((b) => BUILD_ID.test(b)); } catch { return null; }
  for (const b of builds) {
    try { const t = statSync(store.file(manifestKey(b, placeId))).mtimeMs; if (t > at) { at = t; best = b; } } catch { /* not in this build */ }
  }
  return best;
}

/** The builds never collected: HOMETOWN_BUILD, else the newest build in the store (by its newest file). */
export function currentBuilds(store: TileStore, cfg: HometownConfig): string[] {
  if (cfg.build) return [cfg.build];
  const newest = new Map<string, number>();
  for (const e of store.list()) { const b = e.key.split('/')[1].replace(/\.json$/, ''); newest.set(b, Math.max(newest.get(b) ?? 0, e.mtimeMs)); }
  const top = [...newest].sort((a, b) => b[1] - a[1])[0];
  return top ? [top[0]] : [];
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
    if (!b || !got) { recordAsk(store, placeId, (d.now ?? Date.now)()); return json(req, cfg, 404, { status: 'not-built', placeId }, SHORT); }
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

async function readBody(req: Request): Promise<Buffer | null> {
  const n = Number(req.headers.get('content-length'));
  if (Number.isFinite(n) && n > MAX_UPLOAD) return null;
  const b = Buffer.from(await req.arrayBuffer());
  return b.length > MAX_UPLOAD ? null : b;
}

type Verdict = { ok: true } | { ok: false; status: number; error: string; missing?: number };

/** Is this the object its key says it is? (an upload is checked before it is stored, forever) */
export function verifyObject(store: TileStore, key: string, body: Buffer, contentSha: string | null): Verdict {
  const k = parseKey(key.split('/'));
  if (!k) return { ok: false, status: 400, error: 'not a hometown key' };
  if (k.family === 'tiles' || k.family === 'ctx') {
    if (!contentSha || !/^[0-9a-f]{64}$/.test(contentSha)) return { ok: false, status: 400, error: 'x-content-sha256 (the gunzipped bytes) is required' };
    let raw: Buffer;
    try { raw = gunzipSync(body); } catch { return { ok: false, status: 400, error: 'not gzip' }; }
    const magic = raw.subarray(0, 4).toString('latin1');
    if (magic !== (k.family === 'tiles' ? 'HTL1' : 'HTC1')) return { ok: false, status: 400, error: `not an ${k.family === 'tiles' ? 'HTL1 tile' : 'HTC1 context block'}` };
    if (sha(raw) !== contentSha) return { ok: false, status: 400, error: 'content hash does not match x-content-sha256' };
    return { ok: true };
  }
  let j: Record<string, unknown>;
  try { j = JSON.parse(body.toString('utf8')); } catch { return { ok: false, status: 400, error: 'not JSON' }; }
  if (k.family === 'builds') {
    if (j.format !== 'hometown-build' || typeof j.compilerVersion !== 'string' || j.grid !== 'hg1') return { ok: false, status: 400, error: 'not a hometown build record' };
    const id = `htc-${j.compilerVersion}-hg1-b${sha(stable(j)).slice(0, 8)}`;
    if (id !== k.buildId) return { ok: false, status: 400, error: `the record hashes to ${id}, not ${k.buildId}` };
    return { ok: true };
  }
  // a manifest: its own build and place, its tileSetHash, and every tile it lists already stored with its hash
  if (j.format !== 'hometown-session' || j.buildId !== k.buildId || j.placeId !== k.placeId || !Array.isArray(j.tiles)) return { ok: false, status: 400, error: 'not this place\'s session descriptor in this build' };
  const tiles = j.tiles as { id: string; sha256: string }[];
  const lines = tiles.map((t) => `${t.id} ${t.sha256}\n`).sort().join('');
  if (typeof j.tileSetHash === 'string' && sha(lines) !== j.tileSetHash) return { ok: false, status: 400, error: 'tileSetHash does not match its tiles' };
  if (!store.has(`builds/${k.buildId}.json`)) return { ok: false, status: 409, error: 'upload the build record first', missing: 1 };
  let missing = 0, bad = 0;
  for (const t of tiles) {
    const m = /^hg1-([a-z]+)\/0\/([0-9]+)\/([0-9]+)$/.exec(t.id);
    if (!m) return { ok: false, status: 400, error: `bad tile id ${String(t.id).slice(0, 40)}` };
    const got = store.get(tileKey(k.buildId, m[1] as Domain, Number(m[2]), Number(m[3])));
    if (!got) { missing++; continue; }
    try { if (sha(gunzipSync(got.body)) !== t.sha256) bad++; } catch { bad++; }
  }
  if (bad) return { ok: false, status: 409, error: `${bad} stored tile(s) differ from this descriptor` };
  if (missing) return { ok: false, status: 409, error: `${missing} of its ${tiles.length} tiles are not uploaded yet (the descriptor goes last)`, missing };
  return { ok: true };
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
      for (const e of store.list()) { const b = e.key.split('/')[1].replace(/\.json$/, ''); const x = builds.get(b) ?? { objects: 0, bytes: 0 }; x.objects++; x.bytes += e.bytes; builds.set(b, x); }
      return json(req, cfg, 200, {
        tiles: cfg.tiles, compile: cfg.compile, store: store.describe(), usage: { ...u, usedGB: +(u.used / GB).toFixed(3), capGB: +(u.cap / GB).toFixed(3), freeGB: u.free == null ? null : +(u.free / GB).toFixed(3) },
        current: currentBuilds(store, cfg), builds: Object.fromEntries(builds), compiler: d.compiler ? { ...d.compiler.stats, waiting: d.compiler.waiting, active: d.compiler.active } : null,
      });
    }
    if (req.method === 'PUT' && parts[0] === 'objects' && parts.length > 1) {
      const key = parts.slice(1).join('/');
      const body = await readBody(req);
      if (!body) return json(req, cfg, 413, { error: `over ${MAX_UPLOAD} bytes` });
      const v = verifyObject(store, key, body, req.headers.get('x-content-sha256'));
      if (!v.ok) return json(req, cfg, v.status, { error: v.error, ...(v.missing != null ? { missing: v.missing } : {}) });
      if (store.has(key)) {
        const had = store.get(key)!;
        return had.body.equals(body) ? json(req, cfg, 200, { created: false, key }) : json(req, cfg, 409, { error: 'stored with other bytes (objects never change)', key });
      }
      const r = store.put(key, body);
      return json(req, cfg, r.created ? 201 : 200, { created: r.created, key });
    }
    if (parts[0] === 'gc' && parts.length === 1 && (req.method === 'GET' || req.method === 'POST')) {
      const url = new URL(req.url);
      const tg = url.searchParams.get('target_gb');
      // (a target that is not a number would compare false and plan to collect every unpinned build: refuse it)
      if (tg != null && tg !== '' && !(Number.isFinite(Number(tg)) && Number(tg) >= 0)) return json(req, cfg, 400, { error: 'target_gb is a number of GB, 0 or more' });
      const p = pins();
      const plan = planGc({ entries: store.list(), tmp: store.tmpFiles(), current: currentBuilds(store, cfg), pins: p.builds, pinsOk: p.ok, pinSources: [...p.sources, ...p.errors.map((e) => `ERROR ${e}`)], lastServed: store.lastServed(), targetBytes: tg != null && tg !== '' ? Number(tg) * GB : null, now });
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
