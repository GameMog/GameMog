// The owner's voices for a published story world, recorded again (lib/storykit-publish.ts storyWorldsToRevoice). Every
// hometown story published before its voice plan read the town's table was sealed with no lines: its cast spoke only the
// placeholder mumble. Kokoro runs only in a browser, so this page records the missing lines in the owner's browser with
// the voice studio (voices/studio.html?revoice=<slug>: the same pass and codec as a creator's, the clips kept in that
// tab), then sends them to the published world as the owner's patch (POST /api/storykit/admin/patch: the world as it is,
// its voice now the pack's plan with every clip; StoryStore.patch checks the lines against the plan and each clip
// against a line). The owner's /admin session only (the routes answer 404 to anyone else).
//   /storykit/revoice.html              the published story worlds with lines to record, each a link
//   /storykit/revoice.html?slug=<slug>  record that world's missing lines and patch it (keep the tab open until done)
const $ = (s) => document.querySelector(s);
const API = '/api/storykit/admin/revoice', PATCH = '/api/storykit/admin/patch';
const slug = new URLSearchParams(location.search).get('slug') || '';
const W = (window.__revoice = { slug, state: 'loading', log: [] });
const say = (s, cls = '') => { const e = $('#st'); e.textContent = s; e.className = cls; };
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
// (a patch carries at most 64 files, app/api/storykit/admin/patch/route.ts: the clips go in batches, each one a patch
// of the world as the last one left it, its clips so far named, the new ones sent)
const BATCH = 48;

async function getJson(url, opts = {}) {
  const r = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...opts });
  const j = await r.json().catch(() => ({}));
  if (r.status === 404 && !j.error) throw new Error('Not found: sign in at /admin first (the owner only).');
  if (!r.ok) throw Object.assign(new Error(j.error || `${url}: ${r.status}`), { problems: j.problems });
  return j;
}
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };

async function list() {
  const { worlds } = await getJson(API);
  say(worlds.length ? 'Published story worlds with lines that have no voice. Open one to record them in this browser (keep the tab open until it says done).' : 'Every published story world has its voices.');
  $('#list').innerHTML = worlds.map((g) => `<li><a href="?slug=${encodeURIComponent(g.slug)}">${esc(g.title)}</a> <span class="mute">${esc(g.slug)}${g.city ? ` · ${esc(g.city)}` : ''}${g.hidden ? ' · hidden' : ''} · ${g.missing} of ${g.lines} lines to record${g.stale ? ' · its world lists no lines' : ''}</span></li>`).join('');
  W.state = 'listed'; W.worlds = worlds;
}

async function record() {
  const g = await getJson(`${API}?slug=${encodeURIComponent(slug)}`);
  $('#title').textContent = `Voices again: ${g.title}`;
  document.title = `Voices again: ${g.title}`;
  W.missing = g.missing; W.from = g.from;
  say(g.missing ? `Recording ${g.missing} lines with the voice studio in this browser...` : 'No line to record: the world is sent its voice plan only.');
  W.state = 'recording';
  const f = document.createElement('iframe');
  f.title = 'The voice studio';
  $('#stage').appendChild(f);
  f.src = `/storykit/voices/studio.html?revoice=${encodeURIComponent(slug)}&auto=1`;
  // the studio's state (same origin): done when its pass ends, or at once when nothing is left to record
  const S = await new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      const s = f.contentWindow && f.contentWindow.__studio;
      if (s && s.state === 'error') return reject(new Error(`The voice studio: ${s.error}`));
      if (s && (s.state === 'done' || (s.state === 'idle' && s.todo === 0))) return resolve(s);
      if (s && s.state === 'done' && s.mode !== 'kokoro') return resolve(s);
      if (s) W.studio = { state: s.state, made: s.made.length, todo: s.todo, device: s.device, dtype: s.dtype };
      if (Date.now() - t0 > 90 * 60_000) return reject(new Error('The voices did not finish in 90 minutes.'));
      setTimeout(tick, 500);
    };
    tick();
  });
  W.studio = { state: S.state, made: S.made.length, failed: (S.failed || []).length, device: S.device, dtype: S.dtype, mode: S.mode || S.plan?.mode, note: S.note || null };
  if (S.plan && S.plan.mode !== 'kokoro' && g.missing) throw new Error(S.note || 'This browser cannot make the voices.');
  // the patches: the world as it plays, its voice the plan with the clips kept and every clip made here
  const made = S.collected.slice();
  const clips = { ...(g.voice.clips || {}) };
  const voice = { ...g.voice };
  W.state = 'sending'; W.sent = 0; W.patches = [];
  let i = 0;
  do {
    const batch = made.slice(i, i + BATCH);
    for (const c of batch) clips[c.clip] = c.entry;
    const world = { ...g.world, voice: { ...voice, clips: { ...clips } } };
    say(`Sending ${Math.min(made.length, i + batch.length)} of ${made.length} clips to the world...`);
    const r = await getJson(PATCH, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, world, files: batch.map((c) => ({ ext: c.ext, base64: b64(c.bytes) })) }) });
    W.patches.push({ hash: r.hash, was: r.was, clips: r.clips, stored: r.stored });
    i += batch.length; W.sent = i;
  } while (i < made.length);
  const after = await getJson(`${API}?slug=${encodeURIComponent(slug)}`);
  W.state = 'done'; W.left = after.missing; W.world = after.from;
  say(`Done: ${made.length} lines recorded and sent${S.failed && S.failed.length ? `, ${S.failed.length} failed` : ''}; ${after.missing} left without a voice. /g/${slug} plays them now.`, after.missing ? '' : 'ok');
}

(slug ? record() : list()).catch((e) => { W.state = 'error'; W.error = String(e && e.message || e); W.problems = e && e.problems; say(W.error + (e && e.problems ? `: ${e.problems.slice(0, 3).join(' ')}` : ''), 'bad'); });
