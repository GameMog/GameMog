// Mog City: street weapons and props, about the sidewalk, in a Suit's hand or in Dan's. No guns, no knives.
//   bat        lathe-turned ash with black tape (a Suit's: stained black, acid-green tape); swung; ~8 hits and it snaps
//   bottle     lathe glass (a TSL node material: clear face-on, solid at the edges), half full; smashed over a head (one
//              use) or thrown: it arcs and shatters
//   trash can  the CC0 scan (assets/props/trash-cans.glb: galvanised or rusted), its lid a part of its own; lifted with
//              both hands and thrown at a crowd (it bowls over whoever it meets, bounces, rolls, the lid flies off) or
//              brought down on a man lying in the street
// An item is: rest (standing or lying about: the grab key picks it up) · held (holdOn puts it in the fist after the
// pose) · fly (thrown or dropped: a rigid body: gravity, a tumble, bounces off the street, the walls and men) · roll (on
// its side) · wobble (a lid settling) · gone. Its origin is its centre and its long axis its +Y (a lathe's axis).
import * as THREE from 'three/webgpu';
import { loadGLB } from '../glb.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { float, mix, pow, abs, dot, color, normalView, positionViewDirection } from 'three/tsl';
import { clamp, rnd, pick, hdist, fwd, yawTo } from './util.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _p = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
const G = 20;

// half: half its length along +Y; r: its radius (the hit and the physics capsule); grip: where the fist closes (local
// y); flip: held the other way up (a bottle by its neck, the body out past the thumb); reach: past the fist (a Suit's
// blow comes from further out); dmg: x the blow; hits: blows before it breaks; e: its bounce
export const ITEMS = {
  bat: { name: 'Bat', hands: 1, half: 0.421, r: 0.034, grip: -0.33, reach: 0.78, dmg: 1.7, hits: 8, breaks: true, e: 0.3, swings: ['slash1', 'slash2', 'slash3'] },
  bottle: { name: 'Bottle', hands: 1, half: 0.13, r: 0.034, grip: 0.085, flip: true, reach: 0.2, dmg: 2.2, hits: 1, breaks: true, throwable: true, e: 0.2, swings: ['smash'] },
  trashcan: { name: 'Trash can', hands: 2, half: 0.453, r: 0.276, reach: 0.4, dmg: 2.6, hits: 99, throwable: true, lift: true, e: 0.32, swings: ['crush'] },
  lid: { name: 'Lid', disc: true, R: 0.277, h: 0.05, half: 0.05, r: 0.277, e: 0.3, junk: true },
  piece: { name: 'Piece', half: 0.2, r: 0.03, e: 0.25, junk: true },
};
export const PICKABLE = new Set(['bat', 'bottle', 'trashcan']);

// ------------------------------------------------------------------ the fist (any rig)
// where a handle sits in a closed right fist and the way it runs (pinky side to thumb side, angled on to the fingers),
// worked out once per skeleton in the wrist bone's own space from the knuckles
const RIG = {
  hero: { wrist: 'wrist_R', index: 'finger2-1_R', middle: 'finger3-1_R', pinky: 'finger5-1_R', thumb: 'finger1-1_R' },
  thug: { wrist: 'handR', index: 'index1R', middle: 'middle1R', pinky: 'pinky1R', thumb: 'thumb1R' },
};
export const FIST = { tilt: 0.32, out: 0.92, palm: 0.42, side: 0.0 };
const fists = new WeakMap();
export function fist(bones, rig, pos, quat) {
  const R = RIG[rig], w = bones[R.wrist]; if (!w) return false;
  let L = fists.get(w);
  if (!L) {
    w.updateWorldMatrix(true, false);
    const inv = new THREE.Matrix4().copy(w.matrixWorld).invert();
    const loc = (n) => (bones[n] ? bones[n].getWorldPosition(new THREE.Vector3()).applyMatrix4(inv) : null);
    const kI = loc(R.index), kM = loc(R.middle), kP = loc(R.pinky), kT = loc(R.thumb);
    if (!kI || !kM || !kP) return false;
    const h = kM.length(), along = kM.clone().normalize();
    const across = kI.clone().sub(kP); across.addScaledVector(along, -across.dot(along)).normalize();
    const palm = new THREE.Vector3().crossVectors(along, across);
    if (kT && kT.dot(palm) < 0) palm.negate(); // the thumb's root sits on the palm's side
    const dir = across.clone().addScaledVector(along, FIST.tilt).normalize();
    const z = palm.clone().addScaledVector(dir, -palm.dot(dir)).normalize(), x = new THREE.Vector3().crossVectors(dir, z);
    const centre = along.clone().multiplyScalar(h * FIST.out).addScaledVector(palm, h * FIST.palm).addScaledVector(across, h * FIST.side);
    L = new THREE.Matrix4().makeBasis(x, dir, z).setPosition(centre);
    fists.set(w, L);
  }
  _m.multiplyMatrices(w.matrixWorld, L).decompose(pos, quat, _s);
  return true;
}

// ------------------------------------------------------------------ the models
function canvasTex(w, h, draw, srgb = true) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
// wood along the grain (a lathe's v runs down its length)
function woodTex(base, streak, seed) {
  let s = seed; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x0 = R() * w, wid = 0.4 + R() * 1.8, a = 0.05 + R() * 0.22, ph = R() * 6;
      g.strokeStyle = streak.replace('A', a.toFixed(3)); g.lineWidth = wid; g.beginPath();
      for (let y = 0; y <= h; y += 8) { const x = x0 + Math.sin(y * 0.03 + ph) * 1.5; y ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
  });
}
const lathe = (pts, seg = 18) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
// knob to end, (radius, height) m: a 33" ash bat
const BAT = [[0, 0], [0.019, 0], [0.0225, 0.004], [0.022, 0.012], [0.016, 0.02], [0.0128, 0.03], [0.012, 0.1], [0.0125, 0.2], [0.0142, 0.28], [0.0178, 0.36], [0.0228, 0.44], [0.0236, 0.46],
  [0.028, 0.53], [0.031, 0.6], [0.0325, 0.68], [0.033, 0.78], [0.0315, 0.825], [0.026, 0.838], [0.012, 0.842], [0, 0.843]];
const SPLIT = 11; // the bat snaps at its taper (y 0.46)
// a jagged break: a crown of splinters round the snapped end (dir +1 up, -1 down)
function splinters(r, y, dir, seed) {
  let s = seed; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const parts = [new THREE.CircleGeometry(r * 0.96, 10).rotateX(dir > 0 ? -Math.PI / 2 : Math.PI / 2).translate(0, y, 0)];
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + R() * 0.4, rr = r * (0.35 + R() * 0.6), len = 0.012 + R() * 0.05;
    const c = new THREE.ConeGeometry(0.004 + R() * 0.006, len, 4);
    if (dir < 0) c.rotateX(Math.PI);
    c.translate(Math.cos(a) * rr, y + dir * len / 2, Math.sin(a) * rr); parts.push(c.toNonIndexed ? c : c);
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}
const MAT = {};
function batMats(look) {
  const k = 'bat-' + look; if (MAT[k]) return MAT[k];
  const suit = look === 'suit';
  const wood = new THREE.MeshStandardMaterial({ map: suit ? woodTex('#2B2522', 'rgba(0,0,0,A)', 11) : woodTex('#C89660', 'rgba(110,62,26,A)', 7), roughness: suit ? 0.38 : 0.55, metalness: 0 });
  const tape = new THREE.MeshStandardMaterial({ color: '#141518', roughness: 0.82 }); // (black on the Suits' bats too, 27 Oct)
  const raw = new THREE.MeshStandardMaterial({ color: suit ? '#9C8466' : '#E2C08F', roughness: 0.9 }); // the wood inside a break
  return (MAT[k] = { wood, tape, raw });
}
function buildBat(look) {
  const M = batMats(look), g = new THREE.Group(), o = -0.421;
  const handle = new THREE.Mesh(lathe(BAT.slice(0, SPLIT + 1).concat([[0, 0.46]])).translate(0, o, 0), M.wood);
  const barrel = new THREE.Mesh(lathe([[0, 0.46]].concat(BAT.slice(SPLIT))).translate(0, o, 0), M.wood);
  const tape = new THREE.Mesh(lathe([[0.0137, 0.03], [0.0136, 0.1], [0.0139, 0.2], [0.0141, 0.235]], 14).translate(0, o, 0), M.tape);
  g.add(handle, barrel, tape);
  if (look === 'suit') { const ring = new THREE.Mesh(lathe([[0.0332, 0.7], [0.0337, 0.72], [0.0337, 0.735], [0.0332, 0.755]], 18).translate(0, o, 0), M.tape); barrel.add(ring); }
  const bh = new THREE.Mesh(splinters(0.0236, 0.46 + o, 1, 3), M.raw), bb = new THREE.Mesh(splinters(0.0236, 0.46 + o, -1, 5), M.raw);
  bh.visible = bb.visible = false; handle.add(bh); barrel.add(bb);
  g.userData = { handle, barrel, tape, crowns: [bh, bb] };
  return g;
}
// glass: see-through face-on, nearly solid at its edges (fresnel), the tint glowing faintly at the rim
function glassMat(tint) {
  const k = 'glass-' + tint; if (MAT[k]) return MAT[k];
  const m = new THREE.MeshStandardNodeMaterial({ transparent: true, roughness: 0.06, metalness: 0, side: THREE.FrontSide });
  const f = pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 2.2);
  m.colorNode = color(tint);
  m.opacityNode = mix(float(0.3), float(0.95), f);
  m.emissiveNode = color(tint).mul(f.mul(0.35));
  return (MAT[k] = m);
}
const BOTTLE = [[0, 0.003], [0.027, 0], [0.032, 0.004], [0.034, 0.012], [0.034, 0.15], [0.032, 0.17], [0.025, 0.19], [0.016, 0.205], [0.0125, 0.215], [0.0125, 0.245], [0.0148, 0.248], [0.0148, 0.257], [0.011, 0.26], [0, 0.26]];
function labelTex() {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#E6D8B8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#7A1E22'; g.fillRect(0, 6, w, 7); g.fillRect(0, h - 13, w, 7);
    g.fillStyle = '#1B1B1B'; g.beginPath(); g.ellipse(64, h / 2, 26, 15, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#E6D8B8'; g.fillRect(48, h / 2 - 2, 32, 4);
    g.fillStyle = 'rgba(30,30,30,0.7)'; for (let i = 0; i < 4; i++) g.fillRect(110, 22 + i * 6, 90 - i * 14, 2);
  });
}
function buildBottle(look) {
  const tint = look === 'green' ? '#1F5A2C' : '#5A2A08', g = new THREE.Group(), o = -0.13;
  const glass = new THREE.Mesh(lathe(BOTTLE, 18).translate(0, o, 0), glassMat(tint));
  const lk = 'liquid-' + look;
  const liq = new THREE.Mesh(lathe([[0, 0.006], [0.031, 0.008], [0.031, 0.11], [0, 0.11]], 14).translate(0, o, 0),
    MAT[lk] || (MAT[lk] = new THREE.MeshStandardMaterial({ color: look === 'green' ? '#3A3410' : '#2E1404', roughness: 0.18 })));
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0346, 0.0346, 0.07, 18, 1, true).translate(0, 0.085 + o, 0),
    MAT.label || (MAT.label = new THREE.MeshStandardMaterial({ map: labelTex(), roughness: 0.75 })));
  glass.renderOrder = 2;
  g.add(liq, label, glass);
  return g;
}
// the bottle's neck, left in the hand when it breaks over a head (it drops)
function buildNeck(look) {
  const tint = look === 'green' ? '#1F5A2C' : '#5A2A08';
  const pts = BOTTLE.slice(5).map(([r, y]) => [r, y]); pts[0] = [0.03, 0.17];
  const geo = lathe(pts, 12).translate(0, -0.215, 0);
  return new THREE.Mesh(geo, glassMat(tint));
}

// ------------------------------------------------------------------ the props and their life
export function createItems(c) {
  const defs = { ...ITEMS }, list = [];
  let cans = null;
  const it = { defs, list };
  it.register = (kind, def) => { defs[kind] = { ...(defs[kind] || {}), ...def }; };
  it.load = async (url = 'assets/props/trash-cans.glb') => {
    try {
      const g = await loadGLB(url);
      const node = (n) => g.scene.getObjectByName(n);
      cans = { bright: { body: node('metal_trash_can'), lid: node('metal_trash_can_lid') }, rust: { body: node('metal_trash_can_rust'), lid: node('metal_trash_can_rust_lid') } };
      // (a fully metallic scan only shows what the street reflects into it: at golden hour a black barrel. Less metal, a
      // little lighter: galvanised steel in any light)
      g.scene.traverse((o) => { if (o.isMesh && o.material && !o.material._lit) { o.material._lit = true; o.material.metalness = 0.35; o.material.color.multiplyScalar(1.3); o.material.aoMapIntensity = 0.35; o.material.needsUpdate = true; } });
    } catch (err) { console.warn('[combat] trash cans', err); }
  };
  function buildCan(look) {
    const g = new THREE.Group(), C = cans && cans[look];
    if (C) {
      const body = C.body.clone(); body.position.set(0, -0.453, 0); g.add(body);
      const lid = C.lid.clone(); lid.position.set(0, 0.453 - 0.035, 0); g.add(lid);
      g.userData = { body, lid };
    } else { // (the scan failed to load: a plain can)
      const m = new THREE.MeshStandardMaterial({ color: '#8A9096', roughness: 0.45, metalness: 0.8, side: THREE.DoubleSide });
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.23, 0.9, 18, 1, true), m));
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 18), m); lid.position.y = 0.46; g.add(lid);
      g.userData = { lid };
    }
    return g;
  }
  const LOOKS = { bat: ['street'], bottle: ['amber', 'amber', 'green'], trashcan: ['bright', 'rust'] };
  let seq = 0;
  // an item: built, not yet anywhere
  it.make = (kind, look) => {
    const def = defs[kind]; if (!def) return null;
    look = look || pick(LOOKS[kind] || ['a']);
    const obj = kind === 'bat' ? buildBat(look) : kind === 'bottle' ? buildBottle(look) : kind === 'trashcan' ? buildCan(look) : def.build ? def.build(THREE) : new THREE.Group();
    obj.name = 'item-' + kind;
    obj.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    const I = { id: ++seq, kind, def, look, obj, hits: def.hits ?? 1, state: 'new', holder: null, vel: new THREE.Vector3(), spin: new THREE.Vector3(), t: 0, hitSet: new Set(), thrower: null, attachT: 9, from: null };
    if (kind === 'trashcan') I.lidOn = !!obj.userData.lid;
    return I;
  };
  function add(I) { if (!list.includes(I)) list.push(I); if (!I.obj.parent) c.scene.add(I.obj); return I; }
  function remove(I) { I.state = 'gone'; c.scene.remove(I.obj); const i = list.indexOf(I); if (i >= 0) list.splice(i, 1); if (I.holder) letGo(I); }
  it.remove = remove;
  const axisY = (I, out = _v) => out.set(0, 1, 0).applyQuaternion(I.obj.quaternion);
  // the body's lowest point (a capsule along +Y, or a disc)
  function lowest(I) {
    const d = I.def, ay = Math.abs(axisY(I).y), y = I.obj.position.y;
    if (d.disc) return y - d.R * Math.sqrt(Math.max(0, 1 - ay * ay)) - d.h * ay;
    return y - ay * Math.max(0, d.half - d.r) - d.r;
  }
  // set down at rest: standing (a can, a bottle) or lying (anything, its yaw)
  function restAt(I, x, z, { upright = true, yaw = rnd(0, Math.PI * 2) } = {}) {
    const gy = c.world.ground(x, z), d = I.def;
    I.obj.quaternion.setFromAxisAngle(UP, yaw);
    if (!upright) I.obj.quaternion.multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), Math.PI / 2));
    I.obj.position.set(x, gy + (upright ? d.half : d.r), z);
    I.state = 'rest'; I.vel.set(0, 0, 0); I.spin.set(0, 0, 0); I.t = 0;
    return I;
  }
  it.place = (kind, x, z, o = {}) => { const I = it.make(kind, o.look); add(I); return restAt(I, x, z, { upright: kind !== 'bat' && !o.lying, yaw: o.yaw }); };

  // ---- in a hand
  // a Suit carries one (holder.weapon)
  it.arm = (holder, kind, look) => { const I = typeof kind === 'string' ? it.make(kind, look || (kind === 'bat' ? 'suit' : null)) : kind; if (!I) return null; give(holder, I); return I; };
  function give(holder, I, blend = 0) {
    add(I); I.state = 'held'; I.holder = holder; I.thrower = null; I.vel.set(0, 0, 0); I.spin.set(0, 0, 0); I.aim = null;
    I.attachT = blend > 0 ? 0 : 9; I.blend = blend; I.from = blend > 0 ? { p: I.obj.position.clone(), q: I.obj.quaternion.clone() } : null;
    if (holder === c.me) c.me.holding = I; else holder.weapon = I;
  }
  it.give = give;
  function letGo(I) { const h = I.holder; I.holder = null; I.aim = null; if (!h) return; if (h === c.me) { if (c.me.holding === I) c.me.holding = null; } else if (h.weapon === I) h.weapon = null; }
  // after the pose: the item in the holder's fist (a two-handed one is placed by its holder's move instead)
  it.holdOn = (holder, I, dt = 0) => {
    if (!I || I.def.hands === 2) return;
    const me = holder === c.me, bones = me ? c.W.dan.bones : holder.bones;
    if (me) c.W.dan.body.updateMatrixWorld(true);
    if (!fist(bones, me ? 'hero' : 'thug', _p, _q)) return;
    if (I.def.flip) _q.multiply(FLIP);
    // (its holder may point it somewhere else for now: a bat let down by his side, w how far)
    if (I.aim && I.aim.w > 0.001) _q.slerp(_q2.setFromUnitVectors(UP, I.aim.dir), I.aim.w);
    // (never through the street: a swing that would drive its end into it scrapes along it instead, turned about the fist)
    const far = (I.def.flip ? -1 : 1) * I.def.half - (I.def.grip || 0);
    _v2.set(0, far, 0).applyQuaternion(_q);
    const floor = c.world.ground(_p.x + _v2.x, _p.z + _v2.z) + I.def.r + 0.01;
    if (_p.y + _v2.y < floor && _p.y > floor) {
      const L = _v2.length(), dy = floor - _p.y; _v3.set(_v2.x, 0, _v2.z); if (_v3.lengthSq() < 1e-8) _v3.set(1, 0, 0);
      _v3.setLength(Math.sqrt(Math.max(0, L * L - dy * dy))).setY(dy);
      _q.premultiply(_q2.setFromUnitVectors(_v2.divideScalar(L), _v3.normalize()));
    }
    _v.set(0, I.def.grip || 0, 0).applyQuaternion(_q);
    _p.sub(_v);
    if (I.from && I.attachT < I.blend) { // just picked up: eased from where it lay into the fist
      I.attachT += dt; const k = clamp(I.attachT / I.blend, 0, 1), e = k * k * (3 - 2 * k);
      I.obj.position.lerpVectors(I.from.p, _p, e); I.obj.quaternion.slerpQuaternions(I.from.q, _q, e);
    } else { I.obj.position.copy(_p); I.obj.quaternion.copy(_q); }
    I.obj.updateMatrixWorld(true);
  };
  // the world segment of what he swings: from the fist to the far end (a and b), or null bare-handed
  it.seg = (I, a, b) => {
    if (!I) return false; const d = I.def, s = d.flip ? -1 : 1;
    I.obj.updateMatrixWorld(true);
    a.set(0, d.grip || 0, 0).applyMatrix4(I.obj.matrixWorld);
    b.set(0, s * d.half, 0).applyMatrix4(I.obj.matrixWorld);
    return true;
  };
  it.tip = (holder, out = new THREE.Vector3()) => { const I = holder.weapon || holder.holding; if (!I) return null; it.seg(I, _v3, out); return out; };
  // lets go of it: it falls (tossed: a velocity), or (remove) gone with him
  it.drop = (holder, remove_ = false, vel = null) => {
    const I = holder === c.me ? c.me.holding : holder.weapon; if (!I) return null;
    letGo(I);
    if (remove_) { remove(I); return null; }
    launch(I, vel || _v.set(rnd(-1, 1), 2.2, rnd(-1, 1)), _v2.set(rnd(-8, 8), rnd(-3, 3), rnd(-8, 8)), null);
    return I;
  };
  // thrown (or let fall): a tumble through the air; thrower: who it is dangerous to (null: nobody)
  function launch(I, vel, spin, thrower) {
    add(I); I.state = 'fly'; I.t = 0; I.vel.copy(vel); I.spin.copy(spin); I.thrower = thrower; I.hitSet.clear(); I.holder = null; I.bounces = 0;
    return I;
  }
  it.launch = launch;

  // ---- breaking
  // a piece of something broken: it falls and lies about a while (not a weapon)
  function piece(obj, half, r, vel, spin) {
    const I = { id: ++seq, kind: 'piece', def: { ...defs.piece, half, r }, look: '', obj, hits: 0, state: 'new', holder: null, vel: new THREE.Vector3(), spin: new THREE.Vector3(), t: 0, hitSet: new Set(), thrower: null };
    return launch(I, vel, spin, null);
  }
  // the bat snaps at its taper: the barrel flies on the way the blow went, the handle drops out of the fist
  it.breakBat = (I, dir) => {
    const U = I.obj.userData; if (!U.barrel) { remove(I); return; }
    I.obj.updateMatrixWorld(true);
    const mk = (mesh, cy) => { // a piece of its own, about its own centre
      const g = new THREE.Group();
      g.position.copy(I.obj.localToWorld(new THREE.Vector3(0, cy, 0))); g.quaternion.copy(I.obj.quaternion); g.add(mesh); mesh.position.set(0, -cy, 0); c.scene.add(g); return g;
    };
    for (const k of U.crowns) k.visible = true;
    const pb = mk(U.barrel, 0.24), ph = mk(U.handle, -0.2); ph.add(U.tape); U.tape.position.set(0, 0.2, 0);
    const at = pb.position.clone();
    piece(pb, 0.19, 0.031, _v.copy(dir).multiplyScalar(rnd(4, 6)).setY(rnd(2.5, 4)), _v2.set(rnd(-25, 25), rnd(-6, 6), rnd(-25, 25)));
    piece(ph, 0.23, 0.016, _v.set(rnd(-0.6, 0.6), 0.8, rnd(-0.6, 0.6)), _v2.set(rnd(-6, 6), rnd(-2, 2), rnd(-6, 6)));
    letGo(I); I.state = 'gone'; const i = list.indexOf(I); if (i >= 0) list.splice(i, 1); c.scene.remove(I.obj);
    c.fx.splinters(at, dir); c.sfx('crack');
  };
  // glass everywhere: shards, a splash, a tinkle; held, its neck drops out of the hand
  it.shatter = (I, dir = _v3.set(0, 0, 0), { neck = false } = {}) => {
    I.obj.updateMatrixWorld(true);
    const at = I.obj.getWorldPosition(new THREE.Vector3());
    c.fx.glass(at, dir, I.look === 'green' ? [0.35, 0.9, 0.45] : [1.1, 0.62, 0.25]);
    c.sfx('glass', 1);
    if (neck) {
      const g = new THREE.Group(); g.position.copy(I.obj.localToWorld(new THREE.Vector3(0, -0.085, 0))); g.quaternion.copy(I.obj.quaternion); g.add(buildNeck(I.look)); c.scene.add(g);
      piece(g, 0.04, 0.015, _v.set(rnd(-0.5, 0.5), 0.5, rnd(-0.5, 0.5)), _v2.set(rnd(-8, 8), 0, rnd(-8, 8)));
    }
    remove(I);
  };
  // the lid off a can: a body of its own now, flung up and away
  function popLid(I, vel) {
    if (!I.lidOn) return; I.lidOn = false;
    const lid = I.obj.userData.lid; I.obj.updateMatrixWorld(true);
    const g = new THREE.Group(); lid.getWorldPosition(g.position); g.quaternion.copy(I.obj.quaternion);
    // (about its own middle: the scan's lid stands on its rim at its origin)
    g.position.addScaledVector(axisY(I, _v2), 0.05); lid.position.set(0, -0.05, 0); g.add(lid); c.scene.add(g);
    const L = { id: ++seq, kind: 'lid', def: defs.lid, look: I.look, obj: g, hits: 0, state: 'new', holder: null, vel: new THREE.Vector3(), spin: new THREE.Vector3(), t: 0, hitSet: new Set(), thrower: null };
    launch(L, vel, _v2.set(rnd(-14, 14), rnd(-4, 4), rnd(-14, 14)), null);
    c.sfx('clang', 0.5);
    return L;
  }
  it.popLid = popLid;

  // ---- the physics
  // a knock against the street or a wall: sound and dust by how hard; a bottle breaks, a can loses its lid
  function impact(I, sp, where) {
    if (sp < 0.6) return;
    I.bounces = (I.bounces || 0) + 1;
    if (I.kind === 'bottle' && sp > 2.4) { it.shatter(I, _v3.copy(I.vel).setY(0).normalize()); return; }
    const k = clamp(sp / 9, 0, 1.2);
    if (I.kind === 'trashcan') { c.sfx('clang', k); if (sp > 3) c.fx.dust(_p.copy(I.obj.position).setY(c.world.ground(I.obj.position.x, I.obj.position.z)), { amount: 0.5 + k * 0.6 }); if (sp > 3.2 && I.lidOn) popLid(I, _v.copy(I.vel).multiplyScalar(0.6).setY(3 + sp * 0.3)); }
    else if (I.kind === 'lid') c.sfx('lid', k);
    else if (I.kind === 'bat' || (I.kind === 'piece' && I.def.r > 0.02)) c.sfx('wood', k);
    else c.sfx('tink', k);
  }
  // done tumbling: stood up (a can or a bottle that came down on its base), or lying (rolling, if round)
  function settle(I) {
    const d = I.def, ax = axisY(I, _v2), gy = c.world.ground(I.obj.position.x, I.obj.position.z);
    if (d.disc) { // a lid: flat, then the wobble of a coin
      const up = ax.y >= 0 ? 1 : -1;
      I.state = 'wobble'; I.th = clamp(Math.acos(Math.min(1, Math.abs(ax.y))), 0.06, 0.32); I.ph = Math.atan2(ax.z, ax.x); I.flipS = up; I.yaw0 = rnd(0, 6.28); I.lastTick = 0;
      return;
    }
    if (Math.abs(ax.y) > 0.82 && I.kind !== 'bat' && I.kind !== 'piece') {
      I.obj.quaternion.premultiply(_q.setFromUnitVectors(ax.clone().normalize(), _v3.set(0, Math.sign(ax.y) || 1, 0)));
      I.obj.position.y = gy + d.half; I.vel.set(0, 0, 0); I.spin.set(0, 0, 0); I.state = 'rest'; I.t = 0; return;
    }
    // lying: its axis laid flat (the least turn that does it), rolling the way it was going across its axis
    const hz = _v3.set(ax.x, 0, ax.z); if (hz.lengthSq() < 1e-4) hz.set(Math.random() - 0.5, 0, Math.random() - 0.5); hz.normalize();
    I.obj.quaternion.premultiply(_q.setFromUnitVectors(ax.clone().normalize(), hz));
    I.obj.position.y = gy + d.r; I.vel.y = 0; I.spin.set(0, 0, 0);
    I.state = 'roll'; I.t = 0;
  }
  // in the air
  function fly(I, dt) {
    const d = I.def, p = I.obj.position, v = I.vel;
    v.y -= G * dt; p.addScaledVector(v, dt); I.t += dt;
    const w = I.spin.length(); if (w > 1e-4) I.obj.quaternion.premultiply(_q.setFromAxisAngle(_v.copy(I.spin).divideScalar(w), w * dt));
    wall(I, Math.min(0.3, d.r + 0.02), 0.45);
    if (I.state !== 'fly') return;
    const gy = c.world.ground(p.x, p.z), low = lowest(I);
    if (low < gy) {
      p.y += gy - low;
      if (v.y < 0) {
        const hit = -v.y;
        v.y = hit * d.e; v.x *= 0.7; v.z *= 0.7; I.spin.multiplyScalar(0.5);
        impact(I, hit + Math.hypot(v.x, v.z) * 0.15, 'ground');
        if (I.state !== 'fly') return;
        if (hit < 2.2) settle(I);
      } else if (I.t > 3) settle(I);
    }
    if (I.state === 'fly' && I.thrower) bodies(I);
  }
  // a wall in the way: it bounces off; true when it touched one
  function wall(I, r, e) {
    const p = I.obj.position; _p.copy(p); c.world.collide(_p, r);
    const nx = _p.x - p.x, nz = _p.z - p.z, nl = Math.hypot(nx, nz); if (nl < 1e-4) return false;
    const n = _v.set(nx / nl, 0, nz / nl), vn = I.vel.dot(n);
    p.x = _p.x; p.z = _p.z;
    if (vn < 0) { I.vel.addScaledVector(n, -(1 + e) * vn); I.vel.x *= 0.8; I.vel.z *= 0.8; impact(I, -vn, 'wall'); }
    return true;
  }
  // on its side on the street
  function roll(I, dt) {
    const d = I.def, p = I.obj.position, v = I.vel, ax = axisY(I, _v2).setY(0).normalize();
    const n = _v3.set(ax.z, 0, -ax.x);
    let vp = v.dot(n), va = v.dot(ax);
    va *= Math.exp(-7 * dt);
    const round = I.kind === 'trashcan' || I.kind === 'bottle';
    vp -= Math.sign(vp) * Math.min(Math.abs(vp), ((round ? 0.7 : 4) + (round ? 0.35 : 2) * Math.abs(vp)) * dt);
    // a can is wider at its top: it rolls round in a curve
    if (I.kind === 'trashcan' && Math.abs(vp) > 0.05) { const turn = _q.setFromAxisAngle(UP, vp * 0.22 * dt); I.obj.quaternion.premultiply(turn); ax.applyQuaternion(turn); n.applyQuaternion(turn); }
    v.copy(n).multiplyScalar(vp).addScaledVector(ax, va); v.y = 0;
    p.addScaledVector(v, dt);
    if (round) I.obj.quaternion.premultiply(_q.setFromAxisAngle(ax, -vp / d.r * dt));
    if (wall(I, Math.min(0.3, d.r + 0.02), 0.35)) { /* turned back off the wall */ }
    p.y = c.world.ground(p.x, p.z) + d.r;
    I.t += dt;
    if (I.thrower && Math.abs(vp) > 2.5) bodies(I);
    if (I.kind === 'trashcan' && Math.abs(vp) > 0.8) { I.rumble = (I.rumble || 0) - dt; if (I.rumble <= 0) { I.rumble = 0.11 + 0.25 / (1 + Math.abs(vp)); c.sfx('rumble', clamp(Math.abs(vp) / 6, 0.1, 1)); } }
    if (Math.abs(vp) < 0.05 && Math.abs(va) < 0.05) { I.state = 'rest'; I.t = 0; v.set(0, 0, 0); I.thrower = null; }
  }
  // a lid's last wobble: it rings faster and faster as it lies down
  function wobble(I, dt) {
    const d = I.def, p = I.obj.position;
    I.th *= Math.exp(-1.5 * dt); const rate = clamp(2.4 / Math.sqrt(Math.max(I.th, 0.003)), 0, 70);
    const ph0 = I.ph; I.ph += rate * dt;
    if (Math.floor(I.ph / Math.PI) !== Math.floor(ph0 / Math.PI)) c.sfx('lid', clamp(I.th * 2.2, 0.04, 0.5));
    const tilt = _v.set(Math.sin(I.th) * Math.cos(I.ph), Math.cos(I.th), Math.sin(I.th) * Math.sin(I.ph)).multiplyScalar(I.flipS);
    I.obj.quaternion.setFromUnitVectors(UP, tilt).multiply(_q.setFromAxisAngle(UP, I.yaw0));
    p.y = c.world.ground(p.x, p.z) + d.R * Math.sin(I.th) + d.h * Math.cos(I.th);
    if (I.th < 0.01) { I.state = 'rest'; I.t = 0; c.sfx('lid', 0.12); }
  }
  // what it meets in the air: men (thrown by Dan) or Dan (thrown by a Suit)
  function bodies(I) {
    const p = I.obj.position, sp = I.vel.length(); if (sp < 2.5) return;
    if (I.thrower === c.me) {
      for (const e of c.enemies) {
        if (!e.alive || I.hitSet.has(e) || !e.standing) continue;
        if (bodyDist(p, e.pos, e.scale) > I.def.r + 0.3 * e.scale) continue;
        I.hitSet.add(e);
        const dir = _v.copy(I.vel).setY(0).normalize().clone();
        c.itemHit(e, I, sp, dir);
        if (I.state === 'gone') return;
        // on through him, slowed, glancing off his body, rising
        const off = _v2.set(p.x - e.pos.x, 0, p.z - e.pos.z).normalize();
        I.vel.multiplyScalar(I.kind === 'trashcan' ? 0.68 : 0.5).addScaledVector(off, 0.8); I.vel.y = Math.max(I.vel.y * 0.5, 1.1);
        I.spin.set(rnd(-10, 10), rnd(-4, 4), rnd(-10, 10));
        if (I.state === 'roll') I.state = 'fly';
      }
    } else if (I.thrower && c.live()) {
      const P = c.W.person.position;
      if (bodyDist(p, P, 1) < I.def.r + 0.3) { I.hitSet.add(c.me); c.itemHitsHero(I); }
    }
  }
  function bodyDist(p, foot, sc) {
    const y0 = foot.y + 0.35 * sc, y1 = foot.y + 1.62 * sc, y = clamp(p.y, y0, y1);
    return Math.hypot(p.x - foot.x, p.y - y, p.z - foot.z);
  }
  it.update = (dt) => {
    const P = c.W.person.position, H = c.me.holding;
    if (dt > 0) shove();
    if (H) {
      // into the car: what he held is left lying where he stood; a cutscene: out of sight till it is over
      if (c.W.person.inVehicle || c.cm.activeMode !== 'person') { letGo(H); restAt(H, P.x + rnd(-0.3, 0.3), P.z + rnd(-0.3, 0.3), { upright: H.kind === 'trashcan' }); }
      else { H.obj.visible = !(c.W.cutscene || c.W.directed); if (H.obj.visible) it.holdOn(c.me, H, dt); }
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const I = list[i]; if (!I) continue;
      if (I.state === 'fly') { const n = I.vel.length() * dt > 0.25 ? 2 : 1; for (let k = 0; k < n && I.state === 'fly'; k++) fly(I, dt / n); }
      else if (I.state === 'roll') roll(I, dt);
      else if (I.state === 'wobble') wobble(I, dt);
      else if (I.state === 'rest') { I.t += dt; if (I.def.junk && I.t > 25 || I.t > 60 && hdist(I.obj.position, P) > 400) remove(I); } // (pieces go; props once he is long gone)
    }
  };
  // men and Dan walking into what lies about: a can is shoved aside, a standing bottle knocked over, the rest nudged
  const _bodies = [];
  function shove() {
    _bodies.length = 0;
    const P = c.W.person;
    if (c.cm.activeMode === 'person' && !P.inVehicle) _bodies.push(P.position);
    for (const e of c.enemies) if (e.standing) _bodies.push(e.pos);
    for (const I of list) {
      if (I.holder || I.claim || (I.state !== 'rest' && I.state !== 'roll')) continue;
      const o = I.obj.position;
      for (const b of _bodies) {
        const dx = o.x - b.x, dz = o.z - b.z, d = Math.hypot(dx, dz), m = Math.min(I.def.r, 0.3) + 0.3;
        if (d >= m || Math.abs(o.y - b.y) > 1.2) continue;
        const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
        if (I.kind === 'bottle' && I.state === 'rest' && Math.abs(axisY(I).y) > 0.8) { launch(I, _v.set(nx * 1.6, 1.2, nz * 1.6), _v2.set(nz * 9, 0, -nx * 9), null); c.sfx('tink', 0.3); break; }
        // (out of his way, and off to one side: walked into head on, it slides off rather than being plowed along)
        const sd = I.slip || (I.slip = Math.random() < 0.5 ? -1 : 1), k = m - d;
        o.x += (nx - nz * sd * 0.6) * k; o.z += (nz + nx * sd * 0.6) * k;
        if (I.kind === 'trashcan' && I.state === 'rest' && !I.scraped) { I.scraped = true; c.sfx('clang', 0.12); }
      }
      if (I.scraped && I.state === 'rest' && !_bodies.some((b) => hdist(o, b) < Math.min(I.def.r, 0.3) + 0.4)) I.scraped = false;
    }
  }
  it.clear = () => { for (const I of list.slice()) { if (I.holder) letGo(I); remove(I); } };

  // ---- picking up
  // the item he would pick up: resting (or nearly), near, ahead of him counting more
  it.nearest = (pos, maxD = 1.6, yaw = null) => {
    let best = null, bs = Infinity;
    for (const I of list) {
      if (!PICKABLE.has(I.kind) || I.holder || !(I.state === 'rest' || (I.state === 'roll' && I.vel.lengthSq() < 0.5))) continue;
      const d = hdist(pos, I.obj.position); if (d > maxD) continue;
      if (Math.abs(I.obj.position.y - pos.y) > 1.4) continue;
      let sc = d; if (yaw != null) sc += Math.abs(Math.atan2(Math.sin(yawTo(pos, I.obj.position) - yaw), Math.cos(yawTo(pos, I.obj.position) - yaw))) * 0.35;
      if (sc < bs) { bs = sc; best = I; }
    }
    return best;
  };
  // a weapon a Suit could go and get: a bat or a bottle lying near him that nobody holds or is going for
  it.forSuit = (pos, maxD = 6) => {
    let best = null, bd = maxD;
    for (const I of list) {
      if ((I.kind !== 'bat' && I.kind !== 'bottle') || I.holder || I.claim || I.state !== 'rest') continue;
      const d = hdist(pos, I.obj.position); if (d < bd && Math.abs(I.obj.position.y - pos.y) < 0.8) { bd = d; best = I; }
    }
    return best;
  };
  // where a hand takes it: a bat by its handle, a bottle by its neck (world)
  it.handle = (I, out = new THREE.Vector3()) => out.set(0, I.def.grip || 0, 0).applyQuaternion(I.obj.quaternion).add(I.obj.position);

  // ---- laying out a street: cans by the curb or a wall, bottles in twos and threes by a wall, a bat lying about
  it.scatter = (x, z, { cans = 2, bottles = 3, bats = 0, r0 = 2.5, r1 = 9, avoid = [] } = {}) => {
    const cm = c.cm, out = [], taken = avoid.map((p) => ({ x: p.x, z: p.z, r: 1.2 }));
    const clearAt = (px, pz, r) => { const gy = c.world.ground(px, pz); if (c.solid(px, gy + 0.4, pz)) return false; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; if (c.solid(px + Math.cos(a) * r, gy + 0.4, pz + Math.sin(a) * r)) return false; } return true; };
    const nearSolid = (px, pz, d) => { const gy = c.world.ground(px, pz); for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; if (c.solid(px + Math.cos(a) * d, gy + 0.4, pz + Math.sin(a) * d)) return a; } return null; };
    const nearRoad = (px, pz, d) => { for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, qx = px + Math.cos(a) * d, qz = pz + Math.sin(a) * d; if (!cm.isPointOnSidewalk(qx, qz) && !c.solid(qx, 0.4, qz)) return a; } return null; };
    const spot = (r, score) => {
      let best = null, bs = -Infinity;
      for (let k = 0; k < 90; k++) {
        const a = rnd(0, Math.PI * 2), d = rnd(r0, r1), px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
        if (!cm.isPointOnSidewalk(px, pz) || !clearAt(px, pz, r + 0.05)) continue;
        if (taken.some((t) => Math.hypot(t.x - px, t.z - pz) < t.r + r)) continue;
        const s = score(px, pz) - d * 0.05 + Math.random() * 0.3;
        if (s > bs) { bs = s; best = { x: px, z: pz }; }
      }
      if (!best) for (let k = 0; k < 40 && !best; k++) { // off the sidewalk (a plaza, a park): anywhere clear
        const a = rnd(0, Math.PI * 2), d = rnd(r0, r1), px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
        if (clearAt(px, pz, r + 0.05) && !taken.some((t) => Math.hypot(t.x - px, t.z - pz) < t.r + r)) best = { x: px, z: pz };
      }
      return best;
    };
    for (let i = 0; i < cans; i++) {
      const s = spot(0.36, (px, pz) => (nearRoad(px, pz, 0.75) != null ? 1.2 : 0) + (nearSolid(px, pz, 0.7) != null ? 1 : 0)); if (!s) continue;
      taken.push({ x: s.x, z: s.z, r: 0.5 }); out.push(it.place('trashcan', s.x, s.z));
    }
    let left = bottles;
    while (left > 0) {
      const s = spot(0.1, (px, pz) => (nearSolid(px, pz, 0.45) != null ? 1.5 : 0) + (out.some((o) => o.kind === 'trashcan' && hdist(o.obj.position, { x: px, z: pz }) < 1.2) ? 0.6 : 0)); if (!s) break;
      const n = Math.min(left, 1 + Math.floor(Math.random() * 3)); left -= n;
      for (let k = 0; k < n; k++) { const a = rnd(0, 6.28), px = s.x + Math.cos(a) * (k ? rnd(0.12, 0.3) : 0), pz = s.z + Math.sin(a) * (k ? rnd(0.12, 0.3) : 0); out.push(it.place('bottle', px, pz, Math.random() < 0.2 ? { lying: true } : {})); }
      taken.push({ x: s.x, z: s.z, r: 0.5 });
    }
    for (let i = 0; i < bats; i++) { const s = spot(0.45, () => 0); if (!s) continue; taken.push({ x: s.x, z: s.z, r: 0.6 }); out.push(it.place('bat', s.x, s.z)); }
    return out;
  };
  return it;
}
