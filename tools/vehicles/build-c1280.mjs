// Comrade1280's packs (CC BY 4.0) -> Mog City's service vehicles: the packs split into their vehicles (every one of them
// written to the staging folder's c1280/ for a look), and the ones the game uses processed like the town cars:
//  - the engine's frame (metres, y up, tyres on y = 0, nose +z, left +x, origin midway between the end axles)
//  - the civil pack's wheels, merged into each body, split out by geometry (connected pieces round each hub)
//  - per vehicle: its body (its own texture, 1024 / 512, its metal-rough as ORM), its lamps (the pack's shared optics
//    texture, each lamp tagged head / tail / indicator by its colour and end), its glass, its decals (alpha), wheels
//  - LOD1 / LOD2: the body and glass simplified (decals and lamps left off)
// node build-c1280.mjs <downloads dir> <out dir> [ids]
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { io, extract, bounds, applyMat, rotY, trans, mul, Bucket, mergeArrays, transformArrays, simplify, writeGLB, sha256, sha1s, compact } from './lib.mjs';

const [SRC, OUT, ONLY] = process.argv.slice(2);
const SPLIT = join(OUT, '..', 'c1280'); mkdirSync(SPLIT, { recursive: true }); mkdirSync(OUT, { recursive: true });
const LAMP = { none: 0, head: 1, tail: 2, brake: 3, blink: 4, reverse: 5, beacon: 6, sign: 7 };
const FLAG = { interior: 1, inner: 2, wheel: 4, glass: 8, plate: 16 };

// the vehicles the game uses: pack, its root node, the engine's id, flip (its nose the other way along its length) and
// drive (one a player drives: its steering wheel found, steerOf; the service vehicles, which no one drives, have none)
export const C1280 = {
  bus: { pack: 'civil', root: 'citybus', flip: true }, schoolbus: { pack: 'civil', root: 'school_bus', flip: true }, ambulance: { pack: 'civil', root: 'ambulance' },
  firetruck: { pack: 'civil', root: 'fire_truck', flip: true }, garbage: { pack: 'civil', root: 'garbage_truck' }, mailvan: { pack: 'civil', root: 'postvan' },
  utility: { pack: 'civil', root: 'rdservtruck', flip: true }, tow: { pack: 'civil', root: 'towtruck', flip: true }, police20: { pack: 'civil', root: 'police_sedan', flip: true, drive: true },
  taxi20: { pack: 'civil', root: 'taxi', drive: true }, minivan20: { pack: 'passenger', root: 'minivan body', wheels: /^Wheel_D/, drive: true },
  // (the hero-grade big ones, 16 Nov, the owner: "car doesn't look good, maybe we can find new ones": a full-size
  // pickup, a full-size SUV and a short 4x4 for the ranch and mountain towns; paint: its body's own colour found and
  // marked, so a story's or the traffic's paint goes on it, wagmi/../fleet-models.js)
  pickup20: { pack: 'passenger', root: 'Pickup Body', wheels: /^Wheel_E/, paint: true, drive: true },
  suv20: { pack: 'passenger', root: 'SUV Body', wheels: /^Wheel_/, flip: true, paint: true, drive: true },
  offroad20: { pack: 'passenger', root: 'Offroad Body', wheels: /^Wheel_G/, flip: true, paint: true, drive: true },
};
const PACKS = { civil: 'gm-car-c1280-civil-pack.glb', passenger: 'gm-car-c1280-passenger-pack.glb' };

// connected pieces of a prim (vertices welded by position)
function pieces(p) {
  const n = p.pos.length / 3, key = new Map(), weld = new Int32Array(n);
  for (let i = 0; i < n; i++) { const k = `${Math.round(p.pos[i * 3] * 2000)},${Math.round(p.pos[i * 3 + 1] * 2000)},${Math.round(p.pos[i * 3 + 2] * 2000)}`; let w = key.get(k); if (w === undefined) { w = i; key.set(k, w); } weld[i] = w; }
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  for (let t = 0; t < p.idx.length; t += 3) { unite(weld[p.idx[t]], weld[p.idx[t + 1]]); unite(weld[p.idx[t]], weld[p.idx[t + 2]]); }
  const comps = new Map();
  for (let t = 0; t < p.idx.length / 3; t++) { const r = find(weld[p.idx[t * 3]]); let c = comps.get(r); if (!c) comps.set(r, (c = { tris: [], lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] })); c.tris.push(t); for (let k = 0; k < 3; k++) { const v = p.idx[t * 3 + k]; for (let a = 0; a < 3; a++) { const x = p.pos[v * 3 + a]; if (x < c.lo[a]) c.lo[a] = x; if (x > c.hi[a]) c.hi[a] = x; } } }
  return [...comps.values()].map((c) => ({ ...c, c: c.lo.map((v, a) => (v + c.hi[a]) / 2), s: c.lo.map((v, a) => c.hi[a] - v) }));
}

// the steering wheel on the driver's side (+x): the body's own piece of it, a ring 0.3 to 0.5 m across, short in height and
// depth, in the cabin's height; its middle, where a driver's hands hold it (wagmi/fleet-car.js moves the wheel he holds
// onto it). null when the body has none
function steerOf(a) {
  const c = pieces(a).filter((k) => k.c[0] > 0.15 && k.c[0] < 0.7 && k.c[1] > 0.6 && k.c[1] < 1.6 && k.c[2] > -0.6 && k.c[2] < 1.6 && k.s[0] > 0.3 && k.s[0] < 0.5 && k.s[1] < 0.3 && k.s[2] < 0.15);
  if (!c.length) return null;
  const w = c.sort((p, q) => q.tris.length - p.tris.length)[0];
  return w.c.map((v) => +v.toFixed(3));
}

async function texture(doc, sha) { for (const t of doc.getRoot().listTextures()) if (sha1s(t.getImage()) === sha) return t.getImage(); return null; }

async function buildOne(id, def, docs) {
  const doc = docs[def.pack];
  const inRoot = (path) => path.includes(def.root);
  let prims = extract(doc, null, (path) => inRoot(path) || (def.wheels && def.wheels.test(path[0])));
  if (def.wheels) {
    // (the passenger pack: the four wheel nodes nearest this body)
    const body = prims.filter((p) => inRoot(p.path)), bb = bounds(body);
    prims = [...body, ...prims.filter((p) => !inRoot(p.path) && Math.hypot(bounds([p]).c[0] - bb.c[0], bounds([p]).c[2] - bb.c[2]) < Math.max(bb.s[0], bb.s[2]) * 0.6)];
  }
  // ---- frame: its length along z (principal axis in the ground plane), the nose by flip ----
  const b0 = bounds(prims);
  let sxx = 0, szz = 0, sxz = 0, n = 0;
  for (const p of prims) for (let i = 0; i < p.pos.length; i += 3) { const x = p.pos[i] - b0.c[0], z = p.pos[i + 2] - b0.c[2]; sxx += x * x; szz += z * z; sxz += x * z; n++; }
  const phi = 0.5 * Math.atan2(2 * sxz, sxx - szz); // the principal axis' angle from +x
  // rotate so the principal axis lies along +z: x' = x cos t + z sin t ... use rotY(theta) mapping the axis (cos phi, sin phi) to (0, 1)
  let theta = -(Math.PI / 2 - phi) * -1; // (rotY(t) maps (cos phi, 0, sin phi) to (cos(phi + t)... ) solved below
  // rotY(t): (x, z) -> (x cos t + z sin t, -x sin t + z cos t). For the axis (cos phi, sin phi): z' = -cos phi sin t + sin phi cos t = sin(phi - t) = 1 -> t = phi - pi/2
  theta = phi - Math.PI / 2;
  applyMat(prims, mul(rotY(theta), trans(-b0.c[0], 0, -b0.c[2])));
  if (def.flip) applyMat(prims, rotY(Math.PI));
  // ---- the parts by material ----
  const kindOf = (p) => /glass/i.test(p.mat) ? 'glass' : /optics/i.test(p.mat) ? 'optics' : /decal/i.test(p.mat) ? 'decal' : /wheel|wheek/i.test(p.mat) || /^Wheel_/.test(p.path[0] || '') ? 'wheel' : 'body';
  const parts = { body: [], glass: [], optics: [], decal: [], wheel: [] };
  for (const p of prims) parts[kindOf(p)].push(p);
  // ---- wheels: separate nodes (passenger pack) or pieces of the body near the ground at its sides (civil pack) ----
  const detect = () => {
    const bb = bounds(prims);
    const wheelPieces = []; // { p, tris, lo, hi, c }
    if (parts.wheel.length) for (const p of parts.wheel) { const b = bounds([p]); wheelPieces.push({ p, tris: null, lo: b.lo, hi: b.hi, c: b.c }); }
    else {
      for (const p of parts.body) for (const c of pieces(p)) {
        // (a piece of a wheel: low (its top under ~1.25 m), at a side, roughly as tall as it is long)
        if (c.hi[1] < 1.25 && c.lo[1] < 0.35 && Math.abs(c.c[0]) > bb.s[0] * 0.18 && c.s[1] > 0.08 && c.s[2] < 1.35 && c.s[2] > 0.05) wheelPieces.push({ p, tris: c.tris, lo: c.lo, hi: c.hi, c: c.c });
      }
    }
    // clusters: same side, overlapping along z
    const clusters = [];
    for (const w of wheelPieces.sort((a, b) => a.c[2] - b.c[2])) {
      const side = Math.sign(w.c[0]);
      let cl = clusters.find((k) => k.side === side && w.c[2] > k.lo[2] - 0.05 && w.c[2] < k.hi[2] + 0.05);
      if (!cl) clusters.push((cl = { side, items: [], lo: [...w.lo], hi: [...w.hi] }));
      cl.items.push(w); for (let a = 0; a < 3; a++) { cl.lo[a] = Math.min(cl.lo[a], w.lo[a]); cl.hi[a] = Math.max(cl.hi[a], w.hi[a]); }
    }
    // (a wheel is about as tall as long; drop slivers)
    const ws = clusters.filter((k) => { const h = k.hi[1] - k.lo[1], l = k.hi[2] - k.lo[2]; return h > 0.35 && Math.abs(h - l) / h < 0.35 && k.lo[1] < 0.1; });
    ws.forEach((k) => (k.c = k.lo.map((v, a) => (v + k.hi[a]) / 2)));
    return ws;
  };
  let wheels = detect();
  // (the length along z exactly: the angle of each axle's left-to-right line, from its pair of wheels, taken out)
  {
    const L = wheels.filter((k) => k.c[0] > 0), R = wheels.filter((k) => k.c[0] < 0), ang = [];
    for (const l of L) { const r = R.reduce((b, k) => (!b || Math.abs(k.c[2] - l.c[2]) < Math.abs(b.c[2] - l.c[2]) ? k : b), null); if (r && Math.abs(r.c[2] - l.c[2]) < 0.6) ang.push(Math.atan2(l.c[2] - r.c[2], l.c[0] - r.c[0])); }
    if (ang.length) { const d = ang.reduce((a, b) => a + b, 0) / ang.length; if (Math.abs(d) > 0.002) { applyMat(prims, rotY(d)); wheels = detect(); } }
  }
  const bb = bounds(prims);
  const axleZ = [...new Set(wheels.map((k) => Math.round(k.c[2] * 4) / 4))];
  // ---- origin: midway between the end axles, track centred, tyres on y = 0 ----
  const zs = wheels.map((k) => k.c[2]), zF = Math.max(...zs), zR = Math.min(...zs);
  const ground = wheels.length ? Math.min(...wheels.map((k) => k.lo[1])) : bb.lo[1];
  const xMid = wheels.length ? (Math.max(...wheels.map((k) => k.hi[0])) + Math.min(...wheels.map((k) => k.lo[0]))) / 2 : 0;
  const T = trans(-xMid, -ground, -(zF + zR) / 2);
  applyMat(prims, T);
  for (const k of wheels) { for (const a of [0, 1, 2]) { const d = [-xMid, -ground, -(zF + zR) / 2][a]; k.lo[a] += d; k.hi[a] += d; k.c[a] += d; } }
  const inWheel = new Map(); // prim -> Set(tri)
  for (const k of wheels) for (const w of k.items) { if (!w.tris) continue; let s = inWheel.get(w.p); if (!s) inWheel.set(w.p, (s = new Set())); for (const t of w.tris) s.add(t); }
  return { id, def, doc, prims, parts, wheels, axleZ, bb: bounds(prims) };
}

// ---- textures: the vehicle's own base (hi 1024 / lo 512), its ORM (512 / 256), its decals (alpha), the shared optics --
// (the body's own paint, def.paint, marked in the base texture's alpha, 0.5 (the rest 1): fleet-models.js puts a story's
// or the traffic's paint there, shaded as the texture is. The paint is the body's glossy, non-metal surface (the pack's
// metal-rough map: its paint is gloss, its trim rough plastic or chrome) of the body's own colour:
//  - a coloured body: its colour the one covering most of the body's surface (each triangle's texel at its middle, by
//    its area); a texel is paint when it is that hue, however dark its baked shading (the pickup's tailgate and lower
//    rear corners are baked near black-green: a lightness test left them the pack's green under a story's paint)
//  - a black or grey body (the full-size SUV): no hue to tell paint from trim, so its gloss does: the glossy grey texels
//    as light as the body's paint (a panel line or a black seal much darker than it stays as drawn)
// The marked texels' colour is then the paint's own colour shaded, its baked shading lifted at the dark end (a panel
// baked near black would stay near black under any paint, the tailgate black under a white repaint); the runtime reads
// the shading back as the texel's lightness against the paint's colour)
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const srgb = (x) => { x = Math.max(0, Math.min(1, x)); return Math.round(255 * (x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)); };
const lumOf = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const satOf = (c) => { const mx = Math.max(...c), mn = Math.min(...c); return mx > 0 ? (mx - mn) / mx : 0; };
// (gloss: the metal-rough map's roughness under 0.3 and metalness under 0.5, the material's factors applied)
const GLOSS_R = 0.3, GLOSS_M = 0.5;
async function paintMask(v, img, W, H, mrImg) {
  const glossAt = (i) => !mrImg || (mrImg[i * 3 + 1] * mrImg.rf < GLOSS_R * 255 && mrImg[i * 3 + 2] * mrImg.mf < GLOSS_M * 255);
  const hist = new Map(), grey = [];
  let total = 0;
  for (const p of v.parts.body) {
    if (!p.uv) continue;
    for (let t = 0; t < p.idx.length / 3; t++) {
      const a = p.idx[t * 3], b = p.idx[t * 3 + 1], c = p.idx[t * 3 + 2];
      const P = (i, k) => p.pos[i * 3 + k];
      const ux = P(b, 0) - P(a, 0), uy = P(b, 1) - P(a, 1), uz = P(b, 2) - P(a, 2), vx = P(c, 0) - P(a, 0), vy = P(c, 1) - P(a, 1), vz = P(c, 2) - P(a, 2);
      const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
      let u = (p.uv[a * 2] + p.uv[b * 2] + p.uv[c * 2]) / 3, w = (p.uv[a * 2 + 1] + p.uv[b * 2 + 1] + p.uv[c * 2 + 1]) / 3;
      u -= Math.floor(u); w -= Math.floor(w);
      const px = Math.min(H - 1, Math.floor(w * H)) * W + Math.min(W - 1, Math.floor(u * W)), o = px * 3, r = img[o], g = img[o + 1], bl = img[o + 2];
      total += area;
      const k = `${r >> 4},${g >> 4},${bl >> 4}`; const e = hist.get(k) || { a: 0, r: 0, g: 0, b: 0 };
      e.a += area; e.r += r * area; e.g += g * area; e.b += bl * area; hist.set(k, e);
      if (glossAt(px) && satOf([r, g, bl]) < 0.2) grey.push({ a: area, l: lumOf(r, g, bl), c: [r, g, bl] });
    }
  }
  // (the coloured bins only: black trim, tyres, the cabin and the underbody cover more than the paint on some bodies)
  const all = [...hist.values()];
  const col = all.map((e) => ({ ...e, c: [e.r / e.a, e.g / e.a, e.b / e.a] })).filter((e) => lumOf(...e.c) >= 0.012 && satOf(e.c) >= 0.2).sort((x, y) => y.a - x.a);
  const nrm = (r, g, b) => { const l = Math.hypot(r, g, b) || 1; return [r / l, g / l, b / l]; };
  let ref = null, A = 0, kind = null;
  if (col[0]) {
    // (its neighbours in colour join it: the paint's colour the mean of the bins within its hue)
    const T0 = nrm(...col[0].c); let rr = 0, gg = 0, bb = 0;
    for (const e of col) { const q = nrm(...e.c); if (q[0] * T0[0] + q[1] * T0[1] + q[2] * T0[2] > 0.99) { A += e.a; rr += e.r; gg += e.g; bb += e.b; } }
    if (A >= total * 0.08) { ref = [rr / A, gg / A, bb / A]; kind = 'hue'; }
  }
  if (!ref && mrImg && grey.length) {
    // (a black or grey body: its paint's lightness the area's median over its glossy grey surface, above the black of
    // its seals and panel lines)
    const g2 = grey.filter((q) => q.l > 0.004).sort((x, y) => x.l - y.l), ga = g2.reduce((s, q) => s + q.a, 0);
    let acc = 0, med = null; for (const q of g2) { acc += q.a; if (acc >= ga / 2) { med = q; break; } }
    if (med && ga >= total * 0.2) { const L = med.l; const near = g2.filter((q) => q.l > L * 0.5 && q.l < L * 2); const na = near.reduce((s, q) => s + q.a, 0); ref = [0, 1, 2].map((k) => near.reduce((s, q) => s + q.c[k] * q.a, 0) / na); A = ga; kind = 'gloss'; }
  }
  if (!ref) return { ref: [0, 0, 0], refLum: 0, sat: 0, mask: null };
  const refLum = lumOf(...ref), sat = satOf(ref), R = nrm(...ref), refLin = ref.map(lin);
  const mask = Buffer.alloc(W * H), rgb = Buffer.from(img);
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    const r = img[i * 3], g = img[i * 3 + 1], b = img[i * 3 + 2], q = nrm(r, g, b), mx = Math.max(r, g, b);
    const cos = q[0] * R[0] + q[1] * R[1] + q[2] * R[2], l = lumOf(r, g, b) / refLum;
    let on = false;
    if (kind === 'hue') on = (cos > 0.985 && l > 0.15 && l < 3.5) || (glossAt(i) && mx >= 8 && cos > 0.96 && l < 3.5);
    else on = glossAt(i) && satOf([r, g, b]) < 0.2 && l > 0.19 && l < 4;
    if (!on) continue;
    mask[i] = 1; n++;
    // (the shading lifted at the dark end: 0 -> 0.55, 1 -> 1, lighter as it was)
    const s = Math.min(l, 2.2), s2 = s < 1 ? 0.55 + 0.45 * s : s;
    for (let k = 0; k < 3; k++) rgb[i * 3 + k] = srgb(refLin[k] * s2);
  }
  return { ref, refLum, sat, mask, rgb, kind, share: n / (W * H), cover: A / total };
}
const hex = (c) => '#' + c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');

async function texFiles(v, out) {
  const files = {};
  const body = v.parts.body[0], decal = v.parts.decal[0];
  const mat = body.matRef, base = mat.getBaseColorTexture(), mr = mat.getMetallicRoughnessTexture();
  // (the paint, measured on the full-size texture once)
  let pm = null;
  if (v.def.paint) {
    const r = await sharp(Buffer.from(base.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const mrFull = mr ? await sharp(Buffer.from(mr.getImage())).removeAlpha().resize(r.info.width, r.info.height, { kernel: 'nearest' }).raw().toBuffer() : null;
    if (mrFull) { mrFull.rf = mat.getRoughnessFactor(); mrFull.mf = mat.getMetallicFactor(); }
    pm = await paintMask(v, r.data, r.info.width, r.info.height, mrFull);
    if (pm) { pm.W = r.info.width; pm.H = r.info.height; }
    v.paint = pm && pm.mask ? { ref: hex(pm.ref), share: +pm.share.toFixed(3) } : null;
    console.log(v.id.padEnd(10), 'paint', pm ? `${hex(pm.ref)} sat ${pm.sat.toFixed(2)} lum ${pm.refLum.toFixed(3)} cover ${((pm.cover || 0) * 100).toFixed(0)}% ${pm.mask ? 'marked ' + (pm.share * 100).toFixed(1) + '% of the texture' : 'none marked'} (${pm.kind || '-'})` : 'none');
  }
  // (a separate wheel material, the passenger pack's: its own texture, ORM and all, the wheels drawn with it)
  const wmat = v.parts.wheel[0] && v.parts.wheel[0].matRef, wbase = wmat && wmat.getBaseColorTexture();
  for (const [tag, s] of [['', 1024], ['-lo', 512]]) {
    if (pm && pm.mask) {
      // (the mask at this size: a texel marked where most of the full-size texels under it are)
      const alpha = Buffer.alloc(s * s), fx = pm.W / s, fy = pm.H / s;
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        let n = 0, m = 0;
        for (let yy = Math.floor(y * fy); yy < Math.floor((y + 1) * fy); yy++) for (let xx = Math.floor(x * fx); xx < Math.floor((x + 1) * fx); xx++) { n++; m += pm.mask[yy * pm.W + xx]; }
        alpha[y * s + x] = m * 2 > n ? 128 : 255;
      }
      // (the colour resized on its own first: sharp's removeAlpha would otherwise drop the mask joined after it)
      // (from the paint's own colour written over its texels, pm.rgb)
      const rgb = await sharp(pm.rgb, { raw: { width: pm.W, height: pm.H, channels: 3 } }).resize(s, s, { kernel: 'lanczos3' }).raw().toBuffer();
      await sharp(rgb, { raw: { width: s, height: s, channels: 3 } }).joinChannel(alpha, { raw: { width: s, height: s, channels: 1 } })
        .webp({ quality: 85, effort: 6, alphaQuality: 100, exact: true }).toFile(`${out}/${v.id}${tag}.webp`);
    } else await sharp(Buffer.from(base.getImage())).removeAlpha().resize(s, s, { kernel: 'lanczos3' }).webp({ quality: 85, effort: 6 }).toFile(`${out}/${v.id}${tag}.webp`);
    if (wbase) {
      const ws = s / 2, wmr = wmat.getMetallicRoughnessTexture();
      await sharp(Buffer.from(wbase.getImage())).removeAlpha().resize(ws, ws, { kernel: 'lanczos3' }).webp({ quality: 85, effort: 6 }).toFile(`${out}/${v.id}-wheel${tag}.webp`);
      const mrW = wmr ? await sharp(Buffer.from(wmr.getImage())).removeAlpha().resize(ws / 2, ws / 2).raw().toBuffer() : null;
      const ow = Buffer.alloc((ws / 2) * (ws / 2) * 3), rfw = wmat.getRoughnessFactor(), mfw = wmat.getMetallicFactor();
      for (let i = 0; i < (ws / 2) * (ws / 2); i++) { ow[i * 3] = 255; ow[i * 3 + 1] = mrW ? Math.round(mrW[i * 3 + 1] * rfw) : Math.round(255 * rfw); ow[i * 3 + 2] = mrW ? Math.round(mrW[i * 3 + 2] * mfw) : Math.round(255 * mfw); }
      await sharp(ow, { raw: { width: ws / 2, height: ws / 2, channels: 3 } }).webp({ quality: 88 }).toFile(`${out}/${v.id}-wheel-orm${tag}.webp`);
      v.wheelTex = true;
    }
    if (wbase && !v.darkUV) {
      const r = await sharp(Buffer.from(base.getImage())).removeAlpha().resize(256, 256).raw().toBuffer();
      let best = 1e9, bi = 0; for (let i = 0; i < 256 * 256; i++) { const l = r[i * 3] + r[i * 3 + 1] + r[i * 3 + 2]; if (l < best) { best = l; bi = i; } }
      v.darkUV = [((bi % 256) + 0.5) / 256, (Math.floor(bi / 256) + 0.5) / 256];
    }
    // (ORM: no occlusion, the metal-rough's roughness (G) and metalness (B), times the material's factors)
    const mrImg = mr ? await sharp(Buffer.from(mr.getImage())).removeAlpha().resize(s / 2, s / 2).raw().toBuffer() : null;
    const o = Buffer.alloc((s / 2) * (s / 2) * 3);
    const rf = mat.getRoughnessFactor(), mf = mat.getMetallicFactor();
    for (let i = 0; i < (s / 2) * (s / 2); i++) { o[i * 3] = 255; o[i * 3 + 1] = mrImg ? Math.round(mrImg[i * 3 + 1] * rf) : Math.round(255 * rf); o[i * 3 + 2] = mrImg ? Math.round(mrImg[i * 3 + 2] * mf) : Math.round(255 * mf); }
    await sharp(o, { raw: { width: s / 2, height: s / 2, channels: 3 } }).webp({ quality: 88 }).toFile(`${out}/${v.id}-orm${tag}.webp`);
    // (decals are lettering: kept sharper than the body: half their own size at 512, all of it at 1024)
    if (decal) { const dt = decal.matRef.getBaseColorTexture(); const m = await sharp(Buffer.from(dt.getImage())).metadata(); const k = s / 1024; await sharp(Buffer.from(dt.getImage())).ensureAlpha().resize(Math.max(128, Math.round(m.width * k)), Math.max(64, Math.round(m.height * k))).webp({ quality: 90, alphaQuality: 95 }).toFile(`${out}/${v.id}-decal${tag}.webp`); }
    files[tag || 'hi'] = true;
  }
  return files;
}

async function finish(v) {
  const { prims, parts, wheels } = v;
  const body = new Bucket('body'), optics = new Bucket('optics'), glass = new Bucket('glass'), decal = new Bucket('decal');
  const wheelTris = new Map(); for (const k of wheels) for (const w of k.items) if (w.tris) { let s = wheelTris.get(w.p); if (!s) wheelTris.set(w.p, (s = new Set())); for (const t of w.tris) s.add(t); }
  for (const p of parts.body) {
    const skip = wheelTris.get(p);
    const tris = []; for (let t = 0; t < p.idx.length / 3; t++) if (!skip || !skip.has(t)) tris.push(t);
    body.add(p, { tris, fl: [0, 0, 0, 0] });
  }
  for (const p of parts.glass) glass.add(p, { fl: [0, 0, 1, FLAG.glass] });
  for (const p of parts.decal) decal.add(p, { fl: [0, 0, 0, 0] });
  // the lamps: by the optics texture's colour under each vertex (red: tail, amber: indicator, clear: head at the front,
  // reverse at the back), the lightbar's blue and red up top: a beacon
  const opt = parts.optics[0] && parts.optics[0].matRef.getBaseColorTexture();
  let img = null, W = 0, H = 0;
  if (opt) { const r = await sharp(Buffer.from(opt.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true }); img = r.data; W = r.info.width; H = r.info.height; }
  for (const p of parts.optics) {
    optics.add(p, { fl: (vi) => {
      const u = p.uv[vi * 2] - Math.floor(p.uv[vi * 2]), w = p.uv[vi * 2 + 1] - Math.floor(p.uv[vi * 2 + 1]);
      const o = (Math.min(H - 1, Math.floor(w * H)) * W + Math.min(W - 1, Math.floor(u * W))) * 3, r = img[o], g = img[o + 1], b = img[o + 2];
      const z = p.pos[vi * 3 + 2], y = p.pos[vi * 3 + 1];
      const top = y > v.bb.hi[1] - 0.45;
      let lamp = LAMP.none;
      if (top && (b > r * 1.3 || r > g * 2)) lamp = LAMP.beacon;
      else if (r > 120 && g < r * 0.55) lamp = z > 0 ? LAMP.blink : LAMP.tail;
      else if (r > 140 && g > r * 0.5 && g < r * 0.85 && b < g * 0.6) lamp = LAMP.blink;
      else if (r + g + b > 330) lamp = z > 0 ? LAMP.head : LAMP.reverse;
      // (the passenger pack's lenses drawn dark, a smoked tail or a black-rimmed head lamp, read as no colour: its optics
      // are its lamps alone, so one at the nose is a head lamp and one at the tail a tail lamp)
      if (lamp === LAMP.none && v.def.pack === 'passenger' && !top) lamp = z > v.bb.hi[2] - 0.7 ? LAMP.head : z < v.bb.lo[2] + 0.7 ? LAMP.tail : LAMP.none;
      return [0, lamp, 0, 0];
    } });
  }
  // wheels: each centred on its hub, the left ones as they are; the first front-left as the mesh (all wheels of a pack
  // vehicle are alike), its rear as another mesh if it differs (a truck's twin rear wheels)
  const wheelArrays = (k) => { const b = new Bucket('w'); for (const w of k.items) b.add(w.p, { tris: w.tris, fl: [0, 0, 0, FLAG.wheel] }); return transformArrays(b.arrays(), trans(-k.c[0], -k.c[1], -k.c[2])); };
  const left = wheels.filter((k) => k.c[0] > 0).sort((a, b) => b.c[2] - a.c[2]);
  const right = wheels.filter((k) => k.c[0] < 0);
  // (the left wheel kept as it is; a right one turned round to face +x if no left one exists)
  const WF = left[0] ? wheelArrays(left[0]) : transformArrays(wheelArrays(right.sort((a, b) => b.c[2] - a.c[2])[0]), rotY(Math.PI));
  const lastL = left[left.length - 1];
  const WR = lastL && lastL !== left[0] ? wheelArrays(lastL) : WF;
  const rOf = (k) => (k.hi[1] - k.lo[1]) / 2, wOf = (k) => k.hi[0] - k.lo[0];
  const sameRear = WR === WF || Math.abs(WR.idx.length - WF.idx.length) < 3;
  const bodyA = body.arrays(), glassA = glass.arrays(), opticsA = optics.arrays(), decalA = decal.arrays();
  // the far LODs: body and glass (dark), the wheels in place
  // (wheels of their own texture, v.wheelTex: in the far LODs, drawn with the body's, their uvs on its darkest texel)
  const darkUV = v.wheelTex ? v.darkUV : null;
  const placed = wheels.map((k) => { const src = k.c[2] > 0 || sameRear ? WF : WR; const a = transformArrays(src, mul(trans(k.c[0], k.c[1], k.c[2]), k.c[0] < 0 ? rotY(Math.PI) : rotY(0))); if (darkUV) { a.uv = new Float32Array(a.uv.length); for (let i = 0; i < a.uv.length; i += 2) { a.uv[i] = darkUV[0]; a.uv[i + 1] = darkUV[1]; } } return a; });   // (a copy: transformArrays shares the uvs)
  const farGlass = { ...glassA, fl: Uint8Array.from(glassA.fl) };
  const farBase = mergeArrays([bodyA, ...placed]);
  const lod1 = simplify(farBase, 3500, { error: 0.05 });
  let lod2 = simplify(farBase, 700, { error: 0.25 });
  if (lod2.idx.length / 3 > 1100) lod2 = simplify(farBase, 700, { error: 0.5, sloppy: true });
  const lod1g = simplify(farGlass, 120, { error: 0.1 });
  const bb = bounds([{ pos: bodyA.pos }]);
  const r3 = (x) => +x.toFixed(3);
  const fk = left[0] || right[0], rk = lastL || right[right.length - 1];
  const lampAt = (a, id) => { let x = 0, y = 0, z = 0, n = 0; for (let i = 0; i < a.pos.length / 3; i++) if (a.fl[i * 4 + 1] === id && a.pos[i * 3] > 0) { x += a.pos[i * 3]; y += a.pos[i * 3 + 1]; z += a.pos[i * 3 + 2]; n++; } return n ? [r3(x / n), r3(y / n), r3(z / n)] : null; };
  const meta = {
    id: v.id, length: r3(bb.s[2]), width: r3(bb.s[0]), height: r3(bb.hi[1]), zF: r3(bb.hi[2]), zR: r3(bb.lo[2]), hw: r3(Math.max(-bb.lo[0], bb.hi[0])),
    axle: r3((fk.c[2] - rk.c[2]) / 2),
    wheels: { front: { x: r3(Math.abs(fk.c[0])), y: r3(fk.c[1]), z: r3(fk.c[2]), r: r3(rOf(fk)), w: r3(wOf(fk)) }, rear: { x: r3(Math.abs(rk.c[0])), y: r3(rk.c[1]), z: r3(rk.c[2]), r: r3(rOf(rk)), w: r3(wOf(rk)) }, rearMesh: !sameRear,
      extra: wheels.filter((k) => k !== fk && k !== rk && k.c[0] > 0).map((k) => ({ x: r3(Math.abs(k.c[0])), y: r3(k.c[1]), z: r3(k.c[2]), rear: Math.abs(k.c[2] - rk.c[2]) < Math.abs(k.c[2] - fk.c[2]) })) },
    head: lampAt(opticsA, LAMP.head), tail: lampAt(opticsA, LAMP.tail),
    steer: v.def.drive ? steerOf(bodyA) : null, livery: null, open: false, paint: v.paint ? v.paint.ref : null, own: true, decal: decalA.idx.length > 0,
    ...(v.wheelTex ? { wheelTex: true } : {}), ...(v.paint ? { paintable: true } : {}),
    tris: { lod0: body.tris + glass.tris + optics.tris + decal.tris + wheels.reduce((s, k) => s + k.items.reduce((q, w) => q + (w.tris ? w.tris.length : w.p.idx.length / 3), 0), 0), body: body.tris, glass: glass.tris, optics: optics.tris, decal: decal.tris, wheel: WF.idx.length / 3, wheels: wheels.length, lod1: lod1.idx.length / 3 + lod1g.idx.length / 3, lod2: lod2.idx.length / 3 },
  };
  const meshes = [{ name: 'body', arrays: bodyA, mat: 'own' }, { name: 'glass', arrays: glassA, mat: 'glass' }, { name: 'optics', arrays: opticsA, mat: 'optics' }, { name: 'wheel', arrays: WF, mat: 'own' }];
  if (!sameRear) meshes.push({ name: 'wheelR', arrays: WR, mat: 'own' });
  if (decalA.idx.length) meshes.push({ name: 'decal', arrays: decalA, mat: 'decal' });
  meshes.push({ name: 'lod1', arrays: lod1, mat: 'own' }, { name: 'lod1glass', arrays: lod1g, mat: 'glass' }, { name: 'lod2', arrays: lod2, mat: 'own' });
  return { meta, meshes };
}

const docs = {};
for (const [k, f] of Object.entries(PACKS)) docs[k] = await io.read(join(SRC, f));
const metas = {};
const ids = ONLY ? ONLY.split(',') : Object.keys(C1280);
// the shared optics texture, once
{
  const p = extract(docs.civil, null, (path) => path.includes('citybus')).find((q) => /optics/i.test(q.mat));
  const t = p.matRef.getBaseColorTexture();
  for (const [tag, s] of [['', 512], ['-lo', 256]]) await sharp(Buffer.from(t.getImage())).removeAlpha().resize(s, s, { kernel: 'lanczos3' }).webp({ quality: 86 }).toFile(`${OUT}/c1280-optics${tag}.webp`);
}
for (const id of ids) {
  const def = C1280[id]; if (!def) continue;
  const v = await buildOne(id, def, docs);
  await texFiles(v, OUT);
  const { meta, meshes } = await finish(v);
  const glb = await writeGLB(null, meshes, { fleet: meta });
  writeFileSync(join(OUT, id + '.glb'), glb);
  const src = readFileSync(join(SRC, PACKS[def.pack]));
  meta.bytes = glb.length; meta.sha256 = sha256(glb); meta.source = { file: PACKS[def.pack], sha256: sha256(src), bytes: src.length }; meta.part = def.root;
  metas[id] = meta;
  console.log(id.padEnd(10), `${(glb.length / 1024).toFixed(0)} KB`, `L ${meta.length} W ${meta.width} H ${meta.height} axle ${meta.axle} wheels ${meta.tris.wheels} (axles at ${v.axleZ.join(',')})`, `tris lod0 ${meta.tris.lod0} lod1 ${meta.tris.lod1} lod2 ${meta.tris.lod2}`, 'head', JSON.stringify(meta.head), 'tail', JSON.stringify(meta.tail));
}
writeFileSync(join(OUT, 'c1280-meta.json'), JSON.stringify(metas, null, 1));
