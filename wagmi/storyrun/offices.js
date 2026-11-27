// Mog City story runner: the offices of a video call (vcall.js). Each person on a call sits in an office of their own, as
// Mr. Big sits in his study for his video call (wagmi/mission/mrbig.js): a little room built from the set kit
// (setkit.js), seen the way a webcam sees it, from the top of the screen in front of them, so it is dressed for that one
// view: the wall behind them and what stands against it, the corners either side, the edge of the desk under the frame.
// The person sits at the room's middle (x 0, z 0) in a chair facing +z, the desk in front of them, the webcam over it.
//   OFFICES[look](K, def) -> { light, marks, key, fill, rim, env, seat }   (the rooms' contract, rooms.js)
// Looks: exec (a corner office high up: glass, the skyline), startup (an open-plan loft: brick, a whiteboard, plants),
// backstage (a stage manager's room: run-of-show screens, road cases, a bulb mirror), boardroom (the long table behind
// them, a wall screen), kitchen (a home kitchen: cabinets, the window over the sink), study (walnut, books, a green
// banker's lamp: Mr. Big's, now Mr. Board's), van (a broadcast van's back: a rack of monitors, the curved roof), greenroom (an
// arena's green room: the mirror ringed with bulbs, the fruit, a jacket on the rail); and where a story takes its calls
// away from a desk (19 Nov): truck (a food truck's kitchen), diner (a diner booth), lot (a lot out back, a loading dock),
// green (a lawn by a station, a bench), car (a car's front seat), house (row one of an arena's seats). Nothing in them
// is a real place, brand or person; the lettering is
// generic or the story's own words (def.sign).
// Each is lit as a webcam call is: the room's own light behind them, and the screen's light on the face (a soft, cool
// light from where the lens is), so the face reads in every look, day or night.
import * as THREE from 'three/webgpu';
import { SURF, lettering, painting, photo } from './setkit.js';
import { bankersLamp, mug, folders, penPot, outdoors, tree } from './rooms.js';
import { torsoGeo } from './stage-room.js';

const PI = Math.PI;
export const LOOKS = ['exec', 'startup', 'backstage', 'boardroom', 'kitchen', 'study', 'van', 'greenroom', 'truck', 'diner', 'lot', 'green', 'car', 'house'];
// where they sit: the seat's height (sets.js puts the hips on it) and the chair's place
export const SEAT = { at: [0, 0], y: 0.5 };

// the chair under them and the desk's near edge in front (the webcam's foreground), a few things on it
function station(K, { chair = K.mat.leather, desk = K.mat.walnut, top = null, things = true, seed = 1 } = {}) {
  K.officeChair(0, -0.12, 0, chair); K.blob(0, -0.1, 0.9, 0.9, 0.35);
  K.box(1.5, 0.045, 0.7, top || desk, 0, 0.73, 0.62, { r: 0.008 });
  K.box(1.42, 0.5, 0.02, desk, 0, 0.22, 0.93);
  if (!things) return;
  const r = K.rng(seed);
  mug(K, -0.5 + r() * 0.1, 0.775, 0.42, ['#F2EEE6', '#2E4C6D', '#B23A20'][Math.floor(r() * 3)]);
  K.papers(0.42, 0.776, 0.5, 2, 11 + seed);
}
// the screen's light on the face (where the lens is: a soft cool front light) and a lamp's warm one beside it
const screenLight = (k = 1.2, color = '#DCE6FF') => ({ at: [0, 1.25, 0.75], k, color, dist: 2.2 });

/* ------------------------------------------------------------ the looks -- */
// a corner office high up downtown: floor-to-ceiling glass behind them, the towers, a low credenza, a sculpture, a plant
function exec(K, def) {
  const M = K.mat, w = 5.2, d = 4.4, h = 3.0;
  const wall = K.scan('plaster', { tint: '#D9D3C8', rough: 0.9, nscale: 0.4, color: false });
  K.room({ w, d, h, floor: K.surf(SURF.carpet('#3B3F46', 301), [5, 5], { roughness: 1 }), wall, skirting: M.black, crown: null,
    holes: [{ wall: 'back', x: 0, y: 0.08, w: 4.9, h: 2.8 }, { wall: 'left', x: 0.6, y: 0.08, w: 2.6, h: 2.8 }], lightsAt: [[0, 0.6]] });
  K.window({ x: 0, z: -d / 2, y: 0.08, w: 4.9, h: 2.8, city: { seed: 303, high: true }, frameM: K.std({ color: '#2A2D31', roughness: 0.4, metalness: 0.6 }), mullions: 3, out: 6, sill: false });
  K.window({ x: -w / 2, z: -0.6, y: 0.08, w: 2.6, h: 2.8, ry: PI / 2, city: { seed: 305, high: true }, frameM: K.std({ color: '#2A2D31', roughness: 0.4, metalness: 0.6 }), mullions: 2, out: 6, sill: false, light: 0.6 });
  // (the credenza under the glass: dark oak, a sculpture, books lying flat, a framed photo; a tall plant in the corner)
  const oak = K.std({ color: '#3A2A1E', roughness: 0.4 });
  K.box(2.4, 0.62, 0.48, oak, 0.2, 0, -d / 2 + 0.42); K.box(2.44, 0.025, 0.5, K.std({ color: '#1C1612', roughness: 0.25 }), 0.2, 0.62, -d / 2 + 0.42);
  K.cyl(0.06, 0.09, 0.42, K.std({ color: '#B08D57', roughness: 0.25, metalness: 0.9 }), -0.55, 0.645, -d / 2 + 0.42, { seg: 6 });
  K.books(0.55, 0.645, -d / 2 + 0.42, 0.28, PI / 2, 307, 0.2);
  K.frame(photo(309, { tone: '#B9A68C' }), 0.2, 0.15, 1.05, 0.83, -d / 2 + 0.38, 0, M.black);
  K.potted(1.95, -d / 2 + 0.45, 1.25, { pot: '#1E1E1E' });
  K.floorLamp(-1.75, -d / 2 + 0.5, 1.55); K.bulb(-1.75, 1.42, -d / 2 + 0.5, 0.035, '#FFD49A', 4);
  K.frame(painting(311, ['#1F2A38', '#D8C8A8', '#9C3B2E', '#E8E2D4']), 1.2, 0.9, w / 2 - 0.03, 1.75, -0.7, -PI / 2, M.black);
  K.rug(2.6, 2.2, 0, 0.1, '#2B2F36', '#8C8577', 313);
  station(K, { chair: M.leather, desk: K.std({ color: '#26211D', roughness: 0.35 }), top: K.std({ color: '#151311', roughness: 0.2, metalness: 0.1 }), seed: 3 });
  return {
    light: { sun: { from: [-5, 6, -8], to: [0, 0, 0.5], ext: 6, k: 2.6 }, hemi: 0.9, windowK: 1.1,
      points: [screenLight(1.2), { at: [0, 2.75, 0.6], k: 0.7, color: '#FFF3E0', dist: 4 }, { at: [-1.75, 1.45, -d / 2 + 0.55], k: 1.0, color: '#FFD49A', dist: 3 }] },
    marks: { desk: [0, 0.8, 0.6], window: [0, 1.6, -d / 2] }, seat: SEAT,
  };
}

// an open-plan loft a startup rents: brick, steel windows, a whiteboard of sticky notes, pendants, plants, the team's desks
function startup(K, def) {
  const M = K.mat, w = 6.0, d = 5.0, h = 3.4;
  const brick = K.scan('brick', { tint: '#C89A86', rough: 0.95, nscale: 0.8 });
  K.room({ w, d, h, floor: K.surf(SURF.concrete('#8E8B86', 321), [3, 3], { roughness: 0.55 }), wall: K.scan('plaster', { tint: '#E8E4DC', rough: 0.9, nscale: 0.4, color: false }), wallBack: brick,
    ceiling: K.std({ color: '#2C2E31', roughness: 0.9 }), skirting: null, crown: null, holes: [{ wall: 'left', x: 0.8, y: 0.9, w: 2.4, h: 1.9 }], panels: false });
  K.window({ x: -w / 2, z: -0.8, y: 0.9, w: 2.4, h: 1.9, ry: PI / 2, city: { seed: 323, tone: '#A8826A' }, frameM: K.std({ color: '#1C1D1F', roughness: 0.5, metalness: 0.5 }), mullions: 3, out: 7 });
  // (the whiteboard: lanes drawn in marker, sticky notes in them)
  { const c = document.createElement('canvas'); c.width = 1024; c.height = 576; const x = c.getContext('2d'); x.fillStyle = '#F4F5F2'; x.fillRect(0, 0, 1024, 576);
    const r = K.rng(325), cols = ['#FFE066', '#7FD1AE', '#FF9BB3', '#8EC5FF', '#FFB86B'];
    x.strokeStyle = '#2B2B2B'; x.lineWidth = 4; for (const xx of [341, 682]) { x.beginPath(); x.moveTo(xx, 70); x.lineTo(xx, 540); x.stroke(); }
    x.fillStyle = '#2B2B2B'; x.font = '700 44px "Comic Sans MS", "Marker Felt", sans-serif'; [['TO DO', 90], ['DOING', 430], ['DONE', 790]].forEach(([t, xx]) => x.fillText(t, xx, 56));
    for (let i = 0; i < 16; i++) { const col = i % 3, xx = 30 + col * 341 + r() * 200, yy = 90 + r() * 380; x.save(); x.translate(xx, yy); x.rotate((r() - 0.5) * 0.2); x.fillStyle = cols[Math.floor(r() * 5)]; x.fillRect(0, 0, 86, 80); x.fillStyle = 'rgba(0,0,0,.45)'; for (let k = 0; k < 3; k++) x.fillRect(10, 18 + k * 18, 40 + r() * 30, 4); x.restore(); }
    x.strokeStyle = '#1F6FD0'; x.lineWidth = 5; x.beginPath(); x.moveTo(720, 470); x.bezierCurveTo(800, 380, 880, 520, 990, 400); x.stroke();
    const t = K.tex(c); K.box(2.2, 1.24, 0.03, K.std({ map: t, roughness: 0.25 }), -0.4, 1.0, -d / 2 + 0.06); K.box(2.26, 1.3, 0.025, M.steel, -0.4, 0.97, -d / 2 + 0.045, { shadow: false });
    K.box(2.1, 0.03, 0.06, M.steel, -0.4, 0.98, -d / 2 + 0.1); }
  // (the team behind: two desks with screens, a shelf of plants, string of pendants, a bike on the wall, a sofa)
  K.desk(1.75, -1.25, 0, 1.4, 0.7, K.std({ color: '#C9B08A', roughness: 0.6 }), { pedestals: false }); K.monitor(1.6, 0.76, -1.45, 0.15); K.monitor(2.1, 0.76, -1.4, -0.2);
  K.chair(1.75, -0.8, PI, M.steel, K.std({ color: '#2E6B5E', roughness: 0.9 }));
  { const sh = K.std({ color: '#C9B08A', roughness: 0.6 }); for (const y of [1.55, 2.05]) K.box(1.2, 0.03, 0.26, sh, 1.9, y, -d / 2 + 0.16); for (let i = 0; i < 4; i++) K.potted(1.45 + i * 0.3, -d / 2 + 0.16, 0.32, { y: 2.08, pot: ['#E8E2D4', '#C47A5A', '#2E2E2E', '#7FA7C6'][i] }); K.books(1.85, 1.58, -d / 2 + 0.16, 0.8, 0, 327, 0.18); }
  for (const x of [-1.6, 0, 1.6]) K.pendant(x, -0.9, 2.55, h, { shadeC: '#1C1C1C', r: 0.16 });
  K.potted(-2.4, -d / 2 + 0.45, 1.3, { pot: '#E8E2D4' }); K.potted(2.55, 0.6, 1.0, { pot: '#2E2E2E' });
  K.sofa(-2.3, 0.9, PI / 2, 1.8, K.std({ color: '#D2C3A8', roughness: 0.95 }));
  station(K, { chair: K.std({ color: '#1E1E1E', roughness: 0.6 }), desk: K.std({ color: '#C9B08A', roughness: 0.6 }), seed: 5 });
  return {
    light: { sun: { from: [-8, 6, -1], to: [0, 0, -0.5], ext: 6, k: 2.2 }, hemi: 1.0, windowK: 1.0,
      points: [screenLight(1.3), { at: [0, 2.4, -0.9], k: 1.4, color: '#FFE0B0', dist: 4 }, { at: [1.6, 2.4, -0.9], k: 1.0, color: '#FFE0B0', dist: 3.5 }] },
    marks: { board: [-0.4, 1.6, -d / 2] }, seat: SEAT,
  };
}

// a stage manager's room behind the stage: black walls, a wall of run-of-show screens, road cases, a mirror ringed with
// bulbs, the call sheet taped up, a headset on a hook, cable on the floor
function backstage(K, def) {
  const M = K.mat, w = 5.0, d = 4.4, h = 3.0;
  const black = K.std({ color: '#17181A', roughness: 0.92 });
  K.room({ w, d, h, floor: K.surf(SURF.concrete('#3A3937', 331), [3, 3], { roughness: 0.6 }), wall: black, ceiling: K.std({ color: '#0E0F10', roughness: 1 }), skirting: null, crown: null, panels: false, lightsAt: [] });
  // (the screens: four feeds of the stage, a run of show, a clock in red digits)
  const feed = (seed, kind) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 288; const x = c.getContext('2d'), r = K.rng(seed);
    if (kind === 'ros') { x.fillStyle = '#0B0E14'; x.fillRect(0, 0, 512, 288); x.font = '700 26px monospace'; x.fillStyle = '#FFC93C'; x.fillText('RUN OF SHOW', 18, 36);
      for (let i = 0; i < 7; i++) { x.fillStyle = i === 2 ? '#B6FF3B' : '#C9CED6'; x.font = '600 20px monospace'; x.fillText(`${String(i + 1).padStart(2, '0')}  ${['WALK-IN', 'VO OF GOD', 'OPEN', 'DEMO', 'GUEST', 'REVEAL', 'CLOSE'][i]}`, 22, 74 + i * 30); } }
    else if (kind === 'clock') { x.fillStyle = '#050505'; x.fillRect(0, 0, 512, 288); x.font = '700 120px monospace'; x.fillStyle = '#FF3B30'; x.textAlign = 'center'; x.fillText('00:42', 256, 190); }
    else { const g = x.createRadialGradient(256, 120, 10, 256, 140, 300); g.addColorStop(0, '#3A6FB0'); g.addColorStop(1, '#05070C'); x.fillStyle = g; x.fillRect(0, 0, 512, 288);
      x.fillStyle = 'rgba(0,0,0,.85)'; for (let i = 0; i < 60; i++) x.fillRect(r() * 512, 230 + r() * 58, 10 + r() * 8, 30); x.fillStyle = '#E8EEF8'; x.fillRect(240, 120, 16, 60); }
    return c;
  };
  const screens = [[-1.05, 1.95, 'stage', 341], [-0.35, 1.95, 'ros', 0], [0.35, 1.95, 'stage', 343], [1.05, 1.95, 'clock', 0], [-0.7, 1.45, 'stage', 345], [0, 1.45, 'stage', 347], [0.7, 1.45, 'ros', 0]];
  for (const [x, y, kind, seed] of screens) {
    K.box(0.66, 0.4, 0.05, M.black, x, y - 0.2, -d / 2 + 0.08);
    K.plane(0.62, 0.36, K.std({ map: K.tex(feed(seed, kind)), emissive: '#FFFFFF', emissiveIntensity: 0.9, emissiveMap: K.tex(feed(seed, kind)), roughness: 0.3 }), x, y, -d / 2 + 0.11);
  }
  // (road cases: black, aluminium edges, stencilled with nothing but a number)
  const caseM = K.std({ color: '#1C1C1E', roughness: 0.7 }), edge = M.steel;
  for (const [x, z, sw, sh, n] of [[-1.7, -1.6, 0.9, 0.7, '07'], [-1.7, -1.6, 0.8, 0.5, '12'], [1.75, -1.55, 0.8, 0.9, '03']]) {
    const y = n === '12' ? 0.7 : 0; K.box(sw, sh, 0.6, caseM, x, y, z); for (const s of [-1, 1]) K.box(0.025, sh, 0.62, edge, x + s * sw / 2, y, z, { shadow: false });
    K.box(0.3, 0.12, 0.005, K.std({ map: K.tex(lettering(n, { w: 256, h: 96, bg: '#1C1C1E', fg: '#F2F2F2', font: '700 72px monospace' })) }), x, y + sh * 0.55, z + 0.302, { shadow: false });
  }
  // (the mirror with its bulbs on the right wall; the call sheet taped up, a headset on a hook, a clipboard)
  { const G = K.grp(w / 2 - 0.02, 0, 0.2, -PI / 2); K.box(1.0, 0.8, 0.02, K.std({ color: '#C8D2DC', roughness: 0.05, metalness: 0.9 }), 0, 1.2, 0, { parent: G }); for (let i = 0; i < 6; i++) { K.bulb(-0.55, 1.22 + i * 0.13, 0.03, 0.03, '#FFE8C0', 7, G); K.bulb(0.55, 1.22 + i * 0.13, 0.03, 0.03, '#FFE8C0', 7, G); } }
  K.box(0.3, 0.4, 0.004, K.std({ map: K.tex(lettering([{ t: 'CALL SHEET', font: '700 54px Arial' }, { t: 'HOUSE OPEN 6:00', font: '400 34px Arial' }, { t: 'PLACES 6:55', font: '400 34px Arial' }], { w: 384, h: 512, bg: '#F2F0EA', fg: '#222', border: null })) }), 1.55, 1.25, -d / 2 + 0.02, { shadow: false });
  { const hs = K.grp(-1.45, 1.55, -d / 2 + 0.07); const t = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 8, 20, PI), M.black); hs.add(t); for (const s of [-1, 1]) K.cyl(0.04, 0.04, 0.03, M.black, s * 0.09, -0.02, 0, { parent: hs, rx: PI / 2 }); }
  // (gaffer-taped cable along the floor; a work light clamped up high, warm)
  K.box(3.2, 0.01, 0.06, K.std({ color: '#111', roughness: 0.6 }), 0, 0, -1.0, { shadow: false });
  K.bulb(1.9, 2.55, -1.6, 0.05, '#FFD7A0', 8);
  station(K, { chair: K.std({ color: '#111214', roughness: 0.6 }), desk: K.std({ color: '#222326', roughness: 0.5 }), seed: 7 });
  return {
    light: { sun: false, hemi: 0.5, hemiK: 0.6,
      points: [screenLight(1.6, '#D6E2FF'), { at: [0, 1.9, -1.6], k: 1.6, color: '#7FA6FF', dist: 3.2 }, { at: [w / 2 - 0.2, 1.5, 0.2], k: 1.6, color: '#FFE2B8', dist: 3 }, { at: [1.9, 2.5, -1.5], k: 1.4, color: '#FFD7A0', dist: 4 }] },
    marks: {}, seat: SEAT, key: 1.9, env: 0.25,
  };
}

// a boardroom: they sit at the near end of the long table, the chairs down both sides behind them, the wall screen at
// the far end, the windows along one side
function boardroom(K, def) {
  const M = K.mat, w = 5.6, d = 7.0, h = 3.0;
  const wall = K.scan('plaster', { tint: '#CFC6B6', rough: 0.9, nscale: 0.4, color: false }), walnut = K.std({ color: '#4A2E1C', roughness: 0.38 });
  K.room({ w, d, h, floor: K.surf(SURF.carpet('#2E3440', 351), [6, 6], { roughness: 1 }), wall, skirting: walnut, crown: K.std({ color: '#E9E2D4', roughness: 0.7 }),
    holes: [{ wall: 'right', x: -1.2, y: 0.7, w: 2.0, h: 1.9 }, { wall: 'right', x: 1.2, y: 0.7, w: 2.0, h: 1.9 }], lightsAt: [[0, -1.5], [0, 0.5]] });
  for (const x of [-1.2, 1.2]) K.window({ x: w / 2, z: x, y: 0.7, w: 2.0, h: 1.9, ry: -PI / 2, city: { seed: 353, high: true }, blinds: 0.2, frameM: M.offwhite, mullions: 1, out: 6 });
  // (the table runs back from them: walnut, a dark inlay, the chairs either side, water glasses, notepads)
  K.box(1.4, 0.06, 4.6, walnut, 0, 0.7, -2.2, { r: 0.02 }); K.box(1.0, 0.004, 4.2, K.std({ color: '#1F1A16', roughness: 0.3 }), 0, 0.762, -2.2, { shadow: false });
  for (const z of [-3.9, -0.5]) K.box(0.5, 0.7, 0.5, walnut, 0, 0, z);
  const seatM = K.std({ color: '#1F1F22', roughness: 0.55 }), r = K.rng(355);
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { const z = -0.9 - i * 0.95; K.officeChair(s * 1.0, z, s * PI / 2, seatM); K.cyl(0.035, 0.03, 0.1, K.std({ color: '#D8E4EA', transparent: true, opacity: 0.45, roughness: 0.05 }), s * 0.5, 0.76, z + 0.1, { seg: 12, shadow: false }); if (r() < 0.7) K.box(0.16, 0.006, 0.22, M.paper, s * 0.4, 0.763, z - 0.1, { shadow: false }); }
  // (the far wall: the screen with a chart on it, a credenza, a clock)
  { const c = document.createElement('canvas'); c.width = 1024; c.height = 576; const x = c.getContext('2d'); x.fillStyle = '#0F1622'; x.fillRect(0, 0, 1024, 576); x.strokeStyle = '#2A3A50'; x.lineWidth = 2; for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo(80, i * 90); x.lineTo(980, i * 90); x.stroke(); }
    const bars = [180, 240, 210, 330, 300, 420]; bars.forEach((b, i) => { x.fillStyle = i === 5 ? '#FFC93C' : '#4E7BB5'; x.fillRect(120 + i * 140, 500 - b, 90, b); });
    K.box(2.4, 1.38, 0.06, M.black, 0, 1.0, -d / 2 + 0.06); K.plane(2.3, 1.29, K.std({ map: K.tex(c), emissive: '#FFFFFF', emissiveMap: K.tex(c), emissiveIntensity: 0.8, roughness: 0.3 }), 0, 1.69, -d / 2 + 0.1); }
  K.box(2.6, 0.7, 0.45, walnut, 0, 0, -d / 2 + 0.3); K.potted(-2.2, -d / 2 + 0.5, 1.1, { pot: '#2A2A2A' }); K.potted(2.2, -d / 2 + 0.5, 1.0, { pot: '#2A2A2A' });
  K.frame(painting(357, ['#24384F', '#8FA9BF', '#E8E2D4', '#C9A66B']), 1.3, 0.85, -w / 2 + 0.03, 1.75, -2.0, PI / 2, M.black);
  K.clock(-w / 2 + 0.01, 2.35, -0.3, PI / 2);
  station(K, { chair: K.std({ color: '#1F1F22', roughness: 0.55 }), desk: walnut, things: false });
  K.box(0.18, 0.005, 0.25, M.paper, 0.35, 0.776, 0.45, { shadow: false }); mug(K, -0.45, 0.775, 0.4, '#F2EEE6');
  return {
    light: { sun: { from: [8, 6, -1], to: [0, 0, -1], ext: 7, k: 2.4 }, hemi: 0.85,
      points: [screenLight(1.2), { at: [0, 2.8, -1.5], k: 1.2, color: '#FFF3E0', dist: 5 }, { at: [0, 2.8, 0.5], k: 0.9, color: '#FFF3E0', dist: 4 }] },
    marks: { screen: [0, 1.7, -d / 2] }, seat: SEAT,
  };
}

// a home kitchen: the cabinets and the counter behind them, the window over the sink, the fridge, a kettle, a fruit bowl,
// a pendant over the island they sit at
function kitchen(K, def) {
  const M = K.mat, w = 5.0, d = 4.6, h = 2.7;
  K.room({ w, d, h, floor: K.surf(SURF.planks('#9A7048', 361), [2.5, 2.5], { roughness: 0.4 }), wall: K.surf(SURF.paint('#EDE6D6', 363), [2, 2], { roughness: 0.85 }),
    wallBack: K.surf(SURF.tiles('#F2EFE8', '#C8D4D8', 12, 365, 0.05), [3, 2], { roughness: 0.3 }), ceiling: M.white, skirting: M.white, crown: M.white,
    holes: [{ wall: 'back', x: 0.35, y: 1.05, w: 1.2, h: 1.0 }], panels: false, lightsAt: [] });
  K.window({ x: 0.35, z: -d / 2, y: 1.05, w: 1.2, h: 1.0, city: { seed: 367, tone: '#8FA06A' }, frameM: M.white, mullions: 1, out: 6 });
  // (the run of cabinets: sage doors, a stone top, the sink under the window, the upper cabinets either side of it)
  const door = K.std({ color: '#8EA48A', roughness: 0.5 }), top = K.surf(SURF.marble('#ECE8E0', '#A8A298', 369), [2, 1], { roughness: 0.15 });
  K.box(4.2, 0.88, 0.62, door, 0, 0, -d / 2 + 0.31); K.box(4.24, 0.04, 0.66, top, 0, 0.88, -d / 2 + 0.33);
  for (let i = 0; i < 7; i++) { const x = -1.8 + i * 0.6; K.box(0.56, 0.78, 0.01, K.std({ color: '#7F9579', roughness: 0.5 }), x, 0.05, -d / 2 + 0.625, { shadow: false }); K.box(0.12, 0.012, 0.02, M.brass, x, 0.75, -d / 2 + 0.64, { shadow: false }); }
  for (const x of [-1.45, 1.75]) { K.box(1.0, 0.75, 0.36, door, x, 1.55, -d / 2 + 0.18); K.box(0.012, 0.7, 0.01, K.std({ color: '#6E8268' }), x, 1.57, -d / 2 + 0.365, { shadow: false }); }
  K.box(0.6, 0.02, 0.4, M.steel, 0.35, 0.9, -d / 2 + 0.3); K.cyl(0.012, 0.012, 0.3, M.chrome, 0.35, 0.9, -d / 2 + 0.12);
  // (the fridge in the corner, a kettle, a fruit bowl, a cutting board, a plant on the sill, a hanging rail of pans)
  K.box(0.8, 1.9, 0.7, K.std({ color: '#D9DCDE', roughness: 0.25, metalness: 0.6 }), -w / 2 + 0.45, 0, -d / 2 + 0.38); K.box(0.02, 0.6, 0.03, M.chrome, -w / 2 + 0.78, 0.9, -d / 2 + 0.74);
  K.cyl(0.08, 0.1, 0.2, K.std({ color: '#C62828', roughness: 0.25, metalness: 0.3 }), -1.2, 0.92, -d / 2 + 0.35);
  K.cyl(0.18, 0.12, 0.08, K.std({ color: '#F2EEE6', roughness: 0.3 }), 1.25, 0.92, -d / 2 + 0.35, { seg: 24 });
  { const r = K.rng(371); for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), K.std({ color: ['#E8A33B', '#C0392B', '#8DB33A'][i % 3], roughness: 0.4 })); s.position.set(1.25 + (r() - 0.5) * 0.18, 1.02, -d / 2 + 0.35 + (r() - 0.5) * 0.14); s.castShadow = true; K.group.add(s); } }
  K.box(0.5, 0.03, 0.3, K.std({ color: '#B08458', roughness: 0.6 }), -0.6, 0.92, -d / 2 + 0.35); K.potted(0.35, -d / 2 + 0.08, 0.35, { y: 1.06, pot: '#E8E2D4' });
  K.cyl(0.008, 0.008, 1.2, M.brass, 1.75, 2.1, -d / 2 + 0.42, { rz: PI / 2 }); for (let i = 0; i < 3; i++) K.cyl(0.1 - i * 0.015, 0.1 - i * 0.015, 0.02, M.steel, 1.4 + i * 0.32, 1.95, -d / 2 + 0.42, { rx: PI / 2 });
  K.frame(photo(373, { tone: '#C8B496' }), 0.3, 0.22, w / 2 - 0.03, 1.6, -0.6, -PI / 2, M.white); K.clock(w / 2 - 0.01, 2.1, 0.4, -PI / 2);
  K.pendant(0, 0.55, 1.95, h, { shadeC: '#E8E2D4', r: 0.18 });
  // (they sit at the island: the counter in front of them, stools along it)
  station(K, { chair: K.std({ color: '#5A4636', roughness: 0.7 }), desk: door, top, things: false });
  mug(K, -0.4, 0.775, 0.42, '#2E4C6D'); K.box(0.3, 0.02, 0.22, M.black, 0.4, 0.775, 0.5, { r: 0.008 });
  return {
    light: { sun: { from: [1, 5, -8], to: [0, 0, 0.5], ext: 5, k: 2.6 }, hemi: 1.0, windowK: 1.2,
      points: [screenLight(1.2), { at: [0, 1.85, 0.55], k: 1.2, color: '#FFE0B0', dist: 3 }, { at: [0, 2.5, -1.2], k: 0.8, color: '#FFF3E0', dist: 4 }] },
    marks: { window: [0.35, 1.5, -d / 2] }, seat: SEAT,
  };
}

// a walnut study: bookcases either side of a tall window with drapes, the banker's lamp, a globe, a painting, the
// leather wing chair's warmth (Mr. Big's study, for Mr. Board)
function study(K, def) {
  const M = K.mat, w = 5.0, d = 4.4, h = 3.0;
  const walnut = K.std({ color: '#3B2214', roughness: 0.45 }), walnutD = K.std({ color: '#24140B', roughness: 0.55 });
  K.room({ w, d, h, floor: K.surf(SURF.planks('#5A3A24', 381), [2.5, 2.5], { roughness: 0.35 }), wall: walnutD, skirting: walnut, crown: walnut,
    holes: [{ wall: 'back', x: 0, y: 0.75, w: 1.3, h: 2.0 }], panels: false, lightsAt: [] });
  K.window({ x: 0, z: -d / 2, y: 0.75, w: 1.3, h: 2.0, city: { seed: 383, high: true }, frameM: walnut, mullions: 1, out: 6, light: 0.7 });
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) K.cyl(0.06, 0.09, 2.5, K.std({ color: '#1E3B2A', roughness: 0.9 }), s * (0.78 + i * 0.07), 0.25, -d / 2 + 0.16 + (i % 2) * 0.04, { shadow: false, seg: 10 });
  K.cyl(0.015, 0.015, 2.1, M.brass, 0, 2.78, -d / 2 + 0.18, { rz: PI / 2 });
  K.bookcase(-1.65, -d / 2 + 0.2, 0, 1.3, 2.5, 385, walnut); K.bookcase(1.65, -d / 2 + 0.2, 0, 1.3, 2.5, 387, walnut);
  K.frame(painting(389, ['#2B1A10', '#8C6D3F', '#C9A66B', '#4A2E1C']), 0.9, 1.1, -w / 2 + 0.03, 1.7, -0.2, PI / 2, M.brass);
  { const G = K.grp(1.9, 0, -0.6); K.cyl(0.03, 0.12, 0.85, walnut, 0, 0, 0, { parent: G }); const g = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), K.std({ color: '#B89A62', roughness: 0.5 })); g.position.y = 1.08; g.castShadow = true; G.add(g); const r = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.008, 6, 32), M.brass); r.position.y = 1.08; r.rotation.y = PI / 2; G.add(r); }
  K.rug(3.0, 2.4, 0, 0.1, '#5A1F1A', '#C9A66B', 391);
  station(K, { chair: K.std({ color: '#4A1512', roughness: 0.48 }), desk: walnut, top: K.std({ color: '#1F3326', roughness: 0.6 }), things: false });
  bankersLamp(K, -0.55, 0.775, 0.55, 0.3); folders(K, 0.45, 0.776, 0.5, 3, 0.2, 393); penPot(K, 0.15, 0.776, 0.75);
  return {
    light: { sun: false, hemi: 0.5, hemiK: 0.6,
      points: [screenLight(1.1, '#E2E8FF'), { at: [-0.55, 1.15, 0.5], k: 1.6, color: '#FFD08A', dist: 3 }, { at: [0, 2.2, -d / 2 + 0.4], k: 0.8, color: '#8EA2D8', dist: 3 }, { at: [1.8, 2.6, -0.2], k: 0.7, color: '#FFD49A', dist: 3.5 }] },
    marks: { window: [0, 1.7, -d / 2] }, seat: SEAT, key: 2.0, env: 0.2,
  };
}


// a broadcast van's back, the doors shut: a low curved roof, a rack of monitors and patch bays behind them in the van's
// width, the blue of the feeds on everything, a small round window in the side door onto the lot, cable everywhere, a
// stool, a fan clipped to the rack (the story's own words on the feeds' tally: def.sign)
function van(K, def) {
  const M = K.mat, w = 2.3, d = 3.2, h = 1.95;
  const panel = K.std({ color: '#C9CCD0', roughness: 0.55, metalness: 0.3 }), rack = K.std({ color: '#1A1B1E', roughness: 0.6, metalness: 0.4 });
  K.room({ w, d, h, floor: K.surf(SURF.concrete('#3C3E42', 401), [2, 2], { roughness: 0.7 }), wall: panel, ceiling: K.std({ color: '#B8BCC2', roughness: 0.6 }), skirting: null, crown: null, panels: false, lightsAt: [], holes: [{ wall: 'left', x: 0.3, y: 1.05, w: 0.42, h: 0.42 }] });
  // (the roof's curve into the walls: a fillet each side, the ribs across)
  for (const s of [-1, 1]) { const f = K.box(0.36, 0.36, d, panel, s * (w / 2 - 0.12), h - 0.36, 0, { shadow: false }); f.rotation.z = s * 0.6; }
  for (let i = 0; i < 4; i++) K.box(w - 0.1, 0.05, 0.05, K.std({ color: '#9CA1A8', roughness: 0.5, metalness: 0.5 }), 0, h - 0.05, -d / 2 + 0.5 + i * 0.75, { shadow: false });
  // (the rack: monitors in two rows (the stage feeds, a waveform, the uplink's meters), patch bays, blinking lights)
  K.box(w - 0.2, 1.6, 0.4, rack, 0, 0.15, -d / 2 + 0.22);
  const feed = (seed, kind) => {
    const c = document.createElement('canvas'); c.width = 384; c.height = 216; const x = c.getContext('2d'), r = K.rng(seed);
    if (kind === 'wave') { x.fillStyle = '#06110A'; x.fillRect(0, 0, 384, 216); x.strokeStyle = '#4BE37A'; x.lineWidth = 2; x.beginPath(); for (let i = 0; i < 384; i += 3) x.lineTo(i, 108 + Math.sin(i * 0.09) * 40 * r() + (r() - 0.5) * 30); x.stroke(); }
    else if (kind === 'meter') { x.fillStyle = '#0A0A0C'; x.fillRect(0, 0, 384, 216); for (let i = 0; i < 12; i++) { const hh = 40 + r() * 150; const g = x.createLinearGradient(0, 216, 0, 0); g.addColorStop(0, '#2BD46A'); g.addColorStop(0.7, '#F2D23A'); g.addColorStop(1, '#F2483A'); x.fillStyle = g; x.fillRect(16 + i * 30, 216 - hh, 20, hh); } x.font = '700 22px monospace'; x.fillStyle = '#F2483A'; x.fillText('● ' + (def.sign || 'LIVE UPLOAD').slice(0, 18), 12, 28); }
    else { const g = x.createRadialGradient(192, 90, 10, 192, 110, 240); g.addColorStop(0, '#3E78C0'); g.addColorStop(1, '#04060C'); x.fillStyle = g; x.fillRect(0, 0, 384, 216); x.fillStyle = 'rgba(0,0,0,.8)'; for (let i = 0; i < 40; i++) x.fillRect(r() * 384, 170 + r() * 46, 8 + r() * 6, 26); x.fillStyle = '#E8EEF8'; x.fillRect(184, 84, 12, 48); }
    return c;
  };
  for (const [x, y, kind, seed] of [[-0.62, 1.32, 'stage', 411], [0, 1.32, 'meter', 413], [0.62, 1.32, 'stage', 415], [-0.62, 0.95, 'wave', 417], [0, 0.95, 'stage', 419], [0.62, 0.95, 'meter', 421]]) {
    K.box(0.56, 0.34, 0.04, M.black, x, y - 0.17, -d / 2 + 0.44);
    const t = K.tex(feed(seed, kind)); K.plane(0.52, 0.3, K.std({ map: t, emissive: '#FFFFFF', emissiveMap: t, emissiveIntensity: 1.0, roughness: 0.3 }), x, y, -d / 2 + 0.465);
  }
  { const r = K.rng(423); for (let i = 0; i < 26; i++) K.bulb(-0.85 + r() * 1.7, 0.28 + r() * 0.5, -d / 2 + 0.43, 0.007, ['#4BE37A', '#F2483A', '#F2D23A'][Math.floor(r() * 3)], 2); }
  // (the side door's round window onto the lot; cable coiled on the floor, a fan clipped to the rack, a stool)
  K.window({ x: -w / 2, z: -0.3, y: 1.05, w: 0.42, h: 0.42, ry: PI / 2, city: { seed: 425, tone: '#7A8C9A' }, frameM: rack, mullions: 0, out: 4, sill: false, light: 0.5 });
  K.cyl(0.18, 0.18, 0.06, K.std({ color: '#111', roughness: 0.6 }), 0.7, 0, -0.5, { seg: 18 });
  K.cyl(0.11, 0.11, 0.05, M.black, 0.85, 1.55, -d / 2 + 0.45, { rx: PI / 2, seg: 16 });
  station(K, { chair: K.std({ color: '#2B2F36', roughness: 0.7 }), desk: rack, top: K.std({ color: '#2A2C30', roughness: 0.4 }), seed: 9 });
  return {
    light: { sun: false, hemi: 0.45, hemiK: 0.6,
      points: [screenLight(1.6, '#CFE0FF'), { at: [0, 1.2, -d / 2 + 0.9], k: 2.2, color: '#6F9CFF', dist: 2.6 }, { at: [0, h - 0.15, 0.2], k: 0.9, color: '#F2F4FF', dist: 3 }, { at: [0.6, 0.6, -d / 2 + 0.7], k: 0.6, color: '#4BE37A', dist: 1.6 }] },
    marks: {}, seat: SEAT, key: 1.8, env: 0.2,
  };
}

// a green room behind an arena's stage: a long mirror ringed with bulbs across the back wall, a rail of wardrobe with
// one black leather jacket on its hanger, a fruit platter and bottled water on the counter, a couch, the run of show
// taped up by the door, the house's hum through the walls (warm, flattering light: the bulbs)
function greenroom(K, def) {
  const M = K.mat, w = 5.0, d = 4.4, h = 2.9;
  const wall = K.std({ color: '#2E3A33', roughness: 0.9 });
  K.room({ w, d, h, floor: K.surf(SURF.carpet('#2A2624', 431), [4, 4], { roughness: 1 }), wall, ceiling: K.std({ color: '#1E2220', roughness: 1 }), skirting: M.black, crown: null, panels: false, lightsAt: [] });
  // (the mirror and its bulbs, a counter under it: the fruit, the water, a makeup case)
  K.box(3.4, 1.0, 0.03, K.std({ color: '#C8D2DC', roughness: 0.04, metalness: 0.95 }), 0, 1.15, -d / 2 + 0.04);
  for (let i = 0; i < 9; i++) K.bulb(-1.7 + i * 0.425, 2.22, -d / 2 + 0.07, 0.035, '#FFE6B8', 6);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) K.bulb(s * 1.76, 1.3 + i * 0.32, -d / 2 + 0.07, 0.035, '#FFE6B8', 6);
  const top = K.std({ color: '#D8D2C8', roughness: 0.35 });
  K.box(3.6, 0.04, 0.5, top, 0, 0.9, -d / 2 + 0.27); K.box(3.6, 0.9, 0.46, K.std({ color: '#3A3430', roughness: 0.7 }), 0, 0, -d / 2 + 0.25);
  { const G = K.grp(-1.0, 0.94, -d / 2 + 0.3); K.cyl(0.26, 0.24, 0.03, K.std({ color: '#F2EEE6', roughness: 0.3 }), 0, 0, 0, { parent: G, seg: 28 }); const r = K.rng(433);
    for (let i = 0; i < 22; i++) { const a = r() * 2 * PI, rr = r() * 0.2, c = ['#C62828', '#F9A825', '#7CB342', '#6A1B9A', '#FB8C00', '#E53935'][Math.floor(r() * 6)]; const f = new THREE.Mesh(new THREE.SphereGeometry(0.03 + r() * 0.025, 10, 8), K.std({ color: c, roughness: 0.4 })); f.position.set(Math.cos(a) * rr, 0.05 + r() * 0.04, Math.sin(a) * rr); f.castShadow = true; G.add(f); } }
  for (let i = 0; i < 4; i++) K.cyl(0.032, 0.032, 0.24, K.std({ color: '#BFE3F2', roughness: 0.1, transparent: true, opacity: 0.75 }), 0.5 + i * 0.09, 0.94, -d / 2 + 0.3, { seg: 12 });
  K.box(0.36, 0.18, 0.22, M.black, 1.3, 0.94, -d / 2 + 0.3, { r: 0.02 });
  // (the wardrobe rail, the one jacket: black leather on its hanger, its lapels and zip)
  { const G = K.grp(w / 2 - 0.35, 0, -0.9, -PI / 2); K.cyl(0.015, 0.015, 1.8, M.chrome, -0.55, 0, 0, { parent: G }); K.cyl(0.015, 0.015, 1.8, M.chrome, 0.55, 0, 0, { parent: G }); K.cyl(0.012, 0.012, 1.1, M.chrome, 0, 1.78, 0, { parent: G, rz: PI / 2 });
    const lea = K.std({ color: '#0E0E10', roughness: 0.35, metalness: 0.05 }); K.box(0.5, 0.66, 0.16, lea, 0, 1.06, 0, { parent: G, r: 0.05 }); for (const s of [-1, 1]) { const sl = K.box(0.12, 0.6, 0.12, lea, s * 0.29, 1.08, 0, { parent: G, r: 0.04 }); sl.rotation.z = s * 0.08; }
    K.box(0.006, 0.6, 0.004, M.chrome, 0.02, 1.08, 0.085, { parent: G, shadow: false }); }
  // (the couch along the left wall, the run of show by the door, a speaker on the wall with the house in it)
  K.sofa(-w / 2 + 0.5, 0.3, PI / 2, 1.9, K.std({ color: '#5A4636', roughness: 0.95 }));
  K.box(0.3, 0.4, 0.004, K.std({ map: K.tex(lettering([{ t: 'RUN OF SHOW', font: '700 48px Arial' }, { t: '7:00 HOUSE TO HALF', font: '400 30px Arial' }, { t: '7:02 WALK', font: '400 30px Arial' }], { w: 384, h: 512, bg: '#F2F0EA', fg: '#222', border: null })) }), -1.9, 1.35, -d / 2 + 0.02, { shadow: false });
  K.box(0.24, 0.34, 0.2, M.black, 1.95, 2.2, -d / 2 + 0.12, { r: 0.02 });
  station(K, { chair: K.std({ color: '#1C1C1E', roughness: 0.6 }), desk: K.std({ color: '#3A3430', roughness: 0.6 }), seed: 11 });
  return {
    light: { sun: false, hemi: 0.55, hemiK: 0.6,
      points: [screenLight(1.3), { at: [0, 2.0, -d / 2 + 0.5], k: 3.2, color: '#FFE2B0', dist: 4 }, { at: [-1.7, 1.6, -d / 2 + 0.4], k: 1.2, color: '#FFE2B0', dist: 2.5 }, { at: [1.7, 1.6, -d / 2 + 0.4], k: 1.2, color: '#FFE2B0', dist: 2.5 }] },
    marks: { mirror: [0, 1.6, -d / 2] }, seat: SEAT, key: 1.8, env: 0.22,
  };
}

/* ------------------------------------------- where the story goes out (19 Nov) -- */
// (the looks below are for calls taken where the story is, not at a desk: a food truck's kitchen, a diner booth, a lot
// out back, a green by the station, the front seat of a car, row one of an arena's seats. Each is still seen the way a
// webcam sees it, a phone propped in front of them: the person sat at x 0 z 0 facing +z on something at the seat's
// height, what is behind them dressed for that one view)

// what they sit on away from a desk (a stool, a crate, a bench's slats) and, if any, the near edge in front of the lens
function perch(K, { seat, top = null, base = null, h = 0.9, w = 1.3 } = {}) {
  if (seat) seat();
  if (top) { K.box(w, 0.045, 0.5, top, 0, h - 0.045, 0.66, { r: 0.008 }); if (base) K.box(w - 0.06, h - 0.045, 0.02, base, 0, 0, 0.9); }
}
const stool = (K, m, leg) => () => { K.cyl(0.19, 0.19, 0.05, m, 0, SEAT.y - 0.05, -0.04, { seg: 24 }); for (let i = 0; i < 4; i++) { const a = PI / 4 + (i * PI) / 2; K.cyl(0.015, 0.015, SEAT.y - 0.05, leg, Math.sin(a) * 0.15, 0, -0.04 + Math.cos(a) * 0.15, { seg: 8 }); } };

// a food truck's kitchen, Lola's: steel walls and a diamond-plate floor, the flat-top and its hood across the back, the
// serving window open on the left (the line outside), the ticket rail, the squeeze bottles, the blue cooler on the
// floor, and the old door she painted OPEN hung on the wall. The cook sits on a stool at the prep counter
function truck(K, def) {
  const M = K.mat, w = 2.3, d = 4.0, h = 2.15;
  const steel = K.std({ color: '#A4AAB1', roughness: 0.4, metalness: 0.8 }), steelD = K.std({ color: '#6E747B', roughness: 0.42, metalness: 0.8 });
  // (the prep counter in front of the lens: brushed, darker, so the screen's light on it does not burn out the frame)
  const brushed = K.std({ color: '#7C838B', roughness: 0.58, metalness: 0.65 });
  K.room({ w, d, h, floor: K.surf(SURF.tiles('#9FA4AA', '#868B91', 18, 441, 0.04), [2, 3], { roughness: 0.32, metalness: 0.7 }), wall: steel, ceiling: K.std({ color: '#E6E3DC', roughness: 0.6 }),
    skirting: null, crown: null, panels: false, lightsAt: [], ao: 0.3, holes: [{ wall: 'left', x: 0.35, y: 0.98, w: 1.5, h: 0.82 }] });
  // (the serving window: the square's light through it, the ledge outside, its awning's edge)
  K.window({ x: -w / 2, z: -0.35, y: 0.98, w: 1.5, h: 0.82, ry: PI / 2, city: { seed: 443, tone: '#C9A27A' }, frameM: steelD, mullions: 0, out: 5, sill: false, light: 0.8 });
  K.box(0.32, 0.04, 1.6, steel, -w / 2 - 0.1, 0.95, -0.35); K.box(0.06, 0.08, 1.7, K.std({ color: '#E8B23A', roughness: 0.6 }), -w / 2 - 0.3, 1.86, -0.35, { shadow: false });
  // (the line across the back: the base cabinets, the flat-top, the hood over it with its filters and its warm glow)
  K.box(w - 0.1, 0.86, 0.66, steel, 0, 0, -d / 2 + 0.34); for (let i = 0; i < 3; i++) K.box(0.62, 0.7, 0.01, steelD, -0.72 + i * 0.72, 0.08, -d / 2 + 0.675, { shadow: false });
  K.box(1.3, 0.05, 0.6, K.std({ color: '#141416', roughness: 0.35, metalness: 0.6 }), -0.3, 0.86, -d / 2 + 0.36);
  K.box(1.24, 0.004, 0.54, K.std({ color: '#2A1206', emissive: '#FF5A1A', emissiveIntensity: 0.6, roughness: 0.4 }), -0.3, 0.912, -d / 2 + 0.36, { shadow: false });
  { const G = K.grp(0, 1.55, -d / 2 + 0.36); const hood = K.box(w - 0.12, 0.5, 0.72, steel, 0, 0, 0, { parent: G }); hood.rotation.x = 0.08;
    for (let i = 0; i < 4; i++) K.box(0.42, 0.3, 0.01, K.std({ color: '#5E6369', roughness: 0.5, metalness: 0.7 }), -0.75 + i * 0.5, 0.08, 0.3, { parent: G, shadow: false });
    K.box(w - 0.3, 0.025, 0.04, K.std({ color: '#FFF4E0', emissive: '#FFD9A0', emissiveIntensity: 1.3 }), 0, -0.02, 0.32, { parent: G, shadow: false }); }
  // (on the flat-top and the counter by it: a pot, brisket resting on its board, the squeeze bottles, a tub of rolls)
  K.cyl(0.14, 0.13, 0.22, steelD, -0.75, 0.91, -d / 2 + 0.36, { seg: 20 });
  K.box(0.42, 0.03, 0.28, K.std({ color: '#B08458', roughness: 0.6 }), 0.55, 0.88, -d / 2 + 0.38); K.box(0.3, 0.09, 0.14, K.std({ color: '#3A1A0E', roughness: 0.7 }), 0.55, 0.91, -d / 2 + 0.38, { r: 0.03 });
  for (let i = 0; i < 4; i++) K.cyl(0.03, 0.032, 0.2, K.std({ color: ['#C62828', '#F2B92B', '#C62828', '#F2F0EA'][i], roughness: 0.35 }), 0.85 + i * 0.075, 0.88, -d / 2 + 0.22, { seg: 12 });
  K.box(0.3, 0.12, 0.22, K.std({ color: '#E8DCC4', roughness: 0.7 }), -0.05, 0.88, -d / 2 + 0.2, { r: 0.02 });
  // (the ticket rail on the right wall, its orders clipped up; the utensils on their hooks; the old door: OPEN)
  K.box(0.02, 0.025, 1.4, steelD, w / 2 - 0.02, 1.62, -0.6);
  { const r = K.rng(445); for (let i = 0; i < 7; i++) { const t = K.box(0.004, 0.14 + r() * 0.06, 0.09, M.paper, w / 2 - 0.03, 1.46 - r() * 0.04, -1.2 + i * 0.19, { shadow: false }); t.rotation.x = (r() - 0.5) * 0.15; } }
  for (let i = 0; i < 5; i++) K.cyl(0.006, 0.006, 0.34, M.chrome, -w / 2 + 0.03, 1.15, -1.55 + i * 0.12, { rz: 0.05, seg: 6 });
  K.cyl(0.01, 0.01, 0.7, M.chrome, -w / 2 + 0.03, 1.5, -1.3, { rx: PI / 2, seg: 6 });
  { const c = lettering([{ t: 'OPEN', font: '800 210px Georgia, serif', fg: '#F2E6C9' }], { w: 512, h: 1024, bg: '#6E4B32', fg: '#F2E6C9' }); const x = c.getContext('2d'), r = K.rng(447);
    x.globalCompositeOperation = 'multiply'; for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(60,40,25,${0.05 + r() * 0.1})`; x.fillRect(0, r() * 1024, 512, 2 + r() * 6); } x.globalCompositeOperation = 'source-over';
    const G = K.grp(w / 2 - 0.03, 0, 0.6, -PI / 2); K.box(0.62, 1.25, 0.035, K.std({ map: K.tex(c), roughness: 0.75 }), 0, 0.55, 0, { parent: G }); K.box(0.06, 0.06, 0.05, M.brass, 0.24, 1.1, 0.03, { parent: G }); }
  // (the blue cooler on the floor by the back wall, its white lid; a crate of buns on it)
  K.box(0.62, 0.42, 0.4, K.std({ color: '#2E6FD0', roughness: 0.4 }), 0.72, 0, -1.25, { r: 0.04 }); K.box(0.64, 0.06, 0.42, K.std({ color: '#F2F2EE', roughness: 0.4 }), 0.72, 0.42, -1.25, { r: 0.02 });
  K.prop('plastic-crate', 0.7, 0.48, -1.25, { ry: 0.1, s: 0.9 });
  // (the strip light, its tube glowing)
  K.box(0.08, 0.04, 1.6, K.std({ color: '#FFFFFF', emissive: '#F2F6FF', emissiveIntensity: K.night ? 0.8 : 1.2 }), 0.2, h - 0.04, -0.6, { shadow: false });
  perch(K, { seat: stool(K, K.std({ color: '#2B2B2E', roughness: 0.6 }), M.chrome), top: brushed, base: steelD, h: 0.8 });
  K.box(0.3, 0.02, 0.22, K.std({ color: '#B08458', roughness: 0.6 }), 0.35, 0.8, 0.55); mug(K, -0.42, 0.8, 0.5, '#E8B23A');
  return {
    light: { sun: false, hemi: 0.5, hemiK: 0.6, windowK: 0.8,
      points: [screenLight(1.0), { at: [0.2, 1.95, -0.6], k: 1.2, color: '#F4F6FF', dist: 3.6 }, { at: [-0.3, 1.1, -d / 2 + 0.5], k: 1.6, color: '#FF8A3D', dist: 2.4 }] },
    marks: { window: [-w / 2, 1.4, -0.35] }, seat: SEAT, key: 1.6, env: 0.25,
  };
}

// a diner booth, the corner diner's: they sit in the booth in its red vinyl, its tall tufted back behind their shoulders,
// the table in front (formica, a chrome edge, the syrup, the napkins, a stack of pancakes); behind the booth the counter
// with its stools, the pie case, the coffee urns, the menu board, the window onto the street on the right
function diner(K, def) {
  const M = K.mat, w = 5.2, d = 5.4, h = 2.9;
  const red = K.std({ color: '#A8262B', roughness: 0.42 }), redD = K.std({ color: '#7E1A1F', roughness: 0.5 }), chrome = M.chrome, cream = K.std({ color: '#F1E6CF', roughness: 0.6 });
  K.room({ w, d, h, floor: K.surf(SURF.checker('#EDE6D6', '#1E1E20', 12, 451), [3, 3], { roughness: 0.3 }), wall: K.surf(SURF.paint('#F1E6CF', 453), [2, 2], { roughness: 0.8 }),
    wallBack: K.surf(SURF.tiles('#F4F1EA', '#2E7D6B', 14, 455, 0.06), [4, 2], { roughness: 0.25 }), ceiling: K.std({ color: '#EDE8DD', roughness: 0.8 }), skirting: chrome, crown: null, panels: false, lightsAt: [],
    holes: [{ wall: 'right', x: 0.4, y: 0.85, w: 2.4, h: 1.3 }] });
  K.window({ x: w / 2, z: -0.4, y: 0.85, w: 2.4, h: 1.3, ry: -PI / 2, city: { seed: 457, tone: '#C8A88A' }, blinds: 0.25, frameM: chrome, mullions: 1, out: 6 });
  // (the booth they sit in: the seat under them, the tall back behind, tufted in rows, its chrome cap)
  const booth = (z, flip = 1) => { const G = K.grp(0, 0, z, flip > 0 ? 0 : PI);
    K.box(1.7, 0.42, 0.55, redD, 0, 0, 0.12, { parent: G }); K.box(1.7, 0.1, 0.55, red, 0, 0.42, 0.12, { parent: G, r: 0.04 });
    K.box(1.7, 0.78, 0.16, red, 0, 0.5, -0.2, { parent: G, r: 0.05 }); K.box(1.72, 0.05, 0.2, chrome, 0, 1.28, -0.2, { parent: G });
    for (let i = 0; i < 5; i++) K.box(0.012, 0.66, 0.01, redD, -0.68 + i * 0.34, 0.56, -0.115, { parent: G, shadow: false }); return G; };
  booth(-0.18);
  // (the counter across the back: its red front and chrome band, the stools, the pie case, the urns, the register)
  const zc = -2.15;
  K.box(w - 0.6, 0.98, 0.62, red, 0, 0, zc); K.box(w - 0.56, 0.05, 0.7, K.surf(SURF.marble('#ECE6DA', '#B5ADA0', 459), [2, 1], { roughness: 0.15 }), 0, 0.98, zc); K.box(w - 0.58, 0.06, 0.01, chrome, 0, 0.75, zc + 0.315, { shadow: false });
  for (let i = 0; i < 5; i++) K.prop('bar-stool', -1.8 + i * 0.9, 0, zc + 0.62, { ry: (i * 0.9) % 1.2 });
  K.box(0.9, 0.42, 0.5, M.glass, -1.1, 1.03, zc - 0.05, { shadow: false }); for (let i = 0; i < 3; i++) { K.cyl(0.13, 0.13, 0.05, K.std({ color: ['#C9853A', '#8C2E2A', '#E8C26A'][i], roughness: 0.6 }), -1.4 + i * 0.3, 1.06, zc - 0.05, { seg: 22 }); K.cyl(0.13, 0.13, 0.05, K.std({ color: '#D9A35A', roughness: 0.6 }), -1.4 + i * 0.3, 1.25, zc - 0.05, { seg: 22 }); }
  for (const x of [0.6, 0.95]) { K.cyl(0.13, 0.13, 0.5, chrome, x, 1.03, zc - 0.15, { seg: 20 }); K.cyl(0.02, 0.02, 0.06, M.black, x, 1.08, zc, { rx: PI / 2, seg: 8 }); }
  K.box(0.36, 0.26, 0.32, K.std({ color: '#2B2D31', roughness: 0.4 }), 1.7, 1.03, zc - 0.05);
  // (the back wall: the menu board, the clock, the pass to the kitchen and its order wheel)
  { const t = lettering([{ t: 'BREAKFAST ALL DAY', font: '700 92px Georgia, serif', fg: '#F2C14E' }, { t: 'PANCAKES 6 · EGGS ANY WAY 7 · COFFEE 2', font: '600 58px Arial', fg: '#F2F0EA' }, { t: 'PIE BY THE SLICE 4', font: '600 58px Arial', fg: '#F2F0EA' }], { w: 2048, h: 560, bg: '#1C2420', border: '#F2C14E' });
    K.box(2.6, 0.72, 0.04, K.std({ map: K.tex(t), emissive: '#FFFFFF', emissiveMap: K.tex(t), emissiveIntensity: 0.4, roughness: 0.5 }), -0.3, 1.75, -d / 2 + 0.03, { shadow: false }); }
  K.clock(1.75, 2.15, -d / 2 + 0.02);
  K.box(1.2, 0.5, 0.02, K.std({ color: '#141414', roughness: 0.9 }), 1.6, 1.25, -d / 2 + 0.01, { shadow: false }); K.box(1.3, 0.03, 0.25, chrome, 1.6, 1.25, -d / 2 + 0.12);
  for (const x of [-1.5, 0, 1.5]) K.pendant(x, zc, 2.15, h, { shadeC: '#2E7D6B', r: 0.16 });
  // (their table: formica, the chrome edge, the napkins, the syrup, the mug, the pancakes)
  K.box(1.3, 0.04, 0.62, K.std({ color: '#E9E2D2', roughness: 0.35 }), 0, 0.72, 0.62, { r: 0.01 }); K.box(1.32, 0.03, 0.64, chrome, 0, 0.7, 0.62); K.cyl(0.04, 0.05, 0.7, chrome, 0, 0, 0.7);
  K.box(0.1, 0.12, 0.08, chrome, -0.45, 0.76, 0.5); K.box(0.08, 0.1, 0.001, M.paper, -0.45, 0.78, 0.541, { shadow: false });
  K.cyl(0.035, 0.04, 0.16, K.std({ color: '#B8701E', roughness: 0.1, transparent: true, opacity: 0.85 }), -0.3, 0.76, 0.48, { seg: 14 }); K.cyl(0.02, 0.02, 0.03, chrome, -0.3, 0.92, 0.48, { seg: 10 });
  K.cyl(0.03, 0.03, 0.17, K.std({ color: '#C62828', roughness: 0.35 }), -0.2, 0.76, 0.46, { seg: 12 });
  mug(K, 0.38, 0.76, 0.48, '#F2EEE6');
  K.cyl(0.13, 0.13, 0.012, M.white, 0.05, 0.76, 0.6, { seg: 24 }); for (let i = 0; i < 3; i++) K.cyl(0.085, 0.085, 0.018, K.std({ color: '#D49A52', roughness: 0.6 }), 0.05, 0.775 + i * 0.019, 0.6, { seg: 22 });
  return {
    light: { sun: { from: [8, 5, 1], to: [0, 0, -0.5], ext: 6 }, hemi: 0.9, windowK: 1.0,
      points: [screenLight(1.25), { at: [0, 2.3, 0.3], k: 1.1, color: '#FFE8C8', dist: 3.5 }].concat([-1.5, 0, 1.5].map((x) => ({ at: [x, 2.0, zc], k: 1.2, color: '#FFD9A0', dist: 3 }))) },
    marks: { counter: [0, 1.0, zc], window: [w / 2, 1.5, -0.4] }, seat: SEAT, key: 1.7, env: 0.4,
  };
}

// a lot out back: asphalt and its painted lines, the back of a building with its loading dock (a raised deck, a roll-up
// door, yellow bumpers, a dock light), a dumpster and the blue recycling bins, flattened boxes and crates, a delivery van
// parked by the dock, a light pole, the blocks beyond. They sit on a stack of pallets, the phone propped in front
function lot(K, def) {
  const M = K.mat;
  outdoors(K, { w: 14, d: 14, paving: K.scan('asphalt-clean', { tint: '#9A968F', rough: 0.85, tile: 2.6 }), seed: 461, trees: false });
  for (let i = 0; i < 6; i++) K.box(0.1, 0.004, 4.8, K.std({ color: '#E8E4D8', roughness: 0.7 }), -5 + i * 2.6, 0.003, 2.5, { shadow: false });
  // (the building's back: concrete block below, brick above, the dock deck and its door, the bumpers, the light)
  const block = K.scan('concrete', { tint: '#B4AEA4', rough: 0.85, tile: 1.4 }), brick = K.scan('brick', { tint: '#B89A8A', rough: 0.9, nscale: 1.2 });
  const z0 = -5.2, dw = 3.2, dh = 3.0, dx = 0.6, deck = 1.1;
  K.plane(18, 9, brick, 0, 4.5, z0 - 0.02, { ox: -9 });
  K.box(7.0, deck, 2.2, block, dx, 0, z0 + 1.1); K.box(7.0, 0.06, 0.08, K.std({ color: '#F2C200', roughness: 0.6 }), dx, deck - 0.03, z0 + 2.2, { shadow: false });
  for (const s of [-1, 1]) K.box(0.28, 0.5, 0.14, K.std({ color: '#1C1C1C', roughness: 0.85 }), dx + s * 1.3, deck - 0.6, z0 + 2.25);
  K.plane(dw, dh, K.scan('corrugated-metal', { tint: '#C9CDD2', rough: 0.55, metal: 0.6, tile: 1.2 }), dx, deck + dh / 2, z0 + 0.01);
  K.box(dw + 0.24, 0.16, 0.2, M.steel, dx, deck + dh, z0 + 0.08); for (const s of [-1, 1]) K.box(0.12, dh, 0.16, M.steel, dx + s * (dw / 2 + 0.06), deck, z0 + 0.06);
  K.prop('wall-lantern', dx + 2.4, deck + 2.6, z0 + 0.02, { s: 0.7 }); K.bulb(dx + 2.4, deck + 2.52, z0 + 0.38, 0.04, '#FFD890', K.night ? 14 : 4);
  K.box(0.9, 0.5, 0.02, K.std({ map: K.tex(lettering([{ t: 'DOCK 2', font: '800 120px Arial' }, { t: 'DELIVERIES', font: '600 64px Arial' }], { w: 512, h: 288, bg: '#F2F2EE', fg: '#1C1C1C' })) }), dx - 2.6, deck + 1.8, z0 + 0.01, { shadow: false });
  // (a delivery van by the dock, its side to us: white, its wheels, its windows dark)
  { const G = K.grp(-3.9, 0, -2.9, 0.12), vb = K.std({ color: '#DADCDE', roughness: 0.35, metalness: 0.3 }), dark = K.std({ color: '#15181C', roughness: 0.15, metalness: 0.5 });
    K.box(1.95, 1.9, 4.8, vb, 0, 0.42, 0, { parent: G, r: 0.12 }); K.box(1.9, 0.5, 1.0, dark, 0, 1.55, 1.95, { parent: G, r: 0.08 }); K.box(1.97, 0.55, 0.9, dark, 0, 1.5, 1.2, { parent: G, shadow: false });
    for (const [x, z] of [[-1, 1.6], [1, 1.6], [-1, -1.6], [1, -1.6]]) K.cyl(0.36, 0.36, 0.26, M.black, x, 0.36, z, { parent: G, rz: PI / 2, seg: 20 }); }
  // (the dumpster, the blue recycling bins, the cans; flattened boxes, crates)
  K.box(1.9, 1.2, 1.1, K.std({ color: '#2F5D3A', roughness: 0.55, metalness: 0.4 }), 3.6, 0, -3.6, { r: 0.03 }); K.box(2.0, 0.08, 1.2, K.std({ color: '#244A2E', roughness: 0.5, metalness: 0.4 }), 3.6, 1.2, -3.6); K.blob(3.6, -3.6, 2.4, 1.6, 0.55);
  for (let i = 0; i < 3; i++) { const x = 2.0 - i * 0.72; K.box(0.62, 1.0, 0.7, K.std({ color: '#2058B8', roughness: 0.5 }), x, 0, -2.6, { r: 0.04 }); K.box(0.66, 0.06, 0.74, K.std({ color: '#1A4A9C', roughness: 0.45 }), x, 1.0, -2.62); K.box(0.4, 0.1, 0.004, K.std({ map: K.tex(lettering('RECYCLE', { w: 256, h: 64, bg: '#2058B8', fg: '#F2F2F2', font: '700 40px Arial' })) }), x, 0.62, -2.25, { shadow: false }); }
  K.prop('trash-cans', 4.9, 0, -2.4, { parts: ['metal_trash_can', 'metal_trash_can_lid'] });
  K.prop('cardboard-box', -1.5, 0, -3.2, { ry: 0.4 }); K.prop('cardboard-box', -1.45, 0.33, -3.22, { ry: -0.2 }); K.prop('plastic-crate', -0.9, 0, -3.5, { ry: 0.3 });
  K.prop('street-lamp', 5.6, 0, 0.6, { ry: -PI / 2 });
  // (the pallets they sit on, three high; a coffee by them)
  const pal = K.std({ color: '#A8865E', roughness: 0.9 });
  for (let k = 0; k < 3; k++) { const y = k * 0.155; K.box(1.0, 0.03, 0.8, pal, 0.1, y + 0.125, -0.05); for (const s of [-1, 0, 1]) K.box(0.1, 0.095, 0.8, pal, 0.1 + s * 0.42, y + 0.03, -0.05); }
  K.cyl(0.04, 0.035, 0.13, K.std({ color: '#F4F1EA', roughness: 0.7 }), 0.45, 0.495, 0.1, { seg: 14 });
  return {
    light: { sun: { from: [-6, 9, 7], to: [0, 0, -2], ext: 9 }, hemi: 1.0, hemiK: 0.6,
      points: [screenLight(1.0), ...(K.night ? [{ at: [dx + 2.4, deck + 2.5, z0 + 0.6], k: 6, color: '#FFD890', dist: 9 }] : [])] },
    env: 0.5, marks: { dock: [dx, deck + 1.5, z0] }, seat: SEAT, key: 1.6,
  };
}

// a green by the station: the lawn, its path and lamp posts, the trees, a bench they sit on, the station's canopy across
// the street, a pair of tents pitched on the grass (the fans who came early)
function green(K, def) {
  const M = K.mat;
  outdoors(K, { w: 14, d: 14, paving: K.scan('grass', { tint: '#B8C8A0', rough: 1, tile: 2 }), seed: 471, trees: true });
  const paving = K.surf(SURF.paving('#B4AEA2', 4, 473), [8, 1], { roughness: 0.85 });
  K.plane(16, 1.8, paving, 0, 0.008, -3.4, { rx: -PI / 2 }); K.plane(1.6, 6, paving, 3.4, 0.008, -6.6, { rx: -PI / 2 });
  const r = K.rng(475), crowns = ['#3F6B32', '#4E7A3A', '#5A8442'].map((c) => K.std({ color: c, roughness: 0.85 })), bark = K.std({ color: '#4A3B2E', roughness: 1 });
  for (const [x, z, s] of [[-4.2, -6.2, 1.15], [5.6, -7.5, 1.3], [-8, -3, 1.0]]) tree(K, x, z, s, r, crowns, bark);
  for (const x of [-2.6, 6.8]) K.prop('street-lamp', x, 0, -2.4, { ry: PI });
  // (the station across the street: a long low hall in stone and glass, its canopy on columns, its clock)
  K.block(1.5, -20, 22, 8, 9, { style: 'stone', seed: 477, shop: false });
  { const cm = K.std({ color: '#3A4048', roughness: 0.4, metalness: 0.6 }); K.box(16, 0.3, 3.2, cm, 1.5, 4.2, -15.0); for (let i = 0; i < 6; i++) K.cyl(0.12, 0.12, 4.2, cm, -5.5 + i * 2.8, 0, -13.6); K.clock(1.5, 6.2, -15.97); }
  // (two tents on the grass, guy lines and all; a folding chair by one)
  const tent = (x, z, c, ry) => { const g = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, 2 * PI, 0, PI / 2), K.std({ color: c, roughness: 0.75 })); g.scale.set(1.1, 0.85, 0.9); g.position.set(x, 0, z); g.rotation.y = ry; g.castShadow = g.receiveShadow = true; K.group.add(g); K.blob(x, z, 2.4, 2.0, 0.4); };
  tent(-2.2, -5.6, '#2E7D6B', 0.3); tent(1.6, -6.8, '#E8B23A', -0.4);
  // (the bench under them: slats, its back behind, iron ends)
  const G = K.grp(0, 0, -0.05);
  for (let i = 0; i < 4; i++) K.box(1.8, 0.035, 0.09, M.wood, 0, SEAT.y - 0.035, -0.18 + i * 0.11, { parent: G });
  for (let i = 0; i < 3; i++) K.box(1.8, 0.09, 0.03, M.wood, 0, SEAT.y + 0.12 + i * 0.12, -0.3, { parent: G });
  for (const s of [-1, 1]) { K.box(0.06, SEAT.y - 0.035, 0.45, M.black, s * 0.8, 0, -0.05, { parent: G }); K.box(0.05, 0.45, 0.05, M.black, s * 0.8, SEAT.y, -0.3, { parent: G }); }
  K.blob(0, -0.05, 2.2, 0.9, 0.35);
  K.prop('trash-cans', 1.6, 0, -0.8, { parts: ['metal_trash_can'] });
  return { light: { sun: { from: [5, 11, -4], to: [0, 0, 0], ext: 10 }, hemi: 1.0, hemiK: 0.6, points: [screenLight(1.0)] }, env: 0.5, marks: { station: [1.5, 3, -16] }, seat: SEAT, key: 1.6 };
}

// the front seat of a car, the phone on the dash: dark leather, the headrest behind them, the other front seat beside
// them, the door and its window on their left (the street going by), the back seat and the rear window behind, the
// pillars and the roof's lining; a dash's light on their face
function car(K, def) {
  const M = K.mat, x0 = -0.62, x1 = 1.28, zb = -1.75, top = 1.62, sill = 0.98;
  const trim = K.std({ color: '#1B1C1F', roughness: 0.6 }), leather = K.std({ color: '#26272B', roughness: 0.48 }), liner = K.std({ color: '#3A3B3F', roughness: 0.95 }), pillar = K.std({ color: '#2A2B2F', roughness: 0.7 });
  const out = K.scan('asphalt-clean', { tint: '#8E8A84', rough: 0.85, tile: 2 }); K.plane(40, 40, out, 0, -0.35, 0, { rx: -PI / 2 });
  K.box(x1 - x0, 0.08, 3.0, trim, (x0 + x1) / 2, 0.02, -0.4);
  K.box(x1 - x0 + 0.1, 0.06, 2.8, liner, (x0 + x1) / 2, top, -0.4);
  // (the doors: their panels below the glass, an armrest, the windows above them with the street through)
  for (const [x, ry] of [[x0, PI / 2], [x1, -PI / 2]]) {
    K.box(0.08, sill - 0.08, 2.6, trim, x, 0.08, -0.45); K.box(0.12, 0.05, 0.6, leather, x + (ry > 0 ? 0.08 : -0.08), 0.68, -0.05);
    K.window({ x, z: x < 0 ? -0.25 : 0.25, y: sill, w: 0.95, h: top - sill - 0.08, ry, city: { seed: x < 0 ? 481 : 483, tone: '#9C8F80' }, frameM: pillar, mullions: 0, out: 5, sill: false, light: 0.8 });
    K.window({ x, z: x < 0 ? -1.3 : 1.3, y: sill + 0.04, w: 0.7, h: top - sill - 0.14, ry, city: { seed: 485, tone: '#9C8F80' }, frameM: pillar, mullions: 0, out: 5, sill: false, light: 0.5 });
  }
  for (const z of [0.42, -0.82]) for (const x of [x0, x1]) K.box(0.14, top - sill, 0.14, pillar, x, sill, z);
  // (the back: the rear seat, its headrests, the parcel shelf, the rear window)
  K.box(x1 - x0 - 0.1, 0.42, 0.6, leather, (x0 + x1) / 2, 0.08, zb + 0.55, { r: 0.05 }); K.box(x1 - x0 - 0.1, 0.62, 0.16, leather, (x0 + x1) / 2, 0.5, zb + 0.2, { r: 0.05 });
  for (const x of [-0.05, 0.85]) K.box(0.26, 0.16, 0.1, leather, x, 1.16, zb + 0.18, { r: 0.04 });
  K.box(x1 - x0, 0.04, 0.3, trim, (x0 + x1) / 2, 1.12, zb + 0.02);
  K.plane(x1 - x0, top - sill, trim, (x0 + x1) / 2, (top + sill) / 2, zb - 0.16);
  K.window({ x: (x0 + x1) / 2, z: zb - 0.12, y: 1.16, w: 1.5, h: 0.4, city: { seed: 487, tone: '#9C8F80' }, frameM: pillar, mullions: 0, out: 6, sill: false, light: 0.6 });
  // (their seat: the cushion under them, the back behind, its headrest; the other front seat beside them)
  const seat = (x, them) => { K.box(0.56, 0.12, 0.56, leather, x, SEAT.y - 0.12, 0.02, { r: 0.05 }); K.box(0.4, SEAT.y - 0.12, 0.4, trim, x, 0, 0.02);
    const b = K.box(0.54, 0.82, 0.14, leather, x, 0, 0, { parent: K.grp(x, SEAT.y - 0.04, -0.3), r: 0.06 }); b.position.x = 0; b.parent.rotation.x = -0.16;
    K.box(0.28, 0.2, 0.12, leather, x, SEAT.y + 0.88, -0.44, { r: 0.05 }); for (const s of [-1, 1]) K.cyl(0.008, 0.008, 0.08, M.chrome, x + s * 0.08, SEAT.y + 0.82, -0.42, { seg: 6 });
    if (!them) K.box(0.08, 0.3, 0.3, trim, x - 0.36, SEAT.y - 0.15, 0.2); };
  seat(0, true); seat(0.78, false);
  return {
    sky: K.night ? '#070A14' : null,
    light: { sun: { from: [-6, 7, -2], to: [0, 0.8, 0], ext: 3 }, hemi: 0.7, hemiK: 0.55, windowK: 0.9,
      points: [screenLight(1.4, '#D6E2FF'), { at: [0.3, 1.5, -0.4], k: 0.4, color: '#FFF3E0', dist: 2 }, { at: [0, 0.8, 0.7], k: 0.6, color: '#7FA6FF', dist: 1.4 }] },
    marks: {}, seat: SEAT, key: 1.7, env: 0.35,
  };
}

// row one of an arena's seats, the show about to start: their seat's back behind them, the rows rising behind it into the
// dark, full (shoulders and heads in the stage's spill, their phones up), the aisle's step lights, the stage's light on
// their face from in front (lime and warm white)
function house(K, def) {
  const rows = 12, per = 26, rise = 0.42, pitch = 0.9, n = rows * per;
  const floor = K.std({ color: '#121317', roughness: 0.95 });
  K.box(16, 0.02, 4, floor, 0, -0.02, 1);
  for (let j = 1; j < rows; j++) K.box(16, j * rise, pitch, floor, 0, 0, -j * pitch, { shadow: false });
  const IM = (g, m, count, col) => { const o = new THREE.InstancedMesh(g, m, count); o.castShadow = false; o.receiveShadow = false; if (col) o.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3); K.group.add(o); return o; };
  const seatM = K.std({ color: '#1F2A44', roughness: 0.6 }), bodyM = K.std({ color: '#FFFFFF', roughness: 0.92 }), skinM = K.std({ color: '#FFFFFF', roughness: 0.7 });
  const phoneM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.6, 3.0), side: THREE.DoubleSide, fog: false });
  const backs = IM(new THREE.BoxGeometry(0.46, 0.5, 0.06), seatM, n), bodies = IM(torsoGeo(), bodyM, n, true), heads = IM(new THREE.SphereGeometry(0.105, 12, 10), skinM, n, true), hair = IM(new THREE.SphereGeometry(0.112, 10, 8, 0, 2 * PI, 0, PI * 0.55), bodyM, n, true), phones = IM(new THREE.PlaneGeometry(0.075, 0.14), phoneM, 90);
  const mx = new THREE.Matrix4(), hide = new THREE.Matrix4().makeScale(0, 0, 0), col = new THREE.Color(), q = new THREE.Quaternion(), e = new THREE.Euler(), at = new THREE.Vector3(), sc = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), r = K.rng(491);
  const SKIN = ['#F1C9A5', '#E0AC86', '#C68B62', '#A86F4B', '#8A5639', '#6B3F28', '#F4D3B8', '#D9A07A'], CLOTH = ['#1F2A44', '#3B3B3B', '#7A1F2B', '#2E5E4A', '#C9C2B4', '#1C1C1E', '#3E6E8E', '#8C5A3A', '#B8432E', '#5A4A7A', '#E8E2D4', '#76B900'], HAIR = ['#1A1410', '#2B1D14', '#4A3222', '#6B4A2E', '#A07A4A', '#7A7A7A', '#0E0E0E'];
  let k = 0, pk = 0;
  for (let j = 0; j < rows; j++) for (let i = 0; i < per; i++, k++) {
    const x = -6.5 + i * 0.52 + (j % 2) * 0.26, z = -j * pitch, y = j * rise, mine = j === 0 && Math.abs(x) < 0.3, aisle = Math.abs(x - 3.3) < 0.35;
    backs.setMatrixAt(k, aisle ? hide : mx.makeTranslation(x, y + 0.62, z - 0.3));
    if (mine || aisle || r() > 0.92) { bodies.setMatrixAt(k, hide); heads.setMatrixAt(k, hide); hair.setMatrixAt(k, hide); continue; }
    const stand = r() < 0.35, by = y + (stand ? 1.05 : 0.72), hy = by + 0.58 + (r() - 0.5) * 0.06, dx = (r() - 0.5) * 0.08, gs = 0.88 + r() * 0.3;
    bodies.setMatrixAt(k, mx.compose(at.set(x + dx, by, z - 0.05), q.setFromEuler(e.set((r() - 0.5) * 0.1, (r() - 0.5) * 0.3, (r() - 0.5) * 0.08)), sc.set(gs, 0.92 + r() * 0.14, gs)));
    heads.setMatrixAt(k, mx.compose(at.set(x + dx, hy, z - 0.08), q.identity(), sc.set(0.95, 1.1, 1)));
    hair.setMatrixAt(k, r() < 0.08 ? hide : mx.compose(at.set(x + dx, hy + 0.01, z - 0.095), q.setFromEuler(e.set(0.35, 0, 0)), one));
    bodies.setColorAt(k, col.set(CLOTH[Math.floor(r() * CLOTH.length)]).multiplyScalar(0.45 + r() * 0.3)); heads.setColorAt(k, col.set(SKIN[Math.floor(r() * SKIN.length)])); hair.setColorAt(k, col.set(HAIR[Math.floor(r() * HAIR.length)]));
    if (pk < 90 && r() < 0.22) phones.setMatrixAt(pk++, mx.compose(at.set(x + dx + 0.1, hy + 0.3 + r() * 0.2, z + 0.15), q.setFromEuler(e.set(0.15, (r() - 0.5) * 0.4, (r() - 0.5) * 0.3)), one));
  }
  for (let i = pk; i < 90; i++) phones.setMatrixAt(i, hide);
  for (const o of [backs, bodies, heads, hair, phones]) { o.instanceMatrix.needsUpdate = true; if (o.instanceColor) o.instanceColor.needsUpdate = true; }
  // (the aisle's step lights up the rows; the exit sign far up; their own seat's back behind them)
  for (let j = 0; j < rows; j++) K.box(0.5, 0.02, 0.04, K.std({ color: '#FFB060', emissive: '#FF9A40', emissiveIntensity: 2.2 }), 3.3, j * rise + 0.01, -j * pitch + 0.42, { shadow: false });
  K.plane(0.8, 0.3, new THREE.MeshBasicMaterial({ map: K.tex(lettering([{ t: 'EXIT', font: '800 150px Arial' }], { w: 512, h: 192, bg: '#0B3A1A', fg: '#7DFF9A' })), color: new THREE.Color(1.8, 1.8, 1.8), fog: false }), -4.5, rows * rise + 2.6, -rows * pitch + 0.3);
  K.box(0.5, 0.56, 0.07, seatM, 0, SEAT.y + 0.06, -0.28, { r: 0.04 }); K.box(0.5, 0.08, 0.46, seatM, 0, SEAT.y - 0.08, -0.02, { r: 0.03 });
  return {
    sky: '#040507', env: 0.18, envNight: 0.2, fog: { color: '#0E1018', density: 0.045 },
    light: { sun: false, hemi: 0.6, hemiK: 0.6, sky: '#3A4670', ground: '#101014',
      points: [screenLight(1.3, '#E2F0FF')],
      spots: [{ at: [-3, 7, 9], to: [0, 1.0, -1], k: 70, color: '#FFE6C8', angle: 0.6, pen: 0.7, dist: 24 },
        { at: [4, 6, 8], to: [0, 1.4, -3], k: 45, color: '#B8F07A', angle: 0.75, pen: 0.8, dist: 26 },
        { at: [0, 8, 10], to: [0, 3, -8], k: 30, color: '#9FB4FF', angle: 0.7, pen: 0.85, dist: 30 }] },
    marks: {}, seat: SEAT, key: 1.6,
  };
}

export const OFFICES = { exec, startup, backstage, boardroom, kitchen, study, van, greenroom, truck, diner, lot, green, car, house };
// (the rooms' table names: a set's room 'office-exec' ... sets.js builds these too)
export const OFFICE_ROOMS = Object.fromEntries(LOOKS.map((k) => ['office-' + k, OFFICES[k]]));
