/**
 * Story Kit: how people talk (DIALOGUE AND SCENE FLOW SPEC v1, 16 Nov 2026). Part of `npm run check`; alone:
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-dialogue-check.ts
 *
 * The owner: "dialogue is stiff and robotic across entire platform, the gold standard is Jane to Dan over the cell
 * phone". No model call here: what is checked is what the builder is told and what the build's read-back sends back.
 *   - the prompt: BUILDER.md's "How people talk" chapter (the rules, the banned patterns, the bar's excerpt marked never
 *     to reuse), the premise as an exchange, wants shown in what people ask for and refuse, the dialogue read-back, the
 *     voices steered off slow and even; the worked example's opening a two-hander, its villain no longer slow and even
 *   - the read-back (storykit/pack/dialogue.ts): a scene written the old way (a logline to camera, a monologue, a line
 *     saying the objective, no question) is sent back on each count, the same scene rewritten passes, the bar itself
 *     passes, and the worked example passes
 *   - the schema: how, pre, post, overlap on any line, an exchange in one shot (lines), react pools and a register on a
 *     call, a voice sheet on a cast member; every one optional, so a pack without them gates as before; the runner pack
 *     carries them (an exchange as one shot's `lines`, a delivered line as a `say` object)
 *   - the voice step: a line's how in its clip name, a line without one named exactly as before (no world re-voiced),
 *     a shout at least 3 dB above a hushed line from the same render, sentences split with a beat between
 */
import { readFileSync } from 'node:fs';
import { storykitSystem, exampleWorld } from '../lib/storykit-build.ts';
import { gatePack, toRunnerPack } from '../storykit/pack/gate.ts';
import { dialogueNotes, dialogueSendsBack, DIALOGUE_SEND_BACK, dialogueScenes, dialogueStats, sentences, objectiveShare } from '../storykit/pack/dialogue.ts';
import { voicePlanOf } from '../storykit/pack/runner.ts';
import { clipBase, clipKey, voiceKey, lineHash, shape, finish, deliveredBlock, splitSentences, joinSentences, HOW, lintVoiceBlock, SAMPLE_RATE, resample, pitchRatio } from '../storykit/voices/voice-design.js';

type Ok = (name: string, cond: boolean, detail?: string) => void;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const NS = () => JSON.parse(readFileSync('storykit/packs/test-night-shift.json', 'utf8'));

// a scene written the old way: every banned pattern the spec names, in one mission (the spec's own examples)
const BEFORE = {
  opening: { place: '@bowery', shots: [
    { say: 'artie', line: 'I build cars for floods and bad men. Tonight a storm brought me both.' },
    { say: 'elena', line: "Pier T. Hale's moving the crates before the harbor radar clears." },
    { say: 'hale', line: 'Six crates on the water by first light. Anyone in the way goes in with them.' },
  ] },
  acts: [{ id: 'act1', missions: [{ id: 'CH-1', steps: [
    { type: 'drive', to: '@pier', objective: "Load **Elena's crates** into the {ride}'s trunk." },
    { type: 'cutscene', shots: [{ say: 'elena', line: 'Thank you, Artie. Truly.' }, { say: 'elena', line: "Hale's cash, Hale's manifest. And the police find the man holding nothing." }] },
    { type: 'cutscene', shots: [{ say: 'rook', line: 'The truck leaves at nine. The key is in the visor. You get ninety seconds at the gate.' }, { say: 'rook', line: 'Wristband on the left. Chopper at the far pad.' }, { say: 'rook', line: 'Do not be late.' }, { say: 'dan', line: 'Okay.' }] },
    { type: 'say', who: 'artie', text: 'Elena has the crates. I need Elena.' },
  ] }] }],
  cast: [{ id: 'artie' }, { id: 'elena' }, { id: 'hale' }, { id: 'rook' }, { id: 'dan' }],
};
// the same beats rewritten to the rules: an exchange, a question in each scene, nobody saying the objective
const AFTER = {
  opening: { place: '@bowery', shots: [
    { say: 'elena', line: 'You fix flood cars?' }, { say: 'artie', line: 'Flood cars, bad men. Tonight, both?' },
    { say: 'hale', line: "Your daughter drives the blue one, Artie. Doesn't she?" },
  ] },
  acts: [{ id: 'act1', missions: [{ id: 'CH-1', steps: [
    { type: 'drive', to: '@pier', objective: "Load **Elena's crates** into the {ride}'s trunk." },
    { type: 'cutscene', shots: [{ say: 'elena', line: 'You called them?' }, { say: 'artie', line: 'I called my insurance guy. Same thing.' }] },
    { type: 'cutscene', shots: [{ say: 'rook', line: 'Why are you doing this?' }, { say: 'dan', line: 'He took my laptop. I take his painting.' }, { say: 'rook', line: 'Take what he loves. Then trade.' }, { say: 'dan', line: 'Exactly.' }] },
    { type: 'say', who: 'artie', text: 'Rain on the windshield. Good. Nobody looks up.' },
  ] }] }],
  cast: ['artie', 'elena', 'hale', 'rook', 'dan'].map((id) => ({ id, speech: { rhythm: 'short', habit: 'none', jokes: 'dry', never: 'sorry', motifs: ['rain'] } })),
};
// the bar (BUILDER.md's excerpt of Mog City's m1-drive), as a call: it must pass its own rules
const GOLD = { acts: [{ id: 'a', missions: [{ id: 'M1', steps: [{ type: 'drive', to: '@x', objective: 'Follow **the laptop** on the tracker.', during: [{ type: 'call', who: 'jane', auto: true, inCar: true, lines: [
  ['jane', 'Dan. Why is your laptop doing forty down Fifth Avenue?'], ['dan', 'Because some guys in a van took it.'], ['dan', "I'll take Sixth Avenue."],
  ['jane', 'Sixth goes uptown, babe. Take Ninth. It moves at six.'], ['dan', 'Love you. Getting it in before prison.'], ['jane', "Love you too. You didn't do this. So we prove it."],
  ['jane', "What's on fifty-one?"], ['dan', "Mr. Big. And his bathroom. It's a very big bathroom."], ['jane', 'Except the laptop.'], ['dan', 'Except the laptop.']].map(([who, text]) => ({ who, text })) }] }] }] }], cast: [] };

export function runDialogueChecks(ok: Ok) {
  console.log('\nStory Kit: how people talk (BUILDER.md, storykit/pack/dialogue.ts, the voice step)');

  // ── the prompt ──
  const sys = storykitSystem('ny');
  ok('the builder reads "How people talk": the rules, the delivery, where talk goes, the banned patterns', /## How people talk/.test(sys) && /Turn rhythm/.test(sys) && /Both people know something/.test(sys)
    && /One sincere beat per scene/.test(sys) && /End on a button/.test(sys) && /A voice sheet for every speaking person/.test(sys) && /\*\*Delivery\.\*\*/.test(sys) && /\*\*Where talk goes\.\*\*/.test(sys)
    && ['A logline to camera', 'The villain stating his plan', 'Narrating what is on screen', 'Saying the objective', 'A henchman relaying orders', 'A monologue briefing', 'A face explaining the twist'].every((b) => sys.includes(b)));
  const bar = sys.slice(sys.indexOf('The rhythm to match'), sys.indexOf('**The rules**'));
  const barLines = (bar.match(/^(JANE|DAN) {2,3}\S.*$/gm) || []).length;
  ok(`the bar: ${barLines} lines of Mog City's car phone (6 to 10), marked never to reuse`, barLines >= 6 && barLines <= 10 && /Never reuse these people or lines/.test(bar) && /Except the laptop\./.test(bar));
  ok('wants show in what people ask for and refuse (no longer "and says it")', /shows it in\s+what they ask for and refuse/.test(sys) && !/cuts against the hero, and says it/.test(sys));
  ok('the opening lets the premise land in an exchange, not loglines into the lens', /Let the premise land in an exchange/.test(sys) && /not each one saying a logline into the lens/.test(sys));
  ok('cutscenes: 4 to 8 lines, speakers alternating, 30 s at most; briefings are calls on the drive', /4 to 8\s+lines in all, the speakers alternating/.test(sys) && /a briefing is a call on the drive/.test(sys));
  ok('the self-check reads the dialogue back (a question, no objective said, each voice sheet, a sincere beat, a button)', /Then read the dialogue back/.test(sys) && /Does any line say the objective/.test(sys) && /Does it end on a button/.test(sys));
  ok('dialogue may trail off with "..." (the em-dash ban stays)', /use `\.\.\.` for a trail-off or a cut-off/.test(sys) && /no em dashes/.test(sys));
  ok('voices: leads graded A to B-, no D voice as a male lead\'s base, pitch within 1 semitone, no slow and even', /graded A to B-/.test(sys) && /never a D voice/.test(sys) && /within 1 semitone/.test(sys) && /A slow, even voice reads as a machine/.test(sys));
  ok('the Mog rule is untouched: copy every unchanged line exactly', /copy\s+everything the idea does not change exactly as it is \(same ids, same sheets, same voice blocks, same line text\)/.test(sys));
  ok('players never see the provider: the prompt names no model', !/\b(Claude|Anthropic|Opus|GPT)\b/.test(readFileSync('storykit/BUILDER.md', 'utf8')));

  // ── the worked example ──
  const ex = exampleWorld();
  const vic = ex.cast.find((c: any) => c.id === 'vic');
  ok(`the example's villain is no longer slow and even (speed ${vic?.voice?.speed}, "${vic?.voice?.description}")`, vic?.voice?.speed >= 0.98 && !/never raises his voice|unhurried/.test(vic?.voice?.description || ''));
  const open = (ex.opening?.shots || []).filter((s: any) => s.say);
  ok(`the example's opening is an exchange: ${open.length} lines, ${new Set(open.map((s: any) => s.say)).size} speakers, ${open.filter((s: any) => /\?/.test(s.line)).length} questions, no logline`,
    open.length >= 3 && new Set(open.map((s: any) => s.say)).size >= 3 && open.some((s: any) => /\?/.test(s.line)) && !open.some((s: any) => /Five years of nights|Every name in that bag owes me/.test(s.line)));
  ok('the example passes the read-back (no dialogue note)', dialogueNotes(ex).length === 0, dialogueNotes(ex).join(' | '));
  const exGate = gatePack(clone(ex));
  ok('the example passes the gate with its delivery tags and voice sheets', exGate.ok, exGate.problems.slice(0, 3).join('; '));
  ok('its opening lines carry their how into the voice plan', exGate.lines.filter((l) => /^OPEN\./.test(l.id) && l.how).length === open.length);

  // ── the read-back ──
  const before = dialogueNotes(BEFORE), after = dialogueNotes(AFTER);
  const has = (re: RegExp) => before.some((n) => re.test(n));
  ok(`a scene written the old way is sent back on each count (${before.length} notes)`, has(/the opening has 3 lines and no question/) && has(/CH-1 step 2 .* is one person talking/) && has(/CH-1 step 3 .*rook says 3 lines in a row/)
    && has(/"The truck leaves at nine.*is 3 sentences/) && has(/CH-1 step 4 \(say\).*says the objective out loud/), before.join('\n      '));
  ok('the same beats rewritten to the rules pass', after.length === 0, after.join(' | '));
  ok("the bar (Jane and Dan's car phone) passes its own rules", dialogueNotes(GOLD).length === 0, dialogueNotes(GOLD).join(' | '));
  const st = (p: any) => dialogueStats(dialogueScenes(p).flatMap((s) => s.lines));
  const b = st(BEFORE), a = st(AFTER);
  ok(`the rewrite moves the numbers toward the bar: questions ${b.questionPct}% -> ${a.questionPct}%, lines of 4 words or fewer ${b.shortPct}% -> ${a.shortPct}%, median words ${b.medianWords} -> ${a.medianWords}`,
    a.questionPct > b.questionPct && a.shortPct >= b.shortPct && a.medianWords < b.medianWords);
  const replies = ['okemah', 'okemah-us-4054200', 'sf'].map((f) => dialogueNotes(JSON.parse(readFileSync(new URL(`../storykit/hometown/fixtures/${f}.reply.json`, import.meta.url), 'utf8')).pack, { max: 8 }));
  ok(`the notes alone send a Create back only when its talk clearly fails (${DIALOGUE_SEND_BACK} notes or more): the old-way scene goes back, none of the model-written replies (${replies.map((r) => r.length).join(', ')} notes) does`,
    dialogueSendsBack(before) && !dialogueSendsBack(after) && replies.every((r) => r.length > 0 && !dialogueSendsBack(r)));
  ok("the build sends the notes back on their own only past the threshold, and with a pass sent back anyway", /if \(attempt === 1 && \(problems\.length \|\| dialogueSendsBack\(talk\)\)\) problems\.push\(\.\.\.talk\)/.test(readFileSync(new URL('../lib/storykit-build.ts', import.meta.url), 'utf8')));
  ok('"...Okay." and "Take Ninth." are beats, not sentences (the bar\'s lines are 3 or fewer)', sentences("...Okay. I'm on the tracker. They're cutting west. Who were they?") === 3 && sentences('Sixth goes uptown, babe. Take Ninth. It moves at six.') === 2);
  ok('a line that says the objective is found; a reaction is not', objectiveShare('Elena has the crates. I need Elena.', "Load **Elena's crates** into the {ride}'s trunk.") >= 2 / 3 && objectiveShare('Rain on the windshield. Good.', "Load **Elena's crates** into the {ride}'s trunk.") === 0);
  ok('a runner-format world reads the same (speakers by name, lines as sub tuples)', dialogueNotes({ opening: { shots: BEFORE.opening.shots.map((s) => ({ sub: [s.say, s.line] })) }, missions: [] }).some((n) => /the opening has 3 lines and no question/.test(n)));

  // ── the schema ──
  const p = NS();
  const m1 = p.acts[0].missions[0];
  const callAt = m1.steps.findIndex((x: any) => x.during?.some((d: any) => d.type === 'call'));
  const call = m1.steps[callAt].during.find((d: any) => d.type === 'call');
  call.lines[1].how = 'urgent'; call.lines[1].pre = 0.3;
  call.register = 'fast';
  call.react = { tooClose: [{ who: 'ray', text: 'Back off him, Dez.' }, { who: 'ray', text: "He'll see you." }], hit: [{ who: 'ray', text: 'Was that you?', how: 'scared' }, { who: 'ray', text: 'Tell me that was a bin.' }] };
  const cutAt = m1.steps.findIndex((x: any) => x.type === 'cutscene');
  m1.steps[cutAt].shots.push({ cam: { rel: 'kwon', fwd: 2, right: 0.5 }, to: { rel: 'kwon', fwd: 1.6, right: 0.4 }, look: { rel: 'kwon' }, dur: 4, lines: [{ who: 'kwon', text: 'You talk to all your fares?' }, { who: 'dez', text: 'Only the ones with bags.', how: 'tease', overlap: true }] },
    { frame: 'react', on: 'kwon', dur: 0.8 });
  const sayAt = m1.steps.findIndex((x: any) => x.type === 'say');
  Object.assign(m1.steps[sayAt], { how: 'hushed', post: 0.8 });
  p.cast.find((c: any) => c.id === 'kwon').speech = { rhythm: 'clipped, polite, then direct', habit: 'answers a question with an order', jokes: 'deadpan', never: 'please twice', motifs: ['the bag'] };
  const g = gatePack(p);
  ok('a pack with how, pre, post, overlap, an exchange shot, a react shot, react pools, a register and a voice sheet gates', g.ok, g.problems.slice(0, 4).join('; '));
  const ids = g.lines.map((l) => l.id), lid = `${m1.id}.${m1.steps[cutAt].id || `s${cutAt}`}`;
  ok(`the exchange's lines and the react pools are voiced (${ids.filter((i) => /\.c\d\.l\d$|\.r(close|hit)\.l\d$/.test(i)).join(', ')})`,
    ids.filter((i) => /\.c\d\.l\d$/.test(i)).length === 2 && ids.filter((i) => /\.rclose\.l\d$/.test(i)).length === 2 && ids.filter((i) => /\.rhit\.l\d$/.test(i)).length === 2, lid);
  ok('a line\'s how goes with it into the gate\'s lines', g.lines.some((l) => l.how === 'tease' && /Only the ones with bags/.test(l.text)) && g.lines.some((l) => l.how === 'scared'));
  const bad = clone(p); bad.acts[0].missions[0].steps[cutAt].shots.at(-2).say = 'kwon'; bad.acts[0].missions[0].steps[cutAt].shots.at(-2).line = 'Both?';
  ok('a shot with a line and an exchange both is refused', gatePack(bad).problems.some((x) => /one line \(say \+ line\) or an exchange \(lines\), not both/.test(x)));
  const badHow = clone(p); badHow.acts[0].missions[0].steps[sayAt].how = 'robotic';
  ok('a how outside the list is refused by the schema', !gatePack(badHow).ok);
  const r = toRunnerPack(g.pack);
  const rcut = r.missions[0].steps[cutAt], rcall = r.missions[0].steps[callAt].during.find((d: any) => d.type === 'call');
  const ex1 = rcut.shots.filter((s: any) => Array.isArray(s.lines) && s.lines.length === 2);
  const [l0, l1] = ex1[0]?.lines || [];
  ok('the runner pack plays the exchange as one shot (lines by name, each with its delivery; sub its first line for an older engine)', ex1.length === 1 && !rcut.shots.some((s: any) => s.cont)
    && l0?.who === ex1[0].sub[0] && /fares\?/.test(l0?.text) && !('how' in l0) && /Only the ones/.test(l1?.text) && l1?.how === 'tease' && l1?.overlap === true && typeof l1?.who === 'string' && l1.who !== 'dez' && ex1[0].dur === 4 && JSON.stringify(ex1[0].to) === JSON.stringify({ rel: rcut.shots.at(-2).to.rel, fwd: 1.6, right: 0.4 }));
  const one = clone(p), oneCut = one.acts[0].missions[0].steps[cutAt].shots.find((s: any) => s.say && s.line);
  Object.assign(oneCut, { how: 'hushed', pre: 0.4, post: 0.6 });
  const rOne = toRunnerPack(gatePack(one).pack).missions[0].steps[cutAt].shots.find((s: any) => s.say && typeof s.say === 'object' && !Array.isArray(s.say));
  ok('a cutscene line with a delivery goes to the runner as say { who, text, how, pre, post } (and its sub tuple)', rOne?.say.how === 'hushed' && rOne.say.pre === 0.4 && rOne.say.post === 0.6 && rOne.say.text === oneCut.line && Array.isArray(rOne.sub) && rOne.sub[1] === oneCut.line && !('how' in rOne));
  ok('a cutscene line without one stays a sub tuple (no say)', rcut.shots.filter((s: any) => s.sub && !s.lines).every((s: any) => Array.isArray(s.sub) && !('say' in s)));
  ok('the react shot plays with no line', rcut.shots.some((s: any) => s.frame === 'react' && !s.sub));
  ok('a call line with a delivery goes to the runner as an object (its tuple otherwise)', rcall.lines[1]?.how === 'urgent' && rcall.lines[1]?.pre === 0.3 && typeof rcall.lines[1]?.text === 'string' && Array.isArray(rcall.lines[0]) && rcall.register === 'fast' && Array.isArray(rcall.react?.tooClose?.[0]) && rcall.react.hit[0].how === 'scared');
  ok('a say step keeps its how and post for the runner', r.missions[0].steps[sayAt].how === 'hushed' && r.missions[0].steps[sayAt].post === 0.8);
  // (18 Nov, the talk track: a react variant may be an exchange, a call may span the next steps, a line may be cut into)
  const tk = clone(p), tcall = tk.acts[0].missions[0].steps[callAt].during.find((d: any) => d.type === 'call');
  tcall.react.spotted = [[{ who: 'ray', text: 'He made you.' }, { who: 'dez', text: 'I know.', overlap: true }], { who: 'ray', text: 'Mirror. He looked.' }];
  tcall.span = 2; tcall.lines[0].cut = 0.6;
  const tg = gatePack(tk);
  ok('a react exchange, a span and a cut gate', tg.ok, tg.problems.slice(0, 3).join('; '));
  ok('a react exchange is voiced line by line (.rspot.l0.0, .rspot.l0.1, .rspot.l1)', ['.rspot.l0.0', '.rspot.l0.1', '.rspot.l1'].every((x) => tg.lines.some((l) => l.id.endsWith(x))));
  const tr = toRunnerPack(tg.pack).missions[0].steps[callAt].during.find((d: any) => d.type === 'call');
  ok('the runner pack: the exchange as a list of lines, the single variant as a line; span and cut kept', Array.isArray(tr.react.spotted[0]) && tr.react.spotted[0].length === 2 && tr.react.spotted[0][1].overlap === true
    && Array.isArray(tr.react.spotted[1]) && typeof tr.react.spotted[1][0] === 'string' && tr.span === 2 && tr.lines[0].cut === 0.6);
  // (a cut out of 0.3..0.95 is clamped by the engine: Mog City radio/turns.js beatOf)
  // (a showcase's opening: exchanges in its shots, up to SHOWCASE.openingLines lines; a Create's stays 2 to 4)
  const pt = JSON.parse(readFileSync('storykit/packs/pickup-time.json', 'utf8'));
  const ptOk = gatePack(clone(pt), { showcase: true }).ok;
  const pt2 = clone(pt), sh1 = pt2.opening.shots[1];
  sh1.lines = [{ who: 'john', text: sh1.line }, { who: 'carissa', text: 'Five years. Say it again, slower.' }, { who: 'john', text: 'Five years clean.', how: 'warm' }, { who: 'carissa', text: 'Better.' }]; delete sh1.say; delete sh1.line;
  pt2.opening.shots[3].lines = [{ who: 'carissa', text: pt2.opening.shots[3].line }, { who: 'john', text: 'Who said that?' }]; delete pt2.opening.shots[3].say; delete pt2.opening.shots[3].line;
  const g2 = gatePack(pt2, { showcase: true });
  ok("a showcase opening may say its premise in exchanges (7 lines here)", ptOk && g2.ok && g2.lines.filter((l) => /^OPEN\.c1\.l\d$/.test(l.id)).length === 4, g2.problems.slice(0, 3).join('; '));
  const ro = toRunnerPack(g2.pack).opening.shots[1];
  ok('the runner pack plays an opening exchange as one shot (lines)', Array.isArray(ro.lines) && ro.lines.length === 4 && ro.lines[2].how === 'warm');
  const pt3 = clone(pt2); for (const k of [4, 5]) { const s3 = pt3.opening.shots[k]; if (s3) s3.lines = Array.from({ length: 4 }, (_, i) => ({ who: i % 2 ? 'john' : 'delgado', text: `Line ${i} of a long opening.` })), delete s3.say, delete s3.line; }
  pt3.opening.shots[6].lines = Array.from({ length: 4 }, (_, i) => ({ who: i % 2 ? 'john' : 'carissa', text: `More of it, ${i}.` })); delete pt3.opening.shots[6].say; delete pt3.opening.shots[6].line;
  ok('a showcase opening past its line cap is refused', gatePack(pt3, { showcase: true }).problems.some((x) => /spoken lines; the premise is said in 2 to 16/.test(x)));
  const old = gatePack(NS());
  ok('Night Shift without any of them gates exactly as before (every line, no how)', old.ok && old.lines.length > 0 && old.lines.every((l) => !('how' in l)));

  // ── the voice step ──
  const block = lintVoiceBlock({ id: 'v', base: 'af_heart', speed: 1, pitch: 0.4 }).block;
  const text = "Love you too. You didn't do this. So we prove it.";
  ok('a line without how keeps its clip name exactly (line hash - voice key): no world is re-voiced', clipBase(text, block) === `${lineHash(text)}-${voiceKey(block)}` && clipBase(text, block, null) === clipBase(text, block) && clipBase(text, block, 'robotic') === clipBase(text, block));
  ok('a line with a how is another clip, still a clip name', clipBase(text, block, 'warm') !== clipBase(text, block) && /^[0-9a-f]{8}-[0-9a-f]{8}$/.test(clipBase(text, block, 'warm')) && clipBase(text, block, 'warm') !== clipBase(text, block, 'sad'));
  const plan = voicePlanOf(NS(), 'packs/test-night-shift/voice/');
  ok(`Night Shift's voice plan: every clip named as before (${plan.lines.length} lines)`, plan.lines.every((l: any) => l.clip === `${lineHash(l.text)}-${plan.cast[l.who].key}` && !('how' in l)));
  const plan2 = voicePlanOf(g.pack, 'packs/test-night-shift/voice/');
  ok('a line\'s how reaches the voice plan and names its clip', plan2.lines.some((l: any) => l.how === 'tease' && l.clip === clipBase(l.text, plan2.cast[l.who].block, 'tease')));
  ok('every how stays within 8% pace, 1 semitone and 4 dB', Object.values(HOW).every((d: any) => Math.abs(d.speed - 1) <= 0.0801 && Math.abs(d.pitch) <= 1 && Math.abs(d.gain) <= 4)
    && deliveredBlock(block, 'shout').pitch === block.pitch + 1 && deliveredBlock(block, null) === block);
  // (a speech-like test signal: syllables of a voiced tone under an envelope, the same render shaped two ways)
  const raw = new Float32Array(SAMPLE_RATE * 2);
  for (let i = 0; i < raw.length; i++) { const t = i / SAMPLE_RATE, env = Math.max(0, Math.sin(Math.PI * t * 5)) ** 2; raw[i] = 0.3 * env * (Math.sin(2 * Math.PI * 140 * t) + 0.5 * Math.sin(2 * Math.PI * 280 * t) + 0.25 * Math.sin(2 * Math.PI * 560 * t)); }
  const db = (x: Float32Array) => { let s = 0; for (const v of x) s += v * v; return 10 * Math.log10(s / x.length); };
  const shout = shape(raw, deliveredBlock(block, 'shout'), 'shout'), hushed = shape(raw, deliveredBlock(block, 'hushed'), 'hushed'), plain = shape(raw, block);
  ok(`a shout is at least 3 dB above a hushed line from the same render (${(db(shout) - db(hushed)).toFixed(1)} dB)`, db(shout) - db(hushed) >= 3);
  const was = finish(resample(raw, pitchRatio(block.pitch)));
  ok('a line without how is shaped exactly as before (sample for sample)', plain.length === was.length && plain.every((v: number, i: number) => v === was[i]));
  const parts = splitSentences(text);
  ok(`a line is said sentence by sentence (${parts.length}: ${parts.map((x) => JSON.stringify(x)).join(' ')})`, parts.length === 3 && splitSentences('Mr. Big called you? Himself?').length === 2 && splitSentences('...Okay. Go.')[0] === '...Okay.');
  const joined = joinSentences(parts.map(() => new Float32Array(SAMPLE_RATE / 2).fill(0.1)), parts);
  ok(`with a beat of 0.25 to 0.45 s between them (${((joined.length - 1.5 * SAMPLE_RATE) / SAMPLE_RATE).toFixed(2)} s in all)`, Math.abs(joined.length - (1.5 + 0.35 * 2) * SAMPLE_RATE) < 2);
  const pass = readFileSync(new URL('../storykit/voices/browser-voice-pass.js', import.meta.url), 'utf8');
  ok('the browser pass splits sentences only for a line with a how (a key rendered whole before keeps a whole render)', /const parts = phonemes \|\| !howOf\(how\) \? \[text\] : splitSentences\(text\)/.test(pass));
  const kNone = clipKey(text, block), kHow = clipKey(text, block, undefined, 'warm');
  return Promise.all([kNone, kHow, clipKey(text, block)]).then(([x, y, z]) => ok('the browser cache key: the same without how, another with one', x === z && x !== y));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let bad = 0;
  await runDialogueChecks((name, cond, detail) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${name}${!cond && detail ? `\n        ${detail}` : ''}`); if (!cond) bad++; });
  if (bad) { console.log(`\n${bad} failed`); process.exit(1); }
}
