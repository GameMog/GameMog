// Mog City: the driving HUD kept calm (a story world's, wagmi/storyrun: WAGMI.calmHud; a pack's hud.calm: false keeps
// the old HUD). Jensen Heist's day audit (22 Nov): 'F · Get out' stood under the car the whole of a slow tail, the
// objective's line said again over its panel. Here:
//   - 'F · Get out' is offered for the first GETOUT_SECS s in the car, then faded while he drives; back once the car
//     has stood still STILL_SECS s (parked: getting out is what he may want next).
//   createGetOut() -> { step(dt, inCar, speed m/s) -> true while the offer is shown, reset() }
export const GETOUT_SECS = 3, STILL_SECS = 1.5, STILL_MPS = 0.35;
export function createGetOut({ secs = GETOUT_SECS, still = STILL_SECS } = {}) {
  let t = 0, stillT = 0;
  return {
    step(dt, inCar, speed) {
      if (!inCar) { t = 0; stillT = 0; return false; }
      t += dt; stillT = Math.abs(+speed || 0) < STILL_MPS ? stillT + dt : 0;
      return t < secs || stillT >= still;
    },
    reset() { t = 0; stillT = 0; },
  };
}
