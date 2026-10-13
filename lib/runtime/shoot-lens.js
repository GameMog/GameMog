/*
 * A penalty shootout's lenses behind the goal, checked (13 Oct, SHOOTOUT's Mogs). The runtime films the keeper, every
 * replay and the key art from behind the goal shot at (lib/runtime/shootout-camera.js: KEEPER, REVERSE and REVERSE's
 * tall-screen pose, the director's own), and a world that stands something in that room (a fence, a tall board, a
 * camera rig) blanks those shots: a review's 3 m fence 2.7 m behind the goal passed every other check while the key
 * art came out a flat field and every replay a wall. This draws the sight lines from each of those lenses (either
 * side) to the goal mouth and the spot through the world as built, and says what stands in them.
 *
 * Read by both test drives, so they judge it alike: the creator's frame (served ahead of lib/runtime/drive.js in a
 * shootout's drive page, lib/custom-game.ts) and the server's playtest (lib/playtest-runtime.ts evaluates it). It
 * defines one global, GameMogShootLens(THREE, scene, skip), and does nothing else:
 *   skip: the runtime's own objects (the people), passed in; the goal, the ball and the shadow blobs it knows by name
 *   -> { lenses, targets, rays, worst, blocked: [per lens], by: [{ name, rays, at: [x, y, z], size: [w, h, d] }], tris, ms }
 * Only what is drawn and solid counts: a hidden object, a see-through material, a flake, a piece of tape or confetti
 * (under 0.3 m across) never blocks, and nothing lower than 5 cm (the turf and its lines). Positions are the CPU's
 * (what a vertex shader moves is read where it was placed).
 */
window.GameMogShootLens = function (THREE, scene, skip) {
  'use strict';
  var t0 = performance.now();
  // the lenses (shootout-camera.js SH: KEEPER, REVERSE, REVERSE's tall-screen pose), each either side of the middle
  var LENSES = [[-1.3, 1.35, -57.3], [1.3, 1.35, -57.3], [0.9, 1.25, -56.2], [-0.9, 1.25, -56.2], [0.3, 1.35, -57.6], [-0.3, 1.35, -57.6]];
  // what they film: the goal mouth inside its frame (posts at x = +-3.66, the bar at 2.44, on z = -52.5) and the spot
  var TARGETS = [];
  [-3.0, -1.5, 0, 1.5, 3.0].forEach(function (x) { [0.3, 1.2, 2.1].forEach(function (y) { TARGETS.push([x, y, -52.5]); }); });
  TARGETS.push([0, 0.2, -41.5]);
  // the room every sight line passes through
  var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  LENSES.concat(TARGETS).forEach(function (p) { for (var i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); } });
  lo[1] = Math.max(0.05, lo[1]);
  var ROOM = new THREE.Box3(new THREE.Vector3(lo[0] - 0.05, lo[1], lo[2] - 0.05), new THREE.Vector3(hi[0] + 0.05, hi[1] + 0.05, hi[2] + 0.05));
  var MIN_SIZE = 0.3, MAX_TRIS = 1500000;
  var skipSet = new Set((skip || []).filter(Boolean));
  var RUNTIME = /^(shootout goal|shootout-blobs)$/;

  function solid(m) {
    if (!m || m.visible === false || m.colorWrite === false) return false;
    if (m.blending === THREE.AdditiveBlending) return false;
    if (m.transparent && (m.opacity < 0.5 || m.depthWrite === false)) return false;
    return true;
  }
  function anySolid(mat) { return Array.isArray(mat) ? mat.some(solid) : solid(mat); }
  function nameOf(o) {
    var n = [], p = o;
    while (p && p !== scene && n.length < 3) { if (p.name) n.unshift(p.name); p = p.parent; }
    return (n.join(' / ') || o.type || 'a mesh').slice(0, 80);
  }

  // the triangles of what is drawn and solid inside the room, in world space, each with its owner
  var tris = [], owners = [], ownerOf = new Map(), work = 0, over = false;
  var a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), bx = new THREE.Box3(), tb = new THREE.Box3(), M = new THREE.Matrix4(), IM = new THREE.Matrix4();
  function owner(o, box) {
    var k = ownerOf.get(o);
    if (k == null) { k = owners.length; ownerOf.set(o, k); owners.push({ name: nameOf(o), box: box.clone(), rays: 0 }); }
    else owners[k].box.union(box);
    return k;
  }
  function addGeometry(o, g, mw, box) {
    var pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count, k = -1;
    work += n;
    if (work > MAX_TRIS * 3) { over = true; return; }
    for (var i = 0; i + 2 < n; i += 3) {
      var i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(mw); b.fromBufferAttribute(pos, i1).applyMatrix4(mw); c.fromBufferAttribute(pos, i2).applyMatrix4(mw);
      tb.makeEmpty(); tb.expandByPoint(a); tb.expandByPoint(b); tb.expandByPoint(c);
      if (!tb.intersectsBox(ROOM)) continue;
      if (k < 0) k = owner(o, box);
      tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, k);
    }
  }
  function big(box) { var s = box.getSize(a); return Math.max(s.x, s.y, s.z) >= MIN_SIZE; }
  scene.updateMatrixWorld(true);
  (function walk(o) {
    if (over || !o.visible || skipSet.has(o) || RUNTIME.test(o.name || '')) return;
    if (o.isMesh && !o.isSkinnedMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position && anySolid(o.material)) {
      var g = o.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      if (o.isInstancedMesh) {
        for (var j = 0; j < o.count; j++) {
          o.getMatrixAt(j, IM); M.multiplyMatrices(o.matrixWorld, IM);
          bx.copy(g.boundingBox).applyMatrix4(M);
          if (bx.intersectsBox(ROOM) && big(bx)) addGeometry(o, g, M, bx);
          if (over) break;
        }
      } else {
        bx.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
        if (bx.intersectsBox(ROOM) && big(bx)) addGeometry(o, g, o.matrixWorld, bx);
      }
    }
    for (var i = 0; i < o.children.length; i++) walk(o.children[i]);
  })(scene);

  // each sight line, lens to target: the first solid triangle crossing it (Moller-Trumbore, either face), short of the
  // target's last 1.5% (the goal line itself, the ball on the spot)
  function first(p, q) {
    var dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], best = 0.985, who = -1;
    for (var i = 0; i < tris.length; i += 10) {
      var e1x = tris[i + 3] - tris[i], e1y = tris[i + 4] - tris[i + 1], e1z = tris[i + 5] - tris[i + 2];
      var e2x = tris[i + 6] - tris[i], e2y = tris[i + 7] - tris[i + 1], e2z = tris[i + 8] - tris[i + 2];
      var px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
      if (det > -1e-12 && det < 1e-12) continue;
      var inv = 1 / det, sx = p[0] - tris[i], sy = p[1] - tris[i + 1], sz = p[2] - tris[i + 2], u = (sx * px + sy * py + sz * pz) * inv;
      if (u < 0 || u > 1) continue;
      var qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      var t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t > 0.002 && t < best) { best = t; who = tris[i + 9]; }
    }
    return who;
  }
  var blocked = LENSES.map(function (p) {
    var n = 0;
    TARGETS.forEach(function (q) { var w = first(p, q); if (w >= 0) { n++; owners[w].rays++; } });
    return n;
  });
  var r2 = function (v) { return Math.round(v * 100) / 100; };
  var by = owners.filter(function (o) { return o.rays > 0; }).sort(function (x, y) { return y.rays - x.rays; }).slice(0, 4).map(function (o) {
    var ctr = o.box.getCenter(new THREE.Vector3()), sz = o.box.getSize(new THREE.Vector3());
    return { name: o.name, rays: o.rays, at: [r2(ctr.x), r2(ctr.y), r2(ctr.z)], size: [r2(sz.x), r2(sz.y), r2(sz.z)] };
  });
  return { lenses: LENSES.length, targets: TARGETS.length, rays: LENSES.length * TARGETS.length, worst: Math.max.apply(null, blocked), blocked: blocked, by: by,
    tris: tris.length / 10, over: over, ms: Math.round(performance.now() - t0) };
};
