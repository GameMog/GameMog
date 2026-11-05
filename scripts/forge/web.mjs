// THE CHARACTER FORGE in a creator's browser (FB, browser port): the entry build-web.mjs bundles into
// public/storykit/forge/forge.js. The same pipeline as the Node CLI (pipeline.mjs), on the browser platform.
//   import { forge } from '/storykit/forge/forge.js';
//   const { glb, rec } = await forge(sheet, { log: console.log });   // glb: Uint8Array, a rigged GLB on the cast rig
export { forgeSheet } from './pipeline.mjs';
export { browserEnv } from './env-browser.mjs';
import { forgeSheet } from './pipeline.mjs';
import { browserEnv } from './env-browser.mjs';
let envP = null;
export async function forge(sheet, opt = {}) {
  envP ||= browserEnv(opt);
  return forgeSheet(sheet, await envP);
}
