# Kastell: downloaded body

`gwagon.glb` is based on a low-poly 3D model by **DemuriaGT** (https://sketchfab.com/demuriagt), from
https://sketchfab.com/3d-models/aa1a732d4fdc44e0a20cee312a929d77, licensed under **CC BY 4.0**
(http://creativecommons.org/licenses/by/4.0/). `LICENSE.txt` is its notice, with the work's title (a real car maker's
and model's names) left out: CC BY 4.0 asks for the creator, the licence and a link to the work, not its title, and the
game names no real maker or model anywhere.

Credit line (keep it wherever the car is shown):

> Kastell body based on a 3D model (https://sketchfab.com/3d-models/aa1a732d4fdc44e0a20cee312a929d77)
> by DemuriaGT (https://sketchfab.com/demuriagt), licensed under CC BY 4.0. Modified.

Changed from the original (`tools/vehicles/gwagon/build.py` in Blender, then `tools/vehicles/gwagon/pack.mjs`):

- scaled to metres (4.87 m long over its spare wheel), its axles' middle on the origin, its tyres on the ground;
- its one 8 x 8 palette texture removed and not shipped: the body split into parts by the palette's colours (paint,
  chrome, glass, windscreen, lamps, plates, trim, handles, side pipes, the cabin's inside, the underside), each finished in
  the game's own materials (`wagmi/storyrun/gwagon.js`: gloss black paint, chrome, tinted glass, lit lamps, a plate and a
  dash screen drawn in code);
- the front doors cut free of the body (each side's skin, glass, trim, handle and inner panel) so they can swing open;
- a cabin added, made in the build script: two front seats, a back bench, the dash with its screen, a console and a
  steering wheel;
- parts renamed, welded and smoothed, quantized and meshopt-compressed (13.8k triangles, 0.12 MB).

The source has no badge: its grille is two plain bars, its wheel centres plain cones, its spare-wheel cover plain and its
plates blank (checked in Blender, 25 Nov 2026). In the game it is the "Kastell", an invented name, with a plate of the
game's own. The car is a look-alike: it bears no maker's name, crest, badge or model lettering, and nothing in Mog City
claims any connection with any car maker. CC BY 4.0 covers the modeller's copyright only.

Downloaded from the author's Sketchfab page on 25 Nov 2026 (the GLB export; its `asset.extras` carry the same author,
licence and source).
