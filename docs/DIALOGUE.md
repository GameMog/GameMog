# Mog City: how people talk

The bar is Jane and Dan on the car phone (`wagmi/mission/calls.js`, `m1-drive`). Those calls work for four reasons:
short two-way banter, specific and personal content, a sound that hides the voices' flatness, and a player who is busy
driving through every silence. A cutscene has none of that for free, so its words, its timing and its staging have to
earn it. These are the rules every scene, call and story pack line is written and played to.
`node tools/story/dialogue-lint.mjs` checks the ones a script can (report only).

## Writing

| | Rule |
|---|---|
| W1 | Turn rhythm: median line 5-8 words; 25 %+ of lines 4 words or fewer; 15 %+ questions, and one in any cutscene or call of 4+ lines (a beat of 3 lines or fewer, or a quick-fire run of barks and one-liners, median 5 words or fewer, such as a villain's put-down and its answer, needs none: no filler questions). One speaker at most 3 lines in a row in a call, 2 in a cutscene. A line at most 2 sentences in a cutscene, 3 in a call. |
| W2 | Two-way: each speaker gives a fact the other doesn't have. Pure prompts ("He bought a painting?") at most 1 in 4 of a speaker's lines. |
| W3 | A plot fact is followed within 2 lines by a joke, a personal detail or a reaction. Never 3 plot lines in a row. ("What's on fifty-one?" / "Mr. Big. And his bathroom. It's a very big bathroom.") |
| W4 | A concrete detail every 4 lines: a number, a street, a named object, a smell. No "the asset", "the target". |
| W5 | Every scene after the first reuses a motif from an earlier one (Moon, the pretzel, the leather chair); every story sets something up and pays it off later. |
| W6 | One sincere beat per scene: 10 words or fewer, plain, straight after a joke, an authored pause of 0.6-0.8 s, then a light turn. At most 1 authored pause per 8 lines. |
| W7 | A scene ends on a button (a setup and punch, or an echo: "Except the laptop." / "Except the laptop."), never an instruction or the objective. |
| W8 | Subtext: people say less than they mean; love shows in what they know ("I know. I was right there."). |
| W9 | Every speaking character has a voice sheet: rhythm, one habit or pet name, a joke style, one thing they'd never say, their motifs. |
| W10 | Each scene has a long rambling line next to a one-or-two-word answer. |
| W11 | Action calls have react pools (too close, hit, lost, spotted; 2-3 lines each, 7 s apart). |

Banned: a logline said to camera, the villain stating his plan, narrating what's on screen, saying the objective out
loud, a henchman relaying orders, a monologue briefing (7+ plot lines from one speaker), a face explaining the twist.

## Flow

Exposition and logistics go in calls while the player drives, controls live. A cutscene is for a turn, a reveal, a
first meeting or a payoff: at most 30 s and 8 lines, entering on a line already under way and leaving on its button.

## Delivery (the runtime: `wagmi/radio/turns.js`)

A say() tuple's 4th field is a number (an authored pause, as before) or a beat:
`['Dan', WHITE, "That's their van.", { pause: 0.7, how: 'hushed' }]`.

| Field | Meaning |
|---|---|
| `pause` | seconds of silence after the line (a reveal 0.8-1.2, the W6 pivot 0.6-0.8); left out, the beat decides |
| `pre` / `post` | seconds before / after it (0-1.2); a line starting `...` gets a 0.3 s pre-beat |
| `overlap` | a reply of 2 words or fewer starts 0.15 s before the line before ends (at most 1 in 6 lines) |
| `how` | warm, tease, deadpan, urgent, angry, shout, scared, hushed, hesitant, sad, smug: the voice build makes the line in it (its pitch ±1 semitone, a Kokoro voice's speed ±8 %, its level: a shout 3 dB up, hushed 4 down) |

Without a written pause, a quick reply (4 words or fewer, or the answer to a question) lands 0.12 s after the line
before; a line after a trail-off (`...`) cuts in after 0.05 s; anything else 0.25 s. A line with a recording is held
exactly as long as its voice (no 1.4 s floor), and its subtitle stays up until the next one replaces it. The last
line's own pause and post are kept, its subtitle up through them. A line whose recording has no length yet (a world's
clip before it is decoded) waits for the decode, up to 2.5 s, so it is held for its real length and never cut by the
next; every line of a scene starts decoding when the scene does. The first in-person line of a scene takes a breath
first (D5: `W.voice.breath`, soft filtered noise, 0.2 s; none on a phone or video band).
Story packs carry the same fields on a line object (`{ who, text, how, pre, post, pause, overlap }`), and a cutscene
shot may hold several lines (`lines: [...]`) or none (`react: true`, 0.6-1.2 s, a reaction after a reveal).

A scene's in-person lines are heard in its place: `room: 'street' | 'park' | 'garage' | 'interior'` on a runScene def
(or talk()), a short room and the distance's top end under the dry voice (`wagmi/radio/voices.js`). Calls keep their
phone and video bands.

## Staging

Eyes go to the scene partner, never the lens (`wagmi/face.js`: the nearest face in front of or beside them). On a line
over 2.5 s with no shot of its own, talk() cuts to the listener's single partway through (`singles`). Cuts land on a
line's start or a reaction inside it. Story worlds use the shot grammar (`frame`: two, ots, react, single) before a
hand-written lens.
