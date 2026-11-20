# Jensen Heist: the supporting cast, credits and sources

Marge Tolliver, Lola Hart, Nico Brancato, Wesley Trout, Dex Varga, Intern One and Two (`intern-a`, `intern-b`) and
Directors Grey and Navy (`director-a`, `director-b`) are original, invented people: no real likeness, no logos, no face
derived from a photograph or a scan. Mr. Board is Mog City's Mr. Big (see `storykit/handbuilt/jensen/CREDITS.md`).
The earlier sources (the Character Forge's MakeHuman body, clothes and hair, CC0 1.0; the hand passes) are listed in
`storykit/handbuilt/jensen/CREDITS.md`, section "Supporting cast".

## Cast round 1 (19 Nov 2026): the owner's standing rules on every body

Built by `node scripts/handbuilt/jensen-cast/forge.mjs [id,...]` (the forge, then `castpass.mjs` and `groom.mjs`):

| Part | Source | Licence |
|---|---|---|
| the hair cards' strand atlas (`storykit/handbuilt/jensen/parts/hair-strands.webp`, Jensen's, embedded in each body that has cards) | "Hair Cards_FBX" by POLYTRICITY (@PolytricityLtd), Sketchfab, sketchfab.com/3d-models/hair-cards-fbx-ad1ac6f162ff43a3ae175982bf770c3e, modified (see `scripts/handbuilt/jensen/hairatlas.mjs`) | CC BY 4.0, modified |
| the groom: cards laid over the forge's cut by style (a side-parted bob, crops, a side part, curls, ponytails), their flow, colour, salt and pepper, the cut kept as a darker under-layer | made here (`groom.mjs`) | original, CC0 |
| the face targets: blinks, jaw, 15 visemes made symmetric, smiles, brows | MakeHuman Faceunits 01 and Visemes 02 by Mika Suominen (via Jensen's `round8.mjs` mouth targets) | CC0 1.0 |
| the mouth's dark cavity, the lower teeth's biting edge, the eased lip points, each person's skin tone and matched hands, the flat garment front | made here (`castpass.mjs`, Jensen's mouth passes) | original, CC0 |

Credit line (CC BY 4.0 needs it wherever the game lists its asset credits): "Hair Cards_FBX by POLYTRICITY (Sketchfab),
CC BY 4.0, modified". The same line as Jensen's; Intern One and Director Navy keep the forge's own twists and buzz cut
(no cards).

## Cast round 3 (19 Nov 2026): strand hair, a measured flat front, Mr. Board on the plumb line, 6 MB bodies

Built by `node scripts/handbuilt/jensen-cast/forge.mjs [id,...]` (adds `strandgroom.mjs`, `castpass3.mjs`, `slim.mjs`)
and `node scripts/handbuilt/board/build.mjs` (adds `plumb.mjs`). No new third-party asset.

| Part | Source | Licence |
|---|---|---|
| the shared strand groom (Marge's bob, Lola's long layers, Nico's, Dex's and Director Grey's side parts, Wesley's curls, Intern Two's ponytail): the forge's cut taken off, a hairline painted on the scalp, a lifted under-layer, 1,500 to 3,000 alpha-tested cards grown from the scalp to the style's length, collided with the body | made here (`strandgroom.mjs`), cut from the same strand atlas as Jensen's | original, CC0; the atlas CC BY 4.0, modified |
| the flat front and its build gate (1 cm), the shirt drawn in under the Directors' suits, Dex's crew-neck tee, Intern Two's painted collar, Director Navy's beard over the lip ring | made here (`castpass3.mjs`, `castpass2.mjs`) | original, CC0 |
| Mr. Board's clips and rest pose on the plumb line, his flat suit front, his clear (pane-less) glasses | made here (`plumb.mjs`, `board/build.mjs`) over Mog City's Mr. Big | original, CC0 |
| the size diet (texture caps, resampled clips, rounded floats, byte weights) on every body and on Jensen | made here (`slim.mjs`) | original, CC0 |

Credit line unchanged: "Hair Cards_FBX by POLYTRICITY (Sketchfab), CC BY 4.0, modified". Intern One and Director Navy
keep the forge's own twists and painted buzz (no cards).

## Cast round 4 (20 Nov)

Built by `node scripts/handbuilt/jensen-cast/forge.mjs [id,...]` (adds `castpass4.mjs`) and
`node scripts/handbuilt/board/build.mjs`. No new third-party asset.

| Part | Source | Licence |
|---|---|---|
| the groom without a grey cast (grey only on Marge, Director Grey and Mr. Board), each person's own colour, a lower specular, finer and denser cards, Lola's layers past the shoulders, Intern Two's full tapered tail | made here (`strandgroom.mjs`), the same strand atlas | original, CC0; the atlas CC BY 4.0, modified |
| Mr. Board's beard as short dense cards that open with his jaw | made here (`castpass4.mjs`), cut from the same strand atlas | original, CC0; the atlas CC BY 4.0, modified |
| Mr. Board's face targets (blinks, jaw, the 15 visemes, smiles, brows) | the cast's baked targets (`castpass.mjs`) from MakeHuman Faceunits 01 / Visemes 02 by Mika Suominen | CC0 |
| face relief and age (Nico's cheek, brow and jaw; Dex and Intern Two out of the teen look) | MakeHuman's modifier targets (cheek, chin, eyebrows), baked into the rest shape | CC0 |
| the eyes tamed for the office key light, the garments dyed by the render, the flat front on down to the crotch, the sit clips carried with the slump halved and a seated measure, the soles levelled under Mr. Board's plumb clips | made here (`castpass4.mjs`, `castpass3.mjs`, `plumb.mjs`), the sit clips from the shared pack | original, CC0 |

Credit line unchanged: "Hair Cards_FBX by POLYTRICITY (Sketchfab), CC BY 4.0, modified" (now also Mr. Board's beard).
