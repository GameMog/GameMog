#!/usr/bin/env node
// A static server for playing Mog City locally: node tools/serve.mjs [port 8000] [host 127.0.0.1]
// Like `python3 -m http.server`, but with byte ranges (206 Partial Content), so media streams and seeks as it does on
// mc.gamemog.com (GitHub Pages): the radio's Mog Music (media/mog-music/*.mp3, audio/mpeg) picks a song up mid-way.
// The repository's folder only; no directory listings; nothing cached (no-store), so an edit shows on reload.
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

export function handler(root = ROOT) {
  return (req, res) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
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
  http.createServer(handler()).listen(PORT, HOST, () => console.log(`Mog City on http://${HOST}:${PORT}/ (${ROOT})`));
}
