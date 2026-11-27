// Mog City story runner: an arena's house, planned (no three.js here: tests/storyrun-crowd.test.mjs runs it in node).
// Who sits and stands where in a stage set's seats (stage-room.js), what each of them looks like (skin, hair and its
// style, face, clothes, build, height) and how they cheer, by hand: the hands as offsets from the shoulders, a beat and a
// change of mind of their own (cheer()). crowd.js draws the plan in a fixed number of draw calls (BUDGET), whatever the
// size of the house: the near people as instanced bodies, heads, hair, limbs and hands in two levels of detail, the far
// tier as instanced impostors cut from one shared atlas. Nobody in it is a real person; no clothes carry a logo.

const PI = Math.PI;

// the levels of detail: nearer than LOD_NEAR metres from the lens, the full person; past it (with a metre's hysteresis)
// the lighter one, posed every other frame
export const LOD_NEAR = 12.5;
export function lodOf(dist, prev) { return prev === 0 ? (dist > LOD_NEAR + 1 ? 1 : 0) : (dist < LOD_NEAR ? 0 : 1); }

/* ------------------------------------------------------------------------------------------------ the cheer -- */
// a person's two hands as offsets from their shoulders in their own frame (+x their left, +y up, +z their front, metres
// at 1.75 m), the elbows' poles, and the bounce, at time t. Styles: 'v' both arms up in a V, waving; 'clap' clapping at
// the chest; 'high' clapping over the head; 'pump' a fist pumped on the beat, the other hand on the hip; 'phone' filming,
// the phone held up at eye height, the other arm easy or waving; 'wave' one hand waving overhead; 'rest' arms down (the
// calm house). Each person changes style now and then, eased over half a second.
export const UP_STYLES = [['v', 0.18], ['clap', 0.22], ['high', 0.12], ['pump', 0.18], ['phone', 0.2], ['wave', 0.1]];
export const CALM_STYLES = [['rest', 0.78], ['phone', 0.14], ['clap', 0.08]];
export const SH = 0.185; // (a shoulder's half-width: the hands meet in the middle from there)
export function pick(list, u) { for (const [n, w] of list) { if (u < w) return n; u -= w; } return list[list.length - 1][0]; }
export function hash(a, b) { const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return h - Math.floor(h); }
// one style's hands at time t for person p: out = [L, R] offsets, poles = [L, R]
export function pose(style, p, t, out, poles) {
  const w = 2 * PI * p.beat, b = t * w + p.ph, open = 0.5 + 0.5 * Math.cos(b * 1.0), pulse = Math.pow(Math.max(0, Math.sin(b)), 0.6);
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1, o = out[i], q = poles[i], wave = Math.sin(t * p.waveW + p.ph + i * PI);
    q.x = side * 0.6; q.y = -1; q.z = -0.4; // (elbows down, out and back)
    o.x = side * 0.06; o.y = -0.55; o.z = 0.05; // (hanging)
    if (style === 'v') { o.x = side * (0.2 + 0.09 * wave); o.y = 0.48 + 0.03 * wave; o.z = 0.1; q.x = side; q.y = 0.1; q.z = -0.3; }
    else if (style === 'clap') { o.x = side * (-SH + 0.03 + 0.13 * open); o.y = -0.2 + 0.02 * open; o.z = 0.3; q.x = side * 0.8; q.y = -0.8; q.z = -0.2; }
    else if (style === 'high') { o.x = side * (-SH + 0.04 + 0.1 * open); o.y = 0.36; o.z = 0.22; q.x = side; q.y = -0.1; q.z = 0; }
    else if (style === 'pump') {
      if (i === p.hand) { o.x = -side * 0.02; o.y = 0.18 + 0.26 * pulse; o.z = 0.16 + 0.06 * pulse; q.x = side; q.y = -0.3; q.z = -0.2; }
      else { o.x = side * 0.13; o.y = -0.42; o.z = -0.02; q.x = side; q.y = 0; q.z = -0.6; }
    } else if (style === 'phone') {
      if (i === p.hand) { o.x = -side * 0.08; o.y = 0.27 + 0.015 * Math.sin(t * 1.3 + p.ph); o.z = 0.3; q.x = side * 0.8; q.y = -0.6; q.z = 0; }
      else if (p.up) { o.x = side * (0.22 + 0.08 * wave); o.y = 0.42; o.z = 0.1; q.x = side; q.y = 0.1; q.z = -0.3; }
    } else if (style === 'wave') { if (i === p.hand) { o.x = side * (0.12 + 0.12 * wave); o.y = 0.46; o.z = 0.12; q.x = side; q.y = 0.1; q.z = -0.3; } }
  }
}
const _A = [{}, {}], _B = [{}, {}], _PA = [{}, {}], _PB = [{}, {}];
// the hands for person p now: the style of this stretch (and the last one's, eased out over 0.5 s); p.style is what
// they are doing, for the phone in their hand
export function cheer(p, t, up, hands, poles) {
  const list = up ? UP_STYLES : CALM_STYLES, tt = t + p.at, n = Math.floor(tt / p.per), f = tt / p.per - n;
  const cur = pick(list, hash(p.seed, n)), prev = pick(list, hash(p.seed, n - 1)), k = Math.min(1, f * p.per / 0.5), e = k * k * (3 - 2 * k);
  p.style = cur; p.up = up;
  pose(cur, p, t, _A, _PA);
  if (e < 1 && prev !== cur) { pose(prev, p, t, _B, _PB); for (let i = 0; i < 2; i++) for (const c of ['x', 'y', 'z']) { _A[i][c] = _B[i][c] + (_A[i][c] - _B[i][c]) * e; _PA[i][c] = _PB[i][c] + (_PA[i][c] - _PB[i][c]) * e; } }
  for (let i = 0; i < 2; i++) { Object.assign(hands[i], _A[i]); Object.assign(poles[i], _PA[i]); }
  // (the bounce: on its feet, a jumper on the beat; calm, none)
  return up && p.jump ? Math.max(0, Math.sin(t * 2 * PI * p.beat + p.ph)) * 0.11 : 0;
}
// a person's own beat, changes and hand, made once
export function cheerer(rnd, i) {
  return { seed: i * 7.31 + 1.7, beat: 1.6 + rnd() * 0.6, ph: rnd() * 6.3, waveW: 6 + rnd() * 4, per: 4 + rnd() * 4, at: rnd() * 30, hand: rnd() < 0.8 ? 1 : 0, jump: rnd() < 0.5, hands: [{}, {}], poles: [{}, {}] };
}
// the far tier's pose (an impostor's frame in the atlas, FAR_POSES) for the style a person is in now
export const FAR_POSES = ['rest', 'vL', 'vR', 'clapOpen', 'clapShut', 'phone', 'pumpUp', 'wave'];
export function farPose(p, t, up) {
  const list = up ? UP_STYLES : CALM_STYLES, n = Math.floor((t + p.at) / p.per), s = pick(list, hash(p.seed, n)), b = t * 2 * PI * p.beat + p.ph;
  p.style = s;
  if (s === 'v' || s === 'high') return Math.sin(t * p.waveW * 0.5 + p.ph) > 0 ? 1 : 2;
  if (s === 'clap') return Math.cos(b) > 0 ? 3 : 4;
  if (s === 'phone') return 5;
  if (s === 'pump') return Math.sin(b) > 0.2 ? 6 : 0;
  if (s === 'wave') return Math.sin(t * p.waveW * 0.5 + p.ph) > 0 ? 7 : 1;
  return 0;
}

/* ------------------------------------------------------------------------------------------------- the looks -- */
// skin from fair to deep, hair (natural, grey, the odd dyed head), clothes (no logos: plain colours and patterns)
export const SKIN = ['#F6D7C0', '#EEC1A0', '#E2A982', '#D19470', '#BC7E5A', '#A26646', '#8A5236', '#6E3F28', '#55301F', '#F1C9A5', '#C68B62', '#9A6444'];
export const HAIR = ['#14100C', '#1E1610', '#2B1D14', '#3F2A1C', '#5A3C24', '#7A5230', '#A97C4C', '#CDA86E', '#E2CB98', '#8E8A86', '#BDBAB4', '#6E2A1A', '#2F4F6F', '#B04A72'];
export const HAIR_W = [10, 12, 12, 10, 9, 7, 5, 4, 3, 5, 3, 3, 0.6, 0.6];
export const CLOTH = ['#1F2A44', '#3B3B3B', '#7A1F2B', '#2E5E4A', '#C9C2B4', '#1C1C1E', '#3E6E8E', '#8C5A3A', '#B8432E', '#5A4A7A', '#E8E2D4', '#76B900', '#2B4A6E', '#D9A441', '#6B7F3A', '#9E9E9E', '#F2F2F2', '#C2386A', '#2F8F9D', '#4B2E2A'];
export const JACKET = ['#1C1C1E', '#2B3242', '#3A4E6A', '#5A4632', '#2E3A2A', '#6B1E24', '#4A4A50'];
export const PANTS = ['#1F2A44', '#2B2B2E', '#3E4A5A', '#4A3A2E', '#1C1C1E', '#5B6B7E', '#2E3A2A', '#7A6A55'];
// hair styles: the merged hair mesh's pieces (crowd.js), one shown per person
export const HAIR_STYLES = ['crop', 'bob', 'long', 'bun', 'afro', 'beanie', 'buzz', 'bald', 'pony', 'curls'];
const HS_F = [['bob', 0.2], ['long', 0.3], ['bun', 0.12], ['pony', 0.14], ['curls', 0.12], ['afro', 0.05], ['crop', 0.04], ['beanie', 0.03]];
const HS_M = [['crop', 0.38], ['buzz', 0.19], ['bald', 0.05], ['curls', 0.1], ['afro', 0.08], ['beanie', 0.08], ['bob', 0.04], ['long', 0.04], ['bun', 0.04]];
// faces: eight in the atlas, each closed and open-mouthed (cell 2f, 2f + 1); 0-3 read male (stubble, a beard, glasses),
// 4-7 female (lashes, a lip colour, glasses)
export const FACES = 8, CLOTHES = 8, FAR_BODIES = 12;
// the draw calls the whole house costs, at any size: each is one InstancedMesh, in two levels of detail where it says 2
// (the hair: a mesh per style, bald none, each in two)
export const PARTS = { body: 2, head: 2, hair: 2 * (HAIR_STYLES.length - 1), limbs: 2, hands: 2, phones: 1, glows: 1, far: 1, risers: 1 };
export const BUDGET = { drawCalls: Object.values(PARTS).reduce((a, b) => a + b, 0), near: 900, far: 1400, phones: 320, glows: 700 };
function weighted(list, u) { let s = 0; for (const [, w] of list) s += w; u *= s; return pick(list, u); }
function wpick(arr, w, u) { let s = 0; for (const x of w) s += x; u *= s; for (let i = 0; i < arr.length; i++) { if (u < w[i]) return arr[i]; u -= w[i]; } return arr[arr.length - 1]; }
export function lookOf(rnd) {
  const female = rnd() < 0.48, skin = SKIN[Math.floor(rnd() * SKIN.length)];
  const grey = rnd() < 0.12, hair = grey ? HAIR[9 + Math.floor(rnd() * 2)] : wpick(HAIR, HAIR_W, rnd());
  const hairStyle = HAIR_STYLES.indexOf(weighted(female ? HS_F : HS_M, rnd()));
  const face = female ? 4 + Math.floor(rnd() * 4) : Math.floor(rnd() * 4);
  const cloth = Math.floor(rnd() * CLOTHES), c1 = CLOTH[Math.floor(rnd() * CLOTH.length)];
  // (the second colour: a jacket's dark or a denim, else another colour or white trim)
  const c2 = cloth === 2 ? JACKET[Math.floor(rnd() * JACKET.length)] : rnd() < 0.5 ? CLOTH[Math.floor(rnd() * CLOTH.length)] : '#ECE8E0';
  return { female, skin, hair, hairStyle, face, cloth, c1, c2, pants: PANTS[Math.floor(rnd() * PANTS.length)],
    sleeves: rnd() < 0.55 ? 'long' : 'short', scale: female ? 0.9 + rnd() * 0.1 : 0.96 + rnd() * 0.12, girth: 0.86 + rnd() * 0.3, headK: 0.93 + rnd() * 0.12,
    far: Math.floor(rnd() * FAR_BODIES) };
}

/* ------------------------------------------------------------------------------------------------- the house -- */
// the house of a stage set: the bowl's rows (people in 3D, seated, or standing when the house is up) and the far tier
// behind the fascia (impostors), each row a little darker than the one in front of it (the stage's light falling off).
// Options: w (the room's width), bowl { rows, per, z0, depth, rise }, far { rows, per, z0, y0, depth, rise }, up,
// full (the share of seats taken), clear ([[x, z]] kept free), pit ([{ x, z }] standing people on the floor, the
// WebGL2 pit), seed. Returns { near, far, aisle(x) }.
export function planHouse(o = {}) {
  const w = o.w ?? 34, up = !!o.up, full = o.full ?? 0.92;
  let s = (o.seed ?? 281) >>> 0 || 1; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const aisle = (x) => Math.abs(x) < 0.6 || Math.abs(Math.abs(x) - 9) < 0.5;
  const near = [], far = [];
  const B = { rows: 9, per: 50, z0: 10.2, depth: 0.95, rise: 0.42, ...(o.bowl || {}) };
  for (let j = 0; j < B.rows; j++) for (let i = 0; i < B.per; i++) {
    const x = -w / 2 + 1.2 + i * ((w - 2.4) / (B.per - 1)), z = B.z0 + j * B.depth, y = j * B.rise;
    if (aisle(x) || rnd() > full) continue;
    const look = lookOf(rnd), stand = up ? rnd() < 0.75 : rnd() < 0.06;
    near.push({ tier: 'bowl', row: j, seat: [x, y, z], x: x + (rnd() - 0.5) * 0.08, y, z: z + 0.08, h: PI + (rnd() - 0.5) * 0.16, stand,
      dim: 1 - 0.055 * j, ...look, ...cheerer(rnd, near.length + 1000 * j) });
  }
  for (const q of o.pit || []) {
    if ((o.clear || []).some((c) => Math.hypot(c[0] - q.x, c[1] - q.z) < 1.0)) continue;
    near.push({ tier: 'pit', row: -1, seat: null, x: q.x, y: 0, z: q.z, h: q.h ?? PI + (rnd() - 0.5) * 0.5, stand: true, dim: 1, ...lookOf(rnd), ...cheerer(rnd, near.length + 50000) });
  }
  if (o.far !== false) {
    const F = { rows: 9, per: 58, z0: 19.8, y0: 4.6, depth: 0.7, rise: 0.62, ...(o.far || {}) };
    for (let j = 0; j < F.rows; j++) for (let i = 0; i < F.per; i++) {
      const x = -w / 2 + 1 + i * ((w - 2) / (F.per - 1)) + (j % 2) * 0.12, z = F.z0 + j * F.depth, y = F.y0 + j * F.rise;
      if (Math.abs(x) < 0.5 || rnd() > full - 0.04) continue;
      const look = lookOf(rnd);
      far.push({ tier: 'far', row: j, x: x + (rnd() - 0.5) * 0.1, y: y + (up && rnd() < 0.7 ? 0.36 : 0), z, h: PI, dim: 0.5 - 0.036 * j, ...look, ...cheerer(rnd, 90000 + far.length) });
    }
  }
  if (near.length > BUDGET.near) near.length = BUDGET.near;
  if (far.length > BUDGET.far) far.length = BUDGET.far;
  return { near, far, aisle, bowl: B, farTier: o.far === false ? null : { rows: 9, per: 58, z0: 19.8, y0: 4.6, depth: 0.7, rise: 0.62, ...(o.far || {}) } };
}
