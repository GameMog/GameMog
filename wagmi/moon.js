// Mog City: Moon, Dan and Jane's dog (she lives with Jane). A small white fluffy dog (a Maltese / Havanese type: a
// full, soft white coat, dark eyes, a black nose, floppy furry ears, a plumed tail over the back), built in code from soft volumes and about 4,000
// clumps of fur: tapered cards combed over the body, each a clump of fibres with a ragged tip drawn by its material,
// the roots shaded, the tips swaying as Moon moves. A little rig of pivots does the rest: idle (breathing, a wag, a tilt of the
// head), trot (the legs in diagonal pairs, matched to the ground speed), struggle (grabbed: paddling, twisting) and
// carried (legs dangling), tug (pulling at the lead: leaning into it, front feet reaching, back ones braced), plus a bark
// and a look toward a point.
//
//   const moon = buildMoon(THREE); scene.add(moon.group);
//   moon.update(dt, { mode: 'trot', speed: 1.4, look: someWorldPoint, bark: 0, mouth: 0..1 (open, tongue out), calm: 0..1 (struggling,
//   her head kept still) });
//   moon.collar: where a leash clips on (an Object3D on the neck)
// buildLeash(THREE): a blue leash, a rope of 14 points (verlet), from a hand (or a chair's leg) to Moon's collar, or
// loose (and Dan's bag's strap, once it is ripped off him: both ends on its rings).
// Units are metres; Moon faces +z and stands on y = 0.
import { attribute, positionLocal, uniform, vec3, float, sin, time, mix, smoothstep, uv, fract, abs, fwidth, normalViewGeometry } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// a small seeded random, so Moon's coat is the same every time
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function buildMoon(THREE, o = {}) {
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const R = rng(o.seed ?? 7);
  const group = new THREE.Group(); group.name = 'wagmi-moon';
  const S = o.scale ?? 1;
  group.scale.setScalar(S);

  /* --------------------------------------------------------------- the rig -- */
  const pivot = (parent, x, y, z, name) => { const p = new THREE.Group(); p.name = name; p.position.set(x, y, z); parent.add(p); return p; };
  const root = pivot(group, 0, 0, 0, 'root');
  const body = pivot(root, 0, 0.205, 0, 'body');
  const neck = pivot(body, 0, 0.045, 0.125, 'neck');
  const head = pivot(neck, 0, 0.078, 0.032, 'head');
  const jaw = pivot(head, 0, -0.036, 0.028, 'jaw');
  const earL = pivot(head, 0.047, 0.03, -0.006, 'earL'), earR = pivot(head, -0.047, 0.03, -0.006, 'earR');
  const tail = pivot(body, 0, 0.052, -0.142, 'tail');
  const legs = [
    ['FL', 0.040, -0.04, 0.092, true], ['FR', -0.040, -0.04, 0.092, true],
    ['RL', 0.046, -0.03, -0.094, false], ['RR', -0.046, -0.03, -0.094, false],
  ].map(([n, x, y, z, front]) => {
    const up = pivot(body, x, y, z, 'leg' + n);
    const lo = pivot(up, 0, -0.082, 0, 'knee' + n);
    return { n, up, lo, front, side: Math.sign(x) };
  });
  const collar = pivot(neck, 0, 0.012, 0.03, 'collar');

  /* ----------------------------------------------------- the soft volumes -- */
  // the dog under the coat: white, soft, so no gap between the locks ever shows anything but more dog
  const coatMat = new THREE.MeshStandardMaterial({ color: '#E9E2D6', roughness: 0.95 });
  const blob = (parent, c, r, mat = coatMat, rot = null) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), mat);
    m.position.copy(c); m.scale.copy(r); if (rot) m.rotation.set(...rot);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  blob(body, V(0, 0, 0), V(0.07, 0.074, 0.15));
  blob(body, V(0, 0.004, 0.082), V(0.074, 0.08, 0.075));
  blob(body, V(0, 0.01, -0.09), V(0.068, 0.07, 0.07));
  blob(neck, V(0, 0.035, 0.012), V(0.044, 0.062, 0.044), coatMat, [-0.5, 0, 0]);
  blob(head, V(0, 0.01, 0), V(0.056, 0.052, 0.058));
  blob(head, V(0, -0.022, 0.05), V(0.029, 0.025, 0.031));
  blob(jaw, V(0, -0.004, 0.026), V(0.02, 0.009, 0.028));
  for (const e of [earL, earR]) blob(e, V(Math.sign(e.position.x) * 0.008, -0.034, 0), V(0.012, 0.044, 0.026));
  // the face: a black nose (two nostrils), dark brown eyes set into the fur (wet: the sky's own catch light and one
  // small glint), a mouth and a tongue for panting
  const noseMat = new THREE.MeshStandardMaterial({ color: '#141111', roughness: 0.42 });
  const nostrilMat = new THREE.MeshStandardMaterial({ color: '#050404', roughness: 0.9 });
  const rimMat = new THREE.MeshStandardMaterial({ color: '#1C1412', roughness: 0.7 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#170D09', roughness: 0.12, metalness: 0.0 });
  const glintMat = new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#C9CED4', roughness: 1 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: '#3A1F22', roughness: 0.6 });
  const tongueMat = new THREE.MeshStandardMaterial({ color: '#D9727A', roughness: 0.45 });
  // (almond eyes the size a small dog's are, set into the face under the brow rather than bulging out of it)
  blob(head, V(0, -0.0105, 0.0802), V(0.0102, 0.0074, 0.0082), noseMat);
  for (const s of [1, -1]) blob(head, V(s * 0.0037, -0.0116, 0.0876), V(0.0023, 0.0015, 0.0011), nostrilMat, [0, 0, s * 0.5]);
  const eyes = [1, -1].map((s) => {
    blob(head, V(s * 0.0236, 0.0085, 0.0466), V(0.0098, 0.0082, 0.0046), rimMat, [0, s * 0.38, s * -0.18]);
    const e = blob(head, V(s * 0.0236, 0.0085, 0.0472), V(0.0082, 0.0074, 0.005), eyeMat, [0, s * 0.38, s * -0.18]);
    const g = blob(head, V(s * 0.0226 + 0.0022, 0.0106, 0.0516), V(0.0013, 0.0013, 0.0006), glintMat);
    g.castShadow = false; return e;
  });
  const mouthLine = blob(jaw, V(0, 0.002, 0.03), V(0.018, 0.006, 0.026), mouthMat);
  const tongue = blob(jaw, V(0, 0.004, 0.044), V(0.011, 0.003, 0.02), tongueMat);
  tongue.visible = false;
  // legs and paws (mostly under the coat; the paws peek out)
  for (const L of legs) {
    blob(L.up, V(0, -0.04, 0), V(0.019, 0.05, 0.02));
    blob(L.lo, V(0, -0.042, 0), V(0.015, 0.048, 0.016));
    blob(L.lo, V(0, -0.082, 0.009), V(0.017, 0.011, 0.022));
  }
  // (the tail curls up and over the back)
  for (const [y, z, rx] of [[0.018, -0.008, -0.3], [0.042, -0.004, 0.4], [0.056, 0.018, 1.2]]) blob(tail, V(0, y, z), V(0.016, 0.024, 0.016), coatMat, [rx, 0, 0]);
  // the collar, blue, with its round name tag
  const collarMat = new THREE.MeshStandardMaterial({ color: '#2F7FD8', roughness: 0.45 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.043, 0.0055, 8, 28), collarMat);
  ring.rotation.x = Math.PI / 2 - 0.45; ring.position.set(0, 0.012, 0.005); neck.add(ring);
  const tag = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.002, 18), new THREE.MeshStandardMaterial({ color: '#E8C25A', metalness: 0.9, roughness: 0.25 }));
  tag.rotation.x = Math.PI / 2 - 0.1; tag.position.set(0, -0.028, 0.045); neck.add(tag);
  collar.position.set(0, 0.03, -0.035);

  /* --------------------------------------------------------------- the coat -- */
  // One material per body part (each sways on its own), the same graph: each lock a soft clump of fibres, full at the
  // root and narrowing to a ragged tip (every fibre stops at its own length), the clump's middle catching more light
  // than its edges, the roots in their own shade, a little drift in the air. Alpha to coverage: the fibres' edges come
  // out soft under the scene's MSAA instead of cut out.
  function coatMaterial() {
    const sway = uniform(V());
    const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.86, alphaToCoverage: true });
    const t = attribute('hairT', 'float'), seed = attribute('seed', 'float');
    const drift = sin(time.mul(1.7).add(seed.mul(23.0))).mul(0.0025).mul(t);
    m.positionNode = positionLocal.add(sway.mul(t.mul(t))).add(vec3(drift, 0, drift.mul(0.6)));
    const across = abs(uv().x.mul(2.0).sub(1.0));
    // (23 Oct: nine fibres across a clump, not six, each its own width and length, with gaps between them from just off
    // the root: in a close-up the clump reads as hair, not as a card with straight sides)
    const strand = uv().x.mul(9.0).add(seed.mul(5.3)), f = fract(strand);
    const fibre = fract(sin(strand.floor().mul(12.9898).add(seed.mul(78.233))).mul(43758.5453));
    const core = float(1.0).sub(abs(f.mul(2.0).sub(1.0)));
    // (where a fibre is under ~2 px on screen (Moon at play distance) the gaps and the fibres' shading fade back to the
    // clump's old look: solid at the root, parting toward the tip; only close up does it split all the way)
    const far = smoothstep(0.3, 0.7, fwidth(strand));
    const root = mix(vec3(0.62, 0.58, 0.53), vec3(0.93, 0.9, 0.85), smoothstep(0.0, 0.6, t));
    const tint = mix(vec3(1.0, 0.98, 0.94), vec3(0.96, 0.965, 0.98), seed);
    // (each fibre a shade darker at its sides, so neighbours part by light as well as by the gaps)
    const shade = mix(float(0.84), float(1.0), float(1.0).sub(across.mul(across))).mul(mix(float(0.78), float(1.04), fibre)).mul(mix(mix(float(0.88), float(1.0), smoothstep(0.0, 0.7, core)), float(1.0), far));
    m.colorNode = root.mul(tint).mul(shade);
    // (the clump narrows toward its tip; the middle fibres run on to it, the outer ones stop short and some thinner, and
    // the gaps between the fibres open wider toward the tips)
    const profile = float(1.0).sub(t.mul(t).mul(0.75)).sub(fibre.mul(across).mul(0.22));
    const reach = float(1.02).sub(across.mul(0.3)).sub(fibre.mul(0.36));
    const gap = mix(float(0.08), float(0.4), smoothstep(0.03, 0.5, t)).mul(mix(float(0.75), float(1.25), fibre));
    const near = smoothstep(gap.mul(0.55), gap, core), split = mix(near, mix(float(1.0), near, smoothstep(0.12, 0.6, t)), far);
    m.opacityNode = smoothstep(profile, profile.sub(0.4), across).mul(smoothstep(reach, reach.sub(0.1), t)).mul(split);
    // (a lock's normal is the skin's under it on both faces: a lock seen from behind is lit like its neighbours)
    m.normalNode = normalViewGeometry;
    m.alphaTest = 0.5;
    m.userData.sway = sway;
    return m;
  }
  // locks sampled over an ellipsoid of a part; dir(p, n) combs each one; len(p, n) its length
  function coat(parent, { c, r, n, len, width = 0.016, dir, keep = () => true, droop = 0.5, wave = 0.18, lift = 0.004 }) {
    const pos = [], nor = [], uvs = [], ht = [], sd = [], idx = [];
    const K = 6;
    // the roots: a Fibonacci sphere (jittered) over the whole part, those it keeps thinned evenly to n
    const M = n * 3, cand = [];
    for (let i = 0; i < M; i++) {
      const k = (i + 0.5) / M, yy = 1 - 2 * k, rr = Math.sqrt(1 - yy * yy), a = i * 2.39996 + (R() - 0.5) * 0.5;
      const s = V(Math.cos(a) * rr, yy, Math.sin(a) * rr);
      if (keep(s)) cand.push(s);
    }
    const stride = Math.max(1, cand.length / n);
    for (let f = 0; f < cand.length; f += stride) {
      const s = cand[Math.floor(f)];
      const p = V(s.x * r.x, s.y * r.y, s.z * r.z).add(c);
      const nr = V(s.x / r.x, s.y / r.y, s.z / r.z).normalize();
      const L = len(s, nr) * (0.8 + R() * 0.4);
      const d = dir(s, nr).normalize();
      const side = V().crossVectors(d, nr); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
      // (each clump twisted about its own run, so as many are seen edge-on as flat: fur, not scales)
      side.applyAxisAngle(d, (R() - 0.5) * 2.2);
      const w = width * (0.75 + R() * 0.5), ph = R() * Math.PI * 2, seed = R();
      const base = pos.length / 3;
      for (let j = 0; j <= K; j++) {
        const u = j / K;
        const q = p.clone().addScaledVector(nr, lift).addScaledVector(d, L * u).add(V(0, -droop * L * u * u, 0))
          .addScaledVector(side, Math.sin(u * Math.PI * 2.2 + ph) * wave * L * u).addScaledVector(nr, Math.sin(u * Math.PI * 1.3 + ph * 1.7) * wave * 0.5 * L * u);
        const half = w * (1 - 0.8 * u) * 0.5;
        for (const sgn of [-1, 1]) {
          const v = q.clone().addScaledVector(side, sgn * half);
          pos.push(v.x, v.y, v.z); nor.push(nr.x, nr.y, nr.z); uvs.push(sgn < 0 ? 0 : 1, u); ht.push(u); sd.push(seed);
        }
        if (j < K) { const a0 = base + j * 2; idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('hairT', new THREE.Float32BufferAttribute(ht, 1));
    g.setAttribute('seed', new THREE.Float32BufferAttribute(sd, 1));
    g.setIndex(idx);
    return g;
  }
  const down = V(0, -1, 0), back = V(0, 0, -1), fwd = V(0, 0, 1);
  const flat = (n) => V(n.x, 0, n.z).normalize();
  const coats = [];
  function addCoat(parent, specs) {
    const mat = coatMaterial();
    const mesh = new THREE.Mesh(mergeGeometries(specs.map((s) => coat(parent, s))), mat);
    // (the locks take shadow but cast none: the soft volumes under them cast hers, at a fraction of the cost)
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false;
    parent.add(mesh); coats.push({ mesh, mat, parent, prev: null, vel: V(), sway: V() });
    return mesh;
  }
  const comb = (...terms) => terms.reduce((acc, [v, w]) => acc.addScaledVector(v, w), V());
  // the body: a full, fluffy coat (a Havanese in a puppy cut, not a show Maltese): clumps standing out from the skin and
  // curving down and back, longest on the flanks, a skirt that stops well short of the ground (the legs show when Moon
  // trots); an undercoat of short, bouncy clumps standing straight out under it for the volume
  addCoat(body, [
    { c: V(0, 0.004, 0), r: V(0.074, 0.078, 0.155), n: 1250, width: 0.026, droop: 0.32, wave: 0.16, lift: 0.007,
      len: (s) => 0.032 + 0.014 * Math.max(0, 0.5 - s.y),
      dir: (s, n) => (s.y < -0.6 ? comb([down, 1], [flat(n), 0.45]) : comb([n, 0.45], [flat(n), 0.55], [down, 0.4], [back, 0.3])) },
    { c: V(0, 0.01, 0.08), r: V(0.077, 0.082, 0.078), n: 340, width: 0.026, droop: 0.3, wave: 0.16, lift: 0.007, keep: (s) => s.z > -0.2,
      len: (s) => 0.034 + 0.012 * Math.max(0, 0.5 - s.y), dir: (s, n) => comb([n, 0.4], [flat(n), 0.6], [down, 0.45], [fwd, 0.15]) },
    { c: V(0, 0.002, 0), r: V(0.072, 0.076, 0.15), n: 620, width: 0.024, droop: 0.15, wave: 0.2, lift: 0.002,
      len: () => 0.026, dir: (s, n) => comb([n, 1], [down, 0.25], [back, 0.2]) },
  ]);
  // the neck ruff
  addCoat(neck, [{ c: V(0, 0.03, 0.01), r: V(0.048, 0.064, 0.048), n: 300, width: 0.024, droop: 0.32, wave: 0.16, lift: 0.006,
    len: () => 0.036, dir: (s, n) => comb([n, 0.4], [flat(n), 0.6], [down, 0.5]) }]);
  // the head: the crown parted down the middle and falling soft over the ears; short fur over the face, the eyes clear
  // (a fringe over the brow, not over the eyes); a moustache and a beard on the muzzle, the nose clear
  const eyeL = V(0.0236, 0.0085, 0.0472), eyeR = V(-0.0236, 0.0085, 0.0472), noseAt = V(0, -0.0105, 0.0805);
  const onHead = (s) => V(s.x * 0.058, s.y * 0.055 + 0.012, s.z * 0.059 - 0.003);
  const clearOfEyes = (p, r) => p.distanceTo(eyeL) > r && p.distanceTo(eyeR) > r;
  addCoat(head, [
    { c: V(0, 0.012, -0.003), r: V(0.058, 0.055, 0.059), n: 430, width: 0.016, droop: 0.38, wave: 0.16, lift: 0.005,
      keep: (s) => s.z < 0.3 && clearOfEyes(onHead(s), 0.02),
      len: (s) => 0.032 + 0.016 * Math.max(0, -s.z), dir: (s, n) => comb([n, 0.35], [flat(n), 0.55], [down, 0.6], [back, 0.2]) },
    // (a tuft over the crown, so the parting never shows bare)
    { c: V(0, 0.012, -0.003), r: V(0.058, 0.055, 0.059), n: 110, width: 0.022, droop: 0.4, wave: 0.1, keep: (s) => s.y > 0.68,
      len: () => 0.024, dir: (s, n) => comb([n, 0.5], [back, 0.7], [flat(n), 0.3]) },
    // (the face in short, dense, soft fur, swept back from the eyes and the nose: the close-ups show a face, not a mop;
    // 23 Oct: more and narrower clumps here, where the camera comes closest)
    { c: V(0, 0.012, -0.003), r: V(0.059, 0.056, 0.06), n: 1000, width: 0.0115, droop: 0.15, wave: 0.06, lift: 0.003,
      keep: (s) => s.z >= 0.2 && clearOfEyes(onHead(s), 0.0108),
      len: (s) => (s.y > 0.4 ? 0.02 : 0.014), dir: (s, n) => comb([n, 0.55], [down, 0.4], [back, 0.35]) },
    { c: V(0, -0.023, 0.05), r: V(0.031, 0.027, 0.033), n: 380, width: 0.012, droop: 0.25, wave: 0.07, lift: 0.002,
      keep: (s) => { const p = V(s.x * 0.031, s.y * 0.027 - 0.023, s.z * 0.033 + 0.05); return p.distanceTo(noseAt) > 0.0128 && clearOfEyes(p, 0.0125); },
      len: (s) => (s.y < -0.2 ? 0.026 : 0.016), dir: (s, n) => comb([down, 0.6], [flat(n), 0.55], [fwd, 0.1]) },
  ]);
  // the ears: soft locks hanging from the flaps, framing the face
  for (const e of [earL, earR]) {
    const sx = Math.sign(e.position.x);
    addCoat(e, [{ c: V(sx * 0.008, -0.03, 0), r: V(0.016, 0.046, 0.03), n: 150, width: 0.018, droop: 0.3, wave: 0.2, lift: 0.004,
      keep: (s) => s.x * sx > -0.3, len: (s) => 0.046 + 0.02 * Math.max(0, -s.y), dir: () => comb([down, 1], [V(sx, 0, 0), 0.3]) }]);
  }
  // the tail: a plume curled over the back, its locks falling to either side
  addCoat(tail, [{ c: V(0, 0.045, 0.004), r: V(0.022, 0.04, 0.034), n: 190, width: 0.02, droop: 0.55, wave: 0.18, lift: 0.004,
    len: () => 0.055, dir: (s, n) => comb([n, 0.3], [flat(n), 0.7], [down, 0.35], [back, 0.15]) }]);
  // the legs: fluffy feathering, the paws left to peek out
  for (const L of legs) {
    addCoat(L.up, [{ c: V(0, -0.04, 0), r: V(0.022, 0.05, 0.023), n: 70, width: 0.017, droop: 0.3, lift: 0.004, len: () => 0.032, dir: (s, n) => comb([down, 0.8], [flat(n), 0.7]) }]);
    addCoat(L.lo, [{ c: V(0, -0.04, 0), r: V(0.018, 0.045, 0.019), n: 56, width: 0.015, droop: 0.25, lift: 0.003, len: () => 0.024, dir: (s, n) => comb([down, 0.8], [flat(n), 0.7]) }]);
  }
  group.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });

  /* ------------------------------------------------------------ the motion -- */
  let t = 0, phase = 0, wagT = 0, tilt = 0, tiltGoal = 0, tiltTimer = 0, barkT = 9, barkLevel = 0, mouth = 0;
  const k = { trot: 0, struggle: 0, carried: 0, sit: 0, tug: 0 };
  const _w = V(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
  const look = { yaw: 0, pitch: 0 };
  const ease = (cur, goal, rate, dt) => cur + (goal - cur) * Math.min(1, dt * rate);
  function update(dt, s = {}) {
    t += dt;
    const mode = s.mode || 'idle', speed = s.speed || 0;
    for (const m in k) k[m] = ease(k[m], m === mode ? 1 : 0, mode === 'carried' || m === 'carried' ? 5 : 7, dt);
    // the trot: a full stride every ~0.32 m, the diagonal pairs together
    const trotK = Math.min(1, k.trot * Math.min(1, speed / 0.5));
    phase += (speed * dt / 0.32) * Math.PI * 2;
    // breathing (panting while trotting or upset), a wag, a tilt of the head now and then
    const pant = Math.max(trotK, k.struggle);
    const br = Math.sin(t * (pant > 0.5 ? 14 : 2.6)) * (pant > 0.5 ? 0.012 : 0.018);
    body.scale.set(1 + br * 0.5, 1 + br, 1);
    wagT += dt * (s.wag ?? (mode === 'struggle' ? 0.2 : mode === 'carried' ? 0.4 : 1)) * 2 * Math.PI * 2.8;
    const wagA = mode === 'struggle' ? 0.12 : 0.5;
    tail.rotation.set(0.55 - 1.2 * k.struggle + 0.2 * k.carried, Math.sin(wagT) * wagA, 0);
    tiltTimer -= dt; if (tiltTimer <= 0) { tiltTimer = 2 + Math.random() * 3; tiltGoal = Math.random() < 0.45 ? (Math.random() - 0.5) * 0.7 : 0; }
    tilt = ease(tilt, tiltGoal * (1 - trotK) * (1 - k.struggle), 4, dt);
    // a bark: the head snaps up and forward, the jaw opens
    if (s.bark && barkT > 0.25) barkT = 0;
    barkT += dt;
    barkLevel = barkT < 0.22 ? Math.sin(Math.min(1, barkT / 0.22) * Math.PI) : 0;
    // (mouth: open, the tongue out, a happy pant: looking up at him)
    mouth = ease(mouth, s.mouth || 0, 8, dt);
    jaw.rotation.x = 0.55 * barkLevel + 0.18 * pant * (0.6 + 0.4 * Math.sin(t * 14)) + mouth * (0.32 + 0.06 * Math.sin(t * 11));
    tongue.visible = pant > 0.4 || barkLevel > 0.1 || mouth > 0.2;
    // (shut, the mouth is under the beard: no line drawn on the muzzle)
    mouthLine.visible = jaw.rotation.x > 0.06;
    // looking at a point (world): the head turns to it, within a dog's neck
    let yaw = 0, pitch = 0;
    if (s.look) {
      neck.updateWorldMatrix(true, false);
      _w.copy(s.look); neck.worldToLocal(_w); _w.sub(head.position);
      yaw = Math.max(-0.9, Math.min(0.9, Math.atan2(_w.x, _w.z)));
      pitch = Math.max(-0.5, Math.min(0.45, Math.atan2(_w.y, Math.hypot(_w.x, _w.z))));
    }
    // (calm: held up to be seen, her face kept to the look, only her legs going)
    if (k.struggle > 0.05) { const sw = k.struggle * (1 - (s.calm || 0) * 0.85); yaw = Math.sin(t * 7.3) * 0.7 * sw + yaw * (1 - sw); }
    look.yaw = ease(look.yaw, yaw, 6, dt); look.pitch = ease(look.pitch, pitch, 6, dt);
    const bob = Math.cos(phase * 2) * 0.006 * trotK;
    const surge = k.tug * Math.max(0, Math.sin(t * 4.2));
    body.position.y = 0.205 + bob - 0.01 * k.carried - 0.018 * k.tug;
    body.position.z = 0.02 * surge;
    body.rotation.set(-0.04 * trotK + 0.1 * k.tug + Math.sin(t * 9) * 0.05 * k.struggle, Math.sin(t * 6.1) * 0.25 * k.struggle + Math.sin(t * 2.1) * 0.08 * k.tug, Math.sin(t * 8.3) * 0.22 * k.struggle);
    neck.rotation.set(-0.15 - look.pitch * 0.5 + bob * 4 - 0.25 * barkLevel, look.yaw * 0.45, 0);
    head.rotation.set(0.2 - look.pitch * 0.6 - 0.2 * barkLevel, look.yaw * 0.55, tilt);
    for (const e of [earL, earR]) {
      const sx = Math.sign(e.position.x);
      e.rotation.set(0.1 + bob * 6 + 0.25 * k.struggle * Math.sin(t * 11 + sx), 0, sx * (0.1 + 0.15 * barkLevel + Math.sin(t * 13) * 0.1 * k.struggle));
    }
    // the legs: standing, trotting, paddling (struggle), dangling (carried)
    for (const L of legs) {
      const ph = phase + ((L.n === 'FL' || L.n === 'RR') ? 0 : Math.PI);
      const swing = Math.sin(ph), lift = Math.max(0, Math.cos(ph));
      let up = -0.5 * swing * trotK, lo = (L.front ? 0.95 : -0.75) * lift * trotK;
      const pad = Math.sin(t * 15 + (L.front ? 0 : 1.7) + L.side * 1.3);
      up += k.struggle * (L.front ? -0.6 + 0.5 * pad : 0.4 + 0.45 * pad); lo += k.struggle * (L.front ? 0.4 + 0.3 * pad : -0.5 + 0.3 * pad);
      up += k.carried * (L.front ? -0.35 : 0.25) * (1 - k.struggle); lo += k.carried * (L.front ? 0.5 : -0.35) * (1 - k.struggle);
      up += k.tug * (L.front ? -0.32 - 0.12 * surge : 0.3); lo += k.tug * (L.front ? 0.12 : -0.2);
      L.up.rotation.set(up, 0, L.side * 0.04 * k.carried);
      L.lo.rotation.set(lo, 0, 0);
    }
    // the coat's swing: each part's locks lag behind its motion (a spring on its acceleration, in the part's frame)
    for (const c of coats) {
      c.parent.updateWorldMatrix(true, false);
      const p = V().setFromMatrixPosition(c.parent.matrixWorld);
      if (c.prev && dt > 0) {
        const v = p.clone().sub(c.prev).divideScalar(dt);
        const acc = v.clone().sub(c.vel).divideScalar(Math.max(dt, 1 / 120));
        c.vel.copy(v);
        // the tips trail: opposite the acceleration, eased, at most a few centimetres
        const goal = acc.multiplyScalar(-0.0016).clampLength(0, 0.035);
        c.sway.lerp(goal, Math.min(1, dt * 9));
      }
      c.prev = p;
      _m.copy(c.parent.matrixWorld).invert();
      const local = c.sway.clone().transformDirection(_m).multiplyScalar(c.sway.length() / S);
      c.mat.userData.sway.value.copy(local);
    }
  }
  update(0, {});
  return { group, collar, update, parts: { root, body, neck, head, jaw, tail, legs, earL, earR, eyes } };
}

/* ------------------------------------------------------------- the leash -- */
// A rope of N points (verlet, 6 constraint passes) drawn as a thin tube. update(dt, from, to): from (the hand) and to
// (the collar) pin its ends; from = null lets that end go (it falls and trails, heavy, dragging in the air: a strap
// hangs, it doesn't float). leash.radius can change (thinner in a close-up).
export function buildLeash(THREE, { length = 1.15, color = '#3A8EF0', radius = 0.0075 } = {}) {
  const N = 14, seg = length / (N - 1), RAD = 5;
  const pts = Array.from({ length: N }, () => new THREE.Vector3()), old = pts.map(() => new THREE.Vector3());
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * RAD * 3), nor = new Float32Array(N * RAD * 3), idx = [];
  for (let i = 0; i < N - 1; i++) for (let j = 0; j < RAD; j++) {
    const a = i * RAD + j, b = i * RAD + (j + 1) % RAD, c = a + RAD, d = b + RAD;
    idx.push(a, b, c, b, d, c);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.5, side: THREE.DoubleSide }));
  mesh.frustumCulled = false; mesh.castShadow = true; mesh.name = 'wagmi-leash';
  let placed = false, ground = 0;
  const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function place(from, to) {
    for (let i = 0; i < N; i++) { pts[i].lerpVectors(from, to, i / (N - 1)); pts[i].y -= Math.sin(Math.PI * i / (N - 1)) * 0.15; old[i].copy(pts[i]); }
    placed = true;
  }
  function update(dt, from, to, floor = 0) {
    ground = floor;
    if (!placed) place(from || to, to);
    const h = Math.min(dt, 1 / 30), loose = !from, keepV = loose ? 0.9 : 0.985, g = loose ? 26 : 9.8;
    for (let i = 0; i < N; i++) {
      const p = pts[i], o = old[i], vx = (p.x - o.x) * keepV, vy = (p.y - o.y) * keepV, vz = (p.z - o.z) * keepV;
      o.copy(p); p.x += vx; p.y += vy - g * h * h; p.z += vz;
      if (p.y < ground + radius) { p.y = ground + radius; p.x -= vx * 0.4; p.z -= vz * 0.4; }
    }
    for (let it = 0; it < 6; it++) {
      if (from) pts[0].copy(from);
      pts[N - 1].copy(to);
      for (let i = 0; i < N - 1; i++) {
        const a = pts[i], b = pts[i + 1]; _t.subVectors(b, a); const d = _t.length() || 1e-6, diff = (d - seg) / d;
        const wa = i === 0 && from ? 0 : i + 1 === N - 1 ? 1 : 0.5, wb = i + 1 === N - 1 ? 0 : i === 0 && from ? 1 : 0.5;
        a.addScaledVector(_t, diff * wa); b.addScaledVector(_t, -diff * wb);
      }
      for (const p of pts) if (p.y < ground + radius) p.y = ground + radius;
    }
    // the tube
    for (let i = 0; i < N; i++) {
      _t.subVectors(pts[Math.min(N - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
      _n.crossVectors(_t, up); if (_n.lengthSq() < 1e-6) _n.set(1, 0, 0); _n.normalize(); _b.crossVectors(_t, _n);
      for (let j = 0; j < RAD; j++) {
        const a = j / RAD * Math.PI * 2, cx = Math.cos(a), sy = Math.sin(a), k3 = (i * RAD + j) * 3;
        const nx = _n.x * cx + _b.x * sy, ny = _n.y * cx + _b.y * sy, nz = _n.z * cx + _b.z * sy;
        pos[k3] = pts[i].x + nx * radius; pos[k3 + 1] = pts[i].y + ny * radius; pos[k3 + 2] = pts[i].z + nz * radius;
        nor[k3] = nx; nor[k3 + 1] = ny; nor[k3 + 2] = nz;
      }
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.normal.needsUpdate = true;
  }
  return { mesh, update, reset: () => { placed = false; }, points: pts, get radius() { return radius; }, set radius(r) { radius = r; } };
}
