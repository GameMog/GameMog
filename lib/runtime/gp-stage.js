    /* ================================================== Grand Prix: the show around the race (ARTIFICIAL1 M2, lane C2) == */
    // gp-stage.js. Pasted into boot() by gp.js at /*@include gp-stage.js*/. ONE top-level binding, GpStage; every other
    // name lives inside it, so nothing of v1's boot() is shadowed. VIEW: the page only through env.
    //
    // The podium stage and its fireworks (EXPERIENCE.md 6.1, lane C2: X33; the flag-waver, the brake and activation
    // boards and the agents' standing forms stay with the lanes that own them).
    //
    //   GpStage.stage(env) -> St | null           null: none of it (gp.js keeps the director's own shots)
    //     env = { THREE, three, scene, renderer, camera, quality, T, cfg, theme, reduced, warn, root, race() /* -> R */,
    //             page(e, data) }
    //   St = { event(e), frame(dt, state, camera), play(id, o) -> bool /* 'podium' (the flag is the director's) */,
    //          anchor() -> { d, lat, up }, spot(k) -> [x, y, z], helmets(on), state(), dispose() }
    //     anchor / spot / helmets are what the director's podium shots read (gp-director.js podiumSeq): the track frame
    //     of the podium's middle, the top of step k (1, 2, 3), the cut-swap of the standing agents' helmets.
    //
    // WHAT IT DRAWS. A winners' deck cantilevered out of the pit building's glass face over the pit lane, in the pit
    // building's own bay (the scenery rig's authored podium: d 55, 4.3 m off the face, deck 8.2 m up), facing the main
    // grandstand; on it the three steps (P2 left, P1 centre and tallest, P3 right) with their numerals, the sponsor skirt,
    // two light pylons and the follow-spot cones. Over it the fireworks (rockets from the pit building's roof and from
    // the harbour barges, bursts in the teams' colours and the accent) and the confetti cannons. ONE Points object for
    // each effect, pooled buffers, no allocation per frame; the whole group is hidden (no draw, no cost) until the podium
    // is played and again when the next race begins. The podium stands off the road and above the pit lane because the
    // sim's cars keep crossing the line while it plays.
    //
    // VIEW ONLY: it reads the classification (R.classification(), a pure read) for the teams' colours and never writes the
    // sim, the race, the cars or the page's state.
    var GpStage = (function () {
      var PI = Math.PI, TAU = PI * 2, abs = Math.abs, min = Math.min, max = Math.max, sin = Math.sin, cos = Math.cos, sqrt = Math.sqrt, floor = Math.floor, exp = Math.exp;
      function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
      function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
      // the show's dice: a deterministic 0..1 stream (view only; the race has its own and never sees these)
      function rng(seed) { var s = seed >>> 0 || 1; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

      // ---- the placement (metres; the track frame: d along the lap, lat right of the centre line, up over the road)
      // d 55 is the middle of the pit building's bay between its piers at d 35 and d 75 (the glass face stands 23.7 m left
      // of the centre line there, the roof terrace at 15.3 m); the scenery rig authored the podium there, lat -19.4,
      // deck 8.2 m up. The start gantry (d 0, 12.2 m either side of the line, 11.5 m tall) stands out of every shot.
      var PLACE = { d: 55, lat: -19.4, deck: 8.2, face: -23.7, up: 9.0 };
      // the circuit's own sponsor words (the world's invented teams) and their accent colours
      var SPONSORS = [['FIREWALL', '#E5322B'], ['MARGIN', '#C7CBD1'], ['CORPUS', '#EFB021'], ['ROLLOUT', '#9FB1AC'], ['UPTIME', '#FFB000'], ['COMMIT', '#4E7A2F'], ['PARALLAX', '#B3195B'], ['GIMBAL', '#1E56C8']];
      // the scenery rig's firework barges on the harbour (d, lat; 150 to 225 m right of the line) and the far ones
      var BARGES = [[-200, 150], [-110, 165], [-20, 150], [70, 160], [140, 150], [-160, 225], [-60, 215], [40, 225], [120, 210]];
      var FAR = [[-330, 260], [-60, 300], [140, 330], [-430, 330], [0, 420], [230, 410]];

      // ---- the points' shader: a soft round (or square, flickering) sprite, size in metres, colour past 1 blooms
      var VERT = [
        'attribute vec3 aCol; attribute float aSize; attribute float aAlpha;',
        'uniform float uScale; uniform float uMaxPx;',
        'varying vec3 vC; varying float vA;',
        'void main() {',
        '  vC = aCol; vA = aAlpha;',
        '  vec4 mv = modelViewMatrix * vec4( position, 1.0 );',
        '  float dz = max( -mv.z, 1.0 );',
        '  float px = aSize * uScale / dz;',
        '  gl_PointSize = clamp( px, 1.5, uMaxPx );',
        '  vA *= clamp( px / 1.5, 0.0, 1.0 );',
        '  gl_Position = aAlpha <= 0.0 ? vec4( 2.0, 2.0, 2.0, 1.0 ) : projectionMatrix * mv;',
        '}'].join('\n');
      var FRAG_ROUND = [
        'varying vec3 vC; varying float vA;',
        'void main() {',
        '  vec2 q = gl_PointCoord - 0.5; float r = length( q ) * 2.0;',
        '  float a = 1.0 - smoothstep( 0.0, 1.0, r ); a *= a;',
        '  gl_FragColor = vec4( vC, a * vA );',
        '}'].join('\n');
      var FRAG_SQUARE = [
        'varying vec3 vC; varying float vA;',
        'void main() {',
        '  vec2 q = abs( gl_PointCoord - 0.5 ) * 2.0;',
        '  float a = 1.0 - smoothstep( 0.7, 1.0, max( q.x, q.y ) );',
        '  gl_FragColor = vec4( vC, a * vA );',
        '}'].join('\n');

      function stage(env) {
        var X3 = env.three || env['THREE'], T = env.T, scene = env.scene, renderer = env.renderer;
        if (!X3 || !T || !scene || !renderer || typeof T.posAt !== 'function' || typeof T.headingAt !== 'function' || !X3.Points || !X3.BufferGeometry) return null;
        var LOW = env.quality === 'low', RM = !!env.reduced;
        var doc = env.doc || (env.root && env.root.ownerDocument) || (typeof document !== 'undefined' ? document : null);
        var theme = env.theme || {};
        var ACC = typeof theme.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(theme.accent) ? theme.accent : '#DD6135';
        var FONT = typeof theme.font === 'string' && /^[\w \-]{1,40}$/.test(theme.font) ? theme.font : 'Oxanium';
        var L = T.L, d0 = ((PLACE.d % L) + L) % L;
        var O = T.posAt(d0, 0, 0, {}), HD = T.headingAt(d0);
        var TH = PI / 2 - HD, TC = cos(TH), TS = sin(TH);
        // the stage frame -> the world: x along the lap, y up, z right of the line (a rotation about Y)
        function W(lx, ly, lz) { return [O.x + lx * TC + lz * TS, O.y + ly, O.z - lx * TS + lz * TC]; }
        var DK = PLACE.deck, FZ = PLACE.face, ZC = PLACE.lat, ZF = -16.4;
        var dead = false, shown = false, active = false;
        var group = new X3.Group();
        group.name = 'gp-stage'; group.visible = false; group.userData.gpFurniture = true; group.userData.t = 0;
        group.position.set(O.x, O.y, O.z); group.rotation.y = TH;
        scene.add(group);
        var disposables = [];
        function own(o) { disposables.push(o); return o; }

        /* ----------------------------------------------------------------------------- the merged solids -- */
        function color(hex, k) { var c = new X3.Color(hex); k = k == null ? 1 : k; return [c.r * k, c.g * k, c.b * k]; }
        var FACE = [
          { n: [1, 0, 0], s: 0.70, v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
          { n: [-1, 0, 0], s: 0.70, v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
          { n: [0, 1, 0], s: 1.00, v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
          { n: [0, -1, 0], s: 0.30, v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
          { n: [0, 0, 1], s: 0.88, v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
          { n: [0, 0, -1], s: 0.55, v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] }
        ];
        // a baked key light for the balls (the boxes bake their face's own shade)
        var KL = (function () { var x = 0.35, y = 0.75, z = 0.55, l = sqrt(x * x + y * y + z * z); return [x / l, y / l, z / l]; })();
        function Solids() {
          var P = [], N = [], C = [], I = [], RL = [], SH = [];
          function vert(x, y, z, nx, ny, nz, col, sh, role) { P.push(x, y, z); N.push(nx, ny, nz); C.push(col[0] * sh, col[1] * sh, col[2] * sh); RL.push(role | 0); SH.push(sh); }
          // an oriented box from a to b (its length axis), w wide and h deep, the colour baked per face
          function beam(a, b, w, h, col, faces, role) {
            var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], len = sqrt(ux * ux + uy * uy + uz * uz) || 1;
            ux /= len; uy /= len; uz /= len;
            // s = u x Y (Z when u is vertical), t = u x s: (u, s, t) is right-handed, like the box's (x, y, z)
            var sx = -uz, sy = 0, sz = ux, sl = sqrt(sx * sx + sz * sz);
            if (sl < 1e-4) { sx = 0; sz = 1; sl = 1; }
            sx /= sl; sz /= sl;
            var tx = uy * sz - uz * sy, ty = uz * sx - ux * sz, tz = ux * sy - uy * sx;
            for (var f = 0; f < 6; f++) {
              if (faces && faces.indexOf(f) < 0) continue;
              var F = FACE[f], base = P.length / 3, nx = ux * F.n[0] + sx * F.n[1] + tx * F.n[2], ny = uy * F.n[0] + sy * F.n[1] + ty * F.n[2], nz = uz * F.n[0] + sz * F.n[1] + tz * F.n[2];
              for (var k = 0; k < 4; k++) {
                var q = F.v[k], l = q[0] * len, ss = (q[1] - 0.5) * w, tt = (q[2] - 0.5) * h;
                vert(a[0] + ux * l + sx * ss + tx * tt, a[1] + uy * l + sy * ss + ty * tt, a[2] + uz * l + sz * ss + tz * tt, nx, ny, nz, col, F.s, role);
              }
              I.push(base, base + 1, base + 2, base, base + 2, base + 3);
            }
          }
          // an axis-aligned box
          function box(x0, y0, z0, x1, y1, z1, col, faces, role) {
            for (var f = 0; f < 6; f++) {
              if (faces && faces.indexOf(f) < 0) continue;
              var F = FACE[f], base = P.length / 3;
              for (var k = 0; k < 4; k++) { var q = F.v[k]; vert(q[0] ? x1 : x0, q[1] ? y1 : y0, q[2] ? z1 : z0, F.n[0], F.n[1], F.n[2], col, F.s, role); }
              I.push(base, base + 1, base + 2, base, base + 2, base + 3);
            }
          }
          // an ellipsoid (rings x segments), the shade baked from its normals
          function ball(cx, cy, cz, rx, ry, rz, col, role, seg, rings) {
            seg = seg || 10; rings = rings || 6;
            var base = P.length / 3;
            for (var i = 0; i <= rings; i++) {
              var v = i / rings * PI, sv = sin(v), cvv = cos(v);
              for (var j = 0; j <= seg; j++) {
                var u = j / seg * TAU, nx = sv * cos(u), ny = cvv, nz = sv * sin(u);
                var ex = nx / rx, ey = ny / ry, ez = nz / rz, el = sqrt(ex * ex + ey * ey + ez * ez) || 1;
                vert(cx + nx * rx, cy + ny * ry, cz + nz * rz, ex / el, ey / el, ez / el, col, 0.5 + 0.5 * max(0, (ex * KL[0] + ey * KL[1] + ez * KL[2]) / el), role);
              }
            }
            for (var a = 0; a < rings; a++) for (var b = 0; b < seg; b++) {
              var p0 = base + a * (seg + 1) + b, p1 = p0 + 1, p2 = p0 + seg + 1, p3 = p2 + 1;
              I.push(p0, p2, p1, p1, p2, p3);
            }
          }
          function geometry() {
            var g = new X3.BufferGeometry();
            g.setAttribute('position', new X3.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new X3.Float32BufferAttribute(N, 3)); g.setAttribute('color', new X3.Float32BufferAttribute(C, 3));
            g.setIndex(I); g.computeBoundingSphere();
            return g;
          }
          // repaint a built geometry: the colour per role (an array of [r, g, b]) times each vertex's baked shade
          function recolor(g, table, v0, v1) {
            var a = g.attributes.color.array;
            for (var i = v0 || 0; i < (v1 == null ? SH.length : v1); i++) { var c = table[RL[i]] || table[0]; a[i * 3] = c[0] * SH[i]; a[i * 3 + 1] = c[1] * SH[i]; a[i * 3 + 2] = c[2] * SH[i]; }
            g.attributes.color.needsUpdate = true;
          }
          return { box: box, beam: beam, ball: ball, geometry: geometry, recolor: recolor, vertexCount: function () { return SH.length; }, count: function () { return I.length / 3; } };
        }

        /* ------------------------------------------------------------------------------ the numerals and the skirt -- */
        // one canvas: the numerals 1, 2, 3 in the top row, the sponsor skirt in the bottom row (each word fitted to its cell)
        var CW = LOW ? 1024 : 2048, CH = LOW ? 256 : 512, SC = CW / 2048;
        var cv = doc ? doc.createElement('canvas') : null, atlas = null;
        if (cv) { cv.width = CW; cv.height = CH; atlas = own(new X3.CanvasTexture(cv)); atlas.colorSpace = X3.SRGBColorSpace; atlas.anisotropy = LOW ? 2 : 8; atlas.generateMipmaps = true; atlas.minFilter = X3.LinearMipmapLinearFilter; }
        var NUMCELL = { 1: [0, 0, 340, 320], 2: [340, 0, 340, 320], 3: [680, 0, 340, 320] };
        var SKIRT = [0, 352, 2048, 128];
        function drawAtlas() {
          if (!cv) return;
          var g = cv.getContext('2d'); if (!g) return;
          g.setTransform(SC, 0, 0, SC, 0, 0); g.clearRect(0, 0, 2048, 512);
          g.textAlign = 'center'; g.textBaseline = 'middle';
          // a line of text fitted to a box by measuring it
          function fit(text, weight, maxW, maxH, family) {
            g.font = weight + ' 100px ' + family; var m = g.measureText(text).width || 1;
            var px = min(maxH, 100 * maxW / m); g.font = weight + ' ' + Math.floor(px) + 'px ' + family; return px;
          }
          var fam = '"' + FONT + '", "Helvetica Neue", Arial, sans-serif';
          [1, 2, 3].forEach(function (n) {
            var c = NUMCELL[n], x = c[0], y = c[1], w = c[2], h = c[3];
            var gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#2A2D34'); gr.addColorStop(1, '#101216');
            g.fillStyle = gr; g.fillRect(x, y, w, h);
            g.fillStyle = ACC; g.fillRect(x, y + h - 16, w, 16);
            g.fillStyle = '#F6F1E8'; fit(String(n), '800', w * 0.8, h * 0.74, fam); g.fillText(String(n), x + w / 2, y + h * 0.46);
          });
          var cw = SKIRT[2] / SPONSORS.length;
          SPONSORS.forEach(function (s, i) {
            var x = SKIRT[0] + i * cw, y = SKIRT[1], h = SKIRT[3];
            g.fillStyle = '#0A0C10'; g.fillRect(x, y, cw, h);
            g.fillStyle = s[1]; g.fillRect(x + 6, y + h - 14, cw - 12, 8);
            g.fillStyle = '#F4F1EA'; fit(s[0], '700', cw - 36, h * 0.52, fam); g.fillText(s[0], x + cw / 2, y + h * 0.42);
          });
          atlas.needsUpdate = true;
        }
        drawAtlas();
        // the page's font may land after the first draw: draw again when it does
        try { if (doc && doc.fonts && typeof doc.fonts.load === 'function') doc.fonts.load('700 64px "' + FONT + '"').then(function () { if (!dead) drawAtlas(); }, function () {}); } catch (e) { /* the fallback face stays */ }
        function uvOf(c) { return [c[0] / 2048, 1 - (c[1] + c[3]) / 512, (c[0] + c[2]) / 2048, 1 - c[1] / 512]; }

        /* ------------------------------------------------------------------------------------- the podium -- */
        var STEPW = 2.5, STEPD = 2.4, STEPS = { 1: { x: 0, h: 1.5 }, 2: { x: -2.65, h: 1.1 }, 3: { x: 2.65, h: 0.75 } };
        var ZB = ZC - STEPD / 2, ZT = ZC + STEPD / 2;   // the steps' back and front (m right of the line)
        var DECKX = 9.6;
        var cBody = color('#101216'), cTop = color('#07080A'), cSteel = color('#22252C');
        var cAcc = color(ACC, 3.0), cLamp = color('#FFE7C2', 3.2), cGold = color('#E2B04A', 1.2);
        var S = Solids(), GL = Solids();
        // the deck, its front fascia (the skirt's panel sits on it) and the struts back to the glass face
        S.box(-DECKX, DK - 0.45, FZ - 0.2, DECKX, DK, ZF, cTop);
        S.box(-DECKX, DK - 1.6, ZF - 0.25, DECKX, DK - 0.45, ZF, cBody);
        for (var sx = -8; sx <= 8; sx += 4) S.beam([sx, 5.2, FZ - 0.1], [sx, DK - 1.4, ZF - 1.2], 0.34, 0.34, cSteel);
        // the steps, each with its glowing top edge
        [1, 2, 3].forEach(function (k) {
          var st = STEPS[k], x0 = st.x - STEPW / 2, x1 = st.x + STEPW / 2;
          S.box(x0, DK, ZB, x1, DK + st.h, ZT, cBody);
          S.box(x0 - 0.02, DK + st.h - 0.02, ZB, x1 + 0.02, DK + st.h + 0.03, ZT + 0.02, cTop);
          GL.box(x0, DK + st.h - 0.012, ZT, x1, DK + st.h + 0.04, ZT + 0.05, cAcc, [2, 4]);
        });
        // the deck's lit lips (front), the pylons and their lamp heads
        GL.box(-DECKX, DK, ZF - 0.12, DECKX, DK + 0.05, ZF, cAcc, [2, 4]);
        GL.box(-DECKX, DK - 0.46, ZF - 0.04, DECKX, DK - 0.42, ZF + 0.01, cAcc, [4]);
        [-1, 1].forEach(function (sd) {
          var px = sd * 8.7, h = 7.2;
          S.box(px - 0.22, DK, FZ + 0.9, px + 0.22, DK + h, FZ + 1.4, cSteel);
          S.box(px - 0.55, DK + h, FZ + 0.7, px + 0.55, DK + h + 0.55, FZ + 1.9, cBody);
          GL.beam([px - 0.46, DK + h + 0.28, FZ + 1.92], [px + 0.46, DK + h + 0.28, FZ + 1.92], 0.34, 0.12, cLamp);
          GL.box(px - 0.1, DK + 1.2, FZ + 1.4, px + 0.1, DK + h - 0.3, FZ + 1.44, cAcc, [4]);
        });
        // a low rail along the lip at each end (the steps stand open in the middle)
        [-1, 1].forEach(function (sd) {
          var xa = min(sd * 4.6, sd * (DECKX - 0.1)), xb = max(sd * 4.6, sd * (DECKX - 0.1));
          S.box(xa, DK + 0.92, ZF - 0.1, xb, DK + 1.0, ZF - 0.04, cSteel);
          for (var rx = xa; rx <= xb + 0.01; rx += 1.25) S.box(rx - 0.03, DK, ZF - 0.1, rx + 0.03, DK + 0.95, ZF - 0.04, cSteel);
        });
        // a trophy on a plinth at the right-hand end: a stem, a bowl and a rim, in gold
        S.box(5.6, DK, ZC - 0.6, 6.6, DK + 0.95, ZC + 0.6, cBody);
        GL.box(5.58, DK + 0.92, ZC - 0.62, 6.62, DK + 0.97, ZC + 0.62, cAcc, [2, 4]);
        S.beam([6.1, DK + 0.97, ZC], [6.1, DK + 1.2, ZC], 0.16, 0.16, cGold);
        S.beam([6.1, DK + 1.2, ZC], [6.1, DK + 1.62, ZC], 0.46, 0.46, cGold);
        S.beam([6.1, DK + 1.62, ZC], [6.1, DK + 1.72, ZC], 0.58, 0.58, cGold);
        // the three standing agents' stand-ins (the real forms are a later part's): a suit in the team's colour, a bare head,
        // and a helmet and visor that the cut-swap puts on and takes off; each faces the grandstand, arms up
        var FG = Solids(), HM = Solids(), cDark = color('#121316'), cSkin = color('#C9CCD2'), cWhite = color('#FFFFFF');
        [1, 2, 3].forEach(function (k) {
          var st = STEPS[k], x = st.x, y0 = DK + st.h, z = ZC, up = k === 1 ? [1, 1] : k === 2 ? [0, 1] : [1, 0];
          FG.box(x - 0.2, y0, z - 0.1, x - 0.02, y0 + 0.88, z + 0.1, cDark, null, 1); FG.box(x + 0.02, y0, z - 0.1, x + 0.2, y0 + 0.88, z + 0.1, cDark, null, 1);
          FG.box(x - 0.27, y0 + 0.86, z - 0.15, x + 0.27, y0 + 1.5, z + 0.15, cWhite, null, 0);
          FG.box(x - 0.07, y0 + 1.5, z - 0.07, x + 0.07, y0 + 1.58, z + 0.07, cSkin, null, 2);
          [-1, 1].forEach(function (sd, i) {
            var raised = up[i] === 1, sh = [x + sd * 0.31, y0 + 1.42, z];
            FG.beam(sh, raised ? [x + sd * 0.66, y0 + 2.02, z + 0.05] : [x + sd * 0.36, y0 + 0.92, z + 0.04], 0.13, 0.13, cWhite, null, 0);
            FG.ball(raised ? x + sd * 0.67 : x + sd * 0.36, raised ? y0 + 2.09 : y0 + 0.85, z + 0.05, 0.075, 0.075, 0.075, cDark, 1, 6, 4);
          });
          FG.ball(x, y0 + 1.7, z, 0.15, 0.17, 0.16, cSkin, 2, 10, 7);
          FG.ball(x - 0.058, y0 + 1.74, z + 0.14, 0.03, 0.036, 0.022, cDark, 1, 6, 4); FG.ball(x + 0.058, y0 + 1.74, z + 0.14, 0.03, 0.036, 0.022, cDark, 1, 6, 4);
          HM.ball(x, y0 + 1.71, z, 0.2, 0.205, 0.21, cWhite, 3, 12, 8);
          HM.box(x - 0.13, y0 + 1.66, z + 0.13, x + 0.13, y0 + 1.77, z + 0.225, cDark, null, 4);
        });
        var figTable = { 0: color('#C8CCD2'), 1: cDark, 2: cSkin, 3: color('#C8CCD2'), 4: color('#07090C') };
        var figGeo = own(FG.geometry()), helGeo = own(HM.geometry());
        var solidGeo = own(S.geometry()), glowGeo = own(GL.geometry());
        var matBody = own(new X3.MeshStandardMaterial({ vertexColors: true, metalness: 0.3, roughness: 0.45, envMapIntensity: 0.45 }));
        var matGlow = own(new X3.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
        function add(m, name) { m.name = name; group.add(m); return m; }
        add(new X3.Mesh(solidGeo, matBody), 'stage-solids');
        add(new X3.Mesh(glowGeo, matGlow), 'stage-glow');
        var matFig = own(new X3.MeshStandardMaterial({ vertexColors: true, metalness: 0.15, roughness: 0.5 }));
        var figMesh = add(new X3.Mesh(figGeo, matFig), 'stage-agents'), helMesh = add(new X3.Mesh(helGeo, matFig), 'stage-helmets');
        // a team's colour on its agent: the suit and the helmet, for the first three of the classification (P1, P2, P3 are
        // built in that order with the same parts, so each owns a third of the merged vertices)
        var FIGCOL = [null, figTable[0], figTable[0], figTable[0]];
        function paintFigures(order) {
          [1, 2, 3].forEach(function (k) {
            var r = order && order[k - 1];
            FIGCOL[k] = r && typeof r.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.color) ? color(r.color) : figTable[0];
            var tab = { 0: FIGCOL[k], 1: figTable[1], 2: figTable[2], 3: FIGCOL[k], 4: figTable[4] }, vf = FG.vertexCount() / 3, vh = HM.vertexCount() / 3;
            FG.recolor(figGeo, tab, (k - 1) * vf, k * vf); HM.recolor(helGeo, tab, (k - 1) * vh, k * vh);
          });
        }
        paintFigures(null);
        // the numerals on the step fronts and the sponsor skirt on the fascia: one textured mesh
        if (atlas) {
          var Pp = [], Uu = [], Ii = [];
          var plane = function (x0, y0, x1, y1, z, uv) {
            var b = Pp.length / 3; Pp.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z); Uu.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]); Ii.push(b, b + 1, b + 2, b, b + 2, b + 3);
          };
          [1, 2, 3].forEach(function (k) {
            var st = STEPS[k], ph = st.h * 0.8, pw = min(STEPW * 0.9, ph * 340 / 320), cy = DK + st.h * 0.5;
            plane(st.x - pw / 2, cy - ph / 2, st.x + pw / 2, cy + ph / 2, ZT + 0.07, uvOf(NUMCELL[k]));
          });
          plane(-DECKX, DK - 1.55, DECKX, DK - 0.5, ZF + 0.012, uvOf(SKIRT));
          var tg = own(new X3.BufferGeometry());
          tg.setAttribute('position', new X3.Float32BufferAttribute(Pp, 3)); tg.setAttribute('uv', new X3.Float32BufferAttribute(Uu, 2)); tg.setIndex(Ii); tg.computeBoundingSphere();
          var matSign = own(new X3.MeshBasicMaterial({ map: atlas, toneMapped: false, color: new X3.Color(1.25, 1.25, 1.25) }));
          add(new X3.Mesh(tg, matSign), 'stage-signs');
        }
        // the follow-spot cones: apex at each pylon's lamp, base on the steps; additive, alpha along the cone (high quality only);
        // a camera inside a cone sees none of it (frame() fades them by the camera's distance to their axes)
        var CONES = [], matCone = null;
        if (!LOW) {
          var cP = [], cC = [], cI = [], SEG = 22;
          var cone = function (ax, ay, az, bx, by, bz, rad) {
            CONES.push([ax, ay, az, bx, by, bz]);
            var base = cP.length / 3, dx = bx - ax, dy = by - ay, dz = bz - az, dl = sqrt(dx * dx + dy * dy + dz * dz), ux = dx / dl, uy = dy / dl, uz = dz / dl;
            var sx = -uz, sz = ux, sl = sqrt(sx * sx + sz * sz); sx /= sl; sz /= sl;
            var tx = uy * sz, ty = uz * sx - ux * sz, tz = -uy * sx;
            cP.push(ax, ay, az); cC.push(1, 0.9, 0.72, 0.0);
            for (var i = 0; i < SEG; i++) {
              var a = i / SEG * TAU, ca = cos(a) * rad, sa = sin(a) * rad;
              cP.push(bx + sx * ca + tx * sa, by + ty * sa, bz + sz * ca + tz * sa); cC.push(1, 0.88, 0.7, 0.055);
            }
            for (var j = 0; j < SEG; j++) cI.push(base, base + 1 + j, base + 1 + (j + 1) % SEG);
          };
          cone(-8.7, DK + 7.5, FZ + 1.9, 0.6, DK + 1.7, ZC + 1.2, 2.6);
          cone(8.7, DK + 7.5, FZ + 1.9, -0.6, DK + 1.7, ZC + 1.2, 2.6);
          cone(-8.7, DK + 7.5, FZ + 1.9, -3.6, DK + 1.2, ZC + 1.2, 2.0);
          cone(8.7, DK + 7.5, FZ + 1.9, 3.6, DK + 1.2, ZC + 1.2, 2.0);
          var cg = own(new X3.BufferGeometry());
          cg.setAttribute('position', new X3.Float32BufferAttribute(cP, 3)); cg.setAttribute('color', new X3.Float32BufferAttribute(cC, 4)); cg.setIndex(cI); cg.computeBoundingSphere();
          matCone = own(new X3.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: X3.AdditiveBlending, depthWrite: false, side: X3.DoubleSide, toneMapped: false }));
          add(new X3.Mesh(cg, matCone), 'stage-beams').renderOrder = 3;
        }

        /* -------------------------------------------------------------------------- the point effects -- */
        // a pooled ring buffer of points: position (the stage frame), per-particle velocity, ttl, colour, size, alpha; the
        // four GPU attributes are rewritten in place every frame the pool has anything live
        function Pool(N, frag, name) {
          var pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
          var vel = new Float32Array(N * 3), ttl = new Float32Array(N), ttl0 = new Float32Array(N), drag = new Float32Array(N), grav = new Float32Array(N), sz0 = new Float32Array(N), cc = new Float32Array(N * 3), seed = new Float32Array(N);
          var geo = own(new X3.BufferGeometry()), pa = new X3.BufferAttribute(pos, 3), ca = new X3.BufferAttribute(col, 3), sa = new X3.BufferAttribute(size, 1), aa = new X3.BufferAttribute(alpha, 1);
          [pa, ca, sa, aa].forEach(function (a) { a.setUsage(X3.DynamicDrawUsage); });
          geo.setAttribute('position', pa); geo.setAttribute('aCol', ca); geo.setAttribute('aSize', sa); geo.setAttribute('aAlpha', aa);
          geo.boundingSphere = new X3.Sphere(new X3.Vector3(0, 40, 0), 2000);
          var mat = own(new X3.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms: { uScale: { value: 1000 }, uMaxPx: { value: 96 } }, transparent: true, depthWrite: false, blending: X3.AdditiveBlending, toneMapped: false, fog: false }));
          var pts = new X3.Points(geo, mat); pts.name = name; pts.frustumCulled = false; pts.renderOrder = 4; pts.userData.noReflection = !!LOW;
          group.add(pts);
          var head = 0, live = 0;
          function up() { pa.needsUpdate = true; ca.needsUpdate = true; sa.needsUpdate = true; aa.needsUpdate = true; }
          function spawn(x, y, z, vx, vy, vz, life, c, k, sizeM, dragK, gravity) {
            var i = head; head = (head + 1) % N;
            pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
            ttl[i] = ttl0[i] = life; cc[i * 3] = c[0] * k; cc[i * 3 + 1] = c[1] * k; cc[i * 3 + 2] = c[2] * k; sz0[i] = sizeM; drag[i] = dragK; grav[i] = gravity; seed[i] = (i * 0.618) % 1;
            col[i * 3] = cc[i * 3]; col[i * 3 + 1] = cc[i * 3 + 1]; col[i * 3 + 2] = cc[i * 3 + 2]; size[i] = sizeM; alpha[i] = 1; live++;
          }
          function clear() { for (var i = 0; i < N; i++) { ttl[i] = 0; alpha[i] = 0; size[i] = 0; } live = 0; head = 0; up(); }
          clear();
          return { N: N, pts: pts, mat: mat, pos: pos, col: col, size: size, alpha: alpha, vel: vel, ttl: ttl, ttl0: ttl0, drag: drag, grav: grav, sz0: sz0, cc: cc, seed: seed, spawn: spawn, clear: clear, up: up,
            live: function () { return live; }, setLive: function (n) { live = n; } };
        }
        var FW = Pool(LOW || RM ? 560 : 2200, FRAG_ROUND, 'stage-fireworks');
        var CF = Pool(LOW || RM ? 320 : 1100, FRAG_SQUARE, 'stage-confetti');

        // the sparks: drag, gravity, the white-hot start, the fade, a twinkle
        function stepFW(P, dt, tm, twinkle) {
          var live = 0, N = P.N, pos = P.pos, vel = P.vel, ttl = P.ttl, ttl0 = P.ttl0, drag = P.drag, grav = P.grav, col = P.col, cc = P.cc, size = P.size, alpha = P.alpha, sz0 = P.sz0, seed = P.seed;
          for (var i = 0; i < N; i++) {
            if (ttl[i] <= 0) { if (alpha[i] !== 0) { alpha[i] = 0; size[i] = 0; } continue; }
            ttl[i] -= dt;
            if (ttl[i] <= 0) { alpha[i] = 0; size[i] = 0; continue; }
            live++;
            var k = exp(-drag[i] * dt), j = i * 3;
            vel[j] *= k; vel[j + 1] = vel[j + 1] * k - grav[i] * dt; vel[j + 2] *= k;
            pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
            var f = ttl[i] / ttl0[i], hot = clamp(1 - (1 - f) * 7, 0, 1);
            var tw = twinkle ? 0.7 + 0.3 * sin(tm * 38 + seed[i] * 60) : 1, a = f < 0.5 ? f * 2 : 1;
            col[j] = cc[j] + hot * 1.4; col[j + 1] = cc[j + 1] + hot * 1.2; col[j + 2] = cc[j + 2] + hot * 0.9;
            alpha[i] = a * a * tw; size[i] = sz0[i] * (0.55 + 0.45 * f);
          }
          P.setLive(live); P.up();
        }
        // the confetti: a slow tumbling fall with a breath of wind along the lap, each piece flickering as it turns
        function stepConfetti(P, dt, tm) {
          var live = 0, N = P.N, pos = P.pos, vel = P.vel, ttl = P.ttl, ttl0 = P.ttl0, col = P.col, cc = P.cc, size = P.size, alpha = P.alpha, sz0 = P.sz0, seed = P.seed;
          var a1 = 1 - exp(-1.7 * dt);
          for (var i = 0; i < N; i++) {
            if (ttl[i] <= 0) { if (alpha[i] !== 0) { alpha[i] = 0; size[i] = 0; } continue; }
            ttl[i] -= dt;
            if (ttl[i] <= 0 || pos[i * 3 + 1] < -1) { ttl[i] = 0; alpha[i] = 0; size[i] = 0; continue; }
            live++;
            var j = i * 3, sd = seed[i], fl = sin(tm * (2.2 + sd * 2.6) + sd * 40);
            vel[j] += (0.9 + 0.6 * fl - vel[j]) * a1; vel[j + 1] += (-1.5 - 0.35 * fl - vel[j + 1]) * a1; vel[j + 2] += (0.5 * cos(tm * 1.7 + sd * 30) - vel[j + 2]) * a1;
            pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
            var f = ttl[i] / ttl0[i], fade = f < 0.2 ? f * 5 : 1, tum = 0.35 + 0.65 * abs(sin(tm * (3 + sd * 7) + sd * 90));
            col[j] = cc[j] * tum; col[j + 1] = cc[j + 1] * tum; col[j + 2] = cc[j + 2] * tum; alpha[i] = fade; size[i] = sz0[i];
          }
          P.setLive(live); P.up();
        }

        /* ------------------------------------------------------------------------------------ the show -- */
        var rocket = [];                       // the rockets in the air: { x, y, z, vx, vy, vz, burstY, c, c2, style, big, trail }
        var RNG = rng(7), tShow = 0, tLen = 15, nextShell = 0, volley = [], CANNON = [], vi = 0, finaled = false, shells = 0, bursts = 0, pal = [], plays = 0, lastR = null, lastT = 0, vec = null;
        var GOLD = color('#FFC24A'), WARM = color('#FFE2B0');
        function palette(order) {
          var out = [color(ACC), GOLD, WARM];
          (order || []).forEach(function (r) { if (r && typeof r.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.color)) out.push(color(r.color)); });
          // the winner's colours twice over: the winners are the show
          if (order && order[0] && /^#[0-9a-fA-F]{6}$/.test(order[0].color || '')) out.push(color(order[0].color), color(order[0].color));
          return out;
        }
        function pick(arr) { return arr[floor(RNG() * arr.length) % arr.length]; }
        // a rocket from a launch site (the stage frame), rising to burst at a height between the site's two
        function launch(site) {
          if (rocket.length >= 10) return;
          var h = site.h0 + RNG() * (site.h1 - site.h0), r = RNG();
          rocket.push({ x: site.x + (RNG() - 0.5) * site.sx, y: site.y, z: site.z + (RNG() - 0.5) * site.sz, vx: (RNG() - 0.5) * 3, vy: site.vy * (0.9 + RNG() * 0.2), vz: (RNG() - 0.5) * 3,
            burstY: h, c: pick(pal), c2: RNG() < 0.45 ? pick(pal) : null, style: r < 0.22 ? 'ring' : r < 0.4 ? 'willow' : 'peony', big: site.big, trail: 0 });
          shells++;
        }
        function burst(r) {
          bursts++;
          var n = LOW || RM ? 38 : r.big ? 110 : 84, sp = r.big ? 30 : 21, i;
          FW.spawn(r.x, r.y, r.z, 0, 0, 0, 0.28, r.c, 1.6, r.big ? 22 : 13, 1, 0);       // the pop: one big short flash
          var willow = r.style === 'willow', ring = r.style === 'ring', ax = RNG() * TAU, ay = (RNG() - 0.5) * 1.2;
          for (i = 0; i < n; i++) {
            var u = RNG() * 2 - 1, th = RNG() * TAU, rr = sqrt(1 - u * u), dx = rr * cos(th), dy = u, dz = rr * sin(th);
            if (ring) { var ang = i / n * TAU, rx = cos(ang), rz = sin(ang) * sin(ay); dy = sin(ang) * cos(ay); dx = rx * cos(ax) - rz * sin(ax); dz = rx * sin(ax) + rz * cos(ax); }
            var s = sp * (willow ? 0.55 : 0.78 + RNG() * 0.22), cc = r.c2 && (i & 1) ? r.c2 : r.c;
            FW.spawn(r.x, r.y, r.z, dx * s, dy * s, dz * s, willow ? 2.8 + RNG() * 0.9 : 1.5 + RNG() * 0.9, willow ? GOLD : cc, willow ? 1.5 : 2.1, willow ? 0.9 : 0.85, willow ? 2.6 : 1.5, willow ? 4.0 : 7.0);
          }
        }
        function stepRockets(dt) {
          for (var i = rocket.length - 1; i >= 0; i--) {
            var r = rocket[i];
            r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt; r.vy -= 4 * dt; r.trail += dt;
            // the head (a hot dot a frame) and the trail (a gold spark every 30 ms)
            FW.spawn(r.x, r.y, r.z, 0, 0, 0, 0.1, WARM, 2.2, 1.6, 1, 0);
            while (r.trail >= 0.03) { r.trail -= 0.03; FW.spawn(r.x, r.y, r.z, (RNG() - 0.5) * 1.6, -2 - RNG() * 2, (RNG() - 0.5) * 1.6, 0.45 + RNG() * 0.3, GOLD, 1.3, 0.55, 1.2, 4); }
            if (r.y >= r.burstY || r.vy < 6) { burst(r); rocket.splice(i, 1); }
          }
        }
        // the launch sites in the stage frame: the pit building's roof just behind the podium (low, close bursts that the
        // podium shots frame) and the harbour barges (high, wide ones over the grandstand and the water)
        var SITE_PIT = { x: 0, y: 16.2, z: -31, sx: 70, sz: 6, h0: 34, h1: 62, vy: 58, big: false };
        // the city beyond the pit building (high bursts over the skyline, what the postcard from the water frames)
        var SITE_CITY = { x: 0, y: 16.2, z: -70, sx: 90, sz: 60, h0: 70, h1: 130, vy: 80, big: true };
        var NB = BARGES.length + FAR.length;
        function harbourSite() {
          var k = floor(RNG() * NB) % NB, b = k < BARGES.length ? BARGES[k] : FAR[k - BARGES.length], far = b[1] > 250;
          // (d is the world's, along the straight from the start line; the stage's own x is d less the stage's d)
          return { x: b[0] - d0, y: -1.2, z: b[1], sx: 4, sz: 4, h0: far ? 120 : 84, h1: far ? 170 : 128, vy: far ? 96 : 78, big: true };
        }
        function cannon(n) {
          var cols = [color('#FFFFFF'), color(ACC), GOLD, WARM].concat(pal.slice(3, 7));
          for (var side = -1; side <= 1; side += 2) {
            for (var i = 0; i < n; i++) {
              var sp = 8 + RNG() * 12;
              CF.spawn(side * 8.9, DK + 0.5, ZC + 0.4 + RNG() * 1.2, -side * sp * (0.25 + RNG() * 0.5), sp * (0.8 + RNG() * 0.45), (RNG() - 0.3) * sp * 0.35 + 1.5, 5.5 + RNG() * 3.5, pick(cols), 1.7, 0.13 + RNG() * 0.1, 0.7, 0);
            }
          }
          // (the big ones add a fan of glitter straight up from the front of the steps)
          if (n > 60) for (var j = 0; j < n; j++) CF.spawn((RNG() - 0.5) * 6, DK + 1.2, ZT + 0.3, (RNG() - 0.5) * 3, 7 + RNG() * 7, 1 + RNG() * 3, 4.5 + RNG() * 3, pick(cols), 1.7, 0.12 + RNG() * 0.09, 0.7, 0);
        }
        function showStep(dt) {
          tShow += dt;
          var rate = LOW || RM ? 0.95 : 0.5;
          if (tShow < tLen + 3.5) {
            while (nextShell <= tShow) {
              launch(LOW || RM || tShow < 0.9 ? SITE_PIT : (function (r) { return r < 0.3 ? harbourSite() : r < 0.5 ? SITE_CITY : SITE_PIT; })(RNG()));
              nextShell += rate * (0.7 + RNG() * 0.6) * (tShow > tLen * 0.7 ? 0.65 : 1);
            }
            // the finale: a volley of eight over a second and a half
            if (!finaled && tShow > tLen - 3.4) {
              finaled = true;
              for (var f = 0; f < (LOW || RM ? 3 : 8); f++) volley.push({ at: tShow + f * 0.18, site: LOW || RM ? SITE_PIT : f % 3 === 0 ? harbourSite() : f % 3 === 1 ? SITE_CITY : SITE_PIT });
            }
          }
          while (volley.length && volley[0].at <= tShow) launch(volley.shift().site);
          // the cannons: confetti from each end of the deck at the podium's beats (P3, P2, P1, the finale)
          while (vi < CANNON.length && CANNON[vi].at <= tShow) { cannon(CANNON[vi].n); vi++; }
          stepRockets(dt);
        }

        /* ------------------------------------------------------------------------------------- the API -- */
        function hide() {
          shown = false; active = false; group.visible = false; rocket.length = 0; volley.length = 0; FW.clear(); CF.clear(); group.userData.t = 0;
        }
        function play(id, o) {
          if (dead || id !== 'podium') return false;
          o = o || {};
          var R = typeof env.race === 'function' ? env.race() : null, order = null;
          try { order = R && typeof R.classification === 'function' ? R.classification().slice(0, 3) : null; } catch (e) { order = null; }
          pal = palette(order); paintFigures(order); helMesh.visible = true;
          plays++; RNG = rng(7 + plays * 131);
          tLen = clamp(num(o.len, num(o.length, 15)), 4, 40); tShow = 0; nextShell = 0.25; vi = 0; finaled = false;
          rocket.length = 0; volley.length = 0; FW.clear(); CF.clear();
          var big = tLen > 10 ? 130 : 110;
          CANNON = [{ at: 0.6, n: big * 0.5 }, { at: 2.0, n: big * 0.5 }, { at: 4.0, n: big * 0.6 }, { at: 6.0, n: big * 0.8 }, { at: max(7, tLen - 4.2), n: big * 1.6 }];
          CANNON.forEach(function (c) { c.n = floor(LOW || RM ? c.n * 0.4 : c.n); });
          lastR = R; lastT = 0; shown = true; active = true; group.visible = true; group.userData.t = 0; coneFade(null);
          return true;
        }
        // the cones' opacity: nothing when the camera is inside one (its distance to an axis under 1.5 m), full beyond 4 m
        var cl = [0, 0, 0];
        function coneFade(cam) {
          if (!matCone) return;
          var k = 1;
          if (cam) {
            var wx = cam.position.x - O.x, wz = cam.position.z - O.z; cl[0] = wx * TC - wz * TS; cl[1] = cam.position.y - O.y; cl[2] = wx * TS + wz * TC;
            for (var i = 0; i < CONES.length; i++) {
              var c = CONES[i], dx = c[3] - c[0], dy = c[4] - c[1], dz = c[5] - c[2], px = cl[0] - c[0], py = cl[1] - c[1], pz = cl[2] - c[2];
              var u = clamp((px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz), 0, 1), ex = px - dx * u, ey = py - dy * u, ez = pz - dz * u;
              k = min(k, clamp((sqrt(ex * ex + ey * ey + ez * ez) - 1.5) / 2.5, 0, 1));
            }
          }
          matCone.opacity = k;
        }
        function frame(dt, state, camera) {
          if (dead || !shown) return;
          var R = typeof env.race === 'function' ? env.race() : null, t = state && isFinite(state.t) ? +state.t : null;
          // (a new race, the demo, the debug hooks' own go(): the stage goes; so does a podium nobody has left in 90 s)
          if ((R && lastR && R !== lastR) || (t != null && t < lastT - 0.5) || tShow > 90 + tLen) { hide(); return; }
          lastR = R; if (t != null) lastT = t;
          dt = clamp(dt, 0, 0.05);
          if (dt > 0) {
            if (active) { showStep(dt); if (tShow > tLen + 8 && !FW.live() && !CF.live() && !rocket.length) active = false; }
            if (FW.live() || rocket.length) stepFW(FW, dt, tShow, !LOW);
            if (CF.live()) stepConfetti(CF, dt, tShow);
            group.userData.t = tShow;
          }
          // the points' pixel scale: the camera's lens and the drawing buffer's height
          var cam = camera || env.camera;
          coneFade(cam);
          if (cam && (FW.live() || CF.live() || rocket.length)) {
            var hpx = 720;
            try { vec = vec || new X3.Vector2(); renderer.getDrawingBufferSize(vec); hpx = vec.y || 720; } catch (e) { /* the default */ }
            var sc = hpx / (2 * Math.tan(clamp(num(cam.fov, 60), 10, 120) * PI / 360)), mx = LOW ? 48 : 96;
            FW.mat.uniforms.uScale.value = sc; FW.mat.uniforms.uMaxPx.value = mx; CF.mat.uniforms.uScale.value = sc; CF.mat.uniforms.uMaxPx.value = mx * 0.4;
          }
        }
        // a new race's first light or go: the stage goes at once (frame() would notice a frame later)
        function event(e) { if (shown && e && (e.e === 'light' || e.e === 'go')) hide(); }
        function anchor() { return { d: d0, lat: ZC, up: PLACE.up }; }
        function spot(k) { var st = STEPS[k]; return st ? W(st.x, DK + st.h, ZC) : null; }
        // the cut-swap: helmets on for the arrival, off for the close-ups
        function helmets(on) { helMesh.visible = on !== false; }
        function dispose() {
          dead = true; hide();
          if (group.parent) group.parent.remove(group);
          disposables.forEach(function (o) { try { o.dispose(); } catch (e) { /* gone */ } });
          disposables.length = 0;
        }
        function state() {
          return { shown: shown, active: active, t: +tShow.toFixed(2), len: tLen, shells: shells, bursts: bursts, rockets: rocket.length, sparks: FW.live(), confetti: CF.live(), plays: plays,
            at: [+O.x.toFixed(2), +O.y.toFixed(2), +O.z.toFixed(2)], heading: +HD.toFixed(4), tris: S.count() + GL.count() };
        }
        return { event: event, frame: frame, play: play, anchor: anchor, spot: spot, helmets: helmets, state: state, dispose: dispose };
      }
      return { stage: stage };
    })();
