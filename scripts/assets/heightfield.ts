/**
 * A terrain's height for the library (kind 'heightfield'): a height image (a
 * greyscale PNG read at 16 bits, or an OpenEXR read as floats), stretched so
 * its lowest sample is 0 and its highest 65535, and stored deflated as
 * little-endian 16-bit samples, row by row from the image's top. asset.json
 * says how many metres a side the samples cover and the heights in metres
 * that 0 and 65535 stand for; an optional colour image (the terrain's own)
 * ships beside it as a JPEG.
 *
 * The runtime (ctx.assets.heightfield) decodes the samples to 0..1 floats and
 * samples them bilinearly.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import { CACHE } from './lib.ts';

/* ------------------------------------------------------------- OpenEXR -- */
// A small reader for single-part scanline OpenEXR files (no dependencies): HALF, FLOAT and UINT channels,
// compressed NONE, RLE, ZIPS or ZIP (zlib, then OpenEXR's byte predictor and the split of even and odd bytes).
// PIZ, PXR24, B44 and DWA, tiled, deep and multi-part files are refused by name.
const COMPRESSION = ['NONE', 'RLE', 'ZIPS', 'ZIP', 'PIZ', 'PXR24', 'B44', 'B44A', 'DWAA', 'DWAB'];
const LINES_PER_BLOCK: Record<string, number> = { NONE: 1, RLE: 1, ZIPS: 1, ZIP: 16 };
const SAMPLE_BYTES = [4, 2, 4]; // UINT, HALF, FLOAT

export type Exr = { width: number; height: number; compression: string; channels: Record<string, Float32Array>; attributes: Record<string, unknown> };

function halfToFloat(h: number) {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
  return e === 0 ? s * m * 2 ** -24 : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * 2 ** (e - 15);
}
// undo OpenEXR's ZIP/RLE preconditioning: the byte predictor, then the interleave of the two halves
function unpredict(t: Uint8Array): Uint8Array {
  for (let i = 1; i < t.length; i++) t[i] = (t[i - 1] + t[i] - 128) & 0xff;
  const out = new Uint8Array(t.length), half = (t.length + 1) >> 1;
  for (let i = 0; i < t.length; i++) out[i] = i & 1 ? t[half + (i >> 1)] : t[i >> 1];
  return out;
}
function unrle(src: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(size);
  let p = 0, o = 0;
  while (p < src.length && o < size) {
    const n = (src[p++] << 24) >> 24; // a signed count
    if (n < 0) { out.set(src.subarray(p, p - n), o); p -= n; o -= n; } else { out.fill(src[p++], o, o + n + 1); o += n + 1; }
  }
  if (o !== size) throw new Error(`exr: an RLE block unpacked to ${o} bytes, expected ${size}`);
  return out;
}

export function readExr(file: Uint8Array): Exr {
  const dv = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (dv.getUint32(0, true) !== 0x01312f76) throw new Error('exr: not an OpenEXR file');
  const flags = dv.getUint32(4, true);
  if (flags & 0x200) throw new Error('exr: tiled files are not supported');
  if (flags & 0x800) throw new Error('exr: deep files are not supported');
  if (flags & 0x1000) throw new Error('exr: multi-part files are not supported');
  const cstr = (p: number) => { let e = p; while (file[e]) e++; return [new TextDecoder().decode(file.subarray(p, e)), e + 1] as const; };
  const attributes: Record<string, unknown> = {};
  const channels: { name: string; type: number }[] = [];
  let p = 8;
  for (;;) {
    const [name, a] = cstr(p); if (!name) { p = a; break; }
    const [type, b] = cstr(a); const size = dv.getUint32(b, true), v = b + 4;
    if (type === 'chlist') {
      for (let q = v; file[q];) {
        const [cn, r] = cstr(q);
        const ptype = dv.getInt32(r, true), xs = dv.getInt32(r + 8, true), ys = dv.getInt32(r + 12, true);
        if (xs !== 1 || ys !== 1) throw new Error(`exr: channel ${cn} is subsampled (${xs}x${ys})`);
        if (!(ptype in SAMPLE_BYTES)) throw new Error(`exr: channel ${cn} has an unknown pixel type ${ptype}`);
        channels.push({ name: cn, type: ptype }); q = r + 16;
      }
      attributes[name] = channels.map((c) => `${c.name}:${['uint', 'half', 'float'][c.type]}`);
    } else if (type === 'compression') attributes[name] = COMPRESSION[file[v]] ?? `unknown ${file[v]}`;
    else if (type === 'lineOrder') attributes[name] = ['increasingY', 'decreasingY', 'randomY'][file[v]] ?? file[v];
    else if (type === 'box2i') attributes[name] = [0, 1, 2, 3].map((k) => dv.getInt32(v + k * 4, true));
    else if (type === 'v2f') attributes[name] = [dv.getFloat32(v, true), dv.getFloat32(v + 4, true)];
    else if (type === 'float') attributes[name] = dv.getFloat32(v, true);
    else if (type === 'int') attributes[name] = dv.getInt32(v, true);
    else if (type === 'string') attributes[name] = new TextDecoder().decode(file.subarray(v, v + size));
    else attributes[name] = `(${type}, ${size} bytes)`;
    p = v + size;
  }
  const compression = attributes.compression as string, lpb = LINES_PER_BLOCK[compression];
  if (!lpb) throw new Error(`exr: ${compression} compression is not supported (NONE, RLE, ZIPS and ZIP are)`);
  const [x0, y0, x1, y1] = attributes.dataWindow as number[], width = x1 - x0 + 1, height = y1 - y0 + 1;
  const out: Record<string, Float32Array> = {};
  for (const c of channels) out[c.name] = new Float32Array(width * height);
  const lineBytes = channels.reduce((s, c) => s + width * SAMPLE_BYTES[c.type], 0);
  const blocks = Math.ceil(height / lpb);
  for (let k = 0; k < blocks; k++) {
    const at = Number(dv.getBigUint64(p + k * 8, true));
    const by = dv.getInt32(at, true), packed = dv.getUint32(at + 4, true), lines = Math.min(lpb, y1 - by + 1), size = lines * lineBytes;
    const src = file.subarray(at + 8, at + 8 + packed);
    // a block that would not shrink is stored as it is
    const data = compression === 'NONE' || packed === size ? src
      : compression === 'RLE' ? unpredict(unrle(src, size))
      : unpredict(new Uint8Array(inflateSync(src)));
    if (data.length !== size) throw new Error(`exr: block at line ${by} holds ${data.length} bytes, expected ${size}`);
    const bv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let q = 0;
    for (let l = 0; l < lines; l++) {
      const row = (by - y0 + l) * width;
      for (const c of channels) {
        const dst = out[c.name];
        if (c.type === 1) for (let x = 0; x < width; x++, q += 2) dst[row + x] = halfToFloat(bv.getUint16(q, true));
        else if (c.type === 2) for (let x = 0; x < width; x++, q += 4) dst[row + x] = bv.getFloat32(q, true);
        else for (let x = 0; x < width; x++, q += 4) dst[row + x] = bv.getUint32(q, true);
      }
    }
  }
  return { width, height, compression, channels: out, attributes };
}

/** The height channel of an EXR: Y, else R, else the first channel there is. */
export function exrHeights(path: string) {
  const exr = readExr(readFileSync(path));
  const name = ['Y', 'R', 'Z', 'G'].find((n) => exr.channels[n]) ?? Object.keys(exr.channels)[0];
  return { width: exr.width, height: exr.height, channel: name, data: exr.channels[name], exr };
}

/* ---------------------------------------------------------------- build -- */
// range: the metres the source's own scale stands for (an EXR's 0 and 1, a PNG's black and white); the asset
// records the heights actually present (heightRange), which its 0 and 65535 stand for
type Opts = { metres: number; range: [number, number]; colour?: string; samples?: number };

// heights at `side` samples a side, on the source's own scale (0..1), from a height image of any kind the build reads
async function readHeights(src: string, side: number) {
  if (/\.exr$/i.test(src)) {
    const h = exrHeights(join(CACHE, src));
    if (h.width !== h.height) throw new Error(`${src}: the height image is not square`);
    const f = h.width / Math.min(side, h.width);
    if (!Number.isInteger(f)) throw new Error(`${src}: ${h.width} samples do not divide into ${side}`);
    // averaged over each f x f square
    const n = h.width / f, out = new Float64Array(n * n);
    for (let y = 0; y < h.height; y++) for (let x = 0; x < h.width; x++) out[Math.floor(y / f) * n + Math.floor(x / f)] += h.data[y * h.width + x] / (f * f);
    return { width: n, height: n, values: out, derived: `Heights read from the EXR's ${h.channel} channel as ${h.exr.compression}-compressed 32-bit floats, averaged ${f} x ${f} to ${n} x ${n}, stored deflated as little-endian 16-bit samples.` };
  }
  const sharp = (await import('sharp')).default;
  let im = sharp(join(CACHE, src));
  const meta = await im.metadata();
  if ((meta.width ?? 0) > side) im = im.resize({ width: side, kernel: 'lanczos3' });
  const { data, info } = await im.toColourspace('grey16').raw({ depth: 'ushort' }).toBuffer({ resolveWithObject: true });
  const n = info.width * info.height, ch = info.channels, raw = new Uint16Array(data.buffer, data.byteOffset, n * ch);
  return { width: info.width, height: info.height, values: Float64Array.from({ length: n }, (_, i) => raw[i * ch] / 65535), derived: 'Heights read at 16 bits, resampled and stored deflated as little-endian 16-bit samples.' };
}

export async function buildHeightfield(src: string, outDir: string, o: Opts) {
  const sharp = (await import('sharp')).default;
  const { width, height, values, derived } = await readHeights(src, o.samples ?? 1024);
  const n = width * height;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { const v = values[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!(hi > lo)) throw new Error(`${src}: the height image is flat`);
  const out = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) out.writeUInt16LE(Math.round(((values[i] - lo) / (hi - lo)) * 65535), i * 2);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'height.u16.z'), deflateSync(out, { level: 9 }));
  let maps: { color: string } | undefined;
  if (o.colour) {
    await sharp(join(CACHE, o.colour)).resize({ width: Math.min(1024, width * 2) }).jpeg({ quality: 85, mozjpeg: true }).toFile(join(outDir, 'color.jpg'));
    maps = { color: 'color.jpg' };
  }
  const m = (v: number) => Math.round((o.range[0] + v * (o.range[1] - o.range[0])) * 10) / 10;
  const asset = { width, height, metres: o.metres, heightRange: [m(lo), m(hi)] as [number, number], file: 'height.u16.z', encoding: 'u16le', ...(maps ? { maps } : {}) };
  return { asset, derived };
}
