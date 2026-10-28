// Mog City: who speaks how (the voice build's cast, the line sheet's directions; docs/STORY.md is the story and the cast).
// voice / rate (words a minute) / pbas: the macOS fallback (say -v '?' lists them), used only for a speaker with no
// synthesised voice yet (tts/picks.json); fx 'changer': a voice changer baked into the files (nobody has one now; Mr.
// Big is heard as he is, 27 Oct); call: the sound the game puts
// on the line live ('phone' a handset, 'video' a laptop call).
export const CAST = {
  Dan: { voice: 'Eddy (English (US))', rate: 188, who: 'the player: a first-year associate investment banker at JPBank, just fired and charged with insider trading the bank set him up for',
    direction: 'A grown man, mid-20s: quick, dry, deadpan, polite until he isn\'t; very tired of being blamed, and the jokes are armour.' },
  Knox: { voice: 'Rocko (English (US))', rate: 182, who: 'the Suits\' crew lead (JPBank\'s security team, run like a gang): big, black shades, a black leather bag across his back',
    direction: 'Low, cocky, sing-song mockery in HR language; enjoys every second; never actually angry.' },
  'Mr. Big': { voice: 'Daniel', rate: 165, call: 'video',
    who: 'the CEO of JPBank, about sixty, the one who set Dan up: a video call from his study, a cigar in his hand, his own voice',
    direction: 'Smug, polished, unhurried; a CEO in his study who has never been told no. Never shouts. Smiles through the threats.' },
  Jane: { voice: 'Samantha', rate: 205, call: 'phone', who: 'Dan\'s girlfriend since their college days at SUNY: a Puerto Rican New Yorker in her mid-20s who works in data and pieces the evidence together; mostly a voice on the phone',
    direction: 'Quick, warm and wry, composed; her own natural New York voice (no put-on accent); fast because she thinks fast; dry about Dan\'s choices, fully on his side.',
    // (the owner, 28 Oct: "Jane should not whisper, does not sound right": the tail call's lines in her own voice, a
    // little quieter (voices.mjs HUSH_DB), not the LPC whisper)
    whisper: false },
  Dash: { voice: 'Reed (English (US))', rate: 220, pbas: 52, who: 'one of the Suits, always late, even to fights: tie half-knotted',
    direction: 'Breathless, whiny, a higher pitch; running in late.' },
  Mack: { voice: 'Rocko (English (US))', rate: 178, pbas: 34, who: '"Mack Moneybags", the Suits\' Midtown handler; his phone holds the group chat',
    direction: 'Big, loud, panicky about his money; every sentence a pitch.' },
  Gears: { voice: 'Reed (English (US))', rate: 165, pbas: 34, who: 'Dan\'s mechanic: a big ex-pit-crew man with a tuning garage in West Chelsea', direction: 'Slow, warm, proud of his work.' },
  Fiona: { voice: 'Flo (English (US))', rate: 215, who: 'JPBank\'s Head of Community: she hosts its "JPBank Loves New York" community day in Washington Square, next to the Occupy camp', direction: 'A hype host on a megaphone; everything is the best thing ever.' },
  Brick: { voice: 'Rocko (English (US))', rate: 198, pbas: 44, who: 'the Suits\' bouncer at Fiona\'s rally: an earpiece cord, a radio', direction: 'Loud, jumpy, a hype man turned bouncer.' },
  Bea: { voice: 'Samantha', rate: 170, who: 'Ms. Bea: a retired Bronx science teacher in her sixties who runs the Occupy camp\'s kitchen and its people\'s mic; JPBank took her house', direction: 'Warm, unhurried, commanding: a teacher who has never needed a microphone.' },
  Camp: { voice: 'Reed (English (US))', rate: 180, who: 'the Occupy JPBank camp in Washington Square: forty-odd people answering the people\'s mic', direction: 'A crowd, eight voices together in the build: ragged, outdoors, cheerful and loud.' },
  // (not voiced yet: ready for his lines)
  Rook: { voice: 'Reed (English (US))', rate: 205, pbas: 56, who: 'a junior on JPBank\'s security team who wants out (Mission 4)', direction: 'Nervous, quick, apologetic.' },
  default: { voice: 'Reed (English (US))', rate: 190, who: '', direction: '' },
};

// how the speech voices should say a few words (the subtitles keep the spelling)
export const SAY = [
  [/\bJPBank\b/g, 'J.P. Bank'],
  [/\bBlimpco\b/g, 'Blimp-co'],
  [/\bDMs\b/g, 'D M\'s'],
  [/\bMOON\b/g, 'Moon'],
  [/^\.\.\./, ''],
];

// a note for each line (the sheet's direction column)
export const DIRECTION = {
  'intro-dan-delete-your-account-good': 'Reading a comment under the story that named him, off his phone, walking; dry, unbothered.',
  'intro-dan-okay-okay-car-then': 'To himself, the laptop bag on his shoulder; making a plan out loud, a little tired.',
  'intro-dan-kidding-obviously': 'Quick aside, half to himself. A beat of a smile.',
  'intro-knox-yo-banker-boy-huge': 'Jumping out of the van, arms wide; fake-fan enthusiasm.',
  'intro-dan-i-dont-sign-forms': 'Stepping back, polite but firm; a banker\'s manners, trying to stay cool.',
  'intro-knox-youve-been-let-go': 'Grinning, getting closer; an HR voice, and "collecting" is a threat.',
  'intro-dan-hey': 'A shout as the bag is ripped off his shoulder. Real alarm, full voice.',
  'intro-knox-want-it-back-pick': 'Over his shoulder, jumping back in the van; taunting.',
  'intro-mrbig-dan-big-fan-great': 'Opening the call; slow, mock-friendly, savouring it. A sting on "never made any of them".',
  'intro-dan-who-is-this': 'Out of breath, just got up off the pavement.',
  'intro-mrbig-they-call-me-mr': 'Introducing himself, smug and polished, the cigar between words; a pause before "You ran errands".',
  'intro-dan-give-it-back': 'Low, angry, trying to keep it together.',
  'intro-mrbig-somebody-has-to-be': 'Leaning into the lens on "every trade". Business-like menace.',
  'intro-mrbig-you-sign-the-confession': 'The demand, the cigar pointed at the lens; each sentence a full stop. Cold on "stop digging". (The trailer uses its first sentence.)',
  'intro-dan-did-the-ceo-of': 'After the call drops, to himself; disbelief turning into a bit of a laugh.',
  'intro-dan-okay-you-framed-the': 'Quiet resolve, turning to his car. The line of the trailer.',
  'm1-jane-dan-why-is-your': 'On the phone, already typing; amused and alarmed.',
  'm1-dan-because-some-guys-in': 'Driving, flat and fast.',
  'm1-jane-okay-im-on-the': 'A beat as it sinks in, then all business, fast.',
  'm1-dan-guys-from-my-old': 'Deadpan.',
  'm1-jane-so-jpbank-great-narrows': 'Sarcastic, quick.',
  'm1-jane-tracker-stopped-chelsea-park': 'Reading the location off her screen; the warning is sincere.',
  'm1-dan-define-stupid': 'Deadpan, already decided.',
  'm1-jane-going-there-alone': 'Flat, pointed.',
  'm1-dan-then-im-already-doing': 'A small grin in the voice. Hangs up.',
  'm1-dash-wait-did-i-miss': 'Running in across the lawn, out of breath, shouting.',
  'm1-knox-you-always-miss-the': 'Shouted back mid-fight, exasperated.',
  'm1-knox-told-you-to-check': 'Squaring up on the lawn, teasing.',
  'm1-dan-been-a-little-busy': 'Dry, fists coming up.',
  'm1-knox-nothing-personal-kid-its': 'Cracking his knuckles; the fight starts on "personal".',
  'm1-dan-my-tracker-cut-right': 'Quiet, holding the tracker cut out of his bag, in the van; worried.',
  'm1-dan-hes-got-my-laptop': 'Reading Mr. Big\'s text on the burner; grim.',
  'm1-dan-cool-cool-cool-cool': 'Not cool at all; a nervous, deadpan spiral.',
  'm2-jane-youre-late-sit-burner': 'At the Bryant Park table, Moon at her feet; brisk, warm under it.',
  'm2-dan-hi-jane-hi-moon': 'Dry and fond, sitting down.',
  'm2-jane-ram-him-dan-gently': 'Quick, then a beat; "Ish." an afterthought.',
  'm3-gears-go-get-your-name': 'Warm, a hand on the roof of the car.',
  // (the car calls' lines, wagmi/mission/calls.js, get their call and register in the sheet; these are the scenes')
  'm1-knox-this-is-a-performance': 'HR-speak bark mid-fight, only when no line is up.',
  'm1-knox-please-stop-hitting-back': 'HR-speak bark mid-fight, wounded.',
  'm1-knox-okay-im-escalating-this': 'HR-speak bark, losing; a threat he believes in.',
  'm2-mack-im-too-leveraged-to': 'A bark mid-fight in the yard, panicking.',
  'm2-mack-shareholder-value-hit-him': 'A bark mid-fight in the yard.',
  'm2-mack-do-you-know-what': 'A bark mid-fight in the yard, outraged.',
  'm3-fiona-hiii-new-york-jpbank': 'On the megaphone, the community day\'s host; everything is the best thing ever.',
  'm3-camp-we-are-the-ninety': 'The camp, across the park, answering her: a chant.',
  'm3-brick-yo-thats-banker-boy': 'Spotting Dan; into his radio.',
  'm3-brick-make-it-look-like': 'Into his radio, loud enough for the camp: the planted Suits\' plan, said out loud.',
  'm3-camp-we-saw-that': 'The camp, all at once: they heard him.',
  'm3-bea-phones-up-everybody-film': 'Ms. Bea, to the camp, at the first rig down: the footage of the return call.',
  'm3-bea-mic-check': 'The people\'s mic: she calls, the camp says it back so the back can hear.',
  'm3-camp-mic-check': 'The people\'s mic: the camp says it back, loud, ragged.',
  'm3-bea-anybody-the-bank-hates': 'The people\'s mic: the first half, a beat for the echo.',
  'm3-camp-anybody-the-bank-hates': 'The people\'s mic: said back.',
  'm3-bea-is-somebody-we-should': 'The people\'s mic: the turn; warm, sure.',
  'm3-camp-free-dan-free-dan': 'The camp turns it into a chant, facing the bank\'s dead screens.',
};

// a line said differently from its speaker's default (rate, pbas: the macOS fallback only; gain: any line but a recording;
// take: a Qwen line made from its takes take..take+3 instead of 0..3, when the first clone drifted off its speaker's pitch;
// redo: a line made before its call's register changed, made again in it from the same take: whispered, or fast)
export const TWEAK = {
  'intro-dan-hey': { pbas: 62, rate: 150, gain: 4 }, // a shout
  'm1-dash-wait-did-i-miss': { gain: 2 },
  // (dan-A's first takes came out 145-200 Hz against Dan's 114: .scratch/voices/takes.mjs)
  'intro-dan-who-is-this': { take: 4 },
  'm2-dan-hi-jane-hi-moon': { take: 4 },
  'm2-dan-rook-the-getting-weird': { take: 4 },
  'm2-dan-mack-moneybags-did-his': { take: 8 },
  // (the story pass of 27 Oct: the first clones that drifted more than about 4 semitones off their voice, each given the
  // take of takes 4, 8 and 12 nearest its voice: .scratch/polish/voices/takes.mjs, check/rawf0.mjs)
  'm2-dan-what-did-she-say': { take: 4 }, 'm2-dan-does-it-still-clank': { take: 8 }, 'm3-dan-why-not-your-place': { take: 4 },
  'm3-dan-whos-fiona': { take: 12 }, 'm3-dan-should-i-know-ms': { take: 8 }, 'm3-dan-you-know-the-bailout': { take: 12 },
  'm3-dan-im-cornering': { take: 4 }, 'm3-dan-ive-never-had-a': { take: 16 }, 'm2-dan-that-haircut-was-a': { take: 12 },
  'm2-dan-shes-never-growled-in': { take: 4 }, 'm3-dan-hopping': { take: 12 }, 'm2-dan-that-was-gentle': { take: 12 },
  'm1-jane-so-why-do-they': { take: 4 }, 'm1-jane-how': { take: 4 }, 'm1-jane-then-we-find-one': { take: 12 },
  'm2-jane-hes-got-your-door': { take: 8 }, 'm2-jane-ask-mack': { take: 4 }, 'm3-jane-how-much-was-yours': { take: 12 },
  'm3-jane-on-foot-dan-they': { take: 12 }, 'm3-jane-we-start-tonight-go': { take: 4 }, 'm2-jane-he-signs-his-texts': { take: 8 },
  'm2-jane-it-rhymes': { take: 4 }, 'm3-jane-out-of-sight-keep': { take: 4 },
  'm3-bea-mic-check': { take: 4 }, 'm3-bea-phones-up-everybody-film': { take: 4 }, // (bea-A's first takes: 235-245 Hz against her 164)
  // (the voice QA of 28 Oct, by signal: the first take held 'Live' on one flat pitch for half a second (a hum), and
  // read the second 'JPBank' as three drawn-out letters (1.6x the line's length); takes 4, 8 and 12 compared)
  'm3-jane-live-they-paid-for': { take: 12 }, 'm3-dan-jpbank-broadcast-me-getting': { take: 8 },
  // (the same QA by speech recognition (Whisper, the owner's go): takes whose words came out wrong, each given the take
  // of 4, 8, 12 (16) heard right and nearest its voice: 'gu- guys' (a stutter), 'they won an audit', 'It took my laptop',
  // 'Because he didn't', 'a chance' (twice: 12 and 8 are 'chance'), 'Dears has a room', 'clink' (take 12), 'You look
  // like that', 'its audits'; and the lines whose spelling changed in TTS_SAY (Ms. Bee, Fiona's 'Haaai', 'Mic, check!'))
  'm1-dan-they-say-it-to': { take: 8 }, 'm3-jane-forty-one-days-bailouts': { take: 4 }, 'm2-dan-they-took-my-laptop': { take: 4 },
  'm2-jane-because-you-didnt-pick': { take: 8 }, 'm3-jane-gears-has-a-room': { take: 8 }, 'm1-jane-you-looked-like-that': { take: 4 },
  'm3-jane-if-the-camp-gets': { take: 8 }, 'm3-dan-yes-ms-bea': { take: 4 }, 'm3-jane-one-more-thing-the': { take: 4 },
  'm3-jane-bea-got-on-the': { take: 4 },
  // (the tail lines out of the whisper: two of their takes had drifted low under it, 130-138 Hz against Jane's 179)
  'm2-jane-leased-everything-mack-has': { take: 8 }, 'm2-jane-dan-back-off': { take: 4 },
  // (the old tail call, Jane's part, in the tail's register like the rest of it (hushed since 28 Oct, was whispered):
  // made again in it from the same takes)
  'm2-jane-ive-got-the-van': { redo: true },
  'm2-jane-its-registered-to-a': { redo: true },
  'm2-jane-he-picked-it-he': { redo: true },
  'm2-jane-hang-back-if-they': { redo: true },
};
