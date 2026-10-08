/**
 * The kart race's score, typed, for the server and the page (the owner, 8 Oct 2026). The formula is one file,
 * lib/runtime/kart-score.js, which the kart runtime also carries: imported here for its effect, it hands over the same
 * object (globalThis.KartScore), so the route, the page and the game can never disagree. Nothing here touches the
 * disk, so the page's client components can use it too.
 *
 * Also here: the constants a kart world scores against when it has none measured (docs/RULES.md "Kart score"), and
 * the route's plausibility check, pure, so the platform check can test them without a server.
 */
import './runtime/kart-score.js';

export type KartTier = { id: string; name: string; min: number; color: string; bar: string };
/** A world's meta.kartScore. tStar / tFloor: seconds, per racer id (or one number for every racer). */
export type KartConstants = {
  version: number; source: 'measured' | 'course' | 'minimal';
  tStar: Record<string, number> | number; tFloor: Record<string, number> | number;
  karts: number; laps: number; gmCap: number; gmMax: number; hitsCap: number; hitsMax: number;
  lap?: number; physics?: string; world?: string; at?: string;
};
export type KartRun = { timeMs: number; place: number; karts?: number; gm?: number; hits?: number; estimated?: boolean; progress?: number | null; racer?: string | null };
export type KartParts = { total: number; time: number; finish: number; gm: number; hits: number; tier: KartTier; v: number; tStar: number; x: number };
type Api = {
  V: number; MAX: number; W: { time: number; finish: number; gm: number; hits: number }; TIERS: KartTier[];
  score(run: KartRun, C: KartConstants): KartParts; tier(s: number): KartTier;
  tStar(C: KartConstants, racer?: string | null): number; tFloor(C: KartConstants, racer?: string | null): number;
  ceiling(C: KartConstants, racer?: string | null): number; timeFor(s: number, run: Partial<KartRun>, C: KartConstants): number | null;
};
export const KartScore = (globalThis as unknown as { KartScore: Api }).KartScore;
export const KART_TIERS = KartScore.TIERS;
/** Every chip's ink: the site's --ink. */
export const KART_INK = '#0B0B0F';
export const KART_SCORE_VERSION = 1;

// the kit's class top speeds (kartRules in lib/runtime/kart.js; the platform check reads them there and fails on a
// drift) and the most a racer's stats can add (statsOf: top 0.95 to 1.05)
export const KART_CLASS_TOP: Record<string, number> = { chill: 27.3, normal: 31, degen: 35 };
const TOP_STAT_MAX = 1.05, PAD = 1.28, POCKET = 1.06, HARD = 1.45, LAP_MIN = 800, LAP_MAX = 1800;

/**
 * The course fallback (SPEC section 9): what the course alone gives, every number on the low side, so an unmeasured
 * world's scores can only come out lower than its measured ones (never past the ceiling, which no constants change).
 * L: the lap (m); laps; cls: the class; gmLines: coin lines a lap (8 unless the course says otherwise; 0: no GM).
 */
export function courseConstants({ L, laps, cls, gmLines = 8, karts = 8, source = 'course' }: { L: number; laps: number; cls?: string | null; gmLines?: number; karts?: number; source?: 'course' | 'minimal' }): KartConstants {
  const vTop = (KART_CLASS_TOP[cls ?? 'normal'] ?? KART_CLASS_TOP.normal) * TOP_STAT_MAX;
  const coins = gmLines * 5 * laps, gmCap = coins ? coins + (karts - 1) * 2 : 0;
  return {
    version: KART_SCORE_VERSION, source,
    // (0.9: the racing line is never under 90% of the centre line; To The Moon's is 93.8%)
    tStar: +((0.9 * laps * L) / (vTop * PAD * POCKET)).toFixed(3),
    tFloor: +((0.85 * laps * L) / (vTop * HARD * POCKET)).toFixed(3),
    karts, laps, gmCap, gmMax: Math.max(180, gmCap + 3 * 7 * laps), hitsCap: 30, hitsMax: 64,
  };
}

/** A track's lap from its code, when its points are written out as numbers ([[x, z], ...] or [[x, y, z], ...]); else null. */
export function literalLap(code: string): number | null {
  const m = /\btrack\s*:\s*\{[\s\S]{0,400}?\bpoints\s*:\s*\[/.exec(code);
  if (!m) return null;
  let i = m.index + m[0].length - 1, depth = 0, end = -1;
  for (let j = i; j < code.length && j < i + 20000; j++) { const c = code[j]; if (c === '[') depth++; else if (c === ']') { depth--; if (!depth) { end = j; break; } } else if (!/[\d\s,.\-eE+]/.test(c)) return null; }
  if (end < 0) return null;
  let pts: number[][];
  try { pts = JSON.parse(code.slice(i, end + 1)); } catch { return null; }
  const P = pts.filter((p) => Array.isArray(p) && p.length >= 2).map((p) => (p.length === 2 ? [p[0], p[1]] : [p[0], p[2]]));
  if (P.length < 3) return null;
  let len = 0;
  for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length]; len += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  // (the curve through the points is never shorter than the polygon, and the runtime keeps a lap 800 to 1800 m)
  return Math.min(LAP_MAX, Math.max(LAP_MIN, len));
}

/**
 * The constants a kart world's runs score against: its stored meta.kartScore (measured at publish), or, with none,
 * the course fallback read from its code, flagged 'minimal' (its lap from its written-out points, else the shortest
 * lap the runtime allows) until `node scripts/kart-score/measure.mjs --game <slug>` measures it.
 */
export function kartConstants(meta: string | null | Record<string, unknown> | undefined, code: string | null | undefined, kart?: { laps: number | null; class: string | null } | null): KartConstants {
  let m: { kartScore?: KartConstants } = {};
  try { m = (typeof meta === 'string' ? JSON.parse(meta) : meta) ?? {}; } catch { /* none */ }
  const C = m.kartScore;
  if (C && C.version === KART_SCORE_VERSION && C.tStar && C.karts > 1 && C.hitsCap > 0) return C;
  const laps = kart?.laps && kart.laps >= 1 && kart.laps <= 5 ? kart.laps : 3;
  const lines = code && /\bgm\s*:\s*(?:false|0)\b/.test(code) ? 0 : 8;
  return courseConstants({ L: (code && literalLap(code)) || LAP_MIN, laps, cls: kart?.class, gmLines: lines, source: 'minimal' });
}

/** The route's checks on a posted kart result (SPEC section 8). The client's own score is never read. */
export function checkKartRun(b: Record<string, unknown>, C: KartConstants, laps: number | null):
  | { ok: false; error: string }
  | { ok: true; run: { timeMs: number; place: number; gm: number; hits: number; estimated: boolean; progress: number | null; racer: string | null; laps: number }; review: boolean } {
  const no = (error: string) => ({ ok: false as const, error });
  if (b.assisted) return no('Assisted runs are not ranked.');
  const place = Number(b.place), lapsRun = Number(b.laps ?? b.level), timeMs = Number(b.timeMs);
  const gm = b.gm == null ? 0 : Number(b.gm), hits = b.hits == null ? 0 : Number(b.hits);
  const estimated = b.estimated === true;
  if (b.estimated != null && typeof b.estimated !== 'boolean') return no('Result outside plausible range');
  const progress = b.progress == null ? null : Number(b.progress);
  // (the racer's id: one the constants do not know is held to the strictest perfect time and floor)
  const racer = typeof b.racer === 'string' && /^[a-z][a-z0-9_-]{0,23}$/i.test(b.racer) ? b.racer.toLowerCase() : null;
  if (!Number.isInteger(place) || place < 1 || place > C.karts) return no('Result outside plausible range');
  if (!Number.isInteger(lapsRun) || lapsRun < 1 || lapsRun > 5 || lapsRun !== (laps ?? C.laps)) return no('Result outside plausible range');
  if (!Number.isFinite(timeMs) || timeMs < KartScore.tFloor(C, racer) * 1000 || timeMs > 30 * 60 * 1000) return no('Result outside plausible range');
  if (!Number.isInteger(gm) || gm < 0 || gm > C.gmMax) return no('Result outside plausible range');
  if (!Number.isInteger(hits) || hits < 0 || hits > C.hitsMax) return no('Result outside plausible range');
  if (progress != null && (!Number.isFinite(progress) || progress < 0 || progress > 1 || (estimated && progress >= 1))) return no('Result outside plausible range');
  return {
    ok: true,
    run: { timeMs: Math.round(timeMs), place, gm, hits, estimated, progress: estimated ? progress : null, racer, laps: lapsRun },
    // faster than the racer's perfect-run bound, though not the floor: only luck and long slipstreams together could
    // do it, so the run is kept but held off the board for the owner to look at
    review: timeMs < KartScore.tStar(C, racer) * 1000,
  };
}

/** A race's time as the results screen shows it: 2:08.4 */
export const raceClock = (ms: number) => { const s = Math.max(0, ms / 1000), m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; };
export const ordinal = (n: number) => `${n}${['st', 'nd', 'rd'][((n + 90) % 100 - 10) % 10 - 1] ?? 'th'}`;
