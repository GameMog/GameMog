// Mog City: Mission 2's sets. The Suits' container yard on the 12th Ave apron by the cruise piers (W 54th-55th St):
// a chain-link fence with a gate onto 12th Ave (south), a side gate (east) and a torn gap on the park side (west), stacks
// of shipping containers (solid: they join the city's colliders while the yard stands, so Dan, the car, the Suits and
// the fight's camera all keep out of them), floodlights with pools of light, and the stash: a folding table of burner
// phones and laptops by the van's side door, crates of BLIMPCO merch. Mack's car (a black sedan, acid-green rims and
// underglow, plate MACK 1) and Mack himself (a Suit: thug.glb's grey suit, black shirt and dark glasses, a security pass).
//   const Y = buildYard(W); Y.show(true) (colliders in) / Y.show(false) (out); Y.posts, Y.stash, Y.vanAt, Y.mackAt ...
//   const L = buildMackCar(W);  const mack = await buildMack(W);
import * as THREE from 'three/webgpu';
import { loadGLB } from '../glb.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { positionWorld, positionLocal, normalLocal, uv, vec2, vec3, vec4, float, mix, smoothstep, clamp, abs, color, length, pow, mrt, mx_noise_float } from 'three/tsl';
import { rig } from './cine.js';
import { relaxArms } from '../combat/suitarms.js';

const PI = Math.PI;
export const YARD = { x0: -1946, x1: -1898, z0: -1080, z1: -1022, cx: -1924, cz: -1050 };

function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* ------------------------------------------------- the yard's dressing (shared) -- */
// A container's steel, built once per length (along x, centred on its middle): corrugated side walls and front end
// (trapezoid ribs that catch the low sun), the doors at the back (two leaves, four locking bars), the roof, corner posts
// and rails, and the corner castings proud of them
const CH = 2.59, CW = 2.44;
function containerGeometry(L) {
  const parts = [];
  const box = (sx, sy, sz, x, y, z) => { const b = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed(); b.translate(x, y, z); parts.push(b); };
  // a corrugated panel: its run (s) along `axis` ('x' | 'z'), from s0 to s1, y0 to y1, its face at `at` facing `sign`
  function corrugated(axis, s0, s1, y0, y1, at, sign) {
    const pos = [], nor = [], uvs = [], P = 0.28, D = 0.035;
    const prof = [];
    for (let s = s0; s < s1 - 1e-4; s += P) prof.push([s, 0], [Math.min(s1, s + P * 0.16), D], [Math.min(s1, s + P * 0.5), D], [Math.min(s1, s + P * 0.66), 0]);
    prof.push([s1, 0]);
    const V3 = (s, d, y) => (axis === 'x' ? [s, y, at + sign * d] : [at + sign * d, y, s]);
    for (let i = 0; i < prof.length - 1; i++) {
      const [sa, da] = prof[i], [sb, db] = prof[i + 1], l = Math.hypot(sb - sa, db - da);
      if (l < 1e-5) continue;
      // (the strip's outward normal, in the (run, out) plane)
      const ns = -(db - da) / l, no = (sb - sa) / l;
      const n = axis === 'x' ? [ns, 0, sign * no] : [sign * no, 0, ns];
      const a = V3(sa, da, y0), b = V3(sb, db, y0), c = V3(sb, db, y1), d = V3(sa, da, y1);
      // (wound to face its normal)
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
      const tri = cx * n[0] + cy * n[1] + cz * n[2] > 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
      for (const p of tri) { pos.push(...p); nor.push(...n); uvs.push((p[axis === 'x' ? 0 : 2] - s0) / (s1 - s0), (p[1] - y0) / (y1 - y0)); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    parts.push(g);
  }
  const hx = L / 2, hz = CW / 2, hy = CH / 2, F = 0.15;
  corrugated('x', -hx + F, hx - F, -hy + F, hy - F, hz - 0.045, 1);
  corrugated('x', -hx + F, hx - F, -hy + F, hy - F, -hz + 0.045, -1);
  corrugated('z', -hz + F, hz - F, -hy + F, hy - F, -hx + 0.045, -1);
  // the doors: two flat leaves, a locking bar's pair of rods down each half, the handles
  box(0.04, CH - 2 * F, CW - 2 * F, hx - 0.06, 0, 0);
  for (const z of [-0.86, -0.3, 0.3, 0.86]) {
    const rod = new THREE.CylinderGeometry(0.022, 0.022, CH - 0.22, 8).toNonIndexed(); rod.translate(hx - 0.0, 0, z); parts.push(rod);
    box(0.05, 0.05, 0.16, hx + 0.01, -0.15, z + (z > 0 ? -0.08 : 0.08));
  }
  box(0.02, CH - 2 * F, 0.03, hx - 0.03, 0, 0);
  // the roof, the frame and its castings
  box(L - 2 * F, 0.04, CW - 2 * F, 0, hy - 0.1, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(F, CH, F, sx * (hx - F / 2), 0, sz * (hz - F / 2));
  for (const sz of [-1, 1]) { box(L, 0.13, 0.11, 0, hy - 0.065, sz * (hz - 0.055)); box(L, 0.16, 0.13, 0, -hy + 0.08, sz * (hz - 0.065)); }
  for (const sx of [-1, 1]) { box(0.13, 0.15, CW, sx * (hx - 0.065), hy - 0.075, 0); box(0.13, 0.18, CW, sx * (hx - 0.065), -hy + 0.09, 0); }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) box(0.18, 0.12, 0.17, sx * (hx - 0.09), sy * (hy - 0.06), sz * (hz - 0.085));
  return mergeGeometries(parts, false);
}

// Painted steel in a container's colour: faded in big patches by the sun, rust bleeding down from the roof rails in
// streaks, rust blooms along the bottom, grime splashed up from the ground; the roof rustier still
function containerMaterial(hex) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.66, metalness: 0.3 });
  const wp = positionWorld, lp = positionLocal, n = normalLocal;
  const h = lp.y.add(CH / 2).div(CH); // 0 at the bottom .. 1 at the top
  const run = wp.x.add(wp.z);
  const fade = mx_noise_float(vec3(run.mul(0.18), wp.y.mul(0.35), 3.1)).mul(0.5).add(0.5);
  const paint = mix(color(hex), color(hex).mul(1.35).add(0.03), smoothstep(0.45, 0.9, fade).mul(0.6));
  const cols = mx_noise_float(vec3(run.mul(5.0), 0.0, 7.7)).mul(0.5).add(0.5);
  const reach = mx_noise_float(vec3(run.mul(1.3), 0.0, 1.9)).mul(0.5).add(0.5).mul(0.55).add(0.1);
  const streak = smoothstep(0.55, 0.85, cols).mul(smoothstep(float(1.0).sub(reach), float(1.0), h)).mul(float(1.0).sub(abs(n.y)));
  const bloom = smoothstep(0.24, 0.0, h).mul(mx_noise_float(vec3(run.mul(2.2), wp.y.mul(2.0), 4.4)).mul(0.5).add(0.5));
  const roofRust = smoothstep(0.5, 1.0, n.y).mul(mx_noise_float(vec3(wp.x.mul(0.9), wp.z.mul(0.9), 2.2)).mul(0.5).add(0.5));
  const rust = clamp(streak.mul(0.85).add(bloom.mul(0.7)).add(roofRust.mul(0.8)), 0.0, 1.0);
  const grime = smoothstep(0.16, 0.0, h).mul(0.45);
  m.colorNode = mix(paint, color(0x5a3018), rust).mul(float(1.0).sub(grime));
  m.roughnessNode = mix(float(0.62), float(0.9), rust);
  m.metalnessNode = mix(float(0.32), float(0.05), rust);
  return m;
}

// A wooden pallet (1.2 x 1.0 m): seven deck boards on three stringers on three base boards
function palletGeometry() {
  const parts = [], box = (sx, sy, sz, x, y, z) => { const b = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed(); b.translate(x, y, z); parts.push(b); };
  for (let i = 0; i < 7; i++) box(0.1 + (i % 3 === 0 ? 0.04 : 0), 0.022, 1.0, -0.55 + i * (1.1 / 6), 0.133, 0);
  for (const z of [-0.45, 0, 0.45]) box(1.2, 0.1, 0.08, 0, 0.072, z);
  for (const x of [-0.52, 0, 0.52]) box(0.14, 0.022, 1.0, x, 0.011, 0);
  return mergeGeometries(parts, false);
}

// a rod from a to b ([x, y, z]), radius r (non-indexed, for merging)
const _ya = new THREE.Vector3(0, 1, 0);
function rodGeo(a, b, r, seg = 6) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
  const geo = new THREE.CylinderGeometry(r, r, L, seg, 1, true).toNonIndexed();
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_ya, d.divideScalar(L)));
  geo.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return geo;
}

export function buildYard(W) {
  const app = W.app, cm = app.controllerManager, scene = app.scene;
  const g = new THREE.Group(); g.name = 'wagmi-m2-yard'; g.visible = false; scene.add(g);
  const ground = (x, z) => cm.getGroundHeight(x, z, 'person');

  /* ------------------------------------------------------- containers -- */
  // corrugated steel boxes (containerGeometry), each colour its own weathered paint (containerMaterial)
  const COLS = [0x6b2a20, 0x1f4f53, 0x1b2a3c, 0x8a4519, 0x4d5257, 0x111315];
  const cmats = COLS.map((c) => containerMaterial(c));
  const cgeo = { 12.2: containerGeometry(12.2), 6.1: containerGeometry(6.1) };
  // [centre x, centre z, along x (40 ft / 20 ft) or along z, length, levels, colour, label]
  const BOXES = [
    [-1942.6, -1072, 'z', 12.2, 2, 0, 'BEAR LOGISTICS'], [-1940.0, -1072, 'z', 12.2, 1, 2, null], [-1942.6, -1046, 'z', 12.2, 1, 1, 'BULL MARINE'], [-1942.6, -1030.5, 'z', 6.1, 1, 3, null],
    [-1928, -1077.3, 'x', 12.2, 3, 2, 'HEDGE LINES'], [-1914, -1077.3, 'x', 12.2, 1, 4, null], [-1902, -1070, 'z', 12.2, 2, 3, 'BULL MARINE'],
    [-1930, -1052, 'x', 6.1, 1, 5, 'JPB'], [-1928, -1064, 'x', 6.1, 1, 1, null], [-1925, -1033, 'z', 6.1, 1, 0, null],
    [-1936, -1014, 'x', 12.2, 1, 1, 'BULL MARINE'], [-1957, -1040, 'z', 12.2, 1, 3, null], [-1952, -1062, 'z', 12.2, 2, 0, 'BEAR LOGISTICS'],
  ];
  const H = CH, Wd = CW;
  const colliders = [];
  const labelMat = (text, acid) => new THREE.MeshStandardMaterial({ map: canvasTex(512, 96, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    if (acid) { x.fillStyle = '#B6FF3B'; x.font = 'italic 900 76px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.shadowColor = '#B6FF3B'; x.shadowBlur = 8; x.fillText(text, w / 2, 76); }
    else { x.fillStyle = 'rgba(240,240,232,.86)'; x.font = '800 60px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.fillText(text, w / 2, 70); }
  }), transparent: true, alphaTest: 0.2, roughness: 0.8, depthWrite: false, ...(acid ? { emissive: '#4A7A10', emissiveIntensity: 0.6 } : {}) });
  const labels = {};
  for (const [cx, cz, ax, len, lv, ci, label] of BOXES) {
    const sx = ax === 'x' ? len : Wd, sz = ax === 'x' ? Wd : len, y0 = ground(cx, cz);
    for (let k = 0; k < lv; k++) {
      // (stacked a little out of true, the doors one way or the other)
      const m = new THREE.Mesh(cgeo[len], cmats[(ci + k * 2) % cmats.length]);
      m.rotation.y = (ax === 'x' ? 0 : PI / 2) + ((Math.round(cx * 7 + cz * 3 + k) & 1) ? PI : 0) + (k ? Math.sin(cx * 13 + k) * 0.012 : 0);
      m.position.set(cx, y0 + H * (k + 0.5), cz); m.castShadow = true; m.receiveShadow = true; g.add(m);
    }
    if (label) {
      const mat = labels[label] || (labels[label] = labelMat(label, label === 'JPB'));
      for (const s of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(len * 0.7, 8), Math.min(len * 0.7, 8) * 96 / 512), mat);
        if (ax === 'x') { p.position.set(cx, y0 + H * 0.62, cz + s * (Wd / 2 + 0.02)); p.rotation.y = s > 0 ? 0 : PI; }
        else { p.position.set(cx + s * (Wd / 2 + 0.02), y0 + H * 0.62, cz); p.rotation.y = s > 0 ? PI / 2 : -PI / 2; }
        g.add(p);
      }
    }
    colliders.push({ minX: cx - sx / 2, maxX: cx + sx / 2, minZ: cz - sz / 2, maxZ: cz + sz / 2, maxY: y0 + H * lv, wagmi: 'm2' });
  }

  /* ------------------------------------------------------------ fence -- */
  // chain link: galvanised wire in 6 cm diamonds (alpha to coverage: fine wire stays fine under the MSAA, no shimmer),
  // a top rail, a tension wire along the bottom, three strands of barbed wire on arms leaning out, and a torn green
  // windscreen tied along the 12th Ave and park sides
  const link = canvasTex(128, 128, (x, w, h) => {
    x.clearRect(0, 0, w, h); x.strokeStyle = '#D5DADF'; x.lineWidth = 2.2;
    for (let i = -1; i < 3; i++) for (let j = -1; j < 3; j++) {
      const cx = i * w / 2 + w / 4, cy = j * h / 2 + h / 4;
      x.beginPath(); x.moveTo(cx - w / 4, cy); x.lineTo(cx, cy - h / 4); x.lineTo(cx + w / 4, cy); x.lineTo(cx, cy + h / 4); x.closePath(); x.stroke();
    }
  }, true);
  const fenceMat = new THREE.MeshStandardMaterial({ map: link, alphaTest: 0.35, alphaToCoverage: true, side: THREE.DoubleSide, color: '#9AA1A8', metalness: 0.55, roughness: 0.5 });
  const screenTex = canvasTex(256, 128, (x, w, h) => {
    x.fillStyle = 'rgba(28,52,38,0.93)'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 4) { x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(i, 0, 1, h); }
    // (rips: ragged holes the wind has made)
    x.globalCompositeOperation = 'destination-out';
    for (const [cx, cy, rw, rh] of [[60, 70, 26, 34], [170, 40, 18, 22], [215, 96, 30, 20]]) {
      x.beginPath(); for (let k = 0; k <= 14; k++) { const a = k / 14 * Math.PI * 2, r = 0.6 + Math.random() * 0.5; x.lineTo(cx + Math.cos(a) * rw * r, cy + Math.sin(a) * rh * r); } x.fill();
    }
    x.globalCompositeOperation = 'source-over';
  }, true);
  const screenMat = new THREE.MeshStandardMaterial({ map: screenTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.92 });
  const steel = new THREE.MeshStandardMaterial({ color: '#7D848C', metalness: 0.65, roughness: 0.42 });
  const wireMat = new THREE.MeshStandardMaterial({ color: '#5E646B', metalness: 0.7, roughness: 0.5 });
  const FH = 2.4, { x0, x1, z0, z1 } = YARD;
  // runs [ax, az, bx, bz] round the yard with the gates left open: south gate x -1922..-1910, the side gate onto W 55th
  // St z -1044..-1034, the torn gap on the park side z -1060..-1055 (screened: the runs on 12th Ave and the park side)
  const RUNS = [[x0, z1, -1922, z1, 1], [-1910, z1, x1, z1, 1], [x1, z1, x1, -1034], [x1, -1044, x1, z0], [x1, z0, x0, z0], [x0, z0, x0, -1060, 1], [x0, -1055, x0, z1, 1]];
  const postGeo = new THREE.CylinderGeometry(0.045, 0.045, FH + 0.15, 8), endGeo = new THREE.CylinderGeometry(0.06, 0.06, FH + 0.2, 8);
  const wireGeos = [];
  for (const [ax, az, bx, bz, screened] of RUNS) {
    const len = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2, y = ground(mx, mz), yaw = -Math.atan2(bz - az, bx - ax);
    const geo = new THREE.PlaneGeometry(len, FH); const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 0.12, uv.getY(i) * FH / 0.12);
    const p = new THREE.Mesh(geo, fenceMat); p.position.set(mx, y + FH / 2 + 0.05, mz); p.rotation.y = yaw; p.castShadow = true; g.add(p);
    if (screened) {
      // (the windscreen on the outside face, its lower 1.8 m, cut short here and there)
      const sl = len * 0.94, sg = new THREE.PlaneGeometry(sl, 1.8), su = sg.attributes.uv; for (let i = 0; i < su.count; i++) su.setXY(i, su.getX(i) * sl / 6, su.getY(i));
      const s = new THREE.Mesh(sg, screenMat); s.position.set(mx, y + 1.0, mz); s.rotation.y = yaw; s.translateZ(az === z1 || bz === z1 ? 0.03 : -0.03); s.castShadow = true; g.add(s);
    }
    const ox = -(bz - az) / len, oz = (bx - ax) / len; // (a side of the run: the arms lean out of the yard)
    const out = ((mx + ox) - YARD.cx) * ox + ((mz + oz) - YARD.cz) * oz > 0 ? 1 : -1;
    // the top rail, the bottom tension wire, the barbed strands on their arms
    wireGeos.push(rodGeo([ax, y + FH + 0.06, az], [bx, y + FH + 0.06, bz], 0.024, 6), rodGeo([ax, y + 0.12, az], [bx, y + 0.12, bz], 0.006, 4));
    for (let k = 1; k <= 3; k++) { const o = 0.11 * k * out, up = y + FH + 0.05 + 0.11 * k; wireGeos.push(rodGeo([ax + ox * o, up, az + oz * o], [bx + ox * o, up, bz + oz * o], 0.0045, 4)); }
    for (let s = 0; s <= len + 0.01; s += 3) {
      const k = Math.min(1, s / len), end = s === 0 || s + 3 > len + 0.01, px = ax + (bx - ax) * k, pz = az + (bz - az) * k, py = ground(px, pz);
      const q = new THREE.Mesh(end ? endGeo : postGeo, steel); q.position.set(px, py + (FH + 0.15) / 2, pz); q.castShadow = true; g.add(q);
      wireGeos.push(rodGeo([px, py + FH + 0.05, pz], [px + ox * out * 0.38, py + FH + 0.43, pz + oz * out * 0.38], 0.016, 5));
    }
    colliders.push({ minX: Math.min(ax, bx) - 0.1, maxX: Math.max(ax, bx) + 0.1, minZ: Math.min(az, bz) - 0.1, maxZ: Math.max(az, bz) + 0.1, maxY: y + FH, wagmi: 'm2' });
  }
  { const w = new THREE.Mesh(mergeGeometries(wireGeos, false), wireMat); w.castShadow = true; g.add(w); }
  // a sign on the gate: the gang's idea of a front
  {
    const t = canvasTex(512, 160, (x, w, h) => {
      x.fillStyle = '#0E0F11'; x.fillRect(0, 0, w, h); x.strokeStyle = '#B6FF3B'; x.lineWidth = 6; x.strokeRect(8, 8, w - 16, h - 16);
      x.fillStyle = '#fff'; x.font = '800 54px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.fillText('JPBANK SECURITY', w / 2, 70);
      x.fillStyle = '#B6FF3B'; x.font = '700 32px "Barlow Condensed", sans-serif'; x.fillText('DEPOT · NO LOITERING · AUTHORISED STAFF ONLY', w / 2, 122);
    });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: '#FFFFFF', emissiveMap: t, emissiveIntensity: 0.25 }));
    s.position.set(-1928, ground(-1928, z1) + 1.55, z1 + 0.06); g.add(s);
  }

  /* ------------------------------------------------------- work lights -- */
  // Four work lights on galvanised poles, two LED floods on a crossarm each, aimed down into the yard. The light they
  // throw (no real lights: a light added to the scene rebuilds every pipeline in the city) is a soft pool on the
  // ground, brightest under the floods' aim and fading out softly round it, by the hour (off by day, full at dusk and
  // night: the city's own interior-glow uniform)
  const U = window.NYC && window.NYC.cityUniforms;
  const night = U ? smoothstep(0.35, 1.3, U.uInteriorGlow) : float(1.0);
  const poolMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 });
  {
    // (uv: x across the pool, y from the pole (0) out (1); brightest a third of the way out, the floods' hot spot)
    const q = uv().sub(0.5).mul(2.0), r = length(q), along = uv().y;
    const fall = pow(clamp(float(1.0).sub(r), 0.0, 1.0), 2.4).mul(smoothstep(0.0, 0.3, along).mul(0.6).add(0.4));
    const spot = pow(clamp(float(1.0).sub(length(q.sub(vec2(0.0, -0.25)).mul(vec2(1.25, 1.6)))), 0.0, 1.0), 2.0);
    poolMat.colorNode = color(0xffe6c4).mul(fall.mul(0.07).add(spot.mul(0.11)).mul(night));
    poolMat.mrtNode = mrt({ normal: vec4(0, 0, 0, 0), metalRough: vec4(0, 0, 0, 0) }); // (the reflections keep seeing the ground under it)
  }
  const pools = [];
  const lampMat = new THREE.MeshStandardMaterial({ color: '#FFF4DE', emissive: '#FFF1DC', emissiveIntensity: 4.0 });
  const housing = new THREE.MeshStandardMaterial({ color: '#2A2D31', metalness: 0.5, roughness: 0.55 });
  const galv = new THREE.MeshStandardMaterial({ color: '#8A9097', metalness: 0.6, roughness: 0.48 });
  for (const [px, pz, tx, tz] of [[-1944.5, -1024, -1930, -1036], [-1944.5, -1079, -1930, -1064], [-1899.5, -1079, -1912, -1066], [-1899.5, -1024, -1912, -1036]]) {
    const y = ground(px, pz), PH = 7.2, yaw = Math.atan2(tx - px, tz - pz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, PH, 10), galv); pole.position.set(px, y + PH / 2, pz); pole.castShadow = true; g.add(pole);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.35, 10), new THREE.MeshStandardMaterial({ color: '#77736B', roughness: 0.9 })); base.position.set(px, y + 0.17, pz); g.add(base);
    const rig = new THREE.Group(); rig.position.set(px, y + PH, pz); rig.rotation.y = yaw; g.add(rig);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.08), galv); arm.position.set(0, -0.05, 0.12); rig.add(arm);
    for (const sx of [-0.55, 0.55]) {
      // (a flood: a dark finned housing tipped down at the yard, its face lit)
      const head = new THREE.Group(); head.position.set(sx, -0.22, 0.28); head.rotation.x = 0.85; rig.add(head);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.1), housing); box.castShadow = true; head.add(box);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28), lampMat); face.position.z = 0.052; head.add(face);
      for (let f = -2; f <= 2; f++) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.32, 0.06), housing); fin.position.set(f * 0.09, 0, -0.08); head.add(fin); }
    }
    // the pool: from just short of the pole out past the aim point
    const d = Math.hypot(tx - px, tz - pz), gy = ground(tx, tz);
    const pg = new THREE.PlaneGeometry(14, d + 9).rotateX(-PI / 2);
    const p = new THREE.Mesh(pg, poolMat); p.rotation.y = yaw + PI; p.position.set(px + (tx - px) / d * (d + 9) / 2 + (tx - px) / d * 0.5, gy + 0.03, pz + (tz - pz) / d * (d + 9) / 2 + (tz - pz) / d * 0.5); p.renderOrder = 4; g.add(p); pools.push(p);
  }

  /* ------------------------------------------------------------ dressing -- */
  // pallets stacked against the containers, oil drums, a stack of old tyres, and oil stains where the vans stand
  // (kept off the lookouts' beats and the crew's ground; no colliders: they are the containers' and the fence's own)
  {
    const wood = new THREE.MeshStandardNodeMaterial({ roughness: 0.92 });
    wood.colorNode = mix(color(0x6f5c45), color(0x8f7a5e), mx_noise_float(vec3(positionWorld.x.mul(9.0), positionWorld.y.mul(2.0), positionWorld.z.mul(0.7))).mul(0.5).add(0.5)).mul(0.9);
    const STACKS = [[-1934, -1074.6, 0.1, 6], [-1931.2, -1074.8, -0.2, 3], [-1939.6, -1050.5, PI / 2 + 0.06, 5], [-1939.7, -1053.6, PI / 2 - 0.1, 2], [-1905.4, -1074.5, 0.3, 4], [-1927.8, -1026.4, 1.2, 2]];
    const n = STACKS.reduce((a, s) => a + s[3], 0), pal = new THREE.InstancedMesh(palletGeometry(), wood, n), o = new THREE.Object3D();
    let i = 0;
    for (const [x, z, yaw, count] of STACKS) for (let k = 0; k < count; k++) {
      o.position.set(x + Math.sin(k * 2.1) * 0.05, ground(x, z) + k * 0.145, z + Math.cos(k * 1.7) * 0.05); o.rotation.set(0, yaw + Math.sin(k * 3.3) * 0.06, 0); o.updateMatrix(); pal.setMatrixAt(i++, o.matrix);
    }
    pal.castShadow = true; pal.receiveShadow = true; g.add(pal);
    // drums: blue and black 55 gallon, their rolling hoops
    const drumGeo = mergeGeometries([new THREE.CylinderGeometry(0.29, 0.29, 0.88, 18).toNonIndexed(), ...[0.29, 0.59].map((h) => { const t = new THREE.TorusGeometry(0.295, 0.014, 4, 18).rotateX(PI / 2).toNonIndexed(); t.translate(0, h - 0.44, 0); return t; })], false);
    const DRUMS = [[-1940.2, -1033.6, 0], [-1940.1, -1032.9, 1], [-1939.5, -1033.3, 0], [-1906.6, -1077.6, 1], [-1937.8, -1076.3, 0]];
    const dmats = [new THREE.MeshStandardMaterial({ color: '#1E4E8C', roughness: 0.55, metalness: 0.4 }), new THREE.MeshStandardMaterial({ color: '#16181A', roughness: 0.6, metalness: 0.4 })];
    for (const [x, z, c] of DRUMS) { const d = new THREE.Mesh(drumGeo, dmats[c]); d.position.set(x, ground(x, z) + 0.44, z); d.rotation.y = x; d.castShadow = true; d.receiveShadow = true; g.add(d); }
    // tyres
    const tyreMat = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.95 });
    for (let k = 0; k < 4; k++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.11, 8, 18), tyreMat); t.rotation.x = PI / 2; t.position.set(-1903.2 + Math.sin(k) * 0.06, ground(-1903.2, -1078.6) + 0.11 + k * 0.21, -1078.6); t.castShadow = true; g.add(t); }
    // oil stains: dark, glossy, irregular (each its own shape from the noise)
    const stain = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, roughness: 0.25, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: -1 });
    {
      const q = uv().sub(0.5).mul(2.0), r = length(q), w = mx_noise_float(vec3(positionWorld.x.mul(1.4), positionWorld.z.mul(1.4), 0.5)).mul(0.35);
      stain.colorNode = color(0x0d0b09);
      stain.opacityNode = smoothstep(0.95, 0.35, r.add(w)).mul(0.62).mul(mx_noise_float(vec3(positionWorld.x.mul(6.0), positionWorld.z.mul(6.0), 1.7)).mul(0.25).add(0.75));
    }
    for (const [x, z, sz] of [[-1914, -1042.6, 2.6], [-1909.4, -1030.8, 2.2], [-1925, -1045.5, 1.6], [-1918.5, -1061, 2.0], [-1931.5, -1025.5, 1.4], [-1904.5, -1052, 1.8], [-1922, -1035, 1.2]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz * 0.8).rotateX(-PI / 2), stain); m.position.set(x, ground(x, z) + 0.02, z); m.rotation.y = x * 3.1; m.renderOrder = 3; m.receiveShadow = true; g.add(m);
    }
  }

  /* ---------------------------------------------------------- the stash -- */
  const STASH = { x: -1914, z: -1046.2 };
  {
    const sx = STASH.x, sz = STASH.z, y = ground(sx, sz);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.8), new THREE.MeshStandardMaterial({ color: '#D9D6CF', roughness: 0.8 })); top.position.set(sx, y + 0.76, sz); top.castShadow = true; g.add(top);
    for (const [lx, lz] of [[-0.85, -0.33], [0.85, -0.33], [-0.85, 0.33], [0.85, 0.33]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.74, 6), steel); l.position.set(sx + lx, y + 0.37, sz + lz); g.add(l); }
    const chart = canvasTex(256, 160, (x, w, h) => {
      x.fillStyle = '#05140A'; x.fillRect(0, 0, w, h); x.strokeStyle = '#B6FF3B'; x.lineWidth = 4; x.beginPath();
      [[0, 140], [40, 120], [70, 128], [110, 90], [140, 98], [180, 50], [210, 60], [256, 14]].forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke();
      x.fillStyle = '#B6FF3B'; x.font = '800 30px "Barlow Condensed", sans-serif'; x.fillText('BLIMPCO ▲ 4,200%', 10, 34);
    });
    const scr = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#FFFFFF', emissiveMap: chart, emissiveIntensity: 1.6, map: chart });
    const shell = new THREE.MeshStandardMaterial({ color: '#2B2E33', metalness: 0.6, roughness: 0.35 });
    for (const [lx, a] of [[-0.45, 0.15], [0.4, -0.2]]) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.018, 0.24), shell); base.position.set(sx + lx, y + 0.795, sz + 0.05); base.rotation.y = a; g.add(base);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.012), [shell, shell, shell, shell, scr, shell]); lid.position.set(sx + lx - Math.sin(a) * 0.12, y + 0.9, sz + 0.05 - Math.cos(a) * 0.12); lid.rotation.set(-0.25, a, 0, 'YXZ'); g.add(lid);
    }
    for (let i = 0; i < 9; i++) { const ph = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.14), shell); ph.position.set(sx - 0.1 + (i % 3) * 0.12, y + 0.79, sz - 0.25 + Math.floor(i / 3) * 0.17); ph.rotation.y = (i * 0.7) % 0.6 - 0.3; g.add(ph); }
    const merch = canvasTex(256, 128, (x, w, h) => { x.fillStyle = '#B08A5A'; x.fillRect(0, 0, w, h); x.strokeStyle = '#7A5C36'; x.lineWidth = 6; x.strokeRect(4, 4, w - 8, h - 8); x.fillStyle = '#1A1A1A'; x.font = '800 44px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.fillText('BLIMPCO MERCH', w / 2, 62); x.font = '700 26px "Barlow Condensed", sans-serif'; x.fillText('THIS SIDE UP ↑ ONLY', w / 2, 102); });
    const crate = new THREE.MeshStandardMaterial({ map: merch, roughness: 0.85 });
    for (const [cx, cz, cy] of [[1.6, 0.2, 0], [1.6, -0.55, 0], [1.6, -0.15, 1]]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.7), crate); c.position.set(sx + cx, y + 0.275 + cy * 0.55, sz + cz); c.rotation.y = cz * 0.6; c.castShadow = true; g.add(c); }
  }

  let on = false;
  const Y = {
    group: g, colliders, stash: STASH,
    // where things go: the van in at the side gate (facing west), its door on the stash; Mack's car by the gate facing out
    vanAt: [-1914, -1041, -PI / 2], mackAt: [-1910, -1032, PI / 2],
    gateIn: [-1916, -1016], // (in front of the south gate, on the apron)
    // the lookouts: at the gate (watching 12th Ave), walking the west row, at the side gate by Mack's car
    posts: [
      { at: [-1916, -1018.5], yaw: 0, sweep: 0.9, period: 7.5 },
      { path: [[-1935.5, -1035], [-1935.5, -1066]], speed: 1.15, pause: 2.2 },
      { at: [-1901.5, -1048.5], yaw: PI / 2 + 0.25, sweep: 0.8, period: 6.5 },
    ],
    show(v) {
      if (v === on) return; on = !!v; g.visible = on;
      // (the containers and the fence in the city's colliders while it stands: its cells rebuilt on the next query)
      const C = cm.colliders;
      if (on) C.push(...colliders); else for (let i = C.length - 1; i >= 0; i--) if (C[i].wagmi === 'm2') C.splice(i, 1);
      cm._colliderCells = null;
    },
    get on() { return on; },
    // (its pipelines built before it is first seen; not the light pools': they write only the scene pass's normal and
    // roughness, and compiled outside that pass (no MRT) their shader has no output at all, an invalid WGSL module.
    // They build with the scene pass the first time they are drawn)
    async warm() {
      const v = g.visible; g.visible = true;
      for (const p of pools) p.visible = false;
      try { await app.renderer.compileAsync(g, app.cameraSystem.camera, scene); } catch (e) { console.warn('[m2] warm', e); }
      for (const p of pools) p.visible = true;
      g.visible = v || on;
    },
  };
  return Y;
}

// Mack's car: the city's sedan body in gloss black, acid-green rims and underglow, his plate
export function buildMackCar(W) {
  const N = window.NYC, g = new THREE.Group(); g.name = 'wagmi-mack-car';
  const spec = N.BODY_SPECS && N.BODY_SPECS.sedan;
  const body = new THREE.Group(); g.add(body);
  if (spec && N.buildCarGeometry && N.createLoftedCarMaterial) {
    const m = new THREE.Mesh(N.buildCarGeometry(spec, true), N.createLoftedCarMaterial(spec, 0x08090b));
    m.castShadow = true; m.receiveShadow = true; body.add(m);
  } else {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.3, 4.5), new THREE.MeshStandardMaterial({ color: '#08090b', roughness: 0.3 })); m.position.y = 0.8; body.add(m);
  }
  const acid = new THREE.MeshStandardMaterial({ color: '#B6FF3B', emissive: '#7FC21A', emissiveIntensity: 1.1, roughness: 0.4, metalness: 0.3 });
  for (const sx of [-1, 1]) for (const z of [-1.38, 1.38]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.034, 8, 28), acid); r.rotation.y = PI / 2; r.position.set(sx * 0.93, 0.37, z); body.add(r); }
  const glowTex = canvasTex(64, 128, (x, w, h) => { const gr = x.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, h); });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.0), new THREE.MeshBasicMaterial({ map: glowTex, color: '#9BFF2A', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -PI / 2; glow.position.y = 0.04; glow.renderOrder = 4; g.add(glow);
  const plate = canvasTex(256, 64, (x, w, h) => { x.fillStyle = '#F2F2EC'; x.fillRect(0, 0, w, h); x.fillStyle = '#0E1A3A'; x.font = '800 44px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.fillText('MACK 1', w / 2, 48); });
  for (const z of [-2.27, 2.3]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.13), new THREE.MeshStandardMaterial({ map: plate, roughness: 0.5 })); p.position.set(0, 0.48, z); p.rotation.y = z < 0 ? PI : 0; body.add(p); }
  // smoke from under the bonnet once he has crashed: soft grey puffs rising and spreading
  const puffTex = canvasTex(64, 64, (x, w, h) => { const gr = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(200,200,200,.9)'); gr.addColorStop(1, 'rgba(200,200,200,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, h); });
  const puffMat = new THREE.SpriteMaterial({ map: puffTex, color: '#8C8F94', transparent: true, depthWrite: false, opacity: 0.6 });
  const puffs = Array.from({ length: 10 }, (_, i) => { const s = new THREE.Sprite(puffMat.clone()); s.visible = false; s.userData.t = i * 0.3; g.add(s); return s; });
  g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  g.visible = false; W.app.scene.add(g);
  let smoking = false;
  return {
    group: g, body, smoke(on) { smoking = on; for (const s of puffs) s.visible = on; },
    update(dt) {
      if (!smoking) return;
      for (const s of puffs) {
        s.userData.t = (s.userData.t + dt) % 3; const k = s.userData.t / 3;
        s.position.set(Math.sin(k * 9 + s.id) * 0.3, 1.0 + k * 3.2, 1.6 + k * 0.6); s.scale.setScalar(0.6 + k * 2.4); s.material.opacity = 0.55 * (1 - k);
      }
    },
  };
}

// Mack: a Suit (thug.glb, the fight's dressing: a grey suit, a black shirt, dark glasses) in his look: a security pass on
// a navy lanyard over the shirt (a blank white card, a navy band across its top), his clips ready for a scene (cine.js rig)
export async function buildMack(W) {
  const gltf = await loadGLB('assets/characters/thug.glb');
  const root = new THREE.Group(); root.name = 'Suit-Mack';
  const inner = skClone(gltf.scene); root.add(inner);
  if (W.combat?.dressSuit) W.combat.dressSuit(inner, 'c');
  inner.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  const bones = {}; inner.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  inner.updateMatrixWorld(true);
  const spine = bones.spine2 || bones.spine1;
  if (spine) {
    const sp = spine.getWorldPosition(new THREE.Vector3());
    const navy = new THREE.MeshStandardMaterial({ color: '#22324E', roughness: 0.8 });
    const lanyard = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.006, 4, 30), navy);
    lanyard.rotation.x = PI / 2 - 0.35; lanyard.scale.set(1, 1.25, 1); lanyard.position.set(0, sp.y + 0.12, sp.z + 0.06);
    const pass = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.084, 0.004), new THREE.MeshStandardMaterial({ color: '#E9EAEC', roughness: 0.4 }));
    pass.position.set(0, sp.y - 0.05, sp.z + 0.165); pass.rotation.x = -0.12;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.016, 0.005), navy); band.position.y = 0.032; pass.add(band);
    inner.add(lanyard, pass); spine.attach(lanyard); spine.attach(pass);
  }
  const mixer = new THREE.AnimationMixer(inner);
  // (his motion capture: the Suits' pack, assets/anim/bandai/suits.glb (CC BY-NC 4.0: NOTICE), over the rig's own clips
  // (its stumble kept): the upright stand, walk and sprint the opening and the fight use)
  const pack = await loadGLB('assets/anim/suits-dan.glb').catch(() => null); // (29 Oct: Dan's clips retargeted onto the rig, combat/index.js)
  const clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
  for (const c of pack?.animations || []) clips[c.name] = c;
  relaxArms(clips, gltf.scene); // (the arms in at his sides and the hands set as Dan's hang: combat/suitarms.js; once per clip)
  root.visible = false; W.app.scene.add(root);
  return { root, inner, bones, mixer, rig: rig(mixer, clips), clips: Object.keys(clips) };
}

// GTA's target marker: a chevron of light pointing down over a vehicle to follow, turning and bobbing
export function buildChevron(W, color = '#EF4444') {
  const g = new THREE.Group(); g.name = 'wagmi-chevron';
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
  const c = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.75, 4), mat); c.rotation.x = PI; g.add(c);
  const edge = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.86, 4), new THREE.MeshBasicMaterial({ color: '#0A0C10', transparent: true, opacity: 0.55, side: THREE.BackSide, depthWrite: false })); edge.rotation.x = PI; g.add(edge);
  g.traverse((o) => { if (o.isMesh) { o.renderOrder = 6; o.frustumCulled = false; } });
  g.visible = false; W.app.scene.add(g);
  let t = 0;
  return {
    group: g,
    at(x, y, z, dt = 0.016) { t += dt; g.visible = true; g.position.set(x, y + 0.18 * Math.sin(t * 3), z); g.rotation.y = t * 1.6; },
    hide() { g.visible = false; },
  };
}
