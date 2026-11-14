// Mog City: the creatures' sounds, from the library's recorded packs (wagmi/library/sounds.js) through the game's one
// mixer (W.audio), placed where they happen. A cue list layers several (a T-rex's roar is low rumbles stacked on its
// Roar clip); each layer { s: 'pack:<id>/<name>', vol, rate, at (s later), len (cut after s), ref (how far off it is
// still heard at full: farther for a call across a field) }. Nothing plays before the player's first key or click (the
// browser's rule), and a pack is decoded the first time it is asked for: warm(W) asks for the creatures' packs ahead of
// the first creature, warm(W, P) a kind's own (the herd's horse pack).
import { preload } from '../library/sounds.js';
import { world } from '../world/index.js';

export const PACKS = ['sounds-impact', 'sounds-scifi'];
let warmed = false;
export function warm(W, P = null) {
  const ctx = W.audio?.ctx; if (!ctx) return;
  if (!warmed) { warmed = true; preload({ ctx }, PACKS); }
  if (P?.voice) { const ids = new Set(); for (const L of Object.values(P.voice)) for (const q of L || []) { const m = /^pack:([a-z0-9-]+)\//.exec(q.s || ''); if (m) ids.add(m[1]); } preload({ ctx }, [...ids]); }
}
// grass underfoot (a park: Central Park's lawns, the city's park blocks), as Dan's own steps tell it (wagmi/audio)
export function grassAt(x, z) {
  return world.isPark(x, z);
}
// a creature's footfall: its grass steps on grass when it has them
export const stepsAt = (P, x, z) => (P.stepsGrass && grassAt(x, z) ? P.stepsGrass : P.steps);
// (at: s later, all of it)
export function cue(W, list, pos, { vol = 1, rate = 1, at = 0 } = {}) {
  const A = W.audio; if (!A || !A.play || !list || !list.length) return;
  warm(W);
  for (const q of list) {
    const delay = (q.at || 0) + at;
    const h = A.play(q.s, { pos, vol: (q.vol ?? 1) * vol, rate: (q.rate ?? 1) * rate, delay, bus: 'sfx', ref: q.ref });
    if (h && q.len) setTimeout(() => { try { h.stop(0.45); } catch (e) { /* (gone) */ } }, (delay + q.len) * 1000);
  }
}
