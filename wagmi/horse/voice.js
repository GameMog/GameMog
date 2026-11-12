// Mog City: Ranger's voice, from the library's horse pack (sounds-horse: CC0 recordings of real horses from Freesound,
// assets/CREDITS.md), through the game's mixer and placed at its head, so it pans, fades with distance and dips under
// the story's lines (the sfx bus is ducked under them). What it says and when:
//   nicker   a soft greeting: as he goes to mount, when it is brought to him (W.horse.give), when he walks up to it
//   snort    as it sets off from a stand; a buck's effort
//   blow     the long flutter of the lips as it comes to a stop after a run
//   neigh    a big creature's roar near it (fear)
// Nothing while it stands, walks, gallops or jumps (owner, 12 Nov: only when it starts and stops).
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
  let moving = false, ran = 0;
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
    wasAir = !!s.air;

    // hit: the fight's hp for him dropping while he is up there, a squeal (a heavy one, the scream)
    if (s.hp != null) {
      if (lastHp != null && s.hp < lastHp - 0.5 && s.mounted) hurt(lastHp - s.hp >= 15 || s.hp <= 0);
      lastHp = s.hp;
    }

    // moving off and pulling up, and nothing in between (owner, 12 Nov: no constant noise): a snort as it sets off
    // from a stand, a blow as it comes to a stop after a real run
    const sp = Math.abs(s.speed || 0);
    if (!s.mounted) { moving = false; ran = 0; }
    else if (!moving && sp > 3) { moving = true; ran = 0; say('snort', { vol: 0.6, gap: 4, rate: rnd(0.94, 1.02) }); }
    else if (moving) { ran += dt; if (sp < 0.4) { moving = false; if (ran > 2.5) say('blow', { vol: 0.65, gap: 4 }); } }
  }
  function hurt(heavy = false) {
    if (heavy) return say('scream', { vol: 0.95, gap: 2.5, force: true }) || say('pain', { vol: 0.9, gap: 0.9, force: true });
    return say('pain', { vol: 0.85, gap: 0.9, force: true, rate: rnd(0.95, 1.08) });
  }
  return { update, fear, greet, hurt, say, count };
}
