    /* ===================================================== the kart score == */
    // Included into the kart kit (kart.js), and so only into a kart world's runtime: Meme Kart's own score, "To The
    // Moon", written out note by note (the owner, 7 Oct: the generated score was "too generic, needs to feel upbeat
    // and FUN"). A jazz-funk big-band kart theme in Bb major at 160 BPM: a slap bass, a clavinet chopping the off-beats,
    // a brass section answering a whistle-able lead, claps, a cowbell and tight drums with a fill into every section.
    // Every instrument is synthesised here (no samples, no files); the platform's music.js is not touched.
    //
    //   var M = kartMusic.create(audioCtx, destination, opts)
    //   M.start(at, from)        the intro at audio time `at` (default: now); the intro is the countdown, two bars at
    //                            160 BPM = exactly 3 s (M.introSeconds), so the verse's downbeat lands on GO when
    //                            start(goTime - M.introSeconds) is called. from: 'intro' (default), 'loop' (the top
    //                            of the verse: the start screen, a race already going) or 'chorus'. Started later
    //                            than now, what is playing (or fading out after a stop()) goes on until `at` (a
    //                            duck asked for before then leaves a fade faded).
    //   M.setLap(n)              0 the start screen (the groove, the drums thinned), 1, 2 (more layers: shaker,
    //                            tambourine, the lead doubled an octave up in the chorus, a third horn, a piano under
    //                            the horns), 3 = the final lap: on the next bar line a brass rip, the key up a semitone
    //                            (Bb to B), the tempo to 168, straight into the chorus with a fourth horn and the horns
    //                            doubling the hook. A lap number lands on the next bar line; before start() it sets
    //                            the arrangement start() begins in (a 3 there starts in B at 168, without the rip).
    //                            (The score is scheduled a second ahead; a lap asked for after its bar line was
    //                            scheduled still lands on the next one, what was scheduled past it taken back.)
    //   M.sting(kind)            'go' | 'lap' | 'final' | 'finish' | 'win' | 'lose': short figures on the hook's head
    //                            (F Bb A Bb D), in the key and tempo now playing, over the score (which dips 5 dB
    //                            under them); 'win' and 'lose' are the results' (the caller stops the score first if
    //                            it wants them alone). Returns the sting's length in seconds.
    //   M.duck(amount, seconds)  the score down `amount` dB (default 4) for `seconds` (default 0.12), then back, as the
    //                            platform score ducks under effects.
    //   M.stop(fade)             fades out over `fade` seconds (default 1.2) and stops scheduling.
    //   M.update(lap, onBeat)    the platform score's call, so the runtime can play this as audio.music: sets the lap
    //                            (the runtime's energy 0-3 is the same number) and reports beats, { bar, beat,
    //                            section }. It runs on its own timer too (opts.timer: false turns it off, as an
    //                            OfflineAudioContext needs); calling update() every frame keeps it tight. On a page
    //                            the score is rendered ahead (see the player, below): about 8 s of it made and started
    //                            on the audio clock, so a main thread busy for seconds does not stop it.
    //   M.state                  { playing, stopping, lap, bar, section, nextBar, tempo, key, energy, gain, skipped (the
    //                            steps missed while the page could not run), taken (the bars or sources taken back),
    //                            mode ('render' or 'live'), ahead (the seconds made and started ahead now), low (the
    //                            least of it while playing, past a start's first seconds), late, renders, bytes }
    //   M.duckLevel()            the duck's gain now, for checks
    //   M.settled()              a promise kept when nothing is being made, for checks
    //
    //   kartMusic.score()        the composition as data, for checks: every bar's chords and parts in Bb at 160
    //   kartMusic.HOOK, .TEMPO, .FINAL_TEMPO, .KEY, .LOOP_BARS
    //
    // opts: { timer: true, mute: ['lead', ...], solo: [...] (stems, for checks: lead, whistle, brass, piano, clav, bass,
    // drums, fx, sting), seed, render (default: on a page yes, in an OfflineAudioContext no), ahead (s) }. The mix is normalised offline (measured with this module in an OfflineAudioContext, the
    // way music.js measures a song): about -16 LUFS integrated over a race, peaks held under -1.5 dBFS by its own
    // limiter, before the platform's master gain and limiter.
    //
    // The form, one lap's worth (32 bars, 48 s at 160): A, the verse (8 bars: the lead calls, the horns answer);
    // B, the pre-chorus (4: longer notes over a rising bass, ending in stop-time hits on the hook's rhythm); C, the
    // chorus (8: the hook, two bars, answered by the horns, twice); D, the bridge (4 bars of breakdown, claps, cowbell
    // and the slap bass, lead and horns trading the hook's head, then 4 of build, the snare doubling up, a slide
    // whistle into); C', the chorus again, its first half, the horns' last answer turning round into the verse.
    var kartMusic = (function () {
      'use strict';

      /* ------------------------------------------------------------ basics -- */
      function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
      function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
      function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
      var PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
      // 'Bb4' is 70, 'F#5' 78
      function note(s) { var m = /^([A-G])(b|#)?(-?\d)$/.exec(s); if (!m) throw new Error('kart score: not a note: ' + s); return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0); }
      // chords: a root and the intervals over it (the extensions the horns may voice)
      var QUAL = { '': [0, 4, 7], '6': [0, 4, 7, 9], maj7: [0, 4, 7, 11], '7': [0, 4, 7, 10], '9': [0, 4, 7, 10, 14], m7: [0, 3, 7, 10], m: [0, 3, 7], dim7: [0, 3, 6, 9], '7sus': [0, 5, 7, 10] };
      function chord(sym) {
        var m = /^([A-G])(b|#)?([a-z0-9]*)$/.exec(sym); if (!m || !QUAL[m[3]]) throw new Error('kart score: not a chord: ' + sym);
        var root = (PC[m[1]] + (m[2] === 'b' ? 11 : m[2] === '#' ? 1 : 0)) % 12, iv = QUAL[m[3]];
        return { sym: sym, root: root, iv: iv, pcs: iv.map(function (i) { return (root + i) % 12; }),
          third: iv.indexOf(3) >= 0 ? 3 : iv.indexOf(4) >= 0 ? 4 : 5, fifth: iv.indexOf(6) >= 0 && iv.indexOf(7) < 0 ? 6 : 7,
          // the bass's seventh: the chord's own flat seventh, else the sixth (a funk line plays no major seventh)
          seventh: iv.indexOf(10) >= 0 ? 10 : 9 };
      }

      /* ------------------------------------------------------------- the song -- */
      // Written in Bb major at 160 BPM, in sixteenth-note steps (16 to the bar). A part's line is "step:note:length"
      // with an optional ":velocity" and ":articulation" (the horns: s stab, f fall, d doit, w swell, r rip; the lead:
      // g glide from the note before). Chords are "step:symbol" (a bar of one chord is just its symbol).
      var TEMPO = 160, FINAL_TEMPO = 168, KEY = 'Bb';
      // the hook: two bars, stated in the chorus, answered by the horns, its head (the first five notes) the motif the
      // verse, the bridge and every sting are built from
      var HOOK1 = '0:F5:2 3:Bb5:2 6:A5:1 7:Bb5:1 8:D6:3 11:C6:1 12:Bb5:4';
      var HOOK2 = '2:G5:2 4:Bb5:2 6:G5:1 7:F5:3 10:Eb5:2 12:D5:1 13:Eb5:1 14:E5:1 15:F5:5';
      var HOOK2B = '2:G5:2 4:Bb5:2 6:G5:1 7:F5:3 10:Eb5:2 12:D5:2 14:C5:2';
      // the horns' answer: the hook's head upside down, in its rhythm, a beat late
      var ANSWER1 = '4:D6:2:.9 7:Bb5:2:.85 10:C6:1:.8 11:Bb5:1:.8 12:G5:4:.9:f';
      var ANSWER2 = '0:E5:2:.8 2:G5:2:.8 4:Bb5:2:.85 6:C6:2:.9 8:C6:1:.85:s 9:A5:1:.8 10:C6:2:.9 12:Eb6:4:.95:f';
      var BARS = [
        // the intro: the countdown (two bars, 3 s). The horns swell on the dominant, then play the hook's head into GO.
        { sec: 'intro', ch: 'F7sus', bass: 'pedal', drums: 'intro1', clav: 'skank', brass: '0:Eb5:16:.7:w' },
        { sec: 'intro', ch: '0:F7sus 8:F7', bass: 'pedal2', drums: 'intro2', clav: 'skank', brass: '0:F5:2:.85 3:Bb5:2:.85 6:A5:1:.8 7:Bb5:1:.85 8:C6:6:.95:d' },
        // A, the verse: a call in the hook's rhythm (up the chord to its flat seventh), the horns' "bap, ba-DAH" back;
        // the second call is the first a fourth up, then a run down to the turnaround
        { sec: 'A', ch: 'Bb7', bass: 'A', drums: 'A', clav: 'skank', crash: 1, lead: '0:Bb4:2 3:D5:2 6:F5:2 8:Ab5:2 10:G5:1 11:F5:3' },
        { sec: 'A', ch: 'Bb7', bass: 'A', drums: 'A', clav: 'skank', brass: '2:F5:1:.8:s 4:F5:2:.85 10:Ab5:1:.8:s 12:Bb5:3:.9:f' },
        { sec: 'A', ch: 'Eb9', bass: 'A', drums: 'A', clav: 'skank', lead: '0:Eb5:2 3:G5:2 6:Bb5:2 8:Db6:2 10:C6:1 11:Bb5:3' },
        { sec: 'A', ch: 'Eb9', bass: 'A', drums: 'A', clav: 'skank', brass: '2:Bb5:1:.8:s 4:Bb5:2:.85 10:Db6:1:.8:s 12:Eb6:3:.9:f' },
        { sec: 'A', ch: 'Bb7', bass: 'A', drums: 'A', clav: 'skank', lead: '0:F5:1 1:G5:1 2:Ab5:2 4:G5:1 5:F5:1 6:D5:2 8:Bb4:2 10:D5:2 12:F5:4' },
        { sec: 'A', ch: 'G7', bass: 'A', drums: 'A', clav: 'skank', lead: '2:D5:2 4:F5:2 6:G5:1 7:Ab5:1 8:G5:2 10:F5:2 12:D5:2 14:B4:2' },
        { sec: 'A', ch: '0:Cm7 8:F7', bass: 'A', drums: 'A', clav: 'skank', lead: '0:C5:2 2:Eb5:2 4:G5:2 6:Bb5:3 9:A5:1 10:G5:2 12:F5:2 14:Eb5:2' },
        { sec: 'A', ch: 'Bb7', bass: 'A', drums: 'A', clav: 'skank', fill: 'snare', lead: '0:D5:4', brass: '6:F5:1:.8:s 8:Ab5:2:.85 10:G5:1:.8 11:F5:1:.8 12:Ab5:2:.85 14:Bb5:2:.95:d' },
        // B, the pre-chorus: long notes climbing over a bass that rises, the horns swelling under; then stop-time
        // hits on the hook's rhythm (0, 3, 6) and a chromatic run up into the hook's first note
        { sec: 'B', ch: 'Ebmaj7', bass: 'B', drums: 'B', clav: 'push', crash: 1, lead: '0:G5:6 6:F5:2 8:G5:4 12:Bb5:4', brass: '0:D5:16:.6:w' },
        { sec: 'B', ch: 'Edim7', bass: 'B', drums: 'B', clav: 'push', lead: '0:Bb5:6 6:G5:2 8:Bb5:4 12:Db6:4', brass: '0:Db5:16:.62:w' },
        { sec: 'B', ch: '0:Dm7 8:G7', bass: 'B', drums: 'B', clav: 'push', lead: '0:D6:6 6:C6:2 8:B5:4 12:D6:4', brass: '0:C5:8:.62:w 8:B4:8:.66:w' },
        { sec: 'B', ch: '0:Cm7 8:F7', bass: 'stop', drums: 'stop', clav: 'stop', lead: '0:G5:2 3:Bb5:2 6:C6:2 12:C5:1 13:D5:1 14:Eb5:1 15:E5:1', brass: '0:G5:2:.95:s 3:Bb5:2:.95:s 6:C6:2:.95 8:A5:4:.85:d' },
        // C, the chorus: the hook, the horns' answer; the hook, and a run up to the tonic over horn hits
        { sec: 'C', ch: 'Bb6', bass: 'C', drums: 'C', clav: 'skank', crash: 1, lead: HOOK1 },
        { sec: 'C', ch: 'Ebmaj7', bass: 'C', drums: 'C', clav: 'skank', lead: HOOK2 },
        { sec: 'C', ch: 'Gm7', bass: 'C', drums: 'C', clav: 'skank', brass: ANSWER1 },
        { sec: 'C', ch: '0:C7 8:F7', bass: 'C', drums: 'C', clav: 'skank', fill: 'toms', brass: ANSWER2 },
        { sec: 'C', ch: 'Bb6', bass: 'C', drums: 'C', clav: 'skank', crash: 3, lead: HOOK1 },
        { sec: 'C', ch: 'Ebmaj7', bass: 'C', drums: 'C', clav: 'skank', lead: HOOK2B },
        { sec: 'C', ch: '0:Cm7 8:F7', bass: 'C', drums: 'C', clav: 'skank', lead: '0:G5:2 2:Bb5:2 4:C6:2 6:Eb6:2 8:D6:2 10:C6:2 12:A5:2 14:C6:2',
          brass: '0:Eb5:1:.85:s 3:Eb5:1:.85:s 6:Eb5:2:.85 8:C5:1:.85:s 11:C5:1:.85:s 14:Eb5:2:.9' },
        { sec: 'C', ch: 'Bb6', bass: 'C', drums: 'C', clav: 'skank', fill: 'snare', lead: '0:Bb5:3 3:D6:3 6:Bb5:2', brass: '0:D5:3:.9:s 3:F5:3:.9:s 6:D5:2:.9:s 8:F5:2:.85 11:F5:1:.8 12:Gb5:2:.85 14:G5:2:.9' },
        // D, the bridge: a breakdown (the drums down to kick, claps and cowbell; the slap bass busy) where the lead and
        // the horns trade the hook's head in G minor and C minor; then the build, the head climbing a step a bar over
        // the horns swelling, the snare doubling up, a slide whistle and a roll into the chorus
        { sec: 'D', ch: 'Gm7', bass: 'D', drums: 'D', clav: 'chop', crash: 1, lead: '0:D5:2 3:G5:2 6:F#5:1 7:G5:1 8:Bb5:3 11:A5:1 12:G5:4' },
        { sec: 'D', ch: 'Gm7', bass: 'D', drums: 'D', clav: 'chop', brass: '2:D5:1:.8:s 4:F5:2:.85 10:Bb5:1:.8:s 12:D6:3:.9:f' },
        { sec: 'D', ch: 'Cm7', bass: 'D', drums: 'D', clav: 'chop', lead: '0:G5:2 3:C6:2 6:B5:1 7:C6:1 8:Eb6:3 11:D6:1 12:C6:4' },
        { sec: 'D', ch: 'F7', bass: 'D', drums: 'D', clav: 'chop', brass: '2:F5:1:.8:s 4:A5:2:.85 10:C6:1:.8:s 12:Eb6:3:.9:f' },
        { sec: 'E', ch: 'Ebmaj7', bass: 'build', drums: 'E1', clav: 'beat', crash: 1, lead: '0:Eb5:2 3:G5:2 6:F5:1 7:G5:1 8:Bb5:4', brass: '0:G5:16:.6:w' },
        { sec: 'E', ch: 'Dm7', bass: 'build', drums: 'E2', clav: 'beat', lead: '0:F5:2 3:A5:2 6:G5:1 7:A5:1 8:C6:4', brass: '0:A5:16:.65:w' },
        { sec: 'E', ch: 'Cm7', bass: 'build', drums: 'E3', clav: 'beat', lead: '0:G5:2 3:Bb5:2 6:A5:1 7:Bb5:1 8:D6:4 12:C6:2 14:D6:2', brass: '0:Bb5:16:.7:w' },
        { sec: 'E', ch: '0:F7sus 8:F7', bass: 'build', drums: 'roll', clav: 'beat', fx: 'slide', brass: '0:C6:8:.8:w 8:Eb6:2:.9:s 10:D6:2:.9:s 12:C6:2:.9:s 14:A5:2:.95' },
        // C', the chorus once more, its first half: the hook, the answer, and the turnaround back to the verse
        { sec: 'T', ch: 'Bb6', bass: 'C', drums: 'C', clav: 'skank', crash: 1, lead: HOOK1 },
        { sec: 'T', ch: 'Ebmaj7', bass: 'C', drums: 'C', clav: 'skank', lead: HOOK2 },
        { sec: 'T', ch: 'Gm7', bass: 'C', drums: 'C', clav: 'skank', brass: ANSWER1 },
        { sec: 'T', ch: '0:C7 8:F7', bass: 'C', drums: 'C', clav: 'skank', fill: 'toms', brass: ANSWER2 },
      ];
      var LOOP_START = 2, CHORUS = 14;

      // the bass: a line per section over the chord's root. R the root, 8 its octave (popped), 5 3 7 the chord's
      // fifth, third and (flat) seventh, +n n semitones over the root, ap a half step under the next bar's root.
      // Articulations: p a pop (the octave, finger snapped), g a ghost (a dead, muted note).
      var BASS = {
        A: '0:2:R:1 3:1:R:.45:g 4:1:8:.9:p 6:2:R:.85 8:1:R:.5:g 9:2:7:.8 11:1:8:.9:p 12:2:5:.85 14:2:ap:.8',
        B: '0:2:R:1 2:2:8:.85:p 4:2:R:.9 6:2:8:.85:p 8:2:R:.9 10:2:5:.85 12:2:8:.85:p 14:2:ap:.85',
        C: '0:2:R:1 2:1:R:.45:g 3:2:5:.8 5:1:8:.9:p 6:2:R:.85 8:2:R:.95 10:1:8:.9:p 11:1:7:.75 12:2:5:.85 14:2:ap:.8',
        D: '0:2:R:1 2:1:8:.9:p 3:1:R:.4:g 4:1:R:.85 5:1:7:.8 6:1:8:.9:p 7:1:3:.75 8:2:R:.95 10:1:8:.9:p 11:1:7:.8 12:1:5:.85 13:1:R:.4:g 14:1:8:.9:p 15:1:ap:.8',
        build: '0:2:R:1 2:2:R:.75 4:2:8:.8:p 6:2:R:.8 8:2:R:.9 10:2:R:.8 12:2:8:.85:p 14:2:ap:.85',
        pedal: '0:2:R:.9 2:2:R:.6 4:2:8:.8:p 6:2:R:.7 8:2:R:.9 10:2:R:.6 12:2:8:.8:p 14:2:R:.7',
        pedal2: '0:2:R:.9 2:2:R:.6 4:2:8:.8:p 6:2:R:.7 8:2:R:.9 10:2:+2:.8 12:2:+3:.85 14:2:ap:.9',
        stop: '0:2:R:1 3:2:R:1 6:2:R:1 8:2:R:.95 10:2:8:.85:p 12:2:+2:.85 14:2:ap:.9',
      };
      // the clavinet: chords chopped short ("step" or "step:velocity" or "step:velocity:length")
      var CLAV = {
        skank: '2 3:.45 6 10 11:.45 14',
        push: '2 6 7:.5 10 14 15:.5',
        chop: '0:.6 2 6 8:.5 10 13:.5 14',
        beat: '0:1:2 4:.8:2 8:1:2 12:.8:2',
        stop: '0:1:2 3:1:2 6:1:2',
      };
      // the drums: "step:drum:velocity[:lap]", the lap the hit joins at (the start screen, 0, hears only the kick, the
      // claps and the cowbell). Hats, shakers and rolls are written out by the helpers under it.
      function row(steps, drum, vel, lap) { return steps.map(function (s) { return s + ':' + drum + ':' + vel + (lap ? ':' + lap : ''); }).join(' '); }
      function ramp(steps, drum, v0, v1, lap) { return steps.map(function (s, i) { return s + ':' + drum + ':' + (v0 + (v1 - v0) * i / Math.max(1, steps.length - 1)).toFixed(2) + (lap ? ':' + lap : ''); }).join(' '); }
      var EIGHTHS = [0, 2, 4, 6, 8, 10, 12, 14], OFFS = [2, 6, 10, 14], ODD = [1, 3, 5, 7, 9, 11, 13, 15], ALL = EIGHTHS.concat(ODD).sort(function (a, b) { return a - b; });
      var DRUMS = {
        intro1: [row([0, 4, 8, 12], 'kick', 0.85), row(OFFS, 'hat', 0.6), row([4, 12], 'clap', 0.5), row(ODD, 'shaker', 0.3)].join(' '),
        intro2: [row([0, 4], 'kick', 0.9), row([2, 6], 'hat', 0.6), ramp([8, 9, 10, 11, 12, 13, 14, 15], 'snare', 0.35, 1), row([8], 'kick', 0.8)].join(' '),
        A: ['0:kick:1 7:kick:.7 10:kick:.9', '4:snare:1 12:snare:1 9:snare:.2 15:snare:.25:2', row([4, 12], 'clap', 0.55),
          row([0, 4, 8, 12], 'hat', 0.45), row(OFFS, 'hat', 0.7), row(ODD, 'hat', 0.22, 2), '14:ohat:.4:2', row([0, 6, 12], 'cowbell', 0.5, 2), row(ODD, 'shaker', 0.28, 2)].join(' '),
        B: [row([0, 4, 8, 12], 'kick', 0.95), row([4, 12], 'snare', 1), row([4, 12], 'clap', 0.6), row([0, 4, 8, 12], 'hat', 0.4), row(OFFS, 'ohat', 0.42),
          row([4, 12], 'tamb', 0.6, 2), row(ODD, 'shaker', 0.28, 2)].join(' '),
        C: ['0:kick:1 6:kick:.75 8:kick:.95 11:kick:.6', row([4, 12], 'snare', 1), row([4, 12], 'clap', 0.65), row(EIGHTHS, 'hat', 0.55), row(ODD, 'hat', 0.26),
          '0:cowbell:.45 3:cowbell:.4 6:cowbell:.5 10:cowbell:.45 12:cowbell:.4', row([4, 12], 'tamb', 0.6, 2), '14:ohat:.4:2', '7:snare:.18:2'].join(' '),
        D: ['0:kick:1 10:kick:.85', row([4, 12], 'clap', 0.85), '0:cowbell:.55 3:cowbell:.5 6:cowbell:.6 10:cowbell:.55 12:cowbell:.5', '7:rim:.5 15:rim:.4',
          row(ALL, 'shaker', 0.2, 2)].join(' '),
        E1: [row([0, 4, 8, 12], 'kick', 0.9), ramp(EIGHTHS, 'snare', 0.22, 0.45), row([4, 12], 'tamb', 0.55), row([4, 12], 'clap', 0.4)].join(' '),
        E2: [row([0, 4, 8, 12], 'kick', 0.9), ramp(EIGHTHS, 'snare', 0.4, 0.62), row([4, 12], 'tamb', 0.6), row([4, 12], 'clap', 0.45)].join(' '),
        E3: [row([0, 4, 8, 12], 'kick', 0.92), ramp(ALL, 'snare', 0.35, 0.72), row([4, 12], 'tamb', 0.65)].join(' '),
        roll: [row([0, 4, 8], 'kick', 0.95), ramp(ALL.slice(0, 12), 'snare', 0.5, 0.9), '12:tom:.85 13:tom:.8 14:tom2:.9 15:tom2:.95 12:kick:.9 14:kick:.9'].join(' '),
        stop: ['0:kick:1 3:kick:1 6:kick:1 0:snare:.85 3:snare:.85 6:snare:.9 0:crash:.55 6:crash:.45 8:kick:.85', ramp([10, 11, 12, 13, 14, 15], 'snare', 0.55, 1),
          '12:tom:.6:3 14:tom2:.7:3'].join(' '),
      };
      // fills: the second half of a section's last bar
      var FILLS = {
        snare: '8:kick:.9 8:hat:.5 10:snare:.7 12:snare:.85 13:snare:.6 14:snare:.9 15:snare:1 14:tom2:.6:3',
        toms: '8:kick:.9 8:snare:.8 10:tom:.8 11:tom:.75 12:tom:.85 13:tom2:.8 14:tom2:.9 14:kick:.8 15:snare:1',
      };

      /* --------------------------------------------------------- the parser -- */
      function parseLine(s, defVel) {
        if (!s) return [];
        return s.trim().split(/\s+/).map(function (tok) {
          var p = tok.split(':');
          return { s: +p[0], m: note(p[1]), d: +p[2], v: p[3] ? +p[3] : defVel, a: p[4] || '' };
        });
      }
      function parseChords(s) {
        if (s.indexOf(':') < 0) return [{ s: 0, c: chord(s) }];
        return s.trim().split(/\s+/).map(function (tok) { var p = tok.split(':'); return { s: +p[0], c: chord(p[1]) }; });
      }
      function chordAt(chs, step) { var c = chs[0].c; for (var i = 0; i < chs.length; i++) if (chs[i].s <= step) c = chs[i].c; return c; }
      // a root in the bass's octave: G1 (31) to F#2 (42)
      function bassRoot(pc) { var m = 24 + pc; while (m < 31) m += 12; while (m > 42) m -= 12; return m; }

      // the horns' harmony under a top note: the chord's tones below it, close (a whole step apart at least); a note
      // outside the chord is planed (the same shape slid with it)
      function harmonise(top, c, n) {
        var out = [], inChord = c.pcs.indexOf(((top % 12) + 12) % 12) >= 0, cur = top;
        if (!inChord) { [-3, -7, -12].slice(0, n - 1).forEach(function (iv) { out.push(top + iv); }); return out; }
        for (var k = 1; k < n; k++) {
          var m = cur - 2;
          while (c.pcs.indexOf(((m % 12) + 12) % 12) < 0 && m > cur - 12) m--;
          // the fourth horn, on the final lap, is the trombone: the top an octave down
          if (k === 3) m = top - 12;
          out.push(m); cur = m;
        }
        return out;
      }
      // the clavinet's voicing: three of the chord's tones (its root left to the bass when it has four or more) between
      // Bb3 and E5, the one closest to the voicing before it
      function voicings(c) {
        var pcs = c.pcs.length >= 4 ? c.pcs.filter(function (p) { return p !== c.root; }).slice(0, 3) : c.pcs.slice(), out = [];
        for (var r = 0; r < pcs.length; r++) {
          var rot = pcs.slice(r).concat(pcs.slice(0, r));
          for (var base = 58; base <= 66; base++) {
            if (((base % 12) + 12) % 12 !== rot[0]) continue;
            var v = [base], ok = true;
            for (var i = 1; i < rot.length; i++) { var m = v[i - 1] + 1; while ((m % 12) !== rot[i]) m++; v.push(m); }
            if (v[v.length - 1] > 77) ok = false;
            if (ok) out.push(v);
          }
        }
        return out;
      }
      function nearest(list, prev) {
        var best = list[0], bd = 1e9;
        list.forEach(function (v) { var d = 0; for (var i = 0; i < v.length; i++) d += Math.abs(v[i] - (prev[i] || prev[prev.length - 1])); d += Math.abs(v[0] + v[v.length - 1] - 132) * 0.3; if (d < bd) { bd = d; best = v; } });
        return best;
      }

      // Every bar as events, once: { s step, p part, m midi (Bb), d length in steps, v velocity, a articulation,
      // k drum, l the lap it joins at, u the last lap it plays in }. The scheduler only transposes and times them.
      var SONG = (function () {
        var bars = [], prevVoice = [62, 65, 69];
        BARS.forEach(function (B, bi) {
          var chs = parseChords(B.ch), ev = [], next = BARS[bi + 1 >= BARS.length ? LOOP_START : bi + 1];
          var chorusLike = B.sec === 'C' || B.sec === 'T', nextRoot = parseChords(next.ch)[0].c.root;
          // the lead, the whistle an octave over it in the chorus from lap 2, the horns doubling it an octave under on
          // the final lap (the chorus and the build)
          var lead = parseLine(B.lead, 0.9), prevEnd = -1, prevM = 0;
          lead.forEach(function (n) {
            var glide = n.a === 'g' || (prevEnd === n.s && Math.abs(n.m - prevM) <= 2 && n.d <= 2);
            ev.push({ s: n.s, p: 'lead', m: n.m, d: n.d, v: n.v, a: glide ? 'g' : '', from: glide ? prevM : 0, l: 0 });
            if (chorusLike) ev.push({ s: n.s, p: 'whistle', m: n.m + 12, d: n.d, v: n.v, l: 2 });
            if (chorusLike || B.sec === 'E') ev.push({ s: n.s, p: 'brass', m: n.m - 12, d: n.d, v: n.v * 0.45, a: '', l: 3, voice: 0, dbl: 1 });
            prevEnd = n.s + n.d; prevM = n.m;
          });
          // the horns: the written top line and its harmony, two horns, a third from lap 2, the trombone on the last
          parseLine(B.brass, 0.85).forEach(function (n) {
            var c = chordAt(chs, n.s), below = harmonise(n.m, c, 4);
            ev.push({ s: n.s, p: 'brass', m: n.m, d: n.d, v: n.v, a: n.a, l: 0, voice: 0 });
            ev.push({ s: n.s, p: 'brass', m: below[0], d: n.d, v: n.v * 0.9, a: n.a, l: 0, voice: 1 });
            ev.push({ s: n.s, p: 'brass', m: below[1], d: n.d, v: n.v * 0.85, a: n.a, l: 2, voice: 2 });
            if (below[2] >= 55) ev.push({ s: n.s, p: 'brass', m: below[2], d: n.d, v: n.v * 0.65, a: n.a, l: 3, voice: 3 });
            // the piano under the horns' stabs from lap 2 (not under a swell)
            if (n.a !== 'w') { ev.push({ s: n.s, p: 'piano', m: n.m, d: Math.min(n.d, 3), v: n.v * 0.8, l: 2 }); ev.push({ s: n.s, p: 'piano', m: below[0], d: Math.min(n.d, 3), v: n.v * 0.7, l: 2 }); }
          });
          // the bass
          (BASS[B.bass] || '').trim().split(/\s+/).forEach(function (tok) {
            var p = tok.split(':'), s = +p[0], c = chordAt(chs, s), r = bassRoot(c.root), iv = p[2], m;
            if (iv === 'R') m = r; else if (iv === '8') m = r + 12; else if (iv === '5') m = r + c.fifth; else if (iv === '3') m = r + c.third; else if (iv === '7') m = r + c.seventh;
            else if (iv === 'ap') { var t = bassRoot(nextRoot); m = t === r ? r + 12 : t - 1; if (m < 29) m += 12; }
            else m = r + (+iv);
            ev.push({ s: s, p: 'bass', m: m, d: +p[1], v: +p[3], a: p[4] || (iv === '8' ? 'p' : ''), l: 0 });
          });
          // the clavinet
          (CLAV[B.clav] || '').trim().split(/\s+/).forEach(function (tok) {
            if (!tok) return;
            var p = tok.split(':'), s = +p[0], c = chordAt(chs, s), v = nearest(voicings(c), prevVoice); prevVoice = v;
            ev.push({ s: s, p: 'clav', ms: v, d: p[2] ? +p[2] : 1, v: p[1] ? +p[1] : 0.9, l: 0 });
          });
          // the drums, the section's last bar filled, a crash on a section's first bar
          var fill = B.fill ? FILLS[B.fill] : null;
          DRUMS[B.drums].trim().split(/\s+/).forEach(function (tok) {
            var p = tok.split(':'), s = +p[0];
            if (fill && s >= 8 && p[1] !== 'cowbell') return;
            ev.push({ s: s, p: 'drums', k: p[1], v: +p[2], l: p[3] ? +p[3] : (p[1] === 'kick' || p[1] === 'clap' || p[1] === 'cowbell' || p[1] === 'crash' ? 0 : 1) });
          });
          if (fill) fill.trim().split(/\s+/).forEach(function (tok) { var p = tok.split(':'); ev.push({ s: +p[0], p: 'drums', k: p[1], v: +p[2], l: p[3] ? +p[3] : 1 }); });
          if (B.crash) ev.push({ s: 0, p: 'drums', k: 'crash', v: 0.7, l: B.crash });
          if (B.fx === 'slide') ev.push({ s: 0, p: 'fx', k: 'slide', m: note('F5'), d: 12, v: 0.8, l: 1 });
          ev.sort(function (a, b) { return a.s - b.s; });
          bars.push({ sec: B.sec, chords: chs, ev: ev });
        });
        return bars;
      })();

      /* -------------------------------------------------------- instruments -- */
      // a kit per AudioContext: shared noise, waves, a plate and the lead's echo
      // (a kit for a bar rendered ahead shares the score's noise: from)
      function kit(ac, from) {
        var nb = from ? from.noise : null;
        if (!nb) { var sr = ac.sampleRate, ch, R = rng(7); nb = ac.createBuffer(1, sr, sr); ch = nb.getChannelData(0); for (var i = 0; i < ch.length; i++) ch[i] = R() * 2 - 1; }
        function pulse(duty) { var N = 40, re = new Float32Array(N), im = new Float32Array(N); for (var h = 1; h < N; h++) im[h] = (2 / (h * Math.PI)) * Math.sin(h * Math.PI * duty); return ac.createPeriodicWave(re, im); }
        return { ac: ac, noise: nb, pulse25: pulse(0.25), pulse50: pulse(0.5) };
      }
      // (every source the score schedules is kept with its start, K.q, while it is being scheduled, so one not yet
      // sounding can be taken back: see the player's cut())
      function osc(K, type, f, t) { var o = K.ac.createOscillator(); if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type); o.frequency.setValueAtTime(f, t); if (K.q) K.q.push([t, o]); return o; }
      function gain(K, v) { var g = K.ac.createGain(); g.gain.value = v === undefined ? 1 : v; return g; }
      function filt(K, type, f, q) { var b = K.ac.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q !== undefined) b.Q.value = q; return b; }
      function noise(K, t, dur) { var s = K.ac.createBufferSource(); s.buffer = K.noise; s.loop = true; s.start(t, (t * 7.31) % 0.9, dur + 0.05); if (t + dur + 0.05 > ENDT) ENDT = t + dur + 0.05; if (K.q) K.q.push([t, s]); return s; }
      // (ENDT: the latest a source made stops at, so a bar rendered ahead is kept only as long as it sounds)
      var ENDT = 0;
      function stop(nodes, when) { if (when > ENDT) ENDT = when; nodes.forEach(function (o) { try { o.stop(when); } catch (e) { } }); }

      // the lead: a pulse and a saw, a bright filter that settles, a scoop up into a note it does not glide to, and a
      // vibrato that comes in on the long notes. Bright on purpose: it is what a phone's speaker has to carry.
      function lead(K, out, t, f, dur, vel, from) {
        if (K.w && (t < K.w[0] || t >= K.w[1])) return;
        var end = t + dur, a = osc(K, K.pulse25, f, t), b = osc(K, 'sawtooth', f, t), bm = gain(K, 0.5), lp = filt(K, 'lowpass', 4000, 1.6), g = gain(K, 0), nodes = [a, b];
        b.detune.value = 8;
        lp.frequency.setValueAtTime(Math.min(8000, f * 9), t); lp.frequency.setTargetAtTime(Math.min(5200, f * 4.6), t + 0.01, 0.12);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3 * vel, t + 0.006); g.gain.setTargetAtTime(0.22 * vel, t + 0.006, 0.18); g.gain.setTargetAtTime(0, end, 0.04);
        if (from) { [a, b].forEach(function (o) { o.frequency.setValueAtTime(mtof(from), t); o.frequency.exponentialRampToValueAtTime(f, t + 0.045); }); }
        else { [a, b].forEach(function (o) { o.detune.setValueAtTime(o.detune.value - 40, t); o.detune.linearRampToValueAtTime(o === b ? 8 : 0, t + 0.04); }); }
        if (dur > 0.28) {
          var l = osc(K, 'sine', 5.8, t), lg = gain(K, 0); lg.gain.setValueAtTime(0, t + 0.16); lg.gain.linearRampToValueAtTime(16, t + 0.4);
          l.connect(lg); lg.connect(a.detune); lg.connect(b.detune); nodes.push(l);
        }
        a.connect(lp); b.connect(bm); bm.connect(lp); lp.connect(g); g.connect(out);
        nodes.forEach(function (o) { o.start(t); }); stop(nodes, end + 0.3);
      }
      // the whistle: a sine with a breathy edge and a quick vibrato, the lead an octave up
      function whistle(K, out, t, f, dur, vel) {
        if (K.w && (t < K.w[0] || t >= K.w[1])) return;
        var end = t + dur, a = osc(K, 'sine', f, t), g = gain(K, 0), l = osc(K, 'sine', 6.4, t), lg = gain(K, 9);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22 * vel, t + 0.025); g.gain.setTargetAtTime(0, end, 0.04);
        l.connect(lg); lg.connect(a.detune); a.connect(g); g.connect(out); a.start(t); l.start(t); stop([a, l], end + 0.25);
      }
      // a horn: an FM pair (the brightness rising with the blow, as brass does) and a saw through a filter that opens
      // and settles; a scoop into the note; a fall, a doit, a swell or a rip as written
      function horn(K, out, t, f, dur, vel, art) {
        if (K.w && (t < K.w[0] || t >= K.w[1])) return;
        if (art === 's') dur = Math.min(dur, 0.13);
        var end = t + dur, car = osc(K, 'sine', f, t), mod = osc(K, 'sine', f, t), mg = gain(K, 0), saw = osc(K, 'sawtooth', f, t), sg = gain(K, 0.55), cg = gain(K, 0.7);
        var lp = filt(K, 'lowpass', f * 3, 1.1), g = gain(K, 0), bend = K.ac.createConstantSource ? K.ac.createConstantSource() : null, nodes = [car, mod, saw];
        var peak = 0.16 * (0.55 + 0.45 * vel), att = art === 'w' ? dur * 0.7 : 0.025, open = art === 'w' ? att : 0.04;
        mg.gain.setValueAtTime(f * 0.4, t); mg.gain.linearRampToValueAtTime(f * (1.6 + 1.6 * vel), t + open); mg.gain.setTargetAtTime(f * 1.3, t + open, 0.2);
        lp.frequency.setValueAtTime(f * 1.3, t); lp.frequency.linearRampToValueAtTime(Math.min(9000, f * (4.5 + 3 * vel)), t + open); lp.frequency.setTargetAtTime(Math.min(7000, f * 3.4), t + open, 0.18);
        g.gain.setValueAtTime(0, t);
        if (art === 'w') { g.gain.linearRampToValueAtTime(peak * 0.15, t + 0.04); g.gain.linearRampToValueAtTime(peak, t + att); }
        else { g.gain.linearRampToValueAtTime(peak, t + att); g.gain.setTargetAtTime(peak * 0.78, t + att, 0.12); }
        if (bend) {
          nodes.push(bend); if (K.q) K.q.push([t, bend]); bend.offset.setValueAtTime(art === 'r' ? -900 : -45, t); bend.offset.linearRampToValueAtTime(0, t + (art === 'r' ? 0.1 : 0.045));
          if (art === 'f') { bend.offset.setValueAtTime(0, end - 0.03); bend.offset.linearRampToValueAtTime(-700, end + 0.2); }
          if (art === 'd') { bend.offset.setValueAtTime(0, end - 0.05); bend.offset.linearRampToValueAtTime(600, end + 0.16); }
          bend.connect(car.detune); bend.connect(mod.detune); bend.connect(saw.detune);
        }
        g.gain.setTargetAtTime(0, end + (art === 'f' || art === 'd' ? 0.1 : 0), art === 'f' || art === 'd' ? 0.07 : 0.045);
        mod.connect(mg); mg.connect(car.frequency); car.connect(cg); cg.connect(lp); saw.connect(sg); sg.connect(lp); lp.connect(g); g.connect(out);
        nodes.forEach(function (o) { o.start(t); }); stop(nodes, end + 0.45);
      }
      // the clavinet: a pulse per note through one quacking filter (the envelope's "wow"), short and dry
      function clav(K, out, t, fs, dur, vel) {
        if (K.w && (t < K.w[0] || t >= K.w[1])) return;
        var end = t + dur, hp = filt(K, 'highpass', 330, 0.7), lp = filt(K, 'lowpass', 3000, 4.5), g = gain(K, 0), nodes = [];
        fs.forEach(function (f) { var o = osc(K, K.pulse25, f, t); o.connect(hp); nodes.push(o); });
        lp.frequency.setValueAtTime(5200, t); lp.frequency.setTargetAtTime(1100, t + 0.004, 0.05);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.08 * vel, t + 0.003); g.gain.setTargetAtTime(0.05 * vel, t + 0.004, 0.04); g.gain.setTargetAtTime(0, end, 0.02);
        hp.connect(lp); lp.connect(g); g.connect(out);
        nodes.forEach(function (o) { o.start(t); }); stop(nodes, end + 0.15);
      }
      // a bright piano: an FM attack, the octave over it, dying away
      function piano(K, out, t, f, dur, vel) {
        if (K.w && (t < K.w[0] || t >= K.w[1])) return;
        var end = t + dur, car = osc(K, 'sine', f, t), mod = osc(K, 'sine', f * 2, t), mg = gain(K, 0), o2 = osc(K, 'triangle', f * 2, t), g2 = gain(K, 0.18), g = gain(K, 0);
        mg.gain.setValueAtTime(f * 2.4 * vel, t); mg.gain.setTargetAtTime(f * 0.3, t, 0.08);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16 * vel, t + 0.003); g.gain.setTargetAtTime(0, t + 0.004, 0.35); g.gain.setTargetAtTime(0, end, 0.06);
        mod.connect(mg); mg.connect(car.frequency); car.connect(g); o2.connect(g2); g2.connect(g); g.connect(out);
        [car, mod, o2].forEach(function (o) { o.start(t); }); stop([car, mod, o2], end + 0.4);
      }
      // the slap bass: a sine for the floor and a saw through a resonant filter that snaps shut; a thumb slap's click
      // on a loud note, a pop (the octave, brighter, shorter), a ghost (dead, muted, all click)
      function bass(K, out, t, f, dur, vel, art) {
        if (K.w && (t < K.w[0] || t >= K.w[1])) return;
        var end = t + dur, nodes = [], g = gain(K, 0), lp = filt(K, 'lowpass', 400, art === 'p' ? 2.5 : 4);
        if (art === 'g') {
          var s0 = osc(K, 'sawtooth', f, t); lp.frequency.value = 520; lp.Q.value = 1;
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3 * vel, t + 0.002); g.gain.setTargetAtTime(0, t + 0.003, 0.018);
          s0.connect(lp); lp.connect(g); g.connect(out); s0.start(t); stop([s0], t + 0.12); return;
        }
        var sub = osc(K, 'sine', f, t), sw = osc(K, art === 'p' ? 'square' : 'sawtooth', f, t), sm = gain(K, 0.6), subg = gain(K, art === 'p' ? 0.25 : 0.35);
        lp.frequency.setValueAtTime(Math.min(6000, f * (art === 'p' ? 22 : 20)), t); lp.frequency.setTargetAtTime(f * (art === 'p' ? 7 : 6), t + 0.006, art === 'p' ? 0.05 : 0.08);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5 * (0.55 + 0.45 * vel), t + 0.004); g.gain.setTargetAtTime(0.32 * (0.55 + 0.45 * vel), t + 0.005, art === 'p' ? 0.09 : 0.2); g.gain.setTargetAtTime(0, end - 0.015, 0.03);
        sub.connect(subg); subg.connect(g); sw.connect(sm); sm.connect(lp); lp.connect(g); g.connect(out); nodes.push(sub, sw);
        if (vel > 0.8 || art === 'p') {
          var z = noise(K, t, 0.03), zf = filt(K, 'highpass', art === 'p' ? 3200 : 2200, 0.8), zg = gain(K, 0);
          zg.gain.setValueAtTime(0.22 * vel, t); zg.gain.setTargetAtTime(0, t + 0.001, 0.005); z.connect(zf); zf.connect(zg); zg.connect(out);
        }
        nodes.forEach(function (o) { o.start(t); }); stop(nodes, end + 0.2);
      }
      // the slide whistle: a sine swooping up an octave, with the wobble of a hand on the slide
      function slide(K, out, t, f, dur, vel) {
        if (K.w && (t < K.w[0] || t >= K.w[1])) return;
        var end = t + dur, a = osc(K, 'sine', f, t), g = gain(K, 0), l = osc(K, 'sine', 7, t), lg = gain(K, 18);
        a.frequency.setValueAtTime(f, t); a.frequency.exponentialRampToValueAtTime(f * 2, end);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18 * vel, t + 0.08); g.gain.setTargetAtTime(0, end - 0.04, 0.05);
        l.connect(lg); lg.connect(a.detune); a.connect(g); g.connect(out); a.start(t); l.start(t); stop([a, l], end + 0.3);
      }
      // the drums: one hit each
      function drum(K, out, k, t, vel, tr) {
        if (K.w && (t < K.w[0] || t >= K.w[1])) return;
        function thump(f0, f1, tau, lvl, wave, ptau) { var o = osc(K, wave || 'sine', f0, t), og = gain(K, 0); o.frequency.setTargetAtTime(f1, t, ptau || tau * 0.3); og.gain.setValueAtTime(lvl * vel, t); og.gain.setTargetAtTime(0, t + 0.002, tau); o.connect(og); og.connect(out); o.start(t); stop([o], t + tau * 7); }
        function hiss(type, f0, q, tau, lvl, dur, f2) { var z = noise(K, t, dur || tau * 6), bf = filt(K, type, f0, q), zg = gain(K, 0); zg.gain.setValueAtTime(lvl * vel, t); zg.gain.setTargetAtTime(0, t + 0.001, tau); z.connect(bf); if (f2) { var b2 = filt(K, 'highpass', f2, 0.7); bf.connect(b2); b2.connect(zg); } else bf.connect(zg); zg.connect(out); }
        switch (k) {
          case 'kick': thump(165, 58, 0.12, 0.8, 'sine', 0.024); hiss('highpass', 3000, 0.7, 0.005, 0.5); hiss('bandpass', 1800, 1, 0.01, 0.25); break;
          case 'snare': hiss('bandpass', 2400, 0.7, 0.085, 0.75, 0, 1000); hiss('highpass', 6000, 0.7, 0.05, 0.35); thump(205, 180, 0.055, 0.4, 'triangle'); break;
          case 'clap': (function () { var z = noise(K, t, 0.3), bf = filt(K, 'bandpass', 1350, 1.4), zg = gain(K, 0), p = zg.gain;
            p.setValueAtTime(0, t); [0, 0.009, 0.019].forEach(function (d) { p.setValueAtTime(0.75 * vel, t + d); p.setTargetAtTime(0, t + d + 0.001, 0.004); });
            p.setValueAtTime(0.6 * vel, t + 0.028); p.setTargetAtTime(0, t + 0.029, 0.06); z.connect(bf); bf.connect(zg); zg.connect(out); })(); break;
          case 'hat': hiss('highpass', 8000, 0.7, 0.022, 0.3); break;
          case 'ohat': hiss('highpass', 7200, 0.7, 0.16, 0.24, 0.6); break;
          case 'shaker': (function () { var z = noise(K, t, 0.12), bf = filt(K, 'bandpass', 6200, 1.2), zg = gain(K, 0); zg.gain.setValueAtTime(0, t); zg.gain.linearRampToValueAtTime(0.25 * vel, t + 0.012); zg.gain.setTargetAtTime(0, t + 0.014, 0.022); z.connect(bf); bf.connect(zg); zg.connect(out); })(); break;
          case 'tamb': hiss('bandpass', 9500, 1.5, 0.07, 0.35); hiss('bandpass', 7000, 2, 0.03, 0.2); break;
          // (the cowbell tuned to the key: its tonic and the fifth over it, Bb4 and F5, B4 and F#5 on the final lap)
          case 'cowbell': (function () { var a = osc(K, K.pulse50, mtof(70 + (tr || 0)), t), b = osc(K, K.pulse50, mtof(77 + (tr || 0)), t), bf = filt(K, 'bandpass', 900, 1.6), zg = gain(K, 0);
            zg.gain.setValueAtTime(0.16 * vel, t); zg.gain.setTargetAtTime(0.05 * vel, t + 0.002, 0.012); zg.gain.setTargetAtTime(0, t + 0.03, 0.06);
            a.connect(bf); b.connect(bf); bf.connect(zg); zg.connect(out); a.start(t); b.start(t); stop([a, b], t + 0.4); })(); break;
          case 'rim': hiss('bandpass', 1900, 5, 0.014, 0.7); thump(830, 800, 0.022, 0.25, 'triangle'); break;
          case 'tom': thump(230, 150, 0.15, 0.75, 'sine', 0.05); hiss('bandpass', 1500, 1, 0.02, 0.2); break;
          case 'tom2': thump(165, 105, 0.18, 0.8, 'sine', 0.05); hiss('bandpass', 1200, 1, 0.02, 0.2); break;
          case 'crash': hiss('highpass', 4800, 0.6, 0.7, 0.26, 3); hiss('bandpass', 8200, 0.9, 0.35, 0.16, 2); break;
        }
      }

      /* ------------------------------------------------------------- mixer -- */
      // where each part sits: level, pan, the plate's send, the echo's send
      var MIX = {
        lead: [1.14, 0.0, 0.16, 0.2], whistle: [0.16, 0.12, 0.2, 0.15], brass: [0.9, 0.16, 0.22, 0], brassL: [0.9, -0.22, 0.22, 0], piano: [0.55, 0.34, 0.18, 0],
        clav: [1.8, -0.3, 0.1, 0], bass: [0.32, 0, 0, 0], drums: [0.55, 0, 0.08, 0], perc: [0.6, 0.32, 0.08, 0], percL: [0.6, -0.34, 0.08, 0], snare: [0.85, 0.04, 0.16, 0],
        fx: [0.45, -0.1, 0.3, 0.2], sting: [0.95, 0, 0.2, 0.1],
      };
      // the loudness: measured offline (scripts/.scratch/kart/music2, BS.1770, this module in an OfflineAudioContext),
      // so a race is about -16 LUFS integrated, each lap a little louder than the last as it fills out (lap 1 -16.4,
      // lap 2 -16.0, the final lap -15.5) and the start screen, thinner, 1.5 dB under; peaks under -1.5 dBFS
      var LEVEL = 0.352, LAP_DB = [-1.5, -0.3, 0, 0];
      // a plate, made here: decorrelated noise, bright at first and darkening as it dies
      function plate(K, secs) {
        var ac = K.ac, sr = ac.sampleRate, len = Math.floor(sr * secs), ir = ac.createBuffer(2, len, sr);
        for (var c = 0; c < 2; c++) {
          var d = ir.getChannelData(c), lp = 0, R = rng(31 + c * 17);
          for (var i = 0; i < len; i++) { var tt = i / sr, x = (R() * 2 - 1) * Math.exp(-tt / (secs * 0.24)); lp += (x - lp) * (0.7 - 0.55 * Math.min(1, tt / secs)); d[i] = tt < 0.008 ? 0 : lp; }
        }
        var cv = ac.createConvolver(); cv.buffer = ir; return cv;
      }
      function mixer(K, out) {
        var ac = K.ac, bus = gain(K, 1), hp = filt(K, 'highpass', 40, 0.7), mud = filt(K, 'peaking', 320, 1.1), pres = filt(K, 'peaking', 3000, 0.8), air = filt(K, 'highshelf', 8000);
        mud.gain.value = -3; pres.gain.value = 1.5; air.gain.value = 1.5;
        var glue = ac.createDynamicsCompressor(); glue.threshold.value = -20; glue.knee.value = 6; glue.ratio.value = 2; glue.attack.value = 0.015; glue.release.value = 0.2;
        var pre = gain(K, LEVEL), level = gain(K, 1), duck = gain(K, 1), lim = ac.createDynamicsCompressor();
        lim.threshold.value = -5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
        var send = gain(K, 1), verb = plate(K, 1.4), vhp = filt(K, 'highpass', 450, 0.7), vlp = filt(K, 'lowpass', 9000, 0.7), ret = gain(K, 0.5);
        var echo = gain(K, 1), dl = ac.createDelay(1), fb = gain(K, 0.24), elp = filt(K, 'lowpass', 3500, 0.7), ehp = filt(K, 'highpass', 500, 0.7), eret = gain(K, 0.45);
        bus.connect(hp); hp.connect(mud); mud.connect(pres); pres.connect(air); air.connect(pre); pre.connect(glue); glue.connect(level); level.connect(duck); duck.connect(lim); lim.connect(out);
        send.connect(verb); verb.connect(vhp); vhp.connect(vlp); vlp.connect(ret); ret.connect(bus);
        echo.connect(dl); dl.connect(elp); elp.connect(ehp); ehp.connect(fb); fb.connect(dl); ehp.connect(eret); eret.connect(bus);
        // the stings: over the score, past its duck, into its limiter
        var stingBus = gain(K, LEVEL); stingBus.connect(lim);
        var chans = {};
        function channel(role, dest) {
          if (chans[role]) return chans[role];
          var r = MIX[role], g = gain(K, r[0]), p = ac.createStereoPanner ? ac.createStereoPanner() : null;
          if (p) { p.pan.value = r[1]; g.connect(p); p.connect(dest || bus); } else g.connect(dest || bus);
          if (r[2]) { var sg = gain(K, r[2]); g.connect(sg); sg.connect(send); }
          if (r[3]) { var eg = gain(K, r[3]); g.connect(eg); eg.connect(echo); }
          return (chans[role] = g);
        }
        return { channel: channel, level: level, duck: duck, lim: lim, glue: glue, echo: dl, stingBus: stingBus, bus: bus, send: send };
      }
      // A bar (or a sting) rendered ahead, in an OfflineAudioContext of three channels: the parts' dry mix (their levels,
      // pans and the echo, as mixer() makes them: linear, so a bar's own is the same as the score's) on the first two,
      // and their send to the plate, mono, on the third; the plate, the tone, the glue, the duck and the limiter stay on
      // the page's context, after the bars, so the score's sum through them is what it always was.
      function stems(K, dest, lap) {
        var ac = K.ac, mg = ac.createChannelMerger(3), dry = gain(K, 1), sp = ac.createChannelSplitter(2), send = gain(K, 1);
        dry.channelCount = 2; dry.channelCountMode = 'explicit'; dry.channelInterpretation = 'speakers';
        dry.connect(sp); sp.connect(mg, 0, 0); sp.connect(mg, 1, 1); send.connect(mg, 0, 2);
        dest.channelInterpretation = 'discrete'; mg.connect(dest);
        var echo = gain(K, 1), dl = ac.createDelay(1), fb = gain(K, 0.24), elp = filt(K, 'lowpass', 3500, 0.7), ehp = filt(K, 'highpass', 500, 0.7), eret = gain(K, 0.45);
        echo.connect(dl); dl.connect(elp); elp.connect(ehp); ehp.connect(fb); fb.connect(dl); ehp.connect(eret); eret.connect(dry);
        var chans = {};
        function channel(role) {
          if (chans[role]) return chans[role];
          var r = MIX[role], g = gain(K, r[0] * (role === 'lead' && lap >= 3 ? 1.19 : 1)), p = ac.createStereoPanner ? ac.createStereoPanner() : null;
          if (p) { p.pan.value = r[1]; g.connect(p); p.connect(dry); } else g.connect(dry);
          if (r[2]) { var sg = gain(K, r[2]); g.connect(sg); sg.connect(send); }
          if (r[3]) { var eg = gain(K, r[3]); g.connect(eg); eg.connect(echo); }
          return (chans[role] = g);
        }
        return { channel: channel };
      }

      /* ------------------------------------------------------------ the player -- */
      var PERC = { cowbell: 'perc', tamb: 'perc', shaker: 'percL', hat: 'perc', ohat: 'perc', snare: 'snare', clap: 'snare', rim: 'percL', crash: 'perc' };
      // The owner, 7 Oct: "does the music stop randomly around 0:44", then, 8 Oct, after a longer lookahead: "music fix
      // isn't working. music stops randomly in game". Made note by note on the page's main thread, about 290 audio nodes
      // a second, the score lived a second or two ahead of the audio clock: a main thread held up for longer (a busy
      // machine, a phone, a shader compiled, a garbage collection) left it silent until it came back, and every voice of
      // it ran on the audio thread in real time, competing with the game's own sound. So on a page the score is RENDERED
      // AHEAD: each bar (the notes that start in it, every part, its own echo, rung out) is made into an AudioBuffer by an
      // OfflineAudioContext, off the audio thread, from a graph built a slice at a time between frames (BUDGET ms at
      // most), cached by what it is (the bar, the lap, the key, the tempo, the rip), and the bars are started on the
      // audio clock, back to back, AHEAD seconds before they sound; the plate, the tone, the glue, the duck and the
      // limiter play live after them, so a duck, a stop or a start still answers at once. A main thread stalled for
      // seconds stalls nothing heard. A lap asked for lands on the first bar line far enough off for its first two bars
      // to be made (a fraction of a second; the final lap's are made in advance), what was there taken back only once
      // they are; until then the old lap plays on. The count's intro, the start screen's groove, the final lap's way in
      // and the stings are made in advance, while the start screen plays. (opts.render: false, or an OfflineAudioContext,
      // plays it the old way, note by note: the checks that measure the mix offline.)
      //
      // The old way: it keeps LOOK seconds scheduled (more after a slow pump, up to LOOK_MAX), adding at most FILL seconds
      // of it in one pump; a lap asked for after its bar line was already scheduled still lands on the next bar line SAFE
      // seconds off (regrid()); and a step already LATE when its turn comes is skipped, so after a stall longer than LOOK
      // the score comes back in on the beat, where it would have been.
      var LOOK = 1, LOOK_MAX = 2.5, FILL = 0.3, SAFE = 0.1, LATE = 0.04;
      // rendered ahead: a bar starts PRE seconds before its bar line in its buffer (a note played a hair early fits), is
      // started at least LEAD seconds before that; a tail long enough for the longest ring (a tom 1.3 s, a crash 3 s)
      var PRE = 0.02, LEAD = 0.03, TAIL = 1.4, TAIL_CRASH = 3.1, SWAP_BARS = 3;
      function perf() { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); }
      function kstep(s) { try { if (typeof window !== 'undefined' && window.KartGuard) window.KartGuard.step(s); } catch (e) {} }
      function create(ac, out, opts) {
        opts = opts || {};
        var OAC = typeof OfflineAudioContext !== 'undefined' ? OfflineAudioContext : null;
        var RENDER = !!OAC && (opts.render !== undefined ? !!opts.render : !(ac instanceof OAC));
        var K = kit(ac), mx = mixer(K, out || ac.destination), seed = opts.seed || 1607;
        // the player's feel (a few milliseconds early or late, a little louder or softer), the same for a note every
        // time it comes round, whatever else is playing
        function feel(bar, step, i) { var x = Math.sin(seed + bar * 127.1 + step * 311.7 + i * 74.7) * 43758.5453; return x - Math.floor(x); }
        var mute = {}, solo = null;
        (opts.mute || []).forEach(function (p) { mute[p] = 1; });
        if (opts.solo && opts.solo.length) { solo = {}; opts.solo.forEach(function (p) { solo[p] = 1; }); }
        function on(part) { return !mute[part] && (!solo || solo[part]); }
        var S = {
          playing: false, stopping: false, lap: 1, want: 1, bar: LOOP_START, step: 0, nextStep: 0, nextBar: 0, tempo: TEMPO, transpose: 0, key: KEY,
          section: 'A', energy: 1, gain: 1, beats: [], stopAt: 0, hush: 0, pendingFinal: false, rip: false, skipped: 0, taken: 0,
          // rendered ahead: how, the seconds made and started ahead of the clock now (and the least of it in a race, past
          // the first seconds after a start), the bars started late, the renders made, the cache's bytes
          mode: RENDER ? 'render' : 'live', ahead: 0, low: null, late: 0, renders: 0, bytes: 0, renderMs: 0, fails: 0, fail: null, slow: 0,
        };
        var timer = null, lastPump = 0;

        // one step of the song at time T, into K's parts (ch: a part's input), in a lap, a key and a tempo
        function stepNotes(K, ch, bar, step, T, lap, tr, sd) {
          var B = SONG[bar];
          for (var i = 0; i < B.ev.length; i++) {
            var e = B.ev[i]; if (e.s !== step) continue;
            if (lap < e.l) continue;
            if (!on(e.p)) continue;
            // the start screen: the drums thinned to the kick, the claps and the cowbell
            if (lap === 0 && e.p === 'drums' && e.k !== 'kick' && e.k !== 'clap' && e.k !== 'cowbell') continue;
            var t = T + (step % 2 === 1 ? 0.14 * sd : 0), hum = e.p === 'drums' ? 0 : (feel(bar, step, i) - 0.5) * 0.006, v = clamp(e.v * (0.95 + feel(bar, i, step) * 0.1), 0.05, 1);
            var d = e.d * sd, f = e.m ? mtof(e.m + tr) : 0;
            switch (e.p) {
              case 'lead': lead(K, ch('lead'), t + hum, f, d * 0.94, v, e.from ? e.from + tr : 0); break;
              case 'whistle': whistle(K, ch('whistle'), t + hum, f, d * 0.9, v); break;
              case 'brass': horn(K, ch(e.voice % 2 ? 'brassL' : 'brass'), t + hum, f, d * (e.a === 's' ? 1 : 0.9), v, e.a); break;
              case 'piano': piano(K, ch('piano'), t + hum, f, d, v); break;
              case 'clav': clav(K, ch('clav'), t + hum, e.ms.map(function (m) { return mtof(m + tr); }), Math.max(0.05, d * 0.55), v); break;
              case 'bass': bass(K, ch('bass'), t + hum * 0.5, f, Math.max(0.05, d * 0.85), v, e.a); break;
              case 'drums': drum(K, ch(PERC[e.k] || 'drums'), e.k, t, v, tr); break;
              case 'fx': if (e.k === 'slide') slide(K, ch('fx'), t, f, d, v); break;
            }
          }
        }
        // the final lap's way in: a rip up into a hit on the bar line, a crash, the snare's last beat a roll
        function ripNotes(K, ch, T, tr, sd) {
          if (on('brass')) [note('D6'), note('Bb5'), note('F5'), note('D5')].forEach(function (m, i) { horn(K, ch(i % 2 ? 'brassL' : 'brass'), T, mtof(m + tr), sd * 3, 0.95, 'r'); });
          if (on('drums')) { drum(K, ch('perc'), 'crash', T, 0.9); drum(K, ch('drums'), 'kick', T, 1); }
        }

        /* -------- the old way: note by note, a second or two ahead (opts.render false, or offline) -------- */
        // Q: the sources scheduled and not yet started, [start, node]; BL: the bar lines scheduled, each with the state
        // just before it (what a regrid goes back to)
        var Q = [], BL = [];
        function stepDur() { return 60 / S.tempo / 4; }
        function lapGain(l) { return Math.pow(10, (LAP_DB[clamp(l, 0, 3)] || 0) / 20); }
        function playStep(bar, step, T) {
          K.q = Q; try { stepNotes(K, mx.channel, bar, step, T, S.lap, S.transpose, stepDur()); } finally { K.q = null; }
          if (step % 4 === 0) { S.beats.push({ t: T, bar: bar, beat: step / 4, section: SONG[bar].sec }); if (S.beats.length > 32) S.beats.shift(); }
        }
        function finalFill(T) { K.q = Q; try { ripNotes(K, mx.channel, T, S.transpose, stepDur()); } finally { K.q = null; } }
        // take back every source scheduled to start at `at` or later (stopped at its own start, it never sounds)
        function cut(at) {
          var keep = [];
          for (var i = 0; i < Q.length; i++) { if (Q[i][0] >= at - 1e-4) { try { Q[i][1].stop(Q[i][0]); } catch (e) { } S.taken++; } else keep.push(Q[i]); }
          Q = keep;
        }
        // a lap asked for after its bar line was scheduled: back to the first bar line still SAFE seconds off, with the
        // state it had there, and what was scheduled from it taken back (the pump schedules it again, in the new lap)
        function regrid() {
          var now = ac.currentTime, i = 0;
          while (i < BL.length && BL[i].t < now + SAFE) i++;
          if (i >= BL.length) return;
          var b = BL[i]; BL.length = i;
          cut(b.t);
          S.bar = b.bar; S.step = 0; S.nextStep = S.nextBar = b.t; S.lap = S.energy = b.lap; S.transpose = b.tr; S.tempo = b.tempo; S.key = b.key; S.rip = false; S.section = SONG[b.bar].sec;
          mx.level.gain.cancelScheduledValues(b.t); mx.channel('lead').gain.cancelScheduledValues(b.t);
          S.beats = S.beats.filter(function (x) { return x.t < b.t; });
        }
        function pumpLive() {
          if (!S.playing) return;
          var now = ac.currentTime, ahead = clamp(now - lastPump + 0.3, LOOK, LOOK_MAX); lastPump = now;
          if (S.stopping && now >= S.stopAt) { S.playing = false; S.stopping = false; if (timer) { clearInterval(timer); timer = null; } return; }
          // (the sources started by now cannot be taken back: forgotten)
          var n0 = 0; while (n0 < Q.length && Q[n0][0] < now - 0.05) n0++; if (n0) Q = Q.slice(n0);
          var until = Math.min(now + ahead, Math.max(S.nextStep, now) + FILL);
          while (S.nextStep < until && !S.stopping) {
            var late = S.nextStep < now - LATE;
            if (S.step === 0) {
              BL.push({ t: S.nextStep, bar: S.bar, lap: S.lap, tr: S.transpose, tempo: S.tempo, key: S.key }); if (BL.length > 6) BL.shift();
              // a change of lap lands on the bar line; the final lap's key and tempo with it, and a jump to the chorus
              if (S.want !== S.lap) {
                var was = S.lap; S.lap = S.want; S.energy = S.lap;
                if (S.lap >= 3 && was < 3) { S.transpose = 1; S.tempo = FINAL_TEMPO; S.key = 'B'; if (S.bar >= LOOP_START) S.bar = CHORUS; S.rip = true; }
                else if (S.lap < 3 && was >= 3) { S.transpose = 0; S.tempo = TEMPO; S.key = KEY; }
                mx.level.gain.setTargetAtTime(S.gain * lapGain(S.lap), Math.max(now, S.nextStep), 0.05);
                // (the lead up 1.5 dB over the final lap's fuller horns, so the hook still reads on a phone)
                mx.channel('lead').gain.setTargetAtTime(MIX.lead[0] * (S.lap >= 3 ? 1.19 : 1), Math.max(now, S.nextStep), 0.05);
              }
              S.nextBar = S.nextStep; S.section = SONG[S.bar].sec;
              if (S.rip) { S.rip = false; if (!late) finalFill(S.nextStep); }
            }
            // (a step missed while the page could not run is not played late, all at once: the score comes back in
            // on the beat it has reached)
            if (late) S.skipped++; else playStep(S.bar, S.step, S.nextStep);
            S.nextStep += stepDur();
            if (++S.step >= 16) { S.step = 0; S.bar = S.bar + 1 >= SONG.length ? LOOP_START : S.bar + 1; }
          }
        }

        /* -------- rendered ahead (the default on a page) -------- */
        var MOBILE = typeof navigator !== 'undefined' && (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '') || (navigator.deviceMemory > 0 && navigator.deviceMemory <= 4) || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches));
        // AHEAD: the seconds kept made and started; BUDGET: the main thread's milliseconds a pump may spend building
        // graphs; CACHE: the bars and stings kept, in bytes (three channels of float at the context's rate: a bar about
        // 1.4 MB, so the 8 s ahead is about 10 MB; past CACHE only what the plan needs is kept)
        var AHEAD = opts.ahead || (MOBILE ? 6 : 8), BUDGET = opts.budget || (MOBILE ? 4 : 3), CACHE = (MOBILE ? 20 : 32) * 1048576;
        var SR = ac.sampleRate, C = {}, J = {}, PF = [], tick = 0, msBar = 150;
        // P: the plan, bars in order, each { t its bar line, dur, bar, lap, tr, tempo, key, rip, sec, k its key, h0 the
        // plan's head just before it, src/g once started }; H: the plan's head; SW: a lap asked for, its bars being
        // made; LIVE: every bar started whose sound may not be over (for a start() or a stop() to fade or take back)
        var P = [], H = null, SW = null, LIVE = [], started = 0, stem = null, stingStem = null;
        if (RENDER) {
          // the bars' three channels into the live chain: the dry pair into the bus, the third into the plate
          var mk = function (dryTo) {
            var g = ac.createGain(), sp = ac.createChannelSplitter(3), mg = ac.createChannelMerger(2);
            g.channelCount = 3; g.channelCountMode = 'explicit'; g.channelInterpretation = 'discrete';
            g.connect(sp); sp.connect(mg, 0, 0); sp.connect(mg, 1, 1); mg.connect(dryTo); sp.connect(mx.send, 2);
            return g;
          };
          stem = mk(mx.bus); stingStem = mk(mx.stingBus);
        }
        function barKey(bar, lap, tr, tempo, rip) { return 'b' + bar + '.' + lap + '.' + tr + '.' + tempo + (rip ? 'r' : ''); }
        function stingKey(kind, tr, tempo) { return 's' + kind + '.' + tr + '.' + tempo; }
        function hasCrash(bar, lap) { var ev = SONG[bar].ev; for (var i = 0; i < ev.length; i++) if (ev[i].k === 'crash' && lap >= ev[i].l) return true; return false; }
        // the plan's next bar from its head (a lap asked for lands on it: the final lap's key, tempo and chorus)
        function planBar(h) {
          var h0 = { bar: h.bar, lap: h.lap, want: h.want, tr: h.tr, tempo: h.tempo, key: h.key, t: h.t }, rip = false;
          if (h.want !== h.lap) {
            var was = h.lap; h.lap = h.want;
            if (h.lap >= 3 && was < 3) { h.tr = 1; h.tempo = FINAL_TEMPO; h.key = 'B'; if (h.bar >= LOOP_START) { h.bar = CHORUS; rip = true; } }
            else if (h.lap < 3 && was >= 3) { h.tr = 0; h.tempo = TEMPO; h.key = KEY; }
          }
          var dur = 16 * 15 / h.tempo, s = { t: h.t, dur: dur, bar: h.bar, lap: h.lap, tr: h.tr, tempo: h.tempo, key: h.key, rip: rip, sec: SONG[h.bar].sec, h0: h0, src: null, g: null };
          s.k = barKey(s.bar, s.lap, s.tr, s.tempo, s.rip);
          h.t += dur; h.bar = h.bar + 1 >= SONG.length ? LOOP_START : h.bar + 1;
          return s;
        }
        function headState() { if (!H) return; S.lap = S.energy = H.lap; S.transpose = H.tr; S.tempo = H.tempo; S.key = H.key; }
        // a bar into the plan: its beats, and the level's lift where its lap changes
        function append(s) {
          var prev = P.length ? P[P.length - 1] : null;
          P.push(s);
          if (prev && prev.lap !== s.lap) mx.level.gain.setTargetAtTime(S.gain * lapGain(s.lap), s.t, 0.05);
          for (var b = 0; b < 4; b++) S.beats.push({ t: s.t + b * s.dur / 4, bar: s.bar, beat: b, section: s.sec });
          if (S.beats.length > 64) S.beats.splice(0, S.beats.length - 64);
        }
        // a bar taken back before it sounds (stopped at its own start), or faded where something else begins
        // (a source stopped twice keeps the later stop: a bar taken back or faded is never touched again)
        function kill(s) { if (s.dead || s.faded) return; if (s.src) { try { s.src.stop(Math.max(ac.currentTime, s.t - PRE)); } catch (e) { } S.taken++; } s.dead = true; }
        function fade(s, at, quick) {
          if (s.dead || s.faded) return;
          if (!s.src) { s.dead = true; return; }
          s.faded = true;
          try { s.g.gain.cancelScheduledValues(at); if (quick) s.g.gain.setValueAtTime(0, at); else s.g.gain.setTargetAtTime(0, at, 0.012); s.src.stop(at + (quick ? 0.01 : 0.15)); } catch (e) { }
        }

        // what is wanted made, most urgent first: the bars of a lap asked for (unless the plan itself runs short), the
        // plan's bars in order up to AHEAD on, then what is made in advance
        function wanted(now) {
          var list = [], plan = [];
          for (var i = 0; i < P.length; i++) if (!P[i].src && !P[i].dead && !C[P[i].k] && P[i].t < now + AHEAD + 2) plan.push(P[i]);
          if (SW && S.ahead >= 2) list = SW.segs.filter(function (s) { return !C[s.k]; }).concat(plan);
          else list = plan.concat(SW ? SW.segs.filter(function (s) { return !C[s.k]; }) : []);
          return list;
        }
        // (what is made in advance goes before the plan's bars past its first 3 s: the count's intro is wanted the
        // moment Play is pressed)
        function soon(s, now) { return s.sw || s.t < now + 3; }
        function spec(s) { return { bar: s.bar, lap: s.lap, tr: s.tr, tempo: s.tempo, rip: s.rip }; }
        // one job: the bar's (or sting's) graph built a few steps a pump, then rendered off the main thread
        function job(k, sp) {
          if (C[k] || J[k]) return J[k];
          return (J[k] = { k: k, sp: sp, step: -1, oc: null, rendering: false, ms: 0 });
        }
        function build(j, until) {
          var sp = j.sp, t0 = perf();
          if (!j.oc) {
            var sd = 15 / sp.tempo, len;
            if (sp.sting) len = PRE + stingLen(sp.kind, sd) + TAIL_CRASH + 0.2;
            else len = PRE + 16 * sd + (sp.rip || hasCrash(sp.bar, sp.lap) ? TAIL_CRASH : TAIL);
            j.oc = new OAC(3, Math.ceil(len * SR), SR); j.K = kit(j.oc, K); j.fx = stems(j.K, j.oc.destination, sp.lap || 0); j.step = 0;
            // (a sting made a quarter of a second of its notes at a time: K.w, the window a note must start in)
            if (sp.sting) { j.len = stingLen(sp.kind, sd); j.of = Math.ceil((j.len + 0.2) / 0.25); }
            else { j.of = 16; if (sp.rip) { ENDT = 0; ripNotes(j.K, j.fx.channel, PRE, sp.tr, sd); j.end = ENDT; } }
          }
          ENDT = j.end || 0;
          while (j.step < j.of && perf() < until) {
            if (sp.sting) { j.K.w = [j.step ? PRE + j.step * 0.25 : -1, j.step === j.of - 1 ? 1e9 : PRE + (j.step + 1) * 0.25]; stingNotes(j.K, j.fx.channel('sting'), sp.kind, PRE, sp.tr, sp.tempo); j.K.w = null; }
            else stepNotes(j.K, j.fx.channel, sp.bar, j.step, PRE + j.step * 15 / sp.tempo, sp.lap, sp.tr, 15 / sp.tempo);
            j.step++;
          }
          j.end = ENDT; j.ms += perf() - t0;
          return j.step >= j.of;
        }
        function render(j) {
          // (the kart guard's step, for the first few renders and a stinger: the owner's phone, 8 Oct)
          if (S.renders < 4 || j.sp.sting) kstep('music: render ' + (S.renders + 1) + (j.sp.sting ? ' sting ' + j.sp.kind : ' bar ' + j.sp.bar));
          j.rendering = true; var t0 = perf(), oc = j.oc;
          var done = function (buf) { j.ms += perf() - t0; finish(j, buf); };
          var p = oc.startRendering();
          if (p && p.then) p.then(done, function (e) { delete J[j.k]; giveUp(e); });
          else oc.oncomplete = function (e) { done(e.renderedBuffer); };
        }
        // a render done: its silent end cut off, kept, and the plan's bars waiting for it started
        function finish(j, buf) {
          var t0 = perf();
          try { keep(j, buf); } catch (e) { delete J[j.k]; giveUp(e); }
          S.slow = Math.max(S.slow, perf() - t0);
        }
        function keep(j, buf) {
          delete J[j.k]; j.oc = j.K = j.fx = null;
          // (kept to its last source's stop and 30 ms more, the filters' and the echo's ring, the last 5 ms faded)
          var n = buf.length, nc = buf.numberOfChannels, end = Math.max(1, Math.min(n, Math.ceil(((j.end || n / SR) + 0.03) * SR))), f = Math.min(end, Math.round(SR * 0.005)), c, i, d;
          var b = ac.createBuffer(nc, end, SR);
          for (c = 0; c < nc; c++) {
            d = buf.getChannelData(c).subarray(0, end); if (b.copyToChannel) b.copyToChannel(d, c); else b.getChannelData(c).set(d);
            d = b.getChannelData(c); for (i = 0; i < f; i++) d[end - 1 - i] *= i / f;
          }
          C[j.k] = { buf: b, bytes: end * nc * 4, used: ++tick, len: j.len || 0, pin: !!j.sp.pin };
          S.renders++; S.renderMs = Math.round(j.ms);
          if (S.renders <= 4) kstep('music: rendered ' + S.renders);
          if (!j.sp.sting) msBar = msBar * 0.7 + j.ms * 0.3;
          evict();
          if (S.playing) pump();
        }
        // the cache held under CACHE: what is least lately used goes first, what is made in advance last, nothing a
        // bar in the plan or sounding still needs
        function evict() {
          var tot = 0, k; for (k in C) tot += C[k].bytes;
          S.bytes = tot; if (tot <= CACHE) return;
          var need = {}, now = ac.currentTime;
          P.forEach(function (s) { need[s.k] = 1; }); if (SW) SW.segs.forEach(function (s) { need[s.k] = 1; });
          var list = Object.keys(C).filter(function (x) { return !need[x]; }).sort(function (a, b) { return (C[a].pin - C[b].pin) || (C[a].used - C[b].used); });
          for (var i = 0; i < list.length && tot > CACHE; i++) { tot -= C[list[i]].bytes; delete C[list[i]]; }
          S.bytes = tot;
        }
        // the main thread's share: build what is wanted, BUDGET ms at most, two renders at a time
        function work(now) {
          var until = perf() + BUDGET, list = RENDER && (S.playing || PF.length) ? wanted(now) : [], busy = 0, k, keep = {};
          // (a graph half built for a bar no longer in the plan, after a start() or a lap taken back, is let go)
          list.forEach(function (s) { keep[s.k] = 1; }); PF.forEach(function (x) { keep[x.k] = 1; });
          for (k in J) { if (J[k].rendering) busy++; else if (!keep[k]) delete J[k]; }
          var i = 0, j, pf = false;
          while (perf() < until && busy < 2) {
            // (past the plan's first seconds, what is made in advance first)
            if (!pf && i < list.length && !soon(list[i], now) && S.ahead >= 3) pf = true;
            if (pf) { while (PF.length && C[PF[0].k]) PF.shift(); if (!PF.length || PF.every(function (x) { return C[x.k] || (J[x.k] && J[x.k].rendering); })) pf = false; }
            if (i < list.length && !pf) { j = job(list[i].k, spec(list[i])); i++; }
            else { while (PF.length && C[PF[0].k]) PF.shift(); if (!PF.length) break; j = job(PF[0].k, PF[0].sp); if (j && j.rendering) { PF.push(PF.shift()); if (PF.every(function (x) { return C[x.k] || (J[x.k] && J[x.k].rendering); })) break; continue; } }
            if (!j || j.rendering) continue;
            if (build(j, until)) { render(j); busy++; } else break;
          }
        }
        // the plan's bars started on the audio clock as they are made; one made too late for its bar line comes in
        // where it has got to, faded in (its steps gone by counted skipped)
        function place(now) {
          for (var i = 0; i < P.length; i++) {
            var s = P[i]; if (s.src || s.dead || !C[s.k]) continue;
            if (S.float) continue;
            var c = C[s.k], at = s.t - PRE, off = 0;
            c.used = ++tick;
            // (a start asked for now loses only the bar's lead-in, PRE: not counted late)
            if (at < now + 0.002) {
              off = now + 0.004 - at; at = now + 0.004;
              if (off >= s.dur + PRE - 0.05) { s.dead = true; S.skipped += 16; S.late++; continue; }
              if (off > PRE + 0.01) { S.skipped += Math.ceil((off - PRE) / (s.dur / 16)); S.late++; }
            }
            var src = ac.createBufferSource(), g = ac.createGain();
            g.channelCount = 3; g.channelCountMode = 'explicit'; g.channelInterpretation = 'discrete';
            src.buffer = c.buf; src.connect(g); g.connect(stem);
            if (off) { g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(1, at + (off > PRE + 0.01 ? 0.012 : 0.003)); }
            src.start(at, off); s.src = src; s.g = g; s.end = at + c.buf.duration - off; LIVE.push(s);
          }
        }
        // a lap asked for while playing: the plan from the first bar line far enough off for its first SWAP_BARS bars to
        // be made in time (a moment when they are made already) made again, the old bars kept until the new ones are
        function want(now) {
          var m = clamp(0.25 + 1.8 * SWAP_BARS * msBar / 1000, 0.3, 3), i = 0, j = 0;
          while (i < P.length && P[i].t < now + m) i++;
          // (a bar line nearer, when the new lap's first bars from it are made already: the final lap's, made in advance)
          while (j < i && P[j].t < now + 0.15) j++;
          for (; j < i; j++) { var q = P[j].h0, hq = { bar: q.bar, lap: q.lap, want: S.want, tr: q.tr, tempo: q.tempo, key: q.key, t: q.t }, ok = true; for (var n0 = 0; n0 < SWAP_BARS; n0++) ok = !!C[planBar(hq).k] && ok; if (ok) { i = j; break; } }
          if (i >= P.length) { SW = null; if (H) H.want = S.want; return; }
          // (the plan from there already wants it: a lap asked for and taken back)
          if (P[i].h0.want === S.want) { SW = null; return; }
          var h0 = P[i].h0, head = { bar: h0.bar, lap: h0.lap, want: S.want, tr: h0.tr, tempo: h0.tempo, key: h0.key, t: h0.t }, segs = [];
          for (var n = 0; n < SWAP_BARS; n++) { segs.push(planBar(head)); segs[n].sw = true; }
          SW = { t: P[i].t, head: head, segs: segs };
        }
        function commit() {
          var t = SW.t, i = 0;
          while (i < P.length && P[i].t < t - 1e-6) i++;
          for (var j = i; j < P.length; j++) kill(P[j]);
          P.length = i;
          mx.level.gain.cancelScheduledValues(t);
          S.beats = S.beats.filter(function (x) { return x.t < t; });
          H = SW.head; var segs = SW.segs; SW = null;
          segs.forEach(append); headState();
        }
        function pumpRender() {
          var now = ac.currentTime; lastPump = now;
          if (!S.playing) { work(now); return; }
          if (S.stopping && now >= S.stopAt) { S.playing = false; S.stopping = false; P = []; SW = null; if (timer) { clearInterval(timer); timer = null; } return; }
          // (bars over: forgotten)
          LIVE = LIVE.filter(function (s) { return s.end >= now - 0.1 && !s.dead; });
          var p0 = 0; while (p0 < P.length - 1 && P[p0].t + P[p0].dur < now - 0.5) p0++; if (p0) P = P.slice(p0);
          if (!S.stopping) {
            while (!P.length || P[P.length - 1].t < now + AHEAD + 1.5) append(planBar(H));
            if (SW) {
              if (SW.t < now + LEAD + PRE + 0.01) want(now);
              else if (SW.segs.every(function (s) { return C[s.k]; })) commit();
            }
          }
          try { work(now); } catch (e) { giveUp(e); if (!RENDER) { pumpLive(); return; } }
          // a start with no time asked for begins as soon as its first bar is made
          if (S.float && P.length && C[P[0].k]) {
            S.float = false; var dt = now + LEAD + PRE + 0.01 - P[0].t;
            if (dt > 0) { P.forEach(function (s) { s.t += dt; s.h0.t += dt; }); H.t += dt; S.beats.forEach(function (b) { b.t += dt; }); started += dt; }
          }
          place(now);
          // the seconds made and started ahead of the clock, without a hole
          var edge = now;
          for (var i = 0; i < P.length; i++) { var s = P[i]; if (s.t + s.dur <= now) continue; if (!s.src || s.t > edge + 0.01) break; edge = s.t + s.dur; }
          S.ahead = Math.max(0, edge - now);
          if (!S.stopping && !S.float && now > started + 4 && (S.low === null || S.ahead < S.low)) S.low = S.ahead;
          // the bar sounding (or the first to)
          var cur = null; for (var q = 0; q < P.length; q++) { if (P[q].t <= now + 1e-4) cur = P[q]; else { if (!cur) cur = P[q]; break; } }
          if (cur) { S.bar = cur.bar; S.section = cur.sec; }
          for (var r = 0; r < P.length; r++) if (P[r].t > now) { S.nextBar = S.nextStep = P[r].t; break; }
        }
        function pump() { if (RENDER) { var t0 = perf(); pumpRender(); S.slow = Math.max(S.slow, perf() - t0); } else pumpLive(); }
        // a page that cannot render ahead (a context refused, memory short): the score plays on the old way from the
        // first bar line not yet started, what is started playing out (S.fail says why)
        function giveUp(e) {
          S.fail = String(e && e.message || e);
          if (!RENDER || ++S.fails < 3) return;
          RENDER = false; S.mode = 'live'; J = {}; PF = [];
          var s = null; for (var i = 0; i < P.length; i++) if (!P[i].src) { s = P[i]; break; }
          if (S.playing && !S.stopping && s) {
            P.forEach(function (x) { if (!x.src) x.dead = true; });
            S.bar = s.rip ? s.h0.bar : s.bar; S.lap = s.h0.lap; S.energy = S.lap; S.transpose = s.h0.tr; S.tempo = s.h0.tempo; S.key = s.h0.key; S.step = 0; S.nextStep = S.nextBar = Math.max(s.t, ac.currentTime + 0.05);
            mx.channel('lead').gain.setValueAtTime(MIX.lead[0] * (S.lap >= 3 ? 1.19 : 1), ac.currentTime);
            S.beats = S.beats.filter(function (x) { return x.t < S.nextStep; });
          }
          Q = []; BL = []; SW = null; lastPump = ac.currentTime;
        }
        // what is made in advance, while the start screen plays: the count's intro, the groove, the final lap's way in,
        // a race picked up from the loop, and the stings in the keys they are played in
        function prefetch() {
          var add = function (k, sp) { sp.pin = true; PF.push({ k: k, sp: sp }); };
          add(barKey(LOOP_START, 0, 0, TEMPO, false), { bar: LOOP_START, lap: 0, tr: 0, tempo: TEMPO });
          add(barKey(0, 1, 0, TEMPO, false), { bar: 0, lap: 1, tr: 0, tempo: TEMPO });
          add(barKey(1, 1, 0, TEMPO, false), { bar: 1, lap: 1, tr: 0, tempo: TEMPO });
          ['go', 'lap', 'final'].forEach(function (kind) { add(stingKey(kind, 0, TEMPO), { sting: true, kind: kind, tr: 0, tempo: TEMPO }); });
          add(barKey(CHORUS, 3, 1, FINAL_TEMPO, true), { bar: CHORUS, lap: 3, tr: 1, tempo: FINAL_TEMPO, rip: true });
          add(barKey(CHORUS + 1, 3, 1, FINAL_TEMPO, false), { bar: CHORUS + 1, lap: 3, tr: 1, tempo: FINAL_TEMPO });
          add(barKey(CHORUS + 2, 3, 1, FINAL_TEMPO, false), { bar: CHORUS + 2, lap: 3, tr: 1, tempo: FINAL_TEMPO });
          ['finish', 'win', 'lose'].forEach(function (kind) { add(stingKey(kind, 1, FINAL_TEMPO), { sting: true, kind: kind, tr: 1, tempo: FINAL_TEMPO }); });
          add(barKey(LOOP_START, 1, 0, TEMPO, false), { bar: LOOP_START, lap: 1, tr: 0, tempo: TEMPO });
        }
        if (RENDER) prefetch();
        function emitBeats(onBeat) {
          var now = ac.currentTime;
          // (a beat long gone, while nobody asked, is not reported late)
          while (S.beats.length && S.beats[0].t <= now) { var b = S.beats.shift(); if (onBeat && now - b.t < 0.25) onBeat({ bar: b.bar, beat: b.beat, section: b.section }); }
        }
        // the key and the tempo sounding at T
        function soundingAt(T) { var c = null; for (var i = 0; i < P.length; i++) { if (P[i].t <= T + 1e-4) c = P[i]; else break; } return c; }

        var M = {
          introSeconds: 2 * 16 * 60 / TEMPO / 4,
          state: S,
          start: function (at, from) {
            var now = ac.currentTime, floating = at === undefined || at === null; at = floating ? now + 0.05 : Math.max(now, at);
            var cutAt = S.stopping ? Math.min(S.stopAt, at) : S.playing ? at : now;
            if (RENDER) {
              // (what is to come from before does not play: the start screen's groove under the count's intro, a score
              // stopped; one still playing plays on up to `at` and fades there, one fading out stays faded and stops)
              var quiet = S.stopping || !S.playing;
              LIVE.forEach(function (s) { if (s.t - PRE >= cutAt - 1e-4) kill(s); else fade(s, Math.max(now, at), quiet); });
              P.forEach(function (s) { if (!s.src) s.dead = true; });
              P = []; SW = null; LIVE = LIVE.filter(function (s) { return !s.dead && !s.faded; });
            } else { cut(cutAt); BL = []; }
            // (a score fading out stays faded until `at`: a duck asked for in between, an effect's, does not lift it)
            S.hush = S.stopping && at > now + 0.02 ? at : 0;
            S.playing = true; S.stopping = false; S.beats = [];
            S.lap = S.want; S.energy = S.lap; S.rip = false;
            S.transpose = S.lap >= 3 ? 1 : 0; S.tempo = S.lap >= 3 ? FINAL_TEMPO : TEMPO; S.key = S.lap >= 3 ? 'B' : KEY;
            S.bar = from === 'loop' ? LOOP_START : from === 'chorus' ? CHORUS : 0; S.step = 0; S.nextStep = S.nextBar = at; S.section = SONG[S.bar].sec;
            // (the levels from `at`: a start later on leaves what is playing, or fading, as it is until then)
            var from0 = at > now + 0.02 ? at : now;
            mx.duck.gain.cancelScheduledValues(from0); mx.duck.gain.setValueAtTime(1, from0);
            mx.level.gain.cancelScheduledValues(from0); mx.level.gain.setValueAtTime(S.gain * lapGain(S.lap), from0);
            if (RENDER) {
              H = { bar: S.bar, lap: S.lap, want: S.want, tr: S.transpose, tempo: S.tempo, key: S.key, t: at };
              append(planBar(H)); started = at;
              S.float = floating && !C[P[0].k];
            } else { mx.channel('lead').gain.cancelScheduledValues(from0); mx.channel('lead').gain.setValueAtTime(MIX.lead[0] * (S.lap >= 3 ? 1.19 : 1), from0); }
            lastPump = now; pump();
            if (opts.timer !== false && !timer && typeof setInterval === 'function') timer = setInterval(pump, 40);
          },
          setLap: function (n) {
            var was = S.want; S.want = clamp(Math.round(+n || 0), 0, 3);
            if (!S.playing) { S.lap = S.want; S.energy = S.lap; }
            else if (S.want !== was && !S.stopping) { if (RENDER) { want(ac.currentTime); pump(); } else { regrid(); pump(); } }
          },
          stop: function (fade) {
            if (!S.playing || S.stopping) return;
            var now = ac.currentTime; fade = fade === undefined ? 1.2 : fade;
            S.stopping = true; S.stopAt = now + fade;
            if (RENDER) { LIVE.forEach(function (s) { if (s.t - PRE >= S.stopAt - 1e-4) kill(s); }); P = P.filter(function (s) { if (s.t - PRE >= S.stopAt - 1e-4) { s.dead = true; return false; } return true; }); SW = null; }
            else { cut(now + fade); BL = []; }
            mx.duck.gain.cancelScheduledValues(now); mx.duck.gain.setValueAtTime(mx.duck.gain.value, now); mx.duck.gain.setTargetAtTime(0.0001, now, Math.max(0.01, fade / 4));
            if (typeof setTimeout === 'function') setTimeout(function () { if (S.stopping) pump(); }, fade * 1000 + 30);
          },
          duck: function (amount, seconds) {
            if (S.stopping || ac.currentTime < S.hush) return;
            var g = mx.duck.gain, now = ac.currentTime, to = Math.pow(10, -(amount === undefined ? 4 : amount) / 20);
            g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.setTargetAtTime(to, now, 0.012); g.setTargetAtTime(1, now + (seconds === undefined ? 0.12 : seconds), 0.22);
          },
          update: function (lap, onBeat) {
            if (lap !== undefined && lap !== null && isFinite(lap)) { var w = clamp(Math.round(lap), 0, 3); if (w !== S.want) M.setLap(w); }
            pump(); emitBeats(onBeat);
          },
          sting: function (kind, at) { var len = sting(kind, at === undefined ? ac.currentTime + 0.02 : at); if (len > 0 && S.playing && !S.stopping) M.duck(5, len * 0.8); return len; },
          duckLevel: function () { return +mx.duck.gain.value.toFixed(3); },
          // the score's own trim, in dB over the measured level (for a world that wants it quieter or louder)
          setLevel: function (db) { S.gain = Math.pow(10, (+db || 0) / 20); mx.level.gain.setTargetAtTime(S.gain * lapGain(S.lap), ac.currentTime, 0.2); },
          pump: pump,
          // (for checks: a promise kept when nothing is being made)
          settled: function () { return new Promise(function (res) { (function wait() { var k, n = 0; pump(); for (k in J) n++; if (!n) res(S); else setTimeout(wait, 10); })(); }); },
        };

        // the stings: a made one if there is one, in the key and the tempo sounding then; else played note by note
        // (and made for the next time)
        function sting(kind, T) {
          if (!on('sting')) return 0;
          var snd = RENDER ? soundingAt(T) : null, tr = snd ? snd.tr : S.transpose, tempo = snd ? snd.tempo : S.tempo;
          if (RENDER) {
            var k = stingKey(kind, tr, tempo), c = C[k], now = ac.currentTime;
            if (c && c.len > 0) {
              var at = T - PRE, off = 0; if (at < now) { off = now - at; at = now; }
              var src = ac.createBufferSource(); src.buffer = c.buf; src.connect(stingStem); src.start(at, off); c.used = ++tick;
              return c.len;
            }
            if (stingLen(kind, 15 / tempo) > 0 && !J[k]) PF.unshift({ k: k, sp: { sting: true, kind: kind, tr: tr, tempo: tempo } });
          }
          return stingNotes(K, mx.channel('sting', mx.stingBus), kind, T, tr, tempo);
        }
        return M;
      }

      // the stings: the hook's head (F Bb A Bb D), each its own way, in a key (tr) and a tempo, into ch; their lengths
      var HEAD = [[0, 'F5'], [3, 'Bb5'], [6, 'A5'], [7, 'Bb5'], [8, 'D6']];
      function stingLen(kind, sd) {
        switch (kind) {
          case 'go': return 0.6;
          case 'lap': return 1;
          case 'final': return 1.7;
          case 'finish': return 1.9;
          case 'win': return 9 * sd * 1.6 + 16 * sd + 1.2;
          case 'lose': return 8 * sd * 1.5 + 1.1;
        }
        return 0;
      }
      function stingNotes(K, ch, kind, T, tr, tempo) {
        var sd = 60 / tempo / 4, c = chord('Bb6');
        function hornLine(line, t0, speed, shift, voices, art, lastLen) {
          line.forEach(function (n, i) {
            var m = note(n[1]) + tr + (shift || 0), t = t0 + n[0] * sd * speed, last = i === line.length - 1, d = last ? (lastLen || 0.35) : Math.max(0.07, sd * speed * 1.2);
            horn(K, ch, t, mtof(m), d, 0.95, last ? art : '');
            harmonise(m, { pcs: c.pcs.map(function (p) { return (p + tr + (shift || 0)) % 12; }) }, voices).forEach(function (h) { horn(K, ch, t, mtof(h), d, 0.85, last ? art : ''); });
          });
        }
        function hit(t, list, v) { list.forEach(function (k) { drum(K, ch, k, t, v || 0.9); }); }
        function chordHit(t, d, art, shift) { ['D6', 'Bb5', 'F5', 'D5'].forEach(function (n) { horn(K, ch, t, mtof(note(n) + tr + (shift || 0)), d, 0.95, art); }); lead(K, ch, t, mtof(note('D6') + tr + (shift || 0)), d, 0.8, 0); }
        switch (kind) {
          case 'go':
            // a rip up into the tonic, the kick and a crash
            chordHit(T, 0.32, 'r'); hit(T, ['kick', 'crash', 'clap']); slide(K, ch, T, mtof(note('Bb5') + tr), 0.3, 0.6);
            break;
          case 'lap':
            // the head, quick, three horns, a doit on its top; the cowbell on each note
            hornLine(HEAD, T, 0.6, 0, 3, 'd', 0.3); HEAD.forEach(function (n) { drum(K, ch, 'cowbell', T + n[0] * sd * 0.6, 0.7, tr); }); hit(T + 8 * sd * 0.6, ['crash'], 0.5);
            break;
          case 'final':
            // the head, then the head a whole step up, a roll under it and a doit off the top
            hornLine(HEAD, T, 0.55, 0, 3, '', 0.12); hornLine(HEAD, T + 9 * sd * 0.55, 0.55, 2, 3, 'd', 0.5);
            for (var i = 0; i < 12; i++) drum(K, ch, 'snare', T + 9 * sd * 0.55 + i * sd * 0.5, 0.35 + i * 0.05);
            hit(T + 18 * sd * 0.55, ['crash', 'kick'], 0.9);
            break;
          case 'finish':
            // the head, then the tonic chord held, shaking, a crash
            hornLine(HEAD, T, 0.7, 0, 3, '', 0.12); chordHit(T + 9 * sd * 0.7, 0.9, ''); hit(T + 9 * sd * 0.7, ['kick', 'crash', 'clap']);
            break;
          case 'win':
            // the fanfare: the head at half speed, three hits on the hook's rhythm, the tonic held over a roll, a
            // slide whistle up and a crash
            hornLine(HEAD, T, 1.6, 0, 3, '', 0.2);
            var w = T + 9 * sd * 1.6;
            [0, 3, 6].forEach(function (s) { chordHit(w + s * sd, 0.12, 's'); hit(w + s * sd, ['kick', 'snare'], 0.85); });
            chordHit(w + 8 * sd, 1.2, 'd');
            for (var j = 0; j < 16; j++) drum(K, ch, 'snare', w + 8 * sd + j * sd * 0.5, 0.3 + j * 0.04);
            hit(w + 16 * sd, ['crash', 'kick'], 1); slide(K, ch, w + 8 * sd, mtof(note('F5') + tr), 8 * sd, 0.7);
            break;
          case 'lose':
            // the head in the minor, slow, its top falling away with a wah, then a rim shot: a shrug, not a dirge
            var low = [[0, 'F5'], [3, 'Bb5'], [6, 'A5'], [7, 'Bb5'], [8, 'Db6']];
            low.forEach(function (n, i) { var last = i === low.length - 1; horn(K, ch, T + n[0] * sd * 1.5, mtof(note(n[1]) + tr), last ? 0.7 : sd * 1.4, 0.9, last ? 'f' : ''); horn(K, ch, T + n[0] * sd * 1.5, mtof(note(n[1]) + tr - 5), last ? 0.7 : sd * 1.4, 0.75, last ? 'f' : ''); });
            hit(T + 8 * sd * 1.5 + 0.95, ['rim'], 0.9);
            break;
        }
        return stingLen(kind, sd);
      }

      // the composition as data, for checks: Bb, 160 BPM, steps of a sixteenth
      function score() {
        return {
          tempo: TEMPO, finalTempo: FINAL_TEMPO, key: KEY, loopStart: LOOP_START, chorus: CHORUS, steps: 16, scale: [10, 0, 2, 3, 5, 7, 9],
          bars: SONG.map(function (b) {
            function part(p, l) { return b.ev.filter(function (e) { return e.p === p && e.l <= l && !(e.p === 'brass' && e.voice !== 0); }).map(function (e) { return [e.s, e.d, e.m]; }); }
            return { section: b.sec, chords: b.chords.map(function (c) { return [c.s, c.c.sym, c.c.pcs]; }), lead: part('lead', 3), brass: part('brass', 0), bass: part('bass', 3),
              clav: b.ev.filter(function (e) { return e.p === 'clav'; }).map(function (e) { return [e.s, e.d, e.ms]; }),
              events: [0, 1, 2, 3].map(function (l) { return b.ev.filter(function (e) { return e.l <= l && (l > 0 || e.p !== 'drums' || e.k === 'kick' || e.k === 'clap' || e.k === 'cowbell'); }).length; }) };
          }),
        };
      }
      return { create: create, score: score, HOOK: [HOOK1, HOOK2], TEMPO: TEMPO, FINAL_TEMPO: FINAL_TEMPO, KEY: KEY, LOOP_BARS: SONG.length - LOOP_START };
    })();
