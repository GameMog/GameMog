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
 *   GameMogPortrait.take({ behind, zoom, key, lift, stance, settle, backdrop, once }) -> Promise<{ image: dataURL | null, g, refused, kind } | null>
 *
 * 5 Nov, the owner's headshot standard ("looking straight into camera like a headshot or instagram photo"): the lens
 * straight in front of his face at the height of his eyes, his face centred, eyes 40% down, head half the height
 * (framer, measure, LIMITS below).
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
    // and anything small standing at his face that is not him (a prop, a pickup, a foe that is not a person): a thing
    // under 3 m across whose middle is within 2.5 m of his face
    var bx = new I.THREE.Box3(), sz = new I.THREE.Vector3(), mid = new I.THREE.Vector3();
    I.scene.children.forEach(function (top) {
      if (!top.visible || mine.has(top) || top.isLight || top.isCamera) return;
      var holds = false; top.traverse(function (q) { if (q === H.o) holds = true; }); if (holds) return;
      bx.setFromObject(top); if (bx.isEmpty()) return; bx.getSize(sz); bx.getCenter(mid);
      if (Math.max(sz.x, sz.y, sz.z) > 3 || mid.distanceTo(C) > 2.5) return;
      top.visible = false; hidden.push(top);
    });
    return function () { hidden.forEach(function (q) { q.visible = true; }); };
  }

  /*
   * The backdrop (6 Nov, the owner: "main character headshot against a light blue background, not car"): while the
   * portrait is shot, everything but the hero is out of the picture (the world, its sky, the other racers:
   * each sibling of him and of every group that holds him, so his kart stays under him), lights kept. Each frame is
   * then drawn twice: as the world draws it (its own grade, bloom and tone), and once more as a matte (him in white on
   * black, glow and trails left out), and he is laid on the sky blue below through that matte. The same blue as
   * lib/portrait-sky.ts SKY (the homepage's fallback card and Classic's bubble).
   */
  var SKY = { top: '#DCEFFC', bottom: '#A6D3F2' };
  function backdrop(I, H) {
    var T = I.THREE, scene = I.scene, hidden = [], keep = new Set();
    for (var p = H.o; p; p = p.parent) keep.add(p);
    keep.forEach(function (a) {
      if (a === H.o) return;
      (a.children || []).forEach(function (c) {
        if (keep.has(c) || !c.visible || c.isLight || c.isCamera) return;
        // (a light hung in a group stays lit: the group's meshes go, its lights stay)
        var lights = []; c.traverse(function (q) { if (q.isLight) lights.push(q); });
        if (lights.length) { c.traverse(function (q) { if ((q.isMesh || q.isPoints || q.isLine || q.isSprite) && q.visible) { q.visible = false; hidden.push(q); } }); return; }
        c.visible = false; hidden.push(c);
      });
    });
    // (the world's fog stays: a world's own code may read it every frame, and at a headshot's distance it barely shows)
    var bg = scene.background;
    scene.background = new T.Color(SKY.bottom).lerp(new T.Color(SKY.top), 0.5);
    return function () { hidden.forEach(function (q) { q.visible = true; }); scene.background = bg; };
  }
  // the matte: the hero alone, solid white on black, straight through the renderer (no grade, no bloom), read into a
  // canvas the size of the drawing buffer. Null where it cannot be drawn (then the frame keeps its plain blue)
  function matte(I, H) {
    var T = I.THREE, r = I.renderer, scene = I.scene, cam = I.camera, fx = [], masks = [], camMask = cam.layers.mask;
    // (only his own parts are drawn into it, on a layer of their own: a world that shows its effects again every frame
    // (speed lines, sparks) cannot put them in his matte)
    H.o.traverse(function (m) {
      masks.push([m, m.layers.mask]); m.layers.enable(MATTE_LAYER);
      if (!m.isMesh && !m.isPoints && !m.isLine && !m.isSprite) return;
      var mt = Array.isArray(m.material) ? m.material[0] : m.material;
      if (m.visible && (m.isPoints || m.isLine || m.isSprite || (mt && (mt.blending === T.AdditiveBlending || (mt.transparent && mt.opacity < 0.35))))) { m.visible = false; fx.push(m); }
    });
    cam.layers.set(MATTE_LAYER);
    var white = MATTE || (MATTE = new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false }));
    var bg = scene.background, over = scene.overrideMaterial, rt = r.getRenderTarget(), tm = r.toneMapping, c = r.domElement;
    try {
      scene.background = new T.Color(0x000000); scene.overrideMaterial = white; r.setRenderTarget(null); r.toneMapping = T.NoToneMapping;
      r.render(scene, cam);
      var out = document.createElement('canvas'); out.width = c.width; out.height = c.height;
      out.getContext('2d').drawImage(c, 0, 0);
      return out;
    } catch (e) { return null; }
    finally { scene.background = bg; scene.overrideMaterial = over; r.setRenderTarget(rt); r.toneMapping = tm; fx.forEach(function (m) { m.visible = true; }); cam.layers.mask = camMask; masks.forEach(function (x) { x[0].layers.mask = x[1]; }); }
  }
  var MATTE = null, MATTE_LAYER = 30;
  // the sky blue square, top to bottom
  function skyFill(g, Z) {
    var gr = g.createLinearGradient(0, 0, 0, Z); gr.addColorStop(0, SKY.top); gr.addColorStop(1, SKY.bottom);
    g.fillStyle = gr; g.fillRect(0, 0, Z, Z);
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

  // which way his face points, in the head bone's own terms: the way the chest faced when the model was bound (its
  // skeleton's bind pose, every rig's rest), taken into the head bone's frame then. Turned by the bone's pose now, it is
  // where his face looks, nodding and turning with it. Null without a bound skeleton
  function headAxis(o, bone, T) {
    var m = null; o.traverse(function (q) { if (!m && q.isSkinnedMesh && q.skeleton && q.skeleton.bones.indexOf(bone) >= 0) m = q; });
    if (!m) return null;
    var sk = m.skeleton, bind = function (b) { var i = sk.bones.indexOf(b); return i < 0 ? null : new T.Matrix4().copy(sk.boneInverses[i]).invert(); };
    var found = {};
    sk.bones.forEach(function (q) {
      var n = String(q.name || '').toLowerCase(), side = sideOf(n); if (!side) return;
      for (var i = 0; i < SIDE_PARTS.length; i++) {
        var pp = SIDE_PARTS[i]; if (n.indexOf(pp) < 0 || (pp === 'arm' && /fore|lower/.test(n)) || (pp === 'leg' && /lower|up/.test(n))) continue;
        var f = found[pp] || (found[pp] = {}); if (!f[side]) f[side] = q; break;
      }
    });
    var front = null;
    for (var j = 0; j < SIDE_PARTS.length && !front; j++) {
      var pr = found[SIDE_PARTS[j]]; if (!pr || !pr.L || !pr.R) continue;
      var l = new T.Vector3().setFromMatrixPosition(bind(pr.L)), r = new T.Vector3().setFromMatrixPosition(bind(pr.R));
      var up = new T.Vector3().setFromMatrixPosition(bind(bone)).sub(l.clone().add(r).multiplyScalar(0.5)).normalize();
      var f2 = new T.Vector3().crossVectors(l.sub(r), up);
      if (f2.lengthSq() > 1e-8) front = f2.normalize();
    }
    if (!front) return null;
    var hb = bind(bone), q0 = new T.Quaternion(); hb.decompose(new T.Vector3(), q0, new T.Vector3());
    return front.applyQuaternion(q0.invert()).normalize();
  }

  // the eyes' bones under his head (a rig's eye.L/eye.R, LeftEye), for the point the lens aims at
  function eyeBones(bone) {
    var e = []; bone.traverse(function (q) { if (q !== bone && q.isBone && /eye/i.test(q.name || '') && !/brow|lid|lash/i.test(q.name || '')) e.push(q); });
    return e.slice(0, 2);
  }

  /*
   * The headshot (5 Nov, the owner: "looking straight into camera like a headshot or instagram photo"): each frame, the
   * point between his eyes (E), his head's height (hh), and the way his face points (fwd, or null where it cannot be
   * read). The frame is built round them: his eyes 40% from the top, his head half of it.
   */
  function framer(I, H, dy, hz) {
    var T = I.THREE, o = H.o, bone = H.vehicle ? null : headBone(o), size = new T.Vector3(), q = new T.Quaternion();
    o.updateMatrixWorld(true);
    var head = bone ? headBox(o, bone, T) : null, drv = H.vehicle ? driverOf(o, T) : null, db = new T.Box3(), dsz = new T.Vector3();
    if (drv && drv.bone) { bone = drv.bone; var host = null; o.traverse(function (q2) { if (q2.isSkinnedMesh && q2.skeleton && q2.skeleton.bones.indexOf(bone) >= 0) host = q2; }); head = headBox(host || o, bone, T); if (!head) bone = null; drv = head ? null : drv; }
    // (a ride the runtime does not call a vehicle (a kart a track world draws as its player, no skeleton): wider than it
    // is tall, its rider's head is framed as a vehicle's driver is, not the whole machine)
    if (!H.vehicle && !bone && !drv) { var rb = solidBox(o, T), rs = rb.getSize(new T.Vector3()); if (Math.max(rs.x, rs.z) > 1.25 * rs.y) { drv = driverOf(o, T); if (drv && drv.bone) { bone = drv.bone; var host2 = null; o.traverse(function (q3) { if (q3.isSkinnedMesh && q3.skeleton && q3.skeleton.bones.indexOf(bone) >= 0) host2 = q3; }); head = headBox(host2 || o, bone, T); if (!head) bone = null; drv = head ? null : drv; } } }
    H.driver = !!(drv || head) && H.vehicle;
    var axis = head ? headAxis(o, bone, T) : null, eyes = head ? eyeBones(bone) : [], e1 = new T.Vector3(), bq = new T.Quaternion();
    var out = { E: new T.Vector3(), hh: 0, fwd: null, quat: q, rays: !!head || !!(drv && drv.o) };
    return function () {
      o.updateMatrixWorld(true);
      var E = out.E; out.fwd = null; out.box = null;
      if (head) {
        out.hh = Math.min(head.h, Math.max(0.12, (H.height > 0.3 ? H.height : 1.7) * 0.45));
        if (eyes.length === 2) { eyes[0].getWorldPosition(E); eyes[1].getWorldPosition(e1); E.add(e1).multiplyScalar(0.5); }
        else { E.copy(head.local); bone.localToWorld(E); E.y -= out.hh * 0.02; }
        if (axis) out.fwd = axis.clone().applyQuaternion(bone.getWorldQuaternion(bq)).normalize();
      } else if (drv && drv.o) {
        // a machine's driver: his head or his helmet
        db.setFromObject(drv.o); db.getSize(dsz); db.getCenter(E); out.hh = Math.max(dsz.x, dsz.y, dsz.z, 0.15);
      } else {
        var box = solidBox(o, T); box.getSize(size);
        var tall = H.height > 0.3 && H.height < size.y * 1.6 ? H.height : size.y;
        if (bone) { bone.getWorldPosition(E); out.hh = tall * 0.13; E.y += out.hh * 0.4; }
        else if (H.vehicle) { box.getCenter(E); out.hh = Math.max(size.y, 0.4) * 0.9; out.box = box; }
        else {
          // a creature or a blob with no head bone: the top of it is its head. A kart's driver sits on top of his kart; a
          // body taller than it is deep has a head about a quarter of its height; a round one is nearly all head
          if (H.kind === 'kart') out.hh = tall * 0.26;
          else if (size.y > 1.3 * Math.min(size.x, size.z)) out.hh = size.y * 0.28;
          else out.hh = size.y * 0.7;
          box.getCenter(E); E.y = box.max.y - out.hh * 0.5; out.box = box;
        }
      }
      // (opts.dy, a reshoot's nudge: the eyes' point moved up by this share of the head's height)
      // (opts.zoom, a reshoot's correction of his head's size where it is estimated, for a creature with no head bone)
      if (hz !== 1) out.hh *= hz;
      if (dy) E.y += dy * out.hh;
      o.getWorldQuaternion(q);
      return out;
    };
  }

  // the composition the gate holds every portrait to (the owner's reference: a profile picture): the face centred
  // left to right within 3%, the eyes 38 to 42% from the top, the head 45 to 55% of the height, the face within 20
  // degrees of the lens (where the face's direction can be read)
  var LIMITS = { offset: 0.03, eyeLo: 0.38, eyeHi: 0.42, headLo: 0.45, headHi: 0.55, frontal: 20 };
  var CROP = 0.8, EYE_AT = 0.4, HEAD = 0.5;

  async function takeOnce(opts) {
    opts = opts || {};
    var d = rt() && rt().debug; if (!d || !d.internals) return null;
    var I = d.internals(), T = I.THREE, cam = I.camera, scene = I.scene, H = heroOf(I);
    if (!H) return null;
    H0 = H;
    var frame = framer(I, H, +opts.dy || 0, Number(opts.zoom) > 0 ? Number(opts.zoom) : 1), f0 = frame();
    // his front when his face's own direction cannot be read: his chest's (his skeleton); else an open world's hero's
    // heading (his group's +z, open.js makeActor); else the lens that is up now (the key art's, which faces him),
    // turned round for one that chases him. Kept in his own terms so it turns as he turns
    var front = skeletonFront(H.o, T);
    if (!front && H.kind === 'open' && H.o.parent && H.o.parent !== scene) { front = H.o.parent.getWorldDirection(new T.Vector3()); front.y = 0; }
    if (!front || front.lengthSq() < 1e-6) {
      front = new T.Vector3().subVectors(cam.position, f0.E); front.y = 0;
      if (front.lengthSq() < 1e-6) front.set(0, 0, 1);
      if (opts.behind) front.negate();
    }
    front.normalize();
    var local = front.clone().applyQuaternion(f0.quat.clone().invert());
    // a lens of about 32 degrees, straight in front of his face at the height of his eyes (opts.zoom: see framer)
    var fov = 32, rad = Math.PI / 180, lift = opts.lift == null || !isFinite(+opts.lift) ? 0 : +opts.lift, yaw = +opts.yaw || 0;
    var state = { on: true }, F = new T.Vector3(), P = new T.Vector3(), L = new T.Vector3(), UP = new T.Vector3(0, 1, 0), last = null;

    // the key light: soft, from just above and beside the lens, a share of the world's own sun
    var sun = 0; scene.traverse(function (q) { if (q.isDirectionalLight && q.visible) sun = Math.max(sun, q.intensity); });
    var key = new T.DirectionalLight(0xfff4e6, (sun || 1.5) * (opts.key == null ? 0.5 : opts.key)), aim = new T.Object3D();
    key.castShadow = false; key.target = aim; scene.add(key); scene.add(aim);

    var near = cam.near, fovWas = cam.fov, prev = scene.onBeforeRender, fixedF = null;
    function place(c) {
      var fr = frame();
      // the face's own direction, level; else his front
      if (fr.fwd && Math.hypot(fr.fwd.x, fr.fwd.z) > 0.35) F.set(fr.fwd.x, 0, fr.fwd.z).normalize();
      else if (fixedF) F.copy(fixedF);
      else { F.copy(local).applyQuaternion(fr.quat); F.y = 0; if (F.lengthSq() < 1e-6) F.set(0, 0, 1); F.normalize(); }
      // (opts.fixed, a reshoot's: the lens keeps the world direction it started with, whichever way he turns)
      if (opts.fixed && !fixedF) fixedF = F.clone();
      // the canvas's height takes the head at HEAD of the cropped square (CROP of the height)
      if (yaw) F.applyAxisAngle(UP, yaw * rad);
      var V = fr.hh / (HEAD * CROP), dist = (V / 2) / Math.tan((fov / 2) * rad);
      // (his eyes' height; a face tipped up or down a little is met by the lens tipped with it, so he looks into it)
      var tip = fr.fwd ? Math.max(-0.35, Math.min(0.35, fr.fwd.y)) : 0;
      P.copy(fr.E).addScaledVector(F, dist); P.y += dist * (lift + tip);
      // (never inside him: a lens that would stand inside his body, his kart or his cloud steps back out along his front)
      if (fr.box) { var bx = fr.box.clone().expandByScalar(0.15); for (var n = 0; n < 80 && bx.containsPoint(P); n++) P.addScaledVector(F, 0.1); }
      c.position.copy(P); c.up.set(0, 1, 0); c.lookAt(fr.E.x, fr.E.y + dist * lift * 0, fr.E.z);
      // (stepped back, the lens narrows to keep his head the same size)
      c.fov = Math.min(fov, 2 * Math.atan((V / 2) / Math.max(dist, P.distanceTo(fr.E))) / rad); c.near = Math.min(near, 0.03); c.updateProjectionMatrix(); c.updateMatrixWorld(true);
      L.crossVectors(UP, F).normalize();
      key.position.copy(fr.E).addScaledVector(F, 4).addScaledVector(L, 1.2).addScaledVector(UP, 1.6); aim.position.copy(fr.E);
      key.updateMatrixWorld(true); aim.updateMatrixWorld(true);
      last = { E: fr.E.clone(), hh: fr.hh, fwd: fr.fwd ? fr.fwd.clone() : null, P: P.clone(), rays: fr.rays };
    }
    scene.onBeforeRender = function (r, s, c) { if (state.on && c === cam) place(c); if (prev) return prev.apply(this, arguments); };
    // an open world's hero stands at ease for it (5 Nov: his fighting guard had his fists at his face): drawn in the
    // stance 'idle' and no blow for these frames; put back after
    var P0 = I.player, anim = P0 && P0.animate, posed = H.kind === 'open' && !H.vehicle && typeof anim === 'function';
    if (posed) P0.animate = function (t, dt, st) {
      var c = {}; for (var k in (st || {})) c[k] = st[k];
      var b = {}; for (var k2 in (c.brawl || {})) b[k2] = c.brawl[k2];
      b.stance = typeof opts.stance === 'string' ? opts.stance : 'idle'; b.action = null; c.brawl = b; c.speed = 0; c.air = 0; c.airPose = null;
      return anim.call(this, t, dt, c);
    };
    var shots = [], unhide = function () {}, unsky = null, ray = new T.Raycaster(), mine = [];
    // (what of him can hide his face: solid parts only, never a glass helmet, a visor or a windscreen)
    H.o.traverse(function (q) {
      if (!q.isMesh) return; var mt = Array.isArray(q.material) ? q.material[0] : q.material;
      if (mt && (mt.transparent && (mt.opacity < 0.85 || mt.depthWrite === false) || mt.transmission > 0.2)) return;
      mine.push(q);
    });
    // his hands at his face (a guard, a hand fixing his hair or his glasses): either hand's bone above his chin and within
    // a head's height of his eyes (a driver's hands on the wheel are below his chin)
    var hands = []; H.o.traverse(function (q) { if (q.isBone && /hand$|wrist$|hand[._ -]?[lr]$|[._ -]hand[._ -]|^hand/i.test(String(q.name || '').toLowerCase().replace(/^.*:/, '')) && !/finger|thumb|index|middle|ring|pinky/i.test(q.name)) hands.push(q); });
    function handsUp(m) {
      if (!hands.length) return false;
      var w = new T.Vector3();
      return hands.some(function (b) { b.getWorldPosition(w); return w.y > m.E.y - m.hh * 0.55 && w.distanceTo(m.E) < m.hh * 1.1; });
    }
    // how much of his face the lens sees: rays from the lens to five points on it, each seen if the first thing of his it
    // meets is his head, not a hand, an arm or a cockpit in front of it
    function faceSeen(m) {
      // (a creature with no head bone is all face where it is framed: nothing of it stands before its face)
      if (!m.rays) return 1;
      var saved = mine.map(function (x) { var b = x.boundingSphere; if (x.isSkinnedMesh) x.boundingSphere = null; return b; }), seen = 0, pts = [[0, 0], [-0.28, 0.02], [0.28, 0.02], [0, 0.22], [0, -0.3]];
      try {
        var to = new T.Vector3(), side = new T.Vector3().crossVectors(UP, F).normalize();
        for (var k = 0; k < pts.length; k++) {
          to.copy(m.E).addScaledVector(side, pts[k][0] * m.hh).addScaledVector(UP, pts[k][1] * m.hh).addScaledVector(F, 0.3 * m.hh);
          var dir = to.clone().sub(m.P), far = dir.length(); ray.set(m.P, dir.normalize()); ray.far = far + m.hh;
          var hit = ray.intersectObjects(mine, false)[0];
          if (!hit || hit.distance > far - 0.45 * m.hh) seen++;
        }
      } catch (e) { seen = pts.length; }
      mine.forEach(function (x, i) { x.boundingSphere = saved[i]; });
      return seen / pts.length;
    }
    // the frame measured as the circle will show it: where his eyes fall in the square, how tall his head is in it, and
    // how far his face turns from the lens
    function measure(m, c) {
      var cv = I.renderer.domElement, Wc = cv.width, Hc = cv.height, s = Hc * CROP, x0 = (Wc - s) / 2, y0 = Hc / 2 - EYE_AT * s;
      var px = function (v) { var p = v.clone().project(c); return [(p.x + 1) / 2 * Wc, (1 - p.y) / 2 * Hc]; };
      var e = px(m.E), top = px(m.E.clone().addScaledVector(UP, m.hh / 2)), bot = px(m.E.clone().addScaledVector(UP, -m.hh / 2));
      var to = m.P.clone().sub(m.E).normalize();
      return { offset: +((e[0] - x0) / s - 0.5).toFixed(3), eye: +((e[1] - y0) / s).toFixed(3), head: +((bot[1] - top[1]) / s).toFixed(3),
        frontal: m.fwd ? Math.round(Math.acos(Math.max(-1, Math.min(1, m.fwd.dot(to)))) / rad) : null };
    }
    function framed(g) { return !!g && Math.abs(g.offset) <= LIMITS.offset && g.eye >= LIMITS.eyeLo && g.eye <= LIMITS.eyeHi && g.head >= LIMITS.headLo && g.head <= LIMITS.headHi && (g.frontal == null || g.frontal <= LIMITS.frontal); }
    try {
      unhide = crowd(I, H, f0.E);
      // (opts.backdrop false: the world kept behind him, as the 5 Nov portraits were)
      if (opts.backdrop !== false) unsky = backdrop(I, H);
      d.cinematic(true);
      await sleep(opts.settle || (posed ? 1500 : 700));
      // up to eight moments, until one shows his whole face, straight on, composed, with no hand at it (an idle that
      // brings a hand to his face, a head turned away, is waited out)
      for (var round = 0; round < 8; round++) {
        if (round) await sleep(240);
        var shot = grab(d, I, Math.min(2048, Math.max(256, +opts.out || S)), unsky ? H : null);
        if (!shot || !last) continue;
        shot.face = faceSeen(last); shot.hands = handsUp(last); shot.g = measure(last, cam); shots.push(shot);
        if (clear(shot)) break;
      }
    } finally {
      state.on = false; scene.onBeforeRender = prev || function () {};
      if (unsky) unsky(); unhide(); if (posed) P0.animate = anim;
      scene.remove(key); scene.remove(aim); key.dispose && key.dispose();
      cam.near = near; cam.fov = fovWas; cam.updateProjectionMatrix();
    }
    // the gate: his face seen (every ray, or four of five for a helmet or a mask), no hand at it, and the composition in
    // its limits; with none, no portrait at all (the page shows a square of the cover instead)
    var fair = shots.filter(function (x) { return x.face >= 0.8 && !x.hands && framed(x.g); });
    // (opts.any, a hand-reviewed reshoot's: the best of the moments even where the gate would refuse it)
    if (!fair.length && opts.any && shots.length) fair = shots.slice();
    if (!fair.length) {
      var why = !shots.length ? 'nothing drawn' : shots.every(function (x) { return x.hands; }) ? 'hands at his face' : shots.every(function (x) { return !framed(x.g); }) ? 'not straight on or not composed' : 'his face not seen';
      return { image: null, refused: why, g: shots.length ? shots[shots.length - 1].g : null, tries: shots.length, kind: H.kind };
    }
    var pick = fair.sort(function (a, b) { return rank(b) - rank(a); })[0];
    return { image: pick.image, look: pick.look, g: pick.g, face: pick.face, tries: shots.length, kind: H.kind, at: last ? { E: last.E.toArray().map(function (v) { return +v.toFixed(2); }), P: last.P.toArray().map(function (v) { return +v.toFixed(2); }), hh: +last.hh.toFixed(2) } : null };
  }

  // the hero seen (not hidden behind something), not burnt out; a Grand Prix's car is not the runtime's player, so it
  // is not measured
  function good(m, H) { return !m || H.kind === 'gp' || m.player == null || ((m.seen == null || m.seen >= 0.8) && (m.burnt || 0) <= 0.35); }
  function clear(s) { return s.face >= 1 && !s.hands && good(s.look, H0) && !!s.g && Math.abs(s.g.offset) <= 0.03 && s.g.eye >= 0.38 && s.g.eye <= 0.42 && s.g.head >= 0.45 && s.g.head <= 0.55 && (s.g.frontal == null || s.g.frontal <= 12); }
  function rank(s) { return s.face * 4 + (good(s.look, H0) ? 2 : 0) + score(s.look) - (s.g && s.g.frontal ? s.g.frontal / 20 : 0); }
  var H0 = null;
  function score(m) { return !m ? 0 : (m.seen == null ? 1 : m.seen) * 2 - (m.burnt || 0) * 2; }

  // one frame through the portrait lens, rendered and read in the same moment (debug.look renders it): the square of
  // CROP of the height, his eyes EYE_AT down it, centred on him
  // (opts.out: a larger square for a hand-finished portrait; every build's is 512 px)
  // (sky: the hero, when the world is out of the picture: he is laid on the sky blue through his matte)
  function grab(d, I, Z, sky) {
    var m = null; try { m = d.look ? d.look() : null; } catch (e) { m = null; }
    try {
      var c = I.renderer.domElement, s = c.height * CROP, sx = (c.width - s) / 2, sy = c.height / 2 - EYE_AT * s, out = document.createElement('canvas');
      out.width = Z; out.height = Z;
      var g = out.getContext('2d');
      if (!sky) { g.drawImage(c, sx, sy, s, s, 0, 0, Z, Z); return { image: out.toDataURL('image/jpeg', 0.86), look: m }; }
      // the frame as the world draws it, then its matte (drawn after, so read first)
      var him = document.createElement('canvas'); him.width = Z; him.height = Z;
      var hg = him.getContext('2d', { willReadFrequently: true }); hg.drawImage(c, sx, sy, s, s, 0, 0, Z, Z);
      var mt = matte(I, sky);
      skyFill(g, Z);
      if (mt) {
        var mc = document.createElement('canvas'); mc.width = Z; mc.height = Z;
        var mg = mc.getContext('2d', { willReadFrequently: true });
        // (a hair soft at the edge: the matte is drawn without the frame's antialiasing)
        mg.filter = 'blur(' + (Z / 640).toFixed(2) + 'px)'; mg.drawImage(mt, sx, sy, s, s, 0, 0, Z, Z); mg.filter = 'none';
        var hd = hg.getImageData(0, 0, Z, Z), md = mg.getImageData(0, 0, Z, Z).data, px = hd.data;
        for (var i = 0; i < px.length; i += 4) px[i + 3] = Math.max(md[i], md[i + 1], md[i + 2]);
        hg.putImageData(hd, 0, 0);
        g.drawImage(him, 0, 0);
      } else g.drawImage(him, 0, 0);
      return { image: out.toDataURL('image/jpeg', 0.86), look: m };
    } catch (e) { return null; }
  }

  /*
   * Every game carries a headshot (6 Nov, the owner: "every game should include media with a headshot so it can be
   * featured"). The first try is the gate's (straight on, composed, the whole face seen); refused, the lens tries again
   * wider (his head smaller in the frame, so a hand, a cockpit or a helmet's rim hides less of it) and turned a little
   * either way, then wider still, keeping the best moment of that last try even where the gate would refuse it. Never
   * the car or the cover: always him, on the sky. Null only when nothing of him could be drawn at all.
   * (opts.once: only the first try, as the 5 Nov headshots were shot)
   */
  var LADDER = [{ zoom: 1.5 }, { yaw: 30 }, { yaw: -30 }, { zoom: 1.9, any: true }];
  async function take(opts) {
    opts = opts || {};
    var r = await takeOnce(opts), tries = [r && r.refused || null];
    if (opts.once || opts.any || !r || r.image) return r;
    for (var i = 0; i < LADDER.length; i++) {
      var o = {}; for (var k in opts) o[k] = opts[k];
      for (var k2 in LADDER[i]) o[k2] = k2 === 'zoom' ? (Number(opts.zoom) > 0 ? Number(opts.zoom) : 1) * LADDER[i][k2] : LADDER[i][k2];
      o.settle = 300;
      var n = await takeOnce(o);
      if (!n) break;
      tries.push(n.refused || null);
      if (n.image) { n.retried = i + 1; n.refusedFirst = tries[0]; return n; }
    }
    r.ladder = tries;
    return r;
  }
  window.GameMogPortrait = { take: take };
})();
