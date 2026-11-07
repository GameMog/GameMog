/**
 * Story Kit: the world store on GameMog's disk (lib/storykit-store.ts) and the GPL phonemizer's licence, source offer
 * and separation (public/storykit/vendor/gpl). Part of `npm run check`. The store runs in a temporary folder with a
 * fake clock; nothing touches data/. No live world reads any of this.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { StoryStore, LIMITS, SHOWCASE_LIMITS, checkGlb, readCapped, storykitOn, BLOB_FILE, STORE_FULL, storeGuard } from '../lib/storykit-store.ts';
import { voicePlanOf } from '../storykit/pack/runner.ts';
import { gatePack } from '../storykit/pack/gate.ts';
import { SHOWCASE_PACKS } from '../storykit/pack/schema.mjs';

type Ok = (name: string, cond: boolean, detail?: string) => void;
const R = (p: string) => readFileSync(p, 'utf8');
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');

/** A minimal GLB 2.0: header, one JSON chunk (asset only), `pad` extra bytes of BIN so sizes can be chosen. */
export function tinyGlb(tag = '', pad = 0): Uint8Array {
  let json = JSON.stringify({ asset: { version: '2.0', generator: `check ${tag}` } });
  while (json.length % 4) json += ' ';
  const bin = pad ? 8 + Math.ceil(pad / 4) * 4 : 0, total = 12 + 8 + json.length + bin;
  const b = new Uint8Array(total), v = new DataView(b.buffer);
  v.setUint32(0, 0x46546c67, true); v.setUint32(4, 2, true); v.setUint32(8, total, true);
  v.setUint32(12, json.length, true); v.setUint32(16, 0x4e4f534a, true); b.set(new TextEncoder().encode(json), 20);
  if (bin) { v.setUint32(20 + json.length, bin - 8, true); v.setUint32(24 + json.length, 0x004e4942, true); }
  return b;
}
const ogg = (tag: string, n = 200) => { const b = new Uint8Array(n); b.set(new TextEncoder().encode('OggS')); b.set(new TextEncoder().encode(tag), 8); return b; };
const wav = (tag: string, n = 200) => { const b = new Uint8Array(n); b.set(new TextEncoder().encode('RIFF')); b.set(new TextEncoder().encode('WAVE'), 8); b.set(new TextEncoder().encode(tag), 16); return b; };
const jpg = (n = 300) => { const b = new Uint8Array(n); b.set([0xff, 0xd8, 0xff, 0xe0]); return b; };

export async function runStoryStoreChecks(ok: Ok) {
  console.log('\nStory Kit: the world store on GameMog\'s disk (lib/storykit-store.ts)');
  ok('the Story Kit store is off unless STORYKIT=on or owner', ['on', 'owner'].includes((process.env.STORYKIT ?? '').trim().toLowerCase()) ? storykitOn() : !storykitOn());

  const root = mkdtempSync(path.join(tmpdir(), 'storykit-store-'));
  let now = Date.UTC(2026, 10, 4, 12);
  const s = new StoryStore(root, () => now);
  try {
    const NY = JSON.parse(R('storykit/pack/fixtures/good-ny.json'));
    // ── open: the server gates; a refused pack opens nothing
    const bad = clone(NY); bad.base.city = 'atlantis';
    const refused = s.open(bad);
    ok('a refused pack opens no draft (422, with the gate\'s problems)', !refused.ok && refused.status === 422 && Array.isArray((refused as any).problems) && (refused as any).problems.length > 0);
    const o = s.open(NY);
    if (!o.ok) { ok('a passing pack opens a draft', false, o.error); return; }
    ok('a passing pack opens a draft with a uuid id and a long token', /^[0-9a-f-]{36}$/.test(o.id) && o.token.length >= 32);
    const d = s.auth(o.id, o.token)!;
    ok('the token opens its draft; another token or a made-up id does not', !!d && !s.auth(o.id, o.token + 'x') && !s.auth(o.id, null) && !s.auth('../../etc', o.token));
    ok('only the token\'s SHA-256 is kept', !JSON.stringify(s.db.prepare('SELECT * FROM drafts').all()).includes(o.token));

    // ── GLBs
    ok('checkGlb takes a GLB 2.0 and refuses a truncated or relabelled one', checkGlb(tinyGlb()) === null && checkGlb(tinyGlb().slice(0, 30)) !== null && checkGlb(new TextEncoder().encode('glTF'.padEnd(40, ' '))) !== null);
    const g1 = s.put(d, 'glb', 'nico', tinyGlb('nico'));
    ok('a forged person is stored by the SHA-256 of its bytes and served at /storykit/f/<sha256>.glb', g1.ok && g1.file.url === `/storykit/f/${sha(tinyGlb('nico'))}.glb` && existsSync(s.blobPath(g1.file.hash, 'glb')), g1.ok ? g1.file.url : g1.error);
    const nope = s.put(d, 'glb', 'dispatch', tinyGlb('x')), ghost = s.put(d, 'glb', 'zed', tinyGlb('x')), notGlb = s.put(d, 'glb', 'rae', ogg('x'));
    ok('a GLB only for someone with a sheet, and only a real GLB', !nope.ok && nope.status === 404 && !ghost.ok && ghost.status === 404 && !notGlb.ok && notGlb.status === 415);
    const big = s.put(d, 'glb', 'rae', tinyGlb('big', LIMITS.glb.each));
    ok(`a GLB over ${LIMITS.glb.each >> 20} MB is refused (413)`, !big.ok && big.status === 413);
    const same = s.put(d, 'glb', 'rae', tinyGlb('nico'));
    ok('the same bytes for two people are one blob', same.ok && (s.db.prepare('SELECT COUNT(*) AS n FROM blobs').get() as any).n === 1);
    const r2 = s.put(d, 'glb', 'rae', tinyGlb('rae'));
    ok('replacing a file keeps the old blob while another name still uses it', r2.ok && existsSync(s.blobPath(g1.ok ? g1.file.hash : '', 'glb')));

    // ── voice clips: only current lines in current voices; one file per line whichever codec
    const plan = voicePlanOf(JSON.parse((s.db.prepare('SELECT pack FROM drafts WHERE id = ?').get(o.id) as { pack: string }).pack), '');
    const [l0, l1] = plan.lines;
    const v0 = s.put(d, 'voice', `${l0.clip}.ogg`, ogg('a'), { secs: '1.5', device: 'webgpu', dtype: 'fp32' });
    ok('a clip for a current line is stored with what the browser measured', v0.ok && /\.ogg$/.test(v0.file.url) && (v0.file.meta as any).secs === 1.5 && (v0.file.meta as any).line === l0.id, v0.ok ? '' : v0.error);
    const stale = s.put(d, 'voice', '00000000-00000000.ogg', ogg('b')), badName = s.put(d, 'voice', '../x.ogg', ogg('b')), fake = s.put(d, 'voice', `${l1.clip}.ogg`, wav('b'));
    ok('a clip for no current line, a bad name or the wrong format is refused', !stale.ok && stale.status === 409 && !badName.ok && badName.status === 400 && !fake.ok && fake.status === 415);
    const v0w = s.put(d, 'voice', `${l0.clip}.wav`, wav('a2'));
    const rows = s.db.prepare("SELECT name FROM files WHERE draft_id = ? AND kind = 'voice'").all(o.id) as { name: string }[];
    ok('a line rendered again as WAV replaces its Ogg, and the Ogg\'s blob goes', v0w.ok && rows.length === 1 && rows[0].name.endsWith('.wav') && v0.ok && !existsSync(s.blobPath(v0.file.hash, 'ogg')));
    s.put(d, 'voice', `${l1.clip}.ogg`, ogg('c'));
    const art = s.put(d, 'art', 'key-wide.jpg', jpg()), head = s.put(d, 'art', 'head-ghost.jpg', jpg());
    ok('key art is stored; a headshot of no one is refused', art.ok && !head.ok && head.status === 404);

    // ── the world the engine plays
    const w = s.world(o.id) as any;
    const drawn = Object.values(w.cast).filter((c: any) => /^\/storykit\/f\/[0-9a-f]{64}\.glb$/.test(c.glb || ''));
    ok('the world draws each stored person from their content-hashed GLB, and the hero is the player', drawn.length === 2 && typeof w.hero === 'string' && !!w.cast[w.hero]?.glb, JSON.stringify(w.hero));
    ok('the world lists each stored clip by URL in its voice plan (no manifest to fetch), and its art', Object.keys(w.voice.clips).length === 2 && Object.values(w.voice.clips).every((c: any) => BLOB_FILE.test(c.url.split('/').pop())) && w.voice.dir === '' && /^\/storykit\/f\//.test(w.art['key-wide']));
    const st = s.status(d);
    ok('the draft\'s status lists what is still missing and when it expires', st.missing.glb.length === 0 && st.missing.voice.length === plan.lines.length - 2 && st.expires === now + LIMITS.ttlMs);

    // ── seal: a frozen, content-hashed world
    const sealed = s.seal(s.auth(o.id, o.token)!);
    const frozen = sealed.ok ? s.read(`${sealed.hash}.json`) : null;
    ok('sealing freezes the world as /storykit/f/<sha256>.json, the same pack', sealed.ok && !!frozen && frozen.type === 'application/json' && JSON.stringify(JSON.parse(frozen.bytes.toString())) === JSON.stringify(s.world(o.id)));
    s.put(s.auth(o.id, o.token)!, 'voice', `${plan.lines[2].clip}.ogg`, ogg('d'));
    ok('a change after sealing unseals it, and the old frozen pack goes', s.auth(o.id, o.token)!.state === 'draft' && sealed.ok && !existsSync(s.blobPath(sealed.hash, 'json')));

    // ── limits
    const saved = LIMITS.voice.total; LIMITS.voice.total = 500;
    const over = s.put(s.auth(o.id, o.token)!, 'voice', `${plan.lines[3].clip}.ogg`, ogg('e', 300));
    LIMITS.voice.total = saved;
    ok('a world\'s clips over their total are refused (413)', !over.ok && over.status === 413);
    process.env.STORYKIT_DISK_MB = String(1 / 1024 / 1024 * 900);   // 900 bytes for the whole store
    const full = s.put(s.auth(o.id, o.token)!, 'voice', `${plan.lines[3].clip}.ogg`, ogg('f', 400)), fullOpen = s.open(NY);
    delete process.env.STORYKIT_DISK_MB;
    ok('a full store refuses new files and new drafts (507)', !full.ok && full.status === 507 && !fullOpen.ok && fullOpen.status === 507);
    // ── the size guard (the owner, 5 Nov): new drafts stop at 90% of the store; drafts already open can still finish
    const at = s.used(), share0 = LIMITS.guardShare;
    process.env.STORYKIT_DISK_MB = String((at + 1000) / (1 << 20));   // the store 1000 bytes bigger than what it holds
    LIMITS.guardShare = at / (at + 1000);                                // and its guard exactly at what it holds
    const guardOpen = s.open(NY), finish = s.put(s.auth(o.id, o.token)!, 'voice', `${plan.lines[3].clip}.ogg`, ogg('g', 200)), u = s.usage();
    LIMITS.guardShare = share0; delete process.env.STORYKIT_DISK_MB;
    ok('at the guard a new draft is refused with a clear message (507), and the build route asks first (storeGuard)',
      !guardOpen.ok && guardOpen.status === 507 && guardOpen.error === STORE_FULL && /nearly full/.test(STORE_FULL) && /storeGuard\(storyStore\(\)\)/.test(R('app/api/generate/route.ts')), guardOpen.ok ? 'opened' : guardOpen.error);
    ok('at the guard a draft already open can still store its files, up to the whole store', finish.ok, finish.ok ? '' : finish.error);
    ok('the usage the owner sees: bytes, disk, guard, files and drafts', u.guarded && u.used === s.used() && u.used > at && u.disk === at + 1000 && u.guard === at && u.share === u.used / u.disk && u.blobs > 0 && u.open >= 1 && u.today >= 1, JSON.stringify(u));
    ok('below the guard nothing is refused; the guard is 90% of STORYKIT_DISK_MB (8,000 MB by default, for the 10 GB disk)', storeGuard(s) === null && LIMITS.guardShare === 0.9 && LIMITS.guard === Math.floor(0.9 * 8000 * (1 << 20)));
    ok('the per-world limits are stated (raised for launch, 7 Nov)', LIMITS.glb.each === 6 << 20 && LIMITS.glb.total === 48 << 20 && LIMITS.voice.each === 2 << 20 && LIMITS.voice.count === 1500 && LIMITS.voice.total === 24 << 20 && LIMITS.world === 64 << 20 && LIMITS.disk === 8000 * (1 << 20));
    ok('a Mog of a showcase may hold what Pickup Time holds, with room to spare (SHOWCASE_LIMITS)', SHOWCASE_LIMITS.glb.total >= 2 * 21_634_560 && SHOWCASE_LIMITS.voice.count >= 2 * 910 && SHOWCASE_LIMITS.voice.total >= 2 * 11_513_215 && SHOWCASE_LIMITS.world >= 2 * (21_634_560 + 11_513_215) && LIMITS.sealed >= 2 * 542_546);

    // ── a Mog: the parent's city locked, unchanged people and lines inherited (same blobs, no bytes)
    ok('a world is kept (published) with its game', s.keep(o.id, 'game-1') && s.auth(o.id, o.token)!.state === 'kept');
    const kept = s.put(s.auth(o.id, o.token)!, 'glb', 'nico', tinyGlb('n2'));
    ok('a kept world is not changed (409)', !kept.ok && kept.status === 409);
    const asMog = (p: any) => ({ ...clone(p), id: `${NY.id}-mog`, parent: NY.id });
    const mog = asMog(NY); mog.cast.find((c: any) => c.id === 'rae').sheet.name = 'Rae Other';   // one person changed
    const blobsBefore = (s.db.prepare('SELECT COUNT(*) AS n FROM blobs').get() as any).n;
    const m = s.open(mog, { parent: o.id });
    const mfiles = m.ok ? (s.db.prepare('SELECT kind, name, hash, inherited FROM files WHERE draft_id = ?').all(m.id) as any[]) : [];
    ok('a Mog inherits its parent\'s unchanged people and lines and no one changed', m.ok && m.inherited > 0 && mfiles.some((f) => f.kind === 'glb' && f.name === 'nico' && f.inherited) && !mfiles.some((f) => f.name === 'rae'), m.ok ? `${m.inherited} inherited` : m.error);
    ok('inheriting stores no bytes', (s.db.prepare('SELECT COUNT(*) AS n FROM blobs').get() as any).n === blobsBefore);
    const moved = asMog(NY); moved.base.city = 'sf';
    const mm = s.open(moved, { parent: o.id });
    ok('a Mog that moves its parent\'s city is refused by the gate', !mm.ok && mm.status === 422);
    const orphanMog = s.open(asMog(NY), { parent: '00000000-0000-0000-0000-000000000000' });
    ok('a Mog of no kept world is refused', !orphanMog.ok && orphanMog.status === 404);

    // ── a Mog of a showcase (the owner, 7 Nov: "DO NOT close Mogs for Pickup Time"): its line leads back to Pickup Time
    // (kept, written as deploy/migrate.mjs writes it), so it gets the showcase's limits and keeps the hand-built bodies
    {
      const PT = gatePack(JSON.parse(R(`storykit/packs/${SHOWCASE_PACKS[0]}.json`)), { showcase: true }).pack!;
      const root = randomUUID(), body = tinyGlb('pt-john');
      s.db.prepare("INSERT INTO drafts (id, token_hash, pack, parent, state, created_at, touched_at) VALUES (?, ?, ?, NULL, 'kept', ?, ?)").run(root, sha('x'), JSON.stringify(PT), now, now);
      const bh = sha(body), bp = s.blobPath(bh, 'glb'); mkdirSync(path.dirname(bp), { recursive: true }); writeFileSync(bp, body);
      s.db.prepare('INSERT OR IGNORE INTO blobs (hash, ext, bytes, at) VALUES (?, ?, ?, ?)').run(bh, 'glb', body.length, now);
      s.db.prepare("INSERT INTO files (draft_id, kind, name, hash, ext, bytes, meta, inherited, at) VALUES (?, 'glb', 'john', ?, 'glb', ?, NULL, 0, ?)").run(root, bh, body.length, now);
      const clip0 = voicePlanOf(PT, '').lines[0].clip, cb = ogg(`pt-${clip0}`), ch = sha(cb), cp = s.blobPath(ch, 'ogg');
      mkdirSync(path.dirname(cp), { recursive: true }); writeFileSync(cp, cb);
      s.db.prepare('INSERT OR IGNORE INTO blobs (hash, ext, bytes, at) VALUES (?, ?, ?, ?)').run(ch, 'ogg', cb.length, now);
      s.db.prepare("INSERT INTO files (draft_id, kind, name, hash, ext, bytes, meta, inherited, at) VALUES (?, 'voice', ?, ?, 'ogg', ?, NULL, 0, ?)").run(root, `${clip0}.ogg`, ch, cb.length, now);
      const mogPT = { ...clone(PT), id: 'pt-check-mog', parent: PT.id, title: 'Pickup Time Again' };
      const pm = s.open(mogPT, { parent: root });
      ok(`a Mog of ${SHOWCASE_PACKS[0]} opens (${PT.acts.flatMap((x: any) => x.missions).length} missions, held to the showcase's limits)`, pm.ok, pm.ok ? '' : `${pm.error} ${((pm as any).problems ?? []).slice(0, 2).join(' | ')}`);
      if (pm.ok) {
        const pf = s.db.prepare("SELECT name, inherited FROM files WHERE draft_id = ? AND kind = 'glb'").all(pm.id) as any[];
        const pv = s.db.prepare("SELECT name, inherited FROM files WHERE draft_id = ? AND kind = 'voice'").all(pm.id) as any[];
        ok('it keeps a hand-built body its original has (same model: same blob, no bytes)', pf.some((f) => f.name === 'john' && f.inherited));
        ok(`it keeps its original's voiced lines (its voice plan lists all ${voicePlanOf(PT, '').lines.length} of the showcase's)`, pv.some((f) => f.name === `${clip0}.ogg` && f.inherited) && voicePlanOf(JSON.parse((s.db.prepare('SELECT pack FROM drafts WHERE id = ?').get(pm.id) as any).pack), '').lines.length === voicePlanOf(PT, '').lines.length);
        ok('its limits are the showcase\'s, a Create\'s are not', s.showcaseLine(pm.id) && s.limitsOf(pm.id) === SHOWCASE_LIMITS && s.limitsOf(o.id) === LIMITS);
        const pd = s.auth(pm.id, pm.token)!, deep = s.open({ ...clone(mogPT), id: 'pt-check-mog-2', parent: 'pt-check-mog', title: 'Pickup Time Thrice' }, { parent: (s.keep(pd.id, 'game-pt-mog'), pm.id) });
        ok('a Mog of that Mog is in the line too', deep.ok && s.limitsOf(deep.id) === SHOWCASE_LIMITS, deep.ok ? '' : `${deep.error} ${((deep as any).problems ?? []).slice(0, 2).join(' | ')}`);
        if (deep.ok) s.abandon(s.auth(deep.id, deep.token)!);
        s.release(pm.id); s.abandon(s.auth(pm.id, pm.token)!);
      }
      const fake = s.open({ ...clone(NY), id: SHOWCASE_PACKS[0] });
      ok('no Create opens under a showcase\'s id', !fake.ok && fake.status === 422);
      s.db.prepare('DELETE FROM drafts WHERE id = ?').run(root);
    }

    // ── cleanup: abandon now, or untouched for the TTL; kept worlds stay
    const a = s.open(NY); const ad = a.ok ? s.auth(a.id, a.token)! : null;
    const ag = ad ? s.put(ad, 'glb', 'rae', tinyGlb('only-a')) : null;
    const ab = ad ? s.abandon(ad) : null;
    ok('abandoning a draft frees what only it used', !!ab && ab.ok && ab.freed > 0 && !!ag && ag.ok && !existsSync(s.blobPath(ag.file.hash, 'glb')));
    now += LIMITS.ttlMs + 60_000;
    const sw = s.sweep(true);
    const left = s.db.prepare('SELECT id, state FROM drafts').all() as any[];
    ok('the sweep removes drafts untouched for the TTL and keeps the published world', sw.drafts >= 1 && left.length === 1 && left[0].id === o.id && left[0].state === 'kept', JSON.stringify({ sw, left }));
    const files = (s.db.prepare('SELECT hash, ext FROM blobs').all() as any[]);
    const onDisk = readdirSync(path.join(root, 'blobs')).flatMap((dd) => readdirSync(path.join(root, 'blobs', dd)));
    ok('every blob left is used by a draft, and the disk holds exactly the blobs', files.every((f) => s.db.prepare('SELECT 1 FROM files WHERE hash = ?').get(f.hash)) && onDisk.length === files.length && !onDisk.some((f) => f.endsWith('.tmp')));
    const released = s.release(o.id); now += LIMITS.ttlMs + 1;
    ok('a release hands a world back to the sweep', released && s.sweep(true).drafts === 1 && s.used() === 0);
    ok('read() serves only stored blobs by exact name', s.read('x.glb') === null && s.read(`${'a'.repeat(64)}.glb`) === null);

    // ── a body over its limit is cut, whatever length it states
    const stream = new Request('http://127.0.0.1/x', { method: 'PUT', body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(600)); c.enqueue(new Uint8Array(600)); c.close(); } }), duplex: 'half' } as any);
    ok('an upload past its limit is cut off while it streams', (await readCapped(stream, 1000)) === null && (await readCapped(new Request('http://127.0.0.1/x', { method: 'PUT', body: new Uint8Array(10) }), 1000))?.length === 10);
  } finally {
    s.db.close(); rmSync(root, { recursive: true, force: true });
  }

  // ── the routes: all behind the switch; the dev-only voice route is gone
  const routes = ['app/api/storykit/drafts/route.ts', 'app/api/storykit/drafts/[id]/route.ts', 'app/api/storykit/drafts/[id]/pack/route.ts', 'app/api/storykit/drafts/[id]/seal/route.ts', 'app/api/storykit/drafts/[id]/files/[kind]/[name]/route.ts', 'app/storykit/f/[file]/route.ts'];
  ok('every Story Kit store route exists and answers only with STORYKIT=on (or owner: lib/storykit-switch.ts)', routes.every((r) => existsSync(r) && /storykitOff\(req[,)]|storykitOn\(\)/.test(R(r))));
  ok('the dev-only PUT /api/storykit/voice is replaced by the per-draft upload', !existsSync('app/api/storykit/voice/route.ts') && !/\/api\/storykit\/voice\b/.test(R('storykit/voices/studio.js')) && /authorization: `Bearer \$\{token\}`/.test(R('storykit/voices/studio.js')));
  ok('a stored file is served immutable for a year, by its hash', /max-age=31536000, immutable/.test(R('app/storykit/f/[file]/route.ts')) && /etag/.test(R('app/storykit/f/[file]/route.ts')));
  ok('a stored file is streamed from the disk, never read whole (createReadStream, its length from stat)', /createReadStream\(b\.path\)/.test(R('app/storykit/f/[file]/route.ts')) && /storyStore\(\)\.stat\(file\)/.test(R('app/storykit/f/[file]/route.ts')) && !/\.read\(file\)/.test(R('app/storykit/f/[file]/route.ts')));
  ok('the store lives on the Render disk (data/), never committed', /mountPath: \/opt\/render\/project\/src\/data/.test(R('render.yaml')) && /^data\/storykit\/$/m.test(R('.gitignore')));

  runGplChecks(ok);
}

/** The GPL phonemizer: unmodified, with its licence, its source offer and the credits; none of it in GameMog's code. */
export function runGplChecks(ok: Ok) {
  console.log('\nStory Kit: the GPL phonemizer (public/storykit/vendor/gpl)');
  const G = 'public/storykit/vendor/gpl', SHA = '193481f474f7c1ea81df3195d18b45df8ef7254dbdccb3f193d60215c4897bec';
  const file = path.join(G, 'phonemizer.js');
  ok('phonemizer.js is served unmodified (npm phonemizer 1.2.1, the recorded SHA-256)', existsSync(file) && sha(readFileSync(file)) === SHA);
  const tracked = spawnSync('git', ['check-ignore', '-q', file]).status !== 0;
  ok('vendor/gpl is not ignored by git (it is served with the site)', tracked);
  const copying = existsSync(path.join(G, 'COPYING')) ? R(path.join(G, 'COPYING')) : '';
  ok('its GPL-3.0 text is beside it, complete', /GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/.test(copying) && /END OF TERMS AND CONDITIONS/.test(copying) && copying.length > 34000);
  const src = existsSync(path.join(G, 'SOURCE.md')) ? R(path.join(G, 'SOURCE.md')) : '';
  ok('its source offer names the file\'s hash and npm integrity, both sources, the build and the offer', src.includes(SHA) && src.includes('sha512-v0KJ4mi2T4Q7eJQ0W15Xd4G9k4kICSXE8bpDeJ8jisL4RyJhNWsweKTOi88QXFc4r4LZlz5jVL5lCHhkpdT71A==')
    && src.includes('https://github.com/xenova/phonemizer.js/tree/1.2.1') && src.includes('https://github.com/espeak-ng/espeak-ng') && /Build notes/.test(src) && /6\(d\)/.test(src) && /three years/.test(src));
  const idx = existsSync(path.join(G, 'index.html')) ? R(path.join(G, 'index.html')) : '';
  ok('/storykit/vendor/gpl/ lists the file, its licence and its source', ['href="phonemizer.js"', 'href="COPYING"', 'href="SOURCE.md"'].every((h) => idx.includes(h)) && /'\/storykit\/vendor\/gpl'/.test(R('next.config.ts')));
  ok('the work page (where the voices are made), the voice studio and CREDITS.md credit it as GPL-3.0 with the link', /href="\/storykit\/vendor\/gpl\/"[^>]*>GPL-3\.0/.test(R('public/storykit/work.html')) && /href="\/storykit\/vendor\/gpl\/"/.test(R('storykit/voices/studio.html')) && /GPL-3\.0-or-later/.test(R('public/storykit/CREDITS.md')));

  // none of eSpeak NG in GameMog's own code: every script we write or bundle, outside vendor/ and the model files
  const CODE = /\.(m?js|ts|tsx|html)$/, MARK = /eSpeakNGWorker|espeak_EVENT|espeak-ng-data|_emscripten_bind_eSpeak/;
  const skip = (p: string) => p === 'scripts/storykit-store-check.ts' || /(^|\/)(node_modules|\.next|\.scratch|\.git|data)(\/|$)/.test(p) || p.startsWith('public/storykit/vendor') || p.startsWith('public/storykit/kokoro');
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const p = path.join(dir, e); if (skip(p)) continue;
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p);
      else if (CODE.test(e) && st.size < 40 << 20 && MARK.test(readFileSync(p, 'latin1'))) hits.push(p);
    }
  };
  for (const d of ['app', 'lib', 'storykit', 'scripts', 'public']) if (existsSync(d)) walk(d);
  ok('no GameMog script or bundle contains eSpeak NG (the forge bundle, the engine, the voice pass ...)', hits.length === 0, hits.join(' '));
  const pass = R('storykit/voices/browser-voice-pass.js');
  const statics = [...pass.matchAll(/^\s*import\s[^;]*from\s*['"]([^'"]+)['"]/gm)].map((x) => x[1]);
  ok('the voice pass loads the phonemizer only as its own file, by a dynamic import of vendor/gpl', /await import\(.*'gpl\/phonemizer\.js'\)/.test(pass) && !statics.some((x) => /phonemizer/.test(x)));
  // the model and its runtime come from their publishers (no copy of ours on the server); the studio's CSP allows them
  const cfg = R('next.config.ts');
  ok('the voice pass downloads Kokoro from Hugging Face at the pinned revision, its runtime from jsDelivr at 3.8.1, and only the GPL file from here',
    /MODEL_HUB = `https:\/\/huggingface\.co\/onnx-community\/Kokoro-82M-v1\.0-ONNX\/resolve\/\$\{KOKORO_REVISION\}\/`/.test(pass) && /KOKORO_REVISION = '1939ad2a8e416c0acfeecc08a694d14ef25f2231'/.test(pass)
    && /RUNTIME_CDN = 'https:\/\/cdn\.jsdelivr\.net\/npm\/@huggingface\/transformers@3\.8\.1\/dist\/'/.test(pass) && /modelBase: MODEL_HUB, vendorBase: RUNTIME_CDN, gplBase: '\/storykit\/vendor\/'/.test(pass));
  ok("the voice studio's CSP allows huggingface.co, its CDN (*.hf.co) and jsDelivr",
    /source: '\/storykit\/voices\/:path\*'.*STUDIO_CSP/.test(cfg) && ['https://huggingface.co', 'https://*.hf.co', 'https://cdn.jsdelivr.net', "'wasm-unsafe-eval'"].every((h) => cfg.includes(h)));
  const pkg = JSON.parse(R('package.json'));
  ok('no npm dependency brings eSpeak NG into the build (phonemizer, kokoro-js)', !['phonemizer', 'kokoro-js'].some((n) => pkg.dependencies?.[n] || pkg.devDependencies?.[n]));
}
