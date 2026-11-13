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
import { canonicalBox, TOWN_WORDS, cityPackageByLock, bundleFile } from '../lib/hometown/towns.ts';
import { townsConfig } from '../lib/hometown/config.ts';
import { storyFrameQuery } from '../lib/storykit-publish.ts';
import { StoryStore } from '../lib/storykit-store.ts';
import { placeById } from '../lib/places/search.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;
const F = 'storykit/hometown/fixtures/';
const R = (p: string) => JSON.parse(readFileSync(F + p, 'utf8'));
const reply = (r: { meta: unknown; pack: unknown }) => '```json\n' + JSON.stringify(r.meta) + '\n```\n\n```json\n' + JSON.stringify(r.pack) + '\n```';
/** Words a player never reads on GameMog (the owner's rule): the tools and vendors behind a town or a story. */
export const FORBIDDEN = /\b(claude|anthropic|ai|a\.i\.|model|llm|gta|gen z quant|opus|sonnet)\b/i;

export function runTownChecks(ok: Ok) {
  console.log('\nHometown towns: one place id, the lock adapter, the town bundle, a hometown story to the play address (lib/hometown)');
  const OK: CityPackage = R('okemah-us-4054200.citypackage.json');
  const lock = cityLock(OK);

  // ── one place id ──
  const okemah = placeById('us-4054200');
  ok('the search\'s place id is the town\'s id everywhere: us-4054200 is Okemah, OK', !!okemah && okemah.name === 'Okemah' && okemah.state === 'OK' && OK.placeId === 'us-4054200' && lock.place === 'us-4054200');
  ok('the compiler\'s old dev id maps to it; bare test boxes have none', canonicalPlaceId('okemah') === 'us-4054200' && canonicalPlaceId('us-4054200') === 'us-4054200' && canonicalPlaceId('phoenix') === null && !TOWN_ID.test('us-ok-okemah'));
  const box = okemah ? canonicalBox(okemah) : [0, 0, 0, 0];
  ok('the canonical box is the search\'s box, at most 4,500 m a side, to 1e-5 degrees', !!okemah && box[0] <= okemah.lon && box[2] >= okemah.lon && (box[3] - box[1]) * 111_320 <= 4501 && box.every((v) => Math.round(v * 1e5) / 1e5 === v));
  const big = canonicalBox({ lat: 40, lon: -100, bbox: [-101, 39, -99, 41] });
  ok('a sprawling place\'s box is capped at 4,500 m a side', Math.abs((big[3] - big[1]) * 111_320 - 4500) < 2 && Math.abs((big[2] - big[0]) * 111_320 * Math.cos((40 * Math.PI) / 180) - 4500) < 2);

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
    storyFrameQuery('hometown', lock) === `city=pkg&town=us-4054200&tc=${lock.compiler}&ts=${lock.tiles}&` && storyFrameQuery('ny') === '' && storyFrameQuery('sf') === 'city=sf&' && storyFrameQuery('hometown', null) === '');

  // the store: gates the pack with its town's table (read by its lock from the bundles), seals the runner pack with it
  const tmp = mkdtempSync(path.join(tmpdir(), 'hometown-towns-'));
  const was = globalThis.__hometownTowns;
  try {
    const cfg = { ...townsConfig(), root: tmp, bundles: path.join(tmp, 'bundles'), jobs: path.join(tmp, 'jobs'), ready: path.join(tmp, 'ready') };
    globalThis.__hometownTowns = { cfg, queue: [], running: null, build: null, ips: new Map(), booted: true };
    const dir = path.join(cfg.bundles, lock.compiler, lock.place, lock.tiles);
    mkdirSync(path.join(dir, 'data'), { recursive: true });
    writeFileSync(path.join(dir, 'citypackage.json'), JSON.stringify(OK));
    writeFileSync(path.join(dir, 'lock.json'), JSON.stringify(svc));
    ok('cityPackageByLock reads the town by its lock, and nothing for a moved lock', !!cityPackageByLock(lock) && cityPackageByLock({ ...lock, tiles: 'e'.repeat(64) }) === null && cityPackageByLock({ ...lock, k0: 1 }) === null);
    ok('/towns serves stored bundle files only (no build, no other names)', !!bundleFile([lock.place, lock.compiler, lock.tiles, 'citypackage.json']) && bundleFile([lock.place, lock.compiler, lock.tiles, 'geodata.json']) === null
      && bundleFile([lock.place, lock.compiler, lock.tiles, '..', 'x']) === null && bundleFile(['okemah', lock.compiler, lock.tiles, 'lock.json']) === null);
    const s = new StoryStore(path.join(tmp, 'store'));
    const o = s.open(pack);
    ok('the store opens a hometown pack (gated with its town\'s table)', o.ok, o.ok ? '' : `${o.error} ${(o as { problems?: string[] }).problems?.slice(0, 2).join(' | ')}`);
    if (o.ok) {
      const w = s.world(o.id) as Record<string, any>;
      ok('the store\'s sealed world names the town (hometown, missions in Okemah)', JSON.stringify(w.hometown) === JSON.stringify(lock) && w.missions.every((m: { city: string }) => m.city === 'Okemah, Oklahoma'));
    }
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
  runTownChecks((name, cond, detail = '') => { if (!cond) failures++; console.log(`${cond ? '  ok  ' : 'FAIL  '}${name}${!cond && detail ? `\n        ${detail}` : ''}`); });
  console.log(`\n${failures ? `${failures} FAILED` : 'all hometown town checks passed'}\n`);
  process.exit(failures ? 1 : 0);
}
