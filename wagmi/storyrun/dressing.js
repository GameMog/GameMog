// Mog City story runner: what the city wears for a world (its `dressing`), on Mog City's own city. Imported by
// storyrun/index.js only when the world asks for one of these, so a world that asks for none (and the game without
// ?pack=) is the city exactly as it is. Every look is off unless the world names it:
//   blackout: 'midtown' | 'downtown' | 'manhattan'
//            the power is out in that part of Manhattan (the boroughs over the rivers keep theirs): windows, street
//            lights, store lights and billboards dark; the traffic signals dead (dark, or flashing amber); emergency
//            cars with their bars going, stranded cars on their hazards, road flares; generator-lit islands (one bright
//            building, a block party with string lights and a light tower). The streets stay readable: a moonlit fill,
//            and the headlights' bloom held in so they light the road instead of flaring over it.
//   holiday: ['christmas']
//            string lights on the fire escapes and along the storefronts, wreaths, a few Christmas trees (Bryant
//            Park's, Duffy Square's), Santa hats on some of the people on the sidewalks.
//   weather: 'snow'   falling snow round the camera, snow on roofs, ledges, sidewalks, parks and cars, the road wet;
//            'rain' | 'storm'   rain round the camera, the road soaked (Mog City's own puddles, at their wettest),
//            a heavier sky.
// It hooks the time of day (lighting applyPreset and the colour grade's) so a world's own times keep the look, and
// draws its moving parts in a hook just before each frame is rendered (the lights the city sets every frame are
// dimmed after the city sets them).
//   createDressing(W, dressing) -> null (nothing asked) | { want, ready, update(dt), dark(x, z) }
import * as THREE from 'three/webgpu';
import { buildChaseCar } from '../pursuit/cars.js';
import { BLACKOUTS, asksDressing as asks } from './pack.js';

// a small seeded random, so a city dresses the same way every time
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash2 = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createDressing(W, dressing = {}) {
  if (!asks(dressing)) return null;
  const N = window.NYC, T = N.TSL, app = W.app, scene = app.scene;
  const { Fn, float, vec2, vec3, vec4, uniform, mix, smoothstep, step, max, min, abs, fract, sin, cos, dot, length, floor, mod,
    positionWorld, normalWorld, cameraPosition, materialColor, attribute, instanceIndex, time, varying, mrt, color } = T;
  const want = {
    blackout: BLACKOUTS.includes(dressing.blackout) ? dressing.blackout : null,
    christmas: Array.isArray(dressing.holiday) && dressing.holiday.includes('christmas'),
    weather: ['snow', 'rain', 'storm'].includes(dressing.weather) ? dressing.weather : null,
  };
  const out = { want, ready: false, dark: () => 0, parts: {} };
  const U = N.cityUniforms;
  const groups = (names) => names.map((n) => scene.getObjectByName(n)).filter(Boolean);
  const ground = (x, z) => { try { const y = app.controllerManager.getGroundHeight(x, z, 'person'); return Number.isFinite(y) ? y : 0; } catch { return 0; } };
  const Z = (n) => N.streetZ(n);
  const ave = (id) => N.ALL_AVENUES.find((a) => a.id === String(id));
  const STATIC = new THREE.Group(); STATIC.name = 'storyrun-dressing'; scene.add(STATIC);
  // (a transparent effect writes no normal and no roughness: the reflections pass keeps seeing what is behind it)
  const noMRT = () => (mrt ? mrt({ normal: vec4(0, 0, 0, 0), metalRough: vec4(0, 0, 0, 0) }) : null);
  const frame = []; // per frame, just before the render: (dt, t, camera) => void

  // ── the blackout's mask: dark = power out here (0 lit .. 1 dark), the same in the shaders and in JS ──
  const uB = uniform(want.blackout ? 1 : 0), uNorth = uniform(-1e6), uSouth = uniform(1e6);
  const islands = [0, 1, 2, 3].map(() => uniform(new THREE.Vector4(0, 0, 1, 0)));
  if (want.blackout === 'midtown') { uNorth.value = Z(59); uSouth.value = Z(34) - 40; }
  if (want.blackout === 'downtown') { uNorth.value = Z(34) - 40; uSouth.value = 1e6; }
  // (1 at x <= b, 0 at x >= a, for a > b: smoothstep's edges kept in order, as WGSL wants them)
  const down = (a, b, x) => float(1).sub(smoothstep(b, a, x));
  const darkNode = Fn(() => {
    const p = positionWorld;
    const band = smoothstep(uNorth.sub(45), uNorth.add(45), p.z).mul(down(uSouth.add(45), uSouth.sub(45), p.z)).toVar();
    const lit = float(0).toVar();
    for (const u of islands) lit.assign(max(lit, u.w.mul(down(u.z, u.z.mul(0.72), length(p.xz.sub(u.xy))))));
    return uB.mul(band).mul(float(1).sub(lit));
  })();
  const darkJS = (x, z) => {
    if (!uB.value) return 0;
    let lit = 0;
    for (const u of islands) { const v = u.value; if (v.w) lit = Math.max(lit, v.w * sstep(v.z, v.z * 0.72, Math.hypot(x - v.x, z - v.y))); }
    return uB.value * sstep(uNorth.value - 45, uNorth.value + 45, z) * sstep(uSouth.value + 45, uSouth.value - 45, z) * (1 - lit);
  };
  out.dark = darkJS;

  // ── material patches (each material once; city chunks made later are picked up by the rescan) ──
  const patched = { dark: new WeakSet(), snow: new WeakSet() };
  const uSnow = uniform(want.weather === 'snow' ? 1 : 0);
  const SNOW = vec3(0.86, 0.89, 0.93);
  const snowCover = Fn(() => {
    const n = normalWorld.y, p = positionWorld;
    const drift = sin(p.x.mul(0.37).add(sin(p.z.mul(0.29)).mul(2.1))).mul(0.5).add(0.5);
    return uSnow.mul(smoothstep(0.5, 0.86, n)).mul(step(0.07, p.y)).mul(mix(float(0.72), float(1), drift));
  })();
  const isSignalLens = (o) => o.isInstancedMesh && o.count > 0 && Math.abs(o.instanceMatrix.array[13] - 5.42) < 0.06;
  function patchDark(m, o, group) {
    if (patched.dark.has(m)) return; patched.dark.add(m);
    const keep = mix(float(1), float(0.025), darkNode);
    if (m.emissiveNode) { m.emissiveNode = m.emissiveNode.mul(keep); m.needsUpdate = true; return; }
    if (!m.isMeshBasicNodeMaterial) return;
    // (an unlit material is a light: a lamp, a lens, a screen, a sign; the ones with no colour node are textured screens)
    const c = vec4(m.colorNode || materialColor);
    if (group === 'ManhattanStreetDetails' && isSignalLens(o)) {
      // dead signals: dark lenses, and at about half the corners the amber one flashing
      const p = positionWorld, cell = floor(p.xz.div(36));
      const h = fract(sin(dot(cell, vec2(127.1, 311.7))).mul(43758.5453));
      const flashing = step(0.45, h), on = step(0.5, fract(time.mul(0.85).add(h.mul(3.0))));
      const amberLens = float(1).sub(smoothstep(0.08, 0.13, abs(p.y.sub(5.42))));
      const amber = vec3(1.0, 0.56, 0.08).mul(2.6).mul(amberLens).mul(flashing).mul(on).mul(darkNode);
      m.colorNode = vec4(c.rgb.mul(mix(float(1), float(0.06), darkNode)).add(amber), c.a);
    } else {
      m.colorNode = vec4(c.rgb.mul(mix(float(1), float(0.02), darkNode)), c.a);
    }
    m.needsUpdate = true;
  }
  function patchSnow(m) {
    if (patched.snow.has(m) || m.transparent || m.isMeshBasicNodeMaterial || m.isMeshBasicMaterial || !m.isNodeMaterial) return;
    patched.snow.add(m);
    const c = m.colorNode ? vec4(m.colorNode) : vec4(materialColor);
    m.colorNode = vec4(mix(c.rgb, SNOW, snowCover), c.a);
    if (m.roughnessNode) m.roughnessNode = mix(m.roughnessNode, float(0.82), snowCover);
    m.needsUpdate = true;
  }
  const DARK_GROUPS = ['ManhattanCityGrid', 'ManhattanLandmarks', 'ManhattanCityBlocks', 'ManhattanStreetDetails'];
  const SNOW_GROUPS = ['ManhattanCityGrid', 'Boroughs', 'ManhattanLandmarks', 'ManhattanCityBlocks', 'ManhattanStreetDetails', 'ManhattanTrafficAndPedestrians', 'HighwayTraffic'];
  function scan() {
    if (want.blackout) for (const g of groups(DARK_GROUPS)) g.traverse((o) => { const m = o.material; if (m && !Array.isArray(m)) patchDark(m, o, g.name); });
    if (want.weather === 'snow') {
      for (const g of [...groups(SNOW_GROUPS), STATIC]) g.traverse((o) => { if (/People/.test(o.name)) return; const m = o.material; if (m && !Array.isArray(m)) patchSnow(m); });
    }
  }

  // ── the time of day: the world's looks on top of each preset ──
  const ls = app.lightingSystem, cg = app.postFX && app.postFX.colorGrade;
  const night = () => sstep(0.6, 1.4, U.uInteriorGlow.value); // 0 day .. 1 night (the presets' interior glow)
  const precipLight = uniform(new THREE.Color(1, 1, 1));
  function afterLight() {
    const n = night();
    if (want.blackout && n > 0) {
      // a moonlit fill over the dark streets (no crushed blacks), a touch cooler
      ls.hemiLight.intensity *= 1 + 1.7 * n;
      ls.hemiLight.color.lerp(new THREE.Color(0x6f8fc8), 0.35 * n);
      ls.hemiLight.groundColor.lerp(new THREE.Color(0x2a3040), 0.3 * n);
      ls.sunLight.intensity *= 1 + 1.1 * n; // the night presets' sun is the moon
    }
    if (want.weather) {
      const snow = want.weather === 'snow', storm = want.weather === 'storm';
      U.uRoadWetness.value = snow ? 0.82 : 1.0;
      ls.sky.cloudCoverage.value = snow ? 0.95 : storm ? 0.98 : 0.88;
      ls.sky.cloudDensity.value = snow ? 0.8 : storm ? 0.9 : 0.72;
      ls.sunLight.intensity *= snow ? 0.42 : storm ? 0.22 : 0.34;
      ls.hemiLight.intensity *= snow ? 1.12 : 0.9;
      const f = ls.scene.fog, l = f.color.r * 0.3 + f.color.g * 0.55 + f.color.b * 0.15;
      f.color.lerp(new THREE.Color(l * (snow ? 1.35 : 1.0), l * (snow ? 1.38 : 1.02), l * (snow ? 1.45 : 1.08)), 0.65);
      f.density *= snow ? 3.2 : storm ? 3.0 : 2.2;
      if (ls.uFogDensity) ls.uFogDensity.value = f.density;
      U.uSunColor.value.lerp(new THREE.Color(0xc8d0d8), 0.5);
      ls.bakeEnvironmentMap();
    }
    const h = U.uSkyHorizonColor.value, top = U.uSkyTopColor.value, s = U.uSunColor.value;
    precipLight.value.setRGB(h.r * 0.55 + top.r * 0.2 + s.r * h.g * 0.35 + 0.05, h.g * 0.55 + top.g * 0.2 + s.g * h.g * 0.35 + 0.05, h.b * 0.55 + top.b * 0.2 + s.b * h.g * 0.35 + 0.06);
  }
  function afterGrade() {
    if (!cg) return;
    const n = night();
    if (want.blackout && n > 0) {
      // the headlights light the road instead of flaring over it (the owner's review: bloom against a black road)
      cg.bloomPass.strength.value = Math.min(cg.bloomPass.strength.value, 0.3 - 0.16 * n);
      cg.bloomPass.threshold.value = Math.max(cg.bloomPass.threshold.value, 1.0 + 0.7 * n);
      cg.exposure.value *= 1 + 0.2 * n;
    }
    if (want.weather === 'snow') cg.saturation.value *= 0.88;
    if (want.weather === 'rain' || want.weather === 'storm') { cg.saturation.value *= 0.9; cg.contrast.value *= 0.97; }
  }
  if (ls && !ls.__dressed) {
    ls.__dressed = true;
    const ap0 = ls.applyPreset.bind(ls);
    ls.applyPreset = (id, force = false) => {
      const same = !force && ls.activePresetId === id && ls.envRenderTarget !== null;
      ap0(id, force);
      if (!same) { try { afterLight(); } catch (e) { console.warn('[dressing] light', e); } }
    };
  }
  if (cg && !cg.__dressed) {
    cg.__dressed = true;
    const g0 = cg.applyPreset;
    cg.applyPreset = (id) => { g0(id); try { afterGrade(); } catch (e) { console.warn('[dressing] grade', e); } };
  }

  // ── bulbs: one instanced draw for every string light, tree light and lamp (static and around the player) ──
  const BULB_MAX = 26000;
  const bulbColor = new THREE.InstancedBufferAttribute(new Float32Array(BULB_MAX * 3), 3);
  const bulbGeo = new THREE.IcosahedronGeometry(0.065, 0);
  bulbGeo.setAttribute('bulbColor', bulbColor);
  const bulbMat = new THREE.MeshBasicNodeMaterial();
  {
    const tw = sin(time.mul(1.7).add(float(instanceIndex).mul(2.39))).mul(0.22).add(0.88);
    const lit = mix(float(1), float(0.35), smoothstep(0.6, 1.2, U.uInteriorGlow).oneMinus()); // by day a bulb is a bulb
    bulbMat.colorNode = attribute('bulbColor', 'vec3').mul(tw).mul(lit);
  }
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, BULB_MAX);
  bulbs.name = 'storyrun-bulbs'; bulbs.count = 0; bulbs.frustumCulled = false; bulbs.castShadow = false;
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S1 = new THREE.Vector3(1, 1, 1), V = new THREE.Vector3();
  let nBulb = 0, nStatic = 0;
  const PALETTE = { warm: [2.6, 1.9, 1.05], red: [2.8, 0.25, 0.18], green: [0.3, 2.2, 0.55], blue: [0.35, 0.75, 2.8], amber: [2.8, 1.4, 0.2], white: [2.4, 2.4, 2.3] };
  const XMAS = [PALETTE.red, PALETTE.green, PALETTE.warm, PALETTE.blue, PALETTE.amber];
  function bulb(x, y, z, c, s = 1) {
    if (nBulb >= BULB_MAX) return;
    V.set(x, y, z); M4.compose(V, Q, S1.set(s, s, s)); bulbs.setMatrixAt(nBulb, M4);
    bulbColor.array[nBulb * 3] = c[0]; bulbColor.array[nBulb * 3 + 1] = c[1]; bulbColor.array[nBulb * 3 + 2] = c[2];
    nBulb++;
  }
  // a string of bulbs from a to b, sagging, every `gap` metres
  function string(a, b, sag, gap, pick) {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(2, Math.round(d / gap));
    for (let i = 0; i <= n; i++) { const t = i / n; bulb(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t, pick(i)); }
  }
  const flushBulbs = () => { bulbs.count = nBulb; bulbs.instanceMatrix.needsUpdate = true; bulbColor.needsUpdate = true; bulbs.instanceMatrix.clearUpdateRanges?.(); bulbColor.clearUpdateRanges?.(); };
  STATIC.add(bulbs);

  const mats = {
    green: new THREE.MeshStandardNodeMaterial({ color: 0x1d4a2a, roughness: 0.9, emissive: 0x0a2414, emissiveIntensity: 0.6 }),
    bark: new THREE.MeshStandardNodeMaterial({ color: 0x3b2a1c, roughness: 0.95 }),
    star: new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(3.2, 2.5, 1.1) }),
    bow: new THREE.MeshStandardNodeMaterial({ color: 0xa3121a, roughness: 0.55 }),
    steel: new THREE.MeshStandardNodeMaterial({ color: 0x5b6066, roughness: 0.5, metalness: 0.7 }),
    yellow: new THREE.MeshStandardNodeMaterial({ color: 0xd8a516, roughness: 0.5, metalness: 0.3 }),
    lamp: new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(5.0, 4.7, 4.1) }),
    cloth: new THREE.MeshStandardNodeMaterial({ color: 0xe9e4da, roughness: 0.85 }),
    red: new THREE.MeshStandardNodeMaterial({ color: 0x9c1b1b, roughness: 0.7 }),
    black: new THREE.MeshStandardNodeMaterial({ color: 0x141518, roughness: 0.6, metalness: 0.2 }),
    flare: new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(4.5, 0.5, 0.25) }),
    grill: new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(3.0, 0.9, 0.2) }),
  };
  const add = (geo, mat, x, y, z, ry = 0, parent = STATIC) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };

  // ── Christmas trees (the bulbs in the shared draw, the star its own) ──
  function tree(x, z, h) {
    const y0 = ground(x, z), g = new THREE.Group(); g.position.set(x, y0, z); STATIC.add(g);
    add(new THREE.CylinderGeometry(0.06 * h, 0.08 * h, 0.14 * h, 10), mats.bark, 0, 0.07 * h, 0, 0, g);
    const tiers = 6;
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers, r = 0.36 * h * (1 - t * 0.82), y = 0.12 * h + t * 0.72 * h;
      add(new THREE.ConeGeometry(r, 0.3 * h, 18), mats.green, 0, y + 0.15 * h, 0, i * 0.7, g);
    }
    add(new THREE.OctahedronGeometry(0.05 * h, 0), mats.star, 0, 1.02 * h, 0, 0, g).castShadow = false;
    const R = rng(Math.round(x * 7 + z * 13));
    const turns = 7, n = Math.round(60 * h);
    for (let i = 0; i < n; i++) {
      const t = i / n, a = t * turns * Math.PI * 2 + R() * 0.3, y = 0.16 * h + t * 0.82 * h, r = 0.36 * h * (1 - (y / h - 0.12) / 0.72 * 0.82) * 0.98 + 0.02;
      bulb(x + Math.cos(a) * r, y0 + y, z + Math.sin(a) * r, XMAS[Math.floor(R() * XMAS.length)], 0.9 + h * 0.06);
    }
  }

  // ── Christmas: the fire escapes and storefronts round the player (re-strung as the player moves) ──
  const wreathGeo = new THREE.TorusGeometry(0.32, 0.1, 8, 18), bowGeo = new THREE.BoxGeometry(0.2, 0.14, 0.05);
  const WREATH_MAX = 260;
  const wreaths = new THREE.InstancedMesh(wreathGeo, mats.green, WREATH_MAX), bows = new THREE.InstancedMesh(bowGeo, mats.bow, WREATH_MAX);
  wreaths.count = bows.count = 0; wreaths.frustumCulled = bows.frustumCulled = false; wreaths.name = 'storyrun-wreaths';
  let restrungAt = null;
  function restring(cx, cz) {
    restrungAt = [cx, cz];
    nBulb = nStatic;
    const R2 = 330 * 330; let nw = 0;
    const blocks = app.cityBlocks && app.cityBlocks.allBlocks || [];
    for (const b of blocks) {
      if (b.maxX < cx - 340 || b.minX > cx + 340 || b.maxZ < cz - 340 || b.minZ > cz + 340) continue;
      for (const fe of b.fireEscapes || []) {
        const dx = fe.x - cx, dz = fe.z - cz; if (dx * dx + dz * dz > R2) continue;
        const h = hash2(fe.x, fe.z); if (h > 0.5) continue;
        const rot = (fe.ry || 0) + fe.facing, c = Math.cos(rot), s = Math.sin(rot);
        const W2 = (lx, lz) => [fe.x + lx * c + lz * s, fe.z - lx * s + lz * c];
        const pal = h < 0.2 ? [PALETTE.warm] : h < 0.35 ? XMAS : [PALETTE.red, PALETTE.green];
        for (let i = 0; i < fe.landings; i++) {
          const y = fe.y + i * fe.storey + 0.98;
          const [ax, az] = W2(-1.68, 0.56), [bx, bz] = W2(1.68, 0.56);
          string([ax, y, az], [bx, y, bz], 0.16, 0.36, (k) => pal[(k + i) % pal.length]);
        }
      }
      // the street fronts: a swag of lights over some of the shop fronts, now and then a wreath above one
      if (Math.abs(b.ry || 0) < 0.01) {
        const seen = new Set();
        for (const f of b.footprints || []) {
          if (f.h < 6) continue;
          const faces = [];
          if (f.z0 - b.minZ < 0.6) faces.push([f.x0, f.x1, f.z0, -1, 'x']);
          if (b.maxZ - f.z1 < 0.6) faces.push([f.x0, f.x1, f.z1, 1, 'x']);
          for (const [a0, a1, w, o] of faces) {
            for (let u = a0 + 1.5; u + 6 < a1 - 1; u += 7.5) {
              const key = Math.round(u) + ':' + Math.round(w); if (seen.has(key)) continue; seen.add(key);
              const dx = u - cx, dz = w - cz; if (dx * dx + dz * dz > R2) continue;
              const h = hash2(u * 0.71, w * 1.31); if (h > 0.55) continue;
              const pal = h < 0.14 ? [PALETTE.warm] : h < 0.3 ? XMAS : [PALETTE.red, PALETTE.green, PALETTE.warm];
              const zz = w + o * 0.32;
              string([u, 3.9, zz], [u + 3, 3.9, zz], 0.3, 0.33, (i) => pal[i % pal.length]);
              string([u + 3, 3.9, zz], [u + 6, 3.9, zz], 0.3, 0.33, (i) => pal[(i + 1) % pal.length]);
              if (h < 0.1 && nw < WREATH_MAX) {
                Q.setFromEuler(new THREE.Euler(0, o > 0 ? 0 : Math.PI, 0));
                M4.compose(V.set(u + 3, 5.5, w + o * 0.12), Q, S1.set(1, 1, 1)); wreaths.setMatrixAt(nw, M4);
                M4.compose(V.set(u + 3, 5.22, w + o * 0.2), Q, S1); bows.setMatrixAt(nw, M4);
                nw++;
              }
            }
          }
        }
      }
      for (const a of b.awnings || []) {
        const dx = a.x - cx, dz = a.z - cz; if (dx * dx + dz * dz > R2) continue;
        const h = hash2(a.x * 1.7, a.z * 0.9); if (h > 0.75) continue;
        const ry = b.ry || 0, sd = a.sideDir || 1, ox = Math.cos(ry) * sd, oz = -Math.sin(ry) * sd, lx = Math.sin(ry), lz = Math.cos(ry);
        const fx = a.x + ox * 0.95, fz = a.z + oz * 0.95, half = a.d / 2, y = (a.y || 3.8) - 0.3;
        const pal = h < 0.25 ? [PALETTE.warm] : XMAS;
        const swags = Math.max(1, Math.round(a.d / 1.4));
        for (let k = 0; k < swags; k++) {
          const t0 = -half + (a.d * k) / swags, t1 = -half + (a.d * (k + 1)) / swags;
          string([fx + lx * t0, y, fz + lz * t0], [fx + lx * t1, y, fz + lz * t1], 0.22, 0.34, (i) => pal[(i + k) % pal.length]);
        }
        if (h < 0.22 && nw < WREATH_MAX) {
          const wx = a.x - ox * 0.78, wz = a.z - oz * 0.78, yaw = Math.atan2(ox, oz);
          Q.setFromEuler(new THREE.Euler(0, yaw, 0));
          M4.compose(V.set(wx, (a.y || 3.8) + 1.55, wz), Q, S1.set(1, 1, 1)); wreaths.setMatrixAt(nw, M4);
          M4.compose(V.set(wx + ox * 0.08, (a.y || 3.8) + 1.27, wz + oz * 0.08), Q, S1); bows.setMatrixAt(nw, M4);
          nw++;
        }
      }
    }
    Q.identity();
    wreaths.count = bows.count = nw; wreaths.instanceMatrix.needsUpdate = bows.instanceMatrix.needsUpdate = true;
    flushBulbs();
  }

  // ── Santa hats on about a quarter of the near people (the crowds' poses, read after they are written) ──
  const crowds = new Set();
  let hats = null;
  if (want.christmas && N.PersonCrowd && !N.PersonCrowd.prototype.__dressed) {
    const P = N.PersonCrowd.prototype; P.__dressed = true;
    const end0 = P.end; P.end = function () { crowds.add(this); return end0.call(this); };
  }
  if (want.christmas) {
    const merge = N.Addons && N.Addons.mergeGeometries;
    const paint = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g.toNonIndexed ? g.index ? g.toNonIndexed() : g : g; };
    const cone = paint(new THREE.ConeGeometry(0.118, 0.29, 14, 1, true).translate(0, 0.145, 0).applyMatrix4(new THREE.Matrix4().makeRotationX(-0.42)).translate(0, 0.02, -0.02), [0.62, 0.04, 0.05]);
    const brim = paint(new THREE.TorusGeometry(0.112, 0.036, 8, 20).rotateX(Math.PI / 2).translate(0, 0.02, 0), [0.92, 0.9, 0.86]);
    const pom = paint(new THREE.IcosahedronGeometry(0.04, 1).translate(0, 0.235, -0.16), [0.95, 0.93, 0.9]);
    const geo = merge ? merge([cone, brim, pom]) : cone;
    const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.9 });
    hats = new THREE.InstancedMesh(geo, mat, 240); hats.count = 0; hats.frustumCulled = false; hats.name = 'storyrun-hats'; hats.castShadow = true;
    STATIC.add(hats);
  }
  const STRIDE = 31, HEAD = 2, HQ = new THREE.Quaternion(), HT = new THREE.Vector3(), UP = new THREE.Vector3();
  function placeHats() {
    if (!hats) return;
    let n = 0;
    for (const c of crowds) {
      const l = c.lods && c.lods[0]; if (!l || !l.count) continue;
      const a = l.pose.value.array;
      for (let i = 0; i < l.count && n < hats.instanceMatrix.count; i++) {
        const base = i * STRIDE * 4, seed = a[base + (STRIDE - 1) * 4];
        if (fract1(seed * 7.31 + 0.17) > 0.26) continue;
        const o = base + HEAD * 8, s = a[o + 7];
        HQ.set(a[o], a[o + 1], a[o + 2], a[o + 3]);
        UP.set(0, 1.66, 0.006).applyQuaternion(HQ).multiplyScalar(s);
        HT.set(a[o + 4] + UP.x, a[o + 5] + UP.y, a[o + 6] + UP.z);
        M4.compose(HT, HQ, S1.set(s, s, s)); hats.setMatrixAt(n++, M4);
      }
    }
    hats.count = n; if (n) hats.instanceMatrix.needsUpdate = true;
  }
  const fract1 = (x) => x - Math.floor(x);

  // ── the blackout's set: emergency cars, stranded cars, flares, generator islands, a block party ──
  const strobes = [], hazards = [], scenes = [];
  function car(kind, x, z, heading, colorHex) {
    let g;
    if (kind === 'police') { const c = buildChaseCar('police', strobes.length); g = c.group; }
    else {
      const spec = N.BODY_SPECS[kind === 'ambulance' ? 'suv' : kind] || N.BODY_SPECS.sedan;
      g = new THREE.Group();
      const mat = N.createLoftedCarMaterial(spec, colorHex);
      const m = new THREE.Mesh(N.buildCarGeometry(spec, true), mat); m.castShadow = m.receiveShadow = true; g.add(m);
      if (kind === 'ambulance' && N.buildLightbarGeometry) g.add(new THREE.Mesh(N.buildLightbarGeometry(spec), N.createLightbarMaterial()));
      else if (mat.userData.carState) hazards.push(mat.userData.carState);
    }
    g.position.set(x, 0, z); g.rotation.y = heading; STATIC.add(g);
    return g;
  }
  function lightTower(x, z, aimX, aimZ, aimY = 12) {
    const y0 = ground(x, z), g = new THREE.Group(); g.position.set(x, y0, z); STATIC.add(g);
    add(new THREE.BoxGeometry(1.4, 0.9, 2.4), mats.yellow, 0, 0.75, 0, 0, g);
    add(new THREE.CylinderGeometry(0.06, 0.08, 6.5, 8), mats.steel, 0, 4.1, 0, 0, g);
    const yaw = Math.atan2(aimX - x, aimZ - z);
    const head = new THREE.Group(); head.position.y = 7.2; head.rotation.y = yaw; g.add(head);
    for (const [px, py] of [[-0.45, 0.25], [0.45, 0.25], [-0.45, -0.25], [0.45, -0.25]]) {
      const box = add(new THREE.BoxGeometry(0.5, 0.36, 0.14), mats.black, px, py, 0, 0, head);
      add(new THREE.PlaneGeometry(0.44, 0.3), mats.lamp, px, py, 0.075, 0, head).castShadow = false;
      box.rotation.x = -0.25;
    }
    const spot = new THREE.SpotLight(0xfff1dc, 0, 0, 0.62, 0.55, 1.4);
    spot.position.set(x, y0 + 7.2, z); spot.target.position.set(aimX, aimY, aimZ); spot.castShadow = false;
    STATIC.add(spot, spot.target); spot.target.updateMatrixWorld();
    return spot;
  }
  function flares(x, z, n, R) {
    for (let i = 0; i < n; i++) { const fx = x + (R() - 0.5) * 6, fz = z + (R() - 0.5) * 6; add(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), mats.flare, fx, 0.05, fz, 0).rotation.z = Math.PI / 2; }
  }
  let party = null, partySpot = null, flood = null, strobeR = null, strobeB = null;
  function blackoutSet() {
    const R = rng(4242);
    const curb = (id, side, inset = 1.25) => { const a = ave(id); return a ? a.x + side * ((a.width || 18) / 2 - inset) : null; };
    // generator islands: a lit tower east of Bryant Park (seen from the park), a hotel on Seventh Avenue
    islands[0].value.set(44, 30, 34, 1);
    islands[1].value.set(-628, -232, 30, 1);
    const x5 = curb('5', 1, 1.4);
    flood = lightTower(x5, 34, x5 + 24, 30, 26);
    // Times Square: a crash on Seventh Avenue, two cruisers on it, flares (at the curb, clear of the lanes)
    const x7 = curb('7', 1), x7w = curb('7', -1);
    if (x7 != null) {
      const z0 = Z(45) - 18;
      car('police', x7 - 0.6, z0 + 6, Math.PI + 0.4);
      car('police', x7 - 1.2, z0 - 16, Math.PI - 0.15);
      car('sedan', x7 - 0.9, z0 - 4, Math.PI - 0.55, 0x51545a);
      car('suv', x7 - 3.2, z0 - 9.5, Math.PI + 0.9, 0x6a1f22);
      car('sedan', x7w + 0.7, Z(44) - 20, 0.1, 0x2b3140);
      flares(x7 - 4.5, z0 + 2, 6, R);
      scenes.push([x7 - 3, z0 - 4]);
    }
    // Sixth Avenue at Bryant Park: an ambulance with its bar going, a cruiser, a stranded taxi-yellow car
    const x6 = curb('6', 1);
    if (x6 != null) {
      car('ambulance', x6 - 0.4, Z(42) + 30, Math.PI, 0xf3f4f1);
      car('police', x6 - 0.4, Z(42) + 44, Math.PI + 0.1);
      flares(x6 - 2.6, Z(42) + 52, 5, R);
      scenes.push([x6 - 2, Z(42) + 38]);
    }
    // stranded cars at the curbs of Midtown's avenues, hazards on, a few at angles
    const COLS = [0x2b2e33, 0x6c6f75, 0x8b1e24, 0x1c3550, 0xbfbab0, 0x3b4a2f, 0x55402a, 0x1a1a1d];
    for (const id of ['5', '6', '7', '8', 'madison', 'lexington', '3', '2', '9']) {
      const a = ave(id); if (!a) continue;
      for (let k = 0; k < 4; k++) {
        const z = Z(36 + Math.floor(R() * 22)) + (R() - 0.5) * 60, side = R() < 0.5 ? -1 : 1;
        if (darkJS(a.x, z) < 0.5) continue;
        car(R() < 0.3 ? 'suv' : 'sedan', curb(id, side, 1.3 + R() * 0.6), z, (a.dir < 0 ? 0 : Math.PI) + (R() - 0.5) * 0.7, COLS[Math.floor(R() * COLS.length)] + k);
      }
    }
    // the block party on West 46th Street between Eighth and Ninth (Restaurant Row's walk-ups): string lights over the
    // street, a light tower, tables, a grill, a generator, its own warm light
    const zP = Z(46), xs = [-1125, -870];
    const sP = N.STREETS.find((s) => s.number === 46), half = ((sP && sP.width) || 11) / 2;
    const yL = 6.4, wall = half + 4.4;
    for (let x = xs[0]; x < xs[1]; x += 9) string([x, yL, zP - wall], [x + 9, yL, zP + wall], 0.55, 0.42, (i) => [PALETTE.warm, PALETTE.amber, PALETTE.red][i % 3]);
    for (let x = xs[0]; x < xs[1]; x += 9) string([x + 9, yL, zP - wall], [x + 18, yL, zP + wall], 0.55, 0.42, (i) => [PALETTE.warm, PALETTE.green, PALETTE.warm][i % 3]);
    const sw = zP + half + 2.0;
    for (const x of [-1072, -1060, -1048]) {
      const y = ground(x, sw);
      add(new THREE.BoxGeometry(2.4, 0.05, 0.9), mats.cloth, x, y + 0.76, sw);
      for (const dx of [-1.0, 1.0]) add(new THREE.BoxGeometry(0.05, 0.74, 0.7), mats.steel, x + dx, y + 0.37, sw);
      add(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 10), mats.red, x - 0.6, y + 0.93, sw);
      add(new THREE.BoxGeometry(0.5, 0.35, 0.35), mats.red, x + 0.5, y + 0.95, sw - 0.1);
    }
    { const x = -1038, y = ground(x, sw); add(new THREE.BoxGeometry(1.1, 0.5, 0.6), mats.black, x, y + 0.85, sw); add(new THREE.PlaneGeometry(1.0, 0.5).rotateX(-Math.PI / 2), mats.grill, x, y + 1.11, sw).castShadow = false; for (const dx of [-0.5, 0.5]) add(new THREE.BoxGeometry(0.05, 0.6, 0.05), mats.steel, x + dx, y + 0.3, sw); }
    { const x = -1084, y = ground(x, sw); add(new THREE.BoxGeometry(0.9, 0.8, 1.4), mats.yellow, x, y + 0.4, sw); }
    partySpot = lightTower(-1056, zP - half + 1.2, -1060, sw, 0);
    party = new THREE.PointLight(0xffc27a, 0, 26, 1.5); party.position.set(-1061, 3.2, sw - 1.6); STATIC.add(party);
    // a cruiser's pair of lights, moved to the scene nearest the camera
    strobeR = new THREE.PointLight(0xff2a2a, 0, 40, 1.7); strobeB = new THREE.PointLight(0x2a5cff, 0, 40, 1.7);
    STATIC.add(strobeR, strobeB);
    scenes.push([-1058, zP]);
  }

  function christmasSet() {
    const lawn = N.bryantParkLawn || { minX: -277, maxX: -134, minZ: 27, maxZ: 140 };
    tree(lawn.minX + 78, (lawn.minZ + lawn.maxZ) / 2 - 14, 14);
    const x7 = ave('7') ? ave('7').x : -585;
    tree(x7 - 30, Z(45) - 30, 8);
    tree(-1032, Z(46) + 9.2, 3.4);
    tree(-968, Z(46) - 9.2, 3.4);
  }

  // ── rain and snow round the camera (one draw, every drop moved on the GPU) ──
  let precip = null;
  const camRight = uniform(new THREE.Vector3(1, 0, 0)), camUp = uniform(new THREE.Vector3(0, 1, 0));
  function precipitation(kind) {
    const snow = kind === 'snow', count = snow ? 9000 : kind === 'storm' ? 13000 : 10000;
    const box = snow ? new THREE.Vector3(46, 26, 46) : new THREE.Vector3(40, 22, 40);
    const g = new THREE.BufferGeometry(), R = rng(snow ? 77 : 99);
    const seeds = new Float32Array(count * 4 * 4), corners = new Float32Array(count * 4 * 2), idx = new Uint32Array(count * 6);
    const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < count; i++) {
      const s = [R(), R(), R(), R()];
      for (let k = 0; k < 4; k++) { seeds.set(s, (i * 4 + k) * 4); corners.set(C[k], (i * 4 + k) * 2); }
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 4 * 3), 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seeds, 4)); g.setAttribute('corner', new THREE.BufferAttribute(corners, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const seed = attribute('seed', 'vec4'), corner = attribute('corner', 'vec2'), B = vec3(box.x, box.y, box.z);
    const speed = snow ? seed.w.mul(0.5).add(0.9) : seed.w.mul(4).add(kind === 'storm' ? 15 : 12);
    const fall = time.mul(speed);
    const wob = snow ? vec3(sin(time.mul(0.7).add(seed.w.mul(40))).mul(0.55), 0, cos(time.mul(0.55).add(seed.x.mul(30))).mul(0.55)) : vec3(fall.mul(kind === 'storm' ? 0.16 : 0.06), 0, fall.mul(0.03));
    const p = seed.xyz.mul(B).add(wob).sub(vec3(0, fall, 0)).add(vec3(time.mul(snow ? 0.35 : 0), 0, 0));
    const rel = mod(p.sub(cameraPosition).add(B.mul(0.5)), B).sub(B.mul(0.5)).toVar();
    const fade = varying(down(box.x * 0.5, box.x * 0.3, length(rel.xz)).mul(down(box.y * 0.5, box.y * 0.36, abs(rel.y))).mul(smoothstep(0.4, 1.4, length(rel))));
    const up = snow ? camUp : vec3(0, 1, 0);
    const w = snow ? seed.y.mul(0.03).add(0.035) : float(0.013), h = snow ? w : seed.z.mul(0.25).add(kind === 'storm' ? 0.55 : 0.42);
    m.positionNode = cameraPosition.add(rel).add(camRight.mul(corner.x.mul(w))).add(up.mul(corner.y.mul(h)));
    const lit = vec3(precipLight);
    if (snow) {
      m.colorNode = vec4(lit.mul(1.35).add(0.06), down(1.0, 0.35, length(corner)).mul(fade).mul(0.92));
    } else {
      // (rain is grey water whatever the sky's colour: the light's brightness, a little blue)
      const g = dot(lit, vec3(0.3, 0.55, 0.15));
      m.colorNode = vec4(vec3(g.mul(1.25), g.mul(1.3), g.mul(1.42)).add(0.05), float(1).sub(abs(corner.x)).mul(smoothstep(-1, 0.2, corner.y)).mul(fade).mul(kind === 'storm' ? 0.5 : 0.42));
    }
    const mr = noMRT(); if (mr) m.mrtNode = mr;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.name = 'storyrun-' + kind; mesh.castShadow = false;
    scene.add(mesh);
    return mesh;
  }

  // ── build what was asked ──
  try {
    if (want.blackout) blackoutSet();
    if (want.christmas) { christmasSet(); STATIC.add(wreaths, bows); }
    nStatic = nBulb; flushBulbs();
    if (want.weather) precip = precipitation(want.weather);
    scan();
    // the look of the current time again, now with the world's dressing on it
    const id = ls ? ls.activePresetId : null;
    if (id) { ls.applyPreset(id, true); if (cg) cg.applyPreset(id); }
  } catch (e) { console.warn('[dressing] build', e); }

  // ── every frame, after the city has set its lights and just before the render ──
  const lightGroups = groups(['StoreClusteredLights', 'StreetClusteredLights']);
  const cityLights = []; for (const g of lightGroups) g.traverse((o) => { if (o.isLight) cityLights.push(o); });
  let last = performance.now(), clock = 0, rescan = 0;
  const cam = () => app.cameraSystem && app.cameraSystem.camera;
  function update() {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now; clock += dt;
    const c = cam(); if (!c) return;
    const e = c.matrixWorld.elements; camRight.value.set(e[0], e[1], e[2]); camUp.value.set(e[4], e[5], e[6]);
    const n = night();
    if (want.blackout) {
      for (const l of cityLights) if (l.intensity > 0) { const d = darkJS(l.position.x, l.position.z); if (d > 0.001) l.intensity *= 1 - d * 0.985; }
      // the party and the flood light (theirs is generator power: on whatever the time, brightest at night)
      if (partySpot) partySpot.intensity = 1400 * (0.25 + 0.75 * n);
      if (party) party.intensity = 320 * (0.3 + 0.7 * n) * (0.92 + 0.08 * Math.sin(clock * 9.0) * Math.sin(clock * 3.1));
      if (flood) flood.intensity = 5200 * (0.25 + 0.75 * n);
      // the strobes at the emergency scene nearest the camera, red and blue in turn
      let best = null, bd = 1e9;
      for (const s of scenes.slice(0, -1)) { const d = Math.hypot(s[0] - c.position.x, s[1] - c.position.z); if (d < bd) { bd = d; best = s; } }
      if (best && strobeR) {
        const t = (clock * 1.75) % 1, f = (clock * 1.75 * 6) % 1 > 0.45 ? 1 : 0, k = (120 + 380 * n) * (bd < 160 ? 1 : 0);
        strobeR.position.set(best[0] + 0.8, 2.4, best[1]); strobeB.position.set(best[0] - 0.8, 2.4, best[1] + 1.2);
        strobeR.intensity = t < 0.5 ? k * f : 0; strobeB.intensity = t >= 0.5 ? k * f : 0;
      }
      const blink = (clock * 1.5) % 1 < 0.5 ? 1 : 0;
      for (const s of hazards) { s.value.y = blink; s.value.z = blink; }
    }
    if (want.christmas) {
      const p = c.position;
      if (!restrungAt || Math.hypot(p.x - restrungAt[0], p.z - restrungAt[1]) > 120) restring(p.x, p.z);
      placeHats();
    }
    if ((rescan += dt) > 6) { rescan = 0; scan(); }
  }
  // the hook: the city's loop renders with renderPipeline.render() after updating everything
  const rp = app.renderPipeline;
  if (rp && !rp.__dressed) {
    rp.__dressed = true;
    const r0 = rp.render.bind(rp);
    rp.render = (...a) => { try { update(); } catch (e) { if (!out.warned) { out.warned = true; console.warn('[dressing] frame', e); } } return r0(...a); };
  }
  out.update = update;
  out.parts = { bulbs, wreaths, hats, precip, strobes: [strobeR, strobeB].filter(Boolean), party, partySpot, flood, islands: islands.map((u) => u.value.toArray()) };
  out.ready = true;
  console.log('[dressing]', JSON.stringify(want));
  return out;
}
