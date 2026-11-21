// Mog City (jh-drive round 3): what a hit costs the player's car (wagmi/crash/damage.js), apart from the dents and the
// smoke so it can be weighed on its own (tests/damage-cost.test.mjs). A hit costs by how hard it was, its speed into what
// it hit: nothing under FLOOR m/s, ((sp - FLOOR) / SCALE)^POW over it (head on into a wall at 20 m/s 1.5%, at 40 m/s 5%,
// at 55 m/s 9%: a free roam driven flat out through a dozen real crashes comes out smoking, not wrecked), then by what it
// hit (the crash's 'hit' events, wagmi/crash/index.js):
//   - a wall, a tree, the subway stairs, a pole hit too slowly to snap (solid): by how square it was hit, head on
//     (headOn 1) the whole of it, a glance along it (headOn 0) WALL.GLANCE of it
//   - a thing in the street knocked flying or snapped (a breakable prop): by its weight (wagmi/crash/prop-kinds.js mass,
//     to the car's 2), as a solid hit at PROP.SPEED of the speed it was hit at, times (mass / PROP.REF)^PROP.POW: a lamp
//     mast (0.5) at 56 m/s about 4%, a hydrant (0.3) 2%, a litter basket or a cone (0.03-0.04) under a tenth of 1%
//   - another car: free under CAR.FLOOR m/s (a nudge in a jam, a tap); over it by how its weight takes the blow
//     (2 mv / (mp + mv): two cars alike 1, a bus about 1.6, kept to CAR.MASS) and by where it struck: nose or tail on
//     (|front| 1) the whole of it, side on (a sideswipe, a glancing tap: |front| 0) CAR.SIDE of it
// One contact's blows (the same car, the same thing, the wall the car is against) come every half-metre step the two
// touch: within CONTACT.WINDOW s of the last of them only what is harder than the hardest so far costs anything (a
// scrape along a wall or a car pushed against is one hit, as hard as its hardest moment, not a hundred).
export const COST = { FLOOR: 4, SCALE: 260, POW: 1.5 };
export const PROP = { SPEED: 0.65, REF: 0.5, POW: 1.5 };
export const WALL = { GLANCE: 0.5 };
export const CAR = { FLOOR: 5, SIDE: 0.45, MASS: [0.6, 1.6], ME: 2 };
export const CONTACT = { WINDOW: 0.35 };
// light things the crash knows nothing about: a prop kind not in the table counts as this much (a bin)
const UNKNOWN_MASS = 0.1;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// the cost of a blow at sp m/s into something solid
export function baseCost(sp, floor = COST.FLOOR) {
  if (!(sp > floor)) return 0;
  return Math.pow((sp - floor) / COST.SCALE, COST.POW);
}

// a 'hit' event's cost (kinds: props.KINDS; me: the car's own mass)
export function hitCost(e, kinds = null, me = CAR.ME) {
  if (!e || !(e.speed > 0)) return 0;
  const sp = e.speed;
  if (e.kind === 'prop' && !e.solid) {
    const kind = e.b && e.b.kind, K = kinds && kind ? kinds[kind] : null;
    const m = K && Number.isFinite(K.mass) ? K.mass : UNKNOWN_MASS;
    return baseCost(sp * PROP.SPEED) * Math.pow(clamp(m / PROP.REF, 0, 2), PROP.POW);
  }
  if (e.kind === 'car') {
    const base = baseCost(sp, CAR.FLOOR);
    if (!base) return 0;
    const mv = Number.isFinite(e.mass) ? e.mass : me, w = clamp(2 * mv / (me + mv), CAR.MASS[0], CAR.MASS[1]);
    const f = Number.isFinite(e.front) ? clamp(Math.abs(e.front), 0, 1) : 1;
    return base * w * (CAR.SIDE + (1 - CAR.SIDE) * f);
  }
  // (a wall or a solid thing: head on the whole of it, a glance (headOn 0) WALL.GLANCE of it)
  const ho = Number.isFinite(e.headOn) ? clamp(e.headOn, 0, 1) : 1;
  return baseCost(sp) * (WALL.GLANCE + (1 - WALL.GLANCE) * ho);
}

// the health after a hit costing cost; while a mission or a story step runs (busy) never under BUSY_FLOOR, just over
// the wreck line (damage.js LIMP.at): smoking at worst, so the readout never calls WRECKED a car the step keeps at
// full pace (a car already under it, say from before the step, kept where it is)
export const BUSY_FLOOR = 0.17;
export function afterHit(health, cost, busy = false) {
  const floor = busy ? Math.min(health, BUSY_FLOOR) : 0;
  return clamp(health - (cost > 0 ? cost : 0), floor, 1);
}

// one contact's blows: charge(key, cost, t s) -> what this one adds (the peak so far within the window, past it anew)
export function createContacts(win = CONTACT.WINDOW) {
  const last = new Map();
  let sweep = 0;
  return {
    charge(key, cost, t) {
      if (!(cost > 0)) return 0;
      if (key == null) return cost;
      const c = last.get(key);
      if (c && t - c.t <= win) {
        c.t = t;
        if (cost <= c.peak) return 0;
        const add = cost - c.peak; c.peak = cost; return add;
      }
      last.set(key, { t, peak: cost });
      if (++sweep > 64) { sweep = 0; for (const [k, v] of last) if (t - v.t > win) last.delete(k); }
      return cost;
    },
    clear() { last.clear(); },
  };
}

// (jh-rc, the owner 19 Nov: "make dents VERY visible for big collisions") How big a hit's dent is, by the energy of the
// blow: its dent speed (dentSpeed: how fast it met what it hit, by what that was) squared, against a big hit's, BIG m/s
// (a wall, another car nose on or a lamp mast at about 34 mph). A scrape or a bump (under about 10 m/s) a ding a few
// centimetres deep; a big hit a crumple DEPTH[1] deep and RADIUS[1] across, read from the chase camera; harder still
// deeper and wider, easing toward DEPTH[2] and RADIUS[2]. Hits on the same place stack (each pushes the metal further in)
// up to CAP m in all (a side's less than a nose's or a tail's: the wheels and the cabin are close behind the doors).
// MIN m/s and COST of health: the least a hit must be to dent at all; N dents kept a side; COOL s: the same contact's
// grinding blows dent once.
export const DENT = { MIN: 5.5, COST: 0.001, BIG: 15, POW: 1.3, DEPTH: [0.015, 0.2, 0.3], RADIUS: [0.35, 0.75, 0.9], CAP: { side: 0.3, end: 0.42 }, N: 10, COOL: 0.22 };
// the dent speed of a 'hit' event (m/s): a wall or a solid thing its speed into it; another car the speed the two met at,
// by how its weight takes it and less a sideswipe; a thing knocked flying by its weight (a lamp mast, half a car's, all
// of it; a hydrant less; a cone or a litter basket next to nothing)
export function dentSpeed(e, kinds = null, me = CAR.ME) {
  if (!e || !(e.speed > 0)) return 0;
  const sp = e.speed;
  if (e.kind === 'prop' && !e.solid) {
    const kind = e.b && e.b.kind, K = kinds && kind ? kinds[kind] : null;
    const m = K && Number.isFinite(K.mass) ? K.mass : UNKNOWN_MASS;
    return sp * Math.sqrt(clamp(m / PROP.REF, 0, 1));
  }
  if (e.kind === 'car') {
    const mv = Number.isFinite(e.mass) ? e.mass : me, w = clamp(2 * mv / (me + mv), CAR.MASS[0], CAR.MASS[1]);
    const f = Number.isFinite(e.front) ? clamp(Math.abs(e.front), 0, 1) : 1;
    return sp * Math.sqrt(w) * (0.6 + 0.4 * f);
  }
  return sp;
}
// a dent's depth and radius (m) at dent speed sp: { depth, r, e } (e: its energy against a big hit's)
export function dentSize(sp) {
  const e = Math.max(0, sp / DENT.BIG) ** 2, D = DENT.DEPTH, R = DENT.RADIUS;
  if (e <= 1) return { depth: D[0] + (D[1] - D[0]) * e ** DENT.POW, r: R[0] + (R[1] - R[0]) * e, e };
  const k = 1 - 1 / e;
  return { depth: D[1] + (D[2] - D[1]) * k, r: R[1] + (R[2] - R[1]) * k, e };
}

// (jh-rc, the cast critic 20 Nov: a 15 m/s wall left a 20 cm crumple in the bonnet and the meter read "SCRATCHED 99%")
// The readout under the speed reads the car's condition as the player sees it: the worse of its health (what the hits
// cost, above: the smoke, the limp and the wreck go by it, and it stays as tuned) and its body, how bent the metal is.
// Each dent wears the body by its blow's energy (dentSize's e: a big hit's 1), WEAR.BIG for a big hit, less for a ding,
// more for a harder one (to the power WEAR.POW, at most WEAR.MAX at once), each side to WEAR.SIDE at most and the whole
// body to WEAR.TOTAL (so the body alone never reads past the 17% a step keeps, BUSY_FLOOR). The words: SCRATCHED, then
// DENTED from WORDS.dented down, BATTERED from WORDS.battered; SMOKING and WRECKED only by the health (the engine's
// state, as the smoke and the limp). While a step runs nothing reads under BUSY_FLOOR, as the health never goes there.
export const WEAR = { BIG: 0.11, POW: 0.75, MAX: 0.3, SIDE: 0.4, TOTAL: 1 - BUSY_FLOOR };
export const WORDS = { dented: 0.94, battered: 0.7, smoking: 0.4, wrecked: 0.15 };
// the body's wear from one dent at dent speed sp (m/s)
export function wearOf(sp) {
  if (!(sp >= DENT.MIN)) return 0;
  const e = dentSize(sp).e;
  return Math.min(WEAR.MAX, WEAR.BIG * Math.pow(e, WEAR.POW));
}
// the body's wear after a dent on a side: { zone: wear } in, the new per-side wear and the total out
export function addWear(sides, zone, w) {
  const out = { ...sides };
  out[zone] = Math.min(WEAR.SIDE, (out[zone] || 0) + (w > 0 ? w : 0));
  const total = Math.min(WEAR.TOTAL, Object.values(out).reduce((a, b) => a + b, 0));
  return { sides: out, total };
}
// the readout: { pc, word, cond } from the health, the body's total wear, and whether a step runs
export function readoutOf(health, wear = 0, busy = false) {
  const hl = clamp(Number.isFinite(health) ? health : 1, 0, 1), body = 1 - clamp(Number.isFinite(wear) ? wear : 0, 0, WEAR.TOTAL);
  let cond = Math.min(hl, body);
  if (busy) cond = Math.max(cond, Math.min(hl, BUSY_FLOOR));
  const word = hl <= WORDS.wrecked ? 'WRECKED' : hl <= WORDS.smoking ? 'SMOKING' : cond <= WORDS.battered ? 'BATTERED' : cond < WORDS.dented ? 'DENTED' : 'SCRATCHED';
  return { pc: Math.round(cond * 100), word, cond };
}
