// Mog City: Mission 3 · Occupied (docs/MISSIONS.md 4.4, as built; the story pass of 27 Oct: an Occupy camp, OCCUPY
// JPBANK, has held Washington Square for 41 days; JPBank's PR party next to it aims a smear reel of Dan at the tents),
// and the way into it after Mission 2. Installed
// by game.js after m2.js; Mission 2's way on (the G at Gears' garage) is taken over by ours (m3-save.js watchStory).
//   garage  (a scene, midday, the next day) the Static Garage on W 22nd St: Gears under Dan's car ("Cold-gas
//           thrusters..."), Jane's video call: JPBank's community day next to the camp, Fiona, the reel on the screens
//                                                                                              checkpoint 'garage'
//   square  'Go to Washington Square.'  the GPS to the arch at the foot of 5th Ave; Jane calls  checkpoint 'square'
//           first, in the car outside the garage: TRY THE THRUSTERS, Gears' cold-gas fitted (unlocked as the garage ends),
//           a short practice on W 22nd St (its traffic held off while it runs): HOP and SIDE DASH, each ticked off on use,
//           THRUSTERS READY when both are; optional: driving off down the street (90 m) puts it away. Jane calls after
//   rally   (a scene) the stage under the arch, the reel on the big screen, Fiona hyping, the camp chanting back; a Suit
//           planted in the crowd spots him
//   rigs    'Smash the screen rigs.'  RIGS 0/3 (the job's card over the rally's last shot, which shows the three
//           rigs from the lawn; each rig marked: a green column, a chevron, its tag with its health; J in reach of one;
//           SCREEN DOWN as each goes): blows (two), a bat (one lies by each), a thrown can or bottle, or the car; two of the
//           Suits planted in the crowd and by the rigs (a bat: their help), a brute by the stage who comes on at the first rig down, one more
//           at 2/3; health 130 for it, a slow regen out of reach, +25 a rig; Fiona on the megaphone; the crowd runs;
//           100 m from the fight: 'Get back to the fight.', 160 m: 'You left the fight.'   checkpoint 'rigs' (a retry
//           keeps the rigs smashed and starts by the next one standing)
//   dump    (a scene) the reel dies mid-sentence (NO SIGNAL), Fiona drops the megaphone and runs for her SUV on 5th Ave;
//           Ms. Bea's people's mic over the empty stage ("Free Dan!"); Mack's phone: Mr. Big moves the laptop's
//           shredding up to dawn, Rook driving
//   escape  'Lose the Suits.'  HEAT 2: two Suits cars (WAGMI.pursuit), the car in Washington Mews facing away from
//           them; 'Turn corners and break their line of sight'; the thrusters' keys again (unlocked here on a fresh
//           restart that missed the garage); the HEAT meter says SEEN or SEARCHING and fills the escape's bar
//                                                                                              checkpoint 'escape'
//   return  'Go back to the garage.'  Jane calls                                               checkpoint 'return'
//   home    (a scene) Gears at the door: "in one piece." "Mostly."
//   then MISSION PASSED (TIME, SCREENS SMASHED, SUITS DOWN, HITS TAKEN, SUPPORTERS +11,240, NEW: bats · cold-gas
//   thrusters), the save, Rook's DM, and the END OF EPISODE 1 card (episode.js: keep exploring, replay a mission,
//   share the game; MISSION 4 · COMING SOON). No Mission 4 yet: in free roam after it, Rook's R at Sara D. Roosevelt
//   Park is the Mission 4 teaser, labelled so (its sign: MISSION 4 COMING SOON), never "a new mission is available"
// Fails: 'Dan got knocked out.', 'You left the fight.', 'The Suits caught you.' Retry, Quit, Skip (after three).
// Into the G in the dark (Mission 2 ends at dusk), the night in the garage comes first: on the couch, lights out, NEXT
// MORNING, the sun through the door (m3-scenes.js nightScene); the city's light goes night, then sunrise, then midday.
// URL: ?m3=garage|square|rigs|escape|return (and handoff: the G at night; night: straight into the night in the
// garage; rook: the R after it; end: the END OF EPISODE 1 card at the garage, as the mission leaves him).
import * as THREE from 'three/webgpu';
import { place, getCast } from '../intro.js';
import { createGPS } from './gps.js';
import { createMarker } from './marker.js';
import { createUI } from './ui.js';
import { createAudio } from './audio.js';
import { missions, carry } from './pause.js';
import { createM2UI } from './m2-ui.js';
import { runScene } from './m2-scenes.js';
import { buildChevron } from './m2-set.js';
import { buildRally, buildGarage, buildSUV, buildFiona, buildGears, ARCH, ARENA, GARAGE, SUV_AT } from './m3-set.js';
import { garageScene, nightScene, rallyScene, dumpScene, homeScene, SPOT, ESCAPE_CAR } from './m3-scenes.js';
import { watchStory, markDone } from './m3-save.js';
import { episodeEnd, openMissionSelect } from './episode.js';
import { clamp } from './cine.js';

const PI = Math.PI;
const WHITE = '#FFFFFF', BLUE = '#6CB8FF', ACID = '#B6FF3B', PINK = '#FF8AD8', BEA = '#FFB86B', CAMP = '#E8D9B0';
const Q = new URLSearchParams(location.search);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const G_AT = { x: GARAGE.x, z: GARAGE.z };
const R_AT = { x: 933, z: 3561 };                       // Rook's bench, Sara D. Roosevelt Park (Mission 4), clear of its trees
const SQ = { x: 0, z: 2786, name: 'Washington Square · the arch' };
// the end of 5th Ave's last lane before the square, where the drive's route ends (the road graph's lanes round the
// square run over the park: routed to the arch itself, the GPS goes round the block and in along them)
const FIFTH = { x: 0, z: 2738 };
// (the stage and its front kept clear of the city's walkers while the rally stands)
const STAGE_HOLD = { minX: -12.5, maxX: 12.5, minZ: 2801, maxZ: 2815.5 };
// (and the Occupy camp's tents, the city's walkers kept out of them)
const CAMP_HOLD = { minX: -31, maxX: 28, minZ: 2905, maxZ: 2938 };
const SET_HOLDS = [STAGE_HOLD, CAMP_HOLD];
// where the car and Dan start a checkpoint played straight in
const FRESH = {
  // (on the lawn behind the crowd, clear of the park's trees, the camera's too: facing the rigs)
  rigs: { car: [4.6, 2772, 0], dan: [0.5, 2836.5, -0.16] },
  ret: [-848.7, 2867.7, -2.76],                          // (in the West Village, where he'd have lost them: northbound)
};

class Fail extends Error { constructor(reason, ko = false) { super(reason); this.reason = reason; this.ko = ko; } }
class Quit extends Error {}

/* -------------------------------------------------------- our overlays -- */
// Mission 3's own, in the game's style (mission/ui.js): the rigs' job card (big, mid-top, a few seconds, then just the
// objective in the tracker), a tag over each rig (its icon, RIG, how far, a health bar), the prompt in reach of one
// (J · Smash the rig), SCREEN DOWN as one goes down (and the RIGS counter pops), and the NEXT MORNING card over the
// black of the night in the garage (a clock running the night through). Under #wg (its fades cover them) but the
// night's card, which is over its black.
const O_CSS = `
#m3o { position: fixed; inset: 0; pointer-events: none; z-index: 29; font-family: 'Barlow Condensed', system-ui, sans-serif; color: #fff; }
#m3o * { box-sizing: border-box; }
#m3o kbd { display: inline-block; min-width: 1.5em; padding: 2px 6px 1px; margin: 0 2px; border-radius: 5px; border: 1.5px solid rgba(255,255,255,.85); background: rgba(0,0,0,.3); font: 800 .82em/1.2 'Barlow Condensed'; text-align: center; color: #fff; text-shadow: none; }
#m3o g { color: #4ADE80; font-weight: 800; }
#m3o .card { position: absolute; left: 50%; top: 15vh; width: min(660px, calc(100vw - 32px)); transform: translate(-50%, -10px) scale(.96); opacity: 0; transition: opacity .35s, transform .45s cubic-bezier(.2,.7,.2,1);
  padding: 16px 22px 15px; border-radius: 12px; background: rgba(8,10,14,0.72); border-top: 3px solid #4ADE80; text-align: center; text-shadow: 0 1px 3px rgba(0,0,0,.7); backdrop-filter: blur(6px); }
#m3o .card.on { opacity: 1; transform: translate(-50%, 0) scale(1); }
#m3o .card.out { opacity: 0; transform: translate(-50%, -24px) scale(.9); transition: opacity .5s, transform .6s; }
#m3o .card .t { font: italic 800 clamp(26px, 3.6vw, 42px)/1 'Barlow Condensed'; letter-spacing: 1px; }
#m3o .card .t b { color: #4ADE80; }
#m3o .card .l { margin-top: 10px; font: 600 clamp(16px, 1.7vw, 21px)/1.35 'Barlow Condensed'; }
#m3o .card .s { margin-top: 6px; font: 600 clamp(14px, 1.4vw, 17px)/1.3 'Barlow Condensed'; color: rgba(255,255,255,.75); }
#m3o .tag { position: absolute; left: 0; top: 0; will-change: transform; transition: opacity .25s; }
#m3o .tag .in { position: absolute; left: 0; bottom: 0; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 4px; }
#m3o .tag .pill { display: flex; align-items: center; gap: 6px; padding: 4px 10px 3px 7px; border-radius: 999px; background: rgba(8,10,14,0.7); box-shadow: 0 0 0 2px #4ADE80, 0 0 16px rgba(74,222,128,.55); font: italic 800 20px/1 'Barlow Condensed'; letter-spacing: 1.5px; white-space: nowrap; text-shadow: 0 1px 2px rgba(0,0,0,.8); }
#m3o .tag .pill svg { width: 20px; height: 20px; }
#m3o .tag .pill .d { font: 700 14px/1 'Barlow Condensed'; font-style: normal; letter-spacing: .5px; color: rgba(255,255,255,.72); }
#m3o .tag .hp { position: relative; width: 74px; height: 7px; border-radius: 4px; background: rgba(8,10,14,0.7); box-shadow: 0 0 0 1px rgba(255,255,255,.25); overflow: hidden; }
#m3o .tag .hp i { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; transform-origin: 0 50%; }
#m3o .tag .hp .tr { background: rgba(255,255,255,.9); } #m3o .tag .hp .f { background: linear-gradient(180deg, #7CF5A8, #4ADE80 55%, #22A55A); }
#m3o .tag .hp .seg { position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: rgba(8,10,14,.85); }
#m3o .tag .caret { width: 0; height: 0; border-left: 9px solid transparent; border-right: 9px solid transparent; border-top: 11px solid #4ADE80; filter: drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
#m3o .tag.hit .pill { animation: m3hit .3s ease-out; }
@keyframes m3hit { 0% { transform: scale(1.25); box-shadow: 0 0 0 3px #fff, 0 0 26px rgba(255,255,255,.8); } 100% { transform: scale(1); } }
#m3o .tag.down .pill { box-shadow: 0 0 0 2px #EF4444; color: rgba(255,255,255,.8); }
#m3o .tag.down .caret { border-top-color: #EF4444; } #m3o .tag.down .hp { opacity: 0; }
#m3o .prompt { position: absolute; left: 50%; top: 64%; transform: translate(-50%, 6px); opacity: 0; transition: opacity .15s, transform .15s; padding: 9px 16px 8px 11px; border-radius: 10px; background: rgba(8,10,14,0.68);
  font: 700 21px/1 'Barlow Condensed'; letter-spacing: .5px; white-space: nowrap; box-shadow: 0 0 0 1.5px rgba(74,222,128,.7); }
#m3o .prompt.on { opacity: 1; transform: translate(-50%, 0); }
#m3o .prompt small { margin-left: 8px; font: 600 15px/1 'Barlow Condensed'; color: rgba(255,255,255,.7); }
#m3o .pop { position: absolute; left: 50%; top: 27vh; transform: translateX(-50%) scale(.85); opacity: 0; text-align: center; transition: opacity .2s, transform .25s cubic-bezier(.2,.7,.2,1); text-shadow: 0 3px 16px rgba(0,0,0,.6), 0 1px 2px rgba(0,0,0,.8); }
#m3o .pop.on { opacity: 1; transform: translateX(-50%) scale(1); }
#m3o .pop .a { font: italic 800 clamp(34px, 5vw, 58px)/1 'Barlow Condensed'; letter-spacing: 2px; color: #4ADE80; }
#m3o .pop .b { margin-top: 2px; font: 800 clamp(18px, 2vw, 24px)/1 'Barlow Condensed'; letter-spacing: 4px; }
#wg .wg-count.m3pop .v { animation: m3pop .7s cubic-bezier(.2,.7,.2,1); }
@keyframes m3pop { 0% { transform: scale(2.1); color: #4ADE80; } 60% { color: #4ADE80; } 100% { transform: scale(1); color: #fff; } }
#wg .wg-count .v { transform-origin: 100% 60%; }
#m3o .coach { position: absolute; left: 50%; top: 17vh; width: min(440px, calc(100vw - 32px)); transform: translate(-50%, -8px); opacity: 0; transition: opacity .3s, transform .35s cubic-bezier(.2,.7,.2,1);
  padding: 11px 16px 10px; border-radius: 12px; background: rgba(8,10,14,0.7); border-top: 3px solid #FFC93C; text-align: center; text-shadow: 0 1px 3px rgba(0,0,0,.7); backdrop-filter: blur(6px); }
#m3o .coach.on { opacity: 1; transform: translate(-50%, 0); }
#m3o .coach .h { font: italic 800 clamp(22px, 2.6vw, 30px)/1 'Barlow Condensed'; letter-spacing: 1px; }
#m3o .coach .h b { color: #FFC93C; }
#m3o .coach .ss { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px 14px; margin-top: 9px; }
#m3o .coach .s { display: inline-flex; align-items: center; gap: 4px; padding: 5px 10px 4px 7px; border-radius: 8px; background: rgba(255,255,255,.08); box-shadow: 0 0 0 1.5px rgba(255,201,60,.55); font: 700 clamp(16px, 1.6vw, 19px)/1 'Barlow Condensed'; letter-spacing: .5px; text-transform: uppercase; white-space: nowrap; transition: background .2s, box-shadow .2s, color .2s; }
#m3o .coach .s .ok { display: none; color: #4ADE80; font-weight: 800; margin-left: 2px; }
#m3o .coach .s.done { box-shadow: 0 0 0 1.5px #4ADE80; background: rgba(74,222,128,.14); color: rgba(255,255,255,.75); }
#m3o .coach .s.done .ok { display: inline; }
#m3o .coach .s.tick { animation: m3cpop .45s cubic-bezier(.2,.7,.2,1); }
@keyframes m3cpop { 0% { transform: scale(1.22); } 100% { transform: scale(1); } }
#m3o .coach .x { margin-top: 8px; font: 600 clamp(13px, 1.3vw, 15px)/1.25 'Barlow Condensed'; color: rgba(255,255,255,.7); }
#m3o .coach.ready .h b { color: #4ADE80; }
body.wg-cine #m3o .coach { opacity: 0 !important; }
/* (the thrusters' own key chips say what the practice says: away while it is up) */
body:has(#m3o .coach.on) #wg-thr { visibility: hidden; }
/* (a phone on its side: under the objective, clear of the thrusters' chips and the car's pills; the line under it put away) */
@media (max-height: 500px) { #m3o .coach { top: 76px; width: min(300px, calc(100vw - 32px)); padding: 7px 10px 7px; } #m3o .coach .h { font-size: 19px; } #m3o .coach .ss { margin-top: 6px; gap: 6px 8px; } #m3o .coach .s { font-size: 14px; padding: 4px 7px 3px 5px; } #m3o .coach .x { display: none; } }
#m3n { position: fixed; inset: 0; pointer-events: none; z-index: 31; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; opacity: 0; transition: opacity .45s;
  font-family: 'Barlow Condensed', system-ui, sans-serif; color: #fff; }
#m3n.on { opacity: 1; }
#m3n .t { font: italic 800 clamp(40px, 6vw, 72px)/1 'Barlow Condensed'; letter-spacing: 2px; color: #FFC93C; }
#m3n svg { width: clamp(96px, 12vw, 140px); height: auto; }
#m3n .c { font: 800 clamp(24px, 3vw, 34px)/1 'Barlow Condensed'; letter-spacing: 3px; }
#m3n .s { font: 700 14px/1 'Barlow Condensed'; letter-spacing: 4px; color: rgba(255,255,255,.6); text-transform: uppercase; }
`;
const RIG_ICON = '<svg viewBox="0 0 24 24"><rect x="2.5" y="3.5" width="19" height="11" rx="1.5" fill="none" stroke="#4ADE80" stroke-width="2.2"/><rect x="5.5" y="6.5" width="13" height="5" fill="#fff"/><path d="M6 15 V22 M18 15 V22 M3.5 22 H8.5 M15.5 22 H20.5" stroke="#4ADE80" stroke-width="1.8" fill="none" stroke-linecap="round"/><circle cx="19.6" cy="2.4" r="1.6" fill="#EF4444"/></svg>';
function overlay(W) {
  if (W._m3o) return W._m3o;
  if (!document.getElementById('m3o-css')) { const st = document.createElement('style'); st.id = 'm3o-css'; st.textContent = O_CSS; document.head.appendChild(st); }
  const root = document.createElement('div'); root.id = 'm3o'; document.body.appendChild(root);
  const night = document.createElement('div'); night.id = 'm3n'; document.body.appendChild(night);
  const card = document.createElement('div'); card.className = 'card'; root.appendChild(card);
  const prompt = document.createElement('div'); prompt.className = 'prompt'; root.appendChild(prompt);
  const pop = document.createElement('div'); pop.className = 'pop'; pop.innerHTML = '<div class="a"></div><div class="b"></div>'; root.appendChild(pop);
  const coach = document.createElement('div'); coach.className = 'coach'; root.appendChild(coach);
  const tags = [];
  const timers = {};
  const later = (k, ms, f) => { clearTimeout(timers[k]); timers[k] = setTimeout(f, ms); };
  const _v = new THREE.Vector3();
  const O = {
    // the rigs' job: up for secs, then away (shrinking up)
    card(on, secs = 4) {
      clearTimeout(timers.card); clearTimeout(timers.card2);
      if (!on) { if (card.classList.contains('on')) { card.classList.add('out'); later('card2', 600, () => card.classList.remove('on', 'out')); } return; }
      card.innerHTML = `<div class="t">SMASH THE <b>3</b> SCREEN RIGS</div>
        <div class="l">Grab a <g>bat</g> or a <g>bottle</g> <kbd>E</kbd> · walk up to a <g>rig</g> · strike it <kbd>J</kbd> / click</div>
        <div class="s">Fists work too: two hits a rig. The Suits will try to stop you.</div>`;
      card.classList.remove('out'); void card.offsetWidth; card.classList.add('on');
      later('card', secs * 1000, () => O.card(false));
    },
    prompt(html) {
      if (!html) { prompt.classList.remove('on'); return; }
      if (prompt.dataset.h !== html) { prompt.innerHTML = html; prompt.dataset.h = html; }
      prompt.classList.add('on');
    },
    pop(a, b, secs = 1.6) {
      // (a rig down: the job's card has done its work, away at once, so the two never sit on each other)
      clearTimeout(timers.card); clearTimeout(timers.card2); card.classList.remove('on', 'out');
      pop.querySelector('.a').textContent = a; pop.querySelector('.b').textContent = b;
      pop.classList.remove('on'); void pop.offsetWidth; pop.classList.add('on'); later('pop', secs * 1000, () => pop.classList.remove('on'));
      const c = document.querySelector('#wg .wg-count'); if (c) { c.classList.remove('m3pop'); void c.offsetWidth; c.classList.add('m3pop'); }
    },
    // the tags over the rigs (rigs: the set's; null: none), placed each frame by place(cam)
    tags(rigs) {
      while (tags.length) tags.pop().el.remove();
      for (const r of rigs || []) {
        const el = document.createElement('div'); el.className = 'tag';
        el.innerHTML = `<div class="in"><div class="pill">${RIG_ICON}RIG<span class="d"></span></div><div class="hp"><i class="tr"></i><i class="f"></i><span class="seg"></span></div><div class="caret"></div></div>`;
        root.appendChild(el);
        tags.push({ r, el, d: el.querySelector('.d'), f: el.querySelector('.f'), tr: el.querySelector('.tr'), trail: 1, downT: 0, hitT: 0, last: '' });
      }
    },
    hitTag(r) { const t = tags.find((x) => x.r === r); if (!t) return; t.el.classList.remove('hit'); void t.el.offsetWidth; t.el.classList.add('hit'); },
    place(cam, me, dt) {
      const w = innerWidth, h = innerHeight;
      // (while SCREEN DOWN is up, no tag under it)
      const pr = pop.classList.contains('on') ? pop.getBoundingClientRect() : null;
      for (const t of tags) {
        const r = t.r;
        if (r.down) { t.downT += dt; if (!t.el.classList.contains('down')) { t.el.classList.add('down'); t.el.querySelector('.pill').lastChild.textContent = ''; t.el.querySelector('.pill').childNodes[1].textContent = 'DOWN'; } }
        // (over its chevron from afar; close by, just over the panel, so it stays in view)
        const dm = me ? Math.hypot(me.x - r.x, me.z - r.z) : 20;
        _v.set(r.x, (r.y || 0) + 2.7 + 1.5 * clamp((dm - 4) / 8), r.z).project(cam);
        const off = _v.z > 1 || _v.z < -1 || Math.abs(_v.x) > 1.15 || Math.abs(_v.y) > 1.2 || t.downT > 1.6;
        const sx = (_v.x + 1) / 2 * w, sy = (1 - _v.y) / 2 * h;
        // (the tag's pill and bar stand over its point: ~70 px either side, ~60 px up)
        const under = pr && sx + 70 > pr.left - 12 && sx - 70 < pr.right + 12 && sy > pr.top - 12 && sy - 60 < pr.bottom + 12;
        t.el.style.opacity = off || under ? '0' : '1';
        if (off) continue;
        t.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
        const k = clamp(r.hp / (r.hp0 || 2)); t.trail = Math.max(k, t.trail - dt * 1.4);
        t.f.style.transform = `scaleX(${k})`; t.tr.style.transform = `scaleX(${t.trail})`;
        const m = me ? `${Math.round(Math.hypot(me.x - r.x, me.z - r.z))} m` : '';
        if (m !== t.last) { t.d.textContent = m; t.last = m; }
      }
    },
    // the night's card over the black: NEXT MORNING, a clock running from 11:52 PM to 7:30 AM over secs
    night(on, secs = 1.9) {
      if (!on) { night.classList.remove('on'); cancelAnimationFrame(timers.nightRaf); return; }
      night.innerHTML = `<div class="t">NEXT MORNING</div><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="rgba(8,10,14,.6)" stroke="#fff" stroke-width="4"/>${Array.from({ length: 12 }, (_, i) => { const a = i / 12 * PI * 2; return `<rect x="${(50 + Math.sin(a) * 36 - 2).toFixed(1)}" y="${(50 - Math.cos(a) * 36 - 2).toFixed(1)}" width="4" height="4" fill="#fff"/>`; }).join('')}<line class="hh" x1="50" y1="50" x2="50" y2="28" stroke="#FFC93C" stroke-width="5" stroke-linecap="round"/><line class="mh" x1="50" y1="50" x2="50" y2="16" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="50" cy="50" r="3.5" fill="#FFC93C"/></svg><div class="c">11:52 PM</div><div class="s">West Chelsea</div>`;
      night.classList.add('on');
      const hh = night.querySelector('.hh'), mh = night.querySelector('.mh'), c = night.querySelector('.c'), t0 = performance.now();
      const from = 23 * 60 + 52, to = 24 * 60 + 7 * 60 + 30;
      const f = () => {
        const k = clamp((performance.now() - t0) / 1000 / secs), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, m = from + (to - from) * e;
        hh.setAttribute('transform', `rotate(${((m / 60) % 12) * 30} 50 50)`); mh.setAttribute('transform', `rotate(${(m % 60) * 6} 50 50)`);
        const H = Math.floor(m / 60) % 24, M = Math.floor(m % 60);
        c.textContent = `${((H + 11) % 12) + 1}:${String(M).padStart(2, '0')} ${H < 12 ? 'AM' : 'PM'}`;
        if (k < 1) timers.nightRaf = requestAnimationFrame(f);
      };
      f();
    },
    // the thrusters' practice: its steps ([id, html]) and which are done (a Set); null puts it away; ready: all done
    coach(steps, done = null, { ready = false } = {}) {
      if (!steps) { coach.classList.remove('on'); coach.dataset.k = ''; return; }
      if (coach.dataset.k !== steps.map((x) => x[0]).join()) {
        coach.dataset.k = steps.map((x) => x[0]).join();
        coach.innerHTML = `<div class="h">TRY THE <b>THRUSTERS</b></div><div class="ss">${steps.map(([id, html]) => `<span class="s" data-id="${id}">${html}<span class="ok">✓</span></span>`).join('')}</div><div class="x">Gears' cold-gas, fitted. Try it here, or just drive off.</div>`;
      }
      for (const el of coach.querySelectorAll('.s')) {
        const d = !!done?.has(el.dataset.id);
        if (d && !el.classList.contains('done')) { el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); }
        el.classList.toggle('done', d);
      }
      coach.classList.toggle('ready', ready);
      if (ready) { coach.querySelector('.h').innerHTML = 'THRUSTERS <b>READY</b>'; coach.querySelector('.x').textContent = "You're good to go."; }
      coach.classList.add('on');
    },
    clear() { O.card(false); O.prompt(null); O.tags(null); pop.classList.remove('on'); O.night(false); O.coach(null); },
  };
  return (W._m3o = O);
}

/* -------------------------------------------------------- the install -- */
export async function install(W) {
  watchStory(W);
  const at = Q.get('m3'); if (!at) return;
  await boot(W);
  if (at === 'handoff') {
    // (as Mission 2 leaves him: twilight, on W 22nd St by the garage)
    W.app.selectTime?.('twilight');
    place(W, { car: [-1530, 1603.6, PI / 2], dan: [-1536, 1607.4, -PI / 2] });
    toGarage(W, { quick: true });
    return;
  }
  if (at === 'rook') { place(W, { car: SPOT.out.car, dan: SPOT.out.dan }); toRook(W, { quick: true }); return; }
  // (end: as the mission leaves him, in the evening at the garage door, and the card)
  if (at === 'end') {
    W.app.selectTime?.('golden');
    place(W, { car: SPOT.out.car, dan: [SPOT.door.dan[0], SPOT.door.dan[1], 0] });
    endEpisode(W, { secs: 0.4 }).catch((e) => console.error('[m3] end', e));
    return;
  }
  // (night: as if into the G at night: the night in the garage, then the mission)
  if (at === 'night') { W.app.selectTime?.('twilight'); place(W, { car: [-1530, 1603.6, PI / 2], dan: [-1556, 1607.4, -PI / 2] }); }
  start(W, { at }).catch((e) => console.error('[m3]', e));
}
async function boot(W) {
  if (!W.ui) {
    W.ui = createUI(); W.sfx = createAudio();
    const unlock = () => { W.sfx.unlock(); removeEventListener('keydown', unlock, true); removeEventListener('pointerdown', unlock, true); };
    addEventListener('keydown', unlock, true); addEventListener('pointerdown', unlock, true);
  }
  W.ui.story(true); document.body.classList.add('wg-onfoot');
  W.app.mapSystem.onTeleport = null; W.app.mapSystem.waypoint = null;
  for (let i = 0; i < 600 && !W.app.ready; i++) await sleep(100);
}

export async function start(W, { at = 'garage', keep = false } = {}) {
  if (W.mission) W.mission.stop();
  W.between?.stop();
  const M = (W.mission = createMission(W, { keep }));
  return M.run(['square', 'rigs', 'escape', 'return'].includes(at) ? at : 'garage');
}

/* ----------------------------------------------------- between missions -- */
// the way to a mission (GTA's): its contact's letter on the radar, the route, the corona where it starts; no reminders
// on a timer: after a genuine stall the GPS offers real help once (gps.js), with one gentle line (note); a sign over
// the corona if it has one (sign: [big, small])
// (carR: how near a stopped car counts as in it: the curb lane by a door on the building line is ~7.5 m off)
function between(W, { letter, at, name, objective, note = null, onArrive, radius = 2.2, carR = radius + 4.5, sign = null }) {
  const app = W.app, cm = app.controllerManager, P = W.person, car = W.car, ui = W.ui;
  const gps = W.gps || (W.gps = createGPS(W));
  ui?.step?.('free:' + letter);
  const m = createMarker(THREE, app.scene, { color: '#FFC93C', radius, height: 2.2, alpha: 0.3 });
  const gy = cm.getGroundHeight(at.x, at.z, 'person');
  m.at(at.x, gy, at.z);
  let label = null;
  if (sign) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
    x.fillStyle = 'rgba(8,10,14,0.72)'; x.beginPath(); x.roundRect(4, 4, 504, 120, 18); x.fill();
    x.textAlign = 'center'; x.fillStyle = '#FFC93C'; x.font = 'italic 800 54px "Barlow Condensed", sans-serif'; x.fillText(sign[0], 256, 62);
    x.fillStyle = '#FFFFFF'; x.font = '700 30px "Barlow Condensed", sans-serif'; x.fillText(sign[1] || '', 256, 104);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    label = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    label.position.set(at.x, gy + 3.1, at.z); label.renderOrder = 7; app.scene.add(label);
  }
  const dest = { x: at.x, z: at.z, name };
  const setObjective = () => {
    if (gps.objective) gps.objective(objective, dest, { blip: false }); else { ui?.objective(objective); gps.set(dest); }
    gps.unblip('dest');
    gps.blip('next', { x: at.x, z: at.z, kind: 'letter', letter, pulse: 6, edge: true, name });
    gps.stallNote = note;
  };
  setObjective();
  let live = true, arrived = false;
  const B = {
    m3: true, marker: m, objective: setObjective, at,
    stop() { live = false; m.hide(); app.scene.remove(m.group); if (label) app.scene.remove(label); gps.unblip('next'); gps.unblip('car'); if (gps.stallNote === note) gps.stallNote = null; if (gps.dest && gps.dest.x === at.x && gps.dest.z === at.z) gps.clear(); if (W.between === B) W.between = null; },
  };
  (function loop() {
    if (!live) return;
    requestAnimationFrame(loop);
    if (W.paused || W.cutscene || W.mission?.running) return;
    gps.update();
    const inCar = cm.activeMode === 'car', p = inCar ? car.position : P.position;
    document.body.classList.toggle('wg-onfoot', !inCar);
    if (label) label.quaternion.copy(app.cameraSystem.camera.quaternion);
    if (!inCar && Math.hypot(car.position.x - P.position.x, car.position.z - P.position.z) > 25) gps.blip('car', { x: car.position.x, z: car.position.z, kind: 'car', edge: true, name: car.label || "Dan's car" });
    else gps.unblip('car');
    const d = Math.hypot(p.x - at.x, p.z - at.z);
    if (!arrived && (inCar ? d < carR && Math.abs(car.speed) < 3 : d < radius && Math.abs(p.y - gy) < 1.2)) { arrived = true; onArrive?.(B); }
    if (d > Math.max(radius + 6, carR + 1.5)) arrived = false;
  })();
  W.between?.stop(); W.between = B;
  return B;
}

// after Mission 2: the G at Gears' garage; into its corona, Mission 3
// The drive's call (mission/calls.js 'm3-handoff', set up there for the step 'free:G'): rings when he's rolling in his
// car, wraps 200 m from the G; the garage scene hangs it up
export function toGarage(W, { quick = false } = {}) {
  between(W, {
    letter: 'G', at: G_AT, name: "Gears' garage · W 22nd St", objective: ['Go to ', { "Gears' garage": 'yellow' }, '.'], carR: 9,
    note: ['Jane', "gears' garage is in west chelsea, the G on your radar. he's expecting you."],
    onArrive: (b) => { b.stop(); start(W, { at: 'garage' }).catch((e) => console.error('[m3]', e)); },
  });
  if (!quick) W.ui?.help(['A new mission is available. Go to the ', { G: 'yellow' }, ' on the Radar.'], 9);
}
// after Mission 3 (Episode 1 over): Rook's R at Sara D. Roosevelt Park, where Mission 4 will start. A teaser, labelled
// as one everywhere it shows (the objective, the blip's name, the sign over the corona): no stall nudges toward it, and
// never "a new mission is available" (there isn't one yet). quick: no help line with it (the save's Continue)
// The drive's call (mission/calls.js 'm4-teaser', once a session): rings when he's rolling in his car on the R's step
// ('free:R'), wraps 120 m from the bench
export function toRook(W, { quick = false } = {}) {
  // (Jane on the car phone on the way, once a session: mission/calls.js 'm4-teaser', its wrap 120 m from the bench)
  W.calls?.auto('free:R', 'm4-teaser', { wrapR: 120 });
  between(W, {
    letter: 'R', at: R_AT, name: 'Mission 4 (coming soon) · Sara D. Roosevelt Park',
    objective: [{ 'Mission 4': 'yellow' }, ' is coming soon. It starts at ', { "Rook's": 'blue' }, ' bench.'],
    sign: ['MISSION 4', 'COMING SOON'],
    onArrive: () => { W.ui?.place('Sara D. Roosevelt Park', 'Lower East Side · New York', 3); W.ui?.help(['Mission 4 is coming soon. ', { Rook: 'blue' }, ' will meet you here.'], 9); },
  });
  if (!quick) W.ui?.help(['Free roam. ', { 'Mission 4': 'yellow' }, ' is coming soon: its ', { R: 'yellow' }, ' on the Radar is a teaser.'], 8);
}
// the END OF EPISODE 1 card (episode.js) after secs, then: free roam with the teaser's P, or the pause menu's Mission
// select (the P set too, for a Resume without a replay)
export async function endEpisode(W, { secs = 0 } = {}) {
  if (secs) await sleep(secs * 1000);
  W.ui?.dm?.(null); W.ui?.help?.(null);
  const choice = await episodeEnd(W);
  if (W.mission?.running) return choice;
  if (choice === 'replay') { toRook(W, { quick: true }); openMissionSelect(W); }
  else toRook(W);
  return choice;
}

/* ---------------------------------------------------------- the mission -- */
function createMission(W, { keep = false } = {}) {
  const app = W.app, cm = app.controllerManager, P = W.person, car = W.car, ui = W.ui, sfx = W.sfx;
  const gps = W.gps || (W.gps = createGPS(W));
  const U = W.m2ui || (W.m2ui = createM2UI(ui));
  app.mapSystem.onTeleport = null;
  ui.story(true);
  const O = overlay(W);

  /* ------------------------------------------------------------ helpers -- */
  let tok = { dead: false, err: null };
  const fail = (reason, ko) => { if (!tok.dead) { tok.dead = true; tok.err = new Fail(reason, ko); } };
  const now = () => (W.clock ? W.clock.now() : performance.now());
  const wait = (cond, t = tok) => new Promise((res, rej) => {
    const f = () => { if (t.dead) return rej(t.err || new Quit()); if (W.paused) return requestAnimationFrame(f); let ok = false; try { ok = cond(); } catch (e) { return rej(e); } if (ok) res(); else requestAnimationFrame(f); };
    f();
  });
  const delay = (secs, t = tok) => { const end = now() + secs * 1000; return wait(() => now() >= end, t); };
  const gsleep = (ms) => new Promise((r) => { const end = now() + ms; const f = () => (now() >= end ? r() : setTimeout(f, Math.max(16, end - now()))); setTimeout(f, Math.max(0, ms)); });
  const dist = (a, x, z) => Math.hypot(a.x - x, a.z - z);
  const inCar = () => cm.activeMode === 'car';
  const me = () => (inCar() ? car.position : P.position);
  // the lines: subtitles (their recorded voices play from them), held for their reading time or their voice, a mumble
  // where there is no voice; onLine(who, i) as each starts
  const VOICE = { Dan: 120, Jane: 205, Gears: 92, Fiona: 236, Brick: 112, Bea: 190, Camp: 150 };
  // (talking: how many say()s are playing, so a bark waits for the lines already up)
  let talking = 0;
  async function say(lines, t = tok, onLine = null) {
    talking++;
    try { await sayLines(lines, t, onLine); } finally { talking--; }
  }
  async function sayLines(lines, t, onLine) {
    for (let i = 0; i < lines.length; i++) {
      const [who, color, text, pause = 0.25] = lines[i];
      if (t.dead) break;
      const secs = Math.max(1.4, text.length / 15, (W.voice?.dur?.(who, text) || 0) + 0.15);
      ui.sub(who, text, color); onLine?.(who, i);
      if (VOICE[who] && !W.voice?.has?.(who, text)) {
        const parts = text.match(/[^.?!]+[.?!']*/g) || [text]; let a = 0;
        for (const ph of parts) { const n = ph.trim().length; if (n) setTimeout(() => sfx?.play('mumble', { f0: VOICE[who] * (0.96 + Math.random() * 0.08), dur: Math.min(0.5, Math.max(0.2, 0.1 + n * 0.02)), gain: 0.24, q: /\?/.test(ph) }), a * 1000 + 30); a += ph.length / text.length * secs; }
      }
      const talk = setInterval(() => { if (who === 'Jane' && U.call.on) U.call.talk(0.5 + Math.random() * 0.5); }, 90);
      await gsleep(secs * 1000); clearInterval(talk);
      ui.sub(null); await gsleep(pause * 1000);
    }
  }
  const objective = (parts, target = null) => {
    if (gps.objective) gps.objective(parts, target, { blip: !!target && !target.follow });
    else { ui.objective(parts); if (target && !target.follow) gps.set(target); else gps.clear(); }
  };
  const holds = (rects) => app.trafficSystem.hold?.(rects);
  const midday = () => { if (app.lightingSystem?.activePresetId !== 'midday') app.selectTime?.('midday'); };
  // (kept through a checkpoint restart: the card counts the whole mission)
  const stats = carry(W, 'm3', keep, () => ({ t0: now(), hits: 0, ko: 0, smashed: 0 }));
  let lastHp = null;
  const fails = {};
  const hooks = new Set();
  let running = true;
  (function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    if (W.paused) return;
    gps.update();
    document.body.classList.toggle('wg-onfoot', !inCar());
    for (const f of hooks) { try { f(); } catch (e) { console.warn('[m3]', e); } }
    const hp = W.combat?.player?.hp; if (hp != null) { if (lastHp != null && hp < lastHp - 0.5) stats.hits++; lastHp = hp; }
  })();
  const hook = (f) => { hooks.add(f); return () => hooks.delete(f); };
  let lastT = now();
  const frameDt = () => { const t = now(), d = Math.min(0.05, (t - lastT) / 1000); lastT = t; return d; };

  /* -------------------------------------------------- the sets, the cast -- */
  // (built once a session, kept on W: a restart reuses them)
  const S = W._m3 || (W._m3 = { R: null, Gar: null, suv: null, fiona: null, gears: null, chev: null, C: null, setsP: null });
  Object.assign(S, { crew: null, brute: null, extra: null, chase: null, fionaUp: false, awake: false, bruteUp: false });
  function sets() {
    return S.setsP || (S.setsP = (async () => {
      if (!S.C) S.C = await getCast(W);
      if (!S.Gar) S.Gar = buildGarage(W);
      if (!S.R) S.R = buildRally(W);
      if (!S.suv) S.suv = buildSUV(W);
      if (!S.chev) S.chev = [0, 1, 2].map(() => buildChevron(W, '#4ADE80'));
      if (!S.gears) S.gears = await buildGears(W);
      if (!S.fiona) S.fiona = await buildFiona(W);
      return S;
    })());
  }
  // the rally standing: the set, Fiona on the stage hyping, the crew by the rigs (not yet awake), the crowd
  let fionaHook = null;
  async function spawnRally({ crew = true } = {}) {
    await sets();
    if (!S.R.shown) { S.R.reset(); S.R.show(true); }
    holds(SET_HOLDS);
    S.suv.group.visible = true; S.suv.group.position.set(SUV_AT[0], 0, SUV_AT[1]); S.suv.group.rotation.set(0, SUV_AT[2], 0);
    // Fiona, every frame she's up (rig-posed, the megaphone at her mouth, the other fist pumping)
    S.fiona.rig.set([[0, 'thugIdle']]); S.fionaUp = true;
    fionaHook?.(); fionaHook = hook(() => {
      if (!S.fionaUp || W.cutscene) return;
      const t = now() / 1000, F = S.fiona;
      F.root.visible = true; F.root.rotation.set(0, 0, 0); F.root.position.set(0, 1.36, 2809.6);
      F.rig.pose(t % 30); F.hype(0, 1, 0.8, t);
    });
    if (crew && !S.crew && W.combat?.spawnCrew) {
      // the Suits planted in the crowd (Jane: "They'll start something and pin it on you."): Brick (a bat) at the back of
      // the party's crowd, where he spots Dan; one more by a rig; and a brute by the stage, a crew of his own: he holds
      // back till the first rig goes down; facing the stage until it starts. Bats, cans and bottles lying about
      const C = S.crew = W.combat.spawnCrew({ x: -8, z: 2872, count: 2, brute: 0, weapons: ['bat'], aggro: false, props: { cans: 3, bottles: 2, bats: 2 } });
      const B = S.brute = W.combat.spawnCrew({ x: -9.5, z: 2822, count: 0, brute: 1, aggro: false, props: false });
      // (Brick's spot: the spotter shot's camera, 1.6 m left and 2.6 m behind him, two metres clear of the park's trunks)
      const spots = [[-5.0, 2829.0], [16.5, 2888], [-9.5, 2822]];
      [...C.enemies, ...B.enemies].forEach((e, i) => {
        const [x, z] = spots[i % spots.length];
        e.pos.set(x, cm.getGroundHeight(x, z, 'person'), z);
        const face = Math.atan2(0 - x, 2809.6 - z), up = e.update.bind(e), crew = e.crew;
        e.update = (dt) => { up(dt); if (!(crew === B ? S.bruteUp : S.awake) && e.alive && e.state === 'idle') { e.yaw = face; e.root.rotation.y = face; } };
        e._m3restore = () => { e.update = up; };
      });
    }
  }
  function wake() { S.awake = true; for (const e of S.crew?.enemies || []) e._m3restore?.(); S.crew?.engage(); }
  function wakeBrute() { if (S.bruteUp) return; S.bruteUp = true; for (const e of S.brute?.enemies || []) e._m3restore?.(); S.brute?.engage(); }
  // a bat lying by each rig standing, on the side he comes from (the stage's): grab one [E] and one swing does it
  function batsByRigs() {
    const items = W.combat?.items; if (!items?.place) return;
    for (const r of S.R.rigs) {
      if (r.down) continue;
      const a = Math.atan2(0 - r.x, 2809.6 - r.z) + 0.55, x = r.x + Math.sin(a) * 1.5, z = r.z + Math.cos(a) * 1.5;
      try { items.place('bat', x, z); } catch (e) { console.warn('[m3] bat', e); }
    }
  }
  // the rigs marked, for the fight and the shot before it: a green column of light at each one standing, its chevron
  // over it (bigger than a man's), and its tag (icon, RIG, how far, its health) over that; their own frame loop
  let marks = null;
  function markRigs(on) {
    if (!on) {
      if (!marks) return;
      marks.live = false; for (const m of marks.cols) { m.hide(); app.scene.remove(m.group); }
      for (const c of S.chev || []) { c.hide(); c.group.scale.setScalar(1); }
      O.tags(null); O.prompt(null); marks = null; return;
    }
    if (marks || !S.R) return;
    const M = marks = { live: true, cols: S.R.rigs.map((r) => { const m = createMarker(THREE, app.scene, { color: '#4ADE80', radius: 0.8, height: 3.0, alpha: 0.24 }); m.at(r.x, r.y ?? cm.getGroundHeight(r.x, r.z, 'person'), r.z); return m; }) };
    O.tags(S.R.rigs);
    let last = performance.now();
    (function loop() {
      if (!M.live) return;
      requestAnimationFrame(loop);
      const t = performance.now(), dt = Math.min(0.05, (t - last) / 1000); last = t;
      if (W.paused) return;
      for (const r of S.R.rigs) {
        const col = M.cols[r.i], ch = S.chev[r.i];
        // (close by, the tag is enough: the column and the chevron would fill the view)
        const me = inCar() ? car.position : P.position, near = Math.hypot(me.x - r.x, me.z - r.z) < 7;
        if (r.down || near) { col.hide(); ch.hide(); continue; }
        col.group.visible = true; ch.group.scale.setScalar(1.25); ch.at(r.x, (r.y || 0) + 3.0, r.z, dt);
      }
      O.place(app.cameraSystem.camera, inCar() ? car.position : P.position, dt);
    })();
  }

  function tidy() {
    W.calls?.stop({ quiet: true, of: 'm3:' }); // (Jane's car call in this mission, if one is on: mission/calls.js)
    hooks.clear(); fionaHook = null; ui.objective(null); ui.sub(null); ui.help(null); ui.counter(null); ui.caller(null); ui.hold(null); ui.phone.hide(); U.call?.hide();
    gps.clear(); for (const id of [...gps.blips.keys()]) gps.unblip(id);
    markRigs(false); O.clear();
    for (const c of S.chev || []) c.hide();
    S.chase?.stop?.(); S.chase = null;
  }
  function teardown() {
    tidy(); holds([]);
    S.R?.show(false); S.Gar?.show(false); S.Gar?.inside(false);
    if (S.suv) S.suv.group.visible = false;
    if (S.fiona) { S.fiona.root.visible = false; S.fiona.mega.visible = false; } S.fionaUp = false;
    if (S.gears) S.gears.root.visible = false;
    S.crew = null; S.brute = null; S.extra = null; S.awake = false; S.bruteUp = false;
  }
  function inTheCar(x, z, h) { place(W, { car: [x, z, h] }); P.inVehicle = true; P.mesh.visible = false; P.speed = 0; app.selectMode('car'); }
  const blipCar = () => gps.blip('car', { x: car.position.x, z: car.position.z, kind: 'car', edge: true, name: car.label || "Dan's car" });

  /* ------------------------------------------- the thrusters' practice -- */
  // after the garage (Gears has just fitted them), in the car outside it: HOP and SIDE DASH, each ticked off as it is
  // used (keys, pad or the touch buttons: all of them fire the thrusters' own events), THRUSTERS READY when both are.
  // Optional: driving 90 m off from where it began, or walking off from the garage, puts it away. W 22nd St's traffic
  // held off while it runs (the garage scene's own hold, kept on)
  const PRACTICE_HOLD = { minX: G_AT.x - 45, maxX: G_AT.x + 45, minZ: 1590, maxZ: 1612 };
  function practice() {
    const th = W.thrusters, Pr = { over: false, overAt: now(), done: new Set(), began: false, stop: () => {} };
    if (!th?.on || !th.unlocked?.hop || !th.unlocked?.dash) { Pr.over = true; return Pr; }
    const STEPS = [['hop', '<kbd>SPACE</kbd> hop'], ['dash', '<kbd>Z</kbd> <kbd>C</kbd> side dash']];
    holds([PRACTICE_HOLD]);
    let from = null, readyT = 0;
    const mark = (id) => {
      if (Pr.over || !from || Pr.done.has(id)) return;
      Pr.done.add(id); sfx?.play('ding', { gain: 0.12 });
      const all = Pr.done.size === STEPS.length;
      O.coach(STEPS, Pr.done, { ready: all });
      if (all) readyT = now() + 2400;
    };
    const offs = [th.on('hop', () => mark('hop')), th.on('dash', () => mark('dash'))];
    let off = null;
    const end = () => {
      if (Pr.over) return; Pr.over = true; Pr.overAt = now();
      off?.(); for (const f of offs) f(); O.coach(null);
      holds(S.R?.shown ? SET_HOLDS : []);
    };
    off = hook(() => {
      if (W.cutscene) return;
      const p = me();
      if (!from) {
        if (dist(p, G_AT.x, G_AT.z) > 120) return end();
        // (on foot by the garage: it waits for him in the car)
        if (!inCar()) return;
        from = { x: car.position.x, z: car.position.z }; Pr.began = true;
        O.coach(STEPS, Pr.done);
        return;
      }
      if (readyT && now() > readyT) return end();
      if (dist(p, from.x, from.z) > 90 || dist(p, G_AT.x, G_AT.z) > 150) end();
    });
    Pr.stop = end;
    return Pr;
  }

  /* --------------------------------------------------------- the phases -- */
  const PHASES = {
    // the next day: the garage, Gears, Jane's call
    async garage() {
      W.cutscene = true; ui.cine(true); cm.resetInput?.();
      await ui.fade(1, 0.5);
      W.combat?.clear?.();
      // (come in his car: out of it, so the scene can park it in the bay; the car's controls hold it where it stands)
      if (inCar()) place(W, { dan: SPOT.out.dan });
      await sets();
      // (into the G in the dark, as Mission 2 leaves him: the night in the garage first, and the morning after it)
      const dark = !keep && ['twilight', 'midnight'].includes(app.lightingSystem?.activePresetId);
      holds([{ minX: G_AT.x - 45, maxX: G_AT.x + 45, minZ: 1590, maxZ: 1612 }]);
      if (dark) {
        app.selectTime?.('midnight');
        const night = nightScene(W, { garage: S.Gar, card: (on) => O.night(on), onDark: () => app.selectTime?.('golden') });
        night.setup();
        await runScene(W, night);
        // (it ends on black; a skip leaves it wherever it was: black now, the bars back for the next scene)
        await ui.fade(1, 0.05); O.night(false); S.Gar.mood(null);
        W.cutscene = true; ui.cine(true);
      }
      midday();
      ui.caption(dark ? 'LATER THAT MORNING' : 'THE NEXT DAY', dark ? 'West Chelsea' : 'Midday · West Chelsea', '#FFC93C', 2.6);
      const def = garageScene(W, { U, say, gears: S.gears, garage: S.Gar });
      def.setup();
      ui.fade(0, 0.9);
      await runScene(W, def);
      holds([]);
      S.Gar.show(true); S.Gar.inside(false);
      place(W, { car: SPOT.out.car, dan: SPOT.out.dan });
      // (Gears has fitted the cold-gas thrusters: the square's drive starts with a try of them)
      W.thrusters?.unlock?.('all', { announce: false });
    },
    // to Washington Square (the rally goes up on the way)
    async square(fresh) {
      // (played straight in: the light and his place first, the sets after: a slow load doesn't leave him at the city's
      // own start in its golden hour)
      // (a restart: at the wheel outside the garage, the drive ahead of him)
      if (fresh) { midday(); inTheCar(...SPOT.out.car); }
      W.thrusters?.unlock?.('all', { announce: false });
      await sets(); midday();
      if (fresh) S.Gar.show(true);
      // (outside the garage: the thrusters' practice, optional)
      const pr = dist(me(), G_AT.x, G_AT.z) < 60 ? practice() : { over: true, overAt: now(), stop: () => {} };
      // (the blip on the arch; the route down 5th Ave to its last lane, and on foot near the square, to the arch; in the
      // car on that last stretch, no line: the stage is in sight. still: a place, for the stall watch)
      const dest = { ...SQ, still: true, follow: () => (inCar() || dist(me(), SQ.x, SQ.z) > 140 ? FIFTH : SQ) };
      const drive = gps.drive({ dest, objective: ['Go to ', { 'Washington Square': 'yellow' }, '.'] });
      const t0 = now(); let called = false, up = false, bare = false;
      const at5th = (p) => Math.abs(p.x) < 22 && p.z > FIFTH.z - 6 && p.z < ARCH.z;
      const off = hook(() => {
        const dt = frameDt();
        drive.step();
        const last = inCar() && at5th(car.position) && drive.state === 'drive';
        if (last !== bare) { bare = last; gps.to(last ? null : dest); }
        const d = dist(me(), ARCH.x, ARCH.z);
        if (!up && d < 900) { up = true; spawnRally().catch((e) => console.warn('[m3]', e)); }
        if (dist(me(), G_AT.x, G_AT.z) > 300) S.Gar.show(false);
        if (S.R?.shown) S.R.update(dt, app.cameraSystem.camera.position);
        // (Jane's call, the Occupy setup (mission/calls.js 'm3-square'), once the practice is over or put away: a few
        // seconds after it, 7 s in at the soonest; it rings at the wheel. Her wrap 250 m from the arch or on 5th Ave's
        // last stretch, once her protected lines are said; no new extra block begun inside 400 m)
        const callAt = pr.over ? Math.max(t0 + 7000, pr.overAt + 2500) : Infinity;
        if (!called && now() > callAt) { called = true; W.calls?.start('m3-square', { delay: 0, wrapWhen: () => dist(me(), ARCH.x, ARCH.z) < 250 || at5th(me()), hurryWhen: () => dist(me(), ARCH.x, ARCH.z) < 400 }); }
      });
      // (there: by the arch, or stopped on 5th Ave's last stretch in front of it, or on foot near it)
      try { await wait(() => { const p = me(), d = dist(p, ARCH.x, ARCH.z); return d < 26 || ((d < 60 || at5th(p)) && (!inCar() || Math.abs(car.speed) < 6)); }); }
      finally { off(); drive.stop(); pr.stop(); }
      // (there before Jane has told him how to kill the reel: the arrival waits for her, in the car)
      if (inCar()) { car.speed = 0; car.vx = car.vz = 0; car.angularVel = 0; }
      endCall('m3-square');
      if (!up) await spawnRally();
    },
    // the community day, seen; a Suit planted in the crowd spots him
    async rally(fresh) {
      await sets(); midday();
      // (however he came, the scene leaves him on foot at the arch, his car parked on 5th Ave behind him: the fight
      // after it starts a few steps from the rigs, not in his car a block back; under a quick fade when he moves)
      const moved = fresh || inCar() || dist(P.position, 2.5, 2790) > 8;
      if (moved) { W.cutscene = true; ui.cine(true); cm.resetInput?.(); if (!fresh) await ui.fade(1, 0.25); }
      place(W, { car: FRESH.rigs.car, dan: [2.5, 2790, 0] });
      await spawnRally();
      car.speed = 0;
      // (its shots kept clear while it plays, M1's way: 5th Ave's last block down to the arch, the stage, the lawn to
      // the rigs; then only the stage again)
      holds([...SET_HOLDS, { minX: -26, maxX: 26, minZ: 2735, maxZ: 2905 }]);
      // (its last shot: him on the lawn behind the crowd, the three rigs ahead with their marks, the job's card up)
      S.carded = false;
      const def = rallyScene(W, { say, fiona: S.fiona, rally: S.R, spotter: S.crew?.enemies[0] || null, lawn: FRESH.rigs.dan,
        onRigs: () => { S.carded = true; markRigs(true); O.card(true, 4.6); } });
      def.setup();
      if (moved && !fresh) setTimeout(() => ui.fade(0, 0.6), 120);
      try { await runScene(W, def); } finally { holds(SET_HOLDS); }
    },
    // the fight round the rigs
    async rigs(fresh) {
      if (fresh) { midday(); place(W, { car: FRESH.rigs.car, dan: FRESH.rigs.dan }); }
      await sets(); midday();
      if (fresh) {
        await spawnRally();
        // (a retry: the rigs he smashed stay smashed, and he starts by the next one standing, a few steps off it)
        const next = S.R.smashed ? S.R.rigs.filter((r) => !r.down).sort((a, b) => Math.hypot(a.x, a.z - 2836) - Math.hypot(b.x, b.z - 2836))[0] : null;
        place(W, { car: FRESH.rigs.car, dan: next ? [next.x + 1.2, next.z - 3.4, Math.atan2(-1.2, 3.4)] : FRESH.rigs.dan });
      } else if (dist(P.position, FRESH.rigs.dan[0], FRESH.rigs.dan[1]) > 6) {
        // (the rally skipped before its last shot: on the lawn as it would have left him, facing the nearest rig)
        const [lx, lz] = FRESH.rigs.dan, n = S.R.rigs.filter((r) => !r.down).sort((a, b) => Math.hypot(a.x - lx, a.z - lz) - Math.hypot(b.x - lx, b.z - lz))[0];
        place(W, { dan: [lx, lz, n ? Math.atan2(n.x - lx, n.z - lz) : FRESH.rigs.dan[2]] });
      }
      // the rigs marked; the job's card (unless the rally's last shot just put it up); a bat by each one standing
      markRigs(true);
      if (fresh || !S.carded) O.card(true, 4.2);
      S.carded = false;
      batsByRigs();
      const combat = W.combat, R = S.R;
      const autoGetUp = combat?.player.autoGetUp, maxHp0 = combat?.player.maxHp;
      let offDown = null;
      // (his health stretched for it (130), a slow second wind when he's kept out of reach a few seconds, a top-up as
      // each rig goes down)
      if (combat?.player) { combat.player.maxHp = 130; combat.player.hp = combat.player.maxHp; lastHp = combat.player.hp; combat.player.autoGetUp = false; offDown = combat.player.onDown(() => fail('Dan got knocked out.', true)); }
      let onKey = null, offFight = null;
      try {
        wake();
        R.crowd?.scatter(P.position.x, P.position.z - 20);
        // (4 s in, Brick on his radio, loud enough for the camp to hear: the planted Suits' plan, out loud)
        delay(4).then(async () => {
          if (R.smashed >= 3) return;
          W.voice?.fx?.('Brick', 'phone');
          try { await say([['Brick', ACID, 'Make it look like he started it!']]); } finally { W.voice?.fx?.('Brick', null); }
          await say([['Camp', CAMP, 'We saw that!']]);
          R.cheer?.();
        }).catch(() => {});
        const go = () => objective(['Smash the ', { 'screen rigs': 'green' }, '.'], null);
        go();
        ui.counter('RIGS', `${R.smashed}/3`);
        let warned = false, barkT = now() + 10000, again = null, extra = false, lastMv = 'free', swing = null, routed = false;
        // (out of reach of them, a retry or a chase off the lawn: the line to the nearest rig standing)
        const nearestRig = () => { let b = null, bd = Infinity; for (const r of R.rigs) if (!r.down) { const d = dist(me(), r.x, r.z); if (d < bd) { bd = d; b = r; } } return [b, bd]; };
        const rigTarget = { follow: () => { const [r] = nearestRig(); return r ? { x: r.x, z: r.z } : me(); }, name: 'Screen rig' };
        // (Fiona's PR patter and the camp's chants back at her, taking turns)
        const BARKS = [
          ['Fiona', PINK, 'JPBank loves you! JPBank loves hot dogs! JPBank loves YOU!'], ['Fiona', PINK, "Don't look at the fight! Look at the free tote bags!"],
          ['Fiona', PINK, 'This is a safe, fun, family space! Somebody hit him!'], ['Fiona', PINK, 'One bad apple, folks! The rest of the bank is delicious!'],
          ['Camp', CAMP, 'We are the ninety-nine percent!'], ['Camp', CAMP, 'Banks got bailed out! We got sold out!'], ['Camp', CAMP, 'The whole world is watching!'],
        ];
        const FIONA_B = BARKS.filter((b) => b[0] === 'Fiona'), CAMP_B = BARKS.filter((b) => b[0] === 'Camp');
        let barkN = 0;
        const LOST = [['Fiona', PINK, "We lost a screen! That's fine! We have two more! And hot dogs!"], ['Fiona', PINK, 'Two screens down! Still the best day ever! Somebody call legal!']];
        const smashed = (r) => {
          stats.smashed = R.smashed; ui.counter('RIGS', `${R.smashed}/3`);
          O.pop('SCREEN DOWN', `RIGS ${R.smashed}/3`);
          R.screen.dip(); S.chev[r.i].hide(); gps.unblip('rig' + r.i);
          sfx?.play('thunk', { gain: 0.3, f: 90 });
          if (combat?.player && !combat.player.down) combat.player.hp = Math.min(combat.player.maxHp, combat.player.hp + 25);
          wakeBrute();
          // (the camp across the lawn cheers each one down)
          R.cheer?.();
          // (Fiona's line for it; at the first, Ms. Bea gets the camp filming the Suits: the footage of the return call)
          if (R.smashed < 3) {
            W.voice?.fx?.('Fiona', 'phone');
            say([LOST[Math.min(LOST.length - 1, R.smashed - 1)], ...(R.smashed === 1 ? [['Bea', BEA, 'Phones up, everybody! Film the men in suits!']] : [])]).catch(() => {});
            barkT = now() + 9000;
          }
        };
        // a blow at a rig: Dan's swing (the fight's own move, or the keys), what he throws, his car
        let heavyT = -1e9, pressT = -1e9, stepIn = null;
        const reachOf = () => (W.combat?.debug?.c?.me?.holding?.kind === 'bat' ? 3.0 : 2.5);
        const blow = (r, heavy) => {
          const held = W.combat?.debug?.c?.me?.holding?.kind, dmg = held === 'bat' || held === 'bottle' ? 3 : heavy ? 2 : 1;
          r.hit(dmg, P.position);
        };
        // every blow that lands on a rig, whatever brought it: a flash and sparks, the view jolted, a beat's hit-stop on
        // foot, its tag kicked (the set glitches its screen and rocks it)
        const _at = new THREE.Vector3(), _dir = new THREE.Vector3();
        for (const r of R.rigs) r.onHit = (rig, dmg, from, down) => {
          const c = W.combat?.debug?.c, f = from || me();
          _at.set(rig.x, (rig.y || 0) + 1.65, rig.z); _dir.set(rig.x - f.x, 0.15, rig.z - f.z).normalize();
          c?.fx?.hit?.(_at, _dir, { heavy: down ? 1 : dmg >= 2 ? 0.6 : 0.25 });
          if (!inCar()) { c?.shake?.(down ? 0.8 : dmg >= 2 ? 0.6 : 0.45, _dir); c?.hitStop?.(down ? 0.1 : 0.06, 0.05); }
          O.hitTag(rig);
          again = down ? null : rig;
        };
        // (the fight's swing, where it lands: a rig in reach in front of him, or right by him)
        const strike = (heavy) => {
          if (inCar()) return;
          const reach = reachOf(), fx = Math.sin(P.heading), fz = Math.cos(P.heading);
          let best = null, bd = Infinity;
          for (const r of R.rigs) {
            if (r.down) continue;
            const dx = r.x - P.position.x, dz = r.z - P.position.z, d = Math.hypot(dx, dz);
            if (d > reach) continue;
            const ang = Math.acos(clamp((dx * fx + dz * fz) / Math.max(1e-3, d), -1, 1));
            if (d > 1.15 && ang > 1.4) continue;
            if (d < bd) { bd = d; best = r; }
          }
          if (best) blow(best, heavy);
        };
        // (a blow pressed with a rig in reach: the rig's, whichever way the fight turns him to swing, unless a Suit on
        // his feet is right in his face, nearer than the rig: then the fight has it. The prompt says which. (23 Oct: it
        // used to give way to any Suit nearer than the rig, and the crew stand by the rigs, so J beside one did nothing)
        const rigAt = () => {
          const reach = reachOf(), px = P.position.x, pz = P.position.z;
          let best = null, bd = Infinity;
          for (const r of R.rigs) { if (r.down) continue; const d = Math.hypot(r.x - px, r.z - pz); if (d <= reach && d < bd) { bd = d; best = r; } }
          if (!best || bd < 1.3) return best;
          for (const e of W.combat?.enemies || []) {
            if (!e.alive || e.standing === false) continue;
            const de = Math.hypot(e.pos.x - px, e.pos.z - pz); if (de < 1.25 && de < bd - 0.2) return null;
          }
          return best;
        };
        onKey = (e) => {
          // (a finger is the stick's or the view's, never a blow: on touch, STRIKE / HEAVY come as J / K)
          if (e.type === 'pointerdown' && e.pointerType === 'touch') return;
          const key = e.type === 'keydown' && !e.repeat && (e.code === 'KeyJ' || e.code === 'KeyK'), click = e.type === 'pointerdown' && (e.button === 0 || e.button === 2);
          if ((!key && !click) || W.cutscene || W.paused || inCar()) return;
          const heavy = e.code === 'KeyK' || e.button === 2;
          // (a heavy pressed: the fight calls a heavy at nobody a whiff, but at a rig it lands as a heavy)
          if (heavy) heavyT = now();
          const r = rigAt();
          if (r) {
            // (turned to it as he swings: the blow goes where it lands)
            pressT = now(); P.heading = Math.atan2(r.x - P.position.x, r.z - P.position.z); P.mesh.rotation.y = P.heading;
            stepIn = { r, t: 0 };
            setTimeout(() => { if (!r.down && !W.paused) blow(r, heavy); }, 160); return;
          }
          // (without the fight's own moves to read: the strike keys)
          if (!W.combat?.debug?.c?.me) setTimeout(() => strike(heavy), 160);
        };
        addEventListener('keydown', onKey, true); addEventListener('pointerdown', onKey, true);
        let hurtT = now(), hp0 = combat?.player?.hp ?? 0;
        offFight = hook(() => {
          const dt = frameDt(); if (W.cutscene) return;
          R.update(dt, app.cameraSystem.camera.position);
          if (combat?.player) {
            const hp = combat.player.hp; if (hp < hp0 - 0.5) hurtT = now(); hp0 = hp;
            if (hp > 0 && !combat.player.down && now() - hurtT > 3500 && hp < combat.player.maxHp * 0.6) combat.player.hp = hp + 4 * dt;
          }
          // (the brute at the stage comes for him if he goes for him first)
          if (!S.bruteUp && S.brute?.enemies.some((e) => !e.alive || e.state !== 'idle' || dist(P.position, e.pos.x, e.pos.z) < 5)) wakeBrute();
          // (a blow given to a rig: a quick step in, so the swing meets it, not the air a couple of metres short)
          if (stepIn) {
            const sr = stepIn.r, dx = sr.x - P.position.x, dz = sr.z - P.position.z, d = Math.hypot(dx, dz), want = W.combat?.debug?.c?.me?.holding ? 1.5 : 1.0;
            stepIn.t += dt;
            if (d <= want || stepIn.t > 0.2 || combat?.player?.down) stepIn = null;
            else { const m = Math.min(d - want, 9 * dt); P.position.x += dx / d * m; P.position.z += dz / d * m; P.mesh.position.x = P.position.x; P.mesh.position.z = P.position.z; }
          }
          // (his swing: the moment a strike, a heavy or a swing at the air starts, its blow lands ~0.16 s on)
          const mv = W.combat?.debug?.c?.me?.moveName?.() || 'free';
          // (a swing the press already gave to a rig isn't counted twice)
          if (mv !== lastMv) { if ((mv === 'whiff' || mv === 'strike' || mv === 'heavy') && now() - pressT > 450) swing = { t: 0, heavy: mv === 'heavy' || (mv === 'whiff' && now() - heavyT < 450) }; lastMv = mv; }
          if (swing) { swing.t += dt; if (swing.t > 0.16) { strike(swing.heavy); swing = null; } }
          // things thrown, and the car
          // (a thing in the air: its path over the frame against each rig, a post 2.6 m tall and 0.5 m round)
          for (const I of W.combat?.items?.list || []) {
            const p = I.obj.position, was = I._m3at || (I._m3at = p.clone()), fly = I.state === 'fly' && I.vel.lengthSq() > 9;
            if (fly) for (const r of R.rigs) {
              if (r.down || Math.min(p.y, was.y) > 2.9) continue;
              const ax = was.x - r.x, az = was.z - r.z, bx = p.x - was.x, bz = p.z - was.z, L = bx * bx + bz * bz;
              const k = L > 1e-6 ? clamp(-(ax * bx + az * bz) / L, 0, 1) : 0;
              if (Math.hypot(ax + bx * k, az + bz * k) < 0.75) r.hit(3, p);
            }
            was.copy(p);
          }
          if (inCar() && Math.abs(car.speed) > 2.5) for (const r of R.rigs) if (!r.down && dist(car.position, r.x, r.z) < 2.4) r.hit(3, car.position);
          // (each rig down, whatever brought it down: counted, its marks off, the reel broken up)
          for (const r of R.rigs) if (r.down && !r.counted) { r.counted = true; smashed(r); }
          // the rigs marked (green blips; their columns, chevrons and tags: markRigs; the line to the nearest from afar),
          // the Suits red
          for (const r of R.rigs) if (!r.down) gps.blip('rig' + r.i, { x: r.x, z: r.z, kind: 'object', edge: true, name: 'Screen rig' });
          // (in reach of one, the blow his: the prompt, the key and what it takes)
          const nr = !inCar() && !combat?.player?.down ? rigAt() : null;
          if (nr) {
            const held = W.combat?.debug?.c?.me?.holding?.kind, armed = held === 'bat' || held === 'bottle';
            O.prompt(`<kbd>J</kbd> ${again === nr ? 'Again!' : 'Smash the rig'}<small>${armed ? 'one swing' : again === nr ? 'one more' : 'fists: two hits'}</small>`);
          } else O.prompt(null);
          const far = nearestRig()[1] > (routed ? 18 : 24);
          if (far !== routed) { routed = far; gps.to(far ? rigTarget : null); }
          const live = new Set();
          for (const e of W.combat?.enemies || []) if (e.alive && dist(e.pos, P.position.x, P.position.z) < 150) { live.add('e:' + e.id); gps.blip('e:' + e.id, { x: e.pos.x, z: e.pos.z, kind: 'enemy' }); }
          for (const id of [...gps.blips.keys()]) if (id.startsWith('e:') && !live.has(id)) gps.unblip(id);
          // Fiona on the megaphone
          // (Fiona and the camp in turns, when nothing else is being said)
          if (now() > barkT) {
            if (talking) barkT = now() + 1500;
            else {
              barkT = now() + 9000 + Math.random() * 3000;
              const pool = barkN++ % 2 ? CAMP_B : FIONA_B, b = pool[Math.floor(Math.random() * pool.length)];
              if (b[0] === 'Fiona') W.voice?.fx?.('Fiona', 'phone');
              say([b]).catch(() => {});
            }
          }
          // one more at two down
          if (!extra && R.smashed >= 2 && W.combat?.spawnCrew) {
            extra = true;
            S.extra = W.combat.spawnCrew({ x: -24, z: 2944, count: 1, brute: 0, weapons: ['bottle'], aggro: true, props: false });
            S.extra.engage?.();
            say([['Brick', ACID, 'Backup! Protect the last screen!']]).catch(() => {});
          }
          // the fight's ground (from past the fountain up 5th Ave to where the drive ended)
          const d = Math.min(dist(me(), ARENA.x, ARENA.z), dist(me(), FIFTH.x, FIFTH.z + 30));
          if (d > 160) fail('You left the fight.');
          else if (d > 100 && !warned) { warned = true; objective(['Get back to the ', { fight: 'yellow' }, '.'], { x: ARENA.x, z: ARENA.z, name: 'The fight · Washington Square' }); }
          else if (d < 90 && warned) { warned = false; go(); }
        });
        await wait(() => R.smashed >= 3);
        stats.ko = [S.crew, S.brute, S.extra].filter(Boolean).reduce((n, c) => n + c.enemies.filter((e) => !e.alive).length, 0);
      } finally {
        offFight?.(); O.prompt(null);
        for (const r of R.rigs) r.onHit = null;
        if (onKey) { removeEventListener('keydown', onKey, true); removeEventListener('pointerdown', onKey, true); }
        offDown?.(); if (combat?.player) { combat.player.autoGetUp = autoGetUp; combat.player.maxHp = maxHp0; combat.player.hp = Math.min(combat.player.hp, maxHp0); }
      }
      for (const id of [...gps.blips.keys()]) if (id.startsWith('e:') || id.startsWith('rig')) gps.unblip(id);
      ui.counter(null);
      await delay(0.8);
      markRigs(false); O.card(false);
    },
    // the dump: the reel dead, Fiona gone, the people's mic, the car waiting
    async dump(fresh) {
      await sets(); midday();
      if (fresh) { await spawnRally({ crew: false }); for (const r of S.R.rigs) if (!r.down) r.hit(3); }
      S.fionaUp = false;
      W.combat?.clear?.(); S.crew = null; S.brute = null; S.extra = null;
      markRigs(false); O.card(false);
      for (const c of S.chev) c.hide();
      // (5th Ave from the square up, the arch's front, the stage, and the first of Washington Mews where his car waits)
      holds([{ minX: -12, maxX: 12, minZ: 2560, maxZ: 2796 }, { minX: -16, maxX: 26, minZ: 2776, maxZ: 2830 }, STAGE_HOLD, CAMP_HOLD, { minX: 5, maxX: 60, minZ: 2738, maxZ: 2753 }]);
      inTheCar(...ESCAPE_CAR);
      const def = dumpScene(W, { say, fiona: S.fiona, rally: S.R, suv: S.suv });
      def.setup();
      await runScene(W, def);
      holds([]);
    },
    // the Suits' cars after him
    async escape(fresh) {
      if (fresh) { midday(); inTheCar(...ESCAPE_CAR); }
      await sets(); midday();
      if (fresh) { if (!S.R.shown) { S.R.reset(); S.R.show(true); } for (const r of S.R.rigs) if (!r.down) r.hit(3); S.R.screen.mode('dead'); S.R.camp?.fallMan(); }
      // (a retry starts him back where the dump left him, whatever shoved the car about before)
      if (fresh || !inCar()) inTheCar(...ESCAPE_CAR);
      objective(['Lose the ', { Suits: 'red' }, '.'], null);
      W.audio?.play?.('horn', { pos: [car.position.x - 40, 1, car.position.z] });
      // how: break their line of sight (the pursuit loses him once they haven't seen him for a while)
      delay(0.5).then(() => ui.help(['Turn corners to break their ', { 'line of sight': 'yellow' }, '. Out of sight, the escape bar under HEAT fills.'], 6.5)).catch(() => {});
      // the thrusters: Gears' cold-gas (practised outside the garage; unlocked now on a restart that skipped it), their
      // keys again after the line above has had its time
      delay(7.2).then(() => {
        const th = W.thrusters;
        if (!th?.unlock) { ui.help(['Cold-gas thrusters: [Space] hops the car, [Z] / [C] dash it sideways.'], 9); return; }
        if (!th.unlock('all', { announce: true }).length) ui.help('Thrusters: [SPACE] hop over a car · [Z] [C] dash a lane.', 7);
      }).catch(() => {});
      // Jane, fast (mission/calls.js 'm3-escape'): 9 s in, at the wheel; SEEN / SEARCHING from the pursuit's sight, her
      // wrap when it loses him (still in the car: it carries into the drive back)
      W.calls?.start('m3-escape');
      // (they come out of W 8th St onto 5th Ave, ~80 m up from him, out of sight until they turn the corner: from just
      // round it, already rolling, so they are on him as he sets off and it takes a real run to lose them; from 150 m
      // down W 8th St at 8 m/s, a boost up 5th Ave lost them at the first corner in 25 s)
      // (escape / vmax: this chase's own lose time (s) and top speed (m/s), for the pursuit to read when it takes them:
      // at heat 2's 8 s and 30 m/s a boost up 5th Ave still loses them in ~20 s; the brief wants 45-60 s. With the
      // real-key lose bot: escape 16 lost them at 42-52 s, ~33 s after the last sighting, so a clean early break came in
      // under 45; at 25 it is ~32-37 s after the last sighting: 45-49 s in four runs that shook them by 7-17 s; a messy
      // start (stuck on the kerb, rammed) runs to 60-70 s)
      const chase = S.chase = W.pursuit?.start?.({ heat: 2, kind: 'suits', count: 2, from: { x: -48, z: 2700 }, speed: 16, escape: 25, vmax: 35, target: () => (inCar() ? car.position : P.position) }) || null;
      let lost = false, wasIn = inCar();
      const t0 = now();
      const off = hook(() => {
        const dt = frameDt();
        if (S.R.shown) { S.R.update(dt, app.cameraSystem.camera.position); if (dist(me(), ARCH.x, ARCH.z) > 700) S.R.show(false); }
        if (inCar() && !wasIn) { gps.unblip('car'); objective(['Lose the ', { Suits: 'red' }, '.'], null); }
        if (!inCar() && wasIn) blipCar();
        wasIn = inCar();
        // (no pursuit to run: get well clear of the square and keep driving)
        if (!chase && now() - t0 > 14000 && dist(me(), ARCH.x, ARCH.z + 150) > 420) lost = true;
      });
      if (chase) {
        chase.on?.('spotted', () => W.calls?.react('seen'));
        chase.on?.('hidden', () => W.calls?.react('searching'));
        chase.on?.('lost', () => { lost = true; W.calls?.wrap(); });
        chase.on?.('caught', () => fail('The Suits caught you.'));
        chase.on?.('wrecked', () => { stats.wrecked = (stats.wrecked || 0) + 1; });
      } else ui.counter('HEAT', '2');
      try { await wait(() => lost); } finally { off(); chase?.stop?.(); S.chase = null; ui.counter(null); }
      if (!chase) W.calls?.wrap();
      ui.objective(['You lost the ', { Suits: 'red' }, '.'], 3);
      await delay(1.5);
    },
    // back to the garage
    async ret(fresh) {
      if (fresh) { midday(); inTheCar(...FRESH.ret); }
      await sets(); midday();
      S.R.show(false); S.Gar.show(true);
      const door = { x: G_AT.x, z: G_AT.z - 3.2, name: "Gears' garage · W 22nd St" };
      const drive = gps.drive({ dest: door, objective: ['Go back to the ', { garage: 'yellow' }, '.'] });
      const m = createMarker(THREE, app.scene, { color: '#FFC93C', radius: 2.4, height: 2.2, alpha: 0.3 });
      m.at(door.x, cm.getGroundHeight(door.x, door.z, 'person'), door.z);
      // Jane, the payoff and the hook (mission/calls.js 'm3-return'): 8 s in at the wheel (after the escape's call, if it
      // carries on); her wrap 150 m from the door, once her protected lines are said; no new extra block inside 300 m
      W.calls?.start('m3-return', { wrapWhen: () => dist(me(), door.x, door.z) < 150, hurryWhen: () => dist(me(), door.x, door.z) < 300 });
      const off = hook(() => { drive.step(); });
      try { await wait(() => { const d = dist(me(), door.x, door.z); return inCar() ? d < 7 && Math.abs(car.speed) < 20 : d < 2.6; }); if (inCar()) { car.speed = 0; car.vx = car.vz = 0; car.angularVel = 0; } }
      finally { off(); drive.stop(); m.hide(); app.scene.remove(m.group); }
      // (there before she's said her piece: the home scene waits for her, in the car)
      endCall('m3-return');
    },
    async home() {
      await sets();
      // (back late in the day: the drive home and the escape took the afternoon. Under a short black, the evening's
      // light, which the P after it keeps, as the save's Continue does for Mission 4)
      W.cutscene = true; ui.cine(true); cm.resetInput?.();
      if (app.lightingSystem?.activePresetId !== 'golden') { await ui.fade(1, 0.35); app.selectTime?.('golden'); setTimeout(() => ui.fade(0, 0.6), 150); }
      S.Gar.show(true);
      car.speed = 0;
      // (out of the car for the scene: it parks him and his car where it wants them)
      place(W, { dan: [SPOT.door.dan[0], SPOT.door.dan[1], 0] });
      holds([{ minX: G_AT.x - 45, maxX: G_AT.x + 45, minZ: 1590, maxZ: 1612 }]);
      const def = homeScene(W, { say, gears: S.gears, garage: S.Gar });
      def.setup();
      await runScene(W, def);
      holds([]);
      place(W, { dan: [SPOT.door.dan[0], SPOT.door.dan[1], 0] });
    },
  };
  const ORDER = ['garage', 'square', 'rally', 'rigs', 'dump', 'escape', 'ret', 'home'];
  const CHECKPOINT = { garage: 'garage', square: 'square', rally: 'square', rigs: 'rigs', dump: 'rigs', escape: 'escape', ret: 'return', home: 'return' };
  const PHASE_OF = { garage: 'garage', square: 'square', rigs: 'rigs', escape: 'escape', return: 'ret' };
  const LABELS = { garage: "Gears' garage", square: 'To Washington Square', rigs: 'The rigs', escape: 'Lose the Suits', return: 'Back to the garage' };
  // the fail screen (ui.failed): a tip by the reason, what Retry does by the checkpoint it goes back to, what Skip does
  // by the phase he failed in (a skip goes on to the phase after the checkpoint's own: the rigs' to the dump, Fiona's
  // run, then the getaway)
  const TIPS = {
    'Dan got knocked out.': ['Counter the ', { 'yellow cues': 'yellow' }, ' with [Q], roll away from ', { 'red ones': 'red' }, ' with [C], and grab a bat, trash can or bottle with [E]: it hits much harder. Out of reach for a few seconds, your health creeps back.'],
    'You left the fight.': ['Stay by the rigs while the Suits are up: the fight is lost past 160 m.'],
    'The Suits caught you.': ['Turn corners to break their ', { 'line of sight': 'yellow' }, ': out of sight, the escape bar under HEAT fills. [SPACE|HOP] jumps the car over traffic.'],
  };
  const RETRY = { garage: "Retry: from Gears' garage", square: 'Retry: to Washington Square', rigs: 'Retry: the rigs', escape: 'Retry: the getaway', return: "Retry: back to Gears' garage" };
  const SKIP = { rigs: 'Skip the rigs: start at the getaway', dump: 'Skip the rigs: start at the getaway', escape: "Skip the getaway: start on the way back to Gears' garage" };

  // Jane's calls on the drives (mission/calls.js): at an arrival with her call still on, it hangs up at once and the
  // scene starts the moment the car is there (the owner, 28 Oct: a marker starts its cutscene straight away)
  function endCall(id) { if (W.calls?.owes?.(id)) W.calls.stop({ quiet: true, of: 'm3:' }); }

  /* --------------------------------------------------- passed, hand-off -- */
  async function passed() {
    teardown();
    const secs = Math.round((now() - stats.t0) / 1000);
    sfx?.play('passed'); W.audio?.play?.('missionPassed');
    await ui.passed({ title: 'Occupied', stats: [
      ['TIME', `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`], ['SCREENS SMASHED', '3/3'],
      ['SUITS DOWN', String(stats.ko || 0)], ['HITS TAKEN', String(stats.hits)],
    ], reward: '+11,240', note: 'The camp says FREE DAN · NEW: bats · cold-gas thrusters' }, 6);
    W.supporters = (W.supporters || 0) + 11240;
    W.progress = { ...(W.progress || {}), m3: true };
    markDone(W, 'm3');
    await gsleep(4500);
    sfx?.play('buzz', { gain: 0.18, times: 2 }); sfx?.play('ding', { gain: 0.14 }); W.audio?.play?.('phoneBuzz');
    ui.dm('Unknown number', "it's rook. you saw the chat. i'm driving your laptop to the shredder at dawn. i was in that crowd today. i'm done. meet me tonight at sara roosevelt park. come alone. -R", 13);
    // (the DM read, then the end of the episode: its card, and free roam after it)
    await gsleep(5500);
    await endEpisode(W);
  }

  /* ------------------------------------------------------- the runner -- */
  const M = {
    get phase() { return M._phase; },
    get running() { return running && !!M._phase && M._phase !== 'passed'; },
    stop() { running = false; tok.dead = true; teardown(); W.combat?.clear?.(); },
    async run(at = 'garage') {
      let i = Math.max(0, ORDER.indexOf(PHASE_OF[at] || at)), fresh = true;
      while (i < ORDER.length && running) {
        const phase = (M._phase = ORDER[i]);
        tok = { dead: false, err: null };
        ui.step('m3:' + phase);
        try {
          await PHASES[phase](fresh);
          // (the phase's leftovers stop with it: a call or a timer it started doesn't run on into the next)
          tok.dead = true; tok.err = new Quit();
          fresh = false; i++;
        } catch (e) {
          if (e instanceof Quit) return;
          if (!(e instanceof Fail)) { console.error('[m3]', phase, e); tidy(); W.cutscene = false; ui.cine(false); return; }
          tidy(); cm.resetInput?.();
          if (e.ko) { ui.ko(true); sfx?.play('failed'); await sleep(2600); ui.ko(false); } else sfx?.play('failed');
          const cp = CHECKPOINT[phase]; fails[cp] = (fails[cp] || 0) + 1;
          // (the choices move only on fresh presses: ui.failed)
          const choice = await ui.failed(e.reason, { skip: fails[cp] >= 3, tip: TIPS[e.reason], retryLabel: RETRY[cp], skipLabel: SKIP[phase], quitLabel: 'Quit: back to free roam' });
          W.combat?.clear?.(); S.crew = null; S.brute = null; S.extra = null; S.awake = false; S.bruteUp = false;
          if (W.combat?.player) W.combat.player.hp = W.combat.player.maxHp;
          if (choice === 'quit') { M.stop(); toGarage(W, { quick: true }); return; }
          // (a retry of the rigs keeps the ones he smashed: it starts by the next one standing)
          // (a skip goes on past the part he failed, its scene after it still played: the rigs' skip still sees Fiona run)
          if (choice === 'skip') { i = ORDER.indexOf(PHASE_OF[cp]) + 1; fresh = true; continue; }
          i = ORDER.indexOf(PHASE_OF[cp]); fresh = true;
        }
      }
      if (!running) return;
      M._phase = 'passed';
      await passed();
      running = false;
    },
    fail,
    S,
  };
  missions(W).register({
    id: 'm3', act: 'Act II · Mission 3', title: 'Occupied',
    checkpoints: ['garage', 'square', 'rigs', 'escape', 'return'].map((id) => ({ id, label: LABELS[id] })),
    active: () => running && !!M._phase && M._phase !== 'passed',
    at: () => CHECKPOINT[M._phase] || 'garage',
    restart: (at) => { ui.ko(false); start(W, { at, keep: true }).catch((e) => console.error('[m3]', e)); },
  });
  return M;
}
