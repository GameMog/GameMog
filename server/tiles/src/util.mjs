import crypto from 'node:crypto';
import zlib from 'node:zlib';

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// JSON with sorted object keys: the same value always gives the same bytes.
export function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

// gzip with mtime 0 and OS byte 255 ("unknown"), as Python's gzip module writes it: zlib otherwise stamps the host OS,
// so the same input would give different bytes on macOS and Linux.
export function gzipDeterministic(buf) {
  const out = zlib.gzipSync(buf, { level: 9 });
  out[9] = 255;
  return out;
}

export function brotli(buf) {
  return zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } });
}

export function decode(buf, encoding) {
  if (!encoding || encoding === 'identity') return buf;
  if (encoding === 'gzip') return zlib.gunzipSync(buf);
  if (encoding === 'br') return zlib.brotliDecompressSync(buf);
  throw new Error(`unknown content encoding ${encoding}`);
}

// A counting semaphore: run(fn) waits for a free slot.
export function semaphore(limit) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= limit || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve().then(fn).then(resolve, reject).finally(() => { active--; next(); });
  };
  return {
    run: (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); }),
    get active() { return active; },
    get waiting() { return queue.length; },
  };
}

// map(items, fn) with at most `limit` in flight; results in input order.
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
