/**
 * Story Kit: the cast registry (public/storykit/cast/registry.json, storykit/cast/README.md). Part of `npm run check`:
 * every shipped body and clip pack is on disk at its size (for the creator's browser's headshots), every recorded line is
 * in the manifest (Mog City plays its own recordings; GameMog keeps only their list), every seed sheet is a valid Character Forge sheet,
 * every voice block passes the voice lint, and the gate's rules for shipped people and pets hold (a model as it is, a
 * model with a sheet refused, a Suit never seated, a Mog's forged replacement from the registry's anchor, recorded
 * lines by their words in the unchanged voice, a pet that follows the hero).
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { gatePack, toRunnerPack } from '../storykit/pack/gate.ts';
import { voicePlanOf } from '../storykit/pack/runner.ts';
import { MODELS, seedSheet, nearVoice, recordedLines } from '../storykit/pack/registry.ts';
import { Validator } from '../storykit/pack/validate.ts';
import { lintVoiceBlock } from '../storykit/voices/voice-design.js';
import FORGE from './forge/character-sheet.schema.json' with { type: 'json' };

type Ok = (name: string, cond: boolean, detail?: string) => void;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export function runCastRegistryChecks(ok: Ok) {
  console.log('\nStory Kit: the cast registry (shipped people and pets)');
  const pub = (p: string) => `public/storykit/${p}`;
  const people = Object.entries(MODELS).filter(([, m]) => m.kind === 'person');
  ok(`every shipped body is on disk at its registry size (${people.length} people)`, people.every(([, m]) => existsSync(pub(m.glb!)) && statSync(pub(m.glb!)).size === (m as any).bytes),
    people.filter(([, m]) => !existsSync(pub(m.glb!)) || statSync(pub(m.glb!)).size !== (m as any).bytes).map(([k]) => k).join(' '));
  ok('every Suit\'s clip pack is on disk', people.filter(([, m]) => m.rig === 'suit').every(([, m]) => existsSync(pub(m.clips!.from))));
  const glbs = new Set(people.map(([, m]) => m.glb)), bytes = [...glbs].reduce((s, g) => s + statSync(pub(g!)).size, 0);
  ok('the shipped bodies stay small enough to serve (each under 5.5 MB, all under 20 MB)', [...glbs].every((g) => statSync(pub(g!)).size < 5.5e6) && bytes < 20e6, `${(bytes / 1e6).toFixed(1)} MB`);
  const rec = Object.keys(MODELS).flatMap((k) => recordedLines(k));
  ok(`every recorded line is listed with its file and length (${rec.length} lines; the recordings are Mog City's own)`, rec.length > 400 && rec.every((l) => typeof l.file === 'string' && l.file.length > 4 && l.dur > 0));
  ok('the credits are beside the shipped files', existsSync(pub('cast/mogcity/CREDITS.md')));
  const v = new Validator([FORGE as any]);
  const bad = Object.keys(MODELS).filter((k) => MODELS[k].kind === 'person').filter((k) => { const s = seedSheet(k); return !s || v.check((FORGE as any).$id, s).problems.length; });
  ok('every shipped person has a seed sheet the Character Forge takes, speaking in their voice', !bad.length && people.every(([k]) => seedSheet(k)!.voice.id === nearVoice(k).id), bad.join(' '));
  ok('every registry voice passes the voice lint, ids unique', Object.values(MODELS).filter((m) => m.voice).every((m) => { const n = m.voice!.near; const base = n.kokoro || Object.keys(n.blend).sort((a, b) => n.blend[b] - n.blend[a])[0]; return !lintVoiceBlock({ ...n, base, blend: n.blend || { [base]: 1 } }).problems.length; })
    && new Set(Object.values(MODELS).filter((m) => m.voice).map((m) => m.voice!.near.id)).size === Object.values(MODELS).filter((m) => m.voice).length);

  // the gate
  const P = JSON.parse(readFileSync('storykit/packs/test-mogcity-cast.json', 'utf8'));
  const g = gatePack(P);
  ok('a pack of shipped people passes; their anchor, voice, name and role are the registry\'s', g.ok && g.pack.cast.every((c: any) => c.anchor === MODELS[c.model].anchor && c.voice.id === MODELS[c.model].voice!.near.id && c.name === MODELS[c.model].name), g.problems.join(' | '));
  const runner = g.ok ? toRunnerPack(g.pack) : null;
  ok('the runner\'s pack draws each shipped person with their own GLB, the hero included, and the dog as a pet that follows',
    !!runner && runner.cast['Mr. Big']?.glb === 'cast/mogcity/mrbig.glb' && runner.cast.Knox?.model === 'mogcity/suit-knox' && runner.hero === 'Dan' && runner.cast.Moon?.pet?.follows === true && runner.cast.Moon.pet.model === 'mogcity/moon');
  const plan = g.ok ? voicePlanOf(g.pack) : null, recd = plan?.lines.filter((l: any) => l.rec) || [];
  ok('a line in a shipped voice with a shipped line\'s words plays its recording; a changed line is rendered', recd.length === 2 && recd.every((l: any) => /^cast\/mogcity\/voice\/[a-z0-9-]+\.m4a$/.test(l.rec)) && plan!.lines.length === 3, recd.map((l: any) => l.recId).join(' '));
  { const p = clone(P); p.cast[0].voice = { id: 'dan-new', kokoro: 'am_puck', description: 'a young man, bright and quick' }; const r = gatePack(p);
    ok('a shipped person given another voice keeps the body and loses the recordings (all lines rendered)', r.ok && voicePlanOf(r.pack).lines.filter((l: any) => l.who === 'Dan' && l.rec).length === 0, r.problems.join(' | ')); }
  { const p = clone(P); p.cast[1].name = 'Jo'; p.acts[0].missions[0].steps[3].shots[0].line = 'Your face is on four front pages today. Moon\'s jealous.'; const r = gatePack(p);
    ok('a rename keeps the body and the recordings of lines that still say the same', r.ok && toRunnerPack(r.pack).cast.Jo?.glb === 'cast/mogcity/jane.glb' && voicePlanOf(r.pack).lines.some((l: any) => l.who === 'Jo' && l.rec), r.problems.join(' | ')); }
  // a hand-built person (registry built: 'hand', not Mog City's own): any story's hero, drawn as a forged person from the
  // world's stored copy of their GLB (or the registry's file), never with a model key (the runner reads one as Dan)
  { const hand = Object.keys(MODELS).filter((k) => MODELS[k].built === 'hand');
    ok(`every hand-built person can be the hero, walk, talk, drive and fight, with no recorded lines (${hand.join(' ')})`, hand.length > 0 && hand.every((k) => ['hero', 'walk', 'talk', 'drive', 'fight'].every((x) => MODELS[k].can.includes(x)) && !MODELS[k].voice?.recorded && MODELS[k].rig === 'cast66' && statSync(pub(MODELS[k].glb!)).size <= 3 * (1 << 20)));
    const p = clone(P); p.cast.push({ id: 'mateo', model: 'hand/young-hero', color: '#D9A35B' }); p.hero = 'mateo'; p.pets[0].owner = 'mateo'; const r = gatePack(p);
    const run = r.ok ? toRunnerPack(r.pack) : null, stored = r.ok ? toRunnerPack(r.pack, { cast: { mateo: '/storykit/f/' + 'a'.repeat(64) + '.glb' } }) : null;
    ok('a hand-built hero passes and plays as a forged body (its GLB, the clip pack\'s idle and walk, no model key)', !!run && run.hero === 'Mateo' && run.cast.Mateo?.glb === MODELS['hand/young-hero'].glb && !run.cast.Mateo.model && run.cast.Mateo.walk === 'walkCool'
      && stored!.cast.Mateo.glb === '/storykit/f/' + 'a'.repeat(64) + '.glb' && run.cast.Dan?.model === 'mogcity/dan', r.problems.join(' | ')); }
  const refuse = (name: string, edit: (p: any) => void, re: RegExp) => { const p = clone(P); edit(p); const r = gatePack(p); ok(`refused: ${name}`, !r.ok && r.problems.some((x) => re.test(x)), r.problems.join(' | ') || 'passed'); };
  refuse('a shipped person with a sheet too', (p) => { p.cast[2].sheet = seedSheet('mogcity/mrbig', 'mrbig'); }, /shipped body as it is, so it has no sheet/);
  refuse('a model not in the registry', (p) => { p.cast[2].model = 'mogcity/nobody'; }, /model/);
  refuse('a Suit as a passenger (no seated clips)', (p) => { p.acts[0].missions[0].steps.push({ type: 'passenger', who: 'knox', seat: 'rear' }); }, /can't ride as a passenger/);
  refuse('a Suit as the hero', (p) => { p.hero = 'knox'; p.pets[0].owner = 'knox'; }, /can't be the player/);
  refuse('a pet that follows someone other than the hero', (p) => { p.pets[0].owner = 'jane'; }, /follows stays with the player/);
  refuse('a name and role on a sheet person (the sheet carries its own)', (p) => { p.cast[2] = { id: 'mrbig', color: '#C9A646', anchor: 'old-boss', name: 'Mr. Big', voice: nearVoice('mogcity/mrbig'), sheet: seedSheet('mogcity/mrbig', 'mrbig') }; }, /name and role are a model person's/);
  // a Mog that changes a shipped person: a forged sheet from their seed, the registry's anchor
  { const parent = g.pack, p = clone(parent); p.id = 'moons-walk-xmas'; p.parent = parent.id;
    const seed = seedSheet('mogcity/mrbig', 'mrbig'); seed.wardrobe.top.color = '#7A1F2B';
    p.cast[2] = { id: 'mrbig', color: '#C9A646', anchor: 'old-boss', voice: nearVoice('mogcity/mrbig'), sheet: seed };
    const r = gatePack(p, { parent });
    ok('a Mog that reskins a shipped person replaces them with a sheet from their seed and anchor (no warning)', r.ok && !r.warnings.length, r.problems.concat(r.warnings).join(' | '));
    p.cast[2].anchor = 'chef'; const w = gatePack(p, { parent });
    ok('a replacement from another anchor is warned about', w.ok && w.warnings.some((x) => /start from their seed and the anchor "old-boss"/.test(x)), w.warnings.join(' | ')); }
}
