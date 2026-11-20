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
