/* SHOOTOUT M1, lane Mb: the keeper's body, drawn from the brain's keeper state (KS) every render frame.
   Pasted into v1's boot() by shootout.js at its include marker, so this file declares ONE top-level binding
   (shootKeeper) and reads THREE (and, when they are there, envify / liveMaterials / LIVE) from the boot scope.

     var kb = shootKeeper(rig, { pk: PK, skeleton: ASSETS[id].json.skeleton });
     kb.apply(KS, { t: tSim, mind: KP.mind(tSim) });   // every render frame; a pure function of its inputs
     kb.gloves()   -> [[x,y,z],[x,y,z]]                // the rendered glove centres, L then R (the 4 cm check)
     shootKeeper.dims(skeleton, scale) -> D            // the measured limbs (the brain's planner and colliders)

   rig: { model (the library human's root object, scaled to its height), bones? (by name), clips (array or function) }.
   pk:  the people kit (shootout-people.js); only pk.ik2(a, b, c, target, pole) is used (world-space two-bone solve).

   Every frame the body is rebuilt from scratch (critique #10, #24): the skeleton at rest with the fingers' captured
   curl (critique #9: never the splayed rest hand), the model placed so the root bone sits at KS.root turned by
   yaw, roll and pitch, the spine bent by the blended pose tables, the legs and arms solved to their targets, the gloves
   turned to the ball, the head to KS.look; in the get-up the get-up clip's own pose is blended in as the IK weight
   fades (0.35 s). Nothing carries over from one frame to the next, so a replay of the same KS draws the same body. */
var shootKeeper = (function () {
  'use strict';
  var REF_ROOT = 0.99626;           // the reference male's root bone height (the tables' metres are his)
  // The pose tables, in the body frame (+x the keeper's left, +y up the spine, +z ahead), as offsets from the root
  // bone's head, on the reference male. They are written diving to the keeper's LEFT (side +1): limb 0 is the near
  // (dive-side) limb, 1 the far one. Side -1 mirrors x and swaps the limbs.
  //   hand, elbow: the glove centre and the elbow's pole; finger, palm: where the fingers point and the palm faces
  //   (armF 1: the fingers along the arm; ball 1: the palm to the ball); foot, knee: the ankle and the knee's pole;
  //   toe: a planted foot's heading; air: 1 = the leg follows the table, 0 = the foot stays on KS.feet;
  //   spine: [forward, toward the side, twist toward the side] in radians over spine03..spine01.
  var TABLE = {
    ready: { hand: [[0.54, 0.10, 0.32], [-0.54, 0.10, 0.32]], elbow: [[0.85, 0.25, -0.30], [-0.85, 0.25, -0.30]],
      finger: [[0.50, 0.55, 0.60], [-0.50, 0.55, 0.60]], palm: [[-0.15, 0.05, 1], [0.15, 0.05, 1]], armF: 0, ball: 0,
      foot: [[0.31, -0.77, 0.07], [-0.31, -0.77, 0.07]], knee: [[0.50, -0.38, 1.0], [-0.50, -0.38, 1.0]], toe: [[0.22, 0, 1], [-0.22, 0, 1]],
      air: [0, 0], spine: [0.32, 0, 0] },
    load: { hand: [[0.62, 0.02, 0.26], [-0.12, 0.14, 0.42]], elbow: [[0.95, 0.10, -0.25], [-0.55, 0.10, -0.20]],
      finger: [[0.60, 0.45, 0.50], [0.20, 0.55, 0.70]], palm: [[-0.25, 0.05, 1], [0.15, 0.05, 1]], armF: 0, ball: 0,
      foot: [[0.55, -0.70, 0.10], [-0.30, -0.72, 0.02]], knee: [[0.75, -0.30, 1.0], [-0.45, -0.40, 1.0]], toe: [[0.55, 0, 1], [-0.10, 0, 1]],
      air: [0, 0], spine: [0.34, 0.16, 0.12] },
    // the push-off: the near leg drives straight from the turf, the far knee comes through high, the arms swing up
    push: { hand: [[0.84, 0.48, 0.30], [0.36, 0.64, 0.48]], elbow: [[0.95, 0.05, -0.35], [0.10, 0.20, -0.45]],
      finger: [[0.8, 0.5, 0.3], [0.7, 0.6, 0.4]], palm: [[0, 0, 1], [0, 0, 1]], armF: 1, ball: 0.5,
      foot: [[0.16, -0.93, -0.06], [0.04, -0.58, 0.34]], knee: [[0.30, -0.45, 1.0], [0.25, -0.05, 1.0]], toe: [[0, 0, 1], [0, 0, 1]],
      air: [0, 1], spine: [0.14, 0.14, 0.14] },
    // full stretch, a low ball: laid out flat, the top (far) hand leading over the bottom one, the legs trailing together
    lo: { hand: [[0.10, 1.15, 0.20], [-0.06, 1.18, 0.30]], elbow: [[0.45, 0.70, -0.35], [-0.45, 0.80, -0.30]],
      finger: [[0, 1, 0.2], [0, 1, 0.2]], palm: [[0, 0, 1], [0, 0, 1]], armF: 1, ball: 1,
      foot: [[0.08, -0.94, -0.10], [-0.04, -0.90, -0.02]], knee: [[0.15, -0.45, 1.0], [0.05, -0.45, 1.0]], toe: [[0, 0, 1], [0, 0, 1]],
      air: [1, 1], spine: [0, 0, 0] },
    // full stretch, a high ball: the push leg long under him, the far knee still drawn up
    hi: { hand: [[0.12, 1.18, 0.22], [-0.04, 1.20, 0.30]], elbow: [[0.45, 0.70, -0.35], [-0.45, 0.80, -0.30]],
      finger: [[0, 1, 0.2], [0, 1, 0.2]], palm: [[0, 0, 1], [0, 0, 1]], armF: 1, ball: 1,
      foot: [[0.12, -0.94, -0.10], [-0.02, -0.62, 0.22]], knee: [[0.22, -0.45, 1.0], [0.08, -0.25, 1.0]], toe: [[0, 0, 1], [0, 0, 1]],
      air: [1, 1], spine: [0, 0, 0] },
    // down on the near side: curled a little, knees bent, the hands forward on the turf toward the ball
    land: { hand: [[0.04, 0.60, 0.42], [-0.10, 0.63, 0.42]], elbow: [[0.15, 0.32, 0.70], [-0.15, 0.40, 0.70]],
      finger: [[0.1, 1, 0.5], [0, 1, 0.5]], palm: [[-0.3, 0, 0.3], [0.6, 0, 0.3]], armF: 0, ball: 1,
      foot: [[0.06, -0.80, 0.14], [-0.08, -0.76, 0.26]], knee: [[0.0, -0.32, 1.0], [-0.1, -0.30, 1.0]], toe: [[0, 0, 1], [0, 0, 1]],
      air: [1, 1], spine: [0.20, -0.26, 0.04] },
    // staying central: tall, arms wide and low, palms to the ball
    block: { hand: [[0.55, 0.30, 0.34], [-0.55, 0.30, 0.34]], elbow: [[0.85, 0.30, -0.30], [-0.85, 0.30, -0.30]],
      finger: [[0.45, 0.70, 0.40], [-0.45, 0.70, 0.40]], palm: [[-0.1, 0, 1], [0.1, 0, 1]], armF: 0, ball: 0.6,
      foot: [[0.40, -0.80, 0.05], [-0.40, -0.80, 0.05]], knee: [[0.60, -0.40, 1.0], [-0.60, -0.40, 1.0]], toe: [[0.25, 0, 1], [-0.25, 0, 1]],
      air: [0, 0], spine: [0.20, 0, 0] },
    // the mind games (overlays on the arms only): arms spread wide and high, and the glove clap
    wide: { hand: [[0.96, 0.64, 0.12], [-0.96, 0.64, 0.12]], elbow: [[0.80, 0.90, -0.40], [-0.80, 0.90, -0.40]],
      finger: [[0.7, 0.7, 0.1], [-0.7, 0.7, 0.1]], palm: [[0, 0, 1], [0, 0, 1]], armF: 0, ball: 0 },
    clap: { hand: [[0.05, 0.42, 0.40], [-0.05, 0.42, 0.40]], elbow: [[0.45, 0.20, -0.05], [-0.45, 0.20, -0.05]],
      finger: [[0.1, 0.8, 0.5], [-0.1, 0.8, 0.5]], palm: [[-1, 0, 0.1], [1, 0, 0.1]], armF: 0, ball: 0 },
  };
  var POSES = ['ready', 'load', 'push', 'lo', 'hi', 'land', 'block'];
  // the lowest a joint centre may go (the turf at y = 0; the flesh round each joint)
  var GROUND = { ankle: 0.065, knee: 0.07, glove: 0.07, elbow: 0.06 };
  // lying: each joint centre's least height (its flesh), on the reference male
  var CLEAR = [['upperleg01_L', 0.10], ['upperleg01_R', 0.10], ['upperarm01_L', 0.075], ['upperarm01_R', 0.075], ['head', 0.09]];
  var LIMB = ['hand', 'elbow', 'finger', 'palm', 'foot', 'knee', 'toe'];
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(a, b, v) { var u = clamp((v - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); }

  // The measured limbs (critique #1): from the skeleton's joint heads (the asset's own data), times the body's scale.
  // skel: ASSETS[id].json.skeleton ([{ name, parent, head, tail }]) or a map name -> head. Names may use '.' or '_'.
  function dims(skel, S) {
    var H = {}, Tl = {}, i;
    if (Array.isArray(skel)) for (i = 0; i < skel.length; i++) { H[skel[i].name.replace(/\./g, '_')] = skel[i].head; if (skel[i].tail) Tl[skel[i].name.replace(/\./g, '_')] = skel[i].tail; }
    else for (var n in skel) H[n.replace(/\./g, '_')] = skel[n];
    S = S || 1;
    function v(n) { return H[n]; }
    function rel(n, o) { var a = v(n), b = v(o || 'root'); return [(a[0] - b[0]) * S, (a[1] - b[1]) * S, (a[2] - b[2]) * S]; }
    function len(a, b) { var p = v(a), q = v(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * S; }
    var r = v('root');
    var D = {
      S: S, root: [r[0] * S, r[1] * S, r[2] * S],                       // the root bone's head over the feet (model space)
      shoulder: [rel('upperarm01_L'), rel('upperarm01_R')],              // from the root, at rest
      hip: [rel('upperleg01_L'), rel('upperleg01_R')],
      neck: rel('neck01'), head: rel('head'), clavicle: [rel('clavicle_L'), rel('clavicle_R')],
      upperArm: len('upperarm01_L', 'lowerarm01_L'), foreArm: len('lowerarm01_L', 'wrist_L'),
      knuckle: len('wrist_L', 'finger3-1_L'),
      thigh: len('upperleg01_L', 'lowerleg01_L'), shin: len('lowerleg01_L', 'foot_L'),
      ankle: v('foot_L')[1] * S,
    };
    D.crown = Tl.head ? [(Tl.head[0] - r[0]) * S, (Tl.head[1] - r[1]) * S, (Tl.head[2] - r[2]) * S] : [D.head[0], D.head[1] + 0.16 * S, D.head[2]];
    D.glove = 0.72 * D.knuckle;                      // the glove's centre on the palm (0.081 m on the male at 1.869)
    D.arm = D.upperArm + D.foreArm;
    D.leg = D.thigh + D.shin;
    D.reach = D.arm + D.glove;                       // shoulder to glove centre, the arm straight
    D.stretch = D.shoulder[0][1] + D.reach;          // root to glove centre, the arm straight along the body line (the planner's L)
    D.k = D.root[1] / REF_ROOT;                      // the tables' scale for this body
    return D;
  }

  function make(rig, opts) {
    opts = opts || {};
    var T = THREE, pk = opts.pk || {}, model = rig.model || rig.object;
    if (!model) throw new Error('shootKeeper: the rig has no model');
    if (typeof pk.ik2 !== 'function') throw new Error('shootKeeper: needs pk.ik2 (the people kit)');
    var B = {}, all = [];
    if (rig.bones) for (var bn in rig.bones) if (rig.bones[bn] && rig.bones[bn].isBone) B[bn.replace(/\./g, '_')] = rig.bones[bn];
    model.traverse(function (o) { if (o.isBone) { all.push(o); if (!B[o.name]) B[o.name] = o; } });
    var need = ['root', 'spine03', 'spine02', 'spine01', 'neck01', 'head'];
    ['L', 'R'].forEach(function (s) { ['clavicle', 'upperarm01', 'upperarm02', 'lowerarm01', 'lowerarm02', 'wrist', 'upperleg01', 'upperleg02', 'lowerleg01', 'lowerleg02', 'foot', 'finger3-1'].forEach(function (n) { need.push(n + '_' + s); }); });
    need.forEach(function (n) { if (!B[n]) throw new Error('shootKeeper: the body has no bone ' + n); });
    var FING = all.filter(function (b) { return /^finger/.test(b.name); });

    // rest (every library bone rests at identity, its position the head's offset from its parent's)
    var restRoot = B.root.position.clone(), S = model.scale.x || 1, SK = null;
    if (Array.isArray(opts.skeleton)) {
      // the skeleton as the asset has it (unscaled): a caller may hand it pre-scaled by the model's scale, which the
      // bones' own offsets (never animated) tell apart
      var byName = {}; opts.skeleton.forEach(function (b) { byName[b.name.replace(/\./g, '_')] = b; });
      var pa = byName.lowerleg01_L, pb = byName.upperleg02_L, k0 = 1;
      if (pa && pb && B.lowerleg01_L.position.length() > 1e-6) k0 = Math.hypot(pa.head[0] - pb.head[0], pa.head[1] - pb.head[1], pa.head[2] - pb.head[2]) / B.lowerleg01_L.position.length();
      if (!(k0 > 0.5 && k0 < 2)) k0 = 1;
      SK = opts.skeleton.map(function (b) { return { name: b.name, parent: b.parent, head: b.head.map(function (v) { return v / k0; }), tail: b.tail ? b.tail.map(function (v) { return v / k0; }) : null }; });
      if (byName.root) restRoot.fromArray(byName.root.head).multiplyScalar(1 / k0);
    }
    var heads = {};
    (function walk(b, acc) { var h = acc.clone().add(b === B.root ? restRoot : b.position); heads[b.name] = [h.x, h.y, h.z]; b.children.forEach(function (c) { if (c.isBone) walk(c, h); }); })(B.root, new T.Vector3());
    var D = SK ? dims(SK, S) : dims(heads, S);
    var K = D.k;
    function headV(n) { return new T.Vector3().fromArray(heads[n]); }
    // the hand's own frame at rest (in the wrist's local space, which at rest is the model's): where the fingers point,
    // and which way the palm faces (toward the body's midline at rest, as v1's grip finds it)
    var HAND = ['L', 'R'].map(function (s) {
      var wr = headV('wrist_' + s), md = headV('finger3-1_' + s), ix = headV('finger2-1_' + s), pk5 = headV('finger5-1_' + s);
      var f = md.clone().sub(wr).normalize(), axis = ix.clone().sub(pk5).normalize();
      var palm = new T.Vector3().crossVectors(axis, f).normalize(); if (palm.x * -wr.x < 0) palm.negate();
      palm.sub(f.clone().multiplyScalar(palm.dot(f))).normalize();
      var m = new T.Matrix4().makeBasis(f, palm, new T.Vector3().crossVectors(f, palm));
      return { inv: new T.Quaternion().setFromRotationMatrix(m).invert(), finger: f, axis: B['wrist_' + s].position.clone().normalize() };
    });
    var toeRest = ['L', 'R'].map(function (s) {
      var tl = null;
      if (SK) SK.forEach(function (b) { if (b.name.replace(/\./g, '_') === 'foot_' + s && b.tail) tl = new T.Vector3().fromArray(b.tail).sub(new T.Vector3().fromArray(b.head)); });
      tl = tl || new T.Vector3(0.03, -0.45, 0.89);
      return Math.atan2(tl.x, tl.z);                  // the rest heading of the foot (flat on the turf at rest)
    });

    // the clips: the fingers' relaxed curl (idle) and the get-up (and its mirror, built here: the clip is the asset's)
    var clips = typeof rig.clips === 'function' ? rig.clips() : rig.clips || [];
    function clipNamed(n) { for (var i = 0; i < clips.length; i++) if (clips[i] && clips[i].name === n) return clips[i]; return null; }
    function sampler(clip, mirror) {
      if (!clip) return null;
      var tr = [];
      clip.tracks.forEach(function (k) {
        var dot = k.name.lastIndexOf('.'), name = k.name.slice(0, dot), prop = k.name.slice(dot + 1);
        if (mirror) name = /_L$/.test(name) ? name.slice(0, -1) + 'R' : /_R$/.test(name) ? name.slice(0, -1) + 'L' : name;
        var b = B[name]; if (!b || (prop !== 'quaternion' && prop !== 'position')) return;
        tr.push({ b: b, q: prop === 'quaternion', it: k.createInterpolant() });
      });
      return { dur: clip.duration, set: function (c, only) {
        c = clamp(c, 0, clip.duration);
        for (var i = 0; i < tr.length; i++) {
          var e = tr[i]; if (only && !only[e.b.name]) continue;
          var v = e.it.evaluate(c);
          if (e.q) e.b.quaternion.set(v[0], mirror ? -v[1] : v[1], mirror ? -v[2] : v[2], v[3]);
          else e.b.position.set(mirror ? -v[0] : v[0], v[1], v[2]);
        }
      } };
    }
    var FINGERQ = {}, onlyF = {};
    FING.forEach(function (b) { onlyF[b.name] = true; });
    (function () {
      var s = sampler(clipNamed(opts.idle || 'idle'));
      FING.forEach(function (b) { FINGERQ[b.name] = new T.Quaternion(); });
      if (!s) return;
      var keep = FING.map(function (b) { return b.quaternion.clone(); });
      s.set(opts.idleT == null ? 0.4 : opts.idleT, onlyF);
      FING.forEach(function (b, i) { FINGERQ[b.name].copy(b.quaternion); b.quaternion.copy(keep[i]); });
    })();
    // the get-up: lane A's gkGetup (CMU 139_18, starting on the left side) when the pack has it, else the base getup
    // (UAL LayToIdle: it starts on its back, so the crossfade rolls him 90 degrees; critique #25)
    var guClip = clipNamed(opts.getup || 'gkGetupL') || clipNamed('gkGetup') || clipNamed('getup'), GURATE = opts.getupRate || 1;
    var GU = guClip ? [sampler(guClip, false), sampler(guClip, true)] : null;
    var CLAV = { L: B.clavicle_L, R: B.clavicle_R };

    // critique #8: built after the graphics were set up, the keeper needs makeRival's shadow and light steps
    if (opts.dress !== false) {
      model.traverse(function (o) { if (o.isMesh) o.castShadow = !(o.material && o.material.transparent) && !o.userData.gmFx; });
      try { if (typeof envify === 'function') envify(model); } catch (e) { }
      try { if (typeof LIVE !== 'undefined' && LIVE && typeof liveMaterials === 'function') liveMaterials(model); } catch (e) { }
    }

    // scratch (nothing allocated per frame)
    var V = function () { return new T.Vector3(); }, Q = function () { return new T.Quaternion(); };
    var qBody = Q(), qTmp = Q(), qA = Q(), qB = Q(), qC = Q(), qY = Q(), mTmp = new T.Matrix4(), mPar = new T.Matrix4();
    var vRoot = V(), vTmp = V(), vA = V(), vB = V(), vC = V(), vD = V(), vScale = new T.Vector3(S, S, S);
    var AX = new T.Vector3(1, 0, 0), AY = new T.Vector3(0, 1, 0), AZ = new T.Vector3(0, 0, 1), bx = V(), by = V(), bz = V();
    var tgt = { hand: [V(), V()], elbow: [V(), V()], finger: [V(), V()], palm: [V(), V()], foot: [V(), V()], knee: [V(), V()], toe: [V(), V()] };
    var blend = { air: [0, 0], spine: [0, 0, 0], armF: 0, ball: 0 }, hw = {}, sideK = 1;
    var gloveOut = [[0, 0, 0], [0, 0, 0]], last = null, dbg = { arm: [0, 0], leg: [0, 0], air: [0, 0], w: hw };
    var saveQ = all.map(function () { return Q(); }), saveRoot = V(), saveMP = V(), saveMQ = Q();

    function bodyToWorld(out, x, y, z) { return out.set(x * sideK, y, z).multiplyScalar(K).applyQuaternion(qBody).add(vRoot); }
    function dirToWorld(out, x, y, z) { return out.set(x * sideK, y, z).normalize().applyQuaternion(qBody); }
    // the blended table value of one limb's field, mirrored for the side (side -1: limb i reads the other limb, x negated)
    function tableLimb(field, i, out, weights, toWorld) {
      var x = 0, y = 0, z = 0, sum = 0;
      for (var n in weights) {
        var w = weights[n]; if (!(w > 1e-4)) continue;
        var P = TABLE[n][field]; if (!P) continue;
        var e = P[sideK > 0 ? i : 1 - i];
        x += e[0] * w; y += e[1] * w; z += e[2] * w; sum += w;
      }
      if (sum > 0) { x /= sum; y /= sum; z /= sum; }
      return toWorld === 'dir' ? dirToWorld(out, x, y, z) : toWorld ? bodyToWorld(out, x, y, z) : out.set(x, y, z);
    }
    function turnWorld(b, axis, ang) {
      if (Math.abs(ang) < 1e-6) return;
      b.parent.getWorldQuaternion(qA); b.getWorldQuaternion(qB);
      qC.setFromAxisAngle(axis, ang); qB.premultiply(qC);
      b.quaternion.copy(qA.invert().multiply(qB)); b.updateMatrixWorld(true);
    }
    function setWorldQ(b, q) { b.parent.getWorldQuaternion(qA); b.quaternion.copy(qA.invert().multiply(q)); b.updateMatrixWorld(true); }
    // swing-twist: the twist of q about the unit axis a
    function twistOf(q, a, out) {
      var d = q.x * a.x + q.y * a.y + q.z * a.z;
      out.set(a.x * d, a.y * d, a.z * d, q.w); var l = Math.hypot(out.x, out.y, out.z, out.w);
      if (l < 1e-9) return out.identity();
      out.x /= l; out.y /= l; out.z /= l; out.w /= l; return out;
    }
    var qD = Q(), qL = Q(), qH = Q(), qS = Q(), mB = new T.Matrix4(), vF = V(), vN = V(), vX = V(), qI = Q();
    // the glove: the fingers along f, the palm toward n; half the forearm's twist goes into lowerarm02, the wrist's
    // bend is held under 70 degrees so a wrist never breaks
    function glove(i, f, n) {
      var s = i ? 'R' : 'L', lo2 = B['lowerarm02_' + s], wr = B['wrist_' + s], H = HAND[i];
      vF.copy(f).normalize(); vN.copy(n).addScaledVector(vF, -n.dot(vF));
      if (vN.lengthSq() < 1e-8) vN.copy(bz).addScaledVector(vF, -bz.dot(vF));
      vN.normalize(); vX.crossVectors(vF, vN);
      mB.makeBasis(vF, vN, vX); qD.setFromRotationMatrix(mB).multiply(H.inv);
      lo2.parent.getWorldQuaternion(qA);
      qL.copy(qA).invert().multiply(qD);                      // lowerarm02 * wrist, in lowerarm01's frame
      twistOf(qL, H.axis, qH); qS.identity().slerp(qH, 0.5);
      lo2.quaternion.copy(qS); lo2.updateMatrixWorld(true);
      qS.invert().multiply(qL);                               // the wrist's own local turn
      // the bend: how far the turn takes the fingers off their rest line, held under 70 degrees
      vA.copy(H.finger).applyQuaternion(qS); var bend = vA.angleTo(H.finger);
      if (bend > 1.22) { qY.setFromUnitVectors(H.finger, vA); qC.copy(qY).invert().multiply(qS); qI.identity().slerp(qY, 1.22 / bend); qS.copy(qI).multiply(qC); }
      wr.quaternion.copy(qS); wr.updateMatrixWorld(true);
    }
    // the head to a point, a third in the neck; under 1.1 rad off the body's own line
    function lookAt(at) {
      var parts = [[B.neck01, 0.35], [B.head, 1]];
      for (var i = 0; i < 2; i++) {
        var b = parts[i][0]; b.getWorldPosition(vA); b.getWorldQuaternion(qB);
        vB.copy(AZ).applyQuaternion(qB); vC.copy(at).sub(vA).normalize();
        var ang = vB.angleTo(vC); if (ang < 1e-4) continue;
        qC.setFromUnitVectors(vB, vC); qI.identity().slerp(qC, parts[i][1] * Math.min(1, 1.1 / ang));
        qB.premultiply(qI); setWorldQ(b, qB);
      }
    }
    function legTo(i, foot, knee, air, toe) {
      var s = i ? 'R' : 'L', ul = B['upperleg01_' + s], ft = B['foot_' + s];
      pk.ik2(ul, B['lowerleg01_' + s], ft, foot, knee);
      // the foot: flat on the turf heading along toe (planted), or pointed along the shin (in the air)
      B['lowerleg02_' + s].getWorldQuaternion(qA);
      qY.setFromAxisAngle(AY, Math.atan2(toe.x, toe.z) - toeRest[i]);
      qB.copy(qA).invert().multiply(qY);                      // flat
      qC.setFromAxisAngle(AX, 0.75);                          // pointed
      ft.quaternion.copy(qB).slerp(qC, clamp(air, 0, 1)); ft.updateMatrixWorld(true);
    }

    function apply(KS, o) {
      o = o || {};
      last = { KS: KS, o: o };
      var side = KS.side > 0 ? 1 : KS.side < 0 ? -1 : 0; sideK = side || 1;
      var phase = KS.phase || 'ready', W = KS.w || {}, i;
      // the weights: the tables named in KS.w; whatever they leave goes to the phase's own pose
      var sum = 0; for (i = 0; i < POSES.length; i++) { hw[POSES[i]] = Math.max(0, +W[POSES[i]] || 0); sum += hw[POSES[i]]; }
      if (sum < 1) {
        var rest = phase === 'flight' ? 'push' : (phase === 'land' || phase === 'down' || phase === 'getup') ? 'land' : phase === 'block' ? 'block' : phase === 'load' ? 'load' : 'ready';
        hw[rest] += 1 - sum; sum = 1;
      }
      for (i = 0; i < POSES.length; i++) hw[POSES[i]] /= sum;
      // the mind games (set phase only): the bob on the root, an antic over the arms
      var mind = o.mind || KS.mind || null, bob = 0, ant = null, antW = 0;
      if (mind && (phase === 'ready' || phase === 'split')) { bob = +mind.bob || 0; if (mind.antic && TABLE[mind.antic]) { ant = mind.antic; antW = clamp(+mind.w || 0, 0, 1); } }

      // 1. the skeleton at rest, the fingers' captured curl kept
      for (i = 0; i < all.length; i++) all[i].quaternion.set(0, 0, 0, 1);
      for (var fn in FINGERQ) B[fn].quaternion.copy(FINGERQ[fn]);
      B.root.position.copy(restRoot);
      // 2. the body: the root bone at KS.root, turned by yaw, then rolled toward the side, then pitched forward
      qBody.setFromAxisAngle(AY, +KS.yaw || 0);
      qTmp.setFromAxisAngle(AZ, -sideK * (+KS.roll || 0)); qBody.multiply(qTmp);
      qTmp.setFromAxisAngle(AX, +KS.pitch || 0); qBody.multiply(qTmp);
      vRoot.fromArray(KS.root); vRoot.y += bob;
      vTmp.copy(restRoot).multiplyScalar(S).applyQuaternion(qBody);
      placeModel(vA.copy(vRoot).sub(vTmp), qBody);
      bx.copy(AX).applyQuaternion(qBody); by.copy(AY).applyQuaternion(qBody); bz.copy(AZ).applyQuaternion(qBody);

      // 3. the tables, blended
      var wt = {}; for (i = 0; i < POSES.length; i++) if (hw[POSES[i]] > 1e-4) wt[POSES[i]] = hw[POSES[i]];
      blend.spine[0] = blend.spine[1] = blend.spine[2] = 0; blend.air[0] = blend.air[1] = 0; blend.armF = 0; blend.ball = 0;
      for (var pn in wt) {
        var P = TABLE[pn], w = wt[pn];
        blend.spine[0] += P.spine[0] * w; blend.spine[1] += P.spine[1] * w; blend.spine[2] += P.spine[2] * w;
        blend.air[0] += P.air[sideK > 0 ? 0 : 1] * w; blend.air[1] += P.air[sideK > 0 ? 1 : 0] * w;
        blend.armF += P.armF * w; blend.ball += P.ball * w;
      }
      // where the brain's hands rule (its colliders), they are drawn on the brain's arm; elsewhere (the set, the load, the
      // push-off's swing, the landing) the tables draw the hands
      var cosm = clamp((hw.ready || 0) + (hw.load || 0) + 0.8 * (hw.push || 0) + (hw.land || 0), 0, 1), GL = +KS.glove > 0 ? +KS.glove : D.glove;
      if (!KS.hands) cosm = 1;
      // 4. the spine: forward (what the trunk's pitch leaves), toward the side, then turned toward it, over spine03..spine01;
      //    where the brain gives its shoulders and its hands rule, the spine is the brain's (straight)
      var SP = [[B.spine03, 0.30], [B.spine02, 0.35], [B.spine01, 0.35]], spK = KS.shoulders ? cosm : 1;
      for (i = 0; i < 3; i++) {
        turnWorld(SP[i][0], bx, spK * Math.max(0, blend.spine[0] - 0.6 * (+KS.pitch || 0)) * SP[i][1]);
        turnWorld(SP[i][0], bz, -sideK * spK * blend.spine[1] * SP[i][1]);
        turnWorld(SP[i][0], by, sideK * spK * blend.spine[2] * SP[i][1]);
      }

      // 5. the legs: planted feet stay on KS.feet until the leg is straight, then trail into the table
      for (i = 0; i < 2; i++) {
        tableLimb('foot', i, vB, wt, 'body');
        tableLimb('knee', i, tgt.knee[i], wt, 'body');
        tableLimb('toe', i, tgt.toe[i], wt, 'dir'); tgt.toe[i].y = 0; if (tgt.toe[i].lengthSq() < 1e-6) tgt.toe[i].copy(bz); tgt.toe[i].y = 0; tgt.toe[i].normalize();
        var air = blend.air[i];
        if (KS.feet && KS.feet[i]) {
          vC.fromArray(KS.feet[i]);
          // in the air the brain's ankle pins the foot only while it is on the turf (the push-off); once the brain lifts
          // it, the table draws the leg
          if (phase === 'flight') air = Math.max(air, smooth(D.ankle + 0.01, D.ankle + 0.05, vC.y));
        } else { vC.copy(vB); vC.y = D.ankle; }
        B[i ? 'upperleg01_R' : 'upperleg01_L'].getWorldPosition(vD);
        var reach = D.leg * 0.995, d = vC.distanceTo(vD), lift = 0, LIFT = 0.13 * K;
        if (air < 1 && d > reach) {
          // the push-off: up on the toes first (the heel leaves the turf, the ankle rises), then the toes leave it and
          // the foot trails into the table
          lift = Math.min(LIFT, d - reach); vC.y += lift; d = vC.distanceTo(vD);
          if (d > reach) { var over = d - reach; vC.sub(vD).multiplyScalar(reach / d).add(vD); air = Math.max(air, smooth(0, 0.25, over)); }
        }
        tgt.foot[i].copy(vC).lerp(vB, air);
        if (tgt.foot[i].y < GROUND.ankle) tgt.foot[i].y = GROUND.ankle;
        dbg.leg[i] = +(vD.distanceTo(tgt.foot[i]) / D.leg).toFixed(3); dbg.air[i] = +air.toFixed(2);
        legTo(i, tgt.foot[i], tgt.knee[i], Math.max(air, lift / LIFT), tgt.toe[i]);
        B[i ? 'lowerleg01_R' : 'lowerleg01_L'].getWorldPosition(vA);
        if (vA.y < GROUND.knee) { vA.copy(tgt.knee[i]); vA.y += 1.5; legTo(i, tgt.foot[i], vA, Math.max(air, lift / LIFT), tgt.toe[i]); }
      }

      // 6. the arms: the gloves to KS.hands (the brain's, the colliders' own), with the swing of the push-off and the
      //    hands to the turf as he lands drawn from the tables; the antics over the set position
      for (i = 0; i < 2; i++) {
        tableLimb('hand', i, tgt.hand[i], wt, 'body');
        tableLimb('elbow', i, tgt.elbow[i], wt, 'body');
        tableLimb('finger', i, tgt.finger[i], wt, 'dir');
        tableLimb('palm', i, tgt.palm[i], wt, 'dir');
        if (ant && antW > 0) {
          var aw = {}; aw[ant] = 1;
          tgt.hand[i].lerp(tableLimb('hand', i, vA, aw, 'body'), antW);
          tgt.elbow[i].lerp(tableLimb('elbow', i, vA, aw, 'body'), antW);
          tgt.finger[i].lerp(tableLimb('finger', i, vA, aw, 'dir'), antW).normalize();
          tgt.palm[i].lerp(tableLimb('palm', i, vA, aw, 'dir'), antW).normalize();
        }
        if (KS.hands && KS.hands[i]) tgt.hand[i].lerp(vA.fromArray(KS.hands[i]), 1 - cosm);
        if (tgt.hand[i].y < GROUND.glove) tgt.hand[i].y = GROUND.glove;
      }
      // the shoulders lift as the arms go overhead (a clavicle at rest under a raised arm reads as a dislocation); where
      // the brain gives its shoulders (KS.shoulders, its colliders' own), the clavicle puts the shoulder there instead,
      // as far as the hands are the brain's (so the drawn arm is the brain's arm: straight at full stretch)
      for (i = 0; i < 2; i++) {
        var s = i ? 'R' : 'L', ua = B['upperarm01_' + s];
        ua.getWorldPosition(vA); vB.copy(tgt.hand[i]).sub(vA);
        var elev = vB.angleTo(vC.copy(by).negate()), own = KS.shoulders && KS.shoulders[i] && KS.hands ? 1 - cosm : 0;
        turnWorld(CLAV[s], bz, (1 - own) * (i ? -1 : 1) * 0.30 * smooth(1.35, 2.75, elev));
        if (own > 0) {
          CLAV[s].getWorldPosition(vB); ua.getWorldPosition(vA); vC.fromArray(KS.shoulders[i]);
          vA.sub(vB).normalize(); vC.sub(vB).normalize();
          var ca = vA.angleTo(vC);
          if (ca > 1e-4 && ca < 0.8) { qC.setFromUnitVectors(vA, vC); qI.identity().slerp(qC, own); CLAV[s].getWorldQuaternion(qB); qB.premultiply(qI); setWorldQ(CLAV[s], qB); }
        }
      }
      for (i = 0; i < 2; i++) {
        var sd = i ? 'R' : 'L', ua2 = B['upperarm01_' + sd];
        ua2.getWorldPosition(vA);
        // the fingers: the table's, or along the arm (the stretch: the brain's wrist-to-glove line when it gives one),
        // the glove's centre GL past the wrist (the brain's KS.glove, which its colliders use)
        vB.copy(tgt.hand[i]).sub(vA).normalize();
        vF.copy(tgt.finger[i]).lerp(vB, blend.armF).normalize();
        if (KS.wrists && KS.wrists[i] && KS.hands && KS.hands[i] && cosm < 1) { vB.fromArray(KS.hands[i]).sub(vD.fromArray(KS.wrists[i])).normalize(); vF.lerp(vB, 1 - cosm).normalize(); }
        vC.copy(tgt.hand[i]).addScaledVector(vF, -GL);
        if (KS.elbows && KS.elbows[i]) tgt.elbow[i].lerp(vD.fromArray(KS.elbows[i]), 1 - cosm);
        dbg.arm[i] = +(vA.distanceTo(vC) / D.arm).toFixed(3);   // 1 = the arm straight
        pk.ik2(ua2, B['lowerarm01_' + sd], B['wrist_' + sd], vC, tgt.elbow[i]);
        B['lowerarm01_' + sd].getWorldPosition(vB);
        if (vB.y < GROUND.elbow) { vB.copy(tgt.elbow[i]); vB.y += 1.5; pk.ik2(ua2, B['lowerarm01_' + sd], B['wrist_' + sd], vC, vB); }
        // the palm: the table's, or to the ball (KS.look)
        vN.copy(tgt.palm[i]);
        if (KS.look && blend.ball > 0) { vD.fromArray(KS.look).sub(tgt.hand[i]); if (vD.lengthSq() > 1e-6) vN.lerp(vD.normalize(), blend.ball); }
        var fx = vF.x, fy = vF.y, fz = vF.z;
        glove(i, vD.set(fx, fy, fz), vN);
        // what was drawn: the glove's centre from the wrist bone
        var wb = B['wrist_' + sd]; wb.getWorldPosition(vA); wb.getWorldQuaternion(qB);
        vB.copy(HAND[i].finger).applyQuaternion(qB);
        gloveOut[i][0] = vA.x + vB.x * GL; gloveOut[i][1] = vA.y + vB.y * GL; gloveOut[i][2] = vA.z + vB.z * GL;
      }
      // 7. the head
      if (KS.look) lookAt(vA.fromArray(KS.look));
      // lying on the turf, the flesh round the hip and shoulder joints stays on it: the body is lifted clear (drawn only;
      // the outcome is long decided by then)
      var lw = hw.land || 0;
      if (lw > 0) {
        var clr = 0;
        for (i = 0; i < CLEAR.length; i++) { B[CLEAR[i][0]].getWorldPosition(vA); clr = Math.max(clr, CLEAR[i][1] * K - vA.y); }
        if (clr > 0) { model.position.y += clr * lw / (model.parent ? model.parent.getWorldScale(vB).y : 1); model.updateMatrixWorld(true); gloveOut[0][1] += clr * lw; gloveOut[1][1] += clr * lw; }
      }

      // 8. the get-up: the clip's own pose comes in as the IK weight fades (0.35 s); the model stands upright on the
      //    landing spot, turned (and the clip mirrored when that fits better) to lie as he lies
      if (phase === 'getup' && GU) {
        var c = +KS.getupT || 0, wIK = 1 - smooth(0, 0.35, c);
        model.updateMatrixWorld(true);
        for (i = 0; i < all.length; i++) saveQ[i].copy(all[i].quaternion);
        saveRoot.copy(B.root.position); saveMP.copy(model.position); saveMQ.copy(model.quaternion);
        qTmp.setFromAxisAngle(AY, +KS.yaw || 0); qC.setFromAxisAngle(AZ, -sideK * Math.PI / 2); qTmp.multiply(qC);
        var best = pickGetup(qTmp);
        for (i = 0; i < all.length; i++) all[i].quaternion.set(0, 0, 0, 1);
        B.root.position.copy(restRoot);
        best.g.set(c * GURATE);
        CLAV.L.quaternion.slerp(qI.identity(), 0.75); CLAV.R.quaternion.slerp(qI.identity(), 0.75);
        // where the model stands so the clip's first frame lies over the landing
        qY.setFromAxisAngle(AY, best.yaw);
        vB.copy(best.root0).multiplyScalar(S).applyQuaternion(qY);
        vA.set(KS.root[0] - vB.x, 0, KS.root[2] - vB.z);
        placeModel(vA, qY);
        // blend: the clip pose (A) toward the IK pose (B) by wIK
        for (i = 0; i < all.length; i++) all[i].quaternion.slerp(saveQ[i], wIK);
        B.root.position.lerp(saveRoot, wIK);
        vA.copy(model.position).lerp(saveMP, wIK); qB.copy(model.quaternion).slerp(saveMQ, wIK);
        model.position.copy(vA); model.quaternion.copy(qB);
      }
      model.updateMatrixWorld(true);
      return gloveOut;
    }
    // which get-up (as captured, or mirrored) fits the body as it lies, and the yaw that lays it there
    var GUC = null, lastPick = null;
    function pickGetup(qLie) {
      if (!GUC) GUC = GU.map(function (g, m) {
        for (var i = 0; i < all.length; i++) all[i].quaternion.set(0, 0, 0, 1);
        B.root.position.copy(restRoot); g.set(0);
        return { g: g, q0: B.root.quaternion.clone(), root0: B.root.position.clone(), m: m };
      });
      var best = null;
      for (var k = 0; k < GUC.length; k++) {
        var e = GUC[k];
        // the yaw that turns the clip's head line onto the body's
        vA.copy(AY).applyQuaternion(e.q0); vB.copy(AY).applyQuaternion(qLie);
        var yaw = Math.atan2(vB.x, vB.z) - Math.atan2(vA.x, vA.z);
        if (Math.hypot(vA.x, vA.z) < 0.3 || Math.hypot(vB.x, vB.z) < 0.3) { vA.copy(AZ).applyQuaternion(e.q0); vB.copy(AZ).applyQuaternion(qLie); yaw = Math.atan2(vB.x, vB.z) - Math.atan2(vA.x, vA.z); }
        qY.setFromAxisAngle(AY, yaw).multiply(e.q0);
        var miss = qY.angleTo(qLie);
        if (!best || miss < best.miss) best = { g: e.g, yaw: yaw, root0: e.root0, miss: miss, mirror: !!e.m };
      }
      return (lastPick = best);
    }
    function placeModel(pos, quat) {
      mTmp.compose(pos, quat, vScale);
      if (model.parent) { model.parent.updateWorldMatrix(true, false); mPar.copy(model.parent.matrixWorld).invert(); mTmp.premultiply(mPar); }
      mTmp.decompose(model.position, model.quaternion, model.scale);
      model.updateMatrixWorld(true);
    }

    return {
      apply: apply,
      gloves: function () { return gloveOut; },
      // the last frame's reach (target distance over limb length: over 1 = out of reach) and the table weights
      debug: function () { return JSON.parse(JSON.stringify(dbg)); },
      dims: D,
      // the M2M shuffle clips are cut for M1 (critique #24): the brain moves the root and KS.feet instead
      shuffle: function () { return false; },
      // the replay draws from recorded pure state (critique #24); these keep the §2.7 names working
      record: function () { return last ? { KS: JSON.parse(JSON.stringify(last.KS)), o: { t: last.o.t, mind: last.o.mind || null } } : null; },
      applyRecord: function (r) { return r ? apply(r.KS, r.o) : null; },
      // the last get-up fit: how far (radians) the clip's first frame lies from the landed body, and whether mirrored
      getupFit: function () { return lastPick ? { miss: +lastPick.miss.toFixed(3), yaw: +lastPick.yaw.toFixed(3), mirror: lastPick.mirror } : null; },
    };
  }
  make.dims = dims;
  make.TABLE = TABLE;
  return make;
})();
