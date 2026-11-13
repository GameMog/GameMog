/**
 * Upload a pre-warmed hometown store (the Python compiler's layout, made on the Mac by MogCity tools/hometown/prewarm.py)
 * to the server's disk through PUT /api/hometown/admin/objects/{key}. Resumable and idempotent: an object already
 * there is 200 and skipped. Order: the build record, context blocks (--ctx), tiles, then each place's descriptor LAST
 * (the server takes a descriptor only when all its tiles are stored, so a half-uploaded town stays "not built").
 *
 *   HOMETOWN_ADMIN_TOKEN=... node --import ./scripts/ts-resolve.mjs scripts/hometown-upload.ts \
 *     --store <dir> --build htc-0.3.0-hg1-b... --base https://gamemog.com [--ctx] [--concurrency 4] [--dry-run]
 * The token is read from the environment only and never printed.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { BUILD_ID, parseKeyString } from '../lib/hometown-tiles/keys.ts';

const { values: o } = parseArgs({ options: { store: { type: 'string' }, build: { type: 'string' }, base: { type: 'string', default: 'http://localhost:3939' }, ctx: { type: 'boolean' }, concurrency: { type: 'string', default: '4' }, 'dry-run': { type: 'boolean' } } });
if (!o.store || !o.build || !BUILD_ID.test(o.build)) { console.error('usage: --store <dir> --build <htc-...> --base <origin> [--ctx]'); process.exit(2); }
const token = process.env.HOMETOWN_ADMIN_TOKEN;
if (!token && !o['dry-run']) { console.error('HOMETOWN_ADMIN_TOKEN is not set in this shell'); process.exit(2); }
const root = path.resolve(o.store);

const walk = (rel: string): string[] => {
  const d = path.join(root, rel);
  let names: string[];
  try { names = readdirSync(d); } catch { return []; }
  return names.flatMap((n) => (statSync(path.join(d, n)).isDirectory() ? walk(`${rel}/${n}`) : n.includes('.tmp-') ? [] : [`${rel}/${n}`]));
};
const keys = [
  `builds/${o.build}.json`,
  ...(o.ctx ? walk(`ctx/${o.build}`) : []),
  ...walk(`tiles/${o.build}`),
];
const manifests = walk(`manifests/${o.build}`);
for (const k of [...keys, ...manifests]) if (!parseKeyString(k)) throw new Error(`not a hometown key: ${k}`);

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const tally = { created: 0, already: 0, failed: 0, bytes: 0 };
async function put(key: string) {
  const body = readFileSync(path.join(root, ...key.split('/')));
  const headers: Record<string, string> = { 'content-type': 'application/octet-stream' };
  if (key.startsWith('tiles/') || key.startsWith('ctx/')) headers['x-content-sha256'] = sha(gunzipSync(body));
  if (o['dry-run']) { tally.bytes += body.length; return; }
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(`${o.base}/api/hometown/admin/objects/${key}`, { method: 'PUT', body, headers: { ...headers, authorization: `Bearer ${token}` } });
      const j = await r.json().catch(() => ({}));
      if (r.status === 201) { tally.created++; tally.bytes += body.length; return; }
      if (r.status === 200) { tally.already++; return; }
      if ((r.status >= 500 && r.status !== 507) && attempt < 4) { await new Promise((s) => setTimeout(s, 1000 * 2 ** attempt)); continue; }
      tally.failed++; console.error(`${key}: ${r.status} ${(j as { error?: string }).error ?? ''}`);
      if (r.status === 507 || r.status === 401) process.exit(1);
      return;
    } catch (e) {
      if (attempt < 4) { await new Promise((s) => setTimeout(s, 1000 * 2 ** attempt)); continue; }
      tally.failed++; console.error(`${key}: ${(e as Error).message}`); return;
    }
  }
}
async function pool(list: string[], n: number) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) await put(list[i++]); }));
}
await put(keys[0]);
await pool(keys.slice(1), Number(o.concurrency));
await pool(manifests, 1);
console.log(JSON.stringify({ build: o.build, objects: keys.length + manifests.length, places: manifests.length, ...tally, dryRun: !!o['dry-run'] }));
process.exit(tally.failed ? 1 : 0);
