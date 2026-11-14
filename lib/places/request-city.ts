import type { PlaceSelection } from './types.ts';

/** A town's build as the Create page shows it (POST /api/towns, then GET /api/towns/{placeId} every 2 s). */
export type TownProgress = {
  state: string; stage: string; done: number; total: number; position: number; etaS: number | null;
  /** the production builder (lib/hometown-build/towns.ts): asked, framing, district (the story may start), growing (drive
   *  now: the rest keeps building), full; the wait to drive and to the whole town */
  phase?: string; district?: boolean; etaDriveS?: number | null; etaFullS?: number | null;
};
/** The lock a ready town pins (base.hometown); the page sends only the place id, the server reads the rest. */
export type TownLockView = { place: string; compiler: string; tiles: string };
export type CityRequest =
  | { status: 'ready'; place: PlaceSelection; lock: TownLockView; town: { name: string; state: string; places: number; streets: number }; growing?: boolean }
  | { status: 'error'; place: PlaceSelection; error: string };

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
});
const NOT_NOW = 'We couldn\'t build this town right now. Try again.';

/**
 * Asks for a town's city (Hometown, lib/hometown/towns.ts): POST /api/towns with the picked place's id (the browser
 * sends nothing else; the server resolves the place and its box), then polls its build every 2 s, telling `onProgress`
 * each step, until it is ready or refused. A build cut short (a restart) is asked for once more. The build goes on if
 * the tab closes; `signal` only stops this page waiting.
 */
export async function requestCity(place: PlaceSelection, onProgress?: (p: TownProgress) => void, signal?: AbortSignal): Promise<CityRequest> {
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
      if (a.status === 200 && a.body.state === 'ready') return { status: 'ready', place, lock: a.body.lock as TownLockView, town: a.body.town as Extract<CityRequest, { status: 'ready' }>['town'] };
      // (the production builder: the town's frame is in, so the story may be written now while the rest builds)
      if (a.status === 202 && a.body.lock && a.body.town && (a.body.phase === 'district' || a.body.phase === 'growing')) return { status: 'ready', place, lock: a.body.lock as TownLockView, town: a.body.town as Extract<CityRequest, { status: 'ready' }>['town'], growing: true };
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
