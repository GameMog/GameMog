import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { db, insertDraft, type GameRow } from './db';
import { waitForDrive, codeHash, testStatus } from './test-drive';
import type { WorldReport } from './playtest-runtime';
import {
  packOf, episodeBase, episodeModule, episodeKindProblems, changedStrings, changeReport, episodeTitle, episodeCast, storyOf,
  realNameProblems, NAMES_CHECK_SYSTEM, namesCheckTurn, readNamesCheck, EPISODE_CONTROLS, MOG_CITY, type Consent, type EpisodePack,
} from './episode';

/**
 * A Mog of a Mog City episode (3 Nov 2026; MogCity .scratch/moggable/PLAN.md 4.3): the builder gets a short prompt of
 * its own (who GameMog is, the rules, the "Mog City episodes" chapter of lib/runtime/API.md and nothing else of the
 * runtime's manual), the original's story pack whole, the challenger's idea and the creator's consent, and replies with
 * the complete new pack. Each pass is held to lib/episode.ts episodeKindProblems (the schema against the base, the
 * words it changed) and then to the real-name rules: the builder's own list of the real people and brands it wrote and
 * an independent check of the changed texts by the model, together (realNameProblems). A pass that passes is stored
 * as a draft with its parent's cover and key art (an episode has no frame a drive can take a picture of), and test-driven
 * in the creator's browser: the draft's preview frame is Mog City with ?story= at the draft's story.json, and the drive
 * passes when the game reports it loaded exactly that pack (lib/test-drive.ts, kind 'episode').
 */

const MAX_ATTEMPTS = 3;
/** How long the creator's browser is waited for to load the city with the pack (it is a big game: about 100 MB the first time). */
const EPISODE_DRIVE_MS = 150_000;

export function episodeSystem(chapter: string) {
  return `You write story episodes for GameMog, a platform where people play games at a link and Mog them: challenge a game with a better variation of it, which players then compare with the original.

This build is a Mog of a Mog City episode. Mog City is a finished game; a Mog of it never writes code. You write its story pack: one JSON object that changes its words and looks. Everything you need is below.

${chapter}

## Your reply

Exactly two fenced blocks and nothing else:

\`\`\`json
{ "tagline": "one line under 12 words", "blurb": "two sentences for the game page, in the episode's own words",
  "people": ["every real person your pack names, as written"], "brands": ["every real company, brand or product your pack names that the original did not"] }
\`\`\`

\`\`\`json
{ "pack": 1, "base": "mog-city@1", "title": { "episode": "..." }, ...the complete story pack, every key... }
\`\`\`

The second block is the whole pack, strict JSON, every key the original has (copy what you do not change exactly). Lists in the first block are empty when there is nobody and nothing. Never use an em dash in any text a player will see.`;
}

export type EpisodeInput = { parent: GameRow; instruction: string };

/** The first turn: the original's pack, the idea, and who the creator's consent covers. */
export function episodeTurn(m: EpisodeInput, consent: Consent | null | undefined) {
  const pack = packOf(m.parent.code)!;
  const shown = { ...pack }; delete (shown as { consent?: unknown }).consent;
  const r = changeReport(pack);
  return `The original: "${m.parent.title}", generation ${m.parent.generation}. ${m.parent.tagline}
${m.parent.mog_prompt ? `The idea it was made from: ${m.parent.mog_prompt}\n` : ''}Its episode title is "${pack.title.episode}", and ${r.rewritten} of its ${r.lines} lines are rewritten from Mog City's own (${r.kept} keep their recorded voices).

Its complete story pack:

\`\`\`json
${JSON.stringify(shown)}
\`\`\`

The challenger's idea for how to make it better:

${m.instruction}

${consent?.names.length
    ? `Real people: the creator says ${consent.basis === 'self' ? 'they are' : 'they have the permission of'} ${consent.names.map((n) => `"${n}"`).join(', ')}, and that each is an adult. Only these real people may be named, and only as the idea asks.`
    : 'Real people: the creator named nobody, so no real person may be named: anyone real the idea names gets an original name of the city\'s own.'}

Start from the original's pack and change what the idea asks for, and nothing else: it must be recognisably a variation of "${m.parent.title}". Give it its own episode title (never the original's, never with ${MOG_CITY} in it), tagline and blurb. Reply with the two blocks.`;
}

/** The two json blocks of a reply: the meta (tagline, blurb, people, brands) and the pack. */
export function parseEpisodeReply(text: string): { meta?: { tagline: string; blurb: string; people: string[]; brands: string[] }; pack?: EpisodePack; problems: string[] } {
  const blocks = [...text.matchAll(/```json\s*\n([\s\S]*?)\n```/g)].map((m) => m[1]);
  const problems: string[] = [];
  const parsed = blocks.map((b) => { try { return JSON.parse(b) as Record<string, unknown>; } catch { return null; } });
  const pack = parsed.find((o) => o && o.pack !== undefined && o.lines !== undefined) as EpisodePack | undefined;
  const m = parsed.find((o) => o && o.pack === undefined && (o.tagline !== undefined || o.blurb !== undefined)) as Record<string, unknown> | undefined;
  if (!pack) problems.push(blocks.length < 2 ? 'Reply with exactly two fenced json blocks: the meta, then the complete story pack.' : 'The story pack block is not valid JSON (strict JSON: double quotes, no comments, no trailing commas).');
  const str = (v: unknown, lo: number, hi: number) => typeof v === 'string' && v.trim().length >= lo && v.trim().length <= hi ? v.trim() : null;
  const list = (v: unknown) => (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string').map((s) => s.slice(0, 80)).slice(0, 40);
  const tagline = str(m?.tagline, 2, 140), blurb = str(m?.blurb, 10, 600);
  if (!m) problems.push('The first block must be the meta: { "tagline", "blurb", "people", "brands" }.');
  else {
    if (!tagline) problems.push('The tagline is one line of 2 to 140 characters.');
    if (!blurb) problems.push('The blurb is 10 to 600 characters.');
  }
  return { meta: tagline && blurb ? { tagline, blurb, people: list(m!.people), brands: list(m!.brands) } : undefined, pack, problems };
}

/** The meta an episode draft is stored with: the title is always MOG CITY: <its title>; no board, no options to choose. */
export function episodeMeta(pack: EpisodePack, m: { tagline: string; blurb: string }, consent?: Consent | null) {
  return {
    title: episodeTitle(pack), tagline: m.tagline, blurb: m.blurb, genre: 'Story episode', cast: episodeCast(pack),
    palette: { sky: '#0B1220', ground: '#2A2D34', accent: '#F2C230' },
    mode: 'episode' as const, controls: EPISODE_CONTROLS, scoring: 'none' as const, runtime: 1,
    options: { hazards: 'same' as const, music: null, open: false, coins: false },
    episode: changeReport(pack),
    ...(consent ? { consent } : {}),
  };
}

type Emit = (e: import('./generate-game').GameEvent) => void;
type Hooks = { signal?: AbortSignal; usage?: (pass: { attempt: number; model: string; usage: Anthropic.Beta.BetaUsage; partial?: boolean }) => void };

/** The real people and brands in a pass's changed texts, by an independent call; null when the check could not be made. */
async function checkNames(client: Anthropic, model: string, texts: { at: string; text: string }[], pack: EpisodePack, attempt: number, hooks: Hooks) {
  if (!texts.length) return { people: [], brands: [] };
  try {
    const r = await client.beta.messages.create({ model, max_tokens: 2000, system: NAMES_CHECK_SYSTEM, messages: [{ role: 'user', content: namesCheckTurn(texts, pack) }] }, { signal: hooks.signal });
    hooks.usage?.({ attempt, model: r.model, usage: r.usage });
    return readNamesCheck(r.content.filter((b) => b.type === 'text').map((b) => (b as Anthropic.Beta.BetaTextBlock).text).join('\n'));
  } catch {
    return null;
  }
}

export async function generateEpisode(
  input: { prompt: string; mog: EpisodeInput; model: string; system: string; consent?: Consent | null } & Hooks,
  emit: Emit,
) {
  const stopped = () => !!input.signal?.aborted;
  const started = Date.now();
  const client = new Anthropic();
  const parentPack = packOf(input.mog.parent.code) ?? episodeBase().pack;
  const consent = input.consent ?? null;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: episodeTurn(input.mog, consent) }];
  const draftId = randomUUID();
  let lastProblems: string[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (stopped()) return;
    emit({ type: 'stage', stage: attempt === 1 ? 'thinking' : 'repairing', attempt });
    let final: Anthropic.Beta.BetaMessage;
    let live: { currentMessage: Anthropic.Beta.BetaMessage | undefined } | undefined;
    try {
      const stream = live = client.beta.messages.stream({
        model: input.model, max_tokens: 64_000, system: input.system, messages,
        thinking: { type: 'adaptive' }, output_config: { effort: 'medium' }, cache_control: { type: 'ephemeral' },
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      }, { signal: input.signal });
      let chars = 0, last = 0, writing = false;
      stream.on('text', (delta) => {
        if (!writing) { writing = true; emit({ type: 'stage', stage: 'writing', attempt }); }
        chars += delta.length;
        if (chars - last > 1500) { last = chars; emit({ type: 'progress', chars }); }
      });
      final = await stream.finalMessage();
    } catch (e) {
      const cut = live?.currentMessage;
      if (cut) input.usage?.({ attempt, model: cut.model, usage: cut.usage, partial: true });
      if (stopped()) return;
      const error = e instanceof Anthropic.RateLimitError ? 'The model is rate limited right now. Try again in a minute.'
        : e instanceof Anthropic.APIError ? `The Anthropic API returned ${e.status}: ${e.message}` : (e as Error).message;
      return emit({ type: 'error', error });
    }
    input.usage?.({ attempt, model: final.model, usage: final.usage });
    if (final.stop_reason === 'refusal') return emit({ type: 'error', error: 'The model declined this request. Try describing the episode differently.' });

    const text = final.content.filter((b) => b.type === 'text').map((b) => (b as Anthropic.Beta.BetaTextBlock).text).join('\n');
    emit({ type: 'stage', stage: 'checking', attempt });
    const { meta, pack, problems } = parseEpisodeReply(text);
    if (final.stop_reason === 'max_tokens') problems.push('The reply was cut off at the length limit. Reply again with both blocks, the pack as compact JSON (no indentation).');
    let code: string | null = null;
    if (pack) {
      // (the consent is the platform's record, kept in the game's meta, never the builder's to write)
      delete (pack as { consent?: unknown }).consent;
      code = episodeModule(pack);
      problems.push(...episodeKindProblems(code, input.mog, meta));
      if (/^\s*mog\s*city\b/i.test(String(pack.title?.episode ?? ''))) problems.push(`The episode title is only the episode's own: the game puts ${MOG_CITY}: before it.`);
      if (!problems.length && meta) {
        const changed = changedStrings(pack, parentPack);
        const checked = await checkNames(client, input.model, [...changed, { at: '/meta/tagline', text: meta.tagline }, { at: '/meta/blurb', text: meta.blurb }], pack, attempt, input);
        if (stopped()) return;
        if (!checked) return emit({ type: 'error', error: 'The names in this Mog could not be checked right now. Try again in a minute.' });
        problems.push(...realNameProblems({ people: [...meta.people, ...checked.people], brands: [...meta.brands, ...checked.brands] }, consent));
      }
    }

    if (!problems.length && meta && pack && code) {
      emit({ type: 'stage', stage: 'playtesting', attempt });
      const stored = episodeMeta(pack, meta, consent);
      db.prepare('DELETE FROM drafts WHERE id = ?').run(draftId);
      insertDraft({ id: draftId, prompt: input.prompt, meta: stored, code, report: { pending: true }, format: 'world', parentId: input.mog.parent.id, mogPrompt: input.mog.instruction });
      // (the parent's pictures: the city's, with this game's title on its page)
      db.prepare('UPDATE drafts SET cover = (SELECT cover FROM games WHERE id = ?), art_icon = (SELECT art_icon FROM games WHERE id = ?), art_wide = (SELECT art_wide FROM games WHERE id = ?) WHERE id = ?')
        .run(input.mog.parent.id, input.mog.parent.id, input.mog.parent.id, draftId);
      const token = randomUUID();
      emit({ type: 'drive', draftId, token, attempt });
      let report: WorldReport = await waitForDrive(draftId, token, EPISODE_DRIVE_MS, input.signal, { episodeHash: storyOf(code)!.hash });
      if (stopped()) return;
      const hash = codeHash(code);
      report = { ...report, kind: 'episode', status: testStatus(report), codeHash: hash, coverHash: hash } as WorldReport;
      const { cover: _c, artIcon: _i, artWide: _w, ...rest } = report;
      db.prepare('UPDATE drafts SET report = ? WHERE id = ?').run(JSON.stringify({ ...rest, trail: { shipped: attempt, why: 'it passed' } }), draftId);
      // (a drive that did not see this very pack load is unverified, never a repair: Mog City runs the same validatePack
      // the gate ran, so a refusal there is the platform's to fix, not the builder's; lib/test-drive.ts episodeVerdict)
      return emit({ type: 'done', draftId, meta: stored as never, runtime: rest, attempts: attempt, ms: Date.now() - started });
    }

    lastProblems = problems;
    emit({ type: 'problems', attempt, problems });
    messages.push({ role: 'assistant', content: final.content as Anthropic.Beta.BetaContentBlockParam[] });
    messages.push({ role: 'user', content: `Your pack was checked. Fix every one of these and reply with both blocks again, the complete pack:\n\n${problems.map((p) => `- ${p}`).join('\n')}` });
  }
  emit({ type: 'error', error: `The episode still had problems after ${MAX_ATTEMPTS} attempts.`, problems: lastProblems });
}
