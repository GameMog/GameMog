// Hand-built Agnes, what she wears: the forged long-sleeve top made a nanny's cardigan over a blouse, by paint and
// relief only (no new geometry: the forge's coats tore on her: white wedges at the collar, a padded belly, lumps).
//  cardigan  the top's cloth painted from each texel's place on her (the bind pose): a fine heathered knit in a soft
//            navy, a V opening from the neck to under the bust showing a cream blouse with a soft collar edge, a
//            button band down the front with six small horn buttons, ribbed cuffs and hem; knit ribs and the band's
//            edge in a new normal map; matte
//  neckline  the forge's bound neckline (a narrow band round the neck) the blouse's cream: it reads as the blouse's collar
//  trousers  the loose trousers a little darker and flatter (pressed wool slacks)
//  shoes     the dress shoes a dark brown, a soft sheen
import { prim, matOf, raster, rgba, setWebp, sharp, sm, h3, fbm, clamp } from '../young-hero/glb.mjs';

function texPos(p, S) {
  const a = p.getAttribute('POSITION').getArray(), uv = p.getAttribute('TEXCOORD_0').getArray(), idx = [...p.getIndices().getArray()], out = new Float32Array(S * S * 3).fill(NaN);
  raster(idx, (v) => [uv[v * 2] * S, uv[v * 2 + 1] * S], S, (x, y, l1, l2, l3, i0, i1, i2) => { const k = (y * S + x) * 3; for (let c = 0; c < 3; c++) out[k + c] = l1 * a[i0 * 3 + c] + l2 * a[i1 * 3 + c] + l3 * a[i2 * 3 + c]; }, 0.03);
  return out;
}
const toNormalMap = async (hgt, S, K2) => { const nm = Buffer.alloc(S * S * 3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = y * S + x, hx = (hgt[y * S + Math.min(S - 1, x + 1)] - hgt[y * S + Math.max(0, x - 1)]) / 2, hy = (hgt[Math.min(S - 1, y + 1) * S + x] - hgt[Math.max(0, y - 1) * S + x]) / 2;
    const nx = -hx * K2, ny = hy * K2, l = Math.hypot(nx, ny, 1); nm[i * 3] = Math.round((nx / l * 0.5 + 0.5) * 255); nm[i * 3 + 1] = Math.round((ny / l * 0.5 + 0.5) * 255); nm[i * 3 + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); }
  return sharp(nm, { raw: { width: S, height: S, channels: 3 } }).webp({ quality: 88, effort: 5 }).toBuffer(); };
const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));

// her measures (forge base: neck joint 1.4215, the top from 0.964 to 1.4335, the shoulders' joints at x 0.147)
export const CARD = { neck: 1.425, vBottom: 1.215, vTop: 0.042, hem: 0.964, band: 0.011, hemRib: 0.035, cuffRib: 0.04 };
export async function cardiganPass(doc, K = {}) {
  K = { knit: [44, 54, 78], blouse: [236, 230, 216], button: [96, 74, 56], S: 1024, ...K };
  const p = prim(doc, 'clothes')[0], mat = p.getMaterial(), S = K.S, P = texPos(p, S), N2 = S * S;
  const C = CARD, out = Buffer.alloc(N2 * 4), hgt = new Float32Array(N2);
  // the arm's direction for the cuffs: a sleeve texel's distance from the wrist joints' height is not enough (the arms hang
  // out at the A-pose), so cuffs are the last cuffRib of the sleeve measured along x from the hand end
  let xmax = 0; for (let i = 0; i < N2; i++) if (!Number.isNaN(P[i * 3])) xmax = Math.max(xmax, Math.abs(P[i * 3]));
  const half = (y) => C.vTop * sm(C.vBottom, C.neck, y) ** 0.9; // the V's half-width at y
  const kn = K.knit.map(lin), bl = K.blouse.map(lin), bt = K.button.map(lin);
  let nV = 0;
  for (let i = 0; i < N2; i++) {
    const x0 = P[i * 3]; if (Number.isNaN(x0)) { out[i * 4 + 3] = 255; continue; }
    const x = Math.abs(x0), y = P[i * 3 + 1], z = P[i * 3 + 2], front = z > 0.02 && x < 0.16;
    // knit: a heather, fine vertical ribs (stitch columns ~3 mm), courses faint
    const col = Math.floor((x0 + 1) / 0.003), heather = h3(col, Math.floor(y / 0.0025), Math.floor(z / 0.003)), slow = fbm(x0, y, z, 25) - 0.5;
    let c = kn.map((v, k) => v * (0.9 + 0.16 * heather + 0.12 * slow) * (k === 2 ? 1.02 : 1));
    let h = 0.25 * Math.sin((x0 * 2 * Math.PI) / 0.003) ** 2 + 0.06 * Math.sin((y * 2 * Math.PI) / 0.0025);
    // ribbed hem and cuffs: wider ribs, a step at their top edge
    const hemR = sm(C.hem + C.hemRib + 0.002, C.hem + C.hemRib - 0.002, y), cuffR = sm(xmax - C.cuffRib - 0.003, xmax - C.cuffRib + 0.003, x) * (x > 0.25 ? 1 : 0);
    const rib = Math.max(hemR, cuffR); if (rib > 0) { h = h * (1 - rib) + rib * (0.6 * Math.sin((((cuffR > hemR ? y + z : x0) * 2 * Math.PI) / 0.004)) ** 2); c = c.map((v) => v * (1 - 0.08 * rib)); }
    if (front) {
      const hv = half(y), inV = y > C.vBottom && x < hv;
      if (inV) { // the blouse: a smooth cream cotton, a soft fold or two, its collar edge a shade darker near the knit
        const e = sm(hv - 0.004, hv, x); c = bl.map((v) => v * (0.94 + 0.05 * (fbm(x0, y, z, 30) - 0.5)) * (1 - 0.1 * e)); h = 0.1 * (fbm(x0, y, z, 60) - 0.5); nV++;
        // a button of the blouse at the V's bottom
        const bd = Math.hypot(x0, y - (C.vBottom + 0.03)); if (bd < 0.0045) { c = [lin(240), lin(236), lin(226)]; h = 0.9 * sm(0.0045, 0.002, bd); }
      } else {
        // the button band: 11 mm each side of the opening line (the V's edge above, the midline below), a plain knit, raised
        const edgeX = y > C.vBottom ? hv : 0, d = Math.abs(x - edgeX), inBand = y > C.vBottom ? x > hv && x < hv + C.band * 1.2 : d < C.band;
        if (inBand) { c = kn.map((v) => v * 0.92); h = 0.55 + 0.1 * Math.sin((y * 2 * Math.PI) / 0.0025); if (y <= C.vBottom && d < 0.0012) { h = 0; c = c.map((v) => v * 0.55); } // (the front's parting line)
          if (y > C.vBottom && Math.abs(x - hv - C.band * 1.2) < 0.0012) h = 0.2; }
        // buttons down the band below the V: 5, every 5 cm, plus one at the V's bottom
        if (y < C.vBottom + 0.003 && y > C.hem + C.hemRib) { const k = Math.round((C.vBottom - y) / 0.05), by = C.vBottom - k * 0.05, bd = Math.hypot(x0 - 0.0035, y - by);
          if (k >= 0 && k <= 4 && bd < 0.0062) { const r = bd / 0.0062; c = bt.map((v) => v * (0.85 + 0.3 * (1 - r) + 0.1 * h3(Math.floor(x0 * 4000), Math.floor(y * 4000), 3))); h = 1.2 * Math.sqrt(Math.max(0, 1 - r * r)); if (Math.hypot(Math.abs(x0 - 0.0035) - 0.0014, y - by) < 0.0007) c = c.map((v) => v * 0.4); } }
      }
    }
    out[i * 4] = enc(c[0]); out[i * 4 + 1] = enc(c[1]); out[i * 4 + 2] = enc(c[2]); out[i * 4 + 3] = 255; hgt[i] = h;
  }
  // (off the islands: grown out so the mips never pull another colour in at a seam)
  { const on = new Uint8Array(N2); for (let i = 0; i < N2; i++) on[i] = Number.isNaN(P[i * 3]) ? 0 : 1;
    for (let it = 0; it < 6; it++) { const add = []; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = y * S + x; if (on[i]) continue; let n = 0; const s = [0, 0, 0];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue; const j = yy * S + xx; if (!on[j]) continue; n++; for (let k = 0; k < 3; k++) s[k] += out[j * 4 + k]; }
        if (n) add.push([i, s.map((v) => Math.round(v / n))]); } for (const [i, c3] of add) { on[i] = 1; for (let k = 0; k < 3; k++) out[i * 4 + k] = c3[k]; } } }
  const tex = mat.getBaseColorTexture(); await setWebp(tex, out, S, S, 90);
  const nt = doc.createTexture('cardigan-normal'); nt.setImage(await toNormalMap(hgt, S, 1.1)).setMimeType('image/webp'); mat.setNormalTexture(nt); mat.getNormalTextureInfo().setTexCoord(0);
  mat.setRoughnessFactor(0.94).setBaseColorFactor([1, 1, 1, 1]);
  console.log('cardigan: blouse texels', nV);
}
export async function necklinePass(doc, K = {}) {
  const m = matOf(doc, 'neckline'); if (!m) return; const tex = m.getBaseColorTexture(), { data, w, h } = await rgba(tex);
  for (let i = 0; i < w * h; i++) { const n = (h3(i % w, Math.floor(i / w), 1) - 0.5) * 6; data[i * 4] = 232 + n; data[i * 4 + 1] = 226 + n; data[i * 4 + 2] = 212 + n; }
  await setWebp(tex, data, w, h, 90); m.setRoughnessFactor(0.85);
}
export async function trousersPass(doc, K = {}) {
  const m = matOf(doc, 'loose-trousers'); if (!m) return; m.setBaseColorFactor([0.88, 0.88, 0.9, 1]).setRoughnessFactor(0.9);
}
export async function shoesPass(doc, K = {}) {
  const m = matOf(doc, 'shoes'); if (!m) return; m.setBaseColorFactor([0.2, 0.15, 0.12, 1]).setRoughnessFactor(0.42);
}

// (round 2: the forge's uniform jacket is her base top: long sleeves, a button front, a stand collar and a hem band, all
// clean in daylight. It is repainted here as a nanny's cardigan over a blouse)
//  knitPass  the jacket's shell and its hem band a fine heathered navy knit: stitch columns ~3 mm, faint courses, a soft
//            slow heather; ribbed cuffs (the last 4 cm of each sleeve) and a ribbed hem band; a plain button band down
//            the front (11 mm each side of the parting); matte, a knit normal map
//  collar    the stand collar a cream cotton blouse collar, soft, with a faint stitched edge
//  buttons   small horn buttons, warm brown, a little sheen
function texNrm(p, S) {
  const a0 = p.getAttribute('NORMAL'), a = a0.getArray(), sc = a0.getNormalized() ? (a instanceof Int8Array ? 127 : 32767) : 1, uv = p.getAttribute('TEXCOORD_0').getArray(), idx = [...p.getIndices().getArray()], out = new Float32Array(S * S * 3);
  raster(idx, (v) => [uv[v * 2] * S, uv[v * 2 + 1] * S], S, (x, y, l1, l2, l3, i0, i1, i2) => { const k = (y * S + x) * 3; for (let c = 0; c < 3; c++) out[k + c] = (l1 * a[i0 * 3 + c] + l2 * a[i1 * 3 + c] + l3 * a[i2 * 3 + c]) / sc; }, 0.03);
  return out;
}
function knitPaint(p, S, K, part) {
  const Nt = K.neck ? texNrm(p, S) : null;
  const P = texPos(p, S), N2 = S * S, out = Buffer.alloc(N2 * 4), hgt = new Float32Array(N2), kn = K.knit.map(lin);
  let xmax = 0; for (let i = 0; i < N2; i++) if (!Number.isNaN(P[i * 3])) xmax = Math.max(xmax, Math.abs(P[i * 3]));
  for (let i = 0; i < N2; i++) {
    const x0 = P[i * 3]; out[i * 4 + 3] = 255; if (Number.isNaN(x0)) continue;
    const x = Math.abs(x0), y = P[i * 3 + 1], z = P[i * 3 + 2];
    const col = Math.floor((x0 + 1) / 0.003), heather = h3(col, Math.floor(y / 0.0025), Math.floor(z / 0.003)), slow = fbm(x0, y, z, 22) - 0.5;
    let c = kn.map((v, k) => v * (0.9 + 0.14 * heather + 0.12 * slow) * (k === 2 ? 1.02 : 1));
    let h = 0.22 * Math.sin((x0 * 2 * Math.PI) / 0.003) ** 2 + 0.05 * Math.sin((y * 2 * Math.PI) / 0.0025);
    const cuff = part === 'shell' ? sm(xmax - K.cuff - 0.003, xmax - K.cuff + 0.003, x) * (x > 0.28 ? 1 : 0) : 0, hem = part === 'hem' ? 1 : 0, rib = Math.max(cuff, hem);
    if (rib > 0) { const along = cuff > hem ? y * 0.7 + z * 0.7 : x0; h = h * (1 - rib) + rib * 0.7 * Math.sin((along * 2 * Math.PI) / 0.004) ** 2; c = c.map((v) => v * (1 - 0.07 * rib)); }
    if (part === 'shell' && z > 0.03 && x < 0.03 && y < K.neck) { const band = sm(K.band + 0.001, K.band - 0.001, x); if (band > 0) { h = h * (1 - band) + band * (0.5 + 0.08 * Math.sin((y * 2 * Math.PI) / 0.0025)); c = c.map((v) => v * (1 - 0.05 * band)); }
      if (x < 0.0009) { h = 0; c = c.map((v) => v * 0.6); } if (Math.abs(x - K.band) < 0.0008) h = 0.15; }
    // (round 3) the blouse's Peter Pan collar, painted lying on the cardigan below its smoothed neckline: within W of the
    // neckline (two rounded lobes meeting at the front), a soft 1.5 mm edge, a stitch line 3.5 mm in, a raised relief
    if (part === 'shell' && K.neck && K.neck.length && y > 1.2) { let d = 9; for (const q of K.neck) { const e = Math.hypot(q[0] - x0, q[1] - y, q[2] - z); if (e < d) d = e; }
      const th = Math.atan2(x0, z - K.neckZ), at = Math.abs(th), W = K.collarW * (at < K.lobe ? Math.sqrt(Math.max(0.0, 1 - (1 - at / K.lobe) ** 2)) : 1);
      const out_ = Nt[i * 3] * x0 + Nt[i * 3 + 1] * 0.05 + Nt[i * 3 + 2] * (z - K.neckZ), inC = sm(W + 0.0008, W - 0.0008, d) * (out_ > 0 ? 1 : 0); if (inC > 0) { /* (the outside only: the inside panel keeps the knit) */ const bl = K.blouse.map(lin), sh = 0.94 + 0.05 * (fbm(x0, y, z, 30) - 0.5) - 0.08 * sm(W - 0.008, W, d), st = Math.abs(d - (W - 0.0035)) < 0.0004 && Math.floor((th * 0.06 + d) / 0.0025 + x0 / 0.0025) % 2 === 0 ? 0.82 : 1;
        c = c.map((v, k) => v * (1 - inC) + bl[k] * sh * st * inC); h = h * (1 - inC) + inC * (0.8 - 0.4 * sm(W - 0.004, W, d)); } }
    out[i * 4] = enc(c[0]); out[i * 4 + 1] = enc(c[1]); out[i * 4 + 2] = enc(c[2]); hgt[i] = h;
  }
  { const on = new Uint8Array(N2); for (let i = 0; i < N2; i++) on[i] = Number.isNaN(P[i * 3]) ? 0 : 1;
    for (let it = 0; it < 6; it++) { const add = []; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = y * S + x; if (on[i]) continue; let n = 0; const s = [0, 0, 0];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue; const j = yy * S + xx; if (!on[j]) continue; n++; for (let k = 0; k < 3; k++) s[k] += out[j * 4 + k]; }
        if (n) add.push([i, s.map((v) => Math.round(v / n))]); } for (const [i, c3] of add) { on[i] = 1; for (let k = 0; k < 3; k++) out[i * 4 + k] = c3[k]; } } }
  return { out, hgt };
}
export async function knitPass(doc, K = {}) {
  K = { knit: [40, 50, 74], cuff: 0.045, band: 0.011, neck: 1.37, collarW: 0.042, lobe: 0.55, blouse: [236, 230, 216], ...K };
  if (K.neckPts) { K.neck = K.neckPts; K.neckZ = K.neck.reduce((s, q) => s + q[2], 0) / K.neck.length; }
  for (const [name, part] of [['uniform', 'shell'], ['uniform-hem', 'hem']]) {
    const p = prim(doc, name)[0]; if (!p) continue; const mat = p.getMaterial(), tex = mat.getBaseColorTexture(), S = 1024;
    const { out, hgt } = knitPaint(p, S, K, part);
    let t = tex; if (!t || t.listParents().filter((x) => x.propertyType === 'Material').length > 1) { t = doc.createTexture(name + '-knit'); mat.setBaseColorTexture(t); }
    await setWebp(t, out, S, S, 90);
    const nt = doc.createTexture(name + '-knit-normal'); nt.setImage(await toNormalMap(hgt, S, 1.0)).setMimeType('image/webp'); mat.setNormalTexture(nt); mat.getNormalTextureInfo().setTexCoord(0);
    mat.setRoughnessFactor(0.95).setMetallicFactor(0).setBaseColorFactor([1, 1, 1, 1]);
    if (mat.getMetallicRoughnessTexture()) mat.setMetallicRoughnessTexture(null);
    console.log('knit', name, S);
  }
}
export async function blouseCollarPass(doc, K = {}) {
  // (round 2: the stand collar is the cardigan's own navy rib all round, its ends and its back included (the white ends
  // and back were the shards at the shoulders and the back of the neck); the blouse shows only as a Peter Pan collar's
  // two rounded cream lobes at the front, a notch between them, a soft stitched edge)
  K = { col: [236, 230, 216], knit: [40, 50, 74], front: 1.05, notch: 0.07, ...K };
  const p = prim(doc, 'uniform-collar')[0]; if (!p) return; const mat = p.getMaterial(), S = 512, P = texPos(p, S), out = Buffer.alloc(S * S * 4);
  let ymin = 9, ymax = -9, zc = 0, n0 = 0; for (let i = 0; i < S * S; i++) if (!Number.isNaN(P[i * 3])) { ymin = Math.min(ymin, P[i * 3 + 1]); ymax = Math.max(ymax, P[i * 3 + 1]); zc += P[i * 3 + 2]; n0++; } zc /= n0;
  const kn = K.knit.map(lin), bl = K.col.map(lin);
  for (let i = 0; i < S * S; i++) { out[i * 4 + 3] = 255; const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; if (Number.isNaN(x)) continue;
    const t = (y - ymin) / (ymax - ymin), th = Math.abs(Math.atan2(x, z - zc)), lobeT = 0.95 * Math.sqrt(Math.max(0, 1 - (th / K.front) ** 2)), inL = sm(lobeT + 0.04, lobeT - 0.04, t) * sm(K.notch, K.notch + 0.05, th);
    const rib = 0.9 + 0.1 * Math.sin(Math.atan2(x, z - zc) * 160), k0 = kn.map((v) => v * rib * 0.95), st = Math.abs(t - (lobeT - 0.12)) < 0.02 && Math.floor(th * 90) % 2 === 0 ? 0.85 : 1;
    const c = k0.map((v, k) => v * (1 - inL) + bl[k] * (0.95 - 0.06 * t) * st * inL); for (let k = 0; k < 3; k++) out[i * 4 + k] = enc(c[k]); }
  const tx = doc.createTexture('blouse-collar'); await setWebp(tx, out, S, S, 90); mat.setBaseColorTexture(tx).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.88).setMetallicFactor(0);
  if (mat.getNormalTexture()) mat.setNormalTexture(null); if (mat.getMetallicRoughnessTexture()) mat.setMetallicRoughnessTexture(null);
}
export function buttonsPass(doc) { const p = prim(doc, 'uniform-buttons')[0]; if (!p) return; const m = p.getMaterial(); m.setBaseColorTexture(null).setBaseColorFactor([0.24, 0.16, 0.11, 1]).setRoughnessFactor(0.38).setMetallicFactor(0); }
