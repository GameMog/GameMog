// Mog City: the Kastell, a world's hero car { model: 'mogcity/gwagon' } (Mandi's Revenge: Mandi's car). A tall, square
// luxury off-roader in gloss black: a flat upright face with round lamps in chrome bezels and LED rings, indicators
// standing on the fenders' corners, slab sides with a shut line round every panel, exposed hinges on every door, flared
// arches, side steps and side pipes, a side-hinged tailgate carrying a covered spare. It is a look-alike: no maker's name,
// crest, badge or model lettering anywhere (its grille three plain louvres, its wheel centres plain caps, its spare's
// cover a plain disc, its plates its own).
//
// Its body is modelled from nothing in a script (tools/vehicles/gwagon/build.py in Blender, packed by pack.mjs):
// assets/vehicles/gwagon/gwagon.glb, every part named by its material, and every surface finished here by that name.
// The lamps work: the brake lights come up as it slows hard, the indicators blink on the side it turns to at a junction's
// pace, the reversing lamps light going backward, and at night the headlamps' bowls and rings burn brighter.
//
// It drives as an SUV, not as the roadster: heavier, slower to turn, strong off the line, no boost, softer springs, the
// camera a little higher and further back for its height, a deep petrol V8's note (wagmi/audio/utility.js 'v8suv');
// rs.fit(car) puts those numbers on the car entity (wagmi/game.js). Like the Tensore (wedge.js) it keeps gt.js's rig:
// the driver's anchor (his seat marks set on this cabin's own seat), the wheel his hands hold (moved to the model's
// wheel), setDoor (its front doors on a hinge at their front edge, swinging out), its dents (wedge.js modelDents).
//   const rs = await buildGwagon(THREE, { paint?, plate? })
import { buildGT } from './gt.js';
import { loadGLB } from '../glb.js';
import { modelDents } from './wedge.js';
import { setClass, mogFraming } from './ride.js';

export const GWAGON_GLB = new URL('../../assets/vehicles/gwagon/gwagon.glb', import.meta.url).href;

export const GWAGON_BLACK = '#060708';

// its handling, beside the Tensore's (the roadster's, wagmi/game.js): heavier (2.6 to 2.0), 0-60 mph in 4.5 s on its
// torque (the Tensore 3.0), 72 mph flat out (76) and no boost (an SUV: ride.js setClass), a 6.2 m turning circle's
// radius at walking pace (4.6), at most 75 degrees a second (106), 36 m/s² of grip (48), slower onto the lock and off it,
// 6 degrees of roll at its grip (3.5), softer springs, longer brakes (13.5 m/s² to 16), and more air to push
export const GWAGON_TUNE = Object.freeze({
  mass: 2.6, topSpeed: 32, accel: 5.96, boostLaunch: 0, rolling: 0.6, drag: 0.0052, coast: 2.6, brake: 13.5,
  handling: Object.freeze({ rMin: 6.2, yawMax: 1.3, grip: 36, rampIn: Object.freeze([0.16, 0.24]), rampOut: 0.11, vRef: 32 }),
  springs: Object.freeze({ rollGain: 0.0044, rollMax: 0.131, k: 52, damp: 8.8 }),
});

// the street a gloss black body mirrors at night (an equirect, PMREM'd by the renderer; once, shared): a dark sky with
// the city's glow low over its rooftops, a skyline of lit windows, streetlights in a row along the horizon with their
// pools on the wet road under it, and the road itself near black. Seeded, so every run draws the same street
let nightEnvTex = null, flakeTex = null;
// the paint's flakes: a 256 px field of small tilted normals (2 px cells), tiling every 0.3 m of the model's UVs; seeded, made once
export function flakeMap(THREE) {
  if (flakeTex || !globalThis.document) return flakeTex;
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), img = x.createImageData(N, N);
  let sd = 11; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let j = 0; j < N; j += 2) for (let i = 0; i < N; i += 2) {
    const a = rnd() * Math.PI * 2, t = rnd() * 0.55, nx = Math.cos(a) * t, ny = Math.sin(a) * t, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) { const k = ((j + dj) * N + i + di) * 4; img.data[k] = (nx * 0.5 + 0.5) * 255; img.data[k + 1] = (ny * 0.5 + 0.5) * 255; img.data[k + 2] = (nz * 0.5 + 0.5) * 255; img.data[k + 3] = 255; }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4;
  return (flakeTex = t);
}
export function nightStreetEnv(THREE) {
  if (nightEnvTex || !globalThis.document) return nightEnvTex;
  const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); let sd = 7;
  const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const hz = H * 0.5;
  // (the sky: near black at the top, the city's sodium glow over the rooftops)
  let gr = x.createLinearGradient(0, 0, 0, hz);
  gr.addColorStop(0, '#05070C'); gr.addColorStop(0.55, '#0E1320'); gr.addColorStop(0.85, '#1C1E2A'); gr.addColorStop(1, '#302C2E');
  x.fillStyle = gr; x.fillRect(0, 0, W, hz);
  // (the road: wet asphalt, near black)
  gr = x.createLinearGradient(0, hz, 0, H); gr.addColorStop(0, '#1A1715'); gr.addColorStop(0.2, '#08090B'); gr.addColorStop(1, '#030304');
  x.fillStyle = gr; x.fillRect(0, hz, W, H - hz);
  // (the skyline: towers of every height, dark, their windows lit here and there, warm and a few cool)
  for (let bx = 0; bx < W;) {
    const bw = 18 + rnd() * 46, bh = 14 + rnd() * rnd() * 150, top = hz - bh;
    x.fillStyle = '#07080B'; x.fillRect(bx, top, bw, bh);
    for (let wy = top + 4; wy < hz - 6; wy += 6) for (let wx = bx + 3; wx < bx + bw - 3; wx += 5) {
      if (rnd() < 0.3) { const cool = rnd() < 0.2; x.fillStyle = cool ? 'rgba(190,215,255,0.85)' : `rgba(255,${190 + Math.floor(rnd() * 40)},${110 + Math.floor(rnd() * 50)},0.9)`; x.fillRect(wx, wy, 2.5, 3); }
    }
    bx += bw + rnd() * 6;
  }
  // (the streetlights: a row of bright heads along the horizon, sodium and LED, their pools and smears on the wet road)
  for (let i = 0; i < 28; i++) {
    const lx = (i + rnd() * 0.6) * (W / 28), ly = hz - 10 - rnd() * 22, warm = rnd() < 0.7;
    const col = warm ? '255,214,150' : '226,236,255';
    let rg = x.createRadialGradient(lx, ly, 0, lx, ly, 14); rg.addColorStop(0, `rgba(${col},1)`); rg.addColorStop(0.25, `rgba(${col},0.75)`); rg.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = rg; x.fillRect(lx - 14, ly - 14, 28, 28);
    const sg = x.createLinearGradient(0, hz, 0, hz + 110); sg.addColorStop(0, `rgba(${col},0.5)`); sg.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = sg; x.fillRect(lx - 3, hz, 6, 110);
  }
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  return (nightEnvTex = t);
}

export async function buildGwagon(THREE, o = {}) {
  const gltf = await loadGLB(GWAGON_GLB);
  const rs = buildGT(THREE, { ...o, hingeAngle: o.hingeAngle ?? 1.1 }), g = rs.group, M = rs.materials, V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  // (gt.js's own body hidden: its anchor kept, its yoke kept for the model's wheel, its boost flame hidden for good)
  for (const ch of g.children) {
    if (ch === rs.anchor) continue;
    if (ch === rs.yoke) { ch.traverse((m) => { if (m.isMesh) m.visible = false; }); continue; }
    ch.visible = false;
  }
  rs.setThrust = () => {};

  /* --------------------------------------------------- the model, placed -- */
  const src = gltf.scene.clone(true);
  const holder = new THREE.Group(); holder.name = 'gwagon-ext'; holder.add(src); g.add(holder);
  // (its quantized positions and normals read out into plain floats, so a crash's dents move them freely: wedge.js)
  const floated = new Set();
  src.traverse((m) => {
    if (!m.isMesh || floated.has(m.geometry)) return; floated.add(m.geometry);
    for (const k of ['position', 'normal']) {
      const a = m.geometry.getAttribute(k); if (!a || (!a.isInterleavedBufferAttribute && a.array instanceof Float32Array)) continue;
      const f = new Float32Array(a.count * 3); for (let i = 0; i < a.count; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); }
      m.geometry.setAttribute(k, new THREE.BufferAttribute(f, 3));
    }
  });
  const find = (re) => { const out = []; src.traverse((n) => { if (n.isMesh && re.test(n.name)) out.push(n); }); return out; };
  const box = (objs) => { const b = new THREE.Box3(); for (const x of [].concat(objs)) b.expandByObject(x); return b; };
  const centre = (objs) => box(objs).getCenter(V3());
  src.updateMatrixWorld(true);
  const CORNERS = ['FL', 'FR', 'BL', 'BR'];
  const rims = CORNERS.map((c) => find(new RegExp(`^wheel_${c}_rim`))[0]);
  if (rims.some((r) => !r)) throw new Error('gwagon: expected 4 wheels');
  // (built in metres, nose to +z, its axles' middle on the origin and its tyres on y = 0; checked, not assumed)
  const nose = centre(find(/^body_Headlight/)), tail = centre(find(/^body_Tail_light/));
  if (nose.z < tail.z) { src.rotation.y = Math.PI; src.updateMatrixWorld(true); }
  const tyres = find(/^wheel_.._tire/), ground = box(tyres).min.y, mid = centre(rims);
  src.position.set(-mid.x, -ground, -mid.z); src.updateMatrixWorld(true);
  g.updateMatrixWorld(true);

  /* -------------------------------------------------------------- paint -- */
  // (gloss black under a thick clear coat, the city's sky running along its flat sides; chrome round the glass, on the
  // belt line and the handles; privacy glass behind, a lighter windscreen; black wheels with a polished face)
  const P = (p) => new THREE.MeshPhysicalNodeMaterial(p), S = (p) => new THREE.MeshStandardNodeMaterial(p), DS = THREE.DoubleSide;
  const canvasTex = (w, h, draw) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  const paintHex = o.paint ?? GWAGON_BLACK;
  // the dash's screen: one wide glass panel, two dials and a map, lit
  const screenTex = canvasTex(1024, 192, (cx, w, h) => {
    const gr = cx.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#04070B'); gr.addColorStop(1, '#0A1018'); cx.fillStyle = gr; cx.fillRect(0, 0, w, h);
    for (const [x, val] of [[130, 0.55], [370, 0.3]]) {
      cx.strokeStyle = '#1C2530'; cx.lineWidth = 10; cx.beginPath(); cx.arc(x, h * 0.55, 66, Math.PI * 0.75, Math.PI * 2.25); cx.stroke();
      cx.strokeStyle = '#D9E4EE'; cx.beginPath(); cx.arc(x, h * 0.55, 66, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * val)); cx.stroke();
    }
    cx.fillStyle = '#E8EEF4'; cx.font = "600 40px 'Helvetica Neue', 'Arial', sans-serif"; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('45', 130, h * 0.56);
    cx.font = "500 15px 'Helvetica Neue', 'Arial', sans-serif"; cx.fillStyle = '#7C8894'; cx.fillText('MPH', 130, h * 0.75);
    // (the map: a few streets of a grid, the route in amber)
    cx.fillStyle = '#0E1620'; cx.fillRect(520, 18, 480, h - 36);
    cx.strokeStyle = '#243344'; cx.lineWidth = 4; for (let i = 0; i < 9; i++) { cx.beginPath(); cx.moveTo(520 + i * 60, 18); cx.lineTo(520 + i * 60, h - 18); cx.stroke(); } for (let j = 0; j < 4; j++) { cx.beginPath(); cx.moveTo(520, 30 + j * 42); cx.lineTo(1000, 30 + j * 42); cx.stroke(); }
    cx.strokeStyle = '#F2A33A'; cx.lineWidth = 6; cx.beginPath(); cx.moveTo(580, h - 18); cx.lineTo(580, 72); cx.lineTo(820, 72); cx.lineTo(820, 30); cx.stroke();
  });
  const plateTex = canvasTex(512, 256, (cx, w, h) => {
    cx.fillStyle = '#F4F4F0'; cx.fillRect(0, 0, w, h); cx.strokeStyle = '#2A2F3A'; cx.lineWidth = 8; cx.strokeRect(6, 6, w - 12, h - 12);
    cx.fillStyle = '#1B2A6A'; cx.font = "700 120px 'Arial Narrow', 'Arial', sans-serif"; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(o.plate || 'KASTELL', w / 2, h * 0.6);
    cx.fillStyle = '#B0141C'; cx.font = "italic 600 34px 'Georgia', serif"; cx.fillText('Chicago', w / 2, h * 0.17);
  });
  const X = {
    // (no metal in it: a solid black, so the clear coat's reflections stay the sky's colour and the body stays black)
    // (a metallic black under a thick, glassy clear coat: the base's flakes (flakeMap: a fine field of tilted normals laid
    // at one scale over every panel by the model's box-projected UVs) glint through the coat where the light catches them,
    // the coat itself stays a smooth mirror)
    paint: P({ color: paintHex, metalness: 0.5, roughness: 0.34, normalMap: flakeMap(THREE), normalScale: new THREE.Vector2(0.32, 0.32), specularIntensity: 0.5, clearcoat: 1, clearcoatRoughness: 0.025, side: DS }),
    chrome: P({ color: '#E6E9EE', metalness: 1, roughness: 0.07, side: DS }),
    trim: P({ color: '#15171A', metalness: 0.45, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.1, side: DS }),    // the grille's, the bumpers'
    // (privacy glass: the driver still shows through the front doors' and the windscreen's)
    // (glass that reads as glass: a full specular sheen and a smoky tint over a cabin you can see; the rear's darker)
    glass: P({ color: '#0C1116', metalness: 0, roughness: 0.015, specularIntensity: 1, envMapIntensity: 1.6, transparent: true, opacity: 0.58, depthWrite: false, side: DS }),
    screen: P({ color: '#101820', metalness: 0, roughness: 0.01, specularIntensity: 1, envMapIntensity: 1.6, transparent: true, opacity: 0.34, depthWrite: false, side: DS }),
    // (the round lamps: a polished reflector behind clear glass, a soft daytime glow, not a white disc)
    lamp: P({ color: '#3A4048', metalness: 1, roughness: 0.06, clearcoat: 1, emissive: '#EEF4FF', emissiveIntensity: 0.32 }),
    tail: P({ color: '#5A0008', metalness: 0, roughness: 0.1, clearcoat: 1, emissive: '#FF2030', emissiveIntensity: 1.1 }),
    plate: S({ map: plateTex, roughness: 0.4, metalness: 0.1 }),
    pipe: P({ color: '#C4C8CE', metalness: 1, roughness: 0.16, side: DS }),
    cabin: S({ color: '#121315', metalness: 0, roughness: 0.9, side: DS }),
    // (cognac leather with a pale contrast stitch: the cabin reads through the glass of a black car)
    leather: P({ color: '#5A3620', metalness: 0, roughness: 0.48, sheen: 0.5, sheenRoughness: 0.45, sheenColor: '#9A6A44', side: DS }),
    stitch: S({ color: '#D9C49C', metalness: 0, roughness: 0.7 }),
    dash: S({ color: '#101113', metalness: 0, roughness: 0.75, side: DS }),
    display: S({ color: '#000000', emissive: '#FFFFFF', emissiveMap: screenTex, emissiveIntensity: 1.1 }),
    wheelLeather: S({ color: '#111214', metalness: 0, roughness: 0.7, side: DS }),
    metal: P({ color: '#9AA0A8', metalness: 1, roughness: 0.25, side: DS }),
    rim: P({ color: '#26292D', metalness: 1, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, side: DS }),
    tyre: S({ color: '#121214', metalness: 0, roughness: 0.93, side: DS }),
    // (the lamps' clear domes and the tail lamps' red outer lens: thin glass over the parts that light)
    lens: P({ color: '#FFFFFF', metalness: 0, roughness: 0.02, specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.16, depthWrite: false, side: DS }),
    tailLens: P({ color: '#6A0A10', metalness: 0, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.28, depthWrite: false, side: DS }),
    drl: S({ color: '#C8D2DC', emissive: '#EAF2FF', emissiveIntensity: 1.6 }),
    brake: P({ color: '#4A0006', metalness: 0, roughness: 0.12, clearcoat: 1, emissive: '#FF1426', emissiveIntensity: 0.35 }),
    reverse: P({ color: '#B8BEC4', metalness: 0, roughness: 0.1, clearcoat: 1, emissive: '#FFFFFF', emissiveIntensity: 0 }),
    // (each side's indicators their own, so one side blinks)
    indL: P({ color: '#B05A08', metalness: 0, roughness: 0.12, clearcoat: 1, emissive: '#FF8A14', emissiveIntensity: 0 }),
    indR: P({ color: '#B05A08', metalness: 0, roughness: 0.12, clearcoat: 1, emissive: '#FF8A14', emissiveIntensity: 0 }),
    gap: S({ color: '#020203', metalness: 0, roughness: 0.95 }),
    rubber: S({ color: '#0B0B0C', metalness: 0, roughness: 0.82, side: DS }),
    grille: P({ color: '#060607', metalness: 0.4, roughness: 0.5, side: DS }),
    mirror: P({ color: '#D2D7DC', metalness: 1, roughness: 0.02 }),
    step: P({ color: '#8A9098', metalness: 1, roughness: 0.34, side: DS }),
    lip: P({ color: '#D9DDE2', metalness: 1, roughness: 0.1, side: DS }),
    disc: P({ color: '#5C6066', metalness: 1, roughness: 0.42, side: DS }),
    caliper: P({ color: '#8A0E14', metalness: 0.1, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 }),
    headliner: S({ color: '#4E4840', metalness: 0, roughness: 0.95, side: DS }),
    carpet: S({ color: '#0D0C0B', metalness: 0, roughness: 1, side: DS }),
  };
  // (at night, M3's and M8's chase camera read it only by its tail lights: the city's own environment at midnight is a
  // near-black sky, so the clear coat had nothing to mirror. Night lends its finishes a street of their own to reflect,
  // nightStreetEnv below: the sky's glow over the rooftops, the lit windows and the streetlights along the horizon, the
  // wet road; the clear coat draws them as crisp highlights along the flanks, the roof's edge and the glass, a rim of city
  // light where the body turns away, while the paint itself stays black. The plate lit and a faint warm cabin as well.
  // By the city's own night (lighting.js uNightFactor): by day and at dusk nothing changes)
  const NIGHT = new Map([[X.paint, 2.2], [X.trim, 1.6], [X.chrome, 0.9], [X.glass, 2.2], [X.screen, 2.2], [X.rim, 1.4], [X.pipe, 0.9], [X.lens, 2.2], [X.lip, 1.2], [X.step, 0.9], [X.mirror, 1.4]]);
  const nightEnv = nightStreetEnv(THREE);
  X.plate.emissive = new THREE.Color('#FFFFFF'); X.plate.emissiveMap = plateTex; X.plate.emissiveIntensity = 0;
  for (const k of ['cabin', 'leather']) { X[k].emissive = new THREE.Color('#3A2614'); X[k].emissiveIntensity = 0; }
  let nightNow = -1, tailK = 0;
  // (the high quality lighting's hero probe, js/sky-occlusion.js, takes the place of envMap on the car's lit finishes: it
  // mirrors the real street, which at night is near black away from the lamps. The night street is kept under it: the
  // brighter of the two, so the flanks still carry a rim of city light, nightStreetEnv's, by the city's night)
  const NN = globalThis.window?.NYC, HQL = NN?.HQL, TN = NN?.TSL;
  const uNightEnv = TN?.uniform ? TN.uniform(0) : null;
  let withNight = null;
  const keepNight = () => {
    const env = HQL?.hero?.env; if (!env || !uNightEnv || !nightEnv || !TN.pmremTexture) return;
    for (const m of NIGHT.keys()) {
      if (m.envNode !== env) continue;
      try { withNight ??= TN.max(env, TN.pmremTexture(nightEnv).mul(uNightEnv)); } catch { return; }
      m.envNode = withNight; m.needsUpdate = true;
    }
  };
  // (and a faint cool rim on the body at night: where its sides turn away from the lens, a fresnel edge of light, so the
  // black car separates from a dark street however dimly the street is lit; nothing by day)
  const uRim = TN?.uniform ? TN.uniform(0) : null;
  if (uRim && TN.normalView && TN.positionViewDirection) {
    try {
      const edge = TN.float(1).sub(TN.abs(TN.dot(TN.normalView, TN.positionViewDirection))).clamp(0, 1);
      const rim = TN.vec3(0.42, 0.5, 0.66).mul(TN.pow(edge, 5.0)).mul(uRim);
      for (const m of [X.paint, X.trim]) m.emissiveNode = rim;
    } catch (e) { console.warn('[gwagon] rim', e); }
  }
  const nightFinish = () => {
    const ls = globalThis.window?.__NYC_APP?.lightingSystem, nf = ls?.uNightFactor?.value ?? 0;
    const k = !nightEnv ? 0 : Math.max(0, Math.min(1, (nf - 0.45) / 0.35));
    keepNight();
    if (k === nightNow) return; nightNow = k;
    if (uNightEnv) uNightEnv.value = 0.55 * k;
    if (uRim) uRim.value = 0.5 * k;
    for (const [m, i] of NIGHT) {
      const env = k > 0 ? nightEnv : null;
      if (m.envMap !== env) { m.envMap = env; m.needsUpdate = true; }
      m.envMapIntensity = k > 0 ? i * k : 1;
    }
    X.plate.emissiveIntensity = 0.55 * k;
    // (the headlamps on: the bowls lit through, the LED rings full)
    X.lamp.emissiveIntensity = 0.32 + 3.2 * k; X.drl.emissiveIntensity = 1.6 + 1.6 * k; tailK = k;
    X.cabin.emissiveIntensity = X.leather.emissiveIntensity = 0.22 * k;
  };
  // by the model's material names (tools/vehicles/gwagon/build.py)
  const BY = {
    Paint: X.paint, Chrome: X.chrome, Glass: X.glass, Windscreen: X.screen, Tail_light: X.tail, Headlight: X.lamp, Plate: X.plate, Trim: X.trim, Handle: X.chrome,
    Exhaust: X.pipe, Interior: X.cabin, Under: M.under, Tire: X.tyre, Rim: X.rim, Leather: X.leather, Dash: X.dash, Screen: X.display, Steering_wheel: X.wheelLeather, Metal: X.metal,
    Lens: X.lens, Tail_lens: X.tailLens, DRL: X.drl, Brake: X.brake, Reverse: X.reverse, Indicator: X.indL, Gap: X.gap, Rubber: X.rubber, Grille: X.grille,
    Mirror: X.mirror, Mirror_cap: X.paint, Stitch: X.stitch, Mesh: X.trim, Hook: X.caliper, Step: X.step, Rim_lip: X.lip, Disc: X.disc, Caliper: X.caliper, Headliner: X.headliner, Carpet: X.carpet,
  };
  const unknown = new Set();
  src.traverse((m) => {
    if (!m.isMesh) return;
    const mt = (m.userData.mat ??= m.material?.name || '');
    m.castShadow = !/Glass|Windscreen/.test(mt); m.receiveShadow = true;
    const to = BY[mt] ?? BY[mt.replace(/\.\d+$/, '')];
    if (to) m.material = to; else { unknown.add(mt); m.material = X.trim; }
    if (to === X.indL) { m.geometry.computeBoundingBox(); const bx = m.geometry.boundingBox; m.material = (bx.min.x + bx.max.x) / 2 * Math.sign(src.rotation.y === 0 ? 1 : -1) >= 0 ? X.indL : X.indR; }
    if (NIGHT.has(m.material) || m.material === X.plate) m.onBeforeRender = nightFinish;
  });
  if (unknown.size) console.warn('[gwagon] materials finished as trim:', [...unknown].join(', '));
  // (the plates and the screen carry no UVs of their own: laid on flat, across their faces as seen from outside / the
  // seat: viewed from in front of the car its right is +x, from behind or from the driver's seat -x)
  const planar = (m, flipFor) => {
    const geo = m.geometry, pos = geo.attributes.position; geo.computeBoundingBox(); const b = geo.boundingBox, sz = b.getSize(V3());
    const ax = 'y', uv = new Float32Array(pos.count * 2);   // (up the face: both plates are one mesh, metres apart along z)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), u = (x - b.min.x) / (sz.x || 1), v = ((ax === 'y' ? pos.getY(i) : pos.getZ(i)) - b.min[ax]) / (sz[ax] || 1);
      uv[i * 2] = flipFor(pos.getZ(i)) ? 1 - u : u; uv[i * 2 + 1] = v;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  };
  src.updateMatrixWorld(true);
  for (const m of find(/^body_Plate/)) planar(m, (z) => z < 0);
  for (const m of find(/^Screen/)) planar(m, () => true);

  /* -------------------------------------------------------------- wheels -- */
  // each corner's rim and tyre turn in a spin group on its axle (x), inside a group that steers (y)
  rs.wheels.length = 0;
  CORNERS.forEach((c, i) => {
    const rim = rims[i], at = centre(rim), W = new THREE.Group(), spin = new THREE.Group(); W.add(spin);
    W.position.copy(g.worldToLocal(at.clone())); g.add(W); W.updateMatrixWorld(true);
    const parts = find(new RegExp(`^wheel_${c}_`));
    // (the caliper steers with the wheel but does not turn with it)
    for (const p of parts) (/caliper/.test(p.name) ? W : spin).attach(p);
    const tb = box(parts.filter((p) => /tire/i.test(p.name)));
    const r = tb.isEmpty() ? 0.39 : (tb.max.y - tb.min.y) / 2;
    rs.wheels.push({ W, spin, front: W.position.z > 0, r });
  });

  /* --------------------------------------------------------------- doors -- */
  // each front door (its skin, glass, chrome, handle and inner panel, cut free in the build) on a hinge at its front
  // edge, swinging out about the upright (gt.js setDoor). Its first child is the door's frame as the car's when shut
  // (wagmi/game.js reaches his hand to its handle in it)
  for (const sideK of ['L', 'R']) {
    const ps = find(new RegExp(`^door_${sideK}_`)); if (!ps.length) continue;
    const skin = ps.filter((p) => p.userData.mat === 'Paint'), b = box(skin.length ? skin : ps);
    const lo = g.worldToLocal(b.min.clone()), hi = g.worldToLocal(b.max.clone());
    const sd = Math.sign(lo.x + hi.x) || 1;
    const pivot = new THREE.Group(); pivot.name = 'door' + sideK;
    pivot.position.set(sd > 0 ? hi.x - 0.02 : lo.x + 0.02, (lo.y + hi.y) / 2, hi.z - 0.03);
    const inner = new THREE.Group(); inner.position.copy(pivot.position).negate(); pivot.add(inner);
    g.add(pivot); pivot.updateMatrixWorld(true);
    for (const p of ps) inner.attach(p);
    rs.doors[sideK] = { pivot, axis: V3(0, -sd, 0), t: 0 };
  }

  /* ------------------------------------------------------ the driver's seat -- */
  // his marks on this cabin's own seat (the anchor at the car's middle): his hip a hand's width over the cushion and a
  // third of the way forward from its back, his heels on the floor before him, his knees up as an SUV's driver's are
  {
    const seat = find(/^Seat_L/), wheel = find(/^Steering_wheel/);
    rs.anchor.position.set(0, 0, 0);
    if (seat.length) {
      const sb = box(seat), lo = g.worldToLocal(sb.min.clone()), hi = g.worldToLocal(sb.max.clone());
      // (the cushion's top: the seat's highest point under its back's foot, read off its own vertices)
      let top = lo.y; const _v = V3(), zMid = lo.z + (hi.z - lo.z) * 0.62;
      for (const m of seat) { const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i++) { _v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); g.worldToLocal(_v); if (_v.z > zMid && _v.y < lo.y + 0.45) top = Math.max(top, _v.y); } }
      const x = (lo.x + hi.x) / 2, hipZ = lo.z + (hi.z - lo.z) * 0.36, hipY = top + (o.seatLift ?? 0.07);
      const floor = 0.33, wz = wheel.length ? g.worldToLocal(centre(wheel)).z : hipZ + 0.5;
      rs.seat = { hip: [x, hipY, hipZ], heel: [0.11, floor + 0.04, Math.min(wz + 0.05, hipZ + 0.52)] };
    }
  }

  /* ---------------------------------------------------- the wheel he holds -- */
  const steer = find(/^Steering_wheel/);
  if (steer.length && rs.yoke) {
    const c = g.worldToLocal(centre(steer));
    rs.yoke.position.copy(c); rs.yoke.updateMatrixWorld(true);
    const spin = rs.yoke.children[0]; for (const p of steer) spin.attach(p);
  }

  /* --------------------------------------------------------------- lamps -- */
  // gt.js's update(dt, speed, steer) turns the wheels; the lamps answer the same numbers: the brakes as it slows harder
  // than coasting (or held at a standstill after it), the indicators on the side it steers to at a junction's pace (a
  // 1.4 Hz blink), the reversing lamps going backward
  {
    const turn = rs.update; let v0 = 0, held = 0, blink = 0, brakeK = 0;
    rs.update = (dt, speed = 0, steer = 0) => {
      turn(dt, speed, steer);
      if (!(dt > 0)) return;
      const a = (Math.abs(speed) - Math.abs(v0)) / dt; v0 = speed;
      held = a < -3.2 && Math.abs(speed) > 0.4 ? 0.35 : Math.abs(speed) < 0.3 && held > 0 ? 0.35 : Math.max(0, held - dt);
      brakeK += ((held > 0 ? 1 : 0) - brakeK) * Math.min(1, dt * 18);
      X.brake.emissiveIntensity = 0.35 + 0.8 * tailK + 2.6 * brakeK;   // (by night the brake sections glow as tail lamps too)
      X.reverse.emissiveIntensity = speed < -0.4 ? 1.8 : 0;
      const side = Math.abs(steer) > 0.45 && Math.abs(speed) < 13 ? Math.sign(steer) : 0;
      blink = side ? (blink + dt * 1.4) % 1 : 0;
      const on = side && blink < 0.55 ? 2.6 : 0;
      X.indL.emissiveIntensity = side > 0 ? on : 0; X.indR.emissiveIntensity = side < 0 ? on : 0;
    };
  }

  /* --------------------------------------------------------------- dents -- */
  modelDents(THREE, rs, g);

  // its box, for all that runs into it or round it (the mirrors left out of its width)
  g.updateMatrixWorld(true);
  const meshes = []; src.traverse((m) => { if (m.isMesh && m.visible) meshes.push(m); });
  const bb = new THREE.Box3(); for (const m of meshes) bb.expandByObject(m);
  const lo = g.worldToLocal(bb.min.clone()), hi = g.worldToLocal(bb.max.clone());
  const pb = box(find(/^body_Paint/)), pl = g.worldToLocal(pb.min.clone()), ph = g.worldToLocal(pb.max.clone());
  const hx = Math.max(Math.abs(pl.x), Math.abs(ph.x));
  const fz = Math.max(...rs.wheels.map((w) => w.W.position.z)), rz = Math.min(...rs.wheels.map((w) => w.W.position.z));
  // fit(car): the car entity's numbers as an SUV's (wagmi/game.js, after the roadster's are set)
  const fit = (car) => {
    const T = GWAGON_TUNE;
    Object.assign(car, { mass: T.mass, topSpeed: T.topSpeed, accel: T.accel, boostLaunch: T.boostLaunch, rolling: T.rolling, drag: T.drag, coast: T.coast, brake: T.brake });
    car.handling = { ...T.handling, rampIn: [...T.handling.rampIn] }; car.springs = { ...T.springs };
    Object.assign(car, mogFraming({ chase: car.chase }, null, hi.y));
    setClass(car, 'suv');
    car.voice = 'v8suv';
    return car;
  };
  return Object.assign(rs, {
    length: hi.z - lo.z, width: 2 * hx, height: hi.y, axle: (fz - rz) / 2, body: { hx, z0: lo.z - 0.02, z1: hi.z + 0.03, top: hi.y },
    ext: holder, kind: 'gwagon', label: 'Kastell', trueSize: true, fit,
  });
}
