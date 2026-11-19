# Jensen Heist: hand-built cast, credits and sources

Built 18 Nov 2026 on branch `jh-hero`. Every body moves with the Story Kit's clip pack (`cast/cast-clips.glb`; its
clips' credits are in `public/storykit/cast/hand/CREDITS.md`), except Mr. Board, who keeps Mr. Big's own clips too.
No face here is derived from a photograph or a scan of a real person.

## Jensen (`storykit/handbuilt/jensen/jensen.glb`)

A parody of a public figure's public keynote persona (the jacket, the hair, the glasses, the grin). Not endorsed.
**Credit wording for the parody is the owner's call (PLAN.md decision 3); proposed:** "A parody of a public figure's
public keynote persona. Not endorsed. Built from CC0 MakeHuman parts."

Built by the Character Forge from `jensen.sheet.json` (MakeHuman's base body, hair and clothes, CC0 1.0; realistic
features at the forge's defaults, no exaggeration), then by hand (`scripts/handbuilt/jensen/build.mjs`):

| Part | Source | Licence |
|---|---|---|
| body, face shape, swept-back hair cards, black tee, jeans, dress shoes | MakeHuman 1.x base mesh and assets (via the Character Forge) | CC0 1.0 |
| the jacket's cut (likeness round 1: the Character Forge library's coat with its stand collar, cut from his body: full sleeves, natural shoulders, the front edge off to his left; hemmed at the belt; the band collar raised by hand) | made here (`scripts/forge/library.mjs`, `scripts/handbuilt/jensen/forge-base.mjs`, `moto.mjs`) | original |
| his age and his lean face (likeness round 1: head fat down, cheek volume down, cheekbones up, a shorter chin, lighter lower lids, hooded lids, thinner lips) | MakeHuman 1.x modelling targets (head, cheek, chin, eyes, eyebrows, mouth) | CC0 1.0 |
| the jacket's leather colour | ambientCG Leather026 (Lennart Demes), ambientcg.com/view?id=Leather026 | CC0 1.0 |
| the leather's fine grain (normal, roughness) | Poly Haven `leather_white` (Rob Tuytel), polyhaven.com/a/leather_white | CC0 1.0 |
| the resting grin and the 33 talking-face morph targets (blinks, jaw, 14 visemes, smile, squints, brows, spares) | MakeHuman Faceunits 01 and Visemes 02 by Mika Suominen, makehumancommunity.org asset packs | CC0 1.0 |
| semi-rimless browline glasses (geometry, `scripts/handbuilt/frames.mjs`: a thin gunmetal top bar, rimless lenses' edges, wire bridge and temples), plain zips, the jacket's yokes, quilted shoulder panels, stitching and collar snaps, skin (creases, age spots), scalp and hair paint | made here | original |

### Blender round, iteration 1 (18 Nov 2026): the parts in `storykit/handbuilt/jensen/parts/`

Made in Blender 5.3 by the scripts in `scripts/handbuilt/jensen/blender/` (each part's README says how) and put on his
body by `build.mjs` (`assemble.mjs`, `face-pass.mjs`). No photo-derived pixels: the owner's reference photo was only
looked at, never sampled, projected or traced.

| Part | Source | Licence |
|---|---|---|
| the head re-sculpt (`parts/face/head-sculpt.target`), the skin's albedo, roughness and normal maps (pores, fine lines, tone), the eyes' irises, the mouth's dark inside, the lower teeth's rigid jaw swing | made here (`blender/face/`: sculpt.py, bake.py, eyetex.py; procedural, on MakeHuman's CC0 UVs) | original, CC0 |
| the leather moto jacket (`parts/jacket.glb`; iteration 2: flat front and back from chest to hem band, princess seams, gunmetal zip, nickel snaps): pattern, cloth drape, full-length metal zip, band collar with two snap tabs, quilted shoulder panels, seams and topstitching, chest and hand-warmer zip pockets | made here (`blender/jacket/`) | original |
| the jacket leather's colour and grain | ambientCG Leather026 (Lennart Demes, ambientcg.com) and Poly Haven `leather_white` (Rob Tuytel, polyhaven.com) | CC0 1.0 |
| the groomed hair cards, cap and card brows (`parts/hair.glb`) and their strand atlas | made here (`blender/hair/`: Blender hair curves, the atlas baked from original strand clumps) | original, CC0 |
| the browline glasses (`parts/glasses.glb`): gunmetal top bar, rimless lenses, straight bridge bar, clear nose pads, hinges, temples tucked behind the ears (iteration 2) | made here (`blender/glasses/build.py`, procedural) | original, CC0 |
| his posture-fixed idle, talk, phone, arms and seated clips (`parts/clips-posture.glb`) | Dan's clips (the cast's shared clip pack) re-posed here on the plumb line (`blender/jacket/posture.py`, `s97_clips.mjs`) | as the clip pack; the change original |
| the neck's skin skirt under the collar, the tee's hem out from under the jacket (`blender/assemble.mjs` neckSkirt, teeUnder) | made here from his own MakeHuman skin points | original, CC0 |

v3 (19 Nov 2026), the owner's corrections, no new downloads: the head's landmark fit and rounder jaw (`blender/face/v3/`,
MakeHuman CC0 targets; the reference photo's landmarks measured, never its pixels), the tousled groom and its code-made
strand atlas (`blender/hair/v3/`, original), the jacket's flat front and its rigid-trunk posture clips (`blender/jacket/`
s82_flat.py, posture2.py; the same CC0 leather), the r2 glasses (`blender/glasses/build.py`, procedural, original).

Still no CC-BY asset, so no credits-page line is needed.

Caricature round 1 (19 Nov 2026, the owner's decision: a stylized, affectionate parody caricature of the public keynote
persona): `scripts/handbuilt/jensen/caricature.mjs` and build.mjs, no new downloads. Only the signature, non-ethnic
features are pushed: the head 1.2 x for the body (the head bone's scale), the silver groom lifted off the scalp into a big
swoop up and back (`hairSwoopPass`), the browline glasses 10% oversized with a thicker gunmetal bar (`glassesBigPass`),
and a warm open presenter grin with lively brows (MakeHuman Faceunits 01 / Visemes 02, CC0, baked at rest). The eyes,
nose and skin are as the realistic build made them. The Sketchfab CC-BY downloads in the research folder were not used.

No CC-BY asset is used in this GLB, so it needs no credits-page line of its own. (The CC-BY candidates in the research
shortlist, e.g. Elvaerwyn's Grump Hair, were not used.)

## Mr. Board (`storykit/handbuilt/board/board.glb`)

An original character: Mog City's Mr. Big (`cast/mogcity/mrbig.glb`, MakeHuman CC0 1.0 parts) after New York. Changed
by hand (`scripts/handbuilt/board/build.mjs`): his tortoiseshell rectangular glasses baked onto the head bone (the
layout of Mog City's runtime pair), teeth and a tongue (Pedro's pass), wet eyes and brown irises, the tie re-dyed a
boardroom grey. No new third-party asset.

## Supporting cast (`storykit/handbuilt/jensen-cast/<id>.glb`)

Marge Tolliver, Nico Brancato, Lola Hart, Wesley Trout, Dex Varga, two Cobalt interns and two Directors: original Story
Kit characters, invented people with no real likeness. Forged by the Character Forge from their sheets (MakeHuman
CC0 1.0 parts) with a light hand finish (`scripts/handbuilt/jensen-cast/forge.mjs`: natural shoulders, wet eyes, irises,
fingers, daylight skin). Marge's headset is geometry made here (`headset.mjs`), plain black, no lettering.
