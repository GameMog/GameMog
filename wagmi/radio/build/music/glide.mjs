// "Fifth Ave Glide": laid-back hip-hop, 86 BPM, swung, D major (Dmaj9 Bm9 Em9 A13), 48 bars (2:14), loops.
//   0  intro   4 bars  the electric piano and the crackle, hats in at bar 2
//   4  A1      8 bars  the whistle's hook over a dusty beat and a round bass
//  12  B1      8 bars  a muted pluck answering, a bell sparkling
//  20  A2      8 bars  the hook again with the bell under it
//  28  break   4 bars  piano and bass, a shaker, nothing else
//  32  B2      8 bars  the pluck again, the whistle doubling it an octave up every other bar
//  40  A3      8 bars  the hook a last time, the beat falling away in the last four (into the intro)
// The hook (whistle):  Dmaj9  F#5 . . E5 D5 . . . A4 . . . B4 . D5 .     Bm9  E5 . . D5 B4 . . . . . A4 . F#4 . . .
//                      Em9    G4 . B4 . D5 . . . F#5 . . . E5 . . .       A13  E5 . . C#5 A4 . . . C#5 . B4 . A4 . . .
import { createSong } from './synth.mjs';

export const meta = { id: 'wagmi-glide', title: 'Fifth Ave Glide', bpm: 86,
  sections: [['intro', 0, 4], ['A1', 4, 12], ['B1', 12, 20], ['A2', 20, 28], ['break', 28, 32], ['B2', 32, 40], ['A3', 40, 48]] };

export function build() {
  const S = createSong({ bpm: 86, bars: 48, swing: 0.17, seed: 86 });
  const { I, T, step, barLen } = S;
  const SEC = { intro: [0, 4], A1: [4, 12], B1: [12, 20], A2: [20, 28], break: [28, 32], B2: [32, 40], A3: [40, 48] };
  const sec = (b) => Object.entries(SEC).find(([, [a, z]]) => b >= a && b < z)[0];
  const CH = {
    D: { ep: ['D3', 'F#3', 'A3', 'C#4', 'E4'], root: 'D2', walk: 'A#1' },
    Bm: { ep: ['B2', 'A3', 'C#4', 'D4', 'F#4'], root: 'B1', walk: 'D#2' },
    Em: { ep: ['E3', 'G3', 'D4', 'F#4', 'B4'], root: 'E2', walk: 'G#1' },
    A: { ep: ['A2', 'G3', 'C#4', 'F#4', 'B4'], root: 'A1', walk: 'C#2' },
  };
  const LOOP = ['D', 'Bm', 'Em', 'A'];
  const HOOK = [
    [[0, 3, 'F#5'], [3, 1, 'E5'], [4, 4, 'D5'], [8, 4, 'A4'], [12, 2, 'B4'], [14, 2, 'D5']],
    [[0, 3, 'E5'], [3, 1, 'D5'], [4, 6, 'B4'], [10, 2, 'A4'], [12, 4, 'F#4']],
    [[0, 2, 'G4'], [2, 2, 'B4'], [4, 4, 'D5'], [8, 4, 'F#5'], [12, 4, 'E5']],
    [[0, 3, 'E5'], [3, 1, 'C#5'], [4, 4, 'A4'], [8, 2, 'C#5'], [10, 2, 'B4'], [12, 4, 'A4']],
  ];
  const HOOK_END = [[0, 4, 'E5'], [4, 4, 'F#5'], [8, 8, 'A5']];
  const RIFF = [
    [[0, 1, 'A4'], [2, 1, 'D5'], [4, 2, 'F#5'], [7, 1, 'E5'], [8, 4, 'D5']],
    [[0, 1, 'F#4'], [2, 1, 'B4'], [4, 2, 'D5'], [7, 1, 'C#5'], [8, 4, 'B4']],
    [[0, 1, 'G4'], [2, 1, 'B4'], [4, 2, 'E5'], [7, 1, 'F#5'], [8, 4, 'G5']],
    [[0, 2, 'F#5'], [2, 2, 'E5'], [4, 2, 'C#5'], [6, 2, 'A4'], [8, 6, 'E5']],
  ];
  const up = (n, k = 12) => { const m = /^([A-G][#b]?)(-?\d)$/.exec(n); return m[1] + (+m[2] + k / 12); };
  I.crackle(0, 48 * barLen, { vel: 0.8 });

  for (let b = 0; b < 48; b++) {
    const s = sec(b), ph = b - SEC[s][0], hb = ph % 4, ch = CH[LOOP[b % 4]], next = CH[LOOP[(b + 1) % 4]];
    const A = s[0] === 'A', B = s[0] === 'B';
    /* --- the piano: on the one, a lazy push, a ghost on the four --- */
    I.ep(T(b, 0), ch.ep, step * 7, { vel: 0.85, bright: s === 'break' ? 0.7 : 1, trem: 0.3 });
    I.ep(T(b, 7), ch.ep.slice(2), step * 4, { vel: 0.5, trem: 0.3 });
    if (hb % 2 === 1) I.ep(T(b, 14), ch.ep.slice(3), step * 2, { vel: 0.35 });
    /* --- the bass --- */
    const bass = (st, len, n, o = {}) => I.sub(T(b, st, 0.002), n, len * step, { drive: 1.4, decay: 0.45, vel: 0.95, ...o });
    if (s !== 'intro') {
      if (s === 'break') bass(0, 14, ch.root, { decay: 1.2 });
      else { bass(0, 6, ch.root); bass(7, 2, ch.root, { vel: 0.7 }); bass(10, 3, up(ch.root), { vel: 0.75, from: ch.root, glide: 0.04 }); bass(14, 1.6, next.walk, { vel: 0.7 }); }
    }
    /* --- drums: dusty, swung --- */
    const beat = A || B || (s === 'intro' && b >= 2);
    if (A || B) {
      const thin = s === 'A3' && ph >= 4;
      const kicks = hb % 2 === 0 ? [0, 7, 10] : [0, 9, 11];
      if (!thin || ph < 6) for (const k of kicks) I.kick(T(b, k, 0.005), { vel: k === 11 ? 0.6 : 0.9, decay: 0.24, top: 120, low: 46, tone: 0.15 });
      if (!thin) for (const sn of [4, 12]) { I.snare(T(b, sn, 0.006), { vel: 0.85, tone: 0.85, verb: 0.24, decay: 0.15 }); I.clap(T(b, sn + 0.15, 0.002), { vel: 0.4, verb: 0.15 }); }
      if (hb === 3 && !thin) I.snare(T(b, 14, 0.004), { vel: 0.25, tone: 1, decay: 0.03, verb: 0.05 });
      if (ph === 0) I.crash(T(b, 0), { vel: 0.5, decay: 1.8 });
      if (B) for (let h = 0; h < 16; h++) I.shaker(T(b, h), { vel: h % 2 ? 0.45 : 0.7 });
    }
    if (beat) for (let h = 0; h < 16; h += 2) I.hat(T(b, h, 0.004), { vel: h % 4 ? 0.45 : 0.7, decay: 0.045, pan: 0.25 });
    if (beat && (A || B) && hb === 3) I.hat(T(b, 13, 0.003), { vel: 0.35, decay: 0.04 });
    if (s === 'break') for (let h = 0; h < 16; h++) I.shaker(T(b, h), { vel: h % 2 ? 0.4 : 0.65 });
    if (s === 'break' && b === 31) I.swell(T(31, 8), step * 8, { vel: 0.5 });
    /* --- the tunes --- */
    if (A) {
      const notes = ph === 7 && s !== 'A3' ? HOOK_END : HOOK[hb];
      for (const [st, len, n] of notes) {
        I.whistle(T(b, st), n, len * step * 0.92, { vel: st % 4 === 0 ? 0.95 : 0.8, scoop: 0.8, verb: 0.35 });
        if (s !== 'A1') I.bell(T(b, st), up(n), len * step, { vel: 0.3, pan: 0.3, delay: 0.2 });
      }
    }
    if (B) {
      for (const [st, len, n] of RIFF[hb]) I.pluck(T(b, st, 0.003), n, len * step * 0.85, { vel: 0.75, bright: 0.35, sub: 0.2, delay: 0.25, verb: 0.25 });
      if (s === 'B2' && hb % 2 === 1) for (const [st, len, n] of RIFF[hb]) I.whistle(T(b, st), up(n), len * step * 0.9, { vel: 0.4, pan: 0.25, verb: 0.4 });
      if (s === 'B1' && hb === 3) [[12, 'A5'], [13, 'F#5'], [14, 'E5'], [15, 'D5']].forEach(([st, n]) => I.bell(T(b, st), n, step, { vel: 0.3, pan: -0.3 }));
    }
  }
  return S.mix({
    levels: { kick: -1.5, sub: -7, drums: 4, hats: 0, pad: 0, keys: 3, lead: -3, bell: -2, fx: 2, verb: 7, delay: -1 },
    duck: { keys: [0.25, 0.14], sub: [0.45, 0.05], lead: [0.1, 0.1] },
    verb: { room: 0.8, damp: 0.4, pre: 0.02 },
    delayTime: step * 3, delayFb: 0.28,
    master: { thr: -14, low: 0.5, air: -1 },
    probe: [4 * barLen, 12 * barLen],
  });
}
