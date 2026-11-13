// Hometown Grid 1 ("hg1") in JavaScript: the DISPLAY and VALIDATION twin of tools/hometown/grid.py (the only authority
// for projection, tile ownership, k0 / gamma0 and the integer-centimetre quantisation). Used for key grammar and bounds
// (server/tiles/src/grid.mjs re-exports it), for showing lon/lat or a live convergence, and in tests: it must pass
// tools/hometown/grid-vectors.json (tests/grid.test.mjs). It never decides which tile owns a feature.
//
// Per-domain Lambert Conformal Conic on GRS80; grid coordinates E' (easting, + FE) and S (southing = S0 - northing,
// grows south like the engine's +z). L0 tiles are 512 grid-m: c = floor(gx / 51200), r = floor(gs / 51200) on integer
// centimetres. Ids: 'hg1-{domain}/{L}/{c}/{r}'. The session frame (pkg.js) places a tile at ((c - c0) 512 / k0,
// (r - r0) 512 / k0) with k0, gamma0 pinned by the descriptor, never recomputed here.
export const GRID = 'hg1';
const A = 6378137.0, F_ = 1 / 298.257222101, E2 = F_ * (2 - F_), E = Math.sqrt(E2);
export const TILE = 512, TILE_CM = 51200, POST = 2, POSTS = 257, CTX_L = 4, BLOCK_L = 2;
// domain: [phi1, phi2, phi0, lam0, FE, S0]
export const DOMAINS = {
  conus: [33.0, 45.0, 39.0, -96.0, 3000000, 4000000],
  ak: [55.0, 65.0, 50.0, -154.0, 3000000, 3000000],
  hi: [19.5, 21.75, 20.5, -157.5, 500000, 500000],
  pr: [18.4333333, 18.0333333, 17.8333333, -66.4333333, 500000, 500000],
  gu: [14.0, 19.0, 13.0, 145.5, 500000, 1500000],
  as: [-14.0, -14.5, -14.25, -170.0, 500000, 500000],
};
// key bounds, inclusive (c max, r max) for L0
export const BOUNDS = { conus: [12000, 12000], ak: [12000, 10000], hi: [4000, 4000], pr: [4000, 4000], gu: [4000, 4000], as: [4000, 4000] };
const STATE_DOMAIN = { '02': 'ak', 15: 'hi', 72: 'pr', 78: 'pr', 66: 'gu', 69: 'gu', 60: 'as' };
export const domainOfGeoid = (geoid) => STATE_DOMAIN[String(geoid).slice(0, 2)] || 'conus';

const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;
const mf = (p) => Math.cos(p) / Math.sqrt(1 - E2 * Math.sin(p) ** 2);
const tf = (p) => { const s = Math.sin(p); return Math.tan(Math.PI / 4 - p / 2) / ((1 - E * s) / (1 + E * s)) ** (E / 2); };
const cache = {};
export function domain(name) {
  if (cache[name]) return cache[name];
  const d = DOMAINS[name]; if (!d) throw new Error('unknown hg1 domain ' + name);
  const [p1d, p2d, p0d, lam0, FE, S0] = d, p1 = rad(p1d), p2 = rad(p2d), p0 = rad(p0d);
  const n = Math.abs(p1 - p2) < 1e-12 ? Math.sin(p1) : (Math.log(mf(p1)) - Math.log(mf(p2))) / (Math.log(tf(p1)) - Math.log(tf(p2)));
  const Fc = mf(p1) / (n * tf(p1) ** n), rho0 = A * Fc * tf(p0) ** n, sg = n > 0 ? 1 : -1;
  const normLon = (lon) => {
    const lo = name === 'ak' ? -200 : lam0 - 180, hi = name === 'ak' ? -125 : lam0 + 180;
    if (lon <= lo) lon += 360; if (lon > hi) lon -= 360; return lon;
  };
  const D = {
    name, n, lam0, FE, S0, normLon,
    forward(lon, lat) {
      const p = rad(lat), rho = A * Fc * tf(p) ** n, th = n * rad(normLon(lon) - lam0);
      return [rho * Math.sin(th) + FE, S0 - (rho0 - rho * Math.cos(th))];
    },
    inverse(Ep, S) {
      const x = Ep - FE, y = S0 - S, dy = rho0 - y;
      const rho = sg * Math.sqrt(x * x + dy * dy), th = Math.atan2(sg * x, sg * dy), t = (rho / (A * Fc)) ** (1 / n);
      let lam = deg(th / n) + lam0, phi = Math.PI / 2 - 2 * Math.atan(t);
      for (let i = 0; i < 15; i++) {
        const s = Math.sin(phi), nphi = Math.PI / 2 - 2 * Math.atan(t * ((1 - E * s) / (1 + E * s)) ** (E / 2));
        const done = Math.abs(nphi - phi) < 1e-12; phi = nphi; if (done) break;
      }
      if (lam > 180) lam -= 360; else if (lam <= -180) lam += 360;
      return [lam, deg(phi)];
    },
    scale(lon, lat) { const p = rad(lat); return (A * Fc * tf(p) ** n * n) / (A * mf(p)); },
    gamma(lon) { return n * (normLon(lon) - lam0); },
  };
  return (cache[name] = D);
}

// integer cm (display / validation only: Python's are the stored ones)
export const toCm = (v) => { const x = v * 100, f = Math.floor(x), d = x - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1); };
export const tileOf = (gx, gs) => [Math.floor(gx / TILE_CM), Math.floor(gs / TILE_CM)];
export const tileId = (dom, c, r, L = 0) => `${GRID}-${dom}/${L}/${c}/${r}`;

// 'hg1-conus/0/5806/8582' -> { grid, domain, L, c, r } | throws (bad grid, domain, level, digits, bounds)
const UINT = /^(0|[1-9][0-9]{0,5})$/;
export function parseTileId(s, { levels = [0] } = {}) {
  const m = /^([a-z0-9]+)-([a-z]+)\/([0-9]+)\/([^/]+)\/([^/]+)$/.exec(String(s));
  if (!m) throw new Error('bad hg1 tile id');
  return checkTile(m[1] + '-' + m[2], m[3], m[4], m[5], { levels });
}
// the parts as given in a URL: grid-qualified domain 'hg1-conus', L, c, r strings (or numbers)
export function checkTile(gd, L, c, r, { levels = [0] } = {}) {
  const [g, dom, extra] = String(gd).split('-');
  if (g !== GRID || extra !== undefined) throw new Error(`bad grid ${String(gd).slice(0, 20)}`);
  if (!Object.hasOwn(DOMAINS, dom)) throw new Error(`bad domain ${String(dom).slice(0, 20)}`);
  const n = (v, what) => { if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 999999) return v; if (typeof v !== 'string' || !UINT.test(v)) throw new Error('bad tile ' + what); return Number(v); };
  const Lv = n(L, 'level'), C = n(c, 'c'), R = n(r, 'r');
  if (!levels.includes(Lv)) throw new Error(`tile level ${Lv} not served`);
  const [bc, br] = BOUNDS[dom];
  if (C * 2 ** Lv > bc || R * 2 ** Lv > br) throw new Error(`tile ${dom}/${Lv}/${C}/${R} outside the domain's bounds`);
  return { grid: GRID, domain: dom, L: Lv, c: C, r: R, id: tileId(dom, C, R, Lv) };
}

// session placement (pkg.js, tiles-net.js): a tile's NW corner and a tile-local cm point in session metres
export const tileCorner = (fr, c, r) => [((c - fr.c0) * TILE) / fr.k0, ((r - fr.r0) * TILE) / fr.k0];
export const sessionOf = (fr, c, r, u, v) => [((c - fr.c0) * TILE_CM + u) / (100 * fr.k0), ((r - fr.r0) * TILE_CM + v) / (100 * fr.k0)];
// session x, z -> the grid tile under it (c, r) and lon/lat (display: a live convergence, a map's coordinates)
export function sessionToGrid(fr, x, z) {
  const Ep = fr.c0 * TILE + x * fr.k0, S = fr.r0 * TILE + z * fr.k0;
  return { E: Ep, S, c: Math.floor(Ep / TILE), r: Math.floor(S / TILE) };
}
export function sessionToLonLat(fr, x, z) { const g = sessionToGrid(fr, x, z); return domain(fr.domain).inverse(g.E, g.S); }
// the true bearing of -z at session (x, z), degrees (gamma0 at the origin; display only)
export const liveGamma = (fr, x, z) => domain(fr.domain).gamma(sessionToLonLat(fr, x, z)[0]);

// the tile set hash a Mog lock pins: sha256 over sorted lines 'hg1-{domain}/0/{c}/{r} {sha256}' (the hash fn is the
// caller's: node:crypto on the server, SubtleCrypto in a page)
export const tileSetLines = (tiles) => tiles.map((t) => `${t.id} ${t.sha256}\n`).sort().join('');
