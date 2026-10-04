/**
 * A recorded music track for the library: read from a WAV, measured and
 * made to loop, then encoded small.
 *
 * - loudness: integrated loudness (ITU-R BS.1770: K-weighted, gated), so the
 *   runtime plays every track at the same level as the platform's own score
 * - tempo and bars: beats from the onset envelope, the bar line from the kick
 * - the loop: the body of the track repeats from a bar after its intro to a
 *   later bar that sounds like it (compared bar by bar), phrase-aligned; the
 *   last moments before the jump are crossfaded with the moments before the
 *   loop's start, so the jump back cannot click
 * - the file: AAC in an MP4 (afconvert, the system's own encoder), which
 *   every browser decodes
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CACHE } from './lib.ts';

type Pcm = { sr: number; ch: Float32Array[] };

export function readWav(path: string): Pcm {
  const b = readFileSync(path);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${path}: not a WAV file`);
  let p = 12, fmt: { tag: number; ch: number; sr: number; bits: number } | null = null, data: [number, number] | null = null;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { tag: b.readUInt16LE(p + 8), ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') data = [p + 8, size];
    p += 8 + size + (size & 1);
  }
  // 16-bit PCM, or 32-bit float (format 3; also as an extensible WAV)
  const float = fmt && (fmt.tag === 3 || fmt.tag === 0xfffe) && fmt.bits === 32, pcm16 = fmt && fmt.tag === 1 && fmt.bits === 16;
  if (!fmt || !data || !(float || pcm16)) throw new Error(`${path}: only 16-bit PCM or 32-bit float WAV is supported`);
  const bytes = fmt.bits / 8, n = Math.floor(data[1] / (fmt.ch * bytes)), ch = Array.from({ length: fmt.ch }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < fmt.ch; c++) {
    const at = data[0] + (i * fmt.ch + c) * bytes;
    ch[c][i] = float ? b.readFloatLE(at) : b.readInt16LE(at) / 32768;
  }
  return { sr: fmt.sr, ch };
}

export function writeWav(path: string, pcm: Pcm) {
  const n = pcm.ch[0].length, C = pcm.ch.length, b = Buffer.alloc(44 + n * C * 2);
  b.write('RIFF', 0, 'ascii'); b.writeUInt32LE(36 + n * C * 2, 4); b.write('WAVE', 8, 'ascii');
  b.write('fmt ', 12, 'ascii'); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(C, 22); b.writeUInt32LE(pcm.sr, 24);
  b.writeUInt32LE(pcm.sr * C * 2, 28); b.writeUInt16LE(C * 2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii'); b.writeUInt32LE(n * C * 2, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < C; c++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pcm.ch[c][i] * 32767))), 44 + (i * C + c) * 2);
  writeFileSync(path, b);
}

// a biquad run over a whole signal
function biquad(x: Float32Array, b0: number, b1: number, b2: number, a1: number, a2: number) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}

/** Integrated loudness, LUFS (ITU-R BS.1770-4), at any sample rate. */
export function loudness(pcm: Pcm) {
  const { sr } = pcm;
  // K-weighting: a high shelf (the head) then a high pass (the RLB curve), as libebur128 derives them
  let K = Math.tan(Math.PI * 1681.974450955533 / sr), Q = 0.7071752369554196;
  const Vh = Math.pow(10, 3.999843853973347 / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const s = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
  K = Math.tan(Math.PI * 38.13547087602444 / sr); Q = 0.5003270373238773; a0 = 1 + K / Q + K * K;
  const h = [1, -2, 1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
  const z = pcm.ch.map((x) => { const y = biquad(biquad(x, s[0], s[1], s[2], s[3], s[4]), h[0], h[1], h[2], h[3], h[4]); return y; });
  // 400 ms blocks, 75% overlap
  const block = Math.round(0.4 * sr), hop = Math.round(0.1 * sr), n = z[0].length, blocks: number[] = [];
  for (let st = 0; st + block <= n; st += hop) {
    let e = 0;
    for (const y of z) { let a = 0; for (let i = st; i < st + block; i++) a += y[i] * y[i]; e += a / block; }
    blocks.push(e);
  }
  const L = (e: number) => -0.691 + 10 * Math.log10(e);
  const abs = blocks.filter((e) => L(e) > -70);
  const rel = L(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter((e) => L(e) > rel);
  const peak = Math.max(...pcm.ch.map((x) => { let m = 0; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i])); return m; }));
  return { lufs: +L(gated.reduce((a, b) => a + b, 0) / gated.length).toFixed(2), peak: +(20 * Math.log10(peak)).toFixed(2) };
}

// band envelopes every hop: low (the kick and bass), mid, high (hats, snare's crack)
function bands(pcm: Pcm, hop: number) {
  const n = pcm.ch[0].length, mono = new Float32Array(n);
  for (let i = 0; i < n; i++) { let v = 0; for (const c of pcm.ch) v += c[i]; mono[i] = v / pcm.ch.length; }
  const lp = (x: Float32Array, f: number) => { const a = Math.exp(-2 * Math.PI * f / pcm.sr), y = new Float32Array(x.length); let v = 0; for (let i = 0; i < x.length; i++) { v = (1 - a) * x[i] + a * v; y[i] = v; } return y; };
  const low = lp(lp(mono, 140), 140), below = lp(lp(mono, 2500), 2500);
  const frames = Math.floor(n / hop), E = [new Float32Array(frames), new Float32Array(frames), new Float32Array(frames)];
  for (let f = 0; f < frames; f++) {
    let l = 0, m = 0, hi = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) { const lo = low[i], mi = below[i] - lo, h = mono[i] - below[i]; l += lo * lo; m += mi * mi; hi += h * h; }
    E[0][f] = Math.log10(1e-9 + l / hop); E[1][f] = Math.log10(1e-9 + m / hop); E[2][f] = Math.log10(1e-9 + hi / hop);
  }
  return E;
}
function onsets(e: Float32Array) { const o = new Float32Array(e.length); for (let i = 1; i < e.length; i++) o[i] = Math.max(0, e[i] - e[i - 1]); return o; }
function at(o: Float32Array, x: number) { const i = Math.floor(x), f = x - i; return i < 0 || i + 1 >= o.length ? 0 : o[i] * (1 - f) + o[i + 1] * f; }

/**
 * Tempo, the first downbeat and the bar grid. The bar is found first: the
 * whole kit repeats every bar, while a single band can repeat at a beat and
 * a half (hats in threes) and fool a search for the beat itself.
 */
export function beats(pcm: Pcm, lo = 70, hi = 200) {
  const hop = Math.round(pcm.sr / 200), fps = pcm.sr / hop; // 5 ms frames
  const E = bands(pcm, hop), O = E.map(onsets), all = new Float32Array(O[0].length);
  for (let i = 0; i < all.length; i++) all[i] = O[0][i] + O[1][i] + O[2][i] * 0.3;
  let mean = 0; for (let i = 0; i < all.length; i++) mean += all[i]; mean /= all.length;
  const ac = (lag: number) => { let r = 0; for (let i = 0; i + lag + 1 < all.length; i++) r += (all[i] - mean) * (at(all, i + lag) - mean); return r; };
  // coarse: the bar period (four beats) with the strongest self-similarity
  let bar = 0, br = -Infinity;
  for (let lag = Math.floor(240 / hi * fps); lag <= Math.ceil(240 / lo * fps); lag++) { const r = ac(lag); if (r > br) { br = r; bar = lag; } }
  // fine: the period that stays in step across eight bars
  let fine = bar, fr = -Infinity;
  for (let lag = bar - 1.5; lag <= bar + 1.5; lag += 0.02) { let r = 0; for (let k = 1; k <= 8; k++) r += ac(lag * k) / k; if (r > fr) { fr = r; fine = lag; } }
  // the bar line: the kick on one, the snare on two and four
  let phase = 0, ps = -Infinity;
  for (let ph = 0; ph < fine; ph += 0.5) {
    let sc = 0;
    for (let x = ph; x + fine < all.length; x += fine) sc += at(O[0], x) + 0.7 * (at(O[1], x + fine / 4) + at(O[1], x + fine * 3 / 4));
    if (sc > ps) { ps = sc; phase = ph; }
  }
  return { bpm: +(240 / (fine / fps)).toFixed(2), first: phase / fps, E, fps };
}

/** Where the track can loop: a bar after the intro back to a later bar that sounds like it. */
export function findLoop(pcm: Pcm, bt: ReturnType<typeof beats>, maxSeconds = 100) {
  const barS = 240 / bt.bpm, n = pcm.ch[0].length / pcm.sr;
  const bars: number[] = [];
  for (let t = bt.first; t + barS <= n; t += barS) bars.push(t);
  // a bar's fingerprint: 16 steps of three bands, level removed
  const feat = bars.map((t0) => {
    const v: number[] = [];
    for (let s = 0; s < 16; s++) for (let b = 0; b < 3; b++) {
      const f0 = Math.round((t0 + s * barS / 16) * bt.fps), f1 = Math.round((t0 + (s + 1) * barS / 16) * bt.fps);
      let a = 0; for (let f = f0; f < f1; f++) a += bt.E[b][f] ?? -9; v.push(a / Math.max(1, f1 - f0));
    }
    return v;
  });
  const level = feat.map((v) => v.reduce((a, b) => a + b, 0) / v.length);
  const unit = feat.map((v, i) => { const c = v.map((x) => x - level[i]); const m = Math.hypot(...c); return c.map((x) => x / (m || 1)); });
  const sim = (a: number, b: number) => a < 0 || b < 0 || a >= unit.length || b >= unit.length ? 0 : unit[a].reduce((s, x, k) => s + x * unit[b][k], 0) - Math.abs(level[a] - level[b]) * 0.8;
  // the intro is over once the track reaches its working level
  const sorted = level.slice().sort((a, b) => a - b), body = sorted[Math.floor(sorted.length * 0.5)];
  const intro = level.findIndex((l) => l > body - 0.25);
  let best = { a: intro, b: bars.length - 1, score: -Infinity };
  const most = Math.max(16, Math.floor(maxSeconds / barS));
  for (let a = intro; a < bars.length; a++) for (let b = a + 16; b < bars.length && b - a <= most; b++) {
    if ((b - a) % 8) continue; // whole phrases, and no longer than a download should be
    // a loop that ends sooner means a smaller file: prefer it when the joins are as good
    const score = sim(a, b) + 0.6 * sim(a - 1, b - 1) + 0.3 * sim(a + 1, b + 1) + (b - a) * 0.004 - Math.max(0, bars[b] - 90) * 0.004;
    if (score > best.score) best = { a, b, score };
  }
  return { start: bars[best.a], end: bars[best.b], bars: best.b - best.a, introBars: best.a, similarity: +best.score.toFixed(3), barSeconds: barS };
}

/** The track up to the loop's end, with the jump back crossfaded in. */
function bake(pcm: Pcm, start: number, end: number, fade = 0.06): Pcm {
  const a = Math.round(start * pcm.sr), b = Math.round(end * pcm.sr), X = Math.round(fade * pcm.sr);
  const ch = pcm.ch.map((x) => {
    const y = x.slice(0, b);
    // equal-power: the loop's last moments give way to the moments before its start
    for (let i = 0; i < X; i++) { const u = (i + 0.5) / X, g0 = Math.cos(u * Math.PI / 2), g1 = Math.sin(u * Math.PI / 2); y[b - X + i] = x[b - X + i] * g0 + x[a - X + i] * g1; }
    return y;
  });
  return { sr: pcm.sr, ch };
}

export function buildMusic(src: string, outDir: string, opts: { lo?: number; hi?: number; kbps?: number } = {}) {
  const pcm = readWav(join(CACHE, src));
  // a float master that peaks over full scale would clip in the encoder: bring it under
  let peak = 0; for (const c of pcm.ch) for (let i = 0; i < c.length; i++) peak = Math.max(peak, Math.abs(c[i]));
  if (peak > 0.98) { const k = 0.98 / peak; for (const c of pcm.ch) for (let i = 0; i < c.length; i++) c[i] *= k; }
  const loud = loudness(pcm), bt = beats(pcm, opts.lo, opts.hi), loop = findLoop(pcm, bt);
  const baked = bake(pcm, loop.start, loop.end);
  const tmp = join(tmpdir(), `gm-music-${process.pid}`); mkdirSync(tmp, { recursive: true });
  writeWav(join(tmp, 'in.wav'), baked);
  mkdirSync(outDir, { recursive: true });
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', String((opts.kbps ?? 192) * 1000), '-q', '127', join(tmp, 'in.wav'), join(outDir, 'track.m4a')]);
  rmSync(tmp, { recursive: true, force: true });
  const frames = baked.ch[0].length;
  return {
    file: 'track.m4a', sampleRate: pcm.sr, channels: pcm.ch.length, duration: +(frames / pcm.sr).toFixed(4), frames,
    lufs: loud.lufs, peak: loud.peak, bpm: bt.bpm, firstBar: +bt.first.toFixed(4), barSeconds: +loop.barSeconds.toFixed(5),
    loop: { start: +loop.start.toFixed(5), end: +loop.end.toFixed(5), bars: loop.bars, introBars: loop.introBars, similarity: loop.similarity },
  };
}

// run directly: analyse a source and print what the build would record
if (process.argv[1] && process.argv[1].endsWith('music.ts')) {
  const src = process.argv[2];
  const pcm = readWav(join(CACHE, src)), bt = beats(pcm, Number(process.argv[3]) || 70, Number(process.argv[4]) || 200), loop = findLoop(pcm, bt);
  console.log(JSON.stringify({ loudness: loudness(pcm), bpm: bt.bpm, first: bt.first, loop }, null, 1));
}
