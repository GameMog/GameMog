/**
 * Build the GameMog asset library into public/assets.  `npm run assets:build`
 * (after `npm run assets:fetch`).
 *
 * Output: one folder per asset and public/assets/library.json, which lists
 * every file with its SHA-256 and every asset with the licences of the
 * sources it was built from. The runtime refuses a file whose hash does not
 * match, and `npm run check` refuses a library with a file no licence covers.
 */
import { copyFileSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deflateSync, gzipSync } from 'node:zlib';
import { buildHuman } from './human.ts';
import { retargetClip, sprintFrom, type Clip } from './mocap.ts';
import { retargetGltf } from './gltf.ts';
import { buildHdri } from './hdri.ts';
import { buildMusic } from './music.ts';
import { buildModel } from './model.ts';
import { sha256, Packer } from './lib.ts';

const OUT = 'public/assets';
const sources = JSON.parse(readFileSync('assets-src/sources.json', 'utf8')).sources as Record<string, any>;
// a full build starts clean; ONLY (below) clears just the assets it rebuilds
if (!process.env.ONLY) rmSync(OUT, { recursive: true, force: true });
else for (const id of process.env.ONLY.split(',')) rmSync(join(OUT, id), { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

type Entry = { kind: string; title: string; description: string; sources: string[]; derived?: string; meta?: Record<string, unknown> };
const library: Record<string, Entry & { files: Record<string, { sha256: string; bytes: number }>; bytes: number }> = {};
// ONLY=id,id builds just those assets and merges them into the library as it
// stands (a full build is not byte-reproducible: the brows and the encoded
// music come out different each time, so rebuild only what changed)
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const want = (id: string) => !ONLY || ONLY.has(id);

function packClips(clips: Clip[]) {
  const pk = new Packer();
  const meta = clips.map((c) => {
    pk.add(`${c.name}:q`, new Int16Array(Array.from(c.quats, (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767))), 4);
    pk.add(`${c.name}:root`, c.root, 3);
    return { name: c.name, fps: c.fps, frames: c.frames, loop: c.loop, speed: +c.speed.toFixed(3), duration: +(c.frames / c.fps).toFixed(4), ...(c.contact != null ? { contact: c.contact } : {}), ...(c.dir != null ? { dir: c.dir } : {}) };
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

// the street fight and the street's own life (Quaternius, CC0), for open worlds:
// [file, clip, library name, loops, from s, to s]
const BRAWL: [string, string, string, boolean, number?, number?][] = [
  ['UAL1_Standard.glb', 'Hit_Head', 'hitHead', false],
  ['UAL1_Standard.glb', 'Hit_Chest', 'hitChest', false],
  ['UAL2_Standard.glb', 'LayToIdle', 'getup', false],
  ['UAL1_Standard.glb', 'Roll', 'roll', false],
  ['UAL2_Standard.glb', 'Idle_Shield_Loop', 'shield', true],
  ['UAL2_Standard.glb', 'Shield_Dash', 'shieldDash', false],
  ['UAL2_Standard.glb', 'Idle_Shield_Break', 'shieldBreak', false],
  ['UAL2_Standard.glb', 'Idle_TalkingPhone_Loop', 'phone', true],
  ['UAL2_Standard.glb', 'Idle_FoldArms_Loop', 'arms', true],
  ['UAL1_Standard.glb', 'Idle_Talking_Loop', 'talk', true],
  ['UAL1_Standard.glb', 'Dance_Loop', 'dance', true],
  ['UAL1_Standard.glb', 'Sitting_Idle_Loop', 'sit', true],
  // picking a weapon up off a wall, a bin or a bench (open worlds' hidden weapons)
  ['UAL1_Standard.glb', 'PickUp_Table', 'pickup', false],
];

// the freeflow moves (Spiderbench's combat, with its author's written permission, 3 Oct 2026; the owner: "more style
// and speed when fighting, including kicks"): three punches, a kick, a rising uppercut and a leaping kick, built in
// Blender on its hero's rig and retargeted here (no model, suit or texture is taken).
// [source clip, library name, moment of contact s, from s]
const FREEFLOW: [string, string, number, number?][] = [
  ['punch1', 'ffJab', 0.2], ['punch2', 'ffCross', 0.23], ['punch3', 'ffHook', 0.3], ['kick', 'ffKick', 0.3],
  ['uppercut', 'ffRiser', 0.33], ['webStrike', 'ffLeap', 0.57, 0.36],
];

// the street fight and the street's own life, captured (CMU, the owner, 28 Sep:
// "everyone is a zombie with zombie movements when fighting"): a boxer's guard
// and footwork, single punches from the guard, everyday and styled walks,
// standing about. Chosen with a scan of each trial (hands, guard, travel).
// [trial, library name, kind, from s, to s, options]
// (a woman's body takes a woman's capture where one is given: [trial, from, to])
type CmuCut = [string, string, 'cycle' | 'idle' | 'once' | 'move', number?, number?, { face?: 'hips'; srcFps?: number; contact?: number; period?: number; fist?: boolean; female?: [string, number, number] }?];
const CMU_STREET: CmuCut[] = [
  // the guard: the window of each trial where the fists sit at the chin, the feet
  // apart, standing (a scan scored every 1.2 s of the fight trials for it)
  ['15_13', 'fight', 'idle', 11.6, 12.8, { fist: true, female: ['144_21', 12.1, 13.3] }],
  // footwork for the legs (the runtime keeps the guard's arms over it)
  ['17_10', 'guardF', 'move', 4.0, 5.5, { fist: true }],    // in,
  ['17_10', 'guardB', 'move', 14.5, 16.0, { fist: true }],  // back,
  ['14_01', 'guardL', 'move', 2.75, 4.25, { fist: true }],  // to the left,
  ['76_03', 'guardR', 'move', 5.25, 6.5, { fist: true }],   // to the right
  ['143_23', 'jab', 'once', 0.2, 0.9, { contact: 0.33, fist: true }],   // the lead hand, from the guard and back
  ['143_23', 'cross', 'once', 0.86, 1.6, { contact: 0.30, fist: true }],// the rear hand
  ['15_13', 'hook', 'once', 22.45, 23.2, { contact: 0.34, fist: true }],
  // more blows for the big fights (the owner, 30 Sep: "more variations in punches"),
  // found by a scan for a hand rising fast in front to the chin (uppercuts) or
  // reaching out at the stomach (body shots), each from a guard and back to it
  ['143_23', 'upperL', 'once', 4.72, 5.22, { contact: 0.16, fist: true }],  // the lead uppercut,
  ['14_01', 'uppercut', 'once', 6.25, 7.05, { contact: 0.38, fist: true }], // the rear uppercut,
  ['13_18', 'body', 'once', 11.42, 11.87, { contact: 0.21, fist: true }],  // the lead hand to the body
  ['104_19', 'walk', 'cycle', 1.75, 5.5],                   // a casual walk
  ['91_23', 'walkCool', 'cycle', 4.0, 8.75],               // the street's cool walk
  ['82_09', 'walkHeavy', 'cycle', 6.25, 9.5],              // a big man's confident walk
  ['144_33', 'walkF', 'cycle', 25.5, 28.25],               // a woman's walk
  ['143_39', 'walkBack', 'cycle', 1.5, 4.5, { face: 'hips', period: 1.25 }],
  ['35_17', 'jog', 'cycle'],
  ['139_02', 'shift', 'idle'],                              // standing, shifting weight
  ['80_48', 'argue', 'idle', undefined, undefined, { srcFps: 60 }],
  ['141_21', 'shrug', 'once'],
  ['141_16', 'wave', 'once'],
];
const cmuCut = (skel: Parameters<typeof retargetClip>[0], [trial0, name, kind, from0, to0, o]: CmuCut, gender: 'male' | 'female') => {
  const [trial, from, to] = gender === 'female' && o?.female ? o.female : [trial0, from0, to0];
  const sub = trial.split('_')[0], fps = /^(79|80)_/.test(trial) ? 60 : o?.srcFps ?? 120;
  return retargetClip(skel, { asf: `${sub}/${sub}.asf`, amc: `${sub}/${trial}.amc` }, { name, kind, start: from == null ? undefined : Math.round(from * fps), end: to == null ? undefined : Math.round(to * fps), face: o?.face, srcFps: fps, contact: o?.contact, period: o?.period, fist: o?.fist, inPlace: kind === 'once' });
};

// the people pack (the owner, 3 Oct): what a world adds to a base human by listing human-pack-<gender> in its assets
const PACK_HAIR = ['bob01', 'bob02', 'braid01', 'long01', 'ponytail01', 'short01', 'short03'];
const PACK_OUTFITS = {
  male: ['male_casualsuit01', 'male_casualsuit02', 'male_casualsuit03', 'male_casualsuit04', 'male_casualsuit05', 'male_casualsuit06', 'male_elegantsuit01', 'male_worksuit01'],
  female: ['female_casualsuit01', 'female_casualsuit02', 'female_elegantsuit01', 'female_sportsuit01'],
};
const PACK_SHARED = ['shoes01', 'shoes02', 'shoes03', 'shoes04', 'shoes05', 'shoes06', 'fedora01', 'fedora_cocked'];
// MakeHuman's own logo and name printed on some of its garments and a sports brand's marks on two of its trainers:
// covered with the same garment's plain cloth (at: the 1024 px rect to cover; from: where its patch is taken, as an
// offset). The web address in the textures' corners is left: it is outside every part's UVs, as in the base's skins
type Scrub = { at: [number, number, number, number]; from: [number, number]; round?: boolean };
const SCRUB: Record<string, Scrub[]> = {
  male_casualsuit02: [{ at: [505, 105, 642, 241], from: [-410, 0], round: true }],
  male_casualsuit04: [{ at: [505, 105, 642, 241], from: [-400, 0], round: true }],
  male_casualsuit06: [{ at: [450, 112, 646, 210], from: [0, 170] }, { at: [196, 108, 304, 172], from: [0, 170] }, { at: [748, 148, 782, 192], from: [0, 80] }],
  female_casualsuit01: [{ at: [728, 158, 892, 314], from: [-170, 0], round: true }],
  female_casualsuit02: [{ at: [728, 158, 892, 314], from: [-170, 0], round: true }],
  shoes05: [{ at: [456, 512, 548, 568], from: [-100, 0], round: true }],
  shoes06: [{ at: [474, 814, 534, 846], from: [0, 36] }, { at: [480, 398, 570, 448], from: [-150, -20] }],
};
// each patch covers its rect completely and fades out over a few pixels around it
async function scrub(sharp: any, img: Buffer, ops: Scrub[]) {
  const comps = [], f = 8, cl = (v: number) => Math.max(0, Math.min(1024, v));
  for (const o of ops) {
    const x0 = cl(o.at[0] - f), y0 = cl(o.at[1] - f), w = cl(o.at[2] + f) - x0, h = cl(o.at[3] + f) - y0;
    const patch = await sharp(img).extract({ left: Math.max(0, Math.min(1024 - w, x0 + o.from[0])), top: Math.max(0, Math.min(1024 - h, y0 + o.from[1])), width: w, height: h }).png().toBuffer();
    const [l, t, r, b] = [o.at[0] - x0 - f / 2, o.at[1] - y0 - f / 2, o.at[2] - x0 + f / 2, o.at[3] - y0 + f / 2];
    const shape = o.round ? `<ellipse cx="${(l + r) / 2}" cy="${(t + b) / 2}" rx="${(r - l) / 2}" ry="${(b - t) / 2}"/>` : `<rect x="${l}" y="${t}" width="${r - l}" height="${b - t}"/>`;
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f / 4}"/></filter></defs><g fill="#fff" filter="url(#b)">${shape}</g></svg>`);
    comps.push({ input: await sharp(patch).ensureAlpha().composite([{ input: await sharp(mask).png().toBuffer(), blend: 'dest-in' }]).png().toBuffer(), left: x0, top: y0 });
  }
  return comps.length ? sharp(img).composite(comps).png().toBuffer() : img;
}

async function human(id: string, gender: 'male' | 'female', title: string, skins: Record<string, string>, hair: string[], brows: string) {
  const packId = `human-pack-${gender}`;
  if (!want(id) && !want(packId)) return;
  const dir = join(OUT, id);
  // a pack-only build writes the base's files somewhere else: the base stays exactly as it is
  const h = buildHuman({ id, gender, outDir: want(id) ? dir : join(tmpdir(), `gamemog-human-${gender}`), hair, brows, skins: Object.fromEntries(Object.entries(skins).map(([k, v]) => [k, `makehuman-system/skins/${v}`])),
    pack: want(packId) ? { hair: PACK_HAIR, outfits: [...PACK_OUTFITS[gender], ...PACK_SHARED] } : undefined });
  if (h.pack) await humanPack(packId, id, gender, h.pack);
  if (!want(id)) return;

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
    ...BRAWL.map(([file, clip, name, loop, start, end]) => retargetGltf(h.skeleton, `quaternius-ual/${file}`, clip, { name, loop, start, end })),
    ...CMU_STREET.map((c) => cmuCut(h.skeleton, c, gender)),
    ...FREEFLOW.map(([clip, name, contact, start]) => retargetGltf(h.skeleton, 'spiderbench-hero-moves/hero-rig.glb', clip, { name, rig: 'spiderbench', start, contact, inPlace: true })),
  ];
  const packed = packClips(clips);
  writeFileSync(join(dir, 'clips.bin.z'), deflateSync(packed.buffer, { level: 9 }));
  // compress the body too
  const body = readFileSync(join(dir, 'body.bin'));
  writeFileSync(join(dir, 'body.bin.z'), deflateSync(body, { level: 9 }));
  rmSync(join(dir, 'body.bin'));
  const asset = { ...h.asset, body: 'body.bin.z', clips: { file: 'clips.bin.z', layout: packed.layout, list: packed.meta, credits: { run: `CMU ${bestTrial}`, sprint: `derived from CMU ${bestTrial}`, idle: 'CMU 90_16 (standing)', start: 'CMU 104_53', fall: 'CMU 90_16', ...Object.fromEntries([...COMBAT, ...BRAWL].map(([file, clip, name]) => [name, `Quaternius ${file.replace('_Standard.glb', '')} ${clip}`])), ...Object.fromEntries(CMU_STREET.map(([trial, name, , , , o]) => [name, o?.female ? `CMU ${trial} (men), ${o.female[0]} (women)` : `CMU ${trial}`])), ...Object.fromEntries(FREEFLOW.map(([clip, name]) => [name, `Spiderbench ${clip}`])) } } };
  writeFileSync(join(dir, 'asset.json'), JSON.stringify(asset));
  library[id] = {
    kind: 'human', title,
    description: `A realistic ${gender === 'male' ? 'male' : 'female'} athlete: MakeHuman body shaped for sprinting, ${Object.keys(skins).length} skin tones, ${hair.length} hairstyles, eyes, eyebrows and eyelashes, a paintable kit (${gender === 'male' ? 'singlet' : 'crop top'}, shorts and spikes), five body morphs and a 66-bone rig with motion-captured run, sprint, idle, standing start and fall, and sword motion: a guard, three cuts, a lunge, a hit and a death.`,
    sources: ['makehuman', 'makehuman-system', 'cmu-mocap', 'quaternius-ual', 'spiderbench-hero-moves'],
    derived: 'Body shaped with MakeHuman targets; rig reduced from 163 to 66 bones; running motion retargeted from CMU captures (the sprint clip amplifies the captured run); the street fight (a boxer\'s guard and footwork, jab, cross, hook) and street life (casual, cool, heavyset and women\'s walks, walking backwards, a jog, shifting weight, arguing, a shrug, a wave) retargeted from CMU captures; sword motion, hits, a roll, getting up, a phone call, folded arms, talking, dancing, sitting and picking something up retargeted from Quaternius\'s Universal Animation Library; freeflow punches, a kick, a rising uppercut and a leaping kick retargeted from Spiderbench\'s hero rig (the clips only).',
    meta: { skins: Object.keys(skins), hair, morphs: Object.keys(h.asset.morphs as object), clips: packed.meta.map((c) => c.name), vertices: h.asset.vertexCount, bones: h.skeleton.length },
    files: {}, bytes: 0,
  };
  console.log(`${id}: ${h.asset.vertexCount} vertices, ${h.skeleton.length} bones, run from ${bestTrial} at ${run.speed.toFixed(2)} m/s over ${(run.frames / run.fps).toFixed(2)}s`);
}

// the pack's files: its geometry (deflated), hair at 512 px, each garment's colour with its ambient occlusion baked in
// and its normal map at 1024 px, and the middle-aged and old skins as the base's (2048 px and a 1024 px low)
async function humanPack(id: string, base: string, gender: 'male' | 'female', p: NonNullable<ReturnType<typeof buildHuman>['pack']>) {
  const sharp = (await import('sharp')).default, dir = join(OUT, id), src = (f: string) => join('assets-src/cache/makehuman-system', f);
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'pack.bin.z'), deflateSync(p.buffer, { level: 9 }));
  const hair: Record<string, { group: number; texture: string }> = {};
  for (const [h, v] of Object.entries(p.hair)) { await sharp(src(v.texture)).resize({ width: 512 }).png({ compressionLevel: 9, palette: false }).toFile(join(dir, `hair-${h}.png`)); hair[h] = { group: v.group, texture: `hair-${h}.png` }; }
  const outfits: Record<string, unknown> = {};
  for (const [o, v] of Object.entries(p.outfits)) {
    // logos are covered on the flat diffuse: plain cloth matches there, before the AO's folds are multiplied in
    const at1024 = (f: string) => sharp(src(f)).resize(1024, 1024, { fit: 'fill' }).removeAlpha();
    let img = sharp(await scrub(sharp, await at1024(v.diffuse).png().toBuffer(), SCRUB[o] || []));
    if (v.ao) img = img.composite([{ input: await at1024(v.ao).grayscale().toColorspace('srgb').toBuffer(), blend: 'multiply' }]);
    await img.jpeg({ quality: 84, mozjpeg: true }).toFile(join(dir, `${o}.jpg`));
    if (v.normal) await at1024(v.normal).jpeg({ quality: 90, mozjpeg: true }).toFile(join(dir, `${o}-normal.jpg`));
    outfits[o] = { group: v.group, slot: v.slot, zDepth: v.zDepth, hide: v.hide, diffuse: `${o}.jpg`, normal: v.normal ? `${o}-normal.jpg` : null };
  }
  const skins: Record<string, { hi: string; lo: string }> = {};
  for (const age of ['middleage', 'old']) for (const eth of ['african', 'asian', 'caucasian']) {
    const sd = `skins/${age}_${eth}_${gender}`, png = readdirSync(src(sd)).find((f) => f.endsWith('.png'))!, name = `${eth}-${age === 'old' ? 'old' : 'middle'}`;
    await sharp(src(`${sd}/${png}`)).resize({ width: 2048 }).removeAlpha().jpeg({ quality: 84, mozjpeg: true }).toFile(join(dir, `skin-${name}.jpg`));
    await sharp(src(`${sd}/${png}`)).resize({ width: 1024 }).removeAlpha().jpeg({ quality: 80, mozjpeg: true }).toFile(join(dir, `skin-${name}-lo.jpg`));
    skins[name] = { hi: `skin-${name}.jpg`, lo: `skin-${name}-lo.jpg` };
  }
  writeFileSync(join(dir, 'asset.json'), JSON.stringify({ format: 'gmasset/1', kind: 'human-pack', for: base, gender, file: 'pack.bin.z', layout: p.layout, vertexCount: p.vertexCount,
    groups: p.groups, morphs: p.morphs, base: p.base, hair, outfits, skins }));
  library[id] = {
    kind: 'human-pack', title: `People pack (${gender})`,
    description: `What a world adds to the ${gender} human by listing it: ${Object.keys(hair).length} more hairstyles, ${Object.keys(outfits).length} garments (${Object.keys(outfits).filter((o) => /suit/.test(o)).length} outfits, shoes and hats) fitted to the body, the middle-aged and old skins of each tone, and two more body shapes, age and weight.`,
    sources: ['makehuman', 'makehuman-system'],
    derived: 'Fitted to the base human in the same build (its rig, its morphs); each garment hides the skin under it; colours with their ambient occlusion baked in; hair at 512 px, garments at 1024 px.',
    meta: { hair: Object.keys(hair), outfits: Object.keys(outfits), skins: Object.keys(skins), morphs: Object.keys(p.base.morphs), vertices: p.vertexCount }, files: {}, bytes: 0,
  };
  console.log(`${id}: ${p.vertexCount} vertices, ${Object.keys(hair).length} hairstyles, ${Object.keys(outfits).length} garments, ${Object.keys(skins).length} skins`);
}

await human('human-athlete-male', 'male', 'Athlete (male)', {
  african: 'young_african_male/young_darkskinned_male_diffuse.png',
  caucasian: 'young_caucasian_male/young_lightskinned_male_diffuse.png',
  caucasian2: 'young_caucasian_male2/young_lightskinned_male_diffuse2.png',
  asian: 'young_asian_male/young_lightskinned_male_diffuse3.png',
}, ['short02', 'short04', 'afro01'], 'eyebrow001');
await human('human-athlete-female', 'female', 'Athlete (female)', {
  african: 'young_african_female/young_darkskinned_female_diffuse.png',
  caucasian: 'young_caucasian_female/young_lightskinned_female_diffuse.png',
  asian: 'young_asian_female/young_lightskinned_female_diffuse3.png',
}, ['short02', 'short04', 'afro01'], 'eyebrow010');

if (want('hdri-sunset-city')) {
  const id = 'hdri-sunset-city', dir = join(OUT, id);
  const sky = buildHdri('polyhaven/sunset_jhbcentral_1k.hdr', dir);
  writeFileSync(join(dir, 'asset.json'), JSON.stringify({ format: 'gmasset/1', kind: 'hdri', ...sky, encoding: 'rgbe' }));
  library[id] = { kind: 'hdri', title: 'City sunset sky', description: 'A golden-hour sky over a city, for image-based light and reflections (1024 x 512, full dynamic range).', sources: ['polyhaven'], meta: { width: sky.width, height: sky.height }, files: {}, bytes: 0 };
}

if (want('texture-asphalt-track')) {
  // a scanned race-track surface, 2 m square in the world: colour, normal (OpenGL) and roughness
  const id = 'texture-asphalt-track', dir = join(OUT, id), src = 'assets-src/cache/polyhaven-asphalt-track/';
  mkdirSync(dir, { recursive: true });
  copyFileSync(src + 'asphalt_track_diff_1k.jpg', join(dir, 'color.jpg'));
  copyFileSync(src + 'asphalt_track_nor_gl_1k.jpg', join(dir, 'normal.jpg'));
  copyFileSync(src + 'asphalt_track_rough_1k.jpg', join(dir, 'roughness.jpg'));
  writeFileSync(join(dir, 'asset.json'), JSON.stringify({ format: 'gmasset/1', kind: 'texture', size: 2, maps: { color: 'color.jpg', normal: 'normal.jpg', roughness: 'roughness.jpg' } }));
  library[id] = { kind: 'texture', title: 'Race-track asphalt', description: 'Scanned asphalt from a race track (colour, normal and roughness maps, 1024 px for 2 m of road), for track surfaces that hold up close.', sources: ['polyhaven-asphalt-track'], meta: { size: 2, maps: ['color', 'normal', 'roughness'] }, files: {}, bytes: 0 };
}
if (want('music-dance-field')) {
  // a recorded track, measured and made to loop (see music.ts)
  const id = 'music-dance-field', dir = join(OUT, id);
  const m = buildMusic('centurion-dance-field/dance_field_2.wav', dir, { lo: 100, hi: 180, kbps: 192 });
  writeFileSync(join(dir, 'asset.json'), JSON.stringify({ format: 'gmasset/1', kind: 'music', ...m }));
  library[id] = { kind: 'music', title: 'Dance Field', description: `Upbeat retro electro, ${m.bpm} BPM: the opening once, then ${m.loop.bars} bars that loop seamlessly.`, sources: ['centurion-dance-field'], derived: 'Measured for loudness (BS.1770) and tempo; brought under full scale; cut to loop on a phrase with a crossfaded join; encoded to AAC.', meta: { bpm: m.bpm, duration: m.duration, loop: m.loop, lufs: m.lufs }, files: {}, bytes: 0 };
  console.log(`${id}: ${m.bpm} BPM, loop ${m.loop.start.toFixed(2)}-${m.loop.end.toFixed(2)} s (${m.loop.bars} bars), ${m.lufs} LUFS`);
}

/* ---------------- the city map's textures (lib/runtime/maps/city), from Spiderbench ---------------- */
// Recompressed for the web (57 MB of PNGs to a fraction): colour maps to WebP, the tall layer atlases to
// JPEG (WebP stops at 16383 px), normals at 1024 px, the noise lossless. The shop-sign atlas is GameMog's
// own, drawn here in the original's layout with invented names (the original carried real brands).
if (want('city-midtown')) {
  const sharp = (await import('sharp')).default;
  const id = 'city-midtown', dir = join(OUT, id), src = 'assets-src/cache/spiderbench-city/';
  mkdirSync(dir, { recursive: true });
  const files: Record<string, string> = {};
  const webp = async (name: string, from: string, o: { width?: number; q?: number; lossless?: boolean } = {}) => {
    let im = sharp(src + from); if (o.width) im = im.resize({ width: o.width });
    await im.webp({ quality: o.q ?? 82, lossless: !!o.lossless, alphaQuality: 90, effort: 6 }).toFile(join(dir, name + '.webp')); files[name] = name + '.webp';
  };
  const jpeg = async (name: string, from: string, o: { width?: number; q?: number } = {}) => {
    let im = sharp(src + from); if (o.width) im = im.resize({ width: o.width });
    await im.jpeg({ quality: o.q ?? 82, mozjpeg: true }).toFile(join(dir, name + '.jpg')); files[name] = name + '.jpg';
  };
  await webp('asphalt_col', 'asphalt_col.png', { q: 80 }); await webp('asphalt_nrm', 'asphalt_nrm.png', { width: 1024, q: 88 });
  await webp('asphalt_macro', 'asphalt_macro.png', { q: 85 });
  await webp('sidewalk_col', 'sidewalk_col.png', { q: 80 }); await webp('sidewalk_nrm', 'sidewalk_nrm.png', { q: 88 });
  await jpeg('walls_col', 'walls_col.jpg', { width: 768, q: 82 }); await webp('walls_nrm', 'walls_nrm.webp', { q: 88 }); await jpeg('walls_hao', 'walls_hao.jpg', { q: 84 });
  await webp('interiors', 'interiors.png', { q: 78 }); await webp('markings', 'markings.png', { q: 88 }); await webp('leaves', 'leaves.png', { q: 85 });
  await webp('grass_col', 'grass_col.png', { q: 80 }); await webp('grass_nrm', 'grass_nrm.png', { q: 88 }); await webp('water_nrm', 'water_nrm.png', { q: 90 });
  await webp('noise', 'noise.png', { lossless: true }); await webp('detail_nrm', 'detail_nrm.png', { q: 90 });
  await jpeg('roof_col', 'roof_col.png', { q: 82 }); await webp('roof_nrm', 'roof_nrm.png', { q: 88 });
  for (const f of ['curb_col', 'asphalt_decals', 'roofplants', 'bark_col', 'bark_nrm']) { copyFileSync(src + f + '.webp', join(dir, f + '.webp')); files[f] = f + '.webp'; }
  copyFileSync(src + 'markings.json', join(dir, 'markings.json')); files.markings_rects = 'markings.json';
  // street furniture and rooftop clutter (vertex-coloured, no images) and the street trees' leaf cards
  const psrc = 'assets-src/cache/spiderbench-city-props/';
  copyFileSync(psrc + 'props.glb', join(dir, 'props.glb')); files.props = 'props.glb';
  await sharp(psrc + 'props/leaves_col.png').webp({ quality: 85, alphaQuality: 90, effort: 6 }).toFile(join(dir, 'tree_leaves_col.webp')); files.tree_leaves_col = 'tree_leaves_col.webp';
  await sharp(psrc + 'props/leaves_nrm.png').webp({ quality: 88, effort: 6 }).toFile(join(dir, 'tree_leaves_nrm.webp')); files.tree_leaves_nrm = 'tree_leaves_nrm.webp';
  // the shop signs: 16 bands of 1024 x 128, the original's colours, names of our own
  const SIGNS: [string, string, string, boolean][] = [
    ['DELI &amp; GROCERY', '#1F6B36', '#F4EFC8', false], ['PIZZA', '#B3191C', '#F2C14E', true], ['CORNER PHARMACY', '#EEF1F4', '#B8202C', false],
    ['BAGELS &amp; CAFE', '#2A211C', '#D9AE6A', true], ['CITY SAVINGS BANK', '#1B3F8C', '#FFFFFF', false], ['NAILS  SPA', '#F1CFD8', '#5A1F3A', false],
    ['WINE &amp; LIQUOR', '#5E1424', '#F1E2C4', true], ['HARDWARE', '#E3A21D', '#1A1A1A', false], ['SUB SHOP', '#1D7A3A', '#F7E21C', false],
    ['DINER', '#1E3A7A', '#F2C14E', true], ['SHOES', '#0E0E0E', '#F4F4F4', false], ['THAI KITCHEN', '#9A6A1E', '#2A1A0A', true],
    ['DRY CLEANERS', '#3F8FC8', '#FFFFFF', false], ['OPTICAL', '#EEF1F4', '#1A2A5A', false], ['COFFEE', '#5A3A24', '#F2E6D2', true], ['HALAL GYRO', '#C8321C', '#FFFFFF', false],
  ];
  const bands = SIGNS.map(([t, bg, fg, serif], i) => `<g transform="translate(0 ${i * 128})"><rect width="1024" height="128" fill="${bg}"/><rect x="5" y="5" width="1014" height="118" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="6"/>` +
    `<text x="515" y="86" font-family="${serif ? 'Georgia, Times New Roman, serif' : 'Arial Black, Helvetica, Arial, sans-serif'}" font-weight="900" font-size="66" text-anchor="middle" fill="rgba(0,0,0,0.45)">${t}</text>` +
    `<text x="512" y="83" font-family="${serif ? 'Georgia, Times New Roman, serif' : 'Arial Black, Helvetica, Arial, sans-serif'}" font-weight="900" font-size="66" text-anchor="middle" fill="${fg}">${t}</text></g>`).join('');
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="2048">${bands}</svg>`)).webp({ quality: 88 }).toFile(join(dir, 'signs.webp')); files.signs = 'signs.webp';

  // traffic and pedestrians. The geometry ships gzipped (the asset server sends bytes as they are; gzip takes 18.9 MB to
  // ~6 MB) after rounding its floats to what can be seen: positions to 1 part in 4096, normals to 1 in 512, uvs to 1 in 8192
  const nsrc = 'assets-src/cache/spiderbench-city-npc/';
  const round = (f: Float32Array, bits: number) => {
    const u = new Uint32Array(f.buffer, f.byteOffset, f.length), m = ~((1 << bits) - 1) >>> 0, h = 1 << (bits - 1);
    for (let i = 0; i < u.length; i++) if (((u[i] >>> 23) & 255) !== 255) u[i] = ((u[i] + h) & m) >>> 0;
  };
  const owned = (b: Buffer) => { const a = new ArrayBuffer(b.length); new Uint8Array(a).set(b); return a; };
  {
    const g = readFileSync(nsrc + 'vehicles.glb'), ab = owned(g), jl = g.readUInt32LE(12), j = JSON.parse(g.subarray(20, 20 + jl).toString()), b0 = 20 + jl + 8;
    const BITS: Record<string, number> = { POSITION: 11, NORMAL: 14, TEXCOORD_0: 10 }; // TEXCOORD_1 holds whole part ids
    for (const m of j.meshes) for (const p of m.primitives) for (const [k, ai] of Object.entries(p.attributes) as [string, number][]) {
      const a = j.accessors[ai], bv = j.bufferViews[a.bufferView];
      if (a.componentType === 5126 && BITS[k]) round(new Float32Array(ab, b0 + (bv.byteOffset || 0) + (a.byteOffset || 0), a.count * ({ VEC2: 2, VEC3: 3, VEC4: 4 } as any)[a.type]), BITS[k]);
    }
    writeFileSync(join(dir, 'vehicles.glb.gz'), gzipSync(new Uint8Array(ab), { level: 9 })); files.vehicles = 'vehicles.glb.gz';
  }
  {
    const meta = JSON.parse(readFileSync(nsrc + 'npc/people.json', 'utf8')), ab = owned(readFileSync(nsrc + 'npc/people.bin'));
    for (const L of [...meta.variants.flatMap((v: any) => v.lods), ...(meta.dog ? meta.dog.lods : [])]) { round(new Float32Array(ab, L.pos, L.nv * 3), 11); round(new Float32Array(ab, L.nrm, L.nv * 3), 14); }
    round(new Float32Array(ab, meta.anim, meta.frames * meta.nb * 12), 10); // the baked bone matrices
    writeFileSync(join(dir, 'people.bin.gz'), gzipSync(new Uint8Array(ab), { level: 9 })); files.people = 'people.bin.gz';
    copyFileSync(nsrc + 'npc/people.json', join(dir, 'people.json')); files.people_meta = 'people.json';
  }
  copyFileSync(nsrc + 'tex/peds_atlas.webp', join(dir, 'peds_atlas.webp')); files.peds_atlas = 'peds_atlas.webp';
  copyFileSync(nsrc + 'npc/people_bake.webp', join(dir, 'people_bake.webp')); files.people_bake = 'people_bake.webp';
  // the vehicle atlas, repainted where it carried other people's marks: the three Marvel taxi-topper ads (8 tiles of
  // 512 x 170 at the top right), the taxi commission's NYC badge and the transit authority's route and fleet names
  const topper = (x: number, y: number, [t, tag, bg, bg2, fg, acc]: string[]) => `<g transform="translate(${x} ${y})">
    <defs><linearGradient id="g${x}${y}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs>
    <rect width="512" height="170" fill="url(#g${x}${y})"/><rect x="8" y="8" width="496" height="154" fill="none" stroke="${acc}" stroke-width="4" opacity="0.8"/>
    <text x="256" y="92" font-family="Arial Black, Helvetica, Arial, sans-serif" font-weight="900" font-size="${Math.min(62, Math.floor(460 / (t.length * 0.78)))}" text-anchor="middle" fill="${fg}">${t}</text>
    <text x="256" y="136" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${Math.min(24, Math.floor(460 / (tag.length * 0.74)))}" letter-spacing="1" text-anchor="middle" fill="${acc}">${tag}</text></g>`;
  const label = (x: number, y: number, w: number, h: number, bg: string, fg: string, t: string, size: number) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${bg}"/><text x="${x + w / 2}" y="${y + h / 2 + size * 0.36}" font-family="Arial Black, Helvetica, Arial, sans-serif" font-weight="900" font-size="${size}" text-anchor="middle" fill="${fg}">${t}</text>`;
  const paint = `<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048">
    ${topper(1536, 0, ['THE EVENING LEDGER', 'THE CITY, EVERY NIGHT', '#101014', '#2A2A30', '#F4F1E8', '#D11F1F'])}
    ${topper(1536, 170, ['VERIDIAN', 'CLEAN POWER FOR FIVE BOROUGHS', '#0D3B2E', '#1F7A58', '#E9FFF4', '#9DF0C8'])}
    ${topper(1536, 340, ['NOVA LABS', 'THE FUTURE IS PERSONAL', '#1B2F6B', '#3D62C9', '#FFFFFF', '#FFCF33'])}
    ${label(768, 1024, 256, 128, '#F4A900', '#111111', 'TAXI', 64)}
    ${label(0, 1215, 512, 65, '#080808', '#F7A21B', '15  CROSSTOWN  LOCAL', 36)}
    ${label(512, 1248, 512, 64, '#F5F5F2', '#1F4FA8', 'CITY  TRANSIT', 40)}</svg>`;
  await sharp(nsrc + 'tex/vehicles_atlas2.webp').composite([{ input: Buffer.from(paint) }]).webp({ quality: 88, effort: 6 }).toFile(join(dir, 'vehicles_atlas.webp')); files.vehicles_atlas = 'vehicles_atlas.webp';
  writeFileSync(join(dir, 'asset.json'), JSON.stringify({ format: 'gmasset/1', kind: 'city', files }));
  library[id] = { kind: 'city', title: 'City district', description: 'Asphalt, sidewalks, curbs, road markings, facades (16 wall layers with their normals and weathering), roofs, building interiors seen through the windows, grass and leaves, the street furniture and rooftop clutter, and the life on the streets: 13 kinds of car, van, truck and bus at three levels of detail, and 24 kinds of pedestrian (and their dogs) with 27 baked animations. What the city map builds its streets and blocks from.',
    sources: ['spiderbench-city', 'spiderbench-city-props', 'spiderbench-city-npc'], derived: 'Recompressed for the web (colour to WebP, the layer atlases to JPEG, normals to 1024 px). The shop-sign atlas is GameMog’s own, drawn in the original’s layout with invented names. On the vehicle atlas the three taxi-topper ads, the taxi badge and the bus names are repainted with GameMog’s own. Car and people geometry rounded to well under a millimetre and gzipped.', meta: { files: Object.keys(files).length }, files: {}, bytes: 0 };
}

/* ---------------- skies: photographed, for light, reflections and the visible sky ---------------- */
// view: for a photograph with land in it, where across the picture (0..1 of its
// width) the thing a world lines up with lies: the sea off the beach, the
// skyline across the river. ctx.sky({ hdri, face }) turns that way.
const SKIES: [string, string, string, string, number?][] = [
  ['sky-noon', 'qwantani_noon_puresky', 'Noon', 'A clear noon sky over open country (2048 x 1024, full dynamic range).'],
  ['sky-partly-cloudy', 'kloofendal_48d_partly_cloudy_puresky', 'Partly cloudy', 'A bright day with drifting cumulus (2048 x 1024).'],
  ['sky-sunset', 'qwantani_sunset_puresky', 'Sunset', 'The sun on the horizon, a warm sky (2048 x 1024).'],
  ['sky-dusk', 'qwantani_dusk_2_puresky', 'Dusk', 'After sunset: the glow low, the sky deepening (2048 x 1024).'],
  ['sky-night', 'qwantani_night_puresky', 'Night', 'A clear night sky with stars (2048 x 1024).'],
  ['sky-overcast', 'kloofendal_overcast_puresky', 'Overcast', 'A soft grey overcast day (2048 x 1024).'],
  ['sky-beach', 'spiaggia_di_mondello', 'Beach', 'A Mediterranean beach at midday: the sea to the horizon, bright sand (2048 x 1024).', 0.058],
  ['sky-city-night', 'shanghai_bund', 'City at night', 'A waterfront city at night: towers, neon and river light (2048 x 1024).', 0.59],
];
for (const [id, slug, title, description, view] of SKIES) {
  if (!want(id)) continue;
  const dir = join(OUT, id), src = `ph-sky-${slug}`;
  const sky = buildHdri(`${src}/${slug}_2k.hdr`, dir);
  writeFileSync(join(dir, 'asset.json'), JSON.stringify({ format: 'gmasset/1', kind: 'hdri', ...sky, encoding: 'rgbe', ...(view != null ? { view } : {}) }));
  library[id] = { kind: 'hdri', title, description, sources: [src], meta: { width: sky.width, height: sky.height }, files: {}, bytes: 0 };
}

/* ---------------- surfaces: scanned colour, normal and roughness ---------------- */
const SURFACES: [string, string, string, number, string][] = [
  ['texture-sand', 'sand_01', 'Sand', 2, 'Fine beach sand, rippled.'],
  ['texture-grass', 'leafy_grass', 'Grass', 2, 'A leafy lawn.'],
  ['texture-plaster', 'white_plaster_02', 'White plaster', 2, 'Painted plaster and stucco, for walls.'],
  ['texture-concrete', 'concrete_floor_02', 'Concrete', 2, 'A worn concrete floor or pavement.'],
  ['texture-brick', 'red_brick_03', 'Brick', 2, 'Red brick in courses.'],
  ['texture-planks', 'weathered_brown_planks', 'Weathered planks', 2, 'Old boards: boardwalks, piers, decks.'],
  ['texture-rock', 'rock_face_03', 'Rock face', 4, 'A rock face, for cliffs and cuttings.'],
  ['texture-snow', 'snow_02', 'Snow', 2, 'Packed snow.'],
  ['texture-forest-floor', 'forrest_ground_01', 'Forest floor', 2, 'Leaf litter, twigs and soil.'],
  ['texture-cobblestone', 'cobblestone_floor_04', 'Cobblestones', 2, 'A cobbled street.'],
  ['texture-bark', 'bark_brown_02', 'Bark', 1, 'Brown tree bark, for trunks.'],
  ['texture-corrugated-metal', 'corrugated_iron', 'Corrugated metal', 2, 'Corrugated iron sheeting.'],
];
for (const [id, slug, title, size, description] of SURFACES) {
  if (!want(id)) continue;
  const dir = join(OUT, id), src = `assets-src/cache/ph-tex-${slug}/`;
  mkdirSync(dir, { recursive: true });
  copyFileSync(src + `${slug}_diff_1k.jpg`, join(dir, 'color.jpg'));
  copyFileSync(src + `${slug}_nor_gl_1k.jpg`, join(dir, 'normal.jpg'));
  copyFileSync(src + `${slug}_rough_1k.jpg`, join(dir, 'roughness.jpg'));
  writeFileSync(join(dir, 'asset.json'), JSON.stringify({ format: 'gmasset/1', kind: 'texture', size, maps: { color: 'color.jpg', normal: 'normal.jpg', roughness: 'roughness.jpg' } }));
  library[id] = { kind: 'texture', title, description: `${description} Scanned colour, normal and roughness maps, 1024 px for ${size} m.`, sources: [`ph-tex-${slug}`], meta: { size, maps: ['color', 'normal', 'roughness'] }, files: {}, bytes: 0 };
}

/* ---------------- models: scanned, cut to a game budget ---------------- */
const MODELS: [string, string, string, number, string][] = [
  ['model-boulder', 'boulder_01', 'Boulder', 6000, 'A weathered boulder about 1.8 m tall.'],
  ['model-mossy-rocks', 'rock_moss_set_01', 'Mossy rocks', 9000, 'Six mossy rocks, each its own part (rock01 to rock06).'],
  ['model-coastal-cliff', 'coastal_cliff_04', 'Coastal cliff', 40000, 'A sea cliff 87 m long and 11 m high.'],
  ['model-fern', 'fern_02', 'Fern', 6000, 'Four ferns, each its own part (a to d).'],
  ['model-shrub', 'shrub_01', 'Shrub', 16000, 'A leafy shrub about 2.6 m across.'],
  ['model-grass', 'grass_medium_01', 'Grass clumps', 12000, 'Seventeen clumps of grass, small to tall, each its own part.'],
  ['model-street-lamp', 'street_lamp_01', 'Street lamp', 6000, 'A 3.9 m cast-iron street lamp with its glass and bulb.'],
  ['model-concrete-barrier', 'concrete_road_barrier', 'Concrete barrier', 3000, 'A concrete road barrier 1.5 m long.'],
  ['model-fire-hydrant', 'fire_hydrant', 'Fire hydrant', 8000, 'A fire hydrant, new and aged (parts fire_hydrant and fire_hydrant_aged).'],
  ['model-street-seating', 'modular_street_seating', 'Street seating', 8000, 'Modular street benches: legs, seats, backs and connectors as parts.'],
];
for (const [id, slug, title, budget, description] of MODELS) {
  if (!want(id)) continue;
  const dir = join(OUT, id);
  const m = await buildModel(`ph-model-${slug}`, dir, { budget });
  writeFileSync(join(dir, 'asset.json'), JSON.stringify({ format: 'gmasset/1', kind: 'model', ...m }));
  library[id] = { kind: 'model', title, description: `${description} Scanned, with colour, normal and ambient-occlusion/roughness/metal maps; ${m.triangles.kept} triangles.`, sources: [`ph-model-${slug}`], derived: `Cut from ${m.triangles.source} to ${m.triangles.kept} triangles with meshoptimizer; transforms baked; parts named after the scan's nodes.`, meta: { parts: Object.keys(m.parts), triangles: m.triangles.kept }, files: {}, bytes: 0 };
  console.log(`${id}: ${m.triangles.source} -> ${m.triangles.kept} triangles, parts ${Object.keys(m.parts).join(', ')}`);
}

/* ---------------- more music for the creator's picker ---------------- */
const TRACKS: [string, string, string, string, [number, number]][] = [
  ['music-funky-house', 'ofdn-funky-house', 'Funky House', 'Funky house', [110, 135]],
  ['music-slampe', 'fupi-slampe', 'Slampe', 'Synthwave house', [100, 140]],
  ['music-vengeance-electro', 'ofdn-vengeance-electro', 'Vengeance Electro', 'Electro', [110, 150]],
  ['music-liquid-flame', 'ofdn-liquid-flame', 'Liquid Flame', 'Electronic', [100, 180]],
];
for (const [id, src, title, style, [lo, hi]] of TRACKS) {
  if (!want(id)) continue;
  const dir = join(OUT, id);
  const m = buildMusic(`${src}/${src}.wav`, dir, { lo, hi, kbps: 192 });
  writeFileSync(join(dir, 'asset.json'), JSON.stringify({ format: 'gmasset/1', kind: 'music', ...m }));
  library[id] = { kind: 'music', title, description: `${style}, ${m.bpm} BPM: the opening once, then ${m.loop.bars} bars that loop seamlessly.`, sources: [src], derived: 'Measured for loudness (BS.1770) and tempo; brought under full scale; cut to loop on a phrase with a crossfaded join; encoded to AAC.', meta: { bpm: m.bpm, duration: m.duration, loop: m.loop, lufs: m.lufs }, files: {}, bytes: 0 };
  console.log(`${id}: ${m.bpm} BPM, loop ${m.loop.start.toFixed(1)}-${m.loop.end.toFixed(1)} s (${m.loop.bars} bars, similarity ${m.loop.similarity}), ${m.lufs} LUFS`);
}

// hash every file, and record which licences cover each asset
for (const [id, e] of Object.entries(library)) {
  for (const f of readdirSync(join(OUT, id)).sort()) {
    const data = readFileSync(join(OUT, id, f));
    e.files[f] = { sha256: sha256(data), bytes: data.length }; e.bytes += data.length;
  }
}
// with ONLY, everything not rebuilt stays as the library had it
const previous = ONLY ? (JSON.parse(readFileSync(join(OUT, 'library.json'), 'utf8')).assets as typeof library) : {};
const assets = ONLY ? Object.fromEntries(Object.keys({ ...previous, ...library }).map((id) => [id, library[id] ?? previous[id]])) : library;
const manifest = {
  format: 'gamemog-library/1',
  note: 'Every file here is listed with its SHA-256; every asset names the sources it was built from and their licences. Built by scripts/assets/build.ts from assets-src/sources.json.',
  sources: Object.fromEntries(Object.entries(sources).map(([k, s]) => [k, { title: s.title, author: s.author, license: s.license, licenseUrl: s.licenseUrl, licenseText: s.licenseText, homepage: s.homepage }])),
  assets,
};
writeFileSync(join(OUT, 'library.json'), JSON.stringify(manifest, null, 2) + '\n');
const total = Object.values(assets).reduce((a, b) => a + b.bytes, 0);
console.log(`library: ${Object.keys(assets).length} assets, ${(total / 1e6).toFixed(1)} MB in ${OUT}`);
for (const [id, e] of Object.entries(library)) console.log(`  ${id}: ${(e.bytes / 1e6).toFixed(2)} MB, ${Object.keys(e.files).length} files`);
void statSync;
