// Mog City story runner: the action beats' punch (a story world only, under ?pack=). The runner calls it at the moments
// a player should feel: a chase starting (a red alert and a rising sting, the camera jolted), losing them (a green one),
// a roadblock coming up and being rammed through (a beat of slow motion), a tail getting too close or too far, a hard
// timer starting (its label and what is at stake) and its last ten seconds (a red pulse at the screen's edge).
// Nothing here changes a rule: it draws, sounds and leans on Mog City's own slow motion and camera jolt (wagmi/crash).
//   createJuice(W) -> { alert(text, { sub, tone, sting, secs, jolt }), pulse(k), slow(secs, scale), clear(), live }
// Near misses (live: a mission is on): his car, at speed, slipping past one of the city's cars or buses within a hand's
// width of it and never touching it: NEAR MISS, a whoosh and a little camera kick; a crash on the way past cancels it.
//   tone: 'red' (danger) | 'green' (made it) | 'yellow' (a clock, a warning); sting: 'up' | 'down' | 'hit' | null
const TONE = { red: '#EF4444', green: '#4ADE80', yellow: '#FFC93C' };
const STING = {
  up: [196, 233.08, 293.66, 392], // a minor rise: they're coming
  down: [392, 329.63, 261.63, 196], // the fall after it: lost them
  hit: [110, 116.54, 98, 130.81], // a low clash: a roadblock, a ram
  win: [261.63, 329.63, 392, 523.25],
};
export function createJuice(W) {
  const sfx = W.sfx;
  const css = document.createElement('style');
  css.textContent = `
#sr-juice{position:fixed;left:50%;top:17vh;transform:translateX(-50%) scale(.9);z-index:60;pointer-events:none;text-align:center;opacity:0;transition:opacity .16s,transform .2s cubic-bezier(.2,1.6,.4,1);white-space:nowrap}
#sr-juice.on{opacity:1;transform:translateX(-50%) scale(1)}
#sr-juice .h{font:italic 800 46px/1 'Barlow Condensed',system-ui,sans-serif;letter-spacing:.1em;text-shadow:0 3px 18px rgba(0,0,0,.7),0 0 2px rgba(0,0,0,.9)}
#sr-juice .s{margin-top:6px;font:600 18px/1.2 'Barlow Condensed',system-ui,sans-serif;letter-spacing:.06em;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.8)}
#sr-pulse{position:fixed;inset:0;z-index:59;pointer-events:none;opacity:0;box-shadow:inset 0 0 120px 30px rgba(239,68,68,.55);transition:opacity .35s}
@media (max-width:700px){#sr-juice .h{font-size:32px}#sr-juice .s{font-size:14px}}`;
  document.head.appendChild(css);
  const el = document.createElement('div'); el.id = 'sr-juice';
  const h = document.createElement('div'); h.className = 'h';
  const s = document.createElement('div'); s.className = 's';
  el.append(h, s);
  const pl = document.createElement('div'); pl.id = 'sr-pulse';
  document.body.append(pl, el);
  let hideT = 0, pulseT = 0, lastAt = 0;
  // (near misses: the city's cars within reach of his car's side, at speed; touched on the way past: no near miss)
  const close = new Map();
  let lastHit = 0, lastMiss = 0;
  try { W.crash?.on?.('hit', () => { lastHit = performance.now(); }); } catch {}
  const nearLoop = () => {
    requestAnimationFrame(nearLoop);
    const cm = W.app?.controllerManager, car = W.car, tr = W.app?.trafficSystem;
    if (!api.live || W.cutscene || W.paused || !cm || cm.activeMode !== 'car' || !car || !tr) { close.clear(); return; }
    const v = Math.abs(car.speed || 0), t = performance.now();
    for (const list of [tr.cars || [], tr.buses || []]) for (const o of list) {
      if (!o || o.wreck || o === car) continue;
      const d = Math.hypot(o.x - car.position.x, o.z - car.position.z), R = o.bus ? 4.6 : 3.3;
      if (d < R && v > 15) { if (!close.has(o)) close.set(o, { t, d }); else close.get(o).d = Math.min(close.get(o).d, d); }
      else if (close.has(o) && d > R + 1.2) {
        const c = close.get(o); close.delete(o);
        if (lastHit < c.t - 150 && t - lastMiss > 6000 && v > 16) {
          lastMiss = t; api.nearMisses++;
          api.alert('Near miss', { tone: 'yellow', secs: 1.1 }); sfx?.play?.('whoosh', { gain: 0.28 });
          try { W.crash?.jolt?.(0.18, 0, 0); } catch {}
        }
      }
    }
    if (close.size > 24) close.clear();
  };
  requestAnimationFrame(nearLoop);
  const api = {
    live: false, nearMisses: 0,
    alert(text, { sub = '', tone = 'red', sting = null, secs = 2.4, jolt = 0 } = {}) {
      if (!text || W.cutscene) return;
      const t = performance.now();
      // (two in one breath: the second waits its turn rather than stepping on the first)
      if (t - lastAt < 900) { setTimeout(() => api.alert(text, { sub, tone, sting, secs, jolt }), 900 - (t - lastAt)); return; }
      lastAt = t;
      h.textContent = String(text).toUpperCase(); h.style.color = TONE[tone] || tone;
      s.textContent = sub || ''; s.style.display = sub ? '' : 'none';
      el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
      clearTimeout(hideT); hideT = setTimeout(() => el.classList.remove('on'), secs * 1000);
      if (sting && STING[sting]) sfx?.play?.('stinger', { gain: 0.34, notes: STING[sting] });
      if (jolt) try { W.crash?.jolt?.(jolt, 0, 0); } catch {}
    },
    // the screen's edge, red, pulsed once (k 0..1: how hard)
    pulse(k = 1) {
      pl.style.transition = 'opacity .08s'; pl.style.opacity = String(Math.min(1, 0.35 + 0.65 * k));
      clearTimeout(pulseT); pulseT = setTimeout(() => { pl.style.transition = 'opacity .5s'; pl.style.opacity = '0'; }, 140);
    },
    // a beat of slow motion (real seconds), Mog City's own (the crash's)
    slow(secs = 0.6, scale = 0.32) { try { W.crash?.slowmo?.(secs, scale); } catch {} },
    clear() { clearTimeout(hideT); el.classList.remove('on'); pl.style.opacity = '0'; },
  };
  return api;
}
