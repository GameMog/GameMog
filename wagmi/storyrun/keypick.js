// Mog City story runner: the key art's choices that need no page (keyshots.js; node --test tests/keyshots.test.mjs):
//   keyShotOf(params)   the composition the address asks for, &keyshot=hood | rideoff | stand, or null (the stand)
//   skyline(p, h, y0)   how high the skyline stands (rad over level, from 1.5 m over y0) looking from p along heading h:
//                       the town's ground and the far land past it (NYC.Terrain.heightAt, cities/pkg/js/pkg-far.js),
//                       out to 20 km; -1 with no terrain to read (and 0 with no Terrain at all)
export const KEY_SHOTS = ['stand', 'hood', 'rideoff'];
export function keyShotOf(q) { const s = q?.get?.('keyshot'); return KEY_SHOTS.includes(s) ? s : null; }
export const SKYLINE_AT = [300, 600, 1000, 1500, 2200, 3000, 4500, 6000, 8000, 11000, 15000, 20000];
export function skyline(p, h, y0, T = globalThis.window?.NYC?.Terrain) {
  if (!T?.heightAt) return 0;
  let best = -1;
  for (const d of SKYLINE_AT) {
    const y = T.heightAt(p.x + Math.sin(h) * d, p.z + Math.cos(h) * d);
    if (Number.isFinite(y)) best = Math.max(best, Math.atan2(y - (y0 + 1.5), d));
  }
  return best;
}
