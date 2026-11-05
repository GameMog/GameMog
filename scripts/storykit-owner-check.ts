/**
 * Story Kit: the switch's three settings (lib/storykit-switch.ts), STORYKIT unset / owner / on, and that every door
 * reads it the same way: with owner, the pages, the build route, the store and play answer only to the owner's admin
 * session; with it unset, the site is as it is without the Story Kit. Part of `npm run check`. Pure and static: no
 * server, no database, no network. Also: no machine-local path in anything the repo publishes.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { storykitMode, storykitOpenTo, storykitForCookies, cookieValue, storykitLive, storykitPublic } from '../lib/storykit-switch.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;
const R = (p: string) => readFileSync(p, 'utf8');

function withMode<T>(v: string | undefined, f: () => T): T {
  const was = process.env.STORYKIT;
  if (v === undefined) delete process.env.STORYKIT; else process.env.STORYKIT = v;
  try { return f(); } finally { if (was === undefined) delete process.env.STORYKIT; else process.env.STORYKIT = was; }
}

export function runStoryOwnerChecks(ok: Ok) {
  console.log('\nStory Kit: the switch, off / owner / on (lib/storykit-switch.ts)');
  const modes = [undefined, '', 'off', 'yes', 'owner', ' Owner ', 'on', 'ON'].map((v) => withMode(v, storykitMode));
  ok('STORYKIT reads as off (unset or anything else), owner or on', modes.join() === 'off,off,off,off,owner,owner,on,on', modes.join());
  const valid = (v: string | undefined) => v === 'good';
  const open = (v: string | undefined) => withMode(v, () => [storykitForCookies('a=1; gm_admin=good', valid), storykitForCookies('gm_admin=bad', valid), storykitForCookies(null, valid), storykitOpenTo(true), storykitOpenTo(false), storykitLive(), storykitPublic()].map(Number).join(''));
  ok('off: closed to everyone, the owner too', open(undefined) === '0000000', open(undefined));
  ok('owner: open only to the owner\'s valid admin cookie; the store and build worker run; not public', open('owner') === '1001010', open('owner'));
  ok('on: open to everyone, with or without the cookie', open('on') === '1111111', open('on'));
  let read = 0;
  withMode('on', () => storykitForCookies('gm_admin=good', (v) => { read++; return valid(v); }));
  withMode(undefined, () => storykitForCookies('gm_admin=good', (v) => { read++; return valid(v); }));
  ok('the cookie is read only in owner mode', read === 0);
  ok('the admin cookie is read from a Cookie header, wherever it sits', cookieValue('x=1; gm_admin=v1.2.ab', 'gm_admin') === 'v1.2.ab' && cookieValue('gm_admin=z', 'gm_admin') === 'z' && cookieValue('xgm_admin=z', 'gm_admin') === undefined && cookieValue(null, 'gm_admin') === undefined);

  // every door reads the switch the owner-aware way (static: these files need Next to run)
  const http = R('lib/storykit-http.ts');
  ok('the cookie half reuses the admin session (app/admin/session.ts validSession, the gm_admin cookie)', /import \{ COOKIE, validSession \} from '\.\.\/app\/admin\/session'/.test(http) && /storykitForCookies\(req\.headers\.get\('cookie'\), validSession, COOKIE\)/.test(http) && /validSession\(\(await cookies\(\)\)\.get\(COOKIE\)/.test(http));
  const doors: [string, RegExp][] = [
    ['app/create/layout.tsx', /on=\{await storykitForViewer\(\)\}/],
    ['app/create/story-preview/page.tsx', /!\(await storykitForViewer\(\)\)/],
    ['app/g/[slug]/play/route.ts', /storykitForRequest\(req\)/],
    ['app/d/[id]/play/route.ts', /storykitForRequest\(req\)/],
    ['app/g/[slug]/page.tsx', /storyOpen=\{[^}]*await storykitForViewer\(\)/],
    ['app/mog/[slug]/page.tsx', /storyOf\(game, storyOpen\)/],
    ['app/api/generate/route.ts', /if \(!storykitForRequest\(req\)\) return/],
    ['app/api/games/route.ts', /sealStoryDraft\(d, storykitForRequest\(req\)\)/],
  ];
  const missed = doors.filter(([f, re]) => !re.test(R(f))).map(([f]) => f);
  ok('every Story Kit page and route asks whether it is open to this request or viewer', !missed.length, missed.join(', '));
  const writes = ['app/api/storykit/drafts/route.ts', 'app/api/storykit/drafts/[id]/route.ts', 'app/api/storykit/drafts/[id]/seal/route.ts', 'app/api/storykit/drafts/[id]/report/route.ts', 'app/api/storykit/drafts/[id]/source/route.ts', 'app/api/storykit/drafts/[id]/files/[kind]/[name]/route.ts'];
  ok('the store\'s draft routes need the owner\'s session in owner mode; only the runner pack Mog City reads (by its uuid) does not',
    writes.every((f) => /storykitOff\(req\)/.test(R(f)) && !/read: true/.test(R(f))) && /storykitOff\(req, \{ read: true \}\)/.test(R('app/api/storykit/drafts/[id]/pack/route.ts')));
  ok('no page or route reads the old on-for-everyone switch (storykit-site storykitOn) or STORYKIT itself',
    !/storykitOn\b/.test(['app/create/layout.tsx', 'app/create/story-preview/page.tsx', 'app/g/[slug]/play/route.ts', 'app/d/[id]/play/route.ts', 'app/api/generate/route.ts'].map(R).join('\n'))
    && !/process\.env\.STORYKIT\b/.test(['lib/storykit-site.ts', 'lib/storykit-store.ts', 'lib/storykit-build.ts', 'lib/storykit-publish.ts', 'lib/storykit-http.ts'].map(R).join('\n')));
  const games = R('app/api/games/route.ts');
  ok('a story world the owner publishes in owner mode goes in hidden (no list shows it; the owner\'s session opens it)', /if \(story && storykitMode\(\) === 'owner'\) setWorldHidden\(id, true\)/.test(games));
  ok('the switch is documented: owner in the README and RULES', /STORYKIT=owner/.test(R('README.md')) && /STORYKIT=owner/.test(R('docs/RULES.md')) && /STORYKIT=owner/.test(R('storykit/README.md')));
  ok('the owner\'s /admin shows the store only while the switch is on or owner (off: the store is never opened)', /mode === 'off' \? null : \{ mode, \.\.\.storyStore\(\)\.usage\(\) \}/.test(R('app/admin/page.tsx')) && /function StoryKitCard/.test(R('app/admin/dashboard.tsx')));

  // the repo is public: no machine-local path (a home folder, a user name in a path) in anything it tracks
  // (git grep in a checkout; in an exported tree, a grep of the same files, skipping what git ignores)
  const PAT = '(/Users/|/home/)[A-Za-z0-9._-]+/';
  let g = spawnSync('git', ['grep', '-nIE', PAT, '--', '.', ':!package-lock.json', ':!scripts/storykit-owner-check.ts'], { encoding: 'utf8' });
  if (g.status! > 1) g = spawnSync('grep', ['-rnIE', PAT, '.', '--exclude-dir=node_modules', '--exclude-dir=.next', '--exclude-dir=.git', '--exclude-dir=data', '--exclude-dir=.scratch',
    '--exclude-dir=.claude', '--exclude=package-lock.json', '--exclude=storykit-owner-check.ts', '--exclude=.env*'], { encoding: 'utf8' });
  const hits = g.status === 0 ? g.stdout.trim().split('\n').filter(Boolean) : [];
  ok('no tracked file names a machine-local path (scripts take paths from their arguments, env or the repo: scripts/forge/paths.mjs)', g.status === 0 ? !hits.length : g.status === 1, hits.slice(0, 5).join(' | ') || (g.status! > 1 ? g.stderr.trim() : ''));
}
