/**
 * Who may use the towns (task G6). HOMETOWN_BUILDER decides, read at run time (not at build time):
 *   off    the production builder is inert; the town routes are the in-process builder's, behind HOMETOWN_TOWNS=on
 *          (local development), exactly as before
 *   owner  /api/towns*, /api/towns/enabled and Create's town box answer ONLY the owner's /admin session (ownerVisit,
 *          lib/dare.ts); everyone else gets 404 and an unchanged Create page
 *   on     everyone
 * The owner check is passed in by the routes (lib/dare.ts ownerVisit), so this file imports neither Next nor the database.
 * Bundle and tile bytes (/towns/{place}/{build}/{tilesId}/{variant}/..., /api/hometown/...) are public but unlinked
 * (random ids, no listing) whenever the builder is not off, because Mog City's engine reads them across origins.
 */
import { townsOn } from '../hometown/config.ts';
import { hometownSearchOn } from '../places/flag.ts';

export type TownsAccess = 'builder' | 'legacy' | null;
export const builderMode = (env: Record<string, string | undefined> = process.env): 'off' | 'owner' | 'on' => (env.HOMETOWN_BUILDER === 'on' ? 'on' : env.HOMETOWN_BUILDER === 'owner' ? 'owner' : 'off');

/** Which builder answers this request's town routes, or null (404). */
export function townsAccess(req: Request, env: Record<string, string | undefined> = process.env, owner: (r: Request) => boolean): TownsAccess {
  const m = builderMode(env);
  if (m === 'on') return 'builder';
  if (m === 'owner') return owner(req) ? 'builder' : null;
  return townsOn() ? 'legacy' : null;
}

/** GET /api/towns/enabled: does Create show the town box for this request (the runtime probe). */
export function townBoxEnabled(req: Request, env: Record<string, string | undefined> = process.env, owner: (r: Request) => boolean): boolean {
  const a = townsAccess(req, env, owner);
  if (a === 'builder') return true;
  // (builder off: what the build-time switch said before, so a dev server with NEXT_PUBLIC_HOMETOWN_SEARCH=on is unchanged)
  return a === 'legacy' && hometownSearchOn();
}
