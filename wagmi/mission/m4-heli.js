// Mog City: Mission 4's helicopter as a story vehicle (docs/MISSIONS.md, Mission 4 · Shredder). It is the city's own
// (js/controllers.js: its model ported from Slop New York, its flight, its chase camera; js/helicopter.js: its paint,
// no lettering), made Mr. Big's for the mission and given back after:
//   const H = storyHeli(W)
//   H.take()                     Mr. Big's for the mission: its label, the story's flight (controllers.js h.story: a
//                                floor that follows the ground under its skids, the ceiling, a landed state), the
//                                sandbox's idle one gone from the Midtown sky (it is the same machine)
//   H.park(x, z, h, rotor)       set down there, its rotors at rotor (0 still .. 1 full)
//   H.board()                    Dan in at the controls (the helicopter's mode; his body put away)
//   H.out(side)                  Dan out beside it on foot (the side clear of walls: his left, else his right)
//   H.give()                     back to the city as it was (where it hovered, its label, the sandbox's flight)
//   H.rotorTo(k, secs)           its rotors eased to k over secs (the spin-up at the take-off, the wind-down landed)
//   H.landed / H.agl             on its skids / its height over the ground under it
//   H.prompt(fn)                 the F prompt (wagmi/game.js WAGMI.heliPrompt) and its key: fn() -> [words, onF] | null
//   H.step(dt)                   each frame (the mission's hook): the rotors, the rotor sound (wagmi/audio loops 'heli')
// Its rotor's blur, while it is the story's: a smoky disc of its own, clear at the hub, faint streaks, the blades' gold
// tips a thin ring at its edge, as thin as the rotors are slow (the owner's review, 14 Nov: the city's flat pale disc
// read as a solid plate at dusk); the city's own put back with it.
// Its F is taken ahead of the game's own (a capture listener): while the prompt is up, F is the helicopter's.
import * as THREE from 'three/webgpu';
import { uniform, normalWorld } from 'three/tsl';
import { S as story } from '../story/index.js';

// the story's rotor blur: a radial texture on the disc's caps (a cylinder's caps map the circle onto the square)
let blurMat = null;
function rotorBlur() {
  if (blurMat) return blurMat;
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), m = N / 2;
  const img = x.createImageData(N, N), D = img.data;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const dx = (i + 0.5 - m) / m, dy = (j + 0.5 - m) / m, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx), k = (j * N + i) * 4;
    if (r > 1) { D[k + 3] = 0; continue; }
    // (clear at the hub, a soft body out along the blades, faint streaks round it, the tips' ring at the edge)
    const body = Math.min(1, Math.max(0, (r - 0.16) / 0.25)) * (0.55 + 0.45 * r) * (1 - Math.max(0, (r - 0.9) / 0.1) * 0.5);
    const streak = 0.75 + 0.25 * Math.sin(a * 4 + r * 9) * Math.sin(r * 38);
    const tip = Math.max(0, 1 - Math.abs(r - 0.955) / 0.03);
    // (the look review's round 4, 15 Nov: the tips' ring read as an opaque gold halo from below at night; now only a
    // faint grey edge, a little denser than the body, and the body fading out to the rim so no hard circle is drawn)
    const rim = 1 - Math.max(0, (r - 0.86) / 0.14);
    D[k] = 120 + 30 * tip; D[k + 1] = 126 + 28 * tip; D[k + 2] = 136 + 24 * tip;
    D[k + 3] = Math.round(255 * Math.min(1, body * streak * 0.24 * rim + tip * 0.06));
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (blurMat = new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(0.34, 0.37, 0.42), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
}

export function storyHeli(W) {
  if (W._m4heli) return W._m4heli;
  const app = W.app, cm = app.controllerManager, h = cm.entities.helicopter, P = W.person;
  let saved = null, rotor = 1, rotorTo = 1, rotorRate = 0, sound = null, promptFn = null;
  // (the city's blur disc on the main rotor, and its material: put back by give)
  const disc = h.mainRotorPivot?.children.find((o) => o.isMesh && o.geometry?.type === 'CylinderGeometry') || null, disc0 = disc?.material;
  const gy = (x, z) => cm.getGroundHeight(x, z, 'person');
  // (its white paint a shade down for the night, while it is the story's: the look review's round 5, 15 Nov, the top of
  // its fuselage blown out a lavender white under the night sky's light at the landing. Round 6: a shade was too little
  // to see in any frame; a fifth of its white in linear light (a mid grey on screen) and a satin finish, a gunmetal that holds from shot to shot)
  // (round 7's review: a near-black silhouette against the night river and over the plaza. A third of its white now, a
  // lighter gunmetal that keeps its shape at night, the satin finish still holding its top down)
  // (round 8's review: from under it at the take-off still a black cut-out against the sky; the city's lamps do not
  // reach its paint. Its landing light as a glow on what faces down, the belly and the skids, up to `belly` of its
  // paint's colour: H.belly(k), 0 off)
  let paint = null;
  const belly = uniform(0);
  const night = (on) => {
    if (on && !paint) {
      paint = [];
      h.mesh.traverse((o) => {
        const m = o.isMesh && o.material; if (!m?.isNodeMaterial || !m.colorNode || m.isMeshBasicNodeMaterial || paint.some((q) => q[0] === m)) return;
        paint.push([m, m.colorNode, m.roughnessNode, m.emissiveNode]); m.colorNode = m.colorNode.mul(0.36); if (m.roughnessNode) m.roughnessNode = m.roughnessNode.max(0.58);
        m.emissiveNode = m.colorNode.mul(normalWorld.y.negate().max(0).mul(belly)); m.needsUpdate = true;
      });
    } else if (!on && paint) { for (const [m, c, r, e] of paint) { m.colorNode = c; m.roughnessNode = r; m.emissiveNode = e ?? null; m.needsUpdate = true; } paint = null; belly.value = 0; }
  };
  const settle = () => { h.speed = 0; h.verticalSpeed = 0; h.pitchAngle = h.rollAngle = 0; h.tiltPivot.rotation.set(0, 0, 0); h.tiltPivot.position.y = 0; h.mesh.position.copy(h.position); h.mesh.rotation.y = h.heading; };
  // the F key: the prompt's, ahead of the game's (a town car would be taken, or nothing done in the air)
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyF' || e.repeat || W.cutscene || W.directed || W.paused) return;
    const p = promptFn?.(); if (!p || !p[1]) return;
    e.stopImmediatePropagation(); e.preventDefault();
    try { p[1](); } catch (err) { console.warn('[m4] heli F', err); }
  }, true);
  W.heliPrompt = () => { if (W.cutscene || W.directed) return ''; const p = promptFn?.(); return p ? p[0] : ''; };
  const H = {
    entity: h,
    belly(k) { belly.value = k; },
    get landed() { return !!h.landed || h.position.y <= gy(h.position.x, h.position.z) + 0.05; },
    get agl() { return h.position.y - gy(h.position.x, h.position.z); },
    get rotor() { return rotor; },
    take() {
      if (!saved) saved = { pos: h.position.clone(), heading: h.heading, label: h.label };
      if (disc) disc.material = rotorBlur();
      night(true);
      h.label = story.t("Mr. Big's helicopter");
      h.story = true; h.ceil = 190;
    },
    park(x, z, heading, k = 0) {
      H.take();
      h.position.set(x, gy(x, z), z); h.heading = heading; settle(); h.landed = true;
      rotor = rotorTo = k; h.rotor = k;
    },
    board() {
      H.take();
      P.inVehicle = true; P.mesh.visible = false; P.speed = 0;
      cm.resetInput?.();
      app.selectMode('helicopter');
    },
    out(side = 1) {
      const s = Math.sin(h.heading), c = Math.cos(h.heading);
      // (beside the cabin's door, 2.4 m out: on whichever side has ground he can stand on)
      const spot = (k) => ({ x: h.position.x + c * 2.4 * k + s * 0.6, z: h.position.z - s * 2.4 * k + c * 0.6 });
      let p = spot(side); const blocked = (q) => cm.nearColliders(q.x, q.z, 1).some((cc) => !cc.carOnly && cc.maxY > gy(q.x, q.z) + 0.6 && q.x > cc.minX - 0.5 && q.x < cc.maxX + 0.5 && q.z > cc.minZ - 0.5 && q.z < cc.maxZ + 0.5);
      if (blocked(p)) p = spot(-side);
      P.position.set(p.x, gy(p.x, p.z), p.z); P.heading = h.heading; P.speed = 0; P.verticalVel = 0;
      P.inVehicle = false; P.mesh.visible = true; P.mesh.position.copy(P.position); P.mesh.rotation.y = P.heading;
      cm.resetInput?.();
      app.selectMode('person');
      return p;
    },
    give() {
      promptFn = null;
      H.quiet();
      if (!saved) return;
      if (cm.activeMode === 'helicopter') H.out();
      h.story = false; h.ceil = 0; h.landed = false; h.rotor = 1; rotor = rotorTo = 1;
      h.position.copy(saved.pos); h.heading = saved.heading; h.label = saved.label; settle();
      if (disc && disc0) disc.material = disc0;
      night(false);
      saved = null;
    },
    rotorTo(k, secs = 2) { rotorTo = k; rotorRate = Math.abs(k - rotor) / Math.max(0.05, secs); },
    prompt(fn) { promptFn = fn || null; },
    quiet() { sound?.stop?.(0.6); sound = null; },
    step(dt) {
      if (!saved) return;
      if (rotor !== rotorTo) { const d = rotorTo - rotor, m = rotorRate * dt; rotor = Math.abs(d) <= m ? rotorTo : rotor + Math.sign(d) * m; }
      h.rotor = rotor;
      // (the blur as thick as the rotors are fast: none at rest, where the blades show)
      // (the look review's round 9: seen from near its own plane, in the chase camera's level look over the river, the
      // disc was a flat grey ellipse over the far shore. It fades as the view flattens: full from 36 degrees over or
      // under it, gone by 8)
      if (blurMat) {
        const cam = app.cameraSystem?.camera; let edge = 1;
        if (cam) { const dx = h.position.x - cam.position.x, dy = h.position.y + 2.6 - cam.position.y, dz = h.position.z - cam.position.z; edge = Math.max(0, Math.min(1, (Math.abs(dy) / (Math.hypot(dx, dy, dz) || 1) - 0.14) / 0.44)); }
        blurMat.opacity = Math.max(0, Math.min(1, (rotor - 0.25) / 0.6)) * edge;
      }
      // (its sound, placed on it: up with the rotors)
      const vol = 0.55 * rotor * rotor;
      if (vol > 0.01 && !sound && W.audio?.loop) sound = W.audio.loop('heli', { pos: [h.position.x, h.position.y + 2, h.position.z], vol: 0, ref: 18 });
      if (sound) { sound.set({ pos: [h.position.x, h.position.y + 2, h.position.z], vol }); if (vol <= 0.01) H.quiet(); }
    },
  };
  return (W._m4heli = H);
}
