/**
 * The hometown store's GC, on the server's own disk (a Render shell: cd /opt/render/project/src). A DRY RUN unless
 * --apply is given with the plan id the dry run printed (so nothing goes that the owner did not see):
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/hometown-gc.ts [--target-gb 1.5]           the plan, deletes nothing
 *   node --import ./scripts/ts-resolve.mjs scripts/hometown-gc.ts --apply <planId> [same args]
 *
 * Never collected: the current build (HOMETOWN_BUILD, else the newest) and every build a world pins (gamemog.db and
 * data/storykit, drafts included; lib/hometown-tiles/pins.ts). The same as GET/POST /api/hometown/admin/gc.
 */
import { parseArgs } from 'node:util';
import { hometownConfig, hometownStore } from '../lib/hometown-tiles/config.ts';
import { planGc, applyGc } from '../lib/hometown-tiles/gc.ts';
import { gatherPins } from '../lib/hometown-tiles/pins.ts';
import { currentBuilds, currentFrom } from '../lib/hometown-tiles/http.ts';
import { GB } from '../lib/hometown-tiles/store.ts';

const { values: o } = parseArgs({ options: { 'target-gb': { type: 'string' }, apply: { type: 'string' }, 'dry-run': { type: 'boolean' }, keys: { type: 'boolean' } } });
// (a target that is not a number of GB, 0 or more, is refused here: NaN once planned to collect every unpinned build)
const tg = o['target-gb'];
if (tg != null && !(tg.trim() !== '' && Number.isFinite(Number(tg)) && Number(tg) >= 0)) { console.error(`--target-gb ${JSON.stringify(tg)}: a number of GB, 0 or more`); process.exit(2); }
const cfg = hometownConfig();
const store = hometownStore(cfg);
const pins = gatherPins(cfg.dataDir);
const plan = planGc({ entries: store.list(), tmp: store.tmpFiles(), current: currentBuilds(store, cfg), pins: pins.builds, pinsOk: pins.ok,
  pinSources: [...pins.sources, ...pins.errors.map((e) => `ERROR ${e}`)], lastServed: store.lastServed(), targetBytes: tg != null ? Number(tg) * GB : null, currentFrom: currentFrom(cfg) });
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
console.log(`hometown store ${store.root}: ${mb(plan.totalBytes)} (cap ${mb(cfg.capBytes)})`);
console.log(`current build(s): ${plan.builds.filter((b) => b.status === 'current').map((b) => b.buildId).join(', ') || 'none'} (${plan.currentFrom})`);
console.log(`pins read from: ${plan.pinSources.join('; ') || '(no database or Story Kit store here)'}; pinned builds: ${[...pins.builds].join(', ') || 'none'}`);
for (const b of plan.builds) console.log(`  ${b.status.padEnd(8)} ${b.buildId}  ${String(b.objects).padStart(6)} objects  ${mb(b.bytes).padStart(10)}  last served ${b.lastServed ? new Date(b.lastServed).toISOString() : 'never'}`);
console.log(`would delete: ${plan.delete.keys.length} objects in ${plan.delete.builds.length} build(s), ${mb(plan.delete.bytes)}; ${plan.tmp.keys.length} stale temp files, ${mb(plan.tmp.bytes)}; after: ${mb(plan.afterBytes)}`);
if (o.keys) for (const k of plan.delete.keys) console.log(`  - ${k}`);
if (plan.refused) console.log(`REFUSED: ${plan.refused}`);
if (!o.apply || o['dry-run']) { console.log(`dry run: nothing deleted. To apply exactly this plan: --apply ${plan.planId}`); process.exit(0); }
const r = applyGc(store, plan, o.apply);
console.log(`applied plan ${plan.planId}: ${r.deleted} files, ${mb(r.bytes)} freed`);
