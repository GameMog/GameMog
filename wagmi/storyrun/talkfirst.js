// Mog City story runner: the story's line first (Mandi's Revenge audit, H4). While a line of the story is up (its
// subtitle, #wg .wg-sub), nothing else talks over it on the screen:
//   - the street's 'Hit and run' note and the fight's own flashes ('Roadkill', 'Hit and run') wait their turn;
//   - the story's alerts (juice.js): a passing one (Crash, Near miss) is dropped, a beat of the story (Lost them, a
//     chase starting) waits until the line is over (up to WAIT s), then shows; never two at once: the 'Hit and run'
//     note stands aside while an alert is up (ww6-04: CRASH, HIT AND RUN and Jay's line together).
// body.wg-talk is set while a line is up and TAIL ms after it, so a quick exchange does not flicker the prompts back.
//   installTalkFirst(W)   (storyrun/index.js, a story world only)
const TAIL = 350, WAIT = 6000;
const PASSING = /^(crash|near miss|roadkill|hit and run|bumpered|wrecked|smash)$/i;
const CSS = `
body.wg-talk #wg-tick, body.wg-talk #wf .wf-msg, body:has(#sr-juice.on) #wg-tick, body:has(#sr-juice.on) #wf .wf-msg { opacity: 0 !important; }`;

export function lineUp() { const s = document.querySelector('#wg .wg-sub:not(.hide)'); return !!s && !!s.textContent.trim(); }

export function installTalkFirst(W) {
  if (W.__talkFirst) return W.__talkFirst;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  let lastUp = -1e9;
  const talking = () => performance.now() - lastUp < TAIL;
  (function tick() {
    requestAnimationFrame(tick);
    if (lineUp()) lastUp = performance.now();
    const on = talking();
    if (document.body.classList.contains('wg-talk') !== on) document.body.classList.toggle('wg-talk', on);
  })();
  // the story's alerts: wrapped once the runner has made them (W.juice)
  const wrap = () => {
    const J = W.juice; if (!J || J.__talkFirst) return !!J;
    const alert0 = J.alert.bind(J);
    J.alert = (text, o = {}) => {
      if (!talking()) return alert0(text, o);
      if (PASSING.test(String(text || '').trim())) { api.dropped++; return; }
      const t0 = performance.now();
      const later = () => { if (!talking()) { api.deferred++; alert0(text, o); } else if (performance.now() - t0 < WAIT) setTimeout(later, 150); else api.dropped++; };
      setTimeout(later, 150);
    };
    J.__talkFirst = true; return true;
  };
  if (!wrap()) { const iv = setInterval(() => { if (wrap()) clearInterval(iv); }, 500); }
  const api = (W.__talkFirst = { get talking() { return talking(); }, dropped: 0, deferred: 0 });
  return api;
}
