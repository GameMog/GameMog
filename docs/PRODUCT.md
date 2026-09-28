# GameMog: the product

The owner's words first, then how the product reads them, then where that is built or tested.
A change of direction changes this file first, and the owner approves the reading before it
is built. The platform's rules of play are in [RULES.md](RULES.md).

## The promise

| Owner's words | What it means for the product |
|---|---|
| "Put yourself in the game." | The consumer promise. Every world is played by you. |
| "You are the main character." | The brand line, and the first thing a new visitor reads. |
| "PLAY · MOG · SHARE" | The only three things a player does, on every game. |
| "Personalized playable media" | The category. |
| "There may be infinite generated worlds. There is only one me." | Identity is the organizing primitive: your character is the one thing that travels through every world. |
| "WHO DO YOU WANT TO BE TODAY? And every answer is you." | Who you are stays fixed (your look); what you wear and where you are can change. |
| "almost stupidly simple … No editor. No prompt engineering." | No prompt box, no settings to learn. Claude writes the detailed brief behind the scenes. |

## The flow

| Owner's words | What gets built |
|---|---|
| "First visit: GAME MOG / YOU ARE THE MAIN CHARACTER / LOGIN or CREATE ACCOUNT" | One screen: the wordmark, the line, two buttons. Nothing else. |
| "After onboarding" | Take a selfie, and it becomes your character, a resemblance built from the licensed human models. Then add your name. About 30 seconds. |
| "Where do you want to play?" | One text box and tappable suggestions. The answer fills the feed at once with the nearest existing places and starts building your exact place in the background. |
| "Then an endless visual feed." | Full-screen cards, one after another. The card on screen is live: you, running in that world. Tap to play. PLAY · MOG · SHARE on every card. |

## Decisions (approved 23 Sep 2026)

| Question | Decision |
|---|---|
| Sign-in | Passkeys (Face ID or fingerprint, no password) for the prototype. "Continue with Apple / Google" before public launch. |
| How much of "you" | A resemblance from one selfie: skin, face shape, hair, eyes, build, height. The photo is analysed once and never stored. No copy of a real face. |
| Minimum age | 13 and over. |
| Shared links | Anyone who opens a shared game can play at once with a stand-in character, and is offered "Put yourself in this game". |

## Decisions: music (25 Sep 2026)

| Owner's words | Decision |
|---|---|
| "music does not add value, it makes game worse" | No music by default. The builder is not told a score exists, so new worlds and Mogs sound like their world (crowds, wind, surf, blades). |
| "keep it, it adds value and sound" | Great Wall Shinobi keeps its score (the platform's taiko style). |
| "dormant … it could be an option when someone builds … check box" | The score engine (lib/runtime/music.js) stays in the runtime, silent unless a world's code asks for it. A later option: an "Add music" box when building, off by default. Not built. |
| "we can add the feature later to upload music if users request" | Uploading your own music: only if players ask for it. Not built. |

## Decisions: quality and options (26 Sep 2026)

| Owner's words | Decision |
|---|---|
| "in general we want to lean into assets, AAA & hyperrealism unless otherwise prompted" | The builder's default is hyperreal: the library and kits first (people, cars, skies, surfaces, music), real scale, cinematic graphics and physical materials. A style the creator names (toy, cartoon, low-poly) overrides it. Nothing is stacked from primitives. |
| "that was a MOG, it should have inherited those characteristics" | A Mog edits its original rather than rewriting it, and keeps its kits, library assets, graphics, camera, track, music, options and level of detail unless the idea replaces them. |
| Music checkbox: "Yes, off by default" | Built: "Add music" on Create and Mog, off unless ticked (music still never plays by default). |
| Upgrades to start: builder direction, asset library expansion, water and daylight rendering, car kit convertible and custom driver | Built. Downloads approved (8 skies, 12 surfaces, 10 scanned models, 4 tracks, all CC0): the library is 39 assets. The runtime gained scanned surfaces laid on at true scale with no visible tiling (`ctx.assets.surface`), scanned models (`ctx.assets.model`), photographed skies turned to face the world's sea or skyline, their sun and haze lighting the world (`ctx.sky({ hdri, face })`), the sea with swell, shallows, a beach and surf (`ctx.water`), no headlight beams by day, the open `roadster`, and a library person at any car's wheel (`driver: { human }`). Four more tracks in the music picker. Not built: screen-space ambient occlusion (a depth pass per frame; costly beside the car worlds' mirror and live reflections) and sunglasses for the seated driver. |

## Decisions: Open World and Miami OG (27 Sep 2026)

| Owner's words | Decision |
|---|---|
| "a new option on GameMog runtime next to add music could be 'open world' ... a GTA blueprint game builder for anyone to develop and not follow our strict rules" | A second kind of world: free roam in a bounded 3D map, survival instead of laps. Its own category, "Open World". An "Open world" option on Create and Mog, after the flagship proves the engine ("Flagship first"). |
| "first game is Miami OG ... a Miami OG goes around and knocks people out to collect GM ... enemies get stronger and take more punches ... increase the quantity and quality of GTA like bosses and enemies" | Scope (owner's pick): on foot, cars as traffic. Melee only (fists; thugs punch, bikers swing chains, cops use batons, bosses bats). Heat rises with time: more enemies at once, more punches to put down, new kinds (thugs, bikers, cops by patrol car), bosses. Knockouts drop GM. |
| Leaderboard | Time survived; GM and knockouts beside it. |
| "Main character should like someone from GTA 6" | An original Vice City-era OG (tank top, tattoos, beard, gold chain), no Rockstar character's likeness, names or logos. |
| ocean-drive, clearwater | StarKnightt/ocean-drive (MIT) ported to the runtime as the Miami map, with its notice. SamG-Coder/clearwater (MIT) is a CUDA-to-WebGPU ray tracer that cannot run in the runtime's WebGL renderer; its ocean model (FFT cascades, foam, clear-water optics) is ported into the runtime's water instead. |

Built (27 Sep): the Open World runtime (`lib/runtime/open.js`, walking routes, the fight, the
heat, the police and bosses, civilians, GM drops, a radar), the Ocean Drive map
(`lib/runtime/maps/ocean-drive`, NOTICE.md lists the changes for three r157), street clothes and
gear for library humans, 18 new Quaternius clips (fight and street life), the "Open world"
option on Create and Mog, the Open World category, and Miami OG (now Zombie Beach, `/g/zombie-beach`), published
through the same playtest gate. The shallows use Clearwater's clear-water optics (SamG-Coder/clearwater, MIT; credited in the map's NOTICE.md) with caustics on the sand.

Added (28 Sep, the owner's second round): people move better (a guard held over walking legs,
punches on the move, sidesteps and backpedals, leaning, turning in steps, a fighter's bounce,
blows that carry); hidden melee weapons (bat, pipe, chain, baton, a rare katana) that wear out,
and armed enemies may drop theirs; every edge of the district is something you can see (alley
walls, roadblocks, fences, swim-area buoys; `edges.js`); and the sea is wadeable to mid-thigh.
One new Quaternius clip, `pickup`. Rules: docs/RULES.md 1b.

Added (28 Sep, third round): human motion rebuilt on CMU captures (the owner approved CMU, and it
is the only exhaustively-searched source that is both good and ours to ship): a real boxing guard
and footwork, punches, everyday/cool/confident/women's walks, idles; an opening scene engine
(`open.intro`) and Miami OG's opening (the OG, his club-to-be on Ocean Drive, the crew); "Club
fund" for the GM; traffic stops for people in the road.

## The plan

1. **You, in the game.** Selfie → your character → play LA Olympics as yourself. Every world
   on the GameMog Runtime puts your character in the lead.
2. **The simple app.** The first-visit screen, passkey sign-in, 13+, the selfie, "Where do you
   want to play?", and the feed with PLAY · MOG · SHARE.
3. **Enough worlds.** Measure what a world costs to make, build 30 to 50 places, build requested
   places in the background, one-tap Mogs.
4. **Share and launch.** A clip of your run, recorded in your browser, to share. Hosting,
   per-account limits and moderation.

## Progress

- **Step 1, built (23 Sep 2026).** /me: 13+, selfie or "Pick my look", "Looks like you?" with you
  standing on the LA Olympics start line, one-tap changes, "That's me. Run". Every GameMog
  Runtime world then puts you in the lead; world pages say "Playing as NAME". Your character
  lives in this browser until accounts (step 2).

## Known limits

- Classic games run on the original race engine, which cannot hold your character, so they
  stay on /classic and out of the feed.
- A world takes Claude 10 to 30 minutes to write and playtest, so the feed must open on worlds
  that already exist.
- Until step 2, your character lives in this browser only.
- The library's bodies are built to be seen at race distance. Close up, the kit's edges are
  jagged, the hands are stiff, body B's shoulders sink, and the afro reads as close braids. The
  preview is framed head to toe for that reason. Better bodies are their own piece of work.
