// The gallery's token slots (wagmi/gallery/tokens.js): shipped off with an empty list; the key-free path's pieces
// (IPFS URIs to a gateway, the eth_call's data, its ABI string, ERC-1155's {id}) work offline, with a stubbed fetch.
//   node --test tests/gallery-tokens.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENABLED, TOKENS, ipfsCID, toHttp, callData, decodeString, fillId, tokenURI, tokenImage, fillSlots, isStillImage, imageURLs, fitSize, MAX_SIDE } from '../wagmi/gallery/tokens.js';

test('shipped switched off, the list empty, and fillSlots does nothing', async () => {
  assert.equal(ENABLED, false); assert.deepEqual(TOKENS, []);
  let called = 0; assert.deepEqual(await fillSlots({ p1: { slot: { setImage: () => called++ } } }, { list: [{ slot: 'p1', image: 'x' }] }), []); assert.equal(called, 0);
});
test('IPFS URIs go through a gateway; others are left as they are', () => {
  assert.equal(ipfsCID('ipfs://bafyabc/1.json'), 'bafyabc/1.json');
  assert.equal(ipfsCID('ipfs://ipfs/bafyabc'), 'bafyabc');
  assert.equal(ipfsCID('https://gateway.example/ipfs/Qm123/img.png'), 'Qm123/img.png');
  assert.equal(toHttp('ipfs://bafyabc/1.json'), 'https://ipfs.io/ipfs/bafyabc/1.json');
  assert.equal(toHttp('ipfs://bafyabc', 1), 'https://dweb.link/ipfs/bafyabc');
  assert.equal(toHttp('ar://abc'), 'https://arweave.net/abc');
  assert.equal(toHttp('https://example.org/a.png'), 'https://example.org/a.png');
});
test('the eth_call data and its string result', () => {
  assert.equal(callData('1'), '0xc87b56dd' + '0'.repeat(63) + '1');
  assert.equal(callData(255, '1155'), '0x0e89341c' + '0'.repeat(62) + 'ff');
  const s = 'ipfs://bafy/7', hex = Buffer.from(s).toString('hex');
  const enc = '0x' + (32).toString(16).padStart(64, '0') + s.length.toString(16).padStart(64, '0') + hex.padEnd(64, '0');
  assert.equal(decodeString(enc), s);
  assert.equal(fillId('ipfs://x/{id}.json', 10), 'ipfs://x/' + '0'.repeat(63) + 'a.json');
});
test("a token's image from the chain, then its metadata (stubbed fetch, nothing on the network)", async () => {
  const s = 'ipfs://bafymeta/7', hex = Buffer.from(s).toString('hex');
  const enc = '0x' + (32).toString(16).padStart(64, '0') + s.length.toString(16).padStart(64, '0') + hex.padEnd(64, '0');
  const seen = [];
  const fetchFn = async (url, init) => {
    seen.push(url);
    if (init?.method === 'POST') { const b = JSON.parse(init.body); assert.equal(b.method, 'eth_call'); return { ok: true, json: async () => ({ result: enc }) }; }
    return { ok: true, json: async () => ({ name: 'x', image: 'ipfs://bafyimg/7.png' }) };
  };
  const t = { chain: 'ethereum', contract: '0x0000000000000000000000000000000000000001', tokenId: '7' };
  assert.equal(await tokenURI(t, fetchFn), s);
  assert.equal(await tokenImage(t, fetchFn), 'https://ipfs.io/ipfs/bafyimg/7.png');
  assert.equal(seen[seen.length - 1], 'https://ipfs.io/ipfs/bafymeta/7');
  // (a data: URI read in place, no fetch)
  const d = 'data:application/json;base64,' + Buffer.from(JSON.stringify({ image: 'https://example.org/i.png' })).toString('base64');
  assert.equal(await tokenImage({ uri: d, tokenId: '1' }, async () => { throw new Error('no fetch'); }), 'https://example.org/i.png');
});
test('only still pictures; each gateway tried for the image too; big pictures fitted to 1024', async () => {
  assert.equal(isStillImage('ipfs://bafy/1.png'), true);
  assert.equal(isStillImage('ipfs://bafy/noext'), true);
  assert.equal(isStillImage('https://x.org/v.mp4?x=1'), false);
  assert.equal(isStillImage('ipfs://bafy/index.html'), false);
  assert.equal(isStillImage('data:video/mp4;base64,AAAA'), false);
  assert.equal(isStillImage('data:image/png;base64,AAAA'), true);
  assert.deepEqual(imageURLs('ipfs://bafyimg/7.png'), ['https://ipfs.io/ipfs/bafyimg/7.png', 'https://dweb.link/ipfs/bafyimg/7.png']);
  assert.deepEqual(fitSize(8000, 4000), { w: 1024, h: 512 });
  assert.deepEqual(fitSize(600, 900), { w: 600, h: 900 });
  assert.equal(MAX_SIDE, 1024);
  // (the first gateway down: the second one's picture goes in the frame)
  const tried = [], shown = [];
  const load = async (u) => { tried.push(u); if (u.includes('ipfs.io')) throw new Error('down'); return { src: u, width: 10, height: 10 }; };
  const slots = { p1: { slot: { setImage: (im) => shown.push(im.src) }, credit: () => {} }, p2: { slot: { setImage: (im) => shown.push(im.src) }, credit: () => {} } };
  const done = await fillSlots(slots, { force: true, load, fetchFn: async () => { throw new Error('no fetch'); }, list: [
    { slot: 'p1', image: 'ipfs://bafyimg/7.png', credit: 'x' },
    { slot: 'p2', image: 'ipfs://bafyvid/7.mp4', credit: 'y' },
  ] });
  assert.deepEqual(done, ['p1']);
  assert.deepEqual(shown, ['https://dweb.link/ipfs/bafyimg/7.png']);
  assert.equal(tried.some((u) => u.includes('bafyvid')), false);
});
