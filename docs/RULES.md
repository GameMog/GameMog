# GameMog rules

The single source of truth for the platform's rules. Each rule is the owner's words, then how
the code reads them, then where that is tested. A change to a rule changes this file first,
and the owner approves the interpretation before it is built.

North star: **the internet, playable.** Prompt → build world → play → share → **Mog**.
AI generates, humans select, winners reproduce. Platform first; movement second.

---

## 1. Every world (the GameMog Runtime, `lib/runtime/v1.js`)

| Owner's words | Interpretation in code | Tested by |
|---|---|---|
| "future games are endless laps … there is no final lap" | No finish. Level = the lap you are on. | `check:runtime` "there is no final lap" |
| "you start with 1 competitor" | When you start (any key or a tap), one rival stands beside you on the start line through the countdown and starts from standing at the gun. | "any key starts your run: one rival stands on the start line beside you through the countdown" |
| "the 'Enter or tap to start' or any overlay over the game ruins the experience … the user can see gameplay" and "the tap to enter screen should only pop up and inhibit the game once someone presses the PLAY button" (Sep 23) | Until someone asks to play, the world races itself with nothing over it: a demo run that steers itself, cannot crash, makes no sound, is never scored or posted, and starts over every few laps. The start screen (you and one rival on the line, the controls, "Enter or tap to start") appears only when someone asks: the page's Play button, or a tap or a key on the demo. Pause and results are a bar along the bottom; results left alone give way to the demo. Classic races: the start card is hidden until Play, without the blur. | "before anyone asks to play …", "Play brings up the start screen …", "a key on the demo also brings up the start screen …", "the results are a bar along the bottom" |
| "each lap … 1 additional competitor appears with a slightly faster speed and aggressiveness than prior lap" | As you cross the line, rival k joins at the line (6 m past it, in a clear lane, in view of the camera), faster and more aggressive than rival k−1. It holds its lane for 2.5 s before it hunts you. | "one new rival per lap", "each new rival is faster / more aggressive", "every rival joined at the start line" |
| "gradual increasing speed, aggression and difficulty per lap" (Sep 23) | Every lap: your speeds × 1.05 (to 1.6×); every rival already racing gains 0.015 of your speed and 0.02 aggression; moving obstacles × 1.04 (to 1.5×). | "your pace rises every lap", "rivals already racing gain on you and hunt harder" |
| "only way to die is bump a competitor or obstacle" | Touching a rival or an obstacle ends the run; nothing else does. | "touching an obstacle or rival ends the run" |
| "coins will be golden and called GM" | Golden GM coins, identical in every world, re-laid every lap. | "GM coins are collected" |
| "mobile controls and desktop spacebar is pause, navigation is arrow keys" | Arrows or WASD steer and change speed, Space pauses, touch buttons on phones. | controls checks |
| "2D should not be allowed" | Every world is 3D, seen through the runtime's chase camera; worlds cannot create, move or re-project cameras. | `check` "worlds are 3D" |
| "goal is to get to highest level without getting killed" | Leaderboard ranks level, then GM. | score route |

### Cars (platform option `play.vehicle`, 25 Sep 2026)

| Owner's words | Interpretation in code | Tested by |
|---|---|---|
| "the main car being a Mercedes hypercar and enemies such as F1, mostter trucks and Nascars" | A car kit in the runtime (`ctx.assets.car`, `lib/runtime/vehicle.js`) for any world or Mog: a hypercar, a single-seater, a stock car and a monster truck, built in code, with a driver, lights, gears, engine sound, sparks and crashes. Look-alikes only: no maker's badge, no series' or casino's name (the owner's choice, "Look-alikes, no logos"). | `check:runtime` "cars: …" |
| "Car speeds, same rhythm" (the owner's choice for how fast cars go) | A world of cars multiplies every speed and every distance along the track by 2.2: 160 km/h cruising on lap 1, over 350 flat out late on, laps of 704 to 1,980 m and a road up to 24 m wide, so a lap takes as long as a runner's and a rival joins as often. The per-lap rules (5% faster, one more rival, one touch ends it) are unchanged. | "speeds and distances are 2.2 times a runner's" |
| "only way to die is bump a competitor or obstacle" (for cars) | A car's hitbox is its footprint: its length along the track and its width across, with rounded corners. A car alongside you is not a touch. | "a car's hitbox is its footprint", "a car alongside, not touching, is not a crash", "a car touching yours ends the run" |

### The creator's options (Create and Mog, 26 Sep 2026)

| Owner's words | Interpretation in code | Tested by |
|---|---|---|
| "add more OR less, obstacles each lap as a platform option, maybe a dropdown on creation?" and the choice "Dropdown: Fewer / Same / More" | A dropdown on Create and Mog, default The same. Stored with the world and enforced by the runtime, whatever the world's code says (`play.hazards`, `lib/world-options.ts`). More lays copies of the world's own obstacles each lap, about 15% more a lap, up to double and never past the track's density, never two in a row. Fewer clears about 10% a lap, down to a third. A Mog starts from its original's choice. | `check:runtime` "the creator's options" |
| "is there a checkbox for music currently?" and the choice "Yes, off by default" | An "Add music" box on Create and Mog, unticked by default; ticked, a track dropdown from the library's CC0 tracks. The runtime plays the track in any world; the builder never composes music. A Mog starts from its original's music. | "music ticked on the page plays in a world that never asked for it" |

## 1b. Open worlds (`lib/runtime/open.js`, 27 Sep 2026)

| Owner's words | Interpretation in code | Tested by |
|---|---|---|
| "a new option on GameMog runtime next to add music could be 'open world' which is feel more like a GTA blueprint game builder for anyone to develop and not follow our strict rules and patterns of prior games" | An "Open world" box on Create and Mog. Ticked, the builder writes `GameMog.world({ open: {...} })`: a place to roam on foot, not a lap race. The lap rules above do not apply; the obstacles dropdown hides. The runtime runs the fight, the people, their routes round walls, the heat, the HUD and the scores; the world says where and who (its map or its own ground, and the looks, names and weapons of its crew). A Mog of an open world stays one. | `check:runtime` "open worlds: …" |
| "These will have their own category. Call it Open World" | An "Open World" page (`/open-world`) in the menu, after Create, listing every open world; its genre is "Open World". | page loads |
| "knocks people out to collect GM" | Knockouts spill GM coins that come to you when you are near. Bystanders can be knocked out too (1 GM, and the heat rises). | "punches knock them out, and their GM comes to you" |
| "The enemies get stronger and take more punches to defeat as the game goes on" | Heat rises every 40 s (the world can set 15 to 180) and every 8 knockouts. Each level: more of them at once (2 + 1.6 per level, up to 12), each takes more punches (+0.7 a level; bosses +2.5 and +5 per boss), hits a little harder, moves faster and winds up sooner; more of them may swing at once (1 + one per two levels, up to 4). | "the people who come for you fight" |
| "increase the quantity and quality of GTA like bosses and enemies" | Thugs from heat 1, bikers with chains from 2, the police by patrol car with sirens from 3 (officers with batons; the car runs down whoever is in the road), a named boss with his escort at every third level, with a banner and a health bar. | "heat 3 brings a patrol car and a named boss" |
| "Survival is your goal" and the choice "Time survived" | A run ends when you are knocked out; the board ranks the time survived, GM and heat beside it. | "a knockout ends the run with the time survived", score route (survival) |
| The choices "On foot, cars as traffic" and "Melee only" | You go on foot; cars are traffic and patrol cars. Fists for you (jab, cross, hook combos, a roll), and whatever melee weapon you find; thugs punch, bikers chains, cops batons, bosses bats and pipes. No guns, no blood. | same |
| "Main character should look like someone from GTA 6" | An original Miami OG (tank, ink, beard, chain, shades, jeans): no Rockstar character's likeness, names or logos (stated to the owner in writing). | review |
| "improve the human movements of the main characters and enemies" (28 Sep) | The body moves in two halves: a guard held up over walking legs, punches and swings thrown on the move with the legs still stepping. Sidesteps turn the hips toward the step with the chest on the foe; backing off plays the walk in reverse; turning on the spot takes small steps; runners lean into turns and forward as they drive on; a fighter at rest bounces on the balls of the feet. Blows carry people back in a slide, not a jump; punches and strikes step in. The hero squares up when trouble is within 9 m. | films; "open worlds: …" |
| "he should be able to obtain hidden weapons and use them. they can be hidden throughout the game" (28 Sep) | Melee weapons only (the earlier "Melee only" choice): a bat, a pipe, a chain, a baton, or a rare katana, 8 at a time in the map's hiding places (alleys, bins and dumpsters, the lifeguard towers, the sea wall, the dune grass, against fences and barriers), glinting now and then; another turns up out of sight every 30 s. Walking over one takes it; E (GRAB on touch) swaps. Armed, the three hits are swings that hit harder and further (a katana hardest); a weapon breaks after 12 to 26 hits. Bikers and officers put down may drop theirs. The world can set the count and mix, or `weapons: false`. | "weapons are hidden about the map", "walking over one puts it in your hand", "an armed swing lands and wears the weapon down" |
| "when he goes down an alley and can't go further beyond those limits it should be a wall" (28 Sep) | No invisible walls. The service alleys run 20 m back to block walls with a bin or a dumpster; the cross streets 20 m to jersey barriers, a construction fence and a ROAD CLOSED barricade; both ends of the district are fenced from the hotels to the sea. Passing cars stop at the roadblocks and go round again only out of sight; patrol cars come from inside them. | "an alley runs back to a wall, and the wall stops you" |
| "maybe in the ocean he could at least get feet wet" (28 Sep) | You (and whoever follows) wade into the sea to about mid-thigh, where a line of swim-area buoys stops you; the water holds you back as it deepens, spray and a ring of foam round the legs, and each step sloshes. The swash counts: a wave running up the sand wets your feet. | "you can wade into the sea, as far as the buoys" |

## 2. Mog (v1)

| Owner's words | Interpretation in code | Tested by |
|---|---|---|
| "'Mog' means challenge this game with a better variation" | Every game has a **Mog** button. A Mog is a new game made from another one plus a one-line idea for how to make it better. | `check:platform` |
| "a button to take original code of game and 'MOG' it into a derivative" | Claude Opus 5.5 receives the original's complete code (a runtime world's module; for older formats, what it was built from), the original prompt and the challenger's idea, and writes a complete new world. It passes the same static check and Chrome playtest as any world before it can publish. | generation path; `check:platform` publishes a Mog |
| "the original is always credited" (Mog v1 plan) | A Mog records its parent, its family's root and its generation. Its page says "Mogged from …" and links the original; the original's page lists its Mogs. | `check:platform` lineage |
| "humans select" | On a Mog's page, a **Mog-off** asks: this Mog or the one it challenged? A pick counts only if that browser has finished a run in **both** games. One pick per browser per Mog-off; it can be changed. | `check:platform` counted / uncounted picks |
| "winners reproduce" (selection signal, v1) | Each family is ranked by Elo over its counted Mog-off picks (K = 32, from 1000), then by distinct players. The leader is marked on its page. (Featuring winners is step 5, not built.) | `check:platform` Elo |

## 3. You

**Paused by the owner (23 Sep) until the character is right.** Games play their own heroes;
`YOU_IN_GAMES` in `lib/me.ts` turns this back on. The runtime keeps full support and its tests.

| Owner's words | Interpretation in code | Tested by |
|---|---|---|
| "You are the main character" / "Put yourself in the game" | When the page passes the player's character (the frame's URL fragment, which never reaches a server), it replaces `player()` in every GameMog Runtime world, and a new look can arrive mid-run. The world's own `player()` still runs and plays when there is no character. | `check:runtime` "you are the main character" |
| "every answer is you" | One character everywhere: a realistic library human with your skin tone, hair, eyes, build, kit, name and number. Classic races cannot hold it. | same |
| A resemblance from a selfie, never a copy (decision, 23 Sep) | One selfie is read by Claude for visible appearance only (skin colour, hair, eyes, build). It is never asked to identify anyone or infer ethnicity or gender. The photo is never stored. | `check:platform` "the selfie route cannot store a photo" |
| 13 and over (decision, 23 Sep) | The selfie is refused without the 13-or-older confirmation, and refused if the photo is clearly of a young child. | `check:platform` "a selfie needs the 13-or-older confirmation" |
| Honest numbers | A preview of a world (the /me start line, films, key art) is not a play; opening the game to play it is. | `check:platform` "a preview … is not a play" |

### Known limits of v1

- **Players are browsers, not verified humans.** Without accounts, a "player" is an id the browser
  generates for itself. That stops accidents, not fraud. Verified human audiences, which creator
  earnings depend on, need accounts.
- **Distinct players count finished runs**, reported by the game frame; a game's `plays` counter
  counts page loads.
