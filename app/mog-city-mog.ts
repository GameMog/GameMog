import type { GameRow } from '@/lib/db';
import { canMog } from '@/lib/custom-game';
import { storykitForViewer } from '@/lib/storykit-http';
import { isMogCityEpisode, mogCityStoryParent } from '@/lib/storykit-mogcity';

/**
 * The Mog of Mog City on the site's pages (5 Nov): /g/mog-city is the 3 Nov episode and plays exactly as it did, but its
 * MOG is a Story Kit Mog of Mog City's own story world (lib/storykit-mogcity.ts). MOG is live wherever the Story Kit is
 * open to this viewer (STORYKIT=on, or owner-only and the owner's session) and the own world is published; otherwise
 * every page keeps MOG Soon, as before.
 */
export async function mogCityStoryFor(storyOpen?: boolean): Promise<GameRow | undefined> {
  return (storyOpen ?? (await storykitForViewer())) ? mogCityStoryParent() : undefined;
}

/** Whether a game's Mog is open to this viewer: any kind canMog opens, and /g/mog-city when its story Mog is live. */
export async function mogOpenFor(game: Pick<GameRow, 'slug' | 'format' | 'code' | 'meta'>, storyOpen?: boolean): Promise<boolean> {
  if (canMog(game)) return true;
  return isMogCityEpisode(game) && !!(await mogCityStoryFor(storyOpen));
}

/** /mog/mog-city's story composer (app/create/story.tsx StoryMogComposer): Mog City's people and story are remade; its city, meters, clock and kinds of mission stay. */
export const MOG_CITY_STORY_MOG = {
  change: [
    'The people: Dan, Jane, Mr. Big and the Suits, remade: their looks, their roles, their names',
    'Their cars, and who drives what',
    'What they say: a changed line is spoken in a voice near their own',
    'The season, the hour and the weather',
  ],
  stays: [
    'The kinds of mission, the meters and the clock',
  ],
  ideas: [
    'A Christmas story: Jane is the boss and Dan drives a vintage pickup',
    'Mr. Big is a retired opera singer and talks like one',
    'The Suits are all dressed as clowns',
    'A 1970s cop show, in the snow',
    'Jane is the getaway driver and Dan makes the calls',
  ],
};
