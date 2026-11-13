// Story Kit: the creator's browser's work on a world the builder wrote (STORY-KIT-PLAN 2.2 stages 3 to 6). Everything
// heavy runs here, never on GameMog's server, which only gates and stores (lib/storykit-store.ts):
//
//   forging  each person whose body is not stored yet: their sheet -> the Character Forge (forge/forge.js) -> their
//            GLB, stored; then every person's headshot (forge/portrait.html), stored as art head-<cast id>.jpg
//   voicing  every spoken line without a clip: the voice studio (voices/studio.html, Kokoro in this browser), stored
//   driving  the test drive: the world, sealed as it is now, played in Mog City (mc.gamemog.com, framed here) under its
//            own autopilot, every mission start to finish in this tab, each one ticked off as Mog City says it passed
//            (postMessage, see driving()). The autopilot jumps long legs to their last 110 m, gives a chase a route
//            away and nudges what sticks, so a drive takes minutes: it proves each mission can be finished, not that
//            it is fun
//   art      the key art: Mog City's frame of the first drive (the HUD hidden), wide and square, sent with the drive's
//            messages and stored here; the hero's headshot is the portrait made while forging
// then it reports the drive (POST /api/storykit/drafts/<id>/report): the build's draft gets its test drive and cover.
//
//   /storykit/work.html?draft=<id>#t=<token>   the token in the fragment (never sent to a server) or this tab's
//                                              sessionStorage (storykit-draft:<id>), as the voice studio takes it
//   &embed=1   in the build show's frame (app/create/story-work.ts): every report goes to the parent page as
//              { source: 'storykit-work', draft, patch } (app/create/story-show.tsx StoryWork), this site's origin only
// Work already stored is not done again: a person with a GLB keeps it, a line with a clip keeps it, so the page can be
// opened again on the same draft and carries on. window.__work holds the state and timings for the headless probes.

const Q = new URLSearchParams(location.search), draft = Q.get('draft') || '', embed = Q.get('embed') === '1';
const $ = (s) => document.querySelector(s);
const W = (window.__work = { draft, state: 'loading', stage: null, t0: performance.now(), stages: {}, cast: [], voices: null, missions: [], errors: [], log: [] });
const log = (x) => { W.log.push(x); if (W.log.length > 300) W.log.shift(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (s) => { $('#st').textContent = s; };

const token = (() => {
  const key = `storykit-draft:${draft}`, t = new URLSearchParams(location.hash.slice(1)).get('t');
  try { if (t) sessionStorage.setItem(key, t); } catch {}
  if (t) history.replaceState(null, '', location.pathname + location.search);
  try { return t || sessionStorage.getItem(key); } catch { return t; }
})();
const API = `/api/storykit/drafts/${draft}`;
const auth = () => ({ authorization: `Bearer ${token}` });

/** One report: to the build show (embed) and to this page. */
function report(patch) {
  Object.assign(W, { last: patch });
  if (embed && parent !== window) parent.postMessage({ source: 'storykit-work', draft, patch }, location.origin);
}
function fail(msg) {
  W.state = 'error'; W.error = msg; say(msg);
  if (embed && parent !== window) parent.postMessage({ source: 'storykit-work', draft, error: msg }, location.origin);
}
async function getJson(url, opts = {}) {
  const r = await fetch(url, { cache: 'no-store', ...opts, headers: { ...auth(), ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `${url}: ${r.status}`);
  return j;
}
async function put(kind, name, body, type) {
  const r = await fetch(`${API}/files/${kind}/${name}`, { method: 'PUT', body, headers: { ...auth(), 'content-type': type } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${kind}/${name}: ${j.error || r.status}`);
  return j.file;
}
const dataBytes = (url) => { const b = atob(url.slice(url.indexOf(',') + 1)); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
/** A promise, or a rejection with `why` after `ms` (a stage step that never settles must not hang the build). */
const within = (p, ms, why) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(why)), ms))]);
const timed = async (name, fn) => { const t = performance.now(); try { return await fn(); } finally { W.stages[name] = Math.round(performance.now() - t); } };

/** A frame in the hidden strip (the portrait studio, the voice studio): resolves with its window once `ready(w)` holds. */
function auxFrame(src, ready, ms = 90_000) {
  return new Promise((resolve, reject) => {
    const f = document.createElement('iframe'); f.src = src; f.tabIndex = -1;
    $('#aux').appendChild(f);
    const t0 = Date.now();
    const wait = () => {
      let ok = null; try { ok = ready(f.contentWindow); } catch { ok = null; }
      if (ok === true) return resolve({ frame: f, win: f.contentWindow });
      if (typeof ok === 'string') return reject(new Error(ok));
      if (Date.now() - t0 > ms) return reject(new Error(`${src} did not load`));
      setTimeout(wait, 100);
    };
    wait();
  });
}

/* ---------------------------------------------------------------- forging -- */
let studio = null;
async function portraitOf(src, o) {
  studio ??= auxFrame('/storykit/forge/portrait.html', (w) => (w.__portrait ? true : w.__portraitError || null)).then((x) => x.win.__portrait);
  return (await studio)(src, o);
}
// (6 Nov, the owner: "every game should include media with a headshot so it can be featured") the world's own round
// headshot: its hero straight on, on the sky's flat key (lib/portrait-sky.ts SKY_KEY), stored as art avatar.jpg; the
// server lays it on the sky's gradient when the drive reports (lib/storykit-publish.ts recordStoryReport)
const SKY_KEY = '#3D9BE9';
async function forging(src, status, world) {
  // (a shipped person from the cast registry, { model }: never forged, their headshot made from their own GLB)
  const reg = src.cast.some((c) => c.model) ? await fetch('/storykit/cast/registry.json').then((r) => r.json()).catch(() => ({ models: {} })) : { models: {} };
  const shipped = (c) => !c.sheet && !c.voiceOnly && reg.models[c.model]?.glb;
  const people = src.cast.filter((c) => c.sheet || shipped(c));
  const has = new Set(status.files.filter((f) => f.kind === 'glb').map((f) => f.name));
  const heads = new Set(status.files.filter((f) => f.kind === 'art' && f.name.startsWith('head-')).map((f) => f.name.replace(/\.[a-z]+$/, '').slice(5)));
  const glbOf = Object.fromEntries(status.files.filter((f) => f.kind === 'glb').map((f) => [f.name, f.url]));
  // (a hand-built one (registry built: 'hand') is not Mog City's own, so the world carries it: its GLB stored as the
  // cast member's, as it is, never forged)
  for (const c of people) if (shipped(c)) {
    if (reg.models[c.model].built === 'hand' && !has.has(c.id)) {
      try {
        const b = await fetch(`/storykit/${shipped(c)}`).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.blob(); });
        const f = await put('glb', c.id, new Blob([b], { type: 'model/gltf-binary' }), 'model/gltf-binary');
        log({ handBuilt: c.id, model: c.model, bytes: f.bytes });
      } catch (e) { log({ handBuiltFailed: c.id, error: String(e && e.message || e) }); }
    }
    has.add(c.id); glbOf[c.id] = `/storykit/${shipped(c)}`;
  }
  const card = (c, state, more = {}) => ({ id: c.id, name: c.sheet?.name || c.name || c.id, color: c.color, role: c.sheet?.role || c.role, state, ...more });
  W.cast = people.map((c) => card(c, has.has(c.id) ? 'done' : 'waiting'));
  report({ stage: 'forging', city: src.base.city, title: src.title, cast: W.cast });
  let forge = null;
  for (const c of people) {
    const i = W.cast.findIndex((x) => x.id === c.id);
    let ms;
    if (!has.has(c.id)) {
      W.cast[i] = card(c, 'forging'); report({ cast: [W.cast[i]] }); say(`Forging ${c.sheet.name}...`);
      try {
        forge ??= (await import('/storykit/forge/forge.js')).forge;
        const t = performance.now();
        const r = await within(forge(c.sheet), 180_000, `forging ${c.id} took over 3 minutes`);
        ms = Math.round(performance.now() - t);
        const f = await put('glb', c.id, new Blob([r.glb], { type: 'model/gltf-binary' }), 'model/gltf-binary');
        glbOf[c.id] = f.url;
        log({ forged: c.id, ms, bytes: f.bytes });
      } catch (e) {
        log({ forgeFailed: c.id, error: String(e && e.message || e) });
        W.cast[i] = card(c, 'failed'); report({ cast: [W.cast[i]] }); continue;
      }
    }
    // the headshot: made here from the stored body, stored once
    let portrait;
    try {
      // (by its stored URL: bytes handed to another document's loader are another realm's ArrayBuffer, which it refuses)
      portrait = await portraitOf(glbOf[c.id]);
      if (!heads.has(c.id)) await put('art', `head-${c.id}.jpg`, new Blob([dataBytes(portrait)], { type: 'image/jpeg' }), 'image/jpeg');
    } catch (e) { log({ portraitFailed: c.id, error: String(e && e.message || e) }); }
    if (c.id === src.hero && !status.files.some((f) => f.kind === 'art' && f.name.replace(/\.[a-z]+$/, '') === 'avatar')) {
      try {
        const av = await portraitOf(glbOf[c.id], { w: 512, h: 512, bg: SKY_KEY, frame: 'avatar' });
        await put('art', 'avatar.jpg', new Blob([dataBytes(av)], { type: 'image/jpeg' }), 'image/jpeg');
      } catch (e) { log({ avatarFailed: c.id, error: String(e && e.message || e) }); }
    }
    W.cast[i] = card(c, 'done', { ...(portrait ? { portrait } : {}), ...(ms ? { ms } : {}) });
    report({ cast: [W.cast[i]] });
  }
  return { hero: W.cast.find((c) => c.id === src.hero) };
}

/* ---------------------------------------------------------------- voicing -- */
async function voicing(world) {
  const lines = world.voice?.lines || [];
  // (a line a shipped person recorded with these words plays that recording: it is ready)
  const total = lines.length, ready0 = lines.filter((l) => l.rec || world.voice.clips?.[l.clip]).length;
  W.voices = { done: ready0, total };
  report({ stage: 'voicing', voices: { done: ready0, total } });
  if (ready0 >= total) return;
  say('Recording the voices...');
  const { win } = await auxFrame(`/storykit/voices/studio.html?draft=${draft}&auto=1#t=${encodeURIComponent(token)}`, (w) => (w.__studio && w.__studio.state !== 'loading' ? true : w.__studio?.state === 'error' ? w.__studio.error : null));
  const S = win.__studio;
  let seen = -1, quiet = 0, lastT = performance.now();
  for (;;) {
    const made = S.made.length, done = Math.min(total, ready0 + made), now = performance.now();
    if (!document.hidden) quiet += now - lastT; lastT = now;
    if (quiet > 180_000) { W.voices = { ...W.voices, stalled: true }; log({ voiceStalled: made }); report({ voices: { done, total, note: 'The voices stopped: no line was recorded for 3 minutes. The lines left are silent.' } }); break; }
    if (made !== seen) {
      quiet = 0;
      seen = made;
      const last = S.made[made - 1], l = last && lines.find((x) => x.id === last.line);
      W.voices = { done, total };
      report({ voices: { done, total, ...(l ? { line: { who: l.who, text: l.text } } : {}) } });
    }
    if (S.state === 'done' || S.state === 'error') break;
    await sleep(250);
  }
  W.voices = { done: Math.min(total, ready0 + S.made.length), total, failed: S.failed?.length || 0, mode: S.mode || S.plan?.mode, device: S.device || S.plan?.device };
  // (the voices could not be made here, e.g. the model's download from Hugging Face failed: the studio's own words)
  report({ voices: { done: W.voices.done, total, ...(S.note && W.voices.done < total ? { note: S.note } : {}) } });
}

/* ---------------------------------------------------------------- driving -- */
// The drive's limits, in the time this tab was in front (see driving()): the world's load, one step with no progress
// (a step, or 5 m less to go), one mission, the gap between two missions, the whole drive; and the longest the drive
// waits for a tab left in the background before it gives up. ?limits=<step s>,<mission s> shortens them for probes.
// (mission: 15 min since 7 Nov. The owner: "go with the 10-minute cap", then "finish" Blackout Tow: its finale, a long
// chase to the precinct, drove on with progress past 6 min (1,863 m still to go) and past 10 (in its last cutscene);
// every other mission fits well inside it)
const DRIVE_LIMITS = (() => {
  const L = { load: 120_000, step: 90_000, mission: 15 * 60_000, between: 60_000, drive: 20 * 60_000, hidden: 30 * 60_000 };
  const q = (Q.get('limits') || '').split(',').map(Number);
  if (q[0] > 0) L.step = q[0] * 1000; if (q[1] > 0) L.mission = q[1] * 1000;
  return L;
})();
// The drive itself runs inside Mog City (the owner, 4 Nov: every Story Kit world plays on Mog City's engine and look):
// this page frames mc.gamemog.com (a local Mog City on a dev server: the draft's status names it, `mc`) with the
// draft's world sealed as it is now (Mog City reads only a content-addressed world, /storykit/f/<sha256>.json, from
// gamemog.com, and checks its bytes against its name) and its autopilot on, and hears what happens by postMessage from
// Mog City's origin only (Mog City wagmi/storyrun/host.js): ready (the world in, or refused and why), mission-start,
// progress (each step as it starts; `left`, metres to go, when it says), mission-fail (the runner's own why, where),
// mission-end (pass, fail, quit), keyart (a wide and a square JPEG of the first drive, the HUD hidden), result,
// story-end, hidden ({ hidden }: the game went behind or came back; counted as pauses, that time not counted) and error
// ({ kind: page | rejection | load, message, where }: an uncaught error, an unhandled rejection, or a file or the world
// that did not load; each distinct one once, Mog City wagmi/storyrun/host.js). Every error is counted, by kind, and a
// drive with any is not a pass (lib/storykit-publish.ts: 0 page errors). Its autopilot plays every step kind and nudges
// what sticks (Mog City wagmi/storyrun/autopilot.js), so this page only keeps time and listens.
const site = () => (/(^|\.)gamemog\.com$/.test(location.hostname) ? 'https://gamemog.com' : location.origin);
const toDataUrl = (bytes) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(new Blob([bytes], { type: 'image/jpeg' })); });

async function driving(world, status) {
  // (the missions an earlier sitting passed on this same world, status.banked (lib/storykit-publish.ts bankedMissions):
  // ticked off as they are, never played again; the drive starts at the first one left, and a drive with none left goes
  // straight to its report. A long story's drive cut short (a reload, the tab closed, a stop) so carries on where it was)
  const bank = new Set(Array.isArray(status.banked) ? status.banked : []);
  const list = world.missions.filter((m) => !m.hidden).map((m) => ({ id: m.id, title: m.title, state: bank.has(m.id) ? 'passed' : 'waiting', ...(bank.has(m.id) ? { banked: true } : {}) }));
  W.missions = list;
  const show = () => { $('#missions').innerHTML = list.map((m) => `<li class="${m.state}">${m.title.replace(/[<>&]/g, '')}</li>`).join(''); };
  show();
  report({ stage: 'driving', drive: { missions: list.map((x) => ({ id: x.id, title: x.title, state: x.state })) } });
  const left = list.find((m) => m.state !== 'passed');
  if (!left) {
    log({ banked: list.length, drive: 'skipped' });
    W.drive = { ms: 0, live: 0, hidden: 0, ended: true, reason: null, stuck: null, banked: list.length, errors: [], errorCount: 0, pauses: 0, art: false };
    return { list, errors: [], art: null, frame: null, reason: null, stuck: null, live: 0, hidden: 0 };
  }
  say('Test drive: the autopilot is playing every mission in Mog City...');
  const LIMIT = DRIVE_LIMITS;
  // the world as it is now, frozen (a content-hashed .json: what Mog City reads)
  const sealed = await getJson(`${API}/seal`, { method: 'POST' });
  const mc = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(status.mc || '') ? status.mc : 'https://mc.gamemog.com';
  const pack = `${site()}${sealed.url}`;
  // (?from=<mission id>, probes only: the drive starts at that mission and plays on from there; the ones before it are not
  // played, so such a report never passes)
  const from = /^[A-Za-z0-9_.-]{1,40}$/.test(Q.get('from') || '') ? Q.get('from') : bank.size ? left.id : null;
  // (the city part of the address, the server's (the draft status's frame: lib/storykit-publish.ts storyFrameQuery): '' for
  // New York, city=sf& for San Francisco, a hometown's city=pkg&town=...&tc=...&ts=...&, so the drive plays the built town)
  const frame = /^(city=(sf|pkg)&([a-z]{2,4}=[A-Za-z0-9._%-]{1,80}&){0,3})?$/.test(status.frame || '') ? status.frame || '' : '';
  const src = `${mc}/?${frame}pack=${encodeURIComponent(pack)}&host=${encodeURIComponent(location.origin)}&game=${encodeURIComponent(`draft-${draft}`)}`
    + `&nogate&trailer=0&autopilot=1&autoanswer=1&autochoose=0&autocontinue=1&autocard=1&flowfast=1&noaudio=1&keyart=1&missionsecs=${Math.round(LIMIT.mission / 1000)}`
    + (from ? `&mission=${encodeURIComponent(from)}` : '');
  W.drivePack = pack; W.driveSrc = src;
  const f = document.createElement('iframe'); f.title = 'Test drive'; f.allow = 'autoplay; gamepad; fullscreen';
  const t0 = performance.now(), errors = [], errorKinds = { page: 0, rejection: 0, load: 0 };
  let pauses = 0;
  // (the count rides on every drive patch: the show replaces its drive with each one)
  const errInfo = () => (errors.length ? { errors: errors.length, errorKinds: { ...errorKinds } } : {});
  let ended = false, art = null, ready = null, failWhy = '', failAt = null, endFail = null, runtimeHidden = false;
  const started = {};
  const missionOf = (id) => list.find((x) => x.id === id);
  const states = () => list.map((x) => ({ id: x.id, title: x.title, state: x.state }));
  const set = (id, state) => {
    const m = missionOf(id); if (!m || m.state === 'passed' || m.state === state) return;
    m.state = state; if (state !== 'driving') m.ms = Math.round(performance.now() - (started[id] || t0));
    show(); report({ drive: { missions: states(), ...errInfo(), note: W.driveNote || null } });
  };
  // the time this tab was in front (live) and behind (hidden); every limit counts live time only
  let live = 0, hidden = 0, lastT = performance.now(), wasHidden = false, reason = null, stuck = null;
  // progress: the mission and its step, and the metres left (a drop of 5 m or more) when Mog City says them
  let prog = { key: '', left: Infinity, at: 0 }, mStart = { id: null, at: 0 }, now = null, betweenAt = null;
  const heard = (d) => {
    log({ at: Math.round(live / 1000), msg: d.type, ...(d.id || d.mission ? { id: d.id || d.mission } : {}), ...(d.kind ? { kind: d.kind } : {}), ...(d.how ? { how: d.how } : {}) });
    switch (d.type) {
      case 'ready':
        ready = d.story && d.story.ok ? { ok: true, clips: d.story.clips } : { ok: false, why: String((d.story && d.story.why) || 'refused').slice(0, 200) };
        break;
      case 'mission-start': {
        const m = missionOf(d.id); if (!m) break;
        if (m.state === 'waiting' || m.state === 'driving') { started[m.id] = started[m.id] || performance.now(); if (m.state === 'waiting') { m.state = 'driving'; show(); report({ drive: { missions: states(), ...errInfo() } }); } }
        mStart = { id: m.id, at: live }; prog = { key: `${m.id}#start`, left: Infinity, at: live }; betweenAt = null; now = { id: m.id, i: 0, type: null };
        break;
      }
      case 'progress': {
        const id = String(d.mission || ''), i = Number.isInteger(d.i) ? d.i : -1, left = Number.isFinite(d.left) ? Math.round(d.left) : null;
        now = { id, i, type: typeof d.kind === 'string' ? d.kind : null, n: d.n, ...(left != null ? { left } : {}), ...(typeof d.step === 'string' ? { step: d.step } : {}) };
        const key = `${id}#${i}`;
        if (key !== prog.key || (left != null && left < prog.left - 5)) prog = { key, left: left != null ? left : Infinity, at: live };
        if (mStart.id !== id && missionOf(id)) { mStart = { id, at: live }; if (missionOf(id).state === 'waiting') set(id, 'driving'); }
        W.now = now;
        break;
      }
      case 'mission-fail': failWhy = String(d.why || failWhy).slice(0, 240); failAt = { id: d.id, ...(typeof d.kind === 'string' ? { type: d.kind } : {}), ...(typeof d.step === 'string' ? { stepId: d.step } : {}) }; break;
      case 'mission-end':
        if (d.how === 'pass') { set(d.id, 'passed'); betweenAt = live; prog = { key: 'between', left: Infinity, at: live }; banked(); }
        else if (d.how === 'fail') { failWhy = String(d.why || failWhy).slice(0, 240); endFail = d.id; }
        break;
      case 'keyart':
        if (d.wide instanceof ArrayBuffer && d.square instanceof ArrayBuffer && d.wide.byteLength > 1000) {
          art = { wide: new Uint8Array(d.wide), square: new Uint8Array(d.square) };
          // (stored as it arrives, a few seconds into the first drive: a drive cut short keeps its key art too)
          const a = art; a.stored = storeArt(a).then(() => true, (err) => { log({ art: String(err && err.message || err).slice(0, 160) }); return false; });
        } else log({ art: String(d.why || 'no frame') });
        break;
      case 'story-end': ended = true; break;
      case 'hidden': { const was = runtimeHidden; runtimeHidden = d.hidden !== false; if (runtimeHidden && !was) pauses++; break; }
      case 'error': {
        const kind = Object.prototype.hasOwnProperty.call(errorKinds, d.kind) ? d.kind : 'page';
        errorKinds[kind]++;
        const where = typeof d.where === 'string' && d.where ? ` (${d.where.slice(0, 120)})` : '';
        errors.push(`${kind}: ${String(d.message || d.why || d.error || 'error').slice(0, 200)}${where}`);
        report({ drive: { missions: states(), ...errInfo(), note: W.driveNote || null } });
        break;
      }
    }
  };
  // each mission passed is told to GameMog at once (partial: the drive goes on): a long story's drive cut short (the tab
  // closed, a probe's time up) keeps what it passed, and the next sitting on the same world carries it
  // (lib/storykit-publish.ts recordStoryReport); never with an error, which no later sitting can carry
  const banked = () => {
    if (errors.length) return;
    const missions = list.filter((m) => m.state === 'passed' && !m.banked).map((m) => ({ id: m.id, state: 'passed', ...(m.ms ? { ms: m.ms } : {}) }));
    fetch(`${API}/report`, { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify({ missions, errors: 0, partial: true, ms: Math.round(performance.now() - W.t0), live: Math.round(live), hidden: Math.round(hidden) }) })
      .then((r) => log({ banked: missions.length, status: r.status })).catch(() => {});
  };
  const onMessage = (e) => {
    if (e.source !== f.contentWindow || e.origin !== mc) return;
    const d = e.data;
    if (!d || typeof d !== 'object' || d.source !== 'gamemog' || typeof d.type !== 'string') return;
    // (Mog City names the game it was given, ?game=; a message about another is not this drive's)
    const named = d.gameId ?? d.game;
    if (named != null && named !== `draft-${draft}`) return;
    try { heard(d); } catch (err) { log({ heard: String(err).slice(0, 120) }); }
  };
  addEventListener('message', onMessage);
  $('#stage').appendChild(f);
  f.src = src;
  const stop = (why, at = null) => {
    reason = why; W.driveNote = why; stuck = at;
    if (at && at.id) { const m = missionOf(at.id); if (m && m.state !== 'passed') { m.state = 'failed'; m.ms = Math.round(live - (mStart.at || 0)); } }
    show(); report({ drive: { missions: states(), ...errInfo(), note: why } });
  };
  const where = () => (now && now.id ? { id: now.id, ...(now.i >= 0 ? { step: now.i } : {}), ...(now.type ? { type: now.type } : {}), ...(now.left != null ? { left: now.left } : {}) } : null);
  const stepWords = () => (now && now.i >= 0 ? `step ${now.i + 1}${now.type ? ` (${now.type}${now.step ? ` ${now.step}` : ''}${now.left != null ? `, ${now.left} m left` : ''})` : ''}` : 'its start');
  for (;;) {
    const t = performance.now(), dt = t - lastT; lastT = t;
    if (document.hidden) {
      hidden += dt;
      if (!wasHidden) { wasHidden = true; log({ hidden: Math.round(live / 1000) }); report({ drive: { missions: states(), ...errInfo(), note: 'Paused: the test drive only runs while this tab is in front. Come back to this tab to carry on.' } }); say('Test drive paused: this tab is in the background.'); }
      if (hidden > LIMIT.hidden) { stop(`The test drive was paused for ${Math.round(hidden / 60_000)} minutes because this tab was in the background. Keep the tab in front while your world is made.`); break; }
      await sleep(500); continue;
    }
    if (wasHidden) { wasHidden = false; report({ drive: { missions: states(), ...errInfo(), note: null } }); say('Test drive: the autopilot is playing every mission in Mog City...'); }
    // (Mog City paused itself behind a background tab and has not said it is back: that time is not counted either)
    if (runtimeHidden) { hidden += Math.min(dt, 2000); if (hidden > LIMIT.hidden) { stop('The test drive stayed paused: Mog City was held in the background.'); break; } await sleep(250); continue; }
    live += Math.min(dt, 2000);
    if (ended) break;
    if (live > LIMIT.drive) { const m = list.find((x) => x.state === 'driving'); stop(`The test drive ran out of time (${Math.round(LIMIT.drive / 60_000)} minutes)${m ? ` on "${m.title}"` : ''}.`, m ? { id: m.id } : null); break; }
    // the world never got to its missions: Mog City refused it, or it did not load
    if (ready && !ready.ok) { stop(`Mog City did not load the world: ${ready.why}.`); break; }
    if (!mStart.id) {
      if (live > LIMIT.load) { stop(ready ? `The world loaded in Mog City but its first mission did not start in ${Math.round(LIMIT.load / 1000)} s.` : `Mog City did not load the world in ${Math.round(LIMIT.load / 1000)} s${errors.length ? `: ${errors[0]}` : ''}.`); break; }
      await sleep(250); continue;
    }
    if (endFail) {
      const m = missionOf(endFail);
      stop(`"${m ? m.title : endFail}" failed under the autopilot${failWhy ? `: ${failWhy.trim().replace(/[.!]+$/, '').slice(0, 160)}` : ''}.`, { id: endFail, ...(failAt && failAt.id === endFail && failAt.type ? { type: failAt.type } : now && now.id === endFail ? { ...(now.i >= 0 ? { step: now.i } : {}), ...(now.type ? { type: now.type } : {}) } : {}) });
      break;
    }
    if (betweenAt != null) {
      // between missions (the card, the next one's start): nothing may sit here long either
      if (list.every((x) => x.state === 'passed') && live - betweenAt > 8000) { ended = true; break; }
      if (live - betweenAt > LIMIT.between) { const next = list.find((x) => x.state === 'waiting'); stop(`The story stopped between missions${next ? `, before "${next.title}"` : ''}: nothing started for ${Math.round(LIMIT.between / 1000)} s.`, next ? { id: next.id } : null); break; }
    } else {
      const m = missionOf(mStart.id), title = (m && m.title) || mStart.id;
      if (live - prog.at > LIMIT.step) { stop(`"${title}" is stuck at ${stepWords()}: no progress for ${Math.round(LIMIT.step / 1000)} s.`, where() || { id: mStart.id }); break; }
      if (live - mStart.at > LIMIT.mission) { stop(`"${title}" did not finish in ${Math.round(LIMIT.mission / 60_000)} minutes (at ${stepWords()}).`, where() || { id: mStart.id }); break; }
    }
    await sleep(250);
  }
  // (the key art comes a few seconds into the first drive: a drive that ended sooner waits a moment for it)
  for (let i = 0; i < 24 && !art && Object.keys(started).length && !reason; i++) await sleep(250);
  // every mission played, but Mog City reported errors on the way: said, as the reason it is not a pass
  if (!reason && errors.length) { reason = `Mog City reported ${errors.length} error${errors.length > 1 ? 's' : ''} during the test drive (${Object.entries(errorKinds).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ')}); the first: ${errors[0].slice(0, 160)}.`; W.driveNote = reason; report({ drive: { missions: states(), ...errInfo(), note: reason } }); }
  removeEventListener('message', onMessage);
  W.drive = { ms: Math.round(performance.now() - t0), live: Math.round(live), hidden: Math.round(hidden), ended, reason, stuck, ready, errors: errors.slice(0, 20), errorCount: errors.length, errorKinds, pauses, art: !!art };
  if (reason) { W.stuck = stuck; log({ stopped: reason }); }
  return { list, errors, art, frame: f, reason, stuck, live, hidden };
}

/* --------------------------------------------------------------------- art -- */
async function storeArt(art) {
  await put('art', 'key-wide.jpg', new Blob([art.wide], { type: 'image/jpeg' }), 'image/jpeg');
  await put('art', 'key-square.jpg', new Blob([art.square], { type: 'image/jpeg' }), 'image/jpeg');
}
async function keyArt(art, hero) {
  report({ stage: 'art', art: { hero: hero?.name, ...(hero?.portrait ? { headshot: hero.portrait } : {}) } });
  say('Framing the key art...');
  if (!art) { log({ art: 'no frame' }); return null; }
  if (!(art.stored && await art.stored)) await storeArt(art);
  const wide = await toDataUrl(art.wide);
  if (wide) report({ art: { keyArt: wide } });
  return art;
}

/* ------------------------------------------------------------------ the run -- */
(async () => {
  if (!/^[0-9a-f-]{36}$/.test(draft)) return fail('Open this page with ?draft=<draft id>.');
  if (!token) return fail('This page needs the draft\'s token: open it from the world you are making.');
  W.state = 'running';
  const { pack: src } = await getJson(`${API}/source`);
  const status = await getJson(API);
  $('#title').textContent = `Making ${src.title}`;
  document.title = `Making ${src.title}`;
  const { hero } = await timed('forge', () => forging(src, status));
  let world = await getJson(`${API}/pack`);
  await timed('voice', () => voicing(world));
  world = await getJson(`${API}/pack`);
  // (the draft's status again: what is banked is judged on the world as it is after the voices)
  const drive = await timed('drive', async () => driving(world, await getJson(API)));
  await timed('art', () => keyArt(drive.art, hero));
  // the drive's frame goes: the world has been played, and its city is a gigabyte of memory
  drive.frame?.remove();
  // (a banked mission is the server's to carry, recordStoryReport: only what this sitting played is reported)
  const rep = { missions: drive.list.filter((m) => !m.banked && (m.state === 'passed' || m.state === 'failed')).map((m) => ({ id: m.id, state: m.state, ...(m.ms ? { ms: m.ms } : {}) })),
    errors: drive.errors.length, ms: Math.round(performance.now() - W.t0), stages: W.stages,
    ...(drive.reason ? { reason: drive.reason } : {}), ...(drive.stuck ? { stuck: drive.stuck } : {}), live: Math.round(drive.live), hidden: Math.round(drive.hidden) };
  W.report = await getJson(`${API}/report`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(rep) });
  W.state = 'done'; W.ms = rep.ms;
  say(W.report.status === 'passed' ? 'Done: every mission played to the end.' : `Done: ${W.report.passed} of ${W.report.of} missions played to the end.${drive.reason ? ' ' + drive.reason : ''}`);
  report({ done: true, result: { ...W.report, ...(drive.reason ? { reason: drive.reason } : {}) }, stages: W.stages });
})().catch((e) => fail(String(e && e.message || e)));
