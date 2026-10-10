import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompress, gzip, constants as Z } from 'node:zlib';
import { promisify } from 'node:util';
import { db, type GameRow } from './db';
import { renderGame } from './engine/shell';
import { renderCustomGame, renderWorldGame } from './custom-game';
import { withKartScore } from './kart-play';
import type { WorldSpec } from './worldspec';

/**
 * A game's play document (/g/<slug>/play), assembled once and kept (10 Oct, the owner: "let everyone play").
 *
 * Every press of Play used to assemble its 1 to 2.5 MB page again: the runtime, the kart kit, the maps and the world,
 * joined per request on a half-CPU server. The page is a function of the game's row alone (and of this release's
 * runtime files, fixed for the life of a production server), so it is assembled once per version, compressed once
 * (brotli and gzip, off the main thread) and served from memory after that. The bytes are exactly what the route
 * served before; scripts/play-scale-check.ts holds every world and every game to that.
 *
 * Its version, `v`, is the hash of those bytes: the game page asks for /g/<slug>/play?v=<v> (playSrc), so an edge
 * cache can keep that address for as long as it likes (it can only ever hold the bytes it names), and a changed world
 * is a new address at once.
 */

/** What a play document is assembled from: everything the assembly reads from the game's row. */
export type PlaySource = Pick<GameRow, 'id' | 'format' | 'code' | 'meta' | 'spec'>;

/** The play document exactly as the play route has always assembled it. */
export function renderPlayHtml(game: PlaySource): string {
  const custom = (game.format === 'custom' || game.format === 'world') && game.code;
  const meta = JSON.parse(game.meta ?? '{}');
  return !custom
    ? renderGame(JSON.parse(game.spec) as WorldSpec, game.id)
    : game.format === 'world'
      ? renderWorldGame(game.code!, withKartScore(game.code!, meta), game.id, meta.runtime ?? 1)
      : renderCustomGame(game.code!, meta, game.id);
}

export type PlayPage = {
  /** The version: the first 16 hex of the sha256 of the bytes. */
  v: string;
  /** A weak ETag on the version (weak: the same page goes out in three encodings). */
  etag: string;
  /** The page, utf-8. */
  body: Buffer;
  /** The same bytes compressed, once ready (a few hundred ms after the first assembly). */
  br?: Buffer;
  gz?: Buffer;
};

type Entry = PlayPage & { key: string; size: number };
type Cache = { map: Map<string, Entry>; bytes: number; hits: number; misses: number; evicted: number; queue: Entry[]; compressing: boolean };

// (on globalThis: Next can load this module more than once, per route and again after a change in development, and
// every copy must share the one cache; a stale copy's entries carry keys nobody asks for and age out)
const G = globalThis as unknown as { __gamemogPlayCache?: Cache };
const cache: Cache = G.__gamemogPlayCache ??= { map: new Map(), bytes: 0, hits: 0, misses: 0, evicted: 0, queue: [], compressing: false };
// (a development server keeps its cache across edits to this file: one made before a field was added gets it)
cache.queue ??= []; cache.compressing ??= false;

const br = promisify(brotliCompress), gz = promisify(gzip);

/** The cap on what the kept pages take, compressed copies included: 120 MB of the 512 MB server (PLAY_CACHE_MB). */
const capBytes = () => Math.max(0, Number(process.env.PLAY_CACHE_MB ?? 120)) * 1024 * 1024;

// (what the assembly reads: lib/custom-game.ts and what it imports, the race engine's shell and files, the runtime)
const DEV_LIB = ['custom-game', 'kart-play', 'kart-score', 'mog-dna', 'look', 'world-options', 'worldspec', 'course', 'rig', 'engine/shell', 'engine/body'];
/**
 * In development the runtime's files and the code that assembles the page are read again on every assembly, so a
 * page kept from before an edit would be stale: the key carries the time each of them last changed. In production
 * they are read once and fixed for the life of the server, and a deploy starts a new one, so the stamp is empty.
 */
function devStamp() {
  if (process.env.NODE_ENV === 'production') return '';
  const root = process.cwd(), h = createHash('sha1');
  const stamp = (p: string) => { try { const s = statSync(p); h.update(`${p}:${s.mtimeMs}:${s.size};`); } catch { /* not there */ } };
  const walk = (dir: string, deep: boolean) => {
    let names: string[] = [];
    try { names = readdirSync(dir, { withFileTypes: true }).map((d) => (d.isDirectory() ? `${d.name}/` : d.name)); } catch { return; }
    for (const n of names.sort()) {
      if (n.endsWith('/')) { if (deep) walk(join(dir, n), false); }
      else if (n.endsWith('.js') || n.endsWith('.css')) stamp(join(dir, n));
    }
  };
  walk(join(root, 'lib', 'runtime'), true);
  walk(join(root, 'public', 'engine'), false);
  for (const f of DEV_LIB) stamp(join(root, 'lib', `${f}.ts`));
  return h.digest('hex');
}

function keyOf(game: PlaySource) {
  const h = createHash('sha1');
  for (const part of [game.id, game.format, game.code ?? '\0', game.meta ?? '\0', game.spec ?? '\0', devStamp()]) h.update(`${part.length}:`).update(part);
  return h.digest('hex');
}

function evict() {
  const cap = capBytes();
  for (const [k, e] of cache.map) {
    if (cache.bytes <= cap) break;
    cache.map.delete(k); cache.bytes -= e.size; cache.evicted++;
  }
}

/**
 * The compressed copies, made one page at a time on a worker thread: a fresh server asked for every world at once
 * would otherwise open an encoder per page together, each with megabytes of its own (45 pages at once took a
 * production-mode server from 117 MB to 790 MB on the Mac, 10 Oct). Until a page's turn it goes out as it is.
 */
function compress(e: Entry) {
  cache.queue.push(e);
  if (!cache.compressing) void drain();
}
async function drain() {
  cache.compressing = true;
  try {
    for (let e = cache.queue.shift(); e; e = cache.queue.shift()) {
      // (a page evicted while it waited is not worth the work)
      if (cache.map.get(e.key) !== e) continue;
      try {
        e.br = await br(e.body, { params: { [Z.BROTLI_PARAM_MODE]: Z.BROTLI_MODE_TEXT, [Z.BROTLI_PARAM_QUALITY]: 9, [Z.BROTLI_PARAM_SIZE_HINT]: e.body.length } });
        e.gz = await gz(e.body, { level: 9 });
      } catch { /* it goes out as it is */ }
      if (cache.map.get(e.key) !== e) continue;
      const size = e.body.length + (e.br?.length ?? 0) + (e.gz?.length ?? 0);
      cache.bytes += size - e.size; e.size = size;
      evict();
    }
  } finally { cache.compressing = false; }
}

/** The play document for a game: from memory when its version is kept, else assembled now (and kept). */
export function playPage(game: PlaySource): PlayPage {
  const key = keyOf(game);
  const hit = cache.map.get(key);
  if (hit) {
    // most recently used last: eviction takes the oldest first
    cache.map.delete(key); cache.map.set(key, hit); cache.hits++;
    return hit;
  }
  cache.misses++;
  const body = Buffer.from(renderPlayHtml(game), 'utf8');
  const v = createHash('sha256').update(body).digest('hex').slice(0, 16);
  const e: Entry = { key, v, etag: `W/"${v}"`, body, size: body.length };
  if (body.length <= capBytes()) {
    cache.map.set(key, e); cache.bytes += e.size;
    evict();
    compress(e);
  }
  return e;
}

/** The address the game page gives its play frame: the play document at its version. */
export const playSrc = (game: PlaySource & Pick<GameRow, 'slug'>) => `/g/${game.slug}/play?v=${playPage(game).v}`;

/** How the cache stands, for the checks and the measurements. */
export const playCacheStats = () => ({ entries: cache.map.size, bytes: cache.bytes, cap: capBytes(), hits: cache.hits, misses: cache.misses, evicted: cache.evicted });

/** Empties the cache (the checks). */
export function clearPlayCache() { cache.map.clear(); cache.queue.length = 0; cache.bytes = 0; cache.hits = cache.misses = cache.evicted = 0; }

/**
 * A play is someone opening a game's page, which loads its play frame. It was counted where the frame's document was
 * served, and a document served from memory, a browser's cache or an edge counts nothing there, so since 10 Oct it is
 * counted from the page's own view beacon (app/beacon.tsx, app/api/hit/route.ts): one per load of /g/<slug>, from a
 * browser that is not automated, not a bot and not the owner. A preview (?preview=1: the /me start line, films, key
 * art) sends no beacon and is not a play. A game nobody can open (taken down, not unlisted) is not counted.
 */
const PLAY_PATH = /^\/g\/([a-z0-9-]{1,80})$/;
export function countPagePlay(path: string) {
  const slug = PLAY_PATH.exec(path)?.[1];
  if (!slug) return false;
  return db.prepare("UPDATE games SET plays = plays + 1 WHERE slug = ? AND (hidden = 0 OR json_extract(meta, '$.unlisted') = 1)").run(slug).changes > 0;
}
