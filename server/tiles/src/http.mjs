// HTTP front for the tile service, on node:http only (no framework).
//   GET|HEAD /tiles/{compilerVersion}/{z}/{x}/{y}            the tile (immutable)
//   GET|HEAD /places/{placeId}/manifest[?version=v]          the place's tile set (immutable when ?version= is given)
//   GET|HEAD /places/{placeId}/lock[?version=v]              a city lock record for that place + version
//   GET|HEAD /locks/{placeId}/{compilerVersion}/{tileSetHash} the manifest a lock names; 409 if it does not match
//   GET      /healthz                                       service stats
import http from 'node:http';
import { HttpError } from './keys.mjs';
import { decode, stableJson } from './util.mjs';

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

export function createHttpHandler(service, { log = () => {} } = {}) {
  const decodedCache = new Map(); // small: identity copies of stored-compressed bodies, for clients that accept neither

  function representation(entry, req) {
    const enc = entry.meta.contentEncoding || 'identity';
    const tag = entry.meta.hash.slice(0, 40);
    const acc = acceptedEncodings(req.headers['accept-encoding']);
    if (enc === 'identity' || accepts(acc, enc)) return { body: entry.body, encoding: enc, etag: `"${tag}"` };
    // The client cannot take the stored encoding: decode once, keep a bounded number of decoded copies.
    let body = decodedCache.get(entry.meta.hash);
    if (!body) {
      body = decode(entry.body, enc);
      if (decodedCache.size > 256) decodedCache.delete(decodedCache.keys().next().value);
      decodedCache.set(entry.meta.hash, body);
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

  return async function handle(req, res) {
    const t0 = process.hrtime.bigint();
    let status = 500;
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'GET or HEAD only');
      const url = new URL(req.url, 'http://tiles.local');
      const p = url.pathname.split('/').slice(1).map(decodeURIComponent);
      const version = url.searchParams.get('version') || undefined;
      if (p[0] === 'tiles' && p.length === 5) {
        const e = await service.getTile(p[1], p[2], p[3], p[4]);
        send(req, res, e);
      } else if (p[0] === 'places' && p.length === 3 && p[2] === 'manifest') {
        const e = await service.getManifest(p[1], version);
        send(req, res, e, { cache: version ? IMMUTABLE : SHORT });
      } else if (p[0] === 'places' && p.length === 3 && p[2] === 'lock') {
        sendJson(req, res, 200, await service.createLock(p[1], version), version ? IMMUTABLE : SHORT);
      } else if (p[0] === 'locks' && p.length === 4) {
        const e = await service.resolveLock({ placeId: p[1], compilerVersion: p[2], tileSetHash: p[3] });
        send(req, res, e);
      } else if (p[0] === 'healthz' && p.length === 1) {
        const { stats, lru, flight } = service;
        sendJson(req, res, 200, { ok: true, currentVersion: service.currentVersion || null, versions: [...service.compilers.keys()], store: service.store.describe(), stats, lru: { entries: lru.size, bytes: lru.bytes, hits: lru.hits, misses: lru.misses, evictions: lru.evictions }, inflight: flight.size });
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
  };
}

export function createServer(service, opts) {
  const server = http.createServer(createHttpHandler(service, opts));
  server.keepAliveTimeout = 5000;
  return server;
}
