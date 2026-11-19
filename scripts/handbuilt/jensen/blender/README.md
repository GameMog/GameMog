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

## v3 (19 Nov, the owner's corrections: a normal rounded jaw, hair not slicked back, chest and stomach flat)

Rebuild (env as above, plus `PY` for the Python steps):

```
node scripts/handbuilt/jensen/blender/parts.mjs --jacket <blender/jacket export jacket.glb> --hair <blender/hair/v3/hair.glb> \
  --glasses <blender/glasses r2/glasses.glb> --posture <blender/jacket clips/cast-clips.posture.glb> \
  --fit h12=<jensen.glb at 12464129> --fit v3f1=<the 07:00 v3-face build the glasses were fitted on> \
  --fitOf jacket=r3,hair=h12,glasses=v3f1
node scripts/handbuilt/jensen/build.mjs
```

- face (`face/v3/`): the landmark fit on the hm08 head (`solve.py`, `detail.py`; the reference photo is only measured, its
  landmarks, never its pixels) and the pass "R2" (`detail-R2.json`): the jaw corner, jaw line and lower cheeks fuller, the
  hollow under the cheekbone mostly filled, the chin broader and rounder: a normal, softly rounded jaw (not lean, not cut).
  `export.py` writes `parts/face/head-sculpt.target`; `skinmaps.py` the skin and eye maps (unchanged from the 07:00 pass).
  Env: `JH_SCRATCH` (the scratch tree with the CC0 MakeHuman downloads), `JH_FACE_DIR`/`JH_FACE_WORK`, `FORGE_MH_*`.
- hair (`hair/v3/`, its own pipeline, `run.sh`): a thick, full, loosely tousled silver-grey groom with darker roots,
  brushed up and back off the forehead in clumps that separate (coherent noise fields over the scalp), short neat sides;
  the strand atlas is generated by code (`tools/atlas.py`), no downloads. Fitted on the 12464129 body (`fit-h12`).
- jacket (`jacket/`, the same chain, v3 + v3b): tapered torso, finer zip, chest pocket; v3b (the owner: "chest and
  stomach should NOT protrude"): `s82_flat.py` hangs each front panel straight from the chest to the hem band (no pec
  bumps, >= 1 cm off the body), the front panel's clavicle/upper-arm weights moved to the chest bone, `s61_tex.py` rougher
  chest panels with a third of the clearcoat (no sheen painting mounds), `posture2.py` the trunk rigid in idle, talk,
  phone, arms, sit and sitTalk (the clips' spine zig-zag folded any torso belly-out, chest-in) with the seated lean
  capped at 8 degrees. Order: `s80_skin` -> `s82_flat` -> `s61_tex` -> `s90_glb.mjs`; `posture.py` -> copy
  `dump/clips_fixed.json` to `dump/clips_fixed_v3pre.json` -> `posture2.py` -> `s97_clips.mjs`.
  `b10_bodyflat.py` / `body_flat.json` / `apply_bodyflat.mjs`: the body's torso front flattened (pecs and stomach behind
  the chest line); the shipped body has no torso skin under the jacket (cut away by the forge), so it moves nothing in
  this build: it is for a rebuilt body or another outfit (`node apply_bodyflat.mjs in.glb out.glb`).
- glasses (`glasses/build.py`, round r2): a thicker straight satin gunmetal browline bar, taller rimless lenses, a fine
  straight bridge; `--hairglb` fits the temples over the new hair's short sides. Fitted on the 07:00 v3-face head (`fit-v3f1`).

## v3 iteration 2 (19 Nov: a fuller face, salt-and-pepper hair, semi-matte leather, slimmer glasses fit)

Rebuild (env as above):

```
<blender/glasses> Blender -b --python build.py -- --glb <a build with the R12 face> --hairglb <blender/hair/v3 hair.glb> --out r12
node scripts/handbuilt/jensen/blender/parts.mjs --jacket <blender/jacket export jacket.glb> --hair <blender/hair/v3 hair.glb> \
  --glasses <r12/glasses.glb> --fit r12=<the R12-face build the glasses were fitted on> --fitOf jacket=r3,hair=h12,glasses=r12
node scripts/handbuilt/jensen/build.mjs
```

- face (`face/v3/`, pass R12): `detail2.py` applies `detail-R11.json` on top of R2 (cheekbone arch out 5.5 mm, the
  cheek hollows and the jaw side filled, a broader, rounder chin, the mouth 2 mm wider with its corners up 0.9 mm, wider
  nose wings and a rounder tip, a fuller upper lid; the lips sealed over the rest pose's jawOpen 0.07); `ratios.py`
  measures face width/height (0.925 against the references' 0.94) and mouth/eye-corner width (0.63-0.66 against
  0.64-0.66) on MediaPipe landmarks only. `skinmaps2.py`: the wrinkle relief out of the cheeks, eyes and mouth corners,
  a warmer, lighter, less saturated tone with a soft flush, an oily T-zone, the jaw-to-neck colour break smoothed. The
  build's rest grin's smile 0.04 -> 0.12 (build.mjs `grin`).
- hair (`hair/v3/`, iteration 2): a lower, warm-grey silver value with more dark strands, salt-and-pepper patches from a
  smooth noise field (no card blocks), darker at the hairline; the front lifted higher, tighter shorter sides, flyaways
  only on top; the temples raised a little; the `hair` material roughness 0.8 and `KHR_materials_specular` 0.5.
- jacket (`jacket/`, v3c): `s84_arms.py` (after `s82_flat`) takes the sleeves in 10-16% at the upper arm (>= 6 mm off the
  body); `s61_tex.py` semi-matte leather (roughness 0.52-0.88 with a mid-scale crinkle, deeper quilting, seams and
  stitches), clearcoat 0.05 at 0.6 and specular 0.3 (`mats.py`, `s90_glb.mjs`, the material's `extras.look`). The
  build's `matte` step now leaves the leather's roughness and coat as made (build.mjs). Its normal map ships at 3072
  (parts.mjs). `engine/polish-leather-look.patch` (optional, for Mog City's `wagmi/storyrun/polish.js`) lets the
  engine's leather weave honour `extras.look`; not applied by this build.
- glasses (`glasses/build.py`, r3, refitted on the R12 head): a dark faint lower lens edge, a #404349 gunmetal bar
  raised 1.5 mm, 54.9 x 26.5 mm lenses with softer lower corners, straight temples with one shallow outward bow, a
  slim flush hinge.
- body: the forge cuts his torso skin away under the jacket (only the throat under the collar is left), so nothing of
  the body can push the jacket's front out; the jacket front measures a flat 138-141 mm ahead of the spine axis from the
  belt to the chest.
