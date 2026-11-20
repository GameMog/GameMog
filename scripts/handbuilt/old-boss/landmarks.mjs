// Hand-built old boss: his face's landmarks in the bind pose (metres), read from his forge round-8 GLB (asset extras
// forge.landmarks: ey 1.7085, eye front 0.146, mouth 75.5 mm under the eyes, chin 120.5 mm, mouth half-width 23.2 mm)
// and from the skin's profile (nose tip 1.662 / 0.175, the parting 1.633). Shared by his passes.
export const EY = 1.7085, EYEFRONT = 0.146, EZ = 0.133, EYEX = 0.033, MOUTHY = 1.633, CHINY = 1.588, MH = 0.0232;
export const NOSE = [0, 1.662, 0.175];
// the forge's beard outline (compile.mjs 'full', G7c trim: lift 9 mm, slope 0.52, ear 62 mm behind the eyes' plane) and
// the hand pass's trimmed one: the cheek line 6-9 mm lower and flatter, 1 cm further from the ear, a clean neck line
export const OLD_BEARD = { lift: 0.009, slope: 0.52, ear: 0.062 };
export const NEW_BEARD = { lift: 0.0035, slope: 0.42, ear: 0.051, neck: 0.03 };
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// the trimmed beard's coverage at a point (0..1), soft over ~5 mm at its cheek, ear and neck lines; n (optional) adds a
// few mm of irregularity to the cheek line, as clipped hair has
export function trimOf(x0, y, z, n = 0) {
  const x = Math.abs(x0), T = NEW_BEARD, cheek = MOUTHY + T.lift + Math.max(0, x - 0.026) * T.slope + n * 0.002, ear = EZ - T.ear, neck = CHINY - T.neck + Math.max(0, x - 0.02) * 0.5;
  return sm(cheek + 0.003, cheek - 0.003, y) * sm(ear - 0.004, ear + 0.005, z) * sm(neck - 0.006, neck + 0.004, y);
}
export function oldBeardOf(x0, y, z) {
  const x = Math.abs(x0), T = OLD_BEARD, cheek = MOUTHY + T.lift + Math.max(0, x - 0.026) * T.slope, ear = EZ - T.ear;
  return sm(cheek + 0.012, cheek - 0.004, y) * sm(ear - 0.012, ear + 0.008, z) * sm(CHINY - 0.06, CHINY - 0.03, y);
}
// the horseshoe's top line (height over the eyes): 5.4 cm at the temples, rising to 7 cm at the back of the head
export const hsLine = (x, z) => EY + 0.054 + 0.016 * sm(EZ - 0.11, EZ - 0.19, z);
