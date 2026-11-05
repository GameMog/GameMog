/**
 * Story Kit: STORY PACK v2 and its static gate (storykit/pack). Part of `npm run check`: the schema JSON against its
 * source, the city place lists against the city code, good packs in, bad packs out (each for the reason meant), the
 * Dognapped Mog's failure modes, the Mog lock, and a passed pack turned into the runner's format (the world Mog City plays,
 * mc.gamemog.com) resolving every place. No live world reads any of this.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { runnerPackOf } from './storykit-pack.ts';
import { gatePack, toRunnerPack, lineHash, type GateResult } from '../storykit/pack/gate.ts';
import { PLACES, CAM_POINTS } from '../storykit/pack/cities.ts';
import { SCHEMA } from '../storykit/pack/schema.mjs';
import { voiceStatus, saveVoiceClip, readManifest } from '../storykit/pack/voice-store.mjs';

type Ok = (name: string, cond: boolean, detail?: string) => void;
const R = (p: string) => readFileSync(p, 'utf8');
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const keysIn = (src: string, from: RegExp, re: RegExp) => {
  const at = src.search(from), end = Math.min(...['\n};', '\n];', '];\n'].map((e) => src.indexOf(e, at)).filter((i) => i > at));
  return [...src.slice(at, end).matchAll(re)].map((m) => m[1]);
};
// the runner's pack (storykit: 1, the world Mog City's runner reads): its shape, and every "@place" it names resolves on
// the pack's own places or the city's place list (cities.ts; Mog City's places/ny.js is drift-checked against it there)
const runnerProblems = (v1: any, city: 'ny' | 'sf') => {
  const out: string[] = [], known = new Set([...Object.keys(v1.places || {}), ...Object.keys(PLACES[city])]), ids = new Set((v1.missions || []).map((m: any) => m.id));
  if (v1.storykit !== 1) out.push(`storykit is ${v1.storykit}, not 1`);
  if (v1.city !== city) out.push(`city is ${v1.city}, not ${city}`);
  if (!Array.isArray(v1.missions) || !v1.missions.length) out.push('no missions');
  for (const a of v1.acts || []) for (const id of a.order || []) if (!ids.has(id)) out.push(`act ${a.id} orders "${id}", not a mission`);
  const walk = (x: any, at: string) => {
    if (typeof x === 'string') { const m = /^@([a-z0-9_-]+)$/.exec(x); if (m && !known.has(m[1])) out.push(`${at}: "${x}" is not a place`); return; }
    if (Array.isArray(x)) { x.forEach((y, i) => walk(y, `${at}[${i}]`)); return; }
    if (x && typeof x === 'object') for (const [k, y] of Object.entries(x)) {
      if (k === '@' && typeof y === 'string' && !known.has(y)) out.push(`${at}.@: "${y}" is not a place`); else walk(y, `${at}.${k}`);
    }
  };
  walk(v1.missions, 'missions'); walk(v1.places, 'places');
  return out;
};

export function runStoryPackChecks(ok: Ok) {
  console.log('\nStory Kit: story pack v2 and its gate (storykit/pack)');
  const NY = JSON.parse(R('storykit/pack/fixtures/good-ny.json')), SF = JSON.parse(R('storykit/pack/fixtures/good-sf.json'));
  // the vehicle sheet schema is the vehicle builder's (storykit/vehicles); until it is in the tree the SF pack rides a stock car
  const SHEETS = existsSync('storykit/vehicles/vehicle-sheet.schema.json');
  if (!SHEETS) SF.vehicles = [{ stock: 'trailhand', id: 'rides.fog-van' }];
  const sheetOnly = (name: string, run: () => void) => (SHEETS ? run() : ok(`${name} (skipped: no storykit/vehicles/vehicle-sheet.schema.json yet)`, true));

  // the schema JSON is the source's output, and the place lists are the cities' own
  ok('schema.json is exactly what schema.mjs writes (edit schema.mjs, then node storykit/pack/schema.mjs)', R('storykit/pack/schema.json') === JSON.stringify(SCHEMA, null, 1) + '\n');
  // (New York's list is Mog City's own map, places/ny.js: its drift check against cities.ts runs in Mog City's node --test.
  // San Francisco is the module kept for later, storykit/cities/sf, which no runtime plays yet.)
  const sfCity = R('storykit/cities/sf/city.js'), sfCfg = R('storykit/cities/sf/js/city-config.js');
  const sf = [...keysIn(sfCfg, /const TELEPORT_DEFS = \{/, /^\s{2}([a-z][a-z0-9_]*):/gm), ...keysIn(sfCfg, /const LANDMARK_TELEPORTS = \{/, /^\s{2}([a-z][a-z0-9_]*):/gm), ...keysIn(sfCity, /const PLACES = \{/, /^\s{2}([a-z][a-z0-9_]*):/gm)];
  const sfFoot = keysIn(sfCity, /const PLACES = \{/, /^\s{2}([a-z][a-z0-9_]*):.*foot: true/gm);
  const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
  ok('the gate\'s New York place list is the 42 keys Mog City\'s runtime resolves', Object.keys(PLACES.ny).length === 42, `${Object.keys(PLACES.ny).length} in cities.ts`);
  ok('the gate\'s San Francisco place list is the city\'s (arrivals and PLACES), with the same walk-only places', same(Object.keys(PLACES.sf), sf) && same(Object.entries(PLACES.sf).filter(([, p]) => p.foot).map(([k]) => k), sfFoot), `${sf.length} in the city, ${Object.keys(PLACES.sf).length} in cities.ts`);
  ok('the gate\'s camera points are San Francisco\'s camPoint names', same(CAM_POINTS.sf, [...sfCity.matchAll(/case '([a-z-]+)':/g)].map((m) => m[1])));

  // good packs
  const t0 = performance.now(), gNY = gatePack(NY), gSF = gatePack(SF), ms = performance.now() - t0;
  ok('a good New York pack passes (stock car, a voice-only dispatcher, a carried call, a choice with a reply)', gNY.ok && !gNY.warnings.length && !gNY.clamped.length, gNY.problems.concat(gNY.warnings).join(' | '));
  ok(`a good San Francisco pack passes (${SHEETS ? 'a vehicle sheet' : 'a stock car'}, a pet dog in the front seat, a walk to a pier, a camera point, Christmas in winter fog)`, gSF.ok && !gSF.warnings.length, gSF.problems.concat(gSF.warnings).join(' | '));
  ok('the gate is fast (two packs well under a second)', ms < 1000, `${ms.toFixed(0)} ms`);
  ok('every spoken line gets an id, its speaker and its hash; lines not in the manifest are pending', gNY.lines.length === 8 && gNY.lines.every((l) => l.status === 'pending' && /^[0-9a-f]{8}$/.test(l.hash))
    && gNY.lines.some((l) => l.id === 'NF-1.s2.d0.vm' && l.who === 'dispatch') && gNY.lines.some((l) => l.id === 'NF-1.s4.o0' && l.who === 'rae'), gNY.lines.map((l) => l.id).join(' '));

  // a passed pack in the runner's format: its shape holds and every place resolves on the city's list
  const v1 = toRunnerPack(gNY.pack), v1sf = toRunnerPack(gSF.pack);
  const resolved = [...runnerProblems(v1, 'ny'), ...runnerProblems(v1sf, 'sf')];
  const call = v1.missions[0].steps[2].during[0];
  ok('a passed pack converts to the runner\'s pack (storykit: 1): its shape holds, every place resolves, speakers become names, call lines tuples',
    !resolved.length && v1.car === 'vandal' && v1.cast['Rae Okafor']?.color === '#8FD3C8'
      && Array.isArray(call.lines[0]) && call.lines[0][0] === 'DISPATCH' && v1.missions[0].steps[4].options[0].reply[0] === 'Rae Okafor' && v1.acts[0].order.join() === 'NF-1,NF-2', resolved.slice(0, 3).join(' | '));

  // a bad pack is refused for the reason meant
  const refused = (r: GateResult, re: RegExp) => !r.ok && r.problems.some((p) => re.test(p));
  const bad = (name: string, base: any, edit: (p: any) => void, re: RegExp, opts?: any) => {
    const p = clone(base); edit(p); const r = gatePack(p, opts);
    ok(`refused: ${name}`, refused(r, re), r.ok ? 'it PASSED' : r.problems.slice(0, 2).join(' | '));
  };
  const m1 = (p: any) => p.acts[0].missions[0];

  console.log('\n  the Dognapped Mog\'s failure modes');
  bad('Chicago labels in New York: a place alias named for Wrigley', NY, (p) => { p.places.pickup.name = 'the gate at Wrigley Field'; }, /names Chicago \("Wrigley"\).*New York/);
  bad('Chicago labels in New York: a mission title', NY, (p) => { m1(p).title = 'Christmas in Chicago'; }, /mission NF-1\.title.*Chicago/);
  bad('Chicago labels in New York: an objective on Michigan Ave', NY, (p) => { m1(p).steps[2].objective = 'Pick up **Rae** on Michigan Ave'; }, /Michigan Ave/);
  bad('a Chicago street as a place name that isn\'t in New York', NY, (p) => { m1(p).steps[6].to = '@wacker'; }, /"@wacker" is not a place in New York/);
  bad('bike text on a car: "pedal" in a Vandal GT mission objective', NY, (p) => { m1(p).steps[6].objective = 'Pedal **Rae** to the gallery'; }, /says "Pedal".*Vandal GT, a car/);
  bad('bike text on a car: "your bike" in dialogue', NY, (p) => { m1(p).steps[5].text = 'Nice bike. Is your bike always this fast?'; }, /says "your bike"/);
  bad('a car renamed a bike (a stock hypercar given the id red-bike)', NY, (p) => { p.vehicles.push({ stock: 'roadster', id: 'red-bike' }); m1(p).vehicle = 'red-bike'; }, /red-bike.*calls a car a "bike"/);
  sheetOnly('a car renamed a bike (a car sheet labelled Red Bike)', () => bad('a car renamed a bike (a car sheet labelled Red Bike)', SF, (p) => { p.vehicles[0].label = 'Red Bike'; }, /calls a car a "Bike"/));
  bad('a real bicycle sheet: planned, not built, never faked with a car', SF, (p) => { p.vehicles[0] = { v: 1, id: 'rides.red-one', label: 'Red One', noun: 'car', family: 'bicycle', class: 'sports' }; for (const m of p.acts[0].missions) m.vehicle = 'rides.red-one'; p.ride = 'rides.red-one'; }, /a bicycle is planned, not built yet/);
  bad('the dog written as a person ("the family dog" with a human sheet)', NY, (p) => { p.cast[1].sheet.role = 'the family dog'; }, /makes a person into a dog/);
  bad('a pet with another species\' name ("Kitten" the dog)', SF, (p) => { p.pets[0].name = 'Kitten'; }, /names a Kitten, but it is a dog/);
  bad('Christmas dressing in summer', SF, (p) => { p.dressing.season = 'summer'; }, /christmas in summer/);
  bad('snow in summer', NY, (p) => { p.dressing.weather = 'snow'; p.dressing.season = 'summer'; }, /snow in summer/);
  { const p = clone(NY); m1(p).steps[5].text = 'I grew up in Chicago, you know.'; const r = gatePack(p);
    ok('another city named in dialogue is a warning, not a refusal (people come from places)', r.ok && r.warnings.some((w) => /Chicago/.test(w)), r.problems.join(' | ')); }

  console.log('\n  verbs and rides');
  bad('a hop in the Vandal GT (no thrusters): refused, never faked', NY, (p) => { m1(p).verbs.push('hop'); }, /"hop" \(from its verbs\) can't be done in the Vandal GT: it cannot hop/);
  bad('a hop written in an objective', NY, (p) => { m1(p).steps[6].objective = 'Hop the barrier on Prince St'; }, /"hop" \(from .*objective/);
  { const p = clone(NY); m1(p).steps[5].text = 'Hop in, we are late.'; const r = gatePack(p); ok('"hop in" (get in the car) is not a hop', r.ok, r.problems.join(' | ')); }
  sheetOnly('a hop on a car sheet with thrusters (abilities: hop) passes', () => { const p = clone(SF); p.vehicles[0].abilities = ['boost', 'hop']; p.acts[0].missions[0].verbs.push('hop'); const r = gatePack(p); ok('a hop on a car sheet with thrusters (abilities: hop) passes', r.ok, r.problems.join(' | ')); });
  bad('a drive on foot', NY, (p) => { m1(p).vehicle = 'on-foot'; }, /"drive" .* on foot: driving needs a vehicle/);
  bad('a chase on foot', NY, (p) => { p.acts[0].missions[1].vehicle = 'on-foot'; }, /"escape" .* on foot/);
  bad('more passengers than seats (three in a two-seat Roadster)', NY, (p) => { p.vehicles = [{ stock: 'roadster' }]; p.ride = 'roadster'; for (const m of p.acts[0].missions) m.vehicle = 'roadster'; m1(p).steps.splice(4, 0, { type: 'passenger', who: 'nico' }); }, /2 passengers board the Roadster, which seats 2/);
  bad('a mission vehicle that isn\'t in the pack', NY, (p) => { m1(p).vehicle = 'trailhand'; }, /vehicle "trailhand" is not one of the vehicles/);

  console.log('\n  places and the city');
  bad('a drive to a walk-only place (Pier 48 is off the lanes)', SF, (p) => { p.acts[0].missions[0].steps[2].stops[0] = '@pier48'; }, /Pier 48.*off the lanes, a walk target/);
  bad('a drive to the FDR (no lanes in the route graph)', NY, (p) => { m1(p).steps[6].to = '@fdr'; }, /no lanes in the route graph/);
  bad('an alias that shadows a city place', NY, (p) => { p.places.soho = { '@': 'les', name: 'somewhere else' }; }, /already has a place "soho"/);
  bad('a raw coordinate instead of a place name', NY, (p) => { m1(p).steps[6].to = { x: 10, z: 20 }; }, /is a coordinate; a pack names places/);
  bad('an unknown place, with a suggestion', NY, (p) => { m1(p).steps[6].to = '@tribecca'; }, /did you mean "tribeca"/);
  bad('a San Francisco camera point in New York', NY, (p) => { m1(p).steps.splice(1, 0, { type: 'cutscene', shots: [{ cam: 'bridge-mid', dur: 3 }] }); }, /"bridge-mid" is not a camera point of New York/);
  bad('an unknown city build', NY, (p) => { p.base.cityBuild = 'ny-latest'; }, /not a build of New York/);
  bad('a city the Story Kit doesn\'t have', NY, (p) => { p.base.city = 'chicago'; }, /base\.city: "chicago" is not one of ny, sf/);

  console.log('\n  a Mog keeps its parent\'s base');
  const mog = (edit: (p: any) => void) => { const p = clone(NY); p.id = 'night-fares-xmas'; p.parent = 'night-fares'; edit(p); return p; };
  { const r = gatePack(mog((p) => { p.dressing = { time: 'midnight', season: 'winter', weather: 'snow', holiday: ['christmas'] }; m1(p).title = 'A Snowy First Fare'; }), { parent: NY });
    ok('a Mog that keeps the base and changes the dressing and the story passes', r.ok, r.problems.join(' | ')); }
  bad('a Mog that moves the city (New York to San Francisco)', mog((p) => { p.base.city = 'sf'; p.base.cityBuild = 'sf-bc7d0b3-1'; p.places = {}; for (const m of p.acts[0].missions) { m.start = '@ferry'; m.steps = [{ type: 'drive', to: '@emb_mission' }]; } }), () => {}, /keeps its parent's base/, { parent: NY });
  bad('a Mog that changes the engine build', mog((p) => { p.base.cityBuild = 'ny-bc7d0b3-2'; }), () => {}, /keeps its parent's base|not a build/, { parent: NY });
  bad('a Mog checked without its parent', mog(() => {}), () => {}, /checked against that parent, and none was given/);
  bad('a Mog that names another parent', mog((p) => { p.parent = 'fog-run'; }), () => {}, /parent must be "night-fares"/, { parent: NY });

  console.log('\n  the title is the world\'s own (Mog City is the engine, never a Create\'s or a Mog\'s name)');
  for (const t of ['Mog City: Night Shift', 'MOGCITY Nights', 'Night Shift in Mog-City', 'm.o.g. city', 'M0G CITY 2', 'Mög City'])
    bad(`a Create titled "${t}"`, NY, (p) => { p.title = t; }, /title: .* names Mog City/);
  bad('a kicker that says MOG CITY', NY, (p) => { p.kicker = 'MOG CITY'; }, /kicker: .* names Mog City/);
  bad('a Mog titled "Mog City Xmas"', mog((p) => { p.title = 'Mog City Xmas'; }), () => {}, /title: .* names Mog City.*this Mog/, { parent: NY });
  { const r = gatePack((() => { const p = clone(NY); p.title = 'Smog City'; return p; })()); ok('"Smog City" is its own title (not Mog City)', r.ok, r.problems.join(' | ')); }
  { const p = clone(NY); p.title = 'Mog City'; const r = gatePack(p, { own: true }); ok('Mog City\'s own story (gated { own: true } by the repo\'s checks only) may be titled Mog City', r.ok, r.problems.join(' | ')); }

  console.log('\n  a Create sets its own rules; a Mog keeps its parent\'s framework');
  { const p = clone(NY); p.hud.meters.push({ id: 'fares', label: 'FARES', kind: 'count', start: 0 }); p.hud.clock = { label: 'SHIFT', format: 'text' }; const r = gatePack(p);
    ok('a Create may set its own meters and clock', r.ok, r.problems.join(' | ')); }
  { const r = gatePack(mog((p) => { p.hud.meters[0].label = 'TIPS'; p.hud.clock.label = 'SHIFT'; m1(p).title = 'Snow Fares'; }), { parent: NY });
    ok('a Mog may reword its meters and clock and remix the story', r.ok, r.problems.join(' | ')); }
  bad('a Mog that adds a meter', mog((p) => { p.hud.meters.push({ id: 'fares', label: 'FARES', kind: 'count' }); }), () => {}, /keeps its parent's meters .* adds none/, { parent: NY });
  bad('a Mog that drops a meter', mog((p) => { p.hud.meters.pop(); for (const m of p.acts.flatMap((a: any) => a.missions)) delete m.hiddenMeters; }), () => {}, /keeps every meter its parent has|not a meter|not one of the story's meters/, { parent: NY });
  bad('a Mog that changes a meter\'s kind', mog((p) => { p.hud.meters[2].kind = 'pips'; p.hud.meters[2].pips = 5; }), () => {}, /keeps its parent's meter rules \(kind "bar", pips null\)/, { parent: NY });
  bad('a Mog that changes the clock', mog((p) => { p.hud.clock.format = 'text'; }), () => {}, /keeps its parent's clock/, { parent: NY });
  bad('a Mog that adds a kind of step (a fight)', mog((p) => { m1(p).steps.push({ type: 'fight', enemies: ['dispatch'], arena: '@soho', win: 'ko-all' }); }), () => {}, /keeps its parent's mission structure/, { parent: NY });

  console.log('\n  Mog City\'s engine (mogcity-1: every Create and Mog plays on Mog City)');
  const MC = { engine: 'mogcity-1', city: 'ny', cityBuild: 'ny-mogcity-1' };
  const onMc = (edit: (p: any) => void = () => {}) => { const p = clone(NY); p.base = { ...MC }; edit(p); return p; };
  { const r = gatePack(onMc()); const w = r.ok ? toRunnerPack(r.pack!) as any : null;
    ok('a New York pack on Mog City\'s engine passes, and its world names the engine', r.ok && w?.engine === 'mogcity-1' && w?.city === 'ny', r.problems.join(' | ')); }
  { const r = gatePack(onMc());
    ok('a step Mog City has no part for (passenger) is a warning there, never silent', r.warnings.some((x) => /'passenger' has no Mog City part yet/.test(x)), r.warnings.join(' | ')); }
  { const r = gatePack(onMc((p) => { p.dressing.weather = 'rain'; }));
    ok('weather other than clear is kept as the setting and noted (Mog City draws none yet)', r.ok && r.warnings.some((x) => /Mog City shows no weather yet/.test(x)), r.warnings.join(' | ')); }
  { const r = gatePack(onMc((p) => { m1(p).steps.unshift({ type: 'scene', name: 'm1.arrival' }); }));
    ok('a scene step (one of Mog City\'s set pieces) passes on mogcity-1, with a note when the hero is not Dan', r.ok && r.warnings.some((x) => /m1\.arrival" is Mog City's own set piece/.test(x)), r.problems.concat(r.warnings).join(' | ')); }
  bad('a scene step on the older engine', NY, (p) => { m1(p).steps.unshift({ type: 'scene', name: 'opening' }); }, /needs Mog City's engine/);
  bad('a set piece Mog City does not have', onMc(), (p) => { m1(p).steps.unshift({ type: 'scene', name: 'm9.finale' }); }, /scene|name/);
  bad('San Francisco on Mog City\'s engine (New York only so far)', SF, (p) => { p.base = { ...MC, city: 'sf' }; }, /does not play San Francisco yet/);
  bad('the older engine\'s build on mogcity-1', onMc(), (p) => { p.base.cityBuild = 'ny-bc7d0b3-1'; }, /not a build of New York on mogcity-1/);
  { const r = gatePack(mog((p) => { p.base = { ...MC }; }), { parent: NY });
    ok('a Mog of an older (storykit-1) world moves to Mog City\'s engine in the same city', r.ok, r.problems.join(' | ')); }
  { const P = onMc((p) => { p.id = 'night-fares'; }); const r = gatePack(mog((p) => { p.base = { ...MC }; }), { parent: gatePack(P).pack! });
    const back = gatePack(mog(() => {}), { parent: gatePack(P).pack! });
    ok('a Mog of a Mog City world stays on Mog City\'s engine (never back to the older one)', r.ok && !back.ok && back.problems.some((x) => /keeps its parent's base/.test(x)), back.problems.join(' | ')); }

  console.log('\n  people, voices and likeness');
  bad('a likeness field on a person', NY, (p) => { p.cast[1].lookalike = 'a famous singer'; }, /no field for a real person's face, voice or likeness/);
  bad('"looks like" a named person in a logline', NY, (p) => { p.cast[1].sheet.logline = 'Looks like Zendaya on a bad day.'; }, /points at a real person's likeness/);
  bad('a voice description that "sounds like" someone', NY, (p) => { p.cast[2].voice.description = 'sounds like a famous newsreader'; }, /likeness/);
  bad('an age under 16 (refused, never clamped up)', NY, (p) => { p.cast[1].sheet.identity.age = 12; }, /identity\.age: 12 is outside 16\.\.92/);
  bad('a seen person with no sheet', NY, (p) => { delete p.cast[1].sheet; }, /needs a Character Forge sheet/);
  bad('a voice-only person boarding as a passenger', NY, (p) => { m1(p).steps[3].who = 'dispatch'; }, /"dispatch" is voiceOnly/);
  bad('a speaker who isn\'t in the cast', NY, (p) => { m1(p).steps[0].who = 'mama'; }, /"mama" is not in the cast/);
  bad('a pet speaking a line', SF, (p) => { p.acts[0].missions[0].steps.push({ type: 'say', who: 'moon', text: 'Woof.' }); }, /pets don't speak lines/);
  bad('a sheet and a voice block that name different voices', NY, (p) => { p.cast[1].sheet.voice.id = 'someone-else'; }, /its sheet speaks with "someone-else"/);
  bad('a blend with no English stock voice as its base', NY, (p) => { p.cast[1].voice = { id: 'rae-v1', blend: { ef_dora: 1 }, description: 'warm' }; }, /needs an English stock voice/);
  bad('a voice block with neither a Kokoro voice nor a blend', NY, (p) => { p.cast[1].voice = { id: 'rae-v1', description: 'warm' }; }, /matches none of its forms/);
  { const p = clone(NY); p.cast[1].voice.speed = 3; p.cast[1].voice.pitch = -9; m1(p).traffic = 4; const r = gatePack(p);
    ok('numbers out of range are clamped, not refused (voice speed 3, pitch -9, traffic 4)', r.ok && r.pack.cast[1].voice.speed === 1.2 && r.pack.cast[1].voice.pitch === -2.5 && r.pack.acts[0].missions[0].traffic === 1 && r.clamped.length === 3, r.clamped.join(' | ') || r.problems.join(' | ')); }

  console.log('\n  text, references and the voice manifest');
  bad('a title over its limit', NY, (p) => { p.title = 'N'.repeat(49); }, /title: 49 characters, the limit is 48/);
  bad('markup in a line', NY, (p) => { m1(p).steps[0].text = 'Go <b>now</b>'; }, /carries markup/);
  bad('a blocked word', NY, (p) => { m1(p).stakes = 'What the ' + 'shpx'.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 84) % 26) + 97)) + ' is this.'; }, /a word GameMog doesn't allow/);
  bad('an unknown {token}', NY, (p) => { m1(p).steps[6].objective = 'Drop {player} at the gallery'; }, /\{player\} is not a token/);
  bad('a field the schema doesn\'t have (no code in a pack)', NY, (p) => { m1(p).onStart = 'alert(1)'; }, /"onStart" is not a field here/);
  bad('a step kind the runner doesn\'t have', NY, (p) => { m1(p).steps.push({ type: 'swim' }); }, /"swim" is not a step kind/);
  bad('a reward on a meter the story doesn\'t have', NY, (p) => { m1(p).reward.meters.respect = 5; }, /the meter "respect" is not one of the story's meters/);
  bad('a goto to no step', NY, (p) => { m1(p).steps[4].options[0].goto = 'nowhere'; }, /no step is "nowhere"/);
  bad('two missions with one id across acts', NY, (p) => { p.acts.push({ id: 'act2', missions: [clone(m1(p))] }); }, /Two missions are NF-1/);
  bad('more than 9 missions', NY, (p) => { p.acts = [0, 1].map((a) => ({ id: `act${a}`, missions: [0, 1, 2, 3, 4].map((i) => ({ ...clone(m1(p)), id: `M${a}-${i}` })) })); }, /10 missions; a story has at most 9/);
  bad('a pack over 160 KB', NY, (p) => { p.junk = 'x'.repeat(170_000); }, /bytes; the limit is 160000/);
  bad('a v1 pack', NY, (p) => { p.storykit = 1; }, /storykit must be 2/);
  bad('a voice clip for a line that doesn\'t exist', NY, (p) => { p.voices = { 'NF-1.s9': { voice: 'rae', status: 'pending' } }; }, /voices\.NF-1\.s9: there is no such line/);
  bad('a voice clip in the wrong voice', NY, (p) => { p.voices = { 'NF-1.s0': { voice: 'rae', status: 'pending' } }; }, /the line is dispatch's, the clip is "rae"'s/);
  bad('a ready clip with no file', NY, (p) => { p.voices = { 'NF-1.s0': { voice: 'dispatch', status: 'ready' } }; }, /ready, but no clip/);
  bad('a clip for an older text of the line', NY, (p) => { p.voices = { 'NF-1.s0': { voice: 'dispatch', status: 'ready', clip: 'voices/night-fares/nf-1-s0.ogg', hash: lineHash('Fare waiting. Go.') } }; }, /older text of the line/);
  bad('a clip outside the pack\'s voice folder', NY, (p) => { p.voices = { 'NF-1.s0': { voice: 'dispatch', status: 'ready', clip: 'https://example.com/a.ogg' } }; }, /voices\.NF-1\.s0\.clip/);
  { const p = clone(NY); p.voices = { 'NF-1.s0': { voice: 'dispatch', status: 'ready', clip: 'voices/night-fares/nf-1-s0.ogg', hash: lineHash('Fare waiting on Orchard. Go.') } }; const r = gatePack(p);
    ok('a ready clip for the current text is taken into the line list', r.ok && r.lines.find((l) => l.id === 'NF-1.s0')?.status === 'ready' && r.lines.filter((l) => l.status === 'pending').length === 7, r.problems.join(' | ')); }

  console.log('\n  the creators\' packs (storykit/packs) and their built fixtures (npm run storykit:pack)');
  const forgeRt = R('scripts/forge/clips-runtime.mjs'), served = R('public/storykit/forge/clips.js');
  ok('the headshots\' clip binder (forge/clips.js) is the forge\'s clips-runtime.mjs', served.endsWith(forgeRt));
  for (const f of readdirSync('storykit/packs').filter((x) => x.endsWith('.json'))) {
    const id = f.replace(/\.json$/, ''), src = JSON.parse(R(`storykit/packs/${f}`)), g = gatePack(src, { own: id === 'mog-city' });
    ok(`${id}: passes the gate with no warnings`, g.ok && !g.warnings.length && !g.clamped.length, g.problems.concat(g.warnings, g.clamped).slice(0, 3).join(' | '));
    if (!g.ok) continue;
    const out = `public/storykit/packs/${id}.json`, want = JSON.stringify(runnerPackOf(g.pack), null, 1) + '\n';
    ok(`${id}: its built pack is current (npm run storykit:pack -- ${id})`, existsSync(out) && R(out) === want);
    const v1 = JSON.parse(want), glbs = Object.values(v1.cast).map((c: any) => c.glb).filter(Boolean) as string[];
    const stamps = g.pack.cast.filter((c: any) => c.sheet).every((c: any) => existsSync(`public/storykit/cast/${id}/${c.id}.sheet.json`) && R(`public/storykit/cast/${id}/${c.id}.sheet.json`) === JSON.stringify(c.sheet, null, 1) + '\n');
    ok(`${id}: every seen person has a GLB forged from their current sheet (or a shipped one, cast[].model), and the clip pack is there`, glbs.length === g.pack.cast.filter((c: any) => c.sheet || (c.model && !c.voiceOnly)).length && glbs.every((p) => existsSync(`public/storykit/${p}`)) && stamps && existsSync(`public/storykit/${v1.clips}`), glbs.join(' '));
    const res = runnerProblems(v1, g.pack.base.city);
    ok(`${id}: the runner's pack holds its shape and every place resolves`, !res.length, res.slice(0, 3).join(' | '));
    // its voices: each spoken line's clip is named by its line hash and its speaker's voice key; the clips the
    // creator's browser stored (packs/<id>/voice/manifest.json) are on disk and match their names
    const vp = v1.voice, man = readManifest('.', id), vs = vp ? voiceStatus('.', id, vp.lines) : null;
    ok(`${id}: every spoken line has a clip name (line hash + voice key); prompts are shown, not voiced`, !!vp && vp.lines.length > 0 && vp.lines.every((l: any) => l.clip === `${lineHash(l.text)}-${vp.cast[l.who]?.key}`) && !vp.lines.some((l: any) => /\.p$/.test(l.id)));
    ok(`${id}: its voice manifest's clips are on disk under their own names (${vs?.ready.length ?? 0} of ${vp?.lines.length ?? 0} voiced, ${vs?.stale.length ?? 0} stale)`,
      Object.entries(man.clips as Record<string, any>).every(([k, c]) => c.file.startsWith(k + '.') && k.startsWith(c.hash) && existsSync(`public/storykit/packs/${id}/voice/${c.file}`)));
    { const ogg = new Uint8Array(80); ogg.set([0x4f, 0x67, 0x67, 0x53]); const r1 = saveVoiceClip('.', id, '00000000-00000000.ogg', ogg), r2 = saveVoiceClip('.', id, '../x.ogg', ogg), r3 = saveVoiceClip('.', id, `${vp.lines[0].clip}.ogg`, new Uint8Array(80));
      ok(`${id}: the voice store takes only a current line's clip, by name and kind (no line, a path, not Ogg: refused)`, !r1.ok && r1.status === 409 && !r2.ok && r2.status === 400 && !r3.ok && r3.status === 415); }
  }
  // the fight step (Mog City's street fighting, W.combat): test-fight is the worked example
  { const FT = JSON.parse(R('storykit/packs/test-fight.json')), fight = (p: any) => p.acts[0].missions[0].steps.find((s: any) => s.type === 'fight');
    bad('a fight against the hero himself', FT, (p) => { fight(p).enemies = ['nico', 'vance']; }, /"nico" is the hero/);
    bad('a fight against someone not in the cast', FT, (p) => { fight(p).enemies = ['vance', 'nobody']; }, /"nobody" is not in the cast/);
    bad('a fight against a voice-only person (no body)', FT, (p) => { p.cast.push({ id: 'desk', anchor: 'none', color: '#999999', voiceOnly: true, voice: { id: 'desk-v1', kokoro: 'bf_emma', description: 'a night desk' } }); fight(p).enemies = ['desk']; }, /"desk" is voiceOnly/);
    bad('a survive fight with no timer', FT, (p) => { const f = fight(p); f.win = 'survive'; delete f.timer; }, /a survive fight needs a timer/);
    bad('a fight in a place the city does not have', FT, (p) => { fight(p).arena = '@chicago-loop'; }, /"@chicago-loop" is not a place in New York/);
    bad('a fight with no one to fight', FT, (p) => { fight(p).enemies = []; }, /enemies/);
    const v1 = runnerPackOf(gatePack(FT).pack), f1 = v1.missions[0].steps.find((s: any) => s.type === 'fight'), f2 = v1.missions[1].steps.find((s: any) => s.type === 'fight');
    ok('a fight names its men as the runner does (display names; one named twice is two of him), its arena a place',
      f1.enemies.join() === 'Vance Okafor,Marko Lisic,Tomas Reyes' && f2.enemies.filter((n: string) => n === 'Vance Okafor').length === 2 && f1.arena === '@the-corner' && f2.win === 'survive' && f2.timer === 35);
  }
  { const NS = JSON.parse(R('storykit/packs/test-night-shift.json')), ns1 = (p: any) => p.acts[0].missions[0];
    const shotAt = (p: any) => ns1(p).steps.find((s: any) => s.type === 'cutscene').shots;
    bad('a close-up on a voice-only person (they have no body)', NS, (p) => { p.cast.push({ id: 'desk', anchor: 'none', color: '#999999', voiceOnly: true, voice: { id: 'desk-v1', kokoro: 'bf_emma', description: 'a night desk' } }); shotAt(p)[1].cam.rel = 'desk'; }, /"desk" is voiceOnly/);
    bad('a close-up on someone not in the cast', NS, (p) => { shotAt(p)[1].look.rel = 'nobody'; }, /"nobody" is not in the cast/);
    bad('a cutscene line with no speaker', NS, (p) => { delete shotAt(p)[1].say; }, /a line needs a speaker/);
    bad('a call\'s choice that jumps to no step', NS, (p) => { ns1(p).steps[1].during[0].choice.options[0].goto = 'nowhere'; }, /choice\.options\[0\]\.goto: no step is "nowhere"/);
    { const p = clone(NS); ns1(p).steps[1].objective = 'A fare is waiting on **E Houston St**'; const r = gatePack(p); ok('Houston St is a New York street, not Houston (a label may name it)', r.ok, r.problems.join(' | ')); }
    const v1 = runnerPackOf(gatePack(NS).pack), m = v1.missions[0], cut = m.steps.find((s: any) => s.type === 'cutscene');
    ok('a sheet car becomes the runner\'s car { sheet }, a close-up names its person, a call\'s choice replies in the caller\'s name',
      v1.car?.sheet?.id === 'rides.night-cab' && m.vehicle === 'rides.night-cab' && cut.shots[1].cam.rel === 'Mrs. Kwon' && cut.shots[1].sub[0] === 'Mrs. Kwon'
        && m.steps[1].during[0].choice.options[1].reply[0] === 'Sgt. Ray Ortega' && v1.dressing.weather === 'snow');
  }
}
