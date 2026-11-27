// Mog City story runner: what a person stood on the street (an `npc` step) has with them. A story plants a thing by
// showing it: `push: 'chair'`, an executive chair in mahogany and oxblood leather rolled in front of them on its castors
// (they walk behind it, its back to their hands); `lanyard: true`, a pass on a lanyard round their neck (a blank white
// card, a navy band across its top), on the chest bone so it moves with them. Nothing in them is a brand.
//   const c = chairProp(); scene.add(c)   (its front at -z: they push it toward +z of their own heading)
//   lanyardOn(fig)                          the pass on a cast figure (its bones), once; lanyardOff(fig) takes it off
//   pushHands(fig, chair, armTo, k)          both hands on the chair's back, the elbows bent and low, as a man wheels it
import * as THREE from 'three/webgpu';

const PI = Math.PI;
const box = (w, h, d, m, x, y, z, G) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y + h / 2, z); b.castShadow = true; b.receiveShadow = true; G.add(b); return b; };

// an executive chair: five castors on a star base, a gas lift in brass, a deep seat and a tall buttoned back in oxblood
// leather, mahogany arms and a mahogany crown on the back (faces +z: its seat front)
export function chairProp() {
  const G = new THREE.Group(); G.name = 'npc-chair';
  const mah = new THREE.MeshStandardMaterial({ color: '#5A2414', roughness: 0.32 }), ox = new THREE.MeshStandardMaterial({ color: '#4A1512', roughness: 0.42 });
  const brass = new THREE.MeshStandardMaterial({ color: '#B68A3E', roughness: 0.3, metalness: 1 }), black = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.5 });
  for (let i = 0; i < 5; i++) { const a = (i * 2 * PI) / 5, leg = box(0.05, 0.04, 0.36, mah, Math.sin(a) * 0.18, 0.06, Math.cos(a) * 0.18, G); leg.rotation.y = a;
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), black); w.position.set(Math.sin(a) * 0.34, 0.035, Math.cos(a) * 0.34); G.add(w); }
  const lift = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.36, 12), brass); lift.position.y = 0.28; G.add(lift);
  box(0.6, 0.12, 0.56, ox, 0, 0.44, 0, G); box(0.6, 0.86, 0.12, ox, 0, 0.52, -0.27, G); box(0.66, 0.08, 0.16, mah, 0, 1.38, -0.28, G);
  for (const sx of [-1, 1]) { box(0.07, 0.06, 0.48, mah, sx * 0.33, 0.66, -0.02, G); box(0.05, 0.2, 0.05, mah, sx * 0.33, 0.48, 0.18, G); }
  // (the back's buttons, in rows)
  const bm = new THREE.MeshStandardMaterial({ color: '#2E0C0A', roughness: 0.5 });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), bm); b.position.set(-0.16 + c * 0.16, 0.78 + r * 0.18, -0.205); G.add(b); }
  return G;
}

// a pass on a lanyard round a cast figure's neck, on its chest bone (MakeHuman's or a rig's own names)
export function lanyardOn(fig) {
  const B = fig?.bones || {}; if (fig.__lanyard) return; fig.__lanyard = [];
  const neck = B.neck01 || B.neck || B.Neck || B.neck_01, chest = (neck && neck.parent?.isBone ? neck.parent : null) || B.spine03 || B.spine_03 || B.spine2 || B.Spine2;
  if (!neck || !chest) return;
  const root = fig.root; root.updateMatrixWorld(true);
  const n = root.worldToLocal(neck.getWorldPosition(new THREE.Vector3()));
  const navy = new THREE.MeshStandardMaterial({ color: '#22324E', roughness: 0.8 });
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.006, 4, 30), navy);
  loop.rotation.x = PI / 2 - 0.42; loop.scale.set(1, 1.3, 1); loop.position.set(n.x, n.y - 0.13, n.z + 0.05);
  const pass = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.004), new THREE.MeshStandardMaterial({ color: '#ECEDEF', roughness: 0.4 }));
  pass.position.set(n.x, n.y - 0.33, n.z + 0.15); pass.rotation.x = -0.12;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.005), navy); band.position.y = 0.038; pass.add(band);
  root.add(loop, pass); chest.attach(loop); chest.attach(pass); fig.__lanyard = [loop, pass];
}
// (the pass off again: the mission that put it on ends, so a Director does not wear the plant's lanyard for the rest
// of the session, into every call and fight after it)
export function lanyardOff(fig) {
  if (!fig || !fig.__lanyard) return;
  for (const o of fig.__lanyard) { o.removeFromParent(); o.geometry?.dispose?.(); }
  fig.__lanyard = null;
}

// both hands on the chair's back while they wheel it (after the walk clip, every frame): each hand on the back's top
// rail, either side of the crown (the chair's own frame: its back at z -0.28, the rail's top at 1.42 m), the elbows bent
// down and out behind it; k eases the hold in and out (0 the clip's own arms)
const _t = new THREE.Vector3(), _p = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3();
export function pushHands(fig, chair, armTo, k = 1) {
  const B = fig?.bones; if (!B || !chair || k <= 0.001) return;
  chair.updateMatrixWorld(true);
  const h = chair.rotation.y; _f.set(Math.sin(h), 0, Math.cos(h)); _r.set(Math.cos(h), 0, -Math.sin(h));
  for (const [side, sg] of [['L', 1], ['R', -1]]) {
    _t.set(sg * 0.2, 1.37, -0.3); chair.localToWorld(_t);
    // (the elbow behind and out, a little under the hand: a man leaning into a push)
    _p.copy(_t).addScaledVector(_f, -0.45).addScaledVector(_r, sg * 0.5); _p.y -= 0.55;
    armTo(B, side, _t.clone(), _p.clone(), k, ['upperarm01_', 'lowerarm01_', 'wrist_']);
  }
}
