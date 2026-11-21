// Mog City story runner: the stage set room (rooms.js ROOMS.stage), an arena's keynote stage seen from its floor, lit the
// way a keynote is lit: a presenter's key from the front-of-house truss and a cool rim from upstage, a wall of LED the
// width of the stage behind him that glows (its light on the deck and on the front rows' faces), haze in the beams of
// the truss's cans, and the house: a standing pit packed to the barrier (the city's own people, PersonCrowd: faces,
// clothes, hair) lit by the stage's spill, the seats rising behind it, phones up everywhere. The set's `house` says
// how the house is: 'calm' (the default: standing, watching, swaying, a phone up here and there) or 'up' (on its feet
// and cheering: arms up, bouncing, the phones up). The cheering is made here, by hand, per person (cheer(): both arms up
// waving, clapping at the chest or over the head, a fist pumped, a phone held up to film, one hand waving; each person
// their own beat and their own changes of mind), no captured motion: the free and open-source rule, 19 Nov (the rally
// crowd's Bandai takes are CC BY-NC, kept to Mog City's own missions 3 and 4). On WebGL2, where the city's people
// cannot be drawn, the pit is people of the house's own kind (crowd.js), the same cheer. The seats are the house's
// (crowd-plan.js plans it, crowd.js draws it in a fixed number of draw calls: faces, hair, clothes, arms and hands, phones
// and their lights, the rows darkening toward the back) and, behind the fascia and its ribbon of light, the far tier,
// impostors from one shared atlas. Nothing in it is a real place, brand or person; the wall carries the set's own sign
// (def.sign, else LIVE).
// Layout (rooms.js's): the stage at -z (the LED wall at z -9, the deck to its lip at z 0.6, people on it about z -2
// facing 0), the barrier at z 2.4, the pit from z 3.3 to 9, the seats from z 10 up and back to 18, the fascia at 19.3
// and the far tier from 19.8 up to 10 m and back to the wall at 27; the front row's one
// reserved seat, an executive chair in mahogany and oxblood leather, at [-1, 3.5] facing the stage (marks.chair).
// The people of the set (def.people, their walks) keep a clear metre round them: the pit is never in anyone's way.
import * as THREE from 'three/webgpu';
import { SURF, lettering } from './setkit.js';
import { uv, float, abs, pow, dot, normalView, positionViewDirection, uniform } from 'three/tsl';
import { cheer, cheerer, planHouse } from './crowd-plan.js';
import { crowd } from './crowd.js';

const PI = Math.PI;
const ZS = -9; // the LED wall's plane
export const CHAIR = [-1, 3.5];

// the pit's people and their motion, made once and shared by every stage set (a set at a time is drawn): each set's
// tick re-homes the crowd's meshes into its own group and says who of them stands (set.skip: those in its people's way)
let PIT = null;
// (the cheer, by hand, is crowd-plan.js's: cheer(), cheerer(); the same for the pit's rigs, the seats and the far tier)
function pitOf() {
  if (PIT) return PIT;
  const N = window.NYC;
  if (!N?.PersonCrowd || !N?.PersonRig || N.quality?.backend === 'webgl2') return (PIT = { none: true });
  // (the pit's places: eight rows of 27 along the barrier, a little jitter)
  let s = 913; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const people = [];
  for (let j = 0; j < 8; j++) for (let i = 0; i < 27; i++) {
    const female = rnd() < 0.46, x = -10.2 + i * 0.78 + (rnd() - 0.5) * 0.36 + (j % 2) * 0.3, z = 3.35 + j * 0.74 + (rnd() - 0.5) * 0.22;
    people.push({ x, z, h: PI + (rnd() - 0.5) * 0.5 + (x * -0.02), ...cheerer(rnd, people.length), sway: 0.6 + rnd() * 0.8,
      rig: new N.PersonRig({ seed: 600 + i * 7.1 + j * 31.7, female, scale: female ? 0.9 + rnd() * 0.07 : 0.95 + rnd() * 0.09, girth: 0.86 + rnd() * 0.3, hair: female ? 0.5 + rnd() * 0.5 : rnd() * 0.35 }) });
  }
  const C = new N.PersonCrowd(people.length, { farDistance: 30, name: 'StageHouse', farShadow: false });
  for (const m of C.meshes) { m.userData.keep = true; m.castShadow = false; }
  return (PIT = { C, people, ground: () => 0 });
}

// a canvas the LED wall shows: the keynote's opening look, a sunrise of lime and teal behind the set's words, the
// panels' seams faint over it
function wallCanvas(sign) {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 776; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 776); g.addColorStop(0, '#02060A'); g.addColorStop(0.55, '#06261C'); g.addColorStop(1, '#0B3A22'); x.fillStyle = g; x.fillRect(0, 0, 2048, 776);
  const sun = x.createRadialGradient(1024, 900, 40, 1024, 900, 1150); sun.addColorStop(0, 'rgba(190,255,120,0.95)'); sun.addColorStop(0.28, 'rgba(118,185,0,0.55)'); sun.addColorStop(0.6, 'rgba(20,120,110,0.22)'); sun.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = sun; x.fillRect(0, 0, 2048, 776);
  // (light streaks across, a keynote's motion graphic held on a frame)
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) { const y = 140 + i * 42, a = 0.05 + (i % 3) * 0.03; const lg = x.createLinearGradient(0, 0, 2048, 0); lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(0.5, `rgba(160,255,200,${a})`); lg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = lg; x.fillRect(0, y, 2048, 3); }
  x.globalCompositeOperation = 'source-over';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '800 250px Arial, Helvetica, sans-serif';
  // (a long sign fits the wall: smaller, down to a third of the size)
  { const wd = x.measureText(sign).width; if (wd > 1880) x.font = `800 ${Math.max(84, Math.floor(250 * 1880 / wd))}px Arial, Helvetica, sans-serif`; }
  x.shadowColor = 'rgba(200,255,170,0.9)'; x.shadowBlur = 60; x.fillStyle = '#F6FFF0'; x.fillText(sign, 1024, 330); x.shadowBlur = 0; x.fillText(sign, 1024, 330);
  // (the panels' seams)
  x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 2; for (let px = 0; px <= 2048; px += 128) { x.beginPath(); x.moveTo(px, 0); x.lineTo(px, 776); x.stroke(); } for (let py = 0; py <= 776; py += 97) { x.beginPath(); x.moveTo(0, py); x.lineTo(2048, py); x.stroke(); }
  return c;
}
// a side screen (the close-up feed's frame: a lime field and LIVE, the house's own magnification)
function sideCanvas() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 768; const x = c.getContext('2d');
  const g = x.createRadialGradient(256, 420, 30, 256, 420, 520); g.addColorStop(0, '#2C6E3A'); g.addColorStop(1, '#03100A'); x.fillStyle = g; x.fillRect(0, 0, 512, 768);
  x.fillStyle = 'rgba(0,0,0,0.55)'; x.beginPath(); x.ellipse(256, 520, 130, 230, 0, PI, 2 * PI); x.fill(); x.beginPath(); x.arc(256, 300, 80, 0, 2 * PI); x.fill();
  x.font = '800 54px Arial'; x.textAlign = 'center'; x.fillStyle = '#B6FF3B'; x.fillText('● LIVE', 256, 80);
  return c;
}
// a seated figure's torso: shoulders wider than deep, narrowing to the waist (a lathe, squashed front to back)
export function torsoGeo() {
  const pts = [[0.0, -0.3], [0.17, -0.3], [0.19, -0.1], [0.2, 0.12], [0.23, 0.26], [0.2, 0.33], [0.08, 0.38], [0.05, 0.42], [0, 0.42]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 14); g.scale(1, 1, 0.62); g.computeVertexNormals(); return g;
}
export function stage(K, def) {
  const M = K.mat, w = 34, d = 54, h = 14, sign = def.sign || 'LIVE', r = K.rng(281), up = def.house === 'up';
  const black = K.std({ color: '#0A0A0C', roughness: 0.9 });
  K.room({ w, d, h, floor: K.surf(SURF.carpet('#16171C', 283), [8, 8], { roughness: 0.95 }), wall: black, ceiling: black, skirting: null, crown: null, panels: false, ao: 0 });
  // (the deck: gloss black from the wall to its lip at z 0.6, the lip a line of light)
  const deck = K.std({ color: '#060607', roughness: 0.3, metalness: 0.2 }); deck.envMapIntensity = 0.8;
  K.box(22, 0.02, 0.6 - ZS + 0.6, deck, 0, 0, (0.6 + ZS - 0.6) / 2);
  K.box(22, 0.025, 0.06, K.std({ color: '#FFFFFF', emissive: '#E8F6FF', emissiveIntensity: 3.2 }), 0, 0.02, 0.6, { shadow: false });
  // the LED wall: the stage's width, glowing (it blooms), its black frame; the set's sign over a lime sunrise
  const wallM = new THREE.MeshBasicMaterial({ map: K.tex(wallCanvas(sign)), color: new THREE.Color(2.1, 2.1, 2.1), fog: false });
  K.box(19.6, 7.6, 0.2, black, 0, 0.8, ZS - 0.1, { shadow: false });
  K.plane(19.2, 7.2, wallM, 0, 0.8 + 3.8, ZS + 0.02);
  // (its light into the room: the deck and the front rows' faces, soft and wide; sets.js makes it an area light)
  K.rects.push({ at: [0, 4.6, ZS + 0.3], to: [0, 3.2, 8], w: 19, h: 7.2, k: 1 });
  // the side screens (the house's magnification), angled in at the wings
  for (const sx of [-1, 1]) {
    const G = K.grp(sx * 13.2, 0, -3.2, -sx * 0.42);
    K.box(4.2, 6.2, 0.15, black, 0, 2.2, -0.08, { parent: G, shadow: false });
    K.plane(4.0, 6.0, new THREE.MeshBasicMaterial({ map: K.tex(sideCanvas()), color: new THREE.Color(1.6, 1.6, 1.6), fog: false }), 0, 5.2, 0.01, { parent: G });
  }
  // the truss: upstage, mid and front of house, its cans; haze in the cans' beams (additive cones), sweeping slowly
  const truss = K.std({ color: '#2E3136', roughness: 0.4, metalness: 0.8 }), can = K.std({ color: '#111214', roughness: 0.5, metalness: 0.5 });
  for (const [z, y, len] of [[-6.5, 9.2, 24], [-1.4, 9.2, 24], [7.2, 9.8, 28]]) { K.box(len, 0.4, 0.4, truss, 0, y, z, { shadow: false }); for (let i = 0; i < 9; i++) K.cyl(0.16, 0.2, 0.42, can, -len / 2 + 1.5 + i * ((len - 3) / 8), y - 0.42, z, { shadow: false }); }
  const beams = [];
  // (a beam: an open cone from the can, its light thick by the can and thinning to nothing at its end, and soft at its
  // edges as haze is: brightest where the eye looks through most of it)
  const beam = (from, to, color, k = 0.05, rad = 1.3) => {
    const len = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const geo = new THREE.CylinderGeometry(0.1, rad, len, 28, 1, true); geo.translate(0, -len / 2, 0);
    const m = new THREE.MeshBasicNodeMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const kk = uniform(k); m.opacityNode = pow(uv().y, float(1.6)).mul(pow(abs(dot(normalView, positionViewDirection)), float(2.2))).mul(kk);
    const o = new THREE.Mesh(geo, m); o.position.set(...from); o.renderOrder = 2;
    const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]).normalize();
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir); K.group.add(o);
    beams.push({ o, q0: o.quaternion.clone(), ph: r() * 6.3, amp: 0.08 + r() * 0.1 });
  };
  const LIME = '#A8F060', CYAN = '#7FD8FF', WHITE = '#FFF4E6';
  for (let i = 0; i < 6; i++) { const x = -8.6 + i * 3.44; beam([x, 8.8, -6.5], [x * 0.35 + (i % 2 ? 2 : -2), 0, -1.5], i % 2 ? LIME : CYAN, 0.16); }
  for (let i = 0; i < 4; i++) { const x = -7 + i * 4.67; beam([x, 8.8, -1.4], [x * 1.3, 0.5, 9], i % 2 ? WHITE : LIME, up ? 0.14 : 0.09, 2.2); }
  beam([-4.5, 9.4, 7.2], [-0.6, 1.3, -2.1], WHITE, 0.07, 0.8); beam([4.5, 9.4, 7.2], [0.6, 1.3, -2.1], WHITE, 0.05, 0.8);
  // the wings: tall black drapes either side, the monitor wedges at the lip, the stage's cable run
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) K.box(0.08, 9, 2.2, K.std({ color: '#111115', roughness: 1 }), s * (10.6 - i * 0.35), 0, -6.8 + i * 2.2, { shadow: false });
  for (const x of [-3, 3]) { const G = K.grp(x, 0.02, 0.15); const wd = K.box(0.7, 0.32, 0.45, black, 0, 0, 0, { parent: G }); wd.rotation.x = -0.35; }
  // the barrier at the front of the house
  // (in two runs, with a gap by the front row's reserved seat: the way from the stage to it)
  { const bm = K.std({ color: '#2A2C30', roughness: 0.5, metalness: 0.6 }); K.box(8.4, 1.1, 0.08, bm, -2.6 - 4.2, 0, 2.4); K.box(10.8, 1.1, 0.08, bm, -0.2 + 5.4, 0, 2.4); }
  // the front row's one reserved seat: the executive chair, mahogany and oxblood leather, facing the stage
  { const mah = K.std({ color: '#5A2414', roughness: 0.32 }), ox = K.std({ color: '#4A1512', roughness: 0.42 }), G = K.grp(CHAIR[0], 0, CHAIR[1], PI);
    for (let i = 0; i < 5; i++) { const a = (i * 2 * PI) / 5, leg = K.box(0.05, 0.04, 0.36, mah, Math.sin(a) * 0.18, 0.04, Math.cos(a) * 0.18, { parent: G }); leg.rotation.y = a; }
    K.cyl(0.03, 0.03, 0.38, M.brass, 0, 0.07, 0, { parent: G }); K.box(0.6, 0.12, 0.56, ox, 0, 0.44, 0, { parent: G, r: 0.04 });
    K.box(0.6, 0.86, 0.12, ox, 0, 0.52, -0.27, { parent: G, r: 0.05 }); K.box(0.66, 0.08, 0.16, mah, 0, 1.38, -0.28, { parent: G, r: 0.03 });
    for (const sx of [-1, 1]) { K.box(0.07, 0.06, 0.48, mah, sx * 0.33, 0.66, -0.02, { parent: G, r: 0.02 }); K.box(0.05, 0.2, 0.05, mah, sx * 0.33, 0.48, 0.18, { parent: G }); } }
  // the seats rising behind the pit: risers and seats, and the house in them and in the far tier (crowd-plan.js,
  // crowd.js: people, not figures; standing and cheering when the house is up, their phones up and lit)
  const rows = 9, per = 50, n = rows * per, z0 = 10.2, rise = 0.42;
  for (let j = 0; j < rows; j++) K.box(w - 1.2, j * rise + 0.001, 0.95, K.std({ color: '#121317', roughness: 0.95 }), 0, 0, z0 + j * 0.95, { shadow: false });
  const IM = (g, m, count) => { const o = new THREE.InstancedMesh(g, m, count); o.castShadow = false; o.receiveShadow = false; K.group.add(o); return o; };
  const seatM = K.std({ color: '#1A1D26', roughness: 0.85 });
  const phoneM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.6, 3.0), side: THREE.DoubleSide, fog: false });
  const seats = IM(new THREE.BoxGeometry(0.5, 0.5, 0.5), seatM, n);
  const mx = new THREE.Matrix4(), hide = new THREE.Matrix4().makeScale(0, 0, 0), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  const aisle = (x) => Math.abs(x) < 0.6 || Math.abs(Math.abs(x) - 9) < 0.5;
  for (let j = 0, k = 0; j < rows; j++) for (let i = 0; i < per; i++, k++) {
    const x = -w / 2 + 1.2 + i * ((w - 2.4) / (per - 1)), z = z0 + j * 0.95, y = j * rise;
    seats.setMatrixAt(k, aisle(x) ? hide : mx.makeTranslation(x, y + 0.25, z + 0.05));
  }
  seats.instanceMatrix.needsUpdate = true;
  // (the fascia under the far tier: black, its ribbon of light along the top)
  K.box(w - 1.2, 0.16, 0.05, K.std({ color: '#0A1A10', emissive: '#7FE07A', emissiveIntensity: 1.6 }), 0, 4.0, 19.07, { shadow: false });
  K.box(w - 1.2, 0.05, 0.05, K.std({ color: '#0A1018', emissive: '#7FD8FF', emissiveIntensity: 1.2 }), 0, 3.72, 19.07, { shadow: false });
  // (the pit's phones, up in their hands: placed each frame with the hands that hold them, below)
  const pit = pitOf(), skip = new Set();
  // (the city's crowd in this set's group now, so it is compiled with the set before its first frame)
  if (!pit.none) for (const m of pit.C.meshes) K.group.add(m);
  const clear = []; for (const p of def.people || []) { if (Array.isArray(p.at)) clear.push(p.at); if (p.walk?.to) clear.push(p.walk.to); }
  clear.push(CHAIR);
  const pitPhones = IM(new THREE.PlaneGeometry(0.075, 0.14), phoneM, 220); pitPhones.frustumCulled = false;
  // (no city crowd to draw (WebGL2): the pit is the house's own people, eight rows of 27 standing to the barrier)
  const pitAt = [];
  if (pit.none) { let s0 = 913; const rnd = () => ((s0 = (s0 * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 27; i++) { const x = -10.2 + i * 0.78 + (rnd() - 0.5) * 0.36 + (j % 2) * 0.3, z = 3.35 + j * 0.74 + (rnd() - 0.5) * 0.22; pitAt.push({ x, z, h: PI + (rnd() - 0.5) * 0.5 + x * -0.02 }); } }
  const house = crowd(K.group, planHouse({ w, up, clear, pit: pitAt, seed: 281 }), { up });
  (window.NYC ||= {}).houseStats = house.stats; // (for a perf probe: the house's draw calls, people, levels, ms a frame)
  if (!pit.none) pit.people.forEach((p, i) => { if (clear.some((c) => Math.hypot(c[0] - p.x, c[1] - p.z) < 1.0)) skip.add(i); });
  // (the house lights down: a glow along the aisles' floor, the exits' signs)
  for (const x of [-w / 2 + 0.4, w / 2 - 0.4]) K.box(0.06, 0.03, 17, K.std({ color: '#FFB060', emissive: '#FF9A40', emissiveIntensity: 1.8 }), x, 0, 1.5 + 17 / 2, { shadow: false });
  for (const sx of [-1, 1]) { const G = K.grp(sx * (w / 2 - 0.02), 0, 6, -sx * PI / 2); K.plane(0.7, 0.26, new THREE.MeshBasicMaterial({ map: K.tex(lettering([{ t: 'EXIT', font: '800 150px Arial' }], { w: 512, h: 192, bg: '#0B3A1A', fg: '#7DFF9A' })), color: new THREE.Color(1.8, 1.8, 1.8), fog: false }), 0, 3.4, 0.02, { parent: G }); }

  // the frame's motion: the beams' sweep, the pit standing (calm: weight shifts and a sway, a phone up here and there;
  // up: the cheer, a bounce), its meshes in this set's group while it is drawn, and the phones in the hands holding them
  const _h = new THREE.Vector3(), glowAt = [];
  // (a phone in the hand that holds it up: at the rig's hand, held upright, a little up from the palm; its light the
  // house's)
  const phoneAt = (n, at, h) => { _h.copy(at); _h.y += 0.05; pitPhones.setMatrixAt(n, mx.compose(_h, q.setFromEuler(e.set(-0.15, h, 0)), one)); (glowAt[n] ||= new THREE.Vector3()).copy(_h); };
  const tick = (dt, t, S) => {
    for (const b of beams) { const a = Math.sin(t * 0.35 + b.ph) * b.amp; b.o.quaternion.copy(b.q0).multiply(q.setFromEuler(e.set(a * 0.6, 0, a))); }
    let np = 0;
    if (!pit.none) {
      const C = pit.C; for (const m of C.meshes) if (m.parent !== K.group) K.group.add(m);
      const cam = S?.cam?.position;
      C.begin();
      pit.people.forEach((p, i) => {
        if (skip.has(i)) return;
        const dist = cam ? Math.hypot(p.x - cam.x, p.z - cam.z) : 0;
        const air = cheer(p, t, up, p.hands, p.poles);
        const hh = p.h + (up ? 0 : Math.sin(t * 0.4 * p.sway + p.ph) * 0.06);
        if (!p.placed) { p.placed = true; p.rig.reset?.(p.x, p.z, hh, pit.ground, p); }
        p.rig.update(Math.max(1e-4, Math.min(dt, 0.05)), p.x, p.z, hh, pit.ground, p, air, true);
        if (p.style !== 'rest' && p.rig.reach) p.rig.reach(p.hands, p.poles);
        C.add(p.rig, dist);
        if (p.style === 'phone' && np < 220 && p.rig.handAt) phoneAt(np++, p.rig.handAt[p.hand], p.rig.yaw ?? hh);
      });
      C.end();
    }
    for (let i = np; i < 220; i++) pitPhones.setMatrixAt(i, hide);
    pitPhones.instanceMatrix.needsUpdate = true;
    glowAt.length = np; house.tick(t, S?.cam, glowAt);
  };

  return {
    sky: '#040507', env: 0.2, envNight: 0.22, fog: { color: '#121722', density: 0.016 },
    light: { sun: false, hemi: 0.95, hemiK: 0.75, sky: '#56669A', ground: '#141418', rects: 1, window: '#D6F5DC', windowK: 3.2,
      points: [{ at: [0, 3.2, -6.5], k: 5, color: '#C8F5C0', dist: 12 }, { at: [0, 6, 11], k: 6, color: '#7F92C8', dist: 26 },
        { at: [-4, 0.5, 1.2], k: 3, color: '#FFF0E0', dist: 8 }, { at: [4, 0.5, 1.2], k: 3, color: '#FFF0E0', dist: 8 }],
      spots: [
        // (the presenter's key from the front-of-house truss, warm, and its partner from the other side, softer)
        { at: [-4.5, 9.4, 7.2], to: [-0.6, 1.3, -2.1], k: 120, color: '#FFF1E0', angle: 0.36, pen: 0.55, dist: 32, shadow: true },
        { at: [4.5, 9.4, 7.2], to: [0.6, 1.3, -2.1], k: 80, color: '#FFF6EE', angle: 0.36, pen: 0.6, dist: 32 },
        // (the top wash over the deck, the cool rims from upstage)
        { at: [0, 8.8, -1.4], to: [0, 0, -3], k: 35, color: '#EAF2FF', angle: 0.7, pen: 0.85, dist: 20 },
        { at: [-4, 8.8, -6.5], to: [-1.2, 1.5, -2], k: 120, color: '#86AEFF', angle: 0.42, pen: 0.6, dist: 20 },
        { at: [4, 8.8, -6.5], to: [1.2, 1.5, -2], k: 120, color: '#9CF0B0', angle: 0.42, pen: 0.6, dist: 20 },
        // (the stage's spill on the house: the front rows' faces, warm, then the seats)
        { at: [-6, 8.6, -1.4], to: [-4, 1.4, 6.5], k: up ? 90 : 60, color: '#FFD9B4', angle: 0.75, pen: 0.8, dist: 34 },
        { at: [6, 8.6, -1.4], to: [4, 1.4, 6.5], k: up ? 90 : 60, color: '#FFE2C4', angle: 0.75, pen: 0.8, dist: 34 },
        { at: [0, 9.0, -1.4], to: [0, 3.0, 14], k: up ? 70 : 30, color: '#DCE6FF', angle: 0.7, pen: 0.85, dist: 38 }] },
    key: 1.5, rim: 1.1, fill: 1.2,
    // (the people's key in the truss's warm white, not the night's amber (sets.js): skin reads as skin, not orange; the
    // fill a softer cool, so the shadow side doesn't push the lit side warmer by contrast. The rims and the LED stay the mood)
    keyColor: '#FFF8F2', fillColor: '#B4BFDC',
    marks: { screen: [0, 5, ZS], lip: [0, 0.4, 0.6], podium: [0, 1.2, -2], house: [0, 1.4, 6], chair: [CHAIR[0], 0.9, CHAIR[1]] },
    tick,
  };
}
