/**
 * Story Kit: the owner's patch of a published world (lib/storykit-store.ts StoryStore.patch, lib/storykit-publish.ts
 * patchStoryWorld, app/api/storykit/admin/patch/route.ts): an opening and its voiced lines added to a kept world, every
 * refusal changing nothing, the old world kept for patching back. Part of `npm run check`. A temporary store with a fake
 * clock; nothing touches data/, no server, no network.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { StoryStore, LIMITS } from '../lib/storykit-store.ts';
import { voicePlanOf } from '../storykit/pack/runner.ts';
import { gatePack, toRunnerPack } from '../storykit/pack/gate.ts';
import { tinyGlb } from './storykit-store-check.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;
const R = (p: string) => readFileSync(p, 'utf8');
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const ogg = (tag: string, n = 400) => { const b = new Uint8Array(n); b.set(new TextEncoder().encode('OggS')); b.set(new TextEncoder().encode(tag), 8); return b; };

/** good-ny with an opening (rule 14): the city wide, the hero and the antagonist carded and speaking, the title. */
export function nyOpening() {
  return { place: '@timessquare', stage: [{ who: 'rae', at: '@pickup' }], shots: [
    { cam: { rel: 'player', right: -8, up: 34, fwd: -55 }, look: 'player', dur: 8, where: { name: 'Times Square', sub: 'W 45th St · 11 PM' } },
    { cam: { rel: 'player', right: 0.7, up: 0.05, fwd: 2.3 }, look: { rel: 'player' }, dur: 8, card: { who: 'nico', is: 'hero', role: 'a night driver' }, say: 'nico', line: 'One more fare tonight, and the car is finally mine.' },
    { cam: { rel: 'rae', right: -1, up: 0.2, fwd: 3 }, look: { rel: 'rae' }, dur: 8, card: { who: 'rae', is: 'antagonist', role: 'the one who wants it back' }, say: 'rae', line: 'That car is mine until midnight. Bring it to me.' },
    { cam: { rel: 'player', right: -9, up: 10, fwd: -18 }, look: 'player', dur: 8, title: true }] };
}

export function runStoryPatchChecks(ok: Ok) {
  console.log('\nStory Kit: the owner\'s patch of a published world (StoryStore.patch, POST /api/storykit/admin/patch)');
  const root = mkdtempSync(path.join(tmpdir(), 'storykit-patch-'));
  const now = Date.UTC(2026, 10, 5, 12);
  const s = new StoryStore(root, () => now);
  try {
    const NY = JSON.parse(R('storykit/pack/fixtures/good-ny.json'));
    const o = s.open(NY); if (!o.ok) { ok('a world to patch opens', false, o.error); return; }
    const d = s.auth(o.id, o.token)!;
    s.put(d, 'glb', 'nico', tinyGlb('nico'));
    const l0 = voicePlanOf(JSON.parse(d.pack), '').lines[0];
    s.put(s.auth(o.id, o.token)!, 'voice', `${l0.clip}.ogg`, ogg('l0'), { secs: 1 });
    ok('a published world to patch (sealed and kept)', s.keep(o.id, 'game-1'));
    const kept = () => s.db.prepare('SELECT * FROM drafts WHERE id = ?').get(o.id) as { world: string; pack: string; state: string };
    const was = kept().world, wasWorld = JSON.parse(s.read(`${was}.json`)!.bytes.toString());

    // the new world: the pack with an opening, its lines voiced, as the owner's browser builds it
    const pack = JSON.parse(kept().pack); pack.opening = nyOpening();
    const g = gatePack(pack); const plan = voicePlanOf(g.pack, '');
    const opening = plan.lines.filter((l: any) => /^OPEN\.c/.test(l.id));
    const clipBytes = opening.map((l: any) => ogg(l.id));
    const world = clone(wasWorld);
    world.opening = toRunnerPack(g.pack).opening;
    world.voice = { ...world.voice, lines: plan.lines, clips: { ...world.voice.clips, ...Object.fromEntries(opening.map((l: any, i: number) => [l.clip, { file: `${l.clip}.ogg`, url: `/storykit/f/${sha(clipBytes[i])}.ogg`, bytes: clipBytes[i].length, line: l.id, who: l.who, voice: l.voice, codec: 'opus', secs: 3 }])) } };
    const files = clipBytes.map((b) => ({ ext: 'ogg', bytes: b }));
    ok('the opening\'s lines are in the plan (OPEN.c<shot>)', g.ok && opening.length === 2, JSON.stringify(g.problems));

    // refusals change nothing
    const blobs = () => (s.db.prepare('SELECT COUNT(*) AS n FROM blobs').get() as any).n;
    const b0 = blobs();
    const r = (input: Parameters<StoryStore['patch']>[1]) => s.patch(o.id, input);
    const stale = r({ world, files, opening: nyOpening(), from: 'f'.repeat(64) });
    ok('a patch over a world the game does not play is refused (409)', !stale.ok && stale.status === 409);
    const noOpening = r({ world, files, from: was });
    ok('a world with an opening its pack does not have is refused (send the opening in pack form)', !noOpening.ok && noOpening.status === 422 && (noOpening as any).problems.some((p: string) => /story-pack form/.test(p)));
    const badOpening = clone(nyOpening()); badOpening.shots[0].card = { who: 'rae', is: 'ally', role: 'x' }; delete (badOpening.shots[0] as any).where;
    const gated = r({ world, files, opening: badOpening, from: was });
    ok('an opening the gate refuses (rule 14) is refused with its problems', !gated.ok && gated.status === 422 && (gated as any).problems.some((p: string) => /opening/.test(p)));
    const other = clone(world); other.opening.shots[1].sub[1] = 'Something else.';
    ok('a world whose opening is not the one the pack makes is refused', (() => { const x = r({ world: other, files, opening: nyOpening(), from: was }); return !x.ok && (x as any).problems.some((p: string) => /not the opening the pack makes/.test(p)); })());
    const missing = r({ world, files: files.slice(1), opening: nyOpening(), from: was });
    ok('a file the world names that is neither stored nor sent is refused', !missing.ok && (missing as any).problems.some((p: string) => /not stored, and not sent/.test(p)));
    const extra = r({ world, files: [...files, { ext: 'ogg', bytes: ogg('stray') }], opening: nyOpening(), from: was });
    ok('a sent file the world does not name is refused', !extra.ok && (extra as any).problems.some((p: string) => /not named by the world/.test(p)));
    const fake = r({ world, files: [{ ext: 'ogg', bytes: new TextEncoder().encode('not an ogg file at all, no') }, ...files.slice(1)], opening: nyOpening(), from: was });
    const glb = r({ world, files: [{ ext: 'glb', bytes: tinyGlb('x') }, ...files], opening: nyOpening(), from: was });
    ok('only real voice clips are sent (a fake Ogg, a GLB: refused)', !fake.ok && !glb.ok);
    const wrongLine = clone(world); const k = Object.keys(wrongLine.voice.clips).at(-1)!; wrongLine.voice.clips['00000000-00000000'] = wrongLine.voice.clips[k]; delete wrongLine.voice.clips[k];
    ok('a clip for no line of the world is refused', (() => { const x = r({ world: wrongLine, files, opening: nyOpening(), from: was }); return !x.ok && (x as any).problems.some((p: string) => /no line of the world/.test(p)); })());
    const another = clone(world); another.id = 'sk-else';
    ok('another world is refused', (() => { const x = r({ world: another, files, opening: nyOpening(), from: was }); return !x.ok && x.status === 422; })());
    ok('a refused patch stores nothing and changes nothing', blobs() === b0 && kept().world === was && !JSON.parse(kept().pack).opening);

    // the patch
    const p = r({ world, files, opening: nyOpening(), from: was });
    const after = kept();
    ok('the patch seals the world as sent (by its SHA-256) and the draft plays it', p.ok && after.world === p.hash && p.hash === sha(JSON.stringify(world)) && after.state === 'kept' && JSON.stringify(JSON.parse(s.read(`${p.hash}.json`)!.bytes.toString())) === JSON.stringify(world), p.ok ? '' : JSON.stringify(p));
    ok('the clips are the world\'s own (a Mog carries them) and the pack has the opening (a Mog keeps it)', p.ok && p.stored === 2
      && opening.every((l: any) => s.db.prepare("SELECT 1 FROM files WHERE draft_id = ? AND kind = 'voice' AND name = ?").get(o.id, `${l.clip}.ogg`)) && !!JSON.parse(after.pack).opening);
    ok('the store would build the same world from its pack and files (opening and voice plan)', (() => { const w2 = s.world(o.id) as any; const urls = (v: any) => JSON.stringify(Object.fromEntries(Object.entries(v.clips).map(([k, c]: [string, any]) => [k, c.url]).sort()));
      return JSON.stringify(w2.opening) === JSON.stringify(world.opening) && JSON.stringify(w2.voice.lines) === JSON.stringify(world.voice.lines) && JSON.stringify(w2.voice.cast) === JSON.stringify(world.voice.cast) && urls(w2.voice) === urls(world.voice); })());
    ok('the world it replaced is kept, never swept (patching back is a patch with it)', s.sweep(true) && existsSync(s.blobPath(was, 'json')) && !!s.read(`${was}.json`));
    const mp = JSON.parse(after.pack); mp.parent = mp.id; mp.id = 'night-fares-mog';
    const mog = s.open(mp, { parent: o.id });
    ok('a Mog of the patched world inherits the opening\'s clips', mog.ok && opening.every((l: any) => s.db.prepare("SELECT 1 FROM files WHERE draft_id = ? AND kind = 'voice' AND name = ? AND inherited = 1").get(mog.id, `${l.clip}.ogg`)), mog.ok ? '' : JSON.stringify(mog));
    const back = p.ok ? r({ world: wasWorld, files: [], opening: null, from: p.hash }) : null;
    ok('patching back to the old world restores it, and keeps the patched one', !!back && back.ok && back.hash === was && kept().world === was && !JSON.parse(kept().pack).opening && p.ok && !!s.read(`${p.hash}.json`), JSON.stringify(back));
    ok('the limits are the store\'s (a world at most 24 MB, clips at most 1 MB each)', LIMITS.world === 24 << 20 && LIMITS.voice.each === 1 << 20);
  } finally { rmSync(root, { recursive: true, force: true }); }

  const route = 'app/api/storykit/admin/patch/route.ts';
  const src = existsSync(route) ? R(route) : '';
  ok('the patch route is the owner\'s only: 404 unless the Story Kit is on for the request and it carries the admin session', /storykitOff\(req\)/.test(src) && /if \(!ownerRequest\(req\)\) return json\(\{ error: 'Not found\.' \}, 404\)/.test(src) && /readCapped\(req, MAX\)/.test(src));
  ok('the patch names the new world everywhere the old one was named (the game, its drafts)', /UPDATE games SET meta = \? WHERE id = \?/.test(R('lib/storykit-publish.ts')) && /storyStore\(\)\.patch\(storeId, \{ \.\.\.input, from: was \}\)/.test(R('lib/storykit-publish.ts')));
}
