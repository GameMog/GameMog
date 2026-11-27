// Mog City story runner: a story's diner, dressed as one. A world's place named a diner ("the Copper Spur diner", an
// alias in its `places`) is a library place on the town's map (a restaurant's point) in whatever building stands there:
// a Hometown town's three-storey brick block or a strip mall's box, its ground floor a row of plain windows. Its street
// front is dressed as a diner's: a stainless skirt and a band of big windows, the booths, the counter and its stools,
// the pendant lamps seen through them, a glass door, a striped awning over the windows and the place's own name in neon
// tubes over the awning (no maker's, chain's or real diner's name: the world's own words). Nothing here moves or
// collides; it is only the front, out from the wall by a few centimetres (the awning 1.3 m, over head height).
//   createFronts(W, world, places) -> { fronts: [{ key, name, x, z, w }], group, update(dt) } | null (no diner in the
//   world); update(dt) each frame builds a front whose building wasn't there yet
//   dinerSign(name) -> [main line, second line]   (pure: the sign's words from the place's name)
import * as THREE from 'three/webgpu';
import { world as cityWorld } from '../world/index.js';

const DINER = /\bdiner\b/i;
// the sign's words: the place's name without its article, the trade on a line of its own ("COPPER SPUR" / "DINER")
export function dinerSign(name) {
  const s = String(name || '').replace(/^\s*(the|a|an)\s+/i, '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!s) return ['DINER', ''];
  const m = s.match(/^(.*?)\s*\bDINER\b\s*(.*)$/);
  const main = m ? `${m[1]} ${m[2]}`.trim() : s;
  return main ? [main.slice(0, 22), 'DINER'] : ['DINER', ''];
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, srgb = true) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
const rng = (seed) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const hashS = (s) => { let h = 2166136261; for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); } return h >>> 0; };

// the room through the windows, painted as it is seen from the sidewalk (the window's sill at hip height): the booths
// along the glass (high red vinyl backs, chrome-edged tables with a napkin box, a ketchup bottle, a coffee cup), beyond
// them the counter's red front and chrome rail, the pies under their domes, the cream and teal tiled back wall with its
// menu boards and clock, and pendant lamps pooling warm light over each booth
function interior(wm, seed) {
  const W = 2048, H = 512, [c, x] = canvas(W, H), r = rng(seed);
  // (the back wall: cream tiles over a teal band, menu boards, a clock)
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#f6ebcd'); g.addColorStop(1, '#e2cc9c');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(120,100,70,0.16)'; x.lineWidth = 1;
  for (let yy = 0; yy < H * 0.5; yy += 14) { x.beginPath(); x.moveTo(0, yy); x.lineTo(W, yy); x.stroke(); }
  for (let xx = 0; xx < W; xx += 14) { x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx, H * 0.5); x.stroke(); }
  x.fillStyle = '#2f8a86'; x.fillRect(0, H * 0.36, W, 14);
  const boards = Math.max(1, Math.round(wm / 5));
  for (let k = 0; k < boards; k++) {
    const bx = ((k + 0.5) / boards) * W - 120;
    x.fillStyle = '#1e1b18'; x.fillRect(bx, 30, 240, 90); x.strokeStyle = '#b8b2a4'; x.lineWidth = 5; x.strokeRect(bx, 30, 240, 90);
    x.fillStyle = '#f0ead8'; x.font = '700 22px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(['BREAKFAST ALL DAY', 'PIE & COFFEE', 'BURGERS · SHAKES', 'DAILY SPECIAL'][k % 4], bx + 120, 58);
    x.fillStyle = '#cfc6b0'; for (let l = 0; l < 2; l++) x.fillRect(bx + 36, 80 + l * 16, 168 - l * 50, 5);
  }
  // (the counter: a red front under a chrome rail, pies under domes and a coffee urn on it)
  const cy = H * 0.42;
  x.fillStyle = '#9e1f24'; x.fillRect(0, cy, W, 64); x.fillStyle = '#e1e5e8'; x.fillRect(0, cy - 6, W, 8); x.fillRect(0, cy + 58, W, 5);
  for (let xx = 80; xx < W; xx += 300 + r() * 140) { x.fillStyle = 'rgba(232,242,247,0.6)'; x.beginPath(); x.ellipse(xx, cy - 18, 30, 20, 0, Math.PI, 0); x.fill(); x.fillStyle = '#c88a3a'; x.fillRect(xx - 22, cy - 12, 44, 7); }
  // (the booths along the glass: their backs high in the lower half of the window, a table between each pair)
  const n = Math.max(2, Math.round(wm / 2.2)), bw = W / n, by = H * 0.52;
  for (let k = 0; k < n; k++) {
    const bx = k * bw;
    for (const sx of [bx + 4, bx + bw - 46]) {
      x.fillStyle = '#8e1a20'; x.fillRect(sx, by, 42, H - by);
      x.fillStyle = '#cf2f35'; x.fillRect(sx + 4, by + 4, 34, H - by - 4);
      x.fillStyle = 'rgba(255,255,255,0.22)'; x.fillRect(sx + 8, by + 8, 6, H - by - 16);
      x.fillStyle = '#e1e5e8'; x.fillRect(sx, by - 4, 42, 6);
    }
    const ty = H * 0.68;
    x.fillStyle = '#efe9da'; x.fillRect(bx + 50, ty, bw - 100, 16); x.fillStyle = '#c9ced2'; x.fillRect(bx + 50, ty + 14, bw - 100, 6);
    x.fillStyle = '#7d8287'; x.fillRect(bx + bw / 2 - 5, ty + 20, 10, H - ty);
    x.fillStyle = '#d32f2f'; x.fillRect(bx + bw / 2 - 34, ty - 30, 11, 30); x.fillStyle = '#f2f2f2'; x.fillRect(bx + bw / 2 - 32, ty - 34, 7, 5);
    x.fillStyle = '#c0c4c8'; x.fillRect(bx + bw / 2 + 2, ty - 18, 26, 18);
    x.fillStyle = '#fbf7ee'; x.fillRect(bx + bw / 2 + 40, ty - 14, 18, 14); x.fillStyle = '#5a3a22'; x.fillRect(bx + bw / 2 + 42, ty - 13, 14, 4);
    if (r() < 0.55) { x.fillStyle = '#f4f1ea'; x.beginPath(); x.ellipse(bx + 90, ty - 2, 24, 6, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = '#c98b3c'; x.beginPath(); x.ellipse(bx + 90, ty - 6, 14, 5, 0, 0, Math.PI * 2); x.fill(); }
  }
  // (pendant lamps over the booths, their warm pools)
  for (let k = 0; k < n; k++) {
    const lx = (k + 0.5) * bw;
    x.strokeStyle = '#2a2a2a'; x.lineWidth = 3; x.beginPath(); x.moveTo(lx, 0); x.lineTo(lx, H * 0.14); x.stroke();
    x.fillStyle = '#2b6e6a'; x.beginPath(); x.moveTo(lx - 28, H * 0.2); x.lineTo(lx + 28, H * 0.2); x.lineTo(lx + 12, H * 0.14); x.lineTo(lx - 12, H * 0.14); x.fill();
    x.fillStyle = '#fff3c8'; x.beginPath(); x.ellipse(lx, H * 0.2, 16, 4, 0, 0, Math.PI * 2); x.fill();
    const lg = x.createRadialGradient(lx, H * 0.24, 4, lx, H * 0.5, 240); lg.addColorStop(0, 'rgba(255,224,150,0.5)'); lg.addColorStop(1, 'rgba(255,224,150,0)');
    x.fillStyle = lg; x.fillRect(lx - 240, 0, 480, H);
  }
  return c;
}

// the neon: the name in glowing tubes on a dark board with a chrome rim (two lines: the name, the trade smaller)
function neon([main, sub], seed) {
  const W = 1024, H = 320, [c, x] = canvas(W, H), r = rng(seed);
  const pal = [['#ff3d6e', '#38e8ff'], ['#ff5a36', '#ffe066'], ['#3dffb0', '#ff3d6e'], ['#ffd23d', '#ff4a5a']][Math.floor(r() * 4)];
  x.fillStyle = '#121518'; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#c9cfd4'; x.lineWidth = 14; x.strokeRect(7, 7, W - 14, H - 14);
  x.strokeStyle = '#6b7279'; x.lineWidth = 3; x.strokeRect(20, 20, W - 40, H - 40);
  const tube = (text, y, size, col, style) => {
    let px = size; x.font = `${style} ${px}px Georgia, 'Times New Roman', serif`;
    while (px > 30 && x.measureText(text).width > W - 120) { px -= 4; x.font = `${style} ${px}px Georgia, 'Times New Roman', serif`; }
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    // (the glow, the tube, its hot white core)
    x.shadowColor = col; x.shadowBlur = 34; x.strokeStyle = col; x.lineWidth = Math.max(6, px * 0.09); x.strokeText(text, W / 2, y);
    x.shadowBlur = 12; x.lineWidth = Math.max(3, px * 0.05); x.strokeText(text, W / 2, y);
    x.shadowBlur = 0; x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = Math.max(1.5, px * 0.018); x.strokeText(text, W / 2, y);
  };
  if (sub) { tube(main, H * 0.4, 130, pal[0], 'italic 700'); tube(sub, H * 0.78, 74, pal[1], '700'); }
  else tube(main, H * 0.52, 150, pal[0], 'italic 700');
  return c;
}

// the awning's canvas: red and cream stripes, a scalloped valance along its foot
function awningCloth(seed) {
  const W = 512, H = 256, [c, x] = canvas(W, H), r = rng(seed);
  const [a, b] = [['#b3202a', '#f1e8d6'], ['#1f5f5a', '#f1e8d6'], ['#c23a22', '#f4ead2']][Math.floor(r() * 3)];
  const n = 16;
  for (let k = 0; k < n; k++) { x.fillStyle = k % 2 ? b : a; x.fillRect((k / n) * W, 0, W / n + 1, H); }
  const sh = x.createLinearGradient(0, 0, 0, H); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.18)'); x.fillStyle = sh; x.fillRect(0, 0, W, H);
  return c;
}

// the street face of the building standing at (cx, cz), the one toward (x, z): { ax, az (along it), nx, nz (out of
// it), ox, oz (its middle), len, t (how far along it (x, z) is), base, top } or null
function faceOf(cx, cz, x, z) {
  const cs = cityWorld.queryColliders?.({ x: cx, z: cz, r: 8 }) || [];
  let best = null;
  // (the building's own: the one (cx, cz) is in, or the nearest within 6 m (a place's point at its footprint's middle,
  // between the masses its walls are drawn as))
  const distTo = (pts) => {
    let inside = false, d = Infinity;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, zi] = pts[i], [xj, zj] = pts[j];
      if ((zi > cz) !== (zj > cz) && cx < ((xj - xi) * (cz - zi)) / (zj - zi) + xi) inside = !inside;
      const ex = xj - xi, ez = zj - zi, ll = ex * ex + ez * ez, t = ll ? Math.max(0, Math.min(1, ((cx - xi) * ex + (cz - zi) * ez) / ll)) : 0;
      d = Math.min(d, Math.hypot(xi + ex * t - cx, zi + ez * t - cz));
    }
    return inside ? 0 : d;
  };
  const shapes = [];
  for (const c of cs) {
    if (c.carOnly || !(c.maxY - (c.minY ?? 0) > 3.5)) continue;
    let pts = null;
    if (c.polygon && c.polygon.length >= 3) pts = c.polygon.map((p) => [p.x, p.z]);
    else if (c.obb) { const o = c.obb, ux = [o.cs, -o.sn], uz = [o.sn, o.cs]; pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [o.cx + ux[0] * a * o.hx + uz[0] * b * o.hz, o.cz + ux[1] * a * o.hx + uz[1] * b * o.hz]); }
    else pts = [[c.minX, c.minZ], [c.maxX, c.minZ], [c.maxX, c.maxZ], [c.minX, c.maxZ]];
    const d = distTo(pts);
    if (d < 6) shapes.push({ c, pts, d });
  }
  shapes.sort((a, b) => a.d - b.d);
  for (const { c, pts, d: dd } of shapes) {
    if (dd > shapes[0].d + 0.5) break;
    let mx = 0, mz = 0; for (const p of pts) { mx += p[0]; mz += p[1]; } mx /= pts.length; mz /= pts.length;
    for (let i = 0; i < pts.length; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length], len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 6) continue;
      const ax = (x1 - x0) / len, az = (z1 - z0) / len;
      let nx = az, nz = -ax;
      const ox = (x0 + x1) / 2, oz = (z0 + z1) / 2;
      if ((ox - mx) * nx + (oz - mz) * nz < 0) { nx = -nx; nz = -nz; }
      // (the face the place's street point is in front of, the nearest such)
      const t = (x - x0) * ax + (z - z0) * az, d = (x - ox) * nx + (z - oz) * nz;
      if (d <= 0.5) continue;
      const off = Math.max(0, -t, t - len), score = d + off * 2;
      if (!best || score < best.score) best = { score, ax, az, nx, nz, ox, oz, len, t: Math.max(0, Math.min(len, t)), base: c.minY ?? 0, top: c.maxY };
    }
  }
  return best;
}

export function createFronts(W, world, places) {
  const aliases = (world && world.places) || {};
  const want = Object.keys(aliases).filter((k) => DINER.test(String(aliases[k]?.name || '')));
  if (!want.length) return null;
  const group = new THREE.Group(); group.name = 'storyrun-fronts'; W.app.scene.add(group);
  const ground = (x, z) => { try { const y = W.app.controllerManager.getGroundHeight(x, z, 'person'); return Number.isFinite(y) ? y : 0; } catch { return 0; } };
  const out = { fronts: [], group };
  const M = {
    chrome: new THREE.MeshStandardMaterial({ color: 0xdfe3e6, metalness: 0.92, roughness: 0.22 }),
    enamel: new THREE.MeshStandardMaterial({ color: 0xb3262c, metalness: 0.1, roughness: 0.38 }),
    cream: new THREE.MeshStandardMaterial({ color: 0xefe6cf, metalness: 0.05, roughness: 0.55 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fb8c4, metalness: 0.2, roughness: 0.04, transparent: true, opacity: 0.22, depthWrite: false }),
  };
  const done = new Set();
  // (its building's walls are the town's colliders, there once its tiles are: tried now, then every 2 s while the place
  // is still waiting for them, up to 5 minutes)
  let pending = want.slice(), wait = 0, tries = 0;
  const build = (key) => {
    try {
      const p = places.at(key);
      if (!p) return true;
      const cx = p.cx ?? p.x, cz = p.cz ?? p.z, id = `${Math.round(cx)},${Math.round(cz)}`;
      if (done.has(id)) return true;
      const f = faceOf(cx, cz, p.x, p.z);
      if (!f) return false;
      done.add(id);
      const seed = hashS(String(aliases[key].name || key));
      // (the front: up to 14 m of the face, round the place's point along it, a metre clear of each corner)
      const w = Math.min(14, f.len - 2), mid = Math.max(1 + w / 2, Math.min(f.len - 1 - w / 2, f.t));
      const sx = f.ox + f.ax * (mid - f.len / 2), sz = f.oz + f.az * (mid - f.len / 2);
      const y0 = Math.min(ground(sx + f.nx * 1.2, sz + f.nz * 1.2), ground(sx, sz));
      const g = new THREE.Group(); g.name = 'diner-front:' + key;
      // (its frame: x along the face, y up, z out of it)
      g.position.set(sx, y0, sz); g.rotation.y = Math.atan2(f.nx, f.nz); group.add(g);
      const box = (bw, bh, bd, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
      const doorW = 1.1, winW = w - doorW - 0.3, wx = -w / 2 + winW / 2;
      // the stainless skirt, ribbed
      box(w, 0.85, 0.08, M.chrome, 0, 0.425, 0.04);
      for (const yy of [0.25, 0.5, 0.72]) box(w, 0.035, 0.03, M.chrome, 0, yy, 0.09);
      // the windows: the room behind, the glass over it, chrome mullions
      const room = tex(interior(winW, seed));
      const rm = new THREE.MeshBasicMaterial({ map: room, color: 0xe4ddd0 });
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(winW, 1.75), rm); pane.position.set(wx, 0.85 + 0.875, 0.05); g.add(pane);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(winW, 1.75), M.glass); gl.position.set(wx, 0.85 + 0.875, 0.075); g.add(gl);
      const nm = Math.max(2, Math.round(winW / 2.4));
      for (let k = 0; k <= nm; k++) box(0.07, 1.8, 0.08, M.chrome, -w / 2 + (k / nm) * winW, 1.725, 0.09);
      box(winW + 0.07, 0.07, 0.1, M.chrome, wx, 0.86, 0.1); box(winW + 0.07, 0.07, 0.1, M.chrome, wx, 2.6, 0.1);
      // the door: glass in a chrome frame, the room behind, a push bar; a step
      const dx = w / 2 - doorW / 2 - 0.15;
      const dp = new THREE.Mesh(new THREE.PlaneGeometry(doorW - 0.12, 2.15), rm); dp.position.set(dx, 1.12, 0.05); g.add(dp);
      const dg = new THREE.Mesh(new THREE.PlaneGeometry(doorW - 0.12, 2.15), M.glass); dg.position.set(dx, 1.12, 0.075); g.add(dg);
      box(0.08, 2.3, 0.1, M.chrome, dx - doorW / 2, 1.15, 0.09); box(0.08, 2.3, 0.1, M.chrome, dx + doorW / 2, 1.15, 0.09); box(doorW + 0.08, 0.08, 0.1, M.chrome, dx, 2.27, 0.09);
      box(doorW * 0.7, 0.05, 0.06, M.chrome, dx, 1.05, 0.14);
      box(doorW + 0.6, 0.12, 0.5, M.cream, dx, 0.06, 0.25);
      // the fascia over them: red enamel between chrome bands
      box(w, 0.55, 0.12, M.enamel, 0, 2.95, 0.06); box(w, 0.06, 0.16, M.chrome, 0, 2.67, 0.08); box(w, 0.06, 0.16, M.chrome, 0, 3.23, 0.08);
      // the awning over the windows: striped canvas sloping out 1.3 m, its valance, chrome arms
      const cloth = tex(awningCloth(seed)); cloth.wrapS = THREE.RepeatWrapping; cloth.repeat.set(Math.max(1, winW / 4), 1);
      const am = new THREE.MeshStandardMaterial({ map: cloth, roughness: 0.85, side: THREE.DoubleSide });
      const slope = new THREE.Mesh(new THREE.PlaneGeometry(winW, 1.42), am); slope.position.set(wx, 2.42, 0.62); slope.rotation.x = -(Math.PI / 2 - 0.42); slope.castShadow = true; g.add(slope);
      const val = new THREE.Mesh(new THREE.PlaneGeometry(winW, 0.24), am); val.position.set(wx, 2.04, 1.26); val.castShadow = true; g.add(val);
      for (const ex of [-w / 2 + 0.05, -w / 2 + winW - 0.05]) { const arm = box(0.03, 0.03, 1.35, M.chrome, ex, 2.25, 0.62); arm.rotation.x = 0.42; }
      // the neon over the fascia: the place's own name
      const words = dinerSign(aliases[key].name);
      const sw = Math.min(w * 0.82, 9), sh = sw * (320 / 1024);
      const nt = tex(neon(words, seed));
      const nmat = new THREE.MeshBasicMaterial({ map: nt, toneMapped: false });
      nmat.color.setScalar(1.25);
      const top = Math.min(f.top - y0 - 0.3, 3.3 + sh + 0.1);
      const sy = Math.max(3.3 + sh / 2, top - sh / 2);
      box(sw + 0.12, sh + 0.12, 0.14, M.chrome, 0, sy, 0.1);
      const sp = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), nmat); sp.position.set(0, sy, 0.18); g.add(sp);
      // (OPEN in the window: a small neon of its own)
      const [oc, ox] = canvas(256, 96); ox.fillStyle = '#000'; ox.fillRect(0, 0, 256, 96); ox.font = '700 64px Georgia, serif'; ox.textAlign = 'center'; ox.textBaseline = 'middle';
      ox.shadowColor = '#ff3b3b'; ox.shadowBlur = 18; ox.strokeStyle = '#ff4646'; ox.lineWidth = 6; ox.strokeText('OPEN', 128, 50); ox.shadowBlur = 0; ox.strokeStyle = '#ffd0d0'; ox.lineWidth = 2; ox.strokeText('OPEN', 128, 50);
      const om = new THREE.MeshBasicMaterial({ map: tex(oc), toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const op = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), om); op.position.set(wx + winW / 2 - 0.8, 2.15, 0.08); g.add(op);
      out.fronts.push({ key, name: words.join(' ').trim(), x: sx, z: sz, w });
      console.info('[storyrun] fronts: a diner front for', key, `"${words.join(' ').trim()}"`, `${w.toFixed(1)} m`);
      return true;
    } catch (e) { console.warn('[storyrun] fronts', key, e); return true; }
  };
  const tick = () => { pending = pending.filter((k) => !build(k)); tries++; if (pending.length && tries > 150) { console.info('[storyrun] fronts: no street face for', pending.join(', ')); pending = []; } };
  tick();
  out.update = (dt) => { if (!pending.length) return; wait -= dt; if (wait > 0) return; wait = 2; tick(); };
  return out;
}
