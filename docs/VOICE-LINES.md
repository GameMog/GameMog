# Mog City: voice lines

Every spoken line in the game, for a voice service or actors. Generated from the game's own source by
`node wagmi/radio/build/voices.mjs` (do not edit by hand: change the words in the game, then rebuild).

**Every voice in the build is synthesised** with open models (no macOS placeholder is left), until real recordings replace them. Synthesised: Dan (`dan-A`), Jane (`jane-B`), Mr. Big (`mrbig-D`), Knox (`knox-A`), Mack (`mack-B`), Fiona (`fiona-A`), Brick (`brick-A`), Dash (`dash-A`), Gears (`gears-D`); see below.

## How to deliver

- One file per line, named by its **id**: `<id>.wav` (mono or stereo, 44.1 or 48 kHz, 24-bit preferred), dry: no music,
  no reverb, no phone effect (the game adds the phone/video-call sound itself). 0.2 s of room tone either side is fine; it is trimmed.
- Cutscene lines (scene `intro`) must fit their **window** (the time the shot gives them). Mission lines can run long.
- Put the files in `assets/voice/src/` and run `node wagmi/radio/build/voices.mjs`. Each recording then replaces its
  placeholder (trimmed, evened to the same loudness) as `assets/voice/<id>.m4a`;
  the manifest records which lines are real. Nothing in the game's code changes.
- New or changed lines in the game get their speaker's voice (synthesised, else a placeholder) the next time the build
  runs (`--all` rebuilds every line, e.g. after changing a placeholder voice in `wagmi/radio/build/cast.mjs`).

## Synthesised voices

A speaker can be voiced by an open text-to-speech model instead of the macOS placeholders: Qwen3-TTS 12Hz (a voice
designed from words, then cloned for every line) or Kokoro-82M, both Apache-2.0, run locally. The candidates the
owner auditioned are in `wagmi/radio/build/tts-voices.mjs`: Dan `dan-A` .. `dan-C`; Jane `jane-A` .. `jane-C`; Mr. Big `mrbig-A` .. `mrbig-E`; Knox `knox-A`, `knox-B`; Mack `mack-A`, `mack-B`; Gears `gears-A` .. `gears-E`; Fiona `fiona-A`, `fiona-B`; Dash `dash-A`, `dash-B`; Brick `brick-A`, `brick-B` (the audition files and the designs nobody
picked are in `.scratch/voices/`). To give each pick to every line of that
speaker, in one command (today's picks):

```sh
node wagmi/radio/build/voices.mjs --tts dan-A,jane-B,mrbig-D,knox-A,mack-B,fiona-A,brick-A,dash-A,gears-D     # the picked names
```

- It records the pick in `wagmi/radio/build/tts/picks.json` (later builds keep using it: a changed line is synthesised
  in the same voice), keeps a picked Qwen voice's reference clip there too (that clip IS the voice), renders the
  speakers' lines with `wagmi/radio/build/tts.py` and rebuilds them like any other line (trim, -19 LUFS, AAC). It also
  builds any other line that is new or changed, as a plain build does; Mr. Big and the rest keep their voices.
- Cutscene lines still fit their windows: Qwen takes a line again (up to 4 seeded takes) and Kokoro says it a little
  quicker when it is long; then the build tightens its pauses and stretches its tempo (the pitch kept, never a
  chipmunk) by at most 1.15x. The manifest's `source` says `tts:...` with the voice, and ` x1.08` when stretched.
- A Qwen clone can drift (a line pitched well off its speaker's voice): `take: 4` for that line in `cast.mjs` TWEAK
  makes it again from its 5th to 8th takes (the source says ` take 4`); `--only <id>` is not needed.
- Back to the placeholder for one speaker: `--tts Jane=say`. A real recording in `assets/voice/src/` still wins.
- It needs the local renderer, not in the repo: the venv `.scratch/tts/venv` (Homebrew python3.11 with
  mlx-audio==0.5.8, kokoro-onnx==0.6.1, soundfile) and the weights in `.scratch/downloads/voices/` (`hf/` the two
  mlx-community Qwen3-TTS repos, `kokoro/` kokoro-v1.0.onnx and voices-v1.0.bin); `WAGMI_TTS` and `WAGMI_TTS_MODELS`
  point the build at them elsewhere. Without it those lines fall back to the placeholders, with a warning. Renders
  are cached in `.scratch/tts/render/` (`$WAGMI_TTS/render`).
- Credit (NOTICE): Qwen3-TTS by the Qwen team, Alibaba Cloud (Apache-2.0) or Kokoro-82M by hexgrad (Apache-2.0).

## The cast

| Speaker | Who | Direction | Voice in the build |
|---|---|---|---|
| Dan | the player: a first-year associate investment banker at JPBank, just fired and charged with insider trading the bank set him up for | A grown man, mid-20s: quick, dry, deadpan, polite until he isn't; very tired of being blamed, and the jokes are armour. | dan-A: Qwen3-TTS (qwen-husky-baritone) |
| Knox | the Suits' crew lead (JPBank's security team, run like a gang): big, black shades, a black leather bag across his back | Low, cocky, sing-song mockery in HR language; enjoys every second; never actually angry. | knox-A: Qwen3-TTS (qwen-cocky-baritone) |
| Mr. Big | the CEO of JPBank, about sixty, the one who set Dan up: a video call from his study, a cigar in his hand, his own voice | Smug, polished, unhurried; a CEO in his study who has never been told no. Never shouts. Smiles through the threats. | mrbig-D: Kokoro (kokoro-bm_lewis) |
| Jane | Dan's girlfriend since their college days at SUNY: a Puerto Rican New Yorker in her mid-20s who works in data and pieces the evidence together; mostly a voice on the phone | Quick, warm and wry, composed; her own natural New York voice (no put-on accent); fast because she thinks fast; dry about Dan's choices, fully on his side. | jane-B: Qwen3-TTS (qwen-warm-low-alto) |
| Dash | one of the Suits, always late, even to fights: tie half-knotted | Breathless, whiny, a higher pitch; running in late. | dash-A: Qwen3-TTS (qwen-breathless-whiny) |
| Mack | "Mack Moneybags", the Suits' Midtown handler; his phone holds the group chat | Big, loud, panicky about his money; every sentence a pitch. | mack-B: Qwen3-TTS (qwen-nasal-hustler) |
| Gears | Dan's mechanic: a big ex-pit-crew man with a tuning garage in West Chelsea | Slow, warm, proud of his work. | gears-D: Qwen3-TTS (qwen-old-gravel) |
| Fiona | a KOL (an influencer) JPBank pays to pump Blimpco at a rally so its insiders can sell | A hype host on a megaphone; everything is the best thing ever. | fiona-A: Qwen3-TTS (qwen-big-hype-mezzo) |
| Brick | the Suits' bouncer at Fiona's rally: an earpiece cord, a radio | Loud, jumpy, a hype man turned bouncer. | brick-A: Qwen3-TTS (qwen-gravel-bouncer) |

## Opening cutscene

The opening cutscene (wagmi/intro.js): E 37th St, 5:45 PM; the Suits take Dan's laptop bag, then Mr. Big, JPBank's CEO, calls on video from his study.

| # | id | Speaker | Line | Window | Direction |
|---|---|---|---|---|---|
| 1 | `intro-dan-delete-your-account-good` | Dan | 'Delete your account.' Good morning to you too. | 3.1 s | Reading a comment under the story that named him, off his phone, walking; dry, unbothered. |
| 2 | `intro-dan-okay-okay-car-then` | Dan | Okay, okay. Car, then a lawyer, then I log off forever. | 3.6 s | To himself, the laptop bag on his shoulder; making a plan out loud, a little tired. |
| 3 | `intro-dan-kidding-obviously` | Dan | Kidding. Obviously. | 1.4 s | Quick aside, half to himself. A beat of a smile. |
| 4 | `intro-knox-yo-banker-boy-huge` | Knox | Yo! Banker boy! Huge fan. Sign my form? | 2.5 s | Jumping out of the van, arms wide; fake-fan enthusiasm. |
| 5 | `intro-dan-i-dont-sign-forms` | Dan | I don't sign forms on the street. I do 'please step back'. | 3.1 s | Stepping back, polite but firm; a banker's manners, trying to stay cool. |
| 6 | `intro-knox-youve-been-let-go` | Knox | You've been let go. So now we're collecting something. | 3.4 s | Grinning, getting closer; an HR voice, and "collecting" is a threat. |
| 7 | `intro-dan-hey` | Dan | Hey! | 1.4 s | A shout as the bag is ripped off his shoulder. Real alarm, full voice. |
| 8 | `intro-knox-want-it-back-pick` | Knox | Want it back? Pick up your phone. Stay humble. | 2.9 s | Over his shoulder, jumping back in the van; taunting. |
| 9 | `intro-mrbig-dan-big-fan-great` | Mr. Big | Dan. Big fan. Great trades. Shame you never made any of them. | 4.0 s | Opening the call; slow, mock-friendly, savouring it. A sting on "never made any of them". |
| 10 | `intro-dan-who-is-this` | Dan | Who is this? | 1.3 s | Out of breath, just got up off the pavement. |
| 11 | `intro-mrbig-they-call-me-mr` | Mr. Big | They call me Mr. Big. I run the bank. You ran errands. | 3.8 s | Introducing himself, smug and polished, the cigar between words; a pause before "You ran errands". |
| 12 | `intro-dan-give-it-back` | Dan | Give it back. | 1.3 s | Low, angry, trying to keep it together. |
| 13 | `intro-mrbig-somebody-has-to-be` | Mr. Big | Somebody has to be guilty. Your name is on every trade. | 3.5 s | Leaning into the lens on "every trade". Business-like menace. |
| 14 | `intro-mrbig-you-sign-the-confession` | Mr. Big | You sign the confession. Terms by text. And stop digging. | 3.9 s | The demand, the cigar pointed at the lens; each sentence a full stop. Cold on "stop digging". (The trailer uses its first sentence.) |
| 15 | `intro-dan-did-the-ceo-of` | Dan | Did the CEO of my bank just ask me to confess? | 3.6 s | After the call drops, to himself; disbelief turning into a bit of a laugh. |
| 16 | `intro-dan-okay-you-framed-the` | Dan | Okay. You framed the wrong guy. | 2.0 s | Quiet resolve, turning to his car. The line of the trailer. |

## Mission 1

Mission 1 "Bagged" (wagmi/mission/m1.js): Jane's phone call on the drive; the Suits at Chelsea Park; searching their van.

| # | id | Speaker | Line | Window | Direction |
|---|---|---|---|---|---|
| 1 | `m1-jane-dan-why-is-your` | Jane | Dan. Why is your laptop doing forty down Fifth Avenue? |  | On the phone, already typing; amused and alarmed. |
| 2 | `m1-dan-because-some-guys-in` | Dan | Because some guys in a van took it. |  | Driving, flat and fast. |
| 3 | `m1-jane-okay-im-on-the` | Jane | ...Okay. I'm on the tracker. They're cutting west. Who were they? |  | A beat as it sinks in, then all business, fast. |
| 4 | `m1-dan-guys-from-my-old` | Dan | Guys from my old job. |  | Deadpan. |
| 5 | `m1-jane-so-jpbank-great-narrows` | Jane | So, JPBank. Great, narrows it down. |  | Sarcastic, quick. |
| 6 | `m1-jane-tracker-stopped-chelsea-park` | Jane | Tracker stopped. Chelsea Park, Ninth and Twenty-Eighth. Don't do anything stupid. |  | Reading the location off her screen; the warning is sincere. |
| 7 | `m1-dan-define-stupid` | Dan | Define stupid. |  | Deadpan, already decided. |
| 8 | `m1-jane-going-there-alone` | Jane | Going there alone. |  | Flat, pointed. |
| 9 | `m1-dan-then-im-already-doing` | Dan | Then I'm already doing it. |  | A small grin in the voice. Hangs up. |
| 10 | `m1-dash-wait-did-i-miss` | Dash | Wait! Did I miss the brief? |  | Running in across the lawn, out of breath, shouting. |
| 11 | `m1-knox-you-always-miss-the` | Knox | You always miss the brief! |  | Shouted back mid-fight, exasperated. |
| 12 | `m1-knox-told-you-to-check` | Knox | Told you to check your DMs. You didn't check your DMs. |  | Squaring up on the lawn, teasing. |
| 13 | `m1-dan-been-a-little-busy` | Dan | Been a little busy getting framed. |  | Dry, fists coming up. |
| 14 | `m1-knox-nothing-personal-kid-its` | Knox | Nothing personal, kid. It's just extremely personal. |  | Cracking his knuckles; the fight starts on "personal". |
| 15 | `m1-dan-my-tracker-cut-right` | Dan | My tracker. Cut right out. |  | Quiet, holding the tracker cut out of his bag, in the van; worried. |
| 16 | `m1-dan-hes-got-my-laptop` | Dan | He's got my laptop. And my number. |  | Reading Mr. Big's text on the burner; grim. |
| 17 | `m1-dan-cool-cool-cool-cool` | Dan | Cool. Cool cool cool. |  | Not cool at all; a nervous, deadpan spiral. |

## Mission 2

Mission 2 (wagmi/mission/m2*.js).

| # | id | Speaker | Line | Window | Direction |
|---|---|---|---|---|---|
| 1 | `m2-jane-dont-look-around-im` | Jane | Don't look around. I'm not there. |  |  |
| 2 | `m2-dan-you-said-bryant-park` | Dan | You said Bryant Park. |  |  |
| 3 | `m2-jane-i-said-bring-it` | Jane | I said bring it to Bryant Park. I'm on the library's wifi. It's free and it has a lion. |  |  |
| 4 | `m2-jane-hold-the-burner-up` | Jane | Hold the burner up. Okay. It has a twin. Same batch, same buyer. |  |  |
| 5 | `m2-jane-you-got-tagged-in` | Jane | You got tagged in four hundred posts today. Moon has a bigger following than you. |  |  |
| 6 | `m2-dan-everyone-has-a-bigger` | Dan | Everyone has a bigger following than me. They just hate me. |  |  |
| 7 | `m2-jane-the-twin-pinged-twenty` | Jane | The twin pinged twenty minutes ago. A van, idling in Times Square. Seventh and Forty-Seventh. |  |  |
| 8 | `m2-jane-dont-run-up-to` | Jane | Don't run up to it. Follow it. It'll take us to the rest of them. |  |  |
| 9 | `m2-dan-follow-the-van-got` | Dan | Follow the van. Got it. |  |  |
| 10 | `m2-jane-youre-late-sit-burner` | Jane | You're late. Sit. Burner, please. |  | At the Bryant Park table, Moon at her feet; brisk, warm under it. |
| 11 | `m2-dan-hi-jane-hi-moon` | Dan | Hi, Jane. Hi, Moon. Great to see you too. |  | Dry and fond, sitting down. |
| 12 | `m2-jane-plugging-it-in-look` | Jane | Plugging it in. Look: two SIMs, one sale, switched on the same minute. Yours, and its twin. |  |  |
| 13 | `m2-mack-my-car-my-beautiful` | Mack | My car! My beautiful leveraged car! |  |  |
| 14 | `m2-mack-not-financial-advice-none` | Mack | Not financial advice! None of it! Ever! |  |  |
| 15 | `m2-dan-that-is-my-door` | Dan | That is my door. |  |  |
| 16 | `m2-dan-they-know-where-i` | Dan | They know where I live. |  |  |
| 17 | `m2-mack-whos-that-liquidate-him` | Mack | Who's that? Liquidate him! |  |  |
| 18 | `m2-mack-wait-banker-boy-in` | Mack | Wait. Banker boy? In MY yard? Liquidate him! |  |  |
| 19 | `m2-mack-everybody-out-of-the` | Mack | Everybody out of the boxes! You're all on payroll! |  |  |
| 20 | `m2-mack-you-cant-catch-mack` | Mack | You can't catch Mack, banker boy! |  |  |
| 21 | `m2-jane-ive-got-the-van` | Jane | I've got the van. 'JPBank Security.' On the side. Subtle. |  |  |
| 22 | `m2-dan-they-took-my-laptop` | Dan | They took my laptop, Jane. None of this is subtle. |  |  |
| 23 | `m2-jane-its-registered-to-a` | Jane | It's registered to a Mack Moneybags. Mack. He runs Midtown for the bank's security. |  |  |
| 24 | `m2-dan-mack-moneybags-did-his` | Dan | Mack Moneybags. Did his parents hate him? |  |  |
| 25 | `m2-jane-he-picked-it-he` | Jane | He picked it. He has it tattooed. In cursive. |  |  |
| 26 | `m2-jane-hang-back-if-they` | Jane | Hang back. If they make you, they'll bolt. |  |  |
| 27 | `m2-jane-thats-macks-car-hes` | Jane | That's Mack's car. He's heading for Herald Square. |  |  |
| 28 | `m2-jane-ram-him-dan-gently` | Jane | Ram him, Dan. Gently. Ish. |  | Quick, then a beat; "Ish." an afterthought. |
| 29 | `m2-dan-theres-no-gentle-way` | Dan | There's no gentle way to ram a car. |  |  |
| 30 | `m2-jane-i-saw-the-chat` | Jane | I saw the chat. They know where you live, so you're not sleeping there tonight. |  |  |
| 31 | `m2-dan-where-am-i-sleeping` | Dan | Where am I sleeping? |  |  |
| 32 | `m2-jane-gears-has-a-room` | Jane | Gears has a room over his garage. West Chelsea. He builds rockets for cars. He's nice. Mostly. |  |  |
| 33 | `m2-dan-rook-the-getting-weird` | Dan | Rook. The 'getting weird' guy. |  |  |

## Mission 3

Mission 3 (wagmi/mission/m3*.js).

| # | id | Speaker | Line | Window | Direction |
|---|---|---|---|---|---|
| 1 | `m3-gears-cold-gas-thrusters-little` | Gears | Cold-gas thrusters. Little puffs of nitrogen. Very safe. Mostly. |  |  |
| 2 | `m3-dan-define-mostly` | Dan | Define mostly. |  |  |
| 3 | `m3-gears-i-tested-them-on` | Gears | I tested them on my van. Van's fine. It's on the roof now. |  |  |
| 4 | `m3-jane-dan-are-you-watching` | Jane | Dan. Are you watching this? They're pumping Blimpco. Live. |  |  |
| 5 | `m3-fiona-blimpco-number-go-up` | Fiona | Blimpco! Number go up! Number go UP! |  |  |
| 6 | `m3-jane-its-up-four-thousand` | Jane | It's up four thousand percent. The insiders are cashing out. |  |  |
| 7 | `m3-dan-im-going-to-go` | Dan | I'm going to go unplug it. |  |  |
| 8 | `m3-gears-go-get-your-name` | Gears | Go get your name back, kid. |  | Warm, a hand on the roof of the car. |
| 9 | `m3-fiona-welcome-to-the-launch` | Fiona | Welcome to the launch of the century! Blimpco! |  |  |
| 10 | `m3-fiona-number-go-up-number` | Fiona | Number go up! Number go UP! |  |  |
| 11 | `m3-brick-yo-thats-banker-boy` | Brick | Yo. That's banker boy. Protect the streams! |  |  |
| 12 | `m3-fiona-wait-why-is-it` | Fiona | Wait. Why is it red? Why is it going down? |  |  |
| 13 | `m3-fiona-its-a-healthy-correction` | Fiona | It's a healthy correction! Bye! |  |  |
| 14 | `m3-dan-not-financial-advice` | Dan | Not financial advice. |  |  |
| 15 | `m3-dan-rook-the-guy-who` | Dan | Rook. The guy who wants out. |  |  |
| 16 | `m3-gears-youre-back-and-the` | Gears | You're back. And the car's in one piece. |  |  |
| 17 | `m3-dan-mostly` | Dan | Mostly. |  |  |
| 18 | `m3-gears-mostly` | Gears | Mostly? |  |  |
| 19 | `m3-dan-moon-sleeps-on-janes` | Dan | Moon sleeps on Jane's feet tonight. I get a garage. |  |  |
| 20 | `m3-dan-the-thrusters-work-great` | Dan | The thrusters work great. Very safe. Mostly. |  |  |
| 21 | `m3-gears-ha-rooms-upstairs-kid` | Gears | Ha. Room's upstairs, kid. Get some sleep. |  |  |
| 22 | `m3-fiona-buy-the-dip-there` | Fiona | Buy the dip! There is no dip! |  |  |
| 23 | `m3-fiona-diamond-hands-everybody-diamond` | Fiona | Diamond hands, everybody! Diamond hands! |  |  |
| 24 | `m3-fiona-dont-look-at-the` | Fiona | Don't look at the kid! Look at the chart! |  |  |
| 25 | `m3-fiona-blimpco-sky-high` | Fiona | Blimpco! Sky high! |  |  |
| 26 | `m3-fiona-we-lost-a-stream` | Fiona | We lost a stream! Keep pumping! |  |  |
| 27 | `m3-fiona-two-streams-down-this` | Fiona | Two streams down! This is fine! Pump harder! |  |  |
| 28 | `m3-brick-backup-protect-the-last` | Brick | Backup! Protect the last stream! |  |  |
| 29 | `m3-jane-its-a-kol-rally` | Jane | It's a KOL rally. The bank pays Fiona, her followers buy. |  |  |
| 30 | `m3-jane-the-stream-runs-off` | Jane | The stream runs off three ring lights in the park. Kill the rigs, the stream dies. |  |  |
| 31 | `m3-dan-and-no-stream-no` | Dan | And no stream, no pump. |  |  |
| 32 | `m3-jane-and-no-pump-fionas` | Jane | And no pump, Fiona's just a lady shouting at a fountain. |  |  |
| 33 | `m3-jane-two-of-their-cars` | Jane | Two of their cars on you. The Village is all crooked streets. Use them. |  |  |
| 34 | `m3-dan-gears-said-the-thrusters` | Dan | Gears said the thrusters were very safe. |  |  |
| 35 | `m3-jane-gears-says-that-about` | Jane | Gears says that about everything. |  |  |
| 36 | `m3-jane-blimpco-is-down-ninety` | Jane | Blimpco is down ninety-nine point eight percent. The stream died mid-sentence. |  |  |
| 37 | `m3-dan-good` | Dan | Good. |  |  |
| 38 | `m3-jane-the-insiders-never-got` | Jane | The insiders never got out. They're furious. At Mr. Big, for once. Go get some sleep. |  | Relieved, tired, warm; a small laugh on "for once". |
