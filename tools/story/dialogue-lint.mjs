// Mog City: the dialogue lint (report only; it never fails a build). Reads the spoken lines the way the voice build
// does, but keeps them in the groups they are written in: a cutscene's LINES, a call's main / extra / wrap blocks, a
// story pack's cutscene shots and call lines. Then it measures each group against the dialogue rules (docs/DIALOGUE.md):
//   W1  turn rhythm: median words 5-8, at least 25 % of lines 4 words or fewer, at least 15 % questions (and one in any
//       group of 4+ lines with a median over 5 words: a beat of 3 or fewer, or a quick-fire run of barks and one-liners, is
//       exempt), one speaker at most 3 lines in a row in a call and 2 in a cutscene, a line at most 3
//       sentences in a call and 2 in a cutscene
//   W2  pure prompt lines (a short question or a trail-off that only hands the scene back) at most 1 in 4 of a speaker's
//   W3  no 3 plot lines in a row (heuristic: a long statement carrying a name, a number or a plot noun, no joke or reaction)
//   W6  authored pauses at most 1 per 8 lines
//   W7  the last line is not an instruction or the objective
// Groups of pooled alternatives (a call's react pools, barks) are skipped: they are not a conversation.
//   node tools/story/dialogue-lint.mjs                      every mission scene and call (Mog City's own)
//   node tools/story/dialogue-lint.mjs --only m2-scenes,calls   files by name
//   node tools/story/dialogue-lint.mjs --pack <pack.json>   a story pack's cutscenes and calls (repeatable)
//   --json  the full report as JSON · --all  list passing groups too
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const ONLY = (opt('--only') || '').split(',').filter(Boolean);
const PACKS = args.flatMap((a, i) => (a === '--pack' ? [args[i + 1]] : []));

/* ------------------------------------------------------------- reading -- */
const STR = String.raw`"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'`;
const lit = (s) => Function(`return ${s}`)();
// ['Speaker', COLOUR, 'text'] or ['Speaker', COLOUR, 'text', 0.6] or ['Speaker', COLOUR, 'text', { pause, how, ... }]
const TUPLE = new RegExp(String.raw`\[\s*(${STR})\s*,\s*(?:[A-Z_]+|${STR})\s*,\s*(${STR})\s*(?:,\s*([\d.]+|\{[^{}\]]*\})\s*)?\]`, 'g');
// the '[' that opens the array a position sits in (strings and comments skipped), and the key written before it
function parentOf(src, at) {
  let depth = 0;
  for (let i = at - 1; i >= 0; i--) {
    const c = src[i];
    if (c === ']' || c === '}' || c === ')') depth++;
    else if (c === '[' || c === '{' || c === '(') { if (depth === 0) return c === '[' ? i : -1; depth--; }
    else if (c === "'" || c === '"' || c === '`') { for (i--; i >= 0 && src[i] !== c; i--); }
  }
  return -1;
}
const keyBefore = (src, i) => /([A-Za-z_$][\w$]*)\s*[:=]\s*$/.exec(src.slice(Math.max(0, i - 60), i))?.[1] || '';
export function groupsOfSource(file, src) {
  const by = new Map();
  for (const m of src.matchAll(TUPLE)) {
    const who = lit(m[1]), text = lit(m[2]);
    if (!/^[A-Z][A-Za-z .']{0,23}$/.test(who) || !/[a-z]/i.test(text)) continue;
    let beat = {};
    if (m[3]) beat = /^[\d.]+$/.test(m[3]) ? { pause: +m[3] } : Function(`return (${m[3]})`)();
    const p = parentOf(src, m.index);
    if (!by.has(p)) by.set(p, { file, at: src.slice(0, p).split('\n').length, key: keyBefore(src, p), lines: [] });
    by.get(p).lines.push({ who, text, ...beat });
  }
  return [...by.values()];
}
// a story pack (a world.json, or a GameMog pack around one): its cutscenes' lines in shot order, its calls' lines
export function groupsOfPack(file, pack) {
  const out = [], w = pack.world || pack;
  const shotLines = (shots) => (shots || []).flatMap((s) => [
    ...(Array.isArray(s.lines) ? s.lines.map((l) => (Array.isArray(l) ? { who: l[0], text: l[1] } : l)) : []),
    ...(Array.isArray(s.say) ? [{ who: s.say[0], text: s.say[1] }] : s.say && s.say.text ? [s.say] : []),
    ...(Array.isArray(s.sub) && s.sub[0] ? [{ who: s.sub[0], text: s.sub[1] }] : []),
  ]).map((l) => ({ ...l, who: String(l.who || ''), text: String(l.text || '') })).filter((l) => l.who && l.text);
  if (w.opening?.shots) out.push({ file, at: 'opening', key: 'cutscene', lines: shotLines(w.opening.shots) });
  const tup = (l) => (Array.isArray(l) ? { who: l[0], text: l[1] } : l);
  // (every step, the ones nested in a drive's `during` too)
  const walk = (s, where) => {
    if (!s || typeof s !== 'object') return;
    if (Array.isArray(s)) { s.forEach((x, i) => walk(x, where)); return; }
    if ((s.type === 'cutscene' || s.type === 'vignette') && Array.isArray(s.shots)) out.push({ file, at: where, key: 'cutscene', lines: shotLines(s.shots) });
    if ((s.type === 'call' || s.type === 'callWaiting') && Array.isArray(s.lines)) out.push({ file, at: where, key: 'call', lines: [...s.lines, ...(s.wrap || [])].map(tup) });
    for (const k of ['during', 'then', 'steps', 'branches', 'yes', 'no', 'on']) if (s[k]) walk(s[k], where);
  };
  for (const m of w.missions || []) (m.steps || []).forEach((s, i) => walk(s, `${m.id || 'mission'}.s${i + 1}`));
  return out.filter((g) => g.lines.length);
}

/* ------------------------------------------------------------ measuring -- */
const words = (t) => String(t).replace(/^\.\.\.\s*/, '').split(/\s+/).filter((x) => /[a-z0-9]/i.test(x));
const sentences = (t) => (String(t).replace(/\.\.\./g, '…').replace(/\b(Mr|Ms|Mrs|Dr|St|Ave)\./g, '$1').match(/[^.?!…]+[.?!…]+['"’]?|[^.?!…]+$/g) || []).filter((s) => words(s).length > 1).length;
const isQ = (t) => /\?/.test(t);
// (a prompt: a short question or trail-off that only hands the scene back, "He bought a painting?", "And whoever...")
const isPrompt = (L, prev) => !!prev && prev.who !== L.who && words(L.text).length <= 6 && (isQ(L.text) || /\.\.\.$/.test(L.text.trim())) && /^(\.\.\.\s*)?(and|so|where|what|why|who|how|he|she|they|it|you)\b/i.test(L.text.trim());
const PLOT = /\b(key|laptop|truck|log|logs|trade|trades|confession|signing|merger|crates?|manifest|van|burner|SIM|twin|chopper|pilot|wristband|pass|plan|vault|evidence|deal|account|code|password|camera|server)\b/i;
const NUM = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|ninety|hundred|first|second|third)\b/i;
// (a plot line: a statement of 8+ words carrying a plot noun, a number or a name mid-sentence; a joke, an aside or a
// reaction is not: a simile, a 'very', an exclamation)
const midName = (t) => /[^.?!…\s]\s+(?!I\b)[A-Z][a-z]+/.test(String(t).replace(/^\.\.\./, ''));
export const isPlot = (L) => { const w = words(L.text); return w.length >= 8 && !isQ(L.text) && !/!/.test(L.text) && (PLOT.test(L.text) || NUM.test(L.text) || midName(L.text)) && !/\b(like a|like the|very|ish|mostly|probably|jealous|bad at)\b/i.test(L.text); };
const IMPERATIVE = /^(go|get|take|find|bring|follow|drive|head|meet|grab|hurry|move|run|steal|reach)\b/i;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };

export function lint(g) {
  const kind = /calls\.js$/.test(g.file) || /^call\b/.test(g.key) || /^(main|extra|wrap)$/.test(g.key) ? 'call' : 'scene';
  const L = g.lines, n = L.length, fails = [], notes = [];
  const wc = L.map((l) => words(l.text).length), med = median(wc);
  const short = L.filter((l, i) => wc[i] <= 4).length / n, qs = L.filter((l) => isQ(l.text)).length;
  let run = 1, maxRun = 1; for (let i = 1; i < n; i++) { run = L[i].who === L[i - 1].who ? run + 1 : 1; maxRun = Math.max(maxRun, run); }
  const maxSent = Math.max(...L.map((l) => sentences(l.text)));
  const speakers = [...new Set(L.map((l) => l.who))];
  const prompt = {}; L.forEach((l, i) => { if (isPrompt(l, L[i - 1])) prompt[l.who] = (prompt[l.who] || 0) + 1; });
  let plotRun = 0, maxPlot = 0; for (const l of L) { plotRun = isPlot(l) ? plotRun + 1 : 0; maxPlot = Math.max(maxPlot, plotRun); }
  const pauses = L.filter((l) => l.pause != null && l.pause >= 0.5).length;
  const last = L[n - 1];
  const m = { kind, lines: n, speakers: speakers.length, medianWords: med, short: +short.toFixed(2), questions: +(qs / n).toFixed(2), maxRun, maxSentences: maxSent, maxPlotRun: maxPlot, pauses, prompts: prompt, last: last.text };
  if (n >= 3) {
    if (med > 8) fails.push(`W1 median line ${med} words (5-8)`);
    if (short < 0.25) fails.push(`W1 ${Math.round(short * 100)}% short lines (25%+ of 4 words or fewer)`);
    // (round 3: a beat of 3 lines or fewer, or a quick-fire run of barks and one-liners (median 5 words or fewer: a
    // villain's put-down and its answer, "Don't sir me."), needs no question: asking one there only made filler, "Did
    // you check your DMs?", "Did you just sir me?")
    if (qs === 0 && n > 3 && med > 5) fails.push('W1 no question');
    else if (qs / n < 0.15 && kind === 'call') notes.push(`W1 ${Math.round((qs / n) * 100)}% questions (15%+)`);
  }
  const runMax = kind === 'call' ? 3 : 2, sentMax = kind === 'call' ? 3 : 2;
  if (maxRun > runMax) fails.push(`W1 one speaker ${maxRun} lines in a row (${runMax} at most)`);
  if (maxSent > sentMax) fails.push(`W1 a line of ${maxSent} sentences (${sentMax} at most)`);
  if (kind === 'scene' && n >= 3 && speakers.length < 2) fails.push('W2 one speaker only');
  for (const w of speakers) { const k = L.filter((l) => l.who === w).length; if (k >= 3 && (prompt[w] || 0) / k > 0.25) fails.push(`W2 ${w}: ${prompt[w]} of ${k} lines are prompts (1 in 4 at most)`); }
  if (maxPlot >= 3) fails.push(`W3 ${maxPlot} plot lines in a row`);
  if (pauses > Math.max(1, Math.floor(n / 8))) fails.push(`W6 ${pauses} authored pauses in ${n} lines (1 per 8)`);
  if (n >= 3 && IMPERATIVE.test(last.text.trim())) fails.push(`W7 ends on an instruction: "${last.text}"`);
  if (kind === 'scene' && n > 8) fails.push(`F2 ${n} lines (8 at most in a cutscene)`);
  return { ...m, fails, notes };
}

/* ---------------------------------------------------------------- run -- */
function sources() {
  const dir = path.join(ROOT, 'wagmi/mission'), files = fs.readdirSync(dir).filter((f) => /\.js$/.test(f)).map((f) => path.join(dir, f));
  files.push(path.join(ROOT, 'wagmi/intro.js'));
  return files.filter((f) => !ONLY.length || ONLY.includes(path.basename(f, '.js')));
}
// (a pool: every line one speaker's, under a key that is not a conversation: barks, react pools, cues, PAUSE / RESUME)
const isPool = (g) => g.lines.length < 2 || (new Set(g.lines.map((l) => l.who)).size === 1 && !/^(LINES|MEET_LINES|main|wrap|cutscene|call\b.*)$/.test(g.key)) || /^(PAUSE|RESUME|barks|tooClose|spotted|hit|lost|seen|fled|cues)$/i.test(g.key);
// (a car call is one conversation: its main, extra and wrap blocks measured together, as the player hears them)
function byCall(src, gs) {
  const heads = [...src.matchAll(/^ {2}'([a-z0-9-]+)': \{/gm)].map((m) => ({ id: m[1], line: src.slice(0, m.index).split('\n').length }));
  const out = new Map();
  for (const g of gs) {
    if (isPool(g)) continue;
    const h = heads.filter((x) => x.line < g.at).at(-1); if (!h) continue;
    if (!out.has(h.id)) out.set(h.id, { file: g.file, at: h.line, key: `call ${h.id}`, lines: [] });
    out.get(h.id).lines.push(...g.lines);
  }
  return [...out.values()];
}
// W1 over a whole file or pack: median 5-8 words, 25 %+ short, 15 %+ questions
export function aggregate(gs) {
  const L = gs.flatMap((g) => g.lines), wc = L.map((l) => words(l.text).length), n = Math.max(1, L.length);
  const med = median(wc), short = Math.round((100 * wc.filter((w) => w <= 4).length) / n), q = Math.round((100 * L.filter((l) => isQ(l.text)).length) / n);
  const multi = Math.round((100 * L.filter((l) => sentences(l.text) > 1).length) / n);
  return { lines: L.length, med, short, q, multi, ok: med >= 4 && med <= 8 && short >= 25 && q >= 15 };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  let groups = [];
  if (!PACKS.length || ONLY.length) for (const f of sources()) { const src = fs.readFileSync(f, 'utf8'), gs = groupsOfSource(path.relative(ROOT, f), src); groups.push(...(/calls\.js$/.test(f) ? byCall(src, gs) : gs)); }
  for (const p of PACKS) groups.push(...groupsOfPack(p, JSON.parse(fs.readFileSync(p, 'utf8'))));
  groups = groups.filter((g) => !isPool(g));
  const rep = groups.map((g) => ({ where: `${g.file}:${g.at}${g.key ? ` ${g.key}` : ''}`, ...lint(g) }));
  if (args.includes('--json')) { console.log(JSON.stringify(rep, null, 1)); process.exit(0); }
  const byFile = {};
  for (const r of rep) (byFile[r.where.split(':')[0]] ||= []).push(r);
  for (const [f, rs] of Object.entries(byFile)) {
    const all = rs.flatMap((r) => r), n = all.reduce((s, r) => s + r.lines, 0);
    const bad = rs.filter((r) => r.fails.length), A = aggregate(groups.filter((g) => g.file === f));
    console.log(`\n${f}: ${rs.length} groups, ${n} lines, ${bad.length} failing. W1 overall: median ${A.med}w, ${A.short}% short, ${A.q}% questions, ${A.multi}% multi-sentence ${A.ok ? 'ok' : 'FAIL'}`);
    for (const r of rs) if (r.fails.length || args.includes('--all')) {
      console.log(`  ${r.fails.length ? 'FAIL' : 'ok  '} ${r.where.split(':').slice(1).join(':')} [${r.kind}, ${r.lines} lines] med ${r.medianWords}w short ${Math.round(r.short * 100)}% q ${Math.round(r.questions * 100)}% run ${r.maxRun} sent ${r.maxSentences}`);
      for (const x of r.fails) console.log(`       - ${x}`);
    }
  }
  const failing = rep.filter((r) => r.fails.length).length;
  console.log(`\n${rep.length} groups, ${failing} failing (report only)`);
}
