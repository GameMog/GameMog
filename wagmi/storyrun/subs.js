// Mog City story runner: whose subtitle is on the screen. A line said with say() (runner.js) leaves its subtitle up
// into the hand-over and takes it down 450 ms after it ends if nothing followed it. "Nothing followed it" used to mean
// no other say() line: a cutscene's, a video call's or a car-phone call's lines go up through ui.sub directly, so a
// line still running from an earlier step took down the next scene's line. Jensen Heist's ST-8: Marge's wait:false
// line from s5 ended 0.9 s into st1 and cleared Mr. Board's "Good evening, San Jose..." while his voice played on
// with no words (the RC playtest, B4, 20 Nov). Now a line takes down only its own subtitle: the words on screen are
// still its words.
//   ownsSub(el, text)  el: mission/ui.js's .wg-sub; true when it is up and shows text
export function ownsSub(el, text) {
  if (!el || el.classList?.contains('hide')) return false;
  const t = el.querySelector?.('.t');
  return !!t && t.textContent === String(text ?? '');
}

// a mission's end waits for its last line: a line still being said (a closer said with wait:false, a recorded voice
// still playing out) holds MISSION PASSED until it ends, PASS_HOLD s at most; a fail still cuts it, as it should.
// Jensen Heist's PH-1 closer was up for 39 ms under the card, BT-3's last line 173 ms of its 4 s (the RC playtest, B5)
//   lineBusy(saying, left)   saying: the runner's lines in progress; left: s of recorded voice still to play
export const PASS_HOLD = 8;
export const lineBusy = (saying, left) => (saying || 0) > 0 || (+left || 0) > 0.08;
