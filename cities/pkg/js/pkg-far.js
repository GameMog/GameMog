(function () {
// cities/pkg/js/pkg-far.js
// (Mog City, Hometown) The land past a package's compiled tiles, to the horizon: no sea round a dry town, real 3DEP
// ground and its water at their own heights. region.js buildSFRegion hands a package here (NYC.PkgFar.build).
//
//   at boot, synchronously, zero bytes: the FILL (a 400 m skirt round the core at its edge heights, sloping 20 m down)
//     and the APRON (from there to 80 km, past the camera's far plane): the town never shows sea, even for a frame
//   after boot, off the critical path: the FAR TILES the compiler wrote (tools/hometown/far.py, PKG.far: tier A, hg1
//     L1 tiles of 65 x 65 posts at 16 grid m in a ~1 km ring round the core, its posts the core's own post function;
//     B, L3 at 64 grid m out to ~10 km; C, L5 at 256 grid m out to ~30 km; data/far/*.bin.gz), placed in the session
//     frame (x = (grid m - 512 c0) / k0: a uniform grid), added as Terrain patches (finest first, `surface`: groundAt
//     over far water is its 3DEP height, never the dry sentinel) and drawn: vertex colours by class (land, arid land,
//     water) and slope, near the core its own edge ground fading out over FADE m, water meshes (marching squares on
//     the smoothed wetness) at the hydro-flattened height, skirts at every tile edge, merged into a few dozen draws;
//     the fill and boot apron then give way to an apron from the far tiles' outer edge
//   seams: heightAt continuous core -> A -> B -> C (A's last 64 m snapped to the core's edge posts, Terrain.edgeBlend
//     between them, each tier's outer band blended into the next coarser tier's bilinear)
//   budget (horizon.md): <= 80 far draw calls; Low graphics (a 3000 m draw distance, ?gfx=phone|low) every other post,
//     <= 0.6 M far triangles (stats.budget)
// It never changes the core: far meshes hide where the core's terrain is drawn, the core's own edge dithers over them
// (terrain-mesh.js), and the street network was built on the core alone (main.js patchesEnabled). Sets
// NYC.FLIGHT_BOUNDS to the 10 km tier (the helicopter), DATA.pkgFar = { tiers, extent, stats } (no .city: sf-map.js
// reads that as map bounds), and the fog: an arid majority in the near tier asks for 'clear' (an explicit ?fog wins).
//   ?far=0     the fill and apron only (no tiles)          ?far=none  nothing (the old 60 km sea plane, sf-ground.js)
//   ?farDebug=1  far water drawn #00FFFF, the fill and apron #00FF00 (the sea test: no SF bay plane is left to show)
const N = (window.NYC = window.NYC || {});

const APRON_R = 80000;          // m: past the 60 km far plane
const FILL_W = 400, FILL_DROP = 20;
const EDGE_BLEND = 32;         // m: Terrain.edgeBlend, heightAt continuous across the core's edge
const FADE = 300;              // m: the far ground takes the core's edge ground at the edge, fading (quadratically) to its own by this far out
const ISO = 0.4;               // the far water's shore: this much of the 3 x 3 round a post wet
// (classes, tools/hometown/far.py: 0 land (humid), 1 water, 2 arid, 3 dry (steppe); a humid hillside reads wooded, not
// rock, below a cliff's slope)
const COLORS = { land: 0x5c6e3a, arid: 0xb49f7a, dry: 0x857f54, rock: 0x7d776c, woods: 0x3f4a2a, water: 0x40525c, wet: 0x5f6e4f };

function build(scene) {
  const { THREE, Terrain: T, createWaterMaterial } = N;
  const P = N.PKG, Q = new URLSearchParams(location.search), mode = Q.get('far'), debug = Q.get('farDebug') === '1';
  if (mode === 'none') return { update() {}, setQuality() {}, stats: () => ({ far: 'none' }) };
  const group = new THREE.Group();
  group.name = 'PkgFar';
  scene.add(group);
  const core = { x0: T.originX, z0: T.originZ, x1: T.originX + (T.w - 1) * T.cell, z1: T.originZ + (T.h - 1) * T.cell };
  // (the package's climate, tools/hometown/climate.py; an older package: the old desert rule)
  const fr = P.frame || {}, clim = P.climate || ((fr.lon0 ?? 0) < -104 && (fr.lat0 ?? 90) < 37.5 ? 'arid' : 'humid');
  const stats = { fill: true, tiles: 0, triangles: 0, waterTriangles: 0, loadMs: null, error: null, fog: null };
  const landMat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide }); // (skirts face either way)
  const flatMat = new THREE.MeshStandardNodeMaterial({ color: debug ? 0x00ff00 : clim === 'arid' ? COLORS.arid : clim === 'dry' ? COLORS.dry : COLORS.land, roughness: 1, metalness: 0 });
  const waterMat = debug ? new THREE.MeshBasicNodeMaterial({ color: 0x00ffff }) : createWaterMaterial();

  // ---- the ring round a rectangle: rings of vertices out from its perimeter (radially from its centre), quads between
  // rings[k] = { off: m out from the perimeter (negative: in), y(x, z, px, pz) }
  function ring(rect, every, rings, mat, name) {
    const cx = (rect.x0 + rect.x1) / 2, cz = (rect.z0 + rect.z1) / 2, per = [];
    const side = (ax, az, bx, bz) => { const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / every)); for (let i = 0; i < n; i++) per.push([ax + (bx - ax) * i / n, az + (bz - az) * i / n]); };
    side(rect.x0, rect.z0, rect.x1, rect.z0); side(rect.x1, rect.z0, rect.x1, rect.z1); side(rect.x1, rect.z1, rect.x0, rect.z1); side(rect.x0, rect.z1, rect.x0, rect.z0);
    const m = per.length, pos = new Float32Array(m * rings.length * 3), idx = [];
    for (let i = 0; i < m; i++) {
      const [px, pz] = per[i], dx = px - cx, dz = pz - cz, L = Math.hypot(dx, dz) || 1;
      for (let k = 0; k < rings.length; k++) {
        const x = px + dx / L * rings[k].off, z = pz + dz / L * rings[k].off, o = (k * m + i) * 3;
        pos[o] = x; pos[o + 1] = rings[k].y(x, z, px, pz); pos[o + 2] = z;
      }
    }
    for (let k = 0; k + 1 < rings.length; k++) for (let i = 0; i < m; i++) {
      const a = k * m + i, b = k * m + (i + 1) % m, c = (k + 1) * m + i, d = (k + 1) * m + (i + 1) % m;
      idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name; mesh.receiveShadow = false; mesh.castShadow = false;
    return mesh;
  }
  const drop = (d) => (d * d) / (2 * 6371000);

  // ---- step 0: the fill and the boot apron (no bytes: the core's own edge)
  let edgeMin = Infinity;
  for (let x = core.x0; x <= core.x1; x += 32) edgeMin = Math.min(edgeMin, T.heightAt(x, core.z0), T.heightAt(x, core.z1));
  for (let z = core.z0; z <= core.z1; z += 32) edgeMin = Math.min(edgeMin, T.heightAt(core.x0, z), T.heightAt(core.x1, z));
  if (!Number.isFinite(edgeMin)) edgeMin = 0;
  const clampIn = (x, z) => [Math.min(core.x1, Math.max(core.x0, x)), Math.min(core.z1, Math.max(core.z0, z))];
  const edgeY = (px, pz) => { const [x, z] = clampIn(px, pz); return T.heightAt(x, z); };
  const boot = ring(core, 32, [
    { off: -60, y: (x, z) => { const [a, b] = clampIn(x, z); return T.heightAt(a, b) - 0.15; } },
    { off: 0, y: (x, z, px, pz) => edgeY(px, pz) - 0.15 },
    { off: FILL_W, y: (x, z, px, pz) => edgeY(px, pz) - FILL_DROP },
    { off: APRON_R, y: () => edgeMin - FILL_DROP - drop(APRON_R) },
  ], flatMat, 'PkgFarFill');
  group.add(boot);

  // ---- the far tiles
  const tiers = {}, patches = [], chunks = [];
  let apron = null, farRect = null, lodTier = null;
  if (mode !== '0' && P.far && Array.isArray(P.far.tiles) && P.far.tiles.length && N.fetchBin) {
    const t0 = performance.now();
    load().then(() => { stats.loadMs = Math.round(performance.now() - t0); }, (e) => { stats.error = String(e && e.message || e); console.warn('[pkg-far]', e); });
  }

  // the ground the core shows at its own edge (what the far ground fades from): the park lawns on a curb island
  // (sf-ground.js), else the ground mask's class there (a block's top shows it too: createGroundCoverMaterial), as
  // albedo (roughly the materials' mean colours)
  const CORE_COLORS = { concrete: 0x84837b, park: 0x63903a, asphalt: 0x45474b, lawn: 0x4f6a2e, sand: 0xb5a17b, rock: 0x6f6658, seawall: 0x5a5650,
    lot: 0x515254, scrub: 0x7f7c4e, woods: 0x3a4424 };
  const cc = Object.fromEntries(Object.entries(CORE_COLORS).map(([k, v]) => [k, new THREE.Color(v)]));
  const byClass = [cc.asphalt, cc.concrete, cc.lawn, cc.sand, cc.rock, cc.seawall, cc.seawall, cc.lot, cc.scrub, cc.woods];
  function coreGroundAt(x, z) {
    const b = N.blockAt && N.blockAt(x, z);
    if (b && b.park > 0.5 && !b.median) return cc.park;
    const M = N.DATA && N.DATA.groundMask, H = M && M.header;
    if (!H) return b ? cc.concrete : cc.lawn;
    const i = Math.floor((x - H.originX) / H.cell), j = Math.floor((z - H.originZ) / H.cell);
    const k = i < 0 || j < 0 || i >= H.w || j >= H.h ? 2 : M.mask[j * H.w + i];
    return (b && k === 0 ? cc.concrete : byClass[k]) || cc.lawn;
  }
  // the edge's colour round the point (px, pz) on the core's boundary: 16 samples along it (+-56 m) and 2 deep (6, 30 m)
  const edgeCache = new Map();
  function edgeColor(px, pz) {
    const key = Math.round(px / 8) + ',' + Math.round(pz / 8);
    let c = edgeCache.get(key);
    if (c) return c;
    const onX = Math.abs(pz - core.z0) < 0.5 || Math.abs(pz - core.z1) < 0.5; // (a north / south edge runs along x)
    const inX = px <= core.x0 + 0.5 ? 1 : px >= core.x1 - 0.5 ? -1 : 0, inZ = pz <= core.z0 + 0.5 ? 1 : pz >= core.z1 - 0.5 ? -1 : 0;
    c = new THREE.Color(0, 0, 0);
    let n = 0;
    for (let t = -56; t <= 56; t += 16) for (const dep of [6, 30]) {
      const x = Math.min(core.x1 - 1, Math.max(core.x0 + 1, px + (onX ? t : 0) + inX * dep)), z = Math.min(core.z1 - 1, Math.max(core.z0 + 1, pz + (onX ? 0 : t) + inZ * dep));
      c.add(coreGroundAt(x, z)); n++;
    }
    c.multiplyScalar(1 / n);
    edgeCache.set(key, c);
    return c;
  }
  const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
  const outside = (r, x, z) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1)); // m outside r (0 inside)
  const inside = (r, x, z) => Math.min(x - r.x0, r.x1 - x, z - r.z0, r.z1 - z); // m inside r (negative outside)

  async function load() {
    const F = P.far, k0 = P.k0, c0 = P.origin.c0, r0 = P.origin.r0, yOff = P.yOffset;
    const list = F.tiles.slice(), got = new Map();
    let next = 0;
    await Promise.all(Array.from({ length: 8 }, async () => {
      while (next < list.length) { const t = list[next++]; got.set(t, await N.fetchBin(t.url)); }
    }));
    const dec = [];
    for (const t of list) {
      const { header: h, buf, offset } = got.get(t), n = h.n;
      const q = new Uint16Array(buf, offset, n * n), cls = new Uint8Array(buf, offset + 2 * n * n, n * n);
      const size = F.tiers[h.tier].size, step = h.step;
      const x0 = (h.C * size - 512 * c0) / k0, z0 = (h.R * size - 512 * r0) / k0, s = step / k0;
      const H = new Float32Array(n * n);
      let lo = Infinity;
      for (let i = 0; i < n * n; i++) if (q[i]) lo = Math.min(lo, h.minH + q[i] * h.scale - yOff);
      for (let i = 0; i < n * n; i++) H[i] = q[i] ? h.minH + q[i] * h.scale - yOff : (Number.isFinite(lo) ? lo : edgeMin);
      dec.push({ tier: h.tier, C: h.C, R: h.R, n, x0, z0, s, size: size / k0, H, q, cls });
    }
    const order = ['a', 'b', 'c'].filter((t) => dec.some((d) => d.tier === t));
    for (const t of order) {
      const ts = dec.filter((d) => d.tier === t), map = new Map(ts.map((d) => [d.C + ',' + d.R, d]));
      tiers[t] = {
        tiles: ts, map, s: ts[0].s, size: ts[0].size,
        rect: { x0: Math.min(...ts.map((d) => d.x0)), z0: Math.min(...ts.map((d) => d.z0)), x1: Math.max(...ts.map((d) => d.x0 + d.size)), z1: Math.max(...ts.map((d) => d.z0 + d.size)) },
      };
    }
    // a tier's own bilinear height at (x, z) (null where it has no tile)
    const tierAt = (t, x, z) => {
      const T_ = tiers[t]; if (!T_) return null;
      const d0 = T_.tiles[0], C = Math.floor((x - d0.x0) / T_.size) + d0.C, R = Math.floor((z - d0.z0) / T_.size) + d0.R;
      const d = T_.map.get(C + ',' + R); if (!d) return null;
      const fi = Math.min(d.n - 1, Math.max(0, (x - d.x0) / d.s)), fj = Math.min(d.n - 1, Math.max(0, (z - d.z0) / d.s));
      const i = Math.min(d.n - 2, fi | 0), j = Math.min(d.n - 2, fj | 0), tx = fi - i, tz = fj - j, k = j * d.n + i, H = d.H;
      const a = H[k] + (H[k + 1] - H[k]) * tx, b = H[k + d.n] + (H[k + d.n + 1] - H[k + d.n]) * tx;
      return a + (b - a) * tz;
    };
    // seams (heightAt continuous core -> A -> B -> C), coarsest first so each band meets its coarser tier's final heights:
    //   a tier's outer band (16 posts) blends into the next coarser tier (at its outer edge it IS that tier's bilinear,
    //   and between its posts both are linear along the edge: no step); the finest tier's last 64 m round the core
    //   snaps to the core's own edge (A's posts there are the core's post function already: this only takes up the core's
    //   water flattening and bridges)
    for (let ti = order.length - 2; ti >= 0; ti--) {
      const t = order[ti], u = order[ti + 1], R_ = tiers[t].rect, band = 16 * tiers[t].s;
      for (const d of tiers[t].tiles) for (let j = 0; j < d.n; j++) for (let i = 0; i < d.n; i++) {
        const x = d.x0 + i * d.s, z = d.z0 + j * d.s, din = inside(R_, x, z);
        if (din >= band) continue;
        const hu = tierAt(u, x, z); if (hu === null) continue;
        const k = j * d.n + i, w = smooth(din / band);
        d.H[k] = hu + (d.H[k] - hu) * w;
      }
    }
    const snap = { n: 0, p95: 0, max: 0 };
    if (order.length) {
      const t = order[0], SNAP = Math.max(64, 4 * tiers[t].s), raw = new Map(tiers[t].tiles.map((d) => [d, d.H.slice()]));
      const rawAt = (x, z) => { const T_ = tiers[t], d0 = T_.tiles[0], d = T_.map.get((Math.floor((x - d0.x0) / T_.size) + d0.C) + ',' + (Math.floor((z - d0.z0) / T_.size) + d0.R)); if (!d) return null; const i = Math.round((x - d.x0) / d.s), j = Math.round((z - d.z0) / d.s); return raw.get(d)[Math.min(d.n - 1, Math.max(0, j)) * d.n + Math.min(d.n - 1, Math.max(0, i))]; };
      const deltas = [];
      for (const d of tiers[t].tiles) for (let j = 0; j < d.n; j++) for (let i = 0; i < d.n; i++) {
        const x = d.x0 + i * d.s, z = d.z0 + j * d.s;
        if (inside(core, x, z) > 0.01) continue;
        const dc = outside(core, x, z); if (dc > SNAP) continue;
        const px = Math.min(core.x1, Math.max(core.x0, x)), pz = Math.min(core.z1, Math.max(core.z0, z)), ar = rawAt(px, pz);
        if (ar === null) continue;
        const delta = (T.coreAt ? T.coreAt(px, pz) : T.heightAt(px, pz)) - ar;
        if (dc < 0.01) deltas.push(Math.abs(delta));
        d.H[j * d.n + i] += delta * (1 - dc / SNAP);
      }
      deltas.sort((p, q) => p - q);
      if (deltas.length) Object.assign(snap, { n: deltas.length, p95: +deltas[Math.floor(deltas.length * 0.95)].toFixed(2), max: +deltas[deltas.length - 1].toFixed(2) });
    }
    stats.coreSnap = snap; // (|core - the tier's own post| at the core's edge posts, before the snap)
    // patches, finest first (after any landmark patch)
    for (const t of order) for (const d of tiers[t].tiles) patches.push(T.addPatch({ x0: d.x0, z0: d.z0, stepX: d.s, stepZ: d.s, nx: d.n, nz: d.n, h: d.H, rect: true, surface: true, far: t }));
    // (and between the finest tier's posts the core's own 2 m ground: heightAt takes up the core's edge over 32 m)
    if (order.length) T.edgeBlend = EDGE_BLEND;
    // meshes: each tile at strides 1 and 2, merged into chunks (A by quadrant round the core, B / C 2 x 2 tiles)
    const ccx = (core.x0 + core.x1) / 2, ccz = (core.z0 + core.z1) / 2, built = new Map();
    order.forEach((t, ti) => {
      const finer = ti === 0 ? core : tiers[order[ti - 1]].rect;
      const hide = ti === 0 ? { x0: core.x0 + 50, z0: core.z0 + 50, x1: core.x1 - 50, z1: core.z1 - 50 } : { x0: finer.x0 + tiers[t].s, z0: finer.z0 + tiers[t].s, x1: finer.x1 - tiers[t].s, z1: finer.z1 - tiers[t].s };
      const sink = ti === 0 ? 0.15 : 0.6 * ti;
      for (const d of tiers[t].tiles) {
        const key = t === 'a' ? `a:${d.x0 + d.size / 2 > ccx ? 1 : 0}${d.z0 + d.size / 2 > ccz ? 1 : 0}` : `${t}:${d.C >> 1},${d.R >> 1}`;
        if (!built.has(key)) built.set(key, { t, parts: [] });
        built.get(key).parts.push(tileArrays(d, hide, finer, sink));
      }
    });
    for (const [key, { t, parts }] of built) chunks.push(mergeChunk(key, t, parts));
    const water = mergeWater(chunks);
    // the outer apron from the far tiles' edge; the boot fill and apron out
    farRect = tiers.c ? tiers.c.rect : tiers.b ? tiers.b.rect : null;
    if (farRect) {
      const fy = (x, z, px, pz) => T.heightAt(Math.min(farRect.x1 - 1, Math.max(farRect.x0 + 1, px)), Math.min(farRect.z1 - 1, Math.max(farRect.z0 + 1, pz)));
      let lo = Infinity;
      for (let x = farRect.x0; x <= farRect.x1; x += 256) lo = Math.min(lo, fy(0, 0, x, farRect.z0), fy(0, 0, x, farRect.z1));
      for (let z = farRect.z0; z <= farRect.z1; z += 256) lo = Math.min(lo, fy(0, 0, farRect.x0, z), fy(0, 0, farRect.x1, z));
      apron = ring(farRect, 512, [
        { off: -300, y: (x, z, px, pz) => fy(0, 0, px, pz) - 6 },
        { off: 0, y: (x, z, px, pz) => fy(0, 0, px, pz) - 2 },
        { off: APRON_R, y: () => lo - 30 - drop(APRON_R) },
      ], flatMat, 'PkgFarApron');
      group.add(apron);
      group.remove(boot); boot.geometry.dispose();
      stats.fill = false;
    }
    for (const c of chunks) group.add(c.mesh);
    for (const w of water) group.add(w);
    if (tiers.b) N.FLIGHT_BOUNDS = { minX: tiers.b.rect.x0, maxX: tiers.b.rect.x1, minZ: tiers.b.rect.z0, maxZ: tiers.b.rect.z1 };
    // fog: an arid majority in the 10 km tier reads clear
    let a = 0, all = 0;
    for (const d of dec) if (d.tier === 'b') for (let i = 0; i < d.cls.length; i++) { all++; if (d.cls[i] === 2) a++; }
    stats.fog = all && a / all > 0.5 ? 'clear' : 'haze';
    if (stats.fog === 'clear') { N.pkgFarFog = 'clear'; N.setFogPreset?.('clear'); }
    stats.tiles = dec.length;
    stats.tierTiles = Object.fromEntries(order.map((t) => [t, tiers[t].tiles.length]));
    setLod(lodTier || initialLod());
    N.DATA.pkgFar = { tiers: Object.fromEntries(['a', 'b', 'c'].map((t) => [t, tiers[t] ? tiers[t].rect : null])), extent: farRect, stats };
  }

  // one tile's vertex arrays (posts then skirts), its land index at strides 1 and 2, its water (marching squares) at both
  function tileArrays(d, hide, under, sink) {
    const { n, x0, z0, s, H, q, cls } = d;
    const inR = (x, z, r) => r && x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
    const pos = [], col = [], hid = new Uint8Array(n * n);
    const cLand = new THREE.Color(COLORS.land), cArid = new THREE.Color(COLORS.arid), cDry = new THREE.Color(COLORS.dry), cRock = new THREE.Color(COLORS.rock), cWoods = new THREE.Color(COLORS.woods), cWater = new THREE.Color(COLORS.water), c = new THREE.Color();
    // the ground's slope at each post from Terrain.heightAt over the loaded patches (the same at a shared edge from
    // either tile), kept for the normals
    const G = new Float32Array(n * n * 2);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, x = x0 + i * s, z = z0 + j * s;
      G[k * 2] = (T.heightAt(x + s, z) - T.heightAt(x - s, z)) / (2 * s);
      G[k * 2 + 1] = (T.heightAt(x, z + s) - T.heightAt(x, z - s)) / (2 * s);
    }
    // the wetness smoothed (3 x 3 binomial over the tier's global posts, so a shared edge reads the same from either
    // tile): the shore's marching squares run on it
    const TM = tiers[d.tier].map, WV = new Float32Array(n * n);
    const wetAt = (i, j) => {
      const gi = d.C * 64 + i, gj = d.R * 64 + j, C = Math.floor(gi / 64), R = Math.floor(gj / 64), t = TM.get(C + ',' + R);
      if (t) return t.cls[(gj - 64 * R) * t.n + (gi - 64 * C)] === 1 ? 1 : 0;
      return cls[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))] === 1 ? 1 : 0;
    };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      let v = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) v += wetAt(i + di, j + dj) * (di ? 1 : 2) * (dj ? 1 : 2);
      WV[j * n + i] = v / 16;
    }
    // (the ground under the water: a water post, and a post beside one no higher than it (3DEP flattens a river in
    // steps: the post between two steps is not exactly flat, so not classed water, but it is the river all the same))
    const sunk = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i;
      if (cls[k] === 1) { sunk[k] = 1; continue; }
      let lo = Infinity;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const a = i + di, b = j + dj;
        if (a >= 0 && b >= 0 && a < n && b < n && cls[b * n + a] === 1) lo = Math.min(lo, H[b * n + a]);
      }
      if (H[k] < lo + 0.25) sunk[k] = 1;
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, x = x0 + i * s, z = z0 + j * s;
      // (under the finer ground: just below it, so the finer one always wins where both are drawn; the ground under
      // the water drops below the water's own surface, so the shore is where the land meets the water (the terrain's
      // own contour), not a line of posts)
      let y = H[k];
      if (inR(x, z, under)) y = T.heightAt(x, z) - sink;
      else if (sunk[k]) y -= 1.5;
      pos.push(x, y, z);
      hid[k] = inR(x, z, hide) ? 1 : 0;
      const slope = Math.hypot(G[k * 2], G[k * 2 + 1]);
      c.copy(cls[k] === 2 ? cArid : cls[k] === 3 ? cDry : cLand);
      if (cls[k] === 1) c.copy(cWater);
      if (cls[k] === 0) c.lerp(cWoods, Math.min(1, Math.max(0, (slope - 0.3) / 0.3))).lerp(cRock, Math.min(1, Math.max(0, (slope - 1.2) / 0.6)));
      else c.lerp(cRock, Math.min(1, Math.max(0, (slope - 0.35) / 0.4)));
      // (a little per-post variation: deterministic, by global post position, so shared edges match)
      const gi = d.C * 64 + i, gj = d.R * 64 + j, nz = Math.sin(gi * 12.9898 + gj * 78.233) * 43758.5453, v = 0.93 + 0.1 * (nz - Math.floor(nz));
      c.multiplyScalar(v);
      // (near the core: its own edge ground, fading out over FADE m, so the box edge is not a colour line)
      const dc = outside(core, x, z);
      if (dc < FADE && cls[k] !== 1) c.lerp(edgeColor(Math.min(core.x1, Math.max(core.x0, x)), Math.min(core.z1, Math.max(core.z0, z))), (1 - dc / FADE) ** 2);
      col.push(c.r, c.g, c.b);
    }
    // skirts round the tile (cracks against coarser / finer neighbours, and between strides)
    const sk = Math.max(3, s / 2);
    const edges = [Array.from({ length: n }, (_, i) => i), Array.from({ length: n }, (_, i) => (n - 1) * n + i), Array.from({ length: n }, (_, i) => i * n), Array.from({ length: n }, (_, i) => i * n + n - 1)];
    const skirtBase = [];
    for (const e of edges) {
      skirtBase.push(pos.length / 3);
      for (const k of e) { pos.push(pos[k * 3], pos[k * 3 + 1] - sk, pos[k * 3 + 2]); col.push(col[k * 3], col[k * 3 + 1], col[k * 3 + 2]); }
    }
    // normals from the ground's slope (G); a skirt lit as the ground it hangs from (its sideways normal would shade it
    // dark: a line along every step between tiers seen from afar)
    const nrm = new Float32Array(pos.length);
    for (let k = 0; k < n * n; k++) {
      const gx = G[k * 2], gz = G[k * 2 + 1], L = Math.hypot(gx, 1, gz);
      nrm[k * 3] = -gx / L; nrm[k * 3 + 1] = 1 / L; nrm[k * 3 + 2] = -gz / L;
    }
    for (let e = 0; e < 4; e++) for (let i = 0; i < n; i++) { const top = edges[e][i], sv = skirtBase[e] + i; nrm.set(nrm.subarray(top * 3, top * 3 + 3), sv * 3); }
    const idx = {}, wat = {};
    for (const st of [1, 2]) {
      const I = [], W = { pos: [], idx: [] };
      for (let j = 0; j + st < n; j += st) for (let i = 0; i + st < n; i += st) {
        const k = j * n + i, cs = [k, k + st, k + st * n + st, k + st * n]; // NW, NE, SE, SW
        if (cs.every((v) => hid[v]) || cs.some((v) => !q[v])) continue;
        const wet = cs.map((v) => cls[v] === 1), nw = wet.filter(Boolean).length, wv = cs.map((v) => WV[v]), inn = wv.map((v) => v >= ISO);
        if (inn.some(Boolean)) {
          // the water over this cell: marching squares on the smoothed wetness (WV, iso ISO), the crossing interpolated
          // along each edge (a curved shore, not 16 / 64 m stairs), at the water's own (hydro-flattened) height: its
          // wet corners' lowest, else the lowest corner in it
          let lvl = Infinity;
          for (let m = 0; m < 4; m++) if (wet[m]) lvl = Math.min(lvl, H[cs[m]]);
          if (!Number.isFinite(lvl)) for (let m = 0; m < 4; m++) if (inn[m]) lvl = Math.min(lvl, H[cs[m]]);
          lvl += 0.08;
          const poly = [];
          for (let m = 0; m < 4; m++) {
            const a = cs[m], b = cs[(m + 1) % 4], m2 = (m + 1) % 4;
            if (inn[m]) poly.push([pos[a * 3], pos[a * 3 + 2]]);
            if (inn[m] !== inn[m2]) { const t = (ISO - wv[m]) / (wv[m2] - wv[m]); poly.push([pos[a * 3] + (pos[b * 3] - pos[a * 3]) * t, pos[a * 3 + 2] + (pos[b * 3 + 2] - pos[a * 3 + 2]) * t]); }
          }
          const b0 = W.pos.length / 3;
          for (const [x, z] of poly) W.pos.push(x, lvl, z);
          for (let m = 1; m + 1 < poly.length; m++) W.idx.push(b0, b0 + m + 1, b0 + m);
        }
        if (nw === 4) continue;
        I.push(cs[0], cs[3], cs[1], cs[1], cs[3], cs[2]);
      }
      for (let e = 0; e < 4; e++) {
        const E = edges[e], base = skirtBase[e];
        for (let i = 0; i + st < n; i += st) {
          if (hid[E[i]] && hid[E[i + st]]) continue;
          I.push(E[i], base + i, E[i + st], E[i + st], base + i, base + i + st);
        }
      }
      idx[st] = I; wat[st] = W;
    }
    return { pos, col, nrm, idx, wat };
  }

  function mergeChunk(key, t, parts) {
    let nv = 0;
    for (const p of parts) nv += p.pos.length / 3;
    const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), idx = { 1: [], 2: [] };
    let o = 0;
    for (const p of parts) {
      pos.set(p.pos, o * 3); col.set(p.col, o * 3); nrm.set(p.nrm, o * 3);
      for (const st of [1, 2]) for (const v of p.idx[st]) idx[st].push(v + o);
      o += p.pos.length / 3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    const ix = { 1: new THREE.BufferAttribute(new Uint32Array(idx[1]), 1), 2: new THREE.BufferAttribute(new Uint32Array(idx[2]), 1) };
    geo.setIndex(ix[1]);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, landMat);
    mesh.name = `PkgFar:${key}`; mesh.receiveShadow = false; mesh.castShadow = false;
    return { key, t, mesh, ix, tris: { 1: idx[1].length / 3, 2: idx[2].length / 3 }, water: parts.map((p) => p.wat) };
  }

  // the water of every chunk, one mesh per tier (it is few triangles), at both strides
  function mergeWater(list) {
    const out = [];
    for (const t of ['a', 'b', 'c']) {
      const ws = list.filter((c) => c.t === t);
      if (!ws.length) continue;
      const geos = {};
      for (const st of [1, 2]) {
        const pos = [], idx = [];
        for (const c of ws) for (const w of c.water) { const b = pos.length / 3; for (const v of w[st].pos) pos.push(v); for (const v of w[st].idx) idx.push(v + b); }
        geos[st] = { pos, idx };
      }
      if (!geos[1].idx.length && !geos[2].idx.length) continue;
      const mk = (g) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3)); geo.setIndex(g.idx); geo.computeVertexNormals(); geo.computeBoundingSphere(); return geo; };
      const g1 = mk(geos[1]), g2 = mk(geos[2]);
      const mesh = new THREE.Mesh(g1, waterMat);
      mesh.name = `PkgFarWater:${t}`;
      mesh.userData.lod = { 1: g1, 2: g2, tris: { 1: geos[1].idx.length / 3, 2: geos[2].idx.length / 3 } };
      out.push(mesh);
    }
    waterMeshes = out;
    return out;
  }
  let waterMeshes = [];

  // the level of detail: 'high' every post; 'phone' (Low graphics, or a short draw distance) every other post, the
  // budget (horizon.md: <= 0.6 M far triangles on a phone, <= 80 far draw calls)
  function initialLod() { return (N.quality && N.quality.tier === 'low') || Q.get('gfx') === 'phone' ? 'phone' : 'high'; }
  function setLod(tier) {
    lodTier = tier;
    const st = tier === 'phone' ? 2 : 1;
    let tris = 0, phoneTris = 0, highTris = 0, water = 0;
    for (const c of chunks) { c.mesh.geometry.setIndex(c.ix[st]); tris += c.tris[st]; highTris += c.tris[1]; phoneTris += c.tris[2]; }
    for (const w of waterMeshes) { w.geometry = w.userData.lod[st]; water += w.userData.lod.tris[st]; highTris += w.userData.lod.tris[1]; phoneTris += w.userData.lod.tris[2]; }
    Object.assign(stats, { lod: tier, triangles: tris, waterTriangles: water, budget: { drawCalls: chunks.length + waterMeshes.length + 1, maxDrawCalls: 80, highTriangles: highTris, phoneTriangles: phoneTris, maxPhoneTriangles: 600000 } });
  }

  return {
    group,
    // (main.js applyQuality: Low graphics' 3000 m draw distance is the phone budget)
    setQuality(distance) { const t = (Number.isFinite(distance) && distance <= 3000) || initialLod() === 'phone' ? 'phone' : 'high'; if (chunks.length) setLod(t); else lodTier = t; },
    update() {},
    stats: () => ({ ...stats, patches: patches.length }),
  };
}

N.PkgFar = { build };
})();
