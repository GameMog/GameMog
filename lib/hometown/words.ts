/**
 * Hometown towns: what a player reads about a town's build (no tool, model or vendor names: scripts/hometown-words-check.ts).
 * Shared by the in-process builder (lib/hometown/towns.ts) and the production builder (lib/hometown-build/towns.ts).
 */
import type { TownState } from './towns.ts';

/** What a player reads (no tool, model or vendor names: scripts/hometown-words-check.ts). */
export const TOWN_WORDS = {
  unknown: 'No US town by that name.',
  busy: 'Lots of towns are being built. Try again in a few minutes.',
  failed: 'We couldn\'t build this town right now. Try again.',
  slow: 'This town took too long to build. Try again in a few minutes.',
  interrupted: 'The town build was cut short. Ask again to pick it up.',
  notReady: 'Your town is still being built.',
  stage: { queued: 'Waiting its turn', reading: 'Reading the map', fetching: 'Reading the map', compiling: 'Building streets', assembling: 'Putting it together', ready: 'Ready', error: 'Not built', interrupted: 'Cut short' } as Record<TownState, string>,
};
