// emit: the fleet's manifest (assets/vehicles/fleet/fleet.json: every file's sha256 and size, every model's source,
// creator, licence and the source download's sha256) and the engine's numbers (cities/sf/js/fleet-data.js)
// node emit.mjs <staged fleet dir> <SOURCES.json> <repo>
import { readFileSync, writeFileSync, readdirSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from './lib.mjs';

const [STAGE, SOURCES, REPO] = process.argv.slice(2);
const sources = JSON.parse(readFileSync(SOURCES, 'utf8'));
const metas = { ...JSON.parse(readFileSync(join(STAGE, 'dz-meta.json'), 'utf8')), ...(existsSync(join(STAGE, 'c1280-meta.json')) ? JSON.parse(readFileSync(join(STAGE, 'c1280-meta.json'), 'utf8')) : {}) };
// the roles: the procedural body each stands in for (the engine's fallback while it loads, and its numbers' kind), its
// class for the drive (wagmi/storyrun/vehicles classes), what the game calls it, and its group in the town's mix.
// Generic words only: no maker's or model's name anywhere a player sees.
const ROLES = {
  gt95: { proc: 'coupe', cls: 'supercar', noun: 'sports car', label: 'Sports Car', group: 'sports', title: "Saba V12 '95 - Low poly model" },
  turbo81: { proc: 'coupe', cls: 'sports', noun: 'sports car', label: 'Sports Car', group: 'sports', title: "Hazer Turbo '81 - Low poly model" },
  sport99: { proc: 'coupe', cls: 'coupe', noun: 'sports coupe', label: 'Sports Coupe', group: 'sports', title: "JDM Sport '99 - Low Poly model" },
  gt83: { proc: 'coupe', cls: 'coupe', noun: 'coupe', label: 'GT Coupe', group: 'sports', title: "Tiara GT '83 - Low Poly model" },
  roadster00: { proc: 'convertible', cls: 'sports', noun: 'roadster', label: 'Roadster', group: 'sports', title: "Roadster '00 - Low poly model" },
  muscle69: { proc: 'muscle', cls: 'muscle', noun: 'muscle car', label: 'Muscle Car', group: 'sports', title: "Duke '69 - Low Poly Model" },
  sedan10: { proc: 'sedan', cls: 'sedan', noun: 'sedan', label: 'Sedan', group: 'everyday', title: "Kiri '10 - Low poly model" },
  hatch11: { proc: 'hatch', cls: 'compact-hatch', noun: 'hatchback', label: 'Hatchback', group: 'everyday', title: "Ace '11 - Low Poly model" },
  city07: { proc: 'hatch', cls: 'compact-hatch', noun: 'city car', label: 'City Car', group: 'everyday', title: "Compact '07 - Low poly model" },
  sedan80: { proc: 'oldsedan', cls: 'sedan', noun: 'old sedan', label: 'Old Sedan', group: 'everyday', title: "Negotiator '80 - Low poly model" },
  suv10: { proc: 'suv', cls: 'suv', noun: 'SUV', label: 'SUV', group: 'everyday', title: "Urban '10 - Low poly model" },
  van92: { proc: 'van', cls: 'van', noun: 'van', label: 'Van', group: 'everyday', title: "Shvan '92 - Low poly model" },
  pickup89: { proc: 'pickup', cls: 'pickup', noun: 'pickup', label: 'Pickup', group: 'everyday', title: "Conquer '89 Pickup - Low poly model" },
  taxi75: { proc: 'taxi', cls: 'taxi', noun: 'cab', label: 'Cab', group: 'taxi', title: "Canyon '75 Taxi - Low poly model" },
  police90: { proc: 'sedan', cls: 'cruiser', noun: 'police car', label: 'Police Car', group: 'police', title: "Illinois '90 Police cruiser - Low poly model" },
  box95: { proc: 'van', cls: 'van', noun: 'box truck', label: 'Box Truck', group: 'service', title: "LCT 3000 '95 - Low poly model" },
  // (Comrade1280's packs: one vehicle each of the pack, its node named in the manifest)
  bus: { proc: 'bus', cls: 'van', noun: 'bus', label: 'City Bus', group: 'bus', title: 'Generic civil service vehicles pack' },
  schoolbus: { proc: 'bus', cls: 'van', noun: 'school bus', label: 'School Bus', group: 'bus', title: 'Generic civil service vehicles pack' },
  ambulance: { proc: 'van', cls: 'van', noun: 'ambulance', label: 'Ambulance', group: 'service', title: 'Generic civil service vehicles pack' },
  firetruck: { proc: 'van', cls: 'van', noun: 'fire truck', label: 'Fire Truck', group: 'service', title: 'Generic civil service vehicles pack' },
  garbage: { proc: 'van', cls: 'van', noun: 'garbage truck', label: 'Garbage Truck', group: 'service', title: 'Generic civil service vehicles pack' },
  mailvan: { proc: 'van', cls: 'van', noun: 'mail van', label: 'Mail Van', group: 'service', title: 'Generic civil service vehicles pack' },
  utility: { proc: 'pickup', cls: 'pickup', noun: 'utility truck', label: 'Utility Truck', group: 'service', title: 'Generic civil service vehicles pack' },
  tow: { proc: 'pickup', cls: 'wrecker', noun: 'tow truck', label: 'Tow Truck', group: 'service', title: 'Generic civil service vehicles pack' },
  police20: { proc: 'sedan', cls: 'cruiser', noun: 'police car', label: 'Police Car', group: 'police', title: 'Generic civil service vehicles pack' },
  taxi20: { proc: 'taxi', cls: 'taxi', noun: 'cab', label: 'Cab', group: 'taxi', title: 'Generic civil service vehicles pack' },
  minivan20: { proc: 'minivan', cls: 'minivan', noun: 'minivan', label: 'Minivan', group: 'everyday', title: 'Generic passenger car pack' },
  pickup20: { proc: 'pickup', cls: 'pickup', noun: 'pickup', label: 'Pickup', group: 'everyday', title: 'Generic passenger car pack' },
  suv20: { proc: 'suv', cls: 'suv', noun: 'SUV', label: 'SUV', group: 'everyday', title: 'Generic passenger car pack' },
  offroad20: { proc: 'suv', cls: 'suv', noun: 'four by four', label: 'Four by Four', group: 'everyday', title: 'Generic passenger car pack' },
};
const byFile = Object.fromEntries(sources.map((s) => [s.file, s]));
// (shipped: the models, the shared atlas at both sizes, and the liveries' and service vehicles' own textures at 512 only:
// the engine draws those at the traffic's size, so their 1024 builds stay in the staging folder)
const OWN = new Set(Object.entries(metas).filter(([, m]) => m.own).map(([id]) => id));
const shipped = (f) => /\.glb$/.test(f) || /^kit(-orm)?(-lo)?\.webp$/.test(f) || /-lo\.webp$/.test(f) && (/^livery-|^c1280-optics/.test(f) || OWN.has(f.replace(/(-wheel)?(-orm|-decal)?-lo\.webp$/, '')));
const files = readdirSync(STAGE).filter((f) => /\.(glb|webp)$/.test(f) && shipped(f)).sort();
const out = join(REPO, 'assets/vehicles/fleet');
mkdirSync(out, { recursive: true });
const fileList = {};
for (const f of files) { const b = readFileSync(join(STAGE, f)); fileList[f] = { sha256: sha256(b), bytes: b.length }; copyFileSync(join(STAGE, f), join(out, f)); }
const models = {}, runtime = {};
for (const [id, m] of Object.entries(metas)) {
  const role = m.role || ROLES[id]; if (!role) throw new Error('no role for ' + id);
  const src = byFile[m.source.file];
  models[id] = {
    file: id + '.glb', title: m.title || role.title, creator: src.creator, licence: src.licence, licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source: src.source, sourceUid: src.uid, downloaded: src.downloaded, sourceFile: m.source.file, sourceSha256: m.source.sha256, sourceBytes: m.source.bytes,
    part: m.part || null, sha256: m.sha256, bytes: m.bytes, tris: m.tris,
    changes: m.changes || (m.own ? 'split from the pack; wheels split from the body by geometry; re-oriented and re-centred to the engine frame; textures downscaled (normal maps dropped) and WebP-encoded; lamps tagged; two simplified LODs added; geometry meshopt-compressed' + (m.paintable ? '; the body paint marked in the base texture\'s alpha and redrawn in its own colour, its baked shading lifted at the dark end, so it can be repainted' : '') : null) || 'badges and their atlas removed; number-plate characters removed (blank plates); tyre sidewall lettering removed; re-oriented and re-centred to the engine frame; parts merged onto a shared texture atlas; two simplified LODs added; textures downscaled and WebP-encoded; geometry meshopt-compressed',
  };
  runtime[id] = { file: id + '.glb', sha: m.sha256.slice(0, 10), ...Object.fromEntries(['length', 'width', 'height', 'zF', 'zR', 'hw', 'axle', 'wheels', 'head', 'tail', 'steer', 'livery', 'open', 'paint', 'own', 'decal', 'wheelTex', 'paintable'].map((k) => [k, m[k]])),
    proc: role.proc, cls: role.cls, noun: role.noun, label: role.label, group: role.group };
}
const kit = { hi: 'kit.webp', lo: 'kit-lo.webp', orm: 'kit-orm.webp', ormLo: 'kit-orm-lo.webp', livery: { taxi: [null, 'livery-taxi-lo.webp'], police: [null, 'livery-police-lo.webp'] }, optics: [null, 'c1280-optics-lo.webp'] };
const v = sha256(JSON.stringify(fileList)).slice(0, 10);
const manifest = {
  format: 'mogcity-fleet/1', what: 'Mog City\'s realistic town cars (Hometown traffic, parked cars and the cars a player takes)',
  licence: 'CC-BY-4.0 (each model, see models[].licence); NOT covered by the MIT License in LICENSE', credits: 'assets/vehicles/fleet/CREDITS.md',
  built: 'tools/vehicles/build-fleet.mjs (from the raw downloads, never committed)', v, kit, files: fileList, models,
};
writeFileSync(join(out, 'fleet.json'), JSON.stringify(manifest, null, 1) + '\n');
const js = `(function () {
// js/fleet-data.js: GENERATED by tools/vehicles/build-fleet.mjs (do not edit): the town fleet's ready-made cars, their
// numbers in the engine's frame (metres; y up, the tyres on y = 0; nose +z; the left side +x; the origin midway between
// the axles). The models are CC BY 4.0 (assets/vehicles/fleet/CREDITS.md); fleet-models.js loads them.
window.NYC.FLEET_DATA = ${JSON.stringify({ v, base: 'assets/vehicles/fleet/', kit, models: runtime })};
})();
`;
writeFileSync(join(REPO, 'cities/sf/js/fleet-data.js'), js);
console.log('fleet', Object.keys(models).length, 'models,', files.length, 'files,', (Object.values(fileList).reduce((s, f) => s + f.bytes, 0) / 1e6).toFixed(2), 'MB; v', v);
