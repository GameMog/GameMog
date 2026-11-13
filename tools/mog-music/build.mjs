#!/usr/bin/env node
// Mog Music: the owner's own songs, copied into media/mog-music/ for the car radio (wagmi/radio/radio.js).
//   node tools/mog-music/build.mjs ["<folder of mp3s>"]   (default: ../Mog Music beside this repository's folder)
// Reads the folder (never changes it), copies each .mp3 byte for byte under a safe name (lowercase, hyphens) and
// writes media/mog-music/manifest.json: [{ file, title, dur, kbps, bytes }], the title from the file's name
// (underscores as spaces, the ".mp3" and a trailing "_Mp3" dropped, the owner's capitals kept). No transcoding: the
// songs play as they were made. The duration is counted from the MPEG frames (no decoder needed).
// All rights in the songs are reserved by their owner: they are not covered by this repository's LICENSE
// (media/mog-music/NOTICE.md, and the repository's NOTICE).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.resolve(process.argv[2] || path.join(REPO, '..', 'Mog Music'));
const OUT = path.join(REPO, 'media', 'mog-music');

export const titleOf = (name) => name.replace(/\.mp3$/i, '').replace(/_Mp3$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
export const safeOf = (title) => title.toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// MPEG audio frames: the duration (s) and the mean bitrate (kbps)
const BR = { 1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], 2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] };
const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
export function frames(buf) {
  let i = 0;
  if (buf.slice(0, 3).toString('latin1') === 'ID3') i = 10 + ((buf[6] & 127) << 21 | (buf[7] & 127) << 14 | (buf[8] & 127) << 7 | (buf[9] & 127));
  let secs = 0, n = 0, bytes = 0;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
    const ver = (buf[i + 1] >> 3) & 3, layer = (buf[i + 1] >> 1) & 3, bri = buf[i + 2] >> 4, sri = (buf[i + 2] >> 2) & 3, pad = (buf[i + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) { i++; continue; } // (Layer III only)
    const kbps = BR[ver === 3 ? 1 : 2][bri], sr = SR[ver][sri], spf = ver === 3 ? 1152 : 576;
    const len = Math.floor((spf / 8) * kbps * 1000 / sr) + pad;
    if (len < 4) { i++; continue; }
    secs += spf / sr; n++; bytes += len; i += len;
  }
  return { secs, n, kbps: secs ? Math.round(bytes * 8 / secs / 1000) : 0 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const names = fs.readdirSync(SRC).filter((f) => /\.mp3$/i.test(f) && !f.startsWith('.')).sort((a, b) => a.localeCompare(b));
  if (!names.length) { console.error(`no .mp3 in ${SRC}`); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const list = [], seen = new Set();
  for (const name of names) {
    const title = titleOf(name), file = safeOf(title) + '.mp3';
    if (seen.has(file)) throw new Error(`two songs would be ${file}`);
    seen.add(file);
    const buf = fs.readFileSync(path.join(SRC, name)), f = frames(buf);
    fs.writeFileSync(path.join(OUT, file), buf);
    list.push({ file, title, dur: +f.secs.toFixed(2), kbps: f.kbps, bytes: buf.length });
    console.log(`${file.padEnd(32)} ${String(f.kbps).padStart(4)} kbps ${f.secs.toFixed(1).padStart(7)} s  "${title}"`);
  }
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.mp3') && !seen.has(f)) { fs.rmSync(path.join(OUT, f)); console.log('removed', f); }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ station: 'Mog Music', rights: 'All rights reserved by the owner. Not covered by this repository\'s LICENSE.', songs: list }, null, 1) + '\n');
  console.log(`${list.length} songs, ${(list.reduce((a, s) => a + s.bytes, 0) / 1e6).toFixed(1)} MB -> ${path.relative(REPO, OUT)}`);
}
