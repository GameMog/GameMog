// Mog City: the cast's voices. Every spoken line is a file (assets/voice/<id>.m4a) listed in assets/voice/manifest.json
// with its speaker and words (built from the game's own lines by wagmi/radio/build/voices.mjs). The subtitles drive
// them: ui.sub(speaker, text) shows a line and calls WAGMI.voice.sub(speaker, text), which plays that line's file
// from the top (once per showing; ui.sub(null) between lines). A call's sound is put on live: Mr. Big's video call, Jane's
// phone. Speech ducks the radio.
//   W.voice.has(speaker, text) · dur(speaker, text) (s, 0 if none) · decode(speaker, text) (a promise of its length) ·
//   breath(speaker, text) (D5, s to wait) · say(speaker, text) · stop(secs) · level() (0..1,
//   the voice playing now, for mouths and meters) · fx(speaker, 'phone' | 'video' | null) (a speaker's call sound)
//   cue({ overlap, cut }) · room('street' | 'park' | 'garage' | 'interior' | null): radio/turns.js's hand-over, a scene's room
//   speaks(speaker, text): the line will be heard (its recording, or the browser's voice for a Mog's changed line: the
//   mumbles stand aside for both) · synthOn: the browser's voice is speaking · synthLog: what it said
// A Mog's changed or new line (the story pack, wagmi/story/index.js S.changed: words that are not one of Mog City's
// lines) has no recording: shown, it is spoken by the browser's speechSynthesis in the character's voice from the pack
// ({ pitch, rate, prefer }, an English voice picked once per speaker), ducking the music as a recording does. It never
// goes through the phone or video filters (it is not in the Web Audio graph). Mog City's own pack never gets here.
import { S as story } from '../story/index.js';

export async function createVoice(W, out) {
  const key = (speaker, text) => `${String(speaker).toLowerCase()}|${String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
  let man = { lines: [] };
  try { const r = await fetch('assets/voice/manifest.json', { cache: 'no-cache' }); if (r.ok) man = await r.json(); } catch {}
  const byKey = new Map(man.lines.map((l) => [key(l.speaker, l.text), l]));
  const fxOf = {}; // a speaker's call sound, set at run time (else the manifest's)
  const bufs = new Map();
  let ctx = null, bus = null, ana = null, data = null;
  function graph() {
    if (ctx) return true;
    ctx = out.ctx(); if (!ctx) return false;
    ana = ctx.createAnalyser(); ana.fftSize = 512; data = new Float32Array(ana.fftSize);
    bus = ctx.createGain(); bus.gain.value = 1; bus.connect(ana); ana.connect(out.bus('voice'));
    return true;
  }
  function load(l) {
    if (!bufs.has(l.id)) {
      if (!graph()) return Promise.reject(new Error('no audio'));
      bufs.set(l.id, fetch(l.file).then((r) => { if (!r.ok) throw new Error(l.file); return r.arrayBuffer(); }).then((b) => ctx.decodeAudioData(b)).catch((e) => { bufs.delete(l.id); throw e; }));
    }
    return bufs.get(l.id);
  }
  // (the lines decoded ahead, a few at a time, once there is sound: the opening's first)
  let warmed = false;
  function warm() {
    if (warmed || !graph()) return; warmed = true;
    const list = [...man.lines].sort((a, b) => (a.scene === 'intro' ? 0 : 1) - (b.scene === 'intro' ? 0 : 1));
    let i = 0; const step = () => { const batch = list.slice(i, i + 4); i += 4; if (!batch.length) return; Promise.allSettled(batch.map(load)).then(() => setTimeout(step, 30)); };
    step();
  }
  const filters = (kind) => {
    const f = (type, freq, q = 0.7, gain = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = freq; b.Q.value = q; b.gain.value = gain; return b; };
    if (kind === 'phone') return [f('highpass', 320, 0.8), f('highpass', 320, 0.8), f('peaking', 1800, 1, 4), f('lowpass', 3400, 0.8), f('lowpass', 3400, 0.8)];
    if (kind === 'video') return [f('highpass', 160), f('peaking', 2500, 1, 2), f('lowpass', 6500)];
    // (a story world's call, 14 Nov: the owner heard the story lines "very muffled". Mog City's phone band above, two
    // high-passes at 320 Hz and two low-passes at 3,400 Hz, is a landline's, made for its own recorded calls; on a
    // creator's Kokoro lines it took the words' consonants away. A call still sounds like one: one high-pass, a
    // presence lift and one gentler low-pass, the words kept)
    if (kind === 'call') return [f('highpass', 260, 0.7), f('peaking', 2200, 0.9, 4), f('lowpass', 5200, 0.6)];
    return [];
  };
  // (a line that runs on past the next one's subtitle, said at a natural pace, is let finish if it is nearly done: the
  // next one waits for it, up to HOLD s; a line further from done is cut)
  // (a line cued as an overlap (radio/turns.js: a reply of two words or fewer, flagged) starts at once over the end of the
  // one before, which plays on under it; a line after a trail-off ('...') cuts in, the one before faded out under it)
  const HOLD = 1.0;
  let cur = null, shown = null, cued = null;
  const live = new Set();
  // ---- the room (MC5): an in-person line in a scene tagged 'street' | 'park' | 'garage' | 'interior' gets a little of
  // that place round it (a short synthesised room and the distance's top end rolled off), the dry voice kept under it;
  // a call's bands (phone, video) are never touched, and no tag (the default) is the dry path as before
  const ROOMS = { street: { secs: 0.32, decay: 3.2, wet: 0.13, lp: 9000, pre: 0.012 }, park: { secs: 0.22, decay: 4.2, wet: 0.09, lp: 10500, pre: 0.018 },
    garage: { secs: 0.7, decay: 2.4, wet: 0.2, lp: 7600, pre: 0.008 }, interior: { secs: 0.38, decay: 3.6, wet: 0.14, lp: 11500, pre: 0.005 } };
  let room = null; const irs = {};
  function roomOf(tag) {
    const R = ROOMS[tag]; if (!R || !ctx) return null;
    if (!irs[tag]) {
      const n = Math.round(R.secs * ctx.sampleRate), ir = ctx.createBuffer(2, n, ctx.sampleRate), p0 = Math.round(R.pre * ctx.sampleRate);
      let s = 0x2545f491 ^ tag.length; const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296) * 2 - 1; };
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = p0; i < n; i++) d[i] = rnd() * Math.exp((-R.decay * (i - p0)) / (n - p0)) * 0.5; }
      irs[tag] = ir;
    }
    return R;
  }
  function play(l, cue = null) {
    if (!graph()) return;
    warm();
    const asked = ctx.currentTime;
    load(l).then((buf) => {
      // (still the line on screen; started late by however long the load took, so it keeps to the picture)
      if (shown !== l) return;
      const over = !!(cue && (cue.overlap || cue.cut));
      const left = cur ? cur.end - ctx.currentTime : 0, wait = !over && left > 0 && left <= HOLD ? left + 0.04 : 0;
      const late = wait ? 0 : Math.max(0, ctx.currentTime - asked); if (late > buf.duration - 0.2) return;
      if (cue?.overlap) { /* the line before plays on under this one */ } else if (cue?.cut) V.stop(0.12); else if (!wait) V.stop(0.05);
      if (!l.dur) l.dur = buf.duration; // (a world's clip: its length known once decoded, wagmi/storyrun)
      const src = ctx.createBufferSource(); src.buffer = buf;
      const kind = l.speaker in fxOf ? fxOf[l.speaker] : l.fx;
      // (a story world's line down a phone gets the story's call band; a band takes level with it, given back)
      const fx = l.pack && kind === 'phone' ? 'call' : kind;
      const g = ctx.createGain(); g.gain.value = fx === 'call' ? 1.3 : 1;
      const chain = filters(fx);
      let n = src; for (const f of chain) { n.connect(f); n = f; } n.connect(g); g.connect(bus);
      // (in person, in a tagged scene: the room under the dry voice, the top end of the distance rolled off it)
      const R = !kind && !chain.length && room ? roomOf(room) : null;
      if (R) {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = R.lp; lp.Q.value = 0.5;
        const cv = ctx.createConvolver(); cv.normalize = false; cv.buffer = irs[room];
        const wet = ctx.createGain(); wet.gain.value = R.wet;
        g.disconnect(); g.connect(lp); lp.connect(bus); lp.connect(cv); cv.connect(wet); wet.connect(bus);
      }
      if (cue?.cut) { const to = g.gain.value; g.gain.setValueAtTime(0, ctx.currentTime); g.gain.linearRampToValueAtTime(to, ctx.currentTime + 0.08); }
      src.start(ctx.currentTime + wait, late);
      const secs = buf.duration - late;
      const me = (cur = { src, g, l, end: ctx.currentTime + wait + secs });
      live.add(me);
      V.log.push({ id: l.id, at: +(performance.now() / 1000).toFixed(3), late: +late.toFixed(3), wait: +wait.toFixed(3), intro: W.intro?.t != null ? +W.intro.t.toFixed(2) : null }); if (V.log.length > 60) V.log.shift();
      src.onended = () => { live.delete(me); if (cur === me) cur = null; };
      if (out.via() === 'mixer') W.audio.duck('music', 0.6, wait + secs + 0.2); else W.radio?.duck?.(0.3, wait + secs + 0.2);
      // (a story world's line dips the effects and the street under it: a creature's roar, a fight's hits, the car's
      // engine or the traffic never bury the words. 14 Nov: the street was left at full level under the cast's lines,
      // the effects dipped 3 dB; both now about 5 dB, the music 8 dB as before)
      if (l.pack && out.via() === 'mixer') { W.audio.duck('sfx', 0.45, wait + secs + 0.2); W.audio.duck('amb', 0.45, wait + secs + 0.2); }
      // (a tagged scene's place left under its voices, a little down: about 0.6)
      else if (R && out.via() === 'mixer') W.audio.duck('amb', 0.6, wait + secs + 0.2);
    }).catch(() => {});
  }
  // ---- the browser's voice, for a Mog's changed lines
  const synth = typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined' ? speechSynthesis : null;
  const picked = new Map();
  let said = null;
  const FEMALE = /female|woman|samantha|victoria|karen|moira|tessa|fiona|zira|susan|serena|allison|ava|kate|veena|hazel|libby|sonia|aria|jenny|google uk english female/i;
  const MALE = /\bmale|\bman\b|daniel|alex\b|fred|david|mark|tom\b|aaron|arthur|oliver|ryan|guy|george|rishi|gordon|google uk english male/i;
  function voiceFor(speaker, prefer) {
    if (picked.has(speaker)) return picked.get(speaker);
    const all = synth.getVoices().filter((v) => /^en(-|_|$)/i.test(v.lang));
    if (!all.length) return null;
    const pool = prefer === 'female' ? all.filter((v) => FEMALE.test(v.name)) : prefer === 'male' ? all.filter((v) => MALE.test(v.name) && !FEMALE.test(v.name)) : all;
    const list = pool.length ? pool : all;
    // (the same speaker the same voice, others spread over what there is)
    let h = 0; for (const c of String(speaker)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const v = list[h % list.length]; picked.set(speaker, v); return v;
  }
  if (synth) try { synth.addEventListener?.('voiceschanged', () => picked.clear()); } catch {}
  function speak(speaker, text) {
    if (said === text + '|' + speaker) return; said = text + '|' + speaker;
    const P = story.voiceOf(speaker) || { pitch: 1, rate: 1, prefer: 'any' };
    V.synthLog.push({ speaker, text, at: +(performance.now() / 1000).toFixed(3), ok: !!synth }); if (V.synthLog.length > 60) V.synthLog.shift();
    if (!synth) return;
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text), v = voiceFor(speaker, P.prefer);
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
      u.pitch = P.pitch; u.rate = P.rate; u.volume = 1;
      u.onstart = () => { V.synthOn = true; };
      u.onend = u.onerror = () => { V.synthOn = false; };
      V.synthOn = true; synth.speak(u);
      const secs = Math.max(1.4, text.length / 14 / P.rate);
      if (out.via() === 'mixer') W.audio?.duck?.('music', 0.6, secs + 0.2); else W.radio?.duck?.(0.3, secs + 0.2);
    } catch { V.synthOn = false; }
  }
  const V = {
    lines: man.lines, log: [], synthLog: [], synthOn: false,
    has: (speaker, text) => byKey.has(key(speaker, text)),
    speaks: (speaker, text) => byKey.has(key(speaker, text)) || (!!text && story.changed(speaker, text)),
    dur: (speaker, text) => byKey.get(key(speaker, text))?.dur || 0,
    // (how long the line playing has left, s: a story's next line, a call's, waits it out instead of cutting it)
    left: () => (cur && ctx ? Math.max(0, cur.end - ctx.currentTime) : 0),
    line: (speaker, text) => byKey.get(key(speaker, text)) || null,
    // the subtitles' hook: a line shown plays it (once per showing)
    sub(speaker, text) {
      if (!text) { shown = null; said = null; return; }
      const l = byKey.get(key(speaker, text));
      // (a Mog's changed line: once per showing, as a recording is; the line before it, recorded or spoken, cut)
      if (!l) { if (speaker && story.changed(speaker, text) && said !== text + '|' + speaker) { shown = null; V.stop(0.08); speak(speaker, text); } return; }
      if (shown === l) return;
      if (V.synthOn) try { synth?.cancel(); } catch {}
      const c = cued; cued = null;
      shown = l; play(l, c);
    },
    // the next line's hand-over (radio/turns.js): { overlap, cut, how }, used by the next sub() only
    cue(o) { cued = o && (o.overlap || o.cut) ? { overlap: !!o.overlap, cut: !!o.cut && !o.overlap, how: o.how || null } : null; },
    // the room in-person lines are heard in: 'street' | 'park' | 'garage' | 'interior' | null (dry, the default)
    room(tag) { room = tag && ROOMS[tag] ? tag : null; return room; },
    get roomTag() { return room; },
    // a line's recording decoded now (a promise of its length, s; 0 with none, or no sound yet): a world's clip has no
    // length until it is, and radio/turns.js waits on this before it puts the line up, so it is held for all of it
    decode(speaker, text) {
      const l = byKey.get(key(speaker, text)); if (!l) return Promise.resolve(0);
      if (l.dur > 0) return Promise.resolve(l.dur);
      return load(l).then((b) => { if (!(l.dur > 0)) l.dur = b.duration; return l.dur; }).catch(() => 0);
    },
    // D5: a short in-breath before a scene's first line, in person (no call band on the speaker, a recording to follow,
    // the sound up): soft filtered noise, about 0.2 s, in the scene's room. Returns how long to wait before the line
    breath(speaker, text) {
      const l = byKey.get(key(speaker, text));
      if (!l || !graph() || ctx.state !== 'running') return 0;
      const kind = l.speaker in fxOf ? fxOf[l.speaker] : l.fx; if (kind) return 0;
      const secs = 0.24, n = Math.round(secs * ctx.sampleRate);
      if (!irs.breath) { const b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); let s = 0x1b873593; for (let i = 0; i < n; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; d[i] = ((s >>> 0) / 4294967296) * 2 - 1; } irs.breath = b; }
      try {
        const src = ctx.createBufferSource(); src.buffer = irs.breath;
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.6;
        const g = ctx.createGain(), t = ctx.currentTime; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.035, t + 0.13); g.gain.linearRampToValueAtTime(0, t + secs);
        src.connect(hp); hp.connect(bp); bp.connect(g); g.connect(bus); src.start(t); src.stop(t + secs + 0.02);
        return 0.2;
      } catch { return 0; }
    },
    // a line spoken without a subtitle
    say(speaker, text) { const l = byKey.get(key(speaker, text)); if (!l) return false; shown = l; play(l); return true; },
    stop(secs = 0.15) {
      cur = null;
      if (V.synthOn && synth) { try { synth.cancel(); } catch {} V.synthOn = false; said = null; }
      for (const p of live) try { p.g.gain.setTargetAtTime(0, ctx.currentTime, secs / 3); p.src.stop(ctx.currentTime + secs + 0.05); } catch {}
      live.clear();
    },
    level() {
      // (nothing while the sound is held: the pause menu)
      if (!cur || !ana || ctx.state !== 'running') return 0;
      ana.getFloatTimeDomainData(data); let e = 0; for (const v of data) e += v * v;
      return Math.min(1, Math.sqrt(e / data.length) * 3.5);
    },
    fx(speaker, kind) { if (kind === undefined) delete fxOf[speaker]; else fxOf[speaker] = kind; },
    // a world's own recording of a line (wagmi/storyrun: a Story Kit voice clip, by its URL), played as a recorded line
    // is (its subtitle, the music ducked, the call filters, the speaker's mouth); never over one of Mog City's own
    clip(speaker, text, file, { dur = 0, fx = null } = {}) {
      const k = key(speaker, text); if (!file || (byKey.has(k) && !byKey.get(k).pack)) return false;
      const l = { id: 'pack:' + k, speaker, text, file, dur, fx, pack: true };
      byKey.set(k, l); man.lines.push(l);
      return true;
    },
    warm,
  };
  // (decoding needs the sound up: the first key or click after the gate)
  const kick = () => { if (out.ctx()) warm(); };
  for (const ev of ['keydown', 'pointerdown']) addEventListener(ev, kick, { passive: true });
  return V;
}
