// Mog City: the progress save, small. After each MISSION PASSED the story so far goes to localStorage:
//   { v: 1, done: ['m1', 'm2', ...], unlocks: { fists, cans, bats, thrusters }, followers, at }
// Every access is wrapped: with no storage (a private window, blocked site data) the game plays the same, unsaved.
//   readSave()                the save, or null
//   saveGate(ui, opts)        the start gate with a save: CONTINUE (the next mission's blip, no opening) or NEW GAME
//                             (the opening). Resolves 'continue' | 'new'. (intro.js uses it in place of ui.gate)
//   resume(W)                 Continue: the unlocks put back, Dan on foot near the next mission's blip
//   watchStory(W)             (every session) notes each mission passed, saves, and keeps the way on pointing at the
//                             next mission (a replayed mission's hand-off can't send him back to an old blip)
//   W.storyList(), W.replay(id)  the pause menu's Mission select: the story's missions, and replaying one that is passed
const KEY = 'wagmi.save.v1';
export const STORY = [
  { id: 'm1', act: 'Act I · Mission 1', title: 'Bagged', unlocks: { fists: true } },
  { id: 'm2', act: 'Act I · Mission 2', title: 'Burner', unlocks: { cans: true } },
  { id: 'm3', act: 'Act II · Mission 3', title: 'KOLs', unlocks: { bats: true, thrusters: true } },
];
const ORDER = ['m1', 'm2', 'm3', 'm4'];
const J_AT = { x: -296, z: 84.5 }, G_AT = { x: -1560, z: 1611 };
const near = (a, b, r = 3) => !!a && Math.hypot(a.x - b.x, a.z - b.z) < r;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function readSave() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && Array.isArray(s.done) && s.done.length ? s : null; } catch { return null; }
}
function writeSave(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch { return false; } }
const story = (W) => W.story || (W.story = { done: [], unlocks: {} });
export const nextOf = (done) => ORDER.find((id) => !done.includes(id)) || 'm4';

// a mission passed: noted, its unlocks applied, the save written
export function markDone(W, id) {
  const S = story(W);
  // (a mission passed means the ones before it were too: a session started at a checkpoint saves the whole way)
  for (const m of ORDER.slice(0, ORDER.indexOf(id) + 1)) if (!S.done.includes(m)) { S.done.push(m); Object.assign(S.unlocks, STORY.find((x) => x.id === m)?.unlocks || {}); }
  S.done.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  Object.assign(S.unlocks, STORY.find((m) => m.id === id)?.unlocks || {});
  applyUnlocks(W);
  // (the save only ever grows: a New Game played over a save keeps what the save had, so CONTINUE still goes on from
  // the furthest the story has been)
  const old = readSave() || { done: [], unlocks: {}, followers: 0 };
  const done = ORDER.filter((m) => S.done.includes(m) || old.done.includes(m));
  return writeSave({ v: 1, done, unlocks: { ...old.unlocks, ...S.unlocks }, followers: Math.max(W.followers || 0, old.followers || 0), at: Date.now() });
}
export function applyUnlocks(W) {
  const U = story(W).unlocks;
  if (U.thrusters) W.thrusters?.unlock?.('all', { announce: false });
  W.unlocks = { ...U };
}

/* ------------------------------------------------------------ the gate -- */
const CSS = `
#wg .wg-gate .go.m3save { top: 55%; display: flex; flex-direction: column; align-items: center; gap: 8px; animation: none; padding: 0; }
#wg .m3save .opt { min-width: min(280px, calc(100vw - 48px)); padding: 9px 20px 8px; border-radius: 10px; background: rgba(8,10,14,0.62); border: 1px solid rgba(255,255,255,.14);
  font: italic 800 clamp(20px, 2.2vw, 27px)/1 'Barlow Condensed', system-ui, sans-serif; letter-spacing: 2px; color: rgba(255,255,255,.85); text-align: center; cursor: pointer; text-shadow: 0 1px 3px rgba(0,0,0,.8); pointer-events: auto; }
#wg .m3save .opt small { display: block; margin-top: 4px; font: 600 13px/1 'Barlow Condensed'; letter-spacing: 1px; font-style: normal; color: rgba(255,255,255,.6); }
#wg .m3save .opt.sel { border-color: #FFC93C; color: #FFC93C; background: rgba(255,201,60,.12); }
`;
export function saveGate(ui, opts = {}) {
  // (the story's watcher from the gate on, so the pause menu's Mission select works in a New Game's first mission)
  if (window.WAGMI?.app) watchStory(window.WAGMI);
  const save = readSave();
  if (!save) return ui.gate(opts).then(() => 'new');
  if (!document.getElementById('m3save-css')) { const st = document.createElement('style'); st.id = 'm3save-css'; st.textContent = CSS; document.head.appendChild(st); }
  const next = nextOf(save.done), M = STORY.find((m) => m.id === next);
  const what = M ? `Next: ${M.title} · ${M.act}` : 'Next: Mission 4 (coming soon)';
  let sel = 0, el = null;
  const draw = () => el?.querySelectorAll('.opt').forEach((o, i) => o.classList.toggle('sel', i === sel));
  // (ahead of the gate's own key: the arrows choose, they don't start)
  const nav = (e) => {
    if (!document.body.classList.contains('wg-gating')) return;
    if (e.type === 'keydown' && /^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight|KeyW|KeyS)$/.test(e.code)) { sel = 1 - sel; draw(); e.stopImmediatePropagation(); e.preventDefault(); return; }
    if (e.type === 'pointerdown') { const o = e.target.closest?.('.m3save .opt'); if (o) sel = +o.dataset.i; }
  };
  addEventListener('keydown', nav, true); addEventListener('pointerdown', nav, true);
  const p = ui.gate(opts);
  // (the gate's line swapped for the two choices)
  const swap = () => {
    const go = [...document.querySelectorAll('#wg .wg-gate .go')].pop(); if (!go) return requestAnimationFrame(swap);
    go.classList.add('m3save'); el = go;
    go.innerHTML = `<div class="opt sel" data-i="0">CONTINUE<small>${what}</small></div><div class="opt" data-i="1">NEW GAME<small>The story from the start · your save is kept</small></div>`;
  };
  swap();
  return p.then(() => { removeEventListener('keydown', nav, true); removeEventListener('pointerdown', nav, true); return sel === 0 ? 'continue' : 'new'; });
}

/* -------------------------------------------------------------- resume -- */
// where free roam picks up: on foot a few metres from the next mission's blip, his car at the curb by him
const SPAWN = {
  m2: { car: [-303.5, 66, Math.PI], dan: [-300.5, 72, Math.PI * 0.75], time: 'twilight' },
  m3: { car: [-1548, 1603.6, Math.PI / 2], dan: [-1551, 1607.4, -Math.PI / 2], time: 'midday' },
  m4: { car: [-1548, 1603.6, Math.PI / 2], dan: [-1551, 1607.4, Math.PI], time: 'golden' },
};
export async function resume(W, hold) {
  const save = readSave() || { done: [], unlocks: {} };
  const S = story(W); S.done = [...save.done]; S.unlocks = { ...save.unlocks };
  W.followers = save.followers || 0;
  if (S.done.includes('m2')) W.progress = { ...(W.progress || {}), m2: true };
  const ui = W.ui, app = W.app, next = nextOf(S.done), sp = SPAWN[next] || SPAWN.m4;
  const { place } = await import('../intro.js');
  app.selectTime?.(sp.time);
  place(W, { car: sp.car, dan: sp.dan });
  W.person.mesh.visible = true;
  hold?.release(0); W._holdCam = null;
  ui.cine(false); ui.gameTitle?.(false); ui.story(true);
  applyUnlocks(W);
  await toNext(W, { quick: true });
  ui.place(next === 'm2' ? 'Bryant Park' : 'West Chelsea', next === 'm2' ? 'Midtown · New York' : 'Static Garage · New York', 3);
}
// the way on to the next mission (its blip, its route, its corona)
export async function toNext(W, { quick = false } = {}) {
  const next = nextOf(story(W).done);
  if (next === 'm1') return;
  if (next === 'm2') { (await import('./m2.js')).handoff(W, { quick }); return; }
  const m3 = await import('./m3.js');
  if (next === 'm3') m3.toGarage(W, { quick });
  else m3.toRook(W, { quick });
}

/* ------------------------------------------------------- the watcher -- */
export function watchStory(W) {
  if (W._storyWatch) return; W._storyWatch = true;
  story(W);
  // (passed: in this session, or in the save: a New Game can still replay what the save has)
  const passed = (id) => story(W).done.includes(id) || !!readSave()?.done.includes(id);
  W.storyList = () => STORY.map((m) => ({ ...m, passed: passed(m.id) }));
  W.replay = (id) => replay(W, id);
  let busy = false;
  setInterval(() => {
    if (busy || W.paused) return;
    const S = story(W), B = W.between;
    // Mission 1 passed: its hand-off puts the J at Bryant Park; Mission 2 passed: it says so (W.progress)
    if (near(B?.at, J_AT) && !S.done.includes('m1')) markDone(W, 'm1');
    if (W.progress?.m2 && !S.done.includes('m2')) { if (!S.done.includes('m1')) markDone(W, 'm1'); markDone(W, 'm2'); }
    // a blip that isn't the next mission's (Mission 2's G is taken over by Mission 3's own; after a replay, the old
    // mission's hand-off gives way to the story's next)
    if (!B || B.m3) return;
    const next = nextOf(S.done);
    const stale = (near(B.at, J_AT) && next !== 'm2') || near(B.at, G_AT);
    if (stale) { busy = true; B.stop(); toNext(W, { quick: true }).finally(() => { busy = false; }); }
  }, 400);
}

/* ------------------------------------------------------------- replay -- */
async function replay(W, id) {
  const S = story(W); if (!S.done.includes(id) && !readSave()?.done.includes(id)) return;
  W.between?.stop(); W.mission?.stop?.(); W.combat?.clear?.();
  W.ui.ko?.(false); W.ui.objective(null); W.ui.help(null);
  await sleep(50);
  if (id === 'm1') (await import('./m1.js')).start(W, { at: 'car' }).catch((e) => console.error('[replay]', e));
  else if (id === 'm2') (await import('./m2.js')).start(W, { at: 'start' }).catch((e) => console.error('[replay]', e));
  else if (id === 'm3') (await import('./m3.js')).start(W, { at: 'garage' }).catch((e) => console.error('[replay]', e));
}
