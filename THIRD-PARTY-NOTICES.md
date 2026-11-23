# Third-party notices

GameMog's own code is under the MIT licence in `LICENSE`. The work of others that GameMog uses
keeps its own licence, listed here. Where a file ports or bundles someone else's code, its header
or the notice beside it says so as well.

## Code

| What | Where in GameMog | Licence |
|---|---|---|
| [Ocean Drive](https://github.com/StarKnightt/ocean-drive) by Prasenjit (StarKnightt), commit 03d1ed6 | `lib/runtime/maps/ocean-drive/` (bundled into `lib/runtime/maps/ocean-drive.js`) | MIT; `lib/runtime/maps/ocean-drive/LICENSE`, changes in `NOTICE.md` |
| [clearwater](https://github.com/SamG-Coder/clearwater) by Lumaris: the shallow-water extinction coefficients | `lib/runtime/maps/ocean-drive/src/world/ocean.js` | MIT; see `lib/runtime/maps/ocean-drive/NOTICE.md` |
| [demolition-derby](https://github.com/drcollect/demolition-derby) by Patrick Hable, commit f559fc6: the derby rules and the AI drivers' tactics | `lib/runtime/derby.js` | MIT; `lib/runtime/derby-LICENSE.txt` |
| [Summer Cycle](https://github.com/StarKnightt/summer-cycle) by Prasenjit: the cyclist's IK, ankle path and poles | `lib/runtime/v1.js` (the cyclist kit) | MIT; the notice is beside the kit |
| [Tidewater](https://github.com/dgreenheck/tidewater) by Dan Greenheck: techniques for the hills, sea stacks, shore waves and palms (no assets) | `worlds/tideline.js` | MIT; the notice is in the world's header |
| [Shinobi Duel](https://github.com/StarKnightt/shinobi-duel) by Prasenjit Nayak (StarKnightt): the look and the synthesized sound (its Mixamo fighters are not used) | `worlds/greatwall.js` | MIT; the notice is in the world's header |
| npm packages (three.js, Next.js, React and the rest of `package.json`) | `node_modules`, not committed | each under its own licence |

### Spiderbench (not MIT)

`lib/runtime/traversal/src/` (bundled into `lib/runtime/maps/traversal.js`) and `lib/runtime/maps/city/src/`
(bundled into `lib/runtime/maps/city.js`, except `src/world/adstex.js`, which is GameMog's own) come from Shikhar's
[Spiderbench](https://github.com/xikhar/spiderbench), commit 64d957f: the traversal physics and
animation state machine, the rig, the chase camera, the line rendering and the input; the procedural city
generator and its street network, its street furniture and trees, the night city's lights, and the
traffic, its vehicles, the pedestrians and their animation clips. The asset library's `city-midtown` textures,
props model, vehicles and people (sources `spiderbench-city`, `spiderbench-city-props`, `spiderbench-city-npc`
in `assets-src/sources.json`) are Shikhar's too, under the same permission, and so are the freeflow moves in
the library humans' clips (`ffJab`, `ffCross`, `ffHook`, `ffKick`, `ffRiser`, `ffLeap`, `ffDodge`, `ffDodgeSide`, `ffLaunch`, `ffAirHold`, `ffAir1`, `ffAir2`, `ffAirSlam`, `ffSlamLand`, `ffFinisher`, retargeted from its hero
rig's combat clips, source `spiderbench-hero-moves`; no model, suit or texture is taken), under his second
permission (3 October 2026: the combat system, and the hero's body and rig with the suit stripped). Spiderbench is
source-available and view-only; its author gave GameMog written permission (2 October 2026) to use
these parts in the GameMog runtime, on gamemog.com and in this repository, for non-commercial use, with
no Marvel, Sony or Insomniac references. **These files are not covered by GameMog's MIT licence**, and
the permission is GameMog's alone: anyone else, in a fork or elsewhere, needs the author's own. See
`lib/runtime/traversal/LICENSE`, `lib/runtime/maps/city/LICENSE` and their `NOTICE.md` files (what was taken
and what GameMog changed).

### phonemizer.js, which is eSpeak NG (GPL-3.0-or-later, not MIT)

`public/storykit/vendor/gpl/phonemizer.js` (served at `/storykit/vendor/gpl/phonemizer.js`) is the npm package
[phonemizer.js](https://github.com/xenova/phonemizer.js) 1.2.1 by Xenova, byte for byte, and it is
[eSpeak NG](https://github.com/espeak-ng/espeak-ng) (text to phonemes, with its language data) compiled to JavaScript:
**GPL-3.0-or-later**, whatever the package's own label says. **This file is not covered by GameMog's MIT licence.** It is
served unmodified as its own file, with the licence's full text (`public/storykit/vendor/gpl/COPYING`) and the source
offer (`public/storykit/vendor/gpl/SOURCE.md`: where its Corresponding Source is, its SHA-256, a copy on request) beside
it, and is loaded only by the Story Kit's voice pass, in the creator's browser, by a dynamic import; it is never bundled
into GameMog's code (`storykit/voices/LICENSING.md`). `npm run check` fails if a byte of it changes.

## Assets

The asset library in `public/assets` is built from pinned sources: those listed in
`assets-src/sources.json`, and the penalty shootout crowd's two Freesound packs, which are listed, with each
take pinned by its hash, in `scripts/assets/crowd-audio.ts`. `public/assets/library.json` records every
source's title, author, licence and link, and every built file's hash. All of them are CC0-1.0
(MakeHuman, Poly Haven, Quaternius, OpenGameArt, ambientCG, Freesound, Kenney, Patch) except the motion capture from the
[CMU Graphics Lab Motion Capture Database](http://mocap.cs.cmu.edu), which Carnegie Mellon
University provides free for all uses: it may be included in products, but the data itself may
not be resold (the database was created with funding from NSF EIA-0196217), and the `city-midtown` textures,
props model, vehicles and people and the humans' freeflow moves, which are Spiderbench's (above), not CC0.
The CMU acknowledgement covers every clip built from that database, the football moves
(`human-moves-football-male` and `-female`: the penalty kicks, the reactions and the keeper's get-up) included.

The penalty shootout's recorded crowd (`audio-crowd-shootout`) is cut from two CC0-1.0 packs on
[Freesound](https://freesound.org), credited with thanks though CC0 does not require it:
["La audiencia disponible"](https://freesound.org/people/freesound/packs/1563/) (pack 1563, an audience
recorded at CaixaForum Barcelona, by Freesound's own account), and the
[GameSoundCon 2024 walla](https://freesound.org/people/ShangusBurger/packs/42098/) (pack 42098) by
Shane Vincent, uploaded by ShangusBurger. Each take used is listed, with its link, under the asset in `public/assets/library.json`.

The creatures (`creature-horse`, `-trex`, `-knight`, `-ogre`, `-ape`, `-centaur`, `-mech`, `-scorpion`) were made by
[Patch](https://patch.gg) (New Save Labs, Inc.) with [anymove](https://github.com/patch-gg/anymove) (mesh and motion
generated with AI) and dedicated by Patch to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/); credited with thanks though CC0 does not require it.
We cut their triangles and textures to a browser game's budget.

The sound packs (`sounds-*`) are [Kenney](https://kenney.nl)'s Impact Sounds, Interface Sounds, UI Audio, Digital
Audio, Sci-fi Sounds, RPG Audio, Casino Audio, Voiceover Pack and Voiceover Pack: Fighter, each CC0 1.0 by the
`License.txt` in its zip; credited with thanks to Kenney (www.kenney.nl) though CC0 does not require it.

The WHY. V-07 race car (`model-why-v07`) is the GameMog owner's own work, built from the model
[why.com/A1](https://why.com/A1/) serves, and dedicated by the owner to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (14 Oct 2026). CC0 does not license trademarks: the
WHY. name and wordmark painted on the car remain the owner's trademarks.

The Grand Prix engine sound (`audio-a1-engine-v4`) is GameMog's own work, dedicated to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/): renders of our own engine script and impulse response,
made with [engine-sim](https://github.com/ange-yaghi/engine-sim) by AngeTheGreat (Ange Yaghi), which is MIT-licensed;
the program is credited with thanks, as its licence covers the program and not what it renders. Its overrun bangs and
blow-off are cut from CC0-1.0 recordings on Freesound by [Dominik_W](https://freesound.org/s/350673/) (350673),
[richwise](https://freesound.org/s/478756/) (478756) and [EwanPenman11](https://freesound.org/s/659544/) (659544),
from Freesound's previews, credited with thanks though CC0 does not require it.

### People: older skins and hair strands (people4, 14 Nov 2026)

The Character Forge's middle-aged and old skins (`human-skins-community`) are from the MakeHuman community's asset
packs, each asset CC0 1.0 by its row on the pack page, credited with thanks though CC0 does not require it:
OnlyTheGhosts' old and middle-aged Eurasian woman and old Eurasian man
([skins01](https://static.makehumancommunity.org/assets/assetpacks/skins01.html),
[skins02](https://static.makehumancommunity.org/assets/assetpacks/skins02.html)), Mindfront's middle-aged African man
and jartur69's old and middle-aged Slavic man (skins02). Only these six skins are used.

The forge's hair strand cards (`hair-strand-cards`, the file `strands.png`) are resampled from
["Hair Cards_FBX"](https://sketchfab.com/3d-models/hair-cards-fbx-ad1ac6f162ff43a3ae175982bf770c3e) by PolytricityLtd,
licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changed: ten of its eleven strips' mask, root, tone
and depth maps resampled into one 512 x 2048 strip; its other maps and its mesh are not used.

### Jensen Return (was Jensen Heist): the cast's hair cards and the Tensore (CC BY 4.0, 19 Nov 2026)

The hair cards of Jensen Return's hand-built cast (`public/storykit/cast/hand/jh-*.glb`, the strand atlas embedded in
each body that has cards) are derived from
["Hair Cards_FBX"](https://sketchfab.com/3d-models/hair-cards-fbx-ad1ac6f162ff43a3ae175982bf770c3e) by POLYTRICITY
(@PolytricityLtd), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changed: taken down to 2048 px,
strands gathered into groups, the signature text cleared, the clump strips redrawn as fine strands inside each strip's
outline, greyed; the groom is GameMog's own.

Jensen Return's ride, the Tensore, is drawn by Mog City (its `wedge` model, in Mog City's repository, not this one) from
a [Sketchfab model](https://sketchfab.com/models/cf52245eb68f48daa909c7ad2a8deaa3) by ALIEEEN, licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changed: repainted lime, every badge and maker's lettering
removed, renamed. A look-alike with no connection to any car maker; credited here because this repository's world
names it.

### People: single-hair brows (people6, 14 Nov 2026)

The Character Forge's brows (the forge kit's `brow-strands.json` and `brow-strands.bin.z`) are Mindfront's fourteen
mesh eyebrows from the MakeHuman community's
[eyebrows01](https://static.makehumancommunity.org/assets/assetpacks/eyebrows01.html) asset pack, CC0 1.0, credited
with thanks though CC0 does not require it. Changed: each hair kept as its rings' middles with MakeHuman's proxy fit
(three base-mesh points, their weights and an offset), and drawn again by the forge to its own width and taper.

### Story Kit motion: the Bandai Namco Research Motion Dataset (CC BY-NC 4.0, not MIT)

Motion data: [Bandai Namco Research Motion Dataset](https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset),
(c) 2022 Bandai Namco Research Inc., licensed [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/):
**non-commercial use only**, with this credit. **These files are not covered by GameMog's MIT licence**, and they are
why the Story Kit stays free on gamemog.com and is never sold. Changed: retargeted from the dataset's BVH files to Mog
City's rigs and then to the Story Kit cast's 66-bone rig, trimmed to loops, played in place, feet set on the ground.

- `public/storykit/cast/cast-clips.glb`, the Story Kit's clip pack: Dan's clips as shipped in GameMog's Mog City, beside
  CMU motion capture and Spiderbench's freeflow moves (above). From the dataset: `run`, `sprint`, `walk` and `jog`
  (retargeted), and the legs of `idle`, `phone` and `talk` (each clip says so in its glTF `extras.motion`). Every
  person a story world draws plays it: the hand-built cast (`public/storykit/cast/hand/`), the forged test casts and
  every creator's forged person.
- `public/storykit/cast/mogcity/dan.glb`: Mog City's Dan, copied for his headshot, with the same clips.
- `public/storykit/cast/mogcity/suits-clips.glb`: Dan's own clips retargeted onto the Suits' rig in Mog City; its
  walks and runs are his, so the same terms are applied to it.
- `public/storykit/cast/mogcity/fiona-moves.glb` and `public/storykit/cast/mogcity/gears-moves.glb`: Fiona's and Gears'
  standing idles and Fiona's run, copied from Mog City for their headshots.
- `public/storykit/forge/kit/clips-src.glb`: Dan's skeleton and his `idle` clip (its legs from the dataset), the
  Character Forge's frame for the clips.

`public/storykit/CREDITS.md` and `public/storykit/cast/mogcity/CREDITS.md` credit the Story Kit's cast; `npm run check`
holds every file in `public/storykit/cast` to a credit, every one under a licence that is not MIT or CC0 to a line here,
and every GLB anywhere in `public/storykit` that names Bandai Namco motion inside it to a line here.

### Mog City episode key art (`lib/episode/art/`)

- `BarlowCondensed-ExtraBold.ttf`: Barlow Condensed ExtraBold, Copyright 2017 The Barlow Project Authors
  (https://github.com/jpt/barlow), under the SIL Open Font License 1.1 (`OFL.txt` beside it). Downloaded unchanged from
  https://raw.githubusercontent.com/google/fonts/2fe1e8c6b137fb13041a7cfca6fdcd8a910ea4dc/ofl/barlowcondensed/BarlowCondensed-ExtraBold.ttf
  (SHA-256 724c9c25952d5f4a2d87185d9767aa006144c5f0d944dc05bf7d5d603551c260, pinned in `lib/episode/art.ts` FONT_SHA and
  checked by `npm run check`), with its licence from the same folder (`OFL.txt`). The owner approved this download (3 Nov 2026).
- `plate-wide.jpg`, `plate-square.jpg`: graded from Mog City's own poster renders (MIT, the Mog City repo).

## Data

The Hometown place index (`lib/places/us-places.tsv.gz`, built by `scripts/places/build-index.ts`) is derived from
the U.S. Census Bureau's [Gazetteer files](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html):
the 2025 national places file (names, kinds, land and water area, internal points) and the 2010 national places file
(2010 population). They are U.S. Government works in the public domain; the Census Bureau is credited with thanks.
The index is not endorsed by the Census Bureau.

## Names and likenesses

Worlds use invented names and look-alikes with no logos. No trademark or likeness of anyone else
is licensed by this repository.
