// Mog City story runner: a flotilla (a pack's `flotilla` step): hundreds of rubber race ducks on a river, every one
// bobbing out of step with the others, drifting downstream, in ONE instanced draw (props.js's flotilla duck, about 620
// triangles, its number on its back). Mandi's Revenge's 980 sevens. The river is found where the town's terrain is under
// its water level (NYC.Terrain: groundAt(x, z) at or below waterLevel), near the place the step names: the nearest
// water, then its way (the long axis of the water round it) and its width. The ducks are laid in a strip along it,
// `length` m long and as wide as the water lets them (`width` m at most), and drift along it at `speed` m/s; one that
// drifts off the strip's end shrinks away and comes back at its head. `pour`: they go in first from a point on the bank
// (the hero's hands: the duffel tipped), each in an arc, over `pour` s, a splash where they land.
//   const F = createFlotilla(THREE, scene, { water, ground })   F.lay(o) -> info | null   F.remove()   F.frame(dt, cam)
// water(x, z) -> the surface's y there, or null where it is dry. Cheap: one draw call; 980 matrices a frame on the CPU
// (about 0.2 ms), skipped when it is out of view or farther than FAR m from the camera.
import { duckGeometry, duckMaterial, PROP_SIZE } from './props.js';

export const FLOTILLA_MAX = 1200;
const FAR = 420;
// the water near (x, z): the nearest wet point, by rings out to R m every STEP m; null when there is none
export function findWater(water, x, z, R = 320, STEP = 4) {
  if (water(x, z) != null) return { x, z };
  for (let r = STEP; r <= R; r += STEP) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / STEP));
    let best = null;
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (water(px, pz) != null) { best = { x: px, z: pz }; break; } }
    if (best) return best;
  }
  return null;
}
// the river's way at a wet point: the long axis of the wet points round it (within R m, every STEP m), its width
// across that way at the point, and the middle of the water across it (the strip is laid down the middle)
export function riverAxis(water, c, R = 70, STEP = 3) {
  const pts = [];
  for (let dx = -R; dx <= R; dx += STEP) for (let dz = -R; dz <= R; dz += STEP) { if (dx * dx + dz * dz > R * R) continue; if (water(c.x + dx, c.z + dz) != null) pts.push([dx, dz]); }
  if (pts.length < 6) return { u: [1, 0], width: 12, mid: { ...c }, n: pts.length };
  let mx = 0, mz = 0; for (const [a, b] of pts) { mx += a; mz += b; } mx /= pts.length; mz /= pts.length;
  let sxx = 0, sxz = 0, szz = 0; for (const [a, b] of pts) { const x = a - mx, z = b - mz; sxx += x * x; sxz += x * z; szz += z * z; }
  const th = 0.5 * Math.atan2(2 * sxz, sxx - szz), u = [Math.cos(th), Math.sin(th)], n = [-u[1], u[0]];
  // (across the water at c: wet from lo to hi along n)
  let lo = 0, hi = 0; for (let s = 1; s < 200; s++) { if (water(c.x + n[0] * s, c.z + n[1] * s) == null) break; hi = s; } for (let s = 1; s < 200; s++) { if (water(c.x - n[0] * s, c.z - n[1] * s) == null) break; lo = s; }
  const width = hi + lo + 1, off = (hi - lo) / 2;
  return { u, n, width, mid: { x: c.x + n[0] * off, z: c.z + n[1] * off }, n: pts.length };
}
// a small seeded random
const rng = (seed) => { let s = (seed >>> 0) || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

export function createFlotilla(THREE, scene, { water, number = '7' } = {}) {
  let mesh = null, splash = null, D = null, t = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  function remove() {
    if (mesh) { mesh.removeFromParent(); mesh.dispose?.(); mesh = null; }
    if (splash) { splash.removeFromParent(); splash.dispose?.(); splash = null; }
    D = null;
  }
  // lay the flotilla: o { x, z (where: the place; the water nearest it), count, length, width, speed, flow (1 | -1: which
  // way along the river's axis), scale (of the duck), seed, pour: secs, from: [x, y, z] (where they are poured from),
  // spread: 0..1 (how much of the strip is already full: 1 all of it; a pour lays them from its middle out) } -> info
  function lay(o) {
    remove();
    const c0 = findWater(water, o.x, o.z, o.search || 320); if (!c0) return null;
    const ax = riverAxis(water, c0);
    const count = Math.max(1, Math.min(FLOTILLA_MAX, Math.round(o.count || 980)));
    const len = Math.max(8, +o.length || 56), wid = Math.max(3, Math.min(+o.width || 26, ax.width - 4)), speed = o.speed ?? 0.45;
    const flow = o.flow === -1 || o.flow === '-1' ? -1 : 1, u = [ax.u[0] * flow, ax.u[1] * flow], n = [-u[1], u[0]];
    // (the strip starts at the pour (or the place) and runs downstream from it: its head at the place's water)
    const head = o.pour ? { x: (o.from ? o.from[0] : c0.x), z: (o.from ? o.from[2] : c0.z) } : c0;
    const hs = findWater(water, head.x, head.z) || c0;
    const mid0 = riverAxis(water, hs).mid;
    const surf = water(mid0.x, mid0.z) ?? 0;
    const R = rng(o.seed || 980), S = (o.scale || 1.6) * PROP_SIZE.duck;
    const ducks = new Float32Array(count * 8); // a (along), b (across), phase, yaw0, size, wander, t0 (pour start), lane
    for (let i = 0; i < count; i++) {
      let a = 0, b = 0;
      for (let k = 0; k < 8; k++) {
        a = (o.pour ? -len * 0.08 : -len / 2) + R() * len; b = (R() - 0.5) * wid;
        // (clumped a little, as floating things gather: a pull toward a few drifting knots)
        if (R() < 0.35) b *= 0.55;
        const x = mid0.x + u[0] * a + n[0] * b, z = mid0.z + u[1] * a + n[1] * b;
        if (water(x, z) != null) break;
      }
      const j = i * 8;
      ducks[j] = a; ducks[j + 1] = b; ducks[j + 2] = R() * Math.PI * 2; ducks[j + 3] = (R() - 0.5) * 1.4 + (R() < 0.15 ? Math.PI : 0);
      ducks[j + 4] = S * (0.92 + R() * 0.16); ducks[j + 5] = 0.4 + R() * 0.8;
      // (a pour: the nearest go in first, over o.pour s; the rest were never seen leave the bag)
      ducks[j + 6] = o.pour ? (Math.max(0, a + len * 0.08) / len) * o.pour * 0.85 + R() * o.pour * 0.15 : -1;
      ducks[j + 7] = R();
    }
    // (on a phone, the lighter duck: 980 of them are one draw either way)
    const phone = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches, geo = duckGeometry(THREE, { lod: o.lod ?? (phone ? 2 : 1) });
    mesh = new THREE.InstancedMesh(geo, duckMaterial(THREE, o.number || number), count);
    mesh.name = 'wagmi-flotilla'; mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage?.(THREE.DynamicDrawUsage ?? 35048);
    // (its bounds: the whole strip, set once; the ducks never leave it)
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(mid0.x, surf, mid0.z), len * 0.6 + wid + 4);
    mesh.frustumCulled = true;
    scene.add(mesh);
    // (a splash where the pour lands: a ring of white drops thrown up and falling)
    if (o.pour) {
      const sg = new THREE.SphereGeometry(1, 6, 4), sm = new THREE.MeshStandardMaterial({ color: '#F2F6F8', roughness: 0.15, metalness: 0, transparent: true, opacity: 0.85 });
      splash = new THREE.InstancedMesh(sg, sm, 48); splash.name = 'wagmi-flotilla-splash'; splash.frustumCulled = false; scene.add(splash);
    }
    D = { ducks, count, len, wid, speed, u, n, mid0, surf, from: o.from || null, pour: o.pour || 0, t0: t, splashR: rng(31) };
    frame(0, null, true);
    return { x: mid0.x, z: mid0.z, y: surf, heading: Math.atan2(u[0], u[1]), u, n, length: len, width: wid, count, river: ax.width };
  }
  // where duck i is now: [x, y, z, yaw, pitch, roll, size] (k: time since it was laid)
  function duckAt(i, k, out) {
    const d = D.ducks, j = i * 8, half = D.len / 2;
    let a = d[j] + k * D.speed * (0.85 + d[j + 7] * 0.3), b = d[j + 1] + Math.sin(k * 0.08 * d[j + 5] + d[j + 2]) * 0.8;
    // (off the strip's foot: back at its head, shrinking away and growing back over the last and first 3 m)
    let span = D.len, start = D.pour ? -D.len * 0.08 : -half;
    a = start + ((((a - start) % span) + span) % span);
    const edge = Math.min(a - start, start + span - a), grow = Math.min(1, edge / 3);
    const x = D.mid0.x + D.u[0] * a + D.n[0] * b, z = D.mid0.z + D.u[1] * a + D.n[1] * b;
    const ph = d[j + 2], w = 1.6 + d[j + 5] * 0.9;
    const y = D.surf - 0.012 + Math.sin(k * w + ph) * 0.03 + Math.sin(k * 0.7 * w + ph * 1.7) * 0.012;
    const yaw = Math.atan2(D.u[0], D.u[1]) + d[j + 3] + Math.sin(k * 0.21 * d[j + 5] + ph) * 0.6;
    out[0] = x; out[1] = y; out[2] = z; out[3] = yaw; out[4] = Math.sin(k * w + ph + 1.1) * 0.12; out[5] = Math.cos(k * w * 0.8 + ph) * 0.1; out[6] = d[j + 4] * grow;
    // (the pour: before its time it is not there; in the air an arc from the bag to its place on the water)
    const t0 = d[j + 6];
    if (t0 >= 0 && D.from) {
      const kk = k - t0, fly = 0.9;
      if (kk < 0) { out[6] = 0; return out; }
      if (kk < fly) {
        const f = kk / fly, fx = D.from[0], fy = D.from[1], fz = D.from[2];
        // (where it lands: its place at that moment, near the bag's side of the strip)
        out[0] = fx + (x - fx) * f; out[2] = fz + (z - fz) * f; out[1] = fy + (y - fy) * f + Math.sin(f * Math.PI) * 1.4;
        out[4] = f * 6 + ph; out[5] = f * 4; out[6] = d[j + 4];
        out.air = true; return out;
      }
      out.air = false; out.landed = kk - fly;
    }
    return out;
  }
  const at = [0, 0, 0, 0, 0, 0, 0];
  function frame(dt, cam, force = false) {
    t += dt;
    if (!mesh || !D) return;
    const k = t - D.t0;
    // (out of reach: not worked on; a pour always is)
    if (!force && cam && !(D.pour && k < D.pour + 2)) {
      const dx = cam.position.x - D.mid0.x, dz = cam.position.z - D.mid0.z;
      if (dx * dx + dz * dz > FAR * FAR) return;
    }
    let splashN = 0;
    for (let i = 0; i < D.count; i++) {
      at.air = false; at.landed = null;
      duckAt(i, k, at);
      const s = at[6];
      e.set(at[4], at[3], at[5], 'YXZ');
      m4.compose(p.set(at[0], at[1], at[2]), q.setFromEuler(e), sc.set(s || 1e-4, s || 1e-4, s || 1e-4));
      mesh.setMatrixAt(i, m4);
      // (a drop thrown up where one has just landed)
      if (splash && at.landed != null && at.landed < 0.5 && splashN < 48) {
        for (let r = 0; r < 3 && splashN < 48; r++) {
          const a = D.splashR() * Math.PI * 2, f = at.landed / 0.5, rr = 0.15 + f * 0.5, h = Math.sin(f * Math.PI) * (0.35 + D.splashR() * 0.2);
          const sz = 0.05 * (1 - f) + 0.01;
          m4.compose(p.set(at[0] + Math.cos(a) * rr, D.surf + h, at[2] + Math.sin(a) * rr), q.identity(), sc.set(sz, sz, sz)); splash.setMatrixAt(splashN++, m4);
        }
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (splash) { for (let i = splashN; i < 48; i++) { m4.makeScale(0, 0, 0); splash.setMatrixAt(i, m4); } splash.instanceMatrix.needsUpdate = true; splash.count = 48; }
  }
  // a point of the flotilla for a camera: its middle (or where most of the pour has landed), on the water, with its way
  function point(o = {}) {
    if (!D) return null;
    const a = o.along ?? (D.pour ? D.len * 0.15 : 0), b = o.across ?? 0;
    return { x: D.mid0.x + D.u[0] * a + D.n[0] * b, y: D.surf, z: D.mid0.z + D.u[1] * a + D.n[1] * b, heading: Math.atan2(D.u[0], D.u[1]), u: D.u, n: D.n };
  }
  return { lay, remove, frame, point, get mesh() { return mesh; }, get info() { return D && { count: D.count, len: D.len, wid: D.wid, surf: D.surf }; } };
}
