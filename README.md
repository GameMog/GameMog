# MOG CITY: Unfinished Business

[![MOG CITY: Unfinished Business](og.jpg)](https://mc.gamemog.com)

**▶ [Play now at mc.gamemog.com](https://mc.gamemog.com)** (free, in your browser, desktop or phone) · [Watch the trailer](https://mc.gamemog.com/trailer.mp4) · [Contribute](CONTRIBUTING.md) · [Roadmap](ROADMAP.md) · [Issues](https://github.com/GameMog/GameMog/issues) · [Discussions](https://github.com/GameMog/GameMog/discussions)

**MOG CITY: Unfinished Business** is GameMog's flagship open-world mission game, in the browser. Dan, a first-year associate at JPBank, has just been fired and charged with insider trading: the bank set him up to take the fall. Its security team, a gang of thugs in suits, has taken the laptop that could prove it, and the bank's CEO, Mr. Big, wants a signed confession. With Jane, his girlfriend since college, piecing the evidence together, Dan has missions to run and a name to clear.

Drive Dan's rocket-boosted supercar through Manhattan, fight the Suits hand to hand, follow the trail from Chelsea to the West Side yards to Washington Square, and prove he was set up.

Mog City is free to play, and its code is open source: it lives in [GameMog/GameMog](https://github.com/GameMog/GameMog) on the [`mogcity` branch](https://github.com/GameMog/GameMog/tree/mogcity), next to GameMog itself (on `main`). It is built on [Slop New York](https://github.com/mrdoob/slop-newyork) by Mr.doob (three.js, WebGPURenderer and TSL).

## Play it

Play it at **[mc.gamemog.com](https://mc.gamemog.com)**. To run it yourself there is no build step: get the `mogcity` branch, serve the folder and open it in a browser (a recent Chrome or Edge works best; phones work too):

```bash
git clone --branch mogcity https://github.com/GameMog/GameMog.git mog-city
cd mog-city
python3 -m http.server 8000
```

Then open http://localhost:8000. Click, or press any key, for sound. The game opens on its title screen and goes straight into the opening; `?trailer=1` plays the cold-open trailer first and `?trailer=only` plays the trailer by itself. Every URL switch (mission checkpoints, graphics tiers, test switches) is listed in [CONTRIBUTING.md](CONTRIBUTING.md#url-switches).

At mc.gamemog.com the game counts its own visits, first-party, at gamemog.com ([`wagmi/stats.js`](wagmi/stats.js)): a random id the browser makes for itself, page loads (with the linking site's name and any `?utm_source=` or `?ref=`), starts, the missions reached, passed or failed, and play time. No cookies, no IP addresses, nothing from the developer switches, and a copy you run yourself sends nothing.

## What's in it

- **Three story missions.** *Bagged*: the opening, then Chelsea Park. *Burner*: Bryant Park, Times Square and the West Side yard. *Occupied*: Gears' garage, then JPBank's "JPBank Loves New York" PR day next to the OCCUPY JPBANK camp in Washington Square: smash the three screen rigs that aim JPBank's smear reel of Dan at the tents, and Ms. Bea's people's mic turns the whole park to chanting "Free Dan."
- **A title screen over the live city.** The MOG CITY lockup lands over an aerial still of Midtown while the city loads; then the still gives way to the live city, the camera drifting slowly around the Empire State until you press a key or tap. A saved game offers CONTINUE or NEW GAME.
- **An 81-second opening cutscene**, then phone calls, cut scenes and a fully voiced cast: Dan, Jane, Mr. Big, the Suits (Knox, Dash, Brick), Mack, Gears, Fiona, Ms. Bea and the Camp.
- **Jane on the car phone.** She rides along whenever Dan is at the wheel, and only then: the story first, the extras on a long drive, a whisper on a tail, fast and clipped in a chase. Get out and the call holds; a cutscene hangs it up.
- **Street fighting.** Fists, kicks, bats, bottles and trash cans; counters, dodges and takedowns. No guns.
- **Dan's car.** A supercar with a V8 or an all-electric mode (Q), cold-gas thrusters for hops and sideways dashes, and a boost.
- **A living Manhattan.** Traffic, crowds, crashes, police calls, chases you can lose, and a car radio with four stations.
- **Controller support** for Xbox, PlayStation and other standard pads, plus keyboard and mouse.

## Controls

| | Keyboard and mouse | Controller (Xbox) |
|---|---|---|
| Move · look | WASD · mouse | Left stick · right stick |
| Sprint · jump | Shift · Space | LT (hold) or L3 · A |
| Get in / out of the car | F | Y |
| Drive · brake / reverse · steer | W · S · A / D | RT · LT · left stick |
| Boost · hop · dash left / right | Shift · Space · Z / C | X · A · LB / RB |
| Electric / engine | Q | D-pad up |
| Reset car to road | X | B |
| Strike · heavy · counter · dodge · grab | J or left click · K or right click · Q or L · C · E | X · Y · LB · B · RB |
| Radio: next station · off / on | R · T | D-pad right · D-pad down |
| Map · brief · pause | M · B · Esc | View · R3 · Start |
| Skip a cutscene | Hold Space | Hold A |

The pause menu has every control, mission select, checkpoints, sound settings and the credits.

## Credits and licences

The code is under the MIT License (see [LICENSE](LICENSE)), the same licence as Slop New York, which this game is built on.

Some parts are not ours and keep their own terms:

- The street-combat system, the Suits' rig and the freeflow fight moves are ported from **Spiderbench** by Shikhar and used with the author's permission. They are not covered by the MIT License.
- Some motion capture (`assets/anim/bandai`: the Suits' walks and idles, the rally crowd, Dan's fight footwork) is from the **Bandai Namco Research Motion Dataset**, © 2022 Bandai Namco Research Inc., under CC BY-NC 4.0: non-commercial use only and not covered by the MIT License (see [NOTICE](NOTICE)).
- The rest of the music, the engine recordings, the 3D characters' source assets, the motion capture and the props come from their own authors under CC0, CC BY and similar licences.
- Every voice (Dan, Jane, Mr. Big, the Suits, Mack, Gears, Fiona, Ms. Bea and the Camp) is synthesised with open text-to-speech models under Apache-2.0. The voices are invented, nobody's real voice; [NOTICE](NOTICE) names the models.

[NOTICE](NOTICE) and [assets/CREDITS.md](assets/CREDITS.md) list every one of them, and the game shows them on its Credits page.

Geographic data: NYC Open Data and © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL).

## For contributors

Start with [CONTRIBUTING.md](CONTRIBUTING.md): how to run it, the URL switches, the house rules, licences and how pull requests are reviewed. What could come next is in [ROADMAP.md](ROADMAP.md). Mog City shares GameMog/GameMog's [issues](https://github.com/GameMog/GameMog/issues) and [Discussions](https://github.com/GameMog/GameMog/discussions) with GameMog, so start a title with "Mog City:": bugs go to the issues, ideas and questions to Discussions. Pull requests go against the `mogcity` branch.

- `index.html` loads the title screen, the city (`js/`, from Slop New York) and the game (`wagmi/`: missions, the car-phone calls, combat, the car, audio, radio, characters, the visit counts).
- `docs/STORY.md` is the story and the cast (their looks and voices); `docs/MISSIONS.md` is the same story plus how a mission is built; `docs/VOICE-LINES.md` is the line sheet and how voices are made.
- `tests/` holds the city's tests (`node --test tests/*.test.*`).
- Every character, company and event in Mog City is fictional (JPBank, Blimpco and OCCUPY JPBANK included); the streets and parks are Manhattan's own. Nobody in the game is based on a real person.
