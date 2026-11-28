// Mog City: a Hometown town's own air (Mandi's Revenge's Chicago first; any compiled town, ?city=pkg). Synthesized, no
// sound files, on the amb bus under city.js's street bed, quiet, and further down while someone in the story talks.
// The layers and their maths follow huangserva/manhattan-free-roam's src/audio.js (MIT, see NOTICE): its city hum, two
// bands of noise a little apart, one per ear, so the bed is wide and never one tone; its distant traffic, an event
// every so often that swells and goes, rarer at night. To that, what a town has that New York's bed does not know:
//   hum      the city's low wide hum (118 and 154 Hz bands, left and right), a little lower at night
//   far      a car going by a few blocks off: a band of road noise swelling and passing across, its band falling as it
//            goes (every 4-12 s on a busy street, half as often at night, none in a park)
//   train    the L: near the town's elevated tracks (GEO.elevated, the compiler's features.py, built by another part of
//            the engine), a train now and then, along the track over the street: its rumble, the wheels' beat over
//            the rail joints, a squeal of steel, the structure booming under it. A town without them: no trains. A
//            story's anchor named for the tracks (under-l) stands in for them where there is no track data
//   water    by the river and the lake (the map's water within 50 m): a slow wash and small laps against the edge
//   murmur   at night, near a lit place (a bar, a restaurant, a hotel: the package's places), people inside: a muffled
//            crowd from its way, and now and then a glass
// Nothing here is music: no pitch is held, no note is played (docs/PRODUCT.md, no music by default).
//   createAmbience(M, E, W) -> { update(dt), where, force(name), debug() } | null (not a Hometown town, ?amb2=0)
import { world } from '../world/index.js';
import { maskClass } from '../world/sf.js';

const LEVEL = { hum: 0.03, far: 0.022, train: 0.45, boom: 0.05, water: 0.05, lap: 0.035, murmur: 0.11, glass: 0.008 };
const TALK = 0.55;          // (under a story line: all of it down to this, on top of the amb bus's own dip)
const INDOORS = 0.3;        // (a video call's room: the town barely there)
// (where people are out at night: a bar, a pub, a club, a hotel's lobby and bar, a theatre; not every restaurant or coffee
// shop: downtown Chicago has 2,000 of those, and the murmur would be on every block)
const LIT = /\bbar\b|pub|night|club|lounge|tavern|brew|wine|cocktail|hotel|theat|music|casino|bowling/i;
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createAmbience(M, E, W) {
  const N = globalThis.window?.NYC;
  if (!N?.PKG || /[?&]amb2=0\b/.test(globalThis.location?.search || '')) return null;
  const out = M.gain(1, M.bus.amb), R = M.R, ctx = M.ctx;
  const ramp = (p, v, k = 0.6) => p.setTargetAtTime(v, M.now(), k);

  // ---- the hum: two bands, one each side (manhattan-free-roam's cityLeft / cityRight)
  const humG = M.gain(0, out), merge = ctx.createChannelMerger(2); merge.connect(humG);
  for (const [ch, f] of [[0, 118], [1, 154]]) { const s = M.src(M.pink, { rate: ch ? 1.07 : 0.93 }), b = M.filt('bandpass', f, 0.62); s.connect(b); b.connect(merge, 0, ch); s.start(0, R() * 3); }

  // ---- the far traffic: one going by (manhattan-free-roam's road band, 145 + 470 x rolling, as an event)
  function far(k) {
    const t = M.now() + 0.02, dur = 4 + R() * 3, p0 = (R() < 0.5 ? -1 : 1) * (0.6 + 0.3 * R());
    const s = M.src(M.pink, { rate: 0.8 + R() * 0.3 }), b = M.filt('bandpass', 380, 0.65), g = M.gain(0), pn = M.pan(p0, out);
    b.frequency.setValueAtTime(420 + R() * 120, t); b.frequency.exponentialRampToValueAtTime(190 + R() * 40, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(LEVEL.far * k, t + dur * 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // (across, as it goes)
    pn.pan.setValueAtTime(p0, t); pn.pan.linearRampToValueAtTime(-p0, t + dur);
    s.connect(b); b.connect(g); g.connect(pn); s.start(t, R() * 3); s.stop(t + dur + 0.1);
    s.onended = () => { try { g.disconnect(); pn.disconnect(); } catch {} };
  }

  // ---- the L: the tracks as segments [x0, z0, x1, z1], a grid of them for the nearest
  const tracks = [], CELL = 60, grid = new Map(), gkey = (i, j) => i * 100003 + j;
  function setTracks(lines) {
    tracks.length = 0; grid.clear();
    for (const e of lines || []) { const p = e.p || e; for (let i = 0; i + 3 < p.length; i += 2) tracks.push([p[i], p[i + 1], p[i + 2], p[i + 3]]); }
    tracks.forEach((s, n) => {
      const i0 = Math.floor(Math.min(s[0], s[2]) / CELL) - 1, i1 = Math.floor(Math.max(s[0], s[2]) / CELL) + 1, j0 = Math.floor(Math.min(s[1], s[3]) / CELL) - 1, j1 = Math.floor(Math.max(s[1], s[3]) / CELL) + 1;
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = gkey(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(n); }
    });
  }
  // (the compiled town's elevated tracks; else a story anchor named for them, a short stretch through it)
  const anchorTrack = () => { const P = N.PKG.places || {}; const a = P['under-l'] || P['@under-l']; if (!a) return null; const h = a.heading || 0, x = a.cx ?? a.x, z = a.cz ?? a.z, dx = Math.cos(h) * 150, dz = -Math.sin(h) * 150; return [{ p: [x - dx, z - dz, x + dx, z + dz] }]; };
  setTracks(N.GEO?.elevated || anchorTrack() || []);
  function nearTrack(x, z, r = 260) {
    if (!tracks.length) return null;
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), n = Math.ceil(r / CELL); let best = null;
    const seen = new Set();
    for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) for (const k of grid.get(gkey(i, j)) || []) {
      if (seen.has(k)) continue; seen.add(k);
      const [x0, z0, x1, z1] = tracks[k], dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / L2));
      const px = x0 + dx * u, pz = z0 + dz * u, d = Math.hypot(x - px, z - pz);
      if (d < r && (!best || d < best.d)) { const l = Math.sqrt(L2); best = { d, x: px, z: pz, ux: dx / l, uz: dz / l }; }
    }
    return best;
  }
  let train = null;
  function startTrain(nt) {
    T.train = 50 + R() * 70; // (the next one a while after this one)
    const dir = R() < 0.5 ? 1 : -1, v = 11 + R() * 4, span = 200, gy = (x, z) => { try { return (W.app?.controllerManager?.getGroundHeight?.(x, z, 'person') ?? 0) + 6.5; } catch { return 6.5; } };
    const ux = nt.ux * dir, uz = nt.uz * dir;
    train = { t: 0, dur: (2 * span) / v, v, x0: nt.x - ux * span, z0: nt.z - uz * span, ux, uz, y: gy(nt.x, nt.z), next: 0, n: 0, near: nt };
    const pos = [train.x0, train.y, train.z0];
    train.L = E.loop('rumble', { bus: 'amb', pos, ref: 14, vol: 0, verb: 0.6 });
    train.Q = E.loop('squeal', { bus: 'amb', pos, ref: 14, vol: 0, verb: 0.6 });
    // (the structure over the street booming under it: where the listener is, not where the train is)
    const s = M.src(M.brown, { rate: 0.7 }), b = M.filt('bandpass', 62, 1.4), g = M.gain(0, out);
    s.connect(b); b.connect(g); s.start(0, R() * 3); train.boom = { s, g };
  }
  function trainStep(dt, kNear) {
    const T = train; T.t += dt;
    const k = T.t / T.dur, s = T.v * T.t, x = T.x0 + T.ux * s, z = T.z0 + T.uz * s, pos = [x, T.y, z];
    const env = Math.min(1, T.t / 2.5, (T.dur - T.t) / 2.5);
    const d = Math.hypot(x - M.listener.x, z - M.listener.z), close = 1 / (1 + (d / 45) ** 2);
    T.L.set({ pos, vol: LEVEL.train * env * kNear });
    T.Q.set({ pos, vol: 0.012 * env * kNear * close * (0.4 + 0.6 * Math.abs(Math.sin(T.t * 0.9))) });
    ramp(T.boom.g.gain, LEVEL.boom * env * kNear * close, 0.15);
    // (the wheels over the rail joints: two trucks a car, da-dum, da-dum, quicker the faster it goes)
    T.next -= dt;
    if (T.next <= 0 && env > 0.1) { T.n++; const gap = T.n % 2 ? 0.16 : 0.62 + R() * 0.08; T.next = gap * 13 / T.v; E.play('kerb', { bus: 'amb', pos, ref: 10, k: 0.25 + 0.2 * close, vol: kNear * env * 0.9 }); }
    if (k >= 1) { T.L.stop(0.6); T.Q.stop(0.4); ramp(T.boom.g.gain, 0, 0.3); const b = T.boom; try { b.s.stop(M.now() + 2); b.s.onended = () => { try { b.g.disconnect(); } catch {} }; } catch {} train = null; }
  }

  // ---- the water: a slow wash, and laps against the edge
  const washG = M.gain(0, out);
  { const s = M.src(M.brown, { rate: 1.3 }), lp = M.filt('lowpass', 420, 0.6), sw = M.gain(0.75, washG);
    s.connect(lp); lp.connect(sw); s.start(0, R() * 3);
    // (the swell: two slow, unrelated waves on its level, never a beat)
    for (const [f, a] of [[0.11, 0.18], [0.173, 0.12]]) { const o = M.osc('sine', f), d = M.gain(a); o.connect(d); d.connect(sw.gain); o.start(); } }
  function lap(k) {
    const t = M.now() + 0.01, pn = M.pan(R() * 1.4 - 0.7, out), lp = M.filt('lowpass', 2400, 0.5, pn);
    M.burst(lp, { t, dur: 0.12 + R() * 0.22, type: 'bandpass', f0: 700 + R() * 500, f1: 300 + R() * 150, q: 1.4, peak: LEVEL.lap * k * (0.5 + R() * 0.5), a: 0.02 + R() * 0.03, buf: M.pink });
    if (R() < 0.35) M.burst(lp, { t: t + 0.09 + R() * 0.1, dur: 0.25, type: 'lowpass', f0: 900, f1: 260, q: 0.7, peak: LEVEL.lap * k * 0.6, a: 0.03, buf: M.pink });
    // (let go once it has sounded: its own source ends itself, the pan and the filter with nothing in them)
    const o = M.osc('sine', 1); o.start(t); o.stop(t + 0.8); o.onended = () => { try { lp.disconnect(); pn.disconnect(); } catch {} };
  }

  // ---- the night's lit places: people inside
  const lit = [], LCELL = 80, lgrid = new Map();
  for (const [key, p] of Object.entries(N.PKG.places || {})) {
    if (!LIT.test(p.kind || '') && !LIT.test(key)) continue;
    const x = p.cx ?? p.x, z = p.cz ?? p.z; if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const k = gkey(Math.floor(x / LCELL), Math.floor(z / LCELL)); if (!lgrid.has(k)) lgrid.set(k, []); lgrid.get(k).push(lit.length); lit.push({ x, z });
  }
  function nearLit(x, z, r = 70) {
    const ci = Math.floor(x / LCELL), cj = Math.floor(z / LCELL); let best = null, n = 0;
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (const k of lgrid.get(gkey(i, j)) || []) {
      const p = lit[k], d = Math.hypot(p.x - x, p.z - z); if (d > r) continue; n++;
      if (!best || d < best.d) best = { d, x: p.x, z: p.z };
    }
    return best ? { ...best, n } : null;
  }
  let murmur = null;
  function murmurOn() {
    if (murmur || !M.babble) return murmur;
    const sp = M.spot(out, [0, 1.5, 0], { ref: 8, verb: 0.5 }), s = M.src(M.babble, { rate: 0.94 }), hp = M.filt('highpass', 220, 0.6), lp = M.filt('lowpass', 1150, 0.6), g = M.gain(0);
    s.connect(hp); hp.connect(lp); lp.connect(g); g.connect(sp.in); s.start(0, R() * Math.max(0.1, M.babble.duration - 1));
    return (murmur = { sp, g, at: null });
  }

  // ---- where we are (4 times a second): the town at the player (the camera is in a call's room in a scene)
  const where = { city: 1, night: 0, rail: 0, water: 0, shore: 0, lit: 0, talk: 0, indoors: 0 };
  const ease = { ...where };
  let placeT = 0, track = null, litAt = null, pinned = null;
  const night = () => { try { const g = W.world?.look?.cityUniforms?.uInteriorGlow?.value; return Number.isFinite(g) ? sstep(0.6, 1.4, g) : 0; } catch { return 0; } };
  // (water: the world's own test, the town's terrain under its water level, the ground mask's water edge (class 5), the
  // compiled water rings; each on its own, so one that throws does not hide the others)
  const rings = (N.GEO?.water || []).map((w) => w.ring || w.p || w).filter((r) => Array.isArray(r) && r.length >= 6);
  const inRing = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
  const wet = (x, z) => {
    try { if (world.inWater?.(x, z)) return true; } catch {}
    try { const T = N.Terrain; if (T && T.loaded && Number.isFinite(T.waterLevel) && T.heightAt(x, z) <= T.waterLevel + 0.05) return true; } catch {}
    try { if (maskClass(x, z) === 5) return true; } catch {}
    for (const r of rings) if (inRing(r, x, z)) return true;
    return false;
  };
  function place() {
    const cm = W.app?.controllerManager, ent = cm?.activeMode === 'car' ? W.car : W.person, p = ent?.position || M.listener;
    const x = p.x, z = p.z;
    where.night = night();
    let pk = 0; try { for (const [ox, oz] of [[0, 0], [30, 0], [-30, 0], [0, 30], [0, -30]]) pk += world.isPark?.(x + ox, z + oz) ? 1 : 0; } catch {}
    where.city = 1 - 0.75 * (pk / 5);
    track = nearTrack(x, z); where.rail = track ? 1 / (1 + (track.d / 70) ** 2) : 0;
    // (the water near: laps within 40 m; the lake's wash carries further, 140 m, a shore road's worth)
    let w = 0, wn = 0; for (const r of [12, 30, 50, 90, 140]) for (let a = 0; a < 8; a++) { const ang = (a / 8) * Math.PI * 2 + r; if (wet(x + Math.sin(ang) * r, z + Math.cos(ang) * r)) { w += 40 / (r + 20); if (r <= 40) wn++; } }
    where.water = Math.min(1, w / 9); where.shore = Math.min(1, wn / 6);
    litAt = where.night > 0.2 ? nearLit(x, z) : null; where.lit = litAt ? Math.min(1, (1 / (1 + litAt.d / 25)) * (0.7 + 0.1 * Math.min(3, litAt.n))) : 0;
    where.talk = document.querySelector('#wg .wg-sub:not(.hide)')?.textContent ? 1 : 0;
    where.indoors = document.body.classList.contains('wg-vcall') ? 1 : 0;
  }
  const T = { far: 2 + R() * 4, lap: 0.5, glass: 4, train: 10 + R() * 12 };

  function update(dt) {
    placeT -= dt; if (placeT <= 0) { placeT = 0.25; if (pinned) { Object.assign(where, pinned); track = nearTrack(M.listener.x, M.listener.z); litAt = pinned.litAt || null; } else place(); }
    for (const k in where) ease[k] += (where[k] - ease[k]) * Math.min(1, dt / (k === 'talk' ? 0.2 : 1.2));
    const { city, night: nt, rail, water, shore, lit: lt, talk, indoors } = ease;
    const all = (1 - (1 - TALK) * talk) * (1 - (1 - INDOORS) * indoors);
    ramp(out.gain, all, 0.15);
    // (manhattan-free-roam: the hum 28% down at night)
    ramp(humG.gain, LEVEL.hum * city * (1 - 0.28 * nt));
    ramp(washG.gain, LEVEL.water * water * water);
    for (const k in T) T[k] -= dt;
    // (its distant traffic: every 11-26 s there, plus 9 at night; a busier street's here, a park's none)
    if (T.far <= 0) { T.far = (4 + R() * 8) * (1 + nt); if (city > 0.5) far(city * (1 - 0.24 * nt)); }
    if (T.lap <= 0) { T.lap = 0.25 + R() * 0.9; if (shore > 0.15) lap(shore); }
    // the L
    if (train) trainStep(dt, Math.max(0.15, rail));
    else if (T.train <= 0) { T.train = 50 + R() * 70; if (track && where.rail > 0.08) startTrain(track); }
    else if (rail < 0.05 && T.train < 8) T.train = 8 + R() * 10; // (far from the tracks: the next one soon after you come near)
    // the night's murmur, from the nearest lit place's way
    const mm = lt > 0.02 ? murmurOn() : murmur;
    if (mm) {
      if (litAt) mm.sp.set([litAt.x, (M.listener.y || 1.6) - 0.5, litAt.z]); else mm.sp.set(null);
      ramp(mm.g.gain, LEVEL.murmur * lt * nt, 0.8);
      if (T.glass <= 0) { T.glass = 3 + R() * 7; if (lt * nt > 0.25) M.modes(mm.sp.in, { t: M.now() + 0.01, base: 2600 + R() * 900, ratios: [1, 2.32, 4.25], decays: [0.22, 0.12, 0.07], peak: LEVEL.glass }); }
    }
  }
  return {
    update, where, setTracks,
    // (for tests and scenes: 'train' (one now, if any track is near), 'far', 'lap', 'glass')
    force(name) { if (name in T) T[name] = 0; if (name === 'train' && !train && track) startTrain(track); },
    // (a test's or a sound sheet's place, held: { city, night, rail, water, lit, talk, indoors, litAt: { x, z } }; null: the town again)
    pin(o) { pinned = o ? { ...o } : null; placeT = 0; },
    debug: () => ({ where: { ...where }, tracks: tracks.length, lit: lit.length, train: train ? { t: +train.t.toFixed(1), dur: +train.dur.toFixed(1) } : null, murmur: !!murmur }),
  };
}
