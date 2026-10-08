import { isKartWorld } from './custom-game';
import { kartConstants } from './kart-score';
import { dna } from './mog-dna';

/**
 * A kart race's score constants for its game document (8 Oct, the race's score): the world's measured meta.kartScore,
 * or the course's fallback read from its code, exactly as the scores route and the game page take them
 * (lib/kart-score.ts kartConstants), so the results screen in the game scores a run as the route will. Any other
 * world's meta goes through untouched.
 */
export function withKartScore<M extends object>(code: string, meta: M): M & { kartScore?: unknown } {
  if (!isKartWorld(code)) return meta;
  return { ...meta, kartScore: kartConstants(meta as Record<string, unknown>, code, dna(code).kart) };
}
