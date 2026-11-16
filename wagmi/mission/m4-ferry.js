// Mog City: Mission 4's escape sets (docs/MISSIONS.md, Mission 4 · Shredder: the helicopter, the riverfront, the last
// ferry). Made here from plain shapes: nothing downloaded, no new scene lights (lit windows and lamps are emissive
// paint only), no name, no operator's colours, no logo; the landing's sign says only FERRY.
//   TAKEOFF, LAND, GATE, DOCK     the places, checked in the engine (14 Nov, the probe in the build notes):
//                                 TAKEOFF  Mr. Big's helicopter at the closed south end of South St, on the open plaza
//                                          where the street comes out by the river (nothing over 0.4 m within 7.5 m:
//                                          the rotor's 6.2 m cylinder clear); the street by the pavilion is about 11 m
//                                          wide between buildings, no room for it
//                                 LAND     the landing ring on the Battery Park City riverfront: the open riverside
//                                          block (paved, 0.22 m), 24 m from the shore highway, 50 m inside the shore,
//                                          nothing standing within 6.2 m
//                                 GATE     the ferry landing's gate at Vesey St, on the esplanade 7 m inside the shore
//                                          clamp (he walks to it; the float and the ferry are past the clamp: cutscenes)
//   ESPLANADE                     the walk from the ring to the gate along the river (300 m), for the route
//   buildLanding(W)               the generic landing: a float out over the water on its piles, a covered gangway
//                                 down to it, the FERRY sign, the departure board (LAST FERRY · 11:45 · HOBOKEN),
//                                 lamps, life rings
//   buildFerry(W)                 the hero ferry: its own Group (it moves), 34 m, two decks, white hull with a navy band,
//                                 lit windows, a wheelhouse, an 8 m open stern deck with its rail, a stern lamp, deck
//                                 lamps, life rings, a mast with its lights; its bow wave and stern wash in its frame
//                                 put(x, z, h, t, v) · world(lx, ly, lz) · stern (the open deck's spot)
//   buildWake(W, ferry)           the wake: a ribbon of churned water from the stern's recent positions, just over
//                                 the water (polygon offset), spreading and fading with age, tinted for the night
//   buildRings(W, pts)            the flight's guide rings: yellow hoops in the air, one lit at a time
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { S as story } from '../story/index.js';

const PI = Math.PI;
// (15 Nov, the look review: 6 m on to the east, its rotor clear of the plaza's locust tree, 11 m off)
export const TAKEOFF = { x: 930, z: 5546 };
export const LAND = { x: -680, z: 4950, r: 10, name: 'Battery Park City · the riverfront' };
export const GATE = { x: -603, z: 5238, name: 'The ferry landing · Vesey St' };
export const DOCK = { x: -640, z: 5246, h: -PI / 2 + 0.36 };
// (the run: out of the pavilion's end down South St, which bends east there, to the plaza; the straight line cuts the
// corner building)
export const RUNWAY = [[909, 5494], [903, 5512], [906, 5527], [915, 5537], [TAKEOFF.x, TAKEOFF.z]];
// (16 m in from the shore all the way: the esplanade, clear of the blocks' kerbs)
// (the look review's round 6: that line ran him over the lawn between the trees, the paved walk beside it in the dark; 12 m
// east now, along the walk's lamps)
export const ESPLANADE = [[-680, 4950], [-683, 5000], [-664, 5050], [-644, 5100], [-624, 5150], [-605, 5200], [GATE.x, GATE.z]];
// the ferry: local +z its bow, y up from the water; the deck's top DECK over the water, the open stern deck from the
// transom (-len / 2) to the cabin (CAB0)
export const FERRY = { len: 34, beam: 8.6, deck: 1.6, cab0: -9, stern: -14.2 };
// the landing's gangway, in its frame: level from the gate (z0) to the water's edge (z1) at y1 (its deck's top, just
// over the esplanade's grass, 0.20), then a ramp down to the float's top (y2) at z2; its rails rail m either side
export const GANGWAY = { z0: 0.3, z1: 14.5, y1: 0.36, z2: 19.9, y2: -0.95, rail: 1.4 };

const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...o });
const glow = (color, k = 1.6) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) });
const water = () => -2.2; // (the harbour's level: js/city-config.js ISLAND_BOUNDS.waterLevel)

// a bag of geometries per material, merged into one mesh each at the end (a handful of draw calls for a whole boat)
function kit() {
  const bags = new Map();
  const put = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!bags.has(mat)) bags.set(mat, []); bags.get(mat).push(g);
  };
  return {
    box: (mat, w, h, d, x, y, z, ry = 0) => put(mat, new THREE.BoxGeometry(w, h, d), x, y, z, ry),
    cyl: (mat, r, h, x, y, z, seg = 10) => put(mat, new THREE.CylinderGeometry(r, r, h, seg), x, y, z),
    put,
    into(group, { shadow = true } = {}) {
      for (const [mat, geos] of bags) { const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = shadow && !mat.isMeshBasicMaterial; m.receiveShadow = !mat.isMeshBasicMaterial; group.add(m); }
    },
  };
}
// a sign: lines of [text, size, colour, weight] on a panel
function signTex(lines, { w = 512, h = 128, bg = '#163A5F' } = {}) {
  const [c, x] = canvas(w, h);
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  lines.forEach(([t, size = 48, col = '#FFFFFF', weight = 800], i) => { x.fillStyle = col; x.font = `${weight} ${size}px "Barlow Condensed", sans-serif`; x.fillText(t, w / 2, h * (i + 1) / (lines.length + 1)); });
  return tex(c);
}

/* -------------------------------------------------------------- landing -- */
// local frame: +z out over the water from the gate, x along the shore
export function buildLanding(W) {
  const app = W.app;
  const g = new THREE.Group(); g.name = 'm4-ferry-landing'; g.visible = false; app.scene.add(g);
  g.position.set(GATE.x, 0, GATE.z); g.rotation.y = DOCK.h;
  const K = kit(), wl = water();
  const deck = std('#4A4D52', { roughness: 0.85 }), rail = std('#C9CCD1', { metalness: 0.6, roughness: 0.4 }), pile = std('#2B2620', { roughness: 0.9 });
  const roof = std('#3C5266', { roughness: 0.85, metalness: 0 }), lamp = glow('#FFE2A8', 2.4), ring = std('#E35B2C');
  // the gangway, covered, down from the gate to the float; the float on its piles
  // (the gate is 15 m in from the water's edge, inside the shore clamp: the gangway crosses the esplanade's edge and
  // goes down to the float, which is all over the water)
  // (the look review's round 2, 15 Nov: laid at -0.48 m on a slope the whole way, the gangway ran under the esplanade's
  // lawn, so he walked on grass between two rails. Now level over the land, just over the grass, to the water's edge,
  // then a ramp down to the float; a lit canopy over the level run, its posts and rails in pairs, kick plates)
  // (the look review's round 3, 15 Nov: its deck's top at 0.12 m sat under the lawn's 0.20, so the grass still showed
  // through it and he walked on grass between two rails; his hand went through the near rail, 1.2 m off his line. Now a
  // boardwalk of lit planks 0.36 m up on a dark skirt down to the ground, the rails 1.4 m out, the canopy wider)
  const GW = GANGWAY, rampL = Math.hypot(GW.z2 - GW.z1, GW.y1 - GW.y2), rampA = Math.atan2(GW.y1 - GW.y2, GW.z2 - GW.z1), rampZ = (GW.z1 + GW.z2) / 2, rampY = (GW.y1 + GW.y2) / 2;
  const RX = GW.rail, levelL = GW.z1 - GW.z0, levelZ = (GW.z0 + GW.z1) / 2;
  const skirt = std('#1B1D21', { roughness: 0.9 });
  K.box(skirt, RX * 2 - 0.1, GW.y1 + 0.05, levelL, 0, (GW.y1 - 0.05) / 2 - 0.02, levelZ);
  for (const s of [-1, 1]) {
    // (on the level run a top rail and a low one only: a middle rail there lined up with his hand in the boarding's frame)
    for (const yy of [1.05, 0.26]) K.box(rail, 0.06, 0.06, levelL, s * RX, GW.y1 + yy, levelZ);
    for (const yy of [1.05, 0.55]) K.put(rail, new THREE.BoxGeometry(0.06, 0.06, rampL), s * RX, rampY + yy, rampZ, 0, rampA);
    K.box(roof, 0.05, 0.2, levelL, s * RX, GW.y1 + 0.04, levelZ); K.put(roof, new THREE.BoxGeometry(0.05, 0.2, rampL), s * RX, rampY + 0.04, rampZ, 0, rampA);
    for (let z = GW.z0 + 0.4; z <= GW.z2 - 0.3; z += 2.2) { const yy = z <= GW.z1 ? GW.y1 : GW.y1 - (z - GW.z1) / (GW.z2 - GW.z1) * (GW.y1 - GW.y2); K.box(rail, 0.07, 1.08, 0.07, s * RX, yy + 0.54, z); }
    // (the canopy's posts, over the level run only)
    for (let z = GW.z0 + 0.6; z <= GW.z1; z += 4.4) K.box(roof, 0.09, 2.62, 0.09, s * (RX + 0.12), GW.y1 + 1.31, z);
  }
  K.box(roof, RX * 2 + 0.6, 0.08, levelL + 0.4, 0, GW.y1 + 2.66, levelZ);
  // (the canopy's strip a soft warm line, not the bloom's white bar: the look review's round 4, 15 Nov)
  K.box(glow('#E8C890', 0.95), 0.08, 0.025, levelL - 0.6, 0, GW.y1 + 2.615, levelZ);
  K.box(deck, 10, 0.7, 28, 0, wl + 0.9, 34);
  for (const s of [-1, 1]) { K.box(rail, 0.06, 1.0, 28, s * 5, wl + 1.75, 34); }
  for (const z of [21, 34, 47]) for (const s of [-1, 1]) K.cyl(pile, 0.32, 5.4, s * 5.6, wl - 0.75, z);
  // lamps on the float (night paint only) and life rings
  for (const z of [24, 34, 44]) for (const s of [-1, 1]) { K.box(rail, 0.1, 3, 0.1, s * 4.7, wl + 2.75, z); K.box(lamp, 0.35, 0.25, 0.35, s * 4.7, wl + 4.3, z); }
  for (const z of [28, 40]) K.put(ring, new THREE.TorusGeometry(0.35, 0.08, 8, 20), -5.06, wl + 1.95, z, PI / 2);
  // the sign over the gate: FERRY only; the departure board beside it
  for (const s of [-1.7, 1.7]) K.box(rail, 0.12, 3.6, 0.12, s, 1.8, 0.25);
  K.into(g);
  // the boards: planks across the way, laid on the level run and the ramp (a tile repeated by each one's length, so a
  // plank is the same 0.2 m on both), a little of their own warmth so they read under the canopy's strip at midnight
  const plankTex = (() => {
    const [c, x] = canvas(256, 64); x.fillStyle = '#6E5A44'; x.fillRect(0, 0, 256, 64);
    let s = 3; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let i = 0; i < 70; i++) { x.strokeStyle = `rgba(${r() > 0.5 ? '40,30,20' : '140,118,92'},${(0.08 + r() * 0.16).toFixed(2)})`; x.lineWidth = 1 + r() * 2; const yy = 6 + r() * 52; x.beginPath(); x.moveTo(0, yy); x.bezierCurveTo(80, yy + (r() - 0.5) * 6, 170, yy + (r() - 0.5) * 6, 256, yy); x.stroke(); }
    x.fillStyle = '#1A140F'; x.fillRect(0, 0, 256, 5);
    for (const xx of [12, 244]) { x.fillStyle = '#2A2622'; x.beginPath(); x.arc(xx, 32, 3, 0, PI * 2); x.fill(); }
    const t = tex(c); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
  })();
  const boards = (len) => { const t = plankTex.clone(); t.needsUpdate = true; t.repeat.set(1, len / 0.2); return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: new THREE.Color('#FFD9A8'), emissiveIntensity: 0.16, roughness: 0.8 }); };
  const boardBox = (len) => new THREE.BoxGeometry(RX * 2 - 0.06, 0.06, len); // (its top face's v runs along the way)
  const lvl = new THREE.Mesh(boardBox(levelL), boards(levelL)); lvl.position.set(0, GW.y1 - 0.03, levelZ); lvl.receiveShadow = true; g.add(lvl);
  // (the pier's apron round the gangway's level run, from the gate to the water: the look review's round 5, 15 Nov,
  // saw lawn under it and read the walk as crossing a park; a pier's deck of dark planks, the gangway over it, its
  // edge timber at the water)
  { const len = GW.z1 - GW.z0 + 1.2, t = plankTex.clone(); t.needsUpdate = true; t.repeat.set(7, len / 0.2);
    const m = new THREE.Mesh(new THREE.BoxGeometry(18, 0.08, len), new THREE.MeshStandardMaterial({ map: t, color: '#9A8E80', emissiveMap: t, emissive: new THREE.Color('#C8B8A0'), emissiveIntensity: 0.07, roughness: 0.86 }));
    m.position.set(0, 0.2, (GW.z0 + GW.z1) / 2 - 0.15); m.receiveShadow = true; g.add(m);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(18.2, 0.3, 0.3), std('#2A2622', { roughness: 0.92 })); edge.position.set(0, 0.12, GW.z1 + 0.3); g.add(edge); }
  const rmp = new THREE.Mesh(boardBox(rampL), boards(rampL)); rmp.position.set(0, rampY - 0.03, rampZ); rmp.rotation.x = rampA; rmp.receiveShadow = true; g.add(rmp);
  // the lamps' light on the boards (paint: a warm pool under each, no scene light)
  const pool = (() => { const [c, x] = canvas(64, 64), gr = x.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,214,150,0.55)'); gr.addColorStop(1, 'rgba(255,214,150,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return tex(c); })();
  const poolM = new THREE.MeshBasicMaterial({ map: pool, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const [px, py, pz, r] of [...[2, 5.5, 9, 12.5].map((z) => [0, GANGWAY.y1 + 0.005, z, 1.9]), ...[24, 34, 44].flatMap((z) => [[-3.6, wl + 1.27, z, 4.2], [3.6, wl + 1.27, z, 4.2]])]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), poolM); m.rotation.x = -PI / 2; m.position.set(px, py, pz); m.renderOrder = 2; g.add(m);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.95), new THREE.MeshBasicMaterial({ map: signTex([[story.t('FERRY'), 92, '#FFFFFF']], { w: 512, h: 152 }), color: new THREE.Color(1.25, 1.25, 1.25) }));
  sign.position.set(0, 3.5, 0.18); sign.rotation.y = PI; g.add(sign);
  const sign2 = sign.clone(); sign2.position.z = 0.32; sign2.rotation.y = 0; g.add(sign2);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.95), new THREE.MeshBasicMaterial({ map: signTex([[story.t('LAST FERRY'), 40, '#FFC93C'], [story.t('11:45 · HOBOKEN'), 52, '#FFFFFF'], [story.t('BOARDING'), 34, '#4ADE80']], { w: 384, h: 256, bg: '#0B0D12' }), color: new THREE.Color(1.3, 1.3, 1.3) }));
  board.position.set(2.8, 1.8, 0.5); board.rotation.y = PI; g.add(board);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.1), rail); post.position.set(2.8, 0.7, 0.56); g.add(post);
  g.traverse((o) => { if (o.isMesh) o.updateMatrix(); });
  // (the esplanade's trees standing in the gangway's way, three of them through it and its canopy: taken out of the
  // tree field while the landing is up, and put back with it; the look review's round 2, 15 Nov. Round 3: and those
  // either side of it, 7.5 m each way, a trunk stood right by it in the boarding's frame)
  const _p = new THREE.Vector3();
  let cleared = false;
  function trees(on) {
    const F = window.NYC?.treeField; if (!F?.hide || on === cleared) return; cleared = on;
    if (!on) { F.hide(null); return; }
    g.updateMatrixWorld(true); const inv = g.matrixWorld.clone().invert();
    F.hide((x, z) => { _p.set(x, 0, z).applyMatrix4(inv); return Math.abs(_p.x) < 8 && _p.z > -4 && _p.z < 30; });
  }
  // (the shore's iron fence across the gangway's way: its strip folded flat where the gangway crosses it while the
  // landing is up, and put back with it; the look review's round 4, 15 Nov: the gangway ended at the black fence, so it
  // did not reach the float or the ferry. The fence is one merged strip of quads: a quad whose run crosses the way)
  // (round 5: the whole stretch of it along the landing's apron and past the ferry's berth, not only the gangway's
  // width: it ran on past the ferry in the boarding's frame)
  let opened = null; const FX = 34;
  function gap(on) {
    if (!on) { for (const [attr, q, ys] of opened || []) { for (let k = 0; k < 6; k++) attr.setY(q + k, ys[k]); attr.needsUpdate = true; } opened = null; return; }
    if (opened) return; opened = [];
    g.updateMatrixWorld(true); const inv = g.matrixWorld.clone().invert(), a = new THREE.Vector3(), b = new THREE.Vector3();
    app.scene.traverse((o) => {
      const m = o.material; if (!o.isMesh || !m || (!m.alphaToCoverage && !m.alphaTestNode) || o.geometry.index) return;
      const P = o.geometry.attributes.position; if (!P || P.count % 6 || P.count > 400000) return;
      for (let q = 0; q < P.count; q += 6) {
        a.set(P.getX(q), 0, P.getZ(q)).applyMatrix4(o.matrixWorld).applyMatrix4(inv); b.set(P.getX(q + 1), 0, P.getZ(q + 1)).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
        if (Math.max(a.z, b.z) < GW.z0 + 0.5 || Math.min(a.z, b.z) > GW.z2 + 1 || Math.max(a.x, b.x) < -FX || Math.min(a.x, b.x) > FX) continue;
        const ys = []; for (let k = 0; k < 6; k++) ys.push(P.getY(q + k));
        const y0 = Math.min(...ys); for (let k = 0; k < 6; k++) P.setY(q + k, y0);
        P.needsUpdate = true; opened.push([P, q, ys]);
      }
    });
  }
  // the walk's own path lights (the look review's round 6: the esplanade still read black, the walk unreadable): low
  // bollards either side of the paved walk every 9 m, their tops glowing, a warm pool round each on the paving, and a
  // wider faint pool down its middle every 18 m, where the city's lamps would throw it (paint, no scene light)
  const walk = new THREE.Group(); walk.name = 'm4-esplanade-lights'; walk.visible = false; app.scene.add(walk);
  {
    const cm = app.controllerManager, gy = (x, z) => cm.getGroundHeight(x, z, 'person');
    const wide = new THREE.MeshBasicMaterial({ map: pool, color: new THREE.Color(0.55, 0.5, 0.42), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 });
    const post = std('#22252A', { roughness: 0.6, metalness: 0.4 }), cap = glow('#FFE2A8', 2.6);
    const bollards = [], pools = [], wides = [];
    let run = 0;
    for (let i = 1; i < ESPLANADE.length - 1; i++) {
      const [x0, z0] = ESPLANADE[i - 1], [x1, z1] = ESPLANADE[i], L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
      for (let d = (9 - run % 9) % 9; d < L; d += 9) {
        const cx = x0 + ux * d, cz = z0 + uz * d, k = Math.round((run + d) / 9);
        for (const sd of [-1, 1]) { const bx = cx - uz * 2.6 * sd, bz = cz + ux * 2.6 * sd; bollards.push([bx, gy(bx, bz), bz]); pools.push([bx, gy(bx, bz), bz, 2.4]); }
        if (k % 2 === 0) wides.push([cx, gy(cx, cz), cz, 6.5]);
      }
      run += L;
    }
    const bg = new THREE.CylinderGeometry(0.09, 0.11, 0.9, 10), cg = new THREE.CylinderGeometry(0.1, 0.1, 0.12, 10);
    const B = new THREE.InstancedMesh(bg, post, bollards.length), C = new THREE.InstancedMesh(cg, cap, bollards.length), M = new THREE.Matrix4();
    bollards.forEach(([x, y, z], i) => { B.setMatrixAt(i, M.makeTranslation(x, y + 0.45, z)); C.setMatrixAt(i, M.makeTranslation(x, y + 0.84, z)); });
    walk.add(B, C);
    for (const [x, y, z, r] of pools) { const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), poolM); m.rotation.x = -PI / 2; m.position.set(x, y + 0.02, z); m.renderOrder = 2; walk.add(m); }
    for (const [x, y, z, r] of wides) { const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), wide); m.rotation.x = -PI / 2; m.position.set(x, y + 0.02, z); m.renderOrder = 2; walk.add(m); }
  }
  return {
    group: g,
    show(on) { g.visible = !!on; walk.visible = !!on; trees(!!on); gap(!!on); },
    // a point of the landing's own in the world (x along the shore, y up, z out over the water)
    world(lx, ly, lz, out = new THREE.Vector3()) { g.updateMatrixWorld(true); return g.localToWorld(out.set(lx, ly, lz)); },
    dispose() { app.scene.remove(g); app.scene.remove(walk); g.traverse((o) => o.geometry?.dispose?.()); walk.traverse((o) => o.geometry?.dispose?.()); },
  };
}

/* ---------------------------------------------------------------- ferry -- */
// churned water for the wake (the look review's round 5, 15 Nov: the foam blots read close up as one overexposed white
// slab, ice or snow, and the V's arms as hard white laser lines): thin broken streaks along it, feathered across it
// (spread: the streaks' gaussian spread across, as a part of its width), fading along it (k), softened; low alpha
// (gaps: the streaks bunched into that many patches along it, open water between: round 6, an arm read as one line)
function streakTex(seed, { w = 128, h = 512, n = 1600, spread = 0.26, k = 1.2, a0 = 0.32, gaps = 0 } = {}) {
  const [c, x] = canvas(w, h);
  let s = seed; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const gauss = () => { let t = 0; for (let i = 0; i < 4; i++) t += r(); return (t - 2) / 0.58; };
  x.clearRect(0, 0, w, h); x.filter = 'blur(1.2px)'; x.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    let v = Math.pow(r(), 0.85); if (gaps) { const ci = Math.floor(v * gaps); v = (ci + 0.5 + (r() - 0.5) * (0.35 + 0.3 * ((ci * 7919) % 5) / 5)) / gaps; }
    const u = 0.5 + gauss() * spread * (0.55 + v * 0.45);
    if (u < 0.02 || u > 0.98) continue;
    const edge = 1 - Math.min(1, Math.abs(u - 0.5) * 2) ** 2, a = Math.pow(1 - v, k) * edge * a0 * (0.3 + r() * 0.7) * (r() < 0.25 ? 0.25 : 1);
    x.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`; x.lineWidth = 0.6 + r() * 1.6;
    const len = 6 + r() * 26, bend = (r() - 0.5) * 4;
    x.beginPath(); x.moveTo(u * w, v * h); x.quadraticCurveTo(u * w + bend, v * h + len / 2, u * w + bend * 0.4, v * h + len); x.stroke();
  }
  const t = tex(c); t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
// (added to the water, never darker than it: the night water's reflections show through)
const foamMat = (map, tint) => new THREE.MeshBasicMaterial({ map, color: tint, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide, fog: true });

export function buildFerry(W) {
  const app = W.app, L = FERRY.len, B = FERRY.beam, D = FERRY.deck, half = L / 2;
  const g = new THREE.Group(); g.name = 'm4-ferry'; g.visible = false; app.scene.add(g);
  const K = kit();
  // (the look review's round 3, 15 Nov: flat, untextured, its deck a daylight lavender. Its white weathered down to
  // the deck (a soft grime gradient up each wall), a deep navy boot to the waterline with a gold pinstripe, a heavy black
  // rubbing strake at the sheer and a second lower one, a dark non-slip deck with a yellow edge line, warm pools of its
  // lamps and its doors' light on the stern deck)
  const grime = (() => { const [c, x] = canvas(8, 256), gr = x.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(0.55, '#F1F0EC'); gr.addColorStop(0.9, '#C9C6BE'); gr.addColorStop(1, '#A9A69E'); x.fillStyle = gr; x.fillRect(0, 0, 8, 256); return tex(c); })();
  // (round 4: the white a warmer, older cream, so the night's blue fill does not turn it lavender)
  const white = std('#B5AB98', { roughness: 0.6 }), wallW = std('#A99D88', { roughness: 0.65, map: grime }), navy = std('#1E2E4A', { roughness: 0.5 }), grey = std('#8C9198', { roughness: 0.7 });
  const nonslip = (() => {
    // (round 6: the deck near black in the boarding's close-up: a lighter, warmer grey plate)
    const [c, x] = canvas(256, 256); x.fillStyle = '#6A6E69'; x.fillRect(0, 0, 256, 256);
    let s = 9; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let i = 0; i < 2600; i++) { x.fillStyle = r() > 0.5 ? 'rgba(20,24,24,0.5)' : 'rgba(110,118,112,0.35)'; x.fillRect(r() * 256, r() * 256, 1 + r() * 1.5, 1 + r() * 1.5); }
    for (let k = 0; k < 4; k++) { x.fillStyle = 'rgba(15,18,18,0.6)'; x.fillRect(0, k * 64, 256, 2); } // (the deck plates' seams, every 0.5 m)
    const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.5, 0.5); t.anisotropy = 8; return t;
  })();
  const deckM = std('#B8BDB6', { roughness: 0.92, map: nonslip }), rail = std('#D9DCE0', { metalness: 0.6, roughness: 0.4 }), black = std('#15171B', { roughness: 0.6 });
  // (round 4: the lit windows were flat white panes. A cabin seen through each now: the ceiling's light strip, warm
  // light falling off down the glass, the backs of the seats in a row along the bottom, a frame's shadow at the edges)
  const winT = (() => {
    const [c, x] = canvas(128, 96), gr = x.createLinearGradient(0, 0, 0, 96);
    gr.addColorStop(0, '#FFF0CC'); gr.addColorStop(0.18, '#F7D9A0'); gr.addColorStop(0.6, '#C9975E'); gr.addColorStop(1, '#6E4E30');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 96);
    x.fillStyle = 'rgba(255,250,235,0.95)'; x.fillRect(0, 4, 128, 5);
    for (let i = 0; i < 4; i++) { x.fillStyle = 'rgba(38,40,52,0.92)'; x.beginPath(); x.roundRect(6 + i * 31, 56, 24, 40, 6); x.fill(); x.fillStyle = 'rgba(90,70,60,0.5)'; x.fillRect(8 + i * 31, 60, 20, 3); }
    const e = x.createLinearGradient(0, 0, 128, 0); e.addColorStop(0, 'rgba(0,0,0,0.45)'); e.addColorStop(0.06, 'rgba(0,0,0,0)'); e.addColorStop(0.94, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,0.45)'); x.fillStyle = e; x.fillRect(0, 0, 128, 96);
    return tex(c);
  })();
  // (round 6: at the night's exposure they still burned out to flat white slabs: the cabin's light kept under white)
  const win = new THREE.MeshBasicMaterial({ map: winT, color: new THREE.Color(0.72, 0.66, 0.6) }), wheel = new THREE.MeshStandardMaterial({ color: '#0C141E', roughness: 0.08, metalness: 0.6, emissive: new THREE.Color('#1C2C3C'), emissiveIntensity: 0.6 }), lampW = glow('#FFF4DC', 2.8), lampY = glow('#FFE2A8', 2.4), red = glow('#FF3B30', 2), green = glow('#30FF6A', 2), ringM = std('#E35B2C');
  // the hull: a plan with a square stern and a rounded bow, extruded from below the water to the deck
  const sh = new THREE.Shape(), b = B / 2, z1 = half * 0.42;
  sh.moveTo(-b, -half); sh.lineTo(b, -half); sh.lineTo(b, z1);
  sh.bezierCurveTo(b, half * 0.8, b * 0.45, half, 0, half); sh.bezierCurveTo(-b * 0.45, half, -b, half * 0.8, -b, z1); sh.lineTo(-b, -half);
  const hullH = D + 1.3, hull = new THREE.ExtrudeGeometry(sh, { depth: hullH, bevelEnabled: false, curveSegments: 10 });
  hull.rotateX(PI / 2); hull.translate(0, D, 0); // (extruded down from the deck: y D .. D - hullH)
  K.put(white, hull);
  // the navy band at the waterline, the rub rail at the deck's edge (the hull's shape a little larger)
  const ring = (depth, sx, sz, y, mat) => { const e = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 10 }); e.rotateX(PI / 2); e.scale(sx, 1, sz); e.translate(0, y, 0); K.put(mat, e); };
  ring(1.15, 1.012, 1.006, 0.85, navy);
  ring(0.06, 1.014, 1.007, 0.9, glow('#C9A24A', 0.55));
  ring(0.3, 1.04, 1.016, D + 0.08, black);
  ring(0.16, 1.03, 1.012, 0.98, black);
  // the deck (a little in from the hull's edge)
  const deckSh = new THREE.ShapeGeometry(sh, 10); deckSh.rotateX(-PI / 2); deckSh.rotateY(PI); deckSh.scale(0.97, 1, 0.985); deckSh.translate(0, D + 0.03, 0); K.put(deckM, deckSh);
  // the main cabin from CAB0 to the bow's shoulder; its windows lit, both sides and round the front; its back wall with
  // the doors to the stern deck
  const c0 = FERRY.cab0, c1 = half * 0.5, cw = B - 1.0, ch = 2.5, cy = D + ch / 2;
  K.box(wallW, cw, ch, c1 - c0, 0, cy, (c0 + c1) / 2);
  // (the look review's round 2, 15 Nov: plain boxes with a black void for a door. A band of dark glass down each side
  // and across the back, the lit windows set in it between slim mullions; glazed double doors, lit from inside, in a
  // steel frame; a pinstripe under the windows)
  const glassD = std('#0E1622', { roughness: 0.08, metalness: 0.6 }), steelF = std('#9EA4AC', { metalness: 0.7, roughness: 0.35 });
  for (const s of [-1, 1]) { K.box(glassD, 0.04, 1.2, c1 - c0 - 0.8, s * (cw / 2 + 0.006), D + 1.5, (c0 + c1) / 2); K.box(navy, 0.03, 0.08, c1 - c0, s * (cw / 2 + 0.012), D + 0.78, (c0 + c1) / 2); }
  for (const s of [-1, 1]) for (let z = c0 + 0.9; z < c1 - 0.6; z += 1.7) { K.box(win, 0.05, 0.95, 1.25, s * (cw / 2 + 0.01), D + 1.5, z + 0.6); K.box(steelF, 0.06, 1.05, 0.06, s * (cw / 2 + 0.014), D + 1.5, z - 0.08); }
  K.box(win, cw - 1.4, 0.95, 0.05, 0, D + 1.5, c1 + 0.01);
  K.box(glassD, cw - 0.6, 1.2, 0.04, 0, D + 1.5, c0 - 0.006);
  for (const x of [-2.4, 2.4]) K.box(win, 1.1, 1.0, 0.05, x, D + 1.5, c0 - 0.01);
  K.box(steelF, 1.46, 2.12, 0.05, 0, D + 1.06, c0 - 0.012);
  for (const x of [-0.33, 0.33]) { K.box(glow('#FFE6B8', 0.85), 0.56, 1.5, 0.05, x, D + 1.2, c0 - 0.03); K.box(steelF, 0.05, 1.9, 0.07, x + (x > 0 ? 0.31 : -0.31), D + 1.0, c0 - 0.03); }
  K.box(steelF, 0.05, 1.95, 0.08, 0, D + 1.0, c0 - 0.035);
  K.box(black, 1.36, 0.36, 0.05, 0, D + 0.2, c0 - 0.03);
  K.box(navy, cw + 0.06, 0.28, c1 - c0 + 0.06, 0, D + ch - 0.14, (c0 + c1) / 2);
  // the upper deck: a shorter cabin, its windows lit, its own rail; the wheelhouse forward over it
  const u0 = c0 + 4, u1 = c1 - 2.5, uw = cw - 1.2, uy = D + ch;
  K.box(deckM, cw, 0.08, c1 - c0, 0, uy + 0.04, (c0 + c1) / 2);
  K.box(wallW, uw, 2.2, u1 - u0, 0, uy + 1.1, (u0 + u1) / 2);
  for (const s of [-1, 1]) K.box(glassD, 0.04, 1.05, u1 - u0 - 0.7, s * (uw / 2 + 0.006), uy + 1.25, (u0 + u1) / 2);
  K.box(navy, uw + 0.16, 0.14, u1 - u0 + 0.16, 0, uy + 2.22, (u0 + u1) / 2);
  for (const s of [-1, 1]) for (let z = u0 + 0.8; z < u1 - 0.6; z += 1.6) K.box(win, 0.05, 0.85, 1.15, s * (uw / 2 + 0.01), uy + 1.25, z + 0.55);
  // (the upper deck's rail an open railing, a top and a middle rail on posts: the look review's round 4, 15 Nov, its
  // solid 0.95 m sheets of rail steel read as a pale lavender wall over the stern deck in the boarding)
  for (const s of [-1, 1]) {
    for (const yy of [0.98, 0.52]) K.box(rail, 0.05, 0.05, c1 - c0, s * (cw / 2 - 0.05), uy + yy, (c0 + c1) / 2);
    for (let z = c0 + 0.05; z <= c1; z += 1.2) K.box(rail, 0.045, 0.98, 0.045, s * (cw / 2 - 0.05), uy + 0.49, z);
  }
  for (const yy of [0.98, 0.52]) K.box(rail, cw, 0.05, 0.05, 0, uy + yy, c0 + 0.03);
  for (let x = -cw / 2 + 0.05; x <= cw / 2; x += 1.2) K.box(rail, 0.045, 0.98, 0.045, x, uy + 0.49, c0 + 0.03);
  const wz = u1 - 2.0;
  K.box(wallW, uw - 1.4, 1.7, 3.0, 0, uy + 2.2 + 0.85, wz);
  K.box(wheel, uw - 1.36, 0.7, 3.04, 0, uy + 2.2 + 1.0, wz);
  K.box(navy, uw - 1.2, 0.12, 3.2, 0, uy + 2.2 + 1.76, wz);
  // the mast and its lights (the masthead white, the sidelights red to port, green to starboard)
  K.cyl(rail, 0.07, 3.2, 0, uy + 4.0 + 1.6, wz);
  K.box(lampW, 0.22, 0.22, 0.22, 0, uy + 4.0 + 3.25, wz);
  K.box(red, 0.18, 0.25, 0.3, -(uw / 2 - 0.7) - 0.02, uy + 2.2 + 1.2, wz + 1.0);
  K.box(green, 0.18, 0.25, 0.3, (uw / 2 - 0.7) + 0.02, uy + 2.2 + 1.2, wz + 1.0);
  // the rail round the main deck (stern and both sides back to the cabin; forward of it a bulwark)
  K.box(rail, B - 0.3, 0.06, 0.06, 0, D + 1.05, -half + 0.2); K.box(rail, B - 0.3, 0.06, 0.06, 0, D + 0.55, -half + 0.2);
  for (let x = -b + 0.2; x <= b - 0.15; x += 1.05) K.box(rail, 0.05, 1.05, 0.05, x, D + 0.53, -half + 0.2);
  for (const s of [-1, 1]) {
    K.box(rail, 0.06, 0.06, c0 + half, s * (b - 0.18), D + 1.05, (c0 - half) / 2); K.box(rail, 0.06, 0.06, c0 + half, s * (b - 0.18), D + 0.55, (c0 - half) / 2);
    for (let z = -half + 0.2; z <= c0; z += 1.1) K.box(rail, 0.05, 1.05, 0.05, s * (b - 0.18), D + 0.53, z);
  }
  // (the bulwark forward of the cabin round the bow, following the hull's curve: the look review's round 5, 15 Nov,
  // straight boards at the full beam ran out past the rounded bow as two pale fins over the water)
  { const pts = sh.getPoints(10).filter((q) => q.y >= c1 - 0.6), kx = (b - 0.2) / b, kz = (half - 0.25) / half;
    for (let i = 0; i + 1 < pts.length; i++) {
      const ax = pts[i].x * kx, az = pts[i].y * kz, bx = pts[i + 1].x * kx, bz = pts[i + 1].y * kz, l = Math.hypot(bx - ax, bz - az);
      if (l < 0.01 || Math.abs(ax) + Math.abs(bx) < 0.01 && az < c1) continue;
      K.box(white, 0.12, 0.9, l + 0.03, (ax + bx) / 2, D + 0.45, (az + bz) / 2, Math.atan2(bx - ax, bz - az));
    } }
  // the stern: bollards, life rings on the rail, the stern lamp, two deck lamps on the cabin's back wall, a bench
  // (the stern's bollards gone: the look review's round 4, 15 Nov, one stood between the camera and his feet as a
  // black block)
  // (round 4 again: even at the corners one stood in the boarding's frame as a black drum; none)
  // (round 6: the rings sat in the rail's own plane, the top rail and a post run through them; hung on its outside
  // face now, between two posts, their tops just under the top rail)
  for (const x of [-3.575, 3.575]) K.put(ringM, new THREE.TorusGeometry(0.31, 0.07, 10, 24), x, D + 0.62, -half + 0.085);
  K.box(lampW, 0.25, 0.25, 0.2, 0, D + 2.3, c0 - 0.08);
  for (const x of [-3.4, 3.4]) K.box(lampY, 0.22, 0.16, 0.22, x, D + 2.35, c0 - 0.15);
  K.box(grey, 3.2, 0.12, 0.5, 0, D + 0.45, c0 - 0.6); K.box(grey, 3.2, 0.5, 0.08, 0, D + 0.75, c0 - 0.38);
  // (a yellow safety line round the open stern deck's edge)
  const yel = std('#C9A230', { roughness: 0.8 });
  K.box(yel, B - 0.9, 0.012, 0.08, 0, D + 0.04, -half + 0.55);
  for (const sx of [-1, 1]) K.box(yel, 0.08, 0.012, c0 + half - 0.6, sx * (b - 0.55), D + 0.04, (c0 - half) / 2 + 0.3);
  K.into(g);
  // the warm light on the stern deck: under its two deck lamps, the stern lamp, and the doors' glow spilling out (paint,
  // added to the deck; no scene light)
  const spill = (() => { const [c, x] = canvas(64, 64), gr = x.createRadialGradient(32, 32, 1, 32, 32, 32); gr.addColorStop(0, 'rgba(255,205,140,0.7)'); gr.addColorStop(0.5, 'rgba(255,190,120,0.25)'); gr.addColorStop(1, 'rgba(255,190,120,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return tex(c); })();
  const spillM = new THREE.MeshBasicMaterial({ map: spill, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const [px, pz, w, l] of [[-3.4, c0 - 1.6, 3.2, 3.2], [3.4, c0 - 1.6, 3.2, 3.2], [0, c0 - 1.4, 3.4, 2.6], [0, -half + 2.8, 4.6, 4.2]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), spillM); m.rotation.x = -PI / 2; m.position.set(px, D + 0.05, pz); m.renderOrder = 2; g.add(m);
  }
  // the water at work round it (in its own frame, under the deck): the bow wave's V and the stern wash, their size by
  // its speed (set by put)
  const tint = new THREE.Color(0.36, 0.4, 0.48), bowT = streakTex(11, { w: 64, h: 256, n: 600, spread: 0.2, a0: 0.4 }), washT = streakTex(23, { w: 128, h: 256, n: 1400, spread: 0.26, k: 1.3, a0: 0.34 });
  const fx = new THREE.Group(); g.add(fx);
  const bows = [-1, 1].map((s) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 14), foamMat(bowT, tint)); m.rotation.x = -PI / 2; m.rotation.z = PI - s * 0.42; m.position.set(s * (b * 0.6 + 2.6), 0.06, half - 7.5); fx.add(m); return m; });
  const wash = new THREE.Mesh(new THREE.PlaneGeometry(B * 1.05, 16), foamMat(washT, tint)); wash.rotation.x = -PI / 2; wash.rotation.z = PI; wash.position.set(0, 0.07, -half - 7.6); fx.add(wash);
  // (the shadows of the wake planes off; the ferry casts its own)
  fx.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.renderOrder = 2; } });
  const wl = water();
  const api = {
    group: g, water: wl,
    show(on) { g.visible = !!on; },
    // its place on the water: x, z, heading h, a little bob and roll by t; v its speed (the bow wave and the wash)
    put(x, z, h, t = 0, v = 0) {
      g.position.set(x, wl + Math.sin(t * 1.3) * 0.07, z); g.rotation.set(Math.sin(t * 0.9) * 0.008, h, Math.sin(t * 1.1) * 0.014);
      const k = Math.min(1, v / 6);
      for (const m of bows) { m.visible = k > 0.05; m.material.opacity = 0.4 * k; m.scale.set(0.7, 0.4 + 0.6 * k, 1); } // (round 4: fainter and thinner, they read as grey boards off the bow from above)
      wash.visible = k > 0.03; wash.material.opacity = 0.7 * Math.min(1, v / 3); wash.scale.set(1, 0.5 + 0.5 * k, 1);
    },
    // a point of the ferry's own in the world (lx across, ly up from the deck, lz along)
    world(lx, ly, lz, out = new THREE.Vector3()) { return g.localToWorld(out.set(lx, D + ly, lz)); },
    // its stern in the world, at the water (the wake starts there)
    sternAt(out = new THREE.Vector3()) { return g.localToWorld(out.set(0, -wl, -half)); },
    dispose() { app.scene.remove(g); app.scene.remove(walk); g.traverse((o) => o.geometry?.dispose?.()); walk.traverse((o) => o.geometry?.dispose?.()); },
  };
  return api;
}

/* ----------------------------------------------------------------- wake -- */
// the ferry's wake: a strip of quads along its stern's recent positions (a point every STEP m, at most N), just over
// the water; wider and fainter with age (its texture fades along it), night-tinted. step(dt) each frame
// (the look review's round 2: 160 m of it at full strength read, edge-on from the stern, as one straight white line to
// the shore; now 70 m, gone well before its end. Round 3: so faint it was gone from the end card; brighter again, narrower)
export function buildWake(W, ferry, { N = 32, STEP = 2.2 } = {}) {
  const app = W.app, wl = water() + 0.04;
  const pos = new Float32Array(N * 2 * 3), uv = new Float32Array(N * 2 * 2), idx = [];
  for (let i = 0; i < N - 1; i++) { const a = i * 2, b2 = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b2, b2, c, d); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
  // (round 5: under the skyline's own reflections in brightness, broken streaks, never a slab)
  const mat = foamMat(streakTex(41, { n: 2600, spread: 0.24, k: 1.1, a0: 0.3 }), new THREE.Color(0.46, 0.5, 0.58)); mat.opacity = 0.8;
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'm4-wake'; mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.visible = false; app.scene.add(mesh);
  // (the look review's round 4, 15 Nov: a white patch under the stern, no V. Its two arms now, the wash's lines from
  // the stern's corners spreading out at the wake's angle (about 19 degrees each side), thin and fading with age)
  const apos = new Float32Array(2 * N * 2 * 3), auv = new Float32Array(2 * N * 2 * 2), aidx = [];
  for (let k = 0; k < 2; k++) for (let i = 0; i < N - 1; i++) { const a = (k * N + i) * 2, b2 = a + 1, c = a + 2, d = a + 3; aidx.push(a, c, b2, b2, c, d); }
  const ageo = new THREE.BufferGeometry();
  ageo.setAttribute('position', new THREE.BufferAttribute(apos, 3)); ageo.setAttribute('uv', new THREE.BufferAttribute(auv, 2)); ageo.setIndex(aidx);
  // (round 5: feathered across, tapering in width and fading along, not a hard line)
  // (round 6: still one hard bright line across half the end card's frame, as wide at its end as at the stern. Broken
  // into patches now, dimmer, narrowing to a thread and gone well before its end)
  const amat = foamMat(streakTex(57, { w: 64, n: 700, spread: 0.13, k: 2.2, a0: 0.24, gaps: 9 }), new THREE.Color(0.5, 0.54, 0.62)); amat.opacity = 0.62;
  const arms = new THREE.Mesh(ageo, amat); arms.name = 'm4-wake-arms'; arms.frustumCulled = false; arms.renderOrder = 1; mesh.add(arms);
  const pts = []; // [{ x, z, hx, hz }] newest first (hx, hz: the side vector)
  const _s = new THREE.Vector3();
  function rebuild() {
    const n = pts.length;
    for (let k = 0; k < 2; k++) {
      const sd = k ? 1 : -1;
      for (let i = 0; i < N; i++) {
        const p = pts[Math.min(i, n - 1)] || { x: 0, z: 0, hx: 1, hz: 0 }, d = Math.min(i, n - 1) * STEP;
        const off = sd * (FERRY.beam / 2 - 0.4 + d * 0.34), w = 0.8 * (1 - 0.7 * Math.min(1, i / Math.max(1, N - 1)));
        const o = (k * N + i) * 6;
        apos.set([p.x + p.hx * (off - w), wl + 0.01, p.z + p.hz * (off - w), p.x + p.hx * (off + w), wl + 0.01, p.z + p.hz * (off + w)], o);
        const v = Math.min(1, i / Math.max(1, N - 1));
        auv.set([0, 1 - v, 1, 1 - v], (k * N + i) * 4);
      }
    }
    ageo.attributes.position.needsUpdate = true; ageo.attributes.uv.needsUpdate = true;
    for (let i = 0; i < N; i++) {
      const p = pts[Math.min(i, n - 1)] || { x: 0, z: 0, hx: 1, hz: 0 }, a = Math.min(i, n - 1) / Math.max(1, N - 1);
      const w = 2.8 + Math.sqrt(a) * 15; // (it spreads; round 3: narrower and brighter, so it reads behind it in the end card)
      pos.set([p.x - p.hx * w, wl, p.z - p.hz * w, p.x + p.hx * w, wl, p.z + p.hz * w], i * 6);
      const v = Math.min(1, i / Math.max(1, N - 1));
      uv.set([0, 1 - v, 1, 1 - v], i * 4);
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.uv.needsUpdate = true;
  }
  return {
    mesh,
    reset() { pts.length = 0; mesh.visible = false; },
    show(on) { mesh.visible = !!on && pts.length > 1; if (!on) pts.length = 0; },
    step() {
      if (!ferry.group.visible) return;
      const s = ferry.sternAt(_s), h = ferry.group.rotation.y;
      // (a jump along its way, the call's start put further out: a fresh wake, not one long strip back to where it was;
      // the round 2 review saw that strip as a white line from the shore to the ferry)
      if (pts[0] && Math.hypot(s.x - pts[0].x, s.z - pts[0].z) > STEP * 6) pts.length = 0;
      // (the head, pts[0], rides at the stern; a point is left behind each STEP. Round 4, 15 Nov: the head had been the
      // only point, carried along, so no ribbon was ever drawn: just the ferry's own wash under its stern)
      const hx = Math.cos(h), hz = -Math.sin(h);
      if (!pts.length) pts.push({ x: s.x, z: s.z, hx, hz }, { x: s.x, z: s.z, hx, hz });
      const head = pts[0]; head.x = s.x; head.z = s.z; head.hx = hx; head.hz = hz;
      if (Math.hypot(s.x - pts[1].x, s.z - pts[1].z) >= STEP) { pts.splice(1, 0, { x: s.x, z: s.z, hx, hz }); if (pts.length > N) pts.pop(); }
      if (pts.length > 2) { mesh.visible = true; rebuild(); }
      // (round 6: from the stern rail, the call's shots, the churned wash under the lens filled half the frame as a
      // grey mottled blanket. It thins to a trace while the camera is on board or just off the stern; from the end
      // card's distance it is all there)
      const cam = app.cameraSystem?.camera || app.camera;
      if (cam) { const dc = Math.hypot(cam.position.x - s.x, cam.position.z - s.z), f = Math.min(1, Math.max(0.12, (dc - 10) / 40)); mat.opacity = 0.8 * f; amat.opacity = 0.62 * Math.min(1, Math.max(0.35, (dc - 6) / 30)); }
    },
    dispose() { app.scene.remove(mesh); geo.dispose(); ageo.dispose(); },
  };
}

/* ---------------------------------------------------------- guide rings -- */
// the flight's guide rings: pts [{ x, y, z, h }] (h the way through), one lit at a time (on(i)), the rest faint
export function buildRings(W, pts) {
  const app = W.app, g = new THREE.Group(); g.name = 'm4-rings'; app.scene.add(g);
  const geo = new THREE.TorusGeometry(13, 0.55, 8, 48);
  const rings = pts.map((p) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFC93C').multiplyScalar(1.8), transparent: true, opacity: 0.35, depthWrite: false, fog: false }));
    m.position.set(p.x, p.y, p.z); m.rotation.y = p.h; m.castShadow = false; m.frustumCulled = false; g.add(m); return m;
  });
  return {
    group: g, rings,
    on(i) { rings.forEach((m, k) => { m.visible = k >= i; m.material.opacity = k === i ? 0.95 : 0.3; }); },
    spin(t) { rings.forEach((m, k) => { m.scale.setScalar(1 + 0.03 * Math.sin(t * 3 + k)); }); },
    dispose() { app.scene.remove(g); geo.dispose(); },
  };
}
