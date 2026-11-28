(function () {
// cities/sf/js/main-streets.js
// A town's main shopping street dressed as what it really has (Mandi's Revenge: Chicago's State St in the Loop), at
// night above all: for MAIN_STREETS[town], every road graph edge of that name within R m of downtown, on its right-hand
// side (a two-way street's two edges dress both sides):
// - display windows: a pool of warm light on the pavement in front of the building face every 6 m (at night)
// - street lamps' pools on the pavement every 30 m
// - vertical blade signs (0.9 m wide, 0.15-1.05 m proud of the facade, 4-9.2 m up, every 24 m, their faces down the
//   street) and lit marquees (canopies 2 m deep over the sidewalk at 4 m, every 60 m) on the facades: original names (no real brand or logo; "THEATRE" in the old
//   style), bulbs chasing at night
// - CTA-style bus shelters (glass, a lit panel with no ad on it) and clusters of newspaper boxes (no marks) at the
//   kerb: none is solid, so no route or traffic lane is touched
// The crowd's blocks along it walk thicker (wagmi/street/crowd.js reads NYC.MainStreets.near(x, z)).
// buildMainStreets(scene, network) -> { group, near(x, z), stats } | null; ?mainstreet=0 none
const N = window.NYC, { THREE } = N;
const q = new URLSearchParams(location.search);
const MAIN_STREETS = {
  'us-1714000': [{ name: /^(N |S )?STATE ST$/i, r: 1150 }]
};
const FACE = 5.2; // m from the kerb to the shop fronts (State St's sidewalks)
const SIGNS = ['THEATRE', 'GRAND', 'LOOP', 'STATE', 'NOVA', 'LUXE', 'ROYALE', 'CINEMA'];

function hash(a, b) { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

function signTexture(word, hue) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#120d08'; g.fillRect(0, 0, 128, 512);
  g.strokeStyle = `hsl(${hue},90%,62%)`; g.lineWidth = 6; g.strokeRect(8, 8, 112, 496);
  g.fillStyle = `hsl(${hue},95%,70%)`;
  g.font = 'bold 60px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const L = word.split(''), step = Math.min(66, 470 / L.length);
  L.forEach((ch, i) => g.fillText(ch, 64, 256 - ((L.length - 1) * step) / 2 + i * step));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function buildMainStreets(scene, network) {
  const spec = N.PKG && MAIN_STREETS[N.PKG.id];
  if (!spec || !network || !network.edges || q.get('mainstreet') === '0') return null;
  const T = N.Terrain, ground = (x, z) => T.groundAt(x, z);
  const DT = N.PKG.downtown || { x: 0, z: 0 };
  const { onSidewalk } = network;
  const M = N.DATA && N.DATA.groundMask, MH = M && M.header;
  const maskAt = (x, z) => { if (!MH) return 1; const i = Math.floor((x - MH.originX) / MH.cell), j = Math.floor((z - MH.originZ) / MH.cell); return i < 0 || j < 0 || i >= MH.w || j >= MH.h ? -1 : M.mask[j * MH.w + i]; };
  const { smoothstep, float, vec3, vec2, uv, length: tlen, texture, sin, time, fract, step } = N.TSL;
  const night = N.cityUniforms && N.cityUniforms.uInteriorGlow ? smoothstep(0.4, 1.3, N.cityUniforms.uInteriorGlow) : float(0);
  const group = new THREE.Group(); group.name = 'MainStreets'; scene.add(group);
  const spill = [], pools = [], signs = [], marquees = [], shelters = [], boxes = [], lines = [];
  const stats = { edges: 0, spill: 0, signs: 0, marquees: 0, shelters: 0, boxes: 0 };
  for (const s of spec) {
  // (the street's own bearing, its edges' length-weighted axis: a short piece of it turning across a junction, or a
  // ramp of the same name, dresses nothing: a marquee stood across State St at Lake St)
  const mine = network.edges.filter((e) => !e.bore && e.name && s.name.test(e.name) && e.len > 10 && e.lanes && e.lanes.length &&
    Math.hypot(e.sx + e.dx * e.len / 2 - DT.x, e.sz + e.dz * e.len / 2 - DT.z) <= s.r);
  let axx = 0, axz = 0;
  for (const e of mine) { const sg = e.dz >= 0 ? 1 : -1; axx += e.dx * sg * e.len; axz += e.dz * sg * e.len; }
  const al = Math.hypot(axx, axz) || 1;
  for (const e of mine) {
    if (Math.abs(e.dx * axx / al + e.dz * axz / al) < Math.cos((20 * Math.PI) / 180)) continue;
    stats.edges++;
    const hi = Math.max(...e.lanes);
    for (let sv = 3; sv < e.len - 3; sv += 6) {
      const bx = e.sx + e.dx * sv, bz = e.sz + e.dz * sv;
      // the kerb (the first sidewalk past the outer lane) and the building face (past the sidewalk, the first thing
      // that is not walkable)
      // (a town's buildings are not in the network's obstacles, and a Loop sidewalk runs on into its plazas: the face
      // is taken FACE m past the kerb, the main street's sidewalk width)
      let kerb = null;
      for (let d = hi + 1.2; d <= e.half + 6; d += 0.25) { const px = bx + e.rx * d, pz = bz + e.rz * d; if (onSidewalk(px, pz)) { kerb = d; break; } }
      if (kerb === null) continue;
      // (the face: where the ground mask's sidewalk ends past the kerb, the shop fronts' line; FACE m at most)
      let face = kerb + FACE;
      for (let d = kerb + 0.5; d <= kerb + FACE; d += 0.25) { if (maskAt(bx + e.rx * d, bz + e.rz * d) !== 1) { face = d; break; } }
      if (face - kerb < 1.5) face = kerb + 1.5;
      const at = (o) => ({ x: bx + e.rx * o, z: bz + e.rz * o, y: ground(bx + e.rx * o, bz + e.rz * o) });
      const yaw = Math.atan2(e.dx, e.dz), k = Math.floor(sv / 6), hk = Math.floor(bx * 3) * 7 + Math.floor(bz * 3);
      // display window spill: on the pavement in front of the face, brightest at the glass
      const w = at(face - 2.0); spill.push(w.x, w.y, w.z, Math.atan2(-e.rx, -e.rz), 6.5, 4.2); stats.spill++;
      // lamp pools near the kerb every 30 m
      if (k % 5 === 0) { const p = at(kerb + 1.2); pools.push(p.x, p.y, p.z, yaw, 13, 13); }
      // a blade sign every 42 m (staggered), a marquee every 84 m
      const f = at(face - 0.25);
      if (k % 4 === 2) { signs.push({ x: f.x - e.rx * 0.6, y: f.y, z: f.z - e.rz * 0.6, yaw, word: SIGNS[Math.floor(hash(hk, 3) * SIGNS.length)], hue: Math.floor(hash(hk, 9) * 360) }); stats.signs++; }
      if (k % 10 === 6) { marquees.push({ x: f.x - e.rx * 1.0, y: f.y, z: f.z - e.rz * 1.0, yaw, rx: e.rx, rz: e.rz, out: e.dz * e.rx - e.dx * e.rz > 0 ? -1 : 1 }); stats.marquees++; }
      // a bus shelter every ~150 m, newspaper boxes near the block's corners
      if (k % 25 === 12 && face - kerb > 1.8) { const p = at(kerb + 1.5); shelters.push({ x: p.x, y: p.y, z: p.z, yaw }); stats.shelters++; }
      if ((sv < 10 || sv > e.len - 10) && hash(hk, 17) < 0.2) { for (let j = 0; j < 3; j++) { const p = at(kerb + 0.7); boxes.push({ x: p.x + e.dx * (j * 0.6 - 0.6), y: p.y, z: p.z + e.dz * (j * 0.6 - 0.6), yaw, c: [0x2f5d9a, 0xa8322a, 0x2e7d4f, 0xc9a227][(hk + j) & 3] }); stats.boxes++; } }
      lines.push(bx, bz);
    }
  }
  }
  if (!stats.edges) return null;
  // ---- the additive pools (spill and lamps): one instanced mesh each
  const poolMesh = (arr, colour, k, glass) => {
    if (!arr.length) return;
    const n = arr.length / 6, pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const d = glass ? uv().sub(vec2(0.5, 1.0)).mul(vec2(1.2, 1.0)) : uv().sub(0.5).mul(2), fall = float(1).sub(smoothstep(0.0, 1.0, tlen(d)));
    m.colorNode = vec3(...colour).mul(fall.mul(fall)).mul(night).mul(k);
    const im = new THREE.InstancedMesh(pg, m, n), m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) { const [x, y, z, yaw, a, b] = arr.slice(i * 6, i * 6 + 6); q4.setFromAxisAngle(up, yaw); m4.compose(v.set(x, y + 0.08, z), q4, sc.set(a, 1, b)); im.setMatrixAt(i, m4); }
    im.computeBoundingSphere(); group.add(im);
  };
  if (q.get('mspools') !== '0') { poolMesh(spill, [1.0, 0.78, 0.5], 1.7, true); poolMesh(pools, [1.0, 0.7, 0.42], 0.9, false); }
  // ---- blade signs and marquees: their parts merged by material (a handful of draws for the whole street)
  const merge = N.Addons && N.Addons.mergeGeometries;
  const bake = new Map(); // material -> [geometries]
  const put = (mat, geo, obj) => { (obj.parent || obj).updateMatrixWorld(true); const g = geo.clone(); g.applyMatrix4(obj.matrixWorld); if (g.index) { const ng = g.toNonIndexed(); g.dispose(); bake.has(mat) ? bake.get(mat).push(ng) : bake.set(mat, [ng]); } else { bake.has(mat) ? bake.get(mat).push(g) : bake.set(mat, [g]); } };
  const body = new THREE.MeshStandardNodeMaterial({ color: 0x1a1612, roughness: 0.6, metalness: 0.4 });
  const signMats = SIGNS.slice(0, 6).map((word, i) => {
    const t = signTexture(word, [8, 35, 50, 190, 330, 280][i]);
    const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    // (a chase of the bulbs up the sign at night; by day a painted sign)
    const chase = step(0.5, fract(uv().y.mul(24).sub(time.mul(2.0))));
    mat.colorNode = texture(t).rgb.mul(float(0.6).add(night.mul(float(2.6).add(chase.mul(0.9)))));
    return mat;
  });
  const H = 5.2, W = 0.9, bodyG = new THREE.BoxGeometry(W, H, 0.3), faceG = new THREE.PlaneGeometry(W * 0.92, H * 0.94);
  const tmp = new THREE.Object3D(), child = new THREE.Object3D(); tmp.add(child);
  for (const s of signs) {
    const mat = signMats[Math.floor(hash(Math.floor(s.x), Math.floor(s.z)) * signMats.length)];
    tmp.position.set(s.x, s.y + 4.0, s.z); tmp.rotation.set(0, s.yaw, 0);
    // (a blade: it stands out from the facade across the pavement, its two faces read up and down the street)
    child.position.set(0, H / 2, 0); child.rotation.set(0, 0, 0); put(body, bodyG, child);
    for (const side of [-1, 1]) { child.position.set(0, H / 2, side * 0.16); child.rotation.set(0, side > 0 ? 0 : Math.PI, 0); put(mat, faceG, child); }
  }
  if (marquees.length && q.get('msmarq') !== '0') {
    const fascia = new THREE.MeshBasicNodeMaterial();
    const bulbs = float(1).sub(smoothstep(0.12, 0.22, tlen(fract(uv().mul(vec2(60, 2))).sub(0.5)))).mul(step(0.5, fract(uv().x.mul(6).sub(time.mul(1.5)))).mul(0.6).add(0.4));
    fascia.colorNode = vec3(1.0, 0.86, 0.55).mul(float(0.06).add(night.mul(float(0.05).add(bulbs.mul(0.5)))));
    const soffit = new THREE.MeshBasicNodeMaterial();
    // (its underside: a dark ceiling of bulbs, a dot every 0.4 m: a flat lit soffit read as a glowing slab from the
    // pavement under it)
    const dot = float(1).sub(smoothstep(0.08, 0.16, tlen(fract(uv().mul(vec2(5, 22))).sub(0.5))));
    soffit.colorNode = vec3(1.0, 0.85, 0.6).mul(float(0.02).add(dot.mul(night.mul(1.4))));
    const top = new THREE.MeshStandardNodeMaterial({ color: 0x2a2420, roughness: 0.7 });
    const boxG = new THREE.BoxGeometry(2.0, 1.0, 9), fG = new THREE.PlaneGeometry(9, 0.4), sG = new THREE.PlaneGeometry(1.9, 8.8);
    for (const m of marquees) {
      tmp.position.set(m.x, m.y + 4.0, m.z); tmp.rotation.set(0, m.yaw, 0);
      child.position.set(0, 0, 0); child.rotation.set(0, 0, 0); put(top, boxG, child);
      // (its fascia on the street side only: one on the building side lit the facade over it as a long bright band)
      if (q.get('msfascia') !== '0') { const side = m.out; child.position.set(side * 1.01, 0, 0); child.rotation.set(0, side * Math.PI / 2, 0); put(fascia, fG, child); }
      child.position.set(0, -0.51, 0); child.rotation.set(Math.PI / 2, 0, 0); put(soffit, sG, child);
    }
  }
  for (const [mat, list] of bake) { const g = merge(list, false); if (!g) continue; g.computeBoundingSphere(); const m = new THREE.Mesh(g, mat); m.castShadow = mat === body; group.add(m); }
  // ---- bus shelters and newspaper boxes: merged boxes (no colliders)
  const P = [], C = [], G = [], GC = [], tint = new THREE.Color();
  const bx = (A, Cc, x, y0, y1, z, ux, uz, along, across, col) => {
    const ax = (ux * along) / 2, az = (uz * along) / 2, cx = (-uz * across) / 2, cz = (ux * across) / 2;
    const Q = [[x - ax - cx, z - az - cz], [x + ax - cx, z + az - cz], [x + ax + cx, z + az + cz], [x - ax + cx, z - az + cz]];
    tint.setHex(col);
    const quad = (a, b, c, d) => { A.push(...a, ...b, ...c, ...a, ...c, ...d); for (let i = 0; i < 6; i++) Cc.push(tint.r, tint.g, tint.b); };
    for (let i = 0; i < 4; i++) { const p = Q[i], r = Q[(i + 1) % 4]; quad([p[0], y0, p[1]], [p[0], y1, p[1]], [r[0], y1, r[1]], [r[0], y0, r[1]]); }
    quad([Q[0][0], y1, Q[0][1]], [Q[3][0], y1, Q[3][1]], [Q[2][0], y1, Q[2][1]], [Q[1][0], y1, Q[1][1]]);
  };
  for (const s of shelters) {
    const ux = Math.sin(s.yaw), uz = Math.cos(s.yaw), vx = -uz, vz = ux;
    bx(P, C, s.x, s.y + 2.45, s.y + 2.6, s.z, ux, uz, 4.4, 1.7, 0x3a3f44); // roof
    bx(P, C, s.x + vx * 0.8, s.y, s.y + 2.45, s.z + vz * 0.8, ux, uz, 4.2, 0.06, 0x6a7a86); // back glass
    for (const t of [-2.1, 2.1]) bx(P, C, s.x + ux * t, s.y, s.y + 2.45, s.z + uz * t, ux, uz, 0.06, 1.6, 0x6a7a86); // ends
    bx(G, GC, s.x + ux * 2.15 + vx * 0.1, s.y + 0.4, s.y + 2.2, s.z + uz * 2.15 + vz * 0.1, ux, uz, 0.1, 1.2, 0xbfd6ff); // the lit panel, blank
  }
  for (const b of boxes) { const ux = Math.sin(b.yaw), uz = Math.cos(b.yaw); bx(P, C, b.x, b.y, b.y + 1.05, b.z, ux, uz, 0.5, 0.45, b.c); }
  const mk = (A, Cc, mat) => { if (!A.length) return; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(A, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3)); g.computeVertexNormals(); g.computeBoundingSphere(); const m = new THREE.Mesh(g, mat); m.receiveShadow = true; group.add(m); };
  mk(P, C, new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.2, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
  const lit = new THREE.MeshBasicNodeMaterial({ vertexColors: true }); lit.colorNode = N.TSL.attribute('color', 'vec3').mul(float(0.3).add(night.mul(1.3)));
  mk(G, GC, lit);
  // ---- for the crowd: is (x, z) beside the street
  const cells = new Map();
  for (let i = 0; i < lines.length; i += 2) { const k = Math.floor(lines[i] / 40) * 65536 + Math.floor(lines[i + 1] / 40); let l = cells.get(k); if (!l) cells.set(k, (l = [])); l.push(lines[i], lines[i + 1]); }
  const near = (x, z, r = 30) => { for (let ix = Math.floor((x - r) / 40); ix <= Math.floor((x + r) / 40); ix++) for (let iz = Math.floor((z - r) / 40); iz <= Math.floor((z + r) / 40); iz++) { const l = cells.get(ix * 65536 + iz); if (l) for (let i = 0; i < l.length; i += 2) if (Math.hypot(l[i] - x, l[i + 1] - z) < r) return true; } return false; };
  console.info('[mainstreet]', JSON.stringify(stats));
  const api = { group, near, stats };
  N.MainStreets = api;
  return api;
}

window.NYC.buildMainStreets = buildMainStreets;
})();
