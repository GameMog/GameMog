// Mog City: the creatures' sounds, from the library's recorded packs (wagmi/library/sounds.js) through the game's one
// mixer (W.audio), placed where they happen. A cue list layers several (a T-rex's roar is low rumbles stacked on its
// Roar clip: the packs have no animal voices); each layer { s: 'pack:<id>/<name>', vol, rate, at (s later), len (cut
// after s) }. Nothing plays before the player's first key or click (the browser's rule), and a pack is decoded the first
// time it is asked for: warm(W) asks for the creatures' packs ahead of the first creature.
import { preload } from '../library/sounds.js';

export const PACKS = ['sounds-impact', 'sounds-scifi'];
let warmed = false;
export function warm(W) {
  if (warmed) return;
  const ctx = W.audio?.ctx; if (!ctx) return;
  warmed = true; preload({ ctx }, PACKS);
}
// grass underfoot (a park: Central Park's lawns, the city's park blocks), as Dan's own steps tell it (wagmi/audio)
export function grassAt(x, z) {
  const N = window.NYC || {}, CP = N.CENTRAL_PARK_BOUNDS;
  if (CP && x > CP.minX && x < CP.maxX && z > CP.minZ && z < CP.maxZ) return true;
  const b = N.blockAt?.(x, z); return !!(b && b.park > 0.5 && !b.median);
}
// a creature's footfall: its grass steps on grass when it has them
export const stepsAt = (P, x, z) => (P.stepsGrass && grassAt(x, z) ? P.stepsGrass : P.steps);
// (at: s later, all of it)
export function cue(W, list, pos, { vol = 1, rate = 1, at = 0 } = {}) {
  const A = W.audio; if (!A || !A.play || !list || !list.length) return;
  warm(W);
  for (const q of list) {
    const delay = (q.at || 0) + at;
    const h = A.play(q.s, { pos, vol: (q.vol ?? 1) * vol, rate: (q.rate ?? 1) * rate, delay, bus: 'sfx' });
    if (h && q.len) setTimeout(() => { try { h.stop(0.45); } catch (e) { /* (gone) */ } }, (delay + q.len) * 1000);
  }
}
