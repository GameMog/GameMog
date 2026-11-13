// A local S3-compatible mock for tests: path-style PUT / GET / DELETE on /{bucket}/{key}, If-None-Match: * conditional
// PUT (412 when the key exists), x-amz-meta-* kept, and every request's SigV4 signature recomputed and checked.
// It never talks to a real bucket.
import http from 'node:http';
import crypto from 'node:crypto';
import { signV4 } from '../src/storage/sigv4.mjs';

export function startMockS3({ port, bucket = 'tiles', accessKeyId = 'TESTKEYID', secretAccessKey = 'test-secret-not-a-real-key', region = 'auto' }) {
  const objects = new Map();
  const log = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url, `http://${req.headers.host}`);
      const entry = { method: req.method, path: url.pathname, status: 0 };
      log.push(entry);
      const fail = (status, msg) => { entry.status = status; res.writeHead(status, { 'content-type': 'application/xml' }); res.end(`<Error><Code>${msg}</Code></Error>`); };
      const auth = req.headers.authorization || '';
      const m = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/[^,]+, SignedHeaders=([^,]+), Signature=([0-9a-f]{64})$/.exec(auth);
      if (!m || m[1] !== accessKeyId) return fail(403, 'InvalidAccessKeyId');
      const signed = Object.fromEntries(m[2].split(';').map((h) => [h, req.headers[h]]));
      const payloadHash = req.headers['x-amz-content-sha256'];
      if (payloadHash !== crypto.createHash('sha256').update(body).digest('hex')) return fail(400, 'XAmzContentSHA256Mismatch');
      const { signature } = signV4({ method: req.method, url: url.href, headers: signed, payloadHash, accessKeyId, secretAccessKey, region });
      if (signature !== m[3]) return fail(403, 'SignatureDoesNotMatch');
      const [, b, ...rest] = url.pathname.split('/');
      if (b !== bucket) return fail(404, 'NoSuchBucket');
      const key = rest.join('/');
      if (req.method === 'PUT') {
        if (req.headers['if-none-match'] === '*' && objects.has(key)) return fail(412, 'PreconditionFailed');
        const meta = Object.fromEntries(Object.entries(req.headers).filter(([h]) => h.startsWith('x-amz-meta-')));
        objects.set(key, { body, meta, contentType: req.headers['content-type'] });
        entry.status = 200;
        res.writeHead(200, { etag: `"${crypto.createHash('md5').update(body).digest('hex')}"` });
        return res.end();
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        const o = objects.get(key);
        if (!o) return fail(404, 'NoSuchKey');
        entry.status = 200;
        res.writeHead(200, { 'content-type': o.contentType || 'application/octet-stream', 'content-length': o.body.length, ...o.meta });
        return res.end(req.method === 'HEAD' ? undefined : o.body);
      }
      if (req.method === 'DELETE') { objects.delete(key); entry.status = 204; res.writeHead(204); return res.end(); }
      return fail(405, 'MethodNotAllowed');
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({
    endpoint: `http://127.0.0.1:${port}`, bucket, accessKeyId, secretAccessKey, region, objects, log,
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }),
  })));
}
