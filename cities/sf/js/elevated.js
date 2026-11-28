(function () {
// cities/sf/js/elevated.js
// A town's elevated railway (Chicago's L) from its package's GEO.elevated (tools/hometown/features.py: the map's
// rapid-transit tracks on a level of 1 or more, or on a bridge). Built once the road network stands:
// - Each track: two plate girders under it, a tie bed and its two rails on top, DECK_TOP m over the ground (the ground
//   under it smoothed along the track; over water the banks' height), ramping down to the ground over RAMP m at a
//   loose end (an incline into a subway or onto an embankment).
// - Bents every BENT m across all the tracks there (two to four, found within PAIR m of each other): a cross girder on
//   two steel columns with knee braces. A column that would stand in a roadway steps out to the kerb (Lake St's, Wells
//   St's, Wabash Ave's and Van Buren St's L stand over the street, its columns at the kerbs), so the street under it is
//   drivable: nothing but the columns is solid, the deck's underside is over 5 m up.
// - A passing train: four lit cars along the longest run of track near downtown, back and forth (?ltrain=0 none).
// - Chunked by CELL m, each chunk hidden beyond FAR m from the camera; ?elevated=0 builds nothing.
//   buildElevated(scene, network) -> { group, colliders, tracks, update(dt, camPos), stats, underAt(x, z) } | null
const N = window.NYC, { THREE } = N;
const DECK_TOP = 6.6, GIRDER = 1.45, TRACK_W = 2.7, RAIL_GAUGE = 1.435;
const REACH_DT = 4000, BENT = 15, PAIR = 7.5, RAMP = 70, CELL = 256, FAR = 1100, KERB_OUT = 0.8;
const STEEL = 0x3d4541, STEEL_D = 0x2a302d, FLANGE = 0x5d6763, TIE = 0x2b2622, RAIL = 0x8d8a85, CONCRETE = 0x8a857a;
const q = new URLSearchParams(location.search);

function buildElevated(scene, network) {
  const raw = N.GEO && N.GEO.elevated;
  if (!raw || !raw.length || q.get('elevated') === '0') return null;
  const T = N.Terrain, wl = Number.isFinite(T.waterLevel) ? T.waterLevel : 0;
  const ground = (x, z) => T.groundAt(x, z);
  const wet = (x, z) => T.heightAt(x, z) < wl + 0.05;
  const edges = (network && network.edges) || [];
  // (the road network's edges by 64 m cell, for the kerb search)
  const ecell = new Map();
  for (const e of edges) {
    if (e.bore) continue;
    const ex = e.x0 + e.dx * e.span, ez = e.z0 + e.dz * e.span, r = e.half + 2;
    for (let ix = Math.floor((Math.min(e.x0, ex) - r) / 64); ix <= Math.floor((Math.max(e.x0, ex) + r) / 64); ix++)
      for (let iz = Math.floor((Math.min(e.z0, ez) - r) / 64); iz <= Math.floor((Math.max(e.z0, ez) + r) / 64); iz++) {
        const k = ix * 65536 + iz; let l = ecell.get(k); if (!l) ecell.set(k, (l = [])); l.push(e);
      }
  }
  const onRoad = (x, z, pad = 0) => {
    for (const e of ecell.get(Math.floor(x / 64) * 65536 + Math.floor(z / 64)) || []) {
      const t = (x - e.x0) * e.dx + (z - e.z0) * e.dz;
      if (t > -pad && t < e.span + pad && Math.abs((x - e.x0) * e.rx + (z - e.z0) * e.rz) < e.half + pad) return true;
    }
    return false;
  };

  // ---- tracks: polylines with arc length, heights along them (those within REACH_DT m of downtown: the far branches
  // are behind the city from anywhere a story goes, and cost a phone memory)
  const DT = (N.PKG && N.PKG.downtown) || { x: 0, z: 0 };
  const tracks = raw.map((r, i) => {
    const pts = [];
    for (let k = 0; k + 1 < r.p.length; k += 2) pts.push({ x: r.p[k], z: r.p[k + 1] });
    const s = [0];
    for (let k = 1; k < pts.length; k++) s.push(s[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z));
    return { i, name: r.name, cls: r.cls, pts, s, len: s[s.length - 1] };
  }).filter((t) => t.len > 3 && t.pts.some((p) => Math.hypot(p.x - DT.x, p.z - DT.z) < REACH_DT));
  const at = (t, u) => {
    u = Math.max(0, Math.min(t.len, u));
    let k = 1; while (k < t.s.length - 1 && t.s[k] < u) k++;
    const a = t.pts[k - 1], b = t.pts[k], L = t.s[k] - t.s[k - 1] || 1, f = (u - t.s[k - 1]) / L;
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, dx: (b.x - a.x) / L, dz: (b.z - a.z) / L };
  };
  // (loose ends: an end no other track's end or line meets within 3 m ramps down)
  const ends = [];
  for (const t of tracks) { ends.push({ t, e: 0, p: t.pts[0] }, { t, e: 1, p: t.pts[t.pts.length - 1] }); }
  const near = (p, self) => tracks.some((o) => o !== self && o.pts.some((v, k) => k > 0 && segDist(p, o.pts[k - 1], v) < 3));
  for (const t of tracks) { t.loose0 = !near(t.pts[0], t); t.loose1 = !near(t.pts[t.pts.length - 1], t); }
  // heights: the ground every 5 m, water posts the nearest land's, smoothed; ramps at loose ends
  for (const t of tracks) {
    const n = Math.max(2, Math.ceil(t.len / 5) + 1), g = [];
    for (let k = 0; k < n; k++) { const p = at(t, (t.len * k) / (n - 1)); g.push(wet(p.x, p.z) ? NaN : ground(p.x, p.z)); }
    // fill water from the banks
    for (let k = 0; k < n; k++) if (Number.isNaN(g[k])) {
      let a = k, b = k; while (a >= 0 && Number.isNaN(g[a])) a--; while (b < n && Number.isNaN(g[b])) b++;
      g[k] = a >= 0 && b < n ? Math.max(g[a], g[b]) : a >= 0 ? g[a] : b < n ? g[b] : wl + 1;
    }
    for (let pass = 0; pass < 4; pass++) for (let k = 1; k + 1 < n; k++) g[k] = (g[k - 1] + 2 * g[k] + g[k + 1]) / 4;
    t.gy = g; t.step = t.len / (n - 1);
  }
  const rise = (t, u) => {
    let r = DECK_TOP;
    if (t.loose0 && u < RAMP) r = DECK_TOP * smooth(u / RAMP) ;
    if (t.loose1 && t.len - u < RAMP) r = Math.min(r, DECK_TOP * smooth((t.len - u) / RAMP));
    return r;
  };
  const yAt = (t, u) => { const k = Math.max(0, Math.min(t.gy.length - 1.001, u / t.step)), i = Math.floor(k); return t.gy[i] + (t.gy[i + 1] - t.gy[i]) * (k - i) + rise(t, u); };
  // (a loose end shorter than its ramps: a stub, left low)
  for (const t of tracks) if ((t.loose0 || t.loose1) && t.len < 30) t.stub = true;

  // ---- geometry: chunked non-indexed boxes with colours
  const chunks = new Map();
  const chunk = (x, z) => { const k = Math.floor(x / CELL) * 65536 + Math.floor(z / CELL); let c = chunks.get(k); if (!c) chunks.set(k, (c = { pos: [], col: [], glow: [], tie: [], tdir: [], det: [], dcol: [], cx: (Math.floor(x / CELL) + 0.5) * CELL, cz: (Math.floor(z / CELL) + 0.5) * CELL })); return c; };
  const tint = new THREE.Color();
  // an oriented box: centre (cx, cz), y0..y1, along (ux, uz) `along` m, across `across` m; or sloped: y0a/y1a at -along/2
  function box(c, cx, cz, ux, uz, along, across, y0, y1, colour, slope = 0, list = 'pos') {
    const ax = (ux * along) / 2, az = (uz * along) / 2, bx = (-uz * across) / 2, bz = (ux * across) / 2;
    const P = [[cx - ax - bx, cz - az - bz, -1], [cx + ax - bx, cz + az - bz, 1], [cx + ax + bx, cz + az + bz, 1], [cx - ax + bx, cz - az + bz, -1]];
    const lo = (p) => [p[0], y0 + (slope * p[2]) / 2, p[1]], hi = (p) => [p[0], y1 + (slope * p[2]) / 2, p[1]];
    const arr = list === 'glow' ? c.glow : list === 'tie' ? c.tie : list === 'det' ? c.det : c.pos;
    const quad = (a, b, d, e) => { arr.push(...a, ...b, ...d, ...a, ...d, ...e); if (list === 'pos') for (let i = 0; i < 6; i++) c.col.push(tint.r, tint.g, tint.b); else if (list === 'det') for (let i = 0; i < 6; i++) c.dcol.push(tint.r, tint.g, tint.b); else if (list === 'tie') for (let i = 0; i < 6; i++) c.tdir.push(ux, uz); };
    tint.setHex(colour);
    for (let i = 0; i < 4; i++) { const p = P[i], r = P[(i + 1) % 4]; quad(lo(p), hi(p), hi(r), lo(r)); }
    quad(hi(P[0]), hi(P[3]), hi(P[2]), hi(P[1]));
    quad(lo(P[0]), lo(P[1]), lo(P[2]), lo(P[3]));
  }
  // a beam between two 3D points (square section w)
  function beam(c, a, b, w, colour) {
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
    if (L < 0.05) { box(c, a.x, a.z, 1, 0, w, w, Math.min(a.y, b.y), Math.max(a.y, b.y), colour); return; }
    box(c, (a.x + b.x) / 2, (a.z + b.z) / 2, dx / L, dz / L, L, w, (a.y + b.y) / 2 - w / 2, (a.y + b.y) / 2 + w / 2, colour, b.y - a.y);
  }

  // decks: per track, a piece every ~5 m (its own slope)
  let deckM = 0;
  for (const t of tracks) {
    if (t.stub) continue;
    const n = Math.max(1, Math.round(t.len / 5));
    for (let k = 0; k < n; k++) {
      const u0 = (t.len * k) / n, u1 = (t.len * (k + 1)) / n, um = (u0 + u1) / 2;
      const a = at(t, u0), b = at(t, u1), m = at(t, um);
      const L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 0.2) continue;
      const ux = (b.x - a.x) / L, uz = (b.z - a.z) / L, y0 = yAt(t, u0), y1 = yAt(t, u1), ym = (y0 + y1) / 2, sl = y1 - y0;
      if (ym - ground(m.x, m.z) < 0.6 && !wet(m.x, m.z)) continue; // (at grade: the ramp's foot)
      const c = chunk(m.x, m.z), len = L + 0.06;
      const vx = -uz, vz = ux;
      // two plate girders, the tie bed, two rails
      for (const o of [-0.95, 0.95]) {
        box(c, m.x + vx * o, m.z + vz * o, ux, uz, len, 0.34, ym - GIRDER, ym - 0.05, o < 0 ? STEEL : STEEL_D, sl);
        // the girder's flanges: the riveted angle lines top and bottom, a lighter steel catching the light
        const fo = o + Math.sign(o) * 0.19;
        box(c, m.x + vx * fo, m.z + vz * fo, ux, uz, len, 0.05, ym - 0.32, ym - 0.2, FLANGE, sl, 'det');
        box(c, m.x + vx * fo, m.z + vz * fo, ux, uz, len, 0.05, ym - GIRDER + 0.06, ym - GIRDER + 0.18, FLANGE, sl, 'det');
      }
      // the tie bed: timber ties over the deck (tie.js's stripes, a material of their own: ties every 0.6 m)
      box(c, m.x, m.z, ux, uz, len, TRACK_W, ym - 0.02, ym + 0.12, TIE, sl, 'tie');
      // the guard rail between the running rails, and the third rail (its cover board) on the track's outer side
      box(c, m.x + vx * 0.25, m.z + vz * 0.25, ux, uz, len, 0.07, ym + 0.12, ym + 0.24, RAIL, sl, 'det');
      box(c, m.x + vx * 1.25, m.z + vz * 1.25, ux, uz, len, 0.32, ym + 0.2, ym + 0.27, 0x6b5a3a, sl, 'det');
      // a floor beam across under the ties (the ribbed underside seen from the street), every 5 m
      for (const f of [0]) { const fx = m.x + ux * f * L, fz = m.z + uz * f * L; box(c, fx, fz, ux, uz, 0.3, TRACK_W - 0.1, ym - 0.5 + sl * f, ym - 0.02 + sl * f, STEEL_D); }
      for (const o of [-RAIL_GAUGE / 2, RAIL_GAUGE / 2]) box(c, m.x + vx * o, m.z + vz * o, ux, uz, len, 0.08, ym + 0.12, ym + 0.27, RAIL, sl);
      deckM += L;
    }
  }

  // bents: stations every BENT m on each track; one bent across every track within PAIR m there
  const bentCells = new Map(), colliders = [];
  const bentNear = (x, z) => { for (let ix = Math.floor(x / 10) - 1; ix <= Math.floor(x / 10) + 1; ix++) for (let iz = Math.floor(z / 10) - 1; iz <= Math.floor(z / 10) + 1; iz++) for (const b of bentCells.get(ix * 65536 + iz) || []) if (Math.hypot(b.x - x, b.z - z) < BENT * 0.55) return true; return false; };
  const addBentCell = (x, z) => { const k = Math.floor(x / 10) * 65536 + Math.floor(z / 10); let l = bentCells.get(k); if (!l) bentCells.set(k, (l = [])); l.push({ x, z }); };
  const tcell = new Map();
  for (const t of tracks) for (let k = 1; k < t.pts.length; k++) {
    const a = t.pts[k - 1], b = t.pts[k];
    for (let ix = Math.floor((Math.min(a.x, b.x) - PAIR) / 32); ix <= Math.floor((Math.max(a.x, b.x) + PAIR) / 32); ix++)
      for (let iz = Math.floor((Math.min(a.z, b.z) - PAIR) / 32); iz <= Math.floor((Math.max(a.z, b.z) + PAIR) / 32); iz++) {
        const kk = ix * 65536 + iz; let l = tcell.get(kk); if (!l) tcell.set(kk, (l = [])); l.push({ t, k });
      }
  }
  let bents = 0, kerbed = 0;
  const pools = []; // [x, y, z, yaw, radius] light pools under the bents
  for (const t of tracks) {
    if (t.stub) continue;
    for (let u = BENT / 2; u < t.len; u += BENT) {
      const p = at(t, u), y = yAt(t, u);
      if (y - ground(p.x, p.z) < 3.2 || wet(p.x, p.z)) continue;
      if (bentNear(p.x, p.z)) continue;
      // the tracks across: lateral offsets of every track line within PAIR m of p, along p's normal
      const vx = -p.dz, vz = p.dx;
      let lo = 0, hi = 0, ytop = y;
      for (const { t: o, k } of tcell.get(Math.floor(p.x / 32) * 65536 + Math.floor(p.z / 32)) || []) {
        if (o === t || o.stub) continue;
        const a = o.pts[k - 1], b = o.pts[k];
        const hit = lineAcross(p, vx, vz, a, b);
        if (hit === null || Math.abs(hit) > PAIR) continue;
        lo = Math.min(lo, hit); hi = Math.max(hi, hit);
      }
      // (the bent's foot: the columns TRACK_W / 2 + 0.4 m past the outer tracks, stepped out to a kerb)
      let cl = lo - TRACK_W / 2 - 0.4, cr = hi + TRACK_W / 2 + 0.4;
      const gy = ground(p.x, p.z);
      const footOk = (o) => !onRoad(p.x + vx * o, p.z + vz * o, 0.4) && !wet(p.x + vx * o, p.z + vz * o);
      let okL = footOk(cl), okR = footOk(cr);
      if (!okL || !okR) {
        // step out across the roadway (up to 14 m) to its kerb
        for (let s = 0.5; s <= 14 && !okL; s += 0.5) if (footOk(cl - s)) { cl -= s + KERB_OUT * 0; okL = true; kerbed++; }
        for (let s = 0.5; s <= 14 && !okR; s += 0.5) if (footOk(cr + s)) { cr += s; okR = true; kerbed++; }
      }
      if (!okL || !okR) continue; // (nowhere to stand: the deck spans on)
      addBentCell(p.x, p.z);
      const c = chunk(p.x, p.z), yb = ytop - GIRDER - 0.05;
      // cross girder, columns, knee braces, column caps and bases
      const mx = p.x + vx * (cl + cr) / 2, mz = p.z + vz * (cl + cr) / 2;
      box(c, mx, mz, vx, vz, cr - cl + 0.6, 0.55, yb - 0.85, yb, STEEL_D);
      for (const o of [cl, cr]) {
        const x = p.x + vx * o, z = p.z + vz * o, g = ground(x, z);
        box(c, x, z, p.dx, p.dz, 0.52, 0.52, g, yb - 0.85, STEEL);
        box(c, x, z, p.dx, p.dz, 0.8, 0.8, g, g + 0.35, CONCRETE);
        const inward = o === cl ? 1 : -1;
        beam(c, { x, y: yb - 2.2, z }, { x: x + vx * inward * 1.4, y: yb - 0.85, z: z + vz * inward * 1.4 }, 0.22, STEEL_D);
        // the column's collider (OBB: local z along the track)
        const hz = 0.3, hx = 0.3;
        colliders.push({ minX: x - 0.43, maxX: x + 0.43, minZ: z - 0.43, maxZ: z + 0.43, minY: g - 1, maxY: yb, obb: { cx: x, cz: z, hx, hz, cs: p.dz, sn: p.dx }, elevated: true });
      }
      // a lamp under the deck every other bent (lit at night)
      // lamps: one under the cross girder's middle, one on each column (Chicago's sodium and LED under the L), and the
      // pool each throws on the street, slatted by the ties' gaps
      box(c, mx, mz, p.dx, p.dz, 0.5, 0.2, yb - 0.98, yb - 0.88, 0xffffff, 0, 'glow');
      for (const o of [cl, cr]) { const x = p.x + vx * (o + (o === cl ? 0.38 : -0.38)), z = p.z + vz * (o + (o === cl ? 0.38 : -0.38)); box(c, x, z, p.dx, p.dz, 0.2, 0.16, yb - 2.75, yb - 2.62, 0xffffff, 0, 'glow'); }
      pools.push(mx, gy, mz, Math.atan2(p.dx, p.dz), (cr - cl) * 0.5 + 2);
      bents++;
    }
  }

  // ---- meshes
  const group = new THREE.Group();
  group.name = 'Elevated';
  scene.add(group);
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.05 });
  const { smoothstep, color: tcolor } = N.TSL;
  const glowMat = new THREE.MeshStandardNodeMaterial({ color: 0x1a1a18, roughness: 0.6 });
  if (N.cityUniforms && N.cityUniforms.uInteriorGlow) glowMat.emissiveNode = tcolor(0xffd9a0).mul(smoothstep(0.4, 1.3, N.cityUniforms.uInteriorGlow).mul(1.3));
  const meshes = [];
  let tris = 0;
  for (const c of chunks.values()) {
    if (c.pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(c.pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(c.col, 3));
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.castShadow = true; m.receiveShadow = true;
      m.userData.cx = c.cx; m.userData.cz = c.cz;
      group.add(m); meshes.push(m);
      tris += c.pos.length / 9;
    }
    if (c.glow.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(c.glow, 3));
      g.computeVertexNormals(); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, glowMat);
      m.userData.cx = c.cx; m.userData.cz = c.cz;
      group.add(m); meshes.push(m);
      tris += c.glow.length / 9;
    }
  }

  // the near detail (flange lines, guard and third rail): its own mesh per chunk, drawn within NEAR_DET m only
  for (const c of chunks.values()) {
    if (!c.det.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(c.det, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c.dcol, 3));
    g.computeVertexNormals(); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true;
    m.userData.cx = c.cx; m.userData.cz = c.cz; m.userData.near = true; group.add(m); meshes.push(m); tris += c.det.length / 9;
  }
  // the ties: stripes across the track every 0.6 m (timber on ballast-dark steel), by each vertex's track direction
  const { attribute, positionWorld, fract, step, mix: tmix, vec3: tvec3, float: tfloat, uv, abs, length: tlen } = N.TSL;
  const tieMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
  { const d = attribute('tdir', 'vec2'), s_ = positionWorld.x.mul(d.x).add(positionWorld.z.mul(d.y)).div(0.6);
    tieMat.colorNode = tmix(tvec3(0.07, 0.065, 0.06), tvec3(0.2, 0.15, 0.11), step(0.42, fract(s_))); }
  for (const c of chunks.values()) {
    if (!c.tie.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(c.tie, 3));
    g.setAttribute('tdir', new THREE.Float32BufferAttribute(c.tdir, 2));
    g.computeVertexNormals(); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, tieMat); m.receiveShadow = true;
    m.userData.cx = c.cx; m.userData.cz = c.cz; group.add(m); meshes.push(m); tris += c.tie.length / 9;
  }
  // the light pools under the bents: additive discs on the street, slatted by the ties, only at night
  let poolMesh = null;
  if (pools.length) {
    const n = pools.length / 5, pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
    const pm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const night = N.cityUniforms && N.cityUniforms.uInteriorGlow ? N.TSL.smoothstep(0.4, 1.3, N.cityUniforms.uInteriorGlow) : tfloat(0);
    const r = tlen(uv().sub(0.5)).mul(2), fall = tfloat(1).sub(N.TSL.smoothstep(0.15, 1.0, r));
    const slat = tfloat(0.55).add(step(0.35, fract(uv().y.mul(14))).mul(0.45));
    pm.colorNode = tvec3(1.0, 0.62, 0.28).mul(fall.mul(fall)).mul(slat).mul(night).mul(0.55);
    poolMesh = new THREE.InstancedMesh(pg, pm, n);
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v4 = new THREE.Vector3(), s4 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) { const [x, y, z, yaw, R] = pools.slice(i * 5, i * 5 + 5); q4.setFromAxisAngle(up, yaw); m4.compose(v4.set(x, y + 0.06, z), q4, s4.set(R * 2, 1, 9)); poolMesh.setMatrixAt(i, m4); }
    poolMesh.computeBoundingSphere(); poolMesh.name = 'ElevatedLightPools';
    group.add(poolMesh);
  }

  // ---- the train: the longest joined run of track within 2 km of downtown, four cars back and forth
  // (two trains, the second the other way round from the far end of the run)
  const train = q.get('ltrain') === '0' ? null : buildTrain(group, tracks, at, yAt, 0.3, 1);
  const train2 = train ? buildTrain(group, tracks, at, yAt, 0.85, -1) : null;
  const stats = { tracks: tracks.length, deckKm: +(deckM / 1000).toFixed(2), bents, kerbed, colliders: colliders.length, chunks: meshes.length, tris: Math.round(tris), train: train ? +train.len.toFixed(0) : 0 };
  console.info('[elevated]', JSON.stringify(stats));
  const far2 = FAR * FAR, near2 = (CELL * 0.71 + 300) ** 2;
  function update(dt, cam) {
    if (cam) for (const m of meshes) { const dx = m.userData.cx - cam.x, dz = m.userData.cz - cam.z; m.visible = dx * dx + dz * dz < (m.userData.near ? near2 : far2); }
    if (train) train.update(dt);
    if (train2) train2.update(dt);
  }
  // (under the deck: a point within the deck's footprint, for shelter from rain and the anchors; the deck's underside y)
  function underAt(x, z) {
    for (const { t, k } of tcell.get(Math.floor(x / 32) * 65536 + Math.floor(z / 32)) || []) {
      if (t.stub) continue;
      const a = t.pts[k - 1], b = t.pts[k];
      if (segDist({ x, z }, a, b) < TRACK_W / 2 + 0.3) { const u = t.s[k - 1] + Math.hypot(x - a.x, z - a.z); return yAt(t, u) - GIRDER; }
    }
    return null;
  }
  // (for the sound and the story: how near the L is to (x, z) — the deck's distance in plan, whether (x, z) is under
  // it, and how far the nearest train car is; the L rumble keys off this. null when no track is within 60 m)
  function nearL(x, z) {
    let d = Infinity;
    for (let ix = Math.floor((x - 60) / 32); ix <= Math.floor((x + 60) / 32); ix++) for (let iz = Math.floor((z - 60) / 32); iz <= Math.floor((z + 60) / 32); iz++)
      for (const { t, k } of tcell.get(ix * 65536 + iz) || []) if (!t.stub) d = Math.min(d, segDist({ x, z }, t.pts[k - 1], t.pts[k]));
    if (!(d < 60)) return null;
    let td = Infinity;
    for (const tr of [train, train2]) if (tr) for (const c of tr.cars) td = Math.min(td, Math.hypot(c.position.x - x, c.position.z - z));
    return { d, under: underAt(x, z) !== null, train: td, deckY: underAt(x, z) };
  }
  const api = { group, colliders, tracks, update, stats, underAt, near: nearL, train, trains: [train, train2].filter(Boolean), tag: 'L' };
  N.Elevated = api;
  return api;
}

function smooth(f) { f = Math.max(0, Math.min(1, f)); return f * f * (3 - 2 * f); }
function segDist(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2));
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}
// where the line through p along (vx, vz) crosses segment ab: its offset along v, or null
function lineAcross(p, vx, vz, a, b) {
  const ex = b.x - a.x, ez = b.z - a.z, den = vx * ez - vz * ex;
  if (Math.abs(den) < 1e-6) return null;
  const wx = a.x - p.x, wz = a.z - p.z;
  const s = (wx * ez - wz * ex) / den, t = (wx * vz - wz * vx) / den;
  return t >= -0.01 && t <= 1.01 ? s : null;
}

// a train: a run of joined tracks (end to end within 3 m, turning less than 35 degrees), the longest whose middle is
// within 2.5 km of downtown; four cars shuttle along it at 13 m/s, pausing 12 s at each end
function buildTrain(group, tracks, at, yAt, start = 0.3, dir0 = 1) {
  const THREE = N.THREE;
  const dt0 = N.PKG && N.PKG.downtown ? N.PKG.downtown : { x: 0, z: 0 };
  const usable = tracks.filter((t) => !t.stub && t.len > 20);
  const endPt = (t, e) => (e ? t.pts[t.pts.length - 1] : t.pts[0]);
  const dirAt = (t, e) => { const p = at(t, e ? t.len - 0.5 : 0.5); return e ? { x: p.dx, z: p.dz } : { x: -p.dx, z: -p.dz }; };
  let best = null;
  for (const t0 of usable) {
    // grow forward from t0's end 1
    const run = [{ t: t0, fwd: true }], used = new Set([t0]);
    let cur = { t: t0, e: 1 };
    for (let n = 0; n < 60; n++) {
      const p = endPt(cur.t, cur.e), d = dirAt(cur.t, cur.e);
      let nxt = null;
      for (const o of usable) {
        if (used.has(o)) continue;
        for (const e of [0, 1]) {
          const q = endPt(o, e);
          if (Math.hypot(q.x - p.x, q.z - p.z) > 3) continue;
          const od = dirAt(o, e); // pointing out of o at e; we enter at e and leave at 1-e: travel dir = -od
          if (-(od.x * d.x + od.z * d.z) < Math.cos((35 * Math.PI) / 180)) continue;
          nxt = { t: o, e }; break;
        }
        if (nxt) break;
      }
      if (!nxt) break;
      used.add(nxt.t); run.push({ t: nxt.t, fwd: nxt.e === 0 }); cur = { t: nxt.t, e: 1 - nxt.e };
    }
    const len = run.reduce((s, r) => s + r.t.len, 0);
    const mid = run[Math.floor(run.length / 2)].t.pts[0];
    if (Math.hypot(mid.x - dt0.x, mid.z - dt0.z) > 2500) continue;
    if (!best || len > best.len) best = { run, len };
  }
  if (!best || best.len < 300) return null;
  const run = best.run, cum = [0];
  for (const r of run) cum.push(cum[cum.length - 1] + r.t.len);
  const where = (s) => {
    s = Math.max(0, Math.min(best.len - 0.01, s));
    let i = 0; while (i < run.length - 1 && cum[i + 1] < s) i++;
    const r = run[i], u = r.fwd ? s - cum[i] : r.t.len - (s - cum[i]);
    const p = at(r.t, u);
    return { x: p.x, z: p.z, y: yAt(r.t, u), dx: r.fwd ? p.dx : -p.dx, dz: r.fwd ? p.dz : -p.dz };
  };
  // the cars: body, roof, a window band (lit), the CTA's steel grey with a dark lower skirt; no livery or marks
  const CAR_L = 14.6, CAR_W = 2.8, CAR_H = 3.3, GAP = 0.9, NCAR = 4;
  const body = new THREE.MeshStandardNodeMaterial({ color: 0xb9bdbf, roughness: 0.4, metalness: 0.6 });
  const dark = new THREE.MeshStandardNodeMaterial({ color: 0x24282b, roughness: 0.7, metalness: 0.2 });
  const win = new THREE.MeshStandardNodeMaterial({ color: 0x15191c, roughness: 0.2, metalness: 0.1 });
  const { smoothstep, color: tcolor, float } = N.TSL;
  if (N.cityUniforms && N.cityUniforms.uInteriorGlow) win.emissiveNode = tcolor(0xfff1d6).mul(float(0.2).add(smoothstep(0.3, 1.2, N.cityUniforms.uInteriorGlow).mul(0.75)));
  const gB = new THREE.BoxGeometry(CAR_L, CAR_H * 0.62, CAR_W);
  const gS = new THREE.BoxGeometry(CAR_L, 0.55, CAR_W - 0.1);
  const gW = new THREE.BoxGeometry(CAR_L - 1.2, 0.85, CAR_W + 0.04);
  const gR = new THREE.BoxGeometry(CAR_L - 0.2, 0.3, CAR_W - 0.3);
  const cars = [];
  for (let i = 0; i < NCAR; i++) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(gB, body); b.position.y = 0.55 + CAR_H * 0.31; g.add(b);
    const s = new THREE.Mesh(gS, dark); s.position.y = 0.55 + 0.27; g.add(s);
    const w = new THREE.Mesh(gW, win); w.position.y = 0.55 + CAR_H * 0.45; g.add(w);
    const r = new THREE.Mesh(gR, body); r.position.y = 0.55 + CAR_H * 0.62 + 0.15; g.add(r);
    for (const m of [b, s, w, r]) { m.castShadow = true; }
    group.add(g); cars.push(g);
  }
  const V = 13, DWELL = 12, trainL = NCAR * (CAR_L + GAP);
  let s = Math.max(NCAR * (CAR_L + GAP) + 5, best.len * start), dir = dir0, wait = 0;
  function update(dt) {
    if (wait > 0) wait -= dt;
    else {
      s += dir * V * dt;
      if (s > best.len - 5) { s = best.len - 5; dir = -1; wait = DWELL; }
      if (s < trainL + 5) { s = trainL + 5; dir = 1; wait = DWELL; }
    }
    for (let i = 0; i < NCAR; i++) {
      const c = s - (i + 0.5) * (CAR_L + GAP);
      const a = where(c - CAR_L * 0.4), b = where(c + CAR_L * 0.4), m = where(c);
      cars[i].position.set(m.x, (a.y + b.y) / 2 + 0.25, m.z);
      cars[i].rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2, 0);
      cars[i].rotation.z = 0;
    }
  }
  update(0);
  return { len: best.len, update, cars, where, get s() { return s; } };
}

window.NYC.buildElevated = buildElevated;
})();
