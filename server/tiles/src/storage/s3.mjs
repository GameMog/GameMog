import { checkKey, verify } from './base.mjs';
import { signV4, amzDate } from './sigv4.mjs';
import { sha256 } from '../util.mjs';

// S3 / R2 compatible backend over fetch + SigV4, path-style URLs ({endpoint}/{bucket}/{prefix}{key}).
//   R2:    endpoint https://<account>.r2.cloudflarestorage.com, region 'auto'
//   MinIO: endpoint http://localhost:9000, region 'us-east-1'
// Credentials are passed in by the caller (bin/ reads TILES_S3_* environment variables); nothing here reads files.
// Immutability: put(ifAbsent) sends If-None-Match: * (conditional write, supported by S3 and R2); 412 = already there.
// The tile's own encoding is kept in object metadata, NOT as the object's Content-Encoding: fetch() transparently
// decompresses a response that carries Content-Encoding, which would break byte-exact passthrough and the hash check.
const META_HEADER = 'x-amz-meta-tilemeta';

export class S3Store {
  constructor({ endpoint, bucket, region = 'auto', accessKeyId, secretAccessKey, prefix = '', fetch: f = globalThis.fetch, now = () => new Date() }) {
    if (!endpoint || !bucket) throw new Error('S3Store needs endpoint and bucket');
    if (!accessKeyId || !secretAccessKey) throw new Error('S3Store needs credentials');
    this.endpoint = endpoint.replace(/\/+$/, '');
    Object.assign(this, { bucket, region, accessKeyId, secretAccessKey, prefix, fetch: f, now });
  }
  url(key) { return `${this.endpoint}/${this.bucket}/${this.prefix}${checkKey(key)}`; }
  async request(method, key, { body, headers = {} } = {}) {
    const url = this.url(key);
    const payloadHash = sha256(body || Buffer.alloc(0));
    const h = { ...headers, host: new URL(url).host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate(this.now()) };
    const { authorization } = signV4({ method, url, headers: h, payloadHash, accessKeyId: this.accessKeyId, secretAccessKey: this.secretAccessKey, region: this.region });
    const { host, ...send } = h; // fetch sets Host itself (it is a forbidden request header)
    return this.fetch(url, { method, body, headers: { ...send, authorization, 'accept-encoding': 'identity' } });
  }
  async get(key) {
    const r = await this.request('GET', key);
    if (r.status === 404) { await r.arrayBuffer().catch(() => {}); return null; }
    if (!r.ok) throw new Error(`S3 GET ${key}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const body = Buffer.from(await r.arrayBuffer());
    const raw = r.headers.get(META_HEADER);
    const meta = raw ? JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) : {};
    return verify(key, body, meta);
  }
  async put(key, body, meta, { ifAbsent = true } = {}) {
    const headers = { 'content-type': 'application/octet-stream', [META_HEADER]: Buffer.from(JSON.stringify(meta)).toString('base64url') };
    if (ifAbsent) headers['if-none-match'] = '*';
    const r = await this.request('PUT', key, { body, headers });
    await r.arrayBuffer().catch(() => {});
    if (r.status === 412 || r.status === 409) return { created: false };
    if (!r.ok) throw new Error(`S3 PUT ${key}: ${r.status}`);
    return { created: true };
  }
  async delete(key) {
    const r = await this.request('DELETE', key);
    await r.arrayBuffer().catch(() => {});
    if (!r.ok && r.status !== 404) throw new Error(`S3 DELETE ${key}: ${r.status}`);
  }
  describe() { return `s3:${this.endpoint}/${this.bucket}/${this.prefix}`; }
}
