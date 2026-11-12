// Mog City: the fight's effects: GPU-instanced billboard particles (hit sparks, flashes, rings, sweat, dust), drawn
// with TSL node materials (WebGPU: no ShaderMaterial). One instanced quad per pool; each particle a billboard stretched
// along its own motion on screen. The textures are drawn on canvases at start-up (no files). Colours are linear HDR: the
// city's bloom picks up anything over 1.
import * as THREE from 'three/webgpu';
import { attribute, uv, texture, vec2, vec4, float, length, select, modelViewMatrix, cameraProjectionMatrix, positionGeometry, floor, mod } from 'three/tsl';
import { clamp, rnd } from './util.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _bp = new THREE.Vector3(), _bq = new THREE.Vector3();

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
// Its decal style (fx.decalWhen(): SF 2040's story fights, combat c.fierce): no solid disc but the street itself
// marked, cracked asphalt and dust over it mostly see-through (about 0.25), a thin red edge glowing at its reach and
// pulsing quicker as the blow comes, and a second edge closing in from outside onto it at the moment of impact; the
// cracks stay a moment after and fade (fx.update)
function crackTex() {
  return canvasTex(512, (g, S) => {
    const h = S / 2; let seed = 11; const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.clearRect(0, 0, S, S);
    // (dust: a soft grey-brown bloom, heavier toward the middle, thinning to nothing at the edge)
    let gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(120,104,88,0.55)'); gr.addColorStop(0.6, 'rgba(110,96,82,0.32)'); gr.addColorStop(0.97, 'rgba(100,88,76,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) { const a = R() * Math.PI * 2, d = Math.sqrt(R()) * h * 0.95, r = 1 + R() * 5; g.fillStyle = `rgba(${R() < 0.5 ? '70,60,52' : '150,136,120'},${0.15 + R() * 0.3})`; g.beginPath(); g.arc(h + Math.cos(a) * d, h + Math.sin(a) * d, r, 0, Math.PI * 2); g.fill(); }
    // (cracks: jagged lines out from near the middle, forking, darker and wider near where it lands)
    const crack = (x, y, a, len, w, depth) => {
      g.strokeStyle = `rgba(18,14,12,${0.55 + 0.35 * w / 5})`; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y);
      let px = x, py = y;
      for (let s = 0; s < len; s += 10) { a += (R() - 0.5) * 0.7; px += Math.cos(a) * 10; py += Math.sin(a) * 10; if (Math.hypot(px - h, py - h) > h * 0.94) break; g.lineTo(px, py); if (depth < 2 && R() < 0.12) crack(px, py, a + (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.6), len * 0.45, Math.max(0.8, w * 0.6), depth + 1); }
      g.stroke();
    };
    for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2 + R() * 0.4; crack(h + Math.cos(a) * h * 0.06, h + Math.sin(a) * h * 0.06, a, h * (0.6 + R() * 0.35), 3.5 + R() * 2, 0); }
    // (a ring of crushed asphalt round the middle)
    for (let i = 0; i < 70; i++) { const a = R() * Math.PI * 2, d = h * (0.05 + R() * 0.12); g.fillStyle = `rgba(20,16,14,${0.4 + R() * 0.4})`; g.fillRect(h + Math.cos(a) * d, h + Math.sin(a) * d, 2 + R() * 4, 2 + R() * 4); }
  });
}
function groundRing(scene) {
  const mk = (geo, op) => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending });
    m.color.setRGB(1.5, 0.1, 0.07); m.opacity = op; // (kept under the bloom: it reads red, not white)
    const o = new THREE.Mesh(geo, m); o.rotation.x = -Math.PI / 2; o.renderOrder = 18; o.frustumCulled = false; o.visible = false; scene.add(o);
    return o;
  };
  const ring = mk(new THREE.RingGeometry(0.93, 1, 64), 0.9), fill = mk(new THREE.CircleGeometry(1, 48), 0.22);
  // (the decal style's: the cracked, dusty street, normal blending; its thin edge; the edge closing in)
  const dm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, fog: false, map: crackTex() });
  dm.opacity = 0.25;
  const decal = new THREE.Mesh(new THREE.CircleGeometry(1, 64), dm); decal.rotation.x = -Math.PI / 2; decal.renderOrder = 17; decal.frustumCulled = false; decal.visible = false; scene.add(decal);
  const edge = mk(new THREE.RingGeometry(0.975, 1, 96), 0.8), close = mk(new THREE.RingGeometry(0.985, 1, 96), 0.5);
  edge.material.color.setRGB(1.25, 0.05, 0.03); close.material.color.setRGB(1.1, 0.08, 0.03); // (kept under the bloom: red, not pink)
  let on = null, style = 'plain', left = 0, R0 = 1;
  const hideAll = () => { ring.visible = fill.visible = edge.visible = close.visible = false; };
  return {
    meshes: [ring, fill, decal, edge, close],
    // show(at, r, k): k 0..1 how near the slam is (null hides it; a decal's cracks stay and fade)
    set(at, r, k, decalStyle = false) {
      if (k == null) { if (on) { hideAll(); if (style === 'decal') { left = 1.4; dm.opacity = 0.42; } else decal.visible = false; on = null; } return; }
      on = true; style = decalStyle ? 'decal' : 'plain'; left = 0;
      if (style === 'plain') {
        decal.visible = edge.visible = close.visible = false; ring.visible = fill.visible = true;
        ring.position.set(at.x, at.y + 0.04, at.z); fill.position.set(at.x, at.y + 0.035, at.z);
        ring.scale.setScalar(r); fill.scale.setScalar(Math.max(0.05, r * clamp(k, 0, 1)));
        const pulse = 0.75 + 0.25 * Math.sin(k * 26);
        ring.material.opacity = 0.55 + 0.4 * pulse * k; fill.material.opacity = 0.1 + 0.2 * k;
        return;
      }
      ring.visible = fill.visible = false; decal.visible = edge.visible = close.visible = true; R0 = r;
      const u = clamp(k, 0, 1);
      decal.position.set(at.x, at.y + 0.03, at.z); edge.position.set(at.x, at.y + 0.045, at.z); close.position.set(at.x, at.y + 0.05, at.z);
      decal.scale.setScalar(r); edge.scale.setScalar(r);
      // (the closing edge: from half again as wide down onto the edge at the moment it lands)
      close.scale.setScalar(r * (1 + 0.5 * (1 - u) * (1 - u)));
      dm.opacity = 0.18 + 0.1 * u;
      // (the edge's pulse quickens as it comes: from about 2 a second to 7)
      const ph = (performance.now() / 1000) * (2 + 5 * u) * Math.PI * 2;
      edge.material.opacity = (0.45 + 0.35 * u) * (0.75 + 0.25 * Math.sin(ph));
      close.material.opacity = 0.25 + 0.6 * u;
    },
    on: () => !!on,
    // (the cracks left after the blow, fading over 1.4 s)
    update(dt) { if (left > 0 && !on) { left -= dt; dm.opacity = Math.max(0, 0.42 * (left / 1.4)); if (left <= 0) decal.visible = false; } void R0; },
  };
}

export function createFx(scene) {
  const atlas = atlasTex();
  const add = new Particles(scene, atlas, true, 1400);
  const alpha = new Particles(scene, atlas, false, 520);
  const gr = groundRing(scene);
  const shells = [];
  const fx = {
    add, alpha,
    // (the decal style is asked of decalWhen() at each ring: wagmi/combat sets it to its story fights, c.fierce)
    decalWhen: null,
    ring: (at, r, k) => gr.set(at, r, k, !!(k != null && fx.decalWhen && fx.decalWhen())), ringOn: gr.on,
    // a slam's dust thrown out round the edge of its ring (r m), grit with it
    burst(at, r = 2.5) {
      const n = Math.round(14 + r * 5);
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + rnd(0, 0.3), d = r * rnd(0.55, 1.0);
        const p = _bq.set(at.x + Math.cos(a) * d, at.y + 0.15, at.z + Math.sin(a) * d);
        alpha.emit({ pos: p, vel: _v3.set(Math.cos(a) * rnd(2.5, 5), rnd(0.6, 1.8), Math.sin(a) * rnd(2.5, 5)), life: rnd(0.7, 1.2), size: rnd(0.4, 0.7), size1: rnd(1.4, 2.2), color: [0.36, 0.32, 0.28], alpha: 0.42, tile: 3, drag: 2.6, fadeIn: 0.04 });
        if (i % 2 === 0) alpha.emit({ pos: p, vel: _v3.set(Math.cos(a) * rnd(2, 6), rnd(2.5, 5.5), Math.sin(a) * rnd(2, 6)), life: rnd(0.5, 0.9), size: rnd(0.03, 0.06), size1: 0.02, color: [0.16, 0.14, 0.12], alpha: 1, grav: 16, drag: 0.4 });
      }
    },
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
    // a gun's muzzle flash: a hot white-orange burst and a cone of sparks out along dir
    muzzle(pos, dir) {
      add.emit({ pos, life: 0.09, size: 0.45, size1: 1.1, color: [3.6, 2.2, 0.8], alpha: 0.95, tile: 0 });
      add.emit({ pos, dir: _v.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)), life: 0.08, size: 0.6, size1: 1.2, color: [3.2, 1.8, 0.5], tile: 1 });
      for (let i = 0; i < 10; i++) add.emit({ pos, vel: _v2.set(rnd(-0.35, 0.35), rnd(-0.35, 0.35), rnd(-0.35, 0.35)).add(dir).normalize().multiplyScalar(rnd(6, 14)), life: rnd(0.08, 0.18), size: 0.03, size1: 0.01, stretch: 6, color: [3.4, 1.6, 0.4], drag: 4 });
      for (let i = 0; i < 4; i++) alpha.emit({ pos, vel: _v2.copy(dir).multiplyScalar(rnd(1, 2.5)).add(_v3.set(rnd(-0.4, 0.4), rnd(0, 0.6), rnd(-0.4, 0.4))), life: rnd(0.5, 0.9), size: 0.35, size1: 1.0, color: [0.4, 0.38, 0.36], alpha: 0.35, tile: 3, drag: 2.5, fadeIn: 0.05 });
    },
    // a shell on a high arc from `from` to `to` over `secs`: a glowing round with a smoke trail and embers, and a blast
    // where it comes down (onLand once there). Returns { land() } to bring it down now (the blow's own moment)
    shell(from, to, secs, { k = 1, onLand = null } = {}) {
      const L = Math.hypot(to.x - from.x, to.z - from.z), h = Math.max(3, L * 0.32) * Math.min(1.6, k);
      const S = { from: from.clone(), to: to.clone(), secs: Math.max(0.25, secs), t: 0, h, k, onLand, done: false, last: from.clone() };
      S.land = () => { if (S.done) return; S.done = true; fx.blast(S.to, { k: S.k }); try { S.onLand?.(S.to); } catch {} };
      shells.push(S); return S;
    },
    // a shell's blast: the flash, a fireball rolling up, sparks and grit thrown out, a column of smoke left standing,
    // a shock ring along the street
    blast(at, { k = 1 } = {}) {
      const p = _bp.copy(at); p.y += 0.4; // (its own vector: emit() borrows _v for a particle with no velocity)
      add.emit({ pos: p, life: 0.09, size: 0.7 * k, size1: 1.7 * k, color: [3.2, 1.9, 0.7], alpha: 0.85, tile: 0 });
      add.emit({ pos: p, dir: _v2.set(1, 0, 0), life: 0.08, size: 0.8 * k, size1: 1.8 * k, color: [3, 1.5, 0.4], tile: 1 });
      // (the fireball: hot orange billows rolling up and out, darkening as they go)
      for (let i = 0; i < 16; i++) add.emit({ pos: _bq.copy(p).add(_v2.set(rnd(-0.7, 0.7) * k, rnd(0, 0.9) * k, rnd(-0.7, 0.7) * k)), vel: _v3.set(rnd(-2.2, 2.2), rnd(1.5, 4.5), rnd(-2.2, 2.2)).multiplyScalar(k), life: rnd(0.45, 0.85), size: rnd(0.7, 1.1) * k, size1: rnd(1.6, 2.5) * k, color: [rnd(1.25, 1.8), rnd(0.28, 0.48), rnd(0.03, 0.07)], alpha: 0.9, tile: 3, drag: 3 });
      // (sparks and burning bits thrown out, grit and stones falling back)
      for (let i = 0; i < 30; i++) add.emit({ pos: p, vel: _v2.set(rnd(-1, 1), rnd(0.2, 1.4), rnd(-1, 1)).normalize().multiplyScalar(rnd(6, 15) * k), life: rnd(0.3, 0.7), size: rnd(0.03, 0.06), size1: 0.01, stretch: 6, color: [3, 1.2, 0.25], drag: 2.5, grav: 14 });
      for (let i = 0; i < 18; i++) alpha.emit({ pos: p, vel: _v2.set(rnd(-1, 1), rnd(0.6, 1.6), rnd(-1, 1)).normalize().multiplyScalar(rnd(4, 9) * k), life: rnd(0.6, 1.1), size: rnd(0.04, 0.09), size1: 0.03, color: [0.1, 0.09, 0.08], alpha: 1, grav: 18, drag: 0.6 });
      // (black smoke left standing over the crater a few seconds)
      for (let i = 0; i < 14; i++) alpha.emit({ pos: _bq.copy(at).add(_v2.set(rnd(-1, 1) * k, rnd(0.3, 1.4), rnd(-1, 1) * k)), vel: _v3.set(rnd(-1, 1), rnd(1, 2.6), rnd(-1, 1)), life: rnd(1.8, 3.4), size: rnd(0.8, 1.2) * k, size1: rnd(2.2, 3.4) * k, color: [0.075, 0.07, 0.065], alpha: 0.62, tile: 3, drag: 1.4, fadeIn: 0.15 });
      fx.dust(at, { amount: 0.6 * k });
    },
    clear() { add.list.length = 0; alpha.list.length = 0; shells.length = 0; },
    update(dt) {
      // (the shells in the air: each frame its glowing round where it is now, a smoke trail behind it, an ember or two)
      for (let i = shells.length - 1; i >= 0; i--) {
        const S = shells[i];
        if (S.done) { shells.splice(i, 1); continue; }
        S.t += dt; const u = Math.min(1, S.t / S.secs);
        // (its own vectors: emit() borrows _v for a particle with no velocity)
        const p = _bp.copy(S.from).lerp(S.to, u); p.y += 4 * S.h * u * (1 - u);
        const dir = _bq.copy(p).sub(S.last);
        // (the round: a hot orange core and a white-hot heart, a streak of flame behind it, embers, and a dark trail of
        // smoke hanging where it went)
        add.emit({ pos: p, dir, life: Math.max(0.03, dt * 1.6), size: 0.38 * S.k, size1: 0.34 * S.k, color: [2.6, 0.55, 0.06], alpha: 1, tile: 0 });
        add.emit({ pos: p, life: Math.max(0.03, dt * 1.6), size: 0.11 * S.k, size1: 0.11 * S.k, color: [3.2, 2.2, 0.9], alpha: 1, tile: 0 });
        add.emit({ pos: p, vel: _v3.copy(dir).multiplyScalar(-4 / Math.max(1e-3, dt * 60)), dir: dir.clone(), life: 0.1, size: 0.2 * S.k, size1: 0.06, stretch: 12, color: [2.6, 0.6, 0.08], alpha: 1, tile: 0, drag: 4 });
        if (Math.random() < 0.6) add.emit({ pos: p, vel: _v3.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)), life: rnd(0.15, 0.3), size: 0.04, size1: 0.01, color: [3, 1.1, 0.2], tile: 0, grav: 4 });
        alpha.emit({ pos: p, vel: _v3.set(rnd(-0.3, 0.3), rnd(0, 0.5), rnd(-0.3, 0.3)), life: rnd(0.9, 1.4), size: 0.28 * S.k, size1: 1.0 * S.k, color: [0.42, 0.4, 0.38], alpha: 0.55, tile: 3, drag: 1.5 });
        S.last.copy(p);
        if (u >= 1) S.land();
      }
      add.update(dt); alpha.update(dt); gr.update(dt);
    },
    meshes: [add.mesh, alpha.mesh, ...gr.meshes],
  };
  return fx;
}
