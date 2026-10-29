// Mog City: Jane, in person and on calls. Dan's girlfriend since college (an adult, mid-20s; docs/STORY.md has her look
// and voice), who pieces the evidence together: her own model (assets/characters/jane.glb, built from a MakeHuman-built
// human like the rest of the cast; idle, talk, phone, sit, sitTalk, wave, arms, shrug, walk, pickup; a 'jaw' morph so her
// mouth moves as she talks), on Dan's skeleton (upperarm01_, lowerarm01_, wrist_).
//   const J = await buildJane(W)    { root, inner, bones, mixer, rig, clips, top, jaw(k), arm(side, target, pole, w),
//                                    face: { set({ blink, brow, lookX, lookY }), aim(at, opt), live(dt, o), blink() } }
//                                    (also on root.userData.jane)
//   janePortrait(el, { crop })       her video feed in a call card: frames of her baked from the model, in her room at
//                                    night, the screens behind her, her mouth with her voice; -> { talk(on), stop() }
//   janeVoice()                      her voice now ({ level, t, text }) while one of her lines plays, else null
//   createJaneRoom(W, J)             her room as a little scene of its own (the bake shoots the call's frames in it)
//   buildLaptop()                    her laptop (open, the trace on its screen: .screen(on))
// W.jane = { build, portrait, spawn(at) } is set the first time this module sees WAGMI.
import * as THREE from 'three/webgpu';
import { loadGLB } from '../glb.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { positionLocal, normalLocal, positionView, normalViewGeometry, mx_worley_noise_float, float, vec3, mix, smoothstep, dFdx, dFdy, cross, dot, sign, abs, normalize } from 'three/tsl';
import { rig, clamp } from './cine.js';
import { createFace, voiceOf, mouthFollower, chatter, subLine } from '../face.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const PI = Math.PI;
// the call's frames: one sheet of COLS x ROWS frames, 9:16 each (her room behind her), her head and collar. A row for
// each of her head's poses (0 straight to the camera, 1 a little tilt and turn, 2 turned toward her screens, 3 chin up
// with her brows raised: a question), a column for each face in it: her mouth shut, half open, open, a blink, a glance
// off the camera (her mouth shut). (23 Oct, round 2: lip-sync; before it, pairs of shut / open per gesture)
export const SHEET = { url: 'assets/characters/jane-call.webp', cols: 5, rows: 4, w: 360, h: 640 };
export const FACE = { shut: 0, half: 1, open: 2, blink: 3, glance: 4 };

let janeP = null;
const janeGLB = () => janeP || (janeP = loadGLB('assets/characters/jane.glb'));
const MH_ARM = ['upperarm01_', 'lowerarm01_', 'wrist_'];

/* ------------------------------------------------------------- her model -- */
// her puff as hair (23 Oct): the model's puff is a smooth ball in her hair's dark brown (its vertex colours), which read
// as a flat dark blob. Here it is curls: clusters of them about 2.5 cm across raising its surface (so its outline is
// lumpy, not a ball's), the tight coils in each (~7 mm) as a bump in the light, their tops a lighter brown and glossier,
// their hollows darker. Cellular noise in the puff's own space, so the curls ride with her head.
let puffMat = null;
function curlyPuff() {
  if (puffMat) return puffMat;
  const m = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, name: 'puff' });
  const p = positionLocal;
  const cluster = float(1.0).sub(mx_worley_noise_float(p.mul(40.0)));
  const coil = float(1.0).sub(mx_worley_noise_float(p.mul(140.0).add(vec3(3.1, 7.7, 1.3))));
  m.positionNode = p.add(normalLocal.mul(cluster.mul(0.009).sub(0.003)));
  // (the coils' and clusters' height turned into the surface's tilt: the bump from the screen-space derivatives)
  const h = coil.mul(0.0024).add(cluster.mul(0.004)), nv = normalViewGeometry;
  const dpx = dFdx(positionView), dpy = dFdy(positionView), dhx = dFdx(h), dhy = dFdy(h);
  const r1 = cross(dpy, nv), r2 = cross(nv, dpx), det = dot(dpx, r1);
  m.normalNode = normalize(abs(det).mul(nv).sub(sign(det).mul(dhx.mul(r1).add(dhy.mul(r2)))));
  const lift = smoothstep(0.35, 0.95, coil);
  m.colorNode = vec3(1.0, 0.94, 0.88).mul(mix(float(0.65), float(1.85), lift.mul(lift))).mul(mix(float(0.65), float(1.3), cluster));
  m.roughnessNode = mix(float(0.9), float(0.64), lift);
  return (puffMat = m);
}

// her face's morphs (23 Oct, round 2, the owner: "her lips don't move and eyes when talk to match voice"): made from
// the GLB's body before its first draw, in place of the GLB's own jaw (wagmi/face.js, round 3: the same for all of the
// cast now). Her numbers are measured on her model (.scratch/jane/profile.mjs; face.js's finder misses her lips, whose
// parting is a gentle step): her lips part 63.4 mm under her eyes' middle, their front 16.2 mm ahead of her eyes' front
// (without it the split between the lips looked 25 mm out, found none of them, and went by height alone: the upper
// lip's underside went down with the jaw in a zigzag, read as fangs), her chin 104.3 mm under them; her lids turn down
// 0.74 rad
const JANE_FACE = { parting: 0.0634, chin: 0.1043, lipZ: 0.0162, lidUp: 0.74, lidMid: -0.00055 };
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// her hoodie on a call and across a table (23 Oct, round 2): the cloth over her chest had come out of the export in
// facets (the shell is welded coarse there), and its shading read as a figure under it. On the torso (not the sleeves,
// not the collar) its normals are made a loose, boxy garment's: no up or down in them (it hangs), its front flat across
// and rounding only at the sides, and soft vertical folds falling from the chest to the hem
function hoodieNormals(mesh) {
  const g = mesh.geometry; if (g.userData.boxy) return; g.userData.boxy = true;
  const P = g.attributes.position, N = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const arm = new Set(mesh.skeleton.bones.map((b, i) => (/^(upperarm|lowerarm|shoulder|wrist|finger)/.test(b.name) ? i : -1)).filter((i) => i >= 0));
  const n = V(), b = V();
  for (let v = 0; v < P.count; v++) {
    let aw = 0; for (let j = 0; j < 4; j++) if (arm.has(si.getComponent(v, j))) aw += sw.getComponent(v, j);
    const x = P.getX(v), y = P.getY(v), z = P.getZ(v), ax = Math.abs(x);
    const w = (1 - sstep(0.15, 0.4, aw)) * sstep(0.88, 0.95, y) * (1 - sstep(1.37, 1.43, y)) * (1 - sstep(0.17, 0.2, ax));
    if (w <= 0) continue;
    n.fromBufferAttribute(N, v);
    // (the box: flat across the front and the back, rounding over the last 8 cm to the sides)
    const fz = clamp((z - 0.015) / 0.05, -1, 1), side = Math.sign(x) * (sstep(0.08, 0.18, ax) * 2.6 + ax * 0.6);
    // (the folds: a few soft ones 5-6 cm apart, wandering a little as they fall, fading out up by the collar)
    const fold = 0.16 * Math.sin(x * 118 + Math.sin(y * 7.3 + x * 20) * 1.4) * (1 - sstep(1.2, 1.38, y));
    b.set(side + fold, -0.04, fz).normalize();
    n.lerp(b, w).normalize(); N.setXYZ(v, n.x, n.y, n.z);
  }
  N.needsUpdate = true;
}

// her voice now, while one of her lines is playing: { level 0..1, t (s into it), dur, text }; null when none of hers is
// (face.js voiceOf); mouthFollower: a mouth from a voice level (face.js)
export function janeVoice(W = typeof window !== 'undefined' ? window.WAGMI : null) { return voiceOf(W, 'Jane'); }
export { mouthFollower };

// her teeth, round 3 (27 Oct, the owner: "jane needs teeth"). Measured on her (the lips' opening in the bind space, mm
// from the parting): talking (jaw 0.3) her lips part from +0.2 down to -6.2, wide (0.58) to -11.6. The band before ran
// from +0.3 down to -9 and so filled the whole opening: dim, a grey disc; bright, a mouthguard. Now as a mouth has them:
//  - the upper row: centrals 8.4 mm, laterals 6.4, canines 7.4, a premolar, round an arch 6.3 mm behind her lips' front
//    (going back 0.03 mm per mm^2 out); their biting edges 2.6 mm under the parting (the laterals' 0.6 higher, the
//    canines a rounded point): as she talks 2-3 mm of them under her upper lip, the dark of her mouth below. Each tooth
//    drawn into a texture (teethMap): its own outline, rounded corners and the notches between teeth cut out, a convex
//    shade across it, a hairline between neighbours; warm off-white, darker up under her lip and round to the sides
//  - the lower row: 3.3 mm behind the upper, smaller teeth, their tops 1.1 mm under the parting with her mouth shut,
//    turning down with her jaw (the same turn about the same hinge as her chin's skin, face.js): on a wide vowel a mm of
//    them over her lower lip, in the upper row's shade
//  - her tongue, low behind them and going down with them, dark; the mouth's back (the export's ball) dark and moved
//    back 9 mm so it no longer stands in front of them; the inside of her cheeks darkened past where face.js stops
// All of it is built in the skin's bind space (face.js's frame: y up, +z her front) and hung on the head bone by its
// inverse bind (as face.js turns the head)
const TEETH = {
  // z: the arch's front (mm from the lips' front), c: its curve, y0..y1: the band (mm from the parting), S: its half
  // length along the arch; teeth from the middle out: [width, edge, corner radii mesial, distal | 'cusp']
  up: { z: -6.3, c: 0.03, y0: 4.5, y1: -4.5, S: 26, teeth: [[8.4, -2.6, 0.6, 1.1], [6.4, -2.0, 1.0, 1.6], [7.4, -2.35, 'cusp'], [6.8, -1.7, 1.5, 1.5]] },
  lo: { z: -9.6, c: 0.036, y0: 0, y1: -8, S: 21, teeth: [[5.3, -1.1, 0.35, 0.6], [5.8, -1.15, 0.6, 0.9], [6.6, -1.45, 'cusp'], [6.8, -0.9, 1.4, 1.4]] },
};
function teethMap(T, lower) {
  const CW = 1024, CH = 256, cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
  const cx = cv.getContext('2d'), img = cx.createImageData(CW, CH), D = img.data, sg = lower ? -1 : 1;
  const spans = []; let s0 = 0; for (const t of T.teeth) { spans.push([s0, s0 + t[0], t]); s0 += t[0]; }
  const cr = (q, r) => (q < r ? r - Math.sqrt(Math.max(0, r * r - (r - q) ** 2)) : 0);
  for (let i = 0; i < CW; i++) {
    const s = -T.S + (2 * T.S * (i + 0.5)) / CW, a = Math.abs(s), sp = spans.find((q) => a < q[1]) || spans[spans.length - 1];
    const w = sp[1] - sp[0], u = Math.min(w, a - sp[0]), t = sp[2];
    // (the tooth's edge here: the biting edge, raised round its corners; a canine's a soft point)
    let e;
    if (t[2] === 'cusp') { const d = Math.abs(u - w / 2) / (w / 2); e = t[1] + sg * (0.75 * (Math.sqrt(d * d + 0.04) - 0.2) + cr(u, 0.9) + cr(w - u, 0.9)); }
    else e = t[1] + sg * (cr(u, t[2]) + cr(w - u, t[3]));
    const x = (u / w) * 2 - 1, across = (1 - 0.22 * x * x) * (0.72 + 0.28 * sstep(0, 0.16, Math.min(u, w - u)));
    for (let j = 0; j < CH; j++) {
      const y = T.y0 + ((T.y1 - T.y0) * (j + 0.5)) / CH, inn = sg * (y - e), al = clamp(inn / 0.09 + 0.5, 0, 1);
      // (warm ivory, yellower toward the gum, a touch greyer in the last half mm of the edge)
      const g = sstep(2.5, 7, inn), k = across * (0.88 + 0.12 * sstep(0, 0.6, inn)), o = (j * CW + i) * 4;
      D[o] = (242 - 16 * g) * k; D[o + 1] = (234 - 26 * g) * k; D[o + 2] = (216 - 40 * g) * k; D[o + 3] = al * 255;
    }
  }
  cx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}
// (a row's band round its arch, in the bind space: part the parting's height, lipZ the lips' front)
function teethBand(T, part, lipZ, lower) {
  const tab = [[0, 0]]; for (let x = 0, s = 0; s < T.S + 1; ) { const d = 0.02, sl = 2 * T.c * x; s += d * Math.sqrt(1 + sl * sl); x += d; tab.push([s, x]); }
  const xAt = (s) => { const a = Math.abs(s); let i = 1; while (i < tab.length - 1 && tab[i][0] < a) i++; const [s1, x1] = tab[i - 1], [s2, x2] = tab[i]; return Math.sign(s) * (x1 + ((x2 - x1) * (a - s1)) / Math.max(1e-9, s2 - s1)); };
  const N = Math.round((2 * T.S) / 0.7), ROWS = [T.y0, (T.y0 * 2 + T.y1) / 3, lower ? -2 : 1.5, lower ? -0.8 : -1, T.y1];
  if (lower) ROWS.sort((p, q) => q - p);
  const pos = [], nor = [], uv = [], col = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const s = -T.S + (2 * T.S * i) / N, x = xAt(s), n = new THREE.Vector3(2 * T.c * x, lower ? 0.15 : 0.06, 1).normalize();
    // (round to the sides, into the mouth's corners' shade: by a canine they are in the dark, as a mouth's are)
    const side = 1 - (lower ? 0.92 * sstep(2.5, 12, Math.abs(s)) : 0.88 * sstep(4.5, 17, Math.abs(s)));
    for (const y of ROWS) {
      pos.push(x / 1000, part + y / 1000, lipZ + (T.z - T.c * x * x) / 1000); nor.push(n.x, n.y, n.z); uv.push((s + T.S) / (2 * T.S), (y - T.y1) / (T.y0 - T.y1));
      const k = side * (lower ? 0.5 * (0.5 + 0.5 * sstep(-4, -0.8, y)) : 0.32 + 0.68 * sstep(3.2, -2, y)); col.push(k, k, k);
    }
  }
  const R = ROWS.length; for (let i = 0; i < N; i++) for (let r = 0; r < R - 1; r++) { const a = i * R + r, b = a + R; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  return g;
}
const teethMat = (T, lower) => { const m = new THREE.MeshStandardMaterial({ map: teethMap(T, lower), vertexColors: true, alphaTest: 0.5, roughness: 0.42, metalness: 0, side: THREE.DoubleSide, name: lower ? 'teethLow' : 'teeth' }); m.envMapIntensity = 0.35; return m; };
// her mouth's inside, built on her face: the rows, the tongue, the back; her jaw's turn given to the lower row and the
// tongue whenever her face sets it (face.jaw wrapped)
function janeMouth(inner, face, teeth, back) {
  let skin = null; inner.traverse((o) => { if (!skin && o.isSkinnedMesh && o.material?.name === 'skin') skin = o; });
  const fr = face.rig, head = skin && skin.skeleton.bones.find((b) => b.name === 'head');
  if (!skin || !head || !fr?.eyes || !teeth) return;
  const BI = skin.skeleton.boneInverses[skin.skeleton.bones.indexOf(head)].clone().multiply(skin.bindMatrix);
  const e = fr.eyes, ey = (e[0].c.y + e[1].c.y) / 2, front = e[0].c.z + e[0].r, part = ey - JANE_FACE.parting, lipZ = front + JANE_FACE.lipZ;
  const hn = fr.found?.hinge || [34.6, 84.0], hy = ey - hn[0] / 1000, hz = front - hn[1] / 1000;
  // the upper row: on the export's teeth node (under the head bone), its frame the bind space
  teeth.geometry = teethBand(TEETH.up, part, lipZ, false); teeth.material = teethMat(TEETH.up, false);
  teeth.matrixAutoUpdate = false; teeth.matrix.copy(BI); teeth.castShadow = false; teeth.receiveShadow = false; teeth.renderOrder = 1;
  // the lower row and the tongue, turning with the jaw
  const low = new THREE.Group(); low.name = 'janeLowerMouth'; low.matrixAutoUpdate = false; low.matrix.copy(BI); head.add(low);
  const lt = new THREE.Mesh(teethBand(TEETH.lo, part, lipZ, true), teethMat(TEETH.lo, true)); lt.frustumCulled = false; low.add(lt);
  const tg = new THREE.SphereGeometry(1, 28, 14), TP = tg.attributes.position, tc = [];
  // (its top 1 mm under the lower teeth's, its front 2 mm behind them: on a wide vowel a dark hint of it over them)
  for (let v = 0; v < TP.count; v++) { const x = TP.getX(v), y = TP.getY(v), z = TP.getZ(v), k = 0.05 + 0.42 * sstep(0, 1, y) * (0.35 + 0.65 * sstep(-0.5, 0.9, z)); tc.push(k, k, k);
    TP.setXYZ(v, x * 0.0158, part - 0.0072 + y * 0.0062, lipZ - 0.0275 + z * 0.0157); }
  tg.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3)); tg.computeVertexNormals();
  const tm = new THREE.MeshStandardMaterial({ color: '#a24a4c', vertexColors: true, roughness: 0.5, metalness: 0, name: 'tongue' }); tm.envMapIntensity = 0.15;
  const tongue = new THREE.Mesh(tg, tm); tongue.frustumCulled = false; low.add(tongue);
  // the back: dark, moved back 9 mm and down 2 (in the bind space)
  if (back) {
    back.updateMatrix(); const Bm = BI.clone().invert().multiply(back.matrix).premultiply(new THREE.Matrix4().makeTranslation(0, -0.002, -0.009));
    back.matrixAutoUpdate = false; back.matrix.copy(BI).multiply(Bm);
    back.material = new THREE.MeshStandardMaterial({ color: '#2a0c0a', roughness: 1, metalness: 0, name: 'mouthBack' }); back.material.envMapIntensity = 0;
  }
  // (the inside of her cheeks: face.js darkens the mouth's inside 4 cm either side of its middle; past that, seen at
  // three-quarter through her open mouth, her cheek's inner wall showed lit, a flat orange patch beside her teeth. The
  // same test out to 6 cm, for her: a point of her skin about the mouth with skin in front of it (a ray to her front) is
  // inside her mouth, darker the deeper it lies)
  const g = skin.geometry, sh = g.attributes.mouthShade;
  if (sh && !g.userData.janeCheeks) {
    g.userData.janeCheeks = true; const P = g.attributes.position, ix = g.index.array, T = [];
    const about = (v) => Math.abs(P.getX(v)) < 0.065 && Math.abs(P.getY(v) - part) < 0.03 && P.getZ(v) > lipZ - 0.06;
    for (let i = 0; i < ix.length; i += 3) if (about(ix[i]) && about(ix[i + 1]) && about(ix[i + 2])) T.push(ix[i], ix[i + 1], ix[i + 2]);
    let n = 0;
    for (const v of new Set(T)) {
      const x = P.getX(v), y = P.getY(v), z = P.getZ(v), ax = Math.abs(x); if (ax < 0.03 || ax > 0.06 || Math.abs(y - part) > 0.02) continue;
      let top = -Infinity;
      for (let i = 0; i < T.length; i += 3) {
        const a = T[i], b = T[i + 1], c = T[i + 2], x1 = P.getX(a), y1 = P.getY(a), x2 = P.getX(b), y2 = P.getY(b), x3 = P.getX(c), y3 = P.getY(c);
        const det = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3); if (Math.abs(det) < 1e-12) continue;
        const l1 = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / det, l2 = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / det, l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue; const zh = l1 * P.getZ(a) + l2 * P.getZ(b) + l3 * P.getZ(c); if (zh > top) top = zh;
      }
      const deep = top - z; if (deep > 0.002) { const k = 1 - 0.9 * sstep(0.002, 0.009, deep); if (k < sh.array[v]) { sh.array[v] = k; n++; } }
    }
    sh.needsUpdate = true; g.userData.janeCheeksN = n;
  }
  const H = new THREE.Matrix4(), Rx = new THREE.Matrix4(), Hi = new THREE.Matrix4();
  // (their tone: off-white, not paper (0.55 of the map: more, and a park lamp took them to paper white); with her lips shut a slit of them showed white along the parting,
  // so they come up from a third of that as her mouth opens)
  const set = (k) => { const a = 0.2 * clamp(k, 0, 1); H.makeTranslation(0, hy, hz); Hi.makeTranslation(0, -hy, -hz); Rx.makeRotationX(a); low.matrix.copy(BI).multiply(H).multiply(Rx).multiply(Hi);
    const f = 0.55 * (0.3 + 0.7 * sstep(0.01, 0.12, k)); teeth.material.color.setScalar(f); lt.material.color.setScalar(f); };
  const jaw0 = face.jaw; face.jaw = (k) => { jaw0(k); set(k); };
  set(0);
}

// her lids with her eyes (28 Oct, round 3; the critic: in the trailer's room shot she opened on a wide-eyed glare, the
// whites over her irises as she read her laptop). face.aim turns the eyes alone, so looking down her upper lids stayed
// up. Now, as a face's do, they come down with the eyes (LIDS of the way to shut at the eyes' lowest), her brows held
// where they are (the lids' morph drags the skin under the brows down a little: BROWS of it given back, or reading her
// screen she frowned); and a quick look up (her laptop's ping, then to whoever she's talking to) lifts her brows a
// little, easing back over half a second. Whatever a caller sets (a blink, raised brows) still wins where it is more.
const LIDS = 0.35, BROWS = 0.9, LIFT = 0.3;
function lidsWithEyes(face) {
  if (!face || face.set.__lids) return;
  const set0 = face.set, st = { blink: 0, brow: 0, y: 0, t: -1, lift: 0 };
  face.set = (o = {}) => {
    if (o.blink != null) st.blink = o.blink;
    if (o.brow != null) st.brow = o.brow;
    if (o.lookY != null) {
      const now = performance.now() / 1000, dt = now - st.t;
      // (only from frame to frame of a running scene: set by hand a frame at a time (the call's bake), nothing lifts)
      if (dt > 0 && dt < 0.1) { st.lift *= Math.exp(-dt / 0.5); if (o.lookY > st.y) st.lift = Math.max(st.lift, clamp(((o.lookY - st.y) / dt) * 0.08, 0, LIFT)); }
      else st.lift = 0;
      st.y = o.lookY; st.t = now;
    }
    const down = clamp(-st.y, 0, 1) * LIDS;
    return set0({ ...o, blink: Math.max(st.blink, down), brow: Math.max(st.brow, st.lift + down * BROWS) });
  };
  face.set.__lids = true;
}

// her gait: the walk (Bandai Namco Research Motion Dataset, retargeted to her own rig, assets/characters/jane.glb) was
// captured at this speed on her legs, in place: a scene walking her at v m/s plays it at v / GAIT.walk, so her feet stay
// planted (27 Oct)
export const GAIT = { walk: 1.281 };

export async function buildJane(W, { scene = W.app.scene, auto = true } = {}) {
  const gltf = await janeGLB();
  const root = new THREE.Group(); root.name = 'Jane';
  const inner = skClone(gltf.scene); root.add(inner);
  // (the export's armature node, the parent of the bone 'root', carries a fixed turn of 11 deg that no clip moves: 8 deg
  // forward and 7 over to her right. Every clip stood her on it, leaning forward and to the side, her hips 20 cm ahead of
  // her feet. Taken out, as Dan's is (wagmi/game.js); her clips are made for it (her soles on the ground, no lift))
  const armature = inner.getObjectByName('root')?.parent;
  if (armature && armature !== inner) armature.quaternion.identity();
  let teeth = null, back = null;
  inner.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    if (o.material && o.material.name === 'puff') o.material = curlyPuff();
    // (the short curls under her band: their cards caught a park lamp as white streaks; matte and a shade darker)
    if (o.material && o.material.name === 'hair' && !o.material.userData.toned) { o.material.roughness = 0.88; o.material.color.multiplyScalar(0.8); o.material.userData.toned = true; }
    // (her hair's cut-out strands: a plain cut-out, no alpha to coverage. Round 3's strand cards have soft edges all
    // round her silhouette, and where the frame isn't multisampled (the game's own view: the meet over her shoulder)
    // alpha to coverage dithered them into a fringe of black dots)
    if (o.material && o.material.name === 'hairStrands' && o.material.alphaTest > 0) o.material.alphaToCoverage = false;
    if (o.isSkinnedMesh && o.name === 'hoodie') hoodieNormals(o);
    if (!o.isSkinnedMesh && o.material?.color?.getHexString() === 'e8e2d8') teeth = o;
    if (!o.isSkinnedMesh && o.material?.color?.getHexString() === '2a0e0c') back = o;
  });
  // (her teeth, her tongue, the mouth's back: janeMouth, once her face is made)
  const bones = {}; inner.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  inner.updateMatrixWorld(true);
  const top = new THREE.Box3().setFromObject(inner).max.y;
  const mixer = new THREE.AnimationMixer(inner);
  const clipMap = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
  if (clipMap.idle) clipMap.thugIdle = clipMap.idle;
  root.visible = false; scene?.add(root);

  /* her face (wagmi/face.js): the morphs set straight (the call's bake), her head turned toward a point after the rig
     has posed it, and live(dt, o) each frame of a scene, after her pose: her mouth from her voice, blinks every 2-6 s,
     her eyes glancing between what she looks at (o.look) and what she glances at (o.alt), her head following them a
     little and nodding with her words, her brows up on a question. Between scenes it runs itself (her eyes on whoever
     is nearest); auto: false for the bake, which sets it by hand */
  const face = createFace(W, { speaker: 'Jane', inner, bones, head: true, open: 0.5, fix: JANE_FACE, auto });
  if (teeth && !teeth.userData.set) { janeMouth(inner, face, teeth, back); teeth.userData.set = true; }
  lidsWithEyes(face);
  const P = {
    root, inner, bones, mixer, rig: rig(mixer, clipMap), clips: Object.keys(clipMap), top, face,
    // her mouth, 0 (shut) .. 1 (wide); about 0.35 is talking
    jaw: (k) => face.jaw(k),
    // talking: the mouth's opening at time t (s) while she speaks, from a voice level when there is one (face.live does
    // more: her voice itself, her eyes)
    talk(t, on, level = null) { P.jaw(!on ? 0 : level != null ? 0.08 + level * 0.5 : 0.12 + 0.28 * Math.max(0, Math.sin(t * 17) * Math.sin(t * 5.3 + 1.1))); },
    arm: (side, target, pole, w) => armTo(bones, side, target, pole, w),
  };
  root.userData.jane = P;
  return P;
}

// two-bone reach for her arm (side 'L' | 'R'): the wrist to a world point, the elbow toward pole, by weight w
const _q = new THREE.Quaternion(), _w = new THREE.Quaternion();
function turnWorld(b, q) { b.getWorldQuaternion(_w); const want = q.clone().multiply(_w); b.parent.getWorldQuaternion(_w); b.quaternion.copy(_w.invert().multiply(want)); b.updateMatrixWorld(true); }
export function armTo(B, side, target, pole, w = 1) {
  const b1 = B[MH_ARM[0] + side], b2 = B[MH_ARM[1] + side], b3 = B[MH_ARM[2] + side];
  if (!b1 || !b2 || !b3 || w <= 0) return;
  const q1 = b1.quaternion.clone(), q2 = b2.quaternion.clone();
  const a = b1.getWorldPosition(V()), b = b2.getWorldPosition(V()); let c = b3.getWorldPosition(V());
  const la = a.distanceTo(b), lb = b.distanceTo(c), d = clamp(target.distanceTo(a), 0.05, la + lb - 1e-3);
  const cur = a.clone().sub(b).normalize().angleTo(c.clone().sub(b).normalize());
  const want = Math.acos(clamp((la * la + lb * lb - d * d) / (2 * la * lb), -1, 1));
  const n = V().crossVectors(a.clone().sub(b), c.clone().sub(b)); if (n.lengthSq() < 1e-8) n.set(1, 0, 0); n.normalize();
  turnWorld(b2, _q.setFromAxisAngle(n, want - cur));
  c = b3.getWorldPosition(V());
  turnWorld(b1, _q.setFromUnitVectors(c.sub(a).normalize(), target.clone().sub(a).normalize()));
  const ax = target.clone().sub(a).normalize(), e = b2.getWorldPosition(V()).sub(a), p = pole.clone().sub(a);
  e.addScaledVector(ax, -e.dot(ax)); p.addScaledVector(ax, -p.dot(ax));
  if (e.lengthSq() > 1e-6 && p.lengthSq() > 1e-6) { let ang = e.angleTo(p); if (V().crossVectors(e, p).dot(ax) < 0) ang = -ang; turnWorld(b1, _q.setFromAxisAngle(ax, ang)); }
  if (w < 0.999) { b1.quaternion.slerpQuaternions(q1, b1.quaternion.clone(), w); b2.quaternion.slerpQuaternions(q2, b2.quaternion.clone(), w); b1.updateMatrixWorld(true); }
}

/* ------------------------------------------------------------ her laptop -- */
// open on a table: the base at the origin, its front (and the screen) toward +z, where she sits; a sticker on the back
// of the lid; screen(mode): 'off' | 'scan' (lines of her tools) | 'trace' (the burner's twin, a red ping on a map)
export function buildLaptop() {
  const g = new THREE.Group(); g.name = 'jane-laptop';
  const shell = new THREE.MeshStandardMaterial({ color: '#2B2F38', roughness: 0.45, metalness: 0.5 });
  const keysM = new THREE.MeshStandardMaterial({ color: '#111318', roughness: 0.8 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.018, 0.24), shell); base.position.y = 0.009; g.add(base);
  const kb = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.002, 0.11), keysM); kb.position.set(0, 0.019, -0.03); g.add(kb);
  const hinge = new THREE.Group(); hinge.position.set(0, 0.018, -0.12); hinge.rotation.x = -0.32; g.add(hinge);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.23, 0.01), shell); lid.position.set(0, 0.115, -0.005); hinge.add(lid);
  const c = document.createElement('canvas'); c.width = 512; c.height = 320; const x = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.2), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.25, 1.25, 1.25) }));
  // (the screen on the lid's inside, toward her: the base's front, +z)
  scr.position.set(0, 0.115, 0.0008); hinge.add(scr);
  // (her sticker on the back of the lid: a little yellow smiley, the one her room's SUNY poster has)
  const st = new THREE.Mesh(new THREE.CircleGeometry(0.03, 20), new THREE.MeshStandardMaterial({ color: '#FFC93C', roughness: 0.6 }));
  st.position.set(0.06, 0.14, -0.0105); st.rotation.y = PI; hinge.add(st);
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } });
  let mode = '', tick = -1;
  // (the trace's ping redrawn ten times a second, not every frame)
  g.userData.screen = (m, t = 0) => {
    if (m === mode && (m !== 'trace' || Math.floor(t * 10) === tick)) return; mode = m; tick = Math.floor(t * 10);
    x.fillStyle = '#071021'; x.fillRect(0, 0, 512, 320);
    if (m === 'off') { tex.needsUpdate = true; return; }
    if (m === 'scan') {
      x.font = '700 18px "Barlow Condensed", monospace'; x.fillStyle = '#6CB8FF';
      ['> burner: 2 SIMs, 1 eSIM', '> imei 35-209100-... batch 0x4E', '> same batch, same buyer: 2', '> twin: last ping 20 min', '> tracing...'].forEach((l, i) => x.fillText(l, 22, 46 + i * 34));
    } else {
      x.fillStyle = '#0B1630'; x.fillRect(0, 0, 512, 320);
      x.fillStyle = '#16243C'; for (let i = 0; i < 7; i++) x.fillRect(30 + i * 70, 0, 8, 320); for (let j = 0; j < 6; j++) x.fillRect(0, 20 + j * 55, 512, 4);
      x.strokeStyle = '#FFC93C'; x.setLineDash([6, 6]); x.lineWidth = 3; x.beginPath(); x.moveTo(120, 300); x.lineTo(210, 210); x.lineTo(300, 140); x.stroke(); x.setLineDash([]);
      const r = 8 + 14 * ((t * 0.8) % 1);
      x.fillStyle = '#EF4444'; x.beginPath(); x.arc(300, 140, 9, 0, PI * 2); x.fill();
      x.strokeStyle = `rgba(239,68,68,${1 - ((t * 0.8) % 1)})`; x.lineWidth = 3; x.beginPath(); x.arc(300, 140, r + 6, 0, PI * 2); x.stroke();
      x.fillStyle = '#fff'; x.font = '700 22px "Barlow Condensed", sans-serif'; x.fillText('TWIN · 7 AV & W 47 ST', 318, 132);
    }
    tex.needsUpdate = true;
  };
  g.userData.screen('off');
  return g;
}

/* -------------------------------------------------------------- her room -- */
// Her room at night, a scene of its own like Mr. Big's study (mrbig.js): a dark blue wall, a desk of screens with code on them behind
// her, warm string lights, a SUNY poster, a desk lamp; she stands at her desk in her hoodie, the call's camera at her eye
// level. full(cam): drawn in place of the city's frame (the bake's shots), null to stop.
export function createJaneRoom(W, J) {
  const app = W.app, renderer = app.renderer;
  const scene = new THREE.Scene(); scene.name = 'wagmi-jane-room'; scene.background = new THREE.Color('#060A14');
  scene.add(J.root); J.root.position.set(0, 0, 0); J.root.rotation.set(0, 0, 0); J.root.visible = true; J.face.hold = true;
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); scene.add(b); return b; };
  box(8, 5, 0.1, new THREE.MeshStandardMaterial({ color: '#16233F', roughness: 0.95 }), 0, 2.2, -1.6);
  box(8, 0.1, 6, new THREE.MeshStandardMaterial({ color: '#15110F', roughness: 0.8 }), 0, -0.05, 0);
  // the screens on the desk behind her: code and charts, blue
  const scr = (seed, title) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 300; const x = c.getContext('2d');
    let s = seed; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    x.fillStyle = '#06101F'; x.fillRect(0, 0, 512, 300);
    x.font = '600 17px monospace';
    for (let i = 0; i < 13; i++) { x.fillStyle = R() < 0.3 ? '#FFC93C' : R() < 0.5 ? '#9FD3FF' : '#4E8FD8'; x.fillText('JPB-' + Math.floor(R() * 1e12).toString(16) + '  ' + ['buy', 'sell', 'fill', 'cancel', 'route'][Math.floor(R() * 5)] + '  ' + (R() * 100).toFixed(2), 16, 28 + i * 21); }
    x.fillStyle = 'rgba(255,255,255,.75)'; x.font = '700 20px "Barlow Condensed", sans-serif'; x.fillText(title, 330, 290);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const frameM = new THREE.MeshStandardMaterial({ color: '#0D0F14', roughness: 0.5, metalness: 0.4 });
  [[-0.62, 1.42, -1.1, 0.35, 'TRACE · 01'], [0.66, 1.46, -1.1, -0.32, 'TRADES'], [0.05, 1.86, -1.35, 0, 'ORDER BOOK']].forEach(([x, y, z, ry, t], i) => {
    const f = box(0.86, 0.52, 0.04, frameM, x, y, z); f.rotation.y = ry;
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.46), new THREE.MeshBasicMaterial({ map: scr(31 + i * 97, t), color: new THREE.Color(1.3, 1.35, 1.5) })); s.position.z = 0.022; f.add(s);
  });
  // a SUNY poster, the string lights over it
  const pc = document.createElement('canvas'); pc.width = 256; pc.height = 340; const px = pc.getContext('2d');
  px.fillStyle = '#1B1430'; px.fillRect(0, 0, 256, 340); px.strokeStyle = '#FFC93C'; px.lineWidth = 6; px.strokeRect(10, 10, 236, 320);
  px.fillStyle = '#FFC93C'; px.font = '800 120px "Barlow Condensed", sans-serif'; px.textAlign = 'center'; px.fillText('SUNY', 128, 210);
  const pt = new THREE.CanvasTexture(pc); pt.colorSpace = THREE.SRGBColorSpace;
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.66), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.9 })); poster.position.set(-1.25, 1.75, -1.54); scene.add(poster);
  const bulbM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.7, 0.8) });
  for (let i = 0; i < 22; i++) { const u = i / 21, x = -2.2 + u * 4.4, y = 2.42 - Math.sin(u * PI) * 0.22 + Math.sin(i * 1.7) * 0.02; const b = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), bulbM); b.position.set(x, y, -1.5); scene.add(b); }
  // the light: her screens' blue from in front and behind (a laptop's glow on her face), the warm string lights, a lamp
  scene.add(new THREE.AmbientLight('#2A3550', 0.7));
  const key = new THREE.PointLight('#CFE2FF', 3.2, 0, 2); key.position.set(0.15, 1.55, 0.75); scene.add(key);
  const warm = new THREE.PointLight('#FFC27A', 2.2, 0, 2); warm.position.set(-0.9, 2.1, -0.9); scene.add(warm);
  const rim = new THREE.PointLight('#6CB8FF', 2.6, 0, 2); rim.position.set(0.7, 1.7, -0.9); scene.add(rim);
  const fill = new THREE.PointLight('#FFD9B0', 1.0, 0, 2); fill.position.set(-0.8, 1.2, 0.8); scene.add(fill);
  const cam = new THREE.PerspectiveCamera(36, 9 / 16, 0.05, 30);
  const state = { full: null };
  const rp = app.renderPipeline, render0 = rp.render.bind(rp);
  rp.render = function (...a) {
    if (state.full) {
      try {
        const c = state.full; cam.position.set(...c.pos); cam.lookAt(c.look[0], c.look[1], c.look[2]);
        const asp = c.aspect || app.cameraSystem.camera.aspect || 16 / 9; if (cam.fov !== c.fov || cam.aspect !== asp) { cam.fov = c.fov; cam.aspect = asp; cam.updateProjectionMatrix(); }
        renderer.setRenderTarget(null); renderer.render(scene, cam); return;
      } catch (e) { console.warn('[jane] room', e); state.full = null; }
    }
    return render0(...a);
  };
  return { scene, cam, full(c) { state.full = c || null; }, dispose() { rp.render = render0; } };
}

/* -------------------------------------------------- her face on a call -- */
// el: the card's element (its size is the card's); crop 'phone' (the whole 9:16 frame: her head and collar) or 'face'
// (the caller's tile: the same, a touch closer). The frames come from the sheet (SHEET), on the portrait's own clock,
// every frame: her mouth with her voice (janeVoice: shut, half or open by how loud she is), a blink every 2-6 s and a
// glance off the camera now and then while her mouth is shut, her head's pose changing every few seconds while she
// talks (a quick cross-fade) and her brows up through the end of a question; and the picture itself moving a little, a phone held
// in a hand, her head nodding with her words. talk(on): her line is up (the callers' word for it: with no recording of
// the line playing she chatters to it); speaking(): the same, asked every frame, in place of talk()
// (the sheet loaded once, ahead of the first call: until it is in, the feed stays clear and what the card had under it
// shows, her initial; it is never an empty square)
let sheetImg = null;
const sheetReady = () => { if (!sheetImg) { sheetImg = new Image(); sheetImg.src = SHEET.url; } return sheetImg.complete && sheetImg.naturalWidth > 0; };
if (typeof window !== 'undefined') sheetReady();
// (her eyes sit this far down a frame: the tile's crop is centred on them)
const EYES = 0.45;
export function janePortrait(el, { crop = 'phone', speaking = null } = {}) {
  const S = SHEET, zoom = crop === 'face' ? 1.06 : 1;
  const box = document.createElement('div'); box.className = 'jane-feed';
  Object.assign(box.style, { position: 'absolute', inset: '0', overflow: 'hidden', backgroundColor: '#0A1222', opacity: sheetReady() ? '1' : '0', transition: 'opacity .2s' });
  const wrap = document.createElement('div'); Object.assign(wrap.style, { position: 'absolute', inset: '0', willChange: 'transform' }); box.appendChild(wrap);
  const layer = () => { const d = document.createElement('div'); Object.assign(d.style, { position: 'absolute', inset: '0', backgroundImage: `url(${S.url})`, backgroundRepeat: 'no-repeat' }); wrap.appendChild(d); return d; };
  // (A the frame now; B the one before it over it, fading out when her pose changes)
  const A = layer(), B = layer(); B.style.opacity = '0';
  if (!sheetReady()) sheetImg.addEventListener('load', () => { box.style.opacity = '1'; api.resize(); }, { once: true });
  el.appendChild(box);
  let dims = null, cur = -1;
  const measure = () => {
    const r = el.getBoundingClientRect(), W = r.width || 120, H = r.height || 213;
    // (each frame scaled to cover the card; cropped, her eyes a little above its middle)
    const k = Math.max(W / S.w, H / S.h) * zoom, fw = S.w * k, fh = S.h * k;
    dims = { fw, fh, ox: (W - fw) / 2, oy: crop === 'face' ? H * 0.45 - fh * EYES : (H - fh) / 2 };
  };
  const place = (d, f) => {
    if (!dims) measure();
    d.style.backgroundSize = `${dims.fw * S.cols}px ${dims.fh * S.rows}px`;
    d.style.backgroundPosition = `${dims.ox - (f % S.cols) * dims.fw}px ${dims.oy - Math.floor(f / S.cols) * dims.fh}px`;
  };
  const show = (f, fade) => {
    if (f === cur) return;
    if (fade && cur >= 0) { place(B, cur); B.style.transition = 'none'; B.style.opacity = '1'; void B.offsetWidth; B.style.transition = 'opacity .16s linear'; B.style.opacity = '0'; }
    place(A, f); cur = f; box.dataset.f = f;
  };
  show(0);
  const st = { t: 0, gate: 0, mouth: mouthFollower(), m: 0, slow: 0, col: 0, colT: 0, pose: 0, poseAt: 1.5, blinkAt: 1 + Math.random() * 3, blinkT: -9, glanceAt: 2.5 + Math.random() * 3, glanceT: -9, glanceFor: 0 };
  let last = performance.now(), raf = 0, stopped = false;
  const pick = (w) => { let r = Math.random() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) if ((r -= w[i]) < 0) return i; return 0; };
  const tick = () => {
    if (stopped) return;
    if (!box.isConnected && cur >= 0 && st.t > 0.5) { api.stop(); return; }
    raf = requestAnimationFrame(tick);
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now; st.t += dt; const t = st.t;
    const Wg = window.WAGMI, line = subLine(), mine = !!line && /^jane/i.test(line.who);
    const on = speaking ? !!speaking() : now < st.gate;
    // her mouth: her voice while one of her lines plays; with none to follow (no recording, no sound) and her line up,
    // syllables; else shut
    const v = janeVoice(Wg), au = Wg?.audio?.ctx?.state === 'running', rec = mine ? !!Wg?.voice?.has?.('Jane', line.text) : !!Wg?.voice;
    const raw = v ? v.level : on && (!au || !rec) ? chatter(t) : 0;
    const m = st.mouth(raw, dt); st.m = m; st.slow += (m - st.slow) * (1 - Math.exp(-dt / 0.15));
    // (shut, half, open: a step up at 0.2 / 0.55, down at 0.12 / 0.45, each held at least 60 ms)
    const want = m > (st.col >= 2 ? 0.45 : 0.55) ? 2 : m > (st.col >= 1 ? 0.12 : 0.2) ? 1 : 0;
    if (want !== st.col && t - st.colT > 0.06) { st.col = want; st.colT = t; }
    const talking = !!v || on || m > 0.02;
    // her head's pose: up with her brows through the end of a question; else a new one every 1.6-3.4 s while she talks, and
    // between straight and turned to her screens every few seconds while she listens
    // (a question's brows come in the second half of its line: the question is mostly at its end)
    const q = talking && /\?/.test(v?.text || (mine ? line.text : '') || '') && (!v || v.t > v.dur * 0.5);
    let pose = st.pose;
    if (q) pose = 3;
    else if (t >= st.poseAt || st.pose === 3) {
      pose = talking ? pick(st.pose === 0 ? [0.2, 0.5, 0.3, 0] : st.pose === 1 ? [0.5, 0.15, 0.35, 0] : [0.5, 0.4, 0.1, 0]) : pick([0.7, 0, 0.3, 0]);
      st.poseAt = t + (talking ? 1.6 + Math.random() * 1.8 : 3 + Math.random() * 3);
    }
    // a blink (her mouth shut) every 2-6 s, now and then two; a glance off the camera while she listens
    if (st.col === 0 && t >= st.blinkAt && t - st.blinkT > 0.3) { st.blinkT = t; st.blinkAt = t + (Math.random() < 0.12 ? 0.32 : 2 + Math.random() * 4); }
    if (!talking && t >= st.glanceAt) { st.glanceT = t; st.glanceFor = 0.5 + Math.random() * 0.9; st.glanceAt = t + st.glanceFor + 2.5 + Math.random() * 4; }
    const face = t - st.blinkT < 0.13 ? FACE.blink : st.col === 0 && t - st.glanceT < st.glanceFor ? FACE.glance : st.col;
    show(pose * S.cols + face, pose !== st.pose); st.pose = pose;
    // (the phone in her hand: a slow drift, and a little nod down with her words)
    const x = 0.5 * Math.sin(t * 0.7) + 0.3 * Math.sin(t * 1.9 + 1), y = 0.4 * Math.sin(t * 0.9 + 2) + 0.25 * Math.sin(t * 2.3) + 1.1 * st.slow, r = 0.3 * Math.sin(t * 0.6 + 0.5);
    wrap.style.transform = `translate(${x.toFixed(2)}%, ${y.toFixed(2)}%) rotate(${r.toFixed(2)}deg) scale(1.05)`;
  };
  raf = requestAnimationFrame(tick);
  const api = {
    // on: her line is up (a number for the old callers: a level over 0.08 is on)
    talk(on = 0) { st.gate = (typeof on === 'number' ? on > 0.08 : !!on) ? performance.now() + 400 : 0; },
    resize() { dims = null; const f = cur; cur = -1; show(Math.max(0, f)); },
    stop() { stopped = true; cancelAnimationFrame(raf); box.remove(); },
    get state() { return { f: cur, pose: st.pose, mouth: +st.m.toFixed(3), col: st.col }; },
    el: box,
  };
  return api;
}

// W.jane for the other modules (the call cards in ui.js, the scenes): build() her model, portrait(el, opt), spawn(at):
// her model placed in the city at [x, z, heading], posed by its rig at time t by the caller
const API = {
  build: (opt) => buildJane(window.WAGMI, opt),
  portrait: janePortrait,
  async spawn(at, { clip = 'idle' } = {}) {
    const J = await buildJane(window.WAGMI); const [x, z, h = 0] = at, cm = window.WAGMI.app.controllerManager;
    J.root.position.set(x, cm.getGroundHeight(x, z, 'person'), z); J.root.rotation.y = h; J.root.visible = true; J.rig.set([[0, clip]]); J.rig.pose(0);
    return J;
  },
  sheet: SHEET,
};
const hook = () => { const W = window.WAGMI; if (!W) return false; if (!W.jane) W.jane = API; return true; };
if (!hook()) { const t = setInterval(() => { if (hook()) clearInterval(t); }, 250); }
