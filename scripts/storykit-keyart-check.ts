/**
 * Story Kit: a published story world's key art taken again (14 Nov; lib/storykit-publish.ts storyKeyArtSrc and
 * saveStoryKeyArt, app/api/storykit/admin/keyart/route.ts, public/storykit/keyart.html). A hometown story whose test drive
 * played New York (before work.js read the town's four-part frame) was refused by Mog City and took no key art: its cover
 * is the plain palette card. The owner's browser plays the published world again with ?keyart=1 and sends Mog City's two
 * frames, which become the game's cover and art (titled), its world unchanged. Part of `npm run check`; alone:
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-keyart-check.ts
 * A throwaway game row in this database (removed after), no server, no browser, no network.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { db } from '../lib/db.ts';
import { saveStoryKeyArt, storyKeyArtSrc, storyWorldsWithoutArt, sealedWorldOf } from '../lib/storykit-publish.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;

export async function runKeyArtChecks(ok: Ok) {
  console.log('\nStory Kit: a published story world\'s key art taken again (the owner\'s browser, POST /api/storykit/admin/keyart)');
  const id = randomUUID(), slug = `keyart-check-${id.slice(0, 8)}`, world = 'd'.repeat(64);
  const lock = { place: 'us-4054200', compiler: 'htc-0.8.0-hg1-b9120c8ae', tiles: 'f'.repeat(64) };
  const meta = { mode: 'storykit', storykit: { pack: randomUUID(), world, city: 'hometown', hometown: lock } };
  db.prepare(`INSERT INTO games (id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, created_at, format, code, meta) VALUES (?, ?, 'Night Shift', '', '', 'endless', '{}', NULL, 0, ?, 'world', '', ?)`)
    .run(id, slug, Date.now(), JSON.stringify(meta));
  db.prepare('UPDATE games SET hidden = 1 WHERE id = ?').run(id);
  try {
    const row = () => db.prepare('SELECT meta, cover, art_wide, art_icon FROM games WHERE id = ?').get(id) as { meta: string; cover: Uint8Array | null; art_wide: Uint8Array | null; art_icon: Uint8Array | null };
    ok('a published story world with no key art is on the owner\'s list', storyWorldsWithoutArt().some((g) => g.slug === slug && g.city === 'hometown' && g.hidden));
    const s = storyKeyArtSrc(slug, 'http://localhost:1');
    ok('it is played again as published (its sealed world, its town) with Mog City\'s autopilot and ?keyart=1, never as a counted play',
      !!s && decodeURIComponent(s.src).includes(`/storykit/f/${world}.json`) && s.src.includes('city=pkg&town=us-4054200') && /&autopilot=1/.test(s.src) && /&keyart=1/.test(s.src) && /&noaudio=1/.test(s.src)
        && s.src.includes(`game=keyart-${id}`) && s.mc === new URL(s.src).origin && !s.hasArt, s?.src);
    ok('no key art address for what is not a published story world', storyKeyArtSrc('no-such-world') === null && storyKeyArtSrc('../x') === null);
    const notJpeg = await saveStoryKeyArt(slug, new Uint8Array(4000).fill(7), new Uint8Array(4000).fill(7));
    ok('anything but a JPEG frame is refused, and nothing changes', !notJpeg.ok && notJpeg.status === 422 && row().cover === null);
    const shot = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 40, g: 90, b: 140 } } }).jpeg({ quality: 80 }).toBuffer();
    const wide = new Uint8Array(await shot(1280, 720)), square = new Uint8Array(await shot(512, 512));
    const tiny = await saveStoryKeyArt(slug, new Uint8Array(await shot(64, 36)), square);
    ok('a frame too small to be key art is refused', !tiny.ok && tiny.status === 422);
    const r = await saveStoryKeyArt(slug, wide, square);
    const after = row();
    ok('Mog City\'s two frames become the game\'s cover (the plain frame) and its art, titled in the lockup',
      r.ok && !!after.cover && Buffer.from(after.cover).equals(Buffer.from(wide)) && !!after.art_wide && !!after.art_icon && (r.ok && r.titled ? !Buffer.from(after.art_wide).equals(Buffer.from(wide)) : true), JSON.stringify(r));
    ok('...the world itself is unchanged (its sealed world, its town), and it leaves the list', sealedWorldOf(after.meta) === world && JSON.stringify(JSON.parse(after.meta).storykit.hometown) === JSON.stringify(lock) && !storyWorldsWithoutArt().some((g) => g.slug === slug));
    const route = readFileSync('app/api/storykit/admin/keyart/route.ts', 'utf8'), page = readFileSync('public/storykit/keyart.js', 'utf8');
    ok('the route is the owner\'s only (404 to anyone else, the Story Kit switch first), the page hears Mog City\'s keyart message from Mog City\'s origin only',
      (route.match(/if \(!ownerRequest\(req\)\) return json\(\{ error: 'Not found\.' \}, 404\);/g) ?? []).length === 2 && (route.match(/storykitOff\(req\)/g) ?? []).length === 2
        && /e\.origin !== g\.mc/.test(page) && /d\.type === 'keyart'/.test(page) && /e\.source !== f\.contentWindow/.test(page));
    // (r7, live QA 14 Nov: the page said only "Not found." to the owner when not signed in)
    ok('the page tells anyone the route turns away (its \'Not found.\') to sign in at /admin first, and nothing more',
      /r\.status === 404 && \(!j\.error \|\| j\.error === 'Not found\.'\)\) throw new Error\('Sign in at \/admin first\./.test(page));
  } finally { db.prepare('DELETE FROM games WHERE id = ?').run(id); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failures = 0;
  await runKeyArtChecks((name, cond, detail = '') => { if (!cond) failures++; console.log(`${cond ? '  ok  ' : 'FAIL  '}${name}${!cond && detail ? `\n        ${detail}` : ''}`); });
  console.log(`\n${failures ? `${failures} FAILED` : 'all key art checks passed'}\n`);
  process.exit(failures ? 1 : 0);
}
