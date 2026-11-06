/**
 * The headshots' sky (6 Nov, the owner: "main character headshot against a light blue background, not car"): every
 * world's round "Jump in" picture is its hero's face on this soft light blue, top to bottom. lib/runtime/portrait.js
 * keeps the same two colours (it runs in the browser, so it holds its own copy); Classic's bubble (app/cover.tsx) and
 * the card a world with no portrait gets (headshotCard below) use these.
 */
export const SKY = { top: '#DCEFFC', bottom: '#A6D3F2' } as const;

/**
 * The card for a world with no portrait yet (app/g/[slug]/avatar/route.ts): a head-and-shoulders silhouette on the
 * sky, framed as the headshots are (head about half the square, its eyes' line 40% down, centred), never a square cut
 * from a cover (which, for a car or kart world, showed the car). 512 px SVG; the route turns it into a JPEG.
 */
export function headshotCard(): string {
  const ink = '#7DB4DE', S = 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SKY.top}"/><stop offset="1" stop-color="${SKY.bottom}"/></linearGradient></defs>
<rect width="${S}" height="${S}" fill="url(#s)"/>
<rect x="212" y="300" width="88" height="90" rx="36" fill="${ink}"/>
<ellipse cx="256" cy="214" rx="104" ry="128" fill="${ink}"/>
<path d="M44 512 C52 420 130 372 210 362 L302 362 C382 372 460 420 468 512 Z" fill="${ink}"/>
</svg>`;
}

/**
 * The key: one flat, saturated blue a studio that cannot draw a gradient (the Story Kit's portrait studio,
 * public/storykit/forge/portrait.html) puts behind a person, for onSky to swap for the sky's gradient. Saturated, so a
 * pale grey or white shirt is never taken for it; blue, so the few edge pixels mixed with it read as sky.
 */
export const SKY_KEY = '#3D9BE9';

// (onSky, which needs sharp, lives in lib/portrait-sky-key.ts: this file is imported by a client component, app/cover.tsx,
// and a server-only module here broke the production build, 6 Nov)
