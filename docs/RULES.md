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
| "you start with 1 competitor" | One rival stands beside you on the start line from the title screen through the countdown and starts from standing at the gun. | "one rival stands on the start line beside you before the gun" |
| "each lap … 1 additional competitor appears with a slightly faster speed and aggressiveness than prior lap" | As you cross the line, rival k joins at the line (6 m past it, in a clear lane, in view of the camera), faster and more aggressive than rival k−1. It holds its lane for 2.5 s before it hunts you. | "one new rival per lap", "each new rival is faster / more aggressive", "every rival joined at the start line" |
| "gradual increasing speed, aggression and difficulty per lap" (Sep 23) | Every lap: your speeds × 1.05 (to 1.6×); every rival already racing gains 0.015 of your speed and 0.02 aggression; moving obstacles × 1.04 (to 1.5×). | "your pace rises every lap", "rivals already racing gain on you and hunt harder" |
| "only way to die is bump a competitor or obstacle" | Touching a rival or an obstacle ends the run; nothing else does. | "touching an obstacle or rival ends the run" |
| "coins will be golden and called GM" | Golden GM coins, identical in every world, re-laid every lap. | "GM coins are collected" |
| "mobile controls and desktop spacebar is pause, navigation is arrow keys" | Arrows or WASD steer and change speed, Space pauses, touch buttons on phones. | controls checks |
| "2D should not be allowed" | Every world is 3D, seen through the runtime's chase camera; worlds cannot create, move or re-project cameras. | `check` "worlds are 3D" |
| "goal is to get to highest level without getting killed" | Leaderboard ranks level, then GM. | score route |

## 2. Mog (v1)

| Owner's words | Interpretation in code | Tested by |
|---|---|---|
| "'Mog' means challenge this game with a better variation" | Every game has a **Mog** button. A Mog is a new game made from another one plus a one-line idea for how to make it better. | `check:platform` |
| "a button to take original code of game and 'MOG' it into a derivative" | Claude Opus 5.5 receives the original's complete code (a runtime world's module; for older formats, what it was built from), the original prompt and the challenger's idea, and writes a complete new world. It passes the same static check and Chrome playtest as any world before it can publish. | generation path; `check:platform` publishes a Mog |
| "the original is always credited" (Mog v1 plan) | A Mog records its parent, its family's root and its generation. Its page says "Mogged from …" and links the original; the original's page lists its Mogs. | `check:platform` lineage |
| "humans select" | On a Mog's page, a **Mog-off** asks: this Mog or the one it challenged? A pick counts only if that browser has finished a run in **both** games. One pick per browser per Mog-off; it can be changed. | `check:platform` counted / uncounted picks |
| "winners reproduce" (selection signal, v1) | Each family is ranked by Elo over its counted Mog-off picks (K = 32, from 1000), then by distinct players. The leader is marked on its page. (Featuring winners is step 5, not built.) | `check:platform` Elo |

## 3. You

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
