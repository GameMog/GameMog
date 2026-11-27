/**
 * Story Kit: Mandi's Revenge, GameMog's third showcase story world and its second in a hometown (Chicago, us-1714000,
 * on Mog City's engine). Like Jensen Return (scripts/storykit-showcase-jensen.ts) it is a hand-written pack in the repo
 * (storykit/packs/mandis-revenge.json, written by storykit/showcase/mandis-revenge/gen.mjs, listed in SHOWCASE_PACKS),
 * gated in its town as a showcase, and published HIDDEN by a migration (deploy/migrate.mjs 2026-11-27-mandis-revenge)
 * from the record this script writes:
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-showcase-mandi.ts --gate
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-showcase-mandi.ts [--cast-from <dir>] --export
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-showcase-mandi.ts --draft <out.json> --cast <id=url,...>
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-showcase-mandi.ts --lines <LINES.md>
 *
 * --gate prints the gate's problems and warnings. --draft writes the runner world for a play on the Mac (no clips: every
 * line a subtitle; the bodies at the addresses --cast gives, which for Mandi and Jay are a local dev server's). --lines
 * writes the casting sheet: every spoken line, by speaker, with the id and the voice key its clip will be named by.
 *
 * --export writes the record (MR_RECORD) and the sealed world (MR_DIR/world.json). The record names every file by its
 * SHA-256, as Jensen Return's does:
 *   glb, private  Mandi's and Jay's premium bodies (PREMIUM), which NEVER go in this public repo: their rows say
 *                 src 'private:<sha256>.glb' and the migration reads them from the server's data/storykit-private/
 *                 (the owner puts them there). Read here from PRIVATE_SOURCES (MR_MANDI_GLB / MR_JAY_GLB, else the
 *                 character folders beside the checkout) only to hash them; with neither there, the record's own rows
 *                 stand (so `npm run check` holds the record current on any machine)
 *   glb           each other seen person's forged body, MR_DIR/cast/<id>.glb (the Character Forge from sheets/:
 *                 `node scripts/forge/forge.mjs <dir> storykit/showcase/mandis-revenge/sheets/<id>.json`; --cast-from
 *                 <dir> copies <dir>/<id>.glb in first)
 *   world         the sealed runner world, MR_DIR/world.json
 * No voices yet (the owner: voices later): every line is a subtitle, and the record holds no clip.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { toRunnerPack } from '../storykit/pack/gate.ts';
import { voicePlanOf } from '../storykit/pack/runner.ts';
import { gateHometown, cityTableOf } from '../storykit/hometown/hometown-gate.ts';
import { cityLock, townName, type CityPackage } from '../storykit/hometown/city-package.ts';
import { inheritance, storykitMeta } from '../lib/storykit-build.ts';
import { phoneLines } from './storykit-showcase.ts';

export const MR_ID = 'mandis-revenge';
export const MR_PACK = `storykit/packs/${MR_ID}.json`;
export const MR_TOWN = `storykit/showcase/${MR_ID}/town.json.gz`;
/** The private premium bodies: never copied into this repo (the README says how the pack reaches them). */
export const PREMIUM = ['mandi', 'jay'];
/** The game's id (fixed, as every first-party world's is). */
export const MR_GAME = 'fb17b56f-ee22-4572-a44a-db1a205c6aee';
export const MR_RECORD = `deploy/migrations/${MR_ID}-story.json`;
export const MR_DIR = `deploy/migrations/${MR_ID}`;
/** The side cast's forged bodies, by cast id. */
export const castBody = (id: string) => `${MR_DIR}/cast/${id}.glb`;
/**
 * Where the premium bodies are read from to hash them (never copied here): MR_<ID>_GLB, else the character's own folder
 * (Mandi/out/mandi.glb, Jay/out/jay.glb) in the checkout or beside it. The first that exists.
 */
export function privateSource(id: string): string | null {
  const env = process.env[`MR_${id.toUpperCase()}_GLB`];
  const dir = id[0].toUpperCase() + id.slice(1);
  return [env, `${dir}/out/${id}.glb`, `../${dir}/out/${id}.glb`].find((p) => p && existsSync(p)) ?? null;
}
/** A body's limits (lib/storykit-store.ts LIMITS.glb.each, SHOWCASE_LIMITS.glb.total): over them is warned, not refused. */
export const BODY_LIMITS = { each: 6 * 1024 * 1024, total: 128 * 1024 * 1024 };
const BLURB = "Mandi Reyes is one callback from her big break when her ex, Jay, goes missing over a gambling debt to a Chicago crime boss. "
  + 'In a leopard bikini and fuzzy slides, she takes the wheel of her black Kastell for eight missions across the Loop, the river and the lakefront, every call on her foldable phone.';
/**
 * The world's credit line (as Jensen Return's): its CC BY 4.0 asset credited as its licence asks. The Kastell, Mog City's
 * black off-roader, is adapted from a Sketchfab model credited by its author only (the model's title names a real car,
 * which the game never does); Mog City credits it in game too (its GWAGON_CREDIT).
 */
export const MR_CREDIT = 'Every person and company in this story is invented. The black off-roader is adapted from a model by DemuriaGT '
  + "(Sketchfab), CC BY 4.0, modified, with no maker's badges.";

const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const blobUrl = (hash: string, ext: string) => `/storykit/f/${hash}.${ext}`;
type FileRec = { kind: 'glb' | 'voice'; name: string; hash: string; ext: string; bytes: number; src: string; meta?: Record<string, unknown> };

export const mrTown = (): CityPackage => JSON.parse(gunzipSync(readFileSync(MR_TOWN)).toString('utf8'));
export function mrGate() {
  const town = mrTown(), raw = JSON.parse(readFileSync(MR_PACK, 'utf8'));
  return { town, raw, g: gateHometown(raw, town, { showcase: true }) };
}

/** The runner world for a play on the Mac: no clips, the bodies at `cast` (id -> url). */
export function mrDraft(cast: Record<string, string>) {
  const { town, g } = mrGate();
  if (!g.ok || !g.pack) throw new Error(`${MR_ID} is refused: ${g.problems.slice(0, 5).join(' | ')}`);
  const pack = g.pack;
  if (JSON.stringify(cityLock(town)) !== JSON.stringify(pack.base.hometown)) throw new Error(`${MR_ID}: base.hometown is not ${MR_TOWN}'s pin`);
  const plan = voicePlanOf(pack, '', cityTableOf(town));
  const phone = phoneLines(pack);
  const voice = { ...plan, lines: (plan.lines as any[]).map((l) => (phone.has(l.id) ? { ...l, fx: 'phone' } : l)), clips: {} };
  const world = { ...toRunnerPack(pack, { cast, clips: 'cast/cast-clips.glb', townName: townName(town) }), voice };
  return { world: JSON.stringify(world), plan, pack };
}

/**
 * The world as the migration publishes it: the record (JSON text) and the sealed world. Throws when the pack is refused,
 * a side-cast body is missing, or a premium body is neither on this machine nor in the record already.
 */
export function mrWorld() {
  const { town, g } = mrGate();
  if (!g.ok || !g.pack) throw new Error(`${MR_ID} is refused: ${g.problems.slice(0, 3).join(' | ')}`);
  const pack = g.pack;
  if (JSON.stringify(cityLock(town)) !== JSON.stringify(pack.base.hometown)) throw new Error(`${MR_ID}: base.hometown is not ${MR_TOWN}'s pin (re-pin the pack to the town)`);
  const old = existsSync(MR_RECORD) ? JSON.parse(readFileSync(MR_RECORD, 'utf8')) : null;
  const files: FileRec[] = [], warnings: string[] = [];
  for (const c of pack.cast) {
    if (c.voiceOnly || c.model) continue;
    if (PREMIUM.includes(c.id)) {
      const src = privateSource(c.id);
      let hash: string, bytes: number;
      if (src) {
        const b = readFileSync(src);
        if (b.length < 12 || b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${src}: not a GLB`);
        hash = sha(b); bytes = b.length;
      } else {
        const r = (old?.files ?? []).find((f: FileRec) => f.kind === 'glb' && f.name === c.id);
        if (!r) throw new Error(`${c.id}: the premium body is not on this machine (MR_${c.id.toUpperCase()}_GLB) nor in ${MR_RECORD}`);
        hash = r.hash; bytes = r.bytes;
      }
      if (bytes > BODY_LIMITS.each) warnings.push(`${c.id}: ${bytes} bytes, over a body's ${BODY_LIMITS.each} (a Mog's upload cap)`);
      files.push({ kind: 'glb', name: c.id, hash, ext: 'glb', bytes, src: `private:${hash}.glb` });
      continue;
    }
    const src = castBody(c.id);
    if (!existsSync(src)) throw new Error(`${src}: no forged body for ${c.id} (--cast-from <dir of forged GLBs>)`);
    const b = readFileSync(src);
    if (b.length < 12 || b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${src}: not a GLB`);
    if (b.length > BODY_LIMITS.each) warnings.push(`${c.id}: ${b.length} bytes, over a body's ${BODY_LIMITS.each}`);
    files.push({ kind: 'glb', name: c.id, hash: sha(b), ext: 'glb', bytes: b.length, src });
  }
  files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const total = files.reduce((n, f) => n + f.bytes, 0);
  if (total > BODY_LIMITS.total) warnings.push(`the bodies are ${total} bytes, over ${BODY_LIMITS.total}`);
  const cast: Record<string, string> = {};
  for (const f of files) cast[f.name] = blobUrl(f.hash, f.ext);
  const plan = voicePlanOf(pack, '', cityTableOf(town));
  const phone = phoneLines(pack);
  const voice = { ...plan, lines: (plan.lines as any[]).map((l) => (phone.has(l.id) ? { ...l, fx: 'phone' } : l)), clips: {} };
  const world = { ...toRunnerPack(pack, { cast, clips: 'cast/cast-clips.glb', townName: townName(town) }), voice };
  const worldBytes = JSON.stringify(world);
  const meta = storykitMeta(pack, { tagline: pack.tagline, blurb: BLURB, people: [], brands: [] }, inheritance(pack, g.lines, null), '');
  Object.assign(meta.storykit as Record<string, unknown>, { showcase: true, credit: MR_CREDIT });
  const record = { v: 1, id: MR_GAME, slug: MR_ID, pack, meta, world: { hash: sha(worldBytes), bytes: Buffer.byteLength(worldBytes) }, files };
  return { record: JSON.stringify(record) + '\n', world: worldBytes, warnings: [...g.warnings, ...warnings], files };
}

/**
 * What `npm run check` asks once the record is written: the record and the world are what the repo makes now (the
 * premium bodies as the record names them when they are not on this machine), every side-cast body in the record is
 * in MR_DIR/cast, the art is there, and no premium body is anywhere in the repo's migration folder. Before the record,
 * nothing (the migration waits).
 */
export function mrProblems(): string[] {
  if (!existsSync(MR_RECORD)) return [];
  let w: ReturnType<typeof mrWorld>;
  try { w = mrWorld(); } catch (e) { return [(e as Error).message]; }
  const out: string[] = [];
  if (readFileSync(MR_RECORD, 'utf8') !== w.record) out.push(`${MR_RECORD} is not current (run --export)`);
  if (!existsSync(`${MR_DIR}/world.json`) || readFileSync(`${MR_DIR}/world.json`, 'utf8') !== w.world) out.push(`${MR_DIR}/world.json is not current (run --export)`);
  for (const id of PREMIUM) if (existsSync(castBody(id))) out.push(`${castBody(id)}: a premium body is in the public repo`);
  if (w.files.some((f) => PREMIUM.includes(f.name) !== f.src.startsWith('private:'))) out.push('a premium body is not private, or a side-cast body is');
  for (const k of ['cover', 'wide', 'icon', 'sky']) if (!existsSync(`deploy/migrations/${MR_ID}-${k}.jpg`)) out.push(`deploy/migrations/${MR_ID}-${k}.jpg is missing`);
  const rec = JSON.parse(w.record);
  if (rec.world.bytes > 640_000) out.push(`the world is ${rec.world.bytes} bytes: a sealed world is at most 640000`);
  return out;
}

/** LINES.md: every spoken line, in the order it plays, for casting (clips are keyed by a hash of the text and voice). */
export function mrLines(): string {
  const { town, g } = mrGate();
  if (!g.ok || !g.pack) throw new Error(`${MR_ID} is refused: ${g.problems.slice(0, 5).join(' | ')}`);
  const pack = g.pack, plan = voicePlanOf(pack, '', cityTableOf(town)), ls = plan.lines as any[];
  const names = new Map(pack.cast.map((c: any) => [c.id, c.sheet?.name ?? c.name ?? c.id]));
  const by = new Map<string, number>();
  for (const l of ls) by.set(l.who, (by.get(l.who) || 0) + 1);
  const out = ["# Mandi's Revenge: the spoken lines", '',
    `Written by \`scripts/storykit-showcase-mandi.ts --lines\` from \`${MR_PACK}\` (do not edit by hand). Every line is a subtitle until its clip is`,
    'recorded; a clip is named by the hash of its text and its voice (`clip` below), so a changed line needs a new clip.', '',
    `${ls.length} spoken lines, ${new Set(ls.map((l) => l.clip)).size} clips to record.`, '', '| speaker | lines |', '|---|---:|',
    ...[...by].sort((a, b) => b[1] - a[1]).map(([w, n]) => `| ${names.get(w) ?? w} | ${n} |`), '',
    '| # | id | speaker | line | clip |', '|---:|---|---|---|---|'];
  ls.forEach((l, i) => out.push(`| ${i + 1} | \`${l.id}\` | ${names.get(l.who) ?? l.who} | ${String(l.text).replace(/\|/g, '\\|')} | \`${l.clip}\` |`));
  return out.join('\n') + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.includes('--gate')) {
    const { g } = mrGate();
    console.log(JSON.stringify({ ok: g.ok, problems: g.problems, warnings: g.warnings, clamped: g.clamped, lines: g.lines.length }, null, 1));
    process.exit(g.ok ? 0 : 1);
  }
  const di = args.indexOf('--draft');
  if (di >= 0) {
    const ci = args.indexOf('--cast');
    const cast = ci >= 0 ? Object.fromEntries(String(args[ci + 1]).split(',').filter(Boolean).map((kv) => kv.split('=') as [string, string])) : {};
    const w = mrDraft(cast);
    writeFileSync(args[di + 1], w.world);
    console.log(`wrote ${args[di + 1]}: ${w.world.length} bytes, ${(w.plan.lines as any[]).length} spoken lines`);
    process.exit(0);
  }
  const fi = args.indexOf('--cast-from');
  if (fi >= 0) {
    const from = args[fi + 1], { g } = mrGate();
    mkdirSync(`${MR_DIR}/cast`, { recursive: true });
    let n = 0;
    for (const c of g.pack?.cast ?? []) {
      if (c.voiceOnly || c.model || PREMIUM.includes(c.id)) continue;
      const src = `${from}/${c.id}.glb`;
      if (!existsSync(src)) { console.error(`${src}: not forged`); process.exit(1); }
      copyFileSync(src, castBody(c.id)); n++;
    }
    console.log(`copied ${n} forged bodies into ${MR_DIR}/cast`);
  }
  if (args.includes('--export')) {
    const w = mrWorld();
    mkdirSync(MR_DIR, { recursive: true });
    writeFileSync(MR_RECORD, w.record);
    writeFileSync(`${MR_DIR}/world.json`, w.world);
    const rec = JSON.parse(w.record);
    console.log(`wrote ${MR_RECORD} and ${MR_DIR}/world.json: ${rec.files.length} bodies, world ${rec.world.bytes} bytes (${rec.world.hash.slice(0, 12)})`);
    for (const f of rec.files.filter((x: FileRec) => x.src.startsWith('private:'))) console.log(`private: ${f.name} ${f.hash} ${f.bytes} bytes -> data/storykit-private/${f.hash}.glb`);
    for (const x of w.warnings) console.warn(`warning: ${x}`);
    process.exit(0);
  }
  if (fi >= 0) process.exit(0);
  const li = args.indexOf('--lines');
  if (li >= 0) { writeFileSync(args[li + 1], mrLines()); console.log(`wrote ${args[li + 1]}`); process.exit(0); }
  console.error('usage: storykit-showcase-mandi.ts --gate | [--cast-from <dir>] --export | --draft <out.json> --cast id=url,... | --lines <LINES.md>');
  process.exit(2);
}
