// Mog City: Mission 3's sets and people.
//   rally   JPBank's "JPBank Loves New York" community day at Washington Square, next to the Occupy camp (the story pass
//           of 27 Oct): a stage under the arch (the city's own arch, js/city-grid.js), a big LED screen in front of its
//           opening running JPBank's smear reel (a canvas: Dan's badge photo and a caption every 2.4 s, "...ONE BAD
//           APPLE"; dead: frozen mid-sentence, then NO SIGNAL), JPBANK ♥ LOVES NEW YORK on a banner over the arch's attic,
//           speaker stacks, crowd barriers, the party crowd (the city's PersonCrowd) facing the stage, and three screen
//           rigs (an LED panel on a truss stand, the same reel, aimed at the tents): smashed by blows, a bat, a thrown can
//           or bottle or the car (a blow glitches the reel and rocks the rig; rig.onHit for the mission's own), they
//           topple, spark and go dark
//   camp    OCCUPY JPBANK, day 41: tents and tarps on the lawns south of the rigs, cardboard signs (hand-lettered,
//           originals), the OCCUPY JPBANK banner, Ms. Bea's kitchen tent, the drum circle, the camp's own people (a
//           second PersonCrowd: drumming, watching, cheering each rig down: R.cheer(); facing the people's mic:
//           R.camp.mic(on)); R.camp.fallMan() crosses out GREEDY on Dan's sign
//   garage  Gears' Static Garage on W 22nd St: the frontage on the street (a roll-up door half up, the sign) and the bay
//           behind it (built inside the building's shell: its walls face out, so from in here only ours are seen):
//           concrete, a tool wall, a bench, tyres, strip lights and a work lamp, an old couch by the door; its moods
//           (G.mood('night' | 'dark' | 'morning' | null)) for the night Dan sleeps there
//   suv     Fiona's black SUV (the city's SUV body, acid-green rims), parked on 5th Ave by the arch
//   people  Gears (his own model, gears.glb: navy overalls, a beard, a cap: a big gentle mechanic) and Fiona (her own
//           model, fiona.glb: platinum ponytail, white shades, a megaphone), each posed by its clips (rig) plus an arm to a point
//   const R = buildRally(W); R.show(true); R.screen.mode('reel' | 'dead'); R.rigs[i].hit(dmg, from); R.update(dt, cam)
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

/* ------------------------------------------------------ JPBank's heart -- */
// the community day's mark (an original): a plain red heart, its tip at the bottom (r: about half its width)
export function drawHeart(x, cx, cy, r, color = '#E8364F') {
  x.save(); x.translate(cx, cy); x.fillStyle = color;
  x.beginPath(); x.moveTo(0, r * 0.95);
  x.bezierCurveTo(-r * 1.3, r * 0.05, -r * 0.92, -r * 1.02, 0, -r * 0.42);
  x.bezierCurveTo(r * 0.92, -r * 1.02, r * 1.3, r * 0.05, 0, r * 0.95);
  x.fill(); x.restore();
}

/* ------------------------------------------------- Dan's badge photo -- */
// his JPBank ID card (an original drawing of the game's own Dan: a long jaw, clean-shaven, short dark hair a week past
// a haircut, tired dark eyes; a navy suit, a white shirt, a dark tie; flat badge-photo light), w x h at (X, Y)
export function drawBadge(x, X, Y, w, h) {
  const u = w / 300;
  x.save(); x.translate(X, Y); x.scale(u, u);
  // the card, its lanyard slot, the bank's strip
  x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.roundRect(6, 8, 300, 400, 18); x.fill();
  x.fillStyle = '#F4F6F8'; x.beginPath(); x.roundRect(0, 0, 300, 400, 18); x.fill();
  x.fillStyle = '#0E2A5C'; x.beginPath(); x.roundRect(0, 0, 300, 64, [18, 18, 0, 0]); x.fill();
  x.fillStyle = '#C9D0DA'; x.beginPath(); x.roundRect(120, 10, 60, 10, 5); x.fill();
  drawHeart(x, 34, 44, 13); x.fillStyle = '#fff'; x.font = 'italic 800 30px "Barlow Condensed", sans-serif'; x.textAlign = 'left'; x.fillText('JPBANK', 54, 55);
  x.fillStyle = 'rgba(255,255,255,.7)'; x.font = '700 13px "Barlow Condensed", sans-serif'; x.fillText('STAFF', 246, 54);
  // the photo: a pale blue-grey ground, him head and shoulders
  const px = 40, py = 82, pw = 220, ph = 220;
  const bg = x.createLinearGradient(0, py, 0, py + ph); bg.addColorStop(0, '#B9C6D6'); bg.addColorStop(1, '#93A3B8'); x.fillStyle = bg; x.fillRect(px, py, pw, ph);
  x.save(); x.beginPath(); x.rect(px, py, pw, ph); x.clip();
  const cx = px + pw / 2;
  // the suit's shoulders, the shirt, the tie
  x.fillStyle = '#1C2638'; x.beginPath(); x.moveTo(cx - 108, py + ph); x.quadraticCurveTo(cx - 100, py + 176, cx - 34, py + 166); x.lineTo(cx + 34, py + 166); x.quadraticCurveTo(cx + 100, py + 176, cx + 108, py + ph); x.closePath(); x.fill();
  x.fillStyle = '#F2F3F5'; x.beginPath(); x.moveTo(cx - 30, py + 166); x.lineTo(cx, py + ph); x.lineTo(cx + 30, py + 166); x.closePath(); x.fill();
  x.fillStyle = '#5A1E26'; x.beginPath(); x.moveTo(cx - 7, py + 172); x.lineTo(cx + 7, py + 172); x.lineTo(cx + 11, py + ph); x.lineTo(cx - 11, py + ph); x.closePath(); x.fill();
  x.fillStyle = '#141B28'; x.beginPath(); x.moveTo(cx - 34, py + 166); x.lineTo(cx - 12, py + 210); x.lineTo(cx - 40, py + 182); x.closePath(); x.fill(); x.beginPath(); x.moveTo(cx + 34, py + 166); x.lineTo(cx + 12, py + 210); x.lineTo(cx + 40, py + 182); x.closePath(); x.fill();
  // the neck, the head (long in the jaw), the ears
  const skin = '#D9A887', shade = '#C08F70';
  x.fillStyle = shade; x.fillRect(cx - 17, py + 128, 34, 42);
  x.fillStyle = skin; x.beginPath(); x.ellipse(cx - 41, py + 92, 7, 12, 0, 0, PI * 2); x.ellipse(cx + 41, py + 92, 7, 12, 0, 0, PI * 2); x.fill();
  x.beginPath(); x.moveTo(cx - 40, py + 70); x.quadraticCurveTo(cx - 42, py + 128, cx - 16, py + 144); x.quadraticCurveTo(cx, py + 152, cx + 16, py + 144); x.quadraticCurveTo(cx + 42, py + 128, cx + 40, py + 70); x.quadraticCurveTo(cx + 38, py + 30, cx, py + 30); x.quadraticCurveTo(cx - 38, py + 30, cx - 40, py + 70); x.fill();
  // the hair: short and dark, a week past a cut
  x.fillStyle = '#231A15'; x.beginPath(); x.moveTo(cx - 42, py + 76); x.quadraticCurveTo(cx - 46, py + 26, cx - 6, py + 20); x.quadraticCurveTo(cx + 40, py + 18, cx + 44, py + 74); x.quadraticCurveTo(cx + 34, py + 46, cx + 8, py + 44); x.quadraticCurveTo(cx - 24, py + 42, cx - 36, py + 60); x.closePath(); x.fill();
  // the brows, the eyes (tired, dark), the nose, the mouth: a straight line, as the photo was taken
  x.strokeStyle = '#2A1F19'; x.lineWidth = 4; x.lineCap = 'round';
  x.beginPath(); x.moveTo(cx - 26, py + 76); x.lineTo(cx - 10, py + 74); x.moveTo(cx + 10, py + 74); x.lineTo(cx + 26, py + 76); x.stroke();
  x.fillStyle = '#2A211C'; x.beginPath(); x.ellipse(cx - 17, py + 87, 4.5, 3.4, 0, 0, PI * 2); x.ellipse(cx + 17, py + 87, 4.5, 3.4, 0, 0, PI * 2); x.fill();
  x.strokeStyle = 'rgba(120,80,64,.45)'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx - 24, py + 94); x.quadraticCurveTo(cx - 17, py + 97, cx - 10, py + 94); x.moveTo(cx + 10, py + 94); x.quadraticCurveTo(cx + 17, py + 97, cx + 24, py + 94); x.stroke();
  x.strokeStyle = shade; x.lineWidth = 3; x.beginPath(); x.moveTo(cx + 2, py + 92); x.lineTo(cx + 5, py + 112); x.lineTo(cx - 3, py + 114); x.stroke();
  x.strokeStyle = '#8E5A4A'; x.lineWidth = 3; x.beginPath(); x.moveTo(cx - 12, py + 128); x.lineTo(cx + 12, py + 127); x.stroke();
  x.restore();
  // the name, the title, the number, a barcode
  x.textAlign = 'center'; x.fillStyle = '#0E2A5C'; x.font = '800 40px "Barlow Condensed", sans-serif'; x.fillText('DAN', 150, 344);
  x.fillStyle = '#4A5568'; x.font = '700 16px "Barlow Condensed", sans-serif'; x.fillText('ASSOCIATE · FIRST YEAR · ID 0451-7722', 150, 366);
  x.fillStyle = '#1A1C20'; let bx = 70; for (let i = 0; i < 46; i++) { const bw = 1 + ((i * 7) % 3); if (i % 5 !== 2) x.fillRect(bx, 376, bw, 16); bx += bw + 2; }
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
// JPBank's smear reel, live: its header (the heart, JPBANK, COMMUNITY DAY, LIVE, the viewers), Dan's badge photo and a
// caption every 2.4 s (BAD APPLE stamped over the photo on the worst of them), the ticker; dip() (a rig lost) glitches
// it and drops viewers; dead: the frame frozen on "...INSIDER TRAD—", glitching, then NO SIGNAL. The rigs run the same
// texture
export const REEL = ['MEET DAN.', 'FIRST-YEAR ASSOCIATE.', 'FIRST-CLASS CROOK.', 'HE TRADED BLIMPCO ON INSIDE INFORMATION.', 'DAN: THE FACE OF INSIDER TRADING.',
  "JPBANK CAUGHT HIM. YOU'RE WELCOME.", "THE BANK ISN'T ROTTEN.", 'IT HAD ONE BAD APPLE.', 'JPBANK LOVES NEW YORK ♥'];
const STAMPED = new Set([2, 4, 5, 7]);
function createScreen() {
  const W0 = 1024, H0 = 576;
  const tex = canvasTex(W0, H0, () => {}); const x = tex.canvas.getContext('2d');
  const S = { mode: 'reel', t: 0, viewers: 11240, deadT: 0, lost: 0, tick: 0, glitch: 0 };
  // (the card drawn once)
  const card = document.createElement('canvas'); card.width = 312; card.height = 416; drawBadge(card.getContext('2d'), 0, 0, 300, 400);
  // a caption wrapped to the width w at the largest size that fits two lines (cached by text)
  const fits = new Map();
  const wrap = (text, w) => {
    if (fits.has(text)) return fits.get(text);
    let out = null;
    for (let sz = 86; sz >= 40 && !out; sz -= 4) {
      x.font = `italic 800 ${sz}px "Barlow Condensed", sans-serif`;
      const words = text.split(' '), lines = []; let cur = '';
      for (const wd of words) { const tr = cur ? cur + ' ' + wd : wd; if (x.measureText(tr).width > w && cur) { lines.push(cur); cur = wd; } else cur = tr; }
      lines.push(cur);
      if (lines.length <= 3 && lines.every((l) => x.measureText(l).width <= w)) out = { sz, lines };
    }
    out ||= { sz: 40, lines: [text] };
    fits.set(text, out); return out;
  };
  const header = (dead) => {
    x.save(); x.beginPath(); x.arc(84, 62, 44, 0, PI * 2); x.fillStyle = '#FFFFFF'; x.fill(); drawHeart(x, 84, 66, 26); x.restore();
    x.textAlign = 'left'; x.fillStyle = '#fff'; x.font = 'italic 800 76px "Barlow Condensed", sans-serif'; x.fillText('JPBANK', 144, 88);
    x.font = '700 22px "Barlow Condensed", sans-serif'; x.fillStyle = 'rgba(255,255,255,.62)'; x.fillText('JPBANK LOVES NEW YORK · COMMUNITY DAY', 148, 112);
    const live = !dead || S.t % 1 < 0.5;
    x.fillStyle = live ? '#E8364F' : 'rgba(232,54,79,.35)'; x.beginPath(); x.roundRect(W0 - 360, 34, 92, 40, 8); x.fill();
    x.fillStyle = '#fff'; x.font = '800 28px "Barlow Condensed", sans-serif'; x.fillText('LIVE', W0 - 336, 64);
    x.fillStyle = 'rgba(255,255,255,.78)'; x.font = '700 26px "Barlow Condensed", sans-serif'; x.fillText(`${(S.viewers / 1000).toFixed(1)}K WATCHING`, W0 - 254, 64);
  };
  const ticker = (msg, bg) => {
    x.fillStyle = bg; x.fillRect(0, 512, W0, 64);
    x.fillStyle = '#FFFFFF'; x.font = '800 30px "Barlow Condensed", sans-serif'; x.textAlign = 'left';
    const mw = x.measureText(msg).width, off = -((S.t * 120) % mw);
    for (let k = off; k < W0; k += mw) x.fillText(msg, k, 554);
  };
  // a caption beside the photo (k: its slide in, 0..1)
  const caption = (text, k, red) => {
    const { sz, lines } = wrap(text, 540), lh = sz * 1.02, y0 = 318 - (lines.length - 1) * lh / 2 + sz * 0.34;
    x.globalAlpha = Math.min(1, k * 1.6);
    x.fillStyle = red ? '#E8364F' : '#FFFFFF'; x.fillRect(408 + (1 - k) * 60, y0 - sz * 0.8, 8, lh * (lines.length - 1) + sz * 0.92);
    x.fillStyle = '#FFFFFF'; x.font = `italic 800 ${sz}px "Barlow Condensed", sans-serif`; x.textAlign = 'left';
    lines.forEach((l, i) => { if (red && /BAD APPLE|CROOK|INSIDER/.test(l)) x.fillStyle = '#FF5A6E'; else x.fillStyle = '#FFFFFF'; x.fillText(l, 432 + (1 - k) * 60, y0 + i * lh); });
    x.globalAlpha = 1;
  };
  const stamp = () => {
    x.save(); x.translate(212, 300); x.rotate(-0.24); x.strokeStyle = 'rgba(232,54,79,.92)'; x.lineWidth = 7; x.strokeRect(-128, -38, 256, 76);
    x.fillStyle = 'rgba(232,54,79,.92)'; x.font = '800 58px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.fillText('BAD APPLE', 0, 20); x.restore();
  };
  // (a glitch: rows of the frame shoved sideways, tinted bars)
  const glitch = (amt) => {
    for (let i = 0; i < 9 * amt; i++) {
      const y = Math.random() * 500, hh = 6 + Math.random() * 34, dx = (Math.random() - 0.5) * 160 * amt;
      x.drawImage(tex.canvas, 0, y, W0, hh, dx, y, W0, hh);
      x.fillStyle = ['rgba(232,54,79,.35)', 'rgba(59,216,255,.3)', 'rgba(255,255,255,.25)'][i % 3]; x.fillRect(0, y, W0, Math.random() * 4);
    }
  };
  function frame(text, k, idx) {
    const bg = x.createLinearGradient(0, 0, 0, H0); bg.addColorStop(0, '#0C1B3A'); bg.addColorStop(1, '#060E1F');
    x.fillStyle = bg; x.fillRect(0, 0, W0, H0);
    x.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 14; i++) x.fillRect(0, 128 + i * 27, W0, 1);
    header(S.mode === 'dead');
    x.drawImage(card, 64, 120, 296 * 0.92, 396 * 0.92);
    if (STAMPED.has(idx)) stamp();
    caption(text, k, STAMPED.has(idx));
  }
  function draw() {
    if (S.mode === 'reel') {
      const n = Math.floor(S.t / 2.4), idx = n % REEL.length, k = Math.min(1, (S.t - n * 2.4) / 0.28);
      frame(REEL[idx], k * (2 - k), idx);
      if (S.glitch > 0) glitch(Math.min(1, S.glitch * 2));
      ticker('JPBANK LOVES NEW YORK · FREE HOT DOGS TILL 4 · ONE BAD APPLE · WE CAUGHT HIM · BANKING IS FOR EVERYONE · ', '#E8364F');
    } else if (S.deadT < 1.2) {
      // (frozen mid-sentence, and breaking up)
      frame('DAN: THE FACE OF INSIDER TRAD—', 1, 4);
      glitch(0.4 + S.deadT);
      ticker('TECHNICAL DIFFICULTIES · PLEASE STAND BY · JPBANK LOVES NEW YORK · ', '#E8364F');
    } else {
      x.fillStyle = '#030406'; x.fillRect(0, 0, W0, H0);
      // (the last of the picture's snow, fading)
      const snow = Math.max(0, 1 - (S.deadT - 1.2) / 1.6);
      if (snow > 0) for (let i = 0; i < 260 * snow; i++) { const g = Math.random() * 200 | 0; x.fillStyle = `rgba(${g},${g},${g},.5)`; x.fillRect(Math.random() * W0, Math.random() * 500, 3 + Math.random() * 30, 2); }
      header(true);
      x.textAlign = 'center'; x.fillStyle = 'rgba(255,255,255,.88)'; x.font = 'italic 800 150px "Barlow Condensed", sans-serif';
      x.fillText('NO SIGNAL', W0 / 2, 360);
      x.fillStyle = 'rgba(255,255,255,.45)'; x.font = '700 26px "Barlow Condensed", sans-serif'; x.fillText('SOURCE: RIG 1 · RIG 2 · RIG 3', W0 / 2, 410);
      ticker('TECHNICAL DIFFICULTIES · PLEASE STAND BY · JPBANK LOVES NEW YORK · ', '#7A1B28');
    }
    tex.needsUpdate = true;
  }
  return {
    tex,
    // 'reel' | 'dead' (the old names, 'pump' | 'dump', still taken)
    mode(m) { m = m === 'pump' ? 'reel' : m === 'dump' ? 'dead' : m; if (m === S.mode) return; S.mode = m; S.deadT = 0; },
    // a rig lost: the reel breaks up for a moment, viewers gone
    dip() { S.lost++; S.viewers = Math.round(S.viewers * 0.62); S.glitch = 0.7; },
    get state() { return S; },
    update(dt) {
      S.t += dt; S.tick += dt;
      if (S.tick < 0.12) return; const step = S.tick; S.tick = 0;
      S.glitch = Math.max(0, S.glitch - step);
      if (S.mode === 'reel') S.viewers += Math.round((Math.random() * 40 - 8) * (S.lost ? 0.3 : 1));
      else { S.deadT += step; S.viewers = Math.max(31, Math.round(S.viewers * 0.9)); }
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
  const acid = new THREE.MeshStandardMaterial({ color: '#E8364F', emissive: '#E8364F', emissiveIntensity: 1.4, roughness: 0.5 });

  /* the stage: a deck under the arch, a skirt with a red strip (the party's colour), steps at its east end */
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
  // the screen: behind the arch's opening (in front of the park tree that stands just south of it), the reel on both
  // faces (the back seen through the arch from 5th Ave)
  const screen = createScreen();
  const sw = 10, shh = 5.625, sy = top + 1.25 + shh / 2;
  box(sw + 0.3, shh + 0.3, 0.3, black, 0, sy, SCREEN_Z);
  const scrMat = new THREE.MeshBasicMaterial({ map: screen.tex, color: new THREE.Color(1.25, 1.25, 1.25) });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(sw, shh), scrMat); front.position.set(0, sy, SCREEN_Z + 0.17); g.add(front);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(sw, shh), scrMat); back.position.set(0, sy, SCREEN_Z - 0.17); back.rotation.y = PI; g.add(back);
  // the banner on the arch's attic, both faces: the heart, JPBANK ♥, LOVES NEW YORK
  const banner = canvasTex(1024, 286, (x, w, h) => {
    x.fillStyle = '#0E2A5C'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#E8364F'; x.lineWidth = 10; x.strokeRect(8, 8, w - 16, h - 16);
    x.beginPath(); x.arc(160, h / 2, 112, 0, PI * 2); x.fillStyle = '#FFFFFF'; x.fill(); drawHeart(x, 160, h / 2 + 8, 70);
    x.fillStyle = '#FFFFFF'; x.font = 'italic 800 150px "Barlow Condensed", sans-serif'; x.fillText('JPBANK', 300, 158);
    drawHeart(x, 300 + x.measureText('JPBANK').width + 62, 104, 40);
    x.fillStyle = '#fff'; x.font = '800 56px "Barlow Condensed", sans-serif'; x.fillText('LOVES NEW YORK', 306, 228);
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

  /* the rigs: an LED panel on a truss stand (two posts on their feet, a bar over the top), the reel on both faces,
     aimed across the lawn at the tents */
  const legMat = new THREE.MeshStandardMaterial({ color: '#1B1D21', roughness: 0.5, metalness: 0.6 });
  const trussMat = new THREE.MeshStandardMaterial({ color: '#C3C8CF', roughness: 0.35, metalness: 0.85 });
  const sparks = [];
  const sparkMat = new THREE.MeshBasicMaterial({ color: '#FFE7A0' });
  const sparkGeo = new THREE.BoxGeometry(0.035, 0.035, 0.09);
  for (let i = 0; i < 48; i++) { const m = new THREE.Mesh(sparkGeo, sparkMat); m.visible = false; m.frustumCulled = false; g.add(m); sparks.push({ m, v: V(), life: 0 }); }
  const spark = (p, n = 16) => {
    let k = 0;
    for (const s of sparks) { if (s.life > 0) continue; s.life = 0.35 + Math.random() * 0.45; s.m.position.copy(p); s.v.set((Math.random() - 0.5) * 6, 1.5 + Math.random() * 4, (Math.random() - 0.5) * 6); s.m.visible = true; if (++k >= n) break; }
  };
  // (the panel: 1.7 x 0.96 m, its middle 1.85 m up; the posts either side of it)
  const PW = 1.7, PH = 0.96, PY = 1.85, PX = PW / 2 + 0.1;
  const rigs = RIGS.map(([rx, rz], i) => {
    const y0 = cm.getGroundHeight(rx, rz, 'person');
    const root = new THREE.Group(); root.position.set(rx, y0, rz); root.rotation.y = Math.atan2(CAMP_AT[0] - rx, CAMP_AT[1] - rz); g.add(root);
    const piv = new THREE.Group(); root.add(piv);
    const part = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = true; piv.add(m); return m; };
    for (const sx of [-1, 1]) {
      // a post of square truss (four chords and its rungs), its foot, a brace
      for (const [dx, dz] of [[-0.06, -0.06], [0.06, -0.06], [-0.06, 0.06], [0.06, 0.06]]) part(new THREE.BoxGeometry(0.022, 2.42, 0.022), trussMat, sx * PX + dx, 1.21, dz);
      for (let k = 0; k < 8; k++) part(new THREE.BoxGeometry(0.14, 0.018, 0.018), trussMat, sx * PX, 0.2 + k * 0.3, 0.06);
      part(new THREE.BoxGeometry(0.2, 0.06, 0.9), legMat, sx * PX, 0.03, 0);
    }
    part(new THREE.BoxGeometry(PW + 0.36, 0.1, 0.12), trussMat, 0, 2.45, 0);
    // the panel: a black case, the reel front (to the camp) and back
    part(new THREE.BoxGeometry(PW + 0.08, PH + 0.08, 0.1), black, 0, PY, 0);
    const scrM = new THREE.MeshBasicMaterial({ map: screen.tex, color: new THREE.Color(1.2, 1.2, 1.2) });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), scrM); scr.position.set(0, PY, 0.052); piv.add(scr);
    const scr2 = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), scrM); scr2.position.set(0, PY, -0.052); scr2.rotation.y = PI; piv.add(scr2);
    // (a cable snaking off to the stage's power, and a red LIVE light on the bar)
    part(new THREE.CylinderGeometry(0.012, 0.012, 1.6, 5), legMat, PX + 0.15, 0.02, -0.5).rotation.set(PI / 2, 0, 0.3);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: '#EF4444' })); dot.position.set(PW / 2 - 0.05, 2.53, 0.04); piv.add(dot);
    // (a blow: the reel breaks up for a moment, the whole rig rocks on its feet)
    const GLITCH = ['#FF2E63', '#FFFFFF', '#3BD8FF', '#050506', '#E8364F', '#FFE14D'];
    const LIT = new THREE.Color(1.2, 1.2, 1.2);
    const R = {
      i, x: rx, z: rz, y: y0, root, hp: 2, hp0: 2, down: false, fall: 0, fallDir: 0, flash: 0, glitch: 0, rock: 0, rockDir: 0,
      onHit: null, // (the mission's: (rig, dmg, from, down) at every blow, for its own feedback)
      // a blow (dmg: 1 a fist, 2 a heavy, 3 a bat, a throw or the car) from (fx, fz)
      hit(dmg = 1, from = null) {
        if (R.down) return false;
        R.hp -= dmg; R.flash = 0.18; R.glitch = 0.55; R.rock = 1;
        R.rockDir = from ? Math.atan2(rx - from.x, rz - from.z) - root.rotation.y : 0;
        const at = V(rx, y0 + 1.7, rz);
        spark(at, dmg >= 2 ? 16 : 10);
        W.audio?.play?.('carHit', { pos: [rx, 1.4, rz], vol: 0.45 });
        try { R.onHit?.(R, dmg, from, R.hp <= 0); } catch (e) { console.warn('[m3] rig', e); }
        if (R.hp > 0) return false;
        R.down = true; R.fall = 0;
        // (it falls away from the blow)
        const fx = from ? rx - from.x : Math.sin(root.rotation.y), fz = from ? rz - from.z : Math.cos(root.rotation.y);
        R.fallDir = Math.atan2(fx, fz) - root.rotation.y;
        // (dark: its colour to black, the map kept, so nothing recompiles)
        scrM.color.set('#050506'); dot.visible = false;
        spark(at, 22);
        W.audio?.play?.('glass', { pos: [rx, 1.6, rz], vol: 0.9 });
        return true;
      },
      reset() { R.hp = 2; R.down = false; R.counted = false; R.fall = 0; R.glitch = 0; R.rock = 0; piv.rotation.set(0, 0, 0); scrM.color.copy(LIT); dot.visible = true; },
      update(dt, t) {
        // a blow's glitch: the panel flicks through colours, the rig rocks
        if (!R.down && R.glitch > 0) {
          R.glitch = Math.max(0, R.glitch - dt);
          if (R.glitch > 0) scrM.color.set(GLITCH[(Math.floor(t * 28) + R.i) % GLITCH.length]); else scrM.color.copy(LIT);
        }
        if (!R.down && R.rock > 0) {
          R.rock = Math.max(0, R.rock - dt / 0.45);
          const a = Math.sin((1 - R.rock) * 26) * 0.16 * R.rock;
          piv.rotation.set(Math.cos(R.rockDir) * a, 0, -Math.sin(R.rockDir) * a);
        }
        if (R.down && R.fall < 1) {
          R.fall = Math.min(1, R.fall + dt / 0.55);
          const k = R.fall * R.fall, ang = k * 1.42;
          // (tipped about its feet, the way it fell)
          piv.rotation.set(Math.cos(R.fallDir) * ang, 0, -Math.sin(R.fallDir) * ang);
          if (R.fall >= 1) { spark(V(rx + Math.sin(root.rotation.y + R.fallDir) * 1.8, y0 + 0.1, rz + Math.cos(root.rotation.y + R.fallDir) * 1.8), 10); W.audio?.play?.('carHit', { pos: [rx, 0.3, rz], vol: 0.25 }); }
        }
        if (!R.down && R.glitch <= 0) { dot.visible = (t % 1.2) < 0.75; scrM.color.copy(LIT).multiplyScalar(R.flash > 0 ? 1.6 : 1); }
        R.flash = Math.max(0, R.flash - dt);
      },
    };
    return R;
  });

  /* the party crowd: the city's own people (one instanced draw), facing the stage, dancing and cheering; on the fight,
     they run. The dances and cheers are motion capture (assets/anim/bandai/rally-crowd-ped.json: Bandai Namco Research
     Motion Dataset, CC BY-NC 4.0, see NOTICE), fetched with the set and played on each person's own rig, each their own
     take, pace and moment in it (till they're in, or without them, a bounce on the spot); turning to run, each eases
     out of the dance over a quarter second (PersonRig.fadeFrom) */
  const N = window.NYC;
  // (the motion capture, fetched once with the set: the party crowd's and the camp's)
  const CLIPS = { CL: null };
  fetch('assets/anim/bandai/rally-crowd-ped.json').then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.clips) CLIPS.CL = Object.fromEntries(j.clips.map((c) => [c.name, c])); }).catch(() => {});
  const crowd = (() => {
    if (!N?.PersonCrowd || !N?.PersonRig) return null;
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
          } else if (CLIPS.CL?.[p.clip] && p.rig.playClip) { p.rig.playClip(CLIPS.CL[p.clip], t * p.rate + p.at, p.x, p.z, p.h, ground(p, p.x, p.z)); p.danced = true; C.add(p.rig, cam ? Math.hypot(p.x - cam.x, p.z - cam.z) : 0); continue; }
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

  // the camp (its own group, people and colliders; shown with the set)
  const camp = buildCamp(W, g, colliders, CLIPS);

  let shown = false, t = 0;
  const R = {
    group: g, screen, rigs, crowd, camp, colliders,
    // the camp's people cheer (a rig down, the camp answering Fiona)
    cheer(secs = 3.2) { camp?.cheer(secs); },
    show(on) {
      shown = !!on; g.visible = shown; crowd?.show(shown); camp?.show(shown);
      const Cc = cm.colliders;
      for (let i = Cc.length - 1; i >= 0; i--) if (Cc[i].wagmi === 'm3') Cc.splice(i, 1);
      if (shown) Cc.push(...colliders);
      cm._colliderCells = null;
    },
    get shown() { return shown; },
    reset() { for (const r of rigs) r.reset(); screen.mode('reel'); crowd?.reset(); camp?.reset(); },
    get smashed() { return rigs.filter((r) => r.down).length; },
    update(dt, cam) {
      if (!shown) return;
      t += dt;
      screen.update(dt);
      for (const r of rigs) r.update(dt, t);
      for (const s of sparks) { if (s.life <= 0) continue; s.life -= dt; s.v.y -= 14 * dt; s.m.position.addScaledVector(s.v, dt); s.m.lookAt(s.m.position.x + s.v.x, s.m.position.y + s.v.y, s.m.position.z + s.v.z); if (s.life <= 0 || s.m.position.y < 0.2) { s.m.visible = false; s.life = 0; } }
      crowd?.update(dt, t, cam);
      camp?.update(dt, t, cam);
    },
    // (compile its pipelines out of sight before it's first seen)
    async warm() {
      const p = g.position.clone(); g.position.y = -60; g.visible = true; crowd?.show(true); camp?.show(true);
      await new Promise((r) => { let n = 0; const f = () => (++n >= 4 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
      g.position.copy(p); g.visible = shown; crowd?.show(shown); camp?.show(shown);
    },
  };
  screen.draw();
  return R;
}

/* -------------------------------------------------------------- camp -- */
// OCCUPY JPBANK, day 41, on the lawns south of the rigs (the party's screens aimed at it). Everything here is an
// original: the signs are hand-lettered in marker on cardboard (no real group, person or slogan owner), the banner a
// painted bedsheet. CAMP: where it all stands (tents, signs, the banner's poles, the kitchen, the drum circle, the
// people's spots); the tents and the kitchen are solid while the set stands
export const CAMP_AT = [0, 2920];                                              // (the rigs face it)
export const BEA_AT = [1.2, 2921.2];                                          // (where the people's mic faces: her crate, behind the camp's people)
// (laid out between the park's own trees, at least a metre clear of their trunks, on the lawn bed south of the fountain:
// the tent doors to the north, where the cameras are; js/city-grid.js plants the trees on a jittered ~7 m grid)
const CAMP = {
  // [x, z, heading (PI: the door to the north), kind ('dome' | 'ridge' | 'tarp'), colour]
  tents: [
    [-5.5, 2912.5, 3.44, 'dome',  0], [0.8, 2913.2, 2.94, 'ridge',  1], [9.6, 2914.2, 3.54, 'dome',  2],
    [20.5, 2911.2, 3.04, 'dome',  3], [-21.0, 2912.5, 3.64, 'ridge',  4], [-27.0, 2912.0, 2.84, 'dome',  5],
    [9.5, 2921.5, 3.24, 'tarp',  6], [20.0, 2920.5, 2.74, 'dome',  1], [28.5, 2919.5, 3.74, 'ridge',  0],
    [-19.5, 2923.0, 3.34, 'dome',  2], [-27.5, 2925.5, 2.64, 'tarp',  6], [-6.0, 2931.5, 3.14, 'dome',  3],
    [0.5, 2932.0, 3.54, 'ridge',  5], [10.0, 2931.0, 2.84, 'dome',  4], [20.5, 2930.8, 3.34, 'dome',  0],
  ],
  // [x, z, heading (0: facing north, to the rigs and the arch), sign (of SIGNS), 'stake' | 'lean' | 'low']
  signs: [
    [-12.6, 2903.6, 0.12, 4, 'stake'], [-7.4, 2903.0, -0.05, 1, 'stake'], [-0.6, 2903.4, 0.0, 9, 'stake'], [2.6, 2903.0, -0.1, 2, 'stake'],
    [15.4, 2903.0, 0.1, 3, 'stake'], [19.8, 2902.4, -0.15, 0, 'stake'], [-5.6, 2910.6, 0.2, 7, 'lean'], [0.8, 2911.5, -0.1, 6, 'lean'],
    [20.5, 2909.5, 0.1, 5, 'lean'], [-21.0, 2910.8, 0.4, 3, 'lean'], [9.5, 2912.6, 0.0, 0, 'lean'], [-9.2, 2917.6, 0.3, 8, 'low'],
    [13.0, 2919.0, -0.2, 1, 'low'],
  ],
  banner: { a: [-11.4, 2908.8], b: [-5.0, 2909.6] },                            // the bedsheet between two poles, facing the rigs
  kitchen: { x: -6.5, z: 2920.5, h: PI },                                    // (its front, the sign, to the north)
  drums: { x: 10.0, z: 2905.0, r: 2.1 },
  // the people standing about, watching the screens [x, z]; the kitchen's queue [x, z, heading]
  watch: [
    [-11.0, 2905.8], [-8.4, 2905.2], [-5.9, 2906.2], [-3.9, 2905.0], [1.6, 2906.0], [4.0, 2905.4], [-1.8, 2910.4],
    [2.8, 2910.0], [16.4, 2905.8], [17.8, 2908.6], [-0.4, 2915.4], [3.4, 2915.6], [-20.2, 2908.6], [-24.5, 2909.0],
  ],
  queue: [[-7.8, 2917.3, 0], [-6.1, 2916.9, 0.15], [-4.4, 2917.6, -0.35]],
};
// the signs (marker on cardboard; the last is DAN DAN's after Ms. Bea fixed it)
export const SIGNS = ['OCCUPY JPBANK · DAY 41', 'WE ARE THE 99%', 'AUDIT JPBANK', 'THEY GOT BAILED OUT · WE GOT SOLD OUT', 'BAILOUTS FOR BANKS · EVICTIONS FOR US',
  'PEOPLE OVER PROFITS', "I CAN'T AFFORD A LOBBYIST", 'STUDENT LOANS: $78,000 · BONUS: $0', 'FREE HOT DOGS ≠ JUSTICE', 'DAN DAN · THE GREEDY MAN'];
const INKS = ['#141414', '#141414', '#B3202A', '#141414', '#1F3F8F', '#141414', '#141414', '#141414', '#B3202A', '#141414'];

// marker capitals, one letter at a time: each its own tilt, size and baseline (seed: the hand)
function marker(x, text, cx, cy, size, ink, seed, maxW) {
  let sd = seed * 977 + 13; const rnd = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
  // (too wide: the letters smaller, not squeezed)
  const meas = (sz) => { x.font = `700 ${sz}px "Barlow Condensed", sans-serif`; let w = 0; for (const ch of text) w += x.measureText(ch).width * 1.04; return w; };
  let w = meas(size);
  if (maxW && w > maxW) { size *= maxW / w; w = meas(size); }
  const k = 1;
  let px = cx - (w * k) / 2;
  x.fillStyle = ink; x.strokeStyle = ink; x.lineJoin = 'round'; x.lineCap = 'round'; x.lineWidth = size * 0.075;
  for (const ch of text) {
    const cw = x.measureText(ch).width * k;
    x.save(); x.translate(px + cw / 2, cy + (rnd() - 0.5) * size * 0.08); x.rotate((rnd() - 0.5) * 0.12); x.scale(k * (0.95 + rnd() * 0.1), 0.95 + rnd() * 0.1);
    x.strokeText(ch, -x.measureText(ch).width / 2, 0); x.fillText(ch, -x.measureText(ch).width / 2, 0);
    x.restore();
    px += cw * 1.04;
  }
  return w * k;
}
// a piece of cardboard (w x h at X, Y): torn a little at the edges, its flutes, a strip of tape
function cardboard(x, X, Y, w, h, seed) {
  let sd = seed * 131 + 7; const rnd = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
  x.save();
  x.beginPath();
  const n = 9, pts = [];
  for (let i = 0; i <= n; i++) pts.push([X + (w * i) / n, Y + rnd() * 7]);
  for (let i = 0; i <= n; i++) pts.push([X + w - rnd() * 7, Y + (h * i) / n]);
  for (let i = n; i >= 0; i--) pts.push([X + (w * i) / n, Y + h - rnd() * 7]);
  for (let i = n; i >= 0; i--) pts.push([X + rnd() * 7, Y + (h * i) / n]);
  pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.clip();
  const tone = 186 + rnd() * 22 | 0;
  const g = x.createLinearGradient(X, Y, X + w, Y + h); g.addColorStop(0, `rgb(${tone},${tone - 40},${tone - 92})`); g.addColorStop(1, `rgb(${tone - 22},${tone - 60},${tone - 108})`);
  x.fillStyle = g; x.fillRect(X, Y, w, h);
  x.fillStyle = 'rgba(90,60,30,.07)'; for (let i = 0; i < w; i += 9) x.fillRect(X + i, Y, 3, h);
  for (let i = 0; i < 5; i++) { x.fillStyle = `rgba(80,52,26,${0.05 + rnd() * 0.08})`; x.beginPath(); x.ellipse(X + rnd() * w, Y + rnd() * h, 20 + rnd() * 60, 8 + rnd() * 26, rnd() * 3, 0, PI * 2); x.fill(); }
  x.fillStyle = 'rgba(232,226,200,.55)'; x.save(); x.translate(X + w * (0.12 + rnd() * 0.7), Y + 6); x.rotate((rnd() - 0.5) * 0.5); x.fillRect(-40, -12, 80, 24); x.restore();
  x.restore();
}
// a sign's face in its cell (i: SIGNS, or 'fall': DAN DAN's after Ms. Bea's pen; 'blank': the back): its ' · ' parts on
// lines of their own, a long part broken at its middle space, the lettering as big as the card takes
function signLines(text) {
  const out = [];
  text.split(' · ').forEach((part, seg) => {
    if (part.length <= 14 || !part.includes(' ')) { out.push([part, seg]); return; }
    let best = -1; for (let j = 0; j < part.length; j++) if (part[j] === ' ' && (best < 0 || Math.abs(j - part.length / 2) < Math.abs(best - part.length / 2))) best = j;
    out.push([part.slice(0, best), seg], [part.slice(best + 1), seg]);
  });
  return out;
}
function drawSign(x, X, Y, w, h, i) {
  cardboard(x, X, Y, w, h, typeof i === 'number' ? i + 3 : i === 'fall' ? 12 : 40);
  if (i === 'blank') return;
  const fall = i === 'fall', n0 = fall ? 9 : i, text = SIGNS[n0], ink = INKS[n0];
  const lines = signLines(text), n = lines.length;
  // (the fall: room over GREEDY for FALL)
  const big = Math.min(110, (h - 56) / (n + (fall ? 0.75 : 0)) / 1.02), lh = big * 1.02;
  const gap = fall ? big * 0.75 : 0, y0 = Y + h / 2 - ((n - 1) * lh + gap) / 2 + big * 0.36;
  lines.forEach(([l, seg], k) => {
    const yk = y0 + k * lh + (fall && k >= 1 ? gap : 0);
    const lw = marker(x, l, X + w / 2, yk, big, n0 === 3 && seg === 1 ? '#B3202A' : ink, n0 * 7 + k, w - 48);
    if (fall && l.includes('GREEDY')) {
      // GREEDY struck through twice in red, FALL over it
      const scale = lw / Math.max(1, (() => { x.font = `700 ${big}px "Barlow Condensed", sans-serif`; let t = 0; for (const ch of l) t += x.measureText(ch).width * 1.04; return t; })());
      x.font = `700 ${big}px "Barlow Condensed", sans-serif`;
      let pre = 0; for (const ch of l.slice(0, l.indexOf('GREEDY'))) pre += x.measureText(ch).width * 1.04;
      let gw = 0; for (const ch of 'GREEDY') gw += x.measureText(ch).width * 1.04;
      const gx = X + w / 2 - lw / 2 + pre * scale, gwS = gw * scale, gy = yk - big * scale * 0.34;
      x.strokeStyle = '#C4202E'; x.lineWidth = big * 0.09; x.lineCap = 'round';
      x.beginPath(); x.moveTo(gx - 4, gy + 7); x.lineTo(gx + gwS + 4, gy - 7); x.moveTo(gx - 4, gy - 9); x.lineTo(gx + gwS + 4, gy + 5); x.stroke();
      x.save(); x.translate(gx + gwS / 2, yk - big * 0.88); x.rotate(-0.07); marker(x, 'FALL', 0, 0, big * 0.85, '#C4202E', 99); x.restore();
      // (and a caret under it)
      x.strokeStyle = '#C4202E'; x.lineWidth = big * 0.06; x.beginPath(); x.moveTo(gx + gwS / 2 - 18, yk - big * 0.78); x.lineTo(gx + gwS / 2, yk - big * 0.9); x.lineTo(gx + gwS / 2 + 18, yk - big * 0.78); x.stroke();
    }
  });
  // (a doodle: a heart by the 99%, an underline under AUDIT)
  if (i === 1) drawHeart(x, X + w - 54, Y + h - 46, 20, '#B3202A');
  if (i === 2) { x.strokeStyle = ink; x.lineWidth = 8; x.beginPath(); x.moveTo(X + 70, Y + h / 2 + 50); x.quadraticCurveTo(X + w / 2, Y + h / 2 + 60, X + w - 70, Y + h / 2 + 44); x.stroke(); }
}

function buildCamp(W, parent, colliders, CLIPS) {
  const app = W.app, cm = app.controllerManager, scene = app.scene, N = window.NYC;
  const g = new THREE.Group(); g.name = 'wagmi-m3-camp'; parent.add(g);
  const gy = (x, z) => cm.getGroundHeight(x, z, 'person');
  // merged by material: a draw call each
  const kit = new Map();
  const _m4 = new THREE.Matrix4(), _e = new THREE.Euler(), _qk = new THREE.Quaternion(), _s1 = new THREE.Vector3();
  const put = (mat, geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { geo.applyMatrix4(_m4.compose(V(x, y, z), _qk.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s1.set(sx, sy, sz))); if (!kit.has(mat)) kit.set(mat, []); kit.get(mat).push(geo); };
  const nylon = ['#D9792B', '#2E6FB0', '#3E8E5A', '#E3C34A', '#B8423A', '#6B7480', '#2F64B3'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.62, side: THREE.DoubleSide }));
  const dark = new THREE.MeshStandardMaterial({ color: '#202328', roughness: 0.8 });
  const pole = new THREE.MeshStandardMaterial({ color: '#8C9198', roughness: 0.4, metalness: 0.7 });
  const wood = new THREE.MeshStandardMaterial({ color: '#8A6844', roughness: 0.85 });
  const sheet = new THREE.MeshStandardMaterial({ color: '#EEEAE0', roughness: 0.9, side: THREE.DoubleSide });
  const steel = new THREE.MeshStandardMaterial({ color: '#B4B9C0', roughness: 0.3, metalness: 0.85 });
  const crate = new THREE.MeshStandardMaterial({ color: '#2D5FA8', roughness: 0.6 });
  const skin = new THREE.MeshStandardMaterial({ color: '#E6D8BC', roughness: 0.7 });
  const drumWood = new THREE.MeshStandardMaterial({ color: '#7A4A2A', roughness: 0.6 });
  const bag = new THREE.MeshStandardMaterial({ color: '#4C3B5C', roughness: 0.85 });

  /* the tents */
  for (const [x, z, h, kind, c] of CAMP.tents) {
    const y = gy(x, z), mat = nylon[c];
    const f = [Math.sin(h), Math.cos(h)], r = [Math.cos(h), -Math.sin(h)];
    if (kind === 'dome') {
      put(mat, new THREE.SphereGeometry(1, 18, 8, 0, PI * 2, 0, PI / 2), x, y, z, 0, h, 0, 1.15, 1.0, 1.05);
      // its poles over it, the door (dark, zipped half open) on the front
      for (const a of [0.7, -0.7]) put(pole, new THREE.TorusGeometry(1.06, 0.012, 4, 24, PI), x, y, z, 0, h + a, 0, 1.12, 1.0, 1);
      put(dark, new THREE.CircleGeometry(0.42, 14, 0, PI), x + f[0] * 1.07, y + 0.02, z + f[1] * 1.07, -0.25, h, 0, 1, 1.35, 1);
      colliders.push({ minX: x - 1.1, maxX: x + 1.1, minZ: z - 1.1, maxZ: z + 1.1, maxY: y + 1.0, wagmi: 'm3' });
    } else if (kind === 'ridge') {
      // a prism on its side, the ridge 1.15 m up, 2.3 m long
      put(mat, new THREE.CylinderGeometry(0.78, 0.78, 2.3, 3, 1, false), x, y + 0.39, z, -PI / 2, h, 0);
      put(dark, new THREE.CircleGeometry(0.36, 3), x + f[0] * 1.16, y + 0.32, z + f[1] * 1.16, 0, h, PI / 2);
      colliders.push({ minX: x - 1.2, maxX: x + 1.2, minZ: z - 1.2, maxZ: z + 1.2, maxY: y + 1.15, wagmi: 'm3' });
    } else {
      // a blue tarp on two poles and two stakes: a lean-to, a sleeping bag under it
      put(mat, new THREE.PlaneGeometry(2.8, 2.2), x, y + 1.0, z, -0.62, h, 0);
      for (const s2 of [-1.35, 1.35]) put(pole, new THREE.CylinderGeometry(0.02, 0.02, 1.9, 5), x + r[0] * s2 - f[0] * 0.66, y + 0.95, z + r[1] * s2 - f[1] * 0.66);
      put(bag, new THREE.CapsuleGeometry(0.28, 1.4, 4, 8), x, y + 0.14, z, PI / 2, h + PI / 2, 0, 1, 1, 0.45);
      colliders.push({ minX: x - 1.4, maxX: x + 1.4, minZ: z - 1.1, maxZ: z + 1.1, maxY: y + 1.7, wagmi: 'm3' });
    }
  }
  /* the kitchen: a white canopy on four legs, a table of pots, a cooler, crates, the sign on its front */
  const K = CAMP.kitchen, ky = gy(K.x, K.z);
  {
    const f = [Math.sin(K.h), Math.cos(K.h)], r = [Math.cos(K.h), -Math.sin(K.h)];
    const at = (fw, rt) => [K.x + f[0] * fw + r[0] * rt, K.z + f[1] * fw + r[1] * rt];
    for (const [a, b] of [[1.5, 1.5], [1.5, -1.5], [-1.5, 1.5], [-1.5, -1.5]]) { const [px, pz] = at(a, b); put(pole, new THREE.CylinderGeometry(0.025, 0.025, 2.3, 6), px, ky + 1.15, pz); }
    put(sheet, new THREE.ConeGeometry(2.25, 0.62, 4, 1, true), K.x, ky + 2.6, K.z, 0, K.h + PI / 4, 0);
    const [tx, tz] = at(0.3, 0); put(steel, new THREE.BoxGeometry(2.0, 0.05, 0.8), tx, ky + 0.78, tz, 0, K.h, 0);
    for (const s2 of [-0.9, 0.9]) { const [lx, lz] = at(0.3, s2); put(steel, new THREE.BoxGeometry(0.04, 0.76, 0.7), lx, ky + 0.39, lz, 0, K.h, 0); }
    for (const [a, b, rr, hh] of [[0.3, -0.6, 0.2, 0.32], [0.3, 0.05, 0.24, 0.38], [0.35, 0.62, 0.17, 0.26]]) { const [px, pz] = at(a, b); put(steel, new THREE.CylinderGeometry(rr, rr * 0.95, hh, 16), px, ky + 0.81 + hh / 2, pz); }
    { const [px, pz] = at(-0.9, 1.0); put(nylon[0], new THREE.CylinderGeometry(0.2, 0.2, 0.5, 14), px, ky + 0.25, pz); }
    for (let i = 0; i < 4; i++) { const [px, pz] = at(-0.9, -1.2 + (i % 2) * 0.42); put(crate, new THREE.BoxGeometry(0.38, 0.3, 0.38), px, ky + 0.15 + (i > 1 ? 0.3 : 0), pz, 0, K.h + i * 0.1, 0); }
    // her crate, the people's mic's spot (the camp faces it)
    put(wood, new THREE.BoxGeometry(0.55, 0.35, 0.45), BEA_AT[0], gy(BEA_AT[0], BEA_AT[1]) + 0.175, BEA_AT[1], 0, 0.3, 0);
    colliders.push({ minX: K.x - 1.6, maxX: K.x + 1.6, minZ: K.z - 1.6, maxZ: K.z + 1.6, maxY: ky + 0.9, wagmi: 'm3' });
    const sign = canvasTex(1024, 192, (x, w, h) => {
      x.fillStyle = '#F1ECDF'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(120,100,70,.06)'; x.fillRect(Math.random() * w, 0, 30 + Math.random() * 80, h); }
      marker(x, "MS. BEA'S KITCHEN", w / 2, 92, 88, '#B3202A', 51, w - 60);
      marker(x, 'EVERYBODY EATS', w / 2, 168, 58, '#1F3F8F', 52, w - 200);
    });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.56), new THREE.MeshStandardMaterial({ map: sign, roughness: 0.9, side: THREE.DoubleSide }));
    const [sx, sz] = at(1.53, 0); sm.position.set(sx, ky + 2.0, sz); sm.rotation.y = K.h; sm.castShadow = true; g.add(sm);
  }
  /* the drum circle: djembes and buckets in a ring */
  const D = CAMP.drums;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2, x = D.x + Math.sin(a) * D.r, z = D.z + Math.cos(a) * D.r, y = gy(x, z);
    if (i % 3 === 2) { put(nylon[i % 2 ? 0 : 3], new THREE.CylinderGeometry(0.15, 0.13, 0.36, 12), x, y + 0.18, z); continue; }
    put(drumWood, new THREE.CylinderGeometry(0.17, 0.11, 0.42, 14), x, y + 0.42, z); put(drumWood, new THREE.CylinderGeometry(0.1, 0.15, 0.22, 12), x, y + 0.11, z);
    put(skin, new THREE.CylinderGeometry(0.175, 0.175, 0.02, 14), x, y + 0.64, z);
  }
  /* the banner: OCCUPY JPBANK painted on a bedsheet, sagging between two poles */
  {
    const [ax, az] = CAMP.banner.a, [bx, bz] = CAMP.banner.b, L = Math.hypot(bx - ax, bz - az), h = Math.atan2(bz - az, bx - ax);
    const tex = canvasTex(1024, 240, (x, w, hh) => {
      x.fillStyle = '#EFEAE0'; x.fillRect(0, 0, w, hh);
      for (let i = 0; i < 9; i++) { const gx = Math.random() * w, gr = x.createLinearGradient(gx - 30, 0, gx + 30, 0); gr.addColorStop(0, 'rgba(120,110,90,0)'); gr.addColorStop(0.5, 'rgba(120,110,90,.12)'); gr.addColorStop(1, 'rgba(120,110,90,0)'); x.fillStyle = gr; x.fillRect(gx - 30, 0, 60, hh); }
      marker(x, 'OCCUPY JPBANK', w / 2 - 70, 150, 150, '#151515', 61, 760);
      x.save(); x.translate(w - 110, 96); x.rotate(0.12); marker(x, 'DAY', 0, 0, 52, '#B3202A', 62); marker(x, '41', 0, 70, 84, '#B3202A', 63); x.restore();
      marker(x, 'AUDIT THE BANK · WE ARE THE 99%', w / 2 - 70, 214, 42, '#1F3F8F', 64, 700);
    });
    // (its back: the same sheet, the paint showing through faintly; seen from behind, mirrored, as it would be)
    const plain = canvasTex(1024, 240, (x, w, hh) => { x.drawImage(tex.canvas, 0, 0); x.fillStyle = 'rgba(232,226,214,.8)'; x.fillRect(0, 0, w, hh); });
    const geo = new THREE.PlaneGeometry(L - 0.3, 1.5, 24, 1), pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) { const u = (pa.getX(i) + (L - 0.3) / 2) / (L - 0.3); pa.setY(i, pa.getY(i) - Math.sin(PI * u) * 0.16); pa.setZ(i, Math.sin(u * PI * 3) * 0.04); }
    geo.computeVertexNormals();
    const y = (gy(ax, az) + gy(bx, bz)) / 2;
    const front = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, side: THREE.FrontSide }));
    const back = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: plain, roughness: 0.92, side: THREE.BackSide }));
    for (const m of [front, back]) { m.position.set((ax + bx) / 2, y + 1.65, (az + bz) / 2); m.rotation.y = -h + PI; m.castShadow = true; g.add(m); }
    for (const [px, pz] of [[ax, az], [bx, bz]]) { put(wood, new THREE.CylinderGeometry(0.04, 0.05, 2.7, 7), px, gy(px, pz) + 1.35, pz); }
  }
  /* the signs: marker on cardboard, an atlas of them (4 x 3 cells); on stakes, leaning on the tents, low on crates */
  const CW = 512, CH = 320, atlas = canvasTex(2048, 1024, (x) => {
    for (let i = 0; i < 12; i++) { const c = i % 4, r = (i / 4) | 0; drawSign(x, c * CW + 6, r * 341 + 6, CW - 12, CH - 12, i < 10 ? i : i === 10 ? 'fall' : 'blank'); }
  });
  atlas.anisotropy = 8;
  const uvCell = (geo, i) => {
    const c = i % 4, r = (i / 4) | 0, u0 = (c * CW) / 2048, u1 = ((c + 1) * CW) / 2048, v1 = 1 - (r * 341) / 1024, v0 = 1 - (r * 341 + CH) / 1024, uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) ? u1 : u0, uv.getY(k) ? v1 : v0);
    return geo;
  };
  const signGeos = [], dan = [];
  for (const [x, z, h, i, how] of CAMP.signs) {
    const w = how === 'lean' ? 1.15 : how === 'low' ? 0.9 : 0.86, hh = w * (CH / CW), y = gy(x, z);
    const lift = how === 'stake' ? 1.32 : how === 'lean' ? hh / 2 + 0.02 : hh / 2 + 0.36, tilt = how === 'lean' ? -0.32 : how === 'low' ? -0.12 : (Math.random() - 0.5) * 0.08;
    const roll = (Math.random() - 0.5) * 0.06;
    const mk = (cell, back) => { const geo = uvCell(new THREE.PlaneGeometry(w, hh), cell); if (back) geo.applyMatrix4(_m4.makeRotationY(PI)); geo.applyMatrix4(_m4.compose(V(x, y + lift, z), _qk.setFromEuler(_e.set(tilt, h + PI, roll, 'YXZ')), _s1.set(1, 1, 1))); return geo; };
    const fr = mk(i, false); signGeos.push(fr); if (i === 9) dan.push(fr);
    signGeos.push(mk(11, true));
    if (how === 'stake') put(wood, new THREE.BoxGeometry(0.035, 1.25, 0.02), x + Math.sin(h) * 0.02, y + 0.62, z + Math.cos(h) * 0.02, 0, h, 0);
    if (how === 'low') put(crate, new THREE.BoxGeometry(0.4, 0.32, 0.4), x + Math.sin(h) * 0.25, y + 0.16, z + Math.cos(h) * 0.25, 0, h, 0);
  }
  const signMat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.95, alphaTest: 0.5 });
  { const m = new THREE.Mesh(mergeGeometries(signGeos, false), signMat); m.castShadow = true; m.receiveShadow = true; g.add(m); }
  for (const [mat, geos] of kit) { const m = new THREE.Mesh(mergeGeometries(geos, false), mat); m.castShadow = true; m.receiveShadow = true; g.add(m); }

  /* the camp's people (the city's own, a second instanced crowd): round the drums, at the kitchen, by the tents
     watching the screens; mic(on): all of them facing Ms. Bea's crate */
  if (!N?.PersonCrowd || !N?.PersonRig) return { group: g, show() {}, reset() {}, cheer() {}, mic() {}, fallMan() {}, update() {} };
  let s = 23; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const spots = [];
  for (let i = 0; i < 9; i++) { const a = (i / 9) * PI * 2 + 0.2, rr = D.r + 0.85 + rnd() * 0.4; spots.push([D.x + Math.sin(a) * rr, D.z + Math.cos(a) * rr, Math.atan2(-Math.sin(a), -Math.cos(a)), 'drum']); }
  for (const [x, z, h] of CAMP.queue) spots.push([x, z, h, 'kitchen']);
  for (const [x, z] of CAMP.watch) spots.push([x, z, null, 'watch']);
  const NC = spots.length, C = new N.PersonCrowd(NC, { farDistance: 40, name: 'CampCrowd' });
  for (const m of C.meshes) { m.visible = false; scene.add(m); }
  const ground = (o, x, z) => gy(x, z);
  const people = spots.map(([x, z, h, mode], i) => {
    const female = rnd() < 0.5;
    // (the watchers face the rigs: the reel aimed at them)
    const hh = h ?? Math.atan2(-8 - x, 2862 - z) + (rnd() - 0.5) * 0.4;
    return { x, z, h0: hh, h: hh, mode, cheerT: 0, cheerClip: rnd() < 0.5 ? 'raiseBothYouth' : 'waveRightYouth', rate: 0.9 + rnd() * 0.2, at: rnd() * 15,
      dance: rnd() < 0.5 ? 'danceShort' : 'danceLong', danced: false, fade: 0,
      rig: new N.PersonRig({ seed: 300 + i * 5.3, female, scale: female ? 0.92 + rnd() * 0.05 : 0.97 + rnd() * 0.06, girth: 0.9 + rnd() * 0.3, hair: female ? 0.6 + rnd() * 0.4 : rnd() * 0.4 }) };
  });
  let micOn = false, fallen = false;
  const atlasCtx = atlas.canvas.getContext('2d');
  return {
    group: g, people,
    show(on) { g.visible = !!on; for (const m of C.meshes) m.visible = !!on; },
    reset() { micOn = false; for (const p of people) { p.cheerT = 0; p.h = p.h0; p.rig.reset?.(p.x, p.z, p.h, ground, p); } if (fallen) { fallen = false; atlasCtx.clearRect(1 * CW, 2 * 341, CW, 341); drawSign(atlasCtx, 1 * CW + 6, 2 * 341 + 6, CW - 12, CH - 12, 9); atlas.needsUpdate = true; } },
    // (everyone not drumming: arms up for secs, each a moment apart)
    cheer(secs = 3.2) { for (const p of people) if (p.mode !== 'drum' || micOn) p.cheerT = secs + rnd() * 0.5; },
    mic(on) { micOn = !!on; for (const p of people) p.h = on ? Math.atan2(BEA_AT[0] - p.x, BEA_AT[1] - p.z) : p.h0; },
    // Ms. Bea's pen: DAN DAN THE GREEDY MAN, GREEDY struck out, FALL over it
    fallMan() { if (fallen) return; fallen = true; atlasCtx.clearRect(1 * CW, 2 * 341, CW, 341); drawSign(atlasCtx, 1 * CW + 6, 2 * 341 + 6, CW - 12, CH - 12, 'fall'); atlas.needsUpdate = true; },
    update(dt, t, cam) {
      const CL = CLIPS.CL;
      C.begin();
      for (const p of people) {
        p.cheerT = Math.max(0, p.cheerT - dt);
        const clip = p.cheerT > 0 ? p.cheerClip : p.mode === 'drum' && !micOn ? p.dance : null;
        if (clip && CL?.[clip] && p.rig.playClip) { p.rig.playClip(CL[clip], t * p.rate + p.at, p.x, p.z, p.h, gy(p.x, p.z)); p.danced = true; }
        else {
          if (p.danced && p.rig.fadeFrom) { p.danced = false; (p.from ||= new Float32Array(p.rig.pose.length)).set(p.rig.pose); p.fade = 1; }
          p.rig.update(Math.max(1e-4, dt), p.x, p.z, p.h, ground, p, 0, true);
          if (p.fade > 0) { p.fade = Math.max(0, p.fade - dt / 0.3); p.rig.fadeFrom(p.from, p.fade * p.fade * (3 - 2 * p.fade)); }
        }
        C.add(p.rig, cam ? Math.hypot(p.x - cam.x, p.z - cam.z) : 0);
      }
      C.end();
    },
  };
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

// Fiona: JPBank's Head of Community, the community day's host, her own model (assets/characters/fiona.glb, made the way Gears' is, from the
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
