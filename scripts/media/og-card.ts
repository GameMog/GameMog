/**
 * The site's link preview card: what a pasted GameMog link shows in a chat,
 * a post or a text before anyone opens it.
 *
 *   npm run media:og
 *
 * Writes public/og.jpg at 1200x630, the size every unfurler expects. Game
 * pages use their own cover instead (app/g/[slug]/page.tsx). Chrome sets it in
 * the self-hosted fonts over a still from the homepage world, so the card
 * reads like the site.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withBrowser } from '../../lib/browser.ts';

const ROOT = new URL('../..', import.meta.url).pathname;
const b64 = (p: string) => readFileSync(join(ROOT, p)).toString('base64');
const STILL = process.argv[2] ?? 'public/media/art/speed-skating-2030-wide.jpg';

const html = `<!doctype html><html><head><style>
@font-face{font-family:D;src:url(data:font/woff2;base64,${b64('node_modules/@fontsource-variable/hubot-sans/files/hubot-sans-latin-wght-normal.woff2')}) format('woff2');font-weight:200 900}
@font-face{font-family:U;src:url(data:font/woff2;base64,${b64('node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2')}) format('woff2');font-weight:300 900}
*{margin:0;box-sizing:border-box}
html,body{width:1200px;height:630px;overflow:hidden;background:#FFFFFF}
.card{display:flex;width:1200px;height:630px}
.copy{width:560px;padding:56px 48px 58px 60px;display:flex;flex-direction:column;justify-content:space-between;color:#0B0B0F}
.mark{font:800 40px/1 D;letter-spacing:-.01em}
h1{font:800 62px/1.02 D;letter-spacing:-.02em}
p{margin-top:22px;font:500 24px/1.35 U;color:#3A3F47}
.art{flex:1;background:url(data:image/jpeg;base64,${b64(STILL)}) 58% 0/auto 800px no-repeat}
</style></head><body><div class="card">
<div class="copy"><div class="mark">GameMog</div><div><h1>One game.<br>Endless mogs.</h1><p>Make a 3D game from one sentence, play it in your browser, then Mog it.</p></div></div>
<div class="art"></div></div></body></html>`;

await withBrowser(async (page) => {
  await page.emulate({ width: 1200, height: 630 });
  await page.eval(`(async () => { document.open(); document.write(${JSON.stringify(html)}); document.close(); await document.fonts.ready; await new Promise((r) => setTimeout(r, 300)); })()`);
  const jpg = await page.screenshot(90, { x: 0, y: 0, width: 1200, height: 630 });
  writeFileSync(join(ROOT, 'public', 'og.jpg'), jpg);
  console.log(`wrote public/og.jpg (${Math.round(jpg.length / 1024)} KB)`);
});
