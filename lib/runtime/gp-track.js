    /* ====================================================== Grand Prix: the lap, built into a table (ARTIFICIAL1 M1) == */
    // Lane T. A Grand Prix world writes its lap as segments (straights, and arcs with clothoid eases, two of the straights
    // 'fit' so the loop closes), elevation ramps and crests, and width, bank and run-off zones. gpTrack(src, lim, warn)
    // turns that into one table, a sample every ~0.5 m of PLAN arc length from the start line, with the exact heading and
    // curvature of the segments (integrated, never a chord), the height, grade and vertical curvature, the bank, the road's
    // half width and the barrier lines, plus the lookups every other part reads (pose, posAt, project, surfaceAt, ...).
    // The lap is refused, never rescaled, outside lim (1,500 to 7,000 m: a sprint's street lap from 21 Oct, 3,000 before).
    // Pasted into boot() by gp.js at /*@include gp-track.js*/. ONE top-level binding: this function declaration, which
    // hoists, because v1 calls it in the track section, long before the include point runs; so everything it needs is
    // inside it. PURE: loaded by Node with vm.runInNewContext(src + ';gpTrack', {}); ECMAScript built-ins only, no clock,
    // no randomness, no other part's name. The static check (lib/custom-game.ts) runs this same code on a world's track.
    // Units: metres, radians inside (degrees only in the source); heading clockwise from north (-z), forward =
    // (sin h, 0, -cos h); + turns right; lat + is right of the centre line; bank + raises the right-hand edge.
    function gpTrack(src, lim, warn) {
      'use strict';
      // (the built-ins it calls in its loops, held here: in a vm realm, as Node and the static check load it, every
      // global read costs a lookup through the context; 35 ms a build against 4.6 measured, before this line)
      var sin = Math.sin, cos = Math.cos, sqrt = Math.sqrt, abs = Math.abs, floor = Math.floor, min = Math.min, max = Math.max, ceil = Math.ceil, round = Math.round;
      var PI = Math.PI, D2R = PI / 180, STEP = 0.5;
      // (segMax, zoneMax, radiusMax: the most pieces, the most zones in any one list and the largest radius a lap may write:
      // the work of building it is bounded before it starts, fix 15 Oct)
      var LIM = { lapMin: 1500, lapMax: 7000, hwMin: 6, hwMax: 9, bankMax: 10, gradeMax: 0.12, segMax: 400, zoneMax: 200, radiusMax: 50000 };
      if (lim && typeof lim === 'object') for (var lk in LIM) if (typeof lim[lk] === 'number' && isFinite(lim[lk])) LIM[lk] = lim[lk];
      var issues = [];
      function issue(m) { if (issues.indexOf(m) >= 0) return; issues.push(m); if (typeof warn === 'function') { try { warn(m); } catch (e) { /* the caller's own */ } } }
      function fatal(m) { throw new Error(m); }
      function isNum(v) { return typeof v === 'number' && isFinite(v); }
      function r1(v) { return round(v * 10) / 10; }

      if (!src || typeof src !== 'object') fatal('A Grand Prix needs track: { start, width, segments, ... }: the lap written as segments.');
      if (src.path != null) fatal('track.path is not supported yet: write segments');
      var st = src.start && typeof src.start === 'object' ? src.start : {};
      var X0 = isNum(st.x) ? st.x : 0, Z0 = isNum(st.z) ? st.z : 0, HDEG = isNum(st.heading) ? st.heading : 90, H0 = HDEG * D2R;

      /* ---------------------------------------------------------------------------------------------- segments -- */
      var SIN = src.segments;
      if (!Array.isArray(SIN) || SIN.length < 3) fatal('track.segments must list the lap from the start line: [\'S\', metres or \'fit\', id] for a straight, [\'A\', degrees, radius, ease, id] for an arc.');
      if (SIN.length > LIM.segMax) fatal('track.segments has ' + SIN.length + ' pieces; a lap is at most ' + LIM.segMax + '.');
      var PS = [], IDS = Object.create(null), turnDeg = 0, fits = [];
      for (var si = 0; si < SIN.length; si++) {
        var s = SIN[si], at0 = 'track.segments[' + si + ']', p;
        if (!Array.isArray(s)) fatal(at0 + ' must be an array: [\'S\', metres or \'fit\', id] or [\'A\', degrees, radius, ease, id].');
        if (s[0] === 'S') {
          var fit = s[1] === 'fit';
          if (!fit && !(isNum(s[1]) && s[1] >= 0)) fatal(at0 + ' is a straight: its length is metres (0 or more) or \'fit\'.');
          p = { i: si, type: 'S', fit: fit, len: fit ? 0 : s[1], id: typeof s[2] === 'string' ? s[2] : null, ang: 0, R: 0, e: 0, arc: 0, k: 0 };
          if (fit) fits.push(p);
        } else if (s[0] === 'A') {
          var ang = s[1], rad = s[2], easeGiven = s[3] != null && typeof s[3] !== 'string', ez = easeGiven ? s[3] : 0;
          if (!isNum(ang) || ang === 0 || abs(ang) > 360) fatal(at0 + ' is an arc: its angle is degrees, + turning right, - left (not 0, at most 360).');
          if (!isNum(rad) || rad <= 0 || rad > LIM.radiusMax) fatal(at0 + ' is an arc: its radius is metres along the centre line, more than 0 and at most ' + LIM.radiusMax + '.');
          if (easeGiven && !(isNum(ez) && ez >= 0)) fatal(at0 + ' is an arc: its ease is metres of clothoid at each end (0 for none).');
          var th = abs(ang) * D2R, arc = th * rad - ez;
          // (the stated angle includes both eases; a corner too short for its eases becomes all clothoid)
          if (arc < 0) { ez = th * rad; arc = 0; }
          p = { i: si, type: 'A', fit: false, ang: ang, R: rad, e: ez, arc: arc, k: (ang > 0 ? 1 : -1) / rad, len: 2 * ez + arc,
            id: typeof s[3] === 'string' ? s[3] : typeof s[4] === 'string' ? s[4] : null };
          turnDeg += ang;
        } else fatal(at0 + ' must start with \'S\' (a straight) or \'A\' (an arc).');
        if (p.id != null) {
          if (IDS[p.id]) fatal('track.segments: the id \'' + p.id + '\' is used twice; give every segment its own id (positions find segments by id).');
          IDS[p.id] = p;
        }
        PS.push(p);
      }
      if (abs(abs(turnDeg) - 360) > 1e-6) fatal('track.segments turn ' + r1(turnDeg) + ' degrees in all; a lap turns 360 (clockwise) or -360 (anticlockwise). Fix the arcs\' angles.');
      if (fits.length !== 2) fatal('track.segments needs exactly two [\'S\', \'fit\'] straights (it has ' + fits.length + '): the runtime solves their lengths so the lap closes.');
      var TURN = turnDeg * D2R;
      // each piece's heading at its start (exact: the sum of the turns before it)
      var hs = H0;
      for (si = 0; si < PS.length; si++) { PS[si].h0 = hs; if (PS[si].type === 'A') hs += PS[si].ang * D2R; }

      // heading (rad) and plan curvature (1/m) at u metres into a piece: straight, clothoid in, arc, clothoid out
      function hOf(q, u) {
        if (q.type === 'S') return q.h0;
        var k = q.k, e = q.e, a = q.arc;
        if (e > 0 && u <= e) return q.h0 + k * u * u / (2 * e);
        if (u <= e + a) return q.h0 + k * (e / 2 + (u - e));
        var v = q.len - u; return q.h0 + k * (e + a) - (e > 0 ? k * v * v / (2 * e) : 0);
      }
      function kOf(q, u) {
        if (q.type === 'S') return 0;
        if (q.e > 0 && u < q.e) return q.k * u / q.e;
        if (u <= q.e + q.arc) return q.k;
        return q.e > 0 ? q.k * max(0, q.len - u) / q.e : q.k;
      }
      // the plan displacement over [u0, u1] of a piece, added to acc: Simpson panels of at most 0.25 m on the exact
      // heading, split where the curvature changes form (error far under a millimetre a lap)
      function integ(q, u0, u1, acc) {
        if (!(u1 > u0)) return;
        if (q.type === 'S') { acc[0] += sin(q.h0) * (u1 - u0); acc[1] -= cos(q.h0) * (u1 - u0); return; }
        var cuts = [u0], b1 = q.e, b2 = q.e + q.arc;
        if (b1 > u0 && b1 < u1) cuts.push(b1);
        if (b2 > u0 && b2 < u1 && b2 !== b1) cuts.push(b2);
        cuts.push(u1);
        for (var c = 0; c < cuts.length - 1; c++) {
          var a = cuts[c], b = cuts[c + 1], m = max(1, ceil((b - a) / 0.25 - 1e-9)), du = (b - a) / m;
          for (var j = 0; j < m; j++) {
            var ua = a + j * du, ha = hOf(q, ua), hm = hOf(q, ua + du / 2), hb = hOf(q, ua + du);
            acc[0] += du / 6 * (sin(ha) + 4 * sin(hm) + sin(hb));
            acc[1] -= du / 6 * (cos(ha) + 4 * cos(hm) + cos(hb));
          }
        }
      }

      /* ------------------------------------------------------------------------- closing the loop: the two fits -- */
      // (the lap is at least as long as its pieces but the two fits, which are never negative: a lap already too long is
      // refused here, before any of it is integrated)
      var known = 0;
      for (si = 0; si < PS.length; si++) known += PS[si].len;
      if (!(known <= LIM.lapMax)) fatal('The lap is at least ' + round(known) + ' m before its two \'fit\' straights; a Grand Prix lap must be ' + LIM.lapMin + ' to ' + LIM.lapMax + ' m. It is never rescaled: shorten the segments.');
      var acc = [X0, Z0];
      for (si = 0; si < PS.length; si++) integ(PS[si], 0, PS[si].len, acc);
      var FA = fits[0], FB = fits[1], ua2 = [sin(FA.h0), -cos(FA.h0)], ub2 = [sin(FB.h0), -cos(FB.h0)];
      var rx = X0 - acc[0], rz = Z0 - acc[1], det = ua2[0] * ub2[1] - ua2[1] * ub2[0];
      if (abs(det) < 1e-3) fatal('The two \'fit\' straights (' + (FA.id || 'segment ' + FA.i) + ', ' + (FB.id || 'segment ' + FB.i) + ') run parallel, so no lengths close the lap: make them two straights that point different ways.');
      FA.len = (rx * ub2[1] - rz * ub2[0]) / det; FB.len = (ua2[0] * rz - ua2[1] * rx) / det;
      // (a solved 0 comes back as a hair under it: a micrometre is no length)
      if (FA.len < 0 && FA.len > -1e-6) FA.len = 0;
      if (FB.len < 0 && FB.len > -1e-6) FB.len = 0;
      if (FA.len < 0 || FB.len < 0) fatal('The \'fit\' straights solved to ' + r1(FA.len) + ' m (' + (FA.id || 'segment ' + FA.i) + ') and ' + r1(FB.len) + ' m (' + (FB.id || 'segment ' + FB.i) + '); a straight cannot be negative: change the segments around them so the lap can close.');
      var L = 0;
      for (si = 0; si < PS.length; si++) { PS[si].d0 = L; L += PS[si].len; PS[si].d1 = L; }
      if (L < LIM.lapMin || L > LIM.lapMax) fatal('The lap is ' + round(L) + ' m; a Grand Prix lap must be ' + LIM.lapMin + ' to ' + LIM.lapMax + ' m. It is never rescaled: lengthen or shorten the segments.');

      /* ------------------------------------------------------------------------------------ the plan table -- */
      var n = max(64, round(L / STEP)), ds = L / n;
      var X = new Float64Array(n), Z = new Float64Array(n), HD = new Float64Array(n), K = new Float64Array(n);
      var cur = [X0, Z0], pi = 0, uc = 0, close = 0;
      for (var i = 0; i <= n; i++) {
        var d = i === n ? L : i * ds;
        while (pi < PS.length - 1 && d > PS[pi].d1) { integ(PS[pi], uc, PS[pi].len, cur); pi++; uc = 0; }
        var u = min(PS[pi].len, max(0, d - PS[pi].d0));
        integ(PS[pi], uc, u, cur); uc = u;
        if (i < n) { X[i] = cur[0]; Z[i] = cur[1]; HD[i] = hOf(PS[pi], u); K[i] = kOf(PS[pi], u); }
        else close = Math.hypot(cur[0] - X0, cur[1] - Z0);
      }
      function wrap(q) { q = q % L; return q < 0 ? q + L : q; }

      /* -------------------------------------------------------------------- positions: metres or anchors -- */
      function anchor(v, what) {
        if (isNum(v)) return v;
        if (Array.isArray(v) && typeof v[0] === 'string' && isNum(v[1]) && (v.length < 3 || isNum(v[2]))) {
          var q = IDS[v[0]];
          if (!q) fatal(what + ' names the segment \'' + v[0] + '\', which the lap does not have: use a segment\'s own id (the last item of its entry).');
          return q.d0 + v[1] * q.len + (v.length > 2 ? v[2] : 0);
        }
        return fatal(what + ' must be metres along the lap, or [segmentId, fraction], or [segmentId, fraction, metres].');
      }

      /* ------------------------------------------------------------------------------------- elevation -- */
      var EL = src.elevation, RAMPS = [], CRESTS = [];
      if (EL != null) {
        if (typeof EL !== 'object' || Array.isArray(EL)) fatal('track.elevation is { ramps: [[from, to, rise]], crests: [[at, length, height]] }: metres over the start line.');
        var rl = EL.ramps == null ? [] : EL.ramps, cl = EL.crests == null ? [] : EL.crests, rsum = 0;
        if (!Array.isArray(rl) || !Array.isArray(cl)) fatal('track.elevation.ramps and .crests are lists: [[from, to, rise]] and [[at, length, height]].');
        if (rl.length > LIM.zoneMax || cl.length > LIM.zoneMax) fatal('track.elevation lists at most ' + LIM.zoneMax + ' ramps and ' + LIM.zoneMax + ' crests.');
        for (var ri = 0; ri < rl.length; ri++) {
          var rw = 'track.elevation.ramps[' + ri + ']', rr = rl[ri];
          if (!Array.isArray(rr) || rr.length < 3 || !isNum(rr[2])) fatal(rw + ' must be [from, to, rise]: a climb (rise +) or a drop (-) in metres.');
          var ra = anchor(rr[0], rw), rb = anchor(rr[1], rw);
          if (ra < -1e-6 || rb > L + 1e-6 || !(rb > ra)) fatal(rw + ' runs from ' + r1(ra) + ' to ' + r1(rb) + ' m: a ramp runs forward and may not cross the start line (0 to ' + r1(L) + ' m).');
          RAMPS.push([max(0, ra), min(L, rb), rr[2]]); rsum += rr[2];
        }
        if (abs(rsum) > 1e-6) fatal('track.elevation.ramps rise ' + r1(rsum) + ' m in all; they must sum to 0 so the lap ends where it starts.');
        for (var ci = 0; ci < cl.length; ci++) {
          var cw = 'track.elevation.crests[' + ci + ']', cc = cl[ci];
          if (!Array.isArray(cc) || cc.length < 3 || !isNum(cc[1]) || cc[1] <= 0 || !isNum(cc[2])) fatal(cw + ' must be [at, length, height]: a raised-cosine bump (height -: a dip), length metres over 0.');
          CRESTS.push([wrap(anchor(cc[0], cw)), cc[1], cc[2]]);
        }
      }
      var Y = new Float64Array(n), G = new Float64Array(n), KV = new Float64Array(n);
      for (i = 0; i < n; i++) {
        var q0 = i * ds, y = 0, g = 0, kv = 0, j;
        for (j = 0; j < RAMPS.length; j++) {
          var R0 = RAMPS[j], span = R0[1] - R0[0], uu = (q0 - R0[0]) / span;
          if (uu >= 1) y += R0[2];
          else if (uu > 0) { var w0 = PI / span; y += R0[2] * (1 - cos(PI * uu)) / 2; g += R0[2] * w0 * sin(PI * uu) / 2; kv += R0[2] * w0 * w0 * cos(PI * uu) / 2; }
        }
        for (j = 0; j < CRESTS.length; j++) {
          var C0 = CRESTS[j], wv = q0 - C0[0];
          wv = ((wv + L / 2) % L + L) % L - L / 2;
          if (abs(wv) < C0[1] / 2) { var w1 = 2 * PI / C0[1]; y += C0[2] * (1 + cos(w1 * wv)) / 2; g -= C0[2] * w1 * sin(w1 * wv) / 2; kv -= C0[2] * w1 * w1 * cos(w1 * wv) / 2; }
        }
        Y[i] = y; G[i] = g; KV[i] = kv;
      }

      /* ------------------------------------------------------------- zones: width, bank, run-off (and kerbs) -- */
      // a zone holds its value over [from, to] and eases in and out over `ease` metres outside it (smoothstep), across
      // the start line if it must; zones apply in the order written, each over what came before
      function zones(list, what, valueAt, easeDefault) {
        var out = [];
        if (list == null) return out;
        if (!Array.isArray(list)) fatal(what + ' is a list of zones: [[from, to, value, ease], ...].');
        if (list.length > LIM.zoneMax) fatal(what + ' lists ' + list.length + ' zones; at most ' + LIM.zoneMax + '.');
        for (var zi = 0; zi < list.length; zi++) {
          var zw = what + '[' + zi + ']', zz = list[zi];
          if (!Array.isArray(zz)) fatal(zw + ' must be [from, to, value, ease].');
          var v = valueAt(zz, zw), ezn = zz[valueAt.easeAt];
          if (ezn != null && !(isNum(ezn) && ezn >= 0)) fatal(zw + ': the ease is metres (0 or more).');
          var a = wrap(anchor(zz[0], zw)), b = wrap(anchor(zz[1], zw));
          out.push({ a: a, len: wrap(b - a), v: v, r: ezn == null ? easeDefault : ezn, side: valueAt.side ? valueAt.side(zz) : null });
        }
        return out;
      }
      function zoneAt(list, base, q) {
        var v = base;
        for (var zi = 0; zi < list.length; zi++) {
          var z = list[zi], r = z.r, w;
          if (r > 0) { var uz = wrap(q - (z.a - r)); w = uz <= r ? uz / r : uz <= r + z.len ? 1 : uz <= 2 * r + z.len ? 1 - (uz - r - z.len) / r : 0; }
          else { var u2 = wrap(q - z.a); w = u2 <= z.len ? 1 : 0; }
          w = w * w * (3 - 2 * w);
          v += (z.v - v) * w;
        }
        return v;
      }
      function numAt(index, what) { var f = function (zz, zw) { if (!isNum(zz[index])) fatal(zw + ': ' + what); return zz[index]; }; f.easeAt = index + 1; return f; }
      var WIDTH = isNum(src.width) ? src.width : 14;
      var ZW = zones(src.widths, 'track.widths', numAt(2, 'the road width is metres between the white lines.'), 40);
      var ZB = zones(src.bank, 'track.bank', numAt(2, 'the bank is degrees, + raising the right-hand edge.'), 25);
      var roVal = function (zz, zw) { if (zz[2] !== 'L' && zz[2] !== 'R') fatal(zw + ': the side is \'L\' or \'R\'.'); if (!isNum(zz[3]) || zz[3] < 0) fatal(zw + ': the run-off is metres (0 or more) beyond the verge.'); return zz[3]; };
      roVal.easeAt = 4; roVal.side = function (zz) { return zz[2]; };
      var ZR = zones(src.runoff, 'track.runoff', roVal, 15), ZRL = [], ZRR = [];
      for (i = 0; i < ZR.length; i++) (ZR[i].side === 'L' ? ZRL : ZRR).push(ZR[i]);
      var VERGE = src.verge == null ? 1.5 : src.verge;
      if (!isNum(VERGE) || VERGE < 0 || VERGE > 20) { issue('track.verge is metres (0 to 20) from the white line to the barrier face; 1.5 was used.'); VERGE = 1.5; }
      var KERB = src.kerb == null ? 0.8 : src.kerb;
      if (!isNum(KERB) || KERB < 0.3 || KERB > 1.5) { var kc = isNum(KERB) ? max(0.3, min(1.5, KERB)) : 0.8; issue('track.kerb is 0.3 to 1.5 m wide; ' + kc + ' was used.'); KERB = kc; }

      var HW = new Float64Array(n), BK = new Float64Array(n), WL = new Float64Array(n), WR = new Float64Array(n);
      var hwLo = LIM.hwMin, hwHi = LIM.hwMax, bmax = LIM.bankMax, wClamp = null, bClamp = null, gMax = 0, gAt = 0;
      for (i = 0; i < n; i++) {
        var q1 = i * ds, w2 = zoneAt(ZW, WIDTH, q1) / 2, hwc = max(hwLo, min(hwHi, w2));
        if (abs(hwc - w2) > 1e-6 && wClamp == null) wClamp = q1;
        var bd = zoneAt(ZB, 0, q1), bdc = max(-bmax, min(bmax, bd));
        if (abs(bdc - bd) > 1e-9 && bClamp == null) bClamp = q1;
        HW[i] = hwc; BK[i] = bdc * D2R;
        WL[i] = hwc + VERGE + zoneAt(ZRL, 0, q1); WR[i] = hwc + VERGE + zoneAt(ZRR, 0, q1);
        if (abs(G[i]) > gMax) { gMax = abs(G[i]); gAt = q1; }
      }
      if (wClamp != null) issue('The road must be ' + hwLo * 2 + ' to ' + hwHi * 2 + ' m wide (track.width and track.widths); it was clamped from ' + round(wClamp) + ' m along the lap.');
      if (bClamp != null) issue('A Grand Prix banks at most ' + bmax + ' degrees (track.bank); it was clamped from ' + round(bClamp) + ' m along the lap.');
      if (gMax > LIM.gradeMax) issue('The lap climbs or drops ' + (round(gMax * 1000) / 10) + ' % at ' + round(gAt) + ' m; a Grand Prix grade is at most ' + round(LIM.gradeMax * 100) + ' %: lengthen that ramp or lower it.');
      var hwMin = Infinity, hwMax = 0;
      for (i = 0; i < n; i++) { if (HW[i] < hwMin) hwMin = HW[i]; if (HW[i] > hwMax) hwMax = HW[i]; }

      /* ------------------------------------------------------------------------------- corners and kerbs -- */
      var SEGS = [], CORNERS = [], KERBS = [], minR = Infinity;
      for (si = 0; si < PS.length; si++) {
        var q2 = PS[si];
        SEGS.push({ id: q2.id, type: q2.type, d0: q2.d0, d1: q2.d1, ang: q2.ang, R: q2.R, ease: q2.e, fit: q2.fit });
        if (q2.type !== 'A') continue;
        if (q2.R < minR) minR = q2.R;
        var hwArc = HW[min(n - 1, floor(wrap(q2.d0 + q2.len / 2) / ds))];
        if (q2.R < hwArc + 2) issue('The arc ' + (q2.id || 'segments[' + q2.i + ']') + ' has a radius of ' + q2.R + ' m, under the road\'s half width plus 2 m (' + r1(hwArc + 2) + '): its inside edge folds over itself. Use a bigger radius or a narrower road there.');
        var mt = q2.id ? /^T(\d+)$/.exec(q2.id) : null;
        if (!mt) continue;
        CORNERS.push({ id: q2.id, n: +mt[1], d0: q2.d0, d1: q2.d1, apex: q2.d0 + q2.len / 2, dir: q2.ang > 0 ? 1 : -1, ang: abs(q2.ang), R: q2.R });
        KERBS.push({ d0: wrap(q2.d0 - 10), d1: wrap(q2.d1 + 20), side: 'L' }, { d0: wrap(q2.d0 - 10), d1: wrap(q2.d1 + 20), side: 'R' });
      }
      // which side has a kerb at each sample (1 left, 2 right)
      var KM = new Uint8Array(n);
      for (i = 0; i < KERBS.length; i++) {
        var kb = KERBS[i], klen = wrap(kb.d1 - kb.d0), kbit = kb.side === 'L' ? 1 : 2;
        for (var kq = 0; kq <= klen; kq += ds) KM[min(n - 1, floor(wrap(kb.d0 + kq) / ds))] |= kbit;
      }

      /* ------------------------------------------------------------------------- crossings (refused) -- */
      // no two sections at least 60 m apart along the lap may come within their half widths + 2 m of each other, at any
      // height: v1's nearest() is plan-only, so a bridge over the lap would snap cars to the wrong deck
      var S3 = [], cell = max(40, 2 * hwMax + 2), GRID = Object.create(null);
      for (var q3 = 0; q3 < L; q3 += 3) {
        var i3 = min(n - 1, floor(q3 / ds)), key = floor(X[i3] / cell) + ',' + floor(Z[i3] / cell);
        S3.push({ d: i3 * ds, x: X[i3], z: Z[i3], hw: HW[i3] });
        (GRID[key] || (GRID[key] = [])).push(S3.length - 1);
      }
      var edge = { gap: Infinity, a: 0, b: 0 };
      for (var a3 = 0; a3 < S3.length; a3++) {
        var A3 = S3[a3], gx = floor(A3.x / cell), gz = floor(A3.z / cell);
        for (var dx = -1; dx <= 1; dx++) for (var dz = -1; dz <= 1; dz++) {
          var list = GRID[(gx + dx) + ',' + (gz + dz)]; if (!list) continue;
          for (var b3i = 0; b3i < list.length; b3i++) {
            var b3 = list[b3i]; if (b3 <= a3) continue;
            var B3 = S3[b3], al = abs(A3.d - B3.d); if (min(al, L - al) < 60) continue;
            var ex3 = A3.x - B3.x, ez3 = A3.z - B3.z, dist = sqrt(ex3 * ex3 + ez3 * ez3), gap = dist - A3.hw - B3.hw;
            if (gap < edge.gap) edge = { gap: gap, a: A3.d, b: B3.d };
            if (gap < 2) fatal('The lap crosses or touches itself: the road at ' + round(A3.d) + ' m and at ' + round(B3.d) + ' m along it come ' + r1(max(0, gap)) + ' m apart edge to edge (2 m at least, at any height: no bridges over the lap yet). Spread the segments there.');
          }
        }
      }

      /* ---------------------------------------------------------------------------------------- lookups -- */
      function idx(q) { var k = floor(wrap(q) / ds); return k >= n ? n - 1 : k; }
      function rel(a, b) { var x = wrap(a - b); return x > L / 2 ? x - L : x; }
      // (sample i, the next sample, the fraction between), into a small scratch array: no allocation a call
      var IF = [0, 0, 0];
      function locate(q) { q = wrap(q); var k = floor(q / ds); if (k >= n) k = n - 1; var f = (q - k * ds) / ds; IF[0] = k; IF[1] = k + 1 < n ? k + 1 : 0; IF[2] = f < 0 ? 0 : f > 1 ? 1 : f; return IF; }
      function lerp(arr, a, b, f) { return arr[a] + (arr[b] - arr[a]) * f; }
      function headAt(a, b, f) { var hb = b === 0 ? HD[0] + TURN : HD[b]; return HD[a] + (hb - HD[a]) * f; }
      function pose(q, out) {
        out = out || {};
        var c = locate(q), a = c[0], b = c[1], f = c[2];
        out.x = lerp(X, a, b, f); out.z = lerp(Z, a, b, f); out.y = lerp(Y, a, b, f); out.h = headAt(a, b, f); out.k = lerp(K, a, b, f);
        out.g = lerp(G, a, b, f); out.kv = lerp(KV, a, b, f); out.bank = lerp(BK, a, b, f); out.hw = lerp(HW, a, b, f);
        out.wl = lerp(WL, a, b, f); out.wr = lerp(WR, a, b, f);
        return out;
      }
      // on the banked surface, lat metres right of the centre line and up metres over it, in v1's frame (the right vector
      // level, then rolled by the bank; up perpendicular to the road along it, so it leans back on a climb)
      function posAt(q, lat, up, out) {
        out = out || {};
        var c = locate(q), a = c[0], b = c[1], f = c[2];
        var h = headAt(a, b, f), g = lerp(G, a, b, f), bk = lerp(BK, a, b, f), nn = sqrt(1 + g * g);
        var ch = cos(h), sh = sin(h), cb = cos(bk), sb = sin(bk);
        // level right (cos h, 0, sin h); up0 = right x tangent = (-g sin h, 1, g cos h) / nn
        var u0x = -g * sh / nn, u0y = 1 / nn, u0z = g * ch / nn;
        var rX = ch * cb + u0x * sb, rY = u0y * sb, rZ = sh * cb + u0z * sb;
        var uX = u0x * cb - ch * sb, uY = u0y * cb, uZ = u0z * cb - sh * sb;
        lat = lat || 0; up = up || 0;
        out.x = lerp(X, a, b, f) + rX * lat + uX * up; out.y = lerp(Y, a, b, f) + rY * lat + uY * up; out.z = lerp(Z, a, b, f) + rZ * lat + uZ * up;
        return out;
      }
      function hwAt(q) { var c = locate(q); return lerp(HW, c[0], c[1], c[2]); }
      function wallsAt(q, out) { out = out || {}; var c = locate(q); out.left = lerp(WL, c[0], c[1], c[2]); out.right = lerp(WR, c[0], c[1], c[2]); return out; }
      function yAt(q) { var c = locate(q); return lerp(Y, c[0], c[1], c[2]); }
      function bankAt(q) { var c = locate(q); return lerp(BK, c[0], c[1], c[2]); }
      function headingAt(q) { var c = locate(q); return headAt(c[0], c[1], c[2]); }
      // 0 the road, 1 a kerb (inside a corner's kerb zone, up to `kerb` past the white line), 2 the verge or run-off,
      // 3 at or past the barrier face
      function surfaceAt(q, lat) {
        var c = locate(q), a = c[0], b = c[1], f = c[2], al = abs(lat), hw = lerp(HW, a, b, f);
        if (al <= hw) return 0;
        var right = lat > 0, face = right ? lerp(WR, a, b, f) : lerp(WL, a, b, f);
        if (al >= face) return 3;
        if (al <= hw + KERB && (KM[f < 0.5 ? a : b] & (right ? 2 : 1))) return 1;
        return 2;
      }
      // where (x, z) is: the nearest sample, searched from `hint` (a sample index) at most 80 either way, or the whole
      // table when hint < 0; then d along and lat across (kart.js's project, on this table)
      function project(x, z, hint, out) {
        out = out || {};
        var best, bd, j, e1, e2, d2;
        if (!(hint >= 0) || hint >= n) {
          bd = Infinity; best = 0;
          for (j = 0; j < n; j++) { e1 = X[j] - x; e2 = Z[j] - z; d2 = e1 * e1 + e2 * e2; if (d2 < bd) { bd = d2; best = j; } }
        } else {
          best = hint | 0; e1 = X[best] - x; e2 = Z[best] - z; bd = e1 * e1 + e2 * e2;
          var start = best;
          for (var dir = -1; dir <= 1; dir += 2) for (var step = 1; step <= 80; step++) {
            j = start + dir * step; j = j < 0 ? j + n : j >= n ? j - n : j;
            e1 = X[j] - x; e2 = Z[j] - z; d2 = e1 * e1 + e2 * e2;
            if (d2 < bd) { bd = d2; best = j; } else if (step > 2) break;
          }
        }
        // (along the sample's tangent, then scaled to the centre line: off the line in a bend a metre along is
        // 1 - k lat metres of the centre line's, shorter on the inside)
        var ox = x - X[best], oz = z - Z[best], h = HD[best], along = ox * sin(h) - oz * cos(h), lat = ox * cos(h) + oz * sin(h);
        var den = 1 - K[best] * lat;
        out.i = best; out.d = wrap(best * ds + along / (den < 0.2 ? 0.2 : den)); out.lat = lat; out.dist = sqrt(bd);
        return out;
      }
      // v1's frameAt (G7): the unit 3D tangent between samples i and i + 1, at fraction f
      function tangent(i0, f, out) {
        var a = ((i0 % n) + n) % n, b = a + 1 < n ? a + 1 : 0, h = headAt(a, b, f), g = lerp(G, a, b, f), nn = sqrt(1 + g * g);
        out.set(sin(h) / nn, g / nn, -cos(h) / nn);
        return out;
      }
      // v1's spline input (G5): m points of the real lap, evenly along it
      function ring(m) { var out = [], t = {}; for (var k = 0; k < m; k++) { pose(k * L / m, t); out.push([t.x, t.y, t.z]); } return out; }
      // v1's own track arrays (G6), from this table: P[n] = P[0], CUM[i] = i * ds, CUM[n] = L
      // (three: the page's three.js, passed in: this file names no page global)
      function v1(three) {
        var P = new Array(n + 1), CUM = new Float64Array(n + 1), BANK = new Float32Array(n + 1), banked = false;
        for (var k = 0; k < n; k++) { P[k] = new three.Vector3(X[k], Y[k], Z[k]); CUM[k] = k * ds; BANK[k] = BK[k]; if (BK[k] !== 0) banked = true; }
        P[n] = P[0].clone(); CUM[n] = L; BANK[n] = BK[0];
        return { NS: n, P: P, CUM: CUM, BANK: BANK, banked: banked };
      }
      function at(pos) { return wrap(anchor(pos, 'A position')); }

      /* ------------------------------------------------------------------------- 3D length and signature -- */
      var L3 = 0;
      for (i = 0; i < n; i++) { var i2 = i + 1 < n ? i + 1 : 0, lx = X[i2] - X[i], lz = Z[i2] - Z[i], ly = Y[i2] - Y[i]; L3 += sqrt(lx * lx + lz * lz + ly * ly); }
      // FNV-1a over the source and a summary of the table, in two 32-bit lanes: 16 hex
      var text = '';
      try { text = JSON.stringify(src); } catch (e) { text = String(SIN.length); }
      text += '|' + L.toFixed(3) + '|' + n;
      for (i = 0; i < n; i += 97) text += '|' + X[i].toFixed(2) + ',' + Y[i].toFixed(2) + ',' + Z[i].toFixed(2) + ',' + HW[i].toFixed(2) + ',' + BK[i].toFixed(4);
      var h1 = 0x811c9dc5, h2 = 0x050c5d1f;
      for (i = 0; i < text.length; i++) { var ch0 = text.charCodeAt(i); h1 = Math.imul(h1 ^ ch0, 0x01000193) >>> 0; h2 = Math.imul(h2 ^ (ch0 + 0x9e), 0x01000193) >>> 0; }
      var sig = ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);

      return {
        kind: 'segments', sig: sig,
        L: L, L3: L3, n: n, ds: ds,
        x: X, z: Z, y: Y, h: HD, k: K, g: G, kv: KV, bank: BK, hw: HW, wl: WL, wr: WR,
        segs: SEGS, corners: CORNERS, kerbs: KERBS,
        hwMin: hwMin, hwMax: hwMax, kerb: KERB, verge: VERGE, turn: TURN, start: { x: X0, z: Z0, heading: HDEG },
        issues: issues,
        // (measured at build, for the tests and the readouts: the loop's closing error in metres, the smallest radius,
        // the closest two sections edge to edge, the steepest grade)
        close: close, minR: minR, edge: edge, gradeMax: gMax,
        wrap: wrap, rel: rel, idx: idx, at: at, pose: pose, posAt: posAt, hwAt: hwAt, wallsAt: wallsAt, yAt: yAt, bankAt: bankAt,
        headingAt: headingAt, surfaceAt: surfaceAt, project: project, tangent: tangent, ring: ring, v1: v1,
      };
    }
