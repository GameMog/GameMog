// Mog City (jh-rc, the owner 19 Nov): where the 'Hit and run' note (wagmi/street/index.js, top right) sits: at its own
// place, top px from the top, unless something else is up in that corner (a video call's tile on the car's screen,
// wagmi/storyrun/vcall.js .wg-vfeed.on): then just under the lowest of them that it would touch, GAP px clear, so the two
// never overlap. rects: the boxes up there ({ left, right, top, bottom }); note: the note's own box at its place.
// No DOM here (tests/street-tick.test.mjs).
export const TICK = { TOP: 96, GAP: 10 };
export function tickTop(note, rects, top = TICK.TOP, gap = TICK.GAP) {
  const h = Math.max(0, (note.bottom ?? top) - (note.top ?? top));
  let y = top;
  // (each box it would overlap, across and down, pushes it below that box; again until it is clear of all)
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const r of rects || []) {
      if (!r || !(r.bottom > r.top) || !(r.right > r.left)) continue;
      const across = note.left < r.right && note.right > r.left, down = y < r.bottom + gap && y + h > r.top - gap;
      if (across && down && y < r.bottom + gap) { y = Math.ceil(r.bottom + gap); moved = true; }
    }
    if (!moved) break;
  }
  return y;
}
