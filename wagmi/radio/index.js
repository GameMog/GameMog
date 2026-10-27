// Mog City: the car radio (stations, the WAGMI theme) and the cast's voices (WAGMI.radio, WAGMI.voice). Installed by game.js.
//   radio.js     the stations (stations.js), R next station · T radio off / on in the car, the station card
//   voices.js    the spoken lines (assets/voice), played as the subtitles show them
//   build/       Node tools (not loaded here): the voice build, the music it was composed with
// Sound goes through WAGMI.audio's mixer when there is one (its music and voice buses), else through a little mixer of
// our own, started by the first key or click.
import { createRadio } from './radio.js';
import { createVoice } from './voices.js';

export async function install(W) {
  const out = outputs(W);
  W.voice = await createVoice(W, out);
  W.radio = createRadio(W, out);
  console.log('[wagmi] radio and voices in:', W.radio.stations.length, 'stations,', W.voice.lines.length, 'lines');
}

// where the radio and the voices go: WAGMI.audio's buses, or ours (one context, a bus each, a gentle limiter)
function outputs(W) {
  let own = null;
  const theirs = () => { const b = W.audio?.bus; return b?.music && b?.voice && b.music.context ? b : null; };
  function mine() {
    if (own) return own;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    const ctx = new AC(), lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -6; lim.ratio.value = 8; lim.attack.value = 0.003; lim.release.value = 0.25; lim.connect(ctx.destination);
    const bus = { music: ctx.createGain(), voice: ctx.createGain() };
    bus.music.gain.value = 0.55; bus.voice.gain.value = 1.0;
    for (const b of Object.values(bus)) b.connect(lim);
    own = { ctx, bus };
    const resume = () => { if (ctx.state !== 'running' && !W.paused) ctx.resume().catch(() => {}); };
    for (const ev of ['keydown', 'pointerdown']) addEventListener(ev, resume, { passive: true });
    // (the pause menu holds our context where it is, as the mixer's is held: a line half said goes on from there)
    let held = false;
    setInterval(() => { if (!!W.paused === held) return; held = !!W.paused; if (held) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {}); }, 50);
    return own;
  }
  // (our context only once there has been a gesture: made before one, the browser holds it and complains)
  const active = () => navigator.userActivation ? navigator.userActivation.hasBeenActive : true;
  // (chosen once: nodes of one context can't feed another's)
  let side = null;
  const pick = () => {
    if (side) return side;
    const b = theirs(); if (b) return (side = { ctx: b.music.context, bus: b });
    if (!active()) return null;
    const m = mine(); return m ? (side = m) : null;
  };
  return {
    ctx() { const s = pick(); if (s && s === own && s.ctx.state !== 'running' && !W.paused) s.ctx.resume().catch(() => {}); return s?.ctx || null; },
    bus(name) { const s = pick(); return s ? s.bus[name] || s.bus.sfx || s.bus.music : null; },
    // ('mixer': WAGMI.audio's buses (its duck() dips the music under speech); 'own': ours)
    via: () => (!side ? null : side === own ? 'own' : 'mixer'),
  };
}
