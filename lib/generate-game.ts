import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import type { CharacterImage } from './character';
import { parseGameResponse, staticCheck, type GameMeta } from './custom-game';
import { runtimePlaytest, type RuntimeReport } from './playtest-runtime';
import { insertDraft, db } from './db';

/**
 * A game, written by Claude Opus 5.5.
 *
 * The model writes the whole thing: world, creatures, controls, rules, HUD,
 * sound. What the platform owns is the contract around it (lib/custom-game.ts),
 * the sandbox it runs in, and the playtest it has to pass: a static read, then
 * real Chrome booting and playing it. Whatever fails goes back to the model in
 * the same conversation as instructions, up to twice.
 */

export const GAME_MODEL = 'claude-opus-5-5';
const MAX_ATTEMPTS = 3;

export type GameEvent =
  | { type: 'stage'; stage: 'thinking' | 'writing' | 'checking' | 'playtesting' | 'repairing'; attempt: number }
  | { type: 'progress'; chars: number }
  | { type: 'problems'; attempt: number; problems: string[] }
  | { type: 'done'; draftId: string; meta: GameMeta; runtime: Omit<RuntimeReport, 'cover'>; attempts: number; ms: number }
  | { type: 'error'; error: string; problems?: string[] };

const SYSTEM = `You build complete, polished 3D browser games for GameMog, a platform where people describe a world and get a playable link.

You write the entire game as one JavaScript program. It runs in a locked-down page:
- THREE (three.js r157, the UMD build) is already a global. Nothing else is available: no addons (no OrbitControls, GLTFLoader, EffectComposer), no modules, no imports.
- There is no network. fetch, XHR, WebSocket, images, models, fonts from anywhere but Google Fonts, and audio files are all blocked. Build every mesh, texture and sound procedurally: geometry from THREE primitives, textures from canvas, sound from the Web Audio API.
- localStorage, sessionStorage, cookies, alert, confirm, prompt and window.open all throw. Keep state in memory; draw every UI element in the page.
- The page body is empty. Create the renderer, append renderer.domElement to document.body, and size it to the window (handle resize; cap pixel ratio at 2).

The platform contract (a global GameMog object is provided):
- Call GameMog.ready() immediately after the first frame renders, including when that frame is a title screen.
- Call GameMog.finish({ won, place, timeMs, score }) exactly once each time a run ends. won is a boolean; place is the finishing position in a race (1 = first) or 0 if there is no race; timeMs is the length of the run; score is the points total or 0.
- Then show a results screen and let the player start again with Enter, Space, R or a tap, without reloading.

What makes it good:
- Build the world the creator described, native to their characters. Characters must be recognisable and charming from primitives (spheres, capsules, cones, boxes, lathes), animated in motion (bob, squash and stretch, blinking, legs or hops), never static props sliding along. The player's character must stand out from everyone else at a glance.
- The controls are the ones the creator asked for, exactly. If they ask for arrow keys, the arrow keys are primary (support WASD too). If they say the character moves forward on its own, it does. Always add on-screen touch buttons for phones.
- Give the world depth and atmosphere: fog, a sky, lighting with a clear key light, ambient life (particles, swaying plants, water, fireflies, whatever belongs there), and a camera that follows smoothly and feels fast.
- Juice: sound effects synthesised with Web Audio (started only after the first key press or tap), camera shake on impacts, particles on pickups, a satisfying finish.
- Difficulty escalates in stages (for example three laps or three zones): the first is easy for anyone, each later one is sharply harder, and the last can only be won with excellent play. Unless the creator asks for something different.
- CPU rivals, when there are any, have distinct colours, names and speeds, and drive or run believably rather than on rails at one speed.
- A title screen showing the game's name and the controls, a clear HUD (position, lap or progress, time, score), and a results screen. Write the HUD in the world's own palette and voice. Do not use emoji anywhere on screen. Avoid generic web-app styling in the HUD: no frosted-glass panels, no purple gradients, no pill buttons with drop shadows. You may load one Google Font by inserting a link element.
- Performance: hold 60 fps on a laptop. Use InstancedMesh for anything repeated more than a dozen times, at most one shadow-casting light with a 1024 or smaller shadow map, and no allocation inside the per-frame loop.
- If the creator names characters from an existing franchise, make your own original take on them (shape, colour, personality) rather than reproducing official artwork, logos or catchphrases.
- If an image is attached, it is the player's character: match its shape, colours and personality as closely as primitives allow.

Aim for a complete game of roughly 1,000 to 2,000 lines. Every mechanic you mention on the title screen must work.

Reply with exactly two fenced blocks and nothing else:

\`\`\`json
{ "title": "2 to 40 characters", "tagline": "one line under 12 words", "blurb": "two sentences for the game page",
  "genre": "e.g. Swamp runner", "controls": "one sentence, e.g. Arrow keys to steer and hop. Pepe runs forward on his own.",
  "scoring": "time" | "score" | "place",
  "cast": [{ "name": "...", "color": "#RRGGBB", "role": "player | rival | ..." }],
  "palette": { "sky": "#RRGGBB", "ground": "#RRGGBB", "accent": "#RRGGBB" } }
\`\`\`

\`\`\`javascript
// the whole game
\`\`\`

Never use an em dash in any text a player will see.`;

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
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: firstTurn(input.prompt, input.image) }];
  const draftId = randomUUID();
  let lastProblems: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    emit({ type: 'stage', stage: attempt === 1 ? 'thinking' : 'repairing', attempt });

    let final: Anthropic.Beta.BetaMessage;
    try {
      const stream = client.beta.messages.stream({
        model: GAME_MODEL,
        max_tokens: 128_000,
        system: SYSTEM,
        messages,
        // thinking is always on for Opus 5.5; effort is the control. A whole
        // game is long, hard coding work, so above the medium default.
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
        // a repair turn resends the whole first game; cache it
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
      return emit({ type: 'error', error: 'The model declined this request. Try describing the game differently.' });
    }

    const text = final.content.filter((b) => b.type === 'text').map((b) => (b as Anthropic.Beta.BetaTextBlock).text).join('\n');
    emit({ type: 'stage', stage: 'checking', attempt });
    const { meta, code, problems } = parseGameResponse(text);
    if (final.stop_reason === 'max_tokens') problems.push('The reply was cut off at the length limit. Write a more compact game that still does everything.');
    if (code) problems.push(...staticCheck(code));

    let runtime: RuntimeReport | undefined;
    if (!problems.length && meta && code) {
      emit({ type: 'stage', stage: 'playtesting', attempt });
      db.prepare('DELETE FROM drafts WHERE id = ?').run(draftId);
      insertDraft({ id: draftId, prompt: input.prompt, meta, code, report: { pending: true } });
      runtime = await runtimePlaytest(`${input.origin}/d/${draftId}/play`);
      problems.push(...runtime.problems);
      const { cover, ...report } = runtime;
      db.prepare('UPDATE drafts SET cover = ?, report = ? WHERE id = ?').run(cover ?? null, JSON.stringify(report), draftId);
    }

    if (!problems.length && meta && runtime) {
      const { cover: _c, ...report } = runtime;
      return emit({ type: 'done', draftId, meta, runtime: report, attempts: attempt, ms: Date.now() - started });
    }

    lastProblems = problems;
    emit({ type: 'problems', attempt, problems });
    // append-only: the model's own turn goes back unchanged, thinking included
    messages.push({ role: 'assistant', content: final.content as Anthropic.Beta.BetaContentBlockParam[] });
    messages.push({
      role: 'user',
      content: `Your game was checked and playtested in a real browser. Fix every one of these and reply with the complete game again, both blocks:\n\n${problems.map((p) => `- ${p}`).join('\n')}`,
    });
  }

  emit({ type: 'error', error: `The game still had problems after ${MAX_ATTEMPTS} attempts.`, problems: lastProblems });
}
