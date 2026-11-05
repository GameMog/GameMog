# Story Kit cities kept for later

Every story plays on Mog City's engine (mc.gamemog.com), which plays New York only, on its own map. GameMog serves no
city. This folder keeps a city module for a later Mog City city; nothing loads it, the site does not serve it, and no
runtime plays it.

| folder | what it is |
|---|---|
| `sf/` | San Francisco: a modified copy of slop-sanfrancisco (Kamil (@unable0_) and Mr.doob, MIT; its `LICENSE` and `NOTICE.md` kept as they came), its data (OpenStreetMap ODbL 1.0, DataSF PDDL / CC0, USGS public domain: `sf/docs/data-sources.md`) and `sf/city.js`, the city module it was given for the Story Kit (frame, places, camera points, ground, routes). Its runtime is classic scripts on `window.NYC`, on three.js at commit `bc7d0b3`. |

The gate's San Francisco place list and camera points (`../pack/cities.ts`) are checked against `sf/city.js` and
`sf/js/city-config.js` by `npm run check`, so the list stays true for the day Mog City takes the city. Before then,
Mog City must check that the fork keeps the controller and traffic API its `wagmi/` layer reads (its DESIGN, section 9).
