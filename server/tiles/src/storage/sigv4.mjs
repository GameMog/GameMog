import crypto from 'node:crypto';

// AWS Signature Version 4 for S3-compatible stores (AWS S3, Cloudflare R2, MinIO). Pure: no clock, no I/O.
const hmac = (key, s) => crypto.createHmac('sha256', key).update(s).digest();
const hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const EMPTY_SHA256 = hex('');

// RFC 3986 encoding of one path segment (S3 encodes each segment once and keeps '/').
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function amzDate(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }

// headers: plain object of the headers to sign (host must be included). Returns the Authorization header value and
// the intermediate strings (for tests).
export function signV4({ method, url, headers, payloadHash, accessKeyId, secretAccessKey, region, service = 's3', now }) {
  const u = new URL(url);
  const date = headers['x-amz-date'] || amzDate(now);
  const day = date.slice(0, 8);
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')]));
  const names = Object.keys(lower).sort();
  const canonicalHeaders = names.map((k) => `${k}:${lower[k]}\n`).join('');
  const signedHeaders = names.join(';');
  const path = u.pathname.split('/').map((s) => enc(decodeURIComponent(s))).join('/') || '/';
  const query = [...u.searchParams].map(([k, v]) => [enc(k), enc(v)]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&');
  const canonicalRequest = [method, path, query, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${day}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', date, scope, hex(canonicalRequest)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), service), 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    signature, canonicalRequest, stringToSign, signedHeaders, date,
  };
}
