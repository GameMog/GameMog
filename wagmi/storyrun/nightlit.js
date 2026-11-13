// Mog City story runner: a story world's night is a lit city night, readable. Mog City's own night preset is made for its
// chase at speed (a black road, headlights flaring); a story plays its people on foot at night (Pickup Time's finale on
// W 125th St: the exchange, the fights, Milo at the side door) and the owner's review read those frames near-black. So,
// under ?pack= only and only at night (the presets' interior glow, the same 0..1 the dressing reads), the time of day
// is lifted as the blackout pass lifts its dark streets: a moonlit hemisphere fill x3.4 (the blackout pass: x2.7), the moon x2.1, the grade's
// exposure x1.28, the bloom held down so headlights light the road instead of flaring over it. A blackout world's own
// dressing (dressing.js) already does this for its dark blocks; it is left to it. Day and dusk are untouched.
//   createNightLit(W, dressing) -> { night() } | null
import * as THREE from 'three/webgpu';

const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createNightLit(W, dressing = {}) {
  if (dressing && dressing.blackout) return null;
  const app = W.app, ls = app?.lightingSystem, cg = app?.postFX?.colorGrade, U = W.world?.look.cityUniforms;
  if (!ls || !U?.uInteriorGlow || ls.__nightLit) return null;
  ls.__nightLit = true;
  const night = () => sstep(0.6, 1.4, U.uInteriorGlow.value);
  const ap0 = ls.applyPreset.bind(ls);
  ls.applyPreset = (id, force = false) => {
    const same = !force && ls.activePresetId === id && ls.envRenderTarget !== null;
    ap0(id, force);
    if (same) return;
    try {
      const n = night(); if (!(n > 0)) return;
      ls.hemiLight.intensity *= 1 + 2.4 * n; // (x3.4: a story is played on foot, the shadowed pavement must read)
      ls.hemiLight.color.lerp(new THREE.Color(0x7f98c8), 0.3 * n);
      ls.hemiLight.groundColor.lerp(new THREE.Color(0x3a3630), 0.3 * n); // (the pavement under the street lamps, warm)
      ls.sunLight.intensity *= 1 + 1.1 * n; // (the night presets' sun is the moon)
    } catch (e) { console.warn('[storyrun] night light', e); }
  };
  if (cg) {
    const g0 = cg.applyPreset.bind(cg);
    cg.applyPreset = (id) => {
      g0(id);
      try {
        const n = night(); if (!(n > 0)) return;
        cg.exposure.value *= 1 + 0.28 * n;
        cg.bloomPass.strength.value = Math.min(cg.bloomPass.strength.value, 0.34 - 0.14 * n);
        cg.bloomPass.threshold.value = Math.max(cg.bloomPass.threshold.value, 1.0 + 0.6 * n);
      } catch (e) { console.warn('[storyrun] night grade', e); }
    };
  }
  // (the look of the current time again, lifted if it is night)
  try { const id = ls.activePresetId; if (id) { ls.applyPreset(id, true); cg?.applyPreset(id); } } catch {}
  return { night };
}
