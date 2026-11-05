/**
 * Story Kit: the Character Forge in a creator's browser (B6). Part of `npm run check`.
 *
 * 1. Every sharp call the forge's modules make exists in the browser's stand-in (scripts/forge/sharp-web.mjs). The Node
 *    forge runs real sharp, so a missing method crashes the browser forge only: the beard texture's extract/composite
 *    did for the old boss, the cop and the veteran ("l(...).extract is not a function", WIRE-PROOF.md).
 * 2. All anchors (storykit/anchors.json) forged in headless Chrome with the built public/storykit/forge/forge.js, as a
 *    creator's build does: no error, and each GLB under the store's per-person cap (lib/storykit-store.ts LIMITS.glb.each).
 *    The forge runs its uncovered gate itself (scripts/forge/uncovered.mjs: a see-through body is a forge error), and
 *    each run records its worst patch (uncoveredCm2).
 *    `npm run storykit:forge-browser-check` forges them (headless Chrome, under the shared one-Chrome lock when this
 *    machine has one, about 2 min) and, when all pass, writes the proof (storykit/forge-browser-proof.json: the hash of
 *    forge.js, the kit and the sheets, and each anchor's size and time); commit it with forge.js. `npm run check` does not
 *    start Chrome (a 2 min Chrome run inside the check is killed by callers' time-outs and leaves Chrome behind, holding
 *    the lock): it checks that the proof is for this forge.js, kit and these sheets and that every anchor passed, and
 *    fails with the command to run when forge.js, the kit or an anchor changed since.
 *    env FORGE_BROWSER_SAVE=<dir> keeps the GLBs; FORGE_WEB_JS=<file> tries a candidate build of forge.js in its place
 *    (no proof written).
 */
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, createReadStream } from 'node:fs';
import path from 'node:path';
import { chromePath, withBrowser } from '../lib/browser.ts';
import { LIMITS } from '../lib/storykit-store.ts';
import { makeSharp } from './forge/sharp-web.mjs';
import { CHROME_LOCK_MODULE } from './forge/paths.mjs';

type Ok = (name: string, cond: boolean, detail?: string) => void;
const ROOT = path.resolve(new URL('..', import.meta.url).pathname), PUB = path.join(ROOT, 'public');
const PORTS = process.env.FORGE_BROWSER_PORT ? [+process.env.FORGE_BROWSER_PORT] : [4985, 4983, 4989, 4982, 4981], CAP = LIMITS.glb.each;
const PROOF = path.join(ROOT, 'storykit/forge-browser-proof.json');
const WEB_JS = process.env.FORGE_WEB_JS ? path.resolve(process.env.FORGE_WEB_JS) : '';   // (a candidate forge.js served in place of the built one)
const SAVE = process.env.FORGE_BROWSER_SAVE || '';   // (a folder: each anchor's browser GLB saved there)
const LOCK = CHROME_LOCK_MODULE;   // (the shared one-Chrome lock, where this machine has one: scripts/forge/paths.mjs)

// sharp's chainable methods (sharp 0.33's API). A forge module calling one of these on a sharp(...) image needs it in sharp-web.mjs.
const SHARP_API = ['resize', 'extend', 'extract', 'trim', 'rotate', 'autoOrient', 'flip', 'flop', 'affine', 'sharpen', 'median', 'blur', 'flatten', 'unflatten', 'gamma', 'negate',
  'normalise', 'normalize', 'clahe', 'convolve', 'threshold', 'boolean', 'linear', 'recomb', 'modulate', 'tint', 'greyscale', 'grayscale', 'pipelineColourspace', 'toColourspace',
  'toColorspace', 'removeAlpha', 'ensureAlpha', 'extractChannel', 'joinChannel', 'bandbool', 'composite', 'raw', 'jpeg', 'png', 'webp', 'avif', 'tiff', 'gif', 'heif', 'jp2', 'toFormat',
  'toBuffer', 'toFile', 'metadata', 'stats', 'clone', 'withMetadata', 'keepMetadata', 'timeout'];

/** the sharp methods the forge's modules call on a sharp(...) chain (from `sharp(` to the statement's end) */
export function forgeSharpCalls() {
  const dir = path.join(ROOT, 'scripts/forge'), used = new Map<string, string>();
  for (const f of readdirSync(dir).filter((f) => /\.m?js$/.test(f) && !/^(sharp-web|env-node|build-web)\.mjs$/.test(f))) {
    const src = readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/\bsharp\(/g)) {
      const stmt = src.slice(m.index!, src.indexOf(';', m.index!) >>> 0 || undefined).split('\n').slice(0, 4).join('\n');
      for (const c of stmt.matchAll(/\)\s*\.(\w+)\(/g)) if (SHARP_API.includes(c[1]) && !used.has(c[1])) used.set(c[1], f);
      if (/sharp\(\{\s*create:/.test(stmt)) used.set('create', f);
    }
  }
  return used;
}

async function shimChecks(ok: Ok) {
  const sharp = makeSharp(async () => new Uint8Array(0)) as any, img = sharp(new Uint8Array(4), { raw: { width: 1, height: 1, channels: 4 } });
  const used = forgeSharpCalls(), missing = [...used.keys()].filter((m) => m !== 'create' && typeof img[m] !== 'function');
  ok(`every sharp call the forge makes exists in the browser forge's sharp (${used.size}: ${[...used.keys()].join(' ')})`, !missing.length, missing.map((m) => `${m} (${used.get(m)})`).join(', '));
  // (create, extract and composite as sharp does them: a 4 x 2 blank, a 2 x 2 red square laid at x 2, the right half cut out)
  const red = await sharp(new Uint8Array(16).fill(255).map((v, i) => (i % 4 === 1 || i % 4 === 2 ? 0 : v)), { raw: { width: 2, height: 2, channels: 4 } }).png().toBuffer();
  const out = await sharp({ create: { width: 4, height: 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: red, left: 2, top: 0 }]).extract({ left: 1, top: 0, width: 2, height: 2 }).raw().toBuffer();
  ok('the browser sharp creates, composites and extracts as sharp does', out.length === 16 && out[3] === 0 && out[4] === 255 && out[5] === 0 && out[7] === 255 && out[11] === 0 && out[12] === 255, Array.from(out).join(','));
}

// (RZ: and the probes (scripts/forge/probes): sheets that are no anchor but a wardrobe the forge must get right in a
// creator's browser too: a woman in overalls, The Velvet Run's Aunt Rosa's wardrobe, that left her with no top)
const PROBES = path.join(ROOT, 'scripts/forge/probes');
const anchors = () => [...(JSON.parse(readFileSync(path.join(ROOT, 'storykit/anchors.json'), 'utf8')).anchors as { id: string; sheet: string }[])
  .map((a) => ({ id: a.id, sheet: JSON.parse(readFileSync(path.join(ROOT, a.sheet), 'utf8')) })),
  ...(existsSync(PROBES) ? readdirSync(PROBES).filter((f) => f.endsWith('.json')).sort().map((f) => { const sheet = JSON.parse(readFileSync(path.join(PROBES, f), 'utf8')); return { id: sheet.id as string, sheet }; }) : [])];

export function proofKey(webJs = path.join(PUB, 'storykit/forge/forge.js')) {
  const h = createHash('sha256');
  h.update(readFileSync(webJs));
  const kit = path.join(PUB, 'storykit/forge/kit');
  for (const f of readdirSync(kit).sort()) { h.update(f); h.update(readFileSync(path.join(kit, f))); }
  h.update(JSON.stringify(anchors())); h.update(String(CAP));
  return h.digest('hex');
}

const TYPES: Record<string, string> = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.bin': 'application/octet-stream' };
async function serve(): Promise<[Server, number]> {
  let last: unknown;
  for (const p of PORTS) { try { return [await serveOn(p), p]; } catch (e) { last = e; } }
  throw last;
}
function serveOn(PORT: number): Promise<Server> {
  // (public/ read only, as the site serves it: /assets/ and /storykit/forge/)
  const srv = createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname), f = u === '/storykit/forge/forge.js' && WEB_JS ? WEB_JS : path.join(PUB, u === '/' ? '/storykit/forge/index.html' : u);
    if (!(f === WEB_JS || f.startsWith(PUB + '/')) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); createReadStream(f).pipe(res);
  });
  return new Promise((r, j) => { srv.once('error', j); srv.listen(PORT, '127.0.0.1', () => r(srv)); });
}

export type ForgeRun = { id: string; bytes?: number; ms?: number; uncoveredCm2?: number; error?: string };
/** forge every anchor in headless Chrome; the GLB sizes and errors */
export async function forgeAnchorsInBrowser(log: (s: string) => void = () => {}): Promise<{ runs: ForgeRun[]; pageErrors: string[]; chrome: string }> {
  // (the lock, unless this run already holds it: locked.mts writes the script's name into it)
  const mod = existsSync(LOCK) ? await import(LOCK) : null;
  const held = (() => { try { return !!mod?.LOCK && /storykit-forge-browser-check/.test(readFileSync(mod.LOCK, 'utf8')); } catch { return false; } })();
  const lock = mod && !held ? mod : null;
  if (lock) await lock.take('storykit forge browser check', log);
  const [srv, PORT] = await serve();
  try {
    return await withBrowser(async (page) => {
      await page.goto(`http://127.0.0.1:${PORT}/storykit/forge/index.html`);
      for (let i = 0; i < 100; i++) { if (await page.eval<boolean>('!!window.__forge').catch(() => false)) break; await new Promise((r) => setTimeout(r, 100)); }
      const runs: ForgeRun[] = [];
      for (const a of anchors()) {
        const r = await page.eval<ForgeRun>(`(async () => { const { forge } = await import('/storykit/forge/forge.js'); const t = performance.now();
          try { const r = await forge(${JSON.stringify(a.sheet)}); window.__glb = r.glb; return { id: ${JSON.stringify(a.id)}, bytes: r.glb.byteLength, ms: Math.round(performance.now() - t), uncoveredCm2: r.rec.checks.uncovered?.worstCm2 }; }
          catch (e) { return { id: ${JSON.stringify(a.id)}, error: String(e && e.stack || e).split('\\n').slice(0, 3).join(' | ').slice(0, 400) }; } })()`)
          .catch((e): ForgeRun => ({ id: a.id, error: String(e).slice(0, 400) }));
        if (SAVE && !r.error) { mkdirSync(SAVE, { recursive: true }); writeFileSync(path.join(SAVE, a.id + '.glb'), Buffer.from(await page.eval<string>(`(() => { const g = window.__glb; let s = ''; for (let i = 0; i < g.length; i += 0x8000) s += String.fromCharCode(...g.subarray(i, i + 0x8000)); return btoa(s); })()`), 'base64')); }
        log(`  ${a.id}: ${r.error ? 'ERROR ' + r.error : `${(r.bytes! / 1048576).toFixed(2)} MB in ${(r.ms! / 1000).toFixed(1)} s, uncovered ${r.uncoveredCm2} cm2`}`);
        runs.push(r);
      }
      return { runs, pageErrors: page.errors.slice(0, 10), chrome: String(await page.eval<string>('navigator.userAgent')).match(/Chrome\/[\d.]+/)?.[0] || '' };
    }, { width: 800, height: 600, timeoutMs: 230_000 });
  } finally { srv.close(); lock?.release(); }
}

function judge(ok: Ok, runs: ForgeRun[], pageErrors: string[]) {
  const bad = runs.filter((r) => r.error), big = runs.filter((r) => !r.error && r.bytes! > CAP), n = runs.length;
  ok(`all ${n} anchors and probes forge in the browser without an error (the forge's uncovered gate included)`, n >= 12 && !bad.length && !pageErrors.length, [...bad.map((r) => `${r.id}: ${r.error}`), ...pageErrors].join('; '));
  ok(`every anchor's browser-forged GLB is under the store's ${(CAP / 1048576).toFixed(0)} MB per person`, n >= 12 && !big.length,
    big.length ? big.map((r) => `${r.id} ${(r.bytes! / 1048576).toFixed(2)} MB`).join(', ') : `largest ${Math.max(...runs.map((r) => r.bytes || 0)) / 1048576 > 0 ? (Math.max(...runs.map((r) => r.bytes || 0)) / 1048576).toFixed(2) : '?'} MB`);
}

const RUN = 'npm run storykit:forge-browser-check';
export async function runForgeBrowserChecks(ok: Ok) {
  console.log('\nStory Kit: the Character Forge in a creator\'s browser');
  await shimChecks(ok);
  let proof: any = null; try { proof = JSON.parse(readFileSync(PROOF, 'utf8')); } catch {}
  const fresh = !!proof && proof.key === proofKey();
  ok(`the built forge.js, its kit and the anchors were forged in Chrome since they last changed (${path.relative(ROOT, PROOF)})`, fresh,
    !proof ? `no proof: ${RUN}` : fresh ? `${proof.at}, ${proof.chrome}` : `forge.js, the kit or an anchor changed since ${proof.at}: ${RUN}`);
  if (fresh) judge(ok, proof.runs, []);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let fails = 0; const ok: Ok = (name, cond, detail = '') => { console.log(`${cond ? '  ok  ' : '  FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); if (!cond) fails++; };
  console.log('\nStory Kit: the anchors forged in a creator\'s browser (headless Chrome)');
  await shimChecks(ok);
  if (!chromePath()) { ok('Chrome on this machine', false, 'set CHROME_PATH'); process.exit(1); }
  try {
    const key = proofKey(WEB_JS || undefined), { runs, pageErrors, chrome } = await forgeAnchorsInBrowser((s) => console.log(s));
    judge(ok, runs, pageErrors);
    if (!fails && !WEB_JS) { writeFileSync(PROOF, JSON.stringify({ $comment: `${RUN} (B6): every anchor forged in headless Chrome with this forge.js (key: sha256 of forge.js, the kit and the anchors' sheets); bytes under the store's ${CAP} a person`, key, at: new Date().toISOString(), chrome, runs }, null, 1) + '\n'); console.log(`  proof written: ${path.relative(ROOT, PROOF)}`); }
  } catch (e) { ok('the anchors forged in Chrome', false, String(e).slice(0, 300)); }
  process.exit(fails ? 1 : 0);
}
