/** Fills the gallery so the portal can be judged as a portal. */
const PROMPTS = [
  'A drowned cathedral city at low tide. Barnacled spires, green glass light, jellyfish lanterns.',
  'The inside of a grandfather clock. Brass gears the size of hills, dust in the light, everything ticking.',
  'A night market on the back of a sleeping whale. Paper lanterns, steam, warm reds against black water.',
  'An orchard on a dying star. White grass, long shadows, fruit that glows because nothing else does.',
  'A glacier carnival. Blue ice, striped tents frozen mid-collapse, everything squeaking underfoot.',
  'A library that grew into a forest. Ink-black trunks, pages for leaves, lamplight in the canopy.',
  'The last subway station before the desert. Cracked tile, sodium light, sand pouring down the stairs.',
  'A mushroom megacity at rush hour. Neon caps, spore fog, everything humming.',
  'A quarry of fallen bells on a green moor. Verdigris, wet stone, birds nesting in the clappers.',
  'A sugar refinery reclaimed by flamingos. Pink crystal, rusted pipes, shallow warm water.',
  'The roof gardens of a sunken observatory. Brass domes, overgrown telescopes, sea mist.',
  'A racetrack made of stacked shipping containers at dawn. Rust orange, gulls, cold blue shadow.',
];
const base = 'http://127.0.0.1:3939';
let made = 0;
for (const prompt of PROMPTS) {
  try {
    const g = await (await fetch(`${base}/api/generate`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })).json();
    if (g.error) { console.log('skip:', g.error.slice(0, 70)); continue; }
    const pub = await (await fetch(`${base}/api/games`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ spec: g.spec, prompt }),
    })).json();
    if (pub.slug) { made++; console.log(`${String(made).padStart(2)}. ${g.spec.meta.title}  ->  /g/${pub.slug}`); }
    else console.log('publish failed:', JSON.stringify(pub).slice(0, 90));
  } catch (e) { console.log('error:', String(e).slice(0, 70)); }
}
console.log(`\n${made} worlds published`);
