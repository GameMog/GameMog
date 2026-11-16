// Mog City: Mission 4's pavilion (docs/MISSIONS.md, Mission 4 · Shredder): the gala on South St at the Seaport, the
// street closed for it. An open-sided glass canopy on slender posts over a timber deck laid curb to curb (flush with the
// sidewalks, so it is ground he walks on: window.NYC.groundPatches), open on every side: outdoors. Placeholder art,
// all of it made here (nothing downloaded): the works of Marzo Quillfeather, a fictional painter, whose mark (one of
// three shapes) hides once in each of his three Harbor Nocturnes. Emissive paint for the bulbs, the screen and the
// case's strip (the art is unlit paint, so it reads as lit at dusk), four warm point lights under the canopy and a flood
// on the plaza past its south end.
//   const P = buildPavilion(W, { feed })   feed: Mr. Big's study as a texture (mission/mrbig.js), on the big screen
//   P.show(on)       the set, its colliders and its deck in the world (or out of it)
//   P.reset()        locked case, OWNER · MR. BIG, the marks unfound and dealt again (P.order: the three shapes in the
//                    Nocturnes' order, I, II, III), the card on the screen
//   P.caseState(s)   'locked' | 'open' | 'alarm' | 'empty'     P.cert(owner, glitch)     P.feed(on)
//   P.update(dt, cam)  each frame: the key's glow, the alarm's flash, the art's near/far textures (full size only within
//                    NEAR m of the camera: the phone's budget)
//   P.panels         the three marked works: { x, z (where he stands to study it), num, title, glyph, found }
//   P.tray           where the waiters' trays are stacked on the bar ({ x, z })
// Layout (the pavilion's own frame, m4-set.js at(a, b): a across the street, + east; b along it, + to the closed south
// end): the staff entrance at the north end (b -16) where Knox keeps the door; the bar on the east side; the art wall
// down the west side; the display case in the middle; the High Artwork on its own wall on the east side; the big screen
// and Fiona's riser at the south end. The guests face the screen, their backs to the case.
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { S as story } from '../story/index.js';
import { PAV, at, ARTIST, GLYPHS, SY } from './m4-set.js';

const PI = Math.PI;
const SW = 0.22;                      // the sidewalks' top (js/city-config.js ISLAND_BOUNDS.sidewalkHeight): the deck's
const NEAR = 24, FAR = 40;            // the art's full-size textures within NEAR m of the camera, let go past FAR
export const DECK = { a: 6.2, b: 16 };
// the places in the pavilion's frame [a, b]
export const L = {
  door: [3.2, -14.6], carpet: [0, -11.5], bar: [4.85, -10.5], tray: [4.3, -9.2],
  wall: { a: -5.35, b0: -11.2, b1: 7.2 },            // the art wall (it faces east, into the pavilion)
  works: [-9.6, -6.6, -3.6, -0.6, 2.4, 5.4],         // its six works' b
  marked: [0, 2, 4],                                 // which of them are the Nocturnes: III, I, II as you walk down it
  high: { a: 5.35, b: 6.0 }, cert: { a: 5.2, b: 9.55 },
  case: [0, 0.6], screen: [0, 13.4], riser: [-3.1, 11.4],
};
const NOCT = [['Harbor Nocturne III', 2], ['Harbor Nocturne I', 0], ['Harbor Nocturne II', 1]]; // (marked works, in wall order: title, numeral index)
const OTHER = ['Low Tide, Brass', 'Gull Weather', 'Pier at Four'];

const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const rng = (seed) => { seed = (Math.floor(seed) % 2147483646) + 1; return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; };
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...o });
const glow = (color, k = 1.6) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) });

/* ------------------------------------------------------------------ art -- */
// a mark of the artist's, drawn into a 2D context at (cx, cy), size s
export function glyph(x, kind, cx, cy, s, color = '#E7C36A') {
  x.save(); x.strokeStyle = color; x.fillStyle = color; x.lineWidth = Math.max(1.5, s * 0.14); x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath();
  if (kind === 'triangle') { x.moveTo(cx, cy - s * 0.5); x.lineTo(cx + s * 0.45, cy + s * 0.35); x.lineTo(cx - s * 0.45, cy + s * 0.35); x.closePath(); x.stroke(); }
  else if (kind === 'ring') { x.arc(cx, cy, s * 0.4, 0, 2 * PI); x.stroke(); x.beginPath(); x.arc(cx, cy, s * 0.1, 0, 2 * PI); x.fill(); }
  else { x.moveTo(cx - s * 0.4, cy); x.lineTo(cx + s * 0.4, cy); x.moveTo(cx, cy - s * 0.4); x.lineTo(cx, cy + s * 0.4); x.stroke(); }
  x.restore();
}
export function glyphCanvas(kind, size = 128, color = '#FFFFFF') { const [c, x] = canvas(size, size); glyph(x, kind, size / 2, size / 2, size * 0.8, color); return c; }

const PALS = [
  ['#0B1430', '#23325E', '#C8794A', '#E9C46A', '#F4E9D6'],   // harbour at dusk
  ['#120E26', '#3A2456', '#B9466A', '#F2B46D', '#F7EEDC'],   // violet hour
  ['#06161C', '#14424A', '#4FA39A', '#E7C36A', '#EAF2EA'],   // green water
  ['#1A0F0A', '#4A2516', '#C25A2C', '#F0C27A', '#FFF3DE'],   // rust and brass
];
// one of his feathers: a curved shaft from (x0, y0) toward (x1, y1) bowed by bend, its vane len wide; barbs drawn as
// fine strokes off the shaft, both sides, fading to its tip
function feather(x, r, x0, y0, x1, y1, bend, wide, col, tip, alpha = 0.9) {
  const mx = (x0 + x1) / 2 - (y1 - y0) * bend, my = (y0 + y1) / 2 + (x1 - x0) * bend;
  const P = (t) => [(1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1, (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1];
  const N = (t) => { const [ax, ay] = P(Math.max(0, t - 0.01)), [bx, by] = P(Math.min(1, t + 0.01)), dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l, dx / l, dy / l]; };
  // the vane: a soft body either side
  x.save(); x.globalAlpha = alpha * 0.55;
  const g = x.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, col); g.addColorStop(1, tip); x.fillStyle = g;
  x.beginPath();
  for (let i = 0; i <= 24; i++) { const t = i / 24, [px, py] = P(t), [nx, ny] = N(t), w = wide * Math.sin(Math.min(1, t * 1.15) * PI) * (0.55 + 0.45 * t); x.lineTo(px + nx * w, py + ny * w); }
  for (let i = 24; i >= 0; i--) { const t = i / 24, [px, py] = P(t), [nx, ny] = N(t), w = wide * 0.82 * Math.sin(Math.min(1, t * 1.15) * PI) * (0.55 + 0.45 * t); x.lineTo(px - nx * w, py - ny * w); }
  x.fill();
  // the barbs
  x.globalAlpha = alpha; x.strokeStyle = tip; x.lineWidth = Math.max(0.6, wide * 0.035);
  for (let i = 3; i < 60; i++) {
    const t = i / 60, [px, py] = P(t), [nx, ny, tx, ty] = N(t), w = wide * Math.sin(Math.min(1, t * 1.15) * PI) * (0.55 + 0.45 * t);
    for (const s of [1, -0.82]) { const k = w * (0.8 + r() * 0.25); x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + nx * k * 0.5 * s + tx * k * 0.1, py + ny * k * 0.5 * s + ty * k * 0.1, px + nx * k * s + tx * k * 0.35, py + ny * k * s + ty * k * 0.35); x.stroke(); }
  }
  // the shaft
  x.strokeStyle = '#FFF6E0'; x.lineWidth = Math.max(1, wide * 0.06); x.globalAlpha = alpha;
  x.beginPath(); for (let i = 0; i <= 24; i++) { const [px, py] = P(i / 24); i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke();
  x.restore();
}
// a painting of his: a night harbour (sky, the far shore's lights, the water's reflections), one to three feathers
// drifting over it, gold-leaf flecks; mark: his mark hidden once, small, somewhere in the water
function paint(x, w, h, seed, { pal = 0, mark = null, feathers = 2, moon = false } = {}) {
  const r = rng(seed * 7919 + 13), p = PALS[pal % PALS.length], hz = h * (0.52 + r() * 0.12);
  let g = x.createLinearGradient(0, 0, 0, hz); g.addColorStop(0, p[0]); g.addColorStop(1, p[1]); x.fillStyle = g; x.fillRect(0, 0, w, hz);
  g = x.createLinearGradient(0, hz, 0, h); g.addColorStop(0, p[1]); g.addColorStop(1, p[0]); x.fillStyle = g; x.fillRect(0, hz, w, h - hz);
  // the glow along the horizon
  g = x.createLinearGradient(0, hz - h * 0.12, 0, hz + h * 0.04); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.8, p[2] + '99'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, hz - h * 0.12, w, h * 0.16);
  if (moon) { const mx = w * (0.68 + r() * 0.12), my = h * 0.2, mr = h * 0.075; const mg = x.createRadialGradient(mx, my, mr * 0.2, mx, my, mr * 3.2); mg.addColorStop(0, p[4]); mg.addColorStop(0.3, p[3] + '55'); mg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = mg; x.fillRect(0, 0, w, h); x.fillStyle = p[4]; x.beginPath(); x.arc(mx, my, mr, 0, 2 * PI); x.fill(); }
  // the far shore: low blocks with lit windows
  x.fillStyle = p[0];
  for (let X = 0; X < w;) { const bw = w * (0.03 + r() * 0.06), bh = h * (0.02 + r() * 0.08); x.fillRect(X, hz - bh, bw, bh); for (let k = 0; k < 4; k++) if (r() < 0.7) { x.fillStyle = p[3]; x.fillRect(X + r() * bw, hz - r() * bh, Math.max(1, w * 0.004), Math.max(1, h * 0.005)); x.fillStyle = p[0]; } X += bw + w * 0.004; }
  // the water: dashes of reflected light under the horizon
  for (let i = 0; i < 90; i++) { const yy = hz + Math.pow(r(), 1.4) * (h - hz), len = w * (0.01 + r() * 0.06) * (1 + (yy - hz) / h); x.globalAlpha = 0.25 + r() * 0.5; x.fillStyle = r() < 0.6 ? p[3] : p[4]; x.fillRect(r() * w, yy, len, Math.max(1, h * 0.004)); }
  x.globalAlpha = 1;
  // the feathers
  for (let i = 0; i < feathers; i++) {
    const big = i === 0, x0 = w * (0.1 + r() * 0.3), y0 = h * (0.7 + r() * 0.2), x1 = w * (0.55 + r() * 0.35), y1 = h * (0.1 + r() * 0.3);
    feather(x, r, x0, y0, x1, y1, 0.12 + r() * 0.15, (big ? 0.11 : 0.06) * w, p[2], p[4], big ? 0.95 : 0.7);
  }
  // gold leaf
  for (let i = 0; i < 26; i++) { x.globalAlpha = 0.5 + r() * 0.5; x.fillStyle = p[3]; const s = w * (0.002 + r() * 0.006); x.fillRect(r() * w, r() * h, s, s); }
  x.globalAlpha = 1;
  // his mark: small, in the water, a little off the brightest dashes
  if (mark) glyph(x, mark, w * (0.12 + r() * 0.76), hz + (h - hz) * (0.3 + r() * 0.5), Math.min(w, h) * 0.075, p[3]);
  // a thin gilt frame
  x.strokeStyle = '#B8924A'; x.lineWidth = Math.max(3, w * 0.014); x.strokeRect(x.lineWidth / 2, x.lineWidth / 2, w - x.lineWidth, h - x.lineWidth);
}
// a work's wall label: its title, the artist, the year
function plaque(title, sub = `${ARTIST} · 2026`) {
  const [c, x] = canvas(256, 72);
  x.fillStyle = '#F2EEE6'; x.fillRect(0, 0, 256, 72);
  x.fillStyle = '#1A1A1A'; x.font = '700 22px "Barlow Condensed", sans-serif'; x.textBaseline = 'middle'; x.fillText(story.t(title), 12, 24);
  x.fillStyle = '#5A5246'; x.font = '500 16px "Barlow Condensed", sans-serif'; x.fillText(story.t(sub), 12, 52);
  return tex(c);
}
// a work with two textures: far (small, always) and near (full size, made when the camera comes within NEAR m, let go
// past FAR); draw(x, w, h) paints it
function artwork(w, h, draw) {
  const [fc, fx] = canvas(Math.max(32, w >> 2), Math.max(24, h >> 2)); draw(fx, fc.width, fc.height);
  const far = tex(fc);
  const mat = new THREE.MeshBasicMaterial({ map: far, color: new THREE.Color(1.08, 1.08, 1.08) });
  const A = {
    mat, near: null, at: new THREE.Vector3(),
    redraw() { const c2 = fc.getContext('2d'); c2.clearRect(0, 0, fc.width, fc.height); draw(c2, fc.width, fc.height); far.needsUpdate = true; if (A.near) { A.near.dispose(); A.near = null; mat.map = far; mat.needsUpdate = true; } },
    lod(d) {
      if (d < NEAR && !A.near) { const [c, x] = canvas(w, h); draw(x, w, h); A.near = tex(c); mat.map = A.near; mat.needsUpdate = true; }
      else if (d > FAR && A.near) { mat.map = far; mat.needsUpdate = true; A.near.dispose(); A.near = null; }
    },
    dispose() { far.dispose(); A.near?.dispose(); mat.dispose(); },
  };
  return A;
}
function label(lines, { w = 512, h = 128, bg = 'rgba(8,10,14,0.85)', color = '#FFFFFF' } = {}) {
  const [c, x] = canvas(w, h);
  const draw = (ls, col = color, fx = null) => {
    x.clearRect(0, 0, w, h); x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    ls.forEach(([t, size = 48, c2 = col, weight = 800], i) => { x.fillStyle = c2; x.font = `${weight} ${size}px "Barlow Condensed", sans-serif`; x.fillText(t, w / 2, h * (i + 1) / (ls.length + 1)); });
    fx?.(x, w, h);
  };
  draw(lines);
  const t = tex(c);
  return { canvas: c, texture: t, draw(ls, col, fx) { draw(ls, col, fx); t.needsUpdate = true; } };
}
const box = (w, h, d, mat, shadow = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = shadow; m.receiveShadow = true; return m; };
const plane = (w, h, mat) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);

/* ------------------------------------------------------------- pavilion -- */
export function buildPavilion(W, { feed = null } = {}) {
  const app = W.app, cm = app.controllerManager;
  const g = new THREE.Group(); g.name = 'm4-pavilion'; g.visible = false; app.scene.add(g);
  // (not the camera's street things, wagmi/combat/camera.js: its solid parts are colliders, below, and the ropes, posts
  // and bulb strings would only push the follow camera up over him)
  g.userData.noCamBlock = true;
  const y0 = SW;                                        // the deck's top: everything stands on it
  g.position.set(PAV.x, 0, PAV.z); g.rotation.y = PAV.h;
  const add = (m, a, y, b, rot = 0, parent = g) => { m.position.set(a, y, b); m.rotation.y = rot; parent.add(m); return m; };
  const steel = std('#23262C', { metalness: 0.75, roughness: 0.32 }), white = std('#ECE9E2', { roughness: 0.45 }), dark = std('#16181C', { roughness: 0.7 });
  const timber = std('#5B4634', { roughness: 0.78 }), wallMat = std('#E8E4DC', { roughness: 0.9 }), gilt = std('#B8924A', { metalness: 0.8, roughness: 0.35 });
  const colliders = [];
  // a solid box in the pavilion's frame (a, b its middle, ha, hb its half sizes, top its height over the deck)
  const solid = (a, b, ha, hb, top) => {
    const p = at(a, b), cs = Math.cos(PAV.h), sn = Math.sin(PAV.h), ex = Math.abs(cs) * ha + Math.abs(sn) * hb, ez = Math.abs(sn) * ha + Math.abs(cs) * hb;
    colliders.push({ minX: p.x - ex, maxX: p.x + ex, minZ: p.z - ez, maxZ: p.z + ez, maxY: y0 + top, wagmi: 'm4', obb: { cx: p.x, cz: p.z, hx: ha, hz: hb, cs, sn } });
  };

  /* the deck: timber laid curb to curb, flush with the sidewalks, a brass edge; its ground for him to stand on */
  const deckTex = (() => { const [c, x] = canvas(256, 256); x.fillStyle = '#5B4634'; x.fillRect(0, 0, 256, 256); const r = rng(5); for (let i = 0; i < 16; i++) { x.fillStyle = `hsl(25, ${22 + r() * 10}%, ${22 + r() * 9}%)`; x.fillRect(0, i * 16, 256, 15); x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, i * 16 + 15, 256, 1); x.fillRect(Math.floor(r() * 256), i * 16, 1, 15); } const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(DECK.a * 2 / 3, DECK.b * 2 / 3); return t; })();
  add(box(DECK.a * 2, SW, DECK.b * 2, std('#FFFFFF', { map: deckTex, roughness: 0.8 }), false), 0, SW / 2, 0);
  for (const s of [-1, 1]) add(box(0.06, 0.02, DECK.b * 2, gilt, false), s * (DECK.a - 0.03), SW + 0.005, 0);
  // (its two ends ramped down to the street, a metre each: no raised slab edge where the street runs on under it; the
  // owner's review, 14 Nov)
  { const th = Math.atan2(SW, 1.0);
    for (const e of [-1, 1]) { const r = add(box(DECK.a * 2, 0.04, Math.hypot(1.0, SW), std('#FFFFFF', { map: deckTex, roughness: 0.8 }), false), 0, SW / 2 - 0.02, e * (DECK.b + 0.5)); r.rotation.x = e * th; add(box(DECK.a * 2, 0.02, 0.05, gilt, false), 0, SW - 0.005, e * (DECK.b + 0.02)); } }
  const deckPts = [[-DECK.a, -DECK.b], [DECK.a, -DECK.b], [DECK.a, DECK.b], [-DECK.a, DECK.b]].map(([a, b]) => at(a, b));
  const patch = { minX: Math.min(...deckPts.map((p) => p.x)), maxX: Math.max(...deckPts.map((p) => p.x)), minZ: Math.min(...deckPts.map((p) => p.z)), maxZ: Math.max(...deckPts.map((p) => p.z)), top: SW, poly: deckPts, wagmi: 'm4' };
  // the red carpet from the staff entrance
  add(box(1.5, 0.012, 9, std('#7A1420', { roughness: 0.95 }), false), L.carpet[0], y0 + 0.006, L.carpet[1]);
  // the rope line along it: brass stanchions, a red rope
  const rope = std('#8E1B26', { roughness: 0.8 });
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) { const b = -15.4 + k * 2.6; add(box(0.07, 0.95, 0.07, gilt), s * 1.05, y0 + 0.475, b); add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), gilt), s * 1.05, y0 + 0.98, b); }
    for (let k = 0; k < 3; k++) { const m = add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.6, 6), rope), s * 1.05, y0 + 0.82, -15.4 + 1.3 + k * 2.6); m.rotation.x = PI / 2; }
  }

  /* the canopy: a glass roof on slender posts, open on every side; an edge of warm light; strings of bulbs under it */
  const CY = 4.7;
  // (the look review's round 3, 15 Nov: a white streak down the canopy's middle and hazy shafts through the glass, the
  // washes' highlights on the polished middle purlin and the glass under them; the purlins a matte dark steel, the glass
  // a faint unlit tint, no highlight of its own)
  const glass = new THREE.MeshBasicMaterial({ color: '#5E7486', transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide });
  const purlin = std('#24272C', { roughness: 0.85, metalness: 0.2 });
  add(new THREE.Mesh(new THREE.BoxGeometry(DECK.a * 2 + 0.6, 0.05, DECK.b * 2 + 0.6), glass), 0, y0 + CY + 0.12, 0);
  for (const a of [-DECK.a, DECK.a]) for (const b of [-15.5, -5.2, 5.2, 15.5]) add(box(0.12, CY, 0.12, steel), a, y0 + CY / 2, b);
  for (const a of [-DECK.a, DECK.a]) add(box(0.16, 0.2, DECK.b * 2 + 0.4, steel), a, y0 + CY, 0);
  for (const b of [-15.5, -5.2, 5.2, 15.5]) add(box(DECK.a * 2, 0.14, 0.12, steel), 0, y0 + CY, b);
  for (let k = -6; k <= 6; k++) add(box(0.05, 0.06, DECK.b * 2 + 0.4, purlin, false), k * DECK.a / 7, y0 + CY + 0.08, 0);
  const warm = glow('#FFD9A0', 2.0);
  for (const s of [-1, 1]) add(box(0.04, 0.04, DECK.b * 2 + 0.4, warm, false), s * (DECK.a + 0.1), y0 + CY - 0.1, 0);
  // (the bulbs: one instanced draw, strung in sags across the canopy)
  {
    const strings = [], per = 16;
    for (const b of [-12.5, -8, -3.5, 1, 5.5, 10]) strings.push(b);
    const n = strings.length * per, bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 6), glow('#FFE2A6', 2.6), n), M = new THREE.Matrix4();
    let i = 0;
    for (const b of strings) for (let k = 0; k < per; k++) { const t = k / (per - 1), a = -DECK.a + t * DECK.a * 2, sag = Math.sin(t * PI) * 0.55; M.makeTranslation(a, y0 + CY - 0.18 - sag, b); bulbs.setMatrixAt(i++, M); }
    bulbs.castShadow = false; g.add(bulbs);
    const wire = std('#111111');
    for (const b of strings) for (let k = 0; k < per - 1; k++) {
      const t0 = k / (per - 1), t1 = (k + 1) / (per - 1), a0 = -DECK.a + t0 * DECK.a * 2, a1 = -DECK.a + t1 * DECK.a * 2, y_0 = CY - 0.12 - Math.sin(t0 * PI) * 0.55, y_1 = CY - 0.12 - Math.sin(t1 * PI) * 0.55;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, Math.hypot(a1 - a0, y_1 - y_0), 4), wire);
      m.position.set((a0 + a1) / 2, y0 + (y_0 + y_1) / 2, b); m.rotation.z = PI / 2 + Math.atan2(y_1 - y_0, a1 - a0); g.add(m);
    }
  }

  /* the bar on the east side near the entrance, a stack of waiters' trays on its end */
  {
    const [ba, bb] = L.bar;
    add(box(0.75, 1.08, 4.2, dark), ba, y0 + 0.54, bb);
    add(box(0.82, 0.05, 4.3, std('#E9E5DD', { roughness: 0.3, metalness: 0.1 })), ba, y0 + 1.1, bb);
    add(box(0.02, 0.05, 4.1, warm, false), ba - 0.39, y0 + 0.12, bb);
    const bottle = [std('#2E5E3A', { roughness: 0.2, metalness: 0.3 }), std('#6B3B1E', { roughness: 0.2, metalness: 0.3 }), std('#D9D4C5', { roughness: 0.2, metalness: 0.3 })];
    for (let k = 0; k < 9; k++) add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.3, 8), bottle[k % 3]), ba + 0.15, y0 + 1.27, bb - 1.7 + k * 0.32);
    const trayMat = std('#C9CCD1', { metalness: 0.85, roughness: 0.28 });
    for (let k = 0; k < 5; k++) add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 20), trayMat), L.tray[0] + 0.2, y0 + 1.13 + k * 0.014, L.tray[1]);
    solid(ba, bb, 0.42, 2.15, 1.1);
  }

  /* the art wall down the west side, facing in: six works of his, the three Nocturnes among them, each with its label */
  const works = [], marked = [];
  {
    const { a, b0, b1 } = L.wall, len = b1 - b0, bc = (b0 + b1) / 2;
    add(box(0.28, 3.1, len, wallMat), a, y0 + 1.55, bc);
    add(box(0.32, 0.08, len + 0.04, dark), a, y0 + 3.14, bc);
    add(box(0.3, 0.12, len, dark), a, y0 + 0.06, bc);
    // (a warm wash along its top, as if lit from the canopy)
    add(box(0.04, 0.04, len, warm, false), a + 0.18, y0 + 3.0, bc);
    solid(a, bc, 0.16, len / 2, 3.1);
    let n = 0;
    L.works.forEach((b, i) => {
      const m = L.marked.indexOf(i), noct = m >= 0 ? NOCT[m] : null;
      const seed = 101 + i * 37, pal = i % PALS.length;
      const W2 = 1.7, H2 = 1.28;
      const st = { mark: null };
      const A = artwork(640, 480, (x, w, h) => paint(x, w, h, seed, { pal, feathers: 1 + (i % 3), moon: i % 2 === 0, mark: st.mark }));
      add(box(W2 + 0.08, H2 + 0.08, 0.05, gilt), a + 0.165, y0 + 1.75, b, PI / 2);
      const face = add(plane(W2, H2, A.mat), a + 0.195, y0 + 1.75, b, PI / 2);
      A.at.copy(at(a + 0.2, b)).setY(y0 + 1.75);
      const title = noct ? noct[0] : OTHER[n++ % OTHER.length];
      add(plane(0.42, 0.118, new THREE.MeshBasicMaterial({ map: plaque(title) })), a + 0.16, y0 + 0.85, b + W2 / 2 - 0.16, PI / 2);
      works.push(A);
      if (noct) { const p = at(a + 1.15, b); marked.push({ x: p.x, z: p.z, y: y0, title: noct[0], num: noct[1], glyph: null, found: false, art: A, st, face }); }
    });
  }

  /* the High Artwork on its own wall on the east side, facing in; the certificate beside it */
  const HIGH = (() => {
    const { a, b } = L.high;
    // (its wall a deep oxblood, a gallery's feature wall, so the work and its gilt read off it rather than off black)
    add(box(0.32, 3.4, 7.4, std('#5A2430', { roughness: 0.92 })), a, y0 + 1.7, b + 0.9);
    solid(a, b + 0.9, 0.17, 3.7, 3.4);
    add(box(0.04, 0.04, 7.2, warm, false), a - 0.2, y0 + 3.35, b + 0.9);
    const A = artwork(1024, 704, (x, w, h) => paint(x, w, h, 4242, { pal: 0, feathers: 1, moon: true }));
    add(box(3.5, 2.46, 0.08, gilt), a - 0.17, y0 + 1.95, b, -PI / 2);
    add(plane(3.36, 2.32, A.mat), a - 0.215, y0 + 1.95, b, -PI / 2);
    A.at.copy(at(a - 0.22, b)).setY(y0 + 1.95);
    add(plane(0.56, 0.158, new THREE.MeshBasicMaterial({ map: plaque('The High Artwork') })), a - 0.17, y0 + 0.62, b - 1.2, -PI / 2);
    // (a rope in front of it)
    for (const db of [-1.9, 1.9]) { add(box(0.06, 0.9, 0.06, gilt), a - 1.0, y0 + 0.45, b + db); }
    const m = add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 3.8, 6), rope), a - 1.0, y0 + 0.78, b); m.rotation.x = PI / 2;
    works.push(A);
    return A;
  })();
  // (the certificate at twice the size it is drawn, so its close-up in the flip reads sharp)
  const certL = label([], { w: 1024, h: 720, bg: '#F6F1E6', color: '#1A1A1A' });
  const drawCert = (owner, glitch = false) => certL.draw([
    [story.t('CERTIFICATE OF OWNERSHIP'), 68, '#6A5530', 700], [story.t('THE HIGH ARTWORK'), 92, '#1A1A1A'],
    [story.t(ARTIST).toUpperCase(), 56, '#6A5530', 600], [`${story.t('OWNER')} · ${owner}`, 108, glitch ? '#D62F2F' : '#1A1A1A'],
  ], '#1A1A1A', (x, w, h) => {
    x.strokeStyle = '#B8924A'; x.lineWidth = 12; x.strokeRect(28, 28, w - 56, h - 56); x.lineWidth = 4; x.strokeRect(48, 48, w - 96, h - 96);
    // the seal
    x.fillStyle = glitch ? '#D62F2F' : '#9A2A2A'; x.beginPath(); x.arc(w - 128, h - 124, 52, 0, 2 * PI); x.fill(); x.fillStyle = '#F6F1E6'; x.font = '800 36px "Barlow Condensed", sans-serif'; x.fillText('★', w - 128, h - 122);
    // (the look review's round 8: slices across the whole sheet doubled its heading and the title mid-flip. The glitch
    // keeps to the owner's line now, where the name changes; the heading and the title read through it)
    if (glitch) { const r = rng(Date.now() % 9973); for (let i = 0; i < 9; i++) { const hh = 8 + r() * 30, yy = h * 0.65 + r() * (h * 0.27 - hh); x.drawImage(x.canvas, 0, yy, w, hh, (r() - 0.5) * 120, yy, w, hh); x.fillStyle = `rgba(${r() < 0.5 ? '214,47,47' : '60,200,255'},${0.15 + r() * 0.25})`; x.fillRect(0, yy, w, hh * 0.4); } }
  });
  drawCert(story.t('MR. BIG'));
  add(box(0.06, 0.78, 1.06, gilt), L.cert.a - 0.03, y0 + 1.6, L.cert.b);
  add(plane(0.98, 0.69, new THREE.MeshBasicMaterial({ map: certL.texture })), L.cert.a - 0.065, y0 + 1.6, L.cert.b, -PI / 2);

  /* the display case in the middle: a lacquer plinth, a glass box, the signing key on a black cushion; a strip round the
     plinth's top shows its state, and a small screen on its front says it */
  const [ca, cb] = L.case;
  // (a gallery's vitrine, the owner's review, 14 Nov: the plain white box and its dark lid read as a primitive; the look
  // review's round 2, 15 Nov: its warm white still went lilac under the blue hour. A black lacquer plinth on a polished
  // stone skirt, gilt bands round its foot and its shoulder, a walnut panel in a gilt frame let into each face, a honed
  // stone top with a little overhang, the key on a navy velvet cushion; a glass hood in a gilt frame with a lit lid)
  const stone = std('#1A1714', { roughness: 0.22, metalness: 0.08 }), top = std('#D9D2C4', { roughness: 0.3, metalness: 0.04 });
  const lacquer = std('#15120F', { roughness: 0.2, metalness: 0.12 }), walnut = std('#4A3222', { roughness: 0.42, metalness: 0.05 });
  add(box(0.98, 0.08, 0.98, stone), ca, y0 + 0.04, cb);
  add(box(0.88, 0.9, 0.88, lacquer), ca, y0 + 0.53, cb);
  for (const yy of [0.12, 0.93]) add(box(0.9, 0.025, 0.9, gilt, false), ca, y0 + yy, cb);
  for (const [da, db, w, d, r] of [[0, -0.444, 0.66, 0.012, 0], [0, 0.444, 0.66, 0.012, 0], [-0.444, 0, 0.012, 0.66, 1], [0.444, 0, 0.012, 0.66, 1]]) {
    add(box(w, 0.6, d, walnut, false), ca + da, y0 + 0.52, cb + db);
    // (its gilt frame: four slim rails just proud of the panel)
    const o = 0.006 * Math.sign(da + db);
    for (const yy of [0.22, 0.82]) add(box(r ? 0.006 : 0.68, 0.014, r ? 0.68 : 0.006, gilt, false), ca + da + (r ? o : 0), y0 + yy, cb + db + (r ? 0 : o));
    for (const s2 of [-1, 1]) add(box(r ? 0.006 : 0.014, 0.6, r ? 0.014 : 0.006, gilt, false), ca + da + (r ? o : s2 * 0.333), y0 + 0.52, cb + db + (r ? s2 * 0.333 : o));
  }
  add(box(0.96, 0.045, 0.96, top), ca, y0 + 1.0, cb);
  add(new THREE.Mesh(new RoundedBoxGeometry(0.58, 0.07, 0.46, 3, 0.025), std('#141A2E', { roughness: 1, metalness: 0 })), ca, y0 + 1.06, cb);
  const stateMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#EF4444').multiplyScalar(1.8) });
  for (const [w, d, da, db] of [[0.92, 0.012, 0, -0.474], [0.92, 0.012, 0, 0.474], [0.012, 0.92, -0.474, 0], [0.012, 0.92, 0.474, 0]]) add(box(w, 0.018, d, stateMat, false), ca + da, y0 + 0.975, cb + db);
  const caseMat = new THREE.MeshStandardMaterial({ color: '#E4F2F8', transparent: true, opacity: 0.17, roughness: 0.02, metalness: 0.4, depthWrite: false, emissive: new THREE.Color('#9FC4D8'), emissiveIntensity: 0.05 });
  add(new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.6, 0.72), caseMat), ca, y0 + 1.32, cb);
  // (the hood's frame: gilt posts and a gilt lid rim, a dark lid with the strip of warm light under it)
  for (const [da, db] of [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]]) add(box(0.022, 0.6, 0.022, gilt, false), ca + da, y0 + 1.32, cb + db);
  for (const yy of [1.035, 1.635]) for (const [w, d, da, db] of [[0.75, 0.024, 0, -0.36], [0.75, 0.024, 0, 0.36], [0.024, 0.75, -0.36, 0], [0.024, 0.75, 0.36, 0]]) add(box(w, yy > 1.5 ? 0.045 : 0.02, d, gilt, false), ca + da, y0 + yy, cb + db);
  add(box(0.74, 0.03, 0.74, std('#1B1D22', { roughness: 0.4, metalness: 0.5 }), false), ca, y0 + 1.665, cb);
  const lidLight = plane(0.5, 0.5, new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFE6B8').multiplyScalar(2.0) })); lidLight.rotation.x = PI / 2; add(lidLight, ca, y0 + 1.633, cb); lidLight.rotation.x = PI / 2;
  {
    const [c2, x2] = canvas(64, 64), gr = x2.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,226,170,0.55)'); gr.addColorStop(1, 'rgba(255,226,170,0)'); x2.fillStyle = gr; x2.fillRect(0, 0, 64, 64);
    const pool = plane(0.62, 0.5, new THREE.MeshBasicMaterial({ map: tex(c2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 }));
    pool.rotation.x = -PI / 2; pool.renderOrder = 2; add(pool, ca, y0 + 1.097, cb); pool.rotation.x = -PI / 2;
  }
  solid(ca, cb, 0.46, 0.46, 1.7);
  // the key: a small hardware key, its body dark metal with a glowing seam, a ring at its end
  const key = new THREE.Group();
  const keyGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color('#E7C36A').multiplyScalar(2) });
  // (round 7's review: the cushion read as empty under LOCKED, its dark key lost on the navy velvet. The same polished
  // gilt as the fob he shows on the riverfront, lit from within so it reads gold under the lid's light)
  { const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.018, 0.1), std('#E2BC66', { metalness: 0.75, roughness: 0.2, emissive: new THREE.Color('#8A6420'), emissiveIntensity: 1 })); key.add(body);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.07), keyGlow); seam.position.set(0, 0.001, -0.005); key.add(seam);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 6, 14), gilt); loop.position.set(0, 0, 0.064); loop.rotation.x = PI / 2; key.add(loop); }
  key.rotation.y = 0.5; key.scale.setScalar(1.8);   // (read from a step back: a little larger than life)
  // (round 8: laid flat it was a thin line on the cushion from a step back. Propped up on its ring end, as a jeweller
  // shows a piece, its gilt face to the room)
  { const tilt = new THREE.Group(); tilt.rotation.x = -0.75; tilt.position.y = 0.022; for (const c of [...key.children]) tilt.add(c); key.add(tilt); }
  add(key, ca, y0 + 1.1, cb);
  const caseTag = label([[story.t('LOCKED'), 64, '#EF4444']], { w: 256, h: 96, bg: '#0B0D12' });
  add(plane(0.5, 0.19, new THREE.MeshBasicMaterial({ map: caseTag.texture })), ca, y0 + 0.78, cb - 0.462, PI);

  /* the big screen at the south end (facing north, to the guests): a card, or Mr. Big's feed from his office */
  const [sa, sb] = L.screen;
  // (the screen's middle: the look review's round 9 raised it, with the evening's title on its lower edge, clear of the
  // guests' heads; SY in m4-set.js)
  add(box(5.2, 3.05, 0.18, dark), sa, y0 + SY, sb + 0.1);
  // (a backdrop under it down to the deck, the riser's side to the bar's: the closed street's far barrier no longer
  // runs across the bottom of his feed; the look review, 15 Nov)
  // (a backdrop under it, curb to curb, and a tall flat behind Fiona's riser: the closed street's far barrier no longer
  // runs across the bottom of his feed or behind her; the look review, 15 Nov)
  const flat = std('#15171C', { roughness: 0.55, metalness: 0.15 });
  // (the look review's round 5: the backdrop ran curb to curb with no collider past the screen's own, and he ran out
  // through it on the run, the follow camera behind it with its black back filling the frame. It ends at the screen's
  // east edge now, the way out past the High Artwork's wall open, and every flat a wall for him and for the lens)
  { const a0 = -DECK.a, a1 = sa + 2.75, w = a1 - a0, am = (a0 + a1) / 2;
    add(box(w, 1.55, 0.12, flat), am, y0 + 0.78, sb + 0.2); add(box(w, 0.03, 0.14, gilt, false), am, y0 + 1.56, sb + 0.2); solid(am, sb + 0.2, w / 2, 0.12, 1.6); }
  { const a0 = -DECK.a, a1 = sa - 2.75, w = a1 - a0, am = (a0 + a1) / 2;
    add(box(w, 3.4, 0.12, flat), am, y0 + 1.7, sb + 0.2); add(box(w, 0.03, 0.14, gilt, false), am, y0 + 3.41, sb + 0.2); solid(am, sb + 0.2, w / 2, 0.12, 3.45);
    // (on it, the evening's poster: the High Artwork's feather, upright, in a slim gilt frame)
    const A = artwork(512, 720, (x, w2, h2) => paint(x, w2, h2, 4242, { pal: 0, feathers: 1, moon: true }));
    add(box(1.5, 2.12, 0.03, gilt), am, y0 + 1.95, sb + 0.13); const pm = add(plane(1.42, 2.04, A.mat), am, y0 + 1.95, sb + 0.11, PI);
    A.at.copy(at(am, sb)).setY(y0 + 1.95); works.push(A); }
  // (the look review's round 7: the flat under his feed a dead black block across the lower half of Fiona's frame. The
  // evening's title on it, gilt on black, lit, between gilt rules. Round 9: at 0.65-1.35 m the guests' heads stood over
  // it in every shot down the deck. The title is the screen's lower third now, over 1.9 m, a broadcast's band across
  // the foot of his feed and of the card; the flat keeps its gilt rules, a lit frame)
  { const t = label([[story.t('THE HIGH ARTWORK'), 112, '#E7C36A', 700]], { w: 1024, h: 192, bg: '#0E0F14' });
    const ty = y0 + SY - 1.38 + 0.25;
    add(plane(3.1, 0.5, new THREE.MeshBasicMaterial({ map: t.texture, color: new THREE.Color(1.25, 1.25, 1.25) })), sa, ty, sb - 0.03, PI);
    for (const dy of [0.27, -0.27]) add(box(3.3, 0.022, 0.02, gilt, false), sa, ty + dy, sb - 0.035);
    for (const dy of [0.39, -0.39]) add(box(3.9, 0.025, 0.02, gilt, false), sa, y0 + 1.0 + dy, sb + 0.125); }
  for (const da of [-2.2, 2.2]) add(box(0.14, 1.6, 0.14, steel), sa + da, y0 + 0.8, sb + 0.1);
  add(box(5.4, 0.1, 1.2, steel), sa, y0 + 0.05, sb + 0.1);
  solid(sa, sb + 0.1, 2.7, 0.6, 4.6);
  const card = label([[story.t('LIVE'), 60, '#EF4444'], [story.t('FROM HIS OFFICE'), 40]], { w: 512, h: 288, bg: '#0B0D12' });
  const cardM = add(plane(4.9, 2.76, new THREE.MeshBasicMaterial({ map: card.texture, color: new THREE.Color(1.15, 1.15, 1.15) })), sa, y0 + SY, sb - 0.005, PI);
  let feedM = null;
  if (feed) {
    // (his study's texture is upside down to a plane's uvs: its own plane, flipped)
    const geo = new THREE.PlaneGeometry(4.9, 2.76), uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    feedM = add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: feed, color: new THREE.Color(1.2, 1.2, 1.2) })), sa, y0 + SY, sb - 0.01, PI); feedM.visible = false;
    // (the look review's round 6: cut in close, his feed read as an open set beside her, not a screen. A lit bezel round
    // it and a LIVE bug in its corner, on with the feed: from any frame he is on video, from his office)
    const bez = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.5, 0.42) }), live = label([['\u25CF ' + story.t('LIVE'), 64, '#FFFFFF']], { w: 256, h: 96, bg: '#D7263D' });
    const bug = new THREE.Group();
    for (const [w, h, a, yy] of [[5.0, 0.05, 0, 1.405], [5.0, 0.05, 0, -1.405], [0.05, 2.86, 2.475, 0], [0.05, 2.86, -2.475, 0]]) add(plane(w, h, bez), sa + a, y0 + SY + yy, sb - 0.015, PI, bug);
    add(plane(0.62, 0.23, new THREE.MeshBasicMaterial({ map: live.texture })), sa + 2.0, y0 + SY + 1.12, sb - 0.016, PI, bug);
    bug.visible = false; g.add(bug); feedM.userData.bug = bug;
  }
  // Fiona's riser: a round low stage (no mic stand: a black stick through her frame, the look review's round 5)
  // (the look review's round 8: its white side glowed lavender, a plastic tub, and its polished gilt top held a sharp
  // mirror of the evening's title at her feet. The plinths' finish now: a black lacquer drum, satin, gilt bands round its
  // foot and its lip, its top a matte black carpet that holds no reflection)
  { const [ra, rb] = L.riser, drum = std('#16120F', { roughness: 0.55, metalness: 0.1 }), carpet = std('#0E0D10', { roughness: 1, metalness: 0 }), band = std('#9C7A3C', { metalness: 0.7, roughness: 0.55 });
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.98, 0.33, 40), drum), ra, y0 + 0.165, rb);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.985, 0.985, 0.03, 40), band), ra, y0 + 0.03, rb);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.96, 0.955, 0.025, 40), band), ra, y0 + 0.335, rb);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.93, 0.93, 0.02, 40), carpet), ra, y0 + 0.345, rb); }
  // high tables for the guests' glasses
  for (const [ta, tb] of [[2.6, -6.2], [-1.8, -7.5], [3.4, 1.8], [-2.6, 3.0]]) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 18), white), ta, y0 + 1.08, tb); add(box(0.05, 1.06, 0.05, steel), ta, y0 + 0.54, tb);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 14), steel), ta, y0 + 0.01, tb);
    for (let k = 0; k < 2; k++) add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.16, 8), std('#F2E2B0', { transparent: true, opacity: 0.6, roughness: 0.1 })), ta + 0.1 * (k ? 1 : -1), y0 + 1.17, tb + 0.05);
    solid(ta, tb, 0.3, 0.3, 1.1);
  }

  /* the street closed at both ends: striped barriers (a gap on the east sidewalk side for the staff) */
  const stripe = (() => { const [c, x] = canvas(128, 32); for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#EDEDED' : '#D23B2E'; x.beginPath(); x.moveTo(i * 16, 32); x.lineTo(i * 16 + 16, 0); x.lineTo(i * 16 + 32, 0); x.lineTo(i * 16 + 16, 32); x.fill(); } const t = tex(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1); return t; })();
  const barMat = new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.7 });
  // (the look review's round 6: the run to the helicopter crossed the south barrier where it had no gap, and he ran
  // through its boards. A gap at the east side where his way out goes, and every board a wall now)
  for (const [b, a0, a1] of [[-19, -10, -1.4], [-19, 1.4, 10], [27, -10, 4.2], [27, 8.6, 10]]) {
    add(box(a1 - a0, 0.32, 0.12, barMat), (a0 + a1) / 2, 0.95, b); solid((a0 + a1) / 2, b, (a1 - a0) / 2, 0.12, 1.15);
    for (const a of [a0 + 0.3, a1 - 0.3]) add(box(0.1, 1.1, 0.5, std('#3A3D44')), a, 0.55, b);
  }

  /* --- the city's shop signs over it -- */
  // (the storefront fascia signs on the facades either side, js/buildings.js: from inside the pavilion the canopy's
  // lit edge ran through them, so they read as cut into it; the owner's review, 14 Nov. While it is up, those along
  // its length are folded away, each frame, as the city streams them back in; and those down the street past either
  // end, seen through the canopy in the wide shots, a block's worth each way: the look review, 15 Nov)
  let signMeshes = null;
  const _sm = new THREE.Matrix4();
  function hideSigns() {
    if (!signMeshes) { signMeshes = []; app.scene.traverse((o) => { const im = o.isInstancedMesh && o.material?.map?.image; if (im && im.width === 512 && im.height === 96) signMeshes.push(o); }); }
    const cs = Math.cos(PAV.h), sn = Math.sin(PAV.h);
    for (const m of signMeshes) {
      const e = m.instanceMatrix.array; let hit = false;
      for (let i = 0; i < m.count; i++) {
        const k = i * 16, dx = e[k + 12] - PAV.x, dz = e[k + 14] - PAV.z, a = cs * dx - sn * dz, b = sn * dx + cs * dz;
        if (Math.abs(a) < 13 && b > -DECK.b - 40 && b < DECK.b + 160 && (e[k] || e[k + 5] || e[k + 10])) { _sm.makeScale(0, 0, 0).setPosition(e[k + 12], e[k + 13], e[k + 14]); _sm.toArray(e, k); hit = true; }
      }
      if (hit) m.instanceMatrix.needsUpdate = true;
    }
  }

  /* --- its lights -- */
  // (the look review, 15 Nov: with emissive paint only, the deck, the guests, the case and the High Artwork's wall went
  // near black at dusk. Five warm point lights, in the scene from the start with nothing in them while the pavilion is
  // away, so showing it costs no new shaders (m3-set.js does the same): two washes down the deck from the bulb strings,
  // one on the High Artwork's wall and its certificate, one a key on Fiona's riser and the screen's front, a flood)
  const lamps = [
    [0, CY - 1.2, -8.5, '#FFD6A0', 30, 15], [0, CY - 1.2, 2.5, '#FFD6A0', 30, 15],
    [2.4, 3.6, 7.6, '#FFC890', 16, 8], [-2.4, 2.7, 8.9, '#FFE0C0', 9, 6],
    // (and a flood on the plaza past the south end, where his helicopter waits: the take-off read as black)
    // (the look review's round 4, 15 Nov: warm and low, it lit the plaza's tree crown lime from one side; a cool
    // white from higher up, onto the plaza, not into the tree)
    [48, 12, 39, '#DCE4F0', 64, 28],
  ].map(([a, y, b, c, k, d]) => { const l = new THREE.PointLight(c, 0, d, 1.5); const p = at(a, b); l.position.set(p.x, y0 + y, p.z); l.castShadow = false; l.userData.k = k; app.scene.add(l); return l; });

  /* --- the state -- */
  let shown = false, state = 'locked', t = 0;
  const camP = new THREE.Vector3();
  const order = GLYPHS.slice();
  // deal the three shapes to the Nocturnes afresh: P.order[i] is the shape in Nocturne i+1 (I, II, III)
  function deal() {
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    for (const p of marked) { p.glyph = order[p.num]; p.st.mark = p.glyph; p.found = false; p.art.redraw(); }
  }
  const P = {
    group: g, y: y0, key, panels: marked, screen: cardM, colliders, order, high: HIGH,
    tray: at(...L.tray),
    get shown() { return shown; },
    get state() { return state; },
    show(on) {
      shown = !!on; g.visible = shown;
      for (const l of lamps) l.intensity = shown ? l.userData.k : 0;
      const Cc = cm.colliders; for (let i = Cc.length - 1; i >= 0; i--) if (Cc[i].wagmi === 'm4') Cc.splice(i, 1);
      if (shown) Cc.push(...colliders);
      cm._colliderCells = null;
      const G = (window.NYC.groundPatches = window.NYC.groundPatches || []), k = G.indexOf(patch);
      if (shown && k < 0) G.push(patch); else if (!shown && k >= 0) G.splice(k, 1);
      cm._patchCount = -1;
      if (!shown) for (const A of works) A.lod(Infinity);
    },
    reset() { P.caseState('locked'); drawCert(story.t('MR. BIG')); deal(); P.feed(false); },
    // the case: locked (red), open (green: the clock runs), alarm (red, flashing), empty (the key gone)
    caseState(s) {
      state = s;
      // (the screen's card: the alarm once it goes off; LIVE · FROM HIS OFFICE otherwise)
      if (s === 'alarm' || s === 'empty') card.draw([[story.t('ALARM'), 120, '#EF4444']]); else card.draw([[story.t('LIVE'), 60, '#EF4444'], [story.t('FROM HIS OFFICE'), 40]]);
      const c = s === 'open' ? '#4ADE80' : '#EF4444';
      stateMat.color.set(c).multiplyScalar(1.8);
      caseTag.draw([[s === 'open' ? story.t('UNLOCKED') : s === 'empty' ? story.t('EMPTY') : s === 'alarm' ? story.t('ALARM') : story.t('LOCKED'), 64, c]]);
      key.visible = s !== 'empty' && s !== 'alarm';
      // (the look review's round 8: locked, it stood edge-on to the way in, a gold sliver. Its face turned to the door
      // and the guests' side of the case while it waits; it turns on its cushion once unlocked)
      if (s === 'locked') key.rotation.y = -0.42;
      keyGlow.color.set(s === 'open' ? '#7CFFB0' : '#E7C36A').multiplyScalar(2);
    },
    cert(owner, glitch) { drawCert(owner, glitch); },
    // a scene's key light away from the pavilion (one of its lamps lent while it is away: no new light in the scene,
    // so no new shaders): key({ x, y, z, color, k, dist }) or key(null)
    key(o) {
      const l = lamps[3];
      if (!o) { l.intensity = shown ? l.userData.k : 0; const p = at(-2.4, 8.9); l.position.set(p.x, y0 + 2.7, p.z); l.distance = 6; l.color.set('#FFE0C0'); return; }
      // (o.on: lent while it is up too, moved off its string to light a face: the unveil's key on Fiona)
      if (shown && !o.on) return;
      l.position.set(o.x, o.y, o.z); l.color.set(o.color || '#FFE2C4'); l.intensity = o.k ?? 6; l.distance = o.dist ?? 6;
    },
    // the screen: his feed live (on) or the card
    feed(on) { if (feedM) { feedM.visible = !!on; feedM.userData.bug.visible = !!on; cardM.visible = !on; } },
    flash(tt) { if (state === 'alarm') stateMat.color.set(Math.sin(tt * 12) > 0 ? '#FF3B3B' : '#3A0A0A').multiplyScalar(1.8); },
    update(dt, cam) {
      if (!shown) return;
      t += dt;
      hideSigns();
      if (state === 'open') { const k = 1.6 + Math.sin(t * 6) * 0.8; keyGlow.color.set('#7CFFB0').multiplyScalar(k); key.rotation.y += dt * 0.8; }
      P.flash(t);
      if (cam) { camP.copy(cam); for (const A of works) A.lod(A.at.distanceTo(camP)); }
    },
    dispose() { P.show(false); app.scene.remove(g); for (const l of lamps) app.scene.remove(l); for (const A of works) A.dispose(); },
  };
  P.reset();
  return P;
}
