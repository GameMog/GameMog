// Mog City story runner: the people's lighting rig (charlook), the way games light their characters apart from the
// world (a "character lighting rig"): a key at the face's eye level from the camera's side, a soft fill on the other
// side and a rim from behind, on the finished people only (polish.js's skin, hair, eyes and cloth), never on the city.
// The lights are not three.js lights (no light is added to any scene, no other material is rebuilt): three
// directions fixed to the lens (view space) and their colours, added inside the people's own lighting models
// (rigDirect below), so every lens sees the face lit from the front for it, a call's webcam, a cutscene's close-up and
// the street's chase camera alike. Its weights follow the frame (apply(), every draw of a scene):
//   - the city in play: gentle (a soft fill so the sockets never go black under a high sun, a low key, a faint rim)
//   - a cutscene or a call on the street (W.cutscene): the full portrait rig
//   - a set (sets.js: Mr. Big's study's way, a call's office): the set has its own key, fill and rim, so only the
//     fill's floor under the brows and a touch of the key's eye-level light (the catchlight)
// After FACE-FEMININE.md 12-13 (CharacterPipeline/research): a key 30-45 degrees to the side and 15-30 above, a soft
// fill, a rim, and an even fill from the front so the sockets never go black (a top-down key deepens them and grows the
// brow's shadow, which is what a midday sun does).
// A world asks for it: `look: 'cinematic'` (pack.js); ?look=cinematic | off overrides it for one load. Off, nothing is
// added to any shader: the people are drawn exactly as before.
//   charLook()                  'cinematic' | null, this load's
//   RIG                         the rig's uniforms (view-space directions, colours) and its levels (LEVELS)
//   rigDirect(model, builder)   in a lighting model's indirect(): the rig's three lights added (polish.js)
//   apply(scene, camera)        the weights for one draw (a scene's onBeforeRender: setScene below)
//   setScene(scene, kind, mood) a scene marked as the city's or a set's, its weights applied before each of its draws
import * as THREE from 'three/webgpu';
import { uniform, vec3, float, normalView, BRDF_Lambert, diffuseContribution } from 'three/tsl';

export const LOOKS = ['cinematic'];
const Q = typeof location === 'undefined' ? null : new URLSearchParams(location.search);
export function charLook() {
  const q = Q?.get('look');
  if (q === 'off' || q === '0') return null;
  if (LOOKS.includes(q)) return q;
  const w = typeof window === 'undefined' ? null : window.NYC?.charLook;
  return LOOKS.includes(w) ? w : null;
}
const hiTier = () => typeof window === 'undefined' || (window.NYC?.quality?.tier || 'high') === 'high';

// view space: x to the lens's right, y up, z toward the lens. The key 35 degrees round from the lens and 20 above the
// eyes (its side flipped to the sun's, apply()); the fill low on the other side, wide; the rim from behind, high
const dirOf = (yawDeg, upDeg) => { const y = (yawDeg * Math.PI) / 180, u = (upDeg * Math.PI) / 180; return new THREE.Vector3(Math.sin(y) * Math.cos(u), Math.sin(u), Math.cos(y) * Math.cos(u)); };
const KEY = dirOf(35, 20), FILL = dirOf(-55, 2), RIM = dirOf(-150, 32);
export const RIG = {
  keyDir: uniform(KEY.clone()), keyCol: uniform(new THREE.Color(0, 0, 0)),
  fillDir: uniform(FILL.clone()), fillCol: uniform(new THREE.Color(0, 0, 0)),
  rimDir: uniform(RIM.clone()), rimCol: uniform(new THREE.Color(0, 0, 0)),
  // levels (a directional light's intensity) per frame kind and the time of day: [key, fill, rim]
  LEVELS: {
    play: { day: [0.55, 0.6, 0.5], golden: [0.5, 0.6, 0.6], night: [0.5, 0.55, 0.45] },
    close: { day: [1.1, 0.7, 0.9], golden: [1.0, 0.65, 1.0], night: [0.95, 0.6, 0.8] },
    set: { day: [0.45, 0.5, 0], golden: [0.45, 0.5, 0], night: [0.45, 0.45, 0] },
  },
  // the colours: the key a soft warm white (a lamp's amber at night), the fill the sky's, the rim the sun's or a cool moon
  COLORS: {
    day: { key: '#FFF1E4', fill: '#E6EEFF', rim: '#FFF4E6' }, golden: { key: '#FFE2C4', fill: '#D8E2FF', rim: '#FFC98A' },
    night: { key: '#FFD9AE', fill: '#9FB2E6', rim: '#A9C0FF' },
  },
};

// the rig's lights in a lighting model (its indirect(), after the sky's): the key through the model's own direct() (its
// wrap, its specular: the eyes' clear coat catches it as a catchlight, the hair's strands as a sheen; the skin's light
// through thin parts on the high tier), the fill as a half-Lambert's diffuse only (no second highlight, no edge: it
// reaches into the sockets and under the brows), the rim through direct() again on the high tier, its diffuse only on
// the others. None of it is shadowed or occluded: it is the floor under the face's own shadows
export function rigDirect(model, builder) {
  const { reflectedLight } = builder.context;
  model.direct({ lightDirection: RIG.keyDir, lightColor: RIG.keyCol, reflectedLight }, builder);
  const half = normalView.dot(RIG.fillDir).mul(0.5).add(0.5);
  reflectedLight.directDiffuse.addAssign(half.mul(half).mul(RIG.fillCol).mul(BRDF_Lambert({ diffuseColor: diffuseContribution })));
  if (hiTier()) model.direct({ lightDirection: RIG.rimDir, lightColor: RIG.rimCol, reflectedLight }, builder);
  else reflectedLight.directDiffuse.addAssign(normalView.dot(RIG.rimDir).max(0).mul(RIG.rimCol).mul(BRDF_Lambert({ diffuseColor: diffuseContribution })));
}

/* ------------------------------------------------------- the weights -- */
const W = () => (typeof window === 'undefined' ? null : window.WAGMI);
const _s = new THREE.Vector3(), _m = new THREE.Matrix4();
let lastSide = 1;
function moodOfPreset(id) { return /midnight|night|twilight|blackout/.test(id || '') ? 'night' : /golden|sunset|dusk/.test(id || '') ? 'golden' : 'day'; }
// (a cutscene or a call: the street's camera is close on someone)
const closeNow = () => !!W()?.cutscene;
export function apply(scene, camera) {
  const tag = scene?.userData?.charRig; if (!tag) return;
  const app = typeof window === 'undefined' ? null : window.__NYC_APP, ls = app?.lightingSystem;
  const mood = tag.kind === 'set' ? tag.mood || 'day' : moodOfPreset(ls?.activePresetId);
  const kind = tag.kind === 'set' ? 'set' : closeNow() ? 'close' : 'play';
  const [k, f, r] = RIG.LEVELS[kind][mood] || RIG.LEVELS[kind].day, C = RIG.COLORS[mood] || RIG.COLORS.day;
  // (the key on the side of the lens the scene's own key is on: the sun's in the city, the set's daylight in a set; kept
  // while the sun is near the lens's axis, so a turning camera doesn't flip it every frame)
  const sun = tag.kind === 'set' ? tag.sunDir : ls?.sunLight ? _s.copy(ls.sunLight.position).normalize() : null;
  if (sun && camera) {
    _m.copy(camera.matrixWorldInverse); const sx = _s.copy(sun).transformDirection(_m).x;
    if (Math.abs(sx) > 0.15) lastSide = sx >= 0 ? 1 : -1;
  }
  RIG.keyDir.value.set(KEY.x * lastSide, KEY.y, KEY.z);
  RIG.fillDir.value.set(FILL.x * lastSide, FILL.y, FILL.z);
  RIG.rimDir.value.set(RIM.x * lastSide, RIM.y, RIM.z);
  RIG.keyCol.value.set(tag.keyColor || C.key).multiplyScalar(k);
  RIG.fillCol.value.set(C.fill).multiplyScalar(f);
  RIG.rimCol.value.set(C.rim).multiplyScalar(r);
}
// a scene's weights applied before each of its draws (the city's frame, a set's, a call's tile: each is a render of its
// own scene, and a uniform's value is read at its draw)
export function setScene(scene, kind, extra = {}) {
  if (!scene || !charLook()) return;
  scene.userData.charRig = { kind, ...extra };
  if (scene.userData.charRigHooked) return;
  scene.userData.charRigHooked = true;
  const prev = scene.onBeforeRender;
  scene.onBeforeRender = function (renderer, sc, camera, ...rest) { try { apply(scene, camera); } catch {} return prev?.call(this, renderer, sc, camera, ...rest); };
}
