    /* ============================================ penalty shootout: the people (lane Ma, SHOOTOUT M1, 11 Oct) == */
    // The people kit (shootPeople.PK) every body on the pitch is posed with, and the taker and the referee built on it.
    // shootout.js pastes this file into boot(), so it reads the runtime's THREE, scene, ASSETS, ctx, envify and
    // liveMaterials where they are; a caller without them (the scratch lab world on the plain runtime) passes them in.
    // One top-level binding (shootPeople), nothing else, so nothing of the runtime's own is shadowed.
    //
    // The render is a pure function of state: no mixer runs here. Each clip is read through its own interpolants at the
    // time asked for and blended by the weights asked for (rig.pose), so a replay drawn from recorded clip times draws
    // the same body, and a hit-stop holds a real 60 fps key.
    var shootPeople = (function () {
      'use strict';
      var PI = Math.PI, UPV = new THREE.Vector3(0, 1, 0);
      function clampN(v, a, b) { return v < a ? a : v > b ? b : v; }
      function sstep(a, b, x) { if (b === a) return x >= b ? 1 : 0; var u = clampN((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); }
      function wrapA(a) { while (a > PI) a -= 2 * PI; while (a < -PI) a += 2 * PI; return a; }
      function V(x, y, z) { return new THREE.Vector3(x || 0, y || 0, z || 0); }
      function Q() { return new THREE.Quaternion(); }

      // what the runtime has in scope, unless the caller hands it over
      function host(o) {
        o = o || {};
        return {
          scene: o.scene || (typeof scene !== 'undefined' ? scene : null),
          assets: o.assets || (typeof ASSETS !== 'undefined' ? ASSETS : null),
          envify: o.envify || (typeof envify === 'function' ? envify : null),
          live: o.liveMaterials || (typeof liveMaterials === 'function' && typeof LIVE !== 'undefined' && LIVE ? liveMaterials : null),
          human: o.human || (typeof ctx !== 'undefined' && ctx && ctx.assets ? ctx.assets.human : null),
        };
      }

      /* ------------------------------------------------------------------------------------------- the rig -- */
      var FINGER = /^finger/, CLAV = /^clavicle_/, LOWER = /^(root|pelvis|upperleg|lowerleg|foot|toe)/;
      // the library body this entity is, for its clips' meta (ASSETS[id].json.clips.list) and its skeleton
      function findBody(assets, names) {
        if (!assets) return null;
        for (var id in assets) {
          var j = assets[id] && assets[id].json; if (!j || j.kind !== 'human') continue;
          var have = {}; j.clips.list.forEach(function (c) { have[c.name] = 1; });
          if (names.every(function (n) { return have[n]; })) return id;
        }
        return null;
      }
      // the limbs as built (critique #1): measured off the skeleton at rest, in metres for this body's height
      function dimsOf(sk, s) {
        var H = {}; sk.forEach(function (b) { H[b.name.replace(/\./g, '_')] = b.head; });
        function d(a, b) { var p = H[a], q = H[b]; return p && q ? Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * s : 0; }
        function up(a) { return H[a] ? (H[a][1] - H.root[1]) * s : 0; }
        return {
          upperarm: d('upperarm01_L', 'lowerarm01_L'), forearm: d('lowerarm01_L', 'wrist_L'), wristToKnuckle: d('wrist_L', 'finger3-1_L'),
          shoulderUp: up('upperarm01_L'), shoulderAcross: Math.abs(H.upperarm01_L[0]) * s, shoulderFwd: (H.upperarm01_L[2] - H.root[2]) * s,
          rootToNeck: up('neck01'), rootToHead: up('head'), rootY: H.root[1] * s,
          thigh: d('upperleg01_L', 'lowerleg01_L'), shin: d('lowerleg01_L', 'foot_L'), hipY: H.upperleg01_L[1] * s, hipAcross: Math.abs(H.upperleg01_L[0]) * s,
          ankleY: H.foot_L[1] * s,
        };
      }
      function rig(ent, o) {
        o = o || {};
        var model = ent && (ent.model || ent.object); if (!model) return null;
        var list = [], B = {};
        model.traverse(function (b) { if (b.isBone && !B[b.name]) { B[b.name] = b; list.push(b); } });
        if (!B.root || !B.foot_L || !B.foot_R || !B.wrist_L) return null;
        var H = host(o), clipList = ent.clips ? ent.clips() : [];
        var body = o.body || findBody(H.assets, clipList.map(function (c) { return c.name; }));
        var J = body && H.assets && H.assets[body] ? H.assets[body].json : null;
        var metaBy = {}; if (J) J.clips.list.forEach(function (c) { metaBy[c.name] = c; });
        if (o.meta) for (var mk in o.meta) metaBy[mk] = Object.assign({}, metaBy[mk] || {}, o.meta[mk]);
        var idx = {}; list.forEach(function (b, i) { idx[b.name] = i; });
        model.updateWorldMatrix(true, false);
        var s = model.scale.x, height = (J ? J.height : 1.869) * s;
        var R = {
          ent: ent, model: model, carrier: ent.object || model, frame: ent.object || model, body: body, json: J,
          bones: B, list: list, idx: idx, n: list.length, root: B.root, scale: s, height: height, k: height / 1.869,
          rootRest: J ? new THREE.Vector3().fromArray(J.skeleton[0].head) : B.root.position.clone(),
          C: {}, meta: metaBy, layers: {}, mixer: null,
          // the clips as the human hands them over (an array, like ent.clips()): a rig can stand in for the entity
          clips: function () { return clipList; },
        };
        R.dims = J ? dimsOf(J.skeleton, s) : null;
        // the toes and the face at rest, in their own bones' frames: every rest rotation is the identity in this rig,
        // so the model's frame is each bone's own at rest
        R.toe = {}; ['L', 'R'].forEach(function (sd) {
          var fb = J && J.skeleton.filter(function (b) { return b.name === 'foot.' + sd; })[0];
          R.toe[sd] = fb ? V(fb.tail[0] - fb.head[0], fb.tail[1] - fb.head[1], fb.tail[2] - fb.head[2]).normalize() : V(sd === 'L' ? 0.03 : -0.03, -0.45, 0.89).normalize();
        });
        R.toeRestPitch = Math.asin(R.toe.R.y);
        // the sole's heel, ball and toe in the foot's own frame (lane A's kick.ts: the rest pose's sole is flat on the floor)
        var fbL = J && J.skeleton.filter(function (b) { return b.name === 'foot.L'; })[0], ankH = fbL ? fbL.head[1] : 0.0762, kfS = ankH / 0.0762;
        R.sole = [V(0, -ankH, -0.05 * kfS), V(0, -ankH + 0.012 * kfS, 0.10 * kfS), V(0, -ankH + 0.008 * kfS, 0.18 * kfS)];
        // the strike point in the foot's own frame, as lane A's kickMeta measures it (scripts/assets/kick.ts): 1.2 foot
        // lengths along the foot bone (60% ankle to ball of foot) and half a foot's width to the inside
        R.strike = {}; ['L', 'R'].forEach(function (sd) {
          var fb = J && J.skeleton.filter(function (b) { return b.name === 'foot.' + sd; })[0], kf = fb ? fb.head[1] / 0.0762 : 1;
          var d = fb ? [fb.tail[0] - fb.head[0], fb.tail[1] - fb.head[1], fb.tail[2] - fb.head[2]] : [0, -0.034, 0.067];
          R.strike[sd] = V(1.2 * d[0] + 0.035 * kf * (sd === 'L' ? -1 : 1), 1.2 * d[1], 1.2 * d[2]);
        });
        R.face = V(0, 0, 1);
        // the clips, each read through interpolants of its own (one per track: they keep the last key found), made the
        // first time the clip is played (a body has 80-odd clips and plays a handful)
        clipList.forEach(function (clip) { var m = metaBy[clip.name] || {}; R.C[clip.name] = { clip: clip, meta: m, dur: clip.duration, loop: !!m.loop, q: null, p: null, fps: m.fps || 30 }; });
        R.acc = new Float32Array(R.n * 4); R.accW = new Float32Array(R.n); R.cur = new Float32Array(R.n * 4 + 3);
        R.isFinger = list.map(function (b) { return FINGER.test(b.name); });
        R.isUpper = list.map(function (b) { return !LOWER.test(b.name); });
        R.clav = list.map(function (b, i) { return CLAV.test(b.name) ? i : -1; }).filter(function (i) { return i >= 0; });
        // the hands' relaxed curl (critique #9): the idle's first frame, re-applied whenever a pose leaves fingers at rest
        R.curl = null;
        if (R.C.idle) { pose(R, [{ name: 'idle', t: 0, w: 1 }]); R.curl = capture(R); restPose(R, false); }
        // (a body built after the graphics were set up needs prepare(); the taker, P0, was prepared by the runtime)
        if (o.prepare) prepare(ent, o);
        // (a body's root wanders far from its carrier with travel kept: never culled by a stale sphere)
        model.traverse(function (m) { if (m.isSkinnedMesh) m.frustumCulled = false; });
        R.pose = function (layers) { return pose(R, layers); };
        R.capture = function (out) { return capture(R, out); };
        R.blend = function (A, Bp, w) { return blend(R, A, Bp, w); };
        R.rest = function (keepFingers) { return restPose(R, keepFingers); };
        R.damp = function () { return damp(R); };
        // the stateful face of the same (design §2.7): layers by name, then update() evaluates them
        R.play = function (name, p) { p = p || {}; R.layers[name] = { name: name, t: p.t || 0, w: p.w == null ? 1 : p.w, mask: p.mask || null, yaw: p.yaw || 0, off: p.off || null, pin: !!p.pin }; return R.layers[name]; };
        R.setTime = function (name, c) { if (R.layers[name]) R.layers[name].t = c; };
        R.weights = function (map) { for (var nm in map) { if (!R.layers[nm]) R.play(nm, { w: 0 }); R.layers[nm].w = map[nm]; } };
        R.stop = function (name) { delete R.layers[name]; };
        R.update = function () { var L = []; for (var nm in R.layers) L.push(R.layers[nm]); return pose(R, L); };
        R.has = function (name) { return !!R.C[name]; };
        R.getMixer = function () { return R.mixer || (R.mixer = new THREE.AnimationMixer(model)); };
        return R;
      }
      // castShadow, the environment's scale and live reflections for a body built after the runtime set up its
      // graphics (critique #8, as makeRival does); safe to repeat: envify marks what it scaled
      function prepare(ent, o) {
        o = o || {}; var H = host(o), obj = ent.object || ent.model;
        obj.traverse(function (m) { if (m.isMesh) m.castShadow = o.castShadow === false ? false : !(m.material && m.material.transparent) && !m.userData.gmFx; });
        if (H.envify) H.envify(obj);
        if (H.live) H.live(obj);
      }

      /* ----------------------------------------------------------------- the evaluator (pure, no mixer) -- */
      var QV = new Float32Array(4), QY = Q(), QT = Q(), PV = V(), PY = V();
      function tracksOf(R, C) {
        if (C.q) return C;
        var tq = [], tp = null;
        C.clip.tracks.forEach(function (tr) {
          var dot = tr.name.lastIndexOf('.'), bn = tr.name.slice(0, dot), prop = tr.name.slice(dot + 1), i = R.idx[bn];
          if (i === undefined) return;
          if (prop === 'quaternion') tq.push([i, tr.createInterpolant()]); else if (prop === 'position' && bn === 'root') tp = tr.createInterpolant();
        });
        C.q = tq; C.p = tp; return C;
      }
      function clipTime(C, t) { if (C.loop) { t = t % C.dur; return t < 0 ? t + C.dur : t; } return clampN(t, 0, C.dur); }
      // layers: [{ name, t, w, mask: 'upper'|'lower'|null, yaw, off: [x, y?, z] (metres, carrier frame), pin }]. Full
      // layers are blended by weight (the rest pose takes what their weights leave); masked layers then lay over them.
      // yaw/off move the layer's root about the carrier: an in-place clip (pin: its root over the spot) put where the
      // body walks, or a clip played on from where the last one ended.
      function pose(R, layers) {
        var n = R.n, acc = R.acc, accW = R.accW, ri = R.idx.root, i, k, L, C, tc, w;
        for (i = 0; i < n; i++) accW[i] = 0;
        var rp = [0, 0, 0], rpW = 0, over = [];
        for (k = 0; k < layers.length; k++) {
          L = layers[k]; C = R.C[L.name]; w = L.w == null ? 1 : L.w;
          if (!C || !(w > 1e-4)) continue;
          tracksOf(R, C);
          if (L.mask) { over.push(L); continue; }
          tc = clipTime(C, L.t || 0);
          for (var j = 0; j < C.q.length; j++) {
            i = C.q[j][0]; var v = C.q[j][1].evaluate(tc);
            if (i === ri && L.yaw) { QY.setFromAxisAngle(UPV, L.yaw); QT.fromArray(v).premultiply(QY); QT.toArray(QV); v = QV; }
            if (accW[i] === 0) { acc[i * 4] = v[0]; acc[i * 4 + 1] = v[1]; acc[i * 4 + 2] = v[2]; acc[i * 4 + 3] = v[3]; }
            else { QV[0] = v[0]; QV[1] = v[1]; QV[2] = v[2]; QV[3] = v[3]; THREE.Quaternion.slerpFlat(acc, i * 4, acc, i * 4, QV, 0, w / (accW[i] + w)); }
            accW[i] += w;
          }
          rootOf(R, C, L, tc, PV);
          var f = rpW === 0 ? 1 : w / (rpW + w);
          rp[0] += (PV.x - rp[0]) * f; rp[1] += (PV.y - rp[1]) * f; rp[2] += (PV.z - rp[2]) * f; rpW += w;
        }
        for (i = 0; i < n; i++) {
          var b = R.list[i];
          if (accW[i] <= 0) { if (R.isFinger[i] && R.curl) b.quaternion.fromArray(R.curl, i * 4); else b.quaternion.set(0, 0, 0, 1); continue; }
          b.quaternion.fromArray(acc, i * 4);
          if (accW[i] < 0.999) { QT.set(0, 0, 0, 1); if (R.isFinger[i] && R.curl) QT.fromArray(R.curl, i * 4); b.quaternion.slerp(QT, 1 - accW[i]); }
        }
        if (rpW > 0) { PV.set(rp[0], rp[1], rp[2]); if (rpW < 0.999) PV.lerp(R.rootRest, 1 - rpW); R.root.position.copy(PV); } else R.root.position.copy(R.rootRest);
        // masked layers over the whole: the upper body's own motion over whatever the legs do (and the reverse)
        for (k = 0; k < over.length; k++) {
          L = over[k]; C = R.C[L.name]; tc = clipTime(C, L.t || 0); w = clampN(L.w, 0, 1);
          for (var j2 = 0; j2 < C.q.length; j2++) {
            i = C.q[j2][0]; if (i === ri || (L.mask === 'upper') !== R.isUpper[i]) continue;
            QT.fromArray(C.q[j2][1].evaluate(tc)); R.list[i].quaternion.slerp(QT, w);
          }
        }
        damp(R);
        R.model.rotation.set(0, 0, 0);
        R.model.updateMatrixWorld(true);
      }
      function rootOf(R, C, L, tc, out) {
        tracksOf(R, C);
        if (C.p) out.fromArray(C.p.evaluate(tc)); else out.copy(R.rootRest);
        if (L.pin) { out.x = 0; out.z = 0; }
        if (L.yaw) out.applyAxisAngle(UPV, L.yaw);
        if (L.off) { out.x += L.off[0] / R.scale; out.z += (L.off.length > 2 ? L.off[2] : L.off[1]) / R.scale; if (L.off.length > 2) out.y += L.off[1] / R.scale; }
        return out;
      }
      // the captured clavicles hang lower than this rig's rest pose and collapse the shoulders into slopes in a close
      // shot: most of the rest pose and a quarter of the capture (v1's brawl does the same after every update)
      function damp(R) { for (var i = 0; i < R.clav.length; i++) R.list[R.clav[i]].quaternion.slerp(QT.set(0, 0, 0, 1), 0.75); }
      // pose A and pose B (critique #10): what the clips made, what the IK made, and a slerp between them by the IK weight
      function capture(R, out) {
        out = out || new Float32Array(R.n * 4 + 3);
        for (var i = 0; i < R.n; i++) R.list[i].quaternion.toArray(out, i * 4);
        out[R.n * 4] = R.root.position.x; out[R.n * 4 + 1] = R.root.position.y; out[R.n * 4 + 2] = R.root.position.z;
        return out;
      }
      function blend(R, A, Bp, w) {
        w = clampN(w, 0, 1);
        for (var i = 0; i < R.n; i++) { THREE.Quaternion.slerpFlat(QV, 0, A, i * 4, Bp, i * 4, w); R.list[i].quaternion.fromArray(QV); }
        var o = R.n * 4; R.root.position.set(A[o] + (Bp[o] - A[o]) * w, A[o + 1] + (Bp[o + 1] - A[o + 1]) * w, A[o + 2] + (Bp[o + 2] - A[o + 2]) * w);
        R.model.updateMatrixWorld(true);
      }
      // the rest pose, the fingers kept curled (never the splayed rest: the claw hands of 3 Oct)
      function restPose(R, keepFingers) {
        for (var i = 0; i < R.n; i++) {
          if (R.isFinger[i] && keepFingers !== false && R.curl) R.list[i].quaternion.fromArray(R.curl, i * 4);
          else if (!(R.isFinger[i] && keepFingers === 'asis')) R.list[i].quaternion.set(0, 0, 0, 1);
        }
        R.root.position.copy(R.rootRest); R.model.updateMatrixWorld(true);
      }

      /* ------------------------------------------------------------------------------------------------ IK -- */
      // ported from the look-dev (scripts/.scratch/shootout/lookdev/world.js:76-115): world-space aims, a two-bone solve
      // with the joint bent toward a pole. Each 01/02 pair moves as one (the 02 bone's own rotation is left alone).
      var _pq = Q(), _ap = V(), _ac = V(), _aw = V(), _aq = Q(), _aq2 = Q(), IDQ = Q();
      function bone(R, n) { return R.bones[n] || R.bones[n.replace(/\./g, '_')]; }
      function wq(o, out) { return o.getWorldQuaternion(out || Q()); }
      function wp(o, out) { return o.getWorldPosition(out || V()); }
      function setWorldQ(b, q) { b.parent.getWorldQuaternion(_pq).invert(); b.quaternion.copy(_pq.multiply(q)); b.updateWorldMatrix(false, true); }
      // turn b so that tip (a bone, or a point carried by b) points at target; w < 1 turns part of the way
      function aim(b, tip, target, w) {
        b.updateWorldMatrix(true, true);
        var p = b.getWorldPosition(_ap), cur = tip.isVector3 ? _ac.copy(tip) : tip.getWorldPosition(_ac);
        cur.sub(p); var want = _aw.copy(target).sub(p);
        if (cur.lengthSq() < 1e-12 || want.lengthSq() < 1e-12) return;
        _aq.setFromUnitVectors(cur.normalize(), want.normalize());
        if (w != null && w < 1) _aq.slerp(IDQ, 1 - clampN(w, 0, 1));
        b.getWorldQuaternion(_aq2); setWorldQ(b, _aq.multiply(_aq2));
      }
      function turn(b, axis, ang) { b.updateWorldMatrix(true, false); _aq.setFromAxisAngle(_aw.copy(axis).normalize(), ang); b.getWorldQuaternion(_aq2); setWorldQ(b, _aq.multiply(_aq2)); }
      var _A = V(), _B = V(), _C = V(), _D = V(), _P = V(), _J = V(), _T = V();
      function ik2(a, b, c, target, pole) {
        a.updateWorldMatrix(true, true);
        a.getWorldPosition(_A); b.getWorldPosition(_B); c.getWorldPosition(_C);
        var la = _A.distanceTo(_B), lb = _B.distanceTo(_C);
        var d = Math.min(Math.max(target.distanceTo(_A), Math.abs(la - lb) + 1e-3), la + lb - 1e-3);
        _D.copy(target).sub(_A).normalize();
        var x = (la * la - lb * lb + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, la * la - x * x));
        _P.copy(pole).sub(_A); _P.addScaledVector(_D, -_P.dot(_D));
        if (_P.lengthSq() < 1e-10) _P.copy(_B).sub(_A).addScaledVector(_D, -_B.clone().sub(_A).dot(_D));
        _P.normalize();
        _J.copy(_A).addScaledVector(_D, x).addScaledVector(_P, hh);
        _T.copy(_A).addScaledVector(_D, d);
        var T2 = _T.clone();
        aim(a, b, _J); aim(b, c, T2);
      }
      // the person's own frame (+z ahead, +x their left, y up) to the world; frame = R.frame unless given
      function L(R, x, y, z, frame) { var f = frame || R.frame; f.updateWorldMatrix(true, false); return V(x, y, z).applyMatrix4(f.matrixWorld); }
      function legTo(R, side, foot, knee) { ik2(bone(R, 'upperleg01_' + side), bone(R, 'lowerleg01_' + side), bone(R, 'foot_' + side), foot, knee); }
      function armTo(R, side, hand, elbow) { ik2(bone(R, 'upperarm01_' + side), bone(R, 'lowerarm01_' + side), bone(R, 'wrist_' + side), hand, elbow); }
      function handAim(R, side, at) { aim(bone(R, 'wrist_' + side), bone(R, 'finger3-1_' + side), at); }
      // the foot pointing along `ahead` (world), from its own rest direction (the toes ahead and a little down)
      function footFlat(R, side, ahead) {
        var f = bone(R, 'foot_' + side); f.updateWorldMatrix(true, false);
        var cur = _ac.copy(R.toe[side]).applyQuaternion(wq(f, _aq2)).normalize(), want = _aw.copy(ahead).normalize();
        _aq.setFromUnitVectors(cur, want); setWorldQ(f, _aq.multiply(_aq2));
      }
      // the head to a point: the neck takes a third, the head the rest, never past 75 degrees off the chest
      function look(R, at, w) {
        w = w == null ? 1 : w; if (!(w > 0)) return;
        var hd = bone(R, 'head'), nk = bone(R, 'neck01'), ch = bone(R, 'spine01');
        var fwd = V(), want = V(), hp = wp(hd);
        function faceW() { return fwd.copy(R.face).applyQuaternion(wq(hd)).normalize(); }
        want.copy(at).sub(hp).normalize();
        var chestF = V(0, 0, 1).applyQuaternion(wq(ch)); chestF.y = 0; chestF.normalize();
        var wf = want.clone(); wf.y = 0; wf.normalize();
        var off = Math.acos(clampN(chestF.dot(wf), -1, 1));
        if (off > 1.31) w *= Math.max(0, 1 - (off - 1.31) / 0.5);
        var q1 = Q().setFromUnitVectors(faceW(), want); q1.slerp(IDQ, 1 - 0.35 * w);
        setWorldQ(nk, q1.multiply(wq(nk)));
        var q2 = Q().setFromUnitVectors(faceW(), want.copy(at).sub(wp(hd)).normalize()); q2.slerp(IDQ, 1 - 0.9 * w);
        setWorldQ(hd, q2.multiply(wq(hd)));
      }
      // a bone turned about an axis of the person's own frame
      function bend(R, name, axisLocal, ang, frame) { var f = frame || R.frame; var ax = axisLocal.clone().applyQuaternion(wq(f)); turn(bone(R, name), ax, ang); }
      // a bone turned about the world's vertical (the tells: hips and shoulders toward the aim)
      function yawBone(R, name, ang) { turn(bone(R, name), UPV, ang); }

      /* ------------------------------------------------------------------------------------ blob shadows -- */
      // a soft ellipse on the turf per person per floodlight (critique #4: only the sun casts a real shadow map):
      // n instances, one draw; set(i, x, z, len, wid, yaw, a): instance i centred on (x, z), len long along yaw (the
      // ground direction away from its lamp), wid across, alpha a (0.18; 0 hides it)
      function blobs(n, o) {
        o = o || {}; var H = host(o);
        var g = new THREE.PlaneGeometry(1, 1); g.rotateX(-PI / 2);
        var al = new Float32Array(n); g.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(al, 1));
        var mat = new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
          vertexShader: 'attribute float aAlpha; varying float vA; varying vec2 vP;\nvoid main() { vA = aAlpha; vP = position.xz;\n#ifdef USE_INSTANCING\n vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);\n#else\n vec4 w = modelMatrix * vec4(position, 1.0);\n#endif\n gl_Position = projectionMatrix * viewMatrix * w; }',
          fragmentShader: 'varying float vA; varying vec2 vP;\nvoid main() { vec2 q = vP * 2.0; float d = length(q); float a = vA * (1.0 - smoothstep(0.25, 1.0, d)); if (a < 0.002) discard; gl_FragColor = vec4(0.0, 0.0, 0.0, a); }',
        });
        var mesh = new THREE.InstancedMesh(g, mat, n); mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.castShadow = false; mesh.receiveShadow = false;
        mesh.name = 'shootout-blobs';
        var M = new THREE.Matrix4(), Pp = V(), Qq = Q(), S = V();
        for (var i = 0; i < n; i++) { M.makeScale(0, 0, 0); mesh.setMatrixAt(i, M); }
        if (o.parent !== false && (o.parent || H.scene)) (o.parent || H.scene).add(mesh);
        return {
          mesh: mesh, count: n,
          set: function (i, x, z, len, wid, yaw, a) {
            if (i < 0 || i >= n) return;
            Pp.set(x, o.y || 0.012, z); Qq.setFromAxisAngle(UPV, yaw || 0); S.set(Math.max(1e-3, wid), 1, Math.max(1e-3, len));
            M.compose(Pp, Qq, S); mesh.setMatrixAt(i, M); al[i] = a == null ? 0.18 : a;
          },
          hide: function (i) { if (i >= 0 && i < n) al[i] = 0; },
          update: function () { mesh.instanceMatrix.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true; },
          dispose: function () { if (mesh.parent) mesh.parent.remove(mesh); g.dispose(); mat.dispose(); },
        };
      }
      // one person's shadows, one per floodlight: from the feet away from the lamp, long by the hips' height
      var _f1 = V(), _f2 = V(), _hp = V();
      function shadowOf(Bl, i0, R, floods, o) {
        o = o || {};
        bone(R, 'foot_L').getWorldPosition(_f1); bone(R, 'foot_R').getWorldPosition(_f2); _f1.add(_f2).multiplyScalar(0.5);
        bone(R, 'root').getWorldPosition(_hp);
        var hip = Math.max(0.15, _hp.y), gx = (_f1.x + _hp.x) / 2, gz = (_f1.z + _hp.z) / 2;
        for (var j = 0; j < floods.length; j++) {
          var L0 = floods[j], dx = gx - L0[0], dz = gz - L0[2], dist = Math.hypot(dx, dz) || 1, ht = Math.max(4, L0[1] - hip);
          var len = clampN(hip * dist / ht * 1.25 + 0.35, 0.45, 3.2);
          Bl.set(i0 + j, gx + dx / dist * (len * 0.42 - 0.1), gz + dz / dist * (len * 0.42 - 0.1), len, (o.wid || 0.46) * R.k, Math.atan2(dx, dz), o.alpha == null ? 0.18 : o.alpha);
        }
      }

      /* ------------------------------------------------------------------------------------ football kit -- */
      // The look-dev's kit (world.js:118-199): the people pack's tee and jeans recoloured, the jeans cut into shorts, the
      // legs under them restored, socks a shell over the shins. Male body + human-pack-male only (a female /me body wears
      // the painted kit). o.human(id, opts) makes the plain body the legs are restored from (once per body id).
      var REFGEO = {}, CLOTH = {}, CUTY = 0.60;
      function bodyMesh(obj) { var r = null; obj.traverse(function (m) { if (!r && m.isSkinnedMesh && m.geometry.userData && m.geometry.userData.groups) r = m; }); return r; }
      function packMesh(obj) { var r = null; obj.traverse(function (m) { if (m.isSkinnedMesh && m.name === 'pack') r = m; }); return r; }
      function withIndex(g, ix) {
        var g2 = new THREE.BufferGeometry(); for (var an in g.attributes) g2.setAttribute(an, g.attributes[an]);
        g2.morphAttributes = g.morphAttributes; g2.morphTargetsRelative = g.morphTargetsRelative; g2.setIndex(new THREE.BufferAttribute(ix, 1));
        g.groups.forEach(function (gg) { g2.addGroup(gg.start, gg.count, gg.materialIndex); }); g2.userData = g.userData; g2.boundingSphere = g.boundingSphere; return g2;
      }
      function hexRgb(h) { var n = parseInt(String(h).slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
      function kitCloth(m, K) {
        var key = m.uuid + K.shirt + K.shorts + K.trim; if (CLOTH[key]) return CLOTH[key];
        var img = m.map.image, w = img.width, hh = img.height, cv = document.createElement('canvas'); cv.width = w; cv.height = hh;
        var g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
        var d = g.getImageData(0, 0, w, hh), D = d.data, x, y, i, Lm;
        var cs = hexRgb(K.shirt), ct = hexRgb(K.trim), cj = hexRgb(K.shorts), st = 0, sn = 0, jt = 0, jn = 0;
        function lum(ii) { return (0.2126 * D[ii] + 0.7152 * D[ii + 1] + 0.0722 * D[ii + 2]) / 255; }
        function jeans(xx, yy) { return yy < 0.59 * hh && (xx < 0.72 * w || (xx < 0.78 * w && yy > 0.404 * hh)); }
        function trim(ii) { return D[ii] > D[ii + 1] + 45 && D[ii] > D[ii + 2] + 70; }
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
        var t = new THREE.CanvasTexture(cv); t.flipY = m.map.flipY; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
        var nm = m.clone(); nm.map = t; nm.color.set('#FFFFFF'); nm.roughness = 0.78;
        return (CLOTH[key] = nm);
      }
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
        var g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
        g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4)); g.setIndex(I);
        g.morphAttributes.position = M.map(function (arr) { return new THREE.Float32BufferAttribute(arr, 3); }); g.morphTargetsRelative = true;
        var mesh = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial({ color: col, roughness: 0.82 }));
        mesh.updateMorphTargets(); for (var mi = 0; mi < mesh.morphTargetInfluences.length; mi++) mesh.morphTargetInfluences[mi] = body.morphTargetInfluences[mi] || 0;
        mesh.bind(body.skeleton, body.bindMatrix); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.name = 'socks';
        return mesh;
      }
      // h: a human made with wear: [{ name: 'male_casualsuit06', color: K.shirt }]; K: { shirt, trim, shorts, socks }
      function footballKit(h, K, o) {
        o = o || {}; var H = host(o), id = o.body || 'human-athlete-male';
        var body = bodyMesh(h.object), pack = packMesh(h.object);
        if (!body || !pack) return { error: 'kit: no ' + (body ? 'pack' : 'body') };
        if (!REFGEO[id]) { var ref = H.human ? H.human(id, {}) : null; if (!ref) return { error: 'kit: no reference body' }; REFGEO[id] = bodyMesh(ref.object).geometry; if (ref.dispose) ref.dispose(); }
        var full = REFGEO[id], pos = full.attributes.position, fi = full.index.array, bg = body.geometry, ix = new bg.index.array.constructor(bg.index.array), B0 = bg.groups[0], back = 0;
        for (var q = B0.start; q < B0.start + B0.count; q += 3) {
          if (ix[q] || ix[q + 1] || ix[q + 2]) continue;
          var a = fi[q], b = fi[q + 1], c = fi[q + 2];
          if (Math.max(pos.getY(a), pos.getY(b), pos.getY(c)) < CUTY + 0.03) { ix[q] = a; ix[q + 1] = b; ix[q + 2] = c; back++; }
        }
        body.geometry = withIndex(bg, ix);
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
        return { back: back, cut: cut };
      }
      // the kit's wear and look options for ctx.assets.human (look-dev kit(), world.js:218-227)
      function kitOptions(K, n) {
        n = n || {};
        return { skin: n.skin, hair: n.hair, hairColor: n.hairColor || '#16100C', height: n.height || 1.82, build: { muscle: n.muscle == null ? 0.7 : n.muscle, lean: n.lean == null ? 0.55 : n.lean },
          outfit: { shoes: K.boots, sole: '#1A1A1A', top: null }, wear: [{ name: K.long ? 'male_casualsuit02' : 'male_casualsuit06', color: K.shirt }],
          clothes: { belt: false, gloves: K.gloves || undefined, beard: n.beard } };
      }

      /* ------------------------------------------------------------------------------- the kick's numbers -- */
      // kick meta (lane A, design §4.6), or, without it, measured off the clip itself the same way (a fallback and a
      // cross-check): the kicking foot, contact at its fastest under 0.35 m, the plant, the stances, the strike point
      function strikeLocalFor(side, R) { return R && R.strike ? R.strike[side].clone() : side === 'L' ? V(-0.0326, -0.0408, 0.0804) : V(0.0326, -0.0408, 0.0804); }
      function ankleLocal(R, side, out) {
        // the ankle in the carrier's frame (unrotated), for the pose the rig holds now
        bone(R, 'foot_' + side).getWorldPosition(out); return R.carrier.worldToLocal(out);
      }
      function measureKick(R, name) {
        var C = R.C[name]; if (!C) return null;
        var fps = 120, n = Math.floor(C.dur * fps) + 1, F = { L: [], R: [] }, S = { L: [], R: [] }, root = [], i, sd;
        var sv = R.carrier.position.clone(), sq = R.carrier.quaternion.clone();
        R.carrier.position.set(0, 0, 0); R.carrier.quaternion.set(0, 0, 0, 1); R.carrier.updateMatrixWorld(true);
        for (i = 0; i < n; i++) {
          pose(R, [{ name: name, t: i / fps, w: 1 }]);
          for (sd in F) {
            var fb = bone(R, 'foot_' + sd); F[sd].push(fb.getWorldPosition(V()));
            S[sd].push(fb.localToWorld(strikeLocalFor(sd, R)));
          }
          root.push(R.root.getWorldPosition(V()));
        }
        R.carrier.position.copy(sv); R.carrier.quaternion.copy(sq); R.carrier.updateMatrixWorld(true);
        var floor = Infinity; for (sd in F) F[sd].forEach(function (p) { floor = Math.min(floor, p.y); });
        function spd(a, j) { var p = a[Math.max(0, j - 1)], q = a[Math.min(n - 1, j + 1)]; return p.distanceTo(q) * fps / 2; }
        var best = { s: 'R', j: 0, v: 0 };
        for (sd in S) for (i = 2; i < n - 2; i++) { var v = spd(S[sd], i); if (v > best.v && S[sd][i].y - floor < 0.35) best = { s: sd, j: i, v: v }; }
        var j0 = best.j, v0 = spd(S[best.s], j0 - 1), v1 = best.v, v2 = spd(S[best.s], j0 + 1), den = v0 - 2 * v1 + v2;
        var contact = (j0 + (Math.abs(den) > 1e-6 ? clampN(0.5 * (v0 - v2) / den, -0.5, 0.5) : 0)) / fps;
        var kickF = best.s, sup = kickF === 'L' ? 'R' : 'L';
        function down(a, j) { return a[j].y < floor + 0.03 && spd(a, j) < 1.2; }
        var stance = [];
        for (sd in F) { var on = -1; for (i = 1; i < n; i++) { var dn = down(F[sd], i); if (dn && on < 0) on = i; if ((!dn || i === n - 1) && on >= 0) { if (i - on > 4) stance.push([sd, on / fps, i / fps]); on = -1; } } }
        stance.sort(function (a, b) { return a[1] - b[1]; });
        var plant = null; stance.forEach(function (s) { if (s[0] === sup && s[1] < contact) plant = s; });
        var run = 0; for (i = 6; i < n - 6; i++) { if (Math.hypot(root[i + 6].x - root[i - 6].x, root[i + 6].z - root[i - 6].z) * fps / 12 > 0.3) { run = i / fps; break; } }
        var jc = Math.round(contact * fps), sw = S[kickF][Math.min(n - 1, jc + 1)].clone().sub(S[kickF][Math.max(0, jc - 1)]);
        var st = S[kickF][jc];
        return { foot: kickF, start: Math.max(0, run - 0.15), run: run, plant: plant ? plant[1] : contact - 0.125, contact: contact, lift: plant ? plant[2] : contact + 0.25,
          stance: stance.filter(function (s) { return s[1] < contact + 0.05; }), strike: [st.x / R.scale, st.y / R.scale, st.z / R.scale], swingYaw: Math.atan2(sw.x, sw.z), shotYaw: Math.atan2(sw.x, sw.z), measured: true, footSpeed: best.v / R.scale };
      }
      function kickOf(R, name) {
        var m = R.meta[name] && R.meta[name].kick;
        if (m && m.contact != null) return Object.assign({ foot: 'R', start: 0, shotYaw: 0 }, m);
        return R.measured && R.measured[name] || ((R.measured = R.measured || {})[name] = measureKick(R, name));
      }

      /* ------------------------------------------------------------------------------------------ the taker -- */
      var _w1 = V(), _w2 = V(), _w3 = V(), _w4 = V(), _q1 = Q(), _q2 = Q(), _q3 = Q();
      // the walk's script (design §2.2; the director's phase timer reads P.walk)
      var WALK0 = { to: 3.2, look: 0.6, back: 1.6, turn: 0.4, settle: 0.4 };
      // the run-up's prefix (tap contract §2.3, §4): K's constants when the brain is pasted in beside this file, the same
      // numbers otherwise (the scratch lab, Node)
      var PRE0 = { PRE_ACC: 0.50, PRE_STEP: 0.47, PRE_FIRST: 0.20, MARK_D: 4.75 };
      function preC(k) { var C = typeof ShootBrain !== 'undefined' && ShootBrain && ShootBrain.C; return C && C[k] != null && isFinite(C[k]) ? +C[k] : PRE0[k]; }
      function other(f) { return f === 'L' ? 'R' : 'L'; }
      // the prefix's tunables (xf and gaitWalk are knobs: plan({ ... }) or knobs): the crossfade into the kick clip (c-s),
      // the walk source, the gait's speeds (real m/s) at which the walk gives way to the jog and the jog takes some run,
      // the bounce's rate
      var PRE_K = { xf: 0.12, gaitWalk: 'walkHeavy', jog0: 0.2, jogV: [1.1, 2.1], runK: 0.35, runV: [1.9, 2.6], bounceHz: 2.2 };
      var FLOOR = 0.004;
      // The base gaits, measured once per body: each loop's touchdown and lift per foot, read off its in-place root (a
      // foot is down while it sweeps back at over 45% of the clip's speed, low over the floor) -> { dur, td: {L, R}, len,
      // off: { L, R } (the stance's length in steps from its touchdown) } or null (not a usable gait)
      function gaitOf(R, name) {
        R.gait = R.gait || {}; if (R.gait[name] !== undefined) return R.gait[name];
        var C = R.C[name]; if (!C || !C.loop || !(C.meta.speed > 0)) return (R.gait[name] = null);
        var n = Math.max(16, Math.round(C.dur * 120)), dt = C.dur / n, sp = C.meta.speed * R.scale, rows = [], i, k, sd;
        var sv = R.carrier.position.clone(), sq = R.carrier.quaternion.clone(), mp = R.model.position.clone(), pt = V(), ap = V();
        R.model.position.copy(R.model0 || mp); R.carrier.position.set(0, 0, 0); R.carrier.quaternion.set(0, 0, 0, 1); R.carrier.updateMatrixWorld(true);
        var floor = Infinity;
        for (i = 0; i < 3 * n + 1; i++) {
          pose(R, [{ name: name, t: i * dt, w: 1 }]);
          var row = {};
          for (k = 0; k < 2; k++) {
            sd = k ? 'R' : 'L'; var fb = bone(R, 'foot_' + sd), lo = 9;
            for (var s = 0; s < 3; s++) { pt.copy(R.sole[s]); fb.localToWorld(pt); lo = Math.min(lo, pt.y); }
            fb.getWorldPosition(ap); row[sd] = [ap.z, lo]; floor = Math.min(floor, lo);
          }
          rows.push(row);
        }
        R.carrier.position.copy(sv); R.carrier.quaternion.copy(sq); R.model.position.copy(mp); R.carrier.updateMatrixWorld(true);
        var G = { name: name, dur: C.dur, speed: sp, td: {}, len: {}, off: {} };
        for (k = 0; k < 2; k++) {
          sd = k ? 'R' : 'L';
          var dn = []; for (i = 0; i <= 3 * n; i++) { var a = rows[Math.max(0, i - 1)][sd][0], b = rows[Math.min(3 * n, i + 1)][sd][0]; dn.push((b - a) / (2 * dt) < -0.45 * sp && rows[i][sd][1] < floor + 0.10); }
          var on = -1, off = -1;
          for (i = n; i < 2 * n; i++) if (dn[i] && !dn[i - 1]) { on = i; break; }
          if (on >= 0) for (off = on; off < 3 * n && dn[off]; off++);
          if (on < 0 || off - on < 2) return (R.gait[name] = null);
          // (the heel meets the turf a little before the sweep starts, the toe leaves it a little after: the contact, by
          // height, within 0.15 of a cycle either side)
          for (var e = 0; e < 0.15 * n && rows[on - 1][sd][1] < floor + 0.012; e++) on--;
          for (e = 0; e < 0.15 * n && off < 3 * n && rows[off][sd][1] < floor + 0.012; e++) off++;
          G.td[sd] = (on % n) * dt; G.len[sd] = (off - on) * dt;
        }
        // (stance lengths in steps: one step from a foot's touchdown to the other's, the next from there to its own again;
        // and the retarget's toe-up in this gait, read at mid-stance, where a planted foot is flat)
        G.bias = {};
        ['L', 'R'].forEach(function (f) {
          var s1 = span(G, f), s2 = G.dur - s1, len = G.len[f];
          G.off[f] = len <= s1 ? len / s1 : 1 + Math.min(1, (len - s1) / Math.max(1e-3, s2));
          R.model.position.copy(R.model0 || mp); R.carrier.position.set(0, 0, 0); R.carrier.quaternion.set(0, 0, 0, 1); R.carrier.updateMatrixWorld(true);
          pose(R, [{ name: name, t: G.td[f] + len * 0.45, w: 1 }]);
          var toe = R.toe[f].clone().applyQuaternion(bone(R, 'foot_' + f).getWorldQuaternion(Q()));
          G.bias[f] = clampN(Math.asin(clampN(toe.y, -1, 1)) - R.toeRestPitch, -0.2, 0.6);
        });
        R.carrier.position.copy(sv); R.carrier.quaternion.copy(sq); R.model.position.copy(mp); R.carrier.updateMatrixWorld(true);
        return (R.gait[name] = G);
      }
      // the clip time from foot f's touchdown to the other's, and the clip time at a share u of it
      function span(G, f) { var d = ((G.td[other(f)] - G.td[f]) % G.dur + G.dur) % G.dur; return d > 1e-3 ? d : G.dur / 2; }
      function gaitT(G, f, u) { return G.td[f] + u * span(G, f); }
      // the brain's prefix timeline (ShootBrain.pre), or the same formula here: c0 = cJ - T; footfalls back from cJ every
      // STEP, feet alternating away from cJ's, to PRE_FIRST after c0; the root covering the distance with a linear speed
      // ramp over TACC, then at the clip's own speed at cJ
      function joinOf(K, join) {
        var st = K.steps || [];
        if (join === 'run') {
          var cr = K.run != null ? +K.run : +(K.start || 0), nx = null;
          for (var i = 0; i < st.length; i++) if (st[i][1] > cr + 1e-6) { nx = st[i]; break; }
          return { c: cr, foot: nx ? other(nx[0]) : (K.foot === 'L' ? 'L' : 'R') };
        }
        if (st.length >= 2) return { c: +st[st.length - 2][1], foot: st[st.length - 2][0] === 'L' ? 'L' : 'R' };
        return { c: Math.max(+(K.start || 0), K.plant - 0.55), foot: K.foot === 'L' ? 'L' : 'R' };
      }
      function localPre(K, T, join) {
        var J = joinOf(K, join), cJ = J.c, c0 = cJ - T, TACC = Math.min(preC('PRE_ACC'), T), Dp = T - TACC / 2, STEP = preC('PRE_STEP'), steps = [], f = J.foot;
        for (var k = 1; cJ - k * STEP >= c0 + preC('PRE_FIRST') - 1e-9; k++) { f = other(f); steps.unshift([f, Math.round((cJ - k * STEP) * 1e6) / 1e6]); }
        function tau(c) { return clampN((+c || 0) - c0, 0, T); }
        return { c0: c0, cJ: cJ, T: T, TACC: TACC, STEP: STEP, footJ: J.foot, steps: steps, local: true,
          frac: function (c) { var t = tau(c); return Dp > 0 ? (t < TACC ? t * t / (2 * TACC) : t - TACC / 2) / Dp : 1; },
          speedK: function (c) { return TACC > 0 ? Math.min(1, tau(c) / TACC) : 1; } };
      }
      function makeTaker(ent, o) {
        var R = rig(ent, o), P = null, last = null, MODE = { name: 'set', settle: 0 }, RX = null, clock = 0, hangT = 0, WSPEC = null, TL = null;
        if (!R) return null;
        R.model0 = R.model.position.clone();
        var CL = o.clip || 'fbKick', knobs = o.knobs || {};
        var T = { rig: R };
        function knob(p, k) { var v = p && p[k] != null ? p[k] : knobs[k]; return v != null && v !== '' && (typeof v !== 'number' || isFinite(v)) ? v : PRE_K[k]; }
        // ----- the plan: the ball, the clip, the aim (planned again when the aim locks; cheap and pure)
        // p = { ball: [x, y, z], clip, meta (the kick's numbers; else the clip's own, else measured), aim: [x, y(, z)] (a
        //       point on the goal line) or aimYaw (0 straight, + toward +x), goalZ, snapDeg, snapY 0..1, tell 0..1,
        //       stride (the tell's last-stride share, 0.05), pin (false: the planted feet as the clip has them),
        //       markD (the mark's distance behind the ball, 4.75), join ('run': the literal join, for comparison), xf (the
        //       crossfade into the clip, c-s), gaitWalk (the prefix's walk source) }
        // -> P, with mark: [x, z] (the run-up's start: where the walk ends), face (the way it faces there), pre (the
        //    prefix: T the nominal clip-seconds the director records as rec.preT, D, vJ, cJ, rootJ, dir) and walk
        T.plan = function (p) {
          p = p || {};
          if (p.ent && p.ent.model !== R.model) { var R2 = rig(p.ent, o); if (R2) { R = R2; R.model0 = R.model.position.clone(); T.rig = R; } }
          var name = p.clip && R.C[p.clip] ? p.clip : p.meta && p.meta.clip && R.C[p.meta.clip] ? p.meta.clip : R.C[CL] ? CL : null;
          var ball = p.ball || o.ball || [0, 0.11, -41.5], aim = p.aim || null;
          var gz = p.goalZ != null ? p.goalZ : aim && aim.length > 2 ? aim[2] : o.goal != null ? o.goal : -52.5;
          var K = null;
          if (name) K = p.meta && p.meta.contact != null && !p.meta.standIn ? Object.assign({ foot: 'R', start: 0, shotYaw: 0, stance: [] }, (R.meta[name] && R.meta[name].kick) || {}, p.meta) : kickOf(R, name);
          var dx = aim ? aim[0] - ball[0] : 0, dz = gz - ball[2];
          var psiBase = PI - (K && K.shotYaw || 0), dAim = aim ? wrapA(Math.atan2(dx, dz) - PI) : -(p.aimYaw || 0);
          var shot = V(Math.sin(PI + dAim), 0, Math.cos(PI + dAim));
          var side = !aim || Math.abs(dx) < 0.45 ? 0 : dx > 0 ? 1 : -1;
          var snapDeg = p.snapDeg != null ? p.snapDeg : knobs.snap != null && isFinite(knobs.snap) ? +knobs.snap : 25;
          var md = p.markD != null ? +p.markD : knobs.mark != null ? +knobs.mark : preC('MARK_D');
          P = { name: name, K: K, ball: ball, gz: gz, aim: aim, psiBase: psiBase, dAim: dAim, shot: shot, side: side,
            O: V(ball[0], 0, ball[2] + 0.11), snap: snapDeg * PI / 180, snapY: p.snapY == null ? 1 : clampN(p.snapY, 0, 1), tell: p.tell == null ? 1 : p.tell,
            pin: p.pin !== false, strideK: p.stride == null ? 0.05 : p.stride, fps: name ? R.C[name].fps : 60, mark: null, face: 0,
            markD: isFinite(md) && md > 1 ? md : preC('MARK_D'), join: (p.join || knobs.join) === 'run' ? 'run' : null,
            xf: +knob(p, 'xf'), walkClip: String(knob(p, 'gaitWalk')) };
          if (!K) return P;
          // the clip's own start frame (the set pose): which way it faces; where its root stood (the old mark)
          placeCarrier(psiBase);
          pose(R, [{ name: name, t: K.start, w: 1 }]);
          var rf = V(0, 0, 1).applyQuaternion(R.root.quaternion); P.faceLocal = Math.atan2(rf.x, rf.z);
          P.clipMark = R.root.getWorldPosition(V()); P.clipMark.y = 0;
          // the last stride (for the tell): the stance before the plant, and its foot where it lands
          var st = (K.stance || []).slice().sort(function (a, b) { return a[1] - b[1]; }), pl = null, prev = null;
          st.forEach(function (s) { if (!pl && (Math.abs(s[1] - K.plant) < 0.06 || (s[0] !== K.foot && s[1] >= K.plant - 0.06))) pl = s; });
          st.forEach(function (s) { if (s[1] < K.plant - 0.06) prev = s; });
          P.stance = st; P.plantStance = pl; P.prevStance = prev;
          P.plantSide = K.foot === 'L' ? 'R' : 'L';
          if (pl && prev) {
            var tP = Math.ceil(pl[1] * P.fps - 1e-6) / P.fps, tQ = Math.ceil(prev[1] * P.fps - 1e-6) / P.fps;
            pose(R, [{ name: name, t: tP, w: 1 }]); var a1 = ankleLocal(R, pl[0], V());
            pose(R, [{ name: name, t: tQ, w: 1 }]); var a0 = ankleLocal(R, prev[0], V());
            P.stride = Math.hypot(a1.x - a0.x, a1.z - a0.z); P.runDirLocal = V(a1.x - a0.x, 0, a1.z - a0.z).normalize();
          }
          // each stance's foot: the toe-up the retarget left taken out, pinned at its lowest sole point, on the turf
          P.pins = P.pin ? pinsOf(name, K, st, pl) : null;
          // the aim's turn (the tells' yaw): the last stride's flight by default; 'run' from the join (the aim locks
          // there: D3), never before
          var cJ0 = joinOf(K, P.join).c;
          P.yaw = p.yawWin !== 'run' && prev && prev[2] < K.plant - 0.08 && prev[2] > cJ0 ? [prev[2], K.plant] : [Math.max(K.start, cJ0), K.plant];
          // the prefix (the mark, the jog's timeline, its gaits and its footfalls' spots)
          planPrefix();
          setWalk(WSPEC);
          return P;
        };
        // the clip's root at clip time c, on the turf (carrier at O, psiBase)
        function rootAt(c, out) { pose(R, [{ name: P.name, t: c, w: 1 }]); return R.root.getWorldPosition(out || V()); }
        // the prefix (tap contract §4): the mark is the jog's start, D metres back along the clip's own run direction at
        // the join (cJ, the touchdown that starts the last stride: D1) from where its root is there
        function planPrefix() {
          var K = P.K, J = joinOf(K, P.join), cJ = J.c, h = 0.05;
          placeCarrier(P.psiBase);
          var r0 = rootAt(cJ - h), r1 = rootAt(cJ + h), rJ = rootAt(cJ);
          var vx = (r1.x - r0.x) / (2 * h), vz = (r1.z - r0.z) / (2 * h), vJ = Math.max(0.3, Math.hypot(vx, vz));
          // (?join=run, the literal join for comparison: the clip barely moves at its run start, 0.3 m/s, so the jog keeps
          // the default join's pace and meets it there: the stop D1 avoids, shown, rather than a 6 s creep to the mark)
          if (P.join === 'run') { var Jd = joinOf(K, null), q0 = rootAt(Jd.c - h), q1 = rootAt(Jd.c + h); vx = (q1.x - q0.x) / (2 * h); vz = (q1.z - q0.z) / (2 * h); vJ = Math.max(vJ, Math.hypot(vx, vz)); rJ = rootAt(cJ); }
          var dist = Math.hypot(rJ.x - P.O.x, rJ.z - P.O.z), ACC = preC('PRE_ACC');
          var D = Math.max(0.6, P.markD - 0.11 - dist), Tn = D / vJ + ACC / 2;
          P.pre = { T: Tn, D: D, vJ: vJ, cJ: cJ, c0: cJ - Tn, footJ: J.foot, rootJ: [rJ.x, rJ.z], dir: [vx / vJ, vz / vJ], markD: P.markD, join: P.join };
          P.dirV = V(vx / vJ, 0, vz / vJ); P.leftV = V(P.dirV.z, 0, -P.dirV.x); P.rootJV = V(rJ.x, 0, rJ.z);
          P.markV = P.rootJV.clone().addScaledVector(P.dirV, -D); P.mark = [P.markV.x, P.markV.z];
          P.face = P.faceWorld = Math.atan2(P.dirV.x, P.dirV.z);
          // the gaits (the walk, the jog, the run: the run only ever as a share of the jog's)
          P.gaits = { walk: gaitOf(R, P.walkClip) || gaitOf(R, 'walkHeavy') || gaitOf(R, 'walk'), jog: gaitOf(R, 'jog'), run: gaitOf(R, 'run') || gaitOf(R, 'sprint') };
          timeline();
        }
        // K's timeline when it has been handed over for this join (R: taker.timeline(tk.pre)), else the same formula
        function timeline() {
          var K = P.K, cJ = P.pre.cJ, tl = TL && Math.abs(TL.cJ - cJ) < 1e-6 && TL.steps ? TL : localPre(K, P.pre.T, P.join);
          if (typeof tl.frac !== 'function' || typeof tl.speedK !== 'function') { var lp = localPre(K, tl.T || P.pre.T, P.join); tl = Object.assign({}, lp, tl, { frac: lp.frac, speedK: lp.speedK }); }
          P.tl = tl; P.pre.c0 = tl.c0;
          var STEP = tl.STEP || preC('PRE_STEP'), S = (tl.steps || []).map(function (s) { return { f: s[0], c: +s[1], pre: true }; });
          S.push({ f: tl.footJ, c: tl.cJ, join: true });
          S.push({ f: other(tl.footJ), c: tl.cJ + STEP, virt: true });
          // (one step before the first: a full STEP back, or, when the first footfall is further than that from c0, at
          // c0, so the first swing stretches over the gap and no footfall is invented)
          var back = Math.max(STEP, S[0].c - tl.c0 + 0.02);
          S.unshift({ f: other(S[0].f), c: S[0].c - back, virt: true });
          P.PS = S;
          spots();
        }
        // the root's path in the prefix: on the turf, from the mark along the run direction, K's distance share at c
        function pathAt(c, out) { return (out || V()).copy(P.markV).addScaledVector(P.dirV, P.pre.D * P.tl.frac(c)); }
        // the gait phase at c: j (the step just landed in P.PS), u in [0, 1) toward the next
        function phaseAt(c) {
          var S = P.PS, j = 0; while (j < S.length - 2 && S[j + 1].c <= c) j++;
          return { j: j, u: clampN((c - S[j].c) / Math.max(1e-4, S[j + 1].c - S[j].c), 0, 1), f: S[j].f };
        }
        function cAt(ph) { var S = P.PS, j = clampN(Math.floor(ph), 0, S.length - 2); return S[j].c + (ph - j) * (S[j + 1].c - S[j].c); }
        // the set pose: the kick's start frame stood on the mark (or wherever pos is), facing the run-up's way
        function setLayer(w, pos) { return lay(P.name, P.K.start, w, frameAt(pos || P.markV, P.face - P.faceLocal)); }
        // a foot's spot as the rocker reads it: where its heel touches when flat (H) and the way it points (yaw), from
        // the foot as the rig holds it now (the set pose's feet, the kick's planted foot at the crossfade)
        function spotOf(side, bias) {
          var fb = bone(R, 'foot_' + side), q = debias(fb.getWorldQuaternion(Q()), side, bias != null ? bias : P.pins ? P.pins.bias[side] : 0), pa = fb.getWorldPosition(V());
          var z = V(0, 0, 1).applyQuaternion(q), yaw = Math.atan2(z.x, z.z), li = 0, lo = 9, p = V();
          for (var i = 0; i < 3; i++) { p.copy(R.sole[i]).multiplyScalar(R.scale).applyQuaternion(q).add(pa); if (p.y < lo) { lo = p.y; li = i; } }
          p.copy(R.sole[li]).multiplyScalar(R.scale).applyQuaternion(q).add(pa);
          var dzh = (R.sole[li].z - R.sole[0].z) * R.scale;
          return { H: [p.x - Math.sin(yaw) * dzh, p.z - Math.cos(yaw) * dzh], yaw: yaw };
        }
        // the spots, once a plan: the set pose's two feet; each prefix footfall where the gait itself lands it at real
        // pace (rate 1: stride-matched by construction; never moved by the heat or the rate, so a planted foot never
        // slides); the last one before the join where the kick's own stance foot is down at the crossfade (D1: no slide
        // through the blend)
        function spots() {
          var K = P.K, tl = P.tl;
          placeCarrier(P.psiBase); pose(R, [setLayer(1)]);
          P.setSpot = { L: spotOf('L'), R: spotOf('R') };
          var S = P.PS, cx = tl.cJ - P.xf, lastPre = -1, forced = null, j;
          for (j = 0; j < S.length; j++) if (S[j].pre) lastPre = j;
          if (lastPre >= 0) {
            var fL = S[lastPre].f, ks = (K.stance || []).filter(function (s) { return s[0] === fL && s[1] <= cx + 1e-6 && s[2] > cx; })[0];
            if (ks) { kickPose({ c: cx, hang: 0 }); forced = spotOf(fL); }
          }
          P.forced = forced ? lastPre : -1;
          for (j = 0; j < S.length; j++) {
            if (!S[j].pre) continue;
            if (j === lastPre && forced) { S[j].sp = forced; continue; }
            var skj = tl.speedK(S[j].c), bj = biasOf(gaitW(P.pre.vJ * skj), skj);
            prefixPose(S[j].c, 1, 0.5, 0, 0, true); S[j].sp = spotOf(S[j].f, bj[S[j].f]);
          }
          // (a planted foot lifts, at the latest, once the hips are BEHIND past the ball of it: further back the leg no
          // longer reaches it)
          P.setSpot.L.cut = cutOf(P.setSpot.L, tl.c0); P.setSpot.R.cut = cutOf(P.setSpot.R, tl.c0);
          for (j = 0; j < S.length; j++) if (S[j].pre) S[j].sp.cut = cutOf(S[j].sp, S[j].c);
        }
        var BEHIND = 0.24;
        function cutOf(sp, c1) {
          var bz = (R.sole[1].z - R.sole[0].z) * R.scale, bx = sp.H[0] + Math.sin(sp.yaw) * bz, bzz = sp.H[1] + Math.cos(sp.yaw) * bz, pp = V();
          function back(c) { pathAt(c, pp); return (pp.x - bx) * P.dirV.x + (pp.z - bzz) * P.dirV.z; }
          var a = c1, b = P.tl.cJ; if (back(b) < BEHIND * R.k) return Infinity; if (back(a) >= BEHIND * R.k) return a;
          for (var i = 0; i < 40; i++) { var m = (a + b) / 2; if (back(m) < BEHIND * R.k) a = m; else b = m; }
          return a;
        }
        // the walk: from (4.5 m behind the ball) to a spot behind it, a look at it, back to the mark facing it, a turn
        // to the run-up's way, a settle into the set pose. spec (the director's walkTo): { from: [x, z], ball: [x, z] (the
        // spot it walks to), speed, to, look, back, turn, settle }. The walk back is never faster than 1.6 m/s: the mark
        // is 4.75 m back now, so `back` grows to fit it (N7)
        function setWalk(spec) {
          spec = spec || {};
          var ball = P.ball, from = spec.from || [ball[0] - 0.2, ball[2] + 4.5], to = spec.ball || [ball[0], ball[2] + 0.55];
          var W = { S: V(from[0], 0, from[1]), B: V(to[0], 0, to[1]), M: P.markV.clone() };
          ['to', 'look', 'back', 'turn', 'settle'].forEach(function (k) { W[k] = spec[k] != null && isFinite(spec[k]) ? +spec[k] : WALK0[k]; });
          W.D1 = W.S.distanceTo(W.B); W.v = W.D1 / Math.max(0.5, W.to - 0.45); W.D2 = W.B.distanceTo(W.M);
          W.back = Math.max(W.back, W.D2 / 1.6 + 0.3); W.vB = W.D2 / Math.max(0.4, W.back - 0.3);
          W.t1 = W.to; W.t2 = W.t1 + W.look; W.t3 = W.t2 + W.back; W.t4 = W.t3 + W.turn; W.total = W.t4 + W.settle;
          P.walk = W;
        }
        // the run-up turned toward the aim about the ball's back point (design §4.6), over P.yaw = [a, b]: by default the
        // last stride's flight (no foot down, so no planted foot is dragged round; a whole-run turn moves a foot 2.4 m
        // out by 20 cm and more), else (yawWin 'run') from the join to the plant
        function psi(c) { return P.psiBase + P.dAim * sstep(P.yaw[0], P.yaw[1], c); }
        // the toes brought down by b (radians) about the foot's own level side axis
        function debias(q, side, b) {
          if (!b) return q;
          var toe = _w4.copy(R.toe[side]).applyQuaternion(q).normalize(), hx = toe.x, hz = toe.z, hl = Math.hypot(hx, hz);
          if (hl < 1e-6) return q;
          var p = Math.asin(clampN(toe.y, -1, 1)) - b;
          return q.premultiply(_q3.setFromUnitVectors(toe, _w3.set(hx / hl * Math.cos(p), Math.sin(p), hz / hl * Math.cos(p))));
        }
        // Per clip (and this body), once: every stance's correction, frame by frame, in the clip's own frame. The
        // retarget stands every CMU clip on this rig with its toes up 10-30 degrees (lane A, footPitchStand): that bias,
        // read off the clip's first frame, comes out of a planted foot; the foot is then pinned where its lowest sole
        // point (heel, ball or toe, whichever is down) touched, so the capture's own heel skate goes, and that point sits
        // on the turf. -> { bias: { L, R }, list: [{ f0, offs: [[dx, dz, dy] per output frame] }] }
        function pinsOf(name, K, st, pl) {
          R.pins = R.pins || {}; if (R.pins[name]) return R.pins[name];
          var C = R.C[name], fps = C.fps, out = { bias: {}, list: [] };
          R.model.position.copy(R.model0); R.carrier.position.set(0, 0, 0); R.carrier.rotation.set(0, 0, 0); R.carrier.updateMatrixWorld(true);
          pose(R, [{ name: name, t: K.start, w: 1 }]);
          ['L', 'R'].forEach(function (sd) { var q = bone(R, 'foot_' + sd).getWorldQuaternion(Q()), toe = R.toe[sd].clone().applyQuaternion(q); out.bias[sd] = clampN(Math.asin(clampN(toe.y, -1, 1)) - R.toeRestPitch, 0, 0.6); });
          var P3 = V();
          st.forEach(function (s) {
            var d1 = s[2], f0 = Math.ceil(s[1] * fps - 1e-6), f1 = Math.min(Math.floor(C.dur * fps + 1e-6), Math.floor(d1 * fps + 1e-6) + 3);
            var offs = [], pin = null, pi = -1, cur = [0, 0, 0], fb = bone(R, 'foot_' + s[0]);
            for (var f = f0; f <= f1; f++) {
              pose(R, [{ name: name, t: f / fps, w: 1 }]);
              var pa = fb.getWorldPosition(V()), q = debias(fb.getWorldQuaternion(Q()), s[0], out.bias[s[0]]), lo = 9, li = 0, lp = null;
              for (var i = 0; i < 3; i++) { P3.copy(R.sole[i]).multiplyScalar(R.scale).applyQuaternion(q).add(pa); if (P3.y < lo) { lo = P3.y; li = i; lp = P3.clone(); } }
              if (li !== pi) { pin = [lp.x + cur[0], lp.z + cur[1]]; pi = li; }
              cur = [pin[0] - lp.x, pin[1] - lp.z, FLOOR - lp.y, li];
              offs.push(cur);
            }
            out.list.push({ f0: f0, offs: offs });
          });
          return (R.pins[name] = out);
        }
        function pinAt(k, c) {
          var E = P.pins && P.pins.list[k]; if (!E || !E.offs.length) return null;
          var x = clampN(c * P.fps - E.f0, 0, E.offs.length - 1), i = Math.floor(x), j = Math.min(E.offs.length - 1, i + 1), u = x - i, a = E.offs[i], b = E.offs[j];
          return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, u < 0.5 ? a[3] : b[3]];
        }
        // the drawing is done with the carrier on O (the ball's back point), turned by psi; then the carrier moves under
        // the body and the model back by as much (follow), so the director's carrier-based reads (the camera's look at
        // the taker, the lens rule) find the body, and the picture is the same
        function placeCarrier(yaw) { R.model.position.copy(R.model0); R.carrier.position.copy(P.O); R.carrier.rotation.set(0, yaw, 0); R.carrier.updateMatrixWorld(true); }
        function follow() {
          var r = R.root.getWorldPosition(_w1), yaw = R.carrier.rotation.y, C = _w2.set(r.x, 0, r.z);
          var off = _w3.copy(P.O).sub(C).applyAxisAngle(UPV, -yaw);
          R.carrier.position.copy(C); R.model.position.set(R.model0.x + off.x, R.model0.y, R.model0.z + off.z);
          R.carrier.updateMatrixWorld(true);
        }
        // an in-place clip's layer frame: its root over world point Wp facing world yaw th, in the carrier (at O, psiBase)
        function frameAt(Wp, th) { var l = _w1.copy(Wp).sub(P.O).applyAxisAngle(UPV, -P.psiBase); return { yaw: wrapA(th - P.psiBase), off: [l.x, l.z] }; }
        function lay(name, t, w, fr) { return { name: name, t: t, w: w, pin: true, yaw: fr.yaw, off: fr.off }; }
        // trapezoid speed profile: distance along a leg of D metres at cruise v, ramps ta in and td out
        function trap(t, D, v, ta, td) {
          var tt = D / v + (ta + td) / 2;
          if (t <= 0) return [0, 0]; if (t >= tt) return [D, 0];
          if (t < ta) return [v * t * t / (2 * ta), v * t / ta];
          if (t > tt - td) { var r = tt - t; return [D - v * r * r / (2 * td), v * r / td]; }
          return [v * (ta / 2 + (t - ta)), v];
        }
        // ----- the walk, as a pure function of the time into it
        function walkLayers(t) {
          var W = P.walk, ballV = V(P.ball[0], 0, P.ball[2]), out = [], pos = V(), th, sp = 0, idleT = t;
          var walkC = R.C.walk, backC = R.C.walkBack;
          if (t < W.t1) {
            var a = trap(t, W.D1, W.v, 0.2, 0.25); pos.copy(W.S).lerp(W.B, a[0] / Math.max(1e-3, W.D1)); sp = a[1];
            th = Math.atan2(W.B.x - W.S.x, W.B.z - W.S.z);
            var fr = frameAt(pos, th), ww = sstep(0.05, 0.9, sp / W.v);
            if (walkC) out.push(lay('walk', a[0] / ((walkC.meta.speed || 1.39) * R.k), ww, fr));
            out.push(lay('idle', idleT, 1 - (walkC ? ww : 0), fr));
            return { layers: out, look: ballV, lookW: sstep(W.t1 - 1.2, W.t1 - 0.2, t) };
          }
          if (t < W.t2) { th = Math.atan2(ballV.x - W.B.x, ballV.z - W.B.z); return { layers: [lay('idle', idleT, 1, frameAt(W.B, th))], look: ballV, lookW: 1, bow: sstep(W.t1, W.t1 + 0.3, t) * (1 - sstep(W.t2 - 0.25, W.t2, t)) }; }
          if (t < W.t3) {
            var b = trap(t - W.t2, W.D2, W.vB, 0.3, 0.3); pos.copy(W.B).lerp(W.M, b[0] / Math.max(1e-3, W.D2)); sp = b[1];
            th = Math.atan2(ballV.x - pos.x, ballV.z - pos.z);
            var fr2 = frameAt(pos, th), wb = sstep(0.05, 0.8, sp / W.vB);
            if (backC) out.push(lay('walkBack', b[0] / ((backC.meta.speed || 1.84) * R.k), wb, fr2));
            out.push(lay('idle', idleT, 1 - (backC ? wb : 0), fr2));
            return { layers: out, look: ballV, lookW: 0.7 };
          }
          var th0 = Math.atan2(ballV.x - W.M.x, ballV.z - W.M.z), th1 = P.faceWorld;
          th = th0 + wrapA(th1 - th0) * sstep(W.t3, W.t4, t);
          var fr3 = frameAt(W.M, th), wk = sstep(W.t4, W.total, t);
          out.push(lay('idle', idleT, 1 - wk, fr3));
          if (wk > 0) out.push(setLayer(wk, W.M));
          return { layers: out, look: ballV, lookW: 0.5 };
        }
        // ----- the kick: clip time c (the brain's, warped), its plant and stance locks, the snap, the tells
        function lockFoot(side, wLock, delta, tellYaw, shift, pin, yawLock) {
          // the foot as the clip has it now, turned about O by delta (the carrier's yaw frozen at the touchdown): the
          // slide a turning carrier gives a planted foot is taken out, the clip's own heel and toe roll kept; then the
          // clip's correction for this moment of the stance (pin: the toes' bias out, the contact point held, on the turf)
          var fb = bone(R, 'foot_' + side), knee = bone(R, 'lowerleg01_' + side);
          var pa = fb.getWorldPosition(_w1), qa = fb.getWorldQuaternion(_q1);
          var tgt = _w2.copy(pa).sub(P.O).applyAxisAngle(UPV, delta).add(P.O), tq = _q2.setFromAxisAngle(UPV, delta).multiply(qa);
          if (pin) {
            debias(tq, side, P.pins.bias[side]);
            var cy = Math.cos(yawLock), sy = Math.sin(yawLock);
            tgt.x += pin[0] * cy + pin[1] * sy; tgt.z += -pin[0] * sy + pin[1] * cy; tgt.y += pin[2];
          }
          if (tellYaw) tq.premultiply(_q3.setFromAxisAngle(UPV, tellYaw));
          if (shift) tgt.add(shift);
          tgt.lerp(pa, 1 - wLock); tq.slerp(qa, 1 - wLock);
          var tqs = tq.clone(), want = pin ? R.sole[pin[3]].clone().multiplyScalar(R.scale).applyQuaternion(tqs).add(tgt) : null;
          legTo(R, side, tgt, knee.getWorldPosition(_w3));
          setWorldQ(fb, tqs);
          // a leg at full stretch leaves the ankle short: the foot rolls on it so the pinned point (a toe pushing off,
          // a heel striking) still reaches its spot, as a real foot does
          if (want) { var at = fb.localToWorld(R.sole[pin[3]].clone()); if (at.distanceToSquared(want) > 4e-6) aim(fb, at, want); }
        }
        // The prefix's planted feet (a rocker, with no history, so a replay draws the same): the foot keeps the clip's
        // own heel-to-toe roll (its retarget toe-up taken out), turned to its spot's yaw, and rests on whichever sole point
        // is lowest, that point placed where it touches when the foot rolls over the spot without slipping (the heel at
        // H; the ball and the toe ahead of it by their own distance along the sole). heelUp (radians) raises the heel
        // about the ball first: the bounce on the toes at the mark.
        var _ra = V(), _rb = V(), _rc = V(), _rd = V(), _pp = V(), _rq = Q(), _rq2 = Q(), _rq3 = Q();
        // the rocker's target for a foot whose clip orientation is qa (world): out.q, out.ankle, out.li, out.at (the contact)
        function rockAim(side, qa, sp, heelUp, lift, out, bias) {
          var sc = R.scale, q = debias(out.q.copy(qa), side, bias != null ? bias : P.pins ? P.pins.bias[side] : 0);
          _rc.set(0, 0, 1).applyQuaternion(q); q.premultiply(_rq3.setFromAxisAngle(UPV, wrapA(sp.yaw - Math.atan2(_rc.x, _rc.z))));
          var cy = Math.cos(sp.yaw), sy = Math.sin(sp.yaw), li = 0, lo = 9;
          if (heelUp > 0) q.premultiply(_rq3.setFromAxisAngle(_rc.set(cy, 0, -sy), heelUp));
          for (var i = 0; i < 3; i++) { _rd.copy(R.sole[i]).multiplyScalar(sc).applyQuaternion(q); if (_rd.y < lo) { lo = _rd.y; li = i; } }
          var dz = (R.sole[li].z - R.sole[0].z) * sc;
          out.at.set(sp.H[0] + sy * dz, FLOOR + (lift > 0 ? lift : 0), sp.H[1] + cy * dz);
          _rd.copy(R.sole[li]).multiplyScalar(sc).applyQuaternion(q);
          out.ankle.copy(out.at).sub(_rd); out.li = li;
          return out;
        }
        var RA = { q: Q(), ankle: V(), at: V(), li: 0 }, RB = { q: Q(), ankle: V(), at: V(), li: 0 };
        // one foot planted by its stance entry e ({ sp, lw: down and turned, lwh: held over its spot, lift, out, rel }):
        // D (a steer) moves the clip's own foot by that much, scaled by lwh, so it lands on its spot as it comes in
        // rather than being pulled ahead of its own swing
        function rock(side, e, heelUp, D) {
          var fb = bone(R, 'foot_' + side), knee = bone(R, 'lowerleg01_' + side);
          var pa = _ra.copy(fb.getWorldPosition(_rb)), qa = fb.getWorldQuaternion(_rq);
          rockAim(side, qa, e.sp, heelUp, e.lift, RA, PB.bias ? PB.bias[side] : null);
          var lw = e.lw, lwh = e.lwh;
          // (leaving: the swing carries the foot on from its spot once the clip's own foot is level with it or ahead;
          // never back along the turf toward where the clip's foot trails)
          if (e.out) { var ah = (pa.x - RA.ankle.x) * Math.sin(P.face) + (pa.z - RA.ankle.z) * Math.cos(P.face); lwh *= 1 - Math.max(e.rel * sstep(-0.06, 0.02, ah), e.cap); }
          var tgt = _rb.copy(pa);
          // (coming in: the clip's own foot carried by the steer, held over its spot as it is put down)
          if (D) { tgt.x += (D.x * lwh) * (1 - lw) + (RA.ankle.x - pa.x) * lw; tgt.z += (D.z * lwh) * (1 - lw) + (RA.ankle.z - pa.z) * lw; }
          else { tgt.x += (RA.ankle.x - pa.x) * lwh; tgt.z += (RA.ankle.z - pa.z) * lwh; }
          tgt.y += (RA.ankle.y - pa.y) * lw;
          var tq = qa.clone().slerp(RA.q, lw);
          legTo(R, side, tgt, knee.getWorldPosition(_rc));
          setWorldQ(fb, tq);
          if (lw > 0.999 && lwh > 0.999) { var at = fb.localToWorld(_rc.copy(R.sole[RA.li])); if (at.distanceToSquared(RA.at) > 4e-6) aim(fb, at, RA.at); }
        }
        // the gait's weights at a real speed v (m/s): the walk giving way to the jog, the jog taking some run as it
        // charges; the heat never moves a foot (the spots are fixed), so these are posture only
        function gaitW(v) {
          var G = P.gaits, j = G.jog ? clampN(PRE_K.jog0 + (1 - PRE_K.jog0) * sstep(PRE_K.jogV[0], PRE_K.jogV[1], v), 0, 1) : 0;
          if (!G.walk) j = G.jog ? 1 : 0;
          var r = G.run && j > 0 ? PRE_K.runK * sstep(PRE_K.runV[0], PRE_K.runV[1], v) : 0;
          return { walk: G.walk ? 1 - j : 0, jog: j * (1 - r), run: j * r };
        }
        // a stance's length in steps under these weights (a walk's foot stays down past the other's touchdown)
        // (never past the other foot's touchdown and a little: a walk's long stance at the jog's stride leaves the
        // trailing leg too short to reach its spot)
        function offOf(w, f) { var G = P.gaits, s = 0, n = 0; ['walk', 'jog', 'run'].forEach(function (k) { if (G[k] && w[k] > 0) { s += w[k] * G[k].off[f]; n += w[k]; } }); return n > 0 ? Math.min(1.04, s / n) : 0.7; }
        // the prefix's stances at c under these weights: [{ f, lw, sp }]
        var OUT = 0.10, ARC = 0.09;
        function stancesAt(c, w) {
          var S = P.PS, out = [], tl = P.tl, j;
          // the set pose's two feet: the first to step swings from its set spot to its first footfall on an arc (the
          // set pose's weight early in the ramp would otherwise drag it along the turf); the other stays to push off as
          // the first lands
          var f1 = S[1].f, f2 = other(f1), s1 = P.setSpot[f1], s2 = P.setSpot[f2];
          var l2 = Math.min(clampN(cAt(offOf(w, f2)), S[1].c + 0.03, S[2] ? S[2].c - 0.15 : tl.cJ), s2.cut);
          if (S[1].pre && c < S[1].c) {
            var a0 = tl.c0 + 0.04, u = clampN((c - a0) / Math.max(0.05, S[1].c - a0), 0, 1), e = sstep(0, 1, u), sp1 = S[1].sp;
            var sn = Math.sin(PI * u);
            out.push({ f: f1, lw: 1, lwh: 1, on: S[1].c, sp: { H: [s1.H[0] + (sp1.H[0] - s1.H[0]) * e, s1.H[1] + (sp1.H[1] - s1.H[1]) * e], yaw: s1.yaw + wrapA(sp1.yaw - s1.yaw) * e }, lift: ARC * R.k * sn * sn });
          } else if (!S[1].pre) out.push(outOf({ f: f1, lw: 1, lwh: 1, on: -1e9, sp: s1 }, tl.c0 + 0.06, c));
          out.push(outOf({ f: f2, lw: 1, lwh: 1, on: -1e9, sp: s2 }, l2, c));
          for (j = 0; j < S.length; j++) {
            if (!S[j].pre) continue;
            // (in: the foot steered over its spot through the last of its swing, then put down; out: see outOf)
            var on = S[j].c, forced = j === P.forced, first = j === 1 && S[1].pre;
            var e2 = { f: S[j].f, lw: first && c >= on ? 1 : sstep(on - 0.045, on, c), lwh: first && c >= on ? 1 : sstep(on - 0.25, on - 0.02, c), sp: S[j].sp, on: on, steer: c < on && !first };
            out.push(forced ? e2 : outOf(e2, Math.min(cAt(j + offOf(w, S[j].f)), S[j].sp.cut), c));
          }
          return out;
        }
        // a stance's end: the foot comes up off its spot first, then lets go of it over the ground, never back along
        // the turf toward where the clip's own foot trails (rock: release by `ahead`)
        function outOf(e, off, c) {
          if (c > off) { e.lw *= 1 - sstep(off, off + 0.06, c); e.rel = sstep(off + 0.02, off + 0.2, c); e.cap = sstep(off + 0.1, off + 0.3, c); e.out = true; }
          return e;
        }
        // The prefix at clip time c (c0 <= c < cJ): the root on its path, the gait phase-synced to K's footfalls (each
        // clip's own touchdowns put on them), blended in from the set pose by K's speed ramp; heat leans him into it and
        // drives the arms (the run's, over the upper body); every footfall planted on its spot
        function prefixPose(c, rate, heat, bounce, bt, free) {
          if (!free && !T.prefix.noLock) prefixPlan(c, rate, heat);
          var tl = P.tl, sk = tl.speedK(c), H = clampN(heat || 0, 0, 1), rt = rate > 0 ? rate : 1;
          var v = P.pre.vJ * rt * sk, w = gaitW(v), ph = phaseAt(c), pos = pathAt(c, _pp), G = P.gaits, ls = [];
          placeCarrier(P.psiBase);
          var fr = frameAt(pos, P.face);
          ['walk', 'jog', 'run'].forEach(function (k) { if (G[k] && w[k] * sk > 1e-4) ls.push(lay(G[k].name, gaitT(G[k], ph.f, ph.u), w[k] * sk, fr)); });
          if (sk < 1) ls.push(setLayer(1 - sk, pos));
          var arm = (0.1 + 0.6 * H) * sk;
          if (G.run && arm > 1e-3) ls.push({ name: G.run.name, t: gaitT(G.run, ph.f, ph.u), w: arm, mask: 'upper' });
          pose(R, ls);
          // (the lean about his own left: the carrier faces the goal, he faces the run-up's way)
          var lean = (0.02 + 0.08 * H) * sk;
          if (lean > 0) { turn(bone(R, 'spine02'), P.leftV, lean * 0.6); turn(bone(R, 'spine01'), P.leftV, lean * 0.4); }
          // the bounce on the toes (set only): the hips up and down at 2.2 Hz, the heels with them, a little weight from
          // foot to foot
          var hu = { L: 0, R: 0 };
          if (bounce > 0) {
            var bt2 = bt || 0, bob = bounce * (0.5 - 0.5 * Math.cos(2 * PI * PRE_K.bounceHz * bt2)), sw = bounce * Math.sin(PI * PRE_K.bounceHz * bt2);
            var lv = _w3.copy(P.leftV).applyAxisAngle(UPV, -P.psiBase).multiplyScalar(0.012 * sw * R.k / R.scale);
            R.root.position.x += lv.x; R.root.position.z += lv.z; R.root.position.y += 0.0175 * bob * R.k / R.scale;
            R.model.updateMatrixWorld(true);
            var hb = Math.max(1e-3, (R.sole[2].z - R.sole[0].z) * R.scale);
            hu.L = Math.asin(clampN(0.024 * R.k * bob * (1 - 0.25 * sw) / hb, 0, 0.6)); hu.R = Math.asin(clampN(0.024 * R.k * bob * (1 + 0.25 * sw) / hb, 0, 0.6));
          }
          if (free || T.prefix.noLock) return;
          var best = PB.best;
          ['L', 'R'].forEach(function (f) { var e = best[f]; if (e) rock(f, e, hu[f], e.steer ? PB.D[f] : null); });
        }
        // before a prefix frame is posed: its stances (one entry a foot, the strongest: two only overlap where they meet
        // on the same spot, an arc's end and its footfall), and for a foot coming in, its steer: where the rocker will
        // hold it at its touchdown less where the clip has it then (the gait posed at the touchdown, same rate and heat)
        var PB = { best: { L: null, R: null }, D: { L: V(), R: V() }, bias: null };
        // the toe-up to take out of a planted foot: the gaits' own, by their weights, and the set pose's (the kick
        // clip's start frame) by what is left of it
        function biasOf(w, sk) {
          var G = P.gaits, out = {}, kb = P.pins ? P.pins.bias : { L: 0, R: 0 };
          ['L', 'R'].forEach(function (f) { var b = 0, n = 0; ['walk', 'jog', 'run'].forEach(function (k) { if (G[k] && w[k] > 0) { b += w[k] * G[k].bias[f]; n += w[k]; } }); out[f] = (n > 0 ? b / n : kb[f]) * sk + kb[f] * (1 - sk); });
          return out;
        }
        function prefixPlan(c, rate, heat) {
          var sk = P.tl.speedK(c), w = gaitW(P.pre.vJ * (rate > 0 ? rate : 1) * sk), st = stancesAt(c, w), best = PB.best;
          PB.bias = biasOf(w, sk);
          best.L = best.R = null;
          for (var i = 0; i < st.length; i++) {
            var e = st[i], m = Math.max(e.lw, e.lwh * (1 - (e.cap || 0))), b = best[e.f];
            if (m > 1e-6 && (!b || e.on > b.on + 1e-9 || (Math.abs(e.on - b.on) <= 1e-9 && m > b.m))) { e.m = m; best[e.f] = e; }
          }
          ['L', 'R'].forEach(function (f) {
            var e = best[f]; if (!e || !e.steer) return;
            var sk2 = P.tl.speedK(e.on), b2 = biasOf(gaitW(P.pre.vJ * (rate > 0 ? rate : 1) * sk2), sk2);
            prefixPose(e.on, rate, heat, 0, 0, true);
            var fb = bone(R, 'foot_' + f); rockAim(f, fb.getWorldQuaternion(_rq), e.sp, 0, 0, RB, b2[f]);
            PB.D[f].copy(RB.ankle).sub(fb.getWorldPosition(_rb));
          });
        }
        // the prefix crossfading into the kick clip over XF before the join, both feet held on the line between where
        // each draws them (the planted one is where both have it: its spot is the kick's own, D1)
        var CXA = null, CXB = null, FX = { L: [V(), Q(), V(), Q()], R: [V(), Q(), V(), Q()] };
        function feetTo(k) { ['L', 'R'].forEach(function (f) { var fb = bone(R, 'foot_' + f); fb.getWorldPosition(FX[f][k]); fb.getWorldQuaternion(FX[f][k + 1]); }); }
        function crossPose(c, st) {
          var tl = P.tl, w = sstep(tl.cJ - P.xf, tl.cJ, c);
          prefixPose(c, st.rate, st.heat, 0, 0); CXA = capture(R, CXA); feetTo(0);
          kickPose({ c: c, hang: 0, react: null, rate: st.rate, heat: st.heat }); CXB = capture(R, CXB); feetTo(2);
          blend(R, CXA, CXB, w);
          var pf = P.forced >= 0 ? P.PS[P.forced] : null;
          ['L', 'R'].forEach(function (f) {
            var F = FX[f], tq = _q2.copy(F[1]).slerp(F[3], w);
            if (pf && pf.f === f) return place(f, pf.sp, tq);
            legTo(R, f, _w2.copy(F[0]).lerp(F[2], w), bone(R, 'lowerleg01_' + f).getWorldPosition(_w3)); setWorldQ(bone(R, 'foot_' + f), tq);
          });
        }
        // a foot of world orientation q (already without its toe-up) rolled onto its spot: its lowest sole point where
        // the rocker puts it
        function place(side, sp, q) {
          var sc = R.scale, li = 0, lo = 9, cy = Math.cos(sp.yaw), sy = Math.sin(sp.yaw), fb = bone(R, 'foot_' + side);
          for (var i = 0; i < 3; i++) { _rd.copy(R.sole[i]).multiplyScalar(sc).applyQuaternion(q); if (_rd.y < lo) { lo = _rd.y; li = i; } }
          var dz = (R.sole[li].z - R.sole[0].z) * sc, wx = sp.H[0] + sy * dz, wz = sp.H[1] + cy * dz;
          _rd.copy(R.sole[li]).multiplyScalar(sc).applyQuaternion(q);
          var qq = q.clone();
          legTo(R, side, _rb.set(wx - _rd.x, FLOOR - _rd.y, wz - _rd.z), bone(R, 'lowerleg01_' + side).getWorldPosition(_rc));
          setWorldQ(fb, qq);
          var at = fb.localToWorld(_rc.copy(R.sole[li])), want = _rd.set(wx, FLOOR, wz); if (at.distanceToSquared(want) > 4e-6) aim(fb, at, want);
        }
        // the prefix's upper body over the kick clip from the crossfade's start to XU after the join, fading: masked
        // layers of the gait at its phase (walk, then the jog's share, then the run's), and the heat's lean
        var XU = 0.22, UO = { ls: [{ mask: 'upper' }, { mask: 'upper' }, { mask: 'upper' }], n: 0, lean: 0 };
        function upperOver(c, rate, heat) {
          var tl = P.tl; if (!tl || c < tl.cJ - P.xf || c >= tl.cJ + XU) return 0;
          var u = 0.85 * (1 - sstep(tl.cJ - P.xf, tl.cJ + XU, c)); if (!(u > 1e-3)) return 0;
          var H = clampN(heat || 0, 0, 1), w = gaitW(P.pre.vJ * (rate > 0 ? rate : 1)), ph = phaseAt(c), G = P.gaits, n = 0;
          function add(k, wt) { if (G[k] && wt > 1e-3) { var L = UO.ls[n++]; L.name = G[k].name; L.t = gaitT(G[k], ph.f, ph.u); L.w = wt; } }
          add('walk', w.walk > 0 ? u : 0);
          add('jog', w.walk > 0 ? u * (w.jog + w.run) : u);
          add('run', clampN(w.run / Math.max(1e-3, w.jog + w.run) + (0.1 + 0.6 * H) * 0.5, 0, 1) * u);
          UO.n = n; UO.lean = (0.02 + 0.08 * H) * u / 0.85;
          return n;
        }
        function kickPose(st) {
          var K = P.K, c = st.c, fps = P.fps, layers = [{ name: P.name, t: Math.min(c, R.C[P.name].dur), w: 1 }];
          var rx = st.react, rw = 0, rname = null;
          if (rx && rx.kind) {
            // after the follow-through: a goal, a cheer; anything else, hands to the head
            rw = sstep(0, 0.35, rx.t || 0) * sstep(K.contact + 0.45, K.contact + 0.75, c);
            rname = rx.kind === 'goal' ? (R.C.fbCheer ? 'fbCheer' : R.C.cheer ? 'cheer' : null) : (R.C.fbUpset ? 'fbUpset' : null);
            if (rname && rw > 0) {
              // played on where the kick ended: the reaction's root over the kick's last root, facing its way
              var C = R.C[P.name], end = rootOf(R, C, { name: P.name }, C.dur, V()), qe = Q().fromArray(C.q.filter(function (q) { return q[0] === R.idx.root; })[0][1].evaluate(C.dur));
              var ef = V(0, 0, 1).applyQuaternion(qe);
              if (R.C[rname].meta.upper) layers.push({ name: rname, t: rx.t || 0, w: rw, mask: 'upper' });
              else { layers[0].w = 1 - rw; layers.push({ name: rname, t: rx.t || 0, w: rw, pin: true, yaw: Math.atan2(ef.x, ef.z), off: [end.x * R.scale, end.z * R.scale] }); }
            }
          }
          // (the run-up's arms and carriage carried into the clip's last stride and let go of by XU after the join: 11_01's
          // own approach is hunched, arms hanging, and a crossfade of XF alone reads as a slump; the legs are the clip's)
          var uo = st.rate != null ? upperOver(c, st.rate, st.heat) : 0;
          if (uo) for (var ui = 0; ui < UO.n; ui++) layers.push(UO.ls[ui]);
          placeCarrier(psi(c));
          pose(R, layers);
          if (uo && UO.lean > 0) { turn(bone(R, 'spine02'), P.leftV, UO.lean * 0.6); turn(bone(R, 'spine01'), P.leftV, UO.lean * 0.4); }
          // the tells (design §4.6 + critique #25): over the last stride, hips and shoulders turn toward the aim, the plant
          // foot lands turned 16 degrees that way, and the last stride is 5% longer (to the natural side) or shorter (8%
          // over-reaches 11_01's 1.73 m last stride: the plant leg lands straight, the foot short of the turf)
          var side = P.side, tw = P.tell * (P.prevStance ? sstep(P.prevStance[1], K.plant, c) : sstep(K.plant - 0.4, K.plant, c)) * (1 - sstep(K.contact + 0.1, K.contact + 0.45, c));
          if (side && tw > 0) {
            var turnA = -side * 10 * PI / 180 * tw;
            yawBone(R, 'spine04', turnA * 0.6); yawBone(R, 'spine02', turnA * 0.5);
          }
          // the hesitation (critique #23): the plant pose held, a small sway over it, never the whole body slowed
          if (st.hang > 0) {
            var hw = sstep(0, 0.1, st.hang), sw = Math.sin(st.hang * 2 * PI * 1.7) * 0.05 * hw;
            bend(R, 'spine03', V(0, 0, 1), sw); bend(R, 'spine01', V(1, 0, 0), 0.03 * hw);
          }
          // every stance locked where it lands, to its lift (40 ms in, 40 ms out): the plant through the strike to the
          // clip's own lift (11_01: contact + 0.175 s; the design's contact + 0.20 was the estimate of the same moment)
          for (var k = 0; k < P.stance.length; k++) {
            var s = P.stance[k], isPlant = s === P.plantStance, d0 = s[1], d1 = s[2];
            var lw = sstep(d0 - 0.04, d0, c) * (1 - sstep(d1, d1 + 0.04, c));
            // (with a tell the plant foot is steered for its last 0.25 s in the air, so it lands turned and placed)
            if (isPlant && side && P.tell) lw = Math.max(lw, sstep(d0 - 0.25, d0, c) * (1 - sstep(d1, d1 + 0.04, c)));
            if (!(lw > 0)) continue;
            var tLock = Math.ceil(d0 * fps - 1e-6) / fps, delta = c >= tLock ? psi(tLock) - psi(c) : 0;
            var ty = 0, shift = null;
            if (isPlant && side && P.tell) {
              ty = -side * 0.8 * 20 * PI / 180 * P.tell;
              // (longer to the natural side: a right-footer's left, world -x; shorter to the other)
              var nat = K.foot === 'L' ? 1 : -1;
              if (P.runDirLocal && P.stride) shift = P.runDirLocal.clone().applyAxisAngle(UPV, psi(tLock)).multiplyScalar((side === nat ? 1 : -1) * P.strideK * P.stride * P.tell);
            }
            lockFoot(s[0], lw, delta, ty, shift, P.pins ? pinAt(k, c) : null, psi(tLock));
          }
          // the kicking foot meets the ball's back over the last 2 frames, holds 1, lets go over 3; its toes come down
          // to the cap over the last 6 (a 40-degree turn in 2 frames would read as a snap)
          var f = 1 / 60, sw2 = sstep(K.contact - 2 * f, K.contact, c) * (1 - sstep(K.contact + f, K.contact + 4 * f, c));
          var sp2 = sstep(K.contact - 6 * f, K.contact, c) * (1 - sstep(K.contact + f, K.contact + 6 * f, c));
          T.snapInfo = null;
          if (sw2 > 0 || sp2 > 0) snapFoot(K.foot, sw2, sp2);
          if (rx && rx.kind && !rname && rw > 0) armsReact(rx.kind === 'goal' ? 'goal' : 'upset', rw);
        }
        function snapFoot(side, w, wPitch) {
          var fb = bone(R, 'foot_' + side), knee = bone(R, 'lowerleg01_' + side);
          var qa = fb.getWorldQuaternion(Q()), pa = fb.getWorldPosition(V());
          // the toes down to the cap (the clip's toe-up at contact is the eye-check risk the design names)
          var toe = R.toe[side].clone().applyQuaternion(qa).normalize(), pitch = Math.asin(clampN(toe.y, -1, 1)), rel = pitch - R.toeRestPitch, qb = qa.clone();
          if (rel > P.snap) {
            var h = V(toe.x, 0, toe.z).normalize(), np = pitch - (rel - P.snap);
            var want = V(h.x * Math.cos(np), Math.sin(np), h.z * Math.cos(np));
            qb.premultiply(Q().setFromUnitVectors(toe, want));
          }
          var qf = qa.clone().slerp(qb, wPitch);
          var sl = (P.K.strikeLocal ? V().fromArray(P.K.strikeLocal) : strikeLocalFor(side, R)).multiplyScalar(R.scale);
          var strike = sl.clone().applyQuaternion(qf).add(pa);
          // (snapY 1: to the ball's back at its centre's height; 0: the clip's own strike height, 16 cm on 11_01)
          var target = V(P.ball[0], P.ball[1], P.ball[2]).addScaledVector(P.shot, -0.11);
          target.y += (strike.y - target.y) * (1 - P.snapY);
          var before = strike.distanceTo(target);
          var ank = pa.clone().add(target.clone().sub(strike)).lerp(pa, 1 - w);
          legTo(R, side, ank, knee.getWorldPosition(V()));
          setWorldQ(fb, qf);
          var after = fb.localToWorld(sl.clone().divideScalar(R.scale)).distanceTo(target);
          T.snapInfo = { w: +w.toFixed(3), wPitch: +wPitch.toFixed(3), before: +before.toFixed(4), after: +after.toFixed(4), toeUpDeg: +(rel * 180 / PI).toFixed(1), capDeg: +(P.snap * 180 / PI).toFixed(1) };
        }
        // the reactions without their clips (the base cheer lives in human-moves-<g>, fbUpset in the football pack):
        // the arms by IK, over whatever the body does, faded in by w
        function armsReact(kind, w) {
          var A = capture(R), hd = bone(R, 'head'), k = R.k;
          var hp = hd.getWorldPosition(V()), q = R.root.getWorldQuaternion(Q());
          var left = V(1, 0, 0).applyQuaternion(q); left.y = 0; left.normalize();
          var fwd = V(0, 0, 1).applyQuaternion(q); fwd.y = 0; fwd.normalize();
          ['L', 'R'].forEach(function (sd) {
            var sx = sd === 'L' ? 1 : -1;
            if (kind === 'goal') armTo(R, sd, hp.clone().addScaledVector(UPV, 0.42 * k).addScaledVector(left, sx * 0.30 * k).addScaledVector(fwd, 0.06), hp.clone().addScaledVector(UPV, 0.02).addScaledVector(left, sx * 0.42 * k).addScaledVector(fwd, -0.12));
            else armTo(R, sd, hp.clone().addScaledVector(UPV, 0.10 * k).addScaledVector(left, sx * 0.085 * k).addScaledVector(fwd, 0.01), hp.clone().addScaledVector(UPV, 0.02 * k).addScaledVector(left, sx * 0.40 * k).addScaledVector(fwd, 0.04));
          });
          blend(R, A, capture(R), w);
        }
        // the set pose's feet planted on their spots, by w: the settle into set (the end of the walk, a cut to the mark)
        function standLocks(w) { PB.bias = null; if (!(w > 0) || !P.setSpot) return; rock('L', { sp: P.setSpot.L, lw: w, lwh: w }, 0); rock('R', { sp: P.setSpot.R, lw: w, lwh: w }, 0); }
        // ----- the pure form: st = { mode: 'walk'|'mark'|'set'|'kick', t, settle, c, rate, hang, react: { kind, t }, look,
        //       heat (0..1: the run-up's posture), bounce (0..1: on his toes at the mark; in a kick state with bt, the
        //       set's bounce clock carried on, it is faded out over the first steps) }
        function applyState(st, alpha) {
          var c = st.c, H = o.H || 1 / 120;
          if (st.mode === 'kick' && alpha > 0 && st.rate) c += alpha * H * st.rate;
          var lookAt = st.look ? V().fromArray(st.look) : V(0, 1.2, P.gz), lookW = 0.6, bow = 0, settle = st.settle == null ? 0.8 : st.settle;
          if (st.mode === 'walk' && st.t < P.walk.total) {
            placeCarrier(P.psiBase);
            var wl = walkLayers(st.t); pose(R, wl.layers);
            standLocks(sstep(P.walk.t4, P.walk.total, st.t));
            lookAt = wl.look.clone(); lookW = wl.lookW; bow = wl.bow || 0;
          } else if (st.mode === 'mark' && st.t < settle) {
            placeCarrier(P.psiBase);
            var wk = sstep(settle - 0.3, settle, st.t), ls = [lay('idle', st.t, 1 - wk, frameAt(P.markV, P.faceWorld))];
            if (wk > 0) ls.push(setLayer(wk));
            pose(R, ls); standLocks(wk);
          } else if (st.mode === 'kick') {
            var tl = P.tl, cc = Math.max(+c || 0, tl.c0);
            // (bounce/bt in a kick state: the toes' bounce let go of over the first steps, when the director carries the
            // set's bounce clock on, so the first tap does not drop the heels at once)
            if (cc < tl.cJ - P.xf) prefixPose(cc, st.rate, st.heat, st.bounce > 0 ? clampN(+st.bounce, 0, 1) : 0, st.bt || 0);
            else if (cc < tl.cJ) crossPose(cc, st);
            else kickPose({ c: cc, hang: st.hang || 0, react: st.react, rate: st.rate, heat: st.heat });
            lookW = 0.5 * (1 - sstep(P.K.start, P.K.plant - 0.3, cc));
            if (st.react && st.react.kind) lookW = 0;
            c = cc;
          } else {
            // set (and a walk or a settle run out): the set pose on the mark, its feet planted, on his toes (bounce),
            // breathing, eyes on the keeper
            prefixPose(P.tl.c0, 0, 0, st.bounce == null ? 0 : clampN(+st.bounce || 0, 0, 1), st.t || 0); lookW = 0.5;
            var br = Math.sin((st.t || 0) * 2 * PI * 0.28);
            turn(bone(R, 'spine02'), P.leftV, -0.012 * br); turn(bone(R, 'spine01'), P.leftV, -0.01 * br);
          }
          if (bow > 0) { bend(R, 'spine02', V(1, 0, 0), 0.16 * bow); bend(R, 'spine01', V(1, 0, 0), 0.08 * bow); }
          if (lookW > 0) look(R, lookAt, lookW);
          follow();
          last = { mode: st.mode, t: st.t, settle: st.settle, c: c, hang: st.hang || 0, rate: st.rate, heat: st.heat || 0, bounce: st.bounce || 0, react: st.react ? { kind: st.react.kind, t: st.react.t } : null };
        }
        // ----- one call a frame. The pure form, apply(st, alpha) with st.mode set (the director, the lab, a replay drawn
        // from recorded state); or the older director's form, apply(tk, alpha, { phase, t, dt }), tk its view of the
        // brain's clip time ({ c (interpolated already), rate, hang?, heat?, released, replay }) while the kick is on
        T.apply = function (a, alpha, ctx) {
          if (!P || !P.K) return;
          if (a && a.mode) return applyState(a, alpha);
          ctx = ctx || {}; var dt = ctx.dt > 0 ? ctx.dt : 0; clock += dt;
          if (RX) RX.t += dt;
          if (a && a.c != null) {
            // the hang: the brain's own count when it gives one; else the clip held at the plant before a release
            if (a.hang != null) hangT = a.hang; else if (a.rate === 0 && !a.released && a.c >= P.K.plant - 1e-3) hangT += dt; else hangT = 0;
            return applyState({ mode: 'kick', c: a.c, rate: a.rate, heat: a.heat, hang: hangT, react: ctx.phase === 'replay' ? null : RX }, 0);
          }
          hangT = 0;
          if (ctx.phase === 'walk') return applyState(MODE.name === 'walk' ? { mode: 'walk', t: ctx.t || 0 } : { mode: 'mark', t: ctx.t || 0, settle: MODE.settle }, 0);
          return applyState({ mode: 'set', t: clock, bounce: 1 }, 0);
        };
        // K's prefix timeline (tk.pre: c0, cJ, T, TACC, STEP, footJ, steps, frac, speedK), handed over once TK is made
        // (the director: plan, rec.preT = P.pre.T, TK, then this). The footfalls are K's: Ma draws them, never times them.
        T.timeline = function (pre) {
          if (!pre || !(pre.cJ > pre.c0)) return null;
          TL = pre; if (P && P.K && P.pre) timeline();
          return P && P.pre;
        };
        // the director's calls between frames: the first walk (with its script), a cut to the mark (a retry, settle 0.8
        // s; an abort or the demo, 0), the outcome's reaction. A number instead of a spec draws that moment at once.
        T.walkTo = function (spec) { if (typeof spec === 'number') return applyState({ mode: 'walk', t: spec }, 0); MODE = { name: 'walk' }; RX = null; WSPEC = spec || null; if (P && P.K) setWalk(WSPEC); };
        T.mark = function (spec) { if (typeof spec === 'number') return applyState({ mode: 'mark', t: spec }, 0); MODE = { name: 'mark', settle: spec && spec.settle != null ? +spec.settle : 0.8 }; RX = null; };
        T.react = function (kind) { RX = kind ? { kind: kind === 'saved' ? 'save' : kind, t: 0 } : null; return RX; };
        T.state = function () { return last; };
        T.info = function () { return P; };
        // (the checks' view of the prefix: the stances, weights and phase at c, at a rate)
        T.prefix = { noLock: false, stances: function (c, rate) { return P && P.tl ? stancesAt(c, gaitW(P.pre.vJ * (rate > 0 ? rate : 1) * P.tl.speedK(c))) : null; },
          weights: function (c, rate) { return P && P.tl ? gaitW(P.pre.vJ * (rate > 0 ? rate : 1) * P.tl.speedK(c)) : null; }, phase: function (c) { return P && P.PS ? phaseAt(c) : null; } };
        T.pos = function (out) { return R.root.getWorldPosition(out || V()); };
        return T;
      }

      /* ---------------------------------------------------------------------------------------- the referee -- */
      function makeRef(ent, o) {
        // (built after the runtime's graphics: castShadow, environment and reflections now; no shadow on a phone)
        var R = rig(ent, Object.assign({}, o, { prepare: true, castShadow: o.quality !== 'low' })); if (!R) return null;
        var spot = o.spot || [0, -41.5], at = o.at || [7.5, spot[1] - 4.5];
        // (by the box, side on to the kick: facing between the spot and the goal line)
        ent.object.position.set(at[0], 0, at[1]);
        ent.object.rotation.set(0, Math.atan2(spot[0] - at[0], spot[1] - 5.5 - at[1]), 0);
        ent.object.updateMatrixWorld(true);
        var tw = -1, cap = null, F = { rig: R, clock: 0 };
        // the whistle at the runtime's clock now (or at t, for the pure form): the right hand to the mouth for 0.6 s
        F.whistle = function (t) { tw = F.clock; F.tArg = t; };
        F.apply = function (t, whistleT) {
          if (t == null) { t = F.clock; whistleT = tw; }
          var t0 = whistleT == null ? -1 : whistleT;
          pose(R, [{ name: R.C.idle ? 'idle' : Object.keys(R.C)[0], t: t, w: 1 }]);
          var u = t - t0, w = t0 < 0 ? 0 : sstep(0, 0.14, u) * (1 - sstep(0.6, 0.78, u));
          if (w > 0) {
            var A = cap = capture(R, cap), hd = bone(R, 'head');
            var mouth = hd.localToWorld(V(-0.02, 0.035, 0.115)), sh = bone(R, 'upperarm01_R').getWorldPosition(V());
            var elbow = sh.clone().add(L(R, -0.32, -0.18, 0.1).sub(L(R, 0, 0, 0)));
            armTo(R, 'R', mouth.clone().add(L(R, -0.015, -0.06, 0.02).sub(L(R, 0, 0, 0))), elbow);
            handAim(R, 'R', mouth.clone().add(L(R, 0.05, 0.02, 0.06).sub(L(R, 0, 0, 0))));
            blend(R, A, capture(R), w);
          }
          R.model.updateMatrixWorld(true);
        };
        return F;
      }

      /* -------------------------------------------------------------------------------------------- people -- */
      // people = shootPeople({ P0, ref, quality, body, clip, ball, goal, knobs: { snap } }): the taker (P0, you or the
      // world's player()) and the referee (the world's rival(ctx, 2)). The keeper is lane Mb's (shootout-keeper.js),
      // built on shootPeople.PK.
      function shootPeopleMake(o) {
        o = o || {};
        var taker = o.P0 ? makeTaker(o.P0, o) : null, ref = o.ref ? makeRef(o.ref, o) : null, last = null;
        var api = {
          taker: taker, ref: ref, PK: null,
          // the director's form, update(alpha, dt): the referee on the people's own clock (the taker is applied apart);
          // the pure form, update({ taker: st, t, whistleT }, alpha): both, from state alone
          update: function (a, b) {
            if (typeof a === 'number' || a == null) { if (ref) { ref.clock += b > 0 ? b : 0; ref.apply(); } return; }
            if (taker) taker.apply(a.taker || a, b); if (ref) ref.apply(a.t || 0, a.whistleT); last = a;
          },
          // (critique #24: no stateful record; whoever draws keeps the pure state it applied and applies it again)
          record: function () { return last; }, applyRecord: function (r) { api.update(r, 0); },
          // the camera inside a person draws nobody (v1.js lens rule): rigs, the camera's position
          lens: function (rigs, camPos) {
            (rigs || []).forEach(function (R) {
              if (!R) return; var c = R.root.getWorldPosition(_w1);
              var inside = c.distanceToSquared(camPos) < 0.55 * 0.55 || (Math.abs(camPos.x - c.x) < 0.35 && Math.abs(camPos.z - c.z) < 0.35 && camPos.y < c.y + 0.95 && camPos.y > 0);
              if (inside !== !!R.camHidden) { R.camHidden = inside; R.model.visible = !inside; }
            });
          },
          shadows: function (Bl, floods, i0) { var i = i0 || 0; [taker && taker.rig, ref && ref.rig].forEach(function (R) { if (R) { shadowOf(Bl, i, R, floods); i += floods.length; } }); return i; },
        };
        api.PK = shootPeopleMake.PK;
        return api;
      }
      shootPeopleMake.PK = {
        rig: rig, prepare: prepare, pose: pose, capture: capture, blend: blend, rest: restPose, damp: damp,
        ik2: ik2, aim: aim, turn: turn, setWorldQ: setWorldQ, wq: wq, wp: wp, bone: bone, L: L,
        legTo: legTo, armTo: armTo, footFlat: footFlat, handAim: handAim, look: look, bend: bend, yawBone: yawBone,
        blobs: blobs, shadowOf: shadowOf, dims: dimsOf,
        footballKit: footballKit, kitOptions: kitOptions,
        measureKick: measureKick, kickOf: kickOf, strikeLocal: strikeLocalFor,
      };
      shootPeopleMake.taker = makeTaker; shootPeopleMake.referee = makeRef;
      return shootPeopleMake;
    })();
