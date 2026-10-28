# Contributing to MOG CITY

MOG CITY: Unfinished Business is GameMog's flagship game: free to play at [mc.gamemog.com](https://mc.gamemog.com), with its code open in [GameMog/GameMog](https://github.com/GameMog/GameMog) on the `mogcity` branch. If you want to fix a bug, polish something, add to the city or help build the next mission, you're welcome here.

The first goal isn't stars. It's the first pull request from someone outside the project that changes something players can feel in the game.

## Run it

There is no build step and nothing to install.

```bash
git clone --branch mogcity https://github.com/GameMog/GameMog.git mog-city
cd mog-city
python3 -m http.server 8000
```

Open http://localhost:8000 and click, or press any key, for sound. A recent Chrome or Edge works best. It falls back to WebGL2 when WebGPU isn't there, and phones work too.

## URL switches

Add these to the URL to jump straight to what you're working on (combine them with `&`, for example `?m3=rigs&gfx=low`). The game with no switch opens on the title screen, then the opening.

**Missions and the trailer**

| Switch | What it does |
|---|---|
| `?nointro` | Free roam: no title screen, no cutscene, no mission |
| `?nogate` | No title screen: the opening plays at once |
| `?m1=car`, `drive`, `arrival`, `fight`, `search` | Mission 1 (*Bagged*) from that checkpoint |
| `?m2=start`, `go`, `tail`, `yard`, `fight`, `chase`, `crash`, `phone` | Mission 2 (*Burner*) from that checkpoint |
| `?m2=handoff` | After Mission 1: by the Suits' van at Chelsea Park, Jane's DM, then the drive to Bryant Park with her on the car phone |
| `?m3=garage`, `square`, `rigs`, `escape`, `return` | Mission 3 (*Occupied*) from that checkpoint |
| `?m3=handoff` | After Mission 2: at twilight by Gears' garage on W 22nd St, its G on the radar |
| `?trailer=1` | Play the cold-open trailer before the opening (it is off by default) |
| `?trailer=only` | Play only the trailer; add `&trat=20` to start 20 seconds in |
| `?gfx=high`, `phone`, `low` | Force a graphics tier for this load |

**Testing**

| Switch | What it does |
|---|---|
| `?fight` | On foot with a crew of four Suits in front of you, and bats, bottles and cans around |
| `?fightrules=lesson`, `full` | Pin the fight rules: Mission 1's forgiving lesson, or the full ones |
| `?pursuit=1` to `5` | Into the car and straight into a chase at that heat; add `&police` for police instead of the Suits |
| `?thrusters=all`, or `boost,hop,dash` | Unlock the car's thrusters without Mission 3 |
| `?debug` | A click on the full map teleports you; every checkpoint is open in Mission select |
| `?sandbox` | The city's own sandbox mode keys (1 to 4) work |
| `?noaudio` | No sound at all |
| `?nocast` | The trailer leaves out Jane at her laptop (a faster load while you work on the rest of it) |
| `?statsto=http://localhost:3000` | Send the visit counts to a GameMog running on your machine, to test them (nothing is sent anywhere else) |

`?utm_source=` and `?ref=` change nothing in the game: on mc.gamemog.com they are noted with the visit, to see where players come from. None of the mission or testing switches is counted (`wagmi/stats.js`).

## Where things live

- `index.html` loads everything: the instant title screen (its lockup, light and motion), the HUD and the scripts.
- `js/` is the city: roads, buildings, traffic, people, cameras and controls. It comes from [Slop New York](https://github.com/mrdoob/slop-newyork) by Mr.doob, with changes for this game.
- `wagmi/` is the game:
  - `wagmi/mission/` holds the missions (`m1.js`, `m2.js`, `m3.js`), their scenes and sets, and the mission UI. `wagmi/mission/calls.js` is Jane on the car phone: every drive's call, played only while Dan is at the wheel.
  - `wagmi/combat/` is the street fighting; `wagmi/pursuit/` the chases, the heat and the car's thrusters.
  - `wagmi/intro.js` is the opening cutscene, `wagmi/gate-drift.js` the title screen's camera over the live city, and `wagmi/trailer.js` the cold-open trailer (off by default).
  - `wagmi/audio/` and `wagmi/radio/` are the sound and the car radio; `wagmi/radio/build/` builds the voice files (see `docs/VOICE-LINES.md`).
  - `wagmi/stats.js` is the first-party visit counts (only from mc.gamemog.com); `wagmi/credits.js` the in-game Credits page.
  - There are also the characters, the car and the phone UI.
- `assets/` holds the models, animation, music, voices and images. Every third-party file is listed in `assets/CREDITS.md` and `NOTICE`.
- `docs/STORY.md` is the story and the cast; `docs/MISSIONS.md` is the same story plus how a mission is built. `docs/VOICE-LINES.md` is every spoken line and how voices are made.
- `tests/` holds the city's tests (`node --test tests/*.test.*`). **Heads-up:** 40 of the 97 fail today because the game changed code the tests stub out. Fixing them is a great first contribution. Otherwise, just don't add new failures.

## House rules

These keep the game what it is. A pull request that breaks one won't be merged, however good the code is.

- **No guns and no knives.** Fights are fists, kicks, bats, bottles and trash cans.
- **Mr. Big's face is his own.** JPBank's CEO is an original face, nobody's: no real person's likeness, whatever the reference.
- **Everyone and everything is fictional.** No real person's name or likeness, and no real brands or logos (JPBank is the game's own invented bank). Look-alikes need original names and no badges. No real stock tickers, and nothing in the game to buy, sell or invest in.
- **Jane is an adult (mid-20s, Dan's girlfriend) and is shown with respect: her Puerto Rican heritage is part of who she is, never a joke, an accent or a stereotype.**
- **The camp is shown with respect too.** OCCUPY JPBANK is invented: no real activist, group or slogan owner is named, and the joke is on the bank, never on the people in the tents or on Ms. Bea.
- **Nothing in the game names the tools used to make it.**
- **Keep it fun and kind.** No hate, no sexual content, no real-world harassment. The villains can be ridiculous; the game shouldn't be cruel.
- **Phones count.** If you touch the UI or controls, check it on a phone (portrait and landscape) as well as a desktop.

## Licences

- **Code** you contribute is released under the [MIT License](LICENSE), the same as the rest of the code.
- **Assets** (models, textures, sounds, music, motion) must be yours to give under CC0, or CC0 / CC BY from their author. Add the source, author and licence to `assets/CREDITS.md` and `NOTICE`. Ask in an issue first before adding anything under other terms.
- Some parts keep their own terms and must not be copied elsewhere: the street-combat system ported from Spiderbench (used with its author's permission) and the Bandai Namco motion capture (CC BY-NC 4.0: non-commercial use only; Mog City is free to play). See `NOTICE`.

## Sending a change

Mog City shares its repository, issues and Discussions with GameMog, so start every title with **"Mog City:"**.

1. **Check first.** Look at the open [issues](https://github.com/GameMog/GameMog/issues?q=is%3Aissue+is%3Aopen+%22Mog+City%22) (`good first issue` and `help wanted` are good places to start). For anything bigger than a fix, open an issue or a post in [Discussions](https://github.com/GameMog/GameMog/discussions) to agree on the idea before you build it.
2. **Fork and branch.** Fork the repo and make a branch from `mogcity` (not `main`, which is GameMog), one change per pull request, opened against `mogcity`. Small pull requests get reviewed fastest.
3. **Test it** in the browser:
   - no new errors in the console;
   - the mission or area you changed plays through;
   - for anything visual, desktop and phone.
4. **Open the pull request** against `mogcity`, and fill in [the template](.github/pull_request_template.md) (paste it in if GitHub doesn't: it only fills in `main`'s own): what changed, why, how you tested it, and screenshots or a short clip for anything you can see or hear.

The GameMog team reviews every pull request, may ask for changes, and has the final say on what goes in, especially anything to do with the story and the characters. Merged work is credited.

## Ideas and the story

The campaign is planned as eight missions (see [ROADMAP.md](ROADMAP.md) and `docs/STORY.md`). Ideas for missions, characters, side activities and the city are very welcome in [Discussions](https://github.com/GameMog/GameMog/discussions) (Ideas), or as an [issue](https://github.com/GameMog/GameMog/issues) titled "Mog City idea: ...". The story itself is decided by the GameMog team, so pitch before you build.

## Be decent

Everyone taking part agrees to the [Code of Conduct](CODE_OF_CONDUCT.md).
