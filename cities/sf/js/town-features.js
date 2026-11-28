(function () {
// cities/sf/js/town-features.js
// A town's landmark structures from its package's GEO.features (tools/hometown/features.py), and its waterfront:
// - wheel   a Ferris wheel standing in its mapped footprint (the map's building of it is dropped: suppressBuildings):
//           two rims, spokes, hub on A-frame legs, gondolas that turn with it, rim lights that run through the colours
//           at night (Navy Pier's Centennial Wheel: 60 m, 42 gondolas)
// - stadium a bowl in the mapped outline (the map's block of it is dropped): outer wall with its piers, the stands
//           raked down to the field, the field, four light masts lit at night (Soldier Field)
// - pier    its edge: a timber boardwalk band, a rail and lamps along the water side
// - water   (CITY-BUILDER item 4, the waterfront) a river wall or a lakefront revetment along every water edge within
//           WATER_R m of downtown: the wall's face down into the water, a stone coping; a rail and lamps where a
//           riverwalk (a park so named) or the pier meets the water
//   suppressBuildings(DATA): before the buildings are built (data-loader.js), every building record whose outline's
//   centre is inside a wheel's or a stadium's footprint has no height
//   buildTownFeatures(scene) -> { group, colliders, update(dt, camPos), stats } | null; ?features=0 none
const N = window.NYC, { THREE } = N;
const q = new URLSearchParams(location.search);
const WATER_R = 2600, LAMP_STEP = 12, RAIL_H = 1.05;

function feats() { return (N.GEO && N.GEO.features) || []; }
function ringPts(f) { const r = []; for (let i = 0; i + 1 < f.ring.length; i += 2) r.push({ x: f.ring[i], z: f.ring[i + 1] }); return r; }
function inRing(r, x, z) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i].z > z) !== (r[j].z > z) && x < ((r[j].x - r[i].x) * (z - r[i].z)) / (r[j].z - r[i].z) + r[i].x) c = !c;
  return c;
}

function suppressBuildings(DATA) {
  if (q.get('features') === '0') return 0;
  const F = feats().filter((f) => f.kind === 'wheel' || f.kind === 'stadium');
  if (!F.length || !DATA || !DATA.buildings) return 0;
  const B = DATA.buildings, fl = B.header.fields, nf = fl.length, T = B.table, V = B.verts;
  const iB = fl.indexOf('base'), iR = fl.indexOf('roof'), iP = fl.indexOf('peak'), iS = fl.indexOf('ringStart'), iC = fl.indexOf('ringCount'), iM = fl.indexOf('massCount');
  let n = 0;
  for (let k = 0; k * nf < T.length; k++) {
    const o = k * nf, s = T[o + iS], c = T[o + iC];
    if (!(c > 0)) continue;
    let cx = 0, cz = 0;
    for (let j = 0; j < c; j++) { cx += V[(s + j) * 2]; cz += V[(s + j) * 2 + 1]; }
    cx /= c; cz /= c;
    for (const f of F) {
      const hit = f.kind === 'wheel' ? Math.abs((cx - f.x) * -f.az + (cz - f.z) * f.ax) < 8 && Math.abs((cx - f.x) * f.ax + (cz - f.z) * f.az) < f.span / 2 + 4
        : inRing(f._r || (f._r = ringPts(f)), cx, cz);
      if (hit) { T[o + iR] = T[o + iB] + 0.05; T[o + iP] = T[o + iB] + 0.05; n++; break; }
    }
  }
  if (n) console.info('[landmarks2] dropped', n, 'mapped blocks under the wheel and stadium');
  return n;
}

function buildTownFeatures(scene) {
  if (q.get('features') === '0') return null;
  const T = N.Terrain, wl = Number.isFinite(T.waterLevel) ? T.waterLevel : 0;
  const ground = (x, z) => T.groundAt(x, z);
  const group = new THREE.Group();
  group.name = 'TownFeatures';
  scene.add(group);
  const { smoothstep, color: tcolor, float, uniform, sin, time, vec3, positionLocal, mix } = N.TSL;
  const night = N.cityUniforms && N.cityUniforms.uInteriorGlow ? smoothstep(0.4, 1.3, N.cityUniforms.uInteriorGlow) : float(0);
  const colliders = [], updates = [];
  const stats = {};
  // merged vertex-coloured boxes (as elevated.js)
  const pos = [], col = [], glow = [], gcol = [];
  const tint = new THREE.Color();
  function box(cx, cy0, cy1, cz, ux, uz, along, across, colour, lit = false) {
    const ax = (ux * along) / 2, az = (uz * along) / 2, bx = (-uz * across) / 2, bz = (ux * across) / 2;
    const P = [[cx - ax - bx, cz - az - bz], [cx + ax - bx, cz + az - bz], [cx + ax + bx, cz + az + bz], [cx - ax + bx, cz - az + bz]];
    const A = lit ? glow : pos, Cc = lit ? gcol : col;
    tint.setHex(colour);
    const quad = (a, b, d, e) => { A.push(...a, ...b, ...d, ...a, ...d, ...e); for (let i = 0; i < 6; i++) Cc.push(tint.r, tint.g, tint.b); };
    for (let i = 0; i < 4; i++) { const p = P[i], r = P[(i + 1) % 4]; quad([p[0], cy0, p[1]], [p[0], cy1, p[1]], [r[0], cy1, r[1]], [r[0], cy0, r[1]]); }
    quad([P[0][0], cy1, P[0][1]], [P[3][0], cy1, P[3][1]], [P[2][0], cy1, P[2][1]], [P[1][0], cy1, P[1][1]]);
    quad([P[0][0], cy0, P[0][1]], [P[1][0], cy0, P[1][1]], [P[2][0], cy0, P[2][1]], [P[3][0], cy0, P[3][1]]);
  }
  function tri(a, b, c, colour) { tint.setHex(colour); pos.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) col.push(tint.r, tint.g, tint.b); }
  const quad4 = (a, b, c, d, colour) => { tri(a, b, c, colour); tri(a, c, d, colour); };

  const dt0 = N.PKG && N.PKG.downtown ? N.PKG.downtown : { x: 0, z: 0 };
  const F = feats();

  // ---- the wheel
  for (const f of F.filter((f) => f.kind === 'wheel')) {
    const g0 = ground(f.x, f.z), H = f.h || 60, R = H * 0.47, hubY = g0 + H - R - 0.6;
    const wg = new THREE.Group();
    wg.position.set(f.x, 0, f.z);
    wg.rotation.y = Math.atan2(f.ax, f.az) - Math.PI / 2; // (local x along the wheel's plane)
    group.add(wg);
    const steel = new THREE.MeshStandardNodeMaterial({ color: 0xe8ebee, roughness: 0.35, metalness: 0.55 });
    // legs: two A-frames, one each side of the wheel, from the deck to the hub
    const legs = new THREE.Group();
    const legG = new THREE.CylinderGeometry(0.45, 0.7, 1, 8);
    for (const sz of [-3.6, 3.6]) for (const sx of [-1, 1]) {
      const a = new THREE.Vector3(sx * R * 0.42, g0, sz * 1.6), b = new THREE.Vector3(0, hubY, sz);
      const m = new THREE.Mesh(legG, steel);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.scale.set(1, a.distanceTo(b), 1);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      m.castShadow = true; legs.add(m);
    }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 8.4, 16), steel);
    axle.rotation.x = Math.PI / 2; axle.position.set(0, hubY, 0); legs.add(axle);
    wg.add(legs);
    // the turning part: rims, spokes, gondolas, lights
    const rot = new THREE.Group();
    rot.position.set(0, hubY, 0);
    wg.add(rot);
    const rimG = new THREE.TorusGeometry(R, 0.55, 6, 96);
    for (const z of [-2.2, 2.2]) { const m = new THREE.Mesh(rimG, steel); m.position.z = z; m.castShadow = true; rot.add(m); }
    const inner = new THREE.TorusGeometry(R * 0.93, 0.3, 5, 96);
    for (const z of [-2.2, 2.2]) { const m = new THREE.Mesh(inner, steel); m.position.z = z; rot.add(m); }
    // spokes: 32 per side, cable-thin
    const spokeG = new THREE.CylinderGeometry(0.09, 0.09, R, 4);
    spokeG.translate(0, R / 2, 0);
    const NS = 32, spokes = new THREE.InstancedMesh(spokeG, steel, NS * 2);
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    for (let i = 0; i < NS * 2; i++) { e.set(0, 0, ((i % NS) / NS) * Math.PI * 2 + (i >= NS ? Math.PI / NS : 0)); qq.setFromEuler(e); m4.compose(v.set(0, 0, i >= NS ? 2.2 : -2.2), qq, one); spokes.setMatrixAt(i, m4); }
    rot.add(spokes);
    // rim lights: an emissive strip on each rim whose hue runs round the wheel at night
    const lightMat = new THREE.MeshBasicNodeMaterial({ color: 0x000000 });
    const ang = N.TSL.atan(positionLocal.y, positionLocal.x);
    const hue = sin(ang.mul(3).add(time.mul(1.2))).mul(0.5).add(0.5);
    const hue2 = sin(ang.mul(2).sub(time.mul(0.7)).add(2)).mul(0.5).add(0.5);
    lightMat.colorNode = mix(vec3(1.0, 0.25, 0.55), vec3(0.2, 0.55, 1.0), hue).mul(mix(float(0.75), float(1.25), hue2)).mul(float(0.15).add(night.mul(2.6)));
    const lightG = new THREE.TorusGeometry(R + 0.62, 0.16, 4, 128);
    for (const z of [-2.2, 2.2]) { const m = new THREE.Mesh(lightG, lightMat); m.position.z = z; rot.add(m); }
    const spokeLight = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, R * 0.9, 3).translate(0, R * 0.48, 0), lightMat, 16);
    for (let i = 0; i < 16; i++) { e.set(0, 0, (i / 16) * Math.PI * 2); qq.setFromEuler(e); m4.compose(v.set(0, 0, 2.4), qq, one); spokeLight.setMatrixAt(i, m4); }
    rot.add(spokeLight);
    // gondolas: 42, hanging level as the wheel turns
    const NG = 42;
    const gondG = new THREE.CapsuleGeometry(1.15, 1.6, 3, 8);
    const gondMat = new THREE.MeshStandardNodeMaterial({ color: 0xdfe6ea, roughness: 0.25, metalness: 0.3 });
    gondMat.emissiveNode = tcolor(0xfff0d0).mul(night.mul(0.7));
    const gond = new THREE.InstancedMesh(gondG, gondMat, NG);
    gond.castShadow = true;
    wg.add(gond);
    const RPM = 0.6;
    let phi = 0;
    const place = () => {
      for (let i = 0; i < NG; i++) {
        const a = phi + (i / NG) * Math.PI * 2;
        m4.compose(v.set(Math.cos(a) * (R - 0.2), hubY + Math.sin(a) * (R - 0.2) - 2.3, 0), qq.identity(), one);
        gond.setMatrixAt(i, m4);
      }
      gond.instanceMatrix.needsUpdate = true;
    };
    place();
    let acc = 0;
    updates.push((dt, cam) => {
      phi += (dt * RPM * Math.PI * 2) / 60;
      rot.rotation.z = phi;
      acc += dt;
      if (acc > 0.1 && (!cam || Math.hypot(cam.x - f.x, cam.z - f.z) < 1500)) { acc = 0; place(); }
    });
    // a lit sign-free ticket booth / base slab
    box(f.x, g0, g0 + 0.6, f.z, f.ax, f.az, R * 1.1, 12, 0x9a9890);
    colliders.push(...[-1, 1].map((sx) => {
      const x = f.x + f.ax * sx * R * 0.42, z = f.z + f.az * sx * R * 0.42;
      return { minX: x - 3, maxX: x + 3, minZ: z - 3, maxZ: z + 3, minY: g0 - 1, maxY: g0 + 12, obb: { cx: x, cz: z, hx: 1.2, hz: 4.5, cs: f.az, sn: f.ax } };
    }));
    stats.wheel = f.name;
  }

  // ---- the stadium bowl
  for (const f of F.filter((f) => f.kind === 'stadium')) {
    const r = ringPts(f);
    if (r.length < 8) continue;
    const g0 = ground(f.x, f.z), H = Math.max(18, f.h || 25);
    // (the field: the ring shrunk toward its centre; the stands from its edge up to the outer wall's top)
    const k = 0.52;
    const inner = r.map((p) => ({ x: f.x + (p.x - f.x) * k, z: f.z + (p.z - f.z) * k }));
    const WALL = 0xc9c2b2, SEAT = 0x4a5a6e, SEAT2 = 0x3c4a5c, FIELD = 0x3f7a3a, PIER = 0xd8d1c0;
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length], ia = inner[i], ib = inner[(i + 1) % r.length];
      // outer wall (facing out), the stands (raked), the wall's top
      quad4([a.x, g0, a.z], [b.x, g0, b.z], [b.x, g0 + H, b.z], [a.x, g0 + H, a.z], WALL);
      quad4([a.x, g0 + H, a.z], [b.x, g0 + H, b.z], [ib.x, g0 + 3, ib.z], [ia.x, g0 + 3, ia.z], i % 2 ? SEAT : SEAT2);
      quad4([ia.x, g0 + 3, ia.z], [ib.x, g0 + 3, ib.z], [ib.x, g0 + 0.2, ib.z], [ia.x, g0 + 0.2, ia.z], 0x2a2f33);
      // the piers of the colonnade on the outer wall, every other edge
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L > 3) for (let t = 2; t < L - 1; t += 6) {
        const x = a.x + ((b.x - a.x) * t) / L, z = a.z + ((b.z - a.z) * t) / L, ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
        box(x + uz * 0.6, g0, g0 + H * 0.62, z - ux * 0.6, ux, uz, 1.4, 1.3, PIER);
      }
      // the field
      tri([f.x, g0 + 0.25, f.z], [ib.x, g0 + 0.25, ib.z], [ia.x, g0 + 0.25, ia.z], FIELD);
    }
    // four light masts with lit heads, at the outer wall's corners of its bounding box's diagonal
    const xs = r.map((p) => p.x), zs = r.map((p) => p.z);
    const cx = f.x, cz = f.z, ex = (Math.max(...xs) - Math.min(...xs)) / 2, ez = (Math.max(...zs) - Math.min(...zs)) / 2;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = cx + sx * ex * 0.62, z = cz + sz * ez * 0.62;
      box(x, g0 + H, g0 + H + 22, z, 1, 0, 0.9, 0.9, 0x8d9296);
      box(x, g0 + H + 22, g0 + H + 25, z, sx, 0, 6, 1.0, 0xffffff, true);
    }
    // the wall as colliders (one per edge)
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L < 0.5) continue;
      const ux = (b.x - a.x) / L, uz = (b.z - a.z) / L, mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      colliders.push({ minX: Math.min(a.x, b.x) - 1, maxX: Math.max(a.x, b.x) + 1, minZ: Math.min(a.z, b.z) - 1, maxZ: Math.max(a.z, b.z) + 1, minY: g0 - 1, maxY: g0 + H, obb: { cx: mx, cz: mz, hx: 0.6, hz: L / 2, cs: uz, sn: ux } });
    }
    stats.stadium = (stats.stadium || 0) + 1;
  }

  // ---- the waterfront: walls along the water's edges near downtown; rails and lamps by a riverwalk or a pier
  const walks = [];
  for (const p of (N.GEO && N.GEO.parks) || []) if (/riverwalk/i.test(p.name || '')) for (const rg of p.rings || []) { const pts = []; for (let i = 0; i + 1 < rg.length; i += 2) pts.push({ x: rg[i], z: rg[i + 1] }); walks.push(pts); }
  // (a marina mapped as a pier is water inside its ring: Navy Pier Marina. Only the piers themselves)
  const piers = F.filter((f) => f.kind === 'pier' && !/marina/i.test(f.name || '')).map(ringPts);
  const nearWalk = (x, z) => walks.some((w) => inRing(w, x, z) || w.some((p) => Math.hypot(p.x - x, p.z - z) < 6)) || piers.some((pr) => inRing(pr, x, z));
  let wallM = 0, railM = 0, lamps = 0;
  const pools = []; // [x, y, z, yaw, size across, size along] additive light pools (walks, pier, the water's reflections)
  const COPING = 0xb8b2a4, FACE = 0x6d6a62, RAIL = 0x30363a;
  for (const wt of (N.GEO && N.GEO.water) || []) {
    const rg = wt.ring || [];
    let since = 0;
    for (let i = 0; i + 3 < rg.length + 2; i += 2) {
      const ax = rg[i], az = rg[i + 1], bx = rg[(i + 2) % rg.length], bz = rg[(i + 3) % rg.length];
      const L = Math.hypot(bx - ax, bz - az);
      if (!(L > 0.5) || L > 400) continue;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (Math.hypot(mx - dt0.x, mz - dt0.z) > WATER_R) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L;
      // (land side: the side whose ground stands over the water)
      const nx = -uz, nz = ux;
      const side = T.heightAt(mx + nx * 3, mz + nz * 3) > T.heightAt(mx - nx * 3, mz - nz * 3) ? 1 : -1;
      const lx = nx * side, lz = nz * side;
      const top = Math.max(ground(mx + lx * 2, mz + lz * 2), wl + 0.6);
      // the wall's face (from 2 m under the water to the coping), the coping on the bank
      box(mx - lx * 0.25, wl - 2, top, mz - lz * 0.25, ux, uz, L + 0.05, 0.5, FACE);
      box(mx + lx * 0.4, top - 0.05, top + 0.22, mz + lz * 0.4, ux, uz, L + 0.05, 0.9, COPING);
      wallM += L;
      if (nearWalk(mx + lx * 3, mz + lz * 3)) {
        // the rail: posts every 2 m, a top rail; lamps every LAMP_STEP m
        box(mx + lx * 0.5, top + RAIL_H - 0.06, top + RAIL_H + 0.02, mz + lz * 0.5, ux, uz, L, 0.07, RAIL);
        box(mx + lx * 0.5, top + 0.5, top + 0.55, mz + lz * 0.5, ux, uz, L, 0.04, RAIL);
        for (let t = 1; t < L; t += 2) box(ax + ux * t + lx * 0.5, top, top + RAIL_H, az + uz * t + lz * 0.5, ux, uz, 0.06, 0.06, RAIL);
        railM += L;
        since += L;
        if (since > LAMP_STEP) {
          since = 0; lamps++;
          const x = mx + lx * 1.2, z = mz + lz * 1.2;
          box(x, top, top + 4.2, z, ux, uz, 0.14, 0.14, 0x22282b);
          box(x, top + 4.2, top + 4.75, z, ux, uz, 0.55, 0.55, 0xffffff, true);
          // its pool on the walk, and its reflection on the water: a streak out from the wall toward the far bank
          pools.push(mx + lx * 4, top, mz + lz * 4, Math.atan2(ux, uz), 13, 13);
          pools.push(mx - lx * 9, wl - 0.02, mz - lz * 9, Math.atan2(ux, uz), 1.8, 16, 1);
        }
      }
    }
  }
  // ---- the pier's boardwalk edge: a timber band, rail and lamps round its ring
  for (const pr of piers) {
    let since = 0;
    // (its long axis: the bearing its longest edges run)
    let pierAx = 1, pierAz = 0, best = 0;
    for (let i = 0; i < pr.length; i++) { const a = pr[i], b = pr[(i + 1) % pr.length], L = Math.hypot(b.x - a.x, b.z - a.z); if (L > best) { best = L; pierAx = (b.x - a.x) / L; pierAz = (b.z - a.z) / L; } }
    for (let i = 0; i < pr.length; i++) {
      const a = pr[i], b = pr[(i + 1) % pr.length], L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L < 1) continue;
      const ux = (b.x - a.x) / L, uz = (b.z - a.z) / L, mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      const nx = -uz, nz = ux, side = inRing(pr, mx + nx * 3, mz + nz * 3) ? 1 : -1, lx = nx * side, lz = nz * side;
      const top = Math.max(ground(mx + lx * 4, mz + lz * 4), wl + 0.8);
      box(mx + lx * 2.2, top - 0.02, top + 0.06, mz + lz * 2.2, ux, uz, L, 4.0, 0x7a5e44);
      box(mx + lx * 0.15, wl - 1.5, top, mz + lz * 0.15, ux, uz, L, 0.3, 0x4a3c30);
      box(mx + lx * 0.3, top + RAIL_H - 0.06, top + RAIL_H + 0.02, mz + lz * 0.3, ux, uz, L, 0.08, RAIL);
      for (let t = 1; t < L; t += 2.5) box(a.x + ux * t + lx * 0.3, top, top + RAIL_H, a.z + uz * t + lz * 0.3, ux, uz, 0.07, 0.07, RAIL);
      since += L;
      // string lights along the boardwalk at 3.4 m (a lit band at night), its posts every 10 m with a lamp and its pool
      box(mx + lx * 0.6, top + 3.39, top + 3.42, mz + lz * 0.6, ux, uz, L, 0.03, 0x6a5232, true);
      if (since > 10) { since = 0; lamps++; const x = mx + lx * 0.6, z = mz + lz * 0.6; box(x, top, top + 4.0, z, ux, uz, 0.14, 0.14, 0x22282b); box(x, top + 4.0, top + 4.3, z, ux, uz, 0.3, 0.3, 0xffffff, true); pools.push(mx + lx * 3, top, mz + lz * 3, Math.atan2(ux, uz), 16, 16); }
      // the pier's frontage: a lit arcade band (shop windows, warm at night) 9 m in from the water along its long sides
      if (L > 6 && Math.abs(ux * pierAx + uz * pierAz) > 0.8) for (let t = 2; t + 3 < L; t += 5) box(a.x + ux * (t + 1.5) + lx * 9, top + 0.8, top + 2.4, a.z + uz * (t + 1.5) + lz * 9, ux, uz, 3.0, 0.12, 0x2c2012, true);
    }
  }
  stats.wallKm = +(wallM / 1000).toFixed(2); stats.railKm = +(railM / 1000).toFixed(2); stats.lamps = lamps;

  // the pools of light on the pier's walk (additive, at night only)
  if (pools.length) {
    // (entries of 6 numbers; a reflection on the water has a 7th, 1: its long axis across the wall, out over the water)
    const P = []; for (let i = 0; i < pools.length;) { const refl = pools[i + 6] === 1; P.push(pools.slice(i, i + 6).concat(refl ? 1 : 0)); i += refl ? 7 : 6; }
    const n = P.length, pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
    const pm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const r = N.TSL.length(N.TSL.uv().sub(0.5)).mul(2), fall = float(1).sub(smoothstep(0.1, 1.0, r));
    pm.colorNode = vec3(1.0, 0.75, 0.45).mul(fall.mul(fall)).mul(night).mul(0.85);
    const im = new THREE.InstancedMesh(pg, pm, n), m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v4 = new THREE.Vector3(), s4 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) { const [x, y, z, yaw, a, b, refl] = P[i]; q4.setFromAxisAngle(up, yaw + (refl ? Math.PI / 2 : 0)); m4.compose(v4.set(x, y + 0.08, z), q4, s4.set(a, 1, b)); im.setMatrixAt(i, m4); }
    im.computeBoundingSphere(); group.add(im);
    stats.pools = n;
  }
  // ---- meshes
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });
  const glowMat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.5 });
  glowMat.emissiveNode = N.TSL.attribute('color', 'vec3').mul(tcolor(0xffe2b0)).mul(float(0.05).add(night.mul(1.6)));
  const add = (P, Cc, m, shadow) => {
    if (!P.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
    g.computeVertexNormals(); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    group.add(mesh);
    stats.tris = (stats.tris || 0) + P.length / 9;
  };
  add(pos, col, mat, true);
  add(glow, gcol, glowMat, false);
  console.info('[landmarks2]', JSON.stringify(stats));
  function update(dt, cam) { for (const u of updates) u(dt, cam); }
  const api = { group, colliders, update, stats };
  N.TownFeatures = api;
  return api;
}

Object.assign(window.NYC, { buildTownFeatures, suppressTownFeatureBuildings: suppressBuildings });
})();
