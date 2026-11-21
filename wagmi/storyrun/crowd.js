// Mog City story runner: an arena's house, drawn (the plan is crowd-plan.js's). Every person in the seats is a person:
// a head with a face (eyes, brows, a nose, a mouth that opens on the cheer; stubble, a beard, lashes, glasses), hair in
// ten styles, a body in clothes (a tee, stripes, an open jacket, a hoodie, a jersey, a shirt, a V-neck, two tones), arms
// and hands posed every frame by the cheer (a two-bone reach to where the hands want to be), legs, a phone held up with
// its light on; their skin, hair, clothes, build and height their own, and each row a little darker than the one in
// front. The far tier behind the fascia is impostors: one quad each, turned to the lens, its frame (rest, arms up, a
// clap, a phone, a fist, a wave) cut from the same shared atlas, its colours the person's own.
// The cost is fixed, whatever the size of the house: one InstancedMesh per part (BUDGET.drawCalls in all), the near
// parts in two levels of detail (LOD_NEAR from the lens; the far level posed every other frame), never a draw per person.
// Everything here is drawn by hand on a canvas: no captured likeness, no logo, no third-party asset.
import * as THREE from 'three/webgpu';
import { attribute, texture, uv } from 'three/tsl';
import { planHouse, cheer, farPose, lodOf, SH, BUDGET, PARTS, FACES, CLOTHES, HAIR_STYLES } from './crowd-plan.js';

const PI = Math.PI, A = 2048; // (the atlas's size)
const U = (px) => px / A, V = (py) => 1 - py / A;
// the atlas's regions (pixels): faces 8 x 2 cells of 128 (face f closed at cell 2f, open at 2f + 1); clothes 8 cells of
// 128 x 256 (u round the body, the front in the middle; v the waist up to the neck); hair strands; a knit; a glow; the
// far tier's impostors, 16 x 6 cells of 128 x 256 (body b in row b >> 1, columns (b & 1) * 8 + its eight poses)
const R_FACE = [0, 0], R_CLOTH = [1024, 0], R_HAIR = [0, 256], R_KNIT = [256, 256], R_GLOW = [384, 256], R_FAR = [0, 512], FAR_PX = 206;

/* -------------------------------------------------------------------------------------------------- the atlas -- */
// channels are masks, not colours: red the first colour, green the second, blue the third (crowd parts' iC1..iC3);
// faces: red the lips, green the hair (brows, stubble, a beard), blue the skin; clothes: red the garment, green its
// second colour, blue the skin; impostors: red the clothes, green the hair, blue the skin, alpha the cut-out
let ATLAS = null;
function atlas() {
  if (ATLAS) return ATLAS;
  const c = document.createElement('canvas'); c.width = c.height = A; const x = c.getContext('2d');
  let s = 4021; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const rgb = (R, G, B) => `rgb(${R | 0},${G | 0},${B | 0})`;
  const ell = (cx, cy, rx, ry, fill, rot = 0) => { x.fillStyle = fill; x.beginPath(); x.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, 2 * PI); x.fill(); };
  const line = (pts, w, stroke, cap = 'round') => { x.strokeStyle = stroke; x.lineWidth = w; x.lineCap = cap; x.lineJoin = 'round'; x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]); x.stroke(); };
  // ---- faces (nx, ny in -1..1 of the head's front, projected flat; ny up)
  for (let f = 0; f < FACES; f++) for (let open = 0; open < 2; open++) {
    const cell = 2 * f + open, ox = R_FACE[0] + (cell % 8) * 128, oy = R_FACE[1] + Math.floor(cell / 8) * 128;
    const P = (nx, ny) => [ox + 64 + nx * 64, oy + 64 - ny * 64];
    x.save(); x.beginPath(); x.rect(ox, oy, 128, 128); x.clip();
    x.fillStyle = rgb(0, 0, 255); x.fillRect(ox, oy, 128, 128);
    const fem = f >= 4, k = f % 4;
    // (the sockets and the cheeks' shade, the jaw's)
    for (const sd of [-1, 1]) { const [ex, ey] = P(sd * 0.36, 0.1); const g = x.createRadialGradient(ex, ey, 2, ex, ey, 16); g.addColorStop(0, rgb(0, 0, 200)); g.addColorStop(1, rgb(0, 0, 255)); x.fillStyle = g; x.fillRect(ex - 18, ey - 18, 36, 36); }
    { const [cx, cy] = P(0, -0.15); const g = x.createLinearGradient(cx - 10, 0, cx + 10, 0); g.addColorStop(0, rgb(0, 0, 225)); g.addColorStop(0.5, rgb(0, 0, 255)); g.addColorStop(1, rgb(0, 0, 225)); x.fillStyle = g; x.fillRect(cx - 10, cy - 18, 20, 22); }
    // (stubble or a beard: hair's colour over the jaw)
    if (!fem && (k === 0 || k === 1)) {
      const dense = k === 1 ? 0.75 : 0.28;
      for (let i = 0; i < (k === 1 ? 900 : 650); i++) { const a = r() * 2 * PI, rr = Math.sqrt(r()); const nx = Math.cos(a) * rr * 0.62, ny = -0.52 + Math.sin(a) * rr * 0.42; if (ny > -0.22 && Math.abs(nx) < 0.36) continue; const [px, py] = P(nx, ny); x.fillStyle = rgb(0, 255 * dense * (0.6 + r() * 0.4), 255 * (1 - dense)); x.fillRect(px, py, 1.6, 1.6); }
    }
    // (the brows: raised on the open-mouthed cheer)
    for (const sd of [-1, 1]) { const lift = open ? 0.05 : 0, b = fem ? 2.6 : 3.6; line([P(sd * 0.18, 0.3 + lift), P(sd * 0.36, 0.36 + lift), P(sd * 0.55, 0.3 + lift * 0.5)], b, rgb(0, 230, 25)); }
    // (the eyes: the white (the skin's lightest), the iris and pupil, the upper lid and, on her, the lashes)
    for (const sd of [-1, 1]) {
      const [ex, ey] = P(sd * 0.36, 0.11); ell(ex, ey, 9.5, open ? 5.2 : 4.4, rgb(0, 0, 255));
      ell(ex + sd * -0.6, ey + 0.3, 3.9, 3.9, rgb(0, 8, 26)); ell(ex + sd * -0.6, ey + 0.3, 1.6, 1.6, rgb(0, 0, 0));
      line([[ex - 10, ey + 1], [ex - 4, ey - (open ? 5.6 : 4.8)], [ex + 4, ey - (open ? 5.6 : 4.8)], [ex + 10, ey + 1]], fem ? 2.6 : 1.6, rgb(0, 12, 40));
      if (fem) line([[ex + sd * 8, ey - 2], [ex + sd * 12, ey - 5]], 1.6, rgb(0, 0, 20));
    }
    // (the nose: the shadow down one side, the nostrils)
    { const [nx, ny] = P(0, -0.2); ell(nx - 5, ny + 2, 2.6, 1.6, rgb(0, 0, 120)); ell(nx + 5, ny + 2, 2.6, 1.6, rgb(0, 0, 120)); line([P(0.05, 0.05), P(0.1, -0.12)], 2, rgb(0, 0, 215)); }
    // (the mouth: shut, a smile or a line; open, the cheer, dark inside, the lips round it)
    { const [mx, my] = P(0, -0.44), w = fem ? 13 : 14, lip = fem ? rgb(175, 0, 120) : rgb(95, 0, 170);
      if (open) { x.fillStyle = lip; x.beginPath(); x.moveTo(mx - w * 1.05, my - 2); x.quadraticCurveTo(mx, my - 7, mx + w * 1.05, my - 2); x.quadraticCurveTo(mx, my + 15, mx - w * 1.05, my - 2); x.fill(); x.fillStyle = rgb(70, 0, 18); x.beginPath(); x.moveTo(mx - w * 0.85, my - 1.5); x.quadraticCurveTo(mx, my - 4.5, mx + w * 0.85, my - 1.5); x.quadraticCurveTo(mx, my + 11, mx - w * 0.85, my - 1.5); x.fill(); x.fillStyle = rgb(30, 0, 150); x.fillRect(mx - w * 0.6, my - 3.2, w * 1.2, 2); }
      else { ell(mx, my - 1.8, w, 3.4, lip); ell(mx, my + 2.6, w * 0.82, 3.8, lip); line(k % 2 ? [[mx - w, my], [mx, my + 0.8], [mx + w, my]] : [[mx - w, my - 1.5], [mx, my + 1.6], [mx + w, my - 1.5]], 1.8, rgb(40, 0, 60)); } }
    // (her cheeks' colour)
    if (fem) for (const sd of [-1, 1]) { const [cx, cy] = P(sd * 0.48, -0.16); const g = x.createRadialGradient(cx, cy, 1, cx, cy, 12); g.addColorStop(0, 'rgba(70,0,215,0.8)'); g.addColorStop(1, 'rgba(0,0,255,0)'); x.fillStyle = g; x.fillRect(cx - 12, cy - 12, 24, 24); }
    // (glasses: dark rims and the bridge)
    if (k === 3) { for (const sd of [-1, 1]) { const [ex, ey] = P(sd * 0.36, 0.1); x.strokeStyle = rgb(0, 0, 10); x.lineWidth = 2.4; x.beginPath(); x.ellipse(ex, ey, 13, 9, 0, 0, 2 * PI); x.stroke(); } line([P(-0.16, 0.13), P(0.16, 0.13)], 2.2, rgb(0, 0, 10)); }
    x.restore();
  }
  // ---- clothes (u: round the body, the back at the cell's edges, the front in the middle; v: the neck at the top)
  for (let k = 0; k < CLOTHES; k++) {
    const ox = R_CLOTH[0] + k * 128, oy = R_CLOTH[1];
    x.save(); x.beginPath(); x.rect(ox, oy, 128, 256); x.clip();
    const R = (v = 255) => rgb(v, 0, 0), G = (v = 255) => rgb(0, v, 0), B = (v = 255) => rgb(0, 0, v);
    x.fillStyle = k === 2 || k === 7 ? G() : R(); x.fillRect(ox, oy, 128, 256);
    if (k === 1) for (let y = 30; y < 256; y += 26) { x.fillStyle = G(); x.fillRect(ox, oy + y, 128, 12); }
    if (k === 2) { x.fillStyle = R(); x.fillRect(ox + 46, oy + 18, 36, 238); line([[ox + 45, oy + 20], [ox + 52, oy + 80], [ox + 46, oy + 256]], 3, G(170)); line([[ox + 83, oy + 20], [ox + 76, oy + 80], [ox + 82, oy + 256]], 3, G(170)); }
    if (k === 3) { ell(ox + 4, oy + 30, 26, 22, R(205)); ell(ox + 124, oy + 30, 26, 22, R(205)); line([[ox + 58, oy + 24], [ox + 57, oy + 86]], 2.2, G()); line([[ox + 70, oy + 24], [ox + 71, oy + 86]], 2.2, G()); x.fillStyle = R(210); x.fillRect(ox + 38, oy + 176, 52, 4); }
    if (k === 4) { x.fillStyle = G(); x.fillRect(ox, oy + 18, 128, 38); x.fillRect(ox + 20, oy + 56, 8, 200); x.fillRect(ox + 100, oy + 56, 8, 200); }
    if (k === 5) { line([[ox + 64, oy + 22], [ox + 64, oy + 256]], 1.6, R(170)); for (let y = 50; y < 250; y += 34) ell(ox + 67, oy + y, 1.6, 1.6, R(140)); x.fillStyle = G(); x.beginPath(); x.moveTo(ox + 44, oy + 16); x.lineTo(ox + 63, oy + 40); x.lineTo(ox + 64, oy + 16); x.moveTo(ox + 84, oy + 16); x.lineTo(ox + 65, oy + 40); x.lineTo(ox + 64, oy + 16); x.fill(); }
    if (k === 6) { x.fillStyle = B(); x.beginPath(); x.moveTo(ox + 46, oy + 14); x.lineTo(ox + 64, oy + 58); x.lineTo(ox + 82, oy + 14); x.fill(); x.fillStyle = G(); x.fillRect(ox, oy + 232, 128, 24); }
    if (k === 7) { x.fillStyle = R(); x.fillRect(ox, oy + 120, 128, 136); }
    // (the neck, the collar's shade, the cloth's weave and its folds at the waist)
    x.fillStyle = B(); x.fillRect(ox, oy, 128, 16);
    if (k !== 6 && k !== 5) { x.fillStyle = k === 2 || k === 7 ? G(200) : R(200); x.fillRect(ox, oy + 16, 128, 4); x.fillStyle = B(); x.beginPath(); x.ellipse(ox + 64, oy + 14, 15, 8, 0, 0, PI); x.fill(); }
    const d = x.getImageData(ox, oy, 128, 256), D = d.data;
    for (let i = 0; i < D.length; i += 4) { const py = (i >> 2) >> 7, k2 = (0.93 + r() * 0.07) * (py > 200 ? 1 - (py - 200) / 400 : 1) * (0.97 + 0.03 * Math.sin(py * 0.9)); D[i] *= k2; D[i + 1] *= k2; if (py > 16) D[i + 2] *= k2; }
    x.putImageData(d, ox, oy);
    x.restore();
  }
  // ---- hair: strands in green, combed down; the knit of a beanie in red; the glow of a phone's light
  { const [ox, oy] = R_HAIR; x.fillStyle = rgb(0, 190, 0); x.fillRect(ox, oy, 256, 256);
    for (let i = 0; i < 1400; i++) { const px = ox + r() * 256, py = oy + r() * 256, l = 12 + r() * 40, v = 120 + r() * 135; line([[px, py], [px + (r() - 0.5) * 6, py + l]], 1 + r() * 1.4, rgb(0, v, 0)); } }
  { const [ox, oy] = R_KNIT; x.fillStyle = rgb(230, 0, 0); x.fillRect(ox, oy, 128, 128); for (let i = 0; i < 128; i += 6) { x.fillStyle = rgb(170, 0, 0); x.fillRect(ox + i, oy, 2, 128); } x.fillStyle = rgb(190, 0, 0); x.fillRect(ox, oy + 100, 128, 28); }
  { const [ox, oy] = R_GLOW; const g = x.createRadialGradient(ox + 64, oy + 64, 0, ox + 64, oy + 64, 62); g.addColorStop(0, 'rgb(255,255,255)'); g.addColorStop(0.12, 'rgb(200,205,210)'); g.addColorStop(0.4, 'rgb(40,42,46)'); g.addColorStop(1, 'rgb(0,0,0)'); x.fillStyle = g; x.fillRect(ox, oy, 128, 128); }
  // ---- the far tier: twelve bodies (six heads of hair, slim and broad) in eight poses each
  x.clearRect(R_FAR[0], R_FAR[1], 2048, 1536);
  for (let b = 0; b < 12; b++) for (let k = 0; k < 8; k++) {
    const ox = R_FAR[0] + ((b & 1) * 8 + k) * 128, oy = R_FAR[1] + (b >> 1) * 256;
    farSprite(x, ox, oy, b, k, r, rgb, ell, line);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.userData.keep = true;
  return (ATLAS = t);
}
// one impostor: a person from the hips up, seen from the stage, 206 px to the metre (a cell 0.62 x 1.24 m)
const FAR_HANDS = [];
function farSprite(x, ox, oy, b, k, r, rgb, ell, line) {
  const kind = b >> 1, broad = b & 1, cx = ox + 64, sw = broad ? 40 : 33, shY = oy + 136, headY = oy + 92;
  x.save(); x.beginPath(); x.rect(ox + 1, oy + 1, 126, 254); x.clip();
  const SK = rgb(0, 0, 255), CL = rgb(255, 0, 0), HR = rgb(0, 255, 0), sleeve = broad ? CL : SK;
  // (where the hands are, pose by pose: [left, right], from the viewer; and the elbows)
  const S = [[cx - sw + 4, shY + 6], [cx + sw - 4, shY + 6]];
  const H = { 0: [[cx - sw - 4, oy + 250], [cx + sw + 4, oy + 250]], 1: [[cx - 62, oy + 16], [cx + 48, oy + 22]], 2: [[cx - 48, oy + 22], [cx + 62, oy + 16]],
    3: [[cx - 20, oy + 178], [cx + 20, oy + 178]], 4: [[cx - 4, oy + 174], [cx + 4, oy + 174]], 5: [[cx - sw - 4, oy + 250], [cx + 18, oy + 64]],
    6: [[cx - sw - 4, oy + 250], [cx + 26, oy + 8]], 7: [[cx - 46, oy + 18], [cx + sw + 4, oy + 250]] }[k];
  const E = H.map((h, i) => { const s = S[i], side = i ? 1 : -1, mx = (s[0] + h[0]) / 2, my = (s[1] + h[1]) / 2, up = h[1] < s[1]; return [mx + side * (up ? 22 : 8), my + (up ? 10 : 0)]; });
  FAR_HANDS[k] = [(H[1][0] - cx) / FAR_PX, (oy + 256 - H[1][1]) / FAR_PX];
  // (the body: the shoulders to the hips, shaded round)
  const g = x.createLinearGradient(cx - sw, 0, cx + sw, 0); g.addColorStop(0, rgb(170, 0, 0)); g.addColorStop(0.5, rgb(255, 0, 0)); g.addColorStop(1, rgb(170, 0, 0));
  x.fillStyle = g; x.beginPath(); x.moveTo(cx - sw, shY); x.quadraticCurveTo(cx - sw - 4, shY + 50, cx - sw + 6, oy + 256); x.lineTo(cx + sw - 6, oy + 256); x.quadraticCurveTo(cx + sw + 4, shY + 50, cx + sw, shY); x.quadraticCurveTo(cx, shY - 14, cx - sw, shY); x.fill();
  ell(cx, shY - 8, 8, 10, SK); // (the neck)
  // (long hair falls behind the shoulders)
  if (kind === 1) { x.fillStyle = HR; x.beginPath(); x.moveTo(cx - 24, headY - 6); x.lineTo(cx - 27, shY + 22); x.lineTo(cx + 27, shY + 22); x.lineTo(cx + 24, headY - 6); x.fill(); }
  // (the head, the face, and the hair on it)
  ell(cx, headY, 21, 25, SK);
  for (const sd of [-1, 1]) { ell(cx + sd * 8, headY - 2, 2.6, 1.8, rgb(0, 10, 30)); line([[cx + sd * 4, headY - 9], [cx + sd * 13, headY - 10]], 2, rgb(0, 220, 30)); }
  ell(cx, headY + 12, k === 0 || k === 5 ? 5 : 6, k === 0 || k === 5 ? 2 : 4.5, rgb(60, 0, 40)); ell(cx, headY + 4, 3, 2, rgb(0, 0, 200));
  x.fillStyle = HR;
  if (kind === 0) { x.beginPath(); x.ellipse(cx, headY - 8, 22, 19, 0, PI, 2 * PI); x.fill(); }
  else if (kind === 1) { x.beginPath(); x.ellipse(cx, headY - 6, 24, 22, 0, PI, 2 * PI); x.fill(); x.fillRect(cx - 24, headY - 8, 6, 34); x.fillRect(cx + 18, headY - 8, 6, 34); }
  else if (kind === 2) { x.beginPath(); x.ellipse(cx, headY - 8, 22, 19, 0, PI, 2 * PI); x.fill(); ell(cx, headY - 30, 11, 9, HR); }
  else if (kind === 3) { ell(cx, headY - 10, 31, 27, HR); ell(cx, headY + 2, 19, 21, SK); for (const sd of [-1, 1]) ell(cx + sd * 8, headY - 2, 2.6, 1.8, rgb(0, 10, 30)); ell(cx, headY + 12, 6, 4.5, rgb(60, 0, 40)); }
  else if (kind === 5) { x.fillStyle = CL; x.beginPath(); x.ellipse(cx, headY - 9, 23, 21, 0, PI, 2 * PI); x.fill(); x.fillRect(cx - 23, headY - 12, 46, 6); }
  // (the arms: the upper arm in the shirt, the forearm bare or sleeved, the hands)
  for (let i = 0; i < 2; i++) { line([S[i], E[i]], broad ? 17 : 14, CL); line([E[i], H[i]], broad ? 14 : 12, sleeve); ell(H[i][0], H[i][1], 7.5, 8.5, SK); }
  if (k === 5) { x.fillStyle = rgb(0, 0, 0); x.fillRect(H[1][0] - 6, H[1][1] - 18, 12, 20); }
  x.restore();
}

/* ---------------------------------------------------------------------------------------------- the geometry -- */
// (my own merge: indexed geometries' positions, normals and uvs)
function merge(list) {
  let nv = 0, ni = 0; for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), T = new Float32Array(nv * 2), I = new Uint32Array(ni);
  let v = 0, i = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    P.set(g.attributes.position.array, v * 3); N.set(g.attributes.normal.array, v * 3); T.set(g.attributes.uv.array, v * 2);
    if (g.index) for (let k = 0; k < g.index.count; k++) I[i++] = g.index.array[k] + v; else for (let k = 0; k < n; k++) I[i++] = k + v;
    v += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); out.setAttribute('uv', new THREE.BufferAttribute(T, 2));
  out.setIndex(new THREE.BufferAttribute(I, 1));
  return out;
}
const uvAll = (g, fn) => { const p = g.attributes.position, t = g.attributes.uv; for (let k = 0; k < p.count; k++) { const [u, v] = fn(p.getX(k), p.getY(k), p.getZ(k), k); t.setXY(k, u, v); } return g; };
// the head: a sphere (0.105 m), the nose and the ears, its front projected flat onto face cell 0 (the back plain skin)
function headGeo(lod) {
  const r = 0.105, face = (px, py, pz) => (pz > 0 ? [U(R_FACE[0] + Math.min(126, Math.max(2, 64 + (px / r) * 64))), V(R_FACE[1] + Math.min(126, Math.max(2, 64 - (py / r) * 64)))] : [U(R_FACE[0] + 3), V(R_FACE[1] + 64)]);
  const head = uvAll(new THREE.SphereGeometry(r, lod ? 10 : 18, lod ? 8 : 14), face);
  const parts = [head];
  const nose = new THREE.SphereGeometry(0.02, lod ? 5 : 8, lod ? 4 : 6); nose.scale(0.75, 1.15, 1); nose.translate(0, -0.02, 0.098); parts.push(uvAll(nose, face));
  if (!lod) for (const sd of [-1, 1]) { const e = new THREE.SphereGeometry(0.026, 6, 5); e.scale(0.42, 1, 0.75); e.translate(sd * 0.1, -0.006, -0.005); parts.push(uvAll(e, () => [U(R_FACE[0] + 3), V(R_FACE[1] + 64)])); }
  return merge(parts);
}
// the hair: each style's pieces merged, a mesh per style (bald has none)
function hairGeo(lod) {
  const q = lod ? 0.55 : 1, seg = (n) => Math.max(5, Math.round(n * q));
  const cl = (a, lo, hi) => Math.min(hi, Math.max(lo, a));
  const strand = (px, py, pz) => [U(R_HAIR[0] + 128 + Math.atan2(px, -pz) / PI * 120), V(R_HAIR[1] + cl(128 - py * 700, 4, 252))];
  const knit = (px, py, pz) => [U(R_KNIT[0] + 64 + Math.atan2(px, -pz) / PI * 60), V(R_KNIT[1] + cl(110 - (py - 0.02) * 900, 4, 124))];
  // (a cap of the head: a sphere's top down to theta, tilted back so the forehead shows, the face's side open by cut)
  // (its crown a little high and full, as hair has volume over the skull: seen from below, the hairline still shows)
  const cap = (rad, theta, tilt = -0.32, cut = 0) => {
    const g = cut ? new THREE.SphereGeometry(rad, seg(16), seg(10), PI / 2 + cut, 2 * PI - 2 * cut, 0, theta) : new THREE.SphereGeometry(rad, seg(16), seg(8), 0, 2 * PI, 0, theta);
    g.scale(1, 1.08, 1); g.rotateX(tilt * 0.7); g.translate(0, 0.008, -0.004); return g;
  };
  const by = {};
  const add = (name, g, fn = strand) => (by[name] ||= []).push(uvAll(g, fn));
  add('crop', cap(0.117, PI * 0.54));
  add('buzz', cap(0.111, PI * 0.52, -0.36));
  { add('bob', cap(0.117, PI * 0.5, -0.28)); add('bob', cap(0.118, PI * 0.74, 0, 0.95)); }
  { add('long', cap(0.116, PI * 0.5, -0.28)); add('long', cap(0.118, PI * 0.78, 0, 1.0)); const b = new THREE.BoxGeometry(0.2, 0.26, 0.05, 2, 3, 1); b.translate(0, -0.14, -0.072); add('long', b); }
  { add('bun', cap(0.114, PI * 0.54, -0.3)); const b = new THREE.SphereGeometry(0.048, seg(10), seg(8)); b.translate(0, 0.075, -0.1); add('bun', b); }
  { add('pony', cap(0.114, PI * 0.54, -0.3)); const b = new THREE.CylinderGeometry(0.024, 0.012, 0.2, seg(8)); b.rotateX(0.35); b.translate(0, -0.06, -0.135); add('pony', b); const k = new THREE.SphereGeometry(0.03, seg(8), seg(6)); k.translate(0, 0.03, -0.112); add('pony', k); }
  { const g = new THREE.SphereGeometry(0.152, seg(18), seg(12), PI / 2 + 0.85, 2 * PI - 1.7, 0, PI * 0.62); g.scale(1, 0.92, 1); g.translate(0, 0.03, -0.015); add('afro', g); add('afro', cap(0.13, PI * 0.42, -0.4)); }
  { const g = new THREE.SphereGeometry(0.124, seg(18), seg(12), PI / 2 + 0.9, 2 * PI - 1.8, 0, PI * 0.66); const p = g.attributes.position; let s = 77; const rr = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let k = 0; k < p.count; k++) { const f = 1 + (rr() - 0.5) * 0.09; p.setXYZ(k, p.getX(k) * f, p.getY(k) * f, p.getZ(k) * f); } g.computeVertexNormals(); add('curls', g); add('curls', cap(0.12, PI * 0.46, -0.34)); }
  { add('beanie', cap(0.122, PI * 0.5, -0.12), knit); const band = new THREE.CylinderGeometry(0.124, 0.122, 0.04, seg(18), 1, true); band.rotateX(-0.12); band.translate(0, 0.012, -0.003); add('beanie', band, knit); }
  return Object.fromEntries(Object.entries(by).map(([k, l]) => [k, merge(l)]));
}
// the body: the hips to the neck, shoulders wider than deep, its seam at the back (u round it, the front in the
// middle of cloth cell 0; v by height, the neck at the top), the shoulders' caps
function bodyGeo(lod) {
  const pts = [[0.155, -0.3], [0.168, -0.2], [0.172, -0.06], [0.185, 0.08], [0.21, 0.2], [0.205, 0.28], [0.15, 0.335], [0.062, 0.36], [0.05, 0.44]].map(([a, b]) => new THREE.Vector2(a, b));
  const g = new THREE.LatheGeometry(pts, lod ? 8 : 16); g.rotateY(PI); g.scale(1, 1, 0.62);
  const p = g.attributes.position, t = g.attributes.uv;
  for (let k = 0; k < p.count; k++) { const u = t.getX(k), y = p.getY(k); t.setXY(k, U(R_CLOTH[0] + 1 + u * 126), V(R_CLOTH[1] + 255 - ((y + 0.3) / 0.74) * 254)); }
  g.computeVertexNormals();
  const parts = [g];
  for (const sd of [-1, 1]) { const c = new THREE.SphereGeometry(0.062, lod ? 6 : 9, lod ? 4 : 6); c.scale(1, 0.8, 0.9); c.translate(sd * 0.168, 0.255, -0.005); parts.push(uvAll(c, () => [U(R_CLOTH[0] + 20), V(R_CLOTH[1] + 80)])); }
  return merge(parts);
}
// a limb's piece (a tapered cylinder, scaled to its bone) and a hand (a mitten and its thumb, the fingers along +y)
function limbGeo(lod) { const g = new THREE.CylinderGeometry(0.86, 1, 1, lod ? 5 : 8, 1, false); return g; }
function handGeo(lod) {
  const a = new THREE.SphereGeometry(1, lod ? 5 : 8, lod ? 4 : 6); a.scale(0.04, 0.07, 0.022); a.translate(0, 0.055, 0);
  if (lod) return merge([a]);
  const th = new THREE.SphereGeometry(1, 6, 4); th.scale(0.014, 0.035, 0.014); th.rotateZ(0.6); th.translate(0.034, 0.04, 0.006);
  return merge([a, th]);
}

/* ------------------------------------------------------------------------------------------------- materials -- */
// one material for the masked parts: the atlas at the part's own uv plus the person's cell (iOff), its three masks
// coloured with their three colours (iC1..iC3); the impostors cut out by its alpha
function maskMat(tex, { hair = false, cut = false } = {}) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: hair ? 0.6 : 0.82, metalness: 0 });
  const t = texture(tex, uv().add(attribute('iOff', 'vec2')));
  m.colorNode = attribute('iC1', 'vec3').mul(t.r).add(attribute('iC2', 'vec3').mul(t.g)).add(attribute('iC3', 'vec3').mul(t.b));
  if (cut) { m.opacityNode = t.a; m.alphaTest = 0.5; }
  return m;
}

/* --------------------------------------------------------------------------------------------------- the crowd -- */
// a part: one InstancedMesh per level of detail, its instances packed per frame (the people at that level, `per` each),
// its per-instance data copied from the people's own when who is at which level changes. The masked parts' data is one
// interleaved buffer (WebGPU allows a pipeline eight vertex buffers): the three colours and the atlas cell
const LAYOUT = { iC1: [0, 3], iC2: [3, 3], iC3: [6, 3], iOff: [9, 2] }, STRIDE = 12;
function part(name, geos, mat, per, cap, masked, group) {
  const n3 = masked ? STRIDE : 3;
  const meshes = geos.map((g, L) => {
    const m = new THREE.InstancedMesh(g, mat, cap * per); m.name = `crowd.${name}${geos.length > 1 ? L : ''}`;
    if (masked) { const ib = new THREE.InstancedInterleavedBuffer(new Float32Array(cap * per * STRIDE), STRIDE).setUsage(THREE.DynamicDrawUsage); for (const [a, [o, k]] of Object.entries(LAYOUT)) g.setAttribute(a, new THREE.InterleavedBufferAttribute(ib, k, o)); m.userData.ib = ib; }
    else m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * per * 3), 3);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.userData.crowd = true;
    group.add(m); return m;
  });
  const src = new Float32Array(cap * per * n3), arr = (L) => (masked ? meshes[L].userData.ib.array : meshes[L].instanceColor.array);
  return { name, meshes, per, n3, src, arr,
    // (the slot's data from person i's)
    copy(L, slot, i) { arr(L).set(src.subarray(i * per * n3, (i + 1) * per * n3), slot * per * n3); },
    dirtyAttrs(L) { if (masked) meshes[L].userData.ib.needsUpdate = true; else meshes[L].instanceColor.needsUpdate = true; },
    set(L, slot, j, mx) { meshes[L].setMatrixAt(slot * per + j, mx); },
  };
}

// the house: plan (crowd-plan.js planHouse's), the set's group, up (on its feet); returns { tick(t, cam, extra), stats }
export function crowd(group, plan, { up = false } = {}) {
  const tex = atlas(), near = plan.near, far = plan.far, n = near.length, nf = far.length;
  const mBody = maskMat(tex), mHead = maskMat(tex), mHair = maskMat(tex, { hair: true }), mFar = maskMat(tex, { cut: true });
  const mLimb = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.85 });
  const mPhone = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.6, 3.0), side: THREE.DoubleSide, fog: false });
  const mGlow = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0.72, 0.74, 0.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const cap = Math.max(1, n);
  const P = {
    body: part('body', [bodyGeo(0), bodyGeo(1)], mBody, 1, cap, true, group),
    head: part('head', [headGeo(0), headGeo(1)], mHead, 1, cap, true, group),
    limbs: part('limbs', [limbGeo(0), limbGeo(1)], mLimb, 8, cap, false, group),
    hands: part('hands', [handGeo(0), handGeo(1)], mLimb, 2, cap, false, group),
  };
  const NEAR = Object.values(P);
  // (the hair: a mesh per style, each holding only its own people)
  const HG = [hairGeo(0), hairGeo(1)], HP = {};
  for (const name of HAIR_STYLES) {
    if (!HG[0][name]) continue;
    const members = near.filter((p) => HAIR_STYLES[p.hairStyle] === name);
    HP[name] = part(`hair-${name}`, [HG[0][name], HG[1][name]], mHair, 1, Math.max(1, members.length), true, group);
    members.forEach((p, k) => { p.hi = k; p.hp = HP[name]; });
  }
  const HAIR = Object.values(HP);
  const phoneGeo = new THREE.PlaneGeometry(0.072, 0.14), glowGeo = uvAll(new THREE.PlaneGeometry(1, 1), (px, py) => [U(R_GLOW[0] + 64 + px * 124), V(R_GLOW[1] + 64 - py * 124)]);
  const IM = (g, m, count, name) => { const o = new THREE.InstancedMesh(g, m, count); o.name = name; o.count = 0; o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false; o.instanceMatrix.setUsage(THREE.DynamicDrawUsage); o.userData.crowd = true; group.add(o); return o; };
  const phones = IM(phoneGeo, mPhone, BUDGET.phones, 'crowd.phones'), glows = IM(glowGeo, mGlow, BUDGET.glows, 'crowd.glows'); glows.renderOrder = 3;
  // (the far tier: a quad from the seat up, its uv at impostor cell 0)
  const farGeo = uvAll(new THREE.PlaneGeometry(0.62, 1.24), (px, py) => [U(R_FAR[0] + 64 + (px / 0.62) * 128), V(R_FAR[1] + 128 - (py / 1.24) * 256)]); farGeo.translate(0, 0.62, 0);
  const FAR = part('far', [farGeo], mFar, 1, Math.max(1, nf), true, group);
  // (the far tier's risers and its fascia, one instanced box)
  const risers = IM(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#0E0F13', roughness: 0.95 }), 16, 'crowd.risers');
  const col = new THREE.Color(), mx = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), e = new THREE.Euler(), Y = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
  if (plan.farTier) {
    const F = plan.farTier; let k = 0;
    for (let j = 0; j < F.rows; j++) { const y = F.y0 + j * F.rise; risers.setMatrixAt(k++, mx.compose(v.set(0, y / 2, F.z0 + j * F.depth + 0.1), q.identity(), sc.set(33, y, F.depth + 0.02))); }
    risers.setMatrixAt(k++, mx.compose(v.set(0, (F.y0 - 0.25) / 2, F.z0 - 0.55), q.identity(), sc.set(33, F.y0 - 0.25, 0.3)));
    risers.count = k; risers.instanceMatrix.needsUpdate = true;
  }
  // the people's own colours, once: the clothes, skin and hair, each row darker than the one in front
  const lin = (hex, k) => col.set(hex).multiplyScalar(k);
  const put = (pp, a, i, j, c) => { const o = (i * pp.per + j) * pp.n3 + (a === 'color' ? 0 : LAYOUT[a][0]); pp.src[o] = c.r; pp.src[o + 1] = c.g; pp.src[o + 2] = c.b; };
  const putN = (pp, a, i, ...vals) => { const o = i * pp.per * pp.n3 + LAYOUT[a][0]; vals.forEach((x, k) => { pp.src[o + k] = x; }); };
  const lipOf = (skin, k) => col.set(skin).multiply(new THREE.Color(0.78, 0.5, 0.48)).multiplyScalar(k);
  near.forEach((p, i) => {
    const k = p.dim;
    put(P.body, 'iC1', i, 0, lin(p.c1, k)); put(P.body, 'iC2', i, 0, lin(p.c2, k)); put(P.body, 'iC3', i, 0, lin(p.skin, k)); putN(P.body, 'iOff', i, U(p.cloth * 128), 0);
    put(P.head, 'iC1', i, 0, lipOf(p.skin, k)); put(P.head, 'iC2', i, 0, lin(p.hair, k)); put(P.head, 'iC3', i, 0, lin(p.skin, k));
    if (p.hp) { put(p.hp, 'iC1', p.hi, 0, lin(p.c2 === '#ECE8E0' ? p.c1 : p.c2, k)); put(p.hp, 'iC2', p.hi, 0, lin(p.hair, k)); put(p.hp, 'iC3', p.hi, 0, lin(p.skin, k)); } else p.hp = null;
    const jacket = p.cloth === 2 || p.cloth === 7 || p.cloth === 4, sleeve = jacket ? p.c2 : p.c1;
    for (let j = 0; j < 8; j++) put(P.limbs, 'color', i, j, lin(j < 4 ? p.pants : (j % 2 === 0 || p.sleeves === 'long') ? sleeve : p.skin, k * (j < 4 ? 0.9 : 1)));
    for (let j = 0; j < 2; j++) put(P.hands, 'color', i, j, lin(p.skin, k));
    p.lod = -1; p.slot = -1; p.handAt = [new THREE.Vector3(), new THREE.Vector3()]; p.phone = null;
    // (facing the stage's middle: the body some of the way round, the head the rest)
    const aim = Math.atan2(0 - p.x, -2 - p.z); let d = aim - PI; while (d > PI) d -= 2 * PI; while (d < -PI) d += 2 * PI;
    p.bodyH = p.h + d * (p.tier === 'pit' ? 0.2 : 0.45); p.headH = d * (p.tier === 'pit' ? 0.2 : 0.4);
  });
  far.forEach((p, i) => {
    const k = p.dim, kind = [0, 1, 1, 2, 3, 0, 0, 4, 2, 3][p.hairStyle] ?? 0, beanie = p.hairStyle === 5;
    p.body = (beanie ? 5 : kind) * 2 + (p.female ? 0 : 1);
    put(FAR, 'iC1', i, 0, lin(p.c1, k)); put(FAR, 'iC2', i, 0, lin(p.hair, k)); put(FAR, 'iC3', i, 0, lin(p.skin, k)); p.pose = -1; FAR.copy(0, i, i);
  });
  FAR.meshes[0].count = nf; FAR.dirtyAttrs(0);

  const S = new THREE.Vector3(), T = new THREE.Vector3(), E = new THREE.Vector3(), dn = new THREE.Vector3(), pole = new THREE.Vector3(), a0 = new THREE.Vector3(), a1 = new THREE.Vector3();
  const local = (p, h, lx, ly, lz, out) => out.set(p.x + Math.cos(h) * lx + Math.sin(h) * lz, ly, p.z - Math.sin(h) * lx + Math.cos(h) * lz);
  const bone = (pp, L, slot, j, a, b, rad) => { v.subVectors(b, a); const len = v.length() || 1e-3; q.setFromUnitVectors(Y, v.multiplyScalar(1 / len)); pp.set(L, slot, j, mx.compose(v.addVectors(a, b).multiplyScalar(0.5), q, sc.set(rad, len, rad))); };
  let frame = 0, lastCam = null; const counts = [0, 0];
  const stats = { drawCalls: 0, near: n, far: nf, ms: 0, lod0: 0, lod1: 0, phones: 0 };

  // one person, posed now: the body, the head and hair, the legs, the arms by the cheer, the hands, a phone
  function posePerson(p, t, L, slot) {
    const s = p.scale, g = p.girth, gx = g * (p.female ? 0.9 : 1);
    const air = cheer(p, t, up, p.hands, p.poles), lift = p.stand ? air : 0;
    const sway = up ? 0.04 * Math.sin(t * 2 * PI * p.beat * 0.5 + p.ph) : 0.05 * Math.sin(t * 0.4 + p.ph), h = p.bodyH + sway;
    const base = p.y + (p.stand ? 0.86 : 0.47) * s + lift;
    q.setFromAxisAngle(Y, h);
    P.body.set(L, slot, 0, mx.compose(v.set(p.x, base + 0.3 * s, p.z), q, sc.set(gx * s, s, g * s)));
    // (the head: toward the stage's middle, a look round, a nod on the beat when they are up; the hair with it)
    const nod = up ? 0.1 * Math.max(0, Math.sin(t * 2 * PI * p.beat + p.ph)) : 0.03 * Math.sin(t * 0.7 + p.ph), look = (up ? 0.08 : 0.22) * Math.sin(t * 0.23 + p.ph * 1.7);
    q2.setFromEuler(e.set(-nod + (p.stand ? 0 : -0.04), h + p.headH * 0.6 + look, 0, 'YXZ'));
    local(p, h, 0, base + 0.79 * s, 0.012 * s, v); const hk = s * p.headK;
    mx.compose(v, q2, sc.set(0.95 * hk, 1.1 * hk, hk)); P.head.set(L, slot, 0, mx); if (p.hp) p.hp.set(L, p.hslot, 0, mx);
    // (the mouth open on the cheer's beat)
    const open = up && p.style !== 'rest' && Math.sin(t * 2 * PI * p.beat * 0.5 + p.ph) > -0.2 ? 1 : 0, cell = p.face * 2 + open;
    const off = P.head.arr(L), o = slot * STRIDE + LAYOUT.iOff[0]; off[o] = U((cell % 8) * 128); off[o + 1] = -Math.floor(cell / 8) * 128 / A;
    // (the legs: standing, straight down; sitting, the thighs forward and the shins down)
    for (let k = 0; k < 2; k++) {
      const sd = k === 0 ? 1 : -1, hipX = sd * 0.085 * s * gx;
      local(p, h, hipX, base, 0, S);
      if (p.stand) { local(p, h, hipX * 1.05, (base + p.y + lift) / 2, 0.02 * s, E); local(p, h, hipX * 1.1, p.y + 0.04 + lift, 0.03 * s, T); }
      else { local(p, h, hipX * 1.1, base + 0.02, 0.4 * s, E); local(p, h, hipX * 1.15, p.y + 0.06, 0.36 * s, T); }
      bone(P.limbs, L, slot, k * 2, S, E, 0.075 * s * g); bone(P.limbs, L, slot, k * 2 + 1, E, T, 0.058 * s);
    }
    // (the arms: a two-bone reach from the shoulder to where the cheer wants the hand, the elbow toward its pole)
    for (let k = 0; k < 2; k++) {
      const sd = k === 0 ? 1 : -1, hd = p.hands[k], pl = p.poles[k], sh = base + 0.555 * s;
      local(p, h, sd * SH * s * gx, sh, -0.015 * s, S);
      local(p, h, (sd * SH * gx + hd.x) * s, sh + hd.y * s, (-0.015 + hd.z) * s, T);
      const l1 = 0.3 * s, l2 = 0.31 * s; dn.subVectors(T, S); let d = dn.length(); dn.multiplyScalar(1 / (d || 1)); d = Math.min(d, (l1 + l2) * 0.999); T.copy(S).addScaledVector(dn, d);
      local(p, h, pl.x, 0, pl.z, pole).sub(a0.set(p.x, 0, p.z)); pole.y = pl.y; pole.addScaledVector(dn, -pole.dot(dn)).normalize();
      const ca = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d || 1), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
      E.copy(S).addScaledVector(dn, l1 * ca).addScaledVector(pole, l1 * sa);
      bone(P.limbs, L, slot, 4 + k * 2, S, E, 0.05 * s * g); bone(P.limbs, L, slot, 5 + k * 2, E, T, 0.04 * s);
      a1.subVectors(T, E).normalize(); q.setFromUnitVectors(Y, a1); P.hands.set(L, slot, k, mx.compose(T, q, sc.set(s, s, s)));
      p.handAt[k].copy(T).addScaledVector(a1, 0.07 * s);
    }
    p.phone = p.style === 'phone' ? p.handAt[p.hand] : null;
  }

  // (who is at which level, packed: each part's instances the people at that level, in order; their data copied over)
  function repack() {
    counts[0] = counts[1] = 0; const hc = new Map(HAIR.map((h) => [h, [0, 0]]));
    near.forEach((p, i) => {
      p.slot = counts[p.lod]++; for (const pp of NEAR) pp.copy(p.lod, p.slot, i);
      if (p.hp) { const c = hc.get(p.hp); p.hslot = c[p.lod]++; p.hp.copy(p.lod, p.hslot, p.hi); }
    });
    for (const pp of NEAR) for (let L = 0; L < 2; L++) { pp.meshes[L].count = counts[L] * pp.per; pp.dirtyAttrs(L); }
    for (const [h, c] of hc) for (let L = 0; L < 2; L++) { h.meshes[L].count = c[L]; h.dirtyAttrs(L); }
  }
  function tick(t, cam, extra = []) {
    const t0 = performance.now(); frame++;
    const cp = cam?.position;
    // (who is near: the level of detail by the distance from the lens, re-packed when it changes)
    let changed = !lastCam || !cp || lastCam.distanceToSquared(cp) > 0.25;
    if (changed && cp) {
      let moved = false;
      for (const p of near) { const L = lodOf(Math.hypot(p.x - cp.x, p.y + 1.2 - cp.y, p.z - cp.z), p.lod); if (L !== p.lod) { p.lod = L; moved = true; } }
      if (moved) repack(); else changed = false;
      (lastCam ||= new THREE.Vector3()).copy(cp);
    }
    if (!cp && near.length && near[0].lod < 0) { for (const p of near) p.lod = 0; repack(); }
    // (posed: the near level every frame, the far level every other one)
    near.forEach((p, i) => { if (p.lod < 0) return; if (p.lod === 1 && !changed && (frame + i) % 2) return; posePerson(p, t, p.lod, p.slot); });
    for (const pp of [...NEAR, ...HAIR]) for (let L = 0; L < 2; L++) pp.meshes[L].instanceMatrix.needsUpdate = true;
    for (let L = 0; L < 2; L++) P.head.dirtyAttrs(L);
    // (the far tier: each turned to the lens, bouncing when it is up, its frame for the cheer it is in)
    const fo = FAR.arr(0); let fdirty = false, ng = 0, np = 0;
    far.forEach((p, i) => {
      const k = farPose(p, t, up); if (k !== p.pose) { p.pose = k; fo[i * STRIDE + 9] = U(((p.body & 1) * 8 + k) * 128); fo[i * STRIDE + 10] = -(p.body >> 1) * 256 / A; fdirty = true; }
      const hy = cp ? Math.atan2(cp.x - p.x, cp.z - p.z) : PI, by = up && p.jump ? Math.max(0, Math.sin(t * 2 * PI * p.beat + p.ph)) * 0.08 : 0;
      FAR.set(0, i, 0, mx.compose(v.set(p.x, p.y + 0.3 + by, p.z), q.setFromAxisAngle(Y, hy), sc.set(p.scale, p.scale, p.scale)));
      if (k === 5 && ng < BUDGET.glows) { const [hx, hy2] = FAR_HANDS[5]; const cx = Math.cos(hy), sx = Math.sin(hy); glowAt(ng++, v.set(p.x + cx * hx * p.scale, p.y + 0.3 + by + hy2 * p.scale, p.z - sx * hx * p.scale), cam, 0.5); }
    });
    FAR.meshes[0].instanceMatrix.needsUpdate = true; if (fdirty) FAR.dirtyAttrs(0);
    // (the phones up in the near hands, their lights; the extra lights the set asks for, the pit's)
    for (const p of near) if (p.phone && np < BUDGET.phones) {
      v.copy(p.phone); v.y += 0.03; phones.setMatrixAt(np++, mx.compose(v, q.setFromEuler(e.set(-0.15, p.bodyH, 0)), sc.set(1, 1, 1)));
      if (ng < BUDGET.glows) glowAt(ng++, v, cam, 0.55);
    }
    for (const at of extra) if (ng < BUDGET.glows) glowAt(ng++, at, cam, 0.55);
    phones.count = np; glows.count = ng; phones.instanceMatrix.needsUpdate = true; glows.instanceMatrix.needsUpdate = true;
    stats.ms = stats.ms * 0.9 + (performance.now() - t0) * 0.1; stats.lod0 = counts[0]; stats.lod1 = counts[1]; stats.phones = np; stats.glows = ng;
  }
  // (a phone's light: a soft disc turned to the lens, a little in front of the phone)
  function glowAt(k, at, cam, size) {
    if (cam) { q.copy(cam.quaternion); size *= Math.min(1, 0.22 + 0.026 * cam.position.distanceTo(at)); } else q.identity();
    glows.setMatrixAt(k, mx.compose(at, q, sc.set(size, size, size)));
  }
  const meshes = []; group.traverse((o) => { if (o.userData.crowd) meshes.push(o); });
  stats.drawCalls = meshes.length;
  return { tick, stats, meshes };
}
export { PARTS, BUDGET };
