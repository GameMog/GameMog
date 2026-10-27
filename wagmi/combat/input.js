// Mog City: the fight's buttons, read while Dan is on foot (a GTA / Arkham mix, keyboard first, the mouse too):
//   LMB or J  strike (the light combo; at a man on the ground, nothing: the heavy finishes him)
//   RMB or K  heavy (a kick or an uppercut; the takedown when the combo meter is full; at a man on the ground, the finisher)
//   Q or L    counter (while a man's cue shows over his head)
//   C         dodge (a roll, or a back flip away); Space dodges too while fighting (it jumps otherwise)
//   E         grab (a dazed man: lift him and slam him), pick up a bat, a bottle or a trash can, throw what he holds
// Presses are buffered for a moment of fight time (slow motion stretches the buffer with the action), and counted (n:
// how many of a key so far, so a move can tell a beat from a mash).
// In a fight the mouse looks round GTA style: the first click locks the pointer to the view, so moving it turns the
// camera with no button held and a click is only ever a blow (no more punches thrown by a drag to look round). Esc
// lets it go; so does the end of the fight.
const BUFFER = 0.4;
const KEYS = { KeyJ: 'strike', KeyK: 'heavy', KeyQ: 'counter', KeyL: 'counter', KeyC: 'dodge', KeyE: 'grab' };
export const ACTIONS = ['strike', 'heavy', 'counter', 'dodge', 'grab'];

export function createInput({ canvas, live, fighting, near, now, look }) {
  const pressed = new Map(), count = {};
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable;
  const press = (k) => { pressed.set(k, now()); count[k] = (count[k] || 0) + 1; };
  addEventListener('keydown', (e) => {
    if (e.repeat || typing(e) || e.ctrlKey || e.metaKey || e.altKey || !live()) return;
    const k = KEYS[e.code] || (e.code === 'Space' && fighting() ? 'dodge' : null);
    if (k) press(k);
  });
  // (pointer events: the camera's drag takes the pointer down and with it the mouse events; a drag still orbits. The
  // mouse only fights with a man near: away from a fight a drag is just a look round, not a punch at the air)
  addEventListener('pointerdown', (e) => {
    // (the pointer locked: the click is the fight's alone; the camera's drag can't take a locked pointer)
    if (e.target === canvas && document.pointerLockElement === canvas) e.stopPropagation();
    if (e.target !== canvas || e.pointerType === 'touch' || !live() || !(fighting() || near())) return;
    if (e.button === 0) press('strike');
    else if (e.button === 2) press('heavy');
    if (fighting() && document.pointerLockElement !== canvas && e.pointerType === 'mouse') wantLock = true;
  }, true);
  // (the lock is asked for once the click is over, so the camera's own drag has let go of the pointer first)
  let wantLock = false;
  addEventListener('pointerup', () => {
    if (!wantLock) return; wantLock = false;
    setTimeout(() => { if (!fighting() || document.pointerLockElement === canvas) return; try { const r = canvas.requestPointerLock?.(); if (r && r.catch) r.catch(() => {}); } catch (err) { /* (not allowed here: the drag still looks round) */ } }, 0);
  }, true);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas && look) look(e.movementX || 0, e.movementY || 0); });
  const locked = () => document.pointerLockElement === canvas;
  return {
    locked,
    release() { if (locked()) document.exitPointerLock?.(); },
    press, // (also the debug API's)
    has(k) { const t = pressed.get(k); if (t == null) return false; if (now() - t > BUFFER) { pressed.delete(k); return false; } return true; },
    take(k) { const ok = this.has(k); pressed.delete(k); return ok; },
    n(k) { return count[k] || 0; },
    clear() { pressed.clear(); },
  };
}
