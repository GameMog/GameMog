// Mog City story runner: the bodies a mission's next scenes need, built while a transition card is up. A cast body's
// first use (its GLB read, its skin and surfaces finished for the close lens, its textures and pipelines on the GPU)
// cost a 160-300 ms frame at a cutscene's or a call's start, 659 ms at ST-8's h1 call (the RC playtest, P12). Built
// under the card instead, where the screen is dark and nothing moves (ST-8's h1 call open 1.8 s after its card, not
// 14.7 s, its worst frame 183 ms, not 382).
//   warmList(steps, from, { castName, heroName, max }) -> names   who the steps from `from` up to the next transition
//                                                                 (at most `look` steps) put on screen: a video call's
//                                                                 people, a cutscene set's, a car-phone call's caller
//                                                                 on video; the hero as heroName (his double)
export function warmList(steps, from, { castName = (w) => w, heroName = '', max = 6, look = 4 } = {}) {
  const out = [], seen = new Set();
  const add = (w) => {
    if (!w || out.length >= max) return;
    const n = w === 'player' ? heroName : castName(w) || w;
    if (!n || seen.has(n)) return; seen.add(n); out.push(n);
  };
  const visit = (s) => {
    if (!s || typeof s !== 'object') return;
    if (s.type === 'vcall') for (const p of s.people || []) add(p && p.who);
    if (s.type === 'cutscene' && s.set && typeof s.set === 'object') for (const p of s.set.people || []) add(p && p.who);
    if (s.type === 'call' && s.video) add(s.who);
    for (const x of s.during || []) visit(x);
  };
  for (let i = Math.max(0, from), n = 0; i < (steps || []).length && n < look; i++, n++) {
    const s = steps[i];
    if (n > 0 && s && s.type === 'transition') break;
    visit(s);
  }
  return out;
}

// the calls on the car's screen (a call step's `video`, on its own or in a drive's, a tail's or a chase's `during`) from
// `from` up to the next transition: { who, video }, each caller and office once. Their offices are built and compiled
// for the call's tile while the card is up (runner.js prewarm(), sets.js pool()): built when the call rang instead, mid-
// drive, they held a 180-400 ms frame on the street (PH-1's Wesley Trout at 8.6 m/s, SS-5's Mr. Board in the chase,
// the RC review). The caller is the far end of the line: a call the hero makes shows the first other speaker
export function feedList(steps, from, { castName = (w) => w, heroName = '', max = 4 } = {}) {
  const out = [], seen = new Set();
  const present = new Set((steps || []).filter((s) => s && ['npc', 'passenger', 'ally'].includes(s.type)).map((s) => castName(s.who) || s.who).filter(Boolean));
  const whoOf = (l) => (Array.isArray(l) ? l[0] : l && l.who);
  const visit = (s) => {
    if (!s || typeof s !== 'object') return;
    if (s.type === 'call' && s.video && out.length < max) {
      const me = castName(s.who) || s.who;
      const who = me === heroName ? (s.lines || []).map((l) => castName(whoOf(l)) || whoOf(l)).find((w) => w && w !== heroName) : me;
      const office = typeof s.video === 'object' ? s.video.office || '' : '';
      const k = who + '|' + office;
      if (who && who !== heroName && !seen.has(k)) { seen.add(k); out.push({ who, video: s.video }); }
    }
    // (a live video call (vcall live: true, vcall.js playLive): each person on it not the hero, in their office; never
    // one the mission stands on the street (an npc, a passenger, an ally: Jay in the passenger seat on WW-6's a6): an
    // office pooled for him took his body off the street, and the reunion's shots on him looked under the ground)
    if (s.type === 'vcall' && s.live) for (const p of s.people || []) {
      if (out.length >= max) break;
      const who = castName(p && p.who) || (p && p.who); if (!who || p.who === 'player' || who === heroName || present.has(who)) continue;
      const lt = p.light || s.time || null, video = { office: p.office || 'exec', ...(lt ? { light: lt } : {}) }, k = who + '|' + video.office;
      if (!seen.has(k)) { seen.add(k); out.push({ who, video }); }
    }
    for (const x of s.during || []) visit(x);
  };
  for (let i = Math.max(0, from); i < (steps || []).length; i++) {
    const s = steps[i];
    if (i > from && s && s.type === 'transition') break;
    visit(s);
  }
  return out;
}
// a call office's key in the pool (sets.js pool()): its room, its light, its people
export const feedKey = (def) => 'pool:' + [def && def.room, (def && def.light) || '', ...((def && def.people) || []).map((p) => p && p.who)].join(':');
