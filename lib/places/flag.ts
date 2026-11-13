/**
 * Hometown search is off unless NEXT_PUBLIC_HOMETOWN_SEARCH=on at build time (and for the dev server):
 * with it off, the Create page and /api/places are exactly as before. The variable is read by its
 * literal name so Next inlines it into the browser bundle.
 */
export const hometownSearchOn = (): boolean => process.env.NEXT_PUBLIC_HOMETOWN_SEARCH === 'on';
