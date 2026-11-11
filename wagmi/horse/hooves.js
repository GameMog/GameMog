// Mog City: Ranger's hoofbeats, timed off its own hooves (as wagmi/audio/steps.js times Dan's steps off his feet): a
// hoof that lifts (4.5 cm over its low point) and comes back down is a beat, so each one lands with the animation in
// any gait, four to a stride. From the library's recorded packs (Kenney's CC0 Impact and RPG sounds: there is no hoof
// or horse call in any of them, so nothing here pretends to be one): on the street a wooden knock under a pitched-down
// concrete step, a hard clop; on grass a soft thud; louder and brighter from a walk to a gallop, the hind feet a little
// softer than the fore. And the tack once a stride at a trot or more: the saddle's creak, the cinch's leather, at a
// gallop the bit's jingle.
//   const H = createHooves(W)   // H.update(dt, { on, hooves (ranger.js rs.hooves()), base (its ground y), speed, gait,
//                               // surface 'hard' | 'grass', air }), H.count { beats, tack }
export const PACKS = ['sounds-impact', 'sounds-rpg'];
const BEAT = {
  walk: { rate: 0.62, vol: 0.5 },
  trot: { rate: 0.7, vol: 0.68 },
  gallop: { rate: 0.8, vol: 0.92 },
};

export function createHooves(W) {
  const H = [0, 1, 2, 3].map((i) => ({ floor: 1, armed: false, fore: i < 2 }));
  const count = { beats: 0, tack: 0 };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const play = (name, pos, vol, rate) => W.audio?.play?.(name, { pos: [pos.x, pos.y, pos.z], vol, rate });
  function beat(h, f, s) {
    const B = BEAT[s.gait] || BEAT.walk, k = f.fore ? 1 : 0.82, p = h.p;
    count.beats++;
    if (s.surface === 'grass') play('pack:sounds-impact/footstep_grass', p, B.vol * k * 0.95, B.rate * rnd(0.97, 1.05) + 0.05);
    else {
      play('pack:sounds-impact/footstep_wood', p, B.vol * k * 0.7, B.rate * rnd(0.86, 0.94));
      play('pack:sounds-impact/footstep_concrete', p, B.vol * k * 0.55, B.rate * rnd(1.0, 1.12));
    }
    // (the tack: on the leading fore hoof's beat, now and then)
    if (h.n !== 'fpaw_L' || s.gait === 'walk') return;
    const top = { x: s.at.x, y: s.at.y + 1.75, z: s.at.z };
    if (Math.random() < 0.4) { play('pack:sounds-rpg/creak', top, rnd(0.14, 0.22), rnd(0.85, 1.05)); count.tack++; }
    else if (Math.random() < 0.35) { play('pack:sounds-rpg/clothBelt', top, rnd(0.12, 0.18), rnd(0.9, 1.1)); count.tack++; }
    if (s.gait === 'gallop' && Math.random() < 0.3) { play('pack:sounds-rpg/metalClick', { x: top.x, y: top.y + 0.2, z: top.z }, 0.1, rnd(1.15, 1.3)); count.tack++; }
  }
  // s: { on, hooves: [{ n, p }], base: the ground's y under it, speed, gait, surface, air, at: its position }
  function update(dt, s) {
    if (!s.on || s.air) { for (const f of H) f.armed = false; return; }
    const moving = Math.abs(s.speed) > 0.25 || s.gait !== 'idle';
    s.hooves.forEach((h, i) => {
      const f = H[i], y = h.p.y - s.base;
      f.floor = Math.min(f.floor + dt * 0.1, y);
      if (y > f.floor + 0.045) f.armed = true;
      if (f.armed && y < f.floor + 0.015) { f.armed = false; if (moving) beat(h, f, s); }
    });
  }
  return { update, count };
}
