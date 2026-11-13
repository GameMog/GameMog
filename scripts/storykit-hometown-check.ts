/**
 * Hometown (Build Spec v1): the Story Kit builder grounded in a town's CityPackage, the town lock on Mogs, and the
 * real-place safety rules. Part of `npm run check`; alone:
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-hometown-check.ts
 *
 * No model call: the builder's replies are fixtures (storykit/hometown/fixtures/*.reply.json, a stand-in model's two
 * blocks), checked by the same pass the build loop would run (lib/storykit-hometown.ts checkHometownReply). Checked:
 * the packages (an Okemah-like fixture town and San Francisco's place library through its adapter), the builder's
 * context (homes never offered, businesses by descriptor, sensitive places marked, the rules), both fixture stories
 * passing with every place they name in the town, the gate's rule 16 (no table, a table for another city, a pin that is
 * not the package's), the Mog lock (place, compiler version and tile set, each refused when moved, and a recompiled
 * package refused for a pinned Mog), and each safety rule refusing what it is meant to (and letting by what it is not).
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gatePack, type PackV2 } from '../storykit/pack/gate.ts';
import { PLACES, foreignIn } from '../storykit/pack/cities.ts';
import { places as sfLibrary } from '../storykit/cities/sf/city.js';
import { packageProblems, hometownBase, cityLock, tileSetHash, type CityPackage } from '../storykit/hometown/city-package.ts';
import { classify, displayName, withheldNames, SENSITIVE_KINDS, violenceIn } from '../storykit/hometown/safety.ts';
import { gateHometown, cityTableOf, storyPlan, violentMissions, unknownPlaces } from '../storykit/hometown/hometown-gate.ts';
import { sfCityPackage, SF_PLACE_ID } from '../storykit/hometown/sf-package.ts';
import { hometownPlaceList, hometownSystem, hometownTurn, checkHometownReply, REAL_PLACE_RULES } from '../lib/storykit-hometown.ts';
import { storykitSystem, placeList } from '../lib/storykit-build.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;
const R = (p: string) => JSON.parse(readFileSync(`storykit/hometown/fixtures/${p}`, 'utf8'));
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const reply = (r: { meta: unknown; pack: unknown }) => '```json\n' + JSON.stringify(r.meta) + '\n```\n\n```json\n' + JSON.stringify(r.pack) + '\n```';
const show = (xs: string[]) => xs.slice(0, 3).join(' | ').slice(0, 400);

export function runHometownChecks(ok: Ok) {
  console.log('\nHometown: the builder reads the town, the town lock, real-place safety (storykit/hometown)');
  const OK: CityPackage = R('okemah.citypackage.json'), SF = sfCityPackage();

  // ── the packages ──
  ok('the Okemah fixture is a readable city package', packageProblems(OK).length === 0, show(packageProblems(OK)));
  ok('San Francisco\'s adapter builds a readable city package', packageProblems(SF).length === 0, show(packageProblems(SF)));
  const sfKeys = SF.places.map((p) => p.id).sort().join();
  ok('SF\'s package offers exactly the keys of the gate\'s San Francisco list (arrivals and the place library)', sfKeys === Object.keys(PLACES.sf).sort().join(), `${SF.places.length} places`);
  const lib = sfLibrary() as Record<string, { x: number; z: number; foot?: boolean }>;
  ok('SF\'s library places keep city.js\'s coordinates and walk-only marks', Object.entries(lib).every(([k, p]) => { const q = SF.places.find((x) => x.id === k)!; return q.x === p.x && q.z === p.z && !!q.foot === !!p.foot; }));
  ok('SF\'s package has districts, landmarks in the core, arrivals and roads', SF.districts.length >= 10 && SF.landmarks.length > 100 && SF.spawnPoints.length === 14 && SF.roadsSummary.streets > 100);
  ok('SF\'s tile set hash is the city data files\' (64 hex, stable)', /^[0-9a-f]{64}$/.test(SF.tileSet.hash) && SF.tileSet.count > 2 && SF.placeId === SF_PLACE_ID);
  ok('the tile set hash ignores order and changes with any tile', tileSetHash([{ id: 'a', sha256: '1' }, { id: 'b', sha256: '2' }]) === tileSetHash([{ id: 'b', sha256: '2' }, { id: 'a', sha256: '1' }]) && tileSetHash([{ id: 'a', sha256: '1' }]) !== tileSetHash([{ id: 'a', sha256: '3' }]));
  ok('a broken package is refused, each problem named', packageProblems({ ...OK, placeId: 'Okemah!', tileSet: { hash: 'x', count: 0 }, places: [OK.places[0], OK.places[0]] }).length >= 3);

  // ── the reviewed kind list and the classifier ──
  const C = (kind: string, name = 'X', tags: string[] = []) => classify({ kind, name, tags });
  ok('the reviewed list covers every rule\'s kind (school, childcare, health, worship, police, fire, memorial, shelter)', ['school', 'kindergarten', 'hospital', 'clinic', 'place_of_worship', 'police', 'fire_station', 'memorial', 'grave_yard', 'social_facility'].every((k) => SENSITIVE_KINDS[k]));
  ok('OSM kinds, Overture categories and names each make a place sensitive', C('hospital').sensitive === 'health' && C('yes', 'X', ['overture=elementary_school']).sensitive === 'school' && C('yes', "Saint Mark's Lutheran Church").sensitive === 'worship' && C('yes', 'Tenderloin Police Station').sensitive === 'police' && C('yes', 'Next Door Shelter').sensitive === 'shelter');
  ok('a home is a home (by kind, by name, or tagged private), a business by kind or brand', C('house').residence && C('apartments').residence && C('yes', "Fire Chief's Residence").residence && C('yes', 'X', ['private']).residence && C('fast_food').business && C('yes', 'X', ['brand=Somebrand']).business && !C('park').business);
  ok('a public place keeps its name; a business goes by a descriptor; a home is never offered', displayName(OK.places.find((p) => p.id === 'water-tower')!) === 'the water tower' && displayName(OK.places.find((p) => p.id === 'prairie-rose')!) === 'the diner on Broadway' && displayName(OK.places.find((p) => p.id === 'hollow-creek-house')!) === null);
  const held = withheldNames(OK).map((w) => w.name);
  ok('the withheld names: the town\'s businesses, brands, homes and memorials, and the national chains', ['Prairie Rose Diner', 'BurgerBarn', 'Crossroads Fuel', 'Thunderbird Motel', 'the Hollow Creek house', 'Veterans Memorial', 'Walmart'].every((n) => held.includes(n)) && !held.includes('the salvage yard') && !held.includes('the water tower'), held.join(', ').slice(0, 300));

  // ── the builder's context ──
  const list = hometownPlaceList(OK);
  ok('the builder reads every public place of the town by its key', OK.places.filter((p) => !classify(p).residence).every((p) => list.includes(`@${p.id}:`)));
  ok('the builder never reads a home (its key or its name)', !list.includes('hollow-creek-house') && !list.includes('Hollow Creek'));
  ok('the builder never reads a business\'s real name, only its descriptor', !/Prairie Rose|BurgerBarn|Crossroads Fuel|Thunderbird|Feed & Seed/.test(list) && list.includes('the diner on Broadway') && list.includes('the gas station on Highway 62'));
  ok('the builder reads which places are sensitive, the districts, arrivals, roads and the rules', /@high-school: Okemah High School \([^)]*\*\*sensitive\*\*/.test(list) && list.includes('the East Side') && list.includes('Arrivals') && list.includes('Highway 62') && list.includes(REAL_PLACE_RULES));
  const sys = hometownSystem(OK);
  ok('the system prompt carries the town, not New York\'s place list', sys.includes(list) && sys.includes('playing Okemah, Oklahoma') && !sys.includes("Mog City's place list (base.city \"ny\""));
  ok('the New York system prompt is unchanged by the place-list parameter', storykitSystem('ny') === storykitSystem('ny', placeList('ny')));
  ok('a Create\'s turn pins the town\'s base exactly', hometownTurn('a mechanic comes home', OK).includes(JSON.stringify(hometownBase(OK))));
  ok('SF\'s builder list is the gate\'s SF keys (the same path as a town)', Object.keys(PLACES.sf).every((k) => hometownPlaceList(SF).includes(`@${k}:`)));

  // ── the fixture stories (the stand-in model's replies) ──
  const okReply = R('okemah.reply.json'), sfReply = R('sf.reply.json');
  const okPass = checkHometownReply(reply(okReply), { pkg: OK, id: 'sk-okemah1' });
  ok('an Okemah story (6 missions, a fight, a chase) passes the builder\'s pass in the town', okPass.problems.length === 0 && !!okPass.pack, show(okPass.problems));
  const sfPass = checkHometownReply(reply(sfReply), { pkg: SF, id: 'sk-sf00001' });
  ok('a San Francisco story passes the same pass on SF\'s package (its base written by the platform)', sfPass.problems.length === 0 && JSON.stringify(sfPass.pack?.base) === JSON.stringify(hometownBase(SF)), show(sfPass.problems));
  for (const [n, p, pkg] of [['Okemah', okPass.pack, OK], ['SF', sfPass.pack, SF]] as const) {
    ok(`the ${n} story names only places that exist in its town`, !!p && storyPlan(p).length > 10 && unknownPlaces(p, pkg).length === 0, p ? unknownPlaces(p, pkg).join(', ') : 'no pack');
    ok(`the ${n} story's fights and chases target no sensitive place`, !!p && storyPlan(p).filter((r) => r.role === 'target').every((r) => !classify(pkg.places.find((x) => x.id === (p.places?.[r.key]?.['@'] ?? r.key))!).sensitive));
  }
  ok('violent missions are the ones with a fight or a chase', [...violentMissions(okReply.pack)].sort().join() === 'M3,M4,M6');
  ok('a mission with no violence may visit a sensitive place (M2 to the clinic)', storyPlan(okReply.pack).some((r) => r.mission === 'M2' && r.key === 'county-clinic'));

  // ── rule 16: the gate's town ──
  const okPack: PackV2 = okPass.pack!;
  ok('a hometown pack gated without its package is refused', !gatePack(okPack).ok && gatePack(okPack).problems.some((p) => /gated with its town's city package/.test(p)));
  const ny = clone(JSON.parse(readFileSync('storykit/pack/fixtures/good-ny.json', 'utf8')));
  ok('a package given for a New York pack is refused', gatePack(ny, { city: cityTableOf(OK) }).problems.some((p) => /city package is for a hometown/.test(p)));
  ok('a New York pack never pins a town', gatePack({ ...clone(ny), base: { ...ny.base, hometown: cityLock(OK) } }).problems.some((p) => /only a hometown world/.test(p)));
  ok('a hometown pack pinning another town than its package is refused', gateHometown({ ...clone(okPack), base: { ...okPack.base, hometown: { ...okPack.base.hometown, place: 'us-ok-boley' } } }, OK).problems.some((p) => /base\.hometown\.place/.test(p)));
  ok('New York\'s own foreign-city rule is as before', foreignIn('Meet me in Chicago', 'ny').length === 1 && foreignIn('Back to Manhattan', 'ny').length === 0);

  // ── the Mog lock: the town stays, the game, people and missions change ──
  const mog = (f: (p: PackV2) => void) => { const p = clone(okPack); p.id = 'sk-okemog1'; p.parent = okPack.id; p.title = 'Harvest Moon'; f(p); return p; };
  const good = gateHometown(mog((p) => { p.acts[0].missions[0].stakes = 'Somebody moved the ledger.'; }), OK, { parent: okPack });
  ok('a Mog of a hometown world keeping its town passes', good.ok, show(good.problems));
  ok('the Okemah package is on the national grid: its lock is v2 and pins the frame (origin, k0, gamma0, yOffset, waterLevel)', OK.grid === 'hg1' && cityLock(OK).formatVersion === 2 && cityLock(OK).origin?.c0 === 5806 && cityLock(OK).gamma0 === -0.190411 && cityLock(OK).compiler === OK.buildId);
  ok('the tile set hash is the tile service\'s and the compiler\'s (sorted "id sha256\\n" lines)', tileSetHash([{ id: 'hg1-conus/0/1/2', sha256: 'ab' }]) === createHash('sha256').update('hg1-conus/0/1/2 ab\n').digest('hex'));
  ok('a package whose frame is broken is refused (domain, build id, origin)', packageProblems({ ...OK, domain: 'mars', buildId: 'htc-x', origin: { c0: -1, r0: 2 } }).length >= 3);
  for (const k of ['place', 'compiler', 'tiles', 'origin', 'k0', 'gamma0', 'yOffset', 'waterLevel', 'domain'] as const) {
    const moved = gateHometown(mog((p) => { const h = p.base.hometown as Record<string, unknown>; h[k] = k === 'tiles' ? 'f'.repeat(64) : k === 'compiler' ? 'htc-0.2.0' : k === 'place' ? 'us-ok-boley' : k === 'origin' ? { c0: 5807, r0: 8582 } : k === 'domain' ? 'ak' : (h[k] as number) + (k === 'k0' ? 0.001 : 1); }), OK, { parent: okPack });
    ok(`a Mog that moves the town's ${k} is refused (the town is locked)`, !moved.ok && moved.problems.some((p) => new RegExp(`base\\.hometown\\.${k}: a Mog keeps its parent's town exactly`).test(p)), show(moved.problems));
  }
  const recompiled = { ...clone(OK), compilerVersion: 'htc-0.2.0', tileSet: { hash: 'a'.repeat(64), count: 24 } };
  ok('a Mog gated on a recompiled package (new compiler, new tiles) is refused: it plays the pinned town', !gateHometown(mog(() => {}), recompiled, { parent: okPack }).ok);
  ok('a Mog that moves to New York is refused', !gateHometown(mog((p) => { p.base = { engine: 'mogcity-1', city: 'ny', cityBuild: 'ny-mogcity-1' }; }), OK, { parent: okPack }).ok);
  const mogReply = clone(okReply); delete mogReply.pack.base; mogReply.pack.title = 'Harvest Moon';
  const mogPass = checkHometownReply(reply(mogReply), { pkg: OK, id: 'sk-okemog2', parent: okPack });
  ok('a Mog reply that leaves the base out gets its parent\'s town, exactly', mogPass.problems.length === 0 && JSON.stringify(mogPass.pack?.base) === JSON.stringify(okPack.base), show(mogPass.problems));
  ok('a Mog reply that writes another town\'s base is sent back', checkHometownReply(reply({ ...mogReply, pack: { ...mogReply.pack, base: hometownBase(SF) } }), { pkg: OK, id: 'sk-okemog3', parent: okPack }).problems.some((p) => /The town is locked/.test(p)));
  ok('the hometown Mog prompt says the town is locked', hometownTurn('', OK, { parent: okPack, instruction: 'make it a heist' }).includes('The town is locked'));

  // ── the safety rules, each refusing what it is meant to ──
  const story = (f: (p: PackV2) => void) => { const p = clone(okPack); f(p); return gateHometown(p, OK); };
  const refused = (name: string, r: ReturnType<typeof story>, re: RegExp) => ok(name, !r.ok && r.safety.some((p) => re.test(p)), show(r.safety.length ? r.safety : r.problems));
  refused('a fight at a school is refused', story((p) => { p.acts[0].missions[2].steps[1].arena = '@high-school'; }), /high-school.*never targets it/);
  refused('a chase ending at a hospital is refused', story((p) => { Object.assign(p.acts[0].missions[3].steps[0], { goal: 'reach', to: '@community-hospital' }); }), /community-hospital.*never targets it/);
  refused('a fight at the cemetery is refused', story((p) => { p.acts[0].missions[5].steps[0].arena = '@highland-cemetery'; }), /highland-cemetery/);
  refused('a violent mission that goes to a place of worship is refused', story((p) => { p.acts[0].missions[2].steps.unshift({ type: 'drive', to: '@first-street-chapel', objective: 'Go to the chapel.' }); }), /first-street-chapel.*violent/);
  refused('a violent mission starting at the police station is refused', story((p) => { p.acts[0].missions[3].start = { '@': 'police-station' }; }), /police-station.*violent/);
  refused('a private home is never a story place', story((p) => { p.acts[0].missions[4].steps[0].to = '@hollow-creek-house'; }), /private home/);
  refused('a business\'s real name in a line is refused', story((p) => { p.acts[0].missions[1].steps[1].text = 'Meet me at Prairie Rose Diner.'; }), /Prairie Rose Diner/);
  refused('a brand tag in a label is refused', story((p) => { p.acts[0].missions[1].steps[0].objective = 'Grab food at **BurgerBarn**.'; }), /BurgerBarn/);
  refused('a national chain in a line is refused', story((p) => { p.acts[0].missions[1].steps[1].text = 'Pick up a card at Dollar General.'; }), /Dollar General/);
  refused('a street address is refused', story((p) => { p.acts[0].missions[4].steps[1].text = 'She lives at 1200 Example Road.'; }), /street address/);
  refused('violence at a school in words is refused', story((p) => { p.acts[0].missions[5].steps[1].text = 'Next time I blow up the school.'; }), /violence/);
  refused('violence at a named place of worship is refused', story((p) => { p.acts[0].missions[5].steps[1].text = 'Burn down First Street Chapel.'; }), /First Street Chapel/);
  refused('violence at an alias of a sensitive place is refused', story((p) => { p.places['white-chapel'] = { '@': 'first-street-chapel', name: 'the white steeple' }; p.acts[0].missions[5].steps[1].text = 'Torch the white steeple.'; }), /white steeple/);
  refused('a brand in an end step\'s fail line (the MISSION FAILED text) is refused', story((p) => { p.acts[0].missions[1].steps.push({ type: 'end', fail: 'You never made it back to the Walmart.' }); }), /Walmart/);
  refused('violence at a school in an end step\'s fail line is refused', story((p) => { p.acts[0].missions[1].steps.push({ type: 'end', fail: 'They blew up the school.' }); }), /violence/);
  refused('a street address as a stop\'s on-screen name is refused', story((p) => { p.acts[0].missions[1].steps.unshift({ type: 'stops', stops: [{ '@': 'town-park', name: '412 N 4th Street' }] }); }), /street address/);
  refused('a memorial\'s name (maybe a private person\'s) is withheld', story((p) => { p.acts[0].missions[1].steps[1].text = 'Meet me by the Veterans Memorial.'; }), /Veterans Memorial/);
  refused('a fight at SF\'s cathedral (an arrival) is refused', (() => { const p = clone(sfPass.pack!); p.acts[0].missions[2].steps[1].arena = '@nobhill'; return gateHometown(p, SF); })(), /nobhill/);
  const passes = (name: string, r: ReturnType<typeof story>) => ok(name, r.ok, show(r.problems));
  passes('a fight passing by is fine: words about the depot and a fight at the old gin', story((p) => { p.acts[0].missions[2].steps[0].text = 'The fight is at the old gin, not the depot.'; }));
  passes('an opening that shows the hospital is fine (looked at, not targeted)', story((p) => { p.opening.stage[1].at = '@community-hospital'; }));
  passes('a hurt friend taken to the clinic (no violence in the sentence) is fine', story((p) => { p.acts[0].missions[1].steps[1].text = 'She is hurt. Get her to the clinic.'; }));

  // ── a name's core and short forms (not only the full name) ──
  const said = (text: string) => story((p) => { p.acts[0].missions[5].steps[1].text = text; });
  refused('violence at a school by its short form ("Okemah High" for Okemah High School) is refused', said('They attack Okemah High tonight.'), /violence.*Okemah High School/);
  refused('a withheld business by its core ("the Prairie Rose" for Prairie Rose Diner) is refused', said('Meet at the Prairie Rose.'), /Prairie Rose Diner/);
  refused('a core is matched case- and punctuation-insensitively ("PRAIRIE-ROSE")', said('Meet at the PRAIRIE-ROSE.'), /Prairie Rose Diner/);
  refused('a one-word distinctive core is matched ("the Thunderbird" for Thunderbird Motel)', said('We hide out at the Thunderbird.'), /Thunderbird Motel/);
  refused('a home by its core ("Hollow Creek" for the Hollow Creek house) is refused', said('He grew up out at Hollow Creek.'), /Hollow Creek house/);
  passes('the town\'s own name is not a core (Okemah High School, Okemah Police Department)', said('They fight their way out of Okemah tonight.'));
  passes('a street is not a core ("First Street" for First Street Chapel)', said('They crash on First Street.'));
  passes('a common word is not a core ("veterans" for Veterans Memorial, "crossroads" for Crossroads Fuel)', said('The veterans meet at the crossroads.'));
  passes('a core\'s words in another order are not the name ("a rose on the prairie")', said('She left a rose on the prairie.'));
  passes('"Okemah High" is a whole-word match ("Okemah Highway" is a road)', said('They attack the convoy on the Okemah Highway.'));

  // ── names that make a place sensitive with a bare kind ──
  ok('worship names with a bare kind are sensitive (denominations, masjid, parish, St. X\'s)', ['First Baptist', 'Grace Methodist', 'Trinity Lutheran', 'First Presbyterian', 'St. Paul\'s Episcopal', 'Holy Family Catholic', 'Okemah Pentecostal Holiness', 'Okemah Assembly of God', 'Okemah Church of Christ', 'Islamic Masjid', 'Beth El Synagogue', 'Hope Temple', 'Wayside Chapel', 'Sacred Heart Parish', "St. Mary's", "Saint Anne's"].every((n) => C('yes', n).sensitive === 'worship'), ['First Baptist', 'Grace Methodist', 'Islamic Masjid', "St. Mary's"].map((n) => `${n}: ${C('yes', n).sensitive}`).join(', '));
  ok('childcare names with a bare kind are sensitive (learning center, daycare, preschool, montessori, head start, kindergarten)', ['Little Explorers Learning Center', 'Sunshine Daycare', 'Kids Day Care', 'Tiny Tots Preschool', 'Okemah Montessori', 'Okfuskee Head Start', 'Bright Kindergarten'].every((n) => C('yes', n).sensitive === 'childcare'), ['Little Explorers Learning Center', 'Okemah Montessori', 'Okfuskee Head Start'].map((n) => `${n}: ${C('yes', n).sensitive}`).join(', '));
  ok('an academy with a bare kind is a school', C('yes', 'Okemah Christian Academy').sensitive !== null && C('yes', 'Prairie Academy').sensitive === 'school');
  ok('"St. X\'s" a business by kind is a business, not a place of worship; tagged religion it is', !C('pub', "St. James's").sensitive && C('pub', "St. James's").business && C('yes', "St. Luke's", ['religion=christian']).sensitive === 'worship');
  ok('a bare kind without those words stays plain ("Stevens Hardware", "St. Louis Street", "Learning Tree Books" as a shop)', !C('yes', 'Stevens Hardware').sensitive && !C('yes', 'St. Louis Street').sensitive && !C('books', 'Learning Tree Books').sensitive);
  const withPlace = (q: { id: string; kind: string; name: string }) => ({ ...clone(OK), places: [...OK.places, { ...q, x: 10, z: 10, tags: [] }] });
  for (const q of [{ id: 'first-baptist', kind: 'yes', name: 'First Baptist' }, { id: 'st-marys', kind: 'yes', name: "St. Mary's" }, { id: 'little-explorers', kind: 'yes', name: 'Little Explorers Learning Center' }]) {
    const p = clone(okPack); p.acts[0].missions[2].steps[1].arena = `@${q.id}`;
    const r = gateHometown(p, withPlace(q));
    ok(`a fight at "${q.name}" (kind "yes") is refused`, !r.ok && r.safety.some((s) => new RegExp(`${q.id}.*never targets it`).test(s)), show(r.safety.length ? r.safety : r.problems));
  }

  // ── "shot" the camera word is not violence ──
  passes('a camera shot of a sensitive place is not violence ("wide shot of the school")', said('Open on a wide shot of the school.'));
  passes('"close shot" and "establishing shot" are camera words', said('Close shot: the clinic doors. Establishing shot of the hospital at dawn.'));
  passes('"shot of" a sensitive place is a camera word', said('One last shot of the church steeple.'));
  refused('"he was shot" at a sensitive place is still violence', said('He was shot outside the clinic.'), /violence \("shot"\)/);
  refused('"shot at" a sensitive place is still violence', said('They shot at the school.'), /violence \("shot"\)/);
  refused('"shoot" at a sensitive place is still violence', said('They shoot up the hospital.'), /violence \("shoot"\)/);
  // a camera word that is also a noun ("group", "hero", "drone", "still") followed by a target is gunfire, not a shot
  refused('"the group shot at the church" is still violence', said('The group shot at the church.'), /violence \("shot"\)/);
  refused('"the hero shot the guard at the school" is still violence', said('The hero shot the guard at the school.'), /violence \("shot"\)/);
  refused('"they were still shot at the clinic" is still violence', said('They were still shot at the clinic.'), /violence \("shot"\)/);
  refused('"the drone shot Marcus outside the hospital" is still violence', said('The drone shot Marcus outside the hospital.'), /violence \("shot"\)/);
  passes('"a wide shot, the school at dawn" and "group shot: the church choir" are camera words', said('A wide shot, the school at dawn. Group shot: the church choir.'));
  // "shot" is a camera word only in a camera phrase; as a verb, or when unclear, it is gunfire
  passes('"Wide shot of the school." is a camera phrase', said('Wide shot of the school.'));
  passes('"in this shot", "the shot shows", "aerial shots of", "a tracking shot along" are camera phrases', said('In this shot the school is quiet. The shot shows the hospital. Aerial shots of the church. Cut to a tracking shot along the clinic.'));
  refused('"the hero shot guards at the school" is violence', said('The hero shot guards at the school.'), /violence \("shot"\)/);
  refused('"then the hero shot." (a sentence ending at "shot") at a sensitive place is violence', said('They reached the school, and then the hero shot.'), /violence \("shot"\)/);
  refused('"he was shot, get him to the hospital" is violence', said('He was shot, get him to the hospital.'), /violence \("shot"\)/);
  refused('"got shot" at a sensitive place is violence', said('He got shot near the school.'), /violence \("shot"\)/);
  refused('"shot him" at a sensitive place is violence', said('She shot him at the hospital.'), /violence \("shot"\)/);
  refused('"shots rang out" at a sensitive place is violence', said('Shots rang out at the school.'), /violence \("Shots"\)/);
  refused('a camera word followed by a target is violence ("wide shot guards the school")', said('Wide shot guards the school.'), /violence \("shot"\)/);
  // a firing, weapon or impact word anywhere in the sentence makes every "shot" gunfire, however camera-like
  refused('"the sniper took a long shot across the schoolyard" is violence', said('The sniper took a long shot across the schoolyard.'), /violence \("shot"\)/);
  refused('"a long shot then shattered the hospital window" is violence', said('A long shot then shattered the hospital window.'), /violence \("shot"\)/);
  refused('"he fired a wide shot over the school" is violence', said('He fired a wide shot over the school.'), /violence \("shot"\)/);
  refused('"the sniper took a close shot from above the school" is violence', said('The sniper took a close shot from above the school.'), /violence \("shot"\)/);
  passes('"Take a wide shot of the school." and "Wide shot of the fire station." are camera directions', said('Take a wide shot of the school. Wide shot of the fire station.'));
  const cam = ['Wide shot of the school.', 'Open on a wide shot of the school.', 'Close shot: the clinic doors.', 'One last shot of the church steeple.', 'Group shot: the church choir.', 'In this shot the school is quiet.', 'The shot shows the school.', 'An over-the-shoulder shot of the clinic.', 'Then a close-up shot.', 'A long shot of the church.', 'Take a wide shot of the school.', 'Wide shot of the fire station.', 'Then a crane shot rises over the school.'];
  const gun = ['the hero shot guards at the school', 'Then the hero shot.', 'He was shot, get him to the hospital', 'They shot at the school.', 'He got shot.', 'She shot him.', 'They shot them.', 'The guards shot.', 'The drone shot Marcus.', 'The two shot the guards.', 'A wide shot at the school.', 'The shot rang out.', 'Outside the school, the hero shot.', 'The master shot.', 'Shots rang out.', 'The sniper took a long shot across the schoolyard.', 'A long shot then shattered the hospital window.', 'He fired a wide shot over the school.', 'The sniper took a close shot from above the school.', 'The gunman lined up a wide shot of the clinic.', 'A close shot hit the guard.', 'A long shot, then another, rang out at the school.', 'A wide shot and the teacher at the school falls.', 'Bang: a wide shot across the schoolyard.'];
  ok('violenceIn: camera phrases are not violence', cam.every((t) => !violenceIn(t)), cam.filter((t) => violenceIn(t)).join(' | '));
  ok('violenceIn: verb "shot" (and unclear "shot") is violence', gun.every((t) => violenceIn(t)), gun.filter((t) => !violenceIn(t)).join(' | '));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failures = 0;
  runHometownChecks((name, cond, detail = '') => { if (!cond) failures++; console.log(`${cond ? '  ok  ' : 'FAIL  '}${name}${!cond && detail ? `\n        ${detail}` : ''}`); });
  console.log(`\n${failures ? `${failures} FAILED` : 'all hometown checks passed'}\n`);
  process.exit(failures ? 1 : 0);
}
