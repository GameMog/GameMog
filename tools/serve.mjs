#!/usr/bin/env node
// A static server for playing Mog City locally: node tools/serve.mjs [port 8000] [host 127.0.0.1]
// Like `python3 -m http.server`, but with byte ranges (206 Partial Content), so media streams and seeks as it does on
// mc.gamemog.com (GitHub Pages): the radio's Mog Music (media/mog-music/*.mp3, audio/mpeg) picks a song up mid-way.
// The repository's folder only; no directory listings; nothing cached (no-store), so an edit shows on reload.
//
// A test mode, off unless asked for: the 503s GitHub Pages answers part of a page load's burst with for a few minutes after
// a release (js/net-retry.js, the head's mcScriptRetry), injected so the retries can be seen to work:
//   FAIL503=0.15 node tools/serve.mjs 6230    a share of the paths (picked by a hash of the path and FAIL503_SEED, default
//                                             1: the same paths every run) answered 503 the first time each is asked for
//   FAIL503=every:7                           every 7th request (any path) answered 503
//   FAIL503_TIMES=2                           (with a share) the first 2 requests of a picked path, not just the first
//   FAIL503_RETRY_AFTER=1                     a Retry-After: 1 on each injected 503
//   FAIL503_MATCH='^/(wagmi|assets)/'         only paths matching this regular expression
// The page itself (/, /index.html) is never failed. Each injected 503 is logged, '503 <path>'.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || 8000), HOST = process.argv[3] || '127.0.0.1';
export const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.ktx2': 'image/ktx2',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.gz': 'application/gzip', '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.hdr': 'application/octet-stream',
};

// the injected-503 test mode: fail(pathname) -> true when this request is to be answered 503
export function failer(spec = '', { seed = 1, times = 1, match = '' } = {}) {
  if (!spec || spec === '0') return null;
  if (match) { const re = new RegExp(match), f = failer(spec, { seed, times }); return (p) => re.test(p) && f(p); }
  const every = /^every:(\d+)$/.exec(spec);
  if (every) { const n = Math.max(1, +every[1]); let k = 0; return () => ++k % n === 0; }
  const share = Number(spec);
  if (!(share > 0 && share <= 1)) throw new Error(`FAIL503: a share in (0, 1] or every:N, not ${spec}`);
  const seen = new Map();
  // (FNV-1a of seed:path, 0..1)
  const pick = (p) => { let h = 0x811c9dc5; for (const c of `${seed}:${p}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h / 2 ** 32 < share; };
  return (p) => { if (!pick(p)) return false; const n = (seen.get(p) || 0) + 1; seen.set(p, n); return n <= times; };
}

export function handler(root = ROOT, { fail = null, retryAfter = '' } = {}) {
  return (req, res) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
    if (fail && rel !== '/' && rel !== '/index.html' && fail(rel)) {
      console.log('503', rel);
      res.writeHead(503, { 'content-type': 'text/plain', 'cache-control': 'no-store', ...(retryAfter ? { 'retry-after': retryAfter } : {}) }).end('busy (FAIL503)');
      return;
    }
    let f = path.join(root, rel);
    if (f !== root && !f.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.stat(f, (e, st) => {
      if (!e && st.isDirectory()) { f = path.join(f, 'index.html'); try { st = fs.statSync(f); } catch (e2) { e = e2; } }
      if (e || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
      const head = { 'content-type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'accept-ranges': 'bytes', 'cache-control': 'no-store' };
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      let start = 0, end = st.size - 1, code = 200;
      if (m && (m[1] || m[2])) {
        if (m[1]) { start = +m[1]; if (m[2]) end = Math.min(+m[2], st.size - 1); } else { start = Math.max(0, st.size - +m[2]); }
        if (start > end || start >= st.size) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }).end(); return; }
        code = 206; head['content-range'] = `bytes ${start}-${end}/${st.size}`;
      }
      head['content-length'] = st.size ? end - start + 1 : 0;
      res.writeHead(code, head);
      if (req.method === 'HEAD' || !st.size) { res.end(); return; }
      fs.createReadStream(f, { start, end }).on('error', () => res.destroy()).pipe(res);
    });
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const E = process.env, fail = failer(E.FAIL503, { seed: E.FAIL503_SEED || 1, times: Number(E.FAIL503_TIMES) || 1, match: E.FAIL503_MATCH || '' });
  http.createServer(handler(ROOT, { fail, retryAfter: E.FAIL503_RETRY_AFTER || '' })).listen(PORT, HOST, () => console.log(`Mog City on http://${HOST}:${PORT}/ (${ROOT})${fail ? ` FAIL503=${E.FAIL503}` : ''}`));
}
