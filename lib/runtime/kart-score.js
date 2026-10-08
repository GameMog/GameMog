/* The kart race's score (Meme Kart, the owner 8 Oct 2026): one number per race, 0 to 10,000, where 10,000 is the
 * perfect race that no run reaches. One source for every place that needs it: the kart runtime carries it (a kart
 * world only, lib/custom-game.ts puts it in front of the runtime, so the results screen can show it), and the scores
 * route and the game page load this same file on the server and in the page (lib/kart-score.ts). ES5, no I/O.
 *
 *   x      = max(0, T / T*(racer) - 1)                       how far over your racer's perfect time
 *   tau    = 1 / (1 + (x / 0.5)^3.4)                         time: 1 at T*, 1/2 at 1.5 T*
 *   pi     = (N - P)(N - P + 1) / (N (N - 1))                place: 1, .75, .54, .36, .21, .11, .04, 0 (8 karts)
 *   gamma  = 1 - 2^(-min(G, gmCap) / (gmCap / 4.5))          GM: the gap halves every gmCap / 4.5 GM
 *   eta    = 1 - 2^(-min(H, hitsCap) / (hitsCap / 8.5))      enemies hit: the gap halves every hitsCap / 8.5 hits
 *   f      = estimated ? progress (0 to 1; 0.5 if unknown) : 1   a race called before you finished counts its share
 *   Time 8000 tau f + Finish 1000 pi f + GM 500 gamma f + Hits 500 eta f, each floored: 80 / 10 / 5 / 5
 *   (a world with no GM gives its 500 to the time: 8500)
 * The ceiling, any input at all (time 0, every item, any GM and hits): 8000 + 1000 + 477 + 498 = 9,975 (9,998 with no
 * GM), so 10,000 is never reached. The constants C are the world's meta.kartScore (docs/RULES.md "Kart score"):
 * { version, source, tStar: { racer: s }, tFloor: { racer: s }, karts, laps, gmCap, gmMax, hitsCap, hitsMax }. */
var KartScore = (function () {
  'use strict';
  var V = 1, MAX = 10000;
  var W = { time: 8000, finish: 1000, gm: 500, hits: 500 };
  var P_EXP = 3.4, X_HALF = 0.5, G_STEPS = 4.5, H_STEPS = 8.5;
  // the tiers, highest first (scripts/kart-score/calibrate.mjs sets the cut-offs; color is the chip, bar the bar's
  // fill on white; every chip's ink is #0B0B0F)
  var TIERS = [
    { id: 'mog', name: 'MOG', min: 9450, color: '#FF3EA5', bar: '#E0288C' },
    { id: 'moon', name: 'Moonshot', min: 9150, color: '#FFC93C', bar: '#E5A91A' },
    { id: 'diamond', name: 'Diamond Hands', min: 8750, color: '#7FE7FF', bar: '#2FB8D6' },
    { id: 'candle', name: 'Green Candle', min: 7700, color: '#5CFFC0', bar: '#19C98A' },
    { id: 'hodl', name: 'HODL', min: 6350, color: '#FFF4C8', bar: '#D9C27A' },
    { id: 'paper', name: 'Paper Hands', min: 4450, color: '#C9CDD3', bar: '#9AA0AA' },
    { id: 'rekt', name: 'Rekt', min: 0, color: '#FF6B6B', bar: '#E04848' }
  ];
  function num(v, d) { if (v === null || v === undefined || v === '') return d; v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  // a racer's own number from a per-racer table ({ pepe: 105.4, ... }) or one number for all; a racer the table does
  // not know gets the table's lowest (the strictest)
  function ofRacer(t, racer) {
    if (typeof t === 'number') return t;
    if (!t || typeof t !== 'object') return NaN;
    if (racer && typeof t[racer] === 'number') return t[racer];
    var m = Infinity, k;
    for (k in t) if (Object.prototype.hasOwnProperty.call(t, k) && typeof t[k] === 'number' && t[k] < m) m = t[k];
    return m < Infinity ? m : NaN;
  }
  function tStar(C, racer) { return ofRacer(C && C.tStar, racer); }
  function tFloor(C, racer) { return ofRacer(C && C.tFloor, racer); }
  function tier(s) { for (var i = 0; i < TIERS.length; i++) if (s >= TIERS[i].min) return TIERS[i]; return TIERS[TIERS.length - 1]; }
  // run: { timeMs, place, karts, gm, hits, estimated, progress, racer }; C: the world's meta.kartScore
  function score(run, C) {
    run = run || {}; C = C || {};
    var N = clamp(Math.round(num(run.karts, num(C.karts, 8))), 2, 64);
    // (a GM cap under 1 is no GM: a cap that small would divide by nothing)
    var gmCap = num(C.gmCap, 0) >= 1 ? num(C.gmCap, 0) : 0, hitsCap = Math.max(1, num(C.hitsCap, 30));
    var Ts = tStar(C, run.racer), T = Math.max(0, num(run.timeMs, Infinity) / 1000);
    // (no perfect time known, or no time: no time points)
    var x = Ts > 0 ? Math.max(0, T / Ts - 1) : Infinity, tau = 1 / (1 + Math.pow(x / X_HALF, P_EXP));
    var P = clamp(Math.round(num(run.place, N)), 1, N), pi = ((N - P) * (N - P + 1)) / (N * (N - 1));
    var G = clamp(num(run.gm, 0), 0, gmCap), H = clamp(num(run.hits, 0), 0, hitsCap);
    var gam = gmCap > 0 ? 1 - Math.pow(2, -G / (gmCap / G_STEPS)) : 0, eta = 1 - Math.pow(2, -H / (hitsCap / H_STEPS));
    var f = run.estimated ? clamp(num(run.progress, 0.5), 0, 1) : 1;
    var p = {
      time: Math.floor((W.time + (gmCap > 0 ? 0 : W.gm)) * tau * f),
      finish: Math.floor(W.finish * pi * f),
      gm: Math.floor(W.gm * gam * f),
      hits: Math.floor(W.hits * eta * f)
    };
    p.total = p.time + p.finish + p.gm + p.hits;
    p.tier = tier(p.total);
    p.v = V; p.tStar = Ts; p.x = x;
    return p;
  }
  // the highest score a racer can get in this world: T <= T*, 1st, every GM and hit the caps count (always < 10,000)
  function ceiling(C, racer) { return score({ timeMs: 0, place: 1, gm: C.gmCap, hits: C.hitsCap, racer: racer }, C).total; }
  // the slowest time (ms) this run could have and still score s, the rest the same (the "next tier" hint); null if none
  function timeFor(s, run, C) {
    var Ts = tStar(C, run && run.racer), lo = 0, hi = Ts * 6000, r = {}, k;
    if (!(Ts > 0)) return null;
    for (k in run) if (Object.prototype.hasOwnProperty.call(run, k)) r[k] = run[k];
    r.timeMs = lo; if (score(r, C).total < s) return null;
    for (var i = 0; i < 60; i++) { r.timeMs = (lo + hi) / 2; if (score(r, C).total >= s) lo = r.timeMs; else hi = r.timeMs; }
    return Math.floor(lo);
  }
  return { V: V, MAX: MAX, W: W, TIERS: TIERS, score: score, parts: score, tier: tier, tStar: tStar, tFloor: tFloor, ceiling: ceiling, timeFor: timeFor };
})();
// (the scores route and the game page import this file for its effect: this line hands them the same object)
if (typeof globalThis !== 'undefined') globalThis.KartScore = KartScore;
