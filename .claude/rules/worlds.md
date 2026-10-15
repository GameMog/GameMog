---
paths:
  - "lib/runtime/**/*"
  - "worlds/**/*"
  - "lib/custom-game.ts"
  - "lib/generate-game.ts"
  - "scripts/runtime/**/*"
  - "deploy/migrations/**/*"
---

# Worlds and the runtime

- **three.js r157 only, as the page's global `THREE`.** `lib/custom-game.ts` loads `three@0.157.0` from jsdelivr. A world has no imports, network, storage, timers, event listeners, DOM access, renderer or camera of its own: the static check refuses all of these. `## Never` in `lib/runtime/API.md` has the full list.
- **Size and budget.**
  - A world is at most 500,000 characters (`WORLD_MAX`).
  - On a laptop: 60 fps, under 300 draw calls, at most one shadow-casting light.
  - A kart race or a shootout on a phone: about 150 draw calls and 350k triangles a frame, shadows included (`API.md`, the "Kart races" performance bullet and the "Penalty shootouts" chapter; a shootout's test drive reports going over, `SHOOT_HEAVY` in `lib/playtest-runtime.ts`).
  - Count draw calls and triangles in Chrome. If you have not measured them, write NOT ASSESSED.
- **`lib/runtime/API.md` is the builder's prompt**: every build and Mog reads it, so every line costs tokens on every build.
  - Edit it only deliberately, and only to describe what the runtime really does.
  - Then run `npm run check`: it matches every name in the manual (ctx paths, option keys on their own objects, values, event names, asset ids) against where the runtime reads it, and asserts how `lib/generate-game.ts` embeds the manual and the shootout chapter.
  - Then `npm run check:api` (the dev server and Chrome): every ctx path and promised return shape on a live world of each kind, and every example run as a world.
  - An allowance in `scripts/api-doc-check.ts` (`ALLOW`, `ALLOW_VALUES`, `ALLOW_CTX`, `FRAGMENTS`) is a name nothing checks: add one only with its reason, and only for a word the runtime really never names.
- **Every live world shares the runtime.**
  - A change for one kind (kart, shootout, open, lap race) must leave every other kind's served page byte-identical.
  - Opt-in only: lighting and look changes must not restyle live worlds.
  - Prove it with `node --import ./scripts/ts-resolve.mjs scripts/world-hash.ts`, run before and after the edit and compared: it hashes every first-party world's page as a player and a test drive get it (host, map and endoskeleton scripts, runtime, world). Every world you did not mean to change must match. (`check:runtime`'s own byte-for-byte check against HEAD no longer runs: HEAD's `v1.js` carries the kart markers.)
  - Then run `npm run check:runtime` (`/check-runtime`).
- **Map and traversal bundles.** After editing sources under `lib/runtime/maps/<id>/` or `lib/runtime/traversal/`, rebuild with `node scripts/runtime/build-maps.mjs`. Never hand-edit the bundled `lib/runtime/maps/<id>.js`.
- **Spiderbench files** (`lib/runtime/traversal/`, `lib/runtime/maps/city/`): keep their `LICENSE` and `NOTICE.md` current, and never add Marvel, Sony or Insomniac references.
- **Look-alikes, never likenesses.** No real players, federations, competitions, sponsors or logos; invent names. Country names and colours are fine.
- **Never `npm run publish:world -- meme-kart`.** It replaces the world's staged key art with playtest captures (`/publish-world`).
