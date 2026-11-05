// Story Kit voice clips: a rendered line (Float32Array, 24 kHz mono) -> the bytes stored beside a pack. Ogg Opus where
// the browser has an Opus encoder (WebCodecs AudioEncoder, as in Chrome and Edge), WAV (16-bit PCM) anywhere else.
// Opus at 32 kb/s is about a twelfth of the WAV (4 KB a second against 48 KB) and plays in every browser the Story
// Kit runs in. The Ogg muxer is our own (RFC 7845 framing; no library).
//
//   import { encodeClip } from '/storykit/voices/clip-codec.js';
//   const { bytes, ext, type, codec } = await encodeClip(float32);      // ext 'ogg' | 'wav'
import { wavBytes, SAMPLE_RATE } from './voice-design.js';

const OPUS = (sr, bitrate) => ({ codec: 'opus', sampleRate: sr, numberOfChannels: 1, bitrate });

export async function opusSupported(sr = SAMPLE_RATE, bitrate = 32000) {
  if (typeof AudioEncoder !== 'function' || typeof AudioData !== 'function') return false;
  try { return !!(await AudioEncoder.isConfigSupported(OPUS(sr, bitrate))).supported; } catch { return false; }
}

export async function encodeClip(x, { sr = SAMPLE_RATE, bitrate = 32000, codec = 'opus' } = {}) {
  if (codec === 'opus' && (await opusSupported(sr, bitrate))) {
    try { return { bytes: await oggOpus(x, sr, bitrate), ext: 'ogg', type: 'audio/ogg', codec: 'opus' }; }
    catch (e) { console.warn('[voice] opus encode failed, storing WAV', e); }
  }
  return { bytes: wavBytes(x, sr), ext: 'wav', type: 'audio/wav', codec: 'pcm16' };
}

// ── Ogg Opus ──
async function oggOpus(x, sr, bitrate) {
  const packets = []; let failed = null, preSkip = 312;   // libopus' look-ahead at 48 kHz, unless the encoder says
  const enc = new AudioEncoder({
    output(chunk, meta) {
      const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b);
      packets.push({ b, n48: Math.round((chunk.duration || 20000) * 0.048) });
      const d = meta && meta.decoderConfig && meta.decoderConfig.description;
      if (d) { const u = d instanceof ArrayBuffer ? new Uint8Array(d) : new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
        if (u.length >= 12 && String.fromCharCode(...u.slice(0, 8)) === 'OpusHead') preSkip = u[10] | (u[11] << 8); }
    },
    error(e) { failed = e; }
  });
  enc.configure(OPUS(sr, bitrate));
  const step = sr / 10;
  for (let i = 0; i < x.length; i += step) {
    const part = x.subarray(i, Math.min(x.length, i + step));
    const ad = new AudioData({ format: 'f32', sampleRate: sr, numberOfFrames: part.length, numberOfChannels: 1, timestamp: Math.round(i / sr * 1e6), data: part.slice() });
    enc.encode(ad); ad.close();
  }
  await enc.flush(); enc.close();
  if (failed) throw failed;
  if (!packets.length) throw new Error('no Opus packets');

  const serial = (Math.random() * 0xffffffff) >>> 0, pages = [];
  let seq = 0;
  const head = new Uint8Array(19), hv = new DataView(head.buffer);
  head.set([...'OpusHead'].map((c) => c.charCodeAt(0))); head[8] = 1; head[9] = 1; hv.setUint16(10, preSkip, true); hv.setUint32(12, sr, true); hv.setInt16(16, 0, true); head[18] = 0;
  const vendor = new TextEncoder().encode('GameMog Story Kit'), tags = new Uint8Array(8 + 4 + vendor.length + 4), tv = new DataView(tags.buffer);
  tags.set([...'OpusTags'].map((c) => c.charCodeAt(0))); tv.setUint32(8, vendor.length, true); tags.set(vendor, 12); tv.setUint32(12 + vendor.length, 0, true);
  pages.push(page([head], 0n, 0x02, serial, seq++));
  pages.push(page([tags], 0n, 0, serial, seq++));
  // audio pages of up to a second (50 packets); the last page's granule trims the encoder's padding off the end
  const end = BigInt(preSkip + Math.round(x.length * 48000 / sr));
  let g = 0n;
  for (let i = 0; i < packets.length; i += 50) {
    const group = packets.slice(i, i + 50), last = i + 50 >= packets.length;
    for (const p of group) g += BigInt(p.n48);
    pages.push(page(group.map((p) => p.b), last ? (end < g ? end : g) : g, last ? 0x04 : 0, serial, seq++));
  }
  const out = new Uint8Array(pages.reduce((s, p) => s + p.length, 0)); let o = 0;
  for (const p of pages) { out.set(p, o); o += p.length; }
  return out;
}

const CRC = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let r = i << 24; for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1; t[i] = r >>> 0; } return t; })();

function page(packets, granule, flags, serial, seq) {
  const lace = [];
  for (const p of packets) { let n = p.length; while (n >= 255) { lace.push(255); n -= 255; } lace.push(n); }
  if (lace.length > 255) throw new Error('ogg page: too many segments');
  const body = packets.reduce((s, p) => s + p.length, 0), b = new Uint8Array(27 + lace.length + body), v = new DataView(b.buffer);
  b.set([0x4f, 0x67, 0x67, 0x53]); b[4] = 0; b[5] = flags; v.setBigUint64(6, granule, true); v.setUint32(14, serial, true); v.setUint32(18, seq, true);
  b[26] = lace.length; b.set(lace, 27);
  let o = 27 + lace.length; for (const p of packets) { b.set(p, o); o += p.length; }
  let c = 0; for (let i = 0; i < b.length; i++) c = ((c << 8) ^ CRC[((c >>> 24) ^ b[i]) & 0xff]) >>> 0;
  v.setUint32(22, c, true);
  return b;
}
