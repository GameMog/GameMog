/**
 * Stage 1 of a town in TS (task G4): the hg1 grid math of MogCity tools/hometown/grid.py and assemble.py stage1(),
 * ported so the web knows a town's tile range, frame origin, k0 and gamma0 at the pick (under 50 ms) with no Python.
 *
 * grid.py is THE authority. This port is checked against it on 1,000 places (lib/hometown-build/fixtures/
 * stage1-py.json, written by scripts/hometown-build-pycheck.py from the real compiler; `npm run check` compares every
 * field). If the two ever disagree, stage 1 must become a P0 job instead (SPEC 4.1), never a guess.
 */
import type { Box } from '../hometown/box.ts';

export const GRID = 'hg1';
const A = 6378137.0;
const F_ = 1 / 298.257222101;
const E2 = F_ * (2 - F_);
const E = Math.sqrt(E2);
export const TILE = 512;
export const TILE_CM = 51200;
export const CTX_L = 4;
export const BLOCK_L = 2;
/** assemble.py: the pinned tile set is the play box + 1 km; at most 1,024 tiles. */
export const PIN_PAD_CM = 100000;
export const MAX_TILES = 1024;

export type DomainName = 'conus' | 'ak' | 'hi' | 'pr' | 'gu' | 'as';
const DOMAINS: Record<DomainName, [number, number, number, number, number, number, number]> = {
  conus: [33.0, 45.0, 39.0, -96.0, 3000000.0, 4000000.0, 0],
  ak: [55.0, 65.0, 50.0, -154.0, 3000000.0, 3000000.0, 1],
  hi: [19.5, 21.75, 20.5, -157.5, 500000.0, 500000.0, 2],
  pr: [18.4333333, 18.0333333, 17.8333333, -66.4333333, 500000.0, 500000.0, 3],
  gu: [14.0, 19.0, 13.0, 145.5, 500000.0, 1500000.0, 4],
  as: [-14.0, -14.5, -14.25, -170.0, 500000.0, 500000.0, 5],
};
const STATE_DOMAIN: Record<string, DomainName> = { '02': 'ak', '15': 'hi', '72': 'pr', '78': 'pr', '66': 'gu', '69': 'gu', '60': 'as' };
export const domainOfGeoid = (geoid: string): DomainName => STATE_DOMAIN[String(geoid).slice(0, 2)] ?? 'conus';

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const _m = (p: number) => Math.cos(p) / Math.sqrt(1 - E2 * Math.sin(p) ** 2);
const _t = (p: number) => { const s = Math.sin(p); return Math.tan(Math.PI / 4 - p / 2) / ((1 - E * s) / (1 + E * s)) ** (E / 2); };

class Domain {
  name: DomainName; lam0: number; FE: number; S0: number; n: number; F: number; rho0: number; sign: number;
  constructor(name: DomainName) {
    const [p1d, p2d, p0d, l0, fe, s0] = DOMAINS[name];
    this.name = name; this.lam0 = l0; this.FE = fe; this.S0 = s0;
    const p1 = rad(p1d), p2 = rad(p2d), p0 = rad(p0d);
    const n = Math.abs(p1 - p2) < 1e-12 ? Math.sin(p1) : (Math.log(_m(p1)) - Math.log(_m(p2))) / (Math.log(_t(p1)) - Math.log(_t(p2)));
    this.n = n;
    this.F = _m(p1) / (n * _t(p1) ** n);
    this.rho0 = A * this.F * _t(p0) ** n;
    this.sign = n > 0 ? 1 : -1;
  }
  normLon(lon: number) {
    const [lo, hi] = this.name === 'ak' ? [-200.0, -125.0] : [this.lam0 - 180.0, this.lam0 + 180.0];
    if (lon <= lo) lon += 360.0;
    if (lon > hi) lon -= 360.0;
    return lon;
  }
  forward(lon: number, lat: number): [number, number] {
    lon = this.normLon(lon);
    const p = rad(lat), s = Math.sin(p);
    const t = Math.tan(Math.PI / 4 - p / 2) / ((1 - E * s) / (1 + E * s)) ** (E / 2);
    const rho = A * this.F * t ** this.n;
    const th = this.n * rad(lon - this.lam0);
    const x = rho * Math.sin(th), y = this.rho0 - rho * Math.cos(th);
    return [x + this.FE, this.S0 - y];
  }
  inverse(Ep: number, S: number): [number, number] {
    const x = Ep - this.FE, y = this.S0 - S, sg = this.sign, dy = this.rho0 - y;
    const rho = sg * Math.sqrt(x * x + dy * dy);
    const th = Math.atan2(sg * x, sg * dy);
    const t = (rho / (A * this.F)) ** (1 / this.n);
    let lam = deg(th / this.n) + this.lam0;
    let phi = Math.PI / 2 - 2 * Math.atan(t);
    for (let i = 0; i < 15; i++) {
      const s = Math.sin(phi);
      const nphi = Math.PI / 2 - 2 * Math.atan(t * ((1 - E * s) / (1 + E * s)) ** (E / 2));
      const done = Math.abs(nphi - phi) < 1e-12;
      phi = nphi;
      if (done) break;
    }
    lam = lam > 180.0 ? lam - 360.0 : lam <= -180.0 ? lam + 360.0 : lam;
    return [lam, deg(phi)];
  }
  scale(lat: number) { const p = rad(lat); const rho = A * this.F * _t(p) ** this.n; return (rho * this.n) / (A * _m(p)); }
  gamma(lon: number) { return this.n * (this.normLon(lon) - this.lam0); }
}
const DOMS = new Map<DomainName, Domain>();
export function domain(name: DomainName): Domain {
  if (!DOMAINS[name]) throw new Error(`unknown hg1 domain ${name}`);
  if (!DOMS.has(name)) DOMS.set(name, new Domain(name));
  return DOMS.get(name)!;
}

/** numpy rint: round half to even. */
export function rint(v: number): number {
  const f = Math.floor(v), d = v - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}
export const toCm = (v: number) => rint(v * 100.0);
export const projectCm = (d: Domain, lon: number, lat: number): [number, number] => { const [e, s] = d.forward(lon, lat); return [toCm(e), toCm(s)]; };
const floorDiv = (a: number, b: number) => Math.floor(a / b);
export const tileOf = (gx: number, gs: number): [number, number] => [floorDiv(gx, TILE_CM), floorDiv(gs, TILE_CM)];
export const tileId = (dom: DomainName, c: number, r: number, L = 0) => `${GRID}-${dom}/${L}/${c}/${r}`;
/** Python's round(v, n) for a float (the decimal nearest the double's exact value). */
const pyRound = (v: number, n: number) => Number(v.toFixed(n));

export type Frame = { grid: 'hg1'; domain: DomainName; c0: number; r0: number; k0: number; gamma0: number; originLon: number; originLat: number };
/** grid.py session_frame: the anchor's tile (NW corner), k0 (1e-9) and gamma0 (1e-6 deg) at that corner. */
export function sessionFrame(dom: DomainName, lon: number, lat: number): Frame {
  const d = domain(dom);
  const [gx, gs] = projectCm(d, lon, lat);
  const [c0, r0] = tileOf(gx, gs);
  const [olon, olat] = d.inverse(c0 * TILE, r0 * TILE);
  return { grid: GRID, domain: dom, c0, r0, k0: pyRound(d.scale(olat), 9), gamma0: pyRound(d.gamma(olon), 6), originLon: pyRound(olon, 9), originLat: pyRound(olat, 9) };
}

/** assemble.py box_cm: the box's outline, 33 points a side, projected; its integer-cm extent. */
export function boxCm(d: Domain, bbox: Box): [number, number, number, number] {
  const [W, S, Ee, N] = bbox;
  const t = Array.from({ length: 33 }, (_, i) => i * (1 / 32));
  const lon = [...t.map((v) => W + (Ee - W) * v), ...t.map(() => Ee), ...t.map((v) => Ee - (Ee - W) * v), ...t.map(() => W)];
  const lat = [...t.map(() => S), ...t.map((v) => S + (N - S) * v), ...t.map(() => N), ...t.map((v) => N - (N - S) * v)];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < lon.length; i++) {
    const [gx, gs] = projectCm(d, lon[i], lat[i]);
    x0 = Math.min(x0, gx); y0 = Math.min(y0, gs); x1 = Math.max(x1, gx); y1 = Math.max(y1, gs);
  }
  return [x0, y0, x1, y1];
}

export type Stage1 = {
  placeId: string; domain: DomainName; anchor: { lon: number; lat: number };
  origin: { c0: number; r0: number; lon: number; lat: number }; k0: number; gamma0: number;
  playBox: { gx0: number; gs0: number; gx1: number; gs1: number }; tileRange: [number, number, number, number]; tiles: string[];
};

/** assemble.py stage1() for a gazetteer place (geoid, Census anchor, the canonical box). Throws over MAX_TILES. */
export function stage1(placeId: string, p: { geoid: string; anchor: [number, number]; bbox: Box }): Stage1 {
  const dom = domainOfGeoid(p.geoid), d = domain(dom);
  const [lon, lat] = p.anchor;
  const fr = sessionFrame(dom, lon, lat);
  const bx = boxCm(d, p.bbox);
  const c0 = floorDiv(bx[0] - PIN_PAD_CM, TILE_CM), r0 = floorDiv(bx[1] - PIN_PAD_CM, TILE_CM);
  const c1 = floorDiv(bx[2] + PIN_PAD_CM, TILE_CM), r1 = floorDiv(bx[3] + PIN_PAD_CM, TILE_CM);
  const n = (c1 - c0 + 1) * (r1 - r0 + 1);
  if (n > MAX_TILES) throw new Error(`${placeId}: ${n} tiles over the ${MAX_TILES} cap`);
  const tiles: string[] = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) tiles.push(tileId(dom, c, r));
  return {
    placeId, domain: dom, anchor: { lon, lat }, origin: { c0: fr.c0, r0: fr.r0, lon: fr.originLon, lat: fr.originLat }, k0: fr.k0, gamma0: fr.gamma0,
    playBox: { gx0: bx[0], gs0: bx[1], gx1: bx[2], gs1: bx[3] }, tileRange: [c0, r0, c1, r1], tiles,
  };
}

/** The anchor's tile (where rings start before the frame lands). */
export function anchorTile(dom: DomainName, lon: number, lat: number): [number, number] {
  const [gx, gs] = projectCm(domain(dom), lon, lat);
  return tileOf(gx, gs);
}
