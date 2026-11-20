// Hand-built cast: a hand-built person's test world for Mog City's runner. Gates storykit/handbuilt/<who>/test-hand-*.json
// (the hand-built person as the hero: walk, a close-up talk, a drive, a fight), writes its runner pack as a local test
// world beside a copy of the shipped body (MogCity-storykit tools/storyrun/test-packs/hand-<who>/, untracked there).
//   node --import ./scripts/ts-resolve.mjs scripts/handbuilt/ingame-world.mts <mogcity checkout> [who]   (or env MOGCITY_RUNNER)
//   who: young-hero (default; its world folder stays hand-hero), young-mother, old-boss, pedro, agnes, milo
// Then serve the checkout (python3 -m http.server <port> --bind 127.0.0.1) and drive it with scripts/handbuilt/ingame.mts.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { gatePack, toRunnerPack } from '../../storykit/pack/gate.ts';
import { voicePlanOf } from '../../storykit/pack/runner.ts';
import { modelOf } from '../../storykit/pack/registry.ts';
const ROOT = new URL('../../', import.meta.url).pathname, MC = process.argv[2] || process.env.MOGCITY_RUNNER || '', WHO = process.argv[3] || 'young-hero';
if (!MC || !/^[a-z-]+$/.test(WHO)) { console.log('usage: ingame-world.mts <a Mog City checkout with the story runner (wagmi/storyrun)> [who]'); process.exit(2); }
const SRC = `${ROOT}storykit/handbuilt/${WHO}/`, file = readdirSync(SRC).find((f) => /^test-hand-.*\.json$/.test(f));
if (!file) { console.log('no test-hand-*.json in', SRC); process.exit(2); }
const P = JSON.parse(readFileSync(SRC + file, 'utf8'));
const g = gatePack(P);
if (!g.ok) { console.log('refused', g.problems); process.exit(1); }
const hero = g.pack.cast.find((c: any) => c.id === g.pack.hero), m = modelOf(hero.model)!, glb = m.glb!.split('/').pop()!;
const D = `${MC}/tools/storyrun/test-packs/${WHO === 'young-hero' ? 'hand-hero' : 'hand-' + WHO}/`; mkdirSync(D, { recursive: true });
const w = { ...toRunnerPack(g.pack, { cast: { [hero.id]: glb } }), voice: { ...voicePlanOf(g.pack, ''), clips: {} } };
writeFileSync(D + 'world.json', JSON.stringify(w, null, 1));
copyFileSync(ROOT + 'public/storykit/' + m.glb, D + glb);
console.log(D + 'world.json', 'hero', w.hero, JSON.stringify(w.cast[w.hero]), g.warnings.length ? g.warnings : '');
