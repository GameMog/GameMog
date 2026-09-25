/**
 * GameMog Music: the platform's score engine (runtime v1).
 *
 * A world asks for a style (and, if it likes, a key, a mode, a tempo and its
 * own instruments); the engine composes a song from it, plays it, and mixes it
 * like every other world's: synthesised instruments (no files), a hall, a
 * glue compressor on the score only, loudness measured offline and normalised
 * to one target, ducked under the game's sound effects, and a limiter on the
 * master. The song is written, not random noise: a tune in phrases (a motif
 * restated, an answer, a half cadence and a full one), harmony from the mode,
 * voice-led chords, a bass line, a counter-line, drums with fills, and a form
 * (intro, A, A, B, A) that loops. The world's seed picks the tune; the same
 * world always plays the same song. How much of it plays follows the race:
 * the start screen hears the intro, every lap adds weight.
 *
 * Written for GameMog; ideas (not code) after Hearthvale's score: a hand-held
 * tune restated so it is learned, arrangement layers, one loudness target.
 */
var GameMogMusic = (function () {
  'use strict';

  /* ------------------------------------------------------------- basics -- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mod(a, n) { return ((a % n) + n) % n; }
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function pick(R, list) { return list[Math.floor(R() * list.length) % list.length]; }
  function weighted(R, items) { var t = 0, i; for (i = 0; i < items.length; i++) t += items[i][1]; var x = R() * t; for (i = 0; i < items.length; i++) { x -= items[i][1]; if (x <= 0) return items[i][0]; } return items[items.length - 1][0]; }

  /* ------------------------------------------------------------- theory -- */
  var SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11], phrygian: [0, 1, 3, 5, 7, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11],
    pentatonic: [0, 2, 4, 7, 9], minorpent: [0, 3, 5, 7, 10], in: [0, 1, 5, 7, 8], yo: [0, 2, 5, 7, 9], hirajoshi: [0, 2, 3, 7, 8],
  };
  var MINORISH = { minor: 1, dorian: 1, phrygian: 1, harmonic: 1, minorpent: 1, in: 1, hirajoshi: 1 };
  var KEYS = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  // eight-bar progressions as scale degrees from 0 (a seven-note mode: 0 = I or i, 4 = V or v)
  var PROG = {
    major: {
      A: [[0, 4, 5, 3, 0, 4, 3, 4], [0, 5, 3, 4, 0, 5, 3, 4], [0, 3, 0, 4, 0, 3, 4, 4], [0, 3, 5, 4, 0, 3, 4, 4]],
      B: [[3, 4, 2, 5, 3, 4, 1, 4], [5, 2, 3, 0, 5, 2, 1, 4], [3, 3, 0, 0, 3, 3, 4, 4], [5, 3, 0, 4, 5, 3, 1, 4]],
    },
    minor: {
      A: [[0, 5, 2, 6, 0, 5, 6, 4], [0, 6, 5, 6, 0, 6, 5, 4], [0, 3, 6, 2, 5, 3, 4, 4], [0, 5, 3, 4, 0, 5, 3, 4]],
      B: [[5, 6, 0, 0, 5, 6, 4, 4], [3, 4, 5, 6, 3, 4, 6, 4], [2, 6, 3, 0, 5, 6, 4, 4]],
    },
    // five-note modes: open, drone-led harmony round the tonic
    penta: {
      A: [[0, 0, 3, 0, 0, 4, 3, 0], [0, 3, 0, 4, 0, 3, 4, 0], [0, 0, 2, 3, 0, 0, 4, 0]],
      B: [[3, 3, 0, 0, 4, 4, 3, 4], [2, 3, 4, 3, 2, 3, 4, 4], [3, 4, 3, 0, 3, 4, 2, 4]],
    },
  };
  // melody rhythms, in sixteenth-note steps (a negative length is a rest)
  var RH = {
    '4/4': {
      body: [[4, 4, 4, 4], [6, 2, 4, 4], [4, 2, 2, 4, 4], [2, 2, 4, 4, 4], [6, 2, 8], [4, 4, 8], [2, 2, 4, 2, 2, 4], [8, 4, 4], [3, 3, 2, 8], [4, 2, 2, 8], [-2, 2, 4, 4, 4]],
      cad: [[4, 4, 8], [8, 8], [4, 12], [6, 2, 8], [16]],
      steps: 16, beat: 4, strong: [0, 8],
    },
    '3/4': {
      body: [[4, 4, 4], [8, 4], [4, 2, 2, 4], [6, 2, 4], [2, 2, 4, 4], [-4, 4, 4]],
      cad: [[12], [8, 4], [4, 8]],
      steps: 12, beat: 4, strong: [0],
    },
    '6/8': {
      body: [[6, 6], [4, 2, 6], [2, 2, 2, 6], [6, 4, 2], [4, 2, 4, 2], [2, 2, 2, 4, 2], [-2, 2, 2, 6]],
      cad: [[12], [6, 6], [4, 2, 6]],
      steps: 12, beat: 6, strong: [0, 6],
    },
  };

  /* -------------------------------------------------------------- styles -- */
  // what a style means: its instruments, its feel and its drums. A world may
  // override any field; a generated world only needs to name the style.
  var STYLES = {
    anthem: { key: 'D', mode: 'major', tempo: 128, meter: '4/4', lead: 'brass', counter: 'strings', chords: 'strings', comp: 'sustain', arp: 'pluck', arpRate: 2, bass: 'bass', bassPat: 'drive', kit: 'stadium', reverb: 0.28, room: 2.4 },
    synthwave: { key: 'A', mode: 'minor', tempo: 108, meter: '4/4', lead: 'synthlead', counter: 'pad', chords: 'pad', comp: 'sustain', arp: 'synthpluck', arpRate: 1, bass: 'synthbass', bassPat: 'drive', kit: 'synth', reverb: 0.34, room: 3 },
    orchestral: { key: 'D', mode: 'minor', tempo: 96, meter: '4/4', lead: 'horn', counter: 'strings', chords: 'strings', comp: 'sustain', arp: 'harp', arpRate: 2, bass: 'cello', bassPat: 'rootfifth', kit: 'timpani', reverb: 0.42, room: 3.2 },
    taiko: { key: 'D', mode: 'in', tempo: 100, meter: '4/4', lead: 'shakuhachi', counter: 'koto', chords: 'koto', comp: 'strum', arp: 'koto', arpRate: 2, bass: 'bass', bassPat: 'drone', kit: 'taiko', reverb: 0.4, room: 3 },
    folk: { key: 'G', mode: 'dorian', tempo: 112, meter: '6/8', lead: 'flute', counter: 'fiddle', chords: 'guitar', comp: 'strum', arp: null, arpRate: 2, bass: 'bass', bassPat: 'rootfifth', kit: 'bodhran', reverb: 0.26, room: 2 },
    chiptune: { key: 'C', mode: 'major', tempo: 144, meter: '4/4', lead: 'chip', counter: 'chip2', chords: 'chip2', comp: 'offbeat', arp: 'chip2', arpRate: 1, bass: 'chipbass', bassPat: 'drive', kit: 'chip', reverb: 0.1, room: 1.2 },
    lofi: { key: 'F', mode: 'dorian', tempo: 84, meter: '4/4', lead: 'bell', counter: 'epiano', chords: 'epiano', comp: 'sustain', arp: null, arpRate: 2, bass: 'bass', bassPat: 'walk', kit: 'lofi', reverb: 0.3, room: 2.2, swing: 0.14 },
    tropical: { key: 'F', mode: 'mixolydian', tempo: 104, meter: '4/4', lead: 'marimba', counter: 'pluck', chords: 'guitar', comp: 'offbeat', arp: 'marimba', arpRate: 2, bass: 'bass', bassPat: 'reggae', kit: 'tropical', reverb: 0.24, room: 1.8 },
    cinematic: { key: 'E', mode: 'minor', tempo: 80, meter: '4/4', lead: 'strings', counter: 'horn', chords: 'pad', comp: 'sustain', arp: 'bell', arpRate: 2, bass: 'cello', bassPat: 'drone', kit: 'pulse', reverb: 0.48, room: 3.6 },
  };
  // where each role sits: octave of the tonic, mix level, pan, reverb send
  var ROLE = {
    lead: { oct: 5, level: 0.5, pan: 0.05, send: 0.3 }, counter: { oct: 4, level: 0.3, pan: -0.28, send: 0.35 },
    chords: { oct: 4, level: 0.26, pan: 0.18, send: 0.4 }, arp: { oct: 5, level: 0.2, pan: -0.12, send: 0.35 },
    bass: { oct: 2, level: 0.52, pan: 0, send: 0.06 }, drums: { oct: 0, level: 0.62, pan: 0, send: 0.14 }, sting: { oct: 5, level: 0.42, pan: 0, send: 0.4 },
  };
  // the energy each part joins at: 0 = the start screen, 1 = lap 1, 2 = mid-race, 3 = flat out
  var JOIN = { chords: 0, bass: 0, lead: 0, arp: 2, drums: 1, counter: 3 };
  var INSTRUMENTS = ['pluck', 'guitar', 'koto', 'harp', 'piano', 'epiano', 'marimba', 'bell', 'flute', 'shakuhachi', 'fiddle', 'strings', 'cello', 'horn', 'brass', 'pad', 'choir', 'synthlead', 'synthpluck', 'chip', 'chip2', 'bass', 'synthbass', 'chipbass'];
  var KITS = ['stadium', 'synth', 'timpani', 'taiko', 'bodhran', 'chip', 'lofi', 'tropical', 'pulse', 'none'];

  /* --------------------------------------------------------------- read -- */
  // the world's music option, checked and filled in from its style
  function read(o, seedText, warn) {
    warn = warn || function () {};
    if (!o || typeof o !== 'object') return null;
    var style = STYLES[o.style] ? o.style : 'anthem';
    if (o.style && !STYLES[o.style]) warn('music.style "' + o.style + '" is not a style; anthem was used. Styles: ' + Object.keys(STYLES).join(', ') + '.');
    var S = {}, base = STYLES[style], k;
    for (k in base) S[k] = base[k];
    if (typeof o.key === 'string' && KEYS[o.key] !== undefined) S.key = o.key; else if (o.key) warn('music.key must be a note name such as "D" or "F#".');
    if (typeof o.mode === 'string' && SCALES[o.mode]) S.mode = o.mode; else if (o.mode) warn('music.mode must be one of ' + Object.keys(SCALES).join(', ') + '.');
    if (isFinite(o.tempo) && o.tempo) S.tempo = clamp(Math.round(o.tempo), 60, 180);
    if (RH[o.meter]) S.meter = o.meter;
    ['lead', 'counter', 'chords', 'arp', 'bass'].forEach(function (r) {
      if (o[r] === null || o[r] === false) S[r] = null;
      else if (typeof o[r] === 'string') { if (INSTRUMENTS.indexOf(o[r]) >= 0) S[r] = o[r]; else warn('music.' + r + ' "' + o[r] + '" is not an instrument. Instruments: ' + INSTRUMENTS.join(', ') + '.'); }
    });
    if (typeof o.drums === 'string') { if (KITS.indexOf(o.drums) >= 0) S.kit = o.drums; else warn('music.drums "' + o.drums + '" is not a kit. Kits: ' + KITS.join(', ') + '.'); }
    if (o.drums === false || o.drums === null) S.kit = 'none';
    S.style = style;
    S.seed = hash(o.seed !== undefined ? o.seed : seedText || 'GameMog');
    S.song = compose(S);
    return S;
  }

  /* ------------------------------------------------------------ compose -- */
  function compose(S) {
    var R = rng(S.seed), scale = SCALES[S.mode], n = scale.length, M = RH[S.meter], steps = M.steps;
    var tonic = KEYS[S.key];
    var fam = n === 7 ? (MINORISH[S.mode] ? 'minor' : 'major') : 'penta';
    // the harmonic minor's leading tone is for its V chord; its melody keeps the natural seventh too
    function midiOf(deg, oct) { return 12 * (oct + 1) + tonic + 12 * Math.floor(deg / n) + scale[mod(deg, n)]; }
    // a five-note mode has no thirds to stack: its harmony is open, a root with
    // the fifth above it (or the fourth where the mode has no fifth) and the octave
    function openDeg(root) {
      var r = scale[mod(root, n)], i, iv;
      for (i = 1; i < n; i++) { iv = mod(scale[mod(root + i, n)] - r, 12); if (iv === 7) return root + i; }
      for (i = 1; i < n; i++) { iv = mod(scale[mod(root + i, n)] - r, 12); if (iv === 5) return root + i; }
      return root + 2;
    }
    function chordDegs(root) { return n === 7 ? [root, root + 2, root + 4] : [root, openDeg(root), root + n]; }
    function isChordTone(d, root) {
      if (n !== 7) { var iv = mod(scale[mod(d, n)] - scale[mod(root, n)], 12); return iv === 0 || iv === 5 || iv === 7; }
      var c = chordDegs(root); for (var i = 0; i < c.length; i++) if (mod(d - c[i], n) === 0) return true; return false;
    }
    var progA = pick(R, PROG[fam].A), progB = pick(R, PROG[fam].B);

    // --- the tune: a motif, its return, an answer, two cadences ---------
    function phrase(prog, center, lo, hi, halfEnd, fullEnd, motifFrom) {
      var ra = pick(R, M.body), rb = pick(R, M.body), rc = pick(R, M.body), rh = pick(R, M.cad), rf = pick(R, M.cad);
      if (motifFrom) ra = motifFrom.rhythm;
      var plan = [ra, rb, ra, rh, ra, rb, rc, rf], out = [], prev = center, last2 = null, first = null;
      for (var b = 0; b < 8; b++) {
        var root = prog[b], rhythm = plan[b], bar = [], step = 0;
        var reuse = (b === 4 && first) ? first : (b === 2 && first && R() < 0.55) ? first : null;
        if (reuse) {
          // the motif again: literally (bar 5), or as a sequence a step away (bar 3)
          var shift = b === 2 ? (R() < 0.5 ? 1 : -1) : 0, ok = true;
          reuse.forEach(function (nt) { if (nt.d !== null && nt.strong && !isChordTone(nt.d + shift, root)) ok = false; });
          if (!ok && shift) shift = 0;
          reuse.forEach(function (nt) { bar.push({ s: nt.s, l: nt.l, d: nt.d === null ? null : nt.d + shift, strong: nt.strong, v: nt.v }); });
          prev = bar.filter(function (x) { return x.d !== null; }).slice(-1)[0].d;
        } else {
          for (var i = 0; i < rhythm.length; i++) {
            var len = rhythm[i];
            if (len < 0) { bar.push({ s: step, l: -len, d: null }); step += -len; continue; }
            var strong = M.strong.indexOf(step) >= 0 || step % M.beat === 0, lastNote = i === rhythm.length - 1;
            var target = lastNote && b === 3 ? halfEnd : lastNote && b === 7 ? fullEnd : null, d;
            if (target !== null) {
              // cadence: the nearest octave of the target degree
              d = target; var best = 1e9;
              for (var o = -2; o <= 2; o++) { var cd = target + o * n; if (cd >= lo && cd <= hi && Math.abs(cd - prev) < best) { best = Math.abs(cd - prev); d = cd; } }
            } else d = nextDeg(prev, strong, root, lo, hi, center, last2);
            bar.push({ s: step, l: len, d: d, strong: strong, v: strong ? 0.86 : 0.72 });
            last2 = d - prev; prev = d; step += len;
          }
        }
        if (b === 0) first = bar;
        var arch = [0.9, 0.95, 1, 0.9, 0.92, 0.98, 1.04, 0.94][b];
        bar.forEach(function (nt) { if (nt.d !== null) out.push([b * steps + nt.s, nt.l, nt.d, (nt.v || 0.8) * arch]); });
      }
      return { notes: out, rhythm: ra };
    }
    function nextDeg(prev, strong, root, lo, hi, center, lastMove) {
      var items = [];
      for (var d = lo; d <= hi; d++) {
        var dist = Math.abs(d - prev), ct = isChordTone(d, root), semis = Math.abs(midiOf(d, 4) - midiOf(prev, 4)), w;
        // a singable line: nothing wider than a sixth, the odd octave
        if (semis > 9 && semis !== 12) continue;
        if (strong) w = ct ? [0.35, 1, 0.9, 0.55, 0.3, 0.12, 0.05][Math.min(dist, 6)] : 0.03;
        else w = [0.12, 1, 0.42, 0.12, 0.05, 0.02, 0.01][Math.min(dist, 6)] * (ct ? 1.25 : 1);
        // after a leap, step back the other way
        if (lastMove !== null && Math.abs(lastMove) >= 3 && Math.sign(d - prev) === -Math.sign(lastMove) && dist <= 2) w *= 2.5;
        w *= Math.exp(-0.5 * Math.pow((d - center) / (n * 0.7), 2));
        if (semis === 12) w *= 0.08;
        items.push([d, w]);
      }
      return weighted(R, items);
    }
    var tonicDeg = n; // the tune sits round the tonic an octave up
    var halfEnd = n === 7 ? 4 + n : 3 + n, fullEnd = n;
    var A = phrase(progA, tonicDeg + 1, tonicDeg - 3, tonicDeg + n, halfEnd, fullEnd);
    // A': the same tune, a stronger close on the last two bars
    var A2 = { notes: A.notes.slice() };
    var B = phrase(progB, tonicDeg + 3, tonicDeg - 1, tonicDeg + n + 2, halfEnd, halfEnd);

    // --- the parts under it, bar by bar -----------------------------------
    function voicing(root, prevV) {
      // three chord tones round middle C, nearest to the last voicing
      var c = chordDegs(root), best = null, bestCost = 1e9;
      for (var inv = 0; inv < 3; inv++) for (var o = -1; o <= 1; o++) {
        var v = [], ds = c.slice(inv).concat(c.slice(0, inv).map(function (x) { return x + n; }));
        ds.forEach(function (d) { v.push(midiOf(d, 3 + o + 1) - 0); });
        if (v[0] < 52 || v[2] > 72 || v[0] === v[1] || v[1] === v[2]) continue;
        v.sort(function (x, y) { return x - y; });
        var cost = prevV ? Math.abs(v[0] - prevV[0]) + Math.abs(v[1] - prevV[1]) + Math.abs(v[2] - prevV[2]) : Math.abs(v[1] - 62);
        if (cost < bestCost) { bestCost = cost; best = v; }
      }
      return best || c.map(function (d) { return midiOf(d, 4); });
    }
    function bassLine(root, nextRoot, pat) {
      var r = midiOf(root, 2), fifth = midiOf(root + (n === 7 ? 4 : 3), 2), oct = r + 12, next = midiOf(nextRoot, 2), ev = [];
      var half = steps / 2;
      if (pat === 'drone') ev.push([0, steps, r, 0.8]);
      else if (pat === 'rootfifth') { ev.push([0, half, r, 0.85]); ev.push([half, half, fifth > r + 7 ? fifth - 12 : fifth, 0.72]); }
      else if (pat === 'drive') { for (var s = 0; s < steps; s += 2) ev.push([s, 2, s === steps - 2 && next !== r ? next + (next > r ? -1 : 1) : (s % 8 === 6 ? oct : r), s % M.beat === 0 ? 0.85 : 0.66]); }
      else if (pat === 'reggae') { ev.push([0, 3, r, 0.85]); ev.push([6, 2, r, 0.6]); ev.push([8, 3, oct, 0.72]); ev.push([12, 2, fifth, 0.66]); }
      else if (pat === 'walk') { var w = [r, midiOf(root + 2, 2), fifth, next + (next > r ? -1 : 1)]; for (var q = 0; q < 4; q++) ev.push([q * 4, 4, w[q], q ? 0.62 : 0.8]); }
      else ev.push([0, half, r, 0.8]);
      return ev;
    }
    function comp(v, style) {
      var ev = [];
      if (style === 'strum') { var hits = S.meter === '6/8' ? [0, 6] : S.meter === '3/4' ? [0, 4, 8] : [0, 6, 8, 12]; hits.forEach(function (h, i) { v.forEach(function (m, j) { ev.push([h + j * 0.12, (hits[i + 1] || steps) - h, m, i ? 0.55 : 0.7]); }); }); }
      else if (style === 'offbeat') { for (var s = M.beat / 2; s < steps; s += M.beat) v.forEach(function (m) { ev.push([s, M.beat / 2, m, 0.62]); }); }
      else v.forEach(function (m) { ev.push([0, steps, m, 0.6]); });
      return ev;
    }
    function arp(v, rate) {
      var ev = [], seq = [v[0], v[1], v[2], v[0] + 12, v[2], v[1]];
      for (var s = 0, i = 0; s < steps; s += rate, i++) ev.push([s, rate, seq[i % seq.length] + 12, i % (M.beat / rate) === 0 ? 0.7 : 0.55]);
      return ev;
    }
    function counterLine(root, prevC) {
      var c = chordDegs(root), ev = [], hits = S.meter === '6/8' ? [0, 6] : S.meter === '3/4' ? [0] : [0, 8], len = steps / hits.length;
      hits.forEach(function (h, i) {
        var best = null, bc = 1e9;
        c.forEach(function (d) { for (var o = 2; o <= 4; o++) { var m = midiOf(d, o); if (m < 55 || m > 72) continue; var cost = prevC ? Math.abs(m - prevC) + (i ? 0 : 0) : Math.abs(m - 62); if (m === prevC) cost += 2.5; if (cost < bc) { bc = cost; best = m; } } });
        ev.push([h, len, best, 0.66]); prevC = best;
      });
      return { ev: ev, last: prevC };
    }

    // --- the drums ----------------------------------------------------------
    var KITPAT = {
      '4/4': {
        stadium: { 2: [['kick', 0], ['kick', 8], ['snare', 4], ['snare', 12]], 3: [['hat', 0, 2, 16]], fill: [['tom', 8], ['tom', 10], ['tom2', 12], ['snare', 14], ['snare', 15]] },
        synth: { 2: [['kick', 0], ['kick', 8], ['clap', 4], ['clap', 12]], 3: [['kick', 4], ['kick', 12], ['hat', 2, 4, 16], ['hat', 0, 1, 16, 0.35]], fill: [['clap', 12], ['clap', 13], ['clap', 14], ['clap', 15]] },
        timpani: { 1: [['timpani', 0]], 2: [['timpani', 8, 0, 0, 0.7]], 3: [['bigdrum', 0], ['bigdrum', 6, 0, 0, 0.6], ['bigdrum', 8], ['snare', 12, 0, 0, 0.5]], fill: [['timpani', 8], ['timpani', 10], ['timpani', 12], ['timpani', 13], ['timpani', 14], ['timpani', 15]] },
        taiko: { 1: [['odaiko', 0]], 2: [['odaiko', 8, 0, 0, 0.75], ['shime', 4], ['shime', 12]], 3: [['shime', 2, 4, 16, 0.55], ['ka', 7], ['ka', 15], ['odaiko', 6, 0, 0, 0.5]], fill: [['odaiko', 8], ['odaiko', 10], ['shime', 12], ['shime', 13], ['shime', 14], ['odaiko', 15]] },
        chip: { 2: [['chipkick', 0], ['chipkick', 8], ['chipsnare', 4], ['chipsnare', 12]], 3: [['chiphat', 2, 4, 16], ['chipkick', 10, 0, 0, 0.6]], fill: [['chipsnare', 12], ['chipsnare', 13], ['chipsnare', 14], ['chipsnare', 15]] },
        lofi: { 1: [['kick', 0, 0, 0, 0.7], ['kick', 10, 0, 0, 0.55]], 2: [['snare', 4, 0, 0, 0.55], ['snare', 12, 0, 0, 0.55]], 3: [['hat', 0, 2, 16, 0.4], ['shaker', 3, 4, 16, 0.3]], fill: [['snare', 14, 0, 0, 0.4]] },
        tropical: { 1: [['kick', 0], ['kick', 8]], 2: [['rim', 3], ['rim', 6], ['rim', 12]], 3: [['shaker', 0, 1, 16, 0.3], ['conga', 10], ['conga2', 14]], fill: [['conga', 12], ['conga', 13], ['conga2', 14], ['conga2', 15]] },
        pulse: { 1: [['timpani', 0, 0, 0, 0.6]], 2: [['bigdrum', 8, 0, 0, 0.55]], 3: [['bigdrum', 0], ['bigdrum', 10, 0, 0, 0.5], ['hat', 4, 8, 16, 0.3]], fill: [['timpani', 12], ['timpani', 14], ['timpani', 15]] },
        bodhran: { 2: [['bodhran', 0], ['bodhran', 8]], 3: [['bodhran2', 4], ['bodhran2', 12], ['shaker', 2, 4, 16, 0.3]], fill: [['bodhran2', 12], ['bodhran2', 13], ['bodhran', 14], ['bodhran', 15]] },
      },
      '6/8': {
        bodhran: { 1: [['bodhran', 0], ['bodhran', 6, 0, 0, 0.7]], 2: [['bodhran2', 2, 2, 12, 0.5]], 3: [['shaker', 1, 2, 12, 0.3]], fill: [['bodhran2', 6], ['bodhran2', 8], ['bodhran', 10], ['bodhran', 11]] },
      },
      '3/4': {
        stadium: { 2: [['kick', 0], ['snare', 4], ['snare', 8]], 3: [['hat', 0, 2, 12]], fill: [['tom', 6], ['tom2', 8], ['snare', 10], ['snare', 11]] },
      },
    };
    var kitTable = (KITPAT[S.meter] || {})[S.kit] || KITPAT['4/4'][S.kit] || null;
    function drumBar(fill, crash) {
      var ev = [];
      if (!kitTable || S.kit === 'none') return ev;
      [1, 2, 3].forEach(function (e) {
        (kitTable[e] || []).forEach(function (h) {
          var nm = h[0], at = h[1], every = h[2], upto = h[3], v = h[4] || 0.8;
          if (every) for (var s = at; s < (upto || steps); s += every) ev.push([s, nm, v * (s % M.beat === 0 ? 1 : 0.8), e]);
          else if (at < steps) ev.push([at, nm, v, e]);
        });
      });
      if (fill && kitTable.fill) { var from = kitTable.fill[0][1]; ev = ev.filter(function (x) { return x[0] < from || x[3] < 2; }); kitTable.fill.forEach(function (h) { if (h[1] < steps) ev.push([h[1], h[0], 0.75 + 0.2 * (h[1] / steps), 3]); }); }
      if (crash) ev.push([0, S.kit === 'taiko' ? 'odaiko' : S.kit === 'chip' ? 'chipcrash' : 'crash', 0.7, 3]);
      return ev;
    }

    // --- the form: intro, then A A' B A round and round ----------------------
    var bars = [], prevV = null, prevC = null;
    function addSection(name, prog, mel, isIntro) {
      for (var b = 0; b < prog.length; b++) {
        var root = prog[b], v = voicing(root, prevV); prevV = v;
        var c = counterLine(root, prevC); prevC = c.last;
        var lead = [];
        if (mel) mel.notes.forEach(function (x) { if (Math.floor(x[0] / steps) === b) lead.push([x[0] - b * steps, x[1], midiOf(x[2], 4 + 0), x[3]]); });
        bars.push({
          section: name, bar: b, root: root, chord: v.slice(),
          lead: isIntro ? [] : lead, chords: comp(v, S.comp), arp: arp(v, S.arpRate || 2), bass: bassLine(root, prog[(b + 1) % prog.length], S.bassPat),
          counter: c.ev, drums: drumBar(b === prog.length - 1, b === 0 && !isIntro),
        });
      }
    }
    addSection('intro', progA.slice(0, 4), null, true);
    var loopStart = bars.length;
    addSection('A', progA, A); addSection('A', progA, A2); addSection('B', progB, B); addSection('A', progA, A);
    return { bars: bars, loopStart: loopStart, steps: steps, beat: M.beat, stepDur: 60 / S.tempo / 4, key: S.key, mode: S.mode, tonic: tonic, scale: scale,
      chordDegs: chordDegs, midiOf: midiOf, progA: progA, progB: progB };
  }

  /* -------------------------------------------------------- instruments -- */
  // a kit per AudioContext: shared noise, waves and a hall
  function kit(ac) {
    var sr = ac.sampleRate, nb = ac.createBuffer(1, sr * 2, sr), ch = nb.getChannelData(0);
    for (var i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    function pulse(duty) { var N = 32, re = new Float32Array(N), im = new Float32Array(N); for (var h = 1; h < N; h++) im[h] = (2 / (h * Math.PI)) * Math.sin(h * Math.PI * duty); return ac.createPeriodicWave(re, im); }
    return { ac: ac, noise: nb, pulse25: pulse(0.25), pulse50: pulse(0.5) };
  }
  function osc(k, type, f, t) { var o = k.ac.createOscillator(); if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type); o.frequency.setValueAtTime(f, t); return o; }
  function gain(k, v) { var g = k.ac.createGain(); g.gain.value = v === undefined ? 1 : v; return g; }
  function filt(k, type, f, q) { var b = k.ac.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q !== undefined) b.Q.value = q; return b; }
  function noiseSrc(k, t, dur) { var s = k.ac.createBufferSource(); s.buffer = k.noise; s.loop = true; s.start(t, Math.random() * 1.5, dur + 0.05); return s; }
  // attack, then a decay toward sustain, then a release at the note's end
  function env(p, t, a, peak, d, sus, end, r) {
    p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + a);
    if (d) p.setTargetAtTime(peak * sus, t + a, d);
    p.setTargetAtTime(0, Math.max(t + a, end), r);
  }
  function stopAll(nodes, when) { nodes.forEach(function (o) { try { o.stop(when); } catch (e) { } }); }
  function vibrato(k, o, t, rate, depth, delay) { var l = osc(k, 'sine', rate, t), g = gain(k, 0); g.gain.setValueAtTime(0, t + delay); g.gain.linearRampToValueAtTime(depth, t + delay + 0.3); l.connect(g); g.connect(o.detune); l.start(t); return l; }

  function pluckVoice(k, out, t, f, dur, vel, o) {
    var end = t + dur, stop = end + 1.2, a = osc(k, o.w1 || 'sawtooth', f, t), b = osc(k, o.w2 || 'square', f * (o.ratio || 1), t);
    b.detune.value = o.detune || 6; var bm = gain(k, o.mix2 === undefined ? 0.45 : o.mix2);
    var lp = filt(k, 'lowpass', 1000, o.q || 0.9); lp.frequency.setValueAtTime(Math.min(11000, f * (o.bright || 8) * (0.6 + vel)), t); lp.frequency.setTargetAtTime(f * (o.floor || 1.5), t + 0.005, o.fdecay || 0.14);
    var g = gain(k, 0); env(g.gain, t, 0.003, 0.34 * vel, o.decay || 0.5, 0, end + (o.ring || 0.05), 0.09);
    if (o.bend) { a.frequency.setValueAtTime(f * o.bend, t); a.frequency.setTargetAtTime(f, t + 0.01, 0.03); }
    a.connect(lp); b.connect(bm); bm.connect(lp); lp.connect(g); g.connect(out);
    a.start(t); b.start(t); stopAll([a, b], stop);
  }
  function windVoice(k, out, t, f, dur, vel, o, ch) {
    // a flute, a whistle, a shakuhachi: a pure tone with breath in it, a vibrato that grows, a glide from the last note when slurred
    var end = t + dur, stop = end + 0.5, a = osc(k, 'sine', f, t), b = osc(k, 'triangle', f, t), bm = gain(k, o.tri || 0.3);
    if (ch.last && ch.lastEnd > t - 0.03 && ch.lastEnd < t + 0.02) { a.frequency.setValueAtTime(ch.last, t); a.frequency.setTargetAtTime(f, t, 0.035); b.frequency.setValueAtTime(ch.last, t); b.frequency.setTargetAtTime(f, t, 0.035); }
    else if (o.scoop) { a.detune.setValueAtTime(-o.scoop, t); a.detune.linearRampToValueAtTime(0, t + 0.12); b.detune.setValueAtTime(-o.scoop, t); b.detune.linearRampToValueAtTime(0, t + 0.12); }
    var lv = [vibrato(k, a, t, o.vib || 5.2, o.vibDepth || 14, o.vibDelay || 0.28), vibrato(k, b, t, o.vib || 5.2, o.vibDepth || 14, o.vibDelay || 0.28)];
    var lp = filt(k, 'lowpass', f * (o.bright || 3.5), 0.7), g = gain(k, 0);
    env(g.gain, t, o.attack || 0.07, 0.3 * (0.6 + 0.4 * vel), 0.3, 0.85, end, 0.07);
    a.connect(lp); b.connect(bm); bm.connect(lp); lp.connect(g); g.connect(out);
    // breath: noise through a narrow band at the pitch, strongest at the attack
    var nz = noiseSrc(k, t, dur + 0.4), bp = filt(k, 'bandpass', f, o.q || 9), ng = gain(k, 0);
    env(ng.gain, t, 0.02, (o.breath || 0.25) * vel, 0.08, 0.35, end, 0.05);
    nz.connect(bp); bp.connect(ng); ng.connect(out);
    a.start(t); b.start(t); stopAll([a, b].concat(lv), stop);
    ch.last = f; ch.lastEnd = end;
  }
  function bowVoice(k, out, t, f, dur, vel, o) {
    // strings, horns, brass and pads: detuned saws, a filter that opens with the bow or the breath
    var end = t + dur, stop = end + (o.release || 0.4) * 5, oscs = [], g = gain(k, 0), lp = filt(k, 'lowpass', 1000, o.q || 0.8);
    (o.detunes || [-7, 0, 7]).forEach(function (dt) { var s = osc(k, o.wave || 'sawtooth', f, t); s.detune.value = dt; s.connect(lp); oscs.push(s); });
    if (o.sub) { var sb = osc(k, 'triangle', f / 2, t), sg = gain(k, o.sub); sb.connect(sg); sg.connect(lp); oscs.push(sb); }
    var open = Math.min(12000, f * (o.bright || 6) * (0.55 + 0.6 * vel));
    lp.frequency.setValueAtTime(o.swell ? f * 1.5 : open, t); if (o.swell) lp.frequency.setTargetAtTime(open, t, o.swell);
    env(g.gain, t, o.attack || 0.12, (o.level || 0.16) * (0.55 + 0.45 * vel) / Math.sqrt(oscs.length), 0.4, 0.9, end, o.release || 0.25);
    var lv = oscs.map(function (s) { return vibrato(k, s, t, o.vib || 5.5, o.vibDepth || 8, 0.35); });
    lp.connect(g); g.connect(out); oscs.forEach(function (s) { s.start(t); }); stopAll(oscs.concat(lv), stop);
  }
  function malletVoice(k, out, t, f, dur, vel, o) {
    // piano, e-piano, marimba, bells, harp: partials that die away at their own rates
    var end = t + dur, parts = o.parts, g = gain(k, 1), nodes = [];
    parts.forEach(function (p) {
      var s = osc(k, p[3] || 'sine', f * p[0], t), pg = gain(k, 0); pg.gain.setValueAtTime(0, t); pg.gain.linearRampToValueAtTime(p[1] * 0.3 * vel, t + (o.attack || 0.004));
      pg.gain.setTargetAtTime(0, t + (o.attack || 0.004), p[2] * (o.low && f < 300 ? 1.6 : 1)); if (o.damp) pg.gain.setTargetAtTime(0, end + 0.02, 0.07);
      s.connect(pg); pg.connect(g); nodes.push(s);
    });
    if (o.fm) { var mo = osc(k, 'sine', f * o.fm[0], t), mg = gain(k, 0); mg.gain.setValueAtTime(f * o.fm[1] * vel, t); mg.gain.setTargetAtTime(f * o.fm[1] * 0.1, t, o.fm[2]); mo.connect(mg); mg.connect(nodes[0].frequency); nodes.push(mo); }
    g.connect(out); nodes.forEach(function (s) { s.start(t); }); stopAll(nodes, end + Math.max.apply(null, parts.map(function (p) { return p[2]; })) * 5 + 0.1);
  }
  function chipVoice(k, out, t, f, dur, vel, o) {
    var end = t + dur, s = osc(k, o.wave || k.pulse25, f, t), g = gain(k, 0);
    env(g.gain, t, 0.002, 0.16 * vel, 0.12, o.sus || 0.6, end - 0.01, 0.02);
    if (o.vib) vibrato(k, s, t, 6, 18, 0.2).stop(end + 0.2);
    s.connect(g); g.connect(out); s.start(t); s.stop(end + 0.2);
  }
  function bassVoice(k, out, t, f, dur, vel, o) {
    var end = t + dur, s = osc(k, 'sine', f, t), w = osc(k, o.wave || 'sawtooth', f, t), wm = gain(k, o.grit || 0.35), lp = filt(k, 'lowpass', 300, o.q || 1.4), g = gain(k, 0);
    lp.frequency.setValueAtTime(f * (o.open || 6), t); lp.frequency.setTargetAtTime(f * 2.2, t + 0.01, o.fdecay || 0.12);
    env(g.gain, t, 0.006, 0.5 * (0.6 + 0.4 * vel), o.decay || 0.5, o.sus === undefined ? 0.55 : o.sus, end - 0.02, 0.05);
    s.connect(g); w.connect(wm); wm.connect(lp); lp.connect(g); g.connect(out); s.start(t); w.start(t); stopAll([s, w], end + 0.4);
  }
  var VOICE = {
    pluck: function (k, out, t, f, d, v) { pluckVoice(k, out, t, f, d, v, { decay: 0.45, bright: 7 }); },
    guitar: function (k, out, t, f, d, v) { pluckVoice(k, out, t, f, d, v, { decay: 0.7, bright: 5, w2: 'triangle', mix2: 0.6, floor: 1.3, ring: 0.2 }); },
    koto: function (k, out, t, f, d, v) { pluckVoice(k, out, t, f, d, v, { decay: 0.85, bright: 10, w2: 'triangle', ratio: 2, mix2: 0.25, bend: 1.012, floor: 2.2, fdecay: 0.2, ring: 0.3 }); },
    synthpluck: function (k, out, t, f, d, v) { pluckVoice(k, out, t, f, d, v, { decay: 0.22, bright: 12, q: 5, w2: 'sawtooth', detune: 12, fdecay: 0.07 }); },
    harp: function (k, out, t, f, d, v) { malletVoice(k, out, t, f, d, v, { parts: [[1, 1, 1.3, 'triangle'], [2, 0.3, 0.6], [3, 0.1, 0.3]], low: true }); },
    piano: function (k, out, t, f, d, v) { malletVoice(k, out, t, f, d, v, { parts: [[1, 1, 1.1], [2, 0.42, 0.55], [3, 0.2, 0.3], [4, 0.1, 0.18]], damp: true, low: true }); },
    epiano: function (k, out, t, f, d, v) { malletVoice(k, out, t, f, d, v, { parts: [[1, 1, 1.4], [14, 0.05, 0.05]], fm: [1, 2.2, 0.35], damp: true }); },
    marimba: function (k, out, t, f, d, v) { malletVoice(k, out, t, f, d, v, { parts: [[1, 1, 0.42], [4, 0.32, 0.07], [9.9, 0.1, 0.025]] }); },
    bell: function (k, out, t, f, d, v) { malletVoice(k, out, t, f, d, v, { parts: [[1, 0.9, 1.6], [2.76, 0.3, 0.7], [5.4, 0.12, 0.3]], fm: [3.5, 1.4, 0.6] }); },
    flute: function (k, out, t, f, d, v, ch) { windVoice(k, out, t, f, d, v, { breath: 0.22 }, ch); },
    shakuhachi: function (k, out, t, f, d, v, ch) { windVoice(k, out, t, f, d, v, { breath: 0.55, scoop: 70, vib: 4.6, vibDepth: 22, vibDelay: 0.35, bright: 2.6, tri: 0.2, q: 6, attack: 0.09 }, ch); },
    fiddle: function (k, out, t, f, d, v) { bowVoice(k, out, t, f, d, v, { detunes: [-4, 4], bright: 7, attack: 0.05, vibDepth: 12, level: 0.2 }); },
    strings: function (k, out, t, f, d, v) { bowVoice(k, out, t, f, d, v, { detunes: [-9, 0, 8], bright: 5, attack: 0.16, release: 0.35 }); },
    cello: function (k, out, t, f, d, v) { bowVoice(k, out, t, f, d, v, { detunes: [-5, 5], bright: 5, attack: 0.08, release: 0.2, level: 0.26 }); },
    horn: function (k, out, t, f, d, v) { bowVoice(k, out, t, f, d, v, { detunes: [-3, 3], bright: 3.2, attack: 0.07, swell: 0.08, vibDepth: 5, level: 0.2 }); },
    brass: function (k, out, t, f, d, v) { bowVoice(k, out, t, f, d, v, { detunes: [-6, 0, 6], bright: 5.5, attack: 0.03, swell: 0.05, vibDepth: 6, level: 0.19 }); },
    pad: function (k, out, t, f, d, v) { bowVoice(k, out, t, f, d, v, { detunes: [-12, -4, 5, 13], bright: 2.6, attack: 0.5, release: 0.9, sub: 0.3, vibDepth: 4, level: 0.14 }); },
    choir: function (k, out, t, f, d, v) { bowVoice(k, out, t, f, d, v, { detunes: [-8, 0, 9], bright: 2.2, attack: 0.3, release: 0.5, vibDepth: 10, level: 0.15 }); },
    synthlead: function (k, out, t, f, d, v) { bowVoice(k, out, t, f, d, v, { detunes: [-10, 10], wave: 'square', bright: 6, q: 3, attack: 0.01, release: 0.12, vibDepth: 12, level: 0.18 }); },
    chip: function (k, out, t, f, d, v) { chipVoice(k, out, t, f, d, v, { vib: true }); },
    chip2: function (k, out, t, f, d, v) { chipVoice(k, out, t, f, d, v, { wave: k.pulse50, sus: 0.4 }); },
    bass: function (k, out, t, f, d, v) { bassVoice(k, out, t, f, d, v, {}); },
    synthbass: function (k, out, t, f, d, v) { bassVoice(k, out, t, f, d, v, { grit: 0.8, open: 10, q: 5, fdecay: 0.09, sus: 0.7 }); },
    chipbass: function (k, out, t, f, d, v) { bassVoice(k, out, t, f, d, v, { wave: 'triangle', grit: 1, open: 20, sus: 0.9 }); },
  };
  // drums: one hit each
  function drum(k, out, name, t, vel) {
    var ac = k.ac, g, s, n, f;
    function thump(f0, f1, tau, lvl, wave) { var o = osc(k, wave || 'sine', f0, t), og = gain(k, 0); o.frequency.setTargetAtTime(f1, t, tau * 0.35); og.gain.setValueAtTime(lvl * vel, t); og.gain.setTargetAtTime(0, t + 0.002, tau); o.connect(og); og.connect(out); o.start(t); o.stop(t + tau * 6); }
    function hiss(type, f0, q, tau, lvl, dur) { var z = noiseSrc(k, t, dur || tau * 5), bf = filt(k, type, f0, q), zg = gain(k, 0); zg.gain.setValueAtTime(lvl * vel, t); zg.gain.setTargetAtTime(0, t + 0.001, tau); z.connect(bf); bf.connect(zg); zg.connect(out); }
    switch (name) {
      case 'kick': thump(160, 46, 0.2, 0.95); hiss('highpass', 3000, 0.7, 0.004, 0.25); break;
      case 'snare': hiss('bandpass', 2600, 0.8, 0.11, 0.55); thump(200, 170, 0.07, 0.3, 'triangle'); break;
      case 'clap': [0, 0.011, 0.023].forEach(function (d) { var z = noiseSrc(k, t + d, 0.2), bf = filt(k, 'bandpass', 1500, 1.8), zg = gain(k, 0); zg.gain.setValueAtTime(0.5 * vel, t + d); zg.gain.setTargetAtTime(0, t + d + 0.001, d > 0.02 ? 0.09 : 0.012); z.connect(bf); bf.connect(zg); zg.connect(out); }); break;
      case 'hat': hiss('highpass', 7800, 0.7, 0.028, 0.28); break;
      case 'shaker': hiss('bandpass', 6500, 1.4, 0.03, 0.22); break;
      case 'rim': hiss('bandpass', 2200, 6, 0.018, 0.6); thump(620, 600, 0.03, 0.2, 'triangle'); break;
      case 'tom': thump(190, 110, 0.22, 0.7); break;
      case 'tom2': thump(140, 80, 0.26, 0.75); break;
      case 'crash': hiss('highpass', 5200, 0.6, 0.9, 0.22, 3); hiss('bandpass', 9000, 1, 0.5, 0.12, 2.5); break;
      case 'odaiko': thump(118, 56, 0.55, 1.05); hiss('lowpass', 420, 0.8, 0.09, 0.55); thump(190, 150, 0.08, 0.25); break;
      case 'shime': thump(540, 440, 0.07, 0.35); hiss('bandpass', 3200, 2, 0.025, 0.3); break;
      case 'ka': hiss('bandpass', 2400, 5, 0.016, 0.55); break;
      case 'timpani': thump(74, 72, 1.0, 0.85); hiss('lowpass', 600, 0.7, 0.06, 0.35); break;
      case 'bigdrum': thump(90, 55, 0.35, 0.9); hiss('lowpass', 500, 0.7, 0.05, 0.4); break;
      case 'bodhran': thump(105, 72, 0.2, 0.85); hiss('lowpass', 900, 0.7, 0.04, 0.3); break;
      case 'bodhran2': thump(190, 150, 0.08, 0.45); hiss('bandpass', 1800, 1, 0.02, 0.2); break;
      case 'conga': thump(330, 300, 0.14, 0.45); hiss('bandpass', 1600, 2, 0.015, 0.2); break;
      case 'conga2': thump(240, 220, 0.16, 0.45); hiss('bandpass', 1300, 2, 0.015, 0.2); break;
      case 'chipkick': thump(140, 40, 0.07, 0.6, k.pulse50); break;
      case 'chipsnare': hiss('lowpass', 7000, 0.5, 0.08, 0.5); break;
      case 'chiphat': hiss('highpass', 9000, 0.5, 0.02, 0.3); break;
      case 'chipcrash': hiss('lowpass', 9000, 0.5, 0.45, 0.3, 2); break;
    }
    void ac; void g; void s; void n; void f;
  }

  /* -------------------------------------------------------------- mixer -- */
  // instruments into channels, channels into the score bus and a hall; the
  // bus through a gentle glue compressor, then the level that normalises it
  function hall(k, secs) {
    var ac = k.ac, sr = ac.sampleRate, len = Math.floor(sr * secs), ir = ac.createBuffer(2, len, sr);
    for (var c = 0; c < 2; c++) {
      var d = ir.getChannelData(c), lp = 0, R = rng(97 + c);
      for (var i = 0; i < len; i++) { var tt = i / sr, x = (R() * 2 - 1) * Math.exp(-tt / (secs * 0.28)); lp += (x - lp) * (0.35 - 0.25 * Math.min(1, tt / secs)); d[i] = tt < 0.012 ? 0 : lp; }
    }
    var cv = ac.createConvolver(); cv.buffer = ir; return cv;
  }
  function mixer(k, S, out) {
    var ac = k.ac, bus = gain(k, 1), hp = filt(k, 'highpass', 32, 0.6), dip = filt(k, 'peaking', 300, 0.8), air = filt(k, 'highshelf', 6500);
    dip.gain.value = -2; air.gain.value = 1.5;
    var comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 2.2; comp.attack.value = 0.02; comp.release.value = 0.25;
    var level = gain(k, 1), duck = gain(k, 1), verb = hall(k, S.room || 2.4), send = gain(k, 1), ret = gain(k, (S.reverb || 0.3) * 1.2);
    bus.connect(hp); hp.connect(dip); dip.connect(air); air.connect(comp); send.connect(verb); verb.connect(ret); ret.connect(comp);
    comp.connect(level); level.connect(duck); duck.connect(out);
    var chans = {};
    function channel(role) {
      if (chans[role]) return chans[role];
      var r = ROLE[role], g = gain(k, r.level), p = ac.createStereoPanner ? ac.createStereoPanner() : null, sg = gain(k, r.send);
      if (p) { p.pan.value = r.pan; g.connect(p); p.connect(bus); } else g.connect(bus);
      g.connect(sg); sg.connect(send);
      return (chans[role] = { input: g, last: 0, lastEnd: -1 });
    }
    return { channel: channel, level: level, duck: duck, comp: comp };
  }

  /* ----------------------------------------------------------- schedule -- */
  // one bar of the song at time T, the parts that belong at this energy
  function scheduleBar(k, mx, S, bar, T, energy, song) {
    var sd = song.stepDur, swing = S.swing || 0;
    function at(step) { var s = Math.floor(step), frac = step - s; var sw = (s % 2 === 1) ? swing * sd * 2 : 0; return T + (s + frac) * sd + sw; }
    function part(role, inst, list, legato) {
      if (!inst || !list || energy < (JOIN[role] || 0)) return;
      var ch = mx.channel(role), fn = VOICE[inst];
      list.forEach(function (e) {
        var v = e[3] * (role === 'lead' && energy === 0 ? 0.8 : 1);
        fn(k, ch.input, at(e[0]) + (Math.random() - 0.5) * 0.006, mtof(e[2]), Math.max(0.05, e[1] * sd * (legato || 0.92)), clamp(v, 0.05, 1), ch);
      });
    }
    part('chords', S.chords, bar.chords, 1);
    part('bass', S.bass, energy === 0 ? bar.bass.slice(0, 1).map(function (e) { return [e[0], song.steps, e[2], 0.7]; }) : bar.bass, 0.9);
    part('lead', S.lead, bar.lead, 0.95);
    if (S.arp && bar.arp && energy >= 2) part('arp', S.arp, bar.arp, 0.8);
    if (S.counter && energy >= 3) part('counter', S.counter, bar.counter, 0.97);
    if (S.kit !== 'none' && energy >= 1) {
      var ch = mx.channel('drums');
      bar.drums.forEach(function (e) { if (e[3] <= energy) drum(k, ch.input, e[1], at(e[0]), clamp(e[2] * (energy === 1 ? 0.8 : 1), 0.05, 1)); });
    }
  }

  /* ------------------------------------------------------------ measure -- */
  // loudness of the full arrangement (BS.1770-style: K-weighted, 400 ms
  // blocks, gated), rendered offline before anyone presses play
  function loudness(buf) {
    var sr = buf.sampleRate, block = Math.floor(sr * 0.4), hop = Math.floor(block / 4), chans = [], c, peak = 0;
    for (c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
    var ms = [];
    for (var s = 0; s + block <= buf.length; s += hop) {
      var sum = 0;
      for (c = 0; c < chans.length; c++) { var d = chans[c], acc = 0; for (var i = s; i < s + block; i++) acc += d[i] * d[i]; sum += acc / block; }
      ms.push(sum);
    }
    for (c = 0; c < chans.length; c++) for (var j = 0; j < chans[c].length; j++) peak = Math.max(peak, Math.abs(chans[c][j]));
    function L(x) { return -0.691 + 10 * Math.log10(Math.max(1e-12, x)); }
    var abs = ms.filter(function (x) { return L(x) > -70; }); if (!abs.length) return { lufs: -70, peak: peak };
    var mean = abs.reduce(function (a, b) { return a + b; }, 0) / abs.length, rel = L(mean) - 10;
    var gated = abs.filter(function (x) { return L(x) > rel; });
    return { lufs: L(gated.reduce(function (a, b) { return a + b; }, 0) / gated.length), peak: peak };
  }
  // the song offline: `bars` bars from the top of A at an energy, through the
  // score's own mixer (K-weighted when measuring)
  function render(S, bars, energy, sr, weighted, fromBar) {
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return Promise.resolve(null);
    var song = S.song, barDur = song.steps * song.stepDur, len = barDur * bars + 2;
    var ac = new OAC(2, Math.ceil(sr * len), sr), k = kit(ac), dest = ac.destination;
    if (weighted) {
      // K-weighting: a high shelf for the head, a high pass for the room
      var kw1 = ac.createBiquadFilter(); kw1.type = 'highshelf'; kw1.frequency.value = 1681; kw1.gain.value = 4;
      var kw2 = ac.createBiquadFilter(); kw2.type = 'highpass'; kw2.frequency.value = 38; kw2.Q.value = 0.5;
      kw1.connect(kw2); kw2.connect(dest); dest = kw1;
    }
    var tap = ac.createGain(); tap.gain.value = weighted ? 1 : (S.measured ? clamp(Math.pow(10, (-16 - S.measured.lufs) / 20), 0.1, 8) : 1); tap.connect(dest);
    var mx = mixer(k, S, tap), start = fromBar === undefined ? song.loopStart : fromBar;
    for (var b = 0; b < bars; b++) scheduleBar(k, mx, S, song.bars[(start + b) % song.bars.length] || song.bars[song.loopStart + (b % (song.bars.length - song.loopStart))], 0.05 + b * barDur, typeof energy === 'function' ? energy(b) : energy, song);
    return ac.startRendering();
  }
  function measure(S) {
    return render(S, 8, 3, 24000, true).then(function (buf) { return buf ? loudness(buf) : null; });
  }

  /* ------------------------------------------------------------- player -- */
  // plays the song live: bars scheduled a little ahead, the energy asked of
  // it, beats reported, stings in the song's key, ducking under effects
  function player(ac, out, S, opts) {
    opts = opts || {};
    var k = kit(ac), song = S.song, mx = mixer(k, S, out), barDur = song.steps * song.stepDur;
    var target = opts.target === undefined ? -18 : opts.target;
    var state = { playing: false, bar: 0, nextBar: 0, energy: 0, want: 0, beats: [], gain: 1, stopping: false };
    mx.level.gain.value = 0.0001;
    function setLevel(lufs) {
      state.gain = lufs === null ? 1 : clamp(Math.pow(10, (target - lufs) / 20), 0.1, 8);
      mx.level.gain.setTargetAtTime(state.gain, ac.currentTime, 0.4);
    }
    if (S.measured) setLevel(S.measured.lufs);
    function start(fromIntro) {
      state.playing = true; state.stopping = false;
      state.bar = fromIntro ? 0 : song.loopStart;
      state.nextBar = ac.currentTime + 0.12; state.beats = [];
      mx.duck.gain.cancelScheduledValues(ac.currentTime); mx.duck.gain.setValueAtTime(1, ac.currentTime);
      mx.level.gain.cancelScheduledValues(ac.currentTime); mx.level.gain.setTargetAtTime(state.gain, ac.currentTime, 0.2);
    }
    function stop(fade) {
      if (!state.playing) return;
      state.stopping = true;
      mx.duck.gain.cancelScheduledValues(ac.currentTime); mx.duck.gain.setTargetAtTime(0.0001, ac.currentTime, (fade || 1.2) / 3);
      setTimeout(function () { if (state.stopping) state.playing = false; }, (fade || 1.2) * 1000);
    }
    function update(energy, onBeat) {
      state.want = energy;
      if (!state.playing) return;
      var now = ac.currentTime;
      while (state.nextBar < now + 0.35 && !state.stopping) {
        // a change of energy lands on the bar line
        state.energy = state.want;
        var bi = state.bar, bar = song.bars[bi];
        scheduleBar(k, mx, S, bar, state.nextBar, state.energy, song);
        for (var s = 0; s < song.steps; s += song.beat) state.beats.push({ t: state.nextBar + s * song.stepDur, bar: bi, beat: s / song.beat, section: bar.section });
        state.nextBar += barDur;
        state.bar = bi + 1 >= song.bars.length ? song.loopStart : bi + 1;
      }
      while (state.beats.length && state.beats[0].t <= now) { var b = state.beats.shift(); if (onBeat) onBeat(b); }
    }
    function duck(amount, hold) {
      var g = mx.duck.gain, now = ac.currentTime, to = Math.pow(10, -(amount || 4) / 20);
      if (state.stopping) return;
      g.cancelScheduledValues(now); g.setTargetAtTime(to, now, 0.012); g.setTargetAtTime(1, now + (hold || 0.12), 0.22);
    }
    // stings: a figure on the tonic chord in the song's own key, through the score
    function sting(kind) {
      var now = ac.currentTime + 0.02, ch = mx.channel('sting'), inst = VOICE[S.lead || 'bell'] ? (S.lead || 'bell') : 'bell';
      var c = song.chordDegs(0), notes;
      if (kind === 'lap') notes = [c[0], c[1], c[2], c[0] + SCALES[S.mode].length];
      else if (kind === 'bounty') notes = [c[0], c[1], c[2], c[0] + SCALES[S.mode].length, c[1] + SCALES[S.mode].length, c[2] + SCALES[S.mode].length];
      else notes = [c[2], c[1], c[0], c[0] - 1];
      var dt = kind === 'crash' ? 0.16 : 0.085;
      notes.forEach(function (d, i) { VOICE[kind === 'crash' ? 'bell' : inst](k, ch.input, now + i * dt, mtof(song.midiOf(d, 4)), i === notes.length - 1 ? 0.7 : 0.18, 0.85, ch); });
      if (kind !== 'crash' && S.kit !== 'none') drum(k, mx.channel('drums').input, S.kit === 'taiko' ? 'odaiko' : 'crash', now, 0.8);
    }
    return { start: start, stop: stop, update: update, duck: duck, sting: sting, setLevel: setLevel, state: state, song: song, style: S, duckLevel: function () { return +mx.duck.gain.value.toFixed(3); } };
  }

  // the song as notes, for checks: every bar's parts with their chord
  function score(S) {
    var song = S.song;
    return {
      beat: song.beat, steps: song.steps, scale: song.scale.map(function (x) { return (x + song.tonic) % 12; }), loopStart: song.loopStart,
      bars: song.bars.map(function (b) { return { section: b.section, root: b.root, chord: b.chord, lead: b.lead.map(function (e) { return [e[0], e[1], e[2]]; }), bass: b.bass.map(function (e) { return e[2]; }), drums: b.drums.length }; }),
    };
  }

  return { read: read, measure: measure, render: render, loudness: loudness, player: player, score: score, styles: Object.keys(STYLES), instruments: INSTRUMENTS, kits: KITS, scales: Object.keys(SCALES), STYLES: STYLES, SCALES: SCALES };
})();
