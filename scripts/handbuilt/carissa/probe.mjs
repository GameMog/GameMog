// Hand-built Carissa: a forged GLB's landmarks and parts at a glance (bind pose, metres). Read-only.
//   node scripts/handbuilt/carissa/probe.mjs <a.glb>
import { read, body, prim } from '../young-hero/glb.mjs';
const { doc } = await read(process.argv[2]); const B = body(doc), R = doc.getRoot();
const bb = (p) => { const a0 = p.getAttribute('POSITION').getArray(), ix = p.getIndices().getArray(), a = new Float32Array(ix.length * 3); ix.forEach((v, i) => { for (let k = 0; k < 3; k++) a[i * 3 + k] = a0[v * 3 + k]; }); const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a[i + k]); hi[k] = Math.max(hi[k], a[i + k]); } return [lo.map((x) => +x.toFixed(4)), hi.map((x) => +x.toFixed(4))]; };
for (const m of R.listMeshes()) for (const p of m.listPrimitives()) console.log(m.getName(), p.getMaterial()?.getName(), p.getAttribute('POSITION').getCount(), p.getIndices().getCount() / 3, JSON.stringify(bb(p)));
const eyes = prim(doc, 'eyes')[0]; if (eyes) { const a = eyes.getAttribute('POSITION').getArray(); let sL = [0, 0, 0, 0], sR = [0, 0, 0, 0]; for (const v of new Set(eyes.getIndices().getArray())) { const i = v * 3; const s = a[i] > 0 ? sL : sR; s[0] += a[i]; s[1] += a[i + 1]; s[2] += a[i + 2]; s[3]++; } console.log('eye L', sL.slice(0, 3).map((x) => (x / sL[3]).toFixed(4)), 'R', sR.slice(0, 3).map((x) => (x / sR[3]).toFixed(4))); }
const p = B.pos; let top = -1, nose = [0, 0, -1]; const wH = B.wOn(/^head$/);
for (let v = 0; v < p.length / 3; v++) { if (wH[v] < 0.5) continue; if (p[v * 3 + 1] > top) top = p[v * 3 + 1]; if (Math.abs(p[v * 3]) < 0.004 && p[v * 3 + 2] > nose[2]) nose = [p[v * 3], p[v * 3 + 1], p[v * 3 + 2]]; }
console.log('head top', top.toFixed(4), 'nose tip', nose.map((x) => x.toFixed(4)));
// the face's midline profile, every 5 mm: front-most z at |x| < 3 mm
const prof = new Map(); for (let v = 0; v < p.length / 3; v++) { if (wH[v] < 0.3 || Math.abs(p[v * 3]) > 0.003) continue; const k = Math.round(p[v * 3 + 1] * 200); prof.set(k, Math.max(prof.get(k) ?? -1, p[v * 3 + 2])); }
console.log('profile', [...prof].sort((a, b) => b[0] - a[0]).map(([k, z]) => `${(k / 200).toFixed(3)}:${z.toFixed(3)}`).join(' '));
const ibm = B.skin.getInverseBindMatrices().getArray(); const jn = ['head', 'neck01', 'spine01', 'wrist_L', 'clavicle_L', 'upperarm01_L', 'breast_L', 'pelvis.L', 'foot_L'];
for (const n of jn) { const i = B.names.indexOf(n); if (i < 0) continue; const m = ibm.slice(i * 16, i * 16 + 16); /* inverse: translation of the bind = -(R^T t) */ const R3 = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]], t = [m[12], m[13], m[14]]; const pos = [0, 1, 2].map((r) => -(R3[0][r] * t[0] + R3[1][r] * t[1] + R3[2][r] * t[2])); console.log('joint', n, pos.map((x) => x.toFixed(4))); }
console.log('joints', B.names.join(' '));
