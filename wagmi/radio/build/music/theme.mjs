// "We All Gonna Make It", the WAGMI FM theme: hip-hop / pop, 94 BPM, A minor (Am F C G), 56 bars (2:23), loops.
//   0  intro      4 bars  the chords opening up, the hook teased on a bell, a riser into the drop
//   4  hook A     8 bars  the hook on the pluck, drums and 808 in full
//  12  verse 1    8 bars  electric piano, a lighter beat, the pluck answering every other bar
//  20  build      4 bars  F G Am G, kicks on the beat, a snare roll, a riser, a stop
//  24  hook B     8 bars  the hook with a bell over it, a shaker
//  32  verse 2    8 bars  a bell riff over the piano, the hats rolling
//  40  bridge     4 bars  F G Em G, no drums, the whistle singing the hook's first phrase slowly
//  44  hook C     8 bars  everything: pluck, whistle, bell, the biggest beat
//  52  outro      4 bars  the hook on the bell, the chords closing down into the intro (the loop)
// The hook (two bars of call, two of answer, the same three-note pick-up on every bar):
//   Am  C5 . . E5 G5 . E5 . D5 . C5 . A4 . . .     F  C5 . . E5 G5 . A5 . . . G5 . E5 . . .
//   C   C5 . . E5 G5 . E5 . D5 . C5 . D5 . E5 .     G  D5 . . C5 . . B4 . G4 . . . . . . .
import { createSong } from './synth.mjs';

export const meta = { id: 'wagmi-theme', title: 'We All Gonna Make It', bpm: 94,
  sections: [['intro', 0, 4], ['hookA', 4, 12], ['verse1', 12, 20], ['build', 20, 24], ['hookB', 24, 32], ['verse2', 32, 40], ['bridge', 40, 44], ['hookC', 44, 52], ['outro', 52, 56]] };

export function build() {
  const S = createSong({ bpm: 94, bars: 56, swing: 0.09, seed: 94 });
  const { I, T, step, barLen } = S;
  const SEC = { intro: [0, 4], hookA: [4, 12], verse1: [12, 20], build: [20, 24], hookB: [24, 32], verse2: [32, 40], bridge: [40, 44], hookC: [44, 52], outro: [52, 56] };
  const sec = (b) => Object.entries(SEC).find(([, [a, z]]) => b >= a && b < z)[0];

  // the chords: the pad's voicing, the piano's, the 808's root
  const CH = {
    Am: { pad: ['A3', 'C4', 'E4', 'G4'], ep: ['A2', 'E3', 'G3', 'C4', 'E4'], root: 'A1' },
    F: { pad: ['F3', 'A3', 'C4', 'E4', 'G4'], ep: ['F2', 'C3', 'E3', 'A3', 'C4'], root: 'F1' },
    C: { pad: ['G3', 'C4', 'D4', 'E4', 'G4'], ep: ['C3', 'G3', 'D4', 'E4', 'G4'], root: 'C2' },
    G: { pad: ['G3', 'B3', 'D4', 'E4'], ep: ['G2', 'D3', 'A3', 'B3', 'D4'], root: 'G1' },
    Em: { pad: ['G3', 'B3', 'E4', 'G4'], ep: ['E2', 'B2', 'D3', 'G3', 'B3'], root: 'E1' },
  };
  const LOOP = ['Am', 'F', 'C', 'G'];
  const chordOf = (b) => { const s = sec(b); if (s === 'build') return ['F', 'G', 'Am', 'G'][b - 20]; if (s === 'bridge') return ['F', 'G', 'Em', 'G'][b - 40]; return LOOP[b % 4]; };

  // the hook: [step, sixteenths, note] per bar of four; bar 8 of a hook lifts (or lands, at the very end)
  const HOOK = [
    [[0, 2, 'C5'], [3, 1, 'E5'], [4, 2, 'G5'], [6, 2, 'E5'], [8, 1, 'D5'], [10, 2, 'C5'], [12, 3, 'A4']],
    [[0, 2, 'C5'], [3, 1, 'E5'], [4, 2, 'G5'], [6, 3, 'A5'], [10, 2, 'G5'], [12, 4, 'E5']],
    [[0, 2, 'C5'], [3, 1, 'E5'], [4, 2, 'G5'], [6, 2, 'E5'], [8, 1, 'D5'], [10, 2, 'C5'], [12, 2, 'D5'], [14, 2, 'E5']],
    [[0, 3, 'D5'], [3, 3, 'C5'], [6, 2, 'B4'], [8, 6, 'G4']],
  ];
  const LIFT = [[0, 2, 'D5'], [2, 2, 'E5'], [4, 2, 'G5'], [6, 2, 'A5'], [8, 6, 'B5']];
  const up = (n, k = 12) => { const m = /^([A-G][#b]?)(-?\d)$/.exec(n); return m[1] + (+m[2] + k / 12); };
  // the build's climb, the verse's answers
  const CLIMB = [[[0, 4, 'A4'], [4, 4, 'C5'], [8, 4, 'F5'], [12, 4, 'E5']], [[0, 4, 'D5'], [4, 4, 'G4'], [8, 4, 'B4'], [12, 4, 'D5']], [[0, 4, 'E5'], [4, 4, 'C5'], [8, 4, 'A4'], [12, 4, 'C5']], [[0, 6, 'D5']]];
  const ANSWER = { F: [[10, 1, 'E5'], [12, 1, 'G5'], [14, 2, 'A5']], G: [[10, 1, 'D5'], [12, 1, 'B4'], [14, 2, 'G4']] };

  for (let b = 0; b < 56; b++) {
    const s = sec(b), ch = CH[chordOf(b)], hb = (b - (SEC[s]?.[0] ?? 0)) % 4, phrase = b - (SEC[s]?.[0] ?? 0);
    const hookBar = s.startsWith('hook');
    /* --- chords --- */
    const cut = s === 'intro' ? (t) => 350 * Math.pow(2400 / 350, Math.min(1, t / (4 * barLen)))
      : s === 'outro' ? (t) => 2400 * Math.pow(380 / 2400, Math.min(1, (t - 52 * barLen) / (4 * barLen)))
      : s === 'bridge' ? 1000 : s === 'build' ? (t) => 1300 + 1500 * Math.min(1, (t - 20 * barLen) / (4 * barLen)) : hookBar ? 2300 : 1300;
    const padVel = s.startsWith('verse') ? 0.55 : s === 'bridge' ? 0.7 : 1;
    I.pad(T(b, 0, 0), ch.pad, barLen - 0.02, { cut, vel: padVel, atk: hookBar ? 0.015 : 0.06 });
    if (s.startsWith('verse') || s === 'bridge') {
      // the piano: on the one, a push on the and-of-two, the top notes again on four
      I.ep(T(b, 0), ch.ep, step * 6, { vel: 0.9 });
      I.ep(T(b, 7), ch.ep.slice(2), step * 3, { vel: 0.55 });
      I.ep(T(b, 12), ch.ep.slice(1), step * 4, { vel: 0.7 });
    }
    /* --- 808 --- */
    const sub = (st, len, note, o = {}) => I.sub(T(b, st, 0.001), note, len * step, o);
    if (hookBar) {
      sub(0, 6, ch.root); sub(7, 2.5, ch.root);
      if (hb % 2 === 1) sub(10, 5.5, up(ch.root), { from: ch.root, glide: 0.06 }); else sub(10, 5.5, ch.root);
    } else if (s.startsWith('verse')) {
      sub(0, 9, ch.root); sub(10, 5.5, ch.root, { vel: 0.85 });
    } else if (s === 'build') {
      sub(0, b === 23 ? 8 : 15.5, ch.root);
    } else if (s === 'outro' && b === 52) sub(0, 14, ch.root, { decay: 0.8 });
    /* --- drums --- */
    if (hookBar || s.startsWith('verse')) {
      const big = s === 'hookC';
      const kicks = hookBar ? (b % 2 === 0 ? [0, 7, 10] : [0, 3, 7, 10, 14]) : (b % 2 === 0 ? [0, 10] : [0, 6, 10]);
      for (const k of kicks) I.kick(T(b, k), { vel: k === 14 ? 0.6 : k === 3 ? 0.75 : 1 });
      for (const sn of [4, 12]) { I.snare(T(b, sn), { vel: 0.95 }); if (hookBar || sn === 12) I.clap(T(b, sn, 0.002), { vel: big ? 1 : 0.85 }); }
      if (b % 2 === 1) I.snare(T(b, 15), { vel: 0.22, verb: 0.05 });
      if (s === 'verse2' && hb === 3) I.snare(T(b, 14.5), { vel: 0.3 });
      // hats: sixteenths in a hook, eighths in a verse; a roll on the fourth bar
      const roll = hb === 3;
      for (let h = 0; h < 16; h++) {
        if (roll && h >= 12) break;
        if (!hookBar && h % 2 && !(s === 'verse2' && h > 8)) continue;
        if (hookBar && h === 14 && b % 2 === 0) { I.hat(T(b, h), { open: true, vel: 0.55 }); continue; }
        I.hat(T(b, h), { vel: h % 4 === 0 ? 0.85 : h % 2 === 0 ? 0.65 : 0.38 });
      }
      if (roll) {
        const n = s === 'verse1' ? 6 : 8;
        for (let r = 0; r < n; r++) I.hat(T(b, 12 + (4 * r) / n, 0.001), { vel: 0.35 + 0.45 * (r / n) });
      }
      if (s === 'hookB' || big) for (let h = 0; h < 16; h++) I.shaker(T(b, h), { vel: h % 2 ? 0.5 : 0.8 });
      if (phrase === 0) I.crash(T(b, 0), { vel: big ? 1 : 0.8 });
      if (big && hb === 0) I.boom(T(b, 0), { vel: 0.5 });
    }
    if (s === 'build') {
      // kicks on the beat, then the eighths; the snare rolling in, faster, louder; a riser across it; a stop at the end
      const kk = b < 22 ? [0, 4, 8, 12] : b === 22 ? [0, 2, 4, 6, 8, 10, 12, 14] : [0, 2, 4, 6, 8, 10];
      for (const k of kk) I.kick(T(b, k), { vel: 0.8 });
      if (b >= 21) {
        const per = b === 21 ? 2 : b === 22 ? 1 : 0.5, end = b === 23 ? 12 : 16;
        for (let x = 0; x < end; x += per) I.snare(T(b, x, 0.001), { vel: 0.25 + 0.6 * ((b - 21) * 16 + x) / 44, verb: 0.1, decay: 0.08 });
      }
      for (let h = 0; h < (b === 23 ? 12 : 16); h += 2) I.hat(T(b, h), { vel: 0.5 });
      if (b === 20) I.riser(T(20, 0), 4 * barLen - 2 * step * 2, { vel: 0.8 });
      if (b === 23) I.swell(T(23, 6), step * 10, { vel: 0.8 });
    }
    if (s === 'intro') {
      if (b >= 2) for (let h = 0; h < 16; h += 2) I.hat(T(b, h), { vel: b === 2 ? 0.35 : 0.5 });
      if (b === 0) I.crackle(T(0, 0), 2 * barLen);
      if (b === 3) { I.riser(T(3, 0), barLen * 0.9, { vel: 0.7 }); I.swell(T(3, 8), step * 8, { vel: 0.7 }); }
    }
    if (s === 'bridge') {
      if (b === 43) { for (let x = 0; x < 16; x += x < 8 ? 1 : 0.5) I.snare(T(b, x, 0.001), { vel: 0.2 + 0.6 * x / 16, verb: 0.15, decay: 0.08 }); I.riser(T(43, 0), barLen, { vel: 0.7 }); }
      if (b === 40) I.crash(T(b, 0), { vel: 0.6, decay: 2.2 });
    }
    if (s === 'outro') {
      for (let h = 0; h < 16; h += 2) if (b < 55) I.hat(T(b, h), { vel: 0.5 - 0.1 * (b - 52) });
      if (b === 52) { I.kick(T(52, 0)); I.crash(T(52, 0), { vel: 0.7 }); }
    }
    /* --- the tunes --- */
    if (hookBar) {
      const last = hb === 3 && phrase === 7, notes = last ? (s === 'hookC' ? HOOK[3] : LIFT) : HOOK[hb];
      for (const [st, len, n] of notes) {
        const v = st % 4 === 0 ? 1 : 0.85;
        I.pluck(T(b, st, 0.002), n, len * step * 0.92, { vel: v });
        if (s !== 'hookA' || phrase >= 4) I.bell(T(b, st, 0.002), up(n), len * step, { vel: 0.55 * v, pan: 0.3 });
        if (s === 'hookC') I.whistle(T(b, st), up(n), len * step * 0.95, { vel: 0.8 * v, pan: -0.15 });
      }
    }
    if (s === 'intro' && b >= 2) for (const [st, len, n] of HOOK[b - 2]) I.bell(T(b, st), n, len * step, { vel: 0.4, pan: 0.2 });
    if (s === 'outro') for (const [st, len, n] of HOOK[b - 52]) I.bell(T(b, st), n, len * step, { vel: 0.55 - 0.08 * (b - 52), pan: 0.2 });
    if (s.startsWith('verse')) {
      const ans = ANSWER[chordOf(b)]; if (ans) for (const [st, len, n] of ans) I.pluck(T(b, st), n, len * step * 0.9, { vel: 0.75, bright: 0.8 });
      if (s === 'verse2') {
        // a bell riff over the piano: the chord's tones, syncopated
        const tones = ch.pad.slice(1).map((n) => up(n));
        [[0, 0], [3, 2], [6, 1], [8, 3], [11, 2], [14, 1]].forEach(([st, k]) => I.bell(T(b, st), tones[k % tones.length], step * 2, { vel: 0.32, pan: -0.25, delay: 0.15 }));
      }
    }
    if (s === 'build') for (const [st, len, n] of CLIMB[b - 20]) I.pluck(T(b, st), n, len * step * 0.95, { vel: 0.85, bright: 0.7 + 0.1 * (b - 20) });
    if (s === 'bridge') {
      // the hook's first phrase, slowly, on the whistle (half speed: two bars a phrase)
      const slow = [[[0, 4, 'C5'], [6, 2, 'E5'], [8, 8, 'G5']], [[0, 4, 'E5'], [6, 2, 'D5'], [8, 8, 'B4']], [[0, 4, 'B4'], [6, 2, 'C5'], [8, 8, 'D5']], [[0, 6, 'E5'], [8, 4, 'D5']]][b - 40];
      for (const [st, len, n] of slow) I.whistle(T(b, st), n, len * step * 0.95, { vel: 0.85, verb: 0.45 });
    }
  }
  return S.mix({
    levels: { kick: -2, sub: -8.5, drums: 6, hats: 0, pad: -2, keys: 2, lead: 2.5, bell: 0, fx: -2, verb: 8, delay: 0 },
    probe: process.env.PROBE ? process.env.PROBE.split(',').map((b) => +b * barLen) : [4 * barLen, 12 * barLen],
    duck: { pad: [0.45, 0.16], keys: [0.3, 0.14], sub: [0.55, 0.05], lead: [0.15, 0.1], bell: [0.2, 0.1] },
    verb: { room: 0.82, damp: 0.3, pre: 0.02 },
    delayTime: step * 3, delayFb: 0.3,
    master: { thr: -14, low: 0.5, air: 0 },
  });
}
