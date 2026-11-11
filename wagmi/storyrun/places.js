// Mog City story runner: New York's place library, the names a pack writes as "@key" (GameMog storykit/pack/cities.ts
// PLACES.ny, 42 keys), on Mog City's own map (js/: the same fork and frame as the Story Kit's cities/ny, origin 5th Ave
// & 42nd St, -z uptown). Each is the city's spawn point (NYC.TELEPORT_LOCATIONS) or a named corner of two real
// streets (city-config.js ROADS), put on the nearest drivable lane and facing along it.
// San Francisco's (?city=sf: cities/sf; PLACES.sf there, 49 keys), in its own frame (origin Market St x Montgomery St, +x
// east, -z north, y the ground's height): its arrivals (cities/sf/js/city-config.js TELEPORT_LOCATIONS, the ones on
// the ground) and its place library (SF_PLACES below, GameMog storykit/cities/sf/city.js PLACES), each on its nearest
// drivable lane facing along it, a `foot` one (over 40 m off the lanes: a pier's end, a door) where it is.
//   createPlaces(W, world) -> { at(ref) -> { x, z, heading, name, mode } | null, list, missing }
//   ref: '@key' | { '@': key, face, heading (deg), mode } | a pack alias (world.places: { alias: { '@': key, name } }, or
//   { at: [x, z, heading (deg)], name }: a mark of the world's own on this map; an alias's offset { right, fwd } m moves it
//   along its facing: a sub-place)
const CORNERS = [
  ['tower', 'Park Ave & E 51st St', 'Park Ave', 'E 51st St'],
  ['towergarage', 'Lexington Ave & E 52nd St', 'Lexington Ave', 'E 52nd St'],
  ['les', 'Orchard St & Rivington St', 'Orchard St', 'Rivington St'],
  ['ludlow', 'Ludlow St & E Houston St', 'Ludlow St', 'E Houston St'],
  ['delancey', 'Delancey St & Essex St', 'Delancey St', 'Essex St'],
  ['soho', 'Prince St & Greene St', 'Prince St', 'Greene St'],
  ['bowery', 'Bowery & E Houston St', 'Bowery', 'E Houston St'],
  ['meatpacking', 'Gansevoort St & Washington St', 'Gansevoort St', 'Washington St'],
  ['chelsea', 'W 24th St & 10th Ave', 'W 24th St', '10th Ave'],
  ['tribeca', 'Franklin St & Hudson St', 'Franklin St', 'Hudson St'],
  ['canal', 'Canal St & Varick St', 'Canal St', 'Varick St'],
  ['westvillage', 'Bank St & Greenwich St', 'Bank St', 'Greenwich St'],
  ['foley', 'Foley Square', 'Centre St', 'Worth St'],
  ['hudsonyards', 'W 33rd St & 11th Ave', 'W 33rd St', '11th Ave'],
  ['lincoln', 'Lincoln Center', 'Columbus Ave', 'W 63rd St'],
  ['amnh', 'Columbus Ave & W 79th St', 'Columbus Ave', 'W 79th St'],
  ['ues', 'Park Ave & E 97th St', 'Park Ave', 'E 97th St'],
  ['un', 'E 42nd St & 1st Ave', 'E 42nd St', '1st Ave'],
  ['harlem', 'W 125th St & Frederick Douglass Blvd', 'W 125th St', 'Frederick Douglass Blvd'],
  ['timessquare', 'Times Square', '7th Ave', 'W 46th St'],
  ['wallst', 'Wall St & Broad St', 'Wall St', 'Broad St'],
  ['murrayhill', 'Madison Ave & E 37th St', 'Madison Ave', 'E 37th St'],
  ['chelseapark', 'Chelsea Park', '9th Ave', 'W 28th St'],
  ['tenth47', '10th Ave & W 47th St', '10th Ave', 'W 47th St'],
  ['tenth55', '10th Ave & W 55th St', '10th Ave', 'W 55th St'],
  ['westyards', '12th Ave & W 55th St', '12th Ave', 'W 55th St'],
  ['javits', '11th Ave & W 34th St', '11th Ave', 'W 34th St'],
  ['heraldsq', 'Herald Square', '6th Ave', 'W 34th St'],
  ['westchelsea', '11th Ave & W 22nd St', '11th Ave', 'W 22nd St'],
  ['washsq', 'Washington Square', '5th Ave', 'Washington Sq N'],
  ['washmews', '5th Ave & W 8th St', '5th Ave', 'W 8th St'],
  ['sdrpark', 'Sara D. Roosevelt Park', 'Forsyth St', 'Rivington St'],
];
const SPAWN_NAMES = { empire: 'Empire State Building', timessq: 'Times Square', chrysler: 'Chrysler Building', grandcentral: 'Grand Central',
  bryant: 'Bryant Park', flatiron: 'Flatiron', centralpark: 'Central Park South', owtc: 'One World Trade Center' };
const FDR = [['fdr', 'FDR Drive at E 34th St', 640, Math.PI], ['fdr-un', 'FDR Drive by the UN', -250, 0]];
// San Francisco's arrivals by their keys (GameMog storykit/pack/cities.ts PLACES.sf: no company's name), and its place
// library (storykit/cities/sf/city.js PLACES: x, z in its frame)
const SF_SPAWN_NAMES = { powell: 'Powell St & California St', market: 'Montgomery St & Market St', mission: 'Dolores St by the Mission',
  ferry: 'the Ferry Building', salesforce: 'the tower on Mission St', transamerica: 'the pyramid on Montgomery St', coit: 'Coit Tower',
  lombard: 'the crooked block of Lombard St', wharf: "Fisherman's Wharf", unionsquare: 'Union Square', chinatown: 'the Dragon Gate',
  civiccenter: 'City Hall', oraclepark: 'the ballpark at China Basin', nobhill: 'the cathedral on Nob Hill' };
export const SF_PLACES = {
  touchdown: { x: 882, z: 217, name: 'Fremont & Harrison' },
  bayramp: { x: 804, z: 295, name: 'the Bay Bridge on-ramp at 1st St' },
  ramp5th: { x: 156, z: 1212, name: 'the 5th St bridge ramp' },
  ramp280: { x: 511, z: 1570, name: 'the I-280 ramps at King St' },
  ramp101: { x: -676, z: 2039, name: 'the US-101 ramps at 10th St' },
  octavia: { x: -1903, z: 1885, name: 'Market & Octavia' },
  larkin_eddy: { x: -1362, z: 601, name: 'Larkin & Eddy' },
  leavenworth_eddy: { x: -1072, z: 555, name: 'Leavenworth & Eddy' },
  civic: { x: -1297, z: 1013, name: 'Civic Center' },
  bart16: { x: -1560, z: 2560, name: '16th St BART' },
  mission_14: { x: -1564, z: 2447, name: 'Mission at 14th' },
  valencia_15: { x: -1760, z: 2462, name: 'Valencia & 15th' },
  dolores_15: { x: -2165, z: 2441, name: 'Dolores at 15th' },
  under280: { x: 700, z: 2440, name: 'under I-280 at 16th' },
  third_16: { x: 1142, z: 2422, name: '3rd & 16th' },
  mission_rock: { x: 1088, z: 1753, name: '3rd & Mission Rock' },
  fourth_mb: { x: 942, z: 1764, name: '4th St in Mission Bay' },
  pier48: { x: 1403, z: 1446, name: 'Pier 48', foot: true },
  pier28: { x: 1382, z: 64, name: 'Piers 26–28', foot: true },
  pier9: { x: 463, z: -1323, name: 'Pier 9', foot: true },
  pier24: { x: 1263, z: -84, name: 'the Pier 24 dock' },
  tenth_harrison: { x: -811, z: 1903, name: '10th & Harrison' },
  sixth_folsom: { x: -313, z: 1134, name: '6th & Folsom' },
  bryant: { x: -236, z: 1603, name: 'Bryant St by the Hall of Justice' },
  hall: { x: -189, z: 1479, name: 'the Hall of Justice', foot: true },
  vanness: { x: -1702, z: 337, name: 'Van Ness Ave' },
  broadway: { x: -2300, z: -710, name: 'Broadway in Pacific Heights' },
  goldengate_ave: { x: -2399, z: 1047, name: 'Golden Gate Ave' },
  king_4th: { x: 707, z: 1375, name: 'King & 4th' },
  emb_mission: { x: 843, z: -560, name: 'the Embarcadero at Mission' },
  emb_bryant: { x: 1257, z: 180, name: 'the Embarcadero at Bryant' },
  folsom_2nd: { x: 472, z: 353, name: 'Folsom & 2nd' },
  harrison_8th: { x: -568, z: 1661, name: 'Harrison & 8th' },
  channel_4th: { x: 919, z: 1598, name: 'Channel & 4th' },
  vn_broadway: { x: -1880, z: -779, name: 'Van Ness & Broadway' },
};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function createPlaces(W, world) {
  const N = window.NYC, app = W.app, net = app.trafficSystem.network;
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
          const L = d2x * d2x + d2z * d2z || 1e-9, k = clamp(((x - u.x) * d2x + (z - u.z) * d2z) / L, 0, 1);
          const d = Math.hypot(u.x + d2x * k - x, u.z + d2z * k - z);
          if (!best || d < best.d) best = { x: (x + u.x + d2x * k) / 2, z: (z + u.z + d2z * k) / 2, d };
        }
      }
    }
    return best && best.d < 40 ? best : null;
  }
  function nearestLane(x, z, R = 80) {
    let best = null;
    for (const e of net.edges) {
      if (e.len < 8) continue;
      const mx = e.sx + e.dx * e.len / 2, mz = e.sz + e.dz * e.len / 2;
      if (Math.abs(mx - x) > R + e.len / 2 || Math.abs(mz - z) > R + e.len / 2) continue;
      const s = clamp((x - e.sx) * e.dx + (z - e.sz) * e.dz, 4, e.len - 4);
      for (let l = 0; l < e.lanes.length; l++) {
        const px = e.sx + e.dx * s + e.rx * e.lanes[l], pz = e.sz + e.dz * s + e.rz * e.lanes[l], d = Math.hypot(px - x, pz - z);
        if (!best || d < best.d) best = { x: px, z: pz, heading: Math.atan2(e.dx, e.dz), d };
      }
    }
    return best;
  }
  const lib = {}, missing = [];
  if (N.CITY === 'sf') sfLibrary(); else nyLibrary();
  // San Francisco's: the arrivals on the ground (not the helicopter's over the region), then the library on its lanes
  function sfLibrary() {
    for (const [k, p] of Object.entries(N.TELEPORT_LOCATIONS || {})) if (p.mode !== 'helicopter') lib[k] = { x: p.x, z: p.z, heading: p.heading, name: SF_SPAWN_NAMES[k] || k };
    for (const [key, p] of Object.entries(SF_PLACES)) {
      if (p.foot) { lib[key] = { x: p.x, z: p.z, heading: Math.PI, name: p.name, foot: true }; continue; }
      const lane = nearestLane(p.x, p.z, 60);
      if (lane) lib[key] = { x: lane.x, z: lane.z, heading: lane.heading, name: p.name, cx: p.x, cz: p.z };
      else missing.push(key);
    }
    for (const k of Object.keys(SF_SPAWN_NAMES)) if (!lib[k]) missing.push(k);
  }
  // New York's: the arrivals, the named corners, the FDR
  function nyLibrary() {
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
  if (missing.length) console.warn('[storyrun] places not found on the map:', missing.join(', '));
  const aliases = (world && world.places) || {};
  function base(key) {
    if (Object.prototype.hasOwnProperty.call(aliases, key)) {
      const a = aliases[key];
      // (a world's own mark on this map: at [x, z, heading in degrees], Mog City's own story's marks, packs/mog-city.json)
      if (Array.isArray(a.at) && a.at.length >= 2 && a.at.every((v) => Number.isFinite(v) && Math.abs(v) < 20000)) return { x: a.at[0], z: a.at[1], heading: (a.at[2] || 0) * Math.PI / 180, name: a.name || key, face: a.face };
      const p = lib[a['@']];
      if (!p) return null;
      return { ...p, name: a.name || p.name, ...(a.heading != null ? { heading: a.heading * Math.PI / 180 } : {}), face: a.face };
    }
    return lib[key] ? { ...lib[key] } : null;
  }
  function at(ref) {
    if (!ref) return null;
    const key = typeof ref === 'string' ? ref.replace(/^@/, '') : ref['@'];
    const p = base(key);
    if (!p) return null;
    if (typeof ref === 'object') {
      if (ref.heading != null) p.heading = ref.heading * Math.PI / 180;
      if (ref.mode) p.mode = ref.mode;
      if (ref.face) p.face = ref.face;
    }
    if (p.face) { const f = base(p.face); if (f && Math.hypot(f.x - p.x, f.z - p.z) > 2) p.heading = Math.atan2(f.x - p.x, f.z - p.z); }
    // (a sub-place: an alias's offset { right, fwd } m, up to 60, in its facing's frame: the side door round the corner)
    const off = Object.prototype.hasOwnProperty.call(aliases, key) ? aliases[key].offset : null;
    if (off && typeof off === 'object') {
      const r = Math.max(-60, Math.min(60, +off.right || 0)), f = Math.max(-60, Math.min(60, +off.fwd || 0)), h = p.heading ?? 0;
      const dx = Math.sin(h) * f - Math.cos(h) * r, dz = Math.cos(h) * f + Math.sin(h) * r;
      p.x += dx; p.z += dz; if (p.cx != null) { p.cx += dx; p.cz += dz; }
    }
    return p;
  }
  return { at, lib, missing };
}
