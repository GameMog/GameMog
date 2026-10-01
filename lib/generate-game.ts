import { DEFAULT_OPTIONS, optionsBrief, type WorldOptions } from './world-options';
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CharacterImage } from './character';
import { parseGameResponse, staticCheckWorld, WorldMetaSchema, WORLD_CONTROLS, OPEN_CONTROLS, isOpenWorld, type WorldMeta } from './custom-game';
import { playtestWorld, type WorldReport } from './playtest-runtime';
import { drivesInBrowser, waitForDrive } from './test-drive';
import { insertDraft, db, type GameRow } from './db';

/**
 * A world, written by Claude Opus 5.5 on the GameMog Runtime.
 *
 * Roblox's split: the platform owns the engine and the rules, the creator owns
 * the experience. Here the runtime (lib/runtime/v1.js) owns the rules every
 * world plays by (endless laps, a new faster and meaner rival each lap, touch
 * anything and it is over, golden GM, arrow keys and Space, touch controls,
 * HUD, leaderboard), and the model writes only the world module: the track's
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
  | { type: 'done'; draftId: string; meta: WorldMeta; runtime: Omit<WorldReport, 'cover'>; attempts: number; ms: number }
  | { type: 'error'; error: string; problems?: string[] };

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');

function system() {
  return `You design and build worlds for GameMog, a platform where people describe a world and get a playable 3D game at a link. Every GameMog game runs on the GameMog Runtime, which owns the rules; you write the world module, which owns everything else.

Make the world the creator asked for, native to its characters: its own place, its own creatures, its own obstacles, its own light and sound. Two worlds on GameMog should never feel like reskins of each other.

Unless the creator asks for a style (a toy set, a cartoon, low-poly, pixel, papercraft), build it hyperrealistic, as a AAA studio would. That means:
- The platform's library and kits before anything drawn by hand: every person is a library human (ctx.assets.human, cyclist, skater, or at a car's wheel), every car is ctx.assets.car, skies are photographed (ctx.sky({ hdri })), every ground and wall is a scanned surface (ctx.assets.surface), rocks, plants and street furniture are scanned models (ctx.assets.model), and a sea is ctx.water with its beach and surf. Never stack spheres, capsules and boxes into a person or a vehicle.
- Real scale and proportions: road widths, kerb heights, doors, storeys, trees and people at their true sizes.
- The runtime's cinematic graphics on (graphics: environment, bloom, grade, shadows; reflections and motion in a world of cars), and physically based materials with honest roughness and metalness, texture and wear.
- Light with a direction and a time of day, atmosphere and fog, a horizon that belongs to the place, ground that is never a flat colour, and ambient life that moves.
Build in code only what the library has no kit for (a creature, a landmark, a prop), and then as a modeller would: lathed and lofted forms, real silhouettes, layered materials and detail, not a primitive standing in for the thing. The player's character must stand out from every rival at a glance, and everything alive is animated in motion.

If the creator names characters from an existing franchise, make your own original take on them (shape, colour, personality) rather than reproducing official artwork, logos or catchphrases. If an image is attached, it is the player's character: match its shape, colours and personality as closely as the kits and your modelling allow.

The runtime's rules are fixed: every world is 3D and seen through the runtime's chase camera, endless laps, one rival at the start and one more joining each lap, every lap faster, death by touch, golden GM coins, the controls. If the creator asks for something the rules do not allow (a 2D or top-down game, a final lap, shooting, a different control scheme), build the closest 3D world that fits the rules and put the idea into the world itself.

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
function mogTurn(m: MogInput): string {
  const p = m.parent, meta = JSON.parse(p.meta ?? '{}') as { title?: string; genre?: string };
  const original = p.format === 'world' && p.code
    ? `Its complete world module, on the same runtime you are writing for:\n\n\`\`\`javascript\n${p.code}\n\`\`\``
    : p.format === 'custom' && p.code
      ? `It was written before the runtime existed, as a whole game. Rebuild it as a world on the runtime, keeping what made it itself. Its code, for reference:\n\n\`\`\`javascript\n${p.code}\n\`\`\``
      : `It runs on the old rhythm-race engine, so there is no world module to start from. Rebuild it as a world on the runtime, keeping its look, cast and feel. What it was built from:\n\n\`\`\`json\n${p.spec}\n\`\`\``;
  return `This is a Mog: a challenger wants to beat an existing GameMog game with a better variation of it. Players will play both and pick the better one.

The original: "${p.title}"${meta.genre ? ` (${meta.genre})` : ''}, generation ${p.generation}. ${p.tagline}
${p.prompt ? `What its creator asked for: ${p.prompt}\n` : ''}
${original}

The challenger's idea for how to make it better:

${m.instruction}

A Mog inherits. Start from the original's module and change what the idea asks for; do not write a new world from scratch. Everything the idea does not replace stays: its library assets and kits (every ctx.assets call and the assets list), its graphics, camera and platform options, its track if the place stays, its music, and the level of detail and realism of its scenery. If the idea moves the world somewhere new, rebuild the place at least as detailed and as real as the original. If the idea asks for something a kit cannot do exactly (a model of car, a costume), get as close as the kit allows, with its nearest kind, colours and options, rather than replacing it with something drawn by hand.

Write the complete world module. Carry the challenger's idea out boldly and fix anything weak you notice. It should be recognisably a variation of "${p.title}" and different enough that a player would have a real choice between them. Give it its own title and tagline, never the original's.`;
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

export async function generateGame(
  input: { prompt: string; image?: CharacterImage; origin: string; mog?: MogInput; options?: WorldOptions },
  emit: (e: GameEvent) => void
) {
  const started = Date.now();
  const client = new Anthropic();
  const SYSTEM = system();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: firstTurn(input.prompt, input.image, input.mog, input.options) }];
  const draftId = randomUUID();
  let lastProblems: string[] = [];
  let advisedOnce = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    emit({ type: 'stage', stage: attempt === 1 ? 'thinking' : 'repairing', attempt });

    let final: Anthropic.Beta.BetaMessage;
    try {
      const stream = client.beta.messages.stream({
        model: GAME_MODEL,
        max_tokens: 128_000,
        system: SYSTEM,
        messages,
        // Adaptive thinking, steered by effort. Sonnet 5.5 defaults to high;
        // on Opus 5.5, high spent all 128k tokens thinking on the first real
        // world and never wrote a line. Medium, then, with a size target below.
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        // the system prompt (API and example) is the same for every world, and
        // a repair turn resends the first attempt: cache both
        cache_control: { type: 'ephemeral' },
        // a classifier false positive retries on the recommended model rather
        // than failing the creator's request outright
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
      let chars = 0, last = 0, writing = false;
      stream.on('text', (delta) => {
        if (!writing) { writing = true; emit({ type: 'stage', stage: 'writing', attempt }); }
        chars += delta.length;
        if (chars - last > 1500) { last = chars; emit({ type: 'progress', chars }); }
      });
      final = await stream.finalMessage();
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) return emit({ type: 'error', error: 'The model is rate limited right now. Try again in a minute.' });
      if (e instanceof Anthropic.AuthenticationError) return emit({ type: 'error', error: 'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.local.' });
      if (e instanceof Anthropic.APIError) return emit({ type: 'error', error: `The Anthropic API returned ${e.status}: ${e.message}` });
      return emit({ type: 'error', error: (e as Error).message });
    }

    if (final.stop_reason === 'refusal') {
      return emit({ type: 'error', error: 'The model declined this request. Try describing the world differently.' });
    }

    const text = final.content.filter((b) => b.type === 'text').map((b) => (b as Anthropic.Beta.BetaTextBlock).text).join('\n');
    emit({ type: 'stage', stage: 'checking', attempt });
    const { meta, code, problems } = parseGameResponse(text, WorldMetaSchema);
    if (final.stop_reason === 'max_tokens') problems.push('The reply was cut off at the length limit. Write a more compact world module that still does everything.');
    if (code) problems.push(...staticCheckWorld(code));

    let report: WorldReport | undefined;
    if (!problems.length && meta && code) {
      emit({ type: 'stage', stage: 'playtesting', attempt });
      const openWorld = isOpenWorld(code);
      const stored = { ...meta, controls: openWorld ? OPEN_CONTROLS : WORLD_CONTROLS, scoring: openWorld ? 'survival' : 'level', runtime: RUNTIME_VERSION, options: { ...(input.options ?? DEFAULT_OPTIONS), open: openWorld } };
      db.prepare('DELETE FROM drafts WHERE id = ?').run(draftId);
      insertDraft({ id: draftId, prompt: input.prompt, meta: stored, code, report: { pending: true }, format: 'world', parentId: input.mog?.parent.id ?? null, mogPrompt: input.mog?.instruction ?? null });
      if (drivesInBrowser()) {
        const token = randomUUID();
        emit({ type: 'drive', draftId, token, attempt });
        report = await waitForDrive(draftId, token);
      } else report = await playtestWorld(`${input.origin}/d/${draftId}/play`);
      problems.push(...report.problems);
      const { cover, artIcon, artWide, ...rest } = report;
      db.prepare('UPDATE drafts SET cover = ?, art_icon = ?, art_wide = ?, report = ? WHERE id = ?').run(cover ?? null, artIcon ?? null, artWide ?? null, JSON.stringify(rest), draftId);
      // the runtime's repairs are not failures, but the model hears about
      // them once, so the world it ships is the one it meant
      if (!problems.length && report.advisories.length && !advisedOnce && attempt < MAX_ATTEMPTS) {
        advisedOnce = true;
        problems.push(...report.advisories.map((a) => `The runtime had to repair this: ${a}`));
      }
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
      content: `Your world was checked and playtested on the runtime in a real browser. Fix every one of these and reply with the complete world again, both blocks:\n\n${problems.map((p) => `- ${p}`).join('\n')}`,
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
