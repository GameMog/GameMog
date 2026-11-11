// SF 2040: the sky and the light after Erebus. Three looks added to San Francisco's own lighting presets
// (cities/sf/js/lighting.js LightingSystem.PRESETS) and colour grade (post-processing.js window.NYC.GRADE_LOOKS):
//   ash-dusk  (the default) a dim copper sun low in the west through the ash, a red glow on the horizon toward the
//             Presidio (where Erebus came down), heavy warm-grey haze, a desaturated warm grade, the power out
//   ash-day   the same sky higher and paler: a brown overcast, the sun a smudge
//   ash-night the glow over the Presidio the brightest thing; fires light the streets (fx.js)
// The city's own time ids still work: a mission asking for 'golden' or 'twilight' gets ash-dusk, 'midday' ash-day,
// 'midnight' ash-night (the lighting's applyPreset is wrapped).
import * as THREE from 'three/webgpu';

const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
// toward the impact: the Presidio, north-west of downtown (-x west, -z north)
export const IMPACT_DIR = V(-0.92, 0, -0.4);

export const PRESETS = {
  'ash-dusk': {
    id: 'ash-dusk', name: 'Ash Dusk',
    sunDir: V(-0.9, 0.2, 0.22), sunColor: 0xff8448, sunIntensity: 1.6,
    hemiSky: 0xb89480, hemiGround: 0x6a5040, hemiIntensity: 2.1,
    skyTop: 0x8a6c5c, skyHorizon: 0xc0805c,
    fogColor: 0x7a5644, fogDensity: 0.00105,
    interiorGlow: 0.04, roadWetness: 0.04, envIntensity: 1.2, canyonBounce: 0.6,
    turbidity: 16, rayleigh: 1.1, mieCoefficient: 0.025, mieDirectionalG: 0.9,
    cloudCoverage: 0.74, cloudDensity: 0.62, cloudElevation: 0.42, skyExposure: 0.13, nightFactor: 0.0,
    skyTint: 0xd8a080, glowColor: 0xff3a0c, glow: 0.9, glowDir: IMPACT_DIR,
    ash: 1, ashTop: 0x7a5e50, ashHorizon: 0x7a5a48, ashSun: 0xff7a38, ashK: 1.15, ashSunK: 0.6,
  },
  'ash-day': {
    id: 'ash-day', name: 'Ash Day',
    sunDir: V(-0.55, 0.5, 0.3), sunColor: 0xffae6e, sunIntensity: 3.2,
    hemiSky: 0xa89484, hemiGround: 0x6a5848, hemiIntensity: 1.8,
    skyTop: 0x8a7a6e, skyHorizon: 0xb8987e,
    fogColor: 0x9a8270, fogDensity: 0.00095,
    interiorGlow: 0.04, roadWetness: 0.03, envIntensity: 0.55, canyonBounce: 0.4,
    turbidity: 18, rayleigh: 0.9, mieCoefficient: 0.03, mieDirectionalG: 0.86,
    cloudCoverage: 0.8, cloudDensity: 0.6, cloudElevation: 0.45, skyExposure: 0.12, nightFactor: 0.0,
    skyTint: 0xc8a890, glowColor: 0xff5a20, glow: 0.3, glowDir: IMPACT_DIR,
    ash: 1, ashTop: 0x7a6a5e, ashHorizon: 0xc0a088, ashSun: 0xffd0a0, ashK: 1.9, ashSunK: 1.6,
  },
  'ash-night': {
    id: 'ash-night', name: 'Ash Night',
    sunDir: V(0.35, 0.6, -0.5), sunColor: 0x9a8aa0, sunIntensity: 1.1,
    hemiSky: 0x6a5058, hemiGround: 0x3e3028, hemiIntensity: 1.6,
    skyTop: 0x2e2224, skyHorizon: 0x5a2c1c,
    fogColor: 0x24160f, fogDensity: 0.0011,
    interiorGlow: 0.03, roadWetness: 0.04, envIntensity: 0.32, canyonBounce: 0.15,
    turbidity: 6, rayleigh: 1.0, mieCoefficient: 0.01, mieDirectionalG: 0.8,
    cloudCoverage: 0.6, cloudDensity: 0.5, cloudElevation: 0.45, skyExposure: 0.03, nightFactor: 0.86, nightSky: 0x170d0b,
    skyTint: 0xb08070, glowColor: 0xff3810, glow: 0.6, glowDir: IMPACT_DIR,
    ash: 1, ashTop: 0x2a1c1a, ashHorizon: 0x4a2416, ashSun: 0x000000, ashK: 1.3, ashSunK: 0,
  },
};
export const LOOKS = {
  'ash-dusk': { exposure: 1.34, contrast: 1.08, saturation: 0.76, balance: [1.08, 0.98, 0.86], bloom: 0.34, threshold: 1.0, vignette: 0.3, dryGreens: 0.75, shadowLift: 0.016 },
  'ash-day': { exposure: 1.04, contrast: 1.08, saturation: 0.68, balance: [1.06, 0.99, 0.9], bloom: 0.26, threshold: 1.15, vignette: 0.26, dryGreens: 0.75 },
  'ash-night': { exposure: 1.45, contrast: 1.04, saturation: 0.82, balance: [1.06, 0.97, 0.9], bloom: 0.42, threshold: 0.85, vignette: 0.32, dryGreens: 0.6, shadowLift: 0.012 },
};
const MAP = { golden: 'ash-dusk', twilight: 'ash-dusk', midday: 'ash-day', midnight: 'ash-night', dusk: 'ash-dusk', day: 'ash-day', night: 'ash-night' };
export const lookOf = (id) => (PRESETS[id] ? id : MAP[id] || 'ash-dusk');

export function installLook(W, base = 'ash-dusk') {
  const app = W.app, N = window.NYC, ls = app.lightingSystem;
  const P = ls.constructor.PRESETS, G = N.GRADE_LOOKS;
  if (!P || !G) { console.warn('[apocalypse] this city has no presets to add to'); return null; }
  Object.assign(P, PRESETS); Object.assign(G, LOOKS);
  const night0 = ls.uNightSkyColor.value.getHex();
  const apply0 = ls.applyPreset.bind(ls);
  ls.applyPreset = (id, force) => {
    const want = lookOf(id), p = P[want];
    ls.uNightSkyColor.value.setHex(p.nightSky ?? night0);
    return apply0(want, force);
  };
  const set = (id) => {
    const want = lookOf(id);
    ls.applyPreset(want, true);
    app.postFX?.colorGrade?.applyPreset(want);
    return want;
  };
  const now = set(base);
  return { set, get id() { return ls.activePresetId; }, base: now };
}
