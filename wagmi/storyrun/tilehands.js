// Mog City story runner: the hands in a call's tile, the pure part (no three.js: tests/tilehands.test.mjs; sets.js
// applies it). A video call's webcam is head and shoulders, the lens under a metre from the face (vcall-plan.js camOf),
// and the talk clips' hands are a full-body cutscene's: thrown up in front of the face, or out wide. In a tile they came
// up past the chin and, half way to the lens, twice the size of the head (the cast critic, 20 Nov: Nico, Intern One; the
// wide-armed one on the car's screen). So in a call's office (a set drawn into a tile or the car's screen, sets.js
// S.inGrid) each wrist the clip puts past a bound is brought back inside it, its arm reached there over the clip's own
// elbow: never higher than TILE.drop under the eyes (the hand's fingers then stay under the chin), never more than
// TILE.fwd ahead of its shoulder (toward the lens), nor TILE.out out past it (off the tile's edge) or TILE.cross across
// the body. A hand inside the bounds is the clip's own; a full-body cutscene's set is never touched.
//   tileHand({ wrist, shoulder, eyesY, fwd, out }, lim) -> [x, y, z] the wrist's place inside the bounds, or null
//     wrist, shoulder: [x, y, z] (world); eyesY: the eyes' height; fwd: [x, z] the body's way (unit); out: [x, z] the way
//     out from the body on this arm's side (unit)

export const TILE = { drop: 0.27, fwd: 0.27, out: 0.2, cross: 0.12 };

export function tileHand({ wrist, shoulder, eyesY, fwd, out }, lim = TILE) {
  if (!wrist || !shoulder || !fwd || !out || !Number.isFinite(eyesY)) return null;
  const dx = wrist[0] - shoulder[0], dz = wrist[2] - shoulder[2];
  // (the wrist in the body's frame from its shoulder: ahead, outward)
  const f = dx * fwd[0] + dz * fwd[1], o = dx * out[0] + dz * out[1];
  // (what is left over: the lean of the body's own frame against the ground, kept as it was)
  const rx = dx - f * fwd[0] - o * out[0], rz = dz - f * fwd[1] - o * out[1];
  const top = eyesY - lim.drop;
  const f2 = Math.min(f, lim.fwd), o2 = Math.max(-lim.cross, Math.min(o, lim.out)), y2 = Math.min(wrist[1], top);
  if (f2 === f && o2 === o && y2 === wrist[1]) return null;
  return [shoulder[0] + f2 * fwd[0] + o2 * out[0] + rx, y2, shoulder[2] + f2 * fwd[1] + o2 * out[1] + rz];
}
