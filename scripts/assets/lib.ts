/**
 * Shared pieces of the asset pipeline: reading MakeHuman's formats (OBJ,
 * targets, skeleton, weights, fitted proxies), writing PNGs, converting
 * images with the system's own tools, hashing.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

export const CACHE = 'assets-src/cache';
export const read = (p: string) => readFileSync(join(CACHE, p), 'utf8');
export const readBin = (p: string) => readFileSync(join(CACHE, p));
export const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/* ------------------------------------------------------------------ OBJ -- */
export type Obj = {
  v: number[][];          // positions
  vt: number[][];         // texture coordinates
  faces: { v: number[]; t: number[]; group: string }[];
};
export function parseObj(text: string): Obj {
  const v: number[][] = [], vt: number[][] = [], faces: Obj['faces'] = [];
  let group = 'default';
  for (const line of text.split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') v.push([+p[1], +p[2], +p[3]]);
    else if (p[0] === 'vt') vt.push([+p[1], +p[2]]);
    else if (p[0] === 'g') group = p[1] ?? 'default';
    else if (p[0] === 'f') {
      const fv: number[] = [], ft: number[] = [];
      for (const s of p.slice(1)) { const [a, b] = s.split('/'); fv.push(+a - 1); ft.push(b ? +b - 1 : -1); }
      faces.push({ v: fv, t: ft, group });
    }
  }
  return { v, vt, faces };
}

/** Targets: sparse offsets, "index dx dy dz" per line. */
export function parseTarget(text: string): Map<number, [number, number, number]> {
  const m = new Map<number, [number, number, number]>();
  for (const line of text.split('\n')) {
    if (!line || line[0] === '#') continue;
    const p = line.trim().split(/\s+/);
    if (p.length >= 4) m.set(+p[0], [+p[1], +p[2], +p[3]]);
  }
  return m;
}
export function applyTarget(pos: Float64Array, t: Map<number, [number, number, number]>, w: number) {
  for (const [i, d] of t) { pos[i * 3] += d[0] * w; pos[i * 3 + 1] += d[1] * w; pos[i * 3 + 2] += d[2] * w; }
}

/* -------------------------------------------------------------- proxies -- */
/**
 * A MakeHuman .mhclo fits another mesh (hair, eyes, eyebrows) to the body:
 * each of its vertices is a weighted sum of three body vertices plus an
 * offset scaled by the body's current size along each axis.
 */
export type Mhclo = { refs: { v: [number, number, number]; w: [number, number, number]; o: [number, number, number] }[]; scale: Record<'x' | 'y' | 'z', [number, number, number]>; del: Set<number>; obj: string; weights: string; zDepth: number };
export function parseMhclo(text: string): Mhclo {
  const refs: Mhclo['refs'] = [], scale = {} as Mhclo['scale'], del = new Set<number>();
  let inVerts = false, inDel = false, obj = '', weights = '', zDepth = 0;
  for (const line of text.split('\n')) {
    const p = line.trim().split(/\s+/);
    if (!p[0] || p[0][0] === '#') continue;
    if (/^[xyz]_scale$/.test(p[0])) { scale[p[0][0] as 'x'] = [+p[1], +p[2], +p[3]]; continue; }
    if (p[0] === 'obj_file') { obj = p[1]; continue; }
    if (p[0] === 'vertexboneweights_file') { weights = p[1]; continue; }
    if (p[0] === 'z_depth') { zDepth = +p[1]; continue; }
    if (p[0] === 'verts') { inVerts = true; inDel = false; continue; }
    if (p[0] === 'delete_verts') { inDel = true; inVerts = false; continue; }
    // the body vertices a garment covers, hidden when it is worn: single indices and "a - b" ranges
    if (inDel) {
      if (!/^\d/.test(p[0])) { inDel = false; continue; }
      for (let i = 0; i < p.length; i++) { if (p[i + 1] === '-') { for (let v = +p[i]; v <= +p[i + 2]; v++) del.add(v); i += 2; } else if (/^\d+$/.test(p[i])) del.add(+p[i]); }
      continue;
    }
    if (inVerts) {
      // other keywords can sit inside the block (short04 has its material there); only a new block ends it
      if (!/^-?\d/.test(p[0])) { if (/^(delete_verts|weights|verts)/.test(p[0])) inVerts = false; continue; }
      if (p.length === 1) refs.push({ v: [+p[0], +p[0], +p[0]], w: [1, 0, 0], o: [0, 0, 0] });
      else if (p.length >= 9) refs.push({ v: [+p[0], +p[1], +p[2]], w: [+p[3], +p[4], +p[5]], o: [+p[6], +p[7], +p[8]] });
    }
  }
  return { refs, scale, del, obj, weights, zDepth };
}
export function fitMhclo(m: Mhclo, body: Float64Array): Float64Array {
  const s = (axis: 'x' | 'y' | 'z', k: number) => {
    const d = m.scale[axis]; if (!d) return 1;
    return Math.abs(body[d[0] * 3 + k] - body[d[1] * 3 + k]) / d[2];
  };
  const sx = s('x', 0), sy = s('y', 1), sz = s('z', 2);
  const out = new Float64Array(m.refs.length * 3);
  m.refs.forEach((r, i) => {
    for (let k = 0; k < 3; k++) {
      out[i * 3 + k] = r.w[0] * body[r.v[0] * 3 + k] + r.w[1] * body[r.v[1] * 3 + k] + r.w[2] * body[r.v[2] * 3 + k];
    }
    out[i * 3] += r.o[0] * sx; out[i * 3 + 1] += r.o[1] * sy; out[i * 3 + 2] += r.o[2] * sz;
  });
  return out;
}

/* -------------------------------------------------------------- images -- */
/** Resize and re-encode with macOS `sips` (no image libraries needed). */
export function convertImage(src: string, dst: string, opts: { max: number; format: 'jpeg' | 'png'; quality?: number }) {
  mkdirSync(dirname(dst), { recursive: true });
  const args = ['-s', 'format', opts.format, '-Z', String(opts.max)];
  if (opts.format === 'jpeg') args.push('-s', 'formatOptions', String(opts.quality ?? 82));
  execFileSync('sips', [...args, join(CACHE, src), '--out', dst], { stdio: 'ignore' });
}
/** Decode a PNG to RGBA with sips (to BMP) plus a small BMP reader. */
export function decodeImage(src: string): { w: number; h: number; data: Uint8Array } {
  const tmp = join(tmpdir(), `gm-decode-${process.pid}-${Math.random().toString(36).slice(2)}.bmp`);
  execFileSync('sips', ['-s', 'format', 'bmp', join(CACHE, src), '--out', tmp], { stdio: 'ignore' });
  const b = readFileSync(tmp); rmSync(tmp);
  const off = b.readUInt32LE(10), w = b.readInt32LE(18), hRaw = b.readInt32LE(22), bpp = b.readUInt16LE(28), h = Math.abs(hRaw);
  const stride = Math.ceil((w * bpp) / 32) * 4, data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const row = hRaw > 0 ? h - 1 - y : y;
    for (let x = 0; x < w; x++) {
      const p = off + row * stride + x * (bpp / 8), q = (y * w + x) * 4;
      data[q] = b[p + 2]; data[q + 1] = b[p + 1]; data[q + 2] = b[p]; data[q + 3] = bpp === 32 ? b[p + 3] : 255;
    }
  }
  return { w, h, data };
}
/** A minimal PNG writer (RGBA, 8-bit). */
export function encodePng(w: number, h: number, rgba: Uint8Array): Buffer {
  const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b: Buffer) => { let c = -1; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ------------------------------------------------------------- binaries -- */
/** Packs typed arrays into one buffer, 4-byte aligned; returns the layout. */
export class Packer {
  parts: Buffer[] = []; size = 0; layout: Record<string, { offset: number; length: number; type: string; itemSize: number }> = {};
  add(name: string, arr: Float32Array | Int16Array | Uint16Array | Uint32Array | Uint8Array | Int8Array, itemSize: number) {
    const pad = (4 - (this.size % 4)) % 4;
    if (pad) { this.parts.push(Buffer.alloc(pad)); this.size += pad; }
    this.layout[name] = { offset: this.size, length: arr.length, type: arr.constructor.name, itemSize };
    const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    this.parts.push(b); this.size += b.length;
  }
  buffer() { return Buffer.concat(this.parts); }
}
export function writeOut(dir: string, name: string, data: Uint8Array | string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), data);
}
