// Mog City: the car's cold-gas thrusters (Mission 3's unlock; later missions use them too). Little puffs of nitrogen:
//   boost  the rocket package on Shift (wagmi/game.js; always there)
//   hop    SPACE: the perimeter ports fire straight down and the car hops ~2.5 m (1.1 s in the air), over a car or a
//          barrier: it clears a sedan's roof for 0.7 s of it and an SUV's for 0.65 s (at 20 m/s, 13-14 m: SPACE about 8 m
//          short of the car). 1.5 s to recharge.
//   dash   Z / C: the side ports fire and shove the car a lane (~3 m) left or right in a blink; into a car beside it, a
//          side-swipe (the crash's rules). 0.8 s to recharge. (Q in the car is the drive mode, wagmi/game.js; on foot Q and
//          C are the fight's counter and dodge, which only listen on foot)
// Each puffs white vapour out of the ports it fires (vapor.js), lights the car's own cold-gas plumes (roadster.js
// setThrust), kicks the camera (the crash's jolt) and hisses (WAGMI.audio 'boostIgnite' / 'whoosh').
// API (window.WAGMI.thrusters): unlocked { boost, hop, dash }, unlock(name | 'all', { announce }), on(ev, cb) ('unlock',
// 'hop', 'land', 'dash'), hop(), dash(+1 right | -1 left), ready { hop, dash } (0..1 recharged), air (m above the road)
const HOP = { v: 8.9, g: 16, cool: 1.5 }, DASH = { v: 19, cool: 0.8 };
// (what clears each car: its roof, by the crash's sizes, a little under it (the roof is shorter than the car's box))
const ROOF = (v) => (v.bus ? 3.2 : v.roof || (v.isSUV ? 1.76 : 1.45)) * 0.9; // (v.roof: its kind's, js/traffic.js)
const NONE = [];

export function createThrusters(W, vapor) {
  const app = W.app, cm = app.controllerManager, car = W.car, rs = car.roadster;
  const listeners = {};
  const emit = (ev, d) => { for (const cb of listeners[ev] || []) { try { cb(d); } catch (e) { console.error('[thrusters]', ev, e); } } };
  const play = (name, o) => { try { return W.audio?.play?.(name, o); } catch { return null; } };
  const T = {
    unlocked: { boost: true, hop: false, dash: false },
    on(ev, cb) { (listeners[ev] || (listeners[ev] = [])).push(cb); return () => { listeners[ev] = listeners[ev].filter((x) => x !== cb); }; },
    unlock(name = 'all', { announce = false } = {}) {
      const names = name === 'all' ? ['boost', 'hop', 'dash'] : [].concat(name);
      const fresh = names.filter((n) => n in T.unlocked && !T.unlocked[n]);
      for (const n of names) if (n in T.unlocked) T.unlocked[n] = true;
      for (const n of fresh) emit('unlock', n);
      if (announce && fresh.length) tell();
      return fresh;
    },
    hop: () => hop(),
    dash: (side) => dash(side),
    get ready() { return { hop: 1 - Math.max(0, S.hopCool) / HOP.cool, dash: 1 - Math.max(0, S.dashCool) / DASH.cool }; },
    get air() { return S.h; },
    keys: { hop: 'Space', left: 'KeyZ', right: 'KeyC' },
  };
  const S = { h: 0, vy: 0, air: false, hopCool: 0, dashCool: 0, gas: 0, dashT: 0, dashSide: 0, t: 0 };

  // the help: the mission's own help line if there is one (ui.help draws [KEY] as a key cap), else a toast of ours
  // (a key's name for the player: 'KeyZ' Z, 'Space' SPACE)
  const name = (code) => code.replace(/^Key/, '').toUpperCase();
  function tell() {
    const u = T.unlocked, parts = [];
    if (u.hop) parts.push(`[${name(T.keys.hop)}] hop`);
    if (u.dash) parts.push(`[${name(T.keys.left)}] [${name(T.keys.right)}] puff a lane left · right`);
    const text = `Cold-gas thrusters: ${parts.join(' · ')}.`;
    if (W.ui?.help) { W.ui.help(text, 9); return; }
    toast(text);
  }

  /* -------------------------------------------------------------- the moves -- */
  const live = () => cm.activeMode === 'car' && !W.cutscene && !W.directed && !W.paused && !car.halt && !(W.ride && W.ride.phase);
  const fwd = () => [Math.sin(car.heading), Math.cos(car.heading)];
  // a point in the car's own frame (x across it, + its left; z along it) in the world
  const at = (lx, ly, lz) => { const c = Math.cos(car.heading), s = Math.sin(car.heading); return [car.position.x + lx * c + lz * s, car.position.y + ly, car.position.z - lx * s + lz * c]; };
  const B = () => car.body || { hx: 1.05, z0: -2.3, z1: 2.4 };
  function hop() {
    if (!T.unlocked.hop || S.air || S.hopCool > 0 || !live()) return false;
    S.air = true; S.vy = HOP.v; S.h = 0.001; S.hopCool = HOP.cool; S.gas = 0.4;
    car.pitchVel = (car.pitchVel || 0) - 0.7; car.heaveVel = (car.heaveVel || 0) + 1.2;
    // four jets down from the corners, a cloud spreading over the road from under it
    const b = B(), [fx, fz] = fwd(), vx = fx * car.speed + (car.vx || 0), vz = fz * car.speed + (car.vz || 0);
    for (const [lx, lz] of [[b.hx - 0.25, b.z1 - 0.5], [-(b.hx - 0.25), b.z1 - 0.5], [b.hx - 0.25, b.z0 + 0.45], [-(b.hx - 0.25), b.z0 + 0.45]]) {
      const [x, y, z] = at(lx, 0.25, lz);
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 5;
        vapor.puff(x, y, z, vx * 0.35 + Math.sin(a) * sp, -1 + Math.random() * 1.5, vz * 0.35 + Math.cos(a) * sp, { r: 0.22, grow: 3.2, life: 0.9 + Math.random() * 0.5, a: 0.5, drag: 3.2 });
      }
      vapor.puff(x, y - 0.1, z, vx * 0.5, -2, vz * 0.5, { r: 0.18, grow: 2, life: 0.45, a: 0.75, drag: 6 });
    }
    play('boostIgnite', { pos: [car.position.x, car.position.y + 0.3, car.position.z], vol: 0.6, rate: 1.35 });
    play('whoosh', { pos: [car.position.x, car.position.y + 0.3, car.position.z], vol: 0.8, rate: 0.7 });
    W.crash?.jolt?.(0.45, 0, 0);
    emit('hop', { x: car.position.x, z: car.position.z, speed: car.speed });
    return true;
  }
  function land() {
    const v = -S.vy;
    S.air = false; S.h = 0; S.vy = 0; car.position.y = ground(); car.fallVel = 0;
    car.heaveVel = (car.heaveVel || 0) - Math.min(2.4, v * 0.28); car.pitchVel = (car.pitchVel || 0) + 0.5;
    const b = B();
    for (const lz of [b.z1 - 0.6, b.z0 + 0.5]) for (const lx of [b.hx, -b.hx]) { const [x, , z] = at(lx, 0, lz); vapor.puff(x, 0.2, z, (Math.random() - 0.5) * 3, 0.4, (Math.random() - 0.5) * 3, { r: 0.2, grow: 2.2, life: 0.7, a: 0.3, k: 0.55 }); }
    play('kerb', { pos: [car.position.x, 0.4, car.position.z], vol: Math.min(1, 0.4 + v * 0.06) });
    W.crash?.jolt?.(Math.min(0.6, v * 0.06), 0, 0);
    emit('land', { speed: v });
  }
  // side: +1 right, -1 left
  function dash(side) {
    if (!T.unlocked.dash || S.dashCool > 0 || !live()) return false;
    side = side > 0 ? 1 : -1;
    const c = Math.cos(car.heading), s = Math.sin(car.heading);
    // (the car's right is -x in its own frame: world (-cos h, sin h))
    const rx = -c * side, rz = s * side;
    car.vx = (car.vx || 0) + rx * DASH.v; car.vz = (car.vz || 0) + rz * DASH.v;
    car.rollVel = (car.rollVel || 0) + side * 1.4;
    S.dashCool = DASH.cool; S.gas = 0.3; S.dashT = 0.28; S.dashSide = side;
    // the ports on the other flank fire out sideways, front and back: a jet strung out from each port (puffs laid along
    // it, thinning), billowing as it slows
    const b = B(), [fx, fz] = fwd(), vx = fx * car.speed, vz = fz * car.speed;
    for (const lz of [b.z1 - 0.9, b.z0 + 0.8]) {
      const [x, y, z] = at(side * (b.hx + 0.05), 0.45, lz);
      for (let i = 0; i < 12; i++) {
        const k = i / 11, out = 0.15 + k * 1.6, sp = 4 + Math.random() * 5, up = (Math.random() - 0.3) * 1.6, sw = (Math.random() - 0.5) * 2.5;
        vapor.puff(x - rx * out, y + (Math.random() - 0.5) * 0.2, z - rz * out, vx * 0.85 - rx * sp + fx * sw, up, vz * 0.85 - rz * sp + fz * sw,
          { r: 0.2 + k * 0.22, grow: 2.6, life: 0.55 + Math.random() * 0.45, a: 0.62 * (1 - k * 0.45), drag: 3.5 });
      }
    }
    play('whoosh', { pos: [car.position.x, car.position.y + 0.4, car.position.z], vol: 0.9, rate: 1.2 });
    play('boostIgnite', { pos: [car.position.x, car.position.y + 0.4, car.position.z], vol: 0.35, rate: 1.6 });
    // (the camera left behind for a beat: kicked the other way)
    W.crash?.jolt?.(0.4, -rx, -rz);
    emit('dash', { side, x: car.position.x, z: car.position.z });
    return true;
  }

  addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
    if (cm.activeMode !== 'car') return;
    if (e.code === T.keys.hop && T.unlocked.hop) hop();
    else if (e.code === T.keys.left && T.unlocked.dash) dash(-1);
    else if (e.code === T.keys.right && T.unlocked.dash) dash(1);
  });

  /* ------------------------------------------------------- with the car's step -- */
  // in the car's own update (after the controllers moved it and put it on the ground): the hop's height over the road,
  // the gas on the plumes, the lens punched out while a dash shoves it
  const ground = () => {
    const ax = Math.sin(car.heading) * (car.axle || 1.45), az = Math.cos(car.heading) * (car.axle || 1.45);
    return (cm.getGroundHeight(car.position.x + ax, car.position.z + az, 'car') + cm.getGroundHeight(car.position.x - ax, car.position.z - az, 'car')) * 0.5;
  };
  const prev = car.onUpdate;
  car.onUpdate = (...a) => {
    if (prev) prev(...a);
    const dt = a[0];
    if (S.air) {
      S.vy -= HOP.g * dt; S.h += S.vy * dt;
      if (S.h <= 0) land();
      else { car.position.y = ground() + S.h; car.fallVel = 0; }
    }
    if (S.gas > 0) { S.gas -= dt; rs.setThrust(1, car.boosting ? 0.85 : 0); }
    if (S.dashT > 0) { S.dashT -= dt; car.boosting = true; }
  };
  // airborne, over a car: the crash's step meets only the cars taller than the gap under it
  if (car.crash && typeof car.crash.step === 'function') {
    const step = car.crash.step;
    car.crash.step = (d) => {
      const wk = W.crash?.wrecks;
      if (!S.air || S.h < 1.2 || !wk) return step(d);
      const list = wk.vehicles;
      wk.vehicles = S.h > 3.2 ? NONE : list.filter((v) => ROOF(v) > S.h);
      try { return step(d); } finally { wk.vehicles = list; }
    };
  }
  // every frame (the chase's clock): the recharges; out of the car mid-hop, down at once
  function frame(dt) {
    S.hopCool = Math.max(0, S.hopCool - dt); S.dashCool = Math.max(0, S.dashCool - dt);
    if (S.air && cm.activeMode !== 'car') { S.air = false; S.h = 0; S.vy = 0; car.position.y = ground(); car.mesh.position.y = car.position.y; }
    hud(dt);
  }

  /* ---------------------------------------------------------------- the HUD -- */
  // two key caps by the speed panel while in the car, each filling back up as it recharges (only what is unlocked)
  const css = document.createElement('style');
  css.textContent = `
#wg-thr { position: fixed; right: 28px; bottom: 196px; display: none; gap: 8px; z-index: 30; pointer-events: none; font-family: 'Barlow Condensed', system-ui, sans-serif; color: #fff; }
#wg-thr.on { display: flex; }
body.wg-paused #wg-thr { opacity: 0; }
#wg-thr .t { position: relative; display: flex; align-items: center; gap: 6px; padding: 5px 10px 5px 8px; background: rgba(8,10,14,0.62); border-radius: 10px; font: 700 13px/1 'Barlow Condensed'; letter-spacing: 1.5px; text-transform: uppercase; overflow: hidden; text-shadow: 0 1px 2px rgba(0,0,0,.8); }
#wg-thr .t i { position: absolute; left: 0; bottom: 0; height: 3px; background: #FFC93C; width: 100%; transform-origin: left; }
#wg-thr .t.wait { color: rgba(255,255,255,.5); }
#wg-thr .t.wait i { background: rgba(255,201,60,.55); }
#wg-thr kbd { display: inline-block; min-width: 18px; padding: 0 5px; border: 1px solid rgba(255,255,255,.55); border-radius: 4px; background: rgba(255,255,255,.12); font: 700 12px/16px 'Barlow Condensed'; text-align: center; letter-spacing: 0; }
#wg-toast { position: fixed; left: 20px; top: 92px; max-width: 380px; padding: 12px 16px; background: rgba(8,10,14,0.62); border-radius: 10px; font: 600 17px/1.3 'Barlow Condensed', system-ui; color: #fff; z-index: 31; opacity: 0; transform: translateY(-6px); transition: opacity .3s, transform .3s; pointer-events: none; text-shadow: 0 1px 2px rgba(0,0,0,.8); }
#wg-toast.on { opacity: 1; transform: none; }
#wg-toast kbd { display: inline-block; min-width: 22px; padding: 0 6px; margin: 0 2px; border: 1px solid rgba(255,255,255,.55); border-radius: 5px; background: rgba(255,255,255,.12); font: 700 15px/20px 'Barlow Condensed'; text-align: center; }
@media (max-width: 760px) { #wg-thr { bottom: 170px; right: 16px; } }`;
  document.head.appendChild(css);
  const el = document.createElement('div'); el.id = 'wg-thr';
  el.innerHTML = `<div class="t" data-k="hop"><kbd>${name(T.keys.hop)}</kbd>Hop<i></i></div><div class="t" data-k="dash"><kbd>${name(T.keys.left)}</kbd><kbd>${name(T.keys.right)}</kbd>Dash<i></i></div>`;
  document.body.appendChild(el);
  // ...and in the car's controls bar (js/main.js draws it per mode; game.js adds X and Q): what is unlocked, at its end
  const bar = document.getElementById('hud-controls-hint');
  const addBar = () => {
    if (!bar || cm.activeMode !== 'car') return;
    for (const [k, on, keys, label] of [['hop', T.unlocked.hop, [T.keys.hop], 'Hop'], ['dash', T.unlocked.dash, [T.keys.left, T.keys.right], 'Dash']]) {
      if (!on || bar.querySelector('.wg-thr-' + k)) continue;
      const item = document.createElement('span'); item.className = 'hint wg-thr-' + k;
      for (const c of keys) { const b = document.createElement('kbd'); b.textContent = c.replace(/^Key/, ''); item.appendChild(b); }
      const l = document.createElement('span'); l.className = 'hint-label'; l.textContent = label;
      item.appendChild(l); bar.appendChild(item);
    }
  };
  if (bar) new MutationObserver(addBar).observe(bar, { childList: true });
  T.on('unlock', addBar);
  const chips = { hop: el.querySelector('[data-k=hop]'), dash: el.querySelector('[data-k=dash]') };
  let shown = '';
  function hud() {
    const on = cm.activeMode === 'car' && (T.unlocked.hop || T.unlocked.dash) && !W.cutscene && !document.body.classList.contains('wg-cine');
    el.classList.toggle('on', on); if (!on) return;
    const r = T.ready, key = `${T.unlocked.hop}${T.unlocked.dash}`;
    if (key !== shown) { shown = key; chips.hop.style.display = T.unlocked.hop ? '' : 'none'; chips.dash.style.display = T.unlocked.dash ? '' : 'none'; }
    for (const k of ['hop', 'dash']) { chips[k].classList.toggle('wait', r[k] < 1); chips[k].lastChild.style.transform = `scaleX(${r[k].toFixed(3)})`; }
  }
  let toastEl = null, toastT = 0;
  function toast(text) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.id = 'wg-toast'; document.body.appendChild(toastEl); }
    toastEl.innerHTML = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\[([^\]]+)\]/g, '<kbd>$1</kbd>');
    toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 9000);
  }
  T.frame = frame; T.state = S;
  return T;
}
