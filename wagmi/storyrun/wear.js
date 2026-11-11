// A world's hero dressed for it, on Mog City's own Dan (no asset rebuilt, nothing downloaded): the world's cast entry
// for the hero says wear: '<id>', and his clothes texture is repainted at run time on a canvas from Dan's own (its
// light and shade, folds and seams kept), with a few pieces of cloth put on his bones. Only Dan's body (its texture
// atlas is the one laid out below); a forged hero GLB is left as it is.
//   rider   SF 2040's Cal: a dusty canvas work shirt worn open over a charcoal tee, its sleeves rolled, two chest
//           pockets; faded brown canvas trousers grey with dust to the knee; a faded red bandana knotted at his neck;
//           his trainers dulled to dusty brown leather
// Dan's clothes atlas (1024 square, as the GLB stores it, the tee's neck at the top of its panels): the trouser legs in
// the top half (hems at the bottom), the tee's front panel bottom left, its back bottom middle, the two sleeves bottom right.
import * as THREE from 'three/webgpu';

export const WEARS = new Set(['rider']);

const RIDER = {
  shirt: [92, 80, 56], tee: [40, 38, 36], trousers: [70, 62, 48], dust: [150, 134, 108], seam: 0.6,
  bandana: '#74392c', shoes: [0.3, 0.22, 0.15],
};

// a small value noise (seeded): smooth blotches for the dust, the grime
function noise2(seed) {
  const h = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

function paint(map, P) {
  const img = map.image, S = img.width / 1024, c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height), px = d.data, W = c.width, H = c.height;
  // (the cloth's mean lightness: each texel is shaded by its own against it)
  let sum = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) { const l = px[i] + px[i + 1] + px[i + 2]; if (l > 12) { sum += l; n++; } }
  const mean = n ? sum / n : 60;
  const big = noise2(1), mid = noise2(2), fine = noise2(3);
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
    const i = (yy * W + xx) * 4, l = px[i] + px[i + 1] + px[i + 2];
    if (l <= 12) continue; // (the atlas's empty black)
    const u = xx / S, v = yy / S;
    let base = P.trousers, dust = 0;
    const blot = big(u / 90, v / 90) * 0.6 + mid(u / 24, v / 24) * 0.3 + fine(u / 4, v / 4) * 0.1;
    if (v < 545) {
      // the trousers: dust heavy at the hems (the bottom), up to the knee (about v 280), a little all over
      const hem = Math.max(0, 1 - (545 - v) / 300);
      dust = Math.min(0.85, hem * hem * 0.9 * (0.55 + blot * 0.8) + blot * 0.16);
      // (the knees scuffed)
      if (v > 220 && v < 320) dust += 0.12 * mid(u / 12, v / 12);
    } else if (u < 395) {
      // the front: the shirt open over the tee down the middle (wider at the neck, the bottom), its edges' plackets
      const t = 1 - (v - 605) / 410, half = 30 + t * 40, cx = 190, ax = Math.abs(u - cx);
      if (ax < half) base = P.tee;
      else { base = P.shirt; if (ax < half + 9) base = base.map((k) => k * 0.82); }
      // (two chest pockets, near the neck, their flaps and stitching darker)
      for (const pxc of [112, 268]) {
        const inX = Math.abs(u - pxc) < 36, inY = v > 668 && v < 750;
        if (inX && inY && ax >= half + 9) { const edge = Math.abs(u - pxc) > 32 || v < 672 || v > 746 || Math.abs(v - 690) < 2; if (edge) base = base.map((k) => k * P.seam); if (v < 690) base = base.map((k) => k * 0.9); }
      }
      dust = blot * 0.14 + Math.max(0, (v - 860) / 160) * 0.16 * blot;
    } else if (u < 705) {
      base = P.shirt;
      // (the back's yoke seam across the shoulders, near the neck)
      if (Math.abs(v - 700) < 3) base = base.map((k) => k * P.seam);
      dust = blot * 0.16;
    } else {
      base = P.shirt;
      // (the sleeves rolled: a band of the cloth's inside, paler, at the opening (the straight top edge))
      if (v < 640) base = base.map((k) => Math.min(255, k * 1.18));
      if (Math.abs(v - 640) < 2) base = base.map((k) => k * P.seam);
      dust = blot * 0.16;
    }
    const f = Math.max(0.55, Math.min(1.5, l / mean)), g = 0.96 + fine(u / 2, v / 2) * 0.08;
    for (let k = 0; k < 3; k++) px[i + k] = Math.min(255, (base[k] * (1 - dust) + P.dust[k] * dust) * f * g);
  }
  x.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = map.colorSpace; t.flipY = map.flipY; t.wrapS = map.wrapS; t.wrapT = map.wrapT; t.anisotropy = 4;
  return t;
}

// a bandana round his neck: a soft roll of cloth at the collar and its knot's triangle down over the chest, on the
// neck bone (so it goes where his neck goes), sized off his own neck and head
function bandana(W, body, bones, colour) {
  const nk = bones.neck01, hd = bones.head, sp = bones.spine05 || bones.spine04; if (!nk || !hd || !sp) return null;
  body.updateMatrixWorld(true);
  const a = nk.getWorldPosition(new THREE.Vector3()), h = hd.getWorldPosition(new THREE.Vector3()), s = sp.getWorldPosition(new THREE.Vector3());
  const axis = h.clone().sub(s).normalize();
  // (his facing: the body's forward, flattened)
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(body.getWorldQuaternion(new THREE.Quaternion())); fwd.y = 0; fwd.normalize();
  const mat = new THREE.MeshStandardNodeMaterial({ color: colour, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  const g = new THREE.Group(); g.name = 'wear-bandana';
  const roll = new THREE.Mesh(new THREE.TorusGeometry(0.074, 0.022, 8, 22), mat);
  roll.scale.set(1.05, 1.12, 0.75); // (wider front to back than side to side once turned: the torus's y is his forward)
  // (the fold's triangle down the front, flat against his chest under the knot: in the group's frame x across him,
  // y forward, z up his neck; the chest leans out a little going down)
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute([-0.075, 0, 0, 0.075, 0, 0, 0, 0.022, -0.115], 3)); tg.computeVertexNormals();
  const knot = new THREE.Mesh(tg, mat);
  g.add(roll, knot);
  // (the ring's plane across his neck: its axis along the neck, its y forward; the knot in front, hanging point down)
  const zA = axis, yA = fwd.clone().addScaledVector(zA, -fwd.dot(zA)).normalize(), xA = new THREE.Vector3().crossVectors(yA, zA);
  const basis = new THREE.Matrix4().makeBasis(xA, yA, zA);
  const centre = a.clone().lerp(h, 0.1).addScaledVector(fwd, 0.01);
  const worldM = new THREE.Matrix4().compose(centre, new THREE.Quaternion().setFromRotationMatrix(basis), new THREE.Vector3(1, 1, 1));
  roll.position.set(0, 0.0, 0);
  knot.position.set(0, 0.07, -0.01);
  const local = nk.matrixWorld.clone().invert().multiply(worldM);
  local.decompose(g.position, g.quaternion, g.scale);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  nk.add(g);
  return g;
}

/** Dress the hero's body for the world (wear id), once. Returns what was put on, or null. */
export function wear(W, id) {
  const Q = W.dan; if (!Q?.body || !WEARS.has(id) || Q.worn) return null;
  const P = id === 'rider' ? RIDER : null; if (!P) return null;
  const out = { id, clothes: false, bandana: null };
  try {
    Q.body.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const one = (m) => {
        // (the white trainers dulled to worn, dusty leather)
        if (m.name === 'shoes') { const c = m.clone(); c.color.multiply(new THREE.Color(...P.shoes)); c.roughness = 0.88; return c; }
        if (m.name !== 'clothes' || !m.map?.image) return m;
        const c = m.clone(); c.map = paint(m.map, P); c.needsUpdate = true;
        // (canvas, not cotton: no sheen's soft gloss; rougher)
        if ('sheen' in c) c.sheen = 0; c.roughness = 0.92;
        out.clothes = true; return c;
      };
      o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
    });
  } catch (e) { console.warn('[storyrun] wear clothes', e); }
  try { out.bandana = bandana(W, Q.body, Q.bones, P.bandana); } catch (e) { console.warn('[storyrun] wear bandana', e); }
  Q.worn = out;
  return out;
}
