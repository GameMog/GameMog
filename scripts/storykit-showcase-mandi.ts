/**
 * Story Kit: Mandi's Revenge, GameMog's third showcase story world and its second in a hometown (Chicago, us-1714000,
 * on Mog City's engine). Like Jensen Return (scripts/storykit-showcase-jensen.ts) it is a hand-written pack in the repo
 * (storykit/packs/mandis-revenge.json, written by storykit/showcase/mandis-revenge/gen.mjs, listed in SHOWCASE_PACKS)
 * and gated in its town as a showcase. Unlike Jensen Return it has no record yet: its two leads, Mandi and Jay, are
 * private premium bodies that never go in this public repo, so there is nothing to export until private hosting for
 * them exists (the README's "Before it can ship"). What it does now:
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-showcase-mandi.ts --gate
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-showcase-mandi.ts --draft <out.json> --cast <id=url,...>
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-showcase-mandi.ts --lines <LINES.md>
 *
 * --gate prints the gate's problems and warnings. --draft writes the runner world for a play on the Mac (no clips: every
 * line a subtitle; the bodies at the addresses --cast gives, which for Mandi and Jay are a local dev server's). --lines
 * writes the casting sheet: every spoken line, by speaker, with the id and the voice key its clip will be named by.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { toRunnerPack } from '../storykit/pack/gate.ts';
import { voicePlanOf } from '../storykit/pack/runner.ts';
import { gateHometown, cityTableOf } from '../storykit/hometown/hometown-gate.ts';
import { cityLock, townName, type CityPackage } from '../storykit/hometown/city-package.ts';
import { phoneLines } from './storykit-showcase.ts';

export const MR_ID = 'mandis-revenge';
export const MR_PACK = `storykit/packs/${MR_ID}.json`;
export const MR_TOWN = `storykit/showcase/${MR_ID}/town.json.gz`;
/** The private premium bodies: never copied into this repo (the README says how the pack reaches them). */
export const PREMIUM = ['mandi', 'jay'];

export const mrTown = (): CityPackage => JSON.parse(gunzipSync(readFileSync(MR_TOWN)).toString('utf8'));
export function mrGate() {
  const town = mrTown(), raw = JSON.parse(readFileSync(MR_PACK, 'utf8'));
  return { town, raw, g: gateHometown(raw, town, { showcase: true }) };
}

/** The runner world for a play on the Mac: no clips, the bodies at `cast` (id -> url). */
export function mrDraft(cast: Record<string, string>) {
  const { town, g } = mrGate();
  if (!g.ok || !g.pack) throw new Error(`${MR_ID} is refused: ${g.problems.slice(0, 5).join(' | ')}`);
  const pack = g.pack;
  if (JSON.stringify(cityLock(town)) !== JSON.stringify(pack.base.hometown)) throw new Error(`${MR_ID}: base.hometown is not ${MR_TOWN}'s pin`);
  const plan = voicePlanOf(pack, '', cityTableOf(town));
  const phone = phoneLines(pack);
  const voice = { ...plan, lines: (plan.lines as any[]).map((l) => (phone.has(l.id) ? { ...l, fx: 'phone' } : l)), clips: {} };
  const world = { ...toRunnerPack(pack, { cast, clips: 'cast/cast-clips.glb', townName: townName(town) }), voice };
  return { world: JSON.stringify(world), plan, pack };
}

/** LINES.md: every spoken line, in the order it plays, for casting (clips are keyed by a hash of the text and voice). */
export function mrLines(): string {
  const { town, g } = mrGate();
  if (!g.ok || !g.pack) throw new Error(`${MR_ID} is refused: ${g.problems.slice(0, 5).join(' | ')}`);
  const pack = g.pack, plan = voicePlanOf(pack, '', cityTableOf(town)), ls = plan.lines as any[];
  const names = new Map(pack.cast.map((c: any) => [c.id, c.sheet?.name ?? c.name ?? c.id]));
  const by = new Map<string, number>();
  for (const l of ls) by.set(l.who, (by.get(l.who) || 0) + 1);
  const out = ["# Mandi's Revenge: the spoken lines", '',
    `Written by \`scripts/storykit-showcase-mandi.ts --lines\` from \`${MR_PACK}\` (do not edit by hand). Every line is a subtitle until its clip is`,
    'recorded; a clip is named by the hash of its text and its voice (`clip` below), so a changed line needs a new clip.', '',
    `${ls.length} spoken lines, ${new Set(ls.map((l) => l.clip)).size} clips to record.`, '', '| speaker | lines |', '|---|---:|',
    ...[...by].sort((a, b) => b[1] - a[1]).map(([w, n]) => `| ${names.get(w) ?? w} | ${n} |`), '',
    '| # | id | speaker | line | clip |', '|---:|---|---|---|---|'];
  ls.forEach((l, i) => out.push(`| ${i + 1} | \`${l.id}\` | ${names.get(l.who) ?? l.who} | ${String(l.text).replace(/\|/g, '\\|')} | \`${l.clip}\` |`));
  return out.join('\n') + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.includes('--gate')) {
    const { g } = mrGate();
    console.log(JSON.stringify({ ok: g.ok, problems: g.problems, warnings: g.warnings, clamped: g.clamped, lines: g.lines.length }, null, 1));
    process.exit(g.ok ? 0 : 1);
  }
  const di = args.indexOf('--draft');
  if (di >= 0) {
    const ci = args.indexOf('--cast');
    const cast = ci >= 0 ? Object.fromEntries(String(args[ci + 1]).split(',').filter(Boolean).map((kv) => kv.split('=') as [string, string])) : {};
    const w = mrDraft(cast);
    writeFileSync(args[di + 1], w.world);
    console.log(`wrote ${args[di + 1]}: ${w.world.length} bytes, ${(w.plan.lines as any[]).length} spoken lines`);
    process.exit(0);
  }
  const li = args.indexOf('--lines');
  if (li >= 0) { writeFileSync(args[li + 1], mrLines()); console.log(`wrote ${args[li + 1]}`); process.exit(0); }
  console.error('usage: storykit-showcase-mandi.ts --gate | --draft <out.json> --cast id=url,... | --lines <LINES.md>');
  process.exit(2);
}
