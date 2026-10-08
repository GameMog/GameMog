// The minimum-time line through a kart track under a relaxed model of the sim (see bound.mjs for the relaxations),
// as a dynamic programme over (station, offset) with second-order state (the turning read from three points).
// Shared by bound.mjs (the lower bound T*) and oracle.mjs (its reference line, with the oracle's real constraints on).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function makeDP(W, worldPath = 'worlds/meme-kart.js') {
  const TR = W.TR, K = W.rules, L = TR.L, CO = TR.course;
  const wrap = (d) => ((d % L) + L) % L;
  const within = (d, d0, len) => wrap(d - d0) <= len;
  function at(d) {
    d = wrap(d); const f = d / TR.ds, i = Math.floor(f) % TR.n, j = (i + 1) % TR.n, u = f - Math.floor(f);
    const x = TR.px[i] + (TR.px[j] - TR.px[i]) * u, z = TR.pz[i] + (TR.pz[j] - TR.pz[i]) * u;
    let rx = TR.rx[i] + (TR.rx[j] - TR.rx[i]) * u, rz = TR.rz[i] + (TR.rz[j] - TR.rz[i]) * u; const rl = Math.hypot(rx, rz); rx /= rl; rz /= rl;
    return [x, z, rx, rz];
  }
  function railLat(R0, d) {
    const u = wrap(d - R0.d0); if (u > R0.len) return NaN; const P = R0.pts;
    for (let q = 1; q < P.length; q++) if (u <= P[q][0]) { const f = (u - P[q - 1][0]) / Math.max(1e-6, P[q][0] - P[q - 1][0]); return P[q - 1][1] + (P[q][1] - P[q - 1][1]) * f; }
    return P[P.length - 1][1];
  }
  function surf(d, y) {
    let m = Math.abs(y) > TR.hw ? K.surf[CO.verge] || K.surf.grass : 1;
    for (const P of CO.off) if (y >= P.x0 && y <= P.x1 && within(d, P.d0, P.len) && P.mul < m) m = P.mul;
    return m;
  }
  // the world's sections (its SEG walk, replicated): where each piece starts along the lap
  let SECT = null;
  try {
    const src = W.code != null ? W.code : readFileSync(resolve(W.ROOT, worldPath), 'utf8'), m = src.match(/var SEG = (\[[\s\S]*?\n  \]);/);
    if (m) {
      const SEG = new Function('return ' + m[1].replace(/\/\/[^\n]*/g, ''))();
      let n = 0; const st = [];
      for (const s of SEG) { const len = s[1] === 's' ? s[2] : s[2] * Math.abs(s[3]) * Math.PI / 180; st.push([s[0], n]); n += Math.max(1, Math.round(len)); }
      SECT = st.map(([name, c]) => ({ name, d: (c / n) * L }));
    }
  } catch { SECT = null; }
  const sectOf = (d) => { if (!SECT) return 'lap'; d = wrap(d); let s = SECT[0].name; for (const q of SECT) if (d >= q.d) s = q.name; return s; };

  // the most any mode turns at v (rad/s): normal full lock, a hop's (1.3x, capped), a drift's dW x dSpan
  function omegaMax(v, st, top, noDrift) {
    const Q = K.hd, wM = Math.min(Q.wPeak, v / (Q.R0 + Q.Rc * v * v)) * st.handling;
    const hop = Math.min(wM * K.hopTurn, Math.max(Q.hopW, wM));
    const drift = noDrift ? 0 : Q.dW * st.handling * Q.dSpan * Math.min(1, v / (K.driftMin * top));
    return Math.max(wM, hop, drift);
  }
  function vKappaTable(st, top, vMax, margin, noDrift, air) {
    const Rs = [], Vs = [];
    for (let lr = Math.log(0.5); lr <= Math.log(5000); lr += 0.01) {
      const R = Math.exp(lr); let best = 0;
      for (let v = 0.25; v <= vMax + 1; v += 0.25) { const w = air ? 0.5 * Math.min(K.hd.wPeak, v / (K.hd.R0 + K.hd.Rc * v * v)) * st.handling : omegaMax(v, st, top, noDrift); if (v <= margin * w * R) best = v; }
      Rs.push(R); Vs.push(best);
    }
    return (R) => { if (!(R < 5000)) return Infinity; const f = (Math.log(Math.max(0.5, R)) - Math.log(0.5)) / 0.01, i = Math.min(Rs.length - 2, Math.floor(f)); return Vs[i] + (Vs[i + 1] - Vs[i]) * (f - i); };
  }
  // the boost multiplier's ceiling along the lap: 'pad' mode (any boost fired while another runs only stretches it, so
  // a pad's +28% can be kept going by every boost after it: 1.28 everywhere once the first pad is reached), or 'tier'
  // mode (+20% everywhere, +28% on each pad's second and the decay after it: what a driver who can never chain a
  // pad's boost would have)
  function boostEnvelope(top, mode, draft) {
    const pk = 1 + K.gm.per * K.gm.max, base = mode === 'pad' ? 1 + K.pad.cap : 1 + K.tierCap, mult = new Float64Array(Math.ceil(L) + 1).fill(base);
    if (mode !== 'pad') for (const P of CO.pads) {
      let bm = 1 + K.pad.cap, v = top * pk * bm, x = 0; const dt = K.step;
      for (let t = 0; t < K.pad.T; t += dt) { x += v * dt; const i = Math.round(wrap(P.d0 + x)); mult[i] = Math.max(mult[i], bm); }
      for (let n = 0; n < 2000; n++) {
        const slow = bm + (1 - bm) * (1 - Math.exp(-K.boostOff * dt)), fast = bm + (1 + K.tierCap - bm) * (1 - Math.exp(-K.boostOn * dt));
        bm = Math.max(slow, fast); const cap = top * pk * bm;
        v = v > cap ? v + (cap - v) * (1 - Math.exp(-K.boostOff * dt)) : cap; x += v * dt;
        const i = Math.round(wrap(P.d0 + x)); mult[i] = Math.max(mult[i], v / (top * pk));
        if (v <= top * pk * (1 + K.tierCap) * 1.0001) break;
      }
    }
    // the standing start from the grid slot: the launch's +20% from GO (bm rising at boostOn), the first pad's +28% from
    // where it can first be reached, the speed toward the cap at boostOn; the pocket full (a relaxation)
    const g = -(5 + 2 * 6 + 3), firstPad = Math.min(...CO.pads.map((P) => wrap(P.d0) > L / 2 ? wrap(P.d0) - L : wrap(P.d0)).filter((d) => d > g));
    const start = []; { let bm = 1, v = 0, x = 0; const dt = K.step; for (let n = 0; n < 1200; n++) { const tgt = mode === 'pad' && g + x >= firstPad ? 1 + K.pad.cap : 1 + K.tierCap; bm += (tgt - bm) * (1 - Math.exp(-K.boostOn * dt)); const cap = Math.min(top * K.hard, top * pk * bm * draft); v += (cap - v) * (1 - Math.exp(-K.boostOn * dt)); x += v * dt; start.push([x, v]); } }
    const vStart = (x) => { for (const [xx, vv] of start) if (xx >= x) return vv; return Infinity; };
    return { mult, pk, vStart, start, base };
  }

  // opt: { ds, dy, margin, noTurn, items (a speed cap), boost: 'pad' | 'tier', draft (multiplier), noDrift,
  //        freeRails (no turning limit beside a rail: the bound), railsAreWalls (the oracle's line keeps off them),
  //        airTurn (the oracle: after each ramp's lip, only the air's turning), forbid: [{ d0, len, lo, hi }] (lap
  //        metres, every lap), force: [{ d, lo, hi }] (the line passes between lo and hi there, every lap),
  //        ymax (the furthest across, default the walls), laps }
  function solveLine(st, opt = {}) {
    const DS = opt.ds || 4, DY = opt.dy || 0.2, margin = opt.margin || 1.1, laps = opt.laps || W.laps, draft = opt.draft || 1;
    const top = K.top * Math.min(1.05, Math.max(0.95, st.top || 1)), env = boostEnvelope(top, opt.boost || 'pad', draft), pk = env.pk;
    const vK = opt.noTurn ? () => Infinity : vKappaTable(st, top, top * K.hard * 1.2, margin, opt.noDrift, false);
    const vKair = opt.airTurn ? vKappaTable(st, top, top * K.hard * 1.2, 1, true, true) : null;
    const g = [-(5 + 2 * 6 + 3), -1.6], d0 = g[0], dEnd = laps * L, N = Math.ceil((dEnd - d0) / DS), ds = (dEnd - d0) / N;
    const YMAX = opt.ymax || TR.wall - K.radius - 0.15, ys = [];
    for (let y = g[1]; y >= -YMAX - 1e-9; y -= DY) ys.unshift(+y.toFixed(4));
    for (let y = g[1] + DY; y <= YMAX + 1e-9; y += DY) ys.push(+y.toFixed(4));
    const M = ys.length, y0 = ys.indexOf(g[1]), J = Math.max(1, Math.round(Math.min(0.55 * ds, 3) / DY));
    const PX = new Float64Array((N + 1) * M), PZ = new Float64Array((N + 1) * M), CAP = new Float64Array((N + 1) * M), FREE = new Uint8Array((N + 1) * M), AIR = new Uint8Array(N + 1), DD = new Float64Array(N + 1);
    const airZones = opt.airTurn ? CO.ramps.map((R0) => ({ d0: wrap(R0.d0 + R0.len), len: (R0.big ? 1.15 : 0.8) * top * pk * env.base })) : [];
    for (let i = 0; i <= N; i++) {
      const d = d0 + i * ds, [x, z, rx, rz] = at(d), wd = Math.round(wrap(d)) % Math.ceil(L), Bm = env.mult[wd], vs = opt.items ? Infinity : env.vStart(d - d0 + 0.5); DD[i] = d;
      AIR[i] = airZones.some((A) => within(d, A.d0, A.len)) ? 1 : 0;
      for (let m = 0; m < M; m++) {
        const y = ys[m], q = i * M + m; PX[q] = x + rx * y; PZ[q] = z + rz * y;
        let cap = opt.items ? opt.items : Math.min(top * K.hard, top * pk * Bm * draft);
        const sm = surf(d, y); if (sm < 1 && !opt.items) cap = Math.min(cap, top * (1 - (1 - sm) / 2));
        CAP[q] = Math.max(0.5, Math.min(cap, vs));
        let free = opt.freeRails !== false && Math.abs(y) >= TR.wall - K.radius - 0.4, bad = false;
        for (const R0 of CO.rails) { const xr = railLat(R0, wrap(d)); if (xr === xr && Math.abs(y - xr) <= 0.8) { if (opt.freeRails !== false) free = true; if (opt.railsAreWalls) bad = true; } }
        for (const F of opt.forbid || []) if (within(d, F.d0, F.len) && y >= F.lo && y <= F.hi) bad = true;
        for (const F of opt.force || []) if (Math.abs(((wrap(d) - F.d + L / 2) % L + L) % L - L / 2) <= ds / 2 + 1e-9 && (y < F.lo || y > F.hi)) bad = true;
        if (bad) CAP[q] = 1e-3;
        FREE[q] = free ? 1 : 0;
      }
    }
    const W2 = 2 * J + 1, INF = 1e18, S = M * W2;
    const V = new Float64Array((N + 1) * S).fill(INF), B = new Int8Array((N + 1) * S);
    for (let dj = -J; dj <= J; dj++) { const m = y0 + dj; if (m < 0 || m >= M) continue; const len = Math.hypot(PX[M + m] - PX[y0], PZ[M + m] - PZ[y0]); V[S + m * W2 + (dj + J)] = 0.5 * len / CAP[y0]; }
    for (let i = 1; i < N; i++) {
      const o = i * S, on = (i + 1) * S, vk = AIR[i] && vKair ? vKair : vK;
      for (let m = 0; m < M; m++) for (let kk = 0; kk < W2; kk++) {
        const c = V[o + m * W2 + kk]; if (c >= INF) continue;
        const mp = m - (kk - J), a = (i - 1) * M + mp, b = i * M + m, bx = PX[b], bz = PZ[b], ux = bx - PX[a], uz = bz - PZ[a], l1 = Math.hypot(ux, uz);
        for (let dj = -J; dj <= J; dj++) {
          const mn = m + dj; if (mn < 0 || mn >= M) continue;
          const cq = (i + 1) * M + mn, vx = PX[cq] - bx, vz = PZ[cq] - bz, l2 = Math.hypot(vx, vz);
          let v = CAP[b];
          if (!FREE[b]) { const ang = Math.abs(Math.atan2(ux * vz - uz * vx, ux * vx + uz * vz)); if (ang > 1e-6) v = Math.min(v, vk((l1 + l2) / 2 / ang)); }
          const t = c + 0.5 * (l1 + l2) / Math.max(1e-3, v), slot = on + mn * W2 + (dj + J);
          if (t < V[slot]) { V[slot] = t; B[slot] = kk; }
        }
      }
    }
    let best = INF, bs = -1;
    for (let m = 0; m < M; m++) for (let kk = 0; kk < W2; kk++) { const c = V[N * S + m * W2 + kk]; if (c >= INF) continue; const mp = m - (kk - J), a = (N - 1) * M + mp, b = N * M + m, t = c + 0.5 * Math.hypot(PX[b] - PX[a], PZ[b] - PZ[a]) / CAP[b]; if (t < best) { best = t; bs = m * W2 + kk; } }
    const line = new Int32Array(N + 1); let m = Math.floor(bs / W2), kk = bs % W2;
    for (let i = N; i >= 1; i--) { line[i] = m; const mp = m - (kk - J), kprev = B[i * S + m * W2 + kk]; m = mp; kk = kprev; }
    line[0] = y0;
    const per = {}, lapT = new Array(laps + 1).fill(0), vprof = []; let Tt = 0, len = 0; const boundBy = { cap: 0, turn: 0 };
    for (let i = 0; i <= N; i++) {
      const b = i * M + line[i], a = i > 0 ? (i - 1) * M + line[i - 1] : -1, c = i < N ? (i + 1) * M + line[i + 1] : -1;
      const l1 = a >= 0 ? Math.hypot(PX[b] - PX[a], PZ[b] - PZ[a]) : 0, l2 = c >= 0 ? Math.hypot(PX[c] - PX[b], PZ[c] - PZ[b]) : 0;
      let v = CAP[b], R = Infinity, turn = false;
      if (a >= 0 && c >= 0) { const ux = PX[b] - PX[a], uz = PZ[b] - PZ[a], vx = PX[c] - PX[b], vz = PZ[c] - PZ[b], ang = Math.abs(Math.atan2(ux * vz - uz * vx, ux * vx + uz * vz)); if (ang > 1e-6) { R = (l1 + l2) / 2 / ang; if (!FREE[b]) { const vk = (AIR[i] && vKair ? vKair : vK)(R); if (vk < v) { v = vk; turn = true; } } } }
      const dt = 0.5 * (l1 + l2) / v; Tt += dt; len += l2; boundBy[turn ? 'turn' : 'cap'] += dt;
      const d = DD[i], lap = Math.max(0, Math.floor(d / L)), sec = sectOf(d); per[sec] = (per[sec] || 0) + dt; lapT[Math.min(laps, lap)] += dt;
      vprof.push([+d.toFixed(1), ys[line[i]], +v.toFixed(2), R < 1e5 ? +R.toFixed(1) : null, +(Tt - dt / 2).toFixed(4)]);
    }
    return { T: best, Tcheck: Tt, top, len, N, ds, d0, lapT: lapT.slice(0, laps), per, vprof, boundBy, cap: top * pk * env.base * draft, start: env.start, line: Array.from(line).map((q) => ys[q]), dd: Array.from(DD) };
  }
  return { solveLine, sectOf, SECT, at, railLat, surf, wrap, omegaMax };
}
