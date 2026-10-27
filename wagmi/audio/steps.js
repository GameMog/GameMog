// Mog City: Dan's footsteps, timed off his own feet: a foot that lifts (7 cm over its low point) and comes back down
// is a step, so the sound lands with the animation whatever the gait (walk, jog, run, sprint, a fight's footwork). On
// concrete a sneaker's thud and scuff, on grass a soft crunch; louder as he runs; a thud when he lands from a jump.
export function createSteps(E) {
  const feet = [{ floor: 1, armed: false, side: -1 }, { floor: 1, armed: false, side: 1 }];
  let air = 0, cool = 0;
  // s: { on, feet: [left, right] heights over the ground (m), speed m/s, surface 'hard' | 'grass', inAir }
  function update(dt, s) {
    cool -= dt;
    if (!s.on) { air = 0; return; }
    if (s.inAir) { air += dt; return; }
    if (air > 0.3) E.play('land', { vol: Math.min(1, 0.4 + air), pan: 0 });
    air = 0;
    const run = Math.max(0, Math.min(1, (s.speed - 2) / 5));
    s.feet.forEach((y, i) => {
      const f = feet[i];
      if (y == null) return;
      f.floor = Math.min(f.floor + dt * 0.08, y);
      if (y > f.floor + 0.07) f.armed = true;
      if (f.armed && y < f.floor + 0.03) {
        f.armed = false;
        if (s.speed > 0.4 && cool <= 0) { E.play('footstep', { surface: s.surface, run, vol: 0.7 + 0.3 * run, pan: f.side * 0.12 }); cool = 0.09; }
      }
    });
  }
  return { update };
}
