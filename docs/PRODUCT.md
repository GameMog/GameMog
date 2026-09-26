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
