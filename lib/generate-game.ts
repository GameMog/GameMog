import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CharacterImage } from './character';
import { parseGameResponse, staticCheckWorld, WorldMetaSchema, WORLD_CONTROLS, type WorldMeta } from './custom-game';
import { playtestWorld, type WorldReport } from './playtest-runtime';
import { insertDraft, db } from './db';

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

export const GAME_MODEL = 'claude-opus-5-5';
export const RUNTIME_VERSION = 1;
const MAX_ATTEMPTS = 3;

export type GameEvent =
  | { type: 'stage'; stage: 'thinking' | 'writing' | 'checking' | 'playtesting' | 'repairing'; attempt: number }
  | { type: 'progress'; chars: number }
  | { type: 'problems'; attempt: number; problems: string[] }
  | { type: 'done'; draftId: string; meta: WorldMeta; runtime: Omit<WorldReport, 'cover'>; attempts: number; ms: number }
  | { type: 'error'; error: string; problems?: string[] };

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');

function system() {
  return `You design and build worlds for GameMog, a platform where people describe a world and get a playable 3D game at a link. Every GameMog game runs on the GameMog Runtime, which owns the rules; you write the world module, which owns everything else.

Make the world the creator asked for, native to its characters: its own place, its own creatures, its own obstacles, its own light and sound. Two worlds on GameMog should never feel like reskins of each other. Characters are built from primitives (spheres, capsules, cones, boxes, lathes, tori) but must be recognisable and charming, and animated in motion: running, hopping, waddling, flapping, bobbing, blinking. The player's character must stand out from every rival at a glance. Give the world depth: a horizon, atmosphere and fog, a key light with a clear direction, ground that is not a flat colour, and ambient life that moves.

If the creator names characters from an existing franchise, make your own original take on them (shape, colour, personality) rather than reproducing official artwork, logos or catchphrases. If an image is attached, it is the player's character: match its shape, colours and personality as closely as primitives allow.

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

function firstTurn(prompt: string, image?: CharacterImage): Anthropic.Beta.BetaContentBlockParam[] {
  const parts: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (image) {
    parts.push({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } });
    parts.push({ type: 'text', text: 'The image above is the player character.' });
  }
  parts.push({ type: 'text', text: `The creator's request:\n\n${prompt}` });
  return parts;
}

export async function generateGame(
  input: { prompt: string; image?: CharacterImage; origin: string },
  emit: (e: GameEvent) => void
) {
  const started = Date.now();
  const client = new Anthropic();
  const SYSTEM = system();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: firstTurn(input.prompt, input.image) }];
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
        // Thinking is always on for Opus 5.5; effort is the control. At high,
        // the first real world spent all 128k tokens thinking and never wrote
        // a line, and Anthropic's guidance is that Opus 5.5 at medium beats
        // Opus 5 at high on coding. Medium, then, with a size target below.
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
      const stored = { ...meta, controls: WORLD_CONTROLS, scoring: 'level', runtime: RUNTIME_VERSION };
      db.prepare('DELETE FROM drafts WHERE id = ?').run(draftId);
      insertDraft({ id: draftId, prompt: input.prompt, meta: stored, code, report: { pending: true }, format: 'world' });
      report = await playtestWorld(`${input.origin}/d/${draftId}/play`);
      problems.push(...report.problems);
      const { cover, ...rest } = report;
      db.prepare('UPDATE drafts SET cover = ?, report = ? WHERE id = ?').run(cover ?? null, JSON.stringify(rest), draftId);
      // the runtime's repairs are not failures, but the model hears about
      // them once, so the world it ships is the one it meant
      if (!problems.length && report.advisories.length && !advisedOnce && attempt < MAX_ATTEMPTS) {
        advisedOnce = true;
        problems.push(...report.advisories.map((a) => `The runtime had to repair this: ${a}`));
      }
    }

    if (!problems.length && meta && report) {
      const { cover: _c, ...rest } = report;
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
