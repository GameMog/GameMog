---
name: check
description: Run GameMog's offline regression guard, npm run check. It covers the design contract, the static check of every first-party world, the asset library's hashes and licences, and every name in the builder manual against the runtime. Use it after any change and before every commit or push.
---

# npm run check

**Run:** `npm run check` from the repo root. It needs no dev server, Chrome or network, and takes about 4 s.

**Passing:** the last line is `all checks passed`, with exit code 0. A failure prints lines starting `  FAIL` and ends with `<n> FAILED`, exit code 1.

**What it covers** (`scripts/check.ts`):
- the Muse Sprint canary, character protection, rigs, tracks and lanes;
- the static check of the reference world and of every `worlds/*.js`;
- the asset library: every folder listed, every SHA-256 matching, only allowed licences;
- the look pass, Mog DNA, how `lib/generate-game.ts` embeds `lib/runtime/API.md`, and the shootout real-names list;
- the builder's manual (`scripts/api-doc-check.ts`): every name in `lib/runtime/API.md` matched against where the runtime reads it (a key on its own object, a value against what the runtime compares it with, an event against what it sends), and every code example parsed as a world;
- the difficulty contract (`scripts/difficulty-check.ts`) and the design contract (`scripts/design-check.ts`).

**Gotchas**
- It does not type-check. Before a push, also run `npx tsc --noEmit -p .`.
- It boots no Chrome. Runtime and platform behaviour need `/check-runtime` and `/check-platform`; the manual's examples run as worlds in `npm run check:api`.
- A manual failure names the line and what the runtime reads instead. Fix the manual or the runtime; add to the check's `ALLOW` lists only a word the runtime really never names, with its reason (an unused entry fails the check).
- A library failure after an asset build means `public/assets` and `library.json` disagree. Fix the build, not the check.
- Never loosen a threshold to get a pass: the canary exists to catch drift. Report the failing line as printed.
