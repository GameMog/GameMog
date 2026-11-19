# Jensen, the Blender parts (round "Blender", iterations 1 and 2)

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

## Iteration 2 (19 Nov)

The parts' iteration-2 files are in each folder (each README has an "Iteration 2" section). Rebuild:

```
node scripts/handbuilt/jensen/blender/parts.mjs --jacket <jacket.glb> --hair <hair.glb> --glasses <glasses.glb> \
  --posture <blender/jacket/clips/cast-clips.posture.glb> --fitOf jacket=it1,hair=r3,glasses=it1
node scripts/handbuilt/jensen/build.mjs
```

- face: `face-pass.mjs` adds `holeUvPass` (the build's `holeuv` step, before `morphs`: the neck-hole fill's four
  triangles that joined different uv islands, the neck streak) and `holePatchMorphs`; the re-sculpt from round 3
  (`face/sculpt-it2.json`), skin maps from `face/bake-it2.py`; the rest face `grin` and the skin grade (`skinTonePass`)
  defaults retuned.
- jacket: cut flat front and back in Blender (fitted on the iteration-1 body, `fit-it1`); `flat` now only pulls the
  waist in under it (its sim's collider), `teeunder` takes the tee's flared hem out from under it.
- hair: the layered groom (fitted on round 3); iteration 1's `comb` and `hairlook` steps are gone.
- glasses: refitted lower and slimmer (fitted on the iteration-1 head).
- `skirt` (assemble.mjs neckSkirt): the neck's skin hung 5 cm down into the lower collar from the forge's saw-tooth cut.
- `posture` (assemble.mjs ownClips): his idle, talk, phone, arms, sitTalk and sit, posture-fixed (the owner's plumb line),
  carried in his own GLB so Mog City plays them in place of Dan's for him only (`parts/clips-posture.glb`).
