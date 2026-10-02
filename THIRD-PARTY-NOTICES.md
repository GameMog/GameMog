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

## Assets

The asset library in `public/assets` is built from the pinned sources listed in
`assets-src/sources.json`, which records each source's title, author, licence and link;
`public/assets/library.json` records every built file's hash. All of them are CC0-1.0
(MakeHuman, Poly Haven, Quaternius, OpenGameArt) except the motion capture from the
[CMU Graphics Lab Motion Capture Database](http://mocap.cs.cmu.edu), which Carnegie Mellon
University provides free for all uses: it may be included in products, but the data itself may
not be resold (the database was created with funding from NSF EIA-0196217).

## Names and likenesses

Worlds use invented names and look-alikes with no logos. No trademark or likeness of anyone else
is licensed by this repository.
