// (promoted from scripts/.scratch/kart/score/sim.mjs, 8 Oct 2026, for the kart score's constants: measure.mjs)
// Meme Kart's race sim (kartSim) loaded headless in node, straight from the runtime's own source, so every number
// here is recomputed from whatever lib/runtime/kart.js and the world say today. Read-only on lib/ and worlds/.
//
//   import { load } from './sim.mjs';
//   const W = load({ world: 'worlds/meme-kart.js' });   // W.TR, W.def, W.rules, W.racers, W.make(opts)
//   const S = W.make({ seed, pick: 'pepe', items: true, solo: false });  S.start(0); S.step() ...
//
// The track table (TR) is built as v1.js builds it (three's CatmullRomCurve3 through track.points, 2400 samples,
// the frame's tangent from the samples 4 on and 3 back), and the course as kartWorld() reads it (its code extracted
// and run as is). The roster's racer stats come from kart-roster.js (the world's ROSTER only where it has none).
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rd = (p) => readFileSync(resolve(ROOT, p), 'utf8');

function slice(src, startMark, endMark, inclusiveEnd) {
  const a = src.indexOf(startMark);
  if (a < 0) throw new Error('marker not found: ' + startMark);
  const b = src.indexOf(endMark, a + startMark.length);
  if (b < 0) throw new Error('marker not found: ' + endMark);
  return src.slice(a, inclusiveEnd ? b + endMark.length : b);
}

// the race's state, forked and put back: every field of S that changes (the karts, the items, the hazards, the coins,
// the clocks) and the generator's state; S's functions and its fixed tables (the line, the course) are shared
const LIVE = ['t', 'time', 'count', 'count0', 'phase', 'acc', 'steps', 'finishers', 'goAt', 'logN', 'marks', 'coins', 'pair', 'crates', 'traps', 'shots', 'whale', 'whaleAt', 'fuds', 'spill', 'uid', 'haz', 'karts', 'events', 'weights'];
export function snapshot(S) { const o = {}; for (const f of LIVE) o[f] = S[f]; return { d: structuredClone(o), r: S.rng.get() }; }
export function restore(S, snap) { const o = structuredClone(snap.d); for (const f of LIVE) S[f] = o[f]; S.rng.set(snap.r); S.places(); }
export function load(o = {}) {
  const kart = rd(o.kart || 'lib/runtime/kart.js'), v1 = rd('lib/runtime/v1.js'), roster = rd('lib/runtime/kart-roster.js');
  // the maths helpers v1.js gives the kart kit
  const helpers = ['function clamp(', 'function mulberry(', 'function hashStr(', 'function isHex(', 'function num('].map((m) => {
    const a = v1.indexOf(m); if (a < 0) throw new Error('v1 helper missing ' + m);
    // (to the end of the function: the next line that starts a sibling function or a comment at the same indent)
    let depth = 0, i = v1.indexOf('{', a);
    for (; i < v1.length; i++) { if (v1[i] === '{') depth++; else if (v1[i] === '}') { depth--; if (!depth) break; } }
    return v1.slice(a, i + 1);
  }).join('\n')
    // (the race's generator, made snapshot-able: the same arithmetic, its state readable and settable, so a planner can
    // fork the race and put it back exactly; the runtime's own text must be what this expects)
    .replace('    return function () {\n      s = (s + 0x6d2b79f5) >>> 0;\n      var t = Math.imul(s ^ (s >>> 15), 1 | s);\n      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;\n      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;\n    };',
      '    var f = function () {\n      s = (s + 0x6d2b79f5) >>> 0;\n      var t = Math.imul(s ^ (s >>> 15), 1 | s);\n      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;\n      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;\n    };\n    f.get = function () { return s; }; f.set = function (v) { s = v >>> 0; };\n    return f;');
  if (!helpers.includes('f.get = function')) throw new Error('mulberry in v1.js is not the one sim.mjs knows: snapshots would be wrong');
  let simSrc = slice(kart, '    var KART_D2R = Math.PI / 180;', '    /* --------------------------------------------------- a greybox kart -- */');
  // two hooks, no-ops unless set (S.filter: your kart's controls after the step's driving is decided, a person-model's
  // or the oracle's; S.aim: the autopilot's target across the road, once its crate choice is made), then any of the
  // caller's own patches ([text, replacement], each must be found)
  const HOOKS = (o.hooks === false ? [] : [
    ['if ((!q.human || q.auto || q.assist) && !(q.moon > 0)) aiStep(q, dt);', 'if ((!q.human || q.auto || q.assist) && !(q.moon > 0)) aiStep(q, dt); if (S.filter && i === S.human) S.filter(q, dt);'],
    ['if (A.crateGo) o = cb.x; }', 'if (A.crateGo) o = cb.x; }\n        if (S.aim && k.human) o = S.aim(k, o, j, la);'],
  ]).concat(o.patch || []);
  for (const [a, b] of HOOKS) { if (!simSrc.includes(a)) throw new Error('patch target not found: ' + a.slice(0, 80)); simSrc = simSrc.split(a).join(b); }
  const courseSrc = slice(kart, '      TR.course = (function (c) {', '      })(KC);', true);
  // the world: its GameMog.world({...}) definition caught
  let def = null;
  const worldSrc = o.code != null ? o.code : rd(o.world || 'worlds/meme-kart.js');
  new Function('GameMog', 'window', worldSrc)({ world: (d) => { def = d; } }, { devicePixelRatio: 1 });
  if (!def) throw new Error('world did not call GameMog.world');
  const KD = def.kart || {};
  // (the laps as kartWorld() reads them, num(KD.laps, 3, 1, 5), so a world that writes laps: 0 or '3' races the laps
  // here it races in the browser: the track's signature counts them, and node and the browser must give the same one)
  const lapsN = KD.laps == null || KD.laps === '' ? 3 : Number(KD.laps);
  const laps = Math.round(isFinite(lapsN) ? Math.max(1, Math.min(5, lapsN)) : 3), cls = KD.class === 'chill' || KD.class === 'degen' ? KD.class : 'normal';

  // ---- the track, as v1.js builds it (kart limits: lap 800 to 1800 m, half width 7 to 14) ----
  const R = { lapMin: 800, lapMax: 1800, halfWidthMin: 7, halfWidthMax: 14 };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const raw = def.track.points;
  // (the points v1.js keeps: arrays of two or more finite numbers)
  let pts = raw.filter((p) => Array.isArray(p) && p.length >= 2 && p.every((v) => typeof v === 'number' && isFinite(v))).map((p) => (p.length === 2 ? new THREE.Vector3(p[0], 0, p[1]) : new THREE.Vector3(p[0], p[1], p[2])));
  if (pts.length > 80) pts = pts.slice(0, 80);
  const hw = clamp((Number(def.track.width) || 12) / 2, R.halfWidthMin, R.halfWidthMax);
  let curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
  const rawLen = curve.getLength();
  if (rawLen < R.lapMin || rawLen > R.lapMax) {
    const target = clamp(rawLen, R.lapMin, R.lapMax), k = target / rawLen, c = new THREE.Vector3();
    pts.forEach((p) => c.add(p)); c.divideScalar(pts.length);
    pts.forEach((p) => { p.x = c.x + (p.x - c.x) * k; p.z = c.z + (p.z - c.z) * k; });
    curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
  }
  const NS = 2400, P = [], CUM = new Float64Array(NS + 1);
  for (let i = 0; i <= NS; i++) P.push(curve.getPoint(i / NS));
  for (let i = 1; i <= NS; i++) CUM[i] = CUM[i - 1] + P[i].distanceTo(P[i - 1]);
  const L = CUM[NS];
  const wrapD = (d) => { d = d % L; return d < 0 ? d + L : d; };
  function frameAt(d) {
    const x = wrapD(d); let lo = 0, hi = NS;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (CUM[m] <= x) lo = m; else hi = m; }
    const seg = CUM[lo + 1] - CUM[lo], f = seg > 1e-6 ? (x - CUM[lo]) / seg : 0;
    const pos = P[lo].clone().lerp(P[lo + 1], f), tan = new THREE.Vector3().subVectors(P[(lo + 4) % NS], P[(lo + NS - 3) % NS]).normalize();
    return { pos, tan };
  }
  const KC = KD.course && typeof KD.course === 'object' ? KD.course : {};
  const num = (v, d, a, b) => { if (v == null || v === '') return d; v = Number(v); return isFinite(v) ? clamp(v, a, b) : d; };
  const shoulder = num(KC.shoulder, 4, 1.5, 12);
  const TN = Math.max(200, Math.ceil(L)), TR = { n: TN, ds: L / TN, L, hw, wall: hw + shoulder, course: null,
    px: new Float64Array(TN), py: new Float64Array(TN), pz: new Float64Array(TN), tx: new Float64Array(TN), tz: new Float64Array(TN), rx: new Float64Array(TN), rz: new Float64Array(TN) };
  for (let i = 0; i < TN; i++) {
    const F = frameAt(i * TR.ds);
    TR.px[i] = F.pos.x; TR.py[i] = F.pos.y; TR.pz[i] = F.pos.z;
    const tl = Math.hypot(F.tan.x, F.tan.z) || 1;
    TR.tx[i] = F.tan.x / tl; TR.tz[i] = F.tan.z / tl; TR.rx[i] = -TR.tz[i]; TR.rz[i] = TR.tx[i];
  }
  // ---- the kit: the rules and the sim, and the course reader, from kart.js itself ----
  const warns = [];
  const kit = new Function('TR', 'KC', 'L', 'hw', 'TN', 'wrapD', 'shoulder', 'cls', 'warn',
    helpers + '\n' + simSrc + '\n' + courseSrc + '\nreturn { kartSim: kartSim, kartRules: kartRules, hashStr: hashStr, mulberry: mulberry };')(TR, KC, L, hw, TN, wrapD, shoulder, cls, (m) => warns.push(m));
  const rules = kit.kartRules(cls);

  // ---- the racers: the roster's stats (kart-roster.js RACERS), by id, in the world's cast order ----
  const ids = ['pepe', 'doge', 'shiba', 'bike', 'bull', 'bear', 'whale', 'mooncat'];
  const rosterStats = {};
  for (const id of ids) {
    const m = roster.match(new RegExp('\\n\\s*' + id + ": \\{ name: '([^']+)'[^\\n]*?stats: (ALL|\\{[^}]*\\})"));
    if (m) rosterStats[id] = { name: m[1], stats: m[2] === 'ALL' ? {} : new Function('return ' + m[2])() };
  }
  const statsOf = (s) => ({ top: num(s.top, 1, 0.95, 1.05), accel: num(s.accel, 1, 0.85, 1.2), handling: num(s.handling, 1, 0.9, 1.1), mass: num(s.mass, 1, 0.8, 1.4), drift: num(s.drift, 1, 0.9, 1.15) });
  const PERSONA_OF = { bull: 'ram', bear: 'block', whale: 'bully', doge: 'items', shiba: 'draft', bike: 'punch', mooncat: 'risky' };
  const cast = ids.map((id) => ({ id, name: rosterStats[id] ? rosterStats[id].name : id, stats: statsOf(rosterStats[id] ? rosterStats[id].stats : {}), persona: KD.rage === false ? 'clean' : PERSONA_OF[id] || '' }));
  const GRID = [5, 0, 1, 2, 3, 4, 6, 7];
  const ITEMS_ON = KD.items !== false && TR.course.drops.length !== 0;
  const title = (def.meta && def.meta.title) || 'To The Moon';

  // a race: the picked racer is kart 0 (yours), the rest in cast order (as assign() orders them)
  function make(m = {}) {
    const p = typeof m.pick === 'number' ? m.pick : Math.max(0, ids.indexOf(m.pick || 'pepe'));
    const order = [p].concat(ids.map((_, n) => n).filter((n) => n !== p));
    const C = order.map((n) => cast[n]);
    const S = kit.kartSim(TR, { laps: m.laps || laps, cls, seed: (m.seed == null ? 1 : m.seed) >>> 0, stats: C.map((c) => c.stats), human: m.human == null ? 0 : m.human, grid: GRID,
      items: m.items == null ? ITEMS_ON : m.items && ITEMS_ON, weights: null, eager: C.map((c) => (c.id === 'doge' ? 2.2 : 1)), persona: C.map((c) => c.persona) });
    if (m.solo) S.karts.forEach((k, n) => { if (n) k.parked = true; });
    S.cast = C;
    return S;
  }
  return { TR, def, KD, laps, cls, rules, cast, make, warns, L, hw, kit, ROOT, code: o.code != null ? o.code : null };
}
