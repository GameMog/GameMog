---
name: publish-world
description: Publish a first-party world from worlds/<name>.js and .json to the LOCAL database through the same gate as a generated world (static check, kart-score measurement, real-Chrome playtest). It does not deploy. Never for meme-kart.
argument-hint: "<world-name> [--mog <parent-slug> --prompt \"<what it changes>\"]"
disable-model-invocation: true
---

# npm run publish:world -- <name>

**Needs:**
- The dev server on `BASE` (default http://localhost:3939; use the running one) and Chrome.
- `worlds/<name>.js` and `worlds/<name>.json`. The JSON must pass `WorldMetaSchema` in `lib/custom-game.ts`.

**Run:**
- `npm run publish:world -- <name>`.
- A first-party Mog: `npm run publish:world -- <name> --mog <parent-slug> --prompt "<what the Mog changes>"`.

**What it does** (`scripts/publish-world.ts`):
1. `staticCheckWorld`.
2. For a kart world, measures the score's constants (`scripts/kart-score/measure.mjs`).
3. Inserts a draft and test-drives it in Chrome (`playtestWorld`).
4. Publishes the draft, or updates the game with the same slug in place, keeping its URL and board. For a kart world it rescores the board.

**Passing:** it prints `static check: clean (<n>KB)`, `ready in <ms>ms, <fps> fps, reached ...`, then `published <BASE>/g/<slug>` or `updated <BASE>/g/<slug>`, with exit code 0. A failure prints `static check:`, `meta:` or `playtest failed:` with reasons, and exits 1.

**Gotchas**
- **Local only.** Production gets a world through a guarded migration: an entry in `deploy/migrate.mjs`, with the code, `.meta.json` and the cover, icon and wide JPGs in `deploy/migrations/`. Shipping it then needs `/deploy` and the owner's go-ahead.
- **It overwrites the game's cover and key art** (`cover`, `art_icon`, `art_wide`) with playtest captures. Never run it for `meme-kart`. If it happens, restore from `deploy/migrations/meme-kart-*.jpg`.
- **A failed playtest leaves its draft** in the local `drafts` table (prompt `first-party world: <name>`). Delete it when done.
- **Run it alone in Chrome.** A busy machine lowers the measured fps.
