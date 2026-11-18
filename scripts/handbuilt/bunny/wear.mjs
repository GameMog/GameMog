// Hand-built Bunny Ferraby (Pickup Time's loan shark, 58), what she wears: a plum velour tracksuit, made from the forge's
// uniform jacket (clean long sleeves, a stand collar and a hem band on a woman, Agnes's base) and its track pants, by paint
// and relief only:
//  jacketPass  the jacket's shell and hem band a crushed plum velour (a slow nap that turns lighter and darker, a fine pile,
//              a soft sheen: KHR_materials_sheen), a zip down the centre front (dark tape, small silver teeth), two cream
//              stripes along the top of each sleeve, ribbed cuffs and a ribbed hem band
//  collarPass  the stand collar the same plum in a fine rib, the zip carried up its front
//  buttonsPass the uniform's buttons gone (a track jacket zips), one small silver zip pull at the collar
//  pantsPass   the track pants re-dyed the jacket's plum velour, their side stripes cream, the same sheen
//  hairPass    the forge's ash curls re-ramped to a silver-blonde: an ash-gold root, silver lengths, pale gold tips
import { prim, matOf, raster, rgba, setWebp, sharp, h3, fbm, sm, clamp, require } from '../young-hero/glb.mjs';
const { KHRMaterialsSheen } = require('@gltf-transform/extensions');

export const PLUM = [60, 24, 66];
const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));
function texAttr(p, S, name) {
  const A = p.getAttribute(name), a = A.getArray(), sc = A.getNormalized() ? (a instanceof Int8Array ? 127 : a instanceof Int16Array ? 32767 : 1) : 1;
  const uv = p.getAttribute('TEXCOORD_0').getArray(), idx = [...p.getIndices().getArray()], out = new Float32Array(S * S * 3).fill(NaN);
  raster(idx, (v) => [uv[v * 2] * S, uv[v * 2 + 1] * S], S, (x, y, l1, l2, l3, i0, i1, i2) => { const k = (y * S + x) * 3; for (let c = 0; c < 3; c++) out[k + c] = (l1 * a[i0 * 3 + c] + l2 * a[i1 * 3 + c] + l3 * a[i2 * 3 + c]) / sc; }, 0.03);
  return out;
}
const toNormalMap = async (hgt, S, K2) => { const nm = Buffer.alloc(S * S * 3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = y * S + x, hx = (hgt[y * S + Math.min(S - 1, x + 1)] - hgt[y * S + Math.max(0, x - 1)]) / 2, hy = (hgt[Math.min(S - 1, y + 1) * S + x] - hgt[Math.max(0, y - 1) * S + x]) / 2;
    const nx = -hx * K2, ny = hy * K2, l = Math.hypot(nx, ny, 1); nm[i * 3] = Math.round((nx / l * 0.5 + 0.5) * 255); nm[i * 3 + 1] = Math.round((ny / l * 0.5 + 0.5) * 255); nm[i * 3 + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); }
  return sharp(nm, { raw: { width: S, height: S, channels: 3 } }).webp({ quality: 88, effort: 5 }).toBuffer(); };
// (off the islands: grown out so the mips never pull another colour in at a seam)
function bleed(out, P, S) { const N2 = S * S, on = new Uint8Array(N2); for (let i = 0; i < N2; i++) on[i] = Number.isNaN(P[i * 3]) ? 0 : 1;
  for (let it = 0; it < 6; it++) { const add = []; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = y * S + x; if (on[i]) continue; let n = 0; const s = [0, 0, 0];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue; const j = yy * S + xx; if (!on[j]) continue; n++; for (let k = 0; k < 3; k++) s[k] += out[j * 4 + k]; }
      if (n) add.push([i, s.map((v) => Math.round(v / n))]); } for (const [i, c3] of add) { on[i] = 1; for (let k = 0; k < 3; k++) out[i * 4 + k] = c3[k]; } } }
// the velour: a crushed nap (slow patches a shade lighter or darker, as pile laid different ways catches the sun) over a
// fine pile grain
const velour = (base, x, y, z) => { const nap = fbm(x, y, z, 9) - 0.5, crush = fbm(x + 3.1, y, z, 26) - 0.5, pile = h3(Math.floor(x / 0.0009), Math.floor(y / 0.0009), Math.floor(z / 0.0009)) - 0.5;
  const k = 1 + 0.2 * nap + 0.12 * crush + 0.05 * pile; return base.map((v) => v * k); };
function sheen(doc, mat, col = [0.13, 0.065, 0.14], r = 0.65) {
  const ext = doc.createExtension(KHRMaterialsSheen), s = ext.createSheen().setSheenColorFactor(col).setSheenRoughnessFactor(r); mat.setExtension('KHR_materials_sheen', s);
}
const ZIP = { tape: 0.0045, teeth: 0.0017 };
function zipAt(x0, y, c, h, plum) { // the zip at the centre front: tape each side, the teeth a silver ladder in the middle
  const x = Math.abs(x0); if (x > ZIP.tape) return null;
  if (x < ZIP.teeth) { const tooth = Math.floor(y / 0.0021 + (x0 > 0 ? 0.5 : 0)) % 2 === 0; const v = tooth ? 0.42 : 0.12; return { c: [v, v * 0.98, v * 1.02], h: tooth ? 0.8 : 0.2, metal: true }; }
  return { c: plum.map((v) => v * 0.55), h: 0.35 + 0.1 * Math.sin((y * 2 * Math.PI) / 0.0012) }; }

function jacketPaint(p, S, K, part) {
  const P = texAttr(p, S, 'POSITION'), Nt = texAttr(p, S, 'NORMAL'), N2 = S * S, out = Buffer.alloc(N2 * 4), hgt = new Float32Array(N2), rough = Buffer.alloc(N2 * 3), base = K.col.map(lin);
  let xmax = 0; for (let i = 0; i < N2; i++) if (!Number.isNaN(P[i * 3])) xmax = Math.max(xmax, Math.abs(P[i * 3]));
  const cream = K.stripe.map(lin); let nStripe = 0, nZip = 0;
  for (let i = 0; i < N2; i++) {
    const x0 = P[i * 3]; out[i * 4 + 3] = 255; rough[i * 3 + 1] = 210; if (Number.isNaN(x0)) continue;
    const x = Math.abs(x0), y = P[i * 3 + 1], z = P[i * 3 + 2];
    let c = velour(base, x0, y, z), h = 0.12 * (fbm(x0, y, z, 40) - 0.5), rg = 0.82;
    // ribbed cuffs (the last few cm of each sleeve) and the hem band: a firmer rib a touch darker, matte
    const cuff = part === 'shell' ? sm(xmax - K.cuff - 0.003, xmax - K.cuff + 0.003, x) * (x > 0.26 ? 1 : 0) : 0, hem = part === 'hem' ? 1 : 0, rib = Math.max(cuff, hem);
    if (rib > 0) { const along = cuff > hem ? y * 0.7 + z * 0.7 : x0; h = h * (1 - rib) + rib * 0.6 * Math.sin((along * 2 * Math.PI) / 0.0035) ** 2; c = base.map((v, k) => c[k] * (1 - rib) + v * 0.86 * rib); rg = 0.82 + 0.1 * rib; }
    // the sleeves' two cream stripes along the top of the arm (the arm's outer side faces up and out in the bind pose),
    // from the shoulder seam to the cuff
    if (part === 'shell' && x > K.sleeveX && !cuff) { const nx = Nt[i * 3] * Math.sign(x0), ny = Nt[i * 3 + 1], nz = Nt[i * 3 + 2], up = nx * 0.45 + ny * 0.9;
      if (up > 0.6) { const a = Math.abs(nz), s1 = sm(K.s0 - 0.02, K.s0, a) * sm(K.s1 + 0.02, K.s1, a); if (s1 > 0.01) { c = c.map((v, k) => v * (1 - s1) + cream[k] * (0.95 + 0.05 * (fbm(x0, y, z, 30) - 0.5)) * s1); h = h * (1 - s1) + 0.25 * s1; nStripe++; } } }
    // the zip, centre front, from the hem band to the collar
    let metal = 0;
    if (z > 0.03 && x < 0.01) { const zp = zipAt(x0, y, c, h, base); if (zp) { c = zp.c; h = zp.h; if (zp.metal) { metal = 1; rg = 0.35; } nZip++; } }
    out[i * 4] = enc(c[0]); out[i * 4 + 1] = enc(c[1]); out[i * 4 + 2] = enc(c[2]); hgt[i] = h; rough[i * 3 + 1] = Math.round(rg * 255); rough[i * 3 + 2] = metal ? 230 : 0;
  }
  bleed(out, P, S);
  return { out, hgt, rough, nStripe, nZip };
}
export async function jacketPass(doc, K = {}) {
  K = { col: PLUM, stripe: [232, 226, 214], cuff: 0.045, sleeveX: 0.2, s0: 0.05, s1: 0.13, ...K };
  for (const [name, part] of [['uniform', 'shell'], ['uniform-hem', 'hem']]) {
    const p = prim(doc, name)[0]; if (!p) continue; const mat = p.getMaterial(), S = name === 'uniform' ? 2048 : 1024;
    const { out, hgt, rough, nStripe, nZip } = jacketPaint(p, S, K, part);
    const t = doc.createTexture(name + '-velour'); await setWebp(t, out, S, S, 90); mat.setBaseColorTexture(t);
    const nt = doc.createTexture(name + '-velour-normal'); nt.setImage(await toNormalMap(hgt, S, 0.9)).setMimeType('image/webp'); mat.setNormalTexture(nt); mat.getNormalTextureInfo().setTexCoord(0);
    const rt = doc.createTexture(name + '-velour-mr'); await setWebp(rt, rough, S, S, 85, 3); mat.setMetallicRoughnessTexture(rt);
    mat.setRoughnessFactor(1).setMetallicFactor(1).setBaseColorFactor([1, 1, 1, 1]); sheen(doc, mat);
    if (mat.getExtension('KHR_materials_specular')) mat.setExtension('KHR_materials_specular', null);
    console.log('velour', name, S, 'stripe texels', nStripe, 'zip texels', nZip);
  }
}
export async function collarPass(doc, K = {}) {
  K = { col: PLUM, ...K };
  const p = prim(doc, 'uniform-collar')[0]; if (!p) return; const mat = p.getMaterial(), S = 512, P = texAttr(p, S, 'POSITION'), out = Buffer.alloc(S * S * 4), hgt = new Float32Array(S * S), base = K.col.map(lin);
  let zc = 0, n0 = 0; for (let i = 0; i < S * S; i++) if (!Number.isNaN(P[i * 3])) { zc += P[i * 3 + 2]; n0++; } zc /= n0;
  for (let i = 0; i < S * S; i++) { out[i * 4 + 3] = 255; const x0 = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; if (Number.isNaN(x0)) continue;
    const th = Math.atan2(x0, z - zc), rib = 0.92 + 0.08 * Math.sin(th * 150); let c = velour(base, x0, y, z).map((v) => v * rib * 0.95), h = 0.4 * Math.sin(th * 150) ** 2;
    if (z > zc && Math.abs(x0) < 0.0045) { const zp = zipAt(x0, y, c, h, base); if (zp) { c = zp.c; h = zp.h; } }
    // (the band's top edge and inside (its uv rows past 0.44): a shade darker, the inside of a rib collar, not lit cloth)
    const vv = Math.floor(i / S) / S; if (vv > 0.44) c = c.map((q) => q * 0.5);
    for (let k = 0; k < 3; k++) out[i * 4 + k] = enc(c[k]); hgt[i] = h; }
  bleed(out, P, S);
  const tx = doc.createTexture('collar-velour'); await setWebp(tx, out, S, S, 90); mat.setBaseColorTexture(tx).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.85).setMetallicFactor(0);
  const nt = doc.createTexture('collar-velour-normal'); nt.setImage(await toNormalMap(hgt, S, 0.8)).setMimeType('image/webp'); mat.setNormalTexture(nt); mat.getNormalTextureInfo().setTexCoord(0);
  if (mat.getMetallicRoughnessTexture()) mat.setMetallicRoughnessTexture(null); if (mat.getExtension('KHR_materials_specular')) mat.setExtension('KHR_materials_specular', null); // (no sheen on the band: its rows at a grazing angle lit up as pale stripes)
}
export function buttonsPass(doc) { // (a track jacket has no buttons: the uniform's buttons taken off; the zip is painted)
  const m = matOf(doc, 'uniform-buttons'); if (!m) return; const gone = new Set();
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) if (p.getMaterial() === m) { gone.add(p.getIndices()); for (const a of p.listAttributes()) gone.add(a); mesh.removePrimitive(p); p.dispose(); }
  for (const a of gone) if (a && !a.listParents().some((x) => x.propertyType !== 'Root')) a.dispose();
  for (const mesh of doc.getRoot().listMeshes()) if (!mesh.listPrimitives().length) { for (const n of mesh.listParents()) if (n.propertyType === 'Node') n.setMesh(null); mesh.dispose(); }
  m.dispose(); console.log('buttons removed');
}
export async function pantsPass(doc, K = {}) {
  K = { col: PLUM, stripe: [232, 226, 214], ...K };
  const p = prim(doc, 'clothes')[0], mat = p.getMaterial(), tex = mat.getBaseColorTexture(), img = await rgba(tex), S = img.w, d = img.data, P = texAttr(p, S, 'POSITION'), base = K.col.map(lin), cream = K.stripe.map(lin);
  let sL = 0, nL = 0; for (let i = 0; i < S * S; i++) if (!Number.isNaN(P[i * 3])) { const L = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3; if (L < 150) { sL += L; nL++; } } const mL = sL / Math.max(1, nL);
  let nS = 0;
  for (let i = 0; i < S * S; i++) { const L = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3, x0 = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const st = sm(140, 175, L), fold = Math.pow(clamp(L / mL, 0.5, 1.4), 0.6), v = Number.isNaN(x0) ? base : velour(base, x0, y, z);
    const c = v.map((q, k) => q * fold * (1 - st) + cream[k] * st); if (st > 0.5) nS++;
    for (let k = 0; k < 3; k++) d[i * 4 + k] = enc(c[k]); }
  await setWebp(tex, d, S, S, 88); mat.setRoughnessFactor(0.84).setMetallicFactor(0).setBaseColorFactor([1, 1, 1, 1]); sheen(doc, mat);
  console.log('pants velour, stripe texels', nS, 'of', S * S, 'mean L', mL.toFixed(0));
}
export async function hairPass(doc, K = {}) {
  K = { root: [120, 96, 66], mid: [186, 170, 142], hi: [236, 216, 172], rough: 0.55, ...K };
  const mat = matOf(doc, 'hair'), tex = mat.getBaseColorTexture(), { data, w, h } = await rgba(tex), Ls = [];
  for (let i = 0; i < w * h; i += 5) if (data[i * 4 + 3] > 80) Ls.push((data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3); Ls.sort((a, b) => a - b);
  const lo = Ls[Math.floor(Ls.length * 0.04)], hi = Ls[Math.floor(Ls.length * 0.97)];
  for (let i = 0; i < w * h; i++) { const L = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3, x = i % w, y = Math.floor(i / w), st = h3(Math.floor(x / 3), 5, 11) - 0.5;
    const t = clamp((L - lo) / Math.max(1, hi - lo) + 0.14 * st), c = t < 0.5 ? K.root.map((r, k) => r + (K.mid[k] - r) * (t / 0.5)) : K.mid.map((m, k) => m + (K.hi[k] - m) * ((t - 0.5) / 0.5));
    for (let k = 0; k < 3; k++) data[i * 4 + k] = clamp(Math.round(c[k]), 0, 255); }
  await setWebp(tex, data, w, h, 88); mat.setRoughnessFactor(K.rough).setBaseColorFactor([1, 1, 1, 1]);
  console.log('hair silver-blonde, L range', lo, hi);
}
// the fringe off her eyes: the forge's short-curly cut hung its front strands over her right eye, and in the game's
// seated close-ups (looking down a little) it hid the eye and half the brow. Every hair point in front of the face and
// under the brows' top is lifted to it (a soft field, so the strands curve up and aside over the forehead, not cut), and
// eased a few millimetres toward the temple it falls to
export function fringePass(doc, LM, K = {}) {
  K = { top: 0.03, w: 0.07, side: 0.006, ...K };
  const p = prim(doc, 'hair')[0], A = p.getAttribute('POSITION'), a = A.getArray().slice(), used = [...new Set(p.getIndices().getArray())]; let n = 0;
  const yT = LM.EY + K.top;
  for (const v of used) { const x = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2]; if (z < LM.EZ - 0.03 || Math.abs(x) > K.w || y > yT + 0.02) continue;
    const front = sm(LM.EZ - 0.03, LM.EZ - 0.005, z) * sm(K.w, K.w - 0.02, Math.abs(x)); if (front <= 0) continue;
    const lift = Math.max(0, yT - y) * front, rise = sm(yT + 0.02, yT, y) * front; a[v * 3 + 1] = y + lift + 0.002 * rise; a[v * 3] = x + Math.sign(x || 1) * K.side * rise; a[v * 3 + 2] = z + 0.003 * rise; n++; }
  A.setArray(a); console.log('fringe lifted: points', n);
}
