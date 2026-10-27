// Mog City: a crash's bits: sparks (bright streaks that fall and die), debris (glass, plastic and paint chips that
// tumble, bounce, lie in the road a while and go) and water (a burst hydrant: a column of drops thrown up and falling
// back, soft mist billowing round it and off the top, spray off the ground where it lands). Sparks and debris are
// instanced meshes; the water is instanced billboards (soft-edged, lit by the hour's sun and sky, capped at a few
// hundred). All always drawn (one tiny instance under the street when idle, so their pipelines are built at the start
// and the first crash doesn't stall).
import * as THREE from 'three/webgpu';
import { attribute, uv, texture, vec2, vec3, vec4, float, length, select, mix, modelViewMatrix, cameraProjectionMatrix, positionGeometry, mrt } from 'three/tsl';

const G = 9.8;
const rnd = (a, b) => a + Math.random() * (b - a);

// the water's two soft sprites, drawn on a canvas at start-up (no files): a puff of mist (left) and a drop (right)
function waterAtlas() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  let seed = 11; const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.save(); g.beginPath(); g.rect(0, 0, 64, 64); g.clip();
  for (let i = 0; i < 18; i++) {
    const a = R() * Math.PI * 2, d = R() * 10, r = 9 + R() * 11, x = 32 + Math.cos(a) * d, y = 32 + Math.sin(a) * d;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }
  g.restore();
  const gr = g.createRadialGradient(96, 32, 0, 96, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(64, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  return t;
}

// The water: up to `max` billboards in one instanced quad (iPos, iDir: the way it moves, iSize: size, stretch, sprite,
// iAlpha). Drops are stretched along their fall on screen. Lit by the hour: the sky's horizon and top and a share of the
// sun (the city's own uniforms, js/tsl-materials.js), so it is pale and bright at noon, warm at golden hour, near dark
// at night. A drop that lands sends up a little spray.
function waterPool(scene, max) {
  const g = new THREE.InstancedBufferGeometry();
  const base = new THREE.PlaneGeometry(1, 1);
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  const A = (n, k) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * k), k); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(n, a); return a; };
  const aPos = A('iPos', 3), aDir = A('iDir', 3), aSize = A('iSize', 3), aAlpha = A('iAlpha', 1);
  g.instanceCount = 1; aPos.array[1] = -200;
  const iPos = attribute('iPos', 'vec3'), iDir = attribute('iDir', 'vec3'), iSize = attribute('iSize', 'vec3'), iAlpha = attribute('iAlpha', 'float');
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const mv = modelViewMatrix.mul(vec4(iPos, 1));
  const dv = modelViewMatrix.mul(vec4(iDir, 0)).xy;
  const L = length(dv);
  const ax = select(L.greaterThan(1e-5), dv.div(L.max(1e-5)), vec2(0, 1));
  const ay = vec2(ax.y.negate(), ax.x);
  const off = ax.mul(positionGeometry.y.mul(iSize.x.mul(iSize.y.add(1)))).add(ay.mul(positionGeometry.x.mul(iSize.x)));
  m.vertexNode = cameraProjectionMatrix.mul(vec4(mv.xy.add(off), mv.z, mv.w));
  const mask = texture(waterAtlas(), uv().mul(vec2(0.5, 1)).add(vec2(iSize.z.mul(0.5), 0))).a;
  const U = window.NYC && window.NYC.cityUniforms;
  const lit = U ? U.uSkyHorizonColor.mul(0.55).add(U.uSkyTopColor.mul(0.2)).add(U.uSunColor.mul(U.uSkyHorizonColor.g.mul(0.35))).add(0.03) : vec3(0.75, 0.82, 0.9);
  // (the drops a touch brighter than the mist: they catch the light)
  m.colorNode = vec4(lit.mul(mix(float(0.92), float(1.15), iSize.z)), mask.mul(iAlpha));
  // (it writes no normal and no roughness: the reflections pass doesn't take the spray for a surface)
  m.mrtNode = mrt({ normal: vec4(0, 0, 0, 0), metalRough: vec4(0, 0, 0, 0) });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.name = 'crash-water';
  scene.add(mesh);
  const list = [];
  const P = { mesh, list,
    // o: { x, y, z, vx, vy, vz, life, size, size1, stretch, alpha, tile (0 mist, 1 drop), grav, drag, fadeIn, gy, drop }
    emit(o) { if (list.length >= max) list.shift(); list.push(Object.assign({ age: 0, stretch: 0, fadeIn: 0, drag: 0, grav: 0 }, o)); },
    update(dt) {
      let n = 0;
      for (let i = 0; i < list.length; i++) {
        const p = list[i]; p.age += dt; if (p.age >= p.life) continue;
        p.vy -= p.grav * dt; if (p.drag) { const f = Math.exp(-p.drag * dt); p.vx *= f; p.vy *= f; p.vz *= f; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        // (a drop back on the ground: gone, a quarter of them in a little spray)
        if (p.drop && p.vy < 0 && p.y < p.gy + 0.03) {
          if (Math.random() < 0.25) list.push({ x: p.x, y: p.gy + 0.08, z: p.z, vx: rnd(-0.6, 0.6), vy: rnd(0.3, 0.8), vz: rnd(-0.6, 0.6), age: 0, life: rnd(0.5, 0.9), size: 0.12, size1: rnd(0.4, 0.6), stretch: 0, alpha: 0.18, tile: 0, grav: 0.8, drag: 2, fadeIn: 0.08 });
          continue;
        }
        list[n++] = p;
      }
      list.length = Math.min(n, max);
      n = list.length;
      const Ps = aPos.array, D = aDir.array, S = aSize.array, Al = aAlpha.array;
      for (let i = 0; i < n; i++) {
        const p = list[i], u = p.age / p.life;
        Ps[i * 3] = p.x; Ps[i * 3 + 1] = p.y; Ps[i * 3 + 2] = p.z;
        D[i * 3] = p.vx; D[i * 3 + 1] = p.vy; D[i * 3 + 2] = p.vz;
        S[i * 3] = p.size + (p.size1 - p.size) * u; S[i * 3 + 1] = p.stretch * Math.min(1.5, Math.hypot(p.vx, p.vy, p.vz) / 8); S[i * 3 + 2] = p.tile;
        Al[i] = p.alpha * (p.fadeIn > 0 ? Math.min(1, p.age / p.fadeIn) : 1) * (1 - u * u);
      }
      if (!n) { Ps[0] = 0; Ps[1] = -200; Ps[2] = 0; S[0] = 0.001; Al[0] = 0; }
      g.instanceCount = Math.max(1, n);
      for (const a of [aPos, aDir, aSize, aAlpha]) { a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(1, n) * a.itemSize); a.needsUpdate = true; }
    },
  };
  return P;
}

export function createFx(scene, ground) {
  const dummy = new THREE.Object3D();
  const _c = new THREE.Color();
  function pool(geo, mat, n, color) {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false;
    if (color) { for (let i = 0; i < n; i++) m.setColorAt(i, _c.setRGB(1, 1, 1)); }
    m.count = 1; dummy.position.set(0, -200, 0); dummy.scale.setScalar(0.001); dummy.updateMatrix(); m.setMatrixAt(0, dummy.matrix);
    scene.add(m);
    return { m, list: [], n };
  }
  const sparkMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(1, 0.62, 0.22).multiplyScalar(5) });
  const sparks = pool(new THREE.BoxGeometry(0.045, 0.045, 1), sparkMat, 260);
  const debrisMat = new THREE.MeshStandardNodeMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.2 });
  const debris = pool(new THREE.BoxGeometry(1, 1, 1), debrisMat, 260, true);
  const water = waterPool(scene, 300);

  // sparks at (x, y, z): n of them, sprayed mostly along (dx, dz) (the way the metal scrapes) and back off the hit
  function spark(x, y, z, dx, dz, n, speed = 8) {
    for (let k = 0; k < n; k++) {
      if (sparks.list.length >= sparks.n) sparks.list.shift();
      const s = rnd(0.4, 1.2) * speed, a = rnd(-0.9, 0.9);
      const c = Math.cos(a), sn = Math.sin(a);
      sparks.list.push({ x, y, z, vx: (dx * c - dz * sn) * s + rnd(-1.5, 1.5), vy: rnd(0.5, 4.5), vz: (dx * sn + dz * c) * s + rnd(-1.5, 1.5), life: 0, max: rnd(0.25, 0.6) });
    }
  }
  // debris: n bits at (x, y, z) flung along (vx, vz) and up; kind 'glass' | 'plastic' | 'paint' (rgb: its colour)
  const GLASS = [0.72, 0.82, 0.86], BLACK = [0.04, 0.04, 0.045], RED = [0.7, 0.04, 0.03];
  function bits(x, y, z, vx, vz, n, kind = 'plastic', rgb = null) {
    for (let k = 0; k < n; k++) {
      if (debris.list.length >= debris.n) debris.list.shift();
      const glass = kind === 'glass', col = glass ? GLASS : kind === 'paint' && rgb ? rgb : Math.random() < 0.18 ? RED : BLACK;
      const sz = glass ? [rnd(0.03, 0.09), 0.008, rnd(0.03, 0.08)] : [rnd(0.05, 0.16), rnd(0.02, 0.05), rnd(0.04, 0.12)];
      debris.list.push({ x: x + rnd(-0.3, 0.3), y, z: z + rnd(-0.3, 0.3), vx: vx * rnd(0.3, 0.9) + rnd(-2.5, 2.5), vy: rnd(1, 5), vz: vz * rnd(0.3, 0.9) + rnd(-2.5, 2.5),
        rx: rnd(0, 6), ry: rnd(0, 6), rz: rnd(0, 6), wx: rnd(-14, 14), wy: rnd(-14, 14), wz: rnd(-14, 14), s: sz, col, life: 0, max: rnd(7, 11), gy: ground(x, z), rest: false, dirty: true });
    }
  }
  // a burst hydrant: a column of water for `dur` s at (x, y, z)
  const jets = [];
  function hydrant(x, y, z, dur = 14) { jets.push({ x, y, z, t: 0, dur, drops: 0, mist: 0, lean: rnd(0, Math.PI * 2) }); }

  function update(dt) {
    // the water: the column (strong at first, easing off): drops thrown up, mist off the column and its top
    for (let j = jets.length - 1; j >= 0; j--) {
      const J = jets[j]; J.t += dt;
      if (J.t > J.dur) { jets.splice(j, 1); continue; }
      const k = J.t < 1 ? 1 : Math.max(0.35, 1 - (J.t - 1) / J.dur);
      const wx = Math.cos(J.lean) * 0.35, wz = Math.sin(J.lean) * 0.35; // (a breath of wind leans it)
      J.drops += dt * 110 * k;
      for (; J.drops >= 1; J.drops--) {
        // (most in a tight core, streaming; the rest thrown wider, breaking into drops)
        // (sized to read from the chase camera: at 10-20 m a few-cm drop is under a pixel and the jet a wisp)
        const core = Math.random() < 0.6, up = rnd(7.5, 10) * (0.6 + 0.4 * k), a = rnd(0, Math.PI * 2), out = core ? rnd(0.04, 0.25) : rnd(0.3, 1.1);
        water.emit({ x: J.x + rnd(-0.05, 0.05), y: J.y + 0.5, z: J.z + rnd(-0.05, 0.05), vx: Math.cos(a) * out + wx, vy: up, vz: Math.sin(a) * out + wz,
          life: 2.6, size: core ? rnd(0.09, 0.13) : rnd(0.05, 0.08), size1: core ? 0.08 : 0.06, stretch: core ? 4.5 : 2.4, alpha: core ? 0.85 : 0.65, tile: 1, grav: G, drag: 0.2, gy: J.y, drop: true });
      }
      J.mist += dt * 26 * k;
      for (; J.mist >= 1; J.mist--) {
        // (the column's own spray, slowing as it climbs and spreading at the top; low ones round the hydrant's foot)
        const low = Math.random() < 0.25, up = low ? rnd(0.4, 1.2) : rnd(6, 9.5) * (0.6 + 0.4 * k), a = rnd(0, Math.PI * 2), out = low ? rnd(0.6, 1.4) : rnd(0.05, 0.4);
        water.emit({ x: J.x, y: J.y + (low ? 0.2 : 0.6), z: J.z, vx: Math.cos(a) * out + wx, vy: up, vz: Math.sin(a) * out + wz,
          life: low ? rnd(0.9, 1.4) : rnd(1.3, 1.9), size: low ? 0.36 : 0.3, size1: low ? rnd(1.1, 1.6) : rnd(1.5, 2.2), alpha: low ? 0.36 : 0.5, tile: 0, grav: 1.5, drag: 1.4, fadeIn: 0.12 });
      }
    }
    let n = 0;
    for (let i = sparks.list.length - 1; i >= 0; i--) {
      const p = sparks.list[i]; p.life += dt;
      if (p.life > p.max) { sparks.list.splice(i, 1); continue; }
      p.vy -= G * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.03) { p.y = 0.03; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
    }
    for (const p of sparks.list) {
      const sp = Math.hypot(p.vx, p.vy, p.vz) + 1e-3, f = 1 - p.life / p.max;
      dummy.position.set(p.x, p.y, p.z); dummy.lookAt(p.x + p.vx, p.y + p.vy, p.z + p.vz);
      dummy.scale.set(f, f, Math.min(0.9, sp * 0.045) * f); dummy.updateMatrix(); sparks.m.setMatrixAt(n++, dummy.matrix);
    }
    finish(sparks, n);
    n = 0;
    for (let i = debris.list.length - 1; i >= 0; i--) {
      const p = debris.list[i]; p.life += dt;
      if (p.life > p.max) { debris.list.splice(i, 1); continue; }
      if (p.rest) continue;
      p.vy -= G * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rx += p.wx * dt; p.ry += p.wy * dt; p.rz += p.wz * dt;
      const floor = p.gy + p.s[1] * 0.5;
      if (p.y < floor) {
        p.y = floor; p.vy = -p.vy * 0.3; p.vx *= 0.55; p.vz *= 0.55; p.wx *= 0.5; p.wy *= 0.5; p.wz *= 0.5;
        if (Math.abs(p.vy) < 0.6 && Math.hypot(p.vx, p.vz) < 0.4) { p.rest = true; p.rx = Math.round(p.rx / Math.PI) * Math.PI; p.rz = Math.round(p.rz / Math.PI) * Math.PI; }
      }
    }
    for (let i = 0; i < debris.list.length; i++) {
      const p = debris.list[i], f = Math.min(1, (p.max - p.life) / 1.2);
      dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(p.rx, p.ry, p.rz);
      dummy.scale.set(p.s[0] * f, p.s[1] * f, p.s[2] * f); dummy.updateMatrix(); debris.m.setMatrixAt(n, dummy.matrix);
      debris.m.setColorAt(n, _c.setRGB(p.col[0], p.col[1], p.col[2])); n++;
    }
    dummy.rotation.set(0, 0, 0);
    finish(debris, n);
    if (debris.list.length && debris.m.instanceColor) debris.m.instanceColor.needsUpdate = true;
    water.update(dt);
  }
  function finish(P, n) {
    if (n === 0) { dummy.position.set(0, -200, 0); dummy.scale.setScalar(0.001); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); P.m.setMatrixAt(0, dummy.matrix); n = 1; }
    P.m.count = n;
    const a = P.m.instanceMatrix; a.clearUpdateRanges(); a.addUpdateRange(0, n * 16); a.needsUpdate = true;
  }
  const busy = () => sparks.list.length + debris.list.length + water.list.length + jets.length;
  return { spark, bits, hydrant, update, busy, meshes: [sparks.m, debris.m, water.mesh] };
}
