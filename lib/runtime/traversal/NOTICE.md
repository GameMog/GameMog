# Traversal, from Spiderbench, in the GameMog runtime

`src/` is the player half of Shikhar's [Spiderbench](https://github.com/xikhar/spiderbench) (commit
64d957f92f005a1c1870070079351e30b2395661): the traversal state machine and its physics (swinging on a line,
wall running and crawling, perching, zipping, diving, the tightrope and the slingshot), the animation state
machine and its procedural layers, the rig, the chase camera, the line rendering and the input. Thank you,
Shikhar.

**Licence.** These files are not under GameMog's MIT licence. They are used with their author's written
permission, which is GameMog's alone and for non-commercial use; see `LICENSE` beside this file. GameMog will
ask the author again before any commercial use.

`entry.js` is GameMog's own: it builds the world the traversal reads from an open world's colliders (boxes,
a ray cast through a grid of them, the ground under a point), wraps the runtime's library hero in the rig,
and hands the open world the player, its camera and its input. `scripts/runtime/build-maps.mjs` bundles it
with `src/` into `lib/runtime/maps/traversal.js`, which a world gets with `open: { traversal: {...} }`.

## What was taken, and what was not

Taken: `src/player/` (player.js, rig.js, camera.js, input.js, web.js, ropeweb.js, slingweb.js),
`src/player/traversal/` and `src/player/anim/`.

Not taken: the hero's model, textures and suits, and the suit-fabric shader; the city, combat, game systems,
audio and render pipeline (the city and the render code may follow under the same permission); the hero's
own animation clips (the animator here runs on the runtime's motion-capture clips and its own procedural
layers).

## Changes

- No reference to Marvel, Sony or Insomniac or their characters remains, as the author asked: comments that
  named them were reworded, `spiderCrouch` is `lowCrouch` and the impact effect `thwip` is `impact`.
- `rig.js`: `loadCharacter` (which loaded the original hero's model file) is replaced by `rigFromModel`,
  which wraps a body the runtime already built, with its bone and finger names mapped to the rig's logical
  ones; the GLB loader and the suit fabric are not imported.
- `player.js`: `createPlayer` takes that rig and the runtime's player group instead of loading a character,
  and the screenshot shots (`src/shots.js`, not taken) are gone.
- `web.js`: the line is a grapple cable by default (`setLineStyle`): the braided dark cord without its lumps
  (`uCable`, `uLumps`), a three-pronged hook where it bites, and no splat decal or fork strands. The thin
  pale thread with its splats remains as an option. The suit-switching hooks were renamed.
- `camera.js`, `input.js`, `traversal/anchors.js`, `traversal/traversal.js`, `anim/animator.js`: comments only.
- Everything runs on the runtime's three.js (r157) through `lib/runtime/maps/three-shim.cjs`.
