(function () {
// cities/pkg/js/pkg-buildings.js: the shapes a Hometown town's buildings get on top of San Francisco's facade boxes
// (cities/sf/js/buildings.js buildSFMasses calls it for sf-buildings v4 records only: header.kinds present).
// - region tables: wall material, wall / trim / roof colours, roof shapes and pitch, porches and chimneys by US region
//   (an estimate tuned from screenshots; Overture's roof_shape / roof_height win where the record has them);
// - pitched roofs over a record's masses (gabled, hipped, half-hipped, gambrel, mansard, pyramidal, skillion,
//   saltbox; a flat roof gets a low parapet), porches on the road side, chimneys, a church's short bell tower (no
//   spire, no symbol), a gas station's open canopy you can drive under;
// - everything merged into one vertex-coloured mesh per build (dispose() frees it), so a per-tile build can call it.
// Masses are three.js boxes turned by theta about +y: world = c + R_y(theta) local, local +x along (cos t, -sin t).

// [value, weight] lists; colours hex
const REGIONS = {
  'plains-midwest': {
    walls: [['siding', 0.5], ['clapboard', 0.32], ['brick', 0.18]],
    roofs: [['gabled', 0.5], ['hipped', 0.34], ['half_hipped', 0.05], ['gambrel', 0.04], ['flat', 0.07]],
    pitch: 1.0, chimney: 0.3, porch: 0.5,
    colors: {
      siding: [0xe9e4d6, 0xd9d2bf, 0xc8cfc9, 0xb8c4cc, 0xe6dcc0, 0xd1c4a8, 0xa9b4a0, 0xf0ece2],
      clapboard: [0xf2efe6, 0xe8e1cf, 0xdcd3bd, 0xc9d3d6, 0xe3cfa8, 0xbfc8b4],
      brick: [0x9a5a44, 0x8c4f3c, 0xa8664c, 0x7e4a3a],
      stucco: [0xe2d6c0, 0xd9c9ab]
    },
    trims: [0xf4f2ec, 0xe9e6dc, 0x4c4a46, 0x6b4f3a],
    roofColors: [0x4f4c48, 0x5d5853, 0x3f3d3b, 0x6a5e52, 0x58616a, 0x6e6457]
  },
  southwest: {
    walls: [['stucco', 0.86], ['siding', 0.08], ['brick', 0.06]],
    roofs: [['hipped', 0.5], ['flat', 0.3], ['gabled', 0.17], ['pyramidal', 0.03]],
    pitch: 0.65, chimney: 0.04, porch: 0.12,
    colors: {
      stucco: [0xe8d8bc, 0xdcc6a2, 0xd2b48c, 0xe9dfcc, 0xcfb79a, 0xe4cfae, 0xd8c3b0, 0xc9a98a, 0xeee4d2],
      siding: [0xddd2bc, 0xcfc6b2],
      brick: [0xb07a5a, 0xa06c50]
    },
    trims: [0xf2ece0, 0x8a6a4c, 0x6f5a48, 0xd9cdb8],
    roofColors: [0xa8583c, 0xb8674a, 0x9c5038, 0x8a7a6a, 0xb59a7c, 0x7f6b5a]
  },
  southeast: {
    walls: [['siding', 0.42], ['brick', 0.4], ['clapboard', 0.12], ['stucco', 0.06]],
    roofs: [['hipped', 0.46], ['gabled', 0.44], ['half_hipped', 0.05], ['flat', 0.05]],
    pitch: 0.95, chimney: 0.25, porch: 0.45,
    colors: {
      siding: [0xeae5d7, 0xd8d6c8, 0xc6d0cd, 0xe7dcc2, 0xbcc6c0, 0xf2eee4],
      clapboard: [0xf3f0e8, 0xe4dccb, 0xcad6d8],
      brick: [0xa0604a, 0x93573f, 0xae6f55, 0x8a5240, 0xb98a6c],
      stucco: [0xe6dcc6, 0xd8cbb0]
    },
    trims: [0xf4f2ec, 0xe9e6dc, 0x3f3b37],
    roofColors: [0x4f4c48, 0x5d5853, 0x3f3d3b, 0x6a5e52, 0x6f675e]
  },
  'northeast-rust': {
    walls: [['brick', 0.42], ['siding', 0.36], ['clapboard', 0.16], ['stucco', 0.06]],
    roofs: [['gabled', 0.6], ['hipped', 0.14], ['gambrel', 0.08], ['mansard', 0.04], ['flat', 0.14]],
    pitch: 1.3, chimney: 0.55, porch: 0.6,
    colors: {
      brick: [0x8e4d3a, 0x7d4434, 0x9b5a44, 0x6f3e30, 0xa3664f, 0x87503f],
      siding: [0xe2ddcf, 0xcfc9b8, 0xb9c1c2, 0xd7cdb3, 0xa7b1a8, 0xc4b8a0, 0xe8e2d2],
      clapboard: [0xeee9de, 0xdcd3be, 0xc3cdd0, 0xd8c39a],
      stucco: [0xd9cfbd, 0xcbbfa8]
    },
    trims: [0xf0ede4, 0xe2ddd0, 0x3e3a36, 0x5a4434],
    roofColors: [0x45423f, 0x55504b, 0x3a3836, 0x5f554c, 0x4d555c]
  },
  'pacific-nw': {
    walls: [['siding', 0.55], ['clapboard', 0.3], ['brick', 0.1], ['stucco', 0.05]],
    roofs: [['gabled', 0.62], ['hipped', 0.28], ['flat', 0.1]],
    pitch: 1.1, chimney: 0.35, porch: 0.45,
    colors: {
      siding: [0xc9cfc8, 0xb3bdb8, 0xd8d2c2, 0x9fa99c, 0xe5e0d2, 0x8c9a9e],
      clapboard: [0xe9e5da, 0xcdd5d4, 0xd2c6a8],
      brick: [0x8f5644, 0x7f4c3c],
      stucco: [0xd9d0bc]
    },
    trims: [0xf2f0ea, 0x3d3b38, 0xe4e0d4],
    roofColors: [0x4a4845, 0x3c3a38, 0x5a564f, 0x4a5258]
  },
  mountain: {
    walls: [['siding', 0.5], ['stucco', 0.25], ['brick', 0.15], ['wood', 0.1]],
    roofs: [['gabled', 0.5], ['hipped', 0.38], ['flat', 0.12]],
    pitch: 1.05, chimney: 0.35, porch: 0.35,
    colors: {
      siding: [0xd6cdb8, 0xc2b8a2, 0xb5b9b0, 0xe2dccd, 0xa59a86],
      stucco: [0xddcfb6, 0xcdbb9c],
      brick: [0x9a6048, 0x8a5440],
      wood: [0x8a6a4e, 0x7a5c42]
    },
    trims: [0xf0ece2, 0x4a4540, 0x6b5a48],
    roofColors: [0x4f4c48, 0x5d5853, 0x6a5e52, 0x4e4a44]
  },
  california: {
    walls: [['stucco', 0.72], ['siding', 0.2], ['brick', 0.08]],
    roofs: [['hipped', 0.46], ['gabled', 0.3], ['flat', 0.24]],
    pitch: 0.7, chimney: 0.15, porch: 0.2,
    colors: {
      stucco: [0xeee6d6, 0xe2d4b8, 0xd8c8ae, 0xf0ebe0, 0xcdbda3, 0xd9cbb9],
      siding: [0xdedad0, 0xc9cfcc],
      brick: [0xa8705a]
    },
    trims: [0xf4f0e8, 0x6b5a48, 0x3f3b37],
    roofColors: [0xa8583c, 0xb46a4c, 0x7f7468, 0x5d5853, 0x8f8478]
  }
};
const SURFACE = { brick: 0, stucco: 1, siding: 2, clapboard: 2, wood: 2, stone: 3, concrete: 3, metal: 3, glass: 3 };
const ROOF_TAG = { gabled: 'gabled', hipped: 'hipped', half_hipped: 'half_hipped', gambrel: 'gambrel', mansard: 'mansard', pyramidal: 'pyramidal',
  skillion: 'skillion', saltbox: 'saltbox', dome: 'hipped', round: 'gabled', sawtooth: 'skillion', flat: 'flat' };

function pickW(list, h) {
  let t = 0;
  for (const e of list) t += e[1];
  let r = h * t;
  for (const e of list) if ((r -= e[1]) < 0) return e[0];
  return list[list.length - 1][0];
}
const pickA = (list, h) => list[Math.floor(h * list.length) % list.length];
const regionOf = (name) => REGIONS[name] || REGIONS['plains-midwest'];

// a record's look: o { kind, roofShape (name or ''), wall (name or ''), wallRGB, roofRGB, region, hash(seed) -> [0, 1) }
// -> { wall, paint: [wallHex, trimHex, surface, litShare], roof (shape tag), roofColor, chimney, porch, pitch }
function styleFor(o) {
  const R = regionOf(o.region);
  const h = o.hash;
  const house = o.kind === 'house' || o.kind === 'garage' || o.kind === 'shed' || o.kind === 'rowhouse';
  let wall = o.wall && SURFACE[o.wall] !== undefined ? o.wall : null;
  if (!wall) {
    if (house) wall = pickW(R.walls, h(1.7));
    else if (o.kind === 'church' || o.kind === 'school' || o.kind === 'civic') wall = h(2.3) < 0.7 ? 'brick' : (R.walls[0][0] === 'stucco' ? 'stucco' : 'stone');
    else if (o.kind === 'warehouse') wall = h(2.9) < 0.5 ? 'brick' : 'concrete';
    else if (o.kind === 'shop' || o.kind === 'office' || o.kind === 'apartment') wall = R.walls[0][0] === 'stucco' ? (h(3.1) < 0.75 ? 'stucco' : 'brick') : (h(3.1) < 0.6 ? 'brick' : pickW(R.walls, h(3.3)));
    else wall = 'concrete';
  }
  const pal = R.colors[wall] || R.colors[R.walls[0][0]];
  const STONE = [0xd2c8b4, 0xc4baa4, 0xb9b4aa, 0xd9d2c2];
  let wallHex = o.wallRGB || (pal ? pickA(pal, h(4.1)) : pickA(STONE, h(4.1)));
  if (!o.wallRGB && (wall === 'stone' || wall === 'concrete')) wallHex = pickA(STONE, h(4.1));
  const trimHex = pickA(R.trims, h(5.3));
  let roof = o.roofShape && ROOF_TAG[o.roofShape] ? ROOF_TAG[o.roofShape] : null;
  if (!roof) roof = o.kind === 'house' || o.kind === 'garage' ? pickW(R.roofs, h(6.7)) : o.kind === 'church' ? 'gabled' : 'flat';
  if (o.kind === 'shed' && !o.roofShape) roof = h(6.9) < 0.6 ? 'gabled' : 'skillion';
  if (o.kind === 'garage' && roof === 'mansard') roof = 'gabled';
  const roofColor = o.roofRGB || pickA(R.roofColors, h(7.9));
  return {
    wall, paint: [wallHex, trimHex, SURFACE[wall] ?? 1, house ? 0.4 : 0.3], roof, roofColor, pitch: R.pitch,
    chimney: o.kind === 'house' && roof !== 'flat' && h(8.3) < R.chimney, porch: o.kind === 'house' && h(9.1) < R.porch
  };
}

function createPkgBuilder() {
  const { THREE } = window.NYC;
  const pos = [];
  const col = [];
  const stats = { roofs: 0, pitched: 0, porches: 0, chimneys: 0, towers: 0, canopies: 0, parapets: 0 };
  const C = new THREE.Color();
  const tri = (a, b, c, hex) => {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    C.setHex(hex);
    for (let k = 0; k < 3; k++) col.push(C.r, C.g, C.b);
  };
  const quad = (a, b, c, d, hex) => { tri(a, b, c, hex); tri(a, c, d, hex); };
  // a frame over a rectangle: (u along the ridge, v across, y) -> world
  function frame(cx, cz, w, d, theta) {
    const cs = Math.cos(theta), sn = Math.sin(theta);
    const alongX = w >= d;
    const L = (alongX ? w : d) * 0.5, S = (alongX ? d : w) * 0.5;
    const P = (u, v, y) => {
      const lx = alongX ? u : v, lz = alongX ? v : u;
      return [cx + lx * cs + lz * sn, y, cz - lx * sn + lz * cs];
    };
    return { L, S, P, alongX };
  }
  // an axis box in a frame (u0..u1, v0..v1, y0..y1), all six faces
  function boxUV(F, u0, u1, v0, v1, y0, y1, hex, top = true) {
    const a = F.P(u0, v0, y0), b = F.P(u1, v0, y0), c = F.P(u1, v1, y0), d = F.P(u0, v1, y0);
    const e = F.P(u0, v0, y1), f = F.P(u1, v0, y1), g = F.P(u1, v1, y1), h = F.P(u0, v1, y1);
    quad(a, b, f, e, hex); quad(b, c, g, f, hex); quad(c, d, h, g, hex); quad(d, a, e, h, hex);
    if (top) quad(e, f, g, h, hex);
    quad(d, c, b, a, hex);
  }
  // a roof over the rectangle (cx, cz, w, d, theta) from the eave at y up `rise` m
  function roof(m, theta, y, rise, shape, roofHex, wallHex) {
    const F = frame(m.cx, m.cz, m.w, m.d, theta);
    const { L, S, P } = F;
    stats.roofs++;
    if (shape === 'flat' || rise < 0.3 || S < 1.2) {
      // a low parapet round the flat roof
      const t = 0.22, ph = 0.45;
      boxUV(F, -L, L, -S, -S + t, y, y + ph, wallHex);
      boxUV(F, -L, L, S - t, S, y, y + ph, wallHex);
      boxUV(F, -L, -L + t, -S, S, y, y + ph, wallHex);
      boxUV(F, L - t, L, -S, S, y, y + ph, wallHex);
      stats.parapets++;
      return;
    }
    stats.pitched++;
    const o = Math.min(0.45, S * 0.15); // eave overhang
    const top = y + rise;
    if (shape === 'gabled' || shape === 'gambrel' || shape === 'saltbox' || shape === 'skillion') {
      // a profile across the ridge (v, height fraction), extruded along u; the gable ends are walls
      const prof = shape === 'gambrel' ? [[-S, 0], [-0.6 * S, 0.72], [0, 1], [0.6 * S, 0.72], [S, 0]]
        : shape === 'saltbox' ? [[-S, 0], [0.3 * S, 1], [S, 0.35]]
          : shape === 'skillion' ? [[-S, 1], [S, 0]]
            : [[-S, 0], [0, 1], [S, 0]];
      const pts = prof.map(([v, t]) => [v, y + t * rise]);
      // the overhang: the outer slopes carried on past the walls
      const ext = (i, j) => {
        const [va, ya] = pts[i], [vb, yb] = pts[j];
        const dv = va - vb, len = Math.abs(dv) || 1;
        return [va + (dv / len) * o, ya + ((ya - yb) / len) * o];
      };
      const outer = pts.slice();
      outer[0] = ext(0, 1);
      outer[outer.length - 1] = ext(outer.length - 1, outer.length - 2);
      const ue = L + o * 0.6;
      for (let k = 0; k + 1 < outer.length; k++) {
        const [va, ya] = outer[k], [vb, yb] = outer[k + 1];
        quad(P(-ue, va, ya), P(ue, va, ya), P(ue, vb, yb), P(-ue, vb, yb), roofHex);
      }
      // gable-end walls (and a skillion's high wall)
      for (const u of [-L, L]) {
        const base = [0, y];
        for (let k = 0; k + 1 < pts.length; k++) tri(P(u, base[0], base[1]), P(u, pts[k][0], pts[k][1]), P(u, pts[k + 1][0], pts[k + 1][1]), wallHex);
        tri(P(u, base[0], base[1]), P(u, pts[pts.length - 1][0], pts[pts.length - 1][1]), P(u, S, y), wallHex);
        tri(P(u, base[0], base[1]), P(u, -S, y), P(u, pts[0][0], pts[0][1]), wallHex);
      }
      if (shape === 'skillion' || shape === 'saltbox') {
        const vh = shape === 'skillion' ? -S : S;
        const yh = shape === 'skillion' ? top : y + 0.35 * rise;
        quad(P(-L, vh, y), P(L, vh, y), P(L, vh, yh), P(-L, vh, yh), wallHex);
      }
      return;
    }
    // hip family: hipped, pyramidal, half-hipped, mansard (a steep skirt and a flat top)
    const y0 = y - (o * rise) / S;
    const Lo = L + o, So = S + o;
    const c1 = P(-Lo, -So, y0), c2 = P(Lo, -So, y0), c3 = P(Lo, So, y0), c4 = P(-Lo, So, y0);
    if (shape === 'mansard') {
      const a = Math.min(1.4, 0.35 * S), yt = y + rise;
      const i1 = P(-L + a, -S + a, yt), i2 = P(L - a, -S + a, yt), i3 = P(L - a, S - a, yt), i4 = P(-L + a, S - a, yt);
      quad(c1, c2, i2, i1, roofHex); quad(c2, c3, i3, i2, roofHex); quad(c3, c4, i4, i3, roofHex); quad(c4, c1, i1, i4, roofHex);
      quad(i1, i2, i3, i4, 0x5f5c58);
      return;
    }
    const r = shape === 'pyramidal' ? 0 : Math.max(0, L - (shape === 'half_hipped' ? 0.45 : 1) * S);
    const r1 = P(-r, 0, top), r2 = P(r, 0, top);
    quad(c1, c2, r2, r1, roofHex);
    quad(c3, c4, r1, r2, roofHex);
    tri(c4, c1, r1, roofHex);
    tri(c2, c3, r2, roofHex);
  }
  function chimney(m, theta, y, rise, hash) {
    const F = frame(m.cx, m.cz, m.w, m.d, theta);
    const u = (hash(11.1) < 0.5 ? -1 : 1) * F.L * 0.62, v = (hash(12.3) - 0.5) * F.S * 0.6;
    boxUV(F, u - 0.35, u + 0.35, v - 0.35, v + 0.35, y - 0.2, y + rise + 0.9, 0x8a4a3a);
    stats.chimneys++;
  }
  // a porch on the side facing the road (world direction fx, fz): deck, posts and a roof
  function porch(m, theta, base, eave, fx, fz, roofHex, trimHex) {
    const cs = Math.cos(theta), sn = Math.sin(theta);
    const lx = fx * cs - fz * sn, lz = fx * sn + fz * cs; // the road direction in the mass's local frame
    const xFace = Math.abs(lx) >= Math.abs(lz);
    const sgn = xFace ? Math.sign(lx) || 1 : Math.sign(lz) || 1;
    // a frame with u along the face, v outward
    const len = xFace ? m.d : m.w, half = (xFace ? m.w : m.d) * 0.5;
    const W = Math.min(len * 0.7, 9), D = 2.1;
    if (len < 4) return;
    const P = (u, v, y) => {
      const ax = xFace ? sgn * (half + v) : u, az = xFace ? u : sgn * (half + v);
      return [m.cx + ax * cs + az * sn, y, m.cz - ax * sn + az * cs];
    };
    const F = { P };
    const yr = base + Math.min(2.7, Math.max(2.2, eave - base - 0.25));
    boxUV(F, -W / 2, W / 2, 0, D, base - 0.3, base + 0.35, 0xb9b2a4); // deck
    for (const u of [-W / 2 + 0.15, 0, W / 2 - 0.15]) boxUV(F, u - 0.08, u + 0.08, D - 0.25, D - 0.09, base + 0.35, yr, trimHex);
    // the porch roof: a shallow shed slope down and out
    const a = P(-W / 2 - 0.2, -0.05, yr + 0.55), b = P(W / 2 + 0.2, -0.05, yr + 0.55), c = P(W / 2 + 0.2, D + 0.25, yr), d = P(-W / 2 - 0.2, D + 0.25, yr);
    quad(a, b, c, d, roofHex);
    quad(d, c, P(W / 2 + 0.2, D + 0.25, yr - 0.18), P(-W / 2 - 0.2, D + 0.25, yr - 0.18), trimHex);
    stats.porches++;
  }
  // a church's bell tower at the road end of its nave (m: the largest mass); top <= ridge + 3 m and <= 1.6 x the eave
  function tower(m, theta, base, eave, peak, fx, fz, wallHex, roofHex) {
    const F = frame(m.cx, m.cz, m.w, m.d, theta);
    const cs = Math.cos(theta), sn = Math.sin(theta);
    const lx = fx * cs - fz * sn, lz = fx * sn + fz * cs;
    const along = F.alongX ? lx : lz;
    const end = (along >= 0 ? 1 : -1) * F.L;
    const s = Math.max(2.4, Math.min(5, F.S * 0.75));
    const topY = Math.min(base + 1.6 * (eave - base), peak + 3);
    if (topY < eave + 1.5) return;
    const u0 = end > 0 ? end - s * 0.6 : end - s * 0.4, u1 = u0 + s;
    boxUV(F, u0, u1, -s / 2, s / 2, base, topY, wallHex, false);
    // a low pyramid cap (no spire)
    const cap = (u, v) => F.P(u, v, topY);
    const apex = F.P((u0 + u1) / 2, 0, topY + Math.min(2.2, s * 0.45));
    const k = [cap(u0 - 0.2, -s / 2 - 0.2), cap(u1 + 0.2, -s / 2 - 0.2), cap(u1 + 0.2, s / 2 + 0.2), cap(u0 - 0.2, s / 2 + 0.2)];
    for (let i = 0; i < 4; i++) tri(k[i], k[(i + 1) % 4], apex, roofHex);
    quad(k[3], k[2], k[1], k[0], roofHex);
    stats.towers++;
  }
  // a gas station's canopy over the rectangle: a slab `clear` m up on columns; returns its colliders
  function canopy(m, theta, base, clear) {
    const F = frame(m.cx, m.cz, m.w, m.d, theta);
    const y0 = base + clear, y1 = y0 + 0.75;
    boxUV(F, -F.L, F.L, -F.S, F.S, y0, y1, 0xeeeeea);
    boxUV(F, -F.L - 0.05, F.L + 0.05, -F.S - 0.05, F.S + 0.05, y0 + 0.2, y0 + 0.55, 0x2f6f9f, false); // a plain colour band
    const cols = [];
    const us = F.L > 9 ? [-F.L * 0.6, 0, F.L * 0.6] : [-F.L * 0.5, F.L * 0.5];
    for (const u of us) {
      boxUV(F, u - 0.22, u + 0.22, -0.22, 0.22, base, y0, 0xd8d6d0, false);
      const [x, , z] = F.P(u, 0, 0);
      cols.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3, minY: base, maxY: y0 });
    }
    stats.canopies++;
    return cols;
  }
  function mesh(name) {
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.0, side: THREE.DoubleSide });
    const me = new THREE.Mesh(g, mat);
    me.name = name;
    me.castShadow = true;
    me.receiveShadow = true;
    me.userData.dispose = () => { g.dispose(); mat.dispose(); };
    return me;
  }
  return { roof, chimney, porch, tower, canopy, mesh, stats };
}

window.NYC.PkgBuildings = { REGIONS, styleFor, regionOf, createPkgBuilder };
})();
