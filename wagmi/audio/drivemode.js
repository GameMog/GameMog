// Mog City: how Dan's car drives: 'engine' (the V8, the default) or 'electric' (ALL ELECTRIC: the quiet mode, no
// exhaust). The game's side of it, put on WAGMI as soon as the game is up (wagmi/game.js, which also binds Q at the
// wheel to toggleDriveMode and shows the mode in a badge in the speed panel; even with ?noaudio):
//   WAGMI.car.driveMode                      'engine' | 'electric' (setting it switches too)
//   WAGMI.setDriveMode(mode, { cue })        -> the mode now (an unknown mode changes nothing; cue: false switches
//                                               without the cue, e.g. a scene setting it quietly)
//   WAGMI.toggleDriveMode()                  -> the mode now
//   addEventListener('wagmi:drivemode', (e) => e.detail)   { mode, prev } on each change (the game has no event bus)
// Remembered in localStorage 'wagmi.drivemode'. The car's sound (playercar.js) follows it on its next frame: the two
// crossfade over 0.4 s with a cue for each way (a contactor's click and a soft chime going electric; the starter, the
// engine catching and a blip of the throttle going back).
const KEY = 'wagmi.drivemode', MODES = ['engine', 'electric'];
const read = () => { try { const v = localStorage.getItem(KEY); return MODES.includes(v) ? v : 'engine'; } catch { return 'engine'; } };

// n counts the changes (the sound compares it each frame); cue: whether the last change wants its cue heard
export const drive = { mode: read(), prev: null, cue: true, n: 0 };

export function setDriveMode(mode, o = {}) {
  if (!MODES.includes(mode) || mode === drive.mode) return drive.mode;
  drive.prev = drive.mode; drive.mode = mode; drive.cue = o.cue !== false; drive.n++;
  if (o.save !== false) try { localStorage.setItem(KEY, mode); } catch {}
  try { dispatchEvent(new CustomEvent('wagmi:drivemode', { detail: { mode, prev: drive.prev } })); } catch {}
  return mode;
}
export const toggleDriveMode = (o) => setDriveMode(drive.mode === 'electric' ? 'engine' : 'electric', o);

export function installDriveMode(W) {
  if (!W || W.setDriveMode) return;
  W.setDriveMode = (mode, o) => setDriveMode(mode, o);
  W.toggleDriveMode = (o) => toggleDriveMode(o);
  if (W.car && !Object.getOwnPropertyDescriptor(W.car, 'driveMode')) {
    Object.defineProperty(W.car, 'driveMode', { get: () => drive.mode, set: (m) => { setDriveMode(m); }, enumerable: true, configurable: true });
  }
}
// (the game is up before the sound is imported: WAGMI and its car are there already)
if (typeof window !== 'undefined' && window.WAGMI) installDriveMode(window.WAGMI);
