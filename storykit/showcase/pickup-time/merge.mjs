// Pickup Time: join top.json + act1/2/3.json (the generators' output, in the repo's .scratch/showcase/pickup-time, or
// PT_OUT) into storykit/packs/pickup-time.json and gate it as a showcase. From the GameMog checkout:
//   node --import ./scripts/ts-resolve.mjs storykit/showcase/pickup-time/merge.mjs [--act act2] [--runner <out.json>] [--no-write]
// --act actN : only top + that act (a one-act pack, for iterating; never written to storykit/packs)
// --runner p : also write the runner world (toRunnerPack, hand-built GLBs as cast/<file>.glb beside it) to p
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const GM = path.resolve(HERE, '..', '..', '..');   // the GameMog checkout
const FRAG = process.env.PT_OUT || path.join(GM, '.scratch', 'showcase', 'pickup-time');
const { gatePack, toRunnerPack } = await import(`${GM}/storykit/pack/gate.ts`);
// the voices (voice-attach.mjs): casting.json's blocks on the cast, the voice plan and its clips on the runner world
const { castVoices, attachVoice } = await import(path.join(HERE, 'voice-attach.mjs'));
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const only = opt('--act'), runnerOut = opt('--runner'), noWrite = args.includes('--no-write') || !!only;

const top = JSON.parse(readFileSync(path.join(FRAG, 'top.json'), 'utf8'));
const acts = (only ? [only] : ['act1', 'act2', 'act3']).map((a) => {
  const f = path.join(FRAG, `${a}.json`);
  if (!existsSync(f)) { console.log(`(no ${a}.json yet: left out)`); return null; }
  return { name: a, ...JSON.parse(readFileSync(f, 'utf8')) };
}).filter(Boolean);

const errors = [];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pack = { ...top, places: { ...top.places }, cast: [...top.cast], vehicles: [...top.vehicles], acts: [] };
for (const a of acts) {
  if (!a.act?.id || !Array.isArray(a.act.missions)) { errors.push(`${a.name}.json: no "act" with an id and missions`); continue; }
  pack.acts.push(a.act);
  for (const [k, v] of Object.entries(a.places || {})) {
    if (pack.places[k] && !same(pack.places[k], v)) errors.push(`${a.name}.json: place "${k}" differs from one already defined`);
    pack.places[k] = v;
  }
  for (const c of a.cast || []) {
    const old = pack.cast.find((x) => x.id === c.id);
    if (old && !same(old, c)) errors.push(`${a.name}.json: cast "${c.id}" differs from one already defined`);
    if (!old) pack.cast.push(c);
  }
  for (const v of a.vehicles || []) {
    const old = pack.vehicles.find((x) => x.id === v.id);
    if (old && !same(old, v)) errors.push(`${a.name}.json: vehicle "${v.id}" differs from one already defined`);
    if (!old) pack.vehicles.push(v);
  }
}
const ids = pack.acts.flatMap((a) => a.missions.map((m) => m.id));
const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
if (dup.length) errors.push(`mission ids twice: ${dup.join(' ')}`);
for (const e of errors) console.log('MERGE', e);

castVoices(pack);
const r = gatePack(pack, { showcase: true });
console.log(`missions ${ids.join(' ')} · ${JSON.stringify(pack).length} bytes · ${r.lines?.length ?? 0} spoken lines`);
for (const p of r.problems) console.log('PROBLEM', p);
for (const w of r.warnings) console.log('warn', w);
for (const c of r.clamped) console.log('clamped', c);
console.log(r.ok && !errors.length ? 'GATE OK' : `GATE REFUSED (${r.problems.length} problems, ${errors.length} merge errors)`);
if (r.ok && !noWrite) {
  writeFileSync(`${GM}/storykit/packs/pickup-time.json`, JSON.stringify(r.pack) + '\n');
  console.log('wrote storykit/packs/pickup-time.json');
}
if (r.ok && runnerOut) {
  const reg = JSON.parse(readFileSync(`${GM}/public/storykit/cast/registry.json`, 'utf8')).models;
  const cast = {};
  for (const c of r.pack.cast) if (c.model && reg[c.model]?.built === 'hand') cast[c.id] = `cast/${path.basename(reg[c.model].glb)}`;
  // a forged person (a sheet): the GLB npm run storykit:pack built, copied beside the runner world
  for (const c of r.pack.cast) { const g = `${GM}/public/storykit/cast/pickup-time/${c.id}.glb`; if (c.sheet && existsSync(g)) { mkdirSync(path.join(path.dirname(runnerOut), 'cast'), { recursive: true }); copyFileSync(g, path.join(path.dirname(runnerOut), 'cast', `${c.id}.glb`)); cast[c.id] = `cast/${c.id}.glb`; } }
  mkdirSync(path.dirname(runnerOut), { recursive: true });
  const world = toRunnerPack(r.pack, { cast });
  await attachVoice(world, r.pack, runnerOut);
  writeFileSync(runnerOut, JSON.stringify(world, null, 1));
  console.log(`wrote runner world ${runnerOut} (hand-built GLBs expected beside it: ${[...new Set(Object.values(cast))].join(' ')})`);
}
process.exit(r.ok && !errors.length ? 0 : 1);
