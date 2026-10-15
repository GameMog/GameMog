---
name: asset-build
description: Rebuild named assets of GameMog's licensed library in public/assets, with ONLY=<id,id> npm run assets:build, and fetch pinned sources first if needed. Use it when an asset's recipe in scripts/assets/ changes or an approved source is added. Never run a full build.
argument-hint: "<asset-id,asset-id>"
---

# ONLY=<ids> npm run assets:build

**First:**
- New sources need the owner's approval before any download. Add them to `assets-src/sources.json` and `THIRD-PARTY-NOTICES.md` (`.claude/rules/assets.md`).
- Make sure the cache is there: `npm run assets:fetch` downloads every pinned source into `assets-src/cache/`, which is git-ignored. It records each new file's SHA-256 in `assets-src/sources.lock.json` and stops on a mismatch with the lock.

**Run:**
- `ONLY=<id,id> npm run assets:build`. The ids are folder names in `public/assets` and keys in `public/assets/library.json`.
- To compare first without touching the live library: `OUT=<empty scratch folder> ONLY=<ids> npm run assets:build`. It reads the live library and writes only to `OUT`.

**Passing:** it prints `library: <n> assets, <MB> in public/assets` and one line per rebuilt asset. Then `npm run check` must print `all checks passed`; it verifies the listing, every hash and every licence.

**Gotchas**
- **Never run it without `ONLY`.** An empty `ONLY=` counts as no `ONLY`: either way it empties `public/assets` (all but the baked crowds) and rebuilds everything. A full build is not byte-reproducible, because the brows and the encoded music differ each run.
- **Name only ids that `scripts/assets/build.ts` builds** (its `want('<id>')` blocks). `ONLY` deletes each named folder before building, so naming a baked crowd (`crowd-*`, filmed by `npm run bake:crowd`) deletes it, and `npm run check` then fails.
- **macOS only.** It runs `sips` and `afconvert`.
- **Review the diff before staging.** The diff should be only the named folders and `library.json`. Stage those files by name.
