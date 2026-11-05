// The Character Forge's copy of the talking face, for its talk gate (talkgate.mjs) and the studio (/cast/face.js).
// Copied from GameMog's Mog City face (its face.js, the
// morphs part only, unchanged): morphs for the face made from the model's own body before its first draw, the lips'
// parting, chin and lids found from the geometry (landmarks), not taken from anyone else's numbers.
//   morphFace(inner)   the body's meshes given the morphs jaw, lip, blink, blink2, brow, lookX, lookY
//                      -> { body, fm, morphed } (morphed: the meshes whose morphTargetDictionary has them)
//   chatter(t)         a mouth that moves at about four syllables a second, a pause now and then (no voice clip yet)

import * as THREE from 'three/webgpu';
import { attribute, materialColor } from 'three/tsl';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// a mouth's level talking when there is no voice to follow (the line has no recording, or the sound is off): syllables
// at about four a second, a pause now and then
export const chatter = (t) => Math.max(0, Math.sin(t * 25.1) * 0.5 + 0.5) * (0.35 + 0.65 * Math.max(0, Math.sin(t * 5.3 + 1.1))) * (Math.sin(t * 1.3) > -0.75 ? 1 : 0);

/* ------------------------------------------------------------ landmarks -- */
// Found on the body as it was built (its primitives' shared vertices, the skin's triangles):
//  - the eyeballs: a sphere fitted to each one's vertices (least squares: x²+y²+z² = 2a·x + 2b·y + 2c·z + e)
//  - the lips' parting: the head cut by planes x = const (the mid-line and out toward the corners). Going down the
//    outline from under the nose, its frontmost point recedes as the upper lip curls in under itself, then jumps
//    forward: the lower lip's top. The parting is just over that (on Jane's model this finds her hand-found 62.9 mm
//    under her eyes to the tenth of a mm)
//  - the chin: under the parting, where the outline's front falls 2 cm back from the lower lip's (under the chin)
//  - the lids' opening: the outline through the eye's middle, the skin within a few mm of the eyeball in front of it:
//    the gap in it is the opening, its edges the lids' margins (by angle about the eyeball's middle)
function fitEyes(P, eyeV) {
  const p = V();
  return [1, -1].map((side) => {
    const A = Array.from({ length: 4 }, () => new Float64Array(5));
    for (const v of eyeV) { p.fromBufferAttribute(P, v); if (p.x * side <= 0) continue; const r = [2 * p.x, 2 * p.y, 2 * p.z, 1], s = p.lengthSq();
      for (let i = 0; i < 4; i++) { for (let j = 0; j < 4; j++) A[i][j] += r[i] * r[j]; A[i][4] += r[i] * s; } }
    for (let c = 0; c < 4; c++) { let m = c; for (let r = c + 1; r < 4; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r; [A[c], A[m]] = [A[m], A[c]];
      for (let r = 0; r < 4; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 5; k++) A[r][k] -= f * A[c][k]; } }
    const c = V(A[0][4] / A[0][0], A[1][4] / A[1][1], A[2][4] / A[2][2]);
    return { side, c, r: Math.sqrt(Math.max(1e-8, c.lengthSq() + A[3][4] / A[3][3])) };
  });
}
export function landmarks(P, skinIx, eyes) {
  const e0 = eyes[0], ey = e0.c.y, front = e0.c.z + e0.r;
  // (the skin's triangles about the face, once)
  const tri = [];
  for (let i = 0; i < skinIx.length; i += 3) { const a = skinIx[i]; if (P.getY(a) > ey - 0.17 && P.getY(a) < ey + 0.03 && P.getZ(a) > front - 0.12) tri.push(skinIx[i], skinIx[i + 1], skinIx[i + 2]); }
  // the skin cut by the plane x = x0: its segments [y1, z1, y2, z2, ...]
  const cut = (x0) => {
    const s = [];
    for (let i = 0; i < tri.length; i += 3) {
      let k = 0; const q = [0, 0, 0, 0];
      for (let e = 0; e < 3; e++) { const a = tri[i + e], c = tri[i + (e + 1) % 3], sa = P.getX(a) - x0, sc = P.getX(c) - x0;
        if (sa * sc < 0 && k < 4) { const u = sa / (sa - sc); q[k++] = P.getY(a) + u * (P.getY(c) - P.getY(a)); q[k++] = P.getZ(a) + u * (P.getZ(c) - P.getZ(a)); } }
      if (k === 4) s.push(...q);
    }
    return s;
  };
  const frontAt = (s, y) => { let f = -Infinity; for (let i = 0; i < s.length; i += 4) { const y1 = s[i], y2 = s[i + 2]; if ((y1 - y) * (y2 - y) < 0) f = Math.max(f, s[i + 1] + (y - y1) / (y2 - y1) * (s[i + 3] - s[i + 1])); } return f; };
  const parting = (s) => {
    let prev = null;
    for (let dy = -0.035; dy >= -0.11; dy -= 0.0002) {
      const y = ey + dy, fz = frontAt(s, y);
      if (prev && fz - prev.fz > 0.0015 && fz > front - 0.03) return { y: (y + prev.y) / 2 + 0.0004, z: fz };
      prev = { y, fz };
    }
    return null;
  };
  // the parting across the mouth: at the mid-line, then out toward each corner while the lips still part there (a jump
  // more than 3 mm from the middle's is something else: the nose's wing)
  const mid = cut(0.0015), m0 = parting(mid);
  if (!m0) return null;
  const part = [[0, m0.y, m0.z]];
  for (const x0 of [0.004, 0.007, 0.01, 0.013, 0.016, 0.019, 0.022]) { const p = parting(cut(x0)); if (p && Math.abs(p.y - m0.y) < 0.003) part.push([x0, p.y, p.z]); }
  // the chin
  let chin = null;
  for (let y = m0.y - 0.02; y > ey - 0.16; y -= 0.0005) if (frontAt(mid, y) < m0.z - 0.02) { chin = y; break; }
  // the lids' opening (the right eye's; the model is the same both sides)
  const s = cut(e0.c.x), ang = [];
  for (let i = 0; i < s.length; i += 4) for (let u = 0; u <= 1; u += 0.1) {
    const y = s[i] + u * (s[i + 2] - s[i]) - e0.c.y, z = s[i + 1] + u * (s[i + 3] - s[i + 1]) - e0.c.z, r = Math.hypot(y, z);
    if (z > 0 && r < e0.r + 0.005 && r > e0.r - 0.003) ang.push(Math.atan2(y, z));
  }
  ang.sort((a, b) => a - b);
  let lids = null;
  for (let i = 1; i < ang.length; i++) { const g = ang[i] - ang[i - 1]; if (ang[i] > -0.9 && ang[i - 1] < 0.9 && (!lids || g > lids.gap)) lids = { gap: g, lo: ang[i - 1], up: ang[i] }; }
  if (lids && (lids.gap < 0.25 || lids.gap > 0.9)) lids = null;
  return { ey, front, parting: part, lipZ: m0.z, chin, lids };
}

// which lip each vertex about the parting belongs to (round 3: a split by height alone took the upper lip's underside,
// which curls in a mm or so under the lower lip's top, down with the jaw: saw-teeth across the open mouth). The lips
// are two surfaces that only touch at the parting, joined in the mouth's corners and far back inside it: a vertex goes
// with the lip it is nearer to along the skin (its edges' lengths) from the lips well above and well below the
// parting; only the lips themselves, their front SHELL m deep (further in, the mouth's floor and roof meet at its back,
// and the floor would go with the upper lip that way: a sheet across the open mouth). -> (v) => 1 lower lip .. 0
// upper, for vertices within BAND of the parting (null elsewhere: those go by their height)
const BAND = 0.006, SHELL = 0.009;
function lipSides(P, ix, fmAt, lipZAt) {
  // (the skin welded where its vertices are split along its texture's seams)
  const key = (v) => `${Math.round(P.getX(v) * 2e5)},${Math.round(P.getY(v) * 2e5)},${Math.round(P.getZ(v) * 2e5)}`;
  const ids = new Map(), wid = new Int32Array(P.count).fill(-1), near = (v) => Math.abs(P.getX(v)) < 0.04 && Math.abs(P.getY(v) - fmAt(Math.abs(P.getX(v)))) < BAND + 0.006 && P.getZ(v) > lipZAt(Math.abs(P.getX(v))) - SHELL;
  const wOf = (v) => { if (wid[v] < 0) { const k = key(v); if (!ids.has(k)) ids.set(k, ids.size); wid[v] = ids.get(k); } return wid[v]; };
  const adj = new Map(), at = new Map();
  for (let i = 0; i < ix.length; i += 3) {
    const t = [ix[i], ix[i + 1], ix[i + 2]]; if (!t.every(near)) continue;
    for (let e = 0; e < 3; e++) {
      const a = wOf(t[e]), b = wOf(t[(e + 1) % 3]), len = Math.hypot(P.getX(t[e]) - P.getX(t[(e + 1) % 3]), P.getY(t[e]) - P.getY(t[(e + 1) % 3]), P.getZ(t[e]) - P.getZ(t[(e + 1) % 3]));
      at.set(a, t[e]); at.set(b, t[(e + 1) % 3]);
      (adj.get(a) || adj.set(a, []).get(a)).push(b, len); (adj.get(b) || adj.set(b, []).get(b)).push(a, len);
    }
  }
  // each side's distance, from its seeds (the lip beyond the band), relaxed until nothing gets nearer
  const dist = (up) => {
    const d = new Map();
    for (const [w, v] of at) { const y = P.getY(v) - fmAt(Math.abs(P.getX(v))); if (up ? y > BAND : y < -BAND) d.set(w, 0); }
    for (let pass = 0, moved = true; moved && pass < 400; pass++) {
      moved = false;
      for (const [w, list] of adj) { const dw = d.get(w); if (dw == null) continue; for (let k = 0; k < list.length; k += 2) { const n = list[k], nd = dw + list[k + 1]; if (nd < (d.get(n) ?? Infinity)) { d.set(n, nd); moved = true; } } }
    }
    return d;
  };
  const dU = dist(true), dL = dist(false);
  return (v) => {
    if (!near(v) || Math.abs(P.getY(v) - fmAt(Math.abs(P.getX(v)))) > BAND) return null;
    const w = wid[v]; if (w < 0) return null; const u = dU.get(w) ?? Infinity, l = dL.get(w) ?? Infinity;
    if (u === Infinity && l === Infinity) return null;
    return sstep(-0.0015, 0.0015, u - l);
  };
}

/* --------------------------------------------------------------- morphs -- */
// the face's morphs (round 2 on Jane, the owner: "her lips don't move and eyes when talk to match voice"; round 3 on
// all of them), made from the body before its first draw. Its primitives share one buffer of vertices, so each morph
// is one set of offsets over all of it, given to the primitives it moves:
//   jaw             the chin and lower lip turned down about the jaw's hinge, split from the upper lip at the parting
//   lip             the upper lip up 2 mm in the middle (with the jaw: an open mouth, not only a dropped lower lip)
//   blink, blink2   the upper lids, and the lashes on them, turned down over the eyes about each eyeball's middle (the
//                   lower lids up a little to meet them): blink to half way, blink2 the rest, so the lid follows the
//                   eyeball's curve and never cuts into it half way (a morph moves in a straight line)
//   brow            the brows and the forehead over them up 6 mm (and the hair over the forehead, for a fringe)
//   lookX, lookY    the eyeballs turned about their own middles, LOOK rad toward their left / up at 1 (-1 the other way)
export const LOOK = 0.3;
// (Jane's, round 2: her lids turn down 0.74 rad, the lower ones up 0.12; her opening is 0.53 rad, its middle 0.55 mm
// under her eyeballs' middles: another opening gets the same 0.21 rad of overlap, its split moved with its middle)
const LID = { up: 0.74, lo: 0.12, over: 0.21, mid: -0.00055 };
// (beard: a model's beard shells over the skin, Mr. Big's: they go with the jaw and the upper lip as the skin under them does)
// (teethLow: Gears' and Fiona's lower teeth and tongue, built into their bodies (cast2, 28 Oct): down with the jaw as the
// chin's skin goes; their upper row, 'teethUp', stays on the head)
const MORPHS = { skin: ['jaw', 'lip', 'blink', 'blink2', 'brow'], lashes: ['blink', 'blink2'], brows: ['brow'], eyes: ['lookX', 'lookY'], hair: ['brow'], beard: ['jaw', 'lip'], teethLow: ['jaw'] };
// opt: fix { parting (m under the eyes' middle), chin (the same), lipZ (m ahead of the eyes' front), lidUp, lidMid }: numbers found by hand, in place of the
// finder's (Jane keeps her round-2 ones); hair: the fringe goes up with the brows (a model whose hair is in its body)
// forged: the forge's landmarks (the GLB's extras.forge.landmarks). Where the forge had to carry a landmark (the shapes
// closed the lips or the lids past what the finder reads) or this finder finds nothing, the forge's numbers are used.
export function faceMorphs(meshes, { fix: fix0 = {}, hair = false, forged = null } = {}) {
  const by = {}; for (const m of meshes) if (m.material && !by[m.material.name]) by[m.material.name] = m;
  if (!by.skin || !by.eyes) return null;
  const g0 = by.skin.geometry; if (g0.userData.face) return g0.userData.face;
  const P = g0.attributes.position, n = P.count;
  const verts = (m) => (m ? new Set(m.geometry.index.array) : new Set());
  const eyeV = verts(by.eyes), p = V(), d = V();
  const eyes = fitEyes(P, eyeV);
  const eyeOf = (x) => (x >= 0 ? eyes[0] : eyes[1]);
  const ey = eyes[0].c.y, front = eyes[0].c.z + eyes[0].r;
  const lm = landmarks(P, by.skin.geometry.index.array, eyes) || {};
  const fix = { ...fix0 }, F = forged, src = F?.source || {};
  if (F && F.below != null && fix.parting == null && (!lm.parting || src.parting === 'carried')) { fix.parting = F.below / 1000; if (F.front != null) fix.lipZ = F.front / 1000; }
  if (F && F.chin != null && fix.chin == null && (lm.chin == null || src.chin === 'carried')) fix.chin = F.chin / 1000;
  if (F?.lidInfo && fix.lidUp == null && (!lm.lids || src.lids === 'carried')) { fix.lidUp = F.lidInfo.lidUp; fix.lidMid = F.lidInfo.lidMidMm / 1000; }
  // the parting's height across the mouth (by the distance from the mid-line), the chin, the lips' front (fix.lipZ: the
  // lips' front ahead of the eyes' front, found by hand with the parting; without it, the finder's or 25 mm)
  const lipZ0 = fix.lipZ != null ? front + fix.lipZ : lm.lipZ;
  const part = fix.parting != null ? [[0, ey - fix.parting, lipZ0 ?? front + 0.025]] : lm.parting || [[0, ey - 0.0629, front + 0.025]];
  const along = (j) => (ax) => { let i = 0; while (i < part.length - 1 && part[i + 1][0] <= ax) i++; const a = part[i], b = part[i + 1]; return !b ? a[j] : a[j] + (b[j] - a[j]) * clamp((ax - a[0]) / (b[0] - a[0])); };
  const fmAt = along(1), lipZAt = along(2);
  const fm = part[0][1], chin = fix.chin != null ? ey - fix.chin : lm.chin ?? ey - 0.1055;
  const lipZ = lipZ0 ?? front + 0.025;
  // (the jaw's hinge 35 mm under the eyes and 85 mm behind their fronts on Jane; a longer face, a hinge further off)
  const k = clamp((ey - chin) / 0.1055, 0.85, 1.25), hinge = [ey - 0.035 * k, front - 0.085 * k];
  // the lids: how far the upper ones turn down to close, and where upper and lower split (the opening's middle)
  const lidUp = fix.lidUp ?? (lm.lids ? lm.lids.up - lm.lids.lo + LID.over : LID.up);
  const lidMid = fix.lidMid ?? (lm.lids ? eyes[0].r * (Math.sin(lm.lids.up) + Math.sin(lm.lids.lo)) / 2 : LID.mid), sh = lidMid - LID.mid;
  const off = () => new Float32Array(n * 3), out = { jaw: off(), lip: off(), blink: off(), blink2: off(), brow: off(), lookX: off(), lookY: off() };
  // (a vertex turned about the eye's middle by a about x: down over the front for a > 0; its offset into the two stages:
  // the first half of the turn, then the rest)
  const lid = (v, e, a) => {
    d.fromBufferAttribute(P, v).sub(e.c); const rho = Math.hypot(d.y, d.z), phi = Math.atan2(d.y, d.z);
    const at = (s) => [rho * Math.sin(phi - a * s), rho * Math.cos(phi - a * s)], h = at(0.5), f = at(1);
    out.blink[v * 3 + 1] = h[0] - d.y; out.blink[v * 3 + 2] = h[1] - d.z; out.blink2[v * 3 + 1] = f[0] - h[0]; out.blink2[v * 3 + 2] = f[1] - h[1];
  };
  // (the forehead over the brows, up with them: fading out by the hairline, and toward the temples)
  const foreW = (e) => sstep(e.c.y + 0.002, e.c.y + 0.012, p.y) * (1 - sstep(e.c.y + 0.035, e.c.y + 0.058, p.y)) * (1 - sstep(0.056, 0.072, Math.abs(p.x))) * sstep(e.c.z - 0.03, e.c.z - 0.01, p.z);
  const side = lipSides(P, by.skin.geometry.index.array, fmAt, lipZAt);
  let lids = 0, brows = 0;
  for (const v of by.beard || by.teethLow ? new Set([...verts(by.skin), ...verts(by.beard), ...verts(by.teethLow)]) : verts(by.skin)) {
    p.fromBufferAttribute(P, v); const e = eyeOf(p.x); d.copy(p).sub(e.c); const r = d.length();
    // the lids: the upper turned down, all of it near the eye's opening, less out to the crease; the lower up a little
    if (d.z > 0 && r < 0.022) {
      const up = sstep(0.022, 0.0135, r) * sstep(-0.003 + sh, 0.001 + sh, d.y), lo = sstep(0.019, 0.012, r) * sstep(0.0 + sh, -0.003 + sh, d.y);
      if (up > 0.002) { lid(v, e, lidUp * up); lids++; } else if (lo > 0.002) { lid(v, e, -LID.lo * lo); lids++; }
    }
    const fw = foreW(e);
    if (fw > 0.002) { out.brow[v * 3 + 1] = 0.006 * fw; brows++; }
    // the jaw: turned down 0.2 rad about the hinge below the ears, all of the face below the parting (a clean split, so
    // the lips come apart), the split softer toward the mouth's corners; fading out to the jaw's corners, behind, and
    // under the chin
    // (about the parting, the lip each vertex is part of, out to where the mouth's corners join the lips: lipSides)
    const sv = side(v);
    { const ax = Math.abs(p.x), dz = front - p.z, corner = sstep(0.011, 0.026, ax), soft = 0.0006 + 0.008 * corner, f = fmAt(ax), byY = sstep(f + soft, f - soft, p.y);
      let w = (sv == null ? byY : sv + (byY - sv) * corner) * (1 - sstep(0.035, 0.06, ax) * sstep(0.02, 0.07, dz)) * (1 - sstep(0.06, 0.1, dz));
      if (p.y < chin) w *= 1 - sstep(0.0, 0.025, chin - p.y);
      if (w > 0.002 && dz < 0.13) { const a = 0.2 * w, y = p.y - hinge[0], z = p.z - hinge[1], c = Math.cos(a), s = Math.sin(a);
        out.jaw[v * 3 + 1] = y * c - z * s - y; out.jaw[v * 3 + 2] = y * s + z * c - z; } }
    // the upper lip, over the parting, its middle most (its corners stay); not the mouth's inside behind it
    { const f = fmAt(Math.abs(p.x)), upper = sv == null ? sstep(f - 0.0001, f + 0.0012, p.y) : 1 - sv;
      const lw = sstep(0.027, 0.008, Math.abs(p.x)) * sstep(f + 0.017, f + 0.005, p.y) * upper * sstep(lipZ - 0.031, lipZ - 0.011, p.z);
      if (lw > 0.002) { out.lip[v * 3 + 1] = 0.0021 * lw; out.lip[v * 3 + 2] = 0.0006 * lw; } }
  }
  for (const v of verts(by.lashes)) { const e = eyeOf(P.getX(v)); if (P.getY(v) > e.c.y - 0.002 + sh) lid(v, e, lidUp); }
  for (const v of verts(by.brows)) out.brow[v * 3 + 1] = 0.0062;
  if (hair) for (const v of verts(by.hair)) { p.fromBufferAttribute(P, v); const fw = foreW(eyeOf(p.x)); if (fw > 0.002) out.brow[v * 3 + 1] = 0.006 * fw; }
  // the eyeballs: turned about their middles (to the left: about y; up: about x, the other way)
  const qx = new THREE.Quaternion(), qy = new THREE.Quaternion();
  for (const v of eyeV) {
    const e = eyeOf(P.getX(v)); d.fromBufferAttribute(P, v).sub(e.c);
    p.copy(d).applyQuaternion(qx.setFromAxisAngle(V(0, 1, 0), LOOK)).sub(d); out.lookX.set([p.x, p.y, p.z], v * 3);
    p.copy(d).applyQuaternion(qy.setFromAxisAngle(V(1, 0, 0), -LOOK)).sub(d); out.lookY.set([p.x, p.y, p.z], v * 3);
  }
  const attr = {};
  for (const [k2, a] of Object.entries(out)) { attr[k2] = new THREE.BufferAttribute(a, 3); attr[k2].name = k2; }
  // the mouth's inside, darker the deeper it lies behind the face's front (no light gets in there: open, the mouth
  // showed its floor lit pink). Each vertex about the mouth is looked at from in front: how far behind the skin in front
  // of it, if any, it is (the lips' inner sides a little darker, the inside of the mouth dark; the face itself, the front
  // of it, as it was). A 'mouthShade' on the skin, read by its material (shadeMouth)
  { const ix = by.skin.geometry.index.array, T = [];
    const inMouth = (v) => Math.abs(P.getX(v)) < 0.045 && P.getY(v) > fm - 0.035 && P.getY(v) < fm + 0.022 && P.getZ(v) > lipZ - 0.11;
    for (let i = 0; i < ix.length; i += 3) if (inMouth(ix[i]) || inMouth(ix[i + 1]) || inMouth(ix[i + 2])) T.push(ix[i], ix[i + 1], ix[i + 2]);
    const shade = new Float32Array(n).fill(1);
    for (const v of verts(by.skin)) {
      const x = P.getX(v), y = P.getY(v), z = P.getZ(v), ax = Math.abs(x);
      if (ax > 0.04 || y < fm - 0.03 || y > fm + 0.018 || z > lipZAt(ax) - 0.0015) continue;
      // (the frontmost skin straight in front of it: a ray along +z)
      let top = -Infinity;
      for (let i = 0; i < T.length; i += 3) {
        const a = T[i], b = T[i + 1], c = T[i + 2], x1 = P.getX(a), y1 = P.getY(a), x2 = P.getX(b), y2 = P.getY(b), x3 = P.getX(c), y3 = P.getY(c);
        const det = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3); if (Math.abs(det) < 1e-12) continue;
        const l1 = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / det, l2 = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / det, l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const zh = l1 * P.getZ(a) + l2 * P.getZ(b) + l3 * P.getZ(c); if (zh > top) top = zh;
      }
      const deep = top - z;
      if (deep > 0.0015) shade[v] = 1 - 0.88 * sstep(0.0015, 0.008, deep) * (1 - sstep(0.03, 0.04, ax));
    }
    by.skin.geometry.setAttribute('mouthShade', new THREE.BufferAttribute(shade, 1));
  }
  // each primitive given the morphs that move it (the shoes and the clothes none; the hair only for a fringe)
  for (const m of meshes) {
    const list = (MORPHS[m.material?.name] || []).filter((k2) => attr[k2] && (m.material.name !== 'hair' || hair));
    m.geometry.morphAttributes = list.length ? { position: list.map((k2) => attr[k2]) } : {};
    m.geometry.morphTargetsRelative = true;
  }
  const r3 = (x) => +x.toFixed(4);
  return (g0.userData.face = {
    eyes: eyes.map((e) => ({ c: e.c.clone(), r: e.r })), lids, brows,
    // (what was found, in mm under the eyes' middle: for the logs)
    found: { parting: part.map(([x, y]) => [r3(x * 1000), r3((ey - y) * 1000)]), lipZ: r3((part[0][2] - front) * 1000), chin: r3((ey - chin) * 1000), lidUp: r3(lidUp), lidMid: r3(lidMid * 1000), hinge: [r3((ey - hinge[0]) * 1000), r3((front - hinge[1]) * 1000)], fixed: Object.keys(fix) },
  });
}

/* ------------------------------------------------------------- the face -- */
// a face on a model: its body's meshes given the morphs (faceMorphs), each one's own list of them
function morphMeshes(inner, opt) {
  // (the body: every primitive drawing from the skin's list of vertices, the shoes and the hair too, so a morph the
  // GLB had of its own goes from all of them)
  let skin = null; inner.traverse((o) => { if (!skin && o.isSkinnedMesh && o.material?.name === 'skin') skin = o; });
  const body = [];
  if (skin) inner.traverse((o) => { if (o.isSkinnedMesh && o.geometry.attributes.position === skin.geometry.attributes.position) body.push(o); });
  const fm = faceMorphs(body, opt), morphed = [];
  if (skin && skin.geometry.attributes.mouthShade) skin.material = shadeMouth(skin.material);
  for (const m of body) {
    const list = (m.geometry.morphAttributes.position || []).map((a, i) => a.name || (i ? String(i) : 'jaw'));
    if (list.length) {
      m.morphTargetDictionary = Object.fromEntries(list.map((k, i) => [k, i])); m.morphTargetInfluences = list.map(() => 0); morphed.push(m);
      // (a model already drawn before its face was made: its material built again, with the morphs in it)
      m.material.needsUpdate = true;
    } else { m.morphTargetDictionary = undefined; m.morphTargetInfluences = undefined; }
  }
  return { body, fm, morphed };
}

// the skin's material as a node material whose colour is darkened by the geometry's 'mouthShade' (once a material)
const shaded = new WeakMap();
function shadeMouth(m) {
  if (!m || m.userData?.mouthShade) return m;
  if (shaded.has(m)) return shaded.get(m);
  const nm = m.isMeshPhysicalMaterial ? new THREE.MeshPhysicalNodeMaterial() : new THREE.MeshStandardNodeMaterial();
  for (const k of ['name', 'color', 'map', 'normalMap', 'normalMapType', 'normalScale', 'roughness', 'roughnessMap', 'metalness', 'metalnessMap', 'emissive', 'emissiveMap', 'emissiveIntensity', 'aoMap', 'aoMapIntensity', 'alphaMap', 'alphaTest', 'transparent', 'opacity', 'side', 'envMapIntensity', 'vertexColors', 'flatShading', 'depthWrite', 'depthTest', 'sheen', 'sheenColor', 'sheenRoughness', 'clearcoat', 'clearcoatRoughness', 'specularIntensity', 'specularColor'])
    if (m[k] !== undefined && k in nm) nm[k] = m[k];
  nm.colorNode = materialColor.mul(attribute('mouthShade', 'float'));
  nm.userData = { ...m.userData, mouthShade: true };
  shaded.set(m, nm);
  return nm;
}

const _q = new THREE.Quaternion(), _w = new THREE.Quaternion();
function turnWorld(b, q) { b.getWorldQuaternion(_w); const want = q.clone().multiply(_w); b.parent.getWorldQuaternion(_w); b.quaternion.copy(_w.invert().multiply(want)); b.updateMatrixWorld(true); }

export const morphFace = (inner, opt) => morphMeshes(inner, opt);
