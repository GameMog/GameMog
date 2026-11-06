// Mog City story runner: the set kit. The rooms and closed exteriors a world's cutscenes are staged in (sets.js), built
// the way Mr. Big's study is built (wagmi/mission/mrbig.js): a little scene of its own, out of boxes, rounded boxes and
// cylinders, its surfaces drawn into canvases here (plank floors, carpet, terrazzo tiles, brick, concrete, marble),
// a painted view through its windows (the city by day, at golden hour or at night), lit by its own lights.
//   const K = kit(scene, { night, golden });  K.box(...)  K.mat.wood ...  K.window(...)  K.room(...)
//   ROOMS[name](K) -> { size: [w, d, h], marks: { name: [x, z, deg] }, sun, ceiling }   (sets.js stages people in them)
// Coordinates: metres, the floor at y 0, the room's middle at x 0 z 0, its back wall (usually the windows) at -z, the
// front wall (behind a camera looking in) at +z. Nothing here is a real place, brand or person.
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const PI = Math.PI;
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
// a blob of soft shadow under someone's feet (the light's shadow does the rest)
let BLOB = null;
export function blobTexture() {
  if (BLOB) return BLOB; const [c, x] = canvas(128, 128); const g = x.createRadialGradient(64, 64, 4, 64, 64, 62); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  BLOB = new THREE.CanvasTexture(c); return BLOB;
}

/* ----------------------------------------------------------------- kit -- */
export function kit(scene, { night = false, golden = false } = {}) {
  const group = new THREE.Group(); group.name = 'set'; scene.add(group);
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, ...o });
  const surf = (c, rep, o = {}) => std({ map: tex(c, rep), ...o });
  const K = {
    group, night, golden, PI, rng, std, surf, tex, shade,
    // a box (w, h, d) standing on y (its bottom), centred on x z: most of the furniture
    box(w, h, d, m, x, y, z, { parent = group, ry = 0, r = 0, shadow = true } = {}) {
      const g = r ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d);
      const b = new THREE.Mesh(g, m); b.position.set(x, y + h / 2, z); b.rotation.y = ry; b.castShadow = shadow; b.receiveShadow = true; parent.add(b); return b;
    },
    cyl(rt, rb, h, m, x, y, z, { parent = group, seg = 20, rx = 0, rz = 0, shadow = true } = {}) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); c.position.set(x, y + h / 2, z); c.rotation.x = rx; c.rotation.z = rz; c.castShadow = shadow; c.receiveShadow = true; parent.add(c); return c;
    },
    plane(w, h, m, x, y, z, { parent = group, rx = 0, ry = 0 } = {}) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(x, y, z); p.rotation.set(rx, ry, 0); p.receiveShadow = true; parent.add(p); return p; },
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
  // a window in a wall: the opening (w x h, its sill at y), a frame and mullions, the city painted behind it, blinds
  // (k: how far down, 0 up .. 1 shut; slats that cast the sun in stripes)
  K.window = ({ x = 0, z, y = 0.9, w = 1.6, h = 1.6, ry = 0, view: v = null, blinds = 0, frameM = M.white, mullions = 1, out = 3.5 } = {}) => {
    const G = K.grp(x, 0, z, ry);
    const ft = 0.06; for (const s of [-1, 1]) K.box(ft, h, 0.12, frameM, s * (w / 2 + ft / 2), y, 0, { parent: G }); K.box(w + 2 * ft, ft, 0.14, frameM, 0, y - ft, 0.02, { parent: G }); K.box(w + 2 * ft, ft, 0.12, frameM, 0, y + h, 0, { parent: G });
    for (let i = 1; i <= mullions; i++) K.box(0.035, h, 0.06, frameM, -w / 2 + (i * w) / (mullions + 1), y, 0, { parent: G });
    K.box(w, 0.035, 0.06, frameM, 0, y + h * 0.62, 0, { parent: G });
    if (v) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w * 4.2, (w * 4.2) / 2), new THREE.MeshBasicMaterial({ map: tex(v), toneMapped: true })); p.position.set(0, y + h * 0.45, -out); G.add(p); }
    if (blinds > 0) { const n = Math.round((h * blinds) / 0.045), bm = std({ color: '#ADA38D', roughness: 0.6, side: THREE.DoubleSide }); for (let i = 0; i < n; i++) { const s = K.box(w + 0.04, 0.003, 0.038, bm, 0, y + h - 0.05 - i * 0.045, 0.08, { parent: G }); s.rotation.x = 0.35; } K.box(w + 0.08, 0.05, 0.06, bm, 0, y + h + 0.01, 0.08, { parent: G }); }
    return G;
  };
  // a room's shell: floor, ceiling (its light panels), four walls with openings for the windows and doors (holes:
  // [{ wall: 'back' | 'front' | 'left' | 'right', x (along it), y, w, h }]), a skirting board, a dado rail or panelling
  K.room = ({ w, d, h, floor, wall, wallBack = wall, ceiling = M.white, holes = [], skirting = M.offwhite, wainscot = null, panels = true, lightsAt = null }) => {
    K.plane(w, d, floor, 0, 0, 0, { rx: -PI / 2 });
    K.plane(w, d, ceiling, 0, h, 0, { rx: PI / 2 });
    const walls = { back: [w, 0, -d / 2, 0], front: [w, 0, d / 2, PI], left: [d, -w / 2, 0, PI / 2], right: [d, w / 2, 0, -PI / 2] };
    for (const [name, [len, x, z, ry]] of Object.entries(walls)) {
      const m = name === 'back' ? wallBack : wall, G = K.grp(x, 0, z, ry), hs = holes.filter((o) => o.wall === name).sort((a, b) => a.x - b.x);
      // (the wall in strips round its openings)
      let at = -len / 2;
      for (const o of hs) {
        const a = o.x - o.w / 2, b = o.x + o.w / 2;
        if (a > at) K.plane(a - at, h, m, (at + a) / 2, h / 2, 0, { parent: G });
        if (o.y > 0) K.plane(o.w, o.y, m, o.x, o.y / 2, 0, { parent: G });
        if (o.y + o.h < h) K.plane(o.w, h - o.y - o.h, m, o.x, (o.y + o.h + h) / 2, 0, { parent: G });
        at = b;
      }
      if (at < len / 2) K.plane(len / 2 - at, h, m, (at + len / 2) / 2, h / 2, 0, { parent: G });
      if (skirting) K.box(len, 0.1, 0.018, skirting, 0, 0, 0.009, { parent: G, shadow: false });
      if (wainscot) K.box(len, 0.035, 0.03, wainscot, 0, 0.9, 0.015, { parent: G, shadow: false });
    }
    if (panels) for (const [px, pz] of lightsAt || [[-w / 4, -d / 4], [w / 4, -d / 4], [-w / 4, d / 4], [w / 4, d / 4]]) K.box(0.6, 0.02, 0.6, M.panel, px, h - 0.02, pz, { shadow: false });
  };
  return K;
}
