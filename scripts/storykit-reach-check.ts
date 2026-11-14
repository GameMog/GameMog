/**
 * Story Kit: only where a player can stand (the owner, 14 Nov: "putting rings inside buildings does not work
 * especially since you can NOT enter buildings on the platform"). Part of `npm run check`; alone:
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-reach-check.ts
 *
 * No model call, no browser: Mog City's side (its test drive failing a step no player could do) is MogCity
 * tests/storyrun-reach.test.mjs and the branch's browser evidence. Here, on the Okemah fixture town with a parking
 * structure whose middle is 25 m inside it (the shape of The Courtesy Lane's boat-trailer lot):
 *   - approachOf (storykit/hometown/approach.ts): a structure's far middle is drive-up only; an open lot, a corner, the
 *     town's own flag when it has one
 *   - the hometown gate sends back an on-foot search held at that middle (not a search of the ride, not a drive there)
 *   - the builder's place list marks it drive-up only, and never offers a place a test drive found unreachable
 *   - a drive's reach failure: read strictly (lib/drive-reach.ts), carried by the report (lib/storykit-publish.ts), and
 *     fixed the builder's way (lib/storykit-reach.ts planReachFix): the alias swapped to the nearest reachable lot that
 *     passes the gate, the place remembered, the untouched missions banked; none to be had, the reason stands
 *   - the store takes the swapped pack (StoryStore.repack, gated; never a published world)
 *   - the work page carries Mog City's `reach` into its report and drives again on a `swap` (public/storykit/work.js)
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import type { CityPackage } from '../storykit/hometown/city-package.ts';
import { approachOf, approachProblems, targetsOf, withUnreachable, markOf, swapPlace, CENTRE_FAR } from '../storykit/hometown/approach.ts';
import { gateHometown } from '../storykit/hometown/hometown-gate.ts';
import { hometownPlaceList, checkHometownReply } from '../lib/storykit-hometown.ts';
import { readReach } from '../lib/drive-reach.ts';
import { readDriveReport } from '../lib/storykit-publish.ts';
import { planReachFix, SWAPS } from '../lib/storykit-reach.ts';
import { StoryStore } from '../lib/storykit-store.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;
const R = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const reply = (r: { meta: unknown; pack: unknown }) => '```json\n' + JSON.stringify(r.meta) + '\n```\n\n```json\n' + JSON.stringify(r.pack) + '\n```';
const show = (xs: string[]) => xs.slice(0, 3).join(' | ').slice(0, 400);

export async function runReachChecks(ok: Ok) {
  console.log('\nStory Kit: only where a player can stand (storykit/hometown/approach.ts, lib/storykit-reach.ts)');
  const TOWN: CityPackage = R('storykit/hometown/fixtures/okemah.citypackage.json'), REPLY = R('storykit/hometown/fixtures/okemah.reply.json');
  // the fixture town, with its fairgrounds lot a parking structure (its middle 25 m in from its street front) and a
  // second, open lot 300 m east (its middle 4 m in)
  const town = clone(TOWN);
  const lot = town.places.find((p) => p.id === 'fairgrounds-lot')!;
  Object.assign(lot, { cx: lot.x + 25, cz: lot.z });
  town.places.push({ id: 'east-lot', kind: 'parking', name: 'the east lot', x: lot.x + 300, z: lot.z, cx: lot.x + 304, cz: lot.z, tags: ['overture=parking'] });

  // ── approachOf
  ok('a parking structure whose middle is far from its street front is drive-up only; an open lot is walked into',
    approachOf(lot) === 'car' && approachOf(town.places.find((p) => p.id === 'east-lot')!) === 'foot', `${CENTRE_FAR} m`);
  ok('a far middle is no reason on its own (a park, a square), and a place with no middle on record is walked into',
    approachOf({ kind: 'park', x: 0, z: 0, cx: 80, cz: 0 }) === 'foot' && approachOf({ kind: 'parking', x: 0, z: 0 }) === 'foot');
  ok('the town\'s own flag wins over the guess (the hook for the source\'s reach data)',
    approachOf({ kind: 'parking', x: 0, z: 0, cx: 40, cz: 0, approach: 'foot' }) === 'foot' && approachOf({ kind: 'park', x: 0, z: 0, approach: 'none' }) === 'none');

  // ── the gate: an on-foot search at the structure's middle is sent back
  const pack = clone(REPLY.pack);
  pack.places = { ...(pack.places ?? {}), 'boat-lot': { '@': 'fairgrounds-lot', name: 'the boat-trailer lot' } };
  const m3 = pack.acts.flatMap((a: any) => a.missions).find((m: any) => m.id === 'M3');
  m3.steps.splice(m3.steps.length - 1, 0, { type: 'drive', to: '@boat-lot', objective: 'Drive to **the boat-trailer lot**.' }, { type: 'search', at: '@boat-lot', label: 'take the salvage log', secs: 2, objective: 'Take **the salvage log**.' });
  const iSearch = m3.steps.findIndex((s: any) => s.type === 'search');
  const t = targetsOf(pack).filter((x) => x.key === 'boat-lot');
  ok('targetsOf: the drive ends at the lot\'s street front, the search is held at its middle',
    t.length === 2 && t.some((x) => x.type === 'drive' && !x.centre) && t.some((x) => x.type === 'search' && x.centre && x.step === iSearch), JSON.stringify(t));
  const probs = approachProblems(pack, town);
  ok('the gate sends back the on-foot search at the structure\'s middle, and only it', probs.length === 1 && /search "take the salvage log" is held at the middle of @boat-lot/.test(probs[0]) && /inside a building/.test(probs[0]), show(probs));
  const pass = checkHometownReply(reply({ meta: REPLY.meta, pack }), { pkg: town, id: 'sk-reach01' });
  ok('the builder\'s pass is refused with it (the gate\'s problems are what the build loop sends back)', !pass.pack && pass.problems.some((p) => /parking structure whose middle is inside a building/.test(p)), show(pass.problems));
  const ride = clone(pack); ride.acts.flatMap((a: any) => a.missions).find((m: any) => m.id === 'M3').steps[iSearch].on = 'ride';
  ok('a search of the ride there is fine (it is held at the car)', approachProblems(ride, town).length === 0);
  ok('the original fixture story still passes in the town', !!checkHometownReply(reply(REPLY), { pkg: town, id: 'sk-reach02' }).pack);

  // ── the builder's place list
  const list = hometownPlaceList(town), marked = hometownPlaceList(withUnreachable(town, ['east-lot']));
  ok('the builder reads the structure as drive-up only, and the rule that nobody enters a building',
    /@fairgrounds-lot: [^\n]*drive-up only/.test(list) && /Nobody can enter a building in the game/.test(list) && /@east-lot:/.test(list));
  ok('a place a test drive found unreachable is never offered', !/@east-lot:/.test(marked) && /@fairgrounds-lot:/.test(marked));
  ok('withUnreachable never loosens a flag: none beats car, the town\'s own car stays',
    approachOf(withUnreachable(town, [['fairgrounds-lot', 'none']]).places.find((p) => p.id === 'fairgrounds-lot')!) === 'none'
      && approachOf(withUnreachable(town, [['fairgrounds-lot', 'car'], 'fairgrounds-lot']).places.find((p) => p.id === 'fairgrounds-lot')!) === 'none'
      && approachOf(withUnreachable(town, [['fairgrounds-lot', 'car']]).places.find((p) => p.id === 'fairgrounds-lot')!) === 'car');

  // ── a drive's reach failure, as Mog City sends it and the work page reports it
  const raw = { mission: 'M3', step: iSearch, type: 'search', at: 'boat-lot', place: 'fairgrounds-lot', kind: 'parking', name: 'the boat-trailer lot', x: 282.4, z: 912.6, mode: 'person', why: 'inside', label: 'take the salvage log', junk: '<script>' };
  const reach = readReach(raw);
  ok('readReach keeps what the builder needs, nothing else', !!reach && reach.place === 'fairgrounds-lot' && reach.why === 'inside' && reach.step === iSearch && !('junk' in reach) && !('label' in reach));
  ok('readReach refuses a reason it does not know, a bad key or a missing step',
    !readReach({ ...raw, why: 'bored' }) && !readReach({ ...raw, step: 'x' }) && readReach({ ...raw, at: '../x' })?.at === undefined && !readReach(null));
  const rep = readDriveReport({ missions: [{ id: 'M1', state: 'passed' }, { id: 'M2', state: 'passed' }, { id: 'M3', state: 'failed' }], errors: 0, reason: '"M3" cannot be played: Unreachable: ...', stuck: { id: 'M3', step: iSearch, type: 'search' }, reach: raw });
  ok('the drive report carries the reach (lib/storykit-publish.ts readDriveReport)', rep?.reach?.place === 'fairgrounds-lot' && readDriveReport({ missions: [], errors: 0, reach: { why: 'nope' } })?.reach === undefined);
  ok('markOf: a failed step held at the middle leaves the street front playable; one at the street front, nothing',
    JSON.stringify(markOf(pack, reach!)) === '["fairgrounds-lot","car"]' && JSON.stringify(markOf(pack, { mission: 'M3', at: 'boat-lot', place: 'fairgrounds-lot', type: 'drive' })) === '["fairgrounds-lot","none"]');

  // ── the builder's fix: the stored pack as built before the town knew the lot's middle (the gate passed it then)
  const before = gateHometown(clone(pack), TOWN);
  ok('(the pack as stored: it passed the gate on the town without the middle on record)', before.ok && !!before.pack, show(before.problems));
  const stored = before.pack as Record<string, any>;
  const report = { status: 'failed', drive: { missions: [{ id: 'M1', state: 'passed' }, { id: 'M2', state: 'passed' }, { id: 'M3', state: 'failed' }], errors: 0, reason: 'x' } };
  const plan = planReachFix({ report, pack: stored, reach: reach!, pkg: town });
  const swap = plan.fix.swap;
  ok('the reach failure is fixed the builder\'s way: the alias moved to the nearest reachable lot', !!swap && swap.to === 'east-lot' && swap.from === 'fairgrounds-lot' && swap.alias === 'boat-lot' && swap.how === 'alias'
    && plan.pack?.places['boat-lot']['@'] === 'east-lot' && plan.pack?.places['boat-lot'].name === 'the boat-trailer lot', JSON.stringify(plan.fix));
  const after = withUnreachable(town, plan.report.unreachable);
  ok('the swapped pack passes the gate with the place remembered', gateHometown(clone(plan.pack), after, {}).ok, show(gateHometown(clone(plan.pack), after, {}).problems));
  ok('the draft remembers the place (drive-up only) and the swap, and keeps the missions the swap left as they were',
    JSON.stringify(plan.report.unreachable) === '[["fairgrounds-lot","car"]]' && plan.report.swaps?.length === 1 && plan.report.status === 'unverified'
      && plan.report.drive.missions.map((m: any) => m.id).join() === 'M1,M2' && plan.report.drive.reach === null);
  const alsoM1 = clone(stored); alsoM1.acts.flatMap((a: any) => a.missions).find((m: any) => m.id === 'M2').steps.unshift({ type: 'drive', to: '@boat-lot' });
  const plan2 = planReachFix({ report, pack: alsoM1, reach: reach!, pkg: town });
  ok('a passed mission that names the swapped alias is driven again', plan2.report.drive?.missions?.map((m: any) => m.id).join() === 'M1', JSON.stringify(plan2.report.drive?.missions));
  const lone = clone(town); lone.places = lone.places.filter((p) => p.id !== 'east-lot');
  const none = planReachFix({ report, pack: stored, reach: reach!, pkg: lone });
  ok('no other reachable place of the kind: nothing swapped, the place remembered, the reason stands', none.fix.swap === null && /no other parking/.test((none.fix as any).why) && !none.pack && JSON.stringify(none.report.unreachable) === '[["fairgrounds-lot","car"]]');
  ok(`at most ${SWAPS} swaps a draft, never a published world, never New York's curated places`,
    planReachFix({ report: { ...report, swaps: [1, 2, 3] }, pack: stored, reach: reach!, pkg: town }).fix.swap === null
      && planReachFix({ report, pack: stored, published: true, reach: reach!, pkg: town }).fix.swap === null
      && planReachFix({ report, pack: { ...stored, base: { city: 'ny' } }, reach: reach!, pkg: town }).fix.swap === null);
  ok('a swap never lands on a place another drive found unreachable', planReachFix({ report, pack: stored, reach: reach!, pkg: town, townMarks: ['east-lot'] }).fix.swap === null);
  ok('swapPlace keeps the gate\'s word: a candidate the gate refuses is passed over', swapPlace(stored, reach!, town, () => false) === null);

  // ── the store takes the swapped pack (a New York world here: the store's own fixture)
  const root = mkdtempSync(path.join(tmpdir(), 'storykit-reach-'));
  try {
    const s = new StoryStore(root, () => Date.UTC(2026, 10, 14, 12));
    const NY = R('storykit/pack/fixtures/good-ny.json');
    const o = s.open(NY);
    if (!o.ok) { ok('a store draft opens', false, o.error); return; }
    const d0 = s.auth(o.id, o.token)!, w0 = s.seal(d0);
    const moved = clone(NY); moved.title = `${NY.title} Again`;
    const r1 = s.repack(o.id, moved);
    const d1 = s.auth(o.id, o.token)!, w1 = s.seal(d1);
    ok('repack: the draft takes the new pack, gated, and seals afresh', r1.ok && JSON.parse(d1.pack).title === moved.title && w0.ok && w1.ok && w0.hash !== w1.hash);
    const bad = clone(NY); bad.base.city = 'atlantis';
    const r2 = s.repack(o.id, bad);
    ok('repack refuses a pack the gate refuses, and changes nothing', !r2.ok && r2.status === 422 && JSON.parse(s.auth(o.id, o.token)!.pack).title === moved.title);
    s.keep(o.id, 'g-1');
    ok('repack never changes a published world (that is the owner\'s patch)', (() => { const r = s.repack(o.id, NY); return !r.ok && r.status === 409; })());
  } finally { rmSync(root, { recursive: true, force: true }); }

  // ── the work page
  const work = readFileSync('public/storykit/work.js', 'utf8');
  ok('the work page carries Mog City\'s reach into its report and drives again on the server\'s swap (at most 3)',
    /reach = reachOf\(d\.reach\) \|\| reach/.test(work) && /\.\.\.\(drive\.reach \? \{ reach: drive\.reach \} : \{\}\)/.test(work) && /if \(!sw \|\| swaps\.length >= 3\) break;/.test(work) && /cannot be played: /.test(work));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failures = 0;
  await runReachChecks((name, cond, detail) => { if (!cond) failures++; console.log(`${cond ? '  ok ' : '  FAIL'} ${name}${!cond && detail ? `\n       ${detail}` : ''}`); });
  console.log(failures ? `\n${failures} FAILED` : '\nall reach checks passed');
  process.exit(failures ? 1 : 0);
}
