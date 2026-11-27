# Roadmap

MOG CITY: Unfinished Business is planned as eight story missions in three acts. The story and the cast are in [docs/STORY.md](docs/STORY.md). This page is the short version: what's playable, what's next, and where help is welcome.

Ideas go in [Discussions](https://github.com/GameMog/GameMog/discussions) (Ideas), or in the [issues](https://github.com/GameMog/GameMog/issues) as "Mog City idea: ...": the repository and both boards are shared with GameMog, so say it's Mog City. Before building something big, open an issue so we can agree on it first (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Episode 1: Missions 1 to 4

| | Mission | Where |
|---|---|---|
| Act I · Fall Guy | **M1 · Bagged**: the opening cutscene, the drive, the fight in Chelsea Park | Murray Hill → Chelsea |
| Act I · Fall Guy | **M2 · Burner**: the burner phone, Jane and Moon at Bryant Park, the tail, the West Side yard | Bryant Park → Times Square → Hell's Kitchen |
| Act II · Insiders | **M3 · Occupied**: Gears' thrusters; JPBank's "JPBank Loves New York" PR day next to the OCCUPY JPBANK camp; smashing the three screen rigs that aim its smear reel at the tents; Ms. Bea's people's mic and "Free Dan"; losing the Suits in the Village | West Chelsea → Washington Square → West Village |
| Act II · Insiders | **M4 · Shredder** (being built: a first playable with stand-ins): Rook on his bench at dusk; a waiter's jacket at the unveiling of Mr. Big's prized **High Artwork** in an open-sided glass pavilion at the Seaport; the artist's mark; Mr. Big's signing key, unlocked for 90 seconds; the certificate flips from MR. BIG to DAN; Mr. Big's own helicopter across downtown to the Battery Park City riverfront; the last ferry off the island, and the call on its stern deck that holds the key hostage for the laptop | Lower East Side → Chinatown → the Seaport → Battery Park City → the Hudson |

Episode 1 ends after Mission 4 with the END OF EPISODE 1 card (Mission 3 now hands straight on to Rook's R).

The game also has a title screen over the live city, Jane on the car phone whenever Dan drives, a fully voiced cast (Ms. Bea and the Camp included), free roam across Manhattan, Dan's car (boost, thrusters, V8 or electric), traffic, crowds, chases, a car radio and the cold-open trailer (off before the opening by default: `?trailer=1` puts it back, `?trailer=only` plays it alone), on desktop and phones.

## Next: the rest of the story

| | Mission | The idea |
|---|---|---|
| Act II · Insiders | **M5 · Bull Run** | The next morning: Dan steps off the morning ferry at Pier 11, where Gears has left his car ("Your car. Mostly."). Mr. Big's armoured "vault truck" outside the stock exchange. Jane thinks the laptop is inside. Financial District → the Battery → FDR Drive. Unlocks the rocket burst. |
| Act III · Clean Name | **M6 · Rock Bottom** | Dan at his lowest. Coach Ruth trains him, then they find the Suits paying off witnesses at a table on 125th St. Harlem → Riverside Park. |
| Act III · Clean Name | **M7 · The Hand-Off** | The hand-over at Bethesda Terrace: the closest Dan gets before the end. Central Park → Columbus Circle. |
| Act III · Clean Name | **M8 · Closing Bell** | The finale. Times Square → Penn Station, then home to Jane and Moon. **To be reworked:** Mr. Big is never seen in person, so the showdown cannot be face to face (the suggestion, waiting on the GameMog team: his Suits in person, Mr. Big on Dan's phone and on the Times Square screens, live from his office; Dan wins by exposing him on those screens). |

Free roam is the whole island from the start; the missions take Dan downtown in Act II and uptown in Act III.

Two rules hold for the whole story: **Mr. Big is only ever seen on the phone or on video from his office** (his study), never in person, the finale included; and the work Dan steals in Mission 4 is only ever called **the High Artwork** in the game.

## Where help is welcome

- **The city's tests:** 40 of the 97 tests in `tests/` fail after the game's changes to the city code. Getting them green is a self-contained first contribution.
- **Street life:** more pedestrians, outfits, small scenes and side activities that make Manhattan feel busy.
- **The radio:** new tracks for the car radio. They must be your own work, or CC0 / CC BY from their author.
- **Phones:** testing and fixing layouts and controls on real devices: foldables, small phones, tablets.
- **Accessibility:** readable text, subtitles, controls and screen-reader labels for the menus.
- **Performance:** a smoother frame rate on low-end laptops and phones.
- **Mission 4:** the Seaport pavilion set, the ferry and its wake, and Rook's own model (he has a stand-in body for now). Pitch it in an issue first, since the story is decided by the GameMog team.
- **Ms. Bea, seen:** she is heard but not seen in Episode 1. Her look is in `docs/STORY.md` (an original older woman, nobody's likeness); pitch a model first.

## Known issues

- Every voice in the game is synthesised for now (Mr. Big's, Ms. Bea's and the Camp's included), to be replaced by recordings. Rook has no voice yet, and a stand-in body in Mission 4; Mission 4's new lines play as placeholder murmurs until they are voiced.
- Ms. Bea is off screen in Episode 1: her kitchen tent is in the camp, she isn't.
- The game is served at **mc.gamemog.com**; its code is on the [`mogcity` branch](https://github.com/GameMog/GameMog/tree/mogcity) of GameMog/GameMog.
