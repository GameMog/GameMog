# Story Kit voices

Every spoken line of a pack is voiced with Kokoro-82M in the creator's own browser. There is no GPU server, no cloud
storage and no paid API. The clips are stored with the world (GameMog's store), and Mog City plays them. Until a line has a clip,
it plays as a subtitle, so a pack is playable before its voices are done.

| file | what it is |
|---|---|
| `voice-design.js` | A voice block (one Kokoro voice or a blend of up to 3, speed, pitch) becomes a style and the post-processing. Also: the line hash, the voice key, the clip's name and the loudness envelope that drives the jaw |
| `browser-voice-pass.js` | The pass: WebGPU fp32, or WASM q8 when WebGPU is missing or fails. Caches the model and finished clips. If the computer can't render, it falls back to subtitles |
| `clip-codec.js` | A rendered line becomes Ogg Opus at 32 kb/s (WebCodecs plus our own Ogg muxer), or WAV where the browser has no Opus encoder |
| `studio.html`, `studio.js` | The creator's page: `/storykit/voices/studio.html?pack=<id>` (`&auto=1` starts at once) |
| `../../public/storykit/vendor/gpl/` | The GPL phonemizer (committed, unmodified), its GPL-3.0 text and its source offer (see `LICENSING.md`) |
| `../../lib/storykit-store.ts` | A creator's world on GameMog's disk: clips, GLBs and art by content hash, per-draft uploads (`PUT /api/storykit/drafts/<id>/files/voice/<name>`) |
| `../pack/voice-store.mjs` | A committed repo pack's clips beside it (local dev: the same upload address with the id `repo-<pack id>`) |
| Mog City's `radio/voices.js` (its own repo) | The game side: `W.voice.clip` registers a world's clip under its line, so Mog City's voice chain plays it (subtitle, ducking, phone band, the jaw's level) |

## How a pack gets its voices

1. `npm run storykit:pack -- <id>` writes the voice plan into the built pack (`public/storykit/packs/<id>.json`,
   `.voice`). The plan holds each speaker's linted block and voice key, plus every spoken line with its clip name,
   `<line hash>-<voice key>`. A choice's prompt is shown on screen and is not voiced. The command also prints how many
   lines are voiced, how many are pending and which clips are stale.
2. Open `/storykit/voices/studio.html?pack=<id>` on the dev server. It renders each line that has no clip yet and
   `PUT`s each clip to `/api/storykit/drafts/repo-<id>/files/voice/<name>` (local dev only; a creator's world uses
   `?draft=<id>` and its token instead, see "A creator's world" below). The store writes `public/storykit/packs/<id>/voice/<name>.ogg` and records
   the clip in `voice/manifest.json`, keyed by that name: line, speaker, voice, hash, length, bytes, device and render
   time. It only accepts a clip whose name is a current line in its speaker's current voice.
3. Reuse comes from the names. An unchanged line in an unchanged voice keeps its name, so its clip is kept. If a line's
   text changes, only that line is rendered again. If a voice block changes, only that person's lines are rendered
   again. Clips that no line uses any more are listed as stale by `storykit:pack`.
4. In a world, Mog City plays them: a line on screen (a `say`, a call's lines, a choice's reply, a cutscene's line, a
   voicemail) plays its clip through Mog City's own voice chain, a call through its phone band, the speaker's jaw on
   the clip's loudness. A line without a clip yet is a subtitle and Mog City's mumble.

## A creator's world (the store, STORYKIT=on)

A world being made is a draft in the world store (`lib/storykit-store.ts`, on GameMog's own disk). The studio opens it
as `/storykit/voices/studio.html?draft=<id>#t=<token>`: the token travels in the fragment, which is never sent to a
server, and is kept in the tab's sessionStorage. Each clip is `PUT` to `/api/storykit/drafts/<id>/files/voice/<line
hash>-<voice key>.ogg` with `authorization: Bearer <token>`, stored once by its SHA-256 and served at
`/storykit/f/<sha256>.ogg` (immutable). The world's pack (`/api/storykit/drafts/<id>/pack`) lists each clip in its
voice plan's `clips` with that URL, so Mog City fetches no manifest. A Mog keeps its parent's clips for every line
it did not change. See `public/storykit/README.md` (Storage).

## Where the model comes from

The creator's browser downloads Kokoro straight from its own hub, Hugging Face:
`https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/1939ad2a8e416c0acfeecc08a694d14ef25f2231/`
(`MODEL_HUB` in `browser-voice-pass.js`; config, tokenizer, `onnx/model.onnx` fp32 326 MB, `onnx/model_quantized.onnx`
q8 92 MB, voices of 510 KB each). The revision is pinned, so the files never change under us. huggingface.co answers
with CORS for any origin and redirects the big files to its CDN (`us.aws.cdn.hf.co` and other `*.hf.co` hosts). The
runtime, transformers.js 3.8.1 with onnxruntime-web inside, comes from jsDelivr (`RUNTIME_CDN`:
`https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/`). GameMog's server and disk hold none of it; no
R2 or CDN of ours. The studio's content security policy (`next.config.ts`, `/storykit/voices/*`) allows exactly
these hosts.

The GPL phonemizer, `public/storykit/vendor/gpl/`, is the exception: it is committed and served by GameMog (1.3 MB),
with its licence and source offer.

Measured 5 Nov 2026 (this Mac, headless Chrome, production `next start`, WebGPU fp32, a fresh browser profile): the
first run downloaded 325.5 MB from Hugging Face plus 4.3 MB from jsDelivr, and the model was ready in 32.8 s (about
10 MB/s); with the first line rendered, 34 s. A second page load in the same browser: model from the cache in 0.5 s,
the line rendered 1.1 s after the page asked. No CSP violation, no console error; jsDelivr's `transformers.min.js` is
byte-identical to npm's 3.8.1 (SHA-256 `aa5002b7...`).

If the download fails (Hugging Face down, a network that blocks it), the pass falls back to subtitles and the
browser's speech, and the studio and the build show say so in GameMog's own words ("The voice model could not be
downloaded from Hugging Face just now ..."). The world still builds and plays.

### Working offline (local copies, not committed)

`studio.html?...&model=local` loads the same files from `/storykit/kokoro/kokoro-82m-onnx/` and `/storykit/vendor/`
(471 MB, in `.gitignore`). To put them there:

```
npm run storykit:voice-files                 # from .scratch/storykit/downloads (see its SOURCES.md)
npm run storykit:voice-files -- <dir>        # or from another folder of the same shape
```

The source folder needs `kokoro-82m-onnx/` (https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX, revision
`1939ad2a`) and `kokoro-js/node_modules/` (`npm install --ignore-scripts kokoro-js@1.2.1`, for
`@huggingface/transformers` 3.8.1 and `phonemizer` 1.2.1). The script copies with copy-on-write clones, so on APFS it
costs no extra space.

A creator's browser downloads the model once (328 MB on WebGPU, 94 MB on WASM). It is cached afterwards
(`transformers-cache`), and so are finished clips (`storykit-voice-clips`).

## Night Shift (test-night-shift), 4 Nov 2026, this Mac, headless Chrome, WebGPU fp32

- **Cast:**
  - Dez: `am_michael` 55 % + `am_puck` 30 % + `am_liam` 15 %, speed 1.06, pitch -0.5. Median pitch 115 Hz.
  - Mrs. Kwon: `af_nicole` 50 % + `af_kore` 30 % + `af_sarah` 20 %, speed 1.02, pitch +0.8. Median 169 Hz.
  - Sgt. Ray: `am_onyx` 60 % + `am_michael` 25 % + `bm_lewis` 15 %, speed 0.92, pitch -1. Median 92 Hz.
- **Render:** 24 lines, 63.5 s of speech.
  - The pass took 14.7 s (4.7 times faster than real time), and 15.4 s from opening the page to the last clip stored.
  - Loading the model from local files took 1.3 s.
  - A line took 0.54 s to render on average and 1.38 s at most. Encoding to Opus took 15 ms a line.
- **Size:** 253 KB of Ogg Opus for the 24 clips, against 3.0 MB as WAV.
