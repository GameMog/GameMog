// Mog City: fighting from Ranger's saddle. Live while he is up and riding (in the saddle, nothing getting him on or
// off, no scene, the pause or the map); the fight's own buttons otherwise listen only on foot (wagmi/combat/input.js):
//   J or a left click   with something in his hand (a bat, a bottle: he keeps what he held when he got up), a blow
//                       from the saddle at whichever flank has a man by it (his right if neither); bare-handed, the
//                       horse bucks
//   K or a right click  the horse bucks: its hind legs lash out behind it
// The blow is Dan's overhead 'smash' over his upper body, his torso turned to that flank (rider.js strike); where it
// lands (the clip's own contact), every man standing within reach of that flank is hit through the fight's own blows
// (wagmi/combat: playerHit: the hit-stop, the shake, the effects and the sound are the fight's), heavy, harder the
// faster the horse goes: one bat blow from a trotting horse puts a Suit down for good. A bat wears out as it does on
// foot (it snaps); a bottle breaks on the first. The buck lands at the clip's own moment (its hooves at a man's
// chest), on every man standing 0.9-3.4 m behind it. A click away from any man is a look round (the camera's drag),
// as on foot. While the horse bucks it stops where it is.
//   const sd = createSaddle(THREE, { W, rs, rider, drive })   // sd.take() / sd.giveBack() (his weapon, at mount and
//   dismount), sd.arm(kind) (one put in his hand up there), sd.swing(side), sd.buck(), sd.weapon (kind or null)
import { fist } from '../combat/items.js';

const REACH = { side: 2.7, front: 1.7, back: 1.1 };
const KICK = { near: 0.9, far: 3.4, wide: 1.3, dmg: 34 };

export function createSaddle(THREE, { W, rs, rider, drive }) {
  const app = W.app, cm = app.controllerManager, car = W.car, canvas = app.renderer?.domElement;
  const C = () => W.combat?.debug?.c || null;   // (the fight's own state: its hit and its hero's hands)
  const hit = (e, h) => (W.combat?.playerHit || C()?.playerHit)?.(e, h);
  const up = () => cm.activeMode === 'car' && rider.attached && !W.ride?.phase && !W.cutscene && !W.directed && !W.paused && !app.mapSystem?.isFullMapOpen;
  let held = null; // (the combat item in his hand up there)
  const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
  // a man's place in the horse's frame: lx to its left, lz ahead
  const local = (p) => { const c = Math.cos(car.heading), s = Math.sin(car.heading), dx = p.x - car.position.x, dz = p.z - car.position.z; return { lx: dx * c - dz * s, lz: dx * s + dz * c }; };
  const standing = (e) => e.alive && (e.standing || e.state === 'getup' || e.state === 'bang');
  const near = (r) => (W.combat?.enemies || []).some((e) => e.alive && Math.hypot(e.pos.x - car.position.x, e.pos.z - car.position.z) < r);

  // the side to swing at: the flank with the nearest man by it (his right if none)
  function sideFor() {
    let best = null, bd = Infinity;
    for (const e of W.combat?.enemies || []) {
      if (!standing(e)) continue;
      const L = local(e.pos);
      if (L.lz < -REACH.back - 0.4 || L.lz > REACH.front + 0.6 || Math.abs(L.lx) > REACH.side + 1) continue;
      const d = Math.abs(L.lx) + Math.max(0, Math.abs(L.lz) - 0.6);
      if (d < bd) { bd = d; best = L; }
    }
    return best ? (best.lx >= 0 ? 1 : -1) : -1;
  }
  function swing(side = sideFor()) {
    if (!up() || rider.striking || rs.oneShot) return false;
    const I = held;
    return rider.strike(side, {
      ts: 0.85,
      onHit: () => {
        const v = Math.abs(car.speed || 0), out = { x: Math.cos(car.heading) * side, z: -Math.sin(car.heading) * side }, f = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
        let n = 0;
        for (const e of W.combat?.enemies || []) {
          if (!standing(e)) continue;
          const L = local(e.pos);
          if (L.lx * side < 0.15 || Math.abs(L.lx) > REACH.side || L.lz < -REACH.back || L.lz > REACH.front) continue;
          const dir = _v.set(out.x + f.x * Math.min(1, v / 6), 0, out.z + f.z * Math.min(1, v / 6)).normalize().clone();
          hit(e, { dmg: (I?.kind === 'bottle' ? 48 : 52) + v * 2.2, kind: 'heavy', weapon: I?.kind || null, w: 0.85, heavy: 0.85, fly: 6 + v * 0.35, up: 3.4, dir, side, limb: 'item', stun: I?.kind === 'bottle' });
          n++;
        }
        if (!n) { W.audio?.play?.('whoosh', { pos: [car.position.x, car.position.y + 2, car.position.z], vol: 0.6, rate: 0.9 }); return; }
        // (it wears out as it does on foot)
        if (I && I === held) {
          if (I.kind === 'bottle') { held = null; rider.weapon = null; W.combat?.items?.shatter?.(I, _v.set(out.x, 0, out.z), { neck: true }); }
          else if (--I.hits <= 0) { held = null; rider.weapon = null; W.combat?.items?.breakBat?.(I, _v.set(out.x, 0, out.z)); }
        }
      },
    });
  }
  function buck() {
    if (!up() || rider.striking || rs.oneShot || drive.S.air) return false;
    drive.S.busy = 'buck';
    W.audio?.play?.('pack:sounds-rpg/creak', { pos: [car.position.x, car.position.y + 1.7, car.position.z], vol: 0.5, rate: 0.8 });
    return !!rs.play('buck', {
      onHit: () => {
        const back = { x: -Math.sin(car.heading), z: -Math.cos(car.heading) };
        const p = car.position;
        W.audio?.play?.('pack:sounds-impact/impactSoft_heavy', { pos: [p.x + back.x * 1.6, p.y + 1.1, p.z + back.z * 1.6], vol: 0.7, rate: 0.75 });
        for (const e of W.combat?.enemies || []) {
          if (!standing(e)) continue;
          const L = local(e.pos);
          if (L.lz > -KICK.near || L.lz < -KICK.far || Math.abs(L.lx) > KICK.wide) continue;
          const dir = _v.set(back.x + Math.cos(car.heading) * Math.sign(L.lx) * 0.3, 0, back.z - Math.sin(car.heading) * Math.sign(L.lx) * 0.3).normalize().clone();
          hit(e, { dmg: KICK.dmg, kind: 'heavy', w: 0.9, heavy: 0.9, fly: 7, up: 3.6, dir, limb: 'footR' });
        }
      },
      onEnd: () => { if (drive.S.busy === 'buck') drive.S.busy = null; },
    });
  }
  function attack() { return held ? swing() : buck(); }

  // the buttons (in the saddle only; on foot the fight's own)
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable;
  addEventListener('keydown', (e) => {
    if (e.repeat || typing(e) || e.ctrlKey || e.metaKey || e.altKey || !up()) return;
    if (e.code === 'KeyJ') attack();
    else if (e.code === 'KeyK') buck();
  });
  addEventListener('pointerdown', (e) => {
    if (!canvas || e.target !== canvas || e.pointerType === 'touch' || !up() || !near(9)) return;
    if (e.button === 0) attack(); else if (e.button === 2) buck();
  }, true);

  // what he holds, carried up into the saddle and back down: the fight's item taken out of its hands as he gets up
  // (it would be left lying in the street) and given back as he gets down
  function take() {
    const c = C(), I = c?.me?.holding;
    if (!I || I.def?.hands !== 1) return null;
    W.combat.items.remove(I);
    app.scene.add(I.obj); I.state = 'saddle';
    held = I; rider.weapon = I.kind;
    return I;
  }
  function giveBack() {
    const I = held; held = null; rider.weapon = null;
    if (!I) return;
    const c = C();
    if (c && W.combat?.items?.give) W.combat.items.give(c.me, I, 0.15); else I.obj.removeFromParent();
  }
  function arm(kind = 'bat') {
    if (held) { held.obj.removeFromParent(); held = null; }
    const I = W.combat?.items?.make?.(kind); if (!I) return null;
    app.scene.add(I.obj); I.state = 'saddle'; held = I; rider.weapon = kind;
    return I;
  }
  // after his pose each frame: what he holds in his right fist (resting, its end down by the horse's shoulder; in a blow,
  // along his swing)
  const restDir = new THREE.Vector3(), _p = new THREE.Vector3(), FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
  let rest = 1;
  rider.after = (dt) => {
    const I = held; if (!I) return;
    I.obj.visible = !(W.cutscene || W.directed) && car.mesh.visible !== false;
    if (!fist(W.dan.bones, 'hero', _p, _q)) return;
    if (I.def.flip) _q.multiply(FLIP);
    // (resting: down along the horse's right shoulder, a little out and ahead; in a blow, along his swing)
    rest += ((rider.striking ? 0 : 1) - rest) * Math.min(1, (dt || 0.016) * (rider.striking ? 30 : 6));
    if (rest > 0.001) { restDir.set(-0.35, -0.85, 0.4).applyQuaternion(car.mesh.quaternion).normalize(); _q.slerp(_q2.setFromUnitVectors(UP, restDir), 0.85 * rest); }
    // (its grip in the fist)
    _p.sub(_v.set(0, I.def.grip || 0, 0).applyQuaternion(_q));
    I.obj.position.copy(_p); I.obj.quaternion.copy(_q); I.obj.updateMatrixWorld(true);
  };
  rider.onAttach = () => take();
  rider.onDetach = () => giveBack();
  return { swing, buck, attack, take, giveBack, arm, get weapon() { return held ? held.kind : null; } };
}
