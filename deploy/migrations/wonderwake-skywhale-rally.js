var T = THREE;
var G = {};
var MAT = null;
var SG = {};
var W = { ph: 0, target: 0, laps: 0, init: false };
var _m4 = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _v = new T.Vector3(), _s = new T.Vector3();

function initG() {
  if (G.sph) return;
  G.sph = new T.SphereGeometry(1, 14, 10);
  G.cyl = new T.CylinderGeometry(1, 1, 1, 14);
  G.cone = new T.ConeGeometry(1, 1, 12);
  G.box = new T.BoxGeometry(1, 1, 1);
  G.tor = new T.TorusGeometry(1, 0.3, 10, 22);
  G.ring = new T.TorusGeometry(1, 0.09, 6, 26);
  G.arc = new T.TorusGeometry(1, 0.1, 6, 14, Math.PI);
}
function mats() {
  if (MAT) return MAT;
  MAT = {
    paint: new T.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08 }),
    trim: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.55 }),
    matte: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.02, side: T.DoubleSide }),
    fur: new T.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.9, sheen: 1, sheenRoughness: 0.6, sheenColor: new T.Color('#FFE8D0') }),
    wheel: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 })
  };
  return MAT;
}
function put(list, g, col, x, y, z, sx, sy, sz, rx, ry, rz) {
  var a = sx == null ? 1 : sx, b = sy == null ? a : sy, c = sz == null ? a : sz;
  _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e);
  _m4.compose(_v.set(x, y, z), _q, _s.set(a, b, c));
  list.push({ g: g, m: _m4.clone(), c: new T.Color(col) });
}
function limb(list, a, b, r, col) {
  var d = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length(); d.normalize();
  var q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d);
  var m = new T.Matrix4().compose(new T.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new T.Vector3(r, len, r));
  list.push({ g: G.cyl, m: m, c: new T.Color(col) });
  put(list, G.sph, col, a[0], a[1], a[2], r); put(list, G.sph, col, b[0], b[1], b[2], r);
}
function merge(list) {
  var n = 0, ni = 0, i;
  for (i = 0; i < list.length; i++) { n += list[i].g.attributes.position.count; ni += list[i].g.index.count; }
  var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), idx = new Uint32Array(ni);
  var o = 0, oi = 0, v = new T.Vector3(), nm = new T.Matrix3();
  list.forEach(function (p) {
    var g = p.g, pa = g.attributes.position, na = g.attributes.normal; nm.getNormalMatrix(p.m);
    for (var j = 0; j < pa.count; j++) {
      v.fromBufferAttribute(pa, j).applyMatrix4(p.m); var k = (o + j) * 3; pos[k] = v.x; pos[k + 1] = v.y; pos[k + 2] = v.z;
      v.fromBufferAttribute(na, j).applyMatrix3(nm).normalize(); nor[k] = v.x; nor[k + 1] = v.y; nor[k + 2] = v.z;
      col[k] = p.c.r; col[k + 1] = p.c.g; col[k + 2] = p.c.b;
    }
    for (var q = 0; q < g.index.count; q++) idx[oi + q] = g.index.getX(q) + o;
    o += pa.count; oi += g.index.count;
  });
  var geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.BufferAttribute(nor, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
  geo.setIndex(new T.BufferAttribute(idx, 1)); geo.computeBoundingSphere(); return geo;
}

var SP = {
  pip: { name: 'Pip', fur: '#C65A2C', light: '#F6E8D2', dark: '#3F1D14', jacket: '#E5604A', jacketB: '#F2E4C8', glove: '#4A2218', paint: '#F2E6CE', accent: '#E2573F', rim: '#F2E6CE', ear: 'tri', snout: 'short', cheek: true, tail: 'ring', tc: ['#C65A2C', '#6A2E20'], scarf: '#2BA6A6', acc: 'goggles', scale: 1, stats: { top: 1, accel: 1, handling: 1.02, mass: 1, drift: 1.03 } },
  tula: { name: 'Tula', fur: '#A9814F', light: '#D2B58A', dark: '#4A3220', jacket: '#F2C230', jacketB: '#FFF3D0', glove: '#4A3220', paint: '#2FB3A8', accent: '#F2C230', rim: '#FFF3D0', ear: 'round', snout: 'blunt', tail: 'none', acc: 'flower', scale: 1.05, stats: { top: 0.99, accel: 0.97, handling: 1, mass: 1.15, drift: 1 } },
  miso: { name: 'Miso', fur: '#6B4A33', light: '#E3CDAA', dark: '#2E1E14', jacket: '#2E9CB5', jacketB: '#F4F1EA', glove: '#2E1E14', paint: '#2E9CB5', accent: '#F4F1EA', rim: '#F4F1EA', ear: 'round', snout: 'short', cheek: true, tail: 'otter', acc: 'band', bandc: '#F4F1EA', scale: 1, stats: { top: 1, accel: 1, handling: 1.05, mass: 1, drift: 1 } },
  pebble: { name: 'Pebble', fur: '#23262E', light: '#F4F6F8', dark: '#14161A', jacket: '#5BB8E8', jacketB: '#FFFFFF', glove: '#23262E', paint: '#4C86E0', accent: '#FFFFFF', rim: '#FFFFFF', ear: 'none', snout: 'beak', tail: 'none', acc: 'band', bandc: '#FF8A3D', scale: 0.88, stats: { top: 0.97, accel: 1.12, handling: 1.04, mass: 0.85, drift: 1 } },
  juniper: { name: 'Juniper', fur: '#D9D2C6', light: '#FFFFFF', dark: '#4A3A44', jacket: '#9A6FD6', jacketB: '#F5E9FF', glove: '#7A5AA8', paint: '#B58BEA', accent: '#FF9CC4', rim: '#F5E9FF', ear: 'long', snout: 'short', tail: 'pom', pomc: '#FFFFFF', acc: 'band', bandc: '#FF9CC4', scale: 1, stats: { top: 1.03, accel: 1, handling: 0.98, mass: 0.9, drift: 1 } },
  sol: { name: 'Sol', fur: '#8FA866', light: '#D6DDA8', dark: '#3B4A22', jacket: '#D9A441', jacketB: '#FFF1CC', glove: '#6E8B3D', paint: '#C98A35', accent: '#4E7C4A', rim: '#FFF1CC', ear: 'none', snout: 'blunt', tail: 'none', shell: true, acc: 'band', bandc: '#4E7C4A', scale: 1, stats: { top: 1, accel: 0.9, handling: 1, mass: 1.3, drift: 1.1 } },
  bramble: { name: 'Bramble', fur: '#7A4B2E', light: '#D2B08A', dark: '#3A2214', jacket: '#3C8A5A', jacketB: '#F2E4C8', glove: '#3A2214', paint: '#2F7A55', accent: '#E9C25A', rim: '#F2E4C8', ear: 'round', snout: 'short', tail: 'pom', pomc: '#7A4B2E', acc: 'band', bandc: '#E9C25A', scale: 1.14, stats: { top: 1.02, accel: 0.9, handling: 0.94, mass: 1.35, drift: 1 } },
  lumi: { name: 'Lumi', fur: '#E8832B', light: '#FFF1DE', dark: '#4A2A1A', jacket: '#3B4AA8', jacketB: '#FFE9B8', glove: '#4A2A1A', paint: '#3B4AA8', accent: '#E9B84A', rim: '#FFE9B8', ear: 'fox', snout: 'long', cheek: true, tail: 'fox', acc: 'band', bandc: '#E9B84A', scale: 1, stats: { top: 1, accel: 1, handling: 1, mass: 1, drift: 1.08 } }
};
var ORDER = ['pip', 'tula', 'miso', 'pebble', 'juniper', 'sol', 'bramble', 'lumi'];

function headParts(H, sp) {
  var f = sp.fur, lt = sp.light, dk = sp.dark, s, i;
  put(H, G.sph, f, 0, 0, 0, 0.3, 0.27, 0.27);
  if (sp.cheek) for (s = -1; s <= 1; s += 2) put(H, G.sph, lt, s * 0.2, -0.07, 0.07, 0.13, 0.11, 0.12);
  var mz = 0, my = -0.11;
  if (sp.snout === 'beak') { put(H, G.cone, '#F29A2E', 0, -0.04, 0.32, 0.07, 0.2, 0.06, Math.PI / 2); put(H, G.sph, lt, 0, 0.02, 0.2, 0.2, 0.19, 0.1); }
  else if (sp.snout === 'long') { put(H, G.sph, lt, 0, -0.06, 0.3, 0.1, 0.09, 0.17); put(H, G.sph, dk, 0, -0.04, 0.46, 0.04); mz = 0.44; }
  else if (sp.snout === 'blunt') { put(H, G.sph, sp.light, 0, -0.05, 0.28, 0.17, 0.14, 0.14); put(H, G.sph, dk, -0.05, 0.0, 0.41, 0.025); put(H, G.sph, dk, 0.05, 0.0, 0.41, 0.025); mz = 0.4; }
  else { put(H, G.sph, lt, 0, -0.07, 0.25, 0.13, 0.1, 0.11); put(H, G.sph, dk, 0, -0.04, 0.35, 0.04, 0.03, 0.03); mz = 0.335; }
  if (mz) put(H, G.arc, '#3A1E18', 0, my, mz, 0.055, 0.04, 0.03, 0, 0, Math.PI);
  for (s = -1; s <= 1; s += 2) {
    put(H, G.sph, '#FFFFFF', s * 0.12, 0.07, 0.225, 0.07, 0.08, 0.04);
    put(H, G.sph, '#6B3A1F', s * 0.122, 0.07, 0.25, 0.052, 0.06, 0.03);
    put(H, G.sph, '#150C0A', s * 0.122, 0.07, 0.265, 0.034, 0.042, 0.02);
    put(H, G.sph, '#FFFFFF', s * 0.112, 0.1, 0.282, 0.016);
    if (sp.acc === 'goggles') { put(H, G.sph, lt, s * 0.12, 0.155, 0.215, 0.06, 0.022, 0.03, 0, 0, -s * 0.3); put(H, G.sph, dk, s * 0.085, -0.02, 0.255, 0.012, 0.05, 0.02); }
    if (sp.ear === 'tri') { put(H, G.cone, f, s * 0.2, 0.2, -0.02, 0.11, 0.22, 0.08, 0, 0, -s * 0.5); put(H, G.cone, lt, s * 0.2, 0.19, 0.01, 0.075, 0.16, 0.05, 0, 0, -s * 0.5); }
    else if (sp.ear === 'round') { put(H, G.sph, f, s * 0.2, 0.22, -0.02, 0.09, 0.09, 0.05); put(H, G.sph, dk, s * 0.2, 0.22, 0.01, 0.055, 0.055, 0.03); }
    else if (sp.ear === 'long') { put(H, G.sph, f, s * 0.1, 0.42, -0.02, 0.07, 0.28, 0.04, 0, 0, -s * 0.2); put(H, G.sph, '#F4B6C8', s * 0.1, 0.42, 0.01, 0.04, 0.2, 0.025, 0, 0, -s * 0.2); }
    else if (sp.ear === 'fox') { put(H, G.cone, f, s * 0.17, 0.29, -0.02, 0.1, 0.3, 0.07, 0, 0, -s * 0.35); put(H, G.cone, lt, s * 0.17, 0.27, 0.01, 0.065, 0.2, 0.04, 0, 0, -s * 0.35); put(H, G.cone, dk, s * 0.2, 0.4, -0.02, 0.04, 0.1, 0.03, 0, 0, -s * 0.35); }
  }
  if (sp.acc === 'goggles') {
    put(H, G.ring, '#5A3820', 0, 0.15, 0, 0.275, 0.275, 0.275, Math.PI / 2);
    for (s = -1; s <= 1; s += 2) { put(H, G.tor, '#C79A45', s * 0.1, 0.19, 0.2, 0.065, 0.065, 0.065, -0.5); put(H, G.cyl, '#2F8F9C', s * 0.1, 0.19, 0.205, 0.07, 0.012, 0.07, Math.PI / 2 - 0.5); }
  } else if (sp.acc === 'band') put(H, G.ring, sp.bandc, 0, 0.12, 0, 0.268, 0.268, 0.268, Math.PI / 2);
  else if (sp.acc === 'flower') { put(H, G.sph, '#FF9CC4', 0.17, 0.25, 0.1, 0.07); put(H, G.sph, '#FFE070', 0.17, 0.26, 0.15, 0.035); put(H, G.sph, '#FF9CC4', 0.13, 0.27, 0.07, 0.05); }
}
function bodyParts(B, sp) {
  var s;
  put(B, G.sph, sp.jacket, 0, 0.27, 0, 0.33, 0.36, 0.29);
  put(B, G.sph, sp.jacketB, 0, 0.25, 0.2, 0.2, 0.24, 0.12);
  put(B, G.sph, sp.fur, 0, 0.56, 0.0, 0.16, 0.12, 0.16);
  put(B, G.box, '#C79A45', 0, 0.1, 0.27, 0.07, 0.05, 0.02);
  if (sp.scarf) { put(B, G.tor, sp.scarf, 0, 0.54, 0.03, 0.2, 0.2, 0.2, Math.PI / 2); put(B, G.sph, sp.scarf, -0.12, 0.42, 0.2, 0.08, 0.12, 0.04, 0, 0, 0.5); put(B, G.sph, sp.scarf, -0.28, 0.4, -0.26, 0.07, 0.07, 0.3, 0.3, 0.4, 0); }
  else put(B, G.tor, sp.jacketB, 0, 0.53, 0.03, 0.2, 0.2, 0.2, Math.PI / 2);
  if (sp.shell) { put(B, G.sph, '#6E8B3D', 0, 0.4, -0.24, 0.42, 0.34, 0.42); put(B, G.sph, '#A8B86A', 0, 0.7, -0.24, 0.16, 0.06, 0.16); put(B, G.sph, '#A8B86A', 0.22, 0.6, -0.38, 0.14, 0.06, 0.14); put(B, G.sph, '#A8B86A', -0.22, 0.6, -0.38, 0.14, 0.06, 0.14); }
  for (s = -1; s <= 1; s += 2) {
    limb(B, [s * 0.3, 0.42, 0], [s * 0.36, 0.3, 0.2], 0.09, sp.jacket);
    limb(B, [s * 0.36, 0.3, 0.2], [s * 0.15, 0.31, 0.4], 0.08, sp.jacket);
    put(B, G.sph, sp.glove, s * 0.14, 0.31, 0.42, 0.08);
    limb(B, [s * 0.14, 0.1, 0.04], [s * 0.14, -0.02, 0.55], 0.1, sp.jacketB);
    put(B, G.sph, '#B9503C', s * 0.14, -0.03, 0.6, 0.1, 0.07, 0.14);
  }
}
function tailParts(Tl, sp) {
  var i, t;
  if (sp.tail === 'ring') for (i = 0; i < 8; i++) { t = i / 7; put(Tl, G.sph, i % 2 ? sp.tc[1] : sp.tc[0], 0, 0.05 + t * 0.7, -0.2 - 0.45 * Math.sin(t * 1.3), 0.13 + 0.07 * Math.sin(Math.PI * t), 0.13 + 0.07 * Math.sin(Math.PI * t), 0.14 + 0.07 * Math.sin(Math.PI * t)); }
  else if (sp.tail === 'fox') for (i = 0; i < 7; i++) { t = i / 6; put(Tl, G.sph, i >= 5 ? sp.light : sp.fur, 0, 0.05 + t * 0.55, -0.2 - 0.5 * Math.sin(t * 1.2), 0.13 + 0.08 * Math.sin(Math.PI * t * 0.9), 0.13 + 0.08 * Math.sin(Math.PI * t * 0.9), 0.15 + 0.07 * Math.sin(Math.PI * t)); }
  else if (sp.tail === 'otter') for (i = 0; i < 6; i++) { t = i / 5; put(Tl, G.sph, sp.fur, 0, 0.08 + t * 0.2, -0.25 - t * 0.7, 0.12 - 0.07 * t, 0.1 - 0.05 * t, 0.16); }
  else if (sp.tail === 'pom') put(Tl, G.sph, sp.pomc, 0, 0.12, -0.3, 0.12);
}
function kartParts(P, X, sp) {
  var s, i;
  var prof = [[0.001, -1.05], [0.28, -0.98], [0.40, -0.7], [0.43, -0.2], [0.37, 0.4], [0.27, 0.85], [0.14, 1.12], [0.001, 1.2]].map(function (p) { return new T.Vector2(p[0], p[1]); });
  put(P, new T.LatheGeometry(prof, 24), sp.paint, 0, 0.42, 0, 0.9, 1, 0.55, Math.PI / 2);
  put(P, G.box, sp.accent, 0, 0.61, 0.45, 0.14, 0.03, 1.1);
  put(P, G.sph, sp.paint, 0, 0.38, 1.05, 0.25, 0.14, 0.22);
  put(P, G.box, sp.accent, 0, 0.92, -1.08, 1.0, 0.05, 0.3);
  for (s = -1; s <= 1; s += 2) {
    put(P, G.sph, sp.accent, s * 0.44, 0.36, 0.05, 0.14, 0.14, 0.7);
    put(P, G.sph, sp.paint, s * 0.55, 0.5, 0.82, 0.13, 0.05, 0.3);
    put(P, G.sph, sp.paint, s * 0.58, 0.58, -0.75, 0.16, 0.06, 0.34);
    put(P, G.box, sp.paint, s * 0.5, 0.88, -1.08, 0.04, 0.2, 0.34);
    put(X, G.cyl, '#C9A24A', s * 0.2, 0.38, -1.14, 0.055, 0.42, 0.055, Math.PI / 2);
    put(X, G.cyl, '#3A2A22', s * 0.2, 0.38, -1.35, 0.04, 0.05, 0.04, Math.PI / 2);
    limb(X, [s * 0.25, 0.42, 0.8], [s * 0.5, 0.27, 0.82], 0.025, '#9AA2AE');
    limb(X, [s * 0.4, 0.62, -0.72], [s * 0.53, 0.34, -0.75], 0.03, '#D8B25A');
    limb(X, [s * 0.2, 0.55, -0.95], [s * 0.2, 0.9, -1.08], 0.02, '#9AA2AE');
    put(X, G.sph, '#FFF2C2', s * 0.2, 0.45, 1.12, 0.07);
  }
  put(X, G.box, '#5A3A2A', 0, 0.6, -0.4, 0.52, 0.1, 0.5);
  put(X, G.box, '#5A3A2A', 0, 0.82, -0.66, 0.52, 0.42, 0.12, -0.25);
  put(X, G.cyl, '#D8B25A', 0, 0.3, 1.18, 0.025, 0.9, 0.025, 0, 0, Math.PI / 2);
  limb(X, [0, 0.5, 0.4], [0, 0.8, 0.22], 0.025, '#9AA2AE');
}
function wheelGeo(r, w, rim) {
  var Wl = [], S = r / 1.3;
  put(Wl, G.tor, '#201C1C', 0, 0, 0, S, S, w / 0.6, 0, Math.PI / 2, 0);
  put(Wl, G.cyl, rim, 0, 0, 0, r * 0.62, w * 0.8, r * 0.62, 0, 0, Math.PI / 2);
  put(Wl, G.cyl, '#D8B25A', 0, 0, 0, r * 0.28, w * 0.95, r * 0.28, 0, 0, Math.PI / 2);
  put(Wl, G.sph, '#D8B25A', w * 0.48, 0, 0, r * 0.2); put(Wl, G.sph, '#D8B25A', -w * 0.48, 0, 0, r * 0.2);
  for (var i = 0; i < 5; i++) { var a = i * 1.2566; put(Wl, G.box, '#BFB49C', 0, Math.sin(a) * r * 0.42, Math.cos(a) * r * 0.42, w * 0.7, r * 0.08, r * 0.08, a, 0, 0); }
  return merge(Wl);
}
function makeRacer(key) {
  initG(); var sp = SP[key], M = mats(), i;
  var root = new T.Group();
  var P = [], X = [];
  kartParts(P, X, sp);
  var kp = new T.Mesh(merge(P), M.paint), kx = new T.Mesh(merge(X), M.trim);
  kp.castShadow = true; root.add(kp, kx);
  var gf = wheelGeo(0.26, 0.2, sp.rim), gr = wheelGeo(0.3, 0.28, sp.rim);
  var wheels = [], steers = [];
  [[-1, 0.82, gf, 0.26, 0.55], [1, 0.82, gf, 0.26, 0.55], [-1, -0.75, gr, 0.3, 0.58], [1, -0.75, gr, 0.3, 0.58]].forEach(function (w) {
    var wg = new T.Group(); wg.position.set(w[0] * w[4], w[3], w[1]);
    var wm = new T.Mesh(w[2], M.wheel); wm.castShadow = true; wg.add(wm); root.add(wg); wheels.push(wm); if (w[1] > 0) steers.push(wg);
  });
  var SW = []; put(SW, G.tor, '#2A2424', 0, 0, 0, 0.17); put(SW, G.cyl, '#D8B25A', 0, 0, 0, 0.03, 0.04, 0.03, Math.PI / 2);
  put(SW, G.box, '#2A2424', 0, 0, 0, 0.3, 0.025, 0.025); put(SW, G.box, '#2A2424', 0, -0.08, 0, 0.025, 0.15, 0.025);
  var swT = new T.Group(); swT.position.set(0, 0.9, 0.2); swT.rotation.x = 1.0;
  var sw = new T.Mesh(merge(SW), M.trim); swT.add(sw); root.add(swT);
  var rider = new T.Group(); rider.position.set(0, 0.62, -0.2); rider.scale.setScalar(sp.scale); root.add(rider);
  var B = [], H = [], Tl = [];
  bodyParts(B, sp); headParts(H, sp); tailParts(Tl, sp);
  var torso = new T.Mesh(merge(B), M.fur); torso.castShadow = true; rider.add(torso);
  var head = new T.Mesh(merge(H), M.fur); head.position.set(0, 0.85, 0.05); head.castShadow = true; rider.add(head);
  var tail = null;
  if (Tl.length) { tail = new T.Mesh(merge(Tl), M.fur); tail.position.set(0, 0.22, -0.2); rider.add(tail); }
  var spin = 0, steer = 0, yaw = 0;
  root.userData.kartRacer = { stats: sp.stats };
  return {
    object: root, name: sp.name, color: sp.accent, stats: sp.stats,
    animate: function (t, dt, s) {
      var sp_ = s.speed || 0; spin += sp_ * dt / 0.28;
      for (var k = 0; k < wheels.length; k++) wheels[k].rotation.x = spin;
      steer += ((s.steer || 0) - steer) * Math.min(1, dt * 10);
      for (k = 0; k < steers.length; k++) steers[k].rotation.y = -steer * 0.42;
      sw.rotation.z = -steer * 1.3;
      var bob = Math.sin(t * 19) * 0.01 * Math.min(1, sp_ / 20);
      var jump = s.celebrate ? Math.abs(Math.sin(t * 9)) * 0.14 : 0;
      rider.position.y = 0.62 + bob + jump - (s.hit ? 0.03 : 0);
      rider.rotation.z = -steer * 0.1;
      var ty = s.back ? 2.3 : (s.gaze ? Math.max(-0.7, Math.min(0.7, s.gaze[0] * 0.6)) : -steer * 0.3);
      yaw += (ty - yaw) * Math.min(1, dt * 8);
      head.rotation.y = yaw; head.rotation.z = steer * 0.1 + (s.celebrate ? Math.sin(t * 9) * 0.12 : 0);
      head.rotation.x = s.hit ? -0.35 : (s.sad ? 0.3 : 0);
      if (tail) { tail.rotation.y = Math.sin(t * 4 + sp_ * 0.1) * 0.18; tail.rotation.x = -(s.boost ? 0.3 : 0); }
    }
  };
}
function specGeo(key) {
  if (SG[key]) return SG[key];
  initG(); var sp = SP[key], B = [], H = [], s;
  put(B, G.sph, sp.jacket, 0, 0.45, 0, 0.3, 0.38, 0.26);
  put(B, G.sph, sp.jacketB, 0, 0.42, 0.14, 0.18, 0.24, 0.1);
  headParts(H, sp);
  var sh = new T.Matrix4().makeTranslation(0, 1.0, 0);
  H.forEach(function (p) { p.m.premultiply(sh); B.push(p); });
  for (s = -1; s <= 1; s += 2) { limb(B, [s * 0.28, 0.65, 0], [s * 0.42, 1.0, 0.06], 0.07, sp.jacket); put(B, G.sph, sp.glove, s * 0.43, 1.05, 0.06, 0.08); }
  SG[key] = merge(B); return SG[key];
}
/* W7/V5 feasibility: a more faithful Pip built only from what a world may use (THREE r157 geometry: Sphere, Lathe,
   Extrude, Tube, Cone, Torus; vertex colours; the world's own merge pattern). Same three rider meshes as makeRacer
   (torso, head, tail), same materials, same animate(): draw calls unchanged. */
function mergeV(list) {
  var pos = [], nor = [], col = [], idx = [], o = 0, v = new T.Vector3(), nm = new T.Matrix3();
  list.forEach(function (p) {
    var g = p.g, pa = g.attributes.position, na = g.attributes.normal, ca = p.col; nm.getNormalMatrix(p.m);
    for (var j = 0; j < pa.count; j++) {
      v.fromBufferAttribute(pa, j).applyMatrix4(p.m); pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(na, j).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
      if (ca) col.push(ca[j * 3], ca[j * 3 + 1], ca[j * 3 + 2]); else col.push(p.c.r, p.c.g, p.c.b);
    }
    if (g.index) for (var q = 0; q < g.index.count; q++) idx.push(g.index.getX(q) + o);
    else for (q = 0; q < pa.count; q++) idx.push(q + o);
    o += pa.count;
  });
  var geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  geo.setIndex(idx); geo.computeBoundingSphere(); return geo;
}
function sst(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function putP(list, g, col, x, y, z, sx, sy, sz, rx, ry, rz) { put(list, g, '#FFFFFF', x, y, z, sx, sy, sz, rx, ry, rz); list[list.length - 1].col = col; }
// the cranium, painted by direction: rust fur, cream muzzle and cheeks, white brow spots, dark tear stripes
function pipCranium(sp) {
  var g = new T.SphereGeometry(1, 28, 20), pa = g.attributes.position, c = new Float32Array(pa.count * 3);
  var F = new T.Color(sp.fur), L = new T.Color(sp.light), Wt = new T.Color('#FFF8EE'), D = new T.Color('#6A2A1C'), k = new T.Color(), d = new T.Vector3();
  for (var j = 0; j < pa.count; j++) {
    d.fromBufferAttribute(pa, j).normalize(); var ax = Math.abs(d.x);
    k.copy(F);
    var cheek = sst(0.25, 0.55, ax) * sst(0.15, -0.25, d.y) * sst(-0.2, 0.3, d.z);          // the cream cheek ruff
    var muzzle = sst(0.55, 0.85, d.z) * sst(0.15, -0.1, d.y);                                 // the cream lower face
    var brow = sst(0.2, 0.09, Math.hypot(ax - 0.4, d.y - 0.36, d.z - 0.82));                 // white spots above the eyes
    var tear = sst(0.15, 0.06, Math.hypot(ax - 0.3, (d.y + 0.08) * 0.6, d.z - 0.9)) * sst(0.1, -0.05, d.y); // dark stripe under each eye
    k.lerp(L, Math.max(cheek, muzzle)); k.lerp(Wt, brow); k.lerp(D, tear * (1 - muzzle * 0.6));
    c[j * 3] = k.r; c[j * 3 + 1] = k.g; c[j * 3 + 2] = k.b;
  }
  return { g: g, c: c };
}
function earGeo(w, h) {
  var s = new T.Shape(); s.moveTo(-w / 2, 0); s.quadraticCurveTo(-w * 0.32, h * 0.7, -w * 0.06, h * 0.97); s.quadraticCurveTo(0, h * 1.04, w * 0.06, h * 0.97); s.quadraticCurveTo(w * 0.32, h * 0.7, w / 2, 0); s.quadraticCurveTo(0, -h * 0.12, -w / 2, 0);
  var g = new T.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.012, bevelSegments: 3, curveSegments: 10 });
  g.deleteAttribute('uv'); return g;
}
function pipHead(H, sp) {
  var cr = pipCranium(sp), s;
  putP(H, cr.g, cr.c, 0, 0, 0, 0.32, 0.27, 0.28);
  for (s = -1; s <= 1; s += 2) {                     // tufted cheek ruffs, pointing out and down
    put(H, G.sph, sp.light, s * 0.3, -0.08, 0.05, 0.1, 0.045, 0.075, 0, 0, -s * 0.45);
    put(H, G.sph, sp.light, s * 0.27, -0.15, 0.08, 0.085, 0.04, 0.065, 0, 0, -s * 0.8);
    put(H, G.sph, sp.fur, s * 0.31, 0.0, -0.01, 0.08, 0.04, 0.07, 0, 0, -s * 0.2);
  }
  // muzzle: a soft cream pad, a dark rounded nose, an asymmetric smile
  put(H, G.sph, sp.light, 0, -0.085, 0.21, 0.15, 0.1, 0.13);
  put(H, G.sph, '#24120E', 0, -0.035, 0.335, 0.05, 0.034, 0.032);
  put(H, G.sph, '#FFFFFF', 0.012, -0.022, 0.362, 0.01);
  put(H, G.box, '#3A1E18', 0, -0.085, 0.332, 0.006, 0.04, 0.006);
  put(H, G.arc, '#3A1E18', -0.03, -0.112, 0.318, 0.035, 0.022, 0.02, 0, -0.25, Math.PI);
  put(H, G.arc, '#3A1E18', 0.035, -0.105, 0.318, 0.04, 0.03, 0.02, 0, 0.25, Math.PI + 0.25);
  for (s = -1; s <= 1; s += 2) {
    // eyes: bigger, hazel, two catchlights
    put(H, G.sph, '#FFFDF8', s * 0.115, 0.045, 0.228, 0.074, 0.088, 0.045);
    put(H, G.sph, '#7A5426', s * 0.117, 0.04, 0.256, 0.058, 0.066, 0.028);
    put(H, G.sph, '#150C0A', s * 0.118, 0.04, 0.272, 0.033, 0.04, 0.018);
    put(H, G.sph, '#FFFFFF', s * 0.104, 0.07, 0.288, 0.016);
    put(H, G.sph, '#FFFFFF', s * 0.13, 0.018, 0.286, 0.007);
    // brows: dark, the right one raised (the asymmetric, adventurous look)
    limb(H, [s * 0.075, 0.16 + (s > 0 ? 0.012 : 0), 0.25], [s * 0.155, 0.168 + (s > 0 ? 0.022 : 0), 0.23], 0.009, '#3F1D14');
    // ears: rust back, white rim, dark inner fur
    var ear = earGeo(0.24, 0.24), ein = earGeo(0.17, 0.17), eda = earGeo(0.1, 0.11), rz = -s * 0.5, ry = s * 0.35;
    put(H, ear, sp.fur, s * 0.205, 0.17, -0.06, 1, 1, 1, -0.15, ry, rz);
    put(H, ein, '#FFF6EA', s * 0.2 + s * 0.012, 0.19, -0.02, 1, 1, 1, -0.15, ry, rz);
    put(H, eda, '#4A2018', s * 0.2 + s * 0.02, 0.205, -0.004, 1, 1, 1, -0.15, ry, rz);
    // goggles resting on the brow: hammered brass rims, teal lenses
    put(H, new T.TorusGeometry(1, 0.24, 10, 30), '#C9A04A', s * 0.1, 0.25, 0.15, 0.066, 0.066, 0.066, -1.0);
    put(H, G.cyl, '#3AA7B4', s * 0.1, 0.25, 0.153, 0.06, 0.02, 0.06, Math.PI / 2 - 1.0);
    put(H, G.sph, '#FFFFFF', s * 0.08, 0.27, 0.17, 0.011);
  }
  put(H, G.box, '#C9A04A', 0, 0.25, 0.165, 0.06, 0.02, 0.02, -1.0);
  put(H, new T.TorusGeometry(1, 0.08, 6, 40), '#5A3820', 0, 0.2, -0.03, 0.28, 0.28, 0.28, Math.PI / 2 - 0.35);
  // a groomed crown tuft
  for (s = -1; s <= 1; s++) put(H, G.cone, sp.fur, s * 0.05, 0.27, 0.06 - Math.abs(s) * 0.02, 0.04, 0.1, 0.04, 0.4, 0, -s * 0.4);
}
function pipBody(B, sp) {
  bodyParts(B, sp);
  var s;
  for (s = -1; s <= 1; s += 2) {
    put(B, G.sph, sp.jacketB, s * 0.24, 0.5, 0.0, 0.14, 0.08, 0.15, 0, 0, -s * 0.35);   // ivory shoulder panels
    put(B, G.tor, '#F6EBDD', s * 0.14, -0.01, 0.52, 0.1, 0.1, 0.1);                     // ivory boot cuffs (boots stay coral)
    put(B, G.sph, '#3F1D14', s * 0.14, 0.31, 0.47, 0.05, 0.04, 0.04);                   // dark paw pads ahead of the gloves
  }
  // the tiny embroidered whale on the chest
  put(B, G.sph, '#2B7F95', 0.05, 0.32, 0.322, 0.04, 0.022, 0.01);
  put(B, G.cone, '#2B7F95', 0.1, 0.33, 0.32, 0.02, 0.03, 0.008, 0, 0, -1.3);
  put(B, G.box, '#C79A45', 0, 0.25, 0.325, 0.008, 0.26, 0.006);                       // zip
}
// the tail: one swept tube, thick and fluffy, its rings painted along its length
function pipTail(Tl, sp) {
  var curve = new T.CatmullRomCurve3([new T.Vector3(0, 0, 0), new T.Vector3(0, 0.1, -0.26), new T.Vector3(0.03, 0.36, -0.5), new T.Vector3(0.05, 0.64, -0.55), new T.Vector3(0.02, 0.86, -0.42)]);
  var TS = 56, RS = 14, g = new T.TubeGeometry(curve, TS, 1, RS, false), pa = g.attributes.position, c = new Float32Array(pa.count * 3);
  var A = new T.Color(sp.tc[0]), Bc = new T.Color(sp.tc[1]), k = new T.Color(), P = new T.Vector3(), v = new T.Vector3();
  for (var j = 0; j < pa.count; j++) {
    var i = Math.floor(j / (RS + 1)), u = i / TS; curve.getPointAt(u, P);
    var r = 0.075 + 0.11 * Math.pow(Math.sin(Math.PI * (0.12 + 0.8 * u)), 0.6);
    v.fromBufferAttribute(pa, j).sub(P).multiplyScalar(r).add(P); pa.setXYZ(j, v.x, v.y, v.z);
    var band = Math.sin(u * Math.PI * 9); k.copy(A).lerp(Bc, sst(-0.25, 0.25, band));
    c[j * 3] = k.r; c[j * 3 + 1] = k.g; c[j * 3 + 2] = k.b;
  }
  g.computeVertexNormals();
  putP(Tl, g, c, 0, 0.02, 0, 1, 1, 1);
  var e = curve.getPointAt(1); put(Tl, G.sph, sp.tc[1], e.x, e.y, e.z, 0.08, 0.08, 0.08);
}
function makeRacerHQ(key) {
  var r = makeRacer(key);
  if (key !== 'pip') return r;
  var sp = SP[key], rider = null;
  r.object.children.forEach(function (c) { if (c.isGroup && c.children.length >= 2 && c.position.y > 0.5 && c.position.z < 0) rider = c; });
  var torso = rider.children[0], head = rider.children[1], tail = rider.children[2];
  var B = [], H = [], Tl = [];
  pipBody(B, sp); pipHead(H, sp); pipTail(Tl, sp);
  torso.geometry.dispose(); torso.geometry = mergeV(B);
  head.geometry.dispose(); head.geometry = mergeV(H);
  tail.geometry.dispose(); tail.geometry = mergeV(Tl); tail.position.set(0, 0.22, -0.24);
  return r;
}
function makeWhale() {
  initG();
  var A = [], pts = [], i;
  for (i = 0; i <= 16; i++) { var u = i / 16; pts.push(new T.Vector2(0.34 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.8)), 0.65) + 0.002, u * 2 - 1)); }
  put(A, new T.LatheGeometry(pts, 16), '#4E80C6', 0, 0, 0, 1, 1, 0.9, -Math.PI / 2);
  put(A, G.sph, '#E8F2FA', 0, -0.14, 0.0, 0.28, 0.2, 0.8);
  put(A, G.sph, '#4E80C6', -0.22, 0.04, -1.0, 0.3, 0.04, 0.2, 0, -0.5, 0);
  put(A, G.sph, '#4E80C6', 0.22, 0.04, -1.0, 0.3, 0.04, 0.2, 0, 0.5, 0);
  put(A, G.sph, '#3E6FB5', -0.32, -0.12, 0.35, 0.28, 0.03, 0.12, 0, 0, 0.5);
  put(A, G.sph, '#3E6FB5', 0.32, -0.12, 0.35, 0.28, 0.03, 0.12, 0, 0, -0.5);
  put(A, G.sph, '#12203A', -0.2, 0.0, 0.7, 0.04); put(A, G.sph, '#12203A', 0.2, 0.0, 0.7, 0.04);
  return new T.Mesh(merge(A), new T.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.1, clearcoat: 0.6 }));
}

var PTS = [
  [-85, 0, 14], [-20, 0, 0], [50, 1, -20], [110, 2, 10], [165, 3, 50], [150, 0, 105], [95, -5, 125], [30, -8, 118],
  [5, -9, 120], [-28, -9, 135], [-20, -9, 168], [25, -8, 178], [110, -4, 182], [180, 8, 185], [235, 14, 180], [275, 14, 155],
  [305, 14, 90], [300, 12, 20], [270, 10, -50], [200, 8, -95], [120, 5, -100], [40, 3, -95], [-60, 1, -98], [-125, 1, -80],
  [-170, 0, -30], [-150, 0, 18]
];
var COURSE = {
  shoulder: 3, airdrops: false, gm: 'auto', air: 1.25, breakClear: true,
  pads: [{ at: 0.05, x: -3 }, { at: 0.085, x: 3 }, { at: 0.385, x: -3.5 }, { at: 0.397, x: 3.5 }, { at: 0.42, x: -3 }, { at: 0.965, x: 0 }, { at: 0.982, x: 0 }],
  ramps: [{ at: 0.532, x: 0, width: 11, size: 'big' }],
  breaks: [{ from: 0.54, len: 9, clear: true }],
  rails: [{ points: [[0.49, -6.5], [0.525, -6.5]] }],
  bumps: [{ at: 0.16, size: 'roller', n: 2 }],
  hazards: [{ kind: 'crossing', at: 0.27, every: 11, offset: 5, model: false }, { kind: 'crossing', at: 0.87, every: 13, offset: 8, model: false }]
};
var ACT = [
  { top: '#6EB7EE', hor: '#FFD7A6', bot: '#FFE9CF', fog: '#FBDDBB', hs: '#CFE8FF', hg: '#E8C9A0', sun: '#FFE2B8', si: 3.0, dir: [0.7, 0.45, 0.5], cloud: '#FFF3E6' },
  { top: '#5E6FC4', hor: '#FF9A78', bot: '#FFC4A0', fog: '#F8B392', hs: '#E3B8D8', hg: '#C98A78', sun: '#FF9F6B', si: 2.6, dir: [0.55, 0.22, 0.8], cloud: '#FFC6B0' },
  { top: '#17246E', hor: '#4D62C0', bot: '#7F86D0', fog: '#5C6FC0', hs: '#8FA4F0', hg: '#4B4E9A', sun: '#9FB8FF', si: 1.7, dir: [-0.3, 0.4, 0.6], cloud: '#8E9AE0' }
];
function sstep(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

GameMog.world({
  assets: ['texture-grass', 'texture-cobblestone', 'texture-plaster', 'music-hyper-ultra-racing'],
  theme: { sky: '#FFD6A8', fog: '#FBDDBB', ink: '#2A3A66', panel: '#FFF8E7', accent: '#FF7A5C', font: 'Baloo 2' },
  graphics: { preset: 'kart', exposure: 0.9, environment: { intensity: 0.5 }, bloom: { strength: 0.35, threshold: 2, radius: 0.7 }, shadows: { extent: 42, mapSize: 1024 }, grade: { warmth: 0.04, saturation: 1.08, vignette: 0.2 } },
  music: { track: 'music-hyper-ultra-racing' },
  track: { width: 17, points: PTS },
  kart: { laps: 3, class: 'normal', items: false, driftAssist: true, driftCharge: 1.3, fx: { hype: true }, course: COURSE },

  build: function (ctx) {
    initG();
    var sc = ctx.scene, tr = ctx.track, rnd = ctx.random, L = tr.length, low = ctx.quality === 'low', M = mats();
    var hw = tr.halfWidth, i, j, s;
    function Mat(c, o) { return new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.7 }, o || {})); }
    function terrainY(x, z) {
      var n = tr.nearest(x, z), ty = tr.pointAt(n.d, 0, 0).y, dd = n.distance;
      var nz = Math.sin(x * 0.045) * Math.cos(z * 0.05) * 1.4 + Math.sin(x * 0.11 + z * 0.09) * 0.5;
      var y = ty - 0.7 + nz * sstep(14, 34, dd);
      if (dd > 52) y -= (dd - 52) * 2.4;
      var wt = whaleTop(x, z);
      return Math.max(y, wt - 8, -330);
    }
    var WX0 = -690, WLEN = 1300, WR = 300, WCY = -338, WCZ = 42;
    function whaleTop(x, z) {
      var u = (x - WX0) / WLEN; if (u <= 0 || u >= 1) return -1e9;
      var r = WR * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 0.7), dz = z - WCZ;
      if (Math.abs(dz) >= r) return -1e9;
      return WCY + Math.sqrt(r * r - dz * dz);
    }
    function PF(frac, lat) {
      var d = (((frac % 1) + 1) % 1) * L, f = tr.frameAt(d), x = f.pos.x + f.right.x * lat, z = f.pos.z + f.right.z * lat;
      return { d: d, x: x, z: z, y: terrainY(x, z), ty: f.pos.y, h: Math.atan2(f.tan.x, f.tan.z), r: f.right, t: f.tan };
    }
    function faceRoad(p, sgn) { return Math.atan2(-p.r.x * sgn, -p.r.z * sgn); }
    function colorize(m, cols) { for (var k = 0; k < cols.length; k++) m.setColorAt(k, new T.Color(cols[k])); m.instanceColor.needsUpdate = true; }

    var hemi = new T.HemisphereLight('#CFE8FF', '#E8C9A0', 1.0); sc.add(hemi);
    var sun = new T.DirectionalLight('#FFE2B8', 3.0); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sc.add(sun);
    // the runtime reads the key light's direction once, after build(), and keeps it (v1.js followShadow): set it here
    sun.position.set(ACT[0].dir[0], ACT[0].dir[1], ACT[0].dir[2]).normalize().multiplyScalar(200);
    sc.fog = new T.Fog('#FBDDBB', 180, 1700);

    var skyMat = new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new T.Color() }, hor: { value: new T.Color() }, bot: { value: new T.Color() }, sunCol: { value: new T.Color() }, sunDir: { value: new T.Vector3(0.7, 0.45, 0.5) } },
      vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top,hor,bot,sunCol,sunDir; varying vec3 vP; void main(){ float h=vP.y; vec3 c = h>0.0 ? mix(hor,top,pow(h,0.55)) : mix(hor,bot,pow(-h,0.5)); float s=max(dot(normalize(vP),normalize(sunDir)),0.0); c+=sunCol*(pow(s,500.0)*3.0+pow(s,10.0)*0.35); gl_FragColor=vec4(c,1.0); }'
    });
    var skyG = new T.Group(); var dome = new T.Mesh(new T.SphereGeometry(1400, 24, 16), skyMat); dome.frustumCulled = false; dome.renderOrder = -2; skyG.add(dome); sc.add(skyG);
    var auroraTex = ctx.textures.canvas(512, 128, function (g, w, h) {
      for (var x = 0; x < w; x += 2) { var a = 0.5 + 0.5 * Math.sin(x * 0.03) * Math.sin(x * 0.011 + 1); var gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(80,255,190,0)'); gr.addColorStop(0.35, 'rgba(90,255,200,' + (0.55 * a) + ')'); gr.addColorStop(0.75, 'rgba(160,110,255,' + (0.35 * a) + ')'); gr.addColorStop(1, 'rgba(160,110,255,0)'); g.fillStyle = gr; g.fillRect(x, 0, 2, h); }
    });
    var auMat = new T.MeshBasicMaterial({ map: auroraTex, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, fog: false, side: T.DoubleSide });
    var au1 = new T.Mesh(new T.PlaneGeometry(1300, 260), auMat); au1.position.set(-250, 420, -850); skyG.add(au1);
    var au2 = new T.Mesh(new T.PlaneGeometry(1100, 220), auMat); au2.position.set(800, 380, -300); au2.rotation.y = -1.2; skyG.add(au2);

    var grass = ctx.assets.surface('texture-grass', { size: 6, project: 'box', color: '#A8D884', roughness: 0.95 }) || Mat('#8BC46A');
    var cobble = ctx.assets.surface('texture-cobblestone', { size: 3, color: '#F2DEC6', roughness: 0.8 }) || Mat('#E8D5BC');
    var plaster = ctx.assets.surface('texture-plaster', { project: 'box', color: '#FBEBD6' }) || Mat('#FBEBD6');

    var step = low ? 12 : 8, x0 = -330, x1 = 470, z0 = -230, z1 = 330;
    var nx = Math.floor((x1 - x0) / step), nz = Math.floor((z1 - z0) / step);
    var tg = new T.PlaneGeometry(x1 - x0, z1 - z0, nx, nz); tg.rotateX(-Math.PI / 2);
    var tp = tg.attributes.position;
    for (i = 0; i < tp.count; i++) { var tx = tp.getX(i) + (x0 + x1) / 2, tz = tp.getZ(i) + (z0 + z1) / 2; tp.setXYZ(i, tx, terrainY(tx, tz), tz); }
    tg.computeVertexNormals();
    var terrain = new T.Mesh(tg, grass); terrain.receiveShadow = true; sc.add(terrain);

    var wp = [];
    for (i = 0; i <= 40; i++) { var u = i / 40; wp.push(new T.Vector2(WR * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 0.7) + 0.5, WX0 + u * WLEN)); }
    var wg = new T.LatheGeometry(wp, 48); wg.rotateZ(-Math.PI / 2);
    var skin = new T.MeshPhysicalMaterial({ color: '#4B7FC8', roughness: 0.45, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.3 });
    var whale = new T.Mesh(wg, skin); whale.position.set(0, WCY, WCZ); sc.add(whale);
    // the tail rising out of the cloud sea behind the city: one curved, tapering sweep, its flukes on top
    var tailC = new T.CatmullRomCurve3([new T.Vector3(430, -300, WCZ), new T.Vector3(560, -170, WCZ), new T.Vector3(628, -30, WCZ), new T.Vector3(650, 70, WCZ)]);
    var tailG = new T.TubeGeometry(tailC, 40, 1, 24, false), tp = tailG.attributes.position, tq = new T.Vector3(), tv = new T.Vector3();
    for (var ti = 0; ti < tp.count; ti++) { var tu = Math.floor(ti / 25) / 40; tailC.getPointAt(tu, tq); tv.fromBufferAttribute(tp, ti).sub(tq).multiplyScalar(95 - 72 * Math.pow(tu, 0.8)).add(tq); tp.setXYZ(ti, tv.x, tv.y, tv.z); }
    tailG.computeVertexNormals(); sc.add(new T.Mesh(tailG, skin));
    var fluke = new T.Group(); fluke.position.set(650, 78, WCZ); sc.add(fluke);
    [-1, 1].forEach(function (sd) { var lobe = new T.Mesh(new T.SphereGeometry(1, 24, 12), skin); lobe.scale.set(34, 6, 105); lobe.position.set(-10, 10, sd * 88); lobe.rotation.set(sd * 0.25, sd * 0.35, 0.35); fluke.add(lobe); });
    var flipPivot = new T.Group(); flipPivot.position.set(-10, -262, 330); flipPivot.rotation.y = 0.55;
    var flip = new T.Mesh(new T.SphereGeometry(1, 24, 12), new T.MeshPhysicalMaterial({ color: '#5F92D6', roughness: 0.4, clearcoat: 0.6 })); flip.scale.set(36, 4, 150); flip.position.z = 150; flipPivot.add(flip); sc.add(flipPivot);

    var cloudMat = new T.MeshLambertMaterial({ color: '#FFF3E6' });
    var floor = new T.Mesh(new T.CircleGeometry(3000, 24), cloudMat); floor.rotation.x = -Math.PI / 2; floor.position.y = -300; sc.add(floor);
    var cn = low ? 36 : 70, cg = new T.Group(); sc.add(cg);
    var puffs = ctx.instanced(new T.IcosahedronGeometry(1, 1), cloudMat, cn, function (k, d) { var a = rnd() * 6.28, r = 330 + rnd() * 1300, sz = 50 + rnd() * 120; d.position.set(Math.cos(a) * r, -290 + rnd() * 70 + r * 0.02, Math.sin(a) * r); d.scale.set(sz, sz * 0.45, sz); });
    cg.add(puffs);

    var roadTex = ctx.textures.canvas(512, 512, function (g, w, h) {
      g.fillStyle = '#F5EBD9'; g.fillRect(0, 0, w, h);
      for (var k = 0; k < 900; k++) { g.fillStyle = 'rgba(200,170,140,' + (0.05 + rnd() * 0.08) + ')'; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 2); }
      g.strokeStyle = 'rgba(190,150,120,0.4)'; g.lineWidth = 2;
      for (k = 1; k < 4; k++) { g.beginPath(); g.moveTo(w * 0.07 + k * (w * 0.86 / 4), 0); g.lineTo(w * 0.07 + k * (w * 0.86 / 4), h); g.stroke(); }
      for (k = 0; k < 4; k++) { g.beginPath(); g.moveTo(w * 0.07, k * 128); g.lineTo(w * 0.93, k * 128); g.stroke(); }
      g.fillStyle = '#E8604C'; g.fillRect(0, 0, w * 0.07, h); g.fillRect(w * 0.93, 0, w * 0.07, h);
      g.fillStyle = '#FFFFFF'; g.fillRect(w * 0.07, 0, 5, h); g.fillRect(w * 0.93 - 5, 0, 5, h);
      g.fillStyle = 'rgba(232,96,76,0.25)'; g.fillRect(w * 0.495, 0, 5, h * 0.5);
    });
    roadTex.wrapS = roadTex.wrapT = T.RepeatWrapping; roadTex.anisotropy = 4;
    var road = tr.ribbon({ material: new T.MeshStandardMaterial({ map: roadTex, roughness: 0.55, metalness: 0.02 }), y: 0.03 }); road.receiveShadow = true; sc.add(road);
    [-1, 1].forEach(function (sd) {
      sc.add(tr.ribbon({ width: 3, offset: sd * (hw + 1.5), material: cobble, y: 0.01 }));
      sc.add(tr.ribbon({ width: 0.6, offset: sd * (hw + 0.3), color: '#E8604C', y: 0.06 }));
    });
    (function () {
      var wm = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: T.DoubleSide });
      var n = Math.floor(L / 3);
      [-1, 1].forEach(function (sd) {
        var pos = [], col = [], idx = [], cc = new T.Color();
        for (var k = 0; k <= n; k++) {
          var f = tr.frameAt((k * L / n) % L), lo = sd * (hw + 2.7), hi = sd * (hw + 3.3), yb = f.pos.y - 1.2, yt = f.pos.y + 1.0;
          var ax = f.pos.x + f.right.x * lo, az = f.pos.z + f.right.z * lo, bx = f.pos.x + f.right.x * hi, bz = f.pos.z + f.right.z * hi;
          pos.push(ax, yb, az, ax, yt, az, bx, yt, bz, bx, yb, bz);
          cc.set(k % 2 ? '#E8604C' : '#F6EBDD'); for (var q = 0; q < 4; q++) col.push(cc.r, cc.g, cc.b);
          if (k < n) { var a = k * 4; [[0, 1], [1, 2], [2, 3]].forEach(function (e) { idx.push(a + e[0], a + e[1], a + 4 + e[0], a + e[1], a + 4 + e[1], a + 4 + e[0]); }); }
        }
        var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
        var m = new T.Mesh(g, wm); m.userData.gmKart = false; sc.add(m);
      });
    })();

    // houses
    var houses = [];
    function addHouse(fr, lat, fl, w) { var p = PF(fr, lat); if (!tr.clear(p.x, p.z, 10)) return; houses.push({ x: p.x, z: p.z, y: p.y, ry: faceRoad(p, lat > 0 ? 1 : -1), fl: fl, w: w }); }
    for (i = 0; i < 24; i++) addHouse(-0.02 + i * 0.0105, (i % 2 ? 1 : -1) * (24 + rnd() * 14), 2 + Math.floor(rnd() * 2), 5.5 + rnd() * 2);
    for (i = 0; i < 14; i++) addHouse(0.74 + i * 0.018, (i % 2 ? 1 : -1) * (26 + rnd() * 12), 2 + Math.floor(rnd() * 2), 5.5 + rnd() * 2);
    if (low) houses = houses.filter(function (h, k) { return k % 2 === 0; });
    var floors = 0; houses.forEach(function (h) { floors += h.fl; });
    var bp = ['#F6E7D2', '#F4C7A6', '#BFE3DC', '#F7D9A8', '#E9B7A5'], rp = ['#2FA7A0', '#E2573F', '#E9A83C', '#3A5FA8'];
    var fi = 0, fl = [];
    houses.forEach(function (h) { for (var k = 0; k < h.fl; k++) fl.push({ h: h, k: k }); });
    var bodies = ctx.instanced(G.box, Mat('#FFFFFF', { roughness: 0.8 }), fl.length, function (k, d) { var o = fl[k], w = o.h.w * (1 - o.k * 0.1); d.position.set(o.h.x, o.h.y + 3.2 * (o.k + 0.5), o.h.z); d.rotation.y = o.h.ry; d.scale.set(w, 3.2, w); });
    colorize(bodies, fl.map(function (o, k) { return bp[Math.abs(Math.floor(o.h.x * 3 + o.k)) % 5]; }));
    bodies.castShadow = true; sc.add(bodies);
    var roofs = ctx.instanced(G.cone, Mat('#FFFFFF', { roughness: 0.3, metalness: 0.1 }), houses.length, function (k, d) { var h = houses[k], w = h.w * (1 - (h.fl - 1) * 0.1); d.position.set(h.x, h.y + 3.2 * h.fl + 1.2, h.z); d.rotation.y = h.ry + Math.PI / 4; d.scale.set(w * 0.8, 2.4, w * 0.8); });
    colorize(roofs, houses.map(function (h, k) { return rp[k % 4]; })); roofs.castShadow = true; sc.add(roofs);
    var wins = [];
    houses.forEach(function (h) { for (var k = 0; k < h.fl; k++) for (var sd = -1; sd <= 1; sd += 2) { var w = h.w * (1 - k * 0.1), lx = sd * w * 0.22, lz = w / 2 + 0.04, c = Math.cos(h.ry), sn = Math.sin(h.ry); wins.push({ x: h.x + lx * c + lz * sn, z: h.z - lx * sn + lz * c, y: h.y + 3.2 * (k + 0.5) + 0.2, ry: h.ry }); } });
    var winMat = Mat('#FFE3A0', { emissive: '#FFB860', emissiveIntensity: 0.1, roughness: 0.4 }); W.winMat = winMat;
    sc.add(ctx.instanced(new T.PlaneGeometry(0.9, 1.3), winMat, wins.length, function (k, d) { var o = wins[k]; d.position.set(o.x, o.y, o.z); d.rotation.y = o.ry; }));

    // stalls, sails, poles, baskets
    var stalls = [];
    for (i = 0; i < 10; i++) { var sg = i % 2 ? 1 : -1, p = PF(0.012 + i * 0.016, sg * 17); if (tr.clear(p.x, p.z, 6)) stalls.push({ p: p, sg: sg }); }
    var scol = ['#E8604C', '#2FA7A0', '#F2C230', '#F4F1EA'];
    var counters = ctx.instanced(G.box, Mat('#B77A4C', { roughness: 0.7 }), stalls.length, function (k, d) { var o = stalls[k]; d.position.set(o.p.x, o.p.y + 0.55, o.p.z); d.rotation.y = faceRoad(o.p, o.sg); d.scale.set(3.4, 1.1, 1.4); });
    var awn = ctx.instanced(G.box, Mat('#FFFFFF', { roughness: 0.8 }), stalls.length, function (k, d) { var o = stalls[k]; d.position.set(o.p.x, o.p.y + 2.6, o.p.z); d.rotation.set(0.2, faceRoad(o.p, o.sg), 0, 'YXZ'); d.scale.set(3.8, 0.12, 2.2); });
    colorize(awn, stalls.map(function (o, k) { return scol[k % 4]; })); counters.castShadow = awn.castShadow = true; sc.add(counters, awn);
    var sails = [];
    for (i = 0; i < 12; i++) { var sg2 = i % 2 ? 1 : -1, p2 = PF(0.004 + i * 0.0165, sg2 * 19.5); if (tr.clear(p2.x, p2.z, 8)) sails.push({ p: p2, sg: sg2 }); }
    var sailG = new T.PlaneGeometry(1, 1, 8, 6), sa = sailG.attributes.position;
    for (i = 0; i < sa.count; i++) sa.setZ(i, Math.sin((sa.getX(i) + 0.5) * Math.PI) * Math.sin((sa.getY(i) + 0.5) * Math.PI) * 0.25);
    sailG.computeVertexNormals();
    var sm = ctx.instanced(sailG, Mat('#FFFFFF', { roughness: 0.85, side: T.DoubleSide }), sails.length, function (k, d) { var o = sails[k]; d.position.set(o.p.x, o.p.y + 8, o.p.z); d.rotation.set(-0.45, faceRoad(o.p, o.sg), 0, 'YXZ'); d.scale.set(8, 5, 6); });
    colorize(sm, sails.map(function (o, k) { return scol[(k + 1) % 4]; })); sc.add(sm);
    sc.add(ctx.instanced(new T.CylinderGeometry(0.18, 0.22, 10, 8), Mat('#8A5A36'), sails.length, function (k, d) { var q = sails[k].p, sg = sails[k].sg; d.position.set(q.x + q.r.x * sg * -2, q.y + 5, q.z + q.r.z * sg * -2); }));
    var chimeMeshes = [];
    sails.forEach(function (o, k) {
      if (k % 2) return;
      var C = []; put(C, G.ring, '#D8B25A', 0, 0, 0, 0.3, 0.3, 0.3, Math.PI / 2);
      for (var q = 0; q < 5; q++) { var a = q * 1.2566, ln = 0.6 + (q % 3) * 0.2; put(C, G.cyl, q % 2 ? '#E9C97A' : '#C9A24A', Math.cos(a) * 0.25, -ln / 2, Math.sin(a) * 0.25, 0.03, ln, 0.03); }
      var cm = new T.Mesh(merge(C), M.trim); cm.position.set(o.p.x - o.p.r.x * o.sg * 2.2, o.p.y + 8.6, o.p.z - o.p.r.z * o.sg * 2.2); sc.add(cm); chimeMeshes.push(cm);
    });
    var bk = [];
    for (i = 0; i < Math.floor(L / 10); i++) { var pp = PF(i * 10 / L, ((i % 2) ? 1 : -1) * (hw + 3)); bk.push(pp); }
    var bkm = ctx.instanced(G.sph, Mat('#FFFFFF', { roughness: 0.8 }), bk.length, function (k, d) { d.position.set(bk[k].x, bk[k].ty + 1.25, bk[k].z); d.scale.set(0.38, 0.28, 0.38); });
    colorize(bkm, bk.map(function (p, k) { return ['#FF9CC4', '#FFD45A', '#FF7A5C', '#F4F1EA'][k % 4]; })); sc.add(bkm);

    // lanterns
    var ln = [], lc = low ? 40 : 22;
    for (i = 0; i < Math.floor(L / lc); i++) ln.push(PF(i * lc / L, ((i % 2) ? 1 : -1) * (hw + 4.2)));
    sc.add(ctx.instanced(new T.CylinderGeometry(0.07, 0.09, 4.4, 6), Mat('#C79A45', { metalness: 0.6, roughness: 0.4 }), ln.length, function (k, d) { d.position.set(ln[k].x, ln[k].ty + 2.2, ln[k].z); }));
    var lanMat = Mat('#FFC070', { emissive: '#FF9A3C', emissiveIntensity: 0.3 }); W.lanMat = lanMat;
    sc.add(ctx.instanced(G.sph, lanMat, ln.length, function (k, d) { d.position.set(ln[k].x, ln[k].ty + 4.5, ln[k].z); d.scale.set(0.3, 0.42, 0.3); }));

    // start arch (each pillar its own mesh, banner high above the road)
    (function () {
      var p = PF(0, 0), g = new T.Group(); g.position.set(p.x, p.ty, p.z); g.rotation.y = p.h;
      [-1, 1].forEach(function (sd) {
        var A = []; put(A, G.cyl, '#F6EBDD', sd * 14, 5, 0, 0.9, 10, 0.9); put(A, G.sph, '#D8B25A', sd * 14, 10.3, 0, 1.0); put(A, G.cyl, '#E8604C', sd * 14, 0.6, 0, 1.3, 1.2, 1.3);
        g.add(new T.Mesh(merge(A), M.trim));
      });
      var bt = ctx.textures.canvas(1024, 128, function (c, w, h) { c.fillStyle = '#E8604C'; c.fillRect(0, 0, w, h); c.fillStyle = '#F6EBDD'; c.fillRect(0, 0, w, 10); c.fillRect(0, h - 10, w, 10); c.fillStyle = '#FFF8E7'; var title = 'WONDERWAKE  SKYWHALE RALLY', fs = 76, room = w - 64; c.font = 'bold ' + fs + 'px "Baloo 2", sans-serif'; var tw = c.measureText(title).width; if (tw > room) { fs = Math.floor(fs * room / tw); c.font = 'bold ' + fs + 'px "Baloo 2", sans-serif'; } c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(title, w / 2, h / 2 + 4); });
      var ban = new T.Mesh(new T.PlaneGeometry(28, 3.5), new T.MeshBasicMaterial({ map: bt, side: T.DoubleSide })); ban.position.set(0, 9.6, 0); ban.rotation.y = Math.PI; g.add(ban);
      sc.add(g);
    })();

    // rain garden: lilies, aqueducts, shafts, falls, dome
    var lil = [];
    for (i = 0; i < 16; i++) { var lp = PF(0.225 + i * 0.011, (i % 2 ? 1 : -1) * (18 + rnd() * 14)); if (tr.clear(lp.x, lp.z, 7)) lil.push(lp); }
    var padP = [new T.Vector2(0.01, 0), new T.Vector2(0.9, 0), new T.Vector2(1.0, 0.1), new T.Vector2(1.03, 0.22), new T.Vector2(0.96, 0.2), new T.Vector2(0.3, 0.05)];
    sc.add(ctx.instanced(new T.CylinderGeometry(1, 1, 0.3, 18), Mat('#3CB8B0', { roughness: 0.1, metalness: 0.3 }), lil.length, function (k, d) { d.position.set(lil[k].x, lil[k].y + 0.1, lil[k].z); d.scale.set(6.6, 1, 6.6); }));
    sc.add(ctx.instanced(new T.LatheGeometry(padP, 18), Mat('#5FBF63', { roughness: 0.6, side: T.DoubleSide }), lil.length, function (k, d) { d.position.set(lil[k].x, lil[k].y + 0.3, lil[k].z); d.scale.set(3 + (k % 3) * 0.8, 1, 3 + (k % 3) * 0.8); }));
    sc.add(ctx.instanced(G.cone, Mat('#FF9CC4', { roughness: 0.5 }), lil.length, function (k, d) { d.position.set(lil[k].x, lil[k].y + 1.2, lil[k].z); d.scale.set(0.9, 1.8, 0.9); }));
    var aq = [PF(0.25, 0), PF(0.335, 0), PF(0.41, 0)];
    var aqArc = new T.TorusGeometry(1, 0.065, 8, 28, Math.PI);
    var aqm = ctx.instanced(aqArc, Mat('#F6EBDD', { roughness: 0.8 }), aq.length, function (k, d) { d.position.set(aq[k].x, aq[k].ty + 8, aq[k].z); d.rotation.y = aq[k].h; d.scale.setScalar(17); });
    aqm.castShadow = true; sc.add(aqm);
    sc.add(ctx.instanced(G.box, Mat('#F6EBDD', { roughness: 0.8 }), aq.length * 2, function (k, d) { var o = aq[k >> 1], sd = (k % 2) ? 1 : -1; d.position.set(o.x + o.r.x * sd * 17, o.ty + 4, o.z + o.r.z * sd * 17); d.rotation.y = o.h; d.scale.set(1.6, 8, 1.6); }));
    sc.add(ctx.instanced(G.box, Mat('#E9DCC6', { roughness: 0.8 }), aq.length, function (k, d) { d.position.set(aq[k].x, aq[k].ty + 25.6, aq[k].z); d.rotation.y = aq[k].h; d.scale.set(36, 1.2, 4); }));
    sc.add(ctx.instanced(G.box, Mat('#59D6D0', { emissive: '#2BB5B0', emissiveIntensity: 0.6, roughness: 0.1 }), aq.length, function (k, d) { d.position.set(aq[k].x, aq[k].ty + 26.3, aq[k].z); d.rotation.y = aq[k].h; d.scale.set(35, 0.3, 2.4); }));
    var shaftTex = ctx.textures.canvas(64, 256, function (g, w, h) { var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,240,200,0.5)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    var shaftPos = []; for (i = 0; i < 8; i++) shaftPos.push(PF(0.235 + i * 0.022, (i % 2 ? 1 : -1) * (22 + rnd() * 6)));
    sc.add(ctx.instanced(new T.PlaneGeometry(3, 22), new T.MeshBasicMaterial({ map: shaftTex, transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }), shaftPos.length, function (k, d) { var o = shaftPos[k]; d.position.set(o.x, o.y + 11, o.z); d.rotation.set(0, o.h, 0.35); }));
    var fallTex = ctx.textures.canvas(128, 256, function (g, w, h) { g.fillStyle = 'rgba(190,235,245,0.45)'; g.fillRect(0, 0, w, h); for (var k = 0; k < 40; k++) { g.fillStyle = 'rgba(255,255,255,' + (0.3 + rnd() * 0.5) + ')'; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 4, 20 + rnd() * 60); } });
    fallTex.wrapS = fallTex.wrapT = T.RepeatWrapping; fallTex.repeat.set(1, 3); W.fallTex = fallTex;
    var falls = []; for (i = 0; i < 7; i++) { var sg3 = i % 2 ? 1 : -1, fp = PF(0.24 + i * 0.026, sg3 * 56); falls.push({ p: fp, sg: sg3 }); }
    sc.add(ctx.instanced(new T.PlaneGeometry(9, 90), new T.MeshBasicMaterial({ map: fallTex, transparent: true, depthWrite: false, side: T.DoubleSide }), falls.length, function (k, d) { var o = falls[k]; d.position.set(o.p.x, o.p.ty - 40, o.p.z); d.rotation.y = faceRoad(o.p, o.sg); }));
    (function () {
      var cx = -62, cz = 150, cy = terrainY(cx, cz);
      var g = new T.Group(); g.position.set(cx, cy, cz);
      g.add(new T.Mesh(new T.SphereGeometry(22, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshPhysicalMaterial({ color: '#BFF0EA', roughness: 0.05, transparent: true, opacity: 0.28, clearcoat: 1, side: T.DoubleSide, depthWrite: false })));
      var R = []; for (var k = 0; k < 8; k++) { put(R, G.arc, '#D8B25A', 0, 0, 0, 22, 22, 22, 0, k * Math.PI / 8, 0); }
      put(R, G.tor, '#D8B25A', 0, 0.3, 0, 22, 22, 22, Math.PI / 2); put(R, G.sph, '#D8B25A', 0, 22.5, 0, 1.4);
      g.add(new T.Mesh(merge(R), M.trim));
      var Lp = []; for (k = 0; k < 5; k++) { var a = k * 1.2566; put(Lp, G.sph, '#5FBF63', Math.cos(a) * 8, 2 + (k % 2), Math.sin(a) * 8, 5, 0.5, 5); put(Lp, G.cone, '#FF9CC4', Math.cos(a) * 8, 3.4, Math.sin(a) * 8, 1.4, 3, 1.4); }
      put(Lp, G.cone, '#FF7AA8', 0, 6, 0, 3, 9, 3);
      g.add(new T.Mesh(merge(Lp), M.fur)); sc.add(g);
    })();

    // tailwind leap: spire and bridge
    (function () {
      var p = PF(0.5, 26), g = new T.Group(); g.position.set(p.x, p.y, p.z);
      var pf = []; for (var k = 0; k <= 10; k++) pf.push(new T.Vector2(2.4 - k * 0.16 + Math.sin(k) * 0.2, k * 3.6));
      var sp = new T.Mesh(new T.LatheGeometry(pf, 16), plaster); sp.castShadow = true; g.add(sp);
      var D = []; put(D, G.sph, '#D8B25A', 0, 38.5, 0, 1.4); put(D, G.cone, '#C87A4A', 0, 41, 0, 1.2, 4, 1.2); put(D, G.tor, '#D8B25A', 0, 24, 0, 4, 4, 4, Math.PI / 2);
      for (k = 0; k < 4; k++) put(D, G.box, k % 2 ? '#E8604C' : '#2FA7A0', Math.cos(k * 1.57) * 5, 24, Math.sin(k * 1.57) * 5, 0.1, 3.5, 4, 0, k * 1.57, 0);
      g.add(new T.Mesh(merge(D), M.matte)); sc.add(g);
      var Bd = [], by = -2; put(Bd, G.box, '#F6EBDD', 0, by + 3.2, 0, 90, 1, 6); put(Bd, G.box, '#E8604C', 0, by + 4.2, 3, 90, 0.8, 0.4); put(Bd, G.box, '#E8604C', 0, by + 4.2, -3, 90, 0.8, 0.4);
      for (k = -1; k <= 1; k++) put(Bd, G.arc, '#E9DCC6', k * 28, by + 3, 0, 13, 13, 6, 0, 0, 0);
      var br = new T.Mesh(merge(Bd), M.matte); br.position.set(100, 0, 245); sc.add(br);
    })();
    var breach = makeWhale(); breach.scale.setScalar(6); sc.add(breach); W.breach = breach;
    W.breachP = PF(0.548, 62); breach.scale.setScalar(14);
    var esc = []; for (i = 0; i < (low ? 3 : 6); i++) { var ew = makeWhale(); ew.scale.setScalar(30 + (i % 3) * 6); var eo = { m: ew, a: i * 1.05, r: 420 + i * 90, y: 90 + (i % 3) * 40, sp: 0.02 + (i % 3) * 0.004 }; ew.position.set(60 + Math.cos(eo.a) * eo.r, eo.y, 40 + Math.sin(eo.a) * eo.r); ew.rotation.y = -eo.a + Math.PI; sc.add(ew); esc.push(eo); }
    W.esc = esc;

    // lantern descent: eye, observatory, windmill
    (function () {
      var bulge = new T.Mesh(new T.SphereGeometry(1, 28, 20), skin); bulge.scale.set(80, 48, 62); bulge.position.set(-268, 6, -42); sc.add(bulge);
      var eye = new T.Group(); eye.position.set(-196, 22, -41); eye.rotation.y = Math.PI / 2;
      var sclera = new T.Mesh(new T.SphereGeometry(11, 28, 20), new T.MeshPhysicalMaterial({ color: '#F6EEDD', roughness: 0.25, clearcoat: 0.8 })); eye.add(sclera);
      var iris = new T.Mesh(new T.SphereGeometry(5.2, 24, 16), new T.MeshPhysicalMaterial({ color: '#8A5524', roughness: 0.3, clearcoat: 1 })); iris.scale.z = 0.5; iris.position.z = 9.8; eye.add(iris);
      var pupil = new T.Mesh(new T.SphereGeometry(2.8, 18, 12), Mat('#140A08', { roughness: 0.1 })); pupil.scale.z = 0.4; pupil.position.z = 10.6; eye.add(pupil);
      var hl = new T.Mesh(new T.SphereGeometry(1.0, 10, 8), new T.MeshBasicMaterial({ color: '#FFFFFF' })); hl.position.set(2, 2.2, 11.1); eye.add(hl);
      var lid = new T.Mesh(new T.SphereGeometry(11.7, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), skin); lid.rotation.x = -0.55; eye.add(lid);
      var lid2 = new T.Mesh(new T.SphereGeometry(11.7, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), skin); lid2.rotation.x = Math.PI + 0.7; eye.add(lid2);
      sc.add(eye); W.lid = lid; W.eye = eye;
      var p = PF(0.82, 0), g = new T.Group(); g.position.set(p.x, p.ty, p.z); g.rotation.y = p.h;
      [-1, 1].forEach(function (sd) {
        var Pl = []; put(Pl, G.box, '#C87A4A', sd * 14, 6, 0, 2, 12, 2); put(Pl, G.sph, '#5FB5A0', sd * 14, 12.4, 0, 1.4);
        g.add(new T.Mesh(merge(Pl), M.trim));
      });
      var O = [];
      var arch = new T.TorusGeometry(1, 0.07, 8, 32, Math.PI); put(O, arch, '#C87A4A', 0, 12, 0, 14, 14, 14); put(O, arch, '#5FB5A0', 0, 12, 0.3, 12.5, 12.5, 12.5);
      put(O, G.sph, '#C87A4A', 0, 26.2, 0, 5, 5, 5); put(O, G.cyl, '#D8B25A', 0, 29, 1.5, 0.8, 5, 0.8, -0.8); put(O, G.tor, '#D8B25A', 0, 26.5, 0, 5.2, 5.2, 5.2, Math.PI / 2);
      var om = new T.Mesh(merge(O), M.trim); om.castShadow = true; g.add(om); sc.add(g);
      var wp2 = PF(0.875, 30), wgp = new T.Group(); wgp.position.set(wp2.x, wp2.y, wp2.z); wgp.rotation.y = faceRoad(wp2, 1);
      var tp2 = []; for (var k = 0; k <= 6; k++) tp2.push(new T.Vector2(5 - k * 0.45, k * 2.6));
      wgp.add(new T.Mesh(new T.LatheGeometry(tp2, 14), plaster));
      var cap = new T.Mesh(new T.ConeGeometry(3.4, 4, 14), Mat('#C87A4A', { metalness: 0.7, roughness: 0.35 })); cap.position.y = 18; wgp.add(cap);
      var BL = []; for (k = 0; k < 4; k++) { var a = k * Math.PI / 2; put(BL, G.box, '#7A4B2E', Math.sin(a) * 6, Math.cos(a) * 6, 0, 0.3, 12, 0.3, 0, 0, -a); put(BL, G.box, k % 2 ? '#E8604C' : '#F6EBDD', Math.sin(a) * 6 + Math.cos(a) * 1.3, Math.cos(a) * 6 - Math.sin(a) * 1.3, 0.05, 2.4, 9, 0.1, 0, 0, -a); }
      var blades = new T.Mesh(merge(BL), M.matte); blades.position.set(0, 14.5, 5.2); wgp.add(blades); sc.add(wgp); W.blades = blades;
    })();

    // hazards visuals
    function makeDrum() {
      var D = []; put(D, G.cyl, '#D8573A', 0, 0, 0, 1.2, 2.2, 1.2, Math.PI / 2);
      [-1, 1].forEach(function (sd) { put(D, G.cyl, '#F6EBDD', 0, 0, sd * 1.1, 1.15, 0.06, 1.15, Math.PI / 2); put(D, G.tor, '#D8B25A', 0, 0, sd * 1.05, 1.22, 1.22, 1.22); for (var k = 0; k < 12; k++) put(D, G.sph, '#E9C97A', Math.cos(k * 0.5236) * 1.25, Math.sin(k * 0.5236) * 1.25, sd * 1.05, 0.08); });
      put(D, G.sph, '#E8604C', 0, 0, 1.15, 0.3, 0.3, 0.1); put(D, G.sph, '#E8604C', 0, 0, -1.15, 0.3, 0.3, 0.1);
      return new T.Mesh(merge(D), M.paint);
    }
    function makePaddle() {
      var D = []; put(D, G.cyl, '#D8B25A', 0, 0, 0, 0.3, 2.4, 0.3, Math.PI / 2);
      for (var k = 0; k < 8; k++) { var a = k * Math.PI / 4; put(D, G.box, k % 2 ? '#E8604C' : '#F6EBDD', Math.cos(a) * 1.0, Math.sin(a) * 1.0, 0, 1.6, 0.15, 2.2, 0, 0, a); }
      put(D, G.tor, '#D8B25A', 0, 0, 1.15, 1.7, 1.7, 1.7); put(D, G.tor, '#D8B25A', 0, 0, -1.15, 1.7, 1.7, 1.7);
      return new T.Mesh(merge(D), M.paint);
    }
    W.haz = [];
    [makeDrum(), makePaddle()].forEach(function (m) { var root = new T.Group(); root.add(m); root.visible = false; sc.add(root); W.haz.push({ root: root, spin: m, px: 0, rad: 1.2 }); });
    W.haz[1].rad = 1.7;

    // motes
    var mn = low ? 24 : 50;
    function mkMotes(f0, f1, col, em, rad) {
      var arr = []; for (var k = 0; k < mn; k++) { var p = PF(f0 + rnd() * (f1 - f0), (rnd() < 0.5 ? -1 : 1) * (13 + rnd() * 16)); arr.push({ x: p.x, y: p.ty + 1 + rnd() * 6, z: p.z, ph: rnd() * 6.28 }); }
      var mt = Mat(col, { emissive: em, emissiveIntensity: 1.5, roughness: 0.4 });
      var mesh = ctx.instanced(G.sph, mt, arr.length, function (k, d) { d.position.set(arr[k].x, arr[k].y, arr[k].z); d.scale.setScalar(rad); });
      sc.add(mesh); return { mesh: mesh, arr: arr, mat: mt, rad: rad };
    }
    W.leaf = mkMotes(0.22, 0.42, '#9BE06E', '#4FA83A', 0.14);
    W.plank = mkMotes(0.72, 1.0, '#9FF3FF', '#38D4F0', 0.1);

    // ribbons
    W.rib = [];
    ['#E8604C', '#F2C230', '#2FA7A0', '#F6EBDD'].forEach(function (c, k) {
      var m = new T.Mesh((function (d0, d1, lat, up, wd, n, ph) {
        var pos = [], idx = [];
        for (var q = 0; q <= n; q++) { var d = d0 + (d1 - d0) * q / n, f = tr.frameAt(d % L), l = lat + Math.sin(q * 0.45 + ph) * 2.5, y = f.pos.y + up + Math.sin(q * 0.6 + ph) * 1.2, cx = f.pos.x + f.right.x * l, cz = f.pos.z + f.right.z * l;
          pos.push(cx - f.right.x * wd / 2, y, cz - f.right.z * wd / 2, cx + f.right.x * wd / 2, y, cz + f.right.z * wd / 2);
          if (q < n) { var a = q * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
        var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
      })(L * 0.93, L * 0.995, -5 + k * 3.3, 13 + k * 1.4, 1.3, 32, k * 1.3), new T.MeshStandardMaterial({ color: c, roughness: 0.5, side: T.DoubleSide, emissive: c, emissiveIntensity: 0.25 }));
      m.visible = false; sc.add(m); W.rib.push(m);
    });

    // spectators
    var specs = [], fr = [0.012, 0.09, 0.17, 0.36, 0.58, 0.8, 0.97], per = low ? 2 : 3;
    W.groups = [];
    fr.forEach(function (f, gi) {
      var sg = gi % 2 ? 1 : -1;
      W.groups.push({ id: 'g' + gi, d: f, x: sg * (hw + 5), y: 1 });
      for (var k = 0; k < per; k++) {
        var p = PF(f + k * 0.003, sg * (hw + 5 + (k % 2) * 1.4));
        var m = new T.Mesh(specGeo(ORDER[(gi * 3 + k) % 8]), M.fur); m.position.set(p.x, p.y + 0.55, p.z); m.rotation.y = faceRoad(p, sg); m.scale.setScalar(1.15); m.castShadow = true; sc.add(m);
        specs.push({ m: m, y0: p.y + 0.55, g: 'g' + gi, ph: k * 1.3 });
      }
      var sp2 = PF(f + 0.003, sg * (hw + 5.7)); var st = new T.Mesh(new T.BoxGeometry(5, 1, 3.4), Mat('#F4C7A6', { roughness: 0.8 })); st.position.set(sp2.x, sp2.y, sp2.z); st.rotation.y = sp2.h; sc.add(st);
    });
    W.specs = specs; W.cheer = {};

    W.sun = sun; W.hemi = hemi; W.skyMat = skyMat; W.skyG = skyG; W.cloudMat = cloudMat; W.chimes = chimeMeshes; W.auMat = auMat; W.cg = cg; W.flip = flipPivot; W.L = L; W.tr = tr;
    W.cA = new T.Color(); W.cB = new T.Color(); W.dm = new T.Object3D();
    ctx.on('start', function () { W.laps = 0; W.target = 0; });
    ctx.on('lap', function () { W.laps++; W.target = Math.min(2, W.laps); });
  },

  player: function (ctx) { return makeRacerHQ('pip'); },
  rival: function (ctx, k) { return makeRacer(ORDER[1 + ((k - 1) % 7)]); },

  update: function (ctx, t, dt) {
    if (!W.sun) return;
    var i;
    if (!W.init) {
      W.init = true;
      if (ctx.kart && ctx.kart.crowd) ctx.kart.crowd(W.groups);
      if (ctx.kart && ctx.kart.on) ctx.kart.on('cheer', function (e) { W.cheer[e.id] = Math.max(W.cheer[e.id] || 0, e.k || 1); });
    }
    W.ph += (W.target - W.ph) * Math.min(1, dt * 0.6);
    var ph = W.ph, a = Math.min(1, Math.floor(ph)), b = Math.min(2, a + 1); if (ph >= 2) { a = 1; b = 2; }
    var f = ph >= 2 ? 1 : ph - Math.floor(ph);
    function mix(key, out) { W.cA.set(ACT[a][key]); W.cB.set(ACT[b][key]); out.copy(W.cA).lerp(W.cB, f); return out; }
    mix('hs', W.hemi.color); mix('hg', W.hemi.groundColor); mix('sun', W.sun.color);
    W.sun.intensity = ACT[a].si + (ACT[b].si - ACT[a].si) * f; W.hemi.intensity = 1.0 + 0.15 * ph;
    var u = W.skyMat.uniforms;
    mix('top', u.top.value); mix('hor', u.hor.value); mix('bot', u.bot.value); mix('sun', u.sunCol.value);
    var d0 = ACT[a].dir, d1 = ACT[b].dir;
    u.sunDir.value.set(d0[0] + (d1[0] - d0[0]) * f, d0[1] + (d1[1] - d0[1]) * f, d0[2] + (d1[2] - d0[2]) * f).normalize();
    W.sun.position.copy(u.sunDir.value).multiplyScalar(200);
    mix('fog', ctx.scene.fog.color); mix('cloud', W.cloudMat.color);
    W.skyG.position.copy(ctx.camera.position);
    W.auMat.opacity = sstep(1.3, 2, ph) * 0.6;
    W.winMat.emissiveIntensity = 0.1 + ph * 1.2; W.lanMat.emissiveIntensity = 0.3 + ph * 1.6; W.plank.mat.emissiveIntensity = 1 + ph * 1.6;
    W.rib.forEach(function (m, k) { m.visible = ph > 1.5; m.position.y = Math.sin(t * 1.6 + k) * 0.3; });
    W.cg.rotation.y = t * 0.003;
    W.flip.rotation.z = Math.sin(t * 0.3) * 0.12; W.flip.rotation.x = Math.sin(t * 0.21) * 0.05;
    W.fallTex.offset.y = -t * 0.8;
    W.chimes.forEach(function (c, k) { c.rotation.z = Math.sin(t * 1.7 + k) * 0.08; c.rotation.x = Math.cos(t * 1.3 + k) * 0.08; });
    if (W.blades) W.blades.rotation.z = t * 0.4;
    var cam = ctx.camera.position, ed = cam.distanceTo(W.eye.position);
    var cyc = t % 7, bl = cyc < 0.5 ? Math.sin(cyc / 0.5 * Math.PI) : 0;
    if (ed < 90) { var c2 = (t * 1.0 + 3) % 9; if (c2 < 0.5) bl = Math.max(bl, Math.sin(c2 / 0.5 * Math.PI)); }
    W.lid.rotation.x = -0.55 + 1.15 * bl;
    W.esc.forEach(function (e) {
      e.a += dt * e.sp; var r = e.r * (1 - 0.3 * ph / 2);
      e.m.position.set(60 + Math.cos(e.a) * r, e.y + Math.sin(t * 0.5 + e.a) * 6, 40 + Math.sin(e.a) * r);
      e.m.rotation.y = -e.a + Math.PI; e.m.rotation.z = Math.sin(t * 0.7 + e.a) * 0.08;
    });
    var bc = (t % 9) / 9, by = bc < 0.5 ? Math.sin(bc * 2 * Math.PI) : 0;
    W.breach.position.set(W.breachP.x, W.breachP.ty - 70 + by * 95, W.breachP.z);
    W.breach.rotation.x = bc < 0.25 ? -0.7 : 0.7; W.breach.visible = bc < 0.5;
    for (var k = 0; k < W.specs.length; k++) { var s = W.specs[k], c = W.cheer[s.g] || 0; s.m.position.y = s.y0 + Math.abs(Math.sin(t * 12 + s.ph)) * 0.7 * c + Math.sin(t * 2 + s.ph) * 0.03; }
    for (var g in W.cheer) W.cheer[g] = Math.max(0, W.cheer[g] - dt * 0.9);
    [W.leaf, W.plank].forEach(function (m) {
      for (var q = 0; q < m.arr.length; q++) { var o = m.arr[q]; W.dm.position.set(o.x + Math.sin(t * 0.5 + o.ph) * 1.5, o.y + Math.sin(t * 0.8 + o.ph) * 0.8 - (m === W.leaf ? ((t * 0.6 + o.ph) % 3) : 0), o.z + Math.cos(t * 0.4 + o.ph) * 1.5); W.dm.scale.setScalar(m.rad); W.dm.updateMatrix(); m.mesh.setMatrixAt(q, W.dm.matrix); }
      m.mesh.instanceMatrix.needsUpdate = true;
    });
    if (ctx.kart && ctx.kart.hazards) {
      var hz = ctx.kart.hazards();
      for (i = 0; i < W.haz.length; i++) {
        var h = hz[i], v = W.haz[i]; if (!h) { v.root.visible = false; continue; }
        var on = h.phase === 'roll' && !h.lens; v.root.visible = on;
        if (on) {
          var dd = h.d <= 1.0001 ? h.d * W.L : h.d, p = W.tr.pointAt(dd, h.x || 0, 0), fr = W.tr.frameAt(dd % W.L);
          v.root.position.set(p.x, p.y + v.rad, p.z); v.root.rotation.y = Math.atan2(fr.tan.x, fr.tan.z);
          v.spin.rotation.z = -(h.x || 0) / v.rad;
        }
      }
    }
  }
});

