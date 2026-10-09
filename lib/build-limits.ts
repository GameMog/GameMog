/**
 * The safety limits on builds (the owner, 9 Oct 2026: "let's do the four safety limits"). A build is one long request
 * (app/api/generate/route.ts): the model writes the world, the creator's page test-drives it, up to two repairs follow,
 * minutes of the owner's key each. Four limits hold it, none of them per person (the owner: no per-user caps):
 *  1. it stops when the creator leaves: the request's abort reaches the model's stream (lib/generate-game.ts) and the
 *     test drive's wait (lib/test-drive.ts), no further pass runs, and the build is logged 'abandoned'. A tab in the
 *     background is still connected, and keeps building;
 *  2. one cap for the whole site on builds at once, here: BUILD_SLOTS (default 3), counted in this server (there is one).
 *     A build holds its slot from its request to the end of its stream, test drive included; with every slot taken the
 *     request is answered at once with BUSY, before any model is called, so nothing is spent;
 *  3. every build is logged as it starts (lib/db.ts startBuild) and finished as it ends; one the server stopped under
 *     (a deploy stops the builds in flight) is 'interrupted' when the server starts again (deploy/boot.mjs);
 *  4. its real cost: the tokens each pass used, summed and priced here, in the one price table.
 * A creator leaves by closing the tab, or within the site (a link, Back): the page lets its build go as it goes
 * (app/create/generation.tsx useGeneration). The race brief, which no page sends any more but a request still can,
 * takes a slot too; the selfie is a short single call, and stays outside the cap.
 */

/** What the creator is told when every slot is taken (app/create/generation.tsx says it as it is). */
export const BUSY = 'GameMog is busy building other worlds. Try again in a minute.';

/** Builds at once, site-wide: BUILD_SLOTS on the server's Environment page, or 3 (one 0.5 CPU server, 9 Oct). */
export function buildSlots() {
  const n = Math.floor(Number(process.env.BUILD_SLOTS));
  return n >= 1 ? n : 3;
}

// one set for the whole process: each route is its own bundle (lib/test-drive.ts keeps its drives the same way)
type Slot = { row: number | null; at: number };
const G = globalThis as unknown as { __gmBuildSlots?: Set<Slot> };
const held = (G.__gmBuildSlots ??= new Set<Slot>());

/** A slot for one build, or null when every one is taken. Its release must run, and may run more than once. */
export function takeSlot(): { slot: Slot; release: () => void } | null {
  if (held.size >= buildSlots()) return null;
  const slot: Slot = { row: null, at: Date.now() };
  held.add(slot);
  return { slot, release: () => { held.delete(slot); } };
}
/** The slots taken now. */
export const slotsHeld = () => held.size;
/** The builds this server is running now, by their row in generations: any other row still 'running' was left by a server that stopped. */
export const runningRows = () => [...held].flatMap((s) => (s.row === null ? [] : [s.row]));

/* ------------------------------------------------------------------ cost -- */
/**
 * Dollars per million tokens, by model (Anthropic's prices, 9 Oct 2026). A cache write is the 5-minute kind unless the
 * usage says an hour's (1.25x and 2x the input price); thinking is billed as output. Sonnet 5 is where Sonnet 5.5's
 * declined passes fall back to (lib/generate-game.ts: fallbacks 'default'), and Opus 5.5 is what built worlds until 30
 * Sep. A model not in the table is priced as the dearest one in it, and named in the build's usage (unpriced) so the
 * table can be extended: the spend shown is never less than was spent.
 */
type Price = { input: number; write5m: number; write1h: number; read: number; output: number };
export const PRICES: Record<string, Price> = {
  'claude-sonnet-5-5': { input: 2, write5m: 2.5, write1h: 4, read: 0.2, output: 10 },
  'claude-sonnet-5': { input: 2, write5m: 2.5, write1h: 4, read: 0.2, output: 10 },
  'claude-opus-5-5': { input: 4, write5m: 5, write1h: 8, read: 0.2, output: 20 },
};
const DEAREST = Object.values(PRICES).reduce((a, b) => (b.output > a.output ? b : a));

/** The usage counters a pass reports (the SDK's BetaUsage, or one of its iterations), as far as they are priced. */
type Tokens = {
  input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null;
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } | null;
};
/** One pass's usage as lib/generate-game.ts hands it over: `partial` for a pass cut short (the creator left, or the
 *  stream broke), whose output was never counted, so its cost is a floor. `iterations`: each model that ran in the
 *  pass (a declined pass and its fallback), which the bill counts one by one. */
export type PassUsage = { attempt: number; model: string; usage: Tokens & { iterations?: (Partial<Tokens> & { type?: string; model?: string | null })[] | null }; partial?: boolean };
type Counted = { input: number; output: number; cacheWrite: number; cacheRead: number };
export type BuildUsage = Counted & { passes: (Counted & { attempt: number; model: string; usd: number; partial?: true })[]; partial?: true; unpriced?: string[] };

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
function count(t: Partial<Tokens>, model: string, unpriced: Set<string>): Counted & { usd: number } {
  const p = PRICES[model] ?? (unpriced.add(model), DEAREST);
  const input = n(t.input_tokens), output = n(t.output_tokens), cacheWrite = n(t.cache_creation_input_tokens), cacheRead = n(t.cache_read_input_tokens);
  const hour = Math.min(cacheWrite, n(t.cache_creation?.ephemeral_1h_input_tokens));
  const usd = (input * p.input + (cacheWrite - hour) * p.write5m + hour * p.write1h + cacheRead * p.read + output * p.output) / 1e6;
  return { input, output, cacheWrite, cacheRead, usd };
}

/** A build's passes, summed and priced: what is stored with its row (usage, cost_usd). */
export function priceBuild(passes: PassUsage[]): { usage: BuildUsage; usd: number } {
  const unpriced = new Set<string>();
  const usage: BuildUsage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, passes: [] };
  let usd = 0;
  for (const p of passes) {
    // a pass with iterations is billed by them (the top-level counts only the model that answered); without, by itself
    const its = (p.usage.iterations ?? []).filter((i) => i && typeof i === 'object');
    const parts = its.length ? its.map((i) => count(i, i.model || p.model, unpriced)) : [count(p.usage, p.model, unpriced)];
    const c = parts.reduce((a, b) => ({ input: a.input + b.input, output: a.output + b.output, cacheWrite: a.cacheWrite + b.cacheWrite, cacheRead: a.cacheRead + b.cacheRead, usd: a.usd + b.usd }));
    usage.passes.push({ attempt: p.attempt, model: p.model, input: c.input, output: c.output, cacheWrite: c.cacheWrite, cacheRead: c.cacheRead, usd: +c.usd.toFixed(6), ...(p.partial ? { partial: true as const } : {}) });
    usage.input += c.input; usage.output += c.output; usage.cacheWrite += c.cacheWrite; usage.cacheRead += c.cacheRead; usd += c.usd;
    if (p.partial) usage.partial = true;
  }
  if (unpriced.size) usage.unpriced = [...unpriced];
  return { usage, usd: +usd.toFixed(6) };
}
