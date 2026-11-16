(function () {
// js/terrain-mesh.js
// The ground surface: the baked height field (js/terrain.js) as a CPU-built mesh with world y in its vertices (no
// displacement shader, so culling and shadows see the real shape; PLAN.md D4).
// - 64 m chunks, each at its own level of detail by camera distance: 2, 4, 8 or 16 m between vertices, with skirts
//   hanging below their edges to hide the cracks between neighbours at different levels.
// - Chunks are drawn per TILE x TILE m tile: one mesh (one draw) per tile, rebuilt when a chunk in it changes level.
// - The bay: vertices on water drop below the water plane, so the land's edge becomes a steep seawall face.
// - Hills cast shadows through a static 8 m stand-in on the shadow proxy layer (scene-culling.js), drawn back faces
//   only so sunlit slopes don't shadow themselves while the slopes facing away still shade what lies behind them.
// - Material: createTerrainMaterial (asphalt, concrete, lawn, rock, seawall by the ground mask).

const { THREE, Terrain } = window.NYC;
const { createTerrainMaterial } = window.NYC;

const CHUNK = 64;
const TILE = 512;
const LOD_STEPS = [2, 4, 8, 16]; // metres between vertices
const LOD_DIST = [150, 400, 900]; // switch to the next level beyond these distances (m)
const HYSTERESIS = 0.1; // a chunk moves back to the finer level only 10% inside its threshold
const UPDATE_SECONDS = 0.25;
const UPDATE_MOVE = 20;
const WATER_DROP = 4; // metres below the water level for vertices on the bay
const SHADOW_STEP = 8;
const SHADOW_CELL = 500;

function buildTerrainMesh(scene) {
  const T = Terrain;
  const water = T.waterLevel;
  const extentX = (T.w - 1) * T.cell;
  const extentZ = (T.h - 1) * T.cell;
  const nx = Math.ceil(extentX / CHUNK);
  const nz = Math.ceil(extentZ / CHUNK);
  const perTile = TILE / CHUNK;
  const tilesX = Math.ceil(nx / perTile);
  const tilesZ = Math.ceil(nz / perTile);

  // Height of the mesh at a grid point (metres from the data origin, clamped to the data): land as measured, the bay
  // dropped below its surface
  // dropped under a tunnel's floor at its portals too (grade-separation.js carveAt, once it is built: rebuild())
  const surfaceY = (lx, lz) => {
    const i = Math.min(T.w - 1, Math.round(Math.min(lx, extentX) / T.cell));
    const j = Math.min(T.h - 1, Math.round(Math.min(lz, extentZ) / T.cell));
    const y = T.heights[j * T.w + i];
    const G = window.NYC.GradeSeparation;
    const carved = G && G.carveAt(T.originX + i * T.cell, T.originZ + j * T.cell);
    if (carved !== null && carved !== undefined) return Math.min(y, carved);
    return y > water + 0.05 ? y : water - WATER_DROP;
  };

  // Chunk summaries: height range (for distances & culling) and whether any of it is land
  const chunks = [];
  for (let cz = 0; cz < nz; cz++) {
    for (let cx = 0; cx < nx; cx++) {
      let lo = Infinity, hi = -Infinity, land = false;
      for (let lz = cz * CHUNK; lz <= (cz + 1) * CHUNK; lz += T.cell) {
        for (let lx = cx * CHUNK; lx <= (cx + 1) * CHUNK; lx += T.cell) {
          const y = surfaceY(lx, lz);
          if (y > water) land = true;
          lo = Math.min(lo, y);
          hi = Math.max(hi, y);
        }
      }
      chunks.push({ cx, cz, lo, hi, land, lod: LOD_STEPS.length - 1 });
    }
  }

  const material = createTerrainMaterial(window.NYC.PKG ? makeRoadsideMaskTexture() : makeMaskTexture(), window.NYC.DATA.groundMask.header);
  if (window.NYC.DATA.fullRegion || (window.NYC.PKG && new URLSearchParams(location.search).get('far') !== 'none')) {
    // (a Hometown package's far field, cities/pkg/js/pkg-far.js, always lies under its edge: the fill at boot, then the far
    // tiles)
    // A 50 m dither transition reveals the regional ground underneath without alpha blending or double interiors.
    const { positionWorld, min, clamp, floor, sin, fract, step } = window.NYC.TSL;
    const distance = min(min(positionWorld.x.sub(T.originX), positionWorld.x.negate().add(T.originX + extentX)),
      min(positionWorld.z.sub(T.originZ), positionWorld.z.negate().add(T.originZ + extentZ)));
    const noise = fract(sin(floor(positionWorld.x.mul(2)).mul(12.9898).add(floor(positionWorld.z.mul(2)).mul(78.233))).mul(43758.5453));
    material.opacityNode = step(noise, clamp(distance.div(50), 0, 1));
    material.alphaTest = 0.5;
  }
  const group = new THREE.Group();
  group.name = 'SFTerrain';

  // Writes one chunk at its level into the arrays: (n + 1)^2 grid vertices, then a skirt along each edge
  function writeChunk(c, pos, nrm, idx) {
    const step = LOD_STEPS[c.lod];
    const n = CHUNK / step;
    const x0 = c.cx * CHUNK, z0 = c.cz * CHUNK;
    const base = pos.length / 3;
    const skirt = Math.max(2, step / 2);
    // (each grid point's height read once, with a ring round the chunk for the central differences: five surfaceY()
    // reads a vertex were most of a tile's rebuild, which runs inside a frame as the camera moves)
    const m = n + 3;
    const ys = new Float64Array(m * m);
    for (let b = -1; b <= n + 1; b++) {
      for (let a = -1; a <= n + 1; a++) ys[(b + 1) * m + a + 1] = surfaceY(Math.max(0, x0 + a * step), Math.max(0, z0 + b * step));
    }
    const yAt = (a, b) => ys[(b + 1) * m + a + 1];
    for (let b = 0; b <= n; b++) {
      for (let a = 0; a <= n; a++) {
        const y = yAt(a, b);
        pos.push(T.originX + x0 + a * step, y, T.originZ + z0 + b * step);
        // central differences at this level's spacing (one-sided at the data's edges)
        const gx = (yAt(a + 1, b) - yAt(a - 1, b)) / (2 * step);
        const gz = (yAt(a, b + 1) - yAt(a, b - 1)) / (2 * step);
        const len = Math.hypot(gx, 1, gz);
        nrm.push(-gx / len, 1 / len, -gz / len);
      }
    }
    const row = n + 1;
    for (let b = 0; b < n; b++) {
      for (let a = 0; a < n; a++) {
        const k = base + b * row + a;
        idx.push(k, k + row, k + 1, k + 1, k + row, k + row + 1);
      }
    }
    // skirts: a copy of each edge hanging `skirt` m lower, joined to the edge facing outwards
    const edges = [
      { at: (t) => t, flip: false }, // north edge (b = 0), a = t
      { at: (t) => n * row + t, flip: true }, // south edge
      { at: (t) => t * row, flip: true }, // west edge
      { at: (t) => t * row + n, flip: false } // east edge
    ];
    for (const e of edges) {
      const s0 = pos.length / 3;
      for (let t = 0; t <= n; t++) {
        const k = base + e.at(t);
        pos.push(pos[3 * k], pos[3 * k + 1] - skirt, pos[3 * k + 2]);
        nrm.push(nrm[3 * k], nrm[3 * k + 1], nrm[3 * k + 2]);
      }
      for (let t = 0; t < n; t++) {
        const top0 = base + e.at(t), top1 = base + e.at(t + 1), bot0 = s0 + t, bot1 = s0 + t + 1;
        if (e.flip) idx.push(top0, bot0, top1, top1, bot0, bot1);
        else idx.push(top0, top1, bot0, top1, bot1, bot0);
      }
    }
  }

  const tiles = [];
  for (let tz = 0; tz < tilesZ; tz++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const members = chunks.filter((c) => c.land && Math.floor(c.cx / perTile) === tx && Math.floor(c.cz / perTile) === tz);
      if (!members.length) continue;
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
      mesh.name = 'TerrainTile';
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      if (tiles.length) mesh.userData.sharesPipelineWith = tiles[0].mesh;
      group.add(mesh);
      tiles.push({ mesh, members, key: '' });
    }
  }

  // (perf) A tile's rebuild: each chunk's vertices kept from its last build at its level, so a level change rewrites only
  // the chunks that changed and copies the rest. A tile was written from scratch whenever one of its 64 chunks changed
  // level (from the air ~35 tiles a second: the terrain's update 2.6% of the main thread, now 0.6%)
  function chunkData(c) {
    if (c.data && c.data.lod === c.lod) return c.data;
    const pos = [], nrm = [], idx = [];
    writeChunk(c, pos, nrm, idx);
    // (its bounds from its vertices as written: a tunnel portal's carve and the skirts included)
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let k = 0; k < pos.length; k += 3) {
      for (let q = 0; q < 3; q++) { const v = pos[k + q]; if (v < b[q]) b[q] = v; if (v > b[q + 3]) b[q + 3] = v; }
    }
    return (c.data = { lod: c.lod, pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint32Array(idx), b });
  }
  function rebuildTile(tile) {
    const key = tile.members.map((c) => c.lod).join('');
    if (key === tile.key) return false;
    tile.key = key;
    let nv = 0, ni = 0;
    const parts = tile.members.map(chunkData);
    for (const d of parts) { nv += d.pos.length / 3; ni += d.idx.length; }
    // a new geometry the size of what the tile holds (16-bit indices while the vertices allow), the old one disposed:
    // three creates a buffer mapped with its data at once, cheaper on the main thread than writing the new data over
    // a kept one (writeBuffer), and nothing is held beyond the tile's current levels
    const pa = new Float32Array(nv * 3), na = new Float32Array(nv * 3), ia = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let v = 0, i = 0;
    for (const d of parts) {
      pa.set(d.pos, v * 3);
      na.set(d.nrm, v * 3);
      for (let k = 0; k < d.idx.length; k++) ia[i + k] = d.idx[k] + v;
      v += d.pos.length / 3;
      i += d.idx.length;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pa, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(na, 3));
    g.setIndex(new THREE.BufferAttribute(ia, 1));
    // bounds: the chunks' own, from their vertices
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const { b } of parts) {
      x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); z0 = Math.min(z0, b[2]);
      x1 = Math.max(x1, b[3]); y1 = Math.max(y1, b[4]); z1 = Math.max(z1, b[5]);
    }
    g.boundingBox = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    tile.mesh.geometry.dispose();
    tile.mesh.geometry = g;
    return true;
  }

  // Level of each chunk from the camera's distance to it (with hysteresis)
  function chooseLevels(px, py, pz) {
    for (const c of chunks) {
      if (!c.land) continue;
      const x0 = T.originX + c.cx * CHUNK, z0 = T.originZ + c.cz * CHUNK;
      const dx = Math.max(x0 - px, 0, px - (x0 + CHUNK));
      const dz = Math.max(z0 - pz, 0, pz - (z0 + CHUNK));
      const dy = Math.max(c.lo - py, 0, py - c.hi);
      const d = Math.hypot(dx, dy, dz);
      let lod = 0;
      while (lod < LOD_DIST.length && d > LOD_DIST[lod]) lod++;
      // stay finer while within the hysteresis band of the threshold just crossed outwards
      if (lod > c.lod && d < LOD_DIST[lod - 1] * (1 + HYSTERESIS)) lod = c.lod;
      c.lod = lod;
    }
  }

  const last = { x: Infinity, y: Infinity, z: Infinity, t: -Infinity, rebuilt: 0 };
  function update(cameraPosition, elapsed) {
    const { x, y, z } = cameraPosition;
    if (elapsed - last.t < UPDATE_SECONDS) return;
    if (Math.hypot(x - last.x, y - last.y, z - last.z) < UPDATE_MOVE) return;
    last.x = x; last.y = y; last.z = z; last.t = elapsed;
    chooseLevels(x, y, z);
    for (const tile of tiles) if (rebuildTile(tile)) last.rebuilt++;
  }

  // Start at the coarsest level everywhere (a first update() refines around the camera)
  for (const tile of tiles) rebuildTile(tile);

  group.add(...buildShadowCaster(surfaceY, extentX, extentZ));
  scene.add(group);
  console.info(`[terrain] ${chunks.filter((c) => c.land).length} land chunks of ${CHUNK} m in ${tiles.length} tiles`);
  // Every tile built again at its current levels (after grade-separation.js has carved the portals)
  function rebuild() {
    for (const c of chunks) c.data = null; // (the heights under them changed)
    for (const tile of tiles) {
      tile.key = '';
      rebuildTile(tile);
    }
  }

  return {
    group,
    update,
    rebuild,
    stats: () => ({
      tiles: tiles.length,
      visibleTiles: tiles.filter((t) => t.mesh.visible).length,
      triangles: tiles.reduce((s, t) => s + t.mesh.geometry.index.count / 3, 0),
      lods: LOD_STEPS.map((_, l) => chunks.filter((c) => c.land && c.lod === l).length),
      rebuilt: last.rebuilt
    })
  };
}

// The ground mask as a single-channel texture, read texel by texel (one per page: a Hometown package's curb island
// tops read the same one, sf-ground.js)
let maskTexture = null;
function makeMaskTexture() {
  if (maskTexture) return maskTexture;
  const { header, mask } = window.NYC.DATA.groundMask;
  const tex = new THREE.DataTexture(mask, header.w, header.h, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.needsUpdate = true;
  return (maskTexture = tex);
}

// (a Hometown package) The ground mask the terrain surface reads: the land under the curb islands pulled back a cell
// from the roadway. Every bit of land in a package is a curb island's top (sf-ground.js), so the terrain shows only on
// the roadway (and the shore strips round the water); but the compiler's mask marks a cell as an island's from any
// overlap (tools/hometown/compile.py raster: its land runs up to a cell past the curb), and that cell, drawn on the
// asphalt, was a stepped strip of grass along every curb with no sidewalk (a divided road's median). Here each land
// cell next to an asphalt one (of its eight) is asphalt; the island tops still read the mask as compiled
// (makeMaskTexture), the shore classes (water's edge 5, water 6, wet sand 11) are left as they are.
let roadsideTexture = null;
function roadsideMask(mask, w, h) {
  const n = w * h, row = new Uint8Array(n), out = new Uint8Array(mask);
  // (land: the classes under the curb islands, 2-4 and 7-10; one table lookup a cell)
  const land = new Uint8Array(256);
  for (const c of [2, 3, 4, 7, 8, 9, 10]) land[c] = 1;
  // the asphalt cells and their left and right neighbours, row by row, then those rows' up and down neighbours
  for (let j = 0, r = 0; j < h; j++, r += w) {
    for (let i = 0; i < w; i++) {
      if (mask[r + i] !== 0) continue;
      row[r + i] = 1;
      if (i > 0) row[r + i - 1] = 1;
      if (i + 1 < w) row[r + i + 1] = 1;
    }
  }
  for (let k = 0; k < n; k++) {
    if (!land[mask[k]]) continue;
    if (row[k] || (k >= w && row[k - w]) || (k + w < n && row[k + w])) out[k] = 0;
  }
  return out;
}
function makeRoadsideMaskTexture() {
  if (roadsideTexture) return roadsideTexture;
  const { header, mask } = window.NYC.DATA.groundMask;
  const tex = new THREE.DataTexture(roadsideMask(mask, header.w, header.h), header.w, header.h, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.needsUpdate = true;
  return (roadsideTexture = tex);
}

// Hills' shadows: the surface at SHADOW_STEP m, cut into SHADOW_CELL m cells on the shadow proxy layer
function buildShadowCaster(surfaceY, extentX, extentZ) {
  const T = Terrain;
  const material = new THREE.MeshBasicNodeMaterial({ color: 0x000000, side: THREE.FrontSide });
  material.shadowSide = THREE.BackSide;
  material.name = 'ShadowProxy';
  const meshes = [];
  for (let z0 = 0; z0 < extentZ; z0 += SHADOW_CELL) {
    for (let x0 = 0; x0 < extentX; x0 += SHADOW_CELL) {
      const nxs = Math.ceil(Math.min(SHADOW_CELL, extentX - x0) / SHADOW_STEP);
      const nzs = Math.ceil(Math.min(SHADOW_CELL, extentZ - z0) / SHADOW_STEP);
      const pos = [];
      const idx = [];
      for (let b = 0; b <= nzs; b++) {
        for (let a = 0; a <= nxs; a++) {
          const lx = Math.min(extentX, x0 + a * SHADOW_STEP), lz = Math.min(extentZ, z0 + b * SHADOW_STEP);
          pos.push(T.originX + lx, surfaceY(lx, lz), T.originZ + lz);
        }
      }
      for (let b = 0; b < nzs; b++) {
        for (let a = 0; a < nxs; a++) {
          const k = b * (nxs + 1) + a;
          idx.push(k, k + nxs + 1, k + 1, k + 1, k + nxs + 1, k + nxs + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, material);
      mesh.name = 'ShadowProxy';
      mesh.layers.set(window.NYC.SHADOW_PROXY_LAYER);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.userData.shadowProxy = true;
      if (meshes.length) mesh.userData.sharesPipelineWith = meshes[0];
      meshes.push(mesh);
    }
  }
  return meshes;
}

Object.assign(window.NYC, { buildTerrainMesh, groundMaskTexture: makeMaskTexture, roadsideMask });
})();
