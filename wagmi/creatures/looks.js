// A creature's look for one role, put on it at spawn without touching its rig or clips (W.creatures.spawn / fight:
// o.look; a story's boss: { look }). Each piece is its own mesh on the creature's bones, so every clip carries it; the
// pieces' materials join the fighter's (it flashes when hit and dissolves as one).
//   deacon   SF 2040's Deacon Vale, who leads the Iron Saints, on the creature knight: the plate blackened (the knight's
//            own map, darkened, a little more metal and polish), a tattered off-white tabard front and back from the
//            chest to the thigh with a saint's halo (a ring with rays and a cross) painted on the breast, a short torn
//            cloak over the shoulders
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
  for (let i = 0; i < 26; i++) { const yy = h * (0.35 + r() * 0.65); x.fillStyle = `rgba(${grime},${0.08 + r() * 0.12})`; x.beginPath(); x.ellipse(r() * w, yy, 8 + r() * 30, 6 + r() * 22, r() * 3, 0, Math.PI * 2); x.fill(); }
  if (halo) { // the saint's halo on the breast: a ring, rays, a cross inside; dried-blood red
    const cx = w / 2, cy = h * 0.2, R = w * 0.22; x.strokeStyle = 'rgba(122,28,24,0.92)'; x.fillStyle = 'rgba(122,28,24,0.92)'; x.lineWidth = w * 0.035;
    x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
    x.lineWidth = w * 0.018; for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; x.beginPath(); x.moveTo(cx + Math.cos(a) * R * 1.15, cy + Math.sin(a) * R * 1.15); x.lineTo(cx + Math.cos(a) * R * 1.45, cy + Math.sin(a) * R * 1.45); x.stroke(); }
    x.fillRect(cx - w * 0.022, cy - R * 0.75, w * 0.044, R * 1.5); x.fillRect(cx - R * 0.5, cy - R * 0.25, R, w * 0.044);
  }
  // the torn hem: tongues of cloth cut out at the bottom (alpha)
  const img = x.getImageData(0, 0, w, h), d = img.data; let tear = 0;
  for (let xx = 0; xx < w; xx++) { if (xx % 6 === 0) tear = h * (0.04 + r() * 0.16) * (0.4 + 0.6 * Math.abs(Math.sin(xx * 0.09 + seed))); for (let yy = Math.floor(h - tear); yy < h; yy++) d[(yy * w + xx) * 4 + 3] = 0;
    if (r() < 0.04) { const hy = h * (0.3 + r() * 0.5), hr = 2 + r() * 5; for (let yy = Math.floor(hy - hr); yy < hy + hr; yy++) for (let q = -hr; q < hr; q++) { const px = Math.floor(xx + q); if (px >= 0 && px < w && yy >= 0 && yy < h && Math.hypot(q, yy - hy) < hr) d[(yy * w + px) * 4 + 3] = 0; } } }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// a hanging panel: a strip of rows from `top` down `len`, `wd` wide, bowed out in front by `bow`, with soft folds
function panel(wd, len, bow, rows = 10, cols = 6) {
  const pos = [], uv = [], idx = [];
  for (let r = 0; r <= rows; r++) { const t = r / rows; for (let c = 0; c <= cols; c++) { const u = c / cols, s = u * 2 - 1;
    pos.push(s * wd * 0.5 * (1 + 0.12 * t), -len * t, bow * Math.sin(Math.PI * Math.min(1, t * 1.6)) * 0.6 + 0.008 * Math.sin(u * Math.PI * 5 + t * 3) * t - 0.02 * s * s); uv.push(u, 1 - t); } }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const a = r * (cols + 1) + c, b = a + cols + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

/** Dress a creature fighter for a look. Returns the meshes added (or []). */
export function dressLook(f, look) {
  if (look !== 'deacon') return [];
  const B = f.bones, chest = B.chest || B.spine2, pelvis = B.pelvis || B.hips; if (!chest || !pelvis) return [];
  const added = [];
  // the plate blackened: the knight's own map and maps, darker, more metal, a little polish
  for (const m of f.mats) { if (m.color) m.color.setRGB(0.36, 0.34, 0.35); if ('metalness' in m) m.metalness = Math.min(1, (m.metalness ?? 0) + 0.25); if ('roughness' in m) m.roughness = Math.max(0.3, (m.roughness ?? 0.6) * 0.75); m.needsUpdate = true; }
  f.root.updateMatrixWorld(true);
  // (sizes off its own bones: the chest to the hips, the shoulders' span)
  const wp = (b) => b.getWorldPosition(new THREE.Vector3()), cw = wp(chest), pw = wp(pelvis), drop = cw.distanceTo(pw);
  const ul = B.upperarm_L ? wp(B.upperarm_L) : null, ur = B.upperarm_R ? wp(B.upperarm_R) : null, span = ul && ur ? ul.distanceTo(ur) : drop * 1.2;
  const linen = (o) => new THREE.MeshStandardNodeMaterial({ map: clothTex(o), transparent: false, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95, metalness: 0 });
  // (a mesh hung on a bone at a world point and turn: its local frame worked out once from the bone's, so it rides it)
  const hang = (bone, mesh, at, yawOff = 0) => {
    const q = f.root.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawOff));
    const M = new THREE.Matrix4().compose(at, q, new THREE.Vector3(1, 1, 1)), L = bone.matrixWorld.clone().invert().multiply(M);
    L.decompose(mesh.position, mesh.quaternion, mesh.scale); bone.add(mesh); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; added.push(mesh);
  };
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(f.root.getWorldQuaternion(new THREE.Quaternion())); fwd.y = 0; fwd.normalize();
  // the tabard: front (with the halo) and back, from just under the collar to mid-thigh; its top half rides the chest,
  // the skirt the hips (two pieces each side, so it bends at the waist)
  const kk = f.k || 1, top = cw.clone().addScaledVector(new THREE.Vector3(0, 1, 0), drop * 0.22), wd = span * 0.7, depth = 0.165 * kk;
  const upper = top.y - pw.y, lower = drop * 0.75;
  const front = linen({ halo: true, seed: 3 }), back = linen({ seed: 7 });
  const piece = (mat, len, wdd, vTop, vBot) => { const g = panel(wdd, len, depth * 0.12); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const t = 1 - uv.getY(i); uv.setY(i, 1 - (vTop + (vBot - vTop) * t)); } return new THREE.Mesh(g, mat); };
  const split = upper / (upper + lower);
  for (const [m, s, yaw] of [[front, 1, 0], [back, -1, Math.PI]]) {
    const off = fwd.clone().multiplyScalar(s * depth);
    hang(chest, piece(m, upper, wd, 0, split), top.clone().add(off), yaw);
    hang(pelvis, piece(m, lower, wd * 1.05, split, 1), new THREE.Vector3(top.x, pw.y, top.z).add(off.clone().multiplyScalar(1.05)), yaw);
  }
  // a short torn cloak over the shoulders, down the back
  const cloak = linen({ base: [150, 144, 132], grime: [60, 54, 46], seed: 11 }), cl = new THREE.Mesh(panel(span * 0.95, drop * 1.25, depth * 0.25, 12, 8), cloak);
  hang(chest, cl, top.clone().addScaledVector(fwd, -depth * 1.12).addScaledVector(new THREE.Vector3(0, 1, 0), drop * 0.04), Math.PI);
  for (const m of added) { m.material.alphaHash = false; if (!f.mats.includes(m.material)) f.mats.push(m.material); }
  return added;
}
