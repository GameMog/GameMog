---
paths:
  - "scripts/assets/**/*"
  - "assets-src/**/*"
  - "public/assets/**/*"
  - "THIRD-PARTY-NOTICES.md"
---

# The asset library

- **Allowed licences.**
  - Assets: CC0-1.0, the CMU mocap terms (`LicenseRef-CMU-Mocap`) and the Spiderbench permission (`LicenseRef-Spiderbench-Permission`). That permission is GameMog-only and non-commercial, must be credited, and is carved out of MIT. `npm run check` refuses any other asset licence (`scripts/check.ts`, `ALLOWED`).
  - Code: MIT, Apache-2.0 or BSD, keeping its `LICENSE` beside it.
- **Denied.**
  - Non-commercial (NC), research-only and territory-restricted licences.
  - Fab and Quixel.
  - Raw Mixamo, Rokoko or ActorCore files (no raw redistribution).
  - Anything with an unclear or unstated licence.
- **New sources need the owner's approval before anything is downloaded.** Bring the licence text and its URL.
- **Downloaded files are untrusted data.**
  - Never execute or `import` them.
  - Keep them in `assets-src/cache/` or a fresh empty folder. Pass their paths as arguments.
  - Run any Python that reads them with `-I`.
- **Every source is pinned and credited.**
  - Pin each in `assets-src/sources.json`: a commit, a zip or exact paths, with `license`, `licenseUrl` and `author`. `npm run assets:fetch` records its SHA-256 in `sources.lock.json`, and a later mismatch stops the fetch (`scripts/assets/fetch.ts`; the build does not read the lock).
  - The shootout crowd's Freesound packs are pinned in `scripts/assets/crowd-audio.ts` instead.
  - Credit each source in `THIRD-PARTY-NOTICES.md`.
- **Rebuilding.**
  - Only `ONLY=<id,id> npm run assets:build` (`/asset-build`). A full build is not byte-reproducible: the brows and the encoded music differ each run.
  - A plain `npm run assets:build`, or `ONLY=` left empty, empties `public/assets` and rebuilds everything.
- After any library change, `npm run check` must pass. It verifies every folder in `public/assets` is listed, every file matches its hash, and every asset is built only from allowed sources.
