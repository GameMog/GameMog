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
| the jacket's cut (open front, notched lapels, flap pockets) | MakeHuman `male_casualsuit05` (people pack) | CC0 1.0 |
| the jacket's leather colour | ambientCG Leather026 (Lennart Demes), ambientcg.com/view?id=Leather026 | CC0 1.0 |
| the leather's fine grain (normal, roughness) | Poly Haven `leather_white` (Rob Tuytel), polyhaven.com/a/leather_white | CC0 1.0 |
| the resting grin and the 33 talking-face morph targets (blinks, jaw, 14 visemes, smile, squints, brows, spares) | MakeHuman Faceunits 01 and Visemes 02 by Mika Suominen, makehumancommunity.org asset packs | CC0 1.0 |
| rectangular glasses (geometry, `scripts/handbuilt/frames.mjs`), plain silver zip, skin, scalp and hair paint | made here | original |

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
