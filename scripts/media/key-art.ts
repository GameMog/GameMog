/**
 * Generate square and wide key art for published Runtime worlds.
 *
 *   npm run media:art                 # every world
 *   npm run media:art -- <slug>       # one world
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withBrowser } from '../../lib/browser.ts';
import { captureWorldKeyArt } from '../../lib/key-art.ts';
import { db } from '../../lib/db.ts';

const BASE = process.env.BASE ?? 'http://localhost:3939';
const requested = process.argv[2];
const sheetOnly = requested === '--sheet';
const all = db.prepare("SELECT slug, title FROM games WHERE format = 'world' ORDER BY created_at").all() as { slug: string; title: string }[];
const rows = sheetOnly ? [] : requested
  ? db.prepare("SELECT slug FROM games WHERE slug = ? AND format = 'world'").all(requested) as { slug: string }[]
  : db.prepare("SELECT slug FROM games WHERE format = 'world' ORDER BY created_at").all() as { slug: string }[];
if (!rows.length && !sheetOnly) throw new Error(requested ? `No Runtime world named ${requested}.` : 'No Runtime worlds found.');

const out = join(process.cwd(), 'public', 'media', 'art');
mkdirSync(out, { recursive: true });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

for (const { slug } of rows) {
  console.log(`key art: ${slug}`);
  await withBrowser(async (page) => {
    await page.emulate({ width: 1280, height: 720 });
    await page.goto(`${BASE}/g/${slug}/play?preview=1`);
    for (let i = 0; i < 100 && !(await page.eval<boolean>('!!(window.__gm && window.__gm.ready && window.__gmRuntime)').catch(() => false)); i++) await sleep(200);
    if (!(await page.eval<boolean>('!!window.__gmRuntime').catch(() => false))) throw new Error(`${slug} did not start its Runtime.`);
    await page.eval('window.__gmRuntime.debug.start()');
    await sleep(3600);
    await page.eval('window.__gmRuntime.debug.invincible(true); window.__gmRuntime.debug.autopilot(true); window.__gmRuntime.debug.timeScale(6)');
    for (let i = 0; i < 180 && (await page.eval<number>('window.__gmRuntime.state().level')) < 3; i++) await sleep(250);
    if ((await page.eval<number>('window.__gmRuntime.state().level')) < 3) throw new Error(`${slug} did not reach lap 3.`);
    const art = await captureWorldKeyArt(page);
    writeFileSync(join(out, `${slug}-icon.jpg`), art.icon);
    writeFileSync(join(out, `${slug}-wide.jpg`), art.wide);
  }, { width: 1280, height: 807, timeoutMs: 120_000 });
}

// A review artifact at the exact desktop tile size. It is regenerated even
// after a one-world run so the sheet always represents the whole catalogue.
await withBrowser(async (page) => {
  await page.emulate({ width: Math.max(500, all.length * 164 + 28), height: 224 });
  await page.goto(`${BASE}/terms`);
  await sleep(500);
  await page.eval(`document.body.innerHTML = ${JSON.stringify(`<main style="display:flex;gap:14px;padding:14px;margin:0;background:#F7F7F8">${all.map((g) => `<figure style="width:150px;margin:0;font:700 16px/22.4px Arial;color:#202227"><img src="/media/art/${g.slug}-icon.jpg?${Date.now()}" style="display:block;width:150px;height:150px;object-fit:cover;border-radius:8px"><figcaption style="padding-top:6px">${g.title.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)}</figcaption></figure>`).join('')}</main>`)}`);
  await sleep(500);
  writeFileSync(join(out, 'contact-sheet.jpg'), await page.screenshot(88, { x: 0, y: 0, width: Math.max(500, all.length * 164 + 28), height: 224 }));
}, { width: Math.max(500, all.length * 164 + 28), height: 311, timeoutMs: 30_000 });
