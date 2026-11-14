// The Hometown far field's runtime pieces: terrain.js patches with their own x / z steps, `surface` patches (groundAt
// is their height, not the dry sentinel), removePatch / hasCore, San Francisco's patches unchanged, the edge blend
// (heightAt continuous across the core's edge); and, when the packages are compiled locally, every package's far tiles
// placed on one uniform grid in its frame with shared edges, tier A's posts on the core's edge the core's own heights.
//   node --test tests/pkg-far.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import vm from 'node:vm';

const root = new URL('../', import.meta.url).pathname;
function terrain() {
  const window = { NYC: {} };
  vm.runInNewContext(readFileSync(root + 'cities/sf/js/terrain.js', 'utf8'), { window });
  const T = window.NYC.Terrain;
  // a 3 x 3 core of 10 m cells at 5 m, origin 0, 0, dry sentinel water level
  T.load({ cell: 10, originX: 0, originZ: 0, w: 3, h: 3, minH: 0, scale: 1, waterLevel: -10 }, new Uint16Array(9).fill(5));
  return T;
}

test('terrain.js: stepX / stepZ patches, surface patches unclamped, removePatch, hasCore', () => {
  const T = terrain();
  // a 2 x 2 patch east of the core, 100 m by 50 m cells, heights -40 .. -20 (a valley under the dry sentinel)
  const p = T.addPatch({ x0: 100, z0: 0, stepX: 100, stepZ: 50, nx: 2, nz: 2, h: new Float32Array([-40, -20, -40, -20]), rect: true, surface: true });
  assert.equal(T.heightAt(150, 25), -30);
  assert.equal(T.heightAt(200, 50), -20);
  assert.equal(T.groundAt(150, 25), -30, 'a surface patch: its 3DEP height, no invisible floor at -10');
  assert.equal(T.groundAt(10, 10), 5, 'the core unchanged');
  assert.ok(T.hasCore(20, 20) && !T.hasCore(150, 25));
  // (an SF-style patch: one step, no surface flag: clamped to the water level as before)
  const sf = T.addPatch({ x0: -300, z0: 0, step: 100, nx: 2, nz: 2, h: new Float32Array([-40, -20, -40, -20]), rect: true });
  assert.equal(T.heightAt(-250, 50), -30);
  assert.equal(T.groundAt(-250, 50), -10);
  // (the flag does not leak: a core read after a surface read clamps as before)
  T.groundAt(150, 25);
  assert.equal(T.groundAt(-250, 50), -10);
  assert.ok(T.removePatch(p));
  assert.equal(T.heightAt(150, 25), -15, 'removed: the old "waterLevel - 5" floor');
  assert.ok(!T.removePatch(p));
  assert.ok(T.removePatch(sf));
});

test('terrain.js edgeBlend: off by default; on, heightAt continuous across the core edge, the patch itself past the band', () => {
  const T = terrain();
  // a patch east of the core (core x 0..20 at 5 m), 100 m step, 9 m: a 4 m step at the core's edge
  const p = T.addPatch({ x0: 20, z0: -100, stepX: 100, stepZ: 100, nx: 3, nz: 3, h: new Float32Array(9).fill(9), rect: true, surface: true });
  assert.equal(T.heightAt(20.01, 10), 9, 'off: the patch as it is');
  T.edgeBlend = 32;
  assert.ok(Math.abs(T.heightAt(20.0001, 10) - 5) < 0.01, 'on: the core edge just past it');
  let prev = T.heightAt(20, 10), worst = 0;
  for (let x = 20.5; x <= 60; x += 0.5) { const h = T.heightAt(x, 10); worst = Math.max(worst, Math.abs(h - prev)); prev = h; }
  assert.ok(worst < 0.1, 'no step over the band: ' + worst);
  assert.equal(T.heightAt(52, 10), 9, 'past the band: the patch');
  assert.equal(T.heightAt(10, 10), 5, 'the core unchanged');
  T.groundAt(30, 10);
  assert.ok(T._surface, 'the surface flag of the patch kept through the blend');
  T.edgeBlend = 0;
  T.removePatch(p);
});

const PKGS = ['okemah', 'phoenix', 'pittsburgh'].filter((p) => existsSync(`${root}cities/pkg/packages/${p}/geodata.js`));
function pkg(id) {
  const window = { NYC: {} };
  vm.runInNewContext(readFileSync(`${root}cities/pkg/packages/${id}/geodata.js`, 'utf8'), { window });
  return window.NYC.PKG;
}
function sfb1(buf) {
  const n = buf.readUInt32LE(4), h = JSON.parse(buf.subarray(8, 8 + n).toString()), P = h.n;
  const q = new Uint16Array(buf.buffer.slice(buf.byteOffset + 8 + n, buf.byteOffset + 8 + n + 2 * P * P));
  return { h, q };
}

for (const id of PKGS) {
  test(`${id}: far tiles on one grid in the frame, shared edges equal, the core inside the near tier`, { skip: !pkg(id).far && 'package compiled without a far field' }, () => {
    const P = pkg(id), F = P.far;
    const T = new Map();
    for (const t of F.tiles) T.set(`${t.tier}/${t.C}/${t.R}`, sfb1(gunzipSync(readFileSync(`${root}cities/pkg/packages/${id}/${t.url}.gz`))));
    let edges = 0;
    for (const [k, { h, q }] of T) {
      const E = T.get(`${h.tier}/${h.C + 1}/${h.R}`), n = h.n;
      assert.equal(h.step, F.tiers[h.tier].step);
      if (E) { for (let j = 0; j < n; j++) assert.equal(q[j * n + n - 1], E.q[j * n], `${k} east edge ${j}`); edges++; }
      // (frame: x = (grid m - 512 c0) / k0; a tile's west edge is its west neighbour's east edge)
      const x0 = (h.C * F.tiers[h.tier].size - 512 * P.origin.c0) / P.k0, xe = ((h.C + 1) * F.tiers[h.tier].size - 512 * P.origin.c0) / P.k0;
      assert.ok(Math.abs(x0 + (n - 1) * (h.step / P.k0) - xe) < 1e-6);
    }
    assert.ok(edges > 0);
    const [gx0, gs0, gx1, gs1] = F.core;
    const b = F.tiles.filter((t) => t.tier === 'b'), sz = F.tiers.b.size;
    assert.ok(Math.min(...b.map((t) => t.C)) * sz <= gx0 && (Math.max(...b.map((t) => t.C)) + 1) * sz >= gx1);
    assert.ok(Math.min(...b.map((t) => t.R)) * sz <= gs0 && (Math.max(...b.map((t) => t.R)) + 1) * sz >= gs1);
  });
}

function terrainOf(id) {
  const b = gunzipSync(readFileSync(`${root}cities/pkg/packages/${id}/data/terrain.bin.gz`)), n = b.readUInt32LE(4), h = JSON.parse(b.subarray(8, 8 + n).toString());
  return { h, q: new Uint16Array(b.buffer.slice(b.byteOffset + 8 + n, b.byteOffset + 8 + n + 2 * h.w * h.h)) };
}
for (const id of PKGS) {
  test(`${id}: tier A meets the core: its posts on the core's edge are the core's heights`, { skip: !(pkg(id).far && pkg(id).far.tiers.a) && 'package compiled without tier A' }, () => {
    const P = pkg(id), F = P.far, { h: th, q: tq } = terrainOf(id), [gx0, gs0, gx1, gs1] = F.core;
    const d = [];
    for (const t of F.tiles.filter((t) => t.tier === 'a')) {
      const { h, q } = sfb1(gunzipSync(readFileSync(`${root}cities/pkg/packages/${id}/${t.url}.gz`))), n = h.n;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const gx = (h.C * 64 + i) * h.step, gs = (h.R * 64 + j) * h.step;
        if (gx < gx0 || gx > gx1 || gs < gs0 || gs > gs1 || !(gx === gx0 || gx === gx1 || gs === gs0 || gs === gs1) || !q[j * n + i]) continue;
        const ci = (gx - gx0) / 2, cj = (gs - gs0) / 2;
        d.push(Math.abs(h.minH + q[j * n + i] * h.scale - P.yOffset - (th.minH + tq[cj * th.w + ci] * th.scale)));
      }
    }
    d.sort((a, b) => a - b);
    assert.ok(d.length > 100, 'edge posts ' + d.length);
    assert.ok(d[Math.floor(d.length * 0.95)] <= 0.06, 'p95 ' + d[Math.floor(d.length * 0.95)]);
    // (the core's water flattening and bridges differ: the runtime takes those up, pkg-far.js)
    assert.ok(d.filter((v) => v > 0.5).length / d.length < 0.05);
  });
}
