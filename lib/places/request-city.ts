import type { PlaceSelection } from './types.ts';

/** A town's build as the Create page shows it (POST /api/towns, then GET /api/towns/{placeId} every 2 s). */
export type TownProgress = {
  state: string; stage: string; done: number; total: number; position: number; etaS: number | null;
  /** the production builder (lib/hometown-build/towns.ts): asked, framing, district (the story may start), growing (drive
   *  now: the rest keeps building), full; the wait to drive and to the whole town */
  phase?: string; district?: boolean; etaDriveS?: number | null; etaFullS?: number | null;
  /** (r7) the steps as counts, how far the whole town is (0..100), the seconds since it was asked for, a builder being
   * started for it, taking well over what towns usually take; `drive`: its free-roam test drive (Mog City), once drivable */
  steps?: { regions: { done: number; total: number }; ctx: { done: number; total: number }; frame: boolean | null; tiles: { done: number; total: number }; district: boolean; full: boolean; running: number };
  pct?: number; elapsedS?: number; starting?: boolean; slow?: boolean; drive?: string;
};
/** The lock a ready town pins (base.hometown); the page sends only the place id, the server reads the rest. */
export type TownLockView = { place: string; compiler: string; tiles: string };
export type CityRequest =
  | { status: 'ready'; place: PlaceSelection; lock: TownLockView; town: { name: string; state: string; places: number; streets: number }; growing?: boolean;
      /** (r7) the build's latest progress while it keeps growing (onFollow), and the town's free-roam test drive once drivable */
      progress?: TownProgress; drive?: string }
  | { status: 'error'; place: PlaceSelection; error: string };

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
});
const NOT_NOW = 'We couldn\'t build this town right now. Try again.';

/** While a town ready to write keeps building (growing), how often its card asks how it is going. */
export const FOLLOW_MS = 5000;
let followMs = FOLLOW_MS;
/** (checks only: a shorter follow interval) */
export const setFollowMsForChecks = (ms: number) => { followMs = ms; };

/**
 * Asks for a town's city (Hometown, lib/hometown/towns.ts): POST /api/towns with the picked place's id (the browser
 * sends nothing else; the server resolves the place and its box), then polls its build every 2 s, telling `onProgress`
 * each step, until it is ready or refused. A build cut short (a restart) is asked for once more. The build goes on if
 * the tab closes; `signal` only stops this page waiting.
 *
 * A town ready to write while the rest of it builds (phase district or growing: `growing: true`) is not done: with
 * `onLater`, it is followed every FOLLOW_MS until it is whole (onLater with the ready answer) or fails (onLater with the
 * error: the card stops saying "Ready to write" for a town the server now refuses), or `signal` stops it.
 */
export async function requestCity(place: PlaceSelection, onProgress?: (p: TownProgress) => void, signal?: AbortSignal, onLater?: (r: CityRequest) => void, onFollow?: (p: TownProgress) => void): Promise<CityRequest> {
  const ask = async (method: 'POST' | 'GET') => {
    const r = method === 'POST'
      ? await fetch('/api/towns', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ placeId: place.placeId }), signal })
      : await fetch(`/api/towns/${encodeURIComponent(place.placeId)}`, { signal, cache: 'no-store' });
    let body: Record<string, unknown> = {};
    try { body = await r.json(); } catch { /* not JSON: a refusal below */ }
    return { status: r.status, body };
  };
  let retried = false, waits = 0;
  try {
    let a = await ask('POST');
    for (;;) {
      if (signal?.aborted) return { status: 'error', place, error: 'Stopped.' };
      // (the production builder knows no build yet: it is starting a builder to learn it, retryS; ask again, for up to
      // about 5 minutes, showing the town as waiting its turn)
      if (a.status === 503 && typeof a.body.retryS === 'number' && waits < 20) {
        waits++;
        onProgress?.({ state: 'queued', stage: 'Waiting its turn', done: 0, total: 0, position: 1, etaS: null, phase: 'asked' });
        await sleep(Math.min(60, Math.max(2, a.body.retryS)) * 1000, signal);
        a = await ask('POST');
        continue;
      }
      if (a.status === 200 && a.body.state === 'ready') return readyOf(place, a.body);
      // (the production builder: the town's frame is in, so the story may be written now while the rest builds; it is
      // followed on (follow) so a town that fails later is not left showing ready)
      if (a.status === 202 && a.body.lock && a.body.town && (a.body.phase === 'district' || a.body.phase === 'growing')) {
        if (onLater) void follow(ask, place, onLater, signal, retried, onFollow);
        return { ...readyOf(place, a.body), growing: true, progress: a.body as unknown as TownProgress };
      }
      if (a.status === 202) onProgress?.(a.body as unknown as TownProgress);
      else if (a.status === 409 && a.body.state === 'interrupted' && !retried) { retried = true; a = await ask('POST'); continue; }
      else return { status: 'error', place, error: typeof a.body.error === 'string' ? a.body.error : NOT_NOW };
      await sleep(2000, signal);
      a = await ask('GET');
    }
  } catch {
    return { status: 'error', place, error: signal?.aborted ? 'Stopped.' : NOT_NOW };
  }
}

/** A ready answer (200 whole, or 202 district / growing) as the card holds it: its lock, town and test drive. */
const readyOf = (place: PlaceSelection, b: Record<string, unknown>): Extract<CityRequest, { status: 'ready' }> => ({
  status: 'ready', place, lock: b.lock as TownLockView, town: b.town as Extract<CityRequest, { status: 'ready' }>['town'],
  ...(typeof b.drive === 'string' ? { drive: b.drive } : {}),
});

type Ask = (method: 'POST' | 'GET') => Promise<{ status: number; body: Record<string, unknown> }>;
/** A growing town followed until it is whole or refused (requestCity's onLater); quiet on a network blip. `onFollow`
 * hears each step meanwhile (r7: the card says when it is ready to drive, with its test drive, and how far it is). */
async function follow(ask: Ask, place: PlaceSelection, onLater: (r: CityRequest) => void, signal?: AbortSignal, retried = false, onFollow?: (p: TownProgress) => void) {
  for (;;) {
    await sleep(followMs, signal);
    if (signal?.aborted) return;
    let a: Awaited<ReturnType<Ask>>;
    try { a = await ask('GET'); } catch { if (signal?.aborted) return; continue; }
    if (signal?.aborted) return;
    if (a.status === 200 && a.body.state === 'ready') { onLater(readyOf(place, a.body)); return; }
    if (a.status === 202) { onFollow?.(a.body as unknown as TownProgress); continue; }
    // (a build cut short by a restart: asked for once more, as requestCity does)
    if (a.status === 409 && a.body.state === 'interrupted' && !retried) { retried = true; try { await ask('POST'); } catch { /* the next GET says */ } continue; }
    // (a server busy or restarting answers 5xx for a moment: not the town's failure)
    if (a.status >= 500 && a.status !== 507) continue;
    onLater({ status: 'error', place, error: typeof a.body.error === 'string' ? a.body.error : NOT_NOW });
    return;
  }
}
