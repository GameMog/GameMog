/**
 * Build the GameMog asset library into public/assets.  `npm run assets:build`
 * (after `npm run assets:fetch`).
 *
 * Output: one folder per asset and public/assets/library.json, which lists
 * every file with its SHA-256 and every asset with the licences of the
 * sources it was built from. The runtime refuses a file whose hash does not
 * match, and `npm run check` refuses a library with a file no licence covers.
 */
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { buildHuman } from './human.ts';
import { retargetClip, sprintFrom, type Clip } from './mocap.ts';
import { retargetGltf } from './gltf.ts';
import { buildHdri } from './hdri.ts';
import { sha256, Packer } from './lib.ts';

const OUT = 'public/assets';
const sources = JSON.parse(readFileSync('assets-src/sources.json', 'utf8')).sources as Record<string, any>;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

type Entry = { kind: string; title: string; description: string; sources: string[]; derived?: string; meta?: Record<string, unknown> };
const library: Record<string, Entry & { files: Record<string, { sha256: string; bytes: number }>; bytes: number }> = {};

function packClips(clips: Clip[]) {
  const pk = new Packer();
  const meta = clips.map((c) => {
    pk.add(`${c.name}:q`, new Int16Array(Array.from(c.quats, (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767))), 4);
    pk.add(`${c.name}:root`, c.root, 3);
    return { name: c.name, fps: c.fps, frames: c.frames, loop: c.loop, speed: +c.speed.toFixed(3), duration: +(c.frames / c.fps).toFixed(4), ...(c.contact != null ? { contact: c.contact } : {}) };
  });
  return { buffer: pk.buffer(), layout: pk.layout, meta };
}

// [file, clip, library name, loops]
const COMBAT: [string, string, string, boolean][] = [
  ['UAL1_Standard.glb', 'Sword_Idle', 'guard', true],
  ['UAL2_Standard.glb', 'Sword_Regular_A', 'slash1', false],
  ['UAL2_Standard.glb', 'Sword_Regular_B', 'slash2', false],
  ['UAL2_Standard.glb', 'Sword_Regular_C', 'slash3', false],
  ['UAL2_Standard.glb', 'Sword_Dash', 'dash', false],
  ['UAL2_Standard.glb', 'Hit_Knockback', 'hit', false],
  ['UAL1_Standard.glb', 'Death01', 'death', false],
];

function human(id: string, gender: 'male' | 'female', title: string, skins: Record<string, string>, hair: string[], brows: string) {
  const dir = join(OUT, id);
  const h = buildHuman({ id, gender, outDir: dir, hair, brows, skins: Object.fromEntries(Object.entries(skins).map(([k, v]) => [k, `makehuman-system/skins/${v}`])) });

  // motion, retargeted onto this skeleton
  let best: Clip | null = null, bestTrial = '';
  for (let i = 1; i <= 11; i++) {
    const amc = `09/09_${String(i).padStart(2, '0')}.amc`;
    try { const c = retargetClip(h.skeleton, { asf: '09/09.asf', amc }, { name: 'run', kind: 'cycle' }); if (!best || c.speed > best.speed) { best = c; bestTrial = amc; } } catch {}
  }
  const run = best!;
  const clips: Clip[] = [
    run,
    sprintFrom(run, h.skeleton),
    // the first seconds of 90_16, before the fall, are a relaxed stand
    retargetClip(h.skeleton, { asf: '90/90.asf', amc: '90/90_16.amc' }, { name: 'idle', kind: 'idle', start: 0, end: 260 }),
    retargetClip(h.skeleton, { asf: '104/104.asf', amc: '104/104_53.amc' }, { name: 'start', kind: 'once', start: 40, end: 230, inPlace: true }),
    retargetClip(h.skeleton, { asf: '90/90.asf', amc: '90/90_16.amc' }, { name: 'fall', kind: 'once', start: 300, end: 560 }),
    // the sword: a guard stance, three cuts, a lunge, a hit and a death
    // (Quaternius, CC0), for worlds that turn combat on
    ...COMBAT.map(([file, clip, name, loop]) => retargetGltf(h.skeleton, `quaternius-ual/${file}`, clip, { name, loop })),
  ];
  const packed = packClips(clips);
  writeFileSync(join(dir, 'clips.bin.z'), deflateSync(packed.buffer, { level: 9 }));
  // compress the body too
  const body = readFileSync(join(dir, 'body.bin'));
  writeFileSync(join(dir, 'body.bin.z'), deflateSync(body, { level: 9 }));
  rmSync(join(dir, 'body.bin'));
  const asset = { ...h.asset, body: 'body.bin.z', clips: { file: 'clips.bin.z', layout: packed.layout, list: packed.meta, credits: { run: `CMU ${bestTrial}`, sprint: `derived from CMU ${bestTrial}`, idle: 'CMU 90_16 (standing)', start: 'CMU 104_53', fall: 'CMU 90_16', ...Object.fromEntries(COMBAT.map(([file, clip, name]) => [name, `Quaternius ${file.replace('_Standard.glb', '')} ${clip}`])) } } };
  writeFileSync(join(dir, 'asset.json'), JSON.stringify(asset));
  library[id] = {
    kind: 'human', title,
    description: `A realistic ${gender === 'male' ? 'male' : 'female'} athlete: MakeHuman body shaped for sprinting, ${Object.keys(skins).length} skin tones, ${hair.length} hairstyles, eyes, eyebrows and eyelashes, a paintable kit (${gender === 'male' ? 'singlet' : 'crop top'}, shorts and spikes), five body morphs and a 66-bone rig with motion-captured run, sprint, idle, standing start and fall, and sword motion: a guard, three cuts, a lunge, a hit and a death.`,
    sources: ['makehuman', 'makehuman-system', 'cmu-mocap', 'quaternius-ual'],
    derived: 'Body shaped with MakeHuman targets; rig reduced from 163 to 66 bones; running motion retargeted from CMU captures (the sprint clip amplifies the captured run); sword motion retargeted from Quaternius\'s Universal Animation Library.',
    meta: { skins: Object.keys(skins), hair, morphs: Object.keys(h.asset.morphs as object), clips: packed.meta.map((c) => c.name), vertices: h.asset.vertexCount, bones: h.skeleton.length },
    files: {}, bytes: 0,
  };
  console.log(`${id}: ${h.asset.vertexCount} vertices, ${h.skeleton.length} bones, run from ${bestTrial} at ${run.speed.toFixed(2)} m/s over ${(run.frames / run.fps).toFixed(2)}s`);
}

human('human-athlete-male', 'male', 'Athlete (male)', {
  african: 'young_african_male/young_darkskinned_male_diffuse.png',
  caucasian: 'young_caucasian_male/young_lightskinned_male_diffuse.png',
  caucasian2: 'young_caucasian_male2/young_lightskinned_male_diffuse2.png',
  asian: 'young_asian_male/young_lightskinned_male_diffuse3.png',
}, ['short02', 'short04', 'afro01'], 'eyebrow001');
human('human-athlete-female', 'female', 'Athlete (female)', {
  african: 'young_african_female/young_darkskinned_female_diffuse.png',
  caucasian: 'young_caucasian_female/young_lightskinned_female_diffuse.png',
  asian: 'young_asian_female/young_lightskinned_female_diffuse3.png',
}, ['short02', 'short04', 'afro01'], 'eyebrow010');

{
  const id = 'hdri-sunset-city', dir = join(OUT, id);
  const sky = buildHdri('polyhaven/sunset_jhbcentral_1k.hdr', dir);
  writeFileSync(join(dir, 'asset.json'), JSON.stringify({ format: 'gmasset/1', kind: 'hdri', ...sky, encoding: 'rgbe' }));
  library[id] = { kind: 'hdri', title: 'City sunset sky', description: 'A golden-hour sky over a city, for image-based light and reflections (1024 x 512, full dynamic range).', sources: ['polyhaven'], meta: { width: sky.width, height: sky.height }, files: {}, bytes: 0 };
}

// hash every file, and record which licences cover each asset
for (const [id, e] of Object.entries(library)) {
  for (const f of readdirSync(join(OUT, id)).sort()) {
    const data = readFileSync(join(OUT, id, f));
    e.files[f] = { sha256: sha256(data), bytes: data.length }; e.bytes += data.length;
  }
}
const manifest = {
  format: 'gamemog-library/1',
  note: 'Every file here is listed with its SHA-256; every asset names the sources it was built from and their licences. Built by scripts/assets/build.ts from assets-src/sources.json.',
  sources: Object.fromEntries(Object.entries(sources).map(([k, s]) => [k, { title: s.title, author: s.author, license: s.license, licenseUrl: s.licenseUrl, licenseText: s.licenseText, homepage: s.homepage }])),
  assets: library,
};
writeFileSync(join(OUT, 'library.json'), JSON.stringify(manifest, null, 2) + '\n');
const total = Object.values(library).reduce((a, b) => a + b.bytes, 0);
console.log(`library: ${Object.keys(library).length} assets, ${(total / 1e6).toFixed(1)} MB in ${OUT}`);
for (const [id, e] of Object.entries(library)) console.log(`  ${id}: ${(e.bytes / 1e6).toFixed(2)} MB, ${Object.keys(e.files).length} files`);
void statSync;
