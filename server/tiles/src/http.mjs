// HTTP front for the tile service (the national grid hg1), on node:http only (no framework).
//   GET|HEAD /tiles/{buildId}/hg1-{domain}/0/{c}/{r}                 the tile (immutable)
//   GET|HEAD /manifests/{buildId}/{placeId}                          the place's descriptor + tile set in that build
//   GET|HEAD /places/{placeId}/manifest[?version=buildId]            the same, the current build by default
//   GET|HEAD /places/{placeId}/lock[?version=buildId]                a lock v2 for that place + build
//   GET|HEAD /locks/{placeId}/{buildId}/{tileSetHash}                the manifest a lock names; 409 if it does not match
//   GET|HEAD /locks/{placeId}/{buildId}/{tileSetHash}/tiles/hg1-{domain}/0/{c}/{r}
//                                                                    a tile of that locked set (checked against its
//                                                                    manifest; 409 drifted, 410 lost + build gone); a tile
//                                                                    outside the set: served unlocked at the same build
//   GET      /ctx/{buildId}/hg1-{domain}/4/{C}/{R}                   a context block: local or admin only
//   GET      /admin/verify/{placeId}/{buildId}/{tileSetHash}         verifyLock (re-hash + repair every tile): local or
//                                                                    Authorization: Bearer <adminToken> only, else 403
//   GET      /healthz                                                ok + counts; store and builds to local/admin only
// 400 a bad build id, domain, level or key (negative, not decimal, out of the domain's bounds); 410 a tile of an
// unregistered build that is not stored; 422 a tile the compiler refused (no DEM: the reason in the body).
import http from 'node:http';
import crypto from 'node:crypto';
import { HttpError } from './keys.mjs';
import { decode, stableJson } from './util.mjs';
import { LRU } from './lru.mjs';

const IMMUTABLE = 'public, max-age=31536000, immutable';
const SHORT = 'public, max-age=300';

// q-values per coding from an Accept-Encoding header.
export function acceptedEncodings(header) {
  const out = new Map();
  for (const part of String(header || '').split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    if (!name) continue;
    let q = 1;
    for (const p of params) { const m = /^\s*q=([0-9.]+)\s*$/.exec(p); if (m) q = Number(m[1]); }
    out.set(name, q);
  }
  return out;
}

export function accepts(map, enc) {
  if (enc === 'identity') return map.get('identity') !== 0;
  if (map.has(enc)) return map.get(enc) > 0;
  return (map.get('*') || 0) > 0;
}

function etagMatches(header, etag) {
  if (!header) return false;
  if (header.trim() === '*') return true;
  return header.split(',').map((s) => s.trim().replace(/^W\//, '')).includes(etag);
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const FORWARDED = ['forwarded', 'x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip'];

// A request straight from this machine. Anything carrying a forwarding header came through a proxy, which itself
// connects from loopback, so it is NOT local.
export function isLocalRequest(req) {
  return LOOPBACK.has(req.socket?.remoteAddress) && !FORWARDED.some((h) => h in req.headers);
}

function bearerMatches(req, token) {
  if (!token) return false;
  const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ''));
  if (!m) return false;
  const h = (s) => crypto.createHash('sha256').update(s).digest();
  return crypto.timingSafeEqual(h(m[1]), h(token));
}

// adminToken: the bearer token for /admin/* from outside this machine (bin/serve.mjs reads TILES_ADMIN_TOKEN);
// without one, admin routes are local-only. decodedCacheBytes caps the decoded-copy cache by total bytes.
export function createHttpHandler(service, { log = () => {}, adminToken, decodedCacheBytes = 32 * 1024 * 1024 } = {}) {
  // identity copies of stored-compressed bodies, for clients that accept neither; bounded by BYTES (a tile can decode
  // to many MB, so an entry-count cap alone does not bound memory)
  const decodedCache = new LRU({ maxBytes: decodedCacheBytes, maxEntries: 256 });
  const isAdmin = (req) => isLocalRequest(req) || bearerMatches(req, adminToken);

  function representation(entry, req) {
    const enc = entry.meta.contentEncoding || 'identity';
    const tag = entry.meta.hash.slice(0, 40);
    const acc = acceptedEncodings(req.headers['accept-encoding']);
    if (enc === 'identity' || accepts(acc, enc)) return { body: entry.body, encoding: enc, etag: `"${tag}"` };
    // The client cannot take the stored encoding: decode once, keep a bounded number of decoded copies.
    let body = decodedCache.get(entry.meta.hash);
    if (!body) {
      body = decode(entry.body, enc);
      decodedCache.set(entry.meta.hash, body, body.length);
    }
    return { body, encoding: 'identity', etag: `"${tag}.identity"` };
  }

  function send(req, res, entry, { cache = IMMUTABLE, extra = {} } = {}) {
    const rep = representation(entry, req);
    const headers = {
      'content-type': entry.meta.contentType || 'application/octet-stream',
      'cache-control': cache, etag: rep.etag, vary: 'Accept-Encoding',
      'x-content-sha256': entry.meta.contentHash, 'x-tile-source': entry.source || 'memory', ...extra,
    };
    if (rep.encoding !== 'identity') headers['content-encoding'] = rep.encoding;
    if (etagMatches(req.headers['if-none-match'], rep.etag)) { res.writeHead(304, headers); return res.end(); }
    headers['content-length'] = rep.body.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : rep.body);
  }

  function sendJson(req, res, status, value, cache = 'no-store') {
    const body = Buffer.from(stableJson(value));
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': body.length, 'cache-control': cache });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  async function handle(req, res) {
    const t0 = process.hrtime.bigint();
    let status = 500;
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'GET or HEAD only');
      const url = new URL(req.url, 'http://tiles.local');
      const p = url.pathname.split('/').slice(1).map(decodeURIComponent);
      const version = url.searchParams.get('version') || undefined;
      const urlLock = (q) => ({ place: q[1], buildId: q[2], tiles: q[3] });
      if (p[0] === 'tiles' && p.length === 6) {
        send(req, res, await service.getTile(p[1], p[2], p[3], p[4], p[5]));
      } else if (p[0] === 'manifests' && p.length === 3) {
        send(req, res, await service.getManifest(p[2], p[1]));
      } else if (p[0] === 'places' && p.length === 3 && p[2] === 'manifest') {
        const e = await service.getManifest(p[1], version);
        send(req, res, e, { cache: version ? IMMUTABLE : SHORT });
      } else if (p[0] === 'places' && p.length === 3 && p[2] === 'lock') {
        sendJson(req, res, 200, await service.createLock(p[1], version), version ? IMMUTABLE : SHORT);
      } else if (p[0] === 'locks' && p.length === 4) {
        send(req, res, await service.resolveLock(urlLock(p)));
      } else if (p[0] === 'locks' && p.length === 9 && p[4] === 'tiles') {
        const e = await service.getLockedTile(urlLock(p), p[5], p[6], p[7], p[8]);
        send(req, res, e, { extra: e.unlocked ? { 'x-tile-lock': 'outside the locked set (unlocked)' } : {} });
      } else if (p[0] === 'ctx' && p.length === 6) {
        if (!isAdmin(req)) throw new HttpError(403, 'context blocks: local requests, or Authorization: Bearer <TILES_ADMIN_TOKEN>');
        send(req, res, await service.getCtx(p[1], p[2], p[3], p[4], p[5]));
      } else if (p[0] === 'admin') {
        if (!isAdmin(req)) throw new HttpError(403, 'admin route: local requests, or Authorization: Bearer <TILES_ADMIN_TOKEN>');
        if (p[1] === 'verify' && p.length === 5) {
          sendJson(req, res, 200, await service.verifyLock({ place: p[2], buildId: p[3], tiles: p[4] }));
        } else throw new HttpError(404, 'not found');
      } else if (p[0] === 'healthz' && p.length === 1) {
        const { stats, lru, flight } = service;
        const counts = { ok: true, grid: 'hg1', currentVersion: service.currentVersion || null, stats, lru: { entries: lru.size, bytes: lru.bytes, hits: lru.hits, misses: lru.misses, evictions: lru.evictions }, inflight: flight.size };
        // The store's endpoint/bucket and the compiler list are deployment details: only for this machine or an admin.
        if (isAdmin(req)) Object.assign(counts, { versions: [...service.compilers.keys()], store: service.store.describe(), decodedCache: { entries: decodedCache.size, bytes: decodedCache.bytes } });
        sendJson(req, res, 200, counts);
      } else {
        throw new HttpError(404, 'not found');
      }
      status = res.statusCode;
    } catch (e) {
      status = e instanceof HttpError ? e.status : e instanceof URIError ? 400 : 500;
      if (status === 500) log({ event: 'error', url: req.url, error: e.stack || String(e) });
      if (!res.headersSent) sendJson(req, res, status, { error: status === 500 ? 'internal error' : e.message });
      else res.destroy();
    } finally {
      log({ event: 'request', method: req.method, url: req.url, status, ms: Number(process.hrtime.bigint() - t0) / 1e6 });
    }
  }
  handle.decodedCache = decodedCache;
  return handle;
}

export function createServer(service, opts) {
  const server = http.createServer(createHttpHandler(service, opts));
  server.keepAliveTimeout = 5000;
  return server;
}
