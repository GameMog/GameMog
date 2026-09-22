import type { WorldSpec } from '../worldspec';

/**
 * Muse Sprint — the reference world, and the proof that the abstraction holds.
 *
 * Every value here was lifted from the original hand-built musesprint.html. If
 * the engine ever stops reproducing that game from this data, the abstraction
 * has sprung a leak and we want to know immediately.
 */
export const MUSE_SPRINT: WorldSpec = {
  schemaVersion: 1,
  format: 'race',
  difficulty: 'standard',

  meta: {
    title: 'Muse Sprint',
    tagline: 'Six fuzzlings. One mossy loop through the Hollow.',
    blurb:
      'A rhythm footrace through a pastel mushroom meadow. Tap in time to stride; ' +
      'every lap the timing band slides left and narrows while the pack speeds up.',
  },

  track: {
    points: [
      [0, 0.0, -92], [58, 2.4, -80], [96, 6.0, -42], [90, 9.0, 4],
      [55, 6.4, 27], [31, 3.0, 57], [54, 1.0, 93], [11, 0.0, 110],
      [-39, 2.0, 93], [-31, 6.2, 47], [-64, 8.4, 18], [-98, 5.0, -29],
      [-67, 1.2, -78],
    ],
    scale: 0.8,
    roadHalf: 5.9,
    lanes: [-4.35, -2.61, -0.87, 0.87, 2.61, 4.35],
  },

  racers: [
    { name: 'Muse', fur: '#F0DEBD', you: true, lane: 2 },
    { name: 'Pip', fur: '#B6DEC4', you: false, lane: 0 },
    { name: 'Bibo', fur: '#F2C2CB', you: false, lane: 4 },
    { name: 'Tova', fur: '#C0C8EE', you: false, lane: 1 },
    { name: 'Nim', fur: '#F3DC9B', you: false, lane: 5 },
    { name: 'Wuff', fur: '#CFC0E4', you: false, lane: 3 },
  ],

  palette: {
    light: '#FFF0D2',
    skyLow: '#F9E6CE',
    skyMid: '#EEE0D0',
    skyHigh: '#A4BFE5',
    skyAmbient: '#BAD2EC',
    groundAmbient: '#7E8C5E',
    fog: '#E7D4B9',
    fogDensity: 0.0027,
    sunDir: [0.44, 0.4, 0.44],
    terrain: { moss: '#8CAE77', pale: '#B6C994', sand: '#CEB891', accent: '#C9AAA3' },
    moodRamp: [
      { accent: '#7FB268', fog: '#E7D4B9', light: '#FFF0D2', sky: '#FFFFFF', tint: 'rgba(60,44,28,.30)' },
      { accent: '#C9A25E', fog: '#E9C99C', light: '#FFE7BC', sky: '#FFF2E2', tint: 'rgba(96,56,24,.36)' },
      { accent: '#D0684A', fog: '#E3AC8A', light: '#FFD49C', sky: '#FFE4CC', tint: 'rgba(120,48,18,.44)' },
    ],
  },

  props: {
    caps: {
      count: 130,
      palettes: [
        ['#E9A08E', '#D87B6C', '#F6E3CE'],
        ['#C9DCA6', '#A6C486', '#F4EDD8'],
        ['#E7C48B', '#CE9E63', '#F8ECD6'],
        ['#C5B6E4', '#A694CC', '#F2E9DE'],
        ['#F0C7CF', '#D79FAB', '#FAEFE4'],
      ],
    },
    tufts: {
      count: 2600,
      palettes: [['#A9C78E', '#84A96B'], ['#C7D9A2', '#9FBC7C'], ['#DCCBA4', '#BFA87F']],
    },
    lanterns: { spacing: 22, post: '#9E8564', bulb: '#FFE9B8', glow: '#FFD98F' },
    gate: {
      post: '#E3C79A',
      banner: '#E9A08E',
      pennants: ['#F6E3CE', '#C9DCA6', '#F0C7CF', '#C5B6E4'],
    },
    islets: { count: 7, caps: ['#E9A08E', '#C9DCA6', '#C5B6E4'] },
    spores: { count: 1700, hue: 0.1, hueSpread: 0.1, sat: 0.55 },
  },

  copy: {
    placeTitles: [
      'THE HOLLOW IS YOURS',
      'SO CLOSE',
      'ON THE PODIUM',
      'GOOD RUN',
      'KEEP STRIDING',
      'THE MEADOW IS PATIENT',
    ],
    placeLines: [
      'Muse crosses first — and held the band all the way into PRESTO.',
      'Second by a whisker. The last lap is where it slipped away.',
      'Third, and the spores still swirl in your wake.',
      'Fourth. Every lap the band slides left. Move with it before it moves without you.',
      'Fifth. Watch the needle, not the pack — the band is the whole race.',
      'Last, but the moss is soft. Get the first lap clean and the rest follows.',
    ],
  },
};
