# GameMog Story Kit: what the site serves

Every Story Kit world plays on **Mog City** (mc.gamemog.com: its engine, city, HUD, cars, cast and look). GameMog
builds the world (the builder, `lib/storykit-build.ts`), gates it (`storykit/pack/`), stores it
(`lib/storykit-store.ts`) and frames Mog City to play it. This folder holds only what the creator's browser and the
store need; there is no story engine, city or HUD here.

```
public/storykit/
  work.html, work.js    the creator's browser's work on a built world: forge, headshots, voices, the test drive (a frame
                        of Mog City under its autopilot, heard by postMessage from Mog City's origin only), key art, the
                        report (../../storykit/README.md, "The creator's browser's work")
  forge/                the Character Forge for the creator's browser: forge.js (built from scripts/forge by
                        npm run storykit:forge-web), index.html (?sheet=<url>&auto=1 forges one), portrait.html (a
                        person's headshot from their GLB), clips.js (the forge's clips-runtime.mjs, for the headshots'
                        pose; npm run check keeps the two the same), kit/ (face targets, rig templates, Dan's frame:
                        npm run storykit:forge-kit)
  cast/                 cast-clips.glb (the shared clip pack every forged person moves with); registry.json, the cast
                        registry of Mog City's shipped people and pets (cast/mogcity/: their bodies for headshots and
                        the list of their recorded lines; ../../storykit/cast/README.md); <pack>/ the test packs'
                        forged people (npm run storykit:pack)
  packs/                the test packs in the world format, with their voice clips (packs/<id>/voice/), built from
                        storykit/packs/<id>.json: the checks' fixtures
  voices/               -> ../../storykit/voices (symlink): the voice pass and the creator's page, voices/studio.html
  vehicles/             -> ../../storykit/vehicles (symlink): the vehicle sheets and their studio (dev)
  vendor/gpl/           committed and served: the GPL phonemizer, its licence and its source offer, listed at
                        /storykit/vendor/gpl/. The voice model itself is not served from here: the creator's browser
                        downloads it from Hugging Face and its runtime from jsDelivr (storykit/voices/README.md)
  kokoro/, vendor/*     local copies of the model and runtime for working offline (&model=local), not committed
                        (npm run storykit:voice-files)
  CREDITS.md            every source and licence
```

San Francisco is kept for later as a city module outside the site (`storykit/cities/sf`, not served).

## Storage: a creator's world on GameMog's disk

A creator's world is stored on GameMog's own Render disk (mounted at `data/`, beside `gamemog.db`); there is no R2 or
other cloud storage. Everything heavy is made in the creator's browser; the server gates the pack and stores files.
All of it is behind the server switch `STORYKIT=on` (off by default: every address below is a 404 without it).
The code is `lib/storykit-store.ts`; the addresses are under `app/api/storykit/drafts/` and `app/storykit/f/`.

```
data/storykit/store.db                       drafts, their files, the blobs (SQLite, its own file)
data/storykit/blobs/<first 2 hex>/<sha256>.<ext>   each file once, named by the SHA-256 of its bytes
```

| address | what |
|---|---|
| `POST /api/storykit/drafts` `{ pack, parent? }` | gate the pack and open a draft: `{ id, token, limits }`. The token is shown once; only its SHA-256 is kept |
| `PUT /api/storykit/drafts/<id>/files/glb/<cast id>` | a forged person (GLB 2.0; header, length and JSON chunk checked) |
| `PUT /api/storykit/drafts/<id>/files/voice/<line hash>-<voice key>.ogg` | a voice clip (Ogg or WAV), only for a current line in its speaker's current voice |
| `PUT /api/storykit/drafts/<id>/files/art/<key-wide, key-square, head-<cast id>>.jpg` | key art and headshots (.jpg, .webp, .png) |
| `GET`, `DELETE /api/storykit/drafts/<id>` | its files, what is missing, its bytes against the limits, when it expires; abandon it now |
| `GET /api/storykit/drafts/<id>/pack` | the world as Mog City plays it, no-store (CORS: Mog City's origin) |
| `POST /api/storykit/drafts/<id>/seal` | freeze that pack as `/storykit/f/<sha256>.json`, the address Mog City is framed with (`<mc>/?pack=<site>/storykit/f/<sha256>.json&host=<site>&game=<id>`) |
| `GET /api/storykit/drafts/<id>/source` | the gated source pack (the people's sheets), for the creator's browser's work (`work.js`) |
| `POST /api/storykit/drafts/<id>/report` | the creator's browser's test drive `{ missions, errors, ms, stages }`: the build's draft takes it as its test drive and the stored key art as its cover (`lib/storykit-publish.ts`) |
| `GET /storykit/f/<sha256>.<ext>` | a stored file: `public, max-age=31536000, immutable, no-transform`, ETag the hash; CORS for `https://mc.gamemog.com` only (and local origins off production) |

Every write sends `authorization: Bearer <token>`. The voice studio takes it in the address's fragment
(`studio.html?draft=<id>#t=<token>`, never sent to a server). A Mog is opened with its parent (a kept world): the
gate locks the parent's city, and every person whose sheet is unchanged and every line unchanged in an unchanged voice
points at the parent's blobs, so it costs no bytes.

**Limits per world:** a source pack of 160 KB (the gate's); GLBs 3 MB each and 16 MB in all; clips 1 MB each, 600 of
them and 8 MB in all; art 512 KB each, 16 pictures and 3 MB in all; 24 MB for the whole world (each distinct file
once, inherited ones included). **For the store:** 400 MB of the 1 GB disk (`STORYKIT_DISK_MB`), at most 60 drafts
open at once and 200 opened in any 24 hours. Night Shift is about 3.8 MB (3.5 MB of GLBs, 253 KB of clips, a 19 KB
pack), so the store holds about 100 such worlds; a Mog that keeps its cast costs only what it changed.

**Cleanup:** a draft that is not kept (published) and untouched for 24 hours (`STORYKIT_DRAFT_TTL_H`) is abandoned.
The sweep (at most every 10 minutes, on the next open or upload) removes it, then every blob that no draft points at.
A replaced file's old blob goes at once, when nothing else uses it. Publishing (`POST /api/games`, `lib/storykit-publish.ts`) seals the
draft and calls `keep(id, gameId)`, and a kept world is never swept; `release(id)` hands it back to the sweep.

See `CREDITS.md` for every source and licence.
