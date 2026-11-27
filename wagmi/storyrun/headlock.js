// Mog City story runner: a set's close-up kept on the face it is on. A close in a set is written relative to its
// person's head ({ rel: <who>, right, up, fwd } for the lens, { rel: <who> } for the look: sets.js point) and worked
// out once, as the shot starts. If the head read then is not where the body is drawn (a pose cut in that frame, a body
// standing or sitting at the wrong height), the close frames a belt or the wall over them for the whole shot: Jensen's
// ST4 closes, 19 Nov. So each frame the lens and its look are moved by how far their head is from where it was read,
// eased, the way an operator holds a face: a head that bobs a little (a cheer, a laugh) is left to move in the frame,
// one that is off by more is followed in a fraction of a second, and the first frame is put right at once.
//   const lock = closeLock(sc, scL, A, LA)   null unless the shot is a close on someone's face
//   lock.step(head, dt) -> [dx, dy, dz]       this frame's move for the lens and the look (head: their head now)

// (a close: the look is the person's own head, no offset, and the lens within CLOSE m of it)
export const CLOSE = 3;
// (a head within DEAD m of where it is held is left to move in the frame; past that it is followed with a time constant
// of TAU s)
export const DEAD = 0.06;
export const TAU = 0.35;

const isRel = (r) => !!r && typeof r === 'object' && !Array.isArray(r) && typeof r.rel === 'string' && !!r.rel;
const bare = (r) => !(+r.right || +r.up || +r.fwd);

export function isClose(sc, scL, A, LA) {
  if (!isRel(sc) || !isRel(scL) || sc.rel !== scL.rel || !bare(scL)) return false;
  if (!Array.isArray(A) || !Array.isArray(LA)) return false;
  return Math.hypot(A[0] - LA[0], A[1] - LA[1], A[2] - LA[2]) <= CLOSE;
}

export function closeLock(sc, scL, A, LA) {
  if (!isClose(sc, scL, A, LA)) return null;
  const at = LA.slice(0, 3);
  let held = null;
  return {
    who: sc.rel,
    // (their head now, and the seconds since the last frame: the move to add to the lens and its look)
    step(head, dt) {
      if (!Array.isArray(head) || head.some((v) => !Number.isFinite(v))) return held ? held.map((v, i) => v - at[i]) : [0, 0, 0];
      if (!held) {
        // (the first frame: wherever the head is drawn, the lens is put on it, unseen, as the shot cuts in)
        held = head.slice(0, 3);
      } else {
        const k = 1 - Math.exp(-Math.max(0, dt) / TAU);
        for (let i = 0; i < 3; i++) {
          const d = head[i] - held[i], over = Math.sign(d) * Math.max(0, Math.abs(d) - DEAD);
          held[i] += over * k;
        }
      }
      return held.map((v, i) => v - at[i]);
    },
  };
}
