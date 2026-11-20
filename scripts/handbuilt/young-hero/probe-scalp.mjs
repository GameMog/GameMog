// probe: an ASCII map of the head (azimuth round a centre x y-up): the skin texture's luminance (the forge's scalp
// paint) and the card mop's distance, to place the shells' hairline.   node probe-scalp.mjs <glb>
import { read, body, prim, matOf, rgba } from './glb.mjs';
const { doc } = await read(process.argv[2]);
const B = body(doc), p = B.pos, uv = B.uv.getArray(), head = B.wOn(/^(head|neck)$/);
const { data, w } = await rgba(matOf(doc, 'skin').getBaseColorTexture());
const hp = prim(doc, 'hair')[0], hpos = hp.getAttribute('POSITION').getArray(), hv = [...new Set(hp.getIndices().getArray())];
const skin = new Set(prim(doc, 'skin').flatMap((q) => [...q.getIndices().getArray()]));
const L = (v) => { const x = Math.min(w - 1, Math.floor(uv[v * 2] * w)), y = Math.min(w - 1, Math.floor(uv[v * 2 + 1] * w)), i = (y * w + x) * 4; return (data[i] + data[i + 1] + data[i + 2]) / 3; };
const near = (v) => { let b = 1e9; for (const h of hv) { const d = (hpos[h * 3] - p[v * 3]) ** 2 + (hpos[h * 3 + 1] - p[v * 3 + 1]) ** 2 + (hpos[h * 3 + 2] - p[v * 3 + 2]) ** 2; if (d < b) b = d; } return Math.sqrt(b); };
const CZ = 0.05, NA = 36, ys = []; for (let y = 1.88; y >= 1.62; y -= 0.01) ys.push(y);
const gL = ys.map(() => Array.from({ length: NA }, () => [0, 0, 0])); 
for (const v of skin) { if (head[v] < 0.5) continue; const y = p[v * 3 + 1]; if (y < 1.615) continue; const a = Math.atan2(p[v * 3], p[v * 3 + 2] - CZ); const ai = Math.floor(((a + Math.PI) / (2 * Math.PI)) * NA) % NA, yi = Math.round((1.88 - y) / 0.01); if (yi < 0 || yi >= ys.length) continue;
  const c = gL[yi][ai]; c[0] += L(v); c[1] += near(v); c[2]++; }
console.log('azimuth: col 0 = back (-180), col 18 = front (0); x>0 to the right half');
for (const [lab, k, f] of [['L/26', 0, (m) => Math.min(9, Math.floor(m / 26))], ['hair mm/10', 1, (m) => Math.min(9, Math.floor(m * 100))]]) {
  console.log('==', lab); for (const [yi, y] of ys.entries()) console.log(y.toFixed(2), gL[yi].map((c) => (c[2] ? String(f(c[k] / c[2])) : ' ')).join(''));
}
