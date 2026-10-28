// Mog City: the radio's stations and what they play (assets/music; credits in NOTICE, assets/CREDITS.md and, in game,
// wagmi/credits.js, which reads each track's credit from here).
// A track: file, title, artist, dur (s), lufs (its measured loudness: the radio evens them out), and for a short one
// loop { start, end } and plays (how many times its loop is heard: the opening once, then the loop again).
// Its credit: lic (a key of LICENCES), src (where it came from), by (the credit line its author asks for) and, for a
// remix, samples (the works it is built from, credited with it).
// The first track of the first station is the theme: the radio's first tune-in ever plays it from the top (radio.js).
export const LICENCES = {
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY 3.0': 'https://creativecommons.org/licenses/by/3.0/',
  'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  original: null, // made for this game (MIT, see LICENSE)
};
const MACLEOD = (title) => `"${title}" Kevin MacLeod (incompetech.com)`;
const INCOMPETECH = (title) => `https://incompetech.com/music/royalty-free/mp3-royaltyfree/${encodeURIComponent(title)}.mp3`;

export const STATIONS = [
  {
    id: 'wagmi', name: 'MOG FM', freq: '94.0', tag: 'Hip-hop · pop · the city\'s anthem', color: '#FFC93C',
    tracks: [
      { file: 'assets/music/pyro-flow.m4a', title: 'Pyro Flow', artist: 'Kevin MacLeod', dur: 231.97, lufs: -14.04, lic: 'CC BY 4.0', by: MACLEOD('Pyro Flow'), src: INCOMPETECH('Pyro Flow') },
      { file: 'assets/music/unfinished-business.m4a', title: 'Unfinished Business', artist: 'Mog City', dur: 142.98, lufs: -14.1, lic: 'original' },
      { file: 'assets/music/basic-implosion.m4a', title: 'Basic Implosion', artist: 'Kevin MacLeod', dur: 187.8, lufs: -14.05, lic: 'CC BY 4.0', by: MACLEOD('Basic Implosion'), src: INCOMPETECH('Basic Implosion') },
      { file: 'assets/music/fall-guy.m4a', title: 'Fall Guy', artist: 'Mog City', dur: 137.14, lufs: -14.03, lic: 'original' },
      { file: 'assets/music/fifth-ave-glide.m4a', title: 'Fifth Ave Glide', artist: 'Mog City', dur: 133.95, lufs: -14.03, lic: 'original' },
    ],
  },
  {
    id: 'block', name: 'BLOCK 99.1', freq: '99.1', tag: 'Hip-hop · trap · boom-bap', color: '#FF6B3D',
    tracks: [
      { file: 'assets/music/gangstazz.m4a', title: 'Gang$tazz', artist: 'Alexandr Zhelanov', dur: 101.332, lufs: -14.13, lic: 'CC BY 4.0',
        by: '"Gang$tazz" by Alexandr Zhelanov (https://soundcloud.com/alexandr-zhelanov)', src: 'https://opengameart.org/content/gangtazz' },
      { file: 'assets/music/mta.m4a', title: 'MTA', artist: 'Kevin MacLeod', dur: 174.43, lufs: -14.27, lic: 'CC BY 4.0', by: MACLEOD('MTA'), src: INCOMPETECH('MTA') },
      { file: 'assets/music/spheres.m4a', title: 'Spheres', artist: 'Robbero', dur: 268.59, lufs: -14.03, lic: 'CC BY 3.0',
        by: '"Spheres (Hip Hop Instrumental)" by Robbero', src: 'https://ccmixter.org/files/Robbero/43483',
        samples: [{ title: 'Spheres', artist: 'Doxent Zsigmond', src: 'https://ccmixter.org/files/doxent/43475' }] },
      { file: 'assets/music/lewis-and-dekalb.m4a', title: 'Lewis and Dekalb', artist: 'Kevin MacLeod', dur: 188.4, lufs: -13.99, lic: 'CC BY 4.0', by: MACLEOD('Lewis and Dekalb'), src: INCOMPETECH('Lewis and Dekalb') },
      { file: 'assets/music/let-em-have-it.m4a', title: 'Let \'Em Have It', artist: 'Robbero', dur: 196.43, lufs: -14.03, lic: 'CC BY 3.0',
        by: '"Let \'Em Have It (Hip Hop Instrumental)" by Robbero', src: 'https://ccmixter.org/files/Robbero/43749' },
      { file: 'assets/music/vicious.m4a', title: 'Vicious', artist: 'Kevin MacLeod', dur: 222.11, lufs: -14.04, lic: 'CC BY 4.0', by: MACLEOD('Vicious'), src: INCOMPETECH('Vicious') },
    ],
  },
  {
    id: 'stoop', name: 'STOOP RADIO', freq: '88.3', tag: 'Boom-bap · lo-fi · jazz-funk', color: '#6CB8FF',
    tracks: [
      { file: 'assets/music/i-dunno.m4a', title: 'I dunno', artist: 'grapes ft. J.Lang & Morusque', dur: 163.77, lufs: -14.04, lic: 'CC BY 3.0',
        by: '"I dunno" by grapes (ft. J.Lang, Morusque)', src: 'https://ccmixter.org/files/grapes/16626',
        samples: [
          { title: 'It\'s Time {Bootcamp}', artist: 'J.Lang', src: 'https://ccmixter.org/files/djlang59/16366' },
          { title: '260808 loops piano', artist: 'Morusque', src: 'https://ccmixter.org/files/Nurykabe/16527' },
        ] },
      { file: 'assets/music/chill-lofi.m4a', title: 'Chill Lofi Inspired', artist: 'omfgdude', dur: 66.336, lufs: -15.89, loop: { start: 17.728, end: 66.336 }, plays: 3,
        lic: 'CC0 1.0', by: '"Chill Lofi Inspired (loop edit)" by omfgdude, loop edit by qubodup', src: 'https://opengameart.org/content/chill-lofi-inspired-loop-edit' },
      { file: 'assets/music/sunbirds.m4a', title: 'SUNBIRDS', artist: 'BOCrew ft. FORENSIC', dur: 232.072, lufs: -14.03, lic: 'CC BY 3.0',
        by: '"SUNBIRDS" by BOCrew (THEDEEPR / THECORNER, feat. FORENSIC)', src: 'https://ccmixter.org/files/BOCrew/38854',
        samples: [{ title: 'ccmixter promo', artist: 'FORENSIC', src: 'https://ccmixter.org/files/4nsic/22923' }] },
      { file: 'assets/music/midnight-cruiser.m4a', title: 'Midnight Cruiser', artist: 'Zane Little', dur: 89.593, lufs: -12.96, loop: { start: 32.564, end: 89.593 }, plays: 2,
        lic: 'CC0 1.0', by: '"Midnight Cruiser" by Zane Little', src: 'https://opengameart.org/content/midnight-cruiser' },
      { file: 'assets/music/got-funk.m4a', title: 'Got Funk', artist: 'Kevin MacLeod', dur: 279.52, lufs: -14.04, lic: 'CC BY 4.0', by: MACLEOD('Got Funk'), src: INCOMPETECH('Got Funk') },
    ],
  },
  {
    id: 'afterhours', name: 'AFTER HOURS', freq: '103.5', tag: 'House · electro · all night', color: '#B6FF3B',
    tracks: [
      { file: 'assets/music/funky-house.m4a', title: 'Funky House', artist: 'Of Far Different Nature', dur: 61.458, lufs: -7.02, loop: { start: 16.458, end: 61.458 }, plays: 2,
        lic: 'CC0 1.0', by: '"Funky House" by Of Far Different Nature', src: 'https://opengameart.org/content/funky-house' },
      { file: 'assets/music/slampe.m4a', title: 'Slampe', artist: 'Fupi', dur: 97.969, lufs: -13.18, loop: { start: 13.781, end: 97.969 }, plays: 1,
        lic: 'CC0 1.0', by: '"Slampe (Synthwave House)" by Fupi', src: 'https://opengameart.org/content/slampe-synthwave-house' },
      { file: 'assets/music/dance-field.m4a', title: 'Dance Field', artist: 'Centurion_of_war', dur: 38.786, lufs: -19.63, loop: { start: 11.363, end: 38.786 }, plays: 3,
        lic: 'CC0 1.0', by: '"Dance Field" by Centurion_of_war', src: 'https://opengameart.org/content/dance-field' },
      { file: 'assets/music/vengeance-electro.m4a', title: 'Vengeance Electro', artist: 'Of Far Different Nature', dur: 112.511, lufs: -5.68, loop: { start: 52.516, end: 112.511 }, plays: 1,
        lic: 'CC0 1.0', by: '"Vengeance Electro" by Of Far Different Nature', src: 'https://opengameart.org/content/vengeance-electro' },
    ],
  },
];

// the theme (MOG FM's first track), for anything else that wants to play it (a title screen, say), and the runner-up
// (BLOCK 99.1 opens with it)
export const THEME = STATIONS[0].tracks[0];
export const THEME_ALT = STATIONS[1].tracks[0];
