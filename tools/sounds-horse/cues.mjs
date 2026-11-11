// Mog City: the recipe of assets/library/sounds-horse (Ranger's voice, the herds' calls). Its sources are CC0
// recordings on Freesound (assets/library/sounds-horse/sources.json: each one's page, licence and sha256), fetched as
// the sound pages' public HQ previews and decoded to 44.1 kHz mono float WAV named <freesound id>.wav (afconvert).
//   node tools/sounds-horse/cut.mjs <wavDir> <cutDir>        each cue below: lightly denoised, high-passed, trimmed,
//                                                          faded and levelled to one loudness (-18 dBFS RMS, peaks < -1)
//   node tools/sounds-horse/pack.mjs <cutDir> assets/library/sounds-horse   the sheet (AAC 96 kb/s) and its cue table
//   node tools/sounds-horse/demo.mjs assets/library/sounds-horse out.m4a     every cue in turn, to listen to
//   (spec.mjs and seg.mjs: the spectrograms and event lists the windows were chosen from)
// the cues of sounds-horse: name (group + _NN), source (Freesound id), the window cut from it (seconds)
const C = (name, src, a, b, o = {}) => ({ name, src, a, b, ...o });
export const CUES = [
  C('nicker_00', 861234, 0, 0.59), C('nicker_01', 479672, 0.05, 1.0), C('nicker_02', 479672, 4.3, 5.08),
  C('snort_00', 437111, 1.95, 2.5), C('snort_01', 437111, 4.25, 4.85), C('snort_02', 437111, 8.45, 9.0), C('snort_03', 397236, 0.35, 0.95),
  C('snort_04', 397236, 1.8, 2.45), C('snort_05', 475483, 0, 0.6), C('snort_06', 868302, 0, 0.66), C('snort_07', 479672, 2.0, 2.6),
  C('blow_00', 619069, 10.3, 11.0), C('blow_01', 619069, 11.15, 11.8), C('blow_02', 619069, 13.1, 13.85), C('blow_03', 479672, 3.18, 3.9), C('blow_04', 538697, 0.12, 0.97),
  C('whinny_00', 391321, 2.25, 3.6), C('whinny_01', 391321, 8.45, 10.1), C('whinny_02', 391321, 12.25, 13.75), C('whinny_03', 521246, 0.25, 2.27), C('whinny_04', 53261, 0.03, 1.8),
  C('neigh_00', 437110, 10.2, 12.4), C('neigh_01', 826753, 0, 1.9), C('neigh_02', 347036, 1.1, 3.4), C('neigh_03', 149024, 3.3, 6.7), C('neigh_04', 479675, 0.35, 2.0), C('neigh_05', 391321, 4.15, 6.9),
  C('scream_00', 675419, 0.62, 2.45), C('scream_01', 479674, 0.7, 1.98), C('scream_02', 53261, 4.25, 6.1),
  C('pain_00', 675419, 2.65, 3.48), C('pain_01', 675419, 3.52, 4.38), C('pain_02', 675419, 7.6, 8.48), C('pain_03', 675419, 10.8, 11.55), C('pain_04', 437109, 6.97, 7.82), C('pain_05', 437109, 11.63, 12.48), C('pain_06', 479674, 9.08, 9.9),
  C('breath_00', 275388, 0.05, 0.62), C('breath_01', 275388, 0.62, 1.15), C('breath_02', 275388, 1.15, 1.7), C('breath_03', 275388, 1.7, 2.25), C('breath_04', 275388, 2.25, 2.8), C('breath_05', 275388, 2.8, 3.35), C('breath_06', 275388, 3.35, 3.95),
  C('breathloop', 275388, 0.05, 3.95, { raw: true }),
  C('herd_00', 636554, 0.05, 1.3, { clean: false }), C('herd_01', 636554, 4.4, 6.1, { clean: false }), C('herd_02', 636554, 9.38, 10.65, { clean: false }), C('herd_03', 868303, 0, 3.44, { clean: false, trim: 30 }),
];
