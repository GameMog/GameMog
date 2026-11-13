// Mog City story runner: the place library, the names a pack writes as "@key" (GameMog storykit/pack/cities.ts PLACES:
// New York's 42 keys, San Francisco's 49), on Mog City's own maps. The library itself is the world contract's
// (wagmi/world: world.places, laid on the map by ny.js and sf.js, their data moved unchanged to places-ny.js and
// places-sf.js): New York's arrivals, its named corners of two real streets and the FDR; San Francisco's arrivals on the
// ground and its own places; each on its nearest drivable lane facing along it, a `foot` one (a pier's end, a door)
// where it is. This file reads a pack's references against it.
//   createPlaces(W, world) -> { at(ref) -> { x, z, heading, name, mode } | null, list, missing }
//   ref: '@key' | { '@': key, face, heading (deg), mode } | a pack alias (world.places: { alias: { '@': key, name } }, or
//   { at: [x, z, heading (deg)], name }: a mark of the world's own on this map; an alias's offset { right, fwd } m moves it
//   along its facing: a sub-place)
//   | { site: { kind, near, ... } }: a place picked by what it is, in whatever city the page plays (wagmi/world
//   findMissionSites, wagmi/world/MISSION-SITES.md), or { site: '<id>' }: the one an earlier site of the same mission
//   named with its `id`. A mission's sites are picked together, in the order the mission writes them, the first time
//   one of them is asked for (prepare(mission) at its start), seeded by the world's seed (or id), the mission's id and
//   the site's own id (or its place in that order): the same world gives the same sites in the same city every run, a
//   Mog of it the same ones as its parent. Each is then fixed for the page's life.
//   prepare(mission) -> [{ i, kind, key, name, x, z, cx, cz }];  sites() -> every site picked so far;  siteName(mission,
//   id) -> a site's name here (the runner's {site.<id>} in a line or an objective)
import { world as cityWorld } from '../world/index.js';
export { SF_PLACES } from '../world/places-sf.js';

// a site ref: { site: { kind, ... } } or { site: '<id>' }
export const isSiteRef = (r) => !!r && typeof r === 'object' && !Array.isArray(r) && (typeof r.site === 'string' || (!!r.site && typeof r.site === 'object' && !Array.isArray(r.site)));
// the words a site's request may hold (the rest of the vocabulary is the world's: findMissionSites)
export const SITE_KEYS = ['kind', 'id', 'near', 'min', 'max', 'road', 'access', 'open', 'roadView', 'reach', 'minLen', 'maxLen', 'signal', 'apart', 'fallback', 'name', 'seed'];
// a mission's site refs in the order it writes them: its start first, then everything else (nested steps too)
export function siteRefs(m) {
  const out = [];
  const walk = (v, depth) => {
    if (!v || typeof v !== 'object' || depth > 14) return;
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (isSiteRef(v)) { out.push(v); return; }
    for (const x of Object.values(v)) walk(x, depth + 1);
  };
  walk(m && m.start, 0);
  for (const [k, v] of Object.entries(m || {})) if (k !== 'start') walk(v, 0);
  return out;
}

export function createPlaces(W, world) {
  // (the city's place library, laid on its map by the world contract: wagmi/world, ny.js and sf.js, their data in
  // places-ny.js and places-sf.js)
  const lib = cityWorld.places, missing = cityWorld.placesMissing.slice();
  if (missing.length) console.warn('[storyrun] places not found on the map:', missing.join(', '));
  const aliases = (world && world.places) || {};
  // ---- sites (wagmi/world/MISSION-SITES.md)
  const owner = new WeakMap(), done = new Map(), picked = new WeakMap(), loose = new Map(), all = [];
  for (const m of (world && world.missions) || []) for (const r of siteRefs(m)) if (!owner.has(r)) owner.set(r, m);
  const seedBase = String((world && (world.seed ?? world.id)) || 'world');
  const pt = (p) => (p ? { x: p.cx ?? p.x, z: p.cz ?? p.z } : null);
  function pickSite(spec, m, label, near, implicit, used) {
    const req = { count: 1, seed: `${spec.seed ?? seedBase}|${m ? m.id : '-'}|${label}`, avoid: used.map((u) => ({ x: u.cx ?? u.x, z: u.cz ?? u.z, r: spec.apart ?? 40 })) };
    for (const k of ['kind', 'min', 'max', 'road', 'access', 'open', 'roadView', 'reach', 'minLen', 'maxLen', 'signal', 'fallback']) if (spec[k] != null) req[k] = spec[k];
    if (near) req.near = near;
    // (a site near the one before it, its mission's start or the city's first arrival, and nothing said of how far:
    // within 900 m, as far as needed if there is none)
    if (near && implicit && req.max == null) req.max = 900;
    let got = cityWorld.findMissionSites(req)[0];
    if (!got && near && req.max != null) for (const k of [2, 4, Infinity]) { got = cityWorld.findMissionSites({ ...req, max: k === Infinity ? undefined : req.max * k })[0]; if (got) break; }
    if (!got) { console.warn('[storyrun] no site in this city for', m ? m.id : '-', label, JSON.stringify(spec).slice(0, 160)); return null; }
    const foot = spec.access === 'foot';
    const p = { x: foot ? got.cx : got.x, z: foot ? got.cz : got.z, heading: foot ? Math.atan2(got.cx - got.x, got.cz - got.z) : got.heading, name: spec.name || got.name,
      cx: got.cx, cz: got.cz, site: got.key, kind: got.kind, ...(foot ? { foot: true } : {}), ...(got.fallback ? { fallback: got.fallback } : {}), ...(got.ex != null ? { ex: got.ex, ez: got.ez, length: got.length } : {}) };
    return p;
  }
  function nearOf(n, m, ids, prev) {
    if (Array.isArray(n) && n.length >= 2) return { at: { x: n[0], z: n[1] }, implicit: false };
    if (typeof n === 'string' && n.startsWith('@')) return { at: pt(base(n.slice(1))), implicit: false };
    if (n === 'start') return { at: m && m.start ? pt(isSiteRef(m.start) ? picked.get(m.start) : at(m.start)) : null, implicit: false };
    if (typeof n === 'string') return { at: pt(ids.get(n)), implicit: false };
    if (prev) return { at: pt(prev), implicit: true };
    if (m && m.start && !isSiteRef(m.start)) return { at: pt(at(m.start)), implicit: true };
    const sp = cityWorld.spawnPoints('ground')[0];
    return { at: sp ? { x: sp.x, z: sp.z } : null, implicit: true };
  }
  // a mission's sites, all of them, once
  function prepare(m) {
    if (!m || done.has(m)) return done.get(m) || [];
    // (not before the city's roads are up: nothing would be found, and nothing is kept)
    if (!Object.keys(cityWorld.places || {}).length) return [];
    const ids = new Map(), used = [], list = [];
    done.set(m, list);
    let prev = null;
    const refs = siteRefs(m);
    refs.forEach((r, i) => {
      if (typeof r.site === 'string') return;
      const spec = r.site, n = nearOf(spec.near, m, ids, prev);
      const p = pickSite(spec, m, spec.id ?? i, n.at, n.implicit, used);
      picked.set(r, p);
      if (spec.id) ids.set(spec.id, p);
      if (p) { used.push(p); prev = p; }
      const e = { mission: m.id, i, id: spec.id || null, kind: spec.kind, key: p && p.site, name: p && p.name, x: p && p.x, z: p && p.z, cx: p && p.cx, cz: p && p.cz, fallback: p && p.fallback };
      list.push(e); all.push(e);
    });
    for (const r of refs) if (typeof r.site === 'string') picked.set(r, ids.get(r.site) || null);
    console.info('[storyrun] sites', m.id, list.map((e) => `${e.kind}${e.id ? ' ' + e.id : ''} -> ${e.name || 'none'}${e.fallback ? ' (' + e.fallback + ')' : ''}`).join('; '));
    return list;
  }
  function siteAt(ref) {
    const m = owner.get(ref);
    if (m) { prepare(m); return picked.has(ref) ? picked.get(ref) : null; }
    // (a ref the world doesn't hold, a copy of one: picked on its own, by what it says)
    if (typeof ref.site === 'string') return null;
    const k = JSON.stringify(ref.site);
    if (!Object.keys(cityWorld.places || {}).length) return null;
    if (!loose.has(k)) { const n = nearOf(ref.site.near, null, new Map(), null); loose.set(k, pickSite(ref.site, null, k, n.at, n.implicit, [])); }
    return loose.get(k);
  }
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
    const isSite = isSiteRef(ref);
    const key = isSite ? null : typeof ref === 'string' ? ref.replace(/^@/, '') : ref['@'];
    const s0 = isSite ? siteAt(ref) : null;
    const p = isSite ? (s0 && { ...s0, ...(ref.name ? { name: ref.name } : {}) }) : base(key);
    if (!p) return null;
    if (typeof ref === 'object') {
      if (ref.heading != null) p.heading = ref.heading * Math.PI / 180;
      if (ref.mode) p.mode = ref.mode;
      if (ref.face) p.face = ref.face;
    }
    if (p.face) { const f = base(p.face); if (f && Math.hypot(f.x - p.x, f.z - p.z) > 2) p.heading = Math.atan2(f.x - p.x, f.z - p.z); }
    // (a sub-place: an alias's offset { right, fwd } m, up to 60, in its facing's frame: the side door round the corner)
    const off = key != null && Object.prototype.hasOwnProperty.call(aliases, key) ? aliases[key].offset : null;
    if (off && typeof off === 'object') {
      const r = Math.max(-60, Math.min(60, +off.right || 0)), f = Math.max(-60, Math.min(60, +off.fwd || 0)), h = p.heading ?? 0;
      const dx = Math.sin(h) * f - Math.cos(h) * r, dz = Math.cos(h) * f + Math.sin(h) * r;
      p.x += dx; p.z += dz; if (p.cx != null) { p.cx += dx; p.cz += dz; }
    }
    return p;
  }
  // (a mission's site by its id: its name here, for a line or an objective's {site.<id>})
  const siteName = (m, id) => { const l = prepare(m); const e = l.find((x) => x.id === id); return e ? e.name : null; };
  return { at, lib, missing, prepare, siteName, sites: () => all.slice() };
}
