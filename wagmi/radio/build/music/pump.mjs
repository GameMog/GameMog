// "Number Go Up" (was "Pump & Dump" till the owner's 24 Oct note): pop-trap, 140 BPM in half time (the snare on the three), E minor (Em Am C B), 80 bars (2:17), loops.
//   0  intro    8 bars  bells and the pad, filtered; hats in at bar 4; a riser and a stop
//   8  hook A  16 bars  the bell hook over a sliding 808, rolling hats, a plucked counter-line
//  24  verse   16 bars  a darker pluck riff, the 808 alone under it, the hats stuttering
//  40  build    8 bars  the pad opening, the snare rolling, the 808 out, a stop
//  48  hook B  16 bars  the hook on bell and pluck an octave apart, a whistle on top, the biggest beat
//  64  outro   16 bars  the hook on the bell alone, the beat thinning to nothing (into the intro)
// The hook (bell):  Em  B4 . B4 . G4 . E5 . . . D5 . B4 . . .    Am  A4 . C5 . E5 . . . D5 . C5 . A4 . . .
//                   C   G4 . C5 . E5 . G5 . . . E5 . D5 . . .    B   D#5 . . . F#5 . . . B4 . . . . . . .
import { createSong } from './synth.mjs';

export const meta = { id: 'wagmi-pump', title: 'Number Go Up', bpm: 140,
  sections: [['intro', 0, 8], ['hookA', 8, 24], ['verse', 24, 40], ['build', 40, 48], ['hookB', 48, 64], ['outro', 64, 80]] };

export function build() {
  const S = createSong({ bpm: 140, bars: 80, swing: 0.04, seed: 140 });
  const { I, T, step, barLen } = S;
  const SEC = { intro: [0, 8], hookA: [8, 24], verse: [24, 40], build: [40, 48], hookB: [48, 64], outro: [64, 80] };
  const sec = (b) => Object.entries(SEC).find(([, [a, z]]) => b >= a && b < z)[0];
  const CH = {
    Em: { pad: ['E3', 'G3', 'B3', 'D4'], root: 'E1' },
    Am: { pad: ['E3', 'A3', 'C4', 'E4'], root: 'A1' },
    C: { pad: ['E3', 'G3', 'C4', 'D4'], root: 'C2' },
    B: { pad: ['D#3', 'F#3', 'B3', 'D#4'], root: 'B1' },
  };
  const LOOP = ['Em', 'Am', 'C', 'B'];
  const HOOK = [
    [[0, 2, 'B4'], [2, 2, 'B4'], [4, 2, 'G4'], [6, 4, 'E5'], [10, 2, 'D5'], [12, 4, 'B4']],
    [[0, 2, 'A4'], [2, 2, 'C5'], [4, 4, 'E5'], [8, 2, 'D5'], [10, 2, 'C5'], [12, 4, 'A4']],
    [[0, 2, 'G4'], [2, 2, 'C5'], [4, 2, 'E5'], [6, 4, 'G5'], [10, 2, 'E5'], [12, 4, 'D5']],
    [[0, 4, 'D#5'], [4, 4, 'F#5'], [8, 8, 'B4']],
  ];
  // the verse's riff: a low pluck, the chord's root and fifth, syncopated
  const RIFF = { Em: ['E4', 'B3', 'G4', 'E4'], Am: ['A3', 'E4', 'C4', 'A3'], C: ['C4', 'G3', 'E4', 'C4'], B: ['B3', 'F#4', 'D#4', 'B3'] };
  const up = (n, k = 12) => { const m = /^([A-G][#b]?)(-?\d)$/.exec(n); return m[1] + (+m[2] + k / 12); };

  for (let b = 0; b < 80; b++) {
    const s = sec(b), ph = b - SEC[s][0], hb = ph % 4, ch = CH[LOOP[b % 4]];
    const hook = s === 'hookA' || s === 'hookB';
    /* --- the pad --- */
    const cut = s === 'intro' ? (t) => 400 * Math.pow(2000 / 400, Math.min(1, t / (8 * barLen)))
      : s === 'build' ? (t) => 900 + 2600 * Math.min(1, (t - 40 * barLen) / (8 * barLen))
      : s === 'outro' ? (t) => 2000 * Math.pow(350 / 2000, Math.min(1, (t - 64 * barLen) / (16 * barLen))) : hook ? 2200 : 1100;
    I.pad(T(b, 0, 0), ch.pad, barLen - 0.01, { cut, vel: s === 'verse' ? 0.6 : 0.85, atk: 0.03, det: 18 });
    /* --- the 808: long, sliding --- */
    const sub = (st, len, note, o = {}) => I.sub(T(b, st, 0.001), note, len * step, { decay: 1.4, ...o });
    if (hook || s === 'verse') {
      const prev = CH[LOOP[(b + 3) % 4]].root;
      sub(0, 10, ch.root, { from: hb === 0 && ph > 0 ? prev : null, glide: 0.09 });
      if (hb % 2 === 1) sub(11, 5, up(ch.root), { from: ch.root, glide: 0.05, vel: 0.85 }); else sub(13, 3, ch.root, { vel: 0.8 });
    }
    if (s === 'outro' && ph < 8 && hb === 0) sub(0, 30, ch.root, { decay: 1.8 });
    /* --- drums: half time --- */
    const full = hook || s === 'verse' || (s === 'outro' && ph < 8);
    if (full) {
      const kicks = hb % 2 === 0 ? [0, 10] : [0, 3, 11];
      if (s !== 'outro' || ph < 4) for (const k of kicks) I.kick(T(b, k), { vel: k === 3 ? 0.7 : 1, decay: 0.16, top: 180 });
      I.clap(T(b, 8), { vel: 1, verb: 0.22 }); I.snare(T(b, 8), { vel: 0.7, tone: 0.3 });
      // hats: eighths, sixteenths and triplets by the bar, a stutter at the end of four
      const pat = s === 'verse' ? (hb === 3 ? 'stut' : 'eighth') : hb === 1 ? 'trip' : hb === 3 ? 'stut' : 'sixteen';
      if (pat === 'eighth') for (let h = 0; h < 16; h += 2) I.hat(T(b, h), { vel: h % 4 ? 0.5 : 0.8, pan: 0.2 });
      if (pat === 'sixteen') for (let h = 0; h < 16; h++) I.hat(T(b, h), { vel: h % 4 === 0 ? 0.8 : h % 2 ? 0.35 : 0.55, pan: 0.2 });
      if (pat === 'trip') { for (let h = 0; h < 8; h++) I.hat(T(b, h), { vel: h % 2 ? 0.35 : 0.6 }); for (let k = 0; k < 6; k++) I.hat(T(b, 8 + k * 8 / 6, 0.001), { vel: 0.4 + 0.05 * k }); }
      if (pat === 'stut') { for (let h = 0; h < 10; h += 2) I.hat(T(b, h), { vel: 0.6 }); for (let k = 0; k < 12; k++) I.hat(T(b, 10 + k * 0.5, 0.0005), { vel: 0.3 + 0.04 * k, pan: 0.2 - 0.04 * k }); }
      if (hook && hb === 2) I.hat(T(b, 6), { open: true, vel: 0.5 });
      if (ph === 0) I.crash(T(b, 0), { vel: 0.85 });
      if (s === 'hookB' && ph % 8 === 0) I.boom(T(b, 0), { vel: 0.5 });
    }
    if (s === 'intro') {
      if (b >= 4) for (let h = 0; h < 16; h += 2) I.hat(T(b, h), { vel: 0.45, pan: 0.2 });
      if (b === 6) I.riser(T(6, 0), 2 * barLen - step * 4, { vel: 0.7 });
      if (b === 7) I.swell(T(7, 4), step * 12, { vel: 0.7 });
    }
    if (s === 'build') {
      for (let h = 0; h < 16; h += 2) if (b < 47) I.hat(T(b, h), { vel: 0.45 });
      if (b >= 44) { const per = b < 46 ? 2 : b === 46 ? 1 : 0.5, end = b === 47 ? 12 : 16; for (let x = 0; x < end; x += per) I.snare(T(b, x, 0.001), { vel: 0.25 + 0.6 * ((b - 44) * 16 + x) / 60, verb: 0.1, decay: 0.07 }); }
      if (b === 40) I.riser(T(40, 0), 8 * barLen - step * 4, { vel: 0.6, from: 200 });
      if (b === 47) I.swell(T(47, 6), step * 10, { vel: 0.8 });
    }
    /* --- the tunes --- */
    if (hook) for (const [st, len, n] of HOOK[hb]) {
      const v = st % 4 === 0 ? 1 : 0.85;
      I.bell(T(b, st, 0.002), n, len * step, { vel: 0.9 * v, pan: 0.15, delay: 0.2 });
      if (s === 'hookB' || ph >= 8) I.pluck(T(b, st, 0.002), n.replace(/\d$/, (d) => String(+d - 1)), len * step * 0.9, { vel: 0.7 * v, bright: 0.7, pan: -0.2, sub: 0.15 });
      if (s === 'hookB' && ph >= 8) I.whistle(T(b, st), up(n), len * step * 0.95, { vel: 0.6 * v, pan: 0.05 });
    }
    if (s === 'intro' && b >= 2) for (const [st, len, n] of HOOK[b % 4]) I.bell(T(b, st), n, len * step, { vel: 0.35 + 0.05 * (b - 2), pan: 0.2 });
    if (s === 'outro') for (const [st, len, n] of HOOK[hb]) I.bell(T(b, st), n, len * step, { vel: Math.max(0.15, 0.75 - 0.04 * ph), pan: 0.2 });
    if (s === 'verse') {
      const r = RIFF[LOOP[b % 4]];
      [[0, 0], [3, 1], [6, 2], [10, 3], [12, 1]].forEach(([st, k]) => I.pluck(T(b, st), r[k], step * 1.6, { vel: 0.8, bright: 0.45, sub: 0.3, delay: 0.12 }));
      if (ph >= 8 && hb % 2 === 1) for (const [st, len, n] of HOOK[hb].slice(-2)) I.bell(T(b, st), n, len * step, { vel: 0.4, pan: -0.3 });
    }
    if (s === 'build') for (const [st, len, n] of (b < 44 ? HOOK[hb].slice(0, 3) : HOOK[hb])) I.pluck(T(b, st), n, len * step * 0.9, { vel: 0.5 + 0.06 * (b - 40), bright: 0.5 + 0.06 * (b - 40) });
  }
  return S.mix({
    levels: { kick: -2.5, sub: -7.5, drums: 7, hats: 0, pad: -3, keys: 0, lead: 1, bell: 2, fx: -2, verb: 8, delay: 0 },
    duck: { pad: [0.5, 0.18], sub: [0.5, 0.05], lead: [0.15, 0.1], bell: [0.12, 0.1] },
    verb: { room: 0.86, damp: 0.25, pre: 0.025 },
    delayTime: step * 3, delayFb: 0.32,
    master: { thr: -14, low: 0.5, air: 0 },
    probe: [8 * barLen, 24 * barLen],
  });
}
