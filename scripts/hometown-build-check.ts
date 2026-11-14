/**
 * The production town builder (lib/hometown-build/, SPEC tasks G1-G8): one play box, stage 1 in TS against the real
 * compiler (a fixture of 1,000 places), the new store families and their upload checks, the GC of sources, the durable
 * queue on a fake clock (enqueue, masks, claim order, deps, leases, heartbeats, the reaper, retries, exit 3), a town's
 * job graph and admission, the worker protocol, the owner switch, lock v3 and the story's spawn-district rule. Part of
 * npm run check; on its own:
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/hometown-build-check.ts
 *
 * Offline: a temp directory, fake tiles, no server, no Python, no network, no model (STORYKIT_FAKE_REPLY's fixture).
 */
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { playBox, boxHash } from '../lib/hometown/box.ts';
import { canonicalBox } from '../lib/hometown/towns.ts';
import { playBox as prewarmBox } from '../lib/hometown-tiles/prewarm-list.ts';
import { stage1, anchorTile } from '../lib/hometown-build/grid.ts';
import { samplePlaces, FIXTURE } from './hometown-build-fixture.ts';
import { parseKeyString, bundleKey, frameKey, srcKey, farKey, tileKey, ctxKey, maxUploadOf, buildOfKey } from '../lib/hometown-tiles/keys.ts';
import { TileStore, GB } from '../lib/hometown-tiles/store.ts';
import { verifyObject } from '../lib/hometown-tiles/http.ts';
import { planGc } from '../lib/hometown-tiles/gc.ts';
import { hometownConfig } from '../lib/hometown-tiles/config.ts';
import { BuildQueue, LEASE_MS, MAX_ATTEMPTS, BACKOFF_MS, maskBits } from '../lib/hometown-build/queue.ts';
import { requestTown, townStatus, townGraph, gazetteerOf, blocksOf, quadsOf, QUAD_RING, townRegions, promisedOutputs, afterJobDone, storyReadyLock, cityPackageFromStore, PHASE_WORDS, BUSY_WORDS, bestVariant, onBundleStored, fatalFailures, townsStatus, type BuilderDeps,
  STEP_WORDS, WAIT_SEED, ETA_FLOOR_S, honestEta, waitHistory, pctOf, stageOf, type TownSteps, type Progress } from '../lib/hometown-build/towns.ts';
import { townDriveUrl, withDrive } from '../lib/storykit-publish.ts';
import { workerResponse, builderAdminResponse, regionsJobOf, argsOf } from '../lib/hometown-build/server.ts';
import type { Job } from '../lib/hometown-build/queue.ts';
import { townsAccess, townBoxEnabled } from '../lib/hometown-build/access.ts';
import { cityPackageOfFrame, frameProblems, normalizeFrame, type TownFrame } from '../lib/hometown-build/frame.ts';
import { nameCase, titleStreet } from '../lib/hometown/names.ts';
import { storyLock, serviceLock, sameServiceLock, tilesIdOf, type ServiceLock } from '../lib/hometown/ids.ts';
import { cityLock, packageProblems, hometownBase, type CityPackage } from '../storykit/hometown/city-package.ts';
import { gateHometown, districtProblems } from '../storykit/hometown/hometown-gate.ts';
import { placeById } from '../lib/places/search.ts';
import type { Place } from '../lib/places/types.ts';
import { requestCity, setFollowMsForChecks, FOLLOW_MS, type CityRequest } from '../lib/places/request-city.ts';
import { TOWN_WORDS } from '../lib/hometown/words.ts';
const TOWN_WORDS_FAILED = TOWN_WORDS.failed;

type Ok = (name: string, cond: boolean, detail?: string) => void;
const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const tilesOfJobIds = (j: Job) => maskBits(Number(j.args.mask)).map((i) => { const [, , C, R] = String(j.args.block).split('/').map(Number); return `hg1-conus/0/${C * 4 + (i & 3)}/${R * 4 + (i >> 2)}`; });
const W_TOKEN = 'worker-token-0123456789abcdef-only-for-this-check';
const A_TOKEN = 'admin-token-0123456789abcdef-only-for-this-check';
const FORBIDDEN = /\b(claude|anthropic|ai|a\.i\.|model|llm|gta|gen z quant|opus|sonnet)\b/i;

export async function runBuildChecks(ok: Ok) {
  console.log('\nHometown production builder: one box, stage 1 in TS, store families, the queue, towns, the worker protocol, lock v3 (lib/hometown-build)');
  const dir = mkdtempSync(path.join(tmpdir(), 'hometown-build-check-'));
  try {
    g1(ok);
    g2(ok, dir);
    g3(ok, dir);
    await g4to6(ok, dir);
    g7(ok);
    await robustness(ok, dir);
    await createCard(ok);
    honestCard(ok, dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ---------------------------------------------------- the Create card follows a town that is ready to write (14 Nov)
async function createCard(ok: Ok) {
  const real = globalThis.fetch;
  const place = { placeId: 'us-1207150', name: 'Beverly Beach', state: 'FL' } as unknown as Parameters<typeof requestCity>[0];
  const growing = { status: 202, body: { state: 'compiling', phase: 'growing', lock: { place: 'us-1207150', compiler: B, tiles: 'a'.repeat(64) }, town: { name: 'Beverly Beach', state: 'FL', places: 9, streets: 31 } } };
  const run = async (later: { status: number; body: Record<string, unknown> }[]) => {
    const answers = [growing, ...later];
    globalThis.fetch = (async () => { const a = answers.length > 1 ? answers.shift()! : answers[0]; return new Response(JSON.stringify(a.body), { status: a.status }); }) as typeof fetch;
    const got: CityRequest[] = [];
    const ctl = new AbortController();
    const first = await requestCity(place, undefined, ctl.signal, (r) => got.push(r));
    for (let i = 0; i < 100 && !got.length; i++) await new Promise((r) => setTimeout(r, 10));
    ctl.abort();
    return { first, got };
  };
  setFollowMsForChecks(5);
  try {
    const failed = await run([growing, { status: 409, body: { state: 'error', error: TOWN_WORDS_FAILED } }]);
    ok('the Create card follows a town ready to write: when it fails afterwards the card is told (not left "Ready to write")',
      failed.first.status === 'ready' && !!(failed.first as { growing?: boolean }).growing && failed.got.length === 1 && failed.got[0].status === 'error', JSON.stringify(failed.got));
    const whole = await run([{ status: 503, body: { error: 'busy' } }, { status: 200, body: { state: 'ready', lock: growing.body.lock, town: growing.body.town } }]);
    ok('...and when it is whole the card says so (a server busy for a moment is no failure)', whole.got.length === 1 && whole.got[0].status === 'ready' && !(whole.got[0] as { growing?: boolean }).growing, JSON.stringify(whole.got));
  } finally { globalThis.fetch = real; setFollowMsForChecks(FOLLOW_MS); }
}

// ------------------------------------------- the Create card's honest progress (r7: live QA 14 Nov, Cedar Key, FL)
// (it sat on "Reading the map, 0 of 169" for 2.5 min while its estimate rose from 50 s; it said "about 50 seconds" to
// drive and took 201 s; it never said "Ready to drive" and had no way to drive the town)
function honestCard(ok: Ok, dir: string) {
  const steps = (o: Partial<TownSteps> = {}): TownSteps => ({ regions: { done: 0, total: 3 }, ctx: { done: 0, total: 4 }, frame: false, tiles: { done: 0, total: 169 }, district: false, full: false, running: 1, ...o });
  ok('the card names the step a town is on, with its count: a builder starting, map areas fetched, map sections read, its plan, streets',
    stageOf('asked', steps(), true, true, false) === STEP_WORDS.starting && stageOf('asked', steps(), false, true, false) === PHASE_WORDS.asked
      && stageOf('framing', steps({ regions: { done: 1, total: 3 } }), false, true, false) === 'Fetching map data: 1 of 3 areas'
      && stageOf('framing', steps({ regions: { done: 3, total: 3 }, ctx: { done: 2, total: 4 } }), false, true, false) === 'Reading the map: 2 of 4 sections'
      && stageOf('framing', steps({ regions: { done: 3, total: 3 }, ctx: { done: 4, total: 4 } }), false, false, false) === STEP_WORDS.planning
      && stageOf('framing', steps({ regions: { done: 3, total: 3 }, ctx: { done: 4, total: 4 } }), false, false, true) === STEP_WORDS.building
      && stageOf('growing', steps(), false, false, true) === PHASE_WORDS.growing && stageOf('full', steps(), false, false, true) === PHASE_WORDS.full);
  ok('...in words that name no tool, vendor or model', Object.values(STEP_WORDS).every((w) => !FORBIDDEN.test(w)));
  // the bar: by work done, rising through every step, never 100 before the town is whole
  const seq: [TownSteps, Progress['phase']][] = [
    [steps(), 'asked'], [steps(), 'framing'], [steps({ regions: { done: 1, total: 3 } }), 'framing'], [steps({ regions: { done: 3, total: 3 } }), 'framing'],
    [steps({ regions: { done: 3, total: 3 }, ctx: { done: 4, total: 4 } }), 'framing'], [steps({ regions: { done: 3, total: 3 }, ctx: { done: 4, total: 4 }, frame: true, tiles: { done: 4, total: 169 } }), 'district'],
    [steps({ regions: { done: 3, total: 3 }, ctx: { done: 4, total: 4 }, frame: true, tiles: { done: 60, total: 169 }, district: true }), 'growing'],
    [steps({ regions: { done: 3, total: 3 }, ctx: { done: 4, total: 4 }, frame: true, tiles: { done: 169, total: 169 }, district: true }), 'growing'],
    [steps({ regions: { done: 3, total: 3 }, ctx: { done: 4, total: 4 }, frame: true, tiles: { done: 169, total: 169 }, district: true, full: true }), 'full'],
  ];
  const pcts = seq.map(([st, ph]) => pctOf(st, ph));
  ok('the bar rises with the work through every step (areas, sections, plan, tiles), under 100 until the town is whole', pcts.every((v, i) => i === 0 || v >= pcts[i - 1]) && pcts[2] > pcts[1] && pcts[3] > pcts[2] && pcts.slice(0, -1).every((v) => v < 100) && pcts.at(-1) === 100, pcts.join(' '));
  // the waits: never less than what towns really took (Cedar Key: "about 50 seconds" to drive, 201 s in fact)
  const seed = { driveS: 208, fullS: 404, n: 0, driveRatio: 1, fullRatio: 1 };
  const at0 = honestEta({ etaDriveS: 50, etaFullS: 90 }, seed, 0, 'asked'), at150 = honestEta({ etaDriveS: 50, etaFullS: 90 }, seed, 150, 'framing');
  ok('a fresh pick is never promised less than the median town took (the estimate said 50 s; history says 208 s)', at0.etaDriveS === 208 && at0.etaFullS === 404 && !at0.slow, JSON.stringify(at0));
  ok('...and as it waits, the wait left is the median less the time so far, never under the estimate or the floor', at150.etaDriveS === 58 && honestEta({ etaDriveS: 5, etaFullS: 5 }, seed, 400, 'framing').etaDriveS === ETA_FLOOR_S && honestEta({ etaDriveS: 120, etaFullS: 200 }, seed, 150, 'framing').etaDriveS === 120);
  ok('...a town far past the median says it is slow; a drivable town waits only for the whole town', honestEta({ etaDriveS: 5, etaFullS: 5 }, seed, 400, 'framing').slow && !honestEta({ etaDriveS: 5, etaFullS: 5 }, seed, 220, 'framing').slow && honestEta({ etaDriveS: 30, etaFullS: 60 }, seed, 220, 'growing').etaDriveS === 0 && honestEta({ etaDriveS: 30, etaFullS: 60 }, seed, 220, 'growing').etaFullS === 184);
  ok('...and the estimate is scaled by how far towns overran it (actual / promised)', honestEta({ etaDriveS: 100, etaFullS: 100 }, { ...seed, driveRatio: 4 }, 300, 'framing').etaDriveS === 400);
  // the recorded timings: the towns table (first ask to district_at and full_at), the seed while it has under 3
  const t = { now: Date.now() };
  const d = fakeDeps(dir, 'r7', { HOMETOWN_BUILDER: 'on' }, t);
  try {
    const h0 = waitHistory(d);
    ok('with no town recorded, the live r6 builds stand in (Cedar Key 201/357 s, Bal Harbour 215/450 s)', h0.n === 0 && h0.driveS === Math.round((WAIT_SEED[0].driveS + WAIT_SEED[1].driveS) / 2) && h0.fullS === Math.round((WAIT_SEED[0].fullS + WAIT_SEED[1].fullS) / 2) && h0.driveRatio === 1, JSON.stringify(h0));
    const ins = d.queue.db.prepare("INSERT INTO towns (place, build, box, state, first_asked, district_at, full_at, tiles_total, tiles_done, asks, source, meta) VALUES (?, ?, '[]', 'full', ?, ?, ?, 1, 1, 1, ?, ?)");
    const T0 = t.now - 3600_000;
    [[300, 600, 'player', 60], [320, 640, 'player', 80], [280, 500, 'owner-test', 70], [20, 40, 'prewarm', 10]].forEach(([dr, fu, src, pr], i) =>
      ins.run(`us-90000${i}0`, B, T0 + i, T0 + i + Number(dr) * 1000, T0 + i + Number(fu) * 1000, String(src), JSON.stringify({ promised: { driveS: pr, fullS: Number(pr) * 2 } })));
    t.now += 16_000;
    const h = waitHistory(d);
    ok('with 3 or more, the median of the towns players and the owner asked for (pre-warm left out), and their overrun of the promise', h.n === 3 && h.driveS === 300 && h.fullS === 600 && h.driveRatio === 4 && h.fullRatio === 4, JSON.stringify(h));
  } finally { d.queue.close(); }
  // the test drive: Mog City, the town's bundle by its playable variant, no story, ?host= this site
  const play = { build: B, tilesId: 'a'.repeat(64), variant: 'district-5806-4290' };
  const url = new URL(townDriveUrl('us-1211225', play, 'https://gamemog.com'));
  ok('"Drive around <town>": Mog City with city=pkg, the town, its build, tiles and variant, and this site as host (no story, no pack)',
    url.origin === 'https://mc.gamemog.com' && url.searchParams.get('city') === 'pkg' && url.searchParams.get('town') === 'us-1211225' && url.searchParams.get('tc') === B
      && url.searchParams.get('ts') === play.tilesId && url.searchParams.get('tv') === play.variant && url.searchParams.get('host') === 'https://gamemog.com' && !url.searchParams.has('pack') && !url.searchParams.has('story'), url.href);
  const w = withDrive({ status: 202, body: { placeId: 'us-1211225', phase: 'growing', play } }, 'http://localhost:4985') as { body: { drive?: string } };
  const none = withDrive({ status: 202, body: { placeId: 'us-1211225', phase: 'framing' } }) as { body: { drive?: string } };
  ok('a towns answer carries `drive` only once a variant is playable (its host the asking site)', w.body.drive === townDriveUrl('us-1211225', play, 'http://localhost:4985') && none.body.drive === undefined, w.body.drive);
}

// ---------------------------------------------------------------------------------------- G1: one box, stage 1
function g1(ok: Ok) {
  const fx = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { maxSideM: number; places: Record<string, unknown>[] };
  const by = new Map(fx.places.map((p) => [String(p.placeId), p]));
  const sample = samplePlaces();
  let boxBad = 0, s1Bad = 0, first = '';
  for (const p of sample) {
    const py = by.get(p.placeId) as Record<string, unknown> | undefined;
    if (!py) { boxBad++; continue; }
    const b = playBox(p);
    if (JSON.stringify(b) !== JSON.stringify(py.box)) { boxBad++; first ||= `${p.placeId} box ${b} vs ${py.box}`; }
    if (py.refused) continue;
    const s = stage1(p.placeId, { geoid: p.geoid, anchor: [p.lon, p.lat], bbox: b });
    const o = py.origin as Record<string, number>, pb = py.playBox as Record<string, number>;
    const same = s.domain === py.domain && s.origin.c0 === o.c0 && s.origin.r0 === o.r0 && s.origin.lon === o.lon && s.origin.lat === o.lat && s.k0 === py.k0 && s.gamma0 === py.gamma0
      && s.playBox.gx0 === pb.gx0 && s.playBox.gs0 === pb.gs0 && s.playBox.gx1 === pb.gx1 && s.playBox.gs1 === pb.gs1
      && JSON.stringify(s.tileRange) === JSON.stringify(py.tileRange) && s.tiles.length === py.tiles && s.tiles[0] === py.first;
    if (!same) { s1Bad++; first ||= `${p.placeId} stage 1 differs`; }
  }
  ok(`THE play box equals fetch.py's own cap (Python, the real compiler) on all ${sample.length} places`, sample.length === 1000 && boxBad === 0 && fx.maxSideM === 4500, first);
  ok(`stage 1 in TS (tile range, frame origin, k0, gamma0, play box) equals assemble.py stage1 on all ${sample.length} places`, s1Bad === 0, first);
  const domains = new Set(fx.places.map((p) => p.domain));
  ok('the sample covers the lower 48 and the other domains', domains.has('conus') && domains.has('ak') && domains.has('hi') && domains.has('pr'), [...domains].join(','));
  const okemah = placeById('us-4054200')!;
  ok('on-demand and pre-warm give a town ONE box (towns canonicalBox = prewarm playBox = box.ts)', JSON.stringify(canonicalBox(okemah)) === JSON.stringify(prewarmBox(okemah)) && JSON.stringify(prewarmBox(okemah)) === JSON.stringify(playBox(okemah)));
  ok('a box hash is short and stable', boxHash(playBox(okemah)) === boxHash(playBox(okemah)) && /^[0-9a-f]{8}$/.test(boxHash(playBox(okemah))));
}

// ------------------------------------------------------------------------------------- G2: the store's new families
const B = 'htc-0.5.0-hg1-b193e041e';
const T64 = 'a'.repeat(64);
function lockV3(place: string, build: string, tiles: string[], extra: Partial<ServiceLock> = {}): ServiceLock {
  return { format: 'hometown-city-lock', formatVersion: 3, place, buildId: build, tiles: tilesIdOf(build, tiles), grid: 'hg1', domain: 'conus', origin: { c0: 5806, r0: 4290 }, k0: 0.999, gamma0: -0.19, yOffset: 230, waterLevel: 228, ...extra };
}
function g2(ok: Ok, dir: string) {
  const keys = [frameKey(B, 'us-4054200'), bundleKey(B, 'us-4054200', T64, 'full', 'geodata.json'), bundleKey(B, 'us-4054200', T64, 'district-5806-4290', 'data/far/a-1-2.bin.gz'),
    farKey(B, 'conus', 3, 12, 34), srcKey('2026-10-21.0', 'conus', 362, 268, 'overture-buildings-building.parquet'), srcKey('2026-10-21.0', 'conus', 362, 268, 'files.json'), 'dem/13/n36w097/abc123-4567/7.bin', 'dem/1/n36w097/abc123-4567/meta.json'];
  ok('the new families parse (frames, bundles full and district, far, src, dem)', keys.every((k) => parseKeyString(k)?.key === k), keys.find((k) => !parseKeyString(k)));
  const badKeys = [bundleKey(B, 'us-4054200', T64, 'part', 'geodata.json'), bundleKey(B, 'us-4054200', 'abc', 'full', 'geodata.json'), bundleKey(B, 'us-4054200', T64, 'full', '../x'), farKey(B, 'conus', 2, 1, 1),
    'src/overture/latest/hg1-conus/4/1/1/files.json', 'src/overture/2026-10-21.0/hg1-conus/4/1/1/evil.sh', 'dem/13/n36w097/abc/7.bin', 'dem/snapshots/x.json'];
  ok('anything else is not a key', badKeys.every((k) => !parseKeyString(k)), badKeys.find((k) => parseKeyString(k)));
  ok('src layers may be 64 MB, DEM pieces 2 MB, the rest 16 MB', maxUploadOf('src') === 64 << 20 && maxUploadOf('dem') === 2 << 20 && maxUploadOf('tiles') === 16 << 20);
  ok('src and dem count towards no build (the GC keeps them apart)', buildOfKey(keys[4]) === null && buildOfKey(keys[6]) === null && buildOfKey(keys[0]) === B);

  const store = new TileStore({ root: path.join(dir, 'g2'), capBytes: GB, minFreeBytes: 0, freeBytes: () => 100 * GB, log: () => {} });
  const put = (k: string, b: Buffer, s: string | null = null) => { const v = verifyObject(store, k, b, s); if (v.ok) store.put(k, b); return v; };
  // frames
  const tiles = ['hg1-conus/0/5806/4290', 'hg1-conus/0/5807/4290'];
  const frame = (l: ServiceLock, t = tiles) => Buffer.from(JSON.stringify({ format: 'hometown-frame', formatVersion: 1, buildId: B, placeId: 'us-4054200', tiles: t, lock: l }));
  ok('a frame with its lock v3 (tiles = sha256(build + sorted ids)) is taken', put(frameKey(B, 'us-4054200'), frame(lockV3('us-4054200', B, tiles))).ok);
  ok('a frame whose lock.tiles is not its tile ids\' hash is refused', !verifyObject(store, frameKey(B, 'us-4054201'), frame(lockV3('us-4054200', B, tiles)), null).ok
    && !verifyObject(store, frameKey(B, 'us-4054200'), frame(lockV3('us-4054200', B, tiles), [tiles[0]]), null).ok
    && !verifyObject(store, frameKey(B, 'us-4054200'), frame({ ...lockV3('us-4054200', B, tiles), formatVersion: 2 }), null).ok);
  // far
  const farRaw = Buffer.concat([Buffer.from('SFB1'), Buffer.alloc(64, 7)]);
  ok('a far tile is gzip of SFB1 with its x-content-sha256', put(farKey(B, 'conus', 3, 12, 34), gzipSync(farRaw), sha(farRaw)).ok && !verifyObject(store, farKey(B, 'conus', 3, 12, 35), gzipSync(Buffer.from('HTL1xxxx')), sha('HTL1xxxx')).ok);
  // src: layers, region.json, then files.json last
  const R = '2026-10-21.0', pq = Buffer.concat([Buffer.from('PAR1'), Buffer.alloc(40, 1), Buffer.from('PAR1')]);
  const rj = Buffer.from(JSON.stringify({ grid: 'hg1', domain: 'conus', block: [362, 268], halo: 300, overture: { release: R, layers: {} } }));
  const files = { 'overture-buildings-building.parquet': { sha256: sha(pq), bytes: pq.length }, 'region.json': { sha256: sha(rj), bytes: rj.length } };
  const fj = Buffer.from(JSON.stringify({ format: 'hometown-region-files', files }));
  const early = verifyObject(store, srcKey(R, 'conus', 362, 268, 'files.json'), fj, null);
  ok('a staged region\'s files.json before its files is refused (it goes last)', !early.ok && early.status === 409);
  ok('a layer must be parquet with its hash; region.json must be this region\'s', put(srcKey(R, 'conus', 362, 268, 'overture-buildings-building.parquet'), pq, sha(pq)).ok
    && !verifyObject(store, srcKey(R, 'conus', 362, 268, 'overture-places-place.parquet'), Buffer.from('not parquet at all'), sha('not parquet at all')).ok
    && !verifyObject(store, srcKey(R, 'conus', 362, 269, 'region.json'), rj, sha(rj)).ok && put(srcKey(R, 'conus', 362, 268, 'region.json'), rj, sha(rj)).ok);
  ok('then files.json is taken', put(srcKey(R, 'conus', 362, 268, 'files.json'), fj).ok);
  // dem
  ok('a DEM piece needs its hash; its meta.json names its own etag', put('dem/13/n36w097/abc123-4567/7.bin', Buffer.alloc(100, 3), sha(Buffer.alloc(100, 3))).ok
    && put('dem/13/n36w097/abc123-4567/meta.json', Buffer.from(JSON.stringify({ etag: 'abc123-4567' }))).ok && !verifyObject(store, 'dem/13/n36w097/zzz999-0000/meta.json', Buffer.from(JSON.stringify({ etag: 'abc123-4567' })), null).ok);
  // bundles
  const lv2 = { ...lockV3('us-4054200', B, tiles), formatVersion: 2 as const, tiles: T64 };
  const geo = Buffer.from(JSON.stringify({ format: 'hometown-bundle', formatVersion: 1, GEO: {}, PLACE_DATA: {}, PKG: { lock: lv2 } })), lk = Buffer.from(JSON.stringify(lv2));
  const bk = (f: string) => bundleKey(B, 'us-4054200', T64, 'full', f);
  ok('a bundle file needs its hash; its lock must be this bundle\'s (place, build, tiles)', put(bk('geodata.json'), geo, sha(geo)).ok && !verifyObject(store, bundleKey(B, 'us-4054200', 'b'.repeat(64), 'full', 'lock.json'), lk, sha(lk)).ok && put(bk('lock.json'), lk, sha(lk)).ok);
  ok('citypackage.json is never uploaded (this server writes it)', verifyObject(store, bk('citypackage.json'), Buffer.from('{}'), sha('{}')).ok === false);
  const bj = (f: Record<string, unknown>) => Buffer.from(JSON.stringify({ format: 'hometown-bundle-files', buildId: B, placeId: 'us-4054200', tilesId: T64, variant: 'full', files: f }));
  const tr = Buffer.from('terrain');
  const listed = { 'geodata.json': { sha256: sha(geo), bytes: geo.length }, 'lock.json': { sha256: sha(lk), bytes: lk.length }, 'data/terrain.bin.gz': { sha256: sha(tr), bytes: tr.length } };
  ok('bundle.json goes last: refused while a listed file is missing', !verifyObject(store, bk('bundle.json'), bj(listed), null).ok);
  put(bk('data/terrain.bin.gz'), tr, sha(tr));
  ok('then taken', put(bk('bundle.json'), bj(listed)).ok);
  // GC: src LRU under its cap, bundles/frames/far with their build, dem never
  const plan = planGc({ entries: store.list(), current: [], pins: new Set(), pinsOk: true, now: Date.now(), srcCapBytes: 0 });
  ok('the GC collects src least recently used under HOMETOWN_SRC_CAP_GB, and a build\'s bundles, frames and far tiles with it; never dem',
    plan.delete.keys.some((k) => k.startsWith('src/')) && plan.delete.keys.some((k) => k.startsWith('bundles/')) && plan.delete.keys.some((k) => k.startsWith('frames/')) && plan.delete.keys.some((k) => k.startsWith('far/'))
    && !plan.delete.keys.some((k) => k.startsWith('dem/')) && plan.src?.collect === 1);
  const pinned = planGc({ entries: store.list(), current: [], pins: new Set([B]), pinsOk: true, now: Date.now(), srcCapBytes: 10 * GB });
  ok('a pinned build keeps its bundles and frames; src under its cap stays', pinned.delete.keys.length === 0);
}

// --------------------------------------------------------------------------------------- G3: the queue, fake clock
function g3(ok: Ok, dir: string) {
  let t = 1_000_000;
  const q = new BuildQueue({ file: path.join(dir, 'q3.db'), now: () => t });
  const W = (id: string, free = 4, total = 4) => ({ worker: id, build: B, freeSlots: free, totalSlots: total });
  q.enqueue({ key: 'ctx:x', kind: 'ctx', build: B, prio: 0, args: { ctx: 'hg1-conus/4/1/1' }, place: 'us-1' });
  const k1 = q.enqueue({ key: 'tiles:x:b1', kind: 'tiles', build: B, prio: 1, ring: 3, args: { block: 'hg1-conus/2/4/4', mask: 0b0011 }, deps: ['ctx:x'], place: 'us-1' });
  const k2 = q.enqueue({ key: 'tiles:x:b1', kind: 'tiles', build: B, prio: 0, ring: 1, args: { block: 'hg1-conus/2/4/4', mask: 0b0110 }, deps: ['ctx:x'], place: 'us-2' });
  const tj = q.get(k1[0])!;
  ok('enqueue is idempotent and ORs a block\'s mask while queued (one job, both towns, the better priority)', k1[0] === k2[0] && Number(tj.args.mask) === 0b0111 && tj.prio === 0 && tj.ring === 1
    && (q.db.prepare('SELECT COUNT(*) n FROM wants WHERE job = ?').get(k1[0]) as { n: number }).n === 2);
  q.enqueue({ key: 'ctx:x', kind: 'ctx', build: B, prio: 0, args: {}, place: 'us-2' });
  ok('a second enqueue of the same key adds no job', (q.db.prepare('SELECT COUNT(*) n FROM jobs').get() as { n: number }).n === 2);
  const c1 = q.claim(W('w1'));
  ok('claim takes the job whose deps are done first (ctx before its tiles)', c1?.key === 'ctx:x');
  ok('nothing else is claimable while the tiles wait on the ctx', q.claim(W('w2')) === null);
  ok('a heartbeat with the wrong lease is refused (410)', !q.heartbeat('ctx:x', 'nope') && q.heartbeat('ctx:x', c1!.leaseId));
  const miss = q.complete('ctx:x', c1!.leaseId, { ms: 5000 }, () => ['ctx/missing']);
  ok('done means stored: a done whose outputs are missing is refused and re-queued with backoff', !miss.ok && q.get('ctx:x')!.state === 'queued' && q.get('ctx:x')!.notBefore === t + BACKOFF_MS);
  t += BACKOFF_MS;
  const c2 = q.claim(W('w1'))!;
  ok('after the backoff it is claimable again (attempt 2)', c2.key === 'ctx:x' && c2.attempts === 2);
  ok('complete with its outputs stored: done, and its cost recorded', q.complete('ctx:x', c2.leaseId, { ms: 4000 }, () => []).ok && q.get('ctx:x')!.state === 'done' && q.costOf('ctx', 0) === 4000);
  // a leased block: a new ask with other bits makes a new job for just those bits
  const c3 = q.claim(W('w1'))!;
  const k3 = q.enqueue({ key: 'tiles:x:b1', kind: 'tiles', build: B, prio: 1, args: { block: 'hg1-conus/2/4/4', mask: 0b1100 }, place: 'us-3' });
  ok('a leased block\'s new bits become their own job; the bits it covers join it', c3.key === k1[0] && k3.length === 2 && k3.includes(k1[0]) && Number(q.get(k3.find((k) => k !== k1[0])!)!.args.mask) === 0b1000);
  // exit 3: a regions dep, no attempt charged
  const f3 = q.fail(c3.key, c3.leaseId, { code: 3, regions: { key: 'regions:r:hg1-conus:1,1', args: { regions: ['conus/1/1'], release: 'r', spec: 'conus:1,1' } } });
  const after = q.get(c3.key)!;
  ok('exit 3 naming regions: a regions job (weight 2, any build) becomes a dep; no attempt charged', f3.ok && after.state === 'queued' && after.deps.includes('regions:r:hg1-conus:1,1') && after.attempts === 0
    && q.get('regions:r:hg1-conus:1,1')!.weight === 2 && q.get('regions:r:hg1-conus:1,1')!.build === '*');
  // the reaper: an expired lease goes back with backoff; after MAX_ATTEMPTS failed, and its dependents with it
  q.close();
  const q3 = new BuildQueue({ file: path.join(dir, 'q3r.db'), now: () => t });
  q3.enqueue({ key: 'frame:x', kind: 'frame', build: B, prio: 0, args: {}, place: 'us-1' });
  q3.enqueue({ key: 'bundle:x', kind: 'bundle', build: B, prio: 2, args: {}, deps: ['frame:x'], place: 'us-1' });
  let lastAttempt = 0;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const c = q3.claim(W('w9', 1, 1));
    if (c?.key !== 'frame:x') { ok('(the reaper loop claims the frame)', false, String(c?.key)); break; }
    lastAttempt = c.attempts;
    t += LEASE_MS + 1; q3.reap(); t += BACKOFF_MS * 2 ** i + 1;
  }
  ok(`an expired lease is reaped; after ${MAX_ATTEMPTS} attempts the job fails and its dependents fail with it`, lastAttempt === MAX_ATTEMPTS && q3.get('frame:x')!.state === 'failed' && q3.get('bundle:x')!.state === 'failed');
  // priorities: the last free slot claims P0 only; P5 only when nothing interactive is claimable
  const q2 = new BuildQueue({ file: path.join(dir, 'q3b.db'), now: () => t });
  q2.enqueue({ key: 'p5', kind: 'tiles', build: B, prio: 5, args: { block: 'hg1-conus/2/9/9', mask: 1 } });
  q2.enqueue({ key: 'p1', kind: 'ctx', build: B, prio: 1, args: {} });
  ok('the last free slot of a 4-slot worker claims P0 only', q2.claim(W('a', 1, 4)) === null);
  ok('a P1 job comes before a P5 one', q2.claim(W('a', 4, 4))?.key === 'p1');
  ok('P5 runs once nothing interactive is waiting', q2.claim(W('a', 3, 4))?.key?.startsWith('p5') === true);
  q2.enqueue({ key: 'other', kind: 'ctx', build: 'htc-0.6.0-hg1-b00000000', prio: 0, args: {} });
  ok('a worker claims only its own build\'s jobs', q2.claim(W('a', 2, 4)) === null);
  ok('live workers and slots are counted from claims', q2.liveSlots() === 4 && q2.liveWorkers()[0].build === B);
  q3.close(); q2.close();
  // (review fixes) a failed tile job asked again, exit 3 on done/failed regions, blocked rows, leases over a restart
  const q4 = new BuildQueue({ file: ':memory:', now: () => t });
  // (one tile: a job of several tiles is split instead of failing, the robustness checks below)
  const blk = { key: `tiles:${B}:hg1-conus/2/1/1`, kind: 'tiles' as const, build: B, prio: 0, args: { block: 'hg1-conus/2/1/1', mask: 1 }, place: 'us-9' };
  const [tk] = q4.enqueue(blk);
  for (let i = 0; i < MAX_ATTEMPTS; i++) { t += 600_000; const c = q4.claim(W('w', 2, 2))!; q4.fail(c.key, c.leaseId, { code: 1 }); }
  t += 600_000;
  let again: string[] = [];
  try { again = q4.enqueue(blk); } catch { /* the old UNIQUE crash */ }
  ok('a failed tile job asked again is queued afresh (no duplicate-key crash)', again[0] === tk && q4.get(tk)!.state === 'queued' && q4.get(tk)!.attempts === 0);
  q4.enqueue({ key: 'ctx:q4', kind: 'ctx', build: B, prio: 0, args: {}, place: 'us-9' });
  const rg = { key: 'regions:q4', args: {} };
  let d1 = q4.claim(W("w", 2, 2))!; while (d1.key !== "ctx:q4") { q4.complete(d1.key, d1.leaseId, {}, () => []); d1 = q4.claim(W("w", 2, 2))!; }
  q4.fail(d1.key, d1.leaseId, { code: 3, regions: rg });
  const r1 = q4.claim(W('w', 2, 2))!; q4.complete(r1.key, r1.leaseId, {}, () => []);
  const d2 = q4.claim(W("w", 2, 2))!;
  q4.fail(d2.key, d2.leaseId, { code: 3, regions: rg });
  ok('exit 3 on regions already done: the regions job runs again and the job is charged (no free hot loop)', q4.get('regions:q4')!.state === 'queued' && q4.get('ctx:q4')!.attempts === 1 && q4.get('ctx:q4')!.notBefore > t);
  q4.enqueue({ key: 'gate', kind: 'far', build: B, prio: 0, args: {} });
  for (let i = 0; i < 600; i++) q4.enqueue({ key: `blocked${i}`, kind: 'far', build: B, prio: 0, args: {}, deps: ['nope'] });
  t += 1; q4.enqueue({ key: 'later', kind: 'far', build: B, prio: 1, args: {} });
  const seen = new Set<string>(); for (let i = 0; i < 4; i++) { const x = q4.claim(W('z' + i, 2, 2)); if (x) seen.add(x.key); }
  ok('600 dependency-blocked rows ahead do not hide a ready job further down', seen.has('later'));
  const lease = q4.get('later')!.leaseUntil!;
  t += LEASE_MS + 30_000; q4.graceLeases(); q4.reap();
  ok('a server restart gives running leases a fresh LEASE_MS (a long web deploy does not requeue them)', q4.get('later')!.state === 'leased' && q4.get('later')!.leaseUntil! > lease);
  q4.close();
}

// ------------------------------------------------------------------------- G4-G6: towns, the worker protocol, access
function fakeDeps(dir: string, name: string, env: Record<string, string>, t: { now: number }): BuilderDeps {
  const cfg = hometownConfig({ HOMETOWN_DIR: path.join(dir, name), HOMETOWN_DATA_DIR: path.join(dir, name, 'data'), HOMETOWN_WORKER_TOKEN: W_TOKEN, HOMETOWN_ADMIN_TOKEN: A_TOKEN, HOMETOWN_BUILD: B, HOMETOWN_FREE_FLOOR_GB: '0', ...env });
  const store = new TileStore({ root: cfg.root, capBytes: GB, minFreeBytes: 0, freeBytes: () => 100 * GB, log: () => {} });
  return { cfg, store, queue: new BuildQueue({ file: path.join(cfg.root, 'queue.db'), now: () => t.now }), now: () => t.now };
}
async function g4to6(ok: Ok, dir: string) {
  const t = { now: Date.now() };
  // (the address limit is what these picks test, not the admission wait: with no live slot the wait counts one, and a town's
  // every ctx block is a job of its own now)
  const d = fakeDeps(dir, 'g4', { HOMETOWN_BUILDER: 'on', HOMETOWN_MAX_WAIT_S: '100000' }, t);
  const okemah = placeById('us-4054200')!;
  const g = townGraph('us-4054200', gazetteerOf(okemah), B, { frame: false, base: 0, now: t.now });
  const tilesJobs = g.specs.filter((s) => s.kind === 'tiles'), ctx = g.specs.filter((s) => s.kind === 'ctx');
  const bits = tilesJobs.reduce((a, s) => a + Number(s.args.mask).toString(2).replace(/0/g, '').length, 0);
  ok('a town\'s graph: every tile in exactly one L2 block job, its ctx blocks first, a full bundle', bits === g.tiles.length && g.tiles.length >= 100 && ctx.length >= 1 && g.specs.some((s) => s.kind === 'bundle' && s.args.variant === 'full'));
  ok('the blocks round the anchor are P0, the rest P1 by ring', tilesJobs.some((s) => s.prio === 0) && tilesJobs.some((s) => s.prio === 1) && tilesJobs.every((s) => (s.prio === 0) === ((s.ring ?? 0) <= 2)));
  const pw = townGraph('us-4054200', gazetteerOf(okemah), B, { frame: true, base: 5, now: t.now });
  ok('pre-warm puts every job at P5; frame mode adds the frame job', pw.specs.every((s) => s.prio === 5) && pw.specs.some((s) => s.kind === 'frame'));
  ok('the anchor tile is inside the town\'s tile range', (() => { const [c, r] = anchorTile(g.stage.domain, okemah.lon, okemah.lat); const [c0, r0, c1, r1] = g.stage.tileRange; return c >= c0 && c <= c1 && r >= r0 && r <= r1; })());
  ok('quads: a block mask splits into 2 x 2 quads that cover it exactly, never overlapping', [0xffff, 0xcccc, 0x0021, 0x8001].every((m) => { const qs = quadsOf(m); return qs.reduce((a, q) => a | q.mask, 0) === m && qs.every((q, i) => qs.every((r, k) => i === k || !(q.mask & r.mask))) && qs.every((q) => q.mask && (q.mask & ~m) === 0); }));
  ok(`blocks within ${QUAD_RING} tiles of the anchor are quad jobs (part 0-3), the rest whole blocks`, tilesJobs.some((s) => s.args.part != null) && tilesJobs.some((s) => s.args.part == null) && tilesJobs.filter((s) => s.args.part != null).every((s) => /:q[0-3]$/.test(s.key)));
  ok('a town\'s map regions are its tile range grown by the compiler\'s 3.2 km reach (Weleetka: the 6 its compiles asked for one exit 3 at a time)', (() => { const w = placeById('us-4079800')!, gw = gazetteerOf(w); return townRegions(stage1('us-4079800', { geoid: gw.geoid, anchor: gw.anchor, bbox: gw.bbox })).map((x) => x.join('/')).join(' ') === '364/536 364/537 364/538 365/536 365/537 365/538'; })());
  ok('blocks are ringed nearest first', (() => { const bl = blocksOf(g.stage, ...g.anchor); return bl.every((b, i) => i === 0 || bl[i - 1].ring <= b.ring); })());

  // admission, then status
  const a = requestTown(d, 'us-4054200', '1.2.3.4');
  ok('a new town is admitted: 202, its phase asked, its waits estimated', a.status === 202 && (a.body as { phase: string }).phase === 'asked' && typeof (a.body as { etaDriveS: number }).etaDriveS === 'number', JSON.stringify(a.body).slice(0, 200));
  const again = requestTown(d, 'us-4054200', '9.9.9.9');
  ok('a second player asking for the same town joins it (no new limit spent, no new jobs)', again.status === 202 && (d.queue.db.prepare("SELECT asks FROM towns WHERE place = 'us-4054200'").get() as { asks: number }).asks === 2);
  ok('GET status answers the same shape and never starts anything', townStatus(d, 'us-4054200').status === 202 && townStatus(d, 'us-4054201').status === 404);
  for (const id of ['us-4055000', 'us-4075000']) requestTown(d, id, '5.5.5.5');
  const third = requestTown(d, 'us-0455000', '5.5.5.5');
  const four = requestTown(d, 'us-4261000', '5.5.5.5');
  ok('per address, HOMETOWN_PER_IP_HOUR new towns (3), then 429', third.status === 202 && four.status === 429, `${third.status} ${four.status} ${JSON.stringify(third.body).slice(0, 200)}`);
  // busy: the wait over HOMETOWN_MAX_WAIT_S refuses with the minutes and the nearest built towns
  d.queue.db.prepare("INSERT INTO towns (place, build, box, state, first_asked, tiles_total, tiles_done, asks, source, meta) VALUES ('us-4075000x', ?, '[]', 'full', 0, 1, 1, 1, 'player', '{}')").run(B);
  d.queue.db.prepare("UPDATE towns SET state = 'full' WHERE place = 'us-4055000'").run();
  const busy = fakeDeps(dir, 'g4', { HOMETOWN_BUILDER: 'on', HOMETOWN_MAX_WAIT_S: '1' }, t);
  busy.queue.close(); busy.queue = d.queue;
  const b = requestTown(busy, 'us-4807000', '7.7.7.7');
  const nb = (b.body as { nearby?: { placeId: string }[]; error: string; waitMin?: number });
  ok('over HOMETOWN_MAX_WAIT_S: 503 busy, the minutes in words, and the nearest built towns', b.status === 503 && /about \d+ minute/.test(nb.error) && (nb.nearby ?? []).some((n) => n.placeId === 'us-4055000'), JSON.stringify(b.body).slice(0, 300));
  ok('the busy words and the phase words never name a tool or vendor', !FORBIDDEN.test(BUSY_WORDS(14)) && Object.values(PHASE_WORDS).every((w) => !FORBIDDEN.test(w)));

  // (a pinned build on an empty store: the picks queued their towns' regions jobs, bound to the build with no release yet
  // (the dispatch check follows one to its claim, the release filled from the run's build record); here they count as
  // staged, so the protocol below starts at a ctx as before)
  ok('a pinned build on an empty store queues each town\'s regions jobs at the pick (bound to the build, no release yet)',
    d.queue.jobsOf('us-4054200').some((j) => j.kind === 'regions' && j.build === B && j.args.release == null && j.key.startsWith(`regions:@${B}:`)));
  ok('...a regions job with no release is never taken as done (nothing it fetched can be checked)', (() => { const r = d.queue.jobsOf('us-4054200').find((j) => j.kind === 'regions')!; return promisedOutputs(d.store, r, []).length === 1; })());
  d.queue.db.prepare("UPDATE jobs SET state = 'done' WHERE kind = 'regions'").run();

  // ---- the worker protocol
  const call = (method: string, p: string, body?: unknown, token = W_TOKEN, extra: Record<string, string> = {}) =>
    workerResponse(new Request(`http://web/api/hometown/worker/${p}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...extra }, body: body === undefined ? undefined : body instanceof Buffer ? new Uint8Array(body) : JSON.stringify(body) }), p.split('/'), d, { pollMs: 50 });
  const off = fakeDeps(dir, 'g4off', {}, t);
  ok('HOMETOWN_BUILDER=off: every worker address is 404', (await workerResponse(new Request('http://web/x', { method: 'POST', headers: { authorization: `Bearer ${W_TOKEN}` } }), ['claim'], off)).status === 404);
  off.queue.close();
  ok('a wrong token is 401', (await call('POST', 'claim', {}, 'x'.repeat(40))).status === 401);
  const cl = await call('POST', 'claim', { worker: 'w1', build: B, freeSlots: 4, totalSlots: 4 });
  const job = await cl.json() as { key: string; kind: string; leaseId: string; args: Record<string, unknown>; inputs: string[] };
  ok('claim hands out the ctx first, with its lease and heartbeat period', cl.status === 200 && job.kind === 'ctx' && /^[0-9a-f]{24}$/.test(job.leaseId));
  ok('a heartbeat holds the lease; a stale one is 410', (await call('POST', 'heartbeat', { key: job.key, leaseId: job.leaseId })).status === 200 && (await call('POST', 'heartbeat', { key: job.key, leaseId: 'stale' })).status === 410);
  const nodone = await call('POST', 'complete', { key: job.key, leaseId: job.leaseId, outputs: [], ms: 100 });
  ok('complete before the ctx is uploaded is refused (409): done means stored', nodone.status === 409);
  t.now += BACKOFF_MS + 1;
  const cl2 = await (await call('POST', 'claim', { worker: 'w1', build: B, freeSlots: 4, totalSlots: 4 })).json() as typeof job;
  const [, , C, R] = String(cl2.args.ctx).split('/');
  const ctxRaw = Buffer.concat([Buffer.from('HTC1'), Buffer.alloc(32, 1)]);
  const up = await call('PUT', `objects/${ctxKey(B, 'conus', Number(C), Number(R))}`, gzipSync(ctxRaw), W_TOKEN, { 'content-type': 'application/octet-stream', 'x-content-sha256': sha(ctxRaw) });
  ok('a worker uploads through the same hash-checked PUT', up.status === 201);
  ok('then complete is 200 and the town moves on', (await call('POST', 'complete', { key: cl2.key, leaseId: cl2.leaseId, outputs: [ctxKey(B, 'conus', Number(C), Number(R))], ms: 3000 })).status === 200
    && ['framing', 'asked'].includes((d.queue.db.prepare("SELECT state FROM towns WHERE place = 'us-4054200'").get() as { state: string }).state));
  const tj = await (await call('POST', 'claim', { worker: 'w1', build: B, freeSlots: 4, totalSlots: 4 })).json() as typeof job;
  const f = await call('POST', 'fail', { key: tj.key, leaseId: tj.leaseId, code: 3, missingRegions: 'conus:362,268;362,269', reason: 'regions' });
  ok('a worker\'s exit 3 naming regions makes a regions job (needs the build record\'s Overture release)', f.status === 400);
  const rec = { format: 'hometown-build', version: 1, grid: 'hg1', compilerVersion: '0.5.0', overture: '2026-10-21.0' };
  ok('regionsJobOf keys a region set sorted, at most 4', regionsJobOf('2026-10-21.0', 'conus:362,269;362,268')?.key === 'regions:2026-10-21.0:hg1-conus:362,268;362,269');
  void rec;
  const admin = (p: string, init: RequestInit, owner = false) => builderAdminResponse(new Request(`http://web/api/hometown/admin/${p}`, init), p.split('/'), d, owner);
  ok('the owner\'s builder status needs the token or the owner\'s session', (await admin('builder', { headers: { authorization: 'Bearer nope-nope-nope-nope-nope-nope' } })).status === 401
    && (await admin('builder', {}, true)).status === 200 && (await admin('builder', { headers: { authorization: `Bearer ${A_TOKEN}` } })).status === 200);
  const st = await (await admin('builder', {}, true)).json() as { slots: number; queue: unknown[]; build: { configured: string; workersReport: string[] } };
  ok('the status shows workers, slots, the queue by priority and the build seen against HOMETOWN_BUILD', st.slots === 4 && st.queue.length > 0 && st.build.configured === B && st.build.workersReport.includes(B));
  ok('a worker token cannot use the owner\'s tools', (await admin('builder', { headers: { authorization: `Bearer ${W_TOKEN}` } })).status === 401);

  // ---- a full bundle lands: citypackage.json derived, the town full, the best variant, the story's lock
  const OK: CityPackage = JSON.parse(readFileSync('storykit/hometown/fixtures/okemah-us-4054200.citypackage.json', 'utf8'));
  const L = serviceLock(cityLock(OK));
  const BL = L.buildId;
  const dB = fakeDeps(dir, 'g4b', { HOMETOWN_BUILDER: 'on', HOMETOWN_BUILD: BL }, t);
  requestTown(dB, 'us-4054200', '1.1.1.1');
  const geo = Buffer.from(JSON.stringify({ format: 'hometown-bundle', formatVersion: 1, GEO: { roadGraph: { nodes: [], links: [], names: [] } }, PLACE_DATA: { regional: Object.fromEntries(OK.spawnPoints.map((s) => [s.id, { x: s.x, z: s.z, heading: s.heading, name: s.name ?? s.id }])) },
    PKG: { lock: L, tiles: Array.from({ length: OK.tileSet.count }, (_, i) => `t${i}`), places: Object.fromEntries(OK.places.filter((p) => p.kind !== 'arrival').map((p) => [p.id, { kind: p.kind, name: p.name, x: p.x, z: p.z, heading: p.heading }])) } }));
  const lk = Buffer.from(JSON.stringify(L));
  const k = (f: string) => bundleKey(BL, 'us-4054200', L.tiles, 'full', f);
  for (const [n, body] of [['geodata.json', geo], ['lock.json', lk]] as const) dB.store.put(k(n), body);
  dB.store.put(k('bundle.json'), Buffer.from(JSON.stringify({ format: 'hometown-bundle-files', buildId: BL, placeId: 'us-4054200', tilesId: L.tiles, variant: 'full', files: { 'geodata.json': { sha256: sha(geo) }, 'lock.json': { sha256: sha(lk) } } })));
  onBundleStored(dB, k('bundle.json'));
  ok('when bundle.json lands, this server writes the bundle\'s citypackage.json (never uploaded)', dB.store.has(k('citypackage.json')));
  const full = dB.queue.jobsOf('us-4054200').find((j) => j.kind === 'bundle')!;
  ok('promised outputs: a bundle must report its bundle.json and the full one its manifest', promisedOutputs(dB.store, full, [k('bundle.json')]).length === 1 && promisedOutputs(dB.store, full, []).length === 2);
  t.now += 90_000;
  afterJobDone(dB, full, [k('bundle.json')]);
  const ready = townStatus(dB, 'us-4054200');
  ok('the town is full: 200 ready with its lock (v2 here), the town summary and the play variant', ready.status === 200 && (ready.body as { lock: { tiles: string } }).lock.tiles === L.tiles && (ready.body as { play?: { variant: string } }).play?.variant === 'full', JSON.stringify(ready.body).slice(0, 200));
  ok('the story may pin it, and the package is read back from the store by its lock', storyReadyLock(dB, 'us-4054200')?.tiles === L.tiles && !!cityPackageFromStore(dB.store, storyLock(L)!));
  ok('a town built in full logs its wait estimate\'s error (the status page\'s ETA error)', dB.queue.recentEvents(20).some((e) => e.kind === 'eta' && typeof e.errPct === 'number'));
  ok('the engine\'s poll answers the best variant and its URL, with state full / full: true (growing.js fullReady)', bestVariant(dB, 'us-4054200', BL)?.url === `/towns/us-4054200/${BL}/${L.tiles}/full/` && bestVariant(dB, 'us-4054200', BL)?.state === 'full' && bestVariant(dB, 'us-4054200', BL)?.full === true);

  // ---- compiler 0.8.0: a capped town's frame pins its downtown-centred box; the town is re-tiled to the frame
  {
    const dR = fakeDeps(dir, 'g4r', { HOMETOWN_BUILDER: 'on', HOMETOWN_FRAME: 'on' }, t);
    const pid = 'us-4261000', pit = placeById(pid)!, gz = gazetteerOf(pit);
    ok('the compiler\'s places entry carries the search\'s whole square (searchBbox) beside the capped play box', JSON.stringify(gz.searchBbox) === JSON.stringify(pit.bbox) && gz.bbox[2] - gz.bbox[0] < pit.bbox[2] - pit.bbox[0]);
    requestTown(dR, pid, '4.4.4.4');
    const q = dR.queue, row0 = q.db.prepare('SELECT meta, tiles_total FROM towns WHERE place = ?').get(pid) as { meta: string; tiles_total: number };
    const before: string[] = JSON.parse(row0.meta).tiles;
    // (the frame: the same size of box moved 4 tiles east and 3 north, as downtown_box moves Pittsburgh's onto the Triangle)
    const moved = before.map((id) => { const [g, L, c, r] = id.split('/'); return `${g}/${L}/${Number(c) - 4}/${Number(r) + 3}`; });
    const [mc, mr] = moved[Math.floor(moved.length / 2)].split('/').slice(2).map(Number);
    const fr = { format: 'hometown-frame', formatVersion: 1, buildId: B, placeId: pid, tiles: moved, lock: lockV3(pid, B, moved),
      spawn: { tile: [mc, mr], x: 0, z: 0, heading: 0 }, spawnDistrict: [mc - 2, mr - 2, mc + 2, mr + 2], variant: `district-${mc}-${mr}`,
      spawns: [{ id: 'pkg_downtown', name: 'Downtown', x: 0, z: 0, heading: 0, inDistrict: true }], places: {} };
    dR.store.put(frameKey(B, pid), Buffer.from(JSON.stringify(fr)));
    const fj = q.jobsOf(pid).find((j) => j.kind === 'frame')!;
    q.db.prepare("UPDATE jobs SET state = 'done' WHERE key = ?").run(fj.key);
    afterJobDone(dR, fj, []);
    const row = q.db.prepare('SELECT meta, tiles_total, state FROM towns WHERE place = ?').get(pid) as { meta: string; tiles_total: number; state: string };
    const m = JSON.parse(row.meta), want = new Set(moved);
    const tj = q.jobsOf(pid).filter((j) => j.kind === 'tiles');
    const built = new Set(tj.flatMap((j) => maskBits(Number(j.args.mask)).map((i) => { const [, , C, R] = String(j.args.block).split('/').map(Number); return `hg1-conus/0/${C * 4 + (i & 3)}/${R * 4 + (i >> 2)}`; })));
    ok('re-tiled: the town\'s tile set is the frame\'s, and its count', JSON.stringify(m.tiles) === JSON.stringify(moved) && row.tiles_total === moved.length && row.state === 'district');
    ok('every frame tile is built by a job the town wants; no job it wants builds none of them', moved.every((id) => built.has(id)) && tj.every((j) => maskBits(Number(j.args.mask)).some((i) => { const [, , C, R] = String(j.args.block).split('/').map(Number); return want.has(`hg1-conus/0/${C * 4 + (i & 3)}/${R * 4 + (i >> 2)}`); })));
    const full = q.jobsOf(pid).find((j) => j.kind === 'bundle' && j.args.variant === 'full')!, dist = q.jobsOf(pid).find((j) => j.kind === 'bundle' && j.args.variant !== 'full');
    ok('the full bundle waits on the new tile jobs and on no dropped one; the district bundle on the district\'s', full.deps.every((k) => !!q.get(k)) && tj.every((j) => full.deps.includes(j.key)) && Number(full.args.tiles) === moved.length
      && !!dist && dist.deps.every((k) => !!q.get(k)) && String(dist.args.variant) === fr.variant);
    // (and the town's regions: an empty store's pick queues them first, 14 Nov)
    ok('the new ctx blocks are enqueued before their tiles', tj.every((j) => j.deps.every((k) => ['ctx', 'regions'].includes(String(q.get(k)?.kind))) && j.deps.some((k) => q.get(k)?.kind === 'ctx')) && q.recentEvents(50).some((e) => e.kind === 'retile'));
    ok('once the frame is in, the full bundle keeps the spawn district (args.keep): it never lays a district tile flat', JSON.stringify(full.args.keep) === JSON.stringify(fr.spawnDistrict));
    dR.queue.close();
  }
  // ---- a spawn district tile failed before the frame said where the district is: the full bundle had already gone on
  // without it (flat ground); when the frame lands the town fails AND that full bundle fails with it, so it is never
  // assembled and served as ready (Beverly Beach, FL); a full bundle that did lay the district flat never makes it full
  {
    const dK = fakeDeps(dir, 'g4k', { HOMETOWN_BUILDER: 'on', HOMETOWN_FRAME: 'on', HOMETOWN_MAX_WAIT_S: '1000000' }, t);
    const pid = 'us-4054200';
    requestTown(dK, pid, '5.5.5.5');
    const q = dK.queue, tiles: string[] = JSON.parse((q.db.prepare('SELECT meta FROM towns WHERE place = ?').get(pid) as { meta: string }).meta).tiles;
    const [mc, mr] = tiles[Math.floor(tiles.length / 2)].split('/').slice(2).map(Number), dead = `hg1-conus/0/${mc}/${mr}`;
    const tjob = q.jobsOf(pid).find((j) => j.kind === 'tiles' && tilesOfJobIds(j).includes(dead))!;
    const fb0 = q.jobsOf(pid).find((j) => j.kind === 'bundle' && j.args.variant === 'full')!;
    q.db.prepare("UPDATE jobs SET state = 'failed', attempts = 3, error = 'compile crashed' WHERE key = ?").run(tjob.key);
    q.db.prepare('UPDATE jobs SET args = ? WHERE key = ?').run(JSON.stringify({ ...fb0.args, absent: [dead] }), fb0.key);
    const fr = { format: 'hometown-frame', formatVersion: 1, buildId: B, placeId: pid, tiles, lock: lockV3(pid, B, tiles),
      spawn: { tile: [mc, mr], x: 0, z: 0, heading: 0 }, spawnDistrict: [mc - 2, mr - 2, mc + 2, mr + 2], variant: `district-${mc}-${mr}`,
      spawns: [{ id: 'pkg_downtown', name: 'Downtown', x: 0, z: 0, heading: 0, inDistrict: true }], places: {} };
    dK.store.put(frameKey(B, pid), Buffer.from(JSON.stringify(fr)));
    const fj = q.jobsOf(pid).find((j) => j.kind === 'frame')!;
    q.db.prepare("UPDATE jobs SET state = 'done' WHERE key = ?").run(fj.key);
    afterJobDone(dK, fj, []);
    const fb = q.get(fb0.key)!;
    ok('the frame lands after a district tile failed: the town fails and its degraded full bundle fails too (never assembled with a flat downtown)',
      townStatus(dK, pid).status === 409 && fb.state === 'failed' && /spawn district/.test(fb.error ?? ''), JSON.stringify([fb.state, fb.error]));
    // (the last guard: a full bundle reported done with a district tile laid flat does not make the town full)
    q.db.prepare("UPDATE towns SET state = 'growing' WHERE place = ?").run(pid);
    afterJobDone(dK, { ...fb, state: 'done', args: { ...fb.args, absent: [dead] } }, [bundleKey(B, pid, 'a'.repeat(64), 'full', 'bundle.json')]);
    const st = q.db.prepare('SELECT state FROM towns WHERE place = ?').get(pid) as { state: string };
    ok('...and a full bundle that laid the district flat leaves the town failed, not full', st.state === 'failed', st.state);
    // (a district tile the compile refused, no DEM under it (out at sea), is flat ground by design: the town is full)
    q.db.prepare("UPDATE towns SET state = 'growing', meta = json_set(meta, '$.refused', json(?)) WHERE place = ?").run(JSON.stringify([dead]), pid);
    afterJobDone(dK, { ...fb, state: 'done', args: { ...fb.args, absent: [dead] } }, [bundleKey(B, pid, 'a'.repeat(64), 'full', 'bundle.json')]);
    const st2 = q.db.prepare('SELECT state FROM towns WHERE place = ?').get(pid) as { state: string };
    ok('...but a district tile refused for want of a DEM (out at sea) is flat ground by design: the town is full', st2.state === 'full', st2.state);
    dK.queue.close();
  }

  // ---- G6: who may use the towns
  const req = new Request('http://web/api/towns');
  ok('HOMETOWN_BUILDER=owner: only the owner\'s session; on: everyone; off: the old switch', townsAccess(req, { HOMETOWN_BUILDER: 'owner' }, () => true) === 'builder' && townsAccess(req, { HOMETOWN_BUILDER: 'owner' }, () => false) === null
    && townsAccess(req, { HOMETOWN_BUILDER: 'on' }, () => false) === 'builder' && townsAccess(req, {}, () => true) === (process.env.HOMETOWN_TOWNS === 'on' ? 'legacy' : null));
  ok('the Create town box follows the runtime probe, not the build-time switch', townBoxEnabled(req, { HOMETOWN_BUILDER: 'owner' }, () => true) && !townBoxEnabled(req, { HOMETOWN_BUILDER: 'owner' }, () => false));
  d.queue.close(); dB.queue.close();
}

// ------------------------------------------------------------------------------------ G7: lock v3, the frame, the gate
function g7(ok: Ok) {
  const OK: CityPackage = JSON.parse(readFileSync('storykit/hometown/fixtures/okemah-us-4054200.citypackage.json', 'utf8'));
  const okemah = placeById('us-4054200') as Place;
  const s = stage1('us-4054200', { geoid: okemah.geoid, anchor: [okemah.lon, okemah.lat], bbox: playBox(okemah) });
  const build = OK.buildId!;
  const L = lockV3('us-4054200', build, s.tiles, { domain: 'conus', origin: { c0: s.origin.c0, r0: s.origin.r0 }, k0: s.k0, gamma0: s.gamma0, yOffset: OK.yOffset!, waterLevel: OK.waterLevel! });
  const near = new Set(OK.places.slice(0, Math.ceil(OK.places.length / 2)).map((p) => p.id).concat(['pkg_downtown']));
  const frame: TownFrame = {
    format: 'hometown-frame', formatVersion: 1, buildId: build, placeId: 'us-4054200', tiles: s.tiles, lock: L,
    spawn: { tile: [s.origin.c0, s.origin.r0], x: 0, z: 0, heading: 0 }, spawnDistrict: [s.origin.c0 - 2, s.origin.r0 - 2, s.origin.c0 + 2, s.origin.r0 + 2],
    spawns: OK.spawnPoints.map((p) => ({ id: p.id, name: p.name ?? p.id, x: p.x, z: p.z, heading: p.heading, inDistrict: near.has(p.id) })),
    places: Object.fromEntries(OK.places.filter((p) => p.kind !== 'arrival').map((p) => [p.id, { kind: p.kind, name: p.name, x: p.x, z: p.z, heading: p.heading, inDistrict: near.has(p.id) }])),
    roads: OK.roadsSummary,
  };
  ok('a frame with lock v3 reads (tiles = sha256(build + sorted ids))', frameProblems(frame).length === 0, frameProblems(frame).join('; '));
  // the compiler's own frame shape (MogCity frame.py 0.7.0: version, district {...}, spawns and places keyed by name, streets)
  const raw = { format: 'hometown-frame', version: 1, buildId: build, placeId: 'us-4054200', tiles: s.tiles, lock: L, spawnKey: 'downtown',
    spawn: { x: 1, z: 2, heading: 0.5, name: 'Downtown', district: true },
    spawns: { downtown: { x: 1, z: 2, heading: 0.5, name: 'Downtown', district: true }, east: { x: 900, z: 2, heading: 0, name: 'East' } },
    places: { bank: { kind: 'bank', name: 'the bank', x: 3, z: 4, heading: 0, district: true }, bar: { kind: 'bar', name: 'the bar', x: 800, z: 4 } },
    district: { tile: [s.origin.c0, s.origin.r0], tileRange: [s.origin.c0 - 2, s.origin.r0 - 2, s.origin.c0 + 2, s.origin.r0 + 2], variant: `district-${s.origin.c0}-${s.origin.r0}` },
    streets: [{ name: 'MAIN ST', m: 1500 }, { name: 'ELM ST', m: 700 }] };
  const nf = normalizeFrame(raw)!;
  ok('the compiler\'s frame shape normalises: spawn tile and district from district {}, spawns/places with inDistrict, roads from streets', !!(frameProblems(nf).length === 0 && nf.spawn.tile[0] === s.origin.c0 && nf.spawnDistrict[0] === s.origin.c0 - 2 && nf.spawns[0].id === 'pkg_downtown' && nf.spawns[0].inDistrict && !nf.spawns[1].inDistrict && nf.places.bank.inDistrict && !nf.places.bar.inDistrict && nf.roads!.streets === 2 && nf.roads!.km === 2.2 && nf.variant === raw.district.variant && normalizeFrame(frame) === frame), frameProblems(nf).join('; '));
  ok('a frame whose lock is not its tiles\' is refused', frameProblems({ ...frame, tiles: s.tiles.slice(1) }).length > 0);
  const pkg = cityPackageOfFrame(frame, { placeId: 'us-4054200', name: okemah.name, stateName: okemah.stateName });
  ok('cityPackageOfFrame: a valid CityPackage whose lock is v3, pinning the frame', packageProblems(pkg).length === 0 && cityLock(pkg).formatVersion === 3 && cityLock(pkg).tiles === L.tiles && cityLock(pkg).yOffset === L.yOffset, packageProblems(pkg).slice(0, 3).join('; '));
  // the compiler's Python title case ("N 3Rd St") as the game shows it ("N 3rd St"): the arrivals, the places, the roads
  const miscased = { ...frame, spawns: frame.spawns.map((p, i) => (i === 1 ? { ...p, name: 'N 3Rd St' } : p)),
    places: { ...frame.places, diner_x: { kind: 'diner', name: 'the diner on S 14Th St', x: 1, z: 2, heading: 0, inDistrict: false } }, roads: { streets: 3, km: 2, main: ['N 3RD ST', 'MCCORD ST', "ST JOHN'S RD"] } };
  const mp = cityPackageOfFrame(miscased, { placeId: 'us-4054200', name: okemah.name, stateName: okemah.stateName });
  const NAMES: [string, string][] = [['N 3Rd St', 'N 3rd St'], ['S 14Th St', 'S 14th St'], ['the diner on N 1St St', 'the diner on N 1st St'], ['Mccord St', 'McCord St'], ["St John'S Rd", "St John's Rd"], ["O'Connor St", "O'Connor St"], ['Us Hwy 62', 'US Hwy 62'], ['Ne 23Rd St', 'NE 23rd St'], ['Okemah High School', 'Okemah High School'], ['Downtown', 'Downtown']];
  const STREETS: [string, string][] = [['N 3RD ST', 'N 3rd St'], ['MCCORD ST', 'McCord St'], ["O'CONNOR ST", "O'Connor St"], ["VIETNAM VETERAN'S MEMORIAL HWY", "Vietnam Veteran's Memorial Hwy"], ['US HWY 62', 'US Hwy 62'], ['E1080 RD', 'E1080 Rd']];
  ok('street names as the game shows them: "N 3rd St", not the compiler\'s "N 3Rd St" (arrivals, places, roads; lib/hometown/names.ts)',
    NAMES.every(([a, b]) => nameCase(a) === b) && STREETS.every(([a, b]) => titleStreet(a) === b) && mp.spawnPoints[1].name === 'N 3rd St' && mp.places.some((p) => p.id === frame.spawns[1].id && p.name === 'N 3rd St')
      && mp.places.find((p) => p.id === 'diner_x')?.name === 'the diner on S 14th St' && mp.roadsSummary.main.join('|') === "N 3rd St|McCord St|St John's Rd",
    [...NAMES.filter(([a, b]) => nameCase(a) !== b).map(([a]) => `${a} -> ${nameCase(a)}`), ...STREETS.filter(([a, b]) => titleStreet(a) !== b).map(([a]) => `${a} -> ${titleStreet(a)}`), mp.roadsSummary.main.join('|')].join('; '));
  ok('storyLock / serviceLock carry v3 both ways; v2 still accepted', storyLock(L)?.formatVersion === 3 && serviceLock(storyLock(L)!).formatVersion === 3 && sameServiceLock(serviceLock(storyLock(L)!), L)
    && storyLock({ ...L, formatVersion: 2 })?.formatVersion === 2 && storyLock({ ...L, formatVersion: 4 }) === null);
  // the gate: the fixture story through a frame package; mission 1 inside the district passes, outside fails
  const reply = JSON.parse(readFileSync('storykit/hometown/fixtures/okemah-us-4054200.reply.json', 'utf8'));
  const pack = JSON.parse(JSON.stringify(reply.pack));
  pack.base = hometownBase(pkg);
  const allIn = { ...pkg, places: pkg.places.map((p) => ({ ...p, inDistrict: true })) };
  const r1 = gateHometown(pack, allIn);
  ok('the fixture story passes the whole hometown gate on a frame package (lock v3) when mission 1 is in the district', r1.ok && districtProblems(pack, allIn).length === 0, r1.problems.slice(0, 3).join(' | '));
  const noneIn = { ...pkg, places: pkg.places.map((p) => ({ ...p, inDistrict: false })) };
  const dp = districtProblems(pack, noneIn);
  ok('mission 1 with a place outside the spawn district is refused (new gate rule), and only mission 1', dp.length > 0 && gateHometown(pack, noneIn).problems.some((p) => /built first/.test(p)) && dp.every((p) => /mission M1|start/.test(p)), dp.slice(0, 2).join(' | '));
  ok('a whole-town package (lock v2) has no district rule', districtProblems(pack, OK).length === 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0;
  await runBuildChecks((name, cond, detail) => { if (!cond) failed++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`); });
  process.exit(failed ? 1 : 0);
}

// ------------------------------------------------------------------- robustness (the production builder, 14 Nov)
async function robustness(ok: Ok, dir: string) {
  let t = 5_000_000;
  const W = (id: string, free = 4, total = 4) => ({ worker: id, build: B, freeSlots: free, totalSlots: total });
  const none = () => [] as string[];
  // ---- a tile job of several tiles that keeps failing is split; a lone bad tile degrades the whole town, fails its district
  const q = new BuildQueue({ file: ':memory:', now: () => t });
  const blk = 'hg1-conus/2/10/20';
  const [tk] = q.enqueue({ key: `tiles:${B}:${blk}`, kind: 'tiles', build: B, prio: 1, args: { block: blk, mask: 0b0011 }, place: 'us-1' });
  q.enqueue({ key: `bundle:${B}:us-1:full`, kind: 'bundle', build: B, prio: 2, args: { placeId: 'us-1', variant: 'full' }, deps: [tk], place: 'us-1' });
  q.enqueue({ key: `bundle:${B}:us-1:district`, kind: 'bundle', build: B, prio: 0, args: { placeId: 'us-1', variant: 'district-40-80' }, deps: [tk], place: 'us-1' });
  for (let i = 0; i < MAX_ATTEMPTS; i++) { t += 600_000; const c = q.claim(W('w'))!; if (c?.key !== tk) break; q.fail(c.key, c.leaseId, { code: 1, reason: 'compile crashed' }); }
  const singles = [`${tk}:t0`, `${tk}:t1`];
  ok('a 2-tile job that failed 3 times is split into one job per tile (fresh attempts, after a backoff); the towns want each; what waited on it waits on each',
    !q.get(tk) && singles.every((k) => q.get(k)?.state === 'queued' && q.get(k)!.attempts === 0 && q.get(k)!.notBefore > t && maskBits(Number(q.get(k)!.args.mask)).length === 1)
    && q.jobsOf('us-1').filter((j) => j.kind === 'tiles').length === 2 && JSON.stringify(q.get(`bundle:${B}:us-1:full`)!.deps) === JSON.stringify(singles), JSON.stringify(q.jobsOf('us-1').map((j) => [j.key, j.state])));
  for (let i = 0; i < 12; i++) {
    t += 600_000;
    const c = q.claim(W('w'));
    if (!c) break;
    if (c.key.endsWith(':t0')) q.fail(c.key, c.leaseId, { code: 1, reason: 'compile crashed' }); else q.complete(c.key, c.leaseId, { ms: 1000 }, none);
    if (c.kind === 'bundle') break;
  }
  const full = q.get(`bundle:${B}:us-1:full`)!, dist = q.get(`bundle:${B}:us-1:district`)!;
  ok('the bad tile, failed for good: the full bundle goes on without it (dep dropped, the tile listed absent: flat ground; claimed and built) and the good tile is built',
    q.get(singles[0])!.state === 'failed' && q.get(singles[1])!.state === 'done' && full.state === 'done' && JSON.stringify(full.deps) === JSON.stringify([singles[1]])
    && JSON.stringify(full.args.absent) === JSON.stringify(['hg1-conus/0/40/80']), JSON.stringify({ full, t0: q.get(singles[0])!.state }));
  ok('...but a district bundle waiting on it fails (the spawn path fails clearly)', dist.state === 'failed' && /dependency/.test(dist.error ?? ''));
  ok('...and both are journalled for the owner (split, degraded)', ['split', 'degraded'].every((k) => q.recentEvents(50).some((e) => e.kind === k)));
  q.close();

  // ---- a district bundle waits on its own window's tiles only (Surfside, FL: a tile outside the spawn district failed
  // in a block job it shared with district tiles, and failed the town), and a full bundle never lays the spawn district
  // flat (Beverly Beach, FL was served ready with its downtown as flat ground)
  {
    const qs = new BuildQueue({ file: ':memory:', now: () => t });
    const [bk] = qs.enqueue({ key: `tiles:${B}:${blk}`, kind: 'tiles', build: B, prio: 1, args: { block: blk, mask: 0b0011 }, place: 'us-2' });
    // (tile 40/80 is outside the district window, 41/80 inside it; the town's spawn district is the full bundle's keep)
    qs.enqueue({ key: `bundle:${B}:us-2:district`, kind: 'bundle', build: B, prio: 0, args: { placeId: 'us-2', variant: 'district-43-82', window: [41, 80, 45, 84] }, deps: [bk], place: 'us-2' });
    qs.enqueue({ key: `bundle:${B}:us-2:full`, kind: 'bundle', build: B, prio: 2, args: { placeId: 'us-2', variant: 'full', keep: [41, 80, 45, 84] }, deps: [bk], place: 'us-2' });
    for (let i = 0; i < MAX_ATTEMPTS; i++) { t += 600_000; const c = qs.claim(W('w'))!; if (c?.key !== bk) break; qs.fail(c.key, c.leaseId, { code: 1, reason: 'compile crashed' }); }
    ok('after the split, the district bundle waits only on its window\'s tile; the full bundle on both',
      JSON.stringify(qs.get(`bundle:${B}:us-2:district`)!.deps) === JSON.stringify([`${bk}:t1`]) && qs.get(`bundle:${B}:us-2:full`)!.deps.length === 2, JSON.stringify(qs.get(`bundle:${B}:us-2:district`)!.deps));
    for (let i = 0; i < 12; i++) {
      t += 600_000;
      const c = qs.claim(W('w'));
      if (!c) break;
      if (c.key.endsWith(':t0')) qs.fail(c.key, c.leaseId, { code: 1, reason: 'compile crashed' }); else qs.complete(c.key, c.leaseId, { ms: 1000 }, none);
    }
    const sd = qs.get(`bundle:${B}:us-2:district`)!, sf = qs.get(`bundle:${B}:us-2:full`)!;
    ok('the tile outside the district failed for good: the district bundle is built (the town plays), the full bundle degrades for that tile only',
      qs.get(`${bk}:t0`)!.state === 'failed' && sd.state === 'done' && sf.state === 'done' && JSON.stringify(sf.args.absent) === JSON.stringify(['hg1-conus/0/40/80']), JSON.stringify([sd.state, sd.error, sf.state, sf.args.absent]));
    qs.close();

    const qb = new BuildQueue({ file: ':memory:', now: () => t });
    const [k1] = qb.enqueue({ key: `tiles:${B}:${blk}`, kind: 'tiles', build: B, prio: 0, args: { block: blk, mask: 0b0010 }, place: 'us-3' });
    qb.enqueue({ key: `bundle:${B}:us-3:full`, kind: 'bundle', build: B, prio: 2, args: { placeId: 'us-3', variant: 'full', keep: [41, 80, 45, 84] }, deps: [k1], place: 'us-3' });
    for (let i = 0; i < MAX_ATTEMPTS; i++) { t += 600_000; const c = qb.claim(W('w'))!; if (c?.key !== k1) break; qb.fail(c.key, c.leaseId, { code: 1, reason: 'compile crashed' }); }
    const bf = qb.get(`bundle:${B}:us-3:full`)!;
    ok('a spawn district tile failed for good: the full bundle fails (never flat ground downtown)', qb.get(k1)!.state === 'failed' && bf.state === 'failed' && !bf.args.absent, JSON.stringify([bf.state, bf.args.absent]));
    const again = qb.retryFailed('us-3');
    ok('"Try again" queues the tile and the full bundle again, the bundle waiting on the tile', again.includes(k1) && qb.get(bf.key)!.state === 'queued' && qb.get(bf.key)!.deps.includes(k1));
    qb.close();

    const qa = new BuildQueue({ file: ':memory:', now: () => t });
    const [k2] = qa.enqueue({ key: `tiles:${B}:${blk}`, kind: 'tiles', build: B, prio: 0, args: { block: blk, mask: 0b0001 }, place: 'us-4' });
    qa.enqueue({ key: `bundle:${B}:us-4:full`, kind: 'bundle', build: B, prio: 2, args: { placeId: 'us-4', variant: 'full' }, deps: [k2, 'ctx:x'], place: 'us-4' });
    for (let i = 0; i < MAX_ATTEMPTS; i++) { t += 600_000; const c = qa.claim(W('w'))!; if (c?.key !== k2) break; qa.fail(c.key, c.leaseId, { code: 1, reason: 'compile crashed' }); }
    const before = qa.get(`bundle:${B}:us-4:full`)!;
    qa.retryFailed('us-4');
    const after = qa.get(`bundle:${B}:us-4:full`)!;
    ok('a degraded full bundle not yet built: "Try again" takes the tile it queues again out of args.absent and waits on it (Jupiter Inlet Colony\'s rebuilt tile was laid flat all the same)',
      JSON.stringify(before.args.absent) === JSON.stringify(['hg1-conus/0/40/80']) && !after.args.absent && after.deps.includes(k2) && after.deps.includes('ctx:x'), JSON.stringify([before.args.absent, after.args.absent, after.deps]));
    qa.close();
  }

  // ---- the cold start: every ctx block the town's compiles read is its own job (side by side), the frame waits on all
  const prague = placeById('us-4060500')!, pg = townGraph('us-4060500', gazetteerOf(prague), B, { frame: true, base: 0, now: t });
  const pctx = pg.specs.filter((x) => x.kind === 'ctx'), pframe = pg.specs.find((x) => x.kind === 'frame')!, ptiles = pg.specs.filter((x) => x.kind === 'tiles');
  ok('Prague, OK: the 9 ctx blocks within the compiler\'s reach are 9 P0 jobs (before: 1, and the frame computed 8 itself, one after another), the frame waits on all, a tile on those within its reach',
    pctx.length === 9 && pctx.every((x) => x.prio === 0) && pctx.every((x) => pframe.deps!.includes(x.key)) && ptiles.every((x) => x.deps!.length >= 1 && x.deps!.length <= 4 && x.deps!.every((k) => pctx.some((c) => c.key === k))),
    `${pctx.length} ctx; tile deps ${[...new Set(ptiles.map((x) => x.deps!.length))]}`);

  // ---- which failed tiles fail a town: the spawn district's only (frame: its spawnDistrict; no frame: the anchor's 5 x 5)
  const tileJob = (block: string, mask: number) => ({ key: `t:${block}`, kind: 'tiles', state: 'failed', args: { block, mask } }) as unknown as Job;
  const at4080 = tileJob('hg1-conus/2/10/20', 1), ctxDead = { ...tileJob('x', 0), kind: 'ctx' } as Job;
  const off = { cfg: { frame: false } } as BuilderDeps, on = { cfg: { frame: true } } as BuilderDeps;
  ok('no frame: a failed tile in the anchor\'s 5 x 5 fails the town; one outside degrades it; any other failed job fails it',
    fatalFailures(off, { anchor: [41, 81] }, [at4080]).length === 1 && fatalFailures(off, { anchor: [60, 60] }, [at4080]).length === 0 && fatalFailures(off, { anchor: [60, 60] }, [ctxDead]).length === 1);
  ok('frame mode: undecided until the frame lands (no fail yet), then by its spawn district',
    fatalFailures(on, {}, [at4080]).length === 0 && fatalFailures(on, { districtWindow: [38, 78, 42, 82] }, [at4080]).length === 1 && fatalFailures(on, { districtWindow: [0, 0, 4, 4] }, [at4080]).length === 0);

  // ---- a failed town's "Try again" re-queues at once; a degradable tile never fails a town
  const tt = { now: 7_000_000 };
  const d = fakeDeps(dir, 'robust', { HOMETOWN_BUILDER: 'on', HOMETOWN_MAX_WAIT_S: '1000000' }, tt);
  ok('a new town is admitted', requestTown(d, 'us-4054200', '1.1.1.1').status === 202);
  const jobs = d.queue.jobsOf('us-4054200');
  const far = jobs.filter((j) => j.kind === 'tiles' && j.prio === 1).at(-1)!;
  d.queue.db.prepare("UPDATE jobs SET state = 'failed', attempts = 3, not_before = ?, error = 'compile crashed' WHERE key = ?").run(tt.now + 60_000, far.key);
  ok('a tile failed for good far from the spawn: the town keeps building (it will be degraded, not failed)', townStatus(d, 'us-4054200').status === 202);
  const ctx0 = jobs.find((j) => j.kind === 'ctx')!;
  d.queue.db.prepare("UPDATE jobs SET state = 'failed', attempts = 3, not_before = ?, error = 'compile crashed' WHERE key = ?").run(tt.now + 60_000, ctx0.key);
  const failed = townStatus(d, 'us-4054200');
  ok('a ctx failed for good: the town fails (409), with the job and its error kept for the owner', failed.status === 409 && townsStatus(d).failed.some((f) => f.place === 'us-4054200' && f.job === ctx0.key && /crashed/.test(f.why ?? '')));
  tt.now += 5_000;
  const again = requestTown(d, 'us-4054200', '1.1.1.1');
  ok('"Try again" 5 s later (inside the 60 s a failure holds a job): the town\'s failed jobs are queued again at once and it builds (202), not the same 409',
    again.status === 202 && d.queue.get(ctx0.key)!.state === 'queued' && d.queue.get(ctx0.key)!.attempts === 0 && d.queue.recentEvents(20).some((e) => e.kind === 'town-retry'), `${again.status} ${d.queue.get(ctx0.key)!.state}`);

  // ---- the per-address limit survives a deploy (it lives in the queue's SQLite, as a hash)
  const ids = ['us-4055000', 'us-4075000', 'us-0455000', 'us-4261000'];
  const r3 = ids.slice(0, 3).map((id) => requestTown(d, id, '2.2.2.2').status);
  ok('three new towns from one address, then 429', JSON.stringify(r3) === '[202,202,202]' && requestTown(d, ids[3], '2.2.2.2').status === 429, JSON.stringify(r3));
  const file = path.join(d.cfg.root, 'queue.db');
  d.queue.close();
  const d2 = { ...d, queue: new BuildQueue({ file, now: () => tt.now }) };
  ok('after a restart (a deploy: a new process, the same disk) the address is still at its limit', requestTown(d2, ids[3], '2.2.2.2').status === 429);
  ok('the address itself is never stored (a hash)', !JSON.stringify(d2.queue.db.prepare('SELECT * FROM ip_hits').all()).includes('2.2.2.2'));
  tt.now += 3600_000 + 1;
  ok('an hour later it may ask again', requestTown(d2, ids[3], '2.2.2.2').status === 202);
  // ---- "Try again" of a failed town is not a new town for the address (its third pick of the hour failed, and the
  // retry was refused at once with "Lots of towns are being built")
  {
    const ip = '198.51.100.23', mine = ['us-4007500', 'us-1211225', 'us-4080550'];
    tt.now += 3600_000 + 1;
    const r = mine.map((id) => requestTown(d2, id, ip).status);
    const ctx = d2.queue.jobsOf(mine[2]).find((j) => j.kind === 'ctx')!;
    d2.queue.db.prepare("UPDATE jobs SET state = 'failed', attempts = 3, not_before = ?, error = 'compile crashed' WHERE key = ?").run(tt.now + 60_000, ctx.key);
    const failedNow = townStatus(d2, mine[2]).status;
    tt.now += 5_000;
    const retry = requestTown(d2, mine[2], ip), retry2 = requestTown(d2, mine[2], ip);
    ok('the third pick of the hour failed: its "Try again" is built (202), not refused (429); asking again counts no new town',
      JSON.stringify(r) === '[202,202,202]' && failedNow === 409 && retry.status === 202 && retry2.status === 202, JSON.stringify([r, failedNow, retry.status, retry2.status]));
    { const r4 = requestTown(d2, 'us-4060500', ip); ok('...while a fourth new town from that address is still refused', r4.status === 429, JSON.stringify(r4).slice(0, 200)); }
  }
  // ---- the owner's status: degraded and failed towns
  d2.queue.db.prepare("INSERT INTO towns (place, build, box, state, first_asked, tiles_total, tiles_done, asks, source, meta) VALUES ('us-9999999', ?, '[]', 'full', 1, 4, 4, 1, 'player', ?)").run(B, JSON.stringify({ name: 'Somewhere', absent: ['hg1-conus/0/40/80'] }));
  const st = townsStatus(d2);
  ok('status lists degraded towns (built whole, some tiles flat ground)', st.degraded.n === 1 && st.degraded.recent[0].place === 'us-9999999' && st.degraded.recent[0].absent === 1);
  d2.queue.db.prepare("UPDATE towns SET meta = ? WHERE place = 'us-4054200'").run(JSON.stringify({ refused: ['hg1-conus/0/1/2'] }));
  const fb = d2.queue.jobsOf('us-4054200').find((j) => j.kind === 'bundle' && j.args.variant === 'full')!;
  ok('a full bundle is sent with the town\'s refused tiles (no DEM) as absent too: flat ground, not a refused town', JSON.stringify(argsOf(d2, { ...fb, args: { ...fb.args, absent: ['hg1-conus/0/9/9'] } }).absent) === JSON.stringify(['hg1-conus/0/1/2', 'hg1-conus/0/9/9']));
  d2.queue.close();

  // ---- no build known: the pick is kept, and the run's first claim admits it and takes its first job in the same call
  const tp = { now: 9_000_000 };
  const p = fakeDeps(dir, 'pending', { HOMETOWN_BUILDER: 'on', HOMETOWN_BUILD: '', HOMETOWN_MAX_WAIT_S: '1000000' }, tp);
  const call = (body: unknown, pollMs = 50) => workerResponse(new Request('http://web/api/hometown/worker/claim', { method: 'POST', headers: { authorization: `Bearer ${W_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }), ['claim'], p, { pollMs });
  const kept = requestTown(p, 'us-4054200', '3.3.3.3');
  ok('no build known: 202 waiting its turn at once (kept)', kept.status === 202 && (kept.body as { phase: string }).phase === 'asked' && townStatus(p, 'us-4054200').status === 202);
  const first = await call({ worker: 'run-1', build: B, freeSlots: 4, totalSlots: 4 });
  const fj = await first.json() as { key: string; kind: string; leaseId: string };
  ok('the first claim of the run (reporting the build) admits the kept pick and is handed its first job in that same claim', first.status === 200 && (fj.kind === 'regions' || fj.kind === 'ctx') && p.queue.jobsOf('us-4054200').length > 0
    && (p.queue.db.prepare('SELECT COUNT(*) n FROM pending').get() as { n: number }).n === 0 && p.queue.recentEvents(20).some((e) => e.kind === 'admitted'), JSON.stringify(fj).slice(0, 200));
  // ---- the claim's free slots re-read on every wake-up: a last-slot (P0 only) claim takes P1 work once the other job ends
  p.queue.db.prepare("UPDATE jobs SET state = 'done' WHERE state = 'queued' AND key != ? AND kind != 'tiles'").run(fj.key);
  p.queue.db.prepare("UPDATE jobs SET prio = 1, deps = '[]', not_before = 0 WHERE kind = 'tiles' AND state = 'queued'").run();
  const lastSlot = call({ worker: 'run-1', build: B, freeSlots: 1, totalSlots: 2 }, 3000);
  setTimeout(() => { p.queue.complete(fj.key, fj.leaseId, { ms: 1 }, none); }, 200);
  const t0 = Date.now(), ls = await lastSlot, lj = ls.status === 200 ? await ls.json() as { prio: number } : null;
  ok(`a claim made with the last of 2 slots free (P0 only) is handed P1 work as soon as the other job completes (${Date.now() - t0} ms), not after its whole long-poll`, ls.status === 200 && lj?.prio === 1 && Date.now() - t0 < 2500);
  p.queue.close();
}
