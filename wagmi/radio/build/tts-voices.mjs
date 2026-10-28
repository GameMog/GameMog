// Mog City: the synthesised voices (Node data, for the voice build). The candidates the owner auditions for Dan, Jane and
// Mr. Big, by name (dan-A .. dan-C, jane-A .. jane-C, mrbig-A .. mrbig-E), and for the side characters (knox-A/B, mack-A/B,
// gears-A .. gears-E, fiona-A/B, dash-A/B, brick-A/B, bea-A/B, and the Camp's crowd camp-A); the one picked for a speaker is recorded by
// `voices.mjs --tts <name>,..` in wagmi/radio/build/tts/picks.json, and wagmi/radio/build/tts.py renders that speaker's
// lines with it (see docs/VOICE-LINES.md).
//
//   engine 'qwen'    Qwen3-TTS 12Hz (Apache-2.0) on Apple silicon through mlx-audio (MIT). The voice is DESIGNED once
//                    from words (design, with the 1.7B VoiceDesign model and a fixed seed), saved as a reference clip
//                    (ref: the voice itself, keep it), then every line is CLONED from that clip by the 0.6B Base model.
//   engine 'kokoro'  Kokoro-82M (Apache-2.0) through kokoro-onnx (MIT): a stock voice or a blend of them, at a speed.
//                    Deterministic: the same words give the same audio.
//   engine 'crowd'   several Kokoro stock voices saying the line together (crowd: {voice, speed, delay s, gain dB}),
//                    each a little late (plus up to `jitter` s, seeded by the line), mixed down: the Camp. Deterministic.
// Only the rendered audio ships. The models, the venv and the reference clips of voices nobody picked stay out of the
// repo (.scratch/voices/refs); a picked qwen voice's reference clip is kept in wagmi/radio/build/tts/.

// the clip each qwen voice is designed on: neutral words in character, not a game line (about 10 to 14 s)
const DAN_REF = 'So here\'s my week. Monday I had a desk, a badge and a coffee order. Tuesday I had none of those. Today a reporter called my mom. I\'m fine. Totally fine. Ask me again tomorrow.';
const JANE_REF = 'Okay, I pulled the logs, and honestly, it\'s a mess. Three logins, same machine, all after midnight. I\'m sending you the screenshots now. Read them first, then call me, okay?';
const BOSS_REF = 'Good evening. Let us keep this simple, shall we? You listen, I talk, and nobody needs to raise their voice. Most problems solve themselves, given a little patience.';
const STUDIO = 'close-mic, clean dry studio audio, natural and conversational, not an announcer.';
// the side characters' clips: in their own energy (a clone keeps its reference's delivery), still not a game line
const KNOX_REF = 'Yo, listen, listen. Best week of my whole life, okay? Lost it all on Monday, got it back on Tuesday, lost it again by lunch. Still smiling. That\'s a talent.';
const MACK_REF = 'Okay, everybody, listen to me. This is a once in a lifetime opportunity. I say that every week, but this week I mean it. Ten times, minimum. Don\'t ask me how.';
const GEARS_REF = 'Pop the hood. See that? Hand-wired, every bit of it. Took me three weekends and a lot of coffee. She hums now. Listen to her. That\'s the good stuff.';
const FIONA_REF = 'Hi, everybody! Oh my gosh, look at all of you! This is the best crowd ever, I\'m not even kidding. Phones up, smiles on, and let me hear some noise!';
const DASH_REF = 'Sorry, sorry, I\'m here, I\'m here! The train was late, then my phone died, then I went to the wrong park. Did I miss it? Please tell me I didn\'t miss it.';
const BRICK_REF = 'Let\'s go, let\'s go! Hands up, phones out, nobody past the rope! You, back up. You, you\'re good. Everybody else, keep that energy up!';
const BEA_REF = 'Alright, everybody, settle down. I taught science for thirty-one years, so I know what not listening sounds like. Soup is at six. Bring a bowl, bring a friend, and bring some patience.';
const LOUD = 'close-mic, clean dry studio audio, a real person in the moment, not a radio announcer.'; // (raises the pitch: pin it)

export const VOICES = {
  // Dan: a grown man, about 24, a first-year banker: confident, quick, dry. Picked of 8 designs (seeds 3101-3106, 3111,
  // 3112) by pitch and how evenly the clone holds it over three lines: A the low husky baritone (about 114 Hz, the
  // steadiest), B a New Yorker's low-mid baritone (about 125 Hz), C the lighter, younger one (about 150 Hz). Two of the
  // others came back silent or drifted an octave; the rest wandered 100-190 Hz from line to line. The owner's pick
  // (27 Oct, after the audition): A
  'dan-A': { speaker: 'Dan', engine: 'qwen', desc: 'qwen-husky-baritone', seed: 3103, refText: DAN_REF,
    design: `Male, 24 years old, American, slightly husky low voice, relaxed and confident, quick dry deadpan delivery, tired but sharp, ${STUDIO}` },
  'dan-B': { speaker: 'Dan', engine: 'qwen', desc: 'qwen-new-yorker-baritone', seed: 3112, refText: DAN_REF,
    design: `Male, 24 years old, American New Yorker, a grown man's low-mid baritone chest voice, confident and quick, dry deadpan humour, composed, ${STUDIO}` },
  'dan-C': { speaker: 'Dan', engine: 'qwen', desc: 'qwen-young-banker', seed: 3101, refText: DAN_REF,
    design: `Male, 24 years old, American, born in New York, a grown man's voice in a comfortable low-mid baritone, confident, quick and dry, deadpan wit, a young banker having a very bad week, ${STUDIO}` },
  // Jane: a grown woman, mid-20s, a Puerto Rican New Yorker: warm, quick and composed, her own natural New York voice
  // (the words never ask for an accent). Picked of 10 designs (seeds 3201-3206, 3211-3214): the first six came out 240
  // to 300 Hz, young and bright; 'a grown woman's voice' and 'low' pin it. A a calm low mezzo-alto (about 215 Hz),
  // B a warm low alto (about 178 Hz), C a clear mezzo (about 230 Hz). The owner's pick (27 Oct): B
  'jane-A': { speaker: 'Jane', engine: 'qwen', desc: 'qwen-calm-mezzo-alto', seed: 3213, refText: JANE_REF,
    design: `Female, mid 20s, Latina New Yorker, a calm low mezzo-alto, a grown woman's voice, warm and steady, talks fast but never rushed, dry humour, ${STUDIO}` },
  'jane-B': { speaker: 'Jane', engine: 'qwen', desc: 'qwen-warm-low-alto', seed: 3212, refText: JANE_REF,
    design: `Female, 26 years old, a Puerto Rican woman from New York City, a grown woman's warm low alto voice, low-pitched, relaxed and composed, quick and wry, natural New York American English, ${STUDIO}` },
  'jane-C': { speaker: 'Jane', engine: 'qwen', desc: 'qwen-clear-mezzo', seed: 3203, refText: JANE_REF,
    design: `Female, 25 years old, Puerto Rican-American from New York City, warm clear mezzo voice, quick, composed and confident, wry and caring, ${STUDIO}` },
  // Mr. Big, JPBank's CEO: calm, measured, polished, slightly British; heard as he is, no voice changer (27 Oct). The
  // candidates were auditioned for the caller before him (a masked voice, through a changer): A the Kokoro British males
  // bm_daniel and bm_lewis half and half, a little slow; B bm_daniel alone, C a Qwen design (seed 4101), D bm_lewis
  // (deeper, 95 Hz), E bm_george (145 Hz). The owner's pick (27 Oct, by ear): D, now his own voice, unprocessed; A, B, C
  // and E stay as the alternates
  'mrbig-A': { speaker: 'Mr. Big', engine: 'kokoro', desc: 'kokoro-bm_daniel-bm_lewis-blend', voice: { bm_daniel: 0.5, bm_lewis: 0.5 }, speed: 0.9 },
  'mrbig-B': { speaker: 'Mr. Big', engine: 'kokoro', desc: 'kokoro-bm_daniel', voice: { bm_daniel: 1 }, speed: 0.88 },
  'mrbig-C': { speaker: 'Mr. Big', engine: 'qwen', desc: 'qwen-british-baritone', seed: 4101, refText: BOSS_REF,
    design: `Male, mid 40s, British, a calm and measured low baritone, precise and unhurried, slightly theatrical, a quiet smile in the voice, polite menace, never raises his voice, ${STUDIO}` },
  'mrbig-D': { speaker: 'Mr. Big', engine: 'kokoro', desc: 'kokoro-bm_lewis', voice: { bm_lewis: 1 }, speed: 0.95 },
  'mrbig-E': { speaker: 'Mr. Big', engine: 'kokoro', desc: 'kokoro-bm_george', voice: { bm_george: 1 }, speed: 0.95 },
  // the side characters (invented voices, all adults): two candidates each
  // Knox: the Suits' crew lead; cocky, loud, sing-song mockery, never actually angry
  // (the first designs, 'loud' and 'having the time of his life', came out about 240 Hz, too high for a grown man: the
  // words now pin the range; the picks of 5 designs by pitch, low baritone about 105 Hz and raspy tenor about 130 Hz)
  'knox-A': { speaker: 'Knox', engine: 'qwen', desc: 'qwen-cocky-baritone', seed: 2101, refText: KNOX_REF,
    design: `Male, early 30s, American, low-pitched mid baritone, relaxed swagger, cocky and amused, sing-song teasing delivery, grinning through every word, a grown man's chest voice, ${STUDIO}` },
  'knox-B': { speaker: 'Knox', engine: 'qwen', desc: 'qwen-raspy-tenor', seed: 2112, refText: KNOX_REF,
    design: `Male, late 20s, American, raspy tenor in a normal adult male range, cocky and fast, mocking sing-song lilt, half laughing as he talks, ${STUDIO}` },
  // Mack ("Mack Moneybags"): big, loud, panicky about his money; every sentence a pitch
  // ('booming' with 'loud and panicky' came out about 300 Hz: the panic is left to the lines; picked of 7 by pitch)
  'mack-A': { speaker: 'Mack', engine: 'qwen', desc: 'qwen-booming-salesman', seed: 2201, refText: MACK_REF,
    design: `Male, mid 40s, American, deep heavy bass-baritone, a big man's booming chest voice, a blustering salesman who pitches every sentence, worried about his money, ${STUDIO}` },
  'mack-B': { speaker: 'Mack', engine: 'qwen', desc: 'qwen-nasal-hustler', seed: 2212, refText: MACK_REF,
    design: `Male, late 30s, American, nasal mid-range voice in a normal adult male range, a fast-talking hustler, anxious and excitable, every sentence rises like a sales pitch, slightly out of breath, ${LOUD}` },
  // Gears: big, gentle, an ex-pit-crew mechanic; slow, warm, proud of his work
  'gears-A': { speaker: 'Gears', engine: 'qwen', desc: 'qwen-deep-warm', seed: 2311, refText: GEARS_REF,
    design: `Male, mid 50s, American, deep warm bass voice, slow and easygoing, gentle and kind, a proud old mechanic, a smile in every word, ${STUDIO}` },
  'gears-B': { speaker: 'Gears', engine: 'qwen', desc: 'qwen-soft-husky', seed: 2312, refText: GEARS_REF,
    design: `Male, mid 40s, American, soft husky baritone, calm and unhurried, a gentle giant, quiet pride, a dry little chuckle, ${STUDIO}` },
  // round 2 (the owner: an old Black man's voice): an older African-American man, about 60, deep, warm, a little gravel,
  // unhurried, kind; an invented voice. Picked of 15 designs by pitch (all about 90 to 100 Hz), how evenly the clone
  // holds it over three lines, and how rough the voicing is: C the slowest, D the most gravel, E the smoothest
  'gears-C': { speaker: 'Gears', engine: 'qwen', desc: 'qwen-old-deep-warm', seed: 2332, refText: GEARS_REF,
    design: `Male, around 60 years old, African-American, deep warm bass voice with a little gravel, low-pitched, a grown man's chest voice, slow and unhurried, gentle and kind, an old mechanic quietly proud of his work, ${STUDIO}` },
  'gears-D': { speaker: 'Gears', engine: 'qwen', desc: 'qwen-old-gravel', seed: 2353, refText: GEARS_REF,
    design: `Male, early 60s, African-American New Yorker, deep gravelly low voice, weathered and husky, unhurried easy pace, kind and steady, a grown man's chest voice, ${STUDIO}` },
  'gears-E': { speaker: 'Gears', engine: 'qwen', desc: 'qwen-old-smooth', seed: 2352, refText: GEARS_REF,
    design: `Male, early 60s, African-American New Yorker, deep gravelly low voice, weathered and husky, unhurried easy pace, kind and steady, a grown man's chest voice, ${STUDIO}` },
  // Fiona: JPBank's Head of Community, hosting its community day on a megaphone; everything is the best thing ever
  // (an adult, and not to be mistaken for Jane, about 270 Hz: B is the lower, fuller one; picked of 7 by pitch)
  'fiona-A': { speaker: 'Fiona', engine: 'qwen', desc: 'qwen-big-hype-mezzo', seed: 2401, refText: FIONA_REF,
    design: `Female, early 30s, American, bright powerful mezzo voice, a party host working a crowd, loud and high energy, everything is the best thing ever, a big smile in the voice, ${LOUD}` },
  'fiona-B': { speaker: 'Fiona', engine: 'qwen', desc: 'qwen-husky-alto-mc', seed: 2402, refText: FIONA_REF,
    design: `Female, mid 30s, American, a full husky alto voice, a seasoned party MC hyping a crowd, loud and fast, everything is the best thing ever, ${LOUD}` },
  // Dash: one of the Suits, always late; breathless, panicky, a whiny pitch
  // ('high whiny tenor' came out 280 to 340 Hz, a boy's pitch: a grown man's voice, a bit high; picked of 10 by pitch)
  'dash-A': { speaker: 'Dash', engine: 'qwen', desc: 'qwen-breathless-whiny', seed: 2531, refText: DASH_REF,
    design: `Male, mid 20s, American, a grown man's voice, a bit high and whiny, breathless from running, panicky, talks fast, always sure he missed something, ${LOUD}` },
  'dash-B': { speaker: 'Dash', engine: 'qwen', desc: 'qwen-nasal-flustered', seed: 2551, refText: DASH_REF,
    design: `Male, mid 20s, American, a grown man's mid-range voice with a whiny nasal edge, flustered and apologetic, rushing his words, out of breath, ${STUDIO}` },
  // Brick: the Suits' bouncer at the rally; loud, jumpy, a hype man turned bouncer
  // ('loud', 'hyped' and every 'hype man' design came out 230 to 340 Hz, too high for a grown man: both are the
  // bouncer's words, B another seed, a higher and jumpier voice; picked of 12 by pitch)
  'brick-A': { speaker: 'Brick', engine: 'qwen', desc: 'qwen-gravel-bouncer', seed: 2601, refText: BRICK_REF,
    design: `Male, early 30s, American, low gravelly voice, a big bouncer's chest voice, short barked phrases, restless and jumpy, ${STUDIO}` },
  'brick-B': { speaker: 'Brick', engine: 'qwen', desc: 'qwen-jumpy-bouncer', seed: 2621, refText: BRICK_REF,
    design: `Male, early 30s, American, low gravelly voice, a big bouncer's chest voice, short barked phrases, restless and jumpy, ${STUDIO}` },
  // Ms. Bea: a retired Bronx science teacher in her sixties who runs the Occupy camp's kitchen and its people's mic;
  // warm, unhurried, commanding (an invented voice). Picked of 6 designs (seeds 2701-2703 on the first words, 2711-2713
  // on 'a mature grown woman's rich low alto with a little grain, motherly'): A the lowest, an older woman's low alto
  // (reference about 164 Hz, her lines 150-183 Hz: well under Jane's 178-209 and Fiona's 270), B the slowest, the
  // most deliberate (about 158 Hz, lines 164-195); the second words came out higher (176-200 Hz)
  'bea-A': { speaker: 'Bea', engine: 'qwen', desc: 'qwen-teacher-low-alto', seed: 2701, refText: BEA_REF,
    design: `Female, mid 60s, a retired schoolteacher from the Bronx, New York, an older woman's warm, full, low alto voice, commanding and unhurried, kind but firm, a voice that carries across a room without shouting, ${STUDIO}` },
  'bea-B': { speaker: 'Bea', engine: 'qwen', desc: 'qwen-teacher-deliberate', seed: 2703, refText: BEA_REF,
    design: `Female, mid 60s, a retired schoolteacher from the Bronx, New York, an older woman's warm, full, low alto voice, commanding and unhurried, kind but firm, a voice that carries across a room without shouting, ${STUDIO}` },
  // the Camp: the Occupy camp answering Ms. Bea's people's mic, forty-odd people heard as eight (New York: the American
  // Kokoro voices, four men and four women; not bm_lewis, Mr. Big's), each a few hundredths of a second late and at its
  // own pace, so it is ragged like a crowd and not a choir; a faint slap off the buildings around the square. A little
  // quick (1.01-1.1): the people's mic in m3-scenes.js gives each answer its reading time (its words / 15 s)
  'camp-A': { speaker: 'Camp', engine: 'crowd', desc: 'kokoro-crowd-of-8', seed: 2801, jitter: 0.04,
    crowd: [
      { voice: 'am_michael', speed: 1.04, delay: 0, gain: 0 }, { voice: 'af_sarah', speed: 1.08, delay: 0.04, gain: -1 },
      { voice: 'am_adam', speed: 1.02, delay: 0.07, gain: -1 }, { voice: 'af_bella', speed: 1.1, delay: 0.02, gain: -2 },
      { voice: 'am_onyx', speed: 1.03, delay: 0.1, gain: -2 }, { voice: 'af_kore', speed: 1.05, delay: 0.08, gain: -3 },
      { voice: 'am_eric', speed: 1.07, delay: 0.12, gain: -3 }, { voice: 'af_jessica', speed: 1.01, delay: 0.05, gain: -4 },
    ] },
};

// how the synthesised voices should say a few words (on top of cast.mjs SAY; the subtitles keep the spelling)
export const TTS_SAY = [
  [/\bHODL\b/g, 'hoddle'],
  [/^\.\.\./, ''],
];

// a source tag for the manifest and NOTICE: what made the line
export const ttsSource = (name, v = VOICES[name]) => v.engine === 'qwen'
  ? `tts:qwen3-tts-12hz-0.6b-base:${name}(design 1.7b-voicedesign seed ${v.seed})`
  : v.engine === 'crowd' ? `tts:kokoro-82m-v1.0:${name}(crowd ${v.crowd.map((m) => m.voice).join('+')})`
    : `tts:kokoro-82m-v1.0:${name}(${Object.entries(v.voice).map(([k, w]) => (w === 1 ? k : `${w}*${k}`)).join('+')}@${v.speed})`;
