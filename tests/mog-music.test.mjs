// Mog Music: the songs' folder, its manifest and titles, its notices, and the local server's byte ranges.
//   node --test tests/mog-music.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { titleOf, safeOf, frames } from '../tools/mog-music/build.mjs';
import { handler } from '../tools/serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'media/mog-music');
const man = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));

test('titles come from the file names, the owner\'s capitals kept', () => {
  assert.equal(titleOf('Feelin_Stunty.mp3'), 'Feelin Stunty');
  assert.equal(titleOf('Let_Me_Hit_It_Mp3.mp3'), 'Let Me Hit It');
  assert.equal(titleOf('See What.MP3'), 'See What');
  assert.equal(titleOf('LEX&ROY.mp3'), 'LEX&ROY');
  assert.equal(titleOf("Hope You Don't Love Her.mp3"), "Hope You Don't Love Her");
  assert.equal(safeOf('LEX&ROY'), 'lex-and-roy');
  assert.equal(safeOf("Hope You Don't Love Her"), 'hope-you-dont-love-her');
  assert.equal(safeOf('Lex- WAITS FOR ME'), 'lex-waits-for-me');
});

test('the manifest lists every song in the folder, each a safe name with a title and a length', () => {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.mp3')).sort();
  assert.ok(files.length >= 1);
  assert.deepEqual(man.songs.map((s) => s.file).sort(), files);
  for (const s of man.songs) {
    assert.match(s.file, /^[a-z0-9-]+\.mp3$/);
    assert.ok(s.title && !/_|\.mp3$/i.test(s.title), s.title);
    assert.equal(fs.statSync(path.join(DIR, s.file)).size, s.bytes);
    const f = frames(fs.readFileSync(path.join(DIR, s.file)));
    assert.ok(Math.abs(f.secs - s.dur) < 0.05 && s.dur > 5, `${s.file} ${f.secs} ${s.dur}`);
  }
});

test('the songs are carved out of the MIT License', () => {
  assert.match(fs.readFileSync(path.join(DIR, 'NOTICE.md'), 'utf8'), /All rights reserved by the owner — not covered by this repository's LICENSE/);
  assert.match(fs.readFileSync(path.join(ROOT, 'NOTICE'), 'utf8'), /Mog Music[\s\S]*All rights reserved by the owner[\s\S]*NOT covered by the MIT License/);
});

test('the radio starts off and plays only Mog Music unless ?stations=all', () => {
  const src = fs.readFileSync(path.join(ROOT, 'wagmi/radio/radio.js'), 'utf8');
  assert.match(src, /on: saved\.on === true/);
  assert.match(src, /LEGACY \? STATIONS/);
  assert.doesNotMatch(src, /on: true, idx/);
});

test('the local server serves audio/mpeg with byte ranges', async () => {
  const srv = http.createServer(handler(ROOT)).listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}/media/mog-music/${man.songs[0].file}`;
  try {
    const full = await fetch(base, { method: 'HEAD' });
    assert.equal(full.status, 200);
    assert.equal(full.headers.get('content-type'), 'audio/mpeg');
    assert.equal(full.headers.get('accept-ranges'), 'bytes');
    const part = await fetch(base, { headers: { range: 'bytes=1000-1999' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), `bytes 1000-1999/${man.songs[0].bytes}`);
    assert.equal((await part.arrayBuffer()).byteLength, 1000);
    assert.equal((await fetch(base, { headers: { range: `bytes=${man.songs[0].bytes + 5}-` } })).status, 416);
    assert.notEqual((await fetch(`http://127.0.0.1:${srv.address().port}/%2e%2e/%2e%2e/etc/hosts`)).status, 200);
  } finally { srv.close(); }
});
