/*
 * The hero's portrait (4 Nov, the owner: the homepage's round "Jump in" pictures should be "profile pics of the games'
 * main characters"): head and shoulders, centred, lit from the front, a 512 px square JPEG. Shot by both test drives in
 * the same pass as the key art, right after it (lib/runtime/drive.js keyArt in the creator's browser, lib/key-art.ts
 * capturePortrait on the server), and kept as the game's art_avatar (app/g/[slug]/avatar).
 *
 * Recording-only, as the key art's film is: the camera is moved only for the frames it shoots, through the scene's own
 * onBeforeRender (only the runtime's main camera, never a mirror's or a shadow's), a soft key light is added beside the
 * lens for those frames, and both are gone after. Play is never changed.
 *
 * Where the hero is: the runtime's player (debug.internals().player.object; in a kart race, your kart, its driver
 * inside), or a Grand Prix's own car (gp-hero / gp-car-*, the one nearest the chase camera). His face: a head bone if
 * the model has one, else the top of the body (a creature, a blob), or the whole machine for a vehicle. Which way is
 * his front: the camera that is up when it is called, which is the key art's (it looks at the hero from the front);
 * a Grand Prix's is its chase camera, behind, so it is turned round (opts.behind).
 *
 *   GameMogPortrait.take({ behind, angles, zoom, key }) -> Promise<{ image: dataURL | null, look, angle, kind } | null>
 */
(function () {
  if (window.GameMogPortrait) return;
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function rt() { return window.__gmRuntime; }
  var S = 512;

  function visibleIn(o, scene) { for (var p = o; p; p = p.parent) { if (!p.visible) return false; if (p === scene) return true; } return false; }

  // the hero's object, and whether it is a machine (framed whole) rather than a body (framed head and shoulders)
  function heroOf(I) {
    var st = {}; try { st = rt().state() || {}; } catch (e) {}
    var P = I.player, o = P && P.object;
    if (o && visibleIn(o, I.scene)) {
      var box = new I.THREE.Box3().setFromObject(o);
      if (!box.isEmpty()) return { o: o, vehicle: !!P.vehicle, height: P.height, kind: st.kart ? 'kart' : st.open ? 'open' : st.shootout ? 'shootout' : 'track' };
    }
    // a Grand Prix draws its own car: the hero's rig nearest the camera that chases it
    var best = null, bd = Infinity, at = new I.THREE.Vector3();
    I.scene.traverse(function (q) {
      if (!/^gp-(hero|car-)/.test(q.name || '') || !visibleIn(q, I.scene)) return;
      q.getWorldPosition(at); var d = at.distanceTo(I.camera.position);
      if (d < bd) { bd = d; best = q; }
    });
    return best ? { o: best, vehicle: true, height: 0, kind: 'gp' } : null;
  }

  // the head bone (a rig's "head", any prefix), never its end marker
  function headBone(o) {
    var exact = null, loose = null;
    o.traverse(function (q) {
      if (!q.isBone) return; var n = String(q.name || '').toLowerCase().replace(/^.*[:_|]/, '');
      if (n === 'head') { if (!exact) exact = q; } else if (!loose && /head$/.test(n) && !/top|end|nub/.test(n)) loose = q;
    });
    return exact || loose;
  }

  // which way his body faces, from his skeleton: his left side's bone less his right's (shoulders, else hips), crossed
  // with up (a body facing +z has its left at +x); null for a model with no such pair
  var SIDE_PARTS = ['upperarm', 'shoulder', 'clavicle', 'upleg', 'thigh', 'arm', 'leg'];
  function sideOf(n) {
    if (/left|^l[._ -]|[._ -]l$|[._ -]l[._ -]/.test(n)) return 'L';
    if (/right|^r[._ -]|[._ -]r$|[._ -]r[._ -]/.test(n)) return 'R';
    return null;
  }
  function skeletonFront(o, T) {
    var found = {};
    o.traverse(function (q) {
      if (!q.isBone) return; var n = String(q.name || '').toLowerCase(), side = sideOf(n); if (!side) return;
      for (var i = 0; i < SIDE_PARTS.length; i++) {
        var p = SIDE_PARTS[i]; if (n.indexOf(p) < 0 || (p === 'arm' && /fore|lower/.test(n)) || (p === 'leg' && /lower|up/.test(n))) continue;
        var f = found[p] || (found[p] = {}); if (!f[side]) f[side] = q; break;
      }
    });
    for (var j = 0; j < SIDE_PARTS.length; j++) {
      var pr = found[SIDE_PARTS[j]]; if (!pr || !pr.L || !pr.R) continue;
      var l = pr.L.getWorldPosition(new T.Vector3()), r = pr.R.getWorldPosition(new T.Vector3());
      var f2 = new T.Vector3().crossVectors(l.sub(r), new T.Vector3(0, 1, 0)); f2.y = 0;
      if (f2.lengthSq() > 1e-6) return f2.normalize();
    }
    return null;
  }

  // the people round him (anyone else with a skinned body near his head): out of the picture while it is shot, so
  // no one stands in front of his face; each is put back after
  function crowd(I, H, C) {
    var mine = new Set(), hidden = [], at = new I.THREE.Vector3();
    H.o.traverse(function (q) { mine.add(q); });
    I.scene.traverse(function (m) {
      if (!m.isSkinnedMesh || mine.has(m) || !m.visible || !m.skeleton || !m.skeleton.bones.length) return;
      m.skeleton.bones[0].getWorldPosition(at);
      if (Math.hypot(at.x - C.x, at.z - C.z) > 3.2 || Math.abs(at.y - C.y) > 4) return;
      // the body and what it carries (its parent, unless that holds the hero too)
      var who = m.parent && m.parent !== I.scene && !(function () { var k = false; m.parent.traverse(function (q) { if (q === H.o) k = true; }); return k; })() ? m.parent : m;
      if (who.visible) { who.visible = false; hidden.push(who); }
    });
    return function () { hidden.forEach(function (q) { q.visible = true; }); };
  }

  // his head as drawn, measured once: every vertex the head bone (or a bone under it: jaw, eyes, hair) mostly moves,
  // skinned as he stands, and anything hung on those bones (a hat, a helmet); its middle kept in the bone's own terms
  // (so it follows the head) and its height. Null when nothing is weighted to it
  function headBox(o, bone, T) {
    var under = new Set(); bone.traverse(function (q) { under.add(q); });
    var box = new T.Box3(), v = new T.Vector3(), n = 0, xs = [], ys = [], zs = [];
    o.traverse(function (m) {
      if (!m.isSkinnedMesh || !m.skeleton || !m.visible) return;
      var idx = []; m.skeleton.bones.forEach(function (b, i) { if (under.has(b)) idx.push(i); });
      if (!idx.length) return;
      var g = m.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, pos = g.attributes.position; if (!si || !sw || !pos) return;
      var set = new Set(idx), step = Math.max(1, Math.floor(pos.count / 40000));
      m.updateMatrixWorld(true);
      for (var i = 0; i < pos.count; i += step) {
        var w = 0;
        for (var k = 0; k < 4; k++) if (set.has(si.getComponent(i, k))) w += sw.getComponent(i, k);
        if (w < 0.5) continue;
        v.fromBufferAttribute(pos, i); m.applyBoneTransform(i, v); m.localToWorld(v); xs.push(v.x); ys.push(v.y); zs.push(v.z); n++;
      }
    });
    // (the middle 90% each way: a scarf, a ponytail or a plume the head bone also swings is not his head)
    if (xs.length >= 20) {
      var cut = function (a) { a.sort(function (p, q) { return p - q; }); return [a[Math.floor(a.length * 0.05)], a[Math.floor(a.length * 0.95)]]; };
      var X = cut(xs), Y = cut(ys), Z = cut(zs); box.set(new T.Vector3(X[0], Y[0], Z[0]), new T.Vector3(X[1], Y[1], Z[1]));
    } else {
      // a head hung on the bone (a helmet, a mask) rather than skinned to it
      bone.traverse(function (q) { if (!q.isBone && q.isMesh && q.visible) { box.union(new T.Box3().setFromObject(q)); n++; } });
    }
    if (n < 20 || box.isEmpty()) return null;
    var c = box.getCenter(new T.Vector3()), h = box.max.y - box.min.y;
    return { local: bone.worldToLocal(c.clone()), h: Math.max(h, (box.max.x - box.min.x) * 0.8, (box.max.z - box.min.z) * 0.8) };
  }

  // the parts of him that are drawn solid (no light cone, glow, trail or sprite), for his size
  function solidBox(o, T) {
    var box = new T.Box3(), b = new T.Box3();
    o.traverse(function (m) {
      if (!m.isMesh || !m.visible || !m.geometry) return;
      var mat = Array.isArray(m.material) ? m.material[0] : m.material;
      if (mat && (mat.blending === T.AdditiveBlending || (mat.transparent && (mat.opacity < 0.6 || mat.depthWrite === false)))) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      if (m.isSkinnedMesh || m.isInstancedMesh) b.setFromObject(m); else b.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
      box.union(b);
    });
    return box.isEmpty() ? new T.Box3().setFromObject(o) : box;
  }

  // a machine's driver (5 Nov, the owner's reviewer: "the driver's face, not the vehicle"): a part named for a head, a
  // helmet or a driver; else a body with a head bone inside it; else the highest small part near its middle (a helmet
  // in a cockpit, a mascot on a roof). Null when there is nothing like one: then the machine is framed whole
  function driverOf(o, T) {
    var named = null;
    o.traverse(function (q) { if (!named && q.visible && /head|helmet|driver|pilot|rider/i.test(q.name || '') && !q.isBone) named = q; });
    if (named) return { o: named };
    var b = null; o.traverse(function (q) { if (!b && q.isSkinnedMesh && q.visible) { var hb = headBone(q.parent || q); if (hb) b = hb; } });
    if (b) return { bone: b };
    var all = solidBox(o, T), c = all.getCenter(new T.Vector3()), sz = all.getSize(new T.Vector3()), best = null, top = -Infinity, bx = new T.Box3(), v = new T.Vector3(), w = new T.Vector3();
    o.updateMatrixWorld(true);
    o.traverse(function (m) {
      if (!m.isMesh || !m.visible || !m.geometry) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      bx.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld); bx.getSize(v); bx.getCenter(w);
      var big = Math.max(v.x, v.y, v.z);
      if (big < 0.12 || big > Math.max(0.9, sz.y * 0.45) || Math.hypot(w.x - c.x, w.z - c.z) > Math.min(sz.x, sz.z) * 0.3) return;
      if (bx.max.y > top) { top = bx.max.y; best = m; }
    });
    return best && top > c.y ? { o: best } : null;
  }

  /* where the lens goes: the point it looks at (C) and the height of the frame (span), in the hero's terms */
  function framer(I, H) {
    var T = I.THREE, o = H.o, bone = H.vehicle ? null : headBone(o), size = new T.Vector3(), q = new T.Quaternion();
    o.updateMatrixWorld(true);
    var head = bone ? headBox(o, bone, T) : null, face = new T.Vector3(), drv = H.vehicle ? driverOf(o, T) : null, db = new T.Box3(), dsz = new T.Vector3();
    if (drv && drv.bone) { bone = drv.bone; var host = null; o.traverse(function (q) { if (q.isSkinnedMesh && q.skeleton && q.skeleton.bones.indexOf(bone) >= 0) host = q; }); head = headBox(host || o, bone, T); if (!head) bone = null; drv = head ? null : drv; }
    H.driver = !!(drv || head) && H.vehicle;
    return function (C) {
      o.updateMatrixWorld(true);
      var span;
      if (head) {
        // head and shoulders: the head's middle a third of the way down, his chest at the bottom edge
        var hh = Math.min(head.h, Math.max(0.12, (H.height > 0.3 ? H.height : 1.7) * 0.45));
        C.copy(head.local); bone.localToWorld(C); face.copy(C); C.y -= hh * 0.42; span = hh * 2.9;
      } else if (drv && drv.o) {
        // a machine's driver: his head (or helmet) and what of the cockpit is round it
        db.setFromObject(drv.o); db.getSize(dsz); db.getCenter(C); face.copy(C);
        var dh = Math.max(dsz.x, dsz.y, dsz.z); span = Math.max(dh * 2.6, 0.6);
        C.y -= dh * 0.3;
      } else {
        var box = solidBox(o, T); box.getSize(size);
        var tall = H.height > 0.3 && H.height < size.y * 1.6 ? H.height : size.y;
        if (bone) {
          // a head bone with nothing weighted to it: his height says where his face is
          bone.getWorldPosition(C); span = tall * 0.42;
        } else if (H.vehicle) {
          // a machine: all of it, a little from above
          box.getCenter(C); span = Math.max(size.y * 1.6, Math.max(size.x, size.z) * 0.75);
        } else {
          // a creature or a blob with no head bone: the top of it, down to where its shoulders would be
          // (a round one, all head, is framed nearly whole: its width says how much of it is face; a kart's driver is not)
          span = H.kind === 'kart' ? tall * 0.52 : Math.max(tall * 0.52, Math.min(Math.max(size.x, size.z), tall) * 0.7);
          box.getCenter(C); C.y = box.max.y - span * 0.46;
        }
      }
      return { span: span, quat: o.getWorldQuaternion(q), face: head ? face : drv && drv.o ? face : null, hh: head ? hh : drv && drv.o ? Math.max(dsz.x, dsz.y, dsz.z) : 0 };
    };
  }

  async function take(opts) {
    opts = opts || {};
    var d = rt() && rt().debug; if (!d || !d.internals) return null;
    var I = d.internals(), T = I.THREE, cam = I.camera, scene = I.scene, H = heroOf(I);
    if (!H) return null;
    H0 = H;
    var frame = framer(I, H), C = new T.Vector3(), f0 = frame(C);
    // his front: his skeleton's (the way his chest faces); else an open world's hero's own heading (his group's +z,
    // open.js makeActor); else the lens that is up now (the key art's, which faces him), turned round for one that
    // chases him. Kept in his own terms so it turns as he turns
    var front = skeletonFront(H.o, T);
    if (!front && H.kind === 'open' && H.o.parent && H.o.parent !== scene) { front = H.o.parent.getWorldDirection(new T.Vector3()); front.y = 0; }
    if (!front || front.lengthSq() < 1e-6) {
      front = new T.Vector3().subVectors(cam.position, C); front.y = 0;
      if (front.lengthSq() < 1e-6) front.set(0, 0, 1);
      if (opts.behind) front.negate();
    }
    front.normalize();
    var local = front.clone().applyQuaternion(f0.quat.clone().invert());
    // (zoom: the frame's height times this, for a reshoot: over 1 wider, under 1 closer)
    var angles = opts.angles || [18, -18, 0], fov = 30, rad = Math.PI / 180, zoom = Number(opts.zoom) > 0 ? Number(opts.zoom) : 1, lift = opts.lift == null || !isFinite(+opts.lift) ? null : +opts.lift;
    var state = { angle: angles[0], on: true }, F = new T.Vector3(), P = new T.Vector3(), L = new T.Vector3(), UP = new T.Vector3(0, 1, 0);

    // the key light: soft, from beside and above the lens, a share of the world's own sun
    var sun = 0; scene.traverse(function (q) { if (q.isDirectionalLight && q.visible) sun = Math.max(sun, q.intensity); });
    var key = new T.DirectionalLight(0xfff4e6, (sun || 1.5) * (opts.key == null ? 0.55 : opts.key)), aim = new T.Object3D();
    key.castShadow = false; key.target = aim; scene.add(key); scene.add(aim);

    var near = cam.near, fovWas = cam.fov, prev = scene.onBeforeRender;
    function place(c) {
      var fr = frame(C), dist = (fr.span * zoom / 2) / Math.tan((fov / 2) * rad);
      F.copy(local).applyQuaternion(fr.quat); F.y = 0; if (F.lengthSq() < 1e-6) F.set(0, 0, 1); F.normalize();
      F.applyAxisAngle(UP, state.angle * rad);
      // a touch above his eyes, looking a little down: the flattering height
      // (a driver is seen from a little higher, over the cockpit's edge; opts.lift sets it for a reshoot)
      P.copy(C).addScaledVector(F, dist); P.y += dist * (lift != null ? lift : H.driver ? 0.3 : H.vehicle ? 0.22 : 0.1);
      c.position.copy(P); c.up.set(0, 1, 0); c.lookAt(C);
      c.fov = fov; c.near = Math.min(near, 0.05); c.updateProjectionMatrix(); c.updateMatrixWorld(true);
      // the key light from the lens's left and above
      L.crossVectors(UP, F).normalize();
      key.position.copy(C).addScaledVector(F, 4).addScaledVector(L, 2.5).addScaledVector(UP, 3); aim.position.copy(C);
      key.updateMatrixWorld(true); aim.updateMatrixWorld(true);
    }
    scene.onBeforeRender = function (r, s, c) { if (state.on && c === cam) place(c); if (prev) return prev.apply(this, arguments); };
    // (the camera the runtime renders with is ours for these frames; its own move each frame comes first and is overwritten)
    // an open world's hero stands at ease for it (5 Nov: his fighting guard had his fists at his face): the pose he is
    // drawn in is asked for with the stance 'idle' and no blow for these frames; put back after
    var P0 = I.player, anim = P0 && P0.animate, posed = H.kind === 'open' && !H.vehicle && typeof anim === 'function';
    if (posed) P0.animate = function (t, dt, st) {
      var c = {}; for (var k in (st || {})) c[k] = st[k];
      var b = {}; for (var k2 in (c.brawl || {})) b[k2] = c.brawl[k2];
      b.stance = typeof opts.stance === 'string' ? opts.stance : 'idle'; b.action = null; c.brawl = b; c.speed = 0; c.air = 0; c.airPose = null;
      return anim.call(this, t, dt, c);
    };
    var shots = [], unhide = function () {}, ray = new T.Raycaster(), mine = [];
    H.o.traverse(function (q) { if (q.isMesh) mine.push(q); });
    // how much of his face the lens sees (0 to 1): rays from the lens to five points on the front of his head, each
    // seen if the first thing of his it meets is his head, not a hand or an arm in front of it (1 for a hero without one)
    // his hands at his face (a guard, a boxer's stance, a hand fixing his hair or his glasses): either hand's bone above his
    // chin and nearer the middle of his head than his head is tall (a driver's hands on the wheel are below his chin). Such a frame is never kept
    var hands = []; H.o.traverse(function (q) { if (q.isBone && /hand$|wrist$|hand[._ -]?[lr]$|[._ -]hand[._ -]|^hand/i.test(String(q.name || '').toLowerCase().replace(/^.*:/, '')) && !/finger|thumb|index|middle|ring|pinky/i.test(q.name)) hands.push(q); });
    function handsUp() {
      var fr = frame(new T.Vector3()); if (!fr.face || !hands.length) return false;
      var w = new T.Vector3();
      return hands.some(function (b) { b.getWorldPosition(w); return w.y > fr.face.y - fr.hh * 0.45 && w.distanceTo(fr.face) < fr.hh * 1.1; });
    }
    function faceSeen() {
      var fr = frame(new T.Vector3()); if (!fr.face) return 1;
      var saved = mine.map(function (m) { var b = m.boundingSphere; if (m.isSkinnedMesh) m.boundingSphere = null; return b; }), seen = 0;
      try {
        var to = new T.Vector3(), side = new T.Vector3().crossVectors(UP, F).normalize(), pts = [[0, 0], [-0.28, 0.05], [0.28, 0.05], [0, 0.25], [0, -0.22]];
        for (var k = 0; k < pts.length; k++) {
          to.copy(fr.face).addScaledVector(side, pts[k][0] * fr.hh).addScaledVector(UP, pts[k][1] * fr.hh).addScaledVector(F, 0.3 * fr.hh);
          var dir = to.clone().sub(P), far = dir.length(); ray.set(P, dir.normalize()); ray.far = far + fr.hh;
          var hit = ray.intersectObjects(mine, false)[0];
          if (!hit || hit.distance > far - 0.45 * fr.hh) seen++;
        }
      } catch (e) { seen = pts ? pts.length : 5; }
      mine.forEach(function (m, i) { m.boundingSphere = saved[i]; });
      return seen / 5;
    }
    try {
      unhide = crowd(I, H, C);
      d.cinematic(true);
      await sleep(opts.settle || (posed ? 1500 : 700));
      // a few moments, each from each angle, until one shows his whole face with him clear (an idle that brings a
      // hand to his face, a guard, is waited out)
      for (var round = 0; round < 4; round++) {
        for (var i = 0; i < angles.length; i++) {
          state.angle = angles[i];
          if (i || round) await sleep(220);
          var shot = grab(d, I);
          if (!shot) continue;
          shot.angle = angles[i]; shot.face = faceSeen(); shot.hands = handsUp(); shots.push(shot);
          if (clear(shot)) break;
        }
        if (shots.length && clear(shots[shots.length - 1])) break;
      }
    } finally {
      state.on = false; scene.onBeforeRender = prev || function () {};
      unhide(); if (posed) P0.animate = anim;
      scene.remove(key); scene.remove(aim); key.dispose && key.dispose();
      cam.near = near; cam.fov = fovWas; cam.updateProjectionMatrix();
    }
    // the gate: a frame that shows his face (every ray reaches it, or most for a helmet or a mask) with no hand at it;
    // with none, no portrait at all (the page shows a square of the cover instead), never a face behind fists
    var fair = shots.filter(function (x) { return x.face >= 0.8 && !x.hands; });
    if (!fair.length) return { image: null, refused: shots.some(function (x) { return x.hands; }) ? 'hands at his face' : 'his face not seen', tries: shots.length, kind: H.kind };
    var pick = fair.sort(function (a, b) { return rank(b) - rank(a); })[0];
    return { image: pick.image, look: pick.look, angle: pick.angle, face: pick.face, hands: pick.hands, tries: shots.length, kind: H.kind };
  }

  // the hero seen (not hidden behind something), filling the frame, not burnt out; a Grand Prix's car is not the
  // runtime's player, so it is not measured
  function good(m, H) { return !m || H.kind === 'gp' || m.player == null || ((m.seen == null || m.seen >= 0.8) && m.player >= 0.18 && (m.burnt || 0) <= 0.35); }
  function clear(s) { return s.face >= 1 && !s.hands && good(s.look, H0); }
  function rank(s) { return s.face * 4 + (good(s.look, H0) ? 2 : 0) + score(s.look); }
  var H0 = null;
  function score(m) { return !m ? 0 : (m.seen == null ? 1 : m.seen) * 2 + Math.min(m.player || 0, 0.5) - (m.burnt || 0) * 2; }

  // one frame through the portrait lens, rendered and read in the same moment (debug.look renders it), the middle square
  function grab(d, I) {
    var m = null; try { m = d.look ? d.look() : null; } catch (e) { m = null; }
    try {
      var c = I.renderer.domElement, side = Math.min(c.width, c.height), out = document.createElement('canvas');
      out.width = S; out.height = S;
      out.getContext('2d').drawImage(c, (c.width - side) / 2, (c.height - side) / 2, side, side, 0, 0, S, S);
      return { image: out.toDataURL('image/jpeg', 0.86), look: m };
    } catch (e) { return null; }
  }

  window.GameMogPortrait = { take: take };
})();
