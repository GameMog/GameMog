// A growing town (Hometown production builder, M6): the first bundle a player drives is the town's SPAWN DISTRICT (5 x 5
// tiles round the spawn, PKG.window, PKG.variant 'district-{c}-{r}'), played while the rest of the town is still being
// built; the whole town (variant 'full') takes its place at the next good moment. Inert for every other world: it does
// anything only when the bundle says PKG.window.full === false, and a full bundle only restores a pose a swap saved.
//
//   the edge     the district's terrain runs on into the far field, or the fill (cities/pkg/js/pkg-far.js), and a soft
//                haze stands from the edge out (pkg-far.js); here: a soft boundary (the car slowed and steered back over
//                BAND m, no wall, no damage), the line "The rest of town is still being built" near it, traffic and
//                people placed only inside the window less CLIP m (window.NYC.townWindow: js/traffic.js,
//                wagmi/street/crowd.js), places and arrivals outside it held back (wagmi/world/pkg.js)
//   the swap     GET {host}/api/towns/{place}?build={buildId} (no-store) every POLL_MS; once it answers the whole town
//                ({ state: 'full' } or { full: true }), the toast "Your whole town is ready", then at the next checkpoint,
//                mission end or pause (at once inside the boundary band), a FADE_MS fade and the same address with
//                tv=full. The pose (x, z, heading, speed, mode) rides along in sessionStorage; the story's Continue is its
//                own save (mc.pack.{id}.v1), per world, not per variant. The frame is the same (lock v3), so is every
//                coordinate.
//   the upgrade  a story world pinned to an older build of its town (GameMog lib/storykit-upgrade.ts, 14 Nov: The Courtesy
//                Lane kept the 0.8.0 district of its town for ever once the builder moved on): the poll names the world
//                the page plays (&world=<sha256> of ?pack=), and when the town's CURRENT build has its whole town and every
//                place of the world is the same place there, the answer carries `upgrade` { build, tilesId, pack }: the
//                swap then goes to that build's whole town (tc, ts, tv=full) with the world re-pinned to it (pack), so
//                the story's check (wagmi/storyrun/pack.js) still sees its pin equal the bundle's lock. The frame is the
//                same (GameMog checked it), so is every coordinate and the pose.
//   beacons      performance marks for time to first drive: mc:town:boot (this module), mc:town:bundle (index.html),
//                mc:first-drive (the player in control); window.__mcTTFD { bootMs, bundleMs, driveMs, variant }
// Player text never names a tool, a vendor or a model.
export const BAND = 40;          // m: the soft boundary
export const LINE_AT = 90;       // m: the HUD line shows this close to the edge
export const CLIP = 150;         // m: traffic and people stay this far inside the window
export const POLL_MS = 10000;
export const FADE_MS = 1200;
export const POSE_TTL_MS = 5 * 60 * 1000;
export const WORDS = { edge: 'The rest of town is still being built', ready: 'Your whole town is ready' };

import { BUILD_ID, TILE_SET } from './town-src.js';

const N = () => globalThis.window?.NYC || {};

// the window's box in session metres ({ x0, z0, x1, z1 }) or null (not a growing town)
export function windowBox(P) {
  const w = P && P.window;
  if (!w || w.full !== false || !w.box) return null;
  const b = w.box;
  return [b.x0, b.z0, b.x1, b.z1].every(Number.isFinite) && b.x1 > b.x0 && b.z1 > b.z0 ? { x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 } : null;
}
// a whole town's window box (PKG.window.full true), its play area's edge, or null
export function townEdge(P) {
  const w = P && P.window;
  if (!w || w.full !== true || !w.box) return null;
  const b = w.box;
  return [b.x0, b.z0, b.x1, b.z1].every(Number.isFinite) && b.x1 > b.x0 + 2 * BAND && b.z1 > b.z0 + 2 * BAND ? { x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 } : null;
}
// m inside the box (negative: outside), and the outward normal of the nearest edge
export function edgeOf(b, x, z) {
  const d = [[x - b.x0, -1, 0], [b.x1 - x, 1, 0], [z - b.z0, 0, -1], [b.z1 - z, 0, 1]];
  let best = d[0];
  for (const e of d) if (e[0] < best[0]) best = e;
  return { inside: best[0], nx: best[1], nz: best[2] };
}
export const clipRect = (b, m = CLIP) => ({ minX: b.x0 + m, maxX: b.x1 - m, minZ: b.z0 + m, maxZ: b.z1 - m });
export const inWindow = (b, x, z, m = 0) => !b || (x >= b.x0 + m && x <= b.x1 - m && z >= b.z0 + m && z <= b.z1 - m);

// the soft boundary, one frame: a car slowed and turned back in proportion to how deep in the band it is; anyone past
// the edge put back on it. Mutates the entity (the controllers' own fields). Returns how deep in the band (0..1).
export function softBoundary(b, ent, mode, dt) {
  if (!ent || !ent.position) return 0;
  const p = ent.position, e = edgeOf(b, p.x, p.z);
  if (e.inside >= BAND) return 0;
  const t = Math.min(1, Math.max(0, 1 - e.inside / BAND));
  if (mode === 'car' || mode === 'cyclist') {
    const fx = Math.sin(ent.heading || 0), fz = Math.cos(ent.heading || 0), out = fx * e.nx + fz * e.nz;
    const sp = ent.speed || 0;
    if (out * Math.sign(sp || 1) > 0) {
      // (heading out: slower, and the nose turned toward the inside, the harder the deeper)
      ent.speed = sp * Math.max(0, 1 - 2.2 * t * dt);
      // (d(out)/d(heading) = cos h nx - sin h nz: turn the way that makes the motion less outward)
      const side = Math.cos(ent.heading || 0) * e.nx - Math.sin(ent.heading || 0) * e.nz;
      ent.heading -= (side >= 0 ? 1 : -1) * Math.sign(sp || 1) * 1.6 * t * dt;
      if (Number.isFinite(ent.vx) && Number.isFinite(ent.vz)) {
        const vo = ent.vx * e.nx + ent.vz * e.nz;
        if (vo > 0) { ent.vx -= e.nx * vo * Math.min(1, 3 * t * dt); ent.vz -= e.nz * vo * Math.min(1, 3 * t * dt); }
      }
    }
  }
  if (e.inside < 0) { // (past the edge itself: back on it)
    p.x = Math.min(b.x1, Math.max(b.x0, p.x));
    p.z = Math.min(b.z1, Math.max(b.z0, p.z));
    if (mode === 'car' && Number.isFinite(ent.speed)) ent.speed *= 0.5;
  }
  return t;
}

// the town's status answer -> is the whole town ready? (GameMog /api/towns/{place}: { state: 'full' } or { full: true })
export const fullReady = (body) => !!body && (body.state === 'full' || body.full === true || (body.variants && !!body.variants.full));

// the address of the whole town: the same one with tv=full
export function fullHref(href) {
  const u = new URL(href);
  u.searchParams.set('tv', 'full');
  return u.href;
}
// the story world the page plays: the SHA-256 in its ?pack= (<host>/storykit/f/<sha256>.json, on the town's own host), or null
export function worldOf(href, host) {
  try {
    const p = new URL(href).searchParams.get('pack') || '', m = /^(.*)\/storykit\/f\/([0-9a-f]{64})\.json$/.exec(p);
    return m && m[1] === host ? m[2] : null;
  } catch { return null; }
}
// the poll's answer -> the newer whole town the world may play instead ({ build, tilesId, pack }), or null
export function upgradeOf(body) {
  const u = body && body.upgrade;
  if (!u || typeof u !== 'object' || u.variant !== 'full') return null;
  if (typeof u.build !== 'string' || !BUILD_ID.test(u.build) || u.build.includes('..') || typeof u.tilesId !== 'string' || !TILE_SET.test(u.tilesId)) return null;
  if (typeof u.pack !== 'string' || !/^\/storykit\/f\/[0-9a-f]{64}\.json$/.test(u.pack)) return null;
  return { build: u.build, tilesId: u.tilesId, pack: u.pack };
}
// the address of the newer whole town: its build, tiles and variant, and the world re-pinned to it (on the same host)
export function upgradeHref(href, up, host) {
  const u = new URL(href);
  u.searchParams.set('tc', up.build);
  u.searchParams.set('ts', up.tilesId);
  u.searchParams.set('tv', 'full');
  u.searchParams.set('pack', host + up.pack);
  return u.href;
}
export const poseKey = (t) => `mc.town.pose.${t.place}.${t.tiles}`;

function mark(name) { try { performance.mark(name); } catch {} }
function measures(variant) {
  const at = (n) => { try { const e = performance.getEntriesByName(n); return e.length ? Math.round(e[e.length - 1].startTime) : null; } catch { return null; } };
  return { bootMs: at('mc:town:boot'), bundleMs: at('mc:town:bundle'), driveMs: at('mc:first-drive'), variant };
}

// the player's pose, read and written through the controller manager
const app = () => globalThis.window?.__NYC_APP || null;
function pose() {
  const cm = app()?.controllerManager, e = cm?.getActiveEntity?.();
  if (!e || !e.position) return null;
  return { x: e.position.x, z: e.position.z, heading: e.heading || 0, speed: e.speed || 0, mode: cm.activeMode, t: Date.now() };
}

function el(id, css, text) {
  const d = document.createElement('div');
  d.id = id; d.style.cssText = css; d.textContent = text || '';
  document.body.appendChild(d);
  return d;
}
const PILL = 'position:fixed;left:50%;transform:translateX(-50%);z-index:60;pointer-events:none;font:600 14px/1.2 system-ui,sans-serif;'
  + 'color:#fff;background:rgba(20,18,14,.62);padding:9px 16px;border-radius:999px;letter-spacing:.01em;transition:opacity .4s;opacity:0;';

// a player in control: the loading overlay gone and an entity to drive
const inControl = () => !!pose() && !document.getElementById('loading-overlay')?.offsetParent && !globalThis.window?.WAGMI?.cutscene;

// boot: called by index.html with the town address and its bundle's PKG, for every town (district or full)
export function startGrowing({ town, PKG, fetchFn = globalThis.fetch, href = globalThis.location?.href }) {
  mark('mc:town:boot');
  const W = globalThis.window, variant = PKG?.variant || (town?.tv || 'full');
  const box = windowBox(PKG);
  const state = { box, variant, armed: false, swapping: false, polls: 0, last: null, band: 0 };
  W.__mcGrowing = state;

  // ---- the beacon: first drive (any variant)
  (function waitDrive() {
    if (inControl()) { mark('mc:first-drive'); W.__mcTTFD = measures(variant); return; }
    setTimeout(waitDrive, 100);
  })();

  // ---- a pose a swap left: restored once the player is in control (whatever the variant)
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(poseKey(town)) || 'null'); } catch {}
  if (saved && Date.now() - (saved.t || 0) < POSE_TTL_MS && [saved.x, saved.z].every(Number.isFinite)) {
    (function restore(n) {
      const cm = app()?.controllerManager;
      if (!inControl() || !cm) { if (n < 600) setTimeout(() => restore(n + 1), 100); return; }
      try {
        if (saved.mode && cm.activeMode !== saved.mode && cm.entities?.[saved.mode]) { /* (a different mode: the spot only) */ }
        cm.teleportActiveTo(saved.x, saved.z, saved.heading);
        const e = cm.getActiveEntity();
        if (e && cm.activeMode === saved.mode && Number.isFinite(saved.speed)) e.speed = saved.speed;
      } catch (e) { console.warn('[growing] pose', e); }
      try { sessionStorage.removeItem(poseKey(town)); } catch {}
      state.restored = true;
    })(0);
  }
  if (!box) {
    // ---- a whole town: its edge held too, by the same soft boundary (no line, no swap). Past the window there is only
    // the far field, no roads: a deck the window cut off (Cold Harbor's Seaside Freeway, 45 m up at the town's west edge)
    // ends at a barrier (cities/sf/js/grade-separation.js), and the car is turned back before it gets there
    const edge = townEdge(PKG);
    state.edge = edge;
    if (edge) {
      let lastT = performance.now();
      (function frame() {
        requestAnimationFrame(frame);
        const t = performance.now(), dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
        if (W.WAGMI?.paused || W.WAGMI?.cutscene) return;
        const cm = app()?.controllerManager, ent = cm?.getActiveEntity?.();
        if (!ent || !ent.position || cm.activeMode === 'helicopter') return;
        state.band = softBoundary(edge, ent, cm.activeMode, dt);
      })();
    }
    return state;
  }

  // ---- a district: traffic and people inside the window less CLIP, the line, the boundary, the poll and the swap
  N().townWindow = clipRect(box);
  const line = el('mc-town-edge', PILL + 'top:118px;', WORDS.edge); // (top centre: the bottom holds the interaction hints)
  const toast = el('mc-town-ready', PILL + 'top:72px;', WORDS.ready);
  const fade = el('mc-town-fade', `position:fixed;inset:0;z-index:70;background:#000;opacity:0;pointer-events:none;transition:opacity ${FADE_MS}ms ease;`);

  function swap(why) {
    if (state.swapping) return;
    state.swapping = true; state.why = why;
    // (an upgrade: the newer build's whole town, its pose under its own tiles id, the address the new page reads it by)
    const up = state.upgrade, to = up ? { place: town.place, tiles: up.tilesId } : town;
    try { const p = pose(); if (p) sessionStorage.setItem(poseKey(to), JSON.stringify(p)); } catch {}
    fade.style.pointerEvents = 'auto';
    requestAnimationFrame(() => { fade.style.opacity = '1'; });
    setTimeout(() => { try { W.location.replace(up ? upgradeHref(href, up, town.host) : fullHref(href)); } catch (e) { console.warn('[growing] swap', e); } }, FADE_MS);
  }
  const soon = (why) => { if (state.armed) setTimeout(() => swap(why), 0); };
  W.addEventListener('mc:checkpoint', () => soon('checkpoint'));
  W.addEventListener('mc:tell', (e) => { if (e.detail && e.detail.type === 'mission-end') soon('mission-end'); });

  async function poll() {
    if (state.armed || state.swapping) return;
    state.polls++;
    try {
      const world = worldOf(href, town.host);
      const r = await fetchFn(`${town.host}/api/towns/${encodeURIComponent(town.place)}?build=${encodeURIComponent(town.buildId)}${world ? `&world=${world}` : ''}`, { cache: 'no-store', credentials: 'omit', redirect: 'error' });
      if (r.ok) {
        const b = await r.json();
        state.last = b && b.state || null;
        const up = world ? upgradeOf(b) : null;
        if (up || fullReady(b)) {
          state.armed = true; state.upgrade = up;
          toast.style.opacity = '1';
          setTimeout(() => { toast.style.opacity = '0'; }, 6000);
          return;
        }
      }
    } catch {}
    setTimeout(poll, POLL_MS);
  }
  setTimeout(poll, 1500);

  let lastT = performance.now();
  (function frame() {
    if (state.swapping) return;
    requestAnimationFrame(frame);
    const t = performance.now(), dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
    const cm = app()?.controllerManager, ent = cm?.getActiveEntity?.();
    if (!ent || !ent.position) return;
    const paused = !!W.WAGMI?.paused;
    state.band = paused ? state.band : softBoundary(box, ent, cm.activeMode, dt);
    const e = edgeOf(box, ent.position.x, ent.position.z);
    line.style.opacity = e.inside < LINE_AT && !paused && !state.armed ? '1' : '0';
    if (state.armed && (paused || state.band > 0)) swap(paused ? 'pause' : 'boundary');
  })();
  return state;
}
