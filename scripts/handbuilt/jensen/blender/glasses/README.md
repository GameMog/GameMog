# Jensen's glasses, v3 (scratchpad/jensen/v3/glasses)
Procedural, original. Built by `build.py` (Blender 5.3, headless) from any Jensen GLB; it measures the head (eyes, eye
opening, lashes, nose, skull side, ear, hair cards) so a rerun on a changed head refits it.

Run: `/Applications/Blender.app/Contents/MacOS/Blender -b --python build.py -- --glb <head.glb> --out <dir>
[--render front,34,profile,eyes,bridge,back34,game --samples 64 --tag NN] [--nopanes] [--nooverhair] [--hairtuck]`
(default head: the worktree's storykit/handbuilt/jensen/jensen.glb @ 12464129)

## What changed from it3 (scored 6)
- Real scale: 139.8 mm across the hinge barrels (hinge-to-hinge 137.8), lens 53.7 x 27 mm, DBL 18, wrap 9, tilt 7.
  it3 was 101.8 mm (lens 37.8 x 28) because its "3 mm past the eye corner" rule pinned it to this close-set eye.
- Straight top bar: the lens is levelled in world space (a per-u correction cancels the tilt x wrap drop) and the bar's
  centre line is set to ONE z; the bridge is the same straight bar (bowed forward in plan only if the nose needs it; on
  this head it needs 0 mm, nose clearance 7.3 mm). Measured z spread of the bar centre line: 0.000 mm. No arch, no kink.
- Bar 2.4 -> 2.6 mm tall, 1.9 -> 2.1 mm deep; bridge 2.1 x 1.7 mm. Lens top 5.4 mm above the pupil (eye opening top
  +4.8), bar top +10.2: just above the eyes, under the brows.
- Darker gunmetal #3a3d42 (linear 0.0423, 0.0467, 0.0545), metallic 1, roughness 0.33 (#4b4e52 read as chrome).
- Fine gunmetal pad arms (0.38 mm wire) from the bar's underside, down behind each lens's nasal edge, curling to a box
  clip on an 8.4 x 5 mm clear pad seated on the nose (0.51 mm off the skin). Replaces it3's floating stem pads.
- Temples run straight (side view) from the hinge to just above the ear top, ON the hair where the side hair stands
  out (smoothed hair surface, pressed 0.3 mm in), then bend down behind the ear; tip in dark acetate behind the pinna.
  `--nooverhair` = run at skin clearance (hidden by thick side hair); `--hairtuck` = it3's sink-into-hair.
- Lens: rimless, polished 0.9 mm front bevel (glasses-lens-edge) carries the edge highlight in-game.

## GLB
`glasses.glb`: one node `glasses`, one mesh, 5 primitives: glasses-metal, glasses-lens (alpha 0.10 BLEND, rough 0.03),
glasses-lens-edge (alpha 0.50, rough 0.06), glasses-pads (alpha 0.22), glasses-tips. 28.0k tris, 524 KB, no textures.
Node translation (glTF, m): (0, 1.631546, 0.152679). As a child of the `head` joint (IBM (0,-1.5851409,-0.0332015)):
local (0, 0.0464051, 0.1194775).
Clearances: lenses 5.8 mm, edges 5.5, pads 0.51, visible metal >= 2.2. The temple END behind the ear dips -1.3 mm
(metal) / -3.7 mm (tip) into the skin behind the pinna on purpose (hidden); do not "fix" it.

## Refit on the v3 face (jensen-v3face.glb, 19 Nov 07:07)
`v3face/glasses.glb` = the same frame refitted by build.py on `../face/deliver/jensen-v3face.glb`. Same node
translation (0, 1.631546, 0.152679) and frame (139.8 mm, lens 53.7 x 27, DBL 18, bar z spread 0.000 mm); only the
pads moved onto the new nose (0.46 mm off skin; nose clearance 3.74 mm, lenses 5.1 mm, edges 4.8 mm). Use this file
when the build ships the v3 face; the top-level glasses.glb is the fit on 12464129's head (differs < 1 mm).

## r2 (19 Nov, after the owner's hair/jaw correction) -- THE DELIVERABLE: `r2/glasses.glb`
Built on `../face/deliver/jensen-v3face.glb` with the temples fitted to the NEW hair part (`--hairglb ../hair/hair.glb`):
`Blender -b --python build.py -- --glb ../face/deliver/jensen-v3face.glb --hairglb ../hair/hair.glb --out r2 [--render ...]`
(r1 files kept in prev-r1/.) Changes from r1, all to make the frame read like the reference at game distance:
- Browline bar 2.6 -> 3.1-3.4 mm tall, 2.1 -> 2.5-2.8 mm deep (overlap 0.8); bridge 2.6 x 2.1 mm. Still dead straight
  (bar z spread 0.000 mm), bar top 10.5 mm above the pupil, under the brows.
- Gunmetal darker and satin: #33363b, metallic 1, roughness 0.40 (0.33 read as chrome).
- Lens 53.7 x 28.5 mm (was 27), rimless; edge bevel 1.1 mm, edge alpha 0.60 (lower lens edge now visible).
- Temples 1.75 x 3.2 -> 2.3 mm, tips 1.5 mm, hinge barrel 1.3 mm. Frame 140.5 mm across, hinge-to-hinge 137.8.
- New `--hairglb <hair.glb>`: replaces the head GLB's hair cards with the hair part's for the temple fit. With the new
  hair the temple runs at skin clearance over the short sides to the ear (overall width 171.7 mm, was 179.9).
glTF node translation (0, 1.631725, 0.152697); as a child of `head`: local (0, 0.0465841, 0.1194955).
Clearances: lenses 4.7 mm, edges 4.2, pads 0.46; the temple END behind the pinna dips -1.6 mm (metal) / -3.8 mm (tip)
into the skin on purpose (hidden).

## r3 (19 Nov, art director: r2 scored 5) -- THE DELIVERABLE NOW: `r3/glasses.glb` (r2 kept in prev-r2/)
Built on the R2 face (rounded jaw) + the current hair part:
`Blender -b --python build.py -- --glb ../face/deliver/jensen-v3face-R2.glb --hairglb ../hair/hair.glb --out r3 [--render ...] [--gamemats] [--nopanes]`
- Lower lens edge near-invisible: glasses-lens-edge is now dark-tinted (0.045,0.048,0.052), alpha 0.38, roughness 0.32,
  metal 0; bevel 1.1 -> 0.7 mm. (r2's pale 0.86 edge at alpha 0.60 glowed white in-game once the assembler drops the panes.)
- Bar gunmetal #404349, metallic 0.8, roughness 0.35 (r2's #33363b metal 1 read black in-game).
- Lens 53.7 x 28.5 -> 54.9 x 26.5 mm (wider, shallower), softer lower corners (r 9.0 / 10.5 mm).
- Bar lifted 1.5 mm (topAboveLid 0.6 -> 2.1 mm) so it seats just under the brows; the lower edge stays at the cheek top.
  (Brow auto-seat code is in, but the rest-pose brow cards sit below their posed place, so it only engages on a plausible
  underside; `--browgap` tunes it.)
- Temples: straight in side view, one smooth shallow bow in plan (peak 4.4 mm), no kink; the hinge-normal stub that
  bent them is gone; slim flush hinge barrel (r 1.05 mm, no screw head). End over the ear at 85.5 mm, tucked under the
  side hair, then the same tuck behind the pinna. Overall 172.7 mm, frame 140.5, hinge-to-hinge 137.8.
- `--gamemats` renders the exported engine materials (what the game shows); with `--nopanes` = the in-game look.
glTF node translation (0, 1.633221, 0.152668); as a child of `head`: local (0, 0.0480797, 0.1194666).
Clearances: lenses 5.6 mm, edges 5.3, pads 0.46, bridge-nose 2.6; temple end -1.6 / tip -3.8 behind the pinna (hidden, on purpose).
