# Face contract: baked morph targets on a cast GLB (18 Nov 2026)

Who reads this: whoever builds a cast GLB with its face's morphs baked in, and `wagmi/face.js`, which plays them.

## 1. What the GLB carries

- glTF morph targets on the body's **skin primitive** (material name `skin`, as every forged body has).
  The same target names may also be on the primitives that ride the face: `lashes`, `brows`, `eyebrows`,
  `beard`, `teeth*`, `tongue`, `hair` (fringe). The runtime drives **every mesh of the model** that has a target
  of that name, so put a target on each primitive it should move.
- Target names go in `mesh.extras.targetNames` (three.js GLTFLoader turns them into `morphTargetDictionary`).
  **Names are exact and case-sensitive**: the MakeHuman Faceunits 01 / Visemes 02 file names minus `.target`.
- Relative (delta) targets, positions only (normals optional). Units: metres in the body's bind space.

### Required (the face is "baked" when the skin has at least these)

| Target | Use |
|---|---|
| `eyeBlinkLeft`, `eyeBlinkRight` | idle blinks every 2-6 s (now and then a double), 60 ms down / 30 ms held / 90 ms up; also a cut-blink |
| `jawOpen` | talking: the voice clip's amplitude envelope (fast attack 25 ms, release 60 ms), capped about 0.55 |

### Optional (used when present, ignored when absent)

| Target | Use |
|---|---|
| `viseme_sil viseme_PP viseme_FF viseme_TH viseme_DD viseme_kk viseme_CH viseme_SS viseme_nn viseme_RR viseme_aa viseme_E viseme_I viseme_O viseme_U` (Visemes 02, all 15) | lip shapes from the line's text timed over the clip's length (letters to visemes, the clip's progress), weighted by the amplitude envelope; jawOpen is scaled down to 0.5 of itself while visemes play so the two don't double-open |
| `mouthSmileLeft`, `mouthSmileRight` | the warm grin: about 0.45 on a line whose delivery is `warm`, `tease` or `smug`, and on the listener for a moment after a warm line; plus a per-cast resting smile (see 3) |
| `cheekSquintLeft`, `cheekSquintRight`, `eyeSquintLeft`, `eyeSquintRight` | ride the smile (0.55 and 0.3 of it): a real grin reaches the eyes |
| `browInnerUp` | questions (the end of a line with `?`), and a lean on a loud syllable now and then |
| `browOuterUpLeft`, `browOuterUpRight` | with browInnerUp at 0.5 of it |
| `mouthClose` | small, with the jaw shut between syllables (keeps the lips sealed on PP/BB/MM) |
| `eyeLookUpLeft/Right`, `eyeLookDownLeft/Right`, `eyeLookInLeft/Right`, `eyeLookOutLeft/Right` | the gaze (who they talk to, saccades): when absent the eyes stay forward (dark glasses: fine) |
| `eyeWideLeft/Right`, `mouthFrownLeft/Right`, `mouthPucker`, `mouthFunnel` | spare: `scared` -> eyeWide 0.4, `sad` -> mouthFrown 0.35 |

Do not bake `tongueOut` (100% helper vertices: does nothing on the forge body). Keep it to the ~20 face units
above plus the 15 visemes.

## 2. Bodies without them

- A MakeHuman / forged body **without** baked targets keeps today's behaviour exactly: `face.js` builds its own
  `jaw lip blink blink2 brow lookX lookY` morphs from the geometry (Dan, Jane, Gears, Fiona, Mr. Big, forged cast).
- A body with neither (no `skin` + `eyes` materials, no baked targets): nothing happens, no error.
- A body **with** baked targets: `face.js` does NOT build its own (it would overwrite the GLB's morph list);
  it drives the baked ones. Detection: the skin mesh's `morphTargetDictionary` has `jawOpen` or `eyeBlinkLeft`.

## 3. Per-cast knobs (pack `cast[name].face`, all optional; runner passes them to createFace)

| Field | Default | Meaning |
|---|---|---|
| `smile` | 0 | resting smile 0..0.4 (Jensen: 0.18, the warm grin while listening) |
| `open` | 0.45 | jaw cap scale (0.5 = jawOpen 0.55 at the loudest syllable) |
| `blink` | 1 | blink rate scale (0.5 = half as often) |

## 4. How a line's delivery reaches the face

`W.voice` keeps the playing line's `how` (from the pack line's `how`, passed by turns.js and the car-phone
engine) and `voiceOf(W, speaker)` returns `{ level, t, dur, text, how }`. Lines are matched to faces by speaker
name, as before (`face.speaker` = the cast name).

## 5. Test

`node --test tests/face-baked.test.mjs` builds a tiny skinned mesh with these names and checks
blink, jaw, visemes, smile; and a body with no targets is left untouched.
