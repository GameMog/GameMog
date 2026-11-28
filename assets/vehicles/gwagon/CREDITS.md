# Kastell: the body

`gwagon.glb` is Mog City's own model, made from nothing by `tools/vehicles/gwagon/build.py` (Blender 5.3, headless) and
packed by `tools/vehicles/gwagon/pack.mjs` (welded, deduplicated, quantized, meshopt-compressed; any texture would be
resized and re-encoded, after manhattan-free-roam's `tools/build-models.mjs`, MIT, credited in the repository's NOTICE).
No downloaded model, scan or texture is in it.

What it is, part by part (every object named `<part>_<material>`; the game finishes each by its material's name in
`wagmi/storyrun/gwagon.js`):

- the body as separate solid panels (fenders, hood, front doors, rear doors, rear quarters, tailgate, roof), every edge
  rounded (3 cm on the fenders' and quarters' corners, 1.2 cm on the doors), the arches and the lamps' pockets cut out
  of them, a 6.5 mm shut line round each and a dark backing under the lines; the paint's UVs a box projection in metres
  for the flake map the game draws; flared arches swept round the wheels; a belt ledge where the
  greenhouse steps in, drip rails along the roof, a side strip with a chrome inlay;
- exposed hinges on every door and on the tailgate, chrome pull handles with push buttons, door-mounted mirrors with
  indicator strips;
- round headlamps (a chrome bezel, the reflector bowl, a projector, an LED ring, a domed lens), indicators on the fenders'
  corners and repeaters on their sides, a three-louvre grille in a chrome surround; a soft-cornered bumper with a diamond-mesh intake set 4 cm deep in a proud chrome frame, round fog
  lamps in chrome bezels, red tow hooks, parking sensors and a brushed skid plate;
- tall tail lamps in sections (tail, brake, indicator, reversing) under a red lens, a third brake light on the roof;
- a side-hinged tailgate with a covered spare (a plain cover, a chrome ring), side steps with rubber treads, side pipes,
  the frame rails and solid axles underneath;
- 20 inch twin-spoke wheels (a polished lip, six nuts, a plain cap) on 275/50 tyres (three grooves, shoulder blocks, a
  ribbed sidewall band, raised sidewall marks in two arcs: plain blocks, no words), brake discs and red calipers;
- a cabin: quilted seats with a contrast stitch along every tuck, a padded dash with a brushed band, four round vents, a wide screen, a grab handle, a console,
  door cards, carpet and a headliner; the steering wheel a plain pad.

About 87.6k triangles in 98 meshes (0.7 MB); 4.85 m long over the spare, 1.96 m tall, its glass a third of its side (the belt at 1.30 m, the long flat hood just under it at 1.255), two doors and a short quarter window a side behind black pillars. The car is a look-alike: it bears no maker's name, crest, badge or model
lettering, and nothing in Mog City claims any connection with any car maker.

Before 27 Nov 2026 the Kastell wore a downloaded low-poly body (DemuriaGT on Sketchfab, CC BY 4.0, 13.8k triangles);
it was replaced whole, and nothing of it is in this file.
