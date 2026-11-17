// The tow rig on a bed (wagmi/storyrun/vehicles/build-vehicle.js): the wrecker's tower, boom, hook, chains, toolboxes,
// work lamps and roof light bar are drawn only on a wrecker; a pickup (a ranch's feed truck) with the tow ability
// keeps a plain bed and tows on its wheel-lift alone, stowed under the tail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const BUILD = readFileSync(new URL('../wagmi/storyrun/vehicles/build-vehicle.js', import.meta.url), 'utf8');

test('a pickup with tow keeps a plain bed; only a wrecker wears the tower, boom and light bar', () => {
  const at = (s) => { const i = BUILD.indexOf(s); assert.ok(i > 0, s); return i; };
  const rig = at("const towRig = sheet.abilities.includes('tow') && isBed;");
  const gate = at("if (sheet.class === 'wrecker') {");
  const head = at('// the headboard (a guard behind the cab\'s back glass) and the tower');
  const boom = at('// the boom: from its pin on the tower');
  const bar = at('beacons = { on: false, t: 0 };');
  const lift = at("towLift = new THREE.Group(); towLift.name = 'wheel-lift';");
  assert.ok(rig < gate && gate < head && head < boom && boom < bar && bar < lift);
  // (the gate closes before the wheel-lift: a pickup still has the lift the tow step works)
  const inner = BUILD.slice(gate, lift);
  let depth = 0;
  for (const ch of inner) { if (ch === '{') depth++; else if (ch === '}') depth--; }
  assert.equal(depth, 0, 'the wrecker block is closed before the wheel-lift');
  // (no beacons on a pickup: the light bar's flashing and setBeacon both check for them)
  assert.match(BUILD, /if \(beacons\) \{/);
  // (a pickup's lift hidden while stowed, shown once it is out for a tow)
  assert.match(BUILD, /towLift\.visible = liftArm\.visible = sheet\.class === 'wrecker' \|\| TOW\.out > 0;/);
  assert.match(BUILD, /setBeacon\(on\) \{ if \(beacons\) beacons\.on = !!on; \}/);
});
