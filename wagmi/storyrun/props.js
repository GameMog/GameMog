// Mog City story runner: a story's own props, modelled here in code (no files to fetch, nothing licensed): Mandi's
// Revenge's rubber race duck (its number 7 on its back), the Derby's duffel shut and open (open, full of ducks), a car
// wash's sponge and bucket (suds in it), a leather jacket (draped, or folded on a seat), soap suds, and a stretch limo
// (a story car of the city's own made longer at its waist: stretchCar). One look for all of a kind: every duck in the
// game draws from one geometry and one material (a 256 x 128 texture: its colours and its decal).
//   makeProp(THREE, kind, o) -> THREE.Group      PROP_KINDS: what a pack's `prop` step may name
//   duckGeometry(THREE, { lod }) -> BufferGeometry (one draw: body, head, beak, eyes, wings, the decal)
//   stretchCar(THREE, obj, metres) -> obj (its meshes' vertices past the middle moved out; wheels moved whole)
// A duck is about 0.2 m long (the Derby's: race ducks, bigger than a bath duck, so they read on a river).
// The flotilla (980 ducks on the water) is flotilla.js; this file only knows how one looks.
export const PROP_KINDS = ['duck', 'duffel', 'duffel-open', 'sponge', 'bucket', 'jacket', 'jacket-folded', 'suds', 'slip'];
// (a prop's look, the words a pack may use for it: the kinds above, and these other names for them)
export const PROP_ALIAS = { 'rubber-duck': 'duck', duffle: 'duffel', 'duffle-open': 'duffel-open', bag: 'duffel', 'bag-open': 'duffel-open', 'car-sponge': 'sponge', pail: 'bucket', 'leather-jacket': 'jacket', foam: 'suds', 'betting-slip': 'slip' };
export const propKind = (k) => { const s = String(k || '').toLowerCase().trim(); const a = PROP_ALIAS[s] || s; return PROP_KINDS.includes(a) ? a : null; };
// (each kind's size, m: its longest side; a pack's scale multiplies it)
export const PROP_SIZE = { duck: 0.2, duffel: 1.05, 'duffel-open': 1.05, sponge: 0.2, bucket: 0.34, jacket: 0.62, 'jacket-folded': 0.55, suds: 0.5, slip: 0.18 };

// ---------------------------------------------------------------------------------------------------- the atlas --
// one canvas: four colour swatches across its top half (duck yellow, beak orange, eye black, a warm white), and the
// decal across its bottom left (a white disc, the number in black on it, on the duck's yellow). u 0..1 left to right,
// v 0..1 bottom to top (three.js's flipY)
const SW = { yellow: [0.0625, 0.75], orange: [0.1875, 0.75], black: [0.3125, 0.75], white: [0.4375, 0.75], wing: [0.5625, 0.75] };
const DUCK_YELLOW = '#FFC814', BEAK = '#FF7A12', EYE = '#101010', WHITE = '#F7F3EA', WING = '#F2B70C';
const atlases = new Map();
function duckAtlas(THREE, number = '7') {
  const key = String(number);
  if (atlases.has(key)) return atlases.get(key);
  let tex = null;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = DUCK_YELLOW; g.fillRect(0, 0, 256, 128);
    [[DUCK_YELLOW, 0], [BEAK, 32], [EYE, 64], [WHITE, 96], [WING, 128]].forEach(([col, x]) => { g.fillStyle = col; g.fillRect(x, 0, 32, 64); });
    // (the decal: 128 x 64 at the bottom left; a disc with the number, read from above, the duck's head at the top)
    g.fillStyle = DUCK_YELLOW; g.fillRect(0, 64, 128, 64);
    g.fillStyle = WHITE; g.beginPath(); g.ellipse(64, 96, 50, 30, 0, 0, Math.PI * 2); g.fill();
    g.lineWidth = 3; g.strokeStyle = '#141414'; g.stroke();
    g.fillStyle = '#141414'; g.font = '900 54px "Barlow Condensed", "Arial Black", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save(); g.translate(64, 99); g.scale(1.25, 0.9); g.fillText(key, 0, 0); g.restore();
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  }
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex, roughness: 0.32, metalness: 0 });
  mat.name = 'prop-duck';
  atlases.set(key, mat);
  return mat;
}

// --------------------------------------------------------------------------------------------- geometry helpers --
// an ellipsoid (radii rx, ry, rz at c), w x h segments, every vertex's uv the one swatch (or a function of its place);
// warp(x, y, z) -> [x, y, z] bends it after
function ellipsoid(c, r, w, h, uv, warp = null) {
  const pos = [], nor = [], uvs = [], idx = [];
  for (let j = 0; j <= h; j++) {
    const v = j / h, ph = v * Math.PI;
    for (let i = 0; i <= w; i++) {
      const u = i / w, th = u * Math.PI * 2;
      const nx = Math.sin(ph) * Math.sin(th), ny = Math.cos(ph), nz = Math.sin(ph) * Math.cos(th);
      let p = [c[0] + nx * r[0], c[1] + ny * r[1], c[2] + nz * r[2]];
      if (warp) p = warp(p[0], p[1], p[2]);
      pos.push(p[0], p[1], p[2]);
      const nn = [nx / r[0], ny / r[1], nz / r[2]], l = Math.hypot(nn[0], nn[1], nn[2]) || 1;
      nor.push(nn[0] / l, nn[1] / l, nn[2] / l);
      const t = typeof uv === 'function' ? uv(nx, ny, nz, p) : uv; uvs.push(t[0], t[1]);
    }
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const a = j * (w + 1) + i, b = a + w + 1;
    if (j > 0) idx.push(a, b, a + 1);
    if (j < h - 1) idx.push(a + 1, b, b + 1);
  }
  return { pos, nor, uvs, idx };
}
function merge(THREE, parts) {
  const pos = [], nor = [], uvs = [], idx = [];
  for (const p of parts) {
    const o = pos.length / 3;
    pos.push(...p.pos); nor.push(...p.nor); uvs.push(...p.uvs);
    for (const i of p.idx) idx.push(i + o);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
// a three.js geometry's arrays, to merge it with the others (indexed or not)
function partOf(geo, uv = null, m = null) {
  const g = geo.index ? geo : geo;
  if (m) g.applyMatrix4(m);
  const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
  const pos = Array.from(P.array), nor = N ? Array.from(N.array) : new Array(P.count * 3).fill(0), uvs = [];
  for (let i = 0; i < P.count; i++) { if (uv) uvs.push(uv[0], uv[1]); else uvs.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0); }
  const idx = g.index ? Array.from(g.index.array) : Array.from({ length: P.count }, (_, i) => i);
  return { pos, nor, uvs, idx };
}

// ------------------------------------------------------------------------------------------------------- the duck --
// unit duck, 1 long (z ahead), built round its base at y 0; lod 0 about 2,000 triangles (a close-up's, the duffel's
// top), lod 1 about 620 (the flotilla's), lod 2 about 330 (the flotilla's on a phone). Scaled to PROP_SIZE.duck by the caller
const duckGeos = new Map();
export function duckGeometry(THREE, { lod = 0 } = {}) {
  if (duckGeos.has(lod)) return duckGeos.get(lod);
  const q = lod === 0 ? 1 : lod === 1 ? 0.42 : 0.3, S = (n) => Math.max(lod === 2 ? 4 : 5, Math.round(n * q));
  const flat = 0.07; // (it floats: the underside is flat)
  const body = ellipsoid([0, 0.3, -0.02], [0.4, 0.27, 0.5], S(26), S(16), SW.yellow, (x, y, z) => {
    // (the tail up and pointed at the back, the breast full at the front, the base flat)
    if (z < -0.18 && y > 0.25) { const k = (-z - 0.18) / 0.34; y += k * k * 0.22; x *= 1 - k * 0.45; }
    return [x, Math.max(flat, y), z];
  });
  const head = ellipsoid([0, 0.68, 0.27], [0.215, 0.21, 0.22], S(18), S(12), SW.yellow);
  // (the cheeks a touch fuller, the beak flat and wide, a little upturned)
  const beak = ellipsoid([0, 0.62, 0.5], [0.12, 0.05, 0.13], S(12), S(6), SW.orange, (x, y, z) => [x, y + Math.max(0, z - 0.5) * 0.25, z]);
  const eyes = [-1, 1].map((s) => ellipsoid([s * 0.125, 0.74, 0.43], [0.04, 0.05, 0.035], S(8), S(6), SW.black));
  const shines = [-1, 1].map((s) => ellipsoid([s * 0.14, 0.76, 0.455], [0.012, 0.014, 0.01], 6, 4, SW.white));
  const wings = [-1, 1].map((s) => ellipsoid([s * 0.35, 0.33, -0.15], [0.07, 0.13, 0.22], S(10), S(6), SW.wing, (x, y, z) => [x, y + Math.max(0, -z - 0.05) * 0.4, z]));
  // the decal: its number on a white disc, on its back (read from above, the head at the top of it) and on each side of
  // its breast (read from the side, upright): patches of the body's own surface lifted 5 mm, their uvs the decal's
  // (u 0..0.5, v 0..0.5), laid so the number reads the right way round from where it is seen
  const bodyY = (x, z) => { const r2 = 1 - (x / 0.4) ** 2 - ((z + 0.02) / 0.5) ** 2; let y = 0.3 + 0.27 * Math.sqrt(Math.max(0.0001, r2)); if (z < -0.18 && y > 0.25) { const k = (-z - 0.18) / 0.34; y += k * k * 0.22; } return y; };
  const bodyX = (y, z) => 0.4 * Math.sqrt(Math.max(0.0001, 1 - ((y - 0.3) / 0.27) ** 2 - ((z + 0.02) / 0.5) ** 2));
  const decals = [];
  const patch = (at, nx0, ny0) => {
    const D = { pos: [], nor: [], uvs: [], idx: [] }, DW = Math.max(3, S(8)), DH = Math.max(3, S(6));
    for (let j = 0; j <= DH; j++) for (let i = 0; i <= DW; i++) {
      const u = i / DW, v = j / DH, [x, y, z] = at(u, v);
      const nx = x / 0.16, ny = (y - 0.3) / 0.0729, nz = (z + 0.02) / 0.25, l = Math.hypot(nx, ny, nz) || 1;
      D.pos.push(x + (nx / l) * 0.005, y + (ny / l) * 0.005, z + (nz / l) * 0.005); D.nor.push(nx / l, ny / l, nz / l); D.uvs.push(u * 0.5, v * 0.5);
    }
    // (wound to face out, whichever way its uvs run: the first quad's face against the surface's normal there)
    const P3 = (k) => [D.pos[k * 3], D.pos[k * 3 + 1], D.pos[k * 3 + 2]], a0 = P3(0), b0 = P3(DW + 1), c0 = P3(1);
    const e1 = [b0[0] - a0[0], b0[1] - a0[1], b0[2] - a0[2]], e2 = [c0[0] - a0[0], c0[1] - a0[1], c0[2] - a0[2]];
    const fx = e1[1] * e2[2] - e1[2] * e2[1], fy = e1[2] * e2[0] - e1[0] * e2[2], fz = e1[0] * e2[1] - e1[1] * e2[0], out = fx * D.nor[0] + fy * D.nor[1] + fz * D.nor[2] > 0;
    for (let j = 0; j < DH; j++) for (let i = 0; i < DW; i++) { const a = j * (DW + 1) + i, b = a + DW + 1; if (out) D.idx.push(a, b, a + 1, a + 1, b, b + 1); else D.idx.push(a, a + 1, b, a + 1, b + 1, b); }
    decals.push(D);
  };
  // (the back: u across to the duck's left (-x) as seen from above with the head up the frame; v toward the head)
  patch((u, v) => { const x = (0.5 - u) * 0.5, z = -0.27 + v * 0.44; return [x, bodyY(x, z), z]; });
  // (each side of the breast, upright: v up; u toward the tail on its right side, toward the head on its left)
  for (const s of [1, -1]) patch((u, v) => { const z = s > 0 ? 0.37 - u * 0.3 : 0.07 + u * 0.3, y = 0.19 + v * 0.25; return [s * bodyX(y, z), y, z]; });
  const g = merge(THREE, [body, head, beak, ...eyes, ...shines, ...wings, ...decals]);
  g.name = `duck-lod${lod}`;
  duckGeos.set(lod, g);
  return g;
}
export const duckMaterial = (THREE, number = '7') => duckAtlas(THREE, number);
export const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

// ----------------------------------------------------------------------------------------------- the other props --
const std = (THREE, color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.7, metalness: o.m ?? 0, ...(o.emissive ? { emissive: o.emissive, emissiveIntensity: o.ei ?? 1 } : {}), ...(o.side ? { side: o.side } : {}) });
// a rounded slab, w x h x d, its edges rounded by r (a box's vertices pulled onto a rounded box): sponges, the duffel's ends
function roundedBox(THREE, w, h, d, r, seg = 4) {
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2), p = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    const n = v.clone().sub(c); if (n.lengthSq() > 1e-9) v.copy(c).add(n.normalize().multiplyScalar(r));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
// the duffel: a long canvas bag, its section a rounded square (a capsule squashed), zip along its top, two carry
// handles, a strap, its ends in a darker trim; the Derby's yellow piping. Open: its top split along the zip, the two
// halves of the lid lying back, and the bag full of ducks to the brim (an instanced heap of the close-up duck)
function duffel(THREE, open) {
  const g = new THREE.Group(), L = 1.0, R = 0.21;
  const canvas = std(THREE, '#22324A', { r: 0.85 }), trim = std(THREE, '#121820', { r: 0.6 }), endM = std(THREE, '#1A2638', { r: 0.8 }), pipe = std(THREE, '#F2C200', { r: 0.55 }), metal = std(THREE, '#B9BCC2', { r: 0.35, m: 0.8 });
  canvas.name = 'prop-duffel'; canvas.side = open ? THREE.DoubleSide : THREE.FrontSide;
  // (the body: a lathe of the section along its length is not needed: a cylinder squashed into a rounded square)
  // (open: the top split along the zip, GAP rad either side of straight up; a cylinder's angle th is at local
  // (sin th, cos th), local +x up once it is turned onto its side)
  const GAP = Math.PI * 0.27, seg = 32, bodyG = new THREE.CylinderGeometry(R, R, L, seg, 6, true, open ? Math.PI / 2 + GAP : 0, open ? Math.PI * 2 - 2 * GAP : Math.PI * 2);
  { const p = bodyG.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + 0.12 * Math.pow(Math.abs(Math.sin(2 * a)), 2); p.setX(i, x * k * 1.05); p.setZ(i, z * k * 0.95); } bodyG.computeVertexNormals(); }
  const body = new THREE.Mesh(bodyG, canvas); body.rotation.z = Math.PI / 2; body.position.y = R * 0.95; g.add(body);
  // (a soft sag: the bag sits on its base, a little flattened)
  body.scale.set(1, 1, 0.92);
  // (a point of the tube's wall at angle th, r times its radius, in the bag's frame: the same squash as its wall)
  const wall = (th, r = 1) => { const x = Math.sin(th) * R * r, z = Math.cos(th) * R * r, a = Math.atan2(z, x), k = 1 + 0.12 * Math.pow(Math.abs(Math.sin(2 * a)), 2); return [x * k * 1.05 + R * 0.95, z * k * 0.95 * 0.92]; };
  for (const s of [-1, 1]) {
    // (its ends domed, a darker panel each, piped in the Derby's yellow)
    const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.04, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), endM); cap.position.set(s * L / 2, R * 0.95, 0); cap.rotation.z = -s * Math.PI / 2; cap.scale.set(1, 0.22, 0.98); g.add(cap);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 1.06, 0.012, 6, 32), pipe); ring.position.copy(cap.position); ring.rotation.y = Math.PI / 2; ring.scale.set(0.98, 0.95, 1); g.add(ring);
    // (the carry handles over the top, and the strap rings at the ends)
    // (the carry handles: up over the zip when it is shut; fallen to each side with the lid when it is open)
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.014, 6, 16, Math.PI), trim);
    if (!open) h.position.set(s * 0.16, R * 1.9, 0);
    else { h.position.set(0, R * 1.45, s * R * 1.05); h.rotation.x = s * 1.1; }
    g.add(h);
  }
  if (!open) {
    const zip = new THREE.Mesh(new THREE.BoxGeometry(L * 0.86, 0.012, 0.03), metal); zip.position.set(0, R * 1.93, 0); g.add(zip);
    const pull = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.01, 0.05), metal); pull.position.set(L * 0.38, R * 1.95, 0.03); g.add(pull);
    const band = new THREE.Mesh(new THREE.BoxGeometry(L * 0.9, 0.022, 0.006), pipe); band.position.set(0, R * 1.0, R * 0.98); g.add(band);
    const band2 = band.clone(); band2.position.z = -R * 0.98; g.add(band2);
  } else {
    // the opening: along each edge the zip's tape and its teeth (a row of small metal blocks), and the top's two
    // halves lying back off it over the bag's sides, the zip's pull hanging at one end
    const tape = std(THREE, '#0E1218', { r: 0.7 }), toothG = new THREE.BoxGeometry(0.006, 0.007, 0.011);
    const teeth = new THREE.InstancedMesh(toothG, metal, 2 * 104); let tn = 0; const tm = new THREE.Matrix4();
    for (const s of [-1, 1]) {
      const th = Math.PI / 2 - s * GAP, [y, z] = wall(th, 1.0);
      const tp = new THREE.Mesh(new THREE.BoxGeometry(L * 0.9, 0.006, 0.026), tape); tp.position.set(0, y, z); tp.rotation.x = s * 0.5; g.add(tp);
      for (let k = 0; k < 104; k++) { tm.makeTranslation(-L * 0.44 + (k / 103) * L * 0.88, y + 0.005, z - s * 0.012); teeth.setMatrixAt(tn++, tm); }
      // (the lid's half: a strip of the canvas from the edge back down over the side, just off the wall, its own
      // piping on its far edge)
      const lid = new THREE.CylinderGeometry(R * 1.04, R * 1.04, L * 0.9, 12, 1, true, 0, Math.PI * 0.42);
      const lidM = new THREE.Mesh(lid, canvas); lidM.rotation.z = Math.PI / 2; lidM.position.y = R * 0.95; lidM.scale.set(1, 1, 0.94);
      // (its angle: from the opening's edge outward and down (th to th -/+ 0.42 pi))
      const lg = lidM.geometry, lp = lg.attributes.position;
      for (let i = 0; i < lp.count; i++) {
        const a0 = Math.atan2(lp.getX(i), lp.getZ(i)), ang = s > 0 ? th - a0 : th + a0, rr = R * 1.05 * (1 + 0.03 * Math.sin(a0 * 6 + lp.getY(i) * 9));
        const x = Math.sin(ang) * rr, z = Math.cos(ang) * rr, aa = Math.atan2(z, x), k = 1 + 0.12 * Math.pow(Math.abs(Math.sin(2 * aa)), 2);
        lp.setX(i, x * k * 1.05); lp.setZ(i, z * k * 0.95 * (0.92 / 0.94));
      }
      lg.computeVertexNormals(); g.add(lidM);
      const pipeL = new THREE.Mesh(new THREE.BoxGeometry(L * 0.9, 0.012, 0.012), pipe), far = s > 0 ? th - Math.PI * 0.42 : th + Math.PI * 0.42, [py, pz] = wall(far, 1.07);
      pipeL.position.set(0, py, pz * 1.02); g.add(pipeL);
    }
    teeth.count = tn; teeth.instanceMatrix.needsUpdate = true; g.add(teeth);
    { const [y, z] = wall(Math.PI / 2 - GAP, 1.0); const pull = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.05, 0.026), metal); pull.position.set(L * 0.44, y - 0.03, z + 0.02); pull.rotation.x = 0.4; g.add(pull); }
    // the ducks: heaped in the bag and up out of its opening, every one inside the wall (its middle at least a duck's
    // half-size in from it) and inside its ends; the top layer the close-up duck, the ones under it the flotilla's
    const dm = duckMaterial(THREE), n = 70, TOP = 46, under = new THREE.InstancedMesh(duckGeometry(THREE, { lod: 1 }), dm, TOP), top = new THREE.InstancedMesh(duckGeometry(THREE, { lod: 0 }), dm, n - TOP);
    under.name = 'prop-duffel-ducks'; top.name = 'prop-duffel-ducks-top';
    const heap = { setMatrixAt: (i, mm) => (i < TOP ? under.setMatrixAt(i, mm) : top.setMatrixAt(i - TOP, mm)) };
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const cy = R * 0.95, half = PROP_SIZE.duck * 0.42, inner = R * 0.92 - half, open = Math.sin(GAP) * R * 0.95 - half * 0.6;
    for (let i = 0; i < n; i++) {
      let x = 0, y = 0, z = 0;
      for (let k = 0; k < 40; k++) {
        x = (rnd() - 0.5) * (L - 0.22);
        if (i < TOP) { const r = Math.sqrt(rnd()) * inner, a = rnd() * Math.PI * 2; y = cy + Math.sin(a) * r * 0.9; z = Math.cos(a) * r * 0.85; if (y > cy - inner * 0.9) break; }
        // (the top layer: in the opening's width, from the bag's middle up to a heap proud of its lips)
        else { z = (rnd() - 0.5) * 2 * open; y = cy + R * 0.35 + rnd() * R * 0.55; if (Math.abs(z) < open) break; }
      }
      e.set((rnd() - 0.5) * (i < TOP ? 2.4 : 0.8), rnd() * Math.PI * 2, (rnd() - 0.5) * (i < TOP ? 2.4 : 0.8));
      const s = PROP_SIZE.duck * (0.92 + rnd() * 0.12);
      m.compose(p.set(x, y - half * 0.7, z), q.setFromEuler(e), sc.set(s, s, s)); heap.setMatrixAt(i, m);
    }
    for (const im of [under, top]) { im.instanceMatrix.needsUpdate = true; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; g.add(im); }
  }
  // (the shoulder strap lying beside it)
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.012, 4, 40, Math.PI * 0.9), trim); strap.rotation.x = -Math.PI / 2; strap.position.set(0, 0.012, R * 1.25); strap.scale.set(1.1, 0.5, 1); g.add(strap);
  return g;
}
// a car wash's sponge: a fat yellow rounded slab, its pores a texture of dark dots, wet (glossier) on top
let spongeTex = null;
function sponge(THREE) {
  if (!spongeTex && typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#F4C531'; g.fillRect(0, 0, 128, 128);
    let s = 11; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 420; i++) { g.fillStyle = `rgba(120,80,0,${0.25 + r() * 0.35})`; g.beginPath(); g.arc(r() * 128, r() * 128, 0.8 + r() * 2.2, 0, Math.PI * 2); g.fill(); }
    spongeTex = new THREE.CanvasTexture(c); spongeTex.colorSpace = THREE.SRGBColorSpace; spongeTex.wrapS = spongeTex.wrapT = THREE.RepeatWrapping;
  }
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: '#ffffff', map: spongeTex, roughness: 0.62 }); m.name = 'prop-sponge';
  const s = new THREE.Mesh(roundedBox(THREE, 0.2, 0.075, 0.12, 0.028, 3), m); s.position.y = 0.0375; s.castShadow = s.receiveShadow = true; g.add(s);
  // (a few soap bubbles clinging on top)
  const foam = std(THREE, '#FFFFFF', { r: 0.25 });
  for (const [x, z, r] of [[0.04, 0.02, 0.018], [0.06, -0.01, 0.012], [-0.05, 0.03, 0.014], [0.01, -0.03, 0.01]]) { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), foam); b.position.set(x, 0.075, z); b.scale.y = 0.6; g.add(b); }
  return g;
}
// a red plastic bucket: tapered, its rim rolled, a wire handle, soapy water in it and suds over the top
function bucket(THREE) {
  const g = new THREE.Group(), red = std(THREE, '#C8202B', { r: 0.45 }); red.name = 'prop-bucket'; red.side = THREE.DoubleSide;
  const prof = [[0.0, 0.0], [0.125, 0.0], [0.128, 0.004], [0.15, 0.29], [0.162, 0.3], [0.16, 0.312], [0.145, 0.3], [0.123, 0.01], [0.0, 0.01]].map(([x, y]) => new THREE.Vector2(x, y));
  const b = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), red); b.castShadow = b.receiveShadow = true; g.add(b);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.14, 28), std(THREE, '#7E8C86', { r: 0.08, m: 0.1 })); water.rotation.x = -Math.PI / 2; water.position.y = 0.24; g.add(water);
  const foam = std(THREE, '#FBFBF8', { r: 0.3 });
  let s = 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 22; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.13, rr = 0.018 + r() * 0.03; const f = new THREE.Mesh(new THREE.SphereGeometry(rr, 8, 6), foam); f.position.set(Math.cos(a) * d, 0.245 + r() * 0.04, Math.sin(a) * d); f.scale.y = 0.55; g.add(f); }
  const wire = std(THREE, '#9A9DA3', { r: 0.4, m: 0.8 });
  const h = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.005, 5, 24, Math.PI), wire); h.position.y = 0.3; h.rotation.y = 0.35; h.rotation.x = -0.5; g.add(h);
  return g;
}
// soap suds: a cluster of foam (on a car's side, a kerb), about 0.5 m across
function suds(THREE) {
  const g = new THREE.Group(), foam = std(THREE, '#FFFFFF', { r: 0.3 }); foam.name = 'prop-suds';
  let s = 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 22; i++) { const rr = 0.015 + r() * 0.035, f = new THREE.Mesh(new THREE.SphereGeometry(rr, 8, 6), foam); f.position.set((r() - 0.5) * 0.4, rr * 0.4 + r() * 0.02, (r() - 0.5) * 0.26); f.scale.y = 0.5; g.add(f); }
  return g;
}
// a leather jacket: modelled as clothing is cut, from its pattern. Its outline laid flat (the body, its two sleeves
// out and down from the shoulders, the neck) is a fine grid of the cloth, two faces 2.4 cm apart with its edges closed,
// its outline smoothed onto the pattern's line; on it the details that make it a jacket: the collar and its lapels
// turned down, the zip up its middle with its teeth and its pull, two slanted zip pockets, the knit cuffs and hem band,
// the shoulder and yoke seams. Then it is put somewhere as cloth is: draped (folded over a forearm or a hook, the
// front hanging one side, the back the other, the sleeves down, a little sway in the hang) or folded (laid on a seat:
// its sleeves across its chest, its lower half folded up under) or hung (by its collar, from a hand or a hook, as on a
// hanger: its body round an unseen chest, its sleeves down its sides). Its leather is a texture of grain and creases.
const JK = { len: 0.68, hem: 0.235, chest: 0.25, arm: 0.43, sh: 0.24, shY: 0.615, neck: 0.085, top: 0.675, cuffIn: [0.43, -0.03], cuffOut: [0.545, 0.03] };
function jacketOutline() {
  const R = [[0, 0], [JK.hem, 0], [JK.chest, JK.arm], [JK.cuffIn[0], JK.cuffIn[1]], [JK.cuffOut[0], JK.cuffOut[1]], [JK.sh, JK.shY], [JK.neck, JK.top], [0, JK.top - 0.05]];
  const L = R.slice(1, -1).reverse().map(([x, y]) => [-x, y]);
  return [...R, ...L];
}
const inPoly = (P, x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
function nearestOn(P, x, y) {
  let best = null, bd = 1e9;
  for (let i = 0; i < P.length; i++) {
    const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)), px = ax + dx * t, py = ay + dy * t, d = (px - x) ** 2 + (py - y) ** 2;
    if (d < bd) { bd = d; best = [px, py]; }
  }
  return best;
}
// the cloth: a grid of cells inside the outline, front (z +T) and back (z -T) faces, its rim closed; vertices off the
// outline moved onto it. -> { pos: [x, y, z...], idx }
function clothOf(P, cell = 0.012, T = 0.012) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [x, y] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const nx = Math.ceil((x1 - x0) / cell), ny = Math.ceil((y1 - y0) / cell), inside = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const X = x0 + i * cell, Y = y0 + j * cell; inside[j * nx + i] = inPoly(P, X + cell / 2, Y + cell / 2) || inPoly(P, X, Y) || inPoly(P, X + cell, Y) || inPoly(P, X, Y + cell) || inPoly(P, X + cell, Y + cell) ? 1 : 0; }
  const vid = new Map(), pos = [], idx = [];
  const V = (i, j, side) => {
    const k = (j * (nx + 1) + i) * 2 + side; if (vid.has(k)) return vid.get(k);
    let x = x0 + i * cell, y = y0 + j * cell;
    if (!inPoly(P, x, y)) [x, y] = nearestOn(P, x, y);
    const id = pos.length / 3; pos.push(x, y, side ? -T : T); vid.set(k, id); return id;
  };
  const on = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && inside[j * nx + i];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!on(i, j)) continue;
    const a = V(i, j, 0), b = V(i + 1, j, 0), c = V(i + 1, j + 1, 0), d = V(i, j + 1, 0); idx.push(a, b, c, a, c, d);
    const a2 = V(i, j, 1), b2 = V(i + 1, j, 1), c2 = V(i + 1, j + 1, 1), d2 = V(i, j + 1, 1); idx.push(a2, c2, b2, a2, d2, c2);
    // (its rim: a wall where the next cell is out)
    if (!on(i, j - 1)) idx.push(a, a2, b2, a, b2, b);
    if (!on(i + 1, j)) idx.push(b, b2, c2, b, c2, c);
    if (!on(i, j + 1)) idx.push(c, c2, d2, c, d2, d);
    if (!on(i - 1, j)) idx.push(d, d2, a2, d, a2, a);
  }
  return { pos, idx };
}
// a strip on the jacket's face (a seam, the zip's tape, a cuff band): a quad along a line, `w` wide, `z` out from the
// cloth's front, `n` steps along it (so it bends with the cloth)
function strip(out, a, b, w, z, n = 12) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * (w / 2), ny = (dx / l) * (w / 2), o = out.pos.length / 3;
  for (let k = 0; k <= n; k++) { const t = k / n, x = a[0] + dx * t, y = a[1] + dy * t; out.pos.push(x - nx, y - ny, z, x + nx, y + ny, z); }
  for (let k = 0; k < n; k++) { const p = o + k * 2; out.idx.push(p, p + 1, p + 3, p, p + 3, p + 2); }
}
let leatherTex = null;
function leatherMap(THREE) {
  if (leatherTex || typeof document === 'undefined') return leatherTex;
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#3B2519'; g.fillRect(0, 0, 256, 256);
  let s = 19; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // (grain: a few thousand pores, lighter and darker; creases: soft long strokes)
  for (let i = 0; i < 5000; i++) { g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${0.08 + r() * 0.12})` : `rgba(120,80,55,${0.05 + r() * 0.08})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 1.5, 1 + r() * 1.5); }
  for (let i = 0; i < 26; i++) { g.strokeStyle = `rgba(${r() < 0.5 ? '0,0,0' : '150,105,75'},${0.08 + r() * 0.1})`; g.lineWidth = 1 + r() * 2.5; g.beginPath(); const x = r() * 256, y = r() * 256; g.moveTo(x, y); g.bezierCurveTo(x + r() * 60 - 30, y + r() * 30, x + r() * 80 - 40, y + r() * 50, x + r() * 100 - 50, y + r() * 70); g.stroke(); }
  leatherTex = new THREE.CanvasTexture(c); leatherTex.colorSpace = THREE.SRGBColorSpace; leatherTex.wrapS = leatherTex.wrapT = THREE.RepeatWrapping; leatherTex.repeat.set(2, 2);
  return leatherTex;
}
// where a point of the flat jacket goes when it is put somewhere: drape (over a bar FOLD m below its collar, the front
// hanging toward +z, the back to -z), fold (laid flat: the sleeves turned in across the chest, the lower half folded up
// under it), or as laid
function placeJacket(how, x, y, z) {
  if (how === 'fold') {
    // (a sleeve past the body's side turned in across it at the shoulder's height, on top)
    const side = Math.sign(x) || 1, ax = Math.abs(x);
    if (ax > JK.chest - 0.005 && y < JK.shY) { const out = ax - (JK.chest - 0.005); x = side * (JK.chest - 0.005 - out * 0.95); y = JK.arm - 0.02 + (y - JK.arm) * 0.55; z = z + 0.03 + out * 0.02; }
    // (below the waist folded up under: a flat lie on the seat, the jacket's front up)
    if (y < 0.3) { y = 0.6 - y; z = -0.026 - z; }
    // (laid flat: its front up, y along the seat)
    return [x, 0.065 + z + 0.004 * Math.sin(x * 20) * Math.sin(y * 17), 0.49 - y];
  }
  if (how === 'drape') {
    // (hung by its collar from a hand or a hook, as on a hanger: the body wrapped round an unseen chest, a tube of
    // radius TR, its front panels meeting at the zip; the sleeves down its sides, round, a little out at the cuffs)
    const TR = 0.165, side = Math.sign(x) || 1, ax = Math.abs(x);
    if (ax <= JK.chest + 0.004 || y > JK.shY - 0.02) {
      const a = Math.max(-1.62, Math.min(1.62, x / (JK.chest / 1.55)));
      // (over the shoulders the cloth turns in to the collar: its top band rolled over, the tube narrowing and flattening)
      const y1 = JK.arm + 0.08, k = y > y1 ? Math.min(1, (y - y1) / (JK.top - y1)) : 0;
      const r = (TR + z + 0.01 * Math.max(0, 0.3 - y)) * (1 - 0.55 * k * k), yy = y > y1 ? y1 + (y - y1) * (1 - 0.6 * k) : y;
      return [Math.sin(a) * r * 1.12, yy - JK.top, Math.cos(a) * r];
    }
    // (a sleeve: along its axis from the shoulder down, round in its section)
    const S0 = [JK.chest - 0.01, JK.shY - 0.07], C0 = [(JK.cuffIn[0] + JK.cuffOut[0]) / 2, (JK.cuffIn[1] + JK.cuffOut[1]) / 2];
    const ux = C0[0] - S0[0], uy = C0[1] - S0[1], ul = Math.hypot(ux, uy), u = ((ax - S0[0]) * ux + (y - S0[1]) * uy) / ul, v = ((ax - S0[0]) * -uy + (y - S0[1]) * ux) / ul;
    const rs = 0.052, ang = Math.max(-1.75, Math.min(1.75, (v / 0.06) * (Math.PI / 2))), out = Math.min(1, Math.max(0, u / ul));
    const cx = side * (TR * 1.12 + rs + 0.005 + out * 0.035), cy = S0[1] - JK.top - 0.03 - u * 0.97;
    return [cx + side * Math.sin(ang) * (rs + z * 0.5), cy, Math.cos(ang) * (rs + z * 0.5) - 0.01];
  }
  return [x, y, z];
}
function jacket(THREE, folded) {
  const how = folded ? 'fold' : 'drape';
  const P = jacketOutline(), cloth = clothOf(P);
  // (its details on the front face: z just over the cloth's)
  const det = { pos: [], idx: [] }, metal = { pos: [], idx: [] }, knit = { pos: [], idx: [] }, lining = { pos: [], idx: [] };
  const F = 0.0125;
  // the collar: turned down over the shoulders, its points to the chest; the lapels below it, folded open
  const collar = [[0.0, JK.top - 0.05], [JK.neck + 0.005, JK.top + 0.004], [0.2, JK.shY - 0.005], [0.17, JK.shY - 0.07], [0.06, 0.5], [0.02, 0.58]];
  const coll = clothOf([...collar, ...collar.slice(1).reverse().map(([x, y]) => [-x, y])], 0.01, 0.004);
  for (let i = 2; i < coll.pos.length; i += 3) coll.pos[i] += F + 0.006;
  // (the lining's red where the lapels open, in the V under the collar)
  strip(lining, [-0.018, 0.5], [-0.018, 0.6], 0.02, F + 0.002, 4); strip(lining, [0.018, 0.5], [0.018, 0.6], 0.02, F + 0.002, 4);
  // the zip: its tape, its teeth (a fine row of blocks), its pull at the chest
  strip(det, [0.0, 0.03], [0.0, 0.5], 0.022, F + 0.001, 30);
  for (let y = 0.035; y < 0.5; y += 0.009) strip(metal, [-0.004, y], [0.004, y], 0.005, F + 0.003, 1);
  strip(metal, [0.006, 0.4], [0.006, 0.36], 0.012, F + 0.006, 2);
  // two slanted zip pockets, the shoulder and yoke seams
  for (const s of [-1, 1]) {
    strip(metal, [s * 0.07, 0.17], [s * 0.15, 0.28], 0.006, F + 0.002, 8);
    strip(det, [s * JK.sh, JK.shY], [s * (JK.chest + 0.005), JK.arm - 0.01], 0.006, F + 0.001, 10);
    strip(det, [s * 0.04, 0.48], [s * 0.22, 0.52], 0.005, F + 0.001, 10);
  }
  // the knit cuffs and the hem band
  const cuffA = JK.cuffIn, cuffB = JK.cuffOut;
  for (const s of [-1, 1]) { const ux = (cuffB[1] - cuffA[1]), uy = -(cuffB[0] - cuffA[0]), ul = Math.hypot(ux, uy); for (let k = 0; k < 3; k++) { const o = 0.012 + k * 0.016; strip(knit, [s * (cuffA[0] - (ux / ul) * o), cuffA[1] - (uy / ul) * o], [s * (cuffB[0] - (ux / ul) * o), cuffB[1] - (uy / ul) * o], 0.012, F + 0.001, 4); } }
  strip(knit, [-JK.hem + 0.01, 0.03], [JK.hem - 0.01, 0.03], 0.045, F + 0.001, 24);
  const geo = (part, mat) => {
    const pos = [];
    for (let i = 0; i < part.pos.length; i += 3) { const q = placeJacket(how, part.pos[i], part.pos[i + 1], part.pos[i + 2]); pos.push(q[0], q[1], q[2]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(part.idx);
    // (uvs: the flat pattern's own place, for the grain)
    const uv = []; for (let i = 0; i < part.pos.length; i += 3) uv.push(part.pos[i] * 2 + 0.5, part.pos[i + 1] * 2); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
  };
  const map = leatherMap(THREE);
  const leather = new THREE.MeshStandardMaterial({ color: '#ffffff', map, roughness: 0.42, metalness: 0.02, side: THREE.DoubleSide }); leather.name = 'prop-jacket';
  const collarM = new THREE.MeshStandardMaterial({ color: '#E8DCD2', map, roughness: 0.4, side: THREE.DoubleSide });
  const g = new THREE.Group();
  g.add(geo(cloth, leather), geo(coll, collarM), geo(det, new THREE.MeshStandardMaterial({ color: '#1E140F', roughness: 0.55, side: THREE.DoubleSide })),
    geo(metal, new THREE.MeshStandardMaterial({ color: '#CFC8B8', roughness: 0.28, metalness: 0.9, side: THREE.DoubleSide })),
    geo(knit, new THREE.MeshStandardMaterial({ color: '#1B1714', roughness: 0.95, side: THREE.DoubleSide })),
    geo(lining, new THREE.MeshStandardMaterial({ color: '#7A1E24', roughness: 0.7, side: THREE.DoubleSide })));
  // (hung: its back, the same cloth on the far side of the chest, with no zip or pockets on it; the sleeves made round)
  if (!folded) { const back = geo(cloth, leather); back.scale.z = -1; g.add(back); }
  // (hung: stood on the ground, its collar HANG m up, the hem just touching; held, the collar is the hand's)
  if (!folded) { for (const c of g.children) c.position.y += JACKET_HANG; g.userData.hang = JACKET_HANG - 0.02; }
  return g;
}
export const JACKET_HANG = 0.71;

// the Derby's betting slip: a printed ticket, the number 7 on it
function slip(THREE) {
  let tex = null;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = 128; c.height = 192; const x = c.getContext('2d');
    x.fillStyle = '#F6F1E1'; x.fillRect(0, 0, 128, 192); x.fillStyle = '#1A1A1A';
    x.font = '700 15px system-ui, sans-serif'; x.textAlign = 'center'; x.fillText('DUCK DERBY', 64, 24); x.font = '500 11px system-ui, sans-serif'; x.fillText('RIVER RACE · WIN', 64, 42);
    x.font = '900 70px "Barlow Condensed", system-ui, sans-serif'; x.fillText('7', 64, 118); x.font = '600 13px system-ui, sans-serif'; x.fillText('"QUACKSON"', 64, 142); x.fillText('$40,000', 64, 164);
    x.fillStyle = '#C8202B'; x.font = '24px system-ui'; x.fillText('♥', 100, 186);
    tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.12), new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex, roughness: 0.9, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.002; const g = new THREE.Group(); g.add(m); return g;
}

// a prop of a kind, built round its base (y 0 on the ground), facing +z; o.scale multiplies it, o.number the duck's
export function makeProp(THREE, kind, o = {}) {
  const k = propKind(kind); if (!k) throw new Error('no prop ' + kind);
  let g;
  if (k === 'duck') { g = new THREE.Group(); const m = new THREE.Mesh(duckGeometry(THREE, { lod: 0 }), duckMaterial(THREE, o.number || '7')); m.scale.setScalar(PROP_SIZE.duck); g.add(m); }
  else if (k === 'duffel' || k === 'duffel-open') g = duffel(THREE, k === 'duffel-open');
  else if (k === 'sponge') g = sponge(THREE);
  else if (k === 'bucket') g = bucket(THREE);
  else if (k === 'suds') g = suds(THREE);
  else if (k === 'jacket' || k === 'jacket-folded') g = jacket(THREE, k === 'jacket-folded');
  else if (k === 'slip') g = slip(THREE);
  g.name = 'wagmi-prop-' + k;
  g.userData.prop = k;
  g.traverse((x) => { if (x.isMesh && !x.isInstancedMesh) { x.castShadow = k !== 'suds' && k !== 'slip'; x.receiveShadow = true; } });
  if (o.scale && +o.scale > 0) g.scale.setScalar(+o.scale);
  return g;
}

// --------------------------------------------------------------------------------------------- a stretch limo --
// a story car made a stretch limousine: every vertex of its body past the middle of its length moved out by half of
// `metres` each way, its wheels and anything else wholly at one end moved whole: the doors, roof and windows of its
// middle drawn longer, as a limo's are. Its meshes' geometry is copied first (a car's may be shared with the city's).
// The car's frame: +z ahead (Mog City's cars face +z); its own children may have transforms of their own.
export function stretchCar(THREE, obj, metres = 2.4) {
  const L = Math.max(0, +metres || 0); if (!L) return obj;
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert(), toRoot = new THREE.Matrix4(), back = new THREE.Matrix4();
  const v = new THREE.Vector3(), box = new THREE.Box3();
  const meshes = []; obj.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.geometry?.attributes?.position) meshes.push(o); });
  for (const m of meshes) {
    toRoot.multiplyMatrices(inv, m.matrixWorld);
    box.setFromBufferAttribute(m.geometry.attributes.position).applyMatrix4(toRoot);
    const half = L / 2;
    // (wholly at one end, a wheel, a lamp, a mirror: moved whole, along the car)
    if (box.min.z > -0.05 || box.max.z < 0.05) {
      const s = box.min.z > -0.05 ? 1 : -1, d = new THREE.Vector3(0, 0, s * half).transformDirection(obj.matrixWorld).multiplyScalar(half);
      // (the move in its parent's frame)
      const pInv = new THREE.Matrix4().copy(m.parent.matrixWorld).invert(), w0 = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld), w1 = w0.clone().add(d);
      m.position.add(w1.applyMatrix4(pInv).sub(w0.clone().applyMatrix4(pInv)));
      continue;
    }
    if (m.isInstancedMesh) continue;
    m.geometry = m.geometry.clone();
    back.copy(toRoot).invert();
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(toRoot); v.z += v.z >= 0 ? half : -half; v.applyMatrix4(back); p.setXYZ(i, v.x, v.y, v.z); }
    p.needsUpdate = true; m.geometry.computeBoundingBox(); m.geometry.computeBoundingSphere();
  }
  obj.userData.stretched = L;
  return obj;
}
