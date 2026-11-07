// Pickup Time: the voices, attached by merge.mjs (additive; the act files are not touched).
//   castVoices(pack)            each cast member's voice block from casting.json (before the gate)
//   attachVoice(world, pack, p) the runner world's voice plan (storykit/pack/runner.ts voicePlanOf, dir 'voice/'): every
//                               spoken line with its clip name (<line hash>-<voice key>), and `clips` for the ones
//                               rendered in <world dir>/voice/ (rendered offline; see README.md) with their length, so Mog City
//                               holds each line for its clip (W.voice.dur) and a line not rendered yet stays a subtitle.
//                               A line heard down a phone (a call's caller, its voicemail, a voice note) carries
//                               fx: 'phone' (Mog City's phone band, radio/voices.js), in person stays clean.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const GM = path.resolve(HERE, '..', '..', '..');   // the GameMog checkout

export function castVoices(pack) {
  const casting = JSON.parse(readFileSync(path.join(HERE, 'casting.json'), 'utf8'));
  for (const c of pack.cast) { const v = casting[c.id]; if (v) { const { kokoro, ...rest } = v; c.voice = { ...rest, kokoro }; } }
}

// the line ids (storykit/pack/gate.ts eachStep: <mission>.s<i> / .d<i> during / .x<i> do) heard down a phone
function phoneLines(pack, hero) {
  const out = new Set();
  const walk = (steps, lineAt, side) => steps.forEach((s, i) => {
    const lid = `${lineAt}.${side ? 'd' : 's'}${i}`;
    const add = (id, who) => { if (who && who !== hero) out.add(id); };
    if (s.type === 'call') {
      (s.lines || []).forEach((l, j) => add(`${lid}.l${j}`, l.who));
      (s.extra || []).forEach((b, k) => b.forEach((l, j) => add(`${lid}.e${k}.l${j}`, l.who)));
      (s.wrap || []).forEach((l, j) => add(`${lid}.w.l${j}`, l.who));
      for (const k of ['pause', 'resume']) (s.hold?.[k] || []).forEach((l, j) => add(`${lid}.h${k[0]}.l${j}`, l.who));
      if (s.voicemail) out.add(`${lid}.vm`);
      if (s.choice?.who) s.choice.options.forEach((o, j) => { if (o.reply) add(`${lid}.ch.o${j}`, s.choice.who); });
      if (s.choice?.silenceReply) add(`${lid}.ch.sr`, s.choice.who);
    }
    if (s.type === 'voicemail' || s.type === 'voicenote') out.add(lid);
    if (s.during) walk(s.during, lid, true);
    if (s.do) walk(s.do, lid.replace(/\.d(\d+)$/, '.x$1'), true);
  });
  for (const a of pack.acts) for (const m of a.missions) walk(m.steps, m.id, false);
  return out;
}

export async function attachVoice(world, pack, runnerOut) {
  const { voicePlanOf } = await import(`${GM}/storykit/pack/runner.ts`);
  const plan = voicePlanOf(pack, 'voice/');
  const phone = phoneLines(pack, pack.hero);
  const dir = path.join(path.dirname(runnerOut), 'voice');
  const man = existsSync(path.join(dir, 'manifest.json')) ? JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')).clips : {};
  const clips = {}, fxOf = new Map(), clash = [];
  for (const l of plan.lines) {
    if (phone.has(l.id)) l.fx = 'phone';
    // (Mog City keys a clip by speaker and words: the same words heard both down the phone and in person would share one sound)
    const k = `${l.who}|${l.text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
    if (fxOf.has(k) && fxOf.get(k) !== (l.fx || null)) clash.push(l.id); else fxOf.set(k, l.fx || null);
    if (!l.rec && existsSync(path.join(dir, `${l.clip}.ogg`))) clips[l.clip] = { url: `voice/${l.clip}.ogg`, secs: man[l.clip]?.secs || 0 };
  }
  // dir null: only the clips listed are played (a line not rendered yet is a subtitle, never a missing file)
  world.voice = { ...plan, dir: null, clips };
  const n = plan.lines.length, rec = plan.lines.filter((l) => l.rec).length, have = plan.lines.filter((l) => clips[l.clip]).length;
  console.log(`voice: ${n} spoken lines, ${have} clips in voice/, ${rec} recorded (registry), ${n - have - rec} still subtitles; ${plan.lines.filter((l) => l.fx).length} on the phone band${clash.length ? `; same words both on the phone and in person: ${clash.join(' ')}` : ''}`);
  return world.voice;
}
