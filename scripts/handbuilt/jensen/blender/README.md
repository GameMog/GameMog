# Jensen, the Blender parts (round "Blender", iteration 1)

The four parts were made in Blender 5.3 (run headless: `Blender -b --python <script.py> -- <args>`), each in its own
folder here with its README: `face/` (the head re-sculpt and the skin, eye and normal maps), `jacket/` (the leather
moto jacket), `hair/` (groomed hair cards, cap and card brows), `glasses/` (browline glasses). The textures they bake
from are CC0 (see `storykit/handbuilt/jensen/CREDITS.md`); the big intermediates (.blend files, texture masters, the
atlas sources) are not in the repo: each README says which script makes them.

The game body is built by `../build.mjs` as before, with these steps from this folder:

- `face-pass.mjs`: `sculpt` (the head re-sculpt, a MakeHuman-format target, `parts/face/head-sculpt.target`), `facemaps`
  (the skin and eye maps, `parts/face/*.webp`), `mouthbag` (the mouth's dark inside) and `teethrigid` (the lower teeth
  swing as one piece about the jaw's hinge in every face target).
- `assemble.mjs`: `strip` (the round-3 hair, brows, glasses and library jacket out), `parts` (the jacket, hair and cap,
  card brows and glasses in, each its own node on his skin, joints re-bound by name, carried onto the current head by
  how the skin moved since the head each was fitted on (`parts/fit-<tag>.bin.gz`); the brows get the skin's 33 face
  targets), `flat` (the owner's "smooth front surfaces": the jacket's front flat from chest to hem, the waist below it
  pulled in), and `writeKept` (the forge's GLB write with nodes added).
- `parts.mjs` turns each part's Blender export into the slim part file in `storykit/handbuilt/jensen/parts/`
  (its meshes only, webp textures, meshopt):

```
node scripts/handbuilt/jensen/blender/parts.mjs --jacket <jacket.glb> --hair <hair.glb> --glasses <glasses.glb> \
  --fit r3=<round-3 jensen.glb> --fit it1=<this build without glasses> --fitOf jacket=r3,hair=r3,glasses=it1
```

The glasses are refitted to the current head by `glasses/build.py -- --glb <a build without glasses>`
(`JH_PARTS_PARTIAL=1 node ../build.mjs out.glb` leaves out a part not made yet).

Environment (as for the rest of the hand-built cast): `FORGE_TOOLBOX_DIR`, `FORGE_MH_BASE`, `FORGE_MH_TARGETS`; the
jacket's texture step also reads `JH_MATERIALS` (the CC0 leather downloads), and the Blender scripts read `JH_GLB`
(the body they fit on, default `storykit/handbuilt/jensen/jensen.glb`).
