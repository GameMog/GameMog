// Mog City: Mission 3's sets and people.
//   rally   the Blimpco launch at Washington Square: a stage under the arch (the city's own arch, js/city-grid.js), a big
//           LED screen in front of its opening with the live Blimpco chart (a canvas: pumping green, then the dump in red),
//           Blimpco's airship logo on a banner over the arch's attic, speaker stacks, crowd barriers, the hype crowd (the city's
//           PersonCrowd) facing the stage, and three ring-light livestream rigs (tripod, ring light, phone): smashed by
//           blows, a bat, a thrown can or bottle or the car (a blow glitches the phone's screen and rocks the rig;
//           rig.onHit for the mission's own), they topple, spark and go dark
//   garage  Gears' Static Garage on W 22nd St: the frontage on the street (a roll-up door half up, the sign) and the bay
//           behind it (built inside the building's shell: its walls face out, so from in here only ours are seen):
//           concrete, a tool wall, a bench, tyres, strip lights and a work lamp, an old couch by the door; its moods
//           (G.mood('night' | 'dark' | 'morning' | null)) for the night Dan sleeps there
//   suv     Fiona's black SUV (the city's SUV body, acid-green rims), parked on 5th Ave by the arch
//   people  Gears (his own model, gears.glb: navy overalls, a beard, a cap: a big gentle mechanic) and Floor Price Fiona (her own
//           model, fiona.glb: platinum ponytail, white shades, a megaphone), each posed by its clips (rig) plus an arm to a point
//   const R = buildRally(W); R.show(true); R.screen.mode('pump' | 'dump'); R.rigs[i].hit(dmg, from); R.update(dt, cam)
//   const G = buildGarage(W); G.show(true); G.inside(true)     const suv = buildSUV(W)
//   const F = await buildFiona(W); const g = await buildGears(W)   (each { root, inner, bones, mixer, rig, clips, arm(...),
//           face, jaw(k) }: a talking face, wagmi/face.js: the mouth with their own lines, blinks, eyes on whom they talk to)
import * as THREE from 'three/webgpu';
import { loadGLB } from '../glb.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rig, clamp } from './cine.js';
import { faceOn } from '../face.js';

const PI = Math.PI;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const PARK_Y = 0.26; // the park's walks (js/city-grid.js PARK_Y)
export const ARCH = { x: 0, z: 2800.6 };                                       // the arch's centre (its 4.4 m depth either side)
export const STAGE = { x0: -7.6, x1: 7.6, z0: 2803.3, z1: 2811.5, top: PARK_Y + 1.1 };
export const FIONA_AT = [0, 2809.6];
export const SCREEN_Z = 2806.0;                                                // (the park tree just south of the arch stands behind it)
export const CROWD_CAM = [5.5, 2820.2];                                        // the rally scene's camera in the crowd (kept clear)
export const RIGS = [[-8, 2858], [-30, 2895], [18, 2890]];
export const ARENA = { x: -6, z: 2852 };                                      // (the fight's ground: from the arch to past the fountain)
export const SUV_AT = [6, 2782, PI];                                           // 5th Ave at the arch, facing north (the wrong way)
export const GARAGE = { x: -1560, z: 1611 };                                   // the bay door, on the building line

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.canvas = c;
  return t;
}

/* ------------------------------------------------- Blimpco's logo -- */
// Blimpco's mark (an original): a white airship side on, nose to the right, four tail fins and a small gondola, on the
// circle's own ground (r: the circle it fills)
export function drawBlimp(x, cx, cy, r, { color = '#F4F6F8', ink = '#0B0D10' } = {}) {
  x.save(); x.translate(cx, cy);
  const L = r * 0.78, H = r * 0.34;
  x.fillStyle = color;
  // the fins: top and bottom at the tail, and the near side one
  x.beginPath(); x.moveTo(-L * 0.62, -H * 0.55); x.lineTo(-L * 1.02, -H * 1.35); x.lineTo(-L * 1.08, -H * 0.2); x.closePath(); x.fill();
  x.beginPath(); x.moveTo(-L * 0.62, H * 0.55); x.lineTo(-L * 1.02, H * 1.35); x.lineTo(-L * 1.08, H * 0.2); x.closePath(); x.fill();
  // the envelope
  x.beginPath(); x.ellipse(0, 0, L, H, 0, 0, Math.PI * 2); x.fill();
  // a seam along it and the gondola under it
  x.strokeStyle = ink; x.globalAlpha = 0.28; x.lineWidth = Math.max(1, r * 0.035);
  x.beginPath(); x.ellipse(0, 0, L * 0.98, H * 0.42, 0, Math.PI * 0.05, Math.PI * 0.95); x.stroke(); x.globalAlpha = 1;
  x.fillStyle = color; x.beginPath(); x.roundRect(-L * 0.22, H * 0.95, L * 0.44, H * 0.42, H * 0.12); x.fill();
  x.strokeStyle = color; x.lineWidth = Math.max(1, r * 0.03); x.beginPath(); x.moveTo(-L * 0.18, H * 0.82); x.lineTo(-L * 0.14, H * 1.0); x.moveTo(L * 0.18, H * 0.82); x.lineTo(L * 0.14, H * 1.0); x.stroke();
  x.fillStyle = ink; x.beginPath(); x.ellipse(-L * 0.86, 0, L * 0.05, H * 0.5, 0, 0, Math.PI * 2); x.globalAlpha = 0.18; x.fill(); x.globalAlpha = 1;
  x.restore();
}

/* -------------------------------------------------------- Moon's face -- */
// a drawing of Moon (an original: the white long-coated dog of wagmi/moon.js): a cloud of white fur, ears of long
// cream locks, dark round eyes with a shine, a pink-brown nose, a little pink tongue
export function drawMoon(x, cx, cy, r, { tongue = true } = {}) {
  let s = 7; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  x.save();
  // the ears: long locks hanging either side
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 26; i++) {
      const a = rnd(), px = cx + sx * r * (0.62 + a * 0.32), py = cy + r * (-0.1 + rnd() * 1.05), rr = r * (0.16 + rnd() * 0.14);
      x.fillStyle = `rgb(${226 + rnd() * 24 | 0},${214 + rnd() * 24 | 0},${196 + rnd() * 26 | 0})`;
      x.beginPath(); x.ellipse(px, py, rr * 0.75, rr * 1.4, sx * 0.25, 0, PI * 2); x.fill();
    }
  }
  // the head: overlapping puffs of white
  for (let i = 0; i < 70; i++) {
    const a = rnd() * PI * 2, d = Math.sqrt(rnd()) * r * 0.78, rr = r * (0.16 + rnd() * 0.16);
    const g = 236 + rnd() * 19 | 0; x.fillStyle = `rgb(${g},${g - 2},${g - 8})`;
    x.beginPath(); x.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.95, rr, 0, PI * 2); x.fill();
  }
  // a soft shade under the muzzle
  const sh = x.createRadialGradient(cx, cy + r * 0.38, r * 0.05, cx, cy + r * 0.38, r * 0.5); sh.addColorStop(0, 'rgba(160,150,140,.35)'); sh.addColorStop(1, 'rgba(160,150,140,0)');
  x.fillStyle = sh; x.beginPath(); x.arc(cx, cy + r * 0.38, r * 0.5, 0, PI * 2); x.fill();
  // the muzzle
  x.fillStyle = '#FBF8F2'; x.beginPath(); x.ellipse(cx, cy + r * 0.3, r * 0.34, r * 0.25, 0, 0, PI * 2); x.fill();
  // the eyes
  for (const sx of [-1, 1]) {
    x.fillStyle = '#17110E'; x.beginPath(); x.arc(cx + sx * r * 0.29, cy - r * 0.06, r * 0.115, 0, PI * 2); x.fill();
    x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.arc(cx + sx * r * 0.29 - r * 0.035, cy - r * 0.1, r * 0.035, 0, PI * 2); x.fill();
  }
  // the nose
  x.fillStyle = '#6E4A3F'; x.beginPath(); x.ellipse(cx, cy + r * 0.2, r * 0.11, r * 0.08, 0, 0, PI * 2); x.fill();
  x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.ellipse(cx - r * 0.03, cy + r * 0.175, r * 0.035, r * 0.02, 0, 0, PI * 2); x.fill();
  // the mouth, the tongue
  x.strokeStyle = '#5B4038'; x.lineWidth = Math.max(1, r * 0.025); x.beginPath(); x.moveTo(cx, cy + r * 0.28); x.quadraticCurveTo(cx - r * 0.1, cy + r * 0.42, cx - r * 0.18, cy + r * 0.36); x.moveTo(cx, cy + r * 0.28); x.quadraticCurveTo(cx + r * 0.1, cy + r * 0.42, cx + r * 0.18, cy + r * 0.36); x.stroke();
  if (tongue) { x.fillStyle = '#E8798A'; x.beginPath(); x.ellipse(cx + r * 0.02, cy + r * 0.45, r * 0.07, r * 0.1, 0, 0, PI * 2); x.fill(); }
  x.restore();
}

/* ------------------------------------------------- the big LED screen -- */
// the Blimpco chart, live: the price pumping (green) with the stream's numbers, a dip for each stream lost, then the dump
function createScreen() {
  const W0 = 1024, H0 = 576;
  const tex = canvasTex(W0, H0, () => {}); const x = tex.canvas.getContext('2d');
  const S = { mode: 'pump', pts: [], v: 12, t: 0, viewers: 11240, dumpT: 0, lost: 0, tick: 0 };
  for (let i = 0; i < 90; i++) { S.v += 0.25 + Math.sin(i * 0.7) * 0.6 + (i % 7 === 3 ? -1.2 : 0); S.pts.push(S.v); }
  const face = document.createElement('canvas'); face.width = face.height = 128; drawBlimp(face.getContext('2d'), 64, 64, 52);
  function draw() {
    const red = S.mode === 'dump';
    const bg = x.createLinearGradient(0, 0, 0, H0); bg.addColorStop(0, '#080B10'); bg.addColorStop(1, red ? '#1A0606' : '#0B1408');
    x.fillStyle = bg; x.fillRect(0, 0, W0, H0);
    // the grid
    x.strokeStyle = 'rgba(255,255,255,.06)'; x.lineWidth = 1;
    for (let i = 1; i < 8; i++) { x.beginPath(); x.moveTo(40, 120 + i * 46); x.lineTo(W0 - 40, 120 + i * 46); x.stroke(); }
    for (let i = 1; i < 12; i++) { x.beginPath(); x.moveTo(40 + i * 79, 120); x.lineTo(40 + i * 79, 490); x.stroke(); }
    // the line and the fill under it
    const lo = Math.min(...S.pts), hi = Math.max(...S.pts, lo + 1), n = S.pts.length;
    const px = (i) => 40 + i / (n - 1) * (W0 - 80), py = (v) => 480 - (v - lo) / (hi - lo) * 340;
    const col = red ? '#EF4444' : '#B6FF3B';
    const fill = x.createLinearGradient(0, 140, 0, 490); fill.addColorStop(0, red ? 'rgba(239,68,68,.35)' : 'rgba(182,255,59,.35)'); fill.addColorStop(1, 'rgba(0,0,0,0)');
    x.beginPath(); x.moveTo(px(0), 490); for (let i = 0; i < n; i++) x.lineTo(px(i), py(S.pts[i])); x.lineTo(px(n - 1), 490); x.closePath(); x.fillStyle = fill; x.fill();
    x.beginPath(); for (let i = 0; i < n; i++) (i ? x.lineTo : x.moveTo).call(x, px(i), py(S.pts[i]));
    x.strokeStyle = col; x.lineWidth = 6; x.lineJoin = 'round'; x.shadowColor = col; x.shadowBlur = 18; x.stroke(); x.shadowBlur = 0;
    x.fillStyle = col; x.beginPath(); x.arc(px(n - 1), py(S.pts[n - 1]), 10, 0, PI * 2); x.fill();
    // the header: Blimpco's logo, the ticker, LIVE, the viewers, the price and the change
    x.save(); x.beginPath(); x.arc(84, 62, 44, 0, PI * 2); x.fillStyle = '#B6FF3B'; x.fill(); x.beginPath(); x.arc(84, 62, 40, 0, PI * 2); x.clip(); x.fillStyle = '#20262E'; x.fillRect(40, 18, 88, 88); x.drawImage(face, 40, 18, 88, 88); x.restore();
    x.fillStyle = '#fff'; x.font = 'italic 800 76px "Barlow Condensed", sans-serif'; x.fillText('BLIMPCO', 144, 88);
    x.font = '700 22px "Barlow Condensed", sans-serif'; x.fillStyle = 'rgba(255,255,255,.6)'; x.fillText('BLIMPCO · THE LAUNCH OF THE CENTURY', 148, 112);
    const live = !red || S.t % 1 < 0.5;
    x.fillStyle = live ? '#EF4444' : 'rgba(239,68,68,.35)'; x.beginPath(); x.roundRect(560, 30, 92, 40, 8); x.fill();
    x.fillStyle = '#fff'; x.font = '800 28px "Barlow Condensed", sans-serif'; x.fillText('LIVE', 584, 60);
    x.fillStyle = 'rgba(255,255,255,.75)'; x.font = '700 26px "Barlow Condensed", sans-serif'; x.fillText(`${(S.viewers / 1000).toFixed(1)}K WATCHING`, 666, 60);
    const pct = red ? -99.8 + Math.max(0, 1 - S.dumpT / 2.5) * 60 : 3800 + (S.pts[n - 1] - S.pts[0]) * 9;
    x.textAlign = 'right';
    x.fillStyle = '#fff'; x.font = '800 40px "Barlow Condensed", sans-serif'; x.fillText(`$${(red ? 0.0000042 : 0.0042 * (1 + pct / 100)).toFixed(red ? 7 : 4)}`, W0 - 40, 62);
    x.fillStyle = col; x.font = 'italic 800 34px "Barlow Condensed", sans-serif'; x.fillText(`${pct > 0 ? '+' : ''}${pct.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`, W0 - 40, 100);
    x.textAlign = 'left';
    // (the dump: the number across the chart)
    if (red && S.dumpT > 1.2) { x.textAlign = 'center'; x.fillStyle = 'rgba(239,68,68,.92)'; x.font = 'italic 800 150px "Barlow Condensed", sans-serif'; x.fillText('-99.8%', W0 / 2, 360); x.textAlign = 'left'; }
    // the ticker along the bottom
    x.fillStyle = red ? '#EF4444' : '#B6FF3B'; x.fillRect(0, 512, W0, 64);
    x.fillStyle = '#0A0C10'; x.font = '800 30px "Barlow Condensed", sans-serif';
    const msg = red ? 'SELL · SELL · SELL · THIS IS FINE · SELL · SELL · NOT FINANCIAL ADVICE · ' : 'NUMBER GO UP · NOT FINANCIAL ADVICE · DIAMOND HANDS ONLY · BLIMPCO SKY HIGH · WAGMI · ';
    const mw = x.measureText(msg).width, off = -((S.t * 120) % mw);
    for (let k = off; k < W0; k += mw) x.fillText(msg, k, 554);
    tex.needsUpdate = true;
  }
  return {
    tex,
    mode(m) { if (m === S.mode) return; S.mode = m; S.dumpT = 0; },
    // a stream lost: viewers gone, the price shaken
    dip() { S.lost++; S.viewers = Math.round(S.viewers * 0.62); S.v -= 6; },
    get state() { return S; },
    update(dt) {
      S.t += dt; S.tick += dt;
      if (S.tick < 0.12) return; const step = S.tick; S.tick = 0;
      if (S.mode === 'pump') {
        S.v += (0.55 + Math.random() * 0.9 - (Math.random() < 0.12 ? 2.2 : 0)) * step * 8; S.viewers += Math.round((Math.random() * 40 - 8) * (S.lost ? 0.3 : 1));
      } else {
        S.dumpT += step;
        const lo = Math.min(...S.pts), hi = Math.max(...S.pts);
        S.v = S.dumpT < 2.5 ? S.v - (hi - lo) * step * 0.6 : lo + Math.random() * 0.4; S.viewers = Math.max(31, Math.round(S.viewers * 0.9));
      }
      S.pts.push(S.v); if (S.pts.length > 90) S.pts.shift();
      draw();
    },
    draw,
  };
}

/* ------------------------------------------------------------- rally -- */
export function buildRally(W) {
  const app = W.app, cm = app.controllerManager, scene = app.scene;
  const g = new THREE.Group(); g.name = 'wagmi-m3-rally'; g.visible = false; scene.add(g);
  const box = (w, h, d, mat, px, py, pz, parent = g) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(px, py, pz); b.castShadow = true; b.receiveShadow = true; parent.add(b); return b; };
  const black = new THREE.MeshStandardMaterial({ color: '#16181C', roughness: 0.7, metalness: 0.2 });
  const deckMat = new THREE.MeshStandardMaterial({ color: '#2A2D33', roughness: 0.85 });
  const steel = new THREE.MeshStandardMaterial({ color: '#B9BEC6', roughness: 0.35, metalness: 0.85 });
  const acid = new THREE.MeshStandardMaterial({ color: '#B6FF3B', emissive: '#9BE02A', emissiveIntensity: 1.6, roughness: 0.5 });

  /* the stage: a deck under the arch, a skirt with an acid-green strip, steps at its east end */
  const { x0, x1, z0, z1, top } = STAGE, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  box(x1 - x0, top - PARK_Y, z1 - z0, deckMat, cx, (top + PARK_Y) / 2, cz);
  box(x1 - x0 + 0.04, 0.06, 0.04, acid, cx, top - 0.08, z1 + 0.01);
  for (let i = 0; i < 4; i++) box(1.2, 0.27 * (i + 1), 0.4, deckMat, x1 + 0.6, PARK_Y + 0.135 * (i + 1), z1 - 0.6 - (3 - i) * 0.4);
  // the truss towers either side of the screen
  for (const sx of [-1, 1]) {
    const tx = sx * 5.9;
    for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) box(0.05, 8.2, 0.05, steel, tx + dx, top + 4.1, SCREEN_Z + dz);
    for (let k = 0; k < 9; k++) box(0.42, 0.03, 0.03, steel, tx, top + 0.5 + k * 0.95, SCREEN_Z - 0.2);
  }
  box(12.2, 0.42, 0.42, steel, 0, top + 8.2, SCREEN_Z);
  // the screen: behind the arch's opening (in front of the park tree that stands just south of it), the chart on both
  // faces (the back seen through the arch from 5th Ave)
  const screen = createScreen();
  const sw = 10, shh = 5.625, sy = top + 1.25 + shh / 2;
  box(sw + 0.3, shh + 0.3, 0.3, black, 0, sy, SCREEN_Z);
  const scrMat = new THREE.MeshBasicMaterial({ map: screen.tex, color: new THREE.Color(1.25, 1.25, 1.25) });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(sw, shh), scrMat); front.position.set(0, sy, SCREEN_Z + 0.17); g.add(front);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(sw, shh), scrMat); back.position.set(0, sy, SCREEN_Z - 0.17); back.rotation.y = PI; g.add(back);
  // the banner on the arch's attic, both faces: Blimpco's logo, BLIMPCO, SKY HIGH
  const banner = canvasTex(1024, 286, (x, w, h) => {
    x.fillStyle = '#0B0D10'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#B6FF3B'; x.lineWidth = 10; x.strokeRect(8, 8, w - 16, h - 16);
    x.save(); x.beginPath(); x.arc(160, h / 2, 112, 0, PI * 2); x.fillStyle = '#B6FF3B'; x.fill(); x.beginPath(); x.arc(160, h / 2, 104, 0, PI * 2); x.clip(); x.fillStyle = '#2B3340'; x.fillRect(40, 20, 240, 250); drawBlimp(x, 160, h / 2, 92); x.restore();
    x.fillStyle = '#B6FF3B'; x.font = 'italic 800 150px "Barlow Condensed", sans-serif'; x.fillText('BLIMPCO', 300, 158);
    x.fillStyle = '#fff'; x.font = '800 56px "Barlow Condensed", sans-serif'; x.fillText('SKY HIGH · LIVE NOW', 306, 228);
  });
  const banMat = new THREE.MeshStandardMaterial({ map: banner, roughness: 0.8, emissive: '#FFFFFF', emissiveMap: banner, emissiveIntensity: 0.18, side: THREE.DoubleSide });
  for (const [z, ry] of [[ARCH.z + 2.36, 0], [ARCH.z - 2.36, PI]]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(14.6, 14.6 * 286 / 1024), banMat); b.position.set(0, PARK_Y + 17.75, z); b.rotation.y = ry; g.add(b); }
  // speaker stacks, uplights, the crowd barrier
  const grille = canvasTex(128, 256, (x, w, h) => { x.fillStyle = '#121316'; x.fillRect(0, 0, w, h); for (const [yy, r] of [[64, 44], [176, 54]]) { x.fillStyle = '#060607'; x.beginPath(); x.arc(64, yy, r, 0, PI * 2); x.fill(); x.fillStyle = '#26282D'; x.beginPath(); x.arc(64, yy, r * 0.32, 0, PI * 2); x.fill(); } });
  const spkMat = new THREE.MeshStandardMaterial({ map: grille, roughness: 0.8 });
  // (out past a park tree by the west end)
  for (const sx of [-1, 1]) { const s = box(1.3, 2.6, 1.0, black, sx * 10.7, PARK_Y + 1.3, 2810.2); const f = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.5), spkMat); f.position.set(sx * 10.7, PARK_Y + 1.3, 2810.71); g.add(f); s.userData.f = f; }
  for (let i = -3; i <= 3; i++) { const u = box(0.22, 0.3, 0.22, black, i * 2.1, top + 0.15, z1 - 0.3); const l = box(0.16, 0.04, 0.16, acid, i * 2.1, top + 0.32, z1 - 0.3); l.castShadow = false; }
  const railMat = new THREE.MeshStandardMaterial({ color: '#9AA0A8', roughness: 0.4, metalness: 0.8 });
  for (let i = 0; i < 6; i++) {
    const bx = -6.25 + i * 2.5, bz = 2815.2;
    box(2.3, 0.05, 0.05, railMat, bx, PARK_Y + 1.05, bz); box(2.3, 0.04, 0.04, railMat, bx, PARK_Y + 0.25, bz);
    for (let k = 0; k < 7; k++) box(0.025, 0.8, 0.025, railMat, bx - 1.1 + k * 0.366, PARK_Y + 0.65, bz);
    for (const ex of [-1.1, 1.1]) box(0.05, 0.05, 0.7, railMat, bx + ex, PARK_Y + 0.03, bz);
  }
  // (the stage and the speakers are solid while the set stands)
  const colliders = [
    { minX: x0, maxX: x1, minZ: z0, maxZ: z1, maxY: top, wagmi: 'm3' },
    { minX: -11.4, maxX: -10.0, minZ: 2809.7, maxZ: 2810.7, maxY: PARK_Y + 2.6, wagmi: 'm3' }, { minX: 10.0, maxX: 11.4, minZ: 2809.7, maxZ: 2810.7, maxY: PARK_Y + 2.6, wagmi: 'm3' },
  ];

  /* the rigs: a tripod, a ring light, a phone in it, filming the stage */
  const legMat = new THREE.MeshStandardMaterial({ color: '#1B1D21', roughness: 0.5, metalness: 0.6 });
  const sparks = [];
  const sparkMat = new THREE.MeshBasicMaterial({ color: '#FFE7A0' });
  const sparkGeo = new THREE.BoxGeometry(0.035, 0.035, 0.09);
  for (let i = 0; i < 48; i++) { const m = new THREE.Mesh(sparkGeo, sparkMat); m.visible = false; m.frustumCulled = false; g.add(m); sparks.push({ m, v: V(), life: 0 }); }
  const spark = (p, n = 16) => {
    let k = 0;
    for (const s of sparks) { if (s.life > 0) continue; s.life = 0.35 + Math.random() * 0.45; s.m.position.copy(p); s.v.set((Math.random() - 0.5) * 6, 1.5 + Math.random() * 4, (Math.random() - 0.5) * 6); s.m.visible = true; if (++k >= n) break; }
  };
  const rigs = RIGS.map(([rx, rz], i) => {
    const y0 = cm.getGroundHeight(rx, rz, 'person');
    const root = new THREE.Group(); root.position.set(rx, y0, rz); root.rotation.y = Math.atan2(0 - rx, FIONA_AT[1] - rz); g.add(root);
    const piv = new THREE.Group(); root.add(piv);
    for (let k = 0; k < 3; k++) { const a = k / 3 * PI * 2 + 0.5, leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 1.0, 6), legMat); leg.position.set(Math.sin(a) * 0.22, 0.47, Math.cos(a) * 0.22); leg.rotation.set(Math.cos(a) * 0.45, 0, -Math.sin(a) * 0.45); leg.castShadow = true; piv.add(leg); }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.75, 6), legMat); pole.position.y = 1.25; pole.castShadow = true; piv.add(pole);
    const ringMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', emissive: '#FFF4E2', emissiveIntensity: 2.4, roughness: 0.3 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.028, 10, 40), ringMat); ring.position.y = 1.68; ring.castShadow = true; piv.add(ring);
    const scrM = new THREE.MeshBasicMaterial({ color: '#B6FF3B' });
    const phone = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.012), black); phone.position.set(0, 1.68, 0.01); piv.add(phone);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.145), scrM); scr.position.set(0, 1.68, 0.0175); piv.add(scr);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: '#EF4444' })); dot.position.set(0.2, 1.95, 0); piv.add(dot);
    // (a blow: its screen glitches and the ring light stutters for a moment, the whole rig rocks on its feet)
    const GLITCH = ['#FF2E63', '#FFFFFF', '#3BD8FF', '#050506', '#B6FF3B', '#FFE14D'];
    const R = {
      i, x: rx, z: rz, y: y0, root, hp: 2, hp0: 2, down: false, fall: 0, fallDir: 0, flash: 0, glitch: 0, rock: 0, rockDir: 0,
      onHit: null, // (the mission's: (rig, dmg, from, down) at every blow, for its own feedback)
      // a blow (dmg: 1 a fist, 2 a heavy, 3 a bat, a throw or the car) from (fx, fz)
      hit(dmg = 1, from = null) {
        if (R.down) return false;
        R.hp -= dmg; R.flash = 0.18; R.glitch = 0.55; R.rock = 1;
        R.rockDir = from ? Math.atan2(rx - from.x, rz - from.z) - root.rotation.y : 0;
        const at = V(rx, y0 + 1.6, rz);
        spark(at, dmg >= 2 ? 16 : 10);
        W.audio?.play?.('carHit', { pos: [rx, 1.4, rz], vol: 0.45 });
        try { R.onHit?.(R, dmg, from, R.hp <= 0); } catch (e) { console.warn('[m3] rig', e); }
        if (R.hp > 0) return false;
        R.down = true; R.fall = 0;
        // (it falls away from the blow)
        const fx = from ? rx - from.x : Math.sin(root.rotation.y), fz = from ? rz - from.z : Math.cos(root.rotation.y);
        R.fallDir = Math.atan2(fx, fz) - root.rotation.y;
        ringMat.emissiveIntensity = 0; ringMat.color.set('#5A5E66'); scrM.color.set('#050506'); dot.visible = false;
        spark(at, 22);
        W.audio?.play?.('glass', { pos: [rx, 1.6, rz], vol: 0.9 });
        return true;
      },
      reset() { R.hp = 2; R.down = false; R.counted = false; R.fall = 0; R.glitch = 0; R.rock = 0; piv.rotation.set(0, 0, 0); ringMat.emissiveIntensity = 2.4; ringMat.color.set('#FFFFFF'); scrM.color.set('#B6FF3B'); dot.visible = true; },
      update(dt, t) {
        // a blow's glitch: the phone's screen flicks through colours, the ring light stutters, the rig rocks
        if (!R.down && R.glitch > 0) {
          R.glitch = Math.max(0, R.glitch - dt);
          scrM.color.set(R.glitch > 0 ? GLITCH[(Math.floor(t * 28) + R.i) % GLITCH.length] : '#B6FF3B');
          ringMat.emissiveIntensity = R.glitch > 0 && Math.floor(t * 22) % 3 === 0 ? 0.15 : 2.4;
        }
        if (!R.down && R.rock > 0) {
          R.rock = Math.max(0, R.rock - dt / 0.45);
          const a = Math.sin((1 - R.rock) * 26) * 0.16 * R.rock;
          piv.rotation.set(Math.cos(R.rockDir) * a, 0, -Math.sin(R.rockDir) * a);
        }
        if (R.down && R.fall < 1) {
          R.fall = Math.min(1, R.fall + dt / 0.55);
          const k = R.fall * R.fall, ang = k * 1.42 + (R.fall >= 1 ? 0 : 0);
          // (tipped about its feet, the way it fell)
          piv.rotation.set(Math.cos(R.fallDir) * ang, 0, -Math.sin(R.fallDir) * ang);
          if (R.fall >= 1) { spark(V(rx + Math.sin(root.rotation.y + R.fallDir) * 1.6, y0 + 0.1, rz + Math.cos(root.rotation.y + R.fallDir) * 1.6), 10); W.audio?.play?.('carHit', { pos: [rx, 0.3, rz], vol: 0.25 }); }
        }
        if (!R.down && R.glitch <= 0) { dot.visible = (t % 1.2) < 0.75; ringMat.emissiveIntensity = 2.4 + (R.flash > 0 ? 3 : 0); }
        R.flash = Math.max(0, R.flash - dt);
      },
    };
    return R;
  });

  /* the hype crowd: the city's own people (one instanced draw), facing the stage, dancing and cheering; on the fight,
     they run. The dances and cheers are motion capture (assets/anim/bandai/rally-crowd-ped.json: Bandai Namco Research
     Motion Dataset, CC BY-NC 4.0, see NOTICE), fetched with the set and played on each person's own rig, each their own
     take, pace and moment in it (till they're in, or without them, a bounce on the spot); turning to run, each eases
     out of the dance over a quarter second (PersonRig.fadeFrom) */
  const N = window.NYC;
  const crowd = (() => {
    if (!N?.PersonCrowd || !N?.PersonRig) return null;
    let CL = null;
    fetch('assets/anim/bandai/rally-crowd-ped.json').then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.clips) CL = Object.fromEntries(j.clips.map((c) => [c.name, c])); }).catch(() => {});
    // (27 Oct: the pack's three 'active' cheers stay out of the mix: they bounce on knees never straighter than 18-21
    // degrees, down to 66-75, the buckled look the owner asked to be rid of; the youthful takes stand tall, 2-6 degrees)
    const TAKES = [['danceLong', 0.35], ['danceShort', 0.2], ['waveBothYouth', 0.17], ['waveRightYouth', 0.15], ['raiseBothYouth', 0.13]];
    const take = (x) => { for (const [n, w] of TAKES) { if (x < w) return n; x -= w; } return TAKES[0][0]; };
    let s2 = 97; const rnd2 = () => ((s2 = (s2 * 1664525 + 1013904223) >>> 0) / 4294967296); // (their own: the crowd's places as they were)
    // (packed toward the barrier, thinning out back across the lawn; none in a park tree)
    const NC = 48, C = new N.PersonCrowd(NC, { farDistance: 40, name: 'RallyCrowd' });
    for (const m of C.meshes) { m.visible = false; scene.add(m); }
    let s = 11; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const trees = (N.breakables || []).filter((b) => b.kind === 'tree' && Math.abs(b.x) < 16 && b.z > 2810 && b.z < 2845);
    const people = [];
    for (let i = 0, tries = 0; i < NC && tries < 900; tries++) {
      const female = rnd() < 0.45, x = -9 + rnd() * 18, z = 2816.3 + Math.pow(rnd(), 1.6) * 12;
      if (people.some((p) => Math.hypot(p.x0 - x, p.z0 - z) < 0.8) || trees.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + 0.55) || Math.hypot(x - CROWD_CAM[0], z - CROWD_CAM[1]) < 1.5) continue;
      people.push({ x0: x, z0: z, x, z, h: PI + (rnd() - 0.5) * 0.5, ph: rnd() * 6, jump: rnd() < 0.4, run: null, gone: false,
        clip: take(rnd2()), rate: 0.9 + rnd2() * 0.2, at: rnd2() * 15,
        rig: new N.PersonRig({ seed: 40 + i * 3.7, female, scale: female ? 0.93 : 1, girth: 0.92 + rnd() * 0.25, hair: female ? 1 : 0.2 }) });
      i++;
    }
    const ground = (o, x, z) => cm.getGroundHeight(x, z, 'person');
    return {
      meshes: C.meshes, people,
      show(on) { for (const m of C.meshes) m.visible = on; },
      reset() { for (const p of people) { p.x = p.x0; p.z = p.z0; p.run = null; p.gone = false; p.h = PI; p.fade = 0; p.danced = false; p.rig.reset?.(p.x, p.z, p.h, ground, p); } },
      // run from (fx, fz)
      scatter(fx, fz) { for (const p of people) if (!p.run) { const a = Math.atan2(p.x - fx, p.z - fz) + (Math.random() - 0.5) * 0.9; p.run = { a, v: 3.6 + Math.random() * 1.6, t: Math.random() * 0.6 }; } },
      update(dt, t, cam) {
        C.begin();
        for (const p of people) {
          if (p.gone) continue;
          let air = 0;
          if (p.run) {
            p.run.t += dt; if (p.run.t > 0.4) { p.x += Math.sin(p.run.a) * p.run.v * dt; p.z += Math.cos(p.run.a) * p.run.v * dt; p.h = p.run.a; }
            const q = V(p.x, 0, p.z); cm.resolveHorizontalCollision?.(q, 0.3, 1.5); p.x = q.x; p.z = q.z;
            if (p.run.t > 9) { p.gone = true; continue; }
          } else if (CL?.[p.clip] && p.rig.playClip) { p.rig.playClip(CL[p.clip], t * p.rate + p.at, p.x, p.z, p.h, ground(p, p.x, p.z)); p.danced = true; C.add(p.rig, cam ? Math.hypot(p.x - cam.x, p.z - cam.z) : 0); continue; }
          else if (p.jump) air = Math.max(0, Math.sin(t * 7 + p.ph)) * 0.16;
          // (out of the dance: its last pose kept, faded out over 0.25 s into the rig's own stand and run)
          if (p.danced && p.rig.fadeFrom) { p.danced = false; (p.from ||= new Float32Array(p.rig.pose.length)).set(p.rig.pose); p.fade = 1; }
          p.rig.update(Math.max(1e-4, dt), p.x, p.z, p.h, ground, p, air, true);
          if (p.fade > 0) { p.fade = Math.max(0, p.fade - dt / 0.25); p.rig.fadeFrom(p.from, p.fade * p.fade * (3 - 2 * p.fade)); }
          C.add(p.rig, cam ? Math.hypot(p.x - cam.x, p.z - cam.z) : 0);
        }
        C.end();
      },
    };
  })();

  let shown = false, t = 0;
  const R = {
    group: g, screen, rigs, crowd, colliders,
    show(on) {
      shown = !!on; g.visible = shown; crowd?.show(shown);
      const Cc = cm.colliders;
      for (let i = Cc.length - 1; i >= 0; i--) if (Cc[i].wagmi === 'm3') Cc.splice(i, 1);
      if (shown) Cc.push(...colliders);
      cm._colliderCells = null;
    },
    get shown() { return shown; },
    reset() { for (const r of rigs) r.reset(); screen.mode('pump'); crowd?.reset(); },
    get smashed() { return rigs.filter((r) => r.down).length; },
    update(dt, cam) {
      if (!shown) return;
      t += dt;
      screen.update(dt);
      for (const r of rigs) r.update(dt, t);
      for (const s of sparks) { if (s.life <= 0) continue; s.life -= dt; s.v.y -= 14 * dt; s.m.position.addScaledVector(s.v, dt); s.m.lookAt(s.m.position.x + s.v.x, s.m.position.y + s.v.y, s.m.position.z + s.v.z); if (s.life <= 0 || s.m.position.y < 0.2) { s.m.visible = false; s.life = 0; } }
      crowd?.update(dt, t, cam);
    },
    // (compile its pipelines out of sight before it's first seen)
    async warm() {
      const p = g.position.clone(); g.position.y = -60; g.visible = true; crowd?.show(true);
      await new Promise((r) => { let n = 0; const f = () => (++n >= 4 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
      g.position.copy(p); g.visible = shown; crowd?.show(shown);
    },
  };
  screen.draw();
  return R;
}

/* ------------------------------------------------------------ garage -- */
export function buildGarage(W) {
  const app = W.app, scene = app.scene;
  const g = new THREE.Group(); g.name = 'wagmi-m3-garage'; g.visible = false; scene.add(g);
  const { x: GX, z: GZ } = GARAGE, Y = 0.22;
  const plane = (w, h, mat, px, py, pz, ry = 0, parent = g) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(px, py, pz); m.rotation.y = ry; m.receiveShadow = true; m.castShadow = parent !== g; parent.add(m); return m; };
  const box = (w, h, d, mat, px, py, pz, parent = g) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(px, py, pz); b.castShadow = true; b.receiveShadow = true; parent.add(b); return b; };

  /* the frontage (on the street side of the facade, facing north): the door's frame, the roll-up door 60% up, the bay
     beyond it painted (seen from the street), the sign */
  const out = new THREE.Group(); g.add(out);
  const DW = 5.4, DH = 4.0, FZ = GZ - 0.04;
  const frameMat = new THREE.MeshStandardMaterial({ color: '#2B2F35', roughness: 0.5, metalness: 0.6 });
  box(0.3, DH + 0.3, 0.12, frameMat, GX - DW / 2 - 0.15, Y + (DH + 0.3) / 2, FZ, out); box(0.3, DH + 0.3, 0.12, frameMat, GX + DW / 2 + 0.15, Y + (DH + 0.3) / 2, FZ, out);
  box(DW + 0.6, 0.3, 0.12, frameMat, GX, Y + DH + 0.15, FZ, out);
  const slats = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#8E959E'; x.fillRect(0, 0, w, h); for (let i = 0; i < 16; i++) { const gr = x.createLinearGradient(0, i * 16, 0, i * 16 + 16); gr.addColorStop(0, '#B4BAC2'); gr.addColorStop(0.5, '#8A9099'); gr.addColorStop(1, '#5E646C'); x.fillStyle = gr; x.fillRect(0, i * 16 + 1, w, 14); } x.fillStyle = 'rgba(182,255,59,.85)'; x.font = 'italic 800 40px "Barlow Condensed", sans-serif'; x.fillText('STATIC', 20, 200); });
  const doorMat = new THREE.MeshStandardMaterial({ map: slats, roughness: 0.45, metalness: 0.7, side: THREE.DoubleSide });
  const UP = 0.62;
  plane(DW, DH * (1 - UP), doorMat, GX, Y + DH - DH * (1 - UP) / 2, FZ - 0.07, PI, out);
  const bay = canvasTex(512, 256, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#3A3025'); gr.addColorStop(0.55, '#221C16'); gr.addColorStop(1, '#14110E'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,226,170,.75)'; x.fillRect(120, 18, 120, 6); x.fillRect(290, 18, 120, 6);
    x.fillStyle = '#4A4038'; for (let i = 0; i < 9; i++) x.fillRect(30 + i * 50, 70, 3, 60);
    x.fillStyle = '#2E3238'; x.fillRect(40, 140, 160, 40); x.fillStyle = '#16181C'; for (let i = 0; i < 3; i++) { x.beginPath(); x.ellipse(400 + i * 22, 200, 30, 38, 0, 0, PI * 2); x.fill(); }
    // (the lift's posts, a car shape on it, the work lamp's glow low on the left)
    x.fillStyle = '#3B3F46'; x.fillRect(150, 90, 10, 150); x.fillRect(352, 90, 10, 150);
    x.fillStyle = '#2A2C30'; x.beginPath(); x.moveTo(170, 196); x.quadraticCurveTo(256, 150, 342, 196); x.lineTo(342, 210); x.lineTo(170, 210); x.closePath(); x.fill();
    const lg = x.createRadialGradient(90, 200, 4, 90, 200, 90); lg.addColorStop(0, 'rgba(255,200,120,.35)'); lg.addColorStop(1, 'rgba(255,200,120,0)'); x.fillStyle = lg; x.fillRect(0, 100, 200, 156);
  });
  plane(DW, DH * UP + 0.02, new THREE.MeshBasicMaterial({ map: bay, color: new THREE.Color(0.9, 0.9, 0.9) }), GX, Y + DH * UP / 2, FZ - 0.02, PI, out);
  const sign = canvasTex(1024, 192, (x, w, h) => {
    x.fillStyle = '#121418'; x.fillRect(0, 0, w, h); x.strokeStyle = '#FFC93C'; x.lineWidth = 8; x.strokeRect(6, 6, w - 12, h - 12);
    x.fillStyle = '#FFC93C'; x.beginPath(); x.moveTo(92, 26); x.lineTo(52, 104); x.lineTo(86, 104); x.lineTo(66, 168); x.lineTo(128, 82); x.lineTo(92, 82); x.lineTo(112, 26); x.closePath(); x.fill();
    x.fillStyle = '#fff'; x.font = 'italic 800 104px "Barlow Condensed", sans-serif'; x.fillText('STATIC GARAGE', 160, 116);
    x.fillStyle = 'rgba(255,255,255,.7)'; x.font = '700 34px "Barlow Condensed", sans-serif'; x.fillText('EV TUNING · ROCKET PACKAGES · NO QUESTIONS', 166, 164);
  });
  const signMat = new THREE.MeshStandardMaterial({ map: sign, emissive: '#FFFFFF', emissiveMap: sign, emissiveIntensity: 0.35, roughness: 0.6 });
  plane(6.6, 6.6 * 192 / 1024, signMat, GX, Y + DH + 1.0, FZ - 0.08, PI, out);

  /* the bay: inside the building's shell, 14 m wide, 13 m deep, its walls facing in */
  const inn = new THREE.Group(); inn.visible = false; g.add(inn);
  const BX0 = GX - 7, BX1 = GX + 7, BZ0 = GZ, BZ1 = GZ + 13, BH = 5.0;
  const concrete = canvasTex(512, 512, (x, w, h) => { x.fillStyle = '#7C7A76'; x.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { const v = 100 + Math.random() * 40 | 0; x.fillStyle = `rgba(${v},${v - 2},${v - 6},.25)`; x.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 4, 2 + Math.random() * 4); } for (let i = 0; i < 7; i++) { x.fillStyle = 'rgba(30,26,22,.22)'; x.beginPath(); x.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 50, 10 + Math.random() * 30, Math.random() * 3, 0, PI * 2); x.fill(); } x.strokeStyle = 'rgba(40,38,36,.5)'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w, h / 2); x.moveTo(w / 2, 0); x.lineTo(w / 2, h); x.stroke(); });
  concrete.wrapS = concrete.wrapT = THREE.RepeatWrapping; concrete.repeat.set(3, 3);
  // (a slab a few cm over the block's own ground, so nothing of it shows through)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(BX1 - BX0 + 0.4, 0.2, BZ1 - BZ0 + 0.2), new THREE.MeshStandardMaterial({ map: concrete, color: '#B4B0A8', roughness: 0.8 }));
  floor.position.set(GX, Y + 0.035 - 0.1, (BZ0 + BZ1) / 2 + 0.1); floor.receiveShadow = true; inn.add(floor);
  // (painted block, years of it: each block its own shade, grime down from the lights and up from the floor)
  const block = canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = '#ADA699'; x.fillRect(0, 0, w, h);
    for (let r = 0; r < 8; r++) for (let c = -1; c < 6; c++) { const v = Math.random() * 18 - 9; x.fillStyle = `rgba(${v > 0 ? '255,250,240' : '40,34,28'},${Math.abs(v) / 90})`; x.fillRect(c * 96 + (r % 2) * 48, r * 32, 96, 32); }
    x.strokeStyle = 'rgba(96,90,80,.7)'; x.lineWidth = 3; for (let r = 0; r < 8; r++) { x.beginPath(); x.moveTo(0, r * 32); x.lineTo(w, r * 32); x.stroke(); for (let c = 0; c < 6; c++) { const px = c * 96 + (r % 2) * 48; x.beginPath(); x.moveTo(px, r * 32); x.lineTo(px, r * 32 + 32); x.stroke(); } }
    for (let i = 0; i < 14; i++) { const gx = Math.random() * w, gw = 6 + Math.random() * 30, gr = x.createLinearGradient(0, 0, 0, 90 + Math.random() * 90); gr.addColorStop(0, 'rgba(50,42,34,.28)'); gr.addColorStop(1, 'rgba(50,42,34,0)'); x.fillStyle = gr; x.fillRect(gx, 0, gw, 180); }
    x.fillStyle = '#24476F'; x.fillRect(0, h - 70, w, 70);
    const dirt = x.createLinearGradient(0, h - 90, 0, h); dirt.addColorStop(0, 'rgba(30,26,22,0)'); dirt.addColorStop(1, 'rgba(30,26,22,.45)'); x.fillStyle = dirt; x.fillRect(0, h - 90, w, 90);
  });
  block.wrapS = THREE.RepeatWrapping; block.repeat.set(3, 1);
  const wallMat = new THREE.MeshStandardMaterial({ map: block, roughness: 0.9 });
  plane(BX1 - BX0, BH, wallMat, GX, Y + BH / 2, BZ1, PI, inn);                       // back (facing north, in)
  plane(BZ1 - BZ0, BH, wallMat, BX0, Y + BH / 2, (BZ0 + BZ1) / 2, PI / 2, inn);       // west (facing east)
  plane(BZ1 - BZ0, BH, wallMat, BX1, Y + BH / 2, (BZ0 + BZ1) / 2, -PI / 2, inn);      // east (facing west)
  // the front wall either side of the door, and over it (facing south, in)
  plane(BX1 - BX0 - DW, BH, wallMat, BX0 + (BX1 - BX0 - DW) / 4, Y + BH / 2, BZ0 + 0.02, 0, inn).scale.x = 0.5;
  plane(BX1 - BX0 - DW, BH, wallMat, BX1 - (BX1 - BX0 - DW) / 4, Y + BH / 2, BZ0 + 0.02, 0, inn).scale.x = 0.5;
  plane(DW, BH - DH, wallMat, GX, Y + DH + (BH - DH) / 2, BZ0 + 0.02, 0, inn);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(BX1 - BX0, BZ1 - BZ0), new THREE.MeshStandardMaterial({ color: '#3A3B3E', roughness: 0.9 })); ceil.rotation.x = PI / 2; ceil.castShadow = true; ceil.position.set(GX, Y + BH, (BZ0 + BZ1) / 2); inn.add(ceil);
  // strip lights, a pegboard of tools on the east wall, a bench, tyres, the work lamp
  const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.55, 1.4) });
  for (const sx of [-3.5, 0, 3.5]) for (const sz of [3.5, 8.5]) box(0.14, 0.05, 2.4, stripMat, GX + sx, Y + BH - 0.05, BZ0 + sz, inn).castShadow = false;
  const peg = canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = '#C08A4E'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(60,40,20,.5)'; for (let r = 8; r < h; r += 16) for (let c = 8; c < w; c += 16) x.fillRect(c, r, 3, 3);
    const tool = (px, py, wd, ht, col) => { x.fillStyle = col; x.beginPath(); x.roundRect(px, py, wd, ht, 4); x.fill(); };
    for (let i = 0; i < 9; i++) tool(20 + i * 30, 30, 10, 70 + (i % 3) * 14, i % 2 ? '#B8BEC6' : '#9AA0A8');
    for (let i = 0; i < 6; i++) tool(300 + i * 32, 26, 22, 22 + i * 6, '#C9302C');
    tool(30, 140, 180, 18, '#3A3E44'); tool(260, 130, 70, 90, '#E8B020'); tool(360, 150, 120, 26, '#5B6168');
    x.fillStyle = '#1A1C20'; x.font = '800 22px "Barlow Condensed", sans-serif'; x.fillText('PUT IT BACK · G', 300, 240);
  });
  plane(8, 2.4, new THREE.MeshStandardMaterial({ map: peg, roughness: 0.8 }), BX1 - 0.03, Y + 2.2, GZ + 7, -PI / 2, inn);
  const benchMat = new THREE.MeshStandardMaterial({ color: '#3E4248', roughness: 0.6, metalness: 0.4 });
  box(0.9, 0.9, 5, benchMat, BX1 - 0.5, Y + 0.45, GZ + 7, inn);
  const red = new THREE.MeshStandardMaterial({ color: '#B22A24', roughness: 0.4, metalness: 0.4 });
  box(0.7, 1.1, 0.5, red, BX1 - 0.55, Y + 0.55, GZ + 10.6, inn); // a tool chest
  const tyre = new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.9 });
  // oil drums in the back corner, a rolling tool cart, a floor jack, and two things on the back wall: a poster of a
  // car Gears built (an original) and his shop sign about the nitrogen
  const drum = (col, x0, z0) => { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 18), new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, metalness: 0.5 })); d.position.set(x0, Y + 0.44, z0); d.castShadow = d.receiveShadow = true; inn.add(d); };
  drum('#2B5D9C', BX0 + 0.7, BZ1 - 0.8); drum('#9C2B24', BX0 + 1.4, BZ1 - 0.6); drum('#3C4046', BX0 + 0.75, BZ1 - 1.55);
  const cart = new THREE.Group(); cart.position.set(GX - 4.7, Y, GZ + 7.8); cart.rotation.y = 0.3; inn.add(cart);
  box(0.9, 0.06, 0.5, red, 0, 0.32, 0, cart); box(0.9, 0.06, 0.5, red, 0, 0.62, 0, cart); box(0.9, 0.3, 0.5, red, 0, 0.98, 0, cart);
  for (const [cx2, cz2] of [[-0.42, -0.22], [0.42, -0.22], [-0.42, 0.22], [0.42, 0.22]]) box(0.03, 0.85, 0.03, benchMat, cx2, 0.5, cz2, cart);
  box(0.3, 0.12, 0.2, new THREE.MeshStandardMaterial({ color: '#E8B020', roughness: 0.5 }), -0.15, 1.19, 0, cart);
  const jack = new THREE.Group(); jack.position.set(GX + 2.6, Y, GZ + 3.2); jack.rotation.y = 0.5; inn.add(jack);
  const orange = new THREE.MeshStandardMaterial({ color: '#E2782A', roughness: 0.45, metalness: 0.4 });
  box(0.36, 0.14, 0.8, orange, 0, 0.1, 0, jack); box(0.05, 0.05, 1.0, benchMat, 0, 0.32, -0.75, jack).rotation.x = -0.45;
  const poster = canvasTex(256, 360, (x, w, h) => {
    const bg = x.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#1B2230'); bg.addColorStop(1, '#0D1016'); x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.fillStyle = '#FFC93C'; x.font = 'italic 800 46px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.fillText('STATIC', w / 2, 62);
    x.fillStyle = '#E8ECF2'; x.beginPath(); x.moveTo(30, 230); x.quadraticCurveTo(70, 168, 128, 166); x.quadraticCurveTo(190, 168, 226, 222); x.lineTo(226, 244); x.lineTo(30, 244); x.closePath(); x.fill();
    x.fillStyle = '#0D1016'; for (const cx3 of [72, 186]) { x.beginPath(); x.arc(cx3, 246, 22, 0, PI * 2); x.fill(); x.fillStyle = '#9AA3AE'; x.beginPath(); x.arc(cx3, 246, 12, 0, PI * 2); x.fill(); x.fillStyle = '#0D1016'; }
    x.fillStyle = 'rgba(180,220,255,.6)'; for (let i = 0; i < 5; i++) { x.beginPath(); x.ellipse(28 - i * 6, 250 + i * 4, 10 + i * 4, 5 + i * 2, 0, 0, PI * 2); x.fill(); }
    x.fillStyle = '#fff'; x.font = '700 22px "Barlow Condensed", sans-serif'; x.fillText('COLD-GAS PACKAGE', w / 2, 300); x.fillStyle = 'rgba(255,255,255,.6)'; x.font = '600 16px "Barlow Condensed", sans-serif'; x.fillText('ASK GEARS', w / 2, 326);
  });
  plane(1.1, 1.55, new THREE.MeshStandardMaterial({ map: poster, roughness: 0.7 }), GX - 2.9, Y + 2.55, BZ1 - 0.03, PI, inn);
  const warn = canvasTex(320, 160, (x, w, h) => {
    x.fillStyle = '#F2C230'; x.fillRect(0, 0, w, h); x.fillStyle = '#16181C'; x.fillRect(8, 8, w - 16, 40);
    x.fillStyle = '#F2C230'; x.font = '800 30px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.fillText('CAUTION · NITROGEN', w / 2, 39);
    x.fillStyle = '#16181C'; x.font = '700 28px "Barlow Condensed", sans-serif'; x.fillText('VERY SAFE.', w / 2, 92); x.font = 'italic 700 24px "Barlow Condensed", sans-serif'; x.fillText('mostly.', w / 2, 128);
  });
  plane(1.0, 0.5, new THREE.MeshStandardMaterial({ map: warn, roughness: 0.6 }), GX - 5.7, Y + 2.3, BZ1 - 0.03, PI, inn);
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.8, 1.2) });
  const lamp = new THREE.Group(); lamp.position.set(GX - 3.4, Y, GZ + 5.4); inn.add(lamp);
  box(0.04, 1.5, 0.04, benchMat, 0, 0.75, 0, lamp); box(0.5, 0.03, 0.03, benchMat, 0, 0.02, 0, lamp); box(0.03, 0.03, 0.5, benchMat, 0, 0.02, 0, lamp);
  box(0.36, 0.22, 0.12, benchMat, 0.05, 1.5, 0.08, lamp); box(0.3, 0.16, 0.02, lampMat, 0.05, 1.5, 0.15, lamp).castShadow = false;
  // light in the bay (on only while it's seen)
  const warm = new THREE.PointLight('#FFD9A8', 0, 14, 1.6); warm.position.set(GX - 3.0, Y + 1.7, GZ + 5.8); inn.add(warm);
  const fill = new THREE.PointLight('#E8EEFF', 0, 18, 1.4); fill.position.set(GX + 1.5, Y + BH - 0.5, GZ + 6.5); inn.add(fill);
  // the creeper (the board he lies on under the car)
  const creeper = new THREE.Group(); inn.add(creeper);
  box(0.46, 0.05, 1.05, red, 0, 0.11, 0, creeper);
  for (const [cx2, cz2] of [[-0.18, -0.42], [0.18, -0.42], [-0.18, 0.42], [0.18, 0.42]]) { const w = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), tyre); w.position.set(cx2, 0.045, cz2); creeper.add(w); }
  // the old couch against the front wall, west of the door, facing into the bay (where Dan sleeps the night after
  // Mission 2): worn brown leather, two seat cushions, a pillow and a blanket at its west end
  const COUCH = { x: GX - 4.9, z: GZ + 0.62, seat: Y + 0.46, len: 2.2 };
  const couch = new THREE.Group(); couch.position.set(COUCH.x, Y, COUCH.z); inn.add(couch);
  const hide = new THREE.MeshStandardMaterial({ color: '#5B3B27', roughness: 0.62, metalness: 0.05 });
  const hideDk = new THREE.MeshStandardMaterial({ color: '#43291A', roughness: 0.7 });
  box(COUCH.len, 0.26, 0.86, hideDk, 0, 0.2, 0.02, couch);                                     // the frame
  for (const sx of [-0.5, 0.5]) box(1.0, 0.14, 0.7, hide, sx * 0.98, 0.39, 0.1, couch);         // the seat cushions
  box(COUCH.len, 0.56, 0.24, hide, 0, 0.6, -0.33, couch);                                        // the back
  for (const sx of [-1, 1]) box(0.2, 0.6, 0.86, hide, sx * (COUCH.len / 2 - 0.1), 0.36, 0.02, couch); // the arms
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.06, 0.07, 0.06, benchMat, lx * (COUCH.len / 2 - 0.12), 0.035, lz * 0.36, couch);
  const pillow = box(0.46, 0.14, 0.34, new THREE.MeshStandardMaterial({ color: '#C9C2B2', roughness: 0.9 }), -0.82, 0.55, 0.0, couch); pillow.rotation.set(0.15, 0.2, -0.35);
  const blanket = box(0.7, 0.06, 0.62, new THREE.MeshStandardMaterial({ color: '#2E4E6E', roughness: 0.95 }), 0.62, 0.48, 0.12, couch); blanket.rotation.set(0.05, -0.12, 0.04);

  /* the shop's kit, merged by material (a draw call each): a two-post lift in the back west corner, its arms down; a
     tyre rack and a workbench with a vice on the back wall; steel shelving of boxes and cans on the west wall under a
     second tool wall; pendant work lights over the car; an air compressor in the front east corner; more drums; the
     bay's yellow lines and oil stains on the floor; conduit along the walls; a clock */
  const kit = new Map();
  const _m4 = new THREE.Matrix4(), _e = new THREE.Euler(), _qk = new THREE.Quaternion(), _s = new THREE.Vector3();
  const put = (mat, geo, x, y, z, rx = 0, ry = 0, rz = 0) => { geo.applyMatrix4(_m4.compose(V(x, y, z), _qk.setFromEuler(_e.set(rx, ry, rz)), _s.set(1, 1, 1))); if (!kit.has(mat)) kit.set(mat, []); kit.get(mat).push(geo); };
  const cube = (mat, w, h, d, x, y, z, ry = 0) => put(mat, new THREE.BoxGeometry(w, h, d), x, y, z, 0, ry);
  const steel = new THREE.MeshStandardMaterial({ color: '#5E646C', roughness: 0.45, metalness: 0.75 });
  const liftMat = new THREE.MeshStandardMaterial({ color: '#C9A227', roughness: 0.5, metalness: 0.35 });   // (safety yellow)
  const wood = new THREE.MeshStandardMaterial({ color: '#8A6440', roughness: 0.75 });
  const card = new THREE.MeshStandardMaterial({ color: '#A88660', roughness: 0.9 });
  const tin = new THREE.MeshStandardMaterial({ color: '#8C3A2A', roughness: 0.5, metalness: 0.5 });
  const green = new THREE.MeshStandardMaterial({ color: '#2F5D45', roughness: 0.5, metalness: 0.5 });
  const paint = new THREE.MeshStandardMaterial({ color: '#E2B53A', roughness: 0.7 });
  const bulb = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.6, 1.8) });
  // the lift: two posts, their feet, the beam over them, two arms each folded down by the posts, the power unit
  const LX0 = GX - 5.7, LX1 = GX - 2.5, LZ = GZ + 10.6;
  for (const lx of [LX0, LX1]) {
    cube(liftMat, 0.32, 3.6, 0.32, lx, Y + 1.8, LZ); cube(steel, 0.6, 0.06, 0.6, lx, Y + 0.03, LZ);
    cube(steel, 0.14, 0.4, 0.2, lx + (lx < GX - 4 ? 0.22 : -0.22), Y + 0.5, LZ);
    for (const dz of [-1, 1]) put(steel, new THREE.BoxGeometry(0.1, 0.07, 1.05), lx + (lx < GX - 4 ? 0.35 : -0.35), Y + 0.32, LZ + dz * 0.55, 0, dz * (lx < GX - 4 ? -0.45 : 0.45), 0);
  }
  cube(liftMat, LX1 - LX0 + 0.32, 0.22, 0.26, (LX0 + LX1) / 2, Y + 3.7, LZ);
  cube(green, 0.34, 0.5, 0.26, LX0 - 0.05, Y + 1.35, LZ + 0.3);
  // the tyre rack (back wall, east): two shelves of tyres stood on their treads
  const RX0 = GX + 2.6, RX1 = GX + 5.6, RZ = BZ1 - 0.45;
  for (const ry of [0.55, 1.45]) cube(steel, RX1 - RX0, 0.05, 0.6, (RX0 + RX1) / 2, Y + ry, RZ);
  for (const rx of [RX0, RX1]) for (const dz of [-0.27, 0.27]) cube(steel, 0.05, 2.0, 0.05, rx, Y + 1.0, RZ + dz);
  for (const ry of [0.55, 1.45]) for (let i = 0; i < 7; i++) put(tyre, new THREE.TorusGeometry(0.3, 0.11, 8, 20), RX0 + 0.3 + i * 0.4 + (ry > 1 ? 0.12 : 0), Y + ry + 0.43, RZ, 0, PI / 2 + (i % 2 ? 0.06 : -0.05), 0);
  for (let i = 0; i < 3; i++) put(tyre, new THREE.TorusGeometry(0.33, 0.13, 8, 20), BX1 - 1.1, Y + 0.13 + i * 0.27, BZ1 - 1.6, PI / 2, 0, 0);
  // the workbench (back wall, middle): a thick wooden top on steel legs, a shelf under it, a vice, a toolbox, cans
  const WX = GX + 0.4, WZ = BZ1 - 0.42;
  cube(wood, 2.6, 0.07, 0.8, WX, Y + 0.92, WZ); cube(wood, 2.5, 0.03, 0.7, WX, Y + 0.25, WZ);
  for (const dx of [-1.22, 1.22]) for (const dz of [-0.34, 0.34]) cube(steel, 0.06, 0.9, 0.06, WX + dx, Y + 0.45, WZ + dz);
  cube(steel, 0.18, 0.12, 0.2, WX - 0.95, Y + 1.02, WZ - 0.32); cube(steel, 0.05, 0.14, 0.05, WX - 0.95, Y + 1.15, WZ - 0.32); cube(steel, 0.3, 0.03, 0.03, WX - 0.95, Y + 1.08, WZ - 0.45);
  cube(red, 0.55, 0.22, 0.26, WX + 0.6, Y + 1.07, WZ + 0.05); cube(tin, 0.12, 0.2, 0.08, WX + 0.1, Y + 1.06, WZ + 0.15);
  for (let i = 0; i < 4; i++) put(i % 2 ? tin : green, new THREE.CylinderGeometry(0.06, 0.06, 0.16, 10), WX - 0.3 + i * 0.14, Y + 1.04, WZ - 0.1);
  for (let i = 0; i < 5; i++) cube(card, 0.4, 0.28, 0.35, WX - 0.9 + i * 0.48, Y + 0.42, WZ + (i % 2 ? 0.05 : -0.05), (i % 3) * 0.08);
  // the shelving (west wall, by the door): four steel shelves of boxes, oil and parts
  const SX = BX0 + 0.38, SZ0 = GZ + 2.6, SZ1 = GZ + 5.4;
  for (const sz of [SZ0, SZ1]) for (const dx of [-0.25, 0.25]) cube(steel, 0.05, 2.3, 0.05, SX + dx, Y + 1.15, sz);
  for (let k = 0; k < 4; k++) {
    const sy = Y + 0.2 + k * 0.62; cube(steel, 0.55, 0.04, SZ1 - SZ0, SX, sy, (SZ0 + SZ1) / 2);
    for (let i = 0; i < 5; i++) { const z = SZ0 + 0.35 + i * 0.52, kind = (i * 7 + k * 3) % 5;
      if (kind < 2) cube(card, 0.42, 0.26 + kind * 0.08, 0.42, SX, sy + 0.15 + kind * 0.04, z, (i + k) * 0.13);
      else if (kind < 4) for (let j = 0; j < 3; j++) put(kind === 2 ? tin : green, new THREE.CylinderGeometry(0.075, 0.075, 0.24, 10), SX - 0.1 + (j % 2) * 0.18, sy + 0.14, z - 0.15 + j * 0.15);
      else cube(red, 0.36, 0.18, 0.3, SX, sy + 0.11, z); }
  }
  // pendant work lights over the car and the bench: a shade, its bulb, a cord to the ceiling
  for (const [lx, lz, drop] of [[GX + 1.2, GZ + 4.6, 1.6], [GX + 1.2, GZ + 7.8, 1.6], [WX, BZ1 - 1.3, 1.9], [GX - 3.6, GZ + 6.6, 1.5]]) {
    put(steel, new THREE.CylinderGeometry(0.09, 0.32, 0.26, 14, 1, true), lx, Y + BH - drop, lz);
    put(bulb, new THREE.SphereGeometry(0.075, 10, 6), lx, Y + BH - drop - 0.08, lz);
    put(steel, new THREE.CylinderGeometry(0.008, 0.008, drop - 0.13, 4), lx, Y + BH - (drop - 0.13) / 2, lz);
  }
  // the compressor (front east corner): a red tank on its side, the motor on it, the gauge, a coiled hose
  const CX = BX1 - 0.9, CZ = GZ + 1.1;
  put(red, new THREE.CylinderGeometry(0.28, 0.28, 1.2, 16), CX, Y + 0.38, CZ, 0, 0, PI / 2);
  cube(steel, 0.42, 0.3, 0.34, CX - 0.15, Y + 0.8, CZ); put(steel, new THREE.CylinderGeometry(0.12, 0.12, 0.08, 14), CX + 0.3, Y + 0.78, CZ, PI / 2, 0, 0);
  put(tyre, new THREE.TorusGeometry(0.22, 0.02, 6, 24), BX1 - 0.06, Y + 1.4, CZ + 0.9, 0, PI / 2, 0);
  for (const [dx, dz] of [[-0.45, -0.18], [0.45, -0.18], [-0.45, 0.18], [0.45, 0.18]]) cube(steel, 0.06, 0.12, 0.06, CX + dx, Y + 0.06, CZ + dz);
  // two more drums by the lift, one on its side on a stand
  put(green, new THREE.CylinderGeometry(0.29, 0.29, 0.88, 16), BX0 + 2.1, Y + 0.44, BZ1 - 0.55);
  put(tin, new THREE.CylinderGeometry(0.29, 0.29, 0.88, 16), BX0 + 2.0, Y + 0.62, BZ1 - 1.6, 0, 0, PI / 2); cube(steel, 0.9, 0.3, 0.5, BX0 + 2.0, Y + 0.17, BZ1 - 1.6);
  // the bay's yellow lines round the car, and the lift's
  const line = (x0, z0, x1, z1) => { const l = Math.hypot(x1 - x0, z1 - z0); put(paint, new THREE.PlaneGeometry(0.08, l), (x0 + x1) / 2, Y + 0.04, (z0 + z1) / 2, -PI / 2, 0, Math.atan2(x1 - x0, z1 - z0)); };
  const box2 = (x0, z0, x1, z1) => { line(x0, z0, x1, z0); line(x1, z0, x1, z1); line(x1, z1, x0, z1); line(x0, z1, x0, z0); };
  box2(GX - 0.4, GZ + 2.5, GX + 2.8, GZ + 9.9); box2(LX0 - 0.6, LZ - 2.6, LX1 + 0.6, LZ + 1.4);
  // conduit: along the back and east walls under the ceiling, down to a switch box by the bench
  put(steel, new THREE.CylinderGeometry(0.025, 0.025, BX1 - BX0, 6), GX, Y + BH - 0.35, BZ1 - 0.06, 0, 0, PI / 2);
  put(steel, new THREE.CylinderGeometry(0.025, 0.025, BZ1 - BZ0, 6), BX1 - 0.06, Y + BH - 0.35, (BZ0 + BZ1) / 2, PI / 2, 0, 0);
  put(steel, new THREE.CylinderGeometry(0.02, 0.02, BH - 1.75, 6), WX + 1.5, Y + 1.4 + (BH - 1.75) / 2, BZ1 - 0.06); cube(steel, 0.22, 0.3, 0.1, WX + 1.5, Y + 1.3, BZ1 - 0.08);
  for (const [mat, geos] of kit) { const m = new THREE.Mesh(mergeGeometries(geos, false), mat); m.castShadow = mat !== bulb && mat !== paint; m.receiveShadow = true; inn.add(m); }
  // oil stains under the car and the lift (a sheet of them)
  const stains = canvasTex(512, 512, (x, w, h) => { for (let i = 0; i < 18; i++) { const cx = 60 + Math.random() * (w - 120), cy = 60 + Math.random() * (h - 120), r = 14 + Math.random() * 50; const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, 'rgba(16,13,10,.55)'); gr.addColorStop(0.7, 'rgba(16,13,10,.3)'); gr.addColorStop(1, 'rgba(16,13,10,0)'); x.fillStyle = gr; x.beginPath(); x.ellipse(cx, cy, r, r * (0.5 + Math.random() * 0.5), Math.random() * 3, 0, PI * 2); x.fill(); } });
  const stainMat = new THREE.MeshStandardMaterial({ map: stains, transparent: true, depthWrite: false, roughness: 0.25 });
  for (const [sx, sz, sw, sd] of [[GX + 1.2, GZ + 6.2, 3.2, 6.4], [(LX0 + LX1) / 2, LZ - 0.6, 3.6, 3.2]]) { const st = new THREE.Mesh(new THREE.PlaneGeometry(sw, sd), stainMat); st.rotation.x = -PI / 2; st.position.set(sx, Y + 0.037, sz); st.receiveShadow = true; inn.add(st); }
  // a second tool wall (west, over the lift's end): spanners in a row by size, hammers, pliers, saws, a coil of hose
  const peg2 = canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = '#5B636B'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(20,24,28,.55)'; for (let r = 8; r < h; r += 16) for (let c = 8; c < w; c += 16) x.fillRect(c, r, 3, 3);
    const sp = (px, py, len) => { x.fillStyle = '#C3C8CE'; x.fillRect(px - 3, py, 6, len); x.beginPath(); x.arc(px, py, 9, 0, PI * 2); x.arc(px, py + len, 7, 0, PI * 2); x.fill(); x.fillStyle = '#5B636B'; x.fillRect(px - 3, py - 10, 6, 8); };
    for (let i = 0; i < 12; i++) sp(24 + i * 22, 24, 50 + i * 6);
    x.fillStyle = '#2A2C30'; for (let i = 0; i < 3; i++) { x.fillRect(320 + i * 50, 30, 10, 90); x.fillStyle = '#9AA0A8'; x.fillRect(306 + i * 50, 26, 38, 16); x.fillStyle = '#2A2C30'; }
    x.fillStyle = '#C9302C'; for (let i = 0; i < 4; i++) { x.save(); x.translate(40 + i * 46, 170); x.rotate(0.2); x.fillRect(-4, 0, 8, 60); x.fillRect(4, 0, 8, 60); x.restore(); }
    x.strokeStyle = '#E2B53A'; x.lineWidth = 7; for (let i = 0; i < 4; i++) { x.beginPath(); x.ellipse(420, 180, 48 - i * 9, 44 - i * 9, 0, 0, PI * 2); x.stroke(); }
    x.fillStyle = '#B9BEC4'; x.beginPath(); x.moveTo(230, 150); x.lineTo(330, 150); x.lineTo(330, 170); x.lineTo(230, 200); x.closePath(); x.fill();
  });
  plane(5.2, 2.0, new THREE.MeshStandardMaterial({ map: peg2, roughness: 0.75, metalness: 0.2 }), BX0 + 0.03, Y + 2.3, GZ + 9.4, PI / 2, inn);
  // two more posters of the shop's own (originals: no names but the shop's): a street rod on the west wall, the shop's
  // rules by the door
  const rod = canvasTex(256, 360, (x, w, h) => {
    x.fillStyle = '#E9E1CF'; x.fillRect(0, 0, w, h); x.fillStyle = '#B4342C'; x.fillRect(0, 0, w, 70);
    x.fillStyle = '#E9E1CF'; x.font = 'italic 800 40px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.fillText('WEST CHELSEA', w / 2, 48);
    x.fillStyle = '#1D2430'; x.beginPath(); x.moveTo(26, 230); x.lineTo(44, 196); x.lineTo(110, 188); x.lineTo(140, 160); x.lineTo(196, 160); x.lineTo(214, 192); x.lineTo(236, 200); x.lineTo(236, 232); x.closePath(); x.fill();
    for (const [cx3, r3] of [[66, 26], [196, 30]]) { x.fillStyle = '#1D2430'; x.beginPath(); x.arc(cx3, 238, r3, 0, PI * 2); x.fill(); x.fillStyle = '#C9CDD2'; x.beginPath(); x.arc(cx3, 238, r3 * 0.45, 0, PI * 2); x.fill(); }
    x.fillStyle = '#1D2430'; x.font = '800 30px "Barlow Condensed", sans-serif'; x.fillText('STREET MACHINES', w / 2, 300); x.font = '600 18px "Barlow Condensed", sans-serif'; x.fillText('SATURDAY NIGHTS · PIER 64 · 1994', w / 2, 330);
  });
  plane(1.0, 1.4, new THREE.MeshStandardMaterial({ map: rod, roughness: 0.7 }), BX0 + 0.03, Y + 2.7, GZ + 6.8, PI / 2, inn);
  const rules = canvasTex(256, 320, (x, w, h) => {
    x.fillStyle = '#16181C'; x.fillRect(0, 0, w, h); x.strokeStyle = '#FFC93C'; x.lineWidth = 6; x.strokeRect(8, 8, w - 16, h - 16);
    x.fillStyle = '#FFC93C'; x.font = 'italic 800 34px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.fillText('SHOP RULES', w / 2, 52);
    x.fillStyle = '#F2EFE8'; x.font = '700 22px "Barlow Condensed", sans-serif'; x.textAlign = 'left';
    ['1. PUT IT BACK', '2. NO ROCKETS INDOORS', '3. ASK BEFORE THE LIFT', '4. COFFEE IS FOR', '    CLOSERS AND GEARS', '5. MOSTLY SAFE'].forEach((t, i) => x.fillText(t, 26, 100 + i * 34));
  });
  plane(0.8, 1.0, new THREE.MeshStandardMaterial({ map: rules, roughness: 0.7 }), BX0 + 2.0, Y + 2.0, BZ0 + 0.04, 0, inn);
  // the clock over the bench
  const clock = canvasTex(128, 128, (x, w) => { x.fillStyle = '#F4F1EA'; x.beginPath(); x.arc(64, 64, 62, 0, PI * 2); x.fill(); x.lineWidth = 6; x.strokeStyle = '#1A1C20'; x.stroke();
    x.fillStyle = '#1A1C20'; for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; x.fillRect(64 + Math.sin(a) * 50 - 2, 64 - Math.cos(a) * 50 - 2, 4, 4); }
    x.lineCap = 'round'; x.lineWidth = 5; x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + 24, 64 - 30); x.stroke(); x.lineWidth = 3; x.beginPath(); x.moveTo(64, 64); x.lineTo(64 - 4, 64 - 46); x.stroke(); void w; });
  const cl = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), new THREE.MeshStandardMaterial({ map: clock, roughness: 0.5 })); cl.position.set(WX, Y + 3.2, BZ1 - 0.03); cl.rotation.y = PI; inn.add(cl);

  // the city's walls inside the bay: the party wall between two of the block's buildings runs the length of the bay
  // (x = GX + 1.6, through the car), so while the bay is seen the city's boxes that stand in it are folded away (found
  // the first time by rays across the bay at head height: every instanced face they meet inside it), and put back
  // when it is not (their shadow stand-ins are left: the bay has its own ceiling)
  let cityIn = null; const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
  function cityWalls(on) {
    if (on && !cityIn) {
      cityIn = []; const seen = new Set(), targets = [], rc = new THREE.Raycaster(); rc.far = 15;
      scene.traverse((o) => { if (o.isInstancedMesh && o.visible !== false && !o.isSkinnedMesh) targets.push(o); });
      const rays = [];
      for (const oz of [BZ0 + 1.5, (BZ0 + BZ1) / 2, BZ1 - 1.5]) for (const ox of [GX - 3, GX + 4]) rays.push([ox, oz, 1, 0], [ox, oz, -1, 0]);
      for (const ox of [GX - 4.5, GX, GX + 4.5]) rays.push([ox, BZ0 + 1, 0, 1], [ox, BZ1 - 1, 0, -1]);
      for (const [ox, oz, dx, dz] of rays) {
        rc.set(V(ox, Y + 1.6, oz), V(dx, 0, dz));
        for (const h of rc.intersectObjects(targets, false)) {
          const p = h.point; if (h.instanceId == null || p.x < BX0 + 0.1 || p.x > BX1 - 0.1 || p.z < BZ0 + 0.1 || p.z > BZ1 - 0.1) continue;
          const k = h.object.uuid + ':' + h.instanceId; if (seen.has(k)) continue; seen.add(k);
          const m = new THREE.Matrix4(); h.object.getMatrixAt(h.instanceId, m); cityIn.push([h.object, h.instanceId, m]);
        }
      }
    }
    for (const [mesh, id, m] of cityIn || []) { mesh.setMatrixAt(id, on ? _zero : m); mesh.instanceMatrix.needsUpdate = true; }
  }

  // the bay's moods for the night after Mission 2: 'night' (the shop shut: its lights off, a cold street light through
  // the half-open door, the work lamp low) and 'morning' (the sun low through the door, a warm shaft across the floor
  // to the couch); null: the shop at work. (The bay's own two lights do it, moved and recoloured: a light more in the
  // scene would rebuild every lit material's shader the moment it came on)
  const SUN_AT = V(GX + 2.4, Y + 5.2, GZ - 6.5);
  const LIT = {
    work: { warm: ['#FFD9A8', 9, [GX - 3.0, Y + 1.7, GZ + 5.8]], fill: ['#E8EEFF', 7, [GX + 1.5, Y + BH - 0.5, GZ + 6.5]] },
    night: { warm: ['#FFB070', 2.2, [GX - 3.0, Y + 1.7, GZ + 5.8]], fill: ['#7C9CFF', 12, [GX - 1.9, Y + 2.5, GZ + 1.3]] },
    dark: { warm: ['#FFB070', 0, [GX - 3.0, Y + 1.7, GZ + 5.8]], fill: ['#6F8FFF', 6, [GX - 1.9, Y + 2.5, GZ + 1.3]] },
    morning: { warm: ['#FFE6C4', 2.4, [GX - 3.2, Y + 1.2, GZ + 3.4]], fill: ['#FFB25E', 16, [GX - 2.2, Y + 1.6, GZ + 0.7]] },
  };
  // (the shaft: the door's opening swept along the sun's way in down to the floor, warm haze brightest at the door: the
  // four sides of it, additive, their colour fading to nothing at the far end)
  const shaft = (() => {
    const d = V(GX - 1.4, Y + 1.3, GZ).sub(SUN_AT).normalize();
    const c = [[GX - 2.6, Y + 0.05], [GX - 0.2, Y + 0.05], [GX - 0.2, Y + 2.45], [GX - 2.6, Y + 2.45]].map(([x, y]) => V(x, y, GZ + 0.05));
    const e = c.map((p) => p.clone().addScaledVector(d, Math.max(0.4, (p.y - Y - 0.02) / -d.y)));
    const pos = [], col = [];
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4], a2 = e[i], b2 = e[(i + 1) % 4];
      for (const [p, k] of [[a, 1], [b, 1], [b2, 0], [a, 1], [b2, 0], [a2, 0]]) { pos.push(p.x, p.y, p.z); col.push(k, k, k); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32, 0.22, 0.12), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    m.renderOrder = 4; m.visible = false; m.frustumCulled = false; inn.add(m); return m;
  })();
  const STRIP = stripMat.color.clone(), BULB = bulb.color.clone(), LAMP = lampMat.color.clone();
  let mood = null, inOn = false, glowAt = null;
  function lights() {
    const work = inOn && !mood, L = LIT[mood || 'work'];
    for (const [light, [col, k, at]] of [[warm, L.warm], [fill, L.fill]]) { light.color.set(col); light.intensity = inOn ? k : 0; light.position.set(...at); }
    // (a phone's glow on his face: the warm light borrowed, small and cold)
    if (glowAt && inOn) { warm.color.set('#B4C8FF'); warm.intensity = glowAt[3]; warm.position.set(glowAt[0], glowAt[1], glowAt[2]); }
    shaft.visible = inOn && mood === 'morning';
    stripMat.color.copy(STRIP).multiplyScalar(work ? 1 : 0.035);
    bulb.color.copy(BULB).multiplyScalar(work ? 1 : 0.03);
    lampMat.color.copy(LAMP).multiplyScalar(work || mood === 'night' ? 1 : 0.04);
  }

  const G = {
    group: g, creeper, lamp,
    bay: { x0: BX0, x1: BX1, z0: BZ0, z1: BZ1 },
    show(on) { g.visible = !!on; },
    couch: COUCH,
    inside(on) { inn.visible = !!on; inOn = !!on; lights(); if (on || cityIn) cityWalls(!!on); },
    // the bay's mood: 'night' | 'dark' (the work lamp off too) | 'morning' | null (at work)
    mood(m = null) { mood = m || null; glowAt = null; lights(); },
    // a small cold light at p (a phone's screen; null: none), k its strength
    glow(p, k = 1.2) {
      if (!p) { if (glowAt) { glowAt = null; lights(); } return; }
      glowAt = [p.x, p.y, p.z, k]; if (inOn) { warm.color.set('#B4C8FF'); warm.intensity = k; warm.position.set(p.x, p.y, p.z); }
    },
    get moodNow() { return mood; },
  };
  return G;
}

/* --------------------------------------------------------------- SUV -- */
export function buildSUV(W) {
  const N = window.NYC, g = new THREE.Group(); g.name = 'wagmi-m3-suv';
  const spec = N?.BODY_SPECS?.suv;
  if (spec && N.buildCarGeometry && N.createLoftedCarMaterial) {
    const m = new THREE.Mesh(N.buildCarGeometry(spec, true), N.createLoftedCarMaterial(spec, 0x0c0d0f)); m.castShadow = true; m.receiveShadow = true; g.add(m);
  } else { const m = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.5, 4.6), new THREE.MeshStandardMaterial({ color: '#0c0d0f', roughness: 0.4 })); m.position.y = 0.95; g.add(m); }
  const acid = new THREE.MeshStandardMaterial({ color: '#B6FF3B', emissive: '#6FA81A', emissiveIntensity: 0.8, roughness: 0.4, metalness: 0.3 });
  const rims = [];
  for (const sx of [-1, 1]) for (const z of [-1.4, 1.4]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.032, 8, 28), acid); r.rotation.y = PI / 2; r.position.set(sx * 1.005, 0.39, z); g.add(r); rims.push(r); }
  g.visible = false; W.app.scene.add(g);
  return { group: g, spin(d) { for (const r of rims) r.rotation.x += d; } };
}

/* ------------------------------------------------------------ people -- */
const MH_ARM = ['upperarm01_', 'lowerarm01_', 'wrist_'];

// two-bone reach for an arm (side 'L' | 'R'): the hand to a world point, the elbow toward pole, by weight w
// (names: the arm's three bones less the side, the thug's by default; Dan's skeleton's (Gears', Fiona's) are MH_ARM)
const _q = new THREE.Quaternion(), _w = new THREE.Quaternion();
function turnWorld(b, q) { b.getWorldQuaternion(_w); const want = q.clone().multiply(_w); b.parent.getWorldQuaternion(_w); b.quaternion.copy(_w.invert().multiply(want)); b.updateMatrixWorld(true); }
export function armTo(B, side, target, pole, w = 1, names = ['upperArm', 'forearm', 'hand']) {
  const b1 = B[names[0] + side], b2 = B[names[1] + side], b3 = B[names[2] + side];
  if (!b1 || !b2 || !b3 || w <= 0) return;
  const q1 = b1.quaternion.clone(), q2 = b2.quaternion.clone();
  const a = b1.getWorldPosition(V()), b = b2.getWorldPosition(V()); let c = b3.getWorldPosition(V());
  const la = a.distanceTo(b), lb = b.distanceTo(c), d = clamp(target.distanceTo(a), 0.05, la + lb - 1e-3);
  const cur = a.clone().sub(b).normalize().angleTo(c.clone().sub(b).normalize());
  const want = Math.acos(clamp((la * la + lb * lb - d * d) / (2 * la * lb), -1, 1));
  const n = V().crossVectors(a.clone().sub(b), c.clone().sub(b)); if (n.lengthSq() < 1e-8) n.set(1, 0, 0); n.normalize();
  turnWorld(b2, _q.setFromAxisAngle(n, want - cur));
  c = b3.getWorldPosition(V());
  turnWorld(b1, _q.setFromUnitVectors(c.sub(a).normalize(), target.clone().sub(a).normalize()));
  const ax = target.clone().sub(a).normalize(), e = b2.getWorldPosition(V()).sub(a), p = pole.clone().sub(a);
  e.addScaledVector(ax, -e.dot(ax)); p.addScaledVector(ax, -p.dot(ax));
  if (e.lengthSq() > 1e-6 && p.lengthSq() > 1e-6) { let ang = e.angleTo(p); if (V().crossVectors(e, p).dot(ax) < 0) ang = -ang; turnWorld(b1, _q.setFromAxisAngle(ax, ang)); }
  if (w < 0.999) { b1.quaternion.slerpQuaternions(q1, b1.quaternion.clone(), w); b2.quaternion.slerpQuaternions(q2, b2.quaternion.clone(), w); b1.updateMatrixWorld(true); }
}

// (Mog City, 27 Oct, the owner: everyone "standing up straight, making natural movements") the cast's skeleton
// (MakeHuman, Dan's) is saved with its armature turned 11-14 degrees forward and over, a lean in every clip: zeroed, and
// lifted the 2 cm that puts the feet back on the ground, as wagmi/game.js does for Dan. Then their own moves over the
// CMU clips of the same name (those stood in a crouch, knees 25-38 degrees): assets/anim/bandai/<who>-moves.glb (Bandai
// Namco Research Motion Dataset, CC BY-NC 4.0, see NOTICE; retargeted to each one's own body): 'idle' the dataset's
// neutral stand, breathing (knees 2-5 degrees), and Fiona's 'run' (a dash, in place; its speed at 1x, m/s, in the
// pack's extras: P.runSpeed), and Gears' 'talk' (his own talking hands over that idle's legs, his torso stood up out of
// the take's 17-21 degree stoop). Any other talk keeps its upper body over the new idle's legs and hips (LOWER)
const LOWER = /^(root|pelvis_|upperleg|lowerleg|foot_|toe)/;
async function castMoves(inner, bones, clipMap, who) {
  const arm = bones.root?.parent; if (arm && arm !== inner) { arm.quaternion.identity(); arm.position.y += 0.02; }
  const pk = await loadGLB(`assets/anim/bandai/${who}-moves.glb`).catch((e) => { console.warn('[m3] moves', who, e); return null; });
  const info = {};
  (pk?.animations || []).forEach((c, i) => { clipMap[c.name] = c; info[c.name] = pk.parser?.json?.animations?.[i]?.extras || {}; });
  const idle = pk && clipMap.idle;
  if (idle && clipMap.talk && !info.talk) {
    const t = clipMap.talk, keep = (tr) => LOWER.test(tr.name.split('.')[0]);
    clipMap.talk = new THREE.AnimationClip('talk', t.duration, [...t.tracks.filter((tr) => !keep(tr)), ...idle.tracks.filter(keep)]);
  }
  return info;
}

// a thing fixed to a bone, placed in the rest pose (built at the origin, root at the origin facing +z)
function onBone(P, bone, obj, x, y, z) { P.inner.updateMatrixWorld(true); obj.position.copy(P.inner.worldToLocal(V(x, y, z))); P.inner.add(obj); P.bones[bone]?.attach(obj); obj.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } }); return obj; }

// Floor Price Fiona: the Suits' hype host, her own model (assets/characters/fiona.glb, made the way Gears' is, from the
// a MakeHuman-built human: an invented woman, a platinum ponytail, a white tee and a long white denim skirt, white trainers;
// idle, talk, cheer, wave, walk, jog, run, shrug, phone, arms), on Dan's skeleton (upperarm01_, lowerarm01_, wrist_).
// The scenes ask for the thug's 'thugIdle' (her idle) and 'run' (the library's run). White shades on her head bone, the
// megaphone in her right hand (posed each frame by hype()).
let fionaP = null;
const fionaGLB = () => fionaP || (fionaP = loadGLB('assets/characters/fiona.glb'));
export async function buildFiona(W) {
  const gltf = await fionaGLB();
  const root = new THREE.Group(); root.name = 'Fiona';
  const inner = skClone(gltf.scene); root.add(inner);
  inner.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  const bones = {}; inner.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  inner.updateMatrixWorld(true);
  const top = new THREE.Box3().setFromObject(inner).max.y;
  const mixer = new THREE.AnimationMixer(inner);
  const clipMap = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
  const moves = await castMoves(inner, bones, clipMap, 'fiona');
  if (clipMap.idle) clipMap.thugIdle = clipMap.idle;
  if (!clipMap.run && clipMap.jog) clipMap.run = clipMap.jog;
  root.visible = false; W.app.scene.add(root);
  const P = { root, inner, bones, mixer, rig: rig(mixer, clipMap), clips: Object.keys(clipMap), top, arm: (side, target, pole, w) => armTo(bones, side, target, pole, w, MH_ARM), relax: () => {}, runSpeed: moves.run?.speed || 0 };
  // her face (wagmi/face.js, 23 Oct round 3): her mouth with her lines (on the megaphone too), blinks behind her shades
  faceOn(W, P, 'Fiona', { open: 0.42 });
  const B = bones;
  // her eyes in the bind pose (the vertices the eyes' own primitive draws, through the skin's bind matrix: the GLB's
  // primitives share one vertex list, so not its bounding box; and its bones were saved mid-clip, so the model as it
  // loads is not in that pose): the shades hung on her head bone just in front of them, the way the skin hangs on it
  const eb = new THREE.Box3(), _v = V(); let eyeMesh = null;
  inner.traverse((o) => { if (!o.isSkinnedMesh || !/eyes/.test(o.material?.name || '')) return; eyeMesh = o; const g = o.geometry, pa = g.attributes.position, ix = g.index;
    const n = ix ? ix.count : pa.count; for (let i = 0; i < n; i++) eb.expandByPoint(_v.fromBufferAttribute(pa, ix ? ix.getX(i) : i).applyMatrix4(o.bindMatrix)); });
  const shades = new THREE.Group(), frame = new THREE.MeshStandardMaterial({ color: '#F4F4F6', roughness: 0.3 }), lens = new THREE.MeshPhysicalMaterial({ color: '#08080A', roughness: 0.05, metalness: 0.5, clearcoat: 1 });
  for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.038, 0.01), frame); l.position.x = sx * 0.033; l.rotation.y = sx * 0.18; shades.add(l); const k = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.029, 0.007), lens); k.position.set(sx * 0.033, 0, 0.004); k.rotation.y = sx * 0.18; shades.add(k);
    // (the arms back to her ears)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.007, 0.1), frame); arm.position.set(sx * 0.064, 0.008, -0.05); arm.rotation.y = sx * -0.06; shades.add(arm); }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.006, 0.008), frame); bridge.position.set(0, 0.009, 0.002); shades.add(bridge);
  const hb = eyeMesh && eyeMesh.skeleton.bones.findIndex((b) => b.name === 'head');
  if (eyeMesh && hb >= 0 && !eb.isEmpty()) {
    const eye = eb.getCenter(V()).setZ(eb.max.z), at = new THREE.Matrix4().makeTranslation(eye.x, eye.y + 0.004, eye.z + 0.016);
    eyeMesh.skeleton.boneInverses[hb].clone().multiply(at).decompose(shades.position, shades.quaternion, shades.scale);
    eyeMesh.skeleton.bones[hb].add(shades); shades.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } });
  } else { const eye = B.head.getWorldPosition(V()).add(V(0, 0.09, 0.09)); onBone(P, 'head', shades, 0, eye.y, eye.z); }
  // the megaphone (in her right hand; posed by the scene or the rally each frame: P.mega)
  const mega = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: '#F2F2F0', roughness: 0.4 }), acidM = new THREE.MeshStandardMaterial({ color: '#B6FF3B', emissive: '#6FA81A', emissiveIntensity: 0.5 });
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.045, 0.34, 18, 1, true), white); bell.material.side = THREE.DoubleSide; bell.rotation.x = PI / 2; bell.position.z = 0.17; mega.add(bell);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.04, 18, 1, true), acidM); band.rotation.x = PI / 2; band.position.z = 0.33; mega.add(band);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 0.04), new THREE.MeshStandardMaterial({ color: '#1A1C20' })); handle.position.set(0, -0.07, 0.04); mega.add(handle);
  mega.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } });
  mega.visible = false; W.app.scene.add(mega);
  P.mega = mega;
  // (each frame after the pose: the megaphone up to her mouth by k 0..1, the other fist pumping by pump 0..1)
  P.hype = (h, k = 1, pump = 0, t = 0) => {
    P.root.updateMatrixWorld(true);
    const F = V(Math.sin(h), 0, Math.cos(h)), Rt = V(-Math.cos(h), 0, Math.sin(h));
    const head = B.head.getWorldPosition(V());
    if (k > 0.01) {
      const mouth = head.clone().addScaledVector(F, 0.3).add(V(0, 0.04, 0)).addScaledVector(Rt, 0.04);
      const sh = B.upperarm01_R.getWorldPosition(V());
      armTo(B, 'R', mouth, sh.clone().addScaledVector(Rt, 0.5).add(V(0, -0.4, 0)), k, MH_ARM);
    }
    if (pump > 0.01) {
      const shL = B.upperarm01_L.getWorldPosition(V()), up = 0.25 + 0.2 * Math.abs(Math.sin(t * 5.5));
      armTo(B, 'L', shL.clone().addScaledVector(Rt, -0.22).addScaledVector(F, 0.15).add(V(0, up, 0)), shL.clone().addScaledVector(Rt, -0.6).add(V(0, -0.3, 0)), pump, MH_ARM);
    }
    const hand = B.wrist_R.getWorldPosition(V());
    mega.visible = P.root.visible && k > 0.5;
    mega.position.copy(hand).addScaledVector(F, 0.05);
    mega.lookAt(hand.clone().addScaledVector(F, 1).add(V(0, 0.08, 0)));
  };
  return P;
}

// Gears: big, gentle, in his late forties: his own model (assets/characters/gears.glb, made the way Dan's is, from the
// a MakeHuman-built human: a heavy build 1.9 m tall, a full beard going grey, cropped hair under a navy cap, navy work overalls
// over a white tee, worn boots; idle, talk, arms, shrug, wave, walk, jog, pickup, shift and phone), on Dan's
// skeleton, so his arms are Dan's (upperarm01_, lowerarm01_, wrist_). The scenes ask for the thug's 'thugIdle':
// it is his idle. His idle already lets his arms hang, so relax() leaves them be. A red rag in his back pocket.
let gearsP = null;
const gearsGLB = () => gearsP || (gearsP = loadGLB('assets/characters/gears.glb'));
export async function buildGears(W) {
  const gltf = await gearsGLB();
  const root = new THREE.Group(); root.name = 'Gears';
  const inner = skClone(gltf.scene); root.add(inner);
  inner.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  const bones = {}; inner.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  inner.updateMatrixWorld(true);
  const top = new THREE.Box3().setFromObject(inner).max.y;
  const mixer = new THREE.AnimationMixer(inner);
  const clipMap = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
  await castMoves(inner, bones, clipMap, 'gears');
  if (clipMap.idle) clipMap.thugIdle = clipMap.idle;
  root.visible = false; W.app.scene.add(root);
  const P = { root, inner, bones, mixer, rig: rig(mixer, clipMap), clips: Object.keys(clipMap), top, arm: (side, target, pole, w) => armTo(bones, side, target, pole, w, MH_ARM), relax: () => {} };
  // his face (wagmi/face.js, 23 Oct round 3, the owner: his "lips aren't moving when he talks"): his mouth with his
  // lines, blinks, his eyes on whom he talks to
  faceOn(W, P, 'Gears', { open: 0.45 });
  // his tee: an old heather tee, not a lit white one (the clothes' texture's pale, unsaturated texels, the tee's, toned
  // down and warmed a little, with a fine heather fleck; once a load, the texture shared by every Gears)
  inner.traverse((o) => {
    const m = o.isMesh && o.material; if (!m || m.name !== 'clothes' || !m.map?.image || m.map.userData.heather) return;
    try {
      const img = m.map.image, c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height), px = d.data;
      let s = 7; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i], g = px[i + 1], b = px[i + 2], hi = Math.max(r, g, b), lo = Math.min(r, g, b);
        if (hi < 60 || hi - lo > 22) continue;
        const k = 0.94 + (rnd() - 0.5) * 0.1;
        px[i] = Math.min(255, r * k); px[i + 1] = Math.min(255, g * k * 0.985); px[i + 2] = Math.min(255, b * k * 0.95);
      }
      x.putImageData(d, 0, 0);
      const t = new THREE.CanvasTexture(c); t.colorSpace = m.map.colorSpace; t.flipY = m.map.flipY; t.wrapS = m.map.wrapS; t.wrapT = m.map.wrapT; t.anisotropy = 4;
      t.userData.heather = true; m.map = t; m.needsUpdate = true;
    } catch (e) { console.warn('[m3] gears tee', e); }
  });
  // the rag: hanging out of his right back pocket. Placed in the bind pose (the clothes' own vertices through the skin's
  // bind matrix: the back of his hips over the right hip joint) and hung on the hips' bone the way the skin hangs on it
  // (its bones were saved mid-clip, so the model as it loads is not in that pose)
  const rag = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.2, 0.012), new THREE.MeshStandardMaterial({ color: '#B42B26', roughness: 0.95 }));
  let skin = null; inner.traverse((o) => { if (o.isSkinnedMesh && o.material?.name === 'clothes') skin = o; });
  const hb = skin ? skin.skeleton.bones.findIndex((b) => b.name === 'root') : -1;
  const lb = skin ? skin.skeleton.bones.findIndex((b) => b.name === 'upperleg01_R') : -1;
  if (skin && hb >= 0 && lb >= 0) {
    const hipJ = V().setFromMatrixPosition(skin.skeleton.boneInverses[lb].clone().invert());
    const pa = skin.geometry.attributes.position, _v = V(), py = hipJ.y - 0.02, side = hipJ.x;
    let back = Infinity;
    for (let i = 0; i < pa.count; i++) { _v.fromBufferAttribute(pa, i).applyMatrix4(skin.bindMatrix); if (Math.abs(_v.y - py) < 0.05 && Math.abs(_v.x - side) < 0.05) back = Math.min(back, _v.z); }
    if (!Number.isFinite(back)) back = hipJ.z - 0.14;
    const at = new THREE.Matrix4().compose(V(side, py - 0.07, back - 0.008), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, 0, 0.12)), V(1, 1, 1));
    skin.skeleton.boneInverses[hb].clone().multiply(at).decompose(rag.position, rag.quaternion, rag.scale);
    skin.skeleton.bones[hb].add(rag); rag.castShadow = true; rag.frustumCulled = false;
    P.ragAt = { hip: hipJ.toArray().map((v) => +v.toFixed(3)), back: +back.toFixed(3) };
  } else {
    const hip = (bones.root || bones.pelvis_R).getWorldPosition(V());
    rag.rotation.z = 0.12;
    onBone(P, bones.root ? 'root' : 'pelvis_R', rag, -0.1, hip.y - 0.13, hip.z - 0.16);
  }
  P.rag = rag;
  return P;
}
