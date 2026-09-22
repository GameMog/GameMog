#!/usr/bin/env node
/**
 * build-engine.mjs
 *
 * Turns reference/musesprint.original.html into a config-driven engine.
 *
 * The whole platform rests on one decision: generated games are DATA, never
 * code. The engine below is fixed, shipped, and reviewed once; a game is a
 * WorldSpec JSON that fills its holes. That is what makes "change the track
 * without breaking the controls" true by construction rather than by luck,
 * and it is why nothing a model writes ever reaches a <script> tag.
 *
 * Every substitution is asserted. If the source file drifts and an anchor stops
 * matching, this build fails loudly instead of silently shipping a half-
 * parameterised engine.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'reference/musesprint.original.html');

const src = readFileSync(SRC, 'utf8');

/* ---------------------------------------------------------------- split -- */
const css = between(src, '<style>', '</style>', 'stylesheet');
const js = between(src, '<script>', '</script>', 'engine script');
const bodyHtml = extractBody(src);

function between(s, a, b, what) {
  const i = s.indexOf(a), j = s.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error(`could not find ${what}`);
  return s.slice(i + a.length, j);
}
function extractBody(s) {
  const open = s.indexOf('<body>');
  const close = s.lastIndexOf('</body>');
  let b = s.slice(open + 6, close);
  // the engine <script> is injected by the shell, not baked into the markup
  b = b.replace(/<script>[\s\S]*?<\/script>/g, '');
  return b.trim();
}

/* ------------------------------------------------------- substitutions -- */
let out = js;
const applied = [];

function sub(label, find, replace) {
  const before = out;
  if (typeof find === 'string') {
    if (!out.includes(find)) throw new Error(`anchor missing for "${label}":\n${find.slice(0, 160)}`);
    out = out.split(find).join(replace);
  } else {
    if (!find.test(out)) throw new Error(`regex missing for "${label}": ${find}`);
    find.lastIndex = 0;
    out = out.replace(find, replace);
  }
  if (out === before) throw new Error(`substitution "${label}" changed nothing`);
  applied.push(label);
}

/* ---- race shape --------------------------------------------------------- */
sub('laps', 'const LAPS = 3;', 'const LAPS = __W.race.laps;');
sub('roadHalf', 'const ROAD_HALF = 5.9;', 'const ROAD_HALF = __W.track.roadHalf;');
sub('lanes', 'const LANES = [-4.35, -2.61, -0.87, 0.87, 2.61, 4.35];',
  'const LANES = __W.track.lanes;');
sub('racers', /const RACERS = \[[\s\S]*?\n\];/, 'const RACERS = __W.racers;');

/* ---- physics ------------------------------------------------------------ */
sub('drag', 'const DRAG     = 0.345;     // velocity decay per second',
  'const DRAG     = __W.physics.drag;');
sub('maxSpeed', 'const MAXSPEED = 36.0;', 'const MAXSPEED = __W.physics.maxSpeed;');

/* ---- tempo ladder ------------------------------------------------------- */
sub('tempi', /const TEMPI = \[[\s\S]*?\n\];/,
  'const TEMPI = __W.tempi.map(t => Object.assign({}, t));');

/* ---- track geometry ----------------------------------------------------- */
sub('rawPoints', /const RAW = \[[\s\S]*?\n\];/, 'const RAW = __W.track.points;');
sub('trackScale', 'const SCALE = 0.80;', 'const SCALE = __W.track.scale;');

/* ---- atmosphere --------------------------------------------------------- */
sub('lightCol', 'uLightCol: { value: new THREE.Color(0xFFF0D2) },',
  'uLightCol: { value: new THREE.Color(__W.palette.light) },');
sub('skyAmbient', 'uSkyCol:   { value: new THREE.Color(0xBAD2EC) },',
  'uSkyCol:   { value: new THREE.Color(__W.palette.skyAmbient) },');
sub('groundAmbient', 'uGndCol:   { value: new THREE.Color(0x7E8C5E) },',
  'uGndCol:   { value: new THREE.Color(__W.palette.groundAmbient) },');
sub('fogCol', 'uFogCol:   { value: new THREE.Color(0xE7D4B9) },',
  'uFogCol:   { value: new THREE.Color(__W.palette.fog) },');
sub('fogDen', 'uFogDen:   { value: 0.0027 },', 'uFogDen:   { value: __W.palette.fogDensity },');
sub('sceneFog', 'scene.fog = new THREE.FogExp2(0xE7D4B9, 0.0027);',
  'scene.fog = new THREE.FogExp2(__W.palette.fog, __W.palette.fogDensity);');
sub('sunDir', 'uSun: { value: new THREE.Vector3(0.44, 0.40, 0.44).normalize() },',
  'uSun: { value: new THREE.Vector3().fromArray(__W.palette.sunDir).normalize() },');

/* the sky gradient was three GLSL literals; lift them to uniforms */
sub('skyUniformDecl', 'uGrade: { value: new THREE.Color(0xFFFFFF) } },',
  `uGrade: { value: new THREE.Color(0xFFFFFF) },
                uLow:  { value: new THREE.Color(__W.palette.skyLow) },
                uMid:  { value: new THREE.Color(__W.palette.skyMid) },
                uHigh: { value: new THREE.Color(__W.palette.skyHigh) } },`);
sub('skyUniformGlsl', 'varying vec3 vD; uniform vec3 uSun; uniform vec3 uGrade;',
  'varying vec3 vD; uniform vec3 uSun; uniform vec3 uGrade;\n      uniform vec3 uLow; uniform vec3 uMid; uniform vec3 uHigh;');
sub('skyGradient',
  `        vec3 low  = vec3(0.976, 0.902, 0.808);
        vec3 mid  = vec3(0.933, 0.878, 0.816);
        vec3 high = vec3(0.643, 0.749, 0.898);`,
  `        vec3 low = uLow, mid = uMid, high = uHigh;`);

/* ---- terrain ------------------------------------------------------------ */
sub('terrMoss', 'const cMoss  = new THREE.Color(0x8CAE77);',
  'const cMoss  = new THREE.Color(__W.palette.terrain.moss);');
sub('terrPale', 'const cPale  = new THREE.Color(0xB6C994);',
  'const cPale  = new THREE.Color(__W.palette.terrain.pale);');
sub('terrSand', 'const cSand  = new THREE.Color(0xCEB891);',
  'const cSand  = new THREE.Color(__W.palette.terrain.sand);');
sub('terrRose', 'const cRose  = new THREE.Color(0xC9AAA3);',
  'const cRose  = new THREE.Color(__W.palette.terrain.accent);');

/* ---- props -------------------------------------------------------------- */
sub('capPalettes', /  const palettes = \[\n(?:.*\n){4}.*\n  \];/,
  '  const palettes = __W.props.caps.palettes;');
sub('capCount', 'while (placed.length < 130 && tries < 5200){',
  'while (placed.length < __W.props.caps.count && tries < __W.props.caps.count * 40){');
sub('tuftMats',
  '  const mats = [propMat(0xA9C78E, 0x84A96B, 0.28), propMat(0xC7D9A2, 0x9FBC7C, 0.28), propMat(0xDCCBA4, 0xBFA87F, 0.24)];',
  '  const mats = __W.props.tufts.palettes.map(p => propMat(p[0], p[1], 0.27));');
sub('tuftCount', 'for (let i = 0; i < 2600; i++){',
  'for (let i = 0; i < __W.props.tufts.count; i++){');
sub('tuftBucket', 'buckets[(rnd() * 3) | 0].push', 'buckets[(rnd() * mats.length) | 0].push');
sub('lanternSpacing', 'const step = 22, count = Math.floor(TOTAL / step);',
  'const step = __W.props.lanterns.spacing, count = Math.floor(TOTAL / step);');
sub('lanternPost', 'const postMat = propMat(0x9E8564, 0x7A6547, 0.14);',
  'const postMat = propMat(__W.props.lanterns.post, 0x7A6547, 0.14);');
sub('lanternBulb', 'const bulbMat = new THREE.MeshBasicMaterial({ color: 0xFFE9B8 });',
  'const bulbMat = new THREE.MeshBasicMaterial({ color: __W.props.lanterns.bulb });');
sub('lanternGlow', 'glowMat = new THREE.SpriteMaterial({ map: PUFF, color: 0xFFD98F, transparent: true,',
  'glowMat = new THREE.SpriteMaterial({ map: PUFF, color: __W.props.lanterns.glow, transparent: true,');
sub('gatePost', 'const postMat = propMat(0xE3C79A, 0xC2A271, 0.24);',
  'const postMat = propMat(__W.props.gate.post, 0xC2A271, 0.24);');
sub('gateBunting', 'const bunting = propMat(0xEFA79A, 0xD98878, 0.30);',
  'const bunting = propMat(__W.props.gate.banner, 0xD98878, 0.30);');
sub('gateBannerMesh', 'new THREE.MeshBasicMaterial({ color: 0xE9A08E, side: THREE.DoubleSide })',
  'new THREE.MeshBasicMaterial({ color: __W.props.gate.banner, side: THREE.DoubleSide })');
sub('gatePennants', 'color: [0xF6E3CE, 0xC9DCA6, 0xF0C7CF, 0xC5B6E4][i % 4]',
  'color: __W.props.gate.pennants[i % __W.props.gate.pennants.length]');
sub('isletCount', 'for (let i = 0; i < 7; i++){\n    const g = new THREE.Group();',
  'for (let i = 0; i < __W.props.islets.count; i++){\n    const g = new THREE.Group();');
sub('isletCaps', '[0xE9A08E, 0xC9DCA6, 0xC5B6E4][k % 3]',
  '__W.props.islets.caps[k % __W.props.islets.caps.length]');
sub('sporeCount', '  const N = 1700;', '  const N = __W.props.spores.count;');
sub('sporeHue', 'base.setHSL(.10 + rnd() * .10, .55, .78 + rnd() * .16);',
  'base.setHSL(__W.props.spores.hue + rnd() * __W.props.spores.hueSpread, __W.props.spores.sat, .78 + rnd() * .16);');

/* ---- copy --------------------------------------------------------------- */
sub('finishTitles', /const titles = \[[\s\S]*?\];/, 'const titles = __W.copy.placeTitles;');
sub('finishSubs', /const subs = \[\n(?:.*\n){6}  \];/, '  const subs = __W.copy.placeLines;');

/* ---- the character rig -------------------------------------------------- */
/* The creature was a fixed lathe profile and four limb spheres, which made
   every world the same animal in a new colour. It is now built per racer from
   a bounded rig, so bodies, fur, faces and toppers all vary — while the rig
   stays pure data and cannot reach the animation or the controls. */
sub('bodyGeo', /const BODY_GEO = \(\(\) => \{[\s\S]*?\n\}\)\(\);/,
`const BODY_BOT = 0.30, BODY_TOP = 1.975;
const BASE_PROFILE = [
  [0.00, 0.30], [0.24, 0.305], [0.44, 0.355], [0.60, 0.455], [0.71, 0.615],
  [0.765, 0.80], [0.778, 1.00], [0.755, 1.185], [0.708, 1.335], [0.652, 1.455],
  [0.606, 1.555], [0.567, 1.660], [0.516, 1.775], [0.424, 1.878], [0.262, 1.948],
  [0.00, 1.975]
];
const bell = (t, c, w) => Math.exp(-Math.pow((t - c) / w, 2.0));

/* Deform the shipped silhouette rather than inventing one. Every rig is a
   morph of a shape already known to read at racing speed. */
function rigMetrics(R){
  const span = BODY_TOP - BODY_BOT;
  return {
    crownY: BODY_BOT + span * R.height,
    armPivot: [0.72 * R.girth, BODY_BOT + (0.95 - BODY_BOT) * R.height],
    legPivotY: BODY_BOT + 0.15 * R.legLength,
    faceC: [0, BODY_BOT + (1.452 - BODY_BOT) * R.height, 0.135 * R.girth],
    faceR: [0.482, 0.492, 0.455].map(v => v * R.faceSize * (0.86 + 0.14 * R.girth))
  };
}

function buildBody(R){
  const span = BODY_TOP - BODY_BOT;
  const profile = BASE_PROFILE.map(([r, y]) => {
    const t = (y - BODY_BOT) / span;
    let rr = r * R.girth;
    rr *= 1 - bell(t, 0.72, 0.18) * R.headRoom * 0.34 + bell(t, 0.93, 0.13) * R.headRoom * 0.28;
    rr *= 1 + (R.slouch - 0.5) * bell(t, 0.32, 0.30) * 0.40;
    return new THREE.Vector2(Math.max(0, rr), BODY_BOT + (y - BODY_BOT) * R.height);
  });
  const torso = new THREE.LatheGeometry(profile, 34);
  torso.scale(1, 1, 0.955);

  const limb = new THREE.SphereGeometry(1, 16, 12);
  const M = () => new THREE.Matrix4();
  const parts = [{ geo: torso, part: 0 }];

  const armY = BODY_BOT + (0.620 - BODY_BOT) * R.height;
  const arm = s => M().makeTranslation(s * 0.790 * R.girth, armY, 0.020)
    .multiply(M().makeRotationZ(s * -0.21))
    .multiply(M().makeScale(0.198 * R.armGirth, 0.360 * R.armLength, 0.198 * R.armGirth));
  /* legs hang below the body; anchor the foot near the ground whatever the length */
  const legR = 0.268 * R.legLength;
  const legY = BODY_BOT - 0.35 * R.legLength + legR;
  const leg = s => M().makeTranslation(s * 0.245 * R.legStance, legY, 0.005)
    .multiply(M().makeScale(0.196 * R.girth, legR, 0.205 * R.girth));
  parts.push(
    { geo: limb, part: 1, matrix: arm(-1) }, { geo: limb, part: 2, matrix: arm(1) },
    { geo: limb, part: 3, matrix: leg(-1) }, { geo: limb, part: 4, matrix: leg(1) }
  );

  /* Toppers ride on part 0 so they inherit the fur and the body's squash. */
  const m = rigMetrics(R);
  const k = R.topperSize, crown = m.crownY;
  if (R.topper === 'ears'){
    for (const s of [-1, 1]) parts.push({ geo: limb, part: 0,
      matrix: M().makeTranslation(s * 0.30 * R.girth, crown - 0.10, -0.02)
        .multiply(M().makeRotationZ(s * -0.34))
        .multiply(M().makeScale(0.15 * k, 0.26 * k, 0.11 * k)) });
  } else if (R.topper === 'horns'){
    const cone = new THREE.ConeGeometry(1, 1, 10);
    for (const s of [-1, 1]) parts.push({ geo: cone, part: 0,
      matrix: M().makeTranslation(s * 0.26 * R.girth, crown + 0.10 * k, 0.0)
        .multiply(M().makeRotationZ(s * -0.40))
        .multiply(M().makeScale(0.13 * k, 0.40 * k, 0.13 * k)) });
  } else if (R.topper === 'antennae'){
    const stalk = new THREE.CylinderGeometry(1, 1, 1, 6);
    for (const s of [-1, 1]){
      parts.push({ geo: stalk, part: 0,
        matrix: M().makeTranslation(s * 0.16 * R.girth, crown + 0.16 * k, 0.0)
          .multiply(M().makeRotationZ(s * -0.30))
          .multiply(M().makeScale(0.028 * k, 0.34 * k, 0.028 * k)) });
      parts.push({ geo: limb, part: 0,
        matrix: M().makeTranslation(s * 0.26 * R.girth, crown + 0.33 * k, 0.0)
          .multiply(M().makeScale(0.075 * k, 0.075 * k, 0.075 * k)) });
    }
  } else if (R.topper === 'crest'){
    for (let i = 0; i < 3; i++) parts.push({ geo: limb, part: 0,
      matrix: M().makeTranslation(0, crown + (0.05 + i * 0.015) * k, (i - 1) * 0.15 * R.girth)
        .multiply(M().makeScale(0.085 * k, (0.17 - i * 0.03) * k, 0.06 * k)) });
  }

  return mergeParts(parts);
}`);

/* rig pivots and the squash anchor become uniforms so limbs follow the body */
sub('rigUniformDecl', 'uniform float uPhase, uSwing, uLayer, uFurLen;',
  'uniform float uPhase, uSwing, uLayer, uFurLen, uDroop;\nuniform vec2 uArmPivot; uniform float uLegPivotY;');
sub('legPivot', 'vec3 piv = vec3(0.0, 0.45, 0.0);', 'vec3 piv = vec3(0.0, uLegPivotY, 0.0);');
sub('armPivot', 'vec3 piv = vec3(side * 0.72, 0.95, 0.0);',
  'vec3 piv = vec3(side * uArmPivot.x, uArmPivot.y, 0.0);');
sub('furDroop', 'vec3 dir = normalize(n + vec3(0.0, -0.42, 0.0) * uLayer);',
  'vec3 dir = normalize(n + vec3(0.0, -uDroop, 0.0) * uLayer);');
sub('furDensity', '  vec3 cell = floor(vRest * 132.0);', '  vec3 cell = floor(vRest * uDensity);');
sub('furDensityDecl', 'uniform float uLayer; uniform vec3 uFur; uniform vec3 uTip;',
  'uniform float uLayer, uDensity; uniform vec3 uFur; uniform vec3 uTip;');

/* face features become uniforms: a rig can widen the eyes, raise the mouth,
   open the hood, or drop the blush entirely */
sub('faceUniformDecl', 'uniform vec3 uSkin; uniform vec3 uBlush; uniform float uBlink; uniform float uSmile;',
  `uniform vec3 uSkin; uniform vec3 uBlush; uniform float uBlink; uniform float uSmile;
uniform vec3 uInk; uniform float uEyeSize, uEyeSpread, uEyeHeight, uMouthW, uMouthCurve, uBlushAmt;`);
sub('blushL', 'length((f - vec2(-0.575,-0.012)) * vec2(1.0, 1.42))',
  'length((f - vec2(-0.575 * uEyeSpread, -0.012 + uEyeHeight * 0.4)) * vec2(1.0, 1.42))');
sub('blushR', 'length((f - vec2( 0.575,-0.012)) * vec2(1.0, 1.42))',
  'length((f - vec2( 0.575 * uEyeSpread, -0.012 + uEyeHeight * 0.4)) * vec2(1.0, 1.42))');
sub('blushAmt', 'col = mix(col, uBlush, clamp(bl, 0.0, 1.0) * 0.58 * front);',
  'col = mix(col, uBlush, clamp(bl, 0.0, 1.0) * 0.58 * uBlushAmt * front);');
sub('eyeL', 'length((f - vec2(-0.345, 0.150)) * vec2(1.0, 1.0 / eh))',
  'length((f - vec2(-0.345 * uEyeSpread, 0.150 + uEyeHeight)) * vec2(1.0, 1.0 / eh)) / uEyeSize');
sub('eyeR', 'length((f - vec2( 0.345, 0.150)) * vec2(1.0, 1.0 / eh))',
  'length((f - vec2( 0.345 * uEyeSpread, 0.150 + uEyeHeight)) * vec2(1.0, 1.0 / eh)) / uEyeSize');
sub('mouth', 'float sm = ring(f, vec2(0.0,-0.012 + uSmile * 0.03), 0.165 + uSmile * 0.05, 0.046);',
  'float sm = ring(f, vec2(0.0, -0.012 + uSmile * 0.03 + uEyeHeight * 0.25), (0.165 + uSmile * 0.05) * uMouthW, 0.046);');
sub('mouthCut', 'sm *= step(f.y, -0.046) * front;',
  'sm *= step(f.y, -0.046 + uEyeHeight * 0.25 + (1.0 - uMouthCurve) * 0.05) * front;');
sub('catchL', 'length(f - vec2(-0.308, 0.198))',
  'length(f - vec2(-0.308 * uEyeSpread, 0.198 + uEyeHeight))');
sub('catchR', 'length(f - vec2( 0.382, 0.198))',
  'length(f - vec2( 0.382 * uEyeSpread, 0.198 + uEyeHeight))');
sub('ink', 'lit = mix(lit, vec3(0.055, 0.045, 0.042), ink);', 'lit = mix(lit, uInk, ink);');

/* ---- per-racer assembly ------------------------------------------------- */
sub('makeFuzzlingSig', 'function makeFuzzling(furHex){\n  const fur = new THREE.Color(furHex);',
`function makeFuzzling(cfg){
  const R = cfg.rig;
  const geo = buildBody(R);
  const met = rigMetrics(R);
  const faceC = new THREE.Vector3().fromArray(met.faceC);
  const faceR = new THREE.Vector3().fromArray(met.faceR);
  const fur = new THREE.Color(cfg.fur);`);

sub('sharedUniforms', `  const shared = {
    uPhase:   { value: 0 },
    uSwing:   { value: 0 },
    uFur:     { value: fur },
    uTip:     { value: tip },
    uFurLen:  { value: FUR_LEN },
    uFaceC:   { value: FACE_C },
    uFaceDir: { value: FACE_DIR },
    uFaceCos: { value: FACE_COS }
  };`,
`  const shared = {
    uPhase:     { value: 0 },
    uSwing:     { value: 0 },
    uFur:       { value: fur },
    uTip:       { value: tip },
    uFurLen:    { value: FUR_LEN * R.furLength },
    uDensity:   { value: 132.0 * R.furDensity },
    uDroop:     { value: 0.42 },
    uArmPivot:  { value: new THREE.Vector2().fromArray(met.armPivot) },
    uLegPivotY: { value: met.legPivotY },
    uFaceC:     { value: faceC },
    uFaceDir:   { value: FACE_DIR },
    uFaceCos:   { value: R.faceOpen }
  };`);

sub('shellGeo', '    const mesh = new THREE.Mesh(BODY_GEO, m);', '    const mesh = new THREE.Mesh(geo, m);');

sub('faceUniformValues', `  const faceU = {
    uSkin:  { value: skin },
    uBlush: { value: blush },
    uBlink: { value: 0 },
    uSmile: { value: 0 }
  };`,
`  const faceU = {
    uSkin:       { value: skin },
    uBlush:      { value: blush },
    uBlink:      { value: 0 },
    uSmile:      { value: 0 },
    uInk:        { value: new THREE.Color(R.eye) },
    uEyeSize:    { value: R.eyeSize },
    uEyeSpread:  { value: R.eyeSpread },
    uEyeHeight:  { value: R.eyeHeight },
    uMouthW:     { value: R.mouthWidth },
    uMouthCurve: { value: R.mouthCurve },
    uBlushAmt:   { value: R.blush }
  };`);

sub('facePlace', `  face.position.copy(FACE_C);
  face.scale.copy(FACE_R);`, `  face.position.copy(faceC);
  face.scale.copy(faceR);`);

/* the contact shadow and the overhead marker must track a taller or wider body */
sub('shadowSize', 'new THREE.CircleGeometry(0.82, 24),',
  'new THREE.CircleGeometry(0.82 * R.girth, 24),');
sub('fuzzlingReturn', '  return { root, tilt, body, face, shared, faceU, shadow, color: fur };',
  '  return { root, tilt, body, face, shared, faceU, shadow, color: fur, rig: R, metrics: met };');

sub('makeCall', 'const fz = makeFuzzling(cfg.fur);', 'const fz = makeFuzzling(cfg);');

/* the you-marker floats above the crown, not a fixed height */
sub('markerHeight', '  youRing.position.y += 2.52 + Math.sin(clock * 3.4) * 0.11;',
  '  youRing.position.y += you.fz.metrics.crownY + 0.55 + Math.sin(clock * 3.4) * 0.11;');

/* ---- three.js source ---------------------------------------------------- */
sub('cdn', /const CDN = \[[\s\S]*?\n\];/, 'const CDN = __W.runtime.threeSources;');

/* The original chained .then(boot).catch(), so ANY error thrown inside boot()
   was reported to the player as "could not reach the CDN". Separate them. */
sub('bootErrors', /loadThree\(0\)\.then\(boot\)\.catch\(\(\) => \{[\s\S]*?\n\}\);/,
`loadThree(0).then(() => {
  try { boot(); }
  catch (err) {
    console.error('[gamemog] engine failed to boot', err);
    document.getElementById('loading').innerHTML =
      '<div style="text-align:center;padding:30px;line-height:1.7;max-width:640px">' +
      '<b>This world could not start.</b><br><span style="opacity:.7;font-size:13px">' +
      String(err && err.message || err).replace(/[<>]/g, '') + '</span></div>';
    try { parent.postMessage({ source: 'gamemog', type: 'error', message: String(err && err.message || err) }, '*'); } catch (e2) {}
  }
}).catch(() => {
  document.getElementById('loading').innerHTML =
    '<div style="text-align:center;padding:30px;line-height:1.7">Could not reach the three.js CDN.<br>Connect to the internet once and reload.</div>';
});`);

/* ---- tell the host the moment there is something worth looking at, so an
       embed can hold a poster instead of showing an empty canvas -------- */
sub('readySignal', `  if (!started){
    started = true;`,
`  if (!started){
    started = true;
    try { parent.postMessage({ source: 'gamemog', type: 'ready', gameId: __W.meta.id }, '*'); } catch (e) {}`);

/* ---- score reporting: the platform needs a result, the sandbox cannot fetch */
sub('reportResult', `  el('finish').classList.remove('hide');
}`, `  el('finish').classList.remove('hide');
  reportResult(order, place);
}

/* The game runs in a sandboxed iframe with no same-origin access, so it cannot
   talk to the API itself. It posts a result up; the host verifies and stores. */
function reportResult(order, place){
  try {
    parent.postMessage({
      source: 'gamemog',
      type: 'result',
      gameId: __W.meta.id,
      place,
      finished: you.finished,
      timeMs: Math.round((you.finished ? you.finishTime : raceTime) * 1000),
      laps: LAPS,
      tempoReached: T.n,
      locks,
      bestStreak,
      field: order.map(r => ({ name: r.cfg.name, timeMs: r.finished ? Math.round(r.finishTime * 1000) : null }))
    }, '*');
  } catch (e) { /* standalone file, no host listening */ }
}`);

/* ---------------------------------------------------------------- emit -- */
const header = `/* GameMog racing engine — generated by scripts/build-engine.mjs. Do not edit.
 *
 * Reads a validated WorldSpec from window.__WORLD__ and boots a race into
 * <canvas>. No part of a WorldSpec is executed; it only fills numbers, colours,
 * names and counts that this file already knew how to use.
 */
`;

const wrapped = header + `(function(){
const __W = window.__WORLD__;
if (!__W) { document.body.innerHTML = '<p style="font:16px sans-serif;padding:40px">No world supplied.</p>'; return; }
${out}
})();
`;

mkdirSync(join(ROOT, 'public/engine'), { recursive: true });
mkdirSync(join(ROOT, 'lib/engine'), { recursive: true });
writeFileSync(join(ROOT, 'public/engine/engine.js'), wrapped);
writeFileSync(join(ROOT, 'public/engine/engine.css'), css.trim() + '\n');
writeFileSync(join(ROOT, 'lib/engine/body.ts'),
  `/* Generated by scripts/build-engine.mjs. Do not edit. */\nexport const GAME_BODY = ${JSON.stringify(bodyHtml)};\n`);

const decls = (wrapped.match(/\b(?:const|let|var)\s+__W\b/g) || []).length;
if (decls !== 1) throw new Error(`__W is declared ${decls} times; a source block would shadow the world config`);

console.log(`engine.js   ${(wrapped.length / 1024).toFixed(1)} KB`);
console.log(`engine.css  ${(css.length / 1024).toFixed(1)} KB`);
console.log(`body.ts     ${(bodyHtml.length / 1024).toFixed(1)} KB`);
console.log(`\n${applied.length} substitutions applied:`);
console.log('  ' + applied.join(', '));
