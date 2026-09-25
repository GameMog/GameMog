/**
 * Download every third-party source the asset library is built from.
 * `npm run assets:fetch`
 *
 * Sources are pinned in assets-src/sources.json (a commit, a zip, exact
 * paths). The first download records each file's SHA-256 in
 * sources.lock.json; every later download must match it, so a source that
 * changes upstream stops the build instead of quietly changing the library.
 * From the 280 MB MakeHuman zip only the listed entries are fetched, with
 * HTTP range requests against the zip's central directory. Sources marked
 * `manual` (Quaternius's packs, which itch.io serves through links that
 * expire in a minute) are downloaded by hand and checked here.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const ROOT = 'assets-src';
const CACHE = join(ROOT, 'cache');
const sources = JSON.parse(readFileSync(join(ROOT, 'sources.json'), 'utf8')).sources as Record<string, any>;
const lockPath = join(ROOT, 'sources.lock.json');
const lock: Record<string, { sha256: string; bytes: number }> = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')) : {};

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
async function get(url: string, range?: [number, number]): Promise<Uint8Array> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: range ? { Range: `bytes=${range[0]}-${range[1]}` } : {} });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) { if (attempt >= 3) throw e; await new Promise((r) => setTimeout(r, 1500 * attempt)); }
  }
}
function save(key: string, data: Uint8Array) {
  const h = sha(data);
  if (lock[key] && lock[key].sha256 !== h) throw new Error(`${key} changed upstream: expected ${lock[key].sha256}, got ${h}`);
  lock[key] = { sha256: h, bytes: data.length };
  const p = join(CACHE, key);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, data);
}
const have = (key: string) => existsSync(join(CACHE, key)) && lock[key] && sha(readFileSync(join(CACHE, key))) === lock[key].sha256;

// plain files
for (const [name, src] of Object.entries(sources)) {
  if (!src.base) continue;
  for (const f of src.files as string[]) {
    const key = `${name}/${f}`;
    if (have(key)) continue;
    const data = await get(src.base + f);
    if (src.md5?.[f]) {
      const m = createHash('md5').update(data).digest('hex');
      if (m !== src.md5[f]) throw new Error(`${key}: md5 ${m} does not match the publisher's ${src.md5[f]}`);
    }
    save(key, data);
    console.log(`  ${key} (${(data.length / 1024).toFixed(0)} KB)`);
  }
}

// entries of a remote zip, by range request
for (const [name, src] of Object.entries(sources)) {
  if (!src.zip) continue;
  const todo = (src.files as string[]).filter((f) => !have(`${name}/${f}`));
  if (!todo.length) continue;
  const size: number = src.zipBytes;
  const tail = await get(src.zip, [size - 66000, size - 1]);
  const dv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('zip: no end of central directory');
  let cdSize = dv.getUint32(eocd + 12, true), cdOff = dv.getUint32(eocd + 16, true);
  if (cdOff === 0xffffffff) {
    let z = -1; for (let i = eocd; i >= 0; i--) if (dv.getUint32(i, true) === 0x06064b50) { z = i; break; }
    cdSize = Number(dv.getBigUint64(z + 40, true)); cdOff = Number(dv.getBigUint64(z + 48, true));
  }
  const cd = await get(src.zip, [cdOff, cdOff + cdSize - 1]);
  const cv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const entries = new Map<string, { method: number; csize: number; offset: number }>();
  for (let p = 0; p + 46 <= cd.length && cv.getUint32(p, true) === 0x02014b50;) {
    const method = cv.getUint16(p + 10, true), nl = cv.getUint16(p + 28, true), el = cv.getUint16(p + 30, true), cl = cv.getUint16(p + 32, true);
    let csize = cv.getUint32(p + 20, true), usize = cv.getUint32(p + 24, true), offset = cv.getUint32(p + 42, true);
    const fname = new TextDecoder().decode(cd.subarray(p + 46, p + 46 + nl));
    for (let q = p + 46 + nl; q < p + 46 + nl + el;) {
      const id = cv.getUint16(q, true), len = cv.getUint16(q + 2, true); let k = q + 4;
      if (id === 1) {
        if (usize === 0xffffffff) { usize = Number(cv.getBigUint64(k, true)); k += 8; }
        if (csize === 0xffffffff) { csize = Number(cv.getBigUint64(k, true)); k += 8; }
        if (offset === 0xffffffff) offset = Number(cv.getBigUint64(k, true));
      }
      q += 4 + len;
    }
    entries.set(fname, { method, csize, offset });
    p += 46 + nl + el + cl;
  }
  for (const f of todo) {
    const e = entries.get(f);
    if (!e) throw new Error(`${name}: ${f} is not in the zip`);
    const head = await get(src.zip, [e.offset, e.offset + 29]);
    const hv = new DataView(head.buffer, head.byteOffset, head.byteLength);
    const start = e.offset + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
    const raw = await get(src.zip, [start, start + e.csize - 1]);
    const data = e.method === 8 ? new Uint8Array(inflateRawSync(raw)) : raw;
    save(`${name}/${f}`, data);
    console.log(`  ${name}/${f} (${(data.length / 1024).toFixed(0)} KB)`);
  }
}

// packs a person downloads by hand (itch.io's links expire in a minute): the
// zip must be where sources.json says and match the lock; the files the
// build reads are unpacked from it and pinned too
for (const [name, src] of Object.entries(sources)) {
  if (!src.manual) continue;
  for (const [zip, z] of Object.entries(src.manual.zips as Record<string, { page: string; entries: Record<string, string> }>)) {
    const key = `${name}/${zip}`, path = join(CACHE, key);
    if (!existsSync(path)) throw new Error(`${key} is missing. ${src.manual.note} Page: ${z.page}`);
    const buf = new Uint8Array(readFileSync(path));
    if (lock[key] && lock[key].sha256 !== sha(buf)) throw new Error(`${key} is not the pinned file: expected ${lock[key].sha256}, got ${sha(buf)}`);
    lock[key] = { sha256: sha(buf), bytes: buf.length };
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let eocd = -1; for (let i = buf.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error(`${key}: no end of central directory`);
    const found = new Map<string, { method: number; csize: number; offset: number }>();
    for (let p = dv.getUint32(eocd + 16, true); dv.getUint32(p, true) === 0x02014b50;) {
      const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      found.set(new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nl)), { method: dv.getUint16(p + 10, true), csize: dv.getUint32(p + 20, true), offset: dv.getUint32(p + 42, true) });
      p += 46 + nl + el + cl;
    }
    for (const [entry, out] of Object.entries(z.entries)) {
      if (have(`${name}/${out}`)) continue;
      const e = found.get(entry); if (!e) throw new Error(`${key}: ${entry} is not in the zip`);
      const start = e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true), raw = buf.subarray(start, start + e.csize);
      save(`${name}/${out}`, e.method === 8 ? new Uint8Array(inflateRawSync(raw)) : raw);
      console.log(`  ${name}/${out} (unpacked from ${zip})`);
    }
  }
}

writeFileSync(lockPath, JSON.stringify(Object.fromEntries(Object.entries(lock).sort()), null, 2) + '\n');
console.log(`sources ready: ${Object.keys(lock).length} files, ${(Object.values(lock).reduce((a, b) => a + b.bytes, 0) / 1e6).toFixed(1)} MB`);
