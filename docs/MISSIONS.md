# Mog City: the missions

The story and the cast below are docs/STORY.md's (the source: change it there first); the last part is how a mission
is built in the code.

**Mog City** (mc.gamemog.com) is GameMog's flagship open-world mission game, in a browser-sized Manhattan. Episode 1 is
**Unfinished Business**: the lockup reads **MOG CITY**, the gold rule, **UNFINISHED BUSINESS**. All names, companies and events in Mog
City are fictional; JPBank (the owner's choice of name) and Blimpco are invented.

## The story

Dan is a first-year associate investment banker at JPBank. This week he was fired and charged with insider trading:
somebody inside the bank bought Blimpco, a sleepy airship company, days before its merger news, and every one of those
trades now has Dan's name on it. JPBank needed someone to take the fall, and the new guy was right there.

He still has one thing: his laptop, and what's on it. At 5:45 PM he steps out of his building on E 37th St with it in
his bag, on his way to a lawyer, and JPBank's security team is waiting: a van of thugs in suits, the **Suits**. They talk
like HR, rip the bag off his shoulder, shove him down and tear off. Then a video call: **Mr. Big**, JPBank's CEO, from his study, a cigar in his hand: the man who set Dan up. Sign the confession, terms by text, stop digging. The laptop has a tracker.

To prove he is innocent Dan has to follow the evidence where the Suits take it, mission by mission. **Jane**, his
girlfriend since their college days at SUNY, pieces it together: the tracker, the burner the Suits left behind and its
twin, a handler's group chat, the paid rally where JPBank's insiders plan to sell. Their dog **Moon** lives with Jane and
comes along when Dan meets her in person. The Suits fight him at every step. By the end of Episode 1 the insiders are
stuck holding Blimpco, Dan has a handler's phone full of proof, and **Rook**, a junior on the security team, wants out:
he is driving Dan's laptop to the shredder at dawn.

Tone: short, deadpan-funny, a finance thriller told by a man who is very tired of being blamed. No guns, no knives: fists,
bats, bottles and trash cans. Nobody in it is a real person.

## The cast

| Name | Who | Look | Voice |
|---|---|---|---|
| **Dan** (the player) | Mid-20s, first-year associate at JPBank, fired and charged. | Tall and lean (about 1.88 m, long-limbed, narrow shoulders, an easy loping walk): the build only, an **original adult face**: a long jaw, light stubble, tired dark eyes, short dark hair a week past a haircut. White shirt open at the collar, sleeves rolled, slim dark trousers, white trainers, a navy overshirt; a black laptop bag across his left shoulder in the opening. | A grown man's dry baritone with a New York edge; quick and deadpan, the jokes are armour; polite until he isn't. |
| **Jane** | Mid-20s, Dan's girlfriend since SUNY; works in data and reads logs for fun; she pieces the evidence together. Adult. | Puerto Rican, athletic build (a runner's shoulders and legs), warm brown skin, dark curly hair tied up, small gold hoops; a fitted dark track jacket over a white tee, joggers, clean trainers; a laptop covered in stickers. Shown with respect, never as a joke or a stereotype. | Quick, warm and wry; a native New Yorker's own voice (no put-on accent); fast because she thinks fast; dry about Dan's choices, fully on his side. |
| **Moon** | Dan and Jane's dog; lives with Jane. Never taken, not in the opening. | The existing small white fluffy dog (wagmi/moon.js), on a red lead. | Happy noises only (a sneeze, a tail on the pavement). |
| **Mr. Big** | JPBank's CEO, about sixty: the man who set Dan up, on a video call from his study. An original face, nobody's. | Seated upright in his oxblood wing chair in a walnut-panelled study (bookshelves, a green banker's lamp, a whisky glass, Midtown at night through a tall window): a full head of swept-back silver hair, a full close-trimmed silver beard, heavy dark tortoiseshell rectangular glasses, a husky, heavy-set build (normal shoulders), a navy three-piece suit, white shirt, deep burgundy tie; a cigar in his hand, its tip glowing, thin grey smoke. | Smug, polished, unhurried; his own voice, no voice changer; never shouts, smiles through the threats. |
| **The Suits** | JPBank's security team, run like a gang of thugs. | Dark suits, white shirts, dark glasses, earpieces (thug.glb's four suit looks). | Street-tough, in HR language. |
| **Knox** | The crew lead (the opening, Chelsea Park). | Big, black shades; a black leather bag across his back. | Low, cocky, sing-song mockery; enjoys every second. |
| **Hooks** | The grabber: rips the bag off Dan's shoulder. | Wiry, fast hands; the suit and glasses. | Grunts only. |
| **Tank** | Found Dan's front door. | The widest of them, shaved head. | Chat messages only. |
| **Brick** | The bouncer at Fiona's rally. | The suit, an earpiece cord, a radio. | Loud, jumpy, a hype man turned bouncer. |
| **Dash** | Always late, even to fights. | Tie half-knotted, out of breath. | Breathless, whiny, a higher pitch. |
| **Mack** ("Mack Moneybags") | The Suits' Midtown handler; his phone holds the group chat. | Big; a grey suit, black shirt, dark glasses, a security pass on a navy lanyard; a leased sports sedan, plate MACK 1. | Big, loud, panicky about his money; every sentence a pitch. |
| **Rook** | A junior on the security team who wants out (Mission 4). | Young adult, anxious, the suit too big for him. | Not voiced yet (DMs only): nervous, quick, apologetic. |
| **Fiona** | A KOL (influencer) JPBank pays to pump Blimpco at a rally so its insiders can sell. Adult. | Unchanged: white puffer, white shades, megaphone. | A hype host on a megaphone; everything is the best thing ever. |
| **Gears** | Dan's mechanic: a big ex-pit-crew man with a tuning garage in West Chelsea. | Unchanged. | Slow, warm, proud of his work; "Mostly." |

**Blimpco** is an invented airship company: shown only as the word BLIMPCO (and an airship logo), never as a ticker or
with a "$".

## The missions

**Act I · Fall Guy**

- **The opening** (81 s): E 37th St, 5:45 PM. Dan steps out with his laptop bag, reading the comments under the story
  that named him. The Suits' van swings in; Knox talks HR, Hooks rips the bag off his shoulder and runs for the van, Knox
  shoves Dan down, the van tears off. Mr. Big calls: sign the confession. The tracker: *Laptop moving · 5th Ave*. "Okay. You
  framed the wrong guy." **Act I · Fall Guy / Bagged.**
- **Mission 1 · Bagged.** Into the car after the tracker, Jane on the phone. At Chelsea Park an SUV whips past with the bag
  on its back seat while the Suits cross the lawn to keep him busy. Beat up the Suits (Dash runs in late). In their van:
  the tracker, cut out of the bag, and a burner phone with Mr. Big's text on it.
- **Mission 2 · Burner.** Jane and Moon at a Bryant Park table: Jane cracks the burner, finds its twin pinging in a van in
  Times Square. Tail the van (it says JPBANK SECURITY on the side) to the West Side container yard where Mack runs
  Midtown. Sneak in, drop the lookouts, fight the yard, chase Mack to Greeley Square, take his phone: the group chat, and a
  photo of Dan's front door. Dan sleeps over Gears' garage; Rook DMs: he wants out.

**Act II · Insiders**

- **Mission 3 · KOLs.** Gears fits cold-gas thrusters. Jane calls: Fiona is pumping Blimpco live at Washington Square so
  the insiders can cash out. Smash the three livestream rigs; the stream dies mid-sentence, Blimpco falls 99.8% before the
  insiders get out. On Mack's phone: Mr. Big moves the laptop to the shredder at dawn, and Rook drives. Lose the Suits in the
  Village. Rook's DM: meet tonight at Sara D. Roosevelt Park. **Mission 4 · coming soon.**

End card: **END OF EPISODE 1**. "Thanks for playing. Dan isn't done yet." / "Rook knows where your laptop is going."

## How missions are built

Each mission is a runner in `wagmi/mission/` (`m1.js`, `m2.js`, `m3.js`): its phases in order, a checkpoint at the
start of each, its lines, its fail reasons and their tips. The opening is `wagmi/intro.js` and the cold-open trailer
`wagmi/trailer.js`. The parts they share:

| File | What it does |
|---|---|
| `cine.js` | the cutscene machinery: a clock and functions of it (each shot's camera, every actor's place and pose, the cues that fire as the clock passes them); seeking is cheap |
| `m2-scenes.js`, `m3-scenes.js` | the missions' scenes on it (`runScene`); `m2-set.js`, `m3-set.js` build their sets (the yard, Mack and his car, the rally, Fiona) |
| `ui.js` | the overlay: title cards, objectives, help, subtitles, caller cards, the phone, MISSION PASSED / FAILED, the start gate's lockup |
| `gps.js`, `turns.js`, `marker.js` | blips, the route over the traffic's road graph, the turn-by-turn cue, the yellow ring that starts a mission |
| `jane.js`, `mrbig.js` | Jane (her model, her laptop, her room and her video on a call) and Mr. Big's video call (his model's glasses and cigar, his study) |
| `pause.js`, `m3-save.js`, `episode.js` | the pause menu (checkpoints, mission select, the stats carried over a restart), the save, the end-of-episode card |
| `audio.js` | the missions' own synthesised sounds (stingers, the van, the phone, the placeholder mumbles under unrecorded lines) |

The grammar every mission follows:

- **Start.** The contact's blip on the radar (their initial: **J** Jane, **G** Gears; **R** marks Rook's Mission 4 teaser),
  a yellow ring on the ground; walking or stopping the car in it starts the mission. Control freezes, the bars slide in.
- **Title card** over the first shot: the act above, the mission's name under it ("ACT I · FALL GUY" / "Burner").
- **Objective**: one short imperative sentence with one coloured noun: places yellow `#FFC93C`, enemies red `#EF4444`,
  friends and Dan's car blue `#6CB8FF`, objects green `#4ADE80` ("Beat up the **Suits**.", "Follow the **van**.",
  "Lose the **Suits**."). Help text once per mechanic, when it is first needed.
- **Subtitles**: the speaker's name in caps (DAN white, JANE blue, the Suits and Mr. Big acid green). Every spoken line is
  matched to its recording by speaker and words (`assets/voice/manifest.json`), so a changed line plays a placeholder
  mumble until it is recorded again (`docs/VOICE-LINES.md`).
- **Set pieces**: a drive with a call on the way, a fight in a clear arena (SUITS counter, bats, bottles and trash cans
  laid out, a reinforcement half-way), a tail (a suspicion bar), a chase, an escape (HEAT pips).
- **Failing**: knocked out reads **OUT COLD** (the world grey), then MISSION FAILED with the reason and a tip, Retry,
  Quit, and Skip after three tries at the same checkpoint.
- **Passing**: MISSION PASSED with TIME, SUITS DOWN, HITS TAKEN and the followers gained, then the hand-off: a call or a
  DM and the next contact's blip.

To jump straight to a part while working on it: `?nointro` (free roam), `?m1=car|drive|fight|search`,
`?m2=start|go|tail|yard|fight|chase|phone`, `?m3=garage|square|rigs|escape|return`, `?trailer=0` / `?trailer=only`.
