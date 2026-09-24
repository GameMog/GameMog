/**
 * The GameMog icon: the logo's first letter, a white G in the display face
 * (Hubot Sans 800) on a black tile. The logo itself is the name alone
 * (app/logo.tsx); the icon is for the places a name does not fit, a browser
 * tab and a home screen.
 *
 * `npm run brand:icons` draws it in Chrome with the self-hosted font and
 * writes the favicon and the iPhone icon from this one description.
 */
export const ICON = {
  letter: 'G',
  tile: '#0B0B0F',
  ink: '#FFFFFF',
  weight: 800,
  /** The tile's corner radius as a share of its side (3px at 16px). */
  radius: 12 / 64,
  /** The letter's height as a share of the tile, so it reads at 16px. */
  height: 0.64,
  font: 'node_modules/@fontsource-variable/hubot-sans/files/hubot-sans-latin-wght-normal.woff2',
} as const;
