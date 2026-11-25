(function () {
// js/sky-occlusion.js (Mog City): the desktop "high quality lighting" tier (window.NYC.HQL), shared by both engines
// (js/main.js for New York, cities/sf/js/main.js for San Francisco and the Hometown towns).
//
// Ported from Ben Houston's enhanced Slop New York (https://github.com/bhouston/slop-newyork, branch ssr-brdf:
// js/sky-occlusion.js, commits aa01158 "Occlude the sky's light by the skyline around each pixel" and a924635 "Fill
// the sky the buildings hide with the light they bounce"; write-up https://ben3d.ca/blog/enhanced-slop-new-york-lighting),
// under the MIT License of Slop New York (Copyright (c) 2026 Mr.doob; see LICENSE and NOTICE).
//
// What it is: a top-down max-height map of the city's buildings (2 m texels, a max-mip pyramid so a far step can't miss
// a thin tower), and for each shaded point the horizon found in 16 compass directions by marching out through it, 4 m
// to 256 m, with the cosine-weighted sky above the horizon integrated per direction in closed form (the slice integral
// of GTAO, run over the city's height map in place of a depth buffer). The share of the sky the buildings hide is
// filled with the light they bounce: the ground colour of the time of day's hemisphere light, scaled by its canyon
// bounce. It replaces the height-only canyon AO of the city's materials (canyonSkyAONode) on the high tier only.
//
// How Mog City differs from the fork: three.js here (pinned bc7d0b3c38) has no indirect light provider lists
// (bhouston/three.js#188) and the pipeline has no depth/normal pre-pass, so the visibility is evaluated in each city
// material's own aoNode (positionWorld, normalWorld) instead of in a half-resolution screen pass, and the bounce is
// added to the material's outgoing light (albedo x bounce x hidden share) rather than given as an indirect source. Far
// fragments (past FAR_FADE m from the camera) skip the march and keep the old canyon term. The map is built from the
// colliders (outline + roof height) of whichever city is loaded: New York's Manhattan frame (4 x 16 km, as the fork),
// or a window round San Francisco or a Hometown town sized to its buildings, and a streamed tile's colliders are added
// as it loads (addColliders); see build() and watchTiles().
//
// Off (the default on every tier below high, on phones, on WebGL 2), nothing here is used: the materials build exactly
// the nodes they built before (tsl-materials.js skyAO), so the default look is unchanged.
//
// The switch: ?light=hq|on|off for this load; else the saved choice (localStorage 'mc.light.v1': 'on' | 'off', the
// pause menu's Graphics panel), else on for the high tier on a computer with WebGPU, off otherwise.
const { THREE } = window.NYC;
const TSL = window.NYC.TSL;
const { Fn, texture, uniform, vec2, vec3, float, max, min, atan, sin, dot, mix, smoothstep, If, Loop, diffuseColor, metalness } = TSL;

const KEY = 'mc.light.v1';
const DBG = new Set((() => { try { return (new URLSearchParams(location.search).get('hqldbg') || '').split(','); } catch (e) { return []; } })());
const MAX_HEIGHT = 600; // m, above One WTC
const SLICES = 16;
// m from the point, 4 to 256 in steps of sqrt(2) (the fork's). A step answers for the ground up to the next one and
// across the width of its slice: it is read at the mip whose texels are a quarter of the distance.
const STEPS = Array.from({ length: 13 }, (_, i) => 4 * 2 ** (i / 2));
const TEXELS_PER_STEP = 4;
const WALL_CLEARANCE = 0.5; // of the distance: the slices along a wall turned outward, so they don't read the wall
const HEIGHT_BIAS = 0.5; // m
const FAR_FADE = [700, 900]; // m from the camera: the march fades out to the old canyon term (small and far: no gain)

// ---------------------------------------------------------------- the switch
let _on = null;
function wanted() {
  let q = null;
  try { q = new URLSearchParams(location.search).get('light'); } catch (e) { /* no URL */ }
  if (q === 'hq' || q === 'on' || q === 'high') return { on: true, why: 'url' };
  if (q === 'off' || q === 'low') return { on: false, why: 'url' };
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
  if (saved === 'on' || saved === 'off') return { on: saved === 'on', why: 'saved' };
  const Q = window.NYC.quality, G = window.mcGfx;
  // (asked before the engine has picked its tier: off for now, and asked again later, not remembered)
  if (!Q || !Q.tier) return { on: false, why: 'early', early: true };
  let phone = false;
  try { phone = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches; } catch (e) { /* old */ }
  const tier = Q && Q.tier, webgpu = !!navigator.gpu && (!Q || Q.backend !== 'webgl2');
  return { on: tier === 'high' && !phone && webgpu && !(G && Q && Q.why === 'phone'), why: 'tier' };
}
// Decided once, the first time a material asks (the quality tier is known by then), and the same for the whole load
function on() {
  if (_on === null) {
    const w = wanted();
    if (w.early) { S.early++; return false; }
    _on = !!w.on;
    S.why = w.why;
    if (_on) console.log(`[light] high quality lighting on (${w.why})`);
  }
  return _on;
}
// The pause menu's choice: 'on' | 'off' | 'auto', for the next load
function setChoice(v) {
  try {
    if (v === 'on' || v === 'off') localStorage.setItem(KEY, v); else localStorage.removeItem(KEY);
  } catch (e) { /* private mode: this page only */ }
  S.choice = v === 'on' || v === 'off' ? v : 'auto';
  return S.choice;
}
function savedChoice() {
  try { const v = localStorage.getItem(KEY); return v === 'on' || v === 'off' ? v : 'auto'; } catch (e) { return 'auto'; }
}

// ---------------------------------------------------------------- the height map
// ponytail (the fork's): a 2D canvas holds 8 bits, so the height is stored as its square root, rounded down (0.6 m
// steps at 20 m, 4.5 m at 500 m, never above the roof)
const encodeHeight = (h) => Math.floor(255 * Math.sqrt(Math.min(Math.max(h, 0), MAX_HEIGHT) / MAX_HEIGHT));

const M = { tex: null, W: 0, D: 0, level0: null, canvas: null, ctx: null, built: false, dirty: null, flushAt: 0 };
// (uniforms: where the map is, so the size and frame can be set once the city is known; the shaders are the same)
const uOrigin = uniform(new THREE.Vector2(0, 0));
const uSize = uniform(new THREE.Vector2(1, 1)); // m the map covers
const uMpt = uniform(2); // m a texel
const uReady = uniform(0); // 0 until the map holds the city: the old canyon term meanwhile
const uBounce = uniform(new THREE.Color(0, 0, 0)); // the irradiance of a surface that sees only buildings
const uBounceGain = uniform(1.3); // (tuned against the old canyon term's brightness in a midtown street)
const AO_FLOOR = 0.25;

// The texture (fixed size for the load, allocated on the first material that asks, so its shaders bind it once):
// New York's Manhattan frame 2048 x 8192 (4 x 16 km at 2 m, as the fork), else 4096 square, its scale set by build()
function ensureTexture() {
  if (M.tex) return M.tex;
  const ny = (window.NYC.CITY || 'ny') === 'ny';
  M.W = ny ? 2048 : 4096; M.D = ny ? 8192 : 4096;
  M.level0 = new Uint8Array(M.W * M.D);
  const mipmaps = [{ data: M.level0, width: M.W, height: M.D }];
  for (let w = M.W, h = M.D; w > 1 || h > 1;) {
    w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
    mipmaps.push({ data: new Uint8Array(w * h), width: w, height: h });
  }
  const t = new THREE.DataTexture(M.level0, M.W, M.D, THREE.RedFormat, THREE.UnsignedByteType);
  t.mipmaps = mipmaps;
  t.generateMipmaps = false;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  t.name = 'SkyOcclusionHeights';
  M.tex = t;
  return t;
}

// The frame: New York's island bounds (centred, as the fork's), else the colliders' own box (a town or San Francisco)
function frameFor(colliders) {
  ensureTexture();
  const ny = (window.NYC.CITY || 'ny') === 'ny';
  let cx, cz, mpt = 2;
  if (ny && window.NYC.ISLAND_BOUNDS) {
    const b = window.NYC.ISLAND_BOUNDS;
    cx = (b.minX + b.maxX) / 2; cz = (b.minZ + b.maxZ) / 2;
  } else {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const c of colliders) {
      if (!(c.maxY > 0) || !Number.isFinite(c.minX)) continue;
      if (c.maxX - c.minX > 3000 || c.maxZ - c.minZ > 3000) continue; // (a bridge's span: not a building)
      x0 = Math.min(x0, c.minX); x1 = Math.max(x1, c.maxX); z0 = Math.min(z0, c.minZ); z1 = Math.max(z1, c.maxZ);
    }
    if (!Number.isFinite(x0)) { x0 = -1000; x1 = 1000; z0 = -1000; z1 = 1000; }
    const span = Math.max(x1 - x0, z1 - z0) + 600; // a 300 m margin each side
    mpt = Math.max(2, Math.ceil(span / M.W)); // 2 m texels up to 8 km across, coarser past it
    cx = (x0 + x1) / 2; cz = (z0 + z1) / 2;
  }
  const originX = Math.round(cx - M.W * mpt / 2), originZ = Math.round(cz - M.D * mpt / 2);
  uOrigin.value.set(originX, originZ);
  uSize.value.set(M.W * mpt, M.D * mpt);
  uMpt.value = mpt;
  return { originX, originZ, mpt };
}

function canvasFor() {
  if (!M.canvas) {
    M.canvas = document.createElement('canvas');
    M.canvas.width = M.W; M.canvas.height = M.D;
    M.ctx = M.canvas.getContext('2d', { willReadFrequently: true });
  }
  return M.ctx;
}

// Draws colliders (outline + roof) into the canvas, lowest first so the tallest wins where they overlap; returns their
// box in texels (the region to read back), or null
function drawColliders(colliders) {
  const ctx = canvasFor(), mpt = uMpt.value, ox = uOrigin.value.x, oz = uOrigin.value.y;
  ctx.setTransform(1 / mpt, 0, 0, 1 / mpt, -ox / mpt, -oz / mpt);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const c of colliders.filter((c) => c && c.maxY > 0 && !c.carOnly).sort((a, b) => a.maxY - b.maxY)) {
    if (c.maxX - c.minX > 3000 || c.maxZ - c.minZ > 3000) continue;
    const v = encodeHeight(c.maxY);
    if (!v) continue;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.beginPath();
    const poly = c.polygon;
    if (poly) {
      const rings = Array.isArray(poly) ? [poly] : [poly.outer, ...(poly.holes || [])];
      for (const ring of rings) {
        if (!ring || ring.length < 3) continue;
        ring.forEach((p, i) => { const x = p.x ?? p[0], z = p.z ?? p[1]; if (i) ctx.lineTo(x, z); else ctx.moveTo(x, z); });
        ctx.closePath();
      }
    } else if (c.obb) {
      const o = c.obb;
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.lineTo(o.cx + sx * o.hx * o.cs + sz * o.hz * o.sn, o.cz - sx * o.hx * o.sn + sz * o.hz * o.cs);
      }
      ctx.closePath();
    } else {
      ctx.rect(c.minX, c.minZ, c.maxX - c.minX, c.maxZ - c.minZ);
    }
    ctx.fill('evenodd');
    x0 = Math.min(x0, c.minX); x1 = Math.max(x1, c.maxX); z0 = Math.min(z0, c.minZ); z1 = Math.max(z1, c.maxZ);
  }
  if (!Number.isFinite(x0)) return null;
  const tx0 = Math.max(0, Math.floor((x0 - ox) / mpt) - 1), tx1 = Math.min(M.W - 1, Math.ceil((x1 - ox) / mpt) + 1);
  const tz0 = Math.max(0, Math.floor((z0 - oz) / mpt) - 1), tz1 = Math.min(M.D - 1, Math.ceil((z1 - oz) / mpt) + 1);
  return tx1 >= tx0 && tz1 >= tz0 ? { x0: tx0, x1: tx1, z0: tz0, z1: tz1 } : null;
}

// Draws the triangles of the opaque meshes under a root into level 0 from above, keeping the tallest (the fork's: for
// models whose colliders are coarser than they are, New York's landmarks)
function rasterizeMeshes(root) {
  if (!root) return;
  const heights = M.level0, W = M.W, D = M.D, mpt = uMpt.value, ox = uOrigin.value.x, oz = uOrigin.value.y;
  root.updateWorldMatrix(true, true);
  const matrix = new THREE.Matrix4(), inst = new THREE.Matrix4(), v = new THREE.Vector3();
  root.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.visible || !mesh.geometry || (mesh.material && mesh.material.transparent)) return;
    const position = mesh.geometry.attributes.position, index = mesh.geometry.index;
    if (!position) return;
    const points = new Float32Array(position.count * 3);
    for (let instance = 0; instance < (mesh.isInstancedMesh ? mesh.count : 1); instance++) {
      matrix.copy(mesh.matrixWorld);
      if (mesh.isInstancedMesh) matrix.multiply(inst.fromArray(mesh.instanceMatrix.array, instance * 16));
      for (let i = 0; i < position.count; i++) {
        v.fromBufferAttribute(position, i).applyMatrix4(matrix);
        points[i * 3] = (v.x - ox) / mpt; points[i * 3 + 1] = (v.z - oz) / mpt; points[i * 3 + 2] = v.y;
      }
      for (let t = 0, n = index ? index.count : position.count; t + 2 < n; t += 3) {
        const a = (index ? index.getX(t) : t) * 3, b = (index ? index.getX(t + 1) : t + 1) * 3, c = (index ? index.getX(t + 2) : t + 2) * 3;
        const ax = points[a], az = points[a + 1], bx = points[b], bz = points[b + 1], cx = points[c], cz = points[c + 1];
        const area = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
        if (Math.abs(area) < 1e-6) continue; // a wall, seen edge-on
        const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 1, Math.floor(Math.max(ax, bx, cx)));
        const z0 = Math.max(0, Math.floor(Math.min(az, bz, cz))), z1 = Math.min(D - 1, Math.floor(Math.max(az, bz, cz)));
        for (let z = z0; z <= z1; z++) {
          for (let x = x0; x <= x1; x++) {
            const px = x + 0.5, pz = z + 0.5;
            const wb = ((px - ax) * (cz - az) - (pz - az) * (cx - ax)) / area;
            const wc = ((bx - ax) * (pz - az) - (bz - az) * (px - ax)) / area;
            if (wb < 0 || wc < 0 || wb + wc > 1) continue;
            const h = encodeHeight(points[a + 2] * (1 - wb - wc) + points[b + 2] * wb + points[c + 2] * wc);
            if (h > heights[z * W + x]) heights[z * W + x] = h;
          }
        }
      }
    }
  });
}

// Reads a region of the canvas back into level 0 (keeping the taller: meshes rasterized there stay), then the max-mip
// pyramid over it
function readBack(r) {
  const ctx = canvasFor(), W = M.W;
  const w = r.x1 - r.x0 + 1, h = r.z1 - r.z0 + 1;
  const rgba = ctx.getImageData(r.x0, r.z0, w, h).data;
  const L = M.level0;
  for (let z = 0; z < h; z++) {
    const row = (r.z0 + z) * W + r.x0;
    for (let x = 0; x < w; x++) { const v = rgba[(z * w + x) * 4]; if (v > L[row + x]) L[row + x] = v; }
  }
  markDirty(r);
}
function markDirty(r) {
  const d = M.dirty;
  M.dirty = d ? { x0: Math.min(d.x0, r.x0), x1: Math.max(d.x1, r.x1), z0: Math.min(d.z0, r.z0), z1: Math.max(d.z1, r.z1) } : { ...r };
}
// The max-mip pyramid over the dirty region (a texel holds the tallest of the four below it), then one upload
function flush() {
  const r = M.dirty; if (!r || !M.tex) return;
  M.dirty = null;
  const mips = M.tex.mipmaps;
  let x0 = r.x0, x1 = r.x1, z0 = r.z0, z1 = r.z1;
  for (let l = 1; l < mips.length; l++) {
    const src = mips[l - 1], dst = mips[l], w = src.width, h = src.height, nw = dst.width;
    x0 >>= 1; z0 >>= 1; x1 = Math.min(dst.width - 1, x1 >> 1); z1 = Math.min(dst.height - 1, z1 >> 1);
    const S0 = src.data, T = dst.data;
    for (let y = z0; y <= z1; y++) {
      const r0 = Math.min(2 * y, h - 1) * w, r1 = Math.min(2 * y + 1, h - 1) * w;
      for (let x = x0; x <= x1; x++) {
        const a = Math.min(2 * x, w - 1), b = Math.min(2 * x + 1, w - 1);
        T[y * nw + x] = Math.max(S0[r0 + a], S0[r0 + b], S0[r1 + a], S0[r1 + b]);
      }
    }
  }
  M.tex.needsUpdate = true;
}

// At city load: the map from the colliders (the buildings' outlines and roof heights; New York's landmarks drawn as
// their meshes, whose colliders are wider boxes than their towers). -> ms spent
function build(colliders, { meshRoot = null, skip = null } = {}) {
  if (!on()) return 0;
  const t0 = performance.now();
  frameFor(colliders);
  const ctx = canvasFor();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, M.W, M.D);
  M.level0.fill(0);
  const list = skip ? colliders.filter((c) => !skip.has(c)) : colliders;
  drawColliders(list);
  readBack({ x0: 0, x1: M.W - 1, z0: 0, z1: M.D - 1 });
  if (meshRoot) rasterizeMeshes(meshRoot);
  markDirty({ x0: 0, x1: M.W - 1, z0: 0, z1: M.D - 1 });
  flush();
  M.built = true;
  uReady.value = 1;
  S.stats = { ms: Math.round(performance.now() - t0), colliders: list.length, size: [M.W, M.D], mpt: uMpt.value, origin: [uOrigin.value.x, uOrigin.value.y] };
  console.log(`[light] sky occlusion height map ${M.W}x${M.D} at ${uMpt.value} m, ${list.length} colliders, ${S.stats.ms} ms`);
  return S.stats.ms;
}

// A streamed tile's buildings (its colliders layer) added as it loads; the upload waits a moment so a burst of tiles is
// one upload. A tile unloaded leaves its heights: the map is the city's whole skyline (its buildings stay where they
// are), and a tile loaded again draws the same heights over them.
function addColliders(colliders) {
  if (!on() || !M.built || !colliders || !colliders.length) return;
  const r = drawColliders(colliders);
  if (r) readBack(r);
  M.flushAt = performance.now() + 400;
}
function watchTiles(tm) {
  if (!on() || !tm || typeof tm.on !== 'function' || S._watched.has(tm)) return;
  S._watched.add(tm);
  const add = (tile) => addColliders(tile && tile.layers && tile.layers.colliders);
  tm.on('load', add);
  tm.on('upgrade', add);
  S.tilesWatched++;
}

// Per frame (both engines' loops, high tier only): the bounce follows the time of day, a pending upload goes up
function update(hemiLight, canyonBounce) {
  if (!_on) return;
  if (hemiLight) uBounce.value.copy(hemiLight.groundColor).multiplyScalar(hemiLight.intensity * (canyonBounce ?? 0.5));
  if (M.dirty && performance.now() >= M.flushAt) flush();
}

// ---------------------------------------------------------------- the shader
// The tallest roof in the texel of the mip level at a world position (xz), m
const heightAt = (xz, level) => {
  const v = texture(ensureTexture(), xz.sub(uOrigin).div(uSize)).level(level).r;
  return v.mul(v).mul(MAX_HEIGHT);
};

// The share of the cosine-weighted irradiance of an open sky that reaches a surface: 1 on an open field facing up, 0.5
// on a wall facing open ground (the fork's visibility(), its slices in a loop so each material's shader stays small)
const visibilityOf = Fn(([positionW, normalW]) => {
  const n = normalW.toVar();
  const p = positionW.add(n.mul(uMpt)).toVar(); // a texel off the surface, so a wall doesn't occlude itself
  const floorY = p.y.add(HEIGHT_BIAS).toVar(); // what a roof has to rise above to hide any sky
  const sum = float(0).toVar();
  const lodBase = uMpt.mul(TEXELS_PER_STEP).log2().toVar(); // log2(m per read at a step of 1 m)
  Loop(SLICES, ({ i }) => {
    const phi = float(i).add(0.5).mul(Math.PI * 2 / SLICES);
    const d = vec2(phi.cos(), phi.sin()).toVar();
    const reach = d.add(n.xz.mul(WALL_CLEARANCE)).toVar();
    const reachLength = reach.length().toVar();
    const tanH = float(0).toVar(); // the horizon starts flat
    for (const dist of STEPS) {
      const lod = max(float(Math.log2(dist)).sub(lodBase), 0);
      tanH.assign(max(tanH, heightAt(p.xz.add(reach.mul(dist)), lod).sub(floorY).div(reachLength.mul(dist))));
    }
    const tH = atan(tanH).toVar(); // the elevation of the horizon
    const cosH = tH.cos();
    // the sky above the horizon, weighted by the cosine to the normal: its vertical and its horizontal part
    const slice = n.y.mul(cosH).mul(cosH).mul(0.5)
      .add(dot(n.xz, d).mul(float(Math.PI / 4).sub(tH.mul(0.5)).sub(sin(tH.mul(2)).mul(0.25))));
    sum.addAssign(max(slice, 0));
  });
  return sum.mul(2 / SLICES).min(1);
});

// The visibility at this fragment, with the old term (`fallback`, a node) far off and before the map is built
function visibilityNode(fallback) {
  return Fn(() => {
    const pw = TSL.positionWorld, nw = TSL.normalWorld;
    const far = smoothstep(FAR_FADE[0], FAR_FADE[1], pw.sub(TSL.cameraPosition).length()).max(uReady.oneMinus()).toVar();
    const v = float(1).toVar();
    If(far.lessThan(0.999), () => { v.assign(visibilityOf(pw, nw)); });
    return mix(v, fallback, far);
  })();
}

// A city material's sky light: the height map's visibility as its aoNode (times `factor`, a material's own occlusion),
// the hidden share's bounce added to its outgoing light. `canyon` makes the old term (the fallback far off).
function apply(mat, canyon, factor = null, { bounce: withBounce = true } = {}) {
  if (DBG.has('noapply')) { mat.aoNode = factor ? canyon().mul(factor) : canyon(); return mat; }
  const vis = visibilityNode(canyon()).toVar('skyVis');
  // (never below AO_FLOOR: the AO also occludes the specular, and with no SSR to answer it a glass wall in a canyon
  // went black; the fork's SSR answers that share)
  const ao = mix(float(AO_FLOOR), float(1), vis);
  mat.aoNode = factor ? ao.mul(factor) : ao;
  // (the bounce: what a diffuse surface reflects of the buildings' light where they hide the sky; a metal none)
  // (an irradiance, as the hemisphere light's: through the Lambert BRDF, albedo / pi, as three lights it)
  // (a metal reflects the buildings it faces instead of the sky the AO took from it: a fifth of the bounce)
  const albedo = mix(diffuseColor.rgb, vec3(0.2), metalness);
  const bounce = albedo.mul(uBounce).mul(uBounceGain).mul(1 / Math.PI).mul(vis.oneMinus());
  // (into the emissive term, which three adds after the lights: the material's own emissive node, set before or after
  // this, kept under it)
  if (withBounce && !DBG.has('nobounce')) {
    let own = mat.emissiveNode || null, sum = null;
    Object.defineProperty(mat, 'emissiveNode', {
      configurable: true, enumerable: true,
      get() { return sum || (sum = (own || TSL.materialEmissive).add(bounce)); },
      set(v) { own = v; sum = null; }
    });
  }
  mat.userData.skyOcclusion = true;
  S.materials++;
  return mat;
}

// For a model that had no sky term at all (the vehicles, the crowd): the visibility, no fallback term (open sky far
// off). opts.bounce false: no bounce term (the traffic's lofted materials: with it added to their emissive their
// instances stopped drawing, 25 Nov; a car's paint is mostly its coat's reflection anyway)
function applyOpen(mat, factor = null, opts = {}) {
  return apply(mat, () => float(1), factor, opts);
}

// ---------------------------------------------------------------- the hero probe
// (after the fork's main.js hero probe, commits da66163 and 7f4a50e) A 128 px cube map of the street captured at the
// player's vehicle, the vehicle hidden from its own capture, one face every HERO_INTERVAL frames after the frame is
// drawn, lit with the frame's own sun shadow maps (three.js would fit and draw the cascades again for each face's
// camera). It is the environment of the player vehicle's materials only (their envNode), in place of the sky: the
// buildings, the street and the traffic round it are what its paint and glass reflect. Here three.js prefilters it
// for roughness (PMREM) once a cycle of faces, where the fork reads its plain mip chain.
const HERO_SIZE = 128, HERO_INTERVAL = 2;
const H = { rt: null, cam: null, env: null, face: -1, frame: 0, mesh: null, mats: new Map(), faces: 0, ms: 0 };
const _p = new THREE.Vector3();
function heroMaterials(root, fn) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m && m.isNodeMaterial && !m.transparent) fn(m);
  });
}
function heroRelease() {
  for (const [m, prev] of H.mats) { m.envNode = prev; m.needsUpdate = true; }
  H.mats.clear();
}
function heroApply(root) {
  heroMaterials(root, (m) => {
    if (H.mats.has(m)) return;
    H.mats.set(m, m.envNode || null);
    m.envNode = H.env;
    m.needsUpdate = true;
  });
}
// Per frame, after the frame is drawn (both engines' loops). app: window.__NYC_APP
function heroUpdate(app) {
  if (!_on || !app || S.heroOff) return;
  const cm = app.controllerManager, renderer = app.renderer, scene = app.scene;
  if (!cm || !renderer || !scene) return;
  const ent = cm.getActiveEntity ? cm.getActiveEntity() : null;
  const mesh = cm.activeMode === 'car' && ent && ent.mesh ? ent.mesh : null;
  if (mesh !== H.mesh) { heroRelease(); H.mesh = mesh; H.face = -1; }
  if (!mesh || !mesh.parent) return;
  if (!H.rt) {
    H.rt = new THREE.CubeRenderTarget(HERO_SIZE, { type: THREE.HalfFloatType, generateMipmaps: false });
    H.rt.texture.name = 'output'; // (the MRT below writes its 'output' to the texture of that name)
    H.cam = new THREE.CubeCamera(0.3, 20000, H.rt);
    H.env = TSL.cubeTexture(H.rt.texture);
  }
  if (H.face >= 0 && (H.frame++ % HERO_INTERVAL) !== 0) return;
  const t0 = performance.now();
  mesh.getWorldPosition(_p);
  H.cam.position.set(_p.x, _p.y + 1.0, _p.z);
  H.cam.updateMatrixWorld(true);
  const visible = mesh.visible;
  mesh.visible = false;
  const shadow = app.lightingSystem && app.lightingSystem.sunLight && app.lightingSystem.sunLight.shadow;
  const autoUpdate = shadow ? shadow.autoUpdate : null;
  if (shadow) shadow.autoUpdate = false;
  const prevTarget = renderer.getRenderTarget(), prevFace = renderer.getActiveCubeFace ? renderer.getActiveCubeFace() : 0;
  const prevMip = renderer.getActiveMipmapLevel ? renderer.getActiveMipmapLevel() : 0;
  // (an MRT of the colour alone: the scene pass's outputs are not the cube's, and with no MRT at all the materials
  // that merge their own (material.mrtNode, js/main.js) would be compiled with no output left)
  const prevMRT = renderer.getMRT ? renderer.getMRT() : null;
  if (!H.mrt) H.mrt = TSL.mrt({ output: TSL.output });
  if (renderer.setMRT) renderer.setMRT(H.mrt);
  try {
    if (H.face < 0) {
      H.cam.update(renderer, scene); // all six, the first time
      H.faces += 6;
    } else {
      if (window.NYC.hideFromProbe) window.NYC.hideFromProbe(H.cam.position);
      try {
        renderer.setRenderTarget(H.rt, H.face);
        renderer.render(scene, H.cam.children[H.face]);
      } finally { if (window.NYC.showAfterProbe) window.NYC.showAfterProbe(); }
      H.faces++;
    }
  } finally {
    renderer.setRenderTarget(prevTarget, prevFace, prevMip);
    if (renderer.setMRT) renderer.setMRT(prevMRT);
    mesh.visible = visible;
    if (shadow) shadow.autoUpdate = autoUpdate;
  }
  const first = H.face < 0;
  H.face = (H.face + 1) % 6;
  // (prefiltered again once the cube has all its faces new: after the first capture, then once a cycle)
  if (first || H.face === 0) H.rt.texture.needsPMREMUpdate = true;
  if (first) heroApply(mesh);
  H.ms = H.ms * 0.9 + (performance.now() - t0) * 0.1;
}

const S = {
  on, wanted, setChoice, savedChoice, choice: savedChoice(), why: null,
  heroUpdate, hero: H, heroOff: false,
  build, addColliders, watchTiles, update, apply, applyOpen, visibilityOf, heightAt,
  uniforms: { uOrigin, uSize, uMpt, uReady, uBounce, uBounceGain },
  get map() { return M.tex; }, stats: null, materials: 0, early: 0, tilesWatched: 0, _watched: new Set(),
  SLICES, STEPS, MAX_HEIGHT, dbg: DBG
};
window.NYC.HQL = S;
})();
