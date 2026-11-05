# Story Kit credits

The GameMog Story Kit: the creator's side of a story world (forge, voices, the store). Every world plays on Mog City
(mc.gamemog.com), whose own credits cover its engine, city, cars, sounds and fonts. Free to play on gamemog.com.

## Code

- **The Character Forge in the browser** (`forge/forge.js`, `forge/index.html`, `forge/portrait.html`, `forge/clips.js`):
  the Character Forge's own code (`scripts/forge`) bundled with **glTF-Transform** 4.5 (Don McCurdy,
  https://github.com/donmccurdy/glTF-Transform), MIT, **meshoptimizer** 1.2 (Arseny Kapoulkine,
  https://github.com/zeux/meshoptimizer), MIT, and three.js's maths, MIT. It runs in the creator's browser; nothing is
  sent to a server.
- **three.js** (https://threejs.org), MIT, pinned to commit `bc7d0b3c3838d5da9495b5e603afd77ed3154d57` (from jsDelivr),
  for the headshots and the studios.
- **The vehicle sheets** (`vehicles/` -> `storykit/vehicles`): original procedural cars with original names and no
  makers' badges. No model files or photos of real cars are used.

## People

- **The cast's bodies** (`cast/<pack>/*.glb`, and every creator's forged person): built by GameMog's Character Forge
  (`scripts/forge`) from each pack's sheets on GameMog's CC0 MakeHuman body and people pack, with MakeHuman's CC0 face
  targets. Every face is a blend, never anyone's likeness. The forge's talk gate measures faces with a copy of Mog
  City's talking face (`scripts/forge/face.js`), GameMog's own.
- **The forge kit** (`forge/kit/`): `face-kit.*` holds the MakeHuman face targets the forge uses (MakeHuman,
  https://github.com/makehumancommunity/makehuman, `data/targets` at commit `a8bc2d54`, CC0 1.0), parsed and packed,
  with the triangle corners of MakeHuman's base mesh body (CC0). `rig-male.glb` and `rig-female.glb` are the cast rig
  templates from GameMog's Mog City (its own cast, Gears and Fiona) with their bodies and textures removed: only the
  66 joints, the binds, the mouth's inside and a cap are left. `clips-src.glb` is Dan's skeleton and his idle clip (see
  the motion below).
- **Their motion** (`cast/cast-clips.glb`): Dan's clips as shipped in GameMog's Mog City, retargeted to the cast's
  66-bone rig. They include Bandai Namco motion data under CC BY-NC: free GameMog only, never sold.
- **Mog City's shipped cast** (`cast/mogcity/`, the cast registry `cast/registry.json`): Dan, Jane, Mr. Big, Gears,
  Fiona and the Suits, copied from GameMog's Mog City for their headshots, and the list of their recorded lines (the
  recordings themselves stay in Mog City, which plays them). MakeHuman (CC0), CMU motion capture, Bandai Namco motion
  data (CC BY-NC 4.0: free GameMog only), Spiderbench's rig for the Suits (by permission, not MIT):
  `cast/mogcity/CREDITS.md` has each file's.

## Voices

- **Kokoro-82M v1.0** by hexgrad (https://huggingface.co/hexgrad/Kokoro-82M), Apache-2.0, as its ONNX build
  (https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX, revision `1939ad2a8e416c0acfeecc08a694d14ef25f2231`),
  with its stock voices. It runs in the creator's browser, which downloads it from Hugging Face; GameMog does not
  host a copy (`storykit/voices/README.md`). A pack's voices are blends of the stock
  voices, with their speed and pitch changed. They are synthetic and invented, and no real person's voice was used.
- **transformers.js** 3.8.1 (Hugging Face, https://github.com/huggingface/transformers.js), Apache-2.0, with
  **ONNX Runtime Web** (Microsoft, https://github.com/microsoft/onnxruntime), MIT, inside it. The creator's browser
  loads it from jsDelivr (npm `@huggingface/transformers@3.8.1`); GameMog does not host a copy.
- **phonemizer.js** 1.2.1 (https://github.com/xenova/phonemizer.js), which is **eSpeak NG**
  (https://github.com/espeak-ng/espeak-ng) compiled to JavaScript: **GPL-3.0-or-later**. It is served unmodified as its
  own file, `vendor/gpl/phonemizer.js`, with the licence text (`vendor/gpl/COPYING`) and the source
  offer (`vendor/gpl/SOURCE.md`: phonemizer.js 1.2.1 and eSpeak NG, build notes, a copy on request) beside it, all
  listed at `/storykit/vendor/gpl/`. It is loaded only by the voice pass and never bundled into GameMog's code
  (`storykit/voices/LICENSING.md`).
- The voice pass's text clean-up and phoneme fix-ups are adapted from **kokoro-js** 1.2.1 (hexgrad / Xenova),
  Apache-2.0. kokoro-js itself is not shipped.
- The voice clips (`packs/<id>/voice/`, and every creator's world) are rendered by the creator's own browser. Neither
  licence claims them.

## Kept for later, not served

- **San Francisco** (`storykit/cities/sf/`): a modified copy of Slop San Francisco by Kamil (@unable0_) and Mr.doob
  (https://github.com/unable12/slop-sanfrancisco), MIT, with its `LICENSE` and `NOTICE.md` as they came; its map data
  © OpenStreetMap contributors (ODbL 1.0; any modified version published is offered under ODbL), DataSF (PDDL / CC0)
  and USGS 3D Elevation Program (US public domain). Provenance: `storykit/cities/sf/docs/data-sources.md`.
