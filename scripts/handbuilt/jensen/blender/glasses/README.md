# Jensen's glasses (blender/glasses)

Original work, built entirely from procedural geometry in `build.py`. It uses no third-party assets or textures,
and no pixels from the reference photo (the photo was used by eye only).

## What it is
A thin gunmetal browline / semi-rimless frame:
- **Top bar.** A metal bar runs along each lens's top edge. It is 2.1 mm tall at the nose and 2.7 mm at the temple,
  and 1.6 to 2.0 mm deep. Its underside grips the lens top by 0.7 mm. The bar sits just above the pupils and just
  under the brows.
- **Lenses.** Rimless below, with a polished 1.9 mm edge that has 0.28 mm chamfers. The lenses are slim, wide
  rectangles, 55 x 27 mm (box), with soft lower corners, a slight bottom bow and a nasal lean. Each is a real
  curved solid (front radius 135 mm, about a base-4 curve) with 5.5 degrees of wrap and 8 degrees of pantoscopic
  tilt.
- **Bridge.** A fine double-curved wire bridge, DBL 19 mm.
- **Nose pads.** Clear oval pads, 10 x 6 mm, on S-curved 0.85 mm pad arms with box clips. The pads are seated on the
  sides of the nose by ray cast, with 0.46 mm clearance.
- **Hinges.** Endpieces with a hinge barrel and a screw head.
- **Temples.** Flattened wire temples that run back clear of the skin, cross the top of the ear and bend down
  behind it. Each ends in a dark acetate tip sleeve, 34 mm long.
- **Size.** The frame is 138.5 mm wide across the endpieces. Temple length is about 160 mm along the wire.
- **Fit.** IPD is 61.4 mm. Vertex distance is 12.5 mm at the pupil. Minimum skin clearance: metal 1.6 mm, tips
  1.4 mm, lenses 6.6 mm. Nothing penetrates.

## The file
`glasses.glb` contains one node, `glasses`, holding one mesh with 24.4k triangles in 5 primitives:

| primitive / material | look | notes |
|---|---|---|
| glasses-metal | gunmetal: base (0.06, 0.062, 0.068), metallic 1, roughness 0.32 | |
| glasses-lens | alpha BLEND 0.10, base (0.08, 0.085, 0.09), roughness 0.03 | Clear glass that keeps the eyes visible. The highlight comes from the env map. |
| glasses-lens-edge | alpha BLEND 0.35, light grey-green | The polished rimless edge. It is what draws the lower lens outline. |
| glasses-pads | alpha BLEND 0.55, pale | |
| glasses-tips | dark acetate, roughness 0.38 | |

- The GLB has no textures and no UVs. It is rigid: no skin and no morph targets.
- All parts are closed solids, so every material is single-sided (doubleSided false).
- **Set `castShadow = false` on the lens, lens-edge and pad meshes** in the engine. Otherwise the clear parts cast
  lens-shaped shadows on the cheeks, which is the round-1 fault noted in frames.mjs.
- The Blender renders use a physically based glass for the lenses (transmission, low-IOR anti-reflective look, thin
  film). That glass is render-only. The GLB uses the engine-friendly alpha materials above and has no
  KHR_materials_transmission, so it adds no extra render pass.

## The fit transform
Coordinates are glTF, metres, in the bind space of
`storykit/handbuilt/jensen/jensen.glb` @ b14e97a7.

- The `glasses` node's translation is **(0, 1.6335506, 0.1526089)**, with no rotation and scale 1. The vertices are
  relative to that point, which is the middle of the frame front between the two bars' nasal ends.
- The head joint's inverse bind matrix is a pure translation, (0, -1.5851409, -0.0332015), so it has identity
  rotation.

### Option A (recommended): parent the node to the head joint
Make the node a child of node `head` (joint index 65) with this local transform:

`translation = (0, 0.0484097, 0.1194074)`, rotation identity, scale 1

This equals IBM_head x T(node). The head joint's parents (neck03 up to the scale-1.0033 root) then carry the
glasses exactly as they carry the skin.

### Option B: frames.mjs style
Add the primitives to the skinned body mesh with JOINTS_0 = head and WEIGHTS_0 = 1. To get bind-space positions,
add the node translation to each vertex.

## What the assembler must do
- **Remove the old glasses.** jensen.glb still carries the round-3 glasses as primitives inside Mesh_0, with the
  materials `glasses`, `lens-edges` and `lenses`. Drop the `['glasses', () => framesPass(...)]` pass in
  scripts/handbuilt/jensen/build.mjs, or delete those primitives, so the two pairs don't overlap.
- **Refit if the head changes.** The fit is measured from jensen.glb at b14e97a7, after the age pass's head scale.
  If the head, eyes or headScale change, rerun the build. It refits from the head's own eye spheres, nose surface,
  skull side and ear top, and rewrites fit.json:
  `/Applications/Blender.app/Contents/MacOS/Blender -b --python build.py -- --glb <path/to/jensen.glb> [--render front,34,profile,eyes --samples 64 --tag NN]`
- **Face morphs.** The glasses are rigid on the head, so they don't affect the face morphs. browInnerUp and
  browOuterUp raise the brows away from the bar, and there are no cheek collisions. Wide smiles plus cheekSquint
  lift the cheeks toward the lens bottoms, which have 6+ mm of clearance at rest.
- **Hair.** The temples pass inside the hair shell above the ear, which is realistic. In profile, the tip shows
  behind the ear.

## Files
- `build.py` builds the glasses, fits them, exports the GLB and renders. `scene.py` holds the shared head load,
  lights and cameras.
- `glasses.glb` is the deliverable. `glasses-on-head.blend` is the scene with the head. `fit.json` holds the measured
  fit and clearances.
- `ibm.mjs` reads the head IBM (run it with `source ../../hb-env.sh`). `measure.py` and `earmap.py` are
  diagnostics.
- Renders: `r-06-*.jpg` here, also saved as `../../shots/blender/glasses-0N-*.jpg`.
