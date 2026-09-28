# Ocean Drive (MIT) in the GameMog runtime

`src/` is StarKnightt/ocean-drive (MIT, Copyright (c) 2026 Prasenjit (StarKnightt); `LICENSE`
beside this file), snapshot of commit 03d1ed66b1117be1ef8d7c19a33ff56ab3762c25. It is bundled by
`scripts/runtime/build-maps.mjs` into `lib/runtime/maps/ocean-drive.js`, which a world gets with
`open: { map: 'ocean-drive' }`. `entry.js` (ours) builds the district into a world's scene, and
`edges.js` (ours) closes it: block walls at the ends of the alleys, roadblocks 20 m down the cross
streets, construction fencing across both ends of the district, swim-area buoys in the sea, the
colliders for all of it and the hiding places for an open world's weapons. The passing traffic
(in `entry.js`) stops at the roadblocks and goes round again only out of sight.

Changes to the original, so it runs on the runtime's three.js (r157):

- `world/palms.js`: `THREE.BatchedMesh` (r159+) is replaced by one `InstancedMesh` per geometry
  variant; the frond shader reads `instanceMatrix` and `gl_InstanceID` for `batchingMatrix` and
  `gl_DrawID`; LOD swaps are applied with `flush()`.
- `sky.js`: the contact-hardening shadow patch also targets r157's PCF block, each tap a
  `texture2DCompare` where r186 samples a comparison sampler.
- `world/car.js`: `makeSedan` and `MODERN` are exported, for the runtime's police cars.
- `world/ocean.js`: the shallow water is lit with the clear-water optics of SamG-Coder/clearwater
  (MIT, Copyright (c) 2026 Lumaris): its extinction coefficients (0.428, 0.126, 0.156 per metre),
  the refracted view path, the sand lit by the refracted sun and the sky, and the light scattered
  in the water. Its constants are used, none of its code. The caustics are ours: the sand
  brightens by the depth times the surface's curvature, a little deeper for blue than for red.
  The shallows are now opaque a few centimetres in, as they draw the sand themselves.
- `lib/runtime/maps/three-shim.cjs` (ours) gives the code the page's three.js, with `Timer`,
  `renderer.compileAsync` and the later tone-mapping and bind-mode names r157 lacks.

Not used: `main.js`, the first-person walker, the rideable bike and ATV, the people, the page's
own renderer and post-processing. The runtime brings its own.
