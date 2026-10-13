/**
 * The penalty shootout's recorded crowd (SHOOTOUT M1, the owner's go-ahead 11 Oct 2026: "recorded crowd audio is
 * approved"): takes from two CC0 Freesound packs, cut, levelled and encoded as two AAC sheets with a cue table that
 * lib/runtime/shootout-audio.js (load()) plays from.
 *
 * - the sources: the original WAVs of Freesound pack 1563 (freesound, CaixaForum Barcelona, 48 kHz) and pack 42098
 *   (ShangusBurger, GameSoundCon 2024 walla, XY pair, 96 kHz), each pinned below by its SHA-256 (a changed file is
 *   refused). They are read as audio data only: afconvert (the system's converter) brings each to 32 kHz, and the rest
 *   is plain arithmetic here
 * - each take: a 45 Hz high pass (rumble a phone cannot play), cut, faded, folded to mono for a one-shot (L+R, an XY
 *   pair: no comb), and levelled to a common reference (-20 dBFS RMS over its loudest half second, or the whole of a
 *   loop) unless its peak would pass -1 dBFS (the gain still owed is written in the cue, for the runtime to apply)
 * - a loop: its join crossfaded with what came before its start (equal power), several takes chained the same way,
 *   and padded in the sheet with its own continuation so the encoder sees no edge at either end
 * - the sheets: a stereo one (the beds, the whistling, the goal's roar) and a mono one (the one-shots), each opening
 *   with a short marker burst at 0.1 s: a decoder that keeps the encoder's priming shifts every cue by the same
 *   amount, and the runtime measures that shift from the marker
 * - checked after encoding: every sheet decoded again, every cue's level against its source's, the loops' joins, and
 *   no sample at full scale
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CACHE, sha256 } from './lib.ts';
import { loudness } from './music.ts';

const LICENSE = 'CC0-1.0', LICENSE_URL = 'https://creativecommons.org/publicdomain/zero/1.0/';
/** The two packs, as library sources (each of their sounds' pages and the packs' readmes say CC0 1.0, 11 Oct 2026). */
export const CROWD_SOURCES: Record<string, { title: string; author: string; license: string; licenseUrl: string; homepage: string }> = {
  'freesound-1563': { title: 'freesoundATcaixaforum, "La audiencia disponible" (Freesound pack 1563)', author: 'freesound (Freesound\'s own account; an audience of 300 recorded at CaixaForum Barcelona, 30 Aug 2006)', license: LICENSE, licenseUrl: LICENSE_URL, homepage: 'https://freesound.org/people/freesound/packs/1563/' },
  'freesound-gsc24-xy': { title: 'GameSoundCon2024 Walla XY-AKG214-96k (Freesound pack 42098)', author: 'ShangusBurger (Shane Vincent, the GameSoundCon 2024 walla session)', license: LICENSE, licenseUrl: LICENSE_URL, homepage: 'https://freesound.org/people/ShangusBurger/packs/42098/' },
};

// the takes used: [pack source, Freesound id, file in assets-src/cache/<folder>, its SHA-256, title, author]
type Take = { pack: keyof typeof CROWD_SOURCES; id: number; file: string; sha256: string; title: string; author: string };
const P1 = 'freesound-1563', P2 = 'freesound-gsc24-xy';
const DIR: Record<string, string> = { [P1]: 'freesound-1563', [P2]: 'freesound-gsc24-xy' };
const G24 = (id: number, slug: string, h: string): Take => ({ pack: P2, id, file: `${id}__shangusburger__${slug}_shanevincent_gsc24_xy-akg214-96k.wav`, sha256: h, title: slug, author: 'ShangusBurger' });
const F15 = (id: number, slug: string, h: string): Take => ({ pack: P1, id, file: `${id}__freesound__${slug}.wav`, sha256: h, title: slug, author: 'freesound' });
const TAKES: Record<number, Take> = Object.fromEntries([
  F15(25288, 'walla_ses1', '72b8fe2758c5420efec99a2cf0a84c9d43947c5b3c5a8363712d34669534d515'),
  F15(25320, 'shhhh_ses2', '78a75b90a7b852a98c9b9ff103b7fd6656ef8e64060a027d1d793172e4a35ea0'),
  F15(25283, 'sighs_ses1', '8deb9b2f3bd38d950c0aaf785f6b37f1bc81dd4049b7542cccbb23fceafc2e07'),
  F15(25301, 'coughs_ses2', '967fb35257c7f544f428480d56e05720dec37f14cf5841fdf0361b5f713e8a53'),
  F15(25304, 'gol_ses2', '1f1832d4aa80f4cafc7e202878315e2465654e906f00b7c1b24f34b2c197ab88'),
  G24(763828, 'crwdcele_large-crowd-unison-surprise-cheering', 'babac826626f84665ae12910cfe967a2ed6605a360d9d4b9bc11b4f9f67a15ff'),
  G24(763855, 'crwdmisc_group-inhale-mouth', 'ab836e9014f1bd3837eb238cdddb3db8f5b0decbf047d9672d39c9fdd8d27915'),
  G24(763869, 'crwdreac_crowd-gasping-in-surprise-quick-03', '08f46999046b4a639d78b6163dd4048a15b49708e00353b13f8ea18f5ff39e00'),
  G24(763870, 'crwdreac_crowd-gasping-in-surprise-quick-04', '59a66c4d3669c6f574c393831e8025f214e139193c53c97864eef63efd915d85'),
  G24(763871, 'crwdreac_crowd-gasping-in-surprise-quick-05', 'a39eb7cfe57001ee9863228754ae85b86bd35e9f0f85ead2c25dfed4dea4b0e7'),
  G24(763876, 'crwdreac_crowd-gasping-in-surprise-voiced-02', '0a0787dd9f854ed7e639f224c5af2ff67ad65ff24ce7837a86a18669186f71f0'),
  G24(763877, 'crwdreac_crowd-groan-in-disagreement', 'f45509ae3571918a716e54eb2b7c774361bf2d9113561efeca32ef99653edb7c'),
  G24(763880, 'crwdreac_crowd-sigh-in-disappointment', '64771988ce3b73f1d09f20ea1d1cd6b9a224bc173fd970205dbd735b7811f0b4'),
  G24(763881, 'crwdreac_excitement-build-up-let-down', '5a5e26692af11af75f896866370c3ccfb36fc56a01d2d4dc731d1358fbceb704'),
  G24(763903, 'whsthmn_crowd-whistling-near-e-01', '591aa576aaf11431829d055cf1ed75e3c2bb1b438cbf97bb60c8298abd637f01'),
  G24(763904, 'whsthmn_crowd-whistling-near-e-02', '775ca74b9d803569a8afa83e3e82742e3965d58ffdd0d21add58c59a7cefce42'),
  G24(763905, 'whsthmn_crowd-whistling-near-e-03', '8a2b332afb2806a286bb989fcad813b8c902548d1d660e9a05df61f0e411f5b9'),
].map((t) => [t.id, t]));
// (never: the packs' CRWDBatl_*, CREA*, TOONPop_*, CRWDLaff_* takes or the whistled march; none is listed above)

// the cues, by the runtime's slot: [take, from s, to s] (one segment; a loop may chain several), fades (s), the sheet,
// a tag (a slot's variants that play apart: the roar's 'gol' and its wordless 'cheer'), chosen from each take's
// envelope (RMS every 0.1 s) and its steadiest stretch (a loop)
type Cue = { slot: string; sheet: 'stereo' | 'mono'; segs: [number, number, number][]; loop?: boolean; xfade?: number; fadeIn?: number; fadeOut?: number; tag?: string };
const CUES: Cue[] = [
  // the beds (stereo loops): the murmur, the shushing at the whistle, the whistling at the taker
  { slot: 'bedAmbient', sheet: 'stereo', segs: [[25288, 104.5, 120.5]], loop: true, xfade: 0.5 },
  { slot: 'bedHush', sheet: 'stereo', segs: [[25320, 2.5, 11.5]], loop: true, xfade: 0.4 },
  { slot: 'whistleTaker', sheet: 'stereo', segs: [[763903, 1.5, 5.0], [763904, 0.5, 4.0], [763905, 1.5, 5.0]], loop: true, xfade: 0.4 },
  // a goal: "Gol!" and a wordless cheer (the cheer alone is the keeper's end's, after a save or a miss)
  { slot: 'roar', sheet: 'stereo', segs: [[25304, 0.5, 10.5]], fadeIn: 0.02, fadeOut: 3.0, tag: 'gol' },
  { slot: 'roar', sheet: 'stereo', segs: [[763828, 0.55, 7.4]], fadeIn: 0.02, fadeOut: 1.2, tag: 'cheer' },
  // the one-shots (mono, placed at an end by the runtime)
  { slot: 'inhale', sheet: 'mono', segs: [[763855, 1.25, 2.8]], fadeIn: 0.12, fadeOut: 0.3 },
  { slot: 'groan', sheet: 'mono', segs: [[763877, 0.85, 5.2]], fadeIn: 0.03, fadeOut: 1.6 },
  { slot: 'letdown', sheet: 'mono', segs: [[763881, 2.55, 6.5]], fadeIn: 0.05, fadeOut: 1.0 },
  { slot: 'sigh', sheet: 'mono', segs: [[763880, 0.8, 3.9]], fadeIn: 0.03, fadeOut: 1.0 },
  { slot: 'sigh', sheet: 'mono', segs: [[25283, 23.45, 27.6]], fadeIn: 0.05, fadeOut: 1.2 },
  { slot: 'gasp', sheet: 'mono', segs: [[763870, 0.55, 2.05]], fadeIn: 0.02, fadeOut: 0.4 },
  { slot: 'gasp', sheet: 'mono', segs: [[763871, 0.55, 2.0]], fadeIn: 0.02, fadeOut: 0.4 },
  { slot: 'gasp', sheet: 'mono', segs: [[763876, 0.85, 3.3]], fadeIn: 0.02, fadeOut: 0.6 },
  { slot: 'gasp', sheet: 'mono', segs: [[763869, 0.65, 2.2]], fadeIn: 0.02, fadeOut: 0.4 },
  { slot: 'cough', sheet: 'mono', segs: [[25301, 0.05, 1.0]], fadeIn: 0.03, fadeOut: 0.15 },
  { slot: 'cough', sheet: 'mono', segs: [[25301, 25.25, 26.4]], fadeIn: 0.03, fadeOut: 0.2 },
];

const SR = 32000, REF = -20, CEIL = -1, MARKER = 0.1, FIRST = 0.4, GAP = 0.3, PAD = 0.25;
const KBPS = { stereo: 128, mono: 64 };
type Pcm = { sr: number; ch: Float32Array[] };
const db = (v: number) => (v > 1e-9 ? 20 * Math.log10(v) : -180);
const r4 = (v: number) => Math.round(v * 1e4) / 1e4, r6 = (v: number) => Math.round(v * 1e6) / 1e6;

// a WAV as data: 16/24/32-bit integer or 32-bit float, plain or extensible
function readWav(path: string): Pcm {
  const b = readFileSync(path);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${path}: not a WAV file`);
  let p = 12, fmt: { tag: number; ch: number; sr: number; bits: number } | null = null, data: [number, number] | null = null;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4);
    if (id === 'fmt ') { const tag0 = b.readUInt16LE(p + 8); fmt = { tag: tag0 === 0xfffe && size >= 40 ? b.readUInt16LE(p + 32) : tag0, ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) }; }
    if (id === 'data') data = [p + 8, Math.min(size, b.length - p - 8)];
    p += 8 + size + (size & 1);
  }
  if (!fmt || !data) throw new Error(`${path}: no fmt or data chunk`);
  const bytes = fmt.bits / 8, n = Math.floor(data[1] / (fmt.ch * bytes)), ch = Array.from({ length: fmt.ch }, () => new Float32Array(n));
  const get = fmt.tag === 3 && fmt.bits === 32 ? (o: number) => b.readFloatLE(o) : fmt.tag === 1 && fmt.bits === 16 ? (o: number) => b.readInt16LE(o) / 32768
    : fmt.tag === 1 && fmt.bits === 24 ? (o: number) => b.readIntLE(o, 3) / 8388608 : fmt.tag === 1 && fmt.bits === 32 ? (o: number) => b.readInt32LE(o) / 2147483648 : null;
  if (!get) throw new Error(`${path}: format ${fmt.tag}, ${fmt.bits}-bit is not supported`);
  for (let i = 0; i < n; i++) for (let c = 0; c < fmt.ch; c++) ch[c][i] = get(data[0] + (i * fmt.ch + c) * bytes);
  return { sr: fmt.sr, ch };
}
function writeWavF32(path: string, pcm: Pcm) {
  const n = pcm.ch[0].length, C = pcm.ch.length, b = Buffer.alloc(44 + n * C * 4);
  b.write('RIFF', 0, 'ascii'); b.writeUInt32LE(36 + n * C * 4, 4); b.write('WAVE', 8, 'ascii');
  b.write('fmt ', 12, 'ascii'); b.writeUInt32LE(16, 16); b.writeUInt16LE(3, 20); b.writeUInt16LE(C, 22); b.writeUInt32LE(pcm.sr, 24);
  b.writeUInt32LE(pcm.sr * C * 4, 28); b.writeUInt16LE(C * 4, 32); b.writeUInt16LE(32, 34);
  b.write('data', 36, 'ascii'); b.writeUInt32LE(n * C * 4, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < C; c++) b.writeFloatLE(pcm.ch[c][i], 44 + (i * C + c) * 4);
  writeFileSync(path, b);
}
// a 2nd-order Butterworth high pass, run forward
function highpass(x: Float32Array, f: number, sr: number) {
  const w = Math.tan(Math.PI * f / sr), q = Math.SQRT1_2, n0 = 1 / (1 + w / q + w * w);
  const b0 = n0, b1 = -2 * n0, b2 = n0, a1 = 2 * (w * w - 1) * n0, a2 = (1 - w / q + w * w) * n0, y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
const peakOf = (p: Pcm) => Math.max(...p.ch.map((x) => { let m = 0; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i])); return m; }));
function rmsOf(p: Pcm, a = 0, b = p.ch[0].length) { let s = 0; for (const x of p.ch) for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, (b - a) * p.ch.length)); }
// the loudest stretch of a take (RMS over `win` s, in 10 ms hops), or the whole of it
function activeRms(p: Pcm, win: number) {
  const n = p.ch[0].length, W = Math.min(n, Math.round(win * p.sr)), hop = Math.round(0.01 * p.sr);
  let best = 0; for (let s = 0; s + W <= n; s += hop) best = Math.max(best, rmsOf(p, s, s + W));
  return best;
}

/** Each take at 32 kHz (afconvert's converter, the best quality), checked against its pinned hash first. */
function loadTakes(tmp: string) {
  const out = new Map<number, Pcm>();
  for (const id of new Set(CUES.flatMap((c) => c.segs.map((s) => s[0])))) {
    const t = TAKES[id], src = join(CACHE, DIR[t.pack], t.file);
    const h = sha256(readFileSync(src));
    if (h !== t.sha256) throw new Error(`${src}: its SHA-256 is ${h}, not the pinned ${t.sha256}; the take was changed`);
    const to = join(tmp, `${id}.wav`);
    execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEF32@${SR}`, '-r', '127', src, to]);
    const p = readWav(to);
    if (p.sr !== SR || p.ch.length !== 2) throw new Error(`${src}: expected stereo at ${SR} Hz after conversion, got ${p.ch.length} ch at ${p.sr}`);
    out.set(id, { sr: SR, ch: p.ch.map((x) => highpass(x, 45, SR)) });
  }
  return out;
}
const cut = (p: Pcm, a: number, b: number): Pcm => ({ sr: p.sr, ch: p.ch.map((x) => x.slice(Math.round(a * p.sr), Math.round(b * p.sr))) });
// B after A, the last X of A crossfaded (equal power) into the first X of B
function chain(A: Pcm, B: Pcm, X: number): Pcm {
  const n = Math.round(X * SR), la = A.ch[0].length, lb = B.ch[0].length;
  return { sr: SR, ch: A.ch.map((a, c) => {
    const b = B.ch[c], y = new Float32Array(la + lb - n);
    y.set(a.subarray(0, la - n)); y.set(b.subarray(n), la);
    for (let i = 0; i < n; i++) { const u = (i + 0.5) / n; y[la - n + i] = a[la - n + i] * Math.cos(u * Math.PI / 2) + b[i] * Math.sin(u * Math.PI / 2); }
    return y;
  }) };
}
function fade(p: Pcm, fi: number, fo: number) {
  const n = p.ch[0].length, a = Math.round(fi * SR), b = Math.round(fo * SR);
  for (const x of p.ch) {
    for (let i = 0; i < a && i < n; i++) x[i] *= Math.sin((i + 0.5) / a * Math.PI / 2) ** 2;
    for (let i = 0; i < b && i < n; i++) x[n - 1 - i] *= Math.sin((i + 0.5) / b * Math.PI / 2) ** 2;
  }
  return p;
}
const mono = (p: Pcm): Pcm => { const y = new Float32Array(p.ch[0].length); for (let i = 0; i < y.length; i++) y[i] = (p.ch[0][i] + p.ch[1][i]) / 2; return { sr: p.sr, ch: [y] }; };

/** One cue, made: its audio (a loop already wraps: its last sample runs into its first), its level and what it owes. */
function makeCue(c: Cue, takes: Map<number, Pcm>) {
  const segs = c.segs.map(([id, a, b]) => cut(takes.get(id)!, c.loop ? a - (c.xfade ?? 0.4) : a, b));
  let p: Pcm;
  if (c.loop) {
    // each segment is cut with X before its start, which the crossfade into it uses: seg0 -> seg1 -> ... -> seg0's
    // own first 2X again; the chain's first 2X are then dropped, so its last sample (seg0 at its start + X) runs
    // straight into its first (seg0 at its start + X)
    const X = c.xfade ?? 0.4, n = Math.round(X * SR);
    let L = segs[0];
    for (let i = 1; i < segs.length; i++) L = chain(L, segs[i], X);
    L = chain(L, { sr: SR, ch: segs[0].ch.map((x) => x.slice(0, 2 * n)) }, X);
    p = { sr: SR, ch: L.ch.map((x) => x.slice(2 * n)) };
  } else p = fade(segs.length === 1 ? segs[0] : segs.reduce((A, B) => chain(A, B, 0.2)), c.fadeIn ?? 0.02, c.fadeOut ?? 0.3);
  if (c.sheet === 'mono') p = mono(p);
  // levelled to the reference unless the peak would pass the ceiling; what is still owed rides in the cue
  const act = c.loop ? rmsOf(p) : activeRms(p, 0.5), pk = peakOf(p);
  const want = Math.pow(10, (REF - db(act)) / 20), k = Math.min(want, Math.pow(10, CEIL / 20) / pk);
  for (const x of p.ch) for (let i = 0; i < x.length; i++) x[i] *= k;
  return { cue: c, pcm: p, owe: want / k, act: db(act * k), peak: db(pk * k), rms: db(rmsOf(p)), lufs: loudness(p).lufs };
}

// the marker: a 4 ms Hann-windowed 1 kHz burst whose crest is exactly at MARKER s
function marker(x: Float32Array) {
  const c = Math.round(MARKER * SR), L = Math.round(0.004 * SR);
  for (let i = -L / 2; i < L / 2; i++) x[c + i] = 0.5 * Math.cos(2 * Math.PI * 1000 * i / SR) * 0.5 * (1 + Math.cos(2 * Math.PI * i / L));
}
function findMarker(x: Float32Array, sr: number) { let m = 0, at = 0; for (let i = 0; i < Math.min(x.length, Math.round((MARKER + 0.25) * sr)); i++) if (Math.abs(x[i]) > m) { m = Math.abs(x[i]); at = i; } return at / sr; }

/** Lay the cues of one sheet out: the marker, then each cue (a loop with its own continuation either side). */
function layout(made: ReturnType<typeof makeCue>[], C: number) {
  let t = FIRST;
  const at: number[] = [];
  for (const m of made) { t += m.cue.loop ? PAD : 0; at.push(t); t += m.pcm.ch[0].length / SR + (m.cue.loop ? PAD : 0) + GAP; }
  const n = Math.ceil(t * SR), ch = Array.from({ length: C }, () => new Float32Array(n));
  marker(ch[0]); if (C > 1) marker(ch[1]);
  made.forEach((m, k) => {
    const s0 = Math.round(at[k] * SR), len = m.pcm.ch[0].length, pad = m.cue.loop ? Math.round(PAD * SR) : 0;
    for (let c = 0; c < C; c++) {
      const x = m.pcm.ch[c], y = ch[c];
      for (let i = -pad; i < len + pad; i++) {
        // (the pads: the loop's own continuation, faded out over their outer 20 ms)
        const v = x[((i % len) + len) % len], edge = i < 0 ? (i + pad) / (0.02 * SR) : i >= len ? (len + pad - 1 - i) / (0.02 * SR) : 1;
        y[s0 + i] = v * Math.min(1, Math.max(0, edge));
      }
    }
    at[k] = s0 / SR;
  });
  return { pcm: { sr: SR, ch } as Pcm, at };
}

export function buildCrowdAudio(outDir: string) {
  const tmp = join(tmpdir(), `gm-crowd-${process.pid}`); mkdirSync(tmp, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  try {
    const takes = loadTakes(tmp);
    const made = CUES.map((c) => makeCue(c, takes));
    const sheets: Record<string, any> = {}, cues: Record<string, any[]> = {}, checks: string[] = [];
    let bad = 0;
    for (const [name, file, C] of [['stereo', 'crowd.m4a', 2], ['mono', 'shots.m4a', 1]] as const) {
      const mine = made.filter((m) => m.cue.sheet === name), L = layout(mine, C);
      writeWavF32(join(tmp, `${name}.wav`), L.pcm);
      execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', String(KBPS[name] * 1000), '-q', '127', join(tmp, `${name}.wav`), join(outDir, file)]);
      // decoded again, as a player would: the marker, each cue's level, the loops' joins, nothing at full scale
      execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEF32', join(outDir, file), join(tmp, `${name}-dec.wav`)]);
      const D = readWav(join(tmp, `${name}-dec.wav`)), off = findMarker(D.ch[0], D.sr) - MARKER, pk = db(peakOf(D));
      checks.push(`${name}: ${file} ${(readFileSync(join(outDir, file)).length / 1024).toFixed(0)} KB, ${(L.pcm.ch[0].length / SR).toFixed(2)} s, marker ${off >= 0 ? '+' : ''}${(off * 1000).toFixed(2)} ms, peak ${pk.toFixed(2)} dBFS`);
      if (pk > -0.3) { bad++; checks.push(`  FAIL: the decoded ${name} sheet peaks at ${pk.toFixed(2)} dBFS`); }
      sheets[name] = { file, channels: C, duration: r4(L.pcm.ch[0].length / SR), marker: MARKER, kbps: KBPS[name] };
      mine.forEach((m, k) => {
        const a = Math.round((L.at[k] + off) * D.sr), len = m.pcm.ch[0].length, dec = db(rmsOf(D, a, a + len)), src = m.rms;
        let seam = '';
        if (m.cue.loop) {
          // the join: the step across it, ranked among every step inside the loop (a click would be the largest)
          const x = D.ch[0], step = Math.abs(x[a] - x[a + len - 1]); let below = 0; for (let i = a + 1; i < a + len; i++) if (Math.abs(x[i] - x[i - 1]) < step) below++;
          const rank = below / (len - 1);
          if (rank > 0.999) { bad++; seam = ' FAIL: the join is a click'; } else seam = ` join at the ${(rank * 100).toFixed(1)}th percentile of its steps`;
        }
        const ok = Math.abs(dec - src) < 0.6;
        if (!ok) bad++;
        checks.push(`  ${ok ? 'ok  ' : 'FAIL'} ${m.cue.slot}${m.cue.tag ? ':' + m.cue.tag : ''} ${m.cue.segs.map((s) => s[0]).join('+')} at ${L.at[k].toFixed(4)} s, ${(len / SR).toFixed(2)} s, rms ${src.toFixed(1)} -> ${dec.toFixed(1)} dBFS decoded, active ${m.act.toFixed(1)}, peak ${m.peak.toFixed(1)}, owes x${m.owe.toFixed(2)}${seam}`);
        (cues[m.cue.slot] ||= []).push({
          sheet: name, at: r6(L.at[k]), dur: r6(len / SR), loop: !!m.cue.loop, gain: r4(m.owe), lufs: m.lufs, rms: +m.rms.toFixed(2), active: +m.act.toFixed(2), peak: +m.peak.toFixed(2),
          src: m.cue.segs.map(([id, a, b]) => ({ id, from: a, to: b })), ...(m.cue.tag ? { tag: m.cue.tag } : {}),
        });
      });
    }
    if (bad) throw new Error(`audio-crowd-shootout: ${bad} check(s) failed\n${checks.join('\n')}`);
    const used = [...new Set(CUES.flatMap((c) => c.segs.map((s) => s[0])))].map((id) => TAKES[id]);
    const asset = { format: 'gmasset/1', kind: 'sound', file: 'crowd.m4a', sampleRate: SR, channels: 2, ref: REF, sheets, cues };
    const meta = {
      slots: Object.keys(cues), sampleRate: SR, ref: REF, duration: r4(Object.values(sheets).reduce((a: number, s: any) => a + s.duration, 0)),
      takes: used.map((t) => ({ id: t.id, title: t.title, author: t.author, pack: t.pack, url: `https://freesound.org/s/${t.id}/`, license: LICENSE })),
    };
    return { asset, meta, checks };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// run directly: build into a folder and print the checks (node --import ./scripts/ts-resolve.mjs scripts/assets/crowd-audio.ts <dir>)
if (process.argv[1] && process.argv[1].endsWith('crowd-audio.ts')) {
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: crowd-audio.ts <out dir>');
  const r = buildCrowdAudio(dir);
  writeFileSync(join(dir, 'asset.json'), JSON.stringify(r.asset));
  console.log(r.checks.join('\n'));
  console.log(JSON.stringify(r.meta));
}
