// The forge studio's read-only server: /wagmi/ from Mog City (face.js), /cast/ the forge's copy of that face (scripts/forge/face.js, FC), /forge/ from scripts/forge (clips-runtime.mjs, the
// studio page), /f/ from the forge's output folder (FORGE_OUT). Local only.  node serve.mjs <port>
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { MOGCITY } from '../paths.mjs';
const MC = MOGCITY, FORGE = path.resolve(new URL('..', import.meta.url).pathname), OUT = path.resolve(process.env.FORGE_OUT || '.'), PORT = +(process.argv[2] || 4987);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png' };
const roots = [['/f/', OUT], ['/forge/', FORGE], ['/wagmi/', MC + '/wagmi'], ['/cast/', FORGE]];
http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname), r = roots.find(([p]) => u.startsWith(p));
  const f = r && path.join(r[1], u.slice(r[0].length));
  if (!f || !f.startsWith(r[1] + '/')) { res.writeHead(404); return res.end(); }
  fs.stat(f, (e, st) => { if (e || !st.isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(res); });
}).listen(PORT, '127.0.0.1', () => console.log('forge studio on', PORT));
