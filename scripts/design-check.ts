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
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

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
  none('no drop shadows', hits(files, /box-shadow\s*:\s*(?!none)/i, { code: true }));
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
  ok('tiles are the measured 150x150', /\.tl \.th\{[^}]*width:150px;height:150px/.test(css));
  ok('tile name is the measured 16px/700 at 22.4px', /\.tl \.nm\{[^}]*font-size:16px;font-weight:700;line-height:22\.4px/.test(css));
  ok('page is not pure white', /--page:#F7F7F8/.test(css) && !/--page:#FFFFFF/i.test(css));

  console.log('\ndesign contract: things that must be present');
  const footer = readFileSync(join(APP, 'header.tsx'), 'utf8');
  ok('terms page exists and is linked', hits([join(APP, 'terms/page.tsx')], /Terms of Service/).length > 0 && /href="\/terms"/.test(footer));
  ok('privacy page exists and is linked', hits([join(APP, 'privacy/page.tsx')], /Privacy Policy/).length > 0 && /href="\/privacy"/.test(footer));
  ok('skeleton loaders exist where content is pending',
    /\.sk-card\{/.test(css) && hits([join(APP, 'create/generation.tsx')], /sk-card/).length > 0);
  ok('no game frame opens on a grey box',
    ['hero-stage.tsx', 'g/[slug]/play-frame.tsx'].every((f) => /className="poster"/.test(readFileSync(join(APP, f), 'utf8'))));
  ok('the hero runs the real game, not a screenshot', hits([join(APP, 'hero-stage.tsx')], /<iframe/).length > 0);

  console.log('\ndesign contract: layout patterns');
  const page = readFileSync(join(APP, 'page.tsx'), 'utf8');
  ok('no three-across feature card row', !/grid-template-columns:\s*(2fr 1fr 1fr|repeat\(3,)/.test(css) && !/fcard/.test(page));
  none('no checkmark bullets', hits(files, /[✓✔✅]/));
  none('no sparkles or animated arrows', hits(files, /[✨⭐➡→]\s*(?:<|\{|$)/));
}
