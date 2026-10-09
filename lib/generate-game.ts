import { DEFAULT_OPTIONS, optionsBrief, type WorldOptions } from './world-options';
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CharacterImage } from './character';
import { parseGameResponse, staticCheckWorld, WorldMetaSchema, WORLD_CONTROLS, worldControls, isOpenWorld, worldMode, type WorldMeta } from './custom-game';
import { playtestWorld, type WorldReport } from './playtest-runtime';
import { drivesInBrowser, waitForDrive, codeHash, testStatus } from './test-drive';
import { lookAdvisories, pickPass, type Pass } from './look';
import { insertDraft, db, type GameRow } from './db';
import { dna, compareDna, describeDna, askedKind, dnaReport, pickMogPass, KIND_SAID } from './mog-dna';

/**
 * A world, written by Claude Opus 5.5 on the GameMog Runtime.
 *
 * Roblox's split: the platform owns the engine and the rules, the creator owns
 * the experience. Here the runtime (lib/runtime/v1.js) owns the rules every
 * world plays by (in a lap world, endless laps, a new faster and meaner rival
 * each lap, touch anything and it is over; in an open world, crews and heat
 * until you are knocked out; golden GM, the controls, touch controls, HUD,
 * leaderboard), and the model writes only the world module: the track's
 * shape, the scenery, every character, the obstacles, ambient life and sound.
 * Unlimited creativity, bounded by rules it cannot break.
 *
 * The API it writes against (lib/runtime/API.md) is the same document a human
 * developer would read, and the reference world is its worked example.
 */

// Sonnet 5.5 (the owner, 30 Sep): half Opus 5.5's price per token, and faster
export const GAME_MODEL = 'claude-sonnet-5-5';
export const RUNTIME_VERSION = 1;
const MAX_ATTEMPTS = 3;

export type GameEvent =
  | { type: 'stage'; stage: 'thinking' | 'writing' | 'checking' | 'playtesting' | 'repairing'; attempt: number }
  | { type: 'progress'; chars: number }
  | { type: 'problems'; attempt: number; problems: string[] }
  // the page drives the draft itself and posts the report (lib/test-drive.ts)
  | { type: 'drive'; draftId: string; token: string; attempt: number }
  // kept: the world that ships is an earlier pass, because the repair of its notes was worse (lib/look.ts pickPass)
  | { type: 'done'; draftId: string; meta: WorldMeta; runtime: Omit<WorldReport, 'cover'>; attempts: number; ms: number; kept?: { attempt: number; why: string } }
  | { type: 'error'; error: string; problems?: string[] };

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');

function system() {
  return `You design and build worlds for GameMog, a platform where people describe a world and get a playable 3D game at a link. Every GameMog game runs on the GameMog Runtime, which owns the rules; you write the world module, which owns everything else.

Make the world the creator asked for, native to its characters: its own place, its own creatures, its own obstacles, its own light and sound. Two worlds on GameMog should never feel like reskins of each other.

Unless the creator asks for a style (a toy set, a cartoon, low-poly, pixel, papercraft), build it hyperrealistic, as a AAA studio would. That means:
- The platform's library and kits before anything drawn by hand: every person is a library human (ctx.assets.human, cyclist, skater, or at a car's wheel), every car is ctx.assets.car, skies are photographed (ctx.sky({ hdri })), every ground and wall is a scanned surface (ctx.assets.surface), rocks, plants, street furniture, street clutter (bins, drums, crates, tyres, shutters), industrial and building kits (a fire escape, pipes, ducts, a stone fort, a pier) and set pieces (a cannon, a castle door, a buoy) are scanned models (ctx.assets.model), within the API's memory budget, and a sea is ctx.water with its beach and surf. Never stack spheres, capsules and boxes into a person or a vehicle.
- Real scale and proportions: road widths, kerb heights, doors, storeys, trees and people at their true sizes.
- The runtime's cinematic graphics on (graphics: environment, bloom, grade, shadows; reflections and motion in a world of cars), and physically based materials with honest roughness and metalness, texture and wear.
- Light with a direction and a time of day, atmosphere and fog, a horizon that belongs to the place, ground that is never a flat colour, and ambient life that moves.
Build in code only what the library has no kit for (a creature, a landmark, a prop), and then as a modeller would: lathed and lofted forms, real silhouettes, layered materials and detail, not a primitive standing in for the thing. The player's character must stand out from every rival at a glance, and everything alive is animated in motion.
- Work in this order, as an art team would: authored forms first, then materials, then lighting, then effects. Glow, bloom, fog and darkness never stand in for missing geometry; a primitive with a glow on it is still a primitive.
- Compose every view in layers: a foreground that frames the action, a midground where it happens, a background and skyline that say where you are. No empty plains or bare boxes the design does not call for.
- Make roles readable at a glance: the player, enemies or rivals, hazards and rewards each have their own silhouette, colour and material, and every event (a hit, a pickup, a knockout) gets visible feedback.
- Anything alive that is not a person is a creature (ctx.assets.creature) or modelled as one; never a person in costume.
- Hold the frame rate on a phone too: under about 150 draw calls and 300k triangles in view (instance and merge repeats with ctx.instanced), at most one shadow-casting light, and the detail spent near the camera.

If the creator names characters from an existing franchise, make your own original take on them (shape, colour, personality) rather than reproducing official artwork, logos or catchphrases. If an image is attached, it is the player's character: match its shape, colours and personality as closely as the kits and your modelling allow.

The runtime's rules are fixed. Every world is 3D, seen through the runtime's chase camera, with golden GM and the runtime's controls. A lap world (the default) has endless laps, one rival at the start and one more joining each lap, every lap faster, and death by touch. An open world (when the creator's options turn it on) plays by the "Open worlds" section instead: no laps, no track, crews that come as the heat rises, and a run that ends with a knockout. If the creator asks for something the rules do not allow (a 2D or top-down game, a final lap, shooting in a lap world, a different control scheme), build the closest 3D world that fits the rules and put the idea into the world itself.

${read('lib', 'runtime', 'API.md')}

## Worked example

This is the platform's reference world. It is deliberately plain; yours should be far richer, but it shows every hook used correctly.

\`\`\`javascript
${read('lib', 'runtime', 'reference-world.js')}
\`\`\`

## Your reply

Exactly two fenced blocks and nothing else:

\`\`\`json
{ "title": "2 to 40 characters", "tagline": "one line under 12 words", "blurb": "two sentences for the game page",
  "genre": "e.g. Swamp runner", "cast": [{ "name": "...", "color": "#RRGGBB", "role": "player" }, { "name": "...", "color": "#RRGGBB", "role": "rival" }],
  "palette": { "sky": "#RRGGBB", "ground": "#RRGGBB", "accent": "#RRGGBB" } }
\`\`\`

\`\`\`javascript
// the world module: one GameMog.world({...}) call and any helpers it needs
\`\`\`

List the player first in cast, then the first few rivals. Never use an em dash in any text a player will see.

A strong world module is usually 600 to 1,400 lines. Spend effort on the world, not on explaining it: no long comments, no alternatives left in the code, and plan briefly before you write.`;
}

/**
 * A Mog: challenge an existing game with a better variation. The model gets
 * the original whole (its code if it is a world on the runtime, what it was
 * built from otherwise), what its creator asked for, and the challenger's
 * idea, and writes a complete new world that should beat it.
 */
export type MogInput = { parent: GameRow; instruction: string };
/**
 * A long original whose code still fits a reply once its comments are left out (9 Oct, Aspen GP: 233 KB, about 125k
 * tokens with its comments against the reply's 128k, about 105k without; up to about 112k leaves room to think). The
 * model drops comments anyway; told nothing, a module that long reads as "600 to 1,400 lines" and gets shortened, and
 * a reply cut off at the limit is asked for "a more compact world", which is how a Mog of AI Alps lost its scenery.
 * Such an original's Mog is told to copy its code and leave the comments out. Below 200 KB (Meme Kart, every other
 * world) and above what can fit (AI Alps) nothing changes. Tokens are estimated at 1.72 characters each, as counted
 * for world code on the build model (count_tokens, 9 Oct).
 */
export const LONG_MOG = { minChars: 200_000, maxCodeTokens: 112_000, charsPerToken: 1.72 };
export function longMogParent(code: string | null | undefined): { kb: number; codeTokens: number } | null {
  if (!code || code.length <= LONG_MOG.minChars) return null;
  const bare = code.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\s+\/\/ .*$/, '')).join('\n');
  const codeTokens = Math.round(bare.length / LONG_MOG.charsPerToken);
  return codeTokens <= LONG_MOG.maxCodeTokens ? { kb: Math.round(code.length / 1000), codeTokens } : null;
}
function mogTurn(m: MogInput): string {
  const p = m.parent, meta = JSON.parse(p.meta ?? '{}') as { title?: string; genre?: string };
  const original = p.format === 'world' && p.code
    ? `Its complete world module, on the same runtime you are writing for:\n\n\`\`\`javascript\n${p.code}\n\`\`\``
    : p.format === 'custom' && p.code
      ? `It was written before the runtime existed, as a whole game. Rebuild it as a world on the runtime, keeping what made it itself. Its code, for reference:\n\n\`\`\`javascript\n${p.code}\n\`\`\``
      : `It runs on the old rhythm-race engine, so there is no world module to start from. Rebuild it as a world on the runtime, keeping its look, cast and feel. What it was built from:\n\n\`\`\`json\n${p.spec}\n\`\`\``;
  // what makes the original itself, read from its module (lib/mog-dna.ts), and the kind of game it stays: an open world
  // stays open whatever the request says (app/api/generate/route.ts); on foot or a derby only the idea can switch
  const d = p.format === 'world' && p.code ? dna(p.code) : null;
  const long = p.format === 'world' ? longMogParent(p.code) : null;
  const asked = askedKind(m.instruction);
  const kind = !d ? '' : asked && asked !== d.kind && d.kind !== 'race' && asked !== 'race'
    ? `The idea asks for ${KIND_SAID[asked]}: make it one, and keep the rest.`
    : `It stays ${KIND_SAID[d.kind]}: the idea does not ask for another kind of game.`;
  return `This is a Mog: a challenger wants to beat an existing GameMog game with a better variation of it. Players will play both and pick the better one.

The original: "${p.title}"${meta.genre ? ` (${meta.genre})` : ''}, generation ${p.generation}. ${p.tagline}
${p.prompt ? `What its creator asked for: ${p.prompt}\n` : ''}
${original}

The challenger's idea for how to make it better:

${m.instruction}

A Mog inherits: start from the original's module and change what the idea asks for, and nothing else; do not write a new world from scratch. A Mog is the exception to "never feel like reskins": it must be recognisably "${p.title}", with the idea carried out in it.

- Keep everything the idea does not replace: the original's place (its map, or the place it builds), its hero, its crews or rivals and their names, its story (the opening scene, the goal and what the GM is for, the story beats, the closing scene and their cast), its look (graphics, light, camera), its kind of game and platform options, its library assets and kits (every ctx.assets call and the assets list), its track if the place stays, its music, and the detail and realism of its scenery.
- Renaming a place is not moving it: "the city is called X" keeps the city and puts X on its signs, billboards and title cards. Only an idea that names a new place moves the world, and then rebuild the place at least as detailed and as real as the original.
- If the idea asks for something the runtime cannot do, keep the original and do the nearest thing the runtime can; the blurb tells players what the world is, in the world's own words (never the runtime, kits or rules). Driving a car around the city map, for one: an open world's hero is on foot, and only a derby arena or a lap race drives, so keep the city and the hero on foot, put the car in the street (parked, or the patrol car restyled as it), and give the city the idea's time of day and name.
- If the idea asks for something a kit cannot do exactly (a model of car, a costume), get as close as the kit allows, with its nearest kind, colours and options, rather than replacing it with something drawn by hand.
${long ? `- The original's module is long (${long.kb} KB), and your Mog may be as long as its code: the line count in your instructions does not apply. Your reply has room for its code but not its comments, so leave the comments out and copy the code that builds its place and scenery as it is (change only what the idea changes); never make it shorter by leaving scenery out.\n` : ''}${d ? `\nWhat makes "${p.title}" itself, read from its module; your Mog keeps each of these unless the idea replaces it, and is checked against them:\n\n${describeDna(d).map((l) => `- ${l}`).join('\n')}\n\n${kind}\n` : ''}
Write the complete world module. Carry the idea out fully within these rules and fix anything weak you notice, so a player has a real choice between the two. Give it its own title and tagline, never the original's.`;
}

/**
 * The turn for a Mog that passed but lost its parent (the owner, 6 Oct 2026: "if the map, hero, crews, story or game
 * type disappear and the idea didn't ask for that, the builder gets a repair note to put them back"): what it dropped
 * (lib/mog-dna.ts compareDna), and the look's notes too if it had any. Sent once; the repair ships only if it keeps more
 * of the parent (pickMogPass).
 */
function dnaTurn(title: string, drops: string[], notes: string[]) {
  return `Your world passed: it was checked and test-driven on the runtime in a real browser, and it plays. But a Mog must be recognisably a variation of "${title}", and next to the original this one dropped or changed what the challenger's idea does not ask for:

${drops.map((d) => `- ${d}`).join('\n')}

Put each back as the original has it, unless the idea really replaces it: go back to the original's module and change only what the idea asks for. Renaming a place is not moving it. If the runtime cannot do part of the idea, keep the original there and do the nearest thing the runtime can (the blurb speaks in the world's own words, never of the runtime). Keep what this world got right of the idea.${notes.length ? `

The test drive also noted these. Answer each with the smallest change that does it, one thing per note. Keep the original's graphics and the strength of its lights unless the idea asks for a new look; a note about the light is answered one step within the runtime's ranges (exposure usually 0.8 to 1.3 and never above 1.5, a sun 2 to 4, a sky light 0.4 to 1.5, a lamp 0.5 to 4 with a distance):

${notes.map((n) => `- ${n}`).join('\n')}` : ''}

Your repair is checked and test-driven again, and it ships only if it keeps more of the original than this world does. Reply with the complete world again, both blocks:`;
}

function firstTurn(prompt: string, image?: CharacterImage, mog?: MogInput, options: WorldOptions = DEFAULT_OPTIONS): Anthropic.Beta.BetaContentBlockParam[] {
  const parts: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (mog) { parts.push({ type: 'text', text: mogTurn(mog) + '\n\n' + optionsBrief(options) }); return parts; }
  if (image) {
    parts.push({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } });
    parts.push({ type: 'text', text: 'The image above is the player character.' });
  }
  parts.push({ type: 'text', text: `The creator's request:\n\n${prompt}\n\n${optionsBrief(options)}` });
  return parts;
}

/**
 * The turn that answers a world's notes (5 Oct, the first Mog of AI Alps: "it
 * was looking good the first few passes, then the third pass screwed up the
 * lightening to way overexposed"): the world already passed, so the notes ask
 * for the smallest change, one thing each, the light kept unless a note is
 * about it, and then within the runtime's ranges; a Mog keeps its original's
 * light. The repair is driven again and ships only if it is no worse
 * (lib/look.ts pickPass).
 */
function notesTurn(mog: boolean) {
  return `Your world passed: it was checked and test-driven on the runtime in a real browser, and it plays. These notes came back. Answer each with the smallest change that does it, one thing per note, and keep everything else exactly as it is: above all the graphics (preset, exposure, bloom) and the lights, unless a note is about the light, and then one step within the runtime's ranges (exposure usually 0.8 to 1.3 and never above 1.5, a sun 2 to 4, a sky light 0.4 to 1.5, a lamp 0.5 to 4 with a distance).${mog ? " This is a Mog: unless the challenger's idea asks for a new look, keep the original's graphics and the strength of its lights; a note is never a reason to relight the world." : ''} Your repair is test-driven again, and if it looks worse than this world, this world ships. Reply with the complete world again, both blocks:`;
}

/**
 * The build's two safety hooks (the owner, 9 Oct; lib/build-limits.ts). `signal` aborts when the creator has left
 * (app/api/generate/route.ts): the pass being written is cut off at the model, a test drive being waited for is let
 * go, and no further pass runs; the build just ends, with nothing more to say to a page that is gone. `usage` hears
 * what each pass used, as the model reported it (a pass cut short: as much as it had reported, `partial`).
 */
export type BuildHooks = { signal?: AbortSignal; usage?: (pass: { attempt: number; model: string; usage: Anthropic.Beta.BetaUsage; partial?: boolean }) => void };

export async function generateGame(
  input: { prompt: string; image?: CharacterImage; origin: string; mog?: MogInput; options?: WorldOptions } & BuildHooks,
  emit: (e: GameEvent) => void
) {
  const stopped = () => !!input.signal?.aborted;
  const started = Date.now();
  const client = new Anthropic();
  const SYSTEM = system();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: firstTurn(input.prompt, input.image, input.mog, input.options) }];
  const draftId = randomUUID();
  let lastProblems: string[] = [];
  // the latest pictures any pass's test drive took (cover and key art)
  const shots: { cover?: Uint8Array; artIcon?: Uint8Array; artWide?: Uint8Array; hash?: string } = {};
  // a Mog's parent, read from its module (lib/mog-dna.ts): every pass that passes is compared with it, and one that
  // dropped what the idea does not ask for goes back once to put it back (the owner, 6 Oct: "Mogs keep their parent")
  const parentDna = input.mog?.parent.format === 'world' && input.mog.parent.code ? dna(input.mog.parent.code) : null;
  // a pass that passed and went back once, for its notes or its parent's DNA: everything it would ship with, so it still can
  type Kept = Pass & { attempt: number; meta: WorldMeta; stored: unknown; code: string; report: Omit<WorldReport, 'cover' | 'artIcon' | 'artWide'>; shots: typeof shots; dropped: number };
  let kept: Kept | null = null;
  /** Ships the kept pass: its draft (code, meta, report, cover and key art) back in the row the page publishes from. */
  const keep = (k: Kept, why: string, attempts: number) => {
    // a pass that went back for its parent's DNA says so in its report, and why it shipped all the same
    const report = k.dropped && k.report.dna ? { ...k.report, dna: { ...k.report.dna, repair: `sent back once to put the parent back; this pass ships: ${why}` } } : k.report;
    db.prepare('DELETE FROM drafts WHERE id = ?').run(draftId);
    insertDraft({ id: draftId, prompt: input.prompt, meta: k.stored, code: k.code, report, format: 'world', parentId: input.mog?.parent.id ?? null, mogPrompt: input.mog?.instruction ?? null });
    db.prepare('UPDATE drafts SET cover = ?, art_icon = ?, art_wide = ? WHERE id = ?').run(k.shots.cover ?? null, k.shots.artIcon ?? null, k.shots.artWide ?? null, draftId);
    return emit({ type: 'done', draftId, meta: k.meta, runtime: report, attempts, ms: Date.now() - started, kept: { attempt: k.attempt, why } });
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (stopped()) return;
    emit({ type: 'stage', stage: attempt === 1 ? 'thinking' : 'repairing', attempt });
    // this pass is the repair of a world that already passed
    const prior = kept;

    let final: Anthropic.Beta.BetaMessage;
    // (the pass's stream, for what it had counted if it is cut short)
    let live: { currentMessage: Anthropic.Beta.BetaMessage | undefined } | undefined;
    try {
      const stream = live = client.beta.messages.stream({
        model: GAME_MODEL,
        max_tokens: 128_000,
        system: SYSTEM,
        messages,
        // Adaptive thinking, steered by effort: medium (the owner, 1 Oct: about
        // 6 minutes a build at medium against 17 at high; "i want the shorter
        // time"). On Opus 5.5, high once spent all 128k tokens thinking and
        // never wrote a line; the size target below and the max_tokens problem
        // keep a runaway pass from passing silently.
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        // the system prompt (API and example) is the same for every world, and
        // a repair turn resends the first attempt: cache both
        cache_control: { type: 'ephemeral' },
        // a classifier false positive retries on the recommended model rather
        // than failing the creator's request outright
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      }, { signal: input.signal });
      let chars = 0, last = 0, writing = false;
      stream.on('text', (delta) => {
        if (!writing) { writing = true; emit({ type: 'stage', stage: 'writing', attempt }); }
        chars += delta.length;
        if (chars - last > 1500) { last = chars; emit({ type: 'progress', chars }); }
      });
      final = await stream.finalMessage();
    } catch (e) {
      // a pass cut short still used what the model had counted when it started (its input; its output is counted only
      // at its end), and the creator who left needs no word of it
      const cut = live?.currentMessage;
      if (cut) input.usage?.({ attempt, model: cut.model, usage: cut.usage, partial: true });
      if (stopped()) return;
      const error = e instanceof Anthropic.RateLimitError ? 'The model is rate limited right now. Try again in a minute.'
        : e instanceof Anthropic.AuthenticationError ? 'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.local.'
        : e instanceof Anthropic.APIError ? `The Anthropic API returned ${e.status}: ${e.message}`
        : (e as Error).message;
      // a world that already passed is never lost to a repair that could not be written
      if (prior) return keep(prior, `the repair could not be written: ${error}`, attempt);
      return emit({ type: 'error', error });
    }
    input.usage?.({ attempt, model: final.model, usage: final.usage });

    if (final.stop_reason === 'refusal') {
      if (prior) return keep(prior, 'the model declined the repair', attempt);
      return emit({ type: 'error', error: 'The model declined this request. Try describing the world differently.' });
    }

    const text = final.content.filter((b) => b.type === 'text').map((b) => (b as Anthropic.Beta.BetaTextBlock).text).join('\n');
    emit({ type: 'stage', stage: 'checking', attempt });
    const { meta, code, problems } = parseGameResponse(text, WorldMetaSchema);
    // (a Mog of a long original, 9 Oct: compact by its comments and repeats, never by its scenery; else as it was)
    if (final.stop_reason === 'max_tokens') problems.push(input.mog && longMogParent(input.mog.parent.code)
      ? 'The reply was cut off at the length limit. Write the complete world again within it: leave out every comment and shorten repeated code (a loop over a table in place of lines written out), keeping all of the original\'s scenery and everything a player sees.'
      : 'The reply was cut off at the length limit. Write a more compact world module that still does everything.');
    if (code) problems.push(...staticCheckWorld(code));
    // a Mog's pass next to its parent: what it dropped that the idea does not ask for
    const verdict = parentDna && code ? compareDna(parentDna, code, input.mog!.instruction) : undefined;

    let report: WorldReport | undefined;
    // what goes back to the model with a pass that passed: the look's and the runtime's notes, and what it dropped of its parent
    let notes: string[] = [], drops: string[] = [];
    if (!problems.length && meta && code) {
      emit({ type: 'stage', stage: 'playtesting', attempt });
      const openWorld = isOpenWorld(code);
      // (a kart race, 6 Oct: its own controls, and ranked by place)
      const mode = worldMode(code), kart = mode === 'kart';
      const stored = { ...meta, mode, controls: openWorld || kart ? worldControls(code) : WORLD_CONTROLS, scoring: kart ? 'place' : openWorld ? 'survival' : 'level', runtime: RUNTIME_VERSION, options: { ...(input.options ?? DEFAULT_OPTIONS), open: openWorld } };
      db.prepare('DELETE FROM drafts WHERE id = ?').run(draftId);
      insertDraft({ id: draftId, prompt: input.prompt, meta: stored, code, report: { pending: true }, format: 'world', parentId: input.mog?.parent.id ?? null, mogPrompt: input.mog?.instruction ?? null });
      if (drivesInBrowser()) {
        const token = randomUUID();
        emit({ type: 'drive', draftId, token, attempt });
        report = await waitForDrive(draftId, token, undefined, input.signal);
      } else report = await playtestWorld(`${input.origin}/d/${draftId}/play`);
      if (stopped()) return;
      problems.push(...report.problems);
      // the verdict, and the code it is about: a skipped drive is unverified, never a pass
      const hash = codeHash(code);
      report = { ...report, status: testStatus(report), codeHash: hash };
      // a Mog's DNA verdict goes in its report, so it is there to see later (and, for a repair, what it repaired)
      if (verdict) report.dna = dnaReport(verdict, prior?.dropped ? `the repair of pass ${prior.attempt}, which dropped ${prior.dropped} of the parent` : undefined);
      const { cover, artIcon, artWide, ...rest } = report;
      // a pass whose drive took no pictures (skipped) keeps the last pass's: a world never ships without a cover it had,
      // and the report says which code that cover shows
      if (cover) { shots.cover = cover; shots.hash = hash; } if (artIcon) shots.artIcon = artIcon; if (artWide) shots.artWide = artWide;
      if (shots.cover) rest.coverHash = shots.hash;
      db.prepare('UPDATE drafts SET cover = ?, art_icon = ?, art_wide = ?, report = ? WHERE id = ?').run(shots.cover ?? null, shots.artIcon ?? null, shots.artWide ?? null, JSON.stringify(rest), draftId);
      // the runtime's repairs and the look's notes are not failures, but the
      // model hears about them once, so the world it ships is the one it
      // meant; so does a Mog that dropped its parent's DNA against the idea;
      // this pass is kept in case the repair is worse
      // (only the owner's list sends a pass back: the map, the hero, the crews, the story, the game type and what goes
      // with them; a dropped kit rides along in that repair's notes, and is in the report either way)
      const dropped = verdict?.dropped ?? [], major = dropped.filter((d) => !d.minor);
      if (!prior && !problems.length && (report.advisories.length || major.length) && attempt < MAX_ATTEMPTS) {
        kept = { attempt, meta, stored, code, report: { ...rest }, shots: { ...shots }, problems: [], status: report.status, look: report.look, notes: report.advisories, dropped: major.length };
        const look = new Set(report.look ? lookAdvisories(report.look) : []);
        notes = report.advisories.map((a) => look.has(a) ? `The test drive noted: ${a}` : `The runtime had to repair this: ${a}`);
        drops = major.length ? dropped.map((d) => d.note) : [];
        problems.push(...drops, ...notes);
      }
    }

    // a repair of a world that already passed ships only if it is no worse; a Mog's, only if it keeps more of its
    // parent (lib/mog-dna.ts pickMogPass). A repair of the parent's DNA that broke the world gets the build's passes
    // that are left to fix it, and is then held to the same choice
    if (prior) {
      const next = { problems, status: report?.status, look: report?.look, notes: report?.advisories };
      const pick = parentDna ? pickMogPass(prior, { ...next, dropped: verdict?.dropped.filter((d) => !d.minor).length }) : pickPass(prior, next);
      const retry = prior.dropped > 0 && problems.length > 0 && attempt < MAX_ATTEMPTS;
      if (pick.keep === 'prev' && !retry) return keep(prior, pick.why, attempt);
    }

    if (!problems.length && meta && report) {
      const { cover: _c, artIcon: _i, artWide: _w, ...rest } = report;
      return emit({ type: 'done', draftId, meta, runtime: rest, attempts: attempt, ms: Date.now() - started });
    }

    lastProblems = problems;
    emit({ type: 'problems', attempt, problems });
    // append-only: the model's own turn goes back unchanged, thinking included
    messages.push({ role: 'assistant', content: final.content as Anthropic.Beta.BetaContentBlockParam[] });
    messages.push({
      role: 'user',
      content: drops.length ? dnaTurn(input.mog!.parent.title, drops, notes)
        : `${notes.length ? notesTurn(!!input.mog) : 'Your world was checked and playtested on the runtime in a real browser. Fix every one of these and reply with the complete world again, both blocks:'}\n\n${problems.map((p) => `- ${p}`).join('\n')}`,
    });
  }

  // a world whose only remaining notes are the runtime's own repairs still works
  const d = db.prepare('SELECT report FROM drafts WHERE id = ?').get(draftId) as { report: string } | undefined;
  const last = d ? JSON.parse(d.report) as Omit<WorldReport, 'cover'> : null;
  if (last && last.ok) {
    const m = db.prepare('SELECT meta FROM drafts WHERE id = ?').get(draftId) as { meta: string };
    return emit({ type: 'done', draftId, meta: JSON.parse(m.meta), runtime: last, attempts: MAX_ATTEMPTS, ms: Date.now() - started });
  }
  emit({ type: 'error', error: `The world still had problems after ${MAX_ATTEMPTS} attempts.`, problems: lastProblems });
}
