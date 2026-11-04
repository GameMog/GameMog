/**
 * Mog City episodes, the offline half (3 Nov 2026; MogCity .scratch/moggable/PLAN.md 4.9). Part of `npm run check`:
 * the schema copy against Mog City's own and its pinned SHA-256, the kind (read from its module, Mog-only, kind-locked,
 * dark until EPISODE_MOGS=on), the gate on good and bad packs (schema, size, shape), the words judged on changed texts
 * only (the platform's blocked words, the never-mention hashes), the consent rules for real people and brands, the
 * manual's chapter against the schema, and the first-party world. The end-to-end half is in scripts/platform-check.ts.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import * as E from '../lib/episode.ts';
import { SCHEMA, validatePack, MEN } from '../lib/episode/schema.js';
import { worldMode, canMog, MOGGABLE, staticCheckWorld, worldControls } from '../lib/custom-game.ts';
import { dna, compareDna } from '../lib/mog-dna.ts';
import { parseEpisodeReply, episodeMeta, episodeTurn } from '../lib/episode-build.ts';
import { episodeVerdict } from '../lib/test-drive.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const R = (p: string) => readFileSync(p, 'utf8');
const rot13 = (s: string) => s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));
type Pack = E.EpisodePack;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** A Mog City checkout to compare the copy with: MOGCITY_DIR, or one beside this repo (the owner's Mac keeps it in the main checkout). */
function mogCityDir(): string | null {
  for (const d of [process.env.MOGCITY_DIR, 'MogCity', '../GameMog/MogCity'].filter((x): x is string => !!x)) if (existsSync(join(d, 'wagmi', 'story', 'schema.js'))) return d;
  return null;
}

export function runEpisodeChecks(ok: Ok) {
  console.log('\nMog City episodes: the schema copy (lib/episode/schema.js)');
  const copy = R('lib/episode/schema.js'), at = copy.indexOf(E.SCHEMA_MARK), body = at < 0 ? '' : copy.slice(at + E.SCHEMA_MARK.length);
  ok('the copy names its source and version in its header, and below it is the pinned file byte for byte (SHA-256)', at > 0 && /wagmi\/story\/schema\.js, schema version 1/.test(copy.slice(0, at)) && sha(body) === E.SCHEMA_SHA, sha(body));
  const mc = mogCityDir();
  if (mc) {
    ok(`the copy is identical to Mog City's wagmi/story/schema.js (${mc})`, body === R(join(mc, 'wagmi', 'story', 'schema.js')));
    ok('the default pack and its limits are identical to Mog City\'s assets/story/default.json and limits.json',
      R('lib/episode/default.json') === R(join(mc, 'assets', 'story', 'default.json')) && R('lib/episode/limits.json') === R(join(mc, 'assets', 'story', 'limits.json')));
  } else console.log('  NOT RUN  the copy against Mog City\'s own files: no Mog City checkout found (MOGCITY_DIR)');

  console.log('\nMog City episodes: the kind');
  const world = R('worlds/mog-city.js'), base = E.episodeBase().pack, kart = R('worlds/aspen-gp.js'), gp = R('worlds/artificial1.js');
  ok('the first-party Mog City is one GameMog.world({ episode: <the default pack> }) call, and the episode kind is read from it', E.isEpisodeWorld(world) && worldMode(world) === 'episode' && world === E.episodeModule(base));
  ok('no other first-party world is an episode, and the kinds of the others read as before', ['aspen-gp.js', 'artificial1.js', 'shootout.js', 'zombie-beach.js', 'mog-derby.js', 'roadrace.js'].every((f) => !E.isEpisodeWorld(R(`worlds/${f}`)))
    && worldMode(kart) === 'kart' && worldMode(gp) === 'gp' && worldMode(R('worlds/shootout.js')) === 'shootout' && worldMode(R('worlds/roadrace.js')) === 'race');
  ok('a world module that only mentions an episode inside it is not one', !E.isEpisodeWorld("GameMog.world({ track: {}, episode: 2, build(ctx) {} })") && !E.isEpisodeWorld('// episode: {\nGameMog.world({ episode: {} })'));
  ok('a stored row reads its kind from meta.mode when it has no code', worldMode(null, { mode: 'episode' }) === 'episode');
  ok('its page reads as an episode, with Mog City\'s own controls', worldControls(world) === E.EPISODE_CONTROLS && /Hold Space to skip a cutscene/.test(E.EPISODE_CONTROLS));
  const env = process.env.EPISODE_MOGS;
  delete process.env.EPISODE_MOGS;
  const dark = !MOGGABLE.episode && !canMog({ format: 'world', code: world, meta: null }) && canMog({ format: 'world', code: kart, meta: null });
  process.env.EPISODE_MOGS = 'on';
  const lit = MOGGABLE.episode && canMog({ format: 'world', code: world, meta: null });
  if (env === undefined) delete process.env.EPISODE_MOGS; else process.env.EPISODE_MOGS = env;
  ok('it deploys dark: an episode cannot be mogged until EPISODE_MOGS=on, which opens it without a new build; every other kind is unchanged', dark && lit);
  const mogOf = (code: string) => ({ parent: { format: 'world', code, meta: null } });
  ok('an episode is made only as a Mog of one, and a Mog of one stays one (a Create or a Mog of another kind that writes one is sent back)',
    E.episodeKindProblems(world).length === 1 && E.episodeKindProblems(world, mogOf(kart)).length === 1 && E.episodeKindProblems(kart, mogOf(world)).length === 1
      && E.episodeKindProblems(world, mogOf(world)).length === 0 && E.episodeKindProblems(kart, mogOf(kart)).length === 0);
  ok('the static check of an episode is the episode\'s own (no runtime rules), and the default passes it', staticCheckWorld(world).length === 0 && E.checkEpisode(world).length === 0);

  console.log('\nMog City episodes: the gate on good and bad packs');
  const mod = (f: (p: Pack) => void) => { const p = clone(base); f(p); return E.episodeModule(p); };
  const v = (f: (p: Pack) => void) => { const p = clone(base); f(p); return (validatePack(p, base, E.episodeBase().limits) as { ok: boolean; errors: string[] }); };
  const firstLine = Object.keys(base.lines)[0], firstCopy = Object.keys(base.copy)[0];
  const good = mod((p) => { p.title.episode = 'Night Shift'; p.cast.jane.name = 'Rosa'; p.names.bank = 'Harbor Trust'; p.car.paint = '#204080'; p.difficulty.enemyHp = 1.3; });
  ok('a pack with a new title, a renamed character, a renamed bank, a new paint and harder fights passes', E.checkEpisode(good).length === 0, E.checkEpisode(good).join(' | '));
  const bad: [string, (p: Pack) => void][] = [
    ['a line taken out', (p) => { delete p.lines[firstLine]; }],
    ['a line added', (p) => { p.lines['new-line-here'] = ['dan', 'Hello.']; }],
    ['a line given to another speaker', (p) => { p.lines[firstLine] = ['jane', p.lines[firstLine][1]]; }],
    ['a line past its limit', (p) => { p.lines[firstLine] = [p.lines[firstLine][0], 'x'.repeat(219)]; }],
    ['markup in a line', (p) => { p.lines[firstLine] = [p.lines[firstLine][0], '<b>hi</b>']; }],
    ['an unknown token', (p) => { p.copy[firstCopy] = 'Hi {nobody}'; }],
    ['a zero-width character', (p) => { p.cast.dan.name = 'Da​n'; }],
    ['the Suits\' bodies not a permutation', (p) => { p.cast.knox.body = 'hooks'; }],
    ['a difficulty out of range', (p) => { p.difficulty.heroHp = 999; }],
    ['an unknown key', (p) => { (p as unknown as Record<string, unknown>).script = 'x'; }],
    ['another base', (p) => { p.base = 'mog-city@2'; }],
  ];
  const missed = bad.filter(([, f]) => v(f).ok).map(([n]) => n);
  ok(`validatePack refuses each of ${bad.length} bad packs (and the gate with it)`, !missed.length && bad.every(([, f]) => E.checkEpisode(mod(f)).length > 0), missed.join(', '));
  ok('the module\'s shape is exact: code around the pack, a second call or non-JSON is refused', E.checkEpisode(world.replace('});', '}); alert(1);')).length === 1
    && E.checkEpisode(world.replace('"pack":1', "'pack':1")).length === 1 && E.checkEpisode('GameMog.world({ episode: {}, kart: {} });').length === 1);
  ok(`the size limit (${E.EPISODE_MAX / 1000} KB): the default is ${Math.round(world.length / 1000)} KB, and a module over the limit is refused`, world.length < E.EPISODE_MAX * 0.5 && E.checkEpisode(world + ' '.repeat(E.EPISODE_MAX)).some((x) => /keep it under/.test(x)));
  const st = E.storyOf(world)!;
  ok('the story the routes serve is the pack as compact JSON, its hash the SHA-256 of that text', st.text === JSON.stringify(base) && st.hash === sha(st.text) && E.storyOf(E.episodeModule(JSON.parse(st.text)))!.hash === st.hash);
  ok('the title is always MOG CITY: <its title>', E.episodeTitle(base) === 'MOG CITY: Unfinished Business');

  console.log('\nMog City episodes: words, on changed texts only');
  const slur = rot13('shpx');
  const parentWith = clone(base); parentWith.lines[firstLine] = [parentWith.lines[firstLine][0], `well ${slur} that`];
  const kept = clone(parentWith), changedBad = clone(parentWith); changedBad.cast.jane.name = `Jane ${slur}`;
  ok('a changed text with a blocked word is sent back; the same word inherited from the parent is not judged again',
    E.wordProblems(E.changedStrings(changedBad, parentWith)).length === 1 && E.wordProblems(E.changedStrings(kept, parentWith)).length === 0);
  const rn = clone(base); rn.cast.jane.name = 'Rosa';
  const ch = E.changedStrings(rn, base);
  ok('a rename by its token is one changed text (the name), not every line that says it', ch.length === 1 && ch[0].at === '/cast/jane/name');
  const test = [sha('zorblax'), sha('red fox'), sha('redfox')];
  ok('the never-mention list matches a word, a phrase and the phrase run together, in any case or leetspeak, and nothing else',
    E.neverMentioned('Meet ZORBLAX today', test) && E.neverMentioned('the Red  Fox!', test) && E.neverMentioned('redfox', test) && E.neverMentioned('z0rbl4x', test) && !E.neverMentioned('zorblaxes and red foxes', test));
  ok('the never-mention list is held as 9 SHA-256 hashes (no plaintext), and the default pack mentions none of it',
    E.NEVER_HASHES.length === 9 && E.NEVER_HASHES.every((h) => /^[0-9a-f]{64}$/.test(h)) && !E.neverMentioned(JSON.stringify(base)));
  const res = clone(base); res.cast.mack.name = 'GameMog Admin';
  ok('a cast name that reads as GameMog\'s own is sent back', E.wordProblems(E.changedStrings(res, base)).some((x) => /GameMog's own/.test(x)));

  console.log('\nMog City episodes: real people and brands (the consent step)');
  const c = E.readConsent({ names: ['Elon Musk'], basis: 'permission', adult: true });
  ok('the consent is read for what it must be: names (1 to 3), a basis and the adult and not-defamatory confirmation',
    c.ok && c.consent?.names[0] === 'Elon Musk' && E.readConsent(null).ok && !E.readConsent({ names: [], basis: 'self', adult: true }).ok
      && !E.readConsent({ names: ['A B', 'C D', 'E F', 'G H'], basis: 'self', adult: true }).ok && !E.readConsent({ names: ['Pat Doe'], basis: 'maybe', adult: true }).ok
      && !E.readConsent({ names: ['Pat Doe'], basis: 'self' }).ok && !E.readConsent({ names: ['<b>x</b>'], basis: 'self', adult: true }).ok);
  const consent = c.ok ? c.consent : null;
  ok('a consented person passes, by full name or part of it; public figures included', E.realNameProblems({ people: ['Elon Musk', 'Musk'], brands: [] }, consent).length === 0);
  ok('a real person not in the consent is sent back, and with no consent every real person is', E.realNameProblems({ people: ['Taylor Swift'], brands: [] }, consent).length === 1 && E.realNameProblems({ people: ['Elon Musk'], brands: [] }, null).length === 1);
  ok('a real brand is always sent back, consent or not', E.realNameProblems({ people: [], brands: ['Goldman Sachs'] }, consent).length === 1);
  ok('the check\'s reply is read for what it must be', JSON.stringify(E.readNamesCheck('Here: {"people": ["A B"], "brands": []}')) === '{"people":["A B"],"brands":[]}' && E.readNamesCheck('none') === null);
  ok('the consent is the platform\'s record: kept in the game\'s meta without the creator\'s browser id', JSON.stringify(episodeMeta(base, { tagline: 'tt', blurb: 'bbbbbbbbbbbb' }, consent)).includes('"consent":{"names":["Elon Musk"],"basis":"permission","adult":true')
    && !('player' in (consent as object)));
  const turn = episodeTurn({ parent: { title: 'MOG CITY: X', generation: 0, tagline: 't', code: world, mog_prompt: null } as never, instruction: 'rename Jane' }, consent);
  ok('the builder hears whom the consent covers, and nobody else may be named', turn.includes('"Elon Musk"') && episodeTurn({ parent: { title: 'X', generation: 0, tagline: 't', code: world, mog_prompt: null } as never, instruction: 'x' }, null).includes('no real person may be named'));

  console.log('\nMog City episodes: the reply, the manual, the DNA, the drive');
  const reply = '```json\n{"tagline":"A new night.","blurb":"Rosa runs the show tonight.","people":[],"brands":[]}\n```\n\n```json\n' + JSON.stringify(base) + '\n```';
  const pr = parseEpisodeReply(reply);
  ok('a reply is read as its meta block and its pack block', !pr.problems.length && !!pr.pack && pr.meta?.tagline === 'A new night.' && parseEpisodeReply('no blocks').problems.length > 0);
  const api = R('lib/runtime/API.md'), a = api.indexOf('## Mog City episodes\n'), chapter = api.slice(a, api.indexOf('\n## ', a + 5));
  const S = SCHEMA as { required: string[]; properties: Record<string, { properties?: Record<string, unknown> }>; $defs: Record<string, { properties?: Record<string, { properties?: Record<string, unknown> }> }> };
  const keys = [...S.required, ...Object.keys(S.properties.cast.properties!), ...Object.keys(S.properties.names.properties!), ...Object.keys(S.properties.difficulty.properties!),
    ...Object.keys(S.$defs.suit.properties!.look.properties!), ...Object.keys(S.$defs.person.properties!.look.properties!), ...Object.keys(S.$defs.voice.properties!), 'fur', 'body', ...MEN];
  const missing = [...new Set(keys)].filter((k) => !new RegExp(`\\b${k}\\b`).test(chapter));
  const camel = [...new Set(chapter.match(/\b[a-z]+[A-Z][A-Za-z]*\b/g) ?? [])].filter((w) => !keys.includes(w));
  ok('the manual\'s "Mog City episodes" chapter names every key of the schema, and no key the schema lacks', a > 0 && !missing.length && !camel.length, [...missing, ...camel].join(', '));
  const d = dna(world), m = dna(good);
  ok('an episode\'s DNA is its pack\'s (title, cast, what it rewrote), and a Mog of one that turns into another kind is sent back', d.kind === 'episode' && d.episode?.title === 'Unfinished Business' && d.episode.kept === Object.keys(base.lines).length && m.episode?.cast.jane === 'Rosa'
    && compareDna(world, kart, 'make it a kart race').dropped.some((x) => x.key === 'kind') && compareDna(world, good, 'rename Jane').dropped.length === 0);
  ok('the drive passes only when Mog City reports exactly this pack loaded; anything else is unverified, never sent back',
    episodeVerdict({ ready: true, story: { ok: true, id: 'x', hash: st.hash } }, st.hash).ran === true && episodeVerdict({ ready: true, story: { ok: true, id: 'x', hash: st.hash } }, st.hash).ok
      && episodeVerdict({ ready: true, story: { ok: true, id: 'default', hash: 'a'.repeat(64) } }, st.hash).ran === false && episodeVerdict({ timedOut: true }, st.hash).problems.length === 0);
}
