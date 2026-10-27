// Mog City: the fight's effects: GPU-instanced billboard particles (hit sparks, flashes, rings, sweat, dust), drawn
// with TSL node materials (WebGPU: no ShaderMaterial). One instanced quad per pool; each particle a billboard stretched
// along its own motion on screen. The textures are drawn on canvases at start-up (no files). Colours are linear HDR: the
// city's bloom picks up anything over 1.
import * as THREE from 'three/webgpu';
import { attribute, uv, texture, vec2, vec4, float, length, select, modelViewMatrix, cameraProjectionMatrix, positionGeometry, floor, mod } from 'three/tsl';
import { clamp, rnd } from './util.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}
// the atlas (2 x 2): soft glow, four-point star, ring, smoke puff
function atlasTex() {
  return canvasTex(256, (g, S) => {
    const h = S / 2;
    let gr = g.createRadialGradient(h / 2, h / 2, 0, h / 2, h / 2, h / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.65)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, h, h);
    g.save(); g.translate(h + h / 2, h / 2);
    for (const [sx, sy, rot] of [[1, 0.06, 0], [0.06, 1, 0], [0.55, 0.035, 1], [0.035, 0.55, 1]]) {
      g.save(); if (rot) g.rotate(Math.PI / 4);
      const r = h / 2; gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.scale(sx, sy); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); g.restore();
    }
    g.restore();
    g.save(); g.translate(h / 2, h + h / 2);
    for (let i = 0; i < 3; i++) { g.strokeStyle = `rgba(255,255,255,${[0.25, 1, 0.25][i]})`; g.lineWidth = [10, 4, 10][i]; g.beginPath(); g.arc(0, 0, h * 0.4, 0, Math.PI * 2); g.stroke(); }
    g.restore();
    g.save(); g.translate(h + h / 2, h + h / 2);
    let seed = 7; const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const a = R() * Math.PI * 2, d = R() * h * 0.22, r = h * (0.1 + R() * 0.16);
      gr = g.createRadialGradient(Math.cos(a) * d, Math.sin(a) * d, 0, Math.cos(a) * d, Math.sin(a) * d, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(-h / 2, -h / 2, h, h);
    }
    g.restore();
  });
}

class Particles {
  constructor(scene, tex, additive, max = 700) {
    this.max = max; this.list = [];
    const g = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    const A = (n, k) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * k), k); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(n, a); return a; };
    this.aPos = A('iPos', 3); this.aDir = A('iDir', 3); this.aSize = A('iSize', 3); this.aCol = A('iCol', 4);
    g.instanceCount = 0;
    const iPos = attribute('iPos', 'vec3'), iDir = attribute('iDir', 'vec3'), iSize = attribute('iSize', 'vec3'), iCol = attribute('iCol', 'vec4');
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, fog: false });
    // a billboard in view space, its long side along the particle's own direction on screen (iSize: size, stretch, tile)
    const mv = modelViewMatrix.mul(vec4(iPos, 1));
    const dv = modelViewMatrix.mul(vec4(iDir, 0)).xy;
    const L = length(dv);
    const ax = select(L.greaterThan(1e-5), dv.div(L.max(1e-5)), vec2(1, 0));
    const ay = vec2(ax.y.negate(), ax.x);
    const len = iSize.x.mul(iSize.y.add(1));
    const off = ax.mul(positionGeometry.x.mul(len)).add(ay.mul(positionGeometry.y.mul(iSize.x)));
    m.vertexNode = cameraProjectionMatrix.mul(vec4(mv.xy.add(off), mv.z, mv.w));
    const tile = iSize.z, tx = mod(tile, 2), ty = floor(tile.div(2));
    const mask = texture(tex, uv().add(vec2(tx, float(1).sub(ty))).mul(0.5)).a;
    const a = mask.mul(iCol.w);
    m.colorNode = vec4(iCol.xyz, a);
    if (additive) m.blending = THREE.AdditiveBlending;
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 20 : 19;
    this.mesh.name = additive ? 'fight-fx-add' : 'fight-fx-alpha';
    scene.add(this.mesh); this.geo = g;
  }
  // o: { pos, vel, life, size, size1, stretch, color: [r, g, b], alpha, tile, drag, grav, fadeIn, dir }
  emit(o) {
    if (this.list.length >= this.max) this.list.shift();
    const p = { pos: o.pos.clone(), vel: (o.vel || _v.set(0, 0, 0)).clone(), life: o.life || 0.3, age: 0, size: o.size ?? 0.2, size1: o.size1 ?? o.size ?? 0.2,
      stretch: o.stretch || 0, color: o.color || [1, 1, 1], alpha: o.alpha ?? 1, tile: o.tile || 0, drag: o.drag || 0, grav: o.grav || 0, fadeIn: o.fadeIn || 0, dir: o.dir ? o.dir.clone() : null };
    this.list.push(p); return p;
  }
  update(dt) {
    const L = this.list; let n = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i]; p.age += dt; if (p.age >= p.life) continue;
      p.vel.y -= p.grav * dt; if (p.drag) p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      L[n++] = p;
    }
    L.length = n;
    const P = this.aPos.array, D = this.aDir.array, S = this.aSize.array, C = this.aCol.array;
    for (let i = 0; i < n; i++) {
      const p = L[i], u = p.age / p.life;
      P[i * 3] = p.pos.x; P[i * 3 + 1] = p.pos.y; P[i * 3 + 2] = p.pos.z;
      const d = p.dir || p.vel; D[i * 3] = d.x; D[i * 3 + 1] = d.y; D[i * 3 + 2] = d.z;
      S[i * 3] = p.size + (p.size1 - p.size) * u; S[i * 3 + 1] = p.stretch * clamp(p.vel.length() / 12, 0, 1.5); S[i * 3 + 2] = p.tile;
      const fi = p.fadeIn > 0 ? clamp(p.age / p.fadeIn, 0, 1) : 1;
      C[i * 4] = p.color[0]; C[i * 4 + 1] = p.color[1]; C[i * 4 + 2] = p.color[2]; C[i * 4 + 3] = p.alpha * fi * (1 - u) * (1 - u * 0.3);
    }
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    for (const a of [this.aPos, this.aDir, this.aSize, this.aCol]) { a.needsUpdate = true; a.clearUpdateRanges?.(); a.addUpdateRange?.(0, Math.max(1, n) * a.itemSize); }
  }
}

// a red ring on the street round a brute winding up a ground slam (his reach: be outside it when it lands), and a
// fill in it that grows to the ring as the slam comes (the cue's clock, on the ground)
function groundRing(scene) {
  const mk = (geo, op) => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending });
    m.color.setRGB(1.5, 0.1, 0.07); m.opacity = op; // (kept under the bloom: it reads red, not white)
    const o = new THREE.Mesh(geo, m); o.rotation.x = -Math.PI / 2; o.renderOrder = 18; o.frustumCulled = false; o.visible = false; scene.add(o);
    return o;
  };
  const ring = mk(new THREE.RingGeometry(0.93, 1, 64), 0.9), fill = mk(new THREE.CircleGeometry(1, 48), 0.22);
  let on = null;
  return {
    meshes: [ring, fill],
    // show(at, r, k): k 0..1 how near the slam is (null hides it)
    set(at, r, k) {
      if (k == null) { if (on) { ring.visible = fill.visible = false; on = null; } return; }
      on = true; ring.visible = fill.visible = true;
      ring.position.set(at.x, at.y + 0.04, at.z); fill.position.set(at.x, at.y + 0.035, at.z);
      ring.scale.setScalar(r); fill.scale.setScalar(Math.max(0.05, r * clamp(k, 0, 1)));
      const pulse = 0.75 + 0.25 * Math.sin(k * 26);
      ring.material.opacity = 0.55 + 0.4 * pulse * k; fill.material.opacity = 0.1 + 0.2 * k;
    },
    on: () => !!on,
  };
}

export function createFx(scene) {
  const atlas = atlasTex();
  const add = new Particles(scene, atlas, true, 900);
  const alpha = new Particles(scene, atlas, false, 300);
  const gr = groundRing(scene);
  const fx = {
    add, alpha,
    ring: gr.set, ringOn: gr.on,
    // a blow landing: a bright flash, a star, streak sparks; a heavy one a ring and a puff of sweat too
    hit(pos, dir, { heavy = 0, color = [6, 4.6, 2.6] } = {}) {
      const s = 1 + heavy;
      add.emit({ pos, life: 0.07 + 0.04 * heavy, size: 0.26 * s, size1: 0.48 * s, color: [6.5, 5.5, 4.2], alpha: 0.85, tile: 0 });
      add.emit({ pos, dir: _v.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)), life: 0.08 + 0.04 * heavy, size: 0.38 * s, size1: 0.66 * s, color, tile: 1 });
      const n = 10 + Math.round(heavy * 14);
      for (let i = 0; i < n; i++) {
        const v = _v2.set(rnd(-1, 1), rnd(-0.6, 1), rnd(-1, 1)).normalize().addScaledVector(dir, 1.1).normalize().multiplyScalar(rnd(5, 13) * (0.8 + heavy * 0.5));
        add.emit({ pos, vel: v, life: rnd(0.12, 0.28), size: rnd(0.016, 0.03), size1: 0.008, stretch: 7, color: [6.5, 4.6, 2.2], tile: 0, drag: 5, grav: 9 });
      }
      // sweat off the face: a few pale drops thrown the way the blow goes
      for (let i = 0; i < 4 + Math.round(heavy * 6); i++) {
        const v = _v2.set(rnd(-0.6, 0.6), rnd(0, 0.9), rnd(-0.6, 0.6)).addScaledVector(dir, 1.4).multiplyScalar(rnd(2, 5));
        alpha.emit({ pos, vel: v, life: rnd(0.25, 0.45), size: rnd(0.02, 0.035), size1: 0.01, stretch: 2, color: [0.85, 0.9, 0.95], alpha: 0.75, tile: 0, grav: 12, drag: 1.5 });
      }
      if (heavy > 0.3) {
        const ring = add.emit({ pos, dir: _v.set(1, 0, 0), life: 0.14, size: 0.2, size1: 0.8 * s, color: [2.4, 2.2, 2.0], alpha: 0.4, tile: 2 });
        ring.dir = null;
      }
    },
    // a heavy blow's smear: white streaks along it
    smear(pos, dir, heavy = 1) {
      const side = _v3.set(-dir.z, 0, dir.x);
      for (let i = 0; i < 7; i++) {
        const o = _v.copy(pos).addScaledVector(side, rnd(-0.35, 0.35)); o.y += rnd(-0.3, 0.3);
        add.emit({ pos: o, vel: _v2.copy(dir).multiplyScalar(rnd(14, 24)), life: rnd(0.08, 0.14), size: 0.03, size1: 0.015, stretch: 14, color: [3, 3, 3.2], alpha: 0.7, drag: 8 });
      }
    },
    // a body (or a fist) meeting the street: a ring of dust and grit
    dust(pos, { amount = 1 } = {}) {
      const n = Math.round(9 * amount);
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + rnd(0, 0.5);
        alpha.emit({ pos: _v.copy(pos).add(_v2.set(Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3)), vel: _v3.set(Math.cos(a), rnd(0.05, 0.35), Math.sin(a)).multiplyScalar(rnd(1.6, 3.4) * Math.min(1.4, amount)), life: rnd(0.45, 0.85), size: 0.3, size1: 0.75 + amount * 0.35, color: [0.52, 0.5, 0.47], alpha: 0.32, tile: 3, drag: 3.6, fadeIn: 0.04 });
      }
      for (let i = 0; i < Math.round(6 * amount); i++) alpha.emit({ pos: _v.copy(pos).setY(pos.y + 0.05), vel: _v2.set(rnd(-3, 3), rnd(2, 5), rnd(-3, 3)), life: rnd(0.4, 0.7), size: 0.025, size1: 0.02, color: [0.25, 0.24, 0.23], alpha: 1, tile: 0, grav: 16 });
    },
    // the counter's flash: a pale gold burst where the two meet
    counterFlash(pos) {
      add.emit({ pos, life: 0.16, size: 0.35, size1: 0.95, color: [5, 4.2, 1.4], alpha: 0.5, tile: 2 });
      add.emit({ pos, life: 0.1, size: 0.6, size1: 0.9, color: [6, 5, 2.4], alpha: 0.9, tile: 1 });
    },
    // a bottle breaking: a white crash, glass shards glinting as they fall (tint: the glass's colour), the drink splashing
    glass(pos, dir, tint = [1.1, 0.62, 0.25]) {
      add.emit({ pos, life: 0.07, size: 0.22, size1: 0.5, color: [5, 5, 5], alpha: 0.8, tile: 0 });
      add.emit({ pos, dir: _v.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)), life: 0.09, size: 0.3, size1: 0.55, color: [6, 6, 6], tile: 1 });
      for (let i = 0; i < 26; i++) {
        const v = _v2.set(rnd(-1, 1), rnd(-0.2, 1.2), rnd(-1, 1)).normalize().addScaledVector(dir, 0.8).multiplyScalar(rnd(2, 7));
        const glint = Math.random() < 0.35;
        (glint ? add : alpha).emit({ pos, vel: v, life: rnd(0.35, 0.8), size: rnd(0.012, 0.03), size1: 0.01, stretch: 1.5, color: glint ? [tint[0] * 4, tint[1] * 4, tint[2] * 4] : [tint[0] * 0.8 + 0.25, tint[1] * 0.8 + 0.25, tint[2] * 0.8 + 0.25], alpha: glint ? 0.9 : 0.85, tile: glint ? 1 : 0, grav: 14, drag: 0.8 });
      }
      for (let i = 0; i < 14; i++) {
        const v = _v2.set(rnd(-0.8, 0.8), rnd(0.2, 1.4), rnd(-0.8, 0.8)).addScaledVector(dir, 0.6).multiplyScalar(rnd(1.5, 4));
        alpha.emit({ pos, vel: v, life: rnd(0.3, 0.55), size: rnd(0.025, 0.05), size1: 0.015, stretch: 2.5, color: [tint[0] * 0.45, tint[1] * 0.4, tint[2] * 0.3], alpha: 0.55, tile: 0, grav: 12, drag: 1.2 });
      }
    },
    // a bat snapping: splinters and wood dust
    splinters(pos, dir) {
      for (let i = 0; i < 18; i++) {
        const v = _v2.set(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).normalize().addScaledVector(dir, 1).multiplyScalar(rnd(3, 9));
        alpha.emit({ pos, vel: v, life: rnd(0.3, 0.7), size: rnd(0.008, 0.016), size1: 0.006, stretch: 6, color: [0.75, 0.55, 0.32], alpha: 1, tile: 0, grav: 12, drag: 2 });
      }
      for (let i = 0; i < 5; i++) alpha.emit({ pos, vel: _v2.set(rnd(-1, 1), rnd(0, 1), rnd(-1, 1)).multiplyScalar(rnd(0.5, 1.5)), life: rnd(0.4, 0.7), size: 0.12, size1: 0.35, color: [0.6, 0.5, 0.38], alpha: 0.25, tile: 3, drag: 3 });
      add.emit({ pos, life: 0.08, size: 0.25, size1: 0.45, color: [4, 3.4, 2.4], alpha: 0.7, tile: 1 });
    },
    // trash out of a can: scraps of paper and grime tumbling down
    trash(pos, dir) {
      for (let i = 0; i < 12; i++) {
        const v = _v2.set(rnd(-1, 1), rnd(0.3, 1.5), rnd(-1, 1)).addScaledVector(dir, 0.8).multiplyScalar(rnd(1.2, 3.5));
        const pale = Math.random() < 0.6;
        alpha.emit({ pos: _v.copy(pos).add(_v3.set(rnd(-0.15, 0.15), rnd(0, 0.2), rnd(-0.15, 0.15))), vel: v, life: rnd(0.7, 1.3), size: rnd(0.03, 0.06), size1: 0.03, stretch: 0.6, color: pale ? [0.82, 0.8, 0.74] : [0.3, 0.27, 0.22], alpha: 0.95, tile: 0, grav: 5, drag: 2.2 });
      }
    },
    // a weapon raised: a glint on its tip (the swing's telegraph)
    glint(pos) {
      add.emit({ pos, dir: _v.set(1, 1, 0), life: 0.22, size: 0.08, size1: 0.32, color: [6, 5.6, 4.2], alpha: 0.9, tile: 1 });
      add.emit({ pos, life: 0.16, size: 0.06, size1: 0.14, color: [4, 4, 3.6], alpha: 0.7, tile: 0 });
    },
    clear() { add.list.length = 0; alpha.list.length = 0; },
    update(dt) { add.update(dt); alpha.update(dt); },
    meshes: [add.mesh, alpha.mesh, ...gr.meshes],
  };
  return fx;
}
