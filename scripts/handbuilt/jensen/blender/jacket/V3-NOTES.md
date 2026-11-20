# Jacket v3 (19 Nov 2026): what changed from it3-WIP / it2 (scored 6)

Built from blender/jacket (it3 work-in-progress, which already had: near-black #141414 albedo, clearcoat grain mask,
faired torso, rolled 1.5 cm hem band, quilting limited to the shoulder cap, textured centre zip). v3 changes:

- s30 TAPER: torso half-width now 0.187 (hem) / 0.169 (waist 1.10) / 0.178 (1.20), was 0.191-0.194 straight down
  (boxy). Held >= body+1 cm, tee, jeans. Back plane tapers to the band (common.BACK_HEM 0.124 -> 0.113).
- s30 FRONT HUNG FROM THE CHEST: the forward reach below the pec brought out to the chest line, so no pec step / hollow.
  Centre profile still the exact flat plane (flatten_front).
- s30 SLEEVES: ease cut to 12 mm upper arm / 14 elbow / 10 forearm / 9 cuff (was 17-20, belled cuffs).
- s30 CREASES: discrete slanted crescent folds at the inner elbow + 2 drag folds above the cuff (was a sine train).
- s30 HEM: heavier turned roll (2.7 mm vs 1.8) + hem edge smoothed in plan (no wavy/torn edge, back notch gone).
- s30 TABS: 5 mm further back from the collar's rounded front corner (no crumple).
- s40/s41 ZIP: finer chain (2 mm per tooth, was 3), bevelled teeth with edge highlights; pocket zips now use the same
  mip-friendly textured strip (the modelled box teeth sparkled).
- s61: fine elbow / cuff creases as separate tapering lines (no corrugation).
- mats.py + s90: snaps darker dull nickel (base 0.17, rough 0.48).
- s80: torso below the armpits and the chest front carry no shoulder/upper-arm weight (spine02); pelvis_L/R weight
  moved to root and, above the band, mostly to spine05 (the hip sockets turn with the thighs when seated).

# v3b (19 Nov, owner: "chest and stomach should NOT protrude, naturally flattened")
Cause 1 was the clips, not only the mesh. sitTalk tips the spine joints +28/-1/+18/+31/-7 degrees (idle +15/-12/+4/+6/-14).
That zig-zag folds any linear-skinned torso front into a belly-out, chest-in V. Cause 2 was the arm chain (clavicle,
upper arm) weights on the pec area, which pushed two mounds forward whenever the arms came forward. Cause 3 was
4 mm pec bumps in the bind plus the clearcoat sheen, which painted the mounds.
- posture2.py (after posture.py): in idle/talk/phone/arms/sit/sitTalk, spine05..spine01 share ONE pose delta (a rigid
  trunk from the hips to the upper chest), aimed along the old hip->upper-chest chord. Seated clips are capped at 8
  degrees of forward lean (sitTalk was 21.5, sit 19.7), so he sits upright. neck01 and the clavicles keep their world
  rotation. Writes dump/clips_fixed.json (the previous one is clips_fixed_v3pre.json). s97 then writes
  clips/cast-clips.posture.glb (68 channels).
- s82_flat.py (after s80, from skin_v3pre.blend): every front column is a straight vertical run from the chest row
  (z 1.32) to the band (1.00), and the chest row is a smooth arc with no pec bumps. One smooth forward field moves the
  leather, zip, hardware and snaps together (max 4.4 mm). It is held at least 1 cm off the flattened body. On the
  front panel below the yoke, all clavicle/upper-arm weight goes to spine02. Re-dumps export/.
- s61_tex.py: roughness +0.12 and clearcoat x0.35 across the torso front (sternum to the hem band).
- b10_bodyflat.py: the BODY torso front is flattened in the bind (633 verts, -15.4..+2.8 mm). The pecs go from
  12.8 to 12.1 cm, the stomach from 13.1 to 11.5 cm (behind the chest line), and the sternum gap and under-pec fold
  are filled. lib.py applies it to every skin prim and the full body (BODYFLAT=0 turns it off). The field for the
  assembler is body_flat.json, applied by apply_bodyflat.mjs <in.glb> <out.glb>.
Results: the posed front (chest frame) is flat in idle and sitTalk (14.0/13.9/13.8/13.4/12.4 cm across |x|). In the
bind, the chest-to-band columns are straight to within 3 mm. No visible skin pokes through in rest, idle, walk,
sitTalk, sit, talk, argue, shrug or wave (s85).

# v3c (19 Nov, art director it2: "glossy black latex in game, round blobs, puffy upper arms")
- s84_arms.py (after s82, from skin_v3b.blend): sleeves taken toward the body along its normal (excess clearance x0.4-0.72,
  more at the upper arm's front beside the chest), field smoothed over the mesh, held >= 6 mm off the body. Upper arm radius
  -10..-16% (t 0.14-0.26 m: 69.5/68.2/66.0/64.5/63.6 -> 63.8/58.3/56.4/57.7/53.2 mm), forearm ~-6%. Front-of-arm clearance
  15-25 -> 8-13 mm. Poke test (ALL covered body points) equal or lower than v3b in every clip. dumplib.py = s82's dump.
- s61_tex.py: semi-matte (roughness base 0.66, clamp 0.52-0.88, crinkle-driven +-0.06), a mid-scale crinkle emboss
  (0.25 mm, 6-14 mm cells, survives mips), quilting 1.3 -> 2.1 mm with deeper channels, seam grooves 0.5 -> 0.9 mm, stitches
  0.26 -> 0.42 mm, thread a touch lighter, inner-elbow/inner-arm drag folds and a long fold on the upper arm's front.
- s90_glb.mjs: clearcoat 0.05 @ 0.6, specular 0.3, extras.look = {leather:'matte', roughMin .55, roughMax .9, spec .3, env .4,
  coat .05, coatRough .6}; normal jpeg q86. mats.py matches.
- engine/polish-leather-look.patch: storyrun/polish.js weave() honours extras.look (Jensen's jacket only).
- ig/: in-game test kit (swap2.mjs, ig.sh on port 7671, shadow engine for the studio harness). Backups: *_v3b.*, export_v3b, tex_v3b.
