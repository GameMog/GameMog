// Hand-built cast: the forge studio's read-only server plus /hb/ (this folder: the hand-built studio page). Local only.
//   node scripts/handbuilt/serve.mjs <port>     env FORGE_OUT = the folder of GLBs served at /f/
import http from 'node:http'; import { MOGCITY } from '../forge/paths.mjs'; import fs from 'node:fs'; import path from 'node:path';
const HERE = path.resolve(new URL('.', import.meta.url).pathname), FORGE = path.resolve(HERE, '../forge');
const MC = MOGCITY, OUT = path.resolve(process.env.FORGE_OUT || '.'), PORT = +(process.argv[2] || 4982);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png' };
const roots = [['/f/', OUT], ['/hb/', HERE], ['/forge/', FORGE], ['/wagmi/', MC + '/wagmi'], ['/cast/', FORGE]];
http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname), r = roots.find(([p]) => u.startsWith(p));
  const f = r && path.join(r[1], u.slice(r[0].length));
  if (!f || !f.startsWith(r[1] + '/')) { res.writeHead(404); return res.end(); }
  fs.stat(f, (e, st) => { if (e || !st.isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(res); });
}).listen(PORT, '127.0.0.1', () => console.log('hand-built studio on', PORT));
