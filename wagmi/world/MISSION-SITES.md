# Mission sites

A mission that names its places by coordinates, or by a city's own place keys (`"@heraldsq"`), plays in that one city.
A mission that names them by **what they are** ("a gas station 250 to 800 m from here", "a park with open ground")
plays in any city the engine can load: San Francisco, New York, and the towns Milestone 2's compiler makes.

There are two layers:

- `world.findMissionSites(req)` (wagmi/world/common.js): real places of a kind on the loaded map, found from the city's
  own data, filtered by the request's constraints, in a seeded or nearest-first order.
- `{ site: { ... } }` place refs in a story pack (wagmi/storyrun/places.js): the runner asks the world for one site per
  ref, once, at the mission's start, and keeps it for the run.

Coordinates and `@place` refs work exactly as before. Nothing in an existing pack changes how it plays.

## `world.findMissionSites(req)`

```js
world.findMissionSites({ kind: 'gas_station', near: { x, z }, min: 250, max: 800, seed: 'w|M1|gas', count: 1 })
// -> [{ key, kind, name, x, z, heading, cx, cz, road, reach, d, fallback?, ... }]
```

Without `kind` the call is the v0 one, unchanged: `{ near, min, max, count, foot }` gives the place library's keys,
nearest first (`[{ key, x, z, heading, name, d }]`).

### What a site is

| field | meaning |
| --- | --- |
| `key` | a stable id for the site in this city (`junction:1015`, `park:477`, `store:Del Popolo`). The seeded order sorts by it first. |
| `kind` | the kind asked for |
| `name` | a name a player can read: the park's or the landmark's own name, or one made from the streets (`the gas station at Powell St & California St`) |
| `x, z, heading` | where a car stops for it: on a drivable lane, facing along the lane |
| `cx, cz` | the place itself, where a man on foot goes: the sidewalk at a building's front, a few metres into a park, out on a pier, the junction's centre |
| `front` | (a building, a landmark, a kerb) how its front was found: `'sidewalk'` (a raised curb, a park's ground, or the city's own sidewalk data: San Francisco's ground mask), `'face'` (no sidewalk in the data: the open ground just short of its wall, by the building's real outline) or `false` (neither: `cx, cz` is where the city's data puts the place, and every test is of that point) |
| `road` | the class of the lane at `x, z`: `'avenue'` (a main road of the city's road graph) or `'street'` |
| `reach` | metres from the car's stop to the place itself (`cx, cz`): with no front found, the whole way to the place |
| `d` | metres from `near` to the place itself (0 with no `near`) |
| `fallback` | set when the city has no data for the kind and a stand-in was found instead (below) |

Some kinds add their own: `straight_road` has `length`, `ex, ez` (the far end) and `edges`; `junction` has `signal`
and `arms`; `bridge` has `deck` (metres the deck stands over the street); `park` and `plaza` have `area`; `waterfront`
has `pier`.

### Kinds

| kind | found from | stand-in when the city has none |
| --- | --- | --- |
| `gas_station` | the city's points of interest (`city.pois('gas_station')`), landmarks tagged `fuel` | `corner`: the kerb side of a lane just before a junction that has a main road in it |
| `store` | `city.pois('store')`, named landmarks tagged retail / commercial / supermarket / convenience / mall / department_store / shop / kiosk | `shopfront`: the sidewalk halfway along a street of a busy district (any street where the city marks none busy) |
| `park` | the curb islands (`world.blocks`) marked park, 400 m2 or more, not a median | none |
| `plaza` | park blocks named plaza / square / piazza / green / commons / mall, and the city's own plazas (`GEO.plazas`) | none |
| `bridge` | a raised highway deck 5 m or more over the ground, every 80 m of it, at the drivable street under it (`under the overpass on 7th St`; 30 m or more: `under the bridge on ...`) | none |
| `parking` | landmarks tagged parking, named ones with garage / parking in the name | `kerb`: kerbside parking halfway along a street (not a main road) 50 m or more long |
| `landmark` | the city's landmarks (`NYC_LANDMARKS`): the sidewalk at its front | none |
| `straight_road` | the road graph's edges joined end to end while they keep within 5.7 degrees of straight, not in a tunnel; `length` the whole run | none |
| `junction` | road graph nodes with 3 or more neighbours; the car stops 15 m before it on its longest approach | none |
| `dead_end` | road graph nodes with one neighbour, on a street (not a main road), more than 150 m in from the edge of the map's data | none |
| `waterfront` | the city's piers (`WATERFRONT_PIERS`): out on the pier from its landward end | none |

A stand-in is used only when no real place of that kind passes the request. `fallback: false` refuses stand-ins (the
call then gives `[]`). A kind the city has nothing for gives `[]`, never an error.

A compiled town's adapter can hand the world its own points of interest by kind: `city.pois(kind) -> [{ id, name, x,
z }]` (any kind of the list). They come first, as real places. A Hometown package's does (`wagmi/world/pkg.js`): its compiled places
by their Overture category, `gas_station` (gas_station, fuel), `store` (grocery, supermarket, convenience store,
pharmacy, hardware store) and `parking`; its ground mask gives `city.sidewalkAt` as San Francisco's does.

### Constraints

| word | meaning | default |
| --- | --- | --- |
| `near` | `{ x, z }` or `[x, z]`: the point distances are measured from (straight line, to the place itself) | none: anywhere |
| `min`, `max` | metres from `near` | none |
| `road` | `'avenue'`, `'street'` or `'any'`: the class of the lane the car stops on | any |
| `access` | `'car'`: the place within `reach` m of its lane; `'foot'`: the place itself on dry ground, not inside a collider | `'car'` |
| `reach` | how far the place itself may be from where the car stops | 80 m (park, plaza, landmark 150; waterfront 250) |
| `open` | metres of open ground round the place: no collider within that radius at a person's height, not water | none |
| `roadView` | `true`: a clear line at a person's height from the place to its lane (it can be seen from the road) | none |
| `minLen`, `maxLen` | for `straight_road` (and anything with a `length`): metres of straight | `minLen` 150 for `straight_road` |
| `signal` | for `junction`: `true` only signalled ones, `false` only unsignalled | either |
| `avoid` | `[{ x, z, r }]` or `[[x, z]]` (r 40): keep that far from these points | none |
| `count` | how many to give | all |
| `seed` | any string or number: the order is the seed's (below) | none: nearest first |
| `fallback` | `false`: no stand-ins | `true` |

### Determinism

The answer depends only on the city's loaded data and the request. Candidates are sorted by `key` before a seeded
shuffle (FNV-1a hash of the seed into a mulberry32 generator, Fisher-Yates), so the order the city's data came in
never matters, and the same seed gives the same order in every browser and in node. Without a seed the order is
nearest first, ties by key. The cheap tests (distance, class, length) run on every candidate; the costly ones (open
ground, sightline, foot access) run in the final order until `count` are found, so they never change which site wins,
only how quickly it is found. `node --test tests/mission-sites.test.mjs` checks this on a made-up town, including
the town's data in reverse order.

## `{ site }` in a story pack

Anywhere a step takes a place (`to`, `at`, `arena`, `from`, a mission's `start`, a creature's `at`...), it can take

```json
{ "site": { "kind": "gas_station", "id": "gas", "near": "start", "min": 250, "max": 800 } }
```

or `{ "site": "gas" }`: the site an earlier ref of the same mission named with that `id`. A ref's siblings work as
on an `@place` ref: `mode` (`"walk"`), `heading`, `face`, and `name` (what the player is told it is called).

The site's own words are `findMissionSites`' constraints (`kind`, `min`, `max`, `road`, `access`, `open`, `roadView`,
`reach`, `minLen`, `maxLen`, `signal`, `fallback`) plus:

| word | meaning |
| --- | --- |
| `id` | a name for the site in its mission (`a-z0-9_-`, 32 at most): `{ "site": "<id>" }`, `"near": "<id>"`, `{site.<id>}` |
| `near` | `"@key"` (a place of the city's library or the pack's own `places`), `[x, z]`, `"start"` (the mission's start) or an earlier site's `id` |
| `apart` | metres from every site the mission picked before this one (default 40: two sites are never the same corner) |
| `name` | the name the player reads, in place of the site's own |
| `seed` | this site's own seed, in place of the world's |

With no `near`, a site is near the one before it in the mission, else the mission's start, else the city's first
arrival point, and within 900 m of it unless `max` says otherwise. When nothing passes, `max` is widened twice
(x2, x4) and then dropped, so a sparse town still gets a site; when even that finds nothing the step fails the way a
missing `@place` does ("The story names a place this city doesn't have (a gas station)").

`access: "foot"` puts the place itself (`cx, cz`) where the step goes (a walk, a search, the start of a mission played
on foot); otherwise the step goes to where the car stops (`x, z`), the place itself kept as `cx, cz` for an arena.

### When a site is picked

A mission's sites are all picked together, in the order the mission writes them (its `start` first, then its steps,
nested ones too), the first time any of them is needed: the runner calls `places.prepare(mission)` as the mission
starts, and the free-roam marker for a mission's start asks the same way. Each is then fixed for the page's life:
a retry, a checkpoint and the next visit to the same step see the same place.

Each site's seed is `<world.seed or world.id>|<mission id>|<site id or its place in that order>`, so:

- the same world in the same city picks the same sites every run, and a Mog of it (the same seed) the same as its
  parent;
- a world played in another city picks that city's own places for the same request;
- `world.seed` set anew deals a fresh set of places for the whole story.

A line or an objective names a site with `{site.<id>}` (`"Fill up at **{site.gas}**."`); the runner's own default
objectives (`Drive to **<name>**.`) already read the site's name.

The pack check (`wagmi/storyrun/pack.js` `siteErrors`) refuses a site with a word outside this vocabulary, a kind
outside the list, a number out of range, a `near` or `{ site: id }` that names no earlier site of the mission.

### Example

```json
{ "id": "SI-1", "title": "Fill Up", "vehicle": "roadster",
  "start": { "site": { "kind": "junction", "id": "home", "road": "avenue" } },
  "steps": [
    { "type": "drive", "to": { "site": { "kind": "gas_station", "id": "gas", "min": 250, "max": 800 } }, "objective": "Fill up at **{site.gas}**." },
    { "type": "drive", "to": { "site": { "kind": "store", "id": "shop", "near": "gas", "min": 150, "max": 700 } }, "objective": "Pick up milk at **{site.shop}**." }
  ] }
```

Played by the test drive (`.scratch/missions/pack`, not committed), the same mission picked: in San Francisco
Leavenworth St & Bush St, the gas station corner at Van Ness Ave & O'Farrell St, then a named shop a few blocks on; in
New York W 41st St & Broadway, the gas station corner at 8th Ave & W 34th St, then a shopfront on W 30th St. In a
compiled town, its own.
