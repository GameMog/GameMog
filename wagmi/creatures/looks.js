// A creature's look for one role, put on it at spawn without touching its rig or clips (W.creatures.spawn / fight:
// o.look; a story's boss: { look }). Each piece is its own mesh on the creature's bones, so every clip carries it; the
// pieces' materials join the fighter's (it flashes when hit and dissolves as one).
//   deacon   SF 2040's Deacon Vale, who leads the Iron Saints, on the creature knight: the plate blackened (the knight's
//            own map, darkened, a little more metal and polish); an off-white linen tabard front and back laid on his
//            plate as posed (its shape read off his own surface), wrapping his chest with soft folds, a saint's halo (a
//            ring with rays and a cross) on the breast, torn into strips at the hem; a leather belt with an iron buckle
//            over its join at the waist; a grey cloak over his shoulders and down his back
import * as THREE from 'three/webgpu';

export const LOOKS = new Set(['deacon']);

// a cloth's canvas: off-white linen, grimed toward the hem, the hem torn into ragged tongues (alpha), a halo painted on
function clothTex({ w = 256, h = 512, base = [214, 206, 188], grime = [92, 84, 70], halo = false, seed = 1 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  let s = seed * 9301 + 49297; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, `rgb(${base})`); g.addColorStop(0.6, `rgb(${base.map((v, i) => Math.round(v * 0.92 + grime[i] * 0.08))})`); g.addColorStop(1, `rgb(${base.map((v, i) => Math.round(v * 0.55 + grime[i] * 0.45))})`);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  // (the weave and stains)
  for (let i = 0; i < 1600; i++) { x.fillStyle = `rgba(${grime},${0.02 + r() * 0.05})`; x.fillRect(r() * w, r() * h, 1 + r() * 2, 4 + r() * 18); }
  for (let i = 0; i < 9; i++) { const yy = h * (0.5 + r() * 0.5); x.fillStyle = `rgba(${grime},${0.04 + r() * 0.06})`; x.beginPath(); x.ellipse(r() * w, yy, 8 + r() * 30, 6 + r() * 22, r() * 3, 0, Math.PI * 2); x.fill(); }
  if (halo) { // the saint's halo on the breast: a ring, rays, a cross inside; dried-blood red
    const cx = w / 2, cy = h * 0.2, R = w * 0.22; x.strokeStyle = 'rgba(122,28,24,0.92)'; x.fillStyle = 'rgba(122,28,24,0.92)'; x.lineWidth = w * 0.035;
    x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
    x.lineWidth = w * 0.018; for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; x.beginPath(); x.moveTo(cx + Math.cos(a) * R * 1.15, cy + Math.sin(a) * R * 1.15); x.lineTo(cx + Math.cos(a) * R * 1.45, cy + Math.sin(a) * R * 1.45); x.stroke(); }
    x.fillRect(cx - w * 0.022, cy - R * 0.75, w * 0.044, R * 1.5); x.fillRect(cx - R * 0.5, cy - R * 0.25, R, w * 0.044);
  }
  // the torn hem: tongues of cloth cut out at the bottom (alpha)
  const img = x.getImageData(0, 0, w, h), d = img.data; let tear = 0;
  for (let xx = 0; xx < w; xx++) { if (xx % 16 === 0) tear = h * (0.04 + r() * 0.16) * (0.4 + 0.6 * Math.abs(Math.sin(xx * 0.09 + seed))); for (let yy = Math.floor(h - tear); yy < h; yy++) d[(yy * w + xx) * 4 + 3] = 0;
    if (r() < 0.0) { const hy = h * (0.3 + r() * 0.5), hr = 2 + r() * 5; for (let yy = Math.floor(hy - hr); yy < hy + hr; yy++) for (let q = -hr; q < hr; q++) { const px = Math.floor(xx + q); if (px >= 0 && px < w && yy >= 0 && yy < h && Math.hypot(q, yy - hy) < hr) d[(yy * w + px) * 4 + 3] = 0; } } }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

/** Dress a creature fighter for a look. Returns the meshes added (or []). */
export function dressLook(f, look) {
  if (look !== 'deacon') return [];
  const B = f.bones, chest = B.chest || B.spine2, pelvis = B.pelvis || B.hips, mesh = f.made?.mesh; if (!chest || !pelvis || !mesh) return [];
  const added = [];
  // the plate blackened: the knight's own map and maps, darker, more metal, a little polish
  for (const m of f.mats) { if (m.color) m.color.setRGB(0.36, 0.34, 0.35); if ('metalness' in m) m.metalness = Math.min(1, (m.metalness ?? 0) + 0.25); if ('roughness' in m) m.roughness = Math.max(0.3, (m.roughness ?? 0.6) * 0.75); m.needsUpdate = true; }
  f.root.updateMatrixWorld(true); mesh.skeleton?.update?.();
  // his body as posed now, in his own frame (x across him, y up, z forward): on a 2 cm grid, the frontmost and backmost
  // point at each (x, y), and the highest at each (x, z), so the cloth is laid on his surface, not a board in front of it
  const inv = f.root.matrixWorld.clone().invert(), v = new THREE.Vector3(), G = 0.02, front = new Map(), backM = new Map(), topM = new Map(), ring = [];
  // (only his trunk and thighs for the tabard and belt (not an arm hanging in front of him), his shoulders for the cloak's top)
  const bones = mesh.skeleton.bones, bi = (re) => new Set(bones.map((b, i) => (re.test(b.name) ? i : -1)).filter((i) => i >= 0));
  const TRUNK = bi(/^(pelvis|spine1|spine2|chest|thigh_[LR])$/), SHOULD = bi(/^(chest|clavicle_[LR]|upperarm_[LR]|neck)$/);
  const SI = mesh.geometry.attributes.skinIndex, SW = mesh.geometry.attributes.skinWeight, share = (i, S) => { let w = 0; for (let k = 0; k < 4; k++) if (S.has(SI.getComponent(i, k))) w += SW.getComponent(i, k); return w; };
  const n = mesh.geometry.attributes.position.count, step = Math.max(1, Math.floor(n / 14000));
  for (let i = 0; i < n; i += step) { const tw = share(i, TRUNK), sw = share(i, SHOULD); if (tw < 0.6 && sw < 0.6) continue;
    mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld).applyMatrix4(inv);
    const kx = Math.round(v.x / G), ky = Math.round(v.y / G), kz = Math.round(v.z / G), a = kx + ',' + ky, b = kx + ',' + kz;
    if (tw >= 0.6) { front.set(a, Math.max(front.get(a) ?? -9, v.z)); backM.set(a, Math.min(backM.get(a) ?? 9, v.z)); ring.push(v.x, v.y, v.z); }
    if (sw >= 0.6) topM.set(b, Math.max(topM.get(b) ?? -9, v.y)); }
  const near = (M, x, y, pick, d0) => { const kx = Math.round(x / G), ky = Math.round(y / G); let best = null; for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { const q = M.get((kx + dx) + ',' + (ky + dy)); if (q != null) best = best == null ? q : pick(best, q); } return best ?? d0; };
  const surfF = (x, y) => near(front, x, y, Math.max, 0.12), surfB = (x, y) => near(backM, x, y, Math.min, -0.12), surfT = (x, z) => near(topM, x, z, Math.max, null);
  const toLocal = (bone) => bone.matrixWorld.clone().invert().multiply(f.root.matrixWorld);
  const wp = (b) => b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  const cl = wp(chest), pl = wp(pelvis), ul = B.upperarm_L ? wp(B.upperarm_L) : null, ur = B.upperarm_R ? wp(B.upperarm_R) : null;
  const span = ul && ur ? Math.abs(ul.x - ur.x) : 0.5, kk = f.k || 1;
  // (a sheet of cloth from rows of points (in his frame), its uvs, hung on a bone)
  const sheet = (bone, rowsXYZ, cols, mat) => {
    const pos = [], uv = [], idx = [], rows = rowsXYZ.length - 1;
    rowsXYZ.forEach((row, r) => row.forEach(([x, y, z], c) => { pos.push(x, y, z); uv.push(c / cols, 1 - r / rows); }));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const a = r * (cols + 1) + c, b2 = a + cols + 1; idx.push(a, b2, a + 1, a + 1, b2, b2 + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = true; toLocal(bone).decompose(m.position, m.quaternion, m.scale); bone.add(m);
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; added.push(m); return m; };
  const linen = (o) => new THREE.MeshStandardNodeMaterial({ map: clothTex(o), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95, metalness: 0 });
  // the tabard, front and back: from under the collar to above the knee, laid on him 12 mm off his plate, wrapping round
  // his chest's curve, with soft vertical folds deeper toward the hem; its top rides the chest, under the belt the hips
  const nk = B.neck ? wp(B.neck) : null, yTop = nk ? nk.y - 0.05 * kk : cl.y + (cl.y - pl.y) * 0.3, yBelt = pl.y + (cl.y - pl.y) * 0.32, yHem = pl.y - (cl.y - pl.y) * 0.9, W = span * 0.62, COLS = 12, ROWS = 14;
  const tabardRows = (y0, y1, side, rows) => { const out = []; for (let r = 0; r <= rows; r++) { const t = r / rows, y = y0 + (y1 - y0) * t, row = [];
    for (let c = 0; c <= COLS; c++) { const u = c / COLS, x = (u - 0.5) * W * (1 + 0.1 * Math.max(0, (yBelt - y) / (yBelt - yHem)));
      const fold = 0.007 * kk * Math.sin(u * Math.PI * 7 + 0.6) * (0.35 + 0.65 * Math.max(0, (yTop - y) / (yTop - yHem)));
      const z = side > 0 ? surfF(x, y) + 0.016 * kk + fold : surfB(x, y) - 0.016 * kk - fold; row.push([x, y, z]); } out.push(row); } return out; };
  const span01 = (yTop - yBelt) / (yTop - yHem);
  const mF = linen({ halo: true, seed: 3 }), mB = linen({ seed: 7 });
  for (const [m, sd] of [[mF, 1], [mB, -1]]) {
    const up = sheet(chest, tabardRows(yTop, yBelt, sd, 8), COLS, m), lo = sheet(pelvis, tabardRows(yBelt, yHem, sd, ROWS - 8), COLS, m);
    // (the texture's top part on the chest piece, the rest under the belt)
    for (const [mm, a, b] of [[up, 0, span01], [lo, span01, 1]]) { const U = mm.geometry.attributes.uv; for (let i = 0; i < U.count; i++) { const t = 1 - U.getY(i); U.setY(i, 1 - (a + (b - a) * t)); } }
  }
  // the belt: a band of dark leather round his waist over the tabard's join, its own shape all round him
  { const rows = [], NA = 40, yb = yBelt, hb = 0.045 * kk;
    for (const dy of [hb / 2, -hb / 2]) { const row = []; for (let k = 0; k <= NA; k++) { const a = (k / NA) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a); let r = 0;
      for (let i = 0; i < ring.length; i += 3) { if (Math.abs(ring[i + 1] - (yb + dy)) > 0.03) continue; const px = ring[i] - pl.x, pz = ring[i + 2] - pl.z, d = px * dx + pz * dz, side = Math.abs(px * dz - pz * dx); if (side < 0.04 && d > r) r = d; }
      r = (r || 0.16 * kk) + 0.022 * kk; row.push([pl.x + dx * r, yb + dy, pl.z + dz * r]); } rows.push(row); }
    const belt = sheet(pelvis, rows, NA, new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0.05, 0.032, 0.022), roughness: 0.65, metalness: 0, side: THREE.DoubleSide }));
    // (a buckle at the front: a small dark-iron plate)
    const bk = new THREE.Mesh(new THREE.BoxGeometry(0.06 * kk, 0.05 * kk, 0.012 * kk), new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0.18, 0.17, 0.16), roughness: 0.4, metalness: 0.8 }));
    const fr = rows[0][0], fr2 = rows[1][0]; bk.position.set(fr[0], (fr[1] + fr2[1]) / 2, fr[2] + 0.008 * kk);
    const holder = new THREE.Group(); toLocal(pelvis).decompose(holder.position, holder.quaternion, holder.scale); holder.add(bk); pelvis.add(holder); bk.castShadow = true; added.push(bk); void belt; }
  // the cloak: over his shoulders (a mantle from behind the neck down over each shoulder's top to the collarbone) and
  // down his back to the thigh, laid on his surface a little off it, folds toward its torn hem
  { const CC = 14, rowsC = [], Wc = span * 1.12;
    // the mantle: across the shoulders' tops, from the front of the collar back to the back of the neck
    const zF = (surfF(0, yTop) + 0.0) * 0.55, zBk = surfB(0, yTop);
    for (let r = 0; r <= 4; r++) { const t = r / 4, z = zF + (zBk - zF) * t, row = [];
      for (let c = 0; c <= CC; c++) { const x = (c / CC - 0.5) * Wc, yt = surfT(x, z); row.push([x, (yt ?? yTop) + 0.016 * kk, z]); } rowsC.push(row); }
    // then down the back
    const yC0 = rowsC[4][Math.floor(CC / 2)][1], yCh = pl.y - (cl.y - pl.y) * 0.55;
    for (let r = 1; r <= 12; r++) { const t = r / 12, row = [];
      for (let c = 0; c <= CC; c++) { const x = (c / CC - 0.5) * Wc * (1 + 0.15 * t), y0 = rowsC[4][c][1], y = y0 + (yCh - yC0) * t, fold = 0.01 * kk * Math.sin((c / CC) * Math.PI * 6) * t;
        row.push([x, y, Math.min(surfB(x * 0.92, y), rowsC[4][c][2]) - 0.045 * kk - Math.abs(fold) - 0.02 * t]); } rowsC.push(row); }
    sheet(chest, rowsC, CC, linen({ base: [126, 120, 110], grime: [54, 48, 42], seed: 11 })); }
  for (const m of added) { if (m.material) { m.material.alphaHash = false; if (!f.mats.includes(m.material)) f.mats.push(m.material); } }
  return added;
}
