/**
 * Hometown towns (Phase A): one place id, the lock adapter, the town bundle's CityPackage, a hometown story through the
 * store to the runner pack and Mog City's address, and the player-facing words. Part of `npm run check`; alone:
 *   node --import ./scripts/ts-resolve.mjs scripts/hometown-towns-check.ts
 *
 * Offline: no compiler, no server, no model. The town is the CityPackage of a real build of us-4054200 (Okemah, OK;
 * storykit/hometown/fixtures/okemah-us-4054200.citypackage.json, written by lib/hometown/bundle.ts cityPackageOf from
 * the hg1 compiler's package) and its story is the fixture reply STORYKIT_FAKE_REPLY replays in a local end-to-end run.
 */
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { packageProblems, cityLock, type CityPackage } from '../storykit/hometown/city-package.ts';
import { checkHometownReply } from '../lib/storykit-hometown.ts';
import { gatePack, toRunnerPack } from '../storykit/pack/gate.ts';
import { cityTableOf } from '../storykit/hometown/hometown-gate.ts';
import { TOWN_ID, canonicalPlaceId, serviceLock, storyLock, sameServiceLock, LOCK_FORMAT } from '../lib/hometown/ids.ts';
import { canonicalBox, TOWN_WORDS, cityPackageByLock, bundleFile, requestTown, townStatus, markInterrupted, printBuildArgs, storedTiles, type Job } from '../lib/hometown/towns.ts';
import { townClientKey } from '../lib/hometown/client.ts';
import { townsConfig } from '../lib/hometown/config.ts';
import { storyFrameQuery, storyFrameSrc, playOf } from '../lib/storykit-publish.ts';
import { BuildQueue } from '../lib/hometown-build/queue.ts';
import { bestVariant } from '../lib/hometown-build/towns.ts';
import { hometownConfig } from '../lib/hometown-tiles/config.ts';
import { TileStore, GB } from '../lib/hometown-tiles/store.ts';
import { bundleKey } from '../lib/hometown-tiles/keys.ts';
import { StoryStore } from '../lib/storykit-store.ts';
import { placeById } from '../lib/places/search.ts';
import { storyUpgradeWith, checkPlaces, worldPlaces, frameMoved, upgradedWorld, sha256, worldBytes, outsideDistrict, MOVE_M, type UpgradeDeps } from '../lib/storykit-upgrade.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;
const F = 'storykit/hometown/fixtures/';
const R = (p: string) => JSON.parse(readFileSync(F + p, 'utf8'));
const reply = (r: { meta: unknown; pack: unknown }) => '```json\n' + JSON.stringify(r.meta) + '\n```\n\n```json\n' + JSON.stringify(r.pack) + '\n```';
/** Words a player never reads on GameMog (the owner's rule): the tools and vendors behind a town or a story. */
export const FORBIDDEN = /\b(claude|anthropic|ai|a\.i\.|model|llm|gta|gen z quant|opus|sonnet)\b/i;

export async function runTownChecks(ok: Ok) {
  console.log('\nHometown towns: one place id, the lock adapter, the town bundle, a hometown story to the play address (lib/hometown)');
  const OK: CityPackage = R('okemah-us-4054200.citypackage.json');
  const lock = cityLock(OK);

  // ── one place id ──
  const okemah = placeById('us-4054200');
  ok('the search\'s place id is the town\'s id everywhere: us-4054200 is Okemah, OK', !!okemah && okemah.name === 'Okemah' && okemah.state === 'OK' && OK.placeId === 'us-4054200' && lock.place === 'us-4054200');
  ok('the compiler\'s old dev id maps to it; bare test boxes have none', canonicalPlaceId('okemah') === 'us-4054200' && canonicalPlaceId('us-4054200') === 'us-4054200' && canonicalPlaceId('phoenix') === null && !TOWN_ID.test('us-ok-okemah'));
  const box = okemah ? canonicalBox(okemah) : [0, 0, 0, 0];
  ok('the canonical box is the search\'s box, at most 4,500 m a side, to 1e-6 degrees (fetch.py\'s cap, lib/hometown/box.ts)', !!okemah && box[0] <= okemah.lon && box[2] >= okemah.lon && (box[3] - box[1]) * 111_132 <= 4501 && box.every((v) => Number(v.toFixed(6)) === v));
  const big = canonicalBox({ lat: 40, lon: -100, bbox: [-101, 39, -99, 41] });
  ok('a sprawling place\'s box is capped at 4,500 m a side', Math.abs((big[3] - big[1]) * 111_132 - 4500) < 2 && Math.abs((big[2] - big[0]) * 111_320 * Math.cos((40 * Math.PI) / 180) - 4500) < 2);

  // ── the lock: the Story Kit's shape and the compiler's / tile service's, one adapter ──
  const svc = serviceLock(lock);
  ok('serviceLock is the tile service\'s lock v2 (format, formatVersion 2, buildId = compiler)', svc.format === LOCK_FORMAT && svc.formatVersion === 2 && svc.buildId === lock.compiler && svc.tiles === lock.tiles && svc.place === lock.place);
  ok('storyLock(serviceLock(x)) is x, field for field', JSON.stringify(storyLock(svc)) === JSON.stringify(lock));
  ok('a lock with a moved field is another lock', !sameServiceLock(svc, { ...svc, tiles: 'f'.repeat(64) }) && sameServiceLock(svc, JSON.parse(JSON.stringify(svc))));
  ok('storyLock refuses what is not a lock v2', storyLock({ ...svc, format: 'x' }) === null && storyLock({ ...svc, formatVersion: 1 }) === null && storyLock(null) === null);

  // ── the bundle's CityPackage ──
  ok('the built town\'s CityPackage reads (hg1 frame, a 64-hex tile set)', packageProblems(OK).length === 0 && /^[0-9a-f]{64}$/.test(OK.tileSet.hash), packageProblems(OK).join('; '));
  ok('its places include the arrivals Mog City builds (pkg_<k>) and at least one spawn', OK.places.some((p) => p.id === 'pkg_downtown') && OK.spawnPoints.length >= 1 && OK.spawnPoints.every((s) => OK.places.some((p) => p.id === s.id)));
  ok('its streets are summed (named streets, km, the main ones)', OK.roadsSummary.streets > 10 && OK.roadsSummary.km > 10 && OK.roadsSummary.main.length > 0);

  // ── a story in the town: the fixture reply, the store, the runner pack, the address ──
  const pass = checkHometownReply(reply(R('okemah-us-4054200.reply.json')), { pkg: OK, id: 'sk-okemah9' });
  ok('the fixture story passes the hometown pass in the built town (gate rule 16 + safety)', pass.problems.length === 0 && !!pass.pack, pass.problems.slice(0, 3).join(' | '));
  const pack = pass.pack!;
  ok('its base pins the built town exactly', JSON.stringify(pack?.base?.hometown) === JSON.stringify(lock) && pack.base.cityBuild === `hometown-${OK.compilerVersion}`);
  const runner = pack ? toRunnerPack(pack, { townName: 'Okemah, Oklahoma' }) : {};
  ok('the runner pack carries the lock (hometown) and the town\'s name as its missions\' city', JSON.stringify(runner.hometown) === JSON.stringify(lock) && runner.city === 'hometown' && runner.missions.every((m: { city: string }) => m.city === 'Okemah, Oklahoma'));
  ok('a New York runner pack has no hometown and keeps "New York"', (() => { const ny = gatePack(JSON.parse(readFileSync('storykit/pack/fixtures/good-ny.json', 'utf8'))).pack; const r = ny ? toRunnerPack(ny) : null; return !!r && !('hometown' in r) && r.missions.every((m: { city: string }) => m.city === 'New York'); })());
  ok('the play address boots the built town (city=pkg&town&tc&ts), New York and San Francisco as before',
    storyFrameQuery('hometown', lock) === `city=pkg&town=us-4054200&tc=${lock.compiler}&ts=${lock.tiles}` && storyFrameQuery('ny') === '' && storyFrameQuery('sf') === 'city=sf' && storyFrameQuery('hometown', null) === '');
  ok('a town of the production builder plays its bundle variant (&tv=full, or the spawn district while the rest builds: Mog City town-src.js)',
    storyFrameQuery('hometown', lock, 'full') === `city=pkg&town=us-4054200&tc=${lock.compiler}&ts=${lock.tiles}&tv=full` && storyFrameQuery('hometown', lock, 'district-5806-4290').endsWith('&tv=district-5806-4290') && storyFrameQuery('ny', null, 'full') === '');
  ok('the frame address joins the city part with one \'&\' (none stray), New York with none', /\/\?city=pkg&town=us-4054200&tc=[^&]+&ts=[0-9a-f]{64}&pack=/.test(storyFrameSrc('a'.repeat(64), 'g', 'http://localhost:1', 'hometown', lock)) && /\/\?pack=/.test(storyFrameSrc('a'.repeat(64), 'g', 'http://localhost:1', 'ny')) && /\/\?city=sf&pack=/.test(storyFrameSrc('a'.repeat(64), 'g', 'http://localhost:1', 'sf')) && !/&&/.test(storyFrameSrc('a'.repeat(64), 'g', 'http://localhost:1', 'hometown', lock)));

  // ── a story published while only the spawn district was built, its whole town built later (14 Nov): the play page reads
  // the town's best variant when the address is made (storyFrameQuery -> townPlay -> bestVariant), never kept with the world
  {
    const tq = mkdtempSync(path.join(tmpdir(), 'hometown-variant-'));
    try {
      const hc = hometownConfig({ HOMETOWN_DIR: tq, HOMETOWN_DATA_DIR: path.join(tq, 'data'), HOMETOWN_BUILDER: 'on' });
      const d = { cfg: hc, store: new TileStore({ root: hc.root, capBytes: GB, minFreeBytes: 0, freeBytes: () => 100 * GB, log: () => {} }), queue: new BuildQueue({ file: path.join(tq, 'q.db') }) };
      const T = lock.tiles, T2 = 'e'.repeat(64), DV = 'district-5806-4290';
      const row = (meta: object) => { d.queue.db.prepare('DELETE FROM towns').run(); d.queue.db.prepare("INSERT INTO towns (place, build, box, state, first_asked, tiles_total, tiles_done, asks, source, meta) VALUES (?, ?, '[]', 'growing', 0, 1, 0, 1, 'player', ?)").run(lock.place, lock.compiler, JSON.stringify(meta)); };
      const stored = (tiles: string, v: string) => d.store.put(bundleKey(lock.compiler, lock.place, tiles, v, 'bundle.json'), Buffer.from('{}'));
      const q = () => storyFrameQuery('hometown', lock, playOf(bestVariant(d, lock.place, lock.compiler), lock));
      row({ district: { tilesId: T, variant: DV } }); stored(T, DV);
      ok('a story published on the spawn district plays the district while the rest builds', q() === `city=pkg&town=us-4054200&tc=${lock.compiler}&ts=${T}&tv=${DV}`, q());
      row({ district: { tilesId: T, variant: DV }, full: { tilesId: T } });
      ok('...the whole town recorded but its bundle not stored yet: still the district (never an address that 404s)', q().endsWith(`&ts=${T}&tv=${DV}`), q());
      stored(T, 'full');
      ok('the whole town built later than the story was published: the play page plays it (tv=full, the lock\'s tiles id)', q() === `city=pkg&town=us-4054200&tc=${lock.compiler}&ts=${T}&tv=full`, q());
      row({ district: { tilesId: T, variant: DV }, full: { tilesId: T2 } }); stored(T2, 'full');
      ok('...and when the whole town\'s tiles id is not the district\'s: the whole town anyway, at the same place and build, by its own tiles id',
        q() === `city=pkg&town=us-4054200&tc=${lock.compiler}&ts=${T2}&tv=full`, q());
      ok('a district of another tile set is never played for the lock (only the whole town may differ)', playOf({ variant: DV, tilesId: T2, full: false }, lock) === null && playOf(null, lock) === null);
      ok('another build is another town: nothing is played for the lock at it', bestVariant(d, lock.place, 'htc-9.9.9-hg1-b99999999') === null);
      d.queue.close();
    } finally { rmSync(tq, { recursive: true, force: true }); }
  }

  // ── a story pinned to an older build of its town (14 Nov: The Courtesy Lane kept the 0.8.0 district of Bal Harbour for
  // ever): it plays the town's current whole town when the frame is the same and every place it names is the same place
  // there (lib/storykit-upgrade.ts); else it keeps its pinned build and says why
  {
    const NB = 'htc-0.4.0-hg1-bdeadbeef', NT = 'd'.repeat(64);
    const NEW: CityPackage = { ...OK, compilerVersion: NB, buildId: NB, tileSet: { ...OK.tileSet, hash: NT }, places: OK.places.map((p) => (p.id === 'restaurant' ? { ...p, name: 'the diner on W Broadway' } : p)) };
    const toLock = cityLock(NEW);
    const world = { storykit: 1, id: 'sk-test', city: 'hometown', hometown: lock, places: { hideout: { '@': 'bar', name: 'the back room' }, mark: { at: [10, 20, 0], name: 'a corner' }, unused: { '@': 'cafe' } },
      opening: { shots: [{ cam: '@pkg_downtown' }] }, missions: [{ id: 'M1', start: '@hotel', steps: [{ type: 'drive', to: '@hideout' }, { type: 'goto', to: { '@': 'gas_station' } }, { type: 'drive', to: '@mark' }] }], voice: { lines: [{ say: '@nope' }] } };
    const wp = worldPlaces(world);
    ok('the world\'s places: every "@key" it plays, through its aliases, with the missions that name them; marks apart; the voice plan and the alias table itself are not places',
      [...wp.ids.keys()].sort().join() === 'bar,cafe,gas_station,hotel,pkg_downtown' && [...wp.ids.get('bar')!.via].join() === 'hideout' && [...wp.ids.get('hotel')!.missions].join() === 'M1' && wp.marks.join() === 'mark', [...wp.ids.keys()].join());
    const W = 'a'.repeat(64);
    let derived: Uint8Array | null = null;
    const deps = (o: Partial<UpgradeDeps> & { cur?: string | null; fullAt?: boolean; newPkg?: CityPackage | null; oldPkg?: CityPackage | null } = {}): UpgradeDeps => ({
      current: () => (o.cur === undefined ? NB : o.cur),
      full: (_p, b) => (o.fullAt === false || b !== NB ? null : { tilesId: NT, lock: toLock }),
      pkg: (l) => (l.compiler === NB ? (o.newPkg === undefined ? NEW : o.newPkg) : (o.oldPkg === undefined ? OK : o.oldPkg)),
      world: (h) => (h === W ? (o.world ? o.world(h) : world) : null),
      derive: (_f, b) => { derived = b; return sha256(b); },
    });
    const up = storyUpgradeWith(deps(), W, { derive: true });
    ok('an older pin, the current build\'s whole town built, the same frame, every place the same place: it plays the current whole town',
      up?.state === 'upgrade' && up.to.compiler === NB && up.tilesId === NT && JSON.stringify(up.to) === JSON.stringify(toLock), JSON.stringify(up).slice(0, 300));
    ok('...with the world re-pinned and nothing else changed (the same id: the same save), kept by its SHA-256',
      up?.state === 'upgrade' && !!derived && up.world === sha256(derived!) && JSON.stringify(JSON.parse(new TextDecoder().decode(derived!))) === JSON.stringify({ ...world, hometown: toLock })
        && sha256(worldBytes(upgradedWorld(world, toLock))) === up.world);
    ok('...a place whose name only changed is a note, not a hold', up?.state === 'upgrade' && up.notes.length === 0);
    const named = storyUpgradeWith(deps({ newPkg: { ...NEW, places: NEW.places.map((p) => (p.id === 'hotel' ? { ...p, name: 'the inn' } : p)) } }), W);
    ok('...a place renamed (same kind, same spot) still upgrades, with a note', named?.state === 'upgrade' && named.notes.some((n) => n.includes('@hotel')), JSON.stringify(named));
    ok('the pin is the current build: nothing to do', storyUpgradeWith(deps({ cur: lock.compiler }), W)?.state === 'current');
    ok('no current build known: nothing to do', storyUpgradeWith(deps({ cur: null }), W)?.state === 'current');
    ok('the current build\'s whole town not built yet: it waits on its pinned build', storyUpgradeWith(deps({ fullAt: false }), W)?.state === 'waiting');
    const held = (o: Parameters<typeof deps>[0]) => { const u = storyUpgradeWith(deps(o), W); return u?.state === 'held' ? u.why.join(' | ') : `not held: ${u?.state}`; };
    const gone = held({ newPkg: { ...NEW, places: NEW.places.filter((p) => p.id !== 'gas_station') } });
    ok('a place not on the new map: held, and it says which', /gas_station is not on the current build's map/.test(gone), gone);
    const other = held({ newPkg: { ...NEW, places: NEW.places.map((p) => (p.id === 'bar' ? { ...p, kind: 'school', name: 'the school' } : p)) } });
    ok('an id now naming another kind of place: held (another place has its id), by its alias', /@hideout \(bar\) was bar .* another place has its id/.test(other), other);
    const far = held({ newPkg: { ...NEW, places: NEW.places.map((p) => (p.id === 'hotel' ? { ...p, x: p.x + MOVE_M + 5 } : p)) } });
    ok(`a place moved more than ${MOVE_M} m: held`, /@hotel .* moved 35 m/.test(far), far);
    ok('a place moved less than that: the same place', storyUpgradeWith(deps({ newPkg: { ...NEW, places: NEW.places.map((p) => (p.id === 'hotel' ? { ...p, x: p.x + 12 } : p)) } }), W)?.state === 'upgrade');
    const unused = held({ newPkg: { ...NEW, places: NEW.places.filter((p) => p.id !== 'cafe') } });
    ok('an alias of the world\'s nothing names is still checked (it is the story\'s map)', /@unused \(cafe\)/.test(unused), unused);
    ok('the pinned build\'s places unreadable: held (nothing to compare)', /pinned build's places can no longer be read/.test(held({ oldPkg: null })));
    ok('the current build\'s places unreadable: held', /current build's places cannot be read/.test(held({ newPkg: null })));
    const moved = storyUpgradeWith({ ...deps(), full: () => ({ tilesId: NT, lock: { ...toLock, origin: { c0: toLock.origin!.c0 + 1, r0: toLock.origin!.r0 } } }) }, W);
    ok('the frame moved (origin, k0, gamma0, yOffset, waterLevel, domain): held, whatever the places', moved?.state === 'held' && /frame moved between the builds \(origin\)/.test(moved.why.join()), JSON.stringify(moved));
    ok('frameMoved compares the coordinate fields only (the build and tiles may differ)', frameMoved(lock, toLock) === '' && frameMoved(lock, { ...toLock, k0: 1 }) === 'k0' && frameMoved(lock, { ...toLock, place: 'us-0000001' }) === 'place');
    ok('the store could not keep the upgraded world: held, never an address that is not there', storyUpgradeWith({ ...deps(), derive: () => null }, W, { derive: true })?.state === 'held');
    ok('a world that is not a hometown world, or not stored: no upgrade', storyUpgradeWith(deps({ world: () => ({ ...world, city: 'ny' }) }), W) === null && storyUpgradeWith(deps(), 'b'.repeat(64)) === null && storyUpgradeWith(deps(), 'nope') === null);
    const homes = checkPlaces(world, OK, { ...NEW, places: NEW.places.map((p) => (p.id === 'bar' ? { ...p, kind: 'house', name: 'a house', tags: ['building=house'] } : p)) });
    ok('a place that is a home on the new map is refused', !homes.ok && homes.why.some((w) => /@hideout \(bar\)/.test(w)), homes.why.join(' | '));
    // (16 Nov, Colter Land: published on a district whose whole town then failed; lib/storykit-publish.ts townHold)
    const v3 = (inD: string[]): CityPackage => ({ ...OK, lockVersion: 3, places: OK.places.map((p) => ({ ...p, inDistrict: inD.includes(p.id) })) });
    const outD = outsideDistrict(world, v3(['hotel', 'pkg_downtown']));
    ok('a story on a spawn district: every place it names outside the district is listed, by its alias, marks aside',
      outD.length === 3 && outD.some((x) => x.startsWith('@hideout (bar)')) && outD.some((x) => x.startsWith('@unused (cafe)')) && outD.some((x) => x.startsWith('@gas_station')) && !outD.some((x) => /mark/.test(x)), outD.join(' | '));
    ok('...none when every place is in the district, and a whole-town package (lock v2) has no district to be outside',
      outsideDistrict(world, v3(OK.places.map((p) => p.id))).length === 0 && outsideDistrict(world, { ...OK, lockVersion: undefined }).length === 0);
    ok('...a place the package does not have at all is listed too', outsideDistrict(world, { ...v3(OK.places.map((p) => p.id)), places: v3(OK.places.map((p) => p.id)).places.filter((p) => p.id !== 'bar') }).some((x) => x.startsWith('@hideout (bar)')));
    ok('the play address of an upgrade boots the new build\'s whole town (tc, ts, tv=full) with the re-pinned world',
      storyFrameQuery('hometown', toLock, { variant: 'full', tilesId: NT }) === `city=pkg&town=${lock.place}&tc=${NB}&ts=${NT}&tv=full`);
  }

  // the store: gates the pack with its town's table (read by its lock from the bundles), seals the runner pack with it
  const tmp = mkdtempSync(path.join(tmpdir(), 'hometown-towns-'));
  const was = globalThis.__hometownTowns;
  try {
    const cfg = { ...townsConfig(), root: tmp, bundles: path.join(tmp, 'bundles'), jobs: path.join(tmp, 'jobs'), ready: path.join(tmp, 'ready'), store: path.join(tmp, 'tstore'), scratch: path.join(tmp, 'scratch') };
    globalThis.__hometownTowns = { cfg, queue: [], running: null, build: null, ips: new Map(), booted: true };
    const dir = path.join(cfg.bundles, lock.compiler, lock.place, lock.tiles);
    mkdirSync(path.join(dir, 'data'), { recursive: true });
    writeFileSync(path.join(dir, 'citypackage.json'), JSON.stringify(OK));
    writeFileSync(path.join(dir, 'lock.json'), JSON.stringify(svc));
    ok('cityPackageByLock reads the town by its lock, and nothing for a moved lock', !!cityPackageByLock(lock) && cityPackageByLock({ ...lock, tiles: 'e'.repeat(64) }) === null && cityPackageByLock({ ...lock, k0: 1 }) === null);
    ok('/towns serves stored bundle files only (no build, no other names)', !!bundleFile([lock.place, lock.compiler, lock.tiles, 'citypackage.json']) && bundleFile([lock.place, lock.compiler, lock.tiles, 'geodata.json']) === null
      && bundleFile([lock.place, lock.compiler, lock.tiles, '..', 'x']) === null && bundleFile(['okemah', lock.compiler, lock.tiles, 'lock.json']) === null);
    mkdirSync(path.join(dir, 'data', 'far'), { recursive: true }); writeFileSync(path.join(dir, 'data', 'far', 'b-722-1069.bin.gz'), 'x');
    ok('/towns serves the town\'s far field tiles (data/far/*.bin.gz) and no other far names', !!bundleFile([lock.place, lock.compiler, lock.tiles, 'data', 'far', 'b-722-1069.bin.gz'])
      && bundleFile([lock.place, lock.compiler, lock.tiles, 'data', 'far', '..', 'lock.json']) === null && bundleFile([lock.place, lock.compiler, lock.tiles, 'data', 'far', 'b-722-1069.bin']) === null);
    const s = new StoryStore(path.join(tmp, 'store'));
    const o = s.open(pack);
    ok('the store opens a hometown pack (gated with its town\'s table)', o.ok, o.ok ? '' : `${o.error} ${(o as { problems?: string[] }).problems?.slice(0, 2).join(' | ')}`);
    if (o.ok) {
      const w = s.world(o.id) as Record<string, any>;
      ok('the store\'s sealed world names the town (hometown, missions in Okemah)', JSON.stringify(w.hometown) === JSON.stringify(lock) && w.missions.every((m: { city: string }) => m.city === 'Okemah, Oklahoma'));
      // (an upgrade and a re-pin: the world kept by its store draft; lib/storykit-upgrade.ts, StoryStore.derive / repin)
      const NB = 'htc-0.4.0-hg1-bdeadbeef', NEW: CityPackage = { ...OK, compilerVersion: NB, buildId: NB, tileSet: { ...OK.tileSet, hash: 'd'.repeat(64) } };
      const kept = s.keep(o.id, 'game-1'), sealed = s.seal(s.db.prepare('SELECT * FROM drafts WHERE id = ?').get(o.id) as never);
      const from = sealed.ok ? sealed.hash : '';
      const body = worldBytes(upgradedWorld(JSON.parse(s.read(`${from}.json`)!.bytes.toString('utf8')), cityLock(NEW)));
      const h = s.derive(from, body);
      ok('the upgraded world is kept with its store draft (served by its SHA-256, never swept) and made once', kept && !!h && h === sha256(body) && !!s.read(`${h}.json`) && s.derive(from, body) === h
        && (s.db.prepare("SELECT COUNT(*) n FROM files WHERE draft_id = ? AND name = ?").get(o.id, `up-${h}.json`) as { n: number }).n === 1 && s.sweep(true).blobs === 0 && !!s.read(`${h}.json`));
      ok('...only for a world a draft holds, and only the same world (its id)', s.derive('e'.repeat(64), body) === null && s.derive(from, worldBytes({ storykit: 1, id: 'another' })) === null);
      const bad = s.repin(o.id, { from, pin: cityLock(NEW), cityBuild: `hometown-${NB}`, city: cityTableOf({ ...NEW, places: NEW.places.filter((p) => !JSON.stringify(pack).includes(`"@${p.id}"`)) }) });
      ok('a re-pin whose pack does not gate against the new map changes nothing (and says what)', !bad.ok && !!(bad as { problems?: string[] }).problems?.length && (s.db.prepare('SELECT world FROM drafts WHERE id = ?').get(o.id) as { world: string }).world === from);
      ok('a re-pin over a world the game no longer plays is refused', !s.repin(o.id, { from: 'f'.repeat(64), pin: cityLock(NEW), cityBuild: `hometown-${NB}`, city: cityTableOf(NEW) }).ok);
      const rp = s.repin(o.id, { from, pin: cityLock(NEW), cityBuild: `hometown-${NB}`, city: cityTableOf(NEW) });
      const row = s.db.prepare('SELECT pack, world FROM drafts WHERE id = ?').get(o.id) as { pack: string; world: string };
      ok('the owner\'s re-pin: the pack pins the new build and gates, the sealed world is the same world re-pinned, the old one kept',
        rp.ok && row.world === rp.hash && rp.hash === h && JSON.stringify(JSON.parse(row.pack).base.hometown) === JSON.stringify(cityLock(NEW)) && JSON.parse(row.pack).base.cityBuild === `hometown-${NB}`
          && !!s.db.prepare("SELECT 1 FROM files WHERE draft_id = ? AND name = ?").get(o.id, `was-${from}.json`) && !!s.read(`${from}.json`), rp.ok ? '' : `${rp.error} ${(rp as { problems?: string[] }).problems?.join(' | ')}`);
    }
    // the limits: a new town per address per hour, the queue (a job held "running" so nothing is spawned here)
    const rt = globalThis.__hometownTowns!;
    rt.running = 'us-0000000'; rt.build = Promise.resolve(lock.compiler); rt.cfg = { ...cfg, perIpHour: 3, queueMax: 10, dailyCold: 100 };
    const asks = [];
    for (const id of ['us-4054200', 'us-4000100', 'us-4000200', 'us-4000250']) asks.push(await requestTown(id, '203.0.113.9'));
    ok('three new towns from one address are queued, the fourth is 429', asks.slice(0, 3).every((a) => a.status === 202) && asks[3].status === 429, asks.map((a) => a.status).join());
    const again = await requestTown('us-4054200', '203.0.113.9');
    ok('asking again for a town already building joins it (no new build, no limit)', again.status === 202 && rt.queue.length === 3);
    mkdirSync(path.join(cfg.ready, lock.compiler), { recursive: true }); writeFileSync(path.join(cfg.ready, lock.compiler, 'us-4054200.json'), JSON.stringify(svc));
    const ready = await requestTown('us-4054200', '198.51.100.1');
    ok('a built town is ready at once (its ready lock and bundle), never limited', ready.status === 200 && JSON.stringify((ready.body as { lock?: unknown }).lock) === JSON.stringify(lock));
    rt.cfg = { ...rt.cfg, queueMax: 4 };
    ok('a full queue is 503 for a new town', (await requestTown('us-4000300', '198.51.100.2')).status === 503);
    ok('an unknown or bad place id is refused', (await requestTown('us-9999999', 'x')).status === 404 && (await requestTown('okemah', 'x')).status === 400);
    ok('a restart marks the jobs it cut short interrupted', markInterrupted(cfg) === 3);
    const pb = printBuildArgs(cfg);
    ok('the build id is read with the jobs\' own --data (it includes the OSM lane table under it)', pb[pb.indexOf('--data') + 1] === cfg.sources && pb[pb.indexOf('--store') + 1] === cfg.store);
    // ── hardening: the address a town is counted against, a cut-short build, a warm store, the ready cache ──
    const R0 = (h: Record<string, string>) => new Request('http://x/api/towns', { method: 'POST', headers: h });
    const onRender = { RENDER: 'true' }, off = {};
    ok('on Render the address is Cloudflare\'s (a forged X-Forwarded-For first hop is never read)', townClientKey(R0({ 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': '1.2.3.4, 198.51.100.7, 172.70.1.1' }), onRender) === '198.51.100.7'
      && townClientKey(R0({ 'true-client-ip': '198.51.100.8', 'x-forwarded-for': '9.9.9.9, 172.70.1.1' }), onRender) === '198.51.100.8');
    ok('off Render a forged cf-connecting-ip or first X-Forwarded-For hop is never read (the last hop is the proxy\'s)', townClientKey(R0({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2, 203.0.113.5' }), off) === '203.0.113.5'
      && townClientKey(R0({ 'cf-connecting-ip': '1.1.1.1' }), off) === 'local' && townClientKey(R0({ 'x-forwarded-for': '2.2.2.2, 203.0.113.5, 10.0.0.2' }), { HOMETOWN_TRUSTED_HOPS: '2' }) === '203.0.113.5');
    ok('a header that is not an address is never a key', townClientKey(R0({ 'x-forwarded-for': 'evil<script>' }), off) === 'local' && townClientKey(R0({ 'cf-connecting-ip': 'x'.repeat(80) }), onRender) === 'local');
    const pk1 = cityPackageByLock(lock), pk2 = cityPackageByLock(lock);
    ok('a ready town\'s CityPackage is read once, not on every ask (the same object while its file is unchanged)', !!pk1 && pk1 === pk2);
    const bid = 'htc-test-1';
    mkdirSync(path.join(cfg.store, 'tiles', bid, 'hg1-conus', '0', '1'), { recursive: true }); writeFileSync(path.join(cfg.store, 'tiles', bid, 'hg1-conus', '0', '1', '2'), 'x');
    ok('the tiles a warm store holds are counted (hg1 ids under tiles/<build>), nothing else', storedTiles(cfg, bid, ['hg1-conus/0/1/2', 'hg1-conus/0/1/3', '../../x']) === 1 && storedTiles(cfg, '../x', ['hg1-conus/0/1/2']) === 0);
    // a cold build that writes nothing is stopped, and says where and why (a stand-in compiler: the descriptor, then silence)
    const fake = path.join(tmp, 'compiler');
    mkdirSync(fake, { recursive: true });
    writeFileSync(path.join(fake, 'compile.py'), `import sys, json, time\nif '--descriptor' in sys.argv:\n    print(json.dumps({'tiles': ['hg1-conus/0/1/2', 'hg1-conus/0/1/3'], 'buildId': '${bid}'})); sys.exit(0)\ntime.sleep(60)\n`);
    rt.queue = []; rt.running = null; rt.build = Promise.resolve(bid); rt.ips = new Map();
    rt.cfg = { ...rt.cfg, compiler: fake, python: 'python3', scratch: path.join(tmp, 'scratch'), stallMs: 1500, jobMs: 60_000, queueMax: 10 };
    const cold = await requestTown('us-4000100', '203.0.113.20');
    let jj: Job | null = null;
    for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 250)); jj = JSON.parse(readFileSync(path.join(cfg.jobs, 'us-4000100.json'), 'utf8')); if (jj!.state === 'error') break; }
    ok('a compile that writes nothing is stopped at HOMETOWN_STALL_SECS, its stage and reason kept', cold.status === 202 && jj?.state === 'error' && jj.reason === 'stalled' && jj.failedAt === 'compiling' && /stopped building streets \(compiling\)/.test(jj.error ?? ''), JSON.stringify(jj).slice(0, 300));
    ok('the warm tile was counted before the compile ran (1 of 2)', jj?.stored === 1 && jj.done === 1 && jj.total === 2, JSON.stringify(jj && { stored: jj.stored, done: jj.done, total: jj.total }));
    const st = await townStatus('us-4000100');
    ok('the card reads the stage it stopped at and "took too long", in a player\'s words', st.status === 409 && (st.body as { stage?: string }).stage === 'Building streets' && (st.body as { error: string }).error === TOWN_WORDS.slow && (st.body as { reason?: string }).reason === 'stalled', JSON.stringify(st.body));
    rt.queue = []; rt.running = null; rt.build = null;
    rmSync(dir, { recursive: true, force: true });
    ok('without its town\'s bundle a hometown pack is refused by the store', !s.open(pack).ok);
    ok('gatePack alone (no table) still refuses a hometown pack', !gatePack(pack).ok && gatePack(pack, { city: cityTableOf(OK) }).ok);
  } finally {
    globalThis.__hometownTowns = was;
    rmSync(tmp, { recursive: true, force: true });
  }

  // ── the words a player reads ──
  const card = readFileSync('app/create/place-search.tsx', 'utf8') + readFileSync('lib/places/request-city.ts', 'utf8');
  const words = [...Object.values(TOWN_WORDS).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v))), ...[...card.matchAll(/'([^'\n]{8,})'|`([^`\n]{8,})`|>([^<>{}\n]{8,})</g)].map((m) => m[1] ?? m[2] ?? m[3])];
  const bad = words.filter((w) => FORBIDDEN.test(w));
  ok('the town card and its messages name no tool, vendor or model (Claude, AI, model, Anthropic, GTA)', words.length > 10 && bad.length === 0, bad.join(' | '));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failures = 0;
  await runTownChecks((name, cond, detail = '') => { if (!cond) failures++; console.log(`${cond ? '  ok  ' : 'FAIL  '}${name}${!cond && detail ? `\n        ${detail}` : ''}`); });
  console.log(`\n${failures ? `${failures} FAILED` : 'all hometown town checks passed'}\n`);
  process.exit(failures ? 1 : 0);
}
