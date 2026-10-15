# GameMog

GameMog (gamemog.com): a prompt becomes a playable 3D world; people play, share and **Mog** it (a better variation that joins its family).
Next.js 15 + React 19 + SQLite (`node:sqlite`, `data/gamemog.db`); a world is one script on the GameMog Runtime (three.js r157).
This repo is PUBLIC (GameMog/GameMog, MIT) and a push to `main` deploys production on Render. The owner's rules, in their words: `docs/RULES.md`, `docs/PRODUCT.md`.

## Repo map

- `app/`: pages and API routes. `app/api/generate` runs builds; `app/admin` is the owner's screen, served at a private address (`lib/owner-path.ts`).
- `lib/runtime/v1.js`: the runtime every world gets. The kind kits sit beside it (`open.js`, `kart*.js`, `shootout*.js`, `vehicle.js`, ...). `runtimeSource()` in `lib/custom-game.ts` assembles them per world; the same file holds `staticCheckWorld` and the play document (`renderWorldGame`).
- `lib/runtime/API.md`: the builder's entire manual. `lib/generate-game.ts` embeds it in the build prompt; only shootout Mogs read the "Penalty shootouts" chapter.
- `lib/runtime/maps/`, `lib/runtime/traversal/`: map and traversal sources, bundled by `node scripts/runtime/build-maps.mjs`. The Spiderbench parts are not MIT (`THIRD-PARTY-NOTICES.md`).
- `lib/playtest-runtime.ts`, `lib/test-drive.ts`, `lib/look.ts`: the test drive and its verdict. `lib/browser.ts`: real Chrome over CDP (`withBrowser`).
- `lib/db.ts`: the database. `worlds/<name>.{js,json}`: first-party worlds.
- `deploy/`: `boot.mjs` runs on the server before `next start`. `migrate.mjs` and `migrations/` carry content changes to the live database. `seed.db.gz` seeds a fresh disk only.
- `scripts/`: checks and tools. `scripts/assets/` and `assets-src/sources.json` (+ `sources.lock.json`) build the licensed library in `public/assets/`; `library.json` records every file's SHA-256 and licence.
- Git-ignored, never commit: `.env.local`, `data/*.db`, everything in `/.claude/` except `rules/` and `skills/`, `CLAUDE.local.md` (personal notes), `scripts/.scratch/`, root media files, and dated `docs/*-YYYY-MM-DD.md` notes.

## Commands

| Command | When | Needs |
|---|---|---|
| `npm run dev` | The local site at http://localhost:3939 | |
| `npm run check` | After any change, and before every push. Includes the design contract, the static check of every `worlds/*.js`, and every name in `lib/runtime/API.md` matched against where the runtime reads it | Nothing; about 4 s |
| `npx tsc --noEmit -p .` | Before every push: Render's `next build` type-checks every `.ts` file, `scripts/` included | |
| `npm run check:platform` | After changes to publishing, Mogs, dares, scores, the admin screen, the test drive, build limits or soundtracks | The dev server and Chrome |
| `npm run check:runtime` | After any change to `lib/runtime/` or `lib/custom-game.ts`. `ONLY=kart` (or `kart-diag`, `kart-feel`, `kart-optin`) runs one section | The dev server, Chrome, and about 27 min with the machine awake |
| `npm run check:api` | After editing `lib/runtime/API.md`, or runtime code it describes: every ctx path and promised return shape on a live world of each kind, and every example run as a world | The dev server and Chrome; about 2 min |
| `node --import ./scripts/ts-resolve.mjs scripts/world-hash.ts` | Before and after any runtime edit: a hash of every first-party world's served page. Every world you did not mean to change must match | Nothing; under 1 s |
| `npm run assets:fetch` | Downloads every pinned source into `assets-src/cache/` | The network |
| `ONLY=<id,id> npm run assets:build` | Rebuilds only those library assets. **Never run it without `ONLY`** | The cache; macOS (`sips`, `afconvert`) |
| `npm run publish:world -- <name>` | Publishes `worlds/<name>` to the **local** database through the real gate. **Never for `meme-kart`**: it overwrites the staged key art | The dev server and Chrome |

- Skills in `.claude/skills/`: `/check`, `/check-platform`, `/check-runtime`, `/asset-build`, `/publish-world`, `/deploy`.
- Other scripts: `seed`, `build:engine`, `deploy:snapshot`, `media:hero`, `media:art`, `media:og`, `media:pages`, `brand:icons`, `bake:crowd`. Read the script's header before running one.
- The README's `npm run assets:fetch && npm run assets:build` is superseded: always pass `ONLY=`.

## Standing rules

- **The repo is public.**
  - Never commit or print `.env.local`, keys, passwords or any other secret.
  - Never write a personal email, a person's real name or a private address in a file, commit message or PR. The owner's admin address counts. Credits for third-party work in `THIRD-PARTY-NOTICES.md` are the exception.
- **Git.**
  - Stage files by name. Never `git add -A`, `git add .` or `git commit -a`.
  - Commit only when the owner asks, with the git identity the owner gives you for this repo, and end the message with a `Co-Authored-By:` trailer.
  - Before any commit or push meant for `main`, run `/deploy`: a push deploys production and stops builds in flight. Push only when the owner asks.
- **Reaching production.**
  - A world goes live only through a guarded migration in `deploy/migrate.mjs`, with its files in `deploy/migrations/`. `publish:world` writes the local database only.
  - Production does not serve files added under `public/` after the build.
- **Verify visuals in real or headless Chrome** through `lib/browser.ts`, never an in-app browser pane: the pane blocks `/assets/library.json`, so library worlds fall back to stand-ins there.
- **Run one Chrome suite at a time.**
  - A busy or sleeping machine fails the frame-rate and timing checks (`lib/browser.ts` `HostSlept`).
  - Run long jobs under `caffeinate -i`.
- **Never name Claude, Opus, Anthropic or any model in anything a player sees**: pages, the HUD, build progress or errors. To players, GameMog builds worlds. Two places may name the provider: the privacy page's legal note on the Anthropic API, and the owner-only screen (`app/admin`), which no player sees.
- **Content.**
  - No music by default (`docs/PRODUCT.md`).
  - No FIFA, World Cup, UEFA or other competition marks; no real players, federation crests or sponsors.
  - Look-alikes get original names and no logos.
- **If you cannot measure it, write NOT ASSESSED.** Never present an estimate as a measurement.
- Owner decisions win. Confirm how you read a new rule in writing before building it, and record it in `docs/RULES.md`: the owner's words, what the code does, and the check that proves it.
