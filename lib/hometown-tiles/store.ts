/**
 * Hometown tile store on GameMog's own Render disk (data/hometown, beside gamemog.db and the Story Kit store; no new
 * account, no cloud storage). Objects are immutable files in the Python compiler's layout (keys.ts): written once,
 * ifAbsent, through a temp file and link(2), so a reader never sees half a file and two writers keep the first.
 *
 * The disk is shared, so every put is guarded twice (hits always still serve):
 *   cap    the store's own bytes may not pass HOMETOWN_DISK_CAP_GB (2 by default)
 *   floor  the disk's free space may not drop below HOMETOWN_FREE_FLOOR_GB (2 by default), whoever used it
 * A refused put is a StoreFull (HTTP 507) and is logged once a minute as `disk-full`.
 *
 * Usage is counted by walking the store once, then kept up to date by this process's puts and deletes, and walked
 * again at most once a minute (a compile subprocess writes into the store itself). The access journal keeps when each
 * build was last served (state/access.json, flushed at most once a minute): the GC evicts the least recently served
 * unpinned build first (gc.ts). state/ is not a key family, so it is never served, listed or collected.
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, linkSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseKeyString, type Family } from './keys.ts';

const FAMILIES: Family[] = ['tiles', 'ctx', 'manifests', 'builds'];
export const GB = 1024 ** 3;

export class StoreFull extends Error {
  status = 507;
  why: 'cap' | 'floor';
  constructor(why: 'cap' | 'floor', message: string) { super(message); this.why = why; }
}

export type Entry = { key: string; bytes: number; mtimeMs: number };
export type Got = { body: Buffer; etag: string; bytes: number };
export type StoreOptions = {
  root: string;
  capBytes: number;
  minFreeBytes: number;
  /** the disk's free bytes (tests pass their own); default statfs of the root */
  freeBytes?: () => number;
  now?: () => number;
  log?: (e: Record<string, unknown>) => void;
  /** the in-memory body cache, bytes (default 64 MB) */
  cacheBytes?: number;
  rescanMs?: number;
};

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

export class TileStore {
  readonly root: string;
  capBytes: number;
  minFreeBytes: number;
  private freeBytesFn: () => number;
  private now: () => number;
  private log: (e: Record<string, unknown>) => void;
  private used = -1;
  private scannedAt = 0;
  private rescanMs: number;
  private cache = new Map<string, Got>();
  private cacheBytes = 0;
  private cacheMax: number;
  private access = new Map<string, number>();
  private accessDirty = false;
  private accessFlushedAt = 0;
  private fullLoggedAt = 0;
  stats = { hits: 0, memoryHits: 0, misses: 0, puts: 0, existed: 0, refused: 0 };

  constructor(o: StoreOptions) {
    this.root = path.resolve(o.root);
    this.capBytes = o.capBytes;
    this.minFreeBytes = o.minFreeBytes;
    this.now = o.now ?? Date.now;
    this.log = o.log ?? ((e) => console.log(JSON.stringify({ hometown: true, ...e })));
    this.cacheMax = o.cacheBytes ?? 64 * 1024 * 1024;
    this.rescanMs = o.rescanMs ?? 60_000;
    this.freeBytesFn = o.freeBytes ?? (() => {
      try { const s = statfsSync(existsSync(this.root) ? this.root : path.dirname(this.root)); return Number(s.bavail) * Number(s.bsize); } catch { return Infinity; }
    });
    try {
      const j = JSON.parse(readFileSync(this.statePath('access.json'), 'utf8'));
      for (const [k, v] of Object.entries(j)) if (typeof v === 'number') this.access.set(k, v);
    } catch { /* no journal yet */ }
  }

  statePath(name: string) { return path.join(this.root, 'state', name); }
  file(key: string) {
    if (!parseKeyString(key)) throw new Error(`bad hometown key ${key.slice(0, 120)}`);
    return path.join(this.root, ...key.split('/'));
  }

  /** Every object (the key families only; temp files left by a killed writer are reported apart, see tmpFiles). */
  list(): Entry[] {
    const out: Entry[] = [];
    const walk = (dir: string, rel: string) => {
      let names: string[];
      try { names = readdirSync(dir); } catch { return; }
      for (const n of names) {
        const p = path.join(dir, n), k = rel ? `${rel}/${n}` : n;
        let s;
        try { s = statSync(p); } catch { continue; }
        if (s.isDirectory()) walk(p, k);
        else if (s.isFile() && !n.includes('.tmp-') && parseKeyString(k)) out.push({ key: k, bytes: s.size, mtimeMs: s.mtimeMs });
      }
    };
    for (const f of FAMILIES) walk(path.join(this.root, f), f);
    return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }

  /** Temp files a killed writer left behind (always safe to remove once they are an hour old). */
  tmpFiles(): Entry[] {
    const out: Entry[] = [];
    const walk = (dir: string, rel: string) => {
      let names: string[];
      try { names = readdirSync(dir); } catch { return; }
      for (const n of names) {
        const p = path.join(dir, n), k = `${rel}/${n}`;
        let s;
        try { s = statSync(p); } catch { continue; }
        if (s.isDirectory()) walk(p, k);
        else if (n.includes('.tmp-')) out.push({ key: k, bytes: s.size, mtimeMs: s.mtimeMs });
      }
    };
    for (const f of FAMILIES) walk(path.join(this.root, f), f);
    return out;
  }

  /** The store's bytes (walked at most once a rescan interval; this process's own writes counted as they happen). */
  usedBytes(force = false): number {
    if (force || this.used < 0 || this.now() - this.scannedAt > this.rescanMs) {
      this.used = this.list().reduce((a, e) => a + e.bytes, 0) + this.tmpFiles().reduce((a, e) => a + e.bytes, 0);
      this.scannedAt = this.now();
    }
    return this.used;
  }

  freeBytes() { return this.freeBytesFn(); }

  usage() {
    const used = this.usedBytes();
    const free = this.freeBytes();
    return { used, cap: this.capBytes, free: Number.isFinite(free) ? free : null, floor: this.minFreeBytes, full: this.fullReason(0), stats: { ...this.stats } };
  }

  /** Why a put of `bytes` would be refused, or null. */
  fullReason(bytes: number): 'cap' | 'floor' | null {
    if (this.usedBytes() + bytes > this.capBytes) return 'cap';
    if (this.freeBytes() - bytes < this.minFreeBytes) return 'floor';
    return null;
  }

  /** The stored bytes and their strong ETag, or null. Counts the build as served (the GC's least-recently-served order). */
  get(key: string): Got | null {
    const p = this.file(key);
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key); this.cache.set(key, hit);
      this.stats.memoryHits++;
      this.touch(key);
      return hit;
    }
    let body: Buffer;
    try { body = readFileSync(p); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') { this.stats.misses++; return null; } throw e; }
    const got = { body, etag: `"${sha(body).slice(0, 40)}"`, bytes: body.length };
    this.stats.hits++;
    this.remember(key, got);
    this.touch(key);
    return got;
  }

  has(key: string) { return existsSync(this.file(key)); }

  private remember(key: string, got: Got) {
    if (got.bytes > this.cacheMax / 8) return;
    this.cache.set(key, got);
    this.cacheBytes += got.bytes;
    while (this.cacheBytes > this.cacheMax) {
      const [k, v] = this.cache.entries().next().value as [string, Got];
      this.cache.delete(k);
      this.cacheBytes -= v.bytes;
    }
  }

  /**
   * Store bytes under a key, once: { created: false } when the key exists (its bytes are kept, whatever these are).
   * Throws StoreFull (507) when the cap or the free-space floor would be passed.
   */
  put(key: string, body: Uint8Array): { created: boolean } {
    const p = this.file(key);
    if (existsSync(p)) { this.stats.existed++; return { created: false }; }
    const why = this.fullReason(body.length);
    if (why) {
      this.stats.refused++;
      if (this.now() - this.fullLoggedAt > 60_000) {
        this.fullLoggedAt = this.now();
        this.log({ event: 'disk-full', why, used: this.usedBytes(), cap: this.capBytes, free: this.freeBytes(), floor: this.minFreeBytes });
      }
      throw new StoreFull(why, why === 'cap'
        ? `the hometown store is at its cap (${(this.capBytes / GB).toFixed(2)} GB, HOMETOWN_DISK_CAP_GB)`
        : `the disk is below its free-space floor (${(this.minFreeBytes / GB).toFixed(2)} GB, HOMETOWN_FREE_FLOOR_GB)`);
    }
    mkdirSync(path.dirname(p), { recursive: true });
    const tmp = `${p}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
    writeFileSync(tmp, body);
    try {
      try { linkSync(tmp, p); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') { this.stats.existed++; return { created: false }; } throw e; }
    } finally {
      rmSync(tmp, { force: true });
    }
    this.stats.puts++;
    if (this.used >= 0) this.used += body.length;
    return { created: true };
  }

  /** GC and operator repair only (gc.ts): objects are otherwise never removed. */
  delete(key: string): number {
    const p = this.file(key);
    let n = 0;
    try { n = statSync(p).size; } catch { return 0; }
    rmSync(p, { force: true });
    const c = this.cache.get(key);
    if (c) { this.cache.delete(key); this.cacheBytes -= c.bytes; }
    if (this.used >= 0) this.used = Math.max(0, this.used - n);
    return n;
  }

  removeTmp(rel: string) {
    if (!/\.tmp-/.test(rel) || rel.split('/').some((s) => s === '..' || s === '')) return 0;
    const p = path.join(this.root, ...rel.split('/'));
    let n = 0;
    try { n = statSync(p).size; } catch { return 0; }
    rmSync(p, { force: true });
    if (this.used >= 0) this.used = Math.max(0, this.used - n);
    return n;
  }

  /** When each build was last served (ms), from the journal and this process. */
  lastServed(): Map<string, number> { return new Map(this.access); }

  private touch(key: string) {
    const b = key.split('/')[1]?.replace(/\.json$/, '');
    if (!b) return;
    const t = this.now();
    // (day resolution is plenty for least-recently-served, and keeps the journal quiet)
    if ((this.access.get(b) ?? 0) < t - 3600_000) { this.access.set(b, t); this.accessDirty = true; }
    if (this.accessDirty && t - this.accessFlushedAt > 60_000) this.flushAccess();
  }

  flushAccess() {
    if (!this.accessDirty) return;
    try {
      mkdirSync(path.dirname(this.statePath('access.json')), { recursive: true });
      const tmp = this.statePath(`access.json.${process.pid}`);
      writeFileSync(tmp, JSON.stringify(Object.fromEntries([...this.access].sort())));
      renameSync(tmp, this.statePath('access.json'));
      this.accessDirty = false;
      this.accessFlushedAt = this.now();
    } catch { /* a full disk: try again next time */ }
  }

  describe() { return `disk:${this.root} cap ${(this.capBytes / GB).toFixed(2)} GB, floor ${(this.minFreeBytes / GB).toFixed(2)} GB`; }
}
