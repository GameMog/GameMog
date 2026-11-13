(function () {
// cities/pkg/js/pkg-far.js
// (Mog City, Hometown) The land past a package's compiled tiles, to the horizon: no sea round a dry town, real 3DEP
// ground and its water at their own heights. region.js buildSFRegion hands a package here (NYC.PkgFar.build).
//
//   at boot, synchronously, zero bytes: the FILL (a 400 m skirt round the core at its edge heights, sloping 20 m down)
//     and the APRON (from there to 80 km, past the camera's far plane): the town never shows sea, even for a frame
//   after boot, off the critical path: the FAR TILES the compiler wrote (tools/hometown/far.py, PKG.far: hg1 L3 tiles
//     of 65 x 65 posts at 64 grid m out to ~10 km, L5 at 256 grid m out to ~30 km, data/far/*.bin.gz), placed in the
//     session frame (x = (grid m - 512 c0) / k0: a uniform grid), added as Terrain patches (finest first, `surface`:
//     groundAt over far water is its 3DEP height, never the dry sentinel) and drawn: vertex colours by class (land,
//     arid land, water) and slope, a water mesh over the hydro-flattened water at its height, skirts at every tile
//     edge; the fill and boot apron then give way to an apron from the far tiles' outer edge
// It never changes the core: far meshes hide where the core's terrain is drawn, the core's own edge dithers over them
// (terrain-mesh.js), and the street network was built on the core alone (main.js patchesEnabled). Sets
// NYC.FLIGHT_BOUNDS to the 10 km tier (the helicopter), DATA.pkgFar = { tiers, extent, stats } (no .city: sf-map.js
// reads that as map bounds), and the fog: an arid majority in the near tier asks for 'clear' (an explicit ?fog wins).
//   ?far=0     the fill and apron only (no tiles)          ?far=none  nothing (region.js returns before; the old sea)
//   ?farDebug=1  far water drawn #00FFFF, the fill and apron #00FF00 (the sea test: no SF bay plane is left to show)
const N = (window.NYC = window.NYC || {});

const APRON_R = 80000;          // m: past the 60 km far plane
const FILL_W = 400, FILL_DROP = 20;
const COLORS = { land: 0x6f7b4f, arid: 0xb49f7a, rock: 0x7d776c, water: 0x40525c, wet: 0x5f6e4f };

function build(scene) {
  const { THREE, Terrain: T, createWaterMaterial } = N;
  const P = N.PKG, Q = new URLSearchParams(location.search), mode = Q.get('far'), debug = Q.get('farDebug') === '1';
  const group = new THREE.Group();
  group.name = 'PkgFar';
  scene.add(group);
  const core = { x0: T.originX, z0: T.originZ, x1: T.originX + (T.w - 1) * T.cell, z1: T.originZ + (T.h - 1) * T.cell };
  const fr = P.frame || {}, arid = (fr.lon0 ?? 0) < -104 && (fr.lat0 ?? 90) < 37.5;
  const stats = { fill: true, tiles: 0, triangles: 0, waterTriangles: 0, loadMs: null, error: null, fog: null };
  const landMat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide }); // (skirts face either way)
  const flatMat = new THREE.MeshStandardNodeMaterial({ color: debug ? 0x00ff00 : arid ? COLORS.arid : COLORS.land, roughness: 1, metalness: 0 });
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
  const tiles = [], patches = [];
  let apron = null, farRect = null;
  if (mode !== '0' && P.far && Array.isArray(P.far.tiles) && P.far.tiles.length && N.fetchBin) {
    const t0 = performance.now();
    load().then(() => { stats.loadMs = Math.round(performance.now() - t0); }, (e) => { stats.error = String(e && e.message || e); console.warn('[pkg-far]', e); });
  }

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
      dec.push({ tier: h.tier, C: h.C, R: h.R, n, x0, z0, s, H, q, cls });
    }
    const rectOf = (tier) => {
      const ts = dec.filter((d) => d.tier === tier);
      if (!ts.length) return null;
      return { x0: Math.min(...ts.map((d) => d.x0)), z0: Math.min(...ts.map((d) => d.z0)), x1: Math.max(...ts.map((d) => d.x0 + (d.n - 1) * d.s)), z1: Math.max(...ts.map((d) => d.z0 + (d.n - 1) * d.s)) };
    };
    const bRect = rectOf('b'), cRect = rectOf('c');
    // patches: B then C (finest first, after any landmark patch)
    for (const tier of ['b', 'c']) for (const d of dec) if (d.tier === tier) patches.push(T.addPatch({ x0: d.x0, z0: d.z0, stepX: d.s, stepZ: d.s, nx: d.n, nz: d.n, h: d.H, rect: true, surface: true, far: tier }));
    // meshes
    const inner = { x0: core.x0 + 50, z0: core.z0 + 50, x1: core.x1 - 50, z1: core.z1 - 50 };
    for (const d of dec) {
      const hideRect = d.tier === 'b' ? inner : bRect && { x0: bRect.x0 + d.s, z0: bRect.z0 + d.s, x1: bRect.x1 - d.s, z1: bRect.z1 - d.s };
      const under = d.tier === 'b' ? core : bRect;
      const m = tileMeshes(d, hideRect, under);
      for (const mesh of m) group.add(mesh);
      tiles.push({ d, meshes: m });
    }
    // the outer apron from the far tiles' edge; the boot fill and apron out
    farRect = cRect || bRect;
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
    if (bRect) N.FLIGHT_BOUNDS = { minX: bRect.x0, maxX: bRect.x1, minZ: bRect.z0, maxZ: bRect.z1 };
    // fog: an arid majority in the near tier reads clear
    let a = 0, all = 0;
    for (const d of dec) if (d.tier === 'b') for (let i = 0; i < d.cls.length; i++) { all++; if (d.cls[i] === 2) a++; }
    stats.fog = all && a / all > 0.5 ? 'clear' : 'haze';
    if (stats.fog === 'clear') { N.pkgFarFog = 'clear'; N.setFogPreset?.('clear'); }
    stats.tiles = dec.length;
    N.DATA.pkgFar = { tiers: { b: bRect, c: cRect }, extent: farRect, stats };
  }

  function tileMeshes(d, hideRect, under) {
    const { n, x0, z0, s, H, q, cls } = d;
    const inR = (x, z, r) => r && x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
    const pos = [], col = [], idx = [], widx = [], wpos = [];
    const cLand = new THREE.Color(COLORS.land), cArid = new THREE.Color(COLORS.arid), cRock = new THREE.Color(COLORS.rock), cWater = new THREE.Color(COLORS.water), c = new THREE.Color();
    const ys = new Float32Array(n * n), hide = new Uint8Array(n * n);
    // the ground's slope at each post from Terrain.heightAt over the loaded patches (the same at a shared edge from
    // either tile: a tile's own grid has no neighbour past its edge), kept for the normals
    const G = new Float32Array(n * n * 2);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, x = x0 + i * s, z = z0 + j * s;
      G[k * 2] = (T.heightAt(x + s, z) - T.heightAt(x - s, z)) / (2 * s);
      G[k * 2 + 1] = (T.heightAt(x, z + s) - T.heightAt(x, z - s)) / (2 * s);
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, x = x0 + i * s, z = z0 + j * s;
      // (under the finer ground: just below it, so the finer one always wins where both are drawn)
      let y = H[k];
      if (inR(x, z, under)) y = T.heightAt(x, z) - (d.tier === 'b' ? 0.15 : 1.0);
      ys[k] = y; hide[k] = inR(x, z, hideRect) ? 1 : 0;
      const slope = Math.hypot(G[k * 2], G[k * 2 + 1]);
      c.copy(cls[k] === 2 ? cArid : cLand);
      if (cls[k] === 1) c.copy(cWater);
      c.lerp(cRock, Math.min(1, Math.max(0, (slope - 0.35) / 0.4)));
      // (a little per-post variation: deterministic, by global post position, so shared edges match)
      const gi = d.C * 64 + i, gj = d.R * 64 + j, nz = Math.sin(gi * 12.9898 + gj * 78.233) * 43758.5453, v = 0.93 + 0.1 * (nz - Math.floor(nz));
      c.multiplyScalar(v);
      pos.push(x, y, z); col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j + 1 < n; j++) for (let i = 0; i + 1 < n; i++) {
      const k = j * n + i, cs = [k, k + 1, k + n, k + n + 1];
      if (cs.every((v) => hide[v]) || cs.some((v) => !q[v])) continue;
      if (cs.every((v) => cls[v] === 1)) {
        const b = wpos.length / 3;
        for (const v of cs) wpos.push(pos[v * 3], H[v] + 0.08, pos[v * 3 + 2]);
        widx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
        continue;
      }
      idx.push(k, k + n, k + 1, k + 1, k + n, k + n + 1);
    }
    // skirts round the tile (cracks against coarser / finer neighbours)
    const sk = Math.max(3, (d.s * 64) / 128);
    const edges = [Array.from({ length: n }, (_, i) => i), Array.from({ length: n }, (_, i) => (n - 1) * n + i), Array.from({ length: n }, (_, i) => i * n), Array.from({ length: n }, (_, i) => i * n + n - 1)];
    for (const e of edges) {
      const base = pos.length / 3;
      for (const k of e) { pos.push(pos[k * 3], pos[k * 3 + 1] - sk, pos[k * 3 + 2]); col.push(col[k * 3], col[k * 3 + 1], col[k * 3 + 2]); }
      for (let i = 0; i + 1 < n; i++) { if (hide[e[i]] && hide[e[i + 1]]) continue; idx.push(e[i], base + i, e[i + 1], e[i + 1], base + i, base + i + 1); }
    }
    const out = [];
    if (idx.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      // normals from the ground's slope (G), and a skirt lit as the ground it hangs from: its sideways normal would
      // shade it dark, a line along every step between tiers seen from afar
      const nrm = new Float32Array(pos.length);
      for (let k = 0; k < n * n; k++) {
        const gx = G[k * 2], gz = G[k * 2 + 1], L = Math.hypot(gx, 1, gz);
        nrm[k * 3] = -gx / L; nrm[k * 3 + 1] = 1 / L; nrm[k * 3 + 2] = -gz / L;
      }
      for (let e = 0; e < 4; e++) for (let i = 0; i < n; i++) { const top = edges[e][i], sv = n * n + e * n + i; nrm[sv * 3] = nrm[top * 3]; nrm[sv * 3 + 1] = nrm[top * 3 + 1]; nrm[sv * 3 + 2] = nrm[top * 3 + 2]; }
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, landMat);
      mesh.name = `PkgFar:${d.tier}/${d.C}/${d.R}`; mesh.receiveShadow = false; mesh.castShadow = false;
      out.push(mesh);
      stats.triangles += idx.length / 3;
    }
    if (widx.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
      geo.setIndex(widx);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, waterMat);
      mesh.name = `PkgFarWater:${d.tier}/${d.C}/${d.R}`;
      out.push(mesh);
      stats.waterTriangles += widx.length / 3;
    }
    return out;
  }

  return {
    group,
    setQuality() {},
    update() {},
    stats: () => ({ ...stats, patches: patches.length }),
  };
}

N.PkgFar = { build };
})();
