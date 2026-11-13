/**
 * Hometown: THE play box of a town (task G1). One rule for the on-demand builder (lib/hometown-build/towns.ts), the
 * pre-warm list (lib/hometown-tiles/prewarm-list.ts) and stage 1 (lib/hometown-build/grid.ts), so a pre-warmed town is
 * a hit for the same town asked on demand: the same box, the same tile set, the same manifest and lock.
 *
 * The rule is the compiler's own cap, MogCity tools/hometown/fetch.py resolve(), applied to the place search's box
 * (lib/places/search.ts toPlace, sized from the Census area) round the Census internal point:
 *
 *   kx = 111320 * cos(lat)        (no clamp: fetch.py has none, and every US place is under 72 degrees)
 *   half_x = 4500 / 2 / kx, half_y = 4500 / 2 / 111132
 *   W = max(W, lon - half_x), E = min(E, lon + half_x), S = max(S, lat - half_y), N = min(N, lat + half_y)
 *   each rounded as Python's round(v, 6)
 *
 * The box is an input of every manifest built for the town: changing this rule changes towns, so it needs a new build.
 * scripts/hometown-build-pycheck.py checks it against fetch.py's own expressions (inspect.getsource) on 1,000 places.
 */
import type { Place } from '../places/types.ts';

export const MAX_SIDE_M = 4500;
export type Box = [number, number, number, number];

/** Python's round(v, 6) for a float: the decimal nearest the double's exact value, read back as a double. */
export const pyRound6 = (v: number) => Number(v.toFixed(6));

/** The canonical play box ([W, S, E, N], degrees) of a picked place. */
export function playBox(p: Pick<Place, 'lat' | 'lon' | 'bbox'>): Box {
  const lat = p.lat, lon = p.lon;
  const kx = 111320 * Math.cos((lat * Math.PI) / 180);
  const halfX = MAX_SIDE_M / 2 / kx, halfY = MAX_SIDE_M / 2 / 111132;
  const [W0, S0, E0, N0] = p.bbox;
  const W = Math.max(W0, lon - halfX), E = Math.min(E0, lon + halfX);
  const S = Math.max(S0, lat - halfY), N = Math.min(N0, lat + halfY);
  return [pyRound6(W), pyRound6(S), pyRound6(E), pyRound6(N)];
}

/** What the gazetteer entry says about the box (places.json bboxSource). */
export const BOX_SOURCE = `the place search's box capped at ${MAX_SIDE_M} m a side round the Census internal point (fetch.py's cap; GameMog lib/hometown/box.ts)`;

/** A short stable hash of a box, for job keys (frame:{build}:{place}:{boxHash}). */
export function boxHash(b: Box): string {
  // (FNV-1a over the canonical text: no crypto import, so the browser could share it)
  let h = 0x811c9dc5;
  for (const ch of b.map((v) => v.toFixed(6)).join(',')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
