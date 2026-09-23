/** Capture the owner-review page set at the exact desktop and phone viewports. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withBrowser } from '../../lib/browser.ts';

const BASE = process.env.BASE ?? 'http://localhost:3939';
const OUT = process.env.OUT ?? join(process.cwd(), 'artifacts', 'screenshots', 'after');
const pages = [
  ['home', '/'],
  ['la-olympics-2028', '/g/la-olympics-2028'],
  ['pepe-thunderbog', '/g/pepe-s-thunderbog-dash'],
  ['muse-sprint', '/g/muse-sprint'],
  ['classic-chart', '/charts/classic'],
  ['create', '/create'],
  ['mog-la-olympics', '/mog/la-olympics-2028'],
] as const;
const sizes = [
  { name: 'desktop', width: 1440, height: 900, mobile: false },
  { name: 'phone', width: 375, height: 812, mobile: true },
] as const;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

mkdirSync(OUT, { recursive: true });
for (const size of sizes) {
  await withBrowser(async (page) => {
    await page.emulate(size);
    // Keep review capture read-only. Game pages retain their poster while the
    // /play frame is blocked, so its existing play-count side effect never runs.
    await page.blockRequests(['*/play*']);
    for (const [name, path] of pages) {
      console.log(`${size.name}: ${path}`);
      await page.goto(`${BASE}${path}`);
      for (let i = 0; i < 240; i++) {
        const ready = await page.eval<boolean>("document.readyState === 'complete' && document.body && document.body.innerText.length > 20").catch(() => false);
        if (ready) break;
        await sleep(500);
      }
      await page.eval("document.fonts ? document.fonts.ready : Promise.resolve()").catch(() => {});
      await sleep(path.startsWith('/g/') ? 2500 : 900);
      await page.eval('window.scrollTo(0, 0)');
      await sleep(100);
      writeFileSync(join(OUT, `${name}-${size.name}.jpg`), await page.screenshot(88));
    }
  }, { width: Math.max(500, size.width), height: size.height + 87, timeoutMs: 600_000 });
}
process.exit(0);
