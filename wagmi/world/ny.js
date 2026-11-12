// New York (js/: Slop New York, Manhattan's real grid) behind the world contract. Frame: metres, origin 5th Ave & 42nd
// St (centreline), the grid turned 29.02 degrees off true north so the avenues run along z (-z uptown), +x toward the
// East River, y up (the streets at 0, the sidewalks and the parks raised). Heading 0 faces +z (downtown).
import { createWorld } from './common.js';
import { CORNERS, SPAWN_NAMES, FDR } from './places-ny.js';

const N = () => globalThis.window?.NYC || {};

// the busy districts (more people on their sidewalks: street/crowd.js)
export const COMMERCIAL = new Set(['midtown', 'times_square', 'billionaires_row', 'garment', 'fidi', 'civic_center', 'hudson_yards', 'flatiron', 'nomad',
  'koreatown', 'murray_hill', 'chelsea', 'union_square', 'soho', 'theater_district']);

// the city's scene groups by what they hold (js/city-grid.js, boroughs.js, landmarks.js, buildings.js, street-details.js,
// traffic.js)
export const SCENE_GROUPS = {
  grid: 'ManhattanCityGrid', boroughs: 'Boroughs', landmarks: 'ManhattanLandmarks', blocks: 'ManhattanCityBlocks',
  streetDetails: 'ManhattanStreetDetails', traffic: 'ManhattanTrafficAndPedestrians', highway: 'HighwayTraffic',
};

// Manhattan's grid: a numbered street (its record, its z), an avenue by id ('5', 'lex', 'park'...: its record, its x)
const grid = {
  street: (n) => (N().STREETS || []).find((s) => s.number === n) || null,
  streetLine: (n) => N().streetZ(n),
  avenue: (id) => (N().ALL_AVENUES || []).find((a) => a.id === String(id)) || null,
  avenueLine: (id) => N().avenueX(id),
};

// the place library: the arrivals, the named corners (on the nearest drivable lane, facing along it), the FDR
function buildPlaces({ N, app, net, lib, missing, nearestLane }) {
  function corner(a, b) {
    const A = (N.ROADS || []).filter((r) => r.name === a), B = (N.ROADS || []).filter((r) => r.name === b);
    let best = null;
    for (const ra of A) for (let i = 0; i + 1 < ra.pts.length; i++) {
      const p = ra.pts[i], qq = ra.pts[i + 1];
      for (const rb of B) for (let j = 0; j + 1 < rb.pts.length; j++) {
        const u = rb.pts[j], v = rb.pts[j + 1];
        const d1x = qq.x - p.x, d1z = qq.z - p.z, d2x = v.x - u.x, d2z = v.z - u.z, den = d1x * d2z - d1z * d2x;
        if (Math.abs(den) > 1e-9) {
          const t = ((u.x - p.x) * d2z - (u.z - p.z) * d2x) / den, s = ((u.x - p.x) * d1z - (u.z - p.z) * d1x) / den;
          if (t >= -0.02 && t <= 1.02 && s >= -0.02 && s <= 1.02) return { x: p.x + d1x * t, z: p.z + d1z * t, d: 0 };
        }
        for (const [x, z] of [[p.x, p.z], [qq.x, qq.z]]) {
          const L = d2x * d2x + d2z * d2z || 1e-9, k = Math.max(0, Math.min(1, ((x - u.x) * d2x + (z - u.z) * d2z) / L));
          const d = Math.hypot(u.x + d2x * k - x, u.z + d2z * k - z);
          if (!best || d < best.d) best = { x: (x + u.x + d2x * k) / 2, z: (z + u.z + d2z * k) / 2, d };
        }
      }
    }
    return best && best.d < 40 ? best : null;
  }
  for (const [k, p] of Object.entries(N.TELEPORT_LOCATIONS || {})) lib[k] = { x: p.x, z: p.z, heading: p.heading, name: SPAWN_NAMES[k] || k };
  lib.timessquare = lib.timessq && { ...lib.timessq };
  for (const [key, name, a, b] of CORNERS) {
    const c = corner(a, b);
    if (!c) { missing.push(key); continue; }
    const lane = nearestLane(c.x, c.z, 60);
    lib[key] = lane ? { x: lane.x, z: lane.z, heading: lane.heading, name, cx: c.x, cz: c.z } : { x: c.x, z: c.z, heading: Math.PI, name, cx: c.x, cz: c.z };
  }
  const lanes = (app.highwayTraffic && app.highwayTraffic.lanes) || N.highwayLanes || [];
  for (const [key, name, z, heading] of FDR) {
    let best = null;
    for (const L of lanes) for (let i = 0; i + 1 < L.pts.length; i++) {
      const p = L.pts[i], qq = L.pts[i + 1];
      if (p.x < 600 || (p.z - z) * (qq.z - z) > 0 || Math.abs(p.y) > 0.5) continue;
      if ((qq.z > p.z) !== (heading === 0)) continue;
      if (!best || p.x > best.x) best = { x: p.x, z: p.z, heading: Math.atan2(qq.x - p.x, qq.z - p.z), name };
    }
    if (best) lib[key] = best; else missing.push(key);
  }
}

export function createNY() {
  return createWorld({
    id: 'ny', name: 'New York',
    frame: { units: 'm', origin: { label: '5th Ave & 42nd St (centreline)' }, gridBearingDeg: 29.02, east: '+x (grid)', north: '-z (grid: uptown)', up: '+y', headingZero: '+z' },
    buildPlaces,
    // an avenue's edge (the graph's own class: js/road-network.js axis), and a crossing walked along z: across a street,
    // with the avenue's traffic
    isAvenue: (e) => !!e && e.axis === 'ave',
    runsWithAvenue: (c) => Math.abs(c.dz) > Math.abs(c.dx),
    commercial: COMMERCIAL,
    sceneGroups: SCENE_GROUPS,
    grid,
  });
}
