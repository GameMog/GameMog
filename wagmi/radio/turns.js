// Mog City: turn timing, how one spoken line hands over to the next (every cutscene and mission say(), and the story
// runner's lines). The bar is Jane and Dan on the car phone: a reply lands the moment the line before it ends, a
// pause is something a writer chose, never a metronome.
//   beatOf(x)                  a line's beat from its tuple's 4th field: a number (an authored pause after it, as before)
//                              or { pause, pre, post, overlap, how } (all optional; anything else ignored)
//   gapAfter(a, b)             seconds of silence between line a ending and line b starting (D3/D4):
//                                a's authored pause                      as written (a reveal 0.8-1.2, the pivot 0.6-0.8)
//                                b overlaps (2 words or fewer, flagged)  -0.15: b starts before a has quite finished
//                                a trails off ('...' at its end)         0.05: b cuts in
//                                b is a quick reply (4 words or fewer, or the answer to a question)   0.12
//                                otherwise                               0.25
//                              plus a's post and b's pre (a leading '...' on b: a 0.3 s pre-beat)
//   holdOf(W, who, text)       how long a line is on screen before the next one's gap: its recording's length when it
//                              has one (no reading-time floor: "Alone-ish." is 0.7 s, not 1.4), else its reading time
//                              (15 characters a second, 1.4 s at least)
//   playTurns(W, lines, o)     says a list of { who, text, ...beat } in turn: o.show(L, i, secs) puts a line up (its
//                              subtitle: its voice plays from it) and may return a function called when it is done;
//                              o.hide() clears the last; o.sleep(ms) the scene's clock; o.dead() stops it. The subtitle
//                              of a line stays up through the gap after it, until the next one replaces it. The
//                              last line's own pause and post are kept too, its subtitle up through them (a scene's
//                              closing beat is written, not dropped), and held CLOSE (0.6 s) at least after its voice
//                              (holdOf's length), so the closing line lands before the scene cuts.
//                              A line whose recording is not decoded yet (a world's clip: its length is 0 until it is)
//                              waits for it, up to DECODE s, before it goes up, so it is held for its real length and the
//                              next line never cuts it; every line of the list starts decoding as the list starts.
//                              The first line in person takes a breath first (D5: W.voice.breath, about 0.2 s).
// A line flagged overlap tells the voices (W.voice.cue) to start it over the end of the one before instead of waiting
// for it; at most 1 in 6 lines may (the writer's rule), and only a reply of 2 words or fewer is honoured.
export const HOW = ['warm', 'tease', 'deadpan', 'urgent', 'angry', 'shout', 'scared', 'hushed', 'hesitant', 'sad', 'smug'];
export const GAP = { quick: 0.12, normal: 0.25, cut: 0.05, overlap: -0.15, trail: 0.3 };
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined);
export function beatOf(x) {
  if (typeof x === 'number' && Number.isFinite(x)) return { pause: Math.max(0, Math.min(3, x)) };
  if (!x || typeof x !== 'object' || Array.isArray(x)) return {};
  const o = {}, p = num(x.pause, 0, 3), pre = num(x.pre, 0, 1.2), post = num(x.post, 0, 1.2);
  if (p != null) o.pause = p; if (pre != null) o.pre = pre; if (post != null) o.post = post;
  if (x.overlap === true) o.overlap = true;
  if (HOW.includes(x.how)) o.how = x.how;
  return o;
}
const words = (t) => String(t || '').replace(/^\s*\.\.\.\s*/, '').split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
export const quick = (a, b) => words(b.text) <= 4 || /\?['"’]?\s*$/.test(String(a.text || '').trim());
export const canOverlap = (b) => !!b.overlap && words(b.text) <= 2;
export function preOf(b) { return (b.pre || 0) + (/^\s*\.\.\./.test(String(b.text || '')) && b.pre == null ? GAP.trail : 0); }
export function gapAfter(a, b) {
  if (!a || !b) return preOf(b || {});
  const tail = (a.post || 0) + preOf(b);
  if (a.pause != null) return a.pause + tail;
  if (canOverlap(b)) return GAP.overlap + tail;
  if (/\.\.\.['"’]?\s*$/.test(String(a.text || '').trim())) return GAP.cut + tail;
  return (quick(a, b) ? GAP.quick : GAP.normal) + tail;
}
export function readingTime(text) { return Math.max(1.4, String(text || '').length / 15); }
export function holdOf(W, who, text) {
  const rec = W?.voice?.dur?.(who, text) || 0;
  return rec > 0 ? rec : readingTime(text);
}
// (the longest a line waits for its recording to decode before it goes up anyway, on its reading time)
export const DECODE = 2.5;
// (the least a list's last line is held after its voice: holdOf's length, then CLOSE s)
export const CLOSE = 0.6;
const recorded = (W, L) => !!W?.voice?.has?.(L.who, L.text);
async function decoded(W, L) {
  if (!W?.voice?.decode || !recorded(W, L) || (W.voice.dur?.(L.who, L.text) || 0) > 0) return;
  let tm = null;
  try { await Promise.race([Promise.resolve(W.voice.decode(L.who, L.text)).catch(() => 0), new Promise((r) => { tm = setTimeout(r, DECODE * 1000); })]); }
  finally { clearTimeout(tm); }
}
export async function playTurns(W, lines, { show, hide, sleep, dead = () => false } = {}) {
  let prev = null, done = null;
  // (every line's recording decoding from the start, so none waits when its turn comes)
  for (const L of lines) if (recorded(W, L) && !((W.voice.dur?.(L.who, L.text) || 0) > 0)) Promise.resolve(W.voice.decode?.(L.who, L.text)).catch(() => {});
  try {
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      if (dead()) break;
      const g = gapAfter(prev, L);
      // (a negative gap was taken off the line before's hold: an overlap starts as it ends)
      if (g > 0) await sleep(g * 1000);
      if (dead()) break;
      await decoded(W, L);
      if (dead()) break;
      // (D5: the scene's first line in person, a breath before it; on a phone or with no recording, none)
      if (!prev) { const b = W?.voice?.breath?.(L.who, L.text) || 0; if (b > 0) { await sleep(b * 1000); if (dead()) break; } }
      done?.(); done = null;
      W?.voice?.cue?.({ overlap: canOverlap(L) && !!prev, cut: !!prev && /\.\.\.['"’]?\s*$/.test(String(prev.text || '').trim()), how: L.how || null });
      const secs = holdOf(W, L.who, L.text);
      done = show(L, i, secs) || null;
      const next = lines[i + 1], early = next ? Math.min(0, gapAfter(L, next)) : 0;
      await sleep(Math.max(0.05, secs + early) * 1000);
      prev = L;
    }
    // (the last line's own beat: its written pause and its post, the subtitle still up; CLOSE s at least, so a scene's
    // closing line is never cut the moment its voice ends: the review, round 3)
    if (prev && !dead()) { const tail = Math.max(CLOSE, (prev.pause || 0) + (prev.post || 0)); await sleep(tail * 1000); }
  } finally {
    done?.();
    hide?.();
  }
}
