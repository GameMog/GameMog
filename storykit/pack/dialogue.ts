/**
 * Story Kit: how people talk, read back from a pack (DIALOGUE AND SCENE FLOW SPEC v1, 16 Nov 2026; storykit/BUILDER.md
 * "How people talk"). The owner: "in general dialogue is stiff and robotic across entire platform, the gold standard is
 * Jane to Dan over the cell phone when he drives around". The bar is Mog City's own car-phone call (wagmi/mission/calls.js
 * m1-drive): short two-way turns, questions, a joke after each fact, specific detail, one plain sincere beat, a button.
 *
 *   dialogueScenes(pack)   every cutscene, the opening and every call, as its lines in order (a v2 pack, or the runner's
 *                          format a stored world plays: speakers then are display names, cutscene lines are `sub` tuples)
 *   dialogueNotes(pack)    the soft checks (GM3): repair notes for a Create's first pass, never a fail
 *   dialogueSendsBack(n)   whether the notes alone are worth a second writing pass (DIALOGUE_SEND_BACK or more)
 *   dialogueStats(lines)   the numbers the spec's thresholds are written in (W1): median words, short lines, questions
 *
 * The soft checks, each a pattern the spec bans or a rhythm it asks for:
 *   - a cutscene (or the opening) of 3 or more lines with no question (W1)
 *   - one speaker saying 3 or more lines in a row in a cutscene, 4 or more in a call (W1)
 *   - a line of 3 or more sentences in a cutscene, 4 or more in a call (W1). A sentence here has 3 words or more: the
 *     gold standard's clipped beats ("...Okay.", "Take Ninth.") are rhythm, not sentences
 *   - a cutscene or standing line that says its mission's objective (or the next one's) out loud (B4; the HUD says it):
 *     two thirds or more of the shorter of the two in the same words, 2 words at least ("Elena has the crates. I need
 *     Elena." before "Load Elena's crates..."). A call may brief the way there: that is what the drive's talk is for (F1)
 *   - a cutscene of 2 or more lines said by one person (B6: a monologue; split it across the speakers or move it to a call)
 *   - a speaking person with no voice sheet (W9: cast[].speech)
 * No model call: these are counts and word overlaps, so they cost nothing and never break a build.
 */
type Json = any;
export type SceneLine = { who: string; text: string; how?: string; pre?: number };
export type Scene = { at: string; kind: 'opening' | 'cutscene' | 'call' | 'say'; mission: string | null; objectives: string[]; lines: SceneLine[] };

const flat = (steps: Json[] = []): Json[] => steps.flatMap((x) => (x && typeof x === 'object' ? [x, ...flat(x.during), ...flat(x.do)] : []));
const objectivesOf = (m: Json) => flat(m?.steps).map((x) => x.objective).filter((o) => typeof o === 'string');
// a line as either format writes it: a v2 { who, text }, a runner tuple [who, text, secs] or object
const asLine = (l: Json): SceneLine | null => {
  if (Array.isArray(l)) return typeof l[1] === 'string' && l[1] ? { who: String(l[0] ?? ''), text: l[1] } : null;
  if (l && typeof l === 'object' && typeof l.text === 'string') return { who: String(l.who ?? ''), text: l.text, ...(l.how ? { how: l.how } : {}), ...(l.pre != null ? { pre: l.pre } : {}) };
  return null;
};
// a cutscene or opening shot's lines: say + line (v2), sub [who, text] (the runner's), or an exchange (lines)
const shotLines = (sh: Json): SceneLine[] => {
  if (!sh || typeof sh !== 'object') return [];
  if (Array.isArray(sh.lines)) return sh.lines.map(asLine).filter(Boolean) as SceneLine[];
  if (sh.say && typeof sh.line === 'string') return [{ who: String(sh.say), text: sh.line, ...(sh.how ? { how: sh.how } : {}) }];
  if (Array.isArray(sh.sub) && sh.sub[0] && typeof sh.sub[1] === 'string') return [{ who: String(sh.sub[0]), text: sh.sub[1], ...(sh.how ? { how: sh.how } : {}) }];
  return [];
};
const key = (who: string) => who.toLowerCase();

/** Every scene of talk in a pack: its opening, its cutscenes and its calls, each as its lines in order. */
export function dialogueScenes(pack: Json): Scene[] {
  const out: Scene[] = [];
  const missions: Json[] = Array.isArray(pack?.missions) ? pack.missions : (pack?.acts ?? []).flatMap((a: Json) => a?.missions ?? []);
  if (pack?.opening?.shots) out.push({ at: 'opening', kind: 'opening', mission: missions[0]?.id ?? null, objectives: objectivesOf(missions[0]), lines: pack.opening.shots.flatMap(shotLines) });
  missions.forEach((m: Json, mi: number) => {
    const objectives = objectivesOf(m), ahead = [...objectives, ...objectivesOf(missions[mi + 1])];
    (m?.steps ?? []).forEach((s0: Json, i: number) => {
      if (s0?.type === 'say' && typeof s0.text === 'string') out.push({ at: `${m.id} step ${i + 1}`, kind: 'say', mission: m.id, objectives: ahead, lines: [{ who: String(s0.who ?? ''), text: s0.text }] });
      for (const s of flat([s0])) {
        const at = `${m.id} step ${i + 1}${s === s0 ? '' : ' (during)'}`;
        if (s.type === 'cutscene' && Array.isArray(s.shots)) out.push({ at, kind: 'cutscene', mission: m.id, objectives, lines: s.shots.flatMap(shotLines) });
        // (a video call: its spoken lines, a call's (3 in a row, 3 sentences); the events between them are not talk)
        if (s.type === 'vcall' && Array.isArray(s.lines)) {
          const lines = s.lines.filter((l: Json) => l && l.do == null).map((l: Json) => asLine({ ...l, text: l.text ?? l.line })).filter(Boolean) as SceneLine[];
          if (lines.length) out.push({ at, kind: 'call', mission: m.id, objectives, lines });
        }
        if (s.type === 'call') {
          const lines = [...(s.lines ?? []), ...(s.extra ?? []).flat(), ...(s.wrap ?? [])].map(asLine).filter(Boolean) as SceneLine[];
          if (lines.length) out.push({ at, kind: 'call', mission: m.id, objectives, lines });
        }
      }
    });
  });
  return out;
}

const STOP = new Set(('a an the and or but of to in on at by for with from into onto off out up down over under is are was were be been am i you he she it we they ' +
  'me him her us them my your his its our their this that these those there here then than so not no do does did have has had will would can could ' +
  'get got go just now all one before after as if what who why how where when tell').split(' '));
/** A text's content words: lower case, no markup ({ride}, **bold**), no possessive 's, no stop words. */
export const contentWords = (t: string) => new Set(String(t).replace(/\{[^}]*\}/g, ' ').replace(/\*\*/g, '').toLowerCase().replace(/['’]s\b/g, '')
  .split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => (w.length > 4 ? w.replace(/(ing|ed|s)$/, '') : w)));
/** How much a line and an objective say the same: the words they share over the shorter one's (0 to 1; 0 under 2 shared). */
export function objectiveShare(line: string, objective: string) {
  const o = contentWords(objective), l = contentWords(line);
  let n = 0; for (const w of o) if (l.has(w)) n++;
  return n < 2 ? 0 : n / Math.min(o.size, l.size);
}
const words = (t: string) => String(t).split(/\s+/).filter(Boolean).length;
/** Sentences in a line of 3 words or more ("..." a trail-off, not a break; "Mr." no break; "Okay." a beat, not a sentence). */
export const sentences = (t: string) => String(t).replace(/\b(Mr|Mrs|Ms|Dr|St)\./g, '$1').replace(/\.\.\.|…/g, ',').split(/[.?!]+(?=\s|$)/).filter((s) => words(s.replace(/[^\w' ]/g, ' ')) >= 3).length;

/** W1's numbers over some lines: median words, the share of 4 words or fewer, of questions, of lines of 2+ sentences. */
export function dialogueStats(lines: SceneLine[]) {
  const n = lines.length, w = lines.map((l) => words(l.text)).sort((a, b) => a - b);
  const pct = (k: number) => (n ? Math.round(100 * k / n) : 0);
  return { lines: n, medianWords: n ? w[n >> 1] : 0, shortPct: pct(lines.filter((l) => words(l.text) <= 4).length),
    questionPct: pct(lines.filter((l) => /\?/.test(l.text)).length), multiSentencePct: pct(lines.filter((l) => sentences(l.text) >= 2).length) };
}

/**
 * The notes that send a Create back for a second writing pass on their own (a second pass is a second model call, the
 * dearest part of a build). Under this, a first pass whose dialogue reads a little stiff ships, its notes in the trail;
 * a first pass sent back anyway (the gate, pacing) carries its dialogue notes with it at no extra cost. Measured 16 Nov
 * on the model-written replies in the repo (storykit/hometown/fixtures/*.reply.json): each has 2 notes (one long line,
 * no voice sheets), so at 1 every Create took a second pass for dialogue alone and at 4 none of them does; the old-way
 * scene in scripts/storykit-dialogue-check.ts (a logline to camera, a monologue, the objective said) has 7 and goes back.
 */
export const DIALOGUE_SEND_BACK = 4;
export const dialogueSendsBack = (notes: string[]) => notes.length >= DIALOGUE_SEND_BACK;

const clip = (t: string, n = 60) => (t.length > n ? `${t.slice(0, n - 3)}...` : t);
/**
 * The soft checks (GM3), as repair notes for the builder (at most `max`). Speakers are matched by id or by name, so a
 * runner-format pack reads the same. `voiceSheets`: also note speaking people with no voice sheet (a v2 pack's cast).
 */
export function dialogueNotes(pack: Json, { max = 10, voiceSheets = true }: { max?: number; voiceSheets?: boolean } = {}): string[] {
  const out: string[] = [];
  const where = (s: Scene) => (s.kind === 'opening' ? 'the opening' : `${s.at} (${s.kind})`);
  for (const s of dialogueScenes(pack)) {
    const L = s.lines;
    if (!L.length) continue;
    if (s.kind === 'say') { const o = s.objectives.find((x) => objectiveShare(L[0].text, x) >= 2 / 3); if (o) out.push(`Dialogue: ${s.at} (say): "${clip(L[0].text)}" says the objective out loud ("${clip(o.replace(/\*\*/g, ''), 50)}"); the HUD already says it. Give the line a reaction, a joke or a detail instead (B4).`); continue; }
    const scene = s.kind !== 'call';
    if (scene && L.length >= 3 && !L.some((l) => /\?/.test(l.text))) out.push(`Dialogue: ${where(s)} has ${L.length} lines and no question. People dodge, push and tease with questions: turn one statement into a question the other answers (BUILDER.md, How people talk, W1).`);
    if (scene && L.length >= 2 && new Set(L.map((l) => key(l.who))).size === 1) out.push(`Dialogue: ${where(s)} is one person talking (${L.length} lines from ${L[0].who}). A scene is an exchange: give the other person lines that answer, dodge or joke, or move it to a call on the drive (B6).`);
    const most = scene ? 2 : 3;
    let run = 1;
    for (let i = 1; i < L.length; i++) { run = key(L[i].who) === key(L[i - 1].who) ? run + 1 : 1; if (run === most + 1) { out.push(`Dialogue: ${where(s)}: ${L[i].who} says ${run} lines in a row ("${clip(L[i - most].text, 40)}" ...). Cut in with the other person after ${most} (W1).`); break; } }
    for (const l of L) if (sentences(l.text) > most) { out.push(`Dialogue: ${where(s)}: "${clip(l.text)}" is ${sentences(l.text)} sentences. At most ${most} a line ${scene ? 'in a scene' : 'on a call'}; give the rest to the other person as an answer (W1).`); break; }
    const said = !scene ? null : L.map((l) => ({ l, o: s.objectives.find((o) => objectiveShare(l.text, o) >= 2 / 3) })).find((x) => x.o);
    if (said) out.push(`Dialogue: ${where(s)}: "${clip(said.l.text)}" says the objective out loud ("${clip(String(said.o).replace(/\*\*/g, ''), 50)}"); the HUD already says it. Give the line a reaction, a joke or a detail instead (B4).`);
  }
  if (voiceSheets && Array.isArray(pack?.cast) && Array.isArray(pack?.acts)) {
    const speaking = new Set(dialogueScenes(pack).flatMap((s) => s.lines.map((l) => l.who)));
    const none = pack.cast.filter((c: Json) => c && speaking.has(c.id) && !c.speech?.rhythm && !c.model).map((c: Json) => c.id);
    if (none.length) out.push(`Dialogue: ${none.map((id: string) => `"${id}"`).join(', ')} ${none.length > 1 ? 'speak but have' : 'speaks but has'} no voice sheet (cast[].speech: rhythm, habit, jokes, never, motifs). Write one for every speaking person and write each line to it (W9).`);
  }
  return out.slice(0, max);
}
