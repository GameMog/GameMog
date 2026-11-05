// Story Kit: build a story pack's fixtures. A creator writes one JSON file, storykit/packs/<id>.json (pack v2, data
// only); this gates it, forges its cast and writes (the world format Mog City plays, as the store hands it):
//   public/storykit/packs/<id>.json          the runner's pack (toRunnerPack), with each seen person's GLB named
//   public/storykit/cast/<id>/<cast id>.glb  each person with a sheet, built by the Character Forge (scripts/forge)
//   public/storykit/cast/cast-clips.glb      the shared clip pack every forged person moves with (built once)
// A person is re-forged only when their sheet or the forge changed (the sheet is kept beside the GLB as
// <cast id>.sheet.json, and a hash of the forge's modules as <cast id>.forge); --reforge builds everyone again.
//   node --import ./scripts/ts-resolve.mjs scripts/storykit-pack.ts <id> [--no-forge] [--reforge]   (npm run storykit:pack -- <id>)
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gatePack, toRunnerPack } from '../storykit/pack/gate.ts';
import { voiceBlockOf, voicePlanOf } from '../storykit/pack/runner.ts';
import { voiceStatus } from '../storykit/pack/voice-store.mjs';
import { TOOLBOX_DIR } from './forge/paths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORGE = path.join(ROOT, 'scripts/forge');
const TOOLBOX = TOOLBOX_DIR;   // the glTF toolbox (diet/build.mjs): scripts/forge/paths.mjs, FORGE_TOOLBOX_DIR

export function packPaths(id: string) {
  return { src: path.join(ROOT, 'storykit/packs', `${id}.json`), out: path.join(ROOT, 'public/storykit/packs', `${id}.json`), cast: path.join(ROOT, 'public/storykit/cast', id) };
}
// the voice plan lives in storykit/pack/runner.ts (the world store builds it too); kept exported from here
export { voiceBlockOf, voicePlanOf };
/** The runner pack for a passed v2 pack, with the cast's GLB paths (relative to the Story Kit page) and its voice plan. */
export function runnerPackOf(pack: any) {
  const cast: Record<string, string> = {};
  for (const c of pack.cast) if (c.sheet) cast[c.id] = `cast/${pack.id}/${c.id}.glb`;
  return { ...toRunnerPack(pack, { cast, clips: 'cast/cast-clips.glb' }), voice: voicePlanOf(pack) };
}

/** A hash of the forge's own modules: a GLB built by another version of them is built again. */
export function forgeHash() {
  const h = createHash('sha1');
  for (const f of ['forge.mjs', 'pipeline.mjs', 'env-node.mjs', 'compile.mjs', 'core.mjs', 'library.mjs', 'post.mjs', 'diet.mjs', 'targets.mjs', 'landmarks.mjs', 'colour.mjs', 'kit.mjs'])
    if (existsSync(path.join(FORGE, f))) h.update(f).update(readFileSync(path.join(FORGE, f)));
  return h.digest('hex').slice(0, 12) + '\n';
}

function run(args: string[], cwd: string) {
  const r = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`${args.join(' ')} failed:\n${(r.stderr || '').slice(-2000)}`);
  return r.stdout;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = process.argv[2], noForge = process.argv.includes('--no-forge'), reforge = process.argv.includes('--reforge');
  if (!id || !/^[a-z0-9][a-z0-9-]{1,39}$/.test(id)) { console.error('usage: storykit-pack.ts <pack id> [--no-forge]'); process.exit(2); }
  const P = packPaths(id);
  if (!existsSync(P.src)) { console.error(`no pack at ${path.relative(ROOT, P.src)}`); process.exit(2); }
  const g = gatePack(JSON.parse(readFileSync(P.src, 'utf8')));
  for (const w of g.warnings) console.log('warning:', w);
  for (const c of g.clamped) console.log('clamped:', c);
  if (!g.ok) { for (const p of g.problems) console.error('refused:', p); process.exit(1); }
  const pack = g.pack;
  if (pack.id !== id) { console.error(`the pack's id is "${pack.id}", its file is ${id}.json`); process.exit(1); }

  mkdirSync(P.cast, { recursive: true });
  if (!noForge) {
    const work = mkdtempSync(path.join(tmpdir(), `storykit-${id}-`));
    // the clip pack, once for every story
    const clips = path.join(ROOT, 'public/storykit/cast/cast-clips.glb');
    if (!existsSync(clips)) {
      console.log('building the clip pack');
      run([path.join(FORGE, 'clips.mjs'), path.join(work, 'clips-raw.glb')], FORGE);
      run(['diet/build.mjs', path.join(work, 'clips-raw.glb'), clips], TOOLBOX);
    }
    for (const c of pack.cast) {
      if (!c.sheet) continue;
      const glb = path.join(P.cast, `${c.id}.glb`), stamp = path.join(P.cast, `${c.id}.sheet.json`), sheet = JSON.stringify(c.sheet, null, 1) + '\n';
      const fstamp = path.join(P.cast, `${c.id}.forge`), fh = forgeHash();
      const sameForge = existsSync(fstamp) && readFileSync(fstamp, 'utf8') === fh;
      if (!reforge && sameForge && existsSync(glb) && existsSync(stamp) && readFileSync(stamp, 'utf8') === sheet) { console.log(`${c.id}: unchanged`); continue; }
      const f = path.join(work, `${c.id}.json`); writeFileSync(f, sheet);
      const t = Date.now();
      const rec = JSON.parse(run([path.join(FORGE, 'forge.mjs'), work, f], FORGE).trim().split('\n').pop()!);
      copyFileSync(path.join(work, `${c.id}.glb`), glb); writeFileSync(stamp, sheet); writeFileSync(fstamp, fh);
      console.log(`${c.id}: forged in ${((Date.now() - t) / 1000).toFixed(1)} s, ${rec.sizeMB} MB`);
    }
    // the same forge for a creator's browser (public/storykit/forge/forge.js), kept in step with scripts/forge
    console.log(run([path.join(FORGE, 'build-web.mjs')], FORGE).trim());
  }
  for (const c of pack.cast) if (c.sheet && !existsSync(path.join(P.cast, `${c.id}.glb`))) console.log(`warning: ${c.id} has no GLB yet (a stand-in plays them)`);
  mkdirSync(path.dirname(P.out), { recursive: true });
  const built = runnerPackOf(pack);
  writeFileSync(P.out, JSON.stringify(built, null, 1) + '\n');
  // the voices: clips the creator's browser made (storykit/voices/studio.html), by line hash in the voice manifest
  const vs = voiceStatus(ROOT, id, built.voice.lines);
  console.log(`wrote ${path.relative(ROOT, P.out)} (${built.voice.lines.length} spoken lines: ${vs.ready.length} voiced, ${(vs.secs).toFixed(1)} s in ${(vs.bytes / 1024).toFixed(0)} KB; ${vs.pending.length} subtitles until voiced)`);
  if (vs.pending.length) console.log(`voices: render the ${vs.pending.length} pending in the browser at /storykit/voices/studio.html?pack=${id}`);
  if (vs.stale.length) console.log(`voices: ${vs.stale.length} clip(s) in public/storykit/packs/${id}/voice/ belong to no current line or voice (${vs.stale.slice(0, 4).join(' ')}${vs.stale.length > 4 ? ' ...' : ''})`);
}
