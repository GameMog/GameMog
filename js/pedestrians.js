(function () {
// js/pedestrians.js
// Skinned, procedurally animated New Yorkers: the sidewalk crowds (traffic.js), the player's pedestrian and the
// cyclist's rider (controllers.js).
// - One continuous lofted body (torso & neck, trouser legs, sleeves, hands, head, hair, shoes) skinned to a 15-bone
//   skeleton, with bind-pose morphs for build (girth), female proportions and hair volume & length; a near and a far
//   level of detail.
// - A whole crowd is one instanced draw per level of detail: every person's bone transforms (quaternion, translation &
//   scale) live in a storage buffer the vertex stage skins from, and a per-person seed dresses them (TSL material).
// - PersonRig walks a body along whatever path its owner moves it on: footsteps are planted in the world (heel strike,
//   foot flat, heel-off & toe-off rolling over a toe joint), so feet never slide; two-bone IK bends hips & knees to
//   reach them, the pelvis rides as high as the planted legs allow (the inverted pendulum's bob), and the pelvis
//   rotation & sway, the chest's counter-rotation and the arm swing all follow the feet. It turns on the spot, stops
//   with its feet together, steps up & down curbs, runs, jumps, and rides a bicycle (feet on the pedals).
// - (Mog City, 28 Oct) The near level of detail reads as people at 3 to 15 m: a sculpted head (brow, eye sockets, nose,
//   cheekbones, lips, chin, jaw, ears), fingers in a relaxed curl, and a material that paints a face (eyes with whites
//   & irises, lids & lashes, brows, lips, nostrils, skin shading, stubble & beards), a soft hairline & strands, fabric
//   (weave, knit, quilting, folds, seams, stitching, pockets, buttons, ties, belts), palms & nails. The far level, its
//   cost and the rig are as they were; both levels share the palettes and each person's outfit.
// - (Mog City, 28 Oct, repair) Undersides lit like the faces round them (no black block under the nose or the jaw), a
//   domed crown with no disc, hair in locks and masses (a lumpy shell, long hair tapering to uneven ends), hair colour
//   drawn for the skin tone (grey only on the older ones), the hairline arched over skin-coloured ears, the head
//   blended into the neck, softer beards (the far level keeps them), dimmer eye whites, rounded palms.

const { THREE } = window.NYC;
const {
  Fn,
  float,
  int,
  vec2,
  vec3,
  color,
  attribute,
  instanceIndex,
  attributeArray,
  normalLocal,
  varying,
  cross,
  normalize,
  sin,
  abs,
  fract,
  min,
  max,
  clamp,
  mix,
  step,
  smoothstep,
  length,
  dot,
  sign,
  atan,
  fwidth,
  If,
  mx_noise_float,
  cos,
  vec4,
  normalView,
  positionViewDirection
} = window.NYC.TSL;
const { mergeGeometries } = window.NYC.Addons;

// ============================================================================
// 1. SKELETON
// ============================================================================
const BONE = {
  PELVIS: 0,
  CHEST: 1,
  HEAD: 2,
  UPPER_ARM_L: 3,
  FOREARM_L: 4,
  UPPER_ARM_R: 5,
  FOREARM_R: 6,
  THIGH_L: 7,
  SHIN_L: 8,
  FOOT_L: 9,
  TOE_L: 10,
  THIGH_R: 11,
  SHIN_R: 12,
  FOOT_R: 13,
  TOE_R: 14
};
const BONE_COUNT = 15;
// vec4s per person in the pose buffer: (quaternion) and (translation, scale) per bone, then (seed, female, girth, hair)
const STRIDE = BONE_COUNT * 2 + 1;

// Bind pose (metres, a 1.75 m person standing at the origin facing +Z, +X on their left): legs straight down, arms
// hanging 8 degrees out from the body
const THIGH = 0.42;
const SHIN = 0.42;
const ANKLE_H = 0.08;
const HIP_X = 0.09;
const UPPER_ARM = 0.3;
const FOREARM = 0.255;
const ARM_BIND_ABDUCTION = 0.14;
const PELVIS_Y = 0.96;
const HIP_Y = ANKLE_H + SHIN + THIGH;
const SIDES = [1, -1]; // left (+X), right (-X)
const LIMB = {
  upperArm: [BONE.UPPER_ARM_L, BONE.UPPER_ARM_R],
  forearm: [BONE.FOREARM_L, BONE.FOREARM_R],
  thigh: [BONE.THIGH_L, BONE.THIGH_R],
  shin: [BONE.SHIN_L, BONE.SHIN_R],
  foot: [BONE.FOOT_L, BONE.FOOT_R],
  toe: [BONE.TOE_L, BONE.TOE_R]
};

function shoulderJoint(female) {
  return female ? [0.165, 1.415, -0.015] : [0.185, 1.43, -0.015];
}

function bindJoints(female) {
  const sh = shoulderJoint(female);
  const ax = Math.sin(ARM_BIND_ABDUCTION) * UPPER_ARM;
  const ay = -Math.cos(ARM_BIND_ABDUCTION) * UPPER_ARM;
  const j = [];
  j[BONE.PELVIS] = new THREE.Vector3(0, PELVIS_Y, 0);
  j[BONE.CHEST] = new THREE.Vector3(0, 1.12, -0.01);
  j[BONE.HEAD] = new THREE.Vector3(0, 1.52, -0.012);
  SIDES.forEach((side, k) => {
    j[LIMB.upperArm[k]] = new THREE.Vector3(side * sh[0], sh[1], sh[2]);
    j[LIMB.forearm[k]] = new THREE.Vector3(side * (sh[0] + ax), sh[1] + ay, sh[2]);
    j[LIMB.thigh[k]] = new THREE.Vector3(side * HIP_X, HIP_Y, 0);
    j[LIMB.shin[k]] = new THREE.Vector3(side * HIP_X, ANKLE_H + SHIN, 0);
    j[LIMB.foot[k]] = new THREE.Vector3(side * HIP_X, ANKLE_H, 0);
    j[LIMB.toe[k]] = new THREE.Vector3(side * HIP_X, 0.02, 0.135);
  });
  return j;
}
const BIND = [bindJoints(false), bindJoints(true)];

// ============================================================================
// 2. SKINNED LOFTED BODY GEOMETRY
// ============================================================================
const PART = { BODY: 0, LEG: 1, SHOE: 2, ARM: 3, HAND: 4, HEAD: 5, HAIR: 6, LONG_HAIR: 7 };

// Superellipse ring around a vertical axis (x across, z to the front `rzF` or back `rzB`); `bump(a)` pushes points out
function ringY(y, rx, rzF, rzB, cz, n, ex = 2, bump = null, cx = 0) {
  const e = 2 / ex;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    let x = Math.sign(c) * Math.abs(c) ** e * rx;
    let z = Math.sign(s) * Math.abs(s) ** e * (s >= 0 ? rzF : rzB);
    const b = bump ? bump(a) : 0;
    if (b) {
      const r = Math.hypot(x, z) || 1;
      x += (x / r) * b;
      z += (z / r) * b;
    }
    out.push(new THREE.Vector3(cx + x, y, cz + z));
  }
  return out;
}

const _down = new THREE.Vector3(0, -1, 0);
const _yAxis = new THREE.Vector3(0, 1, 0);
// Ring around a limb axis `dir` (rows run along it): x stays roughly across the body, z to the front; `twist` turns
// the ring about the axis
function limbRing(center, dir, rx, rz, n, ex = 2, twist = 0) {
  const q = new THREE.Quaternion().setFromUnitVectors(_down, dir);
  return ringY(0, rx, rz, rz, 0, n, ex).map((p) => p.applyAxisAngle(_yAxis, twist).applyQuaternion(q).add(center));
}

// Gaussian bump around angle a0 (wrapping)
function lobe(a, a0, width) {
  let d = a - a0;
  d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
  return Math.exp(-(d * d) / (width * width));
}

// Closed loft through rings of equal size (rows of the surface), with optional flat caps (centroid fans). Returns
// positions, uvs (u along the rows, v around), indices and the row each vertex belongs to; rings with the same layout
// give vertex-for-vertex matching positions, which the morph targets rely on.
function loftRings(sections, capStart, capEnd) {
  const rows = sections.length;
  const columns = sections[0].length;
  const per = columns + 1;
  const positions = [];
  const uvs = [];
  const indices = [];
  const rowOf = [];
  const rowU = [0];
  for (let i = 1; i < rows; i++) {
    let d = 0;
    for (let j = 0; j < columns; j++) d += sections[i][j].distanceTo(sections[i - 1][j]);
    rowU.push(rowU[i - 1] + d / columns);
  }
  const totalU = rowU[rows - 1] || 1;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < per; j++) {
      const p = sections[i][j % columns];
      positions.push(p.x, p.y, p.z);
      uvs.push(rowU[i] / totalU, j / columns);
      rowOf.push(i);
    }
  }
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < columns; j++) {
      const a = i * per + j;
      const b = a + 1;
      const c = a + per + 1;
      const d = a + per;
      indices.push(a, b, d, b, c, d);
    }
  }
  const cap = (row, flip) => {
    const start = positions.length / 3;
    const centre = new THREE.Vector3();
    for (let j = 0; j < columns; j++) {
      const p = sections[row][j];
      centre.add(p);
      positions.push(p.x, p.y, p.z);
      uvs.push(row === 0 ? 0 : 1, j / columns);
      rowOf.push(row);
    }
    centre.divideScalar(columns);
    positions.push(centre.x, centre.y, centre.z);
    uvs.push(row === 0 ? 0 : 1, 0.5);
    rowOf.push(row);
    const c = start + columns;
    for (let j = 0; j < columns; j++) {
      const a = start + j;
      const b = start + ((j + 1) % columns);
      if (flip) indices.push(c, b, a);
      else indices.push(c, a, b);
    }
  };
  // rings run counter-clockwise looking back along the rows: the first cap faces back, the last one forward
  if (capStart) cap(0, true);
  if (capEnd) cap(rows - 1, false);
  return { positions, uvs, indices, rowOf, rows, per };
}

class BodyBuilder {
  constructor() {
    this.geometries = [];
  }

  // rows: { pts, ptsF (female), ptsH (more hair volume), ptsL (long hair), skin: [boneA, boneB, weightB], axis }
  // flattenBelow: normals of vertices lower than this face less downwards (the crotch of the trousers reads as cloth,
  // not as a dark gap between the legs)
  // lift: { below, k } normals of vertices below `below` that face down turn toward the horizontal (an underside lit like
  // the surfaces round it; k a number or a function of height); smooth: passes of averaging each normal with its grid
  // neighbours (no light facets); tweak(y, n): any other change to a normal (n a Vector3, normalised after)
  loft(rows, part, { capStart = false, capEnd = false, flattenBelow = -1, lift = null, smooth = 0, tweak = null } = {}) {
    const lo = loftRings(rows.map((r) => r.pts), capStart, capEnd);
    const variant = (key) => (rows.some((r) => r[key]) ? loftRings(rows.map((r) => r[key] || r.pts), capStart, capEnd).positions : null);
    const fem = variant('ptsF');
    const vol = variant('ptsH');
    const long = variant('ptsL');

    const geo = new THREE.BufferGeometry();
    geo.setIndex(lo.indices);
    // normals of the shape as seen: the long hair's hanging down, not its bind pose folded away inside the head
    geo.setAttribute('position', new THREE.Float32BufferAttribute(long || lo.positions, 3));
    geo.computeVertexNormals();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(lo.positions, 3));
    // weld the normals along the seam of every ring
    const normals = geo.attributes.normal;
    for (let i = 0; i < lo.rows; i++) {
      const a = i * lo.per;
      const b = a + lo.per - 1;
      _seam.set(normals.getX(a) + normals.getX(b), normals.getY(a) + normals.getY(b), normals.getZ(a) + normals.getZ(b)).normalize();
      normals.setXYZ(a, _seam.x, _seam.y, _seam.z);
      normals.setXYZ(b, _seam.x, _seam.y, _seam.z);
    }
    for (let v = 0; v < normals.count; v++) {
      if (lo.positions[v * 3 + 1] >= flattenBelow || normals.getY(v) >= 0) continue;
      _seam.set(normals.getX(v), normals.getY(v) * 0.3, normals.getZ(v)).normalize();
      normals.setXYZ(v, _seam.x, _seam.y, _seam.z);
    }
    if (smooth) {
      const C = lo.per - 1;
      const at = (i, j) => i * lo.per + ((j + C) % C);
      for (let it = 0; it < smooth; it++) {
        const src = Float32Array.from(normals.array);
        for (let i = 0; i < lo.rows; i++) {
          for (let j = 0; j < C; j++) {
            const nb = [[at(i, j), 2], [at(i, j - 1), 1], [at(i, j + 1), 1]];
            if (i > 0) nb.push([at(i - 1, j), 1]);
            if (i < lo.rows - 1) nb.push([at(i + 1, j), 1]);
            _seam.set(0, 0, 0);
            for (const [k, w] of nb) _seam.x += src[k * 3] * w, _seam.y += src[k * 3 + 1] * w, _seam.z += src[k * 3 + 2] * w;
            _seam.normalize();
            normals.setXYZ(at(i, j), _seam.x, _seam.y, _seam.z);
            if (j === 0) normals.setXYZ(i * lo.per + C, _seam.x, _seam.y, _seam.z);
          }
        }
      }
    }
    if (lift) {
      const shown = long || lo.positions;
      for (let v = 0; v < normals.count; v++) {
        const ly = shown[v * 3 + 1];
        if (ly >= lift.below || normals.getY(v) >= 0) continue;
        _seam.set(normals.getX(v), normals.getY(v) * (typeof lift.k === 'function' ? lift.k(ly) : lift.k), normals.getZ(v));
        if (_seam.lengthSq() < 1e-8) continue;
        _seam.normalize();
        normals.setXYZ(v, _seam.x, _seam.y, _seam.z);
      }
    }
    if (tweak) {
      for (let v = 0; v < normals.count; v++) {
        _seam.set(normals.getX(v), normals.getY(v), normals.getZ(v));
        if (!tweak(lo.positions[v * 3 + 1], _seam)) continue;
        _seam.normalize();
        normals.setXYZ(v, _seam.x, _seam.y, _seam.z);
      }
    }

    // Packed (WebGPU allows 8 vertex buffers): skin = (bone A, bone B, weight of B, part), extra = (girth direction
    // x & z, u along the loft), femaleDelta, hairDelta (hair volume on the shell, hair length on the long hair)
    const pos = lo.positions;
    const count = pos.length / 3;
    const skin = new Float32Array(count * 4);
    const extra = new Float32Array(count * 3);
    const femaleDelta = new Float32Array(count * 3);
    const hairDelta = new Float32Array(count * 3);
    const hair = vol || long;
    for (let v = 0; v < count; v++) {
      const row = rows[lo.rowOf[v]];
      skin[v * 4] = row.skin[0];
      skin[v * 4 + 1] = row.skin[1];
      skin[v * 4 + 2] = row.skin[2];
      skin[v * 4 + 3] = part;
      if (row.axis) {
        extra[v * 3] = pos[v * 3] - row.axis.x;
        extra[v * 3 + 1] = pos[v * 3 + 2] - row.axis.z;
      }
      extra[v * 3 + 2] = lo.uvs[v * 2];
      for (let k = 0; k < 3; k++) {
        if (fem) femaleDelta[v * 3 + k] = fem[v * 3 + k] - pos[v * 3 + k];
        if (hair) hairDelta[v * 3 + k] = hair[v * 3 + k] - pos[v * 3 + k];
      }
    }
    geo.setAttribute('skin', new THREE.BufferAttribute(skin, 4));
    geo.setAttribute('extra', new THREE.BufferAttribute(extra, 3));
    geo.setAttribute('femaleDelta', new THREE.BufferAttribute(femaleDelta, 3));
    geo.setAttribute('hairDelta', new THREE.BufferAttribute(hairDelta, 3));
    this.geometries.push(geo);
  }

  build() {
    const geo = mergeGeometries(this.geometries);
    geo.computeBoundingSphere();
    return geo;
  }
}
const _seam = new THREE.Vector3();

// Profiles: [y, rx, rzFront, rzBack, centreZ, keepInFarLod] for the male base and the female morph target
const TORSO = {
  m: [
    [1.615, 0.046, 0.044, 0.048, -0.004, 1],
    [1.575, 0.051, 0.049, 0.053, -0.008, 0],
    [1.53, 0.058, 0.053, 0.057, -0.013, 1],
    [1.5, 0.072, 0.057, 0.064, -0.016, 0],
    [1.47, 0.146, 0.074, 0.08, -0.02, 1],
    [1.44, 0.188, 0.095, 0.089, -0.018, 1],
    [1.4, 0.186, 0.108, 0.093, -0.014, 0],
    [1.34, 0.177, 0.118, 0.096, -0.01, 1],
    [1.27, 0.167, 0.117, 0.093, -0.006, 0],
    [1.2, 0.157, 0.11, 0.089, -0.002, 1],
    [1.13, 0.15, 0.104, 0.086, 0, 0],
    [1.06, 0.154, 0.101, 0.089, 0, 1],
    [0.99, 0.163, 0.099, 0.099, 0, 0],
    [0.935, 0.166, 0.095, 0.106, 0, 1],
    [0.885, 0.152, 0.078, 0.1, 0, 0],
    [0.845, 0.1, 0.055, 0.075, 0, 1]
  ],
  f: [
    [1.615, 0.042, 0.04, 0.044, -0.004],
    [1.575, 0.045, 0.043, 0.047, -0.008],
    [1.53, 0.051, 0.047, 0.051, -0.012],
    [1.5, 0.064, 0.05, 0.057, -0.015],
    [1.47, 0.128, 0.066, 0.072, -0.018],
    [1.44, 0.164, 0.085, 0.081, -0.016],
    [1.4, 0.163, 0.1, 0.084, -0.012],
    [1.34, 0.157, 0.122, 0.087, -0.006],
    [1.27, 0.148, 0.118, 0.084, -0.002],
    [1.2, 0.136, 0.097, 0.08, 0],
    [1.13, 0.127, 0.09, 0.078, 0],
    [1.06, 0.144, 0.094, 0.086, 0],
    [0.99, 0.165, 0.098, 0.103, 0],
    [0.935, 0.174, 0.096, 0.112, 0],
    [0.885, 0.16, 0.08, 0.106, 0],
    [0.845, 0.104, 0.056, 0.078, 0]
  ]
};

function torsoSkin(y) {
  if (y > 1.6) return [BONE.CHEST, BONE.HEAD, 1];
  if (y > 1.56) return [BONE.CHEST, BONE.HEAD, 0.65];
  if (y > 1.52) return [BONE.CHEST, BONE.HEAD, 0.2];
  if (y > 1.15) return [BONE.CHEST, BONE.CHEST, 0];
  if (y > 1.1) return [BONE.PELVIS, BONE.CHEST, 0.5];
  if (y > 1.03) return [BONE.PELVIS, BONE.CHEST, 0.15];
  return [BONE.PELVIS, BONE.PELVIS, 0];
}

// [y, rx, rzFront, rzBack, centreZ, keepInFarLod] around each leg's axis (x = +-HIP_X)
const LEG = {
  m: [
    [0.975, 0.054, 0.054, 0.054, 0, 1],
    [0.925, 0.062, 0.072, 0.075, 0, 0],
    [0.865, 0.083, 0.088, 0.091, 0.003, 1],
    [0.77, 0.078, 0.083, 0.083, 0.006, 0],
    [0.67, 0.071, 0.075, 0.073, 0.008, 1],
    [0.59, 0.064, 0.067, 0.064, 0.008, 0],
    [0.535, 0.058, 0.062, 0.058, 0.008, 1],
    [0.5, 0.056, 0.061, 0.056, 0.008, 1],
    [0.465, 0.054, 0.058, 0.056, 0.004, 1],
    [0.415, 0.054, 0.056, 0.06, 0, 0],
    [0.335, 0.053, 0.054, 0.061, -0.004, 1],
    [0.245, 0.051, 0.052, 0.054, -0.003, 0],
    [0.17, 0.051, 0.053, 0.053, 0, 1],
    [0.13, 0.052, 0.055, 0.053, 0.004, 0],
    [0.1, 0.044, 0.046, 0.044, 0.004, 1]
  ],
  f: [
    [0.975, 0.056, 0.056, 0.056, 0],
    [0.925, 0.066, 0.074, 0.08, 0],
    [0.865, 0.087, 0.087, 0.094, 0.003],
    [0.77, 0.078, 0.079, 0.08, 0.006],
    [0.67, 0.067, 0.069, 0.067, 0.008],
    [0.59, 0.057, 0.059, 0.057, 0.008],
    [0.535, 0.051, 0.055, 0.051, 0.008],
    [0.5, 0.049, 0.053, 0.049, 0.008],
    [0.465, 0.047, 0.051, 0.049, 0.004],
    [0.415, 0.047, 0.049, 0.054, 0],
    [0.335, 0.046, 0.047, 0.056, -0.004],
    [0.245, 0.04, 0.042, 0.045, -0.003],
    [0.17, 0.035, 0.037, 0.037, 0],
    [0.13, 0.034, 0.036, 0.035, 0.003],
    [0.1, 0.031, 0.033, 0.032, 0.003]
  ]
};

function legSkin(y, k) {
  const thigh = LIMB.thigh[k];
  const shin = LIMB.shin[k];
  const foot = LIMB.foot[k];
  // the hip bends over 0.75-0.95 m, below the jacket's hem, so the thigh tops stay inside the pelvis
  if (y > 0.95) return [BONE.PELVIS, thigh, 0.05];
  if (y > 0.9) return [BONE.PELVIS, thigh, 0.3];
  if (y > 0.84) return [BONE.PELVIS, thigh, 0.72];
  if (y > 0.74) return [BONE.PELVIS, thigh, 0.93];
  if (y > 0.55) return [thigh, thigh, 0];
  if (y > 0.52) return [thigh, shin, 0.12];
  if (y > 0.48) return [thigh, shin, 0.5];
  if (y > 0.44) return [thigh, shin, 0.88];
  if (y > 0.15) return [shin, shin, 0];
  if (y > 0.115) return [shin, foot, 0.25];
  return [shin, foot, 0.5];
}

// [distance along the arm from the shoulder, rx, rz, offset towards the body's side, offset forward, keepInFarLod]
const ARM = [
  [-0.022, 0.02, 0.026, -0.045, 0, 1],
  [-0.008, 0.034, 0.042, -0.03, 0, 0],
  [0.012, 0.046, 0.052, -0.014, 0, 1],
  [0.05, 0.049, 0.053, -0.002, 0, 0],
  [0.1, 0.049, 0.05, 0.002, 0, 1],
  [0.16, 0.048, 0.049, 0.001, 0.003, 0],
  [0.23, 0.044, 0.046, 0, 0, 1],
  [0.272, 0.042, 0.043, 0, -0.003, 0],
  [0.3, 0.041, 0.042, 0, -0.005, 1],
  [0.328, 0.042, 0.043, 0, -0.003, 0],
  [0.39, 0.043, 0.042, 0, 0, 1],
  [0.465, 0.038, 0.035, 0, 0, 0],
  [0.525, 0.034, 0.031, 0, 0, 1],
  [0.542, 0.036, 0.033, 0, 0, 1],
  [0.55, 0.028, 0.026, 0, 0, 1]
];
// [distance along the arm, thickness (across), width (front-back), offset forward, keepInFarLod]
const HAND = [
  [0.525, 0.023, 0.026, 0, 1],
  [0.555, 0.021, 0.03, 0.002, 0],
  [0.595, 0.023, 0.04, 0.004, 1],
  [0.64, 0.021, 0.042, 0.004, 0],
  [0.68, 0.017, 0.037, 0.002, 1],
  [0.712, 0.013, 0.028, 0, 0],
  [0.728, 0.008, 0.015, 0, 1]
];
const HAND_TWIST = 0.45; // relaxed hands: palms turned from facing the thighs towards the back

function armSkin(d, k) {
  const ua = LIMB.upperArm[k];
  const fa = LIMB.forearm[k];
  if (d < -0.03) return [BONE.CHEST, ua, 0.32];
  if (d < 0) return [BONE.CHEST, ua, 0.6];
  if (d < 0.06) return [BONE.CHEST, ua, 0.88];
  if (d < 0.26) return [ua, ua, 0];
  if (d < 0.29) return [ua, fa, 0.15];
  if (d < 0.315) return [ua, fa, 0.5];
  if (d < 0.36) return [ua, fa, 0.85];
  return [fa, fa, 0];
}

// [y, rx, rzFront, rzBack, centreZ, keepInFarLod]
const HEAD = {
  m: [
    [1.752, 0.018, 0.018, 0.02, -0.012, 1],
    [1.738, 0.056, 0.058, 0.064, -0.013, 0],
    [1.712, 0.078, 0.082, 0.092, -0.013, 1],
    [1.682, 0.087, 0.09, 0.102, -0.011, 0],
    [1.652, 0.088, 0.093, 0.103, -0.009, 1],
    [1.622, 0.084, 0.094, 0.098, -0.007, 0],
    [1.592, 0.078, 0.095, 0.09, -0.005, 1],
    [1.562, 0.071, 0.091, 0.078, -0.002, 0],
    [1.537, 0.063, 0.085, 0.066, 0.002, 1],
    [1.514, 0.052, 0.074, 0.054, 0.008, 0],
    [1.497, 0.03, 0.048, 0.032, 0.016, 1]
  ],
  f: [
    [1.748, 0.017, 0.017, 0.019, -0.012],
    [1.734, 0.053, 0.055, 0.061, -0.013],
    [1.709, 0.074, 0.078, 0.088, -0.013],
    [1.68, 0.083, 0.086, 0.097, -0.011],
    [1.651, 0.083, 0.089, 0.098, -0.009],
    [1.622, 0.079, 0.09, 0.093, -0.007],
    [1.594, 0.073, 0.09, 0.085, -0.005],
    [1.566, 0.066, 0.086, 0.073, -0.002],
    [1.543, 0.058, 0.08, 0.061, 0.002],
    [1.522, 0.046, 0.068, 0.049, 0.008],
    [1.507, 0.026, 0.042, 0.028, 0.014]
  ]
};

// Head profile at any height (for the hair shell): (round 3) on the same spline as the near head's rows
function headAt(table, y) {
  if (y >= table[0][0]) return table[0];
  if (y <= table[table.length - 1][0]) return table[table.length - 1];
  let lo = 0;
  let hi = table.length - 1;
  for (let it = 0; it < 30; it++) {
    const m = (lo + hi) / 2;
    if (headRowAt(table, m)[0] > y) lo = m;
    else hi = m;
  }
  return headRowAt(table, (lo + hi) / 2);
}

// (Mog City, 28 Oct: 1.625 + 0.07, was 1.62 + 0.055: a forehead between the brows & the hairline, the nape lower)
const hairlineY = (a) => 1.625 + 0.07 * Math.sin(a) - 0.005 * Math.cos(2 * a);

// (Mog City repair) the near hairline arches over the ears (the shell leaves them bare) and comes down behind them to the
// nape; the material's hairline (dressNear) follows the same curve
const EAR_A = 0.18; // the ear's centre, behind the side of the head (radians round from +x toward the back)
const hairlineNear = (a) => hairlineY(a) + 0.046 * (lobe(a, -EAR_A, 0.34) + lobe(a, Math.PI + EAR_A, 0.34));

// Hair shell over the scalp, from the crown to the hairline, `t` thick (thinning to a soft edge at the hairline);
// `lump` (near): the hair's thickness varies round the head in locks & masses, so its outline is not one smooth shell
function hairShellRing(table, f, t, n, xs = 1, line = hairlineY, lump = 0) {
  const crown = table[0][0];
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const y = crown + (line(a) - crown) * f;
    const [, rx, rzF, rzB, cz] = headAt(table, y);
    const p = new THREE.Vector3(Math.cos(a) * rx * xs, y, cz + Math.sin(a) * (Math.sin(a) >= 0 ? rzF : rzB));
    const lumps = lump * Math.sin(Math.PI * Math.min(1, f * 1.25)) * (0.6 * Math.sin(4 * a + 5.5 * f + 0.7) + 0.4 * Math.sin(7 * a - 3.1 * f + 2.3));
    const k = t * (1 - 0.9 * f * f) * (1 + lumps); // (Mog City: thinning to a 10% edge, was 25%: no helmet's rim at the hairline)
    const c = new THREE.Vector3(0, 1.635, -0.012);
    out.push(p.sub(c).multiplyScalar(1 + k / Math.max(0.05, p.length())).add(c));
  }
  return out;
}
// (repair) the shell's crown: a ring drawn in close round the top, so the shell closes in a dome (no flat disc)
function crownRing(ring) {
  const cx = ring.reduce((s, p) => s + p.x, 0) / ring.length;
  const cz = ring.reduce((s, p) => s + p.z, 0) / ring.length;
  return ring.map((p) => new THREE.Vector3(cx + (p.x - cx) * 0.14, p.y + 0.0035, cz + (p.z - cz) * 0.14));
}

// Long hair falling behind the shoulders: [y, rx, rzFront, rzBack, centreZ, keepInFarLod]
// (Mog City repair: rounder, narrowing down the back and tapering to ends that hang lower in the middle than at the
// sides, in uneven locks; the far level keeps four rows, as before)
// (its top lies inside the hair shell, meeting it where the shell is widest, so the two read as one head of hair)
const LONG_HAIR = [
  [1.7, 0.079, 0.05, 0.097, -0.012, 0],
  [1.665, 0.091, 0.05, 0.11, -0.012, 1],
  [1.62, 0.094, 0.04, 0.112, -0.016, 0],
  [1.57, 0.093, 0.032, 0.104, -0.026, 0],
  [1.51, 0.087, 0.03, 0.091, -0.04, 1],
  [1.46, 0.085, 0.03, 0.081, -0.052, 0],
  [1.415, 0.082, 0.028, 0.072, -0.06, 1],
  [1.38, 0.075, 0.025, 0.063, -0.066, 0],
  [1.355, 0.055, 0.019, 0.047, -0.07, 1]
];
// One ring of the long hair: `t` 0 at the top, 1 at the ends. Locks bulge round it (more toward the ends), the ends hang
// lower at the back than at the sides, and the last rows are uneven (the tips of the locks)
function longHairRing([y, rx, rzF, rzB, cz], t, n) {
  const ring = ringY(y, rx, rzF, rzB, cz, n, 2.05);
  const h = (i) => { const v = Math.sin(i * 91.7 + 13.1) * 43758.5453; return v - Math.floor(v); };
  return ring.map((p, i) => {
    const a = (i / n) * Math.PI * 2;
    const back = Math.max(0, -Math.sin(a));
    const lt = Math.max(0, (t - 0.2) / 0.8);
    const lock = 1 + 0.1 * lt * Math.sin(7 * a + 2.3 * t * 6) + 0.045 * lt * Math.sin(11 * a + 1.7);
    p.x *= lock;
    p.z = cz + (p.z - cz) * lock;
    const tt = Math.max(0, (t - 0.4) / 0.6);
    p.y += -0.03 * tt * tt * back ** 1.2 + 0.022 * tt * tt * Math.abs(Math.cos(a)) ** 2 + (h(i) - 0.5) * 0.03 * Math.max(0, t - 0.75) / 0.25;
    return p;
  });
}

// [z from the ankle, half width, top, sole, keepInFarLod] (relative to the ankle joint)
const SHOE = [
  [-0.088, 0.02, -0.02, -0.066, 1],
  [-0.078, 0.034, 0.016, -0.08, 0],
  [-0.05, 0.042, 0.036, -0.08, 1],
  [-0.01, 0.045, 0.032, -0.08, 0],
  [0.04, 0.048, 0.006, -0.08, 1],
  [0.09, 0.05, -0.022, -0.08, 0],
  [0.13, 0.051, -0.035, -0.08, 1],
  [0.165, 0.048, -0.044, -0.08, 0],
  [0.192, 0.039, -0.05, -0.079, 1],
  [0.208, 0.022, -0.056, -0.075, 1]
];

function shoeRing(cx, z, hw, top, sole, n) {
  const out = [];
  const mid = sole + (top - sole) * 0.38;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const x = Math.sign(c) * Math.abs(c) ** 0.6 * hw;
    const y = s >= 0 ? mid + (top - mid) * s ** 0.85 : mid - (mid - sole) * Math.abs(s) ** 0.35;
    out.push(new THREE.Vector3(cx + x, ANKLE_H + y, z));
  }
  return out;
}

function shoeSkin(z, k) {
  const foot = LIMB.foot[k];
  const toe = LIMB.toe[k];
  if (z < 0.07) return [foot, foot, 0];
  if (z < 0.11) return [foot, toe, 0.12];
  if (z < 0.15) return [foot, toe, 0.55];
  return [toe, toe, 0];
}

// (Mog City, 28 Oct) The near head: rows through the brows, eyes, nose, lips & chin (fractional rows of HEAD, so the
// female target lines up), its columns gathered round the face, and a continuous relief: brow ridge, eye sockets & the
// eyeballs in them, the nose's bridge, tip & wings, cheekbones, lips, chin, the jaw's angle, ears
const HEAD_NEAR_ROWS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.25, 4.55, 4.83, 5.1, 5.45, 5.8, 6.05, 6.25, 6.47, 6.72, 7, 7.22, 7.5, 7.75, 8, 8.4, 8.8, 9.2, 9.6, 10];
const HEAD_NEAR_COLUMNS = 36;
const HEAD_NEAR_XS = 0.93; // (a head narrower than it is deep, as people's are; its hair shell with it)
// (round 3) a Catmull-Rom spline through the profile's rows (it was straight between them: a ridge at each row, the
// bald heads lumpy at the back); the hair shell follows the same curve (headAt)
function headRowAt(table, r) {
  const n = table.length;
  const i = Math.max(0, Math.min(Math.floor(r), n - 2));
  const t = r - i;
  const P = (k) => table[Math.max(0, Math.min(n - 1, k))];
  const a = P(i - 1);
  const b = P(i);
  const c = P(i + 1);
  const d = P(i + 2);
  return b.map((v, k) => 0.5 * (2 * v + (c[k] - a[k]) * t + (2 * a[k] - 5 * v + 4 * c[k] - d[k]) * t * t + (3 * v - a[k] - 3 * c[k] + d[k]) * t * t * t));
}
function faceRelief(female) {
  const k = female ? 0.75 : 1;
  const F = Math.PI / 2;
  const g = (y, y0, s) => Math.exp(-(((y - y0) / s) ** 2));
  const pair = (a, d, w) => lobe(a, F - d, w) + lobe(a, F + d, w);
  return (y) => (a) => {
    let b = 0;
    // the nose: its bridge rising to the tip, tucking back under it, wider at the bottom; its wings
    const nt = Math.min(1, Math.max(0, (1.64 - y) / 0.051));
    let an = (0.0035 + 0.0155 * nt ** 1.6) * (female ? 0.88 : 1);
    if (y < 1.589) an *= Math.exp(-(((1.589 - y) / 0.0098) ** 2));
    if (y > 1.642) an *= Math.exp(-(((y - 1.642) / 0.006) ** 2));
    b += an * lobe(a, F, 0.095 + 0.07 * nt * nt);
    b += 0.0062 * g(y, 1.5815, 0.0055) * pair(a, 0.19, 0.075);
    // the brow ridge & between the brows; the eye sockets, the eyeballs in them; cheekbones & the hollow below
    b += k * 0.0045 * g(y, 1.6465, 0.0065) * pair(a, 0.33, 0.3) + 0.0018 * g(y, 1.642, 0.006) * lobe(a, F, 0.12);
    b += -0.0046 * g(y, 1.6285, 0.0075) * pair(a, 0.36, 0.17) + 0.0019 * g(y, 1.627, 0.0042) * pair(a, 0.36, 0.1);
    b += 0.0055 * g(y, 1.603, 0.012) * pair(a, 0.74, 0.28) - 0.0009 * g(y, 1.566, 0.014) * pair(a, 0.78, 0.3);
    // the lips (fuller on women), the line between them, the dip under the lower lip, the chin, the jaw's angle
    b += 0.0048 * g(y, 1.5565, 0.0045) * lobe(a, F, 0.24) - 0.0018 * g(y, 1.5492, 0.0022) * lobe(a, F, 0.24);
    b += (female ? 0.0052 : 0.0045) * g(y, 1.5428, 0.0045) * lobe(a, F, 0.2) - 0.0018 * g(y, 1.5355, 0.0035) * lobe(a, F, 0.2);
    b += 0.0066 * g(y, 1.521, 0.009) * lobe(a, F, female ? 0.24 : 0.3);
    b += k * 0.0042 * g(y, 1.533, 0.012) * pair(a, 1.2, 0.3);
    // the ears, a little behind the sides, their tops leaning back, the rim standing out more than the lobe
    const ey = y > 1.646 ? g(y, 1.646, 0.006) : y < 1.576 ? g(y, 1.576, 0.007) : 1;
    const ea = EAR_A - 0.06 + (y - 1.61) * 1.5;
    const eh = 0.0128 * (0.72 + 0.28 * Math.min(1, Math.max(0, (y - 1.58) / 0.05)));
    b += eh * ey * (lobe(a, -ea, 0.19) + lobe(a, Math.PI + ea, 0.19));
    return b;
  };
}
// A head ring with its columns gathered round the face (the front, a = PI/2): denser there, sparser at the back
function headRingNear(y, rx, rzF, rzB, cz, n, bump) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const a = t + 0.5 * Math.cos(t);
    const s = Math.sin(a);
    let x = Math.cos(a) * rx;
    let z = s * (s >= 0 ? rzF : rzB);
    const b = bump(a);
    if (b) {
      const r = Math.hypot(x, z) || 1;
      x += (x / r) * b;
      z += (z / r) * b;
    }
    out.push(new THREE.Vector3(x, y, cz + z));
  }
  return out;
}

// (Mog City, 28 Oct) The near hand: the palm to the knuckles, four fingers in a relaxed curl toward the palm (more in
// the outer ones), the thumb along the palm's front edge. [distance along the arm, thickness, width, offset forward]
const PALM_NEAR = [
  [0.525, 0.02, 0.027, 0],
  [0.553, 0.0165, 0.032, 0.002],
  [0.585, 0.0148, 0.039, 0.004],
  [0.612, 0.0138, 0.042, 0.004],
  [0.63, 0.0118, 0.041, 0.003],
  [0.641, 0.0097, 0.038, 0.002],
  [0.648, 0.0074, 0.031, 0.002],
  [0.6525, 0.0048, 0.019, 0.002]
];
// [offset across the palm (forward, the thumb's side), the knuckle's distance along the arm, length, radius, curl]
const FINGERS = [
  [0.025, 0.612, 0.088, 0.0088, 0.32],
  [0.0085, 0.615, 0.097, 0.0092, 0.4],
  [-0.0085, 0.613, 0.091, 0.0087, 0.46],
  [-0.0245, 0.606, 0.073, 0.0076, 0.54]
];
// (repair: tapering to the tip, a little fuller over the two joints)
const FINGER_ROWS = [
  [0, 0.94],
  [0.2, 1.0],
  [0.4, 0.92],
  [0.47, 0.96],
  [0.64, 0.84],
  [0.71, 0.87],
  [0.88, 0.78],
  [1, 0.42]
];
// One finger's rows from shoulder `sh` down the arm `dir`: across the palm along eZ, curling toward the palm (pN)
function fingerRows(sh, dir, eZ, pN, [oz, d0, len, r, curl], k, s = 1) {
  return FINGER_ROWS.map(([t, rr]) => {
    const c = sh.clone().addScaledVector(dir, d0 * (s < 1 ? 0.985 : 1)).addScaledVector(eZ, oz * s);
    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const phi = curl * 2.2 * Math.max(0, ((i + 0.5) / steps) * t - 0.18) / 0.82;
      c.addScaledVector(dir, (Math.cos(phi) * len * s * t) / steps).addScaledVector(pN, (Math.sin(phi) * len * s * t) / steps);
    }
    const phi = (curl * 2.2 * Math.max(0, t - 0.18)) / 0.82;
    const fd = dir.clone().multiplyScalar(Math.cos(phi)).addScaledVector(pN, Math.sin(phi)).normalize();
    return limbRing(c, fd, r * rr * s, r * rr * 1.06 * s, 8);
  });
}

const _geometryCache = new Map();

/**
 * The skinned person: detail 1 near (~3000 vertices: Mog City's sculpted head & fingers), 0 far (~600 vertices). Attributes: position & normal (male bind
 * pose), skin (two bones & the weight of the second, part id), extra (girth direction, u along the loft) and the
 * femaleDelta & hairDelta morph targets.
 */
function buildPersonGeometry(detail = 1) {
  if (_geometryCache.has(detail)) return _geometryCache.get(detail);
  const hi = detail > 0;
  const keep = (row, flagIndex) => hi || row[flagIndex] === 1;
  const B = new BodyBuilder();
  const nTorso = hi ? 16 : 8;
  const nLeg = hi ? 12 : 6;
  const nArm = hi ? 10 : 6;
  const nHand = hi ? 8 : 4;
  const nHead = hi ? 28 : 8; // (the near head has HEAD_NEAR_COLUMNS; this is its hair shell's)
  const nShoe = hi ? 12 : 6;

  // Torso & neck: a soft-cornered chest (superellipse), with a hint of bust on the female target
  const bust = (a) => 0.011 * (lobe(a, Math.PI / 2 - 0.5, 0.38) + lobe(a, Math.PI / 2 + 0.5, 0.38));
  const torsoRows = [];
  TORSO.m.forEach((m, i) => {
    if (!keep(m, 5)) return;
    const f = TORSO.f[i];
    const ex = m[0] > 1.5 ? 2 : m[0] > 1.0 ? 2.35 : 2.15;
    const fBump = m[0] < 1.37 && m[0] > 1.25 ? bust : null;
    torsoRows.push({
      pts: ringY(m[0], m[1], m[2], m[3], m[4], nTorso, ex),
      ptsF: ringY(f[0], f[1], f[2], f[3], f[4], nTorso, ex, fBump),
      skin: torsoSkin(m[0]),
      axis: new THREE.Vector3(0, m[0], m[4])
    });
  });
  B.loft(torsoRows, PART.BODY, {
    capEnd: true,
    flattenBelow: 0.95,
    // (repair, near) the neck where it meets the head: no upward tilt, so it shades as the head's lower side does
    tweak: hi ? (y, n) => (y > 1.495 && y < 1.62 && n.y > 0 ? ((n.y *= y > 1.52 ? 0.25 : 0.6), true) : false) : null
  });

  // Trouser legs
  SIDES.forEach((side, k) => {
    const rows = [];
    LEG.m.forEach((m, i) => {
      if (!keep(m, 5)) return;
      const f = LEG.f[i];
      const cx = side * HIP_X;
      rows.push({
        pts: ringY(m[0], m[1], m[2], m[3], m[4], nLeg, 2, null, cx),
        ptsF: ringY(f[0], f[1], f[2], f[3], f[4], nLeg, 2, null, cx),
        skin: legSkin(m[0], k),
        axis: new THREE.Vector3(cx, m[0], m[4])
      });
    });
    B.loft(rows, PART.LEG, { capStart: true, capEnd: true });
  });

  // Sleeves & hands, along each arm's bind direction (female arms: slimmer & from narrower shoulders)
  SIDES.forEach((side, k) => {
    const dir = new THREE.Vector3(side * Math.sin(ARM_BIND_ABDUCTION), -Math.cos(ARM_BIND_ABDUCTION), 0);
    const shM = new THREE.Vector3(...shoulderJoint(false));
    const shF = new THREE.Vector3(...shoulderJoint(true));
    shM.x *= side;
    shF.x *= side;
    const at = (sh, d, ox, oz) => sh.clone().addScaledVector(dir, d).add(new THREE.Vector3(side * ox, 0, oz));
    const sleeve = [];
    for (const r of ARM) {
      if (!keep(r, 5)) continue;
      const [d, rx, rz, ox, oz] = r;
      const c = at(shM, d, ox, oz);
      sleeve.push({
        pts: limbRing(c, dir, rx, rz, nArm),
        ptsF: limbRing(at(shF, d, ox * 0.9, oz), dir, rx * 0.84, rz * 0.84, nArm),
        skin: armSkin(d, k),
        axis: c
      });
    }
    B.loft(sleeve, PART.ARM, {
      capStart: true,
      capEnd: true,
      tweak: hi ? (y, n) => (y > 1.4 && n.y > 0 ? ((n.y *= y > 1.425 ? 0.2 : 0.5), true) : false) : null
    });

    const hand = [];
    const twist = -side * HAND_TWIST;
    for (const r of hi ? PALM_NEAR : HAND) {
      if (!keep(r, 4)) continue;
      const [d, rx, rz, oz] = r;
      hand.push({
        pts: limbRing(at(shM, d, 0, oz), dir, rx, rz, nHand, 2, twist),
        ptsF: limbRing(at(shF, d * 0.985, 0, oz), dir, rx * 0.88, rz * 0.88, nHand, 2, twist),
        skin: [LIMB.forearm[k], LIMB.forearm[k], 0],
        axis: null
      });
    }
    B.loft(hand, PART.HAND, { capStart: true, capEnd: true });

    if (hi) {
      // Thumb, along the front edge of the (turned) palm
      const thumb = [
        [0.556, 0.022, 0.0122],
        [0.585, 0.032, 0.0114],
        [0.612, 0.039, 0.0098],
        [0.632, 0.043, 0.0091],
        [0.65, 0.044, 0.0084],
        [0.665, 0.042, 0.007],
        [0.676, 0.039, 0.0042]
      ].map(([d, oz, r]) => {
        const off = new THREE.Vector3(side * -0.006, 0, oz).applyAxisAngle(_yAxis, twist);
        return {
          pts: limbRing(shM.clone().addScaledVector(dir, d).add(off), dir, r, r * 0.86, 8),
          ptsF: limbRing(shF.clone().addScaledVector(dir, d * 0.985).addScaledVector(off, 0.9), dir, r * 0.88, r * 0.86 * 0.88, 8),
          skin: [LIMB.forearm[k], LIMB.forearm[k], 0],
          axis: null
        };
      });
      B.loft(thumb, PART.HAND, { capStart: true, capEnd: true });
      // (Mog City) the fingers, from the knuckles, curling toward the palm
      const qArm = new THREE.Quaternion().setFromUnitVectors(_down, dir);
      const eZ = new THREE.Vector3(0, 0, 1).applyAxisAngle(_yAxis, twist).applyQuaternion(qArm);
      const pN = new THREE.Vector3(-side, 0, 0).applyAxisAngle(_yAxis, twist).applyQuaternion(qArm);
      for (const f of FINGERS) {
        const m = fingerRows(shM, dir, eZ, pN, f, k);
        const fe = fingerRows(shF, dir, eZ, pN, f, k, 0.9);
        B.loft(m.map((pts, i) => ({ pts, ptsF: fe[i], skin: [LIMB.forearm[k], LIMB.forearm[k], 0], axis: null })), PART.HAND, { capEnd: true });
      }
    }
  });

  // Head: near, sculpted (faceRelief, the columns gathered round the face); far, the plain rings
  const headRows = [];
  if (hi) {
    const reliefM = faceRelief(false);
    const reliefF = faceRelief(true);
    for (const r of HEAD_NEAR_ROWS) {
      const m = headRowAt(HEAD.m, r);
      const f = headRowAt(HEAD.f, r);
      headRows.push({
        pts: headRingNear(m[0], m[1] * HEAD_NEAR_XS, m[2], m[3], m[4], HEAD_NEAR_COLUMNS, reliefM(m[0])),
        ptsF: headRingNear(f[0], f[1] * HEAD_NEAR_XS, f[2], f[3], f[4], HEAD_NEAR_COLUMNS, reliefF(m[0])),
        skin: [BONE.HEAD, BONE.HEAD, 0],
        axis: null
      });
    }
    // (repair) the crown closes in a dome (a bald head shows it)
    headRows.unshift({ pts: crownRing(headRows[0].pts), ptsF: crownRing(headRows[0].ptsF), skin: [BONE.HEAD, BONE.HEAD, 0], axis: null });
  } else {
    HEAD.m.forEach((m, i) => {
      if (!keep(m, 5)) return;
      const f = HEAD.f[i];
      headRows.push({
        pts: ringY(m[0], m[1], m[2], m[3], m[4], nHead, 2),
        ptsF: ringY(f[0], f[1], f[2], f[3], f[4], nHead, 2),
        skin: [BONE.HEAD, BONE.HEAD, 0],
        axis: null
      });
    });
  }
  B.loft(headRows, PART.HEAD, { capStart: true, capEnd: true, smooth: hi ? 1 : 0, lift: hi ? { below: 1.66, k: (y) => (y < 1.575 ? lerp(0.06, 0.3, smooth(1.535, 1.575, y)) : lerp(0.3, 1, smooth(1.59, 1.66, y))) } : null });

  // Hair shell (volume morph) & long hair (length morph, folded away inside the head when short)
  // (repair, near) the shell closes in a dome at the crown, arches over the ears and lies in locks & masses
  const xs = hi ? HEAD_NEAR_XS : 1;
  const line = hi ? hairlineNear : hairlineY;
  const shellRing = (table, f, t, lump) => (f === 0 ? crownRing(hairShellRing(table, 0, t, nHead, xs, line)) : hairShellRing(table, f, t, nHead, xs, line, lump));
  const shell = (hi ? [0, 0.04, 0.12, 0.25, 0.45, 0.68, 0.86, 1] : [0.04, 0.45, 1]).map((f) => ({
    pts: shellRing(HEAD.m, f, 0.006, hi ? 0.25 : 0),
    ptsF: shellRing(HEAD.f, f, 0.006, hi ? 0.25 : 0),
    ptsH: shellRing(HEAD.m, f, 0.022, hi ? 0.3 : 0),
    skin: [BONE.HEAD, BONE.HEAD, 0],
    axis: null
  }));
  B.loft(shell, PART.HAIR, { capStart: true });
  const nLong = hi ? 18 : 6;
  const longKept = LONG_HAIR.filter((r) => keep(r, 5));
  const longRows = longKept.map((r, i) => ({
    pts: ringY(1.64, 0.02, 0.02, 0.02, -0.03, nLong),
    ptsL: longHairRing(r, LONG_HAIR.indexOf(r) / (LONG_HAIR.length - 1), nLong),
    skin: r[0] > 1.56 ? [BONE.HEAD, BONE.HEAD, 0] : r[0] > 1.47 ? [BONE.HEAD, BONE.CHEST, 0.4] : [BONE.HEAD, BONE.CHEST, 0.8],
    axis: null
  }));
  // (the inner side, toward the neck, is lit from below too: no dark slab from low cameras)
  B.loft(longRows, PART.LONG_HAIR, { capEnd: true, lift: hi ? { below: 1.7, k: 0.25 } : null });

  // Shoes, heel to toe (the toes bend at the ball of the foot)
  SIDES.forEach((side, k) => {
    const rows = SHOE.filter((r) => keep(r, 4)).map(([z, hw, top, sole]) => ({
      pts: shoeRing(side * HIP_X, z, hw, top, sole, nShoe),
      ptsF: shoeRing(side * HIP_X, z * 0.93, hw * 0.88, top * 0.92, sole, nShoe),
      skin: shoeSkin(z, k),
      axis: null
    }));
    B.loft(rows, PART.SHOE, { capStart: true, capEnd: true });
  });

  const geo = B.build();
  _geometryCache.set(detail, geo);
  return geo;
}

// ============================================================================
// 3. TSL MATERIAL: GPU SKINNING + PROCEDURAL CLOTHES
// ============================================================================
// (Mog City, 28 Oct) The palettes and each person's outfit are shared by both levels of detail, so nobody changes
// clothes crossing farDistance; the far level keeps its few masks, the near one is dressed in detail (dressNear).
// Skin tones (sRGB), fair to deep, each nudged warm, olive or rosy per person
// (Mog City repair: the two fairest a little deeper & rosier, so sunlit faces do not go porcelain-white under ACES;
// round 3: a little more so, and warmer, they still read porcelain in the rally's full sun; round 3 repair: a touch more)
const SKIN_COLORS = [0xb4876f, 0xb0846b, 0xb68a6e, 0xab7d62, 0x9c6f54, 0x8b5f45, 0x784f38, 0x65402c, 0x513223, 0x3e261a];
// Hair, drawn for the skin tone (Mog City repair): the fairer third any natural colour (blond & red among them); the
// middle third black to mid brown; the deeper tones black & near-black browns, an occasional honey-brown dye
const HAIR_COLORS = [0x17120f, 0x2c2019, 0x3d2c1e, 0x584022, 0x7a5a36, 0xa08050, 0x5e3020, 0x2a2624];
const HAIR_COLORS_MID = [0x17120f, 0x1b1511, 0x201813, 0x261c16, 0x2c2019, 0x3d2c1e, 0x1a1411, 0x4a3524];
const HAIR_COLORS_DEEP = [0x15110f, 0x181311, 0x1b1612, 0x201914, 0x16120f, 0x241c16, 0x191411, 0x2a2019, 0x5a3e27];
const GREY_HAIR = 0x9c968e;
// New York outerwear: black, navy, charcoal, camel, olive, oxblood, grey, brown (women: black, camel, navy, burgundy,
// cream, olive, grey, plum); knits, hoodies & tees from TOP_COLORS
// (round 3: a few more of each, slate, taupe, rust, teal, stone, oat, steel, so a group of four rarely shares one)
const COAT_COLORS = [0x1c1d21, 0x26324a, 0x37383b, 0x7f6244, 0x4a4d38, 0x4f2a2a, 0x5f605d, 0x5a4636, 0x3b4a5c, 0x6b5a48];
const COAT_COLORS_F = [0x1d1b20, 0xa98b66, 0x2a3854, 0x6e2530, 0xc4bcad, 0x4d5541, 0x7d7b78, 0x5b3646, 0x8a5a44, 0x2f4a4a, 0x9b8e7e];
const TOP_COLORS = [0xe4e2dc, 0x1d1d20, 0x88898a, 0x2a3450, 0x5b5f45, 0x6c2a33, 0xb5a993, 0x3b4d5e, 0x7a3b2e, 0x4a6a7a, 0xd8c9a8];
const SHIRT_COLORS = [0xe9e7e1, 0xbcc8da, 0xd2cbbb, 0x9ba8b9];
const LEG_COLORS = [0x22242c, 0x2d4767, 0x1e2a40, 0x51473d, 0x7a705f, 0x252526]; // (1 & 2 are denim)
const LEG_COLORS_F = [0x1c1c22, 0x30496b, 0x22304a, 0x46413b, 0xcbc4b7, 0x4a2a2e]; // (1 & 2 are denim)
const IRIS_COLORS = [0x2a1a10, 0x3a2414, 0x4b301c, 0x5c4828, 0x4c5846, 0x4b6074];
const LIP_COLORS = [0x8a2c36, 0x74374a, 0xa86d62, 0x93483f];
const TIE_COLORS = [0x22304e, 0x5a1f2a, 0x2c3a2e, 0x4a4a52];

// Branchless TSL palette selector from an array of hex colors and a [0..1) hash value
function pickColorFromPalette(hexArray, tNode) {
  const n = hexArray.length;
  const scaled = tNode.mul(n);
  let acc = color(hexArray[0]);
  for (let i = 1; i < n; i++) {
    acc = mix(acc, color(hexArray[i]), step(float(i), scaled));
  }
  return acc;
}

// v rotated by unit quaternion q
const qrot = (q, v) => v.add(cross(q.xyz, cross(q.xyz, v).add(v.mul(q.w))).mul(2.0));

// One person's looks from their seed (info: seed, female, girth, hair): skin, hair, the outfit's colours & kind
function personLooks(info) {
  const lane = (salt) => fract(sin(info.x.add(salt).mul(12.9898)).mul(43758.5453));
  const female = info.y;
  const under = lane(19.0).sub(0.5).mul(0.08);
  const skinT = lane(17.0);
  const skin = pickColorFromPalette(SKIN_COLORS, skinT).mul(vec3(under.add(1.0), float(1.0), float(1.0).sub(under)));
  // (repair) hair colour for the skin tone; grey only on the older ones (lane 37 < 0.1 are among the lined faces)
  const hairLane = lane(3.0);
  const hairBase = mix(
    mix(pickColorFromPalette(HAIR_COLORS, hairLane), pickColorFromPalette(HAIR_COLORS_MID, hairLane), step(0.3, skinT)),
    pickColorFromPalette(HAIR_COLORS_DEEP, hairLane),
    step(0.6, skinT)
  );
  const grey = step(lane(37.0), 0.1);
  const hair = mix(hairBase, color(GREY_HAIR), grey.mul(0.62));
  // what they wear on top: a casual zip coat (half of them puffers), a tailored jacket, a knit, a hoodie or a tee
  const st = lane(89.0);
  const zip = step(st, 0.28);
  const tailored = step(0.28, st).mul(step(st, 0.6));
  const knit = step(0.6, st).mul(step(st, 0.8));
  const hoodie = step(0.8, st).mul(step(st, 0.9));
  const tee = step(0.9, st);
  // (round 3) each their own shade of the palette's colour (lighter or darker, a little warmer or cooler), so two people
  // drawing the same coat or trousers do not match
  const shade = (c, salt) => {
    const w = lane(salt + 0.5).sub(0.5).mul(0.14);
    return c.mul(lane(salt).mul(0.38).add(0.81)).mul(vec3(w.add(1.0), float(1.0), float(1.0).sub(w)));
  };
  const coat = shade(
    mix(
      mix(pickColorFromPalette(COAT_COLORS, lane(29.0)), pickColorFromPalette(COAT_COLORS_F, lane(29.0)), female),
      pickColorFromPalette(TOP_COLORS, lane(29.0)),
      knit.add(hoodie).add(tee)
    ),
    101.0
  );
  const shirt = pickColorFromPalette(SHIRT_COLORS, lane(71.0));
  const legLane = lane(47.0);
  const legs = shade(mix(pickColorFromPalette(LEG_COLORS, legLane), pickColorFromPalette(LEG_COLORS_F, legLane), female), 103.0);
  const denim = step(1 / 6, legLane).mul(step(legLane, 0.5));
  const bald = step(lane(41.0), 0.08).mul(float(1.0).sub(female));
  const puffer = zip.mul(step(lane(53.0), 0.5));
  // (repair) a beard or stubble (men), shared by both levels so a beard does not vanish at farDistance
  const fh = lane(59.0);
  const beard = step(0.74, fh).mul(float(1.0).sub(female));
  const stubble = step(0.42, fh).mul(step(fh, 0.74)).mul(float(1.0).sub(female));
  return { lane, female, skin, skinT, hair, hairBase, grey, coat, shirt, legs, denim, tailored, zip, knit, hoodie, tee, puffer, bald, beard, stubble };
}

/**
 * Material for one crowd mesh. `pose` is its storage buffer (STRIDE vec4s per instance). The vertex stage morphs the
 * bind pose (girth, female, hair) and skins it with two bones; the fragment stage dresses the person from their seed:
 * skin tone, hair & hairline, eyes, brows & mouth, a tailored jacket (lapels, shirt V), casual coat (zip, hem,
 * collar), knit, hoodie or tee, cuffs, trousers, sneakers or leather shoes with soles & laces. `detail` 1 (the near
 * level, Mog City 28 Oct) adds the face (eye whites & irises, lids & lashes, brows, lips, nostrils, cheek & socket
 * shading, stubble & beards, a soft hairline, sideburns), hair strands, fabric (weave, knit, heather, folds, seams,
 * stitching, pockets, buttons, ties, belts), hands (palms, nails) and a per-person jaw & nose.
 */
function createPersonMaterial(pose, detail = 1) {
  const mat = new THREE.MeshStandardNodeMaterial({ metalness: 0 });
  const base = int(instanceIndex).mul(STRIDE);
  const info = pose.element(base.add(STRIDE - 1)); // seed, female, girth, hair

  mat.positionNode = Fn(() => {
    const skin = attribute('skin', 'vec4');
    const extra = attribute('extra', 'vec3');
    const q0 = attribute('position', 'vec3');
    // hair volume on the shell (part 6), hair length on the long hair (part 7); none on a bald head
    const laneV = (salt) => fract(sin(info.x.add(salt).mul(12.9898)).mul(43758.5453));
    const baldV = step(laneV(41.0), 0.08).mul(float(1.0).sub(info.y));
    const hairAmount = mix(clamp(info.w.mul(2.0), 0.0, 1.0), clamp(info.w.mul(2.0).sub(1.0), 0.0, 1.0), step(PART.LONG_HAIR - 0.5, skin.w))
      .mul(float(1.0).sub(baldV));
    const p = q0
      .add(vec3(extra.x, 0.0, extra.y).mul(info.z.sub(1.0)))
      .add(attribute('femaleDelta', 'vec3').mul(info.y))
      .add(attribute('hairDelta', 'vec3').mul(hairAmount))
      .toVar();
    if (detail) {
      // (near) each their own face: the jaw wider or narrower (fuller with a heavier build), the nose longer or shorter
      const head = step(abs(skin.w.sub(PART.HEAD)), 0.25);
      const lower = smoothstep(1.61, 1.53, q0.y);
      const jaw = laneV(43.0).sub(0.5).mul(0.08).add(info.z.sub(1.0).mul(0.4));
      const noseM = smoothstep(0.022, 0.006, abs(q0.x)).mul(smoothstep(1.57, 1.582, q0.y)).mul(smoothstep(1.646, 1.628, q0.y)).mul(smoothstep(0.076, 0.092, q0.z));
      p.x.assign(p.x.mul(jaw.mul(lower).mul(head).add(1.0)));
      p.z.assign(p.z.add(noseM.mul(head).mul(laneV(67.0).sub(0.45).mul(0.007))));
      // (repair) a bald head's thin shell sinks inside the head, so the head's own skin shows (no edge line round it)
      const sink = step(abs(skin.w.sub(PART.HAIR)), 0.25).mul(baldV);
      const hc = vec3(0.0, 1.635, -0.012);
      p.assign(mix(p, p.sub(hc).mul(0.88).add(hc), sink));
    }
    const n = attribute('normal', 'vec3').toVar();
    // (Mog City, round 3) the wrist: the hand turns at the wrist toward the ground. It has no bone of its own: its
    // vertices turn about the wrist before skinning, by the forearm's own rotation, so a raised or outstretched arm's
    // hand is not a rigid stick on the forearm. It flexes palm-ward or back (up to ~22 degrees, the forearm level) more
    // than it tips to the side; with the forearm hanging, not at all. The wrist's skin bends over 4 cm.
    {
      const hand = step(abs(skin.w.sub(PART.HAND)), 0.25);
      const sd = float(1.0).sub(step(4.5, skin.x).mul(2.0)); // +1 the left hand (forearm bone 4), -1 the right (6)
      const dB = vec3(sd.mul(Math.sin(ARM_BIND_ABDUCTION)), -Math.cos(ARM_BIND_ABDUCTION), 0.0);
      const sh = mix(vec3(0.185, 1.43, -0.015), vec3(0.165, 1.415, -0.015), info.y).mul(vec3(sd, 1.0, 1.0));
      const qf = pose.element(base.add(int(skin.x).mul(2)));
      const g = qrot(vec4(qf.xyz.negate(), qf.w), vec3(0.0, -1.0, 0.0)); // the ground's way, in the forearm's frame
      const fAx = normalize(cross(dB, normalize(vec3(sd.mul(-0.9), 0.0, -0.43)))); // flexing, toward the palm
      const dAx = cross(fAx, dB); // tipping to the side
      const rv = cross(dB, g);
      const wgt = smoothstep(0.535, 0.575, dot(p.sub(sh), dB)).mul(hand);
      const tv = fAx.mul(dot(rv, fAx).mul(0.38)).add(dAx.mul(dot(rv, dAx).mul(0.14))).mul(wgt);
      const ang = length(tv);
      const k = tv.div(max(ang, 1e-5));
      const c = cos(ang);
      const s = sin(ang);
      const W = sh.add(dB.mul(mix(float(0.555), float(0.547), info.y)));
      const v = p.sub(W);
      p.assign(W.add(v.mul(c)).add(cross(k, v).mul(s)).add(k.mul(dot(k, v)).mul(float(1.0).sub(c))));
      n.assign(n.mul(c).add(cross(k, n).mul(s)).add(k.mul(dot(k, n)).mul(float(1.0).sub(c))));
    }
    if (detail) {
      // (round 3 repair) the hair shell's last cm shaded as the head under it (its normal eased to the head's, out from
      // the head's centre), so its thin rim does not catch the light as a line over the painted hairline
      const shellN = step(abs(skin.w.sub(PART.HAIR)), 0.25).mul(smoothstep(0.8, 1.0, extra.z));
      n.assign(normalize(mix(n, normalize(q0.sub(vec3(0.0, 1.635, -0.012))), shellN)));
    }
    const w = skin.z;
    const ia = base.add(int(skin.x).mul(2));
    const ib = base.add(int(skin.y).mul(2));
    const qa = pose.element(ia);
    const ta = pose.element(ia.add(1));
    const qb = pose.element(ib);
    const tb = pose.element(ib.add(1));
    normalLocal.assign(normalize(mix(qrot(qa, n), qrot(qb, n), w)));
    return mix(qrot(qa, p).mul(ta.w).add(ta.xyz), qrot(qb, p).mul(tb.w).add(tb.xyz), w);
  })();

  const vInfo = varying(info, 'vPersonInfo');
  if (detail) dressNear(mat, vInfo);
  else dressFar(mat, vInfo);
  return mat;
}

const isPart = (partId, id) => step(abs(partId.sub(id)), 0.25);
const partOf = () => attribute('skin', 'vec4').w;

// The far level (beyond farDistance): a few masks, as Slop New York dressed everyone
function dressFar(mat, vInfo) {
  mat.colorNode = Fn(() => {
    const L = personLooks(vInfo);
    const partId = partOf();
    const female = L.female;
    const q = attribute('position', 'vec3').toVar();
    const along = attribute('extra', 'vec3').z;

    const skinCol = L.skin.toVar();
    const hairCol = L.hair.toVar();
    const coatCol = L.coat.toVar();
    const shirtCol = L.shirt;
    const legsCol = L.legs;

    // Head: skin, hairline (none for the bald), eyes, brows, lips
    const hd = normalize(vec2(q.x, q.z.add(0.01)));
    const bald = L.bald;
    const hairline = hd.y.mul(0.07).add(1.625).sub(hd.x.mul(hd.x).sub(hd.y.mul(hd.y)).mul(0.005)).add(bald.mul(0.3));
    const hairMask = smoothstep(hairline.sub(0.004), hairline.add(0.004), q.y);
    const front = smoothstep(0.06, 0.08, q.z);
    const eyeX = abs(abs(q.x).sub(0.031));
    const eyes = smoothstep(0.011, 0.006, eyeX).mul(smoothstep(0.0055, 0.002, abs(q.y.sub(1.627)))).mul(front);
    const brows = smoothstep(0.016, 0.01, eyeX).mul(smoothstep(0.0035, 0.0012, abs(q.y.sub(1.646)))).mul(front);
    const mouth = smoothstep(0.022, 0.014, abs(q.x)).mul(smoothstep(0.0045, 0.0015, abs(q.y.sub(1.549)))).mul(front);
    const faceCol = mix(
      skinCol.mul(float(1.0).sub(eyes.mul(0.7)).sub(brows.mul(0.45))),
      skinCol.mul(color(0xb06a5c)).mul(1.15),
      mouth.mul(0.7)
    );
    // (repair) a beard, as the near level draws it (a few masks: below the cheek line, off the lips)
    const yBf = mix(float(1.566), float(1.604), smoothstep(0.026, 0.078, abs(q.x)));
    const beardF = smoothstep(yBf.add(0.004), yBf.sub(0.008), q.y).mul(smoothstep(-0.03, -0.005, q.z)).mul(float(1.0).sub(mouth)).mul(L.beard);
    const headCol = mix(mix(faceCol, hairCol.mul(0.95), beardF.mul(0.8)), hairCol, hairMask);
    const hairStrands = hairCol.mul(sin(q.x.mul(170.0).add(q.z.mul(130.0))).mul(0.06).add(0.97));
    const hairPartCol = mix(hairStrands, skinCol, bald.mul(step(q.y, 1.755)));

    // Torso: collar & neck, tailored jacket (lapels, shirt V) or casual coat (zip, collar band), hem, trousers below
    const tailored = L.tailored;
    const hemY = mix(mix(0.955, 1.0, L.lane(61.0)), mix(0.88, 1.0, L.lane(61.0)), female);
    const chestFront = smoothstep(0.035, 0.075, q.z);
    const opening = q.y.sub(1.33).mul(0.42);
    const shirtV = smoothstep(1.33, 1.35, q.y).mul(smoothstep(0.004, 0.0, abs(q.x).sub(opening))).mul(chestFront).mul(tailored);
    const lapel = smoothstep(0.024, 0.009, abs(abs(q.x).sub(opening)))
      .mul(smoothstep(1.32, 1.37, q.y))
      .mul(chestFront)
      .mul(tailored)
      .mul(float(1.0).sub(shirtV));
    const zip = smoothstep(0.006, 0.0025, abs(q.x)).mul(chestFront).mul(L.zip);
    const collarBand = smoothstep(1.455, 1.48, q.y).mul(L.zip);
    const neckLine = mix(1.48, 1.495, L.zip);
    const neck = smoothstep(neckLine.sub(0.004), neckLine.add(0.004), q.y);
    const hem = smoothstep(hemY.sub(0.004), hemY.add(0.004), q.y);
    const hemShade = smoothstep(hemY.add(0.035), hemY, q.y).mul(0.12);
    const jacketCol = mix(
      coatCol.mul(float(1.0).sub(lapel.mul(0.25)).sub(zip.mul(0.4)).sub(collarBand.mul(0.15)).sub(hemShade)),
      shirtCol,
      shirtV
    );
    const torsoCol = mix(mix(legsCol, jacketCol, hem), skinCol, neck);

    // Sleeves: cuffs (shirt cuff under a tailored jacket); a tee's bare forearms
    const cuff = smoothstep(0.93, 0.96, along);
    const sleeveCol = mix(mix(coatCol, mix(coatCol.mul(0.72), shirtCol, tailored), cuff), skinCol, smoothstep(0.3, 0.315, along).mul(L.tee));

    // Trousers: subtle front crease
    const crease = smoothstep(0.004, 0.0, abs(abs(q.x).sub(HIP_X))).mul(step(0.0, q.z)).mul(0.08);
    const trouserCol = legsCol.mul(float(1.0).sub(crease));

    // Shoes: sneakers or leather, soles, laces over the instep
    const sneaker = step(0.4, L.lane(5.0));
    const leatherCol = mix(color(0x201e1c), color(0x4a3524), L.lane(23.0));
    const sneakerCol = mix(color(0x252b32), color(0xc8c3b8), step(0.55, L.lane(31.0)));
    const upperCol = mix(leatherCol, sneakerCol, sneaker);
    const sole = smoothstep(0.024, 0.016, q.y);
    const soleCol = mix(color(0x191816), color(0xd5d1c8), sneaker);
    const laceCoord = q.z.mul(80.0);
    const laces = smoothstep(0.6, 0.75, fract(laceCoord))
      .mul(step(abs(abs(q.x).sub(HIP_X)), 0.016))
      .mul(step(0.0, q.z))
      .mul(step(q.z, 0.09))
      .mul(step(0.075, q.y))
      .mul(sneaker);
    const shoeCol = mix(mix(upperCol, soleCol, sole), color(0xb8b4aa), laces.mul(0.6));

    return mix(
      mix(
        mix(
          mix(
            mix(mix(torsoCol, trouserCol, isPart(partId, PART.LEG)), shoeCol, isPart(partId, PART.SHOE)),
            sleeveCol,
            isPart(partId, PART.ARM)
          ),
          skinCol,
          isPart(partId, PART.HAND)
        ),
        headCol,
        isPart(partId, PART.HEAD)
      ),
      hairPartCol,
      step(PART.HAIR - 0.5, partId)
    );
  })();

  mat.roughnessNode = Fn(() => {
    const L = personLooks(vInfo);
    const partId = partOf();
    const skin = max(isPart(partId, PART.HAND), isPart(partId, PART.HEAD));
    const leather = isPart(partId, PART.SHOE).mul(step(L.lane(5.0), 0.4));
    return mix(mix(mix(float(0.86), float(0.55), skin), float(0.74), step(PART.HAIR - 0.5, partId)), float(0.38), leather);
  })();
}

// The near level (within farDistance: the 3 to 30 m a player sees people at): a face, hair, fabric and hands
function dressNear(mat, vInfo) {
  // exp(-(dx/rx)^2 - (dy/ry)^2): a soft blob
  const blob = (dx, dy, rx, ry) => {
    const a = dx.div(rx);
    const b = dy.div(ry);
    return a.mul(a).add(b.mul(b)).negate().exp();
  };
  // a line of half-width w (soft by aa) at signed distance d
  const line = (d, w, aa) => smoothstep(aa.add(w), aa.negate().add(w).max(0.0), abs(d));
  // (repair) the neck's skin: shaded under the jaw, an Adam's apple on men. The head takes the same tone where it meets
  // the neck, so the line where the two meshes cross does not show
  const neckTone = (q, skin, female) => {
    const jawShadow = smoothstep(1.49, 1.535, q.y).mul(smoothstep(0.018, 0.048, q.z)).mul(0.24);
    const adam = blob(q.x, q.y.sub(1.507), float(0.008), float(0.006)).sub(blob(q.x, q.y.sub(1.494), float(0.009), float(0.005)).mul(0.7)).mul(float(1.0).sub(female)).mul(smoothstep(0.02, 0.05, q.z)).mul(0.08);
    return skin.mul(float(1.0).sub(jawShadow).add(adam)).mul(mx_noise_float(q.mul(150.0)).mul(0.03).add(1.0));
  };
  // (repair) stubble or a beard on colour c at q (men): dense on the chin & lip, thinning toward the cheek line & the
  // neck, the skin showing through in its soft edge; the same on the head and the neck (the noise is of the position)
  const withBeard = (c, q, L, lips, fine) => {
    const ax = abs(q.x);
    const yB = mix(float(1.566), float(1.604), smoothstep(0.026, 0.078, ax));
    const fhN = mx_noise_float(q.mul(vec3(700.0, 260.0, 700.0)));
    const fhM = mx_noise_float(q.mul(vec3(140.0, 90.0, 140.0)));
    const cheek = smoothstep(yB.add(0.004), yB.sub(0.016), q.y.add(fhM.mul(0.005)));
    const lip = smoothstep(0.035, 0.02, ax.add(fhM.mul(0.003))).mul(smoothstep(1.5795, 1.5705, q.y.add(ax.mul(0.1)).add(fhM.mul(0.0025)))).mul(smoothstep(1.546, 1.55, q.y.add(ax.mul(0.15))));
    const neckLine = smoothstep(1.492, 1.515, q.y.add(fhM.mul(0.004)));
    const region = cheek.max(lip).mul(smoothstep(-0.035, -0.008, q.z)).mul(neckLine).mul(float(1.0).sub(lips));
    const stub = c.mul(mix(vec3(1.0), vec3(0.74, 0.73, 0.77), region.mul(L.stubble).mul(0.42)));
    // density: thick where the region is full, sparse (skin between the hairs) at its edges
    const dens = smoothstep(0.0, 1.0, region).mul(clamp(fhN.mul(0.3).add(0.82), 0.0, 1.0)).mul(L.beard);
    const beardC = mix(L.hair, L.hair.mul(vec3(1.12, 1.0, 0.92)), 0.4).mul(fhN.mul(0.22).mul(fine.mul(0.6).add(0.4)).add(0.9));
    return mix(stub, beardC, dens.mul(0.9));
  };

  // (round 3 repair) the hair's own colour where it is painted on the head (hairCover) and on the hair shell's last few
  // cm, as one function of the position, so the two meet with no band and no rim: strands down the head, in clumps
  const hairPaint = (q, L, fine) => {
    const ha = atan(q.x, q.z.add(0.012));
    const cs = vec2(sin(ha), sin(ha.add(Math.PI / 2)));
    const clump = mx_noise_float(vec3(cs.x.mul(9.0), cs.y.mul(9.0), q.y.mul(26.0).add(L.lane(91.0).mul(5.0))));
    const strand = mx_noise_float(vec3(cs.x.mul(44.0), cs.y.mul(44.0), q.y.mul(80.0)));
    return L.hair.mul(clump.mul(0.12).add(strand.mul(0.08).mul(fine)).add(0.98));
  };
  // (round 3) the hairline's cover on the head at q (0 skin .. 1 hair; px: metres a pixel spans): temples receding on
  // some men, sideburns, arched over the ear (its centre EAR_A behind the side) and down behind it to the nape (as
  // hairlineNear); none for the bald. (repair) Soft and feathered, never a drawn edge: the line wanders over two scales
  // (a few mm in slow waves, less in small ones); the hair thins from full ~1 mm under the shell's edge to bare skin over
  // ~9 mm (16 at the nape), a soft gradient at a distance; nearer, wisps and tufts along the growth carry it a little past
  // the soft line and leave skin between them inside it, and very close, single fine hairs
  // (the hairline's height round the head at q: temples receding on some men, sideburns, arched over the ear (its
  // centre EAR_A behind the side) and down behind it to the nape (as hairlineNear); off the head for the bald)
  const hairlineOf = (q, L, female) => {
    const z = q.z;
    const ax = abs(q.x);
    const hd = normalize(vec2(q.x, z.add(0.01)));
    const recede = float(1.0).sub(female).mul(L.lane(83.0)).mul(0.016).mul(hd.x.mul(hd.x));
    const sideburn = float(1.0).sub(female).mul(float(1.0).sub(L.bald)).mul(smoothstep(0.064, 0.074, ax)).mul(smoothstep(-0.004, 0.004, z)).mul(smoothstep(0.022, 0.012, z));
    const cosE = abs(hd.x).mul(Math.cos(EAR_A)).sub(hd.y.mul(Math.sin(EAR_A)));
    const earArch = float(1.0).sub(cosE).mul(-2.0 / (0.34 * 0.34)).exp().mul(0.046);
    const hl = hd.y.mul(0.07).add(1.625).sub(hd.x.mul(hd.x).sub(hd.y.mul(hd.y)).mul(0.005)).add(earArch).add(L.bald.mul(0.3)).add(recede).sub(sideburn.mul(0.026));
    return { hl, hd, sideburn };
  };
  const hairCover = (q, L, female, px) => {
    const { hl, hd, sideburn } = hairlineOf(q, L, female);
    const ha = atan(q.x, q.z.add(0.012));
    const cs = vec2(sin(ha), sin(ha.add(Math.PI / 2)));
    const wav = mx_noise_float(vec3(cs.x.mul(7.0), cs.y.mul(7.0), L.lane(83.0).mul(5.0))).mul(0.5).add(0.5).mul(0.0035)
      .add(mx_noise_float(vec3(cs.x.mul(27.0), cs.y.mul(27.0), L.lane(83.0).mul(5.0).add(3.0))).mul(0.5).add(0.5).mul(0.0015));
    const hlJ = hl.sub(wav).sub(0.001);
    const soft = smoothstep(0.2, -0.6, hd.y).mul(0.007).add(0.01);
    // 0 bare skin .. 1 full hair; the density eases in from nothing (no edge to see), full just under the shell's edge
    const r = clamp(q.y.sub(hlJ.sub(soft)).div(hl.add(0.0015).sub(hlJ.sub(soft))), 0.0, 1.0); // (full only under the shell: skin shows through at its edge)
    const base = r.pow(1.6);
    // wisps along the growth: the density varied (never thresholded, so no edge forms), most where it is thin
    const tuft = mx_noise_float(vec3(cs.x.mul(60.0), cs.y.mul(60.0), q.y.mul(170.0).add(L.lane(83.0).mul(7.0)))).mul(0.5).add(0.5);
    const midH = smoothstep(0.003, 0.001, px);
    const cov = base.mul(tuft.sub(0.5).mul(2.4).mul(midH).mul(float(1.0).sub(base)).add(1.0));
    // very close, single fine hairs, a few reaching a little past the soft line
    const hairs = mx_noise_float(vec3(cs.x.mul(240.0), cs.y.mul(240.0), q.y.mul(460.0))).mul(0.5).add(0.5);
    const fineH = smoothstep(0.0005, 0.0002, px);
    const r2 = clamp(q.y.sub(hlJ.sub(soft.mul(1.35))).div(soft.mul(1.35)), 0.0, 1.0);
    const strand = smoothstep(0.6, 0.7, hairs).mul(r2.mul(float(1.0).sub(base))).mul(0.7).mul(fineH);
    // (the sideburn's front edge thins too)
    const sb = float(1.0).sub(sideburn.mul(smoothstep(hlJ.add(0.022), hlJ.add(0.004), q.y)).mul(0.45));
    const cover = clamp(max(cov, strand), 0.0, 1.0).mul(sb);
    return { cover, hl };
  };

  mat.colorNode = Fn(() => {
    const L = personLooks(vInfo);
    const partId = partOf();
    const q = attribute('position', 'vec3');
    const n0 = attribute('normal', 'vec3');
    const along = attribute('extra', 'vec3').z;
    // (screen-space derivatives first, in uniform control flow) metres a pixel spans here, and what shows at that size
    const px = max(fwidth(q.x), fwidth(q.y)).toVar();
    const aa = max(px.mul(0.7), 0.0002).toVar();
    const fine = smoothstep(0.003, 0.001, px).toVar(); // stitches, strands, weave: close up only
    const mid = smoothstep(0.012, 0.004, px).toVar(); // seams, ribs, folds
    const female = L.female;
    const skin = L.skin.toVar();
    const hair = L.hair.toVar();
    const coat = L.coat.toVar();
    const legs = L.legs.toVar();
    const ax = abs(q.x);
    const y = q.y;
    const col = vec3(0.0).toVar();

    // trousers' cloth (the legs and the torso below the hem): denim twill, fading & topstitching, or a pressed crease
    const trousers = (lx, la) => {
      const tw = sin(q.y.add(lx.mul(0.8)).mul(2300.0)).mul(0.05).mul(fine).mul(L.denim);
      const fade = smoothstep(1.2, 0.0, abs(la)).mul(blob(float(0.0), q.y.sub(0.68), float(1.0), float(0.14)).add(blob(float(0.0), q.y.sub(0.5), float(1.0), float(0.05)).mul(0.7)))
        .mul(0.14).mul(L.denim);
      const heather = mx_noise_float(q.mul(vec3(90.0, 30.0, 90.0))).mul(0.035).mul(mid);
      const seam = line(abs(la).sub(1.57), float(0.025), aa.mul(8.0)).mul(mid);
      const stitch = line(abs(la).sub(1.48), float(0.012), aa.mul(8.0)).mul(fine).mul(L.denim);
      const crease = line(la, float(0.012), aa.mul(8.0)).mul(step(q.y, 0.9)).mul(float(1.0).sub(L.denim)).mul(mid);
      const knee = sin(q.y.mul(380.0).add(la.mul(2.0))).mul(smoothstep(0.46, 0.49, q.y)).mul(smoothstep(0.55, 0.52, q.y)).mul(smoothstep(2.0, 2.8, abs(la))).mul(0.09).mul(mid);
      const brk = sin(q.y.mul(230.0).add(la.mul(3.0))).mul(smoothstep(0.11, 0.13, q.y)).mul(smoothstep(0.22, 0.17, q.y)).mul(0.08).mul(mid);
      const hemB = smoothstep(0.116, 0.108, q.y).mul(0.12);
      const c = legs.mul(float(1.0).add(tw).add(fade).add(heather).add(knee).add(brk).sub(seam.mul(0.22)).sub(crease.mul(0.07)).sub(hemB));
      return mix(c, color(0xa8813f), stitch.mul(0.7));
    };

    If(partId.lessThan(0.5), () => {
      // ---------------------------------------------------------------- torso & neck
      const ang = atan(q.x, q.z); // 0 at the front, +-PI at the back
      const chestFront = smoothstep(0.035, 0.075, q.z);
      const hemY = mix(mix(mix(0.955, 1.0, L.lane(61.0)), mix(0.88, 1.0, L.lane(61.0)), female), float(0.9), L.tee);
      const heather = mx_noise_float(q.mul(vec3(70.0, 45.0, 70.0))).mul(0.04).mul(mid);
      const weave = sin(q.x.add(q.y).mul(2600.0)).mul(0.03).mul(fine).mul(L.tailored);
      const knitT = sin(ang.mul(210.0)).mul(sin(q.y.mul(880.0))).mul(0.06).mul(fine).mul(L.knit.add(L.hoodie.mul(0.4)));
      const folds = sin(q.y.mul(26.0).add(ang.mul(2.2)).add(L.lane(13.0).mul(6.0))).mul(sin(ang.mul(5.0).sub(q.y.mul(8.0)))).mul(0.055).mul(mid);
      const qu = fract(q.y.mul(13.0).add(0.3));
      const quilt = sin(qu.mul(Math.PI)).mul(0.26).sub(0.17).mul(L.puffer);
      const sideSeam = line(abs(ang).sub(1.62), float(0.012), aa.mul(7.0)).mul(mid).mul(0.2);
      const cloth = coat.mul(float(1.0).add(heather).add(weave).add(knitT).add(folds).add(quilt).sub(sideSeam)).toVar();

      // tailored: lapels with a rolled edge, the shirt & its collar points, a tie (some men), two buttons, pockets
      const opening = q.y.sub(1.33).mul(0.42);
      const shirtV = smoothstep(1.33, 1.345, q.y).mul(smoothstep(0.003, 0.0, ax.sub(opening))).mul(chestFront).mul(L.tailored);
      const lapD = ax.sub(opening);
      const lapel = smoothstep(0.024, 0.02, lapD).mul(smoothstep(1.32, 1.37, q.y)).mul(chestFront).mul(L.tailored).mul(float(1.0).sub(shirtV));
      const lapEdge = line(lapD.sub(0.0225), float(0.0012), aa).mul(lapel.max(smoothstep(1.32, 1.37, q.y).mul(chestFront).mul(L.tailored)));
      const lapShade = smoothstep(0.0, 0.022, lapD).mul(lapel).mul(0.12);
      const closing = line(q.x.sub(0.003), float(0.0008), aa).mul(step(q.y, 1.335)).mul(chestFront).mul(L.tailored);
      const btn = smoothstep(aa.add(0.0055), float(0.0045), length(vec2(q.x, q.y.sub(1.215))))
        .add(smoothstep(aa.add(0.0055), float(0.0045), length(vec2(q.x, q.y.sub(1.135)))))
        .mul(chestFront).mul(L.tailored);
      const pocketL = line(q.y.sub(1.035), float(0.0011), aa).mul(step(0.07, ax)).mul(step(ax, 0.15)).mul(chestFront).mul(L.tailored);
      const welt = line(q.y.sub(1.35), float(0.0011), aa).mul(step(0.075, q.x)).mul(step(q.x, 0.125)).mul(chestFront).mul(L.tailored);
      const tieOn = float(1.0).sub(female).mul(L.tailored).mul(step(L.lane(31.0), 0.55));
      const tw = q.y.sub(1.47).negate().mul(0.065).add(0.0085);
      const tie = smoothstep(tw.add(aa), tw.sub(aa), ax).mul(shirtV).mul(tieOn);
      const tieStripe = step(0.5, fract(q.y.add(q.x).mul(55.0))).mul(step(L.lane(35.0), 0.45)).mul(0.35);
      const tieCol = pickColorFromPalette(TIE_COLORS, L.lane(33.0)).mul(tieStripe.add(1.0));
      const collarPt = line(q.y.sub(1.44).sub(ax.sub(0.012).mul(1.15)), float(0.0009), aa).mul(step(0.012, ax)).mul(step(ax, 0.048)).mul(shirtV);
      const shirtC = L.shirt.mul(float(1.0).sub(collarPt.mul(0.35)).sub(smoothstep(0.02, 0.05, ax).mul(0.08)));
      cloth.assign(cloth.mul(float(1.0).sub(lapShade).sub(closing.mul(0.45)).sub(pocketL.mul(0.4)).sub(welt.mul(0.35))).mul(float(1.0).add(lapEdge.mul(0.18))));
      cloth.assign(mix(cloth, coat.mul(0.35), btn));
      cloth.assign(mix(cloth, mix(shirtC, tieCol, tie), shirtV));

      // casual zip coat: the zip (teeth catching the light), a stand collar, a chest yoke, slash pockets
      const zipD = abs(q.x);
      const zipBand = smoothstep(aa.add(0.0045), float(0.0035), zipD).mul(chestFront).mul(L.zip);
      const teeth = sin(q.y.mul(1800.0)).mul(0.5).add(0.5).mul(fine).mul(smoothstep(0.0025, 0.0008, zipD));
      const collarZ = smoothstep(1.448, 1.456, q.y).mul(L.zip);
      const collarEdge = line(q.y.sub(1.45), float(0.001), aa).mul(L.zip);
      const yoke = line(q.y.sub(1.36), float(0.0009), aa).mul(chestFront).mul(L.zip).mul(float(1.0).sub(L.puffer));
      const slash = line(ax.sub(0.115).sub(q.y.sub(1.03).mul(0.35)), float(0.0011), aa).mul(step(1.03, q.y)).mul(step(q.y, 1.14)).mul(chestFront).mul(L.zip);
      cloth.assign(cloth.mul(float(1.0).sub(collarZ.mul(0.1)).sub(collarEdge.mul(0.3)).sub(yoke.mul(0.3)).sub(slash.mul(0.4))));
      cloth.assign(mix(cloth, mix(coat.mul(0.4), color(0x9a958c), teeth.mul(0.6)), zipBand));

      // knit & hoodie: ribbed neck and hem; the hoodie's hood bunched at the back, drawcords, a kangaroo pocket
      const ribs = sin(ang.mul(300.0)).mul(0.08).mul(mid);
      const knitish = L.knit.add(L.hoodie);
      const neckRib = smoothstep(1.462, 1.468, q.y).mul(knitish.add(L.tee.mul(0.6)));
      const hemRib = smoothstep(hemY.add(0.052), hemY.add(0.046), q.y).mul(knitish);
      cloth.assign(cloth.mul(float(1.0).add(ribs.mul(neckRib.add(hemRib))).sub(hemRib.mul(0.05))));
      const hood = smoothstep(1.405, 1.43, q.y).mul(smoothstep(0.02, -0.03, q.z)).mul(L.hoodie);
      const hoodFold = sin(ang.mul(9.0).add(q.y.mul(60.0))).mul(0.12).add(sin(q.y.mul(140.0)).mul(0.06)).mul(hood);
      const cord = line(ax.sub(0.034), float(0.0022), aa).mul(step(1.36, q.y)).mul(step(q.y, 1.47)).mul(chestFront).mul(L.hoodie);
      const kangaroo = line(q.y.sub(1.13), float(0.0012), aa).mul(step(ax, 0.105)).add(line(ax.sub(0.105).sub(q.y.sub(1.13).mul(-0.3)), float(0.0012), aa).mul(step(q.y, 1.13)).mul(step(hemY.add(0.05), q.y)))
        .mul(chestFront).mul(L.hoodie);
      cloth.assign(cloth.mul(float(1.0).add(hoodFold).sub(hood.mul(0.08)).sub(kangaroo.mul(0.35))));
      cloth.assign(mix(cloth, mix(L.shirt, coat.mul(1.4), 0.4), cord));

      // the hem's shadow over the trousers' waist; a belt (with its buckle) where the jacket stops above it
      const hem = smoothstep(hemY.sub(0.003), hemY.add(0.003), q.y);
      const hemShade = smoothstep(hemY.add(0.03), hemY, q.y).mul(0.1);
      const lx = float(0.0);
      const tr = trousers(lx, ang);
      const beltOn = step(L.lane(39.0), 0.65).mul(step(0.958, hemY));
      const belt = smoothstep(0.926, 0.93, q.y).mul(smoothstep(0.956, 0.952, q.y)).mul(beltOn);
      const buckle = smoothstep(0.019, 0.016, ax).mul(chestFront).mul(belt);
      const lower = mix(mix(tr, color(0x221913), belt), color(0x8d877c), buckle);
      const upper = cloth.mul(float(1.0).sub(hemShade));

      // the neck: shirt collar round it under a jacket, the jaw's shadow under the chin, a crew neck's edge
      const collarTop = mix(mix(float(1.478), float(1.495), L.zip), float(1.5), L.tailored);
      const neck = smoothstep(collarTop.sub(0.003), collarTop.add(0.003), q.y);
      const shirtCollar = smoothstep(1.477, 1.481, q.y).mul(smoothstep(0.068, 0.06, ax)).mul(float(1.0).sub(neck)).mul(L.tailored);
      const neckSkin = withBeard(neckTone(q, skin, female), q, L, float(0.0), fine);
      const top = mix(mix(upper, L.shirt.mul(float(1.0).sub(line(q.y.sub(1.478), float(0.0008), aa).mul(0.3))), shirtCollar), neckSkin, neck);
      col.assign(mix(lower, top, hem.max(neck)));
    })
      .ElseIf(partId.lessThan(1.5), () => {
        // ---------------------------------------------------------------- trouser legs
        const lx = q.x.sub(sign(q.x).mul(HIP_X));
        const la = atan(lx.mul(sign(q.x)), q.z); // 0 at the front, +PI/2 the outside of the leg
        const c = trousers(lx, la).toVar();
        // denim's back pockets (outlined in topstitching)
        const pk = step(q.z, -0.02).mul(step(0.83, q.y)).mul(step(q.y, 0.935)).mul(step(0.04, ax)).mul(step(ax, 0.145)).mul(L.denim);
        const pkLine = line(q.y.sub(0.935), float(0.0012), aa).add(line(ax.sub(0.042), float(0.0012), aa)).add(line(ax.sub(0.143), float(0.0012), aa)).mul(pk).mul(mid);
        col.assign(mix(c, color(0xa8813f), pkLine.mul(0.6)));
      })
      .ElseIf(partId.lessThan(2.5), () => {
        // ---------------------------------------------------------------- shoes
        const sneaker = step(0.4, L.lane(5.0));
        const leatherCol = mix(color(0x201e1c), color(0x4a3524), L.lane(23.0));
        const sneakerCol = mix(color(0x252b32), color(0xc8c3b8), step(0.55, L.lane(31.0)));
        const sole = smoothstep(0.024, 0.016, q.y);
        const soleCol = mix(color(0x191816), color(0xd5d1c8), sneaker);
        const laces = smoothstep(0.6, 0.75, fract(q.z.mul(80.0)))
          .mul(step(abs(ax.sub(HIP_X)), 0.016)).mul(step(0.0, q.z)).mul(step(q.z, 0.09)).mul(step(0.075, q.y)).mul(sneaker);
        const toeCap = line(q.z.sub(0.1), float(0.0012), aa).mul(step(0.045, q.y)).mul(float(1.0).sub(sneaker));
        const welt = line(q.y.sub(0.027), float(0.0013), aa).mul(float(1.0).sub(sneaker));
        const mids = smoothstep(0.024, 0.028, q.y).mul(smoothstep(0.036, 0.032, q.y)).mul(sneaker);
        const heelTab = step(q.z, -0.065).mul(step(0.07, q.y)).mul(sneaker);
        const upperCol = mix(leatherCol.mul(float(1.0).sub(toeCap.mul(0.4)).add(welt.mul(0.25))), sneakerCol, sneaker);
        const c = mix(mix(upperCol, mix(soleCol, color(0xe2ded6), mids), sole.max(mids)), color(0xb8b4aa), laces.mul(0.6));
        col.assign(mix(c, sneakerCol.mul(0.55), heelTab.mul(0.7)));
      })
      .ElseIf(partId.lessThan(3.5), () => {
        // ---------------------------------------------------------------- sleeves (a tee's bare arms)
        const u = along;
        const around = atan(n0.x.mul(sign(q.x)), n0.z);
        const knitish = L.knit.add(L.hoodie);
        const cuffT = mix(float(0.93), float(0.9), knitish);
        const cuff = smoothstep(cuffT, cuffT.add(0.025), u);
        const heather = mx_noise_float(q.mul(vec3(70.0, 45.0, 70.0))).mul(0.04).mul(mid);
        const inner = smoothstep(-0.2, 0.7, n0.z);
        const elbow = sin(u.mul(150.0).add(around.mul(1.5))).mul(smoothstep(0.47, 0.53, u)).mul(smoothstep(0.67, 0.6, u)).mul(inner.mul(0.06).add(0.03)).mul(mid);
        const bunch = sin(u.mul(115.0).add(around.mul(2.0))).mul(smoothstep(0.76, 0.82, u)).mul(smoothstep(0.92, 0.87, u)).mul(0.06).mul(mid);
        const seamS = line(u.sub(0.07), float(0.0025), aa.mul(2.0)).mul(mid).mul(0.25).mul(float(1.0).sub(L.puffer));
        const quilt = sin(fract(u.mul(9.0)).mul(Math.PI)).mul(0.26).sub(0.17).mul(L.puffer);
        const knitT = sin(around.mul(60.0)).mul(sin(u.mul(450.0))).mul(0.05).mul(fine).mul(L.knit);
        const weave = sin(q.x.add(q.y).mul(2600.0)).mul(0.03).mul(fine).mul(L.tailored);
        const rib = sin(around.mul(42.0)).mul(0.1).mul(mid).mul(cuff).mul(knitish);
        const sleeveC = coat.mul(float(1.0).add(heather).add(elbow).add(bunch).add(quilt).add(knitT).add(weave).add(rib).sub(seamS));
        const cuffC = mix(mix(coat.mul(0.78), L.shirt, L.tailored), coat.mul(0.92), knitish);
        const c = mix(sleeveC, cuffC, cuff.mul(float(1.0).sub(knitish.mul(0.7))));
        // a tee: its hem round the upper arm, skin below
        const bare = smoothstep(0.302, 0.312, u).mul(L.tee);
        const teeHem = line(u.sub(0.29), float(0.004), aa.mul(2.0)).mul(L.tee).mul(mid);
        const armSkin = skin.mul(mx_noise_float(q.mul(120.0)).mul(0.03).add(1.0));
        col.assign(mix(c.mul(float(1.0).sub(teeHem.mul(0.2))), armSkin, bare));
      })
      .ElseIf(partId.lessThan(4.5), () => {
        // ---------------------------------------------------------------- hands: palms lighter, nails, knuckles
        const sx = sign(q.x);
        const palmDir = vec3(sx.mul(-0.9), 0.0, -0.43);
        const pd = dot(n0, palmDir);
        const palm = smoothstep(0.1, 0.6, pd);
        const d = ax.sub(0.185).mul(0.1395).add(float(1.43).sub(q.y).mul(0.9902)); // along the arm from the shoulder
        const nail = smoothstep(0.78, 0.86, along).mul(smoothstep(0.648, 0.662, d)).mul(smoothstep(-0.05, -0.4, pd));
        const knuckle = line(along.sub(0.5), float(0.02), float(0.02)).add(line(along.sub(0.75), float(0.015), float(0.02)).mul(0.6))
          .mul(smoothstep(0.645, 0.655, d)).mul(smoothstep(0.1, -0.3, pd)).mul(mid).mul(0.12);
        const webs = smoothstep(0.32, 0.18, along).mul(smoothstep(0.636, 0.646, d)).mul(0.1);
        const wrist = line(d.sub(0.532), float(0.002), aa).mul(palm).mul(0.15);
        const palmC = mix(skin, color(0xd49a83), 0.3).mul(1.06);
        const c = mix(skin, palmC, palm).mul(float(1.0).sub(knuckle).sub(webs).sub(wrist)).mul(mx_noise_float(q.mul(160.0)).mul(0.03).add(1.0));
        col.assign(mix(c, mix(skin.mul(1.22), color(0xc7a092), 0.2), nail.mul(0.8)));
      })
      .ElseIf(partId.lessThan(5.5), () => {
        // ---------------------------------------------------------------- the head & face
        const z = q.z;
        const front = smoothstep(0.04, 0.066, z);
        const blotch = mx_noise_float(q.mul(55.0));
        // (repair) mottled, not porcelain: a slow tone variation and a warmer, rosier cast in the blotches
        const mottle = mx_noise_float(q.mul(26.0).add(L.lane(23.0).mul(9.0)));
        // (round 3) and, close up, a finer grain (pores, tiny blemishes) over it
        const grain = mx_noise_float(q.mul(430.0)).mul(0.024).mul(fine);
        const c = skin.mul(mx_noise_float(q.mul(170.0)).mul(0.035).add(1.0).add(grain)).mul(mottle.mul(0.08).add(1.0))
          .mul(mix(vec3(1.0), vec3(1.06, 0.94, 0.92), blotch.mul(0.5).add(0.5).mul(0.7))).toVar();
        // (repair) and in hue, a little redder here, a little yellower there (skin is not one even tint)
        const hueN = mx_noise_float(q.mul(62.0).add(L.lane(23.0).mul(4.0)));
        c.assign(c.mul(vec3(hueN.mul(0.035).add(1.0), hueN.mul(-0.008).add(1.0), hueN.mul(-0.035).add(1.0))));
        // flush on the cheeks, the nose tip & the ears; the eye sockets, under the eyes, the nose's sides, the philtrum,
        // the fold from nose to mouth, the shadow under the lower lip
        // (round 3: broader & warmer, the nose & its bridge, the chin; a little less on deep skin)
        // (repair) the cheeks' flush broad & soft, along the cheekbones and across the nose, broken by the mottling (it
        // read as round blush patches on fair faces)
        const warm = vec3(1.08, 0.9, 0.87);
        const ear = smoothstep(0.074, 0.086, ax).mul(smoothstep(0.012, -0.004, z)).mul(smoothstep(-0.05, -0.036, z)).mul(smoothstep(1.57, 1.583, y)).mul(smoothstep(1.656, 1.64, y));
        const flush = blob(ax.sub(0.036), y.sub(1.597), float(0.034), float(0.021)).mul(0.5).mul(mottle.mul(0.6).add(0.85)).mul(front)
          .add(blob(ax.sub(0.018), y.sub(1.603), float(0.03), float(0.011)).mul(0.14).mul(front))
          .add(blob(ax, y.sub(1.596), float(0.042), float(0.03)).mul(0.22).mul(front))
          .add(blob(ax, y.sub(1.55), float(0.026), float(0.013)).mul(0.16).mul(front))
          .add(blob(ax.sub(0.031), y.sub(1.6355), float(0.013), float(0.0035)).mul(0.25).mul(front))
          .add(blob(ax, y.sub(1.589), float(0.01), float(0.011)).mul(0.5).mul(front))
          .add(blob(ax, y.sub(1.612), float(0.006), float(0.02)).mul(0.25).mul(front))
          .add(blob(ax, y.sub(1.524), float(0.018), float(0.011)).mul(0.3).mul(front))
          .add(ear.mul(0.6))
          .mul(mix(float(1.0), float(0.55), L.skinT));
        c.assign(c.mul(mix(vec3(1.0), warm, clamp(flush, 0.0, 1.0))));
        // (round 3) planes under a flat light: the forehead a little lighter & yellower, the temples cooler, shade under
        // the brow ridge and along the jaw's underside & angle
        const forehead = blob(ax, y.sub(1.676), float(0.034), float(0.02)).mul(front);
        c.assign(c.mul(mix(vec3(1.0), vec3(1.04, 1.02, 0.96), forehead)));
        const underBrow = blob(ax.sub(0.031), y.sub(1.639), float(0.019), float(0.0055)).mul(front).mul(0.11);
        const templeS = blob(ax.sub(0.07), y.sub(1.648), float(0.012), float(0.022)).mul(0.08);
        const jawS = smoothstep(1.553, 1.522, y).mul(smoothstep(0.022, 0.056, ax)).mul(0.15)
          .add(smoothstep(0.046, 0.074, ax).mul(smoothstep(1.66, 1.57, y)).mul(0.05)); // (repair) the face's sides turning away
        c.assign(c.mul(float(1.0).sub(underBrow).sub(templeS).sub(jawS)));
        const socket = blob(ax.sub(0.031), y.sub(1.63), float(0.019), float(0.012)).mul(front).mul(0.21).add(blob(ax.sub(0.03), y.sub(1.637), float(0.015), float(0.004)).mul(front).mul(0.08));
        const underEye = blob(ax.sub(0.03), y.sub(1.6185), float(0.012), float(0.0035)).mul(front);
        const noseSide = blob(ax.sub(0.0125), y.sub(1.603), float(0.0035), float(0.012)).mul(front).mul(0.11)
          .add(blob(ax, y.sub(1.5765), float(0.009), float(0.0028)).mul(front).mul(0.1)); // (repair) and the shade under it
        const philtrum = blob(ax, y.sub(1.564), float(0.0028), float(0.006)).mul(front).mul(0.05);
        const t = clamp(ax.sub(0.0135).mul(0.4626).add(float(1.574).sub(y).mul(0.8866)).div(0.0259), 0.0, 1.0);
        const nlD = length(vec2(ax.sub(mix(float(0.0135), float(0.0255), t)), y.sub(mix(float(1.574), float(1.551), t))));
        const nasolab = smoothstep(0.0028, 0.0, nlD).mul(front).mul(mix(float(0.04), float(0.1), step(L.lane(37.0), 0.25)));
        const underLip = blob(ax, y.sub(1.5355), float(0.013), float(0.0034)).mul(front).mul(0.15);
        // (repair) the ear's form, painted where it stands out of the head: the rim (helix) catching light, the groove
        // inside it, the bowl (concha) & canal in shade, so it reads as an ear in profile
        const earBaseX = y.sub(1.622).mul(0.14).add(0.0781).mul(mix(float(1.0), float(0.94), female));
        const onEar = smoothstep(earBaseX.add(0.001), earBaseX.add(0.0045), ax).mul(smoothstep(1.568, 1.578, y)).mul(smoothstep(1.662, 1.65, y));
        const ez = z.add(float(0.0094).add(y.sub(1.61).mul(0.117)));
        const eR = length(vec2(ez.div(0.0145), y.sub(1.612).div(0.034)));
        const helix = smoothstep(0.62, 0.8, eR).mul(smoothstep(1.1, 0.9, eR));
        const scapha = smoothstep(0.45, 0.6, eR).mul(smoothstep(0.78, 0.66, eR));
        const bowl = blob(ez.sub(0.003), y.sub(1.606), float(0.0062), float(0.0095));
        const canal = blob(ez.sub(0.0055), y.sub(1.603), float(0.0022), float(0.0028));
        const concha = onEar.mul(scapha.mul(0.16).add(bowl.mul(0.24)).add(canal.mul(0.35)).sub(helix.mul(0.06)));
        c.assign(c.mul(float(1.0).sub(socket).sub(noseSide).sub(philtrum).sub(nasolab).sub(underLip).sub(concha)).mul(mix(vec3(1.0), vec3(0.9, 0.86, 0.9), underEye)));

        // lips (worked out before the beard, which keeps off them)
        const mw = mix(float(0.0218), float(0.0204), female);
        const mu = ax.div(mw);
        const lw = clamp(float(1.0).sub(mu.mul(mu)), 0.0, 1.0);
        const y0 = float(1.5491);
        const bow = blob(ax, float(0.0), float(0.0035), float(1.0)).mul(0.0009).negate().add(blob(ax.sub(0.0052), float(0.0), float(0.0028), float(1.0)).mul(0.0005));
        const yUL = y0.add(lw.pow(0.55).mul(0.006)).add(bow);
        const yLL = y0.sub(lw.pow(0.5).mul(mix(float(0.0072), float(0.0082), female)));
        // (round 3: the lips' outer border soft, as real lips' is, and fading into the corners: no painted doll's mouth;
        // the line between them stays crisp)
        const lf = max(aa, 0.0007);
        const lipEnds = smoothstep(1.0, 0.82, mu);
        const upperL = smoothstep(lf.negate(), lf, yUL.sub(y)).mul(smoothstep(aa.negate(), aa, y.sub(y0))).mul(lipEnds).mul(front);
        const lowerL = smoothstep(lf.mul(-1.6), lf.mul(1.6), y.sub(yLL)).mul(smoothstep(aa.negate(), aa, y0.sub(y))).mul(lipEnds).mul(front);
        const lips = clamp(upperL.add(lowerL), 0.0, 1.0);

        // (repair) where the head meets the neck (the sides & back below the jaw, under the chin) it takes the neck's tone
        const toNeck = smoothstep(1.566, 1.538, y).mul(smoothstep(0.064, 0.03, z));
        c.assign(mix(c, neckTone(q, skin, female), toNeck));
        // stubble or a beard (men), soft-edged
        c.assign(withBeard(c, q, L, lips, fine));

        // brows: an arch, thicker inside, tapering out; (round 3) hairs, not a painted band: strokes rising steeply at
        // the inner end and lying along the arch outward, the edge broken, skin between them toward the edges up close;
        // a soft tone at a distance
        const bx = ax.sub(0.0125).div(0.04);
        const yb = float(1.6458).add(sin(min(bx.mul(1.2), 1.0).mul(Math.PI)).mul(mix(float(0.0026), float(0.0034), female))).sub(bx.mul(0.0012));
        const th = mix(float(0.0056), float(0.0022), clamp(bx, 0.0, 1.0)).mul(mix(float(1.0), float(0.7), female)).mul(L.lane(7.0).mul(0.4).add(0.8));
        const fineB = smoothstep(0.0012, 0.0005, px);
        const bAng = mix(float(1.2), float(0.15), smoothstep(0.0, 0.35, bx)).sub(smoothstep(0.4, 1.0, bx).mul(0.35));
        const cb = cos(bAng);
        const sb = sin(bAng);
        const strokes = mx_noise_float(vec3(ax.mul(cb).add(y.mul(sb)).mul(380.0), y.mul(cb).sub(ax.mul(sb)).mul(1800.0), L.lane(7.0).mul(10.0)));
        const bEdge = mx_noise_float(vec3(ax.mul(1400.0), y.mul(1400.0), 2.3)).mul(0.0006).mul(fineB);
        const browM = smoothstep(th.mul(0.72).add(aa), th.mul(0.28), abs(y.sub(yb)).add(bEdge))
          .mul(smoothstep(0.0, 0.14, bx)).mul(smoothstep(1.02, 0.8, bx)).mul(front);
        const brow = browM.mul(mix(float(0.8), smoothstep(-0.3, 0.12, strokes.add(browM.mul(0.35))).mul(0.95), fineB));
        const browC = mix(hair, color(0x2a1d16), 0.35).mul(0.7);
        c.assign(mix(c, browC, brow));

        // eyes: almond lids (outer corners a touch higher), sclera shaded under the lid & toward the corners, the
        // pupil; (round 3) depth: the iris with fibres, a lighter ring round the pupil & a dark limbal ring at its edge,
        // in the upper lid's shadow; a catchlight (the same side in both eyes); the pink inner corner; the wet rim of
        // the lower lid; a darker, fuller upper lash line (thickest outward), the lid's crease, a fainter lower one
        const ex = ax.sub(0.0315);
        const ey = y.sub(1.6272).sub(ex.mul(0.08));
        const eu = ex.div(0.0132);
        const ews = clamp(float(1.0).sub(eu.mul(eu)), 0.0, 1.0).sqrt();
        const yU = ews.mul(0.0053);
        const yL = ews.mul(-0.004);
        const open = smoothstep(aa.negate(), aa, yU.sub(ey)).mul(smoothstep(aa.negate(), aa, ey.sub(yL))).mul(step(abs(eu), 1.0)).mul(front);
        const ir = length(vec2(ex.add(0.0004), ey.add(0.0004)));
        const rr = ir.div(0.0057);
        const iris = smoothstep(aa.add(0.0057), float(0.0057).sub(aa), ir);
        const pupil = smoothstep(aa.add(0.0022), float(0.0022).sub(aa).max(0.0), ir);
        const ia = atan(ey.add(0.0004), ex.add(0.0004));
        const fib = mx_noise_float(vec3(sin(ia).mul(14.0), sin(ia.add(Math.PI / 2)).mul(14.0), rr.mul(2.5).add(L.lane(97.0).mul(9.0))));
        const collar = smoothstep(0.4, 0.5, rr).mul(smoothstep(0.7, 0.55, rr));
        const limbal = smoothstep(0.74, 0.98, rr);
        const irisC = pickColorFromPalette(IRIS_COLORS, L.lane(97.0)).mul(mix(float(1.3), float(0.85), rr))
          .mul(fib.mul(mix(float(0.22), float(0.42), fine)).add(1.0)).mul(collar.mul(0.3).add(1.0)).mul(float(1.0).sub(limbal.mul(0.72)));
        const lidShadow = smoothstep(yU.sub(0.0038), yU, ey);
        const sclera = mix(vec3(0.36, 0.33, 0.31), skin, mix(float(0.3), float(0.55), L.skinT)).mul(float(1.0).sub(eu.mul(eu).mul(0.55))).mul(float(1.0).sub(lidShadow.mul(0.72)));
        const caruncle = blob(ex.add(0.0121), ey.add(0.0002), float(0.0013), float(0.0016));
        const scleraC = mix(sclera, skin.mul(vec3(0.95, 0.62, 0.6)), caruncle.mul(0.75));
        const eyeC = mix(mix(scleraC, irisC.mul(float(1.0).sub(lidShadow.mul(0.42))), iris), vec3(0.012, 0.01, 0.01), pupil).toVar();
        // (the catchlight: up & to the person's left of each pupil; as wide as a pixel at least, dimmer as it widens)
        const cR = max(float(0.0006), px.mul(0.7));
        const catchL = blob(q.x.sub(sign(q.x).mul(0.0311)).sub(0.0017), ey.sub(0.0015), cR, cR).mul(float(0.0006).div(cR).pow(2.0)).mul(float(1.0).sub(lidShadow.mul(0.6)));
        eyeC.assign(mix(eyeC, vec3(0.9, 0.92, 0.95), clamp(catchL.mul(0.9), 0.0, 1.0)));
        c.assign(mix(c, eyeC, open));
        // (the wet rim of the lower lid, catching the light)
        const wetRim = smoothstep(aa.add(0.0005), float(0.0), abs(ey.sub(yL).sub(0.00035))).mul(step(abs(eu), 0.95)).mul(front).mul(0.22);
        c.assign(mix(c, skin.mul(vec3(1.15, 0.95, 0.93)), wetRim));
        const lashW = mix(float(0.0011), float(0.0015), female).mul(smoothstep(-1.1, 0.4, eu).mul(0.45).add(0.75));
        const lash = smoothstep(lashW.add(aa), lashW.sub(aa).max(0.0), abs(ey.sub(yU).sub(0.0005))).mul(smoothstep(mix(float(1.06), float(1.12), female), float(0.9), abs(eu))).mul(front);
        const lowLash = smoothstep(aa.add(0.0005), float(0.0), abs(ey.sub(yL).add(0.0003))).mul(step(abs(eu), 1.0)).mul(front).mul(0.3);
        const crease = smoothstep(aa.add(0.0009), float(0.0), abs(ey.sub(yU).sub(0.0044).sub(eu.mul(eu).mul(-0.0015)))).mul(step(abs(eu), 1.1)).mul(front).mul(0.28).mul(mid);
        c.assign(mix(c, mix(color(0x0e0907), hair.mul(0.25), 0.25), lash.mul(0.95)));
        const lid = smoothstep(0.0, 0.0012, ey.sub(yU)).mul(smoothstep(0.0042, 0.0028, ey.sub(yU))).mul(step(abs(eu), 1.05)).mul(front).mul(0.12);
        c.assign(c.mul(float(1.0).sub(lowLash).sub(crease).sub(lid)));

        // lips: upper darker, lower fuller & catching the light; lipstick on some women; the line between them
        // (repair) not painted on: a colour nearer the skin (more so on men); the upper lip shaded toward the line (it
        // turns in), the lower one lit in its middle and turning under at its edge; the line darkest in from the corners,
        // lighter at the middle; the light roll over the upper lip's border; the corners tucked in
        const lipBase = skin.mul(mix(vec3(0.96, 0.79, 0.77), vec3(0.95, 0.73, 0.71), female)).mul(0.93);
        const stick = female.mul(step(L.lane(77.0), 0.35));
        const lipC = mix(lipBase, pickColorFromPalette(LIP_COLORS, L.lane(79.0)), stick.mul(0.6));
        const upShade = mix(float(0.92), float(0.78), smoothstep(yUL, y0, y));
        const loShade = blob(ax, y.sub(1.5452), float(0.01), float(0.0024)).mul(0.16).add(1.04).sub(smoothstep(y0.sub(0.003), yLL, y).mul(0.1));
        const lipShade = upperL.mul(upShade).add(lowerL.mul(loShade));
        c.assign(mix(c, lipC.mul(lipShade), lips));
        const ml = smoothstep(aa.add(0.0007), float(0.0), abs(y.sub(y0).add(0.0001))).mul(smoothstep(1.08, 0.75, mu)).mul(front)
          .mul(smoothstep(0.1, 0.65, mu).mul(0.3).add(0.6));
        const corners = blob(ax.sub(mw), y.sub(y0), float(0.003), float(0.0022)).mul(front).mul(0.34);
        const roll = smoothstep(0.0013, 0.0, abs(y.sub(yUL).sub(0.001))).mul(lipEnds).mul(front).mul(0.07);
        c.assign(mix(c, skin.mul(0.28), ml.mul(0.85)).mul(float(1.0).sub(corners)).mul(roll.add(1.0)));

        // the older ones (greying): lines across the forehead, under the eyes
        const older = step(L.lane(37.0), 0.25).mul(front).mul(mid);
        const brow3 = sin(y.sub(1.664).mul(Math.PI / 0.0085)).abs().oneMinus().pow(6.0).mul(smoothstep(1.657, 1.662, y)).mul(smoothstep(1.69, 1.682, y)).mul(smoothstep(0.045, 0.02, ax));
        const bags = smoothstep(aa.add(0.0007), float(0.0), abs(ey.sub(yL).add(0.0042).sub(eu.mul(eu).mul(0.0015)))).mul(step(abs(eu), 0.95));
        c.assign(c.mul(float(1.0).sub(brow3.add(bags.mul(0.8)).mul(older).mul(0.1))));

        // nostrils
        const nos = smoothstep(1.0, 0.5, length(vec2(ax.sub(0.0074).div(0.003), y.sub(1.5795).div(0.0017)))).mul(front);
        c.assign(mix(c, skin.mul(0.42), nos.mul(0.6)));

        // the hairline (hairCover), never over the ear (it stands out of the head's side: skin)
        const HC = hairCover(q, L, female, px);
        const hl = HC.hl;
        const hn = mx_noise_float(q.mul(vec3(300.0, 90.0, 300.0)));
        const earBase = y.sub(1.622).mul(0.14).add(0.0781).mul(mix(float(1.0), float(0.94), female));
        const earSkin = smoothstep(earBase.add(0.0025), earBase.add(0.0065), ax).mul(smoothstep(1.57, 1.58, y)).mul(smoothstep(1.66, 1.65, y));
        c.assign(mix(c, hairPaint(q, L, fine), HC.cover.mul(float(1.0).sub(earSkin))));
        // (repair) a buzz cut's shadow on some bald men, above their hairline
        const hl0 = hl.sub(L.bald.mul(0.3));
        const buzzCut = L.bald.mul(step(L.lane(87.0), 0.5)).mul(smoothstep(hl0.add(0.002), hl0.add(0.012), y)).mul(hn.mul(0.12).add(0.3));
        c.assign(mix(c, hair.mul(0.85), buzzCut));
        col.assign(c);
      })
      .Else(() => {
        // ---------------------------------------------------------------- hair (the shell over the scalp, long hair)
        const isLong = step(PART.LONG_HAIR - 0.5, partId);
        // strands run from the crown down: round the head on the shell; round its tube (folded ring) on long hair
        const th0 = mix(atan(q.x, q.z.add(0.012)), atan(q.x, q.z.add(0.03)), isLong);
        // (repair) hair as streaks along the strands, not stripes: noise stretched along them (round the head on a
        // circle, so no seam at the back); a slow warp so they wave; clumps & single strands; big soft masses of light
        // & dark; it all fades to the plain colour toward the crown (no radial fan)
        const warp = mx_noise_float(vec3(sin(th0).mul(1.3), q.y.mul(16.0), along.mul(1.5)));
        const th = th0.add(warp.mul(0.14)).add(L.lane(91.0).mul(6.0));
        const cs = vec2(sin(th), sin(th.add(Math.PI / 2)));
        const clumpN = mx_noise_float(vec3(cs.x.mul(9.0), cs.y.mul(9.0), along.mul(mix(float(2.2), float(1.6), isLong)).add(L.lane(91.0).mul(5.0))));
        const strandN = mx_noise_float(vec3(cs.x.mul(44.0), cs.y.mul(44.0), along.mul(mix(float(7.0), float(5.0), isLong))));
        const crownFade = mix(smoothstep(0.04, 0.34, along), float(1.0), isLong);
        const mass = mx_noise_float(q.mul(24.0).add(L.lane(91.0).mul(7.0))).mul(0.1);
        const tint = clumpN.mul(0.17).mul(mid.mul(0.6).add(0.4)).add(strandN.mul(0.09).mul(fine)).mul(crownFade).add(mass).add(1.0);
        // long hair: lighter, thinner ends; darker on its inner side (toward the neck); the shell's roots in shade
        const ends = smoothstep(0.55, 1.0, along).mul(isLong).mul(0.1);
        const inner = smoothstep(0.15, 0.75, n0.z).mul(isLong).mul(0.3);
        const edge = smoothstep(0.7, 0.92, along).mul(float(1.0).sub(isLong));
        const roots = smoothstep(0.62, 0.95, along).mul(float(1.0).sub(isLong)).mul(0.1).mul(float(1.0).sub(edge));
        // salt & pepper on the grey ones: grey strands among their own colour
        const sp = L.grey.mul(clumpN.mul(0.2).add(strandN.mul(0.22).mul(fine)));
        const hairCol = mix(L.hairBase, color(GREY_HAIR), clamp(L.grey.mul(0.62).add(sp), 0.0, 1.0));
        const hairC0 = hairCol.mul(tint.add(ends).sub(inner).sub(roots));
        // the shell's edge thins to the scalp; temples receding on some men. (round 3 repair) Over its last ~2 cm it takes
        // the colour the head's hairline is painted in (hairPaint, the same function of the position), so the two meet
        // with no rim and no flat band
        const temple = blob(abs(th0).sub(0.95), float(0.0), float(0.3), float(1.0)).mul(float(1.0).sub(female)).mul(L.lane(83.0));
        const hairC = mix(mix(hairC0, hairPaint(q, L, fine), edge), skin.mul(0.95), clamp(edge.mul(temple).mul(0.6), 0.0, 1.0));
        // a bald head: the scalp (a buzzed shadow on some)
        const buzz = step(L.lane(87.0), 0.5).mul(smoothstep(1.7, 1.66, q.y)).mul(0.3);
        const scalp = mix(skin.mul(1.03), hair.mul(0.9), buzz);
        // (round 3) toward the silhouette the outer strands separate: streaks of dark & light (light through the thin
        // edge), not a clean shell's rim
        const rimF = smoothstep(0.5, 0.05, abs(dot(normalView, positionViewDirection)));
        const hairR = hairC.mul(clumpN.mul(0.35).add(strandN.mul(0.45)).mul(rimF).add(1.0)).add(hairCol.mul(rimF.mul(0.1)));
        col.assign(mix(hairR, scalp, L.bald));
      });
    return col;
  })();

  mat.roughnessNode = Fn(() => {
    const L = personLooks(vInfo);
    const partId = partOf();
    const q = attribute('position', 'vec3');
    const ax = abs(q.x);
    const front = smoothstep(0.04, 0.066, q.z);
    // face: oilier down the T, the lips, the eyes wet; hair & cloth by kind; leather shoes
    const sq = (v) => v.mul(v);
    const eye = step(sq(ax.sub(0.0315).div(0.0128)).add(sq(q.y.sub(1.6272).div(0.0052))), 1.0).mul(front);
    const lipsR = step(sq(ax.div(0.0215)).add(sq(q.y.sub(1.5485).div(0.0068))), 1.0).mul(front);
    // (round 3) the T-zone a broad, faint patch over the nose and the middle of the forehead (it was a 2 cm stripe up
    // to the hairline: a light seam down the face)
    const tzone = blob(ax, q.y.sub(1.598), float(0.011), float(0.022)).mul(0.6).add(blob(ax, q.y.sub(1.672), float(0.03), float(0.016)).mul(0.45)).mul(front);
    const headR0 = mix(mix(mix(float(0.64), float(0.54), tzone), float(0.36), lipsR), float(0.42), eye);
    // (repair) where the head is painted with hair (above the soft hairline, hairCover), the hair's roughness
    const hlR = hairlineOf(q, L, L.female).hl;
    const hairOn = smoothstep(hlR.sub(0.012), hlR.sub(0.003), q.y).mul(float(1.0).sub(L.bald));
    const headR = mix(headR0, float(0.62), hairOn);
    // (repair) hair: matte, its sheen broken into streaks along the strands (no smooth helmet highlight)
    const hairR = float(0.62).toVar();
    If(partId.greaterThan(5.5), () => {
      const isLong = step(PART.LONG_HAIR - 0.5, partId);
      const th = mix(atan(q.x, q.z.add(0.012)), atan(q.x, q.z.add(0.03)), isLong).add(L.lane(91.0).mul(6.0));
      const along = attribute('extra', 'vec3').z;
      const streak = mx_noise_float(vec3(sin(th).mul(20.0), sin(th.add(Math.PI / 2)).mul(20.0), along.mul(4.0)));
      hairR.assign(streak.mul(0.16).add(0.56));
    });
    const fabric = mix(mix(mix(mix(mix(float(0.86), float(0.8), L.tailored), mix(float(0.72), float(0.44), L.puffer), L.zip), float(0.95), L.knit), float(0.93), L.hoodie), float(0.9), L.tee);
    const legsR = mix(float(0.85), float(0.93), L.denim);
    const leather = step(L.lane(5.0), 0.4);
    const shoeR = mix(float(0.62), float(0.34), leather);
    return mix(mix(mix(mix(mix(mix(fabric, legsR, isPart(partId, PART.LEG)), shoeR, isPart(partId, PART.SHOE)), fabric, isPart(partId, PART.ARM)), float(0.55), isPart(partId, PART.HAND)), headR, isPart(partId, PART.HEAD)), hairR, step(PART.HAIR - 0.5, partId));
  })();
}

// ============================================================================
// 4. CROWD: ONE INSTANCED, SKINNED DRAW PER LEVEL OF DETAIL
// ============================================================================
class PersonCrowd {
  /**
   * @param {number} maxCount - most people drawn at once
   * @param {{ farDistance?: number, castShadow?: boolean, farShadow?: boolean, name?: string }} options - beyond
   *   farDistance (m) people use the far LOD (casting shadows unless farShadow is false); name prefixes the meshes'
   */
  constructor(maxCount, { farDistance = 34, castShadow = true, farShadow = true, name = 'People' } = {}) {
    this.farDistance = farDistance;
    // (Mog City) Three's WebGL2 backend (no WebGPU: main.js, window.NYC.quality) can't read a person's pose from the
    // storage buffer: a crowd is never drawn there (no layer to be seen on, whatever its visibility)
    const drawable = !(window.NYC.quality && window.NYC.quality.backend === 'webgl2');
    this.lods = [1, 0].map((detail) => {
      const pose = attributeArray(maxCount * STRIDE, 'vec4').toReadOnly();
      const mesh = new THREE.Mesh(buildPersonGeometry(detail), createPersonMaterial(pose, detail));
      mesh.name = name + (detail ? 'Near' : 'Far');
      mesh.count = 1; // one (degenerate) person until the first frame, so the pipelines compile up front
      mesh.frustumCulled = false;
      mesh.castShadow = castShadow && (detail === 1 || farShadow);
      mesh.receiveShadow = true;
      if (!drawable) mesh.layers.disableAll();
      return { pose, mesh, count: 0, max: maxCount };
    });
    this.meshes = this.lods.map((l) => l.mesh);
  }

  begin() {
    for (const l of this.lods) l.count = 0;
  }

  add(rig, distance = 0) {
    const l = this.lods[distance > this.farDistance ? 1 : 0];
    if (l.count >= l.max) return;
    l.pose.value.array.set(rig.pose, l.count * STRIDE * 4);
    l.count++;
  }

  end() {
    for (const l of this.lods) {
      l.mesh.count = l.count;
      if (l.count === 0) continue;
      const attr = l.pose.value;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, l.count * STRIDE * 4);
      attr.needsUpdate = true;
    }
  }
}

// ============================================================================
// 5. PERSON RIG: PLANTED FOOTSTEPS, TWO-BONE IK & A GAIT THAT FOLLOWS THE FEET
// ============================================================================
const GAIT = {
  dutyWalk: 0.6, // share of the gait cycle each foot spends on the ground (a walk always has a foot down)
  dutyRun: 0.29, // ...and running (both feet off the ground in between)
  minCadence: 0.95, // gait cycles per second stepping on the spot
  startCadence: 0.72,
  turnRate: 3.4, // rad/s
  spread: 0.074, // each foot's distance from the line of travel
  toeOut: 0.09,
  heelStrike: -0.26, // foot pitch at heel strike (toes up) and toe-off (heel up)
  toeOff: 0.72,
  heelRoll: 0.14, // share of the stance spent rolling onto the sole, and when the heel comes up
  heelOff: 0.5,
  // (Mog City, 27 Oct) standing, hip to ankle as a share of thigh + shin: the knees soft, ~6 degrees (0.997 was 8.9),
  // not locked; the legs never reach further than this either
  standLeg: 0.9985
};
const HEEL = new THREE.Vector3(0, -ANKLE_H, -0.07); // heel contact, from the ankle
const TOE_JOINT = new THREE.Vector3(0, 0.02 - ANKLE_H, 0.135);

const wrap = (a) => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _qPelvis = new THREE.Quaternion();
const _qChest = new THREE.Quaternion();
const _qUpper = new THREE.Quaternion();
const _qRoot = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _pelvis = new THREE.Vector3();
const _chest = new THREE.Vector3();
const _shoulder = new THREE.Vector3();
const _hip = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _ankle = new THREE.Vector3();
const _target = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _front = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _bx = new THREE.Vector3();
const _by = new THREE.Vector3();
const _bz = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _rootPos = new THREE.Vector3();
const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);
const qX = (out, a) => out.setFromAxisAngle(AX, a);
const qY = (out, a) => out.setFromAxisAngle(AY, a);
const qZ = (out, a) => out.setFromAxisAngle(AZ, a);

// (Mog City) a captured clip's pose (PersonRig.playClip): each bone's parent, and the working rotations and joints
const CLIP_PARENT = [-1, 0, 1, 1, 3, 1, 5, 0, 7, 8, 9, 0, 11, 12, 13];
const _cq = Array.from({ length: BONE_COUNT }, () => new THREE.Quaternion());
const _cj = Array.from({ length: BONE_COUNT }, () => new THREE.Vector3());
const _cA = new THREE.Quaternion();
const _cB = new THREE.Quaternion();
const _cY = new THREE.Quaternion();
const _cv = new THREE.Vector3();
// (Mog City, round 3) relaxing a captured take's arms (PersonRig.relaxArms): each arm's bind direction, the working vectors
const ARM_DIR = SIDES.map((side) => new THREE.Vector3(side * Math.sin(ARM_BIND_ABDUCTION), -Math.cos(ARM_BIND_ABDUCTION), 0));
const _ra = new THREE.Vector3();
const _rb = new THREE.Vector3();
const _rp = new THREE.Vector3();
const _rk = new THREE.Vector3();
const _rc = new THREE.Vector3();
const _rq = new THREE.Quaternion();
const _rs = new THREE.Vector3();
const _rf = new THREE.Vector3();
const _rh = new THREE.Vector3();
const FACE_FROM_HEAD = new THREE.Vector3(0, 0.1, 0.065);
const _rv = new THREE.Vector3();
// (repair) the forearm's direction: the upper arm a turned by the bend vector own + g * x (angle x direction, both
// perpendicular to a), into out; x makes the whole bend th + extra where own leans toward g (th = |own|), eases to a plain
// add where it leans away (g is turning round), and is 0 with nothing extra
function bendDir(out, a, own, g, extra) {
  const th = own.length();
  const c = th > 1e-6 ? Math.max(0, own.dot(g) / th) : 0;
  const M = th + extra;
  const x = Math.sqrt(Math.max(0, M * M - th * th * (1 - c * c))) - th * c;
  const v = _rv.copy(own).addScaledVector(g, x);
  const ang = v.length();
  if (ang < 1e-7) return out.copy(a);
  return out.copy(a).multiplyScalar(Math.cos(ang)).addScaledVector(v, Math.sin(ang) / ang).normalize();
}
const b64i16 = (b64) => {
  const s = atob(b64), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return new Int16Array(u.buffer);
};

function makeFoot(side) {
  return {
    side,
    swing: false,
    // planted: ground point under the ankle (foot flat), heading
    px: 0, py: 0, pz: 0, yaw: 0,
    // current ankle, foot pitch (+ heel up), toe bend (relative), ground contact 0..1
    ax: 0, ay: 0, az: 0, pitch: 0, toe: 0, contact: 1,
    // lift-off state and landing target during a swing
    w: 0, lx: 0, ly: 0, lz: 0, lyaw: 0, lpitch: 0, ltoe: 0, lground: 0,
    tx: 0, ty: 0, tz: 0, tyaw: 0
  };
}

class PersonRig {
  /**
   * @param {object} o - seed (dresses them), scale (height / 1.75 m), female, girth (build, ~0.9-1.15),
   *   hair (0 short .. 0.5 voluminous .. 1 long), armSwing & stride (gait personality, ~1)
   */
  constructor({ seed = 0, scale = 1, female = false, girth = 1, hair = 0.2, armSwing = 1, stride = 1 } = {}) {
    this.seed = seed;
    this.s = scale;
    this.female = female ? 1 : 0;
    this.girth = girth;
    this.hair = hair;
    this.armSwing = armSwing;
    this.stride = stride;
    this.bind = BIND[this.female];
    this.placed = false;
    this.x = 0;
    this.z = 0;
    this.yaw = 0;
    this.vx = 0;
    this.vz = 0;
    this.speed = 0;
    this.gait = 0; // how much of the walking motion shows (0 standing .. 1 walking)
    this.run = 0;
    this.phase = 0.05;
    this.pelvisY = 0;
    this.sway = 0;
    this.air = 0;
    this.time = seed * 7.3;
    this.feet = [makeFoot(1), makeFoot(-1)];
    this.pose = new Float32Array(STRIDE * 4);
    this.pose.set([seed, this.female, girth, hair], (STRIDE - 1) * 4);
    // (round 3) how loose this person's arms are in a cheer or a dance (0.8 .. 1.2)
    const hv = Math.sin(seed * 41.37 + 3.1) * 43758.5453;
    this.armLoose = 0.8 + 0.4 * (hv - Math.floor(hv));
  }

  get legLength() {
    return (THIGH + SHIN) * this.s;
  }

  // Standing still at (x, z) facing yaw, feet side by side on the ground
  reset(x, z, yaw, ground, owner = null) {
    const s = this.s;
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.vx = this.vz = this.speed = 0;
    this.gait = this.run = this.sway = this.air = 0;
    this.phase = 0.05;
    for (const foot of this.feet) {
      this.restPoint(foot, x, z, yaw, _v);
      foot.px = _v.x;
      foot.pz = _v.z;
      foot.py = ground(owner, _v.x, _v.z);
      foot.yaw = yaw + foot.side * GAIT.toeOut;
      foot.swing = false;
      foot.pitch = foot.toe = 0;
      foot.contact = 1;
      this.footAnkle(foot, 0, HEEL);
    }
    this.pelvisY = (this.feet[0].py + this.feet[1].py) * 0.5 + ANKLE_H * s + this.legLength * GAIT.standLeg + (PELVIS_Y - HIP_Y) * s;
    this.placed = true;
    this.solve();
  }

  restPoint(foot, x, z, yaw, out) {
    const d = foot.side * GAIT.spread * this.s;
    return out.set(x + Math.cos(yaw) * d, 0, z - Math.sin(yaw) * d);
  }

  // Ankle of a foot planted at (px, py, pz) heading foot.yaw, pitched by `pitch` about `pivot` (heel or toe joint)
  footAnkle(foot, pitch, pivot) {
    const s = this.s;
    const sn = Math.sin(foot.yaw);
    const cs = Math.cos(foot.yaw);
    const pyl = pivot.y * s;
    const pzl = pivot.z * s;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const vy = -pyl * cp + pzl * sp;
    const vz = -pyl * sp - pzl * cp;
    foot.ax = foot.px + sn * (pzl + vz);
    foot.ay = foot.py + pyl + ANKLE_H * s + vy;
    foot.az = foot.pz + cs * (pzl + vz);
    foot.pitch = pitch;
  }

  /**
   * Walk the body to ground position (x, z), turning towards `heading`. `ground(owner, x, z)` gives the walking
   * surface's height anywhere around. `air` lifts the body off the ground (jumps). Set `updatePose` false for hidden
   * pedestrians: their gait and planted feet still advance, while bone transforms wait until they are drawn.
   */
  update(dt, x, z, heading, ground, owner = null, air = 0, updatePose = true) {
    if (!this.placed || Math.hypot(x - this.x, z - this.z) > 3) {
      this.reset(x, z, heading, ground, owner);
      return;
    }
    dt = Math.min(Math.max(dt, 1e-4), 0.1);
    const s = this.s;
    this.time += dt;

    // Body velocity (smoothed) and heading
    const kv = 1 - Math.exp(-dt / 0.1);
    this.vx += ((x - this.x) / dt - this.vx) * kv;
    this.vz += ((z - this.z) / dt - this.vz) * kv;
    this.x = x;
    this.z = z;
    const speed = (this.speed = Math.hypot(this.vx, this.vz));
    const yawErr = wrap(heading - this.yaw);
    this.yaw = wrap(this.yaw + Math.max(-GAIT.turnRate * dt, Math.min(GAIT.turnRate * dt, yawErr)));
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const fwdSpeed = this.vx * sinY + this.vz * cosY;

    this.gait += (Math.min(1, speed / 0.9) - this.gait) * (1 - Math.exp(-dt / 0.22));
    this.run += (smooth(2.3, 3.6, speed) - this.run) * (1 - Math.exp(-dt / 0.3));
    const run = this.run;
    const duty = lerp(GAIT.dutyWalk, GAIT.dutyRun - 0.07 * smooth(4.5, 8, speed), run);

    // Airborne (jumping): legs tuck under the body, feet land wherever they come down
    this.air += (air - this.air) * (1 - Math.exp(-dt / 0.04));
    if (air > 0.03) {
      for (const foot of this.feet) {
        this.restPoint(foot, x, z, this.yaw, _v);
        foot.swing = false;
        foot.px = _v.x;
        foot.pz = _v.z;
        foot.py = ground(owner, _v.x, _v.z) + air * 0.85 + 0.04 * s;
        foot.yaw = this.yaw + foot.side * GAIT.toeOut;
        foot.contact = 0;
        this.footAnkle(foot, 0.25, HEEL);
        foot.toe = 0;
      }
      this.pelvisY = ground(owner, x, z) + air + ANKLE_H * s + this.legLength * 0.97 + (PELVIS_Y - HIP_Y) * s;
      if (updatePose) this.solve();
      return;
    }

    // Cadence: the walking gait cycle shortens with speed (step length ~0.61 v^0.57 m); running ~1.5 cycles/s jogging,
    // ~2 sprinting
    const moving = speed > 0.08;
    let f = 0;
    if (moving) {
      const walkF = Math.pow(speed, 0.43) / (1.22 * s * this.stride);
      const runF = (1.3 + 0.13 * (speed - 3)) / Math.sqrt(s);
      f = Math.max(GAIT.startCadence, lerp(walkF, runF, run));
    } else {
      let unsettled = Math.abs(yawErr) > 0.12;
      for (const foot of this.feet) {
        this.restPoint(foot, x, z, this.yaw, _v);
        if (Math.hypot(foot.px - _v.x, foot.pz - _v.z) > 0.07 * s) unsettled = true;
        if (Math.abs(wrap(foot.yaw - this.yaw - foot.side * GAIT.toeOut)) > 0.25) unsettled = true;
        if (foot.swing) unsettled = true;
      }
      if (unsettled) f = GAIT.minCadence;
    }
    if (Math.abs(yawErr) > 0.12) f = Math.max(f, GAIT.minCadence);

    // Advance the cycle: feet lift off when their phase passes the duty factor, land when it wraps
    const prev = this.phase;
    this.phase = (this.phase + f * dt) % 1;
    const tSwing = f > 0 ? (1 - duty) / f : 0.4;
    const tStance = f > 0 ? duty / f : 0.6;
    const landFrac = lerp(0.33, 0.33, run); // feet land a third of the stance's travel ahead of the hips
    const g = this.gait;

    for (let i = 0; i < 2; i++) {
      const foot = this.feet[i];
      const off = i === 0 ? 0 : 0.5;
      const lp0 = (prev + off) % 1;
      const lp = (this.phase + off) % 1;
      if (f > 0 && foot.swing && lp < lp0) {
        // touch down on the target
        foot.swing = false;
        foot.px = foot.tx;
        foot.py = foot.ty;
        foot.pz = foot.tz;
        foot.yaw = foot.tyaw;
      } else if (f > 0 && !foot.swing && lp >= duty && lp >= lp0) {
        // lift off
        foot.swing = true;
        foot.lx = foot.ax;
        foot.ly = foot.ay;
        foot.lz = foot.az;
        foot.lyaw = foot.yaw;
        foot.lpitch = foot.pitch;
        foot.ltoe = foot.toe;
        foot.lground = foot.py;
      }

      if (foot.swing) {
        const w = (foot.w = clamp01((lp - duty) / (1 - duty)));
        // Where to land: under the hips' future position, ahead by the share of the next stance's travel
        const tRem = (1 - w) * tSwing;
        const yawPred = this.yaw + Math.max(-GAIT.turnRate * tRem, Math.min(GAIT.turnRate * tRem, wrap(heading - this.yaw)));
        const sn = Math.sin(yawPred);
        const cs = Math.cos(yawPred);
        const lead = fwdSpeed * tStance * landFrac;
        const lat = foot.side * GAIT.spread * s;
        foot.tx = x + this.vx * tRem + sn * lead + cs * lat;
        foot.tz = z + this.vz * tRem + cs * lead - sn * lat;
        foot.ty = ground(owner, foot.tx, foot.tz);
        foot.tyaw = yawPred + foot.side * GAIT.toeOut;

        // Landing pose (heel strike), then the swing from the lift-off pose to it
        const sx = foot.px, sy = foot.py, sz = foot.pz, syaw = foot.yaw;
        foot.px = foot.tx;
        foot.py = foot.ty;
        foot.pz = foot.tz;
        foot.yaw = foot.tyaw;
        const strike = GAIT.heelStrike * g * (1 - run * 0.5);
        this.footAnkle(foot, strike, HEEL);
        const ex = foot.ax, ey = foot.ay, ez = foot.az;
        foot.px = sx;
        foot.py = sy;
        foot.pz = sz;
        foot.yaw = syaw;

        const e = lerp(w * w * (3 - 2 * w), smooth(0.12, 1, w), run);
        const stepLen = Math.hypot(ex - foot.lx, ez - foot.lz);
        // foot clearance; running, the heel flicks up behind early in the swing
        const clearance =
          (0.03 + 0.055 * Math.min(1, stepLen / (0.9 * s))) * s * (1 - run) + run * 0.3 * s + Math.max(0, foot.ty - foot.lground) * 1.15;
        const bump = lerp(Math.sin(Math.PI * w) * (1.12 - 0.3 * w), Math.sin(Math.PI * Math.pow(w, 0.6)), run);
        foot.ax = lerp(foot.lx, ex, e);
        foot.ay = lerp(foot.ly, ey, e) + clearance * bump;
        foot.az = lerp(foot.lz, ez, e);
        foot.pitch = foot.lpitch * (1 - smooth(0, 0.5, w)) + strike * smooth(0.35, 1, w) - 0.12 * g * Math.sin(Math.PI * w) * (1 - run);
        foot.toe = foot.ltoe * (1 - smooth(0, 0.3, w));
        foot.swingYaw = foot.lyaw + wrap(foot.tyaw - foot.lyaw) * e;
        foot.contact = Math.max(0.25 * (1 - smooth(0, 0.2, w)), smooth(0.82, 1, w));
      } else {
        // Stance: roll onto the sole, then up onto the toes (handing the body's weight over to the other foot)
        const u = clamp01(lp / duty);
        let pitch = 0;
        let pivot = HEEL;
        if (u < GAIT.heelRoll) {
          const t = 1 - u / GAIT.heelRoll;
          pitch = GAIT.heelStrike * g * (1 - run * 0.5) * t * t;
        } else if (u > GAIT.heelOff) {
          const t = (u - GAIT.heelOff) / (1 - GAIT.heelOff);
          pitch = GAIT.toeOff * g * Math.pow(t, 1.6);
          pivot = TOE_JOINT;
        }
        this.footAnkle(foot, pitch, pivot);
        foot.toe = pitch > 0 ? -pitch : 0;
        foot.swingYaw = foot.yaw;
        // running, a foot carries the body only until mid-stance; behind the hips the leg just pushes off
        foot.contact = 1 - 0.75 * smooth(lerp(GAIT.heelOff, 0.3, run), lerp(1, 0.62, run), u) * Math.max(g, run);
        foot.stance = Math.sin(Math.PI * u);
      }
      if (foot.swing) foot.stance = 0;
    }

    // Pelvis: as high as the planted legs reach, never above a slightly bent standing height; sways over the foot
    // carrying the weight
    const left = this.feet[0];
    const right = this.feet[1];
    const zl = (left.ax - x) * sinY + (left.az - z) * cosY;
    const zr = (right.ax - x) * sinY + (right.az - z) * cosY;
    const spreadF = (zl - zr) / s; // > 0 with the left foot ahead
    const latL = (left.ax - x) * cosY - (left.az - z) * sinY;
    const latR = (right.ax - x) * cosY - (right.az - z) * sinY;
    const cSum = left.contact + right.contact;
    const swayTarget = cSum > 0.01 ? ((left.contact * latL + right.contact * latR) / cSum) * 0.42 * g * (1 - run * 0.6) : 0;
    this.sway += (swayTarget - this.sway) * (1 - Math.exp(-dt / 0.12));

    this.pelvisYaw = Math.max(-0.13, Math.min(0.13, -0.13 * spreadF * g));
    this.pelvisRoll = 0.045 * g * (left.contact - right.contact) * (1 - run * 0.5);
    this.pelvisTilt = 0.035 + 0.035 * g + 0.12 * run;
    this.spreadF = spreadF;
    this.setPelvisRotation();

    const groundAvg = cSum > 0.01 ? (left.contact * left.py + right.contact * right.py) / cSum : (left.py + right.py) * 0.5;
    const bend = lerp(lerp(GAIT.standLeg, 0.989, g), 0.965, run); // knees all but straight standing, ~15 degrees at mid-stance
    // running: the legs give under the landing (lowest at mid-stance), the body floats between steps
    const compress = run * s * (0.075 * Math.max(left.stance || 0, right.stance || 0) - 0.015);
    let target = groundAvg + ANKLE_H * s + this.legLength * bend + (PELVIS_Y - HIP_Y) * s - compress;
    const reach = this.legLength * GAIT.standLeg;
    const hard = [Infinity, Infinity];
    for (let i = 0; i < 2; i++) {
      const foot = this.feet[i];
      this.hipOffset(i, _v);
      const hx = x + cosY * this.sway + _v.x;
      const hz = z - sinY * this.sway + _v.z;
      const d = Math.hypot(foot.ax - hx, foot.az - hz);
      const top = foot.ay + Math.sqrt(Math.max(0, reach * reach - d * d)) - _v.y;
      if (foot.contact > 0.97) hard[i] = top;
      target = Math.min(target, top + (1 - foot.contact) * lerp(0.35, 1.5, run));
    }
    this.pelvisY += (target - this.pelvisY) * (1 - Math.exp(-dt / 0.045));
    this.pelvisY = Math.min(this.pelvisY, hard[0], hard[1]);
    if (updatePose) this.solve();
  }

  setPelvisRotation() {
    qY(_qPelvis, this.yaw + this.pelvisYaw);
    _qPelvis.multiply(qZ(_q, this.pelvisRoll)).multiply(qX(_q, this.pelvisTilt));
  }

  // Hip joint relative to the pelvis joint (out.y < 0: the hips are below it)
  hipOffset(i, out) {
    const j = this.bind;
    return out.copy(j[LIMB.thigh[i]]).sub(j[BONE.PELVIS]).multiplyScalar(this.s).applyQuaternion(_qPelvis);
  }

  writeBone(b, q, p) {
    const s = this.s;
    _v2.copy(this.bind[b]).applyQuaternion(q).multiplyScalar(s);
    const o = b * 8;
    const a = this.pose;
    a[o] = q.x;
    a[o + 1] = q.y;
    a[o + 2] = q.z;
    a[o + 3] = q.w;
    a[o + 4] = p.x - _v2.x;
    a[o + 5] = p.y - _v2.y;
    a[o + 6] = p.z - _v2.z;
    a[o + 7] = s;
  }

  // Bone rotation whose +Y points `up` (from the child joint to this one) and +Z towards `front`
  basis(up, front, out) {
    _by.copy(up).normalize();
    _bz.copy(front).addScaledVector(_by, -front.dot(_by));
    if (_bz.lengthSq() < 1e-8) _bz.set(0, 0, 1).addScaledVector(_by, -_by.z);
    _bz.normalize();
    _bx.crossVectors(_by, _bz);
    _m.makeBasis(_bx, _by, _bz);
    return out.setFromRotationMatrix(_m);
  }

  // Two-bone leg IK from the hip to the ankle target, knee towards the foot's heading
  solveLeg(i, hip, ankleTarget, footYaw) {
    const s = this.s;
    const l1 = THIGH * s;
    const l2 = SHIN * s;
    _v.subVectors(ankleTarget, hip);
    let dist = _v.length();
    const dn = _v.divideScalar(dist || 1);
    dist = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min((l1 + l2) * 0.9999, dist));
    _pole.set(Math.sin(footYaw) + Math.sin(this.yaw), 0, Math.cos(footYaw) + Math.cos(this.yaw));
    _pole.addScaledVector(dn, -_pole.dot(dn));
    if (_pole.lengthSq() < 1e-8) _pole.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    _pole.normalize();
    const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    _knee.copy(hip).addScaledVector(dn, l1 * cosA).addScaledVector(_pole, l1 * sinA);
    _ankle.copy(hip).addScaledVector(dn, dist);
    this.reachError = Math.max(this.reachError || 0, _ankle.distanceTo(ankleTarget));
    if (this.feet[i].contact > 0.97) this.stanceReachError = Math.max(this.stanceReachError || 0, _ankle.distanceTo(ankleTarget));
    const front = _front.set(Math.sin(footYaw), 0, Math.cos(footYaw)).add(_pole);
    this.writeBone(LIMB.thigh[i], this.basis(_v2.subVectors(hip, _knee), front, _q), hip);
    this.writeBone(LIMB.shin[i], this.basis(_v2.subVectors(_knee, _ankle), front, _q), _knee);
    return _ankle;
  }

  // Bones of the whole body from the feet, pelvis and gait state (world space)
  solve() {
    const s = this.s;
    const j = this.bind;
    const g = this.gait;
    const run = this.run;
    const yaw = this.yaw;
    if (this.pelvisYaw === undefined) {
      this.pelvisYaw = this.pelvisRoll = 0;
      this.pelvisTilt = 0.035;
      this.spreadF = 0;
    }
    this.setPelvisRotation();
    _pelvis.set(this.x + Math.cos(yaw) * this.sway, this.pelvisY, this.z - Math.sin(yaw) * this.sway);
    this.writeBone(BONE.PELVIS, _qPelvis, _pelvis);

    // Chest counter-rotates against the pelvis, leans into the walk; the head stays level, looking ahead
    const idle = 1 - g;
    const breathe = Math.sin(this.time * 1.7) * 0.008 * idle;
    _qChest.copy(_qPelvis)
      .multiply(qY(_q, -1.75 * this.pelvisYaw))
      .multiply(qX(_q, 0.015 + 0.03 * g + 0.14 * run + breathe))
      .multiply(qZ(_q, -0.8 * this.pelvisRoll));
    _chest.copy(j[BONE.CHEST]).sub(j[BONE.PELVIS]).multiplyScalar(s).applyQuaternion(_qPelvis).add(_pelvis);
    this.writeBone(BONE.CHEST, _qChest, _chest);

    const look = Math.sin(this.time * 0.37 + this.seed) * 0.25 * idle * idle;
    qY(_qa, yaw + look).multiply(qX(_q, 0.05 - 0.1 * run));
    _v.copy(j[BONE.HEAD]).sub(j[BONE.CHEST]).multiplyScalar(s).applyQuaternion(_qChest).add(_chest);
    this.writeBone(BONE.HEAD, _qa, _v);

    // Arms swing against the legs (elbows bend more on the forward swing, ~90 degrees running)
    const swingAmp = 0.42 * this.armSwing * g * (1 + run * 0.6);
    for (let i = 0; i < 2; i++) {
      const side = SIDES[i];
      const flex = 0.06 - side * this.spreadF * swingAmp + idle * 0.02;
      const abduction = 0.1 + (this.girth - 1) * 0.35 + run * 0.08;
      _shoulder.copy(j[LIMB.upperArm[i]]).sub(j[BONE.CHEST]).multiplyScalar(s).applyQuaternion(_qChest).add(_chest);
      _qUpper.copy(_qChest).multiply(qZ(_q, side * (abduction - ARM_BIND_ABDUCTION))).multiply(qX(_q, -flex));
      this.writeBone(LIMB.upperArm[i], _qUpper, _shoulder);
      const elbow = 0.2 + 0.55 * Math.max(0, flex) + 0.1 * g + run * 1.05;
      _v.copy(j[LIMB.forearm[i]]).sub(j[LIMB.upperArm[i]]).multiplyScalar(s).applyQuaternion(_qUpper).add(_shoulder);
      _q2.copy(_qUpper).multiply(qX(_q, -elbow));
      this.writeBone(LIMB.forearm[i], _q2, _v);
    }

    // Legs: IK to the ankles, then the feet & toes
    for (let i = 0; i < 2; i++) {
      const foot = this.feet[i];
      const footYaw = foot.swing ? foot.swingYaw : foot.yaw;
      _hip.copy(j[LIMB.thigh[i]]).sub(j[BONE.PELVIS]).multiplyScalar(s).applyQuaternion(_qPelvis).add(_pelvis);
      _target.set(foot.ax, foot.ay, foot.az);
      const ankle = this.solveLeg(i, _hip, _target, footYaw);
      qY(_qa, footYaw).multiply(qX(_q, foot.pitch));
      this.writeBone(LIMB.foot[i], _qa, ankle);
      _v.copy(j[LIMB.toe[i]]).sub(j[LIMB.foot[i]]).multiplyScalar(s).applyQuaternion(_qa).add(ankle);
      qY(_q2, footYaw).multiply(qX(_q, foot.pitch + foot.toe));
      this.writeBone(LIMB.toe[i], _q2, _v);
    }
  }

  /**
   * Knocked flying (Mog City, wagmi/street): the whole body turned by `q` (world; +Y head, +Z front, +X its left)
   * about the pelvis joint at `pos`. `flail` 0..1: limbs flung out, windmilling and kicking (in the air) .. limp,
   * spread a little (lying); `curl` 0..1: knees and arms drawn in (getting up); `t` the clock they flail by. The walk
   * picks up afresh after it (reset).
   */
  tumble(pos, q, { flail = 0, curl = 0, t = 0 } = {}) {
    const s = this.s;
    const j = this.bind;
    const k = this.seed * 3.7;
    this.placed = false;
    this.writeBone(BONE.PELVIS, q, pos);
    _qChest.copy(q).multiply(qX(_q, 0.08 + 0.3 * flail * Math.sin(t * 6.3 + k) + 0.35 * curl));
    _chest.copy(j[BONE.CHEST]).sub(j[BONE.PELVIS]).multiplyScalar(s).applyQuaternion(q).add(pos);
    this.writeBone(BONE.CHEST, _qChest, _chest);
    _qa.copy(_qChest).multiply(qX(_q, 0.1 - 0.35 * flail * Math.sin(t * 8.1 + k * 2)));
    _v.copy(j[BONE.HEAD]).sub(j[BONE.CHEST]).multiplyScalar(s).applyQuaternion(_qChest).add(_chest);
    this.writeBone(BONE.HEAD, _qa, _v);
    for (let i = 0; i < 2; i++) {
      const side = SIDES[i];
      const ph = t * (8.6 + i * 1.9) + k + i * 2.1;
      const abduction = lerp(lerp(0.55, 1.3 + 0.55 * Math.sin(ph), flail), 0.2, curl);
      const flex = lerp(lerp(0.15, 1.5 * Math.sin(ph * 0.8 + 1), flail), 1.0, curl);
      const elbow = lerp(lerp(0.3, 0.45 + 0.75 * Math.abs(Math.sin(ph * 1.3)), flail), 1.5, curl);
      _shoulder.copy(j[LIMB.upperArm[i]]).sub(j[BONE.CHEST]).multiplyScalar(s).applyQuaternion(_qChest).add(_chest);
      _qUpper.copy(_qChest).multiply(qZ(_q, side * (abduction - ARM_BIND_ABDUCTION))).multiply(qX(_q, -flex));
      this.writeBone(LIMB.upperArm[i], _qUpper, _shoulder);
      _v.copy(j[LIMB.forearm[i]]).sub(j[LIMB.upperArm[i]]).multiplyScalar(s).applyQuaternion(_qUpper).add(_shoulder);
      _q2.copy(_qUpper).multiply(qX(_q, -elbow));
      this.writeBone(LIMB.forearm[i], _q2, _v);
    }
    for (let i = 0; i < 2; i++) {
      const side = SIDES[i];
      const ph = t * (7.4 + i * 1.3) + k * 1.7 + i * 3.1;
      const hip = lerp(lerp(0.12, 0.55 + 0.75 * Math.sin(ph), flail), 1.75, curl);
      const splay = lerp(lerp(0.14, 0.32 + 0.22 * Math.sin(ph * 0.7), flail), 0.08, curl);
      const knee = lerp(lerp(0.18, 0.35 + 0.8 * Math.abs(Math.sin(ph * 1.1)), flail), 2.3, curl);
      _hip.copy(j[LIMB.thigh[i]]).sub(j[BONE.PELVIS]).multiplyScalar(s).applyQuaternion(q).add(pos);
      _qa.copy(q).multiply(qZ(_q, side * splay)).multiply(qX(_q, -hip));
      this.writeBone(LIMB.thigh[i], _qa, _hip);
      _knee.copy(j[LIMB.shin[i]]).sub(j[LIMB.thigh[i]]).multiplyScalar(s).applyQuaternion(_qa).add(_hip);
      _q2.copy(_qa).multiply(qX(_q, knee));
      this.writeBone(LIMB.shin[i], _q2, _knee);
      _ankle.copy(j[LIMB.foot[i]]).sub(j[LIMB.shin[i]]).multiplyScalar(s).applyQuaternion(_q2).add(_knee);
      _qRoot.copy(_q2).multiply(qX(_q, 0.35 * (1 - curl) - 0.5 * curl));
      this.writeBone(LIMB.foot[i], _qRoot, _ankle);
      _v.copy(j[LIMB.toe[i]]).sub(j[LIMB.foot[i]]).multiplyScalar(s).applyQuaternion(_qRoot).add(_ankle);
      this.writeBone(LIMB.toe[i], _qRoot, _v);
    }
  }

  /**
   * (Mog City) A captured clip played in place: the rally crowd's dances and cheers (wagmi/mission/m3-set.js,
   * assets/anim/bandai/rally-crowd-ped.json: Bandai Namco Research Motion Dataset, CC BY-NC 4.0, see NOTICE).
   * C = { fps, n, q, p }: per frame, each bone's world rotation from the bind (facing +Z, +X its left) and the pelvis
   * joint from the ground point (mm), int16. At clip time t (looping), standing at (x, z) facing yaw on the ground at
   * groundY: the bones posed by forward kinematics from the pelvis as in tumble(), on this person's own bind and scale
   * (a woman's, a broader build). The walk picks up afresh after it.
   */
  playClip(C, t, x, z, yaw, groundY) {
    if (!C.Q) { C.Q = b64i16(C.q); C.P = b64i16(C.p); }
    const s = this.s;
    const j = this.bind;
    const Q = C.Q;
    const P = C.P;
    const last = C.n - 1;
    const f = (((t * C.fps) % last) + last) % last;
    const i0 = Math.floor(f);
    const i1 = Math.min(last, i0 + 1);
    const u = f - i0;
    this.placed = false;
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    qY(_cY, yaw);
    for (let k = 0; k < BONE_COUNT; k++) {
      const a = (i0 * BONE_COUNT + k) * 4;
      const b = (i1 * BONE_COUNT + k) * 4;
      _cA.set(Q[a], Q[a + 1], Q[a + 2], Q[a + 3]).normalize();
      _cB.set(Q[b], Q[b + 1], Q[b + 2], Q[b + 3]).normalize();
      _cq[k].slerpQuaternions(_cA, _cB, u);
    }
    this.relaxArms(t);
    for (let k = 0; k < BONE_COUNT; k++) _cq[k].premultiply(_cY);
    _cv.set(lerp(P[i0 * 3], P[i1 * 3], u), lerp(P[i0 * 3 + 1], P[i1 * 3 + 1], u), lerp(P[i0 * 3 + 2], P[i1 * 3 + 2], u))
      .multiplyScalar(0.001 * s).applyQuaternion(_cY);
    _cj[BONE.PELVIS].set(x + _cv.x, groundY + _cv.y, z + _cv.z);
    for (let k = 1; k < BONE_COUNT; k++) {
      const pa = CLIP_PARENT[k];
      _cj[k].copy(j[k]).sub(j[pa]).multiplyScalar(s).applyQuaternion(_cq[pa]).add(_cj[pa]);
    }
    for (let k = 0; k < BONE_COUNT; k++) this.writeBone(k, _cq[k], _cj[k]);
  }

  /**
   * (Mog City, round 3) A captured take's arms, relaxed (on _cq, the body's frame, facing +Z): the takes lock the elbows
   * near straight whenever the arms go up or out (stiff tubes, a T-pose in the near crowd). Each elbow bends at least a
   * little more the higher the upper arm is raised: none added hanging (the take's own), ~50 degrees with the arm out
   * level, ~30 overhead (this person's own looseness, breathing slowly with the beat); a soft minimum, so a take that
   * already bends more keeps its own. The bend stays in the plane the take bends it in, or, nearly straight, folds the
   * forearm in toward the head & up (a little to the front): arms raised in a V, out level like goal posts. The forearm's own twist is kept.
   * (repair) Continuous in time: the forearm never jumps between frames. The bend is the take's own (angle x direction,
   * round the upper arm) plus the added bend along a fold direction each arm holds (this._fold), which follows its
   * target (the take's own direction once it bends clearly, else in toward the head) at a limited speed, so when the
   * take straightens and re-bends the other way the added bend eases across instead of flipping; no hard cut-offs; the
   * hand kept off the face by a smooth scale (the most of the bend that keeps it 20 cm off, eased), not by halving.
   */
  relaxArms(t) {
    const j = this.bind;
    const F = this._fold || (this._fold = { t: -1e9, g: [new THREE.Vector3(), new THREE.Vector3()], add: [0, 0], ok: [false, false] });
    const dt = t - F.t;
    F.t = t;
    const fresh = !(dt >= 0 && dt < 0.3); // (a jump in time: the fold set afresh)
    const follow = 6 * Math.max(0, dt); // how far the fold direction may turn this step (~6 rad/s)
    // (the face, in the body's frame from the pelvis: a hand is never folded onto it)
    const chest = _rf.copy(j[BONE.CHEST]).sub(j[BONE.PELVIS]).applyQuaternion(_cq[BONE.PELVIS]);
    const face = _rh.copy(j[BONE.HEAD]).sub(j[BONE.CHEST]).applyQuaternion(_cq[BONE.CHEST]).add(chest);
    _rs.copy(FACE_FROM_HEAD).applyQuaternion(_cq[BONE.HEAD]);
    face.add(_rs);
    for (let k = 0; k < 2; k++) {
      const side = SIDES[k];
      const qF = _cq[LIMB.forearm[k]];
      const a = _ra.copy(ARM_DIR[k]).applyQuaternion(_cq[LIMB.upperArm[k]]);
      const b = _rb.copy(ARM_DIR[k]).applyQuaternion(qF);
      const cosT = Math.max(-1, Math.min(1, a.dot(b)));
      const th = Math.acos(cosT);
      const e = Math.asin(Math.max(-1, Math.min(1, a.y))); // the upper arm's elevation (0 level, +PI/2 straight up)
      const want = this.armLoose * smooth(-0.85, -0.15, e) * (0.86 - 0.3 * smooth(0.35, 1.2, e)) * (1 + 0.12 * Math.sin(t * 1.7 + this.seed * 3 + k * 2.1));
      const add = 0.08 * Math.log1p(Math.exp(Math.min(30, (want - th) / 0.08))); // soft max(want - th, 0)
      // the take's own bend as a vector round the upper arm (angle x direction): _rk = th * its direction
      const own = _rk.copy(b).addScaledVector(a, -cosT);
      const sinT = own.length();
      own.multiplyScalar(th / Math.max(sinT, 1e-6));
      // the fold's target: in toward the head & up, a little to the front (perpendicular to the upper arm), or the
      // take's own direction once it bends clearly
      const p = _rp.set(-side * 0.75, 0.6, 0.35);
      p.addScaledVector(a, -p.dot(a));
      if (p.lengthSq() < 1e-6) p.set(0, 0, 1).addScaledVector(a, -a.z);
      p.normalize();
      const w = smooth(0.17, 0.45, th);
      if (w > 0) p.multiplyScalar(1 - w).addScaledVector(own, w / Math.max(th, 1e-6));
      const g = F.g[k];
      if (p.lengthSq() > 1e-4) p.normalize();
      else p.copy(F.ok[k] ? g : p.set(0, 0, 1).addScaledVector(a, -a.z).normalize()); // (no clear target: hold)
      if (fresh || !F.ok[k]) { g.copy(p); F.add[k] = add; }
      else {
        // (kept round the upper arm as it moves; turned toward the target round it, at most `follow` radians a step: a
        // turn of more than ~150 degrees goes round the front, so a hand never sweeps back through the head)
        g.addScaledVector(a, -g.dot(a));
        if (g.lengthSq() < 1e-8) g.copy(p);
        g.normalize();
        const ang = Math.acos(Math.max(-1, Math.min(1, g.dot(p))));
        if (ang > 1e-5) {
          let sense = Math.sign(_rc.crossVectors(g, p).dot(a)) || 1;
          if (ang > 2.6) sense = _rc.crossVectors(a, g).z >= 0 ? 1 : -1;
          _rq.setFromAxisAngle(a, sense * Math.min(ang, follow));
          g.applyQuaternion(_rq);
        }
        // (the added bend eased a little, so a fast raise of the arm does not whip the forearm)
        F.add[k] += (add - F.add[k]) * (1 - Math.exp(-dt / 0.05));
      }
      F.ok[k] = true;
      const addS = F.add[k];
      if (addS < 1e-4) continue;
      // (the hand kept off the face: of the added bend, the most that keeps the hand 20 cm off it (or as far as the take
      // has it), eased over 5 cm; a max of continuous terms, so it never steps)
      const elbow = _rs.copy(j[LIMB.upperArm[k]]).sub(j[BONE.CHEST]).applyQuaternion(_cq[BONE.CHEST]).add(chest).addScaledVector(a, UPPER_ARM);
      const reach = FOREARM + 0.07;
      const d0 = Math.hypot(elbow.x + b.x * reach - face.x, elbow.y + b.y * reach - face.y, elbow.z + b.z * reach - face.z);
      const lim = Math.min(0.2, d0);
      const bNew = _rc;
      let keep = 0;
      for (let it = 4; it >= 1; it--) {
        const sc = it / 4;
        bendDir(bNew, a, own, g, addS * sc);
        const dh = Math.hypot(elbow.x + bNew.x * reach - face.x, elbow.y + bNew.y * reach - face.y, elbow.z + bNew.z * reach - face.z);
        keep = Math.max(keep, sc * smooth(lim - 0.05, lim, dh));
        if (keep >= 1) break;
      }
      if (addS * keep < 1e-4) continue;
      bendDir(bNew, a, own, g, addS * keep);
      _rq.setFromUnitVectors(b, bNew);
      qF.premultiply(_rq);
    }
  }

  /**
   * (Mog City, 27 Oct) Easing out of a pose kept from before (a captured take's last frame, kept with
   * `prev.set(rig.pose)`), into the one just solved: called after update(), it mixes `prev` back in by k (1 all of it
   * .. 0 none): each bone's turn slerped, the joints rebuilt down the bones from the mixed pelvis (as playClip builds
   * them), so no bone stretches on the way; a dancer turning to run blends over a quarter second instead of a pop
   */
  fadeFrom(prev, k) {
    if (!(k > 0.001)) return;
    k = Math.min(1, k);
    const s = this.s;
    const j = this.bind;
    const a = this.pose;
    for (let b = 0; b < BONE_COUNT; b++) {
      const o = b * 8;
      _cA.set(a[o], a[o + 1], a[o + 2], a[o + 3]);
      _cB.set(prev[o], prev[o + 1], prev[o + 2], prev[o + 3]);
      if (b === BONE.PELVIS) {
        // (each pose's pelvis joint: its translation plus the turned bind, mixed)
        _cv.copy(j[b]).applyQuaternion(_cA).multiplyScalar(s).add(_v2.set(a[o + 4], a[o + 5], a[o + 6]));
        _cj[b].copy(j[b]).applyQuaternion(_cB).multiplyScalar(s).add(_v2.set(prev[o + 4], prev[o + 5], prev[o + 6])).sub(_cv).multiplyScalar(k).add(_cv);
      }
      _cq[b].slerpQuaternions(_cA, _cB, k);
    }
    for (let b = 1; b < BONE_COUNT; b++) {
      const pa = CLIP_PARENT[b];
      _cj[b].copy(j[b]).sub(j[pa]).multiplyScalar(s).applyQuaternion(_cq[pa]).add(_cj[pa]);
    }
    for (let b = 0; b < BONE_COUNT; b++) this.writeBone(b, _cq[b], _cj[b]);
  }

  /**
   * Riding a bicycle: `root` (Object3D) is the bike frame (pose in its parent's space, e.g. the scene), `crank` the
   * pedal crank angle. Seat, bars and bottom bracket in the frame's space (metres, +Z forward).
   */
  ride(root, crank, { seat, bars, gripHalf = 0.22, bracket, crankLength = 0.17 }) {
    const s = this.s;
    const j = this.bind;
    this.gait = 0;
    this.run = 0;
    root.updateWorldMatrix(true, false);
    root.matrixWorld.decompose(_rootPos, _qRoot, _v);
    const toWorld = (local) => local.applyQuaternion(_qRoot).add(_rootPos);

    // Pelvis on the saddle, leaning forward; chest further forward, head up looking ahead
    qX(_qPelvis, 0.42).premultiply(_qRoot);
    _pelvis.set(0, seat.y + 0.055 * s, seat.z + 0.03);
    toWorld(_pelvis);
    this.writeBone(BONE.PELVIS, _qPelvis, _pelvis);
    _qChest.copy(_qPelvis).multiply(qX(_q, 0.2));
    _chest.copy(j[BONE.CHEST]).sub(j[BONE.PELVIS]).multiplyScalar(s).applyQuaternion(_qPelvis).add(_pelvis);
    this.writeBone(BONE.CHEST, _qChest, _chest);
    _qa.copy(_qRoot).multiply(qX(_q, -0.12));
    _v.copy(j[BONE.HEAD]).sub(j[BONE.CHEST]).multiplyScalar(s).applyQuaternion(_qChest).add(_chest);
    this.writeBone(BONE.HEAD, _qa, _v);
    this.headPosition = (this.headPosition || new THREE.Vector3()).copy(_v);
    this.headQuaternion = (this.headQuaternion || new THREE.Quaternion()).copy(_qa);

    // Hands on the grips (two-bone arm IK, elbows out & down), feet on the pedals (leg IK, knees over the feet)
    _fwd.set(0, 0, 1).applyQuaternion(_qRoot);
    this.yaw = Math.atan2(_fwd.x, _fwd.z);
    for (let i = 0; i < 2; i++) {
      const side = SIDES[i];
      _shoulder.copy(j[LIMB.upperArm[i]]).sub(j[BONE.CHEST]).multiplyScalar(s).applyQuaternion(_qChest).add(_chest);
      _target.set(side * gripHalf, bars.y + 0.02, bars.z - 0.07);
      toWorld(_target);
      const l1 = UPPER_ARM * s;
      const l2 = (FOREARM + 0.07) * s;
      _v.subVectors(_target, _shoulder);
      let dist = _v.length();
      const dn = _v.divideScalar(dist || 1);
      dist = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min((l1 + l2) * 0.999, dist));
      _pole.set(side * 0.6, -1, -0.4).applyQuaternion(_qRoot);
      _pole.addScaledVector(dn, -_pole.dot(dn)).normalize();
      const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
      const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
      _knee.copy(_shoulder).addScaledVector(dn, l1 * cosA).addScaledVector(_pole, l1 * sinA);
      _ankle.copy(_shoulder).addScaledVector(dn, dist);
      // Bind arms point down & slightly out; their +Z (front) is kept towards the bike's front
      this.basis(_v2.subVectors(_shoulder, _knee), _fwd, _qUpper);
      _qUpper.multiply(qZ(_q, -side * ARM_BIND_ABDUCTION));
      this.writeBone(LIMB.upperArm[i], _qUpper, _shoulder);
      this.basis(_v2.subVectors(_knee, _ankle), _fwd, _q2);
      _q2.multiply(qZ(_q, -side * ARM_BIND_ABDUCTION));
      this.writeBone(LIMB.forearm[i], _q2, _knee);

      // pedals go round bottom, back, top, front as `crank` grows (pedalling forwards)
      const a = crank + (i === 0 ? 0 : Math.PI);
      const pedal = _v.set(side * 0.1, bracket.y - Math.cos(a) * crankLength, bracket.z - Math.sin(a) * crankLength);
      const footPitch = 0.16 + 0.16 * Math.cos(a) - 0.1 * Math.sin(a);
      qX(_q2, footPitch);
      // ball of the foot on the pedal: ankle = pedal - R * (ball offset from the ankle)
      _v2.set(0, TOE_JOINT.y * s - 0.012, TOE_JOINT.z * s * 0.85).applyQuaternion(_q2);
      const ankleTarget = _target.copy(pedal).sub(_v2);
      toWorld(ankleTarget);
      _hip.copy(j[LIMB.thigh[i]]).sub(j[BONE.PELVIS]).multiplyScalar(s).applyQuaternion(_qPelvis).add(_pelvis);
      const ankle = this.solveLeg(i, _hip, ankleTarget, this.yaw);
      _qa.copy(_qRoot).multiply(_q2);
      this.writeBone(LIMB.foot[i], _qa, ankle);
      _v.copy(j[LIMB.toe[i]]).sub(j[LIMB.foot[i]]).multiplyScalar(s).applyQuaternion(_qa).add(ankle);
      this.writeBone(LIMB.toe[i], _qa, _v);
    }
  }
}

Object.assign(window.NYC, { PERSON_BONES: BONE, buildPersonGeometry, createPersonMaterial, PersonCrowd, PersonRig });
})();
