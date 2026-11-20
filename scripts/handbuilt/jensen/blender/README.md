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

## Caricature round 1 (19 Nov: the owner chose a stylized parody caricature)

`node scripts/handbuilt/jensen/build.mjs` (same parts, no new downloads). New steps from `../caricature.mjs`: `swoop`
(each groom point's height above the scalp t -> t + A(region) * (1 - exp(-t / 7 mm)): the roots stay, the outer layers lift,
A = 40 mm at the front-top quiff, 22 mm crown, 10 mm back, 3 mm over the ears; the front-top also carried 10 mm back) and
`bigglasses` (the front 1.1 x about the bridge, blending to 1 at the temples; the browline bar 1.6 x thicker; gunmetal
0.13 at metallic 0.65). `headsize` now 1.2, and `writeKept` keeps the head bone's scale (before, the write put it back to
1, so the old 1.08 never shipped). `grin`: smile 0.8, viseme_aa 0.25, upper lip up 0.3, cheek squint and dimples 0.3, the
outer brows up 0.6, the inner 0.06 (no worried look), eyeWide 0.2; no eye squint baked. Env overrides: `JH_SWOOP`,
`JH_GLASSES`, `JH_HEAD`, `JH_GRIN`.

## Hair round 1 (caricature round 10, 19 Nov: hair cards, not a sculpt)

`node scripts/handbuilt/jensen/hairatlas.mjs <hair_cards_fbx.glb>` (once: the CC BY strand atlas, `parts/hair-strands.webp`),
then `node scripts/handbuilt/jensen/build.mjs`. New steps: `clumps` now makes only the low, darker dome (`R10.shell`:
shellK 0.55, no locks or wisps) and hands its scalp to `cards` (`haircards.mjs`: inner, mid and outer card layers along a
groomed flow, a front wall and four lifted front locks, six wavy flyaways; material `hair`, alpha MASK 0.5, double-sided,
the atlas's grey times vertex colour, extras hairTone 'light' / hairNormals 'volume' for Mog City's polish.js); `cavity`
(round10.mjs: the lower teeth's texture a biting edge over a dark warm cavity), `black` (the leather x 0.72); the glasses'
front 1.19 x and its bar's arch 5 mm (`R10.glassesBig`, `R10.glasses`). Env overrides: `JH_CARDS`, `JH_CAVITY`, `JH_BLACK`.

## Hair round 2 (caricature round 11, 19 Nov: the in-game silhouette, values and the cards' read)

`node scripts/handbuilt/jensen/hairatlas.mjs <hair_cards_fbx.glb>` (the atlas again: its clump strips 0-9 now filled to a
solid clump inside each strip's own outline, the strand alpha kept only in a broken fringe at the edges and the tip, the
value a soft gradient across the width, darker middle and root, the streaks at a quarter of their contrast), then
`node scripts/handbuilt/jensen/build.mjs`. `round11.mjs` (R11) feeds `clumps` (the under-shell higher, shellK 0.72, a cool
mid-grey), `cards` and `cavity`. `haircards.mjs` takes new knobs (defaults = round 1): `win`, `arch`, `tipSettle`,
`sideStraight` (no curl at the sides: the temple loops), `xDark` (a card's middle darker than its edges), `lowW`, `layers`,
the locks' `lockBiasY`/`lockDrop`/`lockFront`/`lockCards`/`lockW`/`lockUnderDark`, the wall's
`wallRange`/`wallInset` (negative: rooted past the hairline)/`wallBiasY`/`wallBiasK`/`wallLen`/`wallSideLow`/
`wallSideLift`/`wallBright`/`wallDark`, and two new card sets, `temple` (wide flat clumps over and behind the ear and at
the nape) and `crown` (an inner layer of wide mid-grey clumps under the top cards). It logs the four locks' tip angles.
Fixed: the per-card value jitter was drawn per colour channel (pink, green and lilac cards in the game); it is one value
per card now. The swoop's locks lie back over the crown (tips 100-113 deg from vertical, i.e. back and settling onto the
crown, against round 1's upright ones), the mass about 12% lower on top. The in-game kitchen tile's hair median 228 -> ~200
(sRGB), lowlights at the temples and nape. Mouth: the lower teeth's biting edge narrower and in shadow
(tooth 150,140,124), the cavity a deep red-brown (62,26,22) instead of near-black. Env overrides as before (`JH_CARDS`,
`JH_CLUMPS`, `JH_CAVITY`).

## Hair round 3 (caricature round 12, 19 Nov: volume, a soft hairline, a taller swoop, fine strands)

`node scripts/handbuilt/jensen/hairatlas.mjs <hair_cards_fbx.glb>` (the atlas again: each clump strip 0-9 now redrawn as
fine strands inside the source strip's own outline: two depth layers of 1-2 texel strands that wander and end at their own
lengths (a tapered tip), a solid darker core under them for coverage, a root-to-tip value gradient and a soft alpha fade at
the root), then `node scripts/handbuilt/jensen/build.mjs`. `round12.mjs`: `R12` feeds `clumps` (the dome thicker, base
8 -> 12 mm and the top +6 mm, the under-shell at 0.8 of the mass, a softer, gentler hairline roll) and `cards` (1350 cards in
three stacked layers plus a 240-card inner crown layer; five hero locks of 15 cards in three crossed, section-curved levels
rooted 11 mm behind the hairline with a ~20 mm lift; the front wall rooted on the hairline's roll rising up; a row of baby
hairs; wider side cards combed back with tucked tips; four flyaways; per-card root-to-tip gradient). New `haircards.mjs`
knobs (defaults = round 2): `rootGrad`, `shortK`, `lockInset`, `lockStack`, `lockCross`, `lockArch`, `lockStrips`,
`lockTaper`, `lockCut`, `frontTone`, `temple.bias`/`biasK`/`taper`, `baby`. `R12x` + the late `r12` step: the lower teeth's
biting edge darker and narrower, the tongue 4 mm back and 2.8 mm down and darker, the lens rims' top edge arched (3.2 mm)
with the bar's arch 5 -> 7.2 mm, the frames 1.19 -> 1.25 x, the metal a neutral gunmetal (not blue), the leather x 0.78
deeper with less clearcoat and specular. Env override `JH_R12`. In game: hair median in the kitchen tile 189 sRGB, 60 fps.
