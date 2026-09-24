/**
 * Design contract.
 *
 * The brief for this interface was largely a list of things it must not do.
 * A list like that decays the moment someone adds a component in a hurry, so
 * it lives here as assertions rather than as a note. Same principle as the
 * rest of the project: the prompt asks, the code enforces.
 *
 * Scope is the presentation layer only. app/cover.tsx is exempt from the
 * gradient rule because it draws a sky, and a sky is a gradient.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { markSvg } from '../lib/brand.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const APP = join(ROOT, 'app');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts|css)$/.test(p)) out.push(p);
  }
  return out;
}

type Ok = (name: string, cond: boolean, detail?: string) => void;

/**
 * Lines matching `re`, as "file:line" strings.
 *
 * `code` blanks out comments first, keeping line numbers intact, because a
 * comment describing a rule is not a violation of it. Rules about the words on
 * the page (punctuation, emoji) scan the raw text instead.
 */
function hits(files: string[], re: RegExp, opts: { exempt?: string[]; code?: boolean } = {}) {
  const { exempt = [], code = false } = opts;
  const found: string[] = [];
  for (const f of files) {
    const rel = relative(ROOT, f);
    if (exempt.some((e) => rel.includes(e))) continue;
    let text = readFileSync(f, 'utf8');
    if (code) {
      text = text
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
    }
    text.split('\n').forEach((line, i) => {
      if (re.test(line)) found.push(`${rel}:${i + 1}`);
    });
  }
  return found;
}

const hue = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.08) return { h: 0, s: 0 };
  let x = 0;
  if (mx === r) x = ((g - b) / d + 6) % 6;
  else if (mx === g) x = (b - r) / d + 2;
  else x = (r - g) / d + 4;
  return { h: x * 60, s: d / mx };
};

export function runDesignChecks(ok: Ok) {
  const files = walk(APP);
  const css = readFileSync(join(APP, 'globals.css'), 'utf8');
  const none = (label: string, found: string[]) =>
    ok(label, found.length === 0, found.slice(0, 4).join(', '));

  console.log('\ndesign contract: surfaces');
  // GameStop's soft elevation, by the owner's call (23 Sep, docs/design/premium.md):
  // a shadow may come only from the three elevation tokens, never ad hoc
  none('shadows only from the elevation tokens', hits(files, /box-shadow\s*:\s*(?!none|var\(--elev(?:-hover|-hair)?\))/i, { code: true }));
  ok('the elevation tokens are GameStop\'s soft card shadows', /--elev:0 1px 6px rgba\(0,0,0,\.15\)/.test(css) && /--elev-hover:0 6px 18px rgba\(0,0,0,\.16\)/.test(css));
  none('no gradients in chrome', hits(files, /(linear|radial|conic)-gradient\s*\(/i, { code: true, exempt: ['app/cover.tsx'] }));
  none('no frosted glass', hits(files, /backdrop-filter/i, { code: true }));
  none('no transitions or animations', hits(files, /\b(transition|animation)\s*:|@keyframes/i, { code: true }));
  none('no dot-grid or orb backgrounds', hits(files, /repeating-(linear|radial)-gradient|radial-gradient\(circle/i, { code: true, exempt: ['app/cover.tsx'] }));

  console.log('\ndesign contract: type and colour');
  none('no Inter, Geist or Space Grotesk', hits(files, /\b(Inter|Geist|Space\s*Grotesk)\b/, { code: true }));
  none('no webfont fetch', hits(files, /fonts\.(googleapis|gstatic)\.com/));
  none('no em dash in the presentation layer', hits(files, /—/));
  none('no emoji', hits(files, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u));

  const purple = [...css.matchAll(/#[0-9A-Fa-f]{6}/g)]
    .map((m) => m[0])
    .filter((h) => { const { h: d, s } = hue(h); return d >= 250 && d <= 320 && s > 0.25; });
  ok('no purple in the palette', purple.length === 0, purple.join(', '));

  const neon = [...css.matchAll(/#[0-9A-Fa-f]{6}/g)]
    .map((m) => m[0])
    .filter((h) => hue(h).s > 0.92);
  ok('no neon (fully saturated) colours', neon.length === 0, neon.join(', '));

  console.log('\ndesign contract: geometry');
  const radii = [...css.matchAll(/border-radius\s*:\s*([^;}]+)/g)]
    .flatMap((m) => m[1].match(/\d+(?:\.\d+)?px/g) ?? [])
    .map((v) => parseFloat(v))
    .filter((v) => v > 8);
  ok('no soft radii between 9px and a full pill', radii.length === 0, radii.join(', '));
  // the owner found 150px squares "way too small" (23 Sep); key art is wide
  ok('tiles are 16:9, four across a desktop row', /\.tl\{[^}]*width:calc\(\(100% - 48px\) \/ 4\)/.test(css) && /\.tl \.th\{[^}]*aspect-ratio:16\/9/.test(css));
  ok('cards are white, elevated and 8px round, with a 15px/700 name', /\.tl\{[^}]*background:var\(--surface\);border-radius:var\(--r\);overflow:hidden;box-shadow:var\(--elev\)/.test(css) && /\.tl \.nm\{[^}]*font-size:15px;font-weight:700/.test(css));
  ok('titles are set in the display face, self-hosted', /--display:'Hubot Sans Variable'/.test(css) && /@fontsource-variable\/hubot-sans/.test(readFileSync(join(APP, 'layout.tsx'), 'utf8')));
  // light by default (the owner, 23 Sep); Roblox's dark theme is kept under
  // [data-theme="dark"]
  ok('page is GameStop\'s cool grey under white surfaces; the dark palette is kept', /:root\{[^}]*--page:#F2F4F7/.test(css) && /:root\{[^}]*--surface:#FFFFFF/.test(css) && /\[data-theme="dark"\]\{[^}]*--page:#121215/.test(css));

  console.log('\ndesign contract: things that must be present');
  const footer = readFileSync(join(APP, 'header.tsx'), 'utf8');
  // one mark everywhere: a tab icon that is not the header's logo is a second brand
  ok('the tab and home-screen icons are built from the mark (npm run brand:icons)',
    ['favicon.ico', 'apple-icon.png'].every((f) => existsSync(join(APP, f)))
    && existsSync(join(APP, 'icon.svg')) && readFileSync(join(APP, 'icon.svg'), 'utf8').trim() === markSvg()
    && /<Wordmark/.test(footer) && /\.wordmark \.mark\{/.test(css));
  ok('terms page exists and is linked', hits([join(APP, 'terms/page.tsx')], /Terms of Service/).length > 0 && /href="\/terms"/.test(footer));
  ok('privacy page exists and is linked', hits([join(APP, 'privacy/page.tsx')], /Privacy Policy/).length > 0 && /href="\/privacy"/.test(footer));
  ok('skeleton loaders exist where content is pending',
    /\.sk-card\{/.test(css) && hits([join(APP, 'create/generation.tsx')], /sk-card/).length > 0);
  ok('no game frame opens on a grey box',
    /className="poster"/.test(readFileSync(join(APP, 'g/[slug]/play-frame.tsx'), 'utf8')) && /<picture>/.test(readFileSync(join(APP, 'hero-film.tsx'), 'utf8')));
  ok('the hero shows real gameplay, filmed from the world\'s own canvas',
    /<video/.test(readFileSync(join(APP, 'hero-film.tsx'), 'utf8')) && /captureStream/.test(readFileSync(join(ROOT, 'scripts/media/record-hero.ts'), 'utf8')));

  console.log('\ndesign contract: layout patterns');
  const page = readFileSync(join(APP, 'page.tsx'), 'utf8');
  ok('no three-across feature card row', !/grid-template-columns:\s*(2fr 1fr 1fr|repeat\(3,)/.test(css) && !/fcard/.test(page));
  none('no checkmark bullets', hits(files, /[✓✔✅]/));
  none('no sparkles or animated arrows', hits(files, /[✨⭐➡→]\s*(?:<|\{|$)/));
}
