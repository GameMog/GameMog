/**
 * Hometown: the sanity pass on a town's places (storykit/hometown/astray.ts). Part of `npm run check`; alone:
 *   node --import ./scripts/ts-resolve.mjs scripts/hometown-astray-check.ts
 *
 * Colter Land's Bozeman (17 Nov) had "Lamar Valley, Yellowstone National Park" on N 6th Ave, "Northeast Entrance
 * Yellowstone" off Main St, a hotel filed as a hospital and the Museum of the Rockies three times. Checked: each rule
 * marks what it is meant to (and lets by what it is not: a gateway town's own park names, a school named for the
 * region, a town's "Falls Park"), the builder never reads a marked place, the gate refuses one in a Create and lets a Mog
 * keep what its parent named, a reach swap never picks one, and the package's lock is untouched.
 */
import { readFileSync } from 'node:fs';
import type { PackV2 } from '../storykit/pack/gate.ts';
import { cityLock, packageProblems, type CityPackage, type PackagePlace } from '../storykit/hometown/city-package.ts';
import { astrayOf, withAstray, siteIn, SITES, FAR_KM } from '../storykit/hometown/astray.ts';
import { gateHometown } from '../storykit/hometown/hometown-gate.ts';
import { swapPlace } from '../storykit/hometown/approach.ts';
import { hometownPlaceList, checkHometownReply, townForStory } from '../lib/storykit-hometown.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const R = (p: string) => JSON.parse(readFileSync(`storykit/hometown/fixtures/${p}`, 'utf8'));
const reply = (r: { meta: unknown; pack: unknown }) => '```json\n' + JSON.stringify(r.meta) + '\n```\n\n```json\n' + JSON.stringify(r.pack) + '\n```';
const show = (xs: string[]) => xs.slice(0, 3).join(' | ').slice(0, 400);

/** Census anchors (lib/places/us-places.tsv.gz). */
const BOZEMAN = { lat: 45.68315, lon: -111.05378 }, WEST_YELLOWSTONE = { lat: 44.66218, lon: -111.10702 };

export function runAstrayChecks(ok: Ok) {
  console.log('\nHometown: the sanity pass on a town\'s places (storykit/hometown/astray.ts)');
  const P = (name: string, kind = 'park', extra: Partial<PackagePlace> = {}) => ({ kind, name, tags: [`overture=${kind}`], ...extra });
  const why = (name: string, kind = 'park', anchor = BOZEMAN) => astrayOf(P(name, kind), { anchor, town: 'Bozeman' })?.why ?? null;

  // ── the rules ──
  ok('every landmark in the list has a box and a name to match', SITES.length >= 70 && SITES.every((s) => s.box.length === 4 && s.box[0] < s.box[2] && s.box[1] < s.box[3] && (s.core || s.np)));
  ok('Bozeman\'s Yellowstone entries are far (the park is over FAR_KM away)', ['Yellowstone Park', 'Yellowstone National Park', 'Northeast Entrance Yellowstone'].every((n) => why(n) === 'far') && siteIn('Yellowstone Park', BOZEMAN)!.km > FAR_KM);
  ok('a feature inside a named national park is never in town, gateway or not ("Lamar Valley, Yellowstone National Park")', why('Lamar Valley, Yellowstone National Park') === 'far' && why('Grand Prismatic, Yellowstone National Park', 'park', WEST_YELLOWSTONE) === 'far');
  ok('a gateway town keeps its own park names (West Yellowstone\'s "Yellowstone Park" is next to the park)', why('Yellowstone Park', 'park', WEST_YELLOWSTONE) === null);
  ok('a far landmark by its feature name ("Old Faithful", "Half Dome") is far; a bare "Glacier" needs "National Park"', why('Old Faithful') === 'far' && why('Half Dome') === 'far' && why('Glacier Park') === null && why('Glacier National Park') === 'far');
  ok('a school, a business or a church named for the region is left to its own rules ("Yellowstone Montessori Academy")', why('Yellowstone Montessori Academy', 'school') === null && why('Yellowstone Coffee', 'coffee_shop') === null && why('Zion Lutheran Church', 'place_of_worship') === null);
  ok('a backcountry feature filed as a park in town is marked; a town\'s own "Falls Park" is not', why('Grotto Falls') === 'nature' && why('Palisade Falls Bozeman Mt') === 'nature' && why('Sunrise Campground') === 'nature' && why('Falls Park') === null && why('Canyon Skate Park') === null);
  ok('a public kind named as lodging, parking or an office is misfiled (even a hospital); a "Child Development Center" is not', why('Ramada by Wyndham Bozeman', 'hospital') === 'kind' && why('Bridger Park Downtown Garage') === 'kind' && why('Allpro Development', 'school') === 'kind' && why('Little Steps Child Development Center', 'school') === null);
  const towns = (n: string) => (n === 'Richmond' ? [{ name: 'Richmond', state: 'VA', lat: 37.53, lon: -77.47 }] : n === 'Berkeley' ? [{ name: 'Berkeley', state: 'CA', lat: 37.87, lon: -122.27 }] : []);
  const OAK = { lat: 37.77, lon: -122.22 };
  ok('"Name, Town" in another town far away is elsewhere; a neighbour town is not', astrayOf(P('Some Dog Park, Richmond'), { anchor: OAK, townsNamed: towns })?.why === 'elsewhere' && astrayOf(P('Lawrence Hall of Science, Berkeley', 'museum'), { anchor: OAK, townsNamed: towns }) === null);
  ok('with no anchor, a distant name alone is kept (no distance to tell by)', astrayOf(P('Yellowstone Park'), {}) === null && astrayOf(P('Lamar Valley, Yellowstone National Park'), {})?.why === 'far');

  // ── the package: a fixture town given Bozeman's bad entries ──
  const OK0: CityPackage = R('okemah.citypackage.json');
  const add = (id: string, kind: string, name: string, x: number, z: number, cx?: number, cz?: number): PackagePlace => ({ id, kind, name, x, z, tags: [`overture=${kind}`], ...(cx != null ? { cx, cz } : {}) });
  const town: CityPackage = { ...clone(OK0), places: [...OK0.places,
    add('lamar', 'park', 'Lamar Valley, Yellowstone National Park', 40, 40), add('ne-entrance', 'park', 'Northeast Entrance Yellowstone', 60, 60), add('ys-park', 'park', 'Yellowstone Park', 70, 70),
    add('ramada', 'hospital', 'Ramada by Wyndham', 80, 80), add('mor', 'museum', 'Museum of the Rockies', 100, 100), add('mor2', 'museum', 'Museum Of The Rockies', 1500, 100),
    add('cooper', 'park', 'Cooper Park', 200, 200), add('cooper2', 'park', 'Cooper Park', 520, 380), add('bank1', 'bank', 'the bank on Broadway', 300, 300, 310, 300), add('bank2', 'bank', 'the bank on Broadway', 300, 300, 311, 301),
    add('bank3', 'bank', 'the bank on Broadway', 300, 300, 330, 300)] };
  // (a compiled town's landmarks are its public places: lib/hometown/bundle.ts cityPackageOf)
  town.landmarks = [...town.landmarks, ...['lamar', 'mor', 'mor2', 'cooper'].map((id) => { const p = town.places.find((q) => q.id === id)!; return { id, name: p.name, kind: p.kind, x: p.x, z: p.z }; })];
  const S = withAstray(town, { anchor: BOZEMAN });
  const at = (id: string) => S.places.find((p) => p.id === id)!.astray?.why ?? null;
  ok('the package keeps every place and its lock (marks only, never a key removed)', S.places.length === town.places.length && JSON.stringify(cityLock(S)) === JSON.stringify(cityLock(town)) && packageProblems(S).length === 0);
  ok('the fixture town\'s own places are all kept', OK0.places.every((p) => !S.places.find((q) => q.id === p.id)!.astray), S.places.filter((p) => p.astray && OK0.places.some((q) => q.id === p.id)).map((p) => p.id).join());
  ok('far, misfiled, ambiguous and duplicate places are marked', at('lamar') === 'far' && at('ne-entrance') === 'far' && at('ys-park') === 'far' && at('ramada') === 'kind' && at('mor') === 'ambiguous' && at('mor2') === 'ambiguous', S.places.filter((p) => p.astray).map((p) => `${p.id}:${p.astray!.why}`).join());
  ok('a park listed twice is one park (the first kept); two storefronts at one middle are one; a neighbour is not', at('cooper') === null && at('cooper2') === 'duplicate' && at('bank1') === null && at('bank2') === 'duplicate' && at('bank3') === null);
  ok('the pass is idempotent', JSON.stringify(withAstray(S, { anchor: BOZEMAN })) === JSON.stringify(S));

  // ── the builder never reads one ──
  const list = hometownPlaceList(S);
  ok('the builder\'s place list leaves every marked place out (key and name)', !/@(lamar|ne-entrance|ys-park|ramada|mor|mor2|cooper2|bank2):/.test(list) && !/Yellowstone|Ramada/.test(list) && list.includes('@cooper:') && list.includes('@bank1:'), list.split('\n').filter((l) => /lamar|Yellow|ramada|@mor/.test(l)).join(' | '));
  ok('an ambiguous name stays a landmark word, once; a far one is not a word', /Landmarks[^\n]*Museum of the Rockies/.test(list) && (list.match(/Museum of the Rockies/gi) ?? []).length === 1 && !/Landmarks[^\n]*Lamar/.test(list));

  // ── the gate: a Create may not name one; a Mog keeps what its parent named ──
  const okReply = R('okemah.reply.json');
  const base = checkHometownReply(reply(okReply), { pkg: S, id: 'sk-astray1' });
  ok('the fixture story passes on the marked town (it names none of them)', base.problems.length === 0 && !!base.pack, show(base.problems));
  const toLamar = clone(okReply); toLamar.pack.acts[0].missions[1].steps[0].to = '@lamar';
  const refused = checkHometownReply(reply(toLamar), { pkg: S, id: 'sk-astray2' });
  ok('a Create sending a mission to a marked place is sent back, saying why', refused.problems.some((p) => /@lamar is not a place to use in Okemah: a feature inside a national park/.test(p)), show(refused.problems));
  const dup = clone(okReply); dup.pack.acts[0].missions[1].steps[0].to = '@bank2';
  ok('a duplicate is sent back pointing at the place it duplicates', checkHometownReply(reply(dup), { pkg: S, id: 'sk-astray3' }).problems.some((p) => /@bank2 .*\(use @bank1\)/.test(p)));
  const parent = checkHometownReply(reply(toLamar), { pkg: town, id: 'sk-astray4' }).pack as PackV2;
  ok('(a world published before the pass named the place: it passed then)', !!parent);
  const mogReply = clone(toLamar); delete mogReply.pack.base; mogReply.pack.title = 'Valley Moon';
  const mog = checkHometownReply(reply(mogReply), { pkg: S, id: 'sk-astray5', parent });
  ok('a Mog of that world keeps the place its parent named', mog.problems.length === 0, show(mog.problems));
  const mog2 = clone(mogReply); mog2.pack.acts[0].missions[2].steps[1].arena = '@ne-entrance';
  ok('a Mog naming a marked place its parent did not is sent back', checkHometownReply(reply(mog2), { pkg: S, id: 'sk-astray6', parent }).problems.some((p) => /@ne-entrance is not a place to use/.test(p)));

  // ── a reach swap never picks one ──
  const swapTown: CityPackage = { ...clone(S), places: [...S.places, add('bank-far', 'bank', 'the bank on Main', 900, 900)] };
  const sp = clone(base.pack!) as PackV2; sp.places = { ...(sp.places ?? {}), vault: { '@': 'bank1', name: 'the bank' } }; sp.acts[0].missions[1].steps[0].to = '@vault';
  const sw = swapPlace(sp, { mission: sp.acts[0].missions[1].id, step: 0, at: 'vault', place: 'bank1' }, swapTown, (p) => gateHometown(p, swapTown).ok);
  ok('a reach swap passes over a duplicate for a place that is not one', sw?.swap.to === 'bank3' || sw?.swap.to === 'bank-far', JSON.stringify(sw?.swap ?? null));

  // ── the lib's read: Census anchor and gazetteer ──
  const t = townForStory({ ...clone(town), placeId: 'us-3008950', name: 'Bozeman', state: 'Montana' });
  ok('townForStory reads the town\'s Census anchor (Bozeman: the Yellowstone names are far)', t.places.find((p) => p.id === 'ys-park')!.astray?.why === 'far' && t.places.find((p) => p.id === 'ne-entrance')!.astray?.why === 'far');
  const wy = townForStory({ ...clone(town), placeId: 'us-3079525', name: 'West Yellowstone', state: 'Montana' });
  ok('... and West Yellowstone\'s own are kept (the park is at its edge); a feature inside the park is not in it either way', !wy.places.find((p) => p.id === 'ys-park')!.astray && wy.places.find((p) => p.id === 'lamar')!.astray?.why === 'far');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failures = 0;
  runAstrayChecks((name, cond, detail = '') => { if (!cond) failures++; console.log(`${cond ? '  ok  ' : 'FAIL  '}${name}${!cond && detail ? `\n        ${detail}` : ''}`); });
  console.log(`\n${failures ? `${failures} FAILED` : 'all astray checks passed'}\n`);
  process.exit(failures ? 1 : 0);
}
