# Mog City: the missions

The story and the cast below are docs/STORY.md's (the source: change it there first); the last part is how a mission
is built in the code.

**Mog City** (mc.gamemog.com) is GameMog's flagship open-world mission game, in a browser-sized Manhattan. Episode 1 is
**Unfinished Business**: the lockup reads **MOG CITY**, the gold rule, **UNFINISHED BUSINESS**. All names, companies and events in Mog
City are fictional; JPBank (the owner's choice of name) and Blimpco are invented.

## The story

**JPBank** is Manhattan's biggest bank. Two years ago it took a government bailout. This year it paid record bonuses and
foreclosed on thousands of New York homes. **OCCUPY JPBANK** has camped in Washington Square for 41 days, with tents,
cardboard signs, a drum circle, a kitchen and the people's mic. It wants an audit of the bank.

Dan is a first-year associate investment banker at JPBank. This week he was fired and charged with insider trading.
JPBank advised on the sale of Blimpco, a sleepy airship company, and a week before the news somebody inside bought a lot
of it, in an account in Dan's name, with Dan's login, at two in the morning. That night Dan was asleep on Jane's couch
with their dog on his feet. When the regulators asked, the bank handed them the new guy: fired Monday, charged Wednesday,
a headline by Thursday ("the face of insider trading"). For JPBank a scapegoat is also a press release: the bank isn't
rotten, it had one bad apple, and it caught him. If it's one bad apple, nobody checks the orchard.

He still has one thing: his laptop. Keeping the Blimpco deal room's access log was his job (the spreadsheet nobody reads),
and he kept his own copy. It shows that whoever logged in as him did it from the fifty-first floor, Mr. Big's floor. The
bank's copy has been tidied up; his is the only clean one left, and by bank rule it never left the laptop. At 5:45 PM he
steps out of his building on E 37th St with it in his bag, on his way to a lawyer. JPBank's security team is waiting: a
van of thugs in suits, the **Suits**. They talk like HR, rip the bag off his shoulder, shove him down and tear off. Then a
video call: **Mr. Big**, JPBank's CEO, from his study, a cigar in his hand: the man who set Dan up. Sign the confession,
terms by text, stop digging. The laptop has a tracker.

To prove he is innocent, Dan has to follow the evidence where the Suits take it, mission by mission. **Jane**, his
girlfriend since their college days at SUNY, pieces it together: the tracker, the burner the Suits left behind and its
twin, a handler's group chat. She is on the phone with him **whenever he drives**, and only then: the backstory, the
plan, the jokes. Their dog **Moon** lives with Jane and comes along when Dan meets her in person. The Suits fight him at
every step. In Act II, JPBank aims its smear at the Occupy camp, and Dan turns the camp around: it ends Episode 1 chanting
"Free Dan." Mr. Big moves the laptop's shredding up to dawn, and **Rook**, a junior on the security team who was in that
crowd, wants out. He is the one driving it.

Dan is one of the 99% in a suit: $78,000 of student loans at 6.8%, fired three weeks before bonus day, a mom who believes
him ("eat something, and she believes you, in that order"). The bank offers the city's anger a scapegoat, and the
scapegoat turns out to be one of the people it robbed.

Tone: short, deadpan-funny, a finance thriller told by a man who is very tired of being blamed. Warm between Dan and Jane;
kind, not cruel, even to the people paid to hate him. No guns, no knives: fists, bats, bottles and trash cans. Nobody in
it is a real person. The MISSION PASSED card counts **SUPPORTERS**, the people backing Dan as his story spreads.

## The cast

| Name | Who | Look | Voice |
|---|---|---|---|
| **Dan** (the player) | Mid-20s, first-year associate at JPBank, fired and charged. | Tall and lean (about 1.88 m, long-limbed, normal shoulders, a flat chest, an easy loping walk; he stands upright, chest open, shoulders back and down, his head over his shoulders): the build only, an **original adult face**: a long jaw, clean-shaven, tired dark eyes, short dark hair a week past a haircut. White shirt open at the collar, sleeves rolled, slim dark trousers, white trainers, a navy overshirt; a black laptop bag across his left shoulder in the opening. | A grown man's dry baritone with a New York edge; quick and deadpan, the jokes are armour; polite until he isn't. |
| **Jane** | Mid-20s, Dan's girlfriend since SUNY (he printed his JPBank cover letter on her printer card); a data analyst at a public hospital who reads logs for fun; she pieces the evidence together, and she is on the phone whenever Dan drives. Adult. | Puerto Rican, athletic build (a runner's shoulders and legs), warm brown skin, dark curly hair tied up, small gold hoops; a fitted dark track jacket over a white tee, joggers, clean trainers; a laptop covered in stickers. Shown with respect, never as a joke or a stereotype. | Quick, warm and wry; a native New Yorker's own voice (no put-on accent); fast because she thinks fast; dry about Dan's choices, fully on his side. |
| **Moon** | Dan and Jane's dog; lives with Jane. Never taken, not in the opening. | The existing small white fluffy dog (wagmi/moon.js), on a red lead. | Happy noises only (a sneeze, a tail on the pavement). |
| **Mr. Big** | JPBank's CEO, about sixty: the man who set Dan up, on a video call from his study. An original face, nobody's. | Seated upright in his oxblood wing chair in a walnut-panelled study (bookshelves, a green banker's lamp, a whisky glass, Midtown at night through a tall window): a full head of swept-back silver hair, a full close-trimmed silver beard, heavy dark tortoiseshell rectangular glasses, a husky, heavy-set build (normal shoulders), a navy three-piece suit, white shirt, deep burgundy tie; a cigar in his hand, its tip glowing, thin grey smoke. | Smug, polished, unhurried; his own voice, no voice changer; never shouts, smiles through the threats. |
| **The Suits** | JPBank's security team, run like a gang of thugs. | Dark suits, white shirts, dark glasses, earpieces (thug.glb's four suit looks). | Street-tough, in HR language. |
| **Knox** | The crew lead (the opening, Chelsea Park). | Big, black shades; a black leather bag across his back. | Low, cocky, sing-song mockery; enjoys every second. |
| **Hooks** | The grabber: rips the bag off Dan's shoulder. | Wiry, fast hands; the suit and glasses. | Grunts only. |
| **Tank** | Found Dan's front door. | The widest of them, shaved head. | Chat messages only. |
| **Brick** | The bouncer at JPBank's community day: runs the Suits planted in the crowd. | The suit, an earpiece cord, a radio. | Loud, jumpy, a hype man turned bouncer. |
| **Dash** | Always late, even to fights. | Tie half-knotted, out of breath. | Breathless, whiny, a higher pitch. |
| **Mack** ("Mack Moneybags") | The Suits' Midtown handler; his phone holds the group chat. | Big; a grey suit, black shirt, dark glasses, a security pass on a navy lanyard; a leased sports sedan, plate MACK 1. | Big, loud, panicky about his money; every sentence a pitch. |
| **Rook** | A junior on the security team, a first-year like Dan, who wants out (Mission 4). He was in the crowd at Washington Square. | Young adult, anxious, the suit too big for him. | Not voiced yet (DMs only): nervous, quick, apologetic. |
| **Fiona** | JPBank's Head of Community: she hosts its "JPBank Loves New York" community day next to the Occupy camp. Her business card has glitter on it. Adult. | Unchanged: white puffer, white shades, megaphone. | A hype host on a megaphone; everything is the best thing ever; relentlessly nice. |
| **Gears** | Dan's mechanic: a big ex-pit-crew man with a tuning garage in West Chelsea. | Unchanged. | Slow, warm, proud of his work; "Mostly." |
| **Ms. Bea** | A retired Bronx science teacher in her sixties (she taught Jane in seventh grade); runs the Occupy camp's kitchen and leads its people's mic. JPBank took her house. | Heard, not seen yet (off screen in Episode 1). When she is modelled: an original older woman, a knitted cardigan over a camp T-shirt, reading glasses on a cord, a wooden spoon in her apron pocket. | Warm, unhurried, commanding: a teacher who has never needed a microphone. |
| **The Camp** | OCCUPY JPBANK: forty-odd people of every age in Washington Square, with tents, cardboard signs and a drum circle. | The city's crowd, dressed for a long camp-out. | A crowd: five or six voices together, ragged, cheerful and loud; the people's mic repeats each phrase so the back can hear. |

**Blimpco** is an invented airship company: shown only as the word BLIMPCO (and an airship logo), never as a ticker or
with a "$". **OCCUPY JPBANK** is invented too: no real activist, group or slogan owner is named. Its signs are
hand-lettered cardboard: WE ARE THE 99% · AUDIT JPBANK · THEY GOT BAILED OUT · WE GOT SOLD OUT · PEOPLE OVER PROFITS ·
FREE HOT DOGS ≠ JUSTICE · DAN DAN THE GREEDY MAN (until Ms. Bea crosses out GREEDY and writes FALL).

## The missions

**Act I · Fall Guy**

- **The opening** (81 s): E 37th St, 5:45 PM. Dan steps out with his laptop bag, reading the comments under the story
  that named him. The Suits' van swings in; Knox talks HR, Hooks rips the bag off his shoulder and runs for the van, Knox
  shoves Dan down, the van tears off. Mr. Big calls: sign the confession. The tracker: *Laptop moving · 5th Ave*. "Okay. You
  framed the wrong guy." **Act I · Fall Guy / Bagged.**
- **Mission 1 · Bagged.** Into the car after the tracker. Jane calls the moment he drives, and the call is the backstory:
  Mr. Big's offer ("Terms by text. Like a dentist."), the Blimpco trades with his login, the couch and Moon, SUNY, fired,
  charged, a headline, the access log and the fifty-first floor ("Except the laptop."). At Chelsea Park an SUV whips past
  with the bag on its back seat while the Suits cross the lawn to keep him busy. Beat up the Suits (Knox talks HR, Dash
  runs in late). In their van: the tracker, cut out of the bag, and a burner phone with Mr. Big's text on it.
  SUPPORTERS +3: Jane, Moon and his mom.
- **Mission 2 · Burner.** On the drive to Bryant Park, Jane explains burners ("Everybody leaves logs.") and passes on a
  call from his mom. Jane and Moon are at a Bryant Park table: Jane cracks the burner and finds its twin pinging in a van
  in Times Square. On the way, the Occupy camp has made a sign about him: DAN DAN THE GREEDY MAN. Tail the van (it says
  JPBANK SECURITY on the side) to the West Side container yard where Mack runs Midtown, with Jane whispering in his ear.
  Sneak in, drop the lookouts, fight the yard, chase Mack to Greeley Square ("Keep the phone! Call it severance!") and
  take his phone: the group chat, and a photo of Dan's front door. Rook DMs: he wants out. On the drive to Gears' garage
  Jane sorts out where everyone sleeps, and Dan finds the Suits' "bonus pool" thread: they get bonuses, first-years get
  fired three weeks before theirs.

**Act II · Insiders**

- **Mission 3 · Occupied.** The next morning Gears fits cold-gas thrusters. Jane's video call shows JPBank's PR stunt
  next to the camp, "JPBank Loves New York": free hot dogs, Fiona on a megaphone, and three screen rigs aimed at the tents
  running a smear reel of Dan, "the bad apple". On the drive, Jane lays it out: if it's one bad apple, nobody audits the
  orchard; the reel runs off the three rigs; the Suits are planted in the crowd to start trouble and pin it on him; and
  Ms. Bea runs the camp's kitchen. Smash the three screen rigs while Brick shouts "Make it look like he started it!" and
  the camp answers "We saw that!" Bea gets the camp filming the Suits, and the reel dies mid-sentence ("DAN: THE FACE OF
  INSIDER TRAD—"). Fiona: "We'll be right back!" Then the people's mic: "Anybody the bank hates this much... is somebody
  we should hear out!" and the whole park chants "Free Dan." On Mack's phone, the Suits' chat: the camp is chanting his
  name, so Mr. Big moves the laptop to the shredder at dawn, and Rook drives. Lose the Suits in the Village. On the drive
  back, Jane tells him the payoff: forty phones of footage, the sign now says DAN DAN THE FALL MAN, and the insiders are
  panicking because an audit would take them down with Mr. Big. SUPPORTERS +11,240, everyone who was watching. Rook's
  DM: he was in that crowd, he's done; meet tonight at Sara D. Roosevelt Park. **Mission 4 · coming soon.**

End card: **END OF EPISODE 1**. "Thanks for playing. Dan isn't done yet." / "Rook knows where your laptop is going."

## How missions are built

Each mission is a runner in `wagmi/mission/` (`m1.js`, `m2.js`, `m3.js`): its phases in order, a checkpoint at the
start of each, its lines, its fail reasons and their tips. The opening is `wagmi/intro.js` and the cold-open trailer
`wagmi/trailer.js`. The parts they share:

| File | What it does |
|---|---|
| `cine.js` | the cutscene machinery: a clock and functions of it (each shot's camera, every actor's place and pose, the cues that fire as the clock passes them); seeking is cheap |
| `m2-scenes.js`, `m3-scenes.js` | the missions' scenes on it (`runScene`); `m2-set.js`, `m3-set.js` build their sets (the yard, Mack and his car; JPBank's community day with its stage, LED screen and three smear-screen rigs, Fiona, and the OCCUPY JPBANK camp with its tents, signs, Ms. Bea's kitchen tent and the drum circle) |
| `ui.js` | the overlay: title cards, objectives, help, subtitles, caller cards, the phone, MISSION PASSED / FAILED, the start gate's lockup |
| `gps.js`, `turns.js`, `marker.js` | blips, the route over the traffic's road graph, the turn-by-turn cue, the yellow ring that starts a mission |
| `jane.js`, `mrbig.js` | Jane (her model, her laptop, her room and her video on a call) and Mr. Big's video call (his model's glasses and cigar, his study) |
| `calls.js` | Jane on the car phone (`W.calls`): every drive's call and its lines, played only while Dan is at the wheel (on hold on foot, hung up by a cutscene), the mission's own lines first; a mission starts its drive's call (`W.calls.start(id, { wrapWhen })`), the drives between missions start theirs from the step |
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
- **Passing**: MISSION PASSED with TIME, SUITS DOWN, HITS TAKEN and the supporters gained, then the hand-off: a call or a
  DM and the next contact's blip.

To jump straight to a part while working on it: `?nointro` (free roam), `?nogate` (no title screen),
`?m1=car|drive|arrival|fight|search`, `?m2=start|go|tail|yard|fight|chase|crash|phone|handoff`,
`?m3=garage|square|rigs|escape|return|handoff`, `?trailer=1` (the cold-open trailer before the opening; it is off by
default) / `?trailer=only`. Every switch, the testing ones included, is in CONTRIBUTING.md (URL switches).
