// Mog City story runner: the set kit. The rooms and closed exteriors a world's cutscenes are staged in (sets.js), built
// the way Mr. Big's study is built (wagmi/mission/mrbig.js): a little scene of its own, out of boxes, rounded boxes and
// cylinders, its surfaces drawn into canvases here (plank floors, carpet, terrazzo tiles, brick, concrete, marble),
// a painted view through its windows (the city by day, at golden hour or at night), lit by its own lights.
//   const K = kit(scene, { night, golden });  K.box(...)  K.mat.wood ...  K.window(...)  K.room(...)
//   ROOMS[name](K) -> { size: [w, d, h], marks: { name: [x, z, deg] }, sun, ceiling }   (sets.js stages people in them)
// Coordinates: metres, the floor at y 0, the room's middle at x 0 z 0, its back wall (usually the windows) at -z, the
// front wall (behind a camera looking in) at +z. Nothing here is a real place, brand or person.
// (6 Nov, the art pass: the owner's bar is Mr. Big's study) The kit also dresses with real scans: CC0 models and
// surfaces from GameMog's licensed library (Poly Haven), copied into assets/sets (CREDITS.md) and read here in the
// library's own format (gmasset/1: a deflated buffer of positions, normals, uvs and indices, its maps beside it):
// K.prop('bar-stool', x, y, z, { ry, s }), K.scan('plaster', { tint }) a scanned surface laid in metres (world UVs, so a
// wall cut round its windows keeps one texture across its strips). The city through a window is in layers at their
// own depths (the sky, the far towers in haze, the near ones, the building across the street), so it moves against
// the frame as the lens does, and bright enough to bloom; outdoors the square has real blocks round it, a ring of
// towers beyond and a sky. K.ready() waits for every scan the set asked for (sets.js, before its first frame).
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PI = Math.PI;

/* ------------------------------------------------------------- library -- */
// (each scan is fetched and built once a session and shared by every set: its meshes are kept, userData.keep, when a
// set lets go)
const LIBURL = new URL('../../assets/sets/', import.meta.url).href;
const LIB = new Map(), IMG = new Map(), LTEX = new Map();
const inflate = (buf) => new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
function libImage(path) {
  if (!IMG.has(path)) IMG.set(path, fetch(LIBURL + path).then((r) => { if (!r.ok) throw new Error('set library: ' + path); return r.blob(); }).then((b) => createImageBitmap(b)));
  return IMG.get(path);
}
function libTex(path, srgb) {
  const k = path + (srgb ? '|s' : '|l');
  if (!LTEX.has(k)) LTEX.set(k, libImage(path).then((bm) => {
    const t = new THREE.Texture(bm); t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.needsUpdate = true; t.userData.keep = true; return t;
  }));
  return LTEX.get(k);
}
const TYPES = { Float32Array, Int8Array, Uint16Array, Uint32Array };
export function libModel(id) {
  if (LIB.has(id)) return LIB.get(id);
  const p = (async () => {
    const J = await (await fetch(LIBURL + id + '/asset.json')).json();
    const buf = await inflate(await (await fetch(LIBURL + id + '/' + (J.file || 'model.bin.z'))).arrayBuffer());
    const view = (key) => { const L = J.layout[key]; return new TYPES[L.type](buf, L.offset, L.length); };
    const mats = await Promise.all(J.materials.map(async (m) => {
      const [map, nor, arm, alpha] = await Promise.all([m.map && libTex(`${id}/${m.map}`, true), m.normalMap && libTex(`${id}/${m.normalMap}`, false), m.armMap && libTex(`${id}/${m.armMap}`, false), m.alphaMap && libTex(`${id}/${m.alphaMap}`, false)]);
      const c = m.color || [1, 1, 1, 1];
      const mat = new THREE.MeshStandardMaterial({ name: m.name, color: new THREE.Color(c[0], c[1], c[2]), map: map || null, normalMap: nor || null, aoMap: arm || null, roughnessMap: arm || null, metalnessMap: arm || null,
        roughness: m.roughness ?? 1, metalness: m.metalness ?? 1, side: m.doubleSided ? THREE.DoubleSide : THREE.FrontSide });
      if (alpha) { mat.alphaMap = alpha; mat.alphaTest = m.alpha?.test || 0.45; }
      else if (m.alpha?.blend) { mat.transparent = true; mat.opacity = Math.min(c[3] ?? 0.4, 0.45); mat.depthWrite = false; mat.roughness = 0.05; }
      return mat;
    }));
    const parts = {};
    for (const [name, P] of Object.entries(J.parts)) parts[name] = P.subs.map((sub) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(view(sub.key + ':pos'), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(view(sub.key + ':nor'), 3, true));
      g.setAttribute('uv', new THREE.BufferAttribute(view(sub.key + ':uv'), 2));
      g.setIndex(new THREE.BufferAttribute(view(sub.key + ':idx'), 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      return { geometry: g, material: mats[sub.material] };
    });
    return { J, parts, mats };
  })();
  p.catch((e) => console.warn('[storyrun] set library', id, e.message));
  LIB.set(id, p); return p;
}
// a scanned surface's tile (metres one copy of its maps covers: the library's own sizes)
const SCAN = { plaster: 2, planks: 2, brick: 2, concrete: 2, cobblestone: 2, 'corrugated-metal': 2, 'asphalt-clean': 2.1, grass: 2, 'stone-wall': 1.5 };
// world UVs: a plane's (w x h) and a box's faces in metres over a tile ([u, v] or one size), offset along a wall
function uvPlane(g, w, h, tile, ox = 0, oy = 0) {
  const [tu, tv] = Array.isArray(tile) ? tile : [tile, tile], uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w + ox) / tu, (uv.getY(i) * h + oy) / tv);
  uv.needsUpdate = true; return g;
}
function uvBox(g, w, h, d, tile) {
  const [tu, tv] = Array.isArray(tile) ? tile : [tile, tile], uv = g.attributes.uv;
  // (BoxGeometry's faces in order: +x, -x (d by h), +y, -y (w by d), +z, -z (w by h), four corners each)
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, (uv.getX(i) * dims[f][0]) / tu, (uv.getY(i) * dims[f][1]) / tv); }
  uv.needsUpdate = true; return g;
}
// soft gradients: a contact shadow along a corner (dark at v 0), a blob under a thing
let GRAD = null, BLOBT = null;
function gradTex() {
  if (GRAD) return GRAD; const c = document.createElement('canvas'); c.width = 4; c.height = 128; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 128, 0, 0); g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.25, '#7A7A7A'); g.addColorStop(0.6, '#1E1E1E'); g.addColorStop(1, '#000000');
  x.fillStyle = g; x.fillRect(0, 0, 4, 128); GRAD = new THREE.CanvasTexture(c); GRAD.userData.keep = true; return GRAD;
}
function blobAlpha() {
  if (BLOBT) return BLOBT; const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 6, 64, 64, 63); g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.45, '#9A9A9A'); g.addColorStop(1, '#000000');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); BLOBT = new THREE.CanvasTexture(c); BLOBT.userData.keep = true; return BLOBT;
}
// (a seeded random: a set is drawn the same every time)
function rng(seed = 1) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, rep = [1, 1], srgb = true) {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); };
function noise(x, n, a, r) { const d = x.getImageData(0, 0, x.canvas.width, x.canvas.height), D = d.data; for (let i = 0; i < D.length; i += 4) { const v = (r() - 0.5) * a; D[i] += v; D[i + 1] += v; D[i + 2] += v; } x.putImageData(d, 0, 0); }

/* ------------------------------------------------------------ surfaces -- */
export const SURF = {
  // planks: oak or walnut, staggered joints, the grain drawn in each
  planks(base = '#8A5E3B', seed = 3) {
    const [c, x] = canvas(1024, 1024), r = rng(seed), pw = 1024 / 8;
    for (let i = 0; i < 8; i++) {
      let y = -r() * 400;
      while (y < 1024) {
        const len = 260 + r() * 380, k = 0.82 + r() * 0.3;
        x.fillStyle = shade(base, k); x.fillRect(i * pw, y, pw, len);
        for (let g = 0; g < 14; g++) { x.strokeStyle = `rgba(40,22,10,${0.05 + r() * 0.1})`; x.lineWidth = 1 + r() * 2; x.beginPath(); const gx = i * pw + r() * pw; x.moveTo(gx, y); x.bezierCurveTo(gx + (r() - 0.5) * 20, y + len / 3, gx + (r() - 0.5) * 20, y + len * 0.66, gx + (r() - 0.5) * 12, y + len); x.stroke(); }
        x.fillStyle = 'rgba(25,14,6,0.55)'; x.fillRect(i * pw, y, pw, 3);
        y += len;
      }
      x.fillStyle = 'rgba(25,14,6,0.5)'; x.fillRect(i * pw, 0, 2, 1024);
    }
    noise(x, 0, 10, r); return c;
  },
  carpet(base = '#4A5566', seed = 5) { const [c, x] = canvas(512, 512), r = rng(seed); x.fillStyle = base; x.fillRect(0, 0, 512, 512); noise(x, 0, 26, r); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(255,255,255,${r() * 0.04})`; x.fillRect(r() * 512, r() * 512, 2, 2); } return c; },
  // vinyl tiles (a school's): mostly one colour, a coloured one here and there
  tiles(a = '#D9D4C7', b = '#8FA7B8', n = 8, seed = 7, accent = 0.18) {
    const [c, x] = canvas(1024, 1024), r = rng(seed), s = 1024 / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = shade(r() < accent ? b : a, 0.94 + r() * 0.1); x.fillRect(i * s, j * s, s, s); x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(i * s, j * s, s, 2); x.fillRect(i * s, j * s, 2, s); }
    noise(x, 0, 12, r); return c;
  },
  checker(a = '#EDE6D6', b = '#9B2B2B', n = 8, seed = 9) { const [c, x] = canvas(1024, 1024), r = rng(seed), s = 1024 / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = shade((i + j) % 2 ? b : a, 0.95 + r() * 0.08); x.fillRect(i * s, j * s, s, s); } noise(x, 0, 10, r); return c; },
  concrete(base = '#8C8A85', seed = 11) { const [c, x] = canvas(1024, 1024), r = rng(seed); x.fillStyle = base; x.fillRect(0, 0, 1024, 1024); for (let i = 0; i < 140; i++) { x.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "255,255,255"},${0.008 + r() * 0.02})`; x.beginPath(); x.arc(r() * 1024, r() * 1024, 40 + r() * 160, 0, 2 * PI); x.fill(); } for (let i = 0; i < 18; i++) { x.strokeStyle = 'rgba(0,0,0,0.12)'; x.lineWidth = 1; x.beginPath(); let px = r() * 1024, py = r() * 1024; x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (r() - 0.5) * 120; py += (r() - 0.5) * 120; x.lineTo(px, py); } x.stroke(); } noise(x, 0, 18, r); return c; },
  // paving slabs (a plaza's, a pavement's): grey squares, the joints darker
  paving(base = '#A9A49A', n = 4, seed = 13) { const [c, x] = canvas(1024, 1024), r = rng(seed), s = 1024 / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = shade(base, 0.9 + r() * 0.16); x.fillRect(i * s, j * s, s, s); x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(i * s, j * s, s, 4); x.fillRect(i * s, j * s, 4, s); } noise(x, 0, 22, r); return c; },
  brick(base = '#7A3B2A', seed = 17) { const [c, x] = canvas(1024, 1024), r = rng(seed), bh = 1024 / 16, bw = 1024 / 4; x.fillStyle = '#8F877C'; x.fillRect(0, 0, 1024, 1024); for (let j = 0; j < 16; j++) for (let i = -1; i < 5; i++) { x.fillStyle = shade(base, 0.75 + r() * 0.4); x.fillRect(i * bw + (j % 2) * bw / 2 + 4, j * bh + 4, bw - 8, bh - 8); } noise(x, 0, 26, r); return c; },
  marble(base = '#E9E5DD', vein = '#9C968C', seed = 19) { const [c, x] = canvas(1024, 1024), r = rng(seed); x.fillStyle = base; x.fillRect(0, 0, 1024, 1024); for (let i = 0; i < 26; i++) { x.strokeStyle = vein; x.globalAlpha = 0.08 + r() * 0.2; x.lineWidth = 1 + r() * 3; x.beginPath(); let px = r() * 1024, py = r() * 1024; x.moveTo(px, py); for (let k = 0; k < 12; k++) { px += (r() - 0.3) * 90; py += (r() - 0.5) * 90; x.lineTo(px, py); } x.stroke(); } x.globalAlpha = 1; x.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i <= 2; i++) { x.fillRect(0, i * 512, 1024, 2); x.fillRect(i * 512, 0, 2, 1024); } return c; },
  // a wall's paint: the colour with the faintest roller texture
  paint(base = '#D8D2C4', seed = 23) { const [c, x] = canvas(256, 256), r = rng(seed); x.fillStyle = base; x.fillRect(0, 0, 256, 256); noise(x, 0, 6, r); return c; },
  // wallpaper: a quiet stripe or a small flower (an old lady's living room)
  paper(base = '#E3D6BC', ink = '#A98F6A', seed = 29, flowers = true) {
    const [c, x] = canvas(512, 512), r = rng(seed); x.fillStyle = base; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 8; i++) { x.fillStyle = `rgba(0,0,0,0.035)`; x.fillRect(i * 64, 0, 22, 512); }
    if (flowers) for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { const px = i * 64 + 32 + (j % 2) * 32, py = j * 64 + 32; x.fillStyle = ink; x.globalAlpha = 0.45; for (let p = 0; p < 5; p++) { x.beginPath(); x.ellipse(px + Math.cos(p * 1.256) * 5, py + Math.sin(p * 1.256) * 5, 4, 2.5, p * 1.256, 0, 2 * PI); x.fill(); } x.globalAlpha = 1; }
    noise(x, 0, 6, r); return c;
  },
};

/* ------------------------------------------------------- painted views -- */
// the city through a window: the sky (day, golden or night), the far towers as flat shapes with their windows, a nearer
// row, an old building across the street; drawn once into a canvas (as Mr. Big's skyline)
export function view({ night = false, golden = false, seed = 31, near = '#B9AFA0', far = '#9DA9B8', street = true, w = 2048, h = 1024 } = {}) {
  const [c, x] = canvas(w, h), r = rng(seed);
  const sky = x.createLinearGradient(0, 0, 0, h);
  if (night) { sky.addColorStop(0, '#05070F'); sky.addColorStop(0.6, '#121A33'); sky.addColorStop(1, '#2A2440'); }
  else if (golden) { sky.addColorStop(0, '#6E9BD1'); sky.addColorStop(0.55, '#E9C79A'); sky.addColorStop(1, '#F4D7AE'); }
  else { sky.addColorStop(0, '#5E95D6'); sky.addColorStop(0.6, '#A9CBEF'); sky.addColorStop(1, '#DCE9F5'); }
  x.fillStyle = sky; x.fillRect(0, 0, w, h);
  if (!night) for (let i = 0; i < 7; i++) { x.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.25})`; const cx = r() * w, cy = h * (0.08 + r() * 0.25); for (let k = 0; k < 6; k++) { x.beginPath(); x.ellipse(cx + (r() - 0.5) * 160, cy + (r() - 0.5) * 30, 60 + r() * 90, 18 + r() * 20, 0, 0, 2 * PI); x.fill(); } }
  const tower = (x0, wd, top, col, lit) => {
    x.fillStyle = col; x.fillRect(x0, top, wd, h - top);
    if (r() < 0.4) { x.fillRect(x0 + wd * 0.2, top - 30 - r() * 40, wd * 0.6, 40); }
    const cw = 9 + r() * 6, ch = 13 + r() * 5;
    for (let yy = top + 8; yy < h; yy += ch + 6) for (let xx = x0 + 5; xx < x0 + wd - cw; xx += cw + 5) {
      if (night) { if (r() < lit) { x.fillStyle = r() < 0.7 ? '#FFD58A' : '#CFE3FF'; x.globalAlpha = 0.55 + r() * 0.45; x.fillRect(xx, yy, cw, ch); x.globalAlpha = 1; } }
      else { x.fillStyle = r() < 0.5 ? 'rgba(40,60,90,0.45)' : 'rgba(210,225,240,0.35)'; x.fillRect(xx, yy, cw, ch); }
    }
  };
  for (let x0 = -20; x0 < w; x0 += 70 + r() * 120) tower(x0, 60 + r() * 140, h * (0.12 + r() * 0.3), night ? '#10141F' : shade(far, 0.85 + r() * 0.25), 0.35);
  for (let x0 = -40; x0 < w; x0 += 160 + r() * 200) tower(x0, 150 + r() * 220, h * (0.32 + r() * 0.25), night ? '#0A0C14' : shade(near, 0.8 + r() * 0.3), 0.5);
  if (street) { x.fillStyle = night ? '#07080C' : '#6E6A64'; x.fillRect(0, h * 0.92, w, h * 0.08); }
  if (golden) { const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(255,190,120,0.25)'); g.addColorStop(1, 'rgba(255,190,120,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }
  return c;
}
// a sign's lettering on a board (the shop's own, menus, EXIT)
export function lettering(lines, { w = 1024, h = 256, bg = '#1B1B1B', fg = '#F2E6C9', font = '700 120px Georgia, serif', align = 'center', border = null } = {}) {
  const [c, x] = canvas(w, h); x.fillStyle = bg; x.fillRect(0, 0, w, h);
  if (border) { x.strokeStyle = border; x.lineWidth = 10; x.strokeRect(12, 12, w - 24, h - 24); }
  const L = [].concat(lines); x.fillStyle = fg; x.textAlign = align; x.textBaseline = 'middle';
  L.forEach((s, i) => { const f = typeof s === 'object' ? s : { t: s }; x.font = f.font || font; x.fillStyle = f.fg || fg; x.fillText(f.t, align === 'center' ? w / 2 : 40, (h * (i + 0.5)) / L.length); });
  return c;
}
// a child's drawing in crayon: the sun, a house, a family of stick people, a dinosaur now and then
export function drawing(seed) {
  const [c, x] = canvas(256, 200), r = rng(seed); x.fillStyle = '#FBFAF4'; x.fillRect(0, 0, 256, 200);
  const crayon = () => ['#E53935', '#1E88E5', '#43A047', '#FDD835', '#8E24AA', '#FB8C00'][Math.floor(r() * 6)];
  x.lineWidth = 4; x.lineCap = 'round';
  x.fillStyle = '#FDD835'; x.beginPath(); x.arc(40 + r() * 30, 40, 18, 0, 2 * PI); x.fill();
  if (r() < 0.5) { x.strokeStyle = crayon(); x.strokeRect(120, 90, 70, 60); x.beginPath(); x.moveTo(112, 92); x.lineTo(155, 55); x.lineTo(198, 92); x.stroke(); }
  else { x.strokeStyle = '#43A047'; x.beginPath(); x.ellipse(160, 120, 50, 25, 0, 0, 2 * PI); x.stroke(); x.beginPath(); x.moveTo(205, 115); x.lineTo(235, 80); x.stroke(); for (let k = 0; k < 4; k++) { x.beginPath(); x.moveTo(130 + k * 18, 140); x.lineTo(130 + k * 18, 165); x.stroke(); } }
  for (let p = 0; p < 2 + Math.floor(r() * 2); p++) { const px = 40 + p * 30, s = p === 2 ? 0.6 : 1; x.strokeStyle = crayon(); x.beginPath(); x.arc(px, 120 - 20 * s, 8 * s, 0, 2 * PI); x.moveTo(px, 128 - 20 * s); x.lineTo(px, 160); x.moveTo(px - 12 * s, 140); x.lineTo(px + 12 * s, 140); x.moveTo(px, 160); x.lineTo(px - 8, 180); x.moveTo(px, 160); x.lineTo(px + 8, 180); x.stroke(); }
  x.strokeStyle = '#43A047'; x.beginPath(); x.moveTo(0, 185); x.lineTo(256, 185); x.stroke();
  return c;
}
// a photograph (people's shapes, faces no one's): pinned to a board, in a frame on a shelf
export function photo(seed, { tone = '#C9B79C' } = {}) {
  const [c, x] = canvas(200, 150), r = rng(seed); const g = x.createLinearGradient(0, 0, 0, 150); g.addColorStop(0, shade(tone, 1.1)); g.addColorStop(1, shade(tone, 0.7)); x.fillStyle = g; x.fillRect(0, 0, 200, 150);
  for (let p = 0; p < 1 + Math.floor(r() * 3); p++) { const px = 50 + p * 50 + r() * 10, s = 0.7 + r() * 0.4; x.fillStyle = shade('#3A3029', 0.8 + r() * 0.6); x.beginPath(); x.ellipse(px, 150, 26 * s, 50 * s, 0, PI, 2 * PI); x.fill(); x.fillStyle = shade('#C49A7A', 0.8 + r() * 0.3); x.beginPath(); x.arc(px, 82 - 20 * s, 14 * s, 0, 2 * PI); x.fill(); }
  x.strokeStyle = '#F4F1EA'; x.lineWidth = 8; x.strokeRect(0, 0, 200, 150); return c;
}
// an abstract painting (an office's art)
export function painting(seed, pal = ['#1F3A5F', '#C9A66B', '#E8E2D4', '#8C3B2E']) {
  const [c, x] = canvas(400, 300), r = rng(seed); x.fillStyle = pal[2]; x.fillRect(0, 0, 400, 300);
  for (let i = 0; i < 9; i++) { x.fillStyle = pal[Math.floor(r() * pal.length)]; x.globalAlpha = 0.5 + r() * 0.5; if (r() < 0.5) x.fillRect(r() * 300, r() * 220, 40 + r() * 160, 20 + r() * 120); else { x.beginPath(); x.arc(r() * 400, r() * 300, 20 + r() * 70, 0, 2 * PI); x.fill(); } }
  x.globalAlpha = 1; return c;
}
// the city in layers, for a window's depth (cityLayer) and an exterior's ring: 'sky' (a gradient, soft clouds, the
// sun's haze to one side), 'far' (thin towers in the haze, pale and low in contrast), 'mid' (the nearer towers, setbacks,
// water tanks on the roofs), 'near' (the building across the street: its facade, its windows and their sills, a fire
// escape, the roofline against the sky). Transparent above their roofs; drawn once a session per seed and light.
const LAYERS = new Map();
export function cityLayer(kind, { night = false, golden = false, seed = 31, w = 2048, h = 1024, tone = null } = {}) {
  const key = [kind, night, golden, seed, w, h, tone].join('|'); if (LAYERS.has(key)) return LAYERS.get(key);
  const [c, x] = canvas(w, h), r = rng(seed * 7 + kind.length);
  const haze = night ? '#151A2C' : golden ? '#E7C9A4' : '#C9D9EA';
  if (kind === 'sky') {
    const g = x.createLinearGradient(0, 0, 0, h);
    if (night) { g.addColorStop(0, '#04060E'); g.addColorStop(0.6, '#0E1630'); g.addColorStop(1, '#2A2440'); }
    else if (golden) { g.addColorStop(0, '#5F8FC9'); g.addColorStop(0.55, '#E3C29A'); g.addColorStop(1, '#F6D8AE'); }
    else { g.addColorStop(0, '#4E8CD8'); g.addColorStop(0.5, '#8DBCEB'); g.addColorStop(0.85, '#CFE2F4'); g.addColorStop(1, '#E6EFF7'); }
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    if (!night) {
      // (the sun's haze, off to one side)
      const s = x.createRadialGradient(w * 0.78, h * 0.18, 10, w * 0.78, h * 0.18, w * 0.45); s.addColorStop(0, golden ? 'rgba(255,214,160,0.75)' : 'rgba(255,252,240,0.6)'); s.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = s; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 16; i++) {
        const cx = r() * w, cy = h * (0.06 + r() * 0.42), sc = 0.6 + r() * 1.2;
        for (let k = 0; k < 14; k++) { const px = cx + (r() - 0.5) * 260 * sc, py = cy + (r() - 0.5) * 34 * sc, rr = (30 + r() * 70) * sc;
          const gg = x.createRadialGradient(px, py, 1, px, py, rr); gg.addColorStop(0, `rgba(255,255,255,${0.16 + r() * 0.16})`); gg.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gg; x.beginPath(); x.ellipse(px, py, rr, rr * 0.42, 0, 0, 2 * PI); x.fill(); }
      }
    } else for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.5})`; x.fillRect(r() * w, r() * h * 0.5, 1.5, 1.5); }
  } else if (kind === 'far' || kind === 'mid') {
    const far = kind === 'far';
    const tower = (x0, wd, top) => {
      const base = night ? (far ? '#0E1322' : '#090C16') : shade(far ? haze : (tone || '#9AA6B4'), far ? 0.86 + r() * 0.1 : 0.62 + r() * 0.34);
      x.fillStyle = base; x.fillRect(x0, top, wd, h - top);
      // (a setback, a crown, a mast; a water tank on the shorter ones)
      if (r() < 0.45) { x.fillRect(x0 + wd * 0.15, top - 26 - r() * 50, wd * 0.7, 60); }
      if (!far && r() < 0.35) { const tx = x0 + wd * (0.2 + r() * 0.5); x.fillStyle = night ? '#07090F' : shade('#6B5442', 0.8 + r() * 0.3); x.fillRect(tx, top - 34, 22, 26); x.beginPath(); x.moveTo(tx - 2, top - 34); x.lineTo(tx + 11, top - 46); x.lineTo(tx + 24, top - 34); x.fill(); x.fillRect(tx + 2, top - 8, 2, 8); x.fillRect(tx + 18, top - 8, 2, 8); x.fillStyle = base; }
      if (r() < 0.12) { x.fillRect(x0 + wd / 2 - 1, top - 90, 2, 90); }
      // (light down one side, the shade on the other)
      if (!night) { const sg = x.createLinearGradient(x0, 0, x0 + wd, 0); sg.addColorStop(0, 'rgba(255,250,235,0.16)'); sg.addColorStop(0.55, 'rgba(255,255,255,0)'); sg.addColorStop(1, 'rgba(10,20,40,0.18)'); x.fillStyle = sg; x.fillRect(x0, top, wd, h - top); }
      const cw = far ? 3 + r() * 2 : 6 + r() * 5, ch = far ? 4 + r() * 2 : 8 + r() * 4, gx = far ? 3 : 5, gy = far ? 4 : 6;
      for (let yy = top + 6; yy < h; yy += ch + gy) for (let xx = x0 + 4; xx < x0 + wd - cw - 2; xx += cw + gx) {
        if (night) { if (r() < (far ? 0.3 : 0.4)) { x.fillStyle = r() < 0.7 ? '#FFD58A' : '#CFE3FF'; x.globalAlpha = 0.45 + r() * 0.5; x.fillRect(xx, yy, cw, ch); x.globalAlpha = 1; } }
        else { x.fillStyle = r() < 0.55 ? `rgba(30,48,72,${far ? 0.16 : 0.42})` : `rgba(225,236,248,${far ? 0.18 : 0.38})`; x.fillRect(xx, yy, cw, ch); }
      }
    };
    if (far) for (let x0 = -30; x0 < w; x0 += 40 + r() * 90) tower(x0, 36 + r() * 90, h * (0.18 + r() * 0.42));
    else for (let x0 = -60; x0 < w; x0 += 110 + r() * 170) tower(x0, 110 + r() * 200, h * (0.3 + r() * 0.36));
    // (the haze over the far ones, thicker toward the ground)
    if (far && !night) { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(214,226,238,0.55)'); x.globalCompositeOperation = 'source-atop'; x.fillStyle = g; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'source-over'; }
  } else {
    // the building across the street: a few bays of tall windows, its stone or brick, sills and lintels, a cornice, a fire
    // escape down one bay; the roofline at a third of the way down
    const top = h * (0.12 + r() * 0.12), wall = tone || ['#A0634A', '#B9A587', '#8E5B45', '#C8BBA2', '#7E6A5A'][Math.floor(r() * 5)];
    x.fillStyle = night ? shade(wall, 0.18) : wall; x.fillRect(0, top, w, h - top);
    // (bricks or stone courses, faintly)
    for (let yy = top; yy < h; yy += 9) { x.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.05})`; x.fillRect(0, yy, w, 1); }
    noise(x, 0, 14, r);
    // cornice
    x.fillStyle = night ? '#141210' : shade(wall, 1.18); x.fillRect(0, top - 14, w, 22); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, top + 8, w, 6);
    const bays = 7 + Math.floor(r() * 3), bw = w / bays, fh = 150;
    for (let b = 0; b < bays; b++) for (let yy = top + 46; yy < h - 20; yy += fh) {
      const wx = b * bw + bw * 0.24, ww = bw * 0.52, wh = fh * 0.62;
      x.fillStyle = night ? '#0B0C10' : shade(wall, 1.25); x.fillRect(wx - 6, yy - 10, ww + 12, 10); x.fillRect(wx - 8, yy + wh, ww + 16, 8);
      const lit = night && r() < 0.45, gl = x.createLinearGradient(0, yy, 0, yy + wh);
      if (lit) { gl.addColorStop(0, '#FFD9A0'); gl.addColorStop(1, '#C08A50'); }
      else if (night) { gl.addColorStop(0, '#10141E'); gl.addColorStop(1, '#0A0C12'); }
      else { gl.addColorStop(0, '#9FB8D2'); gl.addColorStop(0.45, '#5E7690'); gl.addColorStop(1, '#2E3A48'); }
      x.fillStyle = gl; x.fillRect(wx, yy, ww, wh);
      // (a blind or a curtain down in some)
      if (!night && r() < 0.4) { x.fillStyle = r() < 0.5 ? 'rgba(236,228,210,0.85)' : 'rgba(200,170,140,0.8)'; x.fillRect(wx, yy, ww, wh * (0.2 + r() * 0.5)); }
      x.fillStyle = night ? '#191A1E' : '#ECE8E0'; x.fillRect(wx + ww / 2 - 2, yy, 4, wh); x.fillRect(wx, yy + wh * 0.5 - 2, ww, 4);
    }
    // the fire escape down one bay: landings and the zig-zag of its stairs, black iron
    const fx = Math.floor(bays * (0.3 + r() * 0.4)) * bw + bw * 0.1, fw = bw * 0.8;
    x.strokeStyle = x.fillStyle = night ? '#000000' : '#1E1C1A'; x.lineWidth = 3;
    for (let yy = top + 46 + fh * 0.66; yy < h; yy += fh) { x.fillRect(fx, yy, fw, 5); for (let k = 0; k <= 8; k++) x.fillRect(fx + (k * fw) / 8, yy - 26, 2, 26); x.fillRect(fx, yy - 26, fw, 2); x.beginPath(); x.moveTo(fx + 6, yy); x.lineTo(fx + fw - 6, yy + fh - 2); x.stroke(); }
    // (the sun across it, the shade at its foot)
    if (!night) { const g = x.createLinearGradient(0, top, 0, h); g.addColorStop(0, 'rgba(255,246,226,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.30)'); x.fillStyle = g; x.fillRect(0, top - 14, w, h); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = THREE.RepeatWrapping;
  t.userData.keep = true; LAYERS.set(key, t); return t;
}
// a block's facade, one bay of one floor (tiled over the block in metres: 3 m by 3.3 m): its wall, the window with its
// frame, sill and lintel, the glass with the sky in it (style: 'brick' | 'stone' | 'glass' | 'cast')
const FAC = new Map();
export function facade(style = 'brick', { night = false, seed = 5, tone = null } = {}) {
  const key = [style, night, seed, tone].join('|'); if (FAC.has(key)) return FAC.get(key);
  const [c, x] = canvas(256, 288), r = rng(seed);
  const wall = tone || { brick: '#94553F', stone: '#C3B49A', glass: '#5C6C7C', cast: '#8C8A84' }[style] || '#94553F';
  x.fillStyle = night ? shade(wall, 0.22) : wall; x.fillRect(0, 0, 256, 288);
  if (style === 'brick') for (let j = 0; j < 36; j++) for (let i = -1; i < 9; i++) { x.fillStyle = shade(night ? shade(wall, 0.22) : wall, 0.8 + r() * 0.35); x.fillRect(i * 32 + (j % 2) * 16 + 1, j * 8 + 1, 30, 6); }
  else if (style === 'stone') for (let j = 0; j < 288; j += 24) { x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(0, j, 256, 2); }
  noise(x, 0, 12, r);
  const glassG = (y0, y1) => { const g = x.createLinearGradient(0, y0, 0, y1); if (night) { const lit = r() < 0.45; g.addColorStop(0, lit ? '#FFD49A' : '#10131B'); g.addColorStop(1, lit ? '#B98048' : '#07080C'); } else { g.addColorStop(0, '#B4C9DE'); g.addColorStop(0.4, '#6A829C'); g.addColorStop(1, '#2C3846'); } return g; };
  if (style === 'glass') { x.fillStyle = glassG(0, 288); x.fillRect(6, 10, 244, 250); x.fillStyle = night ? '#111' : '#3A4652'; x.fillRect(0, 260, 256, 28); x.fillRect(126, 0, 4, 288); }
  else {
    const wx = 62, ww = 132, wy = 60, wh = 170;
    x.fillStyle = night ? '#16140F' : shade(wall, 1.3); x.fillRect(wx - 10, wy - 16, ww + 20, 16); x.fillRect(wx - 12, wy + wh, ww + 24, 12);
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(wx - 4, wy - 2, ww + 8, wh + 4);
    x.fillStyle = glassG(wy, wy + wh); x.fillRect(wx, wy, ww, wh);
    if (!night && r() < 0.5) { x.fillStyle = 'rgba(232,224,206,0.85)'; x.fillRect(wx, wy, ww, wh * (0.15 + r() * 0.5)); }
    x.fillStyle = night ? '#1A1A1C' : '#EDEAE2'; x.fillRect(wx + ww / 2 - 3, wy, 6, wh); x.fillRect(wx, wy + wh / 2 - 3, ww, 6);
    x.fillRect(wx - 2, wy - 2, ww + 4, 5); x.fillRect(wx - 2, wy + wh - 3, ww + 4, 5); x.fillRect(wx - 2, wy, 5, wh); x.fillRect(wx + ww - 3, wy, 5, wh);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  t.userData.keep = true; FAC.set(key, t); return t;
}
// a blob of soft shadow under someone's feet (the light's shadow does the rest)
let BLOB = null;
export function blobTexture() {
  if (BLOB) return BLOB; const [c, x] = canvas(128, 128); const g = x.createRadialGradient(64, 64, 4, 64, 64, 62); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  BLOB = new THREE.CanvasTexture(c); BLOB.userData.keep = true; return BLOB;
}

/* ----------------------------------------------------------------- kit -- */
export function kit(scene, { night = false, golden = false } = {}) {
  const group = new THREE.Group(); group.name = 'set'; scene.add(group);
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, ...o });
  const surf = (c, rep, o = {}) => std({ map: tex(c, rep), ...o });
  const K = {
    group, night, golden, PI, rng, std, surf, tex, shade,
    // a box (w, h, d) standing on y (its bottom), centred on x z: most of the furniture
    box(w, h, d, m, x, y, z, { parent = group, ry = 0, r = 0, shadow = true, tile = null } = {}) {
      const g = r ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d);
      if (!r && (tile || m?.userData?.tile)) uvBox(g, w, h, d, tile || m.userData.tile);
      const b = new THREE.Mesh(g, m); b.position.set(x, y + h / 2, z); b.rotation.y = ry; b.castShadow = shadow; b.receiveShadow = true; parent.add(b); return b;
    },
    cyl(rt, rb, h, m, x, y, z, { parent = group, seg = 20, rx = 0, rz = 0, shadow = true } = {}) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); c.position.set(x, y + h / 2, z); c.rotation.x = rx; c.rotation.z = rz; c.castShadow = shadow; c.receiveShadow = true; parent.add(c); return c;
    },
    plane(w, h, m, x, y, z, { parent = group, rx = 0, ry = 0, tile = null, ox = 0, oy = 0 } = {}) {
      const g = new THREE.PlaneGeometry(w, h); if (tile || m?.userData?.tile) uvPlane(g, w, h, tile || m.userData.tile, ox, oy);
      const p = new THREE.Mesh(g, m); p.position.set(x, y, z); p.rotation.set(rx, ry, 0); p.receiveShadow = true; parent.add(p); return p;
    },
    grp(x = 0, y = 0, z = 0, ry = 0, parent = group) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g); return g; },
    mat: {},
  };
  const M = K.mat;
  M.wood = std({ color: '#6B4A31', roughness: 0.45 }); M.walnut = std({ color: '#4A3020', roughness: 0.4 }); M.oak = std({ color: '#A57A4F', roughness: 0.5 });
  M.white = std({ color: '#F1EFEA', roughness: 0.7 }); M.offwhite = std({ color: '#E2DDD2', roughness: 0.75 }); M.black = std({ color: '#151515', roughness: 0.5 });
  M.steel = std({ color: '#9EA3A8', roughness: 0.35, metalness: 0.8 }); M.chrome = std({ color: '#D7DADF', roughness: 0.15, metalness: 1 }); M.brass = std({ color: '#B68A3E', roughness: 0.3, metalness: 1 });
  M.leather = std({ color: '#2B1C15', roughness: 0.45 }); M.oxblood = std({ color: '#5A1F1A', roughness: 0.5 }); M.fabric = std({ color: '#5B6470', roughness: 0.95 });
  M.plant = std({ color: '#3F6B35', roughness: 0.8 }); M.plant2 = std({ color: '#5C8A3F', roughness: 0.8 }); M.soil = std({ color: '#3A2A1E', roughness: 1 }); M.terracotta = std({ color: '#A65A3A', roughness: 0.8 });
  M.paper = std({ color: '#F4F1E8', roughness: 0.9 }); M.screen = std({ color: '#0E1116', roughness: 0.2, emissive: '#5C7FA8', emissiveIntensity: night ? 0.9 : 0.5 });
  M.glass = new THREE.MeshPhysicalMaterial({ color: '#CFE0EA', roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.18 });
  M.lamp = std({ color: '#FFF4DC', emissive: '#FFE7B8', emissiveIntensity: night ? 2.2 : 1.2, roughness: 0.6 });
  M.panel = std({ color: '#F7F7F2', emissive: '#FFFFFF', emissiveIntensity: night ? 1.4 : 0.9, roughness: 0.8 });

  // books on a shelf (instanced: spines in a library's colours, heights and leans of their own)
  K.books = (x, y, z, len, ry = 0, seed = 41, depth = 0.22) => {
    const r = rng(seed), n = Math.floor(len / 0.035), geo = new THREE.BoxGeometry(1, 1, 1), m = std({ roughness: 0.7 });
    const I = new THREE.InstancedMesh(geo, m, n), o = new THREE.Object3D(), c = new THREE.Color(), cols = ['#5A1F1A', '#1F3A5F', '#2F4F2F', '#7A6A4F', '#2B2B2B', '#8C6D3F', '#4B3A5A', '#A0522D', '#D8CFB8'];
    const G = K.grp(x, y, z, ry); let px = -len / 2, i = 0;
    while (i < n && px < len / 2 - 0.02) { const w = 0.022 + r() * 0.03, h = 0.2 + r() * 0.1; if (r() < 0.06) { px += 0.06; continue; } o.position.set(px + w / 2, h / 2, 0); o.rotation.set(0, 0, r() < 0.05 ? 0.2 : 0); o.scale.set(w, h, depth * (0.8 + r() * 0.2)); o.updateMatrix(); I.setMatrixAt(i, o.matrix); I.setColorAt(i, c.set(cols[Math.floor(r() * cols.length)]).multiplyScalar(0.8 + r() * 0.4)); px += w + 0.002; i++; }
    I.count = i; I.castShadow = true; I.receiveShadow = true; G.add(I); return G;
  };
  K.bookcase = (x, z, ry = 0, w = 1.2, h = 2.1, seed = 43, m = M.walnut) => {
    const G = K.grp(x, 0, z, ry), d = 0.34;
    K.box(w, h, 0.03, m, 0, 0, -d / 2 + 0.015, { parent: G }); for (const s of [-1, 1]) K.box(0.03, h, d, m, s * (w / 2 - 0.015), 0, 0, { parent: G });
    const n = 5; for (let i = 0; i <= n; i++) { const y = 0.06 + (i * (h - 0.1)) / n; K.box(w - 0.04, 0.025, d, m, 0, y, 0, { parent: G }); if (i < n) K.books(0, y + 0.025, 0.01, w - 0.12, 0, seed + i, d - 0.06).parent = G; }
    // (a few things on the shelves among the books: a frame, a bowl)
    return G;
  };
  K.plant = (x, z, s = 1, seed = 47) => {
    const r = rng(seed), G = K.grp(x, 0, z);
    K.cyl(0.2 * s, 0.15 * s, 0.38 * s, M.terracotta, 0, 0, 0, { parent: G }); K.cyl(0.19 * s, 0.19 * s, 0.02, M.soil, 0, 0.36 * s, 0, { parent: G });
    for (let i = 0; i < 26; i++) {
      const a = r() * 2 * PI, h = (0.45 + r() * 0.9) * s, lean = 0.15 + r() * 0.35;
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.11 * s, 8, 6), r() < 0.5 ? M.plant : M.plant2); leaf.scale.set(1, 0.35, 2.2);
      leaf.position.set(Math.cos(a) * lean * h * 0.6, 0.38 * s + h, Math.sin(a) * lean * h * 0.6); leaf.rotation.set(-0.6 + r() * 0.5, a, 0); leaf.castShadow = true; G.add(leaf);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, h, 5), M.plant); stem.position.set(Math.cos(a) * lean * h * 0.3, 0.38 * s + h / 2, Math.sin(a) * lean * h * 0.3); stem.rotation.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean); G.add(stem);
    }
    return G;
  };
  // a framed picture on a wall: (x, y the middle, z), facing ry
  K.frame = (c, w, h, x, y, z, ry = 0, fm = M.walnut) => {
    const G = K.grp(x, y, z, ry); K.box(w + 0.08, h + 0.08, 0.04, fm, 0, -(h + 0.08) / 2, 0, { parent: G, shadow: false });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std({ map: tex(c), roughness: 0.6 })); p.position.z = 0.021; G.add(p); return G;
  };
  // an office chair (its five-star base, the seat, the back) and a guest chair; a desk; a lamp
  K.officeChair = (x, z, ry = 0, m = M.leather) => {
    const G = K.grp(x, 0, z, ry);
    for (let i = 0; i < 5; i++) { const a = (i * 2 * PI) / 5, leg = K.box(0.04, 0.03, 0.32, M.chrome, Math.sin(a) * 0.16, 0.04, Math.cos(a) * 0.16, { parent: G }); leg.rotation.y = a; }
    K.cyl(0.025, 0.025, 0.4, M.chrome, 0, 0.06, 0, { parent: G }); K.box(0.52, 0.09, 0.5, m, 0, 0.44, 0, { parent: G, r: 0.03 });
    K.box(0.5, 0.62, 0.08, m, 0, 0.56, -0.24, { parent: G, r: 0.03 }); return G;
  };
  K.chair = (x, z, ry = 0, m = M.wood, seat = M.fabric) => {
    const G = K.grp(x, 0, z, ry);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(0.04, 0.45, 0.04, m, sx * 0.2, 0, sz * 0.2, { parent: G });
    K.box(0.48, 0.06, 0.46, seat, 0, 0.45, 0, { parent: G, r: 0.02 }); K.box(0.46, 0.45, 0.04, m, 0, 0.5, -0.21, { parent: G, r: 0.015 });
    return G;
  };
  K.desk = (x, z, ry = 0, w = 1.8, d = 0.85, m = M.walnut, { pedestals = true } = {}) => {
    const G = K.grp(x, 0, z, ry), h = 0.76;
    K.box(w, 0.05, d, m, 0, h - 0.05, 0, { parent: G, r: 0.01 });
    if (pedestals) for (const s of [-1, 1]) { K.box(0.45, h - 0.05, d - 0.06, m, s * (w / 2 - 0.25), 0, 0, { parent: G }); for (const y of [0.18, 0.42, 0.6]) K.box(0.25, 0.012, 0.01, M.brass, s * (w / 2 - 0.25), y, d / 2 - 0.025, { parent: G, shadow: false }); }
    else for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(0.05, h - 0.05, 0.05, M.steel, sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06), { parent: G });
    K.box(w - 0.1, 0.5, 0.02, m, 0, 0.2, -d / 2 + 0.05, { parent: G });
    return G;
  };
  K.monitor = (x, y, z, ry = 0) => { const G = K.grp(x, y, z, ry); K.box(0.2, 0.01, 0.16, M.black, 0, 0, 0, { parent: G }); K.box(0.04, 0.22, 0.03, M.black, 0, 0, -0.03, { parent: G }); K.box(0.58, 0.36, 0.03, M.black, 0, 0.16, 0, { parent: G }); const s = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.33), M.screen); s.position.set(0, 0.34, 0.016); G.add(s); return G; };
  K.deskLamp = (x, y, z, shadeM = std({ color: '#1F4A2E', roughness: 0.4, side: THREE.DoubleSide })) => { const G = K.grp(x, y, z); K.cyl(0.08, 0.09, 0.02, M.brass, 0, 0, 0, { parent: G }); K.cyl(0.01, 0.01, 0.34, M.brass, 0, 0.02, 0, { parent: G }); const sh = K.cyl(0.07, 0.13, 0.12, shadeM, 0, 0.3, 0, { parent: G }); sh.material.side = THREE.DoubleSide; K.cyl(0.05, 0.05, 0.04, M.lamp, 0, 0.3, 0, { parent: G, shadow: false }); return G; };
  K.floorLamp = (x, z, h = 1.6) => { const G = K.grp(x, 0, z); K.cyl(0.16, 0.18, 0.03, M.black, 0, 0, 0, { parent: G }); K.cyl(0.012, 0.012, h, M.brass, 0, 0, 0, { parent: G }); const sh = K.cyl(0.16, 0.22, 0.28, std({ color: '#EDE3CC', roughness: 0.9, emissive: '#FFDCA0', emissiveIntensity: night ? 0.7 : 0.15, side: THREE.DoubleSide }), 0, h - 0.1, 0, { parent: G }); return G; };
  K.papers = (x, y, z, n = 4, seed = 53) => { const r = rng(seed); for (let i = 0; i < n; i++) { const p = K.box(0.21, 0.003, 0.297, M.paper, x + (r() - 0.5) * 0.3, y + i * 0.003, z + (r() - 0.5) * 0.2, { shadow: false }); p.rotation.y = (r() - 0.5) * 0.6; } };
  K.sofa = (x, z, ry = 0, w = 2.0, m = M.fabric, seed = 0) => {
    const G = K.grp(x, 0, z, ry);
    K.box(w, 0.42, 0.9, m, 0, 0.06, 0, { parent: G, r: 0.05 }); K.box(w, 0.5, 0.22, m, 0, 0.4, -0.36, { parent: G, r: 0.08 });
    for (const s of [-1, 1]) K.box(0.2, 0.62, 0.9, m, s * (w / 2 - 0.1), 0.06, 0, { parent: G, r: 0.07 });
    const n = Math.max(2, Math.round((w - 0.4) / 0.7)); for (let i = 0; i < n; i++) K.box((w - 0.42) / n - 0.02, 0.14, 0.62, m, -((w - 0.42) / 2) + ((i + 0.5) * (w - 0.42)) / n, 0.48, 0.08, { parent: G, r: 0.05 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(0.05, 0.06, 0.05, M.walnut, sx * (w / 2 - 0.08), 0, sz * 0.36, { parent: G });
    return G;
  };
  K.armchair = (x, z, ry = 0, m = M.fabric) => K.sofa(x, z, ry, 0.95, m);
  K.rug = (w, d, x, z, c1 = '#7A2E2A', c2 = '#D9C7A3', seed = 59) => {
    const [cv, cx] = canvas(512, 512), r = rng(seed); cx.fillStyle = c1; cx.fillRect(0, 0, 512, 512); cx.strokeStyle = c2; cx.lineWidth = 14; cx.strokeRect(24, 24, 464, 464); cx.lineWidth = 4; cx.strokeRect(52, 52, 408, 408);
    for (let i = 0; i < 6; i++) { cx.fillStyle = c2; cx.globalAlpha = 0.5; cx.beginPath(); cx.arc(256, 256, 40 + i * 30, 0, 2 * PI); cx.lineWidth = 3; cx.stroke(); } cx.globalAlpha = 1; noise(cx, 0, 20, r);
    const m = std({ map: tex(cv), roughness: 1 }); const p = K.plane(w, d, m, x, 0.006, z, { rx: -PI / 2 }); return p;
  };
  K.cabinet = (x, z, ry = 0, w = 0.5, h = 1.3, m = std({ color: '#5E6670', roughness: 0.5, metalness: 0.4 })) => { const G = K.grp(x, 0, z, ry); K.box(w, h, 0.6, m, 0, 0, 0, { parent: G }); const n = Math.round(h / 0.33); for (let i = 0; i < n; i++) { K.box(0.16, 0.02, 0.02, M.chrome, 0, (i + 0.7) * (h / n), 0.31, { parent: G, shadow: false }); K.box(w - 0.04, 0.004, 0.005, M.black, 0, (i + 1) * (h / n) - 0.01, 0.3, { parent: G, shadow: false }); } return G; };
  K.door = (x, z, ry = 0, m = std({ color: '#6E4B32', roughness: 0.5 }), { w = 0.95, h = 2.15, glass = false } = {}) => {
    const G = K.grp(x, 0, z, ry); K.box(w + 0.14, h + 0.07, 0.06, M.offwhite, 0, 0, 0, { parent: G }); K.box(w, h, 0.05, m, 0, 0, 0.02, { parent: G });
    for (const y of [0.3, 1.15]) K.box(w - 0.3, y < 1 ? 0.65 : 0.8, 0.012, std({ color: shade('#6E4B32', 0.85) }), 0, y, 0.05, { parent: G, shadow: false });
    if (glass) K.box(w - 0.4, 0.5, 0.012, std({ color: '#C8DCE8', roughness: 0.1, emissive: '#DDEEFF', emissiveIntensity: 0.4 }), 0, 1.45, 0.056, { parent: G, shadow: false });
    K.cyl(0.03, 0.03, 0.05, M.brass, w / 2 - 0.12, 1.0, 0.07, { parent: G, rx: PI / 2 }); return G;
  };
  // the set's scans, loading (K.ready waits for them all); its windows' daylight (sets.js makes each an area light)
  K.pending = []; K.rects = [];
  K.ready = () => Promise.allSettled(K.pending);
  // (once it is all there: the set's own still pieces drawn as one mesh per material, the draw calls of a room a few
  // dozen instead of hundreds; the library's scans, the see-through and the ordered ones stay as they are)
  K.bake = () => {
    group.updateMatrixWorld(true);
    const bins = new Map();
    group.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.userData.keep || o.renderOrder || Array.isArray(o.material) || o.material.transparent) return;
      if (Object.keys(o.geometry.attributes).sort().join(',') !== 'normal,position,uv') return;
      const k = o.material.uuid + (o.castShadow ? '|s' : '|n') + (o.geometry.index ? '|i' : '|f');
      if (!bins.has(k)) bins.set(k, []); bins.get(k).push(o);
    });
    let n = 0;
    for (const list of bins.values()) {
      if (list.length < 2) continue;
      const geos = list.map((o) => o.geometry.clone().applyMatrix4(o.matrixWorld));
      let g = null; try { g = mergeGeometries(geos, false); } catch {}
      for (const x of geos) if (x !== g) x.dispose();
      if (!g) continue;
      const m = new THREE.Mesh(g, list[0].material); m.castShadow = list[0].castShadow; m.receiveShadow = true; group.add(m);
      for (const o of list) { o.removeFromParent(); o.geometry.dispose(); }
      n += list.length - 1;
    }
    return n;
  };
  // a scanned surface from the library, tinted (the plaster takes a wall's paint), laid in metres (its tile)
  K.scan = (id, { tint = '#FFFFFF', rough = 1, nscale = 1, metal = 0, tile = null, env = null, color = true } = {}) => {
    const m = std({ color: tint, roughness: rough, metalness: metal }); m.userData.tile = tile || SCAN[id] || 2;
    if (env != null) m.envMapIntensity = env;
    K.pending.push(Promise.all([libTex(`tex-${id}/color.jpg`, true), libTex(`tex-${id}/normal.jpg`, false), libTex(`tex-${id}/roughness.jpg`, false)])
      .then(([a, n, rr]) => { if (color) m.map = a; m.normalMap = n; m.normalScale = new THREE.Vector2(nscale, nscale); m.roughnessMap = rr; m.needsUpdate = true; })
      .catch((e) => console.warn('[storyrun] set scan', id, e.message)));
    return m;
  };
  // a model from the library (its parts, or all), placed: x y z its foot, ry, s its scale; tint: its colour multiplied
  K.prop = (id, x, y, z, { ry = 0, s = 1, parts = null, parent = group, tint = null, shadow = true, rx = 0, rz = 0 } = {}) => {
    const G = K.grp(x, y, z, ry, parent); G.rotation.x = rx; G.rotation.z = rz; G.scale.setScalar(s);
    K.pending.push(libModel(id).then((L) => {
      const names = parts ? [].concat(parts) : Object.keys(L.parts);
      for (const n of names) for (const sub of L.parts[n] || []) {
        let mat = sub.material; if (tint) { mat = mat.clone(); mat.color.set(tint); }
        const me = new THREE.Mesh(sub.geometry, mat); me.castShadow = shadow; me.receiveShadow = true; me.userData.keep = true; G.add(me);
      }
    }).catch(() => {}));
    return G;
  };
  // a soft contact shadow on the floor under a thing (w by d, k its darkness)
  K.blob = (x, z, w, d, k = 0.45, ry = 0, y = 0.004, parent = group) => {
    const m = new THREE.MeshBasicMaterial({ color: '#000000', alphaMap: blobAlpha(), transparent: true, opacity: k, depthWrite: false });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); p.rotation.set(-PI / 2, 0, ry); p.position.set(x, y, z); p.renderOrder = 1; parent.add(p); return p;
  };
  // a lit bulb (bright past white, so it blooms) and a practical lamp's parts
  K.bulb = (x, y, z, r = 0.03, color = '#FFE2B0', k = 6, parent = group) => {
    const c = new THREE.Color(color).multiplyScalar(k), b = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), new THREE.MeshBasicMaterial({ color: c }));
    b.position.set(x, y, z); parent.add(b); return b;
  };
  // a pendant over a table or a counter: the cord from the ceiling, a shade, the bulb in it
  K.pendant = (x, z, y, top, { shadeC = '#2B4A3A', r = 0.2, parent = group } = {}) => {
    const G = K.grp(x, 0, z, 0, parent);
    K.cyl(0.004, 0.004, top - y - 0.12, M.black, 0, y + 0.12, 0, { parent: G, shadow: false });
    const sh = K.cyl(0.05, r, 0.16, std({ color: shadeC, roughness: 0.35, metalness: 0.5, side: THREE.DoubleSide }), 0, y, 0, { parent: G, seg: 28 }); sh.material.side = THREE.DoubleSide;
    K.bulb(0, y + 0.02, 0, 0.045, '#FFE0A8', night ? 9 : 6, G); return G;
  };
  // a radiator under a window (cast iron, painted), an outlet and a switch plate, a wall clock
  K.radiator = (x, z, ry = 0, w = 1.0, m = std({ color: '#D9D4C8', roughness: 0.55, metalness: 0.2 })) => {
    const G = K.grp(x, 0, z, ry), n = Math.round(w / 0.06);
    for (let i = 0; i < n; i++) K.box(0.045, 0.6, 0.11, m, -w / 2 + (i + 0.5) * (w / n), 0.12, 0, { parent: G, r: 0.012 });
    K.box(w, 0.03, 0.08, m, 0, 0.1, 0, { parent: G }); K.cyl(0.012, 0.012, 0.12, m, -w / 2 - 0.04, 0, 0, { parent: G }); return G;
  };
  K.plate = (x, y, z, ry = 0, sw = false, parent = group) => { const G = K.grp(x, y, z, ry, parent); K.box(0.075, 0.115, 0.008, M.white, 0, 0, 0.004, { parent: G, shadow: false }); if (sw) K.box(0.012, 0.03, 0.01, M.offwhite, 0, 0.045, 0.01, { parent: G, shadow: false }); else for (const s of [-1, 1]) K.box(0.03, 0.02, 0.004, M.black, 0, 0.057 + s * 0.022, 0.009, { parent: G, shadow: false }); return G; };
  K.clock = (x, y, z, ry = 0, parent = group) => {
    const G = K.grp(x, y, z, ry, parent); const [c, cx] = canvas(256, 256); cx.fillStyle = '#F6F3EC'; cx.beginPath(); cx.arc(128, 128, 126, 0, 2 * PI); cx.fill(); cx.strokeStyle = '#222'; cx.lineWidth = 6;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * 2 * PI; cx.beginPath(); cx.moveTo(128 + Math.sin(a) * 100, 128 - Math.cos(a) * 100); cx.lineTo(128 + Math.sin(a) * 118, 128 - Math.cos(a) * 118); cx.stroke(); }
    cx.lineWidth = 8; cx.beginPath(); cx.moveTo(128, 128); cx.lineTo(128 + 52, 128 + 30); cx.moveTo(128, 128); cx.lineTo(128 - 18, 128 - 86); cx.stroke();
    const f = K.cyl(0.17, 0.17, 0.04, M.black, 0, -0.17, 0, { parent: G, rx: PI / 2 }); f.position.set(0, 0, 0.02);
    const p = new THREE.Mesh(new THREE.CircleGeometry(0.155, 32), std({ map: tex(c), roughness: 0.4 })); p.position.z = 0.042; G.add(p); return G;
  };
  // a fern (or a shrub) in a pot: a terracotta or a glazed one
  K.potted = (x, z, s = 1, { kind = 'fern', pot = '#A65A3A', y = 0, h = 0.36, parent = group } = {}) => {
    const G = K.grp(x, y, z, 0, parent), pm = std({ color: pot, roughness: pot === '#A65A3A' ? 0.85 : 0.25 });
    K.cyl(0.19 * s, 0.14 * s, h * s, pm, 0, 0, 0, { parent: G, seg: 24 }); K.cyl(0.2 * s, 0.2 * s, 0.03 * s, pm, 0, h * s - 0.03 * s, 0, { parent: G, seg: 24 });
    K.cyl(0.18 * s, 0.18 * s, 0.01, M.soil, 0, h * s - 0.02 * s, 0, { parent: G, shadow: false });
    if (kind === 'fern') K.prop('fern', 0.03 * s, h * s - 0.04, -0.02 * s, { s: s * 0.85, parts: ['fern_02_b'], parent: G });
    else K.prop('shrub', 0, h * s - 0.05, 0, { s: s * 0.45, parent: G });
    K.blob(x, z, 0.6 * s, 0.6 * s, 0.4, 0, 0.004, parent); return G;
  };

  // a window in a wall: the opening (w x h, its sill at y), its frame, mullions, the reveal, the glass, blinds or
  // curtains; behind it the city in layers at their depths (city: { seed, tone, high }), bright enough to bloom by day;
  // its daylight an area light into the room (K.rects, sets.js)
  K.window = ({ x = 0, z, y = 0.9, w = 1.6, h = 1.6, ry = 0, view: v = null, city = true, blinds = 0, frameM = M.white, mullions = 1, out = 3.5, curtains = null, light = 1, reveal = null, sill = true } = {}) => {
    const G = K.grp(x, 0, z, ry);
    const ft = 0.06; for (const s of [-1, 1]) K.box(ft, h, 0.12, frameM, s * (w / 2 + ft / 2), y, 0, { parent: G }); K.box(w + 2 * ft, ft, 0.12, frameM, 0, y + h, 0, { parent: G });
    for (let i = 1; i <= mullions; i++) K.box(0.035, h, 0.05, frameM, -w / 2 + (i * w) / (mullions + 1), y, -0.02, { parent: G });
    K.box(w, 0.035, 0.05, frameM, 0, y + h * 0.62, -0.02, { parent: G });
    // (the reveal: the wall's thickness round the opening, and a sill board inside)
    const rv = reveal || frameM; for (const s of [-1, 1]) K.box(0.03, h, 0.24, rv, s * (w / 2 + ft + 0.015), y, -0.1, { parent: G, shadow: false }); K.box(w + 2 * ft + 0.06, 0.03, 0.24, rv, 0, y + h + ft, -0.1, { parent: G, shadow: false });
    if (sill) K.box(w + 0.3, 0.035, 0.2, frameM, 0, y - ft - 0.035, 0.06, { parent: G });
    if (v && !city) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w * 4.2, (w * 4.2) / 2), new THREE.MeshBasicMaterial({ map: tex(v) })); p.position.set(0, y + h * 0.45, -out); G.add(p); }
    if (city) {
      const o = city === true ? {} : city, seed = o.seed || 31, mood = { night, golden }, cy = y + h / 2;
      // (each layer wide enough to fill the opening from wherever the lens is: a 120-degree fan through it)
      const layer = (kind, D, k, opts = {}) => {
        const W = w + 3.6 * D, H = W / 2, t = cityLayer(kind, { ...mood, seed: seed + D, tone: kind === 'near' ? o.tone : null });
        const col = night ? new THREE.Color(1, 1, 1) : new THREE.Color(k, k, k * 1.02);
        const p = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: t, color: col, transparent: kind !== 'sky', depthWrite: kind === 'sky', fog: false }));
        p.position.set(0, cy + (opts.dy || 0) * H, -D); p.renderOrder = -10 + D * 0.001; G.add(p); return p;
      };
      layer('sky', out * 18, 1.7, { dy: o.high ? -0.05 : 0.18 });
      layer('far', out * 9, 1.3, { dy: o.high ? 0.0 : 0.12 });
      layer('mid', out * 3.6, 1.12, { dy: o.high ? -0.08 : 0.16 });
      if (!o.high) layer('near', out, 1.0, { dy: 0.12 });
    }
    // the glass: clear, faintly catching the room
    { const gm = std({ color: '#E4EEF6', roughness: 0.03, metalness: 0.1, transparent: true, opacity: 0.07, depthWrite: false }); gm.envMapIntensity = 1.6; const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), gm); p.position.set(0, y + h / 2, -0.03); G.add(p); }
    if (blinds > 0) { const n = Math.round((h * blinds) / 0.045), bm = std({ color: '#C9C0AA', roughness: 0.55, side: THREE.DoubleSide }); for (let i = 0; i < n; i++) { const s = K.box(w + 0.04, 0.003, 0.038, bm, 0, y + h - 0.05 - i * 0.045, 0.08, { parent: G }); s.rotation.x = 0.35; } K.box(w + 0.08, 0.05, 0.06, bm, 0, y + h + 0.01, 0.08, { parent: G }); for (const s of [-0.3, 0.3]) K.cyl(0.002, 0.002, h * blinds, bm, s * w, y + h - h * blinds, 0.1, { parent: G, shadow: false }); }
    if (curtains) {
      const cm = std({ color: curtains, roughness: 0.95, side: THREE.DoubleSide });
      for (const s of [-1, 1]) for (let i = 0; i < 5; i++) { const f = K.cyl(0.045, 0.055, h + 0.5, cm, s * (w / 2 + 0.08 + i * 0.07), Math.max(0, y - 0.35), 0.16 + (i % 2) * 0.035, { parent: G, seg: 10 }); f.scale.z = 0.7; }
      K.cyl(0.015, 0.015, w + 0.9, M.brass, 0, y + h + 0.18, 0.18, { parent: G, rz: PI / 2 });
    }
    if (light) { G.updateMatrixWorld(true); const c = G.localToWorld(new THREE.Vector3(0, y + h / 2, 0.02)), n = G.localToWorld(new THREE.Vector3(0, y + h / 2, 1.02)); K.rects.push({ at: c.toArray(), to: n.toArray(), w, h, k: light }); }
    return G;
  };
  // a room's shell: floor, ceiling (its light panels), four walls with openings for the windows and doors (holes:
  // [{ wall: 'back' | 'front' | 'left' | 'right', x (along it), y, w, h }]), a skirting board, a crown moulding, a dado
  // rail or panelling; the soft dark of its corners (where the floor and the ceiling meet the walls)
  K.room = ({ w, d, h, floor, wall, wallBack = wall, ceiling = M.white, holes = [], skirting = M.offwhite, wainscot = null, panels = true, lightsAt = null, crown = undefined, ao = 0.38 }) => {
    K.plane(w, d, floor, 0, 0, 0, { rx: -PI / 2, ox: -w / 2, oy: -d / 2 });
    K.plane(w, d, ceiling, 0, h, 0, { rx: PI / 2 });
    const walls = { back: [w, 0, -d / 2, 0], front: [w, 0, d / 2, PI], left: [d, -w / 2, 0, PI / 2], right: [d, w / 2, 0, -PI / 2] };
    const aoM = ao ? new THREE.MeshBasicMaterial({ color: '#000000', alphaMap: gradTex(), transparent: true, opacity: ao, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }) : null;
    const crownM = crown === undefined ? skirting : crown;
    for (const [name, [len, x, z, ry]] of Object.entries(walls)) {
      const m = name === 'back' ? wallBack : wall, G = K.grp(x, 0, z, ry), hs = holes.filter((o) => o.wall === name).sort((a, b) => a.x - b.x);
      // (the wall in strips round its openings, its surface continuous across them)
      const strip = (sw, sh, cx, cy) => K.plane(sw, sh, m, cx, cy, 0, { parent: G, ox: cx - sw / 2 + len / 2, oy: cy - sh / 2 });
      let at = -len / 2;
      for (const o of hs) {
        const a = o.x - o.w / 2, b = o.x + o.w / 2;
        if (a > at) strip(a - at, h, (at + a) / 2, h / 2);
        if (o.y > 0) strip(o.w, o.y, o.x, o.y / 2);
        if (o.y + o.h < h) strip(o.w, h - o.y - o.h, o.x, (o.y + o.h + h) / 2);
        at = b;
      }
      if (at < len / 2) strip(len / 2 - at, h, (at + len / 2) / 2, h / 2);
      if (skirting) { K.box(len, 0.12, 0.018, skirting, 0, 0, 0.009, { parent: G, shadow: false }); K.box(len, 0.012, 0.026, skirting, 0, 0.12, 0.013, { parent: G, shadow: false }); }
      if (crownM) { K.box(len, 0.07, 0.05, crownM, 0, h - 0.07, 0.025, { parent: G, shadow: false }); K.box(len, 0.03, 0.08, crownM, 0, h - 0.03, 0.04, { parent: G, shadow: false }); }
      if (wainscot) K.box(len, 0.035, 0.03, wainscot, 0, 0.9, 0.015, { parent: G, shadow: false });
      if (aoM) {
        const lo = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.55), aoM); lo.position.set(0, 0.275, 0.004); lo.renderOrder = 1; G.add(lo);
        const hi = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.45), aoM); hi.position.set(0, h - 0.225, 0.004); hi.rotation.z = PI; hi.renderOrder = 1; G.add(hi);
        const fl = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.5), aoM); fl.rotation.set(-PI / 2, 0, PI); fl.position.set(0, 0.003, 0.25); fl.renderOrder = 1; G.add(fl);
        // (the corners' own dark, up both ends of the wall)
        for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.PlaneGeometry(h, 0.4), aoM); c.rotation.z = -s * PI / 2; c.position.set(s * (len / 2 - 0.2), h / 2, 0.005); c.renderOrder = 1; G.add(c); }
      }
    }
    if (panels) for (const [px, pz] of lightsAt || [[-w / 4, -d / 4], [w / 4, -d / 4], [-w / 4, d / 4], [w / 4, d / 4]]) { K.box(0.6, 0.02, 0.6, M.panel, px, h - 0.02, pz, { shadow: false }); K.box(0.66, 0.012, 0.66, M.offwhite, px, h - 0.012, pz, { shadow: false }); }
  };

  /* ---------------------------------------------------------- exteriors -- */
  // a city block round a square: a box with its facade (one bay of one floor tiled over it, 3 m by 3.3 m), a cornice,
  // a ground floor of shopfronts with their awnings (no names), a water tank on the roof now and then
  K.block = (x, z, w, d, h, { ry = 0, style = 'brick', seed = 5, tone = null, shop = true, tank = false } = {}) => {
    const G = K.grp(x, 0, z, ry), fm = new THREE.MeshStandardMaterial({ map: facade(style, { night, seed, tone }), roughness: 0.85 });
    if (night) { fm.emissiveMap = fm.map; fm.emissive = new THREE.Color('#FFFFFF'); fm.emissiveIntensity = 0.35; }
    const body = K.box(w, h - 4, d, fm, 0, 4, 0, { parent: G, tile: [3, 3.3], shadow: false }); body.castShadow = true;
    const base = std({ color: style === 'glass' ? '#2E353C' : shade(tone || '#8C7C6A', 0.7), roughness: 0.6 });
    K.box(w, 4, d, base, 0, 0, 0, { parent: G });
    K.box(w + 0.5, 0.45, d + 0.5, std({ color: night ? '#1A1814' : '#CFC6B4', roughness: 0.7 }), 0, h, 0, { parent: G });
    K.box(w + 0.2, 0.3, d + 0.2, std({ color: night ? '#12100E' : '#D8D0C0', roughness: 0.7 }), 0, 4, 0, { parent: G });
    if (shop) {
      const r = rng(seed + 9), glassM = std({ color: night ? '#FFE0B0' : '#46596C', roughness: 0.05, metalness: 0.65, emissive: night ? '#FFC880' : '#000000', emissiveIntensity: night ? 0.9 : 0 });
      const n = Math.max(1, Math.floor(w / 6));
      for (let i = 0; i < n; i++) {
        const sx = -w / 2 + (i + 0.5) * (w / n), sw = (w / n) * 0.78;
        K.box(sw, 2.9, 0.05, glassM, sx, 0.4, d / 2 + 0.02, { parent: G, shadow: false });
        const aw = std({ color: ['#2B5E3B', '#7A1F1F', '#1F3A5F', '#4A4A4A', '#8C5A1F'][Math.floor(r() * 5)], roughness: 0.8, side: THREE.DoubleSide });
        const a = K.box(sw + 0.3, 0.06, 1.3, aw, sx, 3.35, d / 2 + 0.65, { parent: G }); a.rotation.x = 0.28;
      }
    }
    if (tank) { const tm = std({ color: night ? '#141210' : '#6E5644', roughness: 0.9 }); K.cyl(1.4, 1.4, 2.6, tm, w * 0.2, h + 2.4, -d * 0.1, { parent: G, seg: 16 }); K.cyl(0.2, 1.55, 1.0, tm, w * 0.2, h + 5.0, -d * 0.1, { parent: G, seg: 16 }); for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.box(0.12, 2.4, 0.12, M.black, w * 0.2 + a * 1.0, h + 0.4, -d * 0.1 + b * 1.0, { parent: G }); }
    return G;
  };
  // the city beyond an exterior: a sky (a dome, its gradient and clouds), a ring of the near towers and one of the far
  // ones in their haze, all round at their distances (the blocks round the square stand in front of them)
  K.cityRing = ({ R = 70, seed = 41 } = {}) => {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(R * 4, 32, 16), new THREE.MeshBasicMaterial({ map: cityLayer('sky', { night, golden, seed }), side: THREE.BackSide, color: night ? new THREE.Color(1, 1, 1) : new THREE.Color(1.5, 1.5, 1.52), depthWrite: false, fog: false }));
    sky.renderOrder = -20; group.add(sky);
    for (const [kind, rad, k, ht, rep] of [['far', R * 2.2, 1.35, R * 1.1, 3], ['mid', R * 1.35, 1.12, R * 0.62, 4]]) {
      const t = cityLayer(kind, { night, golden, seed: seed + rad | 0 }).clone(); t.repeat.set(rep, 1); t.wrapS = THREE.RepeatWrapping; t.needsUpdate = true;
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, ht, 64, 1, true), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.BackSide, color: night ? new THREE.Color(1, 1, 1) : new THREE.Color(k, k, k), depthWrite: false, fog: false }));
      ring.position.y = ht / 2 - 2; ring.renderOrder = -15 + (kind === 'mid' ? 1 : 0); group.add(ring);
    }
  };
  return K;
}

