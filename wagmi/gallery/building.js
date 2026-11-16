// Mog City: the gallery itself, Mission 4's swap for the open pavilion (wagmi/mission/m4-pavilion.js): a closed glass
// pavilion on South St at the Seaport, on the pavilion's own spot and frame (m4-set.js PAV, at(a, b): a across the
// street, + east; b along it, + to the closed south end), that Dan walks into. Its own colliders and floor.
//   front hall  b -15.5 .. -1.6   the glass front at the north end (the door in its middle), the gold statue on its
//                                 plinth, lit; the black glass wall behind it (the statue's reflection); the brass
//                                 medallion where its crown's back shows in that reflection
//   corridors   a +-4.3 .. 6.0    either side of the black glass box, through to
//   portraits   b 3.6 .. 15.5     the three portraits on the south wall, each frame's cartouche enamelled with a sigil;
//                                 the certificate on the box's back, facing them
//   the street  b -26.2 .. -15.5  closed before its door: a timber deck curb to curb over the road, a carpet up it,
//                                 planters, striped barriers across it at b -26.6 (a gap in the middle)
// The black glass is a cheap mirror: behind it a black box holds a mirrored copy of the statue and its plinth (no second
// render of the scene), seen only through the glass and shown only while the camera is in the front hall.
//   const B = buildGallery(W, { envMap })   B.group, B.colliders, B.patch, B.lights, B.statue, B.slots, B.cert ...
import * as THREE from 'three/webgpu';
import { lights as lightsNodeOf } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAV, at } from '../mission/m4-set.js';
import { artSlot, wallWash } from './frame.js';
import { buildRegent } from './statue.js';
import { portrait, plaqueCanvas, signCanvas, certCanvas, markCanvas, CROWNS, SIGILS } from './art.js';
import { S as story } from '../story/index.js';

const PI = Math.PI;
export const SW = 0.22;                       // the sidewalks' top: the gallery's floor, flush with them
export const GAL = { a: 6.0, b0: -15.5, b1: 15.5, H: 9.5, MB: -1.6, VB: 3.6, VA: 4.3, door: 1.3, T: 0.3 };
export const STATUE = { a: 0, b: -4.8, plinth: 1.0 };
export const CLUE = { a: 3.7, b: -10.2 };
// the closed street before it: the deck's half width (curb to curb) and its north end, the barriers' line, their gap
export const STREET = { a: 6.2, b0: -26.2, bar: -26.6, gap: 1.3 };      // the medallion: from here the reflection shows the crown's back
// (b: the south wall's inner face, the room's skin on it 0.3 m in from the shell's outside)
// (larger, hung lower and a little wider apart: the look review, round 2, found the room's wall empty above three small
// paintings)
export const PORTRAITS = [-3.75, 0, 3.75].map((a) => ({ a, b: GAL.b1 - GAL.T - 0.01, y: 2.55 }));
export const PIC = { w: 2.1, h: 2.65 };
export const CERT = { a: 0, b: GAL.VB + 0.02, y: 1.75 };
// places, in the world
export const GSPOTS = {
  approach: at(0.6, -27), door: at(0, GAL.b0), inside: at(0, -13.4), clue: at(CLUE.a, CLUE.b),
  statue: at(STATUE.a, STATUE.b), cert: at(CERT.a, CERT.b + 1.6),
  portraits: PORTRAITS.map((p) => at(p.a, p.b - 1.25)),
};

const tex = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, ...o });
const glow = (color, k = 1.6) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) });

export function buildGallery(W, { envMap = null } = {}) {
  const app = W.app;
  const g = new THREE.Group(); g.name = 'm4-gallery'; g.visible = false;
  g.position.set(PAV.x, 0, PAV.z); g.rotation.y = PAV.h;
  // (the follow camera keeps off its colliders; its meshes are not the street's props: wagmi/combat/camera.js)
  g.userData.noCamBlock = true;
  const y0 = SW, H = GAL.H, T = GAL.T;

  /* materials (one draw each, every box of one merged into one mesh: B.box) */
  const floorTex = (() => {
    const [c, x] = canvas(512, 512); x.fillStyle = '#17151A'; x.fillRect(0, 0, 512, 512);
    // (large honed slabs, a fine vein through some, hairline joints)
    let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { x.fillStyle = `hsl(260, 6%, ${8 + r() * 3}%)`; x.fillRect(i * 256 + 1, j * 256 + 1, 254, 254); }
    x.strokeStyle = 'rgba(200,190,170,0.08)'; x.lineWidth = 1.2;
    for (let k = 0; k < 6; k++) { x.beginPath(); let px = r() * 512, py = 0; x.moveTo(px, py); while (py < 512) { px += (r() - 0.5) * 40; py += 20 + r() * 30; x.lineTo(px, py); } x.stroke(); }
    x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(0, 0, 512, 2); x.fillRect(0, 256, 512, 2); x.fillRect(0, 0, 2, 512); x.fillRect(256, 0, 2, 512);
    const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(GAL.a * 2 / 3, (GAL.b1 - GAL.b0) / 3); return t;
  })();
  const M = {
    shell: std('#CDBEA5', { roughness: 0.82 }),                    // travertine, outside (warm: the night's sky fill turned it blue-white)
    inner: std('#3B3029', { roughness: 0.9 }),                    // the halls' walls, a warm umber charcoal
    // (the portrait room: warm limestone under a pale ceiling, a cove of light round its top; the look review, round 1:
    // the aubergine read muddy and the ceiling dark)
    room: std('#B3A894', { roughness: 0.93 }),
    // (a shade darker than round 2: the cove's band at the ceiling seam read as glare)
    ceilR: std('#6E675C', { roughness: 0.95 }),
    floor: std('#FFFFFF', { map: floorTex, roughness: 0.24, metalness: 0.12 }),
    ceil: std('#0F0F12', { roughness: 0.9 }),
    steel: std('#1E2126', { metalness: 0.7, roughness: 0.35 }),
    // (gilt a little satin, its studio reflections down: at 0.3 / 1.0 its edges and corners flared white under bloom)
    gilt: std('#B98E40', { metalness: 0.85, roughness: 0.4, envMap, envMapIntensity: 0.55 }),
    // (the door's surround and its transom: satin past the screen reflections' cut-off, so their undersides don't
    // mirror the medallion on the floor)
    // (brighter than round 2's: at night the door's surround read as dark bronze; lit now by the canopy's downlights)
    giltM: std('#CFA85A', { metalness: 0.45, roughness: 0.62, emissive: new THREE.Color('#2E2108') }), steelM: std('#1E2126', { metalness: 0.4, roughness: 0.8 }),
    giltF: std('#A9843E', { metalness: 0.8, roughness: 0.48, envMap, envMapIntensity: 0.4 }),
    marble: std('#0C0B0D', { roughness: 0.12, metalness: 0.2, envMap, envMapIntensity: 0.8 }),
    glowW: glow('#FFE7C2', 2.2), glowA: glow('#FFC774', 1.8),
    black: new THREE.MeshBasicMaterial({ color: '#000000' }),
    leather: std('#2B1A14', { roughness: 0.55 }),
    deck: null, carpet: std('#5E1119', { roughness: 0.96 }), planter: std('#2A2622', { roughness: 0.6, metalness: 0.3 }),
    shrub: std('#2F4A2A', { roughness: 0.95 }), stripe: null, post: std('#3A3D44'),
    bronze: std('#241C15', { metalness: 0.6, roughness: 0.45 }),
    dado: std('#8F8472', { roughness: 0.9 }),
  };
  const parts = new Map();
  const B = {
    // a box of material key k: size w (a) x h (y) x d (b), its centre at (a, y, b), turned ry
    box(k, w, h, d, a, y, b, ry = 0) { const geo = new THREE.BoxGeometry(w, h, d); if (ry) geo.rotateY(ry); geo.translate(a, y, b); (parts.get(k) || parts.set(k, []).get(k)).push(geo.index ? geo.toNonIndexed() : geo); },
    geo(k, geo) { (parts.get(k) || parts.set(k, []).get(k)).push(geo.index ? geo.toNonIndexed() : geo); },
    done(parent = g) { for (const [k, list] of parts) { const m = new THREE.Mesh(mergeGeometries(list), M[k]); m.name = 'gallery-' + k; m.receiveShadow = true; parent.add(m); for (const l of list) l.dispose(); } parts.clear(); },
  };
  const add = (m, a, y, b, ry = 0, parent = g) => { m.position.set(a, y, b); m.rotation.y = ry; parent.add(m); return m; };

  /* colliders: solid boxes in the frame (the pavilion's solid(): an obb each) */
  const colliders = [];
  const solid = (a, b, ha, hb, top) => {
    const p = at(a, b), cs = Math.cos(PAV.h), sn = Math.sin(PAV.h), ex = Math.abs(cs) * ha + Math.abs(sn) * hb, ez = Math.abs(sn) * ha + Math.abs(cs) * hb;
    colliders.push({ minX: p.x - ex, maxX: p.x + ex, minZ: p.z - ez, maxZ: p.z + ez, maxY: y0 + top, wagmi: 'gallery', obb: { cx: p.x, cz: p.z, hx: ha, hz: hb, cs, sn } });
  };

  /* the floor slab (flush with the sidewalks), an apron of the same stone before the door */
  const len = GAL.b1 - GAL.b0, bm = (GAL.b0 + GAL.b1) / 2;
  B.box('floor', GAL.a * 2, SW, len, 0, SW / 2, bm);
  B.box('floor', 6.4, SW, 2.4, 0, SW / 2, GAL.b0 - 1.2);
  B.box('gilt', 6.4, 0.012, 0.05, 0, SW + 0.004, GAL.b0 - 2.38);
  const pts = [[-STREET.a, STREET.b0], [STREET.a, STREET.b0], [GAL.a, GAL.b0], [GAL.a, GAL.b1], [-GAL.a, GAL.b1], [-GAL.a, GAL.b0], [-STREET.a, GAL.b0]].map(([a, b]) => at(a, b));
  const patch = { minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)), minZ: Math.min(...pts.map((p) => p.z)), maxZ: Math.max(...pts.map((p) => p.z)), top: SW, poly: pts, wagmi: 'gallery' };

  /* the shell: travertine outside, charcoal inside; the roof, its fascia with the sign */
  for (const s of [-1, 1]) {
    B.box('shell', T * 0.5, H, len, s * (GAL.a - T * 0.25), y0 + H / 2, bm);
    B.box('inner', T * 0.5, H, GAL.VB - GAL.b0, s * (GAL.a - T * 0.75), y0 + H / 2, (GAL.b0 + GAL.VB) / 2);
    B.box('room', T * 0.5, H, GAL.b1 - GAL.VB, s * (GAL.a - T * 0.75), y0 + H / 2, (GAL.VB + GAL.b1) / 2);
    solid(s * (GAL.a - T / 2), bm, T / 2, len / 2, H);
    // (gold fins down the long walls, outside)
    for (let b = GAL.b0 + 2; b < GAL.b1 - 1; b += 2.6) B.box('gilt', 0.06, H - 1.2, 0.16, s * (GAL.a + 0.03), y0 + H / 2 - 0.3, b);
  }
  B.box('shell', GAL.a * 2, H, T * 0.5, 0, y0 + H / 2, GAL.b1 - T * 0.25);
  B.box('room', GAL.a * 2 - T * 2, H, T * 0.5, 0, y0 + H / 2, GAL.b1 - T * 0.75);
  solid(0, GAL.b1 - T / 2, GAL.a, T / 2, H);
  // the roof: a slab with a little overhang, the ceiling under it, the fascia over the front with the sign
  B.box('shell', GAL.a * 2 + 0.8, 0.5, len + 0.8, 0, y0 + H + 0.25, bm);
  B.box('ceil', GAL.a * 2 - T * 2, 0.04, GAL.VB - GAL.b0 - T / 2, 0, y0 + H - 0.02, (GAL.b0 + T / 2 + GAL.VB) / 2);
  B.box('ceilR', GAL.a * 2 - T * 2, 0.04, GAL.b1 - GAL.VB - T / 2, 0, y0 + H - 0.02, (GAL.VB + GAL.b1 - T / 2) / 2);
  // (the fascia travertine, as the piers under it, the sign on a bronze panel set into it: the look review, round 2:
  // all black, the front read as a pop-up)
  B.box('shell', GAL.a * 2 + 1.4, 1.35, 0.6, 0, y0 + H + 0.38, GAL.b0 - 0.6);
  B.box('bronze', 9.0, 1.02, 0.06, 0, y0 + H + 0.4, GAL.b0 - 0.92);
  B.box('giltM', 9.12, 0.05, 0.08, 0, y0 + H + 0.93, GAL.b0 - 0.92); B.box('giltM', 9.12, 0.05, 0.08, 0, y0 + H - 0.13, GAL.b0 - 0.92);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 1.54), new THREE.MeshBasicMaterial({ map: tex(signCanvas()), transparent: true, color: new THREE.Color(1.5, 1.5, 1.5) }));
  add(sign, 0, y0 + H + 0.42, GAL.b0 - 0.955, PI);
  // (a warm line under the fascia, grazing the glass's top)
  B.box('glowA', GAL.a * 2, 0.03, 0.03, 0, y0 + H - 0.2, GAL.b0 - 0.35);
  // the ceiling's light lines down both halls
  for (const a of [-3.2, -1.1, 1.1, 3.2]) { B.box('glowW', 0.07, 0.03, GAL.MB - GAL.b0 - 1.2, a, y0 + H - 0.06, (GAL.b0 + GAL.MB) / 2); B.box('glowW', 0.07, 0.03, GAL.b1 - GAL.VB - 1.2, a, y0 + H - 0.06, (GAL.VB + GAL.b1) / 2); }

  /* the glass front: a curtain wall of tall panes, steel mullions, the door's opening in its middle under a canopy */
  const glassMat = new THREE.MeshBasicMaterial({ color: '#7F98A8', transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide });
  {
    const b = GAL.b0, D = GAL.door;
    for (const s of [-1, 1]) {
      const w = GAL.a - D;
      add(new THREE.Mesh(new THREE.PlaneGeometry(w, H), glassMat), s * (D + w / 2), y0 + H / 2, b);
      solid(s * (D + w / 2), b, w / 2, 0.08, H);
      for (let k = 0; k <= 3; k++) B.box('steel', 0.09, H, 0.14, s * (D + (w * k) / 3), y0 + H / 2, b);
      B.box('steel', 0.12, 3.4, 0.16, s * D, y0 + 1.7, b);
    }
    // (stone piers at its two corners, a stone sill under the panes: the glass set in a building, not a box)
    for (const s of [-1, 1]) {
      B.box('shell', 0.85, H, 0.7, s * (GAL.a - 0.42), y0 + H / 2, b - 0.25);
      solid(s * (GAL.a - 0.42), b - 0.25, 0.43, 0.35, H);
      const w = GAL.a - D - 0.85 - 0.4, a0 = D + 0.4 + w / 2;
      B.box('shell', w + 0.1, 0.55, 0.42, s * a0, y0 + 0.275, b - 0.1); solid(s * a0, b - 0.1, w / 2, 0.21, 0.55);
      B.box('giltM', w + 0.1, 0.03, 0.03, s * a0, y0 + 0.56, b - 0.3);
      // (brass piers either side of the door, under the canopy)
      B.box('giltM', 0.4, 3.9, 0.5, s * (D + 0.2), y0 + 1.95, b - 0.2);
      solid(s * (D + 0.2), b - 0.2, 0.2, 0.25, 3.9);
    }
    // the canopy over the door: glass in a brass frame (so the statue still shows whole through it from the street),
    // warm downlights in its side rails and their pool on the carpet
    const cw = D * 2 + 2.6, cy = y0 + 3.98;
    { const cg = add(new THREE.Mesh(new THREE.PlaneGeometry(cw, 2.6), glassMat), 0, cy, b - 1.1); cg.rotation.x = -PI / 2; }
    // (no rail across its front: from the street that crossed the statue's waist)
    for (const s of [-1, 1]) {
      B.box('giltM', 0.12, 0.16, 2.6, s * (cw / 2), cy, b - 1.1);
      for (const db of [-0.55, -1.25, -1.95]) B.geo('glowA', new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10).translate(s * (cw / 2), cy - 0.085, b + db));
      // (its two tie rods up to the fascia)
      const rod = new THREE.CylinderGeometry(0.018, 0.018, 1, 6); const r0 = new THREE.Vector3(s * (cw / 2), cy, b - 2.36), r1 = new THREE.Vector3(s * (cw / 2), y0 + 6.6, b - 0.05);
      const mid = r0.clone().add(r1).multiplyScalar(0.5), len = r0.distanceTo(r1); rod.scale(1, len, 1); rod.rotateX(Math.atan2(r1.z - r0.z, r1.y - r0.y)); rod.translate(mid.x, mid.y, mid.z); B.geo('steel', rod);
    }
    {
      const [c, x] = canvas(128, 128); const gr = x.createRadialGradient(64, 64, 6, 64, 64, 64); gr.addColorStop(0, 'rgba(255,200,130,0.42)'); gr.addColorStop(1, 'rgba(255,200,130,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 4.2), new THREE.MeshBasicMaterial({ map: tex(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      pool.rotation.x = -PI / 2; pool.renderOrder = 2; pool.position.set(0, y0 + 0.02, b - 1.2); g.add(pool);
    }
    // (a warm uplight grazing each stone pier from its foot, and the fascia from under the canopy's line)
    {
      const [c, x] = canvas(8, 128); const gr = x.createLinearGradient(0, 128, 0, 0); gr.addColorStop(0, 'rgba(255,196,128,0.36)'); gr.addColorStop(0.5, 'rgba(255,196,128,0.12)'); gr.addColorStop(1, 'rgba(255,196,128,0)'); x.fillStyle = gr; x.fillRect(0, 0, 8, 128);
      const um = new THREE.MeshBasicMaterial({ map: tex(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      for (const s of [-1, 1]) { const u = add(new THREE.Mesh(new THREE.PlaneGeometry(0.85, H * 0.8), um), s * (GAL.a - 0.42), y0 + H * 0.4, b - 0.605, PI); u.renderOrder = 2; }
    }
    // the front hall's own glow, seen through the glass from the street: a warm uplight along the foot of each side wall
    // and its wash up the wall (no light of its own)
    {
      const [c, x] = canvas(8, 128); const gr = x.createLinearGradient(0, 128, 0, 0); gr.addColorStop(0, 'rgba(255,190,120,0.42)'); gr.addColorStop(1, 'rgba(255,190,120,0)'); x.fillStyle = gr; x.fillRect(0, 0, 8, 128);
      const wm = new THREE.MeshBasicMaterial({ map: tex(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const inA = GAL.a - T, hl = GAL.VB - b - 0.6, hm = (b + GAL.VB) / 2;
      for (const s of [-1, 1]) {
        B.box('glowA', 0.05, 0.03, hl, s * (inA - 0.06), y0 + 0.03, hm);
        const wv = add(new THREE.Mesh(new THREE.PlaneGeometry(hl, 4.2), wm), s * (inA - 0.01), y0 + 2.1, hm, -s * PI / 2); wv.renderOrder = 2;
      }
    }
    // (over the door: glass on to the roof, a transom, a gilt frame round the opening, the canopy)
    add(new THREE.Mesh(new THREE.PlaneGeometry(D * 2, H - 3.4), glassMat), 0, y0 + 3.4 + (H - 3.4) / 2, b);
    B.box('steelM', GAL.a * 2, 0.1, 0.14, 0, y0 + 3.4, b);
    B.box('giltM', D * 2 + 0.2, 0.1, 0.2, 0, y0 + 3.42, b - 0.02);
    for (const s of [-1, 1]) B.box('giltM', 0.1, 3.4, 0.2, s * (D + 0.05), y0 + 1.7, b - 0.02);
    // (a carpet up to the door from the deck's end, a rope line either side of it at the door)
    B.box('carpet', 1.8, 0.012, b - STREET.b0 - 0.4, 0, SW + 0.007, (b + STREET.b0 + 0.4) / 2);
    const rope = std('#5A0F18', { roughness: 0.8 });
    for (const s of [-1, 1]) {
      // (satin brass: the camera passes close by them at the door, and polished they flared to a white blob)
      for (const db of [-0.75, -2.2]) { B.box('giltM', 0.06, 0.95, 0.06, s * 1.4, y0 + 0.475, b + db); B.geo('giltM', new THREE.SphereGeometry(0.06, 10, 8).translate(s * 1.4, y0 + 0.98, b + db)); }
      const m = add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.45, 6), rope), s * 1.4, y0 + 0.82, b - 1.475); m.rotation.x = PI / 2;
    }
  }

  /* the street closed before it (the pavilion's premise: a gallery on a closed street, not a box on a live road): a
     timber deck curb to curb over the road and its lines, flush with the sidewalks, a ramp at its end; planters by the
     door and at the deck's corners; striped barriers across the street, a gap in the middle to walk in by */
  {
    const [c, x] = canvas(256, 256); x.fillStyle = '#5B4634'; x.fillRect(0, 0, 256, 256);
    let s = 11; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 16; i++) { x.fillStyle = `hsl(25, ${22 + r() * 10}%, ${20 + r() * 8}%)`; x.fillRect(0, i * 16, 256, 15); x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, i * 16 + 15, 256, 1); x.fillRect(Math.floor(r() * 256), i * 16, 1, 15); }
    const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(STREET.a * 2 / 3, (GAL.b0 - STREET.b0) / 3);
    M.deck = std('#FFFFFF', { map: t, roughness: 0.82 });
    const dl = GAL.b0 - STREET.b0;
    B.box('deck', STREET.a * 2, SW - 0.004, dl, 0, (SW - 0.004) / 2, (GAL.b0 + STREET.b0) / 2);
    // (the ramp up on to it from the road, and its brass nosing)
    B.geo('deck', new THREE.BoxGeometry(STREET.a * 2, 0.04, 1.0).rotateX(-Math.atan2(SW, 1.0)).translate(0, SW / 2 - 0.02, STREET.b0 - 0.5));
    B.box('gilt', STREET.a * 2, 0.02, 0.05, 0, SW - 0.002, STREET.b0 + 0.02);
    const [sc, sx] = canvas(128, 32); for (let i = 0; i < 8; i++) { sx.fillStyle = i % 2 ? '#EDEDED' : '#D23B2E'; sx.beginPath(); sx.moveTo(i * 16, 32); sx.lineTo(i * 16 + 16, 0); sx.lineTo(i * 16 + 32, 0); sx.lineTo(i * 16 + 16, 32); sx.fill(); }
    const st2 = tex(sc); st2.wrapS = THREE.RepeatWrapping; st2.repeat.set(2, 1); M.stripe = std('#FFFFFF', { map: st2, roughness: 0.7 });
    for (const [a0, a1] of [[-STREET.a - 0.3, -STREET.gap], [STREET.gap, STREET.a + 0.3]]) {
      const bb = STREET.bar;
      B.box('stripe', a1 - a0, 0.32, 0.12, (a0 + a1) / 2, 0.95, bb); solid((a0 + a1) / 2, bb, (a1 - a0) / 2, 0.12, 1.15 - SW);
      for (const a of [a0 + 0.3, a1 - 0.3]) B.box('post', 0.1, 1.1, 0.5, a, 0.55, bb);
    }
    // (planters: a bronze box each, a clipped shrub in it)
    for (const [a, b] of [[-3.0, GAL.b0 - 1.1], [3.0, GAL.b0 - 1.1], [-STREET.a + 0.7, STREET.b0 + 0.9], [STREET.a - 0.7, STREET.b0 + 0.9]]) {
      B.box('planter', 0.95, 0.7, 0.95, a, y0 + 0.35, b); B.box('gilt', 1.0, 0.04, 1.0, a, y0 + 0.71, b);
      B.geo('shrub', new THREE.IcosahedronGeometry(0.58, 1).scale(1, 0.85, 1).translate(a, y0 + 1.15, b));
      solid(a, b, 0.5, 0.5, 1.6);
    }
  }

  /* the statue on its plinth, lit; the plinth's plate */
  const reg = buildRegent(THREE, { envMap });
  const P0 = y0 + STATUE.plinth;
  const plinth = (parent, k = 'marble') => {
    const geos = [new THREE.BoxGeometry(2.8, STATUE.plinth - 0.12, 2.2).translate(0, (STATUE.plinth - 0.12) / 2 + 0.12, 0), new THREE.BoxGeometry(3.0, 0.12, 2.4).translate(0, 0.06, 0)];
    const m = new THREE.Mesh(mergeGeometries(geos.map((q) => q.toNonIndexed())), M[k]); parent.add(m);
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.84, 0.05, 2.24).translate(0, STATUE.plinth - 0.06, 0), M.gilt); parent.add(band);
    return m;
  };
  {
    const sg = add(new THREE.Group(), STATUE.a, y0, STATUE.b, PI);
    plinth(sg);
    reg.group.position.y = STATUE.plinth; sg.add(reg.group);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.33), new THREE.MeshBasicMaterial({ map: tex(plaqueCanvas('The Regent', 'Gilded bronze · ' + 'Marzo Quillfeather')) }));
    add(plate, STATUE.a, y0 + 0.55, STATUE.b - 1.105, PI);
    solid(STATUE.a, STATUE.b, 1.5, 1.2, STATUE.plinth + reg.height);
    // (a pool of light on the floor round it)
    const [c, x] = canvas(128, 128); const gr = x.createRadialGradient(64, 64, 10, 64, 64, 64); gr.addColorStop(0, 'rgba(255,205,130,0.38)'); gr.addColorStop(1, 'rgba(255,205,130,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: tex(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pool.rotation.x = -PI / 2; pool.renderOrder = 2; pool.position.set(STATUE.a, y0 + 0.01, STATUE.b); g.add(pool);
  }

  /* the black glass wall and the box behind it: the statue's reflection */
  const mirrorMat = new THREE.MeshStandardMaterial({ color: '#06070A', metalness: 0.9, roughness: 0.06, transparent: true, opacity: 0.5, depthWrite: false, envMap, envMapIntensity: 0.35 });
  const mirrorG = new THREE.Group(); mirrorG.name = 'gallery-reflection';
  {
    const VA = GAL.VA, MB = GAL.MB, VB = GAL.VB, vb = (MB + VB) / 2;
    add(new THREE.Mesh(new THREE.PlaneGeometry(VA * 2, H), mirrorMat), 0, y0 + H / 2, MB);
    // (its gilt frame; the box's skins: charcoal to the corridors, black inside, aubergine on its back to the portraits)
    B.box('gilt', VA * 2 + 0.12, 0.08, 0.1, 0, y0 + 0.04, MB);
    for (const s of [-1, 1]) {
      B.box('gilt', 0.08, H, 0.12, s * (VA + 0.02), y0 + H / 2, MB);
      B.box('inner', 0.1, H, VB - MB, s * (VA + 0.05), y0 + H / 2, vb);
      B.box('black', 0.05, H, VB - MB, s * (VA - 0.03), y0 + H / 2, vb);
    }
    B.box('room', VA * 2 + 0.2, H, 0.1, 0, y0 + H / 2, VB - 0.05);
    B.box('black', VA * 2, H, 0.05, 0, y0 + H / 2, VB - 0.13);
    B.box('black', VA * 2, 0.05, VB - MB, 0, y0 + H - 0.05, vb);
    solid(0, vb, VA + 0.1, (VB - MB) / 2, H);
    // the mirrored world: through b = MB, the statue and its plinth; the floor's stone under them
    const mw = new THREE.Group(); mw.position.z = 2 * MB; mw.scale.z = -1; mirrorG.add(mw);
    const sg = new THREE.Group(); sg.position.set(STATUE.a, y0, STATUE.b); sg.rotation.y = PI; mw.add(sg);
    plinth(sg); const copy = reg.mirror(); copy.position.y = STATUE.plinth; sg.add(copy);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(VA * 2, VB - MB), M.floor); fl.rotation.x = -PI / 2; fl.position.set(0, y0 + 0.002, vb); mirrorG.add(fl);
    g.add(mirrorG);
  }

  /* the medallion in the floor: from it, the crown's back shows in the black glass */
  const medal = (() => {
    const [c, x] = canvas(256, 256), o = 128;
    const gr = x.createRadialGradient(o - 30, o - 30, 8, o, o, 128); gr.addColorStop(0, '#F7DC94'); gr.addColorStop(0.6, '#B88A33'); gr.addColorStop(1, '#5E4012');
    x.fillStyle = gr; x.beginPath(); x.arc(o, o, 126, 0, 2 * PI); x.fill();
    x.strokeStyle = '#3E2A08'; x.lineWidth = 3; for (const r of [118, 96, 40]) { x.beginPath(); x.arc(o, o, r, 0, 2 * PI); x.stroke(); }
    x.fillStyle = '#3E2A08'; for (let i = 0; i < 4; i++) { const a = i * PI / 2; x.beginPath(); x.moveTo(o + Math.cos(a) * 92, o + Math.sin(a) * 92); x.lineTo(o + Math.cos(a + 0.18) * 42, o + Math.sin(a + 0.18) * 42); x.lineTo(o + Math.cos(a - 0.18) * 42, o + Math.sin(a - 0.18) * 42); x.fill(); }
    x.font = '700 15px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const word = story.t('LOOK TWICE'); for (let i = 0; i < word.length; i++) { const a = -PI / 2 + (i - (word.length - 1) / 2) * 0.16; x.save(); x.translate(o + Math.cos(a) * 107, o + Math.sin(a) * 107); x.rotate(a + PI / 2); x.fillText(word[i], 0, 0); x.restore(); }
    // (brass, satin, its studio reflection low and no glow of its own: as a polished metal with an emissive pulse it
    // read as a white disc under the bloom, and its mirror image on the ceiling another: the look review, round 1. The
    // pulse that draws him to it is a thin inlaid ring's, kept well under the bloom's threshold)
    const mat = new THREE.MeshStandardMaterial({ map: tex(c), color: new THREE.Color(0.8, 0.74, 0.62), metalness: 0.6, roughness: 0.5, envMap, envMapIntensity: 0.3 });
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.55, 40), mat); m.rotation.x = -PI / 2; m.position.set(CLUE.a, y0 + 0.006, CLUE.b); g.add(m);
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#9C7426') });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.58, 0.62, 48), ringMat); ring.rotation.x = -PI / 2; ring.position.set(CLUE.a, y0 + 0.007, CLUE.b); g.add(ring);
    const base = new THREE.Color('#9C7426');
    // (k 0..1: the ring's glow; 0 once the clue is found)
    const pulse = (k) => ringMat.color.copy(base).multiplyScalar(0.55 + 0.6 * k);
    pulse(0);
    return { mesh: m, mat, ring, pulse };
  })();

  /* the portraits on the south wall: original art in each slot (a real work by token id later: tokens.js) */
  const slots = [];
  const picW = PIC.w, picH = PIC.h;
  // (the cartouches' enamels, one per sigil, shared: the deal swaps which a frame wears)
  const badges = Object.fromEntries(SIGILS.map((k) => [k, tex(markCanvas(k, 256))]));
  PORTRAITS.forEach((p, i) => {
    const st = { crown: CROWNS[i], seed: 31 + i * 17 };
    const S = artSlot(THREE, { w: picW, h: picH, near: [640, 800], far: [160, 200], gilt: M.giltF, matte: std('#15110F', { roughness: 0.95 }), draw: (x, w, h) => portrait(x, w, h, st), badge: { w: 0.42, h: 0.34, lift: 0.06, k: 0.82 } });
    add(S.group, p.a, y0 + p.y, p.b - 0.02, PI);
    S.at.copy(at(p.a, p.b)).setY(y0 + p.y);
    const wash = wallWash(THREE, 3.6, 4.6, 'rgba(255,214,160,0.26)'); add(wash, p.a, y0 + p.y + 0.35, p.b - 0.01, PI);
    const titles = { sun: 'The Regent in the Sun Crown', laurel: 'The Regent in the Laurel Crown', tide: 'The Regent in the Tide Crown' };
    const pc = plaqueCanvas(titles[st.crown]); const ptex = tex(pc);
    // (the label just off the frame's right edge at eye height, as galleries hang them, so it reads as this frame's and
    // no other's (round 2's sat at the bottom left, between two frames); unlit card a shade under white. The frame faces
    // -b, turned PI: the viewer's right is the frame's -a)
    const plaque = add(new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.193), new THREE.MeshBasicMaterial({ map: ptex, color: new THREE.Color(0.8, 0.79, 0.76) })), p.a - (S.outer.w / 2 + 0.08 + 0.32), y0 + 1.5, p.b - 0.02, PI);
    // (where it hung, once taken: the wall a shade paler, its two hooks)
    const ghost = add(new THREE.Mesh(new THREE.PlaneGeometry(S.outer.w * 1.06, S.outer.h * 1.04), std('#C4BAA7', { roughness: 0.95 })), p.a, y0 + p.y, p.b - 0.005, PI); ghost.visible = false;
    // (its two hooks, left on the wall when it comes off: flat to the wall, behind the picture's plane (p.b - 0.03), so
    // they never show through the frame while it hangs: the look review, round 2)
    for (const s of [-1, 1]) B.box('steel', 0.05, 0.05, 0.016, p.a + s * 0.6, y0 + p.y + S.outer.h / 2 - 0.12, p.b - 0.009);
    slots.push({ i, slot: S, st, title: titles[st.crown], plaque, plaqueCanvas: pc, plaqueTex: ptex, ghost, p, credit(text) { const c2 = plaqueCanvas(titles[st.crown], text || undefined); pc.getContext('2d').drawImage(c2, 0, 0); ptex.needsUpdate = true; } });
  });
  // the bench in the middle of the room, facing the portraits
  B.box('leather', 2.6, 0.12, 0.6, 0, y0 + 0.45, 9.6); for (const s of [-1, 1]) B.box('steel', 0.08, 0.4, 0.5, s * 1.1, y0 + 0.2, 9.6);
  solid(0, 9.6, 1.3, 0.3, 0.5);
  // the cove: a light line round the room's top, a soft wash down its walls from it (no light of its own)
  {
    const [c, x] = canvas(8, 128); const gr = x.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,222,180,0.16)'); gr.addColorStop(0.3, 'rgba(255,222,180,0.12)'); gr.addColorStop(1, 'rgba(255,222,180,0)'); x.fillStyle = gr; x.fillRect(0, 0, 8, 128);
    const wm = new THREE.MeshBasicMaterial({ map: tex(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const rl = GAL.b1 - GAL.VB, rm = (GAL.VB + GAL.b1) / 2, inA = GAL.a - T, inB = GAL.b1 - T;
    for (const s of [-1, 1]) {
      B.box('glowA', 0.05, 0.04, rl - 0.6, s * (inA - 0.12), y0 + H - 0.9, rm);
      const wv = add(new THREE.Mesh(new THREE.PlaneGeometry(rl - 0.4, 3.2), wm), s * (inA - 0.01), y0 + H - 2.5, rm, -s * PI / 2); wv.renderOrder = 2;
    }
    B.box('glowA', inA * 2 - 0.6, 0.04, 0.05, 0, y0 + H - 0.9, inB - 0.12);
    const wb = add(new THREE.Mesh(new THREE.PlaneGeometry(inA * 2 - 0.4, 3.2), wm), 0, y0 + H - 2.5, inB - 0.01, PI); wb.renderOrder = 2;
    // (a dado: the lower wall a shade darker under a brass line, so the wall has a base and the hang sits on it)
    for (const s of [-1, 1]) B.box('dado', 0.02, 0.95, rl - 0.1, s * (inA - 0.01), y0 + 0.475, rm);
    B.box('dado', inA * 2, 0.95, 0.02, 0, y0 + 0.475, inB - 0.01);
    for (const s of [-1, 1]) B.box('giltM', 0.03, 0.03, rl - 0.1, s * (inA - 0.02), y0 + 0.96, rm);
    B.box('giltM', inA * 2, 0.03, 0.03, 0, y0 + 0.96, inB - 0.02);
  }
  // a low brass line on the floor before the portraits (look, don't touch)
  B.box('gilt', GAL.a * 2 - 1.2, 0.012, 0.04, 0, y0 + 0.006, GAL.b1 - 1.35);

  /* the certificate on the box's back, facing the portraits */
  const certC = document.createElement('canvas'); certC.width = 1024; certC.height = 720; certCanvas(certC, story.t('MR. BIG'));
  const certTex = tex(certC);
  {
    B.box('gilt', 1.56, 1.12, 0.06, CERT.a, y0 + CERT.y, CERT.b + 0.03);
    // (unlit paper a little under white: lit any brighter it blooms out under the room's light)
    add(new THREE.Mesh(new THREE.PlaneGeometry(1.46, 1.026), new THREE.MeshBasicMaterial({ map: certTex, color: new THREE.Color(0.82, 0.8, 0.76) })), CERT.a, y0 + CERT.y, CERT.b + 0.065);
  }
  B.done();

  /* its lights: a key on the statue, a rim behind it (its crown's back, and so the reflection), the portrait room's.
     Scoped to the gallery's own materials (the look review, round 2): they are never in the scene, so the city's
     materials never see them (no recompile of the city when it mounts, and no city pixel pays for them); each lit
     material of the set gets a lights node of these four and the city's sky fill (hemiLight). Not the sun: its
     shadow node would be built a second time for these materials, and at night it is a faint moon. The front's outer
     skins (travertine, the street's dressing) keep the city's lights, street lamps and headlights included. */
  const L = [];
  const light = (l, a, y, b, k) => { const p = at(a, b); l.position.set(p.x, y0 + y, p.z); l.castShadow = false; l.userData.k = k; l.intensity = 0; l.updateMatrixWorld(true); L.push(l); return l; };
  const key = light(new THREE.SpotLight('#FFE2B0', 0, 24, 0.5, 0.65, 1.1), 3.2, H - 0.4, -11.2, 45);
  { const t = at(STATUE.a, STATUE.b); key.target.position.set(t.x, y0 + 5.4, t.z); key.target.updateMatrixWorld(true); }
  light(new THREE.PointLight('#FFD39A', 0, 7.5, 1.4), 0, H - 1.0, GAL.MB - 1.0, 22);
  light(new THREE.PointLight('#FFE6C8', 0, 16, 1.3), 0, H - 2.4, 9.0, 45);
  // (the cool fill high up under the ceiling: at 3.6 m its hot spot on the polished floor read as a white blob by the
  // door, the look review's "right floor disc")
  light(new THREE.PointLight('#E9DCC8', 0, 15, 1.5), -2.6, H - 1.4, -11.5, 18);
  const hemi = app.lightingSystem?.hemiLight;
  const lightsNode = lightsNodeOf(hemi ? [...L, hemi] : L.slice());
  const OUTSIDE = new Set([M.shell, M.deck, M.carpet, M.planter, M.shrub, M.stripe, M.post]);
  const scoped = new Set();
  g.traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) if (m && !m.isMeshBasicMaterial && !OUTSIDE.has(m) && !scoped.has(m)) { m.lightsNode = lightsNode; scoped.add(m); } });

  // the alarm (a wrong piece lifted): k 0..1, the room's lights and the ceiling's lines to red; 0 puts them back
  const L0 = L.map((l) => l.color.clone()), W0 = M.glowW.color.clone(), RED = new THREE.Color('#FF2A1E');
  const alarm = (k) => { L.forEach((l, i) => l.color.copy(L0[i]).lerp(RED, k)); M.glowW.color.copy(W0).lerp(RED.clone().multiplyScalar(1.6), k); };
  return {
    group: g, mirror: mirrorG, colliders, patch, lights: L, scoped, statue: reg, slots, medal, M, y0, badges, alarm,
    cert: { canvas: certC, texture: certTex },
    dispose() { app.scene.remove(g); for (const l of L) l.dispose?.(); for (const s of slots) s.slot.dispose(); for (const t of Object.values(badges)) t.dispose(); reg.dispose(); g.traverse((o) => { if (o.isMesh) { o.geometry?.dispose(); } }); },
  };
}
