// Mog City: Mission 4's sets (docs/MISSIONS.md, Mission 4 · Shredder), placeholders for the first playable: plain
// shapes and procedural art made here, nothing downloaded, no new scene lights (emissive paint only), no brand.
//   buildPavilion(W, { feed })  the open-sided glass pavilion on South St at the Seaport: m4-pavilion.js (its set, the
//                               display case, the signing key, the High Artwork, the certificate, the art wall)
//   buildLanding(W)             the generic ferry landing at Vesey St: a float, a plain FERRY sign, the departure board
//                               (LAST FERRY · 11:45 · HOBOKEN), lamps, a gangway. No operator's name anywhere
//   buildFerry(W)               a placeholder ferry: its own Group (it moves), a plain hull, cabins, an open stern deck
//                               with a rail; no name, no livery
// The pavilion's spot is the plan's, South St at Beekman St, checked in the engine (14 Nov): the road about 11 m wide,
// the building faces about 23 m apart, open to the sky, cross streets at the north and south ends.
import * as THREE from 'three/webgpu';
import { S as story } from '../story/index.js';

const PI = Math.PI;
// the artist (fictional, checked against real names): his mark, hidden three times in everything he makes
export const ARTIST = 'Marzo Quillfeather';
export const GLYPHS = ['triangle', 'ring', 'cross'];
// the pavilion: its centre on South St and the street's heading there (forward = along the street, to the south-west)
export const PAV = { x: 908, z: 5485, h: -0.417 };
const F = [Math.sin(PAV.h), Math.cos(PAV.h)], R = [Math.cos(PAV.h), -Math.sin(PAV.h)];
// a point in the pavilion's frame: a across the street (+ to the east side), b along it (+ to the closed south end)
export const at = (a, b) => ({ x: PAV.x + R[0] * a + F[0] * b, z: PAV.z + R[1] * a + F[1] * b });
// its places, in that frame
// the big screen's middle, over the deck (m4-pavilion.js: raised in the look review's round 9, the title its lower third)
export const SY = 3.23;
export const SPOTS = {
  door: at(3.2, -13.5),          // the staff entrance, Knox on it
  carAt: at(0, -44),             // where the drive ends: the street before the roadblock
  dan0: at(1.6, -15.5),          // Dan on foot at the entrance
  case: at(0, 0.6),              // the display case and the key (m4-pavilion.js L)
  art: at(5.2, 6),               // the High Artwork's wall (the east side, facing in)
  cert: at(5.2, 9.55),           // the wall certificate beside it
  screen: at(0, 13.4),           // the big screen
  riser: at(-3.1, 11.4),         // Fiona's riser
  panels: [at(-4.2, -9.6), at(-4.2, -3.6), at(-4.2, 2.4)],   // where he stands to study the three Nocturnes
  crowd: at(0, 7),               // the guests, facing the screen
  takeoff: at(0, 38),            // Mr. Big's helicopter, rotors idling at the closed end
};
export const LAND = { x: -680, z: 4950, r: 9, name: 'Battery Park City · the riverfront' };
export const GATE = { x: -603, z: 5238, name: 'The ferry landing · Vesey St' };
export const DOCK = { x: -640, z: 5246, h: -PI / 2 + 0.36 };

const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...o });
const glow = (color, k = 1.6) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) });

function label(lines, { w = 512, h = 128, bg = 'rgba(8,10,14,0.85)', color = '#FFFFFF' } = {}) {
  const [c, x] = canvas(w, h);
  const draw = (ls, col = color) => {
    x.clearRect(0, 0, w, h); x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    ls.forEach(([t, size = 48, c2 = col, weight = 800], i) => { x.fillStyle = c2; x.font = `${weight} ${size}px "Barlow Condensed", sans-serif`; x.fillText(t, w / 2, h * (i + 1) / (ls.length + 1)); });
  };
  draw(lines);
  const t = tex(c);
  return { canvas: c, texture: t, draw(ls, col) { draw(ls, col); t.needsUpdate = true; } };
}
const plane = (w, h, mat) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
const box = (w, h, d, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = true; m.receiveShadow = true; return m; };

export { buildPavilion } from './m4-pavilion.js';

/* ------------------------------------------------------- ferry landing -- */
export function buildLanding(W) {
  const app = W.app;
  const g = new THREE.Group(); g.name = 'm4-ferry-landing'; g.visible = false; app.scene.add(g);
  g.position.set(GATE.x, 0, GATE.z); g.rotation.y = DOCK.h;
  const add = (m, x, y, z, rot = 0) => { m.position.set(x, y, z); m.rotation.y = rot; g.add(m); return m; };
  const deck = std('#4A4D52', { roughness: 0.85 }), rail = std('#C9CCD1', { metalness: 0.6, roughness: 0.4 });
  // the float out over the water (local +z: out from the shore), the gangway down to it
  add(box(10, 0.6, 26, deck), 0, -1.6, 22);
  add(box(2.2, 0.15, 10, deck), 0, -0.6, 5.5);
  for (const s of [-1, 1]) { add(box(0.06, 1.0, 10, rail), s * 1.1, -0.1, 5.5); add(box(0.06, 1.0, 26, rail), s * 5, -0.9, 22); }
  // the sign: FERRY only, and the departure board
  const sign = label([[story.t('FERRY'), 92, '#FFFFFF']], { w: 512, h: 160, bg: '#163A5F' });
  add(plane(3.2, 1.0, new THREE.MeshBasicMaterial({ map: sign.texture })), 0, 3.4, 0.2, PI);
  for (const s of [-1.5, 1.5]) add(box(0.12, 3.4, 0.12, rail), s, 1.7, 0.25);
  const board = label([[story.t('LAST FERRY'), 40, '#FFC93C'], [story.t('11:45 · HOBOKEN'), 52, '#FFFFFF'], [story.t('BOARDING'), 34, '#4ADE80']], { w: 384, h: 256, bg: '#0B0D12' });
  add(plane(1.4, 0.95, new THREE.MeshBasicMaterial({ map: board.texture })), 2.6, 1.8, 0.6, PI);
  add(box(0.1, 1.4, 0.1, rail), 2.6, 0.7, 0.66);
  // lamps (night paint only) and life rings
  for (const z of [8, 18, 30]) for (const s of [-1, 1]) { add(box(0.1, 3, 0.1, rail), s * 4.7, -0.1, z); add(box(0.35, 0.25, 0.35, glow('#FFE2A8', 2.4)), s * 4.7, 1.5, z); }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.08, 8, 20), std('#E35B2C'));
  for (const z of [12, 24]) { const r = ring.clone(); r.position.set(-5.05, -0.7, z); r.rotation.y = PI / 2; g.add(r); }
  return { group: g, board, show(on) { g.visible = !!on; }, dispose() { app.scene.remove(g); } };
}

/* --------------------------------------------------------------- ferry -- */
// local frame: +z the bow, the deck's top at DECK over the water's level; the open stern deck z -17..-9
export const FERRY = { len: 34, beam: 8.4, deck: 2.9, stern: -14.5 };
export function buildFerry(W) {
  const app = W.app;
  const g = new THREE.Group(); g.name = 'm4-ferry'; g.visible = false; app.scene.add(g);
  const add = (m, x, y, z) => { m.position.set(x, y, z); g.add(m); return m; };
  const hullM = std('#F1F1EE', { roughness: 0.45 }), navy = std('#1E2E4A'), rail = std('#D9DCE0', { metalness: 0.6, roughness: 0.4 });
  const win = glow('#FFE0A0', 1.8);
  add(box(FERRY.beam, 3.2, FERRY.len, hullM), 0, 1.3, 0);
  add(box(FERRY.beam + 0.04, 0.5, FERRY.len + 0.04, navy), 0, 0.2, 0);
  // the cabin from about -0.28 x length to the bow, leaving the open stern deck; its windows lit; the wheelhouse
  const c0 = -FERRY.len * 0.28, c1 = FERRY.len * 0.42;
  add(box(FERRY.beam - 0.8, 2.4, c1 - c0, hullM), 0, FERRY.deck + 1.2, (c0 + c1) / 2);
  for (const s of [-1, 1]) add(box(0.05, 0.9, c1 - c0 - 1, win), s * (FERRY.beam / 2 - 0.39), FERRY.deck + 1.4, (c0 + c1) / 2);
  add(box(3.4, 1.6, 3.2, hullM), 0, FERRY.deck + 3.2, c1 - 3);
  add(box(3.45, 0.6, 3.25, win), 0, FERRY.deck + 3.4, c1 - 3);
  // the stern rail, the deck lamps
  add(box(FERRY.beam, 1.05, 0.06, rail), 0, FERRY.deck + 0.52, -FERRY.len / 2 + 0.1);
  for (const s of [-1, 1]) add(box(0.06, 1.05, c0 + FERRY.len / 2, rail), s * (FERRY.beam / 2 - 0.05), FERRY.deck + 0.52, (c0 - FERRY.len / 2) / 2);
  for (const s of [-1, 1]) add(box(0.25, 0.18, 0.25, glow('#FFE9C0', 2.6)), s * 3, FERRY.deck + 2.5, c0 + 0.2);
  const water = (app.controllerManager?.waterLevel ?? -2.2);
  return {
    group: g, water,
    show(on) { g.visible = !!on; },
    // its place on the water: x, z, heading, a little bob and roll by t
    put(x, z, h, t = 0) { g.position.set(x, water - 1.4 + Math.sin(t * 1.3) * 0.08, z); g.rotation.set(Math.sin(t * 0.9) * 0.008, h, Math.sin(t * 1.1) * 0.012); },
    // a point of the ferry's own, in the world (lx across, ly up from the deck, lz along)
    world(lx, ly, lz, out = new THREE.Vector3()) { return g.localToWorld(out.set(lx, FERRY.deck + ly, lz)); },
    dispose() { app.scene.remove(g); },
  };
}
