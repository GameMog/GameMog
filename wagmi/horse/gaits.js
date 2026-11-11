// Mog City: a ridden horse's gaits, made at load from the library horse's own clips (wagmi/library/creature.js: the
// kit's json and clips; the anymove horse by Patch, CC0). Pure: THREE and the kit in, AnimationClips out; nothing here
// reads the game, so GameMog's own runtime can build the same gaits from the same asset.
//   const G = buildGaits(THREE, kit)   // { walk, trot, gallop }: each { clip, period, stride, duty, timing }
//     clip    an AnimationClip one stride long (play it by setting its time from the phase: phase * period)
//     stride  metres the horse travels in one stride with its hooves planted: the cadence for a speed v is v / stride
// Why it has to be made: the asset's Walk is a true four-beat walk (kept, its swing a little longer), but its Run is a
// stepping pace (measured: same-side legs leave the ground 0.17 of a stride apart), not the trot it is called, and
// there is no gallop. Every leg is re-timed on its own (phaseWarp): its stance and its swing are stretched or squeezed
// so it lands when the gait says and stays down for the gait's share of the stride; then its swing is made bigger
// (each joint's turn away from the stride's mean pose, scaled), and the trunk is given the gait's own motion.
//   trot     the Run's legs, the diagonal pairs together (left fore with right hind, then right fore with left hind,
//            half a stride later), each down 0.42 of the stride: a moment of suspension after each pair; the back
//            dips at each pair's landing
//   gallop   the Run's legs in a transverse gallop on the left lead (left hind, right hind, left fore, right fore, then
//            all four off the ground), each down 0.3 of the stride, the hip and shoulder swinging 1.75x as far, the
//            lower joints 1.35x; the back rounding as the hind legs reach under and stretching as the fore legs reach
//            out, the whole horse rocking, the neck swinging against it, the tail up
// Leg chains are found by walking up from each paw (fpaw_L/R, hpaw_L/R) to the trunk, so any of the library's
// four-legged creatures (the centaur's fore legs too) has them.

const TRUNK = /^(pelvis|spine\d*|chest|hips|root)$/;
const frac = (x) => x - Math.floor(x);

/** Each leg's bones, trunk first, paw last: { LF, RF, LH, RH } (indices into json.bones). */
export function legChains(json) {
  const B = json.bones, names = B.map((b) => b.name), out = {};
  for (let i = 0; i < B.length; i++) {
    const m = /^(f|h)paw_([LR])$/.exec(names[i]); if (!m) continue;
    const chain = [i];
    let p = B[i].parent;
    while (p >= 0 && !TRUNK.test(names[p])) { chain.unshift(p); p = B[p].parent; }
    out[m[2] + (m[1] === 'f' ? 'F' : 'H')] = chain;
  }
  return out;
}

// a bare skeleton of the kit (no mesh) to pose and measure: its paws' heights and travel
function skeleton(THREE, json) {
  const root = new THREE.Group(), body = new THREE.Group(); body.rotation.y = json.turn || 0; root.add(body);
  const bones = json.bones.map((b) => { const o = new THREE.Bone(); o.name = b.name; o.position.fromArray(b.t); o.quaternion.fromArray(b.r); o.scale.fromArray(b.s); return o; });
  json.bones.forEach((b, i) => (b.parent >= 0 ? bones[b.parent] : body).add(bones[i]));
  root.updateMatrixWorld(true);
  return { root, body, bones };
}
// each track of a clip by bone, as an interpolant: q (its turn) and p (where it is, for the moving bones)
function sampler(clip) {
  const S = {};
  for (const t of clip.tracks) {
    const [name, prop] = t.name.split('.');
    (S[name] || (S[name] = {}))[prop === 'quaternion' ? 'q' : 'p'] = t.createInterpolant();
  }
  return S;
}

/**
 * When each paw is down over one stride of a clip: { LF: { down, lift, travel }, ... }. down / lift are the phases
 * (0..1 of the stride, from t0) it lands and leaves the ground; travel the metres it goes back under the body while
 * down. A paw is up when it is more than `up` m over its lowest.
 */
export function measureLegs(THREE, json, clip, period, { t0 = 0, frames = 96, up = 0.025 } = {}) {
  const R = skeleton(THREE, json), S = sampler(clip), legs = legChains(json), out = {};
  const paws = Object.fromEntries(Object.entries(legs).map(([k, ch]) => [k, R.bones[ch[ch.length - 1]]]));
  const ys = {}, zs = {}, v = new THREE.Vector3();
  for (const k in paws) { ys[k] = []; zs[k] = []; }
  for (let f = 0; f < frames; f++) {
    const t = (t0 + (f / frames) * period) % clip.duration;
    R.bones.forEach((b) => { const s = S[b.name]; if (!s) return; if (s.q) b.quaternion.fromArray(s.q.evaluate(t)); if (s.p) b.position.fromArray(s.p.evaluate(t)); });
    R.root.updateMatrixWorld(true);
    for (const k in paws) { paws[k].getWorldPosition(v); ys[k].push(v.y); zs[k].push(v.z); }
  }
  for (const k in paws) {
    const y = ys[k], z = zs[k], lo = Math.min(...y), sw = y.map((h) => h > lo + up);
    let down = 0, lift = 0.5;
    for (let f = 0; f < frames; f++) {
      const p = (f + frames - 1) % frames;
      if (!sw[f] && sw[p]) down = f / frames;
      if (sw[f] && !sw[p]) lift = f / frames;
    }
    const fd = Math.round(down * frames) % frames, fl = Math.round(lift * frames) % frames;
    out[k] = { down, lift, travel: z[fd] - z[(fl + frames - 1) % frames] };
  }
  return out;
}

/**
 * A leg's source phase for the gait's phase u: landing at `at`, down for `duty` of the stride, its stance and swing
 * taken from the source leg's own (src: { down, lift } phases), each stretched to fit.
 */
export function phaseWarp(u, src, at, duty) {
  const s = frac(u - at);
  const stance = frac(src.lift - src.down) || 0.5, swing = 1 - stance;
  return s < duty ? frac(src.down + (s / duty) * stance) : frac(src.lift + ((s - duty) / (1 - duty)) * swing);
}

// q to the power k (its turn scaled about its own axis)
function qpow(THREE, q, k, out) {
  let { x, y, z, w } = q;
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const a = 2 * Math.acos(Math.min(1, w)), s = Math.sqrt(Math.max(0, 1 - w * w));
  if (s < 1e-6) return out.set(0, 0, 0, 1);
  return out.setFromAxisAngle(new THREE.Vector3(x / s, y / s, z / s), a * k);
}
// the mean of a run of quaternions (each turned into the first's hemisphere)
function qmean(THREE, list) {
  const m = new THREE.Vector4();
  for (const q of list) { const s = q.dot(list[0]) < 0 ? -1 : 1; m.x += q.x * s; m.y += q.y * s; m.z += q.z * s; m.w += q.w * s; }
  return new THREE.Quaternion(m.x, m.y, m.z, m.w).normalize();
}

/**
 * One gait as a clip. spec: { name, clip (the source), period (s: one stride of it), t0 (s: where its stride starts),
 * timing ({ LF, RF, LH, RH }: the phase each lands; null keeps the source's), duty, amp ({ upper, lower }: how much
 * further the hip and shoulder joints, and the joints below them, turn from the stride's mean), trunk (0..1: how much of
 * the source's own trunk motion to keep), body(phase) -> { rock, flex, bob, neck, tail } (the gait's own trunk: rad and
 * m), frames }.
 */
export function buildGait(THREE, kit, spec) {
  const J = kit.json, src = spec.clip, period = spec.period, t0 = spec.t0 || 0, N = spec.frames || 48;
  const S = sampler(src), legs = legChains(J), names = J.bones.map((b) => b.name);
  const meas = measureLegs(THREE, J, src, period, { t0 });
  const timing = spec.timing || Object.fromEntries(Object.entries(meas).map(([k, m]) => [k, m.down]));
  const duty = spec.duty ?? null;
  // which leg a bone is in, and whether it is a hip or shoulder joint (upper) or below it
  const legOf = {}, upper = {};
  for (const [k, ch] of Object.entries(legs)) ch.forEach((b, i) => { legOf[b] = k; upper[b] = i < ch.length - 3; });
  const times = new Float32Array(N + 1); for (let f = 0; f <= N; f++) times[f] = (f / N) * period;
  const tracks = [], q = new THREE.Quaternion(), r = new THREE.Quaternion(), d = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0);
  const at = (u) => (t0 + frac(u) * period) % src.duration;
  for (let b = 0; b < names.length; b++) {
    const s = S[names[b]]; if (!s || !s.q) continue;
    const leg = legOf[b];
    // the source sample for each output frame (the last the first again: a seamless loop)
    const raw = [];
    for (let f = 0; f < N; f++) {
      const u = f / N;
      const m = leg ? meas[leg] : null;
      const ph = leg ? (duty == null && !spec.timing ? u : phaseWarp(u, m, timing[leg], duty ?? frac(m.lift - m.down))) : frac(u + (spec.trunkShift || 0));
      raw.push(new THREE.Quaternion().fromArray(s.q.evaluate(at(ph))));
    }
    const mean = qmean(THREE, raw);
    const k = leg ? (upper[b] ? spec.amp?.upper ?? 1 : spec.amp?.lower ?? 1) : spec.trunk ?? 1;
    const vals = new Float32Array((N + 1) * 4);
    for (let f = 0; f <= N; f++) {
      const u = (f % N) / N;
      // (scaled away from the mean: q = mean * (mean^-1 * raw)^k)
      d.copy(mean).invert().multiply(raw[f % N]);
      qpow(THREE, d, k, r);
      q.copy(mean).multiply(r);
      // the gait's own trunk motion, as turns about each bone's own x (every trunk bone's x is the horse's left)
      if (!leg && spec.body) {
        const B = spec.body(u), n = names[b];
        const a = n === 'pelvis' ? (B.rock || 0) + (B.flex || 0) : n === 'spine1' ? -(B.flex || 0) * 0.6 : n === 'spine2' ? -(B.flex || 0) * 0.4
          : n === 'neck1' ? (B.neck || 0) * 0.6 : n === 'neck2' ? (B.neck || 0) * 0.4 : n === 'head' ? -(B.neck || 0) * 0.5 - (B.rock || 0) * 0.5 : n === 'tail1' ? (B.tail || 0) : 0;
        if (a) q.multiply(r.setFromAxisAngle(X, a));
      }
      q.toArray(vals, f * 4);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(names[b] + '.quaternion', times, vals));
    // (the moving bone, the pelvis: where it is, its height the gait's own bob over the source's, kept to a share)
    if (s.p) {
      const pv = new Float32Array((N + 1) * 3), rest = J.bones[b].t;
      for (let f = 0; f <= N; f++) {
        const u = (f % N) / N, p = s.p.evaluate(at(frac(u + (spec.trunkShift || 0)))), B = spec.body ? spec.body(u) : {};
        const keep = spec.trunk ?? 1;
        pv[f * 3] = rest[0] + (p[0] - rest[0]) * keep;
        pv[f * 3 + 1] = rest[1] + (p[1] - rest[1]) * keep + (B.bob || 0);
        pv[f * 3 + 2] = rest[2] + (p[2] - rest[2]) * keep;
      }
      tracks.push(new THREE.VectorKeyframeTrack(names[b] + '.position', times, pv));
    }
  }
  // each leg's stance in the gait (where it lands and for how long): the warp's, or the source's own
  const stance = {};
  for (const [L, m] of Object.entries(meas)) stance[L] = { at: timing[L], duty: duty ?? frac(m.lift - m.down) };
  groundLock(THREE, J, tracks, legs, stance, N);
  const clip = new THREE.AnimationClip(spec.name, period, tracks);
  // its stride: how far the body goes while a paw is down, over the share of the stride it is down
  const out = measureLegs(THREE, J, clip, period);
  const ds = Object.values(out).map((m) => frac(m.lift - m.down) || 0.5), tr = Object.values(out).map((m) => Math.abs(m.travel));
  const dutyMean = ds.reduce((a, b) => a + b, 0) / ds.length, travel = tr.reduce((a, b) => a + b, 0) / tr.length;
  return { name: spec.name, clip, period, duty: dutyMean, travel, stride: travel / dutyMean, timing: out };
}

// The hooves on the ground through each stance. A bigger swing (and the source's own looseness) leaves a hoof floating
// or sunk through part of the stance it is meant to stand on; here every frame of the made gait is posed on a bare
// skeleton, and each leg down (with a soft edge either side of its stance) has its fetlock reached to the ground under
// it (its height at rest) by the joint above it and the one below that (the shoulder and the elbow, or the hip and the
// stifle; the knee and the hock keep the clip's angle), the leg's bend kept in its own plane; a hoof in the air is never
// let down through the ground. The two joints' turns are written back into the gait's tracks.
const PAW_Y = 0.2, EDGE = 0.06;
function groundLock(THREE, J, tracks, legs, stance, N) {
  const R = skeleton(THREE, J), byName = {};
  for (const t of tracks) { const [n, prop] = t.name.split('.'); (byName[n] || (byName[n] = {}))[prop] = t; }
  const B = R.bones, names = J.bones.map((b) => b.name);
  const V = () => new THREE.Vector3(), a = V(), b = V(), c = V(), p = V(), n = V(), r = V(), to = V(), pole = V();
  const q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), qw = new THREE.Quaternion();
  const turnWorld = (bone, rot) => { bone.getWorldQuaternion(qw); q2.copy(rot).multiply(qw); bone.parent.getWorldQuaternion(qw); bone.quaternion.copy(qw.invert().multiply(q2)); bone.updateMatrixWorld(true); };
  // (wagmi/roadster.js createDriver's two-bone reach: b3 to `target`, the middle joint toward `poleDir`)
  function reach(b1, b2, b3, target, poleDir) {
    b1.getWorldPosition(a); b2.getWorldPosition(b); b3.getWorldPosition(c);
    const la = a.distanceTo(b), lb = b.distanceTo(c), d = Math.min(la + lb - 1e-4, Math.max(1e-3, target.distanceTo(a)));
    const cur = p.subVectors(a, b).normalize().angleTo(n.subVectors(c, b).normalize());
    const want = Math.acos(Math.min(1, Math.max(-1, (la * la + lb * lb - d * d) / (2 * la * lb))));
    n.crossVectors(p.subVectors(a, b), n.subVectors(c, b)); if (n.lengthSq() < 1e-10) return; n.normalize();
    turnWorld(b2, q.setFromAxisAngle(n, want - cur));
    b3.getWorldPosition(c);
    turnWorld(b1, q.setFromUnitVectors(p.subVectors(c, a).normalize(), n.subVectors(target, a).normalize()));
    b2.getWorldPosition(b);
    const ax = p.subVectors(target, a).normalize(), e = n.subVectors(b, a); e.addScaledVector(ax, -e.dot(ax));
    const pl = r.copy(poleDir); pl.addScaledVector(ax, -pl.dot(ax));
    if (e.lengthSq() > 1e-8 && pl.lengthSq() > 1e-8) { let ang = e.angleTo(pl); if (c.crossVectors(e, pl).dot(ax) < 0) ang = -ang; turnWorld(b1, q.setFromAxisAngle(ax, ang)); }
  }
  // (how much a leg is down at phase u: 1 through its stance, fading to 0 over EDGE either side)
  const down = (L, u) => { const S = stance[L], s = frac(u - S.at); if (s < S.duty) return 1; const out = Math.min(s - S.duty, 1 - s); return Math.max(0, 1 - out / EDGE); };
  for (let f = 0; f < N; f++) {
    for (let i = 0; i < B.length; i++) {
      const t = byName[names[i]]; if (!t) continue;
      if (t.quaternion) B[i].quaternion.fromArray(t.quaternion.values, f * 4);
      if (t.position) B[i].position.fromArray(t.position.values, f * 3);
    }
    R.root.updateMatrixWorld(true);
    const u = f / N;
    for (const [L, ch] of Object.entries(legs)) {
      if (ch.length < 4 || !stance[L]) continue;
      const b1 = B[ch[ch.length - 4]], b2 = B[ch[ch.length - 3]], paw = B[ch[ch.length - 1]];
      paw.getWorldPosition(to);
      const w = down(L, u);
      let y = to.y;
      if (w > 0) y = to.y + (PAW_Y - to.y) * w;
      if (y < PAW_Y) y = PAW_Y;
      if (Math.abs(y - to.y) < 5e-4) continue;
      to.y = y;
      b2.getWorldPosition(pole); b1.getWorldPosition(a); pole.sub(a);
      reach(b1, b2, paw, to, pole.clone());
      // (written back: the two joints' new turns at this frame, and the loop's last frame the first's)
      for (const bone of [b1, b2]) {
        const t = byName[bone.name].quaternion;
        bone.quaternion.toArray(t.values, f * 4);
        if (f === 0) bone.quaternion.toArray(t.values, N * 4);
      }
    }
  }
}

/** The ridden horse's three gaits from the library horse's kit (its Walk and Run clips). */
export function buildGaits(THREE, kit) {
  const C = kit.clips, walkSrc = C.Walk, runSrc = C.Run;
  const TAU = Math.PI * 2;
  const walk = buildGait(THREE, kit, { name: 'gait/walk', clip: walkSrc, period: walkSrc.duration, amp: { upper: 1.12, lower: 1.05 }, trunk: 1, frames: 48 });
  // (the Run is two strides; each leg re-timed from its own first one)
  const runPeriod = runSrc.duration / 2;
  const trotDuty = 0.42;
  const trot = buildGait(THREE, kit, {
    name: 'gait/trot', clip: runSrc, period: runPeriod, duty: trotDuty, timing: { LF: 0, RH: 0, RF: 0.5, LH: 0.5 },
    amp: { upper: 1.45, lower: 1.3 }, trunk: 0.55, frames: 48,
    // (the back lowest as each diagonal pair takes the weight, highest in the suspension between)
    body: (u) => ({ bob: -0.03 * Math.cos(TAU * 2 * (u - trotDuty / 2)), neck: 0.025 * Math.cos(TAU * 2 * (u - trotDuty / 2 - 0.05)) }),
  });
  const gallop = buildGait(THREE, kit, {
    name: 'gait/gallop', clip: runSrc, period: runPeriod, duty: 0.3, timing: { LH: 0.70, RH: 0.80, LF: 0.08, RF: 0.18 },
    amp: { upper: 1.75, lower: 1.35 }, trunk: 0.4, frames: 64,
    // gathered (the back rounded, the hind legs under it) through the hind legs' stance, stretched through the fore
    // legs'; the whole horse rocking nose down onto its fore legs and up off them, highest in the suspension that
    // follows the leading fore leg; the neck swinging against the rock; the tail carried up
    body: (u) => ({
      flex: 0.12 * Math.cos(TAU * (u - 0.88)),
      rock: 0.08 * Math.cos(TAU * (u - 0.26)),
      bob: 0.05 * Math.cos(TAU * (u - 0.59)),
      neck: 0.14 * Math.cos(TAU * (u - 0.3)),
      tail: 0.44 + 0.08 * Math.cos(TAU * (u - 0.6)),
    }),
  });
  return { walk, trot, gallop };
}
