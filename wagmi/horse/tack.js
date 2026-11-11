// Mog City: Ranger's tack, drawn in code and fitted to the library horse's own body (measured off its mesh at rest:
// the back's line, the barrel's width at each height, the head's shape along its face). A working western saddle on a
// woven blanket (skirt, seat with its fork, horn and cantle, fenders, stirrups on them, a cinch round the barrel), a
// bedroll and saddlebags behind it, and a bridle (crown, browband, cheek pieces, noseband, throatlatch, a bit with its
// rings). Leather in saddle and harness browns with a grain drawn on a canvas, worn steel for the metal.
// Each piece rides the bone under it (the back's on spine2, the bags on the loins, the bridle on the head): a group under
// that bone undoes the bone's own rest, so the pieces are made in the horse's frame at rest (x its left, y up, z ahead,
// the ground at y 0) and then follow the bone as it moves. The reins are the one live piece: two leather straps from the
// bit rings along the neck's sides to the rider's hands (or, with nobody up, lying on the neck in front of the horn),
// remade each frame.
//   const T = buildTack(THREE, horse)   // horse: wagmi/library/creature.js make()'s { object, bone(name) }
//   T.group (the pieces), T.marks { seat, stirrup: { L, R }, rein: { L, R }, bit: { L, R } } (horse frame at rest),
//   T.reins(handL, handR)  (world points, or null: resting on the neck), T.dispose()

// the back's top along the body (z: ahead of the middle) and the barrel's section, from the mesh
const TOP = [[-0.75, 1.705], [-0.6, 1.736], [-0.45, 1.72], [-0.35, 1.694], [-0.25, 1.668], [-0.15, 1.661], [-0.05, 1.682], [0.05, 1.741], [0.15, 1.789], [0.25, 1.93]];
const lerpTable = (T, x) => { if (x <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (x <= T[i][0]) { const [a, va] = T[i - 1], [b, vb] = T[i]; return va + (vb - va) * (x - a) / (b - a); } return T[T.length - 1][1]; };
const topAt = (z) => lerpTable(TOP, z);
const MID = 1.25, HALF = 0.325, BELLY = 0.97, SQ = 2.6;
// a point on the barrel's section at z, th radians round from the spine (0) toward the left side (+) or right (-), out
// `off` m along its normal: [x, y, nx, ny]. A squared ellipse (SQ): flat-ish over the back, round below
function section(z, th, off = 0) {
  const s = Math.sin(th), c = Math.cos(th), b = c >= 0 ? topAt(z) - MID : MID - BELLY;
  const e = 2 / SQ, sx = Math.sign(s) * Math.abs(s) ** e, cy = Math.sign(c) * Math.abs(c) ** e;
  const x = HALF * sx, y = MID + b * cy;
  // (its normal: from the gradient of |x/a|^SQ + |y/b|^SQ)
  let nx = Math.sign(s) * Math.abs(sx) ** (SQ - 1) / HALF, ny = Math.sign(c) * Math.abs(cy) ** (SQ - 1) / b;
  const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
  return [x + nx * off, y + ny * off, nx, ny];
}

export function buildTack(THREE, horse) {
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);

  /* ------------------------------------------------------------ materials -- */
  // a leather grain: soft mottling and fine creases, drawn once
  const grain = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d'), img = g.createImageData(256, 256), d = img.data;
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const noise = new Float32Array(64 * 64); for (let i = 0; i < noise.length; i++) noise[i] = rnd();
    const at = (x, y) => { const xi = Math.floor(x) & 63, yi = Math.floor(y) & 63, fx = x - Math.floor(x), fy = y - Math.floor(y), a = noise[yi * 64 + xi], b = noise[yi * 64 + ((xi + 1) & 63)], c = noise[((yi + 1) & 63) * 64 + xi], e = noise[((yi + 1) & 63) * 64 + ((xi + 1) & 63)]; return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + e * fx) * fy; };
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const v = 0.55 * at(x / 32, y / 32) + 0.3 * at(x / 8, y / 8) + 0.15 * at(x / 2.5, y / 2.5), i = (y * 256 + x) * 4, k = Math.round(200 + (v - 0.5) * 90);
      d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, k)); d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = keep(new THREE.CanvasTexture(cv)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.repeat.set(3, 3);
    return t;
  })();
  // the blanket's weave: faded bands of rust, cream, slate and ochre on a dark wool
  const weave = (() => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
    const g = cv.getContext('2d');
    g.fillStyle = '#3b3430'; g.fillRect(0, 0, 256, 256);
    const bands = [[0, 18, '#7a3b2a'], [22, 6, '#c9b48a'], [32, 10, '#46525c'], [46, 6, '#c9b48a'], [56, 22, '#8a5a2b'], [82, 6, '#c9b48a'], [92, 10, '#46525c'], [106, 6, '#c9b48a'], [116, 26, '#7a3b2a']];
    for (const [y, h, c] of bands) { g.fillStyle = c; g.fillRect(0, y, 256, h); g.fillRect(0, 256 - y - h, 256, h); }
    // (the weave: fine cross threads and wear)
    g.globalAlpha = 0.18; for (let x = 0; x < 256; x += 2) { g.fillStyle = x % 4 ? '#000' : '#fff'; g.fillRect(x, 0, 1, 256); }
    g.globalAlpha = 0.12; for (let i = 0; i < 900; i++) { g.fillStyle = Math.random() < 0.5 ? '#000' : '#d8cbb0'; g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1); }
    g.globalAlpha = 1;
    const t = keep(new THREE.CanvasTexture(cv)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  })();
  const leather = (color, rough = 0.62) => keep(new THREE.MeshStandardNodeMaterial({ color, map: grain, roughness: rough, metalness: 0.0 }));
  const M = {
    saddle: leather('#7a5232', 0.55), // (saddle leather, oiled and worn)
    seat: leather('#5e3d24', 0.5),
    strap: leather('#3d2a1c', 0.6),  // (harness leather, darker)
    rawhide: leather('#8e6a45', 0.6),
    blanket: keep(new THREE.MeshStandardNodeMaterial({ color: '#ffffff', map: weave, roughness: 0.95, metalness: 0 })),
    canvas: keep(new THREE.MeshStandardNodeMaterial({ color: '#6f6a55', map: grain, roughness: 0.92, metalness: 0 })),
    steel: keep(new THREE.MeshStandardNodeMaterial({ color: '#8b8678', roughness: 0.42, metalness: 0.8 })),
    brass: keep(new THREE.MeshStandardNodeMaterial({ color: '#8f7a4a', roughness: 0.45, metalness: 0.75 })),
  };
  // (both sides drawn: thin leather is seen from either side, round its edges and under its flaps)
  for (const m of Object.values(M)) m.side = THREE.DoubleSide;

  /* --------------------------------------------------------- geometry kit -- */
  // a draped panel over the barrel: z from z0 to z1, round the section from -th to +th, `off` out from the hide,
  // `thick` deep (a closed slab: its outer and inner faces and its edges). off(u, v) may vary it (u across 0..1, v along)
  function drape({ z0, z1, th, off, thick = 0.012, nu = 24, nv = 18, thAt = null }) {
    const pos = [], uv = [], idx = [];
    const offAt = typeof off === 'function' ? off : () => off;
    const P = (u, v, k) => { const z = z0 + (z1 - z0) * v, t = (u * 2 - 1) * (thAt ? thAt(v) : th), o = offAt(u, v) + k * thick, s = section(z, t, o); return [s[0], s[1], z]; };
    // outer (k 1), inner (k 0)
    for (const k of [1, 0]) for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { pos.push(...P(i / nu, j / nv, k)); uv.push(i / nu, j / nv); }
    const row = nu + 1, layer = row * (nv + 1);
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, c, b, b, c, d); // (outer, facing out)
      idx.push(layer + a, layer + b, layer + c, layer + b, layer + d, layer + c); // (inner, facing in)
    }
    // the edges: round the rim, outer to inner, on vertices of their own (a crisp edge: the faces' normals stay theirs)
    const rim = [];
    for (let i = 0; i <= nu; i++) rim.push([i, 0]);
    for (let j = 1; j <= nv; j++) rim.push([nu, j]);
    for (let i = nu - 1; i >= 0; i--) rim.push([i, nv]);
    for (let j = nv - 1; j >= 1; j--) rim.push([0, j]);
    const e0 = pos.length / 3;
    for (const [i, j] of rim) { pos.push(...pos.slice((j * row + i) * 3, (j * row + i) * 3 + 3), ...pos.slice((layer + j * row + i) * 3, (layer + j * row + i) * 3 + 3)); uv.push(i / nu, j / nv, i / nu, j / nv); }
    for (let r = 0; r < rim.length; r++) {
      const a = e0 + r * 2, b = e0 + ((r + 1) % rim.length) * 2;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return keep(g);
  }
  // a flat strap along a path (points), lying on the surface whose outward normal at each point is normals[i]
  function strap(points, normals, width, thick = 0.006) {
    const pos = [], idx = [], n = points.length, T = V(), S = V(), N = V();
    for (let i = 0; i < n; i++) {
      const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
      T.subVectors(b, a).normalize(); N.copy(normals[i]).addScaledVector(T, -normals[i].dot(T)).normalize(); S.crossVectors(T, N).normalize();
      for (const [sw, sn] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) pos.push(...points[i].clone().addScaledVector(S, sw * width / 2).addScaledVector(N, sn * thick / 2).toArray());
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < 4; k++) {
      const a = i * 4 + k, b = i * 4 + ((k + 1) % 4), c = a + 4, d = b + 4;
      idx.push(a, c, b, b, c, d);
    }
    // (the ends capped)
    idx.push(0, 1, 2, 0, 2, 3); const e = (n - 1) * 4; idx.push(e, e + 2, e + 1, e, e + 3, e + 2);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return keep(g);
  }
  // a loop of strap round an ellipse (centre c, its two half axes as vectors a and b), n points
  function loopStrap(c, a, b, width, n = 28, from = 0, to = Math.PI * 2, thick = 0.006) {
    const pts = [], nor = [];
    for (let i = 0; i <= n; i++) { const t = from + (to - from) * i / n; pts.push(c.clone().addScaledVector(a, Math.cos(t)).addScaledVector(b, Math.sin(t))); nor.push(a.clone().multiplyScalar(Math.cos(t) / a.lengthSq()).addScaledVector(b, Math.sin(t) / b.lengthSq()).normalize()); }
    return strap(pts, nor, width, thick);
  }
  const mesh = (geo, mat, parent) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };

  /* ---------------------------------------------------------- the anchors -- */
  // a group under a bone that undoes its rest pose: what is put in it is placed in the horse's frame at rest
  const root = horse.object; root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  function under(boneName) {
    const b = horse.bone(boneName), g = new THREE.Group();
    g.name = 'tack-' + boneName;
    const rest = new THREE.Matrix4().multiplyMatrices(rootInv, b.matrixWorld);
    rest.invert().decompose(g.position, g.quaternion, g.scale);
    b.add(g);
    return g;
  }
  const back = under('spine2'), loins = under('spine1'), head = under('head'), neck = under('neck1'), neck2 = under('neck2');

  /* --------------------------------------------------------- the saddle -- */
  // the blanket: folded wool under it all, its striped edge showing all round
  const BL = { z0: -0.58, z1: 0.21 };
  mesh(drape({ z0: BL.z0, z1: BL.z1, th: 1.12, off: 0.006, thick: 0.012, nu: 28, nv: 16 }), M.blanket, back);
  // the skirt: one big leather panel over the blanket, a little shorter all round
  const SK = { z0: -0.5, z1: 0.2 };
  mesh(drape({ z0: SK.z0, z1: SK.z1, th: 0.98, off: 0.022, thick: 0.01, nu: 28, nv: 16 }), M.saddle, back);
  // the seat: the fork rising ahead (over the withers, its gullet clear of them), dished where he sits, the cantle
  // rising behind; narrower than the skirt and standing proud of it
  const ST = { z0: -0.45, z1: 0.17 };
  const seatOff = (u, v) => {
    const across = 1 - (2 * u - 1) ** 2;                          // (crowned in the middle)
    const fork = Math.max(0, (v - 0.72) / 0.28) ** 1.6 * 0.15;     // (ahead)
    const cantle = Math.max(0, (0.24 - v) / 0.24) ** 1.5 * 0.17;   // (behind)
    return 0.035 + 0.03 * across + fork * (0.35 + 0.65 * across) + cantle * (0.25 + 0.75 * across);
  };
  mesh(drape({ z0: ST.z0, z1: ST.z1, th: 0.6, off: seatOff, thick: 0.018, nu: 22, nv: 24, thAt: (v) => 0.6 - 0.22 * Math.max(0, (v - 0.75) / 0.25) - 0.12 * Math.max(0, (0.15 - v) / 0.15) }), M.seat, back);
  // the cantle's back: a curved board closing the back of the seat (one face, drawn both sides)
  {
    const z = ST.z0 + 0.01, top = topAt(z) + 0.205, pos = [], idx = [];
    for (let i = 0; i <= 16; i++) { const t = (i / 16 * 2 - 1) * 0.55, s = section(z, t, 0.05); pos.push(s[0], Math.min(top, s[1] + 0.15 * Math.cos(t * 2.2)), z, s[0] * 0.9, topAt(z) + 0.03, z + 0.02); }
    for (let i = 0; i < 16; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, c, d, b); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); keep(g);
    mesh(g, M.seat, back);
  }
  // the horn on the fork: a post and its cap
  const HORN = V(0, topAt(0.15) + 0.14, 0.15);
  {
    const post = keep(new THREE.CylinderGeometry(0.022, 0.03, 0.09, 14)), cap = keep(new THREE.CylinderGeometry(0.048, 0.042, 0.022, 20));
    const p = mesh(post, M.rawhide, back); p.position.copy(HORN); p.rotation.x = 0.25;
    const c = mesh(cap, M.rawhide, back); c.position.copy(HORN).add(V(0, 0.05, 0.012)); c.rotation.x = 0.25;
  }
  // the fenders: wide leather flaps hanging from under the seat to the stirrups, and the stirrups on them. The stirrup's
  // tread is where the rider's foot goes (marks.stirrup)
  // (a western seat: the leg long but the knee still bent, the foot under the hip; the tread at the barrel's foot)
  const STIR = { x: 0.43, y: 1.05, z: -0.06 };
  const stirrupMark = { L: V(STIR.x, STIR.y, STIR.z), R: V(-STIR.x, STIR.y, STIR.z) };
  for (const sd of [1, -1]) {
    const zc = -0.12, s0 = section(zc, sd * 1.05, 0.03);
    const topP = V(s0[0], s0[1], zc + 0.01), botP = V(sd * (STIR.x - 0.02), STIR.y + 0.2, STIR.z + 0.01);
    // (a flap: wider at the top, its outer face along the line from the seat to the stirrup)
    const pos = [], idx = [], H = 7;
    for (let i = 0; i <= H; i++) {
      const t = i / H, p = topP.clone().lerp(botP, t), w = 0.2 - 0.07 * t, bulge = Math.sin(t * Math.PI) * 0.03 * sd;
      for (const [k, off] of [[-1, 0.0], [1, 0.0], [1, 0.012], [-1, 0.012]]) pos.push(p.x + bulge + sd * off, p.y, p.z + k * w / 2);
    }
    for (let i = 0; i < H; i++) for (let k = 0; k < 4; k++) { const a = i * 4 + k, b = i * 4 + ((k + 1) % 4), c = a + 4, d = b + 4; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); keep(g);
    mesh(g, M.saddle, back);
    // the stirrup leather from the fender's foot down to the stirrup
    mesh(strap([botP.clone(), V(sd * STIR.x, STIR.y + 0.13, STIR.z)], [V(sd, 0, 0), V(sd, 0, 0)], 0.045, 0.006), M.strap, back);
    // the stirrup: a rounded loop of worn steel, its tread flat under the foot
    const loop = new THREE.CurvePath(), hw = 0.065, ht = 0.13;
    const corner = (a, b, c) => loop.add(new THREE.QuadraticBezierCurve3(a, b, c));
    const y0 = STIR.y, x0 = sd * STIR.x;
    corner(V(x0, y0 + ht, STIR.z), V(x0, y0 + ht, STIR.z + hw), V(x0, y0 + ht * 0.5, STIR.z + hw));
    corner(V(x0, y0 + ht * 0.5, STIR.z + hw), V(x0, y0, STIR.z + hw), V(x0, y0, STIR.z));
    corner(V(x0, y0, STIR.z), V(x0, y0, STIR.z - hw), V(x0, y0 + ht * 0.5, STIR.z - hw));
    corner(V(x0, y0 + ht * 0.5, STIR.z - hw), V(x0, y0 + ht, STIR.z - hw), V(x0, y0 + ht, STIR.z));
    mesh(keep(new THREE.TubeGeometry(loop, 40, 0.009, 8, true)), M.steel, back);
    const tread = mesh(keep(new THREE.BoxGeometry(0.11, 0.012, 0.13)), M.rawhide, back); tread.position.set(x0, y0 + 0.004, STIR.z);
  }
  // the cinch: a broad band from under the skirt round the belly, with its rings
  {
    const z = 0.04, pts = [], nor = [];
    for (let i = 0; i <= 36; i++) { const t = 0.95 + (Math.PI * 2 - 1.9) * i / 36, s = section(z, t, 0.008); pts.push(V(s[0], s[1], z)); nor.push(V(s[2], s[3], 0)); }
    mesh(strap(pts, nor, 0.085, 0.008), M.canvas, back);
    for (const sd of [1, -1]) {
      const s = section(z, sd * 1.05, 0.02), ring = mesh(keep(new THREE.TorusGeometry(0.034, 0.006, 6, 18)), M.steel, back);
      ring.position.set(s[0], s[1], z); ring.rotation.y = Math.PI / 2;
    }
  }
  // the bedroll behind the cantle, its two straps; the saddlebags over the loins
  {
    const z = -0.56, y = topAt(z) + 0.1, roll = mesh(keep(new THREE.CylinderGeometry(0.075, 0.075, 0.6, 20, 1)), M.canvas, loins);
    roll.position.set(0, y, z); roll.rotation.z = Math.PI / 2;
    for (const x of [-0.18, 0.18]) { const b = mesh(keep(new THREE.TorusGeometry(0.079, 0.006, 6, 24)), M.strap, loins); b.position.set(x, y, z); b.rotation.y = Math.PI / 2; }
    for (const sd of [1, -1]) {
      const s = section(-0.62, sd * 1.25, 0.05);
      const bag = mesh(keep(new THREE.BoxGeometry(0.07, 0.22, 0.26, 1, 2, 2)), M.saddle, loins); bag.position.set(s[0] + sd * 0.01, s[1] - 0.08, -0.62); bag.rotation.z = -sd * 0.22;
      const flap = mesh(keep(new THREE.BoxGeometry(0.075, 0.08, 0.27)), M.strap, loins); flap.position.set(s[0] + sd * 0.016, s[1] + 0.01, -0.62); flap.rotation.z = -sd * 0.22;
      const buckle = mesh(keep(new THREE.BoxGeometry(0.012, 0.02, 0.03)), M.brass, loins); buckle.position.set(s[0] + sd * 0.06, s[1] - 0.03, -0.62); buckle.rotation.z = -sd * 0.22;
    }
  }

  /* ---------------------------------------------------------- the bridle -- */
  // made along the head's own axis: from the head bone's rest (its +y down the face to the muzzle, -z out of the
  // forehead), as measured: behind the ears ly 0, the browband ly 0.05, the noseband ly 0.36, the bit ly 0.46
  const hb = horse.bone('head'), hm = new THREE.Matrix4().multiplyMatrices(rootInv, hb.matrixWorld);
  const H = (lx, ly, lz) => V(lx, ly, lz).applyMatrix4(hm);                 // (a point in the head's frame, to the horse's)
  const HD = (lx, ly, lz) => V(lx, ly, lz).transformDirection(hm);           // (a direction)
  // (measured: the head's middle line is at lx 0.016; its front, the forehead and the nose, at lz -0.12 to -0.06; the
  // straps' lines as [ly, lz, half width there])
  const cx = 0.016, OUT = 0.012;
  // the noseband all the way round the nose (an ellipse across the face at ly 0.33), the browband across the forehead
  // in front of the ears
  mesh(loopStrap(H(cx, 0.33, 0.078), HD(1, 0, 0).multiplyScalar(0.138 + OUT), HD(0, 0, 1).multiplyScalar(0.153 + OUT), 0.028, 32), M.strap, head);
  // (a loop's t: 0 its left side, PI/2 under the head, PI its right side, 3PI/2 its front: the browband from side to
  // side across the front)
  mesh(loopStrap(H(cx, 0.06, -0.035), HD(1, 0, 0).multiplyScalar(0.15 + OUT), HD(0, 0, 1).multiplyScalar(0.09 + OUT), 0.02, 20, Math.PI * 0.95, Math.PI * 2.05), M.strap, head);
  // the crown over the poll behind the ears, down each side as the cheek pieces to the bit's rings; the throatlatch
  // from the crown's foot round under the throat
  const CHEEK = [[0.0, -0.1, 0.146], [0.08, -0.07, 0.145], [0.16, -0.03, 0.16], [0.25, 0.01, 0.145], [0.33, 0.04, 0.13], [0.4, 0.06, 0.1], [0.47, 0.075, 0.085]];
  const BIT = { L: H(cx + 0.085 + OUT + 0.01, 0.47, 0.075), R: H(cx - 0.085 - OUT - 0.01, 0.47, 0.075) };
  mesh(loopStrap(H(cx, -0.04, -0.1), HD(1, 0, 0).multiplyScalar(0.148 + OUT), HD(0, 0, 1).multiplyScalar(0.018 + OUT), 0.026, 16, Math.PI * 0.95, Math.PI * 2.05), M.strap, head);
  for (const sd of [1, -1]) {
    const pts = [], nor = [];
    for (const [ly, lz, hw] of CHEEK) { pts.push(H(cx + sd * (hw + OUT), ly, lz)); nor.push(HD(sd, 0, 0)); }
    pts.unshift(H(cx + sd * (0.148 + OUT), -0.04, -0.1)); nor.unshift(HD(sd, 0, 0));
    mesh(strap(pts, nor, 0.024, 0.006), M.strap, head);
    mesh(strap([H(cx + sd * (0.148 + OUT), -0.03, -0.09), H(cx + sd * 0.14, 0.04, 0.08), H(cx + sd * 0.08, 0.08, 0.17), H(cx, 0.09, 0.2)], [HD(sd, 0, 0), HD(sd, 0, 0.4).normalize(), HD(sd, 0, 1).normalize(), HD(0, 0, 1)], 0.016, 0.005), M.strap, head);
    // the bit's ring, upright against the corner of the mouth
    const r = mesh(keep(new THREE.TorusGeometry(0.03, 0.0055, 6, 20)), M.steel, head); r.position.copy(sd > 0 ? BIT.L : BIT.R); r.quaternion.setFromUnitVectors(V(0, 0, 1), HD(1, 0, 0));
  }
  { const bar = mesh(keep(new THREE.CylinderGeometry(0.007, 0.007, BIT.L.distanceTo(BIT.R), 8)), M.steel, head); bar.position.copy(BIT.L).add(BIT.R).multiplyScalar(0.5); bar.quaternion.setFromUnitVectors(V(0, 1, 0), HD(1, 0, 0)); }

  /* ----------------------------------------------------------- the reins -- */
  // two straps, each a ribbon through: its bit ring, two points along the neck's side, its hand. Remade each frame
  const SEG = 14, REIN_W = 0.017;
  const reinGeo = new THREE.BufferGeometry(), reinPos = new Float32Array(2 * (SEG + 1) * 4 * 3), reinIdx = [];
  for (let r = 0; r < 2; r++) for (let i = 0; i < SEG; i++) for (let k = 0; k < 4; k++) {
    const base = r * (SEG + 1) * 4, a = base + i * 4 + k, b = base + i * 4 + ((k + 1) % 4), c = a + 4, d = b + 4;
    reinIdx.push(a, c, b, b, c, d);
  }
  reinGeo.setAttribute('position', new THREE.BufferAttribute(reinPos, 3)); reinGeo.setIndex(reinIdx); keep(reinGeo);
  const reins = new THREE.Mesh(reinGeo, M.strap); reins.castShadow = true; reins.frustumCulled = false; reins.name = 'tack-reins';
  root.add(reins);
  // (where they lie on the neck: in neck1's and neck2's frames at rest, and where they rest with nobody holding them)
  const NECK_A = { L: V(0.165, 1.87, 0.55), R: V(-0.165, 1.87, 0.55) }, NECK_B = { L: V(0.15, 1.93, 0.36), R: V(-0.15, 1.93, 0.36) };
  const REST = { L: V(0.11, 1.86, 0.27), R: V(-0.11, 1.86, 0.27) };
  const toNeck = (g, p) => g.worldToLocal(root.localToWorld(p.clone()));
  root.updateMatrixWorld(true);
  const NA = { L: toNeck(neck2, NECK_A.L), R: toNeck(neck2, NECK_A.R) }, NB = { L: toNeck(neck, NECK_B.L), R: toNeck(neck, NECK_B.R) };
  const BITL = { L: toNeck(head, BIT.L), R: toNeck(head, BIT.R) }, RESTL = { L: toNeck(back, REST.L), R: toNeck(back, REST.R) };
  const _a = V(), _b = V(), _c = V(), _d = V(), _t = V(), _s = V(), _n = V(), _up = V(), _inv = new THREE.Matrix4();
  const curve = new THREE.CatmullRomCurve3([V(), V(), V(), V()], false, 'centripetal');
  const pts = Array.from({ length: SEG + 1 }, () => V());
  /** the reins to the rider's hands (world points), or resting on the neck (null) */
  function setReins(handL = null, handR = null) {
    root.updateMatrixWorld(true);
    _inv.copy(root.matrixWorld).invert();
    for (const [r, sd] of [[0, 'L'], [1, 'R']]) {
      const hand = r ? handR : handL;
      // (in the horse's own frame)
      const A = head.localToWorld(_a.copy(BITL[sd])).applyMatrix4(_inv), B = neck2.localToWorld(_b.copy(NA[sd])).applyMatrix4(_inv);
      const C = neck.localToWorld(_c.copy(NB[sd])).applyMatrix4(_inv), D = hand ? _d.copy(hand).applyMatrix4(_inv) : back.localToWorld(_d.copy(RESTL[sd])).applyMatrix4(_inv);
      curve.points[0].copy(A); curve.points[1].copy(B); curve.points[2].copy(C); curve.points[3].copy(D);
      // (slack: a little sag between the bit and the neck, more when nobody holds them)
      for (let i = 0; i <= SEG; i++) { curve.getPoint(i / SEG, pts[i]); const u = i / SEG; pts[i].y -= Math.sin(Math.min(1, u * 3) * Math.PI) * (hand ? 0.01 : 0.03); }
      const base = r * (SEG + 1) * 4;
      for (let i = 0; i <= SEG; i++) {
        _t.subVectors(pts[Math.min(SEG, i + 1)], pts[Math.max(0, i - 1)]).normalize();
        // (lying flat on the neck's side: its face outward, sideways from the neck)
        _up.set(sd === 'L' ? 1 : -1, 0.35, 0).normalize(); _n.copy(_up).addScaledVector(_t, -_up.dot(_t)).normalize(); _s.crossVectors(_t, _n).normalize();
        let k = 0;
        for (const [sw, sn] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) { const o = (base + i * 4 + k++) * 3; reinPos[o] = pts[i].x + _s.x * sw * REIN_W / 2 + _n.x * sn * 0.002; reinPos[o + 1] = pts[i].y + _s.y * sw * REIN_W / 2 + _n.y * sn * 0.002; reinPos[o + 2] = pts[i].z + _s.z * sw * REIN_W / 2 + _n.z * sn * 0.002; }
      }
    }
    reinGeo.attributes.position.needsUpdate = true;
    reinGeo.computeVertexNormals();
  }
  setReins();

  const group = new THREE.Group(); group.name = 'tack';
  return {
    group, back, loins, head, reinsMesh: reins, materials: M,
    // (the marks, in the horse's frame at rest: where the rider's hips, feet and hands go, where the reins start)
    marks: { seat: V(0, topAt(-0.15) + 0.035 + 0.06, -0.15), stirrup: stirrupMark, rein: { L: V(0.07, 1.98, 0.17), R: V(-0.07, 1.98, 0.17) }, bit: BIT, horn: HORN },
    reins: setReins,
    dispose() { reins.removeFromParent(); for (const g of [back, loins, head]) g.removeFromParent(); for (const d of disposables) d.dispose?.(); },
  };
}
