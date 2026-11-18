/**
 * Hometown: the places a town's open data puts in town that are not there (Colter Land's Bozeman, 17 Nov: its place
 * library had "Lamar Valley, Yellowstone National Park" on N 6th Ave and "Northeast Entrance Yellowstone" off Main St,
 * a park 60 km away; "Ramada by Wyndham" filed as a hospital; the Museum of the Rockies three times, a kilometre apart).
 * Overture's places carry listings geocoded to the nearest town and check-ins filed under a big name, so a town's
 * compiled places hold a few that are elsewhere, filed under the wrong kind, or the same place twice. A story sent
 * there sends a player of that town to the wrong spot. The compiler's places are kept as they are (its build id, the
 * tiles and every published world's lock stay the same); the Story Kit reads them through this sanity pass:
 *
 *   astrayOf(place, ctx)    why a place is not where (or what) the town says, or null:
 *                           far       its name is a distant landmark or national park ("Yellowstone Park", "Old
 *                                     Faithful", "Half Dome") more than FAR_KM from the town; a feature inside a named
 *                                     national park ("Lamar Valley, Yellowstone National Park"), anywhere
 *                           elsewhere its name says it is in another town ("Point Isabel Dog Park, Richmond") that is
 *                                     more than FAR_KM away (ctx.townsNamed: the Census gazetteer, lib/places)
 *                           nature    a park filed in town named for a backcountry feature, a waterfall, a geyser, a
 *                                     campground, a park entrance ("Grotto Falls", "Sunrise Campground")
 *                           kind      a public place (a park, a museum, a school, a hospital, a library, a stadium) whose
 *                                     name says it is something else: lodging, parking, an office ("Ramada by Wyndham"
 *                                     as a hospital, "Bridger Park Downtown Garage" as a park)
 *   withAstray(pkg, ctx)    the package with those places marked (place.astray), and the same public place listed
 *                           twice collapsed: copies within SAME_M of each other are one place (the first kept, the
 *                           others "duplicate"), and so are a park's anywhere (a big park, a shoreline); other copies
 *                           farther apart cannot all be it and none can be told to be, so all are marked "ambiguous"
 *                           (the name stays a landmark word; no key goes there). A business
 *                           of the same kind within BIZ_SAME_M of another is the same spot twice ("duplicate").
 *
 * A place marked astray is never offered to the builder (lib/storykit-hometown.ts hometownPlaceList), never a reach
 * swap's pick (approach.ts swapPlace) and refused by the gate when a pack names it (hometown-gate.ts astrayProblems),
 * except where a Mog's parent already did: a published world keeps playing and Mogging as it was (the engine's place
 * library is the compiler's, unchanged). Businesses and sensitive places keep their own names' rules (safety.ts): a
 * business is offered by a descriptor whatever it is called, and "Yellowstone Montessori Academy" is a school in
 * town named for the region, not the park.
 *
 * Pure functions: no network, no model. The landmark list is reviewed by hand (17 Nov 2026): add to it, never silently
 * drop from it. Boxes are approximate (degrees, [west, south, east, north]); FAR_KM covers their error.
 */
import type { CityPackage, PackagePlace } from './city-package.ts';
import { classify, LODGING_CHAINS } from './safety.ts';

export type Astray = NonNullable<PackagePlace['astray']>;
export type Anchor = { lat: number; lon: number };
export type AstrayContext = {
  /** the town's anchor (the Census internal point), degrees; null: the distance rules only refuse what is never in town */
  anchor?: Anchor | null;
  /** the town's own name ("Bozeman") */
  town?: string;
  /** US places by exact name (the Census gazetteer): for "Name, Town" listings */
  townsNamed?: (name: string) => { name: string; state: string; lat: number; lon: number }[];
};

/** km: a landmark or a town named in a place's name this far from the town is not in it (its box, plus this). */
export const FAR_KM = 30;
/** m: the same public place named twice this close is one place (a big park has entrances a few blocks apart). */
export const SAME_M = 400;
/** m: two businesses of one kind whose middles are this close are one storefront listed twice (x, z is the street
 *  front, snapped to the lane: neighbours share it, so the middle, cx, cz, is what tells them apart). */
export const BIZ_SAME_M = 3;

type Site = { name: string; box: [number, number, number, number]; core?: RegExp; np?: RegExp };
const W = (s: string) => new RegExp(`\\b(?:${s})\\b`, 'i');
/**
 * The US national parks (all 63) and the country's best-known landmarks. `core`: a name that alone means the site
 * ("Yellowstone", "Old Faithful"); `np`: one that means it only with "National Park" after it ("Glacier National
 * Park": a Glacier Bank is a bank). A place matches by either.
 */
export const SITES: Site[] = [
  { name: 'Acadia National Park', box: [-68.45, 44.2, -68.05, 44.45], np: W('acadia') },
  { name: 'National Park of American Samoa', box: [-170.85, -14.3, -169.4, -14.2], np: W('american samoa') },
  { name: 'Arches National Park', box: [-109.7, 38.6, -109.45, 38.85], np: W('arches'), core: W('delicate arch') },
  { name: 'Badlands National Park', box: [-102.9, 43.5, -101.9, 43.95], np: W('badlands') },
  { name: 'Big Bend National Park', box: [-103.8, 28.95, -102.85, 29.65], np: W('big bend') },
  { name: 'Biscayne National Park', box: [-80.4, 25.3, -80.1, 25.65], np: W('biscayne') },
  { name: 'Black Canyon of the Gunnison', box: [-107.85, 38.5, -107.6, 38.65], core: W('black canyon of the gunnison') },
  { name: 'Bryce Canyon National Park', box: [-112.3, 37.4, -112.05, 37.7], core: W('bryce canyon') },
  { name: 'Canyonlands National Park', box: [-110.25, 37.95, -109.55, 38.6], core: W('canyonlands') },
  { name: 'Capitol Reef National Park', box: [-111.4, 37.55, -111.0, 38.5], core: W('capitol reef') },
  { name: 'Carlsbad Caverns National Park', box: [-104.6, 32.05, -104.35, 32.25], core: W('carlsbad caverns') },
  { name: 'Channel Islands National Park', box: [-120.5, 33.4, -119.35, 34.1], np: W('channel islands') },
  { name: 'Congaree National Park', box: [-80.9, 33.75, -80.6, 33.85], np: W('congaree') },
  { name: 'Crater Lake National Park', box: [-122.3, 42.8, -121.95, 43.1], core: W('crater lake') },
  { name: 'Cuyahoga Valley National Park', box: [-81.65, 41.1, -81.45, 41.42], np: W('cuyahoga valley') },
  { name: 'Death Valley National Park', box: [-117.9, 35.6, -116.3, 37.3], core: W('death valley') },
  { name: 'Denali National Park', box: [-152.5, 62.5, -148.5, 64.0], np: W('denali') },
  { name: 'Dry Tortugas National Park', box: [-83.0, 24.55, -82.75, 24.75], core: W('dry tortugas') },
  { name: 'Everglades National Park', box: [-81.4, 24.95, -80.3, 25.9], np: W('everglades') },
  { name: 'Gates of the Arctic National Park', box: [-155.5, 66.5, -150.0, 68.5], core: W('gates of the arctic') },
  { name: 'Gateway Arch National Park', box: [-90.2, 38.62, -90.18, 38.63], core: W('gateway arch') },
  { name: 'Glacier National Park', box: [-114.5, 48.2, -113.2, 49.0], np: W('glacier'), core: W('going[- ]to[- ]the[- ]sun|many glacier|logan pass') },
  { name: 'Glacier Bay National Park', box: [-137.7, 58.2, -135.2, 59.3], np: W('glacier bay') },
  { name: 'Grand Canyon National Park', box: [-113.95, 35.7, -111.6, 36.6], core: W('grand canyon|bright angel') },
  { name: 'Grand Teton National Park', box: [-110.9, 43.6, -110.4, 44.1], core: W('grand teton') },
  { name: 'Great Basin National Park', box: [-114.35, 38.85, -114.1, 39.1], np: W('great basin') },
  { name: 'Great Sand Dunes National Park', box: [-105.7, 37.65, -105.4, 37.95], core: W('great sand dunes') },
  { name: 'Great Smoky Mountains National Park', box: [-84.05, 35.4, -83.0, 35.8], core: W('great smoky mountains|clingmans dome') },
  { name: 'Guadalupe Mountains National Park', box: [-104.95, 31.8, -104.7, 32.05], np: W('guadalupe mountains') },
  { name: 'Haleakala National Park', box: [-156.3, 20.65, -156.0, 20.8], core: W('haleakala') },
  { name: 'Hawaii Volcanoes National Park', box: [-155.7, 19.1, -154.95, 19.6], core: W('hawai.?i volcanoes|kilauea') },
  { name: 'Hot Springs National Park', box: [-93.1, 34.48, -93.0, 34.58], np: W('hot springs') },
  { name: 'Indiana Dunes National Park', box: [-87.25, 41.55, -86.8, 41.7], core: W('indiana dunes') },
  { name: 'Isle Royale National Park', box: [-89.35, 47.75, -88.4, 48.2], core: W('isle royale') },
  { name: 'Joshua Tree National Park', box: [-116.5, 33.65, -115.25, 34.15], np: W('joshua tree') },
  { name: 'Katmai National Park', box: [-156.5, 57.6, -153.5, 59.1], np: W('katmai') },
  { name: 'Kenai Fjords National Park', box: [-150.8, 59.4, -149.3, 60.2], core: W('kenai fjords') },
  { name: 'Kings Canyon National Park', box: [-119.0, 36.55, -118.35, 37.25], np: W('kings canyon') },
  { name: 'Kobuk Valley National Park', box: [-159.8, 66.9, -158.0, 67.6], core: W('kobuk valley') },
  { name: 'Lake Clark National Park', box: [-155.0, 59.8, -152.5, 61.4], np: W('lake clark') },
  { name: 'Lassen Volcanic National Park', box: [-121.65, 40.4, -121.25, 40.6], core: W('lassen volcanic|lassen peak') },
  { name: 'Mammoth Cave National Park', box: [-86.3, 37.1, -85.95, 37.35], core: W('mammoth cave') },
  { name: 'Mesa Verde National Park', box: [-108.6, 37.15, -108.3, 37.35], np: W('mesa verde'), core: W('cliff palace') },
  { name: 'Mount Rainier National Park', box: [-122.0, 46.75, -121.45, 47.05], np: W('mount rainier|mt\\.? rainier'), core: W('paradise inn') },
  { name: 'New River Gorge National Park', box: [-81.2, 37.7, -80.9, 38.1], np: W('new river gorge') },
  { name: 'North Cascades National Park', box: [-121.55, 48.35, -120.7, 49.0], np: W('north cascades') },
  { name: 'Olympic National Park', box: [-124.75, 47.45, -123.1, 48.2], np: W('olympic'), core: W('hurricane ridge|hoh rain ?forest') },
  { name: 'Petrified Forest National Park', box: [-109.95, 34.8, -109.6, 35.15], core: W('petrified forest') },
  { name: 'Pinnacles National Park', box: [-121.25, 36.45, -121.1, 36.55], np: W('pinnacles') },
  { name: 'Redwood National Park', box: [-124.2, 41.15, -123.85, 41.85], np: W('redwood') },
  { name: 'Rocky Mountain National Park', box: [-105.95, 40.15, -105.5, 40.55], np: W('rocky mountain'), core: W('trail ridge road|bear lake trailhead') },
  { name: 'Saguaro National Park', box: [-111.2, 32.1, -110.55, 32.35], np: W('saguaro') },
  { name: 'Sequoia National Park', box: [-118.95, 36.2, -118.3, 36.75], np: W('sequoia'), core: W('general sherman tree|moro rock') },
  { name: 'Shenandoah National Park', box: [-78.8, 38.0, -78.25, 38.9], np: W('shenandoah'), core: W('skyline drive') },
  { name: 'Theodore Roosevelt National Park', box: [-103.6, 46.75, -103.2, 47.65], np: W('theodore roosevelt') },
  { name: 'Virgin Islands National Park', box: [-64.8, 18.3, -64.65, 18.38], np: W('virgin islands') },
  { name: 'Voyageurs National Park', box: [-93.2, 48.3, -92.35, 48.65], np: W('voyageurs') },
  { name: 'White Sands National Park', box: [-106.6, 32.7, -106.15, 32.95], np: W('white sands') },
  { name: 'Wind Cave National Park', box: [-103.6, 43.5, -103.4, 43.65], np: W('wind cave') },
  { name: 'Wrangell-St. Elias National Park', box: [-145.5, 60.0, -139.0, 62.8], core: W('wrangell') },
  { name: 'Yellowstone National Park', box: [-111.16, 44.13, -109.83, 45.11], core: W('yellowstone|old faithful|grand prismatic|lamar valley|hayden valley|mammoth hot springs|norris geyser|upper geyser basin|west thumb') },
  { name: 'Yosemite National Park', box: [-119.9, 37.5, -119.2, 38.2], core: W('yosemite|half dome|el capitan|glacier point|mariposa grove|tuolumne meadows') },
  { name: 'Zion National Park', box: [-113.25, 37.15, -112.85, 37.5], np: W('zion'), core: W('angels landing|the narrows') },
  // the country's best-known landmarks
  { name: 'Mount Rushmore', box: [-103.48, 43.87, -103.44, 43.89], core: W('mount rushmore|mt\\.? rushmore') },
  { name: 'the Statue of Liberty', box: [-74.05, 40.68, -74.04, 40.7], core: W('statue of liberty') },
  { name: 'Times Square', box: [-73.99, 40.75, -73.98, 40.76], core: W('times square') },
  { name: 'the Golden Gate Bridge', box: [-122.48, 37.8, -122.47, 37.83], core: W('golden gate bridge') },
  { name: 'the Hollywood Sign', box: [-118.33, 34.13, -118.32, 34.14], core: W('hollywood sign') },
  { name: 'Niagara Falls', box: [-79.08, 43.07, -79.06, 43.09], core: W('niagara falls') },
  { name: 'Devils Tower', box: [-104.72, 44.58, -104.71, 44.6], core: W('devils tower|devil.s tower') },
  { name: 'the Space Needle', box: [-122.35, 47.62, -122.34, 47.63], core: W('space needle') },
  { name: 'the Las Vegas Strip', box: [-115.18, 36.08, -115.16, 36.15], core: W('las vegas strip') },
  { name: 'the Grand Canyon Skywalk', box: [-113.83, 36.0, -113.8, 36.02], core: W('skywalk') },
];
const NP_AFTER = /\bnational\s+park\b/i;
/** "Lamar Valley, Yellowstone National Park": a feature inside a named park, never a street-scale spot in a town. */
const INSIDE_PARK = /,\s*[^,]*\bnational\s+(?:park|monument|forest|preserve|recreation\s+area|seashore|lakeshore)\b/i;
/** A backcountry feature (a park filed in town under one of these is a listing, not a park in town). */
const NATURE = /\b(?:falls|waterfall|cascades?|geysers?|geyser basin|hot springs?|canyon|peak|summit|glacier|campground|campsite|trailhead|wilderness|buffalo jump|(?:north|south|east|west|northeast|northwest|southeast|southwest)\s+entrance|park entrance|entrance station)\b/i;
/** ... unless its name says it is a park of the town's own ("Falls Park", "Canyon Field", "Glacier Square"). */
const TOWN_PARK = /\b(?:park|field|fields|square|playground|garden|gardens|commons|green|plaza|greenway|riverwalk|pool|court|courts|dog park|skate ?park)\b/i;
/** The public kinds whose name is a place's own (displayName keeps it): checked against KIND_MISFIT. */
const PUBLIC_KINDS = /^(?:park|museum|library|stadium|hospital|school|university|college|community_center|attraction|landmark|monument|zoo|aquarium|theatre|arena)$/;
/** Words that say a place is lodging, parking or an office, not the public place its kind says. */
const KIND_MISFIT = /\b(?:hotel|motel|suites|inn|garage|parking|financial services|billing|associates|professionals|consulting|(?<!child |early |youth )development|llc|inc|biomedical|paragliding|realty|insurance)\b/i;

/** A national hotel chain's name in a place's name (safety.ts LODGING_CHAINS: never a public park or hospital). */
const brandIn = (brand: string, name: string) => new RegExp(`(?:^|[^a-z])${brand.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z])`).test(name.toLowerCase());
const KM_PER_DEG = 111.32;
/** km from a point to a box (0 inside). */
export function kmToBox(a: Anchor, box: [number, number, number, number]) {
  const [w, s, e, n] = box;
  const dLat = a.lat < s ? s - a.lat : a.lat > n ? a.lat - n : 0;
  const dLon = a.lon < w ? w - a.lon : a.lon > e ? a.lon - e : 0;
  return Math.hypot(dLat * KM_PER_DEG, dLon * KM_PER_DEG * Math.cos((a.lat * Math.PI) / 180));
}
const km = (a: Anchor, b: Anchor) => kmToBox(a, [b.lon, b.lat, b.lon, b.lat]);

/** The distant landmark a name names, if any (and how far the town is from it; Infinity with no anchor). */
export function siteIn(name: string, anchor?: Anchor | null): { site: Site; km: number } | null {
  for (const site of SITES) {
    const hit = site.core?.test(name) || (site.np && (() => { const m = site.np!.exec(name); return !!m && NP_AFTER.test(name.slice(m.index)); })());
    if (hit) return { site, km: anchor ? kmToBox(anchor, site.box) : Infinity };
  }
  return null;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’`.]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/^the /, '').trim();

/** Why a place is not where or what the town says (see the header), or null. Arrivals, homes, businesses and sensitive
 *  places are left to their own rules: a business is offered by a descriptor, a school named for the region is a school. */
export function astrayOf(p: Pick<PackagePlace, 'kind' | 'name' | 'tags'>, ctx: AstrayContext = {}): Astray | null {
  if (p.kind === 'arrival' || (p.tags ?? []).includes('generic-name')) return null;
  const c = classify({ kind: p.kind, name: p.name, tags: p.tags ?? [] });
  if (c.residence || c.business) return null;
  const name = p.name;
  if (INSIDE_PARK.test(name)) return { why: 'far', say: `a feature inside a national park, not a place in town` };
  if (!c.sensitive) {
    const s = siteIn(name, ctx.anchor);
    // (no anchor, no distance: a town's own "Yellowstone Park" cannot be told from the park's, so it is kept)
    if (s && Number.isFinite(s.km) && s.km > FAR_KM) return { why: 'far', say: `named for ${s.site.name}, ${Math.round(s.km)} km away` };
  }
  // ("Point Isabel Dog Park, Richmond": a listing in another town; far from this one, it is not here)
  const tail = /,\s*([^,]{3,40})$/.exec(name)?.[1]?.replace(/\s+(?:[A-Z]{2}|California|Montana|Texas|Oregon|Washington|Colorado|Wyoming|Idaho|Utah|Nevada|Arizona)$/, '').trim();
  if (tail && ctx.anchor && ctx.townsNamed && norm(tail) !== norm(ctx.town ?? '')) {
    const towns = ctx.townsNamed(tail);
    if (towns.length && towns.every((t) => km(ctx.anchor!, t) > FAR_KM)) {
      const t = towns.reduce((a, b) => (km(ctx.anchor!, a) <= km(ctx.anchor!, b) ? a : b));
      return { why: 'elsewhere', say: `in ${t.name}, ${t.state}, ${Math.round(km(ctx.anchor, t))} km away` };
    }
  }
  // (a public kind whose name is lodging, parking or an office, "Ramada by Wyndham" as a hospital: misfiled, sensitive or not)
  if (PUBLIC_KINDS.test(p.kind) && (KIND_MISFIT.test(name) || LODGING_CHAINS.some((b) => brandIn(b, name)))) return { why: 'kind', say: `filed as a ${p.kind.replace(/_/g, ' ')} but named as lodging, parking or an office` };
  if (c.sensitive) return null;
  if (/^(?:park|attraction|landmark|viewpoint|nature_reserve|campground|camp_site)$/.test(p.kind) && NATURE.test(name) && !TOWN_PARK.test(name)) {
    return { why: 'nature', say: 'a backcountry feature (a waterfall, a campground, a park entrance) listed in town' };
  }
  return null;
}

/** The package with its astray places marked (a copy; see the header). Idempotent. */
export function withAstray(pkg: CityPackage, ctx: AstrayContext = {}): CityPackage {
  const ctx2 = { town: pkg.name, ...ctx };
  const mark = new Map<string, Astray>();
  for (const p of pkg.places) { const a = p.astray ?? astrayOf(p, ctx2); if (a) mark.set(p.id, a); }
  // the same public place twice: by kind and name; the same storefront twice: by kind and spot
  const live = pkg.places.filter((p) => p.kind !== 'arrival' && !mark.has(p.id) && !classify(p).residence);
  // (a business, or a place the compiler already named by a descriptor, "the corner store on N 7th Ave": by its spot)
  const bySpot = (p: PackagePlace) => classify(p).business || /^the [a-z]/.test(p.name);
  const mid = (p: PackagePlace) => [p.cx ?? p.x, p.cz ?? p.z];
  const apart = (a: PackagePlace, b: PackagePlace) => { const [ax, az] = mid(a), [bx, bz] = mid(b); return Math.hypot(ax - bx, az - bz); };
  // (the first listed is kept: the compiler's order, stable across reads)
  const order = new Map(pkg.places.map((p, i) => [p.id, i]));
  const first = (xs: PackagePlace[]) => [...xs].sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  const groups = new Map<string, PackagePlace[]>();
  for (const p of live) {
    if (bySpot(p)) continue;
    const k = `${p.kind}|${norm(p.name)}`;
    if (!norm(p.name)) continue;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  for (const xs of groups.values()) {
    if (xs.length < 2) continue;
    // (a park listed far apart is one big park, a shoreline or a greenway, any of whose ends is in it: the first kept)
    const far = xs[0].kind !== 'park' && xs.some((a) => xs.some((b) => apart(a, b) > SAME_M));
    if (far) { for (const p of xs) mark.set(p.id, { why: 'ambiguous', say: `${xs.length} places in town have this name, a long way apart: which one is it cannot be told` }); continue; }
    const [keep, ...rest] = first(xs);
    for (const p of rest) mark.set(p.id, { why: 'duplicate', say: `the same place as @${keep.id}`, of: keep.id });
  }
  const biz = live.filter(bySpot);
  const byKind = new Map<string, PackagePlace[]>();
  for (const p of biz) byKind.set(p.kind, [...(byKind.get(p.kind) ?? []), p]);
  for (const xs of byKind.values()) {
    const kept: PackagePlace[] = [];
    for (const p of first(xs)) {
      const same = kept.find((q) => apart(q, p) <= BIZ_SAME_M);
      if (same) mark.set(p.id, { why: 'duplicate', say: `the same spot as @${same.id}`, of: same.id }); else kept.push(p);
    }
  }
  if (!mark.size) return pkg;
  return { ...pkg, places: pkg.places.map((p) => (mark.has(p.id) && !p.astray ? { ...p, astray: mark.get(p.id)! } : p)) };
}

/** The ids of a package's astray places. */
export const astrayIds = (pkg: Pick<CityPackage, 'places'>) => new Set(pkg.places.filter((p) => p.astray).map((p) => p.id));
/** Whether a landmark's name is still a fair word for the town's lines (an ambiguous copy's name is; a distant
 *  landmark's, a backcountry feature's or a misfiled one's is not). */
export const astrayWordOk = (a: Astray | undefined) => !a || a.why === 'ambiguous' || a.why === 'duplicate';
