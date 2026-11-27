(function () {
// js/nyc-roofs.js: pitched, hipped, domed and barrel roofs for New York's mapped roof shapes (js/buildings.js, from
// js/nyc-looks.js). The roof() below is the Hometown engine's (cities/pkg/js/pkg-buildings.js createPkgBuilder roof(),
// stage 0), carried over as it is: a roof over the rectangle (cx, cz, w, d) turned theta about +y, from the eave at y up
// `rise` m, as vertex-coloured triangles.
const shade = (hex, k) => (Math.round(((hex >> 16) & 255) * k) << 16) | (Math.round(((hex >> 8) & 255) * k) << 8) | Math.round((hex & 255) * k);

function createRoofBuilder() {
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
    if (shape === 'dome') {
      // (stage 0) a low-poly dome on the mass's inscribed ellipse: 8 segments x 3 rings to the apex, 40 triangles, its
      // drum's ring a hair outside the walls
      const SEG = 8, RINGS = 3, a0 = L * 1.02, b0 = S * 1.02;
      const ring = (k) => {
        const t = (k / RINGS) * (Math.PI / 2), rr = Math.cos(t), yy = y + Math.sin(t) * rise;
        const out = [];
        for (let j = 0; j < SEG; j++) {
          const ang = (j / SEG) * Math.PI * 2;
          out.push(P(Math.cos(ang) * a0 * rr, Math.sin(ang) * b0 * rr, yy));
        }
        return out;
      };
      let lo = ring(0);
      for (let k = 1; k < RINGS; k++) {
        const hi = ring(k);
        for (let j = 0; j < SEG; j++) quad(lo[j], lo[(j + 1) % SEG], hi[(j + 1) % SEG], hi[j], roofHex);
        lo = hi;
      }
      const apex = P(0, 0, top);
      for (let j = 0; j < SEG; j++) tri(lo[j], lo[(j + 1) % SEG], apex, roofHex);
      // (the flat roof round the dome, the corners the ellipse leaves: the roof's colour, a shade darker)
      quad(P(-L, -S, y), P(L, -S, y), P(L, S, y), P(-L, S, y), shade(roofHex, 0.82));
      stats.domes = (stats.domes || 0) + 1;
      return;
    }
    if (shape === 'gabled' || shape === 'gambrel' || shape === 'saltbox' || shape === 'skillion' || shape === 'round') {
      // a profile across the ridge (v, height fraction), extruded along u; the gable ends are walls (a round roof: a
      // barrel vault, the arc in 6 facets)
      const prof = shape === 'round' ? [[-S, 0], [-0.87 * S, 0.5], [-0.5 * S, 0.87], [0, 1], [0.5 * S, 0.87], [0.87 * S, 0.5], [S, 0]]
        : shape === 'gambrel' ? [[-S, 0], [-0.6 * S, 0.72], [0, 1], [0.6 * S, 0.72], [S, 0]]
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
  return { roof, pos, col, stats };
}

window.NYC = window.NYC || {};
window.NYC.createRoofBuilder = createRoofBuilder;
})();
