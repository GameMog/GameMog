// Mog City: the Kastell, a world's hero car { model: 'mogcity/gwagon' } (Mandi's Revenge: Mandi's car). A tall, square
// luxury off-roader in gloss black: a flat upright face with round lamps, slab sides, a spare wheel on its tailgate, side
// pipes. It is a look-alike: no maker's name, crest, badge or model lettering, and none was on the model (its grille two
// plain bars, its wheel centres plain cones, its spare cover plain, its plates blank).
//
// Its body is a ready-made model's: assets/vehicles/gwagon/gwagon.glb, made from a low-poly model by DemuriaGT on
// Sketchfab (CC BY 4.0, assets/vehicles/gwagon/CREDITS.md), scaled to metres, its one palette texture dropped and its
// body split into parts by the palette's colours (paint, chrome, glass, lamps, trim), the front doors cut free and a cabin
// built in (tools/vehicles/gwagon/build.py). Every surface is finished here by its part's name.
//
// It drives as an SUV, not as the roadster: heavier, slower to turn, strong off the line, no boost, softer springs, the
// camera a little higher and further back for its height, a deep petrol V8's note (wagmi/audio/utility.js 'v8suv');
// rs.fit(car) puts those numbers on the car entity (wagmi/game.js). Like the Tensore (wedge.js) it keeps gt.js's rig:
// the driver's anchor (his seat marks set on this cabin's own seat), the wheel his hands hold (moved to the model's
// wheel), setDoor (its front doors on a hinge at their front edge, swinging out), its dents (wedge.js modelDents).
//   const rs = await buildGwagon(THREE, { paint?, plate? })
import { buildGT } from './gt.js';
import { loadGLB } from '../glb.js';
import { CREDITS } from '../credits.js';
import { modelDents } from './wedge.js';
import { setClass, mogFraming } from './ride.js';

export const GWAGON_GLB = new URL('../../assets/vehicles/gwagon/gwagon.glb', import.meta.url).href;

// its line in the pause menu's Credits and the end roll (CC BY 4.0 asks for it wherever the car is shown)
export const GWAGON_CREDIT = { group: 'The Kastell\'s body', what: 'The Kastell\'s body: 3D model by DemuriaGT (Sketchfab), modified', who: 'DemuriaGT', note: 'modified: scaled, retextured in the game\'s own materials, doors cut free, a cabin added; the game\'s car is a look-alike with no connection to any car maker', licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', src: 'https://sketchfab.com/3d-models/aa1a732d4fdc44e0a20cee312a929d77' };

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

export async function buildGwagon(THREE, o = {}) {
  const gltf = await loadGLB(GWAGON_GLB);
  { const sec = CREDITS.find((c) => c.heading === 'Vehicles'); if (sec && !sec.lines.includes(GWAGON_CREDIT)) sec.lines.push(GWAGON_CREDIT); }
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
    paint: P({ color: paintHex, metalness: 0, roughness: 0.5, specularIntensity: 0.25, clearcoat: 0.85, clearcoatRoughness: 0.04, side: DS }),
    chrome: P({ color: '#E6E9EE', metalness: 1, roughness: 0.07, side: DS }),
    trim: P({ color: '#15171A', metalness: 0.45, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.1, side: DS }),    // the grille's, the bumpers'
    // (privacy glass: the driver still shows through the front doors' and the windscreen's)
    glass: P({ color: '#06080B', metalness: 0, roughness: 0.04, specularIntensity: 0.08, transparent: true, opacity: 0.66, depthWrite: false, side: DS }),
    screen: P({ color: '#0A0D11', metalness: 0, roughness: 0.03, specularIntensity: 0.08, transparent: true, opacity: 0.42, depthWrite: false, side: DS }),
    // (the round lamps: a polished reflector behind clear glass, a soft daytime glow, not a white disc)
    lamp: P({ color: '#3A4048', metalness: 1, roughness: 0.06, clearcoat: 1, emissive: '#EEF4FF', emissiveIntensity: 0.32 }),
    tail: P({ color: '#5A0008', metalness: 0, roughness: 0.1, clearcoat: 1, emissive: '#FF2030', emissiveIntensity: 1.1 }),
    plate: S({ map: plateTex, roughness: 0.4, metalness: 0.1 }),
    pipe: P({ color: '#C4C8CE', metalness: 1, roughness: 0.16, side: DS }),
    cabin: S({ color: '#121315', metalness: 0, roughness: 0.9, side: DS }),
    leather: P({ color: '#17120F', metalness: 0, roughness: 0.52, sheen: 0.35, sheenRoughness: 0.5, sheenColor: '#3A2C22', side: DS }),
    dash: S({ color: '#101113', metalness: 0, roughness: 0.75, side: DS }),
    display: S({ color: '#000000', emissive: '#FFFFFF', emissiveMap: screenTex, emissiveIntensity: 1.1 }),
    wheelLeather: S({ color: '#111214', metalness: 0, roughness: 0.7, side: DS }),
    metal: P({ color: '#9AA0A8', metalness: 1, roughness: 0.25, side: DS }),
    rim: P({ color: '#26292D', metalness: 1, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, side: DS }),
    tyre: S({ color: '#121214', metalness: 0, roughness: 0.93, side: DS }),
  };
  // by the model's material names (tools/vehicles/gwagon/build.py)
  const BY = {
    Paint: X.paint, Chrome: X.chrome, Glass: X.glass, Windscreen: X.screen, Tail_light: X.tail, Headlight: X.lamp, Plate: X.plate, Trim: X.trim, Handle: X.chrome,
    Exhaust: X.pipe, Interior: X.cabin, Under: M.under, Tire: X.tyre, Rim: X.rim, Leather: X.leather, Dash: X.dash, Screen: X.display, Steering_wheel: X.wheelLeather, Metal: X.metal,
  };
  const unknown = new Set();
  src.traverse((m) => {
    if (!m.isMesh) return;
    const mt = (m.userData.mat ??= m.material?.name || '');
    m.castShadow = !/Glass|Windscreen/.test(mt); m.receiveShadow = true;
    const to = BY[mt] ?? BY[mt.replace(/\.\d+$/, '')];
    if (to) m.material = to; else { unknown.add(mt); m.material = X.trim; }
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
    for (const p of parts) spin.attach(p);
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
