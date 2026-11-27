// Mog City: the speed on the HUD. One conversion everywhere: a car's real m/s to mph (MPH), the same the story runner's
// speed limits are read in (storyrun/rules.js MPH, the limit meter beside the speedo: '48 / 45 MPH').
// Dan's roadster in Mog City's own game keeps its own dial (js/main.js carDial: the owner, 24 Oct, "it peaks at 176",
// twice its real mph up to its cruise). Under ?pack= every car reads its real mph: the Tensore, a world's model car,
// was built on the roadster and kept that dial, so in Jensen Heist's DL-4 the speedo read 101 MPH at 22 m/s (49 mph)
// beside a 'drive under 45' limit meter reading 48 (the RC playtest, 20 Nov). Mog City's own story as a world
// (packs/mog-city.json, isOwn) is Mog City's own game: its roadster keeps the dial.
//   dialFor({ stock, pack, own }) -> 'dan' | null     stock: the hero's body is the roadster built for him (not a
//                                                     sheet's, a horse's, a model car's); pack: a story world is loaded
export const MPH = 2.23694;
export const mphOf = (ms) => Math.abs(+ms || 0) * MPH;
export function dialFor({ stock = false, pack = false, own = false } = {}) {
  return stock && (!pack || own) ? 'dan' : null;
}
