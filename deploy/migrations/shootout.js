// SHOOTOUT (12 Oct 2026): one penalty in a night final, kicked again and again, for the shootout runtime
// (lib/runtime/shootout.js, which owns the kick, the keeper, the camera, the input, the HUD and the sound). This is the
// world's part: the bowl, the pitch and its lines, the far goal as decor, the boards, the lamps, the crowd (filmed one
// person at a time through ctx.shootout.impostors and seated as cards, each seat with a side), flags, flashes and tape,
// and how the three people on the pitch look: the taker (player(), when you are not playing as yourself) in the people
// pack's garments recoloured as a kit, the keeper and the referee (rival(ctx, k, o)) in painted kits. The crowd's mood
// follows the runtime's events (ctx.on). The world never moves the camera.
(function () {
  'use strict';
  var PI = Math.PI, TAU = PI * 2;
  var PL = 52.5, PW = 34, GZ = -PL;
  var AX = PW + 8.5, AZ = PL + 9, RC = 12;                       // the bowl's front wall, a rounded rectangle
  var LOW = { d0: 0, rows: 30, depth: 0.82, rise: 0.40, h0: 1.6 };
  LOW.d1 = LOW.d0 + LOW.rows * LOW.depth; LOW.h1 = LOW.h0 + LOW.rows * LOW.rise;
  var UPP = { d0: LOW.d1 - 4.1, rows: 28, depth: 0.86, rise: 0.55, h0: LOW.h1 + 5.9 };
  UPP.d1 = UPP.d0 + UPP.rows * UPP.depth; UPP.h1 = UPP.h0 + UPP.rows * UPP.rise;
  var ROOF = { d0: 3.5, h0: 43.5, d1: UPP.d1 + 4, h1: 41 };
  // the two sides (the HUD's chips and names; never ARG v FRA), and their kits. Team 0 takes the kicks; its end is
  // the one behind the goal being shot at
  var TEAMS = [{ name: 'Uruguay', short: 'URU', color: '#74BDE8' }, { name: 'Spain', short: 'ESP', color: '#B3122E' }];
  var TAKER = 0;
  var A_KIT = { shirt: '#74BDE8', trim: '#FFFFFF', shorts: '#17181C', socks: '#17181C', boots: '#F7D24A' };
  var B_KIT = { shirt: '#B3122E', trim: '#E9C46A', shorts: '#1C2A4A', socks: '#1C2A4A', boots: '#F4F4F4' };
  var KEEPER_KIT = { shirt: '#B8E336', shorts: '#16161A', socks: '#B8E336', gloves: '#F4F4F4', boots: '#16161A', long: true };
  var REF_KIT = { shirt: '#1A1B20', shorts: '#16161A', socks: '#16161A', boots: '#16161A' };
  var BODY = 'human-athlete-male';
  // the taker's mark (the runtime's: the run-up's start, about 4.75 m behind the ball and to his left, for
  // the male fbKick; aim-independent): only the turf's wear reads it
  var MARK = [-3.73, -38.59];
  // the people on the pitch: the taker (team 0's), the keeper (team 1's), the referee
  var TAKER_LOOK = { skin: 'african', hair: 'short04', height: 1.80, muscle: 0.75, name: 'D. Arroyo' };
  var KEEPER_LOOK = { skin: 'caucasian', hair: 'short02', height: 1.90, muscle: 0.7, beard: 'stubble', name: 'Keeper' };
  var REF_LOOK = { skin: 'asian', hair: 'short02', height: 1.78, name: 'Referee' };
  // the world's own state: the crowd's mood and the parts it moves
  var W = { mood: 'none' };
  var T3 = null, ctxRef = null, LOWQ = false;
  // (what went wrong, said in the console; the world carries on without the part)
  function note(s) { try { console.warn('[shootout] ' + String(s).slice(0, 200)); } catch (e) {} }

  /* ------------------------------------------------------------------------------------------- the bowl -- */
  function ring(d, q, o) {
    var ax = AX + d, az = AZ + d, r = RC + d, hx = AX - RC, hz = AZ - RC, a;
    q = ((q % 8) + 8) % 8; var s = Math.floor(q), f = q - s;
    o = o || {};
    if (s === 0) { o.x = ax; o.z = -hz + 2 * hz * f; o.nx = 1; o.nz = 0; }
    else if (s === 2) { o.x = hx - 2 * hx * f; o.z = az; o.nx = 0; o.nz = 1; }
    else if (s === 4) { o.x = -ax; o.z = hz - 2 * hz * f; o.nx = -1; o.nz = 0; }
    else if (s === 6) { o.x = -hx + 2 * hx * f; o.z = -az; o.nx = 0; o.nz = -1; }
    else {
      var cx = s === 1 || s === 7 ? hx : -hx, cz = s === 1 || s === 3 ? hz : -hz;
      a = (s - 1) / 2 * (PI / 2) + f * PI / 2;
      o.nx = Math.cos(a); o.nz = Math.sin(a); o.x = cx + r * o.nx; o.z = cz + r * o.nz;
    }
    return o;
  }
  function segLen(s, d) { return s % 2 === 1 ? (RC + d) * PI / 2 : (s % 4 === 0 ? 2 * (AZ - RC) : 2 * (AX - RC)); }
  function qSamples(stepStraight, stepCorner) {
    var out = [];
    for (var s = 0; s < 8; s++) { var n = s % 2 ? stepCorner : Math.max(2, Math.ceil(segLen(s, 0) / stepStraight)); for (var k = 0; k < n; k++) out.push(s + k / n); }
    out.push(8); return out;
  }
  // a profile in (d, h) swept round the bowl
  function sweep(profile, qs, mat) {
    var pos = [], uv = [], i, k;
    for (i = 0; i < qs.length - 1; i++) for (k = 0; k < profile.length - 1; k++) {
      var a = profile[k], b = profile[k + 1];
      var A0 = ring(a[0], qs[i], {}), A1 = ring(a[0], qs[i + 1], {}), B0 = ring(b[0], qs[i], {}), B1 = ring(b[0], qs[i + 1], {});
      pos.push(A0.x, a[1], A0.z, B0.x, b[1], B0.z, A1.x, a[1], A1.z, A1.x, a[1], A1.z, B0.x, b[1], B0.z, B1.x, b[1], B1.z);
      var u0 = qs[i] * 40, u1 = qs[i + 1] * 40, v0 = k, v1 = k + 1;
      uv.push(u0, v0, u0, v1, u1, v0, u1, v0, u0, v1, u1, v1);
    }
    var g = new T3.BufferGeometry();
    g.setAttribute('position', new T3.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T3.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    mat.side = T3.DoubleSide; var m = new T3.Mesh(g, mat); m.receiveShadow = true; return m;
  }
  function strip(pts, w, y) {
    var pos = [], idx = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      var tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1, nx = -tz / l * w / 2, nz = tx / l * w / 2;
      pos.push(p[0] + nx, y, p[1] + nz, p[0] - nx, y, p[1] - nz);
      if (i) { var j = i * 2; idx.push(j - 2, j - 1, j, j - 1, j + 1, j); }
    }
    var g = new T3.BufferGeometry(); g.setAttribute('position', new T3.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    var n = []; for (var k = 0; k < pos.length / 3; k++) n.push(0, 1, 0);
    g.setAttribute('normal', new T3.Float32BufferAttribute(n, 3));
    return g;
  }
  function arc(cx, cz, r, a0, a1, n) { var o = []; for (var i = 0; i <= n; i++) { var a = a0 + (a1 - a0) * i / n; o.push([cx + r * Math.sin(a), cz + r * Math.cos(a)]); } return o; }
  // many shapes, already placed, as one (a draw call each saved): position, normal and, when every one has it, uv
  function merge(list) {
    var uvs = list.every(function (g) { return !!g.attributes.uv; }), P = [], N = [], U = [], I = [], base = 0;
    list.forEach(function (g) {
      var p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, ix = g.index, i;
      for (i = 0; i < p.count; i++) {
        P.push(p.getX(i), p.getY(i), p.getZ(i));
        if (n) N.push(n.getX(i), n.getY(i), n.getZ(i)); else N.push(0, 1, 0);
        if (uvs) U.push(u.getX(i), u.getY(i));
      }
      if (ix) for (i = 0; i < ix.count; i++) I.push(base + ix.getX(i)); else for (i = 0; i < p.count; i++) I.push(base + i);
      base += p.count;
      g.dispose();
    });
    var out = new T3.BufferGeometry();
    out.setAttribute('position', new T3.Float32BufferAttribute(P, 3)); out.setAttribute('normal', new T3.Float32BufferAttribute(N, 3));
    if (uvs) out.setAttribute('uv', new T3.Float32BufferAttribute(U, 2));
    out.setIndex(base > 65535 ? new T3.Uint32BufferAttribute(I, 1) : new T3.Uint16BufferAttribute(I, 1));
    return out;
  }
  var DUM = null;
  function placed(g, pos, rot, after) {
    DUM = DUM || new T3.Object3D();
    DUM.position.set(pos[0], pos[1], pos[2]); DUM.rotation.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0); DUM.scale.set(1, 1, 1);
    if (after) after(DUM);
    DUM.updateMatrix(); g.applyMatrix4(DUM.matrix); return g;
  }
  function scaleUv(g, su, sv) { var u = g.attributes.uv; for (var i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * su, u.getY(i) * sv); return g; }

  /* ----------------------------------------------------------------- posing (the crowd's three poses) -- */
  var V = function (x, y, z) { return new T3.Vector3(x, y, z); };
  function bone(h, n) { return h.bones[n] || h.bones[n.replace('_', '.')]; }
  function rig(h) { h.bones = {}; h.object.traverse(function (o) { if (o.isBone) h.bones[o.name] = o; }); return h; }
  function wq(o) { return o.getWorldQuaternion(new T3.Quaternion()); }
  function wp(o) { return o.getWorldPosition(new T3.Vector3()); }
  function setWorldQ(b, q) { var pq = wq(b.parent).invert(); b.quaternion.copy(pq.multiply(q)); b.updateWorldMatrix(false, true); }
  function aim(b, tip, target) {
    b.updateWorldMatrix(true, true);
    var p = wp(b), cur = wp(tip).sub(p).normalize(), want = target.clone().sub(p).normalize();
    setWorldQ(b, new T3.Quaternion().setFromUnitVectors(cur, want).multiply(wq(b)));
  }
  // two bones to a target, the joint bent towards pole (all world space)
  function ik2(a, b, c, target, pole) {
    a.updateWorldMatrix(true, true);
    var A = wp(a), B = wp(b), C = wp(c), la = A.distanceTo(B), lb = B.distanceTo(C);
    var d = Math.min(Math.max(target.distanceTo(A), Math.abs(la - lb) + 1e-3), la + lb - 1e-3);
    var dir = target.clone().sub(A).normalize();
    var x = (la * la - lb * lb + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, la * la - x * x));
    var pd = pole.clone().sub(A); pd.sub(dir.clone().multiplyScalar(pd.dot(dir))).normalize();
    var J = A.clone().addScaledVector(dir, x).addScaledVector(pd, hh);
    aim(a, b, J); aim(b, c, A.clone().addScaledVector(dir, d));
  }
  // the person's own frame (+z ahead, +x their left, y up) to world: the root's place and turn, not its scale (the
  // poses are written in metres for a man of 1.869 m, times h.k)
  var FP = null, FQ = null, FS = null;
  function L(h, x, y, z) {
    FP = FP || new T3.Vector3(); FQ = FQ || new T3.Quaternion(); FS = FS || new T3.Vector3();
    h.object.updateWorldMatrix(true, false); h.object.matrixWorld.decompose(FP, FQ, FS);
    return V(x, y, z).applyQuaternion(FQ).add(FP);
  }
  function armTo(h, side, hand, elbow) { ik2(bone(h, 'upperarm01_' + side), bone(h, 'lowerarm01_' + side), bone(h, 'wrist_' + side), hand, elbow); }
  // 0 standing (the idle, its own hands), 1 both arms up, 2 hands on the head
  var POSES = 3;
  function fanPose(h, p) {
    var k = h.k;
    if (p === 1) { armTo(h, 'L', L(h, 0.42, 2.12 * k, 0.12), L(h, 0.42, 1.65 * k, -0.15)); armTo(h, 'R', L(h, -0.42, 2.12 * k, 0.12), L(h, -0.42, 1.65 * k, -0.15)); }
    else if (p === 2) { armTo(h, 'L', L(h, 0.08, 1.74 * k, 0.04), L(h, 0.45, 1.70 * k, 0.05)); armTo(h, 'R', L(h, -0.08, 1.74 * k, 0.04), L(h, -0.45, 1.70 * k, 0.05)); }
  }

  /* ------------------------------------------------------------------------------------------ the kits -- */
  // The taker's: the people pack's real garments (a tee and jeans with their
  // folds), recoloured: the top in the shirt's colour, its trim in the trim's, the jeans cut above the knee into plain
  // shorts; the legs under them uncut again; socks a shell over the shins. The keeper and the referee are painted
  // (the runtime's own painted clothes), with the same socks shell.
  var REFGEO = {}, CLOTH = {}, CUTY = 0.60;
  function bodyMesh(obj) { var r = null; obj.traverse(function (o) { if (!r && o.isSkinnedMesh && o.geometry.userData && o.geometry.userData.groups) r = o; }); return r; }
  function packMesh(obj) { var r = null; obj.traverse(function (o) { if (o.isSkinnedMesh && o.name === 'pack') r = o; }); return r; }
  // the body's full shape (nothing hidden under clothes), from one person made bare and let go again
  function refGeo(id) {
    if (!REFGEO[id]) { var h = ctxRef.assets.human(id, {}); if (!h) return null; REFGEO[id] = bodyMesh(h.object).geometry; try { h.dispose(); } catch (e) {} }
    return REFGEO[id];
  }
  function withIndex(g, idx) {
    var g2 = new T3.BufferGeometry(); for (var an in g.attributes) g2.setAttribute(an, g.attributes[an]);
    g2.morphAttributes = g.morphAttributes; g2.morphTargetsRelative = g.morphTargetsRelative; g2.setIndex(new T3.BufferAttribute(idx, 1));
    g.groups.forEach(function (gg) { g2.addGroup(gg.start, gg.count, gg.materialIndex); }); g2.userData = g.userData; g2.boundingSphere = g.boundingSphere; return g2;
  }
  function hexRgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function kitCloth(m, K) {
    var key = m.uuid + K.shirt + K.shorts + K.trim; if (CLOTH[key]) return CLOTH[key];
    var img = m.map.image, w = img.width, hh = img.height, cv = document.createElement('canvas'); cv.width = w; cv.height = hh;
    var g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    var d = g.getImageData(0, 0, w, hh), D = d.data, x, y, i, Lm;
    var cs = hexRgb(K.shirt), ct = hexRgb(K.trim), cj = hexRgb(K.shorts), st = 0, sn = 0, jt = 0, jn = 0;
    function lum(i) { return (0.2126 * D[i] + 0.7152 * D[i + 1] + 0.0722 * D[i + 2]) / 255; }
    function jeans(x, y) { return y < 0.59 * hh && (x < 0.72 * w || (x < 0.78 * w && y > 0.404 * hh)); }
    function trim(i) { return D[i] > D[i + 1] + 45 && D[i] > D[i + 2] + 70; }
    for (y = 0; y < hh; y += 2) for (x = 0; x < w; x += 2) { i = (y * w + x) * 4; Lm = lum(i); if (Lm < 0.08 || trim(i)) continue; if (jeans(x, y)) { jt += Lm; jn++; } else { st += Lm; sn++; } }
    var mt = st / (sn || 1), mj = jt / (jn || 1);
    for (y = 0; y < hh; y++) for (x = 0; x < w; x++) {
      i = (y * w + x) * 4; Lm = lum(i); var c, k;
      if (trim(i)) { c = ct; k = 1; }
      else if (jeans(x, y)) { c = cj; k = Lm < 0.08 ? 0.8 : Math.min(1.08, Math.max(0.62, 0.86 + 0.32 * (Lm - mj) / mj)); }
      else { c = cs; k = Math.min(1.1, Math.max(0.4, Math.pow(Lm / mt, 0.85))); }
      D[i] = Math.min(255, c[0] * k); D[i + 1] = Math.min(255, c[1] * k); D[i + 2] = Math.min(255, c[2] * k);
    }
    g.putImageData(d, 0, 0);
    var t = new T3.CanvasTexture(cv); t.flipY = m.map.flipY; t.colorSpace = T3.SRGBColorSpace; t.anisotropy = 8;
    var nm = m.clone(); nm.map = t; nm.color.set('#FFFFFF'); nm.roughness = 0.78;
    return (CLOTH[key] = nm);
  }
  // the socks: a shell over the shins, the body's own skin weights and shape keys
  function socks(body, full, col) {
    var pos = full.attributes.position, nor = full.attributes.normal, si = full.attributes.skinIndex, sw = full.attributes.skinWeight, fi = full.index.array, B0 = full.groups[0];
    var map = {}, P = [], N = [], SI = [], SW = [], I = [], morph = full.morphAttributes.position || [], M = morph.map(function () { return []; });
    function vid(v) {
      if (map[v] !== undefined) return map[v]; var k = P.length / 3; map[v] = k;
      var nx = nor.getX(v), ny = nor.getY(v), nz = nor.getZ(v), off = 0.006 + 0.007 * Math.max(0, nz);
      P.push(pos.getX(v) + nx * off, pos.getY(v) + ny * off, pos.getZ(v) + nz * off); N.push(nx, ny, nz);
      SI.push(si.getX(v), si.getY(v), si.getZ(v), si.getW(v)); SW.push(sw.getX(v), sw.getY(v), sw.getZ(v), sw.getW(v));
      morph.forEach(function (ma, j) { M[j].push(ma.getX(v), ma.getY(v), ma.getZ(v)); }); return k;
    }
    for (var q = B0.start; q < B0.start + B0.count; q += 3) {
      var a = fi[q], b = fi[q + 1], c = fi[q + 2], ya = pos.getY(a), yb = pos.getY(b), yc = pos.getY(c);
      if (Math.min(ya, yb, yc) > 0.085 && Math.max(ya, yb, yc) < 0.47) I.push(vid(a), vid(b), vid(c));
    }
    var g = new T3.BufferGeometry();
    g.setAttribute('position', new T3.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new T3.Float32BufferAttribute(N, 3));
    g.setAttribute('skinIndex', new T3.Uint16BufferAttribute(SI, 4)); g.setAttribute('skinWeight', new T3.Float32BufferAttribute(SW, 4)); g.setIndex(I);
    g.morphAttributes.position = M.map(function (arr) { return new T3.Float32BufferAttribute(arr, 3); }); g.morphTargetsRelative = true;
    var mesh = new T3.SkinnedMesh(g, new T3.MeshStandardMaterial({ color: col, roughness: 0.82 }));
    mesh.updateMorphTargets(); for (var mi = 0; mi < mesh.morphTargetInfluences.length; mi++) mesh.morphTargetInfluences[mi] = body.morphTargetInfluences[mi] || 0;
    mesh.bind(body.skeleton, body.bindMatrix); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.name = 'socks';
    return mesh;
  }
  function socksOn(h, col, id) {
    var body = bodyMesh(h.object), full = refGeo(id);
    if (!body || !full) { note('kit: no body for the socks'); return; }
    body.parent.add(socks(body, full, col));
  }
  function footballKit(h, K, id) {
    var body = bodyMesh(h.object), pack = packMesh(h.object), full = refGeo(id);
    if (!body || !pack || !full) { note('kit: no ' + (!body ? 'body' : !pack ? 'pack' : 'bare body')); return false; }
    var pos = full.attributes.position, fi = full.index.array, bg = body.geometry, idx = new bg.index.array.constructor(bg.index.array), B0 = bg.groups[0], back = 0;
    for (var q = B0.start; q < B0.start + B0.count; q += 3) {
      if (idx[q] || idx[q + 1] || idx[q + 2]) continue;
      var a = fi[q], b = fi[q + 1], c = fi[q + 2];
      if (Math.max(pos.getY(a), pos.getY(b), pos.getY(c)) < CUTY + 0.03) { idx[q] = a; idx[q + 1] = b; idx[q + 2] = c; back++; }
    }
    body.geometry = withIndex(bg, idx);
    var pg = pack.geometry, pidx = new pg.index.array.constructor(pg.index.array), pp = pg.attributes.position, cut = 0;
    pg.groups.forEach(function (gr) {
      var m = pack.material[gr.materialIndex]; if (!m || m.visible === false || !m.map || m.roughness !== 0.88) return;
      for (var q2 = gr.start; q2 < gr.start + gr.count; q2 += 3) {
        if (Math.max(pp.getY(pidx[q2]), pp.getY(pidx[q2 + 1]), pp.getY(pidx[q2 + 2])) < CUTY - 0.01) { pidx[q2] = pidx[q2 + 1] = pidx[q2 + 2] = 0; cut++; }
      }
      pack.material[gr.materialIndex] = kitCloth(m, K);
    });
    pack.geometry = withIndex(pg, pidx);
    body.parent.add(socks(body, full, K.socks));
    return true;
  }
  // a person on the pitch, in a kit: 'garments' (the taker, on the male body with the people pack) or painted
  function person(id, n, K, garments) {
    var female = /female/.test(id), canWear = garments && !female && ctxRef.assets.ready('human-pack-male');
    var o = { skin: n.skin, hair: n.hair, hairColor: n.hairColor || '#16100C', height: female ? Math.min(n.height, 1.74) : n.height,
      build: { muscle: n.muscle == null ? 0.7 : n.muscle, lean: n.lean == null ? 0.55 : n.lean }, outfit: { shoes: K.boots, sole: '#1A1A1A' }, name: n.name, color: K.shirt };
    if (canWear) { o.outfit.top = null; o.wear = [{ name: K.long ? 'male_casualsuit02' : 'male_casualsuit06', color: K.shirt }]; o.clothes = { belt: false, beard: female ? undefined : n.beard }; }
    else o.clothes = { shirt: { kind: K.long ? 'long' : 'tee', color: K.shirt }, pants: { kind: 'shorts', color: K.shorts }, gloves: K.gloves || undefined, belt: false, beard: female ? undefined : n.beard };
    var h = ctxRef.assets.human(id, o);
    if (!h) return null;
    try {
      if (canWear) { if (!footballKit(h, K, id)) socksOn(h, K.socks, id); }
      else socksOn(h, K.socks, id);
    } catch (e) { note('kit: ' + (e && e.message || e)); }
    return h;
  }
  // (no library body at all: a plain figure, so the flow still runs)
  function standIn(THREE, col) {
    var g = new THREE.Group(), m = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 1.2, 4, 12), new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 }));
    m.position.y = 0.88; m.castShadow = true; g.add(m); return { object: g };
  }

  /* ------------------------------------------------------------------------------------------ the crowd -- */
  // sixteen looks (eight a side) filmed in three poses; a phone films six (three a side), smaller
  var CARD = [1.0, 2.25];
  function fanLooks() {
    var out = [], skins = ['caucasian', 'african', 'caucasian2', 'asian', 'caucasian-middle', 'african-middle', 'caucasian-old', 'asian-middle'];
    var hairs = ['short02', 'short04', 'afro01', 'short01', 'bob01', 'long01', 'ponytail01', 'short03'];
    for (var i = 0; i < 16; i++) {
      var A = i < 8, K = A ? A_KIT : B_KIT, j = i % 8;
      var shirt = [K.shirt, K.shirt, K.shirt, A ? '#FFFFFF' : '#1A1A1E', K.shirt, A ? '#2C5F9E' : '#E9C46A', K.shirt, K.shirt][j];
      var kind = ['tee', 'tee', 'long', 'tee', 'hoodie', 'tee', 'tee', 'long'][j];
      var gear = j === 2 ? { cap: { color: K.shirt } } : j === 5 ? { beanie: { color: K.shirt, pom: '#FFFFFF' } } : j === 6 ? { bandana: K.trim } : j === 7 ? { shades: '#0E0F12' } : {};
      out.push({ team: A ? 0 : 1, o: { skin: skins[(j + (A ? 0 : 3)) % 8], hair: hairs[(j * 3 + (A ? 1 : 0)) % 8], hairColor: j === 4 ? '#7A5A3A' : '#16100C', height: 1.62 + ((i * 37) % 30) / 100,
        build: { muscle: 0.3, lean: 0.3, weight: (i * 13 % 7) / 10 }, outfit: { shoes: '#F2F2F2' },
        clothes: { shirt: { kind: kind, color: shirt }, pants: { kind: j % 4 === 1 ? 'trousers' : 'jeans', color: ['#2E3A50', '#1E1F24', '#3C4C66', '#4A4036'][j % 4] }, jacket: j % 4 === 3 ? { kind: j % 8 === 3 ? 'puffer' : 'jacket', color: ['#15171C', '#22262E'][j % 2] } : undefined, beard: j === 1 ? 'stubble' : j === 4 ? 'full' : undefined }, gear: gear } });
    }
    return LOWQ ? [0, 2, 5, 8, 10, 13].map(function (i) { return out[i]; }) : out;
  }
  // the moods, as the shares of the three poses (stand, arms up, hands on the head) and how much a seat hops
  var MOODS = {
    ambient: { p: [0.80, 0.10, 0.10], hop: 0.15 },
    hush: { p: [0.86, 0.0, 0.14], hop: 0 },
    gasp: { p: [0.22, 0.03, 0.75], hop: 0 },
    erupt: { p: [0.08, 0.86, 0.06], hop: 1 },
    despair: { p: [0.30, 0.0, 0.70], hop: 0 },
    cheer: { p: [0.25, 0.70, 0.05], hop: 0.7 },
  };
  function crowdShader(THREE, atlas, decode, F, cols, rows) {
    var U = { uAtlas: { value: atlas }, uDecode: { value: decode ? 1 : 0 }, uT: { value: 0 }, uHop: { value: 0 }, uF: { value: F }, uCols: { value: cols }, uRows: { value: rows }, uTint: { value: new THREE.Color(1, 1, 1) } };
    return new THREE.ShaderMaterial({
      uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), U), fog: true, side: THREE.DoubleSide,
      vertexShader: [
        'attribute vec4 aSeat; attribute vec2 aDim; uniform float uT, uHop, uF, uCols, uRows; varying vec2 vUv; varying float vDim;',
        '#include <fog_pars_vertex>',
        'void main() {',
        '  vec4 c = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); float s = length((modelMatrix * instanceMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);',
        // (a card turned about the upright to face the camera)
        '  vec3 tc = cameraPosition - c.xyz; tc.y = 0.0; float tl = length(tc); vec3 rt = tl > 1e-4 ? vec3(tc.z, 0.0, -tc.x) / tl : vec3(1.0, 0.0, 0.0);',
        '  float cell = aSeat.x * uF + aSeat.y, row = floor(cell / uCols), col = cell - row * uCols;',
        '  vUv = vec2((col + (aSeat.w > 0.0 ? uv.x : 1.0 - uv.x)) / uCols, (row + uv.y) / uRows);',
        '  float hop = uHop * aDim.y * 0.17 * max(0.0, sin(uT * 7.5 + aSeat.z * 40.0));',
        '  vec3 p = c.xyz + rt * position.x * s + vec3(0.0, position.y * s + hop, 0.0);',
        '  vec4 mvPosition = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mvPosition; vDim = aDim.x;',
        '  #include <fog_vertex>',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D uAtlas; uniform float uDecode; uniform vec3 uTint; varying vec2 vUv; varying float vDim;',
        '#include <fog_pars_fragment>',
        'void main() {',
        '  vec4 e = texture2D(uAtlas, vUv); if (e.a < 0.42) discard;',
        // (the film keeps colour as its square root: c * c * 2 brings it back)
        '  vec3 c = uDecode > 0.5 ? e.rgb * e.rgb * 2.0 : e.rgb;',
        '  gl_FragColor = vec4(c * uTint * vDim, 1.0);',
        '  #include <tonemapping_fragment>',
        '  #include <colorspace_fragment>',
        '  #include <fog_fragment>',
        '}',
      ].join('\n'),
    });
  }
  // the last resort (no people to film, or ?crowd=0): figures drawn flat, a look a side in three poses
  function silhouettes(ctx) {
    var cw = 64, ch = 144;
    return ctx.textures.canvas(cw * 6, ch, function (g) {
      g.clearRect(0, 0, cw * 6, ch);
      for (var t = 0; t < 2; t++) for (var p = 0; p < 3; p++) {
        var x0 = (t * 3 + p) * cw, cx = x0 + cw / 2, K = t ? B_KIT : A_KIT;
        g.fillStyle = '#2A3040'; g.fillRect(cx - 9, 84, 7, 54); g.fillRect(cx + 2, 84, 7, 54);
        g.fillStyle = K.shirt; g.fillRect(cx - 12, 44, 24, 44);
        g.lineWidth = 7; g.lineCap = 'round'; g.strokeStyle = K.shirt; g.beginPath();
        if (p === 1) { g.moveTo(cx - 10, 48); g.lineTo(cx - 16, 8); g.moveTo(cx + 10, 48); g.lineTo(cx + 16, 8); }
        else if (p === 2) { g.moveTo(cx - 10, 48); g.lineTo(cx - 18, 30); g.lineTo(cx - 4, 22); g.moveTo(cx + 10, 48); g.lineTo(cx + 18, 30); g.lineTo(cx + 4, 22); }
        else { g.moveTo(cx - 12, 48); g.lineTo(cx - 15, 86); g.moveTo(cx + 12, 48); g.lineTo(cx + 15, 86); }
        g.stroke();
        g.fillStyle = '#C89A78'; g.beginPath(); g.arc(cx, 32, 9, 0, TAU); g.fill();
      }
    });
  }

  /* ------------------------------------------------------------------------------------------ the world -- */
  GameMog.world({
    shootout: {
      teams: [{ name: 'Uruguay', short: 'URU', color: '#74BDE8' }, { name: 'Spain', short: 'ESP', color: '#B3122E' }],
      taker: 0,
      body: 'human-athlete-male',
      goal: { frame: '#F6F6F4', net: '#F2F2F2' },
      floods: [[-38, 44, -60], [38, 44, -60], [0, 44, 10]],
    },
    play: { coins: false },
    // (audio-crowd-shootout: the recorded crowd, CC0, played by the runtime's sound; without it the crowd is synthesised)
    assets: ['human-athlete-male', 'human-pack-male', 'human-moves-football-male', 'human-moves-football-female', 'texture-grass', 'sky-night', 'audio-crowd-shootout'],
    theme: { sky: '#0B1220', fog: '#141C2C', ink: '#FFFFFF', panel: '#0B1220', accent: '#E9C46A', font: 'Oxanium' },
    graphics: {
      exposure: 1.0, environment: { hdri: 'sky-night', intensity: 0.5, extras: function () { return W.envExtras; } },
      bloom: { strength: 0.42, threshold: 1.0, radius: 0.55 },
      grade: { contrast: 1.08, saturation: 1.0, warmth: -0.04, vignette: 0.26, grain: 0.012 },
      shadows: { follow: 'hero', extent: 22, mapSize: 2048 },
    },
    camera: { distance: 6, height: 2.2, fov: 55 },
    build: function (ctx) {
      ctxRef = ctx; T3 = ctx.THREE; LOWQ = ctx.quality === 'low';
      var THREE = T3, S = ctx.scene;
      function inst(g, m, n, fn) { var im = ctx.instanced(g, m, n, fn); if (im) S.add(im); return im; }
      ctx.sky({ hdri: 'sky-night', sun: [0.2, 1, 0.1], exposure: 0.35, light: 0.3 });
      S.fog = new THREE.Fog('#121a2a', 260, 900);
      S.add(new THREE.HemisphereLight('#B7C6E8', '#24361E', 0.62));
      // the key (the runtime follows it round the box: graphics.shadows.follow 'hero'), a fill, a back light
      var sun = new THREE.DirectionalLight('#F4F6FF', 2.7);
      sun.castShadow = true; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
      sun.position.set(-38, 120, -10); sun.target.position.set(0, 0, -30);
      S.add(sun); S.add(sun.target);
      var fill = new THREE.DirectionalLight('#DDE6FF', 0.9); fill.position.set(40, 80, 30); S.add(fill);
      var back = new THREE.DirectionalLight('#FFF4E2', 0.7); back.position.set(10, 60, -120); S.add(back);

      /* the pitch: the turf, one mesh; the lines and spots, one more */
      var gt = ctx.assets.texture && ctx.assets.texture('texture-grass');
      var gm = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.92, metalness: 0 });
      if (gt) { gm.map = gt.map; gm.normalMap = gt.normalMap; gm.roughnessMap = gt.roughnessMap; gm.normalScale = new THREE.Vector2(0.55, 0.55);
        [gt.map, gt.normalMap, gt.roughnessMap].forEach(function (t) { if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set((AX * 2 + 6) / 2.2, (AZ * 2 + 6) / 2.2); } }); }
      gm.onBeforeCompile = function (sh) {
        sh.uniforms.gmGreen = { value: new THREE.Color('#2E6A22') }; sh.uniforms.gmDirt = { value: new THREE.Color('#6E6A3E') };
        sh.vertexShader = 'varying vec3 vW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = 'uniform vec3 gmGreen; uniform vec3 gmDirt; varying vec3 vW;\n' + sh.fragmentShader.replace('#include <map_fragment>', [
          '#ifdef USE_MAP',
          ' vec4 tx = texture2D(map, vMapUv); vec4 tx2 = texture2D(map, vMapUv * 0.131 + 0.37);',
          ' float l = dot(tx.rgb, vec3(0.299, 0.587, 0.114)), l2 = dot(tx2.rgb, vec3(0.333));',
          ' vec3 g = gmGreen * (0.62 + 0.9 * l) * (0.86 + 0.28 * l2);',
          ' float band = mod(floor((vW.z + 52.5) / 5.25), 2.0);',
          ' vec3 Vd = normalize(cameraPosition - vW);',
          ' float sheen = (band * 2.0 - 1.0) * Vd.z;',
          ' g *= mix(0.88, 1.08, band) * (1.0 + 0.12 * sheen);',
          ' float wear = smoothstep(1.7, 0.3, length(vW.xz - vec2(0.0, -41.5))) * 0.8 + smoothstep(4.6, 0.0, abs(vW.x)) * smoothstep(3.2, 0.0, abs(vW.z + 52.0)) * 0.75;',
          // (the run-up's lane, worn from the spot back to the taker's mark, 4.75 m off at his left: the tap-driven
          // run-up starts there; and the scuffed patch at the mark itself, where he bounces on his toes)
          ' vec2 rA = vec2(0.0, -41.5), rB = vec2(' + MARK[0].toFixed(2) + ', ' + MARK[1].toFixed(2) + '), rP = vW.xz - rA, rD = rB - rA;',
          ' float rH = clamp(dot(rP, rD) / dot(rD, rD), 0.0, 1.0);',
          ' wear += smoothstep(0.55, 0.12, length(rP - rD * rH)) * (0.34 - 0.18 * rH) + smoothstep(0.5, 0.08, length(vW.xz - rB)) * 0.4;',
          ' wear *= 0.55 + 0.9 * l2;',
          ' g = mix(g, gmDirt * (0.7 + 0.6 * l), clamp(wear, 0.0, 0.85));',
          ' diffuseColor.rgb *= g;',
          '#endif'].join('\n'));
      };
      var ground = new THREE.Mesh(new THREE.PlaneGeometry(AX * 2 + 6, AZ * 2 + 6), gm);
      ground.rotation.x = -PI / 2; ground.receiveShadow = true; ground.name = 'turf'; S.add(ground);
      var LW = 0.12, Y = 0.006, lines = [];
      function ln(pts) { lines.push(strip(pts, LW, Y)); }
      function spot(x, z, r) { lines.push(placed(new THREE.CircleGeometry(r, 24), [x, Y, z], [-PI / 2, 0, 0])); }
      ln([[-PW, -PL], [PW, -PL]]); ln([[-PW, PL], [PW, PL]]); ln([[-PW, -PL], [-PW, PL]]); ln([[PW, -PL], [PW, PL]]); ln([[-PW, 0], [PW, 0]]);
      ln(arc(0, 0, 9.15, 0, TAU, 96));
      [-1, 1].forEach(function (e) {
        var gl = e * PL, pa = gl - e * 16.5, ga = gl - e * 5.5, sp = gl - e * 11;
        ln([[-20.16, gl], [-20.16, pa], [20.16, pa], [20.16, gl]]); ln([[-9.16, gl], [-9.16, ga], [9.16, ga], [9.16, gl]]);
        var am = Math.acos(5.5 / 9.15); ln(e < 0 ? arc(0, sp, 9.15, -am, am, 40) : arc(0, sp, 9.15, PI - am, PI + am, 40));
        [-1, 1].forEach(function (sx) { ln(arc(sx * PW, gl, 1, sx > 0 ? (e < 0 ? -PI / 2 : PI) : (e < 0 ? 0 : PI / 2), sx > 0 ? (e < 0 ? 0 : 3 * PI / 2) : (e < 0 ? PI / 2 : PI), 12)); });
        spot(0, sp, 0.11);
      });
      spot(0, 0, 0.15);
      var lm = new THREE.MeshStandardMaterial({ color: '#EEEFEA', roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
      var lineMesh = new THREE.Mesh(merge(lines), lm);
      lineMesh.receiveShadow = true; lineMesh.name = 'lines'; S.add(lineMesh);

      /* the far goal (decor: the runtime builds the one shot at): the frame as one mesh, its nets as one more */
      var white = new THREE.MeshPhysicalMaterial({ color: '#F6F6F4', roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 });
      var netTex = ctx.textures.canvas(512, 512, function (g, w, h) {
        g.clearRect(0, 0, w, h); g.strokeStyle = '#FFFFFF'; g.lineWidth = 7; g.lineCap = 'round';
        for (var i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / 4); g.lineTo(w, i * h / 4); g.stroke(); }
      });
      netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
      function sag(geo, amt, axis) {
        var p = geo.attributes.position, uv = geo.attributes.uv;
        for (var i = 0; i < p.count; i++) { var u = uv.getX(i), v = uv.getY(i), s = Math.sin(u * PI) * Math.sin(v * PI) * amt; p.setComponent(i, axis, p.getComponent(i, axis) + s); }
        p.needsUpdate = true; geo.computeVertexNormals(); return geo;
      }
      var R0 = 0.06, HW = 3.66 + R0, HH = 2.44 + R0, D0 = 1.4, D1 = 2.3, NH = 2.44, frame = [], nets = [];
      // (each part placed in the goal's own frame, then the goal turned round to face the pitch from the far end)
      function inGoal(g, pos, rot) { placed(g, pos, rot); DUM.position.set(0, 0, PL); DUM.rotation.set(0, PI, 0); DUM.scale.set(1, 1, 1); DUM.updateMatrix(); g.applyMatrix4(DUM.matrix); return g; }
      [-1, 1].forEach(function (sx) {
        frame.push(inGoal(new THREE.CylinderGeometry(R0, R0, HH + R0, 20), [sx * HW, (HH + R0) / 2, 0]));
        frame.push(inGoal(new THREE.CylinderGeometry(0.025, 0.025, NH, 8), [sx * 3.7, NH / 2, -D0]));
        var sg = new THREE.BufferGeometry();
        sg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, NH, 0, 0, NH, -D0, 0, 0, 0, 0, NH, -D0, 0, 0, -D1], 3));
        sg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, NH / 0.12, D0 / 0.12, NH / 0.12, 0, 0, D0 / 0.12, NH / 0.12, D1 / 0.12, 0], 2));
        sg.computeVertexNormals();
        nets.push(inGoal(sg, [sx * 3.66, 0, 0]));
      });
      frame.push(inGoal(new THREE.CylinderGeometry(R0, R0, HW * 2 + R0 * 2, 20), [0, HH, 0], [0, 0, PI / 2]));
      nets.push(inGoal(scaleUv(sag(new THREE.PlaneGeometry(7.32, D0, 24, 6), -0.10, 2), 7.32 / 0.12, D0 / 0.12), [0, NH, -D0 / 2], [-PI / 2, 0, 0]));
      var bh = Math.hypot(NH, D1 - D0);
      nets.push(inGoal(scaleUv(sag(new THREE.PlaneGeometry(7.32, bh, 24, 10), -0.12, 2), 7.32 / 0.12, bh / 0.12), [0, NH / 2, -(D0 + D1) / 2], [Math.atan2(D1 - D0, NH), 0, 0]));
      var fm = new THREE.Mesh(merge(frame.map(function (g) { g.deleteAttribute('uv'); return g; })), white); fm.castShadow = true; fm.name = 'far goal'; S.add(fm);
      var netMat = new THREE.MeshStandardMaterial({ color: '#F2F2F2', alphaMap: netTex, transparent: true, depthWrite: false, opacity: 0.8, side: THREE.DoubleSide, roughness: 0.9 });
      var nm = new THREE.Mesh(merge(nets), netMat); nm.name = 'far nets'; S.add(nm);
      // corner flags
      var CORN = [[-PW, -PL], [PW, -PL], [-PW, PL], [PW, PL]];
      inst(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 8), white, 4, function (i, d) { d.position.set(CORN[i][0], 0.75, CORN[i][1]); });
      inst(new THREE.PlaneGeometry(0.42, 0.32).translate(0.21, 0, 0), new THREE.MeshStandardMaterial({ color: '#E9C46A', side: THREE.DoubleSide, roughness: 0.7 }), 4, function (i, d) { d.position.set(CORN[i][0], 1.33, CORN[i][1]); });

      /* the bowl: plain stands (no concrete texture: a phone's memory), the tiers, the boxes, the roof */
      var standMat = new THREE.MeshStandardMaterial({ color: '#2B3446', roughness: 0.85, flatShading: true });
      var qs = qSamples(2.5, 14);
      function tierProfile(T, front) {
        var p = [[T.d0, front], [T.d0, T.h0]];
        for (var j = 0; j < T.rows; j++) { p.push([T.d0 + (j + 1) * T.depth, T.h0 + j * T.rise]); p.push([T.d0 + (j + 1) * T.depth, T.h0 + (j + 1) * T.rise]); }
        return p;
      }
      S.add(sweep(tierProfile(LOW, 0), qs, standMat));
      S.add(sweep(tierProfile(UPP, UPP.h0 - 2.4), qs, standMat));
      var dark = new THREE.MeshStandardMaterial({ color: '#141A26', roughness: 0.8 });
      S.add(sweep([[UPP.d0, UPP.h0 - 2.4], [LOW.d1, UPP.h0 - 2.4]], qs, dark));                       // the upper tier's soffit
      S.add(sweep([[UPP.d1, UPP.h1], [UPP.d1, ROOF.h1], [ROOF.d1, ROOF.h1]], qs, dark));               // the back wall
      var roofMat = new THREE.MeshStandardMaterial({ color: '#202734', roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide });
      S.add(sweep([[ROOF.d0, ROOF.h0], [ROOF.d1, ROOF.h1]], qs, roofMat));
      S.add(sweep([[ROOF.d0, ROOF.h0], [ROOF.d0, ROOF.h0 + 2.6]], qs, new THREE.MeshStandardMaterial({ color: '#D9DEE6', roughness: 0.5, metalness: 0.4 })));
      var boxTex = ctx.textures.canvas(512, 64, function (g, w, h) {
        g.fillStyle = '#0A0F18'; g.fillRect(0, 0, w, h);
        for (var i = 0; i < 16; i++) { g.fillStyle = i % 3 ? '#6A5638' : '#3A4A62'; g.globalAlpha = 0.35 + (i * 7 % 5) / 14; g.fillRect(i * 32 + 4, 20, 24, 26); }
        g.globalAlpha = 1; g.fillStyle = '#1C2230'; for (var k = 0; k < 16; k++) g.fillRect(k * 32, 0, 3, h);
      });
      boxTex.wrapS = THREE.RepeatWrapping; boxTex.repeat.set(1 / 40 * 60, 1);
      S.add(sweep([[LOW.d1, LOW.h1], [LOW.d1, UPP.h0 - 2.4]], qs, new THREE.MeshStandardMaterial({ color: '#0A0F18', emissive: '#FFFFFF', emissiveMap: boxTex, emissiveIntensity: 0.55, map: boxTex, roughness: 0.2, metalness: 0.5 })));
      // the ribbon boards: the upper tier's fascia, and the boards round the pitch (all four one mesh, their backs one more)
      function ledTex(w, h, words) {
        return ctx.textures.canvas(w, h, function (g, W_, H) {
          var gr = g.createLinearGradient(0, 0, W_, 0); gr.addColorStop(0, '#071022'); gr.addColorStop(0.5, '#0E1E3E'); gr.addColorStop(1, '#071022');
          g.fillStyle = gr; g.fillRect(0, 0, W_, H);
          var n = words.length, cw = W_ / n;
          for (var i = 0; i < n; i++) {
            var x0 = i * cw;
            var sw = g.createLinearGradient(x0, 0, x0 + cw, H); sw.addColorStop(0, 'rgba(233,196,106,0)'); sw.addColorStop(0.5, 'rgba(233,196,106,0.35)'); sw.addColorStop(1, 'rgba(108,184,230,0)');
            g.fillStyle = sw; g.beginPath(); g.moveTo(x0, H); g.lineTo(x0 + cw * 0.35, 0); g.lineTo(x0 + cw * 0.55, 0); g.lineTo(x0 + cw * 0.2, H); g.fill();
            g.fillStyle = i % 2 ? '#E9C46A' : '#FFFFFF'; g.font = '800 ' + Math.round(H * 0.56) + 'px Oxanium, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText(words[i], x0 + cw * 0.6, H * 0.53, cw * 0.7);
          }
        });
      }
      var fasc = ledTex(2048, 64, ['SHOOTOUT', 'GAMEMOG', 'THE FINAL', 'MOG IT', 'SHOOTOUT', 'GAMEMOG']);
      // (fix-i4, review-i3 D8: one texture per 64 m behind the goals, so a word keeps its shape: it was 6 a texture per
      // 6.7 u, the letters squashed to a fifth of their width; the sides run 1.6x wider, as the pitch boards do)
      fasc.wrapS = THREE.RepeatWrapping; fasc.repeat.set(1.525 / 64, 1);
      S.add(sweep([[UPP.d0 - 0.05, UPP.h0 - 2.4], [UPP.d0 - 0.05, UPP.h0 - 0.4]], qs, new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#FFFFFF', emissiveMap: fasc, emissiveIntensity: 1.25, roughness: 0.4 })));
      var bTex = ledTex(2048, 96, ['GAMEMOG', 'SHOOTOUT', 'MOG IT', 'THE FINAL']);
      bTex.wrapS = THREE.RepeatWrapping;
      var BX = PW + 5.2, BZ = PL + 4.2, boards = [], backs = [];
      [[[-BX + 2, -BZ], [BX - 2, -BZ]], [[BX - 2, BZ], [-BX + 2, BZ]], [[BX, -BZ + 2], [BX, BZ - 2]], [[-BX, BZ - 2], [-BX, -BZ + 2]]].forEach(function (seg) {
        var a = seg[0], b = seg[1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), at = [(a[0] + b[0]) / 2, 0.5, (a[1] + b[1]) / 2], yaw = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
        boards.push(placed(scaleUv(new THREE.PlaneGeometry(len, 0.9), len / 40, 1), at, [0, yaw, 0], function (D) { D.rotateX(-0.12); }));
        var bb = new THREE.BoxGeometry(len, 0.95, 0.25); bb.deleteAttribute('uv');
        backs.push(placed(bb, at, [0, yaw, 0], function (D) { D.rotateX(-0.12); D.translateZ(-0.14); }));
      });
      var bm = new THREE.Mesh(merge(boards), new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#FFFFFF', emissiveMap: bTex, emissiveIntensity: 1.45, roughness: 0.35 })); bm.name = 'boards'; S.add(bm);
      var bk = new THREE.Mesh(merge(backs), dark); bk.name = 'board backs'; S.add(bk);
      // the floodlights: a ring of lamps under the roof's edge
      var lampQs = []; for (var s = 0; s < 8; s++) { var n = Math.round(segLen(s, ROOF.d0 + 1) / 1.6); for (var k = 0; k < n; k++) lampQs.push(s + (k + 0.5) / n); }
      var o2 = {};
      inst(new THREE.BoxGeometry(1.1, 0.5, 0.25), new THREE.MeshStandardMaterial({ color: '#FFFFFF', emissive: '#F4F7FF', emissiveIntensity: 5 }), lampQs.length * 2, function (i, d) {
        var q = lampQs[i >> 1], row = i & 1; ring(ROOF.d0 + 0.9 + row * 0.9, q, o2);
        d.position.set(o2.x, ROOF.h0 - 0.4 - row * 0.15, o2.z); d.rotation.set(0, Math.atan2(o2.nx, o2.nz), 0); d.rotateX(0.75);
      });
      // (the lamps' ring, seen in every glossy surface)
      var envG = new THREE.Group();
      var envRing = new THREE.Mesh(new THREE.TorusGeometry(60, 3, 6, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 6.4) })); envRing.rotation.x = PI / 2; envRing.position.y = 42; envG.add(envRing);
      W.envExtras = envG;

      /* the crowd: the seats, each with a side */
      var seats = [];
      function seatRow(T, j) {
        var d = T.d0 + (j + 0.55) * T.depth, y = T.h0 + j * T.rise;
        for (var s = 0; s < 8; s++) {
          var len = segLen(s, d), n = Math.floor(len / 0.52);
          for (var k = 0; k < n; k++) {
            var along = (k + 0.5) / n * len;
            if (s % 2 === 0 && (along % 16) < 1.1) continue;                                 // the aisles
            if (s % 2 === 1 && Math.abs(along - len / 2) < 0.6) continue;
            var o = ring(d, s + (k + 0.5) / n, {});
            seats.push({ x: o.x, y: y, z: o.z, nx: o.nx, nz: o.nz, tier: T === LOW ? 0 : 1, j: j, rows: T.rows, s: s });
          }
        }
      }
      for (var j = 0; j < LOW.rows; j++) seatRow(LOW, j);
      for (var j2 = 0; j2 < UPP.rows; j2++) seatRow(UPP, j2);
      // (team 0 behind the goal shot at, team 1 behind the far one, mixed along the sides)
      function teamOf(st, i) { var side = st.z < -AZ + 4 ? 0.88 : st.z > AZ - 4 ? 0.12 : 0.5 + 0.35 * Math.sin(st.x * 0.13 + st.z * 0.07); return ((i * 2654435761) % 1000) / 1000 < side ? 0 : 1; }
      seats.forEach(function (st, i) { st.team = teamOf(st, i); });

      // the people in the stands, filmed (one at a time, so a phone holds one person's textures) into a sheet of cards:
      // looks x poses
      var looks = fanLooks(), sheet = null;
      if (ctx.shootout && typeof ctx.shootout.impostors === 'function' && ctx.assets.ready(BODY)) {
        try {
          sheet = ctx.shootout.impostors({
            count: looks.length, frames: POSES, cell: LOWQ ? [64, 144] : [128, 288], size: CARD, foot: 0.03, cols: 2 * POSES,
            light: { sky: '#E8EEFF', ground: '#3A4A30', hemi: 1.1, key: ['#FFFFFF', 2.4, [1.5, 4, 5]], rim: ['#C8D6FF', 1.2, [-2, 3, -4]] },
            make: function (i) {
              var h = ctx.assets.human(BODY, looks[i].o);
              if (!h) return null;
              rig(h); h.k = (looks[i].o.height || 1.75) / 1.869;
              h.object.traverse(function (o) { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
              // (the idle settled, then kept: each pose starts from it)
              h.settle = function () {
                for (var f = 0; f < 50; f++) h.animate(f / 60, 1 / 60, { speed: 0, lateral: 0, crashed: false, paused: false, brawl: { stance: 'idle' } });
                h.base = []; h.object.traverse(function (o) { if (o.isBone) h.base.push([o, o.quaternion.clone()]); });
              };
              return h;
            },
            pose: function (h, f) {
              if (h.base) h.base.forEach(function (b) { b[0].quaternion.copy(b[1]); });
              h.object.updateMatrixWorld(true);
              try { fanPose(h, f); } catch (e) { note('fan pose ' + f + ': ' + (e && e.message || e)); }
            },
          });
        } catch (e) { note('crowd film: ' + (e && e.message || e)); sheet = null; }
      }
      var atlas, decode, F = POSES, cols, rows, lookTeam;
      if (sheet && sheet.texture) { atlas = sheet.texture; decode = true; cols = sheet.cols; rows = sheet.rows; lookTeam = looks.map(function (l) { return l.team; }); }
      else { atlas = silhouettes(ctx); decode = false; cols = 6; rows = 1; lookTeam = [0, 1]; }
      var byTeam = [[], []]; lookTeam.forEach(function (t, i) { byTeam[t].push(i); });
      var crowdMat = crowdShader(THREE, atlas, decode, F, cols, rows);
      // the cards: eight sectors (one a side of the bowl), each culled on its own when out of view
      var cardGeo = new THREE.PlaneGeometry(CARD[0], CARD[1]).translate(0, CARD[1] / 2 - 0.03, 0);
      var sectors = [];
      for (var sc = 0; sc < 8; sc++) {
        var mine = []; seats.forEach(function (st, i) { if (st.s === sc) mine.push(i); });
        if (!mine.length) continue;
        var geo = cardGeo.clone(), aSeat = new Float32Array(mine.length * 4), aDim = new Float32Array(mine.length * 2);
        mine.forEach(function (i, q) {
          var st = seats[i], L0 = byTeam[st.team].length ? byTeam[st.team] : byTeam[0];
          aSeat[q * 4] = L0[((i * 16807) >>> 0) % L0.length]; aSeat[q * 4 + 1] = 0; aSeat[q * 4 + 2] = ((i * 48271) % 1000) / 1000; aSeat[q * 4 + 3] = ((i * 69621) % 7) < 3 ? -1 : 1;
          var b = st.tier ? 0.40 + 0.16 * (1 - st.j / st.rows) : 0.62 - 0.12 * (st.j / st.rows); b *= 0.82 + ((i * 31) % 36) / 100;
          aDim[q * 2] = b; aDim[q * 2 + 1] = 0;
        });
        var A1 = new THREE.InstancedBufferAttribute(aSeat, 4), A2 = new THREE.InstancedBufferAttribute(aDim, 2);
        geo.setAttribute('aSeat', A1); geo.setAttribute('aDim', A2);
        var im = new THREE.InstancedMesh(geo, crowdMat, mine.length);
        var M4 = new THREE.Matrix4();
        mine.forEach(function (i, q) { var st = seats[i], s2 = 0.94 + ((i * 7919) % 100) / 900; M4.makeScale(s2, s2, s2).setPosition(st.x, st.y, st.z); im.setMatrixAt(q, M4); });
        im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.name = 'crowd ' + sc;
        S.add(im);
        sectors.push({ im: im, seats: mine, aSeat: A1, aDim: A2 });
      }
      W.crowdMat = crowdMat; W.sectors = sectors; W.seats = seats;

      // flags among them, a side's colours each
      var flagN = Math.floor(seats.length * 0.0035);
      function flagTex(c1, c2, n) { return ctx.textures.canvas(128, 80, function (g, w, h) { for (var i = 0; i < n; i++) { g.fillStyle = i % 2 ? c2 : c1; g.fillRect(0, i * h / n, w, h / n + 1); } var gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(0,0,0,0.25)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.08)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0.05)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }); }
      var flagMats = [new THREE.MeshStandardMaterial({ map: flagTex(A_KIT.shirt, '#FFFFFF', 5), side: THREE.DoubleSide, roughness: 0.85, color: '#9AA0A8' }), new THREE.MeshStandardMaterial({ map: flagTex(B_KIT.shirt, '#E9C46A', 3), side: THREE.DoubleSide, roughness: 0.85, color: '#9AA0A8' })];
      var fg = new THREE.PlaneGeometry(1.1, 0.7, 8, 2); fg.translate(0.55, 0, 0); var fp = fg.attributes.position; for (var vi = 0; vi < fp.count; vi++) fp.setZ(vi, Math.sin(fp.getX(vi) * 5.5) * 0.09 * fp.getX(vi)); fg.computeVertexNormals();
      var poleMat = new THREE.MeshStandardMaterial({ color: '#222222' }), poleGeo = new THREE.CylinderGeometry(0.012, 0.012, 1.6, 5);
      [0, 1].forEach(function (tm) {
        var list = []; for (var i = 0; i < seats.length && list.length < flagN; i += 37 + (i % 11)) if (seats[i].team === tm) list.push(seats[i]);
        inst(fg, flagMats[tm], list.length, function (i, d) { var st = list[i]; d.position.set(st.x - st.nx * 0.2, st.y + 2.45, st.z - st.nz * 0.2); d.rotation.set(0.1, Math.atan2(-st.nx, -st.nz) + PI / 2 + (i % 5 - 2) * 0.5, (i % 3 - 1) * 0.25); });
        inst(poleGeo, poleMat, list.length, function (i, d) { var st = list[i]; d.position.set(st.x - st.nx * 0.2, st.y + 2.0, st.z - st.nz * 0.2); });
      });
      // camera flashes (the eruption): bright specks among the taking side's seats, each twinkling on its own
      var fl = []; for (var i = 0; i < seats.length; i += 97) if (seats[i].team === TAKER) fl.push(seats[i]);
      var flashU = { uFlash: { value: 0 } }, flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 9, 9.5), side: THREE.DoubleSide });
      flashMat.onBeforeCompile = function (sh) {
        sh.uniforms.uFlash = flashU.uFlash;
        sh.vertexShader = 'uniform float uFlash;\n' + sh.vertexShader.replace('#include <begin_vertex>', [
          '#include <begin_vertex>',
          '#ifdef USE_INSTANCING',
          ' float fSeed = instanceMatrix[3].x * 1.37 + instanceMatrix[3].z * 0.61;',
          ' transformed *= step(0.86, fract(sin(fSeed + floor(uFlash * 14.0) * 13.13) * 43758.5453));',
          '#endif'].join('\n'));
      };
      W.flashes = inst(new THREE.PlaneGeometry(0.22, 0.22), flashMat, fl.length, function (i, d) { var st = fl[i]; d.position.set(st.x - st.nx * 0.3, st.y + 1.6, st.z - st.nz * 0.3); d.rotation.set(0, Math.atan2(-st.nx, -st.nz), 0); });
      if (W.flashes) { W.flashes.visible = false; W.flashes.frustumCulled = false; }
      W.flashU = flashU;
      // ticker tape over the end behind the goal, falling (a shader: no matrices written a frame)
      var NT = LOWQ ? 900 : 2600, tapeU = { uTape: { value: 0 } }, tapeCols = [new THREE.Color('#F2D27A'), new THREE.Color('#FFFFFF'), new THREE.Color(A_KIT.shirt)];
      var tapeMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', emissive: '#FFFFFF', emissiveIntensity: 0.25, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.3 });
      tapeMat.onBeforeCompile = function (sh) {
        sh.uniforms.uTape = tapeU.uTape;
        sh.vertexShader = 'uniform float uTape;\n' + sh.vertexShader.replace('#include <project_vertex>', [
          'vec4 tw = vec4(transformed, 1.0);',
          '#ifdef USE_INSTANCING',
          ' vec3 ts = instanceMatrix[3].xyz; float r1 = fract(sin(ts.x * 12.9898 + ts.z * 78.233) * 43758.5453);',
          ' float a = uTape * (2.0 + 4.0 * r1) + r1 * 6.2831; float ca = cos(a), sa = sin(a);',
          ' tw.xyz = vec3(tw.x * ca - tw.z * sa, tw.y, tw.x * sa + tw.z * ca);',
          ' tw = instanceMatrix * tw;',
          ' tw.y -= mod(uTape * (0.9 + 0.8 * r1) + r1 * 20.0, 20.0);',
          ' tw.x += sin(uTape * 1.7 + r1 * 30.0) * 0.6;',
          '#endif',
          'vec4 mvPosition = modelViewMatrix * tw;',
          'gl_Position = projectionMatrix * mvPosition;'].join('\n'));
      };
      W.tape = inst(new THREE.PlaneGeometry(0.05, 0.11), tapeMat, NT, function (i, d) {
        var r1 = ((i * 2654435761) % 10007) / 10007, r2 = ((i * 40503) % 9973) / 9973, r3 = ((i * 69069) % 9967) / 9967;
        d.position.set(-30 + r1 * 60, 23 + r2 * 2, -76 + r3 * 18); d.rotation.set(r1 * 9, r2 * 9, r3 * 9);
      });
      if (W.tape) { for (var ti = 0; ti < NT; ti++) W.tape.setColorAt(ti, tapeCols[ti % 3]); W.tape.instanceColor.needsUpdate = true; W.tape.visible = false; W.tape.frustumCulled = false; }
      W.tapeU = tapeU;

      // the crowd's mood from the runtime's moments: which pose each seat takes, how it hops
      W.setMood = setMood;
      function poseFor(i, P) { var r = ((i * 48271 + W.moodN * 7919) % 1000) / 1000, c = 0; for (var p = 0; p < 2; p++) { c += P[p]; if (r < c) return p; } return 2; }
      function setMood(name, happy) {
        // name: one mood for every seat, or 'erupt' for the happy side's seats with 'despair' for the other
        W.moodN = (W.moodN || 0) + 1; W.mood = name + (happy == null ? '' : ':' + happy);
        sectors.forEach(function (sec) {
          var A = sec.aSeat.array, D = sec.aDim.array;
          sec.seats.forEach(function (i, q) {
            var m = MOODS[name] || MOODS.ambient;
            if (happy === 0 || happy === 1) m = seats[i].team === happy ? MOODS[name] : MOODS.despair;
            A[q * 4 + 1] = poseFor(i, m.p); D[q * 2 + 1] = m.hop;
          });
          sec.aSeat.needsUpdate = true; sec.aDim.needsUpdate = true;
        });
      }
      W.hopT = 0.25; W.hop = 0; W.gasp = 0; W.party = 0; W.slowHop = 1;
      setMood('hush');
      var on = function (n, fn) { ctx.on(n, function (d) { try { fn(d || {}); } catch (e) { note(n + ': ' + (e && e.message || e)); } }); };
      on('walk', function () { setMood('ambient'); W.hopT = 0.25; W.party = 0; });
      on('whistle', function () { setMood('hush'); W.hopT = 0; });
      on('kick', function (d) { W.hopT = 0; W.party = 0; W.lastKick = { band: typeof d.band === 'string' ? d.band : null, kmh: +d.kmh || null }; });
      on('woodwork', function () { setMood('gasp'); W.gasp = 0.6; W.hopT = 0; });
      // (a goal struck ON FIRE parties two seconds longer)
      on('goal', function () { W.gasp = 0; setMood('erupt', TAKER); W.hopT = 1; W.party = W.lastKick && W.lastKick.band === 'ON FIRE' ? 8 : 6; });
      on('save', function () { W.gasp = 0; setMood('erupt', 1 - TAKER); W.hopT = 1; });
      on('miss', function () { W.gasp = 0; setMood('erupt', 1 - TAKER); W.hopT = 0.8; });
      on('replay', function (d) { W.slowHop = d.on ? 0.5 : 1; });
      on('finish', function () { setMood('ambient'); W.hopT = 0.25; });
    },
    // the taker, when you are not playing as yourself: the library human itself (the runtime places it)
    player: function (ctx) {
      var h = null;
      try { h = person(BODY, TAKER_LOOK, A_KIT, true); } catch (e) { note('player: ' + (e && e.message || e)); }
      return h || standIn(ctx.THREE, A_KIT.shirt);
    },
    // k 1 the keeper, k 2 the referee, on the match's body (yours when you play as yourself)
    rival: function (ctx, k, o) {
      o = o || {};
      var id = typeof o.body === 'string' && ctx.assets.ready(o.body) ? o.body : BODY, keeper = o.role ? o.role === 'keeper' : k === 1, h = null;
      try { h = keeper ? person(id, KEEPER_LOOK, KEEPER_KIT, false) : person(id, REF_LOOK, REF_KIT, false); } catch (e) { note('rival ' + k + ': ' + (e && e.message || e)); }
      return h || standIn(ctx.THREE, keeper ? KEEPER_KIT.shirt : REF_KIT.shirt);
    },
    obstacles: function () { return []; },
    update: function (ctx, t, dt) {
      // the gasp at the woodwork holds 0.6 s, then the hush comes back unless the outcome came first
      if (W.gasp > 0) { W.gasp -= dt; if (W.gasp <= 0 && /^gasp/.test(W.mood)) W.setMood('hush'); }
      W.hop += (W.hopT * W.slowHop - W.hop) * Math.min(1, dt * 4);
      if (W.crowdMat) { W.crowdMat.uniforms.uT.value = t; W.crowdMat.uniforms.uHop.value = W.hop; }
      // the tape and the flashes for six seconds after a goal
      W.party = Math.max(0, W.party - dt);
      var party = W.party > 0;
      if (W.tape) { W.tape.visible = party; if (party) W.tapeU.uTape.value += dt; }
      if (W.flashes) { W.flashes.visible = party; if (party) W.flashU.uFlash.value = t; }
    },
  });
})();
