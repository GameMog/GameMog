import { db } from './db';
import { RANGES, deviceOf, type Range } from './analytics';

/**
 * How each machine runs the game (16 Nov, friends' QA on many machines: "we must SEE how each machine performs"):
 * Mog City's wagmi/perf.js on mc.gamemog.com sends, straight to POST /api/perf (a beacon, text/plain), one `load` per
 * page load (its timings, the device and graphics card, the tier its js/gfx-auto.js picked and why, the outcome), a
 * `frames` record a minute of play (a 24-bin histogram of frame times) and an `event` when the resolution or the tier
 * steps down or up or the graphics device is lost. Read by the owner only, on the admin screen's Machines tab.
 *
 * Anonymous: a random id per browser tab session (made in the game, never the visit counts' id), the browser's family
 * and major version (from the request's header, the full user-agent is never kept), the OS family, the graphics card's
 * name, cores, memory, screen. No IP address is stored (the rate limit below counts addresses in memory only), no
 * cookie is set. The owner's own sessions are kept and marked (owner = 1): the owner's test machines are QA data too.
 * Bounded: 4 KB a body, RATE_IP a window an address, RATE_SID an hour a session (both roomy: friends testing together
 * share one home or office address, one load plus a minute of play is 2-4 sends, and a tab's session id lasts across
 * its reloads), GLOBAL an hour the whole site; 30 days kept, and at most KEEP_* rows a table. The tables are made here
 * and by deploy/migrate.mjs ('2026-11-16-perf-tables').
 */
export const PERF_MAX_BYTES = 4096, RATE_IP = 300, RATE_WINDOW_MS = 10 * 60_000, RATE_SID = 150, GLOBAL = 5000;
export const KEEP_DAYS = 30, KEEP_LOADS = 50_000, KEEP_FRAMES = 200_000, KEEP_EVENTS = 50_000;
/** The frame-time histogram's bins: 24, log-spaced from 4 ms to 1 s (wagmi/perf.js BINS, LO). Bin i is about binMs(i). */
export const BINS = 24;
export const binMs = (i: number) => Math.round(4 * Math.exp((i / (BINS - 1)) * Math.log(1000 / 4)));

export const PERF_DDL = `
  CREATE TABLE IF NOT EXISTS perf_loads (
    id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, updated INTEGER NOT NULL, sid TEXT NOT NULL, n INTEGER NOT NULL,
    owner INTEGER NOT NULL DEFAULT 0, game TEXT, engine TEXT, town TEXT, browser TEXT, bver INTEGER, os TEXT, device TEXT,
    backend TEXT, backend_why TEXT, cls TEXT, gpu TEXT, gpu_vendor TEXT, gpu_arch TEXT, cores INTEGER, mem REAL, screen TEXT,
    dpr REAL, tier_auto TEXT, tier_choice TEXT, tier TEXT, override TEXT, why TEXT, ttfb INTEGER, ready_ms INTEGER,
    gate_ms INTEGER, story_ms INTEGER, outcome TEXT, errors INTEGER, lost INTEGER, data TEXT NOT NULL,
    UNIQUE (sid, n)
  );
  CREATE INDEX IF NOT EXISTS perf_loads_at ON perf_loads(at);
  CREATE INDEX IF NOT EXISTS perf_loads_game ON perf_loads(game, at);
  CREATE INDEX IF NOT EXISTS perf_loads_gpu ON perf_loads(gpu, browser);
  CREATE TABLE IF NOT EXISTS perf_frames (
    id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, sid TEXT NOT NULL, n INTEGER NOT NULL, scene TEXT, tier TEXT,
    scale REAL, secs INTEGER, frames INTEGER, hist TEXT NOT NULL, long50 INTEGER, long100 INTEGER, stalls INTEGER,
    p50 INTEGER, p95 INTEGER, p99 INTEGER, work50 INTEGER, work95 INTEGER, stall_secs REAL
  );
  CREATE INDEX IF NOT EXISTS perf_frames_at ON perf_frames(at);
  CREATE INDEX IF NOT EXISTS perf_frames_sid ON perf_frames(sid, n);
  CREATE TABLE IF NOT EXISTS perf_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, sid TEXT NOT NULL, n INTEGER NOT NULL, kind TEXT NOT NULL,
    tier TEXT, scene TEXT, data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS perf_events_at ON perf_events(at);
  CREATE INDEX IF NOT EXISTS perf_events_sid ON perf_events(sid, n);
`;
db.exec(PERF_DDL);
// (a copy made before the stalls' seconds were kept gets the column: CREATE ... IF NOT EXISTS leaves a table as it is)
if (!(db.prepare('PRAGMA table_info(perf_frames)').all() as { name: string }[]).some((c) => c.name === 'stall_secs')) db.exec('ALTER TABLE perf_frames ADD COLUMN stall_secs REAL');

const TIERS = ['low', 'phone', 'medium', 'high'] as const;
const str = (v: unknown, n: number, re = /[^\w .,:;/()+@#-]/g) => (typeof v === 'string' ? v.replace(re, '').replace(/\s+/g, ' ').trim().slice(0, n) || null : null);
const num = (v: unknown, lo: number, hi: number, dp = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v * 10 ** dp) / 10 ** dp)) : null);
const one = <T extends string>(v: unknown, set: readonly T[]) => (typeof v === 'string' && (set as readonly string[]).includes(v) ? (v as T) : null);
const word = (v: unknown, n = 24) => (typeof v === 'string' && /^[a-z0-9-]{1,40}$/i.test(v) ? v.slice(0, n).toLowerCase() : null);
const dims = (v: unknown) => (typeof v === 'string' && /^\d{1,5}x\d{1,5}$/.test(v) ? v : null);
const bool = (v: unknown) => v === true;

/** The browser's family and major version, from the request's user-agent (the rest of it is never kept). */
export function browserOf(ua: string): { browser: string; bver: number | null } {
  const m = (re: RegExp) => ua.match(re);
  let r: RegExpMatchArray | null;
  if ((r = m(/\bFirefox\/(\d+)/))) return { browser: 'firefox', bver: +r[1] };
  if ((r = m(/\bEdg[A-Z]?\/(\d+)/))) return { browser: 'edge', bver: +r[1] };
  if ((r = m(/\bOPR\/(\d+)/))) return { browser: 'opera', bver: +r[1] };
  if ((r = m(/\bSamsungBrowser\/(\d+)/))) return { browser: 'samsung', bver: +r[1] };
  if ((r = m(/\b(?:HeadlessChrome|Chrome|CriOS)\/(\d+)/))) return { browser: 'chrome', bver: +r[1] };
  if ((r = m(/\bVersion\/(\d+).*Safari\//))) return { browser: 'safari', bver: +r[1] };
  return { browser: 'other', bver: null };
}

/**
 * The graphics card's name, as one line a person reads: ANGLE's wrapper, the device id and the driver's details dropped
 * ('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)' -> 'NVIDIA GeForce RTX 3060').
 */
export function gpuName(renderer: string | null, fallback = ''): string | null {
  let r = (renderer || '').trim();
  const angle = r.match(/^ANGLE \(([^,]*),\s*(.*)\)\s*$/);
  if (angle) r = angle[2].replace(/^ANGLE Metal Renderer:\s*/i, '').replace(/,\s*(Unspecified Version|D3D\d+|OpenGL[^,]*|Vulkan[^,]*|[^,]*driver[^,]*)$/i, '');
  r = r.replace(/\s*\(0x[0-9a-f]+\)/gi, '').replace(/\s+(Direct3D\d*|vs_\d|ps_\d|OpenGL|Vulkan \d|Metal)\b.*$/i, '').replace(/\s+/g, ' ').trim();
  return (r || fallback).slice(0, 80) || null;
}

type Clean = { k: 'load' | 'frames' | 'event'; sid: string; n: number; game: string | null; [key: string]: unknown };

/** The fields kept from a body, each one checked; anything else in it is dropped. Null when it is not one of ours. */
export function cleanPerf(b: unknown, ua: string): Clean | null {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  const r = b as Record<string, unknown>;
  if (r.v !== 1) return null;
  const sid = typeof r.s === 'string' && /^[a-f0-9-]{16,64}$/.test(r.s) ? r.s : null;
  const n = num(r.n, 1, 999);
  const k = one(r.k, ['load', 'frames', 'event'] as const);
  if (!sid || n == null || !k) return null;
  const game = typeof r.game === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(r.game) ? r.game : null;
  if (k === 'load') {
    const { browser, bver } = browserOf(ua);
    const marks: Record<string, number> = {}, phases: Record<string, number> = {};
    for (const [src, dst] of [[r.marks, marks], [r.phases, phases]] as const)
      if (src && typeof src === 'object') for (const [key, v] of Object.entries(src as Record<string, unknown>).slice(0, 40)) {
        const t = num(v, 0, 36e5);
        if (/^[a-zA-Z]{1,20}$/.test(key) && t != null) dst[key] = t;
      }
    const g = (r.gpu && typeof r.gpu === 'object' ? r.gpu : {}) as Record<string, unknown>;
    const L = (r.limits && typeof r.limits === 'object' ? r.limits : {}) as Record<string, unknown>;
    const renderer = str(g.renderer, 120);
    return {
      k, sid, n, game,
      engine: one(r.engine, ['ny', 'sf', 'pkg', 'runtime'] as const), town: typeof r.town === 'string' && /^[a-z0-9-]{1,40}$/i.test(r.town) ? r.town : null,
      browser, bver, os: one(r.os, ['windows', 'mac', 'linux', 'chromeos', 'android', 'ios', 'other'] as const), device: bool(r.phone) ? 'phone' : deviceOf(ua),
      backend: one(r.backend, ['webgpu', 'webgl2'] as const), backendWhy: word(r.backendWhy), cls: one(r.cls, ['software', 'weak', 'unknown', 'strong'] as const),
      gpu: gpuName(renderer, [str(g.vendor, 30), str(g.arch, 30)].filter(Boolean).join(' ')), gpuVendor: word(g.vendor), gpuArch: word(g.arch),
      cores: num(r.cores, 0, 256), mem: num(r.mem, 0, 1024, 2), screen: dims(r.screen), dpr: num(r.dpr, 0, 10, 2),
      tierAuto: one(r.tierAuto, TIERS), tierChoice: one(r.tierChoice, ['auto', ...TIERS] as const), tier: one(r.tier, TIERS), override: one(r.override, TIERS),
      why: word(r.why), ttfb: num(r.ttfb, 0, 36e5), ready: marks.ready ?? null, gate: marks.gate ?? null, story: marks.story ?? null,
      outcome: one(r.outcome, ['ready', 'late', 'stuck', 'lost', 'error', 'left'] as const) ?? 'ready',
      errors: num(r.errors, 0, 9999), rejections: num(r.rejections, 0, 9999), lost: num(r.lost, 0, 99),
      data: {
        marks, phases, renderer, desc: str(g.desc, 120), device: str(g.device, 60), fallback: bool(g.fallback), caveat: bool(r.caveat),
        limits: { maxTexture: num(L.maxTexture, 0, 65536), maxTexture2D: num(L.maxTexture2D, 0, 65536), maxStorage: num(L.maxStorage, 0, 1e12), maxBuffer: num(L.maxBuffer, 0, 1e12) },
        view: dims(r.view), coarse: bool(r.coarse), fine: bool(r.fine), saveData: bool(r.saveData), cpuMs: num(r.cpuMs, 0, 9999, 1), probeMs: num(r.probeMs, 0, 60000),
        refreshMs: num(r.refreshMs, 0, 1000, 1), pack: bool(r.pack), stalls: num(r.stalls, 0, 1e6), stallSecs: num(r.stallSecs, 0, 86400, 1),
      },
    };
  }
  if (k === 'frames') {
    if (!Array.isArray(r.hist) || r.hist.length !== BINS) return null;
    const hist = r.hist.map((x) => num(x, 0, 65535) ?? 0);
    // (a window of a machine under 4 fps has no frames under 250 ms, only stalls: kept with 5 s of them or more)
    const frames = num(r.frames, 0, 1e6), stallSecs = num(r.stallSecs, 0, 3600, 1);
    if (frames == null || (!frames && !(stallSecs != null && stallSecs >= 5))) return null;
    return {
      k, sid, n, game, scene: str(r.scene, 60, /[^\w:-]/g), tier: one(r.tier, TIERS), scale: num(r.scale, 0.1, 2, 2), secs: num(r.secs, 0, 3600), frames, hist,
      long50: num(r.long50, 0, 1e6), long100: num(r.long100, 0, 1e6), stalls: num(r.stalls, 0, 1e6), stallSecs, p50: num(r.p50, 0, 1000), p95: num(r.p95, 0, 1000), p99: num(r.p99, 0, 1000),
      work50: num(r.work50, 0, 1000), work95: num(r.work95, 0, 1000),
    };
  }
  const kind = one(r.kind, ['downgrade', 'upgrade', 'learn', 'lost'] as const);
  if (!kind) return null;
  const d = (r.data && typeof r.data === 'object' ? r.data : {}) as Record<string, unknown>;
  const lv = (v: unknown) => (typeof v === 'number' ? num(v, 0, 10, 2) : one(v, TIERS));
  return {
    k, sid, n, game, kind, tier: one(r.tier, TIERS), scene: str(r.scene, 60, /[^\w:-]/g),
    data: { what: one(d.what, ['scale', 'tier'] as const), from: lv(d.from), to: lv(d.to), why: word(d.why), live: bool(d.live), p50: num(d.p50, 0, 1000, 1), p95: num(d.p95, 0, 1000, 1), at: num(d.at, 0, 864e5), backend: one(d.backend, ['webgpu', 'webgl2'] as const) },
  };
}

const ipSeen = new Map<string, number[]>(), sidSeen = new Map<string, number[]>();
function prune(m: Map<string, number[]>, max: number, since: number) {
  if (m.size <= max) return;
  for (const [k, ts] of m) if (!ts.length || ts[ts.length - 1] <= since) m.delete(k);
  for (const k of m.keys()) { if (m.size <= max * 0.9) break; m.delete(k); }
}
let hour: number[] = [];
/** Whether this address, this session and the site may send another now; counts it if so. In memory only, never stored. */
export function allowPerf(who: string, sid: string, now = Date.now()) {
  hour = hour.filter((t) => t > now - 3600_000);
  const ip = (ipSeen.get(who) ?? []).filter((t) => t > now - RATE_WINDOW_MS);
  const s = (sidSeen.get(sid) ?? []).filter((t) => t > now - 3600_000);
  if (ip.length >= RATE_IP || s.length >= RATE_SID || hour.length >= GLOBAL) {
    // (a refused ask is only counted against an address or session already seen: a flood past the global cap adds none)
    if (ipSeen.has(who)) ipSeen.set(who, ip);
    if (sidSeen.has(sid)) sidSeen.set(sid, s);
    return false;
  }
  // (re-inserted, so each map runs from the longest quiet to the latest seen: prune() drops the quiet ones first)
  ip.push(now); s.push(now); hour.push(now);
  ipSeen.delete(who); ipSeen.set(who, ip); sidSeen.delete(sid); sidSeen.set(sid, s);
  // (bounded without flushing everyone's counts: the addresses and sessions quiet for a window go first, then the
  // longest quiet; the global cap holds whatever a sender making up addresses sends)
  prune(ipSeen, 20000, now - RATE_WINDOW_MS);
  prune(sidSeen, 20000, now - 3600_000);
  return true;
}

let swept = 0;
function sweep(now: number) {
  if (now - swept < 3600_000) return;
  swept = now;
  const old = now - KEEP_DAYS * 864e5;
  for (const [t, keep] of [['perf_loads', KEEP_LOADS], ['perf_frames', KEEP_FRAMES], ['perf_events', KEEP_EVENTS]] as const) {
    db.prepare(`DELETE FROM ${t} WHERE at < ?`).run(old);
    const top = db.prepare(`SELECT MAX(id) AS m FROM ${t}`).get() as { m: number | null };
    if (top.m) db.prepare(`DELETE FROM ${t} WHERE id <= ?`).run(top.m - keep);
  }
}

/** Keeps one cleaned record: a load (a later one of the same load fills it in), a frames window or an event. */
export function storePerf(c: Clean, owner: boolean, now = Date.now()) {
  sweep(now);
  if (c.k === 'load') {
    const v = c as Clean & Record<string, unknown>;
    db.prepare(`INSERT INTO perf_loads (at, updated, sid, n, owner, game, engine, town, browser, bver, os, device, backend, backend_why, cls, gpu, gpu_vendor, gpu_arch,
        cores, mem, screen, dpr, tier_auto, tier_choice, tier, override, why, ttfb, ready_ms, gate_ms, story_ms, outcome, errors, lost, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (sid, n) DO UPDATE SET updated = excluded.updated, owner = MAX(owner, excluded.owner), backend = excluded.backend, tier = excluded.tier,
        tier_auto = excluded.tier_auto, why = excluded.why, ready_ms = COALESCE(excluded.ready_ms, ready_ms), gate_ms = COALESCE(excluded.gate_ms, gate_ms),
        story_ms = COALESCE(excluded.story_ms, story_ms), outcome = CASE WHEN outcome IN ('lost', 'error') AND excluded.outcome IN ('ready', 'late') THEN outcome ELSE excluded.outcome END,
        errors = MAX(errors, excluded.errors), lost = MAX(lost, excluded.lost), data = excluded.data`)
      .run(now, now, c.sid, c.n, owner ? 1 : 0, c.game, v.engine as string | null, v.town as string | null, v.browser as string, v.bver as number | null, v.os as string | null,
        v.device as string, v.backend as string | null, v.backendWhy as string | null, v.cls as string | null, v.gpu as string | null, v.gpuVendor as string | null,
        v.gpuArch as string | null, v.cores as number | null, v.mem as number | null, v.screen as string | null, v.dpr as number | null, v.tierAuto as string | null,
        v.tierChoice as string | null, v.tier as string | null, v.override as string | null, v.why as string | null, v.ttfb as number | null, v.ready as number | null,
        v.gate as number | null, v.story as number | null, v.outcome as string, ((v.errors as number) ?? 0) + ((v.rejections as number) ?? 0), (v.lost as number) ?? 0,
        JSON.stringify(v.data));
  } else if (c.k === 'frames') {
    const v = c as Clean & Record<string, unknown>;
    db.prepare('INSERT INTO perf_frames (at, sid, n, scene, tier, scale, secs, frames, hist, long50, long100, stalls, p50, p95, p99, work50, work95, stall_secs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(now, c.sid, c.n, v.scene as string | null, v.tier as string | null, v.scale as number | null, v.secs as number | null, v.frames as number, JSON.stringify(v.hist),
        v.long50 as number | null, v.long100 as number | null, v.stalls as number | null, v.p50 as number | null, v.p95 as number | null, v.p99 as number | null,
        v.work50 as number | null, v.work95 as number | null, v.stallSecs as number | null);
  } else {
    const v = c as Clean & Record<string, unknown>;
    db.prepare('INSERT INTO perf_events (at, sid, n, kind, tier, scene, data) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(now, c.sid, c.n, v.kind as string, v.tier as string | null, v.scene as string | null, JSON.stringify(v.data));
  }
}

/* ------------------------------------------------------------------ the owner's view */
const SPAN: Record<Exclude<Range, 'all'>, number> = { '24h': 864e5, '7d': 7 * 864e5, '30d': 30 * 864e5 };
const median = (xs: number[]) => { const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[s.length >> 1] : null; };
const quant = (xs: number[], q: number) => { const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : null; };
/** A percentile of the frames merged in a histogram (bin i stands for binMs(i)). */
export function histPct(hist: number[], q: number) {
  const total = hist.reduce((a, b) => a + b, 0);
  if (!total) return null;
  let acc = 0;
  for (let i = 0; i < hist.length; i++) { acc += hist[i]; if (acc >= total * q) return binMs(i); }
  return binMs(hist.length - 1);
}

type LoadRow = {
  id: number; at: number; sid: string; n: number; owner: number; game: string | null; engine: string | null; town: string | null; browser: string | null; bver: number | null;
  os: string | null; device: string | null; backend: string | null; backend_why: string | null; cls: string | null; gpu: string | null; cores: number | null; mem: number | null;
  screen: string | null; dpr: number | null; tier_auto: string | null; tier_choice: string | null; tier: string | null; override: string | null; why: string | null;
  ttfb: number | null; ready_ms: number | null; gate_ms: number | null; story_ms: number | null; outcome: string | null; errors: number | null; lost: number | null; data: string;
};
type FrameRow = { sid: string; n: number; at: number; scene: string | null; tier: string | null; scale: number | null; secs: number | null; frames: number; hist: string; long50: number | null; long100: number | null; stalls: number | null; stall_secs: number | null; p50: number | null; p95: number | null; p99: number | null; work95: number | null };
/** A frames row with its histogram parsed, once. */
type Frame = FrameRow & { h: number[] };
type EventRow = { sid: string; n: number; at: number; kind: string; tier: string | null; scene: string | null; data: string };

export type PerfGroup = { key: string; n: number; readyMs: number | null; p50: number | null; p95: number | null; p99: number | null; webgl2: number; downgraded: number; tier: string | null; longPerMin: number | null; stallSecs: number; stuck: number };
export type PerfSession = {
  code: string; sid: string; n: number; at: number; owner: boolean; game: string | null; engine: string | null; town: string | null; browser: string; os: string | null; device: string | null;
  gpu: string | null; cls: string | null; backend: string | null; backendWhy: string | null; cores: number | null; mem: number | null; screen: string | null; dpr: number | null;
  tier: string | null; tierAuto: string | null; tierChoice: string | null; override: string | null; why: string | null; outcome: string; readyMs: number | null; ttfb: number | null;
  gateMs: number | null; storyMs: number | null; errors: number; lost: number; p50: number | null; p95: number | null; p99: number | null; playSecs: number; long50: number; stalls: number; stallSecs: number;
  phases: Record<string, number>; cpuMs: number | null; refreshMs: number | null;
  events: { at: number; kind: string; what: string | null; from: unknown; to: unknown; why: string | null; live: boolean; p50: number | null }[];
  windows: { scene: string | null; tier: string | null; scale: number | null; secs: number | null; p50: number | null; p95: number | null; long50: number | null; work95: number | null; stalls: number | null; stallSecs: number | null }[];
};
export type PerfAdmin = {
  range: Range;
  /** the owner's own loads left out (the default on the Machines tab) */
  ownerExcluded: boolean;
  kpis: { sessions: number; loads: number; readyPct: number | null; readyMedian: number | null; readyP90: number | null; stuckPct: number | null; lost: number; downgradedPct: number | null; playMin: number };
  byGame: PerfGroup[]; byMachine: PerfGroup[]; byTier: PerfGroup[]; hist: { label: string; value: number }[]; sessions: PerfSession[];
};

/**
 * The owner's Machines tab: every load in the range, its frames and its steps, grouped. excludeOwner (the tab's default):
 * the owner's own loads left out, and the frames and steps of the owner's sessions with them, from the counts and groups.
 */
export function perfAdmin(range: Range, now = Date.now(), { excludeOwner = false }: { excludeOwner?: boolean } = {}): PerfAdmin {
  const from = range === 'all' ? 0 : now - SPAN[range];
  // (the owner's sessions: by their loads, any of them marked; a session's frames are left out with it)
  const ownerSids = excludeOwner ? new Set((db.prepare('SELECT DISTINCT sid FROM perf_loads WHERE owner = 1 AND at >= ?').all(from - 864e5) as { sid: string }[]).map((r) => r.sid)) : new Set<string>();
  const mine = (r: { sid: string; owner?: number }) => excludeOwner && (r.owner === 1 || ownerSids.has(r.sid));
  const loads = (db.prepare('SELECT * FROM perf_loads WHERE at >= ? ORDER BY at DESC LIMIT 5000').all(from) as unknown as LoadRow[]).filter((l) => !mine(l));
  // (each row's histogram parsed once, here: the sessions, the groups and the totals all read it)
  const frames: Frame[] = (db.prepare('SELECT sid, n, at, scene, tier, scale, secs, frames, hist, long50, long100, stalls, stall_secs, p50, p95, p99, work95 FROM perf_frames WHERE at >= ? ORDER BY at DESC LIMIT 50000').all(from).reverse() as unknown as FrameRow[])
    .filter((f) => !mine(f)).map((f) => { let h: number[] = []; try { const x = JSON.parse(f.hist); if (Array.isArray(x)) h = x as number[]; } catch { /* bad row */ } return { ...f, h }; });
  const events = (db.prepare('SELECT sid, n, at, kind, tier, scene, data FROM perf_events WHERE at >= ? ORDER BY at DESC LIMIT 20000').all(from).reverse() as unknown as EventRow[]).filter((e) => !mine(e));
  const key = (sid: string, n: number) => `${sid}.${n}`;
  const fBy = new Map<string, Frame[]>(), eBy = new Map<string, EventRow[]>();
  for (const f of frames) { const k = key(f.sid, f.n); (fBy.get(k) ?? fBy.set(k, []).get(k)!).push(f); }
  for (const e of events) { const k = key(e.sid, e.n); (eBy.get(k) ?? eBy.set(k, []).get(k)!).push(e); }
  const merge = (fs: Frame[]) => { const h = new Array(BINS).fill(0); for (const f of fs) for (let i = 0; i < BINS; i++) h[i] += Number(f.h[i]) || 0; return h; };
  const stallSecs = (fs: Frame[]) => Math.round(fs.reduce((a, f) => a + (f.stall_secs ?? 0), 0));
  const downgraded = (es: EventRow[]) => es.some((e) => e.kind === 'downgrade');

  const sessions: PerfSession[] = loads.map((l) => {
    const k = key(l.sid, l.n), fs = fBy.get(k) ?? [], es = eBy.get(k) ?? [], h = merge(fs);
    let d: Record<string, unknown> = {};
    try { d = JSON.parse(l.data) as Record<string, unknown>; } catch { /* bad row */ }
    return {
      code: l.sid.replace(/[^a-f0-9]/g, '').slice(0, 4).toUpperCase(), sid: l.sid, n: l.n, at: l.at, owner: !!l.owner, game: l.game, engine: l.engine, town: l.town,
      browser: `${l.browser ?? '?'}${l.bver ? ' ' + l.bver : ''}`, os: l.os, device: l.device, gpu: l.gpu, cls: l.cls, backend: l.backend, backendWhy: l.backend_why,
      cores: l.cores, mem: l.mem, screen: l.screen, dpr: l.dpr, tier: l.tier, tierAuto: l.tier_auto, tierChoice: l.tier_choice, override: l.override, why: l.why,
      outcome: l.outcome ?? 'ready', readyMs: l.ready_ms, ttfb: l.ttfb, gateMs: l.gate_ms, storyMs: l.story_ms, errors: l.errors ?? 0, lost: l.lost ?? 0,
      p50: histPct(h, 0.5), p95: histPct(h, 0.95), p99: histPct(h, 0.99), playSecs: fs.reduce((a, f) => a + (f.secs ?? 0), 0),
      long50: fs.reduce((a, f) => a + (f.long50 ?? 0), 0), stalls: Math.max(fs.reduce((a, f) => a + (f.stalls ?? 0), 0), (d.stalls as number) ?? 0),
      stallSecs: Math.max(stallSecs(fs), Math.round((d.stallSecs as number) ?? 0)),
      phases: (d.phases ?? {}) as Record<string, number>, cpuMs: (d.cpuMs as number) ?? null, refreshMs: (d.refreshMs as number) ?? null,
      events: es.map((e) => { let x: Record<string, unknown> = {}; try { x = JSON.parse(e.data); } catch { /* bad row */ } return { at: e.at, kind: e.kind, what: (x.what as string) ?? null, from: x.from, to: x.to, why: (x.why as string) ?? null, live: !!x.live, p50: (x.p50 as number) ?? null }; }),
      windows: fs.map((f) => ({ scene: f.scene, tier: f.tier, scale: f.scale, secs: f.secs, p50: f.p50, p95: f.p95, long50: f.long50, work95: f.work95, stalls: f.stalls, stallSecs: f.stall_secs })),
    };
  });

  const group = (by: (l: LoadRow) => string): PerfGroup[] => {
    const m = new Map<string, LoadRow[]>();
    for (const l of loads) { const g = by(l); (m.get(g) ?? m.set(g, []).get(g)!).push(l); }
    return [...m.entries()].map(([g, ls]) => {
      const fs = ls.flatMap((l) => fBy.get(key(l.sid, l.n)) ?? []), h = merge(fs), secs = fs.reduce((a, f) => a + (f.secs ?? 0), 0);
      const tiers = new Map<string, number>();
      for (const l of ls) if (l.tier) tiers.set(l.tier, (tiers.get(l.tier) ?? 0) + 1);
      return {
        key: g, n: ls.length, readyMs: median(ls.map((l) => l.ready_ms ?? NaN)), p50: histPct(h, 0.5), p95: histPct(h, 0.95), p99: histPct(h, 0.99),
        webgl2: ls.filter((l) => l.backend === 'webgl2').length, downgraded: ls.filter((l) => downgraded(eBy.get(key(l.sid, l.n)) ?? [])).length,
        tier: [...tiers.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null, longPerMin: secs ? Math.round((fs.reduce((a, f) => a + (f.long50 ?? 0), 0) / secs) * 600) / 10 : null, stallSecs: stallSecs(fs),
        stuck: ls.filter((l) => l.outcome === 'stuck' || l.outcome === 'late' || l.outcome === 'lost' || l.outcome === 'error').length,
      };
    }).sort((a, b) => b.n - a.n).slice(0, 40);
  };
  // (a game's name for its id or slug, where it is in this database)
  const titles = new Map<string, string>();
  for (const g of new Set(loads.map((l) => l.game).filter(Boolean) as string[])) {
    const row = db.prepare('SELECT title FROM games WHERE id = ? OR slug = ? LIMIT 1').get(g, g) as { title: string } | undefined;
    if (row?.title) titles.set(g, row.title);
  }
  for (const s of sessions) if (s.game && titles.has(s.game)) s.game = titles.get(s.game)!;
  const all = merge(frames);
  const ready = loads.filter((l) => (l.outcome === 'ready' || l.outcome === 'late') && l.ready_ms != null).map((l) => l.ready_ms as number);
  const total = loads.length;
  const order: Record<string, number> = { stuck: 0, lost: 1, error: 2, late: 3, left: 4, ready: 5 };
  return {
    range, ownerExcluded: excludeOwner,
    kpis: {
      sessions: new Set(loads.map((l) => l.sid)).size, loads: total, readyPct: total ? Math.round((loads.filter((l) => l.outcome === 'ready').length / total) * 100) : null,
      readyMedian: median(ready), readyP90: quant(ready, 0.9), stuckPct: total ? Math.round((loads.filter((l) => l.outcome === 'stuck').length / total) * 100) : null,
      lost: loads.reduce((a, l) => a + (l.lost ?? 0), 0), downgradedPct: total ? Math.round((loads.filter((l) => downgraded(eBy.get(key(l.sid, l.n)) ?? [])).length / total) * 100) : null,
      playMin: Math.round(frames.reduce((a, f) => a + (f.secs ?? 0), 0) / 60),
    },
    byGame: group((l) => (l.game ? titles.get(l.game) ?? l.game : l.town ? `town ${l.town}` : `${l.engine ?? '?'} (no game)`)),
    byMachine: group((l) => `${l.gpu ?? 'unknown graphics'} · ${l.browser ?? '?'}${l.bver ? ' ' + l.bver : ''}`),
    byTier: group((l) => `${l.tier ?? '?'} · ${l.backend ?? '?'}`),
    hist: all.map((v, i) => ({ label: `${i === 0 ? '≤' : '~'}${binMs(i)} ms`, value: v })).filter((r) => r.value > 0),
    sessions: sessions.slice(0, 200).sort((a, b) => (order[a.outcome] ?? 9) - (order[b.outcome] ?? 9) || (b.p95 ?? 0) - (a.p95 ?? 0)).slice(0, 50),
  };
}
export const PERF_RANGES = RANGES;
