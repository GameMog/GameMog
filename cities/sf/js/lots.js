(function () {
// cities/sf/js/lots.js
// A town's car parks dressed (CITY-BUILDER item 3; Mandi's Revenge H1, the empty streets): GEO.lots from
// tools/hometown/features.py (every mapped car park: its ring and the bearing of its long side).
// - Stalls: rows of 2.6 x 5.2 m stalls along the lot's long side, two rows back to back between 7 m aisles, each stall
//   whole inside the lot 1.2 m clear of its edge; painted lines (one merged mesh per 512 m cell).
// - Parked cars: a share of the stalls (FILL, by a hash of the stall: the same cars every visit), never within CLEAR m
//   of a mission place's spots (PKG.places: the lane point and the spot on foot), so a story's own cars and its targets
//   stay where they are. Drawn from a pool round the camera (POOL_R m, re-picked every 0.5 s): the town fleet's lofted
//   bodies (actor-models.js) in their real colours, the full body near (NEAR m), the low stand-in further.
// buildLots(scene) -> { group, update(dt, camPos), stats } | null; ?lots=0 none
const N = window.NYC, { THREE } = N;
const q = new URLSearchParams(location.search);
const SW = 2.6, SD = 5.2, AISLE = 7, EDGE = 1.2, FILL = 0.62, CLEAR = 12, POOL_R = 260, NEAR = 70, CELL = 512;
const KINDS = [['sedan', 30], ['suv', 26], ['hatch', 14], ['minivan', 8], ['pickup', 8], ['oldsedan', 7], ['van', 7]];
const PAINTS = [0x1c1d20, 0x2a2d31, 0xe9e9e6, 0xbfc3c7, 0x8c9196, 0x5a6068, 0x7a1f22, 0x1f3550, 0x2f4a3a, 0x5c4a3a, 0xd8d2c2, 0x0f1a2c, 0x6b6f75, 0x9a2a1d];

function hash(a, b) { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function inRing(r, x, z) {
  let c = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if ((r[i + 1] > z) !== (r[j + 1] > z) && x < ((r[j] - r[i]) * (z - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) c = !c;
  return c;
}
function edgeDist(r, x, z) {
  let d = Infinity;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const ax = r[j], az = r[j + 1], bx = r[i], bz = r[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return d;
}

function buildLots(scene, network) {
  const lots = N.GEO && N.GEO.lots;
  if (!lots || !lots.length || q.get('lots') === '0') return null;
  const T = N.Terrain;
  const ground = (x, z) => T.groundAt(x, z);
  // the mission places' spots kept clear
  const keep = [];
  for (const p of Object.values((N.PKG && N.PKG.places) || {})) for (const [x, z] of [[p.x, p.z], [p.cx, p.cz], [p.ax, p.az]]) if (Number.isFinite(x) && Number.isFinite(z)) keep.push(x, z);
  const kc = new Map();
  for (let i = 0; i < keep.length; i += 2) { const k = Math.floor(keep[i] / 64) * 65536 + Math.floor(keep[i + 1] / 64); let l = kc.get(k); if (!l) kc.set(k, (l = [])); l.push(keep[i], keep[i + 1]); }
  const kept = (x, z) => { for (let ix = Math.floor(x / 64) - 1; ix <= Math.floor(x / 64) + 1; ix++) for (let iz = Math.floor(z / 64) - 1; iz <= Math.floor(z / 64) + 1; iz++) { const l = kc.get(ix * 65536 + iz); if (l) for (let i = 0; i < l.length; i += 2) if (Math.hypot(l[i] - x, l[i + 1] - z) < CLEAR) return true; } return false; };
  const covered = N.Elevated ? (x, z) => N.Elevated.underAt(x, z) !== null : () => false;
  // stalls and lines
  const cells = new Map(), cars = [];
  const cellOf = (x, z) => { const k = Math.floor(x / CELL) * 65536 + Math.floor(z / CELL); let c = cells.get(k); if (!c) cells.set(k, (c = [])); return c; };
  let stalls = 0;
  lots.forEach((L, li) => {
    const r = L.ring; if (r.length < 6) return;
    const ux = Math.sin(L.ang), uz = Math.cos(L.ang), vx = -uz, vz = ux;
    let cx = 0, cz = 0; for (let i = 0; i < r.length; i += 2) { cx += r[i]; cz += r[i + 1]; } cx /= r.length / 2; cz /= r.length / 2;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < r.length; i += 2) { const u = (r[i] - cx) * ux + (r[i + 1] - cz) * uz, v = (r[i] - cx) * vx + (r[i + 1] - cz) * vz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    // the rows across v: [row][row] aisle [row][row] aisle ...; a row's stalls face along v
    const pitch = 2 * SD + AISLE;
    for (let vb = v0 + EDGE; vb + SD <= v1 - EDGE; vb += pitch) {
      for (const [rv, face] of [[vb + SD / 2, 1], [vb + SD * 1.5, -1]]) {
        if (rv + SD / 2 > v1 - EDGE) continue;
        for (let u = u0 + EDGE + SW / 2; u + SW / 2 <= u1 - EDGE; u += SW) {
          const x = cx + ux * u + vx * rv, z = cz + uz * u + vz * rv;
          if (!inRing(r, x, z) || edgeDist(r, x, z) < Math.max(EDGE, SD / 2 - 0.2) * 0.9) continue;
          const c = cellOf(x, z), gy = ground(x, z) + 0.035;
          // the stall's side line (on its +u side) and its end line
          c.push([x + ux * SW / 2, gy, z + uz * SW / 2, vx, vz, SD, 0.1]);
          stalls++;
          const ks = Math.floor(x * 10), kz = Math.floor(z * 10);
          if (hash(ks, kz) < FILL && !kept(x, z)) {
            const h = hash(kz + 7, ks + 3);
            let a = h * 100, kind = KINDS[0][0];
            for (const [k, w] of KINDS) { if (a < w) { kind = k; break; } a -= w; }
            const nose = face * (hash(ks + 1, kz + 9) < 0.8 ? 1 : -1);
            cars.push({ x, z, y: ground(x, z), yaw: Math.atan2(vx * nose, vz * nose) + (hash(ks, kz + 5) - 0.5) * 0.06, kind, paint: PAINTS[Math.floor(hash(ks + 3, kz + 1) * PAINTS.length)], covered: covered(x, z) });
          }
        }
      }
    }
  });
  // ---- kerbside parked cars (H1): along every street within KERB_R m of downtown with room at its kerb beside its outer
  // lane (as traffic.js's own parked cars find it: the kerb felt for at the car's nose, middle and tail, the car 0.3 m
  // off it, the whole car on the roadway), a slot every 6.4 m from 14 m past each junction, a share of them taken (by a
  // hash of the slot). Never by a mission place (CLEAR m), an L column (3 m) or a bascule. Drawn with the lots' cars.
  let kerbCars = 0;
  const KERB_R = 2200, KERB_FILL = 0.8;
  if (network && network.edges && network.onSidewalk && network.walkable) {
    const { onSidewalk, walkable } = network, DT = (N.PKG && N.PKG.downtown) || { x: 0, z: 0 };
    const cols = new Map();
    for (const c of (N.Elevated && N.Elevated.colliders) || []) { const x = (c.minX + c.maxX) / 2, z = (c.minZ + c.maxZ) / 2, k = Math.floor(x / 16) * 65536 + Math.floor(z / 16); let l = cols.get(k); if (!l) cols.set(k, (l = [])); l.push(x, z); }
    const nearCol = (x, z) => { for (let ix = Math.floor(x / 16) - 1; ix <= Math.floor(x / 16) + 1; ix++) for (let iz = Math.floor(z / 16) - 1; iz <= Math.floor(z / 16) + 1; iz++) { const l = cols.get(ix * 65536 + iz); if (l) for (let i = 0; i < l.length; i += 2) if (Math.hypot(l[i] - x, l[i + 1] - z) < 3.2) return true; } return false; };
    const bascule = (x, z) => !!(N.basculeCovers && N.basculeCovers(x, z));
    const HW = 0.95, HALF = 2.35;
    for (const e of network.edges) {
      if (e.bore || e.divided || e.noWalk || !(e.len >= 40) || !e.lanes || !e.lanes.length) continue;
      const mx = e.sx + e.dx * e.len / 2, mz = e.sz + e.dz * e.len / 2;
      if (Math.hypot(mx - DT.x, mz - DT.z) > KERB_R + e.len / 2) continue;
      const lo = Math.min(...e.lanes), hi = Math.max(...e.lanes), room = e.half - HW - 0.35, need = HW + 1.35;
      const sides = [];
      if (room - hi >= need) sides.push([1, hi]);
      if (lo < 0 && room + lo >= need) sides.push([-1, -lo]);
      for (const [side, lane0] of sides) {
        for (let sv = 14 + HALF; sv < e.len - 14 - HALF; sv += 6.4) {
          const ks = Math.floor((e.sx + e.dx * sv) * 3), kz = Math.floor((e.sz + e.dz * sv) * 3) + side;
          if (hash(ks, kz) >= KERB_FILL) continue;
          const kerb = [];
          for (const t of [-HALF + 0.4, 0, HALF - 0.4]) {
            const bx = e.sx + e.dx * (sv + t), bz = e.sz + e.dz * (sv + t);
            let k = null;
            for (let d = lane0 + 1.6; d <= e.half + 2.5; d += 0.2) { const px = bx + e.rx * side * d, pz = bz + e.rz * side * d; if (onSidewalk(px, pz) || !walkable(px - 0.05, px + 0.05, pz - 0.05, pz + 0.05)) { k = d; break; } }
            if (k === null) break;
            kerb.push(k);
          }
          if (kerb.length < 3 || Math.max(...kerb) - Math.min(...kerb) > 0.35) continue;
          const off = Math.min(...kerb) - HW - 0.3;
          if (off - lane0 < need) continue;
          const x = e.sx + e.dx * sv + e.rx * side * off, z = e.sz + e.dz * sv + e.rz * side * off;
          if (kept(x, z) || nearCol(x, z) || bascule(x, z)) continue;
          let clear = true;
          for (const t of [-HALF + 0.3, HALF - 0.3]) for (const w of [-HW, HW]) { const px = x + e.dx * t + e.rx * w, pz = z + e.dz * t + e.rz * w; if (onSidewalk(px, pz) || !walkable(px - 0.25, px + 0.25, pz - 0.25, pz + 0.25)) clear = false; }
          if (!clear) continue;
          const h = hash(kz + 7, ks + 3);
          let a = h * 100, kind = KINDS[0][0];
          for (const [k, w] of KINDS) { if (a < w) { kind = k; break; } a -= w; }
          cars.push({ x, z, y: ground(x, z), yaw: Math.atan2(e.dx, e.dz) + (hash(ks + 2, kz) - 0.5) * 0.02, kind, paint: PAINTS[Math.floor(hash(ks + 3, kz + 1) * PAINTS.length)], kerb: true });
          kerbCars++;
        }
      }
    }
  }
  const group = new THREE.Group();
  group.name = 'Lots';
  scene.add(group);
  // ---- shop spill (H1): the warm light a lit shop window throws on the pavement in front of it, at night (additive
  // pools from buildings.js's shopfronts, window.NYC.pkgSignPlan)
  const shops = (N.pkgSignPlan && N.pkgSignPlan.shops) || [];
  if (shops.length) {
    const { smoothstep, float, vec3, vec2, uv, length: tlen } = N.TSL;
    const night = N.cityUniforms && N.cityUniforms.uInteriorGlow ? smoothstep(0.4, 1.3, N.cityUniforms.uInteriorGlow) : float(0);
    const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
    const pm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    // (brightest at the window, fading out across the pavement: uv.y 1 at the shop's wall)
    const d = uv().sub(vec2(0.5, 1.0)), fall = float(1).sub(smoothstep(0.0, 1.0, tlen(d.mul(vec2(1.3, 1.0)))));
    pm.colorNode = vec3(1.0, 0.72, 0.42).mul(fall.mul(fall)).mul(night).mul(1.5);
    const im = new THREE.InstancedMesh(pg, pm, shops.length), m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v4 = new THREE.Vector3(), s4 = new THREE.Vector3(9, 1, 6.5), up = new THREE.Vector3(0, 1, 0);
    shops.forEach((sp, i) => { q4.setFromAxisAngle(up, Math.atan2(sp.nx, sp.nz)); m4.compose(v4.set(sp.x + sp.nx * 3.2, ground(sp.x + sp.nx * 3.2, sp.z + sp.nz * 3.2) + 0.07, sp.z + sp.nz * 3.2), q4, s4); im.setMatrixAt(i, m4); });
    im.computeBoundingSphere(); im.name = 'ShopSpill';
    group.add(im);
  }
  // the lines: thin quads, one mesh per cell
  const paint = new THREE.MeshStandardNodeMaterial({ color: 0xd9d6cc, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  let lineTris = 0; const lineMeshes = [];
  for (const list of cells.values()) {
    const P = [];
    for (const [x, y, z, dx, dz, len, w] of list) {
      const ax = (dx * len) / 2, az = (dz * len) / 2, bx = (-dz * w) / 2, bz = (dx * w) / 2;
      const a = [x - ax - bx, y, z - az - bz], b = [x + ax - bx, y, z + az - bz], c = [x + ax + bx, y, z + az + bz], d = [x - ax + bx, y, z - az + bz];
      P.push(...a, ...c, ...b, ...a, ...d, ...c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    const nrm = new Float32Array(P.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, paint); m.receiveShadow = true; group.add(m); lineMeshes.push(m);
    lineTris += P.length / 9;
  }
  // the cars: a pool per kind, near and far
  const pools = {};
  const spec = N.BODY_SPECS;
  const NEAR_N = 64, FAR_N = 200;
  for (const [kind] of KINDS) {
    if (!spec || !spec[kind] || !N.buildCarGeometry) continue;
    const mat = N.createLoftedCarMaterial(spec[kind]);
    const mk = (g, n) => {
      g.setAttribute('paintColor', new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3));
      const st = new Float32Array(n * 4); for (let i = 3; i < st.length; i += 4) st[i] = 2; // (parked: no lamps lit)
      g.setAttribute('carState', new THREE.InstancedBufferAttribute(st, 4));
      const im = new THREE.InstancedMesh(g, mat, n);
      im.count = 0; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true;
      group.add(im);
      return im;
    };
    pools[kind] = { near: mk(N.buildCarGeometry(spec[kind], true), NEAR_N), far: mk(N.buildCarProxyGeometry(spec[kind]), FAR_N) };
  }
  // cars by 128 m cell
  const cc = new Map();
  for (const c of cars) { const k = Math.floor(c.x / 128) * 65536 + Math.floor(c.z / 128); let l = cc.get(k); if (!l) cc.set(k, (l = [])); l.push(c); }
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), pp = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  let acc = 1, lastX = Infinity, lastZ = Infinity;
  function refill(cam) {
    const R = Math.ceil(POOL_R / 128), ix0 = Math.floor(cam.x / 128), iz0 = Math.floor(cam.z / 128), near = [];
    for (let ix = ix0 - R; ix <= ix0 + R; ix++) for (let iz = iz0 - R; iz <= iz0 + R; iz++) for (const c of cc.get(ix * 65536 + iz) || []) {
      const d = Math.hypot(c.x - cam.x, c.z - cam.z); if (d < POOL_R) near.push([d, c]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (const k in pools) { pools[k].near.count = 0; pools[k].far.count = 0; }
    for (const [d, c] of near) {
      const P = pools[c.kind]; if (!P) continue;
      const im = d < NEAR && P.near.count < NEAR_N ? P.near : P.far.count < FAR_N ? P.far : null;
      if (!im) continue;
      const i = im.count++;
      qq.setFromAxisAngle(up, c.yaw);
      m4.compose(pp.set(c.x, c.y, c.z), qq, one);
      im.setMatrixAt(i, m4);
      col.setHex(c.paint);
      const pa = im.geometry.attributes.paintColor; pa.setXYZ(i, col.r, col.g, col.b);
    }
    for (const k in pools) for (const im of [pools[k].near, pools[k].far]) { im.instanceMatrix.needsUpdate = true; im.geometry.attributes.paintColor.needsUpdate = true; }
  }
  function update(dt, cam) {
    if (!cam) return;
    for (const m of lineMeshes) { const b = m.geometry.boundingSphere; m.visible = Math.hypot(b.center.x - cam.x, b.center.z - cam.z) < 450 + b.radius; }
    acc += dt;
    // (re-picked once the camera has moved 20 m, at most twice a second, or every 4 s)
    const moved = Math.hypot(cam.x - lastX, cam.z - lastZ);
    if (!(moved > 20 && acc > 0.5) && acc < 4) return;
    acc = 0; lastX = cam.x; lastZ = cam.z;
    refill(cam);
  }
  const stats = { lots: lots.length, stalls, kerbCars, shopSpill: shops.length, cars: cars.length, lineTris: Math.round(lineTris), kinds: Object.keys(pools).length };
  console.info('[lots]', JSON.stringify(stats));
  const api = { group, update, stats, cars };
  N.Lots = api;
  return api;
}

window.NYC.buildLots = buildLots;
})();
