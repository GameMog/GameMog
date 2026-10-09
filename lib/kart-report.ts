import { db } from './db';
import { deviceOf } from './analytics';

/**
 * Kart race crash reports (8 Oct): what lib/runtime/kart-guard.js saw go wrong on a player's device (an error, the
 * graphics context lost, or a page that died mid-boot), passed on by the game page (app/g/[slug]/play-frame.tsx) to
 * POST /api/kart-report, and read by the owner only (GET /api/kart-report, /admin). No address, no cookie, no name:
 * the device's class, browser, screen, memory and GPU, the boot step reached and the error's first lines. Small and
 * bounded: a body over 4 KB is refused, an address sends at most RATE a window (kept in memory only, never stored),
 * the whole site at most GLOBAL an hour, and the table keeps the newest KEEP.
 */
export const REPORT_MAX_BYTES = 4096, RATE = 6, RATE_WINDOW_MS = 10 * 60_000, GLOBAL = 300, KEEP = 2000;
const KINDS = ['error', 'rejection', 'context-lost', 'crash'] as const;
export type KartReportKind = (typeof KINDS)[number];

db.exec(`
  CREATE TABLE IF NOT EXISTS kart_reports (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    at      INTEGER NOT NULL,
    kind    TEXT NOT NULL,
    slug    TEXT,
    device  TEXT NOT NULL,
    step    TEXT,
    message TEXT,
    data    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS kart_reports_by_time ON kart_reports(at);
`);

const str = (v: unknown, n: number, re = /[^\w .,:;/()'"#@[\]<>=+*-]/g) => typeof v === 'string' ? v.replace(/[?#][^\s)'"]*/g, '').replace(/\s+\n/g, '\n').replace(re, '').slice(0, n) || null : null;
const num = (v: unknown, lo: number, hi: number) => typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v * 100) / 100)) : null;
const dims = (v: unknown) => typeof v === 'string' && /^\d{1,5}x\d{1,5}$/.test(v) ? v : null;

/** The fields kept from a report, every one checked; anything else in it is dropped. Null when it is not a report. */
export function cleanReport(b: unknown, ua: string) {
  if (!b || typeof b !== 'object') return null;
  const r = b as Record<string, unknown>;
  const kind = KINDS.includes(r.kind as KartReportKind) ? (r.kind as KartReportKind) : null;
  if (!kind) return null;
  const slug = typeof r.slug === 'string' && /^[a-z0-9-]{1,80}$/.test(r.slug) ? r.slug : null;
  const heap = r.heap && typeof r.heap === 'object' ? { used: num((r.heap as Record<string, unknown>).used, 0, 1e6), limit: num((r.heap as Record<string, unknown>).limit, 0, 1e6) } : null;
  const data = {
    ua: ua.slice(0, 200), tier: r.tier === 'low' || r.tier === 'high' ? r.tier : null,
    mem: num(r.mem, 0, 1024), cores: num(r.cores, 0, 256), screen: dims(r.screen), view: dims(r.view), dpr: num(r.dpr, 0, 10),
    gpu: str(r.gpu, 120), heap, t: num(r.t, 0, 864e5), ready: r.ready === true, lost: r.lost === true, hidden: r.hidden === true,
    downloads: num(r.downloads, 0, 1e5), decodes: num(r.decodes, 0, 1e5), stack: str(r.stack, 600),
    // (the switches the run was opened with, ?kdiag=, and its last steps, each 'step @ms heapM': the guard's trail)
    diag: typeof r.diag === 'string' && /^[a-z,]{1,120}$/.test(r.diag) ? r.diag : null,
    trail: Array.isArray(r.trail) ? r.trail.slice(-14).map((x) => str(x, 80, /[^\w .:/()+@-]/g)).filter(Boolean) : null,
  };
  return { kind, slug, device: deviceOf(ua), step: str(r.step, 60, /[^\w .:/()-]/g), message: str(r.message, 300), data };
}

const seen = new Map<string, number[]>();
let hour: number[] = [];
/** Whether this address (and the site) may send another report now; counts it if so. In memory only. */
export function allowReport(who: string, now = Date.now()) {
  hour = hour.filter((t) => t > now - 3600_000);
  const mine = (seen.get(who) ?? []).filter((t) => t > now - RATE_WINDOW_MS);
  if (mine.length >= RATE || hour.length >= GLOBAL) { seen.set(who, mine); return false; }
  mine.push(now); hour.push(now); seen.set(who, mine);
  if (seen.size > 5000) seen.clear();
  return true;
}

export function storeReport(r: NonNullable<ReturnType<typeof cleanReport>>, now = Date.now()) {
  const { lastInsertRowid } = db.prepare('INSERT INTO kart_reports (at, kind, slug, device, step, message, data) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(now, r.kind, r.slug, r.device, r.step, r.message, JSON.stringify(r.data));
  db.prepare('DELETE FROM kart_reports WHERE id <= ?').run(Number(lastInsertRowid) - KEEP);
  return Number(lastInsertRowid);
}

export type KartReportRow = { id: number; at: number; kind: KartReportKind; slug: string | null; device: string; step: string | null; message: string | null; data: Record<string, unknown> };
export function kartReports(limit = 100): KartReportRow[] {
  return (db.prepare('SELECT id, at, kind, slug, device, step, message, data FROM kart_reports ORDER BY id DESC LIMIT ?').all(limit) as (Omit<KartReportRow, 'data'> & { data: string })[])
    .map((r) => ({ ...r, data: JSON.parse(r.data) as Record<string, unknown> }));
}
