// Mog City: the library's creatures. GameMog's asset library (kind 'creature': the anymove animals and monsters by
// Patch, CC0; copied as they are into assets/library/<id>, CREDITS.md) read in the library's own format (gmasset/1: a
// deflated buffer of the mesh, its skin, its bones and its clips, and the maps beside it), ported from GameMog's runtime
// (lib/runtime/v1.js creatureKit) for Mog City's three/webgpu build.
//   const kit = await loadCreature('creature-horse', { low });   // fetched and built once a session, shared
//   const c = kit.make({ height, name });   // { object, animate(t, dt, s), height, radius, timing, creature, clips, muzzle(), dispose() }
//   c.animate(t, dt, { speed, brawl: { stance, action: { name, id, rate }, ko }, dissolve })
// The way GameMog's creature takes a person's state: it walks and runs with its stride matched to its speed (its paces
// measured from its own travelling clips), plays its strike, hit, jump and special clips for the moves the fight names,
// and falls when it is knocked out. Forward is +z, the feet at y = 0 (scaled by height / its own height).
import * as THREE from 'three/webgpu';

const BASE = new URL('../../assets/library/', import.meta.url).href;
const KITS = new Map();
const inflate = (buf) => new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
const TYPES = { Float32Array, Int8Array, Int16Array, Uint8Array, Uint16Array, Uint32Array };

// a move's name to the kind of clip it plays (GameMog's lib/runtime/creature.js moveKind)
export function moveKind(name) {
  name = String(name || '');
  if (/^hit|stagger|flinch/i.test(name)) return 'hit';
  if (/cast|shoot|fire|spit|zap|beam|throw|blast|breath/i.test(name)) return 'cast';
  if (/getup|rise/i.test(name)) return 'getup';
  if (/roll|dodge/i.test(name)) return 'roll';
  if (/dash|charge|lunge|pounce/i.test(name)) return 'dash';
  return 'strike';
}

/** The kit of one library creature: its geometry, material and clips, made once; make(o) gives each one its bones. */
export function loadCreature(id, { low = false } = {}) {
  const key = id + (low ? '|lo' : '');
  if (KITS.has(key)) return KITS.get(key);
  const p = (async () => {
    const get = async (name) => { const r = await fetch(BASE + id + '/' + name); if (!r.ok) throw new Error(`creature ${id}/${name}: ${r.status}`); return r; };
    const J = await (await get('asset.json')).json();
    if (J.kind !== 'creature') throw new Error(`${id} is not a creature (${J.kind})`);
    const M = J.material || {};
    const bitmap = async (name) => (name ? createImageBitmap(await (await get(name)).blob()) : null);
    const [buf, map, nor, orm] = await Promise.all([get(J.file).then((r) => r.arrayBuffer()).then(inflate), bitmap(low && M.mapLo ? M.mapLo : M.map), low ? null : bitmap(M.normalMap), low ? null : bitmap(M.ormMap)]);
    return build(id, J, buf, { map, nor, orm });
  })();
  p.catch((e) => console.warn('[library] creature', id, e.message));
  KITS.set(key, p);
  return p;
}

function build(id, J, buf, images) {
  const view = (key) => { const L = J.layout[key]; return new TYPES[L.type](buf, L.offset, L.length); };
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(view('pos'), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(view('nor'), 3, true));
  geo.setAttribute('uv', new THREE.BufferAttribute(view('uv'), 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(view('skinIndex'), 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(view('skinWeight'), 4, true));
  geo.setIndex(new THREE.BufferAttribute(view('index'), 1));
  const B = J.bounds, mid = new THREE.Vector3((B.min[0] + B.max[0]) / 2, (B.min[1] + B.max[1]) / 2, (B.min[2] + B.max[2]) / 2);
  // (a skinned mesh's own bounds are its rest pose: a sphere round all of it, with room for its moves)
  geo.boundingSphere = new THREE.Sphere(mid, Math.hypot(B.max[0] - B.min[0], B.max[1] - B.min[1], B.max[2] - B.min[2]) * 0.75);
  const M = J.material || {};
  const tex = (bm, srgb) => { if (!bm) return null; const t = new THREE.Texture(bm); t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; t.needsUpdate = true; return t; };
  const orm = tex(images.orm, false);
  const mat = new THREE.MeshStandardMaterial({ name: id, map: tex(images.map, true), normalMap: tex(images.nor, false), roughnessMap: orm, metalnessMap: orm,
    roughness: orm ? (M.roughness ?? 1) : 0.75, metalness: orm ? (M.metalness ?? 1) : 0.05 });
  const ibm = view('ibm'), names = J.bones.map((b) => b.name);
  // the clips, one AnimationClip each, shared by every one of this kind
  const CL = {};
  for (const c of J.clips) {
    const q = view(c.name + ':q'), tr = view(c.name + ':t'), nb = names.length, n = c.frames, times = new Float32Array(n), tracks = [];
    for (let f = 0; f < n; f++) times[f] = f / c.fps;
    for (let b = 0; b < nb; b++) {
      const vals = new Float32Array(n * 4);
      for (let f = 0; f < n; f++) { const o = (f * nb + b) * 4, x = q[o] / 32767, y = q[o + 1] / 32767, z = q[o + 2] / 32767, w = q[o + 3] / 32767, l = Math.hypot(x, y, z, w) || 1; vals[f * 4] = x / l; vals[f * 4 + 1] = y / l; vals[f * 4 + 2] = z / l; vals[f * 4 + 3] = w / l; }
      tracks.push(new THREE.QuaternionKeyframeTrack(names[b] + '.quaternion', times, vals));
    }
    J.moving.forEach((b, j) => {
      const pv = new Float32Array(n * 3), nm = J.moving.length;
      for (let f = 0; f < n; f++) { pv[f * 3] = tr[(f * nm + j) * 3]; pv[f * 3 + 1] = tr[(f * nm + j) * 3 + 1]; pv[f * 3 + 2] = tr[(f * nm + j) * 3 + 2]; }
      tracks.push(new THREE.VectorKeyframeTrack(names[b] + '.position', times, pv));
    });
    CL[c.name] = new THREE.AnimationClip(c.name, c.duration, tracks);
  }
  const MV = J.moves || {}, SP = J.speeds || {};
  const dur = (name, d) => (CL[name] ? CL[name].duration : d);

  function make(o = {}) {
    const k = o.height > 0 ? Math.max(0.1, Math.min(10, o.height / J.height)) : 1;
    const root = new THREE.Group(), body = new THREE.Group(); body.rotation.y = J.turn || 0; body.scale.setScalar(k); root.add(body);
    root.name = o.name || id;
    const bones = J.bones.map((b) => { const bo = new THREE.Bone(); bo.name = b.name; bo.position.fromArray(b.t); bo.quaternion.fromArray(b.r); bo.scale.fromArray(b.s); return bo; });
    J.bones.forEach((b, i) => { (b.parent >= 0 ? bones[b.parent] : body).add(bones[i]); });
    const inv = bones.map((_, i) => new THREE.Matrix4().fromArray(ibm, i * 16));
    const mesh = new THREE.SkinnedMesh(geo, mat); mesh.castShadow = true; mesh.receiveShadow = true; body.add(mesh);
    root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(bones, inv);
    mesh.bind(skeleton, new THREE.Matrix4());
    const mixer = new THREE.AnimationMixer(body), act = {};
    for (const n of Object.keys(CL)) act[n] = mixer.clipAction(CL[n]);
    // the gaits, always playing, their weights eased between: idle, walk, run (whichever it has)
    const gaits = [MV.idle, MV.walk, MV.run].filter((n, i, a) => n && act[n] && a.indexOf(n) === i);
    const wt = {}; gaits.forEach((n, i) => { act[n].play(); act[n].setEffectiveWeight(i ? 0 : 1); wt[n] = i ? 0 : 1; });
    const timing = {
      strike: { duration: dur(MV.strike, 0.75), contact: dur(MV.strike, 0.75) * 0.45 },
      dash: { duration: dur(MV.strike, 0.9), contact: dur(MV.strike, 0.9) * 0.45 },
      cast: { duration: dur(MV.special || MV.strike, 0.9), contact: dur(MV.special || MV.strike, 0.9) * 0.5 },
      hit: { duration: dur(MV.hit, 0.45), contact: dur(MV.hit, 0.45) * 0.25 },
      getup: { duration: 1.0, contact: 0.5 },
      roll: { duration: dur(MV.jump, 0.6), contact: dur(MV.jump, 0.6) * 0.5 },
    };
    let v = 0, actId = null, one = null, oneT = 0, oneD = 0, koT = 0, wasKo = false, fallSide = 1;
    const H = J.height * k;
    function animate(t, dt, s = {}) {
      dt = Math.max(0, Math.min(0.1, dt || 0));
      const b = s.brawl || {}, speed = Math.max(0, Math.min(40, Number(s.speed) || 0));
      v += (speed - v) * (1 - Math.exp(-8 * dt));
      // a new move: its clip, once, at the length the fight times it by
      const a = b.action;
      if (a && a.id !== actId && !b.ko) {
        actId = a.id;
        const kd = moveKind(a.name);
        const nm = /special|roar|slam|beat|stomp|rear|kick|snap/i.test(String(a.name)) && MV.special ? MV.special
          : kd === 'hit' ? MV.hit : kd === 'cast' ? MV.special || MV.strike : kd === 'roll' ? MV.jump || MV.strike : kd === 'getup' ? null : MV.strike;
        if (nm && act[nm]) {
          if (one && one !== act[nm]) one.fadeOut(0.1);
          one = act[nm]; one.reset(); one.setLoop(THREE.LoopOnce, 1); one.clampWhenFinished = true;
          const want = (timing[kd] || timing.strike).duration / Math.max(0.3, Math.min(3, Number(a.rate) || 1));
          one.timeScale = CL[nm].duration / Math.max(0.1, want); one.setEffectiveWeight(1); one.fadeIn(0.1).play();
          oneT = 0; oneD = want;
        }
      }
      if (one) { oneT += dt; if (oneT >= oneD) { one.fadeOut(0.15); one = null; } }
      // the gait for the speed: idle standing, walk, run past halfway between the two paces
      const ws = (SP.walk || 1.2) * k, rs = (SP.run || 0) * k;
      let g = MV.idle;
      if (v > 0.25 * k && MV.walk) g = MV.run && rs && v > (ws + rs) / 2 ? MV.run : MV.walk;
      const busy = one ? 0.15 : 1;
      for (const n of gaits) {
        wt[n] += ((n === g ? 1 : 0) - wt[n]) * (1 - Math.exp(-10 * dt));
        act[n].setEffectiveWeight(wt[n] * busy);
        act[n].timeScale = n === MV.walk ? Math.max(0.6, Math.min(2.4, v / ws || 1)) : n === MV.run ? Math.max(0.6, Math.min(2.2, v / (rs || ws))) : 1;
      }
      // down: it keels over, holds still, and sinks into the ground after a while (or as s.dissolve says)
      if (b.ko) {
        if (!wasKo) { koT = 0; fallSide = Math.random() < 0.5 ? 1 : -1; if (MV.hit && act[MV.hit]) { if (one) one.fadeOut(0.1); one = act[MV.hit]; one.reset(); one.setLoop(THREE.LoopOnce, 1); one.clampWhenFinished = true; one.timeScale = 1; one.play(); oneT = 0; oneD = 9; } }
        koT += dt;
      } else if (wasKo) { body.rotation.x = 0; body.rotation.z = 0; body.position.set(0, 0, 0); if (one) { one.stop(); one = null; } }
      wasKo = !!b.ko;
      if (b.ko) {
        const f = Math.min(1, koT / 0.6), e = f * f * (3 - 2 * f);
        if (J.plan === 'beast') { body.rotation.z = fallSide * e * 1.45; body.position.y = e * H * 0.12; } else { body.rotation.x = -e * 1.4; body.position.z = -e * H * 0.18; }
        const gone = s.dissolve != null ? 1 - Math.max(0, Math.min(1, Number(s.dissolve))) : Math.max(0, Math.min(1, (koT - 1.6) / 1.0));
        body.position.y -= gone * H * 0.9;
        mixer.update(koT < 0.6 ? dt : 0);
      } else mixer.update(dt);
    }
    const reach = Math.max(J.width, J.length) * k;
    return {
      object: root, body, mesh, skeleton, mixer, actions: act, animate, height: H, scale: k, radius: Math.max(0.3, reach * 0.35), timing, creature: J.plan, model: id,
      clips: Object.keys(CL), moves: MV, speeds: { walk: SP.walk ? SP.walk * k : null, run: SP.run ? SP.run * k : null },
      bone: (name) => bones.find((b) => b.name === name) || null,
      muzzle: () => ({ y: H * (J.plan === 'beast' ? 0.75 : 0.68), forward: reach * 0.45 }),
      // (the kit's geometry, material and clips are shared by every one of this kind and stay; this one's mixer and
      // bones go)
      dispose() { mixer.stopAllAction(); mixer.uncacheRoot(body); root.removeFromParent(); },
    };
  }
  return { id, json: J, clips: CL, make };
}
