// Mog City: the gallery's art slots can show a real on-chain work, by chain + contract + token id, fetched at runtime
// in the player's browser from its own public metadata and image (an IPFS gateway, the token's own URL). Nothing is
// copied into the repo, nothing is cached or proxied on our servers, and each piece carries its credit line.
// SHIPPED OFF: TOKENS is empty and ENABLED is false. Every slot shows Mog City's original art.
//
// Parts of this file are adapted from oncyber (https://github.com/oncyberio/oncyber), MIT License:
//   Copyright (c) 2021-2026 Oncyber
//   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
//   documentation files (the "Software"), to deal in the Software without restriction, including without limitation
//   the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
//   permit persons to whom the Software is furnished to do so, subject to the following conditions:
//   The above copyright notice and this permission notice shall be included in all copies or substantial portions of
//   the Software.
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
//   THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
//   TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
//   SOFTWARE.
// What is adapted: ipfsCID / ipfsToHttp / the gateway list (frontend/utils/urlUtils.ts: isIPFS, ipfsCID,
// ipfsHttpCID, IPFS.gateway), widened to the ipfs://ipfs/ form and to dweb.link, without oncyber's own pinned gateways.
//
// How a slot is filled (no API key anywhere):
//   1. the token's metadata URI: the entry's own `uri` if given (read once from a block explorer by hand), otherwise
//      read from the chain with one eth_call to a public, key-free JSON-RPC endpoint (RPC below, per chain):
//      ERC-721 tokenURI(uint256) (0xc87b56dd), or ERC-1155 uri(uint256) (0x0e89341c, its {id} filled in as 64 hex)
//   2. the metadata JSON fetched (data: URIs decoded in place), its `image` (or `image_url`) taken
//   3. the image loaded with crossOrigin 'anonymous' (each gateway in turn, for an IPFS one) into the slot's frame
//      (frame.js setImage, which scales it down in memory to MAX_SIDE on its long side: a 2k-8k original would be
//      64-256 MB of texture on a phone): only in memory. An `image` that is not a still picture (a video, a web page,
//      a model: by its extension or data: type) is skipped
//   Any failure leaves the slot on its original art (and its frame's cartouche, the clue's mark, stays: frame.js). A gateway or endpoint that refuses CORS cannot be used from a
//   browser; then the entry needs `uri` and `image` given directly, or a CORS-friendly gateway.
//
//   TOKENS: [{ slot: 'p1' | 'p2' | 'p3' | 'hall', chain: 'ethereum', contract: '0x...', tokenId: '123',
//              standard: '721' | '1155', uri?: 'ipfs://...', image?: 'ipfs://...', credit: 'Title, Artist, year. Courtesy
//              of its owner.' }]

export const ENABLED = false;
export const TOKENS = [];
export const RPC = {
  // (public endpoints that answer without a key, as of Nov 2026; any other may be put here)
  ethereum: 'https://ethereum-rpc.publicnode.com',
  polygon: 'https://polygon-bor-rpc.publicnode.com',
  base: 'https://base-rpc.publicnode.com',
};
export const GATEWAYS = ['https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/'];

const IPFS_PREFIX = 'ipfs://';
// the CID (and path) of an ipfs:// URI or a gateway URL, or null (oncyber ipfsCID / ipfsHttpCID)
export function ipfsCID(url) {
  if (typeof url !== 'string') return null;
  if (url.startsWith(IPFS_PREFIX)) return url.slice(IPFS_PREFIX.length).replace(/^ipfs\//, '');
  const m = url.match(/^https?:\/\/[^/]+\/ipfs\/(.+)$/);
  return m ? m[1] : null;
}
// an http(s) URL for a token URI: an IPFS one through a gateway (oncyber ipfsToHttp), ar:// through arweave.net
export function toHttp(url, gateway = 0) {
  const cid = ipfsCID(url);
  if (cid) return GATEWAYS[gateway % GATEWAYS.length] + cid;
  if (typeof url === 'string' && url.startsWith('ar://')) return 'https://arweave.net/' + url.slice(5);
  return url;
}
// the eth_call data for a token's metadata URI
export function callData(tokenId, standard = '721') {
  const sel = standard === '1155' ? '0e89341c' : 'c87b56dd';
  return '0x' + sel + BigInt(tokenId).toString(16).padStart(64, '0');
}
// an ABI-encoded string (the eth_call's result) as text
export function decodeString(hex) {
  const h = hex.replace(/^0x/, '');
  if (h.length < 128) throw new Error('short result');
  const off = parseInt(h.slice(0, 64), 16) * 2, len = parseInt(h.slice(off, off + 64), 16);
  const body = h.slice(off + 64, off + 64 + len * 2), bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = parseInt(body.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(bytes);
}
// ERC-1155's {id}: the token id as 64 lowercase hex digits
export const fillId = (uri, tokenId) => uri.replace(/\{id\}/g, BigInt(tokenId).toString(16).padStart(64, '0'));

async function readJSON(url, fetchFn) {
  if (url.startsWith('data:')) {
    const [head, body] = url.split(',', 2);
    return JSON.parse(head.includes(';base64') ? atob(body) : decodeURIComponent(body));
  }
  let err;
  for (let g = 0; g < GATEWAYS.length; g++) {
    try { const r = await fetchFn(toHttp(url, g), { credentials: 'omit', referrerPolicy: 'no-referrer' }); if (r.ok) return await r.json(); err = new Error('HTTP ' + r.status); } catch (e) { err = e; }
    if (!ipfsCID(url)) break;
  }
  throw err;
}
// the token's metadata URI (from the entry, or from the chain)
export async function tokenURI(t, fetchFn = fetch) {
  if (t.uri) return t.standard === '1155' ? fillId(t.uri, t.tokenId) : t.uri;
  const rpc = RPC[t.chain]; if (!rpc) throw new Error('no key-free endpoint for ' + t.chain);
  const r = await fetchFn(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer',
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: t.contract, data: callData(t.tokenId, t.standard) }, 'latest'] }) });
  const j = await r.json(); if (!j.result || j.result === '0x') throw new Error(j.error?.message || 'no tokenURI');
  const uri = decodeString(j.result);
  return t.standard === '1155' ? fillId(uri, t.tokenId) : uri;
}
// the image's URI for a token entry, as the token gives it (ipfs://, ar://, https://, data:)
export async function tokenImageURI(t, fetchFn = fetch) {
  if (t.image) return t.image;
  const meta = await readJSON(await tokenURI(t, fetchFn), fetchFn);
  const img = meta.image || meta.image_url || meta.imageUrl; if (!img) throw new Error('no image in metadata');
  return img;
}
// the image's URL for a token entry (the first gateway's, for an IPFS one)
export async function tokenImage(t, fetchFn = fetch) { return toHttp(await tokenImageURI(t, fetchFn)); }
// the http(s) URLs to try for an image URI: each gateway in turn for an IPFS one, else the one
export function imageURLs(uri) { return ipfsCID(uri) ? GATEWAYS.map((_, g) => toHttp(uri, g)) : [toHttp(uri)]; }
// a still picture (not a video, a page, a model or a JSON): by a data: URI's type or the path's extension (none: yes)
const NOT_STILL = /\.(mp4|m4v|webm|mov|ogv|ogg|mp3|wav|html?|glb|gltf|usdz|json|zip)$/i;
export function isStillImage(uri) {
  if (typeof uri !== 'string' || !uri) return false;
  if (uri.startsWith('data:')) return /^data:image\//i.test(uri);
  const path = uri.split(/[?#]/)[0];
  return !NOT_STILL.test(path);
}
// the size (w, h) to show a w x h picture at: its long side at most max, the aspect kept
export const MAX_SIDE = 1024;
export function fitSize(w, h, max = MAX_SIDE) {
  const k = Math.min(1, max / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}
// load an image for a texture (in memory only)
export function loadImage(url) {
  return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.referrerPolicy = 'no-referrer'; im.decoding = 'async'; im.onload = () => res(im); im.onerror = () => rej(new Error('image failed')); im.src = url; });
}
// the first of a URI's URLs that loads (each gateway in turn)
export async function loadFirst(uri, load = loadImage) {
  let err;
  for (const u of imageURLs(uri)) { try { return await load(u); } catch (e) { err = e; } }
  throw err || new Error('no image');
}
// fill the slots that have an entry: slots { id: { slot (frame.js artSlot), credit(text) } }. Off unless ENABLED (or
// a test's own list is passed with force)
export async function fillSlots(slots, { list = TOKENS, force = false, fetchFn = (typeof fetch !== 'undefined' ? fetch : null), load = loadImage } = {}) {
  if (!ENABLED && !force) return [];
  const done = [];
  for (const t of list) {
    const s = slots[t.slot]; if (!s) continue;
    try {
      const uri = await tokenImageURI(t, fetchFn);
      if (!isStillImage(uri)) throw new Error('not a still image: ' + String(uri).slice(0, 80));
      const im = await loadFirst(uri, load); s.slot.setImage(im); s.credit?.(t.credit || ''); done.push(t.slot);
    }
    catch (e) { console.warn('[gallery] token slot', t.slot, e?.message || e); }
  }
  return done;
}
