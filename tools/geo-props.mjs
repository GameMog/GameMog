// tools/geo-props.mjs: New York's street corners as mapped, for js/nyc-geodata.js (build-geodata.mjs calls streetProps)
// From OpenStreetMap (c) OpenStreetMap contributors, ODbL: traffic signals, mid-block crosswalks, street lamps, fire
// hydrants, benches, street trees and tree rows, in the world frame (geo-base.mjs).
//
// Input: tools/data/osm_streetprops.json, pruned from an Overpass answer to tools/data/q_props.overpassql:
//   tools/overpass.sh /tmp/osm_props.json tools/data/q_props.overpassql
//   node tools/geo-props.mjs --prune /tmp/osm_props.json      (writes tools/data/osm_streetprops.json)
// Without that file the build leaves the fields out and the city places its own, as before.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// kinds in osm_streetprops.json
const KINDS = ['signal', 'stop', 'give_way', 'crossing', 'crossing_signals', 'lamp', 'hydrant', 'bench', 'tree'];

function kindOf(t) {
  if (t.highway === 'traffic_signals') return 'signal';
  if (t.highway === 'stop') return 'stop';
  if (t.highway === 'give_way') return 'give_way';
  if (t.highway === 'crossing' || t.crossing) {
    if (t.crossing === 'traffic_signals' || t['crossing:signals'] === 'yes') return 'crossing_signals';
    if (t.crossing === 'no' || t.crossing === 'informal') return null;
    return 'crossing';
  }
  if (t.highway === 'street_lamp') return 'lamp';
  if (t.emergency === 'fire_hydrant') return 'hydrant';
  if (t.amenity === 'bench') return 'bench';
  if (t.natural === 'tree') return 'tree';
  return null;
}

if (process.argv[2] === '--prune') {
  const raw = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const n = [];
  const rows = [];
  const r7 = (v) => Math.round(v * 1e6);
  for (const e of raw.elements) {
    if (e.type === 'node') {
      const k = kindOf(e.tags || {});
      if (k) n.push(KINDS.indexOf(k), r7(e.lon), r7(e.lat));
    } else if (e.type === 'way' && e.geometry && (e.tags || {}).natural === 'tree_row') {
      rows.push(e.geometry.flatMap((p) => [r7(p.lon), r7(p.lat)]));
    }
  }
  const out = fileURLToPath(new URL('data/osm_streetprops.json', import.meta.url));
  fs.writeFileSync(out, JSON.stringify({
    source: '(c) OpenStreetMap contributors, ODbL 1.0; pruned by tools/geo-props.mjs --prune from tools/data/q_props.overpassql',
    timestamp: raw.osm3s && raw.osm3s.timestamp_osm_base, units: 'microdegrees [kind, lon, lat]', kinds: KINDS, nodes: n, treeRows: rows
  }));
  console.log(`[props] ${n.length / 3} nodes, ${rows.length} tree rows -> ${out} (${fs.statSync(out).size} bytes)`);
  process.exit(0);
}

// The story's sets (opening, missions 1-4): no mapped bench, tree, hydrant or lamp inside these, so nothing changes on
// a set or across a route (x, z, radius; or a box [x0, x1, z0, z1])
const KEEP_OUT = [
  [98, 392, 20], [-1139, 1160, 25], [-1200, 1157, 25], [-1240, 1120, 20], [-299, 84, 20], [-303, 66, 15], [-591, -447, 20],
  [-589, -488, 20], [-341, 604, 25], [-1916, -1016, 20], [-1560, 1611, 20], [-1548, 1604, 15], [933, 3561, 20], [900, 3556, 15],
  [-680, 4950, 22], [-603, 5238, 20], [-640, 5246, 20], [301, 5770, 20], [747, 5888, 20], [908, 5485, 25], [926, 5445, 15]
];
const KEEP_BOX = [[-45, 45, 2790, 2935], [-1946, -1898, -1080, -1022], [735, 760, 5876, 5902]];
// Mission 4's gala street (m4-set.js PAV, heading -0.417: at(0, -50) .. at(0, 45)) and the esplanade to the ferry gate
function m4Street(x, z) {
  const h = -0.417, fx = Math.sin(h), fz = Math.cos(h);
  const dx = x - 908, dz = z - 5485, u = dx * fx + dz * fz, v = dx * fz - dz * fx;
  return u > -55 && u < 50 && Math.abs(v) < 12;
}
export const keptOut = (x, z) => KEEP_OUT.some(([kx, kz, r]) => (x - kx) ** 2 + (z - kz) ** 2 < r * r)
  || KEEP_BOX.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1) || m4Street(x, z);

/**
 * GEO fields from the mapped street furniture (all optional; the runtime keeps its own where a field is missing):
 *   signals:    [x, z, ...] grid intersections (avenue centreline x, street z) with a mapped traffic signal
 *   crossings:  [x, z, axis, ...] marked mid-block crosswalks on the grid (axis 0: across an avenue, 1: across a street)
 *   streetProps:[x, z, kind, ...] kind 1 lamp, 2 hydrant, 3 bench (stage 0's codes)
 *   trees:      [x, z, ...] street trees (single trees and tree rows every 8 m)
 */
export function streetProps(GEO, toWorld, { cutZ, log = console.log } = {}) {
  const f = fileURLToPath(new URL('data/osm_streetprops.json', import.meta.url));
  const DATA = process.env.GEO_DATA ? path.join(process.env.GEO_DATA, 'osm_streetprops.json') : f;
  if (!fs.existsSync(DATA)) { log('no osm_streetprops.json: street corners left to the city'); return {}; }
  const P = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const q = (v) => Math.round(v * 10) / 10;
  const pts = [];
  for (let i = 0; i < P.nodes.length; i += 3) {
    const [x, z] = toWorld(P.nodes[i + 1] / 1e6, P.nodes[i + 2] / 1e6);
    if (z < cutZ - 100) continue;
    pts.push({ k: P.kinds[P.nodes[i]], x, z });
  }
  // the grid: avenues (non-highway) and streets, where each runs
  const aves = GEO.avenues.map((a) => ({ x: a.x, segs: a.segs.map((s) => [s.z0, s.z1, s.w]) }));
  const sts = GEO.streets.map((s) => ({ z: s.z, segs: s.segs.filter((g) => g[1] - g[0] > 20).map((g) => [g[0], g[1], g[3]]) }));
  const aveW = (a, z) => { for (const [z0, z1, w] of a.segs) if (z >= z0 - 5 && z <= z1 + 5) return w; return 0; };
  const stW = (s, x) => { for (const [x0, x1, w] of s.segs) if (x >= x0 - 5 && x <= x1 + 5) return w; return 0; };
  // spatial hash of the signal nodes
  const CELL = 40, hash = new Map();
  for (const p of pts) {
    if (p.k !== 'signal' && p.k !== 'crossing_signals') continue;
    const k = `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`;
    (hash.get(k) || hash.set(k, []).get(k)).push(p);
  }
  const near = (x, z, r) => {
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) {
      for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
        for (const p of hash.get(`${i},${j}`) || []) if ((p.x - x) ** 2 + (p.z - z) ** 2 < r * r) return true;
      }
    }
    return false;
  };
  const signals = [];
  const junctions = [];
  for (const a of aves) {
    for (const s of sts) {
      const wa = aveW(a, s.z), ws = stW(s, a.x);
      if (!wa || !ws) continue;
      junctions.push([a.x, s.z, wa, ws]);
      if (near(a.x, s.z, Math.max(wa, ws) * 0.5 + 12)) signals.push(q(a.x), q(s.z));
    }
  }
  // the road graph's junctions (downtown): a crossing near one is at a corner, not mid-block
  const rg = GEO.roadGraph && GEO.roadGraph.nodes ? GEO.roadGraph.nodes : [];
  const nearJunction = (x, z) => {
    for (const [jx, jz, wa, ws] of junctions) if (Math.abs(x - jx) < wa * 0.5 + 25 && Math.abs(z - jz) < ws * 0.5 + 25) return true;
    for (let i = 0; i < rg.length; i += 2) if ((rg[i] - x) ** 2 + (rg[i + 1] - z) ** 2 < 25 * 25) return true;
    return false;
  };
  const crossings = [];
  for (const p of pts) {
    if (p.k !== 'crossing' || nearJunction(p.x, p.z) || keptOut(p.x, p.z)) continue;
    // on an avenue's roadway: across the avenue (axis 0); on a street's: across the street (axis 1)
    let axis = -1, cx = p.x, cz = p.z;
    for (const a of aves) { const w = aveW(a, p.z); if (w && Math.abs(p.x - a.x) < w * 0.5 + 1) { axis = 0; cx = a.x; break; } }
    if (axis < 0) for (const s of sts) { const w = stW(s, p.x); if (w && Math.abs(p.z - s.z) < w * 0.5 + 1) { axis = 1; cz = s.z; break; } }
    if (axis < 0) continue;
    // (one per crossing: mappers often put a node on each carriageway)
    let dup = false;
    for (let i = 0; i < crossings.length; i += 3) if (Math.abs(crossings[i] - cx) < 8 && Math.abs(crossings[i + 1] - cz) < 8) { dup = true; break; }
    if (!dup) crossings.push(q(cx), q(cz), axis);
  }
  const CODE = { lamp: 1, hydrant: 2, bench: 3 };
  const streetPropsOut = [];
  const trees = [];
  for (const p of pts) {
    if (keptOut(p.x, p.z)) continue;
    // (whole metres: a tree or a lamp is placed to the metre)
    if (CODE[p.k]) streetPropsOut.push(Math.round(p.x), Math.round(p.z), CODE[p.k]);
    else if (p.k === 'tree') trees.push(Math.round(p.x), Math.round(p.z));
  }
  let rowTrees = 0;
  for (const row of P.treeRows || []) {
    const w = [];
    for (let i = 0; i < row.length; i += 2) w.push(toWorld(row[i] / 1e6, row[i + 1] / 1e6));
    let carry = 4;
    for (let i = 1; i < w.length; i++) {
      const [ax, az] = w[i - 1], [bx, bz] = w[i];
      const L = Math.hypot(bx - ax, bz - az);
      for (let d = carry; d < L; d += 8) {
        const x = ax + ((bx - ax) * d) / L, z = az + ((bz - az) * d) / L;
        if (z > cutZ - 100 && !keptOut(x, z)) { trees.push(Math.round(x), Math.round(z)); rowTrees++; }
        carry = d + 8 - L;
      }
      if (L < carry) carry -= L;
    }
  }
  log(`street corners: ${signals.length / 2} signalised grid junctions of ${junctions.length}, ${crossings.length / 3} mid-block crosswalks, ` +
    `${streetPropsOut.length / 3} lamps/hydrants/benches, ${trees.length / 2} trees (${rowTrees} in rows)`);
  // (streetProps: built, not yet written: the runtime does not place mapped lamps, hydrants and benches in New York yet,
  // and the phone should not download them before it does; GEO_PROPS=1 writes them)
  return { signals, crossings, ...(process.env.GEO_PROPS ? { streetProps: streetPropsOut } : {}), trees };
}
