    /* ==================================================== the kart items == */
    // Included into the kart kit (kart.js), and so only into a kart world's runtime: Meme Kart's items, every one built
    // in code (no images, no fonts, no downloads), here once for every kart world, so a world (and a Mog of it) gets the
    // items with the race. The race (kartSim) says what an item does; this says what it looks like: its model, its
    // effects (one shared program for everything see-through, gm-item-fx, and one 512 px atlas of particles in two
    // draw calls), its 128 px icon for the HUD's slot, and the FUD Cloud's haze round the screen's edges.
    //
    //   kartItemsLib().build.<id>(THREE, { toon, kit, ... })   a THREE.Group; group.userData.item = { id, cls, tris,
    //                                                          draws, parts, animate(t, state), ... }
    //   .ItemFX(THREE, opts), .Ribbon(THREE, n), .VFX[id], .play(fx, spec, at, o), .icon(ctx, id, size), .iconCanvas,
    //   .paintFudEdge(ctx, w, h, o)                            the FUD Cloud's haze, the edges only (7 Oct, round 3)
    //   kartItemMount(racer id, box)                           where each item sits on a racer's kart (below)
    //
    // The ids: airdrop (the crate), gmbag, rug, wallet, laser, pump, wow, fud, whale (WHALE DUMP, not the racer),
    // diamond, moon. Built in the kart's own frame: metres, +Z forward, +Y up, the ground between the axles at the
    // origin. Colour by class: attack magenta-red, trap purple, defence cyan, boost gold-green; nothing draws a brand,
    // a coin's logo or another kart racer's item. Each racer's solid parts are the roster's toon program (gm-kart-toon).
    // The library is built the first time a race needs an item, not on every boot of a kart world.
    var KITEMS;   // (declared, never assigned at this line: see kartItemsLib)
    function kartItemsLib() {
      if (KITEMS) return KITEMS;
      var KI = {};
      (function (root) {
        'use strict';
        const { sin, cos, PI, sqrt, abs, min, max, hypot, atan2, floor, pow, exp } = Math;
        const TAU = PI * 2;
        const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
        const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
        const lerp = (a, b, t) => a + (b - a) * t;
        const sstep = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
        const smin = (a, b, k) => { const h = sat(0.5 + 0.5 * (b - a) / k); return b + (a - b) * h - k * h * (1 - h); };
        function rng(seed) { let s = ((seed || 1) * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

        /* ------------------------------------------------------------------ palette (sRGB hex; converted per THREE) */
        const PAL = {
          attack: '#FF2E63', trap: '#9B5CFF', defence: '#3FE0FF', boost: '#C8F23C',
          gold: '#FFC93C', goldDk: '#C8871A', goldHi: '#FFE68A', mint: '#5CFFC0', magenta: '#FF3EA5',
          up: '#2BE07A', down: '#FF3B5C', ink: '#1B1330', cream: '#F6EEDC', road: '#3E4256',
        };
        const ITEMS = [
          { id: 'airdrop', name: 'Airdrop', cls: 'pickup' },
          { id: 'gmbag', name: 'GM Bag', cls: 'boost' },
          { id: 'rug', name: 'Rug Pull', cls: 'trap' },
          { id: 'wallet', name: 'Cold Wallet', cls: 'defence' },
          { id: 'laser', name: 'Laser Eyes', cls: 'attack' },
          { id: 'pump', name: 'Pump', cls: 'boost' },
          { id: 'wow', name: 'Much Wow', cls: 'boost' },
          { id: 'fud', name: 'FUD Cloud', cls: 'attack' },
          { id: 'whale', name: 'WHALE DUMP', cls: 'attack' },
          { id: 'diamond', name: 'Diamond Hands', cls: 'defence' },
          { id: 'moon', name: 'To The Moon', cls: 'boost' },
        ];
        const CLS = { attack: PAL.attack, trap: PAL.trap, defence: PAL.defence, boost: PAL.boost, pickup: '#B98CFF' };

        // kz presets: (roughness, warm terminator, zone, ao). zone 0 plain, 2 glow (diffuse x3 emissive), 3 fabric, 4 matte
        const KZ = {
          paint: [0.32, 0, 0, 1], gloss: [0.2, 0, 0, 1], satin: [0.45, 0, 0, 1], matte: [0.8, 0, 0, 1], rubber: [0.86, 0, 0, 1],
          gold: [0.24, 0, 0, 1], metal: [0.3, 0, 0, 1], cloth: [0.85, 0.5, 0, 1], skin: [0.42, 1, 0, 1], glow: [0.5, 0, 2, 1],
          flat: [0.9, 0, 4, 1],
        };

        /* ------------------------------------------------------------------ the geometry kit */
        function kit(THREE) {
          const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
          const col = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
          const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
          const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
          const M = (p, r, s) => {
            s = s === undefined ? 1 : s;
            return new THREE.Matrix4().compose(V3(p || [0, 0, 0]), new THREE.Quaternion().setFromEuler(new THREE.Euler((r || [0, 0, 0])[0], (r || [0, 0, 0])[1], (r || [0, 0, 0])[2], (r && r[3]) || 'YXZ')), Array.isArray(s) ? V3(s) : new THREE.Vector3(s, s, s));
          };
          // rounded box: f flat + q round segments per half-axis (per axis); smooth analytic normals
          function rbox(w, h, d, r, seg) {
            seg = seg || [[1, 1], [1, 1], [1, 1]];
            const S = seg.map((s) => 2 * (s[0] + s[1]));
            const g = new THREE.BoxGeometry(2, 2, 2, S[0], S[1], S[2]);
            const P = g.attributes.position, N = g.attributes.normal, half = [w / 2, h / 2, d / 2];
            const map = (c, ax) => {
              const [f, q] = seg[ax], n = f + q, a = abs(c) * n, hh = half[ax], rr = min(r, hh);
              const p = a <= f ? (f ? (a / f) * (hh - rr) : 0) : hh - rr + ((a - f) / q) * rr;
              return Math.sign(c) * p;
            };
            for (let i = 0; i < P.count; i++) {
              const p = [map(P.getX(i), 0), map(P.getY(i), 1), map(P.getZ(i), 2)];
              const inner = p.map((v, k) => clamp(v, -(half[k] - min(r, half[k])), half[k] - min(r, half[k])));
              const o = p.map((v, k) => v - inner[k]), l = hypot(o[0], o[1], o[2]);
              if (l > 1e-7) { P.setXYZ(i, inner[0] + (o[0] / l) * r, inner[1] + (o[1] / l) * r, inner[2] + (o[2] / l) * r); N.setXYZ(i, o[0] / l, o[1] / l, o[2] / l); }
              else P.setXYZ(i, p[0], p[1], p[2]);
            }
            return g;
          }
          // a tube along a polyline with per-point radii (rx sideways, ry up), optional end caps
          function tube(pts, rx, ry, radial, up, caps) {
            up = up || [0, 1, 0]; ry = ry || rx;
            const n = pts.length, P = [], N = [], I = [];
            const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], nrm = (a) => { const l = hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
            const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
            const R = (a, i) => (typeof a === 'number' ? a : a[i]);
            let prevSide = null;
            for (let i = 0; i < n; i++) {
              const T = nrm(sub(pts[min(n - 1, i + 1)], pts[max(0, i - 1)]));
              let sd = cross(T, up); if (hypot(sd[0], sd[1], sd[2]) < 1e-4) sd = prevSide || [1, 0, 0]; sd = nrm(sd); prevSide = sd;
              const u = cross(sd, T);
              for (let j = 0; j < radial; j++) {
                const a = (j / radial) * TAU, ca = cos(a), sa = sin(a), x = R(rx, i), y = R(ry, i);
                P.push(pts[i][0] + sd[0] * ca * x + u[0] * sa * y, pts[i][1] + sd[1] * ca * x + u[1] * sa * y, pts[i][2] + sd[2] * ca * x + u[2] * sa * y);
                const kx = ca / max(x, 1e-4), ky = sa / max(y, 1e-4);
                N.push(...nrm([sd[0] * kx + u[0] * ky, sd[1] * kx + u[1] * ky, sd[2] * kx + u[2] * ky]));
              }
            }
            for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
              const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
              I.push(a, c, b, b, c, d);
            }
            if (caps) for (const [ring, dir] of [[0, -1], [n - 1, 1]]) {
              const T = nrm(sub(pts[min(n - 1, ring + 1)], pts[max(0, ring - 1)])), ci = P.length / 3;
              P.push(pts[ring][0] + T[0] * dir * R(rx, ring) * 0.6, pts[ring][1] + T[1] * dir * R(rx, ring) * 0.6, pts[ring][2] + T[2] * dir * R(rx, ring) * 0.6);
              N.push(T[0] * dir, T[1] * dir, T[2] * dir);
              for (let j = 0; j < radial; j++) { const a = ring * radial + j, b = ring * radial + ((j + 1) % radial); if (dir > 0) I.push(a, b, ci); else I.push(b, a, ci); }
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setIndex(I);
            return g;
          }
          // round the corners of a polyline (2D or 3D) with n arc points of radius r at each interior vertex
          function roundPoly(pts, r, n) {
            const out = [pts[0]];
            for (let i = 1; i < pts.length - 1; i++) {
              const a = pts[i - 1], b = pts[i], c = pts[i + 1], D = a.length;
              const da = a.map((v, k) => v - b[k]), dc = c.map((v, k) => v - b[k]);
              const la = hypot(...da), lc = hypot(...dc), rr = min(r, la * 0.45, lc * 0.45);
              const p0 = b.map((v, k) => v + (da[k] / la) * rr), p1 = b.map((v, k) => v + (dc[k] / lc) * rr);
              for (let j = 0; j <= n; j++) { const t = j / n, u = 1 - t; out.push([...Array(D).keys()].map((k) => u * u * p0[k] + 2 * u * t * b[k] + t * t * p1[k])); }
            }
            out.push(pts[pts.length - 1]);
            return out;
          }
          const lathe = (pts, seg, phi0, phiLen) => new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg, phi0 || 0, phiLen || TAU);
          const extrude = (shape, depth, bevel, curve) => {
            const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: !!bevel, bevelThickness: bevel || 0, bevelSize: bevel || 0, bevelSegments: 1, curveSegments: curve || 6 });
            g.translate(0, 0, -depth / 2); return g;
          };
          const shape = (pts) => { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath(); return s; };
          // flat-shade a geometry (non-indexed, face normals) and give each triangle barycentric corners
          function flat(g) { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); return n; }
          return { V3, col, mix, mul, M, rbox, tube, roundPoly, lathe, extrude, shape, flat };
        }

        /* ------------------------------------------------------------------ accumulators */
        class Acc {   // gm-kart-toon vertices: position, normal, color, kz
          constructor() { this.P = []; this.N = []; this.C = []; this.K = []; this.I = []; this.n = 0; this.k = KZ.paint; this.parts = {}; this._m = 0; }
          v(x, y, z, nx, ny, nz, r, g, b) {   // the endo polygonize interface
            this.P.push(x, y, z); this.N.push(nx, ny, nz); this.C.push(r, g === undefined ? r : g, b === undefined ? r : b);
            this.K.push(this.k[0], this.k[1], this.k[2], this.k[3]); return this.n++;
          }
          add(THREE, geo, m, col, k) {
            const pos = geo.attributes.position, nor = geo.attributes.normal, nm = new THREE.Matrix3().getNormalMatrix(m);
            const base = this.n, v = new THREE.Vector3(), w = new THREE.Vector3(), n = new THREE.Vector3(), flip = m.determinant() < 0;
            for (let i = 0; i < pos.count; i++) {
              v.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i); w.copy(v).applyMatrix4(m);
              const c = typeof col === 'function' ? col(v.x, v.y, v.z, n.x, n.y, n.z, w.x, w.y, w.z) : col;
              const kk = typeof k === 'function' ? k(v.x, v.y, v.z, n.x, n.y, n.z) : (k || KZ.paint);
              n.applyMatrix3(nm).normalize();
              this.P.push(w.x, w.y, w.z); this.N.push(n.x, n.y, n.z); this.C.push(c[0], c[1], c[2]); this.K.push(kk[0], kk[1], kk[2], kk[3]); this.n++;
            }
            const idx = geo.index, cnt = idx ? idx.count : pos.count;
            for (let i = 0; i < cnt; i += 3) {
              const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
              if (flip) this.I.push(base + a, base + c, base + b); else this.I.push(base + a, base + b, base + c);
            }
            return this;
          }
          mark(name) { this.parts[name] = (this.parts[name] || 0) + (this.I.length / 3 - this._m); this._m = this.I.length / 3; }
          get tris() { return this.I.length / 3; }
          geometry(THREE) {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
            g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3)); g.setAttribute('kz', new THREE.Float32BufferAttribute(this.K, 4));
            g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
            g.computeBoundingSphere(); return g;
          }
        }
        class FxAcc {   // gm-item-fx vertices: position, normal, fz = (mode, a, b, c), aShard = (shard centre xyz, random)
          constructor(seed) { this.P = []; this.N = []; this.F = []; this.S = []; this.n = 0; this.r = rng(seed || 7); }
          // geo is flattened to triangles; fz(i, corner) may return the per-vertex 4-vector; every triangle is a shard
          add(THREE, geo, m, fz, keepTri) {
            const g = geo.index ? geo.toNonIndexed() : geo, pos = g.attributes.position, nor = g.attributes.normal;
            const nm = new THREE.Matrix3().getNormalMatrix(m), flip = m.determinant() < 0;
            const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], n = new THREE.Vector3();
            for (let t = 0; t < pos.count; t += 3) {
              for (let c = 0; c < 3; c++) v[c].fromBufferAttribute(pos, t + c).applyMatrix4(m);
              const cx = (v[0].x + v[1].x + v[2].x) / 3, cy = (v[0].y + v[1].y + v[2].y) / 3, cz = (v[0].z + v[1].z + v[2].z) / 3;
              if (keepTri && !keepTri(cx, cy, cz)) continue;
              const rr = this.r(), order = flip ? [0, 2, 1] : [0, 1, 2];
              for (const c of order) {
                n.fromBufferAttribute(nor, t + c).applyMatrix3(nm).normalize();
                this.P.push(v[c].x, v[c].y, v[c].z); this.N.push(n.x, n.y, n.z);
                const f = typeof fz === 'function' ? fz(c, v[c]) : [fz[0], c === 0 ? 1 : 0, c === 1 ? 1 : 0, c === 2 ? 1 : 0];
                this.F.push(f[0], f[1], f[2], f[3]); this.S.push(cx, cy, cz, rr); this.n++;
              }
            }
            return this;
          }
          get tris() { return this.n / 3; }
          geometry(THREE) {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
            g.setAttribute('fz', new THREE.Float32BufferAttribute(this.F, 4)); g.setAttribute('aShard', new THREE.Float32BufferAttribute(this.S, 4));
            g.computeBoundingSphere(); return g;
          }
        }

        /* ------------------------------------------------------------------ the gm-item-fx material (one program)
         * fz.x = mode: 0 holo (thin-film iridescence + scanlines + panel edges; fz.y = half extent), 1 ice (frost, facet
         * edges from barycentrics fz.yzw, cracks from uHit/uCrack), 2 prism (diamond dispersion, facet edges), 3 flame
         * (fz.y = 0 nozzle -> 1 tip, noise scrolled), 4 glow (unlit hot core), 5 ribbon (fz.y along 0 head -> 1 tail,
         * fz.z across -1..1), 6 ground shadow + warning ring (uRing), 7 splash ring (uRing = radius 0..1).
         * uBurst > 0 throws every triangle out of its centre (aShard) with spin and gravity: the shatter. */
        const FX_VERT = `
          attribute vec4 fz; attribute vec4 aShard;
          uniform float uBurst;
          varying vec3 vN; varying vec3 vV; varying vec3 vObj; varying vec3 vW; varying vec4 vFz; varying float vFade;
          vec3 rot( vec3 v, vec3 ax, float a ) { return v * cos( a ) + cross( ax, v ) * sin( a ) + ax * dot( ax, v ) * ( 1.0 - cos( a ) ); }
          void main() {
            vec3 p = position, n = normal; vFade = 1.0;
            if ( uBurst > 0.0 ) {
              vec3 c = aShard.xyz; float r = aShard.w, t = uBurst;
              vec3 dir = normalize( c + vec3( 0.0, 0.25, 0.0 ) );
              vec3 ax = normalize( vec3( r - 0.5, 0.7, fract( r * 7.31 ) - 0.5 ) ); float a = t * ( 5.0 + 9.0 * r );
              p = c + rot( ( p - c ) * ( 1.0 - 0.35 * t ), ax, a ) + dir * t * ( 1.6 + 2.2 * r ) + vec3( 0.0, 1.4 * t - 3.2 * t * t, 0.0 );
              n = rot( n, ax, a ); vFade = 1.0 - smoothstep( 0.45, 1.0, t );
            }
            #ifdef USE_INSTANCING
        mat4 mm = modelMatrix * instanceMatrix;
      #else
        mat4 mm = modelMatrix;
      #endif
      vec4 wp = mm * vec4( p, 1.0 );
            vW = wp.xyz; vObj = p; vFz = fz;
            vN = normalize( mat3( mm ) * n ); vV = cameraPosition - wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`;
        const FX_FRAG = `
          uniform float uTime; uniform float uCrack; uniform float uAlpha; uniform float uRing; uniform vec3 uTint; uniform vec3 uTint2; uniform vec3 uHit;
          varying vec3 vN; varying vec3 vV; varying vec3 vObj; varying vec3 vW; varying vec4 vFz; varying float vFade;
          float h3( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
          float n3( vec3 x ) { vec3 i = floor( x ); vec3 f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
            return mix( mix( mix( h3( i ), h3( i + vec3( 1, 0, 0 ) ), f.x ), mix( h3( i + vec3( 0, 1, 0 ) ), h3( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
                        mix( mix( h3( i + vec3( 0, 0, 1 ) ), h3( i + vec3( 1, 0, 1 ) ), f.x ), mix( h3( i + vec3( 0, 1, 1 ) ), h3( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z ); }
          vec3 film( float x ) { return 0.5 + 0.5 * cos( 6.28318 * ( x + vec3( 0.0, 0.33, 0.67 ) ) ); }
          vec3 hue( float h ) { return clamp( abs( fract( h + vec3( 0.0, 2.0 / 3.0, 1.0 / 3.0 ) ) * 6.0 - 3.0 ) - 1.0, 0.0, 1.0 ); }
          vec2 vor( vec3 p ) { vec3 i = floor( p ), f = fract( p ); float d1 = 8.0, d2 = 8.0;
            for ( int z = -1; z <= 1; z++ ) for ( int y = -1; y <= 1; y++ ) for ( int x = -1; x <= 1; x++ ) {
              vec3 g = vec3( float( x ), float( y ), float( z ) ); vec3 o = vec3( h3( i + g ), h3( i + g + 11.3 ), h3( i + g + 27.1 ) );
              vec3 r = g + o - f; float d = dot( r, r ); if ( d < d1 ) { d2 = d1; d1 = d; } else if ( d < d2 ) d2 = d; }
            return vec2( sqrt( d1 ), sqrt( d2 ) - sqrt( d1 ) ); }
          void main() {
            vec3 N = normalize( vN ), V = normalize( vV );
            if ( !gl_FrontFacing ) N = -N;
            float nv = clamp( dot( N, V ), 0.0, 1.0 ), fr = pow( 1.0 - nv, 3.0 );
            int mode = int( vFz.x + 0.5 );
            vec3 col = vec3( 0.0 ); float a = 1.0, pm = 0.0;
            if ( mode == 0 ) {
              float x = nv * 1.25 + vObj.y * 0.9 + vObj.x * 0.35 + uTime * 0.12;
              float scan = 0.5 + 0.5 * sin( vW.y * 70.0 - uTime * 5.0 );
              col = mix( film( x ), vec3( 1.0 ), 0.12 ) * ( 0.55 + 2.0 * fr ) + uTint * 0.22 * scan;
              a = 0.2 + 0.62 * fr + 0.05 * scan;
              vec3 q = abs( vObj ) / vFz.y; float m1 = max( q.x, max( q.y, q.z ) );
              float m2 = q.x + q.y + q.z - m1 - min( q.x, min( q.y, q.z ) );
              float e = smoothstep( 0.8, 0.97, m2 );
              col += vec3( 1.0, 0.95, 0.85 ) * e * 1.6; a = max( a, e * 0.9 );
            } else if ( mode == 1 ) {
              float fr2 = pow( 1.0 - nv, 2.0 );
              float fro = n3( vObj * 9.0 ) * 0.6 + n3( vObj * 23.0 ) * 0.4;
              col = mix( vec3( 0.45, 0.85, 1.0 ), vec3( 1.0 ), fro * 0.55 ) * ( 0.3 + 1.5 * fr2 );
              a = 0.1 + 0.55 * fr2 + 0.2 * fro * fro;
              float be = min( min( vFz.y, vFz.z ), vFz.w );
              float edge = 1.0 - smoothstep( 0.0, 0.03 + 0.03 * ( 1.0 - nv ), be );
              col += vec3( 0.75, 0.97, 1.0 ) * edge * 1.4; a = max( a, edge * 0.8 );
              if ( uCrack > 0.0 ) {
                vec2 v = vor( vObj * 3.2 ); float line = 1.0 - smoothstep( 0.0, 0.05, v.y );
                float reach = smoothstep( uCrack * 2.6, uCrack * 2.6 - 0.35, distance( vObj, uHit ) );
                col += vec3( 2.2, 2.6, 3.0 ) * line * reach; a = max( a, line * reach );
              }
            } else if ( mode == 2 ) {
              vec3 R = reflect( -V, N );
              float d = dot( R, normalize( vec3( 0.3, 0.8, 0.5 ) ) );
              vec3 disp = hue( fract( d * 1.4 + nv * 0.9 + uTime * 0.1 + h3( floor( N * 4.0 ) ) ) );
              col = mix( vec3( 0.8, 0.94, 1.0 ), disp, 0.7 ) * ( 0.45 + 2.6 * pow( max( d, 0.0 ), 5.0 ) + 1.3 * fr );
              a = 0.32 + 0.5 * fr;
              float be = min( min( vFz.y, vFz.z ), vFz.w ); float edge = 1.0 - smoothstep( 0.0, 0.06, be );
              col += vec3( 1.2, 1.3, 1.4 ) * edge; a = max( a, edge * 0.85 );
            } else if ( mode == 3 ) {
              float t = vFz.y;
              float n = n3( vec3( vObj.x * 7.0, vObj.y * 7.0, vObj.z * 2.5 - uTime * 16.0 ) ) * 0.6 + n3( vec3( vObj.xy * 15.0, vObj.z * 5.0 - uTime * 26.0 ) ) * 0.4;
              float core = pow( nv, 1.4 );
              col = mix( uTint2, uTint, smoothstep( 0.0, 0.55, t * 0.8 + ( 1.0 - core ) * 0.5 ) ) * ( 2.2 + 2.5 * core );
              a = core * ( 1.0 - smoothstep( 0.3, 1.0, t + n * 0.4 ) ) * uAlpha;
              pm = 1.0;
            } else if ( mode == 4 ) {
              float c = pow( nv, 1.6 );
              col = mix( uTint * 2.0, vec3( 3.0, 2.6, 2.6 ), pow( nv, 6.0 ) * vFz.y ) * ( 1.0 + 2.5 * c );
              a = c * uAlpha * vFade; pm = 1.0;
            } else if ( mode == 5 ) {
              float w = 1.0 - vFz.z * vFz.z, t = vFz.y;
              col = mix( vec3( 3.2, 3.0, 3.0 ), uTint * 2.6, smoothstep( 0.0, 0.6, 1.0 - w * w + t * 0.6 ) );
              a = w * w * ( 1.0 - t ) * uAlpha; pm = 1.0;
            } else if ( mode == 6 ) {
              float r = length( vObj.xy );
              float sh = 1.0 - smoothstep( 0.55, 1.0, r );
              float ring = 1.0 - smoothstep( 0.0, 0.035, abs( r - ( 1.0 - fract( uTime * 1.4 ) * 0.7 ) ) );
              float rim = 1.0 - smoothstep( 0.0, 0.025, abs( r - 0.97 ) );
              col = mix( vec3( 0.03, 0.0, 0.05 ), uTint * 2.5, max( ring * uRing, rim * uRing ) );
              a = max( sh * 0.72, max( ring, rim ) * uRing ) * uAlpha;
            } else {
              float r = length( vObj.xy ); float n = n3( vec3( vObj.xy * 9.0, uTime * 3.0 ) );
              float band = 1.0 - smoothstep( 0.0, 0.08 + 0.1 * uRing, abs( r - uRing + n * 0.06 ) );
              float inner = ( 1.0 - smoothstep( 0.0, uRing, r ) ) * 0.25 * ( 1.0 - uRing );
              col = mix( uTint, vec3( 1.6 ), n ) * 1.4;
              a = ( band * ( 0.55 + 0.45 * n ) + inner ) * uAlpha;
            }
            gl_FragColor = pm > 0.5 ? vec4( col * a, a ) : vec4( col, a * uAlpha * vFade );
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`;
        function fxMaterial(THREE, o) {
          o = o || {};
          const m = new THREE.ShaderMaterial({
            uniforms: {
              uTime: { value: 0 }, uBurst: { value: 0 }, uCrack: { value: 0 }, uAlpha: { value: o.alpha === undefined ? 1 : o.alpha }, uRing: { value: 0 },
              uTint: { value: new THREE.Color(o.tint || '#ffffff') }, uTint2: { value: new THREE.Color(o.tint2 || '#ffffff') }, uHit: { value: new THREE.Vector3(0, 0, 1) },
            },
            vertexShader: FX_VERT, fragmentShader: FX_FRAG, transparent: true, depthWrite: false, side: o.side === undefined ? THREE.DoubleSide : o.side,
            blending: o.additive ? THREE.CustomBlending : THREE.NormalBlending,
          });
          // (added light is the same drawn in either order: drawn once, not back then front, a draw call saved)
          if (o.additive) { m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; m.blendEquation = THREE.AddEquation; m.forceSinglePass = true; }
          m.customProgramCacheKey = () => 'gm-item-fx';
          return m;
        }
        function needToon(THREE, o) {
          if (o && o.toon) return o.toon;
          return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 });
        }
        function finish(THREE, id, group, parts, extra) {
          let tris = 0, draws = 0; const fx = [];
          group.traverse((m) => { if (m.isMesh) { draws++; const g = m.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3 * (m.isInstancedMesh ? m.count : 1); if (m.material && m.material.uniforms && m.material.uniforms.uBurst) fx.push(m.material); } });
          group.userData.item = Object.assign({ id, cls: (ITEMS.find((i) => i.id === id) || {}).cls, tris: Math.round(tris), draws, parts, fx, animate() {} }, extra || {});
          return group;
        }
        const toonMesh = (THREE, acc, toon, shadow) => { const m = new THREE.Mesh(acc.geometry(THREE), toon); m.castShadow = shadow !== false; m.receiveShadow = true; return m; };
        const fxMesh = (THREE, acc, mat, order) => { const m = new THREE.Mesh(acc.geometry(THREE), mat); m.renderOrder = order || 2; m.castShadow = false; return m; };

        /* ------------------------------------------------------------------ glyph shapes (original marks) */
        function gmShapes(THREE) {   // a chunky G and M, unit cap height, centred on (0,0): the GM coin emboss
          const G = new THREE.Shape(), R = 0.5, r = 0.29, a0 = 0.8, yb = -0.16, xb = 0.06;
          G.moveTo(R * cos(a0), R * sin(a0));
          G.absarc(0, 0, R, a0, TAU, false);
          G.lineTo(xb, 0); G.lineTo(xb, yb);
          const ab = TAU + Math.asin(yb / r);
          G.lineTo(r * cos(ab), yb);
          G.absarc(0, 0, r, ab, a0, true);
          G.closePath();
          const M = new THREE.Shape([[-0.42, -0.5], [-0.24, -0.5], [-0.24, 0.12], [-0.05, -0.2], [0.05, -0.2], [0.24, 0.12], [0.24, -0.5], [0.42, -0.5], [0.42, 0.5], [0.23, 0.5], [0, 0.1], [-0.23, 0.5], [-0.42, 0.5]].map((p) => new THREE.Vector2(p[0], p[1])));
          return { G, M };
        }
        function parachuteShapes(THREE) {   // canopy with three scallops, four cords, a little crate: the airdrop glyph
          const can = new THREE.Shape();
          can.moveTo(0.5, 0.0); can.absellipse(0, 0, 0.5, 0.42, 0, PI, false);
          const xs = [-0.5, -1 / 6, 1 / 6, 0.5];
          for (let i = 0; i < 3; i++) can.quadraticCurveTo((xs[i] + xs[i + 1]) / 2, 0.13, xs[i + 1], 0);
          const cords = [];
          const box = [-0.13, -0.66, 0.13, -0.42];
          const ends = [[-0.5, 0], [-1 / 6, 0], [1 / 6, 0], [0.5, 0]], tops = [[box[0] + 0.02, box[3]], [-0.04, box[3]], [0.04, box[3]], [box[2] - 0.02, box[3]]];
          for (let i = 0; i < 4; i++) {
            const [x0, y0] = ends[i], [x1, y1] = tops[i], dx = x1 - x0, dy = y1 - y0, l = hypot(dx, dy), nx = (-dy / l) * 0.022, ny = (dx / l) * 0.022;
            cords.push(new THREE.Shape([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]].map((p) => new THREE.Vector2(p[0], p[1]))));
          }
          const bx = new THREE.Shape(), rr = 0.035;
          bx.moveTo(box[0] + rr, box[1]); bx.lineTo(box[2] - rr, box[1]); bx.quadraticCurveTo(box[2], box[1], box[2], box[1] + rr);
          bx.lineTo(box[2], box[3] - rr); bx.quadraticCurveTo(box[2], box[3], box[2] - rr, box[3]); bx.lineTo(box[0] + rr, box[3]);
          bx.quadraticCurveTo(box[0], box[3], box[0], box[3] - rr); bx.lineTo(box[0], box[1] + rr); bx.quadraticCurveTo(box[0], box[1], box[0] + rr, box[1]);
          return { can, cords, box: bx };
        }
        const arrowPts = [[-0.13, 0.5], [0.13, 0.5], [0.13, 0.02], [0.32, 0.02], [0, -0.48], [-0.32, 0.02], [-0.13, 0.02]];

        /* ================================================================== 1. AIRDROP crate */
        function airdrop(THREE, o) {
          o = o || {}; const K = kit(THREE), toon = needToon(THREE, o), acc = new Acc(), fa = new FxAcc(11);
          const S = o.size || 0.78, h = S / 2, b = 0.085, e = h - b / 2;
          const white = K.col('#F4F1FF'), lilac = K.col('#CFC4F2'), gold = K.col(PAL.gold), goldDk = K.col(PAL.goldDk), glyph = K.col('#FFC93C'), glyphDk = K.col('#D08A12');
          // the frame: 12 pearl beams (octagonal, smooth-normal) and 8 gold corner knuckles
          for (let ax = 0; ax < 3; ax++) for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
            const p = [0, 0, 0], dims = [b, b, b], seg = [[0, 1], [0, 1], [0, 1]];
            dims[ax] = S - b; p[(ax + 1) % 3] = s1 * e; p[(ax + 2) % 3] = s2 * e;
            acc.add(THREE, K.rbox(dims[0], dims[1], dims[2], 0.03, seg), K.M(p), (x, y, z, nx, ny, nz, wx, wy) => K.mix(lilac, white, sstep(-h, h, wy) * 0.7 + 0.3 * sat(ny)), KZ.gloss);
          }
          acc.mark('frame');
          for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
            acc.add(THREE, K.rbox(0.135, 0.135, 0.135, 0.05, [[0, 1], [0, 1], [0, 1]]), K.M([sx * e, sy * e, sz * e]), (x, y, z, nx, ny) => K.mix(goldDk, gold, 0.55 + 0.45 * ny), KZ.gold);
          acc.mark('corners');
          // the glyph (original "parachute drop"), glowing gold, on all four sides
          const P = parachuteShapes(THREE), gs = 0.44;
          const gGeo = [K.extrude(P.can, 0.014, 0, 5), ...P.cords.map((c) => K.extrude(c, 0.012, 0)), K.extrude(P.box, 0.014, 0, 2)];
          for (let f = 0; f < 4; f++) {
            const yaw = (f * PI) / 2, d = h - 0.012;
            const m = K.M([sin(yaw) * d, 0.07, cos(yaw) * d], [0, yaw, 0], gs);
            for (const g of gGeo) acc.add(THREE, g, m, (x, y, z, nx, ny, nz) => K.mix(glyphDk, glyph, 0.55 + 0.45 * nz), KZ.gold);
          }
          acc.mark('glyph');
          // the holographic box: one iridescent rounded shell (thin-film hue by view angle, scanlines, bright panel edges)
          const shell = K.rbox(S - 0.05, S - 0.05, S - 0.05, 0.05, [[1, 1], [1, 1], [1, 1]]);
          fa.add(THREE, shell, K.M([0, 0, 0]), (c) => [0, h - 0.025, 0, 0]);
          const holo = fxMaterial(THREE, { tint: '#B98CFF' });
          const group = new THREE.Group(), body = new THREE.Group();
          body.add(toonMesh(THREE, acc, toon), fxMesh(THREE, fa, holo, 3));
          group.add(body);
          const parts = Object.assign({}, acc.parts, { holo: fa.tris });
          return finish(THREE, 'airdrop', group, parts, {
            body, hover: o.hover === undefined ? 1.05 : o.hover,
            animate(t) {   // bob 0.12 m, spin 1.4 rad/s, a slow tilt; the shell's film drifts
              body.position.y = this.hover + 0.12 * sin(2.2 * t);
              body.rotation.set(0.1 * sin(1.3 * t), 1.4 * t, 0.08 * cos(1.1 * t));
              holo.uniforms.uTime.value = t;
            },
          });
        }

        /* ================================================================== 2. GM BAG */
        function gmCoin(THREE, K, acc, m, emboss, r) {
          r = r || 0.13;
          const gold = K.col(PAL.gold), dk = K.col(PAL.goldDk), hi = K.col(PAL.goldHi), th = r * 0.24;
          // a coin = a lathe with a raised rim and a sunken field
          const prof = [[0, th * 0.34], [r * 0.8, th * 0.34], [r * 0.9, th * 0.5], [r, th * 0.42], [r, -th * 0.42], [r * 0.9, -th * 0.5], [0, -th * 0.5]];
          const g = K.lathe(prof, 16); g.rotateX(PI / 2);
          acc.add(THREE, g, m, (x, y, z, nx, ny, nz) => { const rr = hypot(x, y) / r; return rr > 0.97 ? K.mix(dk, gold, 0.4 + 0.3 * sin(atan2(y, x) * 18)) : rr > 0.8 ? K.mix(gold, hi, 0.5) : K.mix(gold, hi, 0.25 * (1 - rr)); }, KZ.gold);
          if (emboss) {
            const { G, M } = gmShapes(THREE), s = r * 0.62;
            for (const side of emboss === 2 ? [1, -1] : [1]) {
              const mm = m.clone().multiply(K.M([0, 0, side * th * 0.38], [0, side > 0 ? 0 : PI, 0], [s, s, 1]));
              acc.add(THREE, K.extrude(G, 0.06 * r / s, 0, 5), mm.clone().multiply(K.M([-0.46, 0, 0])), hi, KZ.gold);
              acc.add(THREE, K.extrude(M, 0.06 * r / s, 0), mm.clone().multiply(K.M([0.5, 0, 0])), hi, KZ.gold);
            }
          }
        }
        function gmbag(THREE, o) {
          o = o || {}; const K = kit(THREE), toon = needToon(THREE, o), acc = new Acc();
          const burlap = K.col('#CFA56B'), burlapDk = K.col('#94693A'), burlapHi = K.col('#E8C78F'), rope = K.col('#E9B44C'), ropeDk = K.col('#A8741F');
          // the sack: a lathe with soft folds pulled into the neck, a flared ruffle mouth, sitting slightly squashed
          const prof = [[0.0, 0.0], [0.17, 0.008], [0.27, 0.05], [0.335, 0.13], [0.355, 0.24], [0.335, 0.35], [0.27, 0.45], [0.17, 0.525], [0.105, 0.56], [0.098, 0.585], [0.13, 0.615], [0.19, 0.655], [0.215, 0.69], [0.19, 0.705], [0.12, 0.665], [0.0, 0.655]];
          const sack = K.lathe(prof, 20), P = sack.attributes.position;
          for (let i = 0; i < P.count; i++) {
            const x = P.getX(i), y = P.getY(i), z = P.getZ(i), th = atan2(z, x);
            const fold = 1 + (0.07 * sin(7 * th + y * 5) + 0.03 * sin(3 * th + 1.3)) * sstep(0.3, 0.6, y) + 0.12 * sin(9 * th) * sstep(0.6, 0.7, y) * (y > 0.6 ? 1 : 0);
            const sq = 1 + 0.06 * (1 - sstep(0, 0.25, y));
            P.setXYZ(i, x * fold * sq, y * (y < 0.3 ? 0.97 : 1), z * fold * sq * 0.94);
          }
          sack.computeVertexNormals();
          acc.add(THREE, sack, K.M([0, 0, 0]), (x, y, z, nx, ny) => { let c = K.mix(burlapDk, burlap, sstep(0.0, 0.2, y)); c = K.mix(c, burlapHi, sstep(0.6, 0.7, y) * 0.6); return K.mul(c, 0.9 + 0.1 * ny); }, KZ.cloth);
          acc.mark('sack');
          // the gold rope tie and two knotted tails
          const tie = new THREE.TorusGeometry(0.108, 0.026, 5, 16); tie.rotateX(PI / 2);
          acc.add(THREE, tie, K.M([0, 0.578, 0], [0, 0, 0], [1, 1, 0.95]), (x, y, z) => K.mix(ropeDk, rope, 0.55 + 0.45 * sin(atan2(z, x) * 16 + y * 60)), KZ.satin);
          for (const s of [-1, 1]) {
            const pts = K.roundPoly([[0.03 * s, 0.578, 0.105], [0.09 * s, 0.52, 0.14], [0.12 * s, 0.43, 0.15]], 0.03, 2);
            acc.add(THREE, K.tube(pts, 0.018, 0.018, 6, [0, 0, 1], true), K.M([0, 0, 0]), rope, KZ.satin);
          }
          acc.mark('rope');
          // the stitched GM coin patch on the belly and a crown of coins in the mouth
          gmCoin(THREE, K, acc, K.M([0, 0.27, 0.345], [-0.12, 0, 0]), 1, 0.125); acc.mark('patch');
          const crown = [[0, 0.71, 0.01, -0.55, 0.2, 0.095, 1], [-0.075, 0.69, -0.03, 0.3, -0.6, 0.088, 0], [0.078, 0.695, -0.02, -0.25, 0.7, 0.088, 0]];
          for (const [x, y, z, rx, ry, r, em] of crown) gmCoin(THREE, K, acc, K.M([x, y, z], [rx, ry, 0]), em, r);
          acc.mark('coins');
          const group = new THREE.Group(), body = new THREE.Group(); body.add(toonMesh(THREE, acc, toon)); group.add(body);
          return finish(THREE, 'gmbag', group, acc.parts, {
            body,
            animate(t, s) {   // pops up 0.12 s, squashes on the bounce, wobbles
              s = s || {}; const k = s.pop === undefined ? 1 : s.pop;
              const w = sin(t * 9) * exp(-t * 2) * 0.12;
              body.scale.set(k * (1 + w), k * (1 - w), k * (1 + w));
              body.rotation.y = 0.4 * sin(t * 1.5);
            },
          });
        }

        /* ================================================================== 3. RUG PULL */
        const RUG_NX = 22, RUG_NZ = 14;
        function rugPattern(K) {   // an original kilim: plum border with a gold sawtooth, a stepped-diamond medallion with a red core, chart candles either side
          const C = { plum: K.col('#3A1D5C'), field: K.col('#6A2FA6'), fieldDk: K.col('#5A2690'), gold: K.col(PAL.gold), mag: K.col(PAL.magenta), cream: K.col('#F6E7C8'), red: K.col(PAL.down), green: K.col(PAL.up), wick: K.col('#2A1640') };
          return (i, j) => {
            const d = min(i, j, RUG_NX - 1 - i, RUG_NZ - 1 - j);
            if (d === 0) return C.plum;
            if (d === 1) { const u = (i + j) % 4; return u < 2 ? C.gold : C.plum; }
            if (d === 2) return ((i + j) & 1) ? C.mag : C.plum;
            const ci = (RUG_NX - 1) / 2, cj = (RUG_NZ - 1) / 2, m = abs(i - ci) + abs(j - cj);
            if (m <= 1) return C.red; if (m <= 2) return C.cream; if (m <= 3) return C.mag; if (m <= 4) return C.gold;
            // chart candles: up-up left, down-down right
            const candle = (ci0, j0, j1, c) => (i === ci0 && j >= j0 && j <= j1 ? c : null);
            const cs = [candle(4, 5, 8, C.green), candle(6, 6, 9, C.green), candle(RUG_NX - 5, 5, 8, C.red), candle(RUG_NX - 7, 4, 7, C.red)];
            for (const c of cs) if (c) return c;
            if ((i === 4 && (j === 4 || j === 9)) || (i === 6 && (j === 5 || j === 10)) || (i === RUG_NX - 5 && (j === 4 || j === 9)) || (i === RUG_NX - 7 && (j === 3 || j === 8))) return C.wick;
            return ((i >> 1) + (j >> 1)) & 1 ? C.field : C.fieldDk;
          };
        }
        function rug(THREE, o) {
          o = o || {}; const K = kit(THREE), toon = needToon(THREE, o), acc = new Acc();
          if (o.rolled) return rugRolled(THREE, o, K, toon);
          const W = o.width || 1.6, D = o.depth || 1.02, cw = W / RUG_NX, cd = D / RUG_NZ, pat = rugPattern(K), T = 0.014;
          const base = [];   // rest positions (x, z) of every vertex we deform
          const top = new THREE.BufferGeometry(), P = [], N = [], I = [];
          const quad = (x0, z0, x1, z1, y) => { const b = P.length / 3; P.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1); N.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0); I.push(b, b + 2, b + 1, b, b + 3, b + 2); };
          for (let j = 0; j < RUG_NZ; j++) for (let i = 0; i < RUG_NX; i++) quad(-W / 2 + i * cw, -D / 2 + j * cd, -W / 2 + (i + 1) * cw, -D / 2 + (j + 1) * cd, T);
          top.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); top.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); top.setIndex(I);
          let q = 0; acc.add(THREE, top, K.M([0, 0, 0]), () => { const cell = floor(q++ / 4), i = cell % RUG_NX, j = floor(cell / RUG_NX); return pat(i, j); }, KZ.cloth);
          acc.mark('weave');
          // the edge (a thin dark binding all round) and the backing
          const band = K.col('#2A1640');
          const edges = [[[-W / 2, -D / 2], [W / 2, -D / 2]], [[W / 2, -D / 2], [W / 2, D / 2]], [[W / 2, D / 2], [-W / 2, D / 2]], [[-W / 2, D / 2], [-W / 2, -D / 2]]];
          for (const [[x0, z0], [x1, z1]] of edges) {
            const n = 10, nx = z1 - z0, nz = x0 - x1, l = hypot(nx, nz), g = new THREE.BufferGeometry(), pp = [], nn = [], ii = [];
            for (let k = 0; k <= n; k++) { const t = k / n, x = lerp(x0, x1, t), z = lerp(z0, z1, t); pp.push(x, T, z, x, 0, z); nn.push(nx / l, 0.3, nz / l, nx / l, -0.3, nz / l); }
            for (let k = 0; k < n; k++) { const a = 2 * k; ii.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
            g.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3)); g.setIndex(ii);
            acc.add(THREE, g, K.M([0, 0, 0]), band, KZ.cloth);
          }
          const back = new THREE.PlaneGeometry(W, D, 6, 4); back.rotateX(PI / 2);
          acc.add(THREE, back, K.M([0, 0.001, 0]), band, KZ.matte);
          acc.mark('edge');
          // fringe: 9 cream tassels at each short end
          const fringe = K.col('#F1E2C4');
          for (const s of [-1, 1]) for (let k = 0; k < 9; k++) {
            const z = -D / 2 + ((k + 0.5) / 9) * D;
            acc.add(THREE, new THREE.BoxGeometry(0.11, 0.008, 0.026), K.M([s * (W / 2 + 0.05), 0.004, z], [0, 0.12 * sin(k * 2.3), 0]), fringe, KZ.cloth);
          }
          acc.mark('fringe');
          const geo = acc.geometry(THREE), mesh = new THREE.Mesh(geo, toon); mesh.castShadow = true; mesh.receiveShadow = true;
          const pos = geo.attributes.position, rest = Float32Array.from(pos.array), nrm = geo.attributes.normal, restN = Float32Array.from(nrm.array);
          const group = new THREE.Group(); group.add(mesh);
          // deform: a resting ripple + lifted corner; yank (0..1): the far edge is grabbed and whipped forward, the rug curls up into a wave
          function deform(t, yank) {
            const a = pos.array;
            for (let v = 0; v < pos.count; v++) {
              const x = rest[3 * v], y = rest[3 * v + 1], z = rest[3 * v + 2];
              const u = (z + D / 2) / D;   // 0 near edge .. 1 far edge
              let ry = 0.006 * sin(x * 7 + z * 3 + 0.5) + 0.012 * sstep(0.6, 0.85, ((x + W / 2) / W) * 0.5 + u * 0.5) * sstep(0.55, 1, u) * (x < 0 ? 1 : 0.2);
              let dz = 0, dy = 0;
              if (yank > 0) {
                const k = yank, lead = sstep(0, 1, k);
                dz = lead * (0.4 + 2.6 * pow(u, 0.6)) * k;                         // the far edge runs away fastest
                const crest = sin(PI * sat(u * 1.1 - 0.05)) * sin(PI * sat(k * 1.2));
                dy = crest * (0.25 + 0.35 * u) + 0.15 * u * k * k;                  // a rolling wave lifts it
                ry *= 1 - k;
              }
              a[3 * v] = x; a[3 * v + 1] = y + ry + dy; a[3 * v + 2] = z + dz;
            }
            pos.needsUpdate = true;
            if (yank > 0) geo.computeVertexNormals(); else { nrm.array.set(restN); nrm.needsUpdate = true; }
          }
          deform(0, 0);
          return finish(THREE, 'rug', group, acc.parts, { mesh, animate(t, s) { deform(t, (s && s.yank) || 0); } });
        }
        function rugRolled(THREE, o, K, toon) {   // the lobbed version: rolled up, tied, fringed; unrolls on landing (handled by the trap)
          const acc = new Acc(), W = o.width || 1.6, R = 0.13, pat = rugPattern(K);
          const roll = new THREE.CylinderGeometry(R, R, W, 14, RUG_NX, true); roll.rotateZ(PI / 2);
          // the outside of the roll: clean woven bands (plum ends, gold sawtooth line, field, a magenta centre stripe)
          const plum = K.col('#3A1D5C'), fieldC = K.col('#6A2FA6'), fieldD = K.col('#5A2690'), goldC = K.col(PAL.gold), magC = K.col(PAL.magenta);
          acc.add(THREE, roll, K.M([0, 0, 0]), (x, y, z) => { const e = W / 2 - abs(x); return e < 0.09 ? plum : e < 0.15 ? goldC : abs(x) < 0.09 ? magC : (floor((x + W) / 0.145) & 1 ? fieldC : fieldD); }, KZ.cloth);
          // the loose flap: the last six rows of the kilim peel off the roll and flutter behind it (pattern side out)
          { const FJ = 6, cw = W / RUG_NX, FL = 0.62, cl = FL / FJ, P = [], N = [], I = [];
            const at = (x, u) => [x, R * cos(u / R * 0.0) + 0.0 - 0.32 * u * u / FL + 0.035 * sin(x * 5 + u * 9), -u];
            for (let j = 0; j < FJ; j++) for (let i = 0; i < RUG_NX; i++) {
              const x0 = -W / 2 + i * cw, x1 = x0 + cw, u0 = j * cl, u1 = u0 + cl, b = P.length / 3;
              for (const [x, u] of [[x0, u0], [x1, u0], [x1, u1], [x0, u1]]) { P.push(...at(x, u)); N.push(0, 0.95, -0.3); }
              I.push(b, b + 1, b + 2, b, b + 2, b + 3);
            }
            const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); fg.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); fg.setIndex(I);
            let q = 0; acc.add(THREE, fg, K.M([0, 0, 0]), () => { const cell = floor(q++ / 4), i = cell % RUG_NX, j = floor(cell / RUG_NX); return pat(i, FJ - 1 - j + 0); }, KZ.cloth);
            const fb = new THREE.BufferGeometry(); const P2 = P.slice(), N2 = N.map((v) => -v), I2 = []; for (let k = 0; k < I.length; k += 3) I2.push(I[k], I[k + 2], I[k + 1]);
            for (let k = 1; k < P2.length; k += 3) P2[k] -= 0.006;
            fb.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3)); fb.setAttribute('normal', new THREE.Float32BufferAttribute(N2, 3)); fb.setIndex(I2);
            acc.add(THREE, fb, K.M([0, 0, 0]), K.col('#2A1640'), KZ.matte);
          }
          // ends: concentric layers (a spiral read) in plum / gold / field
          const ring = K.col('#3A1D5C'), gold = K.col(PAL.gold), field = K.col('#6A2FA6');
          for (const s of [-1, 1]) {
            const cap = new THREE.RingGeometry(0.0, R, 18, 6); cap.rotateY((s * PI) / 2);
            acc.add(THREE, cap, K.M([(s * W) / 2, 0, 0]), (x, y, z) => { const r = hypot(y, z) / R, k = floor(r * 7 - atan2(z, y) / PI) ; return r > 0.94 ? ring : [field, gold, ring][((k % 3) + 3) % 3]; }, KZ.cloth);
            for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU; acc.add(THREE, new THREE.BoxGeometry(0.12, 0.012, 0.024), K.M([s * (W / 2 + 0.055), R * 0.7 * sin(a), R * 0.7 * cos(a)], [a, 0, s * 0.35 * sin(a)]), K.col('#F1E2C4'), KZ.cloth); }
          }
          for (const x of [-0.45, 0.45]) { const b = new THREE.TorusGeometry(R + 0.006, 0.012, 4, 16); b.rotateY(PI / 2); acc.add(THREE, b, K.M([x, 0, 0]), K.col('#2A1640'), KZ.satin); }
          acc.mark('rolled');
          const group = new THREE.Group(), body = new THREE.Group(); body.add(toonMesh(THREE, acc, toon)); group.add(body);
          return finish(THREE, 'rug', group, acc.parts, { body, rolled: true, animate(t) { body.rotation.x = -t * 4.5; } });
        }

        /* ================================================================== 4. COLD WALLET */
        function wallet(THREE, o) {
          o = o || {}; const K = kit(THREE), toon = needToon(THREE, o), acc = new Acc(), fa = new FxAcc(23);
          const c = o.center || [0, 0.62, 0.05], rad = o.radii || [1.22, 0.98, 1.5];
          // the shell: a geodesic of frosted panels (bright facet edges = the vault lattice), clipped at the road
          const ico = new THREE.IcosahedronGeometry(1, 2);
          fa.add(THREE, ico, K.M(c, [0, 0, 0], rad), [1], (x, y) => y > 0.04);
          const ice = fxMaterial(THREE, { tint: PAL.defence });
          // the vault dial on the nose: steel-ice ring, 6 spokes, a glowing cyan hub
          const steel = K.col('#E3F4FF'), steelDk = K.col('#8FB3CC'), cyan = K.col('#7FF0FF');
          const dz = c[2] + rad[2] * 0.93, dy = c[1] + 0.22, md = K.M([0, dy, dz], [-0.18, 0, 0]);
          acc.add(THREE, new THREE.TorusGeometry(0.15, 0.03, 6, 20), md, (x, y) => K.mix(steelDk, steel, 0.5 + 0.5 * y / 0.15), KZ.metal);
          for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; acc.add(THREE, new THREE.BoxGeometry(0.025, 0.12, 0.025), md.clone().multiply(K.M([0, 0, 0], [0, 0, a, 'XYZ']).multiply(K.M([0, 0.06, 0]))), steel, KZ.metal); }
          const hub = new THREE.CylinderGeometry(0.055, 0.06, 0.05, 16); hub.rotateX(PI / 2);
          acc.add(THREE, hub, md, cyan, KZ.glow);
          for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; acc.add(THREE, new THREE.BoxGeometry(0.014, 0.034, 0.014), md.clone().multiply(K.M([0.185 * sin(a), 0.185 * cos(a), 0], [0, 0, -a, 'XYZ'])), cyan, KZ.glow); }
          acc.mark('dial');
          // a ring of frost crystals where the shell meets the road
          const r = rng(5), frost = K.col('#EAFBFF'), frostDk = K.col('#9ADFF5');
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * TAU + 0.2 * r(), hgt = 0.16 + 0.14 * r();
            const g = new THREE.CylinderGeometry(0, 0.045, hgt, 6, 1); g.translate(0, hgt / 2, 0);
            const x = c[0] + sin(a) * rad[0] * 0.93, z = c[2] + cos(a) * rad[2] * 0.93;
            acc.add(THREE, g, K.M([x, -0.01, z], [0.5 * cos(a), 0, -0.5 * sin(a), 'XYZ']), (x2, y2) => K.mix(frostDk, frost, y2 / hgt), KZ.gloss);
            const g2 = new THREE.CylinderGeometry(0, 0.03, hgt * 0.6, 6, 1); g2.translate(0, hgt * 0.3, 0);
            acc.add(THREE, g2, K.M([x + 0.06 * cos(a), -0.01, z - 0.06 * sin(a)], [0.9 * cos(a), 0, -0.9 * sin(a), 'XYZ']), (x2, y2) => K.mix(frostDk, frost, y2 / (hgt * 0.6)), KZ.gloss);
          }
          acc.mark('frost');
          const group = new THREE.Group(), solid = toonMesh(THREE, acc, toon), shell = fxMesh(THREE, fa, ice, 4);
          group.add(solid, shell);
          const parts = Object.assign({}, acc.parts, { shell: fa.tris });
          return finish(THREE, 'wallet', group, parts, {
            shell, solid, ice,
            // state.hit: seconds since the blocked hit (crack 0.15 s, shatter 0.7 s), state.hitAt: object-space point
            animate(t, s) {
              s = s || {}; ice.uniforms.uTime.value = t;
              const breathe = 1 + 0.012 * sin(t * 3.1); shell.scale.setScalar(breathe);
              if (s.hit === undefined) { ice.uniforms.uCrack.value = 0; ice.uniforms.uBurst.value = 0; solid.visible = true; solid.scale.setScalar(1); return; }
              if (s.hitAt) ice.uniforms.uHit.value.set(...s.hitAt);
              ice.uniforms.uCrack.value = sat(s.hit / 0.15);
              ice.uniforms.uBurst.value = sat((s.hit - 0.15) / 0.7);
              const k = sat((s.hit - 0.15) / 0.25); solid.visible = k < 1; solid.scale.setScalar(1 + 0.15 * k);
            },
          });
        }

        /* ================================================================== 5. LASER EYES (orb + the eye flare) */
        function laser(THREE, o) {
          o = o || {}; const K = kit(THREE);
          const glowMat = fxMaterial(THREE, { tint: PAL.attack, additive: true, side: THREE.FrontSide });
          const fa = new FxAcc(3);
          fa.add(THREE, new THREE.SphereGeometry(0.15, 14, 10), K.M([0, 0, 0]), () => [4, 1, 0, 0]);
          fa.add(THREE, new THREE.SphereGeometry(0.29, 14, 10), K.M([0, 0, 0]), () => [4, 0, 0, 0]);
          const ringA = new FxAcc(4);
          ringA.add(THREE, new THREE.TorusGeometry(0.36, 0.018, 4, 26), K.M([0, 0, 0]), () => [4, 0.4, 0, 0]);
          ringA.add(THREE, new THREE.TorusGeometry(0.36, 0.018, 4, 26), K.M([0, 0, 0], [PI / 2, 0.6, 0]), () => [4, 0.4, 0, 0]);
          const group = new THREE.Group(), orb = fxMesh(THREE, fa, glowMat, 5), rings = fxMesh(THREE, ringA, glowMat, 5);
          group.add(orb, rings);
          // the eye flare: two short tapering beams + bright cores, placed at the driver's eyes (kart frame)
          const eyes = o.eyes || [[0.132, 1.216, -0.074], [-0.132, 1.216, -0.074]];
          const fe = new FxAcc(9);
          for (const e of eyes) {
            const cone = new THREE.CylinderGeometry(0.006, 0.03, 0.7, 10, 1, true); cone.rotateX(PI / 2); cone.translate(0, 0, 0.36);
            fe.add(THREE, cone, K.M([e[0], e[1], e[2] + 0.06]), () => [4, 0.6, 0, 0]);
            fe.add(THREE, new THREE.SphereGeometry(0.05, 10, 8), K.M([e[0], e[1], e[2] + 0.07], [0, 0, 0], [1, 0.7, 0.6]), () => [4, 1, 0, 0]);
          }
          const flareMat = fxMaterial(THREE, { tint: PAL.attack, additive: true, side: THREE.FrontSide });
          const flare = fxMesh(THREE, fe, flareMat, 5);
          const parts = { orb: fa.tris, rings: ringA.tris, flare: fe.tris };
          const g = finish(THREE, 'laser', group, parts, {
            orb, rings, flare, flareMat, glowMat,
            animate(t) { rings.rotation.set(t * 5, t * 7, 0); const p = 1 + 0.08 * sin(t * 40); orb.scale.setScalar(p); glowMat.uniforms.uTime.value = t; },
            flareAt(k) { flareMat.uniforms.uAlpha.value = k; flare.visible = k > 0.01; flare.scale.set(1, 1, 1); },
          });
          g.userData.item.flareTris = fe.tris;
          return g;
        }

        /* ================================================================== 6. PUMP (a floor pump whose barrel is a green candle)
         * Built upright in the kart frame (origin = the foot, on the deck): stands beside the seat, the T-handle at head
         * height. The 0.12 s anticipation is the handle slamming down; the boost fires out of the exhaust in the foot.
         * Three draws: the base (foot, barrel, gauge, hose), the handle (rod + T-bar, moves), the flame. */
        function pump(THREE, o) {
          o = o || {}; const K = kit(THREE), toon = needToon(THREE, o), acc = new Acc(), hac = new Acc();
          const green = K.col(PAL.up), greenDk = K.col('#139250'), greenHi = K.col('#9CF7C4'), wick = K.col('#0F5A35'), steel = K.col('#3D434E'), steelHi = K.col('#A7B0BE'),
            gold = K.col(PAL.gold), goldDk = K.col(PAL.goldDk), white = K.col('#F7FFF9'), rubber = K.col('#22202A'), red = K.col(PAL.down);
          const BH = 0.56, B0 = 0.1, BW = 0.2;   // barrel height, base, width
          // foot: a chunky steel plate with two gold treads, and the lower wick as the stem into it
          acc.add(THREE, K.rbox(0.34, 0.06, 0.24, 0.025, [[1, 1], [0, 1], [1, 1]]), K.M([0, 0.03, 0]), (x, y, z, nx, ny) => K.mix(steel, steelHi, 0.25 + 0.35 * sat(ny)), KZ.metal);
          for (const s of [-1, 1]) acc.add(THREE, K.rbox(0.1, 0.03, 0.16, 0.012, [[0, 1], [0, 1], [0, 1]]), K.M([s * 0.13, 0.07, 0]), (x, y, z, nx, ny) => K.mix(goldDk, gold, 0.5 + 0.5 * ny), KZ.gold);
          acc.add(THREE, new THREE.CylinderGeometry(0.03, 0.036, B0 - 0.04, 8), K.M([0, 0.04 + (B0 - 0.04) / 2, 0]), wick, KZ.satin);
          acc.mark('foot');
          // barrel: the green candle body, rounded, glossy, darker at the base
          acc.add(THREE, K.rbox(BW, BH, BW, 0.05, [[1, 1], [2, 1], [1, 1]]), K.M([0, B0 + BH / 2, 0]), (x, y, z, nx, ny, nz) => K.mix(K.mix(greenDk, green, sstep(-BH / 2, 0.05, y)), greenHi, sat(ny) * 0.55 + sat(nx * 0.4 - nz * 0.3) * 0.15), KZ.gloss);
          // gold collar at the top, white up-chevrons front and back (the chase camera sees the back)
          const col = new THREE.TorusGeometry(0.118, 0.022, 5, 4); col.rotateX(PI / 2); col.rotateY(PI / 4);
          acc.add(THREE, col, K.M([0, B0 + BH - 0.01, 0], [0, 0, 0], [1.02, 1, 1.02]), (x, y) => K.mix(goldDk, gold, 0.5 + y * 20), KZ.gold);
          acc.add(THREE, new THREE.CylinderGeometry(0.07, 0.085, 0.03, 8), K.M([0, B0 + BH + 0.012, 0]), gold, KZ.gold);
          for (const fz of [-1, 1]) for (let k = 0; k < 2; k++) {
            const s = K.shape([[-0.07, -0.02], [0, 0.045], [0.07, -0.02], [0.07, -0.058], [0, 0.007], [-0.07, -0.058]]);
            const g = K.extrude(s, 0.012, 0); if (fz < 0) g.rotateY(PI);
            acc.add(THREE, g, K.M([0, B0 + 0.12 + k * 0.1, fz * (BW / 2 + 0.002)]), white, KZ.glow);
          }
          acc.mark('barrel');
          // pressure gauge on the back face, above the chevrons: white dial, red low arc, green high arc, needle pinned high
          const gm = K.M([0, B0 + BH - 0.11, -(BW / 2 + 0.012)], [0, PI, 0]);
          acc.add(THREE, new THREE.TorusGeometry(0.062, 0.014, 4, 14), gm, K.col('#C9CED6'), KZ.metal);
          acc.add(THREE, new THREE.CircleGeometry(0.058, 14), gm.clone().multiply(K.M([0, 0, -0.002])), (x, y) => (y < -0.015 ? white : atan2(y, x) > PI * 0.5 ? K.mix(red, white, 0.15) : K.mix(green, white, 0.1)), KZ.flat);
          acc.add(THREE, new THREE.BoxGeometry(0.008, 0.05, 0.006), gm.clone().multiply(K.M([0, 0, 0.004], [0, 0, -0.55, 'XYZ'])).multiply(K.M([0, 0.022, 0])), K.col('#1B1330'), KZ.satin);
          acc.add(THREE, new THREE.SphereGeometry(0.01, 6, 4), gm.clone().multiply(K.M([0, 0, 0.006])), gold, KZ.gold);
          acc.mark('gauge');
          // hose: from the foot, a lazy loop forward and down into the kart (ends at o.hoseTo, kart frame relative to the foot)
          const ht = o.hoseTo || [-0.32, -0.02, 0.32];
          const hp = []; for (let k = 0; k <= 10; k++) { const t = k / 10; hp.push([lerp(0.16, ht[0], t) + 0.12 * sin(t * PI), 0.05 + 0.16 * sin(t * PI) + lerp(0, ht[1], t), lerp(0.02, ht[2], t) - 0.06 * sin(t * PI)]); }
          acc.add(THREE, K.tube(hp, 0.022, 0.022, 6, [0, 1, 0], false), K.M([0, 0, 0]), rubber, KZ.rubber);
          for (const p of [hp[0], hp[10]]) acc.add(THREE, new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8), K.M(p), gold, KZ.gold);
          acc.mark('hose');
          // exhaust bell in the foot, pointing back (-Z)
          const bell = K.lathe([[0.04, 0.06], [0.05, 0.04], [0.075, 0.0], [0.07, -0.006], [0.035, 0.03], [0.0, 0.03]], 12);
          acc.add(THREE, bell, K.M([0, 0.045, -0.12], [PI / 2, 0, 0, 'XYZ']), (x, y, z) => (hypot(x, z) < 0.05 && y < 0.035 ? K.col('#FFB35C') : K.mix(steel, steelHi, 0.4)), (x, y, z) => (hypot(x, z) < 0.05 && y < 0.035 ? KZ.glow : KZ.metal));
          acc.mark('nozzle');
          // the handle: steel rod + gold T-bar with dark rubber grips (its own mesh: it plunges)
          const top = B0 + BH + 0.02;
          hac.add(THREE, new THREE.CylinderGeometry(0.017, 0.017, 0.3, 8), K.M([0, top + 0.15, 0]), (x, y, z, nx) => K.mix(steel, steelHi, 0.4 + 0.4 * nx), KZ.metal);
          const bar = K.rbox(0.3, 0.05, 0.05, 0.022, [[1, 1], [0, 1], [0, 1]]);
          hac.add(THREE, bar, K.M([0, top + 0.31, 0]), (x, y, z, nx, ny) => K.mix(goldDk, gold, 0.5 + 0.5 * ny), KZ.gold);
          for (const s of [-1, 1]) hac.add(THREE, K.rbox(0.1, 0.064, 0.064, 0.03, [[1, 1], [0, 1], [0, 1]]), K.M([s * 0.17, top + 0.31, 0]), (x, y, z, nx, ny) => K.mix(rubber, K.col('#55505F'), 0.3 + 0.4 * sat(ny)), KZ.rubber);
          hac.mark('handle');
          // the boost flame out of the bell
          const flameMat = fxMaterial(THREE, { tint: '#9CFF3A', tint2: '#FFFBE0', additive: true, side: THREE.FrontSide });
          const fa = new FxAcc(2), L = 1.15;
          const cone = new THREE.CylinderGeometry(0.075, 0.0, L, 12, 8, true); cone.translate(0, -L / 2, 0);
          fa.add(THREE, cone, K.M([0, 0.045, -0.15], [PI / 2, 0, 0, 'XYZ']), (c, v) => [3, sat((-0.15 - v.z) / L), 0, 0]);
          const inner = new THREE.CylinderGeometry(0.045, 0.0, L * 0.45, 8, 4, true); inner.translate(0, -L * 0.225, 0);
          fa.add(THREE, inner, K.M([0, 0.045, -0.15], [PI / 2, 0, 0, 'XYZ']), (c, v) => [3, sat((-0.15 - v.z) / (L * 0.45)) * 0.5, 0, 0]);
          const flame = fxMesh(THREE, fa, flameMat, 5);
          const group = new THREE.Group(), body = new THREE.Group(), base = toonMesh(THREE, acc, toon), handle = toonMesh(THREE, hac, toon);
          body.add(base, handle, flame); group.add(body); body.scale.setScalar(o.scale || 1.3);
          const parts = Object.assign({}, acc.parts, hac.parts, { flame: fa.tris });
          return finish(THREE, 'pump', group, parts, {
            body, base, handle, flame, flameMat, nozzle: [0, 0.045, -0.16], STROKE: 0.3,
            /* state.plunge 0 (handle up) .. 1 (slammed down), state.burn 0..1 = flame size. The barrel squashes and bulges
             * as the handle bottoms out, then springs; the chevrons are glow-zone so they flash with the bloom. */
            animate(t, s) {
              s = s || {}; flameMat.uniforms.uTime.value = t;
              const p = s.plunge === undefined ? 0 : s.plunge, b = s.burn === undefined ? 0 : s.burn;
              handle.position.y = -0.24 * p;
              const sq = pow(p, 3) * (b > 0.01 ? exp(-(s.since || 0) * 9) : 1);
              base.scale.set(1 + 0.12 * sq, 1 - 0.1 * sq, 1 + 0.12 * sq);
              flame.visible = b > 0.01; flame.scale.set(1 + 0.12 * sin(t * 50), 1 + 0.12 * sin(t * 50), b * (1 + 0.08 * sin(t * 37)));
              flameMat.uniforms.uAlpha.value = min(1, b * 1.5);
            },
          });
        }

        /* ================================================================== 7. MUCH WOW (three orbiting charges, one instanced mesh) */
        function wowLetters(THREE, K, acc, s) {
          const gold = K.col(PAL.gold), dk = K.col('#D58E14'), hi = K.col('#FFF0A6'), r = 0.042 * s;
          const colFn = (x, y, z, nx, ny, nz) => K.mix(K.mix(dk, gold, 0.5 + 0.5 * ny), hi, pow(sat(nz * 0.6 + ny * 0.5), 3) * 0.7);
          const W = (cx) => K.roundPoly([[-0.15, 0.13], [-0.075, -0.13], [0, 0.07], [0.075, -0.13], [0.15, 0.13]].map(([x, y]) => [cx + x * s, y * s, 0]), 0.035 * s, 3);
          for (const cx of [-0.36 * s, 0.36 * s]) acc.add(THREE, K.tube(W(cx), r, r * 0.9, 7, [0, 0, 1], true), K.M([0, 0, 0]), colFn, KZ.gold);
          const O = new THREE.TorusGeometry(0.095 * s, r, 7, 18);
          acc.add(THREE, O, K.M([0, 0, 0], [0, 0, 0], [1, 1.28, 1]), colFn, KZ.gold);
        }
        function wow(THREE, o) {
          o = o || {}; const K = kit(THREE), toon = needToon(THREE, o), acc = new Acc(), s = o.scale || 1.25;
          wowLetters(THREE, K, acc, s); acc.mark('WOW');
          const geo = acc.geometry(THREE), inst = new THREE.InstancedMesh(geo, toon, 3); inst.castShadow = true; inst.receiveShadow = true;
          const group = new THREE.Group(); group.add(inst);
          const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
          const g = finish(THREE, 'wow', group, acc.parts, {
            inst, radius: o.radius || 1.45, height: o.height || 0.95, centre: o.centre || [0, 0, -0.05], charges: 3, positions: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
            // orbit at 1.6 rad/s, bob, each letter block faces the camera's yaw (camYaw) so WOW always reads
            animate(t, st) {
              st = st || {}; const n = st.charges === undefined ? 3 : st.charges, camYaw = st.camYaw || 0;
              inst.count = n;
              for (let i = 0; i < n; i++) {
                const a = t * 1.6 + (i * TAU) / 3, pop = st.pop && st.pop[i] !== undefined ? st.pop[i] : 1;
                p.set(this.centre[0] + sin(a) * this.radius, this.height + 0.1 * sin(t * 3 + i * 2.1), this.centre[2] + cos(a) * this.radius * 1.1);
                e.set(0.08 * sin(t * 2 + i), camYaw + 0.25 * sin(a), 0.1 * sin(t * 2.6 + i)); q.setFromEuler(e); sc.setScalar(pop);
                m.compose(p, q, sc); inst.setMatrixAt(i, m); this.positions[i] = [p.x, p.y, p.z];
              }
              inst.instanceMatrix.needsUpdate = true;
            },
          });
          g.userData.item.tris = acc.tris * 3; g.userData.item.trisPerCharge = acc.tris;
          return g;
        }

        /* ================================================================== 8. FUD CLOUD */
        function fud(THREE, o) {
          o = o || {}; const K = kit(THREE), toon = needToon(THREE, o), acc = new Acc();
          const top = K.col('#C2B9DA'), mid = K.col('#6E6488'), bot = K.col('#2E2540'), red = K.col(PAL.down);
          const blobs = [[-0.62, -0.06, 0.0, 0.3], [-0.22, -0.04, 0.06, 0.37], [0.22, -0.05, 0.04, 0.36], [0.63, -0.07, -0.02, 0.29], [-0.33, 0.27, -0.02, 0.33], [0.1, 0.38, -0.04, 0.4], [0.5, 0.2, -0.04, 0.3], [-0.05, 0.05, -0.28, 0.38]];
          const sdf = (x, y, z) => { let d = 1e9; for (const b of blobs) d = smin(d, hypot(x - b[0], y - b[1], (z - b[2]) * 1.1) - b[3], 0.05); return -smin(-d, y + 0.27, 0.06); };
          const KIT = o.kit;
          if (KIT && KIT.field) {
            const Gd = KIT.field(sdf, [-1.16, -0.36, -0.66, 1.16, 0.9, 0.66], o.cell || 0.095, true);
            acc.k = KZ.satin;
            acc.k = [0.85, 0, 0, 1];
            KIT.polygonize(Gd, acc, (x, y, z, ao, nx, ny, nz) => { const c = K.mix(K.mix(bot, mid, sstep(-0.3, 0.0, y)), top, sstep(-0.05, 0.55, y) * (0.55 + 0.45 * sat(ny + 0.3))); return K.mul(c, 0.78 + 0.22 * ao); }, null, 0.03);
          } else {
            for (const b of blobs) acc.add(THREE, new THREE.IcosahedronGeometry(b[3], 2), K.M([b[0], b[1], b[2]]), (x, y, z, nx, ny) => K.mix(bot, top, 0.5 + 0.5 * ny), KZ.satin);
          }
          acc.mark('cloud');
          // two narrow, angry red eyes
          for (const s of [-1, 1]) {
            const eye = K.shape([[-0.1, 0.02], [0.1, -0.03], [0.08, -0.07], [-0.08, -0.05]]);
            let ez = 0.9; for (let i = 0; i < 40; i++) { const d = sdf(s * 0.16, 0.08, ez); if (d < 0.002) break; ez -= d; }
            acc.add(THREE, K.extrude(eye, 0.04, 0.008), K.M([s * 0.16, 0.08, ez - 0.006], [0.12, s * 0.22, 0], [s * 1.15, 1.15, 1]), red, KZ.glow);
          }
          acc.mark('eyes');
          // three red down-arrows that drop out of the base and loop
          const arrows = new Acc();
          const ag = K.extrude(K.shape(arrowPts), 0.07, 0.018);
          for (let k = 0; k < 3; k++) arrows.add(THREE, ag, K.M([0, 0, 0], [0, 0, 0], 0.3), (x, y) => K.mix(K.col('#B0162E'), red, 0.6 + y), KZ.glow);
          // three arrow meshes would cost three draws: they share one geometry offset by a per-arrow vertex translation
          const per = arrows.n / 3, aPos = arrows.P.slice();
          const group = new THREE.Group(), body = new THREE.Group();
          const aMesh = toonMesh(THREE, arrows, toon);
          body.add(toonMesh(THREE, acc, toon), aMesh); group.add(body);
          const parts = Object.assign({}, acc.parts, { arrows: arrows.tris });
          const slots = [[-0.38, -0.05], [0.02, 0.12], [0.42, 0.0]];
          return finish(THREE, 'fud', group, parts, {
            body, arrows: aMesh,
            // (o.drop: how far the arrows fall, a share of the 0.9 they fall as they come; 7 Oct, round 3)
            animate(t, o) {
              body.position.y = 0.06 * sin(t * 2.4); body.rotation.z = 0.04 * sin(t * 1.7);
              const a = aMesh.geometry.attributes.position.array, drop = o && o.drop != null ? o.drop : 1;
              for (let k = 0; k < 3; k++) {
                const ph = (t * 0.9 + k * 0.37) % 1, y = -0.32 - ph * 0.9 * drop, sc = sstep(0, 0.15, ph) * (1 - sstep(0.8, 1, ph));
                for (let v = k * per; v < (k + 1) * per; v++) { a[3 * v] = slots[k][0] + aPos[3 * v] * sc; a[3 * v + 1] = y + aPos[3 * v + 1] * sc; a[3 * v + 2] = slots[k][1] + aPos[3 * v + 2] * sc; }
              }
              aMesh.geometry.attributes.position.needsUpdate = true;
            },
          });
        }

        /* ================================================================== 9. WHALE DUMP (SDF cartoon white whale, belly-flop pose)
         * The white whale (7 Oct, the owner: "a white whale like the meme"): an old bull sperm whale, as cartoon. One
         * marching-cubes body from the endo kit (the big blunt square head, the narrow jaw slung under it, the body
         * tapering to a knuckled tail stock, small paddle flippers spread for the flop, broad notched flukes), every vertex
         * pulled onto the exact surface; white over soft blue-grey, pale scars and squid-sucker rings, a wrinkled back.
         * The grin, the scars, the blowhole and the small cheeky eyes are placed by projecting onto it. Original. */
        function whale(THREE, o) {
          o = o || {}; const K = kit(THREE), toon = needToon(THREE, o), acc = new Acc(), KIT = o.kit;
          if (!KIT || !KIT.field) throw new Error('whale needs opts.kit (the endo marching-cubes kit)');
          const white = K.col('#E9F1FD'), shade = K.col('#AFC0DC'), deep = K.col('#8395B7'), scar = K.col('#B8C3D2'), ring = K.col('#C4CEDB'), lip = K.col('#232A44'), blush = K.col('#F2B8C6');
          const HIDE = [0.55, 0, 0, 1];   // (no warm terminator: a white hide shades blue-grey, never pink)
          const ell = (x, y, z, a, b, c) => { const X = x / a, Y = y / b, Z = z / c, k0 = sqrt(X * X + Y * Y + Z * Z), k1 = sqrt(X * X / (a * a) + Y * Y / (b * b) + Z * Z / (c * c)) + 1e-9; return (k0 * (k0 - 1)) / k1; };
          const cone = (x, y, z, A, B, ra, rb) => { const bx = B[0] - A[0], by = B[1] - A[1], bz = B[2] - A[2], px = x - A[0], py = y - A[1], pz = z - A[2], l2 = bx * bx + by * by + bz * bz, h = sat((px * bx + py * by + pz * bz) / l2); return hypot(px - bx * h, py - by * h, pz - bz * h) - lerp(ra, rb, h); };
          const rbx = (x, y, z, c, b, r) => { const qx = abs(x - c[0]) - b[0] + r, qy = abs(y - c[1]) - b[1] + r, qz = abs(z - c[2]) - b[2] + r; return hypot(max(qx, 0), max(qy, 0), max(qz, 0)) + min(max(qx, max(qy, qz)), 0) - r; };
          const rotP = (x, y, z, c, yaw, roll) => { let X = x - c[0], Y = y - c[1], Z = z - c[2]; const cy = cos(yaw), sy = sin(yaw); [X, Z] = [cy * X - sy * Z, sy * X + cy * Z]; const cr = cos(roll), sr = sin(roll); [X, Y] = [cr * X + sr * Y, -sr * X + cr * Y]; return [X, Y, Z]; };
          const sdf = (x, y, z) => {
            const ax = abs(x);
            // the head: a rounded block, a little narrower toward the jaw, its brow rolled forward over it
            let d = rbx(ax * (1 + 0.2 * sstep(0.05, -0.2, y)), y, z - 0.012 * sstep(0.1, 0.2, y), [0, 0.02, 0.32], [0.205, 0.205, 0.27], 0.135);
            d -= 0.022 * sat(1 - (ax * ax + (y - 0.03) * (y - 0.03)) / 0.045) * sstep(0.35, 0.6, z);   // the brow domed, not a flat wall
            d = smin(d, cone(ax, y, z, [0, 0.0, 0.14], [0, 0.05, -0.36], 0.19, 0.105), 0.09);   // the body,
            d = smin(d, cone(ax, y, z, [0, 0.05, -0.36], [0, 0.17, -0.57], 0.105, 0.065), 0.06);   // the tail stock, curling up
            d = -smin(-d, y + 0.2, 0.05);   // a flattened belly
            d = smin(d, ell(ax, y - 0.175, z + 0.2, 0.06, 0.05, 0.1), 0.07);   // the hump
            d = smin(d, cone(ax * 1.35, y, z, [0, -0.13, 0.08], [0, -0.17, 0.5], 0.04, 0.05), 0.06);   // the jaw, narrow, slung under the head
            const f = rotP(ax, y, z, [0.215, -0.13, 0.06], 0.6, -0.25); d = smin(d, ell(f[0], f[1], f[2], 0.12, 0.03, 0.06), 0.04);
            const t = rotP(ax, y, z, [0.15, 0.2, -0.66], -0.62, 0.14); d = smin(d, ell(t[0], t[1], t[2] * (1 + 1.1 * sstep(-0.05, 0.18, t[0])), 0.19, 0.038, 0.085), 0.045);   // the flukes, tapering to tips
            return d;
          };
          const grad = (x, y, z, e) => { const a = sdf(x + e, y - e, z - e), b = sdf(x - e, y - e, z + e), c = sdf(x - e, y + e, z - e), d = sdf(x + e, y + e, z + e); const g = [a - b - c + d, -a - b + c + d, -a + b - c + d], l = hypot(...g) || 1; return g.map((v) => v / l); };
          const proj = (p) => { let [x, y, z] = p; for (let i = 0; i < 10; i++) { const d = sdf(x, y, z), g = grad(x, y, z, 0.002); x -= g[0] * d; y -= g[1] * d; z -= g[2] * d; } return [x, y, z]; };
          const h = o.cell || 0.0345;
          const Gd = KIT.field(sdf, [-0.42, -0.27, -0.88, 0.42, 0.34, 0.66], h, true);
          acc.k = HIDE; const v0 = acc.n;
          KIT.polygonize(Gd, acc, (x, y, z, ao, nx, ny, nz) => {
            let c = K.mix(shade, white, sstep(-0.75, 0.15, ny));   // white, going blue-grey underneath
            const wr = sstep(0.02, -0.22, z) * sstep(-0.1, 0.4, ny) * (0.5 + 0.5 * sin(z * 62 + sin(x * 24) * 1.4));   // the wrinkled back
            c = K.mix(c, shade, 0.32 * wr);
            const ch = sstep(0.06, 0.0, hypot(abs(x) - 0.2, y + 0.07, z - 0.36)); c = K.mix(c, blush, ch * 0.55);   // a little colour under the eye
            return K.mix(deep, c, 0.45 + 0.55 * ao);
          }, null, 0.012);
          for (let v = v0; v < acc.n; v++) {   // pull onto the exact surface, analytic normals
            const q = proj([acc.P[3 * v], acc.P[3 * v + 1], acc.P[3 * v + 2]]);
            if (hypot(q[0] - acc.P[3 * v], q[1] - acc.P[3 * v + 1], q[2] - acc.P[3 * v + 2]) < h * 0.6) { acc.P[3 * v] = q[0]; acc.P[3 * v + 1] = q[1]; acc.P[3 * v + 2] = q[2]; }
            const g = grad(acc.P[3 * v], acc.P[3 * v + 1], acc.P[3 * v + 2], h * 0.12); acc.N[3 * v] = g[0]; acc.N[3 * v + 1] = g[1]; acc.N[3 * v + 2] = g[2];
          }
          acc.mark('body');
          const onSurf = (p, lift) => { const q = proj(p), g = grad(...q, 0.002); return [q[0] + g[0] * lift, q[1] + g[1] * lift, q[2] + g[2] * lift]; };
          const line = (pts, r, col, radial) => acc.add(THREE, K.tube(pts.map((p) => onSurf(p, r * 0.4)), r, r * 0.8, radial || 4, [0, 1, 0], true), K.M([0, 0, 0]), col, HIDE);
          // the grin: along the seam of jaw and head on each side, from the chin back, turning up at the corner
          for (const sd of [-1, 1]) {
            const pts = []; for (let k = 0; k <= 14; k++) { const u = k / 14; pts.push([sd * lerp(0.07, 0.2, sstep(0.25, 1, u)), -0.145 + (sd > 0 ? 0.125 : 0.085) * pow(sstep(0.6, 1, u), 1.6), lerp(0.56, 0.3, u)]); }   // (a smirk: one corner higher)
            line(pts, 0.0075, lip, 5);
          }
          acc.mark('grin');
          // scars: a few long pale rakes over the head and back, squid-sucker rings on the brow
          const SC = [
            [[0.06, 0.2, 0.52], [0.12, 0.22, 0.4], [0.17, 0.2, 0.3]], [[0.03, 0.22, 0.47], [0.09, 0.24, 0.36], [0.13, 0.23, 0.27]],
            [[-0.2, 0.12, 0.5], [-0.21, 0.06, 0.4], [-0.21, -0.02, 0.33]], [[0.15, 0.2, -0.05], [0.18, 0.12, -0.15], [0.17, 0.06, -0.24]],
            [[-0.08, 0.22, 0.14], [-0.13, 0.2, 0.03]], [[0.12, 0.16, 0.62], [0.02, 0.07, 0.64], [-0.06, -0.02, 0.62]], [[0.15, 0.06, 0.6], [0.09, -0.02, 0.62], [0.03, -0.1, 0.6]],
          ];
          for (const s of SC) { const pts = []; for (let k = 0; k <= 6; k++) { const u = (k / 6) * (s.length - 1), i = min(s.length - 2, floor(u)), f = u - i; pts.push([lerp(s[i][0], s[i + 1][0], f), lerp(s[i][1], s[i + 1][1], f), lerp(s[i][2], s[i + 1][2], f)]); } line(pts, 0.0055, scar, 4); }
          for (const [x, y, z, r] of [[0.2, 0.15, 0.3, 0.016], [0.2, 0.11, 0.24, 0.012], [-0.12, 0.22, 0.56, 0.014], [-0.2, 0.1, 0.56, 0.013]]) {
            const p = onSurf([x, y, z], 0.001), n = grad(...p, 0.002);
            acc.add(THREE, new THREE.TorusGeometry(r, 0.0035, 3, 10), K.M(p, [-Math.asin(n[1]), atan2(n[0], n[2]), 0]), ring, HIDE);
          }
          acc.mark('scars');
          // eyes: small and cheeky, low on the head's sides behind the grin, under a cocked brow (one brow up)
          for (const sd of [-1, 1]) {
            const c0 = onSurf([sd * 0.21, 0.01, 0.42], -0.006), n = grad(...c0, 0.002), dir = [n[0] * 0.7, n[1] * 0.3 + 0.02, n[2] * 0.7 + 0.55], dl = hypot(...dir), D = dir.map((v) => v / dl);
            const em = K.M(c0, [-Math.asin(D[1]), atan2(D[0], D[2]), 0]);
            acc.add(THREE, new THREE.SphereGeometry(0.04, 12, 8), em, K.col('#FBF8F2'), KZ.gloss);
            acc.add(THREE, new THREE.SphereGeometry(0.023, 10, 6), em.clone().multiply(K.M([0, -0.004, 0.029], [0, 0, 0], [1, 1.1, 0.6])), K.col('#141A2E'), KZ.gloss);
            acc.add(THREE, new THREE.SphereGeometry(0.007, 6, 4), em.clone().multiply(K.M([0.009, 0.011, 0.043])), [2.5, 2.5, 2.5], KZ.glow);
            acc.add(THREE, new THREE.SphereGeometry(0.045, 12, 4, 0, TAU, 0, PI * 0.4), em.clone().multiply(K.M([0, 0, 0], [-0.5, 0, sd * 0.18])), K.mix(shade, white, 0.6), HIDE);
            const up = sd > 0 ? 0.03 : 0.0, brow = [];
            for (let k = 0; k <= 6; k++) { const u = k / 6; brow.push([sd * 0.21, 0.075 + up * u + 0.02 * sin(u * PI), lerp(0.49, 0.37, u)]); }
            line(brow, 0.009, K.mix(deep, shade, 0.5), 5);
          }
          acc.mark('eyes');
          const hole = []; for (let k = 0; k <= 6; k++) { const u = k / 6; hole.push([-0.07 + 0.025 * sin(u * PI * 1.6), 0.25, lerp(0.56, 0.48, u)]); }   // the blowhole: an S-slit up front, to the left
          line(hole, 0.009, deep, 4);
          acc.mark('blowhole');
          const group = new THREE.Group(), body = new THREE.Group(), mesh = toonMesh(THREE, acc, toon); body.add(mesh); group.add(body);
          // (drawn into the race's picture, the HDR target the kart kit marks gmBloomMask, the shared toon writes alpha 0
          // to keep a body out of the bloom; the race draws the Whale see-through, to fade it near a camera, and blended
          // by an alpha of 0 it was drawn as nothing at all: its own draws blend its colour by its opacity instead and
          // clear the alpha under it, out of the bloom all the same, as the racers' glass is. Its material is the
          // race's own copy of the toon, swapped in after this, so the hook is the mesh's)
          mesh.onBeforeRender = (r, sc, cam, geo, mat) => {
            const t = r.getRenderTarget(), U = mat.userData && mat.userData.uniforms;
            if (U && U.kMask) U.kMask.value = 0;
            if (!mat.transparent) return;
            if (t && t.gmBloomMask) { mat.blending = THREE.CustomBlending; mat.blendSrc = THREE.SrcAlphaFactor; mat.blendDst = THREE.OneMinusSrcAlphaFactor; mat.blendSrcAlpha = THREE.ZeroFactor; mat.blendDstAlpha = THREE.ZeroFactor; }
            else mat.blending = THREE.NormalBlending;
          };
          body.scale.setScalar(o.scale || 9);
          // the ground shadow + warning ring (gm-item-fx mode 6) and the splash ring (mode 7): two flat discs
          const shMat = fxMaterial(THREE, { tint: PAL.attack, side: THREE.DoubleSide }), spMat = fxMaterial(THREE, { tint: '#BFEFFF' });
          const sh = new FxAcc(1); const disc = new THREE.CircleGeometry(1, 40); sh.add(THREE, disc, K.M([0, 0, 0]), () => [6, 0, 0, 0]);
          const sp = new FxAcc(1); sp.add(THREE, new THREE.CircleGeometry(1, 48), K.M([0, 0, 0]), () => [7, 0, 0, 0]);
          const shadow = fxMesh(THREE, sh, shMat, 1); shadow.rotation.x = -PI / 2; shadow.position.y = 0.02;
          const splash = fxMesh(THREE, sp, spMat, 6); splash.rotation.x = -PI / 2; splash.position.y = 0.05;
          const parts = Object.assign({}, acc.parts);
          const g = finish(THREE, 'whale', group, parts, {
            body, mesh, shadow, splash, shMat, spMat, T_SHADOW: 2.5, LOCK: 0.25,
            /* state.t = seconds since the WHALE DUMP fired (shadow 0..2.5 s, slam at 2.5 s), state.at = target [x,z] on the road.
             * The whale falls from 38 m on an ease-in curve, tilting belly-down; the shadow grows 0.2 -> 1 (state.r m radius,
             * the slam's reach: 7 as it comes, the race's 8.2 since 7 Oct's faster race). */
            animate(t, s) {
              s = s || {}; const T = s.t === undefined ? t : s.t, at2 = s.at || [0, 0], R = s.r || 7;
              const k = sat(T / 2.5), fall = pow(k, 2.6);
              body.position.set(at2[0], lerp(38, 1.2, fall), at2[1] + lerp(-6, 0, k));
              body.rotation.set(lerp(-0.5, 0.05, sstep(0.2, 1, k)), 0.3 * (1 - k), 0.25 * sin(T * 2) * (1 - k));
              const squash = T > 2.5 ? 1 + 0.25 * exp(-(T - 2.5) * 6) * cos((T - 2.5) * 22) : 1;
              body.scale.set((o.scale || 9) * squash, (o.scale || 9) / squash, (o.scale || 9) * squash);
              if (T > 2.5) body.position.y = 1.2 + max(0, (T - 2.9) * 6);
              body.visible = T < 3.3;
              shadow.visible = T < 2.65; shadow.position.set(at2[0], 0.02, at2[1]); shadow.scale.setScalar(R * lerp(0.2, 1, sstep(0, 1, k)));
              shMat.uniforms.uTime.value = T; shMat.uniforms.uRing.value = sstep(0.2, 1, k); shMat.uniforms.uAlpha.value = sstep(0, 0.2, k);
              const sk = sat((T - 2.5) / 0.9); splash.visible = T > 2.5 && sk < 1;
              splash.position.set(at2[0], 0.05, at2[1]); splash.scale.setScalar(R * 1.25);
              spMat.uniforms.uRing.value = 0.15 + 0.85 * pow(sk, 0.6); spMat.uniforms.uAlpha.value = 1 - sk; spMat.uniforms.uTime.value = T;
            },
          });
          return g;
        }

        /* ================================================================== 10. DIAMOND HANDS
         * Two giant cut-crystal hands raised either side of the driver, palms out (the meme, literally), on gold cuffs;
         * a prismatic sheen over them; twin light trails off the rear wheels (6 s of +12% speed); eight small gems
         * orbiting. No shell: the dome silhouette belongs to the Cold Wallet, so the two defence items never read alike.
         * Three draws: the hands (toon, faceted pastel facets), the sheen + trails (gm-item-fx), the orbit (gm-item-fx). */
        function crystalHand(THREE, K, acc, fx, m, bary) {
          const parts = [];
          parts.push([K.flat(K.rbox(0.23, 0.25, 0.085, 0.03, [[0, 1], [0, 1], [0, 1]])), K.M([0, 0.135, 0])]);   // palm
          const fing = [[-0.086, 0.15, 0.34], [-0.03, 0.185, 0.12], [0.03, 0.175, -0.1], [0.086, 0.13, -0.3]];
          for (const [x, len, rz] of fing) {
            const f = K.flat(new THREE.CylinderGeometry(0.03, 0.035, len, 6, 1)); f.translate(0, len / 2, 0);
            const tip = K.flat(new THREE.ConeGeometry(0.03, 0.05, 6)); tip.translate(0, len + 0.025, 0);
            const fm = K.M([x, 0.24, 0], [0, 0, rz, 'XYZ']);
            parts.push([f, fm], [tip, fm]);
          }
          const th = K.flat(new THREE.CylinderGeometry(0.032, 0.038, 0.13, 6, 1)); th.translate(0, 0.065, 0);
          const tht = K.flat(new THREE.ConeGeometry(0.032, 0.05, 6)); tht.translate(0, 0.155, 0);
          const tm = K.M([0.105, 0.08, 0.01], [0, 0, -1.05, 'XYZ']); parts.push([th, tm], [tht, tm]);
          const pal = ['#BFF6FF', '#FFFFFF', '#FFC6EE', '#E6FBFF', '#9FE8FF', '#D8C2FF', '#9FF7D8', '#C9F0FF'].map(K.col);
          const facet = (x, y, z, nx, ny, nz) => { const h = abs(sin(nx * 12.9898 + ny * 78.233 + nz * 37.719) * 43758.5453) % 1; return K.mix(pal[floor(h * pal.length)], [1, 1, 1], 0.15 + 0.35 * sat(ny)); };
          for (const [g, pm] of parts) { const mm = m.clone().multiply(pm); acc.add(THREE, g, mm, facet, KZ.gloss); fx.add(THREE, g, mm.clone().multiply(K.M([0, 0, 0], [0, 0, 0], 1.04)), bary); }
          // the gold cuff (toon only)
          const cuff = new THREE.CylinderGeometry(0.115, 0.105, 0.07, 8, 1); cuff.scale(1, 1, 0.62);
          acc.add(THREE, K.flat(cuff), m.clone().multiply(K.M([0, 0.0, 0])), (x, y, z, nx, ny) => K.mix(K.col(PAL.goldDk), K.col(PAL.gold), 0.5 + 0.5 * sat(ny + 0.3)), KZ.gold);
        }
        function diamond(THREE, o) {
          o = o || {}; const K = kit(THREE), toon = needToon(THREE, o), acc = new Acc(), fs = new FxAcc(31), fo = new FxAcc(33);
          const bary = (c) => [2, c === 0 ? 1 : 0, c === 1 ? 1 : 0, c === 2 ? 1 : 0];
          // hands: kart frame, either side of the seat at shoulder height, palms forward (+Z), tilted out; o.raise overrides
          const at = o.raise || [0.76, 1.0, -0.12], S = o.handScale || 1.5;
          for (const s of [-1, 1]) {
            const m = K.M([s * at[0], at[1], at[2]], [-0.12, -s * 0.22, -s * 0.28, 'YXZ'], [s * -S, S, S]);   // build the right hand, mirror for the left
            crystalHand(THREE, K, acc, fs, m, bary);
          }
          acc.mark('hands'); const handFx = fs.tris;
          // twin light trails off the rear wheels (ribbon mode: fz.y 0 head -> 1 tail, fz.z across)
          const TL = o.trail || 2.6, rw = o.rearWheels || [[0.6, -0.82], [-0.6, -0.82]];
          for (const [x, z0] of rw) {
            const pl = new THREE.PlaneGeometry(0.18, TL, 1, 8); pl.rotateX(-PI / 2); pl.translate(x, 0.04, z0 - TL / 2);
            fs.add(THREE, pl, K.M([0, 0, 0]), (c, v) => [5, sat((z0 - v.z) / TL), (v.x - x) / 0.09, 0]);
          }
          const trailTris = fs.tris - handFx;
          // eight small gems orbiting
          for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; fo.add(THREE, K.flat(new THREE.OctahedronGeometry(0.07)), K.M([sin(a) * 1.35, 0.95 + 0.25 * sin(a * 3), cos(a) * 1.6], [0, a, 0], [0.8, 1.3, 0.8]), bary); }
          const mS = fxMaterial(THREE, { tint: PAL.defence, alpha: 0.55 }), mO = fxMaterial(THREE, { tint: PAL.defence });
          const group = new THREE.Group(), hands = new THREE.Group(), solid = toonMesh(THREE, acc, toon), sheen = fxMesh(THREE, fs, mS, 4), orbit = fxMesh(THREE, fo, mO, 4);
          hands.add(solid, sheen); group.add(hands, orbit);
          return finish(THREE, 'diamond', group, { hands: acc.tris, sheen: handFx, trails: trailTris, orbit: fo.tris }, {
            hands, solid, sheen, orbit, palms: [-1, 1].map((sd) => [sd * (at[0] + 0.05), at[1] + 0.2 * S, at[2]]),
            animate(t, s) {
              s = s || {}; for (const m of [mS, mO]) m.uniforms.uTime.value = t;
              orbit.rotation.y = t * 1.3;
              hands.position.y = 0.035 * sin(t * 5.2);
              const left = s.left === undefined ? 6 : s.left, fade = left < 1 ? (sin(t * 30) > 0 ? 1 : 0.3) : 1;   // blinks out over its last second
              mS.uniforms.uAlpha.value = 0.55 * fade; mO.uniforms.uAlpha.value = fade; solid.visible = fade > 0.5;
            },
          });
        }

        /* ================================================================== 11. TO THE MOON (rocket strapped behind the seat) */
        function moon(THREE, o) {
          o = o || {}; const K = kit(THREE), toon = needToon(THREE, o), acc = new Acc();
          const body = K.col('#F7F2E6'), bodyDk = K.col('#CFC6B2'), nose = K.col(PAL.up), noseDk = K.col('#169A55'), mag = K.col(PAL.magenta), steel = K.col('#3A3F47'), glass = K.col('#1D2E5C'), gold = K.col(PAL.gold);
          // the hull (lathe along +Y, then laid along +Z): crisp colour bands from doubled profile points
          const prof = [[0, -0.6], [0.12, -0.6], [0.165, -0.56], [0.185, -0.48], [0.188, -0.44], [0.188, -0.36], [0.19, -0.3], [0.19, 0.2], [0.183, 0.32], [0.17, 0.4], [0.165, 0.42], [0.152, 0.47], [0.12, 0.56], [0.08, 0.64], [0.04, 0.7], [0.0, 0.73]];
          acc.add(THREE, K.lathe(prof, 20), K.M([0, 0, 0], [PI / 2, 0, 0, 'XYZ']), (x, y, z, nx, ny, nz) => {
            let c = y > 0.41 ? K.mix(noseDk, nose, 0.5 + 0.5 * nx) : y < -0.37 && y > -0.47 ? mag : K.mix(bodyDk, body, 0.55 + 0.45 * sat(nx * 0.6 + 0.5));
            return c;
          }, KZ.gloss);
          acc.mark('hull');
          // porthole on top with a gold crescent-moon mark
          const pm = K.M([0, 0.18, 0.1], [-PI / 2, 0, 0, 'XYZ']);
          acc.add(THREE, new THREE.TorusGeometry(0.068, 0.016, 5, 14), pm, K.col('#C9CED6'), KZ.metal);
          acc.add(THREE, new THREE.CircleGeometry(0.062, 20), pm.clone().multiply(K.M([0, 0, -0.004])), glass, KZ.gloss);
          const cres = new THREE.Shape(); cres.absarc(0, 0, 0.035, 0, TAU, false); const hole = new THREE.Path(); hole.absarc(0.016, 0.01, 0.03, 0, TAU, true); cres.holes.push(hole);
          acc.add(THREE, K.extrude(cres, 0.004, 0, 10), pm.clone().multiply(K.M([0, 0, 0.002])), gold, KZ.glow);
          acc.mark('porthole');
          // three magenta fins (one up, two low), nozzle bell
          const fin = K.shape([[0, -0.12], [0.0, 0.28], [0.17, 0.36], [0.17, 0.27]]);
          for (const a of [0, (2 * PI) / 3, (4 * PI) / 3]) {
            const g = K.extrude(fin, 0.026, 0.008); g.rotateY(-PI / 2); g.rotateX(-PI / 2);
            acc.add(THREE, g, K.M([0, 0, -0.32], [0, 0, a, 'XYZ']).multiply(K.M([0, 0.16, 0], [0, 0, 0])), (x, y, z) => K.mix(K.col('#C21E77'), mag, 0.6 + 0.4 * sat(y * 4)), KZ.gloss);
          }
          acc.mark('fins');
          const bell = K.lathe([[0.1, 0.0], [0.11, -0.04], [0.14, -0.12], [0.16, -0.17], [0.15, -0.175], [0.09, -0.07], [0.0, -0.06]], 18);
          acc.add(THREE, bell, K.M([0, 0, -0.6], [PI / 2, 0, 0, 'XYZ']), (x, y, z) => (hypot(x, z) < 0.095 && y < -0.05 ? K.col('#FFB35C') : steel), (x, y, z) => (hypot(x, z) < 0.095 && y < -0.05 ? KZ.glow : KZ.metal));
          acc.mark('nozzle');
          // two leather straps + brackets down to the kart
          for (const z of [-0.22, 0.12]) {
            const st = new THREE.TorusGeometry(0.196, 0.018, 4, 16); st.scale(1, 1, 1.8);
            acc.add(THREE, st, K.M([0, 0, z]), K.col('#5B3A25'), KZ.satin);
            acc.add(THREE, new THREE.BoxGeometry(0.06, 0.2, 0.05), K.M([0, -0.27, z]), K.col('#4A4F59'), KZ.metal);
            acc.add(THREE, K.rbox(0.05, 0.05, 0.05, 0.02, [[0, 1], [0, 1], [0, 1]]), K.M([0, -0.19, z]), gold, KZ.gold);
          }
          acc.mark('straps');
          const flameMat = fxMaterial(THREE, { tint: '#FF7A2A', tint2: '#FFF6D8', additive: true, side: THREE.FrontSide });
          const fa = new FxAcc(8), L = 1.9;
          const cone = new THREE.CylinderGeometry(0.15, 0.0, L, 16, 10, true); cone.translate(0, -L / 2, 0);
          fa.add(THREE, cone, K.M([0, 0, -0.66], [PI / 2, 0, 0, 'XYZ']), (c, v) => [3, sat((-0.66 - v.z) / L), 0, 0]);
          const core = new THREE.CylinderGeometry(0.085, 0.0, L * 0.4, 10, 4, true); core.translate(0, -L * 0.2, 0);
          fa.add(THREE, core, K.M([0, 0, -0.66], [PI / 2, 0, 0, 'XYZ']), (c, v) => [3, sat((-0.66 - v.z) / (L * 0.4)) * 0.35, 0, 0]);
          const flame = fxMesh(THREE, fa, flameMat, 5);
          const group = new THREE.Group(), rocket = new THREE.Group(); rocket.add(toonMesh(THREE, acc, toon), flame); group.add(rocket);
          const parts = Object.assign({}, acc.parts, { flame: fa.tris });
          return finish(THREE, 'moon', group, parts, {
            rocket, flame, flameMat,
            animate(t, s) { s = s || {}; const b = s.burn === undefined ? 1 : s.burn; flameMat.uniforms.uTime.value = t; flame.visible = b > 0.01; flame.scale.set(1 + 0.08 * sin(t * 53), 1 + 0.08 * sin(t * 61), b * (1 + 0.12 * sin(t * 41))); rocket.position.y = 0.012 * sin(t * 70) * b; flameMat.uniforms.uAlpha.value = min(1, b * 1.4); },
          });
        }

        /* ================================================================== VFX: atlas, pools, ribbon */
        const TILES = { spark: 0, glint: 1, puff: 2, ring: 3, streak: 4, glow: 5, bubble: 6, drop: 7, shard: 8, smoke: 9, flame: 10, arrow: 11, coin: 12, gem: 13, flake: 14, shadow: 15, chevron: 16 };
        function paintAtlas(cv) {
          const S = 512, T = 64; cv.width = S; cv.height = S; const g = cv.getContext('2d'); g.clearRect(0, 0, S, S);
          const r = rng(77);
          const tile = (k, fn) => { g.save(); g.translate((k % 8) * T, floor(k / 8) * T); g.beginPath(); g.rect(0, 0, T, T); g.clip(); fn(g, T); g.restore(); };
          const rad = (x, stops) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; };
          tile(0, () => { g.fillStyle = rad(0, [[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(255,255,255,0.95)'], [0.45, 'rgba(255,255,255,0.3)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, T, T); });
          tile(1, () => { g.fillStyle = rad(0, [[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,255,255,0.8)'], [0.3, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, T, T);
            for (const [w, h] of [[30, 2.2], [2.2, 30]]) { const gr = g.createLinearGradient(32 - w, 32 - h, 32 + w, 32 + h); g.fillStyle = 'white'; g.beginPath(); g.ellipse(32, 32, w, h, 0, 0, TAU); g.fill(); }
            g.globalAlpha = 0.5; for (const a of [PI / 4, -PI / 4]) { g.save(); g.translate(32, 32); g.rotate(a); g.beginPath(); g.ellipse(0, 0, 14, 1.4, 0, 0, TAU); g.fill(); g.restore(); } g.globalAlpha = 1; });
          tile(2, () => { for (let i = 0; i < 7; i++) { const x = 32 + (r() - 0.5) * 22, y = 32 + (r() - 0.5) * 22, rr = 10 + r() * 10; const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, T, T); } });
          tile(3, () => { g.strokeStyle = 'white'; g.shadowColor = 'white'; g.shadowBlur = 6; g.lineWidth = 3.5; g.beginPath(); g.arc(32, 32, 26, 0, TAU); g.stroke(); g.lineWidth = 1.5; g.globalAlpha = 0.6; g.beginPath(); g.arc(32, 32, 22, 0, TAU); g.stroke(); });
          tile(4, () => { const gr = g.createLinearGradient(0, 0, T, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.75, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(32, 32, 31, 4.5, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(44, 32, 12, 1.6, 0, 0, TAU); g.fill(); });
          tile(5, () => { g.fillStyle = rad(0, [[0, 'rgba(255,255,255,0.9)'], [0.3, 'rgba(255,255,255,0.4)'], [0.65, 'rgba(255,255,255,0.08)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, T, T); });
          tile(6, () => { g.fillStyle = rad(0, [[0, 'rgba(255,255,255,0.05)'], [0.8, 'rgba(255,255,255,0.18)'], [0.93, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, T, T); g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(22, 20, 6, 3.5, -0.6, 0, TAU); g.fill(); });
          tile(7, () => { g.fillStyle = 'white'; g.beginPath(); g.moveTo(32, 6); g.bezierCurveTo(40, 22, 48, 32, 48, 42); g.arc(32, 42, 16, 0, PI, false); g.bezierCurveTo(16, 32, 24, 22, 32, 6); g.fill(); g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(36, 44, 9, 0, TAU); g.fill(); });
          tile(8, () => { g.fillStyle = 'rgba(255,255,255,0.75)'; g.strokeStyle = 'white'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(14, 50); g.lineTo(30, 8); g.lineTo(52, 38); g.closePath(); g.fill(); g.stroke(); });
          tile(9, () => { for (let i = 0; i < 12; i++) { const a = r() * TAU, d = r() * 14, x = 32 + cos(a) * d, y = 32 + sin(a) * d, rr = 8 + r() * 9; const gr = g.createRadialGradient(x, y - 2, 0, x, y, rr); gr.addColorStop(0, 'rgba(255,255,255,0.7)'); gr.addColorStop(0.6, 'rgba(225,225,230,0.35)'); gr.addColorStop(1, 'rgba(200,200,210,0)'); g.fillStyle = gr; g.fillRect(0, 0, T, T); } });
          tile(10, () => { const gr = g.createLinearGradient(0, 4, 0, 60); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = gr; g.beginPath(); g.moveTo(32, 2); g.bezierCurveTo(46, 26, 50, 40, 46, 50); g.arc(32, 48, 14, 0, PI, false); g.bezierCurveTo(14, 40, 18, 26, 32, 2); g.fill(); });
          tile(11, () => { g.fillStyle = 'white'; g.beginPath(); arrowPts.forEach(([x, y], i) => (i ? g.lineTo(32 + x * 54, 32 - y * 54) : g.moveTo(32 + x * 54, 32 - y * 54))); g.closePath(); g.fill(); });
          tile(12, () => { const gr = g.createRadialGradient(26, 24, 2, 32, 32, 28); gr.addColorStop(0, '#FFF0A8'); gr.addColorStop(0.6, '#F6C33B'); gr.addColorStop(1, '#C8871A'); g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 27, 0, TAU); g.fill(); g.strokeStyle = '#B7771A'; g.lineWidth = 3; g.beginPath(); g.arc(32, 32, 21, 0, TAU); g.stroke(); g.lineWidth = 4.5; g.strokeStyle = '#FFE68A'; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.arc(25, 32, 7.5, 0.7, TAU - 0.1); g.lineTo(26, 32); g.stroke(); g.beginPath(); g.moveTo(35, 40); g.lineTo(35, 24); g.lineTo(39.5, 33); g.lineTo(44, 24); g.lineTo(44, 40); g.stroke(); });
          tile(13, () => { g.fillStyle = 'white'; g.beginPath(); g.moveTo(32, 6); g.lineTo(54, 26); g.lineTo(32, 58); g.lineTo(10, 26); g.closePath(); g.globalAlpha = 0.85; g.fill(); g.globalAlpha = 1; g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 2; g.beginPath(); g.moveTo(10, 26); g.lineTo(54, 26); g.moveTo(22, 26); g.lineTo(32, 58); g.lineTo(42, 26); g.stroke(); });
          tile(14, () => { g.strokeStyle = 'white'; g.lineWidth = 3; g.lineCap = 'round'; for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + cos(a) * 24, 32 + sin(a) * 24); g.stroke(); for (const s of [-1, 1]) { g.beginPath(); g.moveTo(32 + cos(a) * 14, 32 + sin(a) * 14); g.lineTo(32 + cos(a) * 14 + cos(a + s * 0.8) * 8, 32 + sin(a) * 14 + sin(a + s * 0.8) * 8); g.stroke(); } } });
          tile(15, () => { g.fillStyle = rad(0, [[0, 'rgba(255,255,255,0.85)'], [0.6, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, T, T); });
          tile(16, () => { g.strokeStyle = 'white'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(12, 42); g.lineTo(32, 20); g.lineTo(52, 42); g.stroke(); });
          return cv;
        }
        const SPRITE_VERT = `
          attribute vec3 iPos; attribute vec4 iP; attribute vec4 iCol; attribute vec3 iAxis;
          varying vec2 vUv; varying vec4 vCol;
          void main() {
            vec2 c = position.xy; float s = iP.x;
            vec4 mv;
            if ( iP.z < -0.5 ) {   // a quad lying in the plane whose normal is iAxis (ground rings, shockwaves)
              vec3 n = normalize( iAxis ), t1 = normalize( abs( n.y ) < 0.9 ? cross( n, vec3( 0.0, 1.0, 0.0 ) ) : cross( n, vec3( 1.0, 0.0, 0.0 ) ) ), t2 = cross( n, t1 );
              float cr = cos( iP.y ), sr = sin( iP.y ); vec2 q = mat2( cr, sr, -sr, cr ) * c * s;
              mv = modelViewMatrix * vec4( iPos + t1 * q.x + t2 * q.y, 1.0 );
            } else {
              mv = modelViewMatrix * vec4( iPos, 1.0 );
              if ( iP.z > 0.0 ) {   // stretched along the projected axis (sparks, streaks)
                vec3 ax = ( modelViewMatrix * vec4( iAxis, 0.0 ) ).xyz; vec2 d = ax.xy; float l = length( d );
                d = l > 1e-5 ? d / l : vec2( 1.0, 0.0 ); vec2 pr = vec2( -d.y, d.x );
                mv.xy += d * c.x * s * ( 1.0 + iP.z ) + pr * c.y * s;
              } else { float cr = cos( iP.y ), sr = sin( iP.y ); mv.xy += mat2( cr, sr, -sr, cr ) * c * s; }
            }
            gl_Position = projectionMatrix * mv;
            float tile = iP.w; vec2 cell = vec2( mod( tile, 8.0 ), floor( tile / 8.0 ) );
            vUv = vec2( ( cell.x + uv.x ) / 8.0, 1.0 - ( cell.y + 1.0 - uv.y ) / 8.0 );
            vCol = iCol;
          }`;
        const SPRITE_FRAG = `
          uniform sampler2D uMap; uniform float uAdd; varying vec2 vUv; varying vec4 vCol;
          void main() {
            vec4 t = texture2D( uMap, vUv ); float a = t.a * vCol.a;
            if ( uAdd > 0.5 ) gl_FragColor = vec4( vCol.rgb * t.rgb * a, a );
            else gl_FragColor = vec4( vCol.rgb * t.rgb, a );
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`;
        function ItemFX(THREE, o) {
          o = o || {}; const MAX = o.max || 600, R = rng(o.seed || 99);
          const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
          const tex = new THREE.CanvasTexture(paintAtlas(cv)); tex.colorSpace = THREE.SRGBColorSpace;
          const group = new THREE.Group(); group.name = 'item-fx';
          const pools = [0, 1].map((add) => {
            const g = new THREE.InstancedBufferGeometry(); const q = new THREE.PlaneGeometry(1, 1);
            g.index = q.index; g.setAttribute('position', q.attributes.position); g.setAttribute('uv', q.attributes.uv);
            const iPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3), iP = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4), iCol = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4), iAxis = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
            for (const a of [iPos, iP, iCol, iAxis]) a.setUsage(THREE.DynamicDrawUsage);
            g.setAttribute('iPos', iPos); g.setAttribute('iP', iP); g.setAttribute('iCol', iCol); g.setAttribute('iAxis', iAxis); g.instanceCount = 0;
            const m = new THREE.ShaderMaterial({ uniforms: { uMap: { value: tex }, uAdd: { value: add } }, vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG, transparent: true, depthWrite: false, blending: add ? THREE.CustomBlending : THREE.NormalBlending });
            if (add) { m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; }
            m.customProgramCacheKey = () => 'gm-item-sprite';
            const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = add ? 8 : 7; group.add(mesh);
            return { g, iPos, iP, iCol, iAxis, mesh, list: [] };
          });
          const C = new THREE.Color();
          const rgb = (c, k) => { C.set(c); return [C.r * (k || 1), C.g * (k || 1), C.b * (k || 1)]; };
          const rr = (v) => (Array.isArray(v) ? lerp(v[0], v[1], R()) : v);
          /* emitter record: { tile, add (bool), n, life, size: [s0, s1], speed, dir: [x,y,z], cone (rad), spread: [x,y,z] (box),
           *   color: [c0, c1], glow (HDR multiplier), alpha: [a0, a1], grav, drag, stretch, spin, flat (normal axis), delay }
           * opt: { dir, vel, scale, flat, follow, mine (on the kart the camera follows: its rings laid on the road, round
           *   it, and not stood up over it; a laser's ring on your own kart hid a third of it, 8 Oct) } */
          function emit(e, at, opt) {
            opt = opt || {}; const pool = pools[e.add ? 1 : 0], n = e.n || 1;
            const dir = opt.dir || e.dir || [0, 1, 0], dl = hypot(dir[0], dir[1], dir[2]) || 1, D = [dir[0] / dl, dir[1] / dl, dir[2] / dl];
            for (let i = 0; i < n; i++) {
              if (pool.list.length >= MAX) break;
              // a random direction within the cone around D
              const cone = e.cone === undefined ? PI : e.cone, u = R(), ct = 1 - u * (1 - cos(cone)), st = sqrt(max(0, 1 - ct * ct)), ph = R() * TAU;
              const t1 = abs(D[1]) < 0.9 ? [D[2], 0, -D[0]] : [1, 0, 0], tl = hypot(...t1), T1 = t1.map((v) => v / tl), T2 = [D[1] * T1[2] - D[2] * T1[1], D[2] * T1[0] - D[0] * T1[2], D[0] * T1[1] - D[1] * T1[0]];
              const v = [0, 1, 2].map((k) => D[k] * ct + (T1[k] * cos(ph) + T2[k] * sin(ph)) * st);
              const sp = rr(e.speed || 0), sx = e.spread || [0, 0, 0];
              const ofs = e.ring ? (() => { const a = (i / n) * TAU; return [cos(a) * e.ring, 0, sin(a) * e.ring]; })() : [0, 0, 0];
              const inherit = opt.vel || [0, 0, 0];
              pool.list.push({
                x: at[0] + (R() - 0.5) * sx[0] + ofs[0], y: at[1] + (R() - 0.5) * sx[1] + ofs[1], z: at[2] + (R() - 0.5) * sx[2] + ofs[2],
                vx: v[0] * sp + inherit[0], vy: v[1] * sp + inherit[1], vz: v[2] * sp + inherit[2],
                age: -(rr(e.delay || 0)), life: rr(e.life || 0.5), s0: rr(Array.isArray(e.size) ? e.size[0] : e.size || 0.2) * (opt.scale || 1), s1: (Array.isArray(e.size) ? e.size[1] : e.size || 0.2) * (opt.scale || 1),
                c0: rgb((e.color && e.color[0]) || e.color || '#fff', e.glow || 1), c1: rgb((e.color && e.color[1]) || (e.color && e.color[0]) || e.color || '#fff', e.glow || 1),
                a0: e.alpha ? e.alpha[0] : 1, a1: e.alpha ? e.alpha[1] : 0, g: e.grav || 0, drag: e.drag || 0, st: e.stretch || 0, rot: e.rot === undefined ? R() * TAU : e.rot, spin: rr(e.spin || 0),
                tile: TILES[e.tile] || 0, flat: e.flat || (opt.flat) || (opt.mine && e.tile === 'ring' ? [0, 1, 0] : null), follow: opt.follow || null,
              });
            }
          }
          // (stepped with the race, then drawn once the camera has moved this frame: drawn from where the lens was a
          // frame before, a sprite met at 31 m/s was faded half a metre too late; 8 Oct)
          function step(dt) {
            for (const pool of pools) {
              const L = pool.list; let w = 0;
              for (let i = 0; i < L.length; i++) {
                const p = L[i]; p.age += dt;
                if (p.age < 0) { L[w++] = p; continue; }
                if (p.age >= p.life) continue;
                const k = exp(-p.drag * dt); p.vx *= k; p.vy = p.vy * k + p.g * dt; p.vz *= k;
                p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.spin * dt;
                L[w++] = p;
              }
              L.length = w;
            }
          }
          function draw(camera) {
            for (const pool of pools) {
              const L = pool.list;
              if (!pool.mesh.material.uniforms.uAdd.value && camera) {   // alpha pool: back to front
                const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
                L.sort((a, b) => (b.x - cx) ** 2 + (b.y - cy) ** 2 + (b.z - cz) ** 2 - ((a.x - cx) ** 2 + (a.y - cy) ** 2 + (a.z - cz) ** 2));
              }
              // (near the lens a sprite fades: gone inside 1.5 of its own sizes, whole from 4. 7 Oct, round 3, the owner's
              // "it blocks entire view": a puff of smoke left on the road by a kart ahead, met by the camera at 31 m/s,
              // filled the screen for a moment. And, 8 Oct, gone inside 0.9 m and whole from 2.2 m whatever its size,
              // a streak's length its size: a laser's 15 cm sparks passing a hand from the lens on a phone hid a fifth
              // of the road ahead; your own kart is 3 m out and more)
              let n = 0; const ox = camera ? camera.position.x : 0, oy = camera ? camera.position.y : 0, oz = camera ? camera.position.z : 0;
              for (const p of L) {
                if (p.age < 0) continue;
                const t = p.age / p.life, s = lerp(p.s0, p.s1, t), fx0 = p.follow, nd = camera ? hypot(p.x + (fx0 ? fx0[0] : 0) - ox, p.y + (fx0 ? fx0[1] : 0) - oy, p.z + (fx0 ? fx0[2] : 0) - oz) : 99;
                const st = p.flat ? -1 : p.st ? p.st * (0.4 + hypot(p.vx, p.vy, p.vz) * 0.06) : 0, sl = s * (1 + max(0, st)), n0 = max(sl * 1.5, 0.9), n1 = max(sl * 4, 2.2);
                const a = lerp(p.a0, p.a1, t) * min(1, p.age / 0.03 + 0.2) * (nd < n1 ? sstep(n0, n1, nd) : 1);
                const fx = p.follow ? p.follow : null;
                pool.iPos.setXYZ(n, p.x + (fx ? fx[0] : 0), p.y + (fx ? fx[1] : 0), p.z + (fx ? fx[2] : 0));
                pool.iP.setXYZW(n, s, p.rot, st, p.tile);
                pool.iCol.setXYZW(n, lerp(p.c0[0], p.c1[0], t), lerp(p.c0[1], p.c1[1], t), lerp(p.c0[2], p.c1[2], t), a);
                if (p.flat) pool.iAxis.setXYZ(n, p.flat[0], p.flat[1], p.flat[2]); else pool.iAxis.setXYZ(n, p.vx, p.vy, p.vz);
                n++;
              }
              pool.g.instanceCount = n;
              for (const a of [pool.iPos, pool.iP, pool.iCol, pool.iAxis]) a.needsUpdate = true;
            }
          }
          return { group, atlas: cv, texture: tex, emit, step, draw, update(dt, camera) { step(dt); draw(camera); }, rand: R, reset() { for (const p of pools) { p.list.length = 0; p.g.instanceCount = 0; } }, count() { return pools[0].list.length + pools[1].list.length; }, draws: 2, MAX };
        }
        function Ribbon(THREE, n, o) {   // a camera-facing beam trail: push(head) each frame, update(camera)
          o = o || {}; n = n || 24;
          const pos = new Float32Array(n * 2 * 3), fz = new Float32Array(n * 2 * 4), I = [];
          for (let i = 0; i < n; i++) { fz.set([5, i / (n - 1), -1, 0], i * 8); fz.set([5, i / (n - 1), 1, 0], i * 8 + 4); }
          for (let i = 0; i < n - 1; i++) { const a = 2 * i; I.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
          const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 6).fill(0).map((v, i) => (i % 3 === 2 ? 1 : 0)), 3));
          g.setAttribute('fz', new THREE.BufferAttribute(fz, 4)); g.setAttribute('aShard', new THREE.BufferAttribute(new Float32Array(n * 8), 4)); g.setIndex(I);
          const mat = fxMaterial(THREE, { tint: o.tint || PAL.attack, additive: true }); const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 6;
          const pts = []; const width = o.width || 0.22;
          return {
            mesh, mat, pts,
            push(p) { pts.unshift([p[0], p[1], p[2]]); if (pts.length > n) pts.length = n; },
            clear() { pts.length = 0; },
            update(camera) {
              const cam = camera.position;
              for (let i = 0; i < n; i++) {
                const p = pts[min(i, pts.length - 1)] || [0, -99, 0], q = pts[min(i + 1, pts.length - 1)] || p, r0 = pts[max(i - 1, 0)] || p;
                const tx = r0[0] - q[0], ty = r0[1] - q[1], tz = r0[2] - q[2];
                const vx = cam.x - p[0], vy = cam.y - p[1], vz = cam.z - p[2];
                let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx; const l = hypot(sx, sy, sz) || 1;
                // (thinned to nothing within 1.5 m of the lens, whole from 6 m: a beam laid back past the camera, a laser
                // from behind you, ran across the road a lens's width wide; 8 Oct)
                const dc = hypot(vx, vy, vz), u = min(1, max(0, (dc - 1.5) / 4.5)), near = u * u * (3 - 2 * u);
                const w = width * (1 - (i / (n - 1)) * 0.6) * near / l; sx *= w; sy *= w; sz *= w;
                pos.set([p[0] - sx, p[1] - sy, p[2] - sz, p[0] + sx, p[1] + sy, p[2] + sz], i * 6);
              }
              g.attributes.position.needsUpdate = true;
            },
          };
        }

        /* ------------------------------------------------------------------ VFX descriptors (data) */
        const impact = (color, o) => {
          o = o || {};
          return [
            { tile: 'glow', add: true, n: 1, life: 0.12, size: [o.flash || 1.6, (o.flash || 1.6) * 1.6], color: ['#FFFFFF', color], glow: 3, alpha: [1, 0], rot: 0 },
            { tile: 'ring', add: true, n: 1, life: 0.35, size: [0.3, o.ring || 3.0], color: [color, color], glow: 2.5, alpha: [1, 0], rot: 0, flat: o.flat || null },
            { tile: 'streak', add: true, n: 12, life: [0.3, 0.6], size: [0.36 * (o.s || 1), 0.1 * (o.s || 1)], speed: [4 * (o.s || 1), 9 * (o.s || 1)], cone: o.cone || PI, color: ['#FFFFFF', color], glow: 3, alpha: [1, 0.2], grav: -9, drag: 1.5, stretch: 1.2 },
          ];
        };
        const VFX = {
          airdrop: {
            cls: 'pickup', color: '#B98CFF',
            idle: [{ tile: 'glint', add: true, n: 1, life: 0.35, size: [0.05, 0.5], color: ['#FFFFFF', '#FFE68A'], glow: 2.5, alpha: [1, 0], rot: 0, spread: [0.7, 0.7, 0.7] }],
            anticipation: { dur: 0.12, squash: 0.84, emit: [{ tile: 'bubble', add: true, n: 1, life: 0.12, size: [0.9, 1.3], color: ['#B98CFF', '#5CFFC0'], glow: 1.5, alpha: [0.6, 0] }] },
            impact: [...impact('#B98CFF', { ring: 2.4 }), { tile: 'shard', add: true, n: 10, life: [0.4, 0.7], size: [0.16, 0.06], speed: [2, 5], color: ['#5CFFC0', '#FF3EA5'], glow: 2, alpha: [0.9, 0], grav: -6, spin: [-12, 12] }],
            roulette: { spin: 1.2, stopTap: 0.5, ticks: 14 },
          },
          gmbag: {
            cls: 'boost', color: PAL.gold,
            anticipation: { dur: 0.12, squash: 0.84, emit: [{ tile: 'glow', add: true, n: 1, life: 0.12, size: [0.4, 1.2], color: [PAL.gold, PAL.gold], glow: 2, alpha: [0.8, 0] }] },
            trail: [{ tile: 'glint', add: true, n: 1, rate: 6, life: 0.35, size: [0.03, 0.2], color: ['#FFFFFF', PAL.gold], glow: 1.6, alpha: [1, 0], spread: [0.5, 0.4, 0.5], rot: 0 }],
            impact: [...impact(PAL.gold, { ring: 2.0 }), { tile: 'coin', add: false, n: 3, life: 0.6, size: 0.26, speed: [3, 4], dir: [0, 1, 0], cone: 0.5, color: ['#FFFFFF', '#FFFFFF'], alpha: [1, 1], grav: -12, spin: [-10, 10] }],
          },
          rug: {
            cls: 'trap', color: PAL.trap,
            anticipation: { dur: 0.12, emit: [{ tile: 'puff', add: false, n: 4, life: 0.3, size: [0.2, 0.5], speed: [0.5, 1], color: ['#C9B4E8', '#7A5AA8'], alpha: [0.6, 0] }] },
            trail: [{ tile: 'spark', add: true, n: 1, rate: 30, life: 0.3, size: [0.14, 0.02], color: ['#E2C8FF', PAL.trap], glow: 2, alpha: [0.9, 0] }],
            armed: [{ tile: 'glint', add: true, n: 1, life: 0.45, size: [0.02, 0.16], color: ['#FFFFFF', PAL.trap], glow: 1.5, alpha: [1, 0], spread: [1.5, 0.05, 1.0], rot: 0 }],
            impact: [...impact(PAL.trap, { flash: 2.2, ring: 3.9, flat: [0, 1, 0], s: 1.5 }), { tile: 'puff', add: false, n: 8, life: [0.4, 0.7], size: [0.3, 0.8], speed: [1, 2.5], dir: [0, 1, 0], cone: 1.2, color: ['#D7C9EA', '#8A79A8'], alpha: [0.7, 0], drag: 2 }],
            victim: { spin: 1.0, speed: 0.35, gm: -1 },
          },
          wallet: {
            cls: 'defence', color: PAL.defence,
            anticipation: { dur: 0.12, emit: [{ tile: 'flake', add: true, n: 10, life: 0.4, size: [0.12, 0.05], speed: [1, 2.5], color: ['#FFFFFF', PAL.defence], glow: 2, alpha: [1, 0], spin: [-4, 4] }] },
            loop: [{ tile: 'flake', add: true, n: 1, rate: 10, life: 1.2, size: [0.08, 0.02], speed: [0.1, 0.4], color: ['#FFFFFF', PAL.defence], glow: 1.6, alpha: [0.9, 0], spread: [2.4, 1.6, 3.0], spin: [-2, 2] }],
            impact: [...impact(PAL.defence, { ring: 3.4 }), { tile: 'shard', add: true, n: 16, life: [0.5, 0.9], size: [0.22, 0.08], speed: [3, 7], color: ['#FFFFFF', PAL.defence], glow: 2.2, alpha: [1, 0], grav: -9, spin: [-14, 14] }, { tile: 'flake', add: true, n: 14, life: [0.6, 1.0], size: [0.12, 0.04], speed: [1, 3], color: ['#FFFFFF', '#BFF6FF'], glow: 1.8, alpha: [1, 0], grav: -1.5, drag: 1.2 }],
            blocked: impact(PAL.attack, { flash: 0.7, ring: 1.4 }),
            timing: { crack: 0.15, shatter: 0.7, lasts: 12 },
          },
          laser: {
            cls: 'attack', color: PAL.attack,
            anticipation: { dur: 0.12, flare: true, emit: [{ tile: 'glint', add: true, n: 1, life: 0.14, size: [0.1, 0.9], color: ['#FFFFFF', PAL.attack], glow: 3.5, alpha: [1, 0], rot: 0 }, { tile: 'glow', add: true, n: 1, life: 0.14, size: [0.1, 0.45], color: ['#FFE3EA', PAL.attack], glow: 3, alpha: [1, 0] }] },
            trail: [{ tile: 'spark', add: true, n: 1, rate: 70, life: [0.2, 0.4], size: [0.16, 0.0], speed: [0.2, 0.8], color: ['#FFD6E0', PAL.attack], glow: 3, alpha: [1, 0] }, { tile: 'glint', add: true, n: 1, rate: 8, life: 0.25, size: [0.1, 0.5], color: ['#FFFFFF', PAL.attack], glow: 2.5, alpha: [1, 0], rot: 0 }],
            ribbon: { n: 26, width: 0.2 },
            impact: [...impact(PAL.attack, { flash: 3.3, ring: 5.1, s: 1.5 }), { tile: 'puff', add: false, n: 6, life: [0.4, 0.7], size: [0.4, 1.1], speed: [1, 2.5], dir: [0, 1, 0], cone: 1.2, color: ['#FFD0DA', '#7A4A5A'], alpha: [0.7, 0], drag: 2 }],
            flight: { speed: 'max(1.5v, 40 m/s)', turn: '150 deg/s', life: 4 },
          },
          pump: {
            cls: 'boost', color: PAL.boost,
            anticipation: { dur: 0.12, squash: 0.84, emit: [{ tile: 'glow', add: true, n: 1, life: 0.12, size: [0.3, 1.0], color: ['#FFFFFF', PAL.boost], glow: 3, alpha: [1, 0] }] },
            burst: [{ tile: 'ring', add: true, n: 1, life: 0.3, size: [0.4, 2.8], color: [PAL.boost, PAL.up], glow: 3, alpha: [1, 0], rot: 0, flat: [0, 0, 1] }, { tile: 'streak', add: true, n: 4, life: 0.3, size: [0.5, 0.2], speed: [10, 14], dir: [0, 0, -1], cone: 0.1, spread: [2.2, 1.2, 0.5], color: ['#FFFFFF', PAL.boost], glow: 2, alpha: [0.9, 0], stretch: 3 }],
            trail: [{ tile: 'flame', add: true, n: 1, rate: 60, life: [0.15, 0.3], size: [0.3, 0.05], speed: [2, 4], dir: [0, 0, -1], cone: 0.25, color: ['#FFFBE0', PAL.boost], glow: 3, alpha: [1, 0] }, { tile: 'streak', add: true, n: 1, rate: 40, life: [0.3, 0.5], size: [0.28, 0.06], speed: [3, 7], dir: [0, 0.2, -1], cone: 0.5, color: ['#FFFFFF', PAL.up], glow: 3, alpha: [1, 0], grav: -6, stretch: 1.2 }],
            impact: impact(PAL.boost, { ring: 2.2 }),
            boost: { count: 1, fov: [64, 74], stretch: 1.12 },
          },
          wow: {
            cls: 'boost', color: PAL.gold,
            anticipation: { dur: 0.12, emit: [{ tile: 'glint', add: true, n: 3, life: 0.2, size: [0.1, 0.7], color: ['#FFFFFF', PAL.gold], glow: 3, alpha: [1, 0], rot: 0, spread: [2, 0.3, 2] }] },
            halo: { tile: 'glow', add: true, size: 1.1, color: PAL.gold, glow: 0.9, alpha: 0.55 },
            trail: [{ tile: 'spark', add: true, n: 1, rate: 30, life: 0.45, size: [0.12, 0.0], color: ['#FFF4C2', PAL.gold], glow: 2.5, alpha: [1, 0] }],
            impact: [...impact(PAL.gold, { ring: 2.4 }), { tile: 'chevron', add: true, n: 3, life: 0.35, size: [0.3, 0.6], speed: [3, 4], dir: [0, 1, 0], cone: 0.3, color: ['#FFFFFF', PAL.boost], glow: 2.5, alpha: [1, 0], rot: 0 }],
          },
          fud: {
            cls: 'attack', color: PAL.down,
            anticipation: { dur: 0.12, emit: [{ tile: 'smoke', add: false, n: 6, life: 0.4, size: [0.3, 0.9], speed: [0.5, 1.5], color: ['#5A4E70', '#2A2236'], alpha: [0.8, 0] }] },
            trail: [{ tile: 'smoke', add: false, n: 1, rate: 24, life: [0.6, 1.0], size: [0.5, 1.2], speed: [0.2, 0.6], color: ['#4E4464', '#231C30'], alpha: [0.7, 0], drag: 1 }, { tile: 'arrow', add: true, n: 1, rate: 6, life: 0.6, size: [0.22, 0.16], speed: [1.5, 2.5], dir: [0, -1, 0], cone: 0.2, color: ['#FF8095', PAL.down], glow: 2, alpha: [1, 0], rot: 0, spread: [1.2, 0.1, 0.6] }],
            edge: { clear: 0.92, life: 2.5, clearByBoost: 2, fadeIn: 0.15 },
            impact: [...impact(PAL.down, { ring: 2.4 }), { tile: 'smoke', add: false, n: 10, life: [0.6, 1], size: [0.6, 1.4], speed: [1, 3], color: ['#4E4464', '#231C30'], alpha: [0.8, 0], drag: 2 }],
          },
          whale: {
            cls: 'attack', color: PAL.attack,
            anticipation: { dur: 0.12, emit: [{ tile: 'glow', add: true, n: 1, life: 0.12, size: [0.5, 1.6], color: ['#FFFFFF', PAL.attack], glow: 2, alpha: [1, 0] }] },
            shadow: { dur: 2.5, radius: 7, lock: 0.25, horn: true },
            trail: [{ tile: 'drop', add: false, n: 1, rate: 30, life: [0.4, 0.8], size: [0.25, 0.12], speed: [1, 3], dir: [0, 1, 0], cone: 1.2, color: ['#E8FAFF', '#9ED8F0'], alpha: [0.9, 0], grav: -12, spread: [3, 1, 6] }],
            impact: [
              { tile: 'glow', add: true, n: 1, life: 0.14, size: [4, 9], color: ['#FFFFFF', '#BFEFFF'], glow: 2, alpha: [1, 0], rot: 0 },
              { tile: 'ring', add: false, n: 2, life: [0.6, 0.8], size: [2, 16], color: ['#FFFFFF', '#BFEFFF'], alpha: [0.9, 0], rot: 0, flat: [0, 1, 0] },
              { tile: 'streak', add: true, n: 12, life: [0.4, 0.7], size: [0.7, 0.15], speed: [8, 14], dir: [0, 1, 0], cone: 1.3, color: ['#FFFFFF', PAL.attack], glow: 3, alpha: [1, 0], grav: -12, stretch: 1.2 },
              { tile: 'drop', add: false, n: 70, life: [0.7, 1.3], size: [0.45, 0.2], speed: [6, 14], dir: [0, 1, 0], cone: 1.1, spread: [8, 0.5, 8], color: ['#F2FCFF', '#8CCFEA'], alpha: [1, 0.2], grav: -16 },
              { tile: 'puff', add: false, n: 18, life: [0.8, 1.4], size: [1.5, 4], speed: [2, 6], dir: [0, 0.4, 0], cone: 1.5, ring: 5, color: ['#FFFFFF', '#CFEFFF'], alpha: [0.85, 0], drag: 1.5 },
            ],
            victim: { flip: 1.6, speed: 0.2, gm: -3 },
          },
          diamond: {
            cls: 'defence', color: PAL.defence,
            anticipation: { dur: 0.12, emit: [{ tile: 'gem', add: true, n: 8, life: 0.35, size: [0.2, 0.05], speed: [2, 4], color: ['#FFFFFF', PAL.defence], glow: 2.5, alpha: [1, 0], spin: [-6, 6] }] },
            loop: [{ tile: 'glint', add: true, n: 1, rate: 18, life: [0.3, 0.6], size: [0.05, 0.45], color: ['#FFFFFF', '#C9F6FF'], glow: 3, alpha: [1, 0], rot: 0, spread: [2.4, 1.8, 3.0] }, { tile: 'spark', add: true, n: 1, rate: 20, life: [0.3, 0.5], size: [0.1, 0.0], color: ['#FFFFFF', '#FF9DE2'], glow: 2.5, alpha: [1, 0], spread: [0.5, 0.3, 0.5] }],
            impact: impact(PAL.defence, { ring: 2.4 }),
            lasts: 6,
          },
          moon: {
            cls: 'boost', color: PAL.boost,
            anticipation: { dur: 0.12, emit: [{ tile: 'smoke', add: false, n: 8, life: 0.5, size: [0.3, 1.0], speed: [1, 3], dir: [0, 0, -1], cone: 0.8, color: ['#FFFFFF', '#B9B4C8'], alpha: [0.8, 0] }] },
            trail: [
              { tile: 'smoke', add: false, n: 1, rate: 40, life: [0.8, 1.4], size: [0.4, 1.6], speed: [1, 2.5], dir: [0, 0.15, -1], cone: 0.35, color: ['#FFFFFF', '#A9A3BE'], alpha: [0.75, 0], drag: 1.2 },
              { tile: 'streak', add: true, n: 1, rate: 50, life: [0.25, 0.5], size: [0.3, 0.06], speed: [4, 9], dir: [0, 0.1, -1], cone: 0.4, color: ['#FFFBE0', '#FF7A2A'], glow: 3, alpha: [1, 0], grav: -5, stretch: 1.2 },
              { tile: 'streak', add: true, n: 1, rate: 10, life: 0.25, size: [0.35, 0.15], speed: [12, 14], dir: [0, 0, -1], cone: 0.03, spread: [2.6, 1.4, 0.5], color: ['#FFFFFF', PAL.boost], glow: 1.2, alpha: [0.5, 0], stretch: 1.5 },
            ],
            impact: impact(PAL.boost, { ring: 3.0 }),
            autopilot: { dur: 3.5, speed: 'max(40, 1.5 vmax)', iframes: 0.8 },
          },
        };
        // emit every record of a spec; records with `rate` are per-second (pass dt) and the rest are one-shots
        function play(fx, spec, at, o) {
          o = o || {}; const list = Array.isArray(spec) ? spec : spec && spec.emit ? spec.emit : [spec];
          for (const e of list) {
            if (!e) continue;
            if (e.rate) { const k = e.rate * (o.dt || 1 / 60); const n = floor(k) + ((fx.rand || Math.random)() < k - floor(k) ? 1 : 0); if (n) fx.emit(Object.assign({}, e, { n }), at, o); }
            else fx.emit(e, at, o);
          }
        }

        /* ================================================================== HUD icons (128 px, canvas 2D, one style)
         * Style: transparent background, the item drawn large in flat colour + one soft gradient, a 7 px ink outline
         * (#1B1330) under everything, one white gloss highlight, a class-colour glow behind. Read at 48 px. */
        function icon(ctx, id, size) {
          const g = ctx; size = size || 128; g.save(); g.scale(size / 128, size / 128);
          const INK = PAL.ink;
          const cls = (ITEMS.find((i) => i.id === id) || {}).cls, glow = CLS[cls] || '#fff';
          const lin = (x0, y0, x1, y1, stops) => { const gr = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
          const rad = (x, y, r0, r1, stops) => { const gr = g.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
          // glow
          g.fillStyle = rad(64, 64, 10, 64, [[0, glow + 'AA'], [0.6, glow + '33'], [1, glow + '00']]); g.fillRect(0, 0, 128, 128);
          g.lineJoin = 'round'; g.lineCap = 'round';
          const outline = (path, fill, w) => { g.lineWidth = w || 7; g.strokeStyle = INK; path(); g.stroke(); g.fillStyle = fill; path(); g.fill(); };
          const gloss = (x, y, rx, ry, a) => { g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(x, y, rx, ry, a || -0.5, 0, TAU); g.fill(); };
          const poly = (pts) => () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
          const rrect = (x, y, w, h, r) => () => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
          const coin = (x, y, r) => {
            outline(() => { g.beginPath(); g.arc(x, y, r, 0, TAU); }, rad(x - r * 0.3, y - r * 0.3, 1, r, [[0, '#FFF0A8'], [0.6, '#F6C33B'], [1, '#C8871A']]), 5);
            g.strokeStyle = '#B7771A'; g.lineWidth = r * 0.12; g.beginPath(); g.arc(x, y, r * 0.78, 0, TAU); g.stroke();
            g.strokeStyle = '#9A5F0E'; g.lineWidth = r * 0.17; g.beginPath(); g.arc(x - r * 0.3, y, r * 0.3, 0.7, TAU - 0.15); g.lineTo(x - r * 0.25, y); g.stroke();
            g.beginPath(); g.moveTo(x + r * 0.08, y + r * 0.32); g.lineTo(x + r * 0.08, y - r * 0.3); g.lineTo(x + r * 0.3, y + r * 0.05); g.lineTo(x + r * 0.52, y - r * 0.3); g.lineTo(x + r * 0.52, y + r * 0.32); g.stroke();
          };
          const W = { // shared chunky rounded lettering (also the 3D WOW's polyline)
            W: (x, y, s) => [[x - 0.15 * s, y - 0.13 * s], [x - 0.075 * s, y + 0.13 * s], [x, y - 0.07 * s], [x + 0.075 * s, y + 0.13 * s], [x + 0.15 * s, y - 0.13 * s]],
          };
          if (id === 'airdrop') {
            const c = [64, 66], s = 40;
            const top = [[c[0], c[1] - s * 1.0], [c[0] + s * 0.95, c[1] - s * 0.5], [c[0], c[1]], [c[0] - s * 0.95, c[1] - s * 0.5]];
            const left = [[c[0] - s * 0.95, c[1] - s * 0.5], [c[0], c[1]], [c[0], c[1] + s * 1.05], [c[0] - s * 0.95, c[1] + s * 0.55]];
            const right = [[c[0] + s * 0.95, c[1] - s * 0.5], [c[0], c[1]], [c[0], c[1] + s * 1.05], [c[0] + s * 0.95, c[1] + s * 0.55]];
            outline(poly([top[0], top[1], right[3], right[2], left[3], top[3]]), '#000', 9);
            g.fillStyle = lin(20, 20, 108, 108, [[0, '#9FF7FF'], [0.5, '#D8B4FF'], [1, '#FF9ED8']]); poly(top)(); g.fill();
            g.fillStyle = lin(20, 60, 64, 120, [[0, '#7FD8FF'], [1, '#B98CFF']]); poly(left)(); g.fill();
            g.fillStyle = lin(64, 60, 110, 120, [[0, '#FF9ED8'], [1, '#FFD27A']]); poly(right)(); g.fill();
            g.strokeStyle = '#F4F1FF'; g.lineWidth = 4; for (const f of [top, left, right]) { poly(f)(); g.stroke(); }
            // glyph on the left face (skewed)
            g.save(); g.transform(0.95 / 1.0, 0.5, 0, 1, c[0] - s * 0.48, c[1] + s * 0.28); g.scale(34, -34);
            g.fillStyle = '#FFF4C8'; g.strokeStyle = INK; g.lineWidth = 0.09;
            g.beginPath(); g.ellipse(0, 0.12, 0.5, 0.42, 0, 0, PI, false); g.quadraticCurveTo(-0.33, 0.25, -1 / 6, 0.12); g.quadraticCurveTo(0, 0.25, 1 / 6, 0.12); g.quadraticCurveTo(0.33, 0.25, 0.5, 0.12); g.stroke(); g.fill();
            g.lineWidth = 0.06; g.strokeStyle = '#FFF4C8'; for (const x of [-0.5, -1 / 6, 1 / 6, 0.5]) { g.beginPath(); g.moveTo(x, 0.12); g.lineTo(x * 0.25, -0.32); g.stroke(); }
            g.fillStyle = '#FFF4C8'; g.fillRect(-0.13, -0.56, 0.26, 0.24);
            g.restore();
            g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(52, 30, 10, 4, -0.45, 0, TAU); g.fill();
          } else if (id === 'gmbag') {
            const bag = () => { g.beginPath(); g.moveTo(52, 44); g.bezierCurveTo(22, 58, 16, 104, 34, 114); g.lineTo(94, 114); g.bezierCurveTo(112, 104, 106, 58, 76, 44); g.closePath(); };
            outline(bag, lin(0, 44, 0, 114, [[0, '#E8C78F'], [1, '#A8783F']]));
            outline(poly([[44, 30], [56, 44], [72, 44], [84, 30], [74, 36], [64, 30], [54, 36]]), '#E8C78F', 6);
            outline(rrect(46, 40, 36, 9, 4), '#E9B44C', 5);
            coin(64, 82, 21);
            coin(58, 24, 11); coin(76, 22, 10);
            gloss(38, 68, 6, 12, 0.3);
          } else if (id === 'rug') {
            g.save(); g.translate(64, 70); g.transform(1, 0, -0.45, 0.62, 0, 0);
            outline(rrect(-50, -40, 100, 80, 3), '#3A1D5C', 9);
            g.fillStyle = '#6A2FA6'; g.fillRect(-42, -32, 84, 64);
            g.fillStyle = '#FFC93C'; for (let k = -46; k < 46; k += 10) { g.fillRect(k, -38, 5, 4); g.fillRect(k, 34, 5, 4); }
            const dia = (r, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(0, -r); g.lineTo(r * 1.3, 0); g.lineTo(0, r); g.lineTo(-r * 1.3, 0); g.closePath(); g.fill(); };
            dia(26, '#FFC93C'); dia(20, '#FF3EA5'); dia(14, '#F6E7C8'); dia(8, '#FF3B5C');
            g.fillStyle = '#2BE07A'; g.fillRect(-34, -14, 6, 18); g.fillStyle = '#FF3B5C'; g.fillRect(28, -6, 6, 18);
            g.strokeStyle = '#F1E2C4'; g.lineWidth = 3; for (let k = -36; k <= 36; k += 9) { g.beginPath(); g.moveTo(-50, k); g.lineTo(-60, k); g.moveTo(50, k); g.lineTo(60, k); g.stroke(); }
            g.restore();
            // the yank: a curled corner + motion arcs
            outline(() => { g.beginPath(); g.moveTo(96, 50); g.quadraticCurveTo(118, 40, 108, 24); g.quadraticCurveTo(100, 38, 86, 40); g.closePath(); }, '#9B5CFF', 6);
            g.strokeStyle = '#FFFFFF'; g.lineWidth = 5; for (const [x, y] of [[100, 14], [112, 10]]) { g.beginPath(); g.moveTo(x - 10, y + 8); g.lineTo(x, y); g.stroke(); }
          } else if (id === 'wallet') {
            outline(() => { g.beginPath(); g.arc(64, 66, 50, 0, TAU); }, rad(50, 50, 4, 56, [[0, 'rgba(230,252,255,0.95)'], [0.7, 'rgba(120,220,255,0.55)'], [1, 'rgba(63,224,255,0.9)']]));
            g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2.5;
            for (const [x, y] of [[64, 36], [40, 52], [88, 52], [40, 82], [88, 82], [64, 98]]) { g.beginPath(); for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + PI / 6; g.lineTo(x + cos(a) * 16, y + sin(a) * 16); } g.closePath(); g.stroke(); }
            outline(() => { g.beginPath(); g.arc(64, 66, 20, 0, TAU); }, '#E3F4FF', 6);
            g.strokeStyle = '#8FB3CC'; g.lineWidth = 4; for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; g.beginPath(); g.moveTo(64, 66); g.lineTo(64 + cos(a) * 15, 66 + sin(a) * 15); g.stroke(); }
            g.fillStyle = '#7FF0FF'; g.beginPath(); g.arc(64, 66, 7, 0, TAU); g.fill();
            gloss(42, 38, 14, 7, -0.6);
          } else if (id === 'laser') {
            // two glaring eyes firing into a red orb
            for (const x of [34, 70]) {
              outline(() => { g.beginPath(); g.ellipse(x, 52, 20, 15, 0, 0, TAU); }, '#FFF8F2', 6);
              g.fillStyle = '#FF2E63'; g.beginPath(); g.arc(x + 4, 54, 9, 0, TAU); g.fill(); g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(x + 6, 52, 3.5, 0, TAU); g.fill();
              g.fillStyle = INK; g.beginPath(); g.moveTo(x - 22, 40); g.lineTo(x + 22, 46); g.lineTo(x + 22, 36); g.lineTo(x - 22, 32); g.fill();
            }
            g.strokeStyle = 'rgba(255,46,99,0.9)'; g.lineWidth = 7; for (const x of [38, 74]) { g.beginPath(); g.moveTo(x, 56); g.lineTo(96, 96); g.stroke(); }
            g.fillStyle = rad(98, 98, 2, 26, [[0, '#FFFFFF'], [0.35, '#FF8AA6'], [0.7, '#FF2E63'], [1, 'rgba(255,46,99,0)']]); g.beginPath(); g.arc(98, 98, 26, 0, TAU); g.fill();
          } else if (id === 'pump') {
            // a floor pump whose barrel is a green candle: T-handle slammed down (motion ticks), gauge pinned in the green
            g.lineWidth = 15; g.strokeStyle = INK; g.beginPath(); g.moveTo(92, 112); g.bezierCurveTo(124, 112, 122, 66, 104, 60); g.stroke();
            g.lineWidth = 7; g.strokeStyle = '#3A3644'; g.beginPath(); g.moveTo(92, 112); g.bezierCurveTo(124, 112, 122, 66, 104, 60); g.stroke();
            outline(rrect(58, 18, 12, 22, 3), '#A7B0BE', 5);
            outline(rrect(24, 10, 80, 15, 7), lin(0, 10, 0, 25, [[0, '#FFE68A'], [1, '#C8871A']]), 6);
            outline(rrect(14, 7, 24, 21, 9), '#2E2A38', 5); outline(rrect(90, 7, 24, 21, 9), '#2E2A38', 5);
            outline(rrect(40, 36, 48, 70, 11), lin(40, 0, 88, 0, [[0, '#139250'], [0.45, '#2BE07A'], [1, '#1BAE5E']]));
            outline(rrect(36, 34, 56, 10, 4), lin(0, 34, 0, 44, [[0, '#FFE68A'], [1, '#C8871A']]), 5);
            outline(() => { g.beginPath(); g.arc(64, 61, 12, 0, TAU); }, '#F7FFF9', 4);
            g.fillStyle = '#FF3B5C'; g.beginPath(); g.moveTo(64, 61); g.arc(64, 61, 9, PI * 0.75, PI * 1.25); g.closePath(); g.fill();
            g.fillStyle = '#2BE07A'; g.beginPath(); g.moveTo(64, 61); g.arc(64, 61, 9, PI * 1.6, PI * 2.25); g.closePath(); g.fill();
            g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(64, 61); g.lineTo(72, 54); g.stroke();
            g.strokeStyle = '#F7FFF9'; g.lineWidth = 6; for (const y of [80, 94]) { g.beginPath(); g.moveTo(53, y + 6); g.lineTo(64, y - 3); g.lineTo(75, y + 6); g.stroke(); }
            outline(rrect(22, 104, 84, 16, 7), lin(0, 104, 0, 120, [[0, '#A7B0BE'], [1, '#3D434E']]), 6);
            g.fillStyle = '#FFC93C'; g.fillRect(28, 107, 18, 5); g.fillRect(82, 107, 18, 5);
            g.strokeStyle = '#FFFFFF'; g.lineWidth = 4; for (const [x0, x1] of [[10, 4], [118, 124]]) { g.beginPath(); g.moveTo(x0, 34); g.lineTo(x1, 42); g.stroke(); g.beginPath(); g.moveTo(x0 + (x1 > x0 ? 1 : -1) * 2, 2); g.lineTo(x1, 0); g.stroke(); }
            gloss(48, 50, 3.5, 12, 0);
          } else if (id === 'wow') {
            const draw = (w, col) => {
              g.lineWidth = w; g.strokeStyle = col;
              for (const cx of [26, 102]) { const p = [[cx - 18, 46], [cx - 9, 78], [cx, 54], [cx + 9, 78], [cx + 18, 46]]; g.beginPath(); p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
              g.beginPath(); g.ellipse(64, 62, 13, 17, 0, 0, TAU); g.stroke();
            };
            draw(21, INK); draw(13, '#D58E14'); g.save(); g.translate(-1.5, -2); draw(9, '#FFC93C'); g.restore(); g.save(); g.translate(-3, -4); draw(3, '#FFF0A6'); g.restore();
            for (let k = 0; k < 3; k++) outline(() => { g.beginPath(); g.arc(44 + k * 20, 104, 7, 0, TAU); }, '#FFC93C', 5);
          } else if (id === 'fud') {
            const cloud = () => { g.beginPath(); g.arc(40, 56, 20, PI * 0.5, PI * 1.5); g.arc(58, 36, 22, PI * 1.05, PI * 1.85); g.arc(84, 44, 20, PI * 1.3, PI * 0.3); g.lineTo(40, 76); g.closePath(); };
            outline(cloud, lin(0, 16, 0, 78, [[0, '#8E86A6'], [1, '#2B2438']]));
            for (const s of [-1, 1]) { g.fillStyle = '#FF3B5C'; g.beginPath(); g.moveTo(64 + s * 6, 54); g.lineTo(64 + s * 20, 50); g.lineTo(64 + s * 19, 58); g.lineTo(64 + s * 7, 59); g.fill(); }
            for (const [x, y, s] of [[44, 98, 1], [68, 108, 1.2], [90, 94, 0.9]]) outline(poly(arrowPts.map(([ax, ay]) => [x + ax * 30 * s, y - ay * 30 * s])), '#FF3B5C', 5);
            gloss(56, 28, 9, 4, -0.2);
          } else if (id === 'whale') {
            g.fillStyle = 'rgba(30,10,40,0.55)'; g.beginPath(); g.ellipse(64, 114, 38, 9, 0, 0, TAU); g.fill();
            g.strokeStyle = '#FF2E63'; g.lineWidth = 3; g.beginPath(); g.ellipse(64, 114, 44, 11, 0, 0, TAU); g.stroke();
            // the white whale side on, the square head to the right, coming down on its shadow
            const body = () => { g.beginPath(); g.moveTo(18, 50); g.bezierCurveTo(30, 42, 42, 30, 62, 26); g.lineTo(98, 22); g.quadraticCurveTo(116, 21, 116, 38); g.lineTo(116, 58); g.quadraticCurveTo(116, 74, 100, 75);
              g.bezierCurveTo(80, 79, 56, 81, 42, 73); g.bezierCurveTo(32, 67, 24, 62, 18, 58); g.closePath(); };
            outline(poly([[20, 51], [6, 30], [2, 42], [11, 54], [3, 68], [10, 76], [20, 58]]), lin(0, 30, 0, 76, [[0, '#FFFFFF'], [1, '#BCC9D8']]), 6);
            outline(body, lin(0, 22, 0, 80, [[0, '#FFFFFF'], [0.55, '#E9EEF4'], [1, '#AFBDCF']]));
            outline(() => { g.beginPath(); g.moveTo(62, 74); g.quadraticCurveTo(56, 88, 46, 92); g.quadraticCurveTo(54, 80, 52, 74); g.closePath(); }, '#C9D3E0', 5);
            g.strokeStyle = '#9DAEC4'; g.lineWidth = 2.5;   // scars
            for (const [x0, y0, x1, y1] of [[96, 26, 108, 40], [101, 25, 113, 36], [113, 46, 105, 60], [46, 35, 58, 40]]) { g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + 3, (y0 + y1) / 2 - 2, x1, y1); g.stroke(); }
            g.lineWidth = 2; g.beginPath(); g.arc(70, 34, 3, 0, TAU); g.stroke(); g.beginPath(); g.arc(76, 30, 2.2, 0, TAU); g.stroke();
            g.lineWidth = 3.5; g.strokeStyle = INK; g.beginPath(); g.moveTo(112, 69); g.quadraticCurveTo(94, 74, 82, 70); g.quadraticCurveTo(77, 68, 76, 62); g.stroke();   // the grin, one corner up
            outline(() => { g.beginPath(); g.arc(88, 51, 5.5, 0, TAU); }, '#FFFFFF', 3.5); g.fillStyle = INK; g.beginPath(); g.arc(89.5, 51.5, 3, 0, TAU); g.fill();
            g.fillStyle = '#D5DDE8'; g.beginPath(); g.arc(88, 51, 6, PI * 1.2, PI * 1.8); g.fill();
            g.lineWidth = 3; g.beginPath(); g.moveTo(81, 41); g.quadraticCurveTo(87, 34, 95, 37); g.stroke();   // the cocked brow
            g.lineWidth = 3; g.beginPath(); g.moveTo(104, 25); g.quadraticCurveTo(107, 21, 110, 25); g.stroke();
            g.strokeStyle = '#FFFFFF'; g.lineWidth = 4; for (const x of [40, 64, 88]) { g.beginPath(); g.moveTo(x, 2); g.lineTo(x, 12); g.stroke(); }
            gloss(76, 28, 13, 3.5, -0.08);
          } else if (id === 'diamond') {
            const outl = [[64, 116], [16, 50], [36, 24], [92, 24], [112, 50]];
            outline(poly(outl), '#E6FBFF', 7);
            const facets = [[[16, 50], [36, 24], [50, 50]], [[36, 24], [64, 24], [50, 50]], [[64, 24], [78, 50], [50, 50]], [[64, 24], [92, 24], [78, 50]], [[92, 24], [112, 50], [78, 50]], [[16, 50], [50, 50], [64, 116]], [[50, 50], [78, 50], [64, 116]], [[78, 50], [112, 50], [64, 116]]];
            const fc = ['#BFF6FF', '#FFFFFF', '#FFC6EE', '#E6FBFF', '#9FE8FF', '#7FDFFF', '#D8C2FF', '#9FF7D8'];
            facets.forEach((f, i) => { g.fillStyle = fc[i]; poly(f)(); g.fill(); });
            g.strokeStyle = 'rgba(30,80,120,0.55)'; g.lineWidth = 2; facets.forEach((f) => { poly(f)(); g.stroke(); });
            g.lineWidth = 7; g.strokeStyle = INK; poly(outl)(); g.stroke();
            g.fillStyle = '#FFFFFF'; for (const [x, y, r] of [[104, 18, 6], [20, 94, 4]]) { g.beginPath(); g.moveTo(x, y - r * 2); g.lineTo(x + r * 0.5, y); g.lineTo(x, y + r * 2); g.lineTo(x - r * 0.5, y); g.closePath(); g.fill(); g.beginPath(); g.moveTo(x - r * 2, y); g.lineTo(x, y + r * 0.5); g.lineTo(x + r * 2, y); g.lineTo(x, y - r * 0.5); g.closePath(); g.fill(); }
          } else if (id === 'moon') {
            outline(() => { g.beginPath(); g.arc(100, 26, 18, 0, TAU); }, '#F4EED8', 5); g.fillStyle = '#D8D0B4'; g.beginPath(); g.arc(94, 22, 4, 0, TAU); g.arc(106, 32, 3, 0, TAU); g.fill();
            g.save(); g.translate(56, 72); g.rotate(PI / 4);
            outline(() => { g.beginPath(); g.moveTo(0, 30); g.quadraticCurveTo(-18, 46, 0, 64); g.quadraticCurveTo(18, 46, 0, 30); }, '#FF9A3C', 5);
            outline(poly([[-15, 10], [-27, 30], [-13, 26]]), '#FF3EA5', 5); outline(poly([[15, 10], [27, 30], [13, 26]]), '#FF3EA5', 5);
            outline(() => { g.beginPath(); g.moveTo(0, -44); g.bezierCurveTo(18, -30, 17, 0, 15, 28); g.lineTo(-15, 28); g.bezierCurveTo(-17, 0, -18, -30, 0, -44); g.closePath(); }, lin(-16, 0, 16, 0, [[0, '#D9D2C2'], [0.5, '#FFFFFF'], [1, '#E2DBCB']]));
            g.fillStyle = '#2BE07A'; g.beginPath(); g.moveTo(0, -44); g.bezierCurveTo(11, -36, 13, -28, 13.5, -22); g.lineTo(-13.5, -22); g.bezierCurveTo(-13, -28, -11, -36, 0, -44); g.fill();
            g.fillStyle = '#FF3EA5'; g.fillRect(-15, 14, 30, 6);
            outline(() => { g.beginPath(); g.arc(0, -4, 7, 0, TAU); }, '#1D2E5C', 4);
            g.restore();
          }
          g.restore();
        }
        function iconCanvas(id, size) { const c = document.createElement('canvas'); c.width = c.height = size || 128; icon(c.getContext('2d'), id, size || 128); return c; }

        /* ------------------------------------------------------------------ the FUD haze (2D overlay, the edges only)
         * (The owner's third review, 7 Oct: "sometimes a giant blue cloud appears with red down arrows ... it blocks
         * entire view, that shouldn't happen". Until then this was an ink splat over the middle 35% of the screen.)
         * A light violet haze in from the screen's edges, darkest in the corners, a red tinge along the top: nothing at
         * all inside an ellipse through the middle of the screen (o.clear of the way from its centre, o.cy down, to
         * the edges; 0.92 and 0.56 as they come), which holds the road ahead (x 0.2 to 0.8, y 0.3 down) and your kart.
         * Painted once; its opacity is the overlay's. */
        function paintFudEdge(ctx, W, H, o) {
          o = o || {}; const clear = o.clear || 0.92, cy = (o.cy === undefined ? 0.56 : o.cy) * H, a = o.alpha === undefined ? 0.55 : o.alpha;
          const g = ctx; g.save();
          // (an ellipse the screen's half width by its half height, as a unit circle)
          g.translate(W / 2, cy); g.scale(W / 2, H / 2);
          const hz = g.createRadialGradient(0, 0, clear, 0, 0, 1.55);
          hz.addColorStop(0, 'rgba(40,22,70,0)'); hz.addColorStop(0.3, `rgba(40,22,70,${(a * 0.4).toFixed(3)})`); hz.addColorStop(1, `rgba(18,10,34,${a.toFixed(3)})`);
          g.fillStyle = hz; g.fillRect(-1.1, -2.2, 2.2, 4.4);
          // (the red tinge: along the top only, the side the cloud hangs over)
          const rd = g.createRadialGradient(0, -1.15, 0.2, 0, -1.15, 1.0);
          rd.addColorStop(0, `rgba(255,59,92,${(a * 0.32).toFixed(3)})`); rd.addColorStop(1, 'rgba(255,59,92,0)');
          g.globalCompositeOperation = 'source-atop'; g.fillStyle = rd; g.fillRect(-1.1, -2.2, 2.2, 4.4);
          g.restore();
          return { clear, cy: cy / H };
        }

        const build = { airdrop, gmbag, rug, wallet, laser, pump, wow, fud, whale, diamond, moon };
        const api = { PAL, ITEMS, CLS, KZ, TILES, build, fxMaterial, ItemFX, Ribbon, VFX, play, icon, iconCanvas, paintFudEdge, paintAtlas, kit, Acc, FxAcc, rng, util: { sat, clamp, lerp, sstep, smin } };
        root.MemeKartItems = api;
      })(KI);
      KITEMS = KI.MemeKartItems;
      return KITEMS;
    }

    /* ------------------------------------------- the items on each racer -- */
    // Where the items a racer carries sit on its kart, each racer's own (the sheet fitted them to Pepe's; these are
    // measured off each racer's near level, 7 Oct): the Pump on the deck beside the seat [x, y, z, scale] with its hose
    // into the kart; Diamond Hands raised either side [x, y, z, scale] with their light trails off the rear wheels; the
    // eyes Laser Eyes flare from; the To The Moon rocket strapped behind the seat [x, y, z, scale, nose-up pitch in
    // radians] (refitted 7 Oct to sit on each kart: its front strap's bracket on the deck, the cage, the bed or the
    // wing behind the seat, and clear of the racer's back; where the deck behind the seat is short, Doge's, Bull Run's,
    // Moon Cat's and the Whale's, it leans back on it, nose up, launch-ready); the Cold Wallet's
    // dome [centre x, y, z, radius across, up, along]; Much Wow's orbit [radius, height]. A racer the roster does not
    // have (a world's own, the greybox) gets them fitted to its box ({ min: [x, y, z], max: [x, y, z] }, the kart frame)
    var KITEM_MOUNT = {
      pepe: { pump: [0.62, 0.34, -0.6, 1], hose: [-0.32, -0.02, 0.32], hands: [0.76, 1.0, -0.12, 1.5], rear: [[0.6, -0.82], [-0.6, -0.82]], eyes: [0.132, 1.216, -0.074], rocket: [0, 1.02, -1.07, 0.85], dome: [0, 0.62, 0.05, 1.22, 0.98, 1.5], wow: [1.45, 0.95] },
      doge: { pump: [0.58, 0.28, -0.62, 1], hose: [-0.3, -0.02, 0.3], hands: [0.76, 1.0, -0.12, 1.5], rear: [[0.58, -0.78], [-0.58, -0.78]], eyes: [0.097, 0.973, 0.065], rocket: [0, 0.62, -0.9, 0.75, 0.44], dome: [0, 0.62, -0.035, 1.18, 0.98, 1.42], wow: [1.45, 0.95] },
      shiba: { pump: [0.6, 0.28, -0.6, 1], hose: [-0.3, -0.02, 0.3], hands: [0.74, 0.95, -0.12, 1.45], rear: [[0.6, -0.72], [-0.6, -0.72]], eyes: [0.087, 0.983, 0.047], rocket: [0, 0.93, -1.02, 0.85], dome: [0, 0.6, -0.03, 1.2, 0.9, 1.36], wow: [1.45, 0.95] },
      bike: { pump: [0.34, 0.32, -0.55, 0.95], hose: [-0.22, 0.1, 0.2], hands: [0.7, 1.05, 0.2, 1.4], rear: [[0.12, -0.76], [-0.12, -0.76]], eyes: [0.079, 1.123, 0.667], rocket: [0, 0.71, -0.98, 0.75, 0.25], dome: [0, 0.62, -0.01, 1.0, 0.98, 1.3], wow: [1.25, 1.0] },
      bull: { pump: [0.6, 0.3, -0.5, 1], hose: [-0.3, -0.02, 0.3], hands: [0.98, 1.05, -0.1, 1.5], rear: [[0.6, -0.6], [-0.6, -0.6]], eyes: [0.112, 1.047, 0.018], rocket: [0, 0.64, -0.8, 0.75, 0.44], dome: [0, 0.62, 0.125, 1.28, 1.0, 1.38], wow: [1.5, 1.0] },
      bear: { pump: [0.66, 0.3, -0.75, 1.05], hose: [-0.32, -0.02, 0.32], hands: [0.85, 1.12, -0.1, 1.6], rear: [[0.66, -0.92], [-0.66, -0.92]], eyes: [0.094, 1.072, 0.076], rocket: [0, 1.24, -1.12, 0.85], dome: [0, 0.66, -0.05, 1.28, 1.08, 1.56], wow: [1.55, 1.05] },
      whale: { pump: [0.62, 0.3, -0.7, 1], hose: [-0.3, -0.02, 0.3], hands: [0.92, 1.1, -0.1, 1.55], rear: [[0.6, -0.9], [-0.6, -0.9]], eyes: [0.124, 0.948, 0.112], rocket: [0, 0.86, -1.18, 0.85, 0.44], dome: [0, 0.66, -0.09, 1.22, 1.1, 1.5], wow: [1.5, 1.05] },
      mooncat: { pump: [0.62, 0.3, -0.65, 1], hose: [-0.3, -0.02, 0.3], hands: [0.8, 1.0, -0.1, 1.5], rear: [[0.6, -0.82], [-0.6, -0.82]], eyes: [0.109, 0.968, 0.048], rocket: [0, 0.8, -1.03, 0.75, 0.44], dome: [0, 0.62, -0.08, 1.24, 0.94, 1.43], wow: [1.45, 0.95] },
    };
    // On the snow sled (ctx.kart.racer(id, { ride: 'sled' })): the rider's eyes (its own, moved to where it sits on the
    // sled: the eyes measured on its kart less that kart's seat, or the eyes a world's added racer gave), Diamond Hands
    // raised as high over its seat as on its kart, and the sled's own Pump deck, light trails off the track's back
    // corners, rocket on the tunnel behind the seat and Wallet dome. ride: what kart.js knows of the racer (its H.ride),
    // else what ctx.kart.racer was asked for that id.
    function kartItemMount(id, box, ride) {
      if (ride === undefined && id && typeof KRS !== 'undefined' && KRS && KRS.ride) ride = KRS.ride[id];
      if (ride === 'sled' && id) { var sm = kartSledMount(id); if (sm) return sm; }
      if (id && KITEM_MOUNT[id]) return KITEM_MOUNT[id];
      var b = box || { min: [-0.76, 0, -1.07], max: [0.76, 1.55, 1.06] }, hx = Math.max(Math.abs(b.min[0]), b.max[0]), top = b.max[1], z0 = b.min[2], z1 = b.max[2], zc = (z0 + z1) / 2;
      return { pump: [hx - 0.14, 0.32, z0 + 0.46, 1], hose: [-0.3, -0.02, 0.3], hands: [Math.max(0.76, hx * 0.9), top * 0.65, zc - 0.1, 1.5], rear: [[hx - 0.16, z0 + 0.25], [-(hx - 0.16), z0 + 0.25]],
        eyes: [0.12, top * 0.78, zc + 0.05], rocket: [0, top * 0.74, z0 - 0.11, 0.85], dome: [0, 0.62, zc, hx + 0.46, Math.max(0.6, top + 0.05 - 0.62), (z1 - z0) / 2 + 0.43], wow: [Math.max(1.3, hx * 1.9), Math.max(0.8, top * 0.6)] };
    }
    var KSLED_MOUNT = null;
    function kartSledMount(id) {
      var L = kartRosterLib(), f = L.sledFit ? L.sledFit(id) : null;
      if (!f || !L.SLED) return null;
      var C = KSLED_MOUNT || (KSLED_MOUNT = {});
      if (C[id]) return C[id];
      var base = KITEM_MOUNT[id], ks = f.kartSeat, M = L.SLED.MOUNT, s = f.s;
      var e = f.eyes || (base ? [base.eyes[0] - ks[0], base.eyes[1] - ks[1], base.eyes[2] - ks[2]] : [0.1, 0.7, 0.2]);
      var hands = base ? [base.hands[0], base.hands[1] - ks[1] + f.seat[1], base.hands[2] - ks[2] + f.seat[2], base.hands[3]] : [0.8, f.seat[1] + 0.75, f.seat[2] + 0.06, 1.5];
      return (C[id] = { pump: M.pump.slice(), hose: M.hose.slice(), hands: hands, rear: M.rear.map(function (r) { return r.slice(); }),
        eyes: [e[0] * s, f.seat[1] + e[1] * s, f.seat[2] + e[2] * s], rocket: M.rocket.slice(), dome: M.dome.slice(), wow: base ? base.wow.slice() : [1.45, 1.0] });
    }
