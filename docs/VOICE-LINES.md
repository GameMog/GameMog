# Mog City: voice lines

Every spoken line in the game, for a voice service or actors. Generated from the game's own source by
`node wagmi/radio/build/voices.mjs` (do not edit by hand: change the words in the game, then rebuild).

**Every voice in the build is synthesised** with open models (no macOS placeholder is left), until real recordings replace them. Synthesised: Dan (`dan-A`), Jane (`jane-B`), Mr. Big (`mrbig-D`), Knox (`knox-A`), Mack (`mack-B`), Fiona (`fiona-A`), Brick (`brick-A`), Dash (`dash-A`), Gears (`gears-D`), Bea (`bea-A`), Camp (`camp-A`); see below.

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
owner auditioned are in `wagmi/radio/build/tts-voices.mjs`: Dan `dan-A` .. `dan-C`; Jane `jane-A` .. `jane-C`; Mr. Big `mrbig-A` .. `mrbig-E`; Knox `knox-A`, `knox-B`; Mack `mack-A`, `mack-B`; Gears `gears-A` .. `gears-E`; Fiona `fiona-A`, `fiona-B`; Dash `dash-A`, `dash-B`; Brick `brick-A`, `brick-B`; Bea `bea-A`, `bea-B`; Camp `camp-A` (the audition files and the designs nobody
picked are in `.scratch/voices/`). To give each pick to every line of that
speaker, in one command (today's picks):

```sh
node wagmi/radio/build/voices.mjs --tts dan-A,jane-B,mrbig-D,knox-A,mack-B,fiona-A,brick-A,dash-A,gears-D,bea-A,camp-A     # the picked names
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
- A car call's register (its `mode` in `wagmi/mission/calls.js`): a `fast` call's lines (a chase) have their pauses
  tightened and their tempo up 1.1x, the pitch kept (the source says ` +fast`); on a `whisper` call (the tail) the
  speaker on the phone (Jane) is whispered by the build, her own take turned to breath, 3 dB under (`whisper()` in
  `dsp.mjs`; ` +whisper`), and Dan answers in his own voice. A real recording is used as it is: record those whispered
  or fast.
- A crowd (the Camp: engine `crowd` in `tts-voices.mjs`) is several Kokoro voices saying the line together, each a
  little late and at its own pace, mixed down to one file.
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
| Dash | one of the Suits, always late, even to fights: tie half-knotted | Breathless, whiny, a higher pitch; running in late. | dash-A: Qwen3-TTS (qwen-breathless-whiny) |
| Jane | Dan's girlfriend since their college days at SUNY: a Puerto Rican New Yorker in her mid-20s who works in data and pieces the evidence together; mostly a voice on the phone | Quick, warm and wry, composed; her own natural New York voice (no put-on accent); fast because she thinks fast; dry about Dan's choices, fully on his side. | jane-B: Qwen3-TTS (qwen-warm-low-alto) |
| Mack | "Mack Moneybags", the Suits' Midtown handler; his phone holds the group chat | Big, loud, panicky about his money; every sentence a pitch. | mack-B: Qwen3-TTS (qwen-nasal-hustler) |
| Gears | Dan's mechanic: a big ex-pit-crew man with a tuning garage in West Chelsea | Slow, warm, proud of his work. | gears-D: Qwen3-TTS (qwen-old-gravel) |
| Fiona | JPBank's Head of Community: she hosts its "JPBank Loves New York" community day in Washington Square, next to the Occupy camp | A hype host on a megaphone; everything is the best thing ever. | fiona-A: Qwen3-TTS (qwen-big-hype-mezzo) |
| Camp | the Occupy JPBank camp in Washington Square: forty-odd people answering the people's mic | A crowd, eight voices together in the build: ragged, outdoors, cheerful and loud. | camp-A: a crowd of Kokoro voices (kokoro-crowd-of-8) |
| Brick | the Suits' bouncer at Fiona's rally: an earpiece cord, a radio | Loud, jumpy, a hype man turned bouncer. | brick-A: Qwen3-TTS (qwen-gravel-bouncer) |
| Bea | Ms. Bea: a retired Bronx science teacher in her sixties who runs the Occupy camp's kitchen and its people's mic; JPBank took her house | Warm, unhurried, commanding: a teacher who has never needed a microphone. | bea-A: Qwen3-TTS (qwen-teacher-low-alto) |

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

Mission 1 "Bagged" (wagmi/mission/m1.js): the Suits at Chelsea Park; searching their van. Jane's car call (wagmi/mission/calls.js, only while Dan drives): `m1-drive`.

| # | id | Speaker | Line | Window | Direction |
|---|---|---|---|---|---|
| 1 | `m1-knox-this-is-a-performance` | Knox | This is a performance review, kid! You're failing it! |  | HR-speak bark mid-fight, only when no line is up. |
| 2 | `m1-knox-please-stop-hitting-back` | Knox | Please stop hitting back! We value your feedback! |  | HR-speak bark mid-fight, wounded. |
| 3 | `m1-knox-okay-im-escalating-this` | Knox | Okay! I'm escalating this to HR! |  | HR-speak bark, losing; a threat he believes in. |
| 4 | `m1-dash-wait-did-i-miss` | Dash | Wait! Did I miss the brief? |  | Running in across the lawn, out of breath, shouting. |
| 5 | `m1-knox-you-always-miss-the` | Knox | You always miss the brief! |  | Shouted back mid-fight, exasperated. |
| 6 | `m1-knox-told-you-to-check` | Knox | Told you to check your DMs. You didn't check your DMs. |  | Squaring up on the lawn, teasing. |
| 7 | `m1-dan-been-a-little-busy` | Dan | Been a little busy getting framed. |  | Dry, fists coming up. |
| 8 | `m1-knox-nothing-personal-kid-its` | Knox | Nothing personal, kid. It's just extremely personal. |  | Cracking his knuckles; the fight starts on "personal". |
| 9 | `m1-dan-my-tracker-cut-right` | Dan | My tracker. Cut right out. |  | Quiet, holding the tracker cut out of his bag, in the van; worried. |
| 10 | `m1-dan-hes-got-my-laptop` | Dan | He's got my laptop. And my number. |  | Reading Mr. Big's text on the burner; grim. |
| 11 | `m1-dan-cool-cool-cool-cool` | Dan | Cool. Cool cool cool. |  | Not cool at all; a nervous, deadpan spiral. |
| 12 | `m1-jane-dan-why-is-your` | Jane | Dan. Why is your laptop doing forty down Fifth Avenue? |  | On the phone, already typing; amused and alarmed. |
| 13 | `m1-dan-because-some-guys-in` | Dan | Because some guys in a van took it. |  | Driving, flat and fast. |
| 14 | `m1-jane-okay-im-on-the` | Jane | ...Okay. I'm on the tracker. They're cutting west. Who were they? |  | A beat as it sinks in, then all business, fast. |
| 15 | `m1-dan-guys-from-my-old` | Dan | Guys from my old job. |  | Deadpan. |
| 16 | `m1-jane-so-jpbank-great-narrows` | Jane | So, JPBank. Great, narrows it down. |  | Sarcastic, quick. |
| 17 | `m1-dan-then-their-ceo-called` | Dan | Then their CEO called me. On video. From a leather chair. |  | Call `m1-drive`. |
| 18 | `m1-jane-mr-big-called-you` | Jane | Mr. Big called you? Himself? |  | Call `m1-drive`. |
| 19 | `m1-dan-he-wants-a-signed` | Dan | He wants a signed confession. 'Terms by text.' Like a dentist. |  | Call `m1-drive`. |
| 20 | `m1-jane-youre-not-signing-anything` | Jane | You're not signing anything. |  | Call `m1-drive`. |
| 21 | `m1-dan-somebody-at-jpbank-bought` | Dan | Somebody at JPBank bought Blimpco a week before the merger. With my login. |  | Call `m1-drive`. |
| 22 | `m1-jane-the-blimp-company` | Jane | The blimp company. |  | Call `m1-drive`. |
| 23 | `m1-dan-airship-company-theyre-sensitive` | Dan | Airship company. They're sensitive about it. |  | Call `m1-drive`. |
| 24 | `m1-jane-and-the-night-those` | Jane | And the night those trades went in, you were where? |  | Call `m1-drive`. |
| 25 | `m1-dan-on-your-couch-with` | Dan | On your couch. With Moon asleep on my feet. |  | Call `m1-drive`. |
| 26 | `m1-jane-i-know-i-was` | Jane | I know. I was there. Since SUNY you haven't done one sneaky thing. |  | Call `m1-drive`. |
| 27 | `m1-dan-i-took-two-ketchups` | Dan | I took two ketchups once. |  | Call `m1-drive`. |
| 28 | `m1-jane-and-told-the-cashier` | Jane | And told the cashier. |  | Call `m1-drive`. |
| 29 | `m1-dan-monday-they-fired-me` | Dan | Monday they fired me. Wednesday they charged me. Today I'm a headline. |  | Call `m1-drive`. |
| 30 | `m1-jane-so-why-do-they` | Jane | So why do they want the laptop this bad? |  | Call `m1-drive`. |
| 31 | `m1-dan-the-deal-rooms-access` | Dan | The deal room's access log. Keeping it was my job. I kept my own copy. |  | Call `m1-drive`. |
| 32 | `m1-dan-whoever-logged-in-as` | Dan | Whoever logged in as me did it from the fifty-first floor. |  | Call `m1-drive`. |
| 33 | `m1-jane-whats-on-fifty-one` | Jane | What's on fifty-one? |  | Call `m1-drive`. |
| 34 | `m1-dan-mr-big-and-his` | Dan | Mr. Big. And his bathroom. It's a very big bathroom. |  | Call `m1-drive`. |
| 35 | `m1-jane-so-yours-is-the` | Jane | So yours is the only clean copy. Tell me you backed it up. |  | Call `m1-drive`. |
| 36 | `m1-dan-bank-rule-nothing-leaves` | Dan | Bank rule. Nothing leaves the laptop. |  | Call `m1-drive`. |
| 37 | `m1-jane-except-the-laptop` | Jane | Except the laptop. |  | Call `m1-drive`. |
| 38 | `m1-dan-except-the-laptop` | Dan | Except the laptop. |  | Call `m1-drive`. |
| 39 | `m1-jane-the-face-of-insider` | Jane | 'The face of insider trading.' At least it's a good photo. |  | Call `m1-drive`. |
| 40 | `m1-dan-its-my-badge-photo` | Dan | It's my badge photo. I look like a hostage. |  | Call `m1-drive`. |
| 41 | `m1-jane-you-looked-like-that` | Jane | You looked like that at SUNY. In the library. Two a.m. |  | Call `m1-drive`. |
| 42 | `m1-dan-printing-my-jpbank-cover` | Dan | Printing my JPBank cover letter. |  | Call `m1-drive`. |
| 43 | `m1-jane-on-my-printer-card` | Jane | On my printer card. You said you'd pay me back. |  | Call `m1-drive`. |
| 44 | `m1-dan-two-hot-dogs-i` | Dan | Two hot dogs. I was making a statement. |  | Call `m1-drive`. |
| 45 | `m1-jane-the-statement-was-mustard` | Jane | The statement was mustard. It's still on my coat. |  | Call `m1-drive`. |
| 46 | `m1-dan-hows-moon` | Dan | How's Moon? |  | Call `m1-drive`. |
| 47 | `m1-jane-asleep-on-your-hoodie` | Jane | Asleep on your hoodie. She ate one of your socks. |  | Call `m1-drive`. |
| 48 | `m1-dan-the-good-one` | Dan | The good one? |  | Call `m1-drive`. |
| 49 | `m1-jane-she-only-eats-the` | Jane | She only eats the good ones. She misses you. |  | Call `m1-drive`. |
| 50 | `m1-dan-tell-her-im-on` | Dan | Tell her I'm on a business trip. Business is bad. |  | Call `m1-drive`. |
| 51 | `m1-dan-hows-work` | Dan | How's work? |  | Call `m1-drive`. |
| 52 | `m1-jane-the-hospitals-billing-system` | Jane | The hospital's billing system thinks a man in Queens is a hundred and twelve and pregnant. |  | Call `m1-drive`. |
| 53 | `m1-dan-is-he` | Dan | Is he? |  | Call `m1-drive`. |
| 54 | `m1-jane-hes-forty-and-very` | Jane | He's forty and very confused. I fixed it. Nobody will ever know. |  | Call `m1-drive`. |
| 55 | `m1-dan-ill-know` | Dan | I'll know. |  | Call `m1-drive`. |
| 56 | `m1-jane-youre-a-fugitive-you` | Jane | You're a fugitive. You don't count. |  | Call `m1-drive`. |
| 57 | `m1-dan-im-not-a-fugitive` | Dan | I'm not a fugitive. I'm charged. It's different. |  | Call `m1-drive`. |
| 58 | `m1-jane-how` | Jane | How? |  | Call `m1-drive`. |
| 59 | `m1-dan-more-paperwork` | Dan | More paperwork. |  | Call `m1-drive`. |
| 60 | `m1-jane-what-happened-to-the` | Jane | What happened to the lawyer? |  | Call `m1-drive`. |
| 61 | `m1-dan-she-read-the-paper` | Dan | She read the paper and said I'm 'not a good fit'. |  | Call `m1-drive`. |
| 62 | `m1-jane-lawyers-say-that` | Jane | Lawyers say that? |  | Call `m1-drive`. |
| 63 | `m1-dan-they-say-it-to` | Dan | They say it to guys whose face is on the paper. |  | Call `m1-drive`. |
| 64 | `m1-jane-then-we-find-one` | Jane | Then we find one who reads logs. I'll bring the logs. |  | Call `m1-drive`. |
| 65 | `m1-jane-are-you-driving-like` | Jane | Are you driving like a banker or like a person? |  | Call `m1-drive`. |
| 66 | `m1-dan-whats-the-difference` | Dan | What's the difference? |  | Call `m1-drive`. |
| 67 | `m1-jane-a-banker-thinks-red` | Jane | A banker thinks red lights are a suggestion. |  | Call `m1-drive`. |
| 68 | `m1-dan-im-stopping-at-every` | Dan | I'm stopping at every light. |  | Call `m1-drive`. |
| 69 | `m1-jane-liar-i-can-hear` | Jane | Liar. I can hear the rockets. |  | Call `m1-drive`. |
| 70 | `m1-jane-tracker-stopped-chelsea-park` | Jane | Tracker stopped. Chelsea Park, Ninth and Twenty-Eighth. Don't do anything stupid. |  | Reading the location off her screen; the warning is sincere. |
| 71 | `m1-dan-define-stupid` | Dan | Define stupid. |  | Deadpan, already decided. |
| 72 | `m1-jane-going-there-alone` | Jane | Going there alone. |  | Flat, pointed. |
| 73 | `m1-dan-then-im-already-doing` | Dan | Then I'm already doing it. |  | A small grin in the voice. Hangs up. |

## Mission 2

Mission 2 (wagmi/mission/m2*.js). Jane's car calls (wagmi/mission/calls.js, only while Dan drives): `m2-handoff`, `m2-go`, `m2-tail`, `m2-chase`.

| # | id | Speaker | Line | Window | Direction |
|---|---|---|---|---|---|
| 1 | `m2-jane-dont-look-around-im` | Jane | Don't look around. I'm not there. |  |  |
| 2 | `m2-dan-you-said-bryant-park` | Dan | You said Bryant Park. |  |  |
| 3 | `m2-jane-i-said-bring-it` | Jane | I said bring it to Bryant Park. I'm on the library's wifi. It's free and it has a lion. |  |  |
| 4 | `m2-jane-hold-the-burner-up` | Jane | Hold the burner up. Okay. It has a twin. Same batch, same buyer. |  |  |
| 5 | `m2-jane-your-face-is-on` | Jane | Your face is on four front pages today. Moon's jealous. |  |  |
| 6 | `m2-dan-moon-can-have-them` | Dan | Moon can have them. All four. |  |  |
| 7 | `m2-jane-the-twin-pinged-twenty` | Jane | The twin pinged twenty minutes ago. A van, idling in Times Square. Seventh and Forty-Seventh. |  |  |
| 8 | `m2-jane-dont-run-up-to` | Jane | Don't run up to it. Follow it. It'll take us to the rest of them. |  |  |
| 9 | `m2-dan-follow-the-van-got` | Dan | Follow the van. Got it. |  |  |
| 10 | `m2-jane-youre-late-sit-burner` | Jane | You're late. Sit. Burner, please. |  | At the Bryant Park table, Moon at her feet; brisk, warm under it. |
| 11 | `m2-dan-hi-jane-hi-moon` | Dan | Hi, Jane. Hi, Moon. Great to see you too. |  | Dry and fond, sitting down. |
| 12 | `m2-jane-plugging-it-in-look` | Jane | Plugging it in. Look: two SIMs, one sale, switched on the same minute. Yours, and its twin. |  |  |
| 13 | `m2-mack-my-car-my-beautiful` | Mack | My car! My beautiful leveraged car! |  |  |
| 14 | `m2-mack-keep-the-phone-call` | Mack | Keep the phone! Call it severance! |  |  |
| 15 | `m2-dan-that-is-my-door` | Dan | That is my door. |  |  |
| 16 | `m2-dan-they-know-where-i` | Dan | They know where I live. |  |  |
| 17 | `m2-mack-whos-that-liquidate-him` | Mack | Who's that? Liquidate him! |  |  |
| 18 | `m2-mack-wait-banker-boy-in` | Mack | Wait. Banker boy? In MY yard? Liquidate him! |  |  |
| 19 | `m2-mack-everybody-out-of-the` | Mack | Everybody out of the boxes! You're all on payroll! |  |  |
| 20 | `m2-mack-you-cant-catch-mack` | Mack | You can't catch Mack, banker boy! |  |  |
| 21 | `m2-dan-rook-the-getting-weird` | Dan | Rook. The 'getting weird' guy. |  |  |
| 22 | `m2-mack-im-too-leveraged-to` | Mack | I'm too leveraged to fight! Somebody hit him! |  | A bark mid-fight in the yard, panicking. |
| 23 | `m2-mack-shareholder-value-hit-him` | Mack | Shareholder value! Hit him harder! |  | A bark mid-fight in the yard. |
| 24 | `m2-mack-do-you-know-what` | Mack | Do you know what my bonus is riding on? |  | A bark mid-fight in the yard, outraged. |
| 25 | `m2-jane-okay-the-burner-your` | Jane | Okay. The burner. Your new pen pal. |  | Call `m2-handoff`. |
| 26 | `m2-dan-nice-moves-your-laptop` | Dan | 'Nice moves. Your laptop says hi. Keep this phone on.' Signed, Mr. Big. |  | Call `m2-handoff`. |
| 27 | `m2-jane-he-signs-his-texts` | Jane | He signs his texts. Like a birthday card. |  | Call `m2-handoff`. |
| 28 | `m2-dan-a-birthday-card-that` | Dan | A birthday card that wants me in prison. |  | Call `m2-handoff`. |
| 29 | `m2-jane-heres-the-thing-burners` | Jane | Here's the thing. Burners come in batches. Same batch, same buyer. |  | Call `m2-handoff`. |
| 30 | `m2-jane-if-this-one-has` | Jane | If this one has a twin, it's in somebody's pocket. And it pings. |  | Call `m2-handoff`. |
| 31 | `m2-dan-and-you-can-find` | Dan | And you can find the ping. |  | Call `m2-handoff`. |
| 32 | `m2-jane-i-read-logs-for` | Jane | I read logs for a living. I can find anything that pings. |  | Call `m2-handoff`. |
| 33 | `m2-dan-you-read-hospital-logs` | Dan | You read hospital logs. |  | Call `m2-handoff`. |
| 34 | `m2-jane-hospital-logs-bank-logs` | Jane | Hospital logs, bank logs, burner logs. Everybody leaves logs. |  | Call `m2-handoff`. |
| 35 | `m2-jane-also-your-mom-called` | Jane | Also, your mom called me. |  | Call `m2-handoff`. |
| 36 | `m2-dan-why-did-my-mom` | Dan | Why did my mom call you? |  | Call `m2-handoff`. |
| 37 | `m2-jane-because-you-didnt-pick` | Jane | Because you didn't pick up. She saw the paper. |  | Call `m2-handoff`. |
| 38 | `m2-dan-what-did-she-say` | Dan | What did she say? |  | Call `m2-handoff`. |
| 39 | `m2-jane-that-you-never-did` | Jane | That you never did a bad thing in your life. Except the haircut in ninth grade. |  | Call `m2-handoff`. |
| 40 | `m2-dan-that-haircut-was-a` | Dan | That haircut was a choice. |  | Call `m2-handoff`. |
| 41 | `m2-jane-she-says-eat-something` | Jane | She says eat something, and she believes you. In that order. |  | Call `m2-handoff`. |
| 42 | `m2-dan-tell-her-im-eating` | Dan | Tell her I'm eating. |  | Call `m2-handoff`. |
| 43 | `m2-jane-are-you-eating` | Jane | Are you eating? |  | Call `m2-handoff`. |
| 44 | `m2-dan-im-driving-past-a` | Dan | I'm driving past a hot dog cart. Spiritually, I'm eating. |  | Call `m2-handoff`. |
| 45 | `m2-dan-you-know-what-the` | Dan | You know what the worst part is? |  | Call `m2-handoff`. |
| 46 | `m2-jane-the-prison-part` | Jane | The prison part? |  | Call `m2-handoff`. |
| 47 | `m2-dan-the-loans-i-took` | Dan | The loans. I took this job to pay off the loans. |  | Call `m2-handoff`. |
| 48 | `m2-jane-seventy-eight-thousand-at` | Jane | Seventy-eight thousand at six point eight percent. |  | Call `m2-handoff`. |
| 49 | `m2-dan-you-know-my-loans` | Dan | You know my loans by heart? |  | Call `m2-handoff`. |
| 50 | `m2-jane-i-made-a-dashboard` | Jane | I made a dashboard. It's green when you pay. It's been red since Monday. |  | Call `m2-handoff`. |
| 51 | `m2-dan-when-this-is-over` | Dan | When this is over, I'm moving in with you. |  | Call `m2-handoff`. |
| 52 | `m2-jane-youve-said-that-since` | Jane | You've said that since graduation. |  | Call `m2-handoff`. |
| 53 | `m2-dan-i-was-waiting-for` | Dan | I was waiting for my bonus. |  | Call `m2-handoff`. |
| 54 | `m2-jane-you-were-waiting-for` | Jane | You were waiting for my radiator to stop clanking. |  | Call `m2-handoff`. |
| 55 | `m2-dan-does-it-still-clank` | Dan | Does it still clank? |  | Call `m2-handoff`. |
| 56 | `m2-jane-moon-sleeps-against-it` | Jane | Moon sleeps against it. She thinks it's talking to her. |  | Call `m2-handoff`. |
| 57 | `m2-jane-where-are-you` | Jane | Where are you? |  | Call `m2-handoff`. |
| 58 | `m2-dan-behind-a-bus-that` | Dan | Behind a bus that says 'Smile, New York.' |  | Call `m2-handoff`. |
| 59 | `m2-jane-are-you-smiling` | Jane | Are you smiling? |  | Call `m2-handoff`. |
| 60 | `m2-dan-im-behind-a-bus` | Dan | I'm behind a bus. I'm doing my best. |  | Call `m2-handoff`. |
| 61 | `m2-jane-bryant-park-sixth-ave` | Jane | Bryant Park, Sixth Ave side. I'm at a table. Moon's under it. |  | Call `m2-handoff`. |
| 62 | `m2-dan-is-she-guarding-you` | Dan | Is she guarding you? |  | Call `m2-handoff`. |
| 63 | `m2-jane-shes-guarding-a-pretzel` | Jane | She's guarding a pretzel. |  | Call `m2-handoff`. |
| 64 | `m2-jane-okay-im-back-at` | Jane | Okay, I'm back at my table. Moon says drive safe. |  | Call `m2-go`. |
| 65 | `m2-dan-moon-said-that` | Dan | Moon said that? |  | Call `m2-go`. |
| 66 | `m2-jane-she-sneezed-same-thing` | Jane | She sneezed. Same thing. |  | Call `m2-go`. |
| 67 | `m2-jane-the-twins-still-on` | Jane | The twin's still on. Seventh and Forty-Seventh, idling at the curb. |  | Call `m2-go`. |
| 68 | `m2-jane-also-the-occupy-camp` | Jane | Also. The Occupy camp in Washington Square made a sign about you. |  | Call `m2-go`. |
| 69 | `m2-dan-nice-or-mean` | Dan | Nice or mean? |  | Call `m2-go`. |
| 70 | `m2-jane-it-rhymes` | Jane | It rhymes. |  | Call `m2-go`. |
| 71 | `m2-dan-so-mean` | Dan | So, mean. |  | Call `m2-go`. |
| 72 | `m2-jane-dan-dan-the-greedy` | Jane | 'Dan, Dan, the greedy man.' |  | Call `m2-go`. |
| 73 | `m2-dan-i-owe-seventy-eight` | Dan | I owe seventy-eight grand in student loans. I'm the least greedy man in Manhattan. |  | Call `m2-go`. |
| 74 | `m2-jane-i-know-they-dont` | Jane | I know. They don't. Yet. |  | Call `m2-go`. |
| 75 | `m2-jane-when-you-see-the` | Jane | When you see the van, don't pull up next to it. Park, wait, let it move first. |  | Call `m2-go`. |
| 76 | `m2-dan-wait-then-follow-ive` | Dan | Wait, then follow. I've seen movies. |  | Call `m2-go`. |
| 77 | `m2-jane-youve-seen-one-movie` | Jane | You've seen one movie. You fell asleep. |  | Call `m2-go`. |
| 78 | `m2-jane-youre-taking-the-long` | Jane | You're taking the long way. |  | Call `m2-go`. |
| 79 | `m2-dan-im-taking-the-legal` | Dan | I'm taking the legal way. |  | Call `m2-go`. |
| 80 | `m2-jane-since-when` | Jane | Since when? |  | Call `m2-go`. |
| 81 | `m2-dan-since-i-got-charged` | Dan | Since I got charged with a crime. I'm very law-abiding now. |  | Call `m2-go`. |
| 82 | `m2-jane-moon-finished-the-pretzel` | Jane | Moon finished the pretzel. |  | Call `m2-go`. |
| 83 | `m2-dan-the-whole-pretzel` | Dan | The whole pretzel? |  | Call `m2-go`. |
| 84 | `m2-jane-the-whole-pretzel-and` | Jane | The whole pretzel, and a napkin. She has no regrets. |  | Call `m2-go`. |
| 85 | `m2-jane-thats-it-the-van` | Jane | That's it. The van at the curb. Stay in the car. |  | Call `m2-go`. |
| 86 | `m2-jane-let-it-pull-out` | Jane | Let it pull out first. Then you're a tail. |  | Call `m2-go`. |
| 87 | `m2-jane-hey-its-me-im` | Jane | Hey. It's me. I'm whispering. |  | Call `m2-tail`, whispered. |
| 88 | `m2-dan-why-are-you-whispering` | Dan | Why are you whispering? |  | Call `m2-tail`. |
| 89 | `m2-jane-its-a-tail-you` | Jane | It's a tail. You whisper on a tail. |  | Call `m2-tail`, whispered. |
| 90 | `m2-dan-theyre-in-a-van` | Dan | They're in a van, Jane. A block ahead. |  | Call `m2-tail`. |
| 91 | `m2-jane-then-whisper-louder` | Jane | Then whisper louder. |  | Call `m2-tail`, whispered. |
| 92 | `m2-jane-ive-got-the-van` | Jane | I've got the van. 'JPBank Security.' On the side. Subtle. |  | Call `m2-tail`, whispered. |
| 93 | `m2-dan-they-took-my-laptop` | Dan | They took my laptop, Jane. None of this is subtle. |  | Call `m2-tail`. |
| 94 | `m2-jane-its-registered-to-a` | Jane | It's registered to a Mack Moneybags. Mack. He runs Midtown for the bank's security. |  | Call `m2-tail`, whispered. |
| 95 | `m2-dan-mack-moneybags-did-his` | Dan | Mack Moneybags. Did his parents hate him? |  | Call `m2-tail`. |
| 96 | `m2-jane-he-picked-it-he` | Jane | He picked it. He has it tattooed. In cursive. |  | Call `m2-tail`, whispered. |
| 97 | `m2-jane-hang-back-if-they` | Jane | Hang back. If they make you, they'll bolt. |  | Call `m2-tail`, whispered. |
| 98 | `m2-jane-theyre-heading-west-toward` | Jane | They're heading west. Toward the river. Nothing out there but yards and wind. |  | Call `m2-tail`, whispered. |
| 99 | `m2-dan-why-would-bank-security` | Dan | Why would bank security need a yard? |  | Call `m2-tail`. |
| 100 | `m2-jane-somewhere-to-put-things` | Jane | Somewhere to put things nobody's supposed to find. |  | Call `m2-tail`, whispered. |
| 101 | `m2-jane-let-a-car-get` | Jane | Let a car get between you. Be boring. |  | Call `m2-tail`, whispered. |
| 102 | `m2-dan-im-in-a-car` | Dan | I'm in a car with rockets. |  | Call `m2-tail`. |
| 103 | `m2-jane-be-a-boring-car` | Jane | Be a boring car with rockets. |  | Call `m2-tail`, whispered. |
| 104 | `m2-jane-macks-got-a-sports` | Jane | Mack's got a sports sedan too. Plate: MACK ONE. |  | Call `m2-tail`, whispered. |
| 105 | `m2-dan-of-course-it-is` | Dan | Of course it is. |  | Call `m2-tail`. |
| 106 | `m2-jane-leased-everything-mack-has` | Jane | Leased. Everything Mack has is leased. |  | Call `m2-tail`, whispered. |
| 107 | `m2-dan-even-the-tattoo` | Dan | Even the tattoo? |  | Call `m2-tail`. |
| 108 | `m2-jane-especially-the-tattoo` | Jane | Especially the tattoo. |  | Call `m2-tail`, whispered. |
| 109 | `m2-dan-whats-moon-doing` | Dan | What's Moon doing? |  | Call `m2-tail`. |
| 110 | `m2-jane-watching-the-tracker-with` | Jane | Watching the tracker with me. She growls when the van turns. |  | Call `m2-tail`, whispered. |
| 111 | `m2-dan-shes-never-growled-in` | Dan | She's never growled in her life. |  | Call `m2-tail`. |
| 112 | `m2-jane-shes-growling-on-the` | Jane | She's growling on the inside. |  | Call `m2-tail`, whispered. |
| 113 | `m2-jane-theyre-turning-in-the` | Jane | They're turning in. The container yard on Twelfth. |  | Call `m2-tail`, whispered. |
| 114 | `m2-jane-im-hanging-up-before` | Jane | I'm hanging up before your phone rings in there. |  | Call `m2-tail`, whispered. |
| 115 | `m2-dan-its-on-silent` | Dan | It's on silent. |  | Call `m2-tail`. |
| 116 | `m2-jane-its-never-on-silent` | Jane | It's never on silent. |  | Call `m2-tail`, whispered. |
| 117 | `m2-jane-get-back-in-your` | Jane | Get back in your car. The van won't wait. |  | Call `m2-tail`, whispered. |
| 118 | `m2-jane-good-find-the-van` | Jane | Good. Find the van. Stay back. |  | Call `m2-tail`, whispered. |
| 119 | `m2-jane-too-close-ease-off` | Jane | Too close. Ease off. |  | Call `m2-tail`, whispered. |
| 120 | `m2-jane-youre-in-his-mirrors` | Jane | You're in his mirrors. Drop back. |  | Call `m2-tail`, whispered. |
| 121 | `m2-jane-dan-back-off` | Jane | Dan. Back. Off. |  | Call `m2-tail`, whispered. |
| 122 | `m2-jane-youre-losing-him-close` | Jane | You're losing him. Close it up a little. |  | Call `m2-tail`, whispered. |
| 123 | `m2-jane-dont-lose-him-hes` | Jane | Don't lose him. He's turning. |  | Call `m2-tail`, whispered. |
| 124 | `m2-jane-better-stay-right-there` | Jane | Better. Stay right there. |  | Call `m2-tail`, whispered. |
| 125 | `m2-jane-he-made-you-go` | Jane | He made you! Go, go, don't lose him! |  | Call `m2-tail`, fast and clipped. |
| 126 | `m2-dan-going` | Dan | Going! |  | Call `m2-tail`, fast and clipped. |
| 127 | `m2-jane-hes-turning-up-tenth` | Jane | He's turning up Tenth. Take the corner easy. |  | Call `m2-tail`, whispered. |
| 128 | `m2-jane-up-tenth-go` | Jane | Up Tenth! Go! |  | Call `m2-tail`, fast and clipped. |
| 129 | `m2-jane-left-on-fifty-fifth` | Jane | Left on Fifty-Fifth. That's the river. That's the yards. |  | Call `m2-tail`, whispered. |
| 130 | `m2-jane-fifty-fifth-left-left` | Jane | Fifty-Fifth! Left, left! |  | Call `m2-tail`, fast and clipped. |
| 131 | `m2-jane-thats-macks-car-hes` | Jane | That's Mack's car. He's heading for Herald Square. |  | Call `m2-chase`. |
| 132 | `m2-jane-ram-him-dan-gently` | Jane | Ram him, Dan. Gently. Ish. |  | Quick, then a beat; "Ish." an afterthought. |
| 133 | `m2-dan-theres-no-gentle-way` | Dan | There's no gentle way to ram a car. |  | Call `m2-chase`. |
| 134 | `m2-jane-hes-got-your-door` | Jane | He's got your door on his phone. Don't let that phone get away. |  | Call `m2-chase`, fast and clipped. |
| 135 | `m2-dan-not-planning-to` | Dan | Not planning to. |  | Call `m2-chase`, fast and clipped. |
| 136 | `m2-jane-he-drives-like-hes` | Jane | He drives like he's late for his bonus. |  | Call `m2-chase`, fast and clipped. |
| 137 | `m2-dan-he-is-late-for` | Dan | He is late for his bonus. I'm making him later. |  | Call `m2-chase`, fast and clipped. |
| 138 | `m2-jane-hows-the-car` | Jane | How's the car? |  | Call `m2-chase`, fast and clipped. |
| 139 | `m2-dan-fast-loud-possibly-illegal` | Dan | Fast. Loud. Possibly illegal. |  | Call `m2-chase`, fast and clipped. |
| 140 | `m2-jane-like-macks-tattoo` | Jane | Like Mack's tattoo. |  | Call `m2-chase`, fast and clipped. |
| 141 | `m2-jane-moons-barking-at-my` | Jane | Moon's barking at my screen. |  | Call `m2-chase`, fast and clipped. |
| 142 | `m2-dan-tell-her-ive-got` | Dan | Tell her I've got him. |  | Call `m2-chase`, fast and clipped. |
| 143 | `m2-jane-she-says-you-dont` | Jane | She says you don't. She's a realist. |  | Call `m2-chase`, fast and clipped. |
| 144 | `m2-jane-he-just-ran-a` | Jane | He just ran a red. And a yellow. And somehow a green. |  | Call `m2-chase`, fast and clipped. |
| 145 | `m2-dan-how-do-you-run` | Dan | How do you run a green? |  | Call `m2-chase`, fast and clipped. |
| 146 | `m2-jane-ask-mack` | Jane | Ask Mack. |  | Call `m2-chase`, fast and clipped. |
| 147 | `m2-jane-ive-got-him-on` | Jane | I've got him on a traffic camera. He's crying. |  | Call `m2-chase`, fast and clipped. |
| 148 | `m2-dan-real-tears` | Dan | Real tears? |  | Call `m2-chase`, fast and clipped. |
| 149 | `m2-jane-leased` | Jane | Leased. |  | Call `m2-chase`, fast and clipped. |
| 150 | `m2-jane-you-cant-catch-mack` | Jane | You can't catch Mack on foot! Get back in! |  | Call `m2-chase`, fast and clipped. |
| 151 | `m2-jane-go-hes-getting-away` | Jane | Go! He's getting away! |  | Call `m2-chase`, fast and clipped. |
| 152 | `m2-jane-thats-not-gentle` | Jane | That's not gentle! |  | Call `m2-chase`, fast and clipped. |
| 153 | `m2-dan-that-was-gentle` | Dan | That was gentle. |  | Call `m2-chase`, fast and clipped. |
| 154 | `m2-jane-okay-that-one-was` | Jane | Okay. That one was ish. |  | Call `m2-chase`, fast and clipped. |
| 155 | `m2-jane-hes-pulling-away-boost` | Jane | He's pulling away! Boost! |  | Call `m2-chase`, fast and clipped. |
| 156 | `m2-jane-dont-lose-him-shift` | Jane | Don't lose him! Shift, Dan! |  | Call `m2-chase`, fast and clipped. |
| 157 | `m2-jane-hes-smoking-one-more` | Jane | He's smoking! One more! |  | Call `m2-chase`, fast and clipped. |
| 158 | `m2-jane-hes-going-down-eleventh` | Jane | He's going down Eleventh. Past the convention center. |  | Call `m2-chase`, fast and clipped. |
| 159 | `m2-jane-left-on-thirty-fourth` | Jane | Left on Thirty-Fourth! He's going into traffic! |  | Call `m2-chase`, fast and clipped. |
| 160 | `m2-jane-herald-squares-a-mess` | Jane | Herald Square's a mess. He's going to crash. Be there when he does. |  | Call `m2-chase`, fast and clipped. |

## Mission 3

Mission 3 (wagmi/mission/m3*.js). Jane's car calls (wagmi/mission/calls.js, only while Dan drives): `m3-handoff`, `m3-square`, `m3-escape`, `m3-return`.

| # | id | Speaker | Line | Window | Direction |
|---|---|---|---|---|---|
| 1 | `m3-gears-cold-gas-thrusters-little` | Gears | Cold-gas thrusters. Little puffs of nitrogen. Very safe. Mostly. |  |  |
| 2 | `m3-dan-define-mostly` | Dan | Define mostly. |  |  |
| 3 | `m3-gears-i-tested-them-on` | Gears | I tested them on my van. Van's fine. It's on the roof now. |  |  |
| 4 | `m3-jane-dan-are-you-watching` | Jane | Dan. Are you watching this? JPBank's throwing a party in Washington Square. |  |  |
| 5 | `m3-fiona-jpbank-loves-new-york` | Fiona | JPBank loves New York! Free hot dogs! Free tote bags! |  |  |
| 6 | `m3-jane-right-next-to-the` | Jane | Right next to the Occupy camp. Now look at their screens. |  |  |
| 7 | `m3-jane-its-you-ten-feet` | Jane | It's you. Ten feet tall, three times. 'The bad apple.' |  |  |
| 8 | `m3-dan-im-going-to-go` | Dan | I'm going to go unplug it. |  |  |
| 9 | `m3-gears-go-get-your-name` | Gears | Go get your name back, kid. |  | Warm, a hand on the roof of the car. |
| 10 | `m3-fiona-hiii-new-york-jpbank` | Fiona | Hiii, New York! JPBank loves you! |  | On the megaphone, the community day's host; everything is the best thing ever. |
| 11 | `m3-camp-we-are-the-ninety` | Camp | We are the ninety-nine percent! |  | The camp, across the park, answering her: a chant. |
| 12 | `m3-fiona-boo-the-bad-apple` | Fiona | Boo the bad apple, everybody! Booo! |  |  |
| 13 | `m3-brick-yo-thats-banker-boy` | Brick | Yo. That's banker boy. Protect the screens! |  | Spotting Dan; into his radio. |
| 14 | `m3-fiona-wait-why-is-it` | Fiona | Wait. Why is it black? Who unplugged it? |  |  |
| 15 | `m3-fiona-well-be-right-back` | Fiona | We'll be right back! JPBank loves you! Bye! |  |  |
| 16 | `m3-dan-take-your-time` | Dan | Take your time. |  |  |
| 17 | `m3-bea-mic-check` | Bea | Mic check! |  | The people's mic: she calls, the camp says it back so the back can hear. |
| 18 | `m3-camp-mic-check` | Camp | Mic check! |  | The people's mic: the camp says it back, loud, ragged. |
| 19 | `m3-bea-anybody-the-bank-hates` | Bea | Anybody the bank hates this much... |  | The people's mic: the first half, a beat for the echo. |
| 20 | `m3-camp-anybody-the-bank-hates` | Camp | Anybody the bank hates this much! |  | The people's mic: said back. |
| 21 | `m3-bea-is-somebody-we-should` | Bea | ...is somebody we should hear out! |  | The people's mic: the turn; warm, sure. |
| 22 | `m3-camp-free-dan-free-dan` | Camp | Free Dan! Free Dan! Free Dan! |  | The camp turns it into a chant, facing the bank's dead screens. |
| 23 | `m3-dan-rook-the-guy-who` | Dan | Rook. The guy who wants out. |  |  |
| 24 | `m3-gears-youre-back-and-the` | Gears | You're back. And the car's in one piece. |  |  |
| 25 | `m3-dan-mostly` | Dan | Mostly. |  |  |
| 26 | `m3-gears-mostly` | Gears | Mostly? |  |  |
| 27 | `m3-dan-moon-sleeps-on-janes` | Dan | Moon sleeps on Jane's feet tonight. I get a garage. |  |  |
| 28 | `m3-dan-the-thrusters-work-great` | Dan | The thrusters work great. Very safe. Mostly. |  |  |
| 29 | `m3-gears-saw-the-park-on` | Gears | Saw the park on the news. Whole camp chanting your name. |  |  |
| 30 | `m3-dan-good-chanting-or-bad` | Dan | Good chanting or bad chanting? |  |  |
| 31 | `m3-gears-ha-rooms-upstairs-kid` | Gears | Ha. Room's upstairs, kid. Get some sleep. |  |  |
| 32 | `m3-brick-make-it-look-like` | Brick | Make it look like he started it! |  | Into his radio, loud enough for the camp: the planted Suits' plan, said out loud. |
| 33 | `m3-camp-we-saw-that` | Camp | We saw that! |  | The camp, all at once: they heard him. |
| 34 | `m3-fiona-jpbank-loves-you-jpbank` | Fiona | JPBank loves you! JPBank loves hot dogs! JPBank loves YOU! |  |  |
| 35 | `m3-fiona-dont-look-at-the` | Fiona | Don't look at the fight! Look at the free tote bags! |  |  |
| 36 | `m3-fiona-this-is-a-safe` | Fiona | This is a safe, fun, family space! Somebody hit him! |  |  |
| 37 | `m3-fiona-one-bad-apple-folks` | Fiona | One bad apple, folks! The rest of the bank is delicious! |  |  |
| 38 | `m3-camp-banks-got-bailed-out` | Camp | Banks got bailed out! We got sold out! |  |  |
| 39 | `m3-camp-the-whole-world-is` | Camp | The whole world is watching! |  |  |
| 40 | `m3-fiona-we-lost-a-screen` | Fiona | We lost a screen! That's fine! We have two more! And hot dogs! |  |  |
| 41 | `m3-fiona-two-screens-down-still` | Fiona | Two screens down! Still the best day ever! Somebody call legal! |  |  |
| 42 | `m3-bea-phones-up-everybody-film` | Bea | Phones up, everybody! Film the men in suits! |  | Ms. Bea, to the camp, at the first rig down: the footage of the return call. |
| 43 | `m3-brick-backup-protect-the-last` | Brick | Backup! Protect the last screen! |  |  |
| 44 | `m3-jane-i-saw-the-chat` | Jane | I saw the chat. They know where you live, so you're not sleeping there tonight. |  | Call `m3-handoff`. |
| 45 | `m3-dan-where-am-i-sleeping` | Dan | Where am I sleeping? |  | Call `m3-handoff`. |
| 46 | `m3-jane-gears-has-a-room` | Jane | Gears has a room over his garage. West Chelsea. He builds rockets for cars. He's nice. Mostly. |  | Call `m3-handoff`. |
| 47 | `m3-dan-why-not-your-place` | Dan | Why not your place? |  | Call `m3-handoff`. |
| 48 | `m3-jane-because-theyve-got-your` | Jane | Because they've got your door. Mine's next. I'm not giving them two for one. |  | Call `m3-handoff`. |
| 49 | `m3-dan-so-where-are-you` | Dan | So where are you sleeping? |  | Call `m3-handoff`. |
| 50 | `m3-jane-home-with-moon-and` | Jane | Home. With Moon and a baseball bat. Moon's the scary one. |  | Call `m3-handoff`. |
| 51 | `m3-dan-moons-afraid-of-pigeons` | Dan | Moon's afraid of pigeons. |  | Call `m3-handoff`. |
| 52 | `m3-jane-the-bat-isnt` | Jane | The bat isn't. |  | Call `m3-handoff`. |
| 53 | `m3-dan-rook-says-he-wants` | Dan | Rook says he wants out. |  | Call `m3-handoff`. |
| 54 | `m3-jane-rook-says-lets-see` | Jane | Rook says. Let's see what Rook does. |  | Call `m3-handoff`. |
| 55 | `m3-dan-he-was-the-only` | Dan | He was the only one in that chat who said 'this is getting weird.' |  | Call `m3-handoff`. |
| 56 | `m3-jane-hes-a-first-year` | Jane | He's a first-year too. Different floor, same treatment. |  | Call `m3-handoff`. |
| 57 | `m3-dan-you-know-what-else` | Dan | You know what else was in that chat? A thread called 'bonus pool.' |  | Call `m3-handoff`. |
| 58 | `m3-jane-security-gets-bonuses` | Jane | Security gets bonuses? |  | Call `m3-handoff`. |
| 59 | `m3-dan-security-gets-bonuses-first` | Dan | Security gets bonuses. First-years get fired three weeks before theirs. |  | Call `m3-handoff`. |
| 60 | `m3-jane-how-much-was-yours` | Jane | How much was yours going to be? |  | Call `m3-handoff`. |
| 61 | `m3-dan-enough-for-a-year` | Dan | Enough for a year of the loans. And a couch that isn't yours. |  | Call `m3-handoff`. |
| 62 | `m3-jane-you-love-my-couch` | Jane | You love my couch. |  | Call `m3-handoff`. |
| 63 | `m3-dan-i-love-your-couch` | Dan | I love your couch. Moon loves your couch. It's a crowded couch. |  | Call `m3-handoff`. |
| 64 | `m3-dan-how-was-your-day` | Dan | How was your day? Apart from me. |  | Call `m3-handoff`. |
| 65 | `m3-jane-apart-from-you-i` | Jane | Apart from you, I found out why the hospital's printers print in Portuguese. |  | Call `m3-handoff`. |
| 66 | `m3-dan-why-do-they` | Dan | Why do they? |  | Call `m3-handoff`. |
| 67 | `m3-jane-someone-set-them-to` | Jane | Someone set them to Portuguese. That was the whole mystery. It took four hours. |  | Call `m3-handoff`. |
| 68 | `m3-dan-you-love-it` | Dan | You love it. |  | Call `m3-handoff`. |
| 69 | `m3-jane-i-love-it` | Jane | I love it. |  | Call `m3-handoff`. |
| 70 | `m3-jane-dan-you-okay` | Jane | Dan. You okay? |  | Call `m3-handoff`. |
| 71 | `m3-dan-no-job-no-laptop` | Dan | No job, no laptop, a car with rockets. I'm great. |  | Call `m3-handoff`. |
| 72 | `m3-jane-for-real` | Jane | For real. |  | Call `m3-handoff`. |
| 73 | `m3-dan-for-real-im-tired` | Dan | For real, I'm tired of being blamed. I'd like to be tired of something else. |  | Call `m3-handoff`. |
| 74 | `m3-jane-well-find-you-something` | Jane | We'll find you something else to be tired of. Promise. |  | Call `m3-handoff`. |
| 75 | `m3-jane-thats-gears-place-big` | Jane | That's Gears' place. Big door, loud sign. Knock twice. |  | Call `m3-handoff`. |
| 76 | `m3-dan-why-twice` | Dan | Why twice? |  | Call `m3-handoff`. |
| 77 | `m3-jane-once-he-thinks-its` | Jane | Once, he thinks it's a delivery. Twice, he thinks it's me. |  | Call `m3-handoff`. |
| 78 | `m3-jane-okay-washington-square-you` | Jane | Okay. Washington Square. You know about the camp? |  | Call `m3-square`. |
| 79 | `m3-dan-occupy-jpbank-tents-and` | Dan | Occupy JPBank. Tents and drums under the arch. |  | Call `m3-square`. |
| 80 | `m3-jane-forty-one-days-bailouts` | Jane | Forty-one days. Bailouts, bonuses, foreclosures. They want an audit of the bank. |  | Call `m3-square`. |
| 81 | `m3-jane-every-night-the-news` | Jane | Every night the news shows the tents, and JPBank looks worse. |  | Call `m3-square`. |
| 82 | `m3-dan-so-the-bank-throws` | Dan | So the bank throws a party next door. |  | Call `m3-square`. |
| 83 | `m3-jane-jpbank-loves-new-york` | Jane | 'JPBank Loves New York.' Free hot dogs, a stage, and Fiona on a megaphone. |  | Call `m3-square`. |
| 84 | `m3-dan-whos-fiona` | Dan | Who's Fiona? |  | Call `m3-square`. |
| 85 | `m3-jane-head-of-community-her` | Jane | Head of Community. Her business card has glitter on it. Real glitter. |  | Call `m3-square`. |
| 86 | `m3-jane-and-three-big-screens` | Jane | And three big screens on rigs on the lawn, pointed right at the tents. |  | Call `m3-square`. |
| 87 | `m3-jane-running-a-reel-on` | Jane | Running a reel on a loop. You, ten feet tall. 'The bad apple.' |  | Call `m3-square`. |
| 88 | `m3-dan-please-tell-me-its` | Dan | Please tell me it's not the badge photo. |  | Call `m3-square`. |
| 89 | `m3-jane-its-the-badge-photo` | Jane | It's the badge photo. |  | Call `m3-square`. |
| 90 | `m3-jane-thats-the-pitch-the` | Jane | That's the pitch. The bank isn't rotten. It had one bad apple, and it caught him. |  | Call `m3-square`. |
| 91 | `m3-dan-and-if-its-one` | Dan | And if it's one bad apple, nobody checks the orchard. |  | Call `m3-square`. |
| 92 | `m3-jane-no-audit-nobody-looks` | Jane | No audit. Nobody looks at the fifty-first floor. |  | Call `m3-square`. |
| 93 | `m3-jane-the-reel-runs-off` | Jane | The reel runs off the three rigs. The big screen under the arch just mirrors them. |  | Call `m3-square`. |
| 94 | `m3-jane-kill-the-rigs-the` | Jane | Kill the rigs, the reel dies. |  | Call `m3-square`. |
| 95 | `m3-dan-and-no-reel-no` | Dan | And no reel, no bad apple. |  | Call `m3-square`. |
| 96 | `m3-jane-and-no-bad-apple` | Jane | And no bad apple, Fiona's just a lady with a megaphone and a lot of hot dogs. |  | Call `m3-square`. |
| 97 | `m3-jane-careful-the-suits-are` | Jane | Careful. The Suits are in the crowd. They'll start something and pin it on you. |  | Call `m3-square`. |
| 98 | `m3-dan-so-if-i-smash` | Dan | So if I smash their screens at a community day, I'm the bad apple. |  | Call `m3-square`. |
| 99 | `m3-jane-youre-already-the-bad` | Jane | You're already the bad apple. Be a fast one. |  | Call `m3-square`. |
| 100 | `m3-jane-one-more-thing-the` | Jane | One more thing. The camp's kitchen is run by Ms. Bea. |  | Call `m3-square`. |
| 101 | `m3-dan-should-i-know-ms` | Dan | Should I know Ms. Bea? |  | Call `m3-square`. |
| 102 | `m3-jane-she-taught-me-seventh` | Jane | She taught me seventh-grade science. She will not let you be rude. |  | Call `m3-square`. |
| 103 | `m3-dan-im-never-rude` | Dan | I'm never rude. |  | Call `m3-square`. |
| 104 | `m3-jane-two-weeks-ago-you` | Jane | Two weeks ago you walked past the camp in a suit, and a man with a drum told you to quit your job. |  | Call `m3-square`. |
| 105 | `m3-dan-and-then-i-got` | Dan | And then I got fired. He's a prophet. I owe him a drum. |  | Call `m3-square`. |
| 106 | `m3-dan-why-is-your-science` | Dan | Why is your science teacher living in a tent? |  | Call `m3-square`. |
| 107 | `m3-jane-jpbank-took-her-house` | Jane | JPBank took her house. Thirty years of payments, three months late. |  | Call `m3-square`. |
| 108 | `m3-dan-three-months` | Dan | Three months? |  | Call `m3-square`. |
| 109 | `m3-jane-her-husband-was-sick` | Jane | Her husband was sick. The bank sent a letter. Then a locksmith. |  | Call `m3-square`. |
| 110 | `m3-dan-and-now-a-hot` | Dan | And now a hot dog party. |  | Call `m3-square`. |
| 111 | `m3-jane-and-now-a-hot` | Jane | And now a hot dog party. |  | Call `m3-square`. |
| 112 | `m3-dan-you-know-the-bailout` | Dan | You know the bailout paid for my training class? |  | Call `m3-square`. |
| 113 | `m3-jane-your-what` | Jane | Your what? |  | Call `m3-square`. |
| 114 | `m3-dan-first-year-training-six` | Dan | First-year training. Six weeks in a hotel ballroom. A man in a vest explaining risk. |  | Call `m3-square`. |
| 115 | `m3-jane-did-he-explain-it` | Jane | Did he explain it? |  | Call `m3-square`. |
| 116 | `m3-dan-he-explained-it-belongs` | Dan | He explained it belongs to other people. |  | Call `m3-square`. |
| 117 | `m3-jane-hows-gears` | Jane | How's Gears? |  | Call `m3-square`. |
| 118 | `m3-dan-he-made-me-breakfast` | Dan | He made me breakfast and showed me a scar from a thruster. |  | Call `m3-square`. |
| 119 | `m3-jane-a-big-scar` | Jane | A big scar? |  | Call `m3-square`. |
| 120 | `m3-dan-he-said-its-a` | Dan | He said it's a small scar on a big man. |  | Call `m3-square`. |
| 121 | `m3-jane-thats-the-arch-park` | Jane | That's the arch. Park on Fifth and walk in. |  | Call `m3-square`. |
| 122 | `m3-jane-ill-be-watching-the` | Jane | I'll be watching the broadcast. Be quick. |  | Call `m3-square`. |
| 123 | `m3-dan-im-always-quick` | Dan | I'm always quick. |  | Call `m3-square`. |
| 124 | `m3-jane-youre-always-late` | Jane | You're always late. |  | Call `m3-square`. |
| 125 | `m3-jane-two-of-their-cars` | Jane | Two of their cars on you. The Village is all crooked streets. Use them. |  | Call `m3-escape`. |
| 126 | `m3-dan-gears-said-the-thrusters` | Dan | Gears said the thrusters were very safe. |  | Call `m3-escape`. |
| 127 | `m3-jane-gears-says-that-about` | Jane | Gears says that about everything. |  | Call `m3-escape`. |
| 128 | `m3-jane-break-their-line-corners` | Jane | Break their line. Corners, Dan. Corners. |  | Call `m3-escape`, fast and clipped. |
| 129 | `m3-dan-im-cornering` | Dan | I'm cornering! |  | Call `m3-escape`, fast and clipped. |
| 130 | `m3-jane-corner-harder` | Jane | Corner harder. |  | Call `m3-escape`, fast and clipped. |
| 131 | `m3-jane-hop-the-traffic-if` | Jane | Hop the traffic if you have to. |  | Call `m3-escape`, fast and clipped. |
| 132 | `m3-dan-hopping` | Dan | Hopping! |  | Call `m3-escape`, fast and clipped. |
| 133 | `m3-jane-did-you-just-jump` | Jane | Did you just jump a taxi? |  | Call `m3-escape`, fast and clipped. |
| 134 | `m3-dan-very-safe-mostly` | Dan | Very safe. Mostly. |  | Call `m3-escape`, fast and clipped. |
| 135 | `m3-jane-beas-people-are-filming` | Jane | Bea's people are filming you from the park. |  | Call `m3-escape`, fast and clipped. |
| 136 | `m3-dan-tell-them-to-get` | Dan | Tell them to get my good side. |  | Call `m3-escape`, fast and clipped. |
| 137 | `m3-jane-youre-in-a-car` | Jane | You're in a car. |  | Call `m3-escape`, fast and clipped. |
| 138 | `m3-dan-the-car-is-my` | Dan | The car is my good side. |  | Call `m3-escape`, fast and clipped. |
| 139 | `m3-jane-theyre-gone-you-lost` | Jane | They're gone. You lost them. |  | Call `m3-escape`, fast and clipped. |
| 140 | `m3-dan-i-lost-them` | Dan | I lost them. |  | Call `m3-escape`, fast and clipped. |
| 141 | `m3-jane-dont-sound-so-surprised` | Jane | Don't sound so surprised. |  | Call `m3-escape`, fast and clipped. |
| 142 | `m3-jane-on-foot-dan-they` | Jane | On foot? Dan, they have cars! Get back in! |  | Call `m3-escape`, fast and clipped. |
| 143 | `m3-jane-go-go` | Jane | Go, go! |  | Call `m3-escape`, fast and clipped. |
| 144 | `m3-jane-theyve-got-you-again` | Jane | They've got you again. Turn! |  | Call `m3-escape`, fast and clipped. |
| 145 | `m3-jane-still-on-you-next` | Jane | Still on you. Next corner! |  | Call `m3-escape`, fast and clipped. |
| 146 | `m3-jane-they-lost-you-keep` | Jane | They lost you. Keep it that way. |  | Call `m3-escape`, fast and clipped. |
| 147 | `m3-jane-out-of-sight-keep` | Jane | Out of sight. Keep going. |  | Call `m3-escape`, fast and clipped. |
| 148 | `m3-jane-okay-breathe-youre-clear` | Jane | Okay. Breathe. You're clear. |  | Call `m3-return`. |
| 149 | `m3-dan-breathing-did-it-work` | Dan | Breathing. Did it work? |  | Call `m3-return`. |
| 150 | `m3-jane-the-reel-died-mid` | Jane | The reel died mid-sentence. 'The face of insider trad—' and then black. |  | Call `m3-return`. |
| 151 | `m3-dan-good` | Dan | Good. |  | Call `m3-return`. |
| 152 | `m3-jane-better-than-good-the` | Jane | Better than good. The camp filmed the whole thing. Forty phones. |  | Call `m3-return`. |
| 153 | `m3-jane-bank-security-jumping-the` | Jane | Bank security jumping the bank's own bad apple, at a free hot dog party. |  | Call `m3-return`. |
| 154 | `m3-dan-when-you-put-it` | Dan | When you put it like that, I sound innocent. |  | Call `m3-return`. |
| 155 | `m3-jane-you-are-innocent-now` | Jane | You are innocent. Now it looks like it. |  | Call `m3-return`. |
| 156 | `m3-jane-bea-got-on-the` | Jane | Bea got on the people's mic. The whole park was chanting 'Free Dan.' |  | Call `m3-return`. |
| 157 | `m3-dan-ive-never-had-a` | Dan | I've never had a chant. |  | Call `m3-return`. |
| 158 | `m3-jane-and-she-crossed-out` | Jane | And she crossed out 'greedy' on that sign. Now it says 'Dan, Dan, the fall man.' |  | Call `m3-return`. |
| 159 | `m3-dan-thats-actually-accurate` | Dan | That's... actually accurate. |  | Call `m3-return`. |
| 160 | `m3-jane-if-the-camp-gets` | Jane | If the camp gets its audit, the insiders go down with Mr. Big. They're panicking. At him, for once. |  | Call `m3-return`. |
| 161 | `m3-dan-thats-why-he-moved` | Dan | That's why he moved the laptop up to dawn. |  | Call `m3-return`. |
| 162 | `m3-jane-and-rooks-driving-it` | Jane | And Rook's driving it. The one who wants out. |  | Call `m3-return`. |
| 163 | `m3-dan-either-he-wants-out` | Dan | Either he wants out, or Mr. Big wants me alone in a dark park. |  | Call `m3-return`. |
| 164 | `m3-jane-so-were-careful` | Jane | So we're careful. |  | Call `m3-return`. |
| 165 | `m3-dan-were-never-careful` | Dan | We're never careful. |  | Call `m3-return`. |
| 166 | `m3-jane-we-start-tonight-go` | Jane | We start tonight. Go back to Gears. Eat something. Sleep an hour. |  | Call `m3-return`. |
| 167 | `m3-dan-yes-ms-bea` | Dan | Yes, Ms. Bea. |  | Call `m3-return`. |
| 168 | `m3-jane-dont-shed-like-you` | Jane | Don't. She'd like you, by the way. She says you have a polite face. |  | Call `m3-return`. |
| 169 | `m3-dan-tell-her-its-the` | Dan | Tell her it's the only one I've got. |  | Call `m3-return`. |
| 170 | `m3-jane-moon-watched-the-whole` | Jane | Moon watched the whole thing on my laptop. |  | Call `m3-return`. |
| 171 | `m3-dan-was-she-proud` | Dan | Was she proud? |  | Call `m3-return`. |
| 172 | `m3-jane-she-barked-at-fiona` | Jane | She barked at Fiona and slept through the chase. |  | Call `m3-return`. |
| 173 | `m3-dan-priorities` | Dan | Priorities. |  | Call `m3-return`. |
| 174 | `m3-jane-your-mom-saw-it` | Jane | Your mom saw it on the news. |  | Call `m3-return`. |
| 175 | `m3-dan-which-part` | Dan | Which part? |  | Call `m3-return`. |
| 176 | `m3-jane-the-chanting-she-called` | Jane | The chanting. She called the station to say you're a very polite boy. |  | Call `m3-return`. |
| 177 | `m3-dan-did-they-put-her` | Dan | Did they put her on? |  | Call `m3-return`. |
| 178 | `m3-jane-they-put-her-on` | Jane | They put her on. Twice. |  | Call `m3-return`. |
| 179 | `m3-dan-how-many-people-are` | Dan | How many people are we talking? Chanting. |  | Call `m3-return`. |
| 180 | `m3-jane-the-park-and-eleven` | Jane | The park. And eleven thousand people watching JPBank's own broadcast. |  | Call `m3-return`. |
| 181 | `m3-dan-jpbank-broadcast-me-getting` | Dan | JPBank broadcast me getting jumped by JPBank. |  | Call `m3-return`. |
| 182 | `m3-jane-live-they-paid-for` | Jane | Live. They paid for it, too. |  | Call `m3-return`. |
| 183 | `m3-jane-theres-the-garage-go` | Jane | There's the garage. Go. Sleep. |  | Call `m3-return`. |
| 184 | `m3-dan-love-you` | Dan | Love you. |  | Call `m3-return`. |
| 185 | `m3-jane-love-you-go` | Jane | Love you. Go. |  | Call `m3-return`. |

## Mission 4

Mission 4's teaser, on the last drive of Mission 3. Jane's car call (wagmi/mission/calls.js, only while Dan drives): `m4-teaser`.

| # | id | Speaker | Line | Window | Direction |
|---|---|---|---|---|---|
| 1 | `m4-jane-youre-going-to-see` | Jane | You're going to see Rook. |  | Call `m4-teaser`. |
| 2 | `m4-dan-he-said-come-alone` | Dan | He said come alone. |  | Call `m4-teaser`. |
| 3 | `m4-jane-he-said-i-didnt` | Jane | He said. I didn't. I'm on the phone. That's alone-ish. |  | Call `m4-teaser`. |
| 4 | `m4-dan-alone-ish` | Dan | Alone-ish. |  | Call `m4-teaser`. |
| 5 | `m4-jane-if-anything-feels-off` | Jane | If anything feels off, you drive away. Promise me. |  | Call `m4-teaser`. |
| 6 | `m4-dan-promise` | Dan | Promise. |  | Call `m4-teaser`. |
| 7 | `m4-dan-what-do-you-think` | Dan | What do you think Rook wants? |  | Call `m4-teaser`. |
| 8 | `m4-jane-out-like-he-said` | Jane | Out. Like he said. |  | Call `m4-teaser`. |
| 9 | `m4-dan-everybody-wants-out-of` | Dan | Everybody wants out of something. |  | Call `m4-teaser`. |
| 10 | `m4-jane-i-dont-i-like` | Jane | I don't. I like my couch. |  | Call `m4-teaser`. |
| 11 | `m4-jane-moons-asleep-on-your` | Jane | Moon's asleep on your hoodie again. |  | Call `m4-teaser`. |
| 12 | `m4-dan-tell-her-im-coming` | Dan | Tell her I'm coming home soon. |  | Call `m4-teaser`. |
| 13 | `m4-jane-she-knows-shes-keeping` | Jane | She knows. She's keeping it warm. |  | Call `m4-teaser`. |
| 14 | `m4-jane-no-rook-yet` | Jane | No Rook yet. |  | Call `m4-teaser`. |
| 15 | `m4-dan-hell-come` | Dan | He'll come. |  | Call `m4-teaser`. |
| 16 | `m4-jane-then-we-wait-together` | Jane | Then we wait. Together. Ish. |  | Call `m4-teaser`. |

## Every car call

Every car call (wagmi/mission/calls.js): the lines when Dan gets out of the car (on hold) and back in.

| # | id | Speaker | Line | Window | Direction |
|---|---|---|---|---|---|
| 1 | `calls-dan-hang-on-getting-out` | Dan | Hang on. Getting out. |  | Any call. |
| 2 | `calls-jane-you-got-out-ill` | Jane | You got out. I'll hold. |  | Any call. |
| 3 | `calls-jane-there-you-are-where` | Jane | There you are. Where was I? |  | Any call. |
| 4 | `calls-jane-welcome-back-seatbelt` | Jane | Welcome back. Seatbelt. |  | Any call. |
