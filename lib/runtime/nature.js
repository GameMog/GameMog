/* ======================================================= GameMog Runtime: nature helpers (20 Oct 2026) == */
// The hard natural things a builder otherwise fakes with primitives (Magma Crown, 20 Oct: a scrolling painted lava
// and forty copies of one cone, "not real, not flowing", "tee pees"), ported from its polish pass:
//   ctx.lava(options)    a material for molten surfaces: a flowing noise field, dark crust plates with glowing edges,
//                        cooler banks, hot spots; emissive only, its glow at about 1 to 1.5 (lib/runtime/API.md)
//   ctx.ranges(options)  rings of jagged ridgelines round the horizon (periodic ridged noise, no seam), coloured from
//                        their foot to their summit, and volcanoes with lava streams on their flanks if asked
// Included in a world's runtime only when its code calls them (lib/custom-game.ts usesNature): every other world's
// page stays byte-identical. ONE top-level binding, GameMogNature; the runtime advances the lava's clock (tick).
var GameMogNature = (function () {
  'use strict';
  var LN = 'float gmLh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }\n' +
    'float gmLn(vec2 p){ vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f); return mix(mix(gmLh(i), gmLh(i + vec2(1.0, 0.0)), u.x), mix(gmLh(i + vec2(0.0, 1.0)), gmLh(i + vec2(1.0, 1.0)), u.x), u.y); }\n' +
    'float gmLf(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * gmLn(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }\n';
  var LF = '{ vec2 p = vGmLava; float t = uGmT * uGmFlow;\n' +
    ' vec2 q = vec2(gmLf(p * 0.9 + vec2(0.0, -t * 0.6)), gmLf(p * 0.9 + vec2(5.2, -t * 0.45)));\n' +
    ' float n = gmLf(p * 1.3 + q * 1.7 + vec2(0.0, -t));\n' +
    ' float plates = gmLf(p * 2.4 + q * 0.9 + vec2(3.0, -t * 0.85));\n' +
    ' float crust = smoothstep(0.5, 0.57, plates), edge = 1.0 - smoothstep(0.0, 0.035, abs(plates - 0.535));\n' +
    ' float heat = mix(0.5 + 0.5 * n, 0.04 + 0.12 * n, crust);\n' +
    ' heat = max(heat, edge * (0.75 + 0.25 * n));\n' +
    ' float bank = smoothstep(0.0, 0.3 * uGmW, vGmLava.x) * smoothstep(uGmW, 0.7 * uGmW, vGmLava.x);\n' +
    ' heat *= mix(1.0, 0.3 + 0.7 * bank, uGmBank) * uGmHeat;\n' +
    ' vec3 c = vec3(0.012, 0.003, 0.0015);\n' +
    ' c = mix(c, vec3(0.36, 0.035, 0.004), smoothstep(0.06, 0.32, heat));\n' +
    ' c = mix(c, vec3(0.92, 0.23, 0.02), smoothstep(0.32, 0.66, heat));\n' +
    ' c = mix(c, vec3(1.45, 0.78, 0.2), smoothstep(0.8, 0.98, heat));\n' +
    ' totalEmissiveRadiance = c * uGmGlow; }\n';
  function num(v, d, lo, hi) { v = Number(v); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; }
  function hsh(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  // a ridge line round the whole horizon, periodic in the angle a (0 to 1, no seam): sharp crests, broad valleys
  function ridge(a, seed, oct) {
    var s = 0, amp = 1, tot = 0;
    for (var o = 0; o < oct; o++) {
      var cells = 9 * Math.pow(2, o), x = a * cells, i0 = Math.floor(x), f0 = x - i0, u = f0 * f0 * (3 - 2 * f0);
      var h0 = hsh(((i0 % cells) + cells) % cells + seed * 101 + o * 977), h1 = hsh((((i0 + 1) % cells) + cells) % cells + seed * 101 + o * 977);
      s += amp * (1 - Math.abs((h0 + (h1 - h0) * u) * 2 - 1)); tot += amp; amp *= 0.5;
    }
    return s / tot;
  }
  return function make(THREE, ctx) {
    var clock = { value: 0 }, pulses = [];
    // the lava: o.flow (how fast it runs, 0 to 3, default 0.4), o.scale (uv units to the flow's cells, default 1),
    // o.glow (its brightness, 0.5 to 1.5, default 1), o.bank (cooler at the edges across u 0 to o.width, default false),
    // o.width (default 1), o.pulse (a slow throb, default false), o.side ('double' for both faces). The flow runs along
    // the geometry's uv: u across, v along it, v growing downstream
    function lava(o) {
      o = o || {};
      var heat = { value: 1 }, m = new THREE.MeshStandardMaterial({ color: '#0E0403', roughness: 0.92, metalness: 0, envMapIntensity: 0.35, side: o.side === 'double' ? THREE.DoubleSide : THREE.FrontSide });
      var flow = num(o.flow, 0.4, 0, 3), scale = num(o.scale, 1, 0.001, 1000), glow = num(o.glow, 1, 0.2, 1.5), w = num(o.width, 1, 0.01, 1000);
      if (o.pulse) pulses.push(heat);
      m.onBeforeCompile = function (sh) {
        sh.uniforms.uGmT = clock; sh.uniforms.uGmHeat = heat; sh.uniforms.uGmFlow = { value: flow }; sh.uniforms.uGmBank = { value: o.bank ? 1 : 0 };
        sh.uniforms.uGmW = { value: w * scale }; sh.uniforms.uGmGlow = { value: glow }; sh.uniforms.uGmScale = { value: scale };
        sh.vertexShader = 'varying vec2 vGmLava;\nuniform float uGmScale;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vGmLava = uv * uGmScale;');
        sh.fragmentShader = 'uniform float uGmT, uGmFlow, uGmBank, uGmW, uGmHeat, uGmGlow;\nvarying vec2 vGmLava;\n' + LN + sh.fragmentShader.replace('#include <emissivemap_fragment>', LF);
      };
      m.customProgramCacheKey = function () { return 'gm-lava'; };
      m.userData.gmLava = true;
      return m;
    }
    // the ranges: o.radius (the nearest ring's distance, default 800), o.rings (1 to 4, default 3), o.height (the
    // tallest summits over o.y, default 220), o.y (their foot, default -45: below the ground, so no seam), o.colors
    // ([foot, summit], default dark rock), o.snow (a summit colour, or null), o.seed, o.volcanoes ([{ angle (radians),
    // distance, height, radius, lava: true }]). Returns a Group to add to ctx.scenery; one draw call a ring, two a volcano
    function ranges(o) {
      o = o || {};
      var low = ctx.quality === 'low', g = new THREE.Group(), TMP = new THREE.Color();
      var R0 = num(o.radius, 800, 50, 20000), N = Math.round(num(o.rings, 3, 1, 4)), H = num(o.height, 220, 5, 5000), Y = num(o.y, -45, -2000, 2000), seed = Math.round(num(o.seed, 1, 0, 1e6));
      var cols = Array.isArray(o.colors) ? o.colors : ['#140D0B', '#46291F'], top = o.snow === null ? null : new THREE.Color(o.snow || '#6A5E5A');
      var mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, side: THREE.DoubleSide });
      for (var k = 0; k < N; k++) {
        var R = R0 * (1 + 0.32 * k), depth = R * 0.2, base = H * (0.1 + 0.18 * k), amp = H * (0.45 + 0.22 * k), A = Math.round((low ? 120 : 260) * (1 - 0.12 * k)), ROWS = low ? 6 : 9;
        var cb = new THREE.Color(cols[0]).lerp(new THREE.Color(cols[1]), 0.08 * k), ct = new THREE.Color(cols[1]);
        var pos = [], col = [], idx = [], i, j, sd = seed + k * 7;
        for (j = 0; j <= ROWS; j++) {
          var tt = j / ROWS;
          for (i = 0; i <= A; i++) {
            var a = (i % A) / A, Hh = base + amp * Math.pow(ridge(a, sd, 5), 1.7), jit = hsh(i * 7.3 + j * 13.7 + sd) - 0.5;
            var y = Y + (Hh) * Math.pow(tt, 0.8) + jit * 18 * tt * (1 - tt) * (H / 220);
            var r = R + depth * tt * (0.5 + 0.5 * ridge(a + 0.37, sd + 3, 3)) + jit * 16 * tt, ang = a * 6.28318;
            pos.push(Math.cos(ang) * r, y, Math.sin(ang) * r);
            var hh = (y - Y) / (base + amp);
            TMP.copy(cb).lerp(ct, Math.min(1, hh * 1.4)); if (top && hh > 0.74) TMP.lerp(top, Math.min(1, (hh - 0.74) * 2.4));
            col.push(TMP.r, TMP.g, TMP.b);
          }
        }
        for (j = 0; j < ROWS; j++) for (i = 0; i < A; i++) { var a0 = j * (A + 1) + i, b0 = a0 + A + 1; idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
        var gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        gg.setIndex(idx); gg.computeVertexNormals();
        var m = new THREE.Mesh(gg, mat); m.frustumCulled = false; m.name = 'ranges-' + k; g.add(m);
      }
      (Array.isArray(o.volcanoes) ? o.volcanoes.slice(0, 4) : []).forEach(function (v, vi) { g.add(volcano(v, Y, cols, top, mat, seed + 50 + vi, low)); });
      return g;
    }
    // a volcano: a crater cone, its flanks wobbled by the ridge noise, and (v.lava) three lava streams from the rim to
    // the foot, one draw call for all three
    function volcano(v, Y, cols, top, mat, seed, low) {
      var ax = num(v.angle, 0, -100, 100), R = num(v.distance, 1100, 10, 20000), Hh = num(v.height, 380, 10, 5000), rad = num(v.radius, 240, 5, 5000);
      var prof = [], n = 18, i, TMP = new THREE.Color();
      for (i = 0; i <= n; i++) { var u = i / n; prof.push(new THREE.Vector2(rad * (1 - u) + rad * 0.16 * u, Hh * Math.pow(u, 0.75))); }
      prof.push(new THREE.Vector2(rad * 0.1, Hh * 0.93)); prof.push(new THREE.Vector2(0.01, Hh * 0.9));
      var gg = new THREE.LatheGeometry(prof, low ? 32 : 56), pp = gg.attributes.position, col = [], cb = new THREE.Color(cols[0]), ct = new THREE.Color(cols[1]);
      for (i = 0; i < pp.count; i++) {
        var x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i), an = Math.atan2(z, x), k2 = 1 + 0.22 * (ridge(an / 6.28318 + 0.5, seed + 9, 4) - 0.5) * Math.min(1, y / (Hh * 0.2) + 0.3);
        pp.setXYZ(i, x * k2, y, z * k2);
        var hh = y / Hh; TMP.copy(cb).lerp(ct, Math.min(1, hh * 1.3)); if (top && hh > 0.8) TMP.lerp(top, (hh - 0.8) * 3);
        col.push(TMP.r, TMP.g, TMP.b);
      }
      gg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); gg.computeVertexNormals();
      var grp = new THREE.Group(), cone = new THREE.Mesh(gg, mat); cone.frustumCulled = false; grp.add(cone);
      if (v.lava !== false) {
        var P = [], U = [], ID = [], NSEG = low ? 18 : 30, wd = rad * 0.035, base = 0;
        for (var s2 = 0; s2 < 3; s2++) {
          var a0 = ax + Math.PI + (s2 - 1) * 0.5 + (hsh(seed * 31 + s2) - 0.5) * 0.3;
          for (i = 0; i <= NSEG; i++) {
            var u2 = i / NSEG, hy = Hh * 0.9 * (1 - u2), f = Math.pow(hy / Hh, 1 / 0.75), rr2 = (rad * (1 - f) + rad * 0.16 * f) * 1.01 + 1.5;
            var aw = a0 + Math.sin(u2 * 7 + s2 * 2) * 0.06 + u2 * 0.12 * (s2 - 1), tx = -Math.sin(aw), tz = Math.cos(aw), ww = wd * (0.5 + u2);
            P.push(Math.cos(aw) * rr2 - tx * ww, hy, Math.sin(aw) * rr2 - tz * ww, Math.cos(aw) * rr2 + tx * ww, hy, Math.sin(aw) * rr2 + tz * ww);
            U.push(0, u2 * 9, 1, u2 * 9);
            if (i > 0) { var b1 = base + (i - 1) * 2; ID.push(b1, b1 + 1, b1 + 2, b1 + 1, b1 + 3, b1 + 2); }
          }
          base += (NSEG + 1) * 2;
        }
        var sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
        sg.setIndex(ID); sg.computeVertexNormals();
        var sm = lava({ flow: 0.5, bank: true, side: 'double' }); sm.fog = false; var st = new THREE.Mesh(sg, sm); st.frustumCulled = false; grp.add(st); // (its glow carries through the haze, as real lava's does)
      }
      grp.position.set(Math.cos(ax) * R, Y + 5, Math.sin(ax) * R);
      return grp;
    }
    function tick(t) { clock.value = t; for (var i = 0; i < pulses.length; i++) pulses[i].value = 1 + Math.sin(t * 1.1) * 0.08; }
    return { lava: lava, ranges: ranges, tick: tick };
  };
})();
