/* GameMog endoskeleton: the chrome machine a library person can be (runtime v1).
 *
 * ctx.assets.human(id, { endo: true | { metal, eyes, glow, rim, rimColor } }) draws the
 * person as an endoskeleton of warm, grimy nickel chrome in place of skin,
 * clothes and hair: a heavy machine, its outline close to the person's own at
 * muscle 1. A satin skull with red optics on a thick ringed neck, pistons from the
 * base of the neck and from behind it to big ball-housed shoulders under domed
 * caps, a Y plate over a deep cage of curved rib plates (chevrons from the front,
 * an open arch under the sternum) crowded with cylinders, shoulder-blade plates
 * and a backbone behind, a thick segmented spine between pistons and hoses, a
 * wide pelvic girdle with iliac plates and a drum on each hip, limbs that are
 * bundles of big hydraulic cylinders round a strut, heavy domed knees and hinged
 * elbows, big hands of five three-jointed fingers and four plated toes to a foot. The page carries this script only for a world whose
 * source says endo: (lib/custom-game.ts).
 *
 * It is one SkinnedMesh bound to the person's own 66-bone skeleton, so every
 * captured clip, the fights, the finisher and the pick-ups move it unchanged.
 * Every part is built once per body, in the skeleton's rest pose (the bones of
 * the library people carry no rotation at rest, so mesh space is the rest pose
 * itself), and each vertex follows exactly one bone: a machine bends at its
 * joints, never along a strut. Only hoses and cables that cross a joint blend
 * between the bones at their two ends, the way rubber would.
 *
 * Materials, at most six: chrome, a darker steel for the works inside, black
 * rubber, ivory teeth, the red optics (bright past white, so bloom catches
 * them) and a near-black for the cavities. Grime in the crevices, smudges in
 * the polish and dark rust stains are worked out in the shader from the rest
 * position, so they stay put on the part as it moves and cost no textures.
 *
 * GameMogEndo.make(THREE, rig, { muscle, low }) -> { geometry, triangles, ms, eyes, eyeSize }
 *   (rig: { skeleton, names, height, shoulder: the left shoulder01's rotation in the clips, [x, y, z, w] })
 * GameMogEndo.materials(THREE, o) -> [chrome, steel, rubber, teeth, eye, dark]  (o: { metal, eyes, glow, rim, rimColor })
 * GameMogEndo.head(THREE, opts) -> buildEndoHead (below), for tools.
 */
var GameMogEndo = (function () {
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function sm(e0, e1, x) { var u = clamp((x - e0) / (e1 - e0), 0, 1); return u * u * (3 - 2 * u); }
  var SLOTS = { chrome: 0, worn: 0, steel: 1, rubber: 2, teeth: 3, eye: 4, dark: 5 };

  /* ==========================================================================
   * buildEndoHead(THREE, opts) -> { group, parts: { head, jaw, neck, shoulders } }
   *
   * The skull on its own, so a better one can be pasted over this block
   * without touching the body: its origin is the skull's centre, the face
   * looks down +Z, units are metres. The body fits it by its bounding box (the
   * crown on the person's crown, about 0.265 from crown to chin) and takes
   * parts.head (with the jaw inside it or beside it in parts.jaw) onto the
   * head bone; the library skeleton has no jaw bone. parts.neck and
   * parts.shoulders are left out: the body builds its own, on its own bones.
   * Each mesh's finish comes from mesh.userData.endo, or from the end of its
   * name ('endo-head-chrome'), or is guessed from its material: 'chrome',
   * 'worn' (chrome with rust), 'steel', 'dark', 'rubber', 'teeth', 'eye'. Its
   * vertex colours (grime, rust) are kept, relative to the mesh's own
   * brightest, under the body's materials. Its Sprites are not drawn as they
   * are: each marks an eye's centre, where the runtime hangs a glow of the
   * optics' own colour on the head bone (opts.detail below 1 builds a coarser
   * skull, for phones). It may use any JavaScript the browsers run.
   * ========================================================================== */
  // (the design panel's head, pasted from scripts/.scratch/endo/final/head.js, 04 Oct 23:07)
  function buildEndoHead(THREE, opts) {
    opts = opts || {};
    const T0 = performance.now(), stats = {};
    const { abs, sqrt, min, max, sin, cos, atan2, acos, asin, PI, pow } = Math;
    const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    const lerp = (a, b, t) => a + (b - a) * t;
    const sstep = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const smin = (a, b, k) => { const h = sat(0.5 + 0.5 * (b - a) / k); return b + (a - b) * h - k * h * (1 - h); };
    const smax = (a, b, k) => -smin(-a, -b, k);
    let seed = 90210;
    const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const GLOW = opts.glow === undefined ? 1 : sat(+opts.glow || 0);
    const yS = opts.shoulderY !== undefined ? +opts.shoulderY : -0.222 - (+opts.shoulderDrop || 0);   // shoulder rod height

    // ---------------------------------------------------------------- SDF primitives
    const ell = (x, y, z, a, b, c) => {
      const X = x / a, Y = y / b, Z = z / c;
      const k0 = sqrt(X * X + Y * Y + Z * Z), k1 = sqrt(X * X / (a * a) + Y * Y / (b * b) + Z * Z / (c * c)) + 1e-9;
      return k0 * (k0 - 1) / k1;
    };
    const rbox = (x, y, z, bx, by, bz, r) => {
      const qx = abs(x) - bx + r, qy = abs(y) - by + r, qz = abs(z) - bz + r;
      const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0, mz = qz > 0 ? qz : 0;
      return sqrt(mx * mx + my * my + mz * mz) + min(max(qx, max(qy, qz)), 0) - r;
    };
    const rbox2 = (x, y, bx, by, r) => {
      const qx = abs(x) - bx + r, qy = abs(y) - by + r, mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0;
      return sqrt(mx * mx + my * my) + min(max(qx, qy), 0) - r;
    };
    // signed distance to a closed polygon in the plane
    const poly2 = (px, py, P) => {
      let dd = 1e9, s = 1;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const ex = P[j][0] - P[i][0], ey = P[j][1] - P[i][1], wx = px - P[i][0], wy = py - P[i][1];
        const t = sat((wx * ex + wy * ey) / (ex * ex + ey * ey)), bx = wx - ex * t, by = wy - ey * t;
        dd = min(dd, bx * bx + by * by);
        const c1 = py >= P[i][1], c2 = py < P[j][1], c3 = ex * wy > ey * wx;
        if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
      }
      return s * sqrt(dd);
    };
    // rounded box from A to B; `ref` picks the w axis (w = u x ref), ha / hb are half sizes along v / w
    const mkObox = (A, B, ref, ha, hb, r, ha1_) => {
      let ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2]; const L = Math.hypot(ux, uy, uz); ux /= L; uy /= L; uz /= L;
      let wx = uy * ref[2] - uz * ref[1], wy = uz * ref[0] - ux * ref[2], wz = ux * ref[1] - uy * ref[0]; const wl = Math.hypot(wx, wy, wz); wx /= wl; wy /= wl; wz /= wl;
      const vx = wy * uz - wz * uy, vy = wz * ux - wx * uz, vz = wx * uy - wy * ux;
      const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, mz = (A[2] + B[2]) / 2, hl = L / 2;
      const ha1 = ha1_ === undefined ? ha : ha1_;   // optional taper of ha from A to B
      return (x, y, z) => { const px = x - mx, py = y - my, pz = z - mz, lu = px * ux + py * uy + pz * uz; return rbox(lu, px * vx + py * vy + pz * vz, px * wx + py * wy + pz * wz, hl, lerp(ha, ha1, sat(0.5 + lu / (2 * hl))), hb, r); };
    };

    // ---------------------------------------------------------------- the skull field
    const CC = { y: 0.038, z: -0.011 };                 // cranium centre, also the ray origin for the cranium plates
    const EYE = { x: 0.0335, y: 0.0105 };
    // cranium: superellipsoid, boxy in the front view (near-vertical sides, broad flat crown), rounder in profile
    const CR = { x: 0.0785, up: 0.107, dn: 0.1, z: 0.096, n: 2.9, m: 2.3 };
    function cranium(ax, y, z) {
      const u = ax / CR.x, dy = y - CC.y, v = abs(dy) / (dy > 0 ? CR.up : CR.dn), w = abs(z - CC.z) / CR.z;
      const fxy = pow(pow(u, CR.n) + pow(v, CR.n), 1 / CR.n);
      return (pow(pow(fxy, CR.m) + pow(w, CR.m), 1 / CR.m) - 1) * 0.088;
    }
    function faceMass(ax, y, z) {
      // cheek block: full width under the sockets, bottom edge near y -0.038, front curving back to the sides
      const front = (z - 0.07 + 9 * ax * ax) / sqrt(1 + 324 * ax * ax), side = ax - 0.074 + max(0, 0.016 - y) * 0.2;
      let d = smax(smax(smax(abs(y + 0.011) - 0.027, front, 0.012), -0.012 - z, 0.012), side, 0.012);
      d = smin(d, Math.hypot(ax - 0.066 - z * 0.05, y + 0.011 + z * 0.08, max(0, -0.04 - z, z + 0.004)) - 0.0068, 0.008);   // zygomatic arch
      // maxilla: narrower, following the dental arch down to the gum line
      const taper = 1 + max(0, -0.03 - y) * 4;
      d = smin(d, rbox(ax * taper, y + 0.046, z - 0.0365 + 20 * ax * ax, 0.042, 0.021, 0.0435, 0.011), 0.01);
      d = smin(d, ell(ax - 0.064, y + 0.04, z - 0.002, 0.011, 0.02, 0.022), 0.01);      // hinge cover
      return smin(d, ell(ax, y + 0.0545, z - 0.0752, 0.022, 0.0085, 0.0085), 0.006);   // bulge under the nose
    }
    const faceHull = (x, y, z) => { const ax = abs(x); return smin(cranium(ax, y, z), faceMass(ax, y, z), 0.012); };
    const crHull = (x, y, z) => cranium(abs(x), y, z);
    // eye socket: a rounded rectangle tilted so the inner end sits lower (the scowl), the outer-top corner rounded most
    const SOCK = { cx: 0.0372, cy: 0.0096, hw: 0.0285, hh: 0.0146, th: 0.16, tk: 0.1, rOT: 0.0145, rIT: 0.0055, rOB: 0.0095, rIB: 0.0105 };
    const sc = cos(SOCK.th), ss = sin(SOCK.th);
    const sockR = (lx, ly) => (lx > 0 ? (ly > 0 ? SOCK.rOT : SOCK.rOB) : (ly > 0 ? SOCK.rIT : SOCK.rIB));
    const shear = (lx, ly) => ly - SOCK.tk * lx * sstep(-0.004, 0.006, ly);   // the top edge slopes on toward the nose
    function sock2(ax, y, g) {
      const sx = ax - SOCK.cx, sy = y - SOCK.cy, lx = sx * sc + sy * ss, ly = shear(lx, sy * sc - sx * ss);
      return rbox2(lx, ly, SOCK.hw + g, SOCK.hh + g, sockR(lx, ly) + g);
    }
    function socket(ax, y, z, g) {
      const sx = ax - SOCK.cx, sy = y - SOCK.cy, lx = sx * sc + sy * ss, ly = shear(lx, sy * sc - sx * ss);
      return rbox(lx, ly, z - 0.096, SOCK.hw + g, SOCK.hh + g, 0.043, sockR(lx, ly) + g);
    }
    const sockXY = (lx, ly) => { ly += SOCK.tk * lx * sstep(-0.004, 0.006, ly); return [SOCK.cx + lx * sc - ly * ss, SOCK.cy + lx * ss + ly * sc]; };
    function sockEdge(ax, dir) {   // y of the socket's top (dir 1) or bottom (dir -1) edge at this x
      ax = min(max(ax, 0.0118), 0.0628);
      const yc = SOCK.cy + (ax - SOCK.cx) * ss / sc;
      let lo = 0, hi = 0.035;
      for (let k = 0; k < 16; k++) { const m = (lo + hi) / 2; if (sock2(ax, yc + dir * m, 0) < 0) lo = m; else hi = m; }
      return yc + dir * lo;
    }
    // nasal aperture: an inverted heart (narrow top under the bridge, two lobes at the bottom with a cusp between)
    const NOSEP = (() => {
      const R = [[0, 0.0015], [0.0036, -0.005], [0.0078, -0.0128], [0.012, -0.0208], [0.0155, -0.0285], [0.0174, -0.0352], [0.017, -0.0392], [0.0143, -0.0426], [0.009, -0.0439], [0.0037, -0.0423], [0, -0.0401]];
      return R.concat(R.slice(1, -1).reverse().map(([x, y]) => [-x, y]));
    })();
    const noseHW = (y) => { const R = NOSEP; if (y >= R[0][1]) return 0; for (let i = 1; i < 7; i++) if (y >= R[i][1]) return lerp(R[i - 1][0], R[i][0], (R[i - 1][1] - y) / (R[i - 1][1] - R[i][1])); return R[6][0]; };
    const nose2 = (ax, y) => { const bx = ax - 0.0192, by = abs(y + 0.021) - 0.0235; if (bx > 0.004 || by > 0.004) return Math.hypot(max(bx, 0), max(by, 0)); return poly2(ax, y, NOSEP); };
    const nose3 = (ax, y, z) => max(nose2(ax, y), abs(z - 0.086) - 0.03);
    const cheekCav = (ax, y, z) => ell(ax - 0.05, y + 0.05, z - 0.04, 0.019, 0.021, 0.03);
    function skull(x, y, z) {
      const ax = abs(x);
      let d = cranium(ax, y, z);
      // underside: rises toward the back so the occiput tucks in over the neck; temples tucked in
      d = smax(d, -0.03 + max(0, -0.026 - z) * 0.21 + max(0, ax - 0.052) * 0.6 - y, 0.02);
      d = smin(d, ell(ax, y + 0.044, z + 0.046, 0.038, 0.028, 0.042), 0.026);            // skull base the neck plugs into
      let f = faceMass(ax, y, z);
      f = smax(f, -0.0652 + 6 * ax * ax - y, 0.003);                                   // face stops at the upper gum line
      d = smin(d, f, 0.012);
      d = smin(d, rbox(ax - 0.041 + max(0, -0.05 - y) * 0.4, y + 0.056, z - 0.004, 0.018, 0.022, 0.016, 0.006), 0.006); // back wall of the cheek cavity
      d = smax(d, -socket(ax, y, z, 0), 0.0025);
      d = smax(d, -nose3(ax, y, z), 0.002);
      d = smax(d, -cheekCav(ax, y, z), 0.006);
      return d;
    }
    // ---------------------------------------------------------------- the mandible field (closed mouth, head space)
    const jawRamus = mkObox([0.057, -0.099, 0.01], [0.063, -0.04, -0.011], [0, 0, 1], 0.0145, 0.005, 0.0035, 0.0068);   // ramus: broad at the angle, narrow neck up to the hinge
    const jawHW = (y) => lerp(0.026, 0.064, sstep(-0.124, -0.072, y));   // half width in the front view: tapers to the chin
    function jaw(x, y, z) {
      const ax = abs(x), k = 0.045 / jawHW(y);
      // U in the top view: the front follows the lower dental arch, the sides run back to the angles
      const o = rbox2(x * k, z - 0.033, 0.045, 0.045, 0.03) / max(1, k);
      let d = max(o, -o - 0.0115);
      const top = -0.0866 + 6 * x * x - 0.75 * max(0, ax - 0.033);         // under the lower teeth' dark roots (smile), low at the sides
      const bot = -0.1238 + 4 * x * x + 0.3 * max(0, 0.066 - z);           // lower border rises to the sides and the angle
      d = smax(smax(d, y - top, 0.004), (bot - y) * 0.8, 0.004);
      d = max(d, -z - 0.008);
      d = smin(d, rbox(x, y + 0.1125, z - 0.0705, 0.0185, 0.0115, 0.0085, 0.0075), 0.006);   // rounded-square chin
      d = smin(d, jawRamus(ax, y, z), 0.016);
      d = smin(d, Math.hypot(ax - 0.061, y + 0.037, z + 0.013) - 0.0092, 0.004);           // condyle at the hinge
      return d;
    }

    // ---------------------------------------------------------------- marching cubes
    const TRI = (',083,019,183981,12a,08312a,92a029,2832a8a98,3b2,0b28b0,19023b,1b219b98b,3a1ba3,0a108a8ba,3903b9ba9,98aa8b,478,430734,019847,419471731,12a847,34730412a,92a902847,2a9297273794,8473b2,b47b24204,90184723b,47b94b9b2921,3a13ba784,1ba14b1047b4,47890b9bab03,47b4b99ba,954,954083,054150,854835315,12a954,30812a495,52a542402,2a5325354348,95423b,0b208b495,05401523b,21525828b485,a3ba13954,4950818a18ba,54050b5bab03,54858aa8b,978579,930953573,078017157,153357,978957a12,a12950530573,802825857a52,2a5253357,7957893b2,95797292027b,23b018178157,b21b17715,958857a13a3b,5705097b010aba0,ba0b03a50807570,ba57b5,a65,0835a6,9015a6,1831985a6,165261,165126308,965906026,598582526328,23ba65,b08b20a65,01923b5a6,5a61929b298b,63b653513,08b0b50515b6,3b6036065059,65969bb98,5a6478,43047365a,1905a6847,a65197173794,612651478,125526304347,847905065026,739794329596269,3b2784a65,5a647242027b,01947823b5a6,9219b294b7b45a6,8473b53515b6,51b5b610b7b404b,059065036b63847,65969b4797b9,a4964a,4a649a083,a01a60640,83181686461a,149124264,308129249264,024426,832824426,a49a64b23,08228b49a4a6,3b201606461a,64161a48121b8b1,964936913b63,8b1810b61914641,3b6360064,648b68,7a678a89a,0730a709a67a,a671a7178180,a67a71173,126168189867,269291679093739,780706602,732672,23ba68a89867,20727b09767a9a7,1801781a767a23b,b21b17a61671,896867916b63136,091b67,7807063b0b60,7b6,76b,308b76,019b76,819831b76,a126b7,12a3086b7,2902a96b7,6b72a3a83a98,723627,708760620,276237019,162186198876,a76a17137,a7617a187108,03707a0a96a7,76a7a88a9,684b86,36b306046,86b846901,946963931b36,6846b82a1,12a30b06b046,4b846b0292a9,a93a32943b36463,823842462,042462,190234246438,194142246,8138618466a1,a10a06604,4634386a3039a93,a946a4,49576b,083495b76,50154076b,b76834354315,954a1276b,6b712a083495,76b54a42a402,348354325a52b76,723762549,954086062687,362376150540,628687218485158,954a16176137,16a176107870954,40a4a503a6a737a,76a7a854a48a,6956b9b89,36b063056095,0b805b01556b,6b3635531,12a95b9b8b56,0b306b09656912a,b85b56805a52025,6b36352a3a53,589528562382,956960062,158180568382628,156216,13616a386569896,a10a06950560,03856a,a56,b5a75b,b5ab75830,5b75ab190,a75ab7981831,b12b71751,08312717572b,9759279022b7,75272b592328982,25a235375,820852875a25,9015a35373a2,982921872a25752,135375,087071175,903935537,987597,5845a8ab8,5045b05abb30,01984a8aba45,ab4a45b34941314,2512852b8458,04b0b345b2b151b,0250592b5458b85,9452b3,25a352345384,5a2524420,3a235a385458019,5a2524192942,845853351,045105,845853905035,945,4b749b9ab,0834979b79ab,1ab1b414074b,3143481a474bab4,4b79b492b912,9749b791b2b1083,b74b42240,b74b42834324,29a279237749,9a7974a27870207,37a3a274a1a040a,1a2874,491417713,491417081871,403743,487,9a8ab8,30939bb9a,01a0a88ab,31ab3a,12b1b99b8,30939b1292b9,02b80b,32b,23828aa89,9a2092,23828a0181a8,1a2,138918,091,038,')
      .split(',').map((s) => { const a = new Int8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = parseInt(s[i], 16); return a; });
    const EAX = [0, 1, 0, 1, 0, 1, 0, 1, 2, 2, 2, 2];
    const EOX = [0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0], EOY = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1], EOZ = [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0];

    // sample an SDF on a grid, only near the surface (4^3 node blocks far from it are filled with the block value);
    // with `mirror` the field is symmetric in x and only x >= 0 is evaluated.
    function field(sdf, box, h, mirror) {
      let nx = Math.ceil((box[3] - box[0]) / h) + 1; if (mirror && !(nx & 1)) nx++;
      const ny = Math.ceil((box[4] - box[1]) / h) + 1, nz = Math.ceil((box[5] - box[2]) / h) + 1;
      const x0 = mirror ? -((nx - 1) / 2) * h : box[0], y0 = box[1], z0 = box[2], nxy = nx * ny;
      const F = new Float32Array(nxy * nz), B = 4, far = 7.5 * h, i0 = mirror ? (nx - 1) / 2 : 0;
      let evals = 0;
      for (let bk = 0; bk < nz; bk += B) {
        const ke = min(bk + B, nz);
        for (let bj = 0; bj < ny; bj += B) {
          const je = min(bj + B, ny);
          for (let bi = i0; bi < nx; bi += B) {
            const ie = min(bi + B, nx);
            const dc = sdf(x0 + (bi + 1.5) * h, y0 + (bj + 1.5) * h, z0 + (bk + 1.5) * h); evals++;
            if (abs(dc) > far) { for (let k = bk; k < ke; k++) for (let j = bj; j < je; j++) { const row = nx * j + nxy * k; for (let i = bi; i < ie; i++) F[row + i] = dc; } }
            else for (let k = bk; k < ke; k++) for (let j = bj; j < je; j++) { const row = nx * j + nxy * k; for (let i = bi; i < ie; i++) { F[row + i] = sdf(x0 + i * h, y0 + j * h, z0 + k * h); evals++; } }
          }
        }
      }
      if (mirror) for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) { const row = nx * j + nxy * k; for (let i = 0; i < i0; i++) F[row + i] = F[row + nx - 1 - i]; }
      return { F, nx, ny, nz, nxy, x0, y0, z0, h, evals };
    }
    function sampleF(G, x, y, z) {
      const { F, nx, nxy, h } = G;
      let fx = (x - G.x0) / h, fy = (y - G.y0) / h, fz = (z - G.z0) / h;
      fx = fx < 0 ? 0 : fx > G.nx - 1.001 ? G.nx - 1.001 : fx; fy = fy < 0 ? 0 : fy > G.ny - 1.001 ? G.ny - 1.001 : fy; fz = fz < 0 ? 0 : fz > G.nz - 1.001 ? G.nz - 1.001 : fz;
      const i = fx | 0, j = fy | 0, k = fz | 0, tx = fx - i, ty = fy - j, tz = fz - k, q = i + nx * j + nxy * k;
      const a = F[q] + (F[q + 1] - F[q]) * tx, b = F[q + nx] + (F[q + nx + 1] - F[q + nx]) * tx;
      const c = F[q + nxy] + (F[q + nxy + 1] - F[q + nxy]) * tx, d = F[q + nxy + nx] + (F[q + nxy + nx + 1] - F[q + nxy + nx]) * tx;
      const e = a + (b - a) * ty, f = c + (d - c) * ty; return e + (f - e) * tz;
    }
    // polygonize into an accumulator; colFn(x, y, z, ao) gives the vertex colour (number or [r,g,b])
    function polygonize(G, acc, colFn, keep) {
      const { F, nx, ny, nz, nxy, x0, y0, z0, h } = G;
      const VID = new Int32Array(nxy * nz * 3).fill(-1);
      const v0 = acc.n, i0 = acc.I.length, g1 = [0, 0, 0], g2 = [0, 0, 0], KC = [];
      const kv = (id) => { let s = KC[id - v0]; if (s === undefined) { const P = acc.P; s = KC[id - v0] = !!keep(P[3 * id], P[3 * id + 1], P[3 * id + 2]); } return s; };
      const gr = (q, i, j, k, o) => {
        o[0] = F[i < nx - 1 ? q + 1 : q] - F[i > 0 ? q - 1 : q];
        o[1] = F[j < ny - 1 ? q + nx : q] - F[j > 0 ? q - nx : q];
        o[2] = F[k < nz - 1 ? q + nxy : q] - F[k > 0 ? q - nxy : q];
      };
      const ev = (i, j, k, e) => {
        i += EOX[e]; j += EOY[e]; k += EOZ[e];
        const ax = EAX[e], q = i + nx * j + nxy * k, key = q * 3 + ax;
        let id = VID[key]; if (id >= 0) return id;
        const q2 = q + (ax === 0 ? 1 : ax === 1 ? nx : nxy), a = F[q], b = F[q2], t = a / (a - b);
        let x = x0 + i * h, y = y0 + j * h, z = z0 + k * h;
        if (ax === 0) x += t * h; else if (ax === 1) y += t * h; else z += t * h;
        gr(q, i, j, k, g1); gr(q2, i + (ax === 0 ? 1 : 0), j + (ax === 1 ? 1 : 0), k + (ax === 2 ? 1 : 0), g2);
        const gx = g1[0] + (g2[0] - g1[0]) * t, gy = g1[1] + (g2[1] - g1[1]) * t, gz = g1[2] + (g2[2] - g1[2]) * t, l = Math.hypot(gx, gy, gz) || 1;
        id = acc.v(x, y, z, gx / l, gy / l, gz / l, 1);
        VID[key] = id; return id;
      };
      for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) {
        const row = nx * j + nxy * k;
        for (let i = 0; i < nx - 1; i++) {
          const q = row + i, r = q + nxy;
          let c = 0;
          if (F[q] > 0) c |= 1; if (F[q + 1] > 0) c |= 2; if (F[q + 1 + nx] > 0) c |= 4; if (F[q + nx] > 0) c |= 8;
          if (F[r] > 0) c |= 16; if (F[r + 1] > 0) c |= 32; if (F[r + 1 + nx] > 0) c |= 64; if (F[r + nx] > 0) c |= 128;
          if (c === 0 || c === 255) continue;
          const T = TRI[c];
          for (let t = 0; t < T.length; t += 3) {
            const a = ev(i, j, k, T[t]), b = ev(i, j, k, T[t + 1]), c2 = ev(i, j, k, T[t + 2]);
            if (keep && !kv(a) && !kv(b) && !kv(c2)) continue;
            acc.I.push(a, b, c2);
          }
        }
      }
      // orientation: make the signed volume positive
      const P = acc.P, I = acc.I; let vol = 0;
      for (let t = i0; t < I.length; t += 3) {
        const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
        vol += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
      }
      if (vol < 0) for (let t = i0; t < I.length; t += 3) { const s = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = s; }
      // ambient occlusion from the field, folded into the vertex colour
      for (let v = v0; v < acc.n; v++) {
        const x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2], N = acc.N, nx_ = N[3 * v], ny_ = N[3 * v + 1], nz_ = N[3 * v + 2];
        let occ = 0;
        for (let s = 1; s <= 5; s++) { const hs = s * 0.0042; occ += max(0, 1 - sampleF(G, x + nx_ * hs, y + ny_ * hs, z + nz_ * hs) / hs) / s; }
        const ao = sat(1 - 0.62 * max(0, occ - 0.12));
        const c = colFn(x, y, z, ao);
        if (typeof c === 'number') { acc.C[3 * v] = c; acc.C[3 * v + 1] = c; acc.C[3 * v + 2] = c; }
        else { acc.C[3 * v] = c[0]; acc.C[3 * v + 1] = c[1]; acc.C[3 * v + 2] = c[2]; }
      }
    }

    // ---------------------------------------------------------------- geometry accumulator
    class Acc {
      constructor() { this.P = []; this.N = []; this.U = []; this.C = []; this.I = []; this.n = 0; this.uvo = null; }
      v(x, y, z, nx, ny, nz, r, g, b) {
        this.P.push(x, y, z); this.N.push(nx, ny, nz);
        const ax = abs(nx), ay = abs(ny), az = abs(nz), S = 3.4;
        if (this.uvo) this.U.push(this.uvo[0], this.uvo[1]); else if (az >= ax && az >= ay) this.U.push(x * S + 0.5, y * S + 0.5); else if (ax >= ay) this.U.push(z * S + 0.5, y * S + 0.5); else this.U.push(x * S + 0.5, z * S + 0.5);
        this.C.push(r, g === undefined ? r : g, b === undefined ? r : b);
        return this.n++;
      }
      // triangle / quad wound to face along the stored normal
      otri(a, b, c) {
        const P = this.P, N = this.N;
        const ux = P[3 * b] - P[3 * a], uy = P[3 * b + 1] - P[3 * a + 1], uz = P[3 * b + 2] - P[3 * a + 2];
        const vx = P[3 * c] - P[3 * a], vy = P[3 * c + 1] - P[3 * a + 1], vz = P[3 * c + 2] - P[3 * a + 2];
        const d = (uy * vz - uz * vy) * N[3 * a] + (uz * vx - ux * vz) * N[3 * a + 1] + (ux * vy - uy * vx) * N[3 * a + 2];
        if (d < 0) this.I.push(a, c, b); else this.I.push(a, b, c);
      }
      oquad(a, b, c, d) {
        const P = this.P, N = this.N;
        const ux = P[3 * c] - P[3 * a], uy = P[3 * c + 1] - P[3 * a + 1], uz = P[3 * c + 2] - P[3 * a + 2];
        const vx = P[3 * d] - P[3 * b], vy = P[3 * d + 1] - P[3 * b + 1], vz = P[3 * d + 2] - P[3 * b + 2];
        const nx = N[3 * a] + N[3 * c], ny = N[3 * a + 1] + N[3 * c + 1], nz = N[3 * a + 2] + N[3 * c + 2];
        if ((uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz < 0) this.I.push(a, c, b, a, d, c); else this.I.push(a, b, c, a, c, d);
      }
      // append a three.js geometry transformed by m; col = number | [r,g,b] | fn(localPos) -> number | [r,g,b];
      // uvf(u, v) -> [u, v] maps the geometry's own uvs (else they come from the position)
      geo(g, m, col, uvf) {
        const pos = g.attributes.position, nor = g.attributes.normal, uv = uvf && g.attributes.uv, nm = new THREE.Matrix3().getNormalMatrix(m);
        const base = this.n, v = new THREE.Vector3(), n = new THREE.Vector3(), flip = m.determinant() < 0, keepUvo = this.uvo;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i);
          let c = col;
          if (typeof col === 'function') c = col(v.x, v.y, v.z);
          v.applyMatrix4(m); n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
          if (uv) this.uvo = uvf(uv.getX(i), uv.getY(i));
          if (Array.isArray(c)) this.v(v.x, v.y, v.z, n.x, n.y, n.z, c[0], c[1], c[2]); else this.v(v.x, v.y, v.z, n.x, n.y, n.z, c);
        }
        this.uvo = keepUvo;
        const idx = g.index, cnt = idx ? idx.count : pos.count;
        for (let i = 0; i < cnt; i += 3) {
          const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
          if (flip) this.I.push(base + a, base + c, base + b); else this.I.push(base + a, base + b, base + c);
        }
      }
      build() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
        g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
        g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
        return g;
      }
    }
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const Y = V(0, 1, 0), M4 = () => new THREE.Matrix4(), Q = new THREE.Quaternion();
    // place a Y-axis primitive so it runs from A to B
    const along = (A, B) => { const d = B.clone().sub(A), L = d.length(); Q.setFromUnitVectors(Y, d.divideScalar(L)); return { m: M4().compose(A.clone().lerp(B, 0.5), Q.clone(), V(1, 1, 1)), L }; };
    const cyl = (acc, A, B, r, seg, col, open) => { const { m, L } = along(A, B); acc.geo(new THREE.CylinderGeometry(r, r, L, seg || 12, 1, !!open), m, col); };
    const ball = (acc, C, r, col, ws) => acc.geo(new THREE.SphereGeometry(r, ws || 12, ws ? (ws * 0.66) | 0 : 8), M4().makeTranslation(C.x, C.y, C.z), col);
    const box = (acc, C, sx, sy, sz, col, rot) => acc.geo(new THREE.BoxGeometry(sx, sy, sz), M4().compose(C, rot || new THREE.Quaternion(), V(1, 1, 1)), col);
    // lathe profile [[r, h]...] along the segment A -> B (h in 0..1 of its length)
    const latheAB = (acc, A, B, prof, seg, col) => { const { m, L } = along(A, B); acc.geo(new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(r, (h - 0.5) * L)), seg), m, col); };
    function piston(acc, A, B, rs, rr, col, frac) {
      const S = A.clone().lerp(B, frac || 0.56), dir = B.clone().sub(A).normalize();
      cyl(acc, A, S, rs, 14, col);
      cyl(acc, A.clone().addScaledVector(dir, -0.001), A.clone().addScaledVector(dir, 0.004), rs * 1.18, 14, col);
      cyl(acc, S.clone().addScaledVector(dir, -0.004), S.clone().addScaledVector(dir, 0.001), rs * 1.15, 14, col);
      cyl(acc, S, S.clone().addScaledVector(dir, 0.003), rs * 0.78, 12, col);
      cyl(acc, S, B, rr, 10, typeof col === 'number' ? min(1.15, col * 1.1) : col);
      ball(acc, B, rr * 1.45, col);
    }
    const cable = (acc, pts, r, col, n) => acc.geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n || 28, r, 5, false), M4(), col);

    // ---------------------------------------------------------------- plates
    const R6 = new Float64Array(6), NN = [0, 0, 0];
    function hit(hull, ox, oy, oz, dx, dy, dz, tmax) {
      let a = 0, b = tmax;
      for (let k = 0; k < 17; k++) { const m = (a + b) * 0.5; if (hull(ox + dx * m, oy + dy * m, oz + dz * m) < 0) a = m; else b = m; }
      return (a + b) * 0.5;
    }
    function hullN(hull, x, y, z, o) {
      const e = 0.0006;
      o[0] = hull(x + e, y, z) - hull(x - e, y, z); o[1] = hull(x, y + e, z) - hull(x, y - e, z); o[2] = hull(x, y, z + e) - hull(x, y, z - e);
      const l = Math.hypot(o[0], o[1], o[2]) || 1; o[0] /= l; o[1] /= l; o[2] /= l;
    }
    function project(hull, R, out) {   // out = [x,y,z,nx,ny,nz]
      const t = hit(hull, R[0], R[1], R[2], R[3], R[4], R[5], 0.3);
      out[0] = R[0] + R[3] * t; out[1] = R[1] + R[4] * t; out[2] = R[2] + R[5] * t;
      hullN(hull, out[0], out[1], out[2], NN); out[3] = NN[0]; out[4] = NN[1]; out[5] = NN[2];
      return out;
    }
    const GRIME = [0.84, 0.7, 0.52];                      // the tint dirt gives the chrome (multiplied in by amount)
    const grimy = (c, g) => [c * lerp(1, GRIME[0], g), c * lerp(1, GRIME[1], g), c * lerp(1, GRIME[2], g)];
    // a plate: a grid of rays projected onto a hull, lifted, with a chamfered edge and a wall down into the skull.
    //   rayAt(u, v, R, i, j); o.us / o.vs explicit samples (else nu x nv, with optional corner rounding ru / rv);
    //   o.lift number | fn(u, v); o.disp(i, j) sinks vertices (recesses; normals then come from the surface);
    //   o.col number | fn(x, y, z, i, j) -> number | [r,g,b]; o.edgeK darkens the boundary (grime along the seams)
    function shell(acc, hull, rayAt, nu, nv, o) {
      if (o.us) nu = o.us.length; if (o.vs) nv = o.vs.length;
      const sx = o.sx || 1, PX = new Float32Array(nu * nv * 3), NX = new Float32Array(nu * nv * 3), H = [0, 0, 0, 0, 0, 0];
      const DS = o.disp ? new Float32Array(nu * nv) : null;
      for (let j = 0; j < nv; j++) {
        const v = o.vs ? o.vs[j] : j / (nv - 1), dv = min(v, 1 - v);
        let k = 0; if (!o.us && o.rv && dv < o.rv) { const w = (o.rv - dv) / o.rv; k = o.ru * (1 - sqrt(max(0, 1 - w * w))); }
        for (let i = 0; i < nu; i++) {
          const u = o.us ? o.us[i] : k + (i / (nu - 1)) * (1 - 2 * k);
          rayAt(u, v, R6, i, j);
          project(hull, R6, H);
          const q = 3 * (j * nu + i), L = (typeof o.lift === 'function' ? o.lift(u, v) : o.lift) - (DS ? (DS[j * nu + i] = o.disp(i, j)) : 0);
          PX[q] = sx * (H[0] + H[3] * L); PX[q + 1] = H[1] + H[4] * L; PX[q + 2] = H[2] + H[5] * L;
          NX[q] = sx * H[3]; NX[q + 1] = H[4]; NX[q + 2] = H[5];
        }
      }
      if (DS) {   // around the recesses the normals come from the displaced surface itself
        const N2 = new Float32Array(NX);
        for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
          let any = false;
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && ii < nu && jj >= 0 && jj < nv && DS[jj * nu + ii]) any = true; }
          if (!any) continue;
          const a = 3 * (j * nu + min(nu - 1, i + 1)), b = 3 * (j * nu + max(0, i - 1)), c = 3 * (min(nv - 1, j + 1) * nu + i), d = 3 * (max(0, j - 1) * nu + i), q = 3 * (j * nu + i);
          const ux = PX[a] - PX[b], uy = PX[a + 1] - PX[b + 1], uz = PX[a + 2] - PX[b + 2], vx = PX[c] - PX[d], vy = PX[c + 1] - PX[d + 1], vz = PX[c + 2] - PX[d + 2];
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          if (nx * NX[q] + ny * NX[q + 1] + nz * NX[q + 2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
          const l = Math.hypot(nx, ny, nz) || 1; N2[q] = nx / l; N2[q + 1] = ny / l; N2[q + 2] = nz / l;
        }
        NX.set(N2);
      }
      const top = acc.n, col = o.col === undefined ? 1 : o.col, eK = o.edgeK === undefined ? 0.78 : o.edgeK;
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const q = 3 * (j * nu + i);
        let c = typeof col === 'function' ? col(PX[q], PX[q + 1], PX[q + 2], i, j) : col;
        if (i === 0 || j === 0 || i === nu - 1 || j === nv - 1) c = Array.isArray(c) ? c.map((t, s) => t * eK * lerp(1, GRIME[s], min(1, (1 - eK) * 2))) : grimy(c * eK, min(1, (1 - eK) * 2));
        if (Array.isArray(c)) acc.v(PX[q], PX[q + 1], PX[q + 2], NX[q], NX[q + 1], NX[q + 2], c[0], c[1], c[2]);
        else acc.v(PX[q], PX[q + 1], PX[q + 2], NX[q], NX[q + 1], NX[q + 2], c);
      }
      for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) { const a = top + j * nu + i; acc.oquad(a, a + 1, a + nu + 1, a + nu); }
      const loop = [];
      for (let i = 0; i < nu - 1; i++) loop.push(i, 0);
      for (let j = 0; j < nv - 1; j++) loop.push(nu - 1, j);
      for (let i = nu - 1; i > 0; i--) loop.push(i, nv - 1);
      for (let j = nv - 1; j > 0; j--) loop.push(0, j);
      const L = loop.length / 2, ring = [];
      for (let m = 0; m < L; m++) {
        const i = loop[2 * m], j = loop[2 * m + 1], q = 3 * (j * nu + i), qi = 3 * (min(max(j, 1), nv - 2) * nu + min(max(i, 1), nu - 2));
        const nx = NX[q], ny = NX[q + 1], nz = NX[q + 2];
        let ox = PX[q] - PX[qi], oy = PX[q + 1] - PX[qi + 1], oz = PX[q + 2] - PX[qi + 2];
        const dn = ox * nx + oy * ny + oz * nz; ox -= nx * dn; oy -= ny * dn; oz -= nz * dn;
        const l = Math.hypot(ox, oy, oz) || 1; ring.push(PX[q], PX[q + 1], PX[q + 2], nx, ny, nz, ox / l, oy / l, oz / l);
      }
      const ch = o.ch, dp = o.depth, cc = o.chCol === undefined ? 1 : o.chCol, wc = o.wallCol === undefined ? 0.3 : o.wallCol;
      const sA = acc.n;
      for (let m = 0; m < L; m++) {
        const r = 9 * m, cx = ring[r + 3] + ring[r + 6], cy = ring[r + 4] + ring[r + 7], cz = ring[r + 5] + ring[r + 8], cl = Math.hypot(cx, cy, cz);
        acc.v(ring[r], ring[r + 1], ring[r + 2], cx / cl, cy / cl, cz / cl, cc);
        acc.v(ring[r] + (ring[r + 6] - ring[r + 3]) * ch, ring[r + 1] + (ring[r + 7] - ring[r + 4]) * ch, ring[r + 2] + (ring[r + 8] - ring[r + 5]) * ch, cx / cl, cy / cl, cz / cl, cc);
      }
      for (let m = 0; m < L; m++) { const a = sA + 2 * m, b = sA + 2 * ((m + 1) % L); acc.oquad(a, b, b + 1, a + 1); }
      const sB = acc.n, wcol = grimy(wc, 1), wcol2 = grimy(wc * 0.5, 1);
      for (let m = 0; m < L; m++) {
        const r = 9 * m;
        acc.v(ring[r] + ring[r + 6] * ch - ring[r + 3] * ch, ring[r + 1] + ring[r + 7] * ch - ring[r + 4] * ch, ring[r + 2] + ring[r + 8] * ch - ring[r + 5] * ch, ring[r + 6], ring[r + 7], ring[r + 8], wcol[0], wcol[1], wcol[2]);
        acc.v(ring[r] + ring[r + 6] * ch - ring[r + 3] * dp, ring[r + 1] + ring[r + 7] * ch - ring[r + 4] * dp, ring[r + 2] + ring[r + 8] * ch - ring[r + 5] * dp, ring[r + 6], ring[r + 7], ring[r + 8], wcol2[0], wcol2[1], wcol2[2]);
      }
      for (let m = 0; m < L; m++) { const a = sB + 2 * m, b = sB + 2 * ((m + 1) % L); acc.oquad(a, b, b + 1, a + 1); }
    }
    // sweep a closed CCW profile (b = out along the surface normal, a = across) along surface points
    function sweep(acc, pts, prof, col, sx) {
      sx = sx || 1;
      const K = pts.length, F = [];
      for (let k = 0; k < K; k++) {
        const p = pts[k], pa = pts[max(0, k - 1)], pb = pts[min(K - 1, k + 1)];
        let tx = pb[0] - pa[0], ty = pb[1] - pa[1], tz = pb[2] - pa[2];
        const n = [p[3], p[4], p[5]], dn = tx * n[0] + ty * n[1] + tz * n[2]; tx -= n[0] * dn; ty -= n[1] * dn; tz -= n[2] * dn;
        const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        F.push([p[0], p[1], p[2], n[0], n[1], n[2], n[1] * tz - n[2] * ty, n[2] * tx - n[0] * tz, n[0] * ty - n[1] * tx, tx, ty, tz]);
      }
      const M = prof(0).length, profs = F.map((_, k) => prof(k));
      const put = (f, b, a, nx, ny, nz, c) => Array.isArray(c) ? acc.v(sx * (f[0] + f[3] * b + f[6] * a), f[1] + f[4] * b + f[7] * a, f[2] + f[5] * b + f[8] * a, sx * nx, ny, nz, c[0], c[1], c[2]) : acc.v(sx * (f[0] + f[3] * b + f[6] * a), f[1] + f[4] * b + f[7] * a, f[2] + f[5] * b + f[8] * a, sx * nx, ny, nz, c);
      for (let s = 0; s < M; s++) {
        const base = acc.n;
        for (let k = 0; k < K; k++) {
          const f = F[k], P = profs[k], A = P[s], B = P[(s + 1) % M];
          const db = B[0] - A[0], da = B[1] - A[1], l = Math.hypot(db, da) || 1, nb = da / l, na = -db / l;
          const nx = f[3] * nb + f[6] * na, ny = f[4] * nb + f[7] * na, nz = f[5] * nb + f[8] * na;
          const c = typeof col === 'function' ? col(s, k) : col;
          put(f, A[0], A[1], nx, ny, nz, c); put(f, B[0], B[1], nx, ny, nz, c);
        }
        for (let k = 0; k < K - 1; k++) { const a = base + 2 * k; acc.oquad(a, a + 1, a + 3, a + 2); }
      }
      for (const [k, sg] of [[0, -1], [K - 1, 1]]) {   // end caps
        const f = F[k], P = profs[k], base = acc.n; let cb = 0, ca = 0;
        for (const p of P) { cb += p[0] / M; ca += p[1] / M; }
        const c = typeof col === 'function' ? col(-1, k) : col;
        put(f, cb, ca, f[9] * sg, f[10] * sg, f[11] * sg, c);
        for (const p of P) put(f, p[0], p[1], f[9] * sg, f[10] * sg, f[11] * sg, c);
        for (let s = 0; s < M; s++) acc.otri(base, base + 1 + s, base + 1 + ((s + 1) % M));
      }
    }
    const chamfRect = (b0, b1, a0, a1, c) => [[b0, a0], [b1 - c, a0], [b1, a0 + c], [b1, a1 - c], [b1 - c, a1], [b0, a1]];

    // ---------------------------------------------------------------- textures and materials
    function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    function tex(c, srgb) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
    const blob = (ctx, x, y, rad, col, col0) => { const gr = ctx.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, col); gr.addColorStop(1, col0); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, rad, 0, 2 * PI); ctx.fill(); };
    // chrome: near-mirror base (roughness ~0.09), a few pale matte tarnish patches, sparse specks and fine scratches.
    // Most of the dirt is in the vertex colours (crevices); the shader roughens wherever those are dark.
    function chromeWear() {
      const S = 512, cc = canvas(S, S), rc = canvas(S, S), g = cc.getContext('2d'), r = rc.getContext('2d');
      g.fillStyle = 'rgb(244,242,238)'; g.fillRect(0, 0, S, S);
      r.fillStyle = 'rgb(0,23,0)'; r.fillRect(0, 0, S, S);
      const tarnish = (x, y, rad, k) => {
        for (let i = 0; i < 10; i++) {
          const a = rnd() * 2 * PI, d = rnd() * rad * 0.8, rr = rad * (0.2 + rnd() * 0.45), px = x + cos(a) * d, py = y + sin(a) * d * 0.75;
          blob(g, px, py, rr, `rgba(255,254,251,${0.75 * k})`, 'rgba(255,254,251,0)');
          blob(r, px, py, rr, `rgba(0,150,0,${0.7 * k})`, 'rgba(0,150,0,0)');
        }
      };
      const at = (x, y) => [(x * 3.4 + 0.5) * S, (1 - (y * 3.4 + 0.5)) * S];   // front-facing box projection
      for (const [x, y, rad, k] of [[-0.036, 0.086, 20, 1], [-0.03, 0.066, 13, 0.85], [-0.044, 0.1, 9, 0.7], [0.036, 0.036, 13, 1], [0.047, 0.083, 11, 0.7], [-0.052, 0.034, 8, 0.6], [0.012, 0.126, 9, 0.6]]) { const [px, py] = at(x, y); tarnish(px, py, rad, k); }
      for (let i = 0; i < 6; i++) tarnish(rnd() * S, rnd() * S, 5 + rnd() * 9, 0.45);
      for (let i = 0; i < 34; i++) {
        const x = rnd() * S, y = rnd() * S, rad = 0.5 + rnd() * 1.1, a = 0.15 + rnd() * 0.3;
        g.fillStyle = `rgba(${70 + rnd() * 30 | 0},${50 + rnd() * 16 | 0},${32 + rnd() * 10 | 0},${a})`; g.beginPath(); g.arc(x, y, rad, 0, 2 * PI); g.fill();
        r.fillStyle = `rgba(0,${120 + rnd() * 80 | 0},0,${a})`; r.beginPath(); r.arc(x, y, rad, 0, 2 * PI); r.fill();
      }
      g.lineWidth = r.lineWidth = 0.6;
      for (let i = 0; i < 70; i++) {
        const x = rnd() * S, y = rnd() * S, a = rnd() * PI * 2, l = 4 + rnd() * 34;
        g.strokeStyle = 'rgba(120,112,100,0.12)'; r.strokeStyle = 'rgba(0,80,0,0.4)';
        for (const ctx of [g, r]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + cos(a) * l, y + sin(a) * l); ctx.stroke(); }
      }
      g.fillStyle = '#d6d2cc'; g.fillRect(S - 44, 0, 44, 44); r.fillStyle = 'rgb(0,88,0)'; r.fillRect(S - 44, 0, 44, 44);   // satin patch
      return { map: tex(cc, true), rough: tex(rc, false) };
    }
    // the Y chest plate (in its own shape coordinates): bare worn steel with flaky brown rust patches along the
    // outer edges, round the bolts and down the stem's centre channel; rust is matte and not metallic (G = rough, B = metal)
    const YPTS = [[-0.086, 0.007], [-0.033, -0.0005], [-0.024, -0.009], [0.024, -0.009], [0.033, -0.0005], [0.086, 0.007], [0.085, -0.01], [0.024, -0.045], [0.024, -0.14], [-0.024, -0.14], [-0.024, -0.045], [-0.085, -0.01]];
    const yUV = (x, y) => [(x + 0.09) / 0.18, (y + 0.145) / 0.155];
    function rustWear() {
      const S = 256, cc = canvas(S, S), mc = canvas(S, S), g = cc.getContext('2d'), m = mc.getContext('2d');
      const P = (x, y) => { const [u, v] = yUV(x, y); return [u * S, (1 - v) * S]; };
      g.fillStyle = 'rgb(226,223,217)'; g.fillRect(0, 0, S, S);
      m.fillStyle = 'rgb(0,34,255)'; m.fillRect(0, 0, S, S);
      for (let i = 0; i < 260; i++) {   // worn steel: faint streaks
        const x = rnd() * S, y = rnd() * S, l = 3 + rnd() * 14;
        g.strokeStyle = `rgba(${150 + rnd() * 60 | 0},${145 + rnd() * 55 | 0},${135 + rnd() * 50 | 0},0.25)`; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (rnd() - 0.5) * 2); g.stroke();
      }
      const seeds = [];
      for (let i = 0; i < YPTS.length; i++) {
        const a = YPTS[i], b = YPTS[(i + 1) % YPTS.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / 0.009);
        for (let k = 0; k < n; k++) { const t = (k + rnd()) / n, cv = 0.5 + 0.5 * sin(t * 9.1 + i * 2.3) * cos(t * 4.7 + i * 1.3); if (cv > 0.42) seeds.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), 0.55 + cv * 0.8]); }
      }
      for (const [x, y] of [[0, -0.062], [0, -0.112]]) for (let k = 0; k < 4; k++) seeds.push([x + (rnd() - 0.5) * 0.02, y + (rnd() - 0.5) * 0.02, 1.1]);
      for (let y = -0.05; y > -0.138; y -= 0.011) seeds.push([(rnd() - 0.5) * 0.008, y, 0.8]);
      for (const sx of [1, -1]) seeds.push([sx * 0.066, -0.006, 1.6], [sx * 0.05, 0.0, 1.2], [sx * 0.03, -0.035, 1.1]);   // heavier on the arms' ends
      for (const [x, y, w] of seeds) {
        if (rnd() > 0.8) continue;
        const [cx, cy] = P(x, y), n = 6 + rnd() * 8 | 0, R = (4 + rnd() * 6) * w;
        for (let k = 0; k < n; k++) {
          const a = rnd() * 2 * PI, d = rnd() * R, px = cx + cos(a) * d, py = cy + sin(a) * d, rr = 1.5 + rnd() * R * 0.55;
          const tone = rnd(), col = tone < 0.45 ? [78, 52, 31] : tone < 0.8 ? [54, 37, 23] : [100, 62, 33], al = 0.55 + rnd() * 0.4;
          g.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${al})`; g.beginPath(); g.arc(px, py, rr, 0, 2 * PI); g.fill();
          m.fillStyle = `rgba(0,205,26,${al})`; m.beginPath(); m.arc(px, py, rr, 0, 2 * PI); m.fill();
        }
        for (let k = 0; k < 14; k++) {   // flakes round the patch
          const a = rnd() * 2 * PI, d = R * (0.9 + rnd() * 0.8), px = cx + cos(a) * d, py = cy + sin(a) * d, rr = 0.5 + rnd() * 1.4;
          g.fillStyle = `rgba(80,52,30,${0.4 + rnd() * 0.5})`; g.beginPath(); g.arc(px, py, rr, 0, 2 * PI); g.fill();
          m.fillStyle = 'rgba(0,190,40,0.8)'; m.beginPath(); m.arc(px, py, rr, 0, 2 * PI); m.fill();
        }
      }
      return { map: tex(cc, true), mr: tex(mc, false) };
    }
    const WC = chromeWear(), WR = rustWear();
    const glowC = canvas(64, 64); {
      const g = glowC.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.1, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.3)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.07)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    }
    const MAT = {
      chrome: new THREE.MeshStandardMaterial({ name: 'endo-chrome', color: 0xd2c8b8, metalness: 1, roughness: 1, map: WC.map, roughnessMap: WC.rough, vertexColors: true }),
      dark: new THREE.MeshStandardMaterial({ name: 'endo-dark', color: 0x2a2623, metalness: 0.85, roughness: 0.45, vertexColors: true }),
      teeth: new THREE.MeshStandardMaterial({ name: 'endo-teeth', color: 0xffffff, metalness: 0, roughness: 0.55, vertexColors: true }),
      rust: new THREE.MeshStandardMaterial({ name: 'endo-rust', color: 0xffffff, metalness: 1, roughness: 1, map: WR.map, roughnessMap: WR.mr, metalnessMap: WR.mr, vertexColors: true }),
      lens: new THREE.MeshBasicMaterial({ name: 'endo-optic', vertexColors: true, toneMapped: false, color: new THREE.Color(lerp(0.16, 1, GLOW), lerp(0.06, 1, GLOW), lerp(0.06, 1, GLOW)) }),
      glow: new THREE.SpriteMaterial({ name: 'endo-glow', map: tex(glowC, false), color: new THREE.Color(1.6, 0.04, 0.015), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, opacity: GLOW }),
    };
    // grime roughens the chrome: wherever the baked vertex colour is dark (crevices, seams) the finish goes satin
    MAT.chrome.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor, 0.6, ( 1.0 - smoothstep( 0.08, 0.62, max( vColor.r, max( vColor.g, vColor.b ) ) ) ) * 0.85 );');
    };
    MAT.chrome.customProgramCacheKey = () => 'endo-chrome-grime';
    stats.tex = Math.round(performance.now() - T0);

    // ---------------------------------------------------------------- accumulators per part
    const A = { head: new Acc(), headDark: new Acc(), headTeeth: new Acc(), lens: new Acc(), jaw: new Acc(), jawDark: new Acc(), jawTeeth: new Acc(), neck: new Acc(), neckDark: new Acc(), sh: new Acc(), shDark: new Acc(), shRust: new Acc() };
    const detail = opts.detail || 1;

    // ---- plate layout (rays from the cranium centre: lateral angle a, sagittal angle b), shared with the culling
    const dirAB = (a, b, R) => { R[0] = 0; R[1] = CC.y; R[2] = CC.z; R[3] = sin(a); R[4] = cos(a) * sin(b); R[5] = cos(a) * cos(b); };
    const AW = 0.95;                                                                   // half width of forehead + crown plates
    const yF = (a) => 0.0398 + 0.0102 * min(1, abs(a) / 0.85);                        // forehead seam, an angry V
    const SEAM = { yL: 0.1125, yR: 0.1205, aStep: 0.04, e: 0.0022, gap: 0.032 };      // crown seam, one step up right of centre
    const ySeam = (a) => (a < SEAM.aStep ? SEAM.yL : SEAM.yR - 0.006 * sstep(0.32, 0.6, a));
    const H6 = [0, 0, 0, 0, 0, 0], RB = new Float64Array(6);
    const bAtY = (a, yT) => { let lo = -0.25, hi = 1.5; for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; dirAB(a, m, RB); project(crHull, RB, H6); if (H6[1] < yT) lo = m; else hi = m; } return (lo + hi) / 2; };
    const tab = (f) => { const T = []; for (let i = 0; i <= 40; i++) T.push(f(lerp(-AW, AW, i / 40))); return (a) => { const fi = sat((a + AW) / (2 * AW)) * 40, i = min(39, fi | 0); return lerp(T[i], T[i + 1], fi - i); }; };
    const bBotI = tab((a) => bAtY(a, yF(a))), bTopL = tab((a) => bAtY(a, SEAM.yL)), bTopR = tab((a) => bAtY(a, SEAM.yR - 0.006 * sstep(0.32, 0.6, a)));
    const bTopI = (a) => (a < SEAM.aStep ? bTopL(a) : bTopR(a));
    const elTop = (az) => acos(min(1, sin(AW + 0.035) / sin(az)));                   // side plates meet the crown here
    const SIDE = { az0: 1.05, az1: 2.08, el0: -0.36 };
    function covered(x, y, z) {   // is this skull point hidden deep under a cranium plate?
      const dy = y - CC.y, dz = z - CC.z, l = Math.hypot(x, dy, dz), m = 0.07, a = asin(x / l);
      let b = atan2(dy, dz); if (b < -1.2) b += 2 * PI;
      if (abs(a) < AW - m && ((b > bBotI(a) + m && b < bTopI(a) - m) || (b > bTopI(a) + SEAM.gap + m && b < 3.5 - m))) return true;
      const az = atan2(abs(x), dz), el = asin(dy / l);
      return az > SIDE.az0 + m && az < SIDE.az1 - m && el > SIDE.el0 + m && el < elTop(az) - m;
    }

    // skull volume
    let t1 = performance.now();
    const GS = field(skull, [-0.09, -0.085, -0.13, 0.09, 0.153, 0.106], 0.0027 / detail, true);
    stats.skullField = Math.round(performance.now() - t1); stats.skullEvals = GS.evals; t1 = performance.now();
    polygonize(GS, A.head, (x, y, z, ao) => {
      const ax = abs(x), dep = -faceHull(x, y, z);                                     // how far below the uncarved face
      let c = pow(ao, 1.25), g = 1 - ao;
      if (socket(ax, y, z, 0.0012) < 0) { c *= lerp(1, 0.03, sstep(0.001, 0.006, dep)); g = 1; }        // socket interior
      if (nose2(ax, y) < 0.0012) { c *= lerp(1, 0.035, sstep(0.0018, 0.0065, dep)); g = 1; }           // nasal cavity, bright rim
      if (cheekCav(ax, y, z) < 0.003) { c *= 0.08; g = 1; }                                             // cheek cavity
      else if (y < -0.03 && ax > 0.022 && ax < 0.074 && z < 0.058 && z > -0.025) { c *= 0.12; g = 1; }  // behind the mechanics
      if (y < -0.024 && z < -0.005 && ax < 0.04) { c *= lerp(1, 0.5, sstep(-0.03, -0.06, y)); g = max(g, 0.5); }   // skull base
      return grimy(c, sat(g * 1.6));
    }, (x, y, z) => !covered(x, y, z));
    stats.skullMesh = Math.round(performance.now() - t1); t1 = performance.now();

    // ---- cranium plates. Forehead: from the brow seam up to the stepped crown seam, with the recessed notch over
    // the brow centre; its columns put the seam step and the notch walls on exact grid lines.
    const PL = { lift: 0.0026, depth: 0.0045, ch: 0.0011 };
    const NOTCH = { a: 0.235, w: 0.012, wb: 0.009, y0: 0.0505, y1: 0.0845, D: 0.0038 };
    const colsA = (() => {
      const fx = [SEAM.aStep - SEAM.e, SEAM.aStep + SEAM.e, -NOTCH.a, -NOTCH.a + NOTCH.w, NOTCH.a - NOTCH.w, NOTCH.a], out = fx.slice();
      for (let i = 0; i <= 40; i++) { const a = lerp(-AW, AW, i / 40); if (fx.every((f) => abs(f - a) > 0.02)) out.push(a); }
      return out.sort((p, q) => p - q);
    })();
    const bTopC = colsA.map((a) => bAtY(a, ySeam(a))), bBotC = colsA.map((a) => bAtY(a, yF(a)));
    {
      const bN0 = bAtY(0, NOTCH.y0), bN1 = bAtY(0, NOTCH.y1), wB = NOTCH.wb, TF = [0.2, 0.4, 0.55, 0.7, 0.82, 0.92];
      const notchRows = [0, 0.25, 0.5, 0.75].map((t) => (c) => lerp(bBotC[c], bN0, t))
        .concat([() => bN0, () => bN0 + wB], TF.map((t) => () => lerp(bN0 + wB, bN1, t)))
        .concat([0, 1, 2, 3, 4, 5, 6].map((k) => (c) => lerp(bN1, bTopC[c], k / 6)));
      const RF = [0, 0, 0, 0, 0, 1].concat(TF.map((t) => 1 - sstep(0.4, 1, t)), [0, 0, 0, 0, 0, 0, 0]);   // floor depth per row
      const NV = notchRows.length, inA = (a) => abs(a) <= NOTCH.a - NOTCH.w + 1e-6;
      const rowB = (c, j) => { const a = colsA[c], un = lerp(bBotC[c], bTopC[c], j / (NV - 1)), wN = 1 - sstep(NOTCH.a, NOTCH.a + 0.22, abs(a)); return lerp(un, notchRows[j](c), wN); };
      const vs = []; for (let j = 0; j < NV; j++) vs.push(j / (NV - 1));
      shell(A.head, crHull, (u, v, R, i, j) => dirAB(colsA[i], rowB(i, j), R), 0, 0, {
        ...PL, us: colsA.map((a) => (a + AW) / (2 * AW)), vs,
        disp: (i, j) => (inA(colsA[i]) ? NOTCH.D * RF[j] : 0),
        col: (x, y, z, i, j) => (inA(colsA[i]) && RF[j] > 0 ? grimy(j === 5 || abs(abs(colsA[i]) - NOTCH.a + NOTCH.w) < 1e-6 ? 0.66 : lerp(1, 0.84, RF[j]), 0.6) : 1),
      });
    }
    // crown: from the stepped seam over the top and down the back
    {
      const NV = 40;
      shell(A.head, crHull, (u, v, R, i) => dirAB(colsA[i], lerp(bTopC[i] + SEAM.gap, 3.5, pow(v, 0.9)), R), 0, NV, { ...PL, us: colsA.map((a) => (a + AW) / (2 * AW)) });
    }
    for (const sx of [1, -1]) shell(A.head, crHull, (u, v, R) => {
      const az = lerp(SIDE.az0, SIDE.az1, u), el = lerp(SIDE.el0, elTop(az), v);
      R[0] = 0; R[1] = CC.y; R[2] = CC.z; R[3] = cos(el) * sin(az); R[4] = sin(el); R[5] = cos(el) * cos(az);
    }, 18, 16, { ...PL, sx, ru: 0.12, rv: 0.08 });
    stats.cranPlates = Math.round(performance.now() - t1); t1 = performance.now();

    // ---- face plates (rays from a vertical axis at height y, onto the face hull)
    const sockTop = (ax) => sockEdge(ax, 1), sockBot = (ax) => sockEdge(ax, -1);
    const rayH = (y, az, R) => { R[0] = 0; R[1] = y; R[2] = -0.01; R[3] = sin(az); R[4] = 0; R[5] = cos(az); };
    // brow plate: flush under the forehead seam, its lower edge forming the socket tops (the scowl), ending at the temples
    {
      const AZB = 0.93, NU = 46, Hh = [0, 0, 0, 0, 0, 0], tops = [], lows = [];
      for (let i = 0; i < NU; i++) {
        const az = lerp(-AZB, AZB, i / (NU - 1));
        rayH(0.026, az, R6); project(faceHull, R6, Hh); const ax = abs(Hh[0]);
        let y = 0.045;
        for (let k = 0; k < 3; k++) { rayH(y, az, R6); project(faceHull, R6, Hh); const l = Math.hypot(Hh[0], Hh[1] - CC.y, Hh[2] - CC.z); y = yF(asin(Hh[0] / l)) - 0.0021; }
        tops.push(y);
        lows.push((ax < 0.0118 ? sockTop(0.0118) : ax < 0.057 ? sockTop(ax) : lerp(sockTop(0.057), 0.0135, sstep(0.057, 0.076, ax))) - 0.0003);
      }
      const ti = (T, u) => { const f = sat(u) * (NU - 1), i = min(NU - 2, f | 0); return lerp(T[i], T[i + 1], f - i); };
      shell(A.head, faceHull, (u, v, R) => rayH(lerp(ti(lows, u), ti(tops, u), v), lerp(-AZB, AZB, u), R), NU, 9,
        { lift: (u, v) => lerp(lerp(0.0047, 0.0031, v), 0.0022, 1 - sstep(0, 0.16, min(u, 1 - u))), depth: 0.009, ch: 0.0012, ru: 0.022, rv: 0.3, wallCol: 0.22 });
    }
    // cheekbones: from beside the nose (notched there) out under the sockets, ending just behind the outer socket corner
    const xIn = (y) => max(0.0118, noseHW(y) + 0.0027);
    const notchF = (t) => (abs(t) < 1 ? (1 - t * t) * (1 - t * t) : 0);
    const cheekLow = (ax) => lerp(-0.0372, -0.046, sstep(0.02, 0.07, ax)) + 0.005 * notchF((ax - 0.0238) / 0.0072);
    for (const sx of [1, -1]) shell(A.head, faceHull, (u, v, R) => {
      const xs = 0.079 * sin(lerp(0.17, 1.06, u));
      const yHigh = xs < 0.06 ? sockBot(xs) - 0.0004 : lerp(sockBot(0.06) - 0.0004, 0.016, sstep(0.06, 0.074, xs));
      const y = lerp(cheekLow(xs), yHigh, v);
      rayH(y, lerp(atan2(xIn(y), 0.086), 1.06, u), R);
    }, 30, 14, { lift: 0.0036, depth: 0.009, ch: 0.0014, sx, ru: 0.035, rv: 0.22, wallCol: 0.16, disp: (i, j) => -0.003 * pow(max(0, sin(PI * i / 29)), 0.7) * pow(max(0, sin(PI * j / 13)), 0.7) });
    // socket rails: a raised lip round the bottom and outer side of each socket
    {
      const pts = [], e = 0.0012, hw = SOCK.hw + e, hh = SOCK.hh + e, rIB = SOCK.rIB + e, rOB = SOCK.rOB + e, rOT = SOCK.rOT + e, outl = [];
      const arc = (cx, cy, rr, a0, a1, n) => { for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); outl.push([cx + rr * cos(a), cy + rr * sin(a)]); } };
      arc(-hw + rIB, -hh + rIB, rIB, PI * 1.02, PI * 1.5, 5);
      for (let i = 1; i < 8; i++) outl.push([lerp(-hw + rIB, hw - rOB, i / 8), -hh]);
      arc(hw - rOB, -hh + rOB, rOB, PI * 1.5, PI * 2, 6);
      for (let i = 1; i < 4; i++) outl.push([hw, lerp(-hh + rOB, hh - rOT, i / 4)]);
      arc(hw - rOT, hh - rOT, rOT, 0, PI * 0.18, 2);
      const H = [0, 0, 0, 0, 0, 0];
      for (const [lx, ly] of outl) {
        const [x, y] = sockXY(lx, ly);
        R6[0] = x; R6[1] = y; R6[2] = -0.01; R6[3] = 0; R6[4] = 0; R6[5] = 1;
        project(faceHull, R6, H); pts.push(H.slice());
      }
      for (const sx of [1, -1]) sweep(A.head, pts, () => [[-0.002, -0.0038], [0.0032, -0.0038], [0.0052, -0.0024], [0.006, -0.0004], [0.0055, 0.0018], [0.004, 0.0034], [0.002, 0.004], [-0.002, 0.004]], 1, sx);
    }
    // nasal bridge: a narrow plate from the forehead seam down through the brow into the nasal opening
    {
      const pts = [], H = [0, 0, 0, 0, 0, 0];
      for (let k = 0; k <= 18; k++) { const y = lerp(0.0372, 0.0005, k / 18); R6[0] = 0; R6[1] = y; R6[2] = -0.01; R6[3] = 0; R6[4] = 0; R6[5] = 1; project(faceHull, R6, H); H[4] *= 0.3; const l = Math.hypot(H[3], H[4], H[5]); H[3] /= l; H[4] /= l; H[5] /= l; pts.push(H.slice()); }
      sweep(A.head, pts, (k) => {
        const y = pts[k][1], hw = lerp(0.0045, 0.0061, sstep(0.008, 0.03, y)) + 0.0009 * sstep(0.006, 0.001, y), e = lerp(0.0044, 0.0056, sstep(0.015, 0.021, y));
        return chamfRect(-0.003, e, -hw, hw, 0.0014);
      }, 1);
    }
    stats.facePlates = Math.round(performance.now() - t1); t1 = performance.now();

    // ---- cap disc (upper left as seen from the front = -x) and the vent plate (upper right = +x)
    const onCranium = (a, b) => { dirAB(a, b, R6); const H = project(crHull, R6, [0, 0, 0, 0, 0, 0]); return { p: V(H[0], H[1], H[2]), n: V(H[3], H[4], H[5]) }; };
    // satin bolted disc: outer ring, domed cap, centre hole, six bolts
    function disc(p, n, k, lift) {
      Q.setFromUnitVectors(Y, n); const m = M4().compose(p.clone().addScaledVector(n, lift || 0), Q.clone(), V(k, k < 0.6 ? 0.6 : 1, k));
      const prof = [[0.0238, -0.003], [0.0238, 0.0032], [0.0226, 0.005], [0.0178, 0.0054], [0.0172, 0.0068], [0.016, 0.0082], [0.0048, 0.009], [0.0042, 0.0084], [0.0038, 0.006]].map(([r, y]) => new THREE.Vector2(r, y));
      A.head.uvo = [0.958, 0.958]; A.head.geo(new THREE.LatheGeometry(prof, 40), m, (x, y, z) => { const r = Math.hypot(x, z); return r > 0.0225 ? grimy(0.6, 0.6) : r > 0.0166 ? grimy(0.26, 1) : 0.78; }); A.head.uvo = null;
      A.headDark.geo(new THREE.CylinderGeometry(0.0039, 0.0039, 0.003, 14), M4().multiplyMatrices(m, M4().makeTranslation(0, 0.0064, 0)), 0.5);
      for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2 + 0.3; A.head.geo(new THREE.CylinderGeometry(0.0014 / k, 0.0016 / k, 0.0016, 8), M4().multiplyMatrices(m, M4().makeTranslation(cos(a) * 0.0206, 0.0058, sin(a) * 0.0206)), 0.9); }
      A.head.geo(new THREE.TorusGeometry(0.0236, 0.0012, 4, 40), M4().multiplyMatrices(m, M4().makeRotationX(PI / 2)), grimy(0.22, 1));   // grime ring at its foot
    }
    { const { p, n } = onCranium(-0.4, bAtY(-0.4, 0.1215)); disc(p, n, 0.88); }
    for (const sx of [1, -1]) {   // smaller disc over each ear, on the temple plates
      const az = 1.78, el = -0.12; R6[0] = 0; R6[1] = CC.y; R6[2] = CC.z; R6[3] = cos(el) * sin(az); R6[4] = sin(el); R6[5] = cos(el) * cos(az);
      const H = project(crHull, R6, [0, 0, 0, 0, 0, 0]); disc(V(sx * H[0], H[1], H[2]), V(sx * H[3], H[4], H[5]), 0.52, 0.0016);
    }
    {
      const { p, n } = onCranium(0.62, bAtY(0.62, 0.099));
      const up = V(0, 1, 0).addScaledVector(n, -n.y).normalize().applyAxisAngle(n, -0.28), side = up.clone().cross(n).normalize();
      const rot = new THREE.Quaternion().setFromRotationMatrix(M4().makeBasis(side, up, n));
      const at = (u, v, w) => p.clone().addScaledVector(side, u).addScaledVector(up, v).addScaledVector(n, w);
      A.head.uvo = [0.958, 0.958];
      box(A.head, at(0, 0.0158, 0.0034), 0.0198, 0.0026, 0.0034, grimy(0.5, 0.6), rot); box(A.head, at(0, -0.0158, 0.0034), 0.0198, 0.0026, 0.0034, grimy(0.5, 0.6), rot);
      box(A.head, at(0.0086, 0, 0.0034), 0.0026, 0.0316, 0.0034, grimy(0.5, 0.6), rot); box(A.head, at(-0.0086, 0, 0.0034), 0.0026, 0.0316, 0.0034, grimy(0.5, 0.6), rot);
      box(A.head, at(0, 0, 0.0022), 0.015, 0.029, 0.002, grimy(0.3, 1), rot); A.head.uvo = null;
      for (let i = 0; i < 4; i++) box(A.headDark, at(0, -0.0098 + i * 0.0065, 0.0031), 0.0112, 0.0024, 0.0012, 0.4, rot);
    }

    // ---- septum, optics, socket mechanics, cheek-cavity mechanics, mouth backing
    A.head.geo((() => { const g = new THREE.SphereGeometry(1, 8, 10), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const f = (v) => Math.sign(v) * pow(abs(v), 0.5); p.setXYZ(i, f(p.getX(i)) * 0.0014, f(p.getY(i)) * 0.0108, f(p.getZ(i)) * 0.0085); } g.computeVertexNormals(); return g; })(),
      M4().makeTranslation(0, -0.0305, 0.0675), (x, y, z) => grimy(lerp(0.2, 1, sstep(-0.004, 0.007, z)), 0.5));
    for (const sx of [1, -1]) {   // small bright scrolls deep in the nasal cavity
      Q.setFromUnitVectors(Y, V(sx * 0.25, -0.5, 0.8).normalize());
      A.head.geo(new THREE.CylinderGeometry(0.0021, 0.0027, 0.009, 10), M4().compose(V(sx * 0.0078, -0.035, 0.059), Q.clone(), V(1, 1, 1)), 0.55);
    }
    ball(A.head, V(0, -0.0458, 0.0782), 0.0028, 0.95);   // nasal spine
    const glows = [];
    // optics: small saturated red lens with a white-hot centre in a dark ringed housing with a thin chrome bezel
    const lensCol = (x, y) => { const t = acos(min(1, y / 0.0057)) / 0.9; return t < 0.09 ? [1, 0.8, 0.62] : t < 0.3 ? [1, lerp(0.8, 0.012, (t - 0.09) / 0.21), lerp(0.62, 0.006, (t - 0.09) / 0.21)] : [lerp(1, 0.62, (t - 0.3) / 0.7), 0.004, 0.002]; };
    for (const sx of [1, -1]) {
      const ex = sx * EYE.x, ey = EYE.y;
      const hp = [[0.0001, 0.0], [0.0108, 0.0], [0.0108, 0.0084], [0.0104, 0.0094], [0.0097, 0.0097], [0.0092, 0.0091], [0.0089, 0.0082], [0.0081, 0.0082], [0.0078, 0.0089], [0.0071, 0.0089], [0.0068, 0.0081], [0.0062, 0.0081], [0.0059, 0.0074]];
      Q.setFromUnitVectors(Y, V(0, 0, 1));
      A.head.geo(new THREE.LatheGeometry(hp.map(([r, h]) => new THREE.Vector2(r, h)), 32), M4().compose(V(ex, ey, 0.0532), Q.clone(), V(1, 1, 1)), (x, y, z) => { const r = Math.hypot(x, z); return r > 0.0091 && y > 0.0088 ? 0.62 : r > 0.0104 ? 0.3 : r > 0.0077 && y > 0.0086 ? 0.34 : 0.13; });
      A.lens.geo(new THREE.SphereGeometry(0.0057, 22, 7, 0, PI * 2, 0, 0.9), M4().compose(V(ex, ey, 0.0566), Q.clone(), V(1, 1, 1)), lensCol);
      glows.push(V(ex, ey, 0.0665));
      box(A.headDark, V(sx * 0.0565, 0.019, 0.058), 0.007, 0.0026, 0.004, 0.5);
      box(A.headDark, V(sx * 0.061, 0.009, 0.058), 0.0026, 0.008, 0.004, 0.5);
      box(A.headDark, V(sx * 0.0145, -0.002, 0.058), 0.0026, 0.006, 0.004, 0.5);
      box(A.headDark, V(sx * 0.0215, -0.0055, 0.058), 0.007, 0.0024, 0.004, 0.5);
      // cheek cavity mechanics: masseter sleeve under the cheekbone, rods, a knuckle, a hinge piston and a cable
      const mech = (x, y, z) => grimy(0.62, 0.7);
      cyl(A.head, V(sx * 0.051, -0.031, 0.05), V(sx * 0.0495, -0.058, 0.052), 0.0042, 12, mech);
      cyl(A.head, V(sx * 0.051, -0.0565, 0.0518), V(sx * 0.0495, -0.0595, 0.0522), 0.0049, 12, 0.85);
      cyl(A.head, V(sx * 0.0372, -0.035, 0.0565), V(sx * 0.0362, -0.068, 0.0525), 0.0018, 7, 0.55);
      box(A.headDark, V(sx * 0.047, -0.062, 0.04), 0.012, 0.016, 0.012, 0.45, new THREE.Quaternion().setFromAxisAngle(Y, sx * 0.5));
      cyl(A.head, V(sx * 0.0432, -0.036, 0.054), V(sx * 0.0425, -0.071, 0.049), 0.0015, 7, 0.6);
      cyl(A.head, V(sx * 0.0345, -0.0465, 0.058), V(sx * 0.06, -0.0485, 0.04), 0.0021, 8, 0.6);
      ball(A.head, V(sx * 0.0405, -0.0565, 0.0545), 0.0038, 0.85);
      piston(A.head, V(sx * 0.061, -0.03, 0.028), V(sx * 0.058, -0.066, 0.033), 0.0038, 0.0021, 0.7, 0.55);
      cable(A.headDark, [V(sx * 0.058, -0.031, 0.044), V(sx * 0.047, -0.05, 0.05), V(sx * 0.04, -0.072, 0.046)], 0.0015, 0.35, 12);
    }
    // dark backing behind the teeth (upper half; the jaw carries the lower half)
    const archZ = (x) => 0.0798 - 20 * x * x;
    function backing(acc, y0, y1) {
      const base = acc.n;
      for (let i = 0; i <= 16; i++) { const x = lerp(-0.036, 0.036, i / 16), z = archZ(x) - 0.0072, nx = 40 * x, l = Math.hypot(nx, 1), lift = 6 * x * x; acc.v(x, y0 + lift, z, nx / l, 0, 1 / l, 0.18); acc.v(x, y1 + lift, z, nx / l, 0, 1 / l, 0.18); }
      for (let i = 0; i < 16; i++) acc.oquad(base + 2 * i, base + 2 * i + 2, base + 2 * i + 3, base + 2 * i + 1);
    }
    backing(A.headDark, -0.058, -0.0745);

    // ---- teeth: one tight arched set, the upper row over the lower, bite line curving up at the sides (a grin)
    const toothG = (() => { const g = new THREE.SphereGeometry(1, 9, 8), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const f = (v) => Math.sign(v) * pow(abs(v), 0.55); const y = f(p.getY(i)); p.setXYZ(i, f(p.getX(i)) * (1 - 0.18 * (y + 1) / 2), y, f(p.getZ(i)) * (1 - 0.3 * max(0, -y))); } g.computeVertexNormals(); return g; })();
    const IVORY = [0.52, 0.42, 0.24], ROOT = [0.2, 0.13, 0.07];
    function teeth(acc, widths, heights, zf, k, yGum, up, root) {
      const S = []; let s = 0, px = 0, pz = zf; S.push([0, 0, zf]);
      for (let i = 1; i <= 200; i++) { const x = i * 0.0003, z = zf - k * x * x; s += Math.hypot(x - px, z - pz); px = x; pz = z; S.push([s, x, z]); }
      const at = (sv) => { let i = 1; while (i < S.length - 1 && S[i][0] < sv) i++; const a = S[i - 1], b = S[i], t = (sv - a[0]) / (b[0] - a[0] || 1); return [lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; };
      for (const sx of [1, -1]) {
        let s0 = 0;
        for (let i = 0; i < widths.length; i++) {
          const w = widths[i], hv = heights[i] * (0.93 + rnd() * 0.12), [x, z] = at(s0 + w / 2); s0 += w;
          const slope = -2 * k * x, nl = Math.hypot(slope, 1), nx = -slope / nl, nz = 1 / nl, d = 0.0056, H = hv + 0.0026;
          const gum = yGum + 6 * x * x, cy = up ? gum + 0.0026 - H / 2 : gum - 0.0026 + H / 2;
          const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.08 + (up ? 0.05 : -0.04), sx * Math.atan(2 * k * x), (rnd() - 0.5) * 0.09));
          const m = M4().compose(V(sx * (x - nx * d * 0.45), cy, z - nz * d * 0.45 + (rnd() - 0.5) * 0.0005), rot, V(w * 0.455, (up ? 1 : -1) * H / 2, d / 2));
          const tint = (0.78 + rnd() * 0.22) * lerp(1, 0.55, sstep(0.012, 0.032, x)), stain = rnd() < 0.3 ? 0.25 + rnd() * 0.3 : 0;
          acc.geo(toothG, m, (lx, ly, lz) => {
            const r = -ly * 0.5 + 0.5, side = sstep(0.55, 0.95, abs(lx)), g = (root ? lerp(0.06, 1, sstep(0.36, 0.56, r)) : lerp(0.25, 1, sstep(0.04, 0.45, r))) * tint * (1 - 0.55 * side) * (lz < -0.2 ? 0.5 : 1);
            const st = sat(stain + 0.5 * side + 0.6 * (1 - sstep(0.05, 0.4, r)));
            return [lerp(IVORY[0], ROOT[0], st) * g, lerp(IVORY[1], ROOT[1], st) * g, lerp(IVORY[2], ROOT[2], st) * g];
          });
        }
      }
    }
    teeth(A.headTeeth, [0.0079, 0.0066, 0.0066, 0.0061, 0.006, 0.0062], [0.0101, 0.0093, 0.0098, 0.0087, 0.008, 0.0074], archZ(0) + 0.0015, 20, -0.0642, true);
    stats.headDetail = Math.round(performance.now() - t1); t1 = performance.now();

    // ---------------------------------------------------------------- jaw
    const GJ = field(jaw, [-0.075, -0.134, -0.036, 0.075, -0.022, 0.092], 0.0025 / detail, true);
    polygonize(GJ, A.jaw, (x, y, z, ao) => {
      let c = pow(ao, 1.25), g = 1 - ao;
      if (abs(x) < 0.035 && z < 0.07 && y > -0.1) { c *= 0.35; g = 1; }   // inside the U, behind the teeth
      return grimy(c, sat(g * 1.6));
    });
    teeth(A.jawTeeth, [0.0058, 0.0059, 0.0062, 0.006, 0.006, 0.0068], [0.0125, 0.0125, 0.0128, 0.012, 0.0114, 0.0108], archZ(0) - 0.0018, 21, -0.0868, false, true);
    backing(A.jawDark, -0.0738, -0.0885);
    for (const sx of [1, -1]) {   // the lower halves of the cheek pistons ride on the mandible
      cyl(A.jaw, V(sx * 0.0498, -0.056, 0.052), V(sx * 0.047, -0.088, 0.047), 0.0023, 10, 1);
      ball(A.jaw, V(sx * 0.047, -0.089, 0.047), 0.0036, 0.8);
      cyl(A.jaw, V(sx * 0.058, -0.06, 0.033), V(sx * 0.054, -0.092, 0.03), 0.002, 8, 1);
      ball(A.jaw, V(sx * 0.054, -0.093, 0.03), 0.0034, 0.8);
    }
    stats.jaw = Math.round(performance.now() - t1); t1 = performance.now();

    // ---------------------------------------------------------------- neck
    {
      const NZ = -0.03, yTop = -0.064, yBot = yS - 0.085;
      // a short bulky column: thick core, fat collars spaced irregularly, a big collar at each end
      cyl(A.neck, V(0, yBot, NZ), V(0, yTop, NZ), 0.0205, 18, grimy(0.42, 1));
      const ring = (yc, h, r, c) => {
        const p = [[0.019, -h], [r - 0.0035, -h], [r, -h + 0.0032], [r, h - 0.0032], [r - 0.0035, h], [0.019, h]];
        A.neck.geo(new THREE.LatheGeometry(p.map(([a, b]) => new THREE.Vector2(a, b)), 24), M4().makeTranslation(0, yc, NZ), (x, y) => (abs(y) > h - 0.0005 ? grimy(c * 0.75, 0.6) : c));
      };
      ring(yTop - 0.007, 0.0085, 0.037, 0.9);
      const SP = [0.024, 0.02, 0.026, 0.021, 0.025, 0.019, 0.023], TH = [0.0065, 0.0055, 0.007, 0.006, 0.0068, 0.0058, 0.0064], RR = [0.033, 0.031, 0.034, 0.0315, 0.0335, 0.031, 0.033];
      let y = yTop - 0.007, k = 0;
      while (y - SP[k % 7] > yS + 0.012) { y -= SP[k % 7]; ring(y, TH[k % 7], RR[k % 7], 0.82); k++; }
      ring(yS - 0.004, 0.009, 0.038, 0.85);
      // hydraulic pistons round the column: front, side and back pairs, sleeves down at the shoulders
      for (const sx of [1, -1]) {
        piston(A.neck, V(sx * 0.038, yS + 0.004, 0.002), V(sx * 0.03, -0.07, 0.004), 0.0072, 0.0042, 0.92, 0.55);
        piston(A.neck, V(sx * 0.046, yS + 0.002, -0.026), V(sx * 0.04, -0.064, -0.03), 0.0068, 0.004, 0.85, 0.55);
        piston(A.neck, V(sx * 0.032, yS + 0.004, -0.066), V(sx * 0.026, -0.066, -0.062), 0.0075, 0.0042, 0.88, 0.55);
        // long tendon rods from under the cheek plates down past the shoulders
        cyl(A.neck, V(sx * 0.058, -0.058, -0.02), V(sx * 0.072, yS - 0.14, 0.03), 0.0029, 8, 0.95);
        cyl(A.neck, V(sx * 0.064, -0.05, -0.028), V(sx * 0.108, yS - 0.14, 0.02), 0.0023, 8, 0.85);
        ball(A.neck, V(sx * 0.058, -0.058, -0.02), 0.0042, 0.9);
        // cables
        cable(A.neckDark, [V(sx * 0.014, -0.066, 0.016), V(sx * 0.018, lerp(-0.066, yS, 0.4), 0.024), V(sx * 0.016, yS + 0.01, 0.02), V(sx * 0.012, yS - 0.06, 0.016)], 0.0019, 0.4);
        cable(A.neckDark, [V(sx * 0.036, -0.062, -0.012), V(sx * 0.05, lerp(-0.062, yS, 0.45), -0.006), V(sx * 0.058, yS - 0.02, -0.01)], 0.0021, 0.4);
        cable(A.neck, [V(sx * 0.009, -0.07, 0.02), V(sx * 0.011, lerp(-0.07, yS, 0.5), 0.027), V(sx * 0.009, yS - 0.03, 0.026)], 0.0014, 0.8, 20);
      }
    }
    stats.neck = Math.round(performance.now() - t1); t1 = performance.now();

    // ---------------------------------------------------------------- shoulders + chest plate
    {
      const zS = 0.008;
      for (const sx of [1, -1]) {
        ball(A.sh, V(sx * 0.046, yS, zS), 0.0118, 1, 18);
        cyl(A.sh, V(sx * 0.054, yS, zS), V(sx * 0.158, yS, zS), 0.0128, 20, 1);
        for (const x of [0.058, 0.106, 0.154]) cyl(A.sh, V(sx * (x - 0.0024), yS, zS), V(sx * (x + 0.0024), yS, zS), 0.0143, 20, grimy(0.8, 0.6));
        cyl(A.sh, V(sx * 0.158, yS, zS), V(sx * 0.167, yS, zS), 0.0094, 16, 0.9);
        cyl(A.sh, V(sx * 0.167, yS, zS), V(sx * 0.31, yS, zS), 0.007, 14, 1.05);
        cyl(A.sh, V(sx * 0.3, yS, zS - 0.008), V(sx * 0.3, yS, zS + 0.008), 0.0102, 14, 0.9);
        piston(A.sh, V(sx * 0.31, yS - 0.032, -0.075), V(sx * 0.05, yS + 0.084, -0.05), 0.0095, 0.0058, 0.85, 0.55);
      }
      // Y plate, drawn from its top edge down, leaning back a little; rust lives in its own material
      const s = new THREE.Shape();
      s.moveTo(YPTS[0][0], YPTS[0][1]); for (const q of YPTS.slice(1)) s.lineTo(q[0], q[1]); s.closePath();
      const eg = new THREE.ExtrudeGeometry(s, { depth: 0.0055, bevelEnabled: true, bevelThickness: 0.0016, bevelSize: 0.0016, bevelSegments: 1, curveSegments: 2 });
      eg.computeVertexNormals();
      const pm = M4().compose(V(0, yS - 0.01, 0.031), new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -0.12), V(1, 1, 1));
      A.shRust.geo(eg, pm, 1, (u, v) => yUV(u, v));
      for (const sx of [1, -1]) A.sh.geo(new THREE.BoxGeometry(0.0034, 0.092, 0.0026), M4().multiplyMatrices(pm, M4().makeTranslation(sx * 0.0175, -0.093, 0.0075)), grimy(0.85, 0.5));   // channel rails down the stem
      A.sh.geo(new THREE.CylinderGeometry(0.0085, 0.0095, 0.004, 22), M4().multiplyMatrices(pm, M4().compose(V(0, -0.112, 0.009), new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), PI / 2), V(1, 1, 1))), grimy(0.75, 0.8));
      A.shDark.geo(new THREE.CylinderGeometry(0.0036, 0.0036, 0.004, 14), M4().multiplyMatrices(pm, M4().compose(V(0, -0.112, 0.0102), new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), PI / 2), V(1, 1, 1))), 0.5);
      A.sh.geo(new THREE.CylinderGeometry(0.0033, 0.0033, 0.003, 12), M4().multiplyMatrices(pm, M4().compose(V(0, -0.062, 0.0085), new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), PI / 2), V(1, 1, 1))), grimy(0.8, 0.8));
    }
    stats.shoulders = Math.round(performance.now() - t1); t1 = performance.now();

    // ---------------------------------------------------------------- assemble
    const NECK_PIVOT = V(0, -0.05, -0.03), HINGE = V(0, -0.037, -0.013);
    const group = new THREE.Group(); group.name = 'endo';
    const head = new THREE.Object3D(); head.name = 'head'; head.position.copy(NECK_PIVOT);
    const jawO = new THREE.Object3D(); jawO.name = 'jaw'; jawO.position.copy(HINGE).sub(NECK_PIVOT); head.add(jawO);
    const neck = new THREE.Object3D(); neck.name = 'neck';
    const shoulders = new THREE.Object3D(); shoulders.name = 'shoulders';
    group.add(head, neck, shoulders);
    let tris = 0;
    const mk = (acc, mat, parent, off, name) => {
      if (!acc.n) return;
      const g = acc.build(); if (off) g.translate(-off.x, -off.y, -off.z); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat); m.name = name; parent.add(m); tris += acc.I.length / 3; stats['t_' + name] = acc.I.length / 3;
    };
    mk(A.head, MAT.chrome, head, NECK_PIVOT, 'head-chrome'); mk(A.headDark, MAT.dark, head, NECK_PIVOT, 'head-dark');
    mk(A.headTeeth, MAT.teeth, head, NECK_PIVOT, 'head-teeth'); mk(A.lens, MAT.lens, head, NECK_PIVOT, 'head-optics');
    mk(A.jaw, MAT.chrome, jawO, HINGE, 'jaw-chrome'); mk(A.jawDark, MAT.dark, jawO, HINGE, 'jaw-dark'); mk(A.jawTeeth, MAT.teeth, jawO, HINGE, 'jaw-teeth');
    mk(A.neck, MAT.chrome, neck, null, 'neck-chrome'); mk(A.neckDark, MAT.dark, neck, null, 'neck-dark');
    mk(A.sh, MAT.chrome, shoulders, null, 'shoulders-chrome'); mk(A.shDark, MAT.dark, shoulders, null, 'shoulders-dark'); mk(A.shRust, MAT.rust, shoulders, null, 'chest-plate');
    // halo sprites: full size from ~3 m out (they carry the eyes at game distance), shrinking toward the lens up close
    const HALO = 0.026, wp = new THREE.Vector3(), cp = new THREE.Vector3();
    if (GLOW > 0) for (const p of glows) {
      const s = new THREE.Sprite(MAT.glow); s.name = 'optic-glow'; s.position.copy(p).sub(NECK_PIVOT); s.scale.setScalar(HALO); head.add(s);
      s.onBeforeRender = (renderer, scene, camera) => {
        s.getWorldPosition(wp); cp.setFromMatrixPosition(camera.matrixWorld);
        s.scale.setScalar(HALO * (0.45 + 0.55 * sstep(0.6, 3, wp.distanceTo(cp))));
        s.updateMatrix(); s.matrixWorld.multiplyMatrices(s.parent.matrixWorld, s.matrix);
      };
    }
    stats.tris = tris; stats.ms = Math.round(performance.now() - T0);
    return { group, parts: { head, jaw: jawO, neck, shoulders }, stats, materials: MAT };
  }
  /* ======================== end of buildEndoHead =========================== */

  /* ------------------------------------------------------------ the kit -- */
  // Parts are kept as (template geometry, matrix, finish, bone) and written
  // into one geometry at the end: a template is made once however often it is
  // used, and nothing is cloned.
  function Kit(THREE, rig, low) {
    var V = THREE.Vector3, M4 = THREE.Matrix4;
    // (low: the phone build, every turned part with half the sides)
    function sides(n) { return low ? Math.max(6, Math.round(n / 2)) : n; }
    var BI = {}, R = {};
    rig.names.forEach(function (n, i) { BI[n] = i; });
    rig.skeleton.forEach(function (b, i) { R[rig.names[i]] = { h: new V().fromArray(b.head), t: new V().fromArray(b.tail || b.head) }; });
    var list = [], TPL = {};
    var kit = { THREE: THREE, R: R, BI: BI, list: list, low: !!low, rig: rig };
    kit.has = function (n) { return BI[n] != null; };
    kit.H = function (n) { return R[n].h.clone(); };
    kit.T = function (n) { return R[n].t.clone(); };
    kit.v = function (x, y, z) { return new V(x, y, z); };
    kit.add = function (g, m, slot, bone, e) {
      var s = typeof slot === 'number' ? slot : SLOTS[slot]; if (s == null) s = 0;
      var b = typeof bone === 'string' ? BI[bone] : bone;
      if (b == null) return null;
      // (a worn part is only rustier than a polished one, not duller: chrome stays a mirror where it is clean)
      e = e || (slot === 'worn' ? [0.25, 0.7, 0] : [0.2, 0, 0]);
      var p = { g: g, m: m || null, s: s, b: b, e: e };
      list.push(p); return p;
    };
    // templates: a ball, a rounded box, a ring, a turned part, along +Y, unit size
    kit.tpl = function (key, make) { return TPL[key] || (TPL[key] = make()); };
    function sph(n) { n = sides(n); return kit.tpl('sph' + n, function () { return new THREE.SphereGeometry(1, n, Math.max(6, n * 3 >> 2)); }); }
    function rbox(r) {
      return kit.tpl('rbox' + r, function () {
        var g = new THREE.BoxGeometry(1, 1, 1, low ? 2 : 3, low ? 2 : 3, low ? 2 : 3), p = g.attributes.position, n = g.attributes.normal, q = new V(), c = new V(), e = 0.5 - r;
        for (var i = 0; i < p.count; i++) {
          q.fromBufferAttribute(p, i); c.set(clamp(q.x, -e, e), clamp(q.y, -e, e), clamp(q.z, -e, e));
          var d = q.clone().sub(c); if (d.lengthSq() < 1e-10) continue;
          d.normalize(); p.setXYZ(i, c.x + d.x * r, c.y + d.y * r, c.z + d.z * r); n.setXYZ(i, d.x, d.y, d.z);
        }
        return g;
      });
    }
    // a frame whose +Y runs from a to b, +X toward `side` (made square to it)
    kit.frame = function (a, b, side, sx, sz) {
      var y = b.clone().sub(a), L = y.length(); y.divideScalar(L || 1);
      var x = (side || new V(1, 0, 0)).clone(); x.addScaledVector(y, -x.dot(y));
      if (x.lengthSq() < 1e-8) { x.set(0, 0, 1).addScaledVector(y, -y.z); }
      x.normalize(); var z = new V().crossVectors(x, y);
      var m = new M4().makeBasis(x.multiplyScalar(sx == null ? 1 : sx), y.clone().multiplyScalar(L), z.multiplyScalar(sz == null ? (sx == null ? 1 : sx) : sz));
      m.setPosition(a); return m;
    };
    // a cylinder from a to b (radius r, or [rx, rz] across `side`)
    // (its ends chamfered by a fifth of its radius: a flat end face mirrors a lamp as a white disc)
    kit.rod = function (a, b, r, slot, bone, e, n, side) {
      var rx = Array.isArray(r) ? r[0] : r, rz = Array.isArray(r) ? r[1] : r, L = a.distanceTo(b) || 1e-4;
      var c = Math.round(clamp(0.22 * Math.max(rx, rz) / L, 0.004, 0.25) * 200) / 200, ns = sides(n || 16);
      var g = kit.tpl('rod' + ns + ':' + c, function () { return new THREE.LatheGeometry([[1e-4, 0], [0.78, 0], [1, c], [1, 1 - c], [0.78, 1], [1e-4, 1]].map(function (q) { return new THREE.Vector2(q[0], q[1]); }), ns); });
      return kit.add(g, kit.frame(a, b, side, rx, rz), slot, bone, e);
    };
    kit.ball = function (c, r, slot, bone, e, n) {
      var rr = Array.isArray(r) ? r : [r, r, r];
      return kit.add(sph(n || 20), new M4().makeScale(rr[0], rr[1], rr[2]).setPosition(c), slot, bone, e);
    };
    // a rounded box centred at c, size [w, h, d] along the axes x, y (=up), z of `basis` (three vectors), or the world's
    kit.box = function (c, size, basis, slot, bone, e, round) {
      var m = new M4();
      if (basis) m.makeBasis(basis[0].clone().normalize().multiplyScalar(size[0]), basis[1].clone().normalize().multiplyScalar(size[1]), basis[2].clone().normalize().multiplyScalar(size[2]));
      else m.makeScale(size[0], size[1], size[2]);
      m.setPosition(c);
      return kit.add(rbox(round == null ? 0.18 : round), m, slot, bone, e);
    };
    // a turned part: profile [[radius, along 0..1], ...] spun round the line a-b, radius scaled by r
    kit.lathe = function (a, b, prof, r, slot, bone, e, n, side) {
      var ns = sides(n || 20), key = 'lathe' + ns + JSON.stringify(prof);
      var g = kit.tpl(key, function () { return new THREE.LatheGeometry(prof.map(function (q) { return new THREE.Vector2(Math.max(1e-4, q[0]), q[1]); }), ns); });
      return kit.add(g, kit.frame(a, b, side, r, r), slot, bone, e);
    };
    // a ring (washer, collar) round the axis a->b at a, radius r, tube t
    kit.ring = function (c, axis, r, t, slot, bone, e, n) {
      var ns = sides(n || 20), g = kit.tpl('ring' + ns + ':' + t.toFixed(4) + ':' + r.toFixed(4), function () { var q = new THREE.TorusGeometry(r, t, low ? 6 : 8, ns); q.rotateX(Math.PI / 2); return q; });
      var y = axis.clone().normalize(), m = new M4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new V(0, 1, 0), y)); m.setPosition(c);
      return kit.add(g, m, slot, bone, e);
    };
    // a swept part along a path of points: profile [[u, v], ...] (a closed loop) in the frame (N, B) at each point.
    // up (a vector) keeps N square to the path toward it (flat bands); without it the frame is carried along.
    // smooth: normals from the profile's centre (round profiles); otherwise each edge is flat. radius(t, s) scales the
    // profile at a fraction t of the length and s metres along it. skin: a bone, or [[bone, t], ...] blended along it.
    kit.sweep = function (pts, prof, o) {
      o = o || {};
      var n = pts.length, P = pts.map(function (q) { return q.isVector3 ? q : new V().fromArray(q); });
      var Tn = [], N = [], B = [], S = [0], i, k;
      for (i = 1; i < n; i++) S.push(S[i - 1] + P[i].distanceTo(P[i - 1]));
      var len = S[n - 1] || 1;
      for (i = 0; i < n; i++) Tn.push(P[Math.min(n - 1, i + 1)].clone().sub(P[Math.max(0, i - 1)]).normalize());
      var up = o.up ? (o.up.isVector3 ? o.up : new V().fromArray(o.up)) : null;
      for (i = 0; i < n; i++) {
        var nn;
        if (up) { nn = up.clone().addScaledVector(Tn[i], -up.dot(Tn[i])); if (nn.lengthSq() < 1e-8) nn = new V(1, 0, 0); }
        else if (i === 0) { nn = Math.abs(Tn[0].y) < 0.9 ? new V(0, 1, 0) : new V(1, 0, 0); nn.addScaledVector(Tn[0], -nn.dot(Tn[0])); }
        else { nn = N[i - 1].clone().addScaledVector(Tn[i], -N[i - 1].dot(Tn[i])); }
        nn.normalize(); N.push(nn); B.push(new V().crossVectors(Tn[i], nn).normalize());
      }
      // (the sides wound to face out along the profile's own normals: wound the other way, the far side's inside showed
      // through, lit from behind, and every rib, hose and cable read as flat grey)
      var smooth = !!o.smooth, m = prof.length, pos = [], nor = [], pt = [], idx = [];
      function emit(i, u, v, nu, nv) {
        var rs = o.radius ? o.radius(S[i] / len, S[i]) : 1, q = P[i];
        pos.push(q.x + (N[i].x * u + B[i].x * v) * rs, q.y + (N[i].y * u + B[i].y * v) * rs, q.z + (N[i].z * u + B[i].z * v) * rs);
        var nx = N[i].x * nu + B[i].x * nv, ny = N[i].y * nu + B[i].y * nv, nz = N[i].z * nu + B[i].z * nv, l = Math.hypot(nx, ny, nz) || 1;
        nor.push(nx / l, ny / l, nz / l); pt.push(S[i] / len);
      }
      if (smooth) {
        for (i = 0; i < n; i++) for (k = 0; k <= m; k++) { var pp = prof[k % m]; emit(i, pp[0], pp[1], pp[0], pp[1]); }
        for (i = 0; i < n - 1; i++) for (k = 0; k < m; k++) { var a = i * (m + 1) + k, b = a + m + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
      } else {
        for (k = 0; k < m; k++) {
          var p0 = prof[k], p1 = prof[(k + 1) % m], eu = p1[0] - p0[0], ev = p1[1] - p0[1], base = pos.length / 3;
          // the edge's outward normal (the loop runs counter-clockwise in (u, v))
          var nu = ev, nv = -eu;
          for (i = 0; i < n; i++) { emit(i, p0[0], p0[1], nu, nv); emit(i, p1[0], p1[1], nu, nv); }
          for (i = 0; i < n - 1; i++) { var c0 = base + i * 2; idx.push(c0, c0 + 1, c0 + 2, c0 + 2, c0 + 1, c0 + 3); }
        }
      }
      if (o.caps !== false) [0, n - 1].forEach(function (ci, e) {
        var base = pos.length / 3, sg = e ? 1 : -1;
        for (k = 0; k < m; k++) { var rs = o.radius ? o.radius(S[ci] / len, S[ci]) : 1, q = P[ci], pr = prof[k]; pos.push(q.x + (N[ci].x * pr[0] + B[ci].x * pr[1]) * rs, q.y + (N[ci].y * pr[0] + B[ci].y * pr[1]) * rs, q.z + (N[ci].z * pr[0] + B[ci].z * pr[1]) * rs); nor.push(Tn[ci].x * sg, Tn[ci].y * sg, Tn[ci].z * sg); pt.push(S[ci] / len); }
        for (k = 1; k < m - 1; k++) { if (e) idx.push(base, base + k, base + k + 1); else idx.push(base, base + k + 1, base + k); }
      });
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('pt', new THREE.Float32BufferAttribute(pt, 1));
      g.setIndex(idx);
      var sk = o.skin;
      if (Array.isArray(sk)) sk = sk.map(function (q) { return [typeof q[0] === 'string' ? BI[q[0]] : q[0], q[1]]; }).filter(function (q) { return q[0] != null; });
      return kit.add(g, null, o.slot || 'chrome', Array.isArray(sk) ? sk : sk, o.e);
    };
    // long triangles split until no edge is longer than max (a flat piece to be bent must bend between its
    // outline's corners too), and normals averaged where faces meet at under deg (smooth, but crisp at its edges)
    kit.subdivide = function (geo, max) {
      geo = geo.index ? geo.toNonIndexed() : geo;
      var src = geo.attributes.position.array, out = [], stack = [], i;
      for (i = 0; i < src.length; i += 9) stack.push(Array.prototype.slice.call(src, i, i + 9));
      for (var guard = 0; stack.length && guard < 100000; guard++) {
        var t = stack.pop(), e0 = Math.hypot(t[3] - t[0], t[4] - t[1], t[5] - t[2]), e1 = Math.hypot(t[6] - t[3], t[7] - t[4], t[8] - t[5]), e2 = Math.hypot(t[0] - t[6], t[1] - t[7], t[2] - t[8]), em = Math.max(e0, e1, e2);
        if (em <= max) { for (i = 0; i < 9; i++) out.push(t[i]); continue; }
        var a = em === e0 ? 0 : em === e1 ? 3 : 6, b = (a + 3) % 9, c = (a + 6) % 9, m = [(t[a] + t[b]) / 2, (t[a + 1] + t[b + 1]) / 2, (t[a + 2] + t[b + 2]) / 2];
        stack.push([t[a], t[a + 1], t[a + 2], m[0], m[1], m[2], t[c], t[c + 1], t[c + 2]], [m[0], m[1], m[2], t[b], t[b + 1], t[b + 2], t[c], t[c + 1], t[c + 2]]);
      }
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3)); return g;
    };
    kit.smoothNormals = function (geo, deg) {
      geo.computeVertexNormals();
      var p = geo.attributes.position, n = geo.attributes.normal, fn = new Float32Array(n.array), map = {}, cos = Math.cos(deg * Math.PI / 180), i, k;
      for (i = 0; i < p.count; i++) { k = Math.round(p.getX(i) * 1e5) + ',' + Math.round(p.getY(i) * 1e5) + ',' + Math.round(p.getZ(i) * 1e5); (map[k] || (map[k] = [])).push(i); }
      for (k in map) map[k].forEach(function (a, _, L) {
        var sx = 0, sy = 0, sz = 0;
        L.forEach(function (b) { if (fn[a * 3] * fn[b * 3] + fn[a * 3 + 1] * fn[b * 3 + 1] + fn[a * 3 + 2] * fn[b * 3 + 2] >= cos) { sx += fn[b * 3]; sy += fn[b * 3 + 1]; sz += fn[b * 3 + 2]; } });
        var l = Math.hypot(sx, sy, sz) || 1; n.setXYZ(a, sx / l, sy / l, sz / l);
      });
      return geo;
    };
    // a bent plate: the outline pts [[x, y], ...] (counter-clockwise, metres) cut from a sheet t thick with a small
    // bevel, its back at z 0 and its face toward +z, cut fine enough to bend and bent by bend(x, y) -> dz, its normals
    // smooth across it and crisp at its edges (flat, a plate mirrors a lamp across the whole of it). Made once per key.
    kit.plate = function (key, pts, t, bend, bev, cut) {
      return kit.tpl('plate:' + key, function () {
        var b = bev == null ? 0.003 : bev, shp = new THREE.Shape(pts.map(function (q) { return new THREE.Vector2(q[0], q[1]); }));
        var e = kit.subdivide(new THREE.ExtrudeGeometry(shp, { depth: Math.max(0.0005, t - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: b > 0.002 ? 2 : 1, curveSegments: 6 }), (cut || 0.02) * (low ? 1.6 : 1)), pa = e.attributes.position;
        for (var i = 0; i < pa.count; i++) pa.setZ(i, pa.getZ(i) + b + (bend ? bend(pa.getX(i), pa.getY(i)) : 0));
        return kit.smoothNormals(e, 35);
      });
    };
    // a rounded rectangle's outline, w by h, its corners rounded by r
    kit.rrect = function (w, h, r) {
      var out = [], a = w / 2 - r, c = h / 2 - r;
      [[a, c], [-a, c], [-a, -c], [a, -c]].forEach(function (q, i) { for (var k = 0; k <= 3; k++) { var t = (i + k / 3) * Math.PI / 2; out.push([q[0] + Math.cos(t) * r, q[1] + Math.sin(t) * r]); } });
      return out;
    };
    kit.circle = function (r, n) { var out = []; for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2; out.push([Math.cos(a) * r, Math.sin(a) * r]); } return out; };
    kit.rect = function (w, h, ch) {
      // a rectangle w (along N) by h (along B) with its corners cut by ch, counter-clockwise
      var a = w / 2, b = h / 2, c = ch || 0;
      return c ? [[-a + c, -b], [a - c, -b], [a, -b + c], [a, b - c], [a - c, b], [-a + c, b], [-a, b - c], [-a, -b + c]] : [[-a, -b], [a, -b], [a, b], [-a, b]];
    };
    // a smooth path through control points (Catmull-Rom), n points
    kit.path = function (ctrl, n) {
      var c = new THREE.CatmullRomCurve3(ctrl.map(function (q) { return q.isVector3 ? q : new V().fromArray(q); }), false, 'centripetal');
      return c.getSpacedPoints((low ? Math.max(4, Math.round(n / 2)) : n) - 1);
    };
    // everything, written into one geometry: material groups in slot order, each vertex on its bone(s)
    kit.merge = function () {
      var nv = 0, ni = [0, 0, 0, 0, 0, 0], i, k;
      list.forEach(function (p) { nv += p.g.attributes.position.count; ni[p.s] += p.g.index ? p.g.index.count : p.g.attributes.position.count; });
      var pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), si = new Uint8Array(nv * 4), sw = new Uint8Array(nv * 4), en = new Uint8Array(nv * 3), co = new Uint8Array(nv * 3);
      var total = ni.reduce(function (a, b) { return a + b; }, 0), idx = nv > 65535 ? new Uint32Array(total) : new Uint16Array(total);
      var at = [], o = 0; for (k = 0; k < 6; k++) { at.push(o); o += ni[k]; }
      var cur = at.slice(), v = 0, nm = new THREE.Matrix3(), q = new V();
      list.forEach(function (p) {
        var gp = p.g.attributes.position, gn = p.g.attributes.normal, gt = p.g.attributes.pt, cnt = gp.count;
        if (p.m) nm.getNormalMatrix(p.m);
        for (i = 0; i < cnt; i++) {
          var w = v + i;
          q.fromBufferAttribute(gp, i); if (p.m) q.applyMatrix4(p.m); pos[w * 3] = q.x; pos[w * 3 + 1] = q.y; pos[w * 3 + 2] = q.z;
          if (gn) { q.fromBufferAttribute(gn, i); if (p.m) q.applyMatrix3(nm); q.normalize(); } else q.set(0, 1, 0);
          nor[w * 3] = q.x; nor[w * 3 + 1] = q.y; nor[w * 3 + 2] = q.z;
          if (Array.isArray(p.b)) {
            // blended along its length: between the two bones it lies between at this point
            var t = gt ? gt.getX(i) : 0, B = p.b, j = 0;
            while (j < B.length - 2 && t > B[j + 1][1]) j++;
            var u = B.length < 2 ? 0 : sm(B[j][1], B[j + 1][1], t);
            si[w * 4] = B[j][0]; si[w * 4 + 1] = B.length < 2 ? 0 : B[j + 1][0];
            var wa = Math.round((1 - u) * 255); sw[w * 4] = wa; sw[w * 4 + 1] = 255 - wa;
          } else { si[w * 4] = p.b; sw[w * 4] = 255; }
          if (p.c) { co[w * 3] = Math.round(p.c[i * 3] * 255); co[w * 3 + 1] = Math.round(p.c[i * 3 + 1] * 255); co[w * 3 + 2] = Math.round(p.c[i * 3 + 2] * 255); } else co[w * 3] = co[w * 3 + 1] = co[w * 3 + 2] = 255;
          en[w * 3] = Math.round(clamp(p.e[0], 0, 1) * 255); en[w * 3 + 1] = Math.round(clamp(p.e[1], 0, 1) * 255); en[w * 3 + 2] = Math.round(clamp(0.5 + (p.e[2] || 0) * 2, 0, 1) * 255);
        }
        var gi = p.g.index;
        if (gi) for (i = 0; i < gi.count; i++) idx[cur[p.s]++] = gi.getX(i) + v;
        else for (i = 0; i < cnt; i++) idx[cur[p.s]++] = v + i;
        v += cnt;
      });
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
      geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4, true));
      geo.setAttribute('endo', new THREE.BufferAttribute(en, 3, true));
      geo.setAttribute('color', new THREE.BufferAttribute(co, 3, true));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      for (k = 0; k < 6; k++) if (ni[k]) geo.addGroup(at[k], ni[k], k);
      geo.computeBoundingSphere();
      return { geometry: geo, triangles: total / 3 };
    };
    return kit;
  }

  /* -------------------------------------------------------- the skull -- */
  // the head (from buildEndoHead) on the head bone: upright in mesh space, its centre where the person's skull is
  var FINISHES = /^(chrome|worn|steel|dark|rubber|teeth|eye)$/;
  function addHead(K, opts, rig) {
    var THREE = K.THREE, made = buildEndoHead(THREE, opts || {}), g = made.group;
    g.position.set(0, 0, 0); g.scale.setScalar(1); g.rotation.set(0, 0, 0); g.updateMatrixWorld(true);
    // what goes on the head bone: the head part and the jaw (once, wherever it hangs)
    // (its Sprites, the optics' glows, are not part of one skinned mesh: they mark where the runtime hangs its own)
    var meshes = [], glows = [];
    [made.parts.head, made.parts.jaw].forEach(function (p) { if (p) p.traverse(function (o) { if (o.isSprite) { if (glows.indexOf(o) < 0) glows.push(o); } else if (o.isMesh && o.geometry && o.geometry.attributes.position && meshes.indexOf(o) < 0) meshes.push(o); }); });
    var box = new THREE.Box3(); meshes.forEach(function (o) { box.expandByObject(o); });
    if (box.isEmpty()) return null;
    // fitted: the crown on the person's crown, its depth centred a little in front of the head bone; a little larger than
    // the person's own head (the skull of the photograph is a big one: a person's size read small over the machine's
    // broad shoulders)
    var hb = K.H('head'), crown = rig.height || K.T('head').y + 0.024, want = crown * 0.145, size = box.getSize(new THREE.Vector3());
    var k = clamp(want / (size.y || want), 0.7, 1.4), cz = (box.min.z + box.max.z) / 2;
    var fit = new THREE.Matrix4().makeTranslation(0, crown - box.max.y * k, hb.z - 0.008 - cz * k).multiply(new THREE.Matrix4().makeScale(k, k, k));
    // and its chin raised about the neck's top (10 degrees): every captured clip carries the head ten to seventeen
    // degrees down, a person's easy gaze, which on a skull tipped the brow over the face and the dome over all (a helmet)
    fit.premultiply(new THREE.Matrix4().makeTranslation(-hb.x, -hb.y, -hb.z)).premultiply(new THREE.Matrix4().makeRotationX(-0.17)).premultiply(new THREE.Matrix4().makeTranslation(hb.x, hb.y, hb.z));
    meshes.forEach(function (o) {
      var nm = String(o.name || '').split('-').pop(), finish = FINISHES.test(o.userData.endo || '') ? o.userData.endo : FINISHES.test(nm) ? nm : guessFinish(o.material, o.name);
      var col = o.geometry.attributes.color, rel = null;
      // its own grime and rust, relative to its brightest (the body's material gives the colour); never on the optics,
      // which glow in full whatever a head painted on them (one lit its own by emission and coloured them near black)
      if (col && col.count && finish !== 'eye') {
        var ch = [[], [], []], i, j;
        for (i = 0; i < col.count; i += Math.max(1, col.count >> 10)) for (j = 0; j < 3; j++) ch[j].push(col.getComponent(i, j));
        var top = ch.map(function (a) { a.sort(function (x, y) { return x - y; }); return Math.max(1e-3, a[Math.floor(a.length * 0.9)]); });
        rel = new Float32Array(col.count * 3);
        // (mid-tones lifted toward the polish: a head's grime reads as scuffs on the body, not marble; its deep
        // crevices stay dark)
        for (i = 0; i < col.count; i++) for (j = 0; j < 3; j++) { var rv = Math.min(1, col.getComponent(i, j) / top[j]); rel[i * 3 + j] = rv + (0.55 + 0.45 * rv - rv) * sm(0.15, 0.45, rv); }
        // a vertex-coloured dark material is a steel, shaded by its colours
        if (finish === 'dark') finish = 'steel';
      }
      // (the skull's plates satin, rougher than the body's polish: a mirror there showed the dark room as a black dome
      // with white streaks across it, and from above the cranium outweighed the face)
      var sat = finish === 'chrome' || finish === 'worn' ? 0.07 : 0;
      var p = K.add(o.geometry, fit.clone().multiply(o.matrixWorld), finish, 'head', rel ? [0.04, 0, sat] : finish === 'worn' ? [0.2, 0.55, sat] : finish === 'dark' ? [0.6, 0, 0.1] : [0.15, 0.08, sat]);
      if (p) p.c = rel;
    });
    var eyes = glows.map(function (o) { var q = new THREE.Vector3().setFromMatrixPosition(fit.clone().multiply(o.matrixWorld)); return [q.x, q.y, q.z]; });
    // (never smaller than the optic's own housing: the glow is what carries the eyes from a chase camera 4 to 6 m back)
    return { scale: k, eyes: eyes, eyeSize: Math.max(0.03, (glows[0] ? glows[0].scale.x : 0.03) * k) };
  }
  function guessFinish(m, name) {
    // a telling word in its name first ('teeth-upper', 'head-optics', 'neck-cables'), then the material itself
    var n = String(name || '').toLowerCase();
    if (/teeth|tooth/.test(n)) return 'teeth';
    if (/optic|eye|lens|glow/.test(n)) return 'eye';
    if (/rubber|hose|cable/.test(n)) return 'rubber';
    if (/dark|cavity|socket|interior/.test(n)) return 'dark';
    m = Array.isArray(m) ? m[0] : m; if (!m) return 'chrome';
    if (m.isMeshBasicMaterial || (m.emissive && m.emissive.r > 0.5 && m.emissiveIntensity > 0.5)) return 'eye';
    var c = m.color || { r: 1, g: 1, b: 1 }, l = (c.r + c.g + c.b) / 3;
    if ((m.metalness || 0) >= 0.5) return l < 0.25 ? 'dark' : (m.roughness || 0) < 0.3 ? 'chrome' : 'steel';
    if (l < 0.12) return (m.roughness || 0) > 0.4 ? 'rubber' : 'dark';
    return c.r > c.b + 0.05 && l > 0.5 ? 'teeth' : 'steel';
  }

  /* --------------------------------------------------------- the body -- */
  // A heavy machine, not a stick figure: from the front its outline is close to the person's own at muscle 1, broad
  // shoulders on big ball housings, a deep armoured rib cage, a wide pelvic girdle, and limbs that are bundles of
  // cylinders round a strut with dark gaps between them (not a solid fill), so the clips that keep the person's arms
  // off his chest keep the machine's off its own. Every measure below is in metres on the library male (1.87 m),
  // placed from the bones' rest heads and tails, across the trunk scaled by the person's own shoulders and hips, so the
  // female and any height follow; g thins the metal a little for a lighter build.
  function buildBody(K, o) {
    var THREE = K.THREE, V = THREE.Vector3, v = K.v, H = K.H, T = K.T, low = K.low;
    var g = 0.9 + 0.1 * clamp(Number(o.muscle) || 0, 0, 1);
    var X = v(1, 0, 0), Y = v(0, 1, 0), Z = v(0, 0, 1);
    // finishes: [grime, rust, roughness nudge] for polished, inner, plated and rod parts
    // (the polished parts dirtier, and the rods no sharper than the rest: clean and sharp, the chrome mirrored the
    // dark backdrop as black and the lamps as white streaks, never the photograph's warm satin nickel)
    var EP = [0.25, 0, 0], EI = [0.45, 0.1, 0.08], ER = [0.08, 0, 0], EW = [0.25, 0.6, 0];
    // the person's breadth against the library male's: the shoulders for the chest, the hips for the pelvis
    var kw = clamp(H('upperarm01_L').x / 0.211, 0.7, 1.25), kh = clamp(H('upperleg01_L').x / 0.113, 0.7, 1.25);
    function lerp(a, b, t) { return a.clone().lerp(b, t); }
    var circ8 = K.circle(1, 8);
    // a plate (K.plate) set with its back at c, its outline's x along ax and its face toward nrm
    function place(geo, c, ax, nrm, slot, bone, e) {
      var z = nrm.clone().normalize(), x = ax.clone().addScaledVector(z, -ax.dot(z)).normalize(), y = new V().crossVectors(z, x);
      var m = new THREE.Matrix4().makeBasis(x, y, z); m.setPosition(c);
      return K.add(geo, m, slot, bone, e);
    }
    // a plate on one side of the body: its outline's +x outward (mirrored on the right, not turned over), its +y up,
    // its face toward nrm; returns at(x, y): the point on its face over the outline's (x, y), and its normal
    function sidePlate(key, pts, t, bend, bev, cut, c, nrm, s, slot, bone, e) {
      var z = nrm.clone().normalize(), x = v(1, 0, 0); x.addScaledVector(z, -x.dot(z)).normalize();
      if (new V().crossVectors(z, x).y < 0) x.negate();
      var y = new V().crossVectors(z, x), mir = (x.x > 0) !== (s > 0), P = mir ? pts.map(function (q) { return [-q[0], q[1]]; }).reverse() : pts;
      place(K.plate(key + (mir ? '-m' : ''), P, t, bend && mir ? function (a, b) { return bend(-a, b); } : bend, bev, cut), c, x, z, slot, bone, e);
      return { n: z, at: function (qx, qy) { return c.clone().addScaledVector(x, mir ? -qx : qx).addScaledVector(y, qy).addScaledVector(z, t + (bend ? bend(qx, qy) : 0)); } };
    }
    // a domed bolt head on a face at p, normal n
    function bolt(p, n, r, bone) { K.lathe(p.clone().addScaledVector(n, -0.002), p.clone().addScaledVector(n, r * 0.7), [[0, 0], [1, 0], [1, 0.45], [0.6, 1], [0, 1]], r, 'chrome', bone, EP, 10); }
    // a hydraulic piston from a to b: a barrel (radius rb) for `frac` of the way, a polished rod (rr) the rest, a
    // gland where the rod goes in, and an eye at each end
    function piston(a, b, rb, rr, frac, bone, side, barrelSlot) {
      var m = lerp(a, b, frac), d = b.clone().sub(a).normalize();
      K.lathe(a, m, [[0, 0], [0.8, 0], [1, 0.04], [1, 0.12], [0.88, 0.15], [0.88, 0.85], [1, 0.88], [1, 0.97], [0.55, 1], [0, 1]], rb, barrelSlot || 'chrome', bone, EP, 18, side);
      K.rod(m.clone().addScaledVector(d, -0.004), b, rr, 'chrome', bone, ER, 12, side);
      if (!low) { K.lathe(m.clone().addScaledVector(d, -0.003), m.clone().addScaledVector(d, 0.007), [[0, 0], [1, 0], [1, 1], [0, 1]], rr * 1.5, 'steel', bone, EI, 12); K.ball(a, rb * 0.62, 'steel', bone, EI, 8); }
      if (!low) K.ball(b, rr * 1.4, 'chrome', bone, EP, 8);
    }
    // a machined strut: a tube with flanges at its ends and a waist between
    function strut(a, b, r, bone, side, slot) {
      K.lathe(a, b, [[0, 0], [0.9, 0], [1.05, 0.03], [1.05, 0.09], [0.84, 0.13], [0.76, 0.5], [0.84, 0.87], [1.05, 0.91], [1.05, 0.97], [0.9, 1], [0, 1]], r, slot || 'chrome', bone, EP, 16, side);
    }
    // a hinge: an axle along `axis` through c, a domed knuckle cap with a bolt at each end
    function hinge(c, axis, r, w, bone, capR) {
      var ax = axis.clone().normalize(), a = c.clone().addScaledVector(ax, -w / 2), b = c.clone().addScaledVector(ax, w / 2);
      K.rod(a, b, r, 'steel', bone, EI, 16);
      [a, b].forEach(function (p, i) {
        var o2 = ax.clone().multiplyScalar(i ? 1 : -1), cr = capR || r * 1.25;
        K.lathe(p.clone().addScaledVector(o2, -r * 0.2), p.clone().addScaledVector(o2, r * 0.6), [[0, 0], [1, 0], [1, 0.35], [0.9, 0.62], [0.68, 0.86], [0.4, 1], [0, 1]], cr, 'chrome', bone, EP, 22);
        if (!low) K.lathe(p.clone().addScaledVector(o2, r * 0.52), p.clone().addScaledVector(o2, r * 0.72), [[0, 0], [1, 0], [1, 0.6], [0.7, 1], [0, 1]], cr * 0.36, 'steel', bone, EI, 12);
      });
    }
    // a corrugated rubber hose through control points, blended over the bones it crosses, a nut at each end (eight
    // chamfered sides: a closed cylinder's end mirrored a lamp as a white disc)
    function hose(ctrl, r, skin, n) {
      var pts = K.path(ctrl, n || 36);
      K.sweep(pts, circ8.map(function (q) { return [q[0] * r, q[1] * r]; }), { smooth: true, slot: 'rubber', skin: skin, e: [0.1, 0, 0], radius: function (t, s) { return 1 + 0.11 * Math.max(0, Math.sin(s / 0.0105 * Math.PI * 2)); } });
      if (!low) [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]].forEach(function (e, i) {
        var d = e[0].clone().sub(e[1]).normalize(), bone = Array.isArray(skin) ? skin[i ? skin.length - 1 : 0][0] : skin;
        K.lathe(e[0].clone().addScaledVector(d, -0.012), e[0].clone().addScaledVector(d, 0.004), [[0, 0], [0.7, 0], [1, 0.18], [1, 0.82], [0.7, 1], [0, 1]], r * 1.45, 'steel', bone, EI, 8);
      });
    }
    function cable(ctrl, r, skin, slot, n) {
      K.sweep(K.path(ctrl, n || 24), circ8.map(function (q) { return [q[0] * r, q[1] * r]; }), { smooth: true, slot: slot || 'chrome', skin: skin, e: [0.15, 0, 0] });
    }
    // a cylinder lying along a-b with domed ends and a collar near each (the works in the chest)
    // (its ends domed: a flat end mirrored a lamp as a white disc)
    function canister(a, b, r, slot, bone, n) {
      var c = Math.round(clamp(0.35 * r / a.distanceTo(b), 0.02, 0.2) * 100) / 100;
      K.lathe(a, b, [[0, 0], [0.55, c * 0.3], [0.85, c * 0.7], [1, c], [1, c + 0.06], [0.94, c + 0.09], [0.94, 0.91 - c], [1, 0.94 - c], [1, 1 - c], [0.85, 1 - c * 0.7], [0.55, 1 - c * 0.3], [0, 1]], r, slot, bone, slot === 'steel' ? EI : EP, n || 18);
    }
    // a piston from a to b whose barrel (rb, to `frac` of the way) rides on bone A and whose rod (rr) rides on bone B,
    // swept as one piece and blended across the gland, so it bends a little there as B moves against A (a rigid one
    // came off the part it drives); an eye at each end
    var circ12 = K.circle(1, low ? 8 : 12);
    function swingPiston(a, b, rb, rr, frac, boneA, boneB) {
      var k = rr / rb, f = frac, TT = [0, 0.025, 0.06, 0.12, 0.125, 0.165, 0.17, f - 0.09, f - 0.085, f - 0.025, f - 0.02, f - 0.005, f, f + 0.04, f + 0.045, 0.75, 1];
      var RR = [0.6, 0.94, 1, 1, 1.09, 1.09, 1, 1, 1.09, 1.09, 1, 0.94, 0.62, 0.62, k, k, k];
      if (low) { TT = [0, 0.04, 0.12, f - 0.02, f, f + 0.04, f + 0.045, 1]; RR = [0.6, 1, 1, 1, 0.62, 0.62, k, k]; }
      var pts = TT.map(function (t) { return lerp(a, b, t); });
      K.sweep(pts, circ12, { smooth: true, slot: 'chrome', skin: [[boneA, 0], [boneA, f - 0.04], [boneB, f + 0.2]], e: EP, radius: function (t) { var bi = 0; for (var i = 1; i < TT.length; i++) if (Math.abs(TT[i] - t) < Math.abs(TT[bi] - t)) bi = i; return rb * RR[bi]; } });
      K.ball(a, rb * 0.72, 'steel', boneA, EI, 12);
      K.ball(b, rr * 1.5, 'chrome', boneB, EP, 10);
    }

    /* ---- the pelvis (root): a wide machined girdle, a domed housing over each hip ball ---- */
    var hipL = H('upperleg01_L'), hipR = H('upperleg01_R'), sp5 = H('spine05');
    // the sacrum the spine stands on, the bar through both hip balls, the pubic block under the front with a plate
    K.box(v(0, sp5.y - 0.032, sp5.z - 0.05), [0.15 * kh, 0.11, 0.11], null, 'chrome', 'root', EP, 0.16);
    K.lathe(v(0, sp5.y + 0.006, sp5.z - 0.018), v(0, sp5.y + 0.024, sp5.z - 0.018), [[0, 0], [1, 0], [1, 0.7], [0.8, 1], [0, 1]], 0.05 * g, 'steel', 'root', EI, 20);
    K.rod(hipL.clone().add(v(-0.02, 0, -0.008)), hipR.clone().add(v(0.02, 0, -0.008)), 0.024 * g, 'steel', 'root', EI, 16);
    // (a big trapezoid shield over the front of the girdle, bent to it: a thin bar across with a small block under it
    // read as a towel rail and a pocket)
    K.box(v(0, hipL.y - 0.04, 0.036), [0.08 * kh, 0.08, 0.06], null, 'steel', 'root', EI, 0.22);
    place(K.plate('pubis', [[-0.06, 0.05], [-0.035, -0.05], [0.035, -0.05], [0.06, 0.05]].map(function (q) { return [q[0] * kh, q[1]]; }), 0.012, function (x, y) { return -x * x * 7 - (y - 0.05) * (y - 0.05) * 1.2; }, 0.003, 0.035), v(0, hipL.y - 0.035, 0.07), X, v(0, -0.12, 1), 'worn', 'root', EW);
    if (!low) (function () { var n = v(0, -0.12, 1).normalize(), yv = new V().crossVectors(n, X); [[-0.04, 0.032], [0.04, 0.032], [0, -0.03]].forEach(function (q) { bolt(v(q[0] * kh, hipL.y - 0.035, 0.07).addScaledVector(yv, q[1]).addScaledVector(n, 0.012 - q[0] * q[0] * 7 - Math.pow(q[1] - 0.05, 2) * 1.2), n, 0.0075, 'root'); }); })();
    [1, -1].forEach(function (s) {
      var hj = s > 0 ? hipL : hipR, dO = v(s * 0.94, 0.33, -0.04).normalize();
      // the socket: a dome over the top and outside of the hip ball, bolted round its rim, a block bridging it to the
      // sacrum and an iliac wing standing up over it (a ring of plated bands round the hips read as a bowl)
      // (a low drum facing out with a domed cap, not a hemisphere: a full dome stood off the hip like a ball stuck to it)
      K.lathe(hj.clone().addScaledVector(dO, -0.004), hj.clone().addScaledVector(dO, 0.054 * g), [[0.86, 0], [1, 0.08], [1, 0.42], [0.96, 0.5], [0.94, 0.56], [0.84, 0.74], [0.6, 0.9], [0.3, 0.97], [0, 1]], 0.062 * g, 'chrome', 'root', EP, 26);
      K.lathe(hj.clone().addScaledVector(dO, 0.05 * g), hj.clone().addScaledVector(dO, 0.06 * g), [[0, 0], [1, 0], [1, 0.6], [0.6, 1], [0, 1]], 0.022 * g, 'steel', 'root', EI, 16);
      K.ring(hj.clone().addScaledVector(dO, 0.012), dO, 0.062 * g, 0.0055, 'steel', 'root', EI, 24);
      if (!low) for (var i = 0; i < 6; i++) { var an = i / 6 * Math.PI * 2, t1 = new V().crossVectors(dO, Z).normalize(), t2 = new V().crossVectors(dO, t1); K.ball(hj.clone().addScaledVector(dO, 0.036 * g).addScaledVector(t1, Math.cos(an) * 0.052 * g).addScaledVector(t2, Math.sin(an) * 0.052 * g), 0.005, 'steel', 'root', EI, 8); }
      K.box(v(s * 0.07 * kh, hj.y + 0.03, hj.z - 0.026), [0.07, 0.05, 0.078], null, 'chrome', 'root', EP, 0.28);
      // the iliac wing: a big plate facing mostly forward over the socket, its top 0.12 over the hip (turned out to the
      // side it was edge-on from the front, and the girdle read as narrow as the spine)
      var il = sidePlate('ilium', [[-0.058, -0.05], [0.04, -0.05], [0.066, -0.018], [0.07, 0.022], [0.05, 0.05], [-0.036, 0.05], [-0.064, 0.014]], 0.012, function (x, y) { return -x * x * 5 - y * y * 2; }, 0.003, 0.03, v(s * 0.132 * kh, hj.y + 0.07, hj.z + 0.062), v(s * 0.42, 0.16, 0.9), s, 'worn', 'root', EW);
      if (!low) [[-0.042, 0.03], [0.046, 0.03], [0.05, -0.024]].forEach(function (q) { bolt(il.at(q[0], q[1]), il.n, 0.0075, 'root'); });
      // the ischium behind and below, and a strut from the pubic block out under each socket
      K.box(v(s * 0.056 * kh, hj.y - 0.026, -0.082), [0.05, 0.08, 0.04], null, 'steel', 'root', EI, 0.3);
      K.rod(v(s * 0.03, hj.y - 0.07, 0.05), v(s * 0.1 * kh, hj.y - 0.03, 0.03), 0.011 * g, 'chrome', 'root', ER, 12);
    });

    /* ---- the spine (spine05 .. spine02): a thick segmented column between pistons and hoses ---- */
    ['spine05', 'spine04', 'spine03', 'spine02'].forEach(function (n) {
      var a = H(n), b = T(n), L = a.distanceTo(b), segs = L > 0.11 ? 2 : 1;
      for (var k = 0; k < segs; k++) {
        var a0 = lerp(a, b, k / segs + 0.07 / segs), a1 = lerp(a, b, (k + 1) / segs - 0.07 / segs), mid = lerp(a0, a1, 0.5);
        // the vertebral body (a waisted drum), its dark disc, the process behind and a wing either side, swept back
        K.lathe(a0, a1, [[0, 0], [0.84, 0], [1, 0.1], [1, 0.3], [0.9, 0.42], [0.9, 0.58], [1, 0.7], [1, 0.9], [0.84, 1], [0, 1]], 0.043 * g, 'chrome', n, EP, 20, X);
        K.lathe(lerp(a, b, k / segs - 0.06 / segs), lerp(a, b, k / segs + 0.1 / segs), [[0, 0], [1, 0], [1, 1], [0, 1]], 0.035 * g, 'dark', n, [0.5, 0, 0.1], 16);
        K.box(mid.clone().add(v(0, -0.004, -0.05)), [0.04, 0.03, 0.044], null, 'chrome', n, EP, 0.3);
        [1, -1].forEach(function (s) { var w = v(s * Math.cos(0.5), 0, -Math.sin(0.5)); K.box(mid.clone().addScaledVector(w, 0.056).add(v(0, 0, 0.008)), [0.05, 0.014, 0.022], [w, Y, new V().crossVectors(w, Y)], 'chrome', n, EP, 0.3); });
      }
    });
    // the spine's depth at a height, for the hoses tucked against it
    var SPZ = [H('spine05'), H('spine04'), H('spine03'), H('spine02'), H('spine01'), T('spine01')];
    function spineZ(y) { for (var i = 1; i < SPZ.length; i++) if (y <= SPZ[i].y || i === SPZ.length - 1) return SPZ[i - 1].z + (SPZ[i].z - SPZ[i - 1].z) * clamp((y - SPZ[i - 1].y) / (SPZ[i].y - SPZ[i - 1].y), 0, 1); return 0; }
    var c1 = H('spine01'), c2 = T('spine01'), chestTop = c2.y - 0.07, chestBot = c1.y - 0.088;
    [1, -1].forEach(function (s) {
      // (their tops on the rib cage's own bone: on the one below, they came out of it as the waist bent)
      var top = c1.y - 0.05, bot = hipL.y + 0.035, sk = [['spine01', 0], ['spine02', 0.22], ['spine03', 0.5], ['spine05', 0.78], ['root', 1]];
      // the big hoses either side, out in front of the pistons, and the inner pair close against the vertebrae
      hose([v(s * 0.1 * kw, top, 0.03), v(s * 0.118 * kw, (top + bot) / 2 + 0.04, 0.05), v(s * 0.116 * kw, (top + bot) / 2 - 0.05, 0.048), v(s * 0.106 * kh, bot, 0.03)], 0.019 * g, sk);
      var hy = [top + 0.01, (top + bot) / 2, bot - 0.01];
      hose(hy.map(function (y) { return v(s * 0.046, y, spineZ(y) + 0.046); }), 0.011 * g, sk);
      cable([v(s * 0.022, top, -0.056), v(s * 0.026, (top + bot) / 2, -0.07), v(s * 0.024, bot, -0.07)], 0.005, [['spine01', 0], ['spine03', 0.4], ['spine05', 0.75], ['root', 1]], 'steel');
      // a row of pistons and barrels up either side of the column, each rigid on its own vertebra (nothing telescopes
      // across a joint): a long piston on spine02, a short barrel on spine03, a canister on spine05
      var a2 = H('spine02'), b2 = T('spine02'), d2 = b2.clone().sub(a2).normalize();
      piston(a2.clone().addScaledVector(d2, 0.012).add(v(s * 0.074 * kw, 0, 0.024)), b2.clone().addScaledVector(d2, -0.012).add(v(s * 0.074 * kw, 0, 0.024)), 0.022 * g, 0.011, 0.55, 'spine02', X);
      var a3 = H('spine03'), b3 = T('spine03');
      canister(a3.clone().add(v(s * 0.074 * kw, 0.006, 0.022)), b3.clone().add(v(s * 0.074 * kw, -0.006, 0.022)), 0.02 * g, 'chrome', 'spine03');
      // (and one on spine04: without it the waist was the column alone between two hoses, a third of the person's)
      canister(H('spine04').add(v(s * 0.076 * kw, 0.006, 0.026)), T('spine04').add(v(s * 0.076 * kw, -0.006, 0.026)), 0.024 * g, 'steel', 'spine04');
      canister(v(s * 0.074 * kh, sp5.y + 0.008, sp5.z - 0.004), v(s * 0.074 * kh, T('spine05').y - 0.006, T('spine05').z + 0.004), 0.024 * g, 'steel', 'spine05');
    });

    /* ---- the rib cage (spine01): an egg of thick curved rib plates round the works, a sternum under the Y ---- */
    function colZ(y) { return c1.z + (c2.z - c1.z) * clamp((y - c1.y) / (c2.y - c1.y), 0, 1); }
    // the works inside, lit metal behind the ribs (a black mass in there read as a hole from behind): the column, a
    // power cell, a drum across under the Y and two canisters standing either side
    K.lathe(c1, lerp(c1, c2, 0.94), [[0, 0], [0.8, 0], [1, 0.03], [1, 0.97], [0.8, 1], [0, 1]], 0.036 * g, 'steel', 'spine01', EI, 16, X);
    for (var vy = c1.y + 0.02; vy < chestTop + 0.02; vy += 0.05) K.ring(v(0, vy, colZ(vy)), c2.clone().sub(c1), 0.038 * g, 0.006, 'chrome', 'spine01', EP, 18);
    // the backbone behind: a block 6 cm across on a stem off the column at every vertebra, standing 2 cm proud of the
    // ribs (narrow and flush with them, the chase camera saw a flat grid with no spine in it)
    for (var py = c1.y + 0.03; py < chestTop + 0.012; py += 0.036) {
      var zf = colZ(py) - 0.03;
      K.box(v(0, py, (zf - 0.1) / 2), [0.024, 0.02, zf + 0.1], null, 'steel', 'spine01', EI, 0.3);
      K.box(v(0, py, -0.11), [0.06 * kw, 0.026, 0.026], null, 'chrome', 'spine01', EP, 0.3);
    }
    canister(v(0, chestBot + 0.03, 0.0), v(0, chestTop - 0.09, 0.006), 0.042 * kw, 'steel', 'spine01', 20);
    canister(v(-0.1 * kw, chestTop - 0.075, 0.05), v(0.1 * kw, chestTop - 0.075, 0.05), 0.032, 'steel', 'spine01');
    [1, -1].forEach(function (s) {
      canister(v(s * 0.075 * kw, chestBot + 0.035, 0.045), v(s * 0.075 * kw, chestTop - 0.105, 0.05), 0.026, 'chrome', 'spine01');
      if (!low) canister(v(s * 0.1 * kw, chestBot + 0.05, -0.04), v(s * 0.095 * kw, chestTop - 0.06, -0.035), 0.02, 'steel', 'spine01', 14);
    });
    // (all on the chest's bone: a rib cage is one rigid piece, and ribs on the bone below spiralled out of it as the body
    // turned). An egg, narrower under the shoulders and widest at its lower third, kept inside the arms' swing. Six
    // plates, closer at the top (3 cm) than below (5.4 cm); each runs down from the spine round the side, lowest there,
    // and rises again to the sternum, gently at the top and steeply below (10 to 32 degrees), so the front reads as
    // chevrons, not level hoops (a radiator); the lowest two stop short of the sternum, their tips turned up, the open
    // arch a rib cage has; each plate tapers from 2.8 cm tall at the side to 1.8 at the sternum
    var RIBS = 6, NP = low ? 10 : 22, ribProf = K.rect(0.028, 0.011, 0.004), ySide = chestTop - 0.036;
    for (var r = 0; r < RIBS; r++) {
      var u = r / (RIBS - 1), half = (0.158 + 0.027 * sm(0, 0.5, u) - 0.028 * sm(0.6, 1, u)) * kw * g, back = -0.096, front = 0.118 + 0.012 * u;
      var xEnd = r === RIBS - 1 ? 0.095 : r === RIBS - 2 ? 0.08 : 0.026, aEnd = Math.acos(clamp(xEnd / half, 0, 1));
      var slope = Math.tan((10 + 22 * u) * Math.PI / 180), dropB = 0.03 + 0.016 * u, tip = r >= RIBS - 2 ? 0.024 : 0, fs = (Math.PI / 2) / (aEnd + Math.PI / 2), yS = ySide;
      [1, -1].forEach(function (s) {
        var pts = [];
        for (var k = 0; k <= NP; k++) {
          var f = k / NP, a = -Math.PI / 2 + f * (aEnd + Math.PI / 2), zc = (back + front) / 2, zr = (front - back) / 2, x = Math.cos(a) * half;
          var yy = f <= fs ? yS + dropB * Math.pow(1 - f / fs, 1.3) : yS + slope * (half - x) + tip * sm(0.55, 1, (f - fs) / (1 - fs));
          pts.push(v(x * s * (f < 0.1 ? 0.4 + f * 6 : 1), yy, zc + Math.sin(a) * zr));
        }
        pts[0].set(s * 0.03, yS + dropB + 0.004, back + 0.016);
        K.sweep(pts, ribProf, { up: v(0, 1, 0.1), slot: r % 3 === 1 ? 'worn' : 'chrome', skin: 'spine01', e: [0.3, r % 3 === 1 ? 0.55 : 0.12, 0], radius: function (t) { return 1 - 0.36 * sm(fs, 1, t); } });
        // (a bolt toward the front and one behind, clear of the arms: smooth even bands read as a radiator, the photograph's ribs are hardware)
        if (!low) [0.42 + 0.08 * (r % 2), 1.3 + 0.06 * (r % 3)].forEach(function (q) { var p = pts[Math.round(Math.min(q * fs, 0.92) * NP)], o = v(p.x, 0, p.z - (back + front) / 2).normalize(); bolt(p.clone().addScaledVector(o, 0.005), o, 0.0058, 'spine01'); });
      });
      ySide -= 0.03 + 0.006 * r;
    }
    // the sternum: a short column of blocks under the Y plate's stem where the upper ribs meet, the last one the
    // xiphoid over the open arch
    var stZ = 0.122;
    for (var sy = chestTop - 0.05; sy > chestTop - 0.118; sy -= 0.032) K.box(v(0, sy, stZ + 0.004 * (chestTop - sy) / 0.2), [sy < chestTop - 0.1 ? 0.03 : 0.04, 0.026, 0.024], null, 'steel', 'spine01', EP, 0.3);
    // the Y plate over the chest, bent to it round both axes, its arms just under the shoulder pistons, its stem down
    // the sternum to the top of the arch, bolted on
    (function () {
      var sh = [[-0.026, -0.088], [0.026, -0.088], [0.028, -0.032], [0.078, 0.032], [0.09, 0.062], [0.056, 0.066], [0.0, 0.022], [-0.056, 0.066], [-0.09, 0.062], [-0.078, 0.032], [-0.028, -0.032]].map(function (q) { return [q[0] * kw, q[1]]; });
      var bend = function (x, y) { return -x * x * 2.2 - Math.pow(y + 0.05, 2) * 0.35; };
      var m = new THREE.Matrix4().makeRotationX(-0.06); m.setPosition(v(0, chestTop - 0.062, stZ + 0.014));
      K.add(K.plate('yplate', sh, 0.014, bend, 0.003, 0.018), m, 'worn', 'spine01', [0.25, 0.85, 0]);
      if (!low) [[0, -0.022], [0, -0.07], [-0.062, 0.046], [0.062, 0.046]].forEach(function (q) {
        var p = v(q[0] * kw, q[1], 0.014 + bend(q[0], q[1])).applyMatrix4(m), nrm = v(-q[0] * 4.4, -(q[1] + 0.05) * 0.7, 1).normalize().transformDirection(m);
        K.lathe(p.clone().addScaledVector(nrm, -0.002), p.clone().addScaledVector(nrm, 0.005), [[0, 0], [1, 0], [1, 0.5], [0.6, 1], [0, 1]], 0.008, 'chrome', 'spine01', EP, 12);
      });
    })();
    // the upper chest: banks of cylinders either side behind the Y's arms and under the shoulder pistons, barrels
    // standing either side of the neck (crowded, like the photograph), and the shoulder blades behind: bent plates
    // (open triangle frames there read as a grid from the chase camera)
    [1, -1].forEach(function (s) {
      canister(v(s * 0.034, chestTop - 0.008, 0.07), v(s * 0.14 * kw, chestTop - 0.008, 0.064), 0.025, 'steel', 'spine01');
      canister(v(s * 0.05, chestTop - 0.04, 0.094), v(s * 0.135 * kw, chestTop - 0.044, 0.084), 0.02, 'chrome', 'spine01');
      canister(v(s * 0.05, chestTop - 0.056, 0.03), v(s * 0.13 * kw, chestTop - 0.06, 0.025), 0.028, 'steel', 'spine01');
      canister(v(s * 0.052, chestTop - 0.02, -0.04), v(s * 0.052, chestTop + 0.05, -0.034), 0.018, 'chrome', 'spine01', 14);
      var sp = sidePlate('scapula', [[-0.052, 0.062], [0.05, 0.066], [0.058, 0.03], [0.034, -0.03], [0.0, -0.066], [-0.03, -0.058], [-0.056, -0.01]], 0.011, function (x, y) { return -x * x * 4 - y * y * 1.5; }, 0.003, 0.03, v(s * 0.1 * kw, chestTop - 0.05, -0.104), v(s * 0.32, 0.12, -1), s, 'worn', 'spine01', [0.25, 0.4, 0]);
      K.rod(sp.at(-0.044, 0.05).addScaledVector(sp.n, 0.006), sp.at(0.044, 0.054).addScaledVector(sp.n, 0.006), 0.007, 'chrome', 'spine01', ER, 10);
      if (!low) [[-0.03, -0.035], [0.03, 0.0]].forEach(function (q) { bolt(sp.at(q[0], q[1]), sp.n, 0.0075, 'spine01'); });
    });

    /* ---- the neck: a ringed column (half the skull's width) between rods, cables and hoses ---- */
    ['neck01', 'neck02', 'neck03'].forEach(function (n, i) {
      var a = H(n), b = T(n);
      K.lathe(a, b, [[0, 0], [0.85, 0], [0.85, 0.15], [1, 0.22], [1, 0.42], [0.85, 0.5], [0.85, 0.62], [1, 0.7], [1, 0.9], [0.85, 0.97], [0, 1]], (0.044 - i * 0.002) * g, i % 2 ? 'chrome' : 'steel', n, i % 2 ? EP : EI, 20, X);
    });
    var hd = H('head');
    K.lathe(hd.clone().add(v(0, -0.01, 0)), hd.clone().add(v(0, 0.035, -0.005)), [[0, 0], [0.8, 0], [1, 0.3], [1, 0.7], [0.7, 1], [0, 1]], 0.04, 'chrome', 'head', EP, 18);
    [1, -1].forEach(function (s) {
      // the rods straight down from under the outer cheekbones into the chest's works (curved in, they made a narrow
      // birdcage with the skull's own), a thinner cable inside each, and hoses at the back
      cable([v(s * 0.068, hd.y - 0.005, hd.z + 0.02), v(s * 0.0765, (hd.y + chestTop) / 2, (hd.z + 0.08) / 2), v(s * 0.085, chestTop - 0.008, 0.06)], 0.0062, [['head', 0], ['neck02', 0.45], ['spine01', 1]], 'chrome');
      if (!low) cable([v(s * 0.05, hd.y - 0.008, hd.z + 0.03), v(s * 0.054, (hd.y + chestTop) / 2, (hd.z + 0.105) / 2), v(s * 0.058, chestTop - 0.02, 0.075)], 0.004, [['head', 0], ['neck02', 0.5], ['spine01', 1]], 'steel');
      hose([v(s * 0.024, hd.y + 0.015, hd.z - 0.06), v(s * 0.026, hd.y - 0.05, -0.038), v(s * 0.03, chestTop + 0.025, -0.07)], 0.009, [['head', 0], ['neck02', 0.5], ['spine01', 1]], 16);
      cable([v(s * 0.052, chestTop + 0.04, -0.034), v(s * 0.05, (chestTop + hd.y) / 2 + 0.02, -0.03), v(s * 0.042, hd.y + 0.012, hd.z - 0.034)], 0.0075, [['spine01', 0.1], ['neck01', 0.35], ['neck03', 0.7], ['head', 0.95]], 'chrome', 16);
    });

    /* ---- the shoulders ---- */
    // shoulder01 stands at one angle in every captured clip (up from the rest pose: 36 degrees for the library male,
    // 44 for the female; the runtime passes the idle clip's as rig.shoulder), so the shoulder is drawn as it stands
    // there and turned back into the rest pose: the socket faces out round the ball and the long rod from the chest
    // ends at it, in every clip
    var rs = K.rig.shoulder, QS = (rs && rs.length === 4 ? new THREE.Quaternion(rs[0], rs[1], rs[2], rs[3]) : new THREE.Quaternion(0.02, -0.03, 0.307, 0.951)).normalize();
    // the housing across the base of the neck that both shoulder pistons come out of
    var nb = v(0, T('clavicle_L').y + 0.03, H('clavicle_L').z - 0.03);
    K.lathe(nb.clone().add(v(-0.04, 0, 0)), nb.clone().add(v(0.04, 0, 0)), [[0, 0], [0.8, 0], [1, 0.1], [1, 0.3], [0.9, 0.38], [0.9, 0.62], [1, 0.7], [1, 0.9], [0.8, 1], [0, 1]], 0.032 * g, 'steel', 'spine01', EI, 18, Y);
    [['L', 1], ['R', -1]].forEach(function (q) {
      var S = q[0], s = q[1], cl = H('clavicle_' + S), ct = T('clavicle_' + S), so = H('shoulder01_' + S), sj = H('upperarm01_' + S), sb = 'shoulder01_' + S, cb = 'clavicle_' + S;
      var qs = new THREE.Quaternion(QS.x, QS.y * s, QS.z * s, QS.w), qi = qs.clone().invert();
      function rest(p) { return p.clone().sub(so).applyQuaternion(qi).add(so); }
      function restD(d) { return d.clone().applyQuaternion(qi); }
      var sjP = sj.clone().sub(so).applyQuaternion(qs).add(so), out = v(s, 0, 0);   // the joint, where it stands in the clips
      var cupR = 0.07 * g, pole = sjP.clone().addScaledVector(out, -cupR);
      // the collarbone piston from the housing at the base of the neck, 3.3 cm over the clavicle and back behind the
      // chin's reach (the head pitches down to fight), sloping down to the socket, pinned there (on the clavicle, whose frame the socket keeps: only shoulder01 turns): a fat barrel by the
      // neck, a polished rod out to the shoulder
      var inner = v(s * 0.034, ct.y + 0.033, cl.z - 0.03), outer = pole.clone().add(v(-s * 0.004, -0.004, 0));
      K.lathe(inner, lerp(inner, outer, 0.55), [[0, 0], [0.8, 0], [1, 0.05], [1, 0.95], [0.6, 1], [0, 1]], 0.032 * g, 'chrome', cb, EP, 18);
      (low ? [0.3] : [0.14, 0.3, 0.46]).forEach(function (t) { K.ring(lerp(inner, outer, t), outer.clone().sub(inner), 0.033 * g, 0.005, 'steel', cb, EI, 18); });
      K.rod(lerp(inner, outer, 0.52), outer, 0.014, 'chrome', cb, ER, 14);
      K.lathe(lerp(inner, outer, 0.76), lerp(inner, outer, 0.85), [[0, 0], [1, 0], [1, 1], [0, 1]], 0.02, 'steel', cb, EI, 14);
      K.ball(outer, 0.019, 'chrome', cb, EP, 14);
      // the shoulder block; the socket, a deep cup over the inside of the big ball with a clevis for the rod
      strut(so, sj, 0.026 * g, sb, Z);
      K.lathe(rest(pole), rest(sjP.clone().addScaledVector(out, -0.018)), [[0, 0], [0.38, 0.1], [0.58, 0.25], [0.75, 0.45], [0.87, 0.67], [0.95, 0.88], [0.97, 1], [1.03, 1], [1.03, 1.08], [0.82, 1.1]], cupR, 'chrome', sb, EP, 26);
      K.box(rest(pole.clone().addScaledVector(out, -0.004)), [0.028, 0.042, 0.04], [restD(out), restD(Y), restD(Z)], 'steel', sb, EI, 0.3);
      // the cap: a big domed cover over the top and outside of the ball, set out past it and up (the shoulders end where
      // the person's deltoids do), a bolted rim round it
      var dn = v(s * 0.4, 1, 0).normalize(), cc = sjP.clone().addScaledVector(out, 0.01 * g), capA = cc.clone().addScaledVector(dn, 0.01 * g), capB = cc.clone().addScaledVector(dn, 0.078 * g);
      K.lathe(rest(capA), rest(capB), [[0.9, 0], [1, 0.06], [1, 0.16], [0.95, 0.34], [0.84, 0.56], [0.64, 0.78], [0.36, 0.94], [0, 1]], 0.066 * g, 'worn', sb, EW, 24);
      K.ring(rest(capA.clone().addScaledVector(dn, 0.006)), restD(dn), 0.0655 * g, 0.004, 'chrome', sb, EP, 24);
      K.ball(sj, 0.05 * g, 'chrome', 'upperarm01_' + S, EP, 22);
      // the trapezius: a piston from behind the neck out over the top of the cap, its barrel on the chest and its rod on
      // the clavicle, blended across the gland (the shoulder rides 3 to 8 cm higher or lower against the chest from one
      // clip to the next: rigid on either bone it stood off the cap or went into the neck), so the neck rises out of
      // mass from the front and the back instead of a coat hanger
      swingPiston(v(s * 0.056, H('neck02').y + 0.02, H('neck02').z - 0.09), cc.clone().addScaledVector(dn, 0.054 * g).addScaledVector(out, -0.03).add(v(0, 0, -0.008)), 0.028 * g, 0.013, 0.52, 'spine01', cb);
    });

    /* ---- the arms: a bundle round the humerus, a heavy elbow, twin rods and a piston to the wrist ---- */
    [['L', 1], ['R', -1]].forEach(function (q) {
      var S = q[0], s = q[1];
      var sj = H('upperarm01_' + S), u2 = H('upperarm02_' + S), el = H('lowerarm01_' + S), wr = H('wrist_' + S), ub = 'upperarm02_' + S, fb0 = 'lowerarm01_' + S;
      var up = el.clone().sub(sj).normalize(), fo = wr.clone().sub(el).normalize();
      var ax = new V().crossVectors(up, fo).normalize(); if (ax.x * s < 0) ax.negate();  // the elbow's hinge, pointing out
      var frontU = new V().crossVectors(ax, up).normalize(); if (frontU.z < 0) frontU.negate();
      function U(t, sa, fr) { return lerp(sj, el, t).addScaledVector(ax, sa).addScaledVector(frontU, fr); }
      // the humerus: a neck from the ball, the strut; a big cylinder down the front and outside from under the ball to
      // the elbow, a smaller one inside, a rod behind, and a clamp across them
      K.rod(sj, u2, 0.027 * g, 'chrome', 'upperarm01_' + S, EP, 16);
      strut(lerp(u2, el, 0.02), lerp(u2, el, 0.86), 0.023 * g, ub, frontU);
      piston(U(0.15, 0.026 * g, 0.026 * g), U(0.9, 0.02, 0.022), 0.029 * g, 0.013, 0.6, ub, ax);
      piston(U(0.22, -0.028 * g, 0.02 * g), U(0.88, -0.022, 0.016), 0.019 * g, 0.009, 0.55, ub, ax, 'steel');
      K.rod(U(0.24, 0.002, -0.036 * g), U(0.9, 0.002, -0.028), 0.012 * g, 'chrome', ub, ER, 12);
      [0.42, 0.7].forEach(function (t) { K.box(U(t, 0, -0.004), [0.07 * g, 0.014, 0.05 * g], [ax, up, frontU], 'steel', ub, EI, 0.4); });
      // the elbow: a fork on the humerus, the hinge (inside the bundle's own width), a knuckle behind on the forearm
      [1, -1].forEach(function (k) { K.box(U(0.93, k * 0.03, 0), [0.013, 0.07, 0.052], [ax, up, frontU], 'chrome', ub, EP, 0.35); });
      hinge(el, ax, 0.022 * g, 0.074, fb0, 0.03 * g);
      K.ball(el.clone().addScaledVector(fo, -0.024).addScaledVector(frontU, -0.014), 0.024 * g, 'worn', fb0, [0.22, 0.5, 0], 14);
      // the forearm: twin rods side by side along the hinge, a big piston along the top between them and a smaller
      // one under, a clamp round them, a housing at the wrist
      var fa = el.clone().addScaledVector(fo, 0.022), fb = wr.clone().addScaledVector(fo, -0.016);
      var frontF = new V().crossVectors(ax, fo).normalize(); if (frontF.y < 0) frontF.negate();
      function F(t, sa, fr) { return lerp(el, wr, t).addScaledVector(ax, sa).addScaledVector(frontF, fr); }
      [1, -1].forEach(function (k) { K.rod(fa.clone().addScaledVector(ax, k * 0.024 * g), fb.clone().addScaledVector(ax, k * 0.017), 0.0145 * g, 'chrome', fb0, EP, 14); });
      piston(F(0.12, 0, 0.026 * g), F(0.8, 0, 0.019), 0.021 * g, 0.0095, 0.55, fb0, ax);
      piston(F(0.16, 0, -0.023 * g), F(0.76, 0, -0.017), 0.015 * g, 0.0075, 0.5, fb0, ax, 'steel');
      K.box(F(0.5, 0, 0), [0.066 * g, 0.014, 0.02], [ax, fo, frontF], 'steel', fb0, EI, 0.4);
      K.ball(wr, 0.024, 'steel', 'wrist_' + S, EI, 14);
      K.lathe(fb.clone().addScaledVector(fo, -0.02), wr.clone().addScaledVector(fo, 0.004), [[0, 0], [0.9, 0], [1, 0.12], [1, 0.4], [0.92, 0.5], [1, 0.6], [1, 1], [0.6, 1], [0, 1]], 0.031 * g, 'chrome', fb0, EP, 18, ax);
      hand(S);
    });

    /* ---- the hands: big mechanical hands, a cupped palm, a plated back, five fingers of three joints ---- */
    function hand(S) {
      var wr = H('wrist_' + S), k2 = H('finger2-1_' + S), k3 = H('finger3-1_' + S), k5 = H('finger5-1_' + S);
      var f = k3.clone().sub(wr).normalize(), lat = k2.clone().sub(k5).normalize();
      var nrm = new V().crossVectors(f, lat).normalize();
      // the palm's side: where the thumb's tip lies
      if (T('finger1-3_' + S).sub(wr).dot(nrm) < 0) nrm.negate();
      var knuck = lerp(k2, k5, 0.5), latW = k2.distanceTo(k5) + 0.03, hl = wr.distanceTo(knuck);
      // the palm: one thick plate cupped toward the palm, short of the knuckles so a fist's fingers fold over it, and
      // a pad at the thumb's root
      // (both curved hard and satin: flat polished slabs there mirrored the backdrop as black)
      place(K.plate('palm', K.rrect(latW * 0.86, hl * 0.6, 0.012), 0.007, function (x, y) { return x * x * 13 + y * y * 3; }, 0.002, 0.02), lerp(wr, knuck, 0.47).addScaledVector(nrm, 0.006), lat, nrm, 'chrome', 'wrist_' + S, [0.3, 0, 0.12]);
      if (K.has('finger1-1_' + S)) K.box(lerp(wr, H('finger1-1_' + S), 0.75).addScaledVector(nrm, 0.009), [0.026, 0.034, 0.016], [lat, f, nrm], 'steel', 'wrist_' + S, EI, 0.4);
      // the back: a plate over the near half of the metacarpals, which come out from under it to the knuckles
      place(K.plate('dorsum', K.rrect(latW * 0.92, hl * 0.5, 0.012), 0.007, function (x, y) { return -x * x * 11 - y * y * 3; }, 0.002, 0.02), lerp(wr, knuck, 0.37).addScaledVector(nrm, -0.013), lat, nrm.clone().negate(), 'worn', 'wrist_' + S, [0.3, 0.5, 0.12]);
      [2, 3, 4, 5].forEach(function (j) { var kj = H('finger' + j + '-1_' + S); K.rod(lerp(wr, kj, 0.28).addScaledVector(nrm, -0.007), kj.clone().addScaledVector(f, -0.004).addScaledVector(nrm, -0.003), 0.0085, 'chrome', 'wrist_' + S, EP, 12); K.ball(kj.clone().addScaledVector(f, -0.004), 0.0098, 'steel', 'wrist_' + S, EI, 10); });
      K.rod(k2.clone().addScaledVector(lat, 0.01).addScaledVector(f, -0.016), k5.clone().addScaledVector(lat, -0.01).addScaledVector(f, -0.016), 0.0055, 'steel', 'wrist_' + S, EI, 10);
      [1, 2, 3, 4, 5].forEach(function (j) {
        for (var p = 1; p <= 3; p++) {
          var bn = 'finger' + j + '-' + p + '_' + S; if (!K.has(bn)) continue;
          var a = H(bn), b = T(bn), d = b.clone().sub(a).normalize(), L = a.distanceTo(b);
          var hax = j === 1 ? new V().crossVectors(d, nrm).normalize() : lat.clone().addScaledVector(d, -lat.dot(d)).normalize();
          var bk = nrm.clone().addScaledVector(d, -nrm.dot(d)).normalize().negate();  // the back of the finger
          var wdt = (j === 1 ? 0.0175 : 0.0165 - (j - 2) * 0.0007) * (p === 3 ? 0.9 : 1);
          // the phalanx: a bar, a knuckle housing across its root, a plate over its back, a tapered cap on the last
          // (rounded boxes end to end read as a string of pills)
          K.rod(a.clone().addScaledVector(d, wdt * 0.3), b.clone().addScaledVector(d, p === 3 ? -wdt * 0.7 : -wdt * 0.25), wdt * 0.34, 'chrome', bn, EP, 8);
          K.lathe(a.clone().addScaledVector(hax, -wdt * 0.55), a.clone().addScaledVector(hax, wdt * 0.55), [[0, 0], [0.8, 0], [1, 0.12], [1, 0.88], [0.8, 1], [0, 1]], wdt * 0.56, 'steel', bn, EI, 10, d);
          if (!low) K.box(lerp(a, b, 0.52).addScaledVector(bk, wdt * 0.42), [wdt, L * 0.62, wdt * 0.38], [hax, d, bk], p === 2 ? 'worn' : 'chrome', bn, p === 2 ? [0.22, 0.4, 0] : EP, 0.3);
          if (p === 3) K.lathe(b.clone().addScaledVector(d, -wdt * 0.95), b.clone().addScaledVector(d, 0.001), [[0, 0], [1, 0], [1, 0.4], [0.5, 0.9], [0, 1]], wdt * 0.47, 'chrome', bn, EP, 8);
        }
      });
    }

    /* ---- the legs: a bundle of big pistons round the femur, a domed knee, twin rods and a calf piston, big feet ---- */
    [['L', 1], ['R', -1]].forEach(function (q) {
      var S = q[0], s = q[1];
      var hj = H('upperleg01_' + S), u2 = H('upperleg02_' + S), kn = H('lowerleg01_' + S), an = H('foot_' + S), tb = 'upperleg02_' + S, sb = 'lowerleg01_' + S, fb = 'foot_' + S;
      var th = kn.clone().sub(u2).normalize(), sh = an.clone().sub(kn).normalize();
      // the knee bends about the line square to the shin, across the body (measured from the clips)
      var kax = new V(1, 0.24 * s, 0); kax.addScaledVector(sh, -kax.dot(sh)).normalize(); if (kax.x * s < 0) kax.negate();
      var frontT = new V().crossVectors(kax, th).normalize(); if (frontT.z < 0) frontT.negate();
      var frontS = new V().crossVectors(kax, sh).normalize(); if (frontS.z < 0) frontS.negate();
      function Tt(t, sa, fr) { return lerp(u2, kn, t).addScaledVector(kax, sa).addScaledVector(frontT, fr); }
      function Sx(t, sa, fr) { return lerp(kn, an, t).addScaledVector(kax, sa).addScaledVector(frontS, fr); }
      // the hip ball and the femoral neck; a collar where the thigh's own bone takes over
      K.ball(hj, 0.05 * g, 'chrome', 'upperleg01_' + S, EP, 22);
      K.rod(hj, u2, 0.036 * g, 'chrome', 'upperleg01_' + S, EP, 16);
      K.lathe(u2.clone().addScaledVector(th, -0.014), u2.clone().addScaledVector(th, 0.02), [[0, 0], [1, 0], [1, 0.15], [0.94, 0.3], [0.94, 0.7], [1, 0.85], [1, 1], [0, 1]], 0.054 * g, 'steel', tb, EI, 20);
      // the trochanter: a drum outside the socket at the hip joint's own height and on its axis, so it turns in place as
      // the leg swings (the thigh widest at its top, as the person's is, not a stalk hung under the ball)
      var tro = v(s, 0, 0);
      K.lathe(hj.clone().addScaledVector(tro, 0.056), hj.clone().addScaledVector(tro, 0.086), [[0, 0], [0.9, 0], [1, 0.1], [1, 0.55], [0.93, 0.7], [0.66, 0.92], [0, 1]], 0.055 * g, 'chrome', 'upperleg01_' + S, EP, 24);
      K.ring(hj.clone().addScaledVector(tro, 0.06), tro, 0.055 * g, 0.004, 'steel', 'upperleg01_' + S, EI, 24);
      if (!low) K.lathe(hj.clone().addScaledVector(tro, 0.082), hj.clone().addScaledVector(tro, 0.094), [[0, 0], [1, 0], [1, 0.5], [0.7, 1], [0, 1]], 0.02, 'steel', 'upperleg01_' + S, EI, 14);
      // the femur: a heavy strut and a bundle of pistons round it, their tops up under the hip (18% of the thigh above
      // its bone's own top) and spread wide there, drawn in toward the knee; the inside one turned the other way, its
      // barrel at the knee, so the bundle is full all the way down; two clamps (the person's thigh, but for dark gaps
      // between them)
      strut(u2, lerp(u2, kn, 0.9), 0.03 * g, tb, frontT);
      piston(Tt(-0.08, 0.012, 0.056 * g), Tt(0.8, 0.004, 0.042), 0.035 * g, 0.016, 0.6, tb, kax);
      piston(Tt(-0.14, 0, -0.062 * g), Tt(0.84, 0, -0.044), 0.032 * g, 0.014, 0.56, tb, kax, 'steel');
      piston(Tt(-0.18, 0.075 * g, 0.0), Tt(0.84, 0.046, 0), 0.03 * g, 0.015, 0.66, tb, frontT);
      piston(Tt(0.86, -0.044, 0.004), Tt(0.04, -0.056 * g, 0.004), 0.025 * g, 0.012, 0.56, tb, frontT, 'steel');
      [0.36, 0.68].forEach(function (t) { K.box(Tt(t, 0.004, 0), [0.112 * g, 0.016, 0.076 * g], [kax, th, frontT], 'steel', tb, EI, 0.4); });
      // the knee: a fork on the femur, the hinge with big domed caps, and a big domed cap in front reaching up over the
      // femur's end, so it reads as one heavy joint (small, the knee was four separate bits)
      [1, -1].forEach(function (k) { K.box(Tt(0.955, k * 0.046, 0), [0.016, 0.09, 0.066], [kax, th, frontT], 'chrome', tb, EP, 0.35); });
      hinge(kn, kax, 0.032 * g, 0.104, sb, 0.05 * g);
      var kc = kn.clone().addScaledVector(frontS, 0.042).addScaledVector(sh, -0.008);
      K.lathe(kc, kc.clone().addScaledVector(frontS, 0.024), [[0, 0], [1, 0], [1, 0.12], [0.93, 0.4], [0.77, 0.68], [0.5, 0.9], [0, 1]], 0.055 * g, 'worn', sb, [0.2, 0.5, 0], 26);
      K.ring(kc.clone().addScaledVector(frontS, 0.004), frontS, 0.054 * g, 0.004, 'chrome', sb, EP, 24);
      // the shin: twin rods along the hinge line, a big piston behind for the calf, a smaller one outside and one down
      // the front, clamps (a flat guard there mirrored the snow as a strip light, the room as a black phone screen)
      var sa = kn.clone().addScaledVector(sh, 0.032), sb2 = an.clone().addScaledVector(sh, -0.024);
      [1, -1].forEach(function (k) { K.rod(sa.clone().addScaledVector(kax, k * 0.03 * g), sb2.clone().addScaledVector(kax, k * 0.021), 0.018 * g, 'chrome', sb, EP, 16); });
      piston(Sx(0.1, 0, -0.05 * g), Sx(0.8, 0, -0.033), 0.032 * g, 0.015, 0.55, sb, kax);
      piston(Sx(0.14, 0.05 * g, -0.008), Sx(0.76, 0.043, -0.006), 0.019 * g, 0.009, 0.5, sb, frontS, 'steel');
      piston(Sx(0.16, 0, 0.032), Sx(0.82, 0, 0.026), 0.022 * g, 0.0105, 0.5, sb, kax, 'steel');
      [0.28, 0.66].forEach(function (t) { K.box(Sx(t, 0, -0.008), [0.094 * g, 0.014, 0.05], [kax, sh, frontS], 'steel', sb, EI, 0.4); });
      // the ankle: a heavy housing round the shin's foot, the hinge; the foot: a heel with a plate round it, a frame to
      // the ball of the foot, four plated toes
      K.lathe(sb2.clone().addScaledVector(sh, -0.014), an.clone().addScaledVector(sh, -0.004), [[0, 0], [0.8, 0], [1, 0.15], [1, 0.45], [0.9, 0.55], [1, 0.65], [1, 1], [0, 1]], 0.037 * g, 'chrome', sb, EP, 18);
      hinge(an, X, 0.024, 0.094, fb, 0.03);
      var fz = an.z, fx = an.x;
      K.box(v(fx, 0.034, fz - 0.032), [0.088, 0.058, 0.088], null, 'chrome', fb, EP, 0.3);
      place(K.plate('heel', K.rrect(0.086, 0.05, 0.014), 0.007, function (x) { return -x * x * 8; }, 0.0015, 0.04), v(fx, 0.036, fz - 0.078), X, v(0, 0.15, -1), 'worn', fb, [0.22, 0.5, 0]);
      K.box(v(fx, 0.012, fz - 0.03), [0.09, 0.024, 0.1], null, 'rubber', fb, [0.2, 0, 0], 0.25);
      K.box(v(fx + s * 0.004, 0.037, fz + 0.062), [0.096, 0.034, 0.124], [X, v(0, 1, 0.25), v(0, -0.25, 1)], 'steel', fb, EI, 0.3);
      K.rod(v(fx - 0.052, 0.022, fz + 0.116), v(fx + 0.054, 0.022, fz + 0.116), 0.0075, 'steel', fb, EI, 10);
      // (the toes reach as far as the person's own, 0.2 in front of the ankle; the rig has no toe bone, so they are
      // rigid on the foot; the big toe is on the inside)
      [[-0.036, 0.025], [-0.012, 0.02], [0.011, 0.019], [0.033, 0.018]].forEach(function (t, i) {
        var x = fx + s * t[0], w = t[1];
        K.rod(v(fx + s * t[0] * 0.5, an.y - 0.02, fz + 0.01), v(x, 0.028, fz + 0.118), 0.0072, 'chrome', fb, EP, 10);
        K.box(v(x, 0.019, fz + 0.137), [w, 0.018, 0.035], [X, v(0, 1, 0.05), v(0, -0.05, 1)], i === 0 ? 'worn' : 'chrome', fb, i === 0 ? [0.22, 0.5, 0] : EP, 0.25);
        K.rod(v(x - w * 0.55, 0.016, fz + 0.157), v(x + w * 0.55, 0.016, fz + 0.157), 0.0062, 'steel', fb, EI, 10);
        K.box(v(x, 0.015, fz + 0.172), [w * 0.92, 0.015, 0.026], [X, v(0, 1, 0.15), v(0, -0.15, 1)], 'chrome', fb, EP, 0.25);
        K.lathe(v(x, 0.013, fz + 0.183), v(x, 0.0095, fz + 0.2), [[0, 0], [1, 0], [1, 0.35], [0.7, 0.75], [0, 1]], w * 0.46, 'chrome', fb, EP, 12, X);
      });
    });
  }

  function make(THREE, rig, o) {
    o = o || {};
    var t0 = (typeof performance !== 'undefined' ? performance : Date).now();
    var K = Kit(THREE, rig, !!o.low);
    var t1 = (typeof performance !== 'undefined' ? performance : Date).now();
    // (low: a coarser skull too, where the head can make one)
    var hd = addHead(K, { detail: o.low ? 0.4 : 0.85 }, rig) || {};
    var t2 = (typeof performance !== 'undefined' ? performance : Date).now();
    buildBody(K, o);
    var out = K.merge();
    out.ms = (typeof performance !== 'undefined' ? performance : Date).now() - t0; out.headMs = t2 - t1;
    // the optics' centres in mesh space, and the size of the glow the head gave them
    out.eyes = hd.eyes || []; out.eyeSize = hd.eyeSize || 0.03;
    return out;
  }

  /* ------------------------------------------------------ the finishes -- */
  // grime in the crevices, smudges in the polish and rust spots, from the rest position (the endo attribute: x the
  // grime, y how rusty the part may be, z a nudge to its roughness)
  var GLSL_NOISE = [
    'varying vec3 vEndo; varying vec3 vEndoP;',
    'float endoH( vec3 p ) { return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }',
    'float endoN( vec3 p ) { vec3 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );',
    '  return mix( mix( mix( endoH( i ), endoH( i + vec3( 1, 0, 0 ) ), f.x ), mix( endoH( i + vec3( 0, 1, 0 ) ), endoH( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),',
    '             mix( mix( endoH( i + vec3( 0, 0, 1 ) ), endoH( i + vec3( 1, 0, 1 ) ), f.x ), mix( endoH( i + vec3( 0, 1, 1 ) ), endoH( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z ); }',
    'float endoF( vec3 p ) { return 0.5 * endoN( p ) + 0.25 * endoN( p * 2.03 + 1.7 ) + 0.125 * endoN( p * 4.1 + 3.1 ); }',
  ].join('\n');
  // rimC (o.rimColor, opt-in): the rim in a colour of its own, a light on the edges rather than the metal's own colour,
  // so the outline reads on bright snow and a dark deck alike; it fades where the part is grimy or rusted (a dirty
  // edge does not shine). Without it the shader is exactly the one before.
  function finish(mat, rough, rim, rimC) {
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.endoRim = { value: rim };
      if (rimC) sh.uniforms.endoRimC = { value: rimC };
      sh.vertexShader = 'attribute vec3 endo; varying vec3 vEndo; varying vec3 vEndoP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vEndo = endo; vEndoP = position;');
      sh.fragmentShader = 'uniform float endoRim;\n' + (rimC ? 'uniform vec3 endoRimC;\n' : '') + GLSL_NOISE + '\n' + sh.fragmentShader
        .replace('#include <color_fragment>', [
          '#include <color_fragment>',
          'float eN1 = endoF( vEndoP * 16.0 ), eN2 = endoF( vEndoP * 61.0 + 5.3 );',
          'float eGrime = clamp( vEndo.x * ( 0.35 + 1.1 * eN1 ) + 0.18 * smoothstep( 0.62, 0.8, eN2 ) * vEndo.x, 0.0, 1.0 );',
          // rust in patches a few centimetres across that run down the part (the noise stretched upright), and pits
          'float eRust = vEndo.y * clamp( smoothstep( 0.56, 0.6, endoF( vEndoP * vec3( 22.0, 6.0, 22.0 ) + 9.1 ) + 0.2 * ( eN2 - 0.5 ) ) + 0.35 * smoothstep( 0.8, 0.84, endoF( vEndoP * 140.0 ) ), 0.0, 1.0 );',
          // (grime tints toward a warm brown as it darkens, the photograph's grimy nickel, not grey)
          'diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.2, 0.15, 0.1 ) * ( 0.75 + 0.5 * eN2 ), 0.7 * eGrime );',
          // (a dark umber stain, as on the photograph's plates, not orange)
          'diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.075, 0.032, 0.014 ) * ( 0.7 + 0.6 * eN2 ), eRust );',
        ].join('\n'))
        // (dirty chrome is still a metal and still nearly a mirror: grime darkens it and dulls it a little; rust is a dark
        // brown stain in the polish, a little duller: rough or dielectric, it averaged the room and lit up pale beside the
        // mirror round it)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp( roughnessFactor + ( vEndo.z - 0.5 ) * 0.5 + ( eN1 - 0.5 ) * ' + rough.toFixed(3) + ' + eGrime * 0.12 + eRust * 0.14, 0.04, 1.0 );')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - 0.2 * eRust;')
        // a faint rim of its own colour where the surface turns away, so its outline still reads against a dark sky
        // (vViewPosition points from the surface to the eye)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += endoRim * ' + (rimC ? 'endoRimC * clamp( 1.0 - 0.6 * eGrime - 0.8 * eRust, 0.0, 1.0 )' : 'diffuseColor.rgb') + ' * pow( 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) ), 4.0 );');
    };
    mat.customProgramCacheKey = function () { return 'gm-endo-' + rough.toFixed(3) + (rimC ? '-rimc' : ''); };
    return mat;
  }
  function isHex(h) { return typeof h === 'string' && /^#[0-9a-fA-F]{6}$/.test(h); }
  function materials(THREE, o) {
    o = o || {};
    // (a warm nickel, the photograph's: averaged over its chest it is red/blue 1.3, the render's cool chrome was 1.0)
    var metal = new THREE.Color(isHex(o.metal) ? o.metal : '#D3C6AF'), eyeC = new THREE.Color(isHex(o.eyes) ? o.eyes : '#FF2A12');
    var glow = clamp(o.glow == null ? 1 : Number(o.glow) || 0, 0, 4), rim = clamp(o.rim == null ? 0.12 : Number(o.rim) || 0, 0, 1);
    // (o.rimColor: the rim's own colour, a cool light on the edges; the works inside take a little less of it)
    var rimC = isHex(o.rimColor) ? new THREE.Color(o.rimColor) : null;
    // (vertex colours: a head may bring its own grime; the body's own parts are white there)
    // (satin rather than a mirror, and the works dirty nickel rather than black: at 0.07 the chrome showed the dark room
    // as black and every lamp as a white streak, and bloomed the bright strips to white)
    var chrome = finish(new THREE.MeshPhysicalMaterial({ color: metal, metalness: 1, roughness: 0.13, vertexColors: true }), 0.08, rim, rimC);
    var steel = finish(new THREE.MeshPhysicalMaterial({ color: metal.clone().multiplyScalar(0.6), metalness: 1, roughness: 0.28, vertexColors: true }), 0.18, rim, rimC && rimC.clone().multiplyScalar(0.7));
    var rubber = new THREE.MeshPhysicalMaterial({ color: '#111112', metalness: 0, roughness: 0.55, clearcoat: 0.2, clearcoatRoughness: 0.5 });
    var teeth = new THREE.MeshPhysicalMaterial({ color: '#D8CDB0', metalness: 0, roughness: 0.38, clearcoat: 0.4, clearcoatRoughness: 0.25, vertexColors: true });
    // the optics: past white so bloom catches them (graphics on); without it they are plain, full red
    var eye = new THREE.MeshBasicMaterial({ color: eyeC.clone().multiplyScalar(1 + 5 * glow), toneMapped: false, vertexColors: true });
    var dark = new THREE.MeshStandardMaterial({ color: '#0B0B0C', metalness: 0.6, roughness: 0.55 });
    [chrome, steel].forEach(function (m) { m.userData.gmLive = true; });
    return [chrome, steel, rubber, teeth, eye, dark];
  }

  return { make: make, materials: materials, head: buildEndoHead };
})();
