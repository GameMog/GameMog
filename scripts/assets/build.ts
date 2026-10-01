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
import { deflateSync } from 'node:zlib';
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

function human(id: string, gender: 'male' | 'female', title: string, skins: Record<string, string>, hair: string[], brows: string) {
  if (!want(id)) return;
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
    ...BRAWL.map(([file, clip, name, loop, start, end]) => retargetGltf(h.skeleton, `quaternius-ual/${file}`, clip, { name, loop, start, end })),
    ...CMU_STREET.map((c) => cmuCut(h.skeleton, c, gender)),
  ];
  const packed = packClips(clips);
  writeFileSync(join(dir, 'clips.bin.z'), deflateSync(packed.buffer, { level: 9 }));
  // compress the body too
  const body = readFileSync(join(dir, 'body.bin'));
  writeFileSync(join(dir, 'body.bin.z'), deflateSync(body, { level: 9 }));
  rmSync(join(dir, 'body.bin'));
  const asset = { ...h.asset, body: 'body.bin.z', clips: { file: 'clips.bin.z', layout: packed.layout, list: packed.meta, credits: { run: `CMU ${bestTrial}`, sprint: `derived from CMU ${bestTrial}`, idle: 'CMU 90_16 (standing)', start: 'CMU 104_53', fall: 'CMU 90_16', ...Object.fromEntries([...COMBAT, ...BRAWL].map(([file, clip, name]) => [name, `Quaternius ${file.replace('_Standard.glb', '')} ${clip}`])), ...Object.fromEntries(CMU_STREET.map(([trial, name, , , , o]) => [name, o?.female ? `CMU ${trial} (men), ${o.female[0]} (women)` : `CMU ${trial}`])) } } };
  writeFileSync(join(dir, 'asset.json'), JSON.stringify(asset));
  library[id] = {
    kind: 'human', title,
    description: `A realistic ${gender === 'male' ? 'male' : 'female'} athlete: MakeHuman body shaped for sprinting, ${Object.keys(skins).length} skin tones, ${hair.length} hairstyles, eyes, eyebrows and eyelashes, a paintable kit (${gender === 'male' ? 'singlet' : 'crop top'}, shorts and spikes), five body morphs and a 66-bone rig with motion-captured run, sprint, idle, standing start and fall, and sword motion: a guard, three cuts, a lunge, a hit and a death.`,
    sources: ['makehuman', 'makehuman-system', 'cmu-mocap', 'quaternius-ual'],
    derived: 'Body shaped with MakeHuman targets; rig reduced from 163 to 66 bones; running motion retargeted from CMU captures (the sprint clip amplifies the captured run); the street fight (a boxer\'s guard and footwork, jab, cross, hook) and street life (casual, cool, heavyset and women\'s walks, walking backwards, a jog, shifting weight, arguing, a shrug, a wave) retargeted from CMU captures; sword motion, hits, a roll, getting up, a phone call, folded arms, talking, dancing, sitting and picking something up retargeted from Quaternius\'s Universal Animation Library.',
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
