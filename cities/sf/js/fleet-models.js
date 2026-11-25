(function () {
// js/fleet-models.js (Mog City, Hometown): the town fleet's ready-made cars, window.NYC.Fleet. Their numbers come from
// fleet-data.js (window.NYC.FLEET_DATA, written by tools/vehicles/build-fleet.mjs with the files themselves in
// assets/vehicles/fleet/): realistic models by Daniel Zhabotinsky and Comrade1280 (CC BY 4.0, assets/vehicles/fleet/
// CREDITS.md), cleaned of every badge and maker-like lettering, in the engine's frame (metres, y up, the tyres on y = 0,
// nose +z, the left side +x, the origin midway between the axles).
//   Fleet.data                    FLEET_DATA (models: { id: { file, length, width, height, zF, zR, hw, axle, wheels,
//                                 head, tail, steer, livery, open, paint, proc, cls, noun, label, group } })
//   Fleet.load(id) -> Promise     the model's geometries { body, glass, wheel, wheelR?, lod1, lod2 } (fetched once, lazily:
//                                 a town loads the cars its own fleet drives)
//   Fleet.get(id)                 the loaded model or null (synchronous: the take-any-car and the chase use it)
//   Fleet.material(kind, o)       its materials, shared: kind 'body' (the kit atlas, the paint by instance or uniform,
//                                 the lamps by kind), 'glass', 'wheel'; o: { livery, instanced, hero }
//   Fleet.textures()              the kit's atlases (hi or lo by the graphics tier) and the liveries
// Every part of a model's geometry carries _fleet (vec4, 0..1): x the paint (1: the car's own colour), y the lamp id / 255
// (1 head, 2 tail, 3 brake, 4 indicator, 5 reverse, 6 beacon, 7 roof sign), z the glass kind / 255 (1 window, 2 lamp
// cover), w its flags / 255 (1 cabin, 2 underbody, 4 wheel, 8 glass, 16 plate).
const N = window.NYC;
const { THREE } = N;
const T = N.TSL;
const D = N.FLEET_DATA;
if (!THREE || !T || !D) return;
// (where the files are: the engine's folder, wherever the page is)
const SCRIPT = document.currentScript && document.currentScript.src;
const ROOT = SCRIPT ? new URL('../../../', SCRIPT).href : new URL('./', document.baseURI).href;
const BASE = new URL(D.base, ROOT).href;

const loaded = new Map(); // id -> model
const loading = new Map(); // id -> Promise
let glbMod = null;
// (window.mcNet, js/net-retry.js: the module again when the server was busy, and asked for anew on the next car if it
// still did not load)
const glbUrl = new URL('wagmi/glb.js', ROOT).href;
const glb = () => glbMod || (glbMod = (window.mcNet ? window.mcNet.importRetry(() => import(glbUrl), 'wagmi/glb.js') : import(glbUrl)).catch((e) => { glbMod = null; throw e; }));

function load(id) {
  if (loaded.has(id)) return Promise.resolve(loaded.get(id));
  if (loading.has(id)) return loading.get(id);
  const m = D.models[id];
  if (!m) return Promise.reject(new Error('no fleet model ' + id));
  const p = glb().then((G) => G.loadGLB(BASE + m.file + '?v=' + (m.sha || D.v))).then((gltf) => {
    const geo = {};
    gltf.scene.traverse((o) => { if (o.isMesh) geo[o.name] = o.geometry; });
    for (const g of Object.values(geo)) { g.computeBoundingBox(); g.computeBoundingSphere(); }
    const model = { id, meta: m, geo };
    loaded.set(id, model);
    return model;
  });
  loading.set(id, p);
  p.catch(() => loading.delete(id));
  return p;
}

// ---- the kit's textures ----------------------------------------------------------------------------------------------
let tex = null;
function textures() {
  if (tex) return tex;
  const lo = N.quality && N.quality.tier === 'low';
  const L = new THREE.TextureLoader();
  const one = (f, srgb, onLoad) => {
    const url = BASE + f + '?v=' + D.v;
    // (its image again if the server was busy: js/net-retry.js)
    const t = L.load(url, onLoad, undefined, () => { if (window.mcNet) window.mcNet.textureRetry(t, url, onLoad); });
    t.flipY = false; // (glTF's uv convention: the atlases are laid out top-down like a glTF's own images)
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  };
  const K = D.kit;
  // (the shared atlas at the graphics tier's size; the liveries and a service vehicle's own textures at 512, the
  // traffic's size: seldom seen close, and each its own memory)
  tex = {
    kit: one(lo ? K.lo : K.hi, true), orm: one(lo ? K.ormLo : K.orm, false),
    livery: {}, // (each loaded when a car of its kind is drawn: liveryTex)
    // (a service vehicle's own: its body's texture and ORM, its decals; the pack's lamps; repeating, as its uvs do)
    own: {}, optics: null, lo, one
  };
  return tex;
}
function liveryTex(name) {
  const t = textures(), L = D.kit.livery[name];
  if (!L) return null;
  return t.livery[name] || (t.livery[name] = t.one(L[1], true));
}
function ownTextures(id) {
  const t = textures();
  if (t.own[id]) return t.own[id];
  const rep = (x) => { x.wrapS = x.wrapT = THREE.RepeatWrapping; return x; };
  const m = D.models[id], sfx = '-lo';
  if (!t.optics) t.optics = t.one(D.kit.optics[1], true);
  // (a decal's lettering repainted once loaded where a painter is set, N.fleetDecalPaint[id](image) -> canvas: a town
  // bus's destination sign, traffic.js)
  const repaint = (tx) => { const P = N.fleetDecalPaint && N.fleetDecalPaint[id]; if (!P || !tx.image) return; try { const c = P(tx.image); if (c) { tx.image = c; tx.needsUpdate = true; } } catch (e) { console.warn('[fleet] decal', id, e); } };
  // (a passenger pack's wheels have a texture of their own, m.wheelTex: drawn with the body's they took its colours)
  const wheel = m.wheelTex ? { base: rep(t.one(`${id}-wheel${sfx}.webp`, true)), orm: rep(t.one(`${id}-wheel-orm${sfx}.webp`, false)) } : null;
  return (t.own[id] = { base: rep(t.one(`${id}${sfx}.webp`, true)), orm: rep(t.one(`${id}-orm${sfx}.webp`, false)), decal: m.decal ? t.one(`${id}-decal${sfx}.webp`, true, repaint) : null, optics: rep(t.optics), wheel });
}

// ---- the materials ---------------------------------------------------------------------------------------------------
const mats = new Map();
// (the city's night and the lamps' power, as the lofted cars read them; a page without the city: day, lamps on)
const glow = () => (N.cityUniforms && N.cityUniforms.uInteriorGlow) || (N.__fleetGlow || (N.__fleetGlow = T.uniform(0.3)));
const power = () => N.carLampPower || T.float(1);
// per-instance paint and lamp state (traffic), or a car's own uniforms (the player's car, the chase cars)
function material(kind, o = {}) {
  const key = `${kind}|${o.own || ''}|${o.livery || ''}|${o.instanced ? 1 : 0}|${o.hero ? 1 : 0}|${o.uniforms ? o.uniforms.id : ''}`;
  if (mats.has(key) && !o.uniforms) return mats.get(key);
  const t = textures();
  const own = o.own ? ownTextures(o.own) : null;
  const { attribute, texture, uv, vec3, float, mix, step, smoothstep, max, min, abs, sin, positionLocal, time, color } = T;
  const fl = attribute('_fleet', 'vec4');
  // (a paintable model of its own textures, m.paintable: its body's paint marked in its base texture's alpha, 0.5,
  // tools/vehicles/build-c1280.mjs; the paint goes on there, as light or dark as the texture is against its own colour)
  const ownM = o.own ? D.models[o.own] : null, ownPaint = !!(ownM && ownM.paintable && kind === 'body');
  const wheelOwn = kind === 'wheel' && own && own.wheel ? own.wheel : null;
  const base = texture(wheelOwn ? wheelOwn.base : own ? (kind === 'optics' ? own.optics : own.base) : t.kit, uv());
  const paintMask = ownPaint ? step(base.a, 0.75) : step(0.5, fl.x);
  const lampId = fl.y.mul(255).round();
  const glassKind = fl.z.mul(255).round();
  const is = (v, id) => step(abs(v.sub(id)), 0.25);
  let mat;
  if (kind === 'glass') {
    // (the traffic's glass a plain standard material, cheap to shade over a street full of cars; the player's car's
    // with a clear coat)
    mat = o.hero ? new THREE.MeshPhysicalNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03 })
      : new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, metalness: 0.1, roughness: 0.06 });
    const cover = is(glassKind, 2);
    mat.colorNode = mix(color(0x0a0e12), color(0xf4f6f8), cover);
    mat.opacityNode = mix(float(0.72), float(0.1), cover);
    mats.set(key, mat);
    return mat;
  }
  if (kind === 'decal') {
    // (its alpha test a node, as the trees' in tsl-materials.js: an `alphaTest`, copied onto the shadow passes' one
    // shared material, bumps its version and re-keys every caster drawn after it, each frame; and it casts no shadow)
    mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
    const d = texture(own.decal, uv());
    mat.colorNode = d.rgb; mat.opacityNode = d.a; mat.alphaTestNode = float(0.5);
    mats.set(key, mat);
    return mat;
  }
  const orm = wheelOwn ? texture(wheelOwn.orm, uv()) : own ? (kind === 'optics' ? T.vec4(1, 0.1, 0, 1) : texture(own.orm, uv())) : texture(t.orm, uv());
  // the paint: the instance's colour (or the uniform's), the taxi's and the cruiser's their livery's texture
  const U = o.uniforms;
  const refC = ownPaint ? new THREE.Color(ownM.paint || '#808080') : null;
  const paintOf = () => (o.instanced ? attribute('paintColor', 'vec3') : U ? U.paint : color(refC));
  const paint = ownPaint ? paintOf() : kind === 'wheel' || own ? vec3(1, 1, 1) : paintOf();
  const state = kind === 'wheel' || (own && kind !== 'optics') ? null : o.instanced ? attribute('carState', 'vec4') : U.state;
  const livT = o.livery ? liveryTex(o.livery) : null;
  const liv = livT ? texture(livT, uv()).rgb : null;
  // (an own paintable body: the paint as light or dark as the texel is against the model's own colour, its shading)
  const refLum = refC ? Math.max(0.004, 0.2126 * refC.r + 0.7152 * refC.g + 0.0722 * refC.b) : 1;
  const shade = ownPaint ? min(T.dot(base.rgb, vec3(0.2126, 0.7152, 0.0722)).div(refLum), float(2.2)) : null;
  let paintCol = liv || (ownPaint ? paint.mul(shade) : paint);
  // (a car's own second colour (U.second, set by U.setSplit: a story's two-tone, wagmi/fleet-car.js): over the line
  // U.split.y for a roof, under it for a lower body, a band of half-width U.split.z round it for a beltline; split.x the
  // kind, 0 none)
  if (U && U.second && kind === 'body' && !liv) {
    const sp = U.split, y = positionLocal.y, second = ownPaint ? U.second.mul(shade) : U.second;
    const band = (a) => step(a - 0.5, sp.x).mul(step(sp.x, a + 0.5));
    const two = max(band(1).mul(step(sp.y, y)), max(band(2).mul(step(y, sp.y)), band(3).mul(step(sp.y.sub(sp.z), y)).mul(step(y, sp.y.add(sp.z)))));
    paintCol = mix(paintCol, second, two);
  }
  // (glass seen as opaque in the far LODs: a dark tint)
  const farGlass = is(glassKind, 1);
  let col = mix(base.rgb, paintCol, paintMask);
  col = mix(col, color(0x0b1015), farGlass);
  const paintRough = liv ? float(0.42) : float(0.3), paintMetal = liv ? float(0.1) : float(0.5);
  let rough = mix(orm.g, paintRough, paintMask);
  rough = mix(rough, float(0.06), farGlass);
  let metal = mix(orm.b, paintMetal, paintMask);
  metal = mix(metal, float(0.2), farGlass);
  // (Mog City, the high quality lighting tier, js/sky-occlusion.js: the traffic's paint too a rough dielectric base under a
  // glossy clearcoat, as Ben Houston's enhanced Slop New York a53ddb3 (MIT), and the sky its street lets through)
  const HQ = !o.hero && !!(window.NYC.HQL && window.NYC.HQL.on());
  if (HQ) { rough = mix(rough, liv ? float(0.5) : float(0.42), paintMask); metal = mix(metal, float(0), paintMask); }
  mat = o.hero || HQ ? new THREE.MeshPhysicalNodeMaterial({ clearcoat: 1, clearcoatRoughness: 0.06 }) : new THREE.MeshStandardNodeMaterial();
  mat.colorNode = col;
  mat.roughnessNode = rough;
  mat.metalnessNode = metal;
  mat.aoNode = mix(orm.r, float(1), paintMask);
  if (o.hero || HQ) mat.clearcoatNode = paintMask.mul(liv ? 0.4 : 1);
  if (HQ) window.NYC.HQL.applyOpen(mat, mix(orm.r, float(1), paintMask), { bounce: false });
  if (state) {
    // the lamps: state x brake, y left (+x) indicator, z right, w livery (1 police: its bar flashing; 2 parked: dark)
    const night = smoothstep(0.6, 1.15, glow());
    const lampsOn = float(1).sub(step(1.5, state.w));
    const side = step(0, positionLocal.x); // 1 on the left (+x)
    const blinkOn = max(state.y.mul(side), state.z.mul(float(1).sub(side)));
    const head = is(lampId, 1).mul(night.mul(2.4).add(0.08));
    const tail = is(lampId, 2).mul(night.mul(0.9).add(state.x.mul(2.2)));
    const brake = is(lampId, 3).mul(state.x.mul(2.6).add(night.mul(0.5)));
    const blink = is(lampId, 4).mul(blinkOn).mul(2.8);
    const flash = step(0, sin(time.mul(12).add(side.mul(3.1416))));
    const beacon = is(lampId, 6).mul(step(0.5, state.w)).mul(step(state.w, 1.5)).mul(flash).mul(3.5);
    const sign = is(lampId, 7).mul(night.mul(1.6).add(0.25));
    const lampTint = base.rgb.mul(0.6).add(0.4);
    const em = vec3(1.0, 0.92, 0.8).mul(head)
      .add(vec3(1.0, 0.06, 0.04).mul(tail.add(brake)))
      .add(vec3(1.0, 0.5, 0.06).mul(blink))
      .add(mix(vec3(1.0, 0.08, 0.1), vec3(0.15, 0.35, 1.0), side).mul(beacon))
      .add(vec3(1.0, 0.86, 0.45).mul(sign));
    mat.emissiveNode = em.mul(lampTint).mul(lampsOn).mul(power());
  }
  if (!o.uniforms) mats.set(key, mat);
  return mat;
}
// a car's own lamp and paint uniforms (not instanced): { id, paint, state, set({ paint, brake, left, right, livery }) }
let uid = 0;
function uniforms(paintHex = '#888888') {
  const U = { id: 'u' + uid++, paint: T.uniform(new THREE.Color(paintHex)), state: T.uniform(new THREE.Vector4(0, 0, 0, 0)),
    second: T.uniform(new THREE.Color(paintHex)), split: T.uniform(new THREE.Vector4(0, 0, 0, 0)) };
  U.setPaint = (hex) => U.paint.value.set(hex);
  // (a second colour: kind 'roof' | 'lower' | 'beltline' | 'none', the line's height in the model's frame, the band's half-width)
  U.setSplit = (kind, hex, y = 0, half = 0.05) => { const k = { roof: 1, lower: 2, beltline: 3 }[kind] || 0; U.split.value.set(k, y, half, 0); if (hex) U.second.value.set(hex); };
  U.setState = (brake = 0, left = 0, right = 0, livery = 0) => U.state.value.set(brake, left, right, livery);
  return U;
}

// ---- one car as a scene graph (the player's car, the chase's cruisers): its body, glass and wheels, each wheel a
// steering group (W) holding a spinning one (spin), as the Story Kit's cars do; its paint and lamps its own uniforms
// (a service vehicle: its own textures, its lamps on their own mesh, its decals; a third axle where it has one)
const plain = (geo) => { const q = new THREE.BufferGeometry(); for (const k of ['position', 'normal', 'uv', '_fleet']) if (geo.attributes[k]) q.setAttribute(k, geo.attributes[k]); q.setIndex(geo.index); q.boundingBox = geo.boundingBox; q.boundingSphere = geo.boundingSphere; q.userData.shared = true; return q; };
// every wheel of a model: { front, side, x, y, z, r, rear mesh? }
function wheelsOf(m) {
  const W = m.wheels, out = [];
  for (const side of [1, -1]) {
    out.push({ front: true, side, x: side * W.front.x, y: W.front.y, z: W.front.z, r: W.front.r, rearMesh: false });
    out.push({ front: false, side, x: side * W.rear.x, y: W.rear.y, z: W.rear.z, r: W.rear.r, rearMesh: !!W.rearMesh });
    for (const e of W.extra || []) out.push({ front: !e.rear, side, x: side * e.x, y: e.y, z: e.z, r: e.rear ? W.rear.r : W.front.r, rearMesh: !!(e.rear && W.rearMesh) });
  }
  return out;
}
function buildCar(model, o = {}) {
  const m = model.meta, g = model.geo, own = m.own ? model.id : null;
  const U = o.uniforms || uniforms(o.paint || m.paint || '#ffffff');
  const livery = o.livery !== undefined ? o.livery : m.livery;
  const group = new THREE.Group(); group.name = 'fleet-' + model.id;
  const body = new THREE.Mesh(plain(g.body), material('body', { livery, uniforms: U, hero: !!o.hero, own })); body.name = 'fleet-body';
  const glass = new THREE.Mesh(plain(g.glass), material('glass', { hero: !!o.hero })); glass.name = 'fleet-glass'; glass.renderOrder = 2;
  group.add(body, glass);
  if (g.optics) { const op = new THREE.Mesh(plain(g.optics), material('optics', { uniforms: U, own })); op.name = 'fleet-lamps'; group.add(op); }
  if (g.decal) { const dc = new THREE.Mesh(plain(g.decal), material('decal', { own })); dc.name = 'fleet-decals'; group.add(dc); }
  const wmat = material('wheel', { own });
  const wheels = [];
  for (const w of wheelsOf(m)) {
    const geo = plain(w.rearMesh && g.wheelR ? g.wheelR : g.wheel);
    const W = new THREE.Group(), spin = new THREE.Group(), mesh = new THREE.Mesh(geo, wmat);
    if (w.side < 0) mesh.rotation.y = Math.PI; // (the right side: the same wheel turned round, its outer face out)
    spin.add(mesh); W.add(spin); W.position.set(w.x, w.y, w.z); group.add(W);
    wheels.push({ W, spin, front: w.front, r: w.r, side: w.side });
  }
  // (its decals cast no shadow: they lie on the body, which casts it)
  group.traverse((x) => { if (x.isMesh) { x.castShadow = x.name !== 'fleet-decals'; x.receiveShadow = true; x.userData.shared = true; } });
  return { group, body, glass, wheels, uniforms: U, meta: m, setPaint: U.setPaint, setState: U.setState, setSplit: U.setSplit };
}

N.Fleet = { data: D, base: BASE, load, get: (id) => loaded.get(id) || null, material, uniforms, textures, buildCar, wheelsOf, plain, LAMP: { head: 1, tail: 2, brake: 3, blink: 4, reverse: 5, beacon: 6, sign: 7 } };
})();
