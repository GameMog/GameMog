// Mog City: the Tensore, a world's hero car { model: 'mogcity/wedge' } (Jensen Heist: Jensen's car). An Italian-style
// mid-engined wedge in lime: a low sharp nose, Y-shaped lamps, hexagon-cut intakes, scissor doors that swing up. It is a
// look-alike: no maker's name, crest, badge or model lettering; 'TENSORE' small on its tail, an invented name.
//
// Its body is a ready-made model's: assets/vehicles/wedge/wedge.glb, made from a 3D model by ALIEEEN on Sketchfab
// (CC BY 4.0, assets/vehicles/wedge/CREDITS.md) with every badge taken out (the nose crest, the wheel centres, the
// steering wheel's), every texture of the source left out (they were photographs of the real car's parts and its maker's
// marks), and the doors cut free of the body (tools/vehicles/wedge/build.py). Every surface is finished here by its
// material's name, so nothing of the source's look but its shape comes along.
//
// What it keeps of gt.js (buildGT is built first and its own body hidden, as wagmi/storyrun/vantor.js does): the
// driver's anchor and seat marks, the wheel his hands hold (moved to the model's own wheel, which turns with it), the
// boost's flame (moved to the model's tips), setThrust / setElectric / update / setDoor. The model's wheels and doors go
// into gt.js's own lists, so update() turns and steers them and setDoor() swings the doors up on a hinge at their front
// edge (scissor doors: about an axis across the car, canted out a little).
//   const rs = await buildWedge(THREE, { paint?, plate?, caliper? })
import { buildGT } from './gt.js';
import { loadGLB } from '../glb.js';
import { CREDITS } from '../credits.js';
import { wheelKeeps, keepRoom, crumple, crease } from '../crash/dent-geom.js';

export const WEDGE_GLB = new URL('../../assets/vehicles/wedge/wedge.glb', import.meta.url).href;

// its line in the pause menu's Credits (CC BY 4.0 asks for it wherever the car is shown)
export const WEDGE_CREDIT = { group: 'The Tensore\'s body', what: 'The Tensore\'s body: 3D model by ALIEEEN (Sketchfab), modified', who: 'ALIEEEN', note: 'modified: badges and every texture removed, doors cut free, refinished; the game\'s car is a look-alike with no connection to any car maker', licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', src: 'https://sketchfab.com/3d-models/cf52245eb68f48daa909c7ad2a8deaa3' };

export const WEDGE_LIME = '#76B900';

export async function buildWedge(THREE, o = {}) {
  const gltf = await loadGLB(WEDGE_GLB);
  { const sec = CREDITS.find((c) => c.heading === 'Vehicles'); if (sec && !sec.lines.includes(WEDGE_CREDIT)) sec.lines.push(WEDGE_CREDIT); }
  // (scissor doors: gt.js's setDoor turns each door's pivot about its axis by hingeAngle x t)
  const rs = buildGT(THREE, { ...o, hingeAngle: o.hingeAngle ?? 1.15 }), g = rs.group, M = rs.materials, V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const plumes = [];
  for (const ch of g.children) {
    if (ch === rs.anchor) continue;
    if (ch.isLight || ch.isSprite || ch.userData.len != null) { plumes.push(ch); continue; }
    if (ch === rs.yoke) { ch.traverse((m) => { if (m.isMesh) m.visible = false; }); continue; }
    ch.visible = false;
  }

  /* --------------------------------------------------- the model, placed -- */
  const src = gltf.scene.clone(true);
  const holder = new THREE.Group(); holder.name = 'wedge-ext'; holder.add(src); g.add(holder);
  // (the file's positions and normals are quantized, KHR_mesh_quantization, and interleaved: normalized int16 positions
  // and int8 normals sharing one buffer each. They are read out one vertex at a time (getX/getY/getZ, which undo the
  // normalization) into plain Float32 attributes of their own, so a crash's dents, which push the body's own vertices in,
  // move them by any amount and tilt the normals freely, not in the quantized steps)
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
  if (rims.some((r) => !r)) throw new Error('wedge: expected 4 wheels');
  // which way is forward: the axis the wheels spread along most, towards the lamps
  const wc = rims.map((r) => centre(r)), span = (k) => Math.max(...wc.map((c) => c[k])) - Math.min(...wc.map((c) => c[k]));
  const along = span('x') > span('z') ? 'x' : 'z', nose = centre(find(/^Daylight/)), tail = centre(find(/^Tail_light/));
  const ang = along === 'z' ? (nose.z > tail.z ? 0 : Math.PI) : (nose.x > tail.x ? -Math.PI / 2 : Math.PI / 2);
  src.rotation.y = ang; src.updateMatrixWorld(true);
  // the scale that sets its axles on the GT's (2 x rs.axle apart), its middle between them, the tyres on y = 0
  const wcs = rims.map((r) => centre(r)), fz = Math.max(...wcs.map((c) => c.z)), rz = Math.min(...wcs.map((c) => c.z));
  const k = (2 * rs.axle) / (fz - rz);
  src.scale.multiplyScalar(k); src.updateMatrixWorld(true);
  const tyres = find(/^wheel_.._tire/), ground = box(tyres).min.y, mid = centre(rims);
  src.position.set(-mid.x, -ground, -mid.z); src.updateMatrixWorld(true);
  g.updateMatrixWorld(true);

  /* -------------------------------------------------------------- paint -- */
  // (the owner, 18 Nov: Jensen's car in lime, #76B900, paint only) A deep gloss lime: a little metal flake under a thick
  // clear coat, so the sky and the street run along the body's creases as on a fresh supercar.
  const P = (p) => new THREE.MeshPhysicalNodeMaterial(p), S = (p) => new THREE.MeshStandardNodeMaterial(p), DS = THREE.DoubleSide;
  const canvasTex = (w, h, draw, srgb = true) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  // a 2x2 twill weave of its own (the source's carbon photograph is not shipped)
  const weave = canvasTex(256, 256, (cx, w, h) => {
    const n = 16, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const on = ((i + j) >> 1) % 2 === 0, gr = cx.createLinearGradient(i * s, j * s, on ? (i + 1) * s : i * s, on ? j * s : (j + 1) * s);
      gr.addColorStop(0, on ? '#2E3136' : '#1A1C20'); gr.addColorStop(0.5, on ? '#4A4E55' : '#25282D'); gr.addColorStop(1, on ? '#2A2D31' : '#17191C');
      cx.fillStyle = gr; cx.fillRect(i * s, j * s, s, s);
    }
  });
  weave.wrapS = weave.wrapT = THREE.RepeatWrapping; weave.repeat.set(6, 6);
  // the cluster's screen: a dial of its own, lit
  const dial = canvasTex(512, 256, (cx, w, h) => {
    cx.fillStyle = '#05070A'; cx.fillRect(0, 0, w, h);
    const lime = o.paint ?? WEDGE_LIME;
    cx.strokeStyle = '#1F262E'; cx.lineWidth = 14; cx.beginPath(); cx.arc(w / 2, h * 0.62, 92, Math.PI * 0.8, Math.PI * 2.2); cx.stroke();
    cx.strokeStyle = lime; cx.lineWidth = 14; cx.beginPath(); cx.arc(w / 2, h * 0.62, 92, Math.PI * 0.8, Math.PI * 1.55); cx.stroke();
    cx.fillStyle = '#E8EEF4'; cx.font = "700 64px 'Helvetica Neue', 'Arial', sans-serif"; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('88', w / 2, h * 0.6);
    cx.font = "500 18px 'Helvetica Neue', 'Arial', sans-serif"; cx.fillStyle = '#7C8894'; cx.fillText('MPH', w / 2, h * 0.78);
    for (const sx of [-1, 1]) { cx.fillStyle = '#10161D'; cx.fillRect(w / 2 + sx * 150 - 55, h * 0.4, 110, 70); cx.fillStyle = lime; cx.fillRect(w / 2 + sx * 150 - 45, h * 0.4 + 52, 60 + sx * 10, 6); }
  });
  const lime = o.paint ?? WEDGE_LIME;
  const paint = P({ color: lime, metalness: 0.25, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0, sheen: 0, side: DS });
  const X = {
    paint,
    carbon: P({ color: '#8A8F98', map: weave, metalness: 0.1, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05, side: DS }),
    trim: P({ color: '#0B0C0E', metalness: 0, roughness: 0.55, specularIntensity: 0.4, side: DS }),     // satin black plastic
    vents: S({ color: '#060708', metalness: 0.3, roughness: 0.6, side: DS }),                         // the hexagon meshes, dark
    piano: P({ color: '#050506', metalness: 0, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03, side: DS }),
    darkChrome: P({ color: '#3A3D42', metalness: 1, roughness: 0.22, side: DS }),
    tip: P({ color: '#6E6A66', metalness: 1, roughness: 0.3, side: DS }),                             // titanium tips
    rim: P({ color: '#141518', metalness: 0.8, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1, side: DS }),   // gloss black
    tyre: S({ color: '#131315', metalness: 0, roughness: 0.93, side: DS }),
    caliper: P({ color: o.caliper ?? lime, metalness: 0.1, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, side: DS }),
    // (dark tinted glass: a soft, dim sheen of the sky, not a mirror. A clear coat and a near-zero roughness on the model's
    // faceted, quantized glass broke the studio's light panels into white blotches across the windscreen)
    window: P({ color: '#07090C', metalness: 0, roughness: 0.04, specularIntensity: 0.07, transparent: true, opacity: 0.76, depthWrite: false, side: DS }),
    lens: P({ color: '#FFFFFF', metalness: 0, roughness: 0.02, transparent: true, opacity: 0.08, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false, side: DS }),
    redLens: P({ color: '#5A0A0E', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.5, clearcoat: 1, depthWrite: false, side: DS }),
    amberLens: P({ color: '#FFFFFF', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.12, clearcoat: 1, depthWrite: false, side: DS }),
    amber: S({ color: '#3A2400', emissive: '#FF9A1A', emissiveIntensity: 0.25, side: DS }),
    reflector: P({ color: '#4A0508', metalness: 0, roughness: 0.15, clearcoat: 1, emissive: '#C0101A', emissiveIntensity: 0.4 }),
    housing: P({ color: '#0D0E10', metalness: 0.6, roughness: 0.25, side: DS }),
    led: P({ color: '#2A2D31', metalness: 0.8, roughness: 0.2, emissive: '#DCE6F2', emissiveIntensity: 0.25 }),
    sensor: P({ color: '#07080A', metalness: 0.2, roughness: 0.1, clearcoat: 1, side: DS }),
    metal: S({ color: '#2A2C30', metalness: 0.9, roughness: 0.4, side: DS }),
    mirror: P({ color: '#B8C0C8', metalness: 1, roughness: 0.03 }),
    // the cabin: black leather and Alcantara, lime stitching panels
    cabin: S({ color: '#0E0F11', metalness: 0, roughness: 0.85, side: DS }),
    cabin2: S({ color: '#17181B', metalness: 0, roughness: 0.92, side: DS }),
    accent: S({ color: '#2A4200', metalness: 0, roughness: 0.8, side: DS }),
    wheelLeather: S({ color: '#121315', metalness: 0, roughness: 0.75, side: DS }),
    screen: S({ color: '#000000', emissive: '#FFFFFF', emissiveMap: dial, emissiveIntensity: 1.2 }),
    button: S({ color: '#6A0006', emissive: '#C0101A', emissiveIntensity: 0.4 }),
    engine: S({ color: '#1A1B1E', metalness: 0.7, roughness: 0.45, side: DS }),
  };
  const MAT = { disc: M.disc, lit: M.drl, tail: M.tail, tailCore: M.tailCore, under: M.under };
  // by the source's material names
  const BY = {
    Body: X.paint, Carbon: X.carbon, Plastic: X.trim, Vents: X.vents, Windows: X.window, Exhaust: X.tip, Engine: X.engine, Sphere: X.sensor, Metal: X.metal,
    Inside_Headlight: X.housing, Headlight: X.housing, Headlight_ligh_second: X.led, Headlight_light: MAT.lit, Light: MAT.lit,
    'Headlight_glass.001': X.lens, Headlight_glass: X.lens, Turning_light_glass: X.amberLens, Turning_light_inside: X.housing, Turning_light_right: X.amber, Turning_light_Left: X.amber,
    Taillight_glass: X.redLens, Tail_light: MAT.tail, Tail_light_brake: MAT.tailCore, Taillight_rear: X.reflector,
    Tire: X.tyre, material: X.rim, Caliper: X.caliper, Brake_rotor: MAT.disc,
    Interior_black: X.cabin, Interior_Black: X.cabin2, Interior_color: X.accent, Steering_wheel: X.wheelLeather, Cluster: X.screen, Start_button_lol: X.button, mirror: X.mirror,
  };
  const unknown = new Set();
  src.traverse((m) => {
    if (!m.isMesh) return;
    const mt = (m.userData.mat ??= m.material?.name || '');
    m.castShadow = !/Windows|glass/i.test(mt); m.receiveShadow = true;
    const to = BY[mt] ?? BY[mt.replace(/\.\d+$/, '')];
    if (to) m.material = to; else { unknown.add(mt); m.material = X.trim; }
  });
  if (unknown.size) console.warn('[wedge] materials finished as trim:', [...unknown].join(', '));

  /* -------------------------------------------------------------- wheels -- */
  // each corner's rim, tyre and disc turn in a spin group on its axle (x), inside a group that steers (y); the caliper
  // steers but does not turn
  rs.wheels.length = 0;
  CORNERS.forEach((c, i) => {
    const rim = rims[i], at = centre(rim), W = new THREE.Group(), spin = new THREE.Group(); W.add(spin);
    W.position.copy(g.worldToLocal(at.clone())); g.add(W); W.updateMatrixWorld(true);
    const parts = find(new RegExp(`^wheel_${c}_`));
    for (const p of parts) (/caliper/i.test(p.name) ? W : spin).attach(p);
    const tb = box(parts.filter((p) => /tire/i.test(p.name)));
    const r = tb.isEmpty() ? 0.34 : (tb.max.y - tb.min.y) / 2;
    rs.wheels.push({ W, spin, front: W.position.z > 0, r });
  });

  /* --------------------------------------------------------------- doors -- */
  // each side's door (its skin, glass, inner panel and mirror, cut free in the build) hung on a hinge at its front edge
  // just under the beltline, swinging up: an axis across the car, canted so the door's tail lifts up and a little out
  for (const sideK of ['L', 'R']) {
    const ps = find(new RegExp(`^door_${sideK}_`)); if (!ps.length) continue;
    const skin = ps.filter((p) => p.userData.mat === 'Body'), b = box(skin.length ? skin : ps);
    const lo = g.worldToLocal(b.min.clone()), hi = g.worldToLocal(b.max.clone());
    const sd = Math.sign(lo.x + hi.x) || 1;
    const pivot = new THREE.Group(); pivot.name = 'door' + sideK;
    pivot.position.set(sd > 0 ? hi.x - 0.1 : lo.x + 0.1, lo.y + (hi.y - lo.y) * 0.58, hi.z - 0.08);
    g.add(pivot); pivot.updateMatrixWorld(true);
    for (const p of ps) pivot.attach(p);
    const cant = o.doorCant ?? 0.25;
    rs.doors[sideK] = { pivot, axis: V3(1, -sd * cant, 0).normalize(), t: 0 };
  }

  /* ------------------------------------------------------ the driver's seat -- */
  // the wedge sits its driver lower and further forward than the GT: the anchor (and with it the seat marks, which are in
  // its frame) moved so his hip is on the model's own driver's cushion, a hand's width above its lowest point and about
  // a third of the way forward from the seat's back
  {
    const seat = find(/^Seat_/).length ? box(find(/^Seat_/)) : null;
    if (seat && !seat.isEmpty()) {
      const lo = g.worldToLocal(seat.min.clone()), hi = g.worldToLocal(seat.max.clone());
      const want = V3(rs.seat.hip[0], lo.y + (o.seatLift ?? 0.06), lo.z + (hi.z - lo.z) * (o.seatFwd ?? 0.55));
      rs.anchor.position.set(0, want.y - rs.seat.hip[1], want.z - rs.seat.hip[2]);
    }
  }

  /* ---------------------------------------------------- the wheel he holds -- */
  const steer = find(/^Steering_wheel_Steering_wheel/);
  if (steer.length && rs.yoke) {
    const c = g.worldToLocal(centre(steer));
    rs.yoke.position.copy(c); rs.yoke.updateMatrixWorld(true);
    const spin = rs.yoke.children[0]; for (const p of steer) spin.attach(p);
  }

  /* ------------------------------------------------------------ the flame -- */
  const tips = find(/^Exhaust_1_Exhaust/);
  if (tips.length) {
    const tb = box(tips), tc = g.worldToLocal(tb.getCenter(V3())), tz = g.worldToLocal(V3(0, 0, tb.min.z)).z;
    const ref = plumes.find((p) => p.userData.len != null), sp = plumes.find((p) => p.isSprite);
    const dz = ref ? tz - (ref.position.z + 0.012) : 0, dy = sp ? tc.y - sp.position.y : 0;
    for (const p of plumes) { p.position.z += dz; p.position.y += dy; p.position.x += tc.x; }
  }

  /* --------------------------------------------------- 'TENSORE', plate -- */
  const meshes = []; src.traverse((m) => { if (m.isMesh && m.visible) meshes.push(m); });
  const ray = new THREE.Raycaster();
  const skinZ = (y, dir, x = 0) => { g.updateMatrixWorld(true); ray.set(g.localToWorld(V3(x, y, dir > 0 ? -8 : 8)), V3(0, 0, dir).transformDirection(g.matrixWorld)); const h = ray.intersectObjects(meshes, false)[0]; return h ? g.worldToLocal(h.point.clone()).z : null; };
  const tl = find(/^Tail_light_Tail_light/), tlY = tl.length ? g.worldToLocal(centre(tl)).y : 0.72;
  {
    const tex = canvasTex(1024, 128, (cx, w, h) => { cx.clearRect(0, 0, w, h); cx.fillStyle = '#E8EBEF'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.font = "600 92px 'Helvetica Neue', 'Arial', sans-serif"; cx.fillText('T E N S O R E', w / 2, h / 2 + 4); });
    const mm = new THREE.MeshPhysicalNodeMaterial({ map: tex, transparent: true, metalness: 0.9, roughness: 0.2, alphaTest: 0.3 });
    const y = o.labelY ?? tlY - 0.115, z = skinZ(y, 1) ?? -2.3;
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.045), mm); pl.position.set(0, y, z - 0.006); pl.rotation.y = Math.PI; g.add(pl);
  }
  {
    const ptex = canvasTex(512, 256, (cx, w, h) => {
      cx.fillStyle = '#F4F4F0'; cx.fillRect(0, 0, w, h); cx.strokeStyle = '#2A2F3A'; cx.lineWidth = 8; cx.strokeRect(6, 6, w - 12, h - 12);
      cx.fillStyle = '#1B2A6A'; cx.font = "700 132px 'Arial Narrow', 'Arial', sans-serif"; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(o.plate || 'TENSOR', w / 2, h * 0.58);
      cx.fillStyle = '#B0141C'; cx.font = "italic 600 34px 'Georgia', serif"; cx.fillText('Silicon Valley', w / 2, h * 0.17);
    });
    const pm = new THREE.MeshStandardNodeMaterial({ map: ptex, roughness: 0.4, metalness: 0.1 });
    const py = o.plateY ?? 0.42, zb = skinZ(py, 1) ?? -2.3;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.305, 0.155), pm); back.position.set(0, py, zb - 0.01); back.rotation.y = Math.PI; g.add(back);
  }

  /* --------------------------------------------------------------- dents -- */
  // dent(x, z, speed): a crash's blow at the world point (x, z) (crash.js 'hit') pushes the car in there: the whole of
  // its body (the paint, the carbon, the trim, the lamps and their glass, the windows and the cabin behind them, the
  // doors), never its wheels, within a bowl round where the blow meets the skin (found by a ray from the blow toward the
  // car's middle), deepest there and easing out, its depth wavering a little from place to place (buckled metal), its
  // normals tilted and broken up so the light shows it. Everything near is moved by the one smooth push, so nothing
  // inside comes out through the skin, and the metal gives way less by a wheel, never reaching the tyre (dent-geom.js keepRoom). Deeper the harder
  // the hit (4.5 m/s a ding, 22 and up a deep crease), each place no further in than its cap however often it is hit.
  // Each mesh's geometry is its own copy (the downloaded model's is shared by its loader's cache), its positions floats
  // (above), taken on its first dent and put back on a repair.
  modelDents(THREE, rs, g);

  // its box, for all that runs into it or round it
  g.updateMatrixWorld(true);
  const bb = new THREE.Box3(); for (const m of meshes) bb.expandByObject(m);
  const lo = g.worldToLocal(bb.min.clone()), hi = g.worldToLocal(bb.max.clone());
  const hx = Math.max(Math.abs(lo.x), Math.abs(hi.x));
  return Object.assign(rs, {
    length: hi.z - lo.z, width: 2 * hx, height: hi.y, body: { hx, z0: lo.z - 0.02, z1: hi.z + 0.03, top: hi.y }, ext: holder, kind: 'wedge', label: 'Tensore',
  });
}

// (the dents of a world's ready-made model car, its body pushed in where it is hit: the Tensore's and the Kastell's
// (wagmi/storyrun/gwagon.js). rs: its rig (rs.wheels, kept clear); g: its group, whose meshes with a userData.mat (its
// model's own, its wheels' aside) are its skins. Sets rs.dent and rs.repair)
export function modelDents(THREE, rs, g) {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const skins = [];
  const _q = V3();
  g.traverse((m) => { if (m.isMesh && m.userData.mat != null && !/^wheel_/.test(m.name) && m.geometry?.attributes?.position) skins.push({ m, done: null, pos0: null, nor0: null }); });
  const skinMeshes = skins.map((s) => s.m), hitRay = new THREE.Raycaster();
  const _p = V3(), _n = V3(), _c = V3(), _in = V3(), _o = V3(), _w = V3(), _wd = V3(), _inv = new THREE.Matrix4(), _toG = new THREE.Matrix4(), _toM = new THREE.Matrix4(), _nm = new THREE.Matrix3(), _nmInv = new THREE.Matrix3(), _wk = new THREE.Matrix4();
  // (the wheels' keep-out drums, in the car's frame)
  const keeps = () => wheelKeeps(rs.wheels.map((w) => w.W), (m) => _wk.multiplyMatrices(_inv, m.matrixWorld));
  // (o.depth, o.r, o.cap: a blow already costed by the crash's damage (wagmi/crash/damage.js, which hands its dents to
  // the car's own dent when it has one, damage-cost.js dentSize), its depth, the bowl's radius and how far in any place
  // may go, in metres, in place of the ones by speed)
  rs.dent = (x, z, speed = 10, o2 = null) => {
    const sp = Math.min(30, Math.max(0, speed));
    if (sp < 4 && !o2?.depth) return 0;
    g.updateMatrixWorld(true);
    _inv.copy(g.matrixWorld).invert();
    // the blow on the car's own frame, at the body's waist; inward: from it toward the car's middle line (taken at the
    // car's own height: a point on the ground far under a town's raised streets, seen through the body's lean, lands
    // metres off it)
    _w.setFromMatrixPosition(g.matrixWorld);
    _c.set(x, _w.y + 0.55, z).applyMatrix4(_inv); _c.y = 0.55;
    _in.set(-_c.x, 0, -_c.z * 0.35); if (_in.lengthSq() < 1e-6) _in.set(0, 0, -Math.sign(_c.z) || 1); _in.normalize();
    // (where that meets the skin: a ray from outside the car along the inward line, or failing that straight across or
    // straight back, the first skin it meets near the blow (a ray that slips past a tapered nose's corner would find the
    // far side's skin first: never that); the bowl is centred there, pushed in along that ray)
    const ways = [_in.clone(), V3(-Math.sign(_c.x) || -1, 0, 0), V3(0, 0, -Math.sign(_c.z) || -1)];
    let best = null;
    for (const way of ways) {
      _w.copy(_c).addScaledVector(way, -4); g.localToWorld(_w); _wd.copy(way).transformDirection(g.matrixWorld);
      hitRay.set(_w, _wd); hitRay.far = 8;
      const h = hitRay.intersectObjects(skinMeshes, false)[0];
      if (!h) continue;
      const at = g.worldToLocal(h.point.clone()), off = Math.hypot(at.x - _c.x, at.z - _c.z);
      if (off < 0.75 && (!best || off < best.off)) best = { at, off, way };
    }
    if (best) { _c.copy(best.at); _c.y = Math.min(Math.max(_c.y, 0.3), 0.95); _in.copy(best.way); }
    const t = Math.min(1, (sp - 4) / 18), depth = o2?.depth ?? 0.04 + 0.16 * t, Rb = o2?.r ?? (0.3 + 0.012 * sp) * 1.6, cap = o2?.cap ?? 0.3;
    const K = keeps();
    rs.dentAt = [+_c.x.toFixed(2), +_c.y.toFixed(2), +_c.z.toFixed(2)]; // (where the last one landed, on the car: for a check)
    let moved = 0;
    for (const s of skins) {
      const { m } = s;
      if (!m.visible) continue;
      m.updateMatrixWorld(true);
      _toG.multiplyMatrices(_inv, m.matrixWorld); _toM.copy(_toG).invert();
      // (a quick miss: the mesh's box nowhere near the blow)
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox.clone().applyMatrix4(_toG);
      if (bb.distanceToPoint(_c) > Rb) continue;
      // (its first dent: its own copy, the built one kept)
      if (!s.pos0) {
        m.geometry = m.geometry.clone();
        s.pos0 = m.geometry.attributes.position.array.slice(); s.nor0 = m.geometry.attributes.normal?.array.slice() || null;
        s.done = new Float32Array(m.geometry.attributes.position.count);
      }
      const { done } = s, pos = m.geometry.attributes.position, nor = m.geometry.attributes.normal;
      _nm.getNormalMatrix(_toG); _nmInv.getNormalMatrix(_toM);
      let any = false;
      for (let i = 0; i < pos.count; i++) {
        _p.fromBufferAttribute(pos, i).applyMatrix4(_toG);
        // (a flattened sphere: the bowl runs further along the car than up and down it)
        const dx = _p.x - _c.x, dy = (_p.y - _c.y) * 1.4, dz = _p.z - _c.z, r = Math.sqrt(dx * dx + dy * dy + dz * dz) / Rb;
        if (r >= 1) continue;
        const room = cap - done[i]; if (room <= 0) continue;
        // (buckled, not a smooth spoon: the depth wavers a little, smoothly, so no face folds over)
        const f = (1 - r * r) ** 2, want = depth * f * (1 + 0.05 * crumple(_p.x, _p.y, _p.z));
        const d = Math.min(room, want, keepRoom(_p, K));
        if (!(d > 1e-5)) continue;
        done[i] += d;
        _q.copy(_p).addScaledVector(_in, d).applyMatrix4(_toM); pos.setXYZ(i, _q.x, _q.y, _q.z);
        if (nor) {
          // (the bowl's wall: its normal leans toward the dent's middle, by the falloff's slope, and a little more, so it
          // catches the light as a dent does; and a finer break-up over it, the crumple's creases)
          _n.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize();
          _o.set(dx, dy, dz); _o.addScaledVector(_in, -_o.dot(_in)); const ol = _o.length();
          if (ol > 1e-4) { _n.addScaledVector(_o, -(4 * r * (1 - r * r)) * (depth / Rb) * 2 / ol); }
          const cr = crease(_p.x, _p.y, _p.z) * f * Math.min(0.45, 2 * depth);
          _n.x += cr; _n.y += 0.6 * cr; _n.z -= cr; _n.normalize();
          _n.applyMatrix3(_nmInv).normalize(); nor.setXYZ(i, _n.x, _n.y, _n.z);
        }
        any = true; moved++;
      }
      if (any) { pos.needsUpdate = true; if (nor) nor.needsUpdate = true; m.geometry.boundingSphere = null; m.geometry.boundingBox = null; }
    }
    return moved;
  };
  // repair(): every panel back as built (the damage's repair, wagmi/crash/damage.js)
  rs.repair = () => {
    for (const s of skins) {
      if (!s.pos0) continue;
      const { m } = s, pos = m.geometry.attributes.position, nor = m.geometry.attributes.normal;
      pos.array.set(s.pos0); pos.needsUpdate = true; if (nor && s.nor0) { nor.array.set(s.nor0); nor.needsUpdate = true; }
      s.done.fill(0); m.geometry.boundingSphere = null; m.geometry.boundingBox = null;
    }
  };
}
