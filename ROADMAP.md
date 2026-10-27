# Roadmap

MOG CITY: Unfinished Business is planned as eight story missions in three acts. The story and the cast are in [docs/STORY.md](docs/STORY.md). This page is the short version: what's playable, what's next, and where help is welcome.

Ideas go in the [issues](https://github.com/GameMog/GameMog/issues) ("Mog City idea: ..."). Before building something big, open an issue so we can agree on it first (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Playable now: Episode 1

| | Mission | Where |
|---|---|---|
| Act I · Fall Guy | **M1 · Bagged**: the opening cutscene, the drive, the fight in Chelsea Park | Murray Hill → Chelsea |
| Act I · Fall Guy | **M2 · Burner**: the burner phone, Jane and Moon at Bryant Park, the tail, the West Side yard | Bryant Park → Times Square → Hell's Kitchen |
| Act II · Insiders | **M3 · KOLs**: Gears' thrusters, and shutting down Fiona's paid Blimpco rally | West Chelsea → Washington Square → West Village |

The game also has free roam across Manhattan, Dan's car (boost, thrusters, V8 or electric), traffic, crowds, chases, a car radio and the cold-open trailer, on desktop and phones.

## Next: the rest of the story

| | Mission | The idea |
|---|---|---|
| Act II · Insiders | **M4 · Shredder** | Rook wants out of the Suits and knows the laptop's way to the shredder at dawn. Lower East Side → Chinatown → the Seaport. (The teaser is already in the game: Rook's bench in Sara D. Roosevelt Park.) |
| Act II · Insiders | **M5 · Bull Run** | Mr. Big's armoured "vault truck" outside the stock exchange. Jane thinks the laptop is inside. Financial District → the Battery → FDR Drive. Unlocks the rocket burst. |
| Act III · Clean Name | **M6 · Buy the Dip** | Dan at his lowest. Coach Ruth trains him, then they find the Suits paying off witnesses at a table on 125th St. Harlem → Riverside Park. |
| Act III · Clean Name | **M7 · Diamond Hands** | The hand-over at Bethesda Terrace: the closest Dan gets before the end. Central Park → Columbus Circle. |
| Act III · Clean Name | **M8 · WAGMI** | Midnight showdown with Mr. Big. Times Square → Penn Station, then home to Jane and Moon. |

Each mission opens more of the city, Act II opens Downtown and Act III opens the whole island up to 129th St.

## Where help is welcome

- **The city's tests:** 40 of the 97 tests in `tests/` fail after the game's changes to the city code. Getting them green is a self-contained first contribution.
- **Street life:** more pedestrians, outfits, small scenes and side activities that make Manhattan feel busy.
- **The radio:** new tracks for the car radio. They must be your own work, or CC0 / CC BY from their author.
- **Phones:** testing and fixing layouts and controls on real devices: foldables, small phones, tablets.
- **Accessibility:** readable text, subtitles, controls and screen-reader labels for the menus.
- **Performance:** a smoother frame rate on low-end laptops and phones.
- **Mission 4 groundwork:** the Lower East Side, Chinatown and Seaport sets and Rook's character. Pitch it in an issue first, since the story is decided by the GameMog team.

## Known issues

- Every voice in the game is synthesised for now (Mr. Big's included), to be replaced by recordings.
- The game is served at **mc.gamemog.com**; its code is in [GameMog/GameMog](https://github.com/GameMog/GameMog) on the `mogcity` branch.
