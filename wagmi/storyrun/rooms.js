// Mog City story runner: the sets' rooms (sets.js stages a world's cutscenes in them; setkit.js builds them). Each one is
// a function of the kit and the set's own def, returning { light, marks, key, env }: its sun (through its windows),
// its practicals, and named marks. Laid out round x 0 z 0, the windows (or the open side) at -z, the way in at +z.
// Generic places a story can be in (nothing in them is a real place, brand or person; the lettering is the story's own
// words when the set gives it: def.sign).
// (6 Nov, the art pass, the owner: "plain and low detail; the bar is Mr. Big's study") Each room is dressed as a
// lived-in place, from the front wall a reverse shot sees to the things on the desk: scanned surfaces (the library's
// plaster, brick, concrete, planks), mouldings and panelling, its clutter, real scanned furniture and fittings where the
// library has them (stools, lounge chairs, drums, tyres, a covered car, a roller door, the fire escape, lamps, ferns),
// the windows' city in layers, practical lamps that glow, and the corners' soft dark (setkit.js).
import * as THREE from 'three/webgpu';
import { SURF, lettering, drawing, photo, painting } from './setkit.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const PI = Math.PI;

/* -------------------------------------------------------------- shared -- */
// raised-panel wainscot along a wall (len long, h high): rails, stiles and the panels between, in its wood
function wainscot(K, G, len, h, m, { panel = 0.62 } = {}) {
  const n = Math.max(1, Math.round(len / panel)), pw = len / n, dark = K.std({ color: K.shade('#' + m.color.getHexString(), 0.82), roughness: m.roughness });
  K.box(len, h, 0.02, dark, 0, 0, 0.01, { parent: G, shadow: false });
  for (const y of [0.12, h - 0.06]) K.box(len, y < 0.5 ? 0.12 : 0.06, 0.035, m, 0, y < 0.5 ? 0 : h - 0.06, 0.03, { parent: G, shadow: false });
  K.box(len + 0.02, 0.04, 0.06, m, 0, h - 0.02, 0.035, { parent: G, shadow: false });
  for (let i = 0; i <= n; i++) K.box(0.07, h - 0.18, 0.03, m, -len / 2 + i * pw, 0.12, 0.03, { parent: G, shadow: false });
  for (let i = 0; i < n; i++) K.box(pw - 0.17, h - 0.34, 0.025, m, -len / 2 + (i + 0.5) * pw, 0.2, 0.025, { parent: G, shadow: false });
}
// the four walls' groups (x along the wall, +z into the room), for things fixed to a wall
const wallG = (K, w, d) => ({ back: K.grp(0, 0, -d / 2 + 0.005, 0), front: K.grp(0, 0, d / 2 - 0.005, PI), left: K.grp(-w / 2 + 0.005, 0, 0, PI / 2), right: K.grp(w / 2 - 0.005, 0, 0, -PI / 2) });
// a banker's lamp: brass, its green glass shade lit from under, the bulb glowing (as Mr. Big's)
function bankersLamp(K, x, y, z, ry = 0) {
  const M = K.mat, G = K.grp(x, y, z, ry);
  K.cyl(0.075, 0.085, 0.022, M.brass, 0, 0, 0, { parent: G, seg: 28 }); K.cyl(0.008, 0.008, 0.3, M.brass, 0, 0.02, 0, { parent: G, seg: 10 });
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.34, 28, 1, true, 0, PI), K.std({ color: '#0F5A2C', roughness: 0.15, metalness: 0.1, emissive: '#0C4A22', emissiveIntensity: 0.6, side: THREE.DoubleSide }));
  sh.rotation.z = PI / 2; sh.position.set(0, 0.34, 0); G.add(sh);
  K.bulb(0, 0.32, 0, 0.018, '#FFD9A0', 10, G).scale.set(9, 1, 1);
  return G;
}
// a mug, a stack of folders, a pen pot, a desk phone: the things on a desk
function mug(K, x, y, z, c = '#F2EEE6') { const m = K.std({ color: c, roughness: 0.35 }); const G = K.grp(x, y, z); K.cyl(0.04, 0.036, 0.095, m, 0, 0, 0, { parent: G, seg: 18 }); const h = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.007, 8, 16, PI), m); h.position.set(0.045, 0.05, 0); h.rotation.z = -PI / 2; G.add(h); K.cyl(0.034, 0.034, 0.004, K.std({ color: '#3B2416', roughness: 0.1 }), 0, 0.082, 0, { parent: G, shadow: false }); return G; }
function folders(K, x, y, z, n = 4, ry = 0, seed = 3) { const r = K.rng(seed), G = K.grp(x, y, z, ry); for (let i = 0; i < n; i++) { const f = K.box(0.25, 0.012, 0.32, K.std({ color: ['#C9A86A', '#5A7FA8', '#B85C4A', '#E6DCC4', '#7A8C5A'][Math.floor(r() * 5)], roughness: 0.85 }), (r() - 0.5) * 0.03, i * 0.013, (r() - 0.5) * 0.03, { parent: G }); f.rotation.y = (r() - 0.5) * 0.12; } return G; }
function penPot(K, x, y, z) { const G = K.grp(x, y, z); K.cyl(0.035, 0.035, 0.1, K.std({ color: '#1C1C1E', roughness: 0.4, metalness: 0.4 }), 0, 0, 0, { parent: G, seg: 16 }); for (let i = 0; i < 4; i++) { const p = K.cyl(0.004, 0.004, 0.14, K.std({ color: ['#1A1A1A', '#1F3A8C', '#B23A20', '#C9A84A'][i] }), (i - 1.5) * 0.012, 0.03, (i % 2) * 0.012, { parent: G, seg: 6, rz: (i - 1.5) * 0.12 }); } return G; }
function deskPhone(K, x, y, z, ry = 0) { const G = K.grp(x, y, z, ry), m = K.std({ color: '#232427', roughness: 0.45 }); K.box(0.2, 0.05, 0.22, m, 0, 0, 0, { parent: G, r: 0.015 }); K.box(0.22, 0.04, 0.06, m, 0, 0.05, -0.06, { parent: G, r: 0.02 }); K.box(0.08, 0.004, 0.05, K.mat.screen, 0.04, 0.051, 0.05, { parent: G, shadow: false }); return G; }
// a coat stand with a coat and a hat on it
function coatStand(K, x, z, coat = '#2A2E36') { const M = K.mat, G = K.grp(x, 0, z); K.cyl(0.018, 0.022, 1.8, M.walnut, 0, 0, 0, { parent: G }); for (let i = 0; i < 4; i++) { const a = (i * PI) / 2; const f = K.cyl(0.012, 0.012, 0.3, M.walnut, Math.sin(a) * 0.12, 0, Math.cos(a) * 0.12, { parent: G, rx: Math.cos(a) * 0.6, rz: -Math.sin(a) * 0.6 }); f.position.y = 0.08; } K.box(0.44, 0.88, 0.2, K.std({ color: coat, roughness: 0.92 }), 0.05, 0.86, 0.06, { parent: G, r: 0.07 }); K.cyl(0.1, 0.12, 0.08, K.std({ color: '#3A3128', roughness: 0.8 }), -0.04, 1.72, -0.05, { parent: G }); return G; }
// a shelf's objects among the books: a vase, a frame, a box
function shelfThings(K, G, w, ys, seed) { const r = K.rng(seed); for (const y of ys) { const x = (r() - 0.5) * (w - 0.3); if (r() < 0.5) K.cyl(0.04, 0.05, 0.16 + r() * 0.1, K.std({ color: ['#2E5E78', '#C9A66B', '#8C3B2E', '#E8E2D4'][Math.floor(r() * 4)], roughness: 0.3 }), x, y, 0.02, { parent: G, seg: 14 }); else K.box(0.14, 0.1, 0.18, K.std({ color: '#5A3B26', roughness: 0.6 }), x, y, 0.02, { parent: G }); } }

/* -------------------------------------------------------------- rooms -- */
// a bank's private office, high up downtown: walnut panelling and a blue-grey carpet, the towers through the blinds,
// his desk with its banker's lamp, the credenza of photographs, the bookcases; the visitor's wall with its diplomas
function bankOffice(K, def) {
  const M = K.mat, w = 6.4, d = 5.6, h = 3.0;
  const wall = K.scan('plaster', { tint: '#B3A68F', rough: 0.95, nscale: 0.55, color: false });
  const walnut = K.std({ color: '#4A2E1C', roughness: 0.42 });
  K.room({ w, d, h, floor: K.surf(SURF.carpet('#3E4858', 5), [5, 5], { roughness: 1 }), wall, wainscot: null, skirting: walnut, crown: K.std({ color: '#E9E2D4', roughness: 0.7 }),
    holes: [{ wall: 'back', x: -1.45, y: 0.75, w: 1.7, h: 1.95 }, { wall: 'back', x: 1.45, y: 0.75, w: 1.7, h: 1.95 }], lightsAt: [[-1.6, 0.2], [1.6, 0.2]] });
  const WG = wallG(K, w, d);
  // (walnut panelling to the dado, the three walls without windows; under the windows, the back's)
  wainscot(K, WG.left, d - 0.02, 1.05, walnut); wainscot(K, WG.right, d - 0.02, 1.05, walnut);
  { const G = K.grp(-1.55, 0, 0, 0, WG.front); wainscot(K, G, w - 3.1, 1.05, walnut); }
  for (const x of [-1.45, 1.45]) K.window({ x, z: -d / 2, y: 0.75, w: 1.7, h: 1.95, city: { seed: 61, high: true }, blinds: 0.28, frameM: M.offwhite, mullions: 1, out: 5, reveal: K.std({ color: '#E3DCCE', roughness: 0.9 }) });
  K.radiator(-1.45, -d / 2 + 0.12, 0, 1.2); K.radiator(1.45, -d / 2 + 0.12, 0, 1.2);
  // his desk: walnut, a leather inlay, the lamp, the screen, the phone, folders, a nameplate, a mug, a pen pot
  K.desk(0, -0.95, PI, 1.9, 0.9, walnut); K.box(1.3, 0.004, 0.55, K.std({ color: '#1F3326', roughness: 0.6 }), 0, 0.762, -0.98, { shadow: false });
  K.blob(0, -1.0, 2.4, 1.4, 0.5);
  K.officeChair(0, -1.85, 0, M.leather); K.blob(0, -1.85, 0.8, 0.8, 0.4);
  K.chair(-0.6, 0.2, PI, walnut, M.oxblood); K.chair(0.6, 0.2, PI, walnut, M.oxblood); K.blob(-0.6, 0.2, 0.7, 0.7, 0.35); K.blob(0.6, 0.2, 0.7, 0.7, 0.35);
  K.monitor(0.55, 0.765, -1.2, PI + 0.35); bankersLamp(K, -0.7, 0.765, -1.25, 0.25); K.papers(-0.1, 0.766, -0.85, 3);
  folders(K, -0.62, 0.766, -0.78, 5, 0.2, 7); penPot(K, 0.2, 0.766, -1.25); deskPhone(K, 0.82, 0.766, -0.85, PI + 0.4); mug(K, 0.38, 0.766, -0.72);
  { const p = K.box(0.3, 0.07, 0.06, M.brass, 0.05, 0.765, -0.5, { r: 0.01 }); p.rotation.y = 0.05; K.box(0.26, 0.045, 0.002, K.std({ map: K.tex(lettering('G. PELL', { w: 512, h: 96, bg: '#1A1410', fg: '#D8B868', font: '600 64px Georgia' })) }), 0.05, 0.777, -0.468, { shadow: false }); }
  // (the credenza under the windows: photographs, a clock, a fern, books lying flat)
  K.box(2.6, 0.72, 0.5, walnut, 0, 0, -d / 2 + 0.55); K.box(2.64, 0.03, 0.54, K.std({ color: '#2E1B10', roughness: 0.3 }), 0, 0.72, -d / 2 + 0.55);
  for (const x of [-0.95, -0.32, 0.32, 0.95]) K.box(0.6, 0.6, 0.01, K.std({ color: '#3E2616', roughness: 0.45 }), x, 0.06, -d / 2 + 0.81, { shadow: false });
  K.frame(photo(71), 0.24, 0.18, -0.8, 0.98, -d / 2 + 0.5, 0, M.brass); K.frame(photo(73), 0.2, 0.26, 0.7, 1.04, -d / 2 + 0.5, 0, M.black);
  K.potted(0, -d / 2 + 0.52, 0.65, { y: 0.75, pot: '#1E2A33' });
  K.books(0.95, 0.75, -d / 2 + 0.55, 0.3, PI / 2, 37, 0.2);
  K.bookcase(-w / 2 + 0.2, -1.3, PI / 2, 1.3, 2.3, 81, walnut); K.bookcase(-w / 2 + 0.2, 0.15, PI / 2, 1.3, 2.3, 89, walnut);
  shelfThings(K, K.grp(-w / 2 + 0.24, 0, -1.3, PI / 2), 1.2, [0.53, 1.39, 1.82], 83); shelfThings(K, K.grp(-w / 2 + 0.24, 0, 0.15, PI / 2), 1.2, [0.97, 1.82], 85);
  K.frame(painting(91), 1.3, 0.95, w / 2 - 0.03, 2.25, -0.6, -PI / 2, M.black);
  K.frame(painting(93, ['#2F4858', '#86BBD8', '#F6AE2D', '#F26419']), 0.7, 0.9, w / 2 - 0.03, 2.15, 1.25, -PI / 2, M.black);
  K.potted(w / 2 - 0.45, -d / 2 + 0.5, 1.2, { pot: '#2A2A2A' }); K.potted(-w / 2 + 0.5, d / 2 - 0.5, 1.05, { pot: '#A65A3A' });
  K.door(1.9, d / 2 - 0.03, PI); K.cabinet(-1.2, d / 2 - 0.35, PI, 0.9, 1.0, K.std({ color: '#3A2416', roughness: 0.45 }));
  K.plate(1.25, 1.12, d / 2 - 0.012, PI, true); K.plate(-2.7, 0.3, d / 2 - 0.012, PI); K.clock(-0.55, 2.55, d / 2 - 0.01, PI);
  // (the wall behind a visitor: his framed papers, a print of the harbour, a coat stand, a lamp on the cabinet)
  const dip = (t) => lettering([{ t: 'CERTIFICATE', font: '700 64px Georgia' }, { t, font: 'italic 44px Georgia' }, { t: '· · ·', font: '400 40px Georgia' }], { w: 512, h: 384, bg: '#F3EEDF', fg: '#3A3022', border: '#B68A3E' });
  K.frame(dip('of Banking Practice'), 0.42, 0.32, -0.55, 2.0, d / 2 - 0.03, PI, M.black); K.frame(dip('in Credit Risk'), 0.42, 0.32, 0.05, 2.0, d / 2 - 0.03, PI, M.black);
  K.frame(painting(87, ['#24384F', '#8FA9BF', '#E8E2D4', '#C9A66B']), 1.1, 0.7, -2.1, 2.0, d / 2 - 0.03, PI, walnut);
  K.deskLamp(-1.45, 1.0, d / 2 - 0.35, K.std({ color: '#E8DFC8', roughness: 0.6, emissive: '#FFD9A0', emissiveIntensity: 0.25 })); K.bulb(-1.45, 1.3, d / 2 - 0.35, 0.03, '#FFE2B0', 5);
  folders(K, -0.95, 1.0, d / 2 - 0.4, 3, 0.1, 11);
  coatStand(K, 0.85, d / 2 - 0.4);
  K.rug(3.4, 2.5, 0, -0.45, '#2B3546', '#C8B98F', 99);
  return {
    light: { sun: { from: [3.5, 7, -9], to: [0, 0, 0.5], ext: 6, k: 2.8 }, hemi: 0.8,
      points: [{ at: [-1.6, 2.8, 0.2], k: 1.0, color: '#FFF3E0', dist: 5 }, { at: [1.6, 2.8, 0.2], k: 1.0, color: '#FFF3E0', dist: 5 }, { at: [-0.7, 1.12, -1.2], k: 1.4, color: '#FFD08A', dist: 3.5 }, { at: [-1.45, 1.35, d / 2 - 0.45], k: 1.1, color: '#FFD49A', dist: 3.5 }] },
    marks: { desk: [0, 1.0, -0.95], door: [1.9, 1.2, d / 2], window: [0, 1.6, -d / 2] },
  };
}

// a grade school's corridor by the front office: cubbies and lockers, the children's drawings, the doors to the yard
function school(K, def) {
  const M = K.mat, w = 4.2, d = 13, h = 3.1;
  const lower = K.scan('plaster', { tint: '#8FB4CA', rough: 0.6, nscale: 0.4, color: false }), upper = K.scan('plaster', { tint: '#ECE3CC', rough: 0.9, nscale: 0.4, color: false });
  K.room({ w, d, h, floor: K.surf(SURF.tiles('#E3DDCF', '#7FA7C6', 10, 101, 0.16), [3, 9], { roughness: 0.22 }), wall: upper, wallBack: upper, wainscot: M.oak, crown: null,
    holes: [{ wall: 'back', x: 0, y: 0, w: 1.9, h: 2.3 }, { wall: 'right', x: -3.2, y: 0.95, w: 2.2, h: 1.25 }], panels: false });
  // (the lower half of the walls painted blue, to the dado)
  for (const [len, x, z, ry] of [[d, -w / 2 + 0.008, 0, PI / 2], [d, w / 2 - 0.008, 0, -PI / 2]]) K.box(len, 0.9, 0.006, lower, x, 0, z, { ry, shadow: false });
  // (the ceiling's long lights in their housings, glowing, every three metres; a sprinkler, a smoke alarm)
  for (const z of [-5, -2, 1, 4]) { K.box(0.32, 0.06, 1.3, K.std({ color: '#DADAD6', roughness: 0.5, metalness: 0.3 }), 0, h - 0.06, z); K.box(0.26, 0.012, 1.24, M.panel, 0, h - 0.072, z, { shadow: false }); K.cyl(0.04, 0.04, 0.03, M.white, 0.9, h - 0.03, z + 1.4, { shadow: false }); }
  // the doors to the yard at the far end, their glass full of the day; EXIT over them; a push bar
  K.window({ x: 0, z: -d / 2, y: 0, w: 1.9, h: 2.3, city: { seed: 103, tone: '#B9A587' }, frameM: K.std({ color: '#2E4C6D', roughness: 0.4 }), mullions: 1, out: 8, sill: false });
  K.box(1.7, 0.05, 0.06, M.steel, 0, 1.0, -d / 2 + 0.08);
  K.box(0.5, 0.18, 0.06, K.std({ map: K.tex(lettering('EXIT', { w: 256, h: 96, bg: '#1A1A1A', fg: '#FF3B30', font: '700 72px Arial' })), emissive: '#FF2A1F', emissiveIntensity: 0.6 }), 0, 2.45, -d / 2 + 0.05);
  // the cubbies down the left wall: a hook and a cubby each, coats and backpacks in some, a name card over each
  const cub = K.std({ color: '#C79A5B', roughness: 0.55 }), packs = ['#E53935', '#1E88E5', '#43A047', '#FDD835', '#8E24AA', '#FB8C00'], r = K.rng(107);
  for (let i = 0; i < 9; i++) {
    const z = -5.2 + i * 0.62;
    K.box(0.4, 1.5, 0.02, cub, -w / 2 + 0.2, 0, z - 0.3); K.box(0.4, 0.02, 0.6, cub, -w / 2 + 0.2, 0.35, z); K.box(0.4, 0.02, 0.6, cub, -w / 2 + 0.2, 1.5, z);
    K.cyl(0.012, 0.012, 0.09, M.chrome, -w / 2 + 0.08, 1.25, z, { rz: PI / 2 });
    K.box(0.005, 0.07, 0.3, K.std({ color: packs[i % 6], roughness: 0.9 }), -w / 2 + 0.41, 1.56, z, { shadow: false });
    if (r() < 0.7) K.box(0.22, 0.32, 0.28, K.std({ color: packs[Math.floor(r() * 6)], roughness: 0.8 }), -w / 2 + 0.2, 0.37, z, { r: 0.05 });
    if (r() < 0.55) K.box(0.08, 0.5, 0.36, K.std({ color: packs[Math.floor(r() * 6)], roughness: 0.95 }), -w / 2 + 0.12, 0.85, z, { r: 0.04 });
    if (r() < 0.4) K.box(0.18, 0.12, 0.14, K.std({ color: '#F2F2F2', roughness: 0.6 }), -w / 2 + 0.2, 1.52, z, { r: 0.03 });
  }
  K.box(0.4, 1.5, 0.02, cub, -w / 2 + 0.2, 0, 0.68);
  // lockers on the left past them, toward the way in, their vents and handles
  for (let i = 0; i < 8; i++) { const z = 1.4 + i * 0.4, lm = K.std({ color: i % 2 ? '#3E6E8E' : '#3A688A', roughness: 0.4, metalness: 0.35 }); K.box(0.45, 1.8, 0.38, lm, -w / 2 + 0.23, 0, z); K.box(0.03, 0.12, 0.02, M.chrome, -w / 2 + 0.46, 1.0, z + 0.12); for (let v = 0; v < 4; v++) K.box(0.004, 0.012, 0.22, M.black, -w / 2 + 0.455, 1.55 + v * 0.03, z, { shadow: false }); }
  K.blob(-w / 2 + 0.25, 2.8, 0.6, 3.4, 0.35);
  // the children's drawings on a cork board on the right, FIRST GRADE over it; a second board by the office
  const cork = K.std({ color: '#B88B5A', roughness: 0.95 });
  K.box(0.03, 1.1, 3.6, cork, w / 2 - 0.02, 1.05, 1.5); K.box(0.035, 1.16, 3.66, M.oak, w / 2 - 0.015, 1.02, 1.5, { shadow: false });
  K.box(0.02, 0.22, 1.4, K.std({ map: K.tex(lettering('FIRST GRADE', { w: 1024, h: 160, bg: '#FFFFFF', fg: '#1E88E5', font: '700 110px Arial Rounded MT Bold, Arial' })) }), w / 2 - 0.04, 2.25, 1.5);
  for (let i = 0; i < 10; i++) { const p = K.plane(0.36, 0.28, K.std({ map: K.tex(drawing(111 + i)), roughness: 0.9 }), w / 2 - 0.045, 1.25 + (i % 2) * 0.42 + (r() - 0.5) * 0.06, 0.1 + Math.floor(i / 2) * 0.62, { ry: -PI / 2 }); p.rotation.z = (r() - 0.5) * 0.12; }
  K.box(0.03, 0.8, 1.2, cork, -w / 2 + 0.02, 1.25, 4.1);
  for (let i = 0; i < 4; i++) { const p = K.plane(0.34, 0.26, K.std({ map: K.tex(drawing(131 + i)), roughness: 0.9 }), -w / 2 + 0.045, 1.45 + (i % 2) * 0.36, 3.75 + Math.floor(i / 2) * 0.62, { ry: PI / 2 }); p.rotation.z = (r() - 0.5) * 0.12; }
  // (paper chains of the children's colours along the top of the walls)
  for (const s of [-1, 1]) for (let i = 0; i < 40; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 4, 10), K.std({ color: packs[i % 6], roughness: 0.9 })); ring.position.set(s * (w / 2 - 0.08), 2.6 - Math.sin(((i % 10) / 10) * PI) * 0.18, -5.5 + i * 0.25); ring.rotation.y = i % 2 ? 0 : PI / 2; K.group.add(ring); }
  // the front office's window and its counter, a bell on it, MAIN OFFICE over it
  K.box(0.5, 0.06, 2.3, M.oak, w / 2 - 0.2, 0.92, -3.2);
  K.box(0.04, 1.25, 2.2, M.glass, w / 2 - 0.02, 0.95, -3.2, { shadow: false });
  K.box(0.02, 0.2, 1.2, K.std({ map: K.tex(lettering('MAIN OFFICE', { w: 1024, h: 170, bg: '#2E4C6D', fg: '#FFFFFF', font: '700 100px Arial' })) }), w / 2 - 0.03, 2.38, -3.2);
  K.cyl(0.04, 0.05, 0.05, M.brass, w / 2 - 0.25, 0.98, -2.6); K.papers(w / 2 - 0.2, 0.985, -3.4, 2, 7);
  // (behind the glass: a desk, a lamp, a plant, the wall of the office, a window of its own)
  K.box(1.6, 2.4, 0.05, K.surf(SURF.paint('#E8E1CF'), [1, 1]), w / 2 + 1.4, 0, -3.2, { ry: PI / 2 });
  K.desk(w / 2 + 0.8, -3.2, -PI / 2, 1.4, 0.7, M.oak, { pedestals: false }); K.potted(w / 2 + 0.6, -4.1, 0.8);
  K.monitor(w / 2 + 0.9, 0.76, -3.0, -PI / 2 - 0.3);
  // a bench, a fire extinguisher, a clock, a drinking fountain
  K.box(1.6, 0.42, 0.4, M.oak, w / 2 - 0.25, 0, 4.5); K.blob(w / 2 - 0.25, 4.5, 1.8, 0.6, 0.35);
  K.cyl(0.08, 0.08, 0.45, K.std({ color: '#C62828', roughness: 0.4 }), -w / 2 + 0.12, 0.9, -5.7); K.clock(w / 2 - 0.01, 2.55, -1.2, -PI / 2);
  K.box(0.38, 0.32, 0.3, M.steel, w / 2 - 0.16, 0.75, 3.45); K.plate(w / 2 - 0.01, 1.2, 0.3, -PI / 2, true);
  return {
    light: { sun: { from: [-1, 7, -16], to: [0, 0, -2], ext: 9, k: 2.4 }, hemi: 0.9, points: [-5, -2, 1, 4].map((z) => ({ at: [0, 2.85, z], k: 1.8, color: '#F4F6FF', dist: 6 })) },
    marks: { doors: [0, 1.2, -d / 2], office: [w / 2, 1.2, -3.2] },
  };
}

// an old office over a shop uptown, the man's own: dark boards, olive walls, the blinds down and the sun through them
// in stripes, a desk, a leather chair, his board of photographs (the family he is after), a safe, a sofa
function hideout(K, def) {
  const M = K.mat, w = 6.2, d = 5.6, h = 3.3;
  const wall = K.surf(SURF.paper('#6F6E52', '#4E4C36', 131, false), [4, 2], { roughness: 0.9 });
  const boards = K.surf(SURF.planks('#4E3322', 133), [3, 3], { roughness: 0.45 });
  K.room({ w, d, h, floor: boards, wall, ceiling: K.std({ color: '#C9C1AE', roughness: 0.9 }), skirting: M.walnut, crown: K.std({ color: '#5A5640', roughness: 0.8 }), wainscot: null,
    holes: [{ wall: 'back', x: -1.5, y: 0.8, w: 1.5, h: 2.0 }, { wall: 'back', x: 1.5, y: 0.8, w: 1.5, h: 2.0 }], panels: false, ao: 0.5 });
  const WG = wallG(K, w, d);
  wainscot(K, WG.left, d - 0.02, 0.95, K.std({ color: '#3A2618', roughness: 0.5 })); wainscot(K, WG.right, d - 0.02, 0.95, K.std({ color: '#3A2618', roughness: 0.5 }));
  wainscot(K, WG.back, w - 0.02, 0.78, K.std({ color: '#3A2618', roughness: 0.5 }));
  for (const x of [-1.5, 1.5]) K.window({ x, z: -d / 2, y: 0.8, w: 1.5, h: 2.0, city: { seed: 137, tone: '#8E6E5A' }, blinds: 0.78, frameM: K.std({ color: '#3A3A30', roughness: 0.5 }), out: 6, reveal: K.std({ color: '#62604A', roughness: 0.9 }) });
  // (a ceiling fan, still; a pendant over the desk)
  { const G = K.grp(0.4, h - 0.5, 0.4); K.cyl(0.015, 0.015, 0.45, M.brass, 0, 0, 0, { parent: G }); K.cyl(0.12, 0.1, 0.12, M.brass, 0, -0.05, 0, { parent: G }); for (let i = 0; i < 4; i++) { const b = K.box(0.7, 0.012, 0.14, M.walnut, 0, 0.02, 0, { parent: K.grp(0, 0, 0, (i * PI) / 2 + 0.3, G) }); b.position.x = 0.42; } }
  K.pendant(-1.3, -0.95, 1.65, h, { shadeC: '#2B3A2E', r: 0.22 });
  // his desk at an angle, its lamp, a phone, a glass and a bottle, an ashtray, papers, a ledger; the chair
  const dk = K.std({ color: '#3A2618', roughness: 0.32 });
  K.desk(-1.3, -0.9, PI - 0.25, 1.7, 0.85, dk); K.blob(-1.3, -0.95, 2.2, 1.4, 0.55, 0.25);
  K.officeChair(-1.1, -1.75, -0.25, M.leather); K.deskLamp(-1.9, 0.765, -1.15); K.bulb(-1.9, 1.06, -1.15, 0.03, '#FFD49A', 6); K.papers(-1.2, 0.766, -0.85, 5, 139);
  folders(K, -1.75, 0.766, -0.65, 3, 0.4, 13); deskPhone(K, -0.7, 0.766, -1.15, PI - 0.6);
  K.cyl(0.035, 0.03, 0.09, K.std({ color: '#D9B98A', roughness: 0.05, transparent: true, opacity: 0.6 }), -0.75, 0.766, -0.7);
  { const G = K.grp(-0.55, 0.766, -0.9); K.cyl(0.04, 0.045, 0.2, K.std({ color: '#5A2A0A', roughness: 0.08, transparent: true, opacity: 0.85 }), 0, 0, 0, { parent: G }); K.cyl(0.015, 0.015, 0.08, K.std({ color: '#3A1A08', roughness: 0.1 }), 0, 0.2, 0, { parent: G }); K.box(0.06, 0.07, 0.002, K.std({ color: '#E8DCC0' }), 0, 0.06, 0.046, { parent: G, shadow: false }); }
  { const G = K.grp(-1.55, 0.766, -0.62); K.cyl(0.07, 0.06, 0.025, K.std({ color: '#2B2B2B', roughness: 0.2, metalness: 0.6 }), 0, 0, 0, { parent: G }); K.cyl(0.006, 0.006, 0.09, K.std({ color: '#5B3920', roughness: 0.8 }), 0.03, 0.03, 0, { parent: G, rz: PI / 2 - 0.15 }); }
  // the board: the Marins in photographs, pinned, red string between them; a map; a calendar
  K.box(0.03, 1.2, 1.9, K.std({ color: '#A57C52', roughness: 0.95 }), w / 2 - 0.02, 1.0, -0.3); K.box(0.035, 1.26, 1.96, M.walnut, w / 2 - 0.015, 0.97, -0.3, { shadow: false });
  const pins = [[1.6, -0.9], [1.5, -0.2], [1.75, 0.35], [1.25, 0.15], [1.3, -0.65]], pinM = K.std({ color: '#C62828', roughness: 0.3 });
  pins.forEach(([y, z], i) => { K.plane(0.28, 0.21, K.std({ map: K.tex(photo(141 + i, { tone: '#B9A589' })), roughness: 0.8 }), w / 2 - 0.04, y, z, { ry: -PI / 2 }); const pp = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), pinM); pp.position.set(w / 2 - 0.05, y + 0.08, z); K.group.add(pp); });
  for (let i = 0; i < pins.length - 1; i++) { const [y1, z1] = pins[i], [y2, z2] = pins[i + 1], len = Math.hypot(y2 - y1, z2 - z1), s = K.box(0.002, len, 0.003, pinM, w / 2 - 0.052, 0, (z1 + z2) / 2, { shadow: false }); s.position.y = (y1 + y2) / 2 + 0.08; s.rotation.x = -Math.atan2(z2 - z1, y2 - y1); }
  K.plane(0.5, 0.36, K.std({ map: K.tex(lettering(['SLICE MARIN', { t: '12 stores', font: '400 70px Georgia' }], { w: 512, h: 368, bg: '#F3E9D2', fg: '#9B2B2B', font: '700 76px Georgia' })), roughness: 0.8 }), w / 2 - 0.04, 1.05, 0.6, { ry: -PI / 2 });
  // the sofa on the left with a coat thrown on it, the safe in the corner, a coat stand, a filing cabinet, a floor
  // lamp lit, a fern going brown, boxes of files
  K.sofa(-w / 2 + 0.55, 1.0, PI / 2, 2.0, M.oxblood); K.blob(-w / 2 + 0.55, 1.0, 1.2, 2.3, 0.5);
  K.box(0.6, 0.12, 0.7, K.std({ color: '#2A2A2E', roughness: 0.95 }), -w / 2 + 0.6, 0.48, 0.7, { r: 0.05 });
  K.box(0.6, 0.8, 0.6, K.std({ color: '#2B2E30', roughness: 0.35, metalness: 0.6 }), w / 2 - 0.45, 0, -d / 2 + 0.45); K.cyl(0.06, 0.06, 0.03, M.brass, w / 2 - 0.45, 0.45, -d / 2 + 0.76, { rx: PI / 2 });
  K.cabinet(w / 2 - 0.35, 1.6, -PI / 2, 0.5, 1.3); K.floorLamp(-w / 2 + 0.5, -0.3); K.bulb(-w / 2 + 0.5, 1.48, -0.3, 0.035, '#FFD49A', 4);
  coatStand(K, 1.7, 1.9, '#1E1E24');
  K.prop('cardboard-box', w / 2 - 0.5, 0, 2.4, { ry: 0.3 }); K.prop('cardboard-box', w / 2 - 0.45, 0.34, 2.38, { ry: -0.2 }); K.prop('cardboard-box', w / 2 - 1.0, 0, 2.5, { ry: 1.4 });
  K.potted(1.2, -d / 2 + 0.45, 0.9, { pot: '#7A4A30' });
  K.frame(painting(143, ['#2B2B2B', '#8C3B2E', '#C9A66B', '#E8E2D4']), 0.9, 0.7, -w / 2 + 0.03, 2.1, -1.4, PI / 2, M.brass);
  K.clock(-w / 2 + 0.02, 2.4, 0.9, PI / 2); K.plate(-w / 2 + 0.01, 0.3, -0.9, PI / 2);
  K.rug(2.6, 1.9, 0.2, -0.3, '#4A2321', '#B79A6B', 149);
  K.door(1.2, d / 2 - 0.03, PI, K.std({ color: '#3C2A1C', roughness: 0.5 }), { glass: true });
  return {
    light: { sun: { from: [-4, 5.5, -10], to: [0.5, 0, 0.6], ext: 6, k: K.night ? 0.6 : 3.6, color: K.night ? '#8FA6FF' : '#FFE0B0' }, hemi: K.night ? 0.4 : 0.7, windowK: 0.55,
      points: [{ at: [-1.9, 1.15, -1.15], k: 1.3, color: '#FFC982', dist: 4 }, { at: [-w / 2 + 0.5, 1.4, -0.3], k: 1.6, color: '#FFD7A0', dist: 5 }, { at: [-1.3, 1.55, -0.95], k: 1.6, color: '#FFD49A', dist: 4 }] },
    key: 1.3,
    marks: { desk: [-1.3, 1.0, -0.9], board: [w / 2, 1.3, -0.3], window: [0, 1.6, -d / 2] },
  };
}

// the family's pizzeria: a counter, the oven's glow, the menu board, red and white tiles, the street through the front
function pizzeria(K, def) {
  const M = K.mat, w = 7, d = 6.4, h = 3.2, sign = def.sign || 'SLICE MARIN';
  const brick = K.scan('brick', { tint: '#E8D6CC', rough: 0.95, nscale: 1.2 });
  K.room({ w, d, h, floor: K.surf(SURF.checker('#EFE7D6', '#A83232', 10, 153), [3, 3], { roughness: 0.28 }), wall: brick, wallBack: K.scan('plaster', { tint: '#F1E6CF', rough: 0.85, nscale: 0.4, color: false }), ceiling: K.std({ color: '#2A2522', roughness: 0.9 }), crown: null, skirting: K.std({ color: '#2B5E3B', roughness: 0.5 }),
    holes: [{ wall: 'front', x: -1.2, y: 0.5, w: 3.6, h: 2.1 }], panels: false });
  // (white subway tile behind the counter, to shoulder height)
  { const [c, x] = [document.createElement('canvas'), null]; c.width = 512; c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#B9B4AA'; g.fillRect(0, 0, 512, 256); for (let j = 0; j < 8; j++) for (let i = -1; i < 9; i++) { g.fillStyle = '#F4F1EA'; g.fillRect(i * 64 + (j % 2) * 32 + 2, j * 32 + 2, 60, 28); }
    K.box(w - 0.02, 1.5, 0.01, K.std({ map: K.tex(c, [10, 3]), roughness: 0.12 }), 0, 0, -d / 2 + 0.008, { shadow: false }); }
  K.window({ x: 1.2, z: d / 2, y: 0.5, w: 3.6, h: 2.1, ry: PI, city: { seed: 157 }, frameM: K.std({ color: '#2B5E3B', roughness: 0.4 }), mullions: 2, out: 9 });
  // (the window's lettering, from inside: backwards, gold)
  { const t = K.tex(lettering(sign, { w: 1024, h: 160, bg: 'rgba(0,0,0,0)', fg: '#E8C25A', font: '700 110px Georgia, serif' })); t.repeat.x = -1; t.offset.x = 1; K.plane(1.8, 0.28, new THREE.MeshBasicMaterial({ map: t, transparent: true }), -1.2, 2.0, d / 2 - 0.06, { ry: PI }); }
  // the counter across the back, the glass case of whole pies, the till; the ovens behind it, glowing
  const green = K.std({ color: '#2B5E3B', roughness: 0.35 });
  K.box(4.6, 1.0, 0.75, green, -0.4, 0, -1.6); for (let i = 0; i < 6; i++) K.box(0.68, 0.7, 0.01, K.std({ color: '#244F31', roughness: 0.4 }), -2.3 + i * 0.76, 0.15, -1.22, { shadow: false });
  K.box(4.7, 0.05, 0.8, K.surf(SURF.marble(), [2, 1], { roughness: 0.12 }), -0.4, 1.0, -1.6); K.blob(-0.4, -1.4, 5, 1.3, 0.4);
  K.box(1.8, 0.4, 0.6, M.glass, -1.3, 1.05, -1.55, { shadow: false });
  const crust = K.std({ color: '#D9973A', roughness: 0.6 }), sauce = K.std({ color: '#B23A20', roughness: 0.5 }), cheese = K.std({ color: '#F2D27A', roughness: 0.5 });
  for (let i = 0; i < 4; i++) { const x = -2.0 + i * 0.45; K.cyl(0.2, 0.2, 0.02, crust, x, 1.08, -1.55, { seg: 28 }); K.cyl(0.185, 0.185, 0.008, i % 2 ? cheese : sauce, x, 1.1, -1.55, { seg: 28, shadow: false }); for (let k = 0; k < (i % 2 ? 0 : 7); k++) K.cyl(0.022, 0.022, 0.006, K.std({ color: '#8A1F14', roughness: 0.5 }), x + Math.cos(k) * 0.11, 1.106, -1.55 + Math.sin(k) * 0.11, { seg: 10, shadow: false }); }
  K.box(0.35, 0.25, 0.3, M.black, 1.2, 1.05, -1.6); K.box(0.3, 0.02, 0.22, M.screen, 1.2, 1.3, -1.55);
  K.box(0.16, 0.22, 0.16, K.std({ color: '#E8E2D4', roughness: 0.4 }), 0.6, 1.05, -1.4); K.cyl(0.03, 0.03, 0.12, K.std({ color: '#B23A20', roughness: 0.4 }), 0.8, 1.05, -1.35); K.cyl(0.03, 0.03, 0.12, K.std({ color: '#E8C25A', roughness: 0.4 }), 0.88, 1.05, -1.35);
  for (const x of [-1.6, 0.4]) { K.box(1.5, 1.6, 0.9, K.std({ color: '#5B5F63', roughness: 0.25, metalness: 0.75 }), x, 0, -d / 2 + 0.5); K.box(1.1, 0.25, 0.02, K.std({ color: '#1B0A05', emissive: '#FF6A1A', emissiveIntensity: 3 }), x, 0.8, -d / 2 + 0.96, { shadow: false }); K.box(1.3, 0.04, 0.04, M.chrome, x, 1.15, -d / 2 + 0.97); }
  K.cyl(0.25, 0.25, 0.6, K.std({ color: '#7A7E82', roughness: 0.3, metalness: 0.8 }), -0.6, 2.6, -d / 2 + 0.5, { shadow: false });
  K.box(4.2, 0.9, 0.04, K.std({ map: K.tex(lettering([{ t: sign, font: '700 120px Georgia, serif' }, { t: 'CHEESE 3.50 · PEPPERONI 4.00 · THE EGG ONE 5.50', font: '500 44px Arial', fg: '#FFFFFF' }], { w: 2048, h: 440, bg: '#1C1C1C', fg: '#F2C14E', border: '#F2C14E' })), emissive: '#FFFFFF', emissiveMap: K.tex(lettering([{ t: sign, font: '700 120px Georgia, serif' }, { t: 'CHEESE 3.50 · PEPPERONI 4.00 · THE EGG ONE 5.50', font: '500 44px Arial', fg: '#FFFFFF' }], { w: 2048, h: 440, bg: '#1C1C1C', fg: '#F2C14E', border: '#F2C14E' })), emissiveIntensity: 0.55 }), -0.6, 1.9, -d / 2 + 0.03, { shadow: false });
  // the stools at the counter, pendants over it
  for (let i = 0; i < 4; i++) K.prop('bar-stool', -2.0 + i * 0.85, 0, -0.95, { ry: (i * 0.7) % 1 });
  for (const x of [-2.0, -0.4, 1.2]) K.pendant(x, -1.6, 2.05, h, { shadeC: '#B23A20', r: 0.18 });
  // tables and chairs by the window; a fridge of drinks; framed photographs of the family's first store
  for (const [x, z] of [[-2.3, 1.6], [0, 1.9], [2.3, 1.6]]) { K.cyl(0.36, 0.36, 0.03, M.white, x, 0.74, z, { seg: 28 }); K.cyl(0.04, 0.04, 0.74, M.chrome, x, 0, z); K.cyl(0.25, 0.25, 0.02, M.chrome, x, 0, z); K.blob(x, z, 1.4, 1.0, 0.35); for (const s of [-1, 1]) K.chair(x + s * 0.55, z, -s * PI / 2, M.chrome, K.std({ color: '#A83232', roughness: 0.6 }));
    K.cyl(0.035, 0.035, 0.12, K.std({ color: '#E8E2D4', roughness: 0.3, metalness: 0.5 }), x + 0.1, 0.77, z - 0.1); K.cyl(0.025, 0.025, 0.1, K.std({ color: '#C62828', roughness: 0.3 }), x - 0.1, 0.77, z + 0.05); }
  K.box(0.8, 2.0, 0.7, K.std({ color: '#D7DADF', roughness: 0.3, metalness: 0.5 }), w / 2 - 0.5, 0, -0.6); K.box(0.6, 1.5, 0.02, K.std({ color: '#B7E4FF', emissive: '#CDEBFF', emissiveIntensity: 1.2 }), w / 2 - 0.5, 0.3, -0.24, { shadow: false });
  { const r = K.rng(171); for (let s = 0; s < 4; s++) for (let i = 0; i < 6; i++) K.cyl(0.03, 0.03, 0.2, K.std({ color: ['#C62828', '#2E7D32', '#F9A825', '#1565C0'][Math.floor(r() * 4)], roughness: 0.3 }), w / 2 - 0.72 + i * 0.08, 0.38 + s * 0.36, -0.36, { seg: 10, shadow: false }); }
  K.frame(painting(159, ['#F2C14E', '#A83232', '#2B5E3B', '#F1E6CF']), 0.9, 0.6, -w / 2 + 0.03, 2.0, 0.4, PI / 2, M.black);
  K.frame(photo(161, { tone: '#B8A88E' }), 0.4, 0.3, -w / 2 + 0.03, 1.9, 1.5, PI / 2, M.walnut); K.frame(photo(163, { tone: '#CDB99A' }), 0.3, 0.4, -w / 2 + 0.03, 1.95, -0.6, PI / 2, M.walnut);
  K.frame(lettering([{ t: 'OUR FIRST', font: '700 60px Georgia' }, { t: 'DOLLAR', font: '700 60px Georgia' }], { w: 400, h: 300, bg: '#7FA37A', fg: '#F4F1E8' }), 0.26, 0.2, -w / 2 + 0.03, 1.5, 0.9, PI / 2, M.brass);
  K.potted(-w / 2 + 0.45, d / 2 - 0.5, 1.0); K.potted(w / 2 - 0.45, d / 2 - 0.5, 0.9, { pot: '#2B5E3B' });
  K.prop('plastic-crate', w / 2 - 0.4, 0, -2.6, { ry: 0.2 }); K.prop('plastic-crate', w / 2 - 0.42, 0.25, -2.62, { ry: -0.1 });
  K.clock(w / 2 - 0.01, 2.5, 1.2, -PI / 2);
  return {
    light: { sun: { from: [2, 6, 12], to: [0, 0, -1], ext: 7, k: K.night ? 0.3 : 2.6 }, hemi: 0.9,
      points: [-2.0, -0.4, 1.2].map((x) => ({ at: [x, 1.95, -1.6], k: 1.5, color: '#FFD9A0', dist: 4 })).concat([{ at: [-0.6, 0.9, -2.5], k: 2.2, color: '#FF8A3D', dist: 4 }, { at: [0, 2.8, 1.6], k: 1.4, color: '#FFE7C2', dist: 6 }]) },
    marks: { counter: [-0.4, 1.1, -1.6], window: [1.2, 1.5, d / 2] },
  };
}

// an old lady's front room on a walk-up's third floor: flowered paper, a sofa with a throw, her photographs, a lamp,
// lace at the window and the fire escape outside it, a kitchenette through an arch
function apartment(K, def) {
  const M = K.mat, w = 5.6, d = 5.2, h = 2.8;
  const wall = K.surf(SURF.paper('#E6D7B8', '#9C7F5C', 171), [3, 1.5], { roughness: 0.9 });
  K.room({ w, d, h, floor: K.surf(SURF.planks('#8F6340', 173), [2.5, 2.5], { roughness: 0.38 }), wall, ceiling: M.white, skirting: M.white, crown: M.white,
    holes: [{ wall: 'back', x: -1.2, y: 0.8, w: 1.2, h: 1.6 }, { wall: 'back', x: 1.0, y: 0.8, w: 1.2, h: 1.6 }, { wall: 'left', x: -1.3, y: 0, w: 1.4, h: 2.2 }], panels: false });
  const WG = wallG(K, w, d);
  { const G = K.grp(0, 0, 0, 0, WG.front); wainscot(K, G, w - 0.02, 0.85, K.std({ color: '#EFE9DC', roughness: 0.6 }), { panel: 0.8 }); }
  for (const x of [-1.2, 1.0]) {
    K.window({ x, z: -d / 2, y: 0.8, w: 1.2, h: 1.6, city: { seed: 177, tone: '#9A5C44' }, frameM: M.white, mullions: 1, out: 7 });
    // (lace: a pale, see-through curtain each side, gathered; the fire escape's landing outside)
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) K.cyl(0.05, 0.07, 1.95, K.std({ color: '#FFFFFF', transparent: true, opacity: 0.5, roughness: 1, side: THREE.DoubleSide }), x + s * (0.55 + i * 0.06), 0.6, -d / 2 + 0.14 + (i % 2) * 0.03, { shadow: false, seg: 10 });
    K.cyl(0.012, 0.012, 1.6, M.brass, x, 2.58, -d / 2 + 0.16, { rz: PI / 2 });
    K.radiator(x, -d / 2 + 0.12, 0, 0.9);
  }
  K.prop('fire-escape', -0.1, 0.1, -d / 2 - 0.75, { parts: ['modular_fire_escape_platform_middle', 'modular_fire_escape_railing_middle'] });
  K.potted(1.3, -d / 2 + 0.05, 0.55, { y: 0.8 - 0.035, pot: '#C47A5A' });
  // the arch to the kitchenette (left wall): its cupboards, the kettle, the light on in there
  { const G = K.grp(-w / 2 - 1.0, 0, 1.3); const km = K.std({ color: '#F0EBDD', roughness: 0.9 });
    K.box(2.0, 2.6, 0.04, km, 0, 0, -0.75, { parent: G }); K.box(2.0, 2.6, 0.04, km, 0, 0, 0.75, { parent: G }); K.box(0.04, 2.6, 1.5, K.surf(SURF.tiles('#F4F1EA', '#7FA7C6', 6, 175, 0.08), [2, 2]), -0.95, 0, 0, { parent: G });
    K.box(0.6, 0.9, 1.4, K.std({ color: '#7FA37A', roughness: 0.5 }), -0.6, 0, 0, { parent: G }); K.box(0.62, 0.04, 1.44, K.std({ color: '#E8E2D4', roughness: 0.3 }), -0.6, 0.9, 0, { parent: G });
    K.box(0.35, 0.6, 1.4, K.std({ color: '#7FA37A', roughness: 0.5 }), -0.75, 1.5, 0, { parent: G });
    K.cyl(0.08, 0.1, 0.18, K.std({ color: '#C62828', roughness: 0.25, metalness: 0.3 }), -0.6, 0.94, 0.3, { parent: G });
    K.plane(2.0, 1.5, K.std({ color: '#7F6A54', roughness: 0.9 }), 0, 0.001, 0, { parent: G, rx: -PI / 2 });
    K.bulb(-0.3, 2.4, 0, 0.05, '#FFE2B0', 4, G); }
  K.box(0.12, 0.4, 0.1, M.white, -w / 2 + 0.03, 2.2, 1.3 - 0.75, { shadow: false }); K.box(0.12, 0.4, 0.1, M.white, -w / 2 + 0.03, 2.2, 1.3 + 0.75, { shadow: false });
  // her sofa with its throw and cushions, the armchair with its doily, the coffee table: a bowl of hard candies, her glasses
  K.sofa(0, -1.55, 0, 2.1, K.std({ color: '#6E7F5E', roughness: 0.95 })); K.blob(0, -1.55, 2.4, 1.2, 0.5);
  K.box(0.9, 0.04, 0.6, K.std({ color: '#C9B48A', roughness: 1 }), 0.3, 0.62, -1.4, { shadow: false });
  for (const [x, c] of [[-0.75, '#B05A4A'], [0.75, '#E2CFA6']]) { const cu = K.box(0.4, 0.38, 0.14, K.std({ color: c, roughness: 0.95 }), x, 0.55, -1.75, { r: 0.06 }); cu.rotation.x = -0.25; cu.rotation.z = x < 0 ? 0.15 : -0.12; }
  K.armchair(-2.0, -0.2, PI / 2.6, K.std({ color: '#8A4B3C', roughness: 0.95 })); K.blob(-2.0, -0.2, 1.2, 1.2, 0.45);
  K.cyl(0.14, 0.14, 0.004, K.std({ color: '#FFFFFF', roughness: 1 }), -2.05, 1.04, -0.45, { seg: 20, shadow: false });
  K.box(1.0, 0.42, 0.55, M.walnut, 0, 0, -0.4, { r: 0.02 }); K.cyl(0.2, 0.2, 0.004, K.std({ color: '#FFFFFF', roughness: 1 }), 0, 0.42, -0.4, { seg: 24 }); K.blob(0, -0.4, 1.3, 0.8, 0.4);
  K.cyl(0.09, 0.06, 0.06, K.std({ color: '#CFE4EA', transparent: true, opacity: 0.6, roughness: 0.1 }), 0, 0.425, -0.4);
  { const r = K.rng(179); for (let i = 0; i < 9; i++) K.cyl(0.012, 0.012, 0.012, K.std({ color: ['#C62828', '#F9A825', '#2E7D32'][i % 3], roughness: 0.2 }), (r() - 0.5) * 0.08, 0.47, -0.4 + (r() - 0.5) * 0.08, { seg: 8, shadow: false }); }
  { const G = K.grp(0.3, 0.425, -0.32, 0.4); for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.003, 6, 16), M.black); l.position.x = s * 0.025; l.rotation.x = PI / 2; G.add(l); } }
  // the sideboard of photographs, the lamp lit; the clock; a wall of plates; the old television on its stand
  K.box(1.6, 0.85, 0.45, M.walnut, w / 2 - 0.25, 0, -0.6, { ry: -PI / 2 }); K.blob(w / 2 - 0.25, -0.6, 0.7, 1.8, 0.4);
  for (let i = 0; i < 5; i++) { const f = K.frame(photo(181 + i, { tone: i % 2 ? '#CDB99A' : '#B8A88E' }), 0.16, 0.2, w / 2 - 0.3, 1.08, -1.2 + i * 0.3, -PI / 2, i % 2 ? M.brass : M.walnut); f.position.y = 1.08; }
  K.floorLamp(w / 2 - 0.4, -1.8, 1.5); K.bulb(w / 2 - 0.4, 1.38, -1.8, 0.035, '#FFD49A', 4);
  for (let i = 0; i < 5; i++) K.cyl(0.13, 0.13, 0.015, K.std({ color: ['#F2F2F2', '#7FA7C6', '#F2F2F2', '#C47A5A', '#F2F2F2'][i], roughness: 0.25 }), -w / 2 + 0.01, 1.7 + (i % 2) * 0.3, -1.6 + i * 0.4, { rz: PI / 2 });
  K.clock(w / 2 - 0.01, 2.2, 0.8, -PI / 2);
  { const G = K.grp(w / 2 - 0.35, 0, 1.4, -PI / 2); K.box(0.9, 0.55, 0.45, M.walnut, 0, 0, 0, { parent: G }); K.box(0.62, 0.5, 0.48, K.std({ color: '#3A3530', roughness: 0.5 }), 0, 0.55, 0, { parent: G, r: 0.04 }); K.box(0.48, 0.36, 0.01, K.std({ color: '#1A2228', roughness: 0.1, metalness: 0.3 }), -0.04, 0.62, 0.245, { parent: G, shadow: false }); }
  K.bookcase(-w / 2 + 0.18, -1.5, PI / 2, 1.0, 1.7, 187, K.std({ color: '#7A5233', roughness: 0.5 }));
  K.rug(2.6, 1.9, 0, -0.6, '#7A2E2A', '#E2CFA6', 189);
  K.potted(-w / 2 + 0.45, -d / 2 + 0.45, 0.8);
  K.door(1.4, d / 2 - 0.03, PI, K.std({ color: '#7E5A3A', roughness: 0.5 })); K.plate(0.75, 1.15, d / 2 - 0.012, PI, true);
  return {
    light: { sun: { from: [-2.5, 6, -10], to: [0, 0, 0.5], ext: 6, k: K.night ? 0.4 : 2.6 }, hemi: 0.95,
      points: [{ at: [w / 2 - 0.4, 1.3, -1.8], k: 1.6, color: '#FFD49A', dist: 5 }, { at: [0, 2.6, 0.6], k: 1.2, color: '#FFEBD0', dist: 6 }, { at: [-w / 2 - 0.8, 2.3, 1.3], k: 1.2, color: '#FFE2B0', dist: 4 }] },
    marks: { sofa: [0, 0.9, -1.55], window: [0, 1.6, -d / 2], door: [1.4, 1.3, d / 2] },
  };
}

// a working garage off a side street: concrete, a roll-up door open to the day, a car lift, tyres, a tool wall,
// strip lights, a workbench, a car under a cover, drums, crates
function garage(K, def) {
  const M = K.mat, w = 9, d = 9, h = 4.2;
  const wall = K.scan('plaster', { tint: '#B9B4AA', rough: 0.95, nscale: 0.8 });
  K.room({ w, d, h, floor: K.scan('concrete', { tint: '#9A968E', rough: 0.7, tile: 2.6 }), wall, wallBack: K.scan('brick', { tint: '#C8B2A4', nscale: 1.1 }), ceiling: K.std({ color: '#5E5C58', roughness: 1 }), skirting: null, crown: null,
    holes: [{ wall: 'front', x: 0, y: 0, w: 4.4, h: 3.4 }], panels: false, ao: 0.45 });
  // (the ceiling's steel beams and the strip lights hung from them)
  for (let i = -1; i <= 1; i++) K.box(w, 0.3, 0.16, K.std({ color: '#4A4E52', roughness: 0.5, metalness: 0.6 }), 0, h - 0.3, i * 2.8);
  for (let i = 0; i < 3; i++) { K.box(0.2, 0.08, 2.4, K.std({ color: '#C9CBCE', roughness: 0.5, metalness: 0.4 }), -2.6 + i * 2.6, h - 0.55, 0, { shadow: false }); K.box(0.12, 0.03, 2.3, K.std({ color: '#F5F7FF', emissive: '#FFFFFF', emissiveIntensity: 3 }), -2.6 + i * 2.6, h - 0.58, 0, { shadow: false }); }
  // the street outside the door: the pavement, the buildings across it (real blocks), the sky
  K.plane(16, 8, K.scan('asphalt-clean', { tint: '#B8B4AC', rough: 0.85 }), 0, 0.001, d / 2 + 4, { rx: -PI / 2 });
  K.plane(16, 2.4, K.surf(SURF.paving('#9E9A92', 4, 209), [6, 1]), 0, 0.12, d / 2 + 1.2, { rx: -PI / 2 });
  K.block(-4, d / 2 + 13, 12, 8, 16, { ry: PI, style: 'brick', seed: 211, tank: true }); K.block(8, d / 2 + 13, 9, 8, 22, { ry: PI, style: 'stone', seed: 213 });
  K.cityRing({ R: 60, seed: 215 });
  K.prop('door-shutter', 0, 3.25, d / 2 - 0.02, { s: 4.1, parts: null, ry: PI, rx: 0 }).scale.set(4.1, 0.08, 1);
  K.box(4.6, 0.6, 0.12, K.std({ color: '#8E9296', roughness: 0.5, metalness: 0.6 }), 0, 3.4, d / 2 - 0.1);
  K.prop('fire-hydrant', 2.6, 0.12, d / 2 + 1.0, { parts: ['fire_hydrant', 'fire_hydrant_cap_01', 'fire_hydrant_cap_02', 'fire_hydrant_cap_03', 'fire_hydrant_chain'], ry: PI });
  // the lift, its two posts and arms; the car under its cover in the next bay; tyres stacked; a tool wall over the
  // bench; drums; crates; the old sofa where they sit
  const yel = K.std({ color: '#E0B12A', roughness: 0.45, metalness: 0.3 });
  for (const s of [-1, 1]) { K.box(0.3, 3.2, 0.3, yel, -1.8 + s * 1.5, 0, -1.5); K.box(1.0, 0.08, 0.12, M.steel, -1.8 + s * 1.1, 0.25, -1.1); K.box(0.5, 0.06, 0.5, M.steel, -1.8 + s * 1.5, 0, -1.5); }
  K.box(3.3, 0.12, 0.16, yel, -1.8, 3.2, -1.5);
  K.prop('covered-car', 2.4, 0, -0.6, { ry: 0.08 }); K.blob(2.4, -0.6, 2.4, 5, 0.55, 0.08);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - (i % 2); j++) K.prop('old-tyre', w / 2 - 0.5 - i * 0.68 + (j % 2) * 0.04, j * 0.16 + 0.08, -d / 2 + 0.9, { rx: -PI / 2 });
  K.box(3.0, 0.9, 0.7, K.std({ color: '#5B4636', roughness: 0.8 }), 1.4, 0, -d / 2 + 0.45); K.box(3.04, 0.05, 0.74, K.std({ color: '#3A2E24', roughness: 0.6 }), 1.4, 0.9, -d / 2 + 0.45);
  K.box(3.0, 1.3, 0.04, K.std({ color: '#B5A27E', roughness: 0.9 }), 1.4, 1.2, -d / 2 + 0.03);
  const r = K.rng(211); for (let i = 0; i < 26; i++) K.box(0.03 + r() * 0.05, 0.2 + r() * 0.3, 0.03, r() < 0.5 ? M.steel : K.std({ color: r() < 0.5 ? '#B23A20' : '#1F4A8C', roughness: 0.5 }), 0.1 + r() * 2.6, 1.35 + r() * 0.7, -d / 2 + 0.07);
  K.deskLamp(0.4, 0.95, -d / 2 + 0.4); K.bulb(0.4, 1.25, -d / 2 + 0.4, 0.03, '#FFF0D8', 6);
  K.prop('red-drum', -w / 2 + 0.5, 0, 2.2); K.prop('blue-drum', -w / 2 + 0.55, 0, 2.95, { ry: 0.6 }); K.prop('red-drum', -w / 2 + 1.15, 0, 2.6, { ry: 2 });
  K.prop('cardboard-box', -w / 2 + 0.5, 0, -2.6, { ry: 0.2 }); K.prop('cardboard-box', -w / 2 + 0.45, 0.33, -2.62, { ry: -0.3 }); K.prop('plastic-crate', -w / 2 + 1.1, 0, -2.6); K.prop('plastic-crate', -w / 2 + 1.1, 0.25, -2.58, { ry: 0.3 });
  K.sofa(w / 2 - 0.6, 2.2, -PI / 2, 2.0, K.std({ color: '#4E3B2C', roughness: 0.95 })); K.blob(w / 2 - 0.6, 2.2, 1.1, 2.3, 0.5);
  K.prop('plastic-chair', w / 2 - 1.9, 0, 3.0, { ry: -2.2 }); K.prop('plastic-chair', -2.9, 0, 1.0, { ry: 0.9 });
  K.box(1.2, 0.02, 0.8, K.std({ color: '#1A1612', roughness: 0.2, transparent: true, opacity: 0.55 }), -0.3, 0.003, 1.3, { shadow: false });
  K.box(0.8, 0.02, 0.5, K.std({ color: '#1A1612', roughness: 0.25, transparent: true, opacity: 0.4 }), -2.2, 0.003, -1.0, { shadow: false });
  K.clock(-w / 2 + 0.01, 2.8, -0.5, PI / 2);
  return {
    light: { sun: { from: [3, 9, 16], to: [0, 0, 0], ext: 9, k: K.night ? 0.3 : 3.0 }, hemi: 0.9, env: 0.45,
      points: [-2.6, 0, 2.6].map((x) => ({ at: [x, h - 0.7, 0], k: 3.2, color: '#F2F5FF', dist: 7 })).concat([{ at: [0.4, 1.3, -d / 2 + 0.5], k: 0.8, color: '#FFF0D8', dist: 3 }]),
      spots: [{ at: [0, 3.0, d / 2 + 2.5], to: [0, 0.8, 0], k: 30, color: '#E8F0FF', angle: 0.9, pen: 1, dist: 14 }] },
    marks: { door: [0, 1.5, d / 2], lift: [-1.8, 1.4, -1.5] },
  };
}

// a closed exterior: the open air (no ceiling, the sky), paving, real city blocks round it, the towers beyond in a ring,
// street trees and the library's lamp posts between them and the square
function outdoors(K, { w, d, paving, seed = 0, trees = true, blocks = true }) {
  K.plane(w * 3, d * 3, paving, 0, 0, 0, { rx: -PI / 2 });
  // (the roads round the square, the kerbs, the far pavements)
  K.plane(160, 160, K.scan('asphalt-clean', { tint: '#9C9890', rough: 0.85, tile: 3 }), 0, -0.02, 0, { rx: -PI / 2 });
  for (const [x, z, ww, dd] of [[0, -d * 1.5 - 0.2, w * 3 + 0.4, 0.3], [0, d * 1.5 + 0.2, w * 3 + 0.4, 0.3], [-w * 1.5 - 0.2, 0, 0.3, d * 3], [w * 1.5 + 0.2, 0, 0.3, d * 3]]) K.box(ww, 0.14, dd, K.std({ color: '#B8B2A6', roughness: 0.8 }), x, -0.12, z);
  if (blocks) {
    // (the blocks across the roads, all round: brick, stone, a glass one, their shopfronts toward the square)
    const R = Math.max(w, d) * 1.5 + 12, r = K.rng(seed + 11), styles = ['brick', 'stone', 'brick', 'glass', 'cast', 'stone'];
    for (let side = 0; side < 4; side++) {
      const a = (side * PI) / 2;
      for (let k = -2; k <= 2; k++) {
        const bw = 12 + r() * 6, along = k * 17 + (r() - 0.5) * 3, hgt = 14 + r() * 26, st = styles[Math.floor(r() * styles.length)];
        const x = Math.sin(a) * -R + Math.cos(a) * along, z = Math.cos(a) * -R - Math.sin(a) * along;
        K.block(x, z, bw, 10, hgt, { ry: a, style: st, seed: seed + side * 7 + k, tank: r() < 0.3 && hgt < 26 });
      }
    }
  }
  K.cityRing({ R: Math.max(w, d) * 1.5 + 60, seed });
  if (trees) {
    const r = K.rng(seed + 3), crowns = ['#3F6B32', '#4E7A3A', '#5A8442', '#466F36'].map((c) => K.std({ color: c, roughness: 0.85 })), bark = K.std({ color: '#4A3B2E', roughness: 1 });
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * 2 * PI + r() * 0.1, Rr = Math.max(w, d) * 0.95 + r() * 4, x = Math.sin(a) * Rr, z = Math.cos(a) * Rr;
      if (z < -6 && Math.abs(x) < 9) continue;
      tree(K, x, z, 1 + r() * 0.3, r, crowns, bark);
      if (i % 3 === 0) K.prop('street-lamp', x * 0.86, 0, z * 0.86, { ry: a + PI });
    }
  }
}
// a street tree: its trunk and two forks, the crown a cluster of leafy lumps in a few greens (each a squashed
// icosahedron, jittered), a tree pit at its foot
function tree(K, x, z, s, r, crowns, bark) {
  K.cyl(0.13 * s, 0.2 * s, 2.6 * s, bark, x, 0, z);
  for (const k of [-1, 1]) K.cyl(0.06 * s, 0.1 * s, 1.4 * s, bark, x + k * 0.3 * s, 2.4 * s, z, { rz: -k * 0.45 });
  for (let k = 0; k < 9; k++) {
    const g0 = new THREE.IcosahedronGeometry(1, 3); g0.deleteAttribute('normal'); g0.deleteAttribute('uv'); const g = mergeVertices(g0), p = g.attributes.position, ph = r() * 9; g0.dispose();
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), f = 0.86 + 0.1 * Math.sin(x * 5 + ph) * Math.cos(z * 4 + y * 3) + 0.06 * Math.sin(y * 9 + x * 7); p.setXYZ(i, x * f, y * f * 0.78, z * f); }
    g.computeVertexNormals(); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.count * 2), 2));
    const c = new THREE.Mesh(g, crowns[Math.floor(r() * crowns.length)]), sc = (0.9 + r() * 0.7) * s;
    c.scale.setScalar(sc); c.position.set(x + (r() - 0.5) * 2.4 * s, (3.6 + r() * 1.6) * s, z + (r() - 0.5) * 2.4 * s); c.castShadow = true; c.receiveShadow = true; K.group.add(c);
  }
  K.box(1.2, 0.02, 1.2, K.std({ color: '#3A2E22', roughness: 1 }), x, 0, z, { shadow: false });
}
// a granite courthouse's steps: wide steps up to a colonnade, the square at their foot, lamp posts
function steps(K, def) {
  const M = K.mat;
  outdoors(K, { w: 16, d: 16, paving: K.surf(SURF.paving('#8F8A80', 3, 221), [8, 8], { roughness: 0.85 }), seed: 223 });
  const granite = K.scan('concrete', { tint: '#C9C2B4', rough: 0.75, tile: 1.6 }), stone = K.scan('concrete', { tint: '#E4DDD0', rough: 0.7, tile: 1.6 });
  for (let i = 0; i < 9; i++) { K.box(14, 0.16, 0.36, granite, 0, i * 0.16, -2.4 - i * 0.36); K.box(14, 0.02, 0.04, K.std({ color: '#8A847A', roughness: 0.8 }), 0, i * 0.16 + 0.14, -2.4 - i * 0.36 + 0.18, { shadow: false }); }
  K.box(15, 1.44, 6.4, granite, 0, 0, -8.4);
  // the colonnade: fluted columns (their bases and capitals), the entablature, the pediment's face
  const colM = K.std({ color: '#DAD3C5', roughness: 0.7 });
  for (let i = 0; i < 8; i++) { const x = -6.3 + i * 1.8; const c = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 7.2, 20), colM); c.position.set(x, 1.44 + 0.3 + 3.6, -6.4); c.castShadow = c.receiveShadow = true; K.group.add(c); K.box(1.15, 0.3, 1.15, stone, x, 1.44, -6.4); K.box(1.15, 0.3, 1.15, stone, x, 1.44 + 7.5, -6.4); }
  K.box(15, 1.6, 1.3, stone, 0, 8.9, -6.4); K.box(15.4, 0.3, 1.5, stone, 0, 10.5, -6.4);
  { const s = new THREE.Shape(); s.moveTo(-7.7, 0); s.lineTo(7.7, 0); s.lineTo(0, 2.6); s.lineTo(-7.7, 0); const p = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 1.2, bevelEnabled: false }), colM); p.position.set(0, 10.8, -7.0); p.castShadow = true; K.group.add(p); }
  K.box(14, 9, 0.4, K.std({ color: '#A59E91', roughness: 0.8 }), 0, 1.44, -8.4);
  for (const x of [-1.2, 1.2]) { K.box(1.8, 3.4, 0.08, K.std({ color: '#2A2420', roughness: 0.5 }), x, 1.44, -8.15); K.box(0.06, 0.4, 0.06, M.brass, x + (x < 0 ? 0.75 : -0.75), 2.9, -8.08); }
  K.box(5, 0.5, 0.06, K.std({ map: K.tex(lettering('HALL OF JUSTICE', { w: 1024, h: 120, bg: '#CFC8BA', fg: '#5A5248', font: '600 84px Georgia' })), roughness: 0.8 }), 0, 9.3, -5.74, { shadow: false });
  // (the rails down the middle, lamp posts at the foot, benches, a hydrant, planters)
  for (const x of [-0.9, 0.9]) { for (let i = 0; i < 4; i++) K.cyl(0.025, 0.025, 0.9, M.black, x, i * 0.48 + 0.16, -2.4 - i * 1.08); const rl = K.cyl(0.03, 0.03, 4.0, M.black, x, 0, -4.0, { rx: -1.25 }); rl.position.y = 1.55; }
  for (const x of [-4, 4]) K.prop('street-lamp', x, 0, 0.4, { ry: x < 0 ? PI / 2 : -PI / 2 });
  K.prop('street-seating', 5.5, 0, 1.6, { ry: -PI / 2, parts: ['crossbar', 'legs_double', 'legs_single'] });
  K.box(2.0, 0.45, 0.5, M.walnut, -5.5, 0, 2.2); K.blob(-5.5, 2.2, 2.4, 0.9, 0.35);
  K.prop('fire-hydrant', 6.4, 0, 3.4, { parts: ['fire_hydrant', 'fire_hydrant_cap_01', 'fire_hydrant_cap_02', 'fire_hydrant_cap_03', 'fire_hydrant_chain'] });
  for (const x of [-6.5, 6.5]) { K.box(1.4, 0.7, 1.4, granite, x, 0, -1.4); K.potted(x, -1.4, 1.6, { y: 0.32, pot: '#6E6A62', h: 0.4 }); }
  return { light: { sun: { from: [7, 9, 5], to: [0, 0, -2], ext: 11, k: 2.8 }, hemi: 1.0, hemiK: 0.6 }, env: 0.5, marks: { steps: [0, 1.5, -3] } };
}
// a park's paved corner with the stone chess tables under the trees, benches, a low iron fence, the lawns
function park(K, def) {
  const M = K.mat;
  outdoors(K, { w: 16, d: 16, paving: K.surf(SURF.paving('#A39E92', 6, 231), [10, 10], { roughness: 0.9 }), seed: 233, trees: true });
  const grass = K.scan('grass', { tint: '#B8C8A0', rough: 1, tile: 2 });
  for (const [x, z, ww, dd] of [[-9, -6, 6, 6], [9, -6.5, 6, 5], [-9, 6, 5, 6], [9, 6.5, 6, 5]]) { K.plane(ww, dd, grass, x, 0.012, z, { rx: -PI / 2 }); K.box(ww + 0.1, 0.1, 0.08, K.std({ color: '#9C978C', roughness: 0.8 }), x, 0, z - dd / 2); K.box(ww + 0.1, 0.1, 0.08, K.std({ color: '#9C978C', roughness: 0.8 }), x, 0, z + dd / 2); }
  const stone = K.scan('concrete', { tint: '#B4AFA6', rough: 0.75, tile: 1.2 }), board = () => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#8A8478'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#2B2B2B' : '#E6E0D2'; g.fillRect(8 + i * 30, 8 + j * 30, 30, 30); } return c; };
  const bm = K.std({ map: K.tex(board()), roughness: 0.55 });
  for (const [x, z] of [[0, 0], [-3, -1.5], [3, -1.5], [-2.6, 2.4], [2.8, 2.6]]) {
    K.cyl(0.18, 0.25, 0.72, stone, x, 0, z); K.box(0.8, 0.06, 0.8, stone, x, 0.72, z); K.plane(0.5, 0.5, bm, x, 0.785, z, { rx: -PI / 2 }); K.blob(x, z, 1.1, 1.1, 0.4);
    for (const s of [-1, 1]) K.cyl(0.2, 0.22, 0.45, stone, x + s * 0.75, 0, z);
  }
  // (pieces on the middle board, a game on; a clock for it; a paper cup)
  const wp = K.std({ color: '#F2EEE4', roughness: 0.35 }), kp = K.std({ color: '#1A1A1A', roughness: 0.35 }), r = K.rng(235);
  for (let i = 0; i < 18; i++) { const px = (Math.floor(r() * 8) - 3.5) * 0.0586, pz = (Math.floor(r() * 8) - 3.5) * 0.0586, hh = 0.04 + r() * 0.03; K.cyl(0.012, 0.018, hh, i % 2 ? wp : kp, px, 0.785, pz, { seg: 10 }); const hd = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), i % 2 ? wp : kp); hd.position.set(px, 0.785 + hh + 0.008, pz); K.group.add(hd); }
  { const G = K.grp(0.32, 0.755, 0.22, 0.3); K.box(0.16, 0.08, 0.06, M.walnut, 0, 0, 0, { parent: G }); for (const s of [-1, 1]) K.cyl(0.022, 0.022, 0.005, M.white, s * 0.04, 0.05, 0.031, { parent: G, rx: PI / 2, shadow: false }); }
  K.cyl(0.035, 0.03, 0.1, K.std({ color: '#F4F1EA', roughness: 0.7 }), -0.3, 0.755, -0.25);
  // benches with their backs, the fence round the lawns, a bin
  for (const [x, z, ry] of [[-6.5, -0.5, PI / 2], [6.5, -0.5, -PI / 2]]) { const G = K.grp(x, 0, z, ry); for (let i = 0; i < 4; i++) K.box(2.0, 0.035, 0.09, M.wood, 0, 0.42, -0.16 + i * 0.11, { parent: G }); for (let i = 0; i < 3; i++) K.box(2.0, 0.09, 0.03, M.wood, 0, 0.55 + i * 0.12, -0.24, { parent: G }); for (const s of [-1, 1]) K.box(0.06, 0.42, 0.45, M.black, s * 0.85, 0, 0, { parent: G }); K.blob(x, z, 0.9, 2.3, 0.35, ry); }
  for (let i = 0; i < 40; i++) K.cyl(0.012, 0.012, 0.8, M.black, -9 + i * 0.45, 0, -8);
  K.box(18, 0.03, 0.03, M.black, 0, 0.78, -8);
  K.prop('trash-cans', 6.4, 0, 1.6, { parts: ['metal_trash_can'] });
  return { light: { sun: { from: [5, 11, -4], to: [0, 0, 0], ext: 10, k: 2.8 }, hemi: 1.0, hemiK: 0.6 }, env: 0.5, marks: { table: [0, 0.8, 0] } };
}
// a glass tower's lobby: polished stone, a long desk, the glass wall to the street, steel lift doors, a big canvas
function lobby(K, def) {
  const M = K.mat, w = 12, d = 9, h = 5.5;
  const stone = K.surf(SURF.marble('#E4E0D8', '#8F887D', 241), [4, 3], { roughness: 0.08, metalness: 0.05 }); stone.envMapIntensity = 1.4;
  K.room({ w, d, h, floor: stone, wall: K.surf(SURF.marble('#968E82', '#6E665A', 243), [3, 1.5], { roughness: 0.45 }), ceiling: K.std({ color: '#ECECEA', roughness: 0.8 }), skirting: null, crown: null,
    holes: [{ wall: 'back', x: 0, y: 0, w: 11.8, h: 5.3 }], panels: false });
  // (the ceiling's slots of light, warm)
  for (let i = 0; i < 4; i++) K.box(w - 1, 0.02, 0.12, M.panel, 0, h - 0.02, -3 + i * 2, { shadow: false });
  K.window({ x: 0, z: -d / 2, y: 0, w: 11.8, h: 5.3, city: { seed: 245, tone: '#C7BBA9' }, frameM: K.std({ color: '#2A2D31', roughness: 0.35, metalness: 0.7 }), mullions: 5, out: 14, sill: false });
  // (the street beyond the glass: its pavement, a lamp post, a planter)
  K.plane(16, 10, K.surf(SURF.paving('#B2ADA2', 5, 247), [6, 4]), 0, -0.01, -d / 2 - 5, { rx: -PI / 2 });
  K.prop('street-lamp', -3.5, 0, -d / 2 - 4, { ry: PI }); K.prop('street-lamp', 4.5, 0, -d / 2 - 4, { ry: PI });
  // the desk, its stone top, a screen, a lamp, a vase of flowers
  K.box(4.2, 1.1, 0.8, K.std({ color: '#2A2420', roughness: 0.3 }), 2.5, 0, 0.8, { r: 0.03 }); K.box(4.3, 0.04, 0.9, K.surf(SURF.marble('#F2EFE9', '#9A9285', 247), [2, 1], { roughness: 0.1 }), 2.5, 1.1, 0.8);
  K.box(4.0, 0.04, 0.01, K.std({ color: '#FFE2B0', emissive: '#FFD49A', emissiveIntensity: 2 }), 2.5, 0.05, 1.205, { shadow: false }); K.blob(2.5, 0.8, 4.8, 1.4, 0.45);
  K.monitor(2.0, 1.14, 1.0, PI); K.deskLamp(3.8, 1.14, 0.9, K.std({ color: '#E8E2D4', roughness: 0.5 })); K.bulb(3.8, 1.44, 0.9, 0.03, '#FFE2B0', 5);
  { const G = K.grp(1.2, 1.14, 0.75); K.cyl(0.06, 0.05, 0.25, K.std({ color: '#DDE8EE', roughness: 0.05, transparent: true, opacity: 0.4 }), 0, 0, 0, { parent: G }); const r = K.rng(251); for (let i = 0; i < 9; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), K.std({ color: ['#F2F2F2', '#E8A0B0', '#F9D56E'][i % 3], roughness: 0.8 })); s.position.set((r() - 0.5) * 0.18, 0.32 + r() * 0.12, (r() - 0.5) * 0.18); G.add(s); } }
  // the lifts: steel doors in stone surrounds, their lit call buttons
  for (let i = 0; i < 3; i++) { const z = -2 + i * 2.0; K.box(1.3, 2.6, 0.06, M.steel, -w / 2 + 0.04, 0, z, { ry: PI / 2 }); K.box(0.02, 2.6, 0.02, M.black, -w / 2 + 0.08, 0, z); K.box(0.12, 3.0, 1.7, K.std({ color: '#3A3632', roughness: 0.2 }), -w / 2 + 0.05, 0, z, { shadow: false }); K.box(0.02, 0.12, 0.06, K.std({ color: '#FFFFFF', emissive: '#FFE2B0', emissiveIntensity: 2 }), -w / 2 + 0.1, 1.15, z + 0.85, { shadow: false }); }
  K.frame(painting(249, ['#1F3A5F', '#E8E2D4', '#C9A66B', '#5A1F1A']), 3.2, 2.2, w / 2 - 0.03, 3.4, 0.5, -PI / 2, M.black);
  // the seating: lounge chairs round low tables, a long leather bench by the glass, ferns in tall planters
  K.prop('lounge-chair', -2.6, 0, 2.4, { ry: PI - 0.4 }); K.prop('lounge-chair', -0.6, 0, 2.6, { ry: PI + 0.4 }); K.prop('coffee-table', -1.6, 0, 1.6, { s: 0.75 });
  K.blob(-1.6, 2.2, 3.2, 2.2, 0.35);
  K.box(3.0, 0.42, 0.6, M.leather, -3.2, 0, -3.4, { r: 0.04 }); K.box(3.0, 0.42, 0.6, M.leather, 2.6, 0, -3.4, { r: 0.04 });
  for (const [x, z] of [[-4.8, -3.6], [4.8, -3.6], [-5.2, 3.6], [5.2, 3.2]]) K.potted(x, z, 1.4, { pot: '#2A2A2A', h: 0.7 });
  return {
    light: { sun: { from: [-5, 9, -14], to: [0, 0, 1], ext: 10, k: K.night ? 0.3 : 3.0 }, hemi: 0.75, windowK: 0.25,
      points: [[-3, 0], [0, 0], [3, 0]].map(([x, z]) => ({ at: [x, h - 0.4, z], k: 1.1, color: '#FFF0DA', dist: 8 })).concat([{ at: [3.8, 1.5, 0.9], k: 0.8, color: '#FFE2B0', dist: 3 }]) },
    marks: { desk: [2.5, 1.2, 0.8], glass: [0, 2, -d / 2] },
  };
}
// a plaza: travertine paving, a round fountain, a long low building's glass front behind, lamp standards, cafe tables
function plaza(K, def) {
  const M = K.mat;
  outdoors(K, { w: 18, d: 18, paving: K.surf(SURF.paving('#D9D0BC', 4, 261), [10, 10], { roughness: 0.6 }), seed: 263 });
  const trav = K.scan('concrete', { tint: '#F0E6D2', rough: 0.55, tile: 1.4 });
  K.cyl(4.0, 4.0, 0.5, trav, 0, 0, -5.5, { seg: 64 }); K.cyl(4.15, 4.15, 0.08, trav, 0, 0.5, -5.5, { seg: 64 });
  const water = K.std({ color: '#3C6E86', roughness: 0.02, metalness: 0.3, emissive: '#1D3C55', emissiveIntensity: 0.15 }); water.envMapIntensity = 1.6;
  K.cyl(3.75, 3.75, 0.02, water, 0, 0.46, -5.5, { seg: 64 });
  K.cyl(0.7, 0.9, 0.9, trav, 0, 0.46, -5.5, { seg: 32 }); K.cyl(1.2, 0.6, 0.12, trav, 0, 1.36, -5.5, { seg: 32 });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * 2 * PI; K.cyl(0.03, 0.06, 1.2 + (i % 3) * 0.5, K.std({ color: '#EAF4FF', transparent: true, opacity: 0.45, roughness: 0.05, emissive: '#FFFFFF', emissiveIntensity: 0.15 }), Math.cos(a) * 2.2, 0.48, -5.5 + Math.sin(a) * 2.2, { shadow: false }); }
  K.cyl(0.05, 0.12, 1.4, K.std({ color: '#EAF4FF', transparent: true, opacity: 0.5, roughness: 0.05, emissive: '#FFFFFF', emissiveIntensity: 0.2 }), 0, 1.48, -5.5, { shadow: false });
  // the long low building behind: its stone, its glass front between piers, the canopy
  K.box(26, 7, 0.6, K.std({ color: '#D2C9B4', roughness: 0.6 }), 0, 0, -13.2);
  for (let i = 0; i < 12; i++) { K.box(1.6, 5.6, 0.05, K.std({ color: '#7F95A6', roughness: 0.05, metalness: 0.5, emissive: K.night ? '#FFD38A' : '#000000', emissiveIntensity: K.night ? 0.8 : 0 }), -11 + i * 2, 0.4, -12.85); K.box(0.4, 7, 0.7, K.std({ color: '#E2D9C4', roughness: 0.6 }), -12 + i * 2, 0, -12.9); }
  K.box(26, 0.3, 2.2, K.std({ color: '#3A3A3C', roughness: 0.4, metalness: 0.5 }), 0, 6.0, -12);
  for (const x of [-6, 6]) for (const z of [-1, 4]) K.prop('street-lamp', x, 0, z, { ry: x < 0 ? PI / 2 : -PI / 2 });
  // (the cafe's tables out on the paving, planters of ferns, a bench)
  for (const [x, z, ry] of [[-6.5, -3, 0.3], [-4.6, -2.0, -0.5], [6.0, -2.4, 0.8]]) { K.prop('cafe-set', x, 0, z, { ry }); K.blob(x, z, 1.8, 1.8, 0.35); }
  for (const x of [-9, -3.5, 3.5, 9]) { K.box(1.4, 0.6, 1.4, trav, x, 0, 2.8); K.potted(x, 2.8, 1.5, { y: 0.28, pot: '#C9C0AA', h: 0.35 }); }
  K.prop('street-seating', 4.5, 0, 0.8, { ry: PI, parts: ['crossbar', 'legs_double', 'legs_single'] });
  K.prop('fire-hydrant', -8.6, 0, 7.4, { parts: ['fire_hydrant', 'fire_hydrant_cap_01', 'fire_hydrant_cap_02', 'fire_hydrant_cap_03', 'fire_hydrant_chain'] });
  return { light: { sun: { from: [-8, 7, 4], to: [0, 0, -2], ext: 12, k: 2.8 }, hemi: 1.0, hemiK: 0.6 }, env: 0.5, marks: { fountain: [0, 1, -5.5] } };
}
// a side street at night by a steel door left open: brick walls, a fire escape, a caged lamp over the door, the
// stairwell's warm light spilling out of it onto the wet pavement, a dumpster, bins, the street's light from the corner
function alley(K, def) {
  const M = K.mat;
  const brick = K.scan('brick', { tint: '#B8A296', rough: 0.9, nscale: 1.3 });
  const wet = K.scan('asphalt-clean', { tint: '#8E8A84', rough: K.night ? 0.25 : 0.8, tile: 2.1, env: 1.4 });
  K.plane(16, 18, wet, 0, 0, 0, { rx: -PI / 2, ox: -8, oy: -9 });
  // (puddles: darker, glassier patches)
  for (const [x, z, s] of [[1.6, -1.2, 1.4], [-0.8, 1.6, 2.0], [2.6, 2.4, 1.1]]) { const pm = K.std({ color: '#2A2C30', roughness: 0.02, metalness: 0.2, transparent: true, opacity: 0.55 }); pm.envMapIntensity = 2; const p = K.plane(s, s * 0.6, pm, x, 0.004, z, { rx: -PI / 2 }); p.rotation.z = s; }
  // (the walls: the building with the door at the back, cut round the door; the next one on the left; the street open
  // to the right and the front)
  const dx = 0.6, dw = 1.1, dh = 2.2, a = dx - dw / 2, b = dx + dw / 2;
  K.plane(a + 8, 12, brick, (a - 8) / 2, 6, -3.2, { ox: -8, oy: 0 }); K.plane(8 - b, 12, brick, (b + 8) / 2, 6, -3.2, { ox: b, oy: 0 }); K.plane(dw, 12 - dh, brick, dx, (12 + dh) / 2, -3.2, { ox: a, oy: dh });
  K.plane(18, 12, brick, -4.2, 6, 0, { ry: PI / 2, ox: -9 });
  // (the walls' foot, damp and dark; a stone sill course)
  for (const [len, x, z, ry] of [[16, 0, -3.18, 0], [18, -4.18, 0, PI / 2]]) { K.box(len, 0.45, 0.02, K.std({ color: '#2A2220', roughness: 0.6, transparent: true, opacity: 0.55 }), x, 0, z, { ry, shadow: false }); K.box(len, 0.12, 0.06, K.std({ color: '#5A5650', roughness: 0.8 }), x, 3.1, z, { ry, shadow: false }); }
  // the door: its frame, the leaf swung open, the stairwell behind it (green walls, a flight going up, its light)
  K.box(dw + 0.24, 0.12, 0.3, M.steel, dx, dh, -3.2);
  for (const s of [-1, 1]) K.box(0.12, dh, 0.3, M.steel, dx + s * (dw / 2 + 0.06), 0, -3.2);
  { const leaf = K.box(dw, dh - 0.02, 0.06, K.std({ color: '#3E4A4F', roughness: 0.45, metalness: 0.6 }), 0, 0, 0, { parent: K.grp(dx + dw / 2, 0, -3.15, -1.9) }); leaf.position.x = -dw / 2; }
  const SW = K.grp(dx, 0, -3.2);
  const green = K.std({ color: '#7E9A7E', roughness: 0.8 });
  K.box(2.2, 3.4, 0.05, green, 0, 0, -2.4, { parent: SW }); K.box(0.05, 3.4, 2.4, green, -1.1, 0, -1.2, { parent: SW }); K.box(0.05, 3.4, 2.4, green, 1.1, 0, -1.2, { parent: SW });
  K.box(2.2, 0.02, 2.4, K.std({ color: '#5D5A55', roughness: 0.8 }), 0, 0.001, -1.2, { parent: SW });
  for (let i = 0; i < 8; i++) { K.box(1.0, 0.18, 0.28, K.std({ color: '#6E6A64', roughness: 0.8 }), 0.45, i * 0.18, -0.6 - i * 0.24, { parent: SW }); K.box(1.0, 0.02, 0.04, K.std({ color: '#B8A24A', roughness: 0.5 }), 0.45, i * 0.18 + 0.17, -0.48 - i * 0.24, { parent: SW, shadow: false }); }
  K.cyl(0.03, 0.03, 1.4, M.black, -0.05, 0.9, -1.4, { parent: SW, rx: 0.64 });
  K.box(0.3, 0.06, 0.3, K.std({ color: '#FFF4D8', emissive: '#FFE2A8', emissiveIntensity: 4 }), 0, 3.2, -1.2, { parent: SW, shadow: false });
  // the lamp over the door (the library's wall lantern), a sign: NO PARKING; the fire escape up the wall; the drain
  // pipe; the dumpster; bins; boxes and crates by the door
  K.prop('wall-lantern', dx, dh + 0.55, -3.19, { s: 0.7 }); K.bulb(dx, dh + 0.48, -2.82, 0.04, '#FFD890', 14);
  K.prop('fire-escape', -1.8, 3.0, -2.55, { parts: ['modular_fire_escape_platform_bottom', 'modular_fire_escape_railing_bottom'] });
  K.prop('fire-escape', -1.8, 6.2, -2.55, { parts: ['modular_fire_escape_platform_middle', 'modular_fire_escape_railing_middle'] });
  for (let i = 0; i < 9; i++) K.prop('drainpipes', 3.4, i * 1.0, -3.12, { parts: ['modular_metal_gutter_section'] });
  K.box(1.9, 1.2, 1.1, K.std({ color: '#2F5D3A', roughness: 0.55, metalness: 0.4 }), -2.8, 0, 1.6, { r: 0.03 }); K.box(2.0, 0.08, 1.2, K.std({ color: '#244A2E', roughness: 0.5, metalness: 0.4 }), -2.8, 1.2, 1.6); K.blob(-2.8, 1.6, 2.4, 1.6, 0.6);
  K.prop('trash-cans', -1.2, 0, 2.6, { parts: ['metal_trash_can', 'metal_trash_can_lid'] }).children; K.prop('trash-cans', -0.5, 0, 2.9, { parts: ['metal_trash_can_rust'], ry: 0.6 });
  for (let i = 0; i < 3; i++) K.box(0.5, 0.5, 0.45, K.std({ color: '#141414', roughness: 0.25 }), -1.9 + i * 0.4, 0, 3.0 + (i % 2) * 0.3, { r: 0.18 });
  K.prop('cardboard-box', 2.0, 0, -2.6, { ry: 0.4 }); K.prop('cardboard-box', 2.05, 0.33, -2.62, { ry: -0.2 }); K.prop('plastic-crate', 2.7, 0, -2.7, { ry: 0.1 });
  K.box(0.6, 0.3, 0.02, K.std({ map: K.tex(lettering('NO PARKING', { w: 512, h: 160, bg: '#F2F2F2', fg: '#C62828', font: '700 80px Arial' })) }), 2.2, 2.0, -3.17);
  // the street beyond: the far side's buildings lit (real blocks), the towers' ring, a street lamp
  K.block(16, 6, 10, 18, 22, { ry: -PI / 2, style: 'brick', seed: 277 }); K.block(6, 22, 14, 10, 18, { ry: PI, style: 'stone', seed: 279 }); K.block(-8, 22, 12, 10, 26, { ry: PI, style: 'brick', seed: 281, tank: true });
  K.cityRing({ R: 70, seed: 283 });
  K.prop('street-lamp', 4.6, 0, 3.6, { ry: -PI / 2 }); K.bulb(4.25, 3.75, 3.6, 0.07, '#E8EEFF', 10);
  return {
    sky: '#0A0E1C',
    light: { sun: { from: [6, 10, 8], to: [0, 0, -1], ext: 8, k: 0.35, color: '#8FA6FF' }, hemi: 0.45, hemiK: 0.8, sky: '#3A4C80', ground: '#2A2018', rects: 0,
      points: [{ at: [dx, 2.3, -4.4], k: 9, color: '#FFD9A0', dist: 9, shadow: true }, { at: [dx, dh + 0.45, -2.75], k: 4.5, color: '#FFD890', dist: 7 }],
      spots: [{ at: [4.3, 3.8, 3.6], to: [0.4, 0, -1.2], k: 60, color: '#DCE6FF', angle: 0.8, pen: 0.7, dist: 22, shadow: true }] },
    key: 2.4, rim: 1.3, env: 0.15,
    marks: { door: [dx, 1.1, -3.2] },
  };
}

export const ROOMS = { 'bank-office': bankOffice, school, hideout, pizzeria, apartment, garage, steps, park, lobby, plaza, alley };
