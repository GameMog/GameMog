// Mog City: Mr. Big, the CEO of JPBank, on a video call from his study. His study is a little scene of its own, not the
// city's (a light added to the city would cost every material in it a recompile): walnut panelling, bookshelves either
// side of a tall window with Midtown at night behind him, a desk with a green-shaded banker's lamp, a whisky glass and
// a green leather inlay; Mr. Big seated upright in his oxblood wing chair behind it, in his navy three-piece, his
// glasses on, a cigar raised in his right hand, its tip glowing, thin grey smoke drifting off it. Lit low and warm (the
// lamp his key, from his left; a soft warm fill; the window's cool moonlight on his silver hair from behind).
// His model is assets/characters/mrbig.glb (an original face, nobody's: a CC0 MakeHuman build, .scratch/mrbig); his
// glasses and his cigar are made here, on his head and his right hand. wagmi/face.js gives his face its morphs: his
// jaw moves with his lines, he blinks, his eyes are on the lens. His hands are posed here too (27 Oct): each hand set by
// its own frame, the cigar held between the index and middle fingers (a relaxed grip at rest, an
// accusing two-finger point for the demand, its cap in his lips for a puff), the left hand at rest by his glass.
// Second pass (28 Oct): real teeth, gums, a tongue and a dark mouth behind them (bigMouth: the lower row and the tongue
// turn with his jaw); his eyes wet (a clear coat: catchlights); the cigar resting between his fingers; his left hand on
// the desk's leather, not in it. (His model: the beard's shells cleared from his mouth and feathered at their edges,
// richer skin, nails and creases on his hands, slimmer fingers, the tie's colour off the shirt.)
// Repair (28 Oct): his left hand laid on the leather as a resting hand lies (settleL: the heel of the palm and the finger
// pads on it, a soft curl, nothing in it), not hovering on its fingertips. (His model: the beard's shells as the first
// pass had them, cleared at the mouth only where his jaw stretches them across it, with a soft edge along the lips.)
// It is drawn in place of the city's frame (the full-frame insert) or into a texture (his feed on Dan's phone).
//   const boss = await createMrBig(W);  boss.pose(t, { lean, tilt, point, puff, stand })  boss.full({ pos, look, fov } | null)
//   boss.phone(on)  boss.texture (the phone feed)  boss.eye (his eyes in his study: the shots are framed on them)
//   boss.warm() (compiles it all behind the gate)
import * as THREE from 'three/webgpu';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { loadGLB } from '../glb.js';
import { createFace } from '../face.js';
import { createVapor } from '../pursuit/vapor.js';
import { clamp, smooth } from './cine.js';

const PI = Math.PI;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// (seated: his hips this far below where they stand, so his feet are on the floor with his thighs level on the seat)
const SEAT_DROP = 0.442;

// his mouth's inside (28 Oct, second pass: the open mouth showed a dark hole with broken bits of teeth, which were the
// beard's shells hanging into it; those are cleared in his model now). Real teeth after Jane's (wagmi/mission/jane.js),
// a sixty-year-old man's: an upper and a lower row round their arches, each tooth drawn into a canvas (its outline,
// rounded or worn corners, the notch to its neighbour, a convex shade, aged ivory going warmer toward the gum, a
// greyer translucent biting edge, faint vertical lines), set behind his lips so 2-3 mm of the upper row shows as he
// talks; the gums along them (scalloped, the papillae down between the teeth); the lower row and his tongue turned
// down with his jaw about face.js's own hinge (face.jaw wrapped); a dark warm back to the mouth (not a void). All in
// the skin's bind space (face.js's frame: y up, +z his front), hung on the head bone by its inverse bind
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const TEETH = {
  // z: the arch's front (mm behind the lips' front), c: its curve, y0..y1: the band (mm from the parting), S: its half
  // length along the arch, gum: the crowns' height (mm, the gum line over / under them); teeth from the middle out:
  // [width, edge (mm from the parting), corner radii mesial, distal | 'cusp']
  up: { z: -6.6, c: 0.028, y0: 9, y1: -4.5, S: 27.5, gum: [10.2, 8.8, 9.8, 8.2], teeth: [[8.8, -2.5, 0.7, 1.2], [6.8, -1.9, 1.1, 1.7], [7.8, -2.2, 'cusp'], [7.2, -1.6, 1.6, 1.6]] },
  lo: { z: -9.8, c: 0.034, y0: 0, y1: -11.5, S: 22.5, gum: [8.6, 8.8, 9.6, 8.0], teeth: [[5.5, -1.0, 0.4, 0.6], [6.0, -1.05, 0.6, 0.9], [6.9, -1.35, 'cusp'], [7.1, -0.8, 1.5, 1.5]] },
};
function teethMap(T, lower) {
  const CW = 1024, CH = 384, cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
  const cx = cv.getContext('2d'), img = cx.createImageData(CW, CH), D = img.data, sg = lower ? -1 : 1;
  const spans = []; let s0 = 0; T.teeth.forEach((t, k) => { spans.push([s0, s0 + t[0], t, k]); s0 += t[0]; });
  const cr = (q, r) => (q < r ? r - Math.sqrt(Math.max(0, r * r - (r - q) ** 2)) : 0);
  const hsh = (a) => { const x = Math.sin(a * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  for (let i = 0; i < CW; i++) {
    const s = -T.S + (2 * T.S * (i + 0.5)) / CW, a = Math.abs(s), sp = spans.find((q) => a < q[1]) || spans[spans.length - 1];
    const w = sp[1] - sp[0], u = Math.min(w, a - sp[0]), t = sp[2], id = sp[3] + (s < 0 ? 10 : 0);
    // (the edge: worn a little flat; the corners rounded; a canine's soft point)
    let e;
    if (t[2] === 'cusp') { const d = Math.abs(u - w / 2) / (w / 2); e = t[1] + sg * (0.6 * (Math.sqrt(d * d + 0.05) - 0.22) + cr(u, 1.0) + cr(w - u, 1.0)); }
    else e = t[1] + sg * (cr(u, t[2]) + cr(w - u, t[3]));
    e += sg * 0.12 * (hsh(id + 0.3) - 0.5);
    const x = (u / w) * 2 - 1, across = (1 - 0.26 * x * x) * (0.66 + 0.34 * sstep(0, 0.22, Math.min(u, w - u)));
    // (the gum line over the crown: highest over its middle, down between the teeth)
    const gl = e + sg * T.gum[Math.min(sp[3], 3)] * (1 - 0.24 * x ** 4) - sg * 0.6, tone = 0.95 + 0.07 * hsh(id);
    for (let j = 0; j < CH; j++) {
      const y = T.y0 + ((T.y1 - T.y0) * (j + 0.5)) / CH, inn = sg * (y - e), o = (j * CW + i) * 4;
      const gum = sstep(-0.25, 0.25, sg * (y - gl));
      const al = Math.max(clamp(inn / 0.09 + 0.5, 0, 1), gum);
      // (enamel: aged ivory, warmer and darker toward the gum (the dentin through it), the last 0.8 mm of the edge greyer
      // and a little see-through; faint vertical lines; the shade across the tooth)
      const g = sstep(1.5, 8, inn), edge = 1 - sstep(0.15, 0.9, inn), lines = 1 - 0.035 * Math.max(0, Math.sin(x * 9.5 + id)) * sstep(1.5, 4, inn);
      const k = across * (0.86 + 0.14 * sstep(0, 0.7, inn)) * lines * tone;
      let r = (236 - 18 * g - 30 * edge) * k, gg = (224 - 26 * g - 26 * edge) * k, b = (198 - 42 * g - 14 * edge) * k;
      // (the gum: a healthy dark pink, darker into the mouth, a fine stipple)
      if (gum > 0) { const st = 0.92 + 0.08 * hsh(i * 0.37 + j * 1.13), dg = 0.75 + 0.25 * sstep(0, 3, sg * (y - gl)); r = r * (1 - gum) + 172 * st * dg * gum; gg = gg * (1 - gum) + 84 * st * dg * gum; b = b * (1 - gum) + 86 * st * dg * gum; }
      D[o] = r; D[o + 1] = gg; D[o + 2] = b; D[o + 3] = al * 255;
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
  const N = Math.round((2 * T.S) / 0.7), ROWS = lower ? [T.y0, -0.8, -2, -4.5, -8, T.y1] : [T.y0, 5.5, 3.2, 1.5, -1, T.y1];
  const pos = [], nor = [], uv = [], col = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const s = -T.S + (2 * T.S * i) / N, x = xAt(s), n = new THREE.Vector3(2 * T.c * x, lower ? 0.15 : 0.06, 1).normalize();
    // (round to the sides, into the mouth's corners' shade)
    const side = 1 - (lower ? 0.9 * sstep(2.5, 13, Math.abs(s)) : 0.86 * sstep(4.5, 18, Math.abs(s)));
    for (const y of ROWS) {
      pos.push(x / 1000, part + y / 1000, lipZ + (T.z - T.c * x * x) / 1000); nor.push(n.x, n.y, n.z); uv.push((s + T.S) / (2 * T.S), (y - T.y1) / (T.y0 - T.y1));
      const k = side * (lower ? 0.55 * (0.45 + 0.55 * sstep(-5, -0.8, y)) : 0.3 + 0.7 * sstep(4, -2, y)); col.push(k, k, k);
    }
  }
  const R = ROWS.length; for (let i = 0; i < N; i++) for (let r = 0; r < R - 1; r++) { const a = i * R + r, b = a + R; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  return g;
}
const teethMat = (T, lower) => { const m = new THREE.MeshStandardMaterial({ map: teethMap(T, lower), vertexColors: true, alphaTest: 0.5, roughness: 0.34, metalness: 0, side: THREE.DoubleSide, name: lower ? 'mrbigTeethLow' : 'mrbigTeeth' }); m.envMapIntensity = 0.3; return m; };
function bigMouth(skin, head, face) {
  const fr = face.rig; if (!skin || !head || !fr?.eyes || !fr.found) return null;
  const BI = skin.skeleton.boneInverses[skin.skeleton.bones.indexOf(head)].clone().multiply(skin.bindMatrix);
  const e = fr.eyes, ey = (e[0].c.y + e[1].c.y) / 2, front = e[0].c.z + e[0].r, f = fr.found;
  const part = ey - (f.parting?.[0]?.[1] ?? 75.3) / 1000, lipZ = front + (f.lipZ ?? 11.7) / 1000;
  const hn = f.hinge || [37, 92], hy = ey - hn[0] / 1000, hz = front - hn[1] / 1000;
  const up = new THREE.Group(); up.name = 'mrbigMouth'; up.matrixAutoUpdate = false; up.matrix.copy(BI); head.add(up);
  const ut = new THREE.Mesh(teethBand(TEETH.up, part, lipZ, false), teethMat(TEETH.up, false)); ut.renderOrder = 1; up.add(ut);
  // (the back of his mouth: a dark warm shell behind the tongue, so the opening is a deep red-brown, not a void or the
  // lit inside of his cheeks)
  { const g = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), P = g.attributes.position;
    for (let v = 0; v < P.count; v++) { const x = P.getX(v), y = P.getY(v), z = P.getZ(v); P.setXYZ(v, x * 0.026, part - 0.004 + z * 0.015, lipZ - 0.019 - y * 0.03); }
    g.computeVertexNormals(); const m = new THREE.MeshStandardMaterial({ color: '#3a1410', roughness: 0.55, metalness: 0, side: THREE.DoubleSide, name: 'mrbigMouthBack' }); m.envMapIntensity = 0;
    up.add(new THREE.Mesh(g, m)); }
  const low = new THREE.Group(); low.name = 'mrbigLowerMouth'; low.matrixAutoUpdate = false; low.matrix.copy(BI); head.add(low);
  // (the lower row in the upper lip's and the tongue's shade: darker and less glossy, or the moonlight from behind
  // lit its edges a cold blue)
  const lt = new THREE.Mesh(teethBand(TEETH.lo, part, lipZ, true), teethMat(TEETH.lo, true)); lt.material.roughness = 0.5; lt.material.envMapIntensity = 0.1; low.add(lt);
  // his tongue: low behind the lower row, its top a little under the lower teeth's, wet, darker back into the mouth
  { const tg = new THREE.SphereGeometry(1, 28, 14), TP = tg.attributes.position, tc = [];
    for (let v = 0; v < TP.count; v++) { const x = TP.getX(v), y = TP.getY(v), z = TP.getZ(v), k = 0.05 + 0.4 * sstep(0, 1, y) * (0.25 + 0.75 * sstep(-0.3, 0.95, z)) * (1 - 0.35 * Math.exp(-((x / 0.16) ** 2)) * sstep(0.4, 1, y));
      tc.push(k, k, k); TP.setXYZ(v, x * 0.0168, part - 0.0102 + y * 0.0062, lipZ - 0.03 + z * 0.0165); }
    tg.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3)); tg.computeVertexNormals();
    const tm = new THREE.MeshPhysicalMaterial({ color: '#8a3436', vertexColors: true, roughness: 0.62, metalness: 0, specularIntensity: 0.25, name: 'mrbigTongue' }); tm.envMapIntensity = 0.05;
    low.add(new THREE.Mesh(tg, tm)); }
  for (const g of [up, low]) g.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false; } });
  const H = new THREE.Matrix4(), Rx = new THREE.Matrix4(), Hi = new THREE.Matrix4();
  // (their tone: ivory, not paper; shut, a slit of them showed white along the parting, so they come up as he opens)
  const set = (k) => { const a = 0.2 * clamp(k, 0, 1); H.makeTranslation(0, hy, hz); Hi.makeTranslation(0, -hy, -hz); Rx.makeRotationX(a); low.matrix.copy(BI).multiply(H).multiply(Rx).multiply(Hi);
    const t = 0.6 * (0.3 + 0.7 * sstep(0.01, 0.12, k)); ut.material.color.setScalar(t); lt.material.color.setRGB(t * 0.62, t * 0.58, t * 0.52); };
  const jaw0 = face.jaw; face.jaw = (k) => { jaw0(k); set(k); };
  set(0);
  return { up, low, part, lipZ, hinge: [hy, hz] };
}

export async function createMrBig(W) {
  const app = W.app, renderer = app.renderer;
  const scene = new THREE.Scene(); scene.name = 'wagmi-mrbig-study';
  scene.background = new THREE.Color('#07050A');
  // (the city's sky for the glass and the brass to catch, kept very low: it is night in here)
  scene.environment = app.scene.environment || null; scene.environmentIntensity = 0.12;

  /* ------------------------------------------------------------- the man -- */
  const gltf = await loadGLB('assets/characters/mrbig.glb');
  const root = new THREE.Group(); root.name = 'MrBig'; scene.add(root);
  const inner = skClone(gltf.scene); root.add(inner);
  let skin = null;
  inner.traverse((o) => {
    if (!o.isMesh) return; o.frustumCulled = false;
    if (o.isSkinnedMesh && o.material?.name === 'skin') skin = o;
    // (the silver hair matte: the lamp's light in it, not a white sheen)
    if (o.material?.name === 'hair') { o.material = o.material.clone(); o.material.roughness = 0.62; }
    // (his eyes wet (28 Oct, second pass): a clear coat over them, glossy, so the lamp and the front light show in them as
    // catchlights; the name kept: face.js finds them by it)
    if (o.material?.name === 'eyes' && !o.material.isMeshPhysicalMaterial) { const m0 = o.material;
      o.material = new THREE.MeshPhysicalMaterial({ name: 'eyes', map: m0.map, alphaTest: m0.alphaTest, roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02 }); o.material.envMapIntensity = 1.4; }
  });
  const bones = {}; inner.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const sk = skin.skeleton;
  // (the frame holding his skeleton came from the cast's template turned 10 degrees forward and 7 to one side, which
  // the clips' own hips put right; his study poses him from his rest, so the frame is set straight: upright, no hunch)
  bones.root.parent.quaternion.identity();
  const wp = (b, out = V()) => b.getWorldPosition(out);
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _a = V(), _b = V(), _c = V(), _t = V(), _n = V();
  // (a bone turned about a world axis through its joint, its children with it)
  function turn(b, axis, ang) { if (!b || !ang) return; b.getWorldQuaternion(_q2); _q.setFromAxisAngle(axis, ang).multiply(_q2); b.parent.getWorldQuaternion(_q2); b.quaternion.copy(_q2.invert().multiply(_q)); b.updateMatrixWorld(true); }
  // (two-bone reach: b1's joint to b3's at target, the middle joint toward pole; w: how much of it)
  function reach(b1, b2, b3, target, pole, w = 1) {
    if (!b1 || !b2 || !b3 || w <= 0.001) return;
    const q1 = b1.quaternion.clone(), q2 = b2.quaternion.clone();
    b1.getWorldPosition(_a); b2.getWorldPosition(_b); b3.getWorldPosition(_c);
    const la = _a.distanceTo(_b), lb = _b.distanceTo(_c), d = clamp(target.distanceTo(_a), 0.05, la + lb - 1e-3);
    const cur = _t.subVectors(_a, _b).normalize().angleTo(_n.subVectors(_c, _b).normalize());
    const want = Math.acos(clamp((la * la + lb * lb - d * d) / (2 * la * lb), -1, 1));
    const ax = V().crossVectors(_t.subVectors(_a, _b), _n.subVectors(_c, _b)); if (ax.lengthSq() < 1e-8) ax.set(1, 0, 0); ax.normalize();
    turn(b2, ax, want - cur);
    b3.getWorldPosition(_c);
    const from = _t.subVectors(_c, _a).normalize(), to = _n.subVectors(target, _a).normalize();
    const ax2 = V().crossVectors(from, to); if (ax2.lengthSq() > 1e-10) turn(b1, ax2.normalize(), from.angleTo(to));
    if (pole) {
      b2.getWorldPosition(_b); const axl = V().subVectors(target, _a).normalize(), e = V().subVectors(_b, _a); e.addScaledVector(axl, -e.dot(axl));
      const p = pole.clone().sub(_a); p.addScaledVector(axl, -p.dot(axl));
      if (e.lengthSq() > 1e-6 && p.lengthSq() > 1e-6) { let ang = e.angleTo(p); if (V().crossVectors(e, p).dot(axl) < 0) ang = -ang; turn(b1, axl, ang); }
    }
    if (w < 0.999) { b1.quaternion.slerpQuaternions(q1, b1.quaternion.clone(), w); b2.quaternion.slerpQuaternions(q2, b2.quaternion.clone(), w); b1.updateMatrixWorld(true); }
  }

  // his face: the morphs (jaw, lips, blinks, eyes) made from his body, his mouth with his voice; his eyes on the lens
  const face = createFace(W, { speaker: 'Mr. Big', inner, bones, head: false, open: 0.45, gaze: 0.18 });
  const mouth = bigMouth(skin, bones.head, face);

  // the bind pose (the model's own rest: upright, arms out), where his glasses and cigar are fitted
  sk.pose(); root.updateMatrixWorld(true);
  // (his hips over the middle of his study's floor: the model's own frame has them off to one side and forward)
  { const h = wp(bones.root); inner.position.x -= h.x; inner.position.z -= h.z; root.updateMatrixWorld(true); }
  const eyesW = (face.rig?.eyes || []).map((e) => e.c.clone().applyMatrix4(skin.matrixWorld));
  const eyeR = face.rig?.eyes?.[0]?.r || 0.012;
  const eyeMid = eyesW.length === 2 ? eyesW[0].clone().add(eyesW[1]).multiplyScalar(0.5) : wp(bones.head).add(V(0, 0.08, 0.1));
  const ipd = eyesW.length === 2 ? Math.abs(eyesW[0].x - eyesW[1].x) : 0.062;
  // (his head measured from the skin itself at the eyes' height: its half width at the temples, the nose's bridge)
  let halfW = 0.074, noseZ = eyeMid.z + 0.02;
  {
    const p = V(), pos = skin.geometry.attributes.position; let hw = 0, nz = -9;
    for (let i = 0; i < pos.count; i++) {
      skin.getVertexPosition(i, p); p.applyMatrix4(skin.matrixWorld);
      if (Math.abs(p.y - eyeMid.y) > 0.012) continue;
      if (p.z > eyeMid.z - 0.1 && p.z < eyeMid.z - 0.035) hw = Math.max(hw, Math.abs(p.x - eyeMid.x));
      if (Math.abs(p.x - eyeMid.x) < 0.006) nz = Math.max(nz, p.z);
    }
    if (hw > 0.05) halfW = hw; if (nz > -9) noseZ = nz;
  }
  const fix = (m, bone) => { root.add(m); m.updateMatrixWorld(true); bone.attach(m); m.traverse((k) => { if (k.isMesh) k.frustumCulled = false; }); return m; };

  // his glasses: heavy dark tortoiseshell rectangles, the lenses clear and smooth (they catch the lamp), the arms back
  // over his ears
  const tortoise = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#1C0E07'; x.fillRect(0, 0, 128, 128);
    let s = 11; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 1); const col = R() < 0.55 ? '120,62,22' : '70,34,12'; g.addColorStop(0, `rgba(${col},0.85)`); g.addColorStop(1, `rgba(${col},0)`);
      x.save(); x.translate(R() * 128, R() * 128); x.scale(4 + R() * 12, 3 + R() * 7); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 1, 0, PI * 2); x.fill(); x.restore(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1); return t;
  })();
  const frameMat = new THREE.MeshStandardMaterial({ map: tortoise, color: '#B8A396', roughness: 0.28, metalness: 0.05 });
  const lensMat = new THREE.MeshStandardMaterial({ color: '#B8C8D8', roughness: 0.03, metalness: 0.35, transparent: true, opacity: 0.1, depthWrite: false });
  const glasses = new THREE.Group(); glasses.name = 'glasses';
  {
    const LW = 0.051, LH = 0.034, T = 0.0058, D = 0.006, r = 0.0065;
    const rr = (w, h, rad) => { const s = new THREE.Shape(), x0 = -w / 2, y0 = -h / 2; s.moveTo(x0 + rad, y0); s.lineTo(x0 + w - rad, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + rad); s.lineTo(x0 + w, y0 + h - rad); s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - rad, y0 + h); s.lineTo(x0 + rad, y0 + h); s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - rad); s.lineTo(x0, y0 + rad); s.quadraticCurveTo(x0, y0, x0 + rad, y0); return s; };
    const ring = rr(LW + 2 * T, LH + 2 * T, r + T); ring.holes.push(rr(LW, LH, r));
    const ringGeo = new THREE.ExtrudeGeometry(ring, { depth: D, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0012, bevelSegments: 2, curveSegments: 6 }); ringGeo.translate(0, 0, -D / 2);
    const lensGeo = new THREE.ShapeGeometry(rr(LW + 0.001, LH + 0.001, r), 6);
    const cx = Math.max(ipd / 2, 0.031) + 0.001;
    for (const sx of [-1, 1]) {
      const f = new THREE.Mesh(ringGeo, frameMat); f.position.set(sx * cx, 0, 0); f.rotation.y = -sx * 0.06; glasses.add(f);
      const l = new THREE.Mesh(lensGeo, lensMat); l.position.set(sx * cx, 0, 0.0005); l.rotation.y = -sx * 0.06; l.renderOrder = 2; glasses.add(l);
      // (the arm: from the frame's outer top corner back over the ear, out to the head's side)
      const ox = sx * (cx + LW / 2 + T * 0.6), ex = sx * Math.max(halfW + 0.006, cx + LW / 2 + T), z1 = -0.004, z2 = -(eyeMid.z + eyeR + 0.016 - (eyeMid.z - 0.095));
      const len = Math.hypot(ex - ox, z2 - z1), arm = new THREE.Mesh(new THREE.BoxGeometry(0.0032, 0.0062, len), frameMat);
      arm.position.set((ox + ex) / 2, LH / 2 - 0.004, (z1 + z2) / 2); arm.lookAt(ex, LH / 2 - 0.004, z2); glasses.add(arm);
    }
    // (the bridge: a keyhole bar over his nose)
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.0034, 0.0034, 2 * cx - LW - 2 * T + 0.004, 10, 1, false), frameMat); br.rotation.z = PI / 2; br.position.set(0, LH * 0.22, 0.0015); glasses.add(br);
  }
  // (on his nose: the lenses a little in front of his eyes and the bridge on the nose's bridge, a touch low)
  glasses.position.set(eyeMid.x, eyeMid.y - 0.002, Math.max(eyeMid.z + eyeR + 0.017, noseZ + 0.006));
  fix(glasses, bones.head);
  // (his mouth, in his head's own frame: the lips' parting 75 mm under his eyes, 12 mm in front of them: the cigar's cap
  // goes there for a puff)
  const mouthLocal = bones.head.worldToLocal(V(eyeMid.x, eyeMid.y - 0.0753, eyeMid.z + eyeR + 0.012));
  // (the cigar's cap in his right wrist's frame, once it is in his hand)
  let capLocal = null;

  // the cigar: a corona, its band burgundy and gold near the head, the lit end a glowing ring of ember under a short
  // grey ash. Held between the first two fingers of his right hand, toward their middle joints, across them: the head a few cm
  // out on the palm's side, the lit end out past the back of his hand (put there below, once his hand is posed)
  const cigar = new THREE.Group(); cigar.name = 'cigar';
  const leaf = new THREE.MeshStandardMaterial({ color: '#5B3920', roughness: 0.82 });
  const ember = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.9, 0.22) });
  const ashMat = new THREE.MeshStandardMaterial({ color: '#8E8984', roughness: 1 });
  const CIG = { L: 0.13, R: 0.0082, head: 0.034, at: 0.82, lean: 0.3 };
  {
    const { L, R } = CIG;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.97, L, 20, 1), leaf); body.position.y = L / 2; cigar.add(body);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 0.97, 16, 8, 0, PI * 2, PI / 2, PI / 2), leaf); cap.scale.y = 0.7; cigar.add(cap);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.04, R * 1.04, 0.011, 20, 1, true), new THREE.MeshStandardMaterial({ color: '#6E1426', roughness: 0.5, metalness: 0.2 })); band.position.y = 0.019; cigar.add(band);
    const gilt = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.05, R * 1.05, 0.0022, 20, 1, true), new THREE.MeshStandardMaterial({ color: '#C9A24A', roughness: 0.3, metalness: 0.9 })); gilt.position.y = 0.019; cigar.add(gilt);
    // (the burning end: a ring of ember round the burn line, the ash past it, a little narrower, its end glowing faintly)
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.0, R * 1.0, 0.0045, 20, 1), ember); glow.position.y = L + 0.0018; cigar.add(glow);
    const ash = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.86, R * 0.95, 0.008, 16, 1), ashMat); ash.position.y = L + 0.0075; cigar.add(ash);
    // (the tip end on: the ember glowing through the ash's face, dimmer than the ring, brighter with a puff)
    const emberTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
      const g = x.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, '#FFB060'); g.addColorStop(0.35, '#F06018'); g.addColorStop(0.62, '#7A2A10'); g.addColorStop(0.8, '#6E6862'); g.addColorStop(1, '#8E8984');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      let r = 7; const R0 = () => ((r = (r * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 90; i++) { const a = R0() * PI * 2, d = 8 + R0() * 22; x.fillStyle = `rgba(${R0() < 0.5 ? '60,56,52' : '150,146,140'},${0.25 + R0() * 0.4})`; x.fillRect(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 1.5 + R0() * 2, 1.5 + R0() * 2); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const face0 = new THREE.Mesh(new THREE.CircleGeometry(R * 0.86, 20), new THREE.MeshBasicMaterial({ map: emberTex, color: new THREE.Color(1.2, 1.2, 1.2) })); face0.rotation.x = -PI / 2; face0.position.y = L + 0.0118; cigar.add(face0);
    cigar.userData.tip = V(0, L + 0.012, 0); cigar.userData.glow = glow; cigar.userData.face = face0;
  }
  const tipW = () => cigar.localToWorld(cigar.userData.tip.clone());

  /* ----------------------------------------------------------- the study -- */
  const box = (w, h, d, m, x, y, z, parent = scene) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); parent.add(b); return b; };
  const rbox = (w, h, d, r, m, x, y, z, parent = scene) => { const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), m); b.position.set(x, y, z); parent.add(b); return b; };
  const walnut = new THREE.MeshStandardMaterial({ color: '#3B2214', roughness: 0.5 });
  const walnutD = new THREE.MeshStandardMaterial({ color: '#24140B', roughness: 0.6 });
  const leather = new THREE.MeshStandardMaterial({ color: '#4A1512', roughness: 0.48 });
  const brass = new THREE.MeshStandardMaterial({ color: '#B8903F', roughness: 0.3, metalness: 1 });
  // the back wall: walnut panels, a tall window in the middle (Midtown at night through it), heavy green drapes
  const WZ = -1.95;
  box(6, 4, 0.1, walnutD, 0, 2, WZ - 0.06);
  for (const sx of [-1, 1]) for (const [y, h] of [[0.45, 0.6], [1.45, 1.1], [2.6, 0.9]]) rbox(0.62, h, 0.04, 0.01, walnut, sx * 0.9, y, WZ);
  box(6, 0.12, 0.06, walnutD, 0, 0.06, WZ + 0.03);
  // (the city: a night skyline drawn once, lit windows, red lights on the masts, the glow of the streets under it)
  const cityTex = (() => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 1024); g.addColorStop(0, '#050914'); g.addColorStop(0.55, '#0E1A36'); g.addColorStop(0.85, '#2A2A44'); g.addColorStop(1, '#4A3324');
    x.fillStyle = g; x.fillRect(0, 0, 1024, 1024);
    let s = 1234; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(255,255,255,${0.2 + R() * 0.4})`; x.fillRect(R() * 1024, R() * 360, 1.5, 1.5); }
    const tower = (bx, bw, top, far) => {
      x.fillStyle = far ? '#0C1222' : '#070B16'; x.fillRect(bx, top, bw, 1024 - top);
      for (let wy = top + 10; wy < 1010; wy += far ? 10 : 14) for (let wx = bx + 4; wx < bx + bw - 5; wx += far ? 7 : 10) {
        if (R() < (far ? 0.32 : 0.42)) { const w = R(); x.fillStyle = w < 0.75 ? `rgba(255,${200 + R() * 30 | 0},${120 + R() * 40 | 0},${0.55 + R() * 0.45})` : `rgba(200,220,255,${0.5 + R() * 0.4})`; x.fillRect(wx, wy, far ? 3 : 5, far ? 4 : 6); }
      }
    };
    for (let i = 0; i < 16; i++) tower(R() * 1000 - 40, 50 + R() * 80, 420 + R() * 300, true);
    // (a slim spire, the skyline's tallest, left of his head; the rest broad shoulders of towers)
    x.fillStyle = '#070B16'; x.beginPath(); x.moveTo(300, 160); x.lineTo(308, 330); x.lineTo(292, 330); x.fill();
    tower(262, 76, 330, false); x.fillStyle = '#FF3B2A'; x.fillRect(298, 156, 4, 4);
    for (let i = 0; i < 9; i++) { const bx = R() * 980 - 30, bw = 70 + R() * 110, top = 520 + R() * 260; if (Math.abs(bx + bw / 2 - 512) < 90) continue; tower(bx, bw, top, false); if (R() < 0.5) { x.fillStyle = '#FF3B2A'; x.fillRect(bx + bw / 2 - 2, top - 6, 4, 4); } }
    const h = x.createLinearGradient(0, 860, 0, 1024); h.addColorStop(0, 'rgba(255,170,90,0)'); h.addColorStop(1, 'rgba(255,170,90,0.35)'); x.fillStyle = h; x.fillRect(0, 860, 1024, 164);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  })();
  const city = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: cityTex, color: new THREE.Color(1.25, 1.25, 1.3) }));
  city.position.set(0, 1.55, WZ - 1.1); scene.add(city);
  // (the window: its opening in the panelling, the frame and mullions, the glass faintly catching the room)
  const WW = 1.3, WH = 2.3, WY = 1.75;
  for (const sx of [-1, 1]) box(0.1, WH + 0.2, 0.16, walnutD, sx * (WW / 2 + 0.05), WY, WZ + 0.02);
  box(WW + 0.2, 0.12, 0.18, walnutD, 0, WY + WH / 2 + 0.06, WZ + 0.02); box(WW + 0.3, 0.08, 0.26, walnut, 0, WY - WH / 2 - 0.02, WZ + 0.06);
  box(0.035, WH, 0.05, walnutD, 0, WY, WZ); for (const y of [-0.55, 0.15, 0.8]) box(WW, 0.03, 0.05, walnutD, 0, WY + y, WZ);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), new THREE.MeshStandardMaterial({ color: '#8FA3C0', roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.1, depthWrite: false }));
  glass.position.set(0, WY, WZ - 0.01); scene.add(glass);
  const drape = new THREE.MeshStandardMaterial({ color: '#16301F', roughness: 0.9 });
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.9, 10), drape); f.position.set(sx * (WW / 2 + 0.12 + i * 0.09), 1.45, WZ + 0.14 + (i % 2) * 0.03); scene.add(f); }
  // the bookshelves either side: walnut cases floor to ceiling, rows of old bindings (one instanced mesh), a few lying flat
  const caseX = [-1.62, 1.62], shelfYs = [0.12, 0.55, 0.98, 1.41, 1.84, 2.27];
  for (const cx of caseX) {
    box(1.12, 2.9, 0.36, walnutD, cx, 1.45, WZ + 0.22).material = walnutD;
    for (const y of shelfYs) box(1.04, 0.035, 0.34, walnut, cx, y, WZ + 0.33);
    for (const sx of [-1, 1]) box(0.05, 2.9, 0.38, walnut, cx + sx * 0.56, 1.45, WZ + 0.34);
  }
  {
    const books = [], pal = ['#5A1A1A', '#2C3D2A', '#1F2B45', '#4A3420', '#6B4A1F', '#3B1F2E', '#22201C', '#7A6236', '#2B1810'];
    let s = 77; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (const cx of caseX) for (const y of shelfYs.slice(0, -1)) {
      let x = cx - 0.5;
      while (x < cx + 0.48) { const w = 0.024 + R() * 0.035, h = 0.25 + R() * 0.12; if (R() < 0.06) { x += 0.05 + R() * 0.06; continue; } books.push([x + w / 2, y + 0.018 + h / 2, WZ + 0.36 - R() * 0.03, w, h, 0.22 + R() * 0.05, pal[Math.floor(R() * pal.length)], (R() - 0.5) * 0.06]); x += w + 0.002; }
    }
    const bm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.75 }), books.length);
    const d = new THREE.Object3D(), col = new THREE.Color();
    books.forEach(([x, y, z, w, h, dd, c, rz], i) => { d.position.set(x, y, z); d.scale.set(w, h, dd); d.rotation.set(0, 0, rz); d.updateMatrix(); bm.setMatrixAt(i, d.matrix); bm.setColorAt(i, col.set(c)); });
    bm.instanceMatrix.needsUpdate = true; if (bm.instanceColor) bm.instanceColor.needsUpdate = true; bm.frustumCulled = false; scene.add(bm);
  }
  // the floor (dark boards) and an old red rug
  box(8, 0.1, 8, new THREE.MeshStandardMaterial({ color: '#1A0F09', roughness: 0.55 }), 0, -0.05, 0);
  box(3.2, 0.012, 2.6, new THREE.MeshStandardMaterial({ color: '#4A1210', roughness: 0.95 }), 0, 0.006, 0.4);
  // his wing chair: oxblood leather, the high back and its wings round his head and shoulders, rolled arms
  const chair = new THREE.Group(); chair.name = 'wing-chair'; scene.add(chair);
  rbox(0.86, 0.16, 0.66, 0.05, leather, 0, 0.36, -0.02, chair);
  rbox(0.84, 0.36, 0.62, 0.04, leather, 0, 0.18, -0.03, chair);
  rbox(0.84, 1.02, 0.16, 0.06, leather, 0, 0.92, -0.33, chair);
  for (const sx of [-1, 1]) {
    const wing = rbox(0.12, 0.62, 0.34, 0.05, leather, sx * 0.42, 1.08, -0.2, chair); wing.rotation.y = sx * 0.32;
    rbox(0.14, 0.24, 0.62, 0.06, leather, sx * 0.43, 0.58, -0.03, chair);
    for (const z of [-0.28, 0.24]) box(0.04, 0.08, 0.04, walnutD, sx * 0.38, 0.04, z, chair);
  }
  // the desk: walnut, two pedestals, a green leather inlay; the lamp, the glass, a pen
  const desk = new THREE.Group(); desk.name = 'desk'; scene.add(desk);
  const DZ = 0.68, DT = 0.765;
  rbox(1.76, 0.05, 0.84, 0.012, walnut, 0, DT, DZ, desk);
  box(1.5, 0.004, 0.56, new THREE.MeshStandardMaterial({ color: '#1C3626', roughness: 0.6 }), 0, DT + 0.026, DZ - 0.02, desk);
  for (const sx of [-1, 1]) { box(0.46, DT - 0.04, 0.78, walnutD, sx * 0.62, (DT - 0.04) / 2, DZ, desk); for (const y of [0.18, 0.42, 0.62]) box(0.36, 0.008, 0.01, brass, sx * 0.62, y, DZ + 0.395, desk); }
  box(0.8, 0.12, 0.76, walnutD, 0, DT - 0.08, DZ, desk); box(0.8, 0.5, 0.02, walnutD, 0, DT - 0.36, DZ + 0.36, desk);
  // (the banker's lamp: brass base and stem, the green glass shade glowing a little, the warm bulb under it)
  const lampP = V(0.52, DT + 0.025, DZ + 0.02);
  { const L = new THREE.Group(); L.position.copy(lampP); desk.add(L);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.022, 28), brass); b.position.y = 0.011; L.add(b);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 10), brass); st.position.y = 0.17; L.add(st);
    for (const sx of [-1, 1]) { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.08, 8), brass); a.position.set(sx * 0.1, 0.3, 0.0); a.rotation.z = PI / 2; L.add(a); }
    const shadeMat = new THREE.MeshStandardMaterial({ color: '#0F5A2C', roughness: 0.18, metalness: 0.1, emissive: '#0C4A22', emissiveIntensity: 0.55, side: THREE.DoubleSide });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.34, 28, 1, true, 0, PI), shadeMat); shade.rotation.z = PI / 2; shade.position.set(0, 0.34, 0); L.add(shade);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.CircleGeometry(0.075, 20, 0, PI), shadeMat); e.rotation.y = sx * PI / 2; e.position.set(sx * 0.17, 0.34, 0); L.add(e); }
    const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.3, 1.3) })); bulb.rotation.z = PI / 2; bulb.position.set(0, 0.33, 0); L.add(bulb);
    L.rotation.y = -0.5; }
  // (the whisky: a heavy tumbler, two fingers of amber in it, by his left hand)
  const glassP = V(0.24, DT + 0.026, DZ - 0.18);
  { const G = new THREE.Group(); G.position.copy(glassP); desk.add(G);
    const tm = new THREE.MeshStandardMaterial({ color: '#E8F0F6', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.095, 24, 1, true), tm); wall.position.y = 0.0475; wall.renderOrder = 3; G.add(wall);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.014, 24), tm); base.position.y = 0.007; G.add(base);
    const drink = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.033, 0.035, 24), new THREE.MeshStandardMaterial({ color: '#B4621A', roughness: 0.1, transparent: true, opacity: 0.85, emissive: '#5A2A08', emissiveIntensity: 0.4 }));
    drink.position.y = 0.032; drink.renderOrder = 2; G.add(drink); }
  { const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.15, 10), new THREE.MeshStandardMaterial({ color: '#0B0B0C', roughness: 0.25, metalness: 0.5 })); pen.rotation.set(PI / 2, 0, 0.6); pen.position.set(-0.3, DT + 0.033, DZ + 0.02); desk.add(pen);
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.004, 0.3), new THREE.MeshStandardMaterial({ color: '#E9E2D2', roughness: 0.9 })); paper.position.set(-0.12, DT + 0.03, DZ + 0.06); paper.rotation.y = 0.12; desk.add(paper); }

  // the light: the lamp his key, warm and low from his left; a soft warm fill from the room; the window's moonlight
  // cool on his hair and shoulders from behind; a low amber ambient (no shadows: a still little room)
  scene.add(new THREE.AmbientLight('#2B1D14', 0.55));
  const key = new THREE.PointLight('#FFC27E', 3.4, 0, 2); key.position.copy(lampP).add(V(-0.08, 0.27, -0.04)); scene.add(key);
  const fill = new THREE.PointLight('#FFAE6E', 1.25, 0, 2); fill.position.set(-1.1, 1.75, 1.7); scene.add(fill);
  const front = new THREE.PointLight('#FFD9B0', 0.9, 0, 2); front.position.set(0.25, 1.35, 1.9); scene.add(front);
  const moon = new THREE.PointLight('#8AA8FF', 2.6, 0, 2); moon.position.set(0.35, 2.1, -1.35); scene.add(moon);
  const moon2 = new THREE.PointLight('#6F8CE8', 1.2, 0, 2); moon2.position.set(-0.6, 1.6, -1.5); scene.add(moon2);

  // the smoke: the game's own vapour puffs, grey, thin and slow off the tip
  const smoke = createVapor(scene);

  /* ---------------------------------------------------------- the camera -- */
  const cam = new THREE.PerspectiveCamera(34, 16 / 9, 0.05, 30);
  const phoneCam = new THREE.PerspectiveCamera(42, 0.46, 0.05, 30);
  const rt = new THREE.RenderTarget(236, 512, { samples: 4 });
  rt.texture.colorSpace = THREE.LinearSRGBColorSpace;

  /* ----------------------------------------------------------- the pose -- */
  // seated upright in his chair (his model's own rest pose, the legs folded at the hips and knees, the hips set down on
  // the seat); his left hand by his glass on the desk, his right raised with the cigar beside his face
  const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
  const spine = ['spine05', 'spine04', 'spine03', 'spine02', 'spine01'].map((n) => bones[n]).filter(Boolean);
  // the hands (27 Oct, the owner: "Mr. Big hand with cigar are not right": an open claw, the cigar floating in front of
  // his palm). Each hand is posed in its own frame (frame): F along it (the wrist to the middle knuckle), A across it
  // (the little finger's knuckle to the index's), N out of the palm. The hand is turned to a wanted F and N (orient: a
  // share of the turn about the forearm in its twist bone, the rest at the wrist, so the wrist never wrings), then each
  // finger: its spread in the palm's plane (from F, toward the index side +) and its three joints bent toward the palm
  const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
  function frame(s) {
    const w = wp(bones['wrist_' + s]), k2 = wp(bones['finger2-1_' + s]), k3 = wp(bones['finger3-1_' + s]), k5 = wp(bones['finger5-1_' + s]);
    const F = k3.sub(w).normalize(), A = k2.sub(k5); A.addScaledVector(F, -A.dot(F)).normalize();
    const N = s === 'R' ? V().crossVectors(A, F) : V().crossVectors(F, A);
    return { F, A, N: N.normalize() };
  }
  // (a world rotation for a bone, its children with it)
  function turnQ(b, q) { b.getWorldQuaternion(_q2); _q.copy(q).multiply(_q2); b.parent.getWorldQuaternion(_q2); b.quaternion.copy(_q2.invert().multiply(_q)); b.updateMatrixWorld(true); }
  // (the rotation taking frame (F, N) to (F2, N2))
  const between = (F, N, F2, N2, out) => {
    _m1.makeBasis(F, N, V().crossVectors(F, N)); _m2.makeBasis(F2, N2, V().crossVectors(F2, N2));
    _qa.setFromRotationMatrix(_m1); _qb.setFromRotationMatrix(_m2); return out.copy(_qb).multiply(_qa.invert());
  };
  function orient(s, F2, N2, share = 0.55) {
    N2 = N2.clone().addScaledVector(F2, -N2.dot(F2)).normalize();
    const tw = bones['lowerarm02_' + s], wr = bones['wrist_' + s];
    if (tw) {
      const ax = wp(wr).sub(wp(bones['lowerarm01_' + s])).normalize(), f = frame(s), q = between(f.F, f.N, F2, N2, new THREE.Quaternion());
      // (the twist about the forearm: the part of q about ax)
      const p = V(q.x, q.y, q.z), d = p.dot(ax), ang = 2 * Math.atan2(d, q.w);
      turn(tw, ax, Math.atan2(Math.sin(ang), Math.cos(ang)) * share);
    }
    const f = frame(s); turnQ(wr, between(f.F, f.N, F2, N2, new THREE.Quaternion()));
  }
  // a finger (f 2 the index .. 5 the little finger): turned in the palm's plane by spread (rad, toward the index side +)
  // at its knuckle, then bent toward the palm at its three joints by bends[3] (rad), all about one axis (the finger
  // stays in its own plane: no joint rolls or kinks sideways)
  function finger(s, f, spread, bends, fr) {
    const b = [1, 2, 3].map((j) => bones[`finger${f}-${j}_${s}`]); if (!b[0] || !b[1]) return;
    const { F, A, N } = fr;
    if (spread) turn(b[0], V().crossVectors(F, A).normalize(), spread);
    const d = wp(b[1]).sub(wp(b[0])); d.addScaledVector(N, -d.dot(N)).normalize();
    const ax = V().crossVectors(d, N).normalize();
    for (let j = 0; j < 3; j++) if (b[j] && bends[j]) turn(b[j], ax, bends[j]);
  }
  // (the thumb: in toward the palm by opp (rad, about the hand's long axis, F), its two outer joints bent by bends)
  // (add: the thumb's base turned in the palm's plane, about N, toward the index (+): the left hand's rest only)
  function thumb(s, opp, bends, fr, add = 0) {
    const { F, N } = fr, t = [1, 2, 3].map((j) => bones[`finger1-${j}_${s}`]); if (!t[0]) return;
    if (opp) turn(t[0], F.clone().multiplyScalar(s === 'R' ? -1 : 1), opp);
    if (add) turn(t[0], N, add);
    const d = wp(t[2] || t[1]).sub(wp(t[1] || t[0])); d.addScaledVector(N, -d.dot(N)).normalize();
    const ax = V().crossVectors(d, N).normalize();
    for (let j = 1; j < 3; j++) if (t[j] && bends[j - 1]) turn(t[j], ax, bends[j - 1]);
  }
  // the grips: the right hand round the cigar (index and middle parted round it and gently bent; the ring and little
  // fingers curled in under them, the thumb relaxed along the index); the left hand resting, loose, the fingers together
  // (R: at rest; P: the demand, the two fingers round the cigar straighter, at the lens, the others curled in tight)
  const GRIP = {
    R: { thumb: [0.1, [0.1, 0.16]], f: [[2, 0.12, [0.2, 0.3, 0.16]], [3, -0.12, [0.24, 0.34, 0.18]], [4, -0.02, [0.55, 0.7, 0.36]], [5, -0.04, [0.62, 0.74, 0.38]]] },
    P: { thumb: [0.22, [0.22, 0.3]], f: [[2, 0.12, [0.12, 0.1, 0.05]], [3, -0.12, [0.16, 0.12, 0.06]], [4, -0.02, [0.95, 1.05, 0.5]], [5, -0.04, [1.0, 1.05, 0.5]]] },
    // (the left at rest on the desk, 28 Oct repair: a soft natural curl, the index least and the little finger most, the
    // fingers drawn together (the rest pose's are spread), the thumb relaxed and tucked in under the index; settleL then
    // bends each at its knuckle onto the leather)
    L: { thumb: [-0.3, [0.15, 0.3], -0.85], f: [[2, -0.13, [0.1, 0.55, 0.3]], [3, 0, [0.12, 0.62, 0.33]], [4, 0.1, [0.14, 0.68, 0.36]], [5, 0.2, [0.16, 0.74, 0.38]]] },
  };
  // (k: how far toward the demand's grip, the right hand only)
  function grip(s, k = 0) {
    const G = GRIP, g = G[s], h = s === 'R' && k > 0 && G.P ? G.P : null, fr = frame(s), mix = (a, b) => (h ? a + (b - a) * k : a);
    g.f.forEach(([f, sp, bends], i) => finger(s, f, mix(sp, h?.f[i][1]), bends.map((x, j) => mix(x, h?.f[i][2][j])), fr));
    thumb(s, mix(g.thumb[0], h?.thumb[0]), g.thumb[1].map((x, j) => mix(x, h?.thumb[1][j])), fr, h ? 0 : g.thumb[2] || 0);
  }
  // (the left hand's wrist over the desk: y m over the desk's top, k more per unit of lean. 28 Oct: the second pass
  // raised it to 0.1215 so the fingertips cleared the leather, and the hand hovered on stiff, splayed fingertips. The
  // repair puts it back about where the first pass had it (0.06 + 0.02 lean) and lays the hand itself on the leather
  // (settleL). Not with lean, though: the wrist rising 15 mm as he leans in (by 65.9 s) left a planted hand the choice of
  // its heel in the air or its fingertips in the desk; a resting hand stays where it is. 58 mm: the wrist as low as the
  // heel of his heavy hand lets it, so the palm can arch and the fingers curl down onto the leather)
  const LH = { y: 0.058, k: 0 };
  // his left hand laid on the desk's leather (28 Oct repair), as a real resting hand lies: the heel of the palm on it, the
  // knuckles up a little, the fingers curled softly down so their pads rest on it, nothing in it. After the hand is posed
  // (reach, orient, grip), it is pitched about the wrist till the palm's lowest point is LREST.palm over the leather, then
  // each finger is bent at its knuckle till its lowest point is LREST.pad over it, the thumb turned at its base till it
  // is LREST.thumb over it. Measured on his skin itself: the lowest skinned point of each part (the parts: the skin's points
  // by the bone that holds each most)
  const LEATHER = DT + 0.028, LREST = { palm: 0.0008, pad: 0.0006, thumb: 0.0015, pitch: [-0.4, 0.5], knuckle: [-0.3, 0.6], base: [-0.8, 0.8] };
  const _lv = V();
  const LPART = (() => {
    const g = skin.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bi = (n) => sk.bones.indexOf(bones[n]);
    const out = { palm: [], f: { 1: [], 2: [], 3: [], 4: [], 5: [] }, pruned: false };
    const of = new Map([[bi('wrist_L'), 'palm'], [bi('finger1-1_L'), 'palm']]);
    for (let f = 1; f <= 5; f++) for (let j = 1; j <= 3; j++) if (!(f === 1 && j === 1)) of.set(bi(`finger${f}-${j}_L`), f);
    for (const v of new Set(g.index.array)) {
      let best = -1, bw = 0; for (let j = 0; j < 4; j++) { const w = sw.getComponent(v, j); if (w > bw) { bw = w; best = si.getComponent(v, j); } }
      const p = of.get(best); if (p === 'palm') out.palm.push(v); else if (p) out.f[p].push(v);
    }
    return out;
  })();
  const lowY = (set) => { let m = Infinity; for (const v of set) { skin.getVertexPosition(v, _lv); _lv.applyMatrix4(skin.matrixWorld); if (_lv.y < m) m = _lv.y; } return m; };
  // (b turned about a world axis through its joint by the angle that puts set's lowest point want over the leather:
  // secant steps from where it is, the angle kept in lim)
  function settle(b, axis, set, want, lim) {
    const q0 = b.quaternion.clone();
    const at = (a) => { b.quaternion.copy(q0); b.updateMatrixWorld(true); if (a) turn(b, axis, a); return lowY(set) - LEATHER - want; };
    let x0 = 0, f0 = at(0); if (Math.abs(f0) < 0.0002) return 0;
    let x1 = 0.06, f1 = at(x1);
    for (let i = 0; i < 5 && Math.abs(f1) > 0.0002; i++) {
      const sl = (f1 - f0) / (x1 - x0); if (Math.abs(sl) < 1e-5) break;
      const x2 = clamp(x1 - f1 / sl, lim[0], lim[1]); if (x2 === x1) break;
      x0 = x1; f0 = f1; x1 = x2; f1 = at(x1);
    }
    return x1;
  }
  const lrest = { pitch: 0, f: [0, 0, 0, 0, 0] };
  function settleL() {
    // (the palm: pitched about the hand's own across axis)
    lrest.pitch = settle(bones.wrist_L, frame('L').A, LPART.palm, LREST.palm, LREST.pitch);
    const { N, F } = frame('L');
    // (each finger at its knuckle, about the axis its bends turn on)
    for (let f = 2; f <= 5; f++) {
      const b0 = bones[`finger${f}-1_L`], b1 = bones[`finger${f}-2_L`]; if (!b0 || !b1) continue;
      const d = wp(b1).sub(wp(b0)); d.addScaledVector(N, -d.dot(N)).normalize();
      lrest.f[f - 1] = settle(b0, V().crossVectors(d, N).normalize(), LPART.f[f], LREST.pad, LREST.knuckle);
    }
    // (the thumb at its base, about the hand's long axis)
    if (bones['finger1-1_L']) lrest.f[0] = settle(bones['finger1-1_L'], F, LPART.f[1], LREST.thumb, LREST.base);
    // (then only the lower points of each part are looked at: the same parts' undersides in every pose after this one)
    if (!LPART.pruned) { LPART.pruned = true;
      const keep = (set) => { const h = set.map((v) => { skin.getVertexPosition(v, _lv); _lv.applyMatrix4(skin.matrixWorld); return [v, _lv.y]; }).sort((a, b) => a[1] - b[1]);
        return h.slice(0, Math.max(16, Math.ceil(h.length * 0.4))).map((e) => e[0]); };
      LPART.palm = keep(LPART.palm); for (let f = 1; f <= 5; f++) LPART.f[f] = keep(LPART.f[f]); }
  }
  let seated = true;
  function sit(stand) {
    sk.pose();
    seated = !stand;
    root.position.y = stand ? 0 : -SEAT_DROP; chair.visible = desk.visible = !stand; front.intensity = stand ? 2.4 : 0.9;
    root.updateMatrixWorld(true);
    if (!stand) for (const s of ['L', 'R']) {
      const th = bones['upperleg01_' + s], sh = bones['lowerleg01_' + s], ft = bones['foot_' + s], o = s === 'L' ? 1 : -1;
      turn(th, X, -PI / 2 + 0.06); turn(th, Y, o * 0.1); turn(sh, X, PI / 2 - 0.02); turn(ft, X, -0.04);
    }
    // (standing: the model's rest has the legs splayed 6 degrees out, the feet 41 cm apart; each leg in to a natural
    // stance, the feet about hip width, the soles kept flat on the floor)
    else for (const s of ['L', 'R']) { const o = s === 'L' ? 1 : -1; turn(bones['upperleg01_' + s], Z, -o * 0.065); turn(bones['foot_' + s], Z, o * 0.065); }
  }
  // the right hand's aim (F along the hand, N out of the palm; world, his study: he faces +z, his right is -x). The cigar
  // goes out the back of the hand, so where it points follows N:
  //  rest   the forearm up from the chair's arm, the hand up beside his face, the fingers up and a little out, the palm
  //         turned in toward him: the cigar out to his right and forward, tilted up, the smoke rising clear of him
  //  lips   the palm to his mouth, the fingers up and out to his right: the cigar's cap in his lips
  //  lens   the demand: his arm out at the lens, the fingers toward it, the palm down and turned in a little: the cigar
  //         stands up out of his fingers, leaning at the lens
  const AIM = {
    rest: [V(-0.16, 1, 0.22), V(0.85, 0.05, -0.5)],
    lips: [V(-0.65, 0.75, 0.1), V(0.12, 0.05, -1)],
    lens: [V(-0.08, 0.12, 1), V(0.45, -1, 0.05)],
  };
  const _qr = new THREE.Quaternion(), _ql = new THREE.Quaternion();
  const aimQ = (F, N, out) => { const f = F.clone().normalize(), n = N.clone().addScaledVector(f, -N.dot(f)).normalize(); return out.setFromRotationMatrix(_m1.makeBasis(f, n, V().crossVectors(f, n))); };
  function handAim(puff, point) {
    const q = aimQ(...AIM.rest, new THREE.Quaternion());
    q.slerp(aimQ(...AIM.lips, _qr), smooth(puff)).slerp(aimQ(...AIM.lens, _ql), smooth(point));
    // (back to F and N: the basis' first two columns)
    const m = _m2.makeRotationFromQuaternion(q).elements;
    return { F: V(m[0], m[1], m[2]), N: V(m[4], m[5], m[6]) };
  }
  const st = { t: -1, puffT: -9, smokeAcc: 0, tip: V() };
  // (what is drawn: the full-frame insert's camera, the phone's feed, frames left to draw both for the compile)
  const state = { full: null, phone: false, warm: 0 };
  // t: the scene clock; lean: toward the lens (0..1); tilt: his head to one side (rad); point: the cigar pointed at the
  // lens (the demand, 0..1); puff: the cigar at his lips (0..1); stand: up out of his chair (for looking at him)
  function pose(t, { lean = 0, tilt = 0, point = 0, puff = 0, stand = false } = {}) {
    const dt = st.t < 0 ? 0 : clamp(t - st.t, 0, 0.1); st.t = t;
    sit(stand);
    // (upright, chin level; leaning in toward the lens; a slow breath; a heavy man's settled shoulders)
    for (const b of spine) turn(b, X, (-0.012 + (seated ? 0.12 : 0.04) * lean + 0.008 * Math.sin(t * 1.5)) / spine.length);
    if (bones.neck01) turn(bones.neck01, X, 0.04 * lean);
    if (bones.head) { turn(bones.head, Z, tilt); turn(bones.head, X, -0.03 + 0.05 * lean); }
    for (const s of ['L', 'R']) { const c = bones['clavicle_' + s]; if (c) turn(c, Z, (s === 'L' ? -1 : 1) * 0.05); }
    const sL = wp(bones.upperarm01_L), sR = wp(bones.upperarm01_R), chest = wp(bones.spine01);
    if (stand) {
      // (standing: his arms down at his sides, the cigar hand a little forward)
      reach(bones.upperarm01_L, bones.lowerarm01_L, bones.wrist_L, sL.clone().add(V(0.05, -0.56, 0.06)), sL.clone().add(V(0.4, -0.2, -0.6)));
      reach(bones.upperarm01_R, bones.lowerarm01_R, bones.wrist_R, sR.clone().add(V(-0.02, -0.38, 0.26)), sR.clone().add(V(-0.5, -0.4, -0.5)));
    } else {
      // (his left hand at rest on the desk beside his glass, palm down, the fingers forward and in)
      reach(bones.upperarm01_L, bones.lowerarm01_L, bones.wrist_L, V(glassP.x - 0.13, DT + LH.y + LH.k * lean, glassP.z - 0.13 + 0.04 * lean), sL.clone().add(V(0.55, -0.35, -0.45)));
      // (28 Oct repair: the palm down flat to the leather, rolled a touch onto its little finger's side, as a resting
      // hand lies; settleL then pitches it about the wrist till the heel of the palm is on the leather)
      orient('L', V(-0.35, -0.06, 1).normalize(), V(-0.12, -1, 0.06));
      // (his right: the elbow down by his side on the chair's arm, the cigar hand up beside his face; to his lips for a
      // puff; out at the lens for the demand)
      const rest = sR.clone().add(V(-0.05, 0.04, 0.2)), lens = sR.clone().add(V(0.08, 0.04, 0.44));
      const hand = handAim(puff, point), pole = sR.clone().add(V(-0.35, -0.8, -0.05).lerp(V(-0.4, -0.55, 0.1), smooth(point)));
      let target = rest.clone().lerp(lens, smooth(point));
      const kp = smooth(puff);
      if (kp > 0.001) {
        // (at his lips: the wrist put where the cigar's cap lands in his lips, found by trying it twice)
        const mouth = bones.head.localToWorld(mouthLocal.clone()), at = target.clone().lerp(mouth.clone().add(V(-0.07, -0.11, 0.01)), kp);
        const arm = ['upperarm01_R', 'upperarm02_R', 'lowerarm01_R', 'lowerarm02_R', 'wrist_R'].map((n) => bones[n]).filter(Boolean), q0 = arm.map((b) => b.quaternion.clone());
        for (let i = 0; i < 2 && capLocal; i++) {
          reach(bones.upperarm01_R, bones.lowerarm01_R, bones.wrist_R, at, pole); orient('R', hand.F, hand.N);
          at.addScaledVector(mouth.clone().sub(bones.wrist_R.localToWorld(capLocal.clone())), kp);
          arm.forEach((b, k) => b.quaternion.copy(q0[k])); root.updateMatrixWorld(true);
        }
        target = at;
      }
      reach(bones.upperarm01_R, bones.lowerarm01_R, bones.wrist_R, target, pole);
      orient('R', hand.F, hand.N);
    }
    grip('L'); grip('R', smooth(point));
    if (!stand) settleL();
    root.updateMatrixWorld(true);
    // his eyes on the lens (the face runs itself: his mouth with his voice, his blinks)
    face.look = state.full ? cam.position : phoneCam.position;
    // the ember breathing; the smoke off it, thin, curling up and away; after a puff, a slow breath of smoke from his mouth
    st.tip.copy(tipW());
    const glow = cigar.userData.glow.material.color, k = 0.85 + 0.15 * Math.sin(t * 7.3) * Math.sin(t * 2.1) + 0.6 * smooth(puff);
    glow.setRGB(3.2 * k, 0.9 * k, 0.22 * k);
    cigar.userData.face?.material.color.setScalar(0.9 + 0.35 * k);
    if (puff > 0.6) st.puffT = t;
    if (dt > 0) {
      st.smokeAcc += dt * 18;
      while (st.smokeAcc >= 1) { st.smokeAcc -= 1; smoke.puff(st.tip.x, st.tip.y + 0.01, st.tip.z, (Math.random() - 0.5) * 0.025 + 0.01, 0.1 + Math.random() * 0.05, (Math.random() - 0.5) * 0.02, { r: 0.004, grow: 6, life: 2.2 + Math.random(), a: 0.11, k: 0.42, drag: 0.9, lift: 0.06 }); }
      const since = t - st.puffT;
      if (since > 0.15 && since < 1.4 && Math.random() < dt * 14) { const m = wp(bones.head).add(V(0, -0.05, 0.12)); smoke.puff(m.x, m.y, m.z, (Math.random() - 0.5) * 0.05, 0.05, 0.1 + Math.random() * 0.05, { r: 0.012, grow: 4, life: 1.8, a: 0.07, k: 0.4, drag: 1.6, lift: 0.06 }); }
      smoke.update(dt);
    }
  }

  // his eyes in his study, seated (the shots are framed on them)
  pose(0);
  // the cigar into his hand as it is posed: between the index and middle fingers (their first bones, CIG.at of the way
  // along), across them out of the palm and a little toward the fingertips; its head out on the palm's side, the lit end
  // out past the back of his hand; then it rides on his index finger (the fingers keep the grip in every gesture).
  // (28 Oct, second pass: it sat 0.4 along, where the two fingers are closest, and ran 7.6 mm into the index's base and
  // 6.3 into the middle; the fingers now part a little more (GRIP's spreads 0.12 / -0.12) and it sits 0.82 along, resting
  // between them: no skin inside it, both fingers within a mm of it, at rest, in the demand and in the puff)
  function placeCigar() {
    const p = (f, k) => wp(bones[`finger${f}-1_R`]).lerp(wp(bones[`finger${f}-2_R`]), k);
    const fr = frame('R'), hold = p(2, CIG.at).add(p(3, CIG.at)).multiplyScalar(0.5);
    const d = wp(bones['finger2-2_R']).sub(wp(bones['finger2-1_R'])).add(wp(bones['finger3-2_R']).sub(wp(bones['finger3-1_R']))).normalize();
    const D = fr.N.clone().negate().multiplyScalar(Math.cos(CIG.lean)).addScaledVector(d, Math.sin(CIG.lean)).normalize();
    scene.add(cigar); cigar.position.copy(hold).addScaledVector(D, -CIG.head); cigar.quaternion.setFromUnitVectors(V(0, 1, 0), D);
    cigar.updateMatrixWorld(true); bones['finger2-1_R'].attach(cigar); cigar.traverse((k) => { if (k.isMesh) k.frustumCulled = false; });
    capLocal = bones.wrist_R.worldToLocal(cigar.localToWorld(V(0, -0.004, 0)));
  }
  placeCigar();
  const EYE = face.eyes(V()).add(V(0, 0, 0.02));
  phoneCam.position.set(EYE.x + 0.02, EYE.y - 0.02, EYE.z + 1.17); phoneCam.lookAt(EYE.x, EYE.y - 0.13, EYE.z - 0.08);
  // (his face shows, and talks, only while his study is on a screen)
  face.shown = () => !!(state.full || state.phone || state.warm);

  /* ----------------------------------------------------------- the draw -- */
  // (in front of the city's frame: the full-frame insert replaces it; the phone's feed is drawn before it)
  const rp = app.renderPipeline, render0 = rp.render.bind(rp);
  rp.render = function (...a) {
    try {
      if (state.phone || state.warm) { renderer.setRenderTarget(rt); renderer.render(scene, phoneCam); renderer.setRenderTarget(null); }
      if (state.full || state.warm) {
        const c = state.full || { pos: [EYE.x + 0.2, EYE.y, EYE.z + 1.8], look: [EYE.x, EYE.y - 0.15, EYE.z], fov: 34 };
        cam.position.set(...c.pos); cam.lookAt(c.look[0], c.look[1], c.look[2]); if (c.roll) cam.rotateZ(c.roll);
        const asp = app.cameraSystem.camera.aspect || 16 / 9;
        if (cam.fov !== c.fov || cam.aspect !== asp) { cam.fov = c.fov; cam.aspect = asp; cam.updateProjectionMatrix(); }
        renderer.setRenderTarget(null); renderer.render(scene, cam);
        if (state.full) return;
      }
    } catch (e) { console.warn('[mrbig]', e); state.full = null; state.phone = false; }
    if (state.warm) state.warm--;
    return render0(...a);
  };
  return {
    scene, root, inner, bones, cam, phoneCam, eye: EYE, texture: rt.texture, face, mouth, glasses, cigar, smoke, fit: { halfW, noseZ, ipd, eyeR, eyeMid: eyeMid.toArray() },
    pose,
    full(c) { state.full = c || null; },
    phone(on) { state.phone = !!on; },
    // the pipelines, the frame buffer and the feed built now (behind the gate), not on the insert's first frame
    async warm() { pose(0); try { await renderer.compileAsync(scene, cam); } catch (e) { console.warn('[mrbig] compile', e); } state.warm = 3; },
  };
}
