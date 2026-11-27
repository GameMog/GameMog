(function () {
// js/weather.js
// Weather particles round the camera: drizzle, rain, river mist and lakefront wind (CITY-BUILDER-TASK item 5, first for
// Mandi's Revenge's night missions in Chicago). The recipe, not the code, is MengTo/Skills
// agent-skills/3d/ride-particles-and-clouds (MIT): a fixed pool, a wrapped box round the camera, streaks from the last
// frame's positions.
// - A FIXED pool of instanced quads seeded once (POOL: about 900 on a desktop, 425 on a phone or a lower tier), each with
//   its hashed position in the box, its own fall phase, wind phase and size; a mode draws a share of them.
// - Recycling: the box is wrapped round the camera with a POSITIVE modulo (x - B floor(x / B), never the truncated %), so
//   the drops stay put in the world while the box moves with the player; its floor follows the terrain under the camera
//   (and rises with a camera far above it); every drop fades out at both ends of each axis of the wrap, so nothing pops,
//   and takes a new sideways seed each time it wraps back to the top (at the hidden boundary), so the rain never repeats.
// - Motion streaks: each drop is drawn from where it was a moment ago (its own fall and the wind over SHUTTER s) seen by
//   last frame's camera, to where it is now seen by this frame's: rain reads as streaks, longer when the camera moves.
//   The history is reset on a camera cut, a teleport, a cutscene's shot or a floating-origin rebase (cut()).
// - Drawn transparent, depth-tested, no depth writes: drops pass in front of and behind cars, people and buildings.
// - ONE weather state (NYC.Weather.state), shared with the sky: lighting.js (both cities') calls weatherSky() after each
//   preset and each update, so the cloud, the sun let through, the haze and the road's dampness follow the weather; the
//   drops are lit in the vertex stage by the sky (dusk's horizon and its sun, the night's moon) and by the eight
//   brightest lamps near the camera (the street lights' pools and the cars' headlights, each a real three.js light), with
//   the forward scatter that makes rain glint against a light.
// - Design rule (Manhattan review): dry or subtly damp streets, never mirror-wet. A mode sets the road's wetness to at
//   most DAMP: damp stains and a few small pools, the streaks in the air doing the work.
// Switches: ?weather=drizzle|rain|mist|wind (any city), NYC.Weather.set(mode, { intensity, fade }) from the game, and a
// story mission's own `weather` (wagmi/storyrun/runner.js, its night missions: a world's dressing.nightWeather).
// Snow is for later (item 5); ray-marched clouds are never drawn on a phone.

const { THREE } = window.NYC;
const {
  Fn, float, vec2, vec3, vec4, uniform, uniformArray, attribute, positionGeometry, varying, mix, smoothstep, max, min, clamp,
  abs, floor, fract, sin, dot, length, normalize, pow, sqrt, select
} = window.NYC.TSL;
const { cityUniforms } = window.NYC;

const PHONE = (() => {
  try { return !!globalThis.matchMedia?.('(pointer: coarse)').matches || /[?&]mobile\b/.test(location.search); } catch { return false; }
})();
const POOL = PHONE ? 425 : 900;
const LAMPS = 8; // the brightest lights near the camera that light the drops
const SHUTTER = 0.04; // s of a drop's own motion drawn as its streak (a film camera's 1/25 s, a little under)
const MAX_STREAK = 0.22; // longest streak on screen, in NDC (a fast camera pan never smears the rain across it)
const CUT_MOVE = 6; // m the camera may move in one frame before it counts as a cut
const CUT_TURN = Math.cos((24 * Math.PI) / 180); // ... or turn

// Per mode: the share of the pool drawn, the box (m), how fast a drop falls (m/s), the wind (m/s, x and z), the gusts
// (m/s), a drop's width and length (m), its opacity, round (1: soft blobs, mist and debris) or a streak (0), its tint,
// and the sky it brings: cloud cover, the sun let through, the haze's density x, the road's wetness at most
const MODES = {
  clear: null,
  drizzle: { share: 0.8, box: [18, 10, 18], fall: 4.2, wind: [0.7, 0.25], gust: 0.45, w: 0.0065, h: 0.05, alpha: 0.5, round: 0,
    tint: [0.86, 0.9, 0.96], sky: { cloud: 0.74, density: 0.55, sun: 0.62, fog: 1.55, wet: 0.36 } },
  rain: { share: 1.0, box: [16, 10, 16], fall: 9.5, wind: [1.7, 0.55], gust: 0.9, w: 0.0085, h: 0.09, alpha: 0.72, round: 0,
    tint: [0.84, 0.88, 0.95], sky: { cloud: 0.88, density: 0.72, sun: 0.45, fog: 2.0, wet: 0.42 } },
  mist: { share: 0.75, box: [40, 7, 40], fall: 0.05, wind: [0.55, 0.2], gust: 0.25, w: 1.8, h: 1.8, alpha: 0.07, round: 1,
    tint: [0.82, 0.86, 0.9], low: 5.5, sky: { cloud: 0.5, density: 0.42, sun: 0.72, fog: 2.6, wet: 0.3 } },
  wind: { share: 0.9, box: [22, 8, 22], fall: 1.6, wind: [9.5, 2.8], gust: 3.2, w: 0.011, h: 0.03, alpha: 0.6, round: 0,
    tint: [0.74, 0.75, 0.74], sky: { cloud: 0.56, density: 0.45, sun: 0.85, fog: 1.25, wet: 0.2 } }
};
const DAMP = 0.42; // the road's wetness never goes past this in any mode (cityUniforms.uRoadWetness: 1 is a downpour's mirror)

const state = { mode: 'clear', intensity: 0, target: 0, want: 'clear', fade: 2.5, shelter: 0 };
const SHELTER_H = 16; // m: a deck at most this far over the camera shelters it (the drops round it fade out)

// The sky's share of the weather (called by lighting.js after it applies a preset, and after its every-frame update with
// the sun's intensity it set): k is how much of the weather is on, 0..1
// (fresh: the lighting set the sun's intensity anew this frame, San Francisco's and a town's; New York's keeps it from the
// preset, so the weather's last share is taken off before the new one goes on)
function weatherSky(ls, phase, fresh = true) {
  const m = MODES[state.mode], k = m ? state.intensity : 0;
  if (!ls || !ls.sky) return;
  if (phase === 'update') {
    if (!ls.sunLight) return;
    const f = k > 0 ? 1 - (1 - m.sky.sun) * k : 1;
    ls.sunLight.intensity *= fresh ? f : f / (ls._sunK || 1);
    ls._sunK = f;
    return;
  }
  ls._sunK = 1;
  // (after applyPreset: the preset's own values are fresh, the weather's share goes on them)
  ls._weatherBase = { cloud: ls.sky.cloudCoverage.value, density: ls.sky.cloudDensity.value, wet: cityUniforms.uRoadWetness.value,
    fog: ls.uFogDensity ? ls.uFogDensity.value : null, sceneFog: ls.scene.fog ? ls.scene.fog.density : null, hemi: ls.hemiLight.intensity };
  applySkyShare(ls);
}
function applySkyShare(ls) {
  const b = ls._weatherBase;
  if (!b) return;
  const m = MODES[state.mode], k = m ? state.intensity : 0, s = m ? m.sky : null;
  // (nothing to do while the weather is off and was off: the preset's own values, and whatever else set them, stand)
  if (k === 0 && !ls._weatherK) return;
  ls._weatherK = k;
  ls.sky.cloudCoverage.value = k > 0 ? mix1(b.cloud, Math.max(b.cloud, s.cloud), k) : b.cloud;
  ls.sky.cloudDensity.value = k > 0 ? mix1(b.density, Math.max(b.density, s.density), k) : b.density;
  cityUniforms.uRoadWetness.value = k > 0 ? mix1(b.wet, Math.min(DAMP, s.wet), k) : b.wet;
  if (ls.uFogDensity && b.fog !== null) ls.uFogDensity.value = b.fog * (k > 0 ? mix1(1, s.fog, k) : 1);
  if (ls.scene.fog && b.sceneFog !== null) ls.scene.fog.density = b.sceneFog * (k > 0 ? mix1(1, s.fog, k) : 1);
}
const mix1 = (a, b, t) => a + (b - a) * t;

function createWeather(scene, lightingSystem, renderer) {
  const ORIGIN = window.NYC.ORIGIN; // (a floating origin's render offset: absolute = render + ORIGIN)

  // ── the pool: one quad (4 vertices) instanced POOL times, seeds hashed once ──
  const geo = new THREE.InstancedBufferGeometry();
  // corner.x across the streak (-1..1), corner.y along it (0 = where the drop was, 1 = where it is)
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const s1 = new Float32Array(POOL * 4), s2 = new Float32Array(POOL * 4);
  const hash = (i, k) => { const s = Math.sin(i * 127.1 + k * 311.7 + 17.13) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0; i < POOL; i++) {
    // x, z: place in the box; y: fall phase; w: size and speed jitter
    s1.set([hash(i, 1), hash(i, 2), hash(i, 3), hash(i, 4)], i * 4);
    // x: wind phase, y: gust frequency, z, w: the sideways re-seed's own salt
    s2.set([hash(i, 5) * 6.2832, 0.6 + hash(i, 6) * 0.9, hash(i, 7), hash(i, 8)], i * 4);
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(s1, 4));
  geo.setAttribute('aSeed2', new THREE.InstancedBufferAttribute(s2, 4));
  geo.instanceCount = 0;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);

  // ── uniforms the CPU sets each frame ──
  const U = {
    time: uniform(0), dt: uniform(1 / 60),
    camR: uniform(new THREE.Vector3()), // camera, render space
    camA: uniform(new THREE.Vector3()), // camera, absolute (the world the drops are anchored in)
    origin: uniform(new THREE.Vector3()), // absolute - render
    base: uniform(0), // the box's floor, absolute y
    box: uniform(new THREE.Vector3(22, 14, 22)),
    fall: uniform(9), wind: uniform(new THREE.Vector2(1, 0)), windOff: uniform(new THREE.Vector2()), gust: uniform(0.5),
    w: uniform(0.008), h: uniform(0.08), alpha: uniform(0.5), round: uniform(0), tint: uniform(new THREE.Color(1, 1, 1)),
    k: uniform(0), // the weather's intensity 0..1 (fades the drops in and out with the sky)
    vp: uniform(new THREE.Matrix4()), prevVP: uniform(new THREE.Matrix4()), proj11: uniform(1), aspect: uniform(1), minHalf: uniform(0.003),
    amb: uniform(new THREE.Color(0.2, 0.22, 0.26)), sunCol: uniform(new THREE.Color(0, 0, 0)), sunDir: uniform(new THREE.Vector3(0, 1, 0)),
    lampP: uniformArray(Array.from({ length: LAMPS }, () => new THREE.Vector4(0, -1e5, 0, 0)), 'vec4'),
    lampD: uniformArray(Array.from({ length: LAMPS }, () => new THREE.Vector4(0, -1, 0, -2)), 'vec4'),
    lampC: uniformArray(Array.from({ length: LAMPS }, () => new THREE.Vector4(0, 0, 0, 1)), 'vec4')
  };

  const seed = attribute('aSeed', 'vec4'), seed2 = attribute('aSeed2', 'vec4'), corner = positionGeometry.xy;
  const pmod = (x, b) => x.sub(b.mul(floor(x.div(b)))); // positive modulo
  const h11 = (x) => fract(sin(x.mul(91.3458)).mul(47453.5453));
  // the vertical wrap: how far the drop has fallen, in whole boxes (cycle) and within the box (y up from the floor)
  const spd = seed.w.mul(0.4).add(0.8);
  const fallen = U.time.mul(U.fall).mul(spd).add(seed.z.mul(U.box.y));
  const cycle = floor(fallen.div(U.box.y));
  const yIn = U.box.y.sub(fallen.sub(cycle.mul(U.box.y)));
  // a new sideways seed for each wrap (the hidden boundary at the box's top)
  const sx = fract(seed.x.add(h11(cycle.mul(1.731).add(seed2.z.mul(17.0)))));
  const sz = fract(seed.y.add(h11(cycle.mul(2.917).add(seed2.w.mul(13.0)))));
  // gusts: each drop's own sway on the wind
  const gph = U.time.mul(seed2.y).add(seed2.x);
  const gx = sin(gph).mul(U.gust), gz = sin(gph.mul(1.37).add(1.3)).mul(U.gust.mul(0.6));
  const ax = sx.mul(U.box.x).add(U.windOff.x).add(gx.div(seed2.y));
  const az = sz.mul(U.box.z).add(U.windOff.y).add(gz.div(seed2.y));
  const relX = pmod(ax.sub(U.camA.x).add(U.box.x.mul(0.5)), U.box.x).sub(U.box.x.mul(0.5));
  const relZ = pmod(az.sub(U.camA.z).add(U.box.z.mul(0.5)), U.box.z).sub(U.box.z.mul(0.5));
  const pR = vec3(U.camR.x.add(relX), U.base.add(yIn).sub(U.origin.y), U.camR.z.add(relZ));
  // its velocity (world, m/s): the fall, the wind and the gust's own swing
  const vel = vec3(U.wind.x.add(sin(gph.add(1.5708)).mul(U.gust)), U.fall.mul(spd).negate(), U.wind.y.add(sin(gph.mul(1.37).add(2.87)).mul(U.gust.mul(0.6))));
  const pPrev = pR.sub(vel.mul(SHUTTER));
  // fades at both ends of every axis of the wrap, and right at the lens
  const fade = smoothstep(U.box.x.mul(0.5), U.box.x.mul(0.36), abs(relX))
    .mul(smoothstep(U.box.z.mul(0.5), U.box.z.mul(0.36), abs(relZ)))
    .mul(smoothstep(0.0, U.box.y.mul(0.12), yIn)).mul(smoothstep(U.box.y, U.box.y.mul(0.86), yIn))
    .mul(smoothstep(U.w.mul(0.6).add(0.3), U.w.mul(2.2).add(1.1), length(pR.sub(U.camR))));
  const size = seed.w.mul(0.6).add(0.7);

  // clip space: a segment from the last position (last frame's camera) to the current one (this frame's), widened across
  const cur = U.vp.mul(vec4(pR, 1.0)), prev = U.prevVP.mul(vec4(pPrev, 1.0));
  const cw = max(cur.w, 0.05);
  const cN = cur.xy.div(cw);
  const pN0 = select(prev.w.greaterThan(0.05), prev.xy.div(max(prev.w, 0.05)), cN);
  // aspect-correct the streak, clamp it, and give it at least the drop's own length
  const asp = vec2(U.aspect, 1.0);
  const d0 = cN.sub(pN0).mul(asp);
  const dl = length(d0);
  const minLen = U.h.mul(size).mul(U.proj11).div(cw); // the drop's own length on screen
  const len = clamp(dl, minLen, MAX_STREAK);
  const dir = select(dl.greaterThan(1e-6), d0.div(max(dl, 1e-6)), vec2(0, 1));
  // (round: a blob as wide as it is long, centred on the drop)
  // (never under a pixel or so wide: thinner, it would shimmer; its opacity is taken down instead, keeping its light)
  const halfW0 = U.w.mul(size).mul(U.proj11).div(cw);
  const halfW = max(halfW0, U.minHalf);
  const thin = clamp(halfW0.div(U.minHalf), 0.55, 1.0);
  const along = select(U.round.greaterThan(0.5), corner.y.sub(0.5).mul(halfW.mul(2.0)), corner.y.sub(1.0).mul(len));
  const perp = vec2(dir.y.negate(), dir.x);
  const ndc = cN.mul(asp).add(dir.mul(along)).add(perp.mul(corner.x).mul(halfW)).div(asp);
  const behind = cur.w.lessThan(0.08);
  const clip = select(behind, vec4(2, 2, 2, 1), vec4(ndc.mul(cur.w), cur.z, cur.w));

  // light: the sky (ambient, dusk's sun with its forward glint) and the brightest lamps near the camera
  const toCam = normalize(U.camR.sub(pR));
  let lit = vec3(U.amb).add(vec3(U.sunCol).mul(pow(max(dot(U.sunDir.negate(), toCam), 0.0), 6.0).mul(1.6).add(0.15)));
  for (let i = 0; i < LAMPS; i++) {
    const P = U.lampP.element(i), D = U.lampD.element(i), C = U.lampC.element(i);
    const v = pR.sub(P.xyz), d2 = dot(v, v), ld = v.div(sqrt(max(d2, 1e-4)));
    const range = C.w.mul(C.w);
    const att = P.w.div(d2.add(1.0)).mul(smoothstep(range, range.mul(0.35), d2));
    const cone = select(D.w.lessThan(-1.0), float(1.0), smoothstep(D.w, D.w.add(0.12), dot(ld, D.xyz)));
    const phase = pow(max(dot(ld, toCam), 0.0), 5.0).mul(2.2).add(0.3);
    lit = lit.add(C.xyz.mul(att.mul(cone).mul(phase)));
  }
  const vCol = varying(lit.mul(vec3(U.tint)));
  const vFade = varying(fade.mul(U.k).mul(U.alpha).mul(select(U.round.greaterThan(0.5), float(1.0), thin)));
  const vCorner = varying(corner);

  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide });
  mat.vertexNode = clip;
  mat.colorNode = vec4(vCol, 1.0);
  // a streak: thin across, bright toward its head; a blob: soft and round
  const across = float(1.0).sub(abs(vCorner.x));
  const streakA = pow(across, 1.6).mul(smoothstep(0.0, 0.35, vCorner.y)).mul(float(0.55).add(vCorner.y.mul(0.45)));
  const r = length(vec2(vCorner.x, vCorner.y.mul(2.0).sub(1.0)));
  const blobA = smoothstep(1.0, 0.0, r).mul(smoothstep(1.0, 0.25, r));
  mat.opacityNode = mix(streakA, blobA, U.round).mul(vFade);
  mat.fog = false;
  mat.toneMapped = true;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'WeatherParticles';
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.visible = false;
  scene.add(mesh);

  // ── lamps: every light the city moves about (street lights' pools, store lights, the cars' headlights), found again
  //    every 1.5 s; each frame the LAMPS brightest at the camera light the drops ──
  let lights = [], scanT = 0;
  const scan = () => {
    lights = [];
    scene.traverse((o) => { if ((o.isSpotLight || o.isPointLight) && !o.castShadow) lights.push(o); });
  };
  const tmpV = new THREE.Vector3(), tmpT = new THREE.Vector3(), tmpC = new THREE.Color(), picks = [];

  // ── camera history (the streaks) ──
  const VP = new THREE.Matrix4(), lastCamA = new THREE.Vector3(), lastFwd = new THREE.Vector3(), fwd = new THREE.Vector3();
  let primed = false, cutPending = true, lastOrigin = new THREE.Vector3();
  const cut = () => { cutPending = true; };

  function setMode(id) {
    const m = MODES[id];
    if (!m) return;
    state.mode = id;
    U.box.value.set(...m.box); U.fall.value = m.fall; U.wind.value.set(...m.wind); U.gust.value = m.gust;
    U.w.value = m.w; U.h.value = m.h; U.alpha.value = m.alpha; U.round.value = m.round; U.tint.value.setRGB(...m.tint);
    geo.instanceCount = Math.round(POOL * m.share);
  }

  const T0 = performance.now();
  function update(dt, camera) {
    if (!camera) return;
    // the weather's own fade in and out (a change of mode fades the old one out first)
    const want = state.want;
    if (want !== state.mode) {
      if (state.mode === 'clear' || state.intensity <= 0.001) { if (want === 'clear') { state.mode = 'clear'; state.intensity = 0; } else { setMode(want); } }
      else state.intensity = Math.max(0, state.intensity - dt / Math.max(0.05, state.fade));
    } else if (state.mode !== 'clear') {
      const k = state.target;
      state.intensity = state.fade <= 0 ? k : state.intensity < k ? Math.min(k, state.intensity + dt / state.fade) : Math.max(k, state.intensity - dt / state.fade);
    }
    const on = state.mode !== 'clear' && state.intensity > 0.001;
    if (lightingSystem) applySkyShare(lightingSystem);
    mesh.visible = on;
    U.k.value = state.intensity;
    if (!on) { primed = false; return; }

    U.time.value = (performance.now() - T0) / 1000;
    U.dt.value = dt;
    U.windOff.value.set(U.windOff.value.x + U.wind.value.x * dt, U.windOff.value.y + U.wind.value.y * dt);
    // keep it small: the drift wraps by whole boxes (invisible: the box is periodic)
    if (Math.abs(U.windOff.value.x) > U.box.value.x * 64) U.windOff.value.x %= U.box.value.x;
    if (Math.abs(U.windOff.value.y) > U.box.value.z * 64) U.windOff.value.y %= U.box.value.z;

    const o = ORIGIN ? ORIGIN.value : null;
    U.origin.value.set(o ? o.x : 0, o ? o.y : 0, o ? o.z : 0);
    U.camR.value.copy(camera.position);
    U.camA.value.copy(camera.position).add(U.origin.value);
    // the box's floor: the ground under the camera (a metre under it), raised with a camera high above it
    const Tn = window.NYC.Terrain, ca = U.camA.value;
    const g = Tn && Tn.loaded ? Tn.groundAt(ca.x, ca.z) : 0;
    const m = MODES[state.mode];
    let floorY = g - 1 - (m.low || 0) * 0.5;
    floorY = Math.max(floorY, ca.y - U.box.value.y * 0.7);
    U.base.value = floorY;
    // (sheltered: under a deck over the camera, the lower level's or a bridge's, or a tunnel's roof, the drops fade out
    // round it, so it never rains under Lower Wacker; cities/sf/js/grade-separation.js roofAt)
    const G = window.NYC.GradeSeparation;
    let roofed = false;
    // (asked for a point 3 m under the lens: a chase camera rides a metre or two under the deck over it, inside the band
    // roofAt counts as on that deck)
    try { if (G && G.roofAt) { const r = G.roofAt(ca.x, ca.z, ca.y - 3); roofed = Number.isFinite(r) && r > ca.y - 0.5 && r - ca.y < SHELTER_H; } } catch { /* no floors */ }
    state.shelter += ((roofed ? 1 : 0) - state.shelter) * Math.min(1, dt * 3);
    U.k.value = state.intensity * (1 - state.shelter);

    camera.updateMatrixWorld();
    VP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    camera.getWorldDirection(fwd);
    // a cut: a jump or a sharp turn in one frame, the origin rebased, or told (cut())
    if (!primed || cutPending || ca.distanceTo(lastCamA) > CUT_MOVE || fwd.dot(lastFwd) < CUT_TURN || (o && !lastOrigin.equals(o))) {
      U.prevVP.value.copy(VP);
      cutPending = false;
      primed = true;
    } else {
      U.prevVP.value.copy(U.vp.value);
    }
    U.vp.value.copy(VP);
    lastCamA.copy(ca); lastFwd.copy(fwd); if (o) lastOrigin.copy(o);
    U.proj11.value = camera.projectionMatrix.elements[5];
    U.aspect.value = camera.aspect || 1;
    const rh = renderer && renderer.domElement ? renderer.domElement.height || 720 : 720;
    U.minHalf.value = 1.6 / rh; // (about a pixel each side of the streak's middle)

    // the sky's light on the drops: its horizon and top, a little of the hemisphere, and the sun (dusk's glint)
    const ls = lightingSystem, sky = cityUniforms.uSkyHorizonColor.value, top = cityUniforms.uSkyTopColor.value;
    const night = ls && ls.uNightFactor ? ls.uNightFactor.value : 0;
    // (and the city's own glow at night, its lit windows: rain over a lit street is never black)
    const glow = cityUniforms.uInteriorGlow ? cityUniforms.uInteriorGlow.value : 0;
    U.amb.value.setRGB(sky.r * 0.5 + top.r * 0.5, sky.g * 0.5 + top.g * 0.5, sky.b * 0.5 + top.b * 0.5).multiplyScalar(1.4 - 0.4 * night)
      .add(tmpC.setRGB(0.16, 0.15, 0.14).multiplyScalar(glow)).addScalar(0.03);
    if (ls && ls.sunLight) {
      U.sunCol.value.copy(ls.sunLight.color).multiplyScalar(Math.min(1.2, ls.sunLight.intensity * 0.06) * (1 - 0.7 * night));
      U.sunDir.value.copy(ls.sunLight.position).normalize().negate(); // (the sun shines from its position toward the origin)
    }

    // the lamps: the brightest LAMPS at the camera
    if ((scanT -= dt) <= 0) { scanT = 1.5; scan(); }
    picks.length = 0;
    for (const l of lights) {
      if (!(l.intensity > 0) || !l.visible || !l.parent) continue;
      l.getWorldPosition(tmpV);
      const d2 = tmpV.distanceToSquared(camera.position);
      if (d2 > 70 * 70) continue;
      picks.push({ l, s: l.intensity / (1 + d2), d2 });
    }
    picks.sort((a, b) => b.s - a.s);
    for (let i = 0; i < LAMPS; i++) {
      const P = U.lampP.array[i], D = U.lampD.array[i], C = U.lampC.array[i], p = picks[i];
      if (!p) { P.set(0, -1e5, 0, 0); continue; }
      const l = p.l;
      l.getWorldPosition(tmpV);
      // (a light's intensity is in candela for these physical lights: scaled to the drops' small share of it)
      // (its intensity in candela: the drop's radiance is the light it is lit by, I / d^2, glinting with the phase)
      P.set(tmpV.x, tmpV.y, tmpV.z, l.intensity * 0.9);
      if (l.isSpotLight && l.target) {
        l.target.getWorldPosition(tmpT);
        tmpT.sub(tmpV).normalize();
        D.set(tmpT.x, tmpT.y, tmpT.z, Math.cos(Math.min(1.45, l.angle * 1.15)));
      } else D.set(0, -1, 0, -2);
      C.set(l.color.r, l.color.g, l.color.b, Math.max(8, l.distance || 30));
    }
  }

  const api = {
    POOL, MODES: Object.keys(MODES), state, mesh, uniforms: U,
    // set(mode, { intensity 0..1 (default 1), fade s (default 2.5; 0 at once) })
    set(mode, opts = {}) {
      const id = MODES[mode] !== undefined ? mode : 'clear';
      state.want = id;
      state.target = id === 'clear' ? 0 : Math.max(0, Math.min(1, opts.intensity ?? 1));
      state.fade = Math.max(0, opts.fade ?? 2.5);
      if (state.fade === 0) {
        if (id === 'clear') { state.mode = 'clear'; state.intensity = 0; } else { setMode(id); state.intensity = state.target; }
        if (lightingSystem) applySkyShare(lightingSystem);
      }
      cut();
      return api;
    },
    get: () => ({ mode: state.mode, want: state.want, intensity: +state.intensity.toFixed(3), shelter: +state.shelter.toFixed(2), drops: mesh.visible ? geo.instanceCount : 0, pool: POOL }),
    cut,
    update
  };
  window.NYC.Weather = api;
  // ?weather=drizzle|rain|mist|wind
  try {
    const q = new URLSearchParams(location.search).get('weather');
    if (q && MODES[q]) api.set(q, { fade: 0 });
  } catch { /* no address */ }
  return api;
}

Object.assign(window.NYC, { createWeather, weatherSky, WEATHER_MODES: MODES });
})();
