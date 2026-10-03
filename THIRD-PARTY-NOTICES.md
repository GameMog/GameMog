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
generator and its street network, its street furniture and trees, and the night city's lights. The asset
library's `city-midtown` textures and props model (sources `spiderbench-city`, `spiderbench-city-props` in
`assets-src/sources.json`) are his too, under the same permission. Spiderbench is
source-available and view-only; its author gave GameMog written permission (2 October 2026) to use
these parts in the GameMog runtime, on gamemog.com and in this repository, for non-commercial use, with
no Marvel, Sony or Insomniac references. **These files are not covered by GameMog's MIT licence**, and
the permission is GameMog's alone: anyone else, in a fork or elsewhere, needs the author's own. See
`lib/runtime/traversal/LICENSE`, `lib/runtime/maps/city/LICENSE` and their `NOTICE.md` files (what was taken
and what GameMog changed).

## Assets

The asset library in `public/assets` is built from the pinned sources listed in
`assets-src/sources.json`, which records each source's title, author, licence and link;
`public/assets/library.json` records every built file's hash. All of them are CC0-1.0
(MakeHuman, Poly Haven, Quaternius, OpenGameArt) except the motion capture from the
[CMU Graphics Lab Motion Capture Database](http://mocap.cs.cmu.edu), which Carnegie Mellon
University provides free for all uses: it may be included in products, but the data itself may
not be resold (the database was created with funding from NSF EIA-0196217), and the `city-midtown` textures
and props model, which are Spiderbench's (above), not CC0.

## Names and likenesses

Worlds use invented names and look-alikes with no logos. No trademark or likeness of anyone else
is licensed by this repository.
