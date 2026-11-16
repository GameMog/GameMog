/**
 * Owner writes from another origin, and the site's own headers (16 Nov 2026; lib/same-origin.ts, next.config.ts). Part
 * of `npm run check`; no server runs.
 */
import { readFileSync } from 'node:fs';
import { crossOrigin, crossOriginRefusal } from '../lib/same-origin.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;
const R = (p: string) => readFileSync(p, 'utf8');
const req = (h: Record<string, string>, url = 'http://127.0.0.1:6390/api/x') => new Request(url, { method: 'POST', headers: h });

export async function runSameOriginChecks(ok: Ok) {
  console.log('\nOwner writes from another origin (lib/same-origin.ts) and the site\'s headers (next.config.ts)');
  const site = { host: 'gamemog.com', 'x-forwarded-host': 'gamemog.com', 'x-forwarded-proto': 'https' };
  ok('Sec-Fetch-Site same-origin passes; same-site (mc.gamemog.com), cross-site and none do not',
    !crossOrigin(req({ ...site, 'sec-fetch-site': 'same-origin' })) && ['same-site', 'cross-site', 'none'].every((v) => crossOrigin(req({ ...site, 'sec-fetch-site': v }))));
  ok('a page cannot pass with a matching Origin when its browser says same-site',
    crossOrigin(req({ ...site, 'sec-fetch-site': 'same-site', origin: 'https://gamemog.com' })));
  ok('with no Sec-Fetch-Site: only the site\'s own Origin passes (mc.gamemog.com, another site and an opaque frame\'s "null" do not)',
    !crossOrigin(req({ ...site, origin: 'https://gamemog.com' })) && ['https://mc.gamemog.com', 'https://evil.example', 'null', 'http://gamemog.com'].every((o) => crossOrigin(req({ ...site, origin: o }))));
  ok('the dev server\'s own origin passes', !crossOrigin(req({ host: '127.0.0.1:6390', origin: 'http://127.0.0.1:6390' })));
  ok('no browser headers at all (a script, the offline checks) passes', !crossOrigin(req({})));
  const refused = crossOriginRefusal(req({ 'sec-fetch-site': 'cross-site' }));
  ok('the refusal is a 403', refused?.status === 403 && crossOriginRefusal(req({ 'sec-fetch-site': 'same-origin' })) === null);

  // every write the owner's session authorizes asks it
  const writes: [string, RegExp][] = [
    ['app/api/storykit/admin/patch/route.ts', /ownerRequest\(req\)\) return json\(\{ error: 'Not found.' \}, 404\);\n\s+const cross = crossOriginRefusal\(req\)/],
    ['app/api/storykit/admin/keyart/route.ts', /export async function POST[\s\S]*?ownerRequest\(req\)\) return json\(\{ error: 'Not found.' \}, 404\);\n\s+const cross = crossOriginRefusal\(req\)/],
    ['app/api/storykit/drafts/route.ts', /ownerRequest\(req\)\) return json\(\{ error: 'Not found.' \}, 404\);\n\s+const cross = crossOriginRefusal\(req\)/],
    ['app/api/hometown/admin/[...path]/route.ts', /ownerVisit\(req\) && \(req\.method === 'GET' \|\| !crossOrigin\(req\)\)/],
    ['app/api/towns/route.ts', /townsAccess\(req, process\.env, \(r\) => ownerVisit\(r\) && !crossOrigin\(r\)\)/],
    ['app/api/generate/route.ts', /export async function POST\(req: Request\) \{[\s\S]{0,400}?const cross = crossOriginRefusal\(req\); if \(cross\) return cross;\n\s+let body/],
  ];
  ok('the owner\'s writes ask it: the story patch, key art, a store draft, the builder\'s prewarm/loadtest/ttfd, towns, builds',
    writes.every(([f, re]) => re.test(R(f))), writes.filter(([f, re]) => !re.test(R(f))).map(([f]) => f).join(', '));
  // the admin screen's server actions: Next's own check (the Origin's host against the forwarded host), with no allowedOrigins
  const cfg = R('next.config.ts');
  ok('the admin screen\'s server actions keep Next\'s own Origin check (no serverActions.allowedOrigins)', !/allowedOrigins/.test(cfg) && /^'use server';/.test(R('app/admin/actions.ts')));
  ok('the owner\'s cookie is SameSite=Strict and HttpOnly', /sameSite: 'strict'/.test(R('app/admin/actions.ts')) && /httpOnly: true/.test(R('app/admin/actions.ts')));

  // the site's headers
  const { default: config } = await import('../next.config.ts') as { default: { headers(): Promise<{ source: string; headers: { key: string; value: string }[] }[]> } };
  const rules = await config.headers();
  const all = rules.find((r) => r.source === '/:path*');
  const val = (k: string) => all?.headers.find((h) => h.key === k)?.value;
  ok('site-wide: nosniff and HSTS for a year with subdomains', rules[0] === all && val('x-content-type-options') === 'nosniff'
    && val('strict-transport-security') === 'max-age=31536000; includeSubDomains' && !val('referrer-policy') && !val('content-security-policy'));
  const fa = rules.find((r) => r.headers.some((h) => h.key === 'content-security-policy' && h.value === "frame-ancestors 'self'"));
  ok('the pages\' rule also sends strict-origin-when-cross-origin (a play document keeps its own no-referrer)', !!fa?.headers.some((h) => h.key === 'referrer-policy' && h.value === 'strict-origin-when-cross-origin'));
  const re = fa && new RegExp(`^${fa.source.replace(/^\/\(/, '/(')}$`);
  const paths = { framed: ['/', '/create', '/g/zombie-beach', '/admin-x', '/storykit/work.html', '/me'], play: ['/g/zombie-beach/play', '/d/123e4567-e89b-12d3-a456-426614174000/play'] };
  ok('frame-ancestors \'self\' on the site\'s pages, not on the play documents (they carry their own)', !!re && paths.framed.every((p) => re.test(p)) && paths.play.every((p) => !re.test(p)),
    fa?.source ?? 'no rule');
  const voices = rules.findIndex((r) => r.source === '/storykit/voices/:path*');
  ok('the voice studio\'s own CSP comes after, so it is the one sent', voices > rules.indexOf(fa!));
}
