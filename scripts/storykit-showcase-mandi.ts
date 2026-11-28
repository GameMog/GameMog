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
 * --gate prints the gate's problems and warnings. --draft writes the runner world for a play on the Mac (the clips that
 * are in, a line without one a subtitle; the bodies at the addresses --cast gives, which for Mandi and Jay are a local dev server's). --lines
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
 *   voice         each spoken line's clip, MR_DIR/voice/<line hash>-<voice key>.ogg, its length in MR_VOICE
 *                 (deploy/migrations/mandis-revenge-voice.json: written by --voice <dir>, from that folder's manifest.json)
 *   world         the sealed runner world, MR_DIR/world.json
 * The voices, as Jensen Heist's (scripts/storykit-showcase-jensen.ts): rendered offline on the Mac and copied in by
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-showcase-mandi.ts --voice <dir> [--export]
 * which copies every clip a line of the plan plays, drops any no line plays, and writes MR_VOICE. A line with no clip is
 * a subtitle (its lips chatter); a changed line needs its clip re-rendered and --voice again (the check names a clip no
 * line plays).
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
/** The clips' lengths and how they were made (written by --voice <dir>, from that folder's manifest.json). */
export const MR_VOICE = `deploy/migrations/${MR_ID}-voice.json`;
/** The side cast's forged bodies, by cast id. */
export const castBody = (id: string) => `${MR_DIR}/cast/${id}.glb`;
/**
 * The premium bodies the world is sealed with, by SHA-256: adopting a new build of Mandi or Jay is a change here (the
 * owner's call), never whatever happens to be in the character folder that day. 28 Nov (owner-approved, the story pass's
 * export): Mandi with her holes fixed (Mandi/out/mandi.glb), Jay without the overshirt (Jay/out/jay.glb, jmh-37).
 */
export const PREMIUM_PIN: Record<string, string> = {
  mandi: '156760365f47c5e3bd889211527e60598bc3fcd12b2060bb49af0aef18241a24',
  jay: '56ff0cb30be25fd9bc48c0d87d8e30fb7aa6bf99eafd68f1fee03ef4afaa8d25',
};
/**
 * Where a premium body is read from to hash it (never copied here): MR_<ID>_GLB, else the character's own folder
 * (Mandi/out/mandi.glb, Jay/out/jay.glb, and their out/backup/ builds) in the checkout or beside it: the first whose
 * SHA-256 is the pin's. None on this machine: null (the record's own rows stand).
 */
export function privateSource(id: string): string | null {
  const env = process.env[`MR_${id.toUpperCase()}_GLB`];
  const dir = id[0].toUpperCase() + id.slice(1);
  const cands = [env, `${dir}/out/${id}.glb`, `../${dir}/out/${id}.glb`];
  for (const d of [`${dir}/out/backup`, `../${dir}/out/backup`]) if (existsSync(d)) for (const f of readdirSync(d).sort().reverse()) if (f.endsWith('.glb')) cands.push(`${d}/${f}`);
  for (const p of cands) if (p && existsSync(p) && createHash('sha256').update(readFileSync(p)).digest('hex') === PREMIUM_PIN[id]) return p;
  return null;
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

/**
 * The voice files the plan plays (each line's clip once), from MR_DIR/voice with their lengths in MR_VOICE. `some`: only
 * the clips that are in (a draft); else every line must have one (throws).
 */
export function voiceFiles(plan: any, some = false): FileRec[] {
  const man = existsSync(MR_VOICE) ? JSON.parse(readFileSync(MR_VOICE, 'utf8')).clips as Record<string, { secs: number }> : null;
  if (!man) return [];
  const files: FileRec[] = [], seen = new Set<string>();
  for (const l of plan.lines as any[]) {
    if (l.rec || seen.has(l.clip)) continue;
    seen.add(l.clip);
    const src = `${MR_DIR}/voice/${l.clip}.ogg`, s = man[l.clip]?.secs;
    if (some && (!existsSync(src) || !(s > 0))) continue;
    if (!existsSync(src)) throw new Error(`${src}: no clip for ${l.id} ("${String(l.text).slice(0, 40)}")`);
    const b = readFileSync(src);
    if (String.fromCharCode(...b.subarray(0, 4)) !== 'OggS') throw new Error(`${src}: not an Ogg file`);
    if (!(s > 0 && s <= 120)) throw new Error(`${src}: no length for it in ${MR_VOICE}`);
    files.push({ kind: 'voice', name: `${l.clip}.ogg`, hash: sha(b), ext: 'ogg', bytes: b.length, src, meta: { line: l.id, who: l.who, voice: l.voice, codec: 'opus', secs: s } });
  }
  return files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** The runner world for a play on the Mac: the clips that are in (at their store addresses), the bodies at `cast` (id -> url). */
export function mrDraft(cast: Record<string, string>) {
  const { town, g } = mrGate();
  if (!g.ok || !g.pack) throw new Error(`${MR_ID} is refused: ${g.problems.slice(0, 5).join(' | ')}`);
  const pack = g.pack;
  if (JSON.stringify(cityLock(town)) !== JSON.stringify(pack.base.hometown)) throw new Error(`${MR_ID}: base.hometown is not ${MR_TOWN}'s pin`);
  const plan = voicePlanOf(pack, '', cityTableOf(town));
  const phone = phoneLines(pack);
  // (the clips that are in, at their store addresses /storykit/f/<sha256>.ogg, as the sealed world names them)
  const clips: Record<string, unknown> = {};
  for (const f of voiceFiles(plan, true)) clips[f.name.replace(/\.ogg$/, '')] = { file: f.name, url: blobUrl(f.hash, f.ext), bytes: f.bytes, ...f.meta };
  const voice = { ...plan, lines: (plan.lines as any[]).map((l) => (phone.has(l.id) ? { ...l, fx: 'phone' } : l)), clips };
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
  const plan = voicePlanOf(pack, '', cityTableOf(town));
  // (the voices: every line's clip once the voice record is in; none before it, every line a subtitle)
  files.push(...voiceFiles(plan));
  if (total > BODY_LIMITS.total) warnings.push(`the bodies are ${total} bytes, over ${BODY_LIMITS.total}`);
  const cast: Record<string, string> = {}, clips: Record<string, unknown> = {};
  for (const f of files) {
    if (f.kind === 'glb') cast[f.name] = blobUrl(f.hash, f.ext);
    else clips[f.name.replace(/\.ogg$/, '')] = { file: f.name, url: blobUrl(f.hash, f.ext), bytes: f.bytes, ...f.meta };
  }
  const phone = phoneLines(pack);
  const voice = { ...plan, lines: (plan.lines as any[]).map((l) => (phone.has(l.id) ? { ...l, fx: 'phone' } : l)), clips };
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
  const out: string[] = [...mrVoiceProblems()];
  if (readFileSync(MR_RECORD, 'utf8') !== w.record) out.push(`${MR_RECORD} is not current (run --export)`);
  if (!existsSync(`${MR_DIR}/world.json`) || readFileSync(`${MR_DIR}/world.json`, 'utf8') !== w.world) out.push(`${MR_DIR}/world.json is not current (run --export)`);
  for (const id of PREMIUM) if (existsSync(castBody(id))) out.push(`${castBody(id)}: a premium body is in the public repo`);
  if (w.files.some((f) => PREMIUM.includes(f.name) !== f.src.startsWith('private:'))) out.push('a premium body is not private, or a side-cast body is');
  for (const k of ['cover', 'wide', 'icon', 'sky']) if (!existsSync(`deploy/migrations/${MR_ID}-${k}.jpg`)) out.push(`deploy/migrations/${MR_ID}-${k}.jpg is missing`);
  const rec = JSON.parse(w.record);
  if (rec.world.bytes > 640_000) out.push(`the world is ${rec.world.bytes} bytes: a sealed world is at most 640000`);
  return out;
}

/**
 * The voices (as Jensen Heist's jhVoiceProblems): every clip in MR_DIR/voice is one a line of the plan plays, a real Ogg
 * under the store's clip limit, with its length in MR_VOICE; all of them inside a world's voice limits
 * (lib/storykit-store.ts LIMITS.voice).
 */
export function mrVoiceProblems(): string[] {
  const dir = `${MR_DIR}/voice`, out: string[] = [];
  if (!existsSync(dir)) return existsSync(MR_VOICE) ? [`${MR_VOICE} is there but ${dir} is not`] : out;
  if (!existsSync(MR_VOICE)) return [`${dir} has clips but ${MR_VOICE} is missing (run --voice <dir>)`];
  const man = JSON.parse(readFileSync(MR_VOICE, 'utf8')).clips as Record<string, { secs: number }>;
  const { town, g } = mrGate();
  if (!g.ok || !g.pack) return out;
  const want = new Set((voicePlanOf(g.pack, '', cityTableOf(town)).lines as any[]).filter((l) => !l.rec).map((l) => l.clip));
  let bytes = 0, n = 0;
  for (const f of readdirSync(dir)) {
    const base = f.replace(/\.ogg$/, '');
    if (!want.has(base)) { out.push(`${dir}/${f}: no line of the plan plays it`); continue; }
    const b = readFileSync(`${dir}/${f}`);
    if (String.fromCharCode(...b.subarray(0, 4)) !== 'OggS') out.push(`${dir}/${f}: not an Ogg file`);
    if (b.length > 2 * 1024 * 1024) out.push(`${dir}/${f}: ${b.length} bytes, over the 2 MB clip limit`);
    if (!(man[base]?.secs > 0 && man[base].secs <= 120)) out.push(`${dir}/${f}: no length in ${MR_VOICE}`);
    bytes += b.length; n++;
  }
  for (const k of Object.keys(man)) if (!existsSync(`${dir}/${k}.ogg`)) out.push(`${MR_VOICE} names ${k}, which is not in ${dir}`);
  if (bytes > 24 * 1024 * 1024 || n > 1500) out.push(`${dir}: ${n} clips, ${bytes} bytes: a world's voice is at most 1500 clips and 24 MB`);
  return out.slice(0, 8);
}

/**
 * The pacing rule (the owner: "about 2 min, never 3 min without a beat"; the playtest's B3/B4, 28 Nov): every drive, tail
 * and convoy leg of the pack, the GPS's own route length on Mog City (r42) and production Chicago, metres, measured in
 * headless Chrome (the routes the player is shown, at each start's heading; not straight lines). Keyed "<from>><to>" by
 * the pack's place names. A leg the pack drives must be here (a new leg is measured before it ships), and none may take
 * more than MR_LEG_MAX seconds at its pace (a tail's or convoy's own speed, a drive at MR_DRIVE_PACE).
 */
export const MR_ROUTES: Record<string, number> = {
  'studio>jay-lot': 1842, 'jay-lot>salon': 2046, 'salon>warehouse': 1063, 'lower-level>mirror': 1992, 'mirror>harbor': 1115,
  'ohio>pier-foot': 1482, 'south-lot>stadium-lot': 2071, 'crew>riverwalk': 941, 'ohio>bridge': 803,
};
/** A drive's pace on the town's streets (m/s), the test drive's realpace average with the lights and the turns. */
export const MR_DRIVE_PACE = 15;
/** The longest a leg may take (s): the owner's "about 2 minutes", with the GPS's own detours. */
export const MR_LEG_MAX = 150;
export function mrPacingProblems(pack: any): string[] {
  const out: string[] = [];
  for (const m of pack.acts.flatMap((a: any) => a.missions)) {
    let at: string | null = String(m.start).replace(/^@/, '');
    for (const st of m.steps) {
      const leg = (a: string | null, b: string, pace: number) => {
        if (!a || a === b) return;
        const k = `${a}>${b}`, len = MR_ROUTES[k];
        if (!(len > 0)) { out.push(`${m.id}: the ${st.type} ${k} has no measured route (MR_ROUTES)`); return; }
        if (len / pace > MR_LEG_MAX) out.push(`${m.id}: the ${st.type} ${k} is ${len} m, ${Math.round(len / pace)} s at ${pace} m/s: over ${MR_LEG_MAX} s`);
      };
      const ref = (r: any) => (typeof r === 'string' ? r.replace(/^@/, '') : r && r['@'] ? String(r['@']) : null);
      if (st.type === 'drive') { const to = ref(st.to); if (to) { leg(at, to, MR_DRIVE_PACE); at = to; } }
      // (a tail or convoy with waypoints is measured end to end: its route goes through them)
      else if (st.type === 'tail' || st.type === 'convoy') { const r = (st.route || []).map(ref); leg(r[0], r[r.length - 1], st.speed || MR_DRIVE_PACE); at = r[r.length - 1]; }
      else if (st.type === 'walk' || st.type === 'place') at = ref(st.to ?? st.at);
      else if (st.type === 'pursuit' || st.type === 'roadblock') at = st.type === 'roadblock' && st.to ? ref(st.to) : null;
    }
  }
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
  const vi = args.indexOf('--voice');
  if (vi >= 0) {
    const from = args[vi + 1];
    const M = JSON.parse(readFileSync(join(from, 'manifest.json'), 'utf8')), man = M.clips as Record<string, { secs: number }>;
    const { town, g } = mrGate();
    if (!g.ok || !g.pack) { console.error(g.problems.join('\n')); process.exit(1); }
    mkdirSync(`${MR_DIR}/voice`, { recursive: true });
    const lines = voicePlanOf(g.pack, '', cityTableOf(town)).lines as any[], want = new Set(lines.map((l) => l.clip));
    const missing: string[] = [], keep: Record<string, unknown> = {};
    let n = 0;
    for (const l of lines) {
      if (l.rec || keep[l.clip] || missing.includes(l.clip)) continue;
      const src = join(from, `${l.clip}.ogg`);
      if (!existsSync(src) || !(man[l.clip]?.secs > 0)) { missing.push(l.clip); continue; }
      copyFileSync(src, `${MR_DIR}/voice/${l.clip}.ogg`); keep[l.clip] = man[l.clip]; n++;
    }
    // (a clip of a line that changed or went: its line plays no more, so it goes)
    for (const f of readdirSync(`${MR_DIR}/voice`)) if (!want.has(f.replace(/\.ogg$/, ''))) unlinkSync(`${MR_DIR}/voice/${f}`);
    const sorted = Object.fromEntries(Object.entries(keep).sort(([a], [b]) => (a < b ? -1 : 1)));
    writeFileSync(MR_VOICE, JSON.stringify({ v: 1, model: M.model, loudness: M.loudness, credit: M.credit, clips: sorted }, null, 1) + '\n');
    console.log(`copied ${n} clips into ${MR_DIR}/voice and wrote ${MR_VOICE}${missing.length ? `; ${missing.length} lines have no clip yet (subtitles): ${missing.slice(0, 3).join(' ')}` : ''}`);
    if (!args.includes('--export')) process.exit(0);
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
    console.log(`wrote ${MR_RECORD} and ${MR_DIR}/world.json: ${rec.files.filter((f: FileRec) => f.kind === 'glb').length} bodies, ${rec.files.filter((f: FileRec) => f.kind === 'voice').length} clips, world ${rec.world.bytes} bytes (${rec.world.hash.slice(0, 12)})`);
    for (const f of rec.files.filter((x: FileRec) => x.src.startsWith('private:'))) console.log(`private: ${f.name} ${f.hash} ${f.bytes} bytes -> data/storykit-private/${f.hash}.glb`);
    for (const x of w.warnings) console.warn(`warning: ${x}`);
    process.exit(0);
  }
  if (fi >= 0) process.exit(0);
  const li = args.indexOf('--lines');
  if (li >= 0) { writeFileSync(args[li + 1], mrLines()); console.log(`wrote ${args[li + 1]}`); process.exit(0); }
  console.error('usage: storykit-showcase-mandi.ts --gate | [--cast-from <dir>] [--voice <dir>] --export | --voice <dir> | --draft <out.json> --cast id=url,... | --lines <LINES.md>');
  process.exit(2);
}
