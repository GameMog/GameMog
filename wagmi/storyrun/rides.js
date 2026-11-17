// Mog City story runner: the two rides of a world with a horse alongside its car (wagmi/game.js W.rides), the words and
// the rule the runner reads (a plain module: runner.js imports it, node --test tests/storyrun-horse.test.mjs tests it).
//   rideWanted(step)   'horse' | 'car' | null: the ride a step is played in (a mount or a ride the horse; a drive, its
//                      stops, a tail, a chase, a tow, a convoy or a passenger the car; anything else either)
//   yours(label)       a ride's name to start a line with, its name in blue: ['Your ', { truck }], [{ 'The Ranch Truck' }],
//                      [{ Dusty }] (a horse's own name), as the runner's parts() lines are written
export const HORSE_WANT = new Set(['mount', 'ride']);
export const CAR_WANT = new Set(['drive', 'stops', 'tail', 'pursuit', 'tow', 'convoy', 'passenger']);
export const rideWanted = (d) => (HORSE_WANT.has(d?.type) ? 'horse' : CAR_WANT.has(d?.type) ? 'car' : null);
export function yours(label) {
  const s = String(label || '').trim() || 'ride';
  if (/^(the|your|my|his|her|their|our)\s/i.test(s)) return [{ [s.replace(/^\w/, (c) => c.toUpperCase())]: 'blue' }];
  if (/^[A-Z]/.test(s) && !/\s/.test(s)) return [{ [s]: 'blue' }];
  return ['Your ', { [s]: 'blue' }];
}
