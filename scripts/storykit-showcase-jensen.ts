/**
 * Story Kit: Jensen Heist, GameMog's second showcase story world and its first in a hometown (San Jose, us-0668000, on
 * Mog City's engine; owner-approved 18 Nov 2026: an affectionate parody of a public keynote persona). Like Pickup Time
 * (scripts/storykit-showcase.ts) it is a hand-written pack in the repo (storykit/packs/jensen-heist.json, listed in
 * SHOWCASE_PACKS), gated as a showcase, and published by a migration (deploy/migrate.mjs 2026-11-18-jensen-heist) from
 * the record this script writes:
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-showcase-jensen.ts [--bodies] --export [--voice <dir of rendered clips>]
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
 *   voice  each spoken line's clip, deploy/migrations/jensen-heist/voice/<line hash>-<voice key>.ogg, its length in
 *          JH_VOICE (deploy/migrations/jensen-heist-voice.json: written by --voice, read until the record has them)
 *   world  the sealed runner world, deploy/migrations/jensen-heist/world.json
 * --export refuses while a body or a clip is missing (the bodies and the voices are their own tracks); --draft writes
 * the runner world with the clips that are in (a line without one is a subtitle) and the bodies at the addresses --cast
 * gives, for a play on the Mac. --voice <dir> alone copies the clips in and writes JH_VOICE (the record waits for the
 * bodies); with --export it does that first. --bodies copies the hand-built cast's builds (BODY_SOURCES, the jh-hero
 * track's storykit/handbuilt/...) to BODIES, each inside a body's limits; with --export it does that first, and refuses
 * while one is not built.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
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
/** The clips' lengths and how they were made (written by --voice <dir>, from that folder's manifest.json). */
export const JH_VOICE = `deploy/migrations/${JH_ID}-voice.json`;
/** The town the pack is pinned to: the San Jose build's CityPackage (gzipped JSON). */
export const JH_TOWN = `storykit/showcase/${JH_ID}/town.json.gz`;
/** The seen people's hand-built bodies, by cast id (the hand-built cast's track puts them here). */
export const BODIES: Record<string, string> = Object.fromEntries(['jensen', 'marge', 'nico', 'lola', 'wesley', 'dex', 'intern-a', 'intern-b', 'director-a', 'director-b']
  .map((id) => [id, `public/storykit/cast/hand/jh-${id}.glb`]));
/**
 * Where the hand-built cast's track (branch jh-hero) builds each body: Jensen's own folder and the supporting cast's.
 * `--bodies` copies each one that is in the checkout to BODIES (the address the record and the migration name), as the
 * cast registry ships a new build (storykit/cast/README.md: copy its GLB to public/storykit/cast/hand/). Mr. Board stays
 * Mog City's Mr. Big (cast model mogcity/mrbig) until the owner gives him the hand-built derivative
 * (storykit/handbuilt/board/board.glb): then a sheet, his cast entry without `model`, and a line here.
 */
export const BODY_SOURCES: Record<string, string> = Object.fromEntries(Object.keys(BODIES)
  .map((id) => [id, id === 'jensen' ? 'storykit/handbuilt/jensen/jensen.glb' : `storykit/handbuilt/jensen-cast/${id}.glb`]));
/** A body's limits: what a Mog of the showcase may inherit (lib/storykit-store.ts LIMITS.glb.each, SHOWCASE_LIMITS.glb.total). */
export const BODY_LIMITS = { each: 6 * 1024 * 1024, total: 128 * 1024 * 1024 };
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
  const man = existsSync(JH_VOICE) ? JSON.parse(readFileSync(JH_VOICE, 'utf8')).clips as Record<string, { secs: number }> : null;
  const lengths: Record<string, number> = o.secs ?? (man ? Object.fromEntries(Object.entries(man).map(([k, v]) => [k, v.secs]))
    : Object.fromEntries((old?.files ?? []).filter((f: FileRec) => f.kind === 'voice').map((f: FileRec) => [f.name.replace(/\.ogg$/, ''), f.meta?.secs as number])));
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
  for (const l of plan.lines as any[]) {
    if (l.rec || seen.has(l.clip)) continue;
    seen.add(l.clip);
    const src = `${JH_DIR}/voice/${l.clip}.ogg`;
    if (o.draft && (!existsSync(src) || !(lengths[l.clip] > 0))) continue;
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
  out.push(...jhVoiceProblems(G.g.pack!, G.town));
  out.push(...jhBodyProblems().problems);
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

/**
 * The bodies before the record: each one at BODIES is a GLB inside a body's limits (BODY_LIMITS), and, where its source
 * (BODY_SOURCES) is in the checkout, the same bytes as it (a new build of a body means `--bodies` again). Returns the
 * problems and how many of the bodies are in. None in is not a problem: the record waits for them.
 */
export function jhBodyProblems(): { problems: string[]; in: number; sources: number } {
  const out: string[] = [];
  let n = 0, src = 0, total = 0;
  for (const [id, dst] of Object.entries(BODIES)) {
    const from = BODY_SOURCES[id];
    if (from && existsSync(from)) src++;
    if (!existsSync(dst)) continue;
    n++;
    const b = readFileSync(dst);
    total += b.length;
    if (b.length < 12 || b.readUInt32LE(0) !== 0x46546c67) out.push(`${dst}: not a GLB`);
    if (b.length > BODY_LIMITS.each) out.push(`${dst}: ${b.length} bytes, over a body's ${BODY_LIMITS.each} (a Mog could not inherit it)`);
    if (from && existsSync(from) && sha(readFileSync(from)) !== sha(b)) out.push(`${dst} is not ${from} (run --bodies)`);
  }
  if (total > BODY_LIMITS.total) out.push(`the bodies are ${total} bytes, over ${BODY_LIMITS.total}`);
  return { problems: out.slice(0, 8), in: n, sources: src };
}

/**
 * The voices before the record (the bodies are their own track): every clip in deploy/migrations/jensen-heist/voice is
 * one a line of the plan plays, a real Ogg under the store's clip limit, with its length in JH_VOICE; all of them inside
 * a world's voice limits (lib/storykit-store.ts LIMITS.voice). A line with no clip yet is not a problem (a subtitle).
 */
export function jhVoiceProblems(pack: any, town: CityPackage): string[] {
  const dir = `${JH_DIR}/voice`, out: string[] = [];
  if (!existsSync(dir)) return out;
  if (!existsSync(JH_VOICE)) return [`${dir} has clips but ${JH_VOICE} is missing (run --voice <dir>)`];
  const man = JSON.parse(readFileSync(JH_VOICE, 'utf8')).clips as Record<string, { secs: number }>;
  const want = new Set((voicePlanOf(pack, '', cityTableOf(town)).lines as any[]).filter((l) => !l.rec).map((l) => l.clip));
  let bytes = 0, n = 0;
  for (const f of readdirSync(dir)) {
    const base = f.replace(/\.ogg$/, '');
    if (!want.has(base)) { out.push(`${dir}/${f}: no line of the plan plays it`); continue; }
    const b = readFileSync(`${dir}/${f}`);
    if (String.fromCharCode(...b.subarray(0, 4)) !== 'OggS') out.push(`${dir}/${f}: not an Ogg file`);
    if (b.length > 2 * 1024 * 1024) out.push(`${dir}/${f}: ${b.length} bytes, over the 2 MB clip limit`);
    if (!(man[base]?.secs > 0 && man[base].secs <= 120)) out.push(`${dir}/${f}: no length in ${JH_VOICE}`);
    bytes += b.length; n++;
  }
  if (bytes > 24 * 1024 * 1024 || n > 1500) out.push(`${dir}: ${n} clips, ${bytes} bytes: a world's voice is at most 1500 clips and 24 MB`);
  return out.slice(0, 8);
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
  const vi = args.indexOf('--voice');
  if (!args.includes('--export') && vi < 0 && !args.includes('--bodies')) { console.error('usage: storykit-showcase-jensen.ts [--bodies] [--voice <dir>] --export | --bodies | --voice <dir> | --draft <out.json> [--cast id=url,...]'); process.exit(2); }
  if (args.includes('--bodies')) {
    // (the hand-built cast's builds, from jh-hero once it is merged, to the addresses the record names)
    const missing: string[] = [];
    let n = 0;
    for (const [id, dst] of Object.entries(BODIES)) {
      const from = BODY_SOURCES[id];
      if (!from || !existsSync(from)) { missing.push(`${id} (${from})`); continue; }
      const b = readFileSync(from);
      if (b.length < 12 || b.readUInt32LE(0) !== 0x46546c67) { console.error(`${from}: not a GLB`); process.exit(1); }
      // (never copied over a body's limit: a Mog inherits every body, so it is slimmed at its source first)
      if (b.length > BODY_LIMITS.each) { console.error(`${from}: ${b.length} bytes, over a body's ${BODY_LIMITS.each}: not copied`); process.exit(1); }
      mkdirSync('public/storykit/cast/hand', { recursive: true });
      copyFileSync(from, dst); n++;
    }
    const bp = jhBodyProblems();
    console.log(`copied ${n} bodies to public/storykit/cast/hand/jh-*.glb${missing.length ? `; ${missing.length} not built yet: ${missing.join(', ')}` : ''}`);
    if (bp.problems.length) { console.error(bp.problems.join('\n')); process.exit(1); }
    if (missing.length && args.includes('--export')) { console.error(`--export needs every body: ${missing.length} missing`); process.exit(1); }
    if (!args.includes('--export') && vi < 0) process.exit(0);
  }
  let secs: Record<string, number> | undefined;
  if (vi >= 0) {
    const from = args[vi + 1];
    const M = JSON.parse(readFileSync(join(from, 'manifest.json'), 'utf8')), man = M.clips as Record<string, { secs: number }>;
    const { town, g } = jhGate();
    if (!g.ok || !g.pack) { console.error(g.problems.join('\n')); process.exit(1); }
    mkdirSync(`${JH_DIR}/voice`, { recursive: true });
    secs = {};
    let n = 0;
    const lines = voicePlanOf(g.pack, '', cityTableOf(town)).lines as any[], want = new Set(lines.map((l) => l.clip));
    const missing: string[] = [], keep: Record<string, unknown> = {};
    for (const l of lines) {
      if (l.rec || secs[l.clip] || missing.includes(l.clip)) continue;
      const src = join(from, `${l.clip}.ogg`);
      if (!existsSync(src) || !(man[l.clip]?.secs > 0)) { missing.push(l.clip); continue; }
      copyFileSync(src, `${JH_DIR}/voice/${l.clip}.ogg`); secs[l.clip] = man[l.clip].secs; keep[l.clip] = man[l.clip]; n++;
    }
    // (a clip of a line that changed or went: its line plays no more, so it goes)
    for (const f of readdirSync(`${JH_DIR}/voice`)) if (!want.has(f.replace(/\.ogg$/, ''))) unlinkSync(`${JH_DIR}/voice/${f}`);
    const sorted = Object.fromEntries(Object.entries(keep).sort(([a], [b]) => (a < b ? -1 : 1)));
    writeFileSync(JH_VOICE, JSON.stringify({ v: 1, model: M.model, loudness: M.loudness, credit: M.credit, clips: sorted }, null, 1) + '\n');
    console.log(`copied ${n} clips into ${JH_DIR}/voice and wrote ${JH_VOICE}${missing.length ? `; ${missing.length} lines have no clip yet (subtitles): ${missing.slice(0, 3).join(' ')}` : ''}`);
    if (!args.includes('--export')) process.exit(0);
    if (missing.length) { console.error(`--export needs every clip: ${missing.length} missing`); process.exit(1); }
  }
  const w = jhWorld({ secs });
  mkdirSync(JH_DIR, { recursive: true });
  writeFileSync(JH_RECORD, w.record);
  writeFileSync(`${JH_DIR}/world.json`, w.world);
  const rec = JSON.parse(w.record);
  console.log(`wrote ${JH_RECORD} and ${JH_DIR}/world.json: ${rec.files.length} files, world ${rec.world.bytes} bytes (${rec.world.hash.slice(0, 12)})`);
}
