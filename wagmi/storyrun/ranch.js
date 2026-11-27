// Mog City story runner: a ranch dressed on open land at the edge of a town, for a Story Kit world that asks for one
// (world.ranches: [{ at: '<place key>', sign, cattle, horses }]; GameMog storykit BUILDER.md, Ranches). Imported by
// storyrun/index.js only when a world asks, so every other world is the town exactly as it is.
// Where it goes is ranch-plan.js's (a plot fronting a road near the place, clear of every building, road, sidewalk
// and the water, on ground near level, inside the town's map); this builds it there, on the ground as it lies:
//   the front fence (post-and-rail by the gate, barbed wire on T-posts beyond, round the sides and the back), the gate
//   with its log posts and the overhead sign (the ranch's name in its own burned lettering and brand), its pipe gates
//   swung open; the mailbox at the drive's mouth; the dirt drive and yard; the farmhouse (lap siding, a metal roof, a
//   brick chimney, a deep porch with rockers, facing the road); the red barn (gambrel roof, the big doors, the hayloft
//   door, a cupola); the stable (stalls under a deep overhang); a round corral with the horses (the library's horse,
//   CC0); the windmill (its wheel turning in the wind) over a stock tank; round hay bales by the barn; the pasture
//   behind its cross fence with the cattle (Realtime Rancher's cow, CC0: assets/props/cow.glb, CREDITS.md), grazing
//   and looking up. Every wall, post and fence is solid (the city's colliders: a car stops at it, a man hurdles a fence),
//   every way through a fence open, so every mark is reached on foot from the road (reach.js).
//   createRanches(W, def, places) -> { ready (Promise), list, update(dt), mark(key, name) }
// A ranch that finds no plot, or a place that is missing, is left out (the world's place plays as it is): nothing
// here ever stops the story.
import * as THREE from 'three/webgpu';
import { Fn, positionLocal, positionGeometry, vec3, float, smoothstep, cos, sin, attribute } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { world as cityWorld } from '../world/index.js';
import { findRanchSite, layoutRanch, toWorld, markAt, VERGE, RANCH_MARKS, COW_NECK } from './ranch-plan.js';
import { libModel } from './setkit.js';
import { loadGLB } from '../glb.js';
import { loadCreature } from '../library/creature.js';
import { PROFILES } from '../creatures/profiles.js';
import { maskClass } from '../world/sf.js';
import { windowBox, townEdge, inWindow, CLIP, BAND } from '../world/growing.js';

const PI = Math.PI;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// a small seeded random, so a ranch is dressed the same way every time
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hashStr = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// a phone or a low tier (the city's quality, as the story's dressing reads it: 'phone' or 'low', as js/buildings.js; a
// medium desktop keeps the whole herd)
const lowTier = () => { try { const q = globalThis.window?.NYC?.quality; return !!(q && ['phone', 'low'].includes(q.tier)) || !!globalThis.matchMedia?.('(pointer: coarse)').matches; } catch { return false; } };

/* ------------------------------------------------------------------ surfaces, drawn into canvases (metres per tile) */
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function texOf(c, srgb = true) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
function grain(x, w, h, r, n, a) { for (let i = 0; i < n; i++) { x.globalAlpha = a * (0.4 + r() * 0.6); x.fillStyle = r() < 0.5 ? '#000' : '#fff'; x.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); } x.globalAlpha = 1; }
const SURF = new Map();
function surface(name, draw, tile, rough = 0.85) {
  if (SURF.has(name)) return SURF.get(name);
  const [c, x] = canvas(512, 512); draw(x, 512, rng(hashStr(name)));
  const map = texOf(c); map.userData.tile = tile;
  SURF.set(name, map); return map;
}
// vertical board-and-batten, painted and weathered (a barn's red, a stable's stain): 2 m a tile
function boards(paint, { batten = true, wear = 0.5 } = {}) {
  return surface('boards' + paint + batten, (x, n, r) => {
    x.fillStyle = paint; x.fillRect(0, 0, n, n);
    const bw = n / 10;
    for (let i = 0; i < 10; i++) {
      const l = (r() - 0.5) * 22; x.fillStyle = `rgba(${l > 0 ? 255 : 0},${l > 0 ? 240 : 0},${l > 0 ? 220 : 0},${Math.abs(l) / 120})`; x.fillRect(i * bw, 0, bw, n);
      // grain streaks down each board, the paint worn through to grey wood here and there
      for (let k = 0; k < 26; k++) { x.globalAlpha = 0.06 + r() * 0.1; x.fillStyle = r() < wear * 0.5 ? '#9A9286' : '#2A1A14'; const sx = i * bw + r() * bw; x.fillRect(sx, r() * n, 1 + r() * 2, 20 + r() * 160); }
      x.globalAlpha = 1;
      x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(i * bw, 0, 2, n);
      if (batten) { x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(i * bw + 3, 0, 9, n); x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(i * bw + 3, 0, 3, n); }
    }
    // (weathering in blotches, never in bands: the tile repeats up the wall every 2 m)
    for (let k = 0; k < 40; k++) { const gg = x.createRadialGradient(0, 0, 0, 0, 0, 20 + r() * 50); gg.addColorStop(0, `rgba(${r() < 0.5 ? '40,24,16' : '150,140,124'},0.18)`); gg.addColorStop(1, 'rgba(0,0,0,0)'); x.save(); x.translate(r() * n, r() * n); x.scale(0.4, 1.6); x.fillStyle = gg; x.fillRect(-80, -80, 160, 160); x.restore(); }
    grain(x, n, n, r, 5000, 0.12);
  }, 2);
}
// ribbed metal roofing, its ribs down the slope (u across them), streaked and a little rusted where it is old
function ribs(base, rust = 0.3) {
  return surface('ribs' + base + rust, (x, n, r) => {
    x.fillStyle = base; x.fillRect(0, 0, n, n);
    const rib = n / 8;
    for (let i = 0; i < 8; i++) { const g = x.createLinearGradient(i * rib, 0, (i + 1) * rib, 0); g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(0.12, 'rgba(0,0,0,0.25)'); g.addColorStop(0.2, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(255,255,255,0.05)'); x.fillStyle = g; x.fillRect(i * rib, 0, rib, n); }
    for (let k = 0; k < 60 * rust; k++) { x.globalAlpha = 0.08 + r() * 0.18; x.fillStyle = r() < 0.6 ? '#7A4A2A' : '#3A3634'; x.fillRect(r() * n, r() * n, 2 + r() * 6, 30 + r() * 180); }
    x.globalAlpha = 1; grain(x, n, n, r, 2500, 0.06);
  }, 2);
}
// horizontal lap siding, painted (the house)
function siding(paint) {
  return surface('siding' + paint, (x, n, r) => {
    x.fillStyle = paint; x.fillRect(0, 0, n, n);
    const lap = n / 13;
    for (let i = 0; i < 13; i++) {
      const y = i * lap; const g = x.createLinearGradient(0, y, 0, y + lap); g.addColorStop(0, 'rgba(0,0,0,0.28)'); g.addColorStop(0.18, 'rgba(0,0,0,0.04)'); g.addColorStop(1, 'rgba(255,255,255,0.06)');
      x.fillStyle = g; x.fillRect(0, y, n, lap);
      for (let k = 0; k < 8; k++) { x.globalAlpha = 0.05 + r() * 0.06; x.fillStyle = '#5A5246'; x.fillRect(r() * n, y + r() * lap, 30 + r() * 120, 1); }
      x.globalAlpha = 1;
    }
    grain(x, n, n, r, 3000, 0.08);
  }, 2);
}
// weathered grey-brown wood (posts, rails, the corral, the porch)
function wood(tone = '#8A7A66') {
  return surface('wood' + tone, (x, n, r) => {
    x.fillStyle = tone; x.fillRect(0, 0, n, n);
    for (let k = 0; k < 900; k++) { x.globalAlpha = 0.05 + r() * 0.12; x.fillStyle = r() < 0.5 ? '#3A3026' : '#C9BCA6'; x.fillRect(r() * n, r() * n, 1 + r() * 1.5, 30 + r() * 200); }
    x.globalAlpha = 1; grain(x, n, n, r, 3000, 0.1);
  }, 1);
}
// straw: a round bale's wrapped sides (fibres along it) and its rolled face (the spiral)
function straw() {
  return surface('straw', (x, n, r) => {
    x.fillStyle = '#B99A55'; x.fillRect(0, 0, n, n);
    for (let k = 0; k < 4200; k++) { x.globalAlpha = 0.18 + r() * 0.3; x.strokeStyle = ['#D9BE78', '#8F7236', '#C8A962', '#E8D59A', '#6E5A2E'][Math.floor(r() * 5)]; x.lineWidth = 0.6 + r() * 1.4; const y = r() * n, x0 = r() * n; x.beginPath(); x.moveTo(x0, y); x.quadraticCurveTo(x0 + 20, y + (r() - 0.5) * 6, x0 + 40 + r() * 70, y + (r() - 0.5) * 10); x.stroke(); }
    x.globalAlpha = 1;
  }, 1.5);
}
function strawEnd() {
  return surface('strawEnd', (x, n, r) => {
    x.fillStyle = '#A88A48'; x.fillRect(0, 0, n, n);
    const c = n / 2;
    for (let k = 0; k < 2600; k++) { const a = r() * PI * 2, d = r() * c; x.globalAlpha = 0.25 + r() * 0.3; x.strokeStyle = ['#D9BE78', '#7E6430', '#C8A962', '#E3CF92'][Math.floor(r() * 4)]; x.lineWidth = 0.8 + r(); x.beginPath(); x.arc(c, c, d, a, a + 0.15 + r() * 0.5); x.stroke(); }
    x.globalAlpha = 0.5; x.strokeStyle = '#4E3E1E'; for (let d = 6; d < c; d += 9 + r() * 4) { x.lineWidth = 1 + r(); x.beginPath(); x.arc(c, c, d, 0, PI * 2); x.stroke(); }
    x.globalAlpha = 1;
  }, 1);
}
// packed dirt: tracks, pebbles, dried mud; its alpha fades it into the grass at the edges (drawn per piece below)
function dirt() {
  return surface('dirt', (x, n, r) => {
    x.fillStyle = '#7A6248'; x.fillRect(0, 0, n, n);
    for (let k = 0; k < 160; k++) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 30 + r() * 60); const c = r() < 0.5 ? '120,98,70' : '92,72,52'; g.addColorStop(0, `rgba(${c},0.35)`); g.addColorStop(1, `rgba(${c},0)`); x.save(); x.translate(r() * n, r() * n); x.fillStyle = g; x.fillRect(-90, -90, 180, 180); x.restore(); }
    for (let k = 0; k < 1800; k++) { x.globalAlpha = 0.3 + r() * 0.5; x.fillStyle = ['#9C8A70', '#5A4632', '#B4A68E', '#3E3024'][Math.floor(r() * 4)]; const s = 1 + r() * 3; x.fillRect(r() * n, r() * n, s, s * (0.6 + r() * 0.6)); }
    x.globalAlpha = 1; grain(x, n, n, r, 6000, 0.1);
  }, 4);
}
// rangeland: short dry grass, straw and sage green in clumps, bare earth between (laid over the town's lawn inside the
// fences, so the ranch reads as range, not a park)
function range() {
  return surface('range', (x, n, r) => {
    x.fillStyle = '#8C8A55'; x.fillRect(0, 0, n, n);
    for (let k = 0; k < 220; k++) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 14 + r() * 40); const c = ['150,140,84', '110,118,70', '128,104,68', '170,156,98'][Math.floor(r() * 4)]; g.addColorStop(0, `rgba(${c},0.5)`); g.addColorStop(1, `rgba(${c},0)`); x.save(); x.translate(r() * n, r() * n); x.fillStyle = g; x.fillRect(-60, -60, 120, 120); x.restore(); }
    for (let k = 0; k < 9000; k++) { x.globalAlpha = 0.25 + r() * 0.5; x.strokeStyle = ['#C9B97A', '#7E8A4E', '#A69560', '#5E6A3A', '#D8CC96'][Math.floor(r() * 5)]; x.lineWidth = 0.8 + r() * 0.8; const a = -PI / 2 + (r() - 0.5) * 1.2, L = 3 + r() * 7, x0 = r() * n, y0 = r() * n; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x0 + Math.cos(a) * L, y0 + Math.sin(a) * L); x.stroke(); }
    x.globalAlpha = 1;
  }, 6);
}
// a fade for a dirt piece: radial (the yard) or across (the drive), 1 in the middle
function fadeTex(kind) {
  return surface('fade' + kind, (x, n) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, n, n);
    if (kind === 'radial') { const g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); g.addColorStop(0, '#fff'); g.addColorStop(0.7, '#eee'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, n, n); }
    else if (kind === 'plot') { const e = n * 0.06; x.fillStyle = '#fff'; x.fillRect(e, e, n - 2 * e, n - 2 * e); x.filter = `blur(${e * 0.6}px)`; x.drawImage(x.canvas, 0, 0); x.filter = 'none'; }
    else { const g = x.createLinearGradient(0, 0, n, 0); g.addColorStop(0, '#000'); g.addColorStop(0.22, '#fff'); g.addColorStop(0.78, '#fff'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, n, n); }
  }, 1);
}
// the sign: the ranch's name burned into a weathered plank, its brand beside it (original lettering, no real mark)
function signTex(text, brand) {
  const [c, x] = canvas(1024, 256), r = rng(hashStr(text));
  x.fillStyle = '#6E5338'; x.fillRect(0, 0, 1024, 256);
  for (let k = 0; k < 1400; k++) { x.globalAlpha = 0.06 + r() * 0.12; x.fillStyle = r() < 0.5 ? '#2E2014' : '#B4946A'; x.fillRect(r() * 1024, r() * 256, 40 + r() * 300, 1 + r() * 2); }
  x.globalAlpha = 1;
  // two planks, their seam
  x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(0, 126, 1024, 4);
  // the lettering: wide slab-serif capitals, burned dark with a scorched halo
  const t = String(text || 'RANCH').toUpperCase().slice(0, 28);
  let size = 132; x.font = `900 ${size}px Rockwell, "Roboto Slab", "Courier New", Georgia, serif`;
  const maxW = brand ? 760 : 960;
  while (x.measureText(t).width > maxW && size > 40) { size -= 4; x.font = `900 ${size}px Rockwell, "Roboto Slab", "Courier New", Georgia, serif`; }
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const cx = brand ? 610 : 512;
  x.shadowColor = 'rgba(40,18,6,0.9)'; x.shadowBlur = 10; x.fillStyle = '#1E120A'; x.fillText(t, cx, 134);
  x.shadowBlur = 0; x.fillStyle = 'rgba(255,220,170,0.12)'; x.fillText(t, cx - 1.5, 131);
  if (brand) {
    // the brand: its letter over a bar (a "bar" brand), burned in
    x.save(); x.translate(104, 124); x.strokeStyle = '#1E120A'; x.lineWidth = 11; x.lineCap = 'round'; x.shadowColor = 'rgba(40,18,6,0.8)'; x.shadowBlur = 8;
    x.font = '900 96px Georgia, serif'; x.fillStyle = '#1E120A'; x.fillText(brand, 0, -14);
    x.beginPath(); x.moveTo(-44, 50); x.lineTo(44, 50); x.stroke(); x.restore();
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(196, 40, 3, 176);
  }
  // nail heads at the corners
  x.fillStyle = '#2A2622'; for (const [a, b] of [[24, 30], [1000, 30], [24, 226], [1000, 226]]) { x.beginPath(); x.arc(a, b, 6, 0, PI * 2); x.fill(); }
  const tx = texOf(c); tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping; return tx;
}
// a window: dark glass with the sky in it, its sash bars (lit warm at night by the night pass's emissive)
function windowTex() {
  return surface('window', (x, n) => {
    const g = x.createLinearGradient(0, 0, 0, n); g.addColorStop(0, '#5E7488'); g.addColorStop(0.45, '#26323E'); g.addColorStop(1, '#141A20'); x.fillStyle = g; x.fillRect(0, 0, n, n);
    x.fillStyle = 'rgba(210,190,150,0.18)'; x.fillRect(n * 0.08, n * 0.1, n * 0.84, n * 0.25);
    x.fillStyle = '#ECE6D8'; x.fillRect(0, n / 2 - 8, n, 16); x.fillRect(n / 2 - 8, 0, 16, n);
    x.lineWidth = 22; x.strokeStyle = '#ECE6D8'; x.strokeRect(11, 11, n - 22, n - 22);
  }, 1);
}

/* ------------------------------------------------------------------ geometry helpers */
// a box with its faces' UVs in metres (over its material's tile)
function boxGeo(w, h, d, tile = 1) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
  return g;
}
function cylGeo(rt, rb, h, seg = 12, tile = 1, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * PI * Math.max(rt, rb) / tile, uv.getY(i) * h / tile);
  return g;
}
// a piece placed: geometry moved into the ranch's frame (its own position, turn about y, then tilt)
function placed(g, x, y, z, ry = 0, rx = 0, rz = 0) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1));
  return g.applyMatrix4(m);
}
// a beam between two points (a rail, a strand of wire, a brace), w across, h deep
function beam(a, b, w, h, tile = 1) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz);
  const g = boxGeo(w, h, L, tile);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(dx / L, dy / L, dz / L));
  return g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), q, new THREE.Vector3(1, 1, 1)));
}

/* ------------------------------------------------------------------ the ranches */
export async function createRanches(W, def, places) {
  const specs = (Array.isArray(def?.ranches) ? def.ranches : []).slice(0, 2);
  const out = { list: [], ready: null, update() {}, mark: () => null };
  if (!specs.length) { out.ready = Promise.resolve([]); return out; }
  const app = W.app, scene = app.scene;
  out.ready = (async () => {
    // (the town's roads and colliders up first: the plot is found against them)
    for (let i = 0; i < 900 && !(app.trafficSystem?.network && app.controllerManager?.colliders?.length); i++) await sleep(100);
    const cm = app.controllerManager, net = app.trafficSystem?.network;
    if (!cm || !net) { console.warn('[storyrun] ranch: the town never came up'); return []; }
    // (the hold zones: every hold the story sets keeps the ranches' too. Wrapped before the ranches are built, so a
    // hold the story sets meanwhile (a cutscene's, a chase's clear zone: the first mission waits at most 25 s for the
    // ranch) is the one put back with them once they stand, never wiped)
    const TS = app.trafficSystem, holds = [];
    let last = [];
    if (TS && typeof TS.hold === 'function' && !TS.__ranchHold) {
      const h0 = TS.hold; TS.__ranchHold = true;
      // (the story's own rects are what TS.__rects keeps (runner.js clearSpot puts them back when its spot is done, by
      // identity): whichever wrapper is outside, __rects ends up the story's, never a copy with the ranch's holds in it)
      TS.hold = function (rects = []) {
        last = Array.isArray(rects) ? rects.slice() : [];
        const out = h0.call(this, holds.length ? [...last, ...holds] : last);
        if (this.__rectsKept) this.__rects = rects;
        return out;
      };
    }
    for (const [i, spec] of specs.entries()) {
      try { const r = await buildRanch(W, spec, i, places, cm, net, scene); if (r) out.list.push(r); }
      catch (e) { console.warn('[storyrun] ranch', spec && spec.at, e); }
    }
    holds.push(...out.list.flatMap((r) => r.holds));
    if (holds.length && TS && TS.__ranchHold) try { TS.hold(last); } catch (e) { console.warn('[storyrun] ranch hold', e); }
    return out.list;
  })();
  // a place the world names at a ranch (places.js setRanch): the ranch's own key is its yard, an alias of the same town
  // place with a `ranch` mark that mark; the car's end of either is the gate on the road
  out.place = (key, alias) => {
    for (const R of out.list) {
      const m = key === R.key ? R.marks.yard : alias && typeof alias.ranch === 'string' && alias['@'] === R.cityKey ? R.marks[alias.ranch] : null;
      if (!m) continue;
      const g = R.marks.gate, foot = m !== g;
      return { x: g.x, z: g.z, heading: g.heading, name: (alias && alias.name) || R.name, kind: 'ranch', cx: m.x, cz: m.z, ...(foot ? { ax: m.x, az: m.z, lx: m.x, lz: m.z } : {}) };
    }
    return null;
  };
  out.update = (dt) => { for (const r of out.list) try { r.update(dt); } catch (e) { console.warn('[storyrun] ranch update', e); r.update = () => {}; } };
  return out;
}

// the plot's checks against the town (world contract)
function townChecks(cm, net) {
  const N = globalThis.window?.NYC || {}, T = N.Terrain;
  const edges = net.edges.map((e) => ({ x0: e.x0 ?? e.sx, z0: e.z0 ?? e.sz, dx: e.dx, dz: e.dz, rx: e.rx ?? -e.dz, rz: e.rz ?? e.dx, span: e.span ?? e.len, half: e.half, bore: e.bore }));
  const height = (x, z) => { try { const y = T && T.groundAt ? T.groundAt(x, z) : cm.baseHeight?.(x, z); return Number.isFinite(y) ? y : cityWorld.groundY(x, z); } catch { return 0; } };
  const water = (x, z) => { try { if (cityWorld.inWater?.(x, z)) return true; if (T && T.groundAt && Number.isFinite(T.waterLevel) && !(T.groundAt(x, z) > T.waterLevel + 0.3)) return true; } catch {} return false; };
  const road = (x, z) => {
    try {
      const near = N.nearestRoads ? N.nearestRoads(x, z, 30) : null;
      if (near) return near.some((q) => q.road && Number.isFinite(q.road.w) && q.dist <= q.road.w / 2 + 2);
      const L = cityWorld.nearestLane(x, z, 'car', 16); return !!L && L.d < (L.edge?.half ?? 5) + 2;
    } catch { return false; }
  };
  // (a sidewalk or a paved square: the package's ground mask, San Francisco's classes, as pkg.js reads it)
  // (a paved lot, class 7 of a Hometown package's ground: a ranch on open land is never laid over a parking lot)
  const sidewalk = (x, z) => { try { return maskClass(x, z) === 1; } catch { return false; } };
  const lot = (x, z) => { try { return maskClass(x, z) === 7; } catch { return false; } };
  // (a park is the town's own lawn, its paths walked by the crowd: open land first; a park's only where the town has
  // no other room (a district of a growing town, all streets), and never a cemetery, a memorial or a school's)
  const park = (x, z) => { try { return !!cityWorld.isPark?.(x, z); } catch { return false; } };
  const sacred = (x, z) => { try { const b = N.blockAt?.(x, z); return !!b && /cemetery|memorial|grave|school|church/i.test(String(b.parkName || '')); } catch { return false; } };
  const blocked = (x, z) => water(x, z) || road(x, z) || sidewalk(x, z) || lot(x, z) || park(x, z);
  const blockedPark = (x, z) => water(x, z) || road(x, z) || sidewalk(x, z) || sacred(x, z);
  // (a building, a wall, a fence of the town's inside the plot: its box against the plot's, both turned)
  const solid = (site) => {
    const C = corners(site, 3), cx = C.reduce((a, p) => a + p.x, 0) / 4, cz = C.reduce((a, p) => a + p.z, 0) / 4;
    const list = cm.nearColliders(cx, cz, Math.hypot(site.w, site.d) / 2 + 8);
    for (const c of list) {
      if (c.wagmi === 'ranch' || !Number.isFinite(c.minX)) continue;
      // (in the plot's frame: the collider's box corners; any inside, or the plot's middle inside the box)
      const pts = [[c.minX, c.minZ], [c.maxX, c.minZ], [c.maxX, c.maxZ], [c.minX, c.maxZ], [(c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2]];
      let lu0 = Infinity, lu1 = -Infinity, lv0 = Infinity, lv1 = -Infinity;
      for (const [x, z] of pts) { const dx = x - site.x, dz = z - site.z, u = dx * site.ux + dz * site.uz, v = dx * site.vx + dz * site.vz; lu0 = Math.min(lu0, u); lu1 = Math.max(lu1, u); lv0 = Math.min(lv0, v); lv1 = Math.max(lv1, v); }
      if (lu1 < -site.w / 2 - 3 || lu0 > site.w / 2 + 3 || lv1 < -VERGE + 2 || lv0 > site.d + 3) continue;
      // (a collider's box turned against the plot overlaps it on the plot's axes; its own outline then decides)
      if (c.obb) {
        const o = c.obb, ax = o.cs, az = -o.sn, bx = o.sn, bz = o.cs; // its along and across axes in the world
        let hit = false;
        for (let u = -site.w / 2 - 2; u <= site.w / 2 + 2 && !hit; u += 3) for (let v = -VERGE + 2; v <= site.d + 2 && !hit; v += 3) {
          const p = toWorld(site, u, v), dx = p.x - o.cx, dz = p.z - o.cz;
          if (Math.abs(dx * ax + dz * az) <= o.hx + 1.5 && Math.abs(dx * bx + dz * bz) <= o.hz + 1.5) hit = true;
        }
        if (!hit) continue;
      }
      return true;
    }
    return false;
  };
  // (on the town's map: inside a growing town's window, kept CLIP m in, where its traffic and people go; and on ground
  // the terrain has)
  // (a whole town: inside its play area, clear of the soft boundary's band, townEdge)
  const box = windowBox(N.PKG), edge = box ? null : townEdge(N.PKG), EM = BAND + 60;
  const inMap = (x, z) => {
    if (!inWindow(box, x, z, CLIP)) return false;
    if (edge && !inWindow(edge, x, z, EM)) return false;
    try { return !(T && T.groundAt) || Number.isFinite(T.groundAt(x, z)); } catch { return true; }
  };
  const crowd = crowdGrid(cm.colliders);
  return { edges, height, blocked, blockedPark, solid, inMap, crowd };
}
// how built-up the town is round a point: the town's colliders (its buildings, walls, fences) counted in 40 m cells
// once, then summed over the 360 m square round the point (a summed-area table: every candidate plot asks it).
// 0 is open land; a built-up street is about 1 and up (about the colliders within 160 m, over 40, as before)
function crowdGrid(cols) {
  const C = 40, list = (cols || []).filter((c) => c && c.wagmi !== 'ranch' && Number.isFinite(c.minX) && Number.isFinite(c.maxZ));
  if (!list.length) return () => 0;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const c of list) { const x = (c.minX + c.maxX) / 2, z = (c.minZ + c.maxZ) / 2; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  const nx = Math.min(1200, Math.ceil((x1 - x0) / C) + 1), nz = Math.min(1200, Math.ceil((z1 - z0) / C) + 1);
  const S = new Float64Array((nx + 1) * (nz + 1));
  // (a big building counts as the houses it would hold, up to 20: a hospital beside the plot is no open land)
  for (const c of list) { const i = clamp(Math.floor(((c.minX + c.maxX) / 2 - x0) / C), 0, nx - 1), j = clamp(Math.floor(((c.minZ + c.maxZ) / 2 - z0) / C), 0, nz - 1); S[(j + 1) * (nx + 1) + i + 1] += clamp((c.obb ? 4 * c.obb.hx * c.obb.hz : (c.maxX - c.minX) * (c.maxZ - c.minZ)) / 300, 1, 20); }
  for (let j = 1; j <= nz; j++) for (let i = 1; i <= nx; i++) S[j * (nx + 1) + i] += S[(j - 1) * (nx + 1) + i] + S[j * (nx + 1) + i - 1] - S[(j - 1) * (nx + 1) + i - 1];
  const at = (i, j) => S[clamp(j, 0, nz) * (nx + 1) + clamp(i, 0, nx)];
  // (the square's 9 x 9 cells: 360 m across, about the 160 m disc's area x 1.6)
  return (x, z) => {
    const i = Math.floor((x - x0) / C), j = Math.floor((z - z0) / C);
    const a = i - 4, b = j - 4, c = i + 5, d = j + 5;
    return (at(c, d) - at(a, d) - at(c, b) + at(a, b)) / 64;
  };
}
function corners(site, pad = 0) {
  return [[-site.w / 2 - pad, -VERGE + 2], [site.w / 2 + pad, -VERGE + 2], [site.w / 2 + pad, site.d + pad], [-site.w / 2 - pad, site.d + pad]].map(([u, v]) => toWorld(site, u, v));
}

const def0Places = (places, key) => { const A = places.aliases || {}; return Object.prototype.hasOwnProperty.call(A, key) ? A[key] : null; };
async function buildRanch(W, spec, idx, places, cm, net, scene) {
  const key = String(spec.at || '').replace(/^@/, '');
  const anchor = places.at('@' + key, { raw: true });
  if (!anchor) { console.warn('[storyrun] ranch: no place', key); return null; }
  const chk = townChecks(cm, net);
  const t0 = performance.now();
  // (inside a growing town's window too: its district bundle has nothing built outside it)
  const at0 = { x: anchor.cx ?? anchor.x, z: anchor.cz ?? anchor.z };
  let site = findRanchSite({ anchor: at0, ...chk });
  // (no open land anywhere in reach: a park, never a cemetery, a memorial, a school's or a church's)
  if (!site) { site = findRanchSite({ anchor: at0, ...chk, blocked: chk.blockedPark }); if (site) site.park = true; }
  if (!site) { console.warn('[storyrun] ranch: no open land near', key, `(${(performance.now() - t0).toFixed(0)} ms)`); return null; }
  site.layout = layoutRanch(site);
  console.info('[storyrun] ranch', key, `${site.w}x${site.d} m at ${site.x.toFixed(0)},${site.z.toFixed(0)}`, `${site.dist.toFixed(0)} m from its place`, `crowd ${site.crowd.toFixed(2)}${site.park ? ', on a park' : ''}`, `(${(performance.now() - t0).toFixed(0)} ms)`);
  const alias = def0Places(places, key);
  const R = { key, cityKey: alias && typeof alias['@'] === 'string' ? alias['@'] : key, spec, site, group: new THREE.Group(), colliders: [], holds: [], update: () => {}, marks: {}, name: anchor.name };
  R.group.name = 'storyrun-ranch-' + key;
  // the ranch's own frame: x along u, z along v (a heading of site.heading), its origin the plot's front middle
  R.group.position.set(site.x, 0, site.z);
  R.group.rotation.y = Math.atan2(site.vx, site.vz);
  // (three.js: a turn of h about y takes local +z to (sin h, cos h): v; and local +x to (cos h, -sin h); u must be that)
  const flipU = Math.abs(Math.cos(R.group.rotation.y) - site.ux) > 1e-3 || Math.abs(-Math.sin(R.group.rotation.y) - site.uz) > 1e-3;
  const lu = (u) => (flipU ? -u : u);
  const wp = (u, v) => toWorld(site, u, v);
  // (the ground a man stands on: a park's or a lot's slab over the bare terrain, as the town draws it; never the top of
  // anything standing there, the ranch's own fences included)
  const ground = (u, v) => { const p = wp(u, v), bare = chk.height(p.x, p.z); let y = bare; try { const g = cm.getGroundHeight(p.x, p.z, 'person'); if (Number.isFinite(g) && g >= bare - 0.05 && g <= bare + 0.5) y = g; } catch {} return y; };
  const L = site.layout;
  scene.add(R.group);
  // ---------------------------------------------------------------- materials
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });
  const M = {
    barn: std({ map: boards('#8E2A1E', { wear: 0.7 }) }),
    trim: std({ color: '#E9E3D6', roughness: 0.7 }),
    stable: std({ map: boards('#6A4A32', { batten: false, wear: 0.3 }) }),
    house: std({ map: siding('#E6DFCF'), roughness: 0.75 }),
    roofBarn: std({ map: ribs('#9AA0A4', 0.6), roughness: 0.42, metalness: 0.6 }),
    roofHouse: std({ map: ribs('#3E4349', 0.1), roughness: 0.5, metalness: 0.45 }),
    wood: std({ map: wood('#8A7A66') }),
    post: std({ map: wood('#6E5E4C') }),
    deck: std({ map: wood('#7E6A52') }),
    tpost: std({ color: '#3F5A3A', roughness: 0.55, metalness: 0.5 }),
    wire: std({ color: '#55585A', roughness: 0.4, metalness: 0.8 }),
    steel: std({ color: '#A8ADB0', roughness: 0.35, metalness: 0.85 }),
    pipe: std({ color: '#7D8285', roughness: 0.5, metalness: 0.7 }),
    hay: std({ map: straw(), roughness: 0.95 }),
    hayEnd: std({ map: strawEnd(), roughness: 0.95 }),
    stone: std({ color: '#7C7468', roughness: 0.95 }),
    brick: std({ color: '#7A3C2C', roughness: 0.9 }),
    glass: std({ map: windowTex(), roughness: 0.15, metalness: 0.2, emissive: new THREE.Color('#FFB868'), emissiveIntensity: 0 }),
    dark: std({ color: '#1A1612', roughness: 0.9 }),
    water: std({ color: '#2C3A3C', roughness: 0.06, metalness: 0.3 }),
    sign: std({ map: signTex(spec.sign || anchor.name || 'Ranch', spec.brand || (String(spec.sign || anchor.name || 'R').replace(/^the\s+/i, '').trim()[0] || 'R').toUpperCase()), roughness: 0.9 }),
    mail: std({ color: '#4C5054', roughness: 0.5, metalness: 0.6 }),
    shutter: std({ color: '#2F4236', roughness: 0.7 }),
  };
  M.lamp = new THREE.MeshBasicMaterial({ color: '#FFE2B0' });
  // (world-metre UVs over each surface's tile: boxGeo's tile)
  const T = (m) => m.map?.userData?.tile || 1;
  // ---------------------------------------------------------------- the parts, merged per material
  const bins = new Map();
  const put = (mat, g, shadow = true) => { const k = mat.uuid + (shadow ? 's' : 'n'); if (!bins.has(k)) bins.set(k, { mat, shadow, list: [] }); bins.get(k).list.push(g); };
  const solid = (u, v, hu, hv, top, ry = 0, fence = false, y0 = null) => {
    // a box in the plot's frame (half sizes along its own u and v, turned ry from the plot's), as the city's colliders are
    const p = wp(u, v), a = Math.atan2(site.ux, site.uz) + 0, cr = Math.cos(ry), sr = Math.sin(ry);
    // its along axis in the world: u turned by ry within the plot
    const ax = site.ux * cr + site.vx * sr, az = site.uz * cr + site.vz * sr;
    const ex = Math.abs(ax) * hu + Math.abs(az) * hv, ez = Math.abs(az) * hu + Math.abs(ax) * hv;
    const gy = y0 ?? ground(u, v);
    R.colliders.push({ minX: p.x - ex, maxX: p.x + ex, minZ: p.z - ez, maxZ: p.z + ez, minY: gy - 1, maxY: gy + top, wagmi: 'ranch', ...(fence ? { fence: true } : {}), obb: { cx: p.x, cz: p.z, hx: hu, hz: hv, cs: ax, sn: -az } });
    void a;
  };
  // a footprint's floor: its lowest ground (a foundation down to it), its highest (the floor just above it)
  const pad = (u, v, w, d) => { let lo = Infinity, hi = -Infinity; for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]]) { const y = ground(u + a * w / 2, v + b * d / 2); lo = Math.min(lo, y); hi = Math.max(hi, y); } return { lo, hi }; };
  // ---------------------------------------------------------------- fences
  const fenceRun = (from, to, style) => {
    const du = to[0] - from[0], dv = to[1] - from[1], len = Math.hypot(du, dv); if (len < 0.5) return;
    const gap = style === 'rail' ? 2.6 : 3.8, n = Math.max(1, Math.round(len / gap));
    const pts = [];
    for (let k = 0; k <= n; k++) { const u = from[0] + du * k / n, v = from[1] + dv * k / n; pts.push({ u, v, y: ground(u, v) }); }
    const at = (p, h) => new THREE.Vector3(lu(p.u), p.y + h, p.v);
    if (style === 'rail') {
      for (const p of pts) put(M.post, placed(boxGeo(0.16, 1.75, 0.16, T(M.post)), lu(p.u), p.y + 0.62, p.v));
      for (let k = 0; k < n; k++) for (const h of [0.42, 0.8, 1.18]) put(M.wood, beam(at(pts[k], h), at(pts[k + 1], h), 0.05, 0.15, T(M.wood)));
    } else {
      pts.forEach((p, k) => {
        const wooden = k === 0 || k === n || k % 5 === 0;
        if (wooden) put(M.post, placed(cylGeo(0.075, 0.085, 1.8, 8, T(M.post)), lu(p.u), p.y + 0.6, p.v));
        else put(M.tpost, placed(boxGeo(0.05, 1.6, 0.05), lu(p.u), p.y + 0.55, p.v, Math.atan2(du, dv)), true);
      });
      for (let k = 0; k < n; k++) for (const h of [0.45, 0.72, 0.98, 1.24]) put(M.wire, beam(at(pts[k], h), at(pts[k + 1], h - 0.03), 0.011, 0.011), false);
    }
    // its collider, a run at a time (a man hurdles it, a car stops at it)
    for (let k = 0; k < n; k++) {
      const a = pts[k], b = pts[k + 1], mu = (a.u + b.u) / 2, mv = (a.v + b.v) / 2, l = Math.hypot(b.u - a.u, b.v - a.v);
      solid(mu, mv, l / 2, 0.12, style === 'rail' ? 1.3 : 1.25, Math.atan2(b.v - a.v, b.u - a.u), true, Math.min(a.y, b.y));
    }
  };
  for (const it of L.items) if (it.kind === 'fence') fenceRun(it.from, it.to, it.style);
  // ---------------------------------------------------------------- the gate: log posts, the crossbeam, the sign
  const gateIt = L.items.find((i) => i.kind === 'gate');
  {
    const g = gateIt.half, gy = ground(0, 0);
    for (const s of [-1, 1]) {
      put(M.post, placed(cylGeo(0.17, 0.2, 6.6, 12, T(M.post)), lu(s * (g + 0.3)), gy + 2.6, 0));
      solid(s * (g + 0.3), 0, 0.22, 0.22, 6, 0, false, gy);
      // the pipe gates, swung open into the ranch
      const hx = s * (g - 0.1), open = -s * 1.75;
      const leaf = [];
      for (const h of [0.2, 0.55, 0.9, 1.25]) leaf.push(placed(cylGeo(0.03, 0.03, g - 0.2, 8), 0, h, 0, 0, 0, PI / 2));
      for (const t of [0.02, g - 0.25]) leaf.push(placed(cylGeo(0.035, 0.035, 1.2, 8), t * (s > 0 ? -1 : 1) * -1, 0.72, 0));
      const lg = mergeGeometries(leaf.map((x) => x.translate(s > 0 ? -(g - 0.2) / 2 : (g - 0.2) / 2, 0, 0)));
      put(M.pipe, placed(lg, lu(hx), gy, 0.05, open * (flipU ? -1 : 1)));
    }
    const beamY = gy + 5.6;
    put(M.post, placed(cylGeo(0.15, 0.15, 2 * g + 2.4, 12, T(M.post)), 0, beamY, 0, 0, 0, PI / 2));
    // the sign under it, hung on chains
    const sw = Math.min(2 * g + 0.6, 6.4), sh = sw / 4;
    // (the plank's own faces carry the lettering, front and back: a box's face UVs are the whole canvas)
    put(M.sign, placed(new THREE.BoxGeometry(sw, sh, 0.08), 0, beamY - 0.35 - sh / 2, 0), true);
    for (const s of [-1, 1]) put(M.steel, placed(boxGeo(0.02, 0.35, 0.02), lu(s * sw * 0.4), beamY - 0.175 - 0.02, 0), false);
  }
  // ---------------------------------------------------------------- dirt: the drive, the yard
  const dirtMat = (fade) => { const m = std({ map: dirt(), alphaMap: fadeTex(fade), transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); return m; };
  const drape = (g, mat, uvScale) => {
    // a flat piece in the plot's frame laid on the ground, a few cm over it; UVs in metres for the map, 0..1 for the fade
    const P = g.attributes.position, uv = g.attributes.uv, uv1 = new Float32Array(P.count * 2);
    for (let i = 0; i < P.count; i++) { const u = P.getX(i), v = P.getZ(i); P.setY(i, ground(lu(u), v) + (mat.userData.lift ?? 0.3)); uv1[i * 2] = u / uvScale; uv1[i * 2 + 1] = v / uvScale; }
    // (the fade reads uv, the dirt reads its own metres through the map's repeat: one UV set, the map repeated)
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; mesh.renderOrder = 1; R.group.add(mesh); return mesh;
  };
  // (the range under it all, inside the fences: a little past them, faded at its edges. Only over a park's lawn: on
  // open land the town's own ground is the range already, and a lighter patch over it reads as a decal)
  if (site.park) {
    const g = new THREE.PlaneGeometry(site.w + 6, site.d + 4, Math.round(site.w / 4), Math.round(site.d / 4)).rotateX(-PI / 2).translate(0, 0, site.d / 2);
    const m = std({ map: range(), alphaMap: fadeTex('plot'), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    m.map = m.map.clone(); m.map.repeat.set((site.w + 6) / 6, (site.d + 4) / 6); m.map.needsUpdate = true; m.userData.lift = 0.22;
    const mesh = drape(g, m, 6); mesh.renderOrder = 0;
  }
  for (const it of L.items) if (it.kind === 'dirt') {
    if (it.kind2 === 'yard') {
      const r = it.r, g = new THREE.PlaneGeometry(2 * r, 2 * r, 24, 24).rotateX(-PI / 2).translate(lu(it.u), 0, it.v);
      const m = dirtMat('radial'); m.map = m.map.clone(); m.map.repeat.set(2 * r / 4, 2 * r / 4); m.map.needsUpdate = true;
      drape(g, m, 4);
    } else {
      const [u0, v0] = it.from, [u1, v1] = it.to, len = Math.hypot(u1 - u0, v1 - v0), w = it.width;
      const g = new THREE.PlaneGeometry(w * 1.6, len, 4, Math.max(2, Math.round(len / 3))).rotateX(-PI / 2);
      g.rotateY(Math.atan2(lu(u1 - u0), v1 - v0)); g.translate(lu((u0 + u1) / 2), 0, (v0 + v1) / 2);
      const m = dirtMat('across'); m.map = m.map.clone(); m.map.repeat.set(w * 1.6 / 4, len / 4); m.map.needsUpdate = true;
      drape(g, m, 4);
    }
  }
  // ---------------------------------------------------------------- the mailbox
  { const it = L.items.find((i) => i.kind === 'mailbox'), y = ground(it.u, it.v);
    put(M.post, placed(boxGeo(0.1, 1.15, 0.1, T(M.post)), lu(it.u), y + 0.57, it.v));
    put(M.mail, placed(boxGeo(0.24, 0.24, 0.5), lu(it.u), y + 1.25, it.v));
    put(M.mail, placed(cylGeo(0.12, 0.12, 0.5, 12), lu(it.u), y + 1.37, it.v, 0, PI / 2, 0));
    put(M.barn, placed(boxGeo(0.03, 0.14, 0.04), lu(it.u) + 0.135, y + 1.4, it.v + 0.12), false);
    solid(it.u, it.v, 0.15, 0.3, 1.4); }
  // ---------------------------------------------------------------- the ranch's pickup, parked by the house (the city's own
  // lofted body, plain: no badge, no name)
  try {
    const NA = cityWorld.assets, spec = NA?.BODY_SPECS?.pickup, hs = L.items.find((i) => i.kind === 'house');
    if (spec && NA.buildCarGeometry && NA.createLoftedCarMaterial) {
      const pu = hs.u + hs.w / 2 + 4.2, pv = hs.v - 1.5, g = new THREE.Group();
      const m = new THREE.Mesh(NA.buildCarGeometry(spec, true), NA.createLoftedCarMaterial(spec, new THREE.Color('#6E2B22').getHex())); m.castShadow = true; m.receiveShadow = true; g.add(m);
      g.position.set(lu(pu), ground(pu, pv), pv); g.rotation.y = PI + 0.12; R.group.add(g);
      solid(pu, pv, 1.05, 2.8, 1.9, -0.12);
    }
  } catch (e) { console.warn('[storyrun] ranch pickup', e); }
  // ---------------------------------------------------------------- the farmhouse
  { const it = L.items.find((i) => i.kind === 'house'), { u, v, w, d, porch } = it, { lo, hi } = pad(u, v, w, d + 2 * porch);
    const f = hi + 0.55, x = lu(u), wallH = 5.6;
    put(M.stone, placed(boxGeo(w + 0.3, f - lo + 0.4, d + 0.3, 1), x, (f + lo - 0.4) / 2, v));
    put(M.house, placed(boxGeo(w, wallH, d, T(M.house)), x, f + wallH / 2, v));
    // the gable roof, its ridge along the front, a little overhang, its gable ends sided
    const pitch = 0.62, rise = (d / 2 + 0.5) * Math.tan(pitch), slab = (d / 2 + 0.6) / Math.cos(pitch);
    for (const s of [-1, 1]) put(M.roofHouse, placed(boxGeo(w + 0.9, 0.12, slab), x, f + wallH + rise / 2 + 0.04, v + s * (d / 4 + 0.15), 0, s * pitch, 0));
    const gable = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise - 0.15)]);
    for (const s of [-1, 1]) { const gg = new THREE.ShapeGeometry(gable); const uv = gg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2); put(M.house, placed(gg, x + s * w / 2, f + wallH, v, s * PI / 2)); }
    // the chimney, brick, through the back slope
    put(M.brick, placed(boxGeo(0.9, rise + 2.2, 0.7, 1), x + lu(w / 2 - 1.6), f + wallH + (rise + 2.2) / 2 - 0.4, v + d / 4));
    // windows and the door, front and sides, framed white
    const win = (wx, wy, wz, ry, ww = 1.05, wh = 1.45) => {
      const ox = Math.sin(ry) * 0.03, oz = Math.cos(ry) * 0.03; // (out of the wall, the way it faces)
      put(M.glass, placed(new THREE.PlaneGeometry(ww, wh), wx + ox * 0.3, wy, wz + oz * 0.3, ry), false);
      const fr = [placed(boxGeo(ww + 0.24, 0.12, 0.06), 0, wh / 2 + 0.06, 0), placed(boxGeo(ww + 0.3, 0.1, 0.12), 0, -wh / 2 - 0.05, 0.03), placed(boxGeo(0.12, wh, 0.06), ww / 2 + 0.06, 0, 0), placed(boxGeo(0.12, wh, 0.06), -ww / 2 - 0.06, 0, 0)];
      put(M.trim, placed(mergeGeometries(fr), wx + ox, wy, wz + oz, ry), false);
      // (shutters either side, the house's dark green)
      for (const e of [-1, 1]) put(M.shutter, placed(boxGeo(0.42, wh + 0.1, 0.04), wx + ox + Math.cos(ry) * e * (ww / 2 + 0.36), wy, wz + oz - Math.sin(ry) * e * (ww / 2 + 0.36), ry), false);
    };
    const front = v - d / 2 - 0.01;
    for (const k of [-4, -1.6, 1.6, 4]) { win(x + lu(k), f + 4.1, front, PI); if (Math.abs(k) > 2) win(x + lu(k), f + 1.5, front, PI); }
    put(M.dark, placed(boxGeo(1.1, 2.2, 0.06), x + lu(1.6) * 0 + lu(-1.6) * 0, f + 1.1, front - 0.01), false); // the front door
    put(M.trim, placed(boxGeo(1.32, 2.35, 0.05), x, f + 1.15, front + 0.01), false);
    for (const s of [-1, 1]) for (const k of [-2.2, 2.2]) { win(x + s * (w / 2 + 0.01), f + 1.5, v + k, s * PI / 2); win(x + s * (w / 2 + 0.01), f + 4.1, v + k, s * PI / 2); }
    for (const s of [-1, 1]) put(M.trim, placed(boxGeo(0.16, wallH, 0.16), x + s * w / 2, f + wallH / 2, front), false);
    // the porch: its deck, posts, rail, steps, roof, rockers and a lamp by the door
    const pz = v - d / 2 - porch / 2;
    put(M.deck, placed(boxGeo(w, 0.18, porch, T(M.deck)), x, f - 0.09, pz));
    put(M.stone, placed(boxGeo(w, f - lo, porch - 0.2, 1), x, (f + lo) / 2 - 0.1, pz + 0.05));
    const pr = 2.9;
    for (let k = 0; k <= 4; k++) { const px = x + lu(-w / 2 + 0.2 + k * (w - 0.4) / 4); put(M.trim, placed(boxGeo(0.16, pr, 0.16), px, f + pr / 2, v - d / 2 - porch + 0.2)); }
    put(M.roofHouse, placed(boxGeo(w + 0.5, 0.1, porch + 0.5), x, f + pr + 0.15, pz - 0.1, 0, -0.18, 0));
    for (const s of [-1, 1]) { put(M.trim, placed(boxGeo(w / 2 - 1.3, 0.08, 0.08), x + lu(s * (w / 4 + 0.65)), f + 0.9, v - d / 2 - porch + 0.2), false); for (let k = 0; k < 14; k++) put(M.trim, placed(boxGeo(0.04, 0.82, 0.04), x + lu(s * (1.4 + k * (w / 2 - 1.6) / 14)), f + 0.45, v - d / 2 - porch + 0.2), false); }
    for (let k = 0; k < 4; k++) put(M.deck, placed(boxGeo(2, 0.17, 0.32, T(M.deck)), x, f - 0.18 - k * ((f - lo) / 4), v - d / 2 - porch - 0.16 - k * 0.3));
    for (const k of [-3.6, 3.4]) { const rx = x + lu(k), rz = pz + 0.2, ry = (k < 0 ? 0.3 : -0.4) + PI; put(M.wood, placed(boxGeo(0.55, 0.06, 0.5, T(M.wood)), rx, f + 0.45, rz, ry)); put(M.wood, placed(boxGeo(0.55, 0.7, 0.06, T(M.wood)), rx - Math.sin(ry) * 0.25, f + 0.8, rz - Math.cos(ry) * 0.25, ry, -0.2, 0)); for (const s of [-1, 1]) put(M.wood, placed(new THREE.TorusGeometry(0.5, 0.025, 4, 16, 1.4).rotateY(PI / 2).rotateZ(-0.7), rx + Math.cos(ry) * s * 0.27, f + 0.42, rz - Math.sin(ry) * s * 0.27, ry), false); }
    put(M.lamp, placed(new THREE.SphereGeometry(0.09, 10, 8), x + lu(1.05), f + 2.2, front - 0.12), false);
    R.lamp = { u, v };
    solid(u, v - porch / 2, w / 2 + 0.2, d / 2 + porch / 2 + 0.1, f - lo + wallH + rise, 0, false, lo);
  }
  // ---------------------------------------------------------------- the barn: gambrel, the big doors, the hayloft, a cupola
  { const it = L.items.find((i) => i.kind === 'barn'), { u, v, w, d } = it, { lo, hi } = pad(u, v, w, d), f = hi + 0.12, x = lu(u);
    const wallH = 4.6, kneeU = w / 2 - 1.6, kneeY = wallH + 2.9, ridgeY = wallH + 4.7;
    const prof = [[-w / 2, 0], [w / 2, 0], [w / 2, wallH], [kneeU, kneeY], [0, ridgeY], [-kneeU, kneeY], [-w / 2, wallH]];
    const shape = new THREE.Shape(prof.map(([a, b]) => new THREE.Vector2(a, b)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
    { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2); }
    put(M.barn, placed(g, x, f, v - d / 2));
    put(M.stone, placed(boxGeo(w + 0.2, f - lo + 0.3, d + 0.2, 1), x, (f + lo - 0.3) / 2, v));
    // the roof: four slabs over the profile's four slopes, an overhang at the gables
    const segs = [[[w / 2, wallH], [kneeU, kneeY]], [[kneeU, kneeY], [0, ridgeY]], [[0, ridgeY], [-kneeU, kneeY]], [[-kneeU, kneeY], [-w / 2, wallH]]];
    for (const [[a0, b0], [a1, b1]] of segs) {
      const L2 = Math.hypot(a1 - a0, b1 - b0) + 0.45, ang = Math.atan2(b1 - b0, a1 - a0), nx = -Math.sin(ang), ny = Math.cos(ang);
      const g2 = boxGeo(L2, 0.1, d + 0.9, 1.5); g2.rotateZ(ang);
      put(M.roofBarn, placed(g2, x + (a0 + a1) / 2 + nx * 0.07, f + (b0 + b1) / 2 + ny * 0.07, v));
    }
    // white trim: the corners and the gables' eaves
    for (const s of [-1, 1]) for (const e of [-1, 1]) put(M.trim, placed(boxGeo(0.2, wallH, 0.2), x + lu(s * w / 2), f + wallH / 2, v + e * d / 2), false);
    const fz = v - d / 2 - 0.03;
    for (const [[a0, b0], [a1, b1]] of segs) { const len = Math.hypot(a1 - a0, b1 - b0); put(M.trim, placed(boxGeo(len + 0.2, 0.22, 0.1).rotateZ(Math.atan2(b1 - b0, a1 - a0)), x + (a0 + a1) / 2, f + (b0 + b1) / 2 - 0.05, fz - 0.03), false); }
    // the big doors (front), each a board panel with its white X and frame; the track over them; the hayloft door
    const dw = 4.6, dh = 4.0;
    for (const s of [-1, 1]) {
      const cx = x + lu(s * dw / 4);
      put(M.barn, placed(boxGeo(dw / 2 - 0.05, dh, 0.1, 2), cx, f + dh / 2, fz - 0.06));
      put(M.trim, placed(boxGeo(dw / 2, 0.16, 0.06), cx, f + dh - 0.08, fz - 0.13), false); put(M.trim, placed(boxGeo(dw / 2, 0.16, 0.06), cx, f + 0.08, fz - 0.13), false);
      for (const e of [-1, 1]) put(M.trim, placed(boxGeo(0.16, dh, 0.06), cx + lu(e * (dw / 4 - 0.08)), f + dh / 2, fz - 0.13), false);
      const diag = Math.hypot(dw / 2 - 0.3, dh - 0.3), ang = Math.atan2(dh - 0.3, dw / 2 - 0.3);
      for (const e of [-1, 1]) put(M.trim, placed(boxGeo(diag, 0.15, 0.05).rotateZ(e * ang), cx, f + dh / 2, fz - 0.14), false);
    }
    put(M.dark, placed(boxGeo(dw + 0.8, 0.12, 0.12), x, f + dh + 0.25, fz - 0.15), false);
    put(M.barn, placed(boxGeo(1.7, 1.8, 0.08, 2), x, f + wallH + 2.3, fz - 0.05));
    put(M.trim, placed(boxGeo(1.95, 2.05, 0.04), x, f + wallH + 2.3, fz - 0.01), false);
    put(M.dark, placed(boxGeo(0.2, 0.2, 0.9), x, f + ridgeY - 0.25, fz - 0.3), false); // the hay hood's beam
    // a cupola on the ridge, louvred, and a weathervane
    const cy = f + ridgeY;
    put(M.trim, placed(boxGeo(1.4, 1.2, 1.4), x, cy + 0.5, v)); for (let k = 0; k < 5; k++) for (const s of [-1, 1]) put(M.dark, placed(boxGeo(0.9, 0.06, 0.02), x, cy + 0.2 + k * 0.17, v + s * 0.71), false);
    put(M.roofBarn, placed(new THREE.ConeGeometry(1.15, 0.9, 4).rotateY(PI / 4), x, cy + 1.55, v));
    put(M.dark, placed(cylGeo(0.02, 0.02, 1.2, 6), x, cy + 2.4, v), false); put(M.dark, placed(boxGeo(0.7, 0.18, 0.02), x + 0.15, cy + 2.7, v), false);
    solid(u, v, w / 2 + 0.1, d / 2 + 0.1, f - lo + ridgeY, 0, false, lo);
  }
  // ---------------------------------------------------------------- the stable: low, its stalls under a deep overhang
  { const it = L.items.find((i) => i.kind === 'stable'), { u, v, w, d } = it, { lo, hi } = pad(u, v, w, d + 4), f = hi + 0.1, x = lu(u);
    const h0 = 3.0, h1 = 3.9, over = 2.4;
    put(M.stone, placed(boxGeo(w + 0.2, f - lo + 0.3, d + 0.2, 1), x, (f + lo - 0.3) / 2, v));
    put(M.stable, placed(boxGeo(w, h0, d, T(M.stable)), x, f + h0 / 2, v));
    // a shed roof sloping down to the front, out over the overhang; the back wall up to it
    put(M.stable, placed(boxGeo(w, h1 - h0, 0.2, T(M.stable)), x, f + h0 + (h1 - h0) / 2, v + d / 2 - 0.1));
    for (const s of [-1, 1]) { const sh = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(d / 2, h1 - h0)]); const gg = new THREE.ShapeGeometry(sh); put(M.stable, placed(gg, x + s * w / 2, f + h0, v, s * PI / 2)); }
    const rl = Math.hypot(d + over + 0.4, h1 - h0 + 0.5), ra = Math.atan2(h1 - h0 + 0.5, d + over);
    put(M.roofBarn, placed(boxGeo(w + 0.6, 0.1, rl, 1.5), x, f + (h0 + h1) / 2 - 0.05, v + d / 2 - (d + over) / 2, 0, -ra, 0));
    for (let k = 0; k <= 5; k++) put(M.post, placed(boxGeo(0.18, h0 - 0.2, 0.18, T(M.post)), x + lu(-w / 2 + 0.2 + k * (w - 0.4) / 5), f + (h0 - 0.2) / 2 - 0.25, v - d / 2 - over + 0.25));
    // the stalls' dutch doors, their tops open dark, a trim round each
    for (let k = 0; k < 5; k++) {
      const sx = x + lu(-w / 2 + (k + 0.5) * w / 5), fz = v - d / 2 - 0.02;
      put(M.stable, placed(boxGeo(1.3, 1.25, 0.08, T(M.stable)), sx, f + 0.63, fz - 0.04));
      put(M.dark, placed(new THREE.PlaneGeometry(1.3, 0.95).rotateY(PI), sx, f + 1.75, fz - 0.005), false);
      put(M.trim, placed(boxGeo(1.5, 0.12, 0.05), sx, f + 2.28, fz - 0.06), false); for (const e of [-1, 1]) put(M.trim, placed(boxGeo(0.1, 2.3, 0.05), sx + e * 0.7, f + 1.15, fz - 0.06), false);
      put(M.trim, placed(boxGeo(1.3, 0.08, 0.06), sx, f + 1.26, fz - 0.09), false);
    }
    solid(u, v, w / 2 + 0.1, d / 2 + 0.1, f - lo + h1, 0, false, lo);
    for (let k = 0; k <= 5; k++) solid(-w / 2 + 0.2 + k * (w - 0.4) / 5 + u, v - d / 2 - over + 0.25, 0.15, 0.15, 3, 0, false, lo);
  }
  // ---------------------------------------------------------------- the corral: a round pen of rails, open to the drive
  { const it = L.items.find((i) => i.kind === 'corral'), n = Math.round(2 * PI * it.r / 2.4), pts = [];
    for (let k = 0; k <= n; k++) { const a = k / n * 2 * PI, u = it.u + Math.cos(a) * it.r, v = it.v + Math.sin(a) * it.r; pts.push({ a, u, v, y: ground(u, v) }); }
    const inGap = (a) => { const d = Math.abs(Math.atan2(Math.sin(a - it.gapAt), Math.cos(a - it.gapAt))); return d < (it.gap / it.r) / 2; };
    for (let k = 0; k < n; k++) {
      const p = pts[k], q = pts[k + 1];
      if (!inGap(p.a) || k === 0) put(M.post, placed(boxGeo(0.18, 2.1, 0.18, T(M.post)), lu(p.u), p.y + 0.8, p.v));
      if (inGap((p.a + q.a) / 2)) continue;
      for (const h of [0.45, 0.85, 1.25, 1.65]) put(M.wood, beam(new THREE.Vector3(lu(p.u), p.y + h, p.v), new THREE.Vector3(lu(q.u), q.y + h, q.v), 0.06, 0.16, T(M.wood)));
      solid((p.u + q.u) / 2, (p.v + q.v) / 2, Math.hypot(q.u - p.u, q.v - p.v) / 2, 0.12, 1.75, Math.atan2(q.v - p.v, q.u - p.u), true, Math.min(p.y, q.y));
    }
  }
  // ---------------------------------------------------------------- troughs (a long galvanised one, a round stock tank)
  for (const it of L.items.filter((i) => i.kind === 'trough')) {
    const y = ground(it.u, it.v), x = lu(it.u), ry = flipU ? -it.ry : it.ry;
    if (it.round) {
      const r = it.len / 2;
      put(M.steel, placed(cylGeo(r, r, 0.62, 28, 1, true), x, y + 0.31, it.v), true);
      const rim = new THREE.TorusGeometry(r, 0.035, 6, 32).rotateX(PI / 2); put(M.steel, placed(rim, x, y + 0.62, it.v), false);
      put(M.water, placed(new THREE.CircleGeometry(r - 0.03, 28).rotateX(-PI / 2), x, y + 0.5, it.v), false);
      for (let k = 0; k < 6; k++) put(M.steel, placed(new THREE.TorusGeometry(r + 0.005, 0.012, 4, 32).rotateX(PI / 2), x, y + 0.08 + k * 0.1, it.v), false);
      solid(it.u, it.v, r, r, 0.65);
    } else {
      const parts = [placed(boxGeo(it.len, 0.05, 0.62), 0, 0.12, 0), placed(boxGeo(it.len, 0.5, 0.04), 0, 0.37, 0.3), placed(boxGeo(it.len, 0.5, 0.04), 0, 0.37, -0.3), placed(boxGeo(0.04, 0.5, 0.62), it.len / 2, 0.37, 0), placed(boxGeo(0.04, 0.5, 0.62), -it.len / 2, 0.37, 0)];
      put(M.steel, placed(mergeGeometries(parts), x, y, it.v, ry));
      put(M.water, placed(new THREE.PlaneGeometry(it.len - 0.06, 0.56).rotateX(-PI / 2), x, y + 0.5, it.v, ry), false);
      solid(it.u, it.v, it.len / 2, 0.32, 0.62, it.ry);
    }
  }
  // ---------------------------------------------------------------- the windmill (its wheel turns, in update)
  let wheel = null;
  { const it = L.items.find((i) => i.kind === 'windmill'), y = ground(it.u, it.v), x = lu(it.u), z = it.v, H = 10.5, b = 1.5, t = 0.32;
    const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const at = (s, e, h) => new THREE.Vector3(x + s * (b + (t - b) * h / H), y + h, z + e * (b + (t - b) * h / H));
    const parts = [];
    for (const [s, e] of legs) parts.push(beam(at(s, e, -0.3), at(s, e, H), 0.08, 0.08));
    for (const h of [0.2, 2.8, 5.3, 7.6, 9.6]) for (let k = 0; k < 4; k++) { const [s0, e0] = legs[k], [s1, e1] = legs[(k + 1) % 4]; parts.push(beam(at(s0, e0, h), at(s1, e1, h), 0.05, 0.05)); }
    for (const [h0, h1] of [[0.2, 2.8], [2.8, 5.3], [5.3, 7.6], [7.6, 9.6]]) for (let k = 0; k < 4; k++) { const [s0, e0] = legs[k], [s1, e1] = legs[(k + 1) % 4]; parts.push(beam(at(s0, e0, h0), at(s1, e1, h1), 0.03, 0.03), beam(at(s1, e1, h0), at(s0, e0, h1), 0.03, 0.03)); }
    parts.push(placed(boxGeo(1.1, 0.06, 1.1), x, y + H, z));
    parts.push(placed(cylGeo(0.025, 0.025, H, 6), x, y + H / 2, z));
    put(M.steel, mergeGeometries(parts));
    // the head: its gearbox, the tail vane out behind, the wheel of 18 sails in front (it faces the prevailing wind:
    // west, the plot turned as it is)
    const head = new THREE.Group(); head.position.set(x, y + H + 0.45, z); R.group.add(head);
    const hp = [placed(boxGeo(0.4, 0.4, 0.8), 0, 0, 0), placed(boxGeo(0.06, 0.06, 2.6), 0, 0, 1.6), placed(boxGeo(0.02, 1.1, 1.5), 0, 0.15, 3.0)];
    const hm = new THREE.Mesh(mergeGeometries(hp), M.steel); hm.castShadow = true; head.add(hm);
    const tailPaint = new THREE.Mesh(boxGeo(0.025, 0.9, 1.3), M.barn); tailPaint.position.set(0, 0.15, 3.0); head.add(tailPaint);
    wheel = new THREE.Group(); wheel.position.set(0, 0, -0.55); head.add(wheel);
    const wp2 = [new THREE.TorusGeometry(1.15, 0.025, 4, 36), new THREE.TorusGeometry(2.35, 0.03, 4, 48), placed(cylGeo(0.12, 0.12, 0.3, 10), 0, 0, 0, 0, PI / 2, 0)];
    for (let k = 0; k < 18; k++) { const a = k / 18 * 2 * PI; const sail = boxGeo(0.34, 1.35, 0.015); sail.rotateY(0.45); sail.translate(0, 1.72, 0); sail.rotateZ(a); wp2.push(sail); const arm = boxGeo(0.03, 2.3, 0.03); arm.translate(0, 1.15, 0); arm.rotateZ(a + PI / 18); wp2.push(arm); }
    const wm = new THREE.Mesh(mergeGeometries(wp2), M.steel); wm.castShadow = true; wheel.add(wm);
    head.rotation.y = -0.6;
    for (const [s, e] of legs) solid(it.u + (flipU ? -s : s) * b, it.v + e * b, 0.12, 0.12, 4);
  }
  // ---------------------------------------------------------------- hay: round bales, stacked by the barn, a few loose
  for (const it of L.items.filter((i) => i.kind === 'hay')) {
    const r = rng(hashStr(key + it.u)), bales = [];
    if (it.loose) for (let k = 0; k < it.n; k++) bales.push({ u: it.u + (k - 1) * 3.4 + r() * 0.8, v: it.v + r() * 2, h: 0, a: r() * PI });
    else { const rows = [4, 3, 2]; let n = 0; rows.forEach((c, h) => { for (let k = 0; k < c && n < it.n; k++, n++) bales.push({ u: it.u + (k - (c - 1) / 2) * 1.55, v: it.v + (h % 2) * 0.05, h, a: PI / 2 }); }); }
    for (const b of bales) {
      const y = ground(b.u, b.v) + 0.72 + b.h * 1.32, x = lu(b.u);
      put(M.hay, placed(cylGeo(0.75, 0.75, 1.25, 20, 1.5, true), x, y, b.v, b.a, 0, PI / 2));
      for (const s of [-1, 1]) { const cap = new THREE.CircleGeometry(0.75, 20); const uv = cap.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i)); put(M.hayEnd, placed(cap.rotateY(s * PI / 2).translate(s * 0.625, 0, 0), x, y, b.v, b.a)); }
    }
    if (!it.loose) solid(it.u, it.v, 3.3, 0.85, 3.6);
    else for (const b of bales) solid(b.u, b.v, 0.8, 0.8, 1.5, b.a);
  }
  // ---------------------------------------------------------------- the merged meshes
  for (const { mat, shadow, list } of bins.values()) {
    const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
    for (const g of geos) { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); if (!g.attributes.normal) g.computeVertexNormals(); }
    let g = null; try { g = mergeGeometries(geos, false); } catch (e) { console.warn('[storyrun] ranch merge', e); }
    if (!g) continue;
    const m = new THREE.Mesh(g, mat); m.castShadow = shadow; m.receiveShadow = true; R.group.add(m);
  }
  // ---------------------------------------------------------------- the library's clutter (Poly Haven scans, CC0)
  const props = L.items.find((i) => i.kind === 'props');
  for (const p of props ? props.list : []) {
    libModel(p.id).then((Lb) => {
      const G = new THREE.Group(); G.position.set(lu(p.u), ground(p.u, p.v), p.v); G.rotation.y = p.ry || 0; R.group.add(G);
      for (const subs of Object.values(Lb.parts)) for (const sub of subs) { const me = new THREE.Mesh(sub.geometry, sub.material); me.castShadow = true; me.receiveShadow = true; G.add(me); }
    }).catch(() => {});
    if (p.id !== 'shrub') solid(p.u, p.v, 0.4, 0.4, 0.9);
  }
  // ---------------------------------------------------------------- solid: the city's colliders (its walls, its fences)
  const Cc = cm.colliders;
  Cc.push(...R.colliders);
  cm._colliderCells = null; cm._lowCells = null;
  // ---------------------------------------------------------------- the town's traffic and walkers kept out of it
  // (the city's hold zones, boxes: the plot in cells, each box inside the fences, none reaching the road; every hold the
  // story sets after has them added, ranchHolds)
  for (let u = -site.w / 2 + 6; u < site.w / 2 - 5; u += 12) for (let v = 6; v < site.d - 5; v += 12) {
    const C = [[u, v], [u + 12, v], [u + 12, v + 12], [u, v + 12]].map(([a, b2]) => wp(Math.min(a, site.w / 2 - 2), Math.min(b2, site.d - 2)));
    R.holds.push({ minX: Math.min(...C.map((p) => p.x)), maxX: Math.max(...C.map((p) => p.x)), minZ: Math.min(...C.map((p) => p.z)), maxZ: Math.max(...C.map((p) => p.z)) });
  }
  // ---------------------------------------------------------------- the marks
  for (const name of RANCH_MARKS) { const m = markAt(site, name); if (m) R.marks[name] = m; }
  // ---------------------------------------------------------------- the animals
  const herds = [];
  const cat = L.items.find((i) => i.kind === 'cattle'), hor = L.items.find((i) => i.kind === 'horses');
  const nCattle = clamp(Math.round(spec.cattle ?? 12), 0, 16), nHorses = clamp(Math.round(spec.horses ?? 3), 0, 6);
  if (nCattle) herds.push(cattle(R, cat, nCattle, { ground, lu, key, camera: () => W.app.cameraSystem?.camera }).catch((e) => { console.warn('[storyrun] ranch cattle', e); return null; }));
  if (nHorses) herds.push(horses(R, hor, nHorses, { ground, lu, key }).catch((e) => { console.warn('[storyrun] ranch horses', e); return null; }));
  const live = (await Promise.all(herds)).filter(Boolean);
  // ---------------------------------------------------------------- every frame: the wheel, the herds, the porch light
  let spin = 0;
  // (night: the city's own interior glow, as nightlit.js reads it)
  const nightK = () => { try { const g = cityWorld.look?.cityUniforms?.uInteriorGlow?.value; return Number.isFinite(g) ? clamp((g - 0.6) / 0.8, 0, 1) : 0; } catch { return 0; } };
  R.update = (dt) => {
    spin += dt * (0.9 + 0.35 * Math.sin(performance.now() / 4100));
    if (wheel) wheel.rotation.z = -spin * 2.2;
    for (const h of live) h.update(dt);
    const nk = nightK(); M.glass.emissiveIntensity = nk * 0.9; M.lamp.color.setRGB(0.61 + 0.39 * nk, 0.58 + 0.27 * nk, 0.52 + 0.11 * nk);
  };
  R.dispose = () => { scene.remove(R.group); for (let i = Cc.length - 1; i >= 0; i--) if (Cc[i].wagmi === 'ranch') Cc.splice(i, 1); cm._colliderCells = null; cm._lowCells = null; };
  R.herds = live;
  return R;
}

/* ------------------------------------------------------------------ the cattle: one instanced herd, grazing in place */
// The cow is a still scan (no skeleton): its head is brought down to the grass and up again in the vertex shader, only
// its neck and head bent (ranch-plan.js cowGrazeBend, the reference this mirrors; tests/storyrun-ranch.test.mjs). The
// bend and its weight are worked on the geometry's own position (positionGeometry: the cow's own space, its neck pivot
// at the same place in every cow), never on positionLocal, which by then already holds the instance matrix (the cow's
// place in the herd, 80-90 m out in the ranch's space: a bend about the neck pivot there swung the whole cow about the
// ranch's corner and under the ground, Colter Land's re-review, 16 Nov). The bend's offset is then turned by the cow's
// own yaw and scale (the instanced cowYS: scale, cos yaw, sin yaw) and added to positionLocal, so the instance
// transform still puts the cow where it stands. It never walks: with no legs to step with, a cow moved over the grass
// slides, so each one stays where it stands, grazing and looking up. On a phone or a low tier the herd is a third
// smaller and goes past 150 m.
async function cattle(R, it, n0, { ground, lu, key, camera }) {
  const low = lowTier(), n = low ? Math.max(1, Math.round(n0 * 0.65)) : n0;
  const gl = await loadGLB(new URL('../../assets/props/cow.glb', import.meta.url).href);
  const parts = []; gl.scene.traverse((o) => { if (o.isMesh) parts.push(o); });
  if (!parts.length) return null;
  const graze = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
  const ys = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  const N = COW_NECK, meshes = [];
  for (const p of parts) {
    const g = p.geometry.clone(); g.setAttribute('graze', graze); g.setAttribute('cowYS', ys);
    const mat = p.material.clone();
    mat.positionNode = Fn(() => {
      const P = positionGeometry;
      const w = smoothstep(float(N.z0), float(N.z1), P.z).mul(attribute('graze', 'float'));
      const a = w.mul(N.ang), c = cos(a), s = sin(a);
      const dy = P.y.sub(N.pivotY), dz = P.z.sub(N.pivotZ);
      // (the bend's offset in the cow's own space: y and z only, the turn being about the cow's own x)
      const oy = dy.mul(c).sub(dz.mul(s)).add(N.pivotY).sub(w.mul(N.drop)).sub(P.y);
      const oz = dy.mul(s).add(dz.mul(c)).add(N.pivotZ).add(w.mul(N.reach)).sub(P.z);
      const k = attribute('cowYS', 'vec3');
      // (turned by the cow's yaw about y and scaled with it: x' = sin*oz, z' = cos*oz)
      return positionLocal.add(vec3(k.z.mul(oz), oy, k.y.mul(oz)).mul(k.x));
    })();
    mat.normalNode = undefined;
    const m = new THREE.InstancedMesh(g, mat, n); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; R.group.add(m); meshes.push(m);
  }
  const r = rng(hashStr(key + 'cattle'));
  // (a herd of red-and-white faces and darker ones, a little apart, facing every which way)
  const cows = [];
  for (let i = 0; i < n; i++) {
    let u = 0, v = 0, ok = false;
    for (let k = 0; k < 30 && !ok; k++) { u = it.u0 + r() * (it.u1 - it.u0); v = it.v0 + r() * (it.v1 - it.v0); ok = cows.every((c) => Math.hypot(c.u - u, c.v - v) > 3.2); }
    const dark = r() < 0.35, s = 0.94 + r() * 0.12;
    cows.push({ u, v, yaw: r() * 2 * PI, s, g: r() < 0.7 ? 0.9 : 0, goal: null, t: r() * 8, next: 4 + r() * 10, tint: dark ? new THREE.Color('#5E4232') : new THREE.Color(0.95 + r() * 0.05, 0.92 + r() * 0.06, 0.88 + r() * 0.08) });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const write = () => {
    cows.forEach((c, i) => {
      const yaw = lu(1) > 0 ? c.yaw : -c.yaw;
      pos.set(lu(c.u), ground(c.u, c.v) - 0.03, c.v); q.setFromAxisAngle(up, yaw); sc.setScalar(c.s); m4.compose(pos, q, sc);
      ys.setXYZ(i, c.s, Math.cos(yaw), Math.sin(yaw));
      for (const m of meshes) { m.setMatrixAt(i, m4); m.setColorAt(i, c.tint); }
      graze.setX(i, c.gg ?? c.g);
    });
    for (const m of meshes) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    graze.needsUpdate = true; ys.needsUpdate = true;
  };
  write();
  let acc = 0;
  return {
    animals: cows,
    update(dt) {
      acc += dt; if (acc < 1 / 30) return; const d = acc; acc = 0;
      for (const c of cows) {
        c.t += d;
        // grazing (head down, cropping), looking up a while, now and then a few steps and a slow turn
        if (c.t > c.next) {
          c.t = 0; c.next = 5 + Math.random() * 12;
          // (head down to crop, or up a while to look about; half-way now and then)
          const k = Math.random();
          c.g = k < 0.55 ? 0.95 : k < 0.8 ? 0 : 0.45;
        }
        // (its head eased, a little nod while cropping)
        const target = c.g + (c.g > 0.5 ? 0.06 * Math.sin(performance.now() / 380 + c.s * 40) : 0);
        c.gg = (c.gg ?? target) + (target - (c.gg ?? target)) * (1 - Math.exp(-1.6 * d));
      }
      write();
      // (a low tier's herd out of sight past 150 m: the scan is 6k triangles a cow)
      if (low) { const cam = camera?.(); if (cam) { R.group.getWorldPosition(_cw); const far = cam.position.distanceTo(_cw) > 150 + Math.hypot(it.u1 - it.u0, it.v1) / 2; for (const m of meshes) m.visible = !far; } }
    },
  };
}
const _cw = new THREE.Vector3();

/* ------------------------------------------------------------------ the horses: the library's, in the corral */
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _ax = new THREE.Vector3(), _r = new THREE.Vector3();
function bend(bone, axis, angle) {
  if (!bone || !bone.parent || Math.abs(angle) < 1e-5) return;
  bone.parent.getWorldQuaternion(_pq); _ax.copy(axis).applyQuaternion(_pq.invert()); bone.quaternion.premultiply(_q.setFromAxisAngle(_ax, angle));
}
async function horses(R, it, n, { ground, lu, key }) {
  const kit = await loadCreature('creature-horse', { low: lowTier() });
  const P = PROFILES['creature-horse'] || {};
  const r = rng(hashStr(key + 'horses')), out = [];
  const COATS = ['#FFFFFF', '#C9B8A8', '#8A7E74', '#E6DCD0'];
  for (let i = 0; i < n; i++) {
    const made = kit.make({ height: (kit.json.height || 1.7) * (0.94 + r() * 0.08), name: 'Horse' });
    const a = r() * 2 * PI, d = Math.sqrt(r()) * it.r * 0.7;
    const h = { made, u: it.u + Math.cos(a) * d, v: it.v + Math.sin(a) * d, yaw: r() * 2 * PI, spd: 0, want: 0, graze: r() < 0.6 ? 1 : 0, state: 'graze', t: r() * 6, next: 4 + r() * 8, goal: null, bones: {} };
    for (const b of made.skeleton.bones) h.bones[b.name] = b;
    // (coats a little apart: the one skin, tinted)
    try { const m = made.mesh.material.clone(); m.color = new THREE.Color(COATS[i % COATS.length]); made.mesh.material = m; } catch {}
    R.group.add(made.object); out.push(h);
  }
  const place = (h) => { h.made.object.position.set(lu(h.u), ground(h.u, h.v), h.v); h.made.object.rotation.y = lu(1) > 0 ? h.yaw : -h.yaw; };
  out.forEach(place);
  return {
    animals: out,
    update(dt) {
      for (const h of out) {
        h.t += dt;
        if (h.state === 'graze' && h.t > h.next) {
          h.state = 'walk'; h.t = 0; const a = r() * 2 * PI, d = Math.sqrt(r()) * it.r * 0.75;
          h.goal = { u: it.u + Math.cos(a) * d, v: it.v + Math.sin(a) * d };
        }
        if (h.state === 'walk' && h.goal) {
          const du = h.goal.u - h.u, dv = h.goal.v - h.v, L2 = Math.hypot(du, dv), want = Math.atan2(du, dv), dy = Math.atan2(Math.sin(want - h.yaw), Math.cos(want - h.yaw));
          h.yaw += clamp(dy * (1 - Math.exp(-3 * dt)), -1.4 * dt, 1.4 * dt);
          h.want = L2 > 0.5 && Math.abs(dy) < 1.2 ? 1.1 : 0;
          if (L2 < 0.5 || h.t > 12) { h.state = 'graze'; h.t = 0; h.next = 5 + r() * 10; h.goal = null; h.want = 0; h.graze = r() < 0.75 ? 1 : 0; }
        }
        h.spd += (h.want - h.spd) * (1 - Math.exp(-2.5 * dt));
        if (h.spd > 0.02) { h.u += Math.sin(h.yaw) * h.spd * dt; h.v += Math.cos(h.yaw) * h.spd * dt; }
        // (kept inside the rails, off each other)
        const cu = h.u - it.u, cv = h.v - it.v, cd = Math.hypot(cu, cv), lim = it.r - 0.4;
        if (cd > lim) { h.u = it.u + cu / cd * lim; h.v = it.v + cv / cd * lim; }
        for (const o of out) if (o !== h) { const du = h.u - o.u, dv = h.v - o.v, dd = Math.hypot(du, dv); if (dd < 2.4 && dd > 1e-3) { h.u += du / dd * (2.4 - dd) * 0.5; h.v += dv / dd * (2.4 - dd) * 0.5; } }
        place(h);
        const gz = h.state === 'graze' ? h.graze : 0;
        h.gw = (h.gw ?? gz) + (gz - (h.gw ?? gz)) * (1 - Math.exp(-1.5 * dt));
        h.made.animate(performance.now() / 1000, dt, { speed: h.spd });
        if (h.gw > 0.01 && P.graze) {
          h.made.object.updateMatrixWorld(true);
          const y = h.made.object.rotation.y, right = _r.set(Math.cos(y), 0, -Math.sin(y));
          const nod = 1 + 0.05 * Math.sin(performance.now() / 700 + h.u);
          for (const [name, ang] of P.graze) bend(h.bones[name], right, ang * h.gw * nod);
        }
      }
    },
  };
}
