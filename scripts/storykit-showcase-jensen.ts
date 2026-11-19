/**
 * Story Kit: Jensen Heist, GameMog's second showcase story world and its first in a hometown (San Jose, us-0668000, on
 * Mog City's engine; owner-approved 18 Nov 2026: an affectionate parody of a public keynote persona). Like Pickup Time
 * (scripts/storykit-showcase.ts) it is a hand-written pack in the repo (storykit/packs/jensen-heist.json, listed in
 * SHOWCASE_PACKS), gated as a showcase, and published by a migration (deploy/migrate.mjs 2026-11-18-jensen-heist) from
 * the record this script writes:
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-showcase-jensen.ts --export [--voice <dir of rendered clips>]
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-showcase-jensen.ts --draft <out.json> [--cast <id=url,...>]
 *
 * Unlike Pickup Time it plays in a town compiled from open data, so it is gated with the town's table
 * (storykit/hometown/hometown-gate.ts gateHometown, showcase: true): every place a key of the town's frame, the
 * real-place safety rules, the spawn-district rule, the reach rule. The town is TOWN: the CityPackage of the San Jose
 * build the pack is pinned to (its base.hometown). A new production build of the town (compiler 0.14.0 and its image)
 * means a new pin: the frame's package written over TOWN, the pack's base.hometown copied from it, the pack gated again.
 *
 * The record names every file by its SHA-256, as Pickup Time's does:
 *   glb    each seen person's hand-built body (BODIES: public/storykit/cast/hand/jh-<id>.glb, the hand-built cast's
 *          track). Mr. Board is Mog City's own Mr. Big (cast model mogcity/mrbig, renamed): no file.
 *   voice  each spoken line's clip, deploy/migrations/jensen-heist/voice/<line hash>-<voice key>.ogg
 *   world  the sealed runner world, deploy/migrations/jensen-heist/world.json
 * --export refuses while a body or a clip is missing (the bodies and the voices are their own tracks); --draft writes
 * the runner world without them (subtitles, and the bodies at the addresses --cast gives) for a play on the Mac.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { toRunnerPack } from '../storykit/pack/gate.ts';
import { voicePlanOf } from '../storykit/pack/runner.ts';
import { gateHometown, cityTableOf } from '../storykit/hometown/hometown-gate.ts';
import { cityLock, townName, type CityPackage } from '../storykit/hometown/city-package.ts';
import { inheritance, storykitMeta } from '../lib/storykit-build.ts';
import { phoneLines } from './storykit-showcase.ts';

export const JH_ID = 'jensen-heist';
/** The game's id (fixed, as every first-party world's is). */
export const JH_GAME = 'c4a1e7d2-6b3f-4f0a-9d58-3e2b71a90f6c';
export const JH_RECORD = `deploy/migrations/${JH_ID}-story.json`;
export const JH_DIR = `deploy/migrations/${JH_ID}`;
export const JH_PACK = `storykit/packs/${JH_ID}.json`;
/** The town the pack is pinned to: the San Jose build's CityPackage (gzipped JSON). */
export const JH_TOWN = `storykit/showcase/${JH_ID}/town.json.gz`;
/** The seen people's hand-built bodies, by cast id (the hand-built cast's track puts them here). */
export const BODIES: Record<string, string> = Object.fromEntries(['jensen', 'marge', 'nico', 'lola', 'wesley', 'dex', 'intern-a', 'intern-b', 'director-a', 'director-b']
  .map((id) => [id, `public/storykit/cast/hand/jh-${id}.glb`]));
const BLURB = "Ten hours before the biggest keynote of his life, Jensen opens his oven on a live stream and finds it empty: the only prototype of the fastest chip ever made is gone, and Mr. Board wants his stage. Eight missions across San Jose, every conversation a video call.";
/** The parody's credit line (PLAN.md decision 3; the owner's to approve). */
export const JH_CREDIT = "A parody of a public figure's public keynote persona. Not endorsed. Built from CC0 MakeHuman parts.";

const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const blobUrl = (hash: string, ext: string) => `/storykit/f/${hash}.${ext}`;
type FileRec = { kind: 'glb' | 'voice'; name: string; hash: string; ext: string; bytes: number; src: string; meta?: Record<string, unknown> };

export const jhTown = (): CityPackage => JSON.parse(gunzipSync(readFileSync(JH_TOWN)).toString('utf8'));

/** The pack gated in its town as a showcase: { ok, problems, warnings, pack, lines, ... } and the town. */
export function jhGate() {
  const town = jhTown(), raw = JSON.parse(readFileSync(JH_PACK, 'utf8'));
  return { town, raw, g: gateHometown(raw, town, { showcase: true }) };
}

/**
 * The world as the migration publishes it (or, draft, as a play on the Mac reads it: no clips, the bodies at `cast`).
 * Throws when the pack is refused, or (not a draft) a body or a clip is missing.
 */
export function jhWorld(o: { secs?: Record<string, number>; draft?: boolean; cast?: Record<string, string> } = {}) {
  const { town, g } = jhGate();
  if (!g.ok || !g.pack) throw new Error(`${JH_ID} is refused: ${g.problems.slice(0, 3).join(' | ')}`);
  const pack = g.pack;
  const pin = JSON.stringify(cityLock(town)), base = JSON.stringify(pack.base.hometown);
  if (pin !== base) throw new Error(`${JH_ID}: base.hometown is not ${JH_TOWN}'s pin (re-pin the pack to the town)`);
  const old = existsSync(JH_RECORD) ? JSON.parse(readFileSync(JH_RECORD, 'utf8')) : null;
  const lengths: Record<string, number> = o.secs ?? Object.fromEntries((old?.files ?? []).filter((f: FileRec) => f.kind === 'voice').map((f: FileRec) => [f.name.replace(/\.ogg$/, ''), f.meta?.secs as number]));
  const files: FileRec[] = [];
  for (const c of pack.cast) {
    if (c.voiceOnly || c.model) continue;
    const src = BODIES[c.id];
    if (!src || !existsSync(src)) { if (o.draft) continue; throw new Error(`${src || c.id}: no hand-built body for ${c.id}`); }
    const b = readFileSync(src);
    files.push({ kind: 'glb', name: c.id, hash: sha(b), ext: 'glb', bytes: b.length, src });
  }
  const plan = voicePlanOf(pack, '', cityTableOf(town));
  const seen = new Set<string>();
  if (!o.draft) for (const l of plan.lines as any[]) {
    if (l.rec || seen.has(l.clip)) continue;
    seen.add(l.clip);
    const src = `${JH_DIR}/voice/${l.clip}.ogg`;
    if (!existsSync(src)) throw new Error(`${src}: no clip for ${l.id} ("${l.text.slice(0, 40)}")`);
    const b = readFileSync(src);
    if (String.fromCharCode(...b.subarray(0, 4)) !== 'OggS') throw new Error(`${src}: not an Ogg file`);
    const s = lengths[l.clip];
    if (!(s > 0 && s <= 120)) throw new Error(`${src}: no length for it`);
    files.push({ kind: 'voice', name: `${l.clip}.ogg`, hash: sha(b), ext: 'ogg', bytes: b.length, src, meta: { line: l.id, who: l.who, voice: l.voice, codec: 'opus', secs: s } });
  }
  files.sort((a, b) => (a.kind === b.kind ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : a.kind < b.kind ? -1 : 1));
  const cast: Record<string, string> = { ...(o.cast || {}) }, clips: Record<string, unknown> = {};
  for (const f of files) {
    if (f.kind === 'glb') cast[f.name] = blobUrl(f.hash, f.ext);
    else clips[f.name.replace(/\.ogg$/, '')] = { file: f.name, url: blobUrl(f.hash, f.ext), bytes: f.bytes, ...f.meta };
  }
  const phone = phoneLines(pack);
  const voice = { ...plan, lines: (plan.lines as any[]).map((l) => (phone.has(l.id) ? { ...l, fx: 'phone' } : l)), clips };
  const world = { ...toRunnerPack(pack, { cast, clips: 'cast/cast-clips.glb', townName: townName(town) }), voice };
  const worldBytes = JSON.stringify(world);
  const meta = storykitMeta(pack, { tagline: pack.tagline, blurb: BLURB, people: [], brands: [] }, inheritance(pack, g.lines, null), '');
  Object.assign(meta.storykit as Record<string, unknown>, { showcase: true, credit: JH_CREDIT });
  const record = { v: 1, id: JH_GAME, slug: JH_ID, pack, meta, world: { hash: sha(worldBytes), bytes: Buffer.byteLength(worldBytes) }, files };
  return { record: JSON.stringify(record) + '\n', world: worldBytes, warnings: g.warnings, plan };
}

/**
 * What `npm run check` asks: the pack passes its town's gate as a showcase, pinned to that town; and once the record is
 * written (the bodies and the voices are in), the record and the world are what the repo makes now. Before that, the
 * migration waits for the record, and only the pack is held.
 */
export function jhProblems(): string[] {
  const out: string[] = [];
  let G: ReturnType<typeof jhGate>;
  try { G = jhGate(); } catch (e) { return [(e as Error).message]; }
  if (!G.g.ok) return G.g.problems.slice(0, 5).map((p) => `${JH_ID}: ${p}`);
  if (JSON.stringify(cityLock(G.town)) !== JSON.stringify(G.g.pack!.base.hometown)) out.push(`${JH_ID}: base.hometown is not ${JH_TOWN}'s pin`);
  if (!existsSync(JH_RECORD)) return out;
  let w: ReturnType<typeof jhWorld>;
  try { w = jhWorld(); } catch (e) { return [...out, (e as Error).message]; }
  if (readFileSync(JH_RECORD, 'utf8') !== w.record) out.push(`${JH_RECORD} is not current`);
  if (!existsSync(`${JH_DIR}/world.json`) || readFileSync(`${JH_DIR}/world.json`, 'utf8') !== w.world) out.push(`${JH_DIR}/world.json is not current`);
  const rec = JSON.parse(w.record), names = new Set(rec.files.filter((f: FileRec) => f.kind === 'voice').map((f: FileRec) => f.name));
  const extra = existsSync(`${JH_DIR}/voice`) ? readdirSync(`${JH_DIR}/voice`).filter((f) => !names.has(f)) : [];
  if (extra.length) out.push(`${JH_DIR}/voice holds ${extra.length} clips no line plays (${extra.slice(0, 3).join(' ')})`);
  for (const k of ['cover', 'wide', 'icon', 'sky']) if (!existsSync(`deploy/migrations/${JH_ID}-${k}.jpg`)) out.push(`deploy/migrations/${JH_ID}-${k}.jpg is missing`);
  if (rec.world.bytes > 640_000) out.push(`the world is ${rec.world.bytes} bytes: a sealed world is at most 640000`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const di = args.indexOf('--draft');
  if (di >= 0) {
    const ci = args.indexOf('--cast');
    const cast = ci >= 0 ? Object.fromEntries(String(args[ci + 1]).split(',').filter(Boolean).map((kv) => kv.split('=') as [string, string])) : {};
    const w = jhWorld({ draft: true, cast });
    writeFileSync(args[di + 1], w.world);
    const ls = w.plan.lines as any[];
    console.log(`wrote ${args[di + 1]}: ${w.world.length} bytes, ${ls.length} spoken lines (${new Set(ls.filter((l) => !l.rec).map((l) => l.clip)).size} clips to record)`);
    process.exit(0);
  }
  if (!args.includes('--export')) { console.error('usage: storykit-showcase-jensen.ts --export [--voice <dir>] | --draft <out.json> [--cast id=url,...]'); process.exit(2); }
  const vi = args.indexOf('--voice');
  let secs: Record<string, number> | undefined;
  if (vi >= 0) {
    const from = args[vi + 1];
    const man = JSON.parse(readFileSync(join(from, 'manifest.json'), 'utf8')).clips as Record<string, { secs: number }>;
    const { town, g } = jhGate();
    if (!g.ok || !g.pack) { console.error(g.problems.join('\n')); process.exit(1); }
    mkdirSync(`${JH_DIR}/voice`, { recursive: true });
    secs = {};
    let n = 0;
    for (const l of voicePlanOf(g.pack, '', cityTableOf(town)).lines as any[]) {
      if (l.rec || secs[l.clip]) continue;
      const src = join(from, `${l.clip}.ogg`);
      if (!existsSync(src)) { console.error(`no clip ${l.clip}.ogg for ${l.id}`); process.exit(1); }
      copyFileSync(src, `${JH_DIR}/voice/${l.clip}.ogg`); secs[l.clip] = man[l.clip]?.secs; n++;
    }
    console.log(`copied ${n} clips into ${JH_DIR}/voice`);
  }
  const w = jhWorld({ secs });
  mkdirSync(JH_DIR, { recursive: true });
  writeFileSync(JH_RECORD, w.record);
  writeFileSync(`${JH_DIR}/world.json`, w.world);
  const rec = JSON.parse(w.record);
  console.log(`wrote ${JH_RECORD} and ${JH_DIR}/world.json: ${rec.files.length} files, world ${rec.world.bytes} bytes (${rec.world.hash.slice(0, 12)})`);
}
