# phonemizer.js (eSpeak NG): GPL-3.0-or-later, and where its source is

GameMog's Story Kit serves one GPL program: `/storykit/vendor/gpl/phonemizer.js`. It is the npm package
**phonemizer 1.2.1** (`dist/phonemizer.js`), byte for byte as published, and it is **eSpeak NG** (text to phonemes, with
its language data) compiled to JavaScript with Emscripten. eSpeak NG is licensed **GPL-3.0-or-later**, and so is this
file, whatever the package's own Apache-2.0 label says. The licence's full text is `COPYING`, beside it.

## The file

| | |
|---|---|
| served as | `/storykit/vendor/gpl/phonemizer.js` (in the repository: `public/storykit/vendor/gpl/phonemizer.js`) |
| size | 1,322,380 bytes |
| SHA-256 | `193481f474f7c1ea81df3195d18b45df8ef7254dbdccb3f193d60215c4897bec` |
| from | `dist/phonemizer.js` of https://registry.npmjs.org/phonemizer/-/phonemizer-1.2.1.tgz |
| that tarball's npm integrity | `sha512-v0KJ4mi2T4Q7eJQ0W15Xd4G9k4kICSXE8bpDeJ8jisL4RyJhNWsweKTOi88QXFc4r4LZlz5jVL5lCHhkpdT71A==` (SHA-256 `12f9f3582f8b5d557a0577180d83ff0458a4a5c15b2efb625ee71c3ebbee22e9`) |
| changed by GameMog | nothing. `npm run check` fails if a single byte differs from the SHA-256 above |

## Corresponding source (GPL-3.0 section 6(d))

The Corresponding Source of this file is the source of the two projects it is built from, at the versions it was
built from:

1. **phonemizer.js 1.2.1**, by Xenova: https://github.com/xenova/phonemizer.js, at its 1.2.1 release
   (https://github.com/xenova/phonemizer.js/tree/1.2.1). It holds the Emscripten build of eSpeak NG that the package
   ships, the JavaScript wrapper (`phonemize`, `list_voices`) and the Rollup configuration that writes
   `dist/phonemizer.js`.
2. **eSpeak NG**: https://github.com/espeak-ng/espeak-ng, at the revision phonemizer.js 1.2.1 builds (named in
   phonemizer.js's build files). Its `emscripten/` folder is the source of the `eSpeakNGWorker` bindings this file
   exposes, and `espeak-ng-data/` is the language data inlined in it.

**Build notes** (how the published file is made; GameMog builds nothing here): eSpeak NG's `emscripten/` worker is
compiled with Emscripten into one JavaScript module, its `espeak-ng-data` mounted in Emscripten's virtual file system
and inlined as base64 (there is no separate `.wasm` file). phonemizer.js wraps it and bundles it with Rollup
(`npm run build`: `rollup -c && tsc`) into `dist/phonemizer.js` (ES module) and `dist/phonemizer.cjs`. GameMog copies
`dist/phonemizer.js` as it is (`npm run storykit:voice-files` checks it against the SHA-256 above).

**Our offer.** As long as GameMog serves this file, and for at least three years after it last does, GameMog will give
anyone a copy of that Corresponding Source, at no charge, from GameMog's own server on request: open an issue at
https://github.com/GameMog/GameMog/issues. The links above are where the source is published by its authors; if either
stops being available, the copy is the offer. GameMog remains responsible for the source being available, whatever
server holds it.

## How GameMog uses it

- The Story Kit's voice pass (`/storykit/voices/browser-voice-pass.js`, MIT) loads it with a dynamic `import()` only
  when a line needs phonemes in the creator's browser. It is never bundled with, copied into or modified by GameMog's
  own code, which is MIT (a GPL-compatible licence): `npm run check` searches GameMog's own scripts for eSpeak NG.
- A line that already carries its phonemes never fetches it.
- The voice clips the pass makes are output, not the program: neither licence claims them.
