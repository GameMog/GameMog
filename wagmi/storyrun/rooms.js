// Mog City story runner: the sets' rooms (sets.js stages a world's cutscenes in them; setkit.js builds them). Each one is
// a function of the kit and the set's own def, returning { light, marks, key, env }: its sun (through its windows),
// its practicals, and named marks. Laid out round x 0 z 0, the windows (or the open side) at -z, the way in at +z.
// Generic places a story can be in (nothing in them is a real place, brand or person; the lettering is the story's own
// words when the set gives it: def.sign).
import * as THREE from 'three/webgpu';
import { SURF, view, lettering, drawing, photo, painting } from './setkit.js';

const PI = Math.PI;

// a bank's private office, high up downtown: walnut and a blue-grey carpet, the towers through the blinds
function bankOffice(K, def) {
  const M = K.mat, w = 6.4, d = 5.6, h = 3.0;
  const wall = K.surf(SURF.paint('#B9AE9A'), [3, 1.5], { roughness: 0.85 });
  K.room({ w, d, h, floor: K.surf(SURF.carpet('#46505E'), [4, 4], { roughness: 1 }), wall, wainscot: M.walnut,
    holes: [{ wall: 'back', x: -1.45, y: 0.75, w: 1.7, h: 1.95 }, { wall: 'back', x: 1.45, y: 0.75, w: 1.7, h: 1.95 }], lightsAt: [[-1.6, 0], [1.6, 0]] });
  // (panelling to the dado: walnut boards)
  for (const [len, x, z, ry] of [[d, -w / 2 + 0.01, 0, PI / 2], [d, w / 2 - 0.01, 0, -PI / 2], [w, 0, d / 2 - 0.01, PI]]) K.box(len, 0.9, 0.012, M.walnut, x, 0, z, { ry, shadow: false });
  const v = view({ night: K.night, golden: K.golden, seed: 61 });
  for (const x of [-1.45, 1.45]) K.window({ x, z: -d / 2, y: 0.75, w: 1.7, h: 1.95, view: v, blinds: 0.32, frameM: M.offwhite, mullions: 1, out: 5 });
  K.desk(0, -0.95, PI, 1.9, 0.9, M.walnut);
  K.officeChair(0, -1.85, 0, M.leather);
  K.chair(-0.6, 0.2, PI, M.walnut, M.oxblood); K.chair(0.6, 0.2, PI, M.walnut, M.oxblood);
  K.monitor(0.55, 0.76, -1.15, PI + 0.35); K.deskLamp(-0.75, 0.76, -1.2); K.papers(-0.15, 0.765, -0.85, 3);
  { const p = K.box(0.3, 0.07, 0.06, M.brass, 0.1, 0.765, -0.55, { r: 0.01 }); p.rotation.y = 0.05; }
  // (the credenza under the windows: photographs, a clock, a plant)
  K.box(2.6, 0.72, 0.5, M.walnut, 0, 0, -d / 2 + 0.3);
  K.frame(photo(71), 0.24, 0.18, -0.8, 0.96, -d / 2 + 0.32, 0, M.brass); K.frame(photo(73), 0.2, 0.26, 0.7, 1.02, -d / 2 + 0.32, 0, M.black);
  K.plant(0, -d / 2 + 0.32, 0.55, 75).position.y = 0.72;
  K.bookcase(-w / 2 + 0.18, -1.3, PI / 2, 1.3, 2.2, 81); K.bookcase(-w / 2 + 0.18, 0.05, PI / 2, 1.3, 2.2, 89);
  K.frame(painting(91), 1.3, 0.95, w / 2 - 0.03, 2.15, -0.6, -PI / 2, M.black);
  K.frame(painting(93, ['#2F4858', '#86BBD8', '#F6AE2D', '#F26419']), 0.7, 0.9, w / 2 - 0.03, 2.05, 1.1, -PI / 2, M.black);
  K.plant(w / 2 - 0.45, -d / 2 + 0.45, 1.1, 95); K.plant(-w / 2 + 0.45, d / 2 - 0.5, 1.0, 97);
  K.door(1.9, d / 2 - 0.03, PI); K.cabinet(-1.2, d / 2 - 0.35, PI, 0.9, 1.0, K.std({ color: '#4A3020', roughness: 0.45 }));
  // (the wall behind a visitor: his framed papers, a print of the harbour, a coat stand, a lamp on the cabinet)
  const dip = (t, sd) => lettering([{ t: 'CERTIFICATE', font: '700 64px Georgia' }, { t, font: 'italic 44px Georgia' }, { t: '· · ·', font: '400 40px Georgia' }], { w: 512, h: 384, bg: '#F3EEDF', fg: '#3A3022', border: '#B68A3E' });
  K.frame(dip('of Banking Practice', 1), 0.42, 0.32, -0.55, 1.95, d / 2 - 0.03, PI, M.black); K.frame(dip('in Credit Risk', 2), 0.42, 0.32, 0.05, 1.95, d / 2 - 0.03, PI, M.black);
  K.frame(painting(87, ['#24384F', '#8FA9BF', '#E8E2D4', '#C9A66B']), 1.1, 0.7, -2.0, 1.9, d / 2 - 0.03, PI, M.walnut);
  K.deskLamp(-1.4, 1.0, d / 2 - 0.35, K.std({ color: '#E8DFC8', roughness: 0.6 }));
  { const G = K.grp(0.8, 0, d / 2 - 0.35); K.cyl(0.02, 0.02, 1.75, M.walnut, 0, 0, 0, { parent: G }); K.cyl(0.2, 0.22, 0.03, M.walnut, 0, 0, 0, { parent: G }); K.box(0.45, 0.85, 0.22, K.std({ color: '#2A2E36', roughness: 0.85 }), 0.05, 0.9, 0.05, { parent: G, r: 0.06 }); }
  K.rug(3.2, 2.4, 0, -0.5, '#2F3B4E', '#C8B98F', 99);
  return {
    light: { sun: { from: [3.5, 7, -9], to: [0, 0, 0.5], ext: 6 }, points: [{ at: [-1.6, 2.7, 0], k: 3.5, color: '#FFF3E0' }, { at: [1.6, 2.7, 0], k: 3.5, color: '#FFF3E0' }, { at: [-0.75, 1.3, -1.2], k: 1.2, color: '#FFD9A0', dist: 4 }] },
    marks: { desk: [0, 1.0, -0.95], door: [1.9, 1.2, d / 2], window: [0, 1.6, -d / 2] },
  };
}

// a grade school's corridor by the front office: cubbies and lockers, the children's drawings, the doors to the yard
function school(K, def) {
  const M = K.mat, w = 4.2, d = 13, h = 3.1;
  const lower = K.surf(SURF.paint('#8DB5CC'), [4, 1]), upper = K.surf(SURF.paint('#E6DCC4'), [4, 1]);
  K.room({ w, d, h, floor: K.surf(SURF.tiles('#E3DDCF', '#7FA7C6', 10, 101, 0.16), [3, 9], { roughness: 0.35 }), wall: upper, wallBack: upper, wainscot: M.oak,
    holes: [{ wall: 'back', x: 0, y: 0, w: 1.9, h: 2.3 }, { wall: 'right', x: -3.2, y: 0.95, w: 2.2, h: 1.25 }], lightsAt: [[0, -5], [0, -2], [0, 1], [0, 4]] });
  // (the lower half of the walls painted blue, to the dado)
  for (const [len, x, z, ry] of [[d, -w / 2 + 0.008, 0, PI / 2], [d, w / 2 - 0.008, 0, -PI / 2]]) K.box(len, 0.9, 0.006, lower, x, 0, z, { ry, shadow: false });
  // the doors to the yard at the far end, their glass full of the day; EXIT over them
  const yard = view({ night: K.night, golden: K.golden, seed: 103, near: '#C8B49A', street: true });
  K.window({ x: 0, z: -d / 2, y: 0, w: 1.9, h: 2.3, view: yard, frameM: K.std({ color: '#2E4C6D', roughness: 0.4 }), mullions: 1, out: 6 });
  K.box(0.5, 0.18, 0.06, K.std({ map: K.tex(lettering('EXIT', { w: 256, h: 96, bg: '#1A1A1A', fg: '#FF3B30', font: '700 72px Arial' })), emissive: '#FF2A1F', emissiveIntensity: 0.4 }), 0, 2.45, -d / 2 + 0.05);
  // the cubbies down the left wall: a hook and a cubby each, coats and backpacks in some
  const cub = K.std({ color: '#C79A5B', roughness: 0.55 }), packs = ['#E53935', '#1E88E5', '#43A047', '#FDD835', '#8E24AA', '#FB8C00'], r = K.rng(107);
  for (let i = 0; i < 9; i++) {
    const z = -5.2 + i * 0.62;
    K.box(0.4, 1.5, 0.02, cub, -w / 2 + 0.2, 0, z - 0.3, { ry: 0 }); K.box(0.4, 0.02, 0.6, cub, -w / 2 + 0.2, 0.35, z); K.box(0.4, 0.02, 0.6, cub, -w / 2 + 0.2, 1.5, z);
    K.cyl(0.012, 0.012, 0.09, M.chrome, -w / 2 + 0.08, 1.25, z, { rz: PI / 2 });
    if (r() < 0.7) K.box(0.22, 0.32, 0.28, K.std({ color: packs[Math.floor(r() * 6)], roughness: 0.8 }), -w / 2 + 0.2, 0.37, z, { r: 0.05 });
    if (r() < 0.5) K.box(0.08, 0.5, 0.36, K.std({ color: packs[Math.floor(r() * 6)], roughness: 0.95 }), -w / 2 + 0.12, 0.85, z, { r: 0.04 });
  }
  K.box(0.4, 1.5, 0.02, cub, -w / 2 + 0.2, 0, 0.68);
  // lockers on the left past them, toward the way in
  for (let i = 0; i < 8; i++) { const z = 1.4 + i * 0.4; K.box(0.45, 1.8, 0.38, K.std({ color: i % 2 ? '#3E6E8E' : '#3A688A', roughness: 0.45, metalness: 0.35 }), -w / 2 + 0.23, 0, z); K.box(0.03, 0.12, 0.02, M.chrome, -w / 2 + 0.46, 1.0, z + 0.12); }
  // the children's drawings on a cork board on the right, FIRST GRADE over it
  const cork = K.std({ color: '#B88B5A', roughness: 0.95 });
  K.box(0.03, 1.1, 3.6, cork, w / 2 - 0.02, 1.05, 1.5);
  K.box(0.02, 0.22, 1.4, K.std({ map: K.tex(lettering('FIRST GRADE', { w: 1024, h: 160, bg: '#FFFFFF', fg: '#1E88E5', font: '700 110px Arial Rounded MT Bold, Arial' })) }), w / 2 - 0.04, 2.25, 1.5);
  for (let i = 0; i < 10; i++) { const p = K.plane(0.36, 0.28, K.std({ map: K.tex(drawing(111 + i)), roughness: 0.9 }), w / 2 - 0.045, 1.25 + (i % 2) * 0.42 + (r() - 0.5) * 0.06, 0.1 + Math.floor(i / 2) * 0.62, { ry: -PI / 2 }); p.rotation.z = (r() - 0.5) * 0.12; }
  // the front office's window and its counter, a bell on it, MAIN OFFICE over it
  K.box(0.5, 0.06, 2.3, M.oak, w / 2 - 0.2, 0.92, -3.2);
  K.box(0.04, 1.25, 2.2, M.glass, w / 2 - 0.02, 0.95, -3.2, { shadow: false });
  K.box(0.02, 0.2, 1.2, K.std({ map: K.tex(lettering('MAIN OFFICE', { w: 1024, h: 170, bg: '#2E4C6D', fg: '#FFFFFF', font: '700 100px Arial' })) }), w / 2 - 0.03, 2.38, -3.2);
  K.cyl(0.04, 0.05, 0.05, M.brass, w / 2 - 0.25, 0.98, -2.6);
  // (behind the glass: a desk, a lamp, a plant, the wall of the office)
  K.box(1.6, 2.4, 0.05, K.surf(SURF.paint('#E8E1CF'), [1, 1]), w / 2 + 1.4, 0, -3.2, { ry: PI / 2 });
  K.desk(w / 2 + 0.8, -3.2, -PI / 2, 1.4, 0.7, M.oak, { pedestals: false }); K.plant(w / 2 + 0.6, -4.1, 0.8, 113);
  // a bench, a fire extinguisher, a clock
  K.box(1.6, 0.42, 0.4, M.oak, w / 2 - 0.25, 0, 4.5); K.cyl(0.08, 0.08, 0.45, K.std({ color: '#C62828', roughness: 0.4 }), -w / 2 + 0.12, 0.9, -5.7);
  K.cyl(0.18, 0.18, 0.04, K.std({ color: '#FFFFFF', roughness: 0.5 }), w / 2 - 0.03, 2.55, -1.2, { rz: PI / 2 });
  return {
    light: { sun: { from: [-1, 7, -16], to: [0, 0, -2], ext: 9, k: 2.4 }, hemi: 0.8, points: [[0, -5], [0, -2], [0, 1], [0, 4]].map(([x, z]) => ({ at: [x, 2.85, z], k: 3, color: '#F4F6FF' })) },
    marks: { doors: [0, 1.2, -d / 2], office: [w / 2, 1.2, -3.2] },
  };
}

// an old office over a shop uptown, the man's own: dark boards, olive walls, the blinds down and the sun through them
// in stripes, a desk, a leather chair, his board of photographs (the family he is after), a safe, a sofa
function hideout(K, def) {
  const M = K.mat, w = 6.2, d = 5.6, h = 3.3;
  const wall = K.surf(SURF.paper('#7B7A5E', '#4E4C36', 131, false), [4, 2], { roughness: 0.9 });
  K.room({ w, d, h, floor: K.surf(SURF.planks('#5A3B26', 133), [3, 3], { roughness: 0.55 }), wall, ceiling: K.std({ color: '#C9C1AE', roughness: 0.9 }), skirting: M.walnut, wainscot: null,
    holes: [{ wall: 'back', x: -1.5, y: 0.8, w: 1.5, h: 2.0 }, { wall: 'back', x: 1.5, y: 0.8, w: 1.5, h: 2.0 }], panels: false });
  const v = view({ night: K.night, golden: K.golden, seed: 137, near: '#8E6E5A', far: '#9A9EA8' });
  for (const x of [-1.5, 1.5]) K.window({ x, z: -d / 2, y: 0.8, w: 1.5, h: 2.0, view: v, blinds: 0.8, frameM: K.std({ color: '#3A3A30', roughness: 0.5 }), out: 4 });
  // his desk at an angle, its lamp, a phone, a glass, papers; the chair
  const dk = K.desk(-1.3, -0.9, PI - 0.25, 1.7, 0.85, K.std({ color: '#3A2618', roughness: 0.35 }));
  K.officeChair(-1.1, -1.75, -0.25, M.leather); K.deskLamp(-1.9, 0.76, -1.15); K.papers(-1.2, 0.765, -0.85, 5, 139);
  K.cyl(0.035, 0.03, 0.09, K.std({ color: '#D9B98A', roughness: 0.1, transparent: true, opacity: 0.7 }), -0.75, 0.765, -0.7);
  // the board: the Marins in photographs, pinned, a string between them; a map
  K.box(0.03, 1.2, 1.9, K.std({ color: '#A57C52', roughness: 0.95 }), w / 2 - 0.02, 1.0, -0.3);
  const pins = [[1.6, -0.9], [1.5, -0.2], [1.75, 0.35], [1.25, 0.15], [1.3, -0.65]];
  pins.forEach(([y, z], i) => K.plane(0.28, 0.21, K.std({ map: K.tex(photo(141 + i, { tone: '#B9A589' })), roughness: 0.8 }), w / 2 - 0.04, y, z, { ry: -PI / 2 }));
  K.plane(0.5, 0.36, K.std({ map: K.tex(lettering(['SLICE MARIN', { t: '12 stores', font: '400 70px Georgia' }], { w: 512, h: 368, bg: '#F3E9D2', fg: '#9B2B2B', font: '700 76px Georgia' })), roughness: 0.8 }), w / 2 - 0.04, 1.05, 0.6, { ry: -PI / 2 });
  // the sofa on the left, the safe in the corner, a coat stand, a filing cabinet, a floor lamp, a dead plant
  K.sofa(-w / 2 + 0.55, 1.0, PI / 2, 2.0, M.oxblood);
  K.box(0.6, 0.8, 0.6, K.std({ color: '#2B2E30', roughness: 0.35, metalness: 0.6 }), w / 2 - 0.45, 0, -d / 2 + 0.45);
  K.cyl(0.06, 0.06, 0.03, M.brass, w / 2 - 0.45, 0.45, -d / 2 + 0.76, { rx: PI / 2 });
  K.cabinet(w / 2 - 0.35, 1.6, -PI / 2, 0.5, 1.3); K.floorLamp(-w / 2 + 0.5, -0.3);
  { const G = K.grp(1.7, 0, 1.9); K.cyl(0.015, 0.015, 1.8, M.walnut, 0, 0, 0, { parent: G }); K.box(0.42, 0.75, 0.2, K.std({ color: '#1E1E24', roughness: 0.8 }), 0.12, 0.95, 0, { parent: G, r: 0.05 }); }
  K.frame(painting(143, ['#2B2B2B', '#8C3B2E', '#C9A66B', '#E8E2D4']), 0.9, 0.7, -w / 2 + 0.03, 2.0, -1.4, PI / 2, M.brass);
  K.rug(2.6, 1.9, 0.2, -0.3, '#4A2321', '#B79A6B', 149);
  K.door(1.2, d / 2 - 0.03, PI, K.std({ color: '#3C2A1C', roughness: 0.5 }), { glass: true });
  return {
    light: { sun: { from: [-4, 5.5, -10], to: [0.5, 0, 0.6], ext: 6, k: K.night ? 0.6 : 3.4, color: K.night ? '#8FA6FF' : '#FFE0B0' }, hemi: K.night ? 0.4 : 0.8,
      points: [{ at: [-1.9, 1.3, -1.15], k: 1.6, color: '#FFC982', dist: 5 }, { at: [-w / 2 + 0.5, 1.5, -0.3], k: 2.2, color: '#FFD7A0', dist: 6 }, { at: [0, 2.9, 0.8], k: 2.5, color: '#FFE9C8' }] },
    key: 1.3,
    marks: { desk: [-1.3, 1.0, -0.9], board: [w / 2, 1.3, -0.3], window: [0, 1.6, -d / 2] },
  };
}

// the family's pizzeria: a counter, the oven's glow, the menu board, red and white tiles, the street through the front
function pizzeria(K, def) {
  const M = K.mat, w = 7, d = 6.4, h = 3.2, sign = def.sign || 'SLICE MARIN';
  const wall = K.surf(SURF.brick('#8A4B35', 151), [3, 1.5], { roughness: 0.9 });
  K.room({ w, d, h, floor: K.surf(SURF.checker('#EFE7D6', '#A83232', 10, 153), [3, 3], { roughness: 0.4 }), wall, wallBack: K.surf(SURF.paint('#F1E6CF'), [3, 1.5]),
    holes: [{ wall: 'front', x: -1.2, y: 0.5, w: 3.6, h: 2.1 }], lightsAt: [[-1.8, 0], [1.8, 0], [0, 1.8]] });
  const v = view({ night: K.night, golden: K.golden, seed: 157, near: '#A8846A' });
  K.window({ x: 1.2, z: d / 2, y: 0.5, w: 3.6, h: 2.1, ry: PI, view: v, frameM: K.std({ color: '#2B5E3B', roughness: 0.4 }), mullions: 2, out: 6 });
  // the counter across the back, the glass case of slices, the till; the ovens behind it, glowing
  K.box(4.6, 1.0, 0.75, K.std({ color: '#2B5E3B', roughness: 0.4 }), -0.4, 0, -1.6);
  K.box(4.7, 0.05, 0.8, M.marble || K.surf(SURF.marble(), [2, 1], { roughness: 0.2 }), -0.4, 1.0, -1.6);
  K.box(1.8, 0.4, 0.6, M.glass, -1.3, 1.05, -1.55, { shadow: false });
  const slice = K.std({ color: '#E8A33D', roughness: 0.6 }), sauce = K.std({ color: '#B23A20', roughness: 0.6 });
  for (let i = 0; i < 4; i++) { const p = K.cyl(0.2, 0.2, 0.02, i % 2 ? slice : sauce, -2.0 + i * 0.45, 1.08, -1.55); }
  K.box(0.35, 0.25, 0.3, M.black, 1.2, 1.05, -1.6); K.box(0.3, 0.02, 0.22, M.screen, 1.2, 1.3, -1.55);
  for (const x of [-1.6, 0.4]) { K.box(1.5, 1.6, 0.9, K.std({ color: '#5B5F63', roughness: 0.3, metalness: 0.7 }), x, 0, -d / 2 + 0.5); K.box(1.1, 0.25, 0.02, K.std({ color: '#1B0A05', emissive: '#FF6A1A', emissiveIntensity: 1.6 }), x, 0.8, -d / 2 + 0.96, { shadow: false }); }
  K.box(4.2, 0.9, 0.04, K.std({ map: K.tex(lettering([{ t: sign, font: '700 120px Georgia, serif' }, { t: 'CHEESE 3.50 · PEPPERONI 4.00 · THE EGG ONE 5.50', font: '500 44px Arial', fg: '#FFFFFF' }], { w: 2048, h: 440, bg: '#1C1C1C', fg: '#F2C14E', border: '#F2C14E' })), emissive: '#FFFFFF', emissiveIntensity: 0.15 }), -0.6, 2.0, -d / 2 + 0.03, { shadow: false });
  // tables and chairs by the window; a fridge of drinks; a framed first dollar
  for (const [x, z] of [[-2.3, 1.6], [0, 1.9], [2.3, 1.6]]) { K.cyl(0.36, 0.36, 0.03, M.white, x, 0.74, z); K.cyl(0.04, 0.04, 0.74, M.chrome, x, 0, z); K.cyl(0.25, 0.25, 0.02, M.chrome, x, 0, z); for (const s of [-1, 1]) K.chair(x + s * 0.55, z, -s * PI / 2, M.chrome, K.std({ color: '#A83232', roughness: 0.6 })); }
  K.box(0.8, 2.0, 0.7, K.std({ color: '#D7DADF', roughness: 0.3, metalness: 0.5 }), w / 2 - 0.5, 0, -0.6); K.box(0.6, 1.5, 0.02, K.std({ color: '#B7E4FF', emissive: '#CDEBFF', emissiveIntensity: 0.6 }), w / 2 - 0.5, 0.3, -0.24, { shadow: false });
  K.frame(painting(159, ['#F2C14E', '#A83232', '#2B5E3B', '#F1E6CF']), 0.9, 0.6, -w / 2 + 0.03, 1.9, 0.4, PI / 2, M.black);
  K.plant(-w / 2 + 0.4, d / 2 - 0.5, 0.9, 161);
  return {
    light: { sun: { from: [2, 6, 12], to: [0, 0, -1], ext: 7, k: K.night ? 0.3 : 2.2 }, hemi: 1.1, points: [{ at: [-1.8, 2.9, 0], k: 6, color: '#FFE7C2' }, { at: [1.8, 2.9, 0], k: 6, color: '#FFE7C2' }, { at: [-0.6, 0.9, -2.5], k: 2.5, color: '#FF8A3D', dist: 4 }] },
    marks: { counter: [-0.4, 1.1, -1.6], window: [1.2, 1.5, d / 2] },
  };
}

// an old lady's front room on a walk-up's third floor: flowered paper, a sofa with a throw, her photographs, a lamp,
// lace at the window and the fire escape outside it, a kitchenette through an arch
function apartment(K, def) {
  const M = K.mat, w = 5.6, d = 5.2, h = 2.8;
  const wall = K.surf(SURF.paper('#E6D7B8', '#9C7F5C', 171), [3, 1.5], { roughness: 0.9 });
  K.room({ w, d, h, floor: K.surf(SURF.planks('#9A6B43', 173), [2.5, 2.5], { roughness: 0.5 }), wall, ceiling: M.white, skirting: M.white,
    holes: [{ wall: 'back', x: -1.2, y: 0.8, w: 1.2, h: 1.6 }, { wall: 'back', x: 1.0, y: 0.8, w: 1.2, h: 1.6 }], panels: false });
  const v = view({ night: K.night, golden: K.golden, seed: 177, near: '#9A5C44', far: '#A69E94' });
  for (const x of [-1.2, 1.0]) {
    K.window({ x, z: -d / 2, y: 0.8, w: 1.2, h: 1.6, view: v, frameM: M.white, mullions: 1, out: 3 });
    // (lace: a pale, see-through curtain each side; the fire escape's rails outside)
    for (const s of [-1, 1]) K.box(0.4, 1.9, 0.01, K.std({ color: '#FFFFFF', transparent: true, opacity: 0.55, roughness: 1 }), x + s * 0.55, 0.65, -d / 2 + 0.12, { shadow: false });
    for (let i = 0; i < 6; i++) K.cyl(0.012, 0.012, 1.0, M.black, x - 0.6 + i * 0.24, 0.8, -d / 2 - 0.9);
    K.box(1.5, 0.03, 0.03, M.black, x, 1.8, -d / 2 - 0.9);
  }
  K.sofa(0, -1.55, 0, 2.1, K.std({ color: '#6E7F5E', roughness: 0.95 })); K.box(0.9, 0.04, 0.6, K.std({ color: '#C9B48A', roughness: 1 }), 0.3, 0.62, -1.4, { shadow: false });
  K.armchair(-2.0, -0.2, PI / 2.6, K.std({ color: '#8A4B3C', roughness: 0.95 }));
  // the coffee table: a doily, a bowl of hard candies, the reading glasses
  K.box(1.0, 0.42, 0.55, M.walnut, 0, 0, -0.4, { r: 0.02 }); K.cyl(0.2, 0.2, 0.004, K.std({ color: '#FFFFFF', roughness: 1 }), 0, 0.42, -0.4, { seg: 24 });
  K.cyl(0.09, 0.06, 0.06, K.std({ color: '#CFE4EA', transparent: true, opacity: 0.6, roughness: 0.1 }), 0, 0.425, -0.4);
  // the sideboard of photographs, the lamp; the clock; a crucifix-free wall of plates
  K.box(1.6, 0.85, 0.45, M.walnut, w / 2 - 0.25, 0, -0.6, { ry: -PI / 2 });
  for (let i = 0; i < 5; i++) { const f = K.frame(photo(181 + i, { tone: i % 2 ? '#CDB99A' : '#B8A88E' }), 0.16, 0.2, w / 2 - 0.3, 1.08, -1.2 + i * 0.3, -PI / 2, i % 2 ? M.brass : M.walnut); f.position.y = 1.08; }
  K.floorLamp(w / 2 - 0.4, -1.8, 1.5);
  for (let i = 0; i < 5; i++) K.cyl(0.13, 0.13, 0.015, K.std({ color: ['#F2F2F2', '#7FA7C6', '#F2F2F2', '#C47A5A', '#F2F2F2'][i] }), -w / 2 + 0.01, 1.7 + (i % 2) * 0.3, -1.6 + i * 0.4, { rz: PI / 2 });
  K.bookcase(-w / 2 + 0.18, 1.3, PI / 2, 1.0, 1.7, 187, K.std({ color: '#7A5233', roughness: 0.5 }));
  K.rug(2.6, 1.9, 0, -0.6, '#7A2E2A', '#E2CFA6', 189);
  K.plant(-w / 2 + 0.45, -d / 2 + 0.45, 0.8, 191);
  K.door(1.4, d / 2 - 0.03, PI, K.std({ color: '#7E5A3A', roughness: 0.5 }));
  return {
    light: { sun: { from: [-2.5, 6, -10], to: [0, 0, 0.5], ext: 6, k: K.night ? 0.4 : 2.4 }, hemi: 1.05, points: [{ at: [w / 2 - 0.4, 1.4, -1.8], k: 2.4, color: '#FFD49A', dist: 6 }, { at: [0, 2.6, 0.6], k: 3.5, color: '#FFEBD0' }] },
    marks: { sofa: [0, 0.9, -1.55], window: [0, 1.6, -d / 2], door: [1.4, 1.3, d / 2] },
  };
}

// a working garage off a side street: concrete, a roll-up door open to the day, a car lift, tyres, a tool wall,
// strip lights, a workbench, a black SUV's bay empty
function garage(K, def) {
  const M = K.mat, w = 9, d = 9, h = 4.2;
  const wall = K.surf(SURF.concrete('#9A968E', 201), [3, 1.5], { roughness: 0.95 });
  K.room({ w, d, h, floor: K.surf(SURF.concrete('#7E7B76', 203), [3, 3], { roughness: 0.75 }), wall, wallBack: K.surf(SURF.brick('#6F4232', 205), [4, 2]), ceiling: K.std({ color: '#5E5C58', roughness: 1 }), skirting: null,
    holes: [{ wall: 'front', x: 0, y: 0, w: 4.4, h: 3.4 }], panels: false });
  const v = view({ night: K.night, golden: K.golden, seed: 207, near: '#8F7562' });
  { const p = new THREE.Mesh(new THREE.PlaneGeometry(22, 11), new THREE.MeshBasicMaterial({ map: K.tex(v) })); p.position.set(0, 3.5, d / 2 + 7); p.rotation.y = PI; K.group.add(p); }
  // (the street outside the door: the pavement)
  K.plane(14, 7, K.surf(SURF.paving('#8E8A82', 4, 209), [4, 2]), 0, 0.001, d / 2 + 3.5, { rx: -PI / 2 });
  K.box(4.6, 0.6, 0.12, K.std({ color: '#8E9296', roughness: 0.5, metalness: 0.6 }), 0, 3.4, d / 2 - 0.1);
  // the lift, its two posts and arms; tyres stacked; a tool wall over the bench; drums
  const yel = K.std({ color: '#E0B12A', roughness: 0.5, metalness: 0.3 });
  for (const s of [-1, 1]) { K.box(0.3, 3.2, 0.3, yel, -1.8 + s * 1.5, 0, -1.5); K.box(1.0, 0.08, 0.12, M.steel, -1.8 + s * 1.1, 0.25, -1.1); }
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3 - (i % 2); j++) { const t = K.cyl(0.33, 0.33, 0.22, K.std({ color: '#1B1B1B', roughness: 0.9 }), w / 2 - 0.5 - i * 0.7, j * 0.23, -d / 2 + 0.55, { seg: 18 }); }
  K.box(3.0, 0.9, 0.7, K.std({ color: '#5B4636', roughness: 0.8 }), 1.4, 0, -d / 2 + 0.45);
  K.box(3.0, 1.3, 0.04, K.std({ color: '#B5A27E', roughness: 0.9 }), 1.4, 1.2, -d / 2 + 0.03);
  const r = K.rng(211); for (let i = 0; i < 18; i++) K.box(0.03 + r() * 0.05, 0.2 + r() * 0.3, 0.03, r() < 0.5 ? M.steel : K.std({ color: '#B23A20', roughness: 0.5 }), 0.1 + r() * 2.6, 1.35 + r() * 0.7, -d / 2 + 0.07);
  for (const [x, z, c] of [[-w / 2 + 0.5, 2.2, '#1F4A8C'], [-w / 2 + 0.5, 2.9, '#8C1F1F'], [-w / 2 + 1.1, 2.6, '#2B2B2B']]) K.cyl(0.29, 0.29, 0.9, K.std({ color: c, roughness: 0.5, metalness: 0.4 }), x, 0, z);
  K.sofa(w / 2 - 0.6, 1.5, -PI / 2, 2.0, K.std({ color: '#4E3B2C', roughness: 0.95 }));
  for (let i = 0; i < 3; i++) K.box(0.18, 0.06, 2.4, K.std({ color: '#F5F7FF', emissive: '#FFFFFF', emissiveIntensity: 1.6 }), -2.6 + i * 2.6, h - 0.08, 0, { shadow: false });
  K.box(1.2, 0.02, 0.8, K.std({ color: '#2A2622', roughness: 0.4, transparent: true, opacity: 0.6 }), -0.3, 0.003, 1.3, { shadow: false });
  return {
    light: { sun: { from: [3, 9, 16], to: [0, 0, 0], ext: 9, k: K.night ? 0.3 : 3.0 }, hemi: 0.95, points: [-2.6, 0, 2.6].map((x) => ({ at: [x, h - 0.3, 0], k: 9, color: '#F2F5FF' })) },
    marks: { door: [0, 1.5, d / 2], lift: [-1.8, 1.4, -1.5] },
  };
}

// a closed exterior: the open air (no ceiling, the sky), paving, its walls the buildings round it, and a painted
// city beyond them all round (four backdrops, far)
function outdoors(K, { w, d, paving, sky = null, seed = 0, height = 60, ring = 48, trees = true }) {
  K.plane(w * 3, d * 3, paving, 0, 0, 0, { rx: -PI / 2 });
  K.plane(ring * 2.2, ring * 2.2, K.surf(SURF.concrete('#6E6B66', seed + 7), [10, 10], { roughness: 0.9 }), 0, -0.02, 0, { rx: -PI / 2 });
  // (the square's edge: a ring of street trees and lamp posts between it and the painted city, so a reverse shot has
  // a middle distance)
  if (trees) {
    const r = K.rng(seed + 3), crown = K.std({ color: '#4E7A3A', roughness: 0.85 }), bark = K.std({ color: '#4A3B2E', roughness: 1 });
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * 2 * PI + r() * 0.1, R = 15 + r() * 4, x = Math.sin(a) * R, z = Math.cos(a) * R;
      if (z < -6 && Math.abs(x) < 9) continue;
      K.cyl(0.16, 0.24, 3.4, bark, x, 0, z);
      for (let k = 0; k < 5; k++) { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1 + r() * 0.6, 1), crown); c.position.set(x + (r() - 0.5) * 1.8, 4.0 + r() * 1.3, z + (r() - 0.5) * 1.8); c.castShadow = true; K.group.add(c); }
      if (i % 3 === 0) { K.cyl(0.06, 0.08, 4.2, K.mat.black, x * 0.85, 0, z * 0.85); K.box(0.32, 0.45, 0.32, K.std({ color: '#FFF4D6', emissive: '#FFE6B0', emissiveIntensity: K.night ? 2 : 0.25 }), x * 0.85, 4.2, z * 0.85); }
    }
  }
  const v = (s) => view({ night: K.night, golden: K.golden, seed: s, street: false, w: 2048, h: 900 });
  for (let i = 0; i < 4; i++) {
    const a = (i * PI) / 2, p = new THREE.Mesh(new THREE.PlaneGeometry(ring * 2.6, height), new THREE.MeshBasicMaterial({ map: K.tex(v(seed + i)) }));
    p.position.set(Math.sin(a) * -ring, height / 2 - 4, Math.cos(a) * -ring); p.rotation.y = a; K.group.add(p);
  }
}
// a granite courthouse's steps: wide steps up to a colonnade, the square at their foot, lamp posts
function steps(K, def) {
  const M = K.mat;
  outdoors(K, { w: 16, d: 16, paving: K.surf(SURF.paving('#8F8A80', 3, 221), [8, 8], { roughness: 0.85 }), seed: 223 });
  const granite = K.surf(SURF.concrete('#9C968A', 225), [2, 1], { roughness: 0.75 });
  for (let i = 0; i < 9; i++) K.box(14, 0.16, 0.36, granite, 0, i * 0.16, -2.4 - i * 0.36);
  K.box(14, 1.44, 6, granite, 0, 0, -8.4);
  for (let i = 0; i < 8; i++) { K.cyl(0.45, 0.5, 7.5, K.std({ color: '#D2CCBF', roughness: 0.7 }), -6.3 + i * 1.8, 1.44, -6.4, { seg: 24 }); }
  K.box(15, 1.6, 1.3, K.std({ color: '#CBC4B6', roughness: 0.7 }), 0, 8.9, -6.4);
  K.box(14, 9, 0.4, K.std({ color: '#9E978A', roughness: 0.8 }), 0, 1.44, -8.4);
  for (const x of [-1.2, 1.2]) K.box(1.8, 3.4, 0.08, K.std({ color: '#2A2420', roughness: 0.5 }), x, 1.44, -8.15);
  // (the rails down the middle, lamp posts at the foot, a bench)
  for (const x of [-4, 4]) { K.cyl(0.06, 0.08, 4.2, M.black, x, 0, 0.4); K.box(0.36, 0.5, 0.36, K.std({ color: '#FFF4D6', emissive: '#FFE6B0', emissiveIntensity: K.night ? 2 : 0.3 }), x, 4.2, 0.4); }
  K.box(2.0, 0.45, 0.5, M.walnut, 5.5, 0, 1.6); K.plant(-5.5, 1.2, 1.4, 227);
  return { light: { sun: { from: [7, 9, 5], to: [0, 0, -2], ext: 10, k: 2.4 }, hemi: 0.75 }, env: 0.45, marks: { steps: [0, 1.5, -3] } };
}
// a park's paved corner with the stone chess tables under the trees, benches, a low iron fence
function park(K, def) {
  const M = K.mat;
  outdoors(K, { w: 16, d: 16, paving: K.surf(SURF.paving('#9C978C', 5, 231), [8, 8], { roughness: 0.9 }), seed: 233 });
  const stone = K.std({ color: '#8F8C86', roughness: 0.8 }), board = (s) => { const [c, x] = [document.createElement('canvas'), null]; c.width = c.height = 256; const g = c.getContext('2d'); for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#2B2B2B' : '#E6E0D2'; g.fillRect(i * 32, j * 32, 32, 32); } return c; };
  const bm = K.std({ map: K.tex(board()), roughness: 0.6 });
  for (const [x, z] of [[0, 0], [-3, -1.5], [3, -1.5], [-2.6, 2.4], [2.8, 2.6]]) {
    K.cyl(0.18, 0.25, 0.72, stone, x, 0, z); K.box(0.8, 0.06, 0.8, stone, x, 0.72, z); K.plane(0.5, 0.5, bm, x, 0.785, z, { rx: -PI / 2 });
    for (const s of [-1, 1]) K.cyl(0.2, 0.22, 0.45, stone, x + s * 0.75, 0, z);
  }
  // (pieces on the middle board, a game on)
  const wp = K.std({ color: '#F2EEE4', roughness: 0.4 }), kp = K.std({ color: '#1A1A1A', roughness: 0.4 }), r = K.rng(235);
  for (let i = 0; i < 18; i++) K.cyl(0.012, 0.018, 0.04 + r() * 0.03, i % 2 ? wp : kp, (Math.floor(r() * 8) - 3.5) * 0.0625, 0.785, (Math.floor(r() * 8) - 3.5) * 0.0625, { seg: 10 });
  // trees (trunks and crowns), benches, the fence, lamp posts
  const crown = K.std({ color: '#4E7A3A', roughness: 0.85 });
  for (const [x, z] of [[-5, -4], [5, -4.5], [-6, 3], [6, 3.5], [0, -6.5]]) { K.cyl(0.18, 0.26, 3.6, K.std({ color: '#4A3B2E', roughness: 1 }), x, 0, z); for (let k = 0; k < 6; k++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2 + r() * 0.6, 1), crown); s.position.set(x + (r() - 0.5) * 2, 4.2 + r() * 1.4, z + (r() - 0.5) * 2); s.castShadow = true; K.group.add(s); } }
  for (const [x, z, ry] of [[-6.5, -0.5, PI / 2], [6.5, -0.5, -PI / 2]]) { const G = K.grp(x, 0, z, ry); K.box(2.0, 0.08, 0.45, M.wood, 0, 0.42, 0, { parent: G }); K.box(2.0, 0.4, 0.05, M.wood, 0, 0.55, -0.22, { parent: G }); for (const s of [-1, 1]) K.box(0.06, 0.42, 0.45, M.black, s * 0.85, 0, 0, { parent: G }); }
  for (let i = 0; i < 40; i++) K.cyl(0.012, 0.012, 0.8, M.black, -9 + i * 0.45, 0, -8);
  for (const x of [-4.5, 4.5]) { K.cyl(0.06, 0.08, 3.8, M.black, x, 0, 5.5); K.box(0.32, 0.45, 0.32, K.std({ color: '#FFF4D6', emissive: '#FFE6B0', emissiveIntensity: K.night ? 2 : 0.3 }), x, 3.8, 5.5); }
  return { light: { sun: { from: [5, 11, -4], to: [0, 0, 0], ext: 9, k: 2.6 }, hemi: 0.8 }, env: 0.45, marks: { table: [0, 0.8, 0] } };
}
// a glass tower's lobby: polished stone, a long desk, the glass wall to the street, steel lift doors, a big canvas
function lobby(K, def) {
  const M = K.mat, w = 12, d = 9, h = 5.5;
  const stone = K.surf(SURF.marble('#E4E0D8', '#8F887D', 241), [4, 3], { roughness: 0.12, metalness: 0.05 });
  K.room({ w, d, h, floor: stone, wall: K.surf(SURF.marble('#D8D2C8', '#9A9285', 243), [3, 1.5], { roughness: 0.3 }), ceiling: K.std({ color: '#ECECEA', roughness: 0.8 }), skirting: null,
    holes: [{ wall: 'back', x: 0, y: 0, w: 11.8, h: 5.3 }], lightsAt: [[-3, -1], [0, -1], [3, -1], [-3, 2], [0, 2], [3, 2]] });
  const v = view({ night: K.night, golden: K.golden, seed: 245, far: '#A7B5C5', near: '#C7BBA9' });
  K.window({ x: 0, z: -d / 2, y: 0, w: 11.8, h: 5.3, view: v, frameM: K.std({ color: '#2A2D31', roughness: 0.35, metalness: 0.7 }), mullions: 5, out: 9 });
  K.box(4.2, 1.1, 0.8, K.std({ color: '#2A2420', roughness: 0.3 }), 2.5, 0, 0.8, { r: 0.03 }); K.box(4.3, 0.04, 0.9, K.surf(SURF.marble('#F2EFE9', '#9A9285', 247), [2, 1], { roughness: 0.15 }), 2.5, 1.1, 0.8);
  K.monitor(2.0, 1.14, 1.0, PI); K.deskLamp(3.8, 1.14, 0.9, K.std({ color: '#E8E2D4', roughness: 0.5 }));
  for (let i = 0; i < 3; i++) { K.box(1.3, 2.6, 0.06, M.steel, -w / 2 + 0.04, 0, -2 + i * 2.0, { ry: PI / 2 }); K.box(0.02, 2.6, 0.02, M.black, -w / 2 + 0.08, 0, -2 + i * 2.0); }
  K.frame(painting(249, ['#1F3A5F', '#E8E2D4', '#C9A66B', '#5A1F1A']), 3.2, 2.2, w / 2 - 0.03, 3.0, 0.5, -PI / 2, M.black);
  for (const x of [-2.4, 0.4]) { const G = K.grp(x, 0, 2.3); K.box(1.8, 0.42, 0.6, M.leather, 0, 0, 0, { parent: G, r: 0.04 }); }
  K.plant(-4.8, -3.6, 1.6, 251); K.plant(4.8, -3.6, 1.6, 253);
  return {
    light: { sun: { from: [-5, 9, -14], to: [0, 0, 1], ext: 10, k: K.night ? 0.3 : 3.0 }, hemi: 1.25, points: [[-3, -1], [0, -1], [3, -1], [-3, 2], [0, 2], [3, 2]].map(([x, z]) => ({ at: [x, h - 0.3, z], k: 7, color: '#FFF6E8' })) },
    marks: { desk: [2.5, 1.2, 0.8], glass: [0, 2, -d / 2] },
  };
}
// a plaza: travertine paving, a round fountain, a long low building's glass front behind, lamp standards
function plaza(K, def) {
  const M = K.mat;
  outdoors(K, { w: 18, d: 18, paving: K.surf(SURF.paving('#D9D0BC', 4, 261), [10, 10], { roughness: 0.6 }), seed: 263 });
  const trav = K.std({ color: '#E2D8C3', roughness: 0.55 });
  K.cyl(4.0, 4.0, 0.5, trav, 0, 0, -5.5, { seg: 48 }); K.cyl(3.7, 3.7, 0.02, K.std({ color: '#2E5E78', roughness: 0.05, metalness: 0.2, emissive: '#1D3C55', emissiveIntensity: 0.2 }), 0, 0.46, -5.5, { seg: 48 });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * 2 * PI; K.cyl(0.03, 0.05, 1.2 + (i % 3) * 0.5, K.std({ color: '#EAF4FF', transparent: true, opacity: 0.45, roughness: 0.1 }), Math.cos(a) * 2.2, 0.48, -5.5 + Math.sin(a) * 2.2, { shadow: false }); }
  K.box(26, 7, 0.4, K.std({ color: '#C9C0AC', roughness: 0.6 }), 0, 0, -13);
  for (let i = 0; i < 12; i++) K.box(1.6, 6, 0.05, K.std({ color: '#9FB3C2', roughness: 0.1, metalness: 0.3, emissive: K.night ? '#FFD38A' : '#000000', emissiveIntensity: K.night ? 0.8 : 0 }), -11 + i * 2, 0.4, -12.75);
  for (const x of [-6, 6]) for (const z of [-1, 4]) { K.cyl(0.07, 0.09, 4.5, M.black, x, 0, z); K.box(0.3, 0.6, 0.3, K.std({ color: '#FFF4D6', emissive: '#FFE6B0', emissiveIntensity: K.night ? 2 : 0.3 }), x, 4.5, z); }
  return { light: { sun: { from: [-8, 6, 4], to: [0, 0, -2], ext: 12, k: K.golden ? 2.6 : 2.6 }, hemi: 0.8 }, env: 0.45, marks: { fountain: [0, 1, -5.5] } };
}
// a side street at night by a steel door left open: brick walls, a fire escape, a caged bulb over the door, the
// stairwell's warm light spilling out of it onto the wet pavement, a dumpster, the street's light from the corner
function alley(K, def) {
  const M = K.mat;
  const bc = SURF.brick('#6A3A2C', 271), brick = (wd, ht) => K.surf(bc, [wd / 4.5, ht / 4.5], { roughness: 0.9 });
  K.plane(16, 18, K.surf(SURF.paving('#5A5853', 4, 273), [6, 6], { roughness: K.night ? 0.35 : 0.8 }), 0, 0, 0, { rx: -PI / 2 });
  // (the walls: the building with the door at the back, cut round the door; the next one on the left; the street open
  // to the right and the front)
  const dx = 0.6, dw = 1.1, dh = 2.2, a = dx - dw / 2, b = dx + dw / 2;
  K.plane(a + 8, 12, brick(a + 8, 12), (a - 8) / 2, 6, -3.2); K.plane(8 - b, 12, brick(8 - b, 12), (b + 8) / 2, 6, -3.2); K.plane(dw, 12 - dh, brick(dw, 12 - dh), dx, (12 + dh) / 2, -3.2);
  K.plane(18, 12, brick(18, 12), -4.2, 6, 0, { ry: PI / 2 });
  // the door: its frame, the leaf swung open, the stairwell behind it (green walls, a flight going up, its light)
  K.box(dw + 0.24, 0.12, 0.3, M.steel, dx, dh, -3.2);
  for (const s of [-1, 1]) K.box(0.12, dh, 0.3, M.steel, dx + s * (dw / 2 + 0.06), 0, -3.2);
  { const leaf = K.box(dw, dh - 0.02, 0.06, K.std({ color: '#3E4A4F', roughness: 0.45, metalness: 0.6 }), 0, 0, 0, { parent: K.grp(dx + dw / 2, 0, -3.15, -1.9) }); leaf.position.x = -dw / 2; }
  // (the hole in the wall: drawn as the stairwell box behind it, the wall plane cut by a dark frame)
  const SW = K.grp(dx, 0, -3.2);
  const green = K.std({ color: '#7E9A7E', roughness: 0.8 });
  K.box(2.2, 3.4, 0.05, green, 0, 0, -2.4, { parent: SW }); K.box(0.05, 3.4, 2.4, green, -1.1, 0, -1.2, { parent: SW }); K.box(0.05, 3.4, 2.4, green, 1.1, 0, -1.2, { parent: SW });
  K.box(2.2, 0.02, 2.4, K.std({ color: '#5D5A55', roughness: 0.8 }), 0, 0.001, -1.2, { parent: SW });
  for (let i = 0; i < 8; i++) K.box(1.0, 0.18, 0.28, K.std({ color: '#6E6A64', roughness: 0.8 }), 0.45, i * 0.18, -0.6 - i * 0.24, { parent: SW });
  K.cyl(0.03, 0.03, 1.4, M.black, -0.05, 0.9, -1.4, { parent: SW, rx: 0.64 });
  K.box(0.3, 0.06, 0.3, K.std({ color: '#FFF4D8', emissive: '#FFE2A8', emissiveIntensity: 3 }), 0, 3.2, -1.2, { parent: SW, shadow: false });
  // the caged bulb over the door, a sign: NO PARKING; the fire escape up the left wall; the dumpster; bags
  K.box(0.16, 0.2, 0.16, K.std({ color: '#FFF0C8', emissive: '#FFD890', emissiveIntensity: 3.5 }), dx, dh + 0.35, -3.05, { shadow: false });
  for (let f = 0; f < 3; f++) { const y = 3.2 + f * 3; K.box(1.2, 0.05, 3.0, M.black, -3.6, y, -1.2); for (let i = 0; i < 9; i++) K.cyl(0.012, 0.012, 0.9, M.black, -3.0, y, -2.6 + i * 0.35); K.box(0.04, 0.04, 3.0, M.black, -3.0, y + 0.9, -1.2); }
  K.box(1.9, 1.2, 1.1, K.std({ color: '#2F5D3A', roughness: 0.6, metalness: 0.4 }), -2.8, 0, 1.6, { r: 0.03 });
  for (let i = 0; i < 3; i++) K.box(0.5, 0.5, 0.45, K.std({ color: '#141414', roughness: 0.3 }), -1.6 + i * 0.4, 0, 2.3 + (i % 2) * 0.3, { r: 0.18 });
  K.box(0.6, 0.3, 0.02, K.std({ map: K.tex(lettering('NO PARKING', { w: 512, h: 160, bg: '#F2F2F2', fg: '#C62828', font: '700 80px Arial' })) }), 2.2, 2.0, -3.17);
  // the street beyond: the far side's buildings lit, a street lamp
  const v = view({ night: true, seed: 277, street: true });
  { const p = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshBasicMaterial({ map: K.tex(v) })); p.position.set(14, 7, 6); p.rotation.y = -PI / 2; K.group.add(p); }
  { const p = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshBasicMaterial({ map: K.tex(view({ night: true, seed: 279 })) })); p.position.set(0, 7, 16); p.rotation.y = PI; K.group.add(p); }
  K.cyl(0.08, 0.1, 5.5, M.black, 4.6, 0, 3.6); K.box(0.6, 0.15, 0.3, K.std({ color: '#FFFFFF', emissive: '#E8EEFF', emissiveIntensity: 3 }), 4.3, 5.5, 3.6, { shadow: false });
  return {
    sky: '#0A0E1C',
    light: { sun: { from: [6, 10, 8], to: [0, 0, -1], ext: 8, k: 0.35, color: '#8FA6FF' }, hemi: 0.45, sky: '#3A4C80', ground: '#2A2018',
      points: [{ at: [dx, 2.3, -4.4], k: 9, color: '#FFD9A0', dist: 9, shadow: true }, { at: [dx, dh + 0.4, -2.85], k: 4.5, color: '#FFD890', dist: 7 }],
      spots: [{ at: [4.3, 5.4, 3.6], to: [0.4, 0, -1.2], k: 60, color: '#DCE6FF', angle: 0.75, pen: 0.7, dist: 22, shadow: true }] },
    key: 2.6, env: 0.15,
    marks: { door: [dx, 1.1, -3.2] },
  };
}

export const ROOMS = { 'bank-office': bankOffice, school, hideout, pizzeria, apartment, garage, steps, park, lobby, plaza, alley };
