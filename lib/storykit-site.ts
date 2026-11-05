/**
 * Story Kit on the site (CREATE A WORLD and MOG for story worlds), behind one server switch.
 *
 * STORYKIT=on in the server's environment opens it, STORYKIT=owner opens it to the owner's admin session only
 * (lib/storykit-switch.ts); anything else (the default) keeps the site exactly as it is: no
 * "Story world" choice on /create, no story Mog composer, and the build route refuses a story build before anything is
 * spent. /create is prerendered, so there the switch is read when the site is built (a Render deploy reads it);
 * /mog/<slug> and the build route read it on every request.
 *
 * A story world's Mog keeps its city: there is no dropdown on /mog, only the city's name, locked. The build route reads
 * the same switch (lib/storykit-build.ts storykitOn) and refuses story builds while it is off.
 */
import { storykitPublic } from './storykit-switch';

/** On for everyone (STORYKIT=on). A page that may open it to the owner asks lib/storykit-http.ts storykitForViewer. */
export function storykitOn() { return storykitPublic(); }

export type StoryCity = 'ny' | 'sf';

/** The CREATE dropdown: the cities a story can be set in today, then the ones coming (shown, not offered). */
export const STORY_CITIES: { id: string; name: string; ready: boolean; note: string }[] = [
  { id: 'ny', name: 'New York', ready: true, note: 'Midtown to the Lower East Side: avenues, cross streets, bridges and the FDR.' },
  // (every story plays on Mog City's engine, the owner 4 Nov; it plays New York so far, so San Francisco waits for its map)
  { id: 'sf', name: 'San Francisco', ready: false, note: 'The hills, the Embarcadero and the bay, cable-car streets and steep drops.' },
  { id: 'sg', name: 'Singapore', ready: false, note: '' },
  { id: 'to', name: 'Toronto', ready: false, note: '' },
  { id: 'ld', name: 'London', ready: false, note: '' },
];
export function isStoryCity(x: unknown): x is StoryCity { return x === 'ny' || x === 'sf'; }
export function storyCityName(id: StoryCity) { return STORY_CITIES.find((c) => c.id === id)!.name; }

/**
 * A story world's city, or null for any other game (or when the switch is off). A story world is stored as the build
 * route stores it (lib/storykit-build.ts): format 'world', meta { mode: 'storykit', storykit: { city, ... } }.
 * `open`: whether the Story Kit is open to this viewer (a server page passes storykitForViewer(); default: on for everyone).
 */
export function storyOf(game: { format?: string; meta?: string | null } | null | undefined, open = storykitOn()): { city: StoryCity } | null {
  if (!open || !game?.meta || game.format !== 'world') return null;
  try {
    const m = JSON.parse(game.meta) as { mode?: unknown; storykit?: { city?: unknown } };
    return m.mode === 'storykit' && isStoryCity(m.storykit?.city) ? { city: m.storykit.city } : null;
  } catch { return null; }
}

/** What the build route says to a story build while the switch is off (app/api/generate/route.ts). */
export const STORY_CLOSED = 'Story worlds are not open yet.';
