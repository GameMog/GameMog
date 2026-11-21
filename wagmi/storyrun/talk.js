// Mog City: a story world's talk on the car phone, the pure part (18 Nov, the talk track): what the runner hands the
// car-phone engine (wagmi/mission/calls.js) for a world's call, so its lines hand over as Jane's and Dan's do.
//   callTup(l, name, colour, tokens)   a pack line ({ who, text, how, pre, post, pause, overlap, cut } or [who, text])
//                                      -> calls.js's tuple [who, colour, words, beat]: beat is the line's own
//                                      (turns.js beatOf) with `beats: true`, so calls.js times it by turns.js gapAfter
//                                      (a quick reply 0.12 s, a trail-off cut in at 0.05, an overlap 0.15 s early,
//                                      the authored pre / post / pause) instead of a flat 0.25 s after every line
//   reactPools(react, tuple, toTup)    a call's react pools for calls.js: { tooClose: [variant, ...] }, each variant
//                                      a LIST of tuples (calls.js react() plays a variant's lines in turn, as Jane's
//                                      exchanges). A variant is a line, or an exchange: a list of 2-4 lines
//                                      ([{ who, text }, { who, text }]). Before this, each single line went in as the
//                                      variant itself, and calls.js spread it over its three strings: 'B' / 'o', '#'
//                                      / '3', 'T' / 'a' on screen (live, Colter Land OF-2, r34)
//   OVERLAP_IN                         seconds an overlapping reply starts before the line it answers ends (turns.js)
import { beatOf, GAP } from '../radio/turns.js';

export const REACTS = ['tooClose', 'hit', 'lost', 'spotted'];
export const OVERLAP_IN = -GAP.overlap;

const lineOf = (l) => (Array.isArray(l) ? (typeof l[0] === 'string' || l[0] == null ? { who: l[0], text: l[1] } : null) : l && typeof l === 'object' ? l : null);
// (an exchange: a list whose items are lines, not a [who, text] tuple)
const isExchange = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => (Array.isArray(x) && typeof x[0] === 'string') || (x && typeof x === 'object' && !Array.isArray(x)));

export function callTup(l, name, colour, tokens = (x) => x) {
  const o = lineOf(l); if (!o || o.who == null || o.text == null || o.text === '') return null;
  const who = name(o.who);
  return [who, colour(who), tokens(String(o.text)), { ...beatOf(o), beats: true }];
}

export function reactPools(react, toTup, { max = 4, lines = 4 } = {}) {
  const r = react && typeof react === 'object' && !Array.isArray(react) ? react : null;
  if (!r) return null;
  const pools = {};
  for (const k of REACTS) {
    if (!Array.isArray(r[k]) || !r[k].length) continue;
    const vs = r[k].slice(0, max).map((v) => (isExchange(v) ? v.slice(0, lines) : [v]).map(toTup).filter(Boolean)).filter((v) => v.length);
    if (vs.length) pools[k] = vs;
  }
  return Object.keys(pools).length ? pools : null;
}
