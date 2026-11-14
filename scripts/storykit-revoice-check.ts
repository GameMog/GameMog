/**
 * Story Kit: a published story world's voices recorded again by the owner's browser (14 Nov; lib/storykit-store.ts
 * StoryStore.voiceGap, lib/storykit-publish.ts storyWorldsToRevoice / storyRevoiceOf, app/api/storykit/admin/revoice,
 * public/storykit/revoice.js, the voice studio's ?revoice= mode). Every hometown story published before its voice plan
 * read the town's table was sealed with no lines (its cast spoke only the placeholder mumble): such a world is found,
 * its missing lines are the plan's, and the owner's patch of every clip makes it whole, its world otherwise unchanged.
 * Part of `npm run check`; alone:
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-revoice-check.ts
 * A temporary store with a fake clock; nothing touches data/, no server, no browser, no network.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { StoryStore } from '../lib/storykit-store.ts';
import { voicePlanOf } from '../storykit/pack/runner.ts';
import { tinyGlb } from './storykit-store-check.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;
const R = (p: string) => readFileSync(p, 'utf8');
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const ogg = (tag: string, n = 400) => { const b = new Uint8Array(n); b.set(new TextEncoder().encode('OggS')); b.set(new TextEncoder().encode(tag), 8); return b; };

export function runRevoiceChecks(ok: Ok) {
  console.log('\nStory Kit: a published story world\'s voices recorded again (StoryStore.voiceGap, /storykit/revoice.html)');
  const root = mkdtempSync(path.join(tmpdir(), 'storykit-revoice-'));
  const now = Date.UTC(2026, 10, 14, 12);
  const s = new StoryStore(root, () => now);
  try {
    const NY = JSON.parse(R('storykit/pack/fixtures/good-ny.json'));
    const o = s.open(NY); if (!o.ok) { ok('a world to voice again opens', false, o.error); return; }
    s.put(s.auth(o.id, o.token)!, 'glb', 'nico', tinyGlb('nico'));
    ok('a world voiced in full is published (sealed and kept)', s.keep(o.id, 'game-1'));
    const draft = () => s.db.prepare('SELECT * FROM drafts WHERE id = ?').get(o.id) as { world: string; pack: string; state: string };
    const plan = voicePlanOf(JSON.parse(draft().pack), '');
    ok('the world has lines to voice', plan.lines.length > 3, `${plan.lines.length}`);
    const g0 = s.voiceGap(o.id)!;
    ok('a sealed world whose plan is the pack\'s, with no clip yet: every line is missing, the plan not stale', !!g0 && !g0.stale && g0.missing.length === plan.lines.filter((l: any) => !l.rec).length && g0.hash === draft().world);

    // the world as production sealed every hometown story before the fix: its voice plan with no lines and no clips
    const world = clone(g0.world) as any; world.voice = { ...world.voice, lines: [], clips: {} };
    const body = JSON.stringify(world), old = sha(body), f = s.blobPath(old, 'json');
    mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, body);
    s.db.prepare('INSERT OR IGNORE INTO blobs (hash, ext, bytes, at) VALUES (?, ?, ?, ?)').run(old, 'json', body.length, now);
    s.db.prepare("UPDATE files SET hash = ?, bytes = ? WHERE draft_id = ? AND kind = 'pack' AND name = 'world.json'").run(old, body.length, o.id);
    s.db.prepare('UPDATE drafts SET world = ? WHERE id = ?').run(old, o.id);
    const g1 = s.voiceGap(o.id)!;
    ok('a world sealed with no lines is found: stale, every line of the pack\'s plan missing', !!g1 && g1.stale && g1.hash === old && g1.missing.length === g0.missing.length && JSON.stringify(g1.plan.lines) === JSON.stringify(plan.lines));
    ok('...and its sealed world is the one it plays (what the patch sends back with only its voice changed)', JSON.stringify(g1.world) === body);

    // the owner's browser: every missing line recorded, sent in batches as the page does (BATCH clips a patch)
    const clips: Record<string, unknown> = {}, made = g1.missing.map((l: any) => { const b = ogg(l.id); return { l, b, entry: { file: `${l.clip}.ogg`, url: `/storykit/f/${sha(b)}.ogg`, bytes: b.length, line: l.id, who: l.who, voice: l.voice, codec: 'opus', secs: 2, renderMs: 900, encodeMs: 60, device: 'webgpu', dtype: 'fp32' } }; });
    const half = Math.ceil(made.length / 2);
    const send = (batch: typeof made) => { for (const m of batch) clips[m.l.clip] = m.entry; return s.patch(o.id, { world: { ...g1.world, voice: { ...g1.plan, clips: { ...clips } } }, files: batch.map((m) => ({ ext: 'ogg', bytes: m.b })), from: draft().world }); };
    const stalePlan = s.patch(o.id, { world: { ...g1.world, voice: { ...g1.world.voice, clips: { [made[0].l.clip]: made[0].entry } } }, files: [{ ext: 'ogg', bytes: made[0].b }], from: old });
    ok('clips sent with the old world\'s empty plan are refused (the patch checks the lines against the pack\'s plan)', !stalePlan.ok && (stalePlan as any).problems.some((p: string) => /world\.voice\.lines/.test(p)) && draft().world === old);
    const p1 = send(made.slice(0, half));
    ok('the first batch is accepted: the world gets the plan and those clips', p1.ok && p1.stored === half && draft().world === p1.hash, JSON.stringify(p1));
    const mid = s.voiceGap(o.id)!;
    ok('...the lines still to record are the rest', !mid.stale && mid.missing.length === made.length - half);
    const p2 = send(made.slice(half));
    const g2 = s.voiceGap(o.id)!;
    ok('the second batch names the first one\'s clips (stored) and sends its own: the world is whole', p2.ok && !g2.stale && g2.missing.length === 0 && Object.keys(g2.clips).length === made.length, JSON.stringify(p2));
    const w2 = JSON.parse(s.read(`${draft().world}.json`)!.bytes.toString());
    ok('nothing else of the world changed (only its voice)', JSON.stringify({ ...w2, voice: null }) === JSON.stringify({ ...world, voice: null }));
    ok('the store builds the same voice from the draft\'s files (a Mog of the world carries the clips)', (() => { const w3 = s.world(o.id) as any; return JSON.stringify(w3.voice.lines) === JSON.stringify(w2.voice.lines) && Object.keys(w3.voice.clips).sort().join() === Object.keys(w2.voice.clips).sort().join(); })());
    ok('the world sealed with no lines is kept (patching back is a patch with it)', s.sweep(true) && !!s.read(`${old}.json`));
  } finally { rmSync(root, { recursive: true, force: true }); }

  const route = existsSync('app/api/storykit/admin/revoice/route.ts') ? R('app/api/storykit/admin/revoice/route.ts') : '';
  ok('the revoice route is the owner\'s only (404 to anyone else, the Story Kit switch first)', /storykitOff\(req\)/.test(route) && /if \(!ownerRequest\(req\)\) return json\(\{ error: 'Not found\.' \}, 404\);/.test(route));
  const page = R('public/storykit/revoice.js'), studio = R('storykit/voices/studio.js');
  ok('the page records with the voice studio (studio.html?revoice=) and sends the clips as the owner\'s patch, at most 64 files a patch',
    /studio\.html\?revoice=/.test(page) && /\/api\/storykit\/admin\/patch/.test(page) && (+(/const BATCH = (\d+)/.exec(page)?.[1] ?? 99)) <= 64);
  ok('the studio\'s revoice mode keeps the clips in the tab (never PUT to a draft) with the entry the store would write',
    /if \(revoice\) \{[\s\S]*?S\.collected\.push\([\s\S]*?return;\s*\}/.test(studio) && /url: `\/storykit\/f\/\$\{sha\}\.\$\{clip\.ext\}`/.test(studio) && /\/api\/storykit\/admin\/revoice\?slug=/.test(studio));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failures = 0;
  runRevoiceChecks((name, cond, detail = '') => { if (!cond) failures++; console.log(`${cond ? '  ok  ' : 'FAIL  '}${name}${!cond && detail ? `\n        ${detail}` : ''}`); });
  console.log(`\n${failures ? `${failures} FAILED` : 'all revoice checks passed'}\n`);
  process.exit(failures ? 1 : 0);
}
