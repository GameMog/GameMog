// The owner's key art for a published story world, taken again (lib/storykit-publish.ts saveStoryKeyArt). Mog City makes
// key art only in a browser: this page plays the world as it is published (its sealed world, unchanged) in Mog City under
// its autopilot with ?keyart=1, hears the `keyart` message (a wide and a square JPEG of the first drive, the HUD hidden,
// Mog City wagmi/storyrun/host.js) and sends them to app/api/storykit/admin/keyart, which makes them the game's cover and
// art and titles them. The owner's /admin session only (the route answers 404 to anyone else).
//   /storykit/keyart.html              the published story worlds with no key art, each a link
//   /storykit/keyart.html?slug=<slug>  take it for that world (keep this tab in front: a hidden tab draws nothing)
//   ...&shot=stand|hood|rideoff         the composition (Mog City wagmi/storyrun/keyshots.js, its &keyshot=): the hero
//                                      standing by his car (every world's, unless SHOTS names another), sat on its hood,
//                                      or riding his horse off into the sunset
const $ = (s) => document.querySelector(s);
const API = '/api/storykit/admin/keyart';
const slug = new URLSearchParams(location.search).get('slug') || '';
// (the owner's pick, 18 Nov: Colter Land's hero riding off into the sunset)
const SHOTS = { 'colter-land': 'rideoff' }; // (owner 18 Nov: Oaktown keeps its stand-by-the-car cover; 'hood' stays available via ?shot=hood)
const shot = (() => { const s = new URLSearchParams(location.search).get('shot'); return ['stand', 'hood', 'rideoff'].includes(s) ? s : SHOTS[slug] || 'stand'; })();
const W = (window.__keyart = { slug, state: 'loading', log: [] });
const say = (s, cls = '') => { const e = $('#st'); e.textContent = s; e.className = cls; };
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
const LIMIT_MS = 4 * 60_000;

async function getJson(url, opts = {}) {
  const r = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...opts });
  const j = await r.json().catch(() => ({}));
  // (the route answers 404 'Not found.' to anyone not signed in as the owner, and to everyone while the Story Kit is off:
  // the page says the same to all of them, with nothing about what the owner would see; an owner asking for a slug that
  // is not published reads the route's own words)
  if (r.status === 404 && (!j.error || j.error === 'Not found.')) throw new Error('Sign in at /admin first. This page is for the site\'s owner.');
  if (!r.ok) throw new Error(j.error || `${url}: ${r.status}`);
  return j;
}
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };

async function list() {
  const { missing } = await getJson(API);
  say(missing.length ? 'Published story worlds with no key art. Open one to take it (keep the tab in front while it plays).' : 'Every published story world has key art.');
  $('#list').innerHTML = missing.map((g) => `<li><a href="?slug=${encodeURIComponent(g.slug)}">${esc(g.title)}</a> <span class="mute">${esc(g.slug)}${g.city ? ` · ${esc(g.city)}` : ''}${g.hidden ? ' · hidden' : ''}</span></li>`).join('');
  W.state = 'listed'; W.missing = missing;
}

async function take() {
  const g = await getJson(`${API}?slug=${encodeURIComponent(slug)}`);
  $('#title').textContent = `Key art: ${g.title}`;
  document.title = `Key art: ${g.title}`;
  say(`${g.hasArt ? 'It has key art; this replaces it. ' : ''}Playing the world in Mog City until its first drive is framed...`);
  W.state = 'playing'; W.src = g.src; W.shot = shot;
  const f = document.createElement('iframe');
  f.title = 'The world playing'; f.allow = 'autoplay; gamepad; fullscreen';
  const art = await new Promise((resolve, reject) => {
    const t = setTimeout(() => { done(); reject(new Error(`No frame in ${LIMIT_MS / 60_000} minutes: the world's first drive did not start (keep this tab in front).`)); }, LIMIT_MS);
    const done = () => { clearTimeout(t); removeEventListener('message', onMessage); };
    const onMessage = (e) => {
      if (e.source !== f.contentWindow || e.origin !== g.mc) return;
      const d = e.data;
      if (!d || typeof d !== 'object' || d.source !== 'gamemog' || typeof d.type !== 'string') return;
      W.log.push({ type: d.type, ...(d.why ? { why: String(d.why).slice(0, 200) } : {}) });
      if (d.type === 'ready' && !(d.story && d.story.ok)) { done(); reject(new Error(`Mog City refused the world: ${String((d.story && d.story.why) || 'refused').slice(0, 200)}`)); }
      else if (d.type === 'keyart') {
        done();
        if (d.wide instanceof ArrayBuffer && d.square instanceof ArrayBuffer && d.wide.byteLength > 1000) resolve({ wide: new Uint8Array(d.wide), square: new Uint8Array(d.square) });
        else reject(new Error(`Mog City took no frame: ${String(d.why || 'no frame')}`));
      } else if (d.type === 'hidden' && d.hidden !== false) say('This tab went behind: Mog City draws nothing until it is in front again.');
    };
    addEventListener('message', onMessage);
    $('#stage').appendChild(f);
    f.src = shot === 'stand' ? g.src : `${g.src}&keyshot=${shot}`;
  });
  f.remove();
  for (const [k, b] of Object.entries(art)) { const i = new Image(); i.alt = k; i.src = URL.createObjectURL(new Blob([b], { type: 'image/jpeg' })); $('#shots').appendChild(i); }
  say('Saving it as the game\'s cover and art...');
  W.state = 'saving';
  const r = await getJson(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: g.slug, wide: b64(art.wide), square: b64(art.square) }) });
  W.state = 'done'; W.result = r;
  say(`Done: ${g.title} has key art${r.titled ? ', titled' : ' (its plain frame: the title could not be set)'}. /g/${g.slug} shows it (cached up to an hour).`, 'ok');
}

(slug ? take() : list()).catch((e) => { W.state = 'error'; W.error = String(e && e.message || e); say(W.error, 'bad'); });
