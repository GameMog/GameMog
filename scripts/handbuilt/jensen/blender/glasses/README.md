# Jensen's glasses (blender/glasses), iteration 2

Original work, built entirely from procedural geometry in `build.py`. It uses no third-party assets or textures,
and no pixels from the reference photo (the photo was used by eye only).

## Iteration 2: the art director's five fixes
1. **Bridge and pads.** The bent black wire pad arms and box clips are gone. A small STRAIGHT bridge bar joins the two
   top bars. The nose pads are smaller (8 x 4.8 mm), faint-grey clear ovals. Each pad hangs from a short clear stem off
   the back of the lens, just inside its nasal edge, so it sits tucked behind the lens edge. No metal now runs between
   the eyes below the bar.
2. **Top bar.** The bar is about 30% thinner: 1.5 mm tall at the nose rising to 1.9 mm at the temple, and 1.3 to
   1.5 mm deep (was 2.1-2.7 by 1.6-2.0). It is gunmetal, not black: base (0.15, 0.155, 0.165), metallic 1, roughness
   0.30. The lens top, and the bar with it, sweeps up by 0.9 mm toward the outer ends.
3. **Height.** The frame is dropped by 3.1 mm. The lens top is now 7.4 mm above the pupil (was 10.1), so the bar sits
   just above the upper lash line and the brows show fully above it.
4. **Lenses.** The lenses are 55 x 23.5 mm (was 55 x 27): slim, wide rectangles that are 3.5 mm shorter below, with
   tighter corners and less bottom bow. The polished rimless edge is brighter so the lower outline reads: glTF
   (0.80, 0.84, 0.84), alpha 0.42, roughness 0.08.
5. **Temples.** Each temple runs back level to the ear's root, then bends straight DOWN behind the pinna. The bend and
   the acetate tip are tucked into the crease between ear and skull, where the pinna hides them in profile and the
   hair hides them from behind. Nothing runs on past the ear. The temple is 146.5 mm along the wire.

Iteration 1 (the files, renders and README) is kept in `it1/`.

## The fit (fitted on the it1 head: `../assembler/b/it1-noglasses.glb`, the head the build's `fit-it1` came from)
- Frame width is 137.7 mm across the endpieces. IPD is 61.4 mm, DBL 19 mm, vertex distance 12.5 mm, wrap 5.5 degrees,
  pantoscopic tilt 8 degrees.
- **Skin clearance (minimum):** metal 1.4 mm, lenses 7.5 mm, pads 0.5 mm.
- **The tips are -3.7 mm, and this is intended.** They run into the low-poly ear's fused root, inside the head's
  closed volume, so no view sees them. A profile render with the glasses hidden shows the small dark fragments at the
  top back edge of the helix are in the head itself (the ear skin or the hair cap), NOT the glasses.
- 22.2k triangles, a 425 KB GLB.

## The file
`glasses.glb` contains one node, `glasses`, holding one mesh, `glasses`, in 5 primitives. The materials are
single-sided, and the GLB has no textures, no UVs and no extensions.

| primitive / material | look |
|---|---|
| glasses-metal | gunmetal: base (0.15, 0.155, 0.165), metallic 1, roughness 0.30 |
| glasses-lens | alpha BLEND 0.10, base (0.08, 0.085, 0.09), roughness 0.03. The env map gives its highlight. |
| glasses-lens-edge | alpha BLEND 0.42, (0.80, 0.84, 0.84), roughness 0.08: the polished rimless edge |
| glasses-pads | alpha BLEND 0.22, (0.42, 0.44, 0.46), roughness 0.25. These are the values parts.mjs already forces. |
| glasses-tips | dark acetate, roughness 0.38 (hidden behind the ear) |

**Set `castShadow = false` on the lens, lens-edge and pad meshes** in the engine.

The renders use a render-only physical glass (transmission, IOR 1.12, no thin film). The GLB uses the alpha lens above.

## The fit transform
Coordinates are glTF, metres. The head joint's inverse bind matrix is unchanged at
(0, -1.5851409, -0.0332015), pure translation, in it1-noglasses.glb and in jensen.glb @ dc5e6b95.

- The node translation is **(0, 1.6304007, 0.1524586)** (was (0, 1.6335506, 0.1526089)), with no rotation and scale 1.
- **Option A (child of the `head` joint, index 65):** local translation **(0, 0.0452597, 0.1192571)**, identity
  rotation, scale 1.
- **Option B / the current pipeline:** parts.mjs bakes the node offset into the points and sets JOINTS_0 = head,
  WEIGHTS_0 = 1. Then assemble.mjs carries it rigidly onto the current head.

## For the assembler
```
node scripts/handbuilt/jensen/blender/parts.mjs --glasses <this>/glasses.glb --fit it1=<it1-noglasses.glb> --fitOf glasses=it1
```
It is fitted on the same it1 head as before, so `fit-it1.bin.gz` stays valid. Copy `build.py`, `scene.py` and this
README into `scripts/handbuilt/jensen/blender/glasses/`. `scene.py` now also drops an imported `glasses*` node, so
it can refit on a build that already wears glasses.

To refit on a changed head:
`/Applications/Blender.app/Contents/MacOS/Blender -b --python build.py -- --glb <a head glb> [--render eyes,front,34,profile,back34 --samples 64 --tag NN] [--hide]`
`--hide` renders the head without the glasses, for debugging.
