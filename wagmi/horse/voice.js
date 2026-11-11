// Mog City: Ranger's voice, from the library's horse pack (sounds-horse: CC0 recordings of real horses from Freesound,
// assets/CREDITS.md), through the game's mixer and placed at its head, so it pans, fades with distance and dips under
// the story's lines (the sfx bus is ducked under them). What it says and when:
//   nicker   a soft greeting: as he goes to mount, when it is brought to him (W.horse.give), when he walks up to it
//   snort    standing (now and then, never back to back), and the odd one at a walk; a buck's effort; some jumps' take-off
//   blow     the long flutter of the lips: standing, and once when it pulls up out of a long gallop
//   breath   at a gallop one breath a stride (a horse breathes in step with its gallop), louder the longer it runs
//   neigh    a jump's take-off now and then; a big creature's roar near it (fear)
//   whinny   a creature's roar near it (fear)
//   scream   a rear; a heavy blow
//   pain     when it is hit (the blows that reach him up there, the crew's bangs on it)
// Each with its own cooldown, one voice line at a time (breaths aside), a little random pitch.
//   const V = createVoice(W)   // V.update(dt, s) every frame (wagmi/audio/index.js); V.fear(pos, big), V.greet(),
//                              // V.count { nicker, snort, ... } (how many of each have played, for tests)
export const PACK = 'sounds-horse';
const S = (g) => `pack:${PACK}/${g}`;
const rnd = (a, b) => a + Math.random() * (b - a);
// (about how long each group's sounds run, s: the next line waits for it)
const LEN = { nicker: 0.8, snort: 0.6, blow: 0.8, breath: 0, neigh: 2.3, whinny: 1.5, scream: 1.8, pain: 0.85 };

export function createVoice(W) {
  const count = { nicker: 0, snort: 0, blow: 0, breath: 0, neigh: 0, whinny: 0, scream: 0, pain: 0 };
  const cd = {};                 // group -> time it may play again
  let t = 0, lineUntil = 0;      // (one voice line at a time: when the one in hand ends)
  let idleT = rnd(6, 12), walkT = rnd(15, 30), exert = 0, lastPh = 0, strides = 0, galloped = 0, blowAfter = -1;
  let wasMounted = false, wasPhase = null, wasAir = false, wasOne = null, lastHp = null, nickerAt = -99, nearWas = false;
  const head = (c) => { const h = c.heading || 0; return [c.position.x + Math.sin(h) * 1.15, c.position.y + 1.85, c.position.z + Math.cos(h) * 1.15]; };

  // a line: its group, how loud, its cooldown (s), its pitch; `force` plays over the one in hand (a scream, a squeal)
  function say(group, { vol = 0.8, gap = 3, rate = rnd(0.95, 1.05), force = false, delay = 0, pos = null } = {}) {
    const c = W.car; if (!c || !W.audio?.play) return false;
    if ((cd[group] || 0) > t) return false;
    if (!force && lineUntil > t && group !== 'breath') return false;
    const h = W.audio.play(S(group), { pos: pos || head(c), vol, rate, delay, ref: 9, verb: 0.3 });
    if (!h) return false;
    count[group]++; cd[group] = t + gap;
    if (group !== 'breath') lineUntil = t + delay + (LEN[group] || 0.6) / rate;
    return true;
  }

  // a big creature's roar near it: it shies (a whinny, a neigh at a boss's; a scream close to a boss)
  function fear(pos, big = false) {
    const c = W.car; if (!c || !pos) return false;
    const d = Math.hypot(pos[0] - c.position.x, pos[2] - c.position.z);
    if (d > (big ? 70 : 45)) return false;
    const g = big && d < 18 && Math.random() < 0.5 ? 'scream' : big ? 'neigh' : 'whinny';
    if ((cd.fear || 0) > t) return false;
    cd.fear = t + 7;
    return say(g, { vol: 0.9, gap: 4, delay: rnd(0.3, 0.7), force: true });
  }
  function greet() { if (t - nickerAt < 6) return false; const ok = say('nicker', { vol: 0.75, gap: 5, rate: rnd(0.96, 1.04), delay: 0.25 }); if (ok) nickerAt = t; return ok; }

  // s: { mounted, phase (W.ride.phase), gait, speed, air, one (its one-shot), rs, hp (the fight's hp for him), near (him
  // on foot, m from it) }
  function update(dt, s) {
    t += dt;
    // mounting: the greeting as he goes to it (or, a quick mount, as he lands in the saddle)
    const going = s.phase === 'walk' || s.phase === 'in';
    if (going && wasPhase !== s.phase && !s.mounted && wasPhase !== 'walk') greet();
    if (s.mounted && !wasMounted) greet();
    wasPhase = s.phase; wasMounted = s.mounted;
    // him walking up to it, on foot: a nicker, now and then
    const near = !s.mounted && !going && s.near != null && s.near < 4.5;
    if (near && !nearWas && t - nickerAt > 40) greet();
    nearWas = near;

    // the one-shots: a rear screams; a buck's effort, a snort
    const one = s.one || null;
    if (one !== wasOne) {
      if (one === 'rear') say('scream', { vol: 0.95, gap: 3, force: true });
      else if (one === 'buck' && Math.random() < 0.6) say('snort', { vol: 0.75, gap: 1.5, force: true, rate: rnd(0.9, 1.0) });
    }
    wasOne = one;
    // a jump's take-off: now and then a neigh, more often a snort of effort
    if (s.air && !wasAir) {
      const r = Math.random();
      if (r < 0.3) say('neigh', { vol: 0.75, gap: 8, rate: rnd(0.98, 1.08) });
      else if (r < 0.75) say('snort', { vol: 0.65, gap: 1.2, rate: rnd(0.92, 1.02) });
    }
    wasAir = !!s.air;

    // hit: the fight's hp for him dropping while he is up there, a squeal (a heavy one, the scream)
    if (s.hp != null) {
      if (lastHp != null && s.hp < lastHp - 0.5 && s.mounted) hurt(lastHp - s.hp >= 15 || s.hp <= 0);
      lastHp = s.hp;
    }

    // breathing: at a gallop a breath on every stride, louder as it tires; it rests off slowly
    const sp = Math.abs(s.speed || 0), gallop = s.gait === 'gallop';
    exert = gallop ? Math.min(1, exert + dt / 9) : Math.max(0, exert - dt / (sp < 0.3 ? 14 : 25));
    if (gallop) galloped += dt; else if (sp < 2.5) { if (galloped > 6 && blowAfter < 0) blowAfter = t + rnd(0.6, 1.2); galloped = 0; }
    const ph = s.rs?.phase?.('gallop');
    if (gallop && ph != null) {
      if (ph < lastPh - 0.5) { strides++; say('breath', { vol: 0.16 + 0.34 * exert, gap: 0.2, rate: rnd(0.96, 1.04) * (1 + 0.04 * exert) }); }
      lastPh = ph;
    } else if (s.gait === 'trot' && exert > 0.45) {
      // (trotting on after a long gallop: a breath every other stride, softer)
      const pt = s.rs?.phase?.('trot');
      if (pt != null) { if (pt < lastPh - 0.5 && ++strides % 2 === 0) say('breath', { vol: 0.1 + 0.18 * exert, gap: 0.3, rate: rnd(0.9, 0.98) }); lastPh = pt; }
    } else lastPh = 0;
    if (blowAfter > 0 && t > blowAfter) { blowAfter = -1; say('blow', { vol: 0.7, gap: 4 }); idleT = rnd(6, 12); }

    // standing: a snort or a blow, now and then (not while it breathes hard); at a walk the odd snort
    if (sp < 0.3 && !one) {
      idleT -= dt;
      if (idleT <= 0) { idleT = rnd(11, 26); Math.random() < 0.6 ? say('snort', { vol: rnd(0.4, 0.55), gap: 4 }) : say('blow', { vol: rnd(0.4, 0.55), gap: 6 }); }
    } else if (s.gait === 'walk') {
      walkT -= dt;
      if (walkT <= 0) { walkT = rnd(16, 34); say('snort', { vol: rnd(0.35, 0.5), gap: 5 }); }
    }
  }
  function hurt(heavy = false) {
    if (heavy) return say('scream', { vol: 0.95, gap: 2.5, force: true }) || say('pain', { vol: 0.9, gap: 0.9, force: true });
    return say('pain', { vol: 0.85, gap: 0.9, force: true, rate: rnd(0.95, 1.08) });
  }
  return { update, fear, greet, hurt, say, count };
}
