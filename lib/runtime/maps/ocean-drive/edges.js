/*
 * The district's edges, as things you can see (ours, not the original's; the
 * owner, 28 Sep: "when he goes down an alley and can't go further beyond those
 * limits it should be a wall"). Every place the walkable district stops is
 * closed by something built:
 *
 *   - each service alley between the hotels runs 20 m back to a block wall,
 *     with a bin or a dumpster against it;
 *   - each cross street is shut 20 m in by jersey barriers, a construction
 *     fence and a ROAD CLOSED barricade;
 *   - both ends of the district are fenced from the hotel fronts across the
 *     street, the park and the beach into the surf;
 *   - in the sea, a line of swim-area buoys marks how far out you can wade.
 *
 * It returns the colliders for all of it, the frontage that stays shut (the
 * hotel patios, as before), where the walkable ground ends, and the hiding
 * places an open world's weapons are left in. Nothing here is a brand.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HOTEL, DISTRICT, SEA_LEVEL, SHORE_X, PARK, TOWERS } from './src/world/layout.js';

// how deep the sea may get round your legs: mid-thigh, just short of the buoys
export const WADE_X = SHORE_X + 11.6;
const BUOY_X = WADE_X + 0.45;
const BACK_X = -50;              // alleys and cross streets end here, 20 m in
const FRONT_X = HOTEL.patioX + 0.2;

function tex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function noise(g, w, h, n, a, dark = true) {
  for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${dark ? '0,0,0' : '255,255,255'},${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3); }
}
// world-space UVs (a metre is `per` of the texture) so every wall's blocks are the same size
function boxUV(geo, per) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), az = Math.abs(n.getZ(i));
    const u = ax > 0.5 ? p.getZ(i) : az > 0.5 ? p.getX(i) : p.getX(i), v = ax > 0.5 || az > 0.5 ? p.getY(i) : p.getZ(i);
    uv.setXY(i, u * per, v * per);
  }
  return geo;
}
function place(geo, x, y, z, ry = 0) { const m = new THREE.Matrix4().makeRotationY(ry); m.setPosition(x, y, z); return geo.applyMatrix4(m); }

export function buildEdges(scene, { groundAt, footprints, requestShadow = () => {} }) {
  const parts = new Map();      // material -> geometries, merged at the end
  const add = (mat, geo) => { if (!parts.has(mat)) parts.set(mat, []); parts.get(mat).push(geo.index ? geo.toNonIndexed() : geo); };
  const boxes = [], circles = [], hideouts = [];

  /* ---------------------------------------------------------- materials -- */
  const block = new THREE.MeshStandardMaterial({ roughness: 0.95, map: tex(256, 256, (g, w, h) => {
    g.fillStyle = '#D6CEBE'; g.fillRect(0, 0, w, h);
    const bw = w / 2, bh = h / 4;       // 40 x 20 cm blocks over a 0.8 m tile
    for (let r = 0; r < 4; r++) for (let c = -1; c < 3; c++) {
      const x = c * bw + (r % 2 ? bw / 2 : 0), y = r * bh, s = 200 + Math.floor(Math.random() * 20);
      g.fillStyle = `rgb(${s + 14},${s + 6},${s - 8})`; g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    }
    noise(g, w, h, 900, 0.08);
  }) });
  const grime = new THREE.MeshStandardMaterial({ color: '#5E574C', roughness: 1 });
  const concrete = new THREE.MeshStandardMaterial({ roughness: 0.9, map: tex(128, 128, (g, w, h) => { g.fillStyle = '#BDB8AE'; g.fillRect(0, 0, w, h); noise(g, w, h, 700, 0.1); noise(g, w, h, 200, 0.12, false); }) });
  const reflector = new THREE.MeshStandardMaterial({ color: '#FFB21A', emissive: '#6A3A00', roughness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: '#A2A7AB', roughness: 0.42, metalness: 0.7 });
  const screen = new THREE.MeshStandardMaterial({ roughness: 1, side: THREE.DoubleSide, map: tex(64, 64, (g, w, h) => {
    g.fillStyle = '#1E3A2C'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.06)'; for (let i = 0; i < w; i += 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
  }, 1, 1) });
  const feet = new THREE.MeshStandardMaterial({ color: '#2C2C2E', roughness: 0.85 });
  const stripes = new THREE.MeshStandardMaterial({ roughness: 0.5, map: tex(256, 32, (g, w, h) => {
    g.fillStyle = '#F4F2EC'; g.fillRect(0, 0, w, h); g.fillStyle = '#F2641E';
    for (let x = -h; x < w + h; x += 48) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 24, h); g.lineTo(x + 24 + h, 0); g.lineTo(x + h, 0); g.fill(); }
  }) });
  const signMat = (lines, bg = '#F5F5F2', ink = '#141414') => new THREE.MeshStandardMaterial({ roughness: 0.6, map: tex(512, 160, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = ink; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `800 ${lines.length > 1 ? 48 : 64}px Arial, Helvetica, sans-serif`;
    lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * 58));
  }) });
  const roadClosed = signMat(['ROAD CLOSED']), keepOut = signMat(['AREA CLOSED', 'NO ACCESS'], '#F5F5F2', '#B3121B');
  const dumpster = new THREE.MeshStandardMaterial({ color: '#2F4A3B', roughness: 0.55, metalness: 0.35 });
  const lid = new THREE.MeshStandardMaterial({ color: '#161718', roughness: 0.7 });
  const can = new THREE.MeshStandardMaterial({ color: '#56615C', roughness: 0.6, metalness: 0.3 });

  /* ------------------------------------------------------------- pieces -- */
  // a jersey barrier, 3.6 m, along z
  const jerseyShape = new THREE.Shape([[-0.3, 0], [0.3, 0], [0.3, 0.08], [0.2, 0.26], [0.08, 0.81], [-0.08, 0.81], [-0.2, 0.26], [-0.3, 0.08]].map(([x, y]) => new THREE.Vector2(x, y)));
  function jersey(x, y, z, ry) {
    const g = new THREE.ExtrudeGeometry(jerseyShape, { depth: 3.56, bevelEnabled: false }); g.translate(0, 0, -1.78);
    add(concrete, boxUV(place(g, x, y, z, ry), 0.8));
    add(reflector, place(new THREE.BoxGeometry(0.02, 0.08, 0.18), x + Math.cos(ry) * 0.15, y + 0.55, z - Math.sin(ry) * 0.15, ry));
  }
  // a construction fence panel between (xa, za) and (xb, zb): posts, rails, a green screen
  function fence(xa, za, xb, zb, y) {
    const L = Math.hypot(xb - xa, zb - za), ry = Math.atan2(xb - xa, zb - za), cx = (xa + xb) / 2, cz = (za + zb) / 2;
    add(screen, place(new THREE.PlaneGeometry(L - 0.04, 1.7).rotateY(Math.PI / 2).translate(0, 1.05, 0), cx, y, cz, ry - Math.PI / 2 + Math.PI / 2));
    for (const e of [-0.5, 0.5]) {
      add(steel, place(new THREE.CylinderGeometry(0.024, 0.024, 2.2, 8).translate(0, 1.1, 0), cx + Math.sin(ry) * L * e, y, cz + Math.cos(ry) * L * e));
      add(feet, place(new THREE.BoxGeometry(0.22, 0.14, 0.62).translate(0, 0.07, 0), cx + Math.sin(ry) * L * e, y, cz + Math.cos(ry) * L * e, ry + Math.PI / 2));
    }
    for (const h of [0.18, 1.92, 2.18]) add(steel, place(new THREE.CylinderGeometry(0.014, 0.014, L, 6).rotateX(Math.PI / 2).translate(0, h, 0), cx, y, cz, ry));
  }
  // a road-closed barricade across (x, z), facing yaw `face`: three striped boards and a sign
  function barricade(x, y, z, face, w = 2.4) {
    for (const e of [-0.5, 0.5]) add(steel, place(new THREE.BoxGeometry(0.06, 1.95, 0.06).translate(e * (w - 0.2), 0.975, 0), x, y, z, face));
    for (const h of [0.45, 0.85, 1.25]) add(stripes, place(new THREE.BoxGeometry(w, 0.2, 0.03).translate(0, h, 0), x, y, z, face));
    add(roadClosed, place(new THREE.PlaneGeometry(1.5, 0.47).translate(0, 1.72, 0.03), x, y, z, face));
    add(steel, place(new THREE.BoxGeometry(1.56, 0.52, 0.02).translate(0, 1.72, 0.01), x, y, z, face));
  }

  /* -------------------------------------------- the alleys and cross streets -- */
  const fps = footprints.slice().sort((a, b) => a.z0 - b.z0), gaps = [];
  for (let i = 1; i < fps.length; i++) {
    const z0 = fps[i - 1].z1, z1 = fps[i].z0, zc = (z0 + z1) / 2;
    if (z1 - z0 >= 1.2 && zc > DISTRICT.zMin + 2 && zc < DISTRICT.zMax - 2) gaps.push({ z0, z1, zc, w: z1 - z0 });
  }
  const toWall = -Math.PI / 2;        // facing west, into the wall
  for (const g of gaps) {
    const y = groundAt(BACK_X + 0.6, g.zc);
    if (g.w < 10) {
      // a service alley: a block wall where it ends, a bin or a dumpster against it
      add(block, boxUV(new THREE.BoxGeometry(0.3, 3.3, g.w + 0.5).translate(BACK_X - 0.15, y + 1.55, g.zc), 1.25));
      add(grime, new THREE.BoxGeometry(0.02, 0.35, g.w + 0.5).translate(BACK_X + 0.005, y + 0.1, g.zc));
      boxes.push({ min: { x: BACK_X - 0.3, y: y - 1, z: g.z0 - 0.25 }, max: { x: BACK_X, y: y + 3.3, z: g.z1 + 0.25 } });
      if (g.w >= 2.8) {
        add(dumpster, new THREE.BoxGeometry(1.0, 1.05, 1.8).translate(BACK_X + 0.55, y + 0.6, g.zc));
        add(lid, new THREE.BoxGeometry(1.04, 0.06, 1.84).rotateZ(-0.06).translate(BACK_X + 0.55, y + 1.15, g.zc));
        for (const e of [-0.7, 0.7]) add(feet, new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8).translate(BACK_X + 0.55, y + 0.04, g.zc + e));
        boxes.push({ min: { x: BACK_X, y: y - 1, z: g.zc - 0.9 }, max: { x: BACK_X + 1.05, y: y + 1.2, z: g.zc + 0.9 } });
        hideouts.push({ x: BACK_X + 0.5, z: g.zc + 0.3, y: y + 1.17, why: 'on a dumpster' });
      } else if (g.w >= 1.5) {
        const cz = g.z0 + 0.34;
        add(can, new THREE.CylinderGeometry(0.26, 0.23, 0.92, 16).translate(BACK_X + 0.34, y + 0.46, cz));
        add(lid, new THREE.CylinderGeometry(0.28, 0.28, 0.05, 16).translate(BACK_X + 0.34, y + 0.95, cz));
        circles.push({ x: BACK_X + 0.34, z: cz, r: 0.27 });
        hideouts.push({ x: BACK_X + 0.2, z: g.z1 - 0.3, lean: toWall, why: 'in an alley' });
      } else hideouts.push({ x: BACK_X + 0.2, z: g.zc, lean: toWall, why: 'at the end of an alley' });
    } else {
      // a cross street: shut by jersey barriers and a fence, a barricade in front
      const n = Math.ceil(g.w / 3.6), step = g.w / n;
      for (let k = 0; k < n; k++) jersey(BACK_X + 0.35, groundAt(BACK_X + 0.35, g.z0 + step * (k + 0.5)), g.z0 + step * (k + 0.5), 0);
      const m = Math.ceil((g.w + 0.4) / 3.1);
      for (let k = 0; k < m; k++) { const za = g.z0 - 0.2 + (g.w + 0.4) * k / m, zb = g.z0 - 0.2 + (g.w + 0.4) * (k + 1) / m; fence(BACK_X - 0.5, za, BACK_X - 0.5, zb, groundAt(BACK_X - 0.5, (za + zb) / 2)); }
      barricade(BACK_X + 1.9, groundAt(BACK_X + 1.9, g.zc), g.zc, Math.PI / 2);
      add(keepOut, place(new THREE.PlaneGeometry(1.4, 0.44), BACK_X - 0.46, y + 1.45, g.zc + 4, Math.PI / 2));
      boxes.push({ min: { x: BACK_X - 0.7, y: y - 1, z: g.z0 - 0.25 }, max: { x: BACK_X + 0.7, y: y + 2.3, z: g.z1 + 0.25 } });
      boxes.push({ min: { x: BACK_X + 1.8, y: y - 1, z: g.zc - 1.2 }, max: { x: BACK_X + 2.0, y: y + 2, z: g.zc + 1.2 } });
      hideouts.push({ x: BACK_X + 0.82, z: g.zc - 5.5, lean: toWall, why: 'against the barriers' }, { x: BACK_X + 0.82, z: g.zc + 6.3, lean: toWall, why: 'against the barriers' });
    }
  }
  // the hotel frontage stays shut (the patios), except where an alley or a street opens
  let zf = DISTRICT.zMin - 12;
  for (const g of gaps) { if (g.z0 > zf) boxes.push({ min: { x: -80, y: -5, z: zf }, max: { x: FRONT_X, y: 60, z: g.z0 } }); zf = g.z1; }
  boxes.push({ min: { x: -80, y: -5, z: zf }, max: { x: FRONT_X, y: 60, z: DISTRICT.zMax + 12 } });

  /* ------------------------------------------------ the district's two ends -- */
  for (const s of [-1, 1]) {
    const zE = s * (DISTRICT.zMax - 0.5), inward = s > 0 ? Math.PI : 0;
    const xs = []; for (let x = HOTEL.frontX; x < BUOY_X + 0.4; x += 3.05) xs.push(x); xs.push(BUOY_X + 0.4);
    for (let k = 0; k < xs.length - 1; k++) fence(xs[k], zE, xs[k + 1], zE, Math.min(groundAt(xs[k], zE), groundAt(xs[k + 1], zE)));
    // the road: barriers across it, and a barricade in front of them
    for (let x = -23.4; x < -14.6; x += 3.62) jersey(x + 1.8, groundAt(x + 1.8, zE - s * 0.5), zE - s * 0.5, Math.PI / 2);
    barricade(-18, groundAt(-18, zE - s * 2.2), zE - s * 2.2, inward);
    add(keepOut, place(new THREE.PlaneGeometry(1.4, 0.44), 4, groundAt(4, zE) + 1.4, zE - s * 0.03, inward));
    add(keepOut, place(new THREE.PlaneGeometry(1.4, 0.44), 40, groundAt(40, zE) + 1.4, zE - s * 0.03, inward));
    boxes.push({ min: { x: -80, y: -5, z: zE - 0.2 }, max: { x: BUOY_X + 2, y: 3, z: zE + 0.2 } });
    boxes.push({ min: { x: -23.6, y: -5, z: Math.min(zE, zE - s * 0.85) }, max: { x: -14.4, y: 1.2, z: Math.max(zE, zE - s * 0.85) } });
    boxes.push({ min: { x: -19.2, y: -5, z: zE - s * 2.2 - 0.1 }, max: { x: -16.8, y: 2, z: zE - s * 2.2 + 0.1 } });
    const lean = s > 0 ? 0 : Math.PI;
    for (const x of [-27, -12, 2, 30, 64]) hideouts.push({ x, z: zE - s * (x > -24 && x < -14.5 ? 1.3 : 0.32), lean, why: 'against the fence' });
  }

  /* ----------------------------------------------- beach, towers and park -- */
  for (const t of TOWERS) hideouts.push({ x: t.x - 3.2, z: t.z - 2.8, why: 'by a lifeguard tower' });
  for (const z of [-262, -131, 118, 247]) hideouts.push({ x: PARK.wallX + 0.62, z, lean: -Math.PI / 2, why: 'against the sea wall' });
  for (const [x, z] of [[24, -300], [27, -45], [22, 160], [26, 305]]) hideouts.push({ x, z, why: 'in the dune grass' });

  /* ---------------------------------------------------------- the buoys -- */
  const nB = Math.floor((DISTRICT.zMax - DISTRICT.zMin) / 5) + 1;
  const buoyGeo = new THREE.SphereGeometry(0.16, 14, 10); buoyGeo.scale(1, 0.8, 1);
  const buoys = new THREE.InstancedMesh(buoyGeo, new THREE.MeshStandardMaterial({ color: '#FF8A1E', roughness: 0.45 }), nB);
  const ropeGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 5).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  const ropes = new THREE.InstancedMesh(ropeGeo, new THREE.MeshStandardMaterial({ color: '#EDE4CC', roughness: 0.9 }), nB - 1);
  buoys.castShadow = true; buoys.frustumCulled = ropes.frustumCulled = false;
  scene.add(buoys, ropes);
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), bobY = new Float32Array(nB);

  /* ------------------------------------------------------------ merging -- */
  for (const [mat, list] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(list), mat);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.gmEdge = true;
    scene.add(mesh);
  }
  requestShadow();

  return {
    boxes, circles, hideouts,
    bounds: { x0: BACK_X - 0.6, x1: WADE_X, z0: DISTRICT.zMin, z1: DISTRICT.zMax },
    update(t) {
      for (let i = 0; i < nB; i++) {
        const z = DISTRICT.zMin + i * 5;
        bobY[i] = SEA_LEVEL + 0.16 + Math.sin(t * 1.35 + z * 0.23) * 0.07 + Math.sin(t * 0.7 + z * 0.05) * 0.05;
        M.compose(P.set(BUOY_X, bobY[i], z), Q.identity(), S.set(1, 1, 1)); buoys.setMatrixAt(i, M);
      }
      for (let i = 0; i < nB - 1; i++) {
        const z = DISTRICT.zMin + i * 5, dy = bobY[i + 1] - bobY[i];
        Q.setFromAxisAngle(P.set(1, 0, 0), -Math.atan2(dy, 5));
        M.compose(P.set(BUOY_X, bobY[i] + 0.02, z), Q, S.set(1, 1, Math.hypot(5, dy))); ropes.setMatrixAt(i, M);
      }
      buoys.instanceMatrix.needsUpdate = true; ropes.instanceMatrix.needsUpdate = true;
    },
  };
}
