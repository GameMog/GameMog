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
