/**
 * Story Kit: GameMog's own showcase story world, published (7 Nov; the owner: Pickup Time, the first first-party
 * showcase, public at /g/pickup-time). Production gets it from deploy/migrate.mjs (2026-11-07-pickup-time), which reads
 * the record this script writes; `npm run check` holds the record current (scripts/storykit-pack-check.ts).
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-showcase.ts --export [--voice <dir of rendered clips>]
 *
 * A showcase (SHOWCASE_PACKS) is gated as one ({ showcase: true }), an exemption the store's open never passes, so the
 * migration writes the store draft itself, as 2026-11-05-mog-city-own-story does. Unlike Mog City's own world it has
 * files of its own, and the record names every one by its SHA-256 (the migration refuses a file whose bytes differ):
 *   glb    each seen person's hand-built body, the cast registry's GLB in the build (public/storykit/cast/hand/...)
 *   voice  each spoken line's clip, deploy/migrations/<id>/voice/<line hash>-<voice key>.ogg (Opus)
 *   world  the sealed runner world, deploy/migrations/<id>/world.json, byte for byte: what the store's world() makes
 *          of the pack and these files (toRunnerPack with each body's /storykit/f/ address, the voice plan with every
 *          clip), and each line heard down a phone (a caller's, a voicemail, a voice note) marked fx: 'phone', so Mog
 *          City plays it on its phone band (radio/voices.js), as the world was played and voiced on the Mac
 * --export writes the record and the world; with --voice it first copies the clips the voice plan needs from that
 * folder (and its manifest.json's lengths) into deploy/migrations/<id>/voice.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gatePack, toRunnerPack } from '../storykit/pack/gate.ts';
import { voicePlanOf } from '../storykit/pack/runner.ts';
import { modelOf } from '../storykit/pack/registry.ts';
import { inheritance, storykitMeta } from '../lib/storykit-build.ts';

export const SHOWCASE_ID = 'pickup-time';
/** The game's id (fixed, as every first-party world's is) and where the migration reads it all from. */
export const SHOWCASE_GAME = 'b7c4e2a9-5d1f-4e8b-9a36-2f0c8d71e5a4';
export const SHOWCASE_RECORD = `deploy/migrations/${SHOWCASE_ID}-story.json`;
export const SHOWCASE_DIR = `deploy/migrations/${SHOWCASE_ID}`;
const BLURB = 'John Marin went straight: a pizza chain, a wife, a son in first grade. Then a polite white-haired nanny picks Milo up early, and Pedro Delgado wants the million he lost in Miami. Fifteen missions from Wall Street to Harlem, with Carissa on the phone the whole way.';

const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const blobUrl = (hash: string, ext: string) => `/storykit/f/${hash}.${ext}`;

/** The line ids (gate.ts eachStep: <mission>.s<i>, .d<i> during, .x<i> do) heard down a phone, the hero's own excepted. */
export function phoneLines(pack: any): Set<string> {
  const out = new Set<string>(), hero = pack.hero;
  const walk = (steps: any[], lineAt: string, side: boolean) => steps.forEach((s, i) => {
    const lid = `${lineAt}.${side ? 'd' : 's'}${i}`;
    const add = (id: string, who?: string) => { if (who && who !== hero) out.add(id); };
    if (s.type === 'call') {
      (s.lines || []).forEach((l: any, j: number) => add(`${lid}.l${j}`, l.who));
      (s.extra || []).forEach((b: any[], k: number) => b.forEach((l: any, j: number) => add(`${lid}.e${k}.l${j}`, l.who)));
      (s.wrap || []).forEach((l: any, j: number) => add(`${lid}.w.l${j}`, l.who));
      for (const k of ['pause', 'resume']) (s.hold?.[k] || []).forEach((l: any, j: number) => add(`${lid}.h${k[0]}.l${j}`, l.who));
      if (s.voicemail) out.add(`${lid}.vm`);
      if (s.choice?.who) s.choice.options.forEach((o: any, j: number) => { if (o.reply) add(`${lid}.ch.o${j}`, s.choice.who); });
      if (s.choice?.silenceReply) add(`${lid}.ch.sr`, s.choice.who);
    }
    if (s.type === 'voicemail' || s.type === 'voicenote') out.add(lid);
    if (s.during) walk(s.during, lid, true);
    if (s.do) walk(s.do, lid.replace(/\.d(\d+)$/, '.x$1'), true);
  });
  for (const a of pack.acts) for (const m of a.missions) walk(m.steps, m.id, false);
  return out;
}

type FileRec = { kind: 'glb' | 'voice'; name: string; hash: string; ext: string; bytes: number; src: string; meta?: Record<string, unknown> };

/**
 * The showcase as the migration publishes it, read from the repo: the gated pack, the game's meta, its files and the
 * world. `secs`: each clip's length (the record's own, unless new ones are given). Throws when anything is missing.
 */
export function showcaseWorld(secs?: Record<string, number>) {
  const raw = JSON.parse(readFileSync(`storykit/packs/${SHOWCASE_ID}.json`, 'utf8'));
  const g = gatePack(raw, { showcase: true });
  if (!g.ok || !g.pack) throw new Error(`${SHOWCASE_ID} is refused: ${g.problems.slice(0, 3).join(' | ')}`);
  const pack = g.pack;
  const old = existsSync(SHOWCASE_RECORD) ? JSON.parse(readFileSync(SHOWCASE_RECORD, 'utf8')) : null;
  const lengths: Record<string, number> = secs ?? Object.fromEntries((old?.files ?? []).filter((f: FileRec) => f.kind === 'voice').map((f: FileRec) => [f.name.replace(/\.ogg$/, ''), f.meta?.secs as number]));

  const files: FileRec[] = [];
  // the bodies: each seen person's hand-built GLB, as the cast registry ships it
  for (const c of pack.cast) {
    if (c.voiceOnly || !c.model) continue;
    const m = modelOf(c.model);
    if (m?.built !== 'hand') continue;
    const src = `public/storykit/${m.glb}`, b = readFileSync(src);
    files.push({ kind: 'glb', name: c.id, hash: sha(b), ext: 'glb', bytes: b.length, src });
  }
  // the clips: one per clip name of the voice plan (lines that say the same words in the same voice share one)
  const plan = voicePlanOf(pack, '');
  const seen = new Set<string>();
  for (const l of plan.lines as any[]) {
    if (l.rec || seen.has(l.clip)) continue;
    seen.add(l.clip);
    const src = `${SHOWCASE_DIR}/voice/${l.clip}.ogg`;
    if (!existsSync(src)) throw new Error(`${src}: no clip for ${l.id} ("${l.text.slice(0, 40)}")`);
    const b = readFileSync(src);
    if (String.fromCharCode(...b.subarray(0, 4)) !== 'OggS') throw new Error(`${src}: not an Ogg file`);
    const s = lengths[l.clip];
    if (!(s > 0 && s <= 120)) throw new Error(`${src}: no length for it`);
    files.push({ kind: 'voice', name: `${l.clip}.ogg`, hash: sha(b), ext: 'ogg', bytes: b.length, src, meta: { line: l.id, who: l.who, voice: l.voice, codec: 'opus', secs: s } });
  }
  files.sort((a, b) => (a.kind === b.kind ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : a.kind < b.kind ? -1 : 1));

  // the world, as StoryStore.world() makes it from these files, the phone lines marked
  const cast: Record<string, string> = {}, clips: Record<string, unknown> = {};
  for (const f of files) {
    if (f.kind === 'glb') cast[f.name] = blobUrl(f.hash, f.ext);
    else clips[f.name.replace(/\.ogg$/, '')] = { file: f.name, url: blobUrl(f.hash, f.ext), bytes: f.bytes, ...f.meta };
  }
  const phone = phoneLines(pack);
  const voice = { ...plan, lines: (plan.lines as any[]).map((l) => (phone.has(l.id) ? { ...l, fx: 'phone' } : l)), clips };
  const world = { ...toRunnerPack(pack, { cast, clips: 'cast/cast-clips.glb' }), voice };
  const worldBytes = JSON.stringify(world);

  const meta = storykitMeta(pack, { tagline: pack.tagline, blurb: BLURB, people: [], brands: [] }, inheritance(pack, g.lines, null), '');
  (meta.storykit as Record<string, unknown>).showcase = true;
  const record = {
    v: 1, id: SHOWCASE_GAME, slug: SHOWCASE_ID, pack, meta,
    world: { hash: sha(worldBytes), bytes: Buffer.byteLength(worldBytes) },
    files,
  };
  return { record: JSON.stringify(record) + '\n', world: worldBytes, warnings: g.warnings };
}

/** What `npm run check` asks: the record and the world are what the repo makes now (empty when they are). */
export function showcaseProblems(): string[] {
  const out: string[] = [];
  let w: ReturnType<typeof showcaseWorld>;
  try { w = showcaseWorld(); } catch (e) { return [(e as Error).message]; }
  if (!existsSync(SHOWCASE_RECORD) || readFileSync(SHOWCASE_RECORD, 'utf8') !== w.record) out.push(`${SHOWCASE_RECORD} is not current`);
  if (!existsSync(`${SHOWCASE_DIR}/world.json`) || readFileSync(`${SHOWCASE_DIR}/world.json`, 'utf8') !== w.world) out.push(`${SHOWCASE_DIR}/world.json is not current`);
  const rec = JSON.parse(w.record), names = new Set(rec.files.filter((f: FileRec) => f.kind === 'voice').map((f: FileRec) => f.name));
  const extra = readdirSync(`${SHOWCASE_DIR}/voice`).filter((f) => !names.has(f));
  if (extra.length) out.push(`${SHOWCASE_DIR}/voice holds ${extra.length} clips no line plays (${extra.slice(0, 3).join(' ')})`);
  for (const k of ['cover', 'wide', 'icon', 'sky']) if (!existsSync(`deploy/migrations/${SHOWCASE_ID}-${k}.jpg`)) out.push(`deploy/migrations/${SHOWCASE_ID}-${k}.jpg is missing`);
  if (rec.world.bytes > 640_000) out.push(`the world is ${rec.world.bytes} bytes: a sealed world is at most 640000`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (!args.includes('--export')) { console.error('usage: storykit-showcase.ts --export [--voice <dir>]'); process.exit(2); }
  const vi = args.indexOf('--voice');
  let secs: Record<string, number> | undefined;
  if (vi >= 0) {
    const from = args[vi + 1];
    const man = JSON.parse(readFileSync(join(from, 'manifest.json'), 'utf8')).clips as Record<string, { secs: number }>;
    const raw = JSON.parse(readFileSync(`storykit/packs/${SHOWCASE_ID}.json`, 'utf8'));
    const g = gatePack(raw, { showcase: true });
    if (!g.ok || !g.pack) { console.error(g.problems.join('\n')); process.exit(1); }
    mkdirSync(`${SHOWCASE_DIR}/voice`, { recursive: true });
    secs = {};
    let n = 0;
    for (const l of voicePlanOf(g.pack, '').lines as any[]) {
      if (l.rec || secs[l.clip]) continue;
      const src = join(from, `${l.clip}.ogg`);
      if (!existsSync(src)) { console.error(`no clip ${l.clip}.ogg for ${l.id}`); process.exit(1); }
      copyFileSync(src, `${SHOWCASE_DIR}/voice/${l.clip}.ogg`); secs[l.clip] = man[l.clip]?.secs; n++;
    }
    console.log(`copied ${n} clips into ${SHOWCASE_DIR}/voice`);
  }
  const w = showcaseWorld(secs);
  writeFileSync(SHOWCASE_RECORD, w.record);
  writeFileSync(`${SHOWCASE_DIR}/world.json`, w.world);
  const rec = JSON.parse(w.record);
  const glb = rec.files.filter((f: FileRec) => f.kind === 'glb'), voice = rec.files.filter((f: FileRec) => f.kind === 'voice');
  const sum = (l: FileRec[]) => l.reduce((n, f) => n + f.bytes, 0);
  console.log(`wrote ${SHOWCASE_RECORD} and ${SHOWCASE_DIR}/world.json: ${glb.length} bodies (${sum(glb)} bytes), ${voice.length} clips (${sum(voice)} bytes), world ${rec.world.bytes} bytes (${rec.world.hash.slice(0, 12)})`);
}
