// Mog City: Mr. Big, the CEO of JPBank, on a video call from his study. His study is a little scene of its own, not the
// city's (a light added to the city would cost every material in it a recompile): walnut panelling, bookshelves either
// side of a tall window with Midtown at night behind him, a desk with a green-shaded banker's lamp, a whisky glass and
// a green leather inlay; Mr. Big seated upright in his oxblood wing chair behind it, in his navy three-piece, his
// glasses on, a cigar raised in his right hand, its tip glowing, thin grey smoke drifting off it. Lit low and warm (the
// lamp his key, from his left; a soft warm fill; the window's cool moonlight on his silver hair from behind).
// His model is assets/characters/mrbig.glb (an original face, nobody's: a CC0 MakeHuman build, .scratch/mrbig); his
// glasses and his cigar are made here, on his head and his right hand. wagmi/face.js gives his face its morphs: his
// jaw moves with his lines, he blinks, his eyes are on the lens. His hands are posed here too (27 Oct): each hand set by
// its own frame, the cigar held between the index and middle fingers near the knuckles (a relaxed grip at rest, an
// accusing two-finger point for the demand, its cap in his lips for a puff), the left hand at rest by his glass.
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
  // grey ash. Held between the first two fingers of his right hand, near the knuckles, across them: the head a few cm
  // out on the palm's side, the lit end out past the back of his hand (put there below, once his hand is posed)
  const cigar = new THREE.Group(); cigar.name = 'cigar';
  const leaf = new THREE.MeshStandardMaterial({ color: '#5B3920', roughness: 0.82 });
  const ember = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.9, 0.22) });
  const ashMat = new THREE.MeshStandardMaterial({ color: '#8E8984', roughness: 1 });
  const CIG = { L: 0.13, R: 0.0082, head: 0.034, at: 0.4, lean: 0.3 };
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
  function thumb(s, opp, bends, fr) {
    const { F, N } = fr, t = [1, 2, 3].map((j) => bones[`finger1-${j}_${s}`]); if (!t[0]) return;
    if (opp) turn(t[0], F.clone().multiplyScalar(s === 'R' ? -1 : 1), opp);
    const d = wp(t[2] || t[1]).sub(wp(t[1] || t[0])); d.addScaledVector(N, -d.dot(N)).normalize();
    const ax = V().crossVectors(d, N).normalize();
    for (let j = 1; j < 3; j++) if (t[j] && bends[j - 1]) turn(t[j], ax, bends[j - 1]);
  }
  // the grips: the right hand round the cigar (index and middle parted round it and gently bent; the ring and little
  // fingers curled in under them, the thumb relaxed along the index); the left hand resting, loose, the fingers together
  // (R: at rest; P: the demand, the two fingers round the cigar straighter, at the lens, the others curled in tight)
  const GRIP = {
    R: { thumb: [0.1, [0.1, 0.16]], f: [[2, 0.07, [0.2, 0.3, 0.16]], [3, -0.05, [0.24, 0.34, 0.18]], [4, -0.02, [0.55, 0.7, 0.36]], [5, -0.04, [0.62, 0.74, 0.38]]] },
    P: { thumb: [0.22, [0.22, 0.3]], f: [[2, 0.07, [0.12, 0.1, 0.05]], [3, -0.05, [0.16, 0.12, 0.06]], [4, -0.02, [0.95, 1.05, 0.5]], [5, -0.04, [1.0, 1.05, 0.5]]] },
    L: { thumb: [0.05, [0.08, 0.12]], f: [[2, 0, [0.14, 0.2, 0.1]], [3, 0, [0.16, 0.22, 0.12]], [4, 0, [0.2, 0.26, 0.14]], [5, 0, [0.24, 0.28, 0.14]]] },
  };
  // (k: how far toward the demand's grip, the right hand only)
  function grip(s, k = 0) {
    const G = GRIP, g = G[s], h = s === 'R' && k > 0 && G.P ? G.P : null, fr = frame(s), mix = (a, b) => (h ? a + (b - a) * k : a);
    g.f.forEach(([f, sp, bends], i) => finger(s, f, mix(sp, h?.f[i][1]), bends.map((x, j) => mix(x, h?.f[i][2][j])), fr));
    thumb(s, mix(g.thumb[0], h?.thumb[0]), g.thumb[1].map((x, j) => mix(x, h?.thumb[1][j])), fr);
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
      reach(bones.upperarm01_L, bones.lowerarm01_L, bones.wrist_L, V(glassP.x - 0.13, DT + 0.06 + 0.02 * lean, glassP.z - 0.13 + 0.04 * lean), sL.clone().add(V(0.55, -0.35, -0.45)));
      orient('L', V(-0.35, -0.22, 1).normalize(), V(0.1, -1, 0.15));
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
  // the cigar into his hand as it is posed: between the index and middle fingers near the knuckles (their first bones,
  // half way along), across them out of the palm and a little toward the fingertips; its head out on the palm's side,
  // the lit end out past the back of his hand; then it rides on his wrist (the fingers keep the grip in every gesture)
  {
    const p = (f, k) => wp(bones[`finger${f}-1_R`]).lerp(wp(bones[`finger${f}-2_R`]), k);
    const fr = frame('R'), hold = p(2, CIG.at).add(p(3, CIG.at)).multiplyScalar(0.5);
    const d = wp(bones['finger2-2_R']).sub(wp(bones['finger2-1_R'])).add(wp(bones['finger3-2_R']).sub(wp(bones['finger3-1_R']))).normalize();
    const D = fr.N.clone().negate().multiplyScalar(Math.cos(CIG.lean)).addScaledVector(d, Math.sin(CIG.lean)).normalize();
    scene.add(cigar); cigar.position.copy(hold).addScaledVector(D, -CIG.head); cigar.quaternion.setFromUnitVectors(V(0, 1, 0), D);
    cigar.updateMatrixWorld(true); bones['finger2-1_R'].attach(cigar); cigar.traverse((k) => { if (k.isMesh) k.frustumCulled = false; });
    capLocal = bones.wrist_R.worldToLocal(cigar.localToWorld(V(0, -0.004, 0)));
  }
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
    scene, root, inner, bones, cam, phoneCam, eye: EYE, texture: rt.texture, face, glasses, cigar, smoke, fit: { halfW, noseZ, ipd, eyeR, eyeMid: eyeMid.toArray() },
    pose,
    full(c) { state.full = c || null; },
    phone(on) { state.phone = !!on; },
    // the pipelines, the frame buffer and the feed built now (behind the gate), not on the insert's first frame
    async warm() { pose(0); try { await renderer.compileAsync(scene, cam); } catch (e) { console.warn('[mrbig] compile', e); } state.warm = 3; },
  };
}
