# Tensore: downloaded body

`wedge.glb` is based on a 3D model by **ALIEEEN** (https://sketchfab.com/ALIEEEN), from
https://sketchfab.com/3d-models/cf52245eb68f48daa909c7ad2a8deaa3, licensed under **CC BY 4.0**
(http://creativecommons.org/licenses/by/4.0/). `LICENSE.txt` is the notice that came with it, with the work's title (a
real car maker's and model's names) left out: CC BY 4.0 asks for the creator, the licence and a link to the work, not
its title, and the game names no real maker or model anywhere. The author's
page also says: "You can use this model in your projects, commercial or personal."

Credit line (keep it wherever the car is shown):

> Tensore body based on a 3D model (https://sketchfab.com/3d-models/cf52245eb68f48daa909c7ad2a8deaa3)
> by ALIEEEN (https://sketchfab.com/ALIEEEN), licensed under CC BY 4.0. Modified.

Changed from the original (`tools/vehicles/wedge/build.py` in Blender, then `tools/vehicles/wedge/pack.mjs`):

- every badge mesh removed: the crest on the nose, the four wheel centres and the steering wheel's;
- **every texture removed** and none shipped. The source's textures were not the modeller's own: its headlight sheet is
  a photograph of the real car from its maker's advertising (with a slogan), its steering-wheel and cabin sheet a
  photograph of the real cabin (the maker's crest on the wheel and its name on the screen), its engine sheet carries the
  maker's script, its cluster sheet the real car's screen, and a sheet was the maker's crest itself. Only the geometry,
  its UVs and the material names are kept; the game finishes every surface in its own materials
  (`wagmi/storyrun/wedge.js`: its own lime paint, a twill weave drawn in code for the carbon, a dial drawn in code for the
  screen);
- the doors cut free of the body (each side's door skin, glass, inner panel and mirror) so they can swing up;
- the transforms applied, the wheel parts renamed by corner, the fixed parts joined one per material (61 parts),
  quantized and meshopt-compressed (2.6 MB to 0.7 MB, 90k triangles).

In the game it carries the invented name "TENSORE" on its tail and a plate of the game's own. The car is a look-alike:
it bears no maker's name, crest, badge or model lettering, and nothing in Mog City claims any connection with any car
maker. CC BY 4.0 covers the modeller's copyright only.

Taken on 19 Nov 2026 from the unmodified Sketchfab export (its `scene.gltf` carries the same author, licence and
source in `asset.extras`) as redistributed in the public GitHub repository ibrahim-bouriga/backend-modul-project-pse2025
(packages/frontend/public), and **verified against the author's Sketchfab original** the same day: the owner downloaded
the model from its Sketchfab page (the GLB export), and it matches the redistributed copy exactly (105 meshes, 169 nodes,
36 materials, 9 textures, 61,577 vertices, the same author, licence and source in `asset.extras`, and byte-identical
geometry: one sha256 over every primitive's positions, normals, UVs and indices is the same for both). The licence was
checked the same day on the Sketchfab API: "CC Attribution". sha256 of the redistributed `scene.gltf` and `scene.bin`, of
the Sketchfab GLB and of the shared geometry in `SOURCE.sha256`.
