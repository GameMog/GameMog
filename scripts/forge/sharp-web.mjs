// THE CHARACTER FORGE: the few image steps the forge asks of sharp, for a creator's browser (FB, browser port). Same
// chained calls as sharp: sharp(path | bytes | raw pixels, { raw }) .resize(w, h, { kernel }) .removeAlpha()
// .ensureAlpha() .toColourspace('srgb') .blur(sigma) .extract({ left, top, width, height }) .composite([{ input, left, top }])
// then .raw() / .jpeg({ quality }) / .png() and .toBuffer({ resolveWithObject }); sharp({ create: { width, height,
// channels, background } }) as a blank canvas. (B6: a sharp call the forge makes that is missing here crashes the browser
// forge only, e.g. the beard's texture's extract/composite did for every beard with cards; npm run check lists the forge's
// sharp calls against this file's.) Decoding: PNG (8 bit, not interlaced) by our own decoder, so colour under clear
// alpha is kept as sharp keeps it; anything else and JPEG by the browser. Encoding: PNG by our own encoder (lossless),
// JPEG by the browser's. Resize: sharp's kernels (lanczos3 by default, cubic = Catmull-Rom), separable, in JS.
// Works in a page or a worker (OffscreenCanvas, createImageBitmap, CompressionStream).
export function makeSharp(readBytes) {
  return (input, opt = {}) => new Img(input, opt, readBytes);
}

class Img {
  constructor(input, opt, readBytes) { this.input = input; this.rawIn = opt.raw || null; this.ops = []; this.fmt = 'raw'; this.q = 80; this.readBytes = readBytes; }
  resize(w, h, o = {}) { this.ops.push(['resize', w, h ?? w, o.kernel || 'lanczos3']); return this; }
  removeAlpha() { this.ops.push(['removeAlpha']); return this; }
  ensureAlpha() { this.ops.push(['ensureAlpha']); return this; }
  toColourspace() { this.ops.push(['srgb']); return this; }
  blur(sigma) { this.ops.push(['blur', sigma]); return this; }
  extract(r) { this.ops.push(['extract', r]); return this; }
  composite(list) { this.ops.push(['composite', list]); return this; }
  raw() { this.fmt = 'raw'; return this; }
  jpeg(o = {}) { this.fmt = 'jpeg'; this.q = o.quality ?? 80; return this; }
  png() { this.fmt = 'png'; return this; }
  async toBuffer(o = {}) {
    let im;
    if (this.input && this.input.create) im = blank(this.input.create);
    else if (this.rawIn) { const { width, height, channels } = this.rawIn; im = { data: toU8(this.input), width, height, channels }; }
    else im = await decode(typeof this.input === 'string' ? await this.readBytes(this.input) : toU8(this.input));
    for (const [op, a, b, c] of this.ops) {
      if (op === 'resize') im = resize(im, a, b, c);
      else if (op === 'removeAlpha') im = im.channels === 4 ? chans(im, 3) : im.channels === 2 ? chans(im, 1) : im;
      else if (op === 'ensureAlpha') im = im.channels === 3 ? chans(im, 4) : im.channels === 1 ? chans(im, 2) : im;
      else if (op === 'srgb') im = im.channels === 1 ? chans(im, 3) : im.channels === 2 ? chans(im, 4) : im;
      else if (op === 'blur') im = blur(im, a);
      else if (op === 'extract') im = extract(im, a);
      else if (op === 'composite') for (const l of a) im = over(im, l.raw ? { data: toU8(l.input), ...l.raw } : await decode(toU8(l.input)), l.left || 0, l.top || 0);
    }
    const info = { width: im.width, height: im.height, channels: im.channels, format: this.fmt, size: 0 };
    let data;
    if (this.fmt === 'raw') data = im.data;
    else if (this.fmt === 'png') data = await encodePNG(im);
    else data = await encodeCanvas(im, 'image/jpeg', this.q / 100);
    info.size = data.length;
    return o.resolveWithObject ? { data, info } : data;
  }
}

const toU8 = (x) => (x instanceof Uint8Array ? x : x instanceof ArrayBuffer ? new Uint8Array(x) : new Uint8Array(x.buffer, x.byteOffset, x.byteLength));

// channels n -> m (1 grey, 2 grey + alpha, 3 rgb, 4 rgba): alpha added at 255, grey spread to rgb, alpha dropped
function chans(im, m) {
  const n = im.channels, N = im.width * im.height, o = new Uint8Array(N * m), d = im.data, hasA = (c) => c === 2 || c === 4, col = (c) => (c >= 3 ? 3 : 1);
  for (let i = 0; i < N; i++) {
    const s = i * n, t = i * m, cn = col(n), cm = col(m);
    for (let k = 0; k < cm; k++) o[t + k] = d[s + (cn === 1 ? 0 : k)];
    if (hasA(m)) o[t + cm] = hasA(n) ? d[s + cn] : 255;
  }
  return { data: o, width: im.width, height: im.height, channels: m };
}

// a blank canvas (sharp's create): background { r, g, b, alpha 0-1 }
function blank({ width, height, channels = 4, background: bg = {} }) {
  const o = new Uint8Array(width * height * channels), px = [bg.r ?? 0, bg.g ?? 0, bg.b ?? 0, Math.round((bg.alpha ?? 1) * 255)];
  const v = channels === 4 ? px : channels === 3 ? px.slice(0, 3) : channels === 2 ? [px[0], px[3]] : [px[0]];
  for (let i = 0; i < o.length; i += channels) for (let k = 0; k < channels; k++) o[i + k] = v[k];
  return { data: o, width, height, channels };
}
// a region (sharp's extract), inside the image
function extract(im, { left, top, width, height }) {
  if (left < 0 || top < 0 || left + width > im.width || top + height > im.height) throw new Error('extract: bad extract area');
  const n = im.channels, o = new Uint8Array(width * height * n);
  for (let y = 0; y < height; y++) o.set(im.data.subarray(((top + y) * im.width + left) * n, ((top + y) * im.width + left + width) * n), y * width * n);
  return { data: o, width, height, channels: n };
}
// one image laid over another at left, top (sharp's composite, blend 'over', clipped to the base); the result has alpha
function over(base, top, L, T) {
  const b = base.channels === 4 ? { ...base, data: base.data.slice() } : chans(base, 4), t = top.channels === 4 ? top : chans(top, 4);
  for (let y = Math.max(0, -T); y < t.height && y + T < b.height; y++) for (let x = Math.max(0, -L); x < t.width && x + L < b.width; x++) {
    const s = (y * t.width + x) * 4, d = ((y + T) * b.width + x + L) * 4, sa = t.data[s + 3] / 255, da = b.data[d + 3] / 255, oa = sa + da * (1 - sa);
    for (let k = 0; k < 3; k++) b.data[d + k] = oa ? Math.round((t.data[s + k] * sa + b.data[d + k] * da * (1 - sa)) / oa) : 0;
    b.data[d + 3] = Math.round(oa * 255);
  }
  return b;
}

// separable resample with sharp's kernels (lanczos3; cubic = Catmull-Rom), edge clamped
const KERN = { lanczos3: [3, (x) => (x === 0 ? 1 : Math.abs(x) >= 3 ? 0 : (3 * Math.sin(Math.PI * x) * Math.sin(Math.PI * x / 3)) / (Math.PI * Math.PI * x * x))],
  cubic: [2, (x) => { x = Math.abs(x); return x < 1 ? 1.5 * x * x * x - 2.5 * x * x + 1 : x < 2 ? -0.5 * x * x * x + 2.5 * x * x - 4 * x + 2 : 0; }] };
function weights(src, dst, kernel) {
  const [R, f] = KERN[kernel] || KERN.lanczos3, scale = src / dst, s = Math.max(1, scale), out = [];
  for (let i = 0; i < dst; i++) {
    const c = (i + 0.5) * scale - 0.5, lo = Math.floor(c - R * s) + 1, hi = Math.floor(c + R * s), ix = [], w = []; let sum = 0;
    for (let j = lo; j <= hi; j++) { const k = f((j - c) / s); if (!k) continue; ix.push(Math.min(src - 1, Math.max(0, j))); w.push(k); sum += k; }
    out.push([ix, w.map((x) => x / (sum || 1))]);
  }
  return out;
}
function resize(im, W, H, kernel) {
  if (im.width === W && im.height === H) return im;
  const n = im.channels, wx = weights(im.width, W, kernel), wy = weights(im.height, H, kernel), mid = new Float32Array(W * im.height * n), o = new Uint8Array(W * H * n);
  for (let y = 0; y < im.height; y++) for (let x = 0; x < W; x++) { const [ix, w] = wx[x]; for (let c = 0; c < n; c++) { let a = 0; for (let k = 0; k < ix.length; k++) a += im.data[(y * im.width + ix[k]) * n + c] * w[k]; mid[(y * W + x) * n + c] = a; } }
  for (let y = 0; y < H; y++) { const [iy, w] = wy[y]; for (let x = 0; x < W; x++) for (let c = 0; c < n; c++) { let a = 0; for (let k = 0; k < iy.length; k++) a += mid[(iy[k] * W + x) * n + c] * w[k]; o[(y * W + x) * n + c] = Math.min(255, Math.max(0, Math.round(a))); } }
  return { data: o, width: W, height: H, channels: n };
}
// gaussian blur of sigma (sharp's blur(sigma)), separable, edge clamped
function blur(im, sigma) {
  const R = Math.ceil(sigma * 3), k = []; let s = 0; for (let i = -R; i <= R; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); s += v; } for (let i = 0; i < k.length; i++) k[i] /= s;
  const { width: W, height: H, channels: n } = im, a = new Float32Array(W * H * n), o = new Uint8Array(W * H * n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < n; c++) { let v = 0; for (let i = -R; i <= R; i++) v += im.data[(y * W + Math.min(W - 1, Math.max(0, x + i))) * n + c] * k[i + R]; a[(y * W + x) * n + c] = v; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < n; c++) { let v = 0; for (let i = -R; i <= R; i++) v += a[(Math.min(H - 1, Math.max(0, y + i)) * W + x) * n + c] * k[i + R]; o[(y * W + x) * n + c] = Math.min(255, Math.max(0, Math.round(v))); }
  return { data: o, width: W, height: H, channels: n };
}

/* -- decoding -- */
async function decode(b) {
  if (b[0] === 0x89 && b[1] === 0x50) { const p = await decodePNG(b); if (p) return p; }
  const bmp = await createImageBitmap(new Blob([b]), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const cv = new OffscreenCanvas(bmp.width, bmp.height), g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, bmp.width, bmp.height).data, im = { data: new Uint8Array(d.buffer), width: bmp.width, height: bmp.height, channels: 4 };
  bmp.close?.();
  if (b[0] === 0xff && b[1] === 0xd8) return chans(im, 3); // (a JPEG: no alpha, as sharp reads it)
  const ct = b[0] === 0x89 ? b[25] : 6; return ct === 6 || ct === 4 || ct === 3 ? im : chans(im, 3);
}
const be32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
async function inflate(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()); }
async function deflate(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()); }
async function decodePNG(b) {
  let o = 8, W = 0, H = 0, depth = 0, ct = 0, il = 0; const idat = []; let pal = null, trns = null;
  while (o < b.length) { const len = be32(b, o), type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]), d = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { W = be32(d, 0); H = be32(d, 4); depth = d[8]; ct = d[9]; il = d[12]; } else if (type === 'IDAT') idat.push(d); else if (type === 'PLTE') pal = d; else if (type === 'tRNS') trns = d; else if (type === 'IEND') break;
    o += 12 + len; }
  if (depth !== 8 || il !== 0) return null;
  const n = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct]; if (!n) return null;
  let tot = 0; for (const d of idat) tot += d.length; const z = new Uint8Array(tot); tot = 0; for (const d of idat) { z.set(d, tot); tot += d.length; }
  const raw = await inflate(z), stride = W * n, out = new Uint8Array(H * stride);
  for (let y = 0; y < H; y++) { const f = raw[y * (stride + 1)], s = y * (stride + 1) + 1, t = y * stride;
    for (let x = 0; x < stride; x++) { const a = x >= n ? out[t + x - n] : 0, up = y ? out[t - stride + x] : 0, c = y && x >= n ? out[t - stride + x - n] : 0, v = raw[s + x];
      let p = 0; if (f === 0) p = v; else if (f === 1) p = v + a; else if (f === 2) p = v + up; else if (f === 3) p = v + ((a + up) >> 1); else { const q = a + up - c, pa = Math.abs(q - a), pb = Math.abs(q - up), pc = Math.abs(q - c); p = v + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c); }
      out[t + x] = p & 255; } }
  if (ct !== 3) return { data: out, width: W, height: H, channels: n };
  const m = trns ? 4 : 3, P = new Uint8Array(W * H * m);
  for (let i = 0; i < W * H; i++) { const k = out[i]; P[i * m] = pal[k * 3]; P[i * m + 1] = pal[k * 3 + 1]; P[i * m + 2] = pal[k * 3 + 2]; if (m === 4) P[i * m + 3] = k < trns.length ? trns[k] : 255; }
  return { data: P, width: W, height: H, channels: m };
}

/* -- encoding -- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer); dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i); out.set(data, 8);
  let c = 0xffffffff; for (let i = 4; i < 8 + data.length; i++) c = CRC[(c ^ out[i]) & 255] ^ (c >>> 8); dv.setUint32(8 + data.length, (c ^ 0xffffffff) >>> 0);
  return out;
}
async function encodePNG(im) {
  const { width: W, height: H, channels: n } = im, ct = { 1: 0, 2: 4, 3: 2, 4: 6 }[n], stride = W * n, raw = new Uint8Array(H * (stride + 1));
  for (let y = 0; y < H; y++) raw.set(im.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const hdr = new Uint8Array(13), dv = new DataView(hdr.buffer); dv.setUint32(0, W); dv.setUint32(4, H); hdr[8] = 8; hdr[9] = ct;
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', hdr), chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
}
export async function encodeCanvas(im, type, quality) {
  const rgba = im.channels === 4 ? im : chans(im, 4), cv = new OffscreenCanvas(im.width, im.height), g = cv.getContext('2d');
  g.putImageData(new ImageData(new Uint8ClampedArray(rgba.data.buffer, rgba.data.byteOffset, rgba.data.byteLength), im.width, im.height), 0, 0);
  return new Uint8Array(await (await cv.convertToBlob({ type, quality })).arrayBuffer());
}
export { decode as decodeImage };
