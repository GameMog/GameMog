// Mog City, Hometown: the player's car in one of the town fleet's ready-made bodies (cities/sf/js/fleet-models.js,
// window.NYC.Fleet: realistic models, CC BY 4.0, assets/vehicles/fleet/CREDITS.md). A sheet with fleet: '<model id>'
// (wagmi/jack-sheets.js for a car he takes, the town's default car in wagmi/game.js) is built as the Story Kit builds
// any sheet (wagmi/storyrun/vehicles/build-vehicle.js: its seat and the wheel his hands hold, its engine's sound, its
// handling from the sheet's class and adjectives), shaped near the model's size, and then wears the model: the Story
// Kit's own body hidden (the driver's anchor kept, moved with the wheel he holds onto the model's own steering wheel;
// a tow rig kept, built on the model's bed and roof, rigFit), the model's body and glass on its springs, its wheels in the Story Kit's wheel list (so update() spins and steers
// them), its paint and lamps the model's own uniforms (brake lamps from its speed, as the Story Kit's do), its box,
// axles and chase framing the model's. Its doors don't open: it is a doorless car to ride.js (he just gets in).
//   buildFleetCar(THREE, sheet) -> rs (throws when the model isn't loaded: the caller builds the plain sheet then)
//   fleetModelReady(id)         the model is loaded (synchronous)
//   rigFit(model) -> marks      where a tow rig sits on the model (build-vehicle.js's o.rig)
import { buildVehicle } from './storyrun/vehicles/build-vehicle.js';
import { CLASSES } from './storyrun/vehicles/classes.js';

const Fleet = () => globalThis.window?.NYC?.Fleet || null;
export const fleetModelReady = (id) => !!Fleet()?.get(id);

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// the class preset's knobs moved toward the model's length, width and height (the seat, the wheel and the sound follow)
function shapedSheet(sheet, m) {
  const C = CLASSES[sheet.class] || CLASSES.sedan;
  const P = { ...(sheet.proportions || {}) };
  if (C && C.L) P.length = clamp((m.length / C.L - 1) / 0.1, -1, 1);
  if (C && C.W) P.width = clamp(((m.width / 2) / C.W - 1) / 0.055, -1, 1);
  return { ...sheet, proportions: P };
}

// where a tow rig (wagmi/storyrun/vehicles/build-vehicle.js, o.rig) sits on the model: from its body's and glass's own
// vertices (the model's frame is the body's), the tail, the bumper's foot, the bed's rails and floor, the cab's back wall,
// the roof over the cab and the widths, so the boom, the wheel-lift and the light bar sit on it, not inside or off it
export function rigFit(model) {
  const m = model.meta, zR = m.zR, len = m.zF - m.zR, BIN = 0.05, nb = Math.ceil(len / BIN) + 1, top = new Float32Array(nb).fill(-1);
  const binOf = (z) => Math.max(0, Math.min(nb - 1, Math.floor((z - zR) / BIN)));
  let foot = Infinity, bedW = 0, any = false;
  const P = [];
  for (const k of ['body', 'glass']) {
    const geo = model.geo[k], a = geo?.attributes?.position; if (!a) continue;
    any = true;
    const first = P.length / 3; for (let i = 0; i < a.count; i++) P.push(a.getX(i), a.getY(i), a.getZ(i));
    // (the highest point over each 5 cm of its length: a triangle's highest in a slab lies on its edges, so each edge
    // is read at the slab's two faces; a long flat panel has vertices only at its ends)
    const idx = geo.index ? geo.index.array : null, n = idx ? idx.length : a.count;
    const Y = (i) => P[(first + i) * 3 + 1], Z = (i) => P[(first + i) * 3 + 2];
    const edge = (i, j) => {
      let za = Z(i), zb = Z(j), ya = Y(i), yb = Y(j); if (za > zb) { [za, zb] = [zb, za]; [ya, yb] = [yb, ya]; }
      const dz = zb - za;
      for (let b = binOf(za); b <= binOf(zb); b++) {
        for (const zz of [Math.max(za, zR + b * BIN), Math.min(zb, zR + (b + 1) * BIN)]) {
          const y = dz > 1e-6 ? ya + (yb - ya) * (zz - za) / dz : Math.max(ya, yb);
          if (y > top[b]) top[b] = y;
        }
      }
    };
    for (let t = 0; t + 2 < n; t += 3) {
      const i = idx ? idx[t] : t, j = idx ? idx[t + 1] : t + 1, k2 = idx ? idx[t + 2] : t + 2;
      edge(i, j); edge(j, k2); edge(k2, i);
    }
  }
  if (!any) return null;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    if (z < zR + 0.12 && y > 0.12) foot = Math.min(foot, y);
    if (z > zR + 0.25 && z < zR + 1.2) bedW = Math.max(bedW, Math.abs(x));
  }
  const binsIn = (z0, z1) => { const o = []; for (let b = Math.floor((z0 - zR) / BIN); b <= Math.floor((z1 - zR) / BIN); b++) if (b >= 0 && b < nb && top[b] > 0) o.push(top[b]); return o; };
  const med = (v) => { const s = [...v].sort((p, q) => p - q); return s.length ? s[s.length >> 1] : null; };
  const yBed = med(binsIn(zR + 0.25, zR + 1.0)) ?? m.height * 0.55;
  // (the roof: the highest run of the middle of its length; the cab's back wall: from the roof's back edge rearward to
  // where it drops to the rails)
  let peak = -1, pb = Math.floor(nb / 2);
  for (let b = Math.floor(nb * 0.15); b < Math.ceil(nb * 0.85); b++) if (top[b] > peak) { peak = top[b]; pb = b; }
  const roofY = peak > 0 ? peak : m.height;
  let b0 = pb, b1 = pb;
  while (b0 > 0 && top[b0 - 1] > roofY - 0.06) b0--;
  while (b1 < nb - 1 && top[b1 + 1] > roofY - 0.06) b1++;
  let bc = b0; while (bc > 0 && top[bc - 1] > yBed + 0.2) bc--;
  const zCab = zR + bc * BIN, r0 = zR + b0 * BIN, r1 = zR + (b1 + 1) * BIN;
  let roofHalfW = 0, floor = -1;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    if (z >= r0 && z <= r1 && y > roofY - 0.08) roofHalfW = Math.max(roofHalfW, Math.abs(x));
    if (Math.abs(x) < 0.45 && z > zR + 0.3 && z < zCab - 0.15 && y < yBed - 0.12 && y > floor) floor = y;
  }
  const roofMid = (r0 + r1) / 2;
  return {
    zR, zCab, yBed, halfW: Math.min(m.hw, bedW || m.hw), yBump: Number.isFinite(foot) ? foot : 0.45,
    yFloor: floor > 0 ? floor : Math.max(yBed - 0.45, m.wheels.rear.r * 2 + 0.05),
    roofY, roofZ: Math.min(r1 - 0.25, roofMid + 0.15), roofHalfW: roofHalfW || m.hw * 0.7,
  };
}

// (17 Nov, Colter Land's 1978 feed truck on the modern full-size pickup lost its two-tone and its age) an old car's
// sheet worn by a newer model keeps what the sheet says of its looks: its second colour (paint.split: the roof, the
// lower body or a beltline band, at the model's own lines), and from the sheet's era of VINTAGE or before, its face as the
// sheet gives it: a chrome blade bumper at each end, round lamps in square chrome bezels, a chrome grille of horizontal
// bars between them, all shaped onto the model's own skin (endSurface: read off its body, no wider than it is at each
// height), its own head lamps taken off under the new face, its chrome reflecting a sky and land of its own
export const VINTAGE = 1989;
export function vintageParts(sheet) {
  const era = +sheet?.era || 2010, face = sheet?.face || {}, old = era <= VINTAGE;
  return {
    split: sheet?.paint?.second && ['roof', 'lower', 'beltline'].includes(sheet.paint.split) ? sheet.paint.split : null,
    bumper: old && face.bumper === 'chrome-blade',
    lamps: old && (face.lamps === 'round-pair' || face.lamps === 'quad-round') ? face.lamps : null,
    grille: old && ['horizontal-bars', 'egg-crate', 'mesh'].includes(face.grille) ? face.grille : null,
  };
}
// the model's own face, read off its body: where a ray along its length first meets it, at (x, y), from the front
// (end 1) or the tail (end -1): the triangles at that end, tested in the x-y plane (the rays run along z). A gap in the
// skin (a lamp's hole) is filled across from its sides; the model is taken as the same on both sides of x = 0
export function endSurface(model, end, { x1 = 1.2, y0 = 0.2, y1 = 1.4, step = 0.02 } = {}) {
  const geo = model.geo?.body, a = geo?.attributes?.position; if (!a) return null;
  const m = model.meta, idx = geo.index ? geo.index.array : null, n = idx ? idx.length : a.count;
  const zEnd = end > 0 ? m.zF : m.zR, T = [];
  for (let t = 0; t + 2 < n; t += 3) {
    const v = [0, 1, 2].map((k) => { const i = idx ? idx[t + k] : t + k; return [a.getX(i), a.getY(i), a.getZ(i)]; });
    if (v.every((p) => end * (zEnd - p[2]) > 0.9)) continue;
    if (Math.max(v[0][1], v[1][1], v[2][1]) < y0 || Math.min(v[0][1], v[1][1], v[2][1]) > y1) continue;
    T.push(v);
  }
  const hit = (x, y) => {
    let best = null;
    for (const [p, q, r] of T) {
      const d = (q[1] - r[1]) * (p[0] - r[0]) + (r[0] - q[0]) * (p[1] - r[1]); if (Math.abs(d) < 1e-12) continue;
      const l1 = ((q[1] - r[1]) * (x - r[0]) + (r[0] - q[0]) * (y - r[1])) / d, l2 = ((r[1] - p[1]) * (x - r[0]) + (p[0] - r[0]) * (y - r[1])) / d, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const z = l1 * p[2] + l2 * q[2] + l3 * r[2]; if (best == null || end * z > end * best) best = z;
    }
    return best;
  };
  const nx = Math.round(x1 / step) + 1, ny = Math.round((y1 - y0) / step) + 1, Z = new Float32Array(nx * ny).fill(NaN);
  for (let j = 0; j < ny; j++) {
    const y = y0 + j * step, row = [];
    for (let i = 0; i < nx; i++) { const z = hit(i * step, y); row.push(z); }
    const far = Math.max(...row.filter((z) => z != null).map((z) => end * z), -Infinity);
    // (a hole: nothing there, or 0.45 m behind the row's front-most point; filled from either side along x)
    for (let i = 0; i < nx; i++) if (row[i] != null && end * row[i] > far - 0.45) Z[j * nx + i] = row[i];
    let last = -1;
    for (let i = 0; i < nx; i++) {
      if (Number.isNaN(Z[j * nx + i])) continue;
      if (last >= 0 && i - last > 1) for (let k = last + 1; k < i; k++) Z[j * nx + k] = Z[j * nx + last] + (Z[j * nx + i] - Z[j * nx + last]) * (k - last) / (i - last);
      last = i;
    }
  }
  // (and a smooth skin for what lies on it: the front-most within 2 cm (a thin slat of the model's own grille stays
  // under it), averaged over 4 cm (no ripple from the model's facets))
  const pass = (src, f, r) => { const o = new Float32Array(nx * ny).fill(NaN); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { if (Number.isNaN(src[j * nx + i])) continue; const v = []; for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const ii = Math.abs(i + di), jj = j + dj; if (ii >= nx || jj < 0 || jj >= ny) continue; const q = src[jj * nx + ii]; if (!Number.isNaN(q)) v.push(q); } o[j * nx + i] = f(v); } return o; };
  const ZS = pass(pass(Z, (v) => (end > 0 ? Math.max(...v) : Math.min(...v)), 1), (v) => v.reduce((a, b) => a + b, 0) / v.length, 2);
  const atIn = (G) => (i, j) => G[Math.max(0, Math.min(ny - 1, j)) * nx + Math.max(0, Math.min(nx - 1, i))];
  // (its z at (x, y), bilinear; NaN off its edge. zIn: where that's off its edge, its z further in toward the middle;
  // zs: the smooth skin's, as zIn)
  const zIn = (x, y) => { let zz = z(x, y); for (let xx = Math.abs(x); Number.isNaN(zz) && xx > 0; xx -= step) zz = z(xx, y); return zz; };
  const zs = (x, y) => { let zz = z(x, y, atIn(ZS)); for (let xx = Math.abs(x); Number.isNaN(zz) && xx > 0; xx -= step) zz = z(xx, y, atIn(ZS)); return zz; };
  const z = (x, y, at = atIn(Z)) => {
    const u = Math.abs(x) / step, w = (y - y0) / step, i = Math.floor(u), j = Math.floor(w), fu = u - i, fw = w - j;
    const q = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)];
    if (q.some(Number.isNaN)) { const ok = q.filter((v) => !Number.isNaN(v)); return ok.length ? (end > 0 ? Math.max(...ok) : Math.min(...ok)) : NaN; }
    return (q[0] * (1 - fu) + q[1] * fu) * (1 - fw) + (q[2] * (1 - fu) + q[3] * fu) * fw;
  };
  // (how far out it reaches over a band of heights: the last x where, at every height (or, any: at one at least), the
  // skin is there and no more than `drop` behind the middle's)
  const reach = (ya, yb, drop, any = false) => {
    let xe = 0;
    for (let i = 0; i < nx; i++) {
      let n = 0, ok = 0;
      for (let y = ya; y <= yb + 1e-6; y += step) { n++; const zz = z(i * step, y), zc = z(0, y); if (!Number.isNaN(zz) && !Number.isNaN(zc) && end * (zc - zz) <= drop) ok++; }
      if (any ? !ok : ok < n) break; xe = i * step;
    }
    return xe;
  };
  return { z, zIn, zs, reach, end };
}
// a relief on the model's face: P(u, s) -> [x, y] over the face (u along it, s across it), raised off the skin by
// out(s) (0 at its two edges, where its walls go back to the skin; the walls a little in under the skin, so no light
// shows between); nu x ns quads
function relief(THREE, S, P, out, nu, ns, sink = 0.004) {
  const pos = [], ix = [], rows = [];
  const cols = [[0, -sink]]; for (let k = 0; k <= ns; k++) cols.push([k / ns, out(k / ns)]); cols.push([1, -sink]);
  for (let i = 0; i <= nu; i++) {
    for (const [s, o] of cols) { const [x, y] = P(i / nu, s), zz = S.z(x, y); pos.push(x, y, zz + S.end * o); }
  }
  const C = cols.length;
  for (let i = 0; i < nu; i++) for (let k = 0; k < C - 1; k++) {
    const a = i * C + k, b = a + 1, c = a + C, d = c + 1;
    if (S.end > 0) ix.push(a, c, b, b, c, d); else ix.push(a, b, c, b, d, c);
  }
  // (its two ends closed: the section as a fan)
  for (const i of [0, nu]) { const base = i * C; for (let k = 1; k < C - 1; k++) { const t = [base, base + k, base + k + 1]; if ((i === 0) === (S.end > 0)) ix.push(t[0], t[2], t[1]); else ix.push(...t); } }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(ix); g.computeVertexNormals();
  return g;
}
// chrome's reflection: the sky over a bright horizon and the dark land under it (an equirect, PMREM'd by the renderer)
let chromeEnv = null;
function chromeEnvMap(THREE) {
  if (chromeEnv || !globalThis.document) return chromeEnv;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#5f86b8'); gr.addColorStop(0.36, '#a9c3df'); gr.addColorStop(0.485, '#f6f1e6'); gr.addColorStop(0.5, '#cfc3ad');
  gr.addColorStop(0.515, '#4a4136'); gr.addColorStop(0.7, '#2b251f'); gr.addColorStop(1, '#17130f');
  x.fillStyle = gr; x.fillRect(0, 0, 256, 128);
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  return (chromeEnv = t);
}
function vintage(THREE, rs, car, model, sheet, rig) {
  const v = vintageParts(sheet), m = model.meta;
  if (v.split) {
    const r = rig || rigFit(model);
    const y = v.split === 'roof' ? (r ? r.roofY - 0.07 : m.height - 0.12) : v.split === 'lower' ? m.wheels.front.r * 2 + 0.12 : (r ? r.yBed : m.height * 0.6);
    car.setSplit?.(v.split, sheet.paint.second, y, 0.045);
  }
  if (!v.bumper && !v.lamps && !v.grille) return;
  const env = chromeEnvMap(THREE);
  const chrome = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, metalness: 1, roughness: 0.14, envMap: env, envMapIntensity: 1.15 });
  const satin = new THREE.MeshStandardMaterial({ color: 0xd9dde0, metalness: 1, roughness: 0.32, envMap: env, envMapIntensity: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0c0d0e, metalness: 0.2, roughness: 0.7 });
  const lens = new (THREE.MeshStandardNodeMaterial || THREE.MeshStandardMaterial)({ color: 0xe6e8e4, metalness: 0.65, roughness: 0.1, envMap: env, envMapIntensity: 0.8, emissive: 0xfff3d6, emissiveIntensity: 0.18 });
  // (lit as the model's own head lamps are: brighter as the city's night comes on, cities/sf/js/fleet-models.js)
  try {
    const N = globalThis.window?.NYC, T = N?.TSL, glow = N?.cityUniforms?.uInteriorGlow;
    if (T && glow) lens.emissiveNode = T.vec3(1.0, 0.92, 0.8).mul(T.smoothstep(0.6, 1.15, glow).mul(2.4).add(0.12)).mul(N.carLampPower || T.float(1));
  } catch (err) { console.warn('[fleet] vintage lamps', err); }
  const g = new THREE.Group(); g.name = 'vintage-face'; rs.body.add(g);
  // (the face's small parts take shadow but cast none: their own on the dark ground read as teeth at the shadow map's size)
  const put = (geo, mat, cast = false) => { const o = new THREE.Mesh(geo, mat); o.castShadow = cast; o.receiveShadow = true; g.add(o); return o; };
  const F = endSurface(model, 1), R = endSurface(model, -1);
  if (!F) return;
  // (the model's own head lamps: its lamps' mesh without them, under the new face)
  const lampsMesh = rs.body.getObjectByName('fleet-lamps'), lg = lampsMesh?.geometry;
  let lamp = null;
  if (lg && lg.attributes._fleet && (v.lamps || v.grille)) {
    const fl = lg.attributes._fleet, p = lg.attributes.position, I = lg.index ? lg.index.array : null, keep = [];
    lamp = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    const n = I ? I.length : p.count;
    for (let t = 0; t + 2 < n; t += 3) {
      const k = [0, 1, 2].map((q) => (I ? I[t + q] : t + q));
      const head = k.every((i) => Math.round(fl.getY(i) * 255) === 1 && p.getZ(i) > 0);
      if (!head) { keep.push(...k); continue; }
      for (const i of k) { lamp.x0 = Math.min(lamp.x0, Math.abs(p.getX(i))); lamp.x1 = Math.max(lamp.x1, Math.abs(p.getX(i))); lamp.y0 = Math.min(lamp.y0, p.getY(i)); lamp.y1 = Math.max(lamp.y1, p.getY(i)); }
    }
    if (!Number.isFinite(lamp.x0)) lamp = null;
    else { const q = new THREE.BufferGeometry(); for (const k in lg.attributes) q.setAttribute(k, lg.attributes[k]); q.setIndex(keep); q.boundingBox = lg.boundingBox; q.boundingSphere = lg.boundingSphere; q.userData.shared = true; lampsMesh.geometry = q; }
  }
  const head = m.head || [m.hw * 0.65, m.height * 0.42, m.zF - 0.2];
  // (the hood's front edge: up the middle from the lamps until the skin falls back)
  const zc = F.z(0, head[1]); let hood = head[1];
  while (hood < m.height && F.z(0, hood + 0.01) > zc - 0.16) hood += 0.01;
  // the blade: chrome across the nose at the bumper's height, its ends round the corners as the body's are
  const bH = 0.19, b0 = Math.max(m.wheels.front.r, (lamp ? lamp.y0 : head[1] - 0.3) - 0.05), b1 = b0 + bH;
  const faceTop = Math.min(hood - 0.03, Math.max(lamp ? lamp.y1 + 0.03 : head[1] + 0.2, b1 + 0.38)), faceBot = b1 - 0.02;
  if (v.bumper) {
    const xb = Math.max(0.5, F.reach(b0, b1, 0.34, true));
    // (its section: a blade with a crease along its middle, 3 cm proud of the skin's front-most there)
    const zB = (x) => { let zz = -Infinity; for (let y = b0; y <= b1 + 1e-6; y += 0.02) zz = Math.max(zz, F.zIn(x, y) || -Infinity); return Number.isFinite(zz) ? zz : m.zF; };
    const S = { end: 1, z: (x, y) => zB(x) };
    put(relief(THREE, S, (u, s) => [-xb + u * 2 * xb, b0 + s * bH], (s) => 0.03 + 0.022 * (1 - Math.abs(2 * s - 1)), 48, 6), chrome, true);
    // (the dark rubber strip along its top and the plate's place in its middle)
    put(relief(THREE, S, (u, s) => [-xb * 0.96 + u * 1.92 * xb, b1 - 0.012 + s * 0.016], () => 0.036, 40, 1), dark);
  }
  if (v.lamps || v.grille) {
    // the face: a dark ground across the nose between the hood's edge and the blade, framed in chrome
    const xf = Math.max(0.45, F.reach(faceBot, faceTop, 0.3));
    const fh = faceTop - faceBot, FS = { end: 1, z: F.zs };
    put(relief(THREE, FS, (u, s) => [-xf + u * 2 * xf, faceBot + s * fh], () => 0.012, 40, 12, 0.06), dark);
    const fw = 0.028;
    for (const [ya, yb] of [[faceTop - fw, faceTop + 0.004], [faceBot - 0.004, faceBot + fw]]) put(relief(THREE, FS, (u, s) => [-xf - 0.01 + u * (2 * xf + 0.02), ya + s * (yb - ya)], (s) => 0.024 + 0.006 * Math.sin(Math.PI * s), 48, 3), chrome);
    for (const sx of [-1, 1]) put(relief(THREE, FS, (u, s) => [sx * (xf - fw + s * (fw + 0.01)), faceBot + u * fh], (s) => 0.024 + 0.006 * Math.sin(Math.PI * s), 12, 3), chrome);
    // the lamps: a round seven-inch lamp each side in a square chrome bezel, on the flat of the face
    const lampR = v.lamps === 'quad-round' ? 0.07 : 0.089, bz = v.lamps === 'quad-round' ? 0.16 : 0.125;
    const ly = (faceBot + faceTop) / 2 + 0.01;
    // (in from the model's own lamps until the face is near flat across the bezel: no more than 10 cm deeper at its
    // outer edge than its inner)
    let lx = Math.min(xf - bz - 0.03, lamp ? (lamp.x0 + lamp.x1) / 2 : head[0]);
    while (lx > bz + 0.3 && F.zs(lx - bz, ly) - F.zs(lx + bz, ly) > 0.1) lx -= 0.01;
    const inner = lx - bz - 0.025;
    if (v.lamps) for (const sx of [-1, 1]) {
      const cx = sx * lx;
      // (the bezel: a raised square ring)
      const ring = (x0, x1, y0, y1) => put(relief(THREE, FS, (u, s) => [x0 + u * (x1 - x0), y0 + s * (y1 - y0)], (s) => 0.022 + 0.01 * Math.sin(Math.PI * s), 10, 3), satin);
      const t = 0.024;
      ring(cx - bz, cx + bz, ly + bz - t, ly + bz); ring(cx - bz, cx + bz, ly - bz, ly - bz + t);
      put(relief(THREE, FS, (u, s) => [cx - bz + s * t, ly - bz + u * 2 * bz], (s) => 0.022 + 0.01 * Math.sin(Math.PI * s), 10, 3), satin);
      put(relief(THREE, FS, (u, s) => [cx + bz - t + s * t, ly - bz + u * 2 * bz], (s) => 0.022 + 0.01 * Math.sin(Math.PI * s), 10, 3), satin);
      const xs = v.lamps === 'quad-round' ? [cx - sx * 0.075, cx + sx * 0.075] : [cx];
      for (const x0 of xs) {
        // (its lens: a shallow dome in a chrome ring, square to the face there)
        const zz = F.zs(x0, ly), dzx = (F.zs(x0 + 0.04, ly) - F.zs(x0 - 0.04, ly)) / 0.08, dzy = (F.zs(x0, ly + 0.04) - F.zs(x0, ly - 0.04)) / 0.08;
        const nrm = new THREE.Vector3(-dzx, -dzy, 1).normalize(), L = new THREE.Group();
        L.position.set(x0, ly, zz + 0.014); L.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm); g.add(L);
        const r1 = new THREE.Mesh(new THREE.TorusGeometry(lampR + 0.008, 0.011, 10, 40), chrome); r1.position.z = 0.012; L.add(r1);
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(lampR + 0.004, lampR + 0.004, 0.02, 40, 1, true), dark); cup.rotation.x = Math.PI / 2; cup.position.z = 0.004; L.add(cup);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(lampR * 2.2, 40, 8, 0, Math.PI * 2, 0, Math.asin(1 / 2.2)), lens);
        dome.rotation.x = Math.PI / 2; dome.position.z = 0.012 - lampR * 2.2 * Math.cos(Math.asin(1 / 2.2)) + 0.002; L.add(dome);
        for (const o of [r1, cup, dome]) o.receiveShadow = true;
      }
    }
    // the grille between them: chrome bars across, a divider down the middle
    if (v.grille) {
      const gx = v.lamps ? Math.max(0.25, inner) : xf - 0.04, g0 = faceBot + fw + 0.035, g1 = faceTop - fw - 0.035, bars = v.grille === 'horizontal-bars' ? 4 : 3;
      const bh = v.grille === 'horizontal-bars' ? 0.026 : 0.018;
      for (let k = 0; k < bars; k++) { const y = g0 + (k + 0.5) / bars * (g1 - g0) - bh / 2; put(relief(THREE, FS, (u, s) => [-gx + u * 2 * gx, y + s * bh], (s) => 0.018 + 0.008 * Math.sin(Math.PI * s), 36, 3), chrome); }
      const vb = v.grille === 'horizontal-bars' ? [0] : [-0.66, -0.33, 0, 0.33, 0.66];
      for (const f of vb) put(relief(THREE, FS, (u, s) => [f * gx - 0.012 + s * 0.024, g0 - 0.02 + u * (g1 - g0 + 0.04)], (s) => 0.02 + 0.008 * Math.sin(Math.PI * s), 8, 3), chrome);
    }
  }
  if (v.bumper && R) {
    // and at the tail: a blade under the tailgate, as wide as the bed there and round its corners, no further out
    const r = rig || rigFit(model), tH = 0.17;
    let t0 = Math.max(m.wheels.rear.r * 0.95, (r ? r.yBump : 0.4) - 0.02);
    while (t0 < 0.8 && Number.isNaN(R.z(0, t0))) t0 += 0.01;
    const xb = Math.min(r ? r.halfW - 0.04 : m.hw, Math.max(0.5, R.reach(t0, t0 + tH, 0.34, true)));
    const zT = (x) => { let zz = Infinity; for (let y = t0; y <= t0 + tH + 1e-6; y += 0.02) zz = Math.min(zz, R.zIn(x, y) || Infinity); return Number.isFinite(zz) ? zz : m.zR; };
    const S = { end: -1, z: (x) => zT(x) };
    put(relief(THREE, S, (u, s) => [-xb + u * 2 * xb, t0 + s * tH], (s) => 0.025 + 0.02 * (1 - Math.abs(2 * s - 1)), 48, 6), chrome, true);
    put(relief(THREE, S, (u, s) => [-xb * 0.96 + u * 1.92 * xb, t0 + tH - 0.012 + s * 0.016], () => 0.03, 40, 1), dark);
  }
  g.userData.face = { hood: +hood.toFixed(3), faceBot: +faceBot.toFixed(3), faceTop: +faceTop.toFixed(3), lamp };
}

export function buildFleetCar(THREE, sheet) {
  const F = Fleet(), model = F && F.get(sheet.fleet);
  if (!model) throw new Error('fleet model not loaded: ' + sheet.fleet);
  const m = model.meta;
  const { fleet, ...plain } = shapedSheet(sheet, m);
  // (a tow rig, the tow ability on a bed: built on the model's bed and roof, rigFit)
  const rig = (plain.abilities || []).includes('tow') ? rigFit(model) : null;
  const rs = buildVehicle(THREE, plain, rig ? { rig } : {});
  const g = rs.group, V = (x, y, z) => new THREE.Vector3(x, y, z);
  // the Story Kit's own body put away: every mesh but the driver's (the anchor's subtree) and the tow rig's
  const keep = new Set(); rs.anchor.traverse((o) => keep.add(o)); rs.tow?.rig?.traverse((o) => keep.add(o));
  g.traverse((o) => { if (o.isMesh && !keep.has(o)) o.visible = false; });
  // the model: body, glass, lamps and decals on the body (its springs lean it), the wheels on the car
  const car = F.buildCar(model, { paint: sheet.paint?.base, hero: true });
  for (const part of [...car.group.children]) {
    if (car.wheels.some((w) => w.W === part)) g.add(part);
    else rs.body.add(part);
  }
  rs.wheels.length = 0;
  for (const w of car.wheels) rs.wheels.push({ W: w.W, spin: w.spin, front: w.front, r: w.r });
  // the wheel his hands hold, on the model's own steering wheel, and the driver with it
  if (m.steer && rs.wheel) {
    g.updateMatrixWorld(true);
    const want = rs.body.localToWorld(V(...m.steer)), at = rs.wheel.getWorldPosition(V(0, 0, 0));
    const d = want.sub(at);
    const pw = rs.wheel.parent, pa = rs.anchor.parent;
    const local = (obj, delta) => { const a = obj.parent.worldToLocal(obj.getWorldPosition(V(0, 0, 0)).add(delta)); obj.position.copy(a); };
    if (pw && pa) { local(rs.wheel, d.clone()); local(rs.anchor, d.clone()); }
  }
  // (his eyes under the model's roof: a low sports car seats him lower than its class's preset; an open car leaves him be)
  if (!m.open && rs.seat) {
    const eye = rs.anchor.position.y + (rs.seat.eye ? rs.seat.eye[1] : rs.seat.hip[1] + 0.56), roofEye = m.height - 0.17;
    if (eye > roofEye) rs.anchor.position.y -= eye - roofEye;
  }
  // an old car's looks the sheet gives it (its two-tone, and from VINTAGE back its chrome face)
  try { vintage(THREE, rs, car, model, sheet, rig); } catch (err) { console.warn('[fleet] vintage', err); }
  // its paint and lamps: the model's uniforms
  rs.setPaint = (hex) => car.setPaint(hex);
  let prev = 0, accS = 0, brakeSet = null, revSet = null;
  const update = rs.update;
  rs.update = (dt, speed = 0, steer = 0) => {
    update(dt, speed, steer);
    if (!(dt > 0)) return;
    const acc = (speed - prev) / Math.min(dt, 0.05); prev = speed;
    accS += (acc - accS) * Math.min(1, dt * 8);
    const slowing = speed * accS < 0 ? Math.abs(accS) : 0;
    const brake = brakeSet ?? (Math.abs(speed) < 0.3 || slowing > 3.4 ? 1 : 0);
    car.setState(brake, 0, 0, m.livery === 'police' ? 1 : 0);
  };
  rs.setBrake = (on) => { brakeSet = on == null ? null : on ? 1 : 0; };
  rs.setReverse = (on) => { revSet = on == null ? null : on ? 1 : 0; };
  // its headlamps' spots on the model's own lamps
  const HEAD_GAIN = 6, head = m.head || [m.hw * 0.7, 0.7, m.zF - 0.2];
  rs.attach = (c) => {
    if (!c?.headLights) return;
    c.headLights.forEach((s, i) => {
      const side = s.position.x < 0 ? -1 : s.position.x > 0 ? 1 : (i ? 1 : -1), x = side * Math.abs(head[0]), y = head[1], z = head[2] + 0.05;
      s.position.set(x, y, z); s.target.position.set(x + side * 0.25, y - 10 * Math.tan(0.08), z + 10);
      s.color.set('#F2F0E8'); s.angle = 0.26; s.penumbra = 0.6; s.distance = 90;
      let val = s.intensity; Object.defineProperty(s, 'intensity', { get: () => val, set: (x2) => { val = x2 * HEAD_GAIN; }, configurable: true });
    });
  };
  // the model's box, axles and chase framing (tune.js's formulas, from the model's size)
  const T = rs.tune || (rs.tune = {});
  T.body = { hx: +(m.hw * 0.95).toFixed(2), z0: +(m.zR - 0.04).toFixed(2), z1: +(m.zF + 0.05).toFixed(2), top: +m.height.toFixed(2) };
  T.axle = +m.axle.toFixed(2);
  T.chaseDistance = +(2.6 + 0.67 * m.length + Math.min(1.5 * Math.max(0, m.height - 1.4), 0.9)).toFixed(2);
  T.chaseHeight = +(0.55 + 0.86 * m.height).toFixed(2);
  Object.assign(rs, { length: m.length, width: m.width, height: m.height, fleet: sheet.fleet, fleetCar: car });
  // (no door cut in the model: doorless, ride.js keeps its no-op setDoor and he just gets in)
  rs.doors = null;
  return rs;
}
