// Story Kit voices, offline copies: put Kokoro-82M and its browser runtime where the dev server serves them, for the
// voice studio's &model=local. Nothing here is committed (.gitignore). Without it (and on gamemog.com) the creator's
// browser fetches the same files from Hugging Face (the pinned revision) and jsDelivr (browser-voice-pass.js).
//   node scripts/storykit-voice-files.mjs [downloads dir]       (npm run storykit:voice-files)
// The downloads dir (default .scratch/storykit/downloads, see its SOURCES.md) holds:
//   kokoro-82m-onnx/                 https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX (Apache-2.0)
//   kokoro-js/node_modules/          npm kokoro-js@1.2.1 installed with --ignore-scripts: @huggingface/transformers 3.8.1
//                                    (Apache-2.0, onnxruntime-web inside: MIT) and phonemizer 1.2.1 (GPL-3.0-or-later)
// It fills, by copy-on-write clones where the disk allows (APFS: no extra space):
//   public/storykit/kokoro/kokoro-82m-onnx/   config, tokenizer, onnx/model.onnx (fp32, WebGPU, 326 MB),
//                                             onnx/model_quantized.onnx (q8, WASM, 92 MB), voices/*.bin (28 MB)
//   public/storykit/vendor/                   transformers.min.js, ort-wasm-simd-threaded.jsep.{mjs,wasm}, LICENSE
//   (public/storykit/vendor/gpl/ is committed: phonemizer.js unmodified, GPL-3.0-or-later, with COPYING and SOURCE.md;
//    this checks the npm package's file is the same bytes)
import { copyFileSync, constants, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DL = path.resolve(process.argv[2] || path.join(ROOT, '.scratch/storykit/downloads'));
const ONNX = path.join(DL, 'kokoro-82m-onnx'), NM = path.join(DL, 'kokoro-js/node_modules');
const OUT = path.join(ROOT, 'public/storykit');
let bytes = 0, files = 0;
function put(from, to) {
  if (!existsSync(from)) { console.error(`missing: ${from}`); process.exit(1); }
  mkdirSync(path.dirname(to), { recursive: true });
  copyFileSync(from, to, constants.COPYFILE_FICLONE);
  bytes += statSync(to).size; files++;
}
const model = path.join(OUT, 'kokoro/kokoro-82m-onnx');
for (const f of ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model.onnx', 'onnx/model_quantized.onnx']) put(path.join(ONNX, f), path.join(model, f));
for (const f of readdirSync(path.join(ONNX, 'voices')).filter((x) => x.endsWith('.bin'))) put(path.join(ONNX, 'voices', f), path.join(model, 'voices', f));
put(path.join(ONNX, 'README.md'), path.join(model, 'README.md'));   // the model card: licence apache-2.0
const tj = path.join(NM, '@huggingface/transformers');
for (const f of ['transformers.min.js', 'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) put(path.join(tj, 'dist', f), path.join(OUT, 'vendor', f));
put(path.join(tj, 'LICENSE'), path.join(OUT, 'vendor/LICENSE'));
// the GPL part is committed (public/storykit/vendor/gpl: phonemizer.js unmodified, COPYING, SOURCE.md, index.html):
// the npm package's file must be the same bytes, or SOURCE.md's offer would describe another file
const GPL_SHA256 = '193481f474f7c1ea81df3195d18b45df8ef7254dbdccb3f193d60215c4897bec';
const npmFile = path.join(NM, 'phonemizer/dist/phonemizer.js');
if (existsSync(npmFile)) {
  const got = createHash('sha256').update(readFileSync(npmFile)).digest('hex');
  if (got !== GPL_SHA256) { console.error(`phonemizer.js in ${npmFile} is not the committed 1.2.1 file (${got})`); process.exit(1); }
}
console.log(`${files} files, ${(bytes / 1e6).toFixed(0)} MB in public/storykit/kokoro and public/storykit/vendor (not committed)`);
