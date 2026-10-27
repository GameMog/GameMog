// Mog City: the supercar's engine (Dan's car). A virtual gearbox makes an engine speed (rpm) out of the road speed,
// and the engine's voice is real recordings cut into constant-pitch loops at a few engine speeds (assets/sfx/engine),
// played together and crossfaded by rpm, each pitched by rpm / its own rpm:
//   v8-*    a Maserati GranTurismo S (the Ferrari-built 4.7 V8), standing, idling and revving (lmartins, CC BY 4.0)
// The gearbox: six gears and a tall overdrive, an automatic that shifts late under full throttle and early at a cruise,
// settles into the overdrive once the speed holds steady (flat out at 34 m/s about 3000 rpm, the boost's 56 about 5000),
// a kick-down when the throttle goes in at speed (or the boost lights), a launch that slips the clutch, a short ignition
// cut on each upshift (the note drops and the exhaust pops), a rev-matching blip on each downshift under braking,
// overrun crackle when the throttle lifts, the rev limiter's bounce (wheelspin against a wall, flat out in reverse), and
// an idle burble at rest.
// Load is what the engine is giving, read off what the car is doing (its acceleration), not the pedal alone: pulling away
// and gathering speed the loops play open and driven; held at a steady speed, the throttle still down, it only ticks over
// (lower, darker, quieter); off the throttle they drop back, darker.
// Until the loops arrive (or if they can't), a plain synthesized note follows the same gearbox.
// createSupercar(M, out, { voice }) -> { update(dt, s) -> state, ready, stop(), rev(delay), state }
//   s.mute: no pops or crackle (it is fading out, the car going ALL ELECTRIC); rev(delay): the engine catching, a blip
//   of the throttle after delay s (switching back from electric). Made at speed, it starts in the gear for that speed.
//   voice 'v8' (the only one now: the owner picked the V8 all the way up over a V8 with a V10's shriek on top)

export const LOOPS_V8 = [
  // name, firing frequency of the loop (Hz), its length in seconds (the file holds it twice over)
  { name: 'v8-idle', fire: 55.245, secs: 2.0269 },
  { name: 'v8-2000', fire: 131.786, secs: 0.6066 },
  { name: 'v8-2500', fire: 169.842, secs: 0.6125 },
  { name: 'v8-4000', fire: 270.547, secs: 0.5914 },
  { name: 'v8-4900', fire: 331.226, secs: 0.6036 },
];
const VOICES = { v8: LOOPS_V8 };

// the gearbox: road speed (m/s) per 1000 rpm in each gear; the car tops out at 34 m/s (56 boosting). The seventh is the
// overdrive (OD): only a steady speed or the boost's top end takes it there
const GEARS = [1.69, 2.75, 3.81, 4.88, 6.0, 7.25, 11.3];
const OD = GEARS.length;
const REV = 1.6;                 // reverse
const IDLE = 850, REDLINE = 8000, LAUNCH = 3600;
const BASE = new URL('../../assets/sfx/engine/', import.meta.url);

// the decoded loops, one set per context (a second car or a rebuild doesn't fetch again)
const CACHE = new WeakMap();
export const preloadEngine = (ctx, voice) => loadLoops(ctx, VOICES[voice] || VOICES.v8);
function loadLoops(ctx, list) {
  let byName = CACHE.get(ctx); if (!byName) CACHE.set(ctx, (byName = {}));
  return Promise.all(list.map((l) => (byName[l.name] ||= fetch(new URL(l.name + '.m4a', BASE)).then((r) => { if (!r.ok) throw new Error(r.status + ' ' + l.name); return r.arrayBuffer(); }).then((b) => ctx.decodeAudioData(b)))));
}

export function createSupercar(M, out, opt = {}) {
  const list = VOICES[opt.voice] || VOICES.v8;
  const ctx = M.ctx, now = () => M.now();
  let stopped = false;
  const ramp = (p, v, k = 0.03) => p.setTargetAtTime(v, now(), k);

  // the voice: loops -> each its gain -> mix -> a little drive -> the load's low-pass -> a presence peak -> level -> out
  const mix = M.gain(1), drive = M.shaper(1.6), lp = M.filt('lowpass', 2000, 0.6), pres = M.filt('peaking', 1400, 0.9), low = M.filt('lowshelf', 160, 0.7), level = M.gain(0, out);
  pres.gain.value = 0; low.gain.value = 3;
  const dry = M.gain(0.65), wet = M.gain(0.35);
  mix.connect(dry); mix.connect(drive); drive.connect(wet); dry.connect(lp); wet.connect(lp); lp.connect(pres); pres.connect(low); low.connect(level);
  // the stand-in (before the loops arrive): a V8-ish bark made of two saws a fifth below and the firing note
  const synth = { g: M.gain(0, mix), o: [M.osc('sawtooth', 50), M.osc('sawtooth', 25), M.osc('square', 50)], lp: M.filt('lowpass', 500, 2) };
  synth.o[2].detune.value = 8; for (const o of synth.o) { o.connect(synth.lp); o.start(); } synth.lp.connect(synth.g);
  let L = null;  // [{ src, g, fire }]
  const ready = loadLoops(ctx, list).then((bufs) => {
    if (stopped) return false;
    const t = now() + 0.01;
    L = bufs.map((buf, i) => {
      const meta = list[i], src = ctx.createBufferSource(), g = M.gain(0, mix);
      // the loop is in the file twice: play one copy's length from a quarter of the way in (clear of the encoder's edges)
      src.buffer = buf; src.loop = true; src.loopStart = meta.secs * 0.5; src.loopEnd = meta.secs * 1.5;
      src.connect(g); src.start(t, meta.secs * (0.5 + Math.random() * 0.9));
      return { src, g, fire: meta.fire };
    });
    ramp(synth.g.gain, 0, 0.05);
    for (const o of synth.o) try { o.stop(now() + 0.3); } catch {}
    return true;
  }).catch((e) => { console.warn('[audio] engine loops:', e); return false; });

  // the gearbox and the engine's state
  const S = { gear: 1, rpm: IDLE, target: IDLE, load: 0, cut: 0, shiftT: 0, hold: 0, blip: 0, lim: 0, limT: 0, overrun: 0, popT: 0, acc: 0, lastV: null, stuck: 0, rev: false, kick: false, mute: false, revT: 0, catchT: 0, steady: 0, tip: 0, prevGas: 0 };
  const gearRpm = (v, g) => (v / (g === 'R' ? REV : GEARS[g - 1])) * 1000;

  function pop(k = 1, big = false, delay = 0) {
    if (S.mute) return;
    const t = now() + 0.002 + delay;
    // a crack of bright noise, a dull thump under it
    M.burst(level, { t, dur: big ? 0.06 : 0.025 + Math.random() * 0.03, type: 'bandpass', f0: big ? 900 : 1300 + Math.random() * 1600, f1: 500, q: 0.9, peak: (big ? 0.9 : 0.45) * k, a: 0.001 });
    M.tone(level, { t, f0: big ? 95 : 120 + Math.random() * 60, f1: 45, dur: big ? 0.09 : 0.05, peak: (big ? 0.55 : 0.25) * k, type: 'sine', a: 0.002 });
  }

  // s: { v (m/s, signed), throttle -1..1, boost, on }
  function update(dt, s) {
    const vs = s.speed || 0, v = Math.abs(vs), th = s.throttle || 0;
    const fwd = vs >= -0.3 ? 1 : -1;
    // gas: pressing the way it goes (or pulling away either way); braking: pressing against it
    const gas = th > 0 ? (fwd > 0 ? th : 0) : th < 0 ? (fwd < 0 || v < 0.3 ? -th : 0) : 0;
    const braking = th !== 0 && gas === 0 && v > 0.5;
    S.mute = !!s.mute; if (S.mute) S.overrun = 0;
    // (made at speed: straight into the gear a cruise would have it in)
    if (S.lastV == null) {
      S.lastV = v;
      if (v > 0.5 && fwd > 0) { let g = 1; while (g < GEARS.length && gearRpm(v, g) > (gas > 0 ? 5200 : 4000)) g++; S.gear = g; S.rpm = Math.max(IDLE, gearRpm(v, g)); }
    }
    // the catch: a blip of the throttle a moment after it fires
    if (S.revT > 0 && (S.revT -= dt) <= 0) S.catchT = 0.55;
    S.catchT = Math.max(0, S.catchT - dt);
    S.acc += (((v - S.lastV) / Math.max(1e-3, dt)) - S.acc) * Math.min(1, dt * 8); S.lastV = v;
    const hard = gas > 0.5 && S.acc > 3;
    // the throttle going in (its first moments bark whatever the car does next); held on with the car no longer
    // gathering speed (at its top speed): steady
    S.tip = gas > 0.5 && S.prevGas <= 0.3 ? 0.35 : Math.max(0, S.tip - dt);
    S.steady = gas > 0.3 && Math.abs(S.acc) < 1.5 && v > 19 ? S.steady + dt : 0;
    S.shiftT -= dt; S.cut = Math.max(0, S.cut - dt); S.blip = Math.max(0, S.blip - dt);
    S.rev = vs < -0.3 || (th < 0 && v < 0.3);

    // the automatic
    if (S.rev) S.gear = 'R';
    else if (S.gear === 'R') S.gear = 1;
    else if (S.shiftT <= 0 && v > 0.5) {
      const r = gearRpm(v, S.gear);
      const upAt = hard ? 7600 : gas > 0 ? 5200 : 7800;
      if (S.gear < GEARS.length && r > upAt && gearRpm(v, S.gear + 1) > 1700) {
        S.gear++; S.shiftT = 0.28;
        // flat out, the shift cuts the ignition for a moment: the note drops, a pop or two as the next gear takes it
        if (hard || (gas > 0.5 && r > 6500)) { S.cut = 0.075; pop(0.6 + 0.4 * gas, r > 6500 && Math.random() < 0.6); if (Math.random() < 0.5) pop(0.5, false, 0.045); }
      } else if (S.gear === OD - 1 && S.steady > 0.6) {
        // a steady speed: up into the overdrive, quietly (no cut, no pops), the revs settling to a cruise's
        S.gear = OD; S.shiftT = 0.35;
      } else if (S.gear > 1) {
        // down, straight to the gear it wants (a twin-clutch skips gears): coasting or braking under 2600, to the
        // tallest gear that keeps it over 2900, with a blip to match the revs; the throttle in hard under 3600 (a
        // kick-down: as it goes in, or the car gathering speed again, the boost lit) to the lowest gear that keeps it
        // under 5600. (Held flat at its top speed in the overdrive it stays there: nothing more to pull for)
        let g = S.gear;
        if (gas < 0.3 && r < 2600) { g = 1; for (let k = S.gear - 1; k >= 1; k--) if (gearRpm(v, k) >= 2900) { g = Math.min(OD - 1, k); break; } if (gearRpm(v, g) > 6000) g = Math.min(S.gear, g + 1); }
        else if (gas > 0.5 && r < 3600 && (S.tip > 0 || S.acc > 1.5)) { for (let k = 1; k < S.gear; k++) if (gearRpm(v, k) <= 5600) { g = k; break; } }
        if (g < S.gear) {
          S.gear = g; S.shiftT = 0.18;
          if (gas < 0.3) { S.blip = 0.16; if (braking && gearRpm(v, g) > 3200 && Math.random() < 0.55) pop(0.5); }
        }
      }
    }
    if (v < 0.5 && S.gear !== 'R') S.gear = 1;

    // the engine speed it wants
    let target = Math.max(IDLE, gearRpm(v, S.gear));
    if (S.gear === 1 && gas > 0) {
      // a launch: the clutch slips, the revs hang near the launch rpm and the car catches up
      const k = Math.sqrt(Math.max(0, 1 - v / 8));
      target = Math.max(target, target + (LAUNCH + 900 * gas - target) * k * gas);
    }
    // flat out against something: wheelspin up to the limiter
    S.stuck = gas > 0.5 && v < 3 && S.acc < 1 ? S.stuck + dt : 0;
    if (S.stuck > 0.5) target = REDLINE + 600;
    if (S.blip > 0) target += 900 * (S.blip / 0.16);
    if (S.catchT > 0) target += (v < 8 ? 2600 : 1300) * Math.sin(Math.PI * Math.min(1, (0.55 - S.catchT) / 0.45));
    if (S.cut > 0) target -= 250;
    // in gear the engine is tied to the wheels: it follows fast; free (launch, blip, spin) it swings a little slower
    const free = S.stuck > 0.5 || S.blip > 0 || S.catchT > 0 || (S.gear === 1 && v < 8);
    const rate = target > S.rpm ? (free ? 9000 : 16000) : (S.shiftT > 0.15 ? 14000 : free ? 7000 : 20000);
    S.rpm += Math.max(-rate * dt, Math.min(rate * dt, target - S.rpm));
    // the limiter: past the red line the ignition cuts and the revs bounce
    S.lim = 0;
    if (S.rpm >= REDLINE - 30 && (target > REDLINE || S.rev)) {
      S.limT += dt;
      const ph = (S.limT * 9) % 1;   // nine bounces a second
      S.rpm = REDLINE - 420 * ph; S.lim = ph < 0.35 ? 1 : 0;
    } else S.limT = 0;
    S.rpm = Math.max(IDLE * 0.9, Math.min(REDLINE + 50, S.rpm));

    // the load: on the throttle as hard as the car is pulling (full from about 7 m/s² up, a fifth of it held at a
    // steady speed; full for the throttle's first moments), the blip's stab of it; off in the cut and the limiter's
    // bounces. Settling at a steady speed it eases off over a beat; lifting, at once
    const pull = S.tip > 0 ? 1 : Math.min(1, Math.max(0.2, 0.2 + S.acc / 9));
    const want = S.cut > 0 || S.lim ? 0 : Math.max(gas * pull, S.blip > 0 ? 0.6 : 0, S.catchT > 0.2 ? 0.85 : 0, S.stuck > 0.5 ? 1 : 0);
    S.load += (want - S.load) * Math.min(1, dt / (want > S.load ? 0.04 : gas > 0.3 && !S.cut && !S.lim ? 0.4 : 0.09));

    // overrun: lifting crackles for a second or so (more the higher the revs; from the overdrive's cruise too)
    if (gas < 0.1 && S.rpm > 2800 && S.prevGas > 0.5) S.overrun = Math.min(1.6, Math.max(0.6, 0.7 + (S.rpm - 3200) / 3000));
    S.prevGas = gas;
    S.overrun = Math.max(0, S.overrun - dt);
    if (S.overrun > 0 && gas < 0.1 && S.rpm > 1500) {
      S.popT -= dt;
      if (S.popT <= 0) { S.popT = 0.035 + Math.random() * 0.13 * (1.8 - S.overrun); if (Math.random() < 0.5 + 0.3 * S.overrun) pop(0.25 + 0.45 * Math.min(1, S.overrun), Math.random() < 0.08); }
    }
    voice(s.on === false ? 0 : 1);
    return S;
  }

  function voice(on) {
    const rpm = S.rpm, fire = rpm / 15, ld = S.load, r01 = Math.min(1, (rpm - IDLE) / (REDLINE - IDLE));
    if (L) {
      // the two loops either side of this pitch, equal-power crossfaded in log pitch
      let i = 0; while (i < L.length - 2 && fire > L[i + 1].fire) i++;
      const a = L[i], b = L[i + 1];
      const u = Math.max(0, Math.min(1, Math.log(fire / a.fire) / Math.log(b.fire / a.fire)));
      for (let j = 0; j < L.length; j++) {
        const x = L[j], w = j === i ? Math.cos(u * Math.PI / 2) : j === i + 1 ? Math.sin(u * Math.PI / 2) : 0;
        ramp(x.g.gain, w, 0.02);
        if (w > 0 || j === i - 1 || j === i + 2) ramp(x.src.playbackRate, Math.max(0.35, Math.min(2.4, fire / x.fire)), 0.012);
      }
    } else {
      const f = Math.max(30, fire);
      ramp(synth.o[0].frequency, f, 0.012); ramp(synth.o[1].frequency, f / 2, 0.012); ramp(synth.o[2].frequency, f, 0.012);
      ramp(synth.lp.frequency, 300 + f * 2 + ld * 1400, 0.02); ramp(synth.g.gain, 0.22, 0.05);
    }
    // on load: open, driven and present; off it: darker and lower. Louder as it revs.
    ramp(lp.frequency, 900 + 1800 * r01 + ld * (5200 + 4000 * r01), 0.03);
    ramp(pres.gain, ld * 5, 0.04);
    ramp(wet.gain, 0.15 + 0.5 * ld, 0.04); ramp(dry.gain, 0.85 - 0.4 * ld, 0.04);
    ramp(level.gain, on * (0.5 + 0.45 * r01) * (0.5 + 0.5 * ld) * (S.lim ? 0.55 : 1), S.lim ? 0.006 : 0.025);
  }

  function stop(t = now()) {
    stopped = true;
    if (L) for (const x of L) try { x.src.stop(t + 0.05); } catch {}
    for (const o of synth.o) try { o.stop(t + 0.05); } catch {}
    if (M.live) setTimeout(() => { try { level.disconnect(); } catch {} }, 300);
  }
  return { update, ready, stop, rev(delay = 0.1) { S.revT = Math.max(0.001, delay); }, state: S, get loaded() { return !!L; } };
}
