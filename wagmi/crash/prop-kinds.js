// Mog City: the street furniture's kinds (wagmi/crash/props.js), apart so what a hit costs the car
// (wagmi/crash/damage-cost.js) and its tests can weigh them without the renderer. Per kind: fall (snaps and falls over)
// or fly; mass (to the car's 2: what knocking it costs the car's speed, and its health); snap (m/s: slower than that it
// stands, solid)
export const KINDS = {
  mast: { mode: 'fall', mass: 0.5, snap: 7 },
  cobra: { mode: 'fall', mass: 0.35, snap: 6 },
  post: { mode: 'fall', mass: 0.15, snap: 4 },
  hydrant: { mode: 'fly', mass: 0.3, snap: 4, water: true },
  mailbox: { mode: 'fly', mass: 0.2, snap: 1.5 },
  basket: { mode: 'fly', mass: 0.03, snap: 0.4 },
  paperbox: { mode: 'fly', mass: 0.08, snap: 0.8 },
  barricade: { mode: 'fly', mass: 0.04, snap: 0.4 },
  stack: { mode: 'fly', mass: 0.1, snap: 1 },
  cart: { mode: 'fly', mass: 0.35, snap: 1.5 },
  bench: { mode: 'fly', mass: 0.1, snap: 1.2 },
  lamp: { mode: 'fall', mass: 0.3, snap: 5 },
};
