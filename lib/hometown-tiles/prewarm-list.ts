/**
 * The pre-warm list: the towns built ahead of their first player, the top N US places by 2010 population (rows with no
 * 2010 population drop out) plus the owner's named towns, from the offline Census index (lib/places/search.ts). The
 * output is the compiler's own gazetteer (MogCity tools/hometown/places.json format, `--places`), so the box a town
 * is built from is decided here, once: a square of at most PLAY_SIDE_M around the Census internal point, no bigger
 * than the town's own search box (lib/places/search.ts toPlace), the same cap as fetch.py MAX_SIDE_M. The box is an
 * input of every manifest built for the town, so changing this rule needs a new build.
 */
import { loadIndex, toPlace, type Place } from '../places/search.ts';
import { playBox as canonicalPlayBox, BOX_SOURCE, MAX_SIDE_M } from '../hometown/box.ts';

export const PLAY_SIDE_M = MAX_SIDE_M;
/** The owner-named towns (the three demo towns), always on the list. */
export const NAMED = ['us-4054200', 'us-0455000', 'us-4261000'];

export type GazetteerPlace = { name: string; geoid: string; anchor: [number, number]; anchorSource: string; bbox: [number, number, number, number]; bboxSource: string; pop2010: number | null };

/** A town's play box: THE canonical box (lib/hometown/box.ts), the same as an on-demand ask's. */
export const playBox = (p: Pick<Place, 'lat' | 'lon' | 'bbox'>) => canonicalPlayBox(p);

let BY_GEOID: Map<string, number> | null = null;
export function placeById(id: string): Place | null {
  const ix = loadIndex();
  if (!BY_GEOID) BY_GEOID = new Map(ix.geoid.map((g, i) => [g, i]));
  const i = BY_GEOID.get(id.replace(/^us-/, ''));
  return i == null ? null : toPlace(ix, i);
}

export function prewarmList(n: number, named: string[] = NAMED): { places: Record<string, GazetteerPlace>; order: string[]; skippedNoPop: number } {
  const ix = loadIndex();
  const rows: number[] = [];
  let skippedNoPop = 0;
  for (let i = 0; i < ix.geoid.length; i++) { if (ix.pop[i] >= 0) rows.push(i); else skippedNoPop++; }
  rows.sort((a, b) => ix.pop[b] - ix.pop[a] || (ix.geoid[a] < ix.geoid[b] ? -1 : 1));
  const ids = [...named, ...rows.slice(0, n).map((i) => `us-${ix.geoid[i]}`)];
  const places: Record<string, GazetteerPlace> = {}, order: string[] = [];
  for (const id of ids) {
    if (places[id]) continue;
    const p = placeById(id);
    if (!p) throw new Error(`no place ${id} in the index`);
    places[id] = {
      name: `${p.name}, ${p.state}`, geoid: p.geoid, anchor: [p.lon, p.lat],
      anchorSource: `Census Gazetteer INTPTLAT/INTPTLONG (GEOID ${p.geoid})`, bbox: playBox(p),
      bboxSource: BOX_SOURCE, pop2010: p.pop,
    };
    order.push(id);
  }
  return { places, order, skippedNoPop };
}
