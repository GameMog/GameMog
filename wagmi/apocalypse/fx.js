// SF 2040: what moves in the air. Every effect is one draw, its particles moved on the GPU from their seeds and the
// clock (as the story runner's rain and snow are, wagmi/storyrun/dressing.js):
//   ash      grey flakes drifting down round the camera, and a few embers going up
//   fires    up to MAX_FIRES burning at once (anchors given by debris.js and camps.js, the nearest the camera chosen
//            each half second): flames (additive, bright enough to bloom) and a dark smoke column from each; a few
//            point lights flicker on the nearest
//   plumes   a few great smoke columns standing over the skyline, the Presidio's the biggest, lit red from below
import * as THREE from 'three/webgpu';

export const MAX_FIRES = 28;
const LIGHTS = 6;

export function createFX(W) {
  const app = W.app, scene = app.scene, N = window.NYC, T = N.TSL;
  const { float, vec3, vec4, uniform, uniformArray, attribute, time, mix, smoothstep, max, min, abs, fract, sin, cos, dot, length, mod, int, exp,
    cameraPosition, varying, mrt, positionWorld } = T;
  const noMRT = () => (mrt ? mrt({ normal: vec4(0, 0, 0, 0), metalRough: vec4(0, 0, 0, 0) }) : null);
  const camRight = uniform(new THREE.Vector3(1, 0, 0)), camUp = uniform(new THREE.Vector3(0, 1, 0));
  // the light the effects are lit by (set from the look: the sky's and the sun's colour)
  const ambient = uniform(new THREE.Color(0.5, 0.42, 0.36));
  const haze = uniform(new THREE.Color(0.48, 0.34, 0.27)), hazeDensity = uniform(0.001);
  const wind = uniform(new THREE.Vector3(1.4, 0, 0.6));
  const parts = [];

  // a mesh of `count` quads, each with a seed (vec4) and its corner
  function quads(count, seedFn) {
    const g = new THREE.BufferGeometry();
    const seeds = new Float32Array(count * 16), corners = new Float32Array(count * 8), idx = new Uint32Array(count * 6);
    const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < count; i++) {
      const s = seedFn(i);
      for (let k = 0; k < 4; k++) { seeds.set(s, (i * 4 + k) * 4); corners.set(C[k], (i * 4 + k) * 2); }
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 12), 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
    g.setAttribute('corner', new THREE.BufferAttribute(corners, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    return g;
  }
  function mesh(g, m, name, order) {
    const mr = noMRT(); if (mr) m.mrtNode = mr;
    const o = new THREE.Mesh(g, m); o.frustumCulled = false; o.renderOrder = order; o.name = name; o.castShadow = false; o.receiveShadow = false;
    scene.add(o); parts.push(o); return o;
  }
  let sd = 1234567;
  const R = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);

  // ── ash ──
  {
    const count = 5200, box = new THREE.Vector3(48, 26, 48), B = vec3(box.x, box.y, box.z);
    const g = quads(count, () => [R(), R(), R(), R()]);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const seed = attribute('seed', 'vec4'), corner = attribute('corner', 'vec2');
    const fall = time.mul(seed.w.mul(0.5).add(0.45));
    const drift = vec3(wind.x, 0, wind.z).mul(time).add(vec3(sin(time.mul(0.6).add(seed.w.mul(40))).mul(0.8), 0, cos(time.mul(0.47).add(seed.x.mul(30))).mul(0.8)));
    const p = seed.xyz.mul(B).add(drift).sub(vec3(0, fall, 0));
    const rel = mod(p.sub(cameraPosition).add(B.mul(0.5)), B).sub(B.mul(0.5)).toVar();
    const fade = varying(smoothstep(box.x * 0.5, box.x * 0.3, length(rel.xz)).mul(smoothstep(box.y * 0.5, box.y * 0.35, abs(rel.y))).mul(smoothstep(1.6, 4.5, length(rel))));
    // (a flake tumbles: its width breathes)
    const w = seed.y.mul(0.018).add(0.014), tumble = abs(sin(time.mul(seed.z.mul(3).add(1.5)).add(seed.x.mul(50)))).mul(0.7).add(0.3);
    m.positionNode = cameraPosition.add(rel).add(camRight.mul(corner.x.mul(w).mul(tumble))).add(camUp.mul(corner.y.mul(w)));
    const shade = seed.z.mul(0.35).add(0.55);
    m.colorNode = vec4(vec3(ambient).mul(shade).add(0.04), smoothstep(1.0, 0.4, length(corner)).mul(fade).mul(0.85));
    mesh(g, m, 'apoc-ash', 6);
  }
  // ── embers: going up, drifting, flickering ──
  {
    const count = 260, box = new THREE.Vector3(70, 34, 70), B = vec3(box.x, box.y, box.z);
    const g = quads(count, () => [R(), R(), R(), R()]);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const seed = attribute('seed', 'vec4'), corner = attribute('corner', 'vec2');
    const rise = time.mul(seed.w.mul(1.0).add(0.5));
    const drift = vec3(wind.x, 0, wind.z).mul(time.mul(1.4)).add(vec3(sin(time.mul(1.3).add(seed.w.mul(40))).mul(1.2), 0, cos(time.mul(1.1).add(seed.x.mul(30))).mul(1.2)));
    const p = seed.xyz.mul(B).add(drift).add(vec3(0, rise, 0));
    const rel = mod(p.sub(cameraPosition).add(B.mul(0.5)), B).sub(B.mul(0.5)).toVar();
    const fade = varying(smoothstep(box.x * 0.5, box.x * 0.3, length(rel.xz)).mul(smoothstep(box.y * 0.5, box.y * 0.3, abs(rel.y))).mul(smoothstep(0.5, 2.0, length(rel))));
    const w = seed.y.mul(0.025).add(0.025);
    m.positionNode = cameraPosition.add(rel).add(camRight.mul(corner.x.mul(w))).add(camUp.mul(corner.y.mul(w)));
    const flick = sin(time.mul(seed.z.mul(9).add(4)).add(seed.x.mul(70))).mul(0.5).add(0.5);
    m.colorNode = vec4(vec3(4.0, 1.3, 0.25).mul(flick.mul(0.8).add(0.2)).mul(smoothstep(1.0, 0.0, length(corner))).mul(fade), 1.0);
    mesh(g, m, 'apoc-embers', 7);
  }

  // ── fires: anchors (x, y, z, size; size 0 = out) ──
  const anchors = Array.from({ length: MAX_FIRES }, () => new THREE.Vector4(0, -1000, 0, 0));
  const uAnch = uniformArray(anchors, 'vec4');
  const FLAMES = 9, SMOKE = 16;
  function fireSeeds(per) { return (i) => [Math.floor(i / per) + 0.5, R(), R(), R()]; }
  {
    // flames: tongues licking up from the anchor, shrinking as they rise
    const g = quads(MAX_FIRES * FLAMES, fireSeeds(FLAMES));
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const seed = attribute('seed', 'vec4'), corner = attribute('corner', 'vec2');
    const A = uAnch.element(int(seed.x)), S = A.w;
    const t = fract(time.mul(seed.w.mul(0.9).add(1.3)).add(seed.y));
    const off = vec3(seed.y.sub(0.5).mul(0.9), t.mul(1.5), seed.z.sub(0.5).mul(0.9)).mul(S);
    const size = S.mul(float(1).sub(t).mul(0.55).add(0.18));
    m.positionNode = A.xyz.add(off).add(camRight.mul(corner.x.mul(size).mul(0.7))).add(camUp.mul(corner.y.add(0.6).mul(size)));
    const shape = smoothstep(1.0, 0.0, length(vec3(corner.x.mul(1.2), corner.y.mul(0.8), 0))).mul(float(1).sub(t));
    const hot = mix(vec3(5.0, 2.4, 0.7), vec3(3.2, 0.6, 0.08), t);
    m.colorNode = vec4(hot.mul(shape).mul(0.38), 1.0);
    mesh(g, m, 'apoc-flames', 8);
  }
  {
    // smoke: dark puffs rising from each fire, growing, leaning with the wind, thinning out
    const g = quads(MAX_FIRES * SMOKE, fireSeeds(SMOKE));
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const seed = attribute('seed', 'vec4'), corner = attribute('corner', 'vec2');
    const A = uAnch.element(int(seed.x)), S = A.w;
    const t = fract(time.mul(seed.w.mul(0.03).add(0.05)).add(seed.y));
    const h = t.mul(22).mul(S.add(0.3));
    const off = vec3(wind.x, 0, wind.z).mul(h.mul(0.35)).add(vec3(sin(seed.z.mul(30).add(time.mul(0.3))).mul(t).mul(2.0), h.add(S.mul(0.8)), cos(seed.y.mul(30).add(time.mul(0.27))).mul(t).mul(2.0)));
    const size = S.mul(0.6).add(0.4).mul(t.mul(5.5).add(0.9));
    const pos = A.xyz.add(off);
    m.positionNode = pos.add(camRight.mul(corner.x.mul(size))).add(camUp.mul(corner.y.mul(size)));
    const puff = smoothstep(1.0, 0.15, length(corner)).mul(sin(corner.x.mul(3.0).add(seed.z.mul(20))).mul(0.12).add(0.88));
    const life = smoothstep(0.0, 0.06, t).mul(smoothstep(1.0, 0.45, t));
    const base = mix(vec3(0.9, 0.35, 0.1), vec3(ambient).mul(0.16).add(0.012), smoothstep(0.0, 0.12, t));
    m.colorNode = vec4(base, puff.mul(life).mul(0.62).mul(smoothstep(0.0, 0.01, S)));
    mesh(g, m, 'apoc-smoke', 7);
  }

  // ── plumes over the skyline: each anchor (x, z, height scale, glow) ──
  const PLUMES = [
    [-3700, -1150, 1.7, 1.0], // the Presidio: where Erebus came down
    [-2700, -2200, 1.0, 0.6],
    [1500, 1900, 0.9, 0.3],   // Mission Bay
    [-1200, 2600, 0.8, 0.25], // the Mission
    [500, -2400, 0.7, 0.2],   // the northern waterfront
    [-3600, 600, 1.1, 0.5],   // the Richmond
  ];
  {
    const PER = 46;
    const g = quads(PLUMES.length * PER, (i) => { const k = Math.floor(i / PER), P = PLUMES[k]; return [P[0], P[1], k * 10 + R(), R()]; });
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const seed = attribute('seed', 'vec4'), corner = attribute('corner', 'vec2');
    const PP = uniformArray(PLUMES.map((P) => new THREE.Vector4(P[2], P[3], 0, 0)), 'vec4');
    const k = int(T.floor(seed.z.div(10))), r = fract(seed.z), pp = PP.element(k), sc = pp.x;
    const t = fract(time.mul(0.004).add(r));
    const hgt = t.mul(950).mul(sc);
    const lean = vec3(wind.x, 0, wind.z).mul(hgt.mul(0.35));
    const base = vec3(seed.x, 0, seed.y);
    const wob = vec3(sin(seed.w.mul(40).add(t.mul(6))).mul(t).mul(80), 0, cos(seed.w.mul(37).add(t.mul(5))).mul(t).mul(80));
    const size = t.mul(230).add(60).mul(sc);
    const pos = base.add(lean).add(wob).add(vec3(0, hgt.add(20), 0));
    m.positionNode = pos.add(camRight.mul(corner.x.mul(size))).add(camUp.mul(corner.y.mul(size)));
    const puff = smoothstep(1.0, 0.2, length(corner));
    const life = smoothstep(0.0, 0.14, t).mul(smoothstep(1.0, 0.6, t));
    // (a column a long way off is seen through the haze: toward its colour with distance, as the city's fog does)
    const d = length(pos.sub(cameraPosition));
    const tau = hazeDensity.mul(d).mul(0.42), fogged = float(1).sub(exp(tau.mul(tau).negate())).mul(0.85);
    const glowK = smoothstep(0.18, 0.0, t).mul(pp.y);
    const smoke = mix(vec3(ambient).mul(0.22).add(0.02), vec3(1.6, 0.42, 0.1), glowK);
    m.colorNode = vec4(mix(smoke, vec3(haze), fogged), puff.mul(life).mul(0.5));
    mesh(g, m, 'apoc-plumes', 4);
  }

  // ── the nearest fires' lights ──
  const lights = [];
  for (let i = 0; i < LIGHTS; i++) { const l = new THREE.PointLight(0xff7a2a, 0, 16, 1.6); l.position.set(0, -1000, 0); l.castShadow = false; scene.add(l); lights.push(l); }

  // fire sources: { x, y, z, s } (debris.js and camps.js keep their lists here)
  const sources = new Map(); // owner -> list
  let pickT = 0, clock = 0, chosen = [];
  function pick(c) {
    const all = [];
    for (const list of sources.values()) for (const f of list) { f.d = Math.hypot(f.x - c.position.x, f.z - c.position.z); if (f.d < 320) all.push(f); }
    all.sort((a, b) => a.d - b.d);
    chosen = all.slice(0, MAX_FIRES);
    for (let i = 0; i < MAX_FIRES; i++) {
      const f = chosen[i];
      if (f) anchors[i].set(f.x, f.y, f.z, f.s); else anchors[i].set(0, -1000, 0, 0);
    }
  }
  function update(dt, c) {
    clock += dt;
    const e = c.matrixWorld.elements; camRight.value.set(e[0], e[1], e[2]); camUp.value.set(e[4], e[5], e[6]);
    if ((pickT -= dt) <= 0) { pickT = 0.5; pick(c); }
    for (let i = 0; i < LIGHTS; i++) {
      const l = lights[i], f = chosen[i];
      if (!f || f.d > 140) { l.intensity = 0; l.position.set(0, -1000, 0); continue; }
      const fl = 0.75 + 0.15 * Math.sin(clock * 11 + i * 3) + 0.1 * Math.sin(clock * 23.7 + i);
      l.position.set(f.x, f.y + 1.2 * f.s + 0.4, f.z);
      l.intensity = 55 * f.s * fl * Math.min(1, (140 - f.d) / 40);
      l.distance = 10 + 8 * f.s;
    }
  }
  function setLook(p, lightingSystem) {
    // effects lit by the look's own light: the hemisphere's sky and the sun, dimmed at night
    const h = new THREE.Color(p.hemiSky).multiplyScalar(p.hemiIntensity * 0.45);
    const s = new THREE.Color(p.sunColor).multiplyScalar(Math.min(1, p.sunIntensity / 4) * 0.35);
    ambient.value.copy(h.add(s));
    haze.value.setHex(p.fogColor).multiplyScalar(p.nightFactor > 0.5 ? 1.2 : 0.95);
    hazeDensity.value = p.fogDensity;
  }
  return { update, setLook, sources, parts, lights, anchors, get fires() { return chosen.length; } };
}
