/**
 * Hometown place search: the text rules shared by the index build (scripts/places/build-index.ts)
 * and the search (lib/places/search.ts), so a name and a query are folded the same way.
 *
 * A name or a query becomes lower-case words of a-z and 0-9: accents dropped ("Española" is
 * "espanola"), punctuation a space ("St. Louis" is "st louis"), and the common abbreviations
 * spelled out ("st" is "saint"), so "st louis", "st. louis" and "saint louis" are the same words.
 */

/** Abbreviations spelled out, for a whole word only. */
export const EXPAND: Record<string, string> = {
  st: 'saint', ste: 'sainte', ft: 'fort', mt: 'mount', pt: 'point', mtn: 'mountain', hts: 'heights',
};

/** The 50 states, DC and Puerto Rico: USPS code to name. */
export const STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  PR: 'Puerto Rico',
};

/** Lower-case a-z/0-9 words, accents dropped, punctuation as spaces. No abbreviation is expanded. */
export function words(s: string): string[] {
  return s
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/** The folded key of a name: its words with the abbreviations spelled out, joined by single spaces. */
export function fold(s: string): string {
  return words(s).map((w) => EXPAND[w] ?? w).join(' ');
}
