(function () {
// cities/pkg/js/pkg-buildings.js: the shapes a Hometown town's buildings get on top of San Francisco's facade boxes
// (cities/sf/js/buildings.js buildSFMasses calls it for sf-buildings v4 records only: header.kinds present).
// - region tables: wall material, wall / trim / roof colours, roof shapes and pitch, porches and chimneys by US region
//   (an estimate tuned from screenshots; Overture's roof_shape / roof_height win where the record has them);
// - pitched roofs over a record's masses (gabled, hipped, half-hipped, gambrel, mansard, pyramidal, skillion,
//   saltbox; a flat roof gets a low parapet), porches on the road side, chimneys, a church's short bell tower (no
//   spire, no symbol), a gas station's open canopy you can drive under;
// - South Florida (the compiler's 'south-florida' region: Florida and Puerto Rico in the warm band, climate.py warmth):
//   white, cream and pastel stucco and white concrete, no brick, flat roofs behind taller parapets or low barrel-tile
//   hips; its condo and hotel towers get white balcony slabs with pale glass railings on every storey (balconies(),
//   with buildings.js's pale balcony glass facade);
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
  },
  // (nonHouse: the walls of every building that is not a house; stone: the concrete / stone colours; parapet: m)
  'south-florida': {
    walls: [['stucco', 0.88], ['concrete', 0.08], ['siding', 0.04]],
    roofs: [['hipped', 0.42], ['flat', 0.38], ['gabled', 0.12], ['pyramidal', 0.08]],
    pitch: 0.6, chimney: 0, porch: 0.08, parapet: 0.95,
    nonHouse: [['stucco', 0.78], ['concrete', 0.22]],
    colors: {
      stucco: [0xf6f4ee, 0xf1ebdd, 0xf3e7cc, 0xeedbc8, 0xdce9e1, 0xd8e6ec, 0xf2e0da, 0xefece4, 0xe9e0cd, 0xf7f2e4],
      siding: [0xf0ede4, 0xd9e5e4]
    },
    stone: [0xf0efea, 0xe6e4dd, 0xeae6da, 0xdedcd5],
    trims: [0xffffff, 0xf6f5f0, 0x6f8f98, 0xdccdb2],
    roofColors: [0xb8694a, 0xc47e5c, 0xa95f45, 0xe9e7e1, 0xd9d6cf, 0x9c978e]
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
    else if (R.nonHouse) wall = pickW(R.nonHouse, h(3.1));
    else if (o.kind === 'church' || o.kind === 'school' || o.kind === 'civic') wall = h(2.3) < 0.7 ? 'brick' : (R.walls[0][0] === 'stucco' ? 'stucco' : 'stone');
    else if (o.kind === 'warehouse') wall = h(2.9) < 0.5 ? 'brick' : 'concrete';
    else if (o.kind === 'shop' || o.kind === 'office' || o.kind === 'apartment') wall = R.walls[0][0] === 'stucco' ? (h(3.1) < 0.75 ? 'stucco' : 'brick') : (h(3.1) < 0.6 ? 'brick' : pickW(R.walls, h(3.3)));
    else wall = 'concrete';
  }
  const pal = R.colors[wall] || R.colors[R.walls[0][0]];
  const STONE = [0xd2c8b4, 0xc4baa4, 0xb9b4aa, 0xd9d2c2];
  let wallHex = o.wallRGB || (pal ? pickA(pal, h(4.1)) : pickA(STONE, h(4.1)));
  if (!o.wallRGB && (wall === 'stone' || wall === 'concrete')) wallHex = pickA(R.stone || STONE, h(4.1));
  const trimHex = pickA(R.trims, h(5.3));
  let roof = o.roofShape && ROOF_TAG[o.roofShape] ? ROOF_TAG[o.roofShape] : null;
  if (!roof) roof = o.kind === 'house' || o.kind === 'garage' ? pickW(R.roofs, h(6.7)) : o.kind === 'church' ? 'gabled' : 'flat';
  if (o.kind === 'shed' && !o.roofShape) roof = h(6.9) < 0.6 ? 'gabled' : 'skillion';
  if (o.kind === 'garage' && roof === 'mansard') roof = 'gabled';
  const roofColor = o.roofRGB || pickA(R.roofColors, h(7.9));
  return {
    wall, paint: [wallHex, trimHex, SURFACE[wall] ?? 1, house ? 0.4 : 0.3], roof, roofColor, pitch: R.pitch, parapet: R.parapet || 0.45,
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
  function roof(m, theta, y, rise, shape, roofHex, wallHex, parapet = 0.45) {
    const F = frame(m.cx, m.cz, m.w, m.d, theta);
    const { L, S, P } = F;
    stats.roofs++;
    if (shape === 'flat' || rise < 0.3 || S < 1.2) {
      // a low parapet round the flat roof
      const t = 0.22, ph = parapet;
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
  // a church's bell tower at the road end of its nave (m: the largest mass): 1.6 x the eave height, kept between 1.5 and
  // 3 m over the ridge (never a minaret)
  function tower(m, theta, base, eave, peak, fx, fz, wallHex, roofHex) {
    const F = frame(m.cx, m.cz, m.w, m.d, theta);
    const cs = Math.cos(theta), sn = Math.sin(theta);
    const lx = fx * cs - fz * sn, lz = fx * sn + fz * cs;
    const along = F.alongX ? lx : lz;
    const end = (along >= 0 ? 1 : -1) * F.L;
    const s = Math.max(2.4, Math.min(5, F.S * 0.75));
    const topY = Math.min(peak + 3, Math.max(peak + 1.5, base + 1.6 * (eave - base)));
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
  // balconies round a tower mass (South Florida's condos and hotels): on every storey from the second up to the one
  // under the roof, a white slab `out` m past each wall (wrapping the corners: its top, underside and outer edge; the
  // mesh is double-sided) and a pale glass railing on its edge. y0: where the facade counts its storeys from (its base
  // and plinth), so the slabs sit on its storey lines; yMin: none at or below it (a podium's roof)
  function balconies(m, theta, y0, roofY, storey, slabHex, railHex, out = 1.35, yMin = -Infinity) {
    const { L, S, P } = frame(m.cx, m.cz, m.w, m.d, theta);
    const n = Math.floor((roofY - y0) / storey + 0.05);
    const inner = [[-L, -S], [L, -S], [L, S], [-L, S]];
    const outer = [[-L - out, -S - out], [L + out, -S - out], [L + out, S + out], [-L - out, S + out]];
    for (let k = 1; k < n; k++) {
      const y = y0 + k * storey;
      if (y > roofY - 1.0) break;
      if (y < yMin + 0.5) continue;
      const t = 0.28, rh = 1.05;
      for (let e = 0; e < 4; e++) {
        const a = inner[e], b = inner[(e + 1) % 4], A = outer[e], B = outer[(e + 1) % 4];
        quad(P(a[0], a[1], y), P(b[0], b[1], y), P(B[0], B[1], y), P(A[0], A[1], y), slabHex);
        quad(P(A[0], A[1], y - t), P(B[0], B[1], y - t), P(b[0], b[1], y - t), P(a[0], a[1], y - t), slabHex);
        quad(P(A[0], A[1], y - t), P(B[0], B[1], y - t), P(B[0], B[1], y), P(A[0], A[1], y), slabHex);
        quad(P(A[0], A[1], y), P(B[0], B[1], y), P(B[0], B[1], y + rh), P(A[0], A[1], y + rh), railHex);
      }
      stats.balconies = (stats.balconies || 0) + 1;
    }
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
  return { roof, chimney, porch, tower, canopy, balconies, mesh, stats };
}

// Shop signs: a town's storefronts are named after its own streets, its own name and its side of town ("COLUMBIA ST
// DINER", "OKEMAH BAKERY", "EASTSIDE TACOS"), from a neutral list of trades: no chain's, no San Francisco or New York
// name, at most SIGN_CHARS letters. Every storefront gets one name, and no two storefronts within SIGHT metres share one
// while the town's names last (a big town's MAX_SIGNS names are then spread out: the farthest from its last use). The
// plan is a pure function of the package (its road graph, its name and the storefronts' ids and places), so it never
// changes with the order shops stream in. The names are drawn on one atlas (cities/sf/js/buildings.js), MAX_SIGNS in all.
//   signPlan(roadGraph, townName, shops: [{ i, x, z }], { center: { x, z } }?)
//     -> { themes: [{ text, style }], pick: Map(i -> theme index) }
const SHOP_TRADES = ['PHARMACY', 'DINER', 'HARDWARE', 'BARBER SHOP', 'BAKERY', 'BOOKS & COFFEE', 'LAUNDROMAT', 'FLORIST',
  'GROCERY', 'CLEANERS', 'AUTO PARTS', 'CAFE', 'DELI & GRILL', 'FURNITURE', 'VARIETY STORE', 'FEED & SUPPLY', 'TAILOR',
  'SHOE REPAIR', 'PAWN & LOAN', 'MUSIC & RECORDS', 'TACKLE & BAIT', 'PIZZA', 'PHOTO STUDIO', 'GIFTS',
  'BOOKS', 'COFFEE', 'TACOS', 'BBQ', 'DONUTS', 'NAILS', 'SALON', 'TOYS', 'JEWELRY', 'OPTICAL', 'THRIFT', 'ANTIQUES',
  'BIKES', 'PRINT SHOP', 'SEWING', 'NOODLES', 'ICE CREAM', 'CANDY', 'SPORTS', 'PET SUPPLY', 'LOCKSMITH', 'PAINT',
  'FABRICS', 'BOOTS', 'SEAFOOD', 'TIRES', 'GRILL', 'HOBBY SHOP', 'CAMERAS', 'APPLIANCE', 'BEAUTY', 'TAQUERIA'];
const MAX_SIGNS = 64, SIGN_CHARS = 16, SIGHT = 120;
const shash = (s) => { let h = 2166136261; for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); } return h >>> 0; };
// (never a sign's word: San Francisco's and New York's own names, which would read as a leak)
const SFNY_WORD = /^(MARKET|POLK|MISSION|BAYSIDE|NOB HILL|MANHATTAN|BROOKLYN|HARLEM|TIMES SQ|NEW YORK|SAN FRANCISCO|MIDTOWN)\b/;
// (never a sign's word either: a word of a chain's or a brand's name, a shop sign would read as theirs: "LOWE ST
// HARDWARE", "NAPA AUTO PARTS", "HANCOCK FABRICS", "WILSON SPORTS". National chains and the brands of the trades above)
const BRAND_WORDS = new Set(`WALMART MCDONALD MCDONALDS WENDY WENDYS SONIC KFC SUBWAY STARBUCKS DUNKIN DOLLAR CASEY CASEYS LOVE LOVES
  PILOT QUIKTRIP SHELL CHEVRON EXXON MOBIL CONOCO PHILLIPS VALERO TEXACO CITGO SINCLAIR MARATHON SPEEDWAY SHEETZ WAWA MURPHY
  WALGREEN WALGREENS CVS REXALL TARGET COSTCO KROGER SAFEWAY PUBLIX ALDI MEIJER SAMS PIGGLY WIGGLY DIXIE TEETER WEGMANS
  DEPOT LOWE LOWES AUTOZONE REILLY OREILLY NAPA CARQUEST ADVANCE TRACTOR ATWOODS ACE VALUE MENARDS ORCHARD BRAUM BRAUMS DAIRY
  CHICK WHATABURGER APPLEBEE APPLEBEES WAFFLE ARBY ARBYS HUDDLE SHONEY SHONEYS PERKINS DENNY DENNYS IHOP CRACKER CULVER CULVERS
  FREDDY FREDDYS HOLIDAY HAMPTON MARRIOTT HILTON FARGO CHASE FIRESTONE GOODYEAR MIDAS MEINEKE JIFFY SCHWAB PANERA HOSTESS WONDER
  POPEYES CAESAR CAESARS PAPA MARCO GODFATHER SBARRO GINO CICI CHUCK DOMINO DOMINOS SHIPLEY HORTON HORTONS KRISPY DICKEY DICKEYS
  SONNY SONNYS DUTCH BELL FRIENDLY MARBLE CARVEL JASON JIMMY JERSEY FIREHOUSE MCALISTER MCALLISTER LOBSTER CAPTAIN BUBBA
  MICHAELS JOANN HANCOCK MOOD PETCO PETSMART PETLAND PAYLESS ULTA SEPHORA SALLY AVON SUPERCUTS ACADEMY CABELA CABELAS BASS
  SCHEELS HIBBETT WILSON SPALDING RAWLINGS NIKE ADIDAS REEBOK ROSS MARSHALLS KOHLS SEARS PENNEY BELK STAPLES KINKO KINKOS
  MINUTEMAN GAMESTOP APPLE KODAK CANON NIKON RITZ WOLF FORD DODGE TOYOTA HONDA NISSAN JEEP SINGER BERNINA TIFFANY KAY ZALES
  JARED PANDORA HELZBERG GORDON PEARLE SHERWIN WILLIAMS BENJAMIN MOORE BEHR VALSPAR GLIDDEN HERSHEY MARS RUSSELL STOVER GODIVA
  FANNIE GHIRARDELLI JELLY BRACH SCHWINN TREK HUFFY GIANT RALEIGH MONGOOSE JUSTIN ARIAT SHEPLERS CAVENDER WRANGLER ASHLEY
  BASSETT ETHAN MAYTAG WHIRLPOOL KENMORE CONN GREGG STANLEY CRAFTSMAN HALLMARK SPENCER GOODWILL SALVATION SAVERS BARNES NOBLE
  BORDERS POWELL STRAND TOWER GOODY OLAN DISNEY LEGO WOOLWORTH KRESS BEN`.split(/\s+/));
// (and a whole name a chain or a brand goes by, a town's or a street's word with a trade: "PITTSBURGH PAINT")
const BRAND_TEXT = new Set(['PITTSBURGH PAINT', 'BOSTON PIZZA', 'CHICAGO PIZZA', 'MIAMI GRILL', 'DALLAS BBQ', 'MEMPHIS BBQ',
  'SAVANNAH CANDY', 'ATLANTA BREAD', 'PHILLY PRETZEL', 'TEXAS TIRES', 'BIG O TIRES', 'CORNER BAKERY', 'GREAT CLIPS']);
const branded = (s) => String(s).split(/[\s&'-]+/).some((w) => BRAND_WORDS.has(w.replace(/[^A-Z]/g, '')));
// a street's name as a shop would use it: no direction prefix, no route numbers, highways, ramps or long names
function streetWord(name) {
  let s = String(name || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (!s || /\d{3,}|\b(HWY|HIGHWAY|INTERSTATE|I-?\d|US \d|SR \d|ROUTE|RAMP|BYPASS|FRONTAGE|EXPY|EXPRESSWAY|TPKE|TURNPIKE|PKWY|FWY|FREEWAY|TUNNEL|BRIDGE|ALLEY|EXIT)\b/.test(s)) return '';
  s = s.replace(/^(N|S|E|W|NE|NW|SE|SW|NORTH|SOUTH|EAST|WEST) (?=\S)/, '');
  // (a town's own Polk St or Market St is real, but a sign reading like San Francisco's old ones would look like a leak)
  if (SFNY_WORD.test(s) || branded(s)) return '';
  // (a word of its own besides the street type: not "CT PL", an odd name in the map data)
  const core = s.replace(/ (ST|AVE|RD|DR|BLVD|LN|WAY|PL|CT|TER|CIR|PKWY|HWY|TRL)$/, '');
  return s.length >= 4 && s.length <= 16 && /[A-Z]{3}|^\d+(ST|ND|RD|TH)\b/.test(core) ? s : '';
}
// a sign's text: the word and a trade, the word's short form ("ADAMS" for ADAMS ST) when the whole one is too long; a
// numbered street keeps its "ST" ("3RD ST DINER")
const SUFFIX = / (ST|AVE|RD|DR|BLVD|LN|WAY|PL|CT|TER|CIR|PKWY|HWY|TRL)$/;
function signText(word, trade) {
  const full = `${word} ${trade}`;
  if (full.length <= SIGN_CHARS) return BRAND_TEXT.has(full) ? '' : full;
  const short = word.replace(SUFFIX, ''), text = `${short} ${trade}`;
  return short !== word && short.length >= 4 && !/^\d/.test(short) && text.length <= SIGN_CHARS && !BRAND_TEXT.has(text) ? text : '';
}
function signPlan(rg, townName, shops, opts = {}) {
  let town = String(townName || '').split(',')[0].trim().toUpperCase();
  if (SFNY_WORD.test(town) || branded(town) || town.length > 12) town = '';
  const names = (rg && rg.names) || [], nodes = (rg && rg.nodes) || [], links = (rg && rg.links) || [];
  // every named link's segments (node a, its bends, node b) on a NEAR-metre grid, each in the cells within NEAR of it, to
  // find the streets each shop fronts and is near
  const FRONT = 45, NEAR = 100; // a shop fronts the street within 45 m of its sign; it is near the ones within 100 m
  const segs = new Map();
  for (const l of links) {
    const w = streetWord(names[l[2]]);
    if (!w) continue;
    const p = [nodes[2 * l[0]], nodes[2 * l[0] + 1], ...(l[6] || []), nodes[2 * l[1]], nodes[2 * l[1] + 1]];
    for (let k = 0; k + 3 < p.length; k += 2) {
      const sg = [w, p[k], p[k + 1], p[k + 2], p[k + 3]];
      const i0 = Math.floor((Math.min(p[k], p[k + 2]) - NEAR) / NEAR), i1 = Math.floor((Math.max(p[k], p[k + 2]) + NEAR) / NEAR);
      const j0 = Math.floor((Math.min(p[k + 1], p[k + 3]) - NEAR) / NEAR), j1 = Math.floor((Math.max(p[k + 1], p[k + 3]) + NEAR) / NEAR);
      if ((i1 - i0 + 1) * (j1 - j0 + 1) > 400) continue; // (a link kilometres long without a bend: no shop street)
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const key = (i + 32768) * 65536 + j + 32768, c = segs.get(key); if (c) c.push(sg); else segs.set(key, [sg]); }
    }
  }
  const streetsAt = (x, z) => {
    const best = new Map();
    for (const [w, ax, az, bx, bz] of segs.get((Math.floor(x / NEAR) + 32768) * 65536 + Math.floor(z / NEAR) + 32768) || []) {
      const dx = bx - ax, dz = bz - az, ll = dx * dx + dz * dz;
      const t = ll > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / ll)) : 0;
      const ex = ax + dx * t - x, ez = az + dz * t - z, d = ex * ex + ez * ez;
      if (d < NEAR * NEAR && !(best.get(w) <= d)) best.set(w, d);
    }
    const near = [...best].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
    return { front: near.length && near[0][1] < FRONT * FRONT ? near[0][0] : '', near: near.map((e) => e[0]).slice(0, 4) };
  };
  // the side of town: downtown within 450 m of the centre (the package's downtown, else the shops' mean), else its
  // quarter (north is -z)
  let cx = opts.center && Number.isFinite(opts.center.x) ? opts.center.x : 0, cz = opts.center && Number.isFinite(opts.center.z) ? opts.center.z : 0;
  if (!(opts.center && Number.isFinite(opts.center.x)) && shops.length) { cx = 0; cz = 0; for (const s of shops) { cx += s.x; cz += s.z; } cx /= shops.length; cz /= shops.length; }
  const sideOf = (x, z) => {
    const dx = x - cx, dz = z - cz;
    if (dx * dx + dz * dz < 450 * 450) return 'DOWNTOWN';
    return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'EASTSIDE' : 'WESTSIDE') : dz > 0 ? 'SOUTHSIDE' : 'NORTHSIDE';
  };
  // names, made as they are needed: each word's trades in its own order (a hash of the word and the trade), a few per
  // word (a street up to 6, the town 12, a side 8), MAX_SIGNS in all
  const themes = [], byWord = new Map(), used = new Set(), cursor = new Map(), tradeOf = [];
  const orderOf = new Map();
  const capOf = (w) => (w === town ? 12 : /SIDE$|^DOWNTOWN$/.test(w) ? 8 : 6);
  const make = (w) => {
    if (!w || themes.length >= MAX_SIGNS || (byWord.get(w) || []).length >= capOf(w)) return -1;
    let ord = orderOf.get(w);
    if (!ord) { ord = SHOP_TRADES.map((t, k) => [shash(`${town}|${w}|${t}`), k]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((e) => e[1]); orderOf.set(w, ord); }
    for (let c = cursor.get(w) || 0; c < ord.length; c++) {
      const text = signText(w, SHOP_TRADES[ord[c]]);
      if (!text || used.has(text)) continue;
      cursor.set(w, c + 1);
      used.add(text);
      themes.push({ text, style: shash(text) % 5 });
      tradeOf.push(ord[c]);
      if (!byWord.has(w)) byWord.set(w, []);
      byWord.get(w).push(themes.length - 1);
      return themes.length - 1;
    }
    cursor.set(w, ord.length);
    return -1;
  };
  // the storefronts named so far, on a SIGHT grid, and each name's: how far the nearest one with that name is
  const grid = new Map(), cell = (x, z) => `${Math.floor(x / SIGHT)},${Math.floor(z / SIGHT)}`, at = [];
  const nearest = (x, z, t) => {
    let bd = Infinity;
    for (const o of at[t] || []) { const d = (o.x - x) ** 2 + (o.z - z) ** 2; if (d < bd) bd = d; }
    return Math.sqrt(bd);
  };
  // (the names and trades already used round a shop: within SIGHT, and within 35 m)
  const usedNear = (x, z) => {
    const names = new Set(), trades = new Set(), ix = Math.floor(x / SIGHT), iz = Math.floor(z / SIGHT);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      for (const o of grid.get(`${ix + dx},${iz + dz}`) || []) {
        const d = (o.x - x) ** 2 + (o.z - z) ** 2;
        if (d < SIGHT * SIGHT) names.add(o.t);
        if (d < 35 * 35) trades.add(tradeOf[o.t]);
      }
    }
    return { names, trades };
  };
  const pick = new Map();
  const order = shops.map((s, j) => ({ s, j, h: shash(`${town}|${s.i}`) })).sort((a, b) => a.h - b.h || (a.s.i < b.s.i ? -1 : a.s.i > b.s.i ? 1 : 0));
  // (new names are paced: the hash order is all over town, so a big town's names are made all over it, not used up by
  // its first streets)
  const quota = (j) => Math.min(MAX_SIGNS, 8 + Math.ceil((2 * MAX_SIGNS * (j + 1)) / Math.max(1, order.length)));
  order.forEach(({ s, h }, j) => {
    const { front, near } = streetsAt(s.x, s.z), side = sideOf(s.x, s.z), U = usedNear(s.x, s.z);
    const free = (k) => !U.names.has(k) && !U.trades.has(tradeOf[k]);
    const own = front ? [front] : [], here = town ? [town, side] : [side], by = near.filter((w) => w !== front);
    // (three shops in four look first to the street they front, the fourth to the town and its side; then the streets
    // round the corner)
    const groups = h % 4 === 0 ? [here, own, by] : [own, here, by];
    // (of the free names, the one used farthest away: a name comes round again as seldom as the town's names allow)
    const spread = (ok) => { let t = -1, bd = -1; for (const k of ok) { const d = nearest(s.x, s.z, k); if (d > bd) { bd = d; t = k; } } return t; };
    const existing = (g) => spread(g.flatMap((w) => byWord.get(w) || []).filter(free));
    const fresh = (g) => {
      for (let k = 0; k < g.length && themes.length < quota(j); k++) { const n = make(g[(k + (h >>> 5)) % g.length]); if (n >= 0 && free(n)) return n; }
      return -1;
    };
    let t = existing(groups[0]);
    if (t < 0) t = fresh(groups[0]);
    for (let k = 1; k < groups.length && t < 0; k++) t = existing(groups[k]);
    for (let k = 1; k < groups.length && t < 0; k++) t = fresh(groups[k]);
    if (t < 0) {
      // (none of this shop's own names is free here: any of the town's that is, else the one used farthest away)
      const ok = themes.map((_, k) => k).filter(free);
      if (ok.length) t = spread(ok);
      else {
        if (!themes.length) make(town || side);
        let bd = -1;
        for (let k = 0; k < themes.length; k++) { const d = nearest(s.x, s.z, k); if (d > bd) { bd = d; t = k; } }
        if (t < 0) t = 0;
      }
    }
    pick.set(s.i, t);
    const key = cell(s.x, s.z);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push({ x: s.x, z: s.z, t });
    (at[t] || (at[t] = [])).push({ x: s.x, z: s.z });
  });
  return { themes, pick };
}

window.NYC.PkgBuildings = { REGIONS, styleFor, regionOf, createPkgBuilder, signPlan, streetWord, signText, SHOP_TRADES, MAX_SIGNS, SIGN_CHARS, SIGHT };
})();
