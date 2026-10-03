# The city, from Spiderbench, as a GameMog runtime map

`src/` is the city half of Shikhar's [Spiderbench](https://github.com/xikhar/spiderbench) (commit
64d957f92f005a1c1870070079351e30b2395661): the procedural city generator and its street network (the
layout of avenues, streets and blocks, the buildings with their facades and the rooms behind their windows,
the rooftops, the ground, the street furniture and trees), the life on its streets (the traffic and its
vehicles, the pedestrians with their animation clips, the pigeons) and the parts of its rendering those need
(the night city's own lights). Thank you, Shikhar.

**Licence.** These files are not under GameMog's MIT licence. They are used with their author's written
permission, which is GameMog's alone and for non-commercial use; see `LICENSE` beside this file. One file in
`src/` is GameMog's own and says so in its header: `src/world/adstex.js`.

`entry.js` is GameMog's own: it builds one district of the city into a world's scene (in full) with a ring of
the city's plain far-off masses round it, its street furniture, street trees and night lights, lights it for
the time of day, and hands the open world the buildings, the rooftop clutter and the street furniture as
colliders, the ground's height, the bounds, the fill light and the exposure it wants. It runs the district's
traffic and crowd, and gives the open world their hooks: where the player is (`setPlayer`), its own people on
foot for the drivers to stop for (`yieldTo`), a body pushed out of the cars (`collide`) and danger (`alarm`).
`scripts/runtime/build-maps.mjs` bundles it with `src/` into `lib/runtime/maps/city.js`, which a world gets with
`open: { map: 'city' }`. The textures, the props model, the vehicles and the people are the asset library's
`city-midtown`, built by `scripts/assets/build.ts` from the originals at the same commit.

## What was taken, and what was not

Taken: the files the district needs: `src/world/` layout, buildings, facade, rooftops, ground, props, street
dressing, screen lights, trees, vehicles, peds and `npc/` (roads, junctions, traffic, crowd, pigeons) and the
modules they import; `src/render/` daynight, citylights, glassmirror, csm. Some of those import modules this
map does not build (the park, the shores, bridges); they come along so the imports resolve. Assets: the
vehicle models and their atlas, the people (`people.bin`, `people.json`, their cloth bake and face atlas).

Not taken: Times Square, Grand Central and the other landmarks, the billboard art and the storefront-sign
atlas (both carried art this map does not use), the neon, the hero, the enemies, crimes, combat, audio (the
cars' horns are silent) and the render pipeline; `npc/life.js` (its world glue) is replaced by `entry.js`'s
hooks. The asset library's shop-sign texture and `src/world/adstex.js`'s ad and sign atlases are GameMog's
own, with invented names.

## Changes

- No reference to Marvel, Sony or Insomniac or their characters remains: comments were reworded, and the
  billboard copy in `world/props.js` (which named in-universe companies and a real pizzeria) is invented
  copy now.
- `world/textures.js`: the textures are fetched from the asset library (`setTextureFiles`, `texUrl`) under the
  names its manifest gives, as blobs (a world's page may read `/assets/` only through `fetch`), not from
  `/assets/city/tex/`; `world/rooftops.js`, `world/roofplants.js`, `world/trees.js`, `world/treetrunk.js`
  and `world/props.js` (the props model) load theirs the same way.
- `world/ground.js`: `buildDistrictGround` (added) lays the asphalt and sidewalks of one rect's blocks only,
  with the same materials and geometry as `buildGround`, without the island's shore, piers, park or water.
- `world/props.js`: a `clip` rect keeps every placed prop (and so every lamp's light) inside the district;
  the promenade round the island and the avenues' steam stacks outside it are not built; the landmarks it
  read (Grand Central, Times Square) are empty stand-ins; lamps are at full power everywhere (the original
  halved them where its Times Square screens lit the street); a traffic signal is recorded only when placed.
  `world/streetdressing.js`: the same stand-in for Grand Central's viaduct.
- `world/adstex.js` is replaced by GameMog's own, which draws the ad and storefront-sign atlases at run time in
  the original's layouts (a world may give its own copy: `open.city.ads`, `open.city.signs`).
- `world/trees.js`: the leaves' skylight fades with the night factor (the original read its lighting
  pipeline's ambient block, not taken).
- three r157: `render/citylights.js` lights with r157's physical-material fields (`diffuseColor`,
  `specularColor`; no multi-scattering term on direct light); `world/facade.js`, `world/water.js` and
  `world/vehicles.js` sample the environment without `envMapRotation`; `lib/runtime/maps/three-shim.cjs`
  gives r157 the attributes' `addUpdateRange` / `clearUpdateRanges` (one range, their union).
- The vehicle atlas is repainted where it carried other people's marks: the three Marvel ads among the
  taxi-topper ads, the taxi commission's badge and the transit authority's route and fleet names
  (`scripts/assets/build.ts`). `world/vehicles.js` and `npc/crowd.js` load the vehicles and the people from the
  asset library, the geometry gzipped (unpacked with the browser's `DecompressionStream`), the images as blobs
  (`world/textures.js`: `fetchGunzip`, `loadTextureRetry`).
- The traffic and the crowd are kept to the district: `buildTraffic`'s `clip` streams only the links in it and
  those leading in and out of it (half as many cars on those; no parked cars beyond it); `createCrowd`'s and
  `createPigeons`' `clip` drop the promenade, park and riverside people and flocks; Times Square's and Grand
  Central's crowd spots are empty stand-ins. `createCrowd` takes a `density` (1 as made).
- `npc/traffic.js`: drivers stop for the world's own people on foot (`yieldTo`, as for the player).
- three r157: `world/vehicles.js` and `world/water.js` use `inverseTransformDirection` (r157's name), and the
  cars' baked AO scales r157's single clearcoat term; the shim's update ranges also cover interleaved buffers.
- Everything runs on the runtime's three.js (r157) through `lib/runtime/maps/three-shim.cjs`.
