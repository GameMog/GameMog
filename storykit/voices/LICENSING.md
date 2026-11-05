# Voice pass: licences

| Part | Licence | Where it runs |
|---|---|---|
| Kokoro-82M v1.0 weights + 54 voices (hexgrad; ONNX build onnx-community/Kokoro-82M-v1.0-ONNX, revision `1939ad2a`) | Apache-2.0 | creator's browser, downloaded from Hugging Face (not hosted by GameMog) |
| transformers.js 3.8.1 (`transformers.min.js`, with onnxruntime-web inside) | Apache-2.0 (ORT: MIT) | creator's browser, loaded from jsDelivr (not hosted by GameMog) |
| `voice-design.js`, `browser-voice-pass.js` (text clean-up and phoneme fix-ups adapted from kokoro-js 1.2.1, Apache-2.0), `clip-codec.js`, `studio.*` | MIT, as the repo | creator's browser |
| npm `phonemizer` 1.2.1 (eSpeak NG compiled to JS, with its language data) | **GPL-3.0-or-later**, although its package.json says Apache-2.0 | creator's browser, as its own file `vendor/gpl/phonemizer.js` |

`kokoro-js`'s browser bundle (`dist/kokoro.web.js`) inlines that same eSpeak NG build, so we do not ship kokoro-js;
`browser-voice-pass.js` talks to transformers.js directly.

GameMog distributes only the GPL phonemizer (below). The Apache-2.0 model and the Apache-2.0/MIT runtime are fetched
by the creator's browser straight from their publishers' hosts (Hugging Face, and jsDelivr's npm mirror), each with
its own licence there; the credits and the studio name them and link the model card.

## What ships, and how (the owner's rule, 4 Nov)

The heavy work runs in the creator's browser, phonemes included. So **the phonemizer runs in the browser too, as a
separate, clearly labelled GPL file**:

- It is served as `/storykit/vendor/gpl/phonemizer.js`, the file exactly as npm `phonemizer` 1.2.1 publishes it. It is
  loaded with a dynamic `import()` by `browser-voice-pass.js` and is never bundled into, inlined in or copied into
  GameMog's own files. kokoro-js is not shipped at all, because its browser bundle inlines eSpeak NG.
- It is committed in `public/storykit/vendor/gpl/` and served with the site. Beside it are the GPL-3.0 text
  (`COPYING`), the source offer (`SOURCE.md`: the file's SHA-256 and npm integrity, phonemizer.js 1.2.1 and eSpeak NG
  as its Corresponding Source, the build notes, and GameMog's offer of a copy from its own server for three years)
  and a page listing the three (`/storykit/vendor/gpl/`).
- `public/storykit/CREDITS.md`, the Story Kit page's settings panel and the voice studio name it as GPL-3.0-or-later
  and link `/storykit/vendor/gpl/`.
- `npm run check` (scripts/storykit-store-check.ts) fails if the file differs by a byte from the recorded SHA-256, if
  the licence, source offer or credits go missing, or if any of GameMog's own scripts contains eSpeak NG or loads it
  other than as that separate file.
- The page that loads it may then count as a combined work under the GPL. GameMog's code is MIT and public, which is
  GPL-compatible, so this can be met. It also rules out loading it next to closed code.

A line may also arrive with its own `phonemes` (made with `toPhonemes` anywhere), and then the GPL file is not fetched
at all (`loadPhonemizer: false`; tested 4 Nov).

**GPL-free in the browser, later:** a dictionary-plus-rules G2P (a CMUdict-style dictionary mapped to Kokoro's IPA,
letter-to-sound rules for unknown words), passed as `g2p`. Expect weaker results on invented names, which games use a
lot, and check each dictionary's own licence before adopting it.

Audio: neither licence claims the generated clips. Every world's NOTICE keeps "synthetic voices, invented; no real
person's voice was used".
