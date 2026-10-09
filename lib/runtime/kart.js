    /* ======================================================= kart racing == */
    // Included into boot() in v1.js, and only for a kart world: lib/custom-game.ts fills the marker for a world
    // whose GameMog.world names kart: { ... } among its own keys, and every other world's runtime stays as it was,
    // byte for byte. It shares the runtime's closure: three.js, the scene, the track and its frames, the HUD's
    // glass, the screens, the touch kit and the loop.
    //
    // A kart race (Meme Kart, the owner 6 Oct: "3 laps, 8 karts ... bumping + items (contact never ends the run)")
    // is not the endless lap. Eight karts line up on a grid, the lights count down (gas on the "1" is a Moon Launch),
    // and the race is three laps of the world's track with places, a hop into a drift that charges a mini-turbo,
    // slipstreams, boost pads, ramps to trick off, mud, walls you glance, scrape or bonk off, and karts that shove
    // each other and never end anyone's run; fall in the water and the Rescue Claw puts you back. Then a podium,
    // and the results. The world says what the karts and the place look like; the runtime runs the race.
    //
    // Two layers. The race itself (kartSim) is arithmetic on a table of the track at a fixed 120 steps a second, at
    // most six a frame, with no three.js and no page in it, and every random choice it makes comes from one seeded
    // generator: the same seed and the same inputs give the same race. Your inputs are logged a step at a time (two
    // bytes each), so a race can be run again from its log and end the same, to the last bit. Everything seen and
    // heard (kartWorld) reads it, and draws each kart between the last two steps.
    //
    // The racers are the roster's (kart-roster.js, below: ctx.kart.racer), or the world's own; the items are the
    // race's own (kart-items.js, below), whatever the world; and the score, for a world that asks for it
    // (kart.score), the race's own too (kart-music.js, below).
    /*@include kart-roster.js*/
    /*@include kart-items.js*/
    /*@include kart-music.js*/

    // The numbers (the plan's picks, 6 Oct: mechanics.md's, where the surveys disagreed). Normal class: a top speed
    // of 31 m/s (26.5 until the owner's third review, 7 Oct: "normal cart speed needs to increase, karting is slightly
    // too slow": every speed 1.17 times what it was, KART_PACE below), the gas reaching it at a rate of 1.6 (95% in
    // 1.9 s, so 17% more push too), the brake pulling toward 8 m/s in reverse at 3; a hop of 0.28 s, 0.32 m high; a
    // drift's tiers at a charge of 0.6, 1.6 and 2.2 (it charges 1.17 a second steering into the drift, 0.88 neutral,
    // 0.64 counter-steering: a bend gives the tier it gave at the old speed), each a boost of +20% for 0.6, 1.1 or
    // 1.8 s. Boosts
    // never add up: the strongest running wins, a weaker one only stretches the time, and nothing passes 1.45 times
    // the top speed. Off the road, grass holds you to 0.55 of it, mud 0.40 (a drift's, a pad's or a trick's boost
    // halves that). A wall met under 30 degrees is a glance (97% kept), up to 60 a scrape, past it a bonk (back off it
    // at 0.3 of the speed, 6 m/s at most, the nose turned 25 degrees off the wall, 0.25 s without control). GM: each
    // coin 0.6% more top speed, 6% at most.
    // The rivals: 0.95 to 1.005 of the top, and never over 1.06 of it without an item, catch-up and all.
    // (The playtest, 7 Oct: the drift's own pivot turns at about 24 m at the top speed, so most of To The Moon's bends
    // are drifted counter-steering; at 0.4 a second there, and the tiers at 0.7 and 2.7, ten of a key driver's fifteen
    // drifts paid nothing and MOG was out of reach even on the ideal line (2.5 at most). At 0.55, 0.6 and 2.2 a
    // competent driver's lap is Green Candle in the pond's left, Gold at the hairpin, and MOG into the climb and
    // round the long right home. The rivals 0.94 to 1.00 let a line-perfect driver who never drifted win; 0.95 to
    // 1.005 makes that a podium, and the win the drifter's.)
    var KART_D2R = Math.PI / 180;
    // (the owner's third review, 7 Oct: the race 1.17 times as fast, 26.5 -> 31 m/s. Everything that is a speed or a
    // rate of turning is scaled by it, so a kart at the same share of its top speed takes the same line through a
    // bend, a drift there earns the tier it did, and the field races as it did, only faster: the top speeds, the turn
    // (the full-lock radius at a share of the top is what it was, so the yaw is 1.17 times), the drift's yaw and its
    // charge, the keys' and the stick's rates, the rivals' braking for a bend, the gaps the catch-up reads, the laser
    // and the rocket. What is a time (a hop, a boost, the roulette), a height or a distance on the road is not)
    var KART_PACE = 31 / 26.5;
    // the items' names, the race's own (the DNA: a Mog may weigh them, never rename them), and their ids
    var KITEM_NAME = { gmbag: 'GM Bag', rug: 'Rug Pull', wallet: 'Cold Wallet', laser: 'Laser Eyes', pump: 'Pump', wow: 'Much Wow', fud: 'FUD Cloud', whale: 'WHALE DUMP', diamond: 'Diamond Hands', moon: 'To The Moon' };
    var KITEM_ID = { gmbag: 'gmbag', bag: 'gmbag', rugpull: 'rug', rug: 'rug', coldwallet: 'wallet', wallet: 'wallet', lasereyes: 'laser', laser: 'laser', pump: 'pump', muchwow: 'wow', wow: 'wow',
      fudcloud: 'fud', fud: 'fud', whaledump: 'whale', whale: 'whale', diamondhands: 'diamond', diamond: 'diamond', tothemoon: 'moon', moon: 'moon' };
    function kartRules(cls) {
      var P = KART_PACE, top = cls === 'chill' ? 27.3 : cls === 'degen' ? 35 : 31;
      return {
        step: 1 / 120, maxSteps: 6, top: top,
        reach: 1.6, coast: 0.6, brake: 3, reverse: -8,
        hopTurn: 1.3, hopT: 0.28, hopH: 0.32, grace: 0.15, slipN: 7 * KART_D2R, slipD: 18 * KART_D2R,
        // the handling (the owner, 7 Oct: "when doing corners it is too stiff ... turning is tough to control", "turning
        // is SOOO tough and not smooth"). Until then a key reached full lock at 4 a second (0.25 s behind it, most of a
        // short tap's turn coming after the key was let go), and the turn was one ceiling of 0.8 rad/s: 31 m at the top
        // speed, To The Moon's tightest bends on full lock with nothing left, so a key driver met 27 walls a lap and 13
        // bonks. Now:
        // - the turn: a full-lock radius of R0 + Rc v^2 metres, never more than wPeak rad/s: 3.9 m at 30 km/h, 8.7 at
        //   60, 16.5 at 90, 18.2 at the top speed, 23.4 at 110 (boosted); full lock at the top speed scrubs up to 6% of
        //   it (never drifting, nor in the air)
        // - a key: nearly half lock (keyIn) the step it goes down, then keyRise a second (90% at 0.14 s, all of it at
        //   0.17); let go, straight in 0.1 s (keyFall); the other key, straight through zero at keyFlip, then keyIn the
        //   new way; in a drift a key moves the steer keyDrift a second either way, so taps find the radii between
        // - a stick (touch, a pad): followed at stickLam, 90% in 0.13 s (10 a second until 7 Oct)
        // - the drift: dW rad/s steering neutral, dSpan times that steering in and a dOut-th of it counter-steering, on
        //   a smooth curve between (12.5, 25 and 75 m at 90 km/h; until 7 Oct 13, 22 and 78, a key's three states and
        //   nothing between); a hop turns no faster than the ground does, or hopW rad/s where that is less
        // - the slip, the picture's only: up to slipN at full lock and the top speed (drifting, slipD)
        // - the rivals plan their corners at aiLock of full lock
        // Measured on To The Moon (seven keyboard drivers, a 180 ms reaction): a lap 60.5 s -> 48.4, walls 27 -> 5.5 a
        // lap, bonks 13.4 -> 0.1, and three of the seven that could not finish two laps in 150 s -> none
        // (7 Oct, round 3, KART_PACE: Rc down by its square, the rates up by it: 18.2 m at the top speed as before,
        // now 31 m/s; at 90 km/h 12.7 m)
        hd: { wPeak: 2.3 * P, R0: 2.4, Rc: 0.0225 / (P * P), keyIn: 0.45, keyRise: 3.2 * P, keyFall: 10 * P, keyFlip: 14 * P, keyDrift: 3.5 * P, stickLam: 18 * P, scrub: 0.06, dW: 1.0 * P, dSpan: 2, dOut: 3, aiLock: 0.85, bonkTurn: 25, hopW: 1.3 * P },
        driftMin: 0.45, driftDrop: 0.35,
        charge: [1.0 * P, 0.75 * P, 0.55 * P], tiers: [0.6, 1.6, 2.2], tierCap: 0.2, tierT: [0.6, 1.1, 1.8],
        boostOn: 7, boostOff: 1.2, hard: 1.45,
        // the Moon Launch: the gas going down 0.9 to 0.6 s before GO (as the "1" lands) is a perfect start, 0.6 to
        // 0.3 a good one; held since before 1.4 s floods it (0.6 s of wheelspin). On touch the windows are half again
        // as wide
        launch: { perfect: [-0.9, -0.6], good: [-0.6, -0.3], flood: -1.4, perfectT: 1.2, goodT: 0.5, cap: 0.2, spin: 0.6, touch: 1.5 },
        // the slipstream: 4 to 14 m behind a kart and within 1.6 m of its line, 1.1 s fills it (up to +4% on the way),
        // then +15% for a second; out of it, it drains twice as fast
        draft: { near: 4, far: 14, lat: 1.6, fill: 1.1, cap: 0.04, boost: 0.15, T: 1.0, min: 0.5 },
        pad: { cap: 0.28, T: 1.0, len: 3.5, w: 2.5 },
        // ramps: 18 m/s/s, a small lip throws you up at 6 m/s, a big one 9; Space within 0.35 s of the lip is a trick,
        // paid on landing (+20% for 0.7 or 1.0 s)
        ramp: { g: 18, small: 6, big: 9, window: 0.35, cap: 0.2, T: [0.7, 1.0] },
        surf: { grass: 0.55, shoulder: 0.75, mud: 0.4 }, surfIn: 3,
        // the walls (7 Oct: kinder, so a bend misjudged is a glance and on, and a bonk is one bonk, not a loop of them:
        // at a crawl the kart could not turn off the wall it had just met, and the gas after the bounce met it square
        // again)
        glance: 30, scrape: 60, glanceKeep: 0.97, scrapeKeep: 0.85, scrapeBack: 0.25, scrapeSteer: 1, scrapeT: 0.1,
        bonk: 0.3, bonkMax: 6, stun: 0.25, wedgeV: 1.5, wedgeT: 1.2, nudge: 0.3,
        // karts: two circles of 0.65 m half a metre fore and aft (a capsule), restitution 0.65 (0.5 until 7 Oct: the
        // owner's "bumps, road rage"); a shove across of 3.6 m/s at least (3), 8% off the kart that runs into the back
        // of another, a 0.35 s wobble from a side hit over 8 m/s; a pair touches again only after 0.25 s
        radius: 0.65, half: 0.5, restitution: 0.65, shove: 3.6, rear: 0.08, wobbleV: 8, wobbleT: 0.35, pairT: 0.25,
        gates: 16, wrongDeg: 110, wrongT: 1,
        // the Rescue Claw: 0.5 s falling, then 1.0 s on the claw down to the racing line, 12 m back at least, rolling
        // at 0.4 of the top, a ghost for a second, and 2 GM lighter; 0.4 s in deep water, or 3 m under the road, calls it.
        // Set down square to the road, with a hand on the wheel for 1.2 s (your steering at 0.3 of itself, easing up to
        // all of it, and the rest holding the road's heading); and called again within 12 s and 60 m of the last time,
        // it sets you down past what you fell into, 6 m on (and 12 m more each time after that): 8 Oct, a person on the
        // keys reacting in 0.25 s was set down 30 m before the crater gap, the key still held from the fall, and fell
        // in again, 59 times running
        claw: { fall: 0.5, lift: 1.0, back: 12, v: 0.4, ghost: 1, gm: 2, wet: 0.4, deep: 3, high: 5, assist: 1.2, hand: 0.3, again: 12, near: 60, past: 6, on: 12, clear: 2.5 },
        gm: { per: 0.006, max: 10, line: 5, gap: 3, r: 1.3 },
        // (the catch-up's gaps stay in metres at the faster race, 7 Oct, round 3, so the same gaps are 15% tighter in
        // seconds: scaled with the speed, the field ran 105 to 140 m first to last, against 51 to 95 before)
        ai: { pace: cls === 'chill' ? [0.88, 0.94] : cls === 'degen' ? [0.99, 1.03] : [0.95, 1.005], ceiling: 1.06, late: 1.03, ahead: 150, near: 60, behind: 200, lam: 0.5, seen: 50,
          swerve: 2.5, perfect: cls === 'chill' ? 0.2 : cls === 'degen' ? 0.75 : 0.45, good: 0.3, trick: 0.75, pad: 0.85,
          // the pack (the owner, 7 Oct: "more chaotic fun ... players interacting with each other"): from 12% to 75% of
          // the race the catch-up holds the field tighter round you, easing a rival 50 m ahead (not 150) to 0.94 (not
          // 0.95) and finding more for one 20 m behind (not 60), all of it by 80 m (not 200); out of your sight only,
          // and never past 1.06, as before. And a rival without an item steers for a crate in a row ahead, seven
          // times in ten
          pack: { from: 0.12, to: 0.75, ahead: 50, near: 20, behind: 80, ease: 0.94 }, crate: 0.7 },
        endAfter: 25,
        // (the owner, 7 Oct: "needs more chaotic fun, in terms of roads, breaks, jumps and players interacting with
        // each other in terms of bumps, road rage etc.")
        // the charge jump: Space held with no steer (under a quarter of the stick) after the hop lands charges it; let
        // go after 0.25 s and the kart jumps, from 3.4 m/s up to 4.4 at a full charge (0.6 s): 0.41 to 0.63 m high
        // (a hop is 0.32), 0.55 to 0.7 s in the air with the hang. A steer while it charges starts a drift that way,
        // as before
        cj: { min: 0.25, full: 0.6, vy: [3.4, 4.4], steer: 0.25 },
        // in the air, gravity eases to 0.55 of itself while the kart is near the top (under 2 m/s up or down): the
        // hang that makes a jump feel floaty
        hang: 0.55, hangV: 2,
        // rails: caught coming down onto one (from 0.3 m under its top to 0.55 over it, within 1 m across), the kart
        // grinds along it, its speed rising to +12% over 1.03 s; Space hops off (4.2 m/s up, 4.5 m/s to the side it
        // steers), and off the end it pops up at 3 m/s; either way the grind is paid: +20% for 0.4 s, to 1.0 s after
        // a grind of 1.03 s or more (1.2 s until the faster race, 7 Oct, round 3: 1.2 over KART_PACE, the same metres
        // of rail). A rail's end within 3 m along and 1.5 m across of the next one's start carries on
        rail: { below: 0.3, above: 0.55, snap: 1.0, cap: 0.12, rise: 1.2 / P, exitCap: 0.2, exitT: [0.4, 1.0], hopV: 4.2, side: 4.5, endV: 3, link: [3, 1.5] },
        // bumps on the road: a roller (4 m a hump), a bump (3 m) or a lip (1.6 m, a step up), crossed over 12 m/s
        // throws the kart up off its crest (2.6, 3.2 or 4.0 m/s at the top speed, less slower); Space within 0.35 s
        // of it is a trick, +15% for 0.5 s on landing
        bump: { roller: [4, 0.3, 2.6], bump: [3, 0.35, 3.2], lip: [1.6, 0.3, 4.0], min: 12, cap: 0.15, T: 0.5 },
        // a break in the road: no road there; a kart on the ground over it falls, and the Claw sets it down 30 m
        // before the break at least (a run-up for the jump)
        brk: { runup: 30 },
        // a hop-bash: hopping sideways into a kart (the hop's direction, or the stick, toward it) shoves it 6.5 m/s
        // across (times your mass over its mass, 0.6 to 1.8), wobbles it 0.5 s, takes 8% off its speed, and knocks a
        // GM out of it; then it cannot be bashed for 1.2 s. A side knock over 8 m/s knocks a GM loose too (2 s apart at
        // most), and each rival starts with 2 GM to lose (its purse). The weights in a bump: a kart's mass squared, so
        // a heavy one shoves a light one well off its line
        bash: { push: 6.5, wob: 0.5, slow: 0.92, iframe: 1.2, snatch: 2, ratio: [0.6, 1.8] }, purse: 2,
        // road rage: a rival bumped hard (over 4 m/s; any bump for Bull Run and Big Bear), bashed, or hit by a kart's
        // item, is angry for 4 s at whoever did it: it hunts that kart (its line, a bash alongside, its item at it),
        // then calms, and is not angry again for 6 s
        rage: { T: 4, cool: 6, bump: 4 },
        // the course's hazards (course.hazards): a hit spins 0.8 s at 0.45 of the speed; a bonk (the rolling coin)
        // knocks 0.35 s at 0.4 and shoves 6 m/s; a second untouchable after either, as an item's
        haz: { spinT: 0.8, spinMul: 0.45, bonkT: 0.35, bonkMul: 0.4, push: 6, iframe: 1 },
        // the items (mechanics.md section 6): Airdrop crates in rows, back 1 s after one is taken (1.5 until the owner's
        // "more chaotic fun", 7 Oct: items flying all race); the roulette spins
        // 1.2 s (a tap stops it, at 0.5 s at the soonest); one slot. Each item's numbers are its own, below; every
        // item hit is followed by a second untouchable; one WHALE DUMP at a time, 30 s apart and none in the first 20 s;
        // two Diamond Hands, two To The Moon and three Laser Eyes at once at most, and no To The Moon within 200 m of
        // the finish (a roll that would break a limit is rolled again). The odds: a row a place (+1 more than 120 m
        // behind the leader, +2 more than 300 m), in the order of ids
        items: {
          ids: ['gmbag', 'rug', 'wallet', 'laser', 'pump', 'wow', 'fud', 'whale', 'diamond', 'moon'],
          odds: [[30, 35, 20, 10, 5, 0, 0, 0, 0, 0], [15, 25, 15, 25, 15, 0, 5, 0, 0, 0], [8, 18, 10, 28, 22, 6, 8, 0, 0, 0], [4, 12, 6, 26, 26, 14, 10, 2, 0, 0],
            [0, 8, 2, 24, 22, 22, 10, 4, 8, 0], [0, 4, 0, 16, 18, 29, 10, 5, 12, 6], [0, 0, 0, 12, 12, 28, 9, 5, 18, 16], [0, 0, 0, 8, 8, 27, 6, 5, 22, 24]],
          behind: [120, 300], crate: 1.25, respawn: 1.0, roll: 1.2, stop: 0.5, iframe: 1, spill: 6, caps: { diamond: 2, moon: 2, laser: 3 },
          bag: 3,
          // Rug Pull: 1.6 m wide and 0.12 m tall, dropped behind (2.4 m back) or lobbed to land 20 m ahead (0.6 s in the
          // air); 30 s on the road, three an owner; whoever drives onto it spins a second at 0.35 of their speed, 1 GM
          // lighter; its owner can drive over it for its first 0.4 s
          rug: { w: 1.6, h: 0.12, back: 2.4, lob: 20, lobT: 0.6, life: 30, per: 3, arm: 0.4, T: 1.0, mul: 0.35, gm: 1 },
          wallet: 12,
          // Laser Eyes: at the next kart ahead within 120 m, at 1.5 times your speed (46.8 m/s at least), turning 150
          // degrees a second, for 4 s; a hit tumbles 0.9 s at 0.30 of the speed and spills 3 GM. Fired back, straight
          laser: { range: 120, min: 40 * P, mul: 1.5, turn: 150 * KART_D2R, life: 4, r: 1.0, T: 0.9, mul2: 0.3, spill: 3, clear: 0.2 },
          pump: { cap: 0.32, T: 1.2 }, wow: { cap: 0.32, T: 1.0, n: 3 },
          // FUD Cloud: everyone ahead of you, a moment later: a storm cloud over each one's kart, raining red arrows
          // down on it, its pace 8% down for 2.5 s (a person's: a boost clears it twice as fast), a rival's line shaken
          // too (its noise three times). (Until the owner's third review, 7 Oct, "a giant blue cloud appears with red
          // down arrows ... it blocks entire view, that shouldn't happen": a person was not slowed but blinded, an ink
          // splat over the middle 35% of the screen for 3.5 s, the road and the next bend under it; now nothing of it
          // is ever over the road ahead or your kart)
          fud: { T: 2.5, ai: 2.5, pace: 0.92, noise: 2.1, delay: 0.35 },
          // WHALE DUMP: on the leader as it is fired; its shadow follows them 2.5 s, the aim locks 0.25 s before the
          // slam, and everyone within 8.2 m of it flips for 1.6 s at 0.20 of their speed, spilling 3 GM. (7 m until the
          // faster race, 7 Oct, round 3: in the 0.25 s after the lock a kart at 31 m/s goes 7.75 m, out of 7 m without
          // a boost; 7 times KART_PACE keeps the rule, a boost at the lock gets you out and nothing less does)
          whale: { T: 2.5, lock: 0.25, r: 7 * P, flipT: 1.6, mul: 0.2, spill: 3, gap: 30, first: 20 },
          diamond: { T: 6, cap: 0.12, spinT: 1.0, mul: 0.35 },
          moon: { T: 3.5, v: 40 * P, vmul: 1.5, after: 0.8, finish: 200, y: 0.45 },
          // the rivals with an item: how long before they use it, and how often they hop a trap / boost out from under
          // a Whale (Chill, Normal, Degen)
          // (react: 0.9, 0.6 and 0.35 until 7 Oct; a shield dragged 5 s at most, not 8)
          react: cls === 'chill' ? 0.7 : cls === 'degen' ? 0.28 : 0.45, holdMax: 5, hop: cls === 'chill' ? 0.1 : cls === 'degen' ? 0.65 : 0.35, dodge: cls === 'chill' ? 0 : cls === 'degen' ? 0.7 : 0.3,
        },
      };
    }

    /* ---------------------------------------------------------- the sim -- */
    // TR, the track as a table: n samples ds metres apart (px, py, pz), the level tangent (tx, tz) and the right
    // (rx, rz) at each, the half width (hw), where the walls stand (wall, from the centre line) and the course on it
    // (course: pads, ramps, off-road, wall gaps, GM lines). opts: laps, class, seed, the karts' stats ({ top, accel,
    // handling, mass, drift, skill }), which kart is a person's (human), the grid.
    function kartSim(TR, opts) {
      var K = kartRules(opts.cls), n = TR.n, ds = TR.ds, Lt = TR.L, GL = Lt / K.gates;
      var CO = TR.course || { pads: [], ramps: [], off: [], gaps: [], gm: 0, verge: 'grass' };
      // (the road's chaos, 7 Oct: breaks, rails, bumps and hazards; none, where the course names none)
      ['breaks', 'rails', 'bumps', 'hazards'].forEach(function (key) { if (!CO[key]) CO[key] = []; });
      var S = { t: 0, time: 0, count: 0, count0: 0, phase: 'grid', laps: opts.laps, seed: opts.seed >>> 0, rng: null, acc: 0, steps: 0, karts: [], finishers: 0, line: null, events: [], rules: K, human: opts.human,
        goAt: -1, log: new Uint16Array(120 * 240), logN: 0, marks: [], coins: [], pair: new Float32Array(64), course: CO,
        // the items: the crates, the rugs on the road (and in the air), the lasers flying, the Whale, the FUD on its
        // way, the GM spilled; the world's weights (one a kind, 1 as it comes), and whether there are items at all
        crates: [], traps: [], shots: [], whale: null, whaleAt: -1e9, fuds: [], spill: [], uid: 1, itemsOn: opts.items !== false, weights: opts.weights || null, eager: opts.eager || null,
        // each racer's road manner (its persona, by the roster's id), and the course's hazards as they run
        persona: opts.persona || null, haz: [] };
      function wrap(d) { d = d % Lt; return d < 0 ? d + Lt : d; }
      function relD(a, b) { var x = wrap(a - b); return x > Lt / 2 ? x - Lt : x; }
      function idx(i) { i = i % n; return i < 0 ? i + n : i; }
      function dampTo(a, b, lam, dt) { return a + (b - a) * (1 - Math.exp(-lam * dt)); }
      function cl(v, a, b) { return v < a ? a : v > b ? b : v; }
      // (d within len metres on from d0, round the loop)
      function within(d, d0, len) { return wrap(d - d0) <= len; }

      // the racing line: the centre line's offsets relaxed, inside the road (1.2 m from either edge), until the
      // line bends as little as it can (wide in, the apex, wide out); then its radius at every sample, and the
      // fastest a kart may go there, turning normally and drifting
      S.line = (function () {
        var lim = Math.max(0.5, TR.hw - 1.2);
        // (each point moved, along its own cross-track line, toward where it bends the line least between its two
        // neighbours either side, (-a + 4b + 4c - d) / 6, and a little past it, which settles it far sooner; first
        // on a coarse line, a point every 16 m, where the long bends settle quickly, then every 4 m from there)
        function relax(M, from, passes) {
          var R0 = { M: M, off: new Float64Array(M), bx: new Float64Array(M), bz: new Float64Array(M), brx: new Float64Array(M), brz: new Float64Array(M) }, j, it;
          for (j = 0; j < M; j++) {
            var s0 = idx(Math.round(j * Lt / M / ds));
            R0.bx[j] = TR.px[s0]; R0.bz[j] = TR.pz[s0]; R0.brx[j] = TR.rx[s0]; R0.brz[j] = TR.rz[s0];
            if (from) { var f = j / M * from.M, a0 = Math.floor(f) % from.M, a1 = (a0 + 1) % from.M; R0.off[j] = from.off[a0] + (from.off[a1] - from.off[a0]) * (f - Math.floor(f)); }
          }
          var off = R0.off, bx = R0.bx, bz = R0.bz, brx = R0.brx, brz = R0.brz;
          for (it = 0; it < passes; it++) for (j = 0; j < M; j++) {
            var a = (j + M - 2) % M, b = (j + M - 1) % M, c2 = (j + 1) % M, e = (j + 2) % M;
            var tx = (-(bx[a] + brx[a] * off[a]) + 4 * (bx[b] + brx[b] * off[b]) + 4 * (bx[c2] + brx[c2] * off[c2]) - (bx[e] + brx[e] * off[e])) / 6;
            var tz = (-(bz[a] + brz[a] * off[a]) + 4 * (bz[b] + brz[b] * off[b]) + 4 * (bz[c2] + brz[c2] * off[c2]) - (bz[e] + brz[e] * off[e])) / 6;
            var o = off[j] + 1.7 * ((tx - bx[j]) * brx[j] + (tz - bz[j]) * brz[j] - off[j]);
            off[j] = o < -lim ? -lim : o > lim ? lim : o;
          }
          return R0;
        }
        var C = relax(Math.max(24, Math.round(Lt / 16)), null, 6000), F = relax(Math.max(60, Math.round(Lt / 4)), C, 2500);
        var M = F.M, off = F.off, qx = new Float64Array(M), qz = new Float64Array(M), j;
        for (j = 0; j < M; j++) { qx[j] = F.bx[j] + F.brx[j] * off[j]; qz[j] = F.bz[j] + F.brz[j] * off[j]; }
        // signed radius (positive turns left, the way the heading grows) over a chord of four samples either side
        var rad = new Float64Array(M);
        for (j = 0; j < M; j++) {
          var p = (j + M - 2) % M, q = (j + 2) % M;
          var ux = qx[j] - qx[p], uz = qz[j] - qz[p], vx = qx[q] - qx[j], vz = qz[q] - qz[j];
          var ang = Math.atan2(ux * vz - uz * vx, ux * vx + uz * vz), len = (Math.hypot(ux, uz) + Math.hypot(vx, vz)) / 2;
          rad[j] = Math.abs(ang) > 1e-5 ? -len / ang : 1e6;
        }
        var L1 = { off: new Float64Array(n), r: new Float64Array(n), vn: new Float64Array(n), vd: new Float64Array(n) };
        for (var i = 0; i < n; i++) {
          var f = i * ds / Lt * M, j0 = Math.floor(f) % M, j1 = (j0 + 1) % M, u = f - Math.floor(f);
          L1.off[i] = off[j0] + (off[j1] - off[j0]) * u;
          var r0 = rad[j0], r1 = rad[j1];
          L1.r[i] = Math.abs(r0) < Math.abs(r1) ? r0 : r1;
        }
        // the corner speeds (turning normally, and drifting with a little steer in hand), then braked for in advance
        // (14 m/s/s, inside what the brakes do; 7 Oct, round 3: times KART_PACE squared, so a rival brakes for a bend
        // where it did, from the faster speed)
        var A = 14 * KART_PACE * KART_PACE;
        // (7 Oct: off the new turn, at aiLock of full lock: v = sqrt((aiLock R - R0) / Rc); a drift's at a little steer in)
        var HD = K.hd;
        for (i = 0; i < n; i++) { var R = Math.abs(L1.r[i]); L1.vn[i] = Math.min(60, Math.sqrt(Math.max(0, HD.aiLock * R - HD.R0) / HD.Rc)); L1.vd[i] = Math.min(60, HD.dW * Math.pow(HD.dSpan, 0.6) * R); }
        for (var pass = 0; pass < 2; pass++) for (i = n - 1; i >= 0; i--) {
          var nx = idx(i + 1);
          L1.vn[i] = Math.min(L1.vn[i], Math.sqrt(L1.vn[nx] * L1.vn[nx] + 2 * A * ds));
          L1.vd[i] = Math.min(L1.vd[i], Math.sqrt(L1.vd[nx] * L1.vd[nx] + 2 * A * ds));
        }
        return L1;
      })();

      // where a point is on the track: the nearest sample (searched from the last one known, or the whole table),
      // then the distance along (d) and across (lat, metres to the right of the centre line)
      function project(k, full) {
        var i = k.i, best, bd, j;
        if (full || i < 0) {
          bd = Infinity; best = 0;
          for (j = 0; j < n; j++) { var ex = TR.px[j] - k.x, ez = TR.pz[j] - k.z, dd = ex * ex + ez * ez; if (dd < bd) { bd = dd; best = j; } }
        } else {
          best = i; bd = (TR.px[i] - k.x) * (TR.px[i] - k.x) + (TR.pz[i] - k.z) * (TR.pz[i] - k.z);
          for (var dir = -1; dir <= 1; dir += 2) for (var step = 1; step < 40; step++) {
            j = idx(i + dir * step);
            var d2 = (TR.px[j] - k.x) * (TR.px[j] - k.x) + (TR.pz[j] - k.z) * (TR.pz[j] - k.z);
            if (d2 < bd) { bd = d2; best = j; } else if (step > 2) break;
          }
        }
        k.i = best;
        var ox = k.x - TR.px[best], oz = k.z - TR.pz[best], along = ox * TR.tx[best] + oz * TR.tz[best];
        k.d = wrap(best * ds + along);
        k.lat = ox * TR.rx[best] + oz * TR.rz[best];
        // (the height under it read between the two samples it lies between: until 7 Oct the nearest one's, a 1 m
        // staircase that shook every kart on a slope, 11 to 25 cm a step up the Candle Climb and up to 65 cm down Buy
        // the Dip's drops, against the camera's smooth rise; the owner saw it at the crates on the climb, "the kart
        // starts to suddenly and unexplainably stutter". Drawn only: the race reads heights over the road, never this)
        // (and the share of the way to the next sample by the ground between them, not by the metre: the samples are a
        // metre apart along the road itself, nearer than that across the ground where it climbs or drops, so read by
        // the metre the height stopped short and jumped at each new sample, 2 to 9 cm a step down Buy the Dip's second
        // drop, a judder at 30 m/s, 7 Oct; gd, where along the road the kart is drawn, is read the same way: the race's
        // own d jumps ahead there, 16 cm a sample, and is left as it is)
        var nb = idx(best + (along >= 0 ? 1 : -1)), hx = TR.px[nb] - TR.px[best], hz = TR.pz[nb] - TR.pz[best], u = Math.min(1, Math.abs(along) / (Math.sqrt(hx * hx + hz * hz) || ds));
        k.gd = wrap(best * ds + (along >= 0 ? u : -u) * ds);
        k.ground = TR.py[best] + (TR.py[nb] - TR.py[best]) * u;
      }

      /* -------- the course, as the sim reads it -- */
      // what the ground under a kart is worth: 1 on the road; past its edge the verge (grass, unless the course
      // says otherwise), and the course's own patches (mud, grass, a shoulder) wherever they lie
      function surface(k) {
        var m = Math.abs(k.lat) > TR.hw ? K.surf[CO.verge] || K.surf.grass : 1;
        for (var q = 0; q < CO.off.length; q++) { var P = CO.off[q]; if (k.lat >= P.x0 && k.lat <= P.x1 && within(k.d, P.d0, P.len) && P.mul < m) m = P.mul; }
        return m;
      }
      // a gap in the wall on this side (1 right, -1 left) here, or null
      function gapAt(d, side) {
        for (var q = 0; q < CO.gaps.length; q++) { var G = CO.gaps[q]; if ((G.side === 0 || G.side === side) && within(d, G.d0, G.len)) return G; }
        return null;
      }
      S.gapAt = gapAt; S.surface = surface;
      // a break in the road under this point (along d, lat across), or null
      function breakAt(d, lat) {
        for (var q = 0; q < CO.breaks.length; q++) { var B = CO.breaks[q]; if (lat >= B.x0 && lat <= B.x1 && within(d, B.d0, B.len)) return B; }
        return null;
      }
      // a rail's lateral and its top at d (its points [d, x], d on from its start), or NaN off it
      function railLat(R0, d) {
        var u = wrap(d - R0.d0);
        if (u > R0.len) return NaN;
        var P = R0.pts;
        for (var q = 1; q < P.length; q++) if (u <= P[q][0]) { var f = (u - P[q - 1][0]) / Math.max(1e-6, P[q][0] - P[q - 1][0]); return P[q - 1][1] + (P[q][1] - P[q - 1][1]) * f; }
        return P[P.length - 1][1];
      }
      // a bump under this point: its index, and the height of the road on it (bH)
      var bH = 0;
      function bumpAt(d, lat) {
        for (var q = 0; q < CO.bumps.length; q++) {
          var B = CO.bumps[q];
          if (Math.abs(lat - B.x) > B.w / 2 || !within(d, B.d0, B.len * B.n)) continue;
          var u = wrap(d - B.d0) / B.len, f = u - Math.floor(u);
          // (a hump's crest is its middle; a lip rises all the way to its edge)
          bH = B.kind === 'lip' ? B.h * f : B.h * Math.sin(Math.PI * f) * Math.sin(Math.PI * f);
          return q;
        }
        return -1;
      }
      S.breakAt = breakAt; S.railLat = railLat; S.bumpAt = function (d, lat) { var q = bumpAt(d, lat); return q < 0 ? null : { q: q, h: bH }; };

      function make(slot, st) {
        return {
          slot: slot, human: false, auto: false, assist: null,
          ai: { lane: 0, skill: 1, drift: 1, want: 0, dir: 0, slow: 0, rev: 0, revSteer: 0, skip: -1, el: 1, swerve: 0, trickGo: false, padSeen: -1, padGo: false,
            wait: -1, hold: 0, tap: false, trap: 0, trapHop: false, shot: 0, shotHop: false, whale: false, whaleGo: false, eager: 1,
            // its road manner, its rage (how long, at whom, and the cool-down after), a bash's cool-down, a jump it is
            // charging (and what for), the rail and the crate row it chose, a slingshot out of a slipstream
            persona: '', mad: 0, madAt: -1, calm: 0, ramT: 0, ramSeen: -1, ramGo: false, bash: 0, hunting: -1, cj: 0, cjFor: '', cjAt: 0, railSeen: -1, railGo: false, crateSeen: -1, crateGo: false, sling: 0, slingTo: 0, metSeen: -1, metGo: false },
          top: K.top * cl(st.top || 1, 0.95, 1.05), accel: cl(st.accel || 1, 0.85, 1.2), hand: cl(st.handling || 1, 0.9, 1.1), mass: cl(st.mass || 1, 0.8, 1.4), dc: cl(st.drift || 1, 0.9, 1.15),
          x: 0, z: 0, y: 0, h: 0, yaw: 0, slip: 0, v: 0, w: 0, steer: 0, pushX: 0, pushZ: 0,
          i: -1, d: 0, lat: 0, ground: 0, pg: 0, gd: 0, pgd: 0, prog: 0, dPrev: 0, gate: -1, lapsDone: 0, fin: false, finT: 0, finPlace: 0, place: slot + 1, missed: false,
          hop: -1, hopDir: 0, grace: 0, held: false, dDir: 0, charge: 0, tier: 0, dMost: 0, tMost: 0, bt: 0, bm: 1, bCap: 0, bSrc: '', btTier: 0,
          stun: 0, wallT: 9, scrape: 0, bonk: 0, cut: 0, off: false, surf: 1, wrongT: 0, wrong: false, ghost: 0, parked: false, slowT: 0, maxStuck: 0, bump: 0, wob: 0, pace: 1, wedge: 0, wedgeP: 0,
          air: false, vy: 0, lipT: 9, trick: false, big: false, ramp: -1, ry: 0, abyss: false, padT: 0, draftC: 0, spin: 0, gasAt: null, gasOn: false, touch: false, launch: '',
          rescue: -1, lifted: false, wet: 0, gm: 0, est: false, item: null, roll: 0, itemHeld: false, maxPace: 0,
          // (the Claw: when it last came and where (the progress), how many times running near there, the hand on the
          // wheel left after it, and the most rescues in any 20 s)
          clawT: -99, clawP: 0, clawN: 0, clawD: 0, clawX: 0, clawHand: 0, clawLog: [], claw3: 0,
          // (enemies hit: every bash this kart lands and every item or trap of its own that lands on a rival; the score's
          // hits, lib/runtime/kart-score.js)
          dealt: 0, share: 0,
          // the item slot (what is in it, Much Wow's charges left, the roulette's time to run and what it will land on,
          // an item dragged behind), and what items are doing to this kart (a Cold Wallet, Diamond Hands, To The Moon,
          // the second untouchable after a hit, the hit itself, FUD)
          rollT: 0, rollStop: false, rollPick: null, charges: 0, drag: false, dragAim: 0, shield: 0, diamond: 0, moon: 0, iframe: 0, hitT: 0, hitK: '', fudT: 0, fudAI: 0, uses: 0,
          // the chaos (7 Oct): a charge jump charging (seconds held, or -1) and the jump it made; the rail it grinds
          // (or -1) and for how long; the bump under it; fallen into a break; a bash's untouchable time, and a GM
          // knocked loose's; what a trick in the air is worth (a ramp's, a bump's, a rail's)
          cj: -1, cjAir: false, grind: -1, grindT: 0, bmp: -1, bmpN: 0, bmpF: 0, pit: false, bashI: 0, snatchI: 0, trickOf: 'ramp', airT: 0, latPrev: 0, railOff: -1, railOffT: 0, liftT: 0, hitT0: 0,
          inp: { steer: 0, gas: false, brake: false, drift: false, analog: false, item: false, touch: false, aim: 0 },
          px: 0, pz: 0, py: 0, pyaw: 0, ph: 0,
        };
      }
      // the grid: two columns 3.2 m apart, rows 6 m apart with a 3 m stagger, the front row 5 m behind the line
      function gridSlot(s) { var row = Math.floor(s / 2), col = s % 2; return { d: -(5 + row * 6 + col * 3), x: col ? -1.6 : 1.6 }; }
      function putOn(k, d, x, yawOff) {
        var i = idx(Math.round(wrap(d) / ds));
        k.x = TR.px[i] + TR.rx[i] * x; k.z = TR.pz[i] + TR.rz[i] * x;
        k.h = Math.atan2(TR.tx[i], TR.tz[i]) + (yawOff || 0); k.yaw = k.h; k.slip = 0;
        k.i = -1; project(k, true);
        k.px = k.x; k.pz = k.z; k.pyaw = k.yaw; k.py = 0; k.ph = k.h; k.pg = k.ground; k.pgd = k.gd;
      }
      S.reset = function (seed) {
        S.seed = seed >>> 0; S.rng = mulberry(S.seed || 1);
        S.t = 0; S.time = 0; S.acc = 0; S.steps = 0; S.finishers = 0; S.phase = 'grid'; S.count = S.count0 = 0; S.events.length = 0; S.goAt = -1; S.logN = 0; S.marks.length = 0; S.pair.fill(0);
        S.karts = opts.stats.map(function (st, k) { return make(k, st); });
        var order = opts.grid;
        S.karts.forEach(function (k, n0) {
          var slot = order[n0], g = gridSlot(slot);
          k.slot = slot; putOn(k, g.d, g.x, 0);
          k.prog = relD(k.d, 0); k.dPrev = k.d; k.gate = Math.floor(k.prog / GL);
          // each rival its own pace (0.95 to 1.005 of top speed, the Normal class), lane and taste for drifting
          var st = opts.stats[n0];
          k.ai.skill = st.skill != null ? cl(st.skill, 0.8, 1.04) : K.ai.pace[0] + S.rng() * (K.ai.pace[1] - K.ai.pace[0]);
          k.ai.lane = (S.rng() * 2 - 1) * 1.5;
          k.ai.drift = 0.55 + 0.45 * S.rng();
          k.human = n0 === S.human;
          // (your kart on the autopilot takes every drift it sees: the demo and the checks show the tiers)
          if (k.human) k.ai.drift = 1;
          // (and a racer keen on items, Doge, uses them sooner)
          k.ai.eager = S.eager && S.eager[n0] ? S.eager[n0] : 1;
          // (its road manner: Bull Run rams, Big Bear blocks, The Whale bullies the light ones, Doge spams items, Shiba
          // drafts and slingshots, Bike Tyson throws hop-bashes, Moon Cat takes the risky lines; the rest race clean)
          k.ai.persona = S.persona && S.persona[n0] ? S.persona[n0] : '';
          if (k.ai.persona === 'risky' && !k.human) k.ai.drift = 1;
          // (each rival starts with 2 GM in its pocket, for a bash to knock loose: its pace and its pocket together
          // still never past the 1.06 ceiling)
          if (!k.human) k.gm = K.purse;
        });
        S.traps.length = 0; S.shots.length = 0; S.fuds.length = 0; S.spill.length = 0; S.whale = null; S.whaleAt = -1e9; S.uid = 1;
        S.haz = CO.hazards.map(function (H) { return { cyc: -1, phase: 'idle', u: 0, d: H.d, lat: 0, side: H.side, hits: 0, slam: false }; });
        layCrates();
        layCoins();
        places();
      };
      // the count to GO (count seconds of it; none, and the race is on)
      S.start = function (count) { S.count = S.count0 = count; S.phase = count > 0 ? 'grid' : 'race'; if (!(count > 0)) S.goAt = 0; };

      /* -------- GM: lines of five coins, laid again every lap you start (yours to take: the rivals pass through) -- */
      function layCoins() {
        S.coins.length = 0;
        if (!CO.gm || S.human < 0) return;
        var lines = CO.gm, k = S.karts[S.human];
        for (var l = 0; l < lines; l++) {
          var d0 = 40 + (Lt - 80) * (l + 0.15 + 0.7 * S.rng()) / lines, tries = 0;
          // clear of the pads and ramps (and their landings) and the gaps in the wall
          while (tries++ < 12 && clash(d0)) d0 = wrap(d0 + 14);
          var i = idx(Math.round(d0 / ds)), x = cl(S.line.off[i] + (S.rng() * 2 - 1) * 4, -(TR.hw - 1.6), TR.hw - 1.6);
          for (var c = 0; c < K.gm.line; c++) S.coins.push({ d: wrap(d0 + c * K.gm.gap), x: x, on: true });
        }
        if (k) S.events.push(['coins', S.human]);
      }
      function clash(d) {
        var q;
        for (q = 0; q < CO.pads.length; q++) if (within(d, CO.pads[q].d0 - 10, CO.pads[q].len + 32)) return true;
        for (q = 0; q < CO.ramps.length; q++) if (within(d, CO.ramps[q].d0 - 10, CO.ramps[q].len + 40)) return true;
        for (q = 0; q < CO.gaps.length; q++) if (within(d, CO.gaps[q].d0 - 10, CO.gaps[q].len + 32)) return true;
        // (and clear of the chaos: a line run into a break, a rail, a bump or a hazard is a line nobody takes whole)
        for (q = 0; q < CO.breaks.length; q++) if (within(d, CO.breaks[q].d0 - 40, CO.breaks[q].len + 50)) return true;
        for (q = 0; q < CO.rails.length; q++) if (within(d, CO.rails[q].d0 - 40, CO.rails[q].len + 50)) return true;
        for (q = 0; q < CO.bumps.length; q++) if (within(d, CO.bumps[q].d0 - 30, CO.bumps[q].len * CO.bumps[q].n + 40)) return true;
        for (q = 0; q < CO.hazards.length; q++) { var H = CO.hazards[q]; if (within(d, H.d - 40 - (H.zone || 0), 2 * (H.zone || 0) + 60)) return true; }
        return false;
      }
      function collect(k) {
        if (k.air && k.y > 1.6) return;
        for (var q = 0; q < S.coins.length; q++) {
          var c = S.coins[q];
          if (!c.on || Math.abs(c.x - k.lat) > K.gm.r || Math.abs(relD(c.d, k.d)) > K.gm.r) continue;
          c.on = false; k.gm++; S.events.push(['coin', idOf(k), k.gm]);
        }
      }

      /* -------- the Airdrop crates: rows across the road, from the course (or four a lap, the first 250 m on) -- */
      function layCrates() {
        S.crates.length = 0;
        if (!S.itemsOn) return;
        var rows = CO.drops;
        if (!rows || rows === 'auto') {
          rows = [];
          // (three a lap until 7 Oct: the owner's "more chaotic fun", items flying all race)
          [0.26, 0.47, 0.68, 0.88].forEach(function (f) { var d0 = Math.max(250, f * Lt), tries = 0; while (tries++ < 8 && clash(d0)) d0 = wrap(d0 + 12); rows.push({ d: d0, x: 0, n: 5 }); });
        }
        rows.forEach(function (R0, r) {
          var nC = R0.n || 5, gap = Math.min(3, 2 * (TR.hw - 1.4) / Math.max(1, nC - 1));
          for (var c = 0; c < nC; c++) S.crates.push({ d: wrap(R0.d), x: cl((R0.x || 0) + (c - (nC - 1) / 2) * gap, -(TR.hw - 1), TR.hw - 1), on: true, t: 0, row: r });
        });
      }

      /* -------- one kart, one step -- */
      function idOf(k) { return S.karts.indexOf(k); }
      // a boost: the strongest running wins, a weaker one stretches the time it has left
      function boost(k, cap, T, src, tier) {
        if (k.bt <= 0 || cap >= k.bCap) { k.bCap = cap; k.bSrc = src; k.btTier = tier || 0; }
        k.bt = Math.max(k.bt, T);
        S.events.push(['boost', idOf(k), src, tier || 0]);
      }
      function startDrift(k, dir) { k.dDir = dir; k.charge = 0; k.tier = 0; S.events.push(['drift', idOf(k), dir]); }
      function endDrift(k, fire) {
        if (fire && k.tier > 0) boost(k, K.tierCap, K.tierT[k.tier - 1], 'drift', k.tier);
        k.dDir = 0; k.charge = 0; k.tier = 0;
      }
      // the start: when the gas went down (seconds before GO), read at GO; a rival's (and the autopilot's) by chance
      function launch(k) {
        var L0 = K.launch, a = k.gasAt, kind = '';
        if (k.parked) return;
        // (a film's assist that holds the gas itself launches by its timing, as a person does)
        if (!k.human || k.auto || (k.assist && k.assist.gas === 'auto')) { var r = S.rng(); kind = r < K.ai.perfect ? 'perfect' : r < K.ai.perfect + K.ai.good ? 'good' : ''; }
        else if (a != null && k.gasOn) {
          var w = k.touch ? L0.touch : 1;
          var win = function (W) { var c = (W[0] + W[1]) / 2, hw0 = (W[1] - W[0]) / 2 * w; return a >= c - hw0 && a <= c + hw0; };
          kind = a < L0.flood ? 'flood' : win(L0.perfect) ? 'perfect' : win(L0.good) ? 'good' : '';
        }
        k.launch = kind;
        if (kind === 'perfect') boost(k, L0.cap, L0.perfectT, 'launch');
        else if (kind === 'good') boost(k, L0.cap, L0.goodT, 'launch');
        else if (kind === 'flood') k.spin = L0.spin;
        S.events.push(['launch', idOf(k), kind || 'none']);
      }
      // a drift's yaw for its steer (s, into the drift positive): dSpan times neutral's all the way in, a dOut-th of it
      // all the way out, on a smooth curve between
      function driftSpan(s) { return Math.pow(s >= 0 ? K.hd.dSpan : K.hd.dOut, s); }
      // the turn: the most a kart turns at full lock at speed v (rad/s), a radius of R0 + Rc v^2, never past wPeak
      function wMax(v) { var Q = K.hd; v = Math.abs(v); return Math.min(Q.wPeak, v / (Q.R0 + Q.Rc * v * v)); }
      S.wMax = wMax;
      // the steer, after the input: a stick followed closely; a key (all or nothing) nearly half lock at once and the
      // rest in a short ramp, straight again fast when let go, and through zero the other way; in a drift, keys move
      // it at a steady rate both ways, so a tap tightens or opens the line a little
      function steerFilter(k, s, I, dt) {
        var Q = K.hd, c = k.steer;
        if (I.analog) return dampTo(c, s, Q.stickLam, dt);
        if (k.dDir) { var r0 = Q.keyDrift * dt; return c + cl(s - c, -r0, r0); }
        if (s === 0 || (c !== 0 && (c > 0) !== (s > 0))) {
          var f = (s === 0 ? Q.keyFall : Q.keyFlip) * dt;
          if (Math.abs(c) <= f) return s === 0 ? 0 : (s > 0 ? 1 : -1) * Q.keyIn * Math.abs(s);
          return c - (c > 0 ? f : -f);
        }
        if (Math.abs(c) < Q.keyIn * Math.abs(s)) c = (s > 0 ? 1 : -1) * Q.keyIn * Math.abs(s);
        var u = Q.keyRise * dt; return c + cl(s - c, -u, u);
      }
      function kartStep(k, dt) {
        var I = k.inp, racing = S.phase === 'race' && !k.parked;
        if (k.stun > 0) k.stun -= dt;
        if (k.ghost > 0) k.ghost -= dt;
        if (k.spin > 0) k.spin -= dt;
        k.wallT += dt; k.scrape = Math.max(0, k.scrape - dt); k.bonk = Math.max(0, k.bonk - dt); k.bump = Math.max(0, k.bump - dt);
        k.cut = Math.max(0, k.cut - dt); k.wob = Math.max(0, k.wob - dt); k.padT = Math.max(0, k.padT - dt);
        k.bashI = Math.max(0, k.bashI - dt); k.snatchI = Math.max(0, k.snatchI - dt); k.railOffT = Math.max(0, k.railOffT - dt); k.liftT = Math.max(0, k.liftT - dt);
        if (!racing) {
          // on the grid: when the gas went down, for the launch
          if (S.phase === 'grid' && !k.parked) { var g = !!I.gas; if (g && !k.gasOn) k.gasAt = -S.count; if (!g) k.gasAt = null; k.gasOn = g; k.touch = !!I.touch; }
          k.v = 0; k.w = 0; k.steer = 0; k.held = !!I.drift; k.cj = -1; return;
        }
        if (k.rescue >= 0) { rescueStep(k, dt); return; }
        if (k.moon > 0) { k.cj = -1; if (k.grind >= 0) k.grind = -1; moonStep(k, dt); itemInput(k, I); return; }
        var ctl = k.stun <= 0 ? 1 : 0;
        var steerIn = ctl ? cl(I.steer || 0, -1, 1) : 0;
        // (a scrape cut the steering for a moment until 7 Oct, and so did a hard knock from the side: scrapeSteer, 1 now)
        if (k.cut > 0 || k.wob > 0) steerIn *= K.scrapeSteer;
        // (just set down by the Claw: a hand on the wheel, your steering eased in from 0.3 of itself over 1.2 s, the
        // rest holding the road's heading, so a key still held from the fall does not throw the kart straight back in)
        if (k.clawHand > 0) {
          k.clawHand = Math.max(0, k.clawHand - dt);
          var ua = 1 - k.clawHand / K.claw.assist, ai = Math.max(0, k.i), eh = wrapA(k.h - Math.atan2(TR.tx[ai], TR.tz[ai]));
          steerIn = steerIn * (K.claw.hand + (1 - K.claw.hand) * ua) + cl(2.5 * eh, -1, 1) * (1 - ua) * (1 - K.claw.hand);
        }
        k.steer = steerFilter(k, steerIn, I, dt);
        k.latPrev = k.lat;
        // on a rail: the grind
        if (k.grind >= 0) { grindStep(k, dt, I, ctl, steerIn); return; }

        // Space: a hop, and held through the landing with a direction, a drift that way, or with none, a charge jump
        // charging; in the air off a ramp, a bump or a rail, a trick
        var press = ctl && I.drift && !k.held;
        k.held = !!I.drift;
        if (press && k.air) { if (k.lipT <= K.ramp.window && !k.trick && !k.abyss) { k.trick = true; S.events.push(['trick', idOf(k)]); } }
        else if (press && k.hop < 0 && k.ramp < 0 && k.cj < 0) { k.hop = 0; k.hopDir = Math.abs(steerIn) > 0.25 ? (steerIn > 0 ? 1 : -1) : 0; S.events.push(['hop', idOf(k)]); }
        if (k.hop >= 0) {
          k.hop += dt;
          if (!k.hopDir && Math.abs(steerIn) > 0.25) k.hopDir = steerIn > 0 ? 1 : -1;
          if (k.hop >= K.hopT) {
            k.hop = -1; k.y = 0; S.events.push(['land', idOf(k), 0]);
            if (ctl && I.drift && !k.dDir) {
              if (k.hopDir && k.v >= K.driftMin * k.top) startDrift(k, k.hopDir);
              else if (!k.hopDir) { k.cj = 0; S.events.push(['charge', idOf(k)]); }
            }
          } else k.y = 4 * K.hopH * k.hop * (K.hopT - k.hop) / (K.hopT * K.hopT);
        }
        // the charge jump charging: held with no steer it charges; a steer starts a drift that way (fast enough), as
        // the hop's grace did; let go after 0.25 s and it jumps, higher the longer it was held (all of it at 0.6 s)
        if (k.cj >= 0) {
          if (!ctl || k.air || k.ramp >= 0) k.cj = -1;
          else if (!I.drift) { if (k.cj >= K.cj.min) cjump(k); k.cj = -1; }
          else if (Math.abs(steerIn) > K.cj.steer && k.v >= K.driftMin * k.top) { startDrift(k, steerIn > 0 ? 1 : -1); k.cj = -1; }
          else k.cj += dt;
        }
        if (k.dDir) {
          if (!ctl || k.v < K.driftDrop * k.top) endDrift(k, false);
          else if (!I.drift) endDrift(k, true);
          else if (k.surf >= 1 && k.hop < 0 && !k.air) {
            // steering into the drift charges it faster, out of it slower; the direction never flips
            var s = cl(k.steer * k.dDir, -1, 1);
            k.charge += dt * k.dc * (s >= 0 ? K.charge[1] + (K.charge[0] - K.charge[1]) * s : K.charge[1] + (K.charge[1] - K.charge[2]) * s);
            var tier = k.charge >= K.tiers[2] ? 3 : k.charge >= K.tiers[1] ? 2 : k.charge >= K.tiers[0] ? 1 : 0;
            if (tier > k.tier) { k.tier = tier; S.events.push(['tier', idOf(k), tier]); }
            // (the most of any drift this race, step by step: the platform's playtest asks whether yours drifted)
            if (k.charge > k.dMost) k.dMost = k.charge; if (k.tier > k.tMost) k.tMost = k.tier;
          }
        }

        // speed: the gas toward the top (a boost, the slipstream filling and the GM in your pocket raise it), the
        // brake, then reverse; coasting slows; in the air nothing changes it
        if (k.bt > 0) k.bt = Math.max(0, k.bt - dt);
        k.bm = dampTo(k.bm, k.bt > 0 ? 1 + k.bCap : 1, k.bt > 0 ? K.boostOn : K.boostOff, dt);
        // (off the road the gas reaches 0.55 of top speed at most on grass, 0.40 in mud, and anything faster is
        // pulled down to it; a drift's, a pad's or a trick's boost halves the penalty)
        k.surf = k.air ? 1 : surface(k); k.off = k.surf < 1;
        var sm = k.surf;
        if (sm < 1 && k.bt > 0 && (k.bSrc === 'drift' || k.bSrc === 'pad' || k.bSrc === 'trick' || k.bSrc === 'grind')) sm = 1 - (1 - sm) / 2;
        // (an item's boost, and Diamond Hands, are not held back off the road at all)
        if (sm < 1 && ((k.bt > 0 && (k.bSrc === 'pump' || k.bSrc === 'wow' || k.bSrc === 'diamond')) || k.diamond > 0)) sm = 1;
        var pocket = 1 + K.gm.per * Math.min(K.gm.max, k.gm), draft = 1 + K.draft.cap * Math.min(1, k.draftC / K.draft.fill);
        // (a rival's own pace and the GM in its pocket together never past the 1.06 ceiling; a person under a FUD
        // Cloud 8% slower while it lasts, as a rival is)
        var pp = k.human ? k.pace * pocket * (k.fudT > 0 ? K.items.fud.pace : 1) : Math.min(K.ai.ceiling, k.pace * pocket);
        var cap = Math.min(k.top * K.hard, k.top * pp * k.bm * draft);
        if (sm < 1) cap = Math.min(cap, k.top * sm);
        // (full lock near the top speed scrubs a little of it: up to 6%, from 0.6 of lock, none drifting or in the air)
        if (!k.dDir && !k.air) { var vq = Math.min(1, Math.abs(k.v) / k.top); cap *= 1 - K.hd.scrub * cl((Math.abs(k.steer) - 0.6) / 0.4, 0, 1) * vq * vq; }
        if (!k.air) {
          if (ctl && I.gas && k.spin <= 0 && !(I.brake && k.v > 0.5)) { if (k.v < cap) k.v = dampTo(k.v, cap, k.bt > 0 ? K.boostOn : K.reach * k.accel, dt); }
          else if (ctl && I.brake) k.v = dampTo(k.v, K.reverse, K.brake, dt);
          else k.v = dampTo(k.v, 0, K.coast, dt);
          if (k.v > cap) k.v = dampTo(k.v, cap, sm < 1 ? K.surfIn : K.boostOff, dt);
        }

        // turning: the full-lock curve (wMax: tight at a crawl, wider with the speed), more in a hop, less in the air
        // off a ramp; drifting, round the locked direction, steering in tightening the line to dSpan times and
        // counter-steer opening it to a dOut-th, smoothly between (and less below the drift's own speed)
        var w;
        if (k.dDir) w = -k.dDir * K.hd.dW * k.hand * driftSpan(cl(k.steer * k.dDir, -1, 1)) * Math.min(1, Math.abs(k.v) / (K.driftMin * k.top));
        else w = -k.steer * wMax(k.v) * (k.v < 0 ? -1 : 1) * k.hand * (k.hop >= 0 ? K.hopTurn : k.air ? 0.5 : 1);
        // (a hop turns no more than the ground does, or hopW where that is less: on the new curve 1.3 times full lock
        // would be up to 2.7 rad/s, a snap that threw a drift onto the inside verge before it began; until 7 Oct a hop
        // turned about 1 rad/s)
        if (k.hop >= 0) { var hw = Math.max(K.hd.hopW, wMax(k.v) * k.hand); w = cl(w, -hw, hw); }
        k.h += w * dt; k.w = w;
        k.slip = dampTo(k.slip, k.dDir ? -k.dDir * K.slipD : -k.steer * K.slipN * Math.min(1, Math.abs(k.v) / k.top), 8, dt);
        k.yaw = k.h + k.slip;
        k.pushX = dampTo(k.pushX, 0, 6, dt); k.pushZ = dampTo(k.pushZ, 0, 6, dt);
        k.x += (Math.sin(k.h) * k.v + k.pushX) * dt; k.z += (Math.cos(k.h) * k.v + k.pushZ) * dt;
        project(k, false);
        if (k.air) {
          // off a ramp, a bump, a rail or a charge jump (or off the edge): up and down under 18 m/s/s, eased near the
          // top (the hang); coming down onto a rail, a grind; the trick paid on landing; over a break there is
          // nothing to land on
          k.vy -= K.ramp.g * (Math.abs(k.vy) < K.hangV && !k.abyss ? K.hang : 1) * dt; k.y += k.vy * dt; k.lipT += dt; k.airT += dt;
          if (k.pit) pitStep(k, dt);
          else if (k.vy <= 0 && !k.abyss && catchRail(k)) { /* (on the rail now) */ }
          else if (k.y <= 0 && !k.abyss) {
            if (breakAt(k.d, k.lat)) fall(k);
            else land(k);
          }
        } else { k.airT = 0; ramps(k); if (k.ramp < 0) bumps(k); else k.bmp = -1; }
        if (k.ramp < 0 && k.hop < 0 && !k.air && k.bmp < 0 && k.grind < 0) k.y = 0;
        // (on the ground over a break: it falls; a guarded one's kerb first, from the road beside it)
        if (!k.air && k.hop < 0 && k.ramp < 0 && k.grind < 0 && CO.breaks.length) { guards(k); if (breakAt(k.d, k.lat)) fall(k); }
        if (k.grind >= 0) { progress(k, dt); if (k === S.karts[S.human]) collect(k); itemInput(k, I); return; }
        pads(k);
        walls(k);
        railWalls(k);
        hazard(k, dt);
        if (k.rescue >= 0) return;
        if (!isFinite(k.x + k.z + k.v + k.h)) { rescue(k); return; }
        progress(k, dt);
        if (k === S.karts[S.human]) collect(k);
        unwedge(k, I, dt);
        itemInput(k, I);
      }
      // a landing: the trick paid (a ramp's, a bump's or a rail's), heard, the air time said
      function land(k) {
        S.events.push(['land', idOf(k), +Math.min(9, k.airT).toFixed(3), k.cjAir ? 1 : 0]);
        if (k.trick) {
          if (k.trickOf === 'bump') boost(k, K.bump.cap, K.bump.T, 'trick');
          else boost(k, K.ramp.cap, K.ramp.T[k.trickOf === 'ramp' && k.big ? 1 : 0], 'trick');
        }
        k.air = false; k.y = 0; k.vy = 0; k.trick = false; k.cjAir = false; k.airT = 0;
      }
      // the charge jump: up at 3.4 m/s (held 0.25 s) to 5.0 (held 0.6 s or more); from flat ground no trick, from a
      // bump's crest or a lip it is that bump's
      function cjump(k) {
        var f = cl((k.cj - K.cj.min) / (K.cj.full - K.cj.min), 0, 1);
        k.air = true; k.vy = K.cj.vy[0] + (K.cj.vy[1] - K.cj.vy[0]) * f; k.y = Math.max(k.y, 0.01); k.lipT = k.bmp >= 0 ? 0 : 9; k.trickOf = 'bump';
        k.trick = false; k.abyss = false; k.big = false; k.cjAir = true; k.airT = 0; k.bmp = -1;
        S.events.push(['cjump', idOf(k), +f.toFixed(2)]);
        if ((!k.human || k.auto) && k.lipT === 0) k.ai.trickGo = S.rng() < K.ai.trick;
      }
      // fallen into a break: down until the Claw comes (3 m under the road), or into the water there; the hole's far
      // side is a wall to a kart already in it
      function fall(k) {
        k.air = true; k.abyss = true; k.pit = true; k.vy = Math.min(0, k.vy); k.lipT = 9; k.trick = false; k.hop = -1; k.cj = -1; k.bmp = -1;
        if (k.dDir) endDrift(k, false);
        S.events.push(['fall', idOf(k)]);
      }
      function pitStep(k, dt) {
        var B = breakAt(k.d, k.lat);
        if (!B && k.y < -0.25) { k.x = k.px; k.z = k.pz; k.v = 0; project(k, false); B = breakAt(k.d, k.lat); }
        if (B && B.water && k.y < -0.4) { k.y = -0.4; k.vy = 0; k.wet += dt; k.v = dampTo(k.v, 0, 3, dt); if (k.wet > K.claw.wet) rescue(k); }
        else if (k.y < -K.claw.deep) rescue(k);
      }
      // a ramp under the kart: up its slope (the picture rides it), and off its lip into the air
      function ramps(k) {
        var on = -1, q;
        for (q = 0; q < CO.ramps.length; q++) { var R0 = CO.ramps[q]; if (Math.abs(k.lat - R0.x) <= R0.w / 2 && within(k.d, R0.d0, R0.len)) { on = q; break; } }
        if (on >= 0 && k.v > 0) {
          var R1 = CO.ramps[on];
          k.ramp = on; k.ry = R1.h * cl(wrap(k.d - R1.d0) / R1.len, 0, 1); k.y = k.ry; k.hop = -1;
          return;
        }
        if (k.ramp >= 0) {
          var R2 = CO.ramps[k.ramp], past = relD(k.d, R2.d0 + R2.len);
          k.ramp = -1;
          if (past >= 0 && past < 4 && k.v > 2) {
            // off the lip
            k.air = true; k.big = R2.big; k.vy = R2.big ? K.ramp.big : K.ramp.small; k.y = R2.h; k.lipT = 0; k.airT = 0; k.trick = false; k.abyss = false; k.trickOf = 'ramp';
            // (a drift carried onto the ramp is let go at the lip: its boost is yours)
            if (k.dDir) endDrift(k, true);
            S.events.push(['air', idOf(k), R2.big ? 2 : 1]);
            if (!k.human || k.auto) k.ai.trickGo = S.rng() < K.ai.trick;
          } else if (k.ry > 0.05) { k.air = true; k.vy = 0; k.y = k.ry; k.lipT = 9; k.airT = 0; k.abyss = false; }
          k.ry = 0;
        }
      }
      // a bump under the kart: the road's height on it (the picture rides it), and crossed at speed, off its crest
      // (a hump's middle, a lip's edge) into the air, a trick's window open; a hop or a drift carries on over it
      function bumps(k) {
        if (k.hop >= 0 || !CO.bumps.length) { k.bmp = -1; return; }
        var q = bumpAt(k.d, k.lat);
        if (q >= 0 && k.v > 0) {
          var B = CO.bumps[q], u = wrap(k.d - B.d0) / B.len, hn = Math.floor(u), f = u - hn;
          if (B.kind !== 'lip' && k.bmp === q && k.bmpN === hn && k.bmpF < 0.5 && f >= 0.5 && k.v > K.bump.min) { pop(k, B, bH); return; }
          k.bmp = q; k.bmpN = hn; k.bmpF = f; k.y = bH;
          return;
        }
        if (k.bmp >= 0) {
          var B2 = CO.bumps[k.bmp];
          if (B2.kind === 'lip' && k.bmpF > 0.6 && k.v > K.bump.min) pop(k, B2, B2.h);
          else if (k.y > 0.05) { k.air = true; k.vy = 0; k.lipT = 9; k.airT = 0; k.abyss = false; }
          k.bmp = -1;
        }
      }
      function pop(k, B, y) {
        k.air = true; k.vy = B.pop * Math.min(1, k.v / k.top); k.y = Math.max(0.01, y); k.lipT = 0; k.airT = 0; k.trick = false; k.trickOf = 'bump'; k.abyss = false; k.big = false; k.bmp = -1;
        S.events.push(['air', idOf(k), 0]);
        if (!k.human || k.auto) k.ai.trickGo = S.rng() < K.ai.trick;
      }

      /* -------- rails: caught from above, ground along, hopped off -- */
      function catchRail(k) {
        for (var q = 0; q < CO.rails.length; q++) {
          var R0 = CO.rails[q], x = railLat(R0, k.d);
          if (x !== x || Math.abs(k.lat - x) > K.rail.snap || k.y > R0.h + K.rail.above || k.y < R0.h - K.rail.below) continue;
          // (not the rail just hopped off sideways, for half a second)
          if (q === k.railOff && k.railOffT > 0) continue;
          grindOn(k, q);
          return true;
        }
        return false;
      }
      function grindOn(k, q) {
        var first = k.grind < 0;
        k.grind = q; k.air = false; k.vy = 0; k.y = CO.rails[q].h; k.trick = false; k.cjAir = false; k.hop = -1; k.cj = -1; k.bmp = -1; k.abyss = false; k.airT = 0;
        if (first) { k.grindT = 0; if (k.dDir) endDrift(k, true); }
        S.events.push(['grind', idOf(k), q, first ? 1 : 0]);
      }
      // a step on a rail: along it at the grind's speed (rising), turned to it, its top under the kart; Space hops off
      // (to the side the stick says, or straight up and back down onto it); off its end, onto the next or up and off;
      // shoved hard (3 m/s or more across), knocked off it
      function grindStep(k, dt, I, ctl, steerIn) {
        var R0 = CO.rails[k.grind], T = K.rail, press = ctl && I.drift && !k.held;
        k.held = !!I.drift; k.grindT += dt; k.hop = -1; k.cj = -1;
        if (k.bt > 0) k.bt = Math.max(0, k.bt - dt);
        k.bm = dampTo(k.bm, k.bt > 0 ? 1 + k.bCap : 1, k.bt > 0 ? K.boostOn : K.boostOff, dt);
        var u = Math.min(1, k.grindT / T.rise), pocket = 1 + K.gm.per * Math.min(K.gm.max, k.gm), pp = k.human ? k.pace * pocket : Math.min(K.ai.ceiling, k.pace * pocket);
        var want = Math.min(k.top * K.hard, k.top * Math.max(pp, 1) * Math.max(1 + T.cap * u, k.bm));
        // (up to it at 2.5 a second times KART_PACE: the same metres of rail at the faster race, 7 Oct, round 3)
        k.v = dampTo(k.v, want, k.v < want ? 2.5 * KART_PACE : K.boostOff, dt);
        if (Math.hypot(k.pushX, k.pushZ) > 3) { railOff(k, k.pushX * TR.rx[k.i] + k.pushZ * TR.rz[k.i] > 0 ? 1 : -1, false, true); return; }
        k.pushX = dampTo(k.pushX, 0, 6, dt); k.pushZ = dampTo(k.pushZ, 0, 6, dt);
        var d = wrap(k.d + k.v * dt), x = railLat(R0, d);
        if (x !== x) {
          if (R0.next >= 0 && !(R0.next === k.grind)) { grindOn(k, R0.next); R0 = CO.rails[k.grind]; x = railLat(R0, d); if (x !== x) x = R0.pts[0][1]; }
          else { railOff(k, 0, true, false); return; }
        }
        var i = idx(Math.round(d / ds)), x2 = railLat(R0, wrap(d + 1)), slope = x2 === x2 ? x2 - x : 0;
        var h0 = k.h, h = Math.atan2(TR.tx[i] - TR.rx[i] * slope, TR.tz[i] - TR.rz[i] * slope);
        k.x = TR.px[i] + TR.rx[i] * x + TR.tx[i] * (d - i * ds); k.z = TR.pz[i] + TR.rz[i] * x + TR.tz[i] * (d - i * ds);
        k.h = h0 + wrapA(h - h0) * Math.min(1, dt * 14); k.w = wrapA(k.h - h0) / dt; k.slip = dampTo(k.slip, 0, 8, dt); k.yaw = k.h + k.slip;
        k.steer = dampTo(k.steer, steerIn, 8, dt);
        k.y = R0.h; k.air = false; k.surf = 1; k.off = false; k.wet = 0; k.ramp = -1;
        project(k, false);
        if (press) { railOff(k, Math.abs(steerIn) > 0.25 ? (steerIn > 0 ? 1 : -1) : 0, false, false); return; }
        progress(k, dt);
        if (k === S.karts[S.human]) collect(k);
        itemInput(k, I);
      }
      // off a rail: the grind paid (+20% for 0.4 s, to 1.0 s after 1.2 s on it), up into the air with a trick's window
      // (knocked off, nothing paid)
      function railOff(k, dir, end, knocked) {
        var T = K.rail, u = Math.min(1, k.grindT / T.rise), q = k.grind;
        if (!knocked) boost(k, T.exitCap, T.exitT[0] + (T.exitT[1] - T.exitT[0]) * u, 'grind');
        k.grind = -1; k.air = true; k.vy = knocked ? 1.5 : end ? T.endV : T.hopV; k.lipT = knocked ? 9 : 0; k.airT = 0; k.trick = false; k.trickOf = 'rail'; k.abyss = false; k.big = false;
        if (dir) { k.pushX += TR.rx[k.i] * dir * T.side; k.pushZ += TR.rz[k.i] * dir * T.side; k.railOff = q; k.railOffT = 0.5; }
        S.events.push(['grindEnd', idOf(k), dir, end ? 1 : knocked ? 2 : 0, +k.grindT.toFixed(2)]);
        if ((!k.human || k.auto) && !knocked) k.ai.trickGo = S.rng() < K.ai.trick;
      }
      // a rail is a barrier to a kart on the ground beside it (it is ground only from above): met from the side, a
      // glance or a scrape off it, never a bonk
      function railWalls(k) {
        if (k.air || k.y > 0.25 || !CO.rails.length) return;
        for (var q = 0; q < CO.rails.length; q++) {
          var x = railLat(CO.rails[q], k.d), lim = K.radius + 0.06;
          if (x !== x || Math.abs(k.lat - x) >= lim) continue;
          var sg = k.latPrev <= x ? 1 : -1;
          wallMeet(k, sg, sg > 0 ? k.lat - (x - lim) : (x + lim) - k.lat, true);
        }
      }
      // a guarded break's kerb (course.breaks guard: true, 8 Oct): its side on the road is a low wall (a glance or a
      // scrape, never a bonk) to a kart on the ground coming at it from the road beside it; its front is open, so
      // whoever drives into it, or hops or jumps over the kerb, still falls in (a person on the keys reacting in 0.25 s
      // swung off the bayou's line into its channel from the side, a lap after lap)
      function guards(k) {
        if (k.air || k.y > 0.25) return;
        for (var q = 0; q < CO.breaks.length; q++) {
          var B = CO.breaks[q];
          if (!B.guard || !within(k.d, B.d0, B.len)) continue;
          // (the kart's half-width off it, its front end a point, so a kart coming at it along its line is turned off
          // it, not stopped)
          var lim = (K.radius + 0.06) * cl(wrap(k.d - B.d0), 0.03, 1);
          if (B.x0 > -TR.hw && k.latPrev < B.x0 && k.lat > B.x0 - lim) wallMeet(k, 1, k.lat - (B.x0 - lim), true);
          else if (B.x1 < TR.hw && k.latPrev > B.x1 && k.lat < B.x1 + lim) wallMeet(k, -1, (B.x1 + lim) - k.lat, true);
        }
      }
      // a pad under the kart: a boost (+28% for a second), once a pass
      function pads(k) {
        if (k.air || k.padT > 0) return;
        for (var q = 0; q < CO.pads.length; q++) {
          var P = CO.pads[q];
          if (Math.abs(k.lat - P.x) <= P.w / 2 && within(k.d, P.d0, P.len)) { boost(k, K.pad.cap, K.pad.T, 'pad'); k.padT = 0.5; S.events.push(['pad', idOf(k), q]); return; }
        }
      }
      // the walls, graded by how square the kart meets them: a glance slides along (the part that went into the wall
      // lost, 95% of the rest kept, the drift kept), a scrape comes off at a shallow angle (along it at 0.8, off it at
      // a quarter, the steering halved for 0.2 s), a bonk bounces back (a quarter of the speed, 7 m/s at most) and
      // takes the control for 0.4 s; where the course leaves a gap there is no wall, and what is past it is hazard()'s
      function walls(k) {
        var wl = TR.wall - K.radius, al = Math.abs(k.lat);
        if (al <= wl) return;
        var sg = k.lat > 0 ? 1 : -1;
        if (gapAt(k.d, sg)) return;
        wallMeet(k, sg, al - wl, false);
      }
      // a wall met (on the kart's right, sg 1, or its left, -1), `over` metres into it; a soft one (a rail) is never a
      // bonk, only a scrape at most
      function wallMeet(k, sg, over, soft) {
        var i = k.i, nx = TR.rx[i] * sg, nz = TR.rz[i] * sg;
        k.x -= nx * over; k.z -= nz * over; k.lat -= sg * over;
        var pn = k.pushX * nx + k.pushZ * nz; if (pn > 0) { k.pushX -= pn * nx; k.pushZ -= pn * nz; }
        var dirS = k.v < 0 ? -1 : 1, ux = Math.sin(k.h) * dirS, uz = Math.cos(k.h) * dirS, vn = ux * nx + uz * nz;
        if (vn <= 0 || Math.abs(k.v) < 0.3) return;
        var th = Math.asin(Math.min(1, vn)), deg = th / KART_D2R, fresh = k.wallT > 0.3, sp = Math.abs(k.v), old = k.h;
        k.wallT = 0;
        var tx = ux - vn * nx, tz = uz - vn * nz, tl = Math.hypot(tx, tz) || 1;
        tx /= tl; tz /= tl;
        if (deg < K.glance) {
          sp *= Math.cos(th) * (fresh ? K.glanceKeep : 1);
          k.h = dirS > 0 ? Math.atan2(tx, tz) : Math.atan2(-tx, -tz); k.v = sp * dirS;
          // (the picture turns after it: the difference goes into the slip, which eases out)
          k.slip = wrapA(k.slip + old - k.h); k.scrape = 0.12;
          if (fresh) S.events.push(['glance', idOf(k), Math.round(deg)]);
        } else if (deg < K.scrape || soft) {
          var at = sp * Math.cos(th) * K.scrapeKeep, an = sp * Math.sin(th) * K.scrapeBack, vx = tx * at - nx * an, vz = tz * at - nz * an;
          sp = Math.hypot(vx, vz);
          k.h = dirS > 0 ? Math.atan2(vx, vz) : Math.atan2(-vx, -vz); k.v = sp * dirS;
          k.slip = wrapA(k.slip + old - k.h); k.cut = K.scrapeT; k.scrape = 0.2;
          if (fresh) S.events.push(['scrape', idOf(k), Math.round(deg)]);
        } else {
          // (the nose turned up to 25 degrees toward the wall's own line, so the gas after it does not meet the wall
          // square again; the picture eases round after it, through the slip)
          var th0 = dirS > 0 ? Math.atan2(tx, tz) : Math.atan2(-tx, -tz), tA = K.hd.bonkTurn * KART_D2R;
          k.h += cl(wrapA(th0 - k.h), -tA, tA); k.slip = wrapA(k.slip + old - k.h);
          k.v = -dirS * Math.min(K.bonkMax, K.bonk * sp); k.stun = K.stun; k.bonk = 0.35;
          if (k.dDir) endDrift(k, false);
          k.hop = -1; if (!k.air) k.y = 0;
          S.events.push(['bonk', idOf(k), Math.round(deg)]);
        }
      }
      // past a gap in the wall: deep water (0.4 s in it and the Claw comes) or a void (a fall, the Claw at 3 m down)
      function hazard(k, dt) {
        var al = Math.abs(k.lat);
        if (al <= TR.wall) { if (!k.pit) { k.wet = 0; if (k.abyss) k.abyss = false; } return; }
        var G = gapAt(k.d, k.lat > 0 ? 1 : -1);
        if (!G) { if (al > TR.wall + 3) rescue(k); return; }
        if (G.water) {
          k.wet += dt; k.v = dampTo(k.v, 0, 3, dt); k.y = -Math.min(0.9, k.wet * 2);
          if (k.dDir) endDrift(k, false);
          if (k.wet > K.claw.wet) rescue(k);
        } else {
          if (!k.abyss) { k.abyss = true; if (!k.air) { k.air = true; k.vy = 0; k.lipT = 9; } }
          if (k.y < -K.claw.deep) rescue(k);
        }
      }
      // the Rescue Claw: called, it costs 2 GM; 0.5 s more of the fall, then the claw carries the kart down onto
      // the racing line, 12 m back (and back past any gap), and sets it down rolling, a ghost for a second
      function rescue(k) {
        if (k.rescue >= 0) return;
        k.rescue = 0; k.lifted = false; k.dDir = 0; k.charge = 0; k.tier = 0; k.hop = -1; k.trick = false; k.grace = 0; k.bt = 0; k.cj = -1; k.grind = -1; k.bmp = -1; k.clawHand = 0;
        var lost = Math.min(k.gm, K.claw.gm); k.gm -= lost;
        if (!isFinite(k.x + k.z + k.v + k.h)) { k.x = TR.px[Math.max(0, k.i)]; k.z = TR.pz[Math.max(0, k.i)]; k.v = 0; k.h = 0; k.y = 0; k.vy = 0; }
        // (called again soon after, near where it last came: the next set-down further on; and the most rescues in 20 s)
        var C = K.claw, again = S.time - k.clawT < C.again && Math.abs(k.prog - k.clawP) < C.near;
        k.clawN = again ? k.clawN + 1 : 0; k.clawT = S.time; k.clawP = k.prog; k.clawD = k.d; k.clawX = k.lat;
        k.clawLog.push(S.time); while (k.clawLog.length && k.clawLog[0] < S.time - 20) k.clawLog.shift(); k.claw3 = Math.max(k.claw3, k.clawLog.length);
        S.events.push(['rescue', idOf(k), lost]);
      }
      // where the Claw sets a kart down: d along the lap and x across, square to the road. The first time near a place,
      // 12 m back (and back past any gap in the wall); before a break, 30 m before it (a run-up to jump it); before a
      // break across part of the road, beside it in the lane the racing line is nearest, 2.5 m clear of its edge and
      // 1.5 m clear of any rail there. Called again soon after near there (k.clawN), past what it fell into instead:
      // 6 m on from the far end of the break or the gap, 12 m further each time more, and on the line there
      function clawSpot(k) {
        var C = K.claw, d, q, B, lat, part = null, lim = TR.hw - 1.2;
        function inBreak(dd, pad) { for (var b = 0; b < CO.breaks.length; b++) { var B0 = CO.breaks[b]; if (within(dd, B0.d0 - pad, B0.len + 2 * pad)) return B0; } return null; }
        if (k.clawN > 0) {
          // (the far end of what it fell into: a break or a gap in the wall at the fall, or just where it fell)
          var end = k.clawD, Bf = inBreak(k.clawD, 3), G = gapAt(k.clawD, k.clawX > 0 ? 1 : -1) || gapAt(k.clawD, 1) || gapAt(k.clawD, -1);
          if (Bf) end = Bf.d0 + Bf.len; else if (G) end = G.d1;
          d = wrap(end + C.past + C.on * (k.clawN - 1));
          for (q = 0; q < 40 && (gapAt(d, 1) || gapAt(d, -1) || inBreak(d, 2)); q++) d = wrap(d + 4);
          lat = laneAt(d, S.line.off[idx(Math.round(d / ds))], null, lim);
          return { d: d, lat: lat };
        }
        d = wrap(k.d - C.back);
        for (q = 0; q < 30 && (gapAt(d, 1) || gapAt(d, -1)); q++) d = wrap(d - 4);
        // (and before a break, a run-up of 30 m at least to jump it; before one across part of the road only, set
        // down beside it, clear of it, when the line runs into it: 8 Oct, a kart that had fallen into the crater gap
        // was set down on the line square behind it, and a driver holding the gas fell in nine times running)
        for (q = 0; q < CO.breaks.length; q++) { B = CO.breaks[q]; if (within(d, B.d0 - K.brk.runup, B.len + K.brk.runup)) { d = wrap(B.d0 - K.brk.runup); part = B.x0 > -TR.hw || B.x1 < TR.hw ? B : null; } }
        lat = laneAt(d, S.line.off[idx(Math.round(d / ds))], part, lim);
        return { d: d, lat: lat };
      }
      // a place across the road at d near x: inside lim, clear of the part-break P by C.clear (1.5 at the least, if
      // the lane is too narrow for that), and of any rail between d and 30 m on by 1.5 m; the nearest to x, or x
      function laneAt(d, x, P, lim) {
        var C = K.claw, best = null, bd = 1e9, pass, xx, n;
        function fits(xx, cl0, railOn) {
          if (P && xx >= P.x0 - cl0 && xx <= P.x1 + cl0) return false;
          for (var r = 0; railOn && r < CO.rails.length; r++) for (var u = 0; u <= 30; u += 5) { var xr = railLat(CO.rails[r], d + u); if (xr === xr && Math.abs(xr - xx) < 1.5) return false; }
          return true;
        }
        x = cl(x, -lim, lim);
        if (fits(x, C.clear, true)) return x;
        for (pass = 0; pass < 3 && best === null; pass++) {
          for (n = 0, xx = -lim; xx <= lim + 1e-6; n++, xx = -lim + n * 0.25) if (fits(xx, pass === 0 ? C.clear : 1.5, pass < 2) && Math.abs(xx - x) < bd) { bd = Math.abs(xx - x); best = xx; }
        }
        return best === null ? x : best;
      }
      function rescueStep(k, dt) {
        var C = K.claw;
        k.rescue += dt;
        if (k.rescue < C.fall) {
          // (still going down where it went in)
          k.v = dampTo(k.v, 0, 3, dt);
          k.x += Math.sin(k.h) * k.v * dt; k.z += Math.cos(k.h) * k.v * dt;
          if (k.wet > 0) k.y = Math.max(-1.6, k.y - 1.6 * dt); else { k.vy -= K.ramp.g * dt; k.y = Math.max(-12, k.y + k.vy * dt); }
          k.yaw = k.h + k.slip; k.w = 0;
          return;
        }
        if (!k.lifted) {
          var at = clawSpot(k);
          putOn(k, at.d, at.lat, 0);
          progress(k, 0);
          k.lifted = true; k.v = 0; k.vy = 0; k.air = false; k.abyss = false; k.pit = false; k.wet = 0; k.pushX = k.pushZ = 0; k.ramp = -1; k.ry = 0;
          S.events.push(['claw', idOf(k)]);
        }
        var u = cl((k.rescue - C.fall) / C.lift, 0, 1);
        k.y = C.high * (1 - u) * (1 - u); k.w = 0;
        if (u >= 1) {
          k.rescue = -1; k.lifted = false; k.y = 0; k.v = C.v * k.top; k.ghost = C.ghost; k.stun = 0; k.wedge = 0; k.clawHand = C.assist; k.steer = 0; k.w = 0;
          S.events.push(['set', idOf(k), k.clawN]);
        }
      }
      // wedged: the gas held for 1.2 s and the kart not getting on, under 1.5 m/s along the track on average, and
      // crawling or at a wall (bouncing off it and back at it, each bounce taking the control away again); then it
      // is turned back down the track (the picture turns after it), eased off the wall onto the road and rolling
      function unwedge(k, I, dt) {
        if (!I.gas || I.brake || k.fin || k.air) { k.wedge = 0; return; }
        if (k.wedge === 0) k.wedgeP = k.prog;
        k.wedge += dt;
        if (k.wedge < K.wedgeT) return;
        k.wedge = 0;
        if (Math.abs(k.prog - k.wedgeP) >= K.wedgeV * K.wedgeT || (Math.abs(k.v) >= K.wedgeV && k.wallT > K.wedgeT)) return;
        var i = k.i, h = Math.atan2(TR.tx[i], TR.tz[i]), sg = k.lat > 0 ? 1 : -1, over = Math.max(0, Math.abs(k.lat) - (TR.hw - 1.5));
        k.slip = wrapA(k.yaw - h); k.h = h;
        k.v = K.nudge * k.top; k.stun = 0; k.hop = -1; k.y = 0; k.wallT = 9;
        if (k.dDir) endDrift(k, false);
        // (a push that fades at 6 a second carries the kart its size over 6: the road's edge, and 1.5 m in)
        k.pushX = -sg * TR.rx[i] * over * 6; k.pushZ = -sg * TR.rz[i] * over * 6;
        S.events.push(['nudge', idOf(k)]);
      }
      function wrapA(a) { a = (a + Math.PI) % (2 * Math.PI); return (a < 0 ? a + 2 * Math.PI : a) - Math.PI; }
      // progress: the distance driven along the track, unwrapped; a lap counts only through all sixteen
      // checkpoints in order, so no shortcut pays (skip one and the lap is void until you go back through it); and
      // wrong way, after a second facing more than 110 degrees off the track
      function progress(k, dt) {
        k.prog += relD(k.d, k.dPrev); k.dPrev = k.d;
        var g = Math.floor(k.prog / GL);
        if (g === k.gate + 1) { k.gate = g; if (k.missed) { k.missed = false; S.events.push(['found', idOf(k)]); } }
        else if (g < k.gate) k.gate = g;
        else if (g > k.gate + 1 && !k.missed) { k.missed = true; S.events.push(['missed', idOf(k), k.gate + 1]); }
        var done = Math.floor(Math.max(0, k.gate) / K.gates);
        if (done > k.lapsDone) {
          k.lapsDone = done; S.events.push(['lap', idOf(k), done]);
          if (done >= S.laps && !k.fin) { k.fin = true; k.finT = S.time; k.finPlace = ++S.finishers; S.events.push(['finish', idOf(k), k.finPlace]); }
          else if (k === S.karts[S.human]) layCoins();
        } else if (done < k.lapsDone && !k.fin) k.lapsDone = done;
        var i = k.i, along = (Math.sin(k.h) * TR.tx[i] + Math.cos(k.h) * TR.tz[i]) * (k.v < 0 ? -1 : 1);
        if (Math.abs(k.v) > 2 && along < Math.cos(K.wrongDeg * KART_D2R)) k.wrongT += dt; else k.wrongT = Math.max(0, k.wrongT - 2 * dt);
        k.wrong = k.wrongT > K.wrongT;
        // stuck: barely moving, or not getting on, for long
        if (Math.abs(k.v) < 1.5 && !k.fin && k.rescue < 0) k.slowT += dt; else k.slowT = 0;
        if (k.slowT > k.maxStuck) k.maxStuck = k.slowT;
      }

      /* -------- the slipstream: close behind a kart, on its line -- */
      function drafts(dt) {
        var A = S.karts, D = K.draft;
        for (var a = 0; a < A.length; a++) {
          var k = A[a], inZone = false;
          if (k.parked || k.rescue >= 0 || k.air || k.v < D.min * k.top) { k.draftC = Math.max(0, k.draftC - 2 * dt); continue; }
          for (var b = 0; b < A.length && !inZone; b++) {
            if (b === a) continue;
            var o = A[b];
            if (o.parked || o.rescue >= 0 || o.ghost > 0) continue;
            var r = relD(o.d, k.d);
            if (r >= D.near && r <= D.far && Math.abs(o.lat - k.lat) < D.lat) inZone = true;
          }
          if (inZone) {
            k.draftC += dt;
            if (k.draftC >= D.fill) { k.draftC = 0; boost(k, D.boost, D.T, 'draft'); S.events.push(['slip', a]); }
          } else k.draftC = Math.max(0, k.draftC - 2 * dt);
        }
      }

      /* -------- karts against karts: capsules, pushed apart and shoved, by weight -- */
      // (the weights: a kart's mass squared, so a heavy one shoves a light one well off its line, 7 Oct)
      function contacts() {
        var A = S.karts, R2 = K.radius * 2;
        for (var a = 0; a < A.length; a++) for (var b = a + 1; b < A.length; b++) {
          var p = A[a], q = A[b];
          if (p.parked || q.parked || p.ghost > 0 || q.ghost > 0 || p.rescue >= 0 || q.rescue >= 0 || p.pit || q.pit || Math.abs(p.y - q.y) > 0.9) continue;
          var dx = q.x - p.x, dz = q.z - p.z;
          if (dx * dx + dz * dz > 9) continue;
          // the closest points of the two karts' spines (each half a metre fore and aft of its centre)
          var ax = Math.sin(p.yaw) * K.half, az = Math.cos(p.yaw) * K.half, bx = Math.sin(q.yaw) * K.half, bz = Math.cos(q.yaw) * K.half;
          var c = segs(p.x - ax, p.z - az, p.x + ax, p.z + az, q.x - bx, q.z - bz, q.x + bx, q.z + bz);
          var ex = c[2] - c[0], ez = c[3] - c[1], dist = Math.hypot(ex, ez);
          if (dist >= R2) continue;
          var nx0 = dist > 1e-4 ? ex / dist : (dx || 1), nz0 = dist > 1e-4 ? ez / dist : dz, nl = Math.hypot(nx0, nz0) || 1;
          var wp = p.mass * p.mass, wq = q.mass * q.mass;
          var nx = nx0 / nl, nz = nz0 / nl, over = R2 - dist, im = 1 / wp + 1 / wq;
          p.x -= nx * over * (1 / wp) / im; p.z -= nz * over * (1 / wp) / im;
          q.x += nx * over * (1 / wq) / im; q.z += nz * over * (1 / wq) / im;
          p.bump = q.bump = 0.2;
          // (Diamond Hands and To The Moon spin whoever they touch)
          var pI = p.diamond > 0 || p.moon > 0, qI = q.diamond > 0 || q.moon > 0;
          if (pI && !qI) hit(q, 'touch', a); else if (qI && !pI) hit(p, 'touch', b);
          // (a pair that has just touched is only kept apart, not knocked again, for a quarter of a second)
          var pi = a * 8 + b;
          if (S.pair[pi] > 0) continue;
          var pvx = Math.sin(p.h) * p.v + p.pushX, pvz = Math.cos(p.h) * p.v + p.pushZ, qvx = Math.sin(q.h) * q.v + q.pushX, qvz = Math.cos(q.h) * q.v + q.pushZ;
          var vr = (qvx - pvx) * nx + (qvz - pvz) * nz;
          // side on (the push mostly across both karts) or end on
          var sideP = Math.abs(nx * Math.cos(p.h) - nz * Math.sin(p.h)), sideQ = Math.abs(nx * Math.cos(q.h) - nz * Math.sin(q.h)), side = Math.max(sideP, sideQ) > 0.6;
          var j = vr < 0 ? -(1 + K.restitution) * vr / im : 0;
          // (side by side, at least 3.6 m/s between them, so karts never ride along locked together)
          if (side && j * im < K.shove) j = K.shove / im;
          // a hop-bash: one hopping sideways into the other
          var bash = side ? (basher(p, q) ? 1 : basher(q, p) ? -1 : 0) : 0;
          if (j <= 0 && !bash) continue;
          shove(p, -j / wp * nx, -j / wp * nz); shove(q, j / wq * nx, j / wq * nz);
          if (!side && vr < -1) { var rear = relD(p.d, q.d) < 0 ? p : q; rear.v *= 1 - K.rear; }
          if (side && -vr > K.wobbleV) { p.wob = q.wob = K.wobbleT; }
          // (who did it: the one moving more into the other)
          var intoP = pvx * nx + pvz * nz, intoQ = -(qvx * nx + qvz * nz), by = bash ? (bash > 0 ? p : q) : intoP >= intoQ ? p : q, vic = by === p ? q : p;
          if (bash) bashHit(by, vic, by === p ? nx : -nx, by === p ? nz : -nz);
          else if (side && -vr > K.wobbleV) snatch(by, vic);
          // (a bump hard enough, and a rival is angry at whoever bumped it: Bull Run and Big Bear at any bump)
          if (!bash && (-vr > K.rage.bump || ((vic.ai.persona === 'ram' || vic.ai.persona === 'block') && -vr > 1.5))) rile(vic, idOf(by), 'bump');
          S.pair[pi] = K.pairT;
          if (-vr > 1 || side) S.events.push(['bump', a, b, +(Math.max(0, -vr)).toFixed(1), side ? 1 : 0, bash ? idOf(by) : -1]);
        }
      }
      // p hops sideways into q: in its hop, its hop's direction (or the stick) toward q's side of it, q not just bashed
      function basher(p, q) {
        if (p.hop < 0 || q.bashI > 0) return false;
        var dir = p.hopDir || (Math.abs(p.inp.steer || 0) > 0.25 ? (p.inp.steer > 0 ? 1 : -1) : 0);
        if (!dir) return false;
        // (q's side of p: + its right, which is (-cos h, sin h))
        var s0 = (q.x - p.x) * -Math.cos(p.h) + (q.z - p.z) * Math.sin(p.h);
        return s0 * dir > 0;
      }
      // a bash landed: q shoved across (more by a heavier kart, less by a lighter), wobbling, slowed, a GM knocked out,
      // angry if it is a rival; and not bashed again for 1.2 s
      function bashHit(at, vi, nx, nz) {
        var B = K.bash, r = cl(at.mass / vi.mass, B.ratio[0], B.ratio[1]);
        shove(vi, nx * B.push * r, nz * B.push * r);
        vi.wob = Math.max(vi.wob, B.wob); vi.v *= B.slow; vi.bashI = B.iframe; vi.bump = 0.3;
        S.events.push(['bash', idOf(at), idOf(vi), +(B.push * r).toFixed(2)]);
        at.dealt++;
        snatch(at, vi);
        rile(vi, idOf(at), 'bash');
      }
      // a GM knocked loose: out of the one hit, on the road a little ahead of it on the side it was hit from (the
      // one who hit it is right there to take it), anyone's for 6 s; 2 s at least between two from the same kart
      function snatch(at, vi) {
        if (vi.gm <= 0 || vi.snatchI > 0) return;
        vi.gm--; vi.snatchI = K.bash.snatch;
        var sd = at.lat >= vi.lat ? 1 : -1;
        S.spill.push({ d: wrap(vi.d + 3), x: cl(vi.lat + sd * 1.1, -(TR.hw - 0.8), TR.hw - 0.8), t: IT.spill, by: idOf(vi), on: true, snatch: idOf(at) });
        S.events.push(['snatch', idOf(at), idOf(vi)]);
      }
      // road rage: a rival angry at the kart that bumped, bashed or hit it, for 4 s, unless it was angry lately
      function rile(k, by, why) {
        var A = k.ai;
        if (k.human || by < 0 || by === idOf(k) || A.mad > 0 || A.calm > 0 || k.fin || A.persona === 'clean') return;
        A.mad = K.rage.T; A.madAt = by; A.ramT = 0;
        S.events.push(['angry', idOf(k), by, why]);
      }
      // an impulse: what is along the kart changes its speed, what is across it shoves it sideways and fades
      function shove(k, dvx, dvz) {
        var fx = Math.sin(k.h), fz = Math.cos(k.h), along = dvx * fx + dvz * fz;
        k.v += along; k.pushX += dvx - along * fx; k.pushZ += dvz - along * fz;
      }
      function segs(ax, az, bx, bz, cx, cz, dx, dz) {
        var ux = bx - ax, uz = bz - az, vx = dx - cx, vz = dz - cz, wx = ax - cx, wz = az - cz;
        var a = ux * ux + uz * uz, b = ux * vx + uz * vz, c = vx * vx + vz * vz, d = ux * wx + uz * wz, e = vx * wx + vz * wz, D = a * c - b * b, s, t;
        s = D > 1e-8 ? Math.max(0, Math.min(1, (b * e - c * d) / D)) : 0;
        t = c > 1e-8 ? (b * s + e) / c : 0;
        if (t < 0) { t = 0; s = a > 1e-8 ? Math.max(0, Math.min(1, -d / a)) : 0; } else if (t > 1) { t = 1; s = a > 1e-8 ? Math.max(0, Math.min(1, (b - d) / a)) : 0; }
        return [ax + ux * s, az + uz * s, cx + vx * t, cz + vz * t];
      }

      // places: the finished by when they finished, then everyone by how far they have legitimately got
      var ORDER = [];
      function places() {
        ORDER.length = 0;
        for (var i = 0; i < S.karts.length; i++) ORDER.push(S.karts[i]);
        ORDER.sort(function (a, b) {
          var ka = a.fin ? 1e12 - a.finPlace : Math.min(a.prog, (a.gate + 1) * GL), kb = b.fin ? 1e12 - b.finPlace : Math.min(b.prog, (b.gate + 1) * GL);
          return kb - ka || a.slot - b.slot;
        });
        for (i = 0; i < ORDER.length; i++) ORDER[i].place = i + 1;
      }
      // when a kart still racing would finish: what it has left at the pace it has kept (at least 8 m/s)
      S.estimate = function (k) {
        if (k.fin) return k.finT;
        var got = Math.max(0, Math.min(k.prog, (k.gate + 1) * GL)), left = Math.max(0, S.laps * Lt - got);
        return S.time + left / Math.max(8, S.time > 1 ? got / S.time : 8);
      };
      // the race's order at the end: everyone home by their time, everyone still out by their estimate
      S.standings = function () {
        return S.karts.map(function (k, n0) { return { n: n0, time: S.estimate(k), est: !k.fin }; })
          .sort(function (a, b) { var A0 = S.karts[a.n], B0 = S.karts[b.n]; return (A0.fin && B0.fin ? A0.finPlace - B0.finPlace : 0) || (A0.fin !== B0.fin ? (A0.fin ? -1 : 1) : 0) || a.time - b.time || A0.slot - B0.slot; });
      };
      // the end of a person's run that has not finished (the race is over 25 s after the leader): home by estimate
      // (its time estimated before it is marked home: the estimate of a kart that is home is the time it has, 0 here)
      // the share of the race a kart has driven, 0 to 1 (1 home; a race called before it finished counts that much of it)
      // (home: 1; home by estimate: the share it had when the race was called, kept, under 1)
      S.progress = function (k) { return k.fin ? (k.est ? k.share : 1) : Math.max(0, Math.min(1, Math.min(k.prog, (k.gate + 1) * GL) / (S.laps * Lt))); };
      S.finishBy = function (k) { if (k.fin) return; S.marks.push([S.steps, 'finishBy', idOf(k)]); places(); k.share = Math.min(0.999, S.progress(k)); k.finT = S.estimate(k); k.fin = true; k.est = true; k.finPlace = ++S.finishers; S.events.push(['finish', idOf(k), k.finPlace]); };
      // the race stopped where it is (the podium): logged too, so a replay stops at the same step
      S.stop = function () { if (S.phase === 'done') return; S.marks.push([S.steps, 'stop']); S.phase = 'done'; };

      /* -------- the items: the slot, the roulette, and what each one does -- */
      var IT = K.items;
      function progOf(k) { return Math.min(k.prog, (k.gate + 1) * GL); }
      // the odds' row: your place, one row on if you are more than 120 m behind the leader, two if more than 300
      function bucketOf(k) {
        var lead = ORDER[0] || k, back = lead.fin ? 1e9 : progOf(lead) - progOf(k), b = k.place + (back > IT.behind[1] ? 2 : back > IT.behind[0] ? 1 : 0);
        return Math.max(1, Math.min(8, b));
      }
      // how many of a kind are out: in a slot, on the roulette, running, or in the air
      function outOf(id) {
        var c = 0, q;
        for (q = 0; q < S.karts.length; q++) {
          var k = S.karts[q];
          if (k.item === id || (k.roll > 0 && k.rollPick === id)) c++;
          if ((id === 'diamond' && k.diamond > 0) || (id === 'moon' && k.moon > 0)) c++;
        }
        if (id === 'laser') c += S.shots.length;
        if (id === 'whale' && S.whale) c++;
        return c;
      }
      function blocked(k, id) {
        if (id === 'whale') return outOf('whale') > 0 || S.time < IT.whale.first || S.time - S.whaleAt < IT.whale.gap;
        if (id === 'moon') return outOf('moon') >= IT.caps.moon || S.laps * Lt - progOf(k) < IT.moon.finish;
        if (IT.caps[id]) return outOf(id) >= IT.caps[id];
        return false;
      }
      // a roll: the bucket's odds times the world's weights, a kind that would break a limit left out (rolled again);
      // a bucket the world has weighed down to nothing rolls by the weights alone
      var ODDW = new Float64Array(10);
      function rollItem(k, b) {
        var row = IT.odds[(b || bucketOf(k)) - 1], W = S.weights, tot = 0, i;
        for (i = 0; i < 10; i++) { ODDW[i] = blocked(k, IT.ids[i]) ? 0 : row[i] * (W ? W[i] : 1); tot += ODDW[i]; }
        if (tot <= 0 && W) for (i = 0; i < 10; i++) { ODDW[i] = blocked(k, IT.ids[i]) ? 0 : W[i]; tot += ODDW[i]; }
        if (tot <= 0) return 'gmbag';
        var r = S.rng() * tot;
        for (i = 0; i < 10; i++) { r -= ODDW[i]; if (r < 0 && ODDW[i] > 0) return IT.ids[i]; }
        return 'gmbag';
      }
      S.bucketOf = bucketOf; S.blocked = blocked; S.outOf = outOf; S.rollItem = rollItem;
      function startRoll(k) { k.roll = IT.roll; k.rollT = 0; k.rollStop = false; k.rollPick = rollItem(k); S.events.push(['roll', idOf(k), k.rollPick]); }
      // GM knocked out of a kart: on the road round it, anyone's for 6 s
      function spillGM(k, n) {
        var lost = Math.min(k.gm, n);
        k.gm -= lost;
        // (behind it and to either side: the karts behind get them, the one hit would have to come back)
        for (var c = 0; c < lost; c++) S.spill.push({ d: wrap(k.d - 4 - c * 1.8), x: cl(k.lat + (c % 2 ? 1 : -1) * (1.2 + S.rng() * 1.2), -(TR.hw - 0.8), TR.hw - 0.8), t: IT.spill, by: idOf(k), on: true });
        if (lost) S.events.push(['spill', idOf(k), lost]);
      }
      // a hit by an item: nothing on Diamond Hands, To The Moon or a kart just hit; the Cold Wallet takes it instead
      // (not the Whale); otherwise a spin (a rug, a touch of Diamond Hands or To The Moon), a tumble (a laser) or a flip
      // (the Whale), the speed cut, the drift and any boost lost, an item dragged behind lost, GM gone, and a second
      // untouchable after it
      function hit(k, kind, by) {
        if (k.parked || k.rescue >= 0) return '';
        if (k.diamond > 0 || k.moon > 0) return 'immune';
        if (k.iframe > 0 || k.ghost > 0) return 'iframe';
        if (k.shield > 0 && kind !== 'whale') { k.shield = 0; k.iframe = IT.iframe; S.events.push(['blocked', idOf(k), kind, by == null ? -1 : by]); return 'blocked'; }
        // (and the course's hazards: a spin, or the rolling coin's bonk)
        var HZ = K.haz, T = kind === 'laser' ? IT.laser.T : kind === 'whale' ? IT.whale.flipT : kind === 'rug' ? IT.rug.T : kind === 'spin' ? HZ.spinT : kind === 'bonk' ? HZ.bonkT : IT.diamond.spinT;
        k.v *= kind === 'laser' ? IT.laser.mul2 : kind === 'whale' ? IT.whale.mul : kind === 'rug' ? IT.rug.mul : kind === 'spin' ? HZ.spinMul : kind === 'bonk' ? HZ.bonkMul : IT.diamond.mul;
        k.stun = Math.max(k.stun, T); k.hitT = T; k.hitT0 = T; k.hitK = kind; k.iframe = T + IT.iframe;
        if (k.dDir) endDrift(k, false);
        k.hop = -1; k.grace = 0; k.cj = -1; k.bt = 0; k.bm = 1; k.draftC = 0; k.trick = false; if (!k.air && k.grind < 0) k.y = 0;
        // (off a rail, if it was on one)
        if (k.grind >= 0) { k.grind = -1; k.air = true; k.vy = 1.5; k.lipT = 9; k.airT = 0; }
        if (k.drag) { k.drag = false; k.item = null; }
        if (kind === 'rug') k.gm -= Math.min(k.gm, IT.rug.gm);
        else if (kind === 'laser' || kind === 'whale') spillGM(k, kind === 'laser' ? IT.laser.spill : IT.whale.spill);
        S.events.push(['hit', idOf(k), kind, by == null ? -1 : by]);
        if (by != null && by >= 0) rile(k, by, kind);
        // (an enemy hit, for the one whose item or trap it was: never a kart's own, nor one blocked, shrugged off or
        // untouchable, which return before here)
        if (by != null && by >= 0 && by !== idOf(k) && S.karts[by]) S.karts[by].dealt++;
        return 'hit';
      }
      S.hit = hit;
      // the slot: a press uses what is in it; a rug or a laser is dragged behind while the button is held, and used
      // when it is let go; on the roulette a press stops it (at 0.5 s at the soonest). Pushed up (aim 1) a rug is
      // lobbed ahead; pushed down (aim -1) a laser is fired back. Pushed up as the drag began counts if nothing is
      // pushed at the let-go (E is the button and the aim at once: let go, and both go together); a brake on the way
      // never turns a laser round
      function itemInput(k, I) {
        var press = !!I.item && !k.itemHeld;
        k.itemHeld = !!I.item;
        if (k.roll > 0) { if (press) k.rollStop = true; return; }
        if (!k.item || k.hitT > 0 || k.moon > 0) return;
        if (k.item === 'rug' || k.item === 'laser') {
          if (press && !k.drag) { k.drag = true; k.dragAim = I.aim > 0 ? 1 : 0; S.events.push(['drag', idOf(k), k.item]); }
          else if (k.drag && !I.item) { k.drag = false; useItem(k, I.aim || k.dragAim); }
        } else if (press) useItem(k, I.aim || 0);
      }
      function useItem(k, aim) {
        var id = k.item, n = idOf(k);
        if (!id) return;
        k.uses++;
        if (id === 'wow') {
          boost(k, IT.wow.cap, IT.wow.T, 'wow');
          if (--k.charges <= 0) { k.item = null; k.charges = 0; }
          S.events.push(['item', n, id, 'use', k.charges]);
          return;
        }
        k.item = null; k.charges = 0; k.drag = false;
        if (id === 'gmbag') k.gm += IT.bag;
        else if (id === 'rug') layRug(k, aim > 0);
        else if (id === 'wallet') k.shield = IT.wallet;
        else if (id === 'laser') fireLaser(k, aim < 0);
        else if (id === 'pump') boost(k, IT.pump.cap, IT.pump.T, 'pump');
        else if (id === 'fud') fireFud(k);
        else if (id === 'whale') fireWhale(k);
        else if (id === 'diamond') { k.diamond = IT.diamond.T; boost(k, IT.diamond.cap, IT.diamond.T, 'diamond'); }
        else if (id === 'moon') { k.moon = IT.moon.T; if (k.dDir) endDrift(k, false); k.hop = -1; k.grace = 0; k.ramp = -1; k.ry = 0; k.air = false; k.abyss = false; k.trick = false; k.vy = 0; }
        S.events.push(['item', n, id, aim > 0 ? 'ahead' : aim < 0 ? 'back' : 'use', 0]);
      }
      S.useItem = useItem;
      // a Rug Pull: dropped behind, or lobbed to land 20 m ahead of where you will be; three an owner (a fourth takes
      // the oldest up)
      function layRug(k, lob) {
        var R0 = IT.rug, n = idOf(k), mine = 0, q;
        for (q = S.traps.length - 1; q >= 0; q--) if (S.traps[q].owner === n && S.traps[q].on && ++mine >= R0.per) { S.traps[q].on = false; S.events.push(['trap', S.traps[q].id, -1, 'old']); }
        var to = lob ? wrap(k.d + R0.lob + Math.max(0, k.v) * R0.lobT) : wrap(k.d - R0.back);
        var tr = { id: S.uid++, owner: n, d: lob ? k.d : to, x: cl(k.lat, -TR.wall + 1, TR.wall - 1), y: lob ? 0.9 : 0, t: 0, on: true, fly: lob ? R0.lobT : 0, d0: k.d, d1: to };
        S.traps.push(tr);
        S.events.push(['rug', n, tr.id, lob ? 1 : 0]);
      }
      // Laser Eyes: from just ahead of the kart (behind, fired back), at the next kart ahead
      function aheadOf(d, range, not1, not2) {
        var best = -1, bd = range;
        for (var q = 0; q < S.karts.length; q++) {
          var o = S.karts[q]; if (q === not1 || q === not2 || o.parked || o.rescue >= 0 || o.fin) continue;
          var r = relD(o.d, d); if (r > 0.5 && r < bd) { bd = r; best = q; }
        }
        return best;
      }
      function fireLaser(k, back) {
        var L0 = IT.laser, n = idOf(k), h = back ? k.h + Math.PI : k.h;
        var sh = { id: S.uid++, owner: n, x: k.x + Math.sin(h) * 1.5, z: k.z + Math.cos(h) * 1.5, y: 0.9, h: h, v: Math.max(L0.min, L0.mul * Math.abs(k.v)), t: 0, dir: back ? -1 : 1, target: -1, past: -1, i: k.i, d: k.d, lat: k.lat, ground: k.ground };
        project(sh, false);
        if (!back) sh.target = aheadOf(sh.d, L0.range, n, -1);
        S.shots.push(sh);
        S.events.push(['laser', n, sh.id, sh.target, back ? 1 : 0]);
      }
      function fireFud(k) {
        var n = idOf(k), list = [];
        for (var q = 0; q < S.karts.length; q++) { var o = S.karts[q]; if (q !== n && !o.parked && !o.fin && o.place < k.place) list.push(q); }
        S.fuds.push({ owner: n, t: 0, list: list, done: false });
        S.events.push(['fud', n, list.length]);
      }
      function fireWhale(k) {
        var n = idOf(k), tg = ORDER[0] === k ? ORDER[1] : ORDER[0], m = idOf(tg);
        S.whale = { owner: n, target: m, t: 0, x: tg.x, z: tg.z, d: tg.d, lat: tg.lat, g: tg.ground, locked: false, slam: false, hits: 0 };
        S.whaleAt = S.time;
        S.events.push(['whale', n, m]);
      }
      // To The Moon: 3.5 s on the rocket, on rails down the racing line (its own lane) at 40 m/s (1.5 times the top
      // speed if that is more), off the ground; it hops every trap, nothing touches it, and it spins whoever it meets
      function moonStep(k, dt) {
        var V = Math.max(IT.moon.v, IT.moon.vmul * k.top), LN = S.line, lim = TR.hw - 1.2;
        k.v = k.v < V ? Math.min(V, k.v + 60 * dt) : V;
        var d = wrap(k.d + k.v * dt), i = idx(Math.round(d / ds)), want = cl(LN.off[i] + k.ai.lane * 0.4, -lim, lim), lat = dampTo(k.lat, want, 2.2, dt);
        var h0 = k.h, h = Math.atan2(TR.tx[i], TR.tz[i]);
        k.x = TR.px[i] + TR.rx[i] * lat + TR.tx[i] * (d - i * ds); k.z = TR.pz[i] + TR.rz[i] * lat + TR.tz[i] * (d - i * ds);
        k.h = h0 + wrapA(h - h0) * Math.min(1, dt * 14); k.w = wrapA(k.h - h0) / dt; k.slip = dampTo(k.slip, 0, 8, dt); k.yaw = k.h + k.slip;
        k.y = dampTo(k.y, IT.moon.y, 6, dt); k.steer = dampTo(k.steer, 0, 4, dt);
        k.pushX = k.pushZ = 0; k.air = false; k.ramp = -1; k.hop = -1; k.stun = 0; k.surf = 1; k.off = false; k.wet = 0;
        project(k, false);
        progress(k, dt);
        if (k === S.karts[S.human]) collect(k);
      }
      // a kart's items in a step: the roulette landing, what is running down, the crates and the spilled GM it drives
      // through
      function itemKart(k, dt) {
        if (k.roll > 0) {
          k.rollT += dt;
          if (k.rollT >= IT.roll || (k.rollStop && k.rollT >= IT.stop)) {
            k.roll = 0; k.item = k.rollPick; k.charges = k.item === 'wow' ? IT.wow.n : 1; k.rollPick = null; k.rollStop = false;
            S.events.push(['got', idOf(k), k.item]);
          } else k.roll = IT.roll - k.rollT;
        }
        if (k.shield > 0) { k.shield -= dt; if (k.shield <= 0) { k.shield = 0; S.events.push(['shieldEnd', idOf(k)]); } }
        if (k.diamond > 0) k.diamond = Math.max(0, k.diamond - dt);
        if (k.moon > 0) {
          k.moon -= dt;
          // (never run out over a break or just short of one, past its ramp: on until the road is under it again; 8 Oct,
          // a rocket out 10 m before the crater dropped its kart straight in)
          if (k.moon <= 0) for (var mq = 0; mq <= Math.max(6, Math.abs(k.v) * 0.5); mq += 2) if (breakAt(wrap(k.d + mq), k.lat)) { k.moon = 1e-3; break; }
          if (k.moon <= 0) {
            k.moon = 0; k.iframe = Math.max(k.iframe, IT.moon.after);
            if (k.y > 0.05) { k.air = true; k.vy = 0; k.lipT = 9; k.abyss = false; k.big = false; k.trick = false; }
            S.events.push(['moonEnd', idOf(k)]);
          }
        }
        if (k.iframe > 0) k.iframe = Math.max(0, k.iframe - dt);
        if (k.hitT > 0) { k.hitT = Math.max(0, k.hitT - dt); if (k.hitT <= 0) k.hitK = ''; }
        if (k.fudT > 0) k.fudT = Math.max(0, k.fudT - dt * (k.bt > 0 ? 2 : 1));
        if (k.fudAI > 0) k.fudAI = Math.max(0, k.fudAI - dt);
        if (k.parked || k.rescue >= 0 || (k.air && k.y > 1.6)) return;
        var q;
        if (!k.fin) for (q = 0; q < S.crates.length; q++) {
          var c = S.crates[q];
          if (!c.on || Math.abs(c.x - k.lat) > IT.crate || Math.abs(relD(c.d, k.d)) > IT.crate) continue;
          c.on = false; c.t = IT.respawn;
          var rolls = !k.item && k.roll <= 0;
          S.events.push(['crate', idOf(k), q, rolls ? 1 : 0]);
          if (rolls) startRoll(k);
        }
        for (q = 0; q < S.spill.length; q++) {
          var sp = S.spill[q];
          if (!sp.on || (sp.by === idOf(k) && sp.t > IT.spill - 0.6) || Math.abs(sp.x - k.lat) > K.gm.r || Math.abs(relD(sp.d, k.d)) > K.gm.r) continue;
          sp.on = false; k.gm++; S.events.push(['coin', idOf(k), k.gm, 1]);
        }
      }
      // the items on the road and in the air, a step
      function itemsStep(dt) {
        var A = S.karts, q, j, k;
        for (q = 0; q < S.crates.length; q++) { var c = S.crates[q]; if (!c.on && (c.t -= dt) <= 0) { c.on = true; c.t = 0; } }
        for (q = 0; q < A.length; q++) itemKart(A[q], dt);
        // the rugs: in the air, then down; driven onto (by anyone not hopping clear of it, its owner after 0.4 s)
        var R0 = IT.rug;
        for (j = 0; j < S.traps.length; j++) {
          var tr = S.traps[j];
          if (!tr.on) continue;
          tr.t += dt;
          if (tr.fly > 0) {
            tr.fly -= dt; var u = 1 - Math.max(0, tr.fly) / R0.lobT;
            tr.d = wrap(tr.d0 + relD(tr.d1, tr.d0) * u); tr.y = 0.9 * (1 - u) + 3.2 * u * (1 - u);
            if (tr.fly <= 0) { tr.fly = 0; tr.y = 0; tr.d = tr.d1; tr.t = R0.arm; S.events.push(['rugDown', tr.owner, tr.id]); }
            continue;
          }
          if (tr.t > R0.life) { tr.on = false; S.events.push(['trap', tr.id, -1, 'time']); continue; }
          for (q = 0; q < A.length; q++) {
            k = A[q];
            if (k.parked || k.rescue >= 0 || (q === tr.owner && tr.t < R0.arm) || Math.abs(relD(tr.d, k.d)) > 1.3 || Math.abs(tr.x - k.lat) > R0.w / 2 + 0.6) continue;
            // (over it in a hop, or in the air, or on the rocket: clear)
            if (k.y > R0.h || k.air) continue;
            var res = hit(k, 'rug', tr.owner);
            if (res === 'iframe') continue;
            tr.on = false; S.events.push(['trap', tr.id, q, res]);
            break;
          }
        }
        // the lasers: homing on their kart (or the road ahead), into a wall, a rug, or a kart: a kart hopping as it
        // closes lets it by underneath; a kart dragging something behind takes it there
        var L0 = IT.laser;
        for (j = 0; j < S.shots.length; j++) {
          var sh = S.shots[j];
          sh.t += dt;
          if (sh.t > L0.life) { sh.dead = 'time'; continue; }
          if (sh.dir > 0) {
            var tg = sh.target >= 0 ? A[sh.target] : null;
            if (!tg || tg.parked || tg.rescue >= 0 || tg.fin || relD(tg.d, sh.d) < -2) { sh.target = aheadOf(sh.d, L0.range, sh.owner, sh.past); tg = sh.target >= 0 ? A[sh.target] : null; }
            var tx, tz;
            if (tg) { tx = tg.x; tz = tg.z; }
            else { var ia = idx(sh.i + Math.round(25 / ds)); tx = TR.px[ia] + TR.rx[ia] * S.line.off[ia]; tz = TR.pz[ia] + TR.rz[ia] * S.line.off[ia]; }
            var dh = wrapA(Math.atan2(tx - sh.x, tz - sh.z) - sh.h), mx = L0.turn * dt;
            sh.h += dh < -mx ? -mx : dh > mx ? mx : dh;
            sh.y = dampTo(sh.y, tg ? tg.y + 0.6 : 0.9, 4, dt);
          }
          sh.x += Math.sin(sh.h) * sh.v * dt; sh.z += Math.cos(sh.h) * sh.v * dt;
          project(sh, false);
          if (Math.abs(sh.lat) > TR.wall && !gapAt(sh.d, sh.lat > 0 ? 1 : -1)) { sh.dead = 'wall'; continue; }
          for (q = 0; q < S.traps.length && !sh.dead; q++) { var t2 = S.traps[q]; if (t2.on && !t2.fly && Math.abs(relD(t2.d, sh.d)) < 1.2 && Math.abs(t2.x - sh.lat) < 1.2) { t2.on = false; sh.dead = 'rug'; S.events.push(['trap', t2.id, -1, 'laser']); } }
          for (q = 0; q < A.length && !sh.dead; q++) {
            k = A[q];
            if ((q === sh.owner && sh.t < 0.5) || q === sh.past || k.parked || k.rescue >= 0) continue;
            var ex = k.x - sh.x, ez = k.z - sh.z;
            if (ex * ex + ez * ez > (L0.r + K.radius) * (L0.r + K.radius)) continue;
            if (k.y > L0.clear && k.hop >= 0) { sh.past = q; if (sh.target === q) sh.target = -1; S.events.push(['dodge', q, sh.id]); continue; }
            if (k.drag && relD(k.d, sh.d) > 0) { k.drag = false; k.item = null; sh.dead = 'shield'; S.events.push(['shielded', q, sh.id]); continue; }
            var r2 = hit(k, 'laser', sh.owner);
            if (r2 === 'iframe') { sh.past = q; continue; }
            sh.dead = r2 || 'hit'; sh.victim = q;
          }
        }
        for (j = S.shots.length - 1; j >= 0; j--) if (S.shots[j].dead) { var s0 = S.shots[j]; S.events.push(['laserEnd', s0.id, s0.dead, s0.victim == null ? -1 : s0.victim]); S.shots.splice(j, 1); }
        for (j = S.traps.length - 1; j >= 0; j--) if (!S.traps[j].on) S.traps.splice(j, 1);
        // the Whale: its shadow on its kart, the aim locked 0.25 s before the slam, and the slam
        var W = S.whale, W0 = IT.whale;
        if (W) {
          W.t += dt;
          var wt = A[W.target];
          if (!W.locked) { W.x = wt.x; W.z = wt.z; W.d = wt.d; W.lat = wt.lat; W.g = wt.ground; if (W.t >= W0.T - W0.lock) { W.locked = true; S.events.push(['whaleLock', W.target]); } }
          if (!W.slam && W.t >= W0.T) {
            W.slam = true;
            for (q = 0; q < A.length; q++) { k = A[q]; var wx = k.x - W.x, wz = k.z - W.z; if (wx * wx + wz * wz < W0.r * W0.r && k.y < 4 && hit(k, 'whale', W.owner) === 'hit') W.hits++; }
            S.events.push(['slam', W.target, W.hits]);
          }
          if (W.t >= W0.T + 1.0) S.whale = null;
        }
        // FUD: on its way, then on everyone it was sent at
        for (j = S.fuds.length - 1; j >= 0; j--) {
          var F = S.fuds[j]; F.t += dt;
          if (F.t < IT.fud.delay) continue;
          for (q = 0; q < F.list.length; q++) {
            k = A[F.list[q]];
            if (k.diamond > 0 || k.moon > 0 || k.parked) continue;
            if (k.shield > 0) { k.shield = 0; S.events.push(['blocked', F.list[q], 'fud', F.owner]); continue; }
            if (k.human) k.fudT = IT.fud.T; else k.fudAI = IT.fud.ai;
            S.events.push(['fudHit', F.list[q], F.owner]);
          }
          S.fuds.splice(j, 1);
        }
        for (j = S.spill.length - 1; j >= 0; j--) { var sp = S.spill[j]; sp.t -= dt; if (sp.t <= 0 || !sp.on) S.spill.splice(j, 1); }
      }
      // the rivals with an item: a moment to react (Doge sooner), then used: a rug or a laser dragged behind as a
      // shield until a kart close behind (a rug) or ahead (a laser) makes it worth more used, or 8 s have gone; a boost
      // saved to jump out from under a Whale when this rival has the nerve
      // the road manners: how often each takes a rail it meets (your kart on the autopilot, most of the time), and the
      // kart a rammer goes for: the nearest within 10 m ahead (3 behind) and 3.5 m across, not just bashed (The Whale
      // only a lighter one), as often as its manner likes (the choice made once a kart)
      var RAILGO = { risky: 0.9, draft: 0.55, items: 0.4, punch: 0.4, '': 0.4, clean: 0.4, auto: 0.6, ram: 0.25, block: 0.2, bully: 0.2 }, RAMGO = { ram: 0.65, bully: 0.6, punch: 0.45 };
      function rammable(k) {
        var A = k.ai, best = -1, bd = 1e9;
        for (var q = 0; q < S.karts.length; q++) {
          var o = S.karts[q], r = relD(o.d, k.d), dl = Math.abs(o.lat - k.lat);
          if (o === k || o.parked || o.rescue >= 0 || o.ghost > 0 || o.fin || o.air || o.bashI > 0 || r < -3 || r > 10 || dl > 3.5) continue;
          if (A.persona === 'bully' && o.mass >= k.mass - 0.05) continue;
          if (Math.abs(r) + dl < bd) { bd = Math.abs(r) + dl; best = q; }
        }
        if (best < 0) return -1;
        if (A.ramSeen !== best) { A.ramSeen = best; A.ramGo = S.rng() < (RAMGO[A.persona] || 0); }
        return A.ramGo ? best : -1;
      }
      // a lip or a ramp whose edge is within 12 m before d (a jump over a break there): where it is across, and how
      // wide, or null
      function lipBefore(d) {
        var q, e;
        for (q = 0; q < CO.bumps.length; q++) { var B = CO.bumps[q]; e = relD(d, B.d0 + B.len * B.n); if (B.kind === 'lip' && e >= -0.5 && e <= 12) return { x: B.x, w: B.w }; }
        for (q = 0; q < CO.ramps.length; q++) { var R0 = CO.ramps[q]; e = relD(d, R0.d0 + R0.len); if (e >= -0.5 && e <= 12) return { x: R0.x, w: R0.w }; }
        return null;
      }
      // the stick that takes a kart to x across the road, square to it (steering the speed it moves across)
      function steerTo(k, x) {
        var i = k.i, latV = k.v * (Math.sin(k.h) * TR.rx[i] + Math.cos(k.h) * TR.rz[i]);
        return cl(((x - k.lat) * 2.2 - latV) * 0.35, -1, 1);
      }
      // a rail with a break under it
      function railOverBreak(R0) { for (var q = 0; q < CO.breaks.length; q++) if (within(CO.breaks[q].d0, R0.d0, R0.len)) return true; return false; }
      function nearBy(k, lo, hi) {
        for (var q = 0; q < S.karts.length; q++) { var o = S.karts[q]; if (o === k || o.parked || o.rescue >= 0) continue; var r = relD(o.d, k.d); if (r >= lo && r <= hi && Math.abs(o.lat - k.lat) < 4) return true; }
        return false;
      }
      function aiItems(k, dt) {
        var A = k.ai, I = k.inp, W = S.whale, id = k.item;
        // (a person's kart steered for them by a film's assist keeps its items for them)
        if (k.human && !k.auto) return;
        I.aim = 0;
        if (W && W.target === idOf(k) && !W.locked) {
          if (!A.whale) { A.whale = true; A.whaleGo = S.rng() < IT.dodge; }
          if (A.whaleGo && W.t > IT.whale.T - IT.whale.lock - 0.3 && (id === 'pump' || id === 'wow' || id === 'moon' || id === 'diamond')) { I.item = !k.itemHeld; return; }
        } else if (!W) A.whale = false;
        if (k.roll > 0 || !id || k.fin) { A.wait = -1; A.hold = 0; return; }
        if (A.wait < 0) A.wait = IT.react * (0.7 + 0.8 * S.rng()) / A.eager;
        // (angry, at once)
        if (A.mad > 0) A.wait = Math.min(A.wait, 0.15);
        A.wait -= dt;
        if (A.wait > 0) return;
        if (id === 'rug' || id === 'laser') {
          if (!k.drag) { I.item = !k.itemHeld; A.hold = 0; return; }
          A.hold += dt;
          var go = A.hold > IT.holdMax / Math.min(2, A.eager) || (id === 'rug' ? nearBy(k, -20, -3) : nearBy(k, 3, 70));
          I.item = !go;
          if (go) A.wait = -1;
          return;
        }
        // (FUD saved until there is someone ahead to send it at; a Whale's aim is never yourself)
        if (id === 'fud' && k.place === 1) return;
        if (id === 'moon' && (k.v < 0.4 * k.top || k.air)) return;
        if (k.itemHeld) { I.item = false; return; }
        I.item = true;
        A.wait = id === 'wow' ? 1.1 / A.eager : -1;
      }

      /* -------- the rivals' driving: the same controls a person has -- */
      function aiStep(k, dt) {
        var A = k.ai, I = k.inp, LN = S.line;
        I.analog = true; I.item = false;
        if (S.phase !== 'race' || k.parked || k.rescue >= 0) { I.gas = S.phase === 'grid' && !k.parked && S.count < 0.7; I.brake = I.drift = false; I.steer = 0; A.cj = 0; return; }
        // (its rage running out, and the cool-down after it; a bash's cool-down; a slingshot's)
        if (A.mad > 0) { A.mad -= dt; if (A.mad <= 0) { A.mad = 0; A.calm = K.rage.cool; S.events.push(['calm', idOf(k)]); } } else if (A.calm > 0) A.calm = Math.max(0, A.calm - dt);
        A.ramT = Math.max(0, A.ramT - dt); A.sling = Math.max(0, A.sling - dt); A.hunting = -1;
        // the catch-up, out of your sight only (more than 50 m away, or behind you), eased in and out: a rival far
        // ahead eases (0.95), one well behind finds a little (to 1.06; to 1.03, and no easing, in the last 40%); the
        // middle of the race (12% to 75% of it) holds the pack tighter (50 m ahead, 20 to 80 m behind)
        var hu = S.human >= 0 ? S.karts[S.human] : null, el = 1;
        if (hu && hu !== k && !hu.fin) {
          var gap = k.prog - hu.prog, late = hu.prog > 0.6 * S.laps * Lt, fr = hu.prog / (S.laps * Lt), PK = fr >= K.ai.pack.from && fr <= K.ai.pack.to ? K.ai.pack : K.ai;
          if (gap > K.ai.seen || gap < -12) {
            if (gap > PK.ahead) el = late ? 1 : PK.ease || 0.95;
            else if (gap < -PK.near) el = 1 + (late ? K.ai.late - 1 : K.ai.ceiling - 1) * Math.min(1, (-gap - PK.near) / (PK.behind - PK.near));
          }
        }
        A.el = dampTo(A.el, el, K.ai.lam, dt);
        // (FUD on a rival: 8% off its pace while it lasts)
        k.pace = Math.min(K.ai.ceiling, (k.human ? 1 : A.skill) * A.el) * (k.fudAI > 0 ? IT.fud.pace : 1);
        if (k.pace > k.maxPace) k.maxPace = k.pace;
        // in the air off a ramp: the gas held, and the trick (most of the time); jumped for a rail, steered (what the air
        // allows) to come down on it
        if (k.air) {
          A.cj = 0; I.gas = true; I.brake = false; I.steer = 0; I.drift = A.trickGo && !k.trick && k.lipT > 0.03 && k.lipT < 0.3; if (k.trick) A.trickGo = false;
          if (A.cjFor === 'rail' && k.cjAir && CO.rails[A.railSeen]) { var ax = railLat(CO.rails[A.railSeen], wrap(k.d + Math.max(0, k.v) * 0.15)); if (ax === ax) I.steer = steerTo(k, ax); }
          return;
        }
        // on a rail: along it to its end
        if (k.grind >= 0) { A.cj = 0; I.gas = true; I.brake = false; I.steer = 0; I.drift = false; aiItems(k, dt); return; }
        // stuck on something: back off it, steering away, then go again
        if (A.rev > 0) { A.rev -= dt; I.gas = false; I.brake = true; I.drift = false; I.steer = A.revSteer; return; }
        if (Math.abs(k.v) < 1.2 && S.time > 1.5) A.slow += dt; else A.slow = 0;
        if (A.slow > 1.0) { A.slow = 0; A.rev = 0.8; A.revSteer = k.lat > 0 ? 1 : -1; return; }
        var v = Math.max(0, k.v), i = k.i, q;
        // pure pursuit of a point on the line 0.6 s ahead (never nearer than 5 m, and nearer in a tight bend, where
        // a long chord would cut across the inside), in this kart's own lane
        var la = Math.max(5, Math.min(0.6 * v, 0.6 * Math.abs(LN.r[idx(i + 4)]))), j = idx(i + Math.round(la / ds));
        var tight = Math.min(1, 25 / Math.max(1, Math.abs(LN.r[j])));
        var lim = TR.hw - 1, o = LN.off[j] + A.lane * (1 - tight), dj = j * ds, rival = !k.human, me = idOf(k);
        // (Moon Cat's risky line: tighter into the inside of a bend than the line goes)
        if (rival && A.persona === 'risky') o -= (LN.r[j] > 0 ? 1 : -1) * 0.9 * tight;
        // a pad ahead: taken, most of the time (the choice made once a pass)
        for (q = 0; q < CO.pads.length; q++) {
          var P = CO.pads[q], r = relD(P.d0, k.d);
          if (r > 0 && r < la + 30) { if (A.padSeen !== q) { A.padSeen = q; A.padGo = S.rng() < K.ai.pad; } if (A.padGo) o = P.x; }
          else if (A.padSeen === q && r <= 0) A.padSeen = -1;
        }
        // an Airdrop row ahead and nothing in the slot: a crate in it, seven times in ten (the choice made once a row)
        if (S.itemsOn && !k.item && k.roll <= 0) {
          var cb = null, cbd = 1e9;
          for (q = 0; q < S.crates.length; q++) { var cr = S.crates[q], rc = relD(cr.d, k.d); if (rc > 8 && rc < 45 && (cb === null || cr.row === cb.row) && Math.abs(cr.x - o) < cbd && cr.on) { cb = cr; cbd = Math.abs(cr.x - o); } }
          if (cb) { if (A.crateSeen !== cb.row) { A.crateSeen = cb.row; A.crateGo = S.rng() < K.ai.crate; } if (A.crateGo) o = cb.x; }
        }
        // its road manner (a rival's), and its rage: who it is after
        var hunt = -1;
        if (rival) {
          if (A.mad > 0) hunt = A.madAt;
          else if ((A.persona === 'ram' || A.persona === 'bully' || A.persona === 'punch') && A.ramT <= 0) hunt = rammable(k);
          if (hunt >= 0) {
            var T0 = S.karts[hunt], rh = relD(T0.d, k.d), dh = T0.lat - k.lat;
            if (!T0.parked && T0.rescue < 0 && T0.ghost <= 0 && !T0.fin && rh > -4 && rh < (A.mad > 0 ? 45 : 10)) {
              // (at it: for its side once alongside, so the two meet side on; the bash when alongside)
              o = T0.lat - (Math.abs(rh) < 3 ? (dh > 0 ? 0.9 : -0.9) : 0); A.hunting = hunt;
              if (A.persona === 'punch' && A.mad <= 0 && Math.abs(rh) > 3) o = LN.off[j] + A.lane * (1 - tight);
              if (Math.abs(rh) < 1.6 && Math.abs(dh) < 2.7 && Math.abs(dh) > 0.8 && k.hop < 0 && !k.dDir && !k.held && A.cj === 0) { A.bash = dh > 0 ? 1 : -1; A.ramT = A.mad > 0 ? 1.4 : 2.6; }
            }
          } else if (A.persona === 'block') {
            // Big Bear: in the way of a kart coming up behind
            for (q = 0; q < S.karts.length; q++) { var ob = S.karts[q], rb = relD(ob.d, k.d); if (ob !== k && !ob.parked && ob.rescue < 0 && rb < -2.5 && rb > -16 && ob.v > v - 0.5 && Math.abs(ob.lat - k.lat) < 4) { o = cl(ob.lat, o - 2.5, o + 2.5); break; } }
          } else if (A.persona === 'draft') {
            // Shiba: onto the line of the kart ahead for its slipstream, and out of it when it fires
            if (A.sling > 0) o = A.slingTo;
            else for (q = 0; q < S.karts.length; q++) {
              var od = S.karts[q], rd = relD(od.d, k.d);
              if (od === k || od.parked || od.rescue >= 0 || rd < 4 || rd > 24 || Math.abs(od.lat - k.lat) > 4) continue;
              o = od.lat;
              if (k.bSrc === 'draft' && k.bt > K.draft.T - 0.05) { A.sling = 1.1; A.slingTo = cl(od.lat + (od.lat > 0 ? -2.7 : 2.7), -lim, lim); }
              break;
            }
          }
        }
        // a rail ahead, taken as often as its manner likes (Moon Cat nine times in ten): lined up on it, and a charge
        // jump onto it (below)
        var plan = null;
        for (q = 0; q < CO.rails.length && hunt < 0; q++) {
          var RL = CO.rails[q], r0 = relD(RL.d0, k.d);
          if (A.cj > 0 && A.cjFor === 'rail' && A.railSeen === q) { var rx0 = railLat(RL, wrap(k.d + 3)); if (rx0 !== rx0) rx0 = railLat(RL, wrap(RL.d0 + 3)); if (rx0 === rx0) o = rx0; plan = { kind: 'rail', R: RL }; break; }
          if (r0 < 8 || r0 > 55) continue;
          // (not a rail another runs on into, and not one beyond a break on the way: that is the break's to jump)
          var linked = false, gapFirst = false;
          for (var lq = 0; lq < CO.rails.length; lq++) if (CO.rails[lq].next === q) linked = true;
          for (var bq = 0; bq < CO.breaks.length; bq++) { var bg = relD(CO.breaks[bq].d0, k.d); if (bg > -1 && bg < r0) gapFirst = true; }
          if (linked || gapFirst) continue;
          if (A.railSeen !== q) { A.railSeen = q; A.railGo = S.rng() < RAILGO[A.persona || (k.human ? 'auto' : '')]; }
          if (A.railGo) { var rx = railLat(RL, wrap(RL.d0 + 3)); if (rx === rx) { o = rx; plan = { kind: 'rail', R: RL }; } }
          break;
        }
        // a break ahead across its line: a lip or a ramp just before it on the road (gone for), or a charge jump; a
        // break across part of the road only, round it (Moon Cat jumps it)
        for (q = 0; q < CO.breaks.length && !plan; q++) {
          var BR = CO.breaks[q], rbk = relD(BR.d0, k.d), full = BR.x0 <= -TR.hw && BR.x1 >= TR.hw;
          if (rbk < -1 || rbk > 42) continue;
          if (!full && (o < BR.x0 - 1.3 || o > BR.x1 + 1.3)) continue;
          if (!full && A.persona !== 'risky') { var lo2 = BR.x0 - 1.5, hi2 = BR.x1 + 1.5; o = (Math.abs(o - lo2) < Math.abs(o - hi2) && lo2 > -lim) || hi2 > lim ? lo2 : hi2; continue; }
          // (the lip or ramp, when the kart is on it, or can be by then: no hop to spoil its jump)
          var LP = lipBefore(BR.d0);
          if (LP && A.cj === 0 && (Math.abs(k.lat - LP.x) < LP.w / 2 - 0.4 || Math.abs(k.lat - LP.x) < (rbk - 6) * 0.22)) { o = LP.x; continue; }
          plan = { kind: 'break', at: BR.d0 };
        }
        // a rail it is not taking: round it, by the nearer side (a rail is a wall to a kart on the ground)
        for (q = 0; q < CO.rails.length; q++) {
          if (plan && plan.R === CO.rails[q]) continue;
          var xr = railLat(CO.rails[q], dj); if (xr !== xr) xr = railLat(CO.rails[q], wrap(k.d + 4));
          if (xr !== xr || Math.abs(o - xr) > 1.5) continue;
          o = (o >= xr && xr + 1.5 < lim) || xr - 1.5 < -lim ? xr + 1.5 : xr - 1.5;
        }
        // mud and grass on the road: round it, by the nearer side
        for (q = 0; q < CO.off.length; q++) {
          var F = CO.off[q];
          if (!within(dj, F.d0 - 6, F.len + 6) || o < F.x0 - 1.2 || o > F.x1 + 1.2) continue;
          var lo = F.x0 - 1.4, hi = F.x1 + 1.4;
          o = (Math.abs(o - lo) < Math.abs(o - hi) && lo > -lim) || hi > lim ? lo : hi;
        }
        // karts ahead, nearer than 6 m + 0.45 s and closing, or alongside: round them, on whichever side has the room
        // (2.5 m at most), and kept round until past
        var look = 6 + 0.45 * v, sw = 0, near = 1e9;
        for (q = 0; q < S.karts.length; q++) {
          var o2 = S.karts[q];
          if (o2 === k || o2.parked || o2.rescue >= 0 || o2.ghost > 0 || q === A.hunting) continue;
          var r2 = relD(o2.d, k.d);
          if (r2 < -2 || r2 > look || Math.abs(r2) > near || (v - o2.v < 0.5 && r2 > 4)) continue;
          var my = r2 > 0 ? k.lat + (o - k.lat) * Math.min(1, r2 / la) : k.lat, dl = my - o2.lat;
          if (Math.abs(dl) > 2.3) continue;
          var sideW = Math.abs(dl) > 0.3 ? (dl > 0 ? 1 : -1) : (A.swerve > 0 ? 1 : A.swerve < 0 ? -1 : (o2.lat < 0 ? 1 : -1)), to = o2.lat + sideW * 2.5;
          if (Math.abs(to) > lim) { sideW = -sideW; to = o2.lat + sideW * 2.5; }
          near = Math.abs(r2); sw = cl(to - o, -K.ai.swerve, K.ai.swerve);
        }
        // rugs ahead on its line: hopped (as often as its class has the timing for), or steered round
        for (q = 0; q < S.traps.length; q++) {
          var tr = S.traps[q];
          if (!tr.on || tr.fly > 0) continue;
          var r3 = relD(tr.d, k.d);
          if (r3 < 0 || r3 > Math.max(look + 6, v * 1.6) || r3 > near) continue;
          if (A.trap !== tr.id) { A.trap = tr.id; A.trapHop = S.rng() < IT.hop; }
          if (A.trapHop) continue;
          var my3 = k.lat + (o - k.lat) * Math.min(1, r3 / la), dl3 = my3 - tr.x;
          if (Math.abs(dl3) > 2.1) continue;
          var sd3 = Math.abs(dl3) > 0.2 ? (dl3 > 0 ? 1 : -1) : (tr.x < 0 ? 1 : -1), to3 = tr.x + sd3 * 2.4;
          if (Math.abs(to3) > lim) { sd3 = -sd3; to3 = tr.x + sd3 * 2.4; }
          // (as far off its own line as it takes: a rug is wider than a kart is)
          near = r3; sw = cl(to3 - o, -4, 4);
        }
        // a meteor's ring on its line: out of it, when it has the nerve (twice its class's chance to hop a trap)
        for (q = 0; q < CO.hazards.length; q++) {
          var HM = CO.hazards[q], hs = S.haz[q];
          if (HM.kind !== 'meteor' || hs.phase !== 'warn') continue;
          var rm = relD(hs.d, k.d), mk = q * 100000 + hs.cyc;
          if (rm < -HM.r || rm > Math.max(look + 10, v * 1.8) || Math.abs(o + sw - hs.lat) > HM.r + 1) continue;
          if (A.metSeen !== mk) { A.metSeen = mk; A.metGo = S.rng() < Math.min(0.9, IT.hop * 2); }
          if (!A.metGo) continue;
          var sm3 = hs.lat > 0 ? -1 : 1, to5 = hs.lat + sm3 * (HM.r + 1.4);
          if (Math.abs(to5) > lim) { sm3 = -sm3; to5 = hs.lat + sm3 * (HM.r + 1.4); }
          sw = cl(to5 - o, -6, 6);
        }
        // (at 4 a second times KART_PACE: round a kart in the same metres of road at the faster race, 7 Oct, round 3)
        A.swerve = dampTo(A.swerve, sw, 4 * KART_PACE, dt);
        // (FUD on a rival: its line shaken, three times its noise)
        if (k.fudAI > 0) o += IT.fud.noise * Math.sin(S.time * 1.9 + k.slot * 2.3) * Math.min(1, k.fudAI);
        o = cl(o + A.swerve, -lim, lim);
        var tx = TR.px[j] + TR.rx[j] * o - k.x, tz = TR.pz[j] + TR.rz[j] * o - k.z, tl = Math.hypot(tx, tz) || 1;
        var fx = Math.sin(k.h), fz = Math.cos(k.h);
        var sinA = (fz * tx - fx * tz) / tl;   // positive: the point is to the left
        var wantW = 2 * v * sinA / tl;
        // (the most it can turn here: the full-lock curve, never under 0.2 rad/s for the arithmetic's sake)
        var wm = Math.max(0.2, wMax(v)) * k.hand;
        // a drift for a tight corner coming up (radius under 34 m within the next second or so), if this rival
        // takes it; held until the corner opens out. (The first such bend coming, and its way: until 7 Oct the
        // tightest in the window, so in the chicane it hopped right for the second bend while still in the first, the
        // drift ended at once, and it bonked the first one's exit wall; and none where a bend the other way under
        // 60 m comes first, past the 0.25 s it will be through before the hop lands)
        if (!k.dDir && k.hop < 0 && !A.want && v > 0.55 * k.top && A.cj === 0 && !plan) {
          var minR = 1e9, a0 = Math.round(v * 0.25 / ds), a1 = Math.round(v * 1.2 / ds), q1, q3;
          for (q1 = a0; q1 <= a1; q1 += 2) { var rr = LN.r[idx(i + q1)]; if (Math.abs(rr) < 34) { minR = rr; break; } }
          for (q3 = a0; q3 < q1 && Math.abs(minR) < 34; q3 += 2) { var r3 = LN.r[idx(i + q3)]; if (Math.abs(r3) < 60 && (r3 > 0) !== (minR > 0)) minR = 1e9; }
          if (Math.abs(minR) < 34 && A.skip !== Math.round(i / 40)) {
            if (S.rng() < A.drift) { A.want = 0.6; A.dir = minR > 0 ? -1 : 1; } else A.skip = Math.round(i / 40);
          }
        }
        var drifting = k.dDir !== 0, prof = drifting || A.want > 0 ? LN.vd : LN.vn;
        if (A.want > 0 && !drifting) {
          A.want -= dt;
          // (through the hop: its line steered, the drift's way by 0.3 at least, enough to say which way)
          I.drift = true; I.steer = A.dir * Math.max(0.3, Math.min(1, A.dir * -wantW / wm));
          if (A.want <= 0) { A.want = 0; I.drift = false; }
        } else if (drifting) {
          A.want = 0;
          var open = true;
          for (var q2 = 0; q2 <= Math.round(Math.max(8, v * 0.5) / ds); q2 += 2) { var rq = LN.r[idx(i + q2)]; if (Math.abs(rq) < 50 && (rq > 0 ? -1 : 1) === k.dDir) { open = false; break; } }
          // (the steer that gives the yaw it wants, the drift's curve read backwards: dW dSpan^s in, dW dOut^s out)
          var dq = Math.max(1e-3, -wantW / (k.dDir * K.hd.dW * k.hand * Math.max(0.3, Math.min(1, v / (K.driftMin * k.top))))), s = Math.log(dq) / Math.log(dq >= 1 ? K.hd.dSpan : K.hd.dOut);
          // (let go once the corner opens out or the line turns the other way; until the drift is over, keep
          // steering it, counter-steering at the least)
          I.drift = !(open || s < -1.6);
          I.steer = Math.max(-1, Math.min(1, s)) * k.dDir;
        } else {
          I.drift = false;
          I.steer = Math.max(-1, Math.min(1, -wantW / wm));
        }
        // a charge jump planned (onto a rail, over a break): once lined up, Space held with the stick under a quarter
        // (no drift), and let go for the rail to be under it as it comes down, or at the break's edge
        if (plan && A.cj === 0 && !k.dDir && k.hop < 0 && !k.held && v > 9) {
          var tg = plan.kind === 'rail' ? relD(plan.R.d0, k.d) - v * 0.37 : relD(plan.at, k.d), need = v * (K.hopT + K.cj.full * 0.9) + 1, lined = plan.kind !== 'rail' || Math.abs(k.lat - o) < 1.0;
          if (tg < need && tg > (plan.kind === 'rail' ? -plan.R.len + v * 0.37 + 4 : 3) && lined) { A.cj = dt; A.cjFor = plan.kind; A.cjAt = plan.kind === 'rail' ? plan.R.d0 : plan.at; A.want = 0; }
          // (not lined up in time for a rail over a break: the break's own jump instead, while there is time for it)
          else if (plan.kind === 'rail' && !lined && tg < need && railOverBreak(plan.R)) A.railGo = false;
        }
        if (A.cj > 0) {
          A.cj += dt; A.want = 0;
          var cR = A.cjFor === 'rail' ? CO.rails[A.railSeen] : null, tland = wrap(k.d + v * 0.37), go = false, stop = false;
          if (cR) { go = relD(tland, cR.d0 + 1) >= 0 && relD(tland, cR.d0 + cR.len - 3) < 0; stop = relD(tland, cR.d0 + cR.len - 3) >= 0; }
          else { var tb = relD(A.cjAt, k.d); go = tb < 0.6 + v * 0.03; stop = tb < -2; }
          // (the charge lost, to a steer or a hit: given up)
          if (k.cj < 0 && k.hop < 0 && A.cj > K.hopT + 0.1) stop = true;
          if ((go && k.cj >= K.cj.min) || stop || A.cj > 2.5) { A.cj = 0; I.drift = false; }
          else I.drift = true;
          // (onto its line under it: for a rail, square to the rail; the stick under a quarter either way)
          if (cR) { var cx = railLat(cR, wrap(Math.max(0, relD(k.d, cR.d0)) > 0 ? k.d + 2 : cR.d0 + 2)); if (cx === cx) I.steer = steerTo(k, cx); }
          I.steer = cl(I.steer, -0.24, 0.24);
        }
        // the speed the line allows a little ahead, braked for early
        var ahead = idx(i + Math.round(Math.max(2, v * 0.3) / ds)), want = Math.min(k.top * k.pace * Math.max(1, k.bm), prof[ahead]);
        if (k.off) want = Math.min(want, k.top);
        I.gas = v < want - 0.2; I.brake = v > want + 2.5;
        // the hop-bash: a hop at the kart alongside, the stick toward it
        if (A.bash) { if (!k.held && k.hop < 0 && A.cj === 0) { I.drift = true; I.steer = A.bash * 0.6; } A.bash = 0; }
        // the hop over a rug it chose to hop: timed to be in the air as it passes under
        if (A.trapHop && !k.dDir && k.hop < 0 && !k.held && !A.want) {
          for (q = 0; q < S.traps.length; q++) {
            var t4 = S.traps[q]; if (t4.id !== A.trap || !t4.on || t4.fly > 0) continue;
            var r4 = relD(t4.d, k.d);
            if (r4 > 1.3 + v * 0.02 && r4 < 1.3 + v * 0.05 && Math.abs(t4.x - k.lat) < 1.6) { I.drift = true; I.steer = 0; A.trapHop = false; }
          }
        }
        // and over a laser homing on it, when it has the nerve (its chance to hop a trap): up 0.14 s before the beam
        // reaches it, so it is near the top of the hop (over the beam's 0.2 m from 0.06 s to 0.22 s) as it passes under
        for (q = 0; q < S.shots.length; q++) {
          var s4 = S.shots[q]; if (s4.dir < 0 || s4.target !== idOf(k) || s4.dead) continue;
          if (A.shot !== s4.id) { A.shot = s4.id; A.shotHop = S.rng() < IT.hop; }
          var g4 = relD(k.d, s4.d), c4 = s4.v - v;
          if (A.shotHop && !k.dDir && k.hop < 0 && !k.held && g4 > 0 && c4 > 1 && (g4 - IT.laser.r - K.radius) / c4 < 0.14) { I.drift = true; I.steer = 0; A.shotHop = false; }
        }
        aiItems(k, dt);
      }

      /* -------- the course's hazards (course.hazards), each on its own clock from GO: the same every race -- */
      // topple: a tall thing at the road's side warns (its shadow across the road, 1.4 s), falls (0.35 s) and spins
      // whoever is under it, lies across the road as a log a kart jumps off (2.5 s), and stands up again (0.8 s).
      // crossing: something rolls across the road (8 m/s, one way, then back the other), its line lit 1 s before; it
      // bonks whoever it meets. meteor: a ring on the road for 1.6 s, somewhere in its stretch, then the strike: a
      // spin, and up in the air. Each hit is an item's (hit()): a second untouchable after it, no stun-lock
      var HZT = { topple: { warn: 1.4, fall: 0.35, lie: 2.5, rise: 0.8 }, crossing: { warn: 1.0 }, meteor: { warn: 1.6, smoke: 1.2 } };
      function hazardsStep(dt) {
        var A = S.karts, k, n;
        for (var q = 0; q < CO.hazards.length; q++) {
          var H = CO.hazards[q], st = S.haz[q], tt = S.time + H.off, cyc = Math.floor(tt / H.every), u = tt - cyc * H.every, P = HZT[H.kind];
          if (cyc !== st.cyc) {
            st.cyc = cyc; st.slam = false; st.hits = 0;
            if (H.kind === 'meteor') {
              st.d = wrap(H.d - H.zone + 2 * H.zone * S.rng()); st.lat = (S.rng() * 2 - 1) * Math.max(0.5, TR.hw - 1.5);
              // (the owner's review drives, 7 Oct: a ring anywhere in its stretch hit somebody once in three races; one
              // strike in two now is aimed where the racer furthest on in the stretch will be when it lands, give or take
              // a few metres, its ring up the whole 1.6 s to get out of: the front of the pack's, so it bunches the
              // field up rather than stringing it out. Which strikes, and the few metres, from the cycle itself, not
              // the race's dice: every other race's draws stay as they were)
              if ((cyc + q) % 2 === 0) {
                var tgt = -1, ahead = P.warn, j1 = Math.sin(cyc * 12.9898 + q * 78.233) * 43758.5453, j2 = Math.sin(cyc * 39.346 + q * 11.135) * 24634.6345;
                j1 -= Math.floor(j1); j2 -= Math.floor(j2);
                for (n = 0; n < A.length; n++) { k = A[n]; if (k.parked || k.fin || k.rescue >= 0) continue; if (Math.abs(relD(k.d + k.v * ahead, H.d)) < H.zone && (tgt < 0 || k.prog > A[tgt].prog)) tgt = n; }
                if (tgt >= 0) { k = A[tgt]; st.d = wrap(k.d + k.v * ahead + (j1 * 2 - 1) * 3); st.lat = cl(k.lat + (j2 * 2 - 1) * 1.5, -(TR.hw - 1.5), TR.hw - 1.5); }
              }
            }
            else if (H.kind === 'crossing') st.side = H.side * (cyc % 2 ? -1 : 1);
          }
          if (H.kind === 'topple') {
            var a0 = P.warn, a1 = a0 + P.fall, a2 = a1 + P.lie, a3 = a2 + P.rise;
            st.phase = u < a0 ? 'warn' : u < a1 ? 'fall' : u < a2 ? 'lie' : u < a3 ? 'rise' : 'idle';
            st.u = st.phase === 'warn' ? u / a0 : st.phase === 'fall' ? (u - a0) / P.fall : st.phase === 'lie' ? (u - a1) / P.lie : st.phase === 'rise' ? (u - a2) / P.rise : 0;
            // (the span it lies across: from its foot to its tip)
            var foot = H.side * H.foot, tip = foot - H.side * H.len, lo = Math.min(foot, tip), hi = Math.max(foot, tip);
            if (!st.slam && u >= a1 && u < a2) {
              st.slam = true;
              for (n = 0; n < A.length; n++) { k = A[n]; if (on(k, H.d, 1.0, lo, hi) && k.y < 2 && hit(k, 'spin', -1) === 'hit') st.hits++; }
              S.events.push(['topple', q, st.hits]);
            }
            // (lying there: a log across the road, off which a kart on the ground jumps)
            if (st.phase === 'lie') for (n = 0; n < A.length; n++) { k = A[n]; if (!k.air && k.hop < 0 && k.grind < 0 && k.moon <= 0 && k.liftT <= 0 && k.v > 3 && on(k, H.d, 0.5 + k.v * dt, lo, hi)) liftOff(k, 3.4); }
          } else if (H.kind === 'crossing') {
            var span = TR.wall + 1.5, T1 = 2 * span / H.speed;
            st.phase = u < P.warn ? 'warn' : u < P.warn + T1 ? 'roll' : 'idle';
            st.u = st.phase === 'warn' ? u / P.warn : st.phase === 'roll' ? (u - P.warn) / T1 : 0;
            // (waiting at its side through the warning and back at the far side once across: until 8 Oct the warning's
            // second swept it across the road too, three times as fast and touching nobody, and a world that draws its
            // own (the swamp's log) drew it so, a log flying across the road and under the lens before every roll)
            st.lat = st.side * span * (1 - 2 * (st.phase === 'roll' ? st.u : st.phase === 'idle' ? 1 : 0));
            if (st.phase === 'roll') for (n = 0; n < A.length; n++) {
              k = A[n];
              if (!on(k, H.d, H.r * 0.35 + K.radius, st.lat - H.r * 0.7, st.lat + H.r * 0.7) || k.y > 2 * H.r) continue;
              if (hit(k, 'bonk', -1) === 'hit') { k.pushX -= TR.rx[k.i] * st.side * K.haz.push; k.pushZ -= TR.rz[k.i] * st.side * K.haz.push; st.hits++; S.events.push(['rolled', q, n]); }
            }
          } else {
            st.phase = u < P.warn ? 'warn' : u < P.warn + P.smoke ? 'smoke' : 'idle';
            st.u = st.phase === 'warn' ? u / P.warn : st.phase === 'smoke' ? (u - P.warn) / P.smoke : 0;
            if (!st.slam && u >= P.warn) {
              st.slam = true;
              for (n = 0; n < A.length; n++) {
                k = A[n];
                if (k.parked || k.rescue >= 0 || Math.hypot(relD(k.d, st.d), k.lat - st.lat) > H.r || k.y > 3 || hit(k, 'spin', -1) !== 'hit') continue;
                st.hits++;
                if (!k.air && k.grind < 0 && !k.pit) { k.air = true; k.vy = 5; k.y = Math.max(k.y, 0.05); k.lipT = 9; k.airT = 0; k.abyss = false; k.bmp = -1; }
              }
              S.events.push(['meteor', q, st.hits]);
            }
          }
        }
      }
      function on(k, d, along, lo, hi) { return !k.parked && k.rescue < 0 && Math.abs(relD(k.d, d)) < along && k.lat >= lo - K.radius && k.lat <= hi + K.radius; }
      function liftOff(k, vy) {
        k.air = true; k.vy = vy * Math.min(1, k.v / k.top + 0.3); k.y = Math.max(k.y, 0.3); k.lipT = 0; k.airT = 0; k.trick = false; k.trickOf = 'bump'; k.abyss = false; k.bmp = -1; k.liftT = 0.5;
        S.events.push(['air', idOf(k), 0]);
        if (!k.human || k.auto) k.ai.trickGo = S.rng() < K.ai.trick;
      }
      S.hazardsStep = hazardsStep;

      /* -------- your inputs, logged a step at a time: steer in 31 steps, the buttons, or "the rivals' driving" -- */
      function record(k) {
        var I = k.inp, c;
        if (k.auto || k.assist) c = 0x8000;
        else {
          var s = Math.round(cl(I.steer || 0, -1, 1) * 15); I.steer = s / 15;
          c = (s + 15) | (I.gas ? 32 : 0) | (I.brake ? 64 : 0) | (I.drift ? 128 : 0) | (I.analog ? 256 : 0) | (I.touch ? 512 : 0) | (I.item ? 1024 : 0) | (I.aim > 0 ? 2048 : I.aim < 0 ? 4096 : 0);
        }
        if (S.logN >= S.log.length) { var nl = new Uint16Array(S.log.length * 2); nl.set(S.log); S.log = nl; }
        S.log[S.logN++] = c;
      }
      function play(k, c) {
        k.auto = !!(c & 0x8000); k.assist = null;
        if (k.auto) return;
        var I = k.inp; I.steer = ((c & 31) - 15) / 15; I.gas = !!(c & 32); I.brake = !!(c & 64); I.drift = !!(c & 128); I.analog = !!(c & 256); I.touch = !!(c & 512); I.item = !!(c & 1024); I.aim = c & 2048 ? 1 : c & 4096 ? -1 : 0;
      }

      /* -------- the clock -- */
      S.step = function () {
        var dt = K.step, A = S.karts, i;
        if (S.phase === 'grid' && S.count > 0) {
          S.count -= dt;
          if (S.count <= 0) { S.count = 0; S.phase = 'race'; S.goAt = S.steps; S.events.push(['go']); for (i = 0; i < A.length; i++) launch(A[i]); }
        }
        for (i = 0; i < A.length; i++) { var k = A[i]; k.px = k.x; k.pz = k.z; k.py = k.y; k.pyaw = k.yaw; k.ph = k.h; k.pg = k.ground; k.pgd = k.gd; }
        for (i = 0; i < A.length; i++) {
          var q = A[i];
          if ((!q.human || q.auto || q.assist) && !(q.moon > 0)) aiStep(q, dt);
          // (a film's assist: the rivals' own steering on your kart, the gas and Space as the film holds them, and the
          // direction for a drift's hop until it has one)
          if (q.assist && !q.auto) {
            if (q.assist.gas !== 'auto') { q.inp.gas = !!q.assist.gas; q.inp.brake = false; }
            q.inp.drift = !!q.assist.drift;
            if (q.assist.drift && q.assist.dir && !q.dDir) q.inp.steer = q.assist.dir * 0.35;
          }
          if (i === S.human) record(q);
        }
        for (i = 0; i < A.length; i++) kartStep(A[i], dt);
        if (S.phase === 'race') { drafts(dt); contacts(); itemsStep(dt); hazardsStep(dt); }
        for (i = 0; i < 64; i++) if (S.pair[i] > 0) S.pair[i] -= dt;
        places();
        if (S.phase === 'race') S.time += dt;
        S.t += dt; S.steps++;
      };
      // a frame's worth of time: whole steps, at most six (a slow frame is played slower, never skipped through),
      // and how far between the last two the picture is
      S.advance = function (dt) {
        S.acc += dt; var m = 0;
        while (S.acc >= K.step && m < K.maxSteps) { S.step(); S.acc -= K.step; m++; }
        if (m === K.maxSteps && S.acc > K.step) S.acc = K.step * 0.999;
        return S.acc / K.step;
      };
      // a fingerprint of where everyone is: positions, speeds, headings, progress, GM and finishes, to 6 places
      S.hash = function () {
        var h = 2166136261;
        S.karts.forEach(function (q) { [q.x, q.z, q.v, q.h, q.prog, q.gm, q.fin ? q.finT : -1].forEach(function (v) { var st = v.toFixed(6); for (var c = 0; c < st.length; c++) { h ^= st.charCodeAt(c); h = Math.imul(h, 16777619); } }); });
        return (h >>> 0).toString(16);
      };
      // the same race again, from its seed and your logged inputs, step for step, in a sim of its own
      S.replay = function () {
        var S2 = kartSim(TR, opts), mi = 0;
        S2.reset(S.seed); S2.start(S.count0);
        S2.karts.forEach(function (q, n0) { q.parked = S.karts[n0].parked; });
        for (var s = 0; s < S.logN; s++) {
          if (S2.phase === 'grid' && S2.steps === S.goAt) S2.count = Math.min(S2.count, 1e-6);
          for (; mi < S.marks.length && S.marks[mi][0] === S2.steps; mi++) { var mk = S.marks[mi]; if (mk[1] === 'stop') S2.stop(); else S2.finishBy(S2.karts[mk[2]]); }
          play(S2.karts[S.human], S.log[s]);
          S2.step(); S2.events.length = 0;
        }
        return S2;
      };
      S.project = project; S.putOn = putOn; S.rescue = rescue; S.places = places; S.order = ORDER; S.gridSlot = gridSlot; S.endDrift = endDrift; S.boost = boost; S.layCoins = layCoins; S.relD = relD;
      S.reset(opts.seed);
      return S;
    }
    /* ------------------------------------------- a sheet of impostors -- */
    // ctx.kart.impostors({ cast, frames, cell, size, foot, cols, across, light }): animated models filmed off screen,
    // before the race, into one sheet of pictures, for cards that stand in for them by the hundred in one draw (Meme
    // Kart's crowd in its stands; 8 Oct: a world may not make cameras, so the film is the kit's, with its own lens and
    // its own render targets). Each of cast, { object (built facing +Z, its feet on y = 0), cycle (seconds), step(dt)
    // (moves it on dt seconds), settle() (optional: called once it stands in the studio, before the film rolls, to
    // bring it into its stance) }, is filmed alone, frames pictures through its cycle (12; 1 to 32), from the front
    // through a square-on lens of size [wide, high] metres (1.24 x 2.8), its feet foot metres over the cell's foot
    // (0), each picture cell [wide, high] pixels (96 x 216), filmed at twice that and halved, its colour carried out
    // past its edges (no dark rim when drawn smaller) and kept as its square root (decode with c * c * 2), in a
    // studio lit as stands at dusk (light: { sky, ground, hemi, key: [colour, intensity, [x, y, z]], rim: the same }
    // to light it otherwise). Picture f of look i is cell i * frames + f, cols cells across (2 * frames), the first
    // row at the bottom of the sheet (v = 0). Returns { texture, target, cols, rows, frames, looks, cell, ms }, or
    // null (nothing to film); each model is left where it was, out of the studio and shown, to use or let go.
    // a step of the boot named for the kart guard (lib/runtime/kart-guard.js, when the page carries it): how far a load
    // got that took a phone's tab down with it. ctx.kart.step(name) for a world's own (Meme Kart's: 'crowd')
    function kartStep(name) { try { if (window.KartGuard && typeof window.KartGuard.step === 'function') window.KartGuard.step(String(name)); } catch (e) {} }
    function kartImpostors(o) {
      o = o || {};
      kartStep('crowd film');
      var cast = (Array.isArray(o.cast) ? o.cast : []).filter(function (c) { return c && c.object && c.object.isObject3D && typeof c.step === 'function'; });
      if (!cast.length || !renderer) return null;
      var t0 = performance.now(), REN = renderer, n = cast.length, nm = function (v, d, lo, hi) { v = +v; return isFinite(v) ? clamp(v, lo, hi) : d; };
      var F = Math.round(nm(o.frames, 12, 1, 32)), cell = Array.isArray(o.cell) ? o.cell : [], PX = Math.round(nm(cell[0], 96, 8, 512)), PY = Math.round(nm(cell[1], 216, 8, 512));
      var size = Array.isArray(o.size) ? o.size : [], CW = nm(size[0], 1.24, 0.05, 100), CH = nm(size[1], 2.8, 0.05, 100), FOOT = nm(o.foot, 0, -100, 100);
      var COLS = Math.round(nm(o.cols, 2 * F, 1, 4096)), ROWS = Math.ceil(n * F / COLS), GX = Math.round(nm(o.across, 6, 1, 64)), GY = Math.ceil(n / GX), SS = 2;
      var max = REN.capabilities.maxTextureSize || 4096;
      if (COLS * PX > max || ROWS * PY > max || GX * PX * SS > max || GY * PY * SS > max) { warn('ctx.kart.impostors: the sheet would be ' + COLS * PX + ' x ' + ROWS * PY + ' pixels, over the ' + max + ' this screen allows; fewer frames, a smaller cell or more columns'); return null; }
      var L0 = o.light || {}, hex = function (c, d) { return isHex(c) ? c : d; }, lamp = function (a, dc, di, dp) { a = Array.isArray(a) ? a : []; var p = Array.isArray(a[2]) ? a[2] : dp; return [hex(a[0], dc), nm(a[1], di, 0, 20), [+p[0] || 0, +p[1] || 0, +p[2] || 0]]; };
      var KL = lamp(L0.key, '#FFC9A2', 1.9, [-0.55, 0.62, 1]), RL = lamp(L0.rim, '#9FB4FF', 0.7, [0.7, 0.5, -1]);
      // the studio: each of the cast alone in its cell of a float target at twice the size, then into the sheet, halved
      var studio = new THREE.Scene();
      studio.add(new THREE.HemisphereLight(hex(L0.sky, '#B6B0E6'), hex(L0.ground, '#3A4A3C'), nm(L0.hemi, 1.15, 0, 20)));
      var kl = new THREE.DirectionalLight(KL[0], KL[1]); kl.position.set(KL[2][0], KL[2][1], KL[2][2]); studio.add(kl);
      var rl = new THREE.DirectionalLight(RL[0], RL[1]); rl.position.set(RL[2][0], RL[2][1], RL[2][2]); studio.add(rl);
      var lens = new THREE.OrthographicCamera(0, GX * CW, GY * CH, 0, 0.1, 40); lens.position.set(0, 0, 20);
      // (the hair cut out sharp for the film, not coverage-blended into the alpha)
      var a2c = [], home = cast.map(function (c) { return [c.object.parent, c.object.position.clone(), c.object.visible]; });
      cast.forEach(function (c, i) {
        c.object.position.set((i % GX + 0.5) * CW, Math.floor(i / GX) * CH + FOOT, 0); studio.add(c.object);
        c.object.traverse(function (q) { if (q.isMesh) (Array.isArray(q.material) ? q.material : [q.material]).forEach(function (m) { if (m && m.alphaToCoverage) { a2c.push(m); m.alphaToCoverage = false; m.needsUpdate = true; } }); });
      });
      var raw = new THREE.WebGLRenderTarget(GX * PX * SS, GY * PY * SS, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
      var sheet = new THREE.WebGLRenderTarget(COLS * PX, ROWS * PY, { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, depthBuffer: false });
      var copyMat = new THREE.ShaderMaterial({
        uniforms: { uSrc: { value: raw.texture }, uPx: { value: new THREE.Vector2(1 / (GX * PX * SS), 1 / (GY * PY * SS)) } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: [
          'uniform sampler2D uSrc; uniform vec2 uPx; varying vec2 vUv;',
          'void main() {',
          // (the four texels under this one, averaged by the filter; colour over coverage)
          '  vec4 c = texture2D(uSrc, vUv); vec3 col = c.rgb / max(c.a, 1e-3);',
          '  if (c.a < 0.004) {',
          '    vec4 s = vec4(0.0);',
          '    for (int k = 0; k < 16; k++) { float a = float(k) * 0.7854, r = k < 8 ? 2.0 : 5.0; vec4 q = texture2D(uSrc, vUv + vec2(cos(a), sin(a)) * r * uPx); s += vec4(q.rgb, q.a); }',
          '    col = s.a > 0.0 ? s.rgb / s.a : vec3(0.0);',
          '  }',
          '  gl_FragColor = vec4(sqrt(clamp(col * 0.5, 0.0, 1.0)), c.a);',
          '}',
        ].join('\n'),
        depthTest: false, depthWrite: false,
      });
      var cg = new THREE.BufferGeometry(), cpos = new Float32Array(n * 12), cuv = new Float32Array(n * 8), cix = [];
      cast.forEach(function (c, i) {
        var gx = i % GX, gy = Math.floor(i / GX), u0 = gx / GX, u1 = (gx + 1) / GX, v0 = gy / GY, v1 = (gy + 1) / GY;
        cuv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8); cix.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
      });
      cg.setAttribute('position', new THREE.BufferAttribute(cpos, 3)); cg.setAttribute('uv', new THREE.BufferAttribute(cuv, 2)); cg.setIndex(cix);
      var copyScene = new THREE.Scene(), copyMesh = new THREE.Mesh(cg, copyMat), copyCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
      copyMesh.frustumCulled = false; copyScene.add(copyMesh);
      // (each brought into its stance where it stands, as the film is about to roll: hair and cloth that follow the
      // body settle there, not on the way)
      cast.forEach(function (c) { if (typeof c.settle === 'function') c.settle(); });
      var rt0 = REN.getRenderTarget(), cc0 = REN.getClearColor(new THREE.Color()), ca0 = REN.getClearAlpha(), ac0 = REN.autoClear;
      try {
        REN.autoClear = false; REN.setClearColor(0x000000, 0);
        REN.setRenderTarget(sheet); REN.clear(true, false, false);
        for (var fr = 0; fr < F; fr++) {
          cast.forEach(function (c) { c.step((+c.cycle || 1) / F); });
          // (each alone in its own cell, so nothing one holds up reaches into the next one's)
          REN.setRenderTarget(raw); raw.scissorTest = false; REN.clear(); raw.scissorTest = true;
          cast.forEach(function (c, i) {
            var gx = i % GX, gy = Math.floor(i / GX);
            cast.forEach(function (c2, j) { c2.object.visible = i === j; });
            raw.viewport.set(gx * PX * SS, gy * PY * SS, PX * SS, PY * SS); raw.scissor.copy(raw.viewport);
            lens.left = gx * CW; lens.right = (gx + 1) * CW; lens.bottom = gy * CH; lens.top = (gy + 1) * CH; lens.updateProjectionMatrix();
            REN.setRenderTarget(raw); REN.render(studio, lens);
          });
          raw.scissorTest = false; raw.viewport.set(0, 0, raw.width, raw.height); cast.forEach(function (c2) { c2.object.visible = true; });
          cast.forEach(function (c, i) {
            var q = i * F + fr, col = q % COLS, row = Math.floor(q / COLS), x0 = col / COLS, x1 = (col + 1) / COLS, y0 = row / ROWS, y1 = (row + 1) / ROWS;
            cpos.set([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0], i * 12);
          });
          cg.attributes.position.needsUpdate = true;
          REN.setRenderTarget(sheet); REN.render(copyScene, copyCam);
        }
      } finally {
        REN.setRenderTarget(rt0); REN.setClearColor(cc0, ca0); REN.autoClear = ac0;
        raw.dispose(); copyMat.dispose(); cg.dispose();
        a2c.forEach(function (m) { m.alphaToCoverage = true; m.needsUpdate = true; });
        // (each model back where it was: out of the studio, in its own parent if it had one, shown as it was)
        cast.forEach(function (c, i) { studio.remove(c.object); if (home[i][0]) home[i][0].add(c.object); c.object.position.copy(home[i][1]); c.object.visible = home[i][2]; });
      }
      return { texture: sheet.texture, target: sheet, cols: COLS, rows: ROWS, frames: F, looks: n, cell: [PX, PY], ms: Math.round(performance.now() - t0) };
    }
    /* --------------------------------------------------- a greybox kart -- */
    // ctx.kart.greybox({ paint, driver, helmet, name, stats, persona }): a kart of plain boxes, a seat, a driver who is a
    // capsule in a helmet, and four wheels (the fronts steer, all four spin; a pale bar across each shows it turning).
    // The stand-in until the world dresses its racers: built facing +Z on y = 0, in the shape player() and rival()
    // return. stats ({ top, accel, handling, mass, drift }, each about 1) is the racer's own handling, as the cast's.
    function kartGreybox(o) {
      o = o || {};
      var paint = isHex(o.paint) ? o.paint : '#E8463A', skin = isHex(o.driver) ? o.driver : '#E9C29A', lid = isHex(o.helmet) ? o.helmet : '#F2F2F2';
      function M(c, r, m) { return new THREE.MeshStandardMaterial({ color: c, roughness: r == null ? 0.6 : r, metalness: m || 0 }); }
      var g = new THREE.Group(), body = new THREE.Group(); g.add(body);
      var shell = M(paint, 0.42, 0.1), dark = M('#24262B', 0.8), tyre = M('#17181B', 0.92), rim = M('#C9CDD3', 0.35, 0.5);
      function box(w, h, l, m, x, y, z, parent) { var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m); b.position.set(x, y, z); (parent || body).add(b); return b; }
      box(1.25, 0.14, 2.2, dark, 0, 0.22, 0);          // the floor pan
      box(1.1, 0.3, 1.45, shell, 0, 0.44, 0.18);       // the body
      box(0.86, 0.22, 0.55, shell, 0, 0.38, 1.12);     // the nose
      box(1.5, 0.16, 0.2, dark, 0, 0.32, 1.33);        // the bumpers
      box(1.52, 0.2, 0.22, dark, 0, 0.38, -1.1);
      box(0.72, 0.6, 0.2, dark, 0, 0.84, -0.62);       // the seat
      box(0.72, 0.14, 0.62, dark, 0, 0.6, -0.36);
      var driver = new THREE.Group(); driver.position.set(0, 0.66, -0.34); body.add(driver);
      var torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.4, 4, 10), M(skin, 0.7)); torso.position.y = 0.42; driver.add(torso);
      var head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), M(lid, 0.3, 0.1)); head.position.y = 0.98; driver.add(head);
      box(0.36, 0.1, 0.12, M('#1C2028', 0.15, 0.4), 0, 0.99, 0.19, driver);
      var wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 6, 14), dark); wheel.position.set(0, 0.86, 0.26); wheel.rotation.x = -0.9; body.add(wheel);
      var wheels = [];
      [[0.74, 0.3, 0.78, 0.3, 0.26, 1], [-0.74, 0.3, 0.78, 0.3, 0.26, 1], [0.77, 0.33, -0.72, 0.33, 0.34, 0], [-0.77, 0.33, -0.72, 0.33, 0.34, 0]].forEach(function (w) {
        var pivot = new THREE.Group(); pivot.position.set(w[0], w[1], w[2]); g.add(pivot);
        var spin = new THREE.Group(); pivot.add(spin);
        var t = new THREE.Mesh(new THREE.CylinderGeometry(w[3], w[3], w[4], 16), tyre); t.rotation.z = Math.PI / 2; spin.add(t);
        spin.add(new THREE.Mesh(new THREE.BoxGeometry(w[4] + 0.02, w[3] * 1.5, 0.09), rim));
        wheels.push({ pivot: pivot, spin: spin, r: w[3], front: !!w[5] });
      });
      g.userData.kartRacer = { stats: o.stats && typeof o.stats === 'object' ? o.stats : null, persona: typeof o.persona === 'string' ? o.persona : null };
      return {
        object: g, name: typeof o.name === 'string' ? o.name : undefined, color: paint, stats: o.stats && typeof o.stats === 'object' ? o.stats : undefined,
        // s: { speed, steer, drift, tier, boost, air, hit, place, finished, roll }
        animate: function (t, dt, s) {
          for (var i = 0; i < wheels.length; i++) {
            var W = wheels[i];
            W.spin.rotation.x += (s.speed || 0) / W.r * dt;
            if (W.front) W.pivot.rotation.y = -(s.steer || 0) * 0.45;
          }
          // the body leans out of a turn on its springs, the driver into it
          body.rotation.z = (s.roll || 0) * 0.6;
          driver.rotation.z = (s.steer || 0) * 0.16 - (s.roll || 0) * 0.5;
          wheel.rotation.z = -(s.steer || 0) * 0.8;
        },
      };
    }

    /* ------------------------------------------------- the race, shown -- */
    function kartWorld() {
      var KD = KART, laps = Math.round(num(KD.laps, 3, 1, 5)), cls = KD.class === 'chill' || KD.class === 'degen' ? KD.class : 'normal';
      var KC = KD.course && typeof KD.course === 'object' ? KD.course : {};
      var shoulder = num(KC.shoulder, 4, 1.5, 12);
      // the track as the sim reads it: a sample about every metre, its level tangent and right
      var TN = Math.max(200, Math.ceil(L)), TR = { n: TN, ds: L / TN, L: L, hw: hw, wall: hw + shoulder, course: null,
        px: new Float64Array(TN), py: new Float64Array(TN), pz: new Float64Array(TN), tx: new Float64Array(TN), tz: new Float64Array(TN), rx: new Float64Array(TN), rz: new Float64Array(TN) };
      var F0 = Frame();
      for (var i0 = 0; i0 < TN; i0++) {
        frameAt(i0 * TR.ds, F0);
        TR.px[i0] = F0.pos.x; TR.py[i0] = F0.pos.y; TR.pz[i0] = F0.pos.z;
        var tl0 = Math.hypot(F0.tan.x, F0.tan.z) || 1;
        TR.tx[i0] = F0.tan.x / tl0; TR.tz[i0] = F0.tan.z / tl0; TR.rx[i0] = -TR.tz[i0]; TR.rz[i0] = TR.tx[i0];
      }
      // the course (kart.course): where along the lap (a fraction of it, 0 to 1, or metres) and across the road
      // (metres right of the centre line) each thing is. pads: [{ at, x }]; ramps: [{ at (the lip), x, width, size:
      // 'small' | 'big' }]; offroad: [{ from, to, side: 'left' | 'right' | 'inside' | 'outside' (or x: [a, b]), width,
      // kind: 'mud' | 'grass' | 'shoulder' }]; walls: { gaps: [{ from, to, side, water: true | false (a void) }] };
      // gm: 'auto' (eight lines of five a lap), a number of coins a lap, or false; verge: what the ground past the
      // road's edge is ('grass')
      TR.course = (function (c) {
        function at(v) { v = Number(v); return isFinite(v) ? wrapD(Math.abs(v) <= 1 ? v * L : v) : null; }
        function si(d) { return Math.round(wrapD(d) / TR.ds) % TN; }
        // (inside a bend: the side the track turns toward, there)
        function sideOf(s, d) {
          if (s === 'left') return -1; if (s === 'right') return 1;
          if (s === 'inside' || s === 'outside') { var a = si(d - 8), b = si(d + 8), m = si(d), r = (TR.tx[b] - TR.tx[a]) * TR.rx[m] + (TR.tz[b] - TR.tz[a]) * TR.rz[m]; return (r > 0 ? 1 : -1) * (s === 'inside' ? 1 : -1); }
          return 0;
        }
        var K0 = kartRules(cls), list = function (v, n) { return Array.isArray(v) ? v.filter(function (q) { return q && typeof q === 'object'; }).slice(0, n) : []; };
        var pads = list(c.pads, 8).map(function (p) { var d = at(p.at); return d == null ? null : { d0: wrapD(d - K0.pad.len / 2), len: K0.pad.len, w: K0.pad.w, x: num(p.x, 0, -hw + K0.pad.w / 2, hw - K0.pad.w / 2) }; }).filter(Boolean);
        var ramps = list(c.ramps, 4).map(function (p) {
          var d = at(p.at), big = p.size === 'big', len = big ? 7 : 5, w = num(p.width, 8, 3, hw * 2);
          return d == null ? null : { d0: wrapD(d - len), len: len, w: w, x: num(p.x, 0, -hw + w / 2, hw - w / 2), h: big ? 0.75 : 0.45, big: big };
        }).filter(Boolean);
        var off = list(c.offroad, 12).map(function (p) {
          var d0 = at(p.from), d1 = at(p.to);
          if (d0 == null || d1 == null) return null;
          var len = wrapD(d1 - d0), w = num(p.width, 4, 1, hw * 2 + shoulder), s = sideOf(p.side, d0 + len / 2), x0, x1;
          if (Array.isArray(p.x) && p.x.length === 2) { x0 = Math.min(+p.x[0], +p.x[1]); x1 = Math.max(+p.x[0], +p.x[1]); }
          else if (s > 0) { x0 = hw - w; x1 = hw + shoulder; } else if (s < 0) { x0 = -hw - shoulder; x1 = -hw + w; } else { x0 = -w / 2; x1 = w / 2; }
          var kind = K0.surf[p.kind] ? p.kind : 'mud';
          return isFinite(x0 + x1) ? { d0: d0, len: len, x0: x0, x1: x1, kind: kind, mul: K0.surf[kind] } : null;
        }).filter(Boolean);
        var gaps = list(c.walls && c.walls.gaps, 6).map(function (p) {
          var d0 = at(p.from), d1 = at(p.to);
          return d0 == null || d1 == null ? null : { d0: d0, len: wrapD(d1 - d0), side: sideOf(p.side, d0) || (p.side === 'both' ? 0 : 1), water: p.water !== false };
        }).filter(Boolean);
        var gm = c.gm === false || c.gm === 0 ? 0 : typeof c.gm === 'number' ? Math.round(num(c.gm, 40, 5, 80) / 5) : 8;
        // airdrops: rows of Airdrop crates, [{ at, x (the row's middle), n: 4 or 5 }]; 'auto' (or left out), three a
        // lap; false, none
        var drops = c.airdrops === false ? [] : Array.isArray(c.airdrops) ? list(c.airdrops, 12).map(function (p) { var d = at(p.at); return d == null ? null : { d: d, x: num(p.x, 0, -hw + 1, hw - 1), n: Math.round(num(p.n != null ? p.n : p.count, 5, 4, 5)) }; }).filter(Boolean) : 'auto';
        // the road's chaos (the owner, 7 Oct: "more chaotic fun, in terms of roads, breaks, jumps ..."):
        // breaks: [{ from, to (or at and len, 3 to 14 m), x: [a, b] across (or side: 'left' | 'right' and width; the
        // whole corridor, wall to wall, if neither), water: true (water down there, not a void), guard: true (one
        // across part of the road: a low kerb along its side on the road, its front left open) }]
        var wallX = hw + shoulder;
        var breaks = list(c.breaks, 8).map(function (p) {
          var d0 = at(p.from != null ? p.from : p.at);
          if (d0 == null) return null;
          var d1 = p.to != null ? at(p.to) : null, len = clamp(d1 != null ? wrapD(d1 - d0) : num(p.len, 8, 3, 14), 2, 20), x0 = -wallX - 1, x1 = wallX + 1;
          if (Array.isArray(p.x) && p.x.length === 2 && isFinite(+p.x[0] + +p.x[1])) { x0 = Math.max(-wallX - 1, Math.min(+p.x[0], +p.x[1])); x1 = Math.min(wallX + 1, Math.max(+p.x[0], +p.x[1])); }
          else if (p.side === 'left' || p.side === 'right') { var w = num(p.width, hw, 2, hw * 2); if (p.side === 'left') x1 = -hw + w; else x0 = hw - w; }
          return x1 - x0 > 1 ? { d0: d0, len: len, x0: x0, x1: x1, water: p.water === true, guard: p.guard === true && (x0 > -hw || x1 < hw) } : null;
        }).filter(Boolean);
        // rails: [{ points: [[at, x], [at, x], ...] } (or { from, to, x } for a straight one, x: [start, end] for a
        // slanted one), h: its top over the road (0.3 to 1.2 m, 0.5) }]: each point on along the lap from the last
        var rails = list(c.rails, 8).map(function (p) {
          var pts = [];
          if (Array.isArray(p.points)) p.points.slice(0, 32).forEach(function (q) { if (Array.isArray(q) && q.length >= 2) { var d = at(q[0]); if (d != null && isFinite(+q[1])) pts.push([d, +q[1]]); } });
          else { var a = at(p.from), b = at(p.to), xs = Array.isArray(p.x) ? p.x : [p.x, p.x]; if (a != null && b != null) pts.push([a, num(xs[0], 0, -99, 99)], [b, num(xs[1], 0, -99, 99)]); }
          if (pts.length < 2) return null;
          var d0 = pts[0][0], lim = wallX - 0.6, out = [[0, clamp(pts[0][1], -lim, lim)]], last = 0;
          for (var q = 1; q < pts.length; q++) { var u = wrapD(pts[q][0] - d0); if (u <= last + 0.5 || u > L / 2) continue; out.push([u, clamp(pts[q][1], -lim, lim)]); last = u; }
          return out.length >= 2 && last >= 4 ? { d0: d0, len: last, pts: out, h: num(p.h != null ? p.h : p.height, 0.5, 0.3, 1.2), next: -1 } : null;
        }).filter(Boolean);
        // (one rail's end within 3 m along and 1.5 m across of another's start: they link, and a grind carries on)
        rails.forEach(function (R0) { var e = R0.d0 + R0.len, ex = R0.pts[R0.pts.length - 1][1]; rails.forEach(function (R1, m) { var dd = wrapD(R1.d0 - e); if (dd > L / 2) dd -= L; if (R1 !== R0 && R0.next < 0 && Math.abs(dd) < K0.rail.link[0] && Math.abs(R1.pts[0][1] - ex) < K0.rail.link[1]) R0.next = m; }); });
        // bumps: [{ at (where a roller or a bump begins; a lip's edge), x, width (the road's, left out), size: 'roller'
        // | 'bump' | 'lip', n (a roller's humps, 1 to 6, 3), h (0.1 to 0.6 m) }]
        var bumps = list(c.bumps, 12).map(function (p) {
          var d = at(p.at);
          if (d == null) return null;
          var kind = p.size === 'roller' || p.size === 'lip' ? p.size : 'bump', S0 = K0.bump[kind], w = num(p.width, hw * 2, 2, hw * 2), n = kind === 'roller' ? Math.round(num(p.n, 3, 1, 6)) : 1;
          return { d0: kind === 'lip' ? wrapD(d - S0[0]) : d, len: S0[0], n: n, w: w, x: num(p.x, 0, -hw + w / 2, hw - w / 2), h: num(p.h, S0[1], 0.1, 0.6), pop: S0[2], kind: kind };
        }).filter(Boolean);
        // hazards: [{ kind: 'topple' (at; side: where it stands, 'left' or 'right'), 'crossing' (at; side: where it
        // starts) or 'meteor' (from, to: the stretch it strikes in), every (seconds; 9, 6 and 5), offset (seconds into
        // its clock at GO), model: false (the world draws its own, from ctx.kart.hazards()) }]
        var hazards = list(c.hazards, 8).map(function (p, i) {
          var kind = p.kind === 'topple' || p.kind === 'crossing' || p.kind === 'meteor' ? p.kind : null, d, zone = 0;
          if (!kind) { warn('kart.course.hazards: there is no hazard "' + String(p.kind).slice(0, 24) + '" (they are topple, crossing and meteor)'); return null; }
          if (kind === 'meteor' && p.from != null && p.to != null) { var a = at(p.from), b = at(p.to); if (a == null || b == null) return null; zone = Math.min(120, wrapD(b - a) / 2); d = wrapD(a + zone); }
          else { d = at(p.at); if (d == null) return null; if (kind === 'meteor') zone = 20; }
          var span = wallX + 1.5, roll = 1 + 2 * span / 8 + 0.6;
          var every = num(p.every, kind === 'topple' ? 9 : kind === 'crossing' ? 6 : 5, kind === 'topple' ? 6 : 4, 30);
          if (kind === 'crossing') every = Math.max(every, roll);
          return { kind: kind, d: d, zone: zone, side: p.side === 'left' ? -1 : 1, every: every, off: num(p.offset, i * 1.7, 0, 60), foot: hw + Math.max(0.6, Math.min(2, shoulder - 0.6)), len: 2 * hw + Math.max(0.6, Math.min(2, shoulder - 0.6)) + 1,
            speed: 8, r: kind === 'crossing' ? 1.4 : 3.2, model: p.model !== false };
        }).filter(Boolean);
        return { pads: pads, ramps: ramps, off: off, gaps: gaps, gm: gm, verge: K0.surf[c.verge] ? c.verge : 'grass', drops: drops, breaks: breaks, rails: rails, bumps: bumps, hazards: hazards };
      })(KC);
      var CO = TR.course;
      // the field: you and the seven rivals the world built; you start sixth. Each racer's own handling (stats:
      // top, accel, handling, mass, drift, each about 1) is the world's to give
      var ENT = [P0];
      for (var rk = 1; rk <= 7; rk++) ENT.push(makeRival(rk));
      ENT.forEach(function (e, n) { if (n) scene.add(e.object); e.object.visible = true; e.object.rotation.order = 'YXZ'; });
      var GRID = [5, 0, 1, 2, 3, 4, 6, 7];
      // the cast as the world built it (its player first): each racer's model, name, colour, handling and drive.
      // (The handling rides on the model, kartRacer: the runtime's entity keeps only what every world's racers have)
      var CAST = ENT.map(function (e, n) {
        var m = e.model || e.object.children[0], u = m && m.userData.kartRacer || {};
        return { n: n, model: m, name: e.name, color: e.color, stats: u.stats || e.stats, animate: e.animate, racer: u.id || null, H: u.H || null, persona: u.persona || null };
      });
      function statsOf(c) { var s = c.stats && typeof c.stats === 'object' ? c.stats : {}; return { top: num(s.top, 1, 0.95, 1.05), accel: num(s.accel, 1, 0.85, 1.2), handling: num(s.handling, 1, 0.9, 1.1), mass: num(s.mass, 1, 0.8, 1.4), drift: num(s.drift, 1, 0.9, 1.15) }; }
      var STATS = CAST.map(statsOf);
      // the items (kart.items): false, none; { weights: { 'Laser Eyes': 45, ... } }, a kind's weight 0 to 60 (30 is as
      // it comes; by its name or its id), with at least five kinds left in; the names are the race's own
      // (?kdiag=noitems: none, as items: false)
      var KI = KD.items === false || KDIAG.noitems ? false : KD.items && typeof KD.items === 'object' ? KD.items : {}, ITEMS_ON = KI !== false && CO.drops.length !== 0;
      function readWeights(w) {
        if (!KI || !w || typeof w !== 'object') return null;
        var ids = kartRules(cls).items.ids, out = ids.map(function () { return 1; }), seen = 0, alive = 0;
        Object.keys(w).forEach(function (key) {
          var i = ids.indexOf(key); if (i < 0) i = ids.indexOf(KITEM_ID[String(key).toLowerCase().replace(/[^a-z]/g, '')] || '');
          if (i < 0) { warn('kart.items.weights: there is no item "' + key + '" (the items are ' + ids.map(function (q) { return KITEM_NAME[q]; }).join(', ') + ')'); return; }
          out[i] = num(w[key], 30, 0, 60) / 30; seen++;
        });
        out.forEach(function (x) { if (x > 0) alive++; });
        if (alive < 5) { warn('kart.items.weights leaves ' + alive + ' kinds of item in; at least five must stay, so the weights are not used.'); return null; }
        return seen ? out : null;
      }
      var IWEIGHTS = readWeights(KI && KI.weights);
      // (a racer keen on items, as the cast says: Doge uses them sooner; 1.6 until the owner's "more chaotic fun")
      var EAGER = CAST.map(function (c) { return c.racer === 'doge' ? 2.2 : 1; });
      // each racer's road manner (7 Oct): the roster's by its id, or a world's own racer's persona ('ram', 'block',
      // 'bully', 'items', 'draft', 'punch', 'risky'); none, a clean racer
      var PERSONAS = { ram: 1, block: 1, bully: 1, items: 1, draft: 1, punch: 1, risky: 1 }, PERSONA_OF = { bull: 'ram', bear: 'block', whale: 'bully', doge: 'items', shiba: 'draft', bike: 'punch', mooncat: 'risky' };
      // (kart.rage: false, and every racer races clean: no rams, no blocks, nobody angry)
      function personaOf(c) { return KD.rage === false ? 'clean' : c.persona && PERSONAS[c.persona] ? c.persona : PERSONA_OF[c.racer] || ''; }
      var PERSONA = CAST.map(personaOf);
      var SIM = kartSim(TR, { laps: laps, cls: cls, seed: hashStr((meta.title || 'kart') + ':kart'), stats: STATS, human: 0, grid: GRID, items: ITEMS_ON, weights: IWEIGHTS, eager: EAGER, persona: PERSONA });
      var RU = SIM.rules;
      var RS = { fly: 0, flySeed: 0, auto: false, hold: null, solo: false, film: null, focus: 0, goT: 0, lapStart: 0, best: 0, lapBanner: 0, nextSeed: null, cut: 0, back: false,
        endT: 0, final: null, podT: 0, pod: null, helped: false, launchT: 0, launchKind: '', press: null, pick: 0, near: 2, lodAll: null, pumpT: 0, showItem: null, freeze: false, calm: 0 };
      var PI = Math.PI;

      /* -------- the racer you drive: picked on the start screen (left and right, a tap, the pad), remembered -- */
      // ORDER[n] is the cast member driving kart n: yours (kart 0) the one picked, the other seven the rest in the
      // cast's order (the demo races all eight). A pick moves the racers' models between the karts, their names,
      // handling and drive with them; the race is the same race. Remembered in this browser (when it lets a page
      // keep anything: a sandboxed frame may not), by the racer's id, so a racer picked in one kart world is yours in
      // the next that has it
      var ORDER = CAST.map(function (c, n) { return n; }), PICK_KEY = 'gamemog:kart:racer';
      CAST.forEach(function (c) { c.s0 = c.model ? c.model.scale.clone() : null; c.key = c.racer || c.name || ''; });
      try { var saved0 = window.localStorage.getItem(PICK_KEY), at0 = CAST.findIndex(function (c) { return c.key === saved0; }); if (at0 >= 0) RS.pick = at0; } catch (e) { /* (no storage here) */ }
      function assign(p) {
        p = ((Math.round(p) % CAST.length) + CAST.length) % CAST.length; RS.pick = p;
        ORDER = [p].concat(CAST.map(function (c, n) { return n; }).filter(function (n) { return n !== p; }));
        for (var n = 0; n < ENT.length; n++) {
          var c = CAST[ORDER[n]], e = ENT[n];
          if (c.model && c.model.parent !== e.object) e.object.add(c.model);
          e.model = c.model; e.name = c.name; e.color = c.color; e.animate = c.animate;
          STATS[n] = statsOf(c); EAGER[n] = c.racer === 'doge' ? 2.2 : 1; PERSONA[n] = personaOf(c);
        }
      }
      assign(RS.pick);
      // the racers the roster built: yours made near now, the rest's middle and near levels between frames; and what the
      // runtime does to every model (the world's environment light) done to each level as it is made
      CAST.forEach(function (c, n) {
        if (!c.H) return;
        c.H.onBuilt = function (b) { envify(b.group); if (LIVE) liveMaterials(b.group); if (PREP && racingNow()) { PREP.inRace++; PREP.made.push(b.id + ':' + b.level); } };
        for (var lv in c.H.levels) c.H.onBuilt(c.H.levels[lv]);
        c.H.fixShadows();
        if (n === RS.pick) c.H.show('near', true); else c.H.queue('near');
      });
      function wrapPi(a) { a = (a + PI) % (2 * PI); if (a < 0) a += 2 * PI; return a - PI; }
      function nth(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
      function clock(s) { s = Math.max(0, s); var m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1); }
      function nameOf(n) { return ENT[n].name || 'Kart ' + n; }

      /* -------- the drift's tiers: Green Candle (mint), Gold, MOG (magenta, its hue never still) -- */
      // (not the blue, orange and purple of another kart racer's sparks; bright enough, past 1, for the bloom)
      var TIER = [
        { name: 'Drift', css: '#F4F6FA', rgb: [2.0, 2.0, 1.9] },
        { name: 'Green Candle', css: '#5CFFC0', rgb: [0.94, 2.6, 1.95] },
        { name: 'Gold', css: '#FFC93C', rgb: [2.8, 2.2, 0.66] },
        { name: 'MOG', css: '#FF3EA5', rgb: [2.9, 0.7, 1.88] },
      ];
      // a boost's flame, by where it came from: a drift's in its tier's colour, the rest their own
      var FLAME = { launch: [2.9, 1.5, 2.4], pad: TIER[1].rgb, trick: TIER[2].rgb, draft: [2.4, 2.5, 2.6], pump: [2.1, 2.9, 0.6], wow: [2.9, 2.2, 0.66], diamond: [1.5, 2.5, 2.9] };
      var MOGC = new THREE.Color(), MOGRGB = [0, 0, 0];
      function mogHue(tt) { MOGC.setHSL((330 + 24 * Math.sin(tt * 7)) / 360, 1, 0.6); MOGRGB[0] = MOGC.r * 3; MOGRGB[1] = MOGC.g * 3; MOGRGB[2] = MOGC.b * 3; return MOGRGB; }
      function tierRgb(tier) { return tier === 3 ? mogHue(t) : TIER[tier].rgb; }

      /* -------- the HUD: lap, place, time, speed, GM, the drift's tier, the launch, 3-2-1-GO -- */
      var css = document.createElement('style');
      css.textContent = [
        '#gm .kpl{right:14px;text-align:right}#gm .kpl::before{left:auto;right:16px}#gm .kpl b sup{font-size:.5em;vertical-align:top;margin-left:1px}#gm .kpl b i{font-style:normal;font-size:.55em;opacity:.6;margin-left:4px}',
        '#gm .kspd{top:auto;bottom:calc(18px + env(safe-area-inset-bottom,0px));left:14px;min-width:0}#gm .kspd b{display:inline}#gm .kspd small{display:inline;margin-left:6px}',
        '#gm .board.kgm{top:calc(88px + env(safe-area-inset-top,0px));right:14px;min-width:0;padding:6px 14px 7px}#gm .kgm b{font-size:22px}#gm .kgm i{width:22px;height:22px;font-size:8px}',
        '#gm .kdrift{position:absolute;left:50%;bottom:calc(26px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);display:flex;gap:6px;align-items:center;padding:8px 14px;border-radius:999px;' + GLASS + ';opacity:0;transition:opacity .12s}',
        '#gm .kdrift i{width:28px;height:8px;border-radius:4px;background:rgba(255,255,255,.18)}',
        '#gm .kdrift em{font:600 11px Oxanium,system-ui;letter-spacing:.22em;text-transform:uppercase;font-style:normal;margin-left:6px;min-width:96px}',
        '@keyframes kmog{0%{filter:hue-rotate(-26deg) brightness(1.1)}100%{filter:hue-rotate(26deg) brightness(1.35)}}',
        '#gm .kdrift.mog i,#gm .kdrift.mog em{animation:kmog .32s ease-in-out infinite alternate}',
        '#gm .kslip{position:absolute;left:50%;bottom:calc(70px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);padding:4px 12px 5px;border-radius:999px;' + GLASS + ';font:600 10px Oxanium,system-ui;letter-spacing:.24em;opacity:0;white-space:nowrap}',
        '#gm .kslip u{display:block;height:2px;margin-top:3px;border-radius:2px;background:#F4F6FA;box-shadow:0 0 8px #fff;text-decoration:none;width:0}',
        // the Moon Launch: a needle across the count, gold where a press is perfect, mint where it is good
        '#gm .klaunch{position:absolute;left:50%;top:calc(40% + 96px);transform:translateX(-50%);width:min(340px,78vw);padding:9px 14px 10px;border-radius:16px;' + GLASS + ';display:none}',
        '#gm .klaunch small{display:block;font-size:10px;font-weight:600;letter-spacing:.26em;text-transform:uppercase;opacity:.75;margin-bottom:7px;text-align:center}',
        '#gm .klaunch .tr{position:relative;height:10px;border-radius:5px;background:rgba(255,255,255,.12);overflow:visible}',
        '#gm .klaunch .fl{position:absolute;left:0;top:0;bottom:0;width:53.3%;border-radius:5px 0 0 5px;background:rgba(255,90,90,.16)}',
        '#gm .klaunch .z1{position:absolute;top:0;bottom:0;left:70%;width:10%;background:#FFC93C;box-shadow:0 0 12px #FFC93C}',
        '#gm .klaunch .z2{position:absolute;top:0;bottom:0;left:80%;width:10%;background:rgba(92,255,192,.75)}',
        '#gm .klaunch .nd{position:absolute;top:-4px;bottom:-4px;width:3px;margin-left:-1px;border-radius:2px;background:#fff;box-shadow:0 0 8px #fff;left:0}',
        '#gm .klaunch .pk{position:absolute;top:-6px;bottom:-6px;width:5px;margin-left:-2px;border-radius:3px;display:none}',
        '#gm .klaunch.gold{border-color:#FFC93C;box-shadow:0 0 28px rgba(255,201,60,.55)}',
        // the item slot: under the lap, the roulette spinning in it, the item landing with a pop; Much Wow's charges
        // as a count; a rug or a laser dragged, a ring round it
        '#gm .kitem{position:absolute;left:14px;top:calc(88px + env(safe-area-inset-top,0px));width:68px;height:68px;border-radius:18px;' + GLASS + ';display:none;box-sizing:border-box}',
        '#gm .kitem canvas{position:absolute;left:4px;top:4px;width:60px;height:60px}',
        '#gm .kitem b{position:absolute;right:-6px;bottom:-6px;min-width:22px;height:22px;padding:0 5px;box-sizing:border-box;border-radius:11px;background:#FFC93C;color:#1B1330;font:700 13px/22px Oxanium,system-ui;text-align:center;display:none}',
        '#gm .kitem.roll{box-shadow:0 0 22px rgba(185,140,255,.55);border-color:rgba(185,140,255,.8)}#gm .kitem.drag{box-shadow:0 0 0 3px #FF3EA5,0 0 18px rgba(255,62,165,.6)}',
        '@keyframes kpop{0%{transform:scale(1)}35%{transform:scale(1.28)}100%{transform:scale(1)}}#gm .kitem.pop{animation:kpop .3s ease-out}',
        // the FUD Cloud's haze: round the screen's edges, under the HUD, never over the middle
        '#gm .kfud{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;display:none}',
        // touch: ITEM above DRIFT
        '#gm .tpad button.kitm{position:absolute;right:10px;bottom:110px}',
        '#gm.demo .kitem,#gm.demo .kfud{display:none!important}',
        '#gm .kskip{position:absolute;inset:0;pointer-events:auto;display:none}',
        // (the flyover: the touch kit away, and the way to skip it at the bottom)
        '#gm .kskip span{display:none}',
        '#gm .rules .kc{white-space:nowrap}',
        '#gm.kfly .kskip span{display:block;position:absolute;left:50%;bottom:calc(26px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);padding:6px 14px 7px;border-radius:999px;' + GLASS + ';font:600 11px Oxanium,system-ui;letter-spacing:.2em;text-transform:uppercase;white-space:nowrap;opacity:.85}',
        '#gm.kfly .tpad,#gm.kfly .stick,#gm.kfly .pause{display:none!important}',
        // (once you are home, the touch kit is put away: nothing to steer on the podium or the results)
        '#gm.kend .tpad,#gm.kend .stick,#gm.kend .pause{display:none!important}',
        // the results with the race's score (the owner, 8 Oct: 0 to 10,000, lib/runtime/kart-score.js): the card along
        // the bottom, the podium still in view over it; the score counting up, its four parts filling in under it, the
        // tier stamped at the end (the chips in the site's ink), a bar toward 10,000 with the top tiers' ticks
        '#gm .screen.kres .card{display:block;max-width:min(580px,94vw);padding:12px 18px 14px;text-align:left}',
        '#gm .screen.kres .card h1{font-size:26px}#gm .kres .khead{display:flex;align-items:baseline;justify-content:space-between;gap:4px 12px;flex-wrap:wrap}#gm .screen.kres .card .khead p{margin:0;font-size:13.5px;opacity:.8}',
        '#gm .ksrow{display:flex;align-items:center;gap:10px;margin-top:6px}',
        '#gm .ksn{font:700 44px/1 Oxanium,system-ui;font-variant-numeric:tabular-nums;color:#fff;min-width:4.4ch}',
        '#gm .ksof{font:600 11px Oxanium,system-ui;letter-spacing:.16em;text-transform:uppercase;opacity:.6;margin-right:auto}',
        '#gm .ktier{display:inline-block;padding:5px 11px 6px;border-radius:6px;font:800 13px/1 Oxanium,system-ui;letter-spacing:.14em;text-transform:uppercase;color:#0B0B0F;white-space:nowrap;opacity:0;transform:scale(1.7);transition:opacity .16s,transform .3s cubic-bezier(.2,1.7,.4,1)}',
        '#gm .ktier.on{opacity:1;transform:scale(1)}#gm .ktier.mog{animation:kmog 1.4s linear infinite}@keyframes kmog{to{filter:hue-rotate(360deg)}}',
        '#gm .ksbar{position:relative;height:6px;border-radius:3px;background:rgba(255,255,255,.16);margin:9px 0 10px;overflow:hidden}',
        '#gm .ksbar i{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:3px;background:#fff}#gm .ksbar u{position:absolute;top:0;bottom:0;width:1px;background:rgba(11,11,15,.55)}',
        '#gm .ksparts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}#gm .ksparts.g3{grid-template-columns:repeat(3,minmax(0,1fr))}',
        '#gm .ksparts div{padding:5px 8px 6px;border-radius:10px;background:rgba(255,255,255,.07);opacity:.3;transition:opacity .2s}#gm .ksparts div.on{opacity:1}',
        '#gm .ksparts small{display:block;font:600 9.5px Oxanium,system-ui;letter-spacing:.2em;text-transform:uppercase;opacity:.7}',
        '#gm .ksparts em{display:block;font:500 12.5px Oxanium,system-ui;font-style:normal;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '#gm .ksparts b{display:block;font:700 17px/1.2 Oxanium,system-ui;font-variant-numeric:tabular-nums}',
        '#gm .kshint{margin-top:8px;font-size:12.5px;line-height:1.35;opacity:.86}#gm .screen.kres .card .go{margin-top:10px}',
        '@media (max-width:440px){#gm .ksn{font-size:36px}#gm .ksparts b{font-size:14px}#gm .ksparts div{padding:4px 6px 5px}#gm .ksparts small{letter-spacing:.12em}#gm .screen.kres .card h1{font-size:22px}}',
        // (a phone held sideways: the card no taller than half the screen)
        '@media (max-height:440px){#gm .screen.kres .card{padding:8px 14px 10px}#gm .ksn{font-size:30px}#gm .ksbar{margin:6px 0 7px}#gm .kshint{margin-top:5px}#gm .screen.kres .card .go{margin-top:6px;padding:6px 14px}#gm .screen.kres .card h1{font-size:20px}}',
        // (the finish banner's tier, beside your time)
        '#gm .banner .kbt{display:inline-block;margin-left:8px;padding:2px 8px 3px;border-radius:5px;font:800 11px Oxanium,system-ui;letter-spacing:.14em;text-transform:uppercase;color:#0B0B0F;vertical-align:1px}',
        // (the podium's "... wins" above the arch's sign, on one line, on a phone held upright: there the camera stands
        // further back and the sign comes down to where the banner is)
        '@media (max-aspect-ratio:1/1){#gm .banner.kpod{top:14.5%}#gm .banner.kpod b{font-size:32px}}',
        '#gm.demo .kdrift,#gm.demo .kspd,#gm.demo .kpl,#gm.demo .kslip,#gm.demo .klaunch,#gm.demo .kgm{display:none!important}',
        // the start screen: a card along the bottom (the camera has your racer above it), the racers in a row
        '#gm .screen.kstart{align-items:flex-end;padding-bottom:calc(14px + env(safe-area-inset-bottom,0px));background:linear-gradient(0deg,rgba(6,8,14,.5),transparent 52%)}',
        '#gm .screen.kstart .card{max-width:min(940px,96vw);padding:14px 18px 16px;border-radius:22px}',
        '#gm .screen.kstart .card h1{font-size:30px;margin:0}#gm .screen.kstart .card p{margin:4px 0 0}',
        '#gm .screen.kstart .card .rules{margin-top:10px;font-size:12.5px;gap:4px}',
        '#gm .kchoose{margin:12px 0 8px;font:600 11px Oxanium,system-ui;letter-spacing:.24em;text-transform:uppercase;opacity:.85}#gm .kchoose b{color:' + T.accent + ';letter-spacing:.12em;margin-left:4px}',
        '#gm .kpick{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:6px}',
        '#gm .kpick button{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;padding:3px 2px 6px;border-radius:12px;background:rgba(255,255,255,.06);border:1.5px solid rgba(255,255,255,.12);transition:transform .12s,background .12s,border-color .12s}',
        '#gm .kpick button img{display:block;width:100%;max-width:96px;aspect-ratio:144/112;object-fit:contain}',
        '#gm .kpick button i{display:block;width:30px;height:30px;border-radius:50%;margin:9px 0 7px;box-shadow:inset 0 -4px 8px rgba(0,0,0,.25)}',
        '#gm .kpick button span{font:600 10px Oxanium,system-ui;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;opacity:.8}',
        '#gm .kpick button.on{background:rgba(255,255,255,.16);border-color:' + T.accent + ';box-shadow:0 0 16px rgba(255,255,255,.12);transform:translateY(-3px)}#gm .kpick button.on span{opacity:1}',
        '@media (hover:hover){#gm .kpick button:hover{background:rgba(255,255,255,.12)}}',
        // (on a phone the row is two of four, and of the rules only the drift's; on touch, never the keys)
        '@media (max-width:620px){#gm .kpick{grid-template-columns:repeat(4,minmax(0,1fr))}#gm .screen.kstart .card .rules div:first-child,#gm .screen.kstart .card .rules div:nth-child(3){display:none}#gm .screen.kstart .card h1{font-size:24px}}',
        '#gm.touch .screen.kstart .card .rules div:first-child{display:none}@media (pointer:coarse){#gm .screen.kstart .card .rules div:first-child{display:none}}',
        // touch: the thumbs own the bottom; the speed and GM sit under the top row, the drift's tier under them
        '@media (pointer:coarse){#gm .kspd{bottom:auto;top:calc(88px + env(safe-area-inset-top,0px))}#gm .board.kgm{right:70px}#gm .kdrift{bottom:auto;top:calc(146px + env(safe-area-inset-top,0px))}#gm .kslip{bottom:auto;top:calc(190px + env(safe-area-inset-top,0px))}}',
        '#gm.touch .kspd{bottom:auto;top:calc(88px + env(safe-area-inset-top,0px))}#gm.touch .board.kgm{right:70px}#gm.touch .kdrift{bottom:auto;top:calc(146px + env(safe-area-inset-top,0px))}#gm.touch .kslip{bottom:auto;top:calc(190px + env(safe-area-inset-top,0px))}',
        '@media (pointer:coarse){#gm .kitem{top:calc(146px + env(safe-area-inset-top,0px))}}#gm.touch .kitem{top:calc(146px + env(safe-area-inset-top,0px))}',
        '@media (max-width:440px){#gm .kitem,#gm.touch .kitem{top:calc(128px + env(safe-area-inset-top,0px));width:60px;height:60px;border-radius:16px}#gm .kitem canvas{width:52px;height:52px}}',
        '@media (max-width:440px){#gm .kspd,#gm.touch .kspd{top:calc(74px + env(safe-area-inset-top,0px))}#gm .board.kgm{top:calc(74px + env(safe-area-inset-top,0px))}#gm .kdrift,#gm.touch .kdrift{top:calc(128px + env(safe-area-inset-top,0px))}#gm .kslip,#gm.touch .kslip{top:calc(170px + env(safe-area-inset-top,0px))}#gm .kdrift em{min-width:84px;font-size:10px}}',
      ].join('\n');
      document.head.appendChild(css);
      hudLvl.innerHTML = '<small>Lap</small><b>1/' + laps + '</b>';
      var hudPlace = el('div', 'board kpl', '<small>Place</small><b>8</b>');
      var hudSpd = el('div', 'board kspd', '<b>0</b><small>km/h</small>');
      var hudDrift = el('div', 'kdrift', '<i></i><i></i><i></i><em>Drift</em>');
      var hudSlip = el('div', 'kslip', 'SLIPSTREAM<u></u>');
      var hudLaunch = el('div', 'klaunch', '<small>Moon Launch: gas on the gold</small><div class="tr"><i class="fl"></i><i class="z1"></i><i class="z2"></i><i class="pk"></i><i class="nd"></i></div>');
      var hudItem = el('div', 'kitem', '<canvas width="128" height="128"></canvas><b></b>');
      var fudCv = document.createElement('canvas'); fudCv.className = 'kfud'; root.insertBefore(fudCv, root.firstChild);
      var skipEl = el('div', 'kskip', '<span></span>');
      hudGm.classList.add('kgm');
      var driftBars = hudDrift.querySelectorAll('i'), driftWord = hudDrift.querySelector('em'), slipBar = hudSlip.querySelector('u'), launchNd = hudLaunch.querySelector('.nd'), launchPk = hudLaunch.querySelector('.pk');
      function showHud(on) {
        [hudLvl, hudTime, hudPlace, hudSpd].forEach(function (e) { e.style.display = on ? '' : 'none'; });
        hudGm.style.display = on && CO.gm ? '' : 'none'; hudRivals.style.display = 'none';
        if (!on) { hudDrift.style.opacity = '0'; hudSlip.style.opacity = '0'; hudLaunch.style.display = 'none'; }
      }
      showHud(false);
      var HUDC = { lap: '', place: '', time: '', spd: -1, tier: -2, n: 0, gm: -1, slip: -1, beat: 0 };
      function stepHud(dt) {
        var k = SIM.karts[0];
        var lap = Math.min(laps, k.lapsDone + 1) + '/' + laps; if (lap !== HUDC.lap) { HUDC.lap = lap; hudLvl.querySelector('b').textContent = lap; }
        var pl = k.place + '|' + ENT.length; if (pl !== HUDC.place) { HUDC.place = pl; hudPlace.querySelector('b').innerHTML = k.place + '<sup>' + nth(k.place).slice(String(k.place).length) + '</sup><i>/' + ENT.length + '</i>'; }
        var tm = clock(k.fin ? k.finT : SIM.time); if (tm !== HUDC.time) { HUDC.time = tm; hudTime.querySelector('b').textContent = tm; }
        if ((HUDC.n++ % 3) === 0) { var kmh = Math.round(Math.abs(k.v) * 3.6); if (kmh !== HUDC.spd) { HUDC.spd = kmh; hudSpd.querySelector('b').textContent = kmh; } }
        if (k.gm !== HUDC.gm) { HUDC.gm = k.gm; hudGm.querySelector('b').textContent = k.gm; hudGm.querySelector('small').textContent = 'GM +' + (Math.min(RU.gm.max, k.gm) * RU.gm.per * 100).toFixed(1) + '%'; }
        // (yours while you race it: not the autopilot's drifts once you are home, on the podium or the results)
        var tier = k.dDir && state === 'race' && !k.fin ? k.tier : -1;
        // (the same pill for a charge jump charging, its bars filling in cyan, and for a grind, in gold)
        var racingNow0 = state === 'race' && !k.fin, jump = tier < 0 && racingNow0 && k.cj >= 0 ? Math.min(3, Math.floor(k.cj / RU.cj.full * 3 + 0.001)) : -1, grinding = tier < 0 && jump < 0 && racingNow0 && k.grind >= 0;
        var hk = tier >= 0 ? tier : jump >= 0 ? 10 + jump : grinding ? 20 : -1;
        if (hk !== HUDC.tier) {
          HUDC.tier = hk;
          hudDrift.style.opacity = hk >= 0 && !demo ? '1' : '0';
          hudDrift.classList.toggle('mog', tier === 3);
          var on0 = tier >= 0 ? tier : jump >= 0 ? jump : grinding ? 3 : 0, cs = tier >= 0 ? TIER[tier].css : jump >= 0 ? (jump >= 3 ? '#FFF4C8' : '#7FE7FF') : '#FFC93C';
          for (var b = 0; b < 3; b++) { driftBars[b].style.background = on0 > b ? cs : 'rgba(255,255,255,.18)'; driftBars[b].style.boxShadow = on0 > b ? '0 0 10px ' + cs : 'none'; }
          if (hk >= 0) { driftWord.textContent = tier >= 0 ? TIER[tier].name : jump >= 0 ? (jump >= 3 ? 'Jump!' : 'Jump') : 'Grind'; driftWord.style.color = cs; }
        }
        var sl = demo || state !== 'race' ? 0 : Math.round(Math.min(1, k.draftC / RU.draft.fill) * 20) / 20;
        if (sl !== HUDC.slip) { HUDC.slip = sl; hudSlip.style.opacity = sl > 0.05 ? '1' : '0'; slipBar.style.width = sl * 100 + '%'; }
        // the count: 3, 2, 1 on the beats, then GO; and the launch's needle across it
        var counting = SIM.phase === 'grid' && SIM.count > 0 && state === 'countdown';
        if (counting) {
          countEl.textContent = String(Math.ceil(SIM.count));
          hudLaunch.style.display = demo ? 'none' : 'block';
          var tt = -SIM.count, pos = clamp((tt + 3) / 3, 0, 1) * 100;
          launchNd.style.left = pos + '%';
          var L0 = RU.launch;
          hudLaunch.classList.toggle('gold', tt >= L0.perfect[0] && tt <= L0.perfect[1]);
          if (k.gasOn && k.gasAt != null) { launchPk.style.display = 'block'; launchPk.style.left = clamp((k.gasAt + 3) / 3, 0, 1) * 100 + '%'; launchPk.style.background = k.gasAt < L0.flood ? '#FF6B6B' : k.gasAt >= L0.perfect[0] - 0.04 && k.gasAt <= L0.perfect[1] ? '#FFC93C' : '#5CFFC0'; }
          else launchPk.style.display = 'none';
        } else if (RS.goT > 0) { RS.goT -= dt; countEl.textContent = 'GO'; if (RS.goT <= 0) countEl.textContent = ''; hudLaunch.style.display = 'none'; }
        else { if (countEl.textContent) countEl.textContent = ''; hudLaunch.style.display = 'none'; }
        // wrong way, a checkpoint missed, and the lap's banner
        var bw = banner.querySelector('b'), bs = banner.querySelector('span');
        if (!demo && state === 'race' && k.wrong) { bw.textContent = 'Wrong way'; bs.style.display = 'none'; banner.style.opacity = '1'; }
        else if (!demo && state === 'race' && k.missed) { bw.textContent = 'Checkpoint missed'; bs.textContent = 'Go back through it: this lap does not count until you do'; bs.style.display = ''; banner.style.opacity = '1'; }
        else if (RS.lapBanner > 0) { RS.lapBanner -= dt; banner.style.opacity = String(clamp(RS.lapBanner, 0, 1)); }
        else banner.style.opacity = '0';
        if (feedT > 0) { feedT -= dt; feed.style.opacity = String(clamp(feedT * 2, 0, 1)); }
      }
      /* -------- the item slot: the roulette (faster, then slowing onto what you get), the item, Much Wow's count -- */
      var SLOT = { icon: null, j: 0, next: 0, g: hudItem.querySelector('canvas').getContext('2d'), badge: hudItem.querySelector('b'), cls: '' }, ICONS = {};
      function iconOf(id) { return ICONS[id] || (ICONS[id] = ilib().iconCanvas(id, 128)); }
      function slotPaint(id) {
        var g = SLOT.g; g.clearRect(0, 0, 128, 128);
        if (id) g.drawImage(iconOf(id), 0, 0);
        else { g.globalAlpha = 0.22; g.drawImage(iconOf('airdrop'), 0, 0); g.globalAlpha = 1; }
        SLOT.icon = id;
      }
      function slotPop() { hudItem.classList.remove('pop'); void hudItem.offsetWidth; hudItem.classList.add('pop'); }
      function stepSlot(dt) {
        var k = SIM.karts[0], show = ITEMS_ON && !demo && (state === 'race' || state === 'countdown' || state === 'finish' || state === 'paused');
        hudItem.style.display = show ? 'block' : 'none';
        if (!show) return;
        var want = k.item || '', ids = RU.items.ids;
        if (k.roll > 0) {
          SLOT.next -= dt;
          if (SLOT.next <= 0) { var u = k.rollT / RU.items.roll; SLOT.j++; SLOT.next = 0.05 + 0.14 * u * u; want = ids[(SLOT.j * 7 + 3) % ids.length]; if (want === SLOT.icon) want = ids[(SLOT.j * 7 + 4) % ids.length]; if (dt > 0) sound('tick'); }
          else want = SLOT.icon;
        }
        if (want !== SLOT.icon) slotPaint(want);
        var badge = k.item === 'wow' && k.roll <= 0 ? '\u00d7' + k.charges : '';
        if (SLOT.badge.textContent !== badge) { SLOT.badge.textContent = badge; SLOT.badge.style.display = badge ? 'block' : 'none'; }
        var cls = k.roll > 0 ? 'roll' : k.drag ? 'drag' : '';
        if (cls !== SLOT.cls) { hudItem.classList.remove('roll', 'drag'); if (cls) hudItem.classList.add(cls); SLOT.cls = cls; }
      }
      /* -------- the FUD Cloud on you (the owner's third review, 7 Oct: "sometimes a giant blue cloud appears with red
       * down arrows, not sure why but it blocks entire view, that shouldn't happen"). It was an ink splat over the
       * middle 35% of the screen for 3.5 s, and a cloud sent from behind you flew through the camera on its way. Now
       * nothing of it is ever over the road ahead, the next bend or your kart: a storm cloud hangs high over your kart
       * (in the picture, under the boards along the top, myCloud below) raining red arrows down at it while it lasts
       * (2.5 s, a boost clears it twice as fast, and 8% off your pace), and the screen's edges darken a little, the
       * middle never (paintFudEdge, kart-items.js), fading in over 0.15 s and out over the last half second -- */
      var FUD = { op: -1, top: 0.12, edge: null };
      // (the foot of the boards along the top over the middle of the screen, a share of its height: the cloud hangs
      // under them)
      function hudTop() {
        var W = window.innerWidth, H = window.innerHeight, top = 0;
        root.querySelectorAll('.board,.kitem,.pause').forEach(function (e0) {
          var r = e0.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || getComputedStyle(e0).display === 'none') return;
          if ((r.top + r.bottom) / 2 < H / 2 && r.right > W * 0.3 && r.left < W * 0.7) top = Math.max(top, r.bottom);
        });
        return top / Math.max(1, H);
      }
      function fudPaint() {
        // (half the screen's pixels: it is a soft haze)
        var W = Math.ceil(window.innerWidth / 2), H = Math.ceil(window.innerHeight / 2);
        fudCv.style.display = 'block'; fudCv.width = W; fudCv.height = H;
        var g = fudCv.getContext('2d'); g.clearRect(0, 0, W, H);
        FUD.edge = ilib().paintFudEdge(g, W, H, {});
        FUD.top = hudTop(); FUD.op = -1;
      }
      function stepFud() {
        var k = SIM.karts[0], T0 = RU.items.fud.T;
        if (!(k.fudT > 0) || demo || !FUD.edge) { if (fudCv.style.display !== 'none') { fudCv.style.display = 'none'; FUD.op = -1; } return; }
        var op = Math.round(Math.min(1, (T0 - k.fudT) / 0.15) * Math.min(1, k.fudT / 0.5) * 100) / 100;
        if (op !== FUD.op) { FUD.op = op; fudCv.style.opacity = String(op); }
      }
      function lapBanner(text, sub, secs) { banner.classList.remove('kpod'); var bw = banner.querySelector('b'), bs = banner.querySelector('span'); bw.textContent = text; bs.textContent = sub || ''; bs.style.display = sub ? '' : 'none'; RS.lapBanner = secs || 1.6; }

      /* -------- input: keys, the touch kit, a gamepad -- */
      var KIN = { left: false, right: false, up: false, down: false, drift: false, item: false, back: false }, DEV = { last: root.classList.contains('touch') ? 'touch' : 'key' };
      var KK = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };
      // the item (X, or J, K or Shift), and the look back (C)
      var KX = { KeyX: 'item', KeyJ: 'item', KeyK: 'item', ShiftLeft: 'item', ShiftRight: 'item', KeyC: 'back', KeyE: 'ahead' };
      window.addEventListener('keydown', function (e) {
        var k = KK[e.code];
        if (demo) { if (k || e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); ensureAudio(); if (!e.repeat) showStart(); } return; }
        DEV.last = 'key';
        // (the flyover: any key skips it)
        if (state === 'flyover') { e.preventDefault(); ensureAudio(); if (!e.repeat) endFly(); return; }
        // (on the start screen, left and right choose your racer)
        if (state === 'title' && screen && (k === 'left' || k === 'right')) { e.preventDefault(); ensureAudio(); if (!e.repeat) pick(RS.pick + (k === 'right' ? 1 : -1), true); return; }
        if (k) { KIN[k] = true; e.preventDefault(); ensureAudio(); return; }
        // (E uses the item thrown ahead: a rug lobbed)
        if (KX[e.code]) { KIN[KX[e.code]] = true; if (e.code === 'KeyE') KIN.item = true; e.preventDefault(); return; }
        if (state === 'podium' && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); if (!e.repeat && RS.podT > 1) showResults(); return; }
        if (e.code === 'Space') { e.preventDefault(); ensureAudio(); if (screen) { if (!e.repeat) screen._go(); return; } KIN.drift = true; return; }
        if (e.code === 'Enter' || e.code === 'KeyR') { e.preventDefault(); ensureAudio(); if (screen && !e.repeat) screen._go(); return; }
        if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); if (!e.repeat && (state === 'race' || state === 'paused')) togglePause(); }
      });
      window.addEventListener('keyup', function (e) { var k = KK[e.code] || KX[e.code]; if (k) KIN[k] = false; if (e.code === 'KeyE') KIN.item = false; if (e.code === 'Space') KIN.drift = false; });
      window.addEventListener('blur', function () { for (var q in KIN) KIN[q] = false; });
      // touch: the stick steers (analogue), BRAKE holds the brake, DRIFT (big, far right) is Space; the gas is on
      // by itself, as long as the thumb is off the brake; on the grid, DRIFT held is the gas, for the launch
      var TH = { brake: false, drift: false, item: false };
      tpad.innerHTML = ''; tpad.classList.remove('rows');
      TK.move = function () { if (TK.on) DEV.last = 'touch'; };
      tbtn('BRAKE', '', function (on) { TH.brake = on; DEV.last = 'touch'; });
      // (ITEM above DRIFT: held, a rug or a laser is dragged behind; the stick pushed up as it goes, thrown ahead,
      // pulled down, fired back)
      var tItem = tbtn('ITEM', 'kitm', function (on) { TH.item = on; DEV.last = 'touch'; });
      tbtn('DRIFT', 'big', function (on) { TH.drift = on; DEV.last = 'touch'; });
      if (!ITEMS_ON) tItem.style.display = 'none';
      skipEl.addEventListener('pointerdown', function (e) { e.preventDefault(); ensureAudio(); if (state === 'flyover') endFly(); else if (state === 'podium' && RS.podT > 1) showResults(); });
      // a gamepad, read every frame: the left stick (or the pad) steers, A or the right trigger is the gas, B or
      // the left trigger the brake, the right shoulder drifts, the left shoulder or X uses the item, Y looks back,
      // Start pauses
      var PAD = { on: false, steer: 0, gas: false, brake: false, drift: false, item: false, back: false, start: false, a: false, pd: 0, aimY: 0 };
      function pollPad() {
        var gp = null;
        try { var list = navigator.getGamepads ? navigator.getGamepads() : null; if (list) for (var i = 0; i < list.length; i++) if (list[i] && list[i].connected) { gp = list[i]; break; } } catch (e) { gp = null; }
        PAD.on = !!gp; if (!gp) return;
        var b = function (n) { var x = gp.buttons && gp.buttons[n]; return !!x && (x.pressed || x.value > 0.4); };
        var ax = +gp.axes[0] || 0; ax = Math.abs(ax) < 0.15 ? 0 : (ax > 0 ? 1 : -1) * Math.pow((Math.abs(ax) - 0.15) / 0.85, 1.5);
        if (b(14)) ax = -1; else if (b(15)) ax = 1;
        var start = b(9), a = b(0);
        // (on the start screen, the stick or the pad chooses your racer)
        var pd = state === 'title' && screen ? (ax > 0.5 ? 1 : ax < -0.5 ? -1 : 0) : 0;
        if (pd && pd !== PAD.pd) pick(RS.pick + pd, true);
        PAD.pd = pd;
        PAD.steer = ax; PAD.gas = a || b(7); PAD.brake = b(1) || b(6); PAD.drift = b(5); PAD.item = b(4) || b(2); PAD.back = b(3); PAD.aimY = +gp.axes[1] || 0;
        if (ax || PAD.gas || PAD.brake || PAD.drift) DEV.last = 'pad';
        if ((start && !PAD.start) || (a && !PAD.a)) {
          if (demo) showStart(); else if (screen) screen._go(); else if (state === 'flyover') endFly(); else if (state === 'podium' && RS.podT > 1) showResults(); else if (start && (state === 'race' || state === 'paused')) togglePause();
        }
        PAD.start = start; PAD.a = a;
      }
      function readInput() {
        var k = SIM.karts[0], I = k.inp;
        k.auto = demo || RS.auto || k.fin;
        k.assist = RS.hold && RS.hold.steer === 'auto' && !k.auto ? RS.hold : null;
        RS.back = (KIN.back || PAD.back || !!(RS.hold && RS.hold.back)) && state === 'race';
        if (k.assist) return;
        if (RS.hold) { k.auto = false; I.steer = +RS.hold.steer || 0; I.gas = !!RS.hold.gas; I.brake = !!RS.hold.brake; I.drift = !!RS.hold.drift; I.analog = RS.hold.analog !== false; I.item = !!RS.hold.item; I.touch = !!RS.hold.touch; I.aim = +RS.hold.aim || 0; return; }
        if (k.auto) return;
        var steer = (KIN.right ? 1 : 0) - (KIN.left ? 1 : 0), analog = false, touch = DEV.last === 'touch';
        if (PAD.on && PAD.steer) { steer = PAD.steer; analog = true; }
        if (TK.on) { steer = clamp(TK.jx * 1.15, -1, 1); analog = true; }
        I.steer = steer; I.analog = analog; I.touch = touch;
        I.gas = KIN.up || PAD.gas || (touch && (SIM.phase === 'grid' ? TH.drift : !TH.brake));
        I.brake = KIN.down || PAD.brake || TH.brake;
        I.drift = KIN.drift || PAD.drift || TH.drift;
        I.item = KIN.item || PAD.item || TH.item;
        // (where it goes: E, or the stick pushed up, ahead; down (the brake, the look back, the stick), behind)
        I.aim = KIN.ahead || PAD.aimY < -0.55 || (TK.on && TK.jy < -0.55) ? 1 : KIN.down || KIN.back || PAD.aimY > 0.55 || (TK.on && TK.jy > 0.55) ? -1 : 0;
      }

      /* -------- the effects: sparks, embers, flames, smoke, confetti; a boost's flame; skid marks -- */
      // particle pools, each one draw call, drawn additive so they glow (smoke and confetti are drawn as they are)
      var LOW = quality === 'low';
      var square = canvasTexture(16, 16, function (g, w, h) { g.fillStyle = '#fff'; g.fillRect(2, 4, w - 4, h - 8); });
      function pool(N, size, additive, grav, drag, map) {
        var pos = new Float32Array(N * 3), col = new Float32Array(N * 4), base = new Float32Array(N * 4), vel = new Float32Array(N * 3), life = new Float32Array(N), max = new Float32Array(N);
        for (var i = 0; i < N; i++) pos[i * 3 + 1] = -9999;
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
        var pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: size, map: map || puff, vertexColors: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
        pts.frustumCulled = false; pts.userData.gmKart = true; scene.add(pts);
        var P = { N: N, alive: 0, next: 0, pts: pts,
          emit: function (x, y, z, r, g, b, a, vx, vy, vz, lf) {
            var j = P.next++ % N, o = j * 3, c = j * 4;
            pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; vel[o] = vx; vel[o + 1] = vy; vel[o + 2] = vz;
            base[c] = r; base[c + 1] = g; base[c + 2] = b; base[c + 3] = a; life[j] = max[j] = lf;
          },
          // (near the lens a point fades: gone inside twice its size, whole from 5.5 times. 7 Oct, round 3, the owner's
          // "it blocks entire view": a landing's dust or a hazard's smoke, 1.5 m points left on the road, met by the
          // camera at 31 m/s, filled the screen for a sixth of a second)
          // (and anything nearer the lens than the kart it follows, between the two, is drawn at 40%: a bump's sparks, a
          // landing's dust, a hit's smoke round your own kart covered most of it on a phone for a quarter of a second)
          step: function (dt) {
            var alive = 0, dk = Math.exp(-drag * dt), cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, n0 = size * 2, n1 = size * 5.5;
            var fp = ENT[RS.focus] ? ENT[RS.focus].object.position : camera.position, kd = Math.sqrt((fp.x - cx) * (fp.x - cx) + (fp.y - cy) * (fp.y - cy) + (fp.z - cz) * (fp.z - cz));
            for (var j = 0; j < N; j++) {
              var o = j * 3, c = j * 4;
              if (life[j] <= 0) { if (pos[o + 1] > -9000) pos[o + 1] = -9999; continue; }
              alive++;
              life[j] -= dt; vel[o + 1] -= grav * dt; vel[o] *= dk; vel[o + 1] *= dk; vel[o + 2] *= dk;
              pos[o] += vel[o] * dt; pos[o + 1] += vel[o + 1] * dt; pos[o + 2] += vel[o + 2] * dt;
              var f = Math.max(0, life[j] / max[j]), ex = pos[o] - cx, ey = pos[o + 1] - cy, ez = pos[o + 2] - cz, nd = Math.sqrt(ex * ex + ey * ey + ez * ez);
              col[c] = base[c]; col[c + 1] = base[c + 1]; col[c + 2] = base[c + 2]; col[c + 3] = base[c + 3] * (additive ? f : Math.min(1, f * 2.5)) * (nd < n1 ? smooth(n0, n1, nd) : 1) * (nd < kd ? 0.4 : 1);
            }
            geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
            P.alive = alive;
          },
        };
        return P;
      }
      var PIN = pool(LOW ? 220 : 440, 0.2, true, 16, 0.6), EMB = pool(LOW ? 90 : 180, 0.34, true, -0.6, 1.6), FLM = pool(LOW ? 120 : 240, 0.42, true, -9, 2.4);
      var SMK = pool(LOW ? 60 : 120, 1.2, false, -1.2, 2.2), CNF = pool(LOW ? 200 : 380, 0.3, false, 2.2, 1.3, square);
      var FXS = { sparks: 0, skids: 0, flames: 0, embers: 0, mog: 0, smoke: 0, confetti: 0, steam: 0, lines: 0, flashes: 0 };
      // a boost's flame from the back of the kart, in the colour of what fired it. (The phone's draw calls, 7 Oct: a
      // see-through two-sided thing is drawn twice, its back and then its front, so each flame was two calls and its
      // core a third; added light comes out the same either way round, so the flame, its ring, the meteor's rings and
      // tail and the skid marks are each drawn once: forceSinglePass)
      var flameGeo = new THREE.ConeGeometry(0.2, 1, 12, 1, true); flameGeo.rotateX(-PI / 2); flameGeo.translate(0, 0, -0.5);
      var ringGeo = new THREE.RingGeometry(0.9, 1.75, 40, 1); ringGeo.rotateX(-PI / 2);
      var FL = ENT.map(function (e) {
        var outer = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.1, 0.3), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));
        var inner = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.4, 2.0), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
        inner.scale.set(0.5, 0.5, 0.6); outer.add(inner);
        outer.position.set(0, 0.42, -1.18); outer.visible = false; outer.userData.gmFx = outer.userData.gmKart = true; outer.castShadow = inner.castShadow = false;
        e.object.add(outer);
        // (and MOG's glow on the ground under the kart)
        var ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.9, 0.7, 1.9), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));
        ring.position.y = 0.06; ring.visible = false; ring.userData.gmKart = true; ring.renderOrder = 2;
        e.object.add(ring);
        outer.userData.ring = ring;
        return outer;
      });
      // skid marks: one mesh, a ring of 512 strips, the oldest overwritten first
      var SKN = 512, skPos = new Float32Array(SKN * 12), skIdx = [];
      for (var q0 = 0; q0 < SKN; q0++) { var b0 = q0 * 4; skIdx.push(b0, b0 + 2, b0 + 1, b0 + 1, b0 + 2, b0 + 3); skPos[q0 * 12 + 1] = skPos[q0 * 12 + 4] = skPos[q0 * 12 + 7] = skPos[q0 * 12 + 10] = -9999; }
      var skGeo = new THREE.BufferGeometry(); skGeo.setAttribute('position', new THREE.BufferAttribute(skPos, 3)); skGeo.setIndex(skIdx);
      var skids = new THREE.Mesh(skGeo, new THREE.MeshBasicMaterial({ color: '#141518', transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      skids.frustumCulled = false; skids.userData.gmKart = true; scene.add(skids);
      var skNext = 0, skDirty = false;
      function skid(a, x, z, y) {
        if (!a.on) { a.on = true; a.x = x; a.z = z; return; }
        var dx = x - a.x, dz = z - a.z, len = Math.hypot(dx, dz);
        if (len < 0.4) return;
        if (len > 3) { a.x = x; a.z = z; return; }
        var px = -dz / len * 0.11, pz = dx / len * 0.11, o = (skNext++ % SKN) * 12;
        skPos[o] = a.x + px; skPos[o + 1] = y; skPos[o + 2] = a.z + pz; skPos[o + 3] = a.x - px; skPos[o + 4] = y; skPos[o + 5] = a.z - pz;
        skPos[o + 6] = x + px; skPos[o + 7] = y; skPos[o + 8] = z + pz; skPos[o + 9] = x - px; skPos[o + 10] = y; skPos[o + 11] = z - pz;
        a.x = x; a.z = z; skDirty = true; FXS.skids = Math.min(SKN, FXS.skids + 1);
      }

      /* -------- the course, drawn: Green Candle pads, ramps, mud, the GM -- */
      // a strip of the track's surface from d0, len metres long, from x0 to x1 across, lifted y
      function strip(d0, len, x0, x1, y, mat) {
        var nS = Math.max(2, Math.ceil(len / 1.5)), pos = new Float32Array((nS + 1) * 6), uv = new Float32Array((nS + 1) * 4), ix = [], F = Frame();
        for (var s = 0; s <= nS; s++) {
          frameAt(d0 + len * s / nS, F);
          for (var sd = 0; sd < 2; sd++) {
            var x = sd ? x1 : x0, v = (s * 2 + sd) * 3;
            pos[v] = F.pos.x + F.right.x * x + F.up.x * y; pos[v + 1] = F.pos.y + F.right.y * x + F.up.y * y; pos[v + 2] = F.pos.z + F.right.z * x + F.up.z * y;
            uv[(s * 2 + sd) * 2] = sd; uv[(s * 2 + sd) * 2 + 1] = s / nS * (mat.userData.tile ? len / mat.userData.tile : 1);
          }
          // (wound to face up: 7 Oct, the other way round they faced the ground, and a pad or a patch of mud drawn
          // with a one-sided material was never seen from above)
          if (s < nS) { var q = s * 2; ix.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
        }
        var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(ix); g.computeVertexNormals();
        var m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.userData.gmKart = true; scene.add(m); return m;
      }
      // the pads: glowing strips of three green candles, wick ahead (no arrows)
      var padTex = canvasTexture(128, 180, function (g, w, h) {
        g.fillStyle = '#0C1A15'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#5CFFC0'; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8);
        for (var c = 0; c < 3; c++) {
          var x = 22 + c * 34, top = 40 + c * 14, bot = 150 - c * 6;
          g.fillStyle = '#5CFFC0'; g.fillRect(x, top, 18, bot - top);
          g.fillRect(x + 7, top - 26, 4, 26); g.fillRect(x + 7, bot, 4, 18);
        }
      });
      var padMat = new THREE.MeshBasicMaterial({ map: padTex, color: new THREE.Color(1.8, 1.8, 1.8), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      CO.pads.forEach(function (P) { strip(P.d0, P.len, P.x - P.w / 2, P.x + P.w / 2, 0.035, padMat); });
      // mud, grass and shoulder patches
      function noiseTex(c0, c1, n) {
        return canvasTexture(128, 128, function (g, w, h) { g.fillStyle = c0; g.fillRect(0, 0, w, h); var r = mulberry(hashStr(c0 + c1)); for (var i = 0; i < n; i++) { g.fillStyle = r() < 0.5 ? c1 : c0; g.globalAlpha = 0.35 + r() * 0.5; var s = 2 + r() * 7; g.fillRect(r() * w, r() * h, s, s * (0.5 + r())); } g.globalAlpha = 1; }, { repeat: true });
      }
      var PATCH = {};
      CO.off.forEach(function (P) {
        var m = PATCH[P.kind] || (PATCH[P.kind] = new THREE.MeshStandardMaterial({ map: P.kind === 'mud' ? noiseTex('#4A3424', '#2C1D12', 900) : P.kind === 'grass' ? noiseTex('#5E8A3A', '#3E6526', 900) : noiseTex('#B5A27A', '#8E7B58', 700), roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
        m.userData.tile = 6; if (m.map) { m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping; }
        strip(P.d0, P.len, Math.max(P.x0, -TR.wall), Math.min(P.x1, TR.wall), 0.03, m);
      });
      // the ramps: a wedge up to its lip, striped, the lip gold
      var rampTex = canvasTexture(64, 128, function (g, w, h) { for (var s = 0; s < 8; s++) { g.fillStyle = s % 2 ? '#E9E6DE' : '#3B3F48'; g.fillRect(0, s * h / 8, w, h / 8); } g.fillStyle = '#FFC93C'; g.fillRect(0, h - 10, w, 10); });
      var rampMat = new THREE.MeshStandardMaterial({ map: rampTex, roughness: 0.6 }), rampSide = new THREE.MeshStandardMaterial({ color: '#2A2D33', roughness: 0.8 });
      CO.ramps.forEach(function (R0) {
        var nS = 8, F = Frame(), top = [], side = [], ti = [], si = [], tuv = [];
        for (var s = 0; s <= nS; s++) {
          frameAt(R0.d0 + R0.len * s / nS, F); var hgt = R0.h * s / nS;
          for (var e = 0; e < 2; e++) {
            var x = R0.x + (e ? R0.w / 2 : -R0.w / 2);
            top.push(F.pos.x + F.right.x * x, F.pos.y + hgt, F.pos.z + F.right.z * x); tuv.push(e, s / nS);
            side.push(F.pos.x + F.right.x * x, F.pos.y + hgt, F.pos.z + F.right.z * x, F.pos.x + F.right.x * x, F.pos.y, F.pos.z + F.right.z * x);
          }
          if (s < nS) { var q = s * 2; ti.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); for (var e2 = 0; e2 < 2; e2++) { var a = (s * 2 + e2) * 2, b = ((s + 1) * 2 + e2) * 2; si.push(a, b, a + 1, a + 1, b, b + 1); } }
        }
        // the lip's face, square to the road
        var lb = side.length / 3; frameAt(R0.d0 + R0.len, F);
        [-1, 1].forEach(function (e3) { var x = R0.x + e3 * R0.w / 2; side.push(F.pos.x + F.right.x * x, F.pos.y + R0.h, F.pos.z + F.right.z * x, F.pos.x + F.right.x * x, F.pos.y, F.pos.z + F.right.z * x); });
        si.push(lb, lb + 2, lb + 1, lb + 1, lb + 2, lb + 3);
        var gt = new THREE.BufferGeometry(); gt.setAttribute('position', new THREE.Float32BufferAttribute(top, 3)); gt.setAttribute('uv', new THREE.Float32BufferAttribute(tuv, 2)); gt.setIndex(ti); gt.computeVertexNormals();
        var gs = new THREE.BufferGeometry(); gs.setAttribute('position', new THREE.Float32BufferAttribute(side, 3)); gs.setIndex(si); gs.computeVertexNormals();
        var mt = new THREE.Mesh(gt, rampMat), ms = new THREE.Mesh(gs, new THREE.MeshStandardMaterial({ color: '#2A2D33', roughness: 0.8, side: THREE.DoubleSide }));
        rampMat.side = THREE.DoubleSide;
        [mt, ms].forEach(function (m) { m.castShadow = m.receiveShadow = true; m.userData.gmKart = true; scene.add(m); });
      });
      void rampSide;

      /* -------- the road's chaos, drawn (7 Oct): the breaks, the rails, the bumps, the hazards. Made here, before
       * any race, each kind one or two draw calls (a hazard three at most) -- */
      // a break: the road gone, a drop to the stars (To The Moon is a long way up), its two edges striped gold and
      // black; deep water where the course says so; and the drop's own walls, so it reads as a hole from the chase
      var voidTex = canvasTexture(64, 256, function (g, w, h) {
        var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#020308'); gr.addColorStop(0.5, '#0A0D22'); gr.addColorStop(1, '#020308'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        var r = mulberry(77);
        for (var i = 0; i < 90; i++) { g.fillStyle = 'rgba(235,240,255,' + (0.25 + 0.75 * r()).toFixed(2) + ')'; var sz = r() < 0.15 ? 2 : 1; g.fillRect(r() * w, 20 + r() * (h - 40), sz, sz); }
        for (var e = 0; e < 2; e++) for (var s0 = 0; s0 < 8; s0++) { g.fillStyle = s0 % 2 ? '#141519' : '#FFC93C'; g.fillRect(s0 * 8, e ? h - 12 : 0, 8, 12); }
      });
      var voidMat = new THREE.MeshBasicMaterial({ map: voidTex, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      var pitMat = new THREE.MeshBasicMaterial({ color: '#04050A', side: THREE.DoubleSide });
      var wetMat = new THREE.MeshStandardMaterial({ color: '#1F5E86', roughness: 0.12, metalness: 0.2, emissive: '#0B2A3D', emissiveIntensity: 0.4, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      CO.breaks.forEach(function (B) {
        var x0 = Math.max(B.x0, -TR.wall - 0.5), x1 = Math.min(B.x1, TR.wall + 0.5);
        strip(B.d0, B.len, x0, x1, B.water ? -0.35 : 0.05, B.water ? wetMat : voidMat);
        // (the drop's walls: down from each edge of the road, and its sides where it is not the whole width)
        var pos = [], ix = [], F = Frame(), deep = B.water ? 0.4 : 6;
        function quad(a, b) { var o = pos.length / 3; pos.push(a.x, a.y, a.z, b.x, b.y, b.z, a.x, a.y - deep, a.z, b.x, b.y - deep, b.z); ix.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
        [B.d0, B.d0 + B.len].forEach(function (d) { quad(pointAt(d, x0, 0.04), pointAt(d, x1, 0.04)); });
        for (var s = 0; s < 8; s++) { var da = B.d0 + B.len * s / 8, db = B.d0 + B.len * (s + 1) / 8; if (B.x0 > -TR.wall) quad(pointAt(da, x0, 0.04), pointAt(db, x0, 0.04)); if (B.x1 < TR.wall) quad(pointAt(da, x1, 0.04), pointAt(db, x1, 0.04)); }
        void F;
        var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(ix);
        var m = new THREE.Mesh(g, pitMat); m.userData.gmKart = true; scene.add(m);
      });
      // a guarded break's kerb (guard: true): a low block striped gold and black along its side on the road, its
      // front open (one mesh for them all)
      (function () {
        var pos = [], uv = [], ix = [], hK = 0.26, wK = 0.24;
        CO.breaks.forEach(function (B) {
          if (!B.guard) return;
          [B.x0 > -TR.hw ? [B.x0, 1] : null, B.x1 < TR.hw ? [B.x1, -1] : null].forEach(function (E) {
            if (!E) return;
            // (from the road's edge of the break, wK into it: its top and its face to the road)
            var xa = E[0] - E[1] * 0.02, xb = E[0] + E[1] * wK, nS = Math.max(2, Math.ceil(B.len / 0.5)), P = new THREE.Vector3();
            for (var f = 0; f < 3; f++) {
              var base = pos.length / 3;
              for (var s0 = 0; s0 <= nS; s0++) {
                var dd = B.d0 + B.len * s0 / nS, u = B.len * s0 / nS / 1.2;
                var A = f === 0 ? [xa, 0] : f === 1 ? [xa, hK] : [xb, hK], C = f === 0 ? [xa, hK] : f === 1 ? [xb, hK] : [xb, -0.05];
                pointAt(dd, A[0], A[1], P); pos.push(P.x, P.y, P.z); pointAt(dd, C[0], C[1], P); pos.push(P.x, P.y, P.z); uv.push(0, u, 1, u);
                if (s0 < nS) { var o = base + s0 * 2; if (E[1] > 0 ? f !== 1 : f === 1) ix.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); else ix.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
              }
            }
          });
        });
        if (!ix.length) return;
        var tex = canvasTexture(16, 64, function (g, w, h) { for (var s1 = 0; s1 < 4; s1++) { g.fillStyle = s1 % 2 ? '#17181C' : '#FFC93C'; g.fillRect(0, s1 * h / 4, w, h / 4); } }, { repeat: true });
        var gK = new THREE.BufferGeometry(); gK.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gK.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); gK.setIndex(ix); gK.computeVertexNormals();
        var mK = new THREE.Mesh(gK, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide }));
        mK.receiveShadow = true; mK.userData.gmKart = true; mK.name = 'guards'; scene.add(mK);
      })();
      // the rails: a bright tube on posts (down into a break where one runs over it), each its own material, so the
      // one being ground glows
      var RAILS = CO.rails.map(function (R0) {
        var pts = [], step = Math.min(1, R0.len / 6);
        for (var u = 0; u < R0.len; u += step) pts.push(pointAt(R0.d0 + u, SIM.railLat(R0, R0.d0 + u), R0.h - 0.07));
        pts.push(pointAt(R0.d0 + R0.len, R0.pts[R0.pts.length - 1][1], R0.h - 0.07));
        var mat = new THREE.MeshStandardMaterial({ color: '#E4E8EE', metalness: 0.85, roughness: 0.22, emissive: new THREE.Color('#FFC93C'), emissiveIntensity: 0.12 });
        var tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(8, Math.ceil(R0.len * 2)), 0.075, 8, false), mat);
        tube.castShadow = true; tube.receiveShadow = true; tube.userData.gmKart = true; scene.add(tube);
        return { mat: mat, glow: 0 };
      });
      var POSTS = [];
      CO.rails.forEach(function (R0) { for (var u = 0.6; u < R0.len; u += 2.5) POSTS.push([R0.d0 + u, SIM.railLat(R0, R0.d0 + u), R0.h - 0.07, SIM.breakAt(R0.d0 + u, SIM.railLat(R0, R0.d0 + u)) ? -6 : 0]); });
      if (POSTS.length) {
        var postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 1, 0.09), new THREE.MeshStandardMaterial({ color: '#3B3F48', metalness: 0.6, roughness: 0.4 }), POSTS.length), PO = new THREE.Object3D();
        POSTS.forEach(function (p, i) { pointAt(p[0], p[1], (p[2] + p[3]) / 2, PO.position); PO.scale.set(1, p[2] - p[3], 1); PO.updateMatrix(); postMesh.setMatrixAt(i, PO.matrix); });
        postMesh.castShadow = true; postMesh.userData.gmKart = true; scene.add(postMesh);
      }
      // the bumps: humps (rollers in kerb red and white) and lips (gold and black) in the road, the shape the karts
      // ride; all of a kind one mesh
      var bumpTex = { roll: canvasTexture(64, 64, function (g, w, h) { for (var s = 0; s < 4; s++) { g.fillStyle = s % 2 ? '#F4F4F4' : '#D9342B'; g.fillRect(s * w / 4, 0, w / 4, h); } }, { repeat: true }),
        lip: canvasTexture(64, 64, function (g, w, h) { g.fillStyle = '#17181C'; g.fillRect(0, 0, w, h); g.fillStyle = '#FFC93C'; for (var s = -2; s < 4; s++) { g.beginPath(); g.moveTo(s * 32, h); g.lineTo(s * 32 + 16, h); g.lineTo(s * 32 + 16 + h, 0); g.lineTo(s * 32 + h, 0); g.fill(); } }, { repeat: true }) };
      ['roll', 'lip'].forEach(function (kind) {
        var pos = [], uv = [], ix = [], F = Frame();
        CO.bumps.forEach(function (B) {
          if ((B.kind === 'lip') !== (kind === 'lip')) return;
          var nS = Math.max(4, Math.ceil(B.len * B.n / 0.25)), base = pos.length / 3, xs = [B.x - B.w / 2, B.x + B.w / 2];
          for (var s = 0; s <= nS; s++) {
            var dd = B.d0 + B.len * B.n * s / nS, u = s / nS * B.n, f = u - Math.floor(u); if (s === nS) f = B.kind === 'lip' ? 1 : 0;
            var hh = B.kind === 'lip' ? B.h * f : B.h * Math.sin(Math.PI * f) * Math.sin(Math.PI * f);
            frameAt(dd, F);
            for (var e = 0; e < 4; e++) {
              // (the top's two edges, then the two sides down to the road)
              var x = xs[e % 2], y = e < 2 ? hh + 0.02 : 0.0;
              pos.push(F.pos.x + F.right.x * x, F.pos.y + y, F.pos.z + F.right.z * x); uv.push(x / 2, u);
            }
            if (s < nS) { var a = base + s * 4, b = a + 4; ix.push(a, b, a + 1, a + 1, b, b + 1, a, a + 2, b, b, a + 2, b + 2, a + 1, b + 1, a + 3, a + 3, b + 1, b + 3); }
          }
          // (a lip's face, square to the road at its edge)
          if (B.kind === 'lip') { var t0 = base + nS * 4; ix.push(t0, t0 + 1, t0 + 2, t0 + 2, t0 + 1, t0 + 3); }
        });
        if (!ix.length) return;
        var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ix); g.computeVertexNormals();
        var m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: bumpTex[kind], roughness: 0.6, side: THREE.DoubleSide }));
        m.castShadow = m.receiveShadow = true; m.userData.gmKart = true; scene.add(m);
      });
      // the hazards: a giant red candle that topples across the road (its shadow first), a giant GM coin that rolls
      // across it (its line lit first), a meteor that comes down in a ring of red; each with its warning, which a
      // world that draws its own (model: false) keeps
      var HZV = CO.hazards.map(function (H) {
        var V = { H: H, g: new THREE.Group(), warn: null, prev: 'idle', fx: 0 };
        V.g.userData.gmKart = true; scene.add(V.g);
        if (H.kind === 'topple') {
          var lo = Math.min(H.side * H.foot, H.side * H.foot - H.side * H.len), hi = Math.max(H.side * H.foot, H.side * H.foot - H.side * H.len);
          V.warn = strip(H.d - 0.9, 1.8, lo, hi, 0.07, new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
          if (H.model) {
            // (set on the road's frame, and turned inside it: a rotation set on the placed group itself would fight
            // the frame's own)
            var foot0 = new THREE.Group(); place(foot0, H.d, H.side * H.foot, 0); V.g.add(foot0);
            V.pivot = new THREE.Group(); foot0.add(V.pivot);
            var wax = new THREE.MeshStandardMaterial({ color: '#E43B3F', roughness: 0.45, emissive: '#7A0A10', emissiveIntensity: 0.45 }), wick = new THREE.MeshStandardMaterial({ color: '#2A2C33', roughness: 0.7 });
            var body = new THREE.Mesh(new THREE.BoxGeometry(1.3, H.len - 2.2, 1.3), wax); body.position.y = 1.1 + (H.len - 2.2) / 2;
            var w1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.2, 0.2), wick); w1.position.y = H.len - 1.1;
            var w0 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.1, 0.2), wick); w0.position.y = 0.55;
            [body, w1, w0].forEach(function (m) { m.castShadow = true; m.receiveShadow = true; m.userData.gmKart = true; V.pivot.add(m); });
          }
        } else if (H.kind === 'crossing') {
          V.warn = strip(H.d - 1.1, 2.2, -TR.wall, TR.wall, 0.06, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.6, 0.3), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
          if (H.model) {
            var R0 = coinMesh.geometry.parameters ? coinMesh.geometry.parameters.radiusTop : 0.62, sc = H.r / R0;
            V.coin = new THREE.Mesh(coinMesh.geometry, coinMesh.material); V.coin.scale.set(sc, sc, sc * 3.2); V.coin.castShadow = true; V.coin.userData.gmKart = true;
            V.roll = new THREE.Group(); V.roll.add(V.coin); V.g.add(V.roll); V.roll.visible = false;
          }
        } else {
          var ringM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.35, 0.3), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true });
          var outer = new THREE.RingGeometry(H.r - 0.5, H.r, 48); outer.rotateX(-PI / 2);
          var inner = new THREE.RingGeometry(0.8, 1, 48); inner.rotateX(-PI / 2);
          var disc = new THREE.CircleGeometry(H.r, 48); disc.rotateX(-PI / 2);
          V.discM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.15, 0.1), transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending });
          V.ring = new THREE.Group(); V.ring.add(new THREE.Mesh(outer, ringM)); V.inner = new THREE.Mesh(inner, ringM); V.ring.add(V.inner); V.ring.add(new THREE.Mesh(disc, V.discM)); V.ringM = ringM; V.ring.visible = false; V.g.add(V.ring);
          V.ring.children.forEach(function (m) { m.renderOrder = 3; m.userData.gmKart = true; });
          // (the strike's shockwave: a ring of fire out over 0.5 s)
          V.waveM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.9, 1.3, 0.35), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true });
          var wv = new THREE.RingGeometry(0.75, 1, 48); wv.rotateX(-PI / 2); V.wave = new THREE.Mesh(wv, V.waveM); V.wave.visible = false; V.wave.renderOrder = 3; V.wave.userData.gmKart = true; V.g.add(V.wave);
          if (H.model) {
            V.rock = new THREE.Group(); V.g.add(V.rock); V.rock.visible = false;
            var rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), new THREE.MeshStandardMaterial({ color: '#3A2C26', roughness: 0.9, flatShading: true, emissive: '#FF5A1F', emissiveIntensity: 0.55 }));
            var tail = new THREE.Mesh(new THREE.ConeGeometry(1.0, 7, 16, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.9, 1.2, 0.35), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));
            tail.position.y = 3.6; rock.castShadow = true; V.rock.add(rock, tail); V.rock.userData.gmKart = true; V.rockMesh = rock;
          }
        }
        return V;
      });
      // a crossing rolled in behind the kart the camera follows, under the lens (2.2 m and more behind the kart, its
      // middle within 3.5 m of the camera): put away, as a rival there steps aside from the picture (8 Oct, the round-3
      // film: after the whale had thrown your kart, the log rolled across under the lens behind it and filled the foot
      // of the frame for a fifth of a second). It is past your kart; a film's own camera and the podium's see it all
      var HZL = new THREE.Vector3();
      function crossLens(q) {
        var H = CO.hazards[q], st = SIM.haz[q];
        if (H.kind !== 'crossing' || SIM.phase !== 'race' || st.phase !== 'roll' || RS.pod || (RS.film && (RS.film.mode === 'free' || RS.film.mode === 'grid' || RS.film.mode === 'overhead'))) return false;
        var fk = SIM.karts[RS.film && RS.film.k != null ? clamp(Math.round(RS.film.k), 0, 7) : RS.focus];
        return SIM.relD(H.d, fk.d) < -2.2 && pointAt(H.d, st.lat, H.r, HZL).distanceTo(camera.position) < 3.5;
      }
      // (the world's own hazard models, if it draws them: where each is and what it is doing, and lens: true while a
      // crossing is under the camera behind your kart, to be put away)
      if (ctx.kart) ctx.kart.hazards = function () {
        return SIM.haz.map(function (st, q) { var H = CO.hazards[q]; return { kind: H.kind, phase: SIM.phase === 'race' ? st.phase : 'idle', u: +st.u.toFixed(4), d: H.kind === 'meteor' ? st.d : H.d, x: H.kind === 'topple' ? H.side * H.foot : st.lat, side: H.kind === 'crossing' ? st.side : H.side, lens: crossLens(q) }; });
      };
      // (a person who asks the page for less motion: no shake, and half the speed lines)
      var RM = false;
      try { RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { RM = false; }
      function shake(a) { CAM.shake = Math.max(CAM.shake, a); }
      // the impact flashes: four star bursts, one a moment (a bump, a bash, a slam, a strike), 0.22 s each
      var flashTex = canvasTexture(64, 64, function (g, w, h) {
        var r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,240,200,0.8)'); r.addColorStop(1, 'rgba(255,200,120,0)');
        g.fillStyle = r; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,0.9)';
        for (var s = 0; s < 8; s++) { var a = s * Math.PI / 4, l = s % 2 ? 0.3 : 0.5; g.beginPath(); g.moveTo(w / 2 + Math.cos(a + 0.12) * 4, h / 2 + Math.sin(a + 0.12) * 4); g.lineTo(w / 2 + Math.cos(a) * w * l, h / 2 + Math.sin(a) * h * l); g.lineTo(w / 2 + Math.cos(a - 0.12) * 4, h / 2 + Math.sin(a - 0.12) * 4); g.fill(); }
      });
      var FLASH = [0, 1, 2, 3].map(function () {
        var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: new THREE.Color(2.2, 2.0, 1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        sp.visible = false; sp.userData.gmKart = sp.userData.gmFx = true; sp.renderOrder = 4; scene.add(sp);
        return { sp: sp, t: -1, s: 1 };
      });
      function flash(p, s, rgb) {
        var F = FLASH[0];
        for (var q = 0; q < FLASH.length; q++) if (FLASH[q].t < 0 || FLASH[q].t > F.t) { F = FLASH[q]; if (F.t < 0) break; }
        F.t = 0; F.s = s; F.sp.position.copy(p); F.sp.material.color.setRGB(rgb ? rgb[0] : 2.2, rgb ? rgb[1] : 2.0, rgb ? rgb[2] : 1.6);
      }
      function stepFlashes(dt) {
        for (var q = 0; q < FLASH.length; q++) {
          var F = FLASH[q]; if (F.t < 0) continue;
          F.t += dt; var u = F.t / 0.22;
          if (u >= 1) { F.t = -1; F.sp.visible = false; continue; }
          // (the owner's review, 7 Oct: a bash on your own kart, right under the lens, flashed over a third of the
          // screen; a flash is held to a sixth of the screen's height or so however near it is, and fainter close up)
          var cd = F.sp.position.distanceTo(camera.position), sz = Math.min(F.s * (0.5 + 1.6 * u), 0.22 * cd);
          F.sp.visible = true; F.sp.scale.setScalar(sz); F.sp.material.opacity = (1 - u * u) * clamp((cd - 2) / 8, 0.35, 1);
        }
      }
      // a burst of sparks (and a flash) where two things met
      function sparkBurst(p, n, col, up) {
        var c = col || [2.8, 2.2, 0.7];
        for (var m = 0; m < n * (LOW ? 0.5 : 1); m++) PIN.emit(p.x, p.y, p.z, c[0], c[1], c[2], 1, (Math.random() - 0.5) * 9, (up || 2) + Math.random() * 4, (Math.random() - 0.5) * 9, 0.18 + Math.random() * 0.25);
      }
      // the speed lines: streaks of air streaming past the camera, more the faster you go and on a boost or a rail;
      // one draw call, the lines laid round the camera's own axis
      var SL_N = LOW ? 22 : 44, slPos = new Float32Array(SL_N * 6), slCol = new Float32Array(SL_N * 6), SLS = [];
      for (var sl = 0; sl < SL_N; sl++) SLS.push({ a: Math.random() * 2 * PI, r: 2.2 + Math.random() * 3.2, z: Math.random() * 28, s: 0.6 + Math.random() * 0.8 });
      var slGeo = new THREE.BufferGeometry(); slGeo.setAttribute('position', new THREE.BufferAttribute(slPos, 3)); slGeo.setAttribute('color', new THREE.BufferAttribute(slCol, 3));
      var slines = new THREE.LineSegments(slGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      slines.frustumCulled = false; slines.visible = false; slines.userData.gmKart = slines.userData.gmFx = true; slines.renderOrder = 5; scene.add(slines);
      var SLF = new THREE.Vector3(), SLR = new THREE.Vector3(), SLU = new THREE.Vector3(), SLP = new THREE.Vector3(), SLY = new THREE.Vector3(0, 1, 0);
      var FXC = { lines: 0, steam: 0, grind: 0, charge: 0, flashes: 0 };
      function stepLines(dt) {
        var k = SIM.karts[RS.focus], racing = (state === 'race' || state === 'countdown') && !RS.pod && !RS.back;
        // (7 Oct, round 3: from 0.7 of the top speed, not 0.88, and to 0.7 at it, not 0.55: the faster race streams)
        var str = racing ? clamp((Math.abs(k.v) / k.top - 0.7) / 0.3, 0, 1) * 0.7 + clamp((k.bm - 1) / 0.2, 0, 1) * 0.8 + (k.grind >= 0 ? 0.35 : 0) + (k.moon > 0 ? 0.8 : 0) : 0;
        if (RM) str *= 0.5;
        str = Math.min(1.2, str); FXC.lines = +str.toFixed(2);
        slines.visible = str > 0.03;
        if (!slines.visible || dt <= 0) return;
        camera.getWorldDirection(SLF); SLR.crossVectors(SLF, SLY).normalize(); SLU.crossVectors(SLR, SLF).normalize();
        var sp = Math.abs(k.v) + 18, n = RM ? SL_N / 2 : SL_N;
        for (var q = 0; q < SL_N; q++) {
          var L0 = SLS[q], o = q * 6;
          L0.z -= sp * dt * L0.s;
          if (L0.z < -1.5) { L0.z += 28 + Math.random() * 4; L0.a = Math.random() * 2 * PI; L0.r = 2.2 + Math.random() * 3.2; }
          var on = q < n ? str : 0, len = (0.8 + Math.abs(k.v) * 0.06) * L0.s;
          SLP.copy(camera.position).addScaledVector(SLF, L0.z).addScaledVector(SLR, Math.cos(L0.a) * L0.r).addScaledVector(SLU, Math.sin(L0.a) * L0.r * 0.62);
          slPos[o] = SLP.x; slPos[o + 1] = SLP.y; slPos[o + 2] = SLP.z;
          slPos[o + 3] = SLP.x + SLF.x * len; slPos[o + 4] = SLP.y + SLF.y * len; slPos[o + 5] = SLP.z + SLF.z * len;
          var fade = on * clamp(L0.z / 4, 0, 1) * 0.9;
          slCol[o] = slCol[o + 1] = slCol[o + 2] = fade; slCol[o + 3] = slCol[o + 4] = slCol[o + 5] = 0;
        }
        slGeo.attributes.position.needsUpdate = true; slGeo.attributes.color.needsUpdate = true;
      }
      // the hazards, each frame: the candle's shadow and fall, the coin's line and roll, the meteor's ring and fall, and
      // the strike; heard when you are near; and the rails, the one being ground lit
      var HZQ = new THREE.Vector3(), HZA = new THREE.Vector3(), HZB = new THREE.Vector3(), HZUP = new THREE.Vector3(0, 1, 0);
      function stepChaos(dt) {
        var me = SIM.karts[RS.focus], live = SIM.phase === 'race' && !RS.pod;
        for (var q = 0; q < HZV.length; q++) {
          var V = HZV[q], H = V.H, st = SIM.haz[q], ph = live ? st.phase : 'idle', u = st.u, far = Math.abs(SIM.relD(H.kind === 'meteor' ? st.d : H.d, me.d)), near = far < 90, mine = !demo && near;
          if (H.kind === 'topple') {
            var ang = ph === 'fall' ? u * u * PI / 2 : ph === 'lie' ? PI / 2 : ph === 'rise' ? (1 - smooth(0, 1, u)) * PI / 2 : ph === 'warn' ? (Math.sin(t * 24) * 0.035 + 0.05 * u) * u : 0;
            if (V.pivot) V.pivot.rotation.z = -H.side * ang;
            V.warn.visible = ph === 'warn' || ph === 'fall';
            V.warn.material.opacity = ph === 'warn' ? 0.12 + 0.38 * u + 0.1 * Math.sin(t * 18) : ph === 'fall' ? 0.55 : 0;
            V.warn.material.color.setRGB(ph === 'warn' ? 0.45 * u * (0.5 + 0.5 * Math.sin(t * 18)) : 0, 0, 0);
            if (V.prev !== ph && mine) {
              if (ph === 'warn') sound('creak');
              if (ph === 'lie') { sound('thud'); if (far < 30) shake(0.14); }
            }
            if (V.prev !== ph && ph === 'lie' && near) {
              for (var m = 0; m < (LOW ? 10 : 20); m++) { pointAt(H.d + (Math.random() - 0.5) * 2, H.side * H.foot - H.side * H.len * Math.random(), 0.3, HZQ); SMK.emit(HZQ.x, HZQ.y, HZQ.z, 0.75, 0.7, 0.66, 0.6, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.8); }
              flash(pointAt(H.d, 0, 0.8, HZQ), 4, [2.6, 0.9, 0.6]);
            }
          } else if (H.kind === 'crossing') {
            V.warn.visible = ph === 'warn' || ph === 'roll';
            // (its line, 2.2 m across, fades out as your kart leaves it, before the lens comes over it, and is back 10 m
            // behind: a kart slowed by a hit just past a lit line had it fill the foot of the frame, 8 Oct, the
            // re-filmed whale take)
            V.warn.material.opacity = (ph === 'warn' ? 0.35 + 0.3 * Math.sin(t * 22) : ph === 'roll' ? 0.16 : 0) * (live ? 1 - (1 - smooth(-1.6, -0.4, SIM.relD(H.d, me.d))) * smooth(-10, -7, SIM.relD(H.d, me.d)) : 1);
            if (V.roll) {
              V.roll.visible = ph === 'roll';
              if (V.roll.visible) { place(V.roll, H.d, st.lat, H.r + 0.02); V.coin.rotation.z = st.lat / H.r; if (near && dt > 0 && Math.random() < dt * 8) { pointAt(H.d, st.lat, 0.1, HZQ); SMK.emit(HZQ.x, HZQ.y, HZQ.z, 0.8, 0.74, 0.62, 0.3, (Math.random() - 0.5) * 2, 0.8, (Math.random() - 0.5) * 2, 0.6); } }
            }
            if (V.prev !== ph && mine) { if (ph === 'warn') sound('alarm'); if (ph === 'roll') sound('rumble'); }
          } else {
            V.ring.visible = ph === 'warn';
            if (V.ring.visible) {
              place(V.ring, st.d, st.lat, 0.1);
              V.ringM.opacity = 0.6 + 0.4 * Math.sin(t * (10 + 18 * u)); V.discM.opacity = 0.12 + 0.25 * u;
              V.inner.scale.setScalar(Math.max(0.15, (1 - u) * H.r));
            }
            V.wave.visible = ph === 'smoke' && u < 0.45;
            if (V.wave.visible) { place(V.wave, st.d, st.lat, 0.15); V.wave.scale.setScalar(1 + 9 * smooth(0, 0.45, u)); V.waveM.opacity = 1 - u / 0.45; }
            if (V.rock) {
              var fallU = ph === 'warn' ? clamp((u - 0.3) / 0.7, 0, 1) : 0;
              V.rock.visible = fallU > 0;
              if (V.rock.visible) {
                pointAt(st.d - 34, st.lat * 0.5, 46, HZA); pointAt(st.d, st.lat, 0.9, HZB);
                V.rock.position.copy(HZA).lerp(HZB, fallU * fallU);
                // (shrunk away near the lens: one coming down on your own kart passes in front of the camera for its last
                // few metres, 7 Oct, round 3)
                V.rock.scale.setScalar(Math.max(0.01, smooth(3, 10, V.rock.position.distanceTo(camera.position))));
                V.rock.quaternion.setFromUnitVectors(HZUP, HZQ.copy(HZA).sub(HZB).normalize());
                V.rockMesh.rotation.x += dt * 4; V.rockMesh.rotation.z += dt * 3;
                if (near && dt > 0 && Math.random() < dt * 40) FLM.emit(V.rock.position.x, V.rock.position.y, V.rock.position.z, 2.9, 1.1 + Math.random(), 0.3, 0.9, (Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2, 0.4);
              }
            }
            if (V.prev !== ph && mine && ph === 'warn') sound('whistle');
            if (V.prev === 'warn' && ph === 'smoke' && near) {
              pointAt(st.d, st.lat, 0.4, HZQ);
              for (var m2 = 0; m2 < (LOW ? 24 : 48); m2++) { var aa = Math.random() * 2 * PI, sp0 = 3 + Math.random() * 8; FLM.emit(HZQ.x, HZQ.y, HZQ.z, 2.9, 1.2 + Math.random() * 0.8, 0.3, 0.9, Math.cos(aa) * sp0, 2 + Math.random() * 5, Math.sin(aa) * sp0, 0.35 + Math.random() * 0.3); }
              // (its smoke a quarter as thick within 14 m of the lens, and lighter: a strike on your own kart, spun there,
              // sat you in it for half a second, 7 Oct, round 3)
              var close = HZQ.distanceTo(camera.position) < 14;
              for (m2 = 0; m2 < (LOW ? 8 : 16) * (close ? 0.25 : 1); m2++) SMK.emit(HZQ.x + (Math.random() - 0.5) * 3, HZQ.y, HZQ.z + (Math.random() - 0.5) * 3, 0.35, 0.32, 0.3, 0.55, (Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3, 1.1);
              flash(HZQ.setY(HZQ.y + 1), 7, [2.9, 1.3, 0.4]);
              if (!demo) { sound('boom'); if (far < 28) shake(0.22 * (1 - far / 28) + 0.05); }
            }
          }
          V.prev = ph;
        }
        for (var r0 = 0; r0 < RAILS.length; r0++) RAILS[r0].glow = Math.max(0, RAILS[r0].glow - dt * 2.5);
        for (var n = 0; n < SIM.karts.length; n++) { var g0 = SIM.karts[n].grind; if (g0 >= 0 && RAILS[g0]) RAILS[g0].glow = 1; }
        for (r0 = 0; r0 < RAILS.length; r0++) RAILS[r0].mat.emissiveIntensity = 0.12 + 1.5 * RAILS[r0].glow * (0.8 + 0.2 * Math.sin(t * 30));
        stepLines(dt); stepFlashes(dt);
      }
      // the GM: the runtime's own coins, laid in lines down the lap. At a kart's scale (the owner, 7 Oct: the lap's
      // 1.24 m disc dwarfed the karts), 0.45 of it: 0.56 m across, its middle half a metre up, about a kart's
      // shoulder, spinning 2.2 radians a second and bobbing 6 cm either way (art.md). Taken inside 1.3 m of a kart's
      // middle, across and along (the rules' gm.r): the coin's edge is 0.28 m out and a kart's side 0.65, so a coin
      // a third of a metre clear of your wheel is still yours
      var COIN = new THREE.Object3D(), COIN_S = 0.45, COIN_Y = 0.5;
      COIN.scale.setScalar(COIN_S);
      coinMesh.visible = !!CO.gm || ITEMS_ON; coinMesh.count = 0;
      function stepCoins(tt) {
        var m = 0, list = SIM.coins, q;
        if (!CO.gm && !SIM.spill.length) return;
        for (q = 0; q < list.length && m < MAX_COINS && CO.gm; q++) {
          var c = list[q]; if (!c.on) continue;
          var p = pointAt(c.d, c.x, COIN_Y + Math.sin(tt * 3 + q) * 0.06, COIN.position);
          void p; COIN.rotation.set(0, tt * 2.2 + q * 0.4, 0); COIN.updateMatrix(); coinMesh.setMatrixAt(m++, COIN.matrix);
        }
        // (and the GM knocked out of a kart, anyone's for 6 s, blinking out over the last: the same size, as high,
        // spinning faster)
        for (q = 0; q < SIM.spill.length && m < MAX_COINS; q++) {
          var sp = SIM.spill[q]; if (!sp.on || (sp.t < 1 && Math.floor(sp.t * 10) % 2)) continue;
          pointAt(sp.d, sp.x, COIN_Y + Math.sin(tt * 5 + q) * 0.06, COIN.position); COIN.rotation.set(0, tt * 6 + q, 0); COIN.updateMatrix(); coinMesh.setMatrixAt(m++, COIN.matrix);
        }
        coinMesh.count = m; coinMesh.instanceMatrix.needsUpdate = true;
      }

      /* -------- the Rescue Claw: a drone with a claw on a cable, built once, for whoever it is carrying -- */
      var CLAWS = [];
      function clawFor(n) {
        if (CLAWS[n]) return CLAWS[n];
        var g = new THREE.Group(), dark = new THREE.MeshStandardMaterial({ color: '#23262D', roughness: 0.45, metalness: 0.5 }), lit = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 2.4, 1.8) });
        var body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.32, 1.3), dark); body.position.y = 3.2; g.add(body);
        var eye = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.06), lit); eye.position.set(0, 3.2, 0.66); g.add(eye);
        var rotors = [];
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (c) {
          var arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.9), dark); arm.position.set(c[0] * 0.75, 3.28, c[1] * 0.75); arm.rotation.y = c[0] * c[1] * PI / 4; g.add(arm);
          var r = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 16), new THREE.MeshBasicMaterial({ color: '#9AA3B0', transparent: true, opacity: 0.45 })); r.position.set(c[0] * 1.05, 3.4, c[1] * 1.05); g.add(r); rotors.push(r);
        });
        var cable = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), dark); cable.position.y = 2.25; cable.scale.y = 1.9; g.add(cable);
        var head = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.3, 10), dark); head.position.y = 1.25; g.add(head);
        var fingers = [];
        for (var f = 0; f < 3; f++) { var fp = new THREE.Group(); fp.position.y = 1.12; fp.rotation.y = f * PI * 2 / 3; var fm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), lit); fm.position.set(0, -0.32, 0.32); fm.rotation.x = 0.5; fp.add(fm); g.add(fp); fingers.push(fp); }
        g.traverse(function (o) { o.userData.gmKart = true; o.castShadow = true; });
        g.visible = false; scene.add(g);
        CLAWS[n] = { g: g, rotors: rotors, fingers: fingers, up: 0 };
        return CLAWS[n];
      }

      /* -------- the racers' portraits for the start screen's row: each drawn once, small, in a studio of its own -- */
      // (three-quarters from the front, as the roster's sheets are; into a render target, read back into a picture)
      var PORTRAIT = [], PS = null;
      function portrait(i) {
        var c = CAST[i], m = c.model;
        if (PORTRAIT[i] || !m || !c.H) return false;
        if (!PS) {
          var sc = new THREE.Scene(), key = new THREE.DirectionalLight('#FFF6EC', 2.4), rim = new THREE.DirectionalLight('#DBE6FF', 1.6);
          key.position.set(-2.4, 4, 3.4); rim.position.set(2.8, 2.2, -2.6); sc.add(key, rim, new THREE.HemisphereLight('#D4DBE3', '#5D6166', 0.9));
          var rt = new THREE.WebGLRenderTarget(144, 112); rt.texture.colorSpace = THREE.SRGBColorSpace;
          var cam = new THREE.PerspectiveCamera(24, 144 / 112, 0.1, 40), yaw = 0.72, pitch = 0.26, dist = 5.1;
          cam.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, 0.66 + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist); cam.lookAt(0, 0.66, 0);
          var cv = document.createElement('canvas'); cv.width = 144; cv.height = 112;
          PS = { scene: sc, rt: rt, cam: cam, buf: new Uint8Array(144 * 112 * 4), cv: cv, g: cv.getContext('2d') };
        }
        var par = m.parent, pos = m.position.clone(), rot = m.rotation.clone(), scl = m.scale.clone();
        // (at its near level, whatever it is drawn at in the race just now: put back after)
        var was = c.H.cur, nearL = c.H.show('near', true);
        PS.scene.environment = scene.environment;
        PS.scene.add(m); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.copy(c.s0); m.updateMatrixWorld(true);
        var rt0 = renderer.getRenderTarget(), cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha(), sm = renderer.shadowMap.autoUpdate;
        try {
          renderer.shadowMap.autoUpdate = false;
          renderer.setRenderTarget(PS.rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(PS.scene, PS.cam);
          renderer.readRenderTargetPixels(PS.rt, 0, 0, 144, 112, PS.buf);
        } finally {
          renderer.setRenderTarget(rt0); renderer.setClearColor(cc, ca); renderer.shadowMap.autoUpdate = sm;
          par.add(m); m.position.copy(pos); m.rotation.copy(rot); m.scale.copy(scl);
          if (was && was !== nearL) { nearL.group.visible = false; was.group.visible = true; c.H.cur = was; }
        }
        // (the GL rows run bottom up)
        var img = PS.g.createImageData(144, 112), w4 = 144 * 4;
        for (var y = 0; y < 112; y++) img.data.set(PS.buf.subarray((111 - y) * w4, (112 - y) * w4), y * w4);
        PS.g.putImageData(img, 0, 0);
        PORTRAIT[i] = PS.cv.toDataURL('image/png');
        // (the row, if it is up, gets the picture in place of the colour swatch)
        var b = screen && screen.querySelector('.kpick button[data-k="' + i + '"]');
        if (b) { var sw = b.querySelector('i'); if (sw) { var im = document.createElement('img'); im.alt = ''; im.src = PORTRAIT[i]; b.replaceChild(im, sw); } }
        return true;
      }

      /* -------- the podium: three blocks past the line, the top three on them, and confetti -- */
      var POD = null, PD = 26;
      function podium() {
        if (POD) return POD;
        var g = new THREE.Group(), blocks = [];
        [[0, 1.4, '#FFC93C', '1'], [3.1, 1.0, '#DCE3EA', '2'], [-3.1, 0.7, '#E2A36B', '3']].forEach(function (b) {
          var num0 = canvasTexture(128, 128, function (cx, w, h) { cx.fillStyle = b[2]; cx.fillRect(0, 0, w, h); cx.fillStyle = '#1B1E24'; cx.font = '700 96px Oxanium, Arial, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(b[3], w / 2, h / 2 + 6); });
          var side = new THREE.MeshStandardMaterial({ color: b[2], roughness: 0.5, metalness: 0.15 });
          var m = new THREE.Mesh(new THREE.BoxGeometry(2.8, b[1], 2.6), [side, side, side, side, new THREE.MeshStandardMaterial({ map: num0, roughness: 0.5 }), side]);
          place(m, PD, b[0], b[1] / 2); m.castShadow = m.receiveShadow = true; m.userData.gmKart = true; g.add(m); blocks.push({ x: b[0], h: b[1] });
        });
        g.visible = false; scene.add(g);
        POD = { g: g, blocks: blocks };
        return POD;
      }

      /* -------- the items, shown: the crates, what each racer carries, what is on the road and in the air -- */
      // (the items' library, kart-items.js, the roster's toon program and its marching cubes: made the first time
      // anything needs them)
      var IL = null, ITOON = null, IKIT = null, IV3 = new THREE.Vector3(), IV4 = new THREE.Vector3();
      function ilib() { if (!IL) { IL = kartItemsLib(); var R0 = kartRosterLib(); ITOON = R0.mat.toon(THREE, {}); IKIT = R0.EndoKit; } return IL; }
      function ibuild(id, o) {
        if (PREP && racingNow()) { PREP.inRace++; PREP.made.push(id); }
        var g = ilib().build[id](THREE, Object.assign({ toon: ITOON, kit: IKIT }, o || {}));
        g.traverse(function (m) { m.userData.gmKart = true; if (m.isMesh) m.frustumCulled = false; });
        envify(g); g.visible = false;
        return g;
      }
      // the effects: one pool of sprites from one atlas (two draw calls), and a beam's ribbon for each laser
      var IFX = null;
      function ifx() { if (!IFX) { IFX = ilib().ItemFX(THREE, { max: LOW ? 420 : 900, seed: 7 }); IFX.group.traverse(function (m) { m.userData.gmKart = true; }); scene.add(IFX.group); } return IFX; }
      // (a burst on the kart the camera follows, inside 2.5 m of it, is drawn at two thirds of its size: from the lens
      // behind it a crate's pop, a Pump's or Much Wow's ring and a hit's flash filled the kart for a sixth of a second,
      // 7 Oct, round 3, "it blocks entire view"), and its rings laid on the road round it (8 Oct: a laser's ring stood
      // up over your kart hid a third of it)
      var VFQ = new THREE.Vector3();
      function vfx(spec, p, o) {
        if (!spec) return;
        if (p && !(o && o.scale) && !RS.pod) { var fo = ENT[RS.focus].object.position; if (VFQ.set(p[0], p[1], p[2]).distanceToSquared(fo) < 6.25) o = Object.assign({}, o || {}, { scale: 0.65, mine: true }); }
        ilib().play(ifx(), spec, p, o);
      }
      function camNear(p, r) { return p.distanceToSquared(camera.position) < r * r; }
      function arr(v) { return [v.x, v.y, v.z]; }
      // each kart's item moments (a pump's burn, a laser's flare, a wallet cracking, the rocket going out), the time since
      var IV = ENT.map(function () { return { pumpT: -1, flareT: -1, blockT: -1, blockAt: [0, 0.8, 1], moonOff: -1, mIn: 0, dIn: 0 }; });

      /* the crates: one instanced mesh for the crates' frames and glyphs, one for their holographic shells */
      var CRT = null, CRM = new THREE.Matrix4(), CRQ = new THREE.Quaternion(), CRE = new THREE.Euler(), CRP = new THREE.Vector3(), CRS = new THREE.Vector3(), CRF = Frame();
      function crates() {
        if (CRT || !SIM.crates.length) return CRT;
        var g = ibuild('airdrop', { size: 1.0 }), it = g.userData.item, solid = it.body.children[0], holo = it.body.children[1], n = SIM.crates.length;
        var a = new THREE.InstancedMesh(solid.geometry, solid.material, n), b = new THREE.InstancedMesh(holo.geometry, holo.material, n);
        a.castShadow = true; a.receiveShadow = true; b.renderOrder = holo.renderOrder;
        [a, b].forEach(function (m) { m.frustumCulled = false; m.userData.gmKart = true; scene.add(m); });
        CRT = { a: a, b: b, hover: it.hover, holo: holo.material, grow: new Float32Array(n).fill(1), was: SIM.crates.map(function () { return true; }) };
        return CRT;
      }
      function cratePos(c, ph, out) { frameAt(c.d, CRF); return out.copy(CRF.pos).addScaledVector(CRF.right, c.x).addScaledVector(CRF.up, (CRT ? CRT.hover : 1.05) + 0.12 * Math.sin(2.2 * ph)); }
      function stepCrates(tt, dt) {
        var C = crates(); if (!C) return;
        var list = SIM.crates, n = Math.min(list.length, C.grow.length);
        for (var q = 0; q < n; q++) {
          var c = list[q];
          if (c.on && !C.was[q]) C.grow[q] = 0;
          C.was[q] = c.on;
          if (c.on) C.grow[q] = Math.min(1, C.grow[q] + dt / 0.3);
          var sc = c.on ? smooth(0, 1, C.grow[q]) : 0, ph = tt + q * 0.4;
          cratePos(c, ph, CRP);
          CRE.set(0.1 * Math.sin(1.3 * ph), 1.4 * ph, 0.08 * Math.cos(1.1 * ph)); CRQ.setFromEuler(CRE); CRS.setScalar(Math.max(1e-4, sc));
          CRM.compose(CRP, CRQ, CRS); C.a.setMatrixAt(q, CRM); C.b.setMatrixAt(q, CRM);
          // (a glint now and then off the crates near the camera)
          if (sc > 0.9 && dt > 0 && Math.random() < dt * 1.5 && camNear(CRP, 45)) vfx(ilib().VFX.airdrop.idle, arr(CRP), { dt: dt });
        }
        C.a.instanceMatrix.needsUpdate = C.b.instanceMatrix.needsUpdate = true;
        C.holo.uniforms.uTime.value = tt;
      }

      /* what each racer carries, built for that racer the first time it is needed, on its own kart's mounts */
      var KITS = {};
      function boxOf(c) {
        if (!c.model) return null;
        var b = new THREE.Box3().setFromObject(c.model), o = c.model.parent ? c.model.parent.position : IV3.set(0, 0, 0);
        return { min: [b.min.x - o.x, b.min.y - o.y, b.min.z - o.z], max: [b.max.x - o.x, b.max.y - o.y, b.max.z - o.z] };
      }
      function kitOf(n) {
        var c = CAST[ORDER[n]], key = c.key || 'kart' + ORDER[n];
        return KITS[key] || (KITS[key] = { key: key, M: kartItemMount(c.racer, KITEM_MOUNT[c.racer] ? null : boxOf(c)), parts: {} });
      }
      function partOf(n, id) {
        var K0 = kitOf(n), P = K0.parts[id], M = K0.M;
        if (!P) {
          var g, ex = [[M.eyes[0], M.eyes[1], M.eyes[2]], [-M.eyes[0], M.eyes[1], M.eyes[2]]];
          if (id === 'pump') { g = ibuild('pump', { hoseTo: M.hose, scale: 1.3 * M.pump[3] }); g.position.set(M.pump[0], M.pump[1], M.pump[2]); }
          else if (id === 'diamond') g = ibuild('diamond', { raise: M.hands.slice(0, 3), handScale: M.hands[3], rearWheels: M.rear });
          // (the rocket, its nose raised by the mount's fifth number, radians, where the deck behind the seat is short)
          else if (id === 'moon') { g = ibuild('moon'); g.position.set(M.rocket[0], M.rocket[1], M.rocket[2]); g.rotation.x = -(M.rocket[4] || 0); }
          else if (id === 'wallet') g = ibuild('wallet', { center: M.dome.slice(0, 3), radii: M.dome.slice(3) });
          else if (id === 'wow') { g = ibuild('wow'); g.userData.item.radius = M.wow[0]; g.userData.item.height = M.wow[1]; }
          else if (id === 'flare') { var lz = ibuild('laser', { eyes: ex }); g = lz.userData.item.flare; g.userData.item = lz.userData.item; g.visible = false; g.frustumCulled = false; }
          else if (id === 'rugDrag') { g = ibuild('rug', { rolled: true }); g.position.set(0, 0.32, -1.75); }
          else if (id === 'orbDrag') { g = ibuild('laser'); g.position.set(0, 0.75, -1.75); g.scale.setScalar(0.75); }
          P = K0.parts[id] = { g: g, it: g.userData.item };
        }
        var e = ENT[n].object; if (P.g.parent !== e) e.add(P.g);
        return P;
      }
      function hidePart(n, id) { var P = kitOf(n).parts[id]; if (P) P.g.visible = false; }
      function hideItems(n) { var P = kitOf(n).parts; for (var id in P) { if (id === 'flare') P[id].it.flareAt(0); else P[id].g.visible = false; } IV[n].pumpT = IV[n].flareT = IV[n].blockT = IV[n].moonOff = -1; }
      function kartVel(k, f) { return [Math.sin(k.h) * k.v * f, 0, Math.cos(k.h) * k.v * f]; }
      // a kart's items this frame: what it carries shown, and their trails off it (near the camera)
      function poseItems(n, k, e, dt, near) {
        var V = IV[n], VX = ilib().VFX, vis = e.object.visible, P, tp, u;
        var world = false;
        // (a film of the mounts: one item on every kart, still)
        if (RS.showItem) {
          var SI = RS.showItem, PS0 = partOf(n, SI), MS = kitOf(n).M;
          PS0.g.visible = vis;
          if (SI === 'moon') { PS0.g.scale.setScalar(MS.rocket[3]); PS0.it.animate(t, { burn: 1 }); }
          else if (SI === 'pump') { PS0.g.scale.setScalar(1); PS0.it.animate(t, { plunge: 1, burn: 1, since: 0.4 }); }
          else if (SI === 'diamond') PS0.it.animate(t, { left: 6 });
          else if (SI === 'wow') PS0.it.animate(t, { charges: 3, camYaw: 0 });
          else if (SI === 'flare') PS0.it.flareAt(1);
          else PS0.it.animate(t, {});
          return;
        }
        function W(p) { if (!world) { e.object.updateMatrixWorld(true); world = true; } return arr(e.object.localToWorld(IV4.set(p[0], p[1], p[2]))); }
        // the Pump: up beside the seat in 0.12 s, slammed down, burning for 1.2 s, then away
        if (V.pumpT >= 0) {
          P = partOf(n, 'pump'); tp = V.pumpT; V.pumpT += dt;
          var pop = smooth(0, 0.12, tp), gone = smooth(1.45, 1.75, tp), burn = tp < 0.12 ? 0 : 1 - smooth(1.2, 1.45, tp);
          P.g.visible = vis && gone < 1; P.g.scale.setScalar(Math.max(0.01, (0.2 + 0.8 * pop) * (1 - gone)));
          P.it.animate(t, { plunge: tp < 0.12 ? pop : 1 - smooth(1.3, 1.55, tp), burn: burn, since: Math.max(0, tp - 0.12) });
          if (near && burn > 0.05 && dt > 0) { e.object.updateMatrixWorld(true); world = true; vfx(VX.pump.trail, arr(P.it.body.localToWorld(IV4.fromArray(P.it.nozzle))), { dt: dt, vel: kartVel(k, 0.3) }); }
          if (tp > 1.8) { V.pumpT = -1; P.g.visible = false; }
        }
        // Much Wow: the charges left, orbiting, each WOW turned to the camera
        if (k.item === 'wow' && k.roll <= 0 && k.charges > 0) {
          P = partOf(n, 'wow'); P.g.visible = vis;
          var cy = Math.atan2(camera.position.x - e.object.position.x, camera.position.z - e.object.position.z) - e.object.rotation.y;
          P.it.animate(t, { charges: k.charges, camYaw: cy });
          if (near && dt > 0 && Math.random() < dt * 20) vfx(VX.wow.trail, W(P.it.positions[(Math.random() * k.charges) | 0]), { dt: 0.05 });
        } else hidePart(n, 'wow');
        // Diamond Hands: raised for the 6 s, blinking out over the last
        if (k.diamond > 0) {
          P = partOf(n, 'diamond'); V.dIn = Math.min(1, V.dIn + dt / 0.2); P.g.visible = vis; P.g.scale.setScalar(0.4 + 0.6 * smooth(0, 1, V.dIn));
          P.it.animate(t, { left: k.diamond });
          if (near && dt > 0) { vfx(VX.diamond.loop.slice(0, 1), W([0, 0.75, 0]), { dt: dt }); if (Math.random() < dt * 8) vfx(VX.diamond.loop.slice(1), W(P.it.palms[Math.random() < 0.5 ? 0 : 1]), { dt: 0.06 }); }
        } else { V.dIn = 0; hidePart(n, 'diamond'); }
        // To The Moon: the rocket burning behind the seat for the 3.5 s, and a moment going out
        var M = kitOf(n).M;
        if (k.moon > 0 || V.moonOff >= 0) {
          P = partOf(n, 'moon');
          if (k.moon > 0) { if (V.moonOff < 0) V.mIn = 0; V.moonOff = 0; V.mIn += dt; } else V.moonOff += dt;
          var burnM = k.moon > 0 ? 1 : 1 - smooth(0, 0.3, V.moonOff), sm = M.rocket[3] * (0.3 + 0.7 * smooth(0, 0.12, V.mIn)) * (k.moon > 0 ? 1 : 1 - smooth(0.2, 0.45, V.moonOff));
          P.g.visible = vis && sm > 0.01; P.g.scale.setScalar(Math.max(0.01, sm)); P.it.animate(t, { burn: burnM });
          if (near && burnM > 0.05 && dt > 0) vfx(VX.moon.trail, W([M.rocket[0], M.rocket[1] - 0.75 * M.rocket[3] * Math.sin(M.rocket[4] || 0), M.rocket[2] - 0.75 * M.rocket[3] * Math.cos(M.rocket[4] || 0)]), { dt: dt, vel: kartVel(k, 0.3) });
          if (V.moonOff > 0.5) { V.moonOff = -1; P.g.visible = false; }
        }
        // the Cold Wallet: the dome while it lasts; a blocked hit cracks it (0.15 s) and it shatters (0.7 s)
        if (k.shield > 0 || V.blockT >= 0) {
          P = partOf(n, 'wallet'); P.g.visible = vis;
          if (V.blockT >= 0) { V.blockT += dt; P.it.animate(t, { hit: V.blockT, hitAt: V.blockAt }); if (V.blockT > 0.9) { V.blockT = -1; P.g.visible = false; P.it.animate(t, {}); } }
          else P.it.animate(t, {});
          if (near && dt > 0 && V.blockT < 0 && Math.random() < dt * 10) vfx(VX.wallet.loop, W([0, 0.8, 0]), { dt: 0.1 });
        } else hidePart(n, 'wallet');
        // Laser Eyes: the eyes flare (0.12 s) as it fires, and fade
        if (V.flareT >= 0) {
          P = partOf(n, 'flare'); tp = V.flareT; V.flareT += dt;
          P.it.flareAt(vis ? (tp < 0.12 ? smooth(0, 0.12, tp) : Math.max(0, 1 - (tp - 0.12) / 0.35)) : 0);
          if (tp > 0.5) { V.flareT = -1; P.it.flareAt(0); }
        }
        // a rug or a laser dragged behind
        var dr = k.drag ? (k.item === 'rug' ? 'rugDrag' : k.item === 'laser' ? 'orbDrag' : '') : '';
        if (dr) { P = partOf(n, dr); P.g.visible = vis; P.it.animate(dr === 'rugDrag' ? 0 : t); if (dr === 'rugDrag') P.it.body.rotation.x = 0; }
        if (dr !== 'rugDrag') hidePart(n, 'rugDrag');
        if (dr !== 'orbDrag') hidePart(n, 'orbDrag');
      }

      /* on the road and in the air: the rugs (laid, lobbed, yanked), the lasers and their beams, the Whale, FUD on its
       * way and over the karts it reached, a GM Bag going pop */
      var RUGS = {}, RPOOL = [], ROLLS = [], ISEEN = 0, IF0 = Frame();
      function takeRug() { var r = RPOOL.pop(); if (!r) { r = ibuild('rug'); scene.add(r); } return r; }
      function takeRoll() { var r = ROLLS.pop(); if (!r) { r = ibuild('rug', { rolled: true }); scene.add(r); } return r; }
      function placeOn(o, d, x, y) { place(o, d, x, y); }
      function stepRugs(dt) {
        ISEEN++;
        var VX = ilib().VFX, id;
        for (var j = 0; j < SIM.traps.length; j++) {
          var tr = SIM.traps[j], R0 = RUGS[tr.id] || (RUGS[tr.id] = { flat: null, roll: null, yank: -1, d: tr.d, x: tr.x });
          R0.seen = ISEEN; R0.d = tr.d; R0.x = tr.x;
          if (tr.fly > 0) {
            if (!R0.roll) R0.roll = takeRoll();
            placeOn(R0.roll, tr.d, tr.x, tr.y + 0.15); R0.roll.visible = true; R0.roll.userData.item.animate(t);
            if (dt > 0 && camNear(R0.roll.position, 60)) vfx(VX.rug.trail, arr(R0.roll.position), { dt: dt });
          } else {
            if (R0.roll) { R0.roll.visible = false; ROLLS.push(R0.roll); R0.roll = null; }
            if (!R0.flat) { R0.flat = takeRug(); R0.flat.userData.item.animate(0, { yank: 0 }); }
            placeOn(R0.flat, tr.d, tr.x, 0.035); R0.flat.visible = true;
            if (dt > 0 && Math.random() < dt * 3 && camNear(R0.flat.position, 45)) vfx(VX.rug.armed, arr(R0.flat.position), { dt: 1 });
          }
        }
        for (id in RUGS) {
          var R1 = RUGS[id];
          if (R1.seen === ISEEN) continue;
          if (R1.roll) { R1.roll.visible = false; ROLLS.push(R1.roll); R1.roll = null; }
          // (yanked out from under whoever drove onto it; gone in a puff otherwise)
          if (R1.flat && R1.yank >= 0 && R1.yank < 0.6) { R1.yank += dt; R1.flat.userData.item.animate(t, { yank: Math.min(1, R1.yank / 0.55) }); continue; }
          if (R1.flat) { if (R1.yank < 0 && camNear(R1.flat.position, 80)) vfx(VX.rug.anticipation, arr(R1.flat.position)); R1.flat.visible = false; R1.flat.userData.item.animate(0, { yank: 0 }); RPOOL.push(R1.flat); }
          delete RUGS[id];
        }
      }
      var SHOTS = {}, OPOOL = [];
      function takeOrb(fresh) {
        var o = fresh ? null : OPOOL.pop(); if (o) return o;
        var g = ibuild('laser'), rb = ilib().Ribbon(THREE, 26, { width: 0.2, tint: ilib().PAL.attack });
        rb.mesh.userData.gmKart = true; rb.mesh.frustumCulled = false; scene.add(g); scene.add(rb.mesh);
        return { g: g, rb: rb };
      }
      function stepShots(dt) {
        ISEEN++;
        var VX = ilib().VFX, id;
        for (var j = 0; j < SIM.shots.length; j++) {
          var sh = SIM.shots[j], O = SHOTS[sh.id] || (SHOTS[sh.id] = Object.assign(takeOrb(), { fade: -1 }));
          O.seen = ISEEN; O.g.visible = true; O.g.position.set(sh.x, sh.ground + sh.y, sh.z); O.g.userData.item.animate(t);
          // (thinned near the lens: one fired from behind you passes the camera on its way to you, and its beam, laid
          // back from it along its path, ran out of the lens across your kart for a third of a second, 7 Oct, round 3)
          var lc = O.g.position.distanceTo(camera.position);
          O.g.scale.setScalar(Math.max(0.01, smooth(1.5, 5, lc)));
          O.rb.push(arr(O.g.position)); O.a0 = O.rb.mat.uniforms.uAlpha.value = 0.15 + 0.85 * smooth(4, 14, lc); O.rb.mesh.visible = true; O.rb.update(camera);
          if (dt > 0 && camNear(O.g.position, 70)) vfx(VX.laser.trail, arr(O.g.position), { dt: dt });
        }
        for (id in SHOTS) {
          var O1 = SHOTS[id];
          if (O1.seen === ISEEN) continue;
          O1.g.visible = false;
          if (O1.fade < 0) O1.fade = 0;
          O1.fade += dt; O1.rb.push(O1.rb.pts[0] || [0, -99, 0]); O1.rb.update(camera); O1.rb.mat.uniforms.uAlpha.value = (O1.a0 != null ? O1.a0 : 1) * Math.max(0, 1 - O1.fade / 0.3);
          if (O1.fade > 0.3) { O1.rb.mesh.visible = false; O1.rb.clear(); delete SHOTS[id]; OPOOL.push({ g: O1.g, rb: O1.rb }); }
        }
      }
      // the item effects drawn again once the camera has moved this frame: thinned near the lens from where it is now,
      // not where it was a frame before (half a metre at 31 m/s, the beam and the sparks of a laser fired from behind
      // you thinned too late on a phone; 8 Oct)
      function lateFx() {
        for (var id in SHOTS) {
          var O = SHOTS[id];
          if (O.seen === ISEEN) { var lc = O.g.position.distanceTo(camera.position); O.g.scale.setScalar(Math.max(0.01, smooth(1.5, 5, lc))); O.a0 = O.rb.mat.uniforms.uAlpha.value = 0.15 + 0.85 * smooth(4, 14, lc); }
          if (O.rb.mesh.visible) O.rb.update(camera);
        }
        if (IFX) IFX.draw(camera);
      }
      var WH = null;
      function whale() {
        if (WH) return WH;
        var g = ibuild('whale'), it = g.userData.item, box = new THREE.Group();
        g.visible = true; box.add(g, it.shadow, it.splash); box.visible = false; box.userData.gmKart = true;
        [it.shadow, it.splash].forEach(function (m) { m.userData.gmKart = true; m.frustumCulled = false; });
        // its own copy of the toon (the same program, see-through always, so the fade never recompiles it): faded
        // when a camera is inside it, so a slam on your own kart keeps the road on the screen
        var mat = ITOON.clone(); mat.onBeforeCompile = ITOON.onBeforeCompile; mat.customProgramCacheKey = ITOON.customProgramCacheKey; mat.userData = ITOON.userData;
        mat.transparent = true; it.mesh.material = mat;
        scene.add(box);
        WH = { box: box, it: it, mat: mat, slam: false, x: 0, z: 0, g: 0 };
        return WH;
      }
      function stepWhale(dt) {
        var W0 = SIM.whale;
        if (!W0) { if (WH) WH.box.visible = false; return; }
        var H = whale();
        // (turned to the road, so it falls from ahead of its kart, down the track toward it, never through a camera
        // behind it; it lands a metre and a half ahead of where it aimed)
        frameAt(W0.d, IF0);
        H.box.visible = W0.t < 3.3; H.box.position.set(W0.x, W0.g + 0.05, W0.z); H.box.rotation.set(0, Math.atan2(IF0.tan.x, IF0.tan.z) + PI, 0); H.x = W0.x; H.z = W0.z; H.g = W0.g;
        H.it.animate(t, { t: W0.t, at: [0, -1.5], r: RU.items.whale.r });
        H.box.updateMatrixWorld(true); H.it.body.getWorldPosition(IV3);
        // (and see-through too as it comes down on a kart just ahead of you: a slam 10 m up the road would otherwise
        // fill the screen with whale for a second, the road and the bend hidden, for a hit that was never yours)
        // (7 Oct, round 3: to 0.1, not 0.26, and from 28 m out, not 17, the owner's "it blocks entire view": a quarter
        // of a white whale over your kart for most of a second read as a white-out, and one slammed on a rival 10 m
        // ahead hid a third of the road there)
        var cd = IV3.distanceTo(camera.position) / (H.it.body.scale.x / 9), op = 0.1 + 0.9 * smooth(10, 28, cd);
        H.mat.opacity = op; H.mat.depthWrite = op > 0.99;
        if (W0.slam && W0.t < 3.4 && dt > 0 && Math.random() < dt * 30) vfx(ilib().VFX.whale.trail, [W0.x, W0.g + 0.2, W0.z], { dt: 0.033 });
      }
      // the WHALE DUMP and a FUD Cloud, the two items made from shapes, made ahead (on the start screen, in the demo,
      // the count or the results) and drawn a frame far under the road, so the first one in a race costs a phone
      // nothing
      var WARM = { step: 0, shown: null };
      function warmItems() {
        if (KDIAG.noprep) return;
        if (WARM.shown) { WARM.shown.visible = false; WARM.shown = null; }
        if (WARM.step > 1 || (!demo && (state === 'race' || state === 'finish'))) return;
        var g;
        if (WARM.step === 0) { if (SIM.whale) return; kartStep('prep: warm whale'); g = whale().box; }
        else { kartStep('prep: warm cloud'); g = newCloud().g; }
        WARM.step++; g.position.set(0, -500, 0); g.visible = true; WARM.shown = g; RS.calm = 2;
      }
      /* -------- everything a race shows, made before it (7 Oct: on a phone, the first Pump of a race, the start
       * screen's portraits and the score's faster copy each held a frame for 40 to 150 ms). In the demo (and on the
       * start screen, the podium and the results, if Play comes first), once the roster's levels and the warm items
       * are made: what each racer carries, on its own mounts (eight of them, eight racers); the rugs, the lasers, the
       * FUD Clouds and the GM Bags a race can have out at once; the crates; every material's program, compiled; the
       * portraits; and the sound, made silent (a phone hears nothing before a tap, and the score's last-lap copy is
       * made with it). A few milliseconds of it a frame, one piece at least. In a race, nothing is made: what is
       * made there is counted (PREP.inRace, and the programs compiled), for the checks -- */
      var PREP = { jobs: null, i: 0, done: false, ms: 0, inRace: 0, made: [], programs: -1, rt: null }, PREP_PARTS = ['pump', 'diamond', 'moon', 'wallet', 'wow', 'flare', 'rugDrag', 'orbDrag'];
      function racingNow() { return !demo && (state === 'race' || state === 'countdown' || state === 'finish'); }
      function prepJobs() {
        var J = [], q;
        // (each job named for the guard's steps: its part, and its place in the part)
        function tag(name) { for (var i = 0, n = 0; i < J.length; i++) if (!J[i].tag) J[i].tag = name + ' ' + ++n; }
        if (ITEMS_ON) {
          J.push(function () { crates(); });
          ENT.forEach(function (e, m) { PREP_PARTS.forEach(function (id) { J.push(function () { partOf(m, id).g.visible = false; if (id === 'flare') kitOf(m).parts.flare.it.flareAt(0); }); }); });
          var keep = function (list, make) { return function () { var g = make(); g.visible = false; list.push(g); }; };
          for (q = 0; q < 6; q++) J.push(keep(RPOOL, function () { var r = ibuild('rug'); scene.add(r); return r; }));
          for (q = 0; q < 3; q++) J.push(keep(ROLLS, function () { var r = ibuild('rug', { rolled: true }); scene.add(r); return r; }));
          // (five orbs, each made new: three Laser Eyes out at most, and the last ones still fading as the next are
          // fired; until 7 Oct each job took the one before back out of the pool, so one orb was made, and the rest in
          // the race, on a phone a frame of 50 ms)
          for (q = 0; q < 5; q++) J.push(function () { var o = takeOrb(true); o.g.visible = false; o.rb.mesh.visible = false; OPOOL.push(o); });
          J.push(function () { while (CLOUDS.length < 3) newCloud(); });
          J.push(function () { while (BAGS.length < 2) { var g = ibuild('gmbag'); g.scale.setScalar(1.3); BAGS.push({ g: g, t: -1 }); ENT[0].object.add(g); } });
          J.push(function () { ifx(); RU.items.ids.forEach(function (id) { iconOf(id); }); });
          tag('items');
        }
        // (every program the scene will draw with, compiled for the cinematic target it is drawn into, and every
        // texture sent up)
        J.push(function () {
          if (!PREP.rt) PREP.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
          // (the chaos's own, hidden until a race needs them, shown for it: the compile passes over what is hidden)
          var rt0 = renderer.getRenderTarget(), hid = chaosHidden();
          try { renderer.setRenderTarget(post ? PREP.rt : null); renderer.compile(scene, camera); }
          finally { renderer.setRenderTarget(rt0); hid.forEach(function (g) { g.visible = false; }); }
        });
        tag('compile');
        // (and drawn once, all of it, into a target nobody sees: the shadow pass's own programs are made only by
        // drawing, and nothing made ahead is on show yet)
        J.push(function () {
          if (!post) return;
          var hidden = [];
          function show(g) { if (g && !g.visible) { g.visible = true; hidden.push(g); } }
          CAST.forEach(function (c) { if (c.H) for (var lv in c.H.levels) show(c.H.levels[lv].group); });
          for (var key in KITS) for (var id in KITS[key].parts) show(KITS[key].parts[id].g);
          RPOOL.concat(ROLLS).forEach(show); OPOOL.forEach(function (o) { show(o.g); }); CLOUDS.concat(BAGS).forEach(function (c) { show(c.g); }); if (WH) show(WH.box);
          hidden = hidden.concat(chaosHidden());
          var rt0 = renderer.getRenderTarget();
          try { renderer.setRenderTarget(PREP.rt); renderer.render(scene, camera); }
          finally { renderer.setRenderTarget(rt0); hidden.forEach(function (g) { g.visible = false; }); }
        });
        tag('draw all levels');
        J.push(function () {
          var seen = new Set();
          kartStep('textures');
          scene.traverse(function (o) {
            var ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
            ms.forEach(function (m) { ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap', 'aoMap'].forEach(function (k) { var tx = m[k]; if (tx && !seen.has(tx)) { seen.add(tx); try { renderer.initTexture(tx); } catch (e) { /* (a texture not ready yet: it goes up when drawn) */ } } });
              if (m.uniforms) for (var u in m.uniforms) { var v = m.uniforms[u].value; if (v && v.isTexture && !v.isRenderTargetTexture && !seen.has(v)) { seen.add(v); try { renderer.initTexture(v); } catch (e) { /* (as above) */ } } } });
          });
          // (8 Oct: a decoded picture that is up on the graphics card is let go of here, ImageBitmap.close(), so a phone
          // does not hold every picture twice for the whole race. Only one every texture drawing from it has sent up,
          // checked again over every texture of every material: one still waiting keeps its picture)
          if (typeof ImageBitmap === 'undefined') return;
          var up = new Map();
          scene.traverse(function (o) {
            (o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []).forEach(function (m) {
              var vals = []; for (var k in m) { var v = m[k]; if (v && v.isTexture) vals.push(v); }
              if (m.uniforms) for (var u in m.uniforms) { var w = m.uniforms[u] && m.uniforms[u].value; if (w && w.isTexture) vals.push(w); }
              vals.forEach(function (tx) {
                var im = tx.image; if (!(im instanceof ImageBitmap)) return;
                var pr = renderer.properties.get(tx), sent = !!(pr && pr.__webglTexture && pr.__version === tx.version);
                up.set(im, up.has(im) ? up.get(im) && sent : sent);
              });
            });
          });
          var closed = 0;
          up.forEach(function (sent, im) { if (sent) { try { im.close(); closed++; } catch (e) {} } });
          PREP.closed = closed;
        });
        tag('textures');
        CAST.forEach(function (c, i) { J.push(function () { portrait(i); }); });
        tag('portrait');
        // (the sound: made now, so the first tap only wakes it; the score's faster copy is made the frame after)
        J.push(function () { ensureAudio(); });
        tag('sound');
        return J;
      }
      // what the chaos keeps hidden until a race needs it (the flashes, the speed lines, the hazards' warnings and
      // models), shown now, and the list of it to hide again
      function chaosHidden() {
        var out = [];
        function show(g) { if (g && !g.visible) { g.visible = true; out.push(g); } }
        show(slines); FLASH.forEach(function (F) { show(F.sp); });
        HZV.forEach(function (V) { show(V.warn); show(V.ring); show(V.wave); show(V.rock); show(V.roll); });
        return out;
      }
      function stepPrep() {
        // (?kdiag=noprep: nothing made ahead; whatever a race needs is made when it first does)
        if (KDIAG.noprep) { if (!PREP.done) { PREP.done = true; kartStep('prep: off (kdiag)'); } return; }
        if (PREP.done || racingNow() || kartRosterState().queue.length || (ITEMS_ON && WARM.step < 2)) return;
        if (!PREP.jobs) PREP.jobs = prepJobs();
        var t0 = performance.now();
        // (each job's step told as it starts; and the next one's as the frame's share ends, so that a tab the next job
        // takes down has it kept, the page having heard it between the frames)
        do { kartStep('prep: ' + PREP.jobs[PREP.i].tag); PREP.jobs[PREP.i++](); } while (PREP.i < PREP.jobs.length && performance.now() - t0 < 4);
        PREP.ms += performance.now() - t0; RS.calm = 2;
        if (PREP.i >= PREP.jobs.length) { PREP.done = true; kartStep('prep: done'); }
        else kartStep('prep: next ' + PREP.jobs[PREP.i].tag + ' (' + PREP.i + '/' + PREP.jobs.length + ')');
      }
      /* -------- the FUD Clouds: three at most. 'fly': on its way from whoever sent it, up the road and climbing high
       * over it; 'over': over a rival it caught; 'me': over your own kart. (The owner's third review, 7 Oct: a cloud
       * sent from behind you flew down the road at the camera's height, 3.5 m across, and through the lens; one over a
       * rival just ahead hung over the road where it bends. Now one on its way flies from 3.5 m up to 9, one over a
       * rival is smaller and higher, and either shrinks away near the camera: gone within 6 m of it, whole from 16 m.
       * They cast no shadow on the road, and leave no smoke on it for the karts behind to drive through. A cloud is
       * the items' toon, solid: drawn see-through, the toon's body comes out empty, only its eyes left) -- */
      var CLOUDS = [], CLQ = new THREE.Vector3();
      function newCloud() {
        var g = ibuild('fud');
        g.traverse(function (m) { if (m.isMesh) m.castShadow = false; });
        scene.add(g);
        var c = { g: g, t: -1, k: 0 }; CLOUDS.push(c);
        return c;
      }
      function cloudFor(mode, n) {
        var c = null, q;
        for (q = 0; q < CLOUDS.length; q++) if (CLOUDS[q].t < 0) { c = CLOUDS[q]; break; }
        if (!c && CLOUDS.length < 3) c = newCloud();
        // (all three out: yours takes the one over a rival, or failing that the one on its way)
        if (!c && mode === 'me') for (q = 0; q < CLOUDS.length && !c; q++) if (CLOUDS[q].mode !== 'me') c = CLOUDS[q];
        if (!c) return null;
        c.mode = mode; c.n = n; c.t = 0; c.d = SIM.karts[n].d; c.x = SIM.karts[n].lat;
        return c;
      }
      function stepClouds(dt) {
        for (var q = 0; q < CLOUDS.length; q++) {
          var c = CLOUDS[q]; if (c.t < 0) continue;
          c.t += dt; var k = SIM.karts[c.n], life = c.mode === 'fly' ? 1.4 : RU.items.fud.ai, sc;
          if (c.mode === 'me') {
            // (yours: as long as it lasts on you; placed with the camera, myCloud, once the camera has moved)
            c.k = smooth(0, 0.2, c.t) * Math.min(1, k.fudT / 0.3);
            if (!(k.fudT > 0) || demo) { c.t = -1; c.g.visible = false; }
            continue;
          }
          if (c.mode === 'fly') { c.d += (Math.max(10, k.v) + 34) * dt; place(c.g, c.d + 4, c.x * 0.5, 3.5 + c.t * 4); sc = 1.1 * smooth(0, 0.15, c.t) * (1 - smooth(life - 0.3, life, c.t)); }
          else { place(c.g, k.d + 0.6, k.lat, 3.0 + k.y); sc = 0.85 * smooth(0, 0.2, c.t) * (1 - smooth(life - 0.3, life, c.t)); }
          var cd = c.g.position.distanceTo(camera.position);
          sc *= smooth(6, 16, cd);
          c.g.visible = sc > 0.02; c.g.scale.setScalar(Math.max(0.01, sc)); c.g.userData.item.animate(t);
          if (c.mode === 'fly' && dt > 0 && Math.random() < dt * 12 && cd > 18 && cd < 60) vfx(ilib().VFX.fud.trail, arr(c.g.position), { dt: 0.08 });
          if (c.t > life) { c.t = -1; c.g.visible = false; }
        }
      }
      // yours, once the camera has moved this frame: high in the picture over your kart, across a sixth of the screen
      // (a third of a phone's held upright), its foot a quarter of the way down at the lowest (the road's far end and
      // the next bend are under that), 4.5 m out from the lens and turned to it; its arrows drop half as far, so they
      // rain over the kart's head and not down the road ahead. The boards along the top are drawn over its crown
      function myCloud() {
        for (var q = 0; q < CLOUDS.length; q++) {
          var c = CLOUDS[q]; if (c.t < 0 || c.mode !== 'me') continue;
          var tv = Math.tan(camera.fov * PI / 360), th = tv * camera.aspect, dist = 4.5, wW = (camera.aspect < 1 ? 0.34 : 0.16) * 2 * dist * th;
          var sc = wW / 1.85, hF = 1.05 * sc / (2 * dist * tv), yc = clamp(0.25 - hF * 0.55, Math.max(0.06, FUD.top - hF * 0.3), 0.2);
          camera.updateMatrixWorld();
          CLQ.set(0, (1 - 2 * yc) * tv * dist, -dist).applyMatrix4(camera.matrixWorld);
          c.g.position.copy(CLQ); c.g.rotation.set(0, Math.atan2(camera.position.x - CLQ.x, camera.position.z - CLQ.z), 0);
          c.g.scale.setScalar(Math.max(0.01, sc * c.k)); c.g.visible = c.k > 0.02; c.g.userData.item.animate(t, { drop: 0.5 });
        }
      }
      // (debug.kart().cover: see there)
      var COVER = { rt: null, a: null, b: null, w: 0, h: 0, V: new THREE.Vector3() };
      function fxObjects(only) {
        var G = { sparks: [PIN.pts, EMB.pts], flames: [FLM.pts], smoke: [SMK.pts, STM.pts], confetti: [CNF.pts], lines: [slines], flash: [], boost: [], ifx: IFX ? [IFX.group] : [],
          clouds: [], bags: [], whale: WH ? [WH.box.children[0]] : [], claw: [], shots: [], rugs: [], meteor: [], kit: [] }, id, key;
        FLASH.forEach(function (F) { G.flash.push(F.sp); }); FL.forEach(function (f) { G.boost.push(f, f.userData.ring); });
        CLOUDS.forEach(function (c) { G.clouds.push(c.g); }); BAGS.forEach(function (b) { G.bags.push(b.g); });
        CLAWS.forEach(function (c) { if (c) G.claw.push(c.g); });
        for (id in SHOTS) G.shots.push(SHOTS[id].g, SHOTS[id].rb.mesh);
        for (id in RUGS) if (RUGS[id].roll) G.rugs.push(RUGS[id].roll);
        HZV.forEach(function (V) { if (V.rock) G.meteor.push(V.rock); });
        for (key in KITS) for (id in KITS[key].parts) G.kit.push(KITS[key].parts[id].g);
        // (only '-kit' or '-kit,lines' and the like: all but those kinds)
        var L = [], but = only && only.charAt(0) === '-' ? only.slice(1).split(',') : null;
        for (key in G) if (!only || only === key || (but && but.indexOf(key) < 0)) L = L.concat(G[key]);
        return L.filter(function (g) { return !!g; });
      }
      function coverNow(only) {
        var w = 160, h = Math.max(48, Math.round(w / Math.max(0.3, camera.aspect)));
        if (!COVER.rt || COVER.w !== w || COVER.h !== h) {
          if (COVER.rt) COVER.rt.dispose();
          COVER.rt = new THREE.WebGLRenderTarget(w, h); COVER.rt.texture.colorSpace = THREE.SRGBColorSpace;
          COVER.a = new Uint8Array(w * h * 4); COVER.b = new Uint8Array(w * h * 4); COVER.w = w; COVER.h = h;
        }
        var L = fxObjects(only), was = L.map(function (g) { return g.visible; }), rt0 = renderer.getRenderTarget(), sm = renderer.shadowMap.autoUpdate;
        // (a point's size on the screen is figured from the canvas's height, whatever it is drawn into: for the small
        // target, the pools' points made as much smaller, or a puff of dust came out four times its size)
        var PTS = [PIN, EMB, FLM, SMK, CNF, STM].map(function (p) { return p.pts.material; }), ps = h / Math.max(1, renderer.domElement.height);
        PTS.forEach(function (m) { m.size *= ps; });
        try {
          renderer.shadowMap.autoUpdate = false;
          renderer.setRenderTarget(COVER.rt); renderer.clear(); renderer.render(scene, camera); renderer.readRenderTargetPixels(COVER.rt, 0, 0, w, h, COVER.a);
          L.forEach(function (g) { g.visible = false; });
          renderer.clear(); renderer.render(scene, camera); renderer.readRenderTargetPixels(COVER.rt, 0, 0, w, h, COVER.b);
        } finally { L.forEach(function (g, i) { g.visible = was[i]; }); PTS.forEach(function (m) { m.size /= ps; }); renderer.setRenderTarget(rt0); renderer.shadowMap.autoUpdate = sm; }
        // the kart followed, its box on the screen
        var n = RS.focus, cb = camBox(ENT[n].object), x0 = 1, x1 = 0, y0 = 1, y1 = 0, c, V = COVER.V;
        for (c = 0; c < 8; c++) { V.copy(cb[c]).applyMatrix4(CBM).project(camera); var sx = (V.x + 1) / 2, sy = (1 - V.y) / 2; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
        x0 = clamp(x0, 0, 1); x1 = clamp(x1, 0, 1); y0 = clamp(y0, 0, 1); y1 = clamp(y1, 0, 1);
        // the overlay (the FUD haze), where it is shown
        var od = null, ow = 0, oh = 0, oop = 0;
        if (fudCv.style.display === 'block' && fudCv.width > 1) { ow = fudCv.width; oh = fudCv.height; od = fudCv.getContext('2d').getImageData(0, 0, ow, oh).data; oop = +fudCv.style.opacity || 0; }
        var foot = Math.max(0.5, Math.min(0.95, y1)), bN = 0, bC = 0, bV = 0, kN = 0, kC = 0, oN = 0;
        for (var r = 0; r < h; r++) {
          var y = 1 - (r + 0.5) / h, inB = y >= 0.3 && y <= foot, inK = y >= y0 && y <= y1;
          if (!inB && !inK) continue;
          for (var q = 0; q < w; q++) {
            var x = (q + 0.5) / w, b = inB && x >= 0.2 && x <= 0.8, kk = inK && x >= x0 && x <= x1;
            if (!b && !kk) continue;
            var i = (r * w + q) * 4, dd = Math.max(Math.abs(COVER.a[i] - COVER.b[i]), Math.abs(COVER.a[i + 1] - COVER.b[i + 1]), Math.abs(COVER.a[i + 2] - COVER.b[i + 2])) / 255;
            var ov = od ? od[(Math.min(oh - 1, Math.floor(y * oh)) * ow + Math.min(ow - 1, Math.floor(x * ow))) * 4 + 3] / 255 * oop : 0;
            var hid = dd > 0.25 || ov > 0.25;
            if (b) { bN++; bV += Math.max(dd, ov); if (hid) bC++; if (ov > 0.25) oN++; }
            if (kk) { kN++; if (hid) kC++; }
          }
        }
        return { band: +(bC / Math.max(1, bN)).toFixed(4), kart: +(kC / Math.max(1, kN)).toFixed(4), veil: +(bV / Math.max(1, bN)).toFixed(4), overlay: +(oN / Math.max(1, bN)).toFixed(4), box: [x0, x1, y0, y1].map(function (v) { return +v.toFixed(3); }), fx: L.length };
      }
      var BAGS = [];
      function bagPop(n) {
        var b = null;
        for (var q = 0; q < BAGS.length; q++) if (BAGS[q].t < 0) { b = BAGS[q]; break; }
        if (!b) { if (BAGS.length >= 2) return; var g = ibuild('gmbag'); g.scale.setScalar(1.3); b = { g: g, t: -1 }; BAGS.push(b); }
        b.t = 0; b.n = n; b.burst = false; ENT[n].object.add(b.g);
      }
      function stepBags(dt) {
        for (var q = 0; q < BAGS.length; q++) {
          var b = BAGS[q]; if (b.t < 0) continue;
          b.t += dt; var u = Math.min(1, b.t / 0.55), it = b.g.userData.item;
          b.g.position.set(-1.0 * (1 - u), Math.sin(u * PI) * 0.9 + u * 1.4, 0.4 * (1 - u)); b.g.visible = ENT[b.n].object.visible && b.t < 0.62;
          it.animate(b.t, { pop: 1 - smooth(0.85, 1, u) * 0.9 });
          if (!b.burst && b.t >= 0.6) { b.burst = true; ENT[b.n].object.updateMatrixWorld(true); var p = arr(ENT[b.n].object.localToWorld(IV4.set(0, 1.6, 0.1))); vfx(ilib().VFX.gmbag.impact, p); }
          if (b.t > 0.7) { b.t = -1; b.g.visible = false; }
        }
      }
      // what the race said about items: the effects and the sounds
      var ITEM_EV = { crate: 1, roll: 1, got: 1, item: 1, drag: 1, rug: 1, trap: 1, laser: 1, laserEnd: 1, dodge: 1, shielded: 1, blocked: 1, hit: 1, whale: 1, slam: 1, fudHit: 1 };
      function itemEvent(ev, me, nearMe) {
        var VX = ilib().VFX, n = ev[1], k = SIM.karts[n], V = IV[n], p;
        switch (ev[0]) {
          case 'crate': { var c = SIM.crates[ev[2]]; if (!c) break; p = cratePos(c, t + ev[2] * 0.4, IV3); if (camNear(p, 90)) vfx(VX.airdrop.impact, arr(p)); if (me) sound('crate'); break; }
          case 'roll': if (me) { SLOT.j = 0; SLOT.next = 0; } break;
          case 'got': if (me) { slotPop(); sound('got'); } break;
          case 'item': {
            var id = ev[2];
            if (id === 'pump') V.pumpT = 0;
            else if (id === 'laser') V.flareT = 0;
            else if (id === 'gmbag' && nearMe) bagPop(n);
            else if (id === 'fud') cloudFor('fly', n);
            if (nearMe) {
              var at = arr(kartAt(n, 1, IV3).add(IV4.set(0, 1, 0)));
              if (id === 'wow') { vfx(VX.wow.impact, at); vfx(VX.wow.anticipation, at); }
              else if (id === 'diamond') vfx(VX.diamond.anticipation, at);
              else if (id === 'wallet') vfx(VX.wallet.anticipation, at);
              else if (id === 'moon') vfx(VX.moon.anticipation, at);
              else if (id === 'pump') vfx(VX.pump.anticipation, at);
              else if (id === 'fud') vfx(VX.fud.anticipation, at);
              else if (id === 'whale') vfx(VX.whale.anticipation, at);
            }
            if (me && id !== 'laser' && id !== 'rug') sound(id === 'gmbag' ? 'bag' : id);
            break;
          }
          case 'drag': if (me) sound('drag'); break;
          case 'rug': if (nearMe) sound('rug'); break;
          case 'trap': { var R1 = RUGS[ev[1]]; if (R1 && ev[2] >= 0) R1.yank = 0; if (R1 && ev[2] >= 0 && R1.flat && camNear(R1.flat.position, 80)) vfx(VX.rug.impact, arr(R1.flat.position)); if (ev[2] === 0) { sound('yank'); CAM.shake = Math.max(CAM.shake, 0.1); } break; }
          case 'laser': if (nearMe) sound('laser'); break;
          case 'laserEnd': { var O = SHOTS[ev[1]]; if (O && ev[2] !== 'time' && camNear(O.g.position, 90)) vfx(VX.laser.impact, arr(O.g.position)); if (ev[3] === 0) CAM.shake = Math.max(CAM.shake, 0.1); break; }
          case 'dodge': if (me) say('Dodged'); break;
          case 'shielded': if (me) say('Blocked'); break;
          case 'blocked': { if (V) { V.blockT = 0; V.blockAt = [0.9, 0.9, 1.1]; } if (nearMe) { p = kartAt(n, 1, IV3); vfx(VX.wallet.blocked, [p.x, p.y + 0.9, p.z]); vfx(VX.wallet.impact, [p.x, p.y + 0.8, p.z]); } if (me) { sound('block'); say('Cold Wallet'); } break; }
          case 'hit': if (me) { sound('hit'); CAM.shake = Math.max(CAM.shake, ev[2] === 'whale' ? 0.25 : 0.1); } break;
          case 'whale': sound('horn'); if (ev[2] === 0) say('WHALE DUMP incoming'); break;
          case 'slam': { var W0 = SIM.whale; if (W0) { vfx(VX.whale.impact, [W0.x, W0.g + 0.3, W0.z]); if (Math.hypot(W0.x - SIM.karts[0].x, W0.z - SIM.karts[0].z) < 30) { CAM.shake = Math.max(CAM.shake, 0.25); sound('slam'); } } break; }
          // (yours named, so you know what it was: 7 Oct, round 3, "not sure why")
          case 'fudHit': if (me) { cloudFor('me', n); fudPaint(); if (!demo) say('FUD Cloud by ' + nameOf(ev[2])); } else if (nearMe) cloudFor('over', n); break;
          default: break;
        }
      }

      // each kart's pose between steps, its springs, and what its effects remember
      var POSE = ENT.map(function () { return { roll: 0, pitch: 0, sq: 0, lastV: 0, emit: 0, emb: 0, flm: 0, slp: 0, trick: 0, spin: 0, ang: 0, stm: 0, grd: 0, chg: 0, wheels: [{ on: false, x: 0, z: 0 }, { on: false, x: 0, z: 0 }] }; });
      // the steam off an angry racer's head: small white puffs, rising (one draw call)
      var STM = pool(LOW ? 40 : 80, 0.42, false, -2.6, 1.8);
      var REAR = [[0.77, -0.72], [-0.77, -0.72]], TV = new THREE.Vector3();
      // what each racer's animate() hears, one object a kart, filled in place every frame
      var AS = ENT.map(function () { return { speed: 0, steer: 0, drift: 0, tier: 0, boost: 0, air: 0, trick: 0, hit: false, bump: false, spun: false, place: 1, finished: false, roll: 0, hop: false,
        detail: 'mid', urgent: false, back: false, gaze: null, celebrate: false, sad: false }; });
      var GZ = ENT.map(function () { return [0, 0]; });
      /* -------- each racer's level of detail, by its distance from the camera: the kart the camera follows near,
       * and the two nearest others within 15 m; to 45 m the middle level (on a phone over 140 draw calls, 27 m); beyond
       * it the far. Held both ways (7 Oct:
       * a racer on the line between two flipped between them): by distance, near until 18 m and far until 41 m
       * once there; and by time, a level held a second at least before it changes again, so no racer goes from one
       * to another and back inside a second (the one the camera follows, and a cut of the camera, excepted) -- */
      var DET = ENT.map(function () { return 'mid'; }), DIST = new Float64Array(ENT.length), BYD = ENT.map(function (e, n) { return n; });
      var DETT = new Float64Array(ENT.length).fill(-9), LODF = { fN: -1, log: [], cam: null }, LOD_HOLD = 1;
      var MIDR = [41, 45], CROWD = false;
      function lods(fN) {
        var cp = camera.position, n, q;
        for (n = 0; n < ENT.length; n++) { var o = ENT[n].object.position; DIST[n] = Math.hypot(o.x - cp.x, o.y - cp.y, o.z - cp.z); }
        BYD.sort(function (a, b) { return DIST[a] - DIST[b]; });
        // (a cut, to another kart or the camera jumping somewhere else: every level free to change at once)
        if (fN !== LODF.fN || !LODF.cam || LODF.cam.distanceToSquared(cp) > 400) { LODF.fN = fN; DETT.fill(-9); }
        (LODF.cam || (LODF.cam = new THREE.Vector3())).copy(cp);
        // (a phone's frame over 140 draw calls, as with the pack all round it since 7 Oct: the middle level only to 60%
        // as far, and one other racer near instead of two (the three fixes together still peaked at 151 for a frame
        // in a thousand with the field wheel to wheel), until it is under again. From 135 since the owner's review
        // drives (a racer held at the middle level for its second ran a full race's frame to 153): and a racer held
        // there drops to the far level at once, the cheap way, without waiting out its second)
        var crowd = CROWD = quality === 'low' && (post ? post.calls : renderer.info.render.calls) > 135;
        var near = 0, cap = crowd ? Math.min(RS.near, 1) : RS.near;
        // (the near ones held this second keep their places first, so the near never runs over its number)
        for (q = 0; q < BYD.length; q++) { n = BYD[q]; if (n !== fN && DET[n] === 'near' && t - DETT[n] < LOD_HOLD) near++; }
        for (q = 0; q < BYD.length; q++) {
          n = BYD[q];
          var d = DIST[n], was = DET[n], want;
          if (RS.lodAll) want = RS.lodAll;
          else if (n === fN) want = 'near';
          else if (t - DETT[n] < LOD_HOLD) { if (!(crowd && was === 'mid' && d >= MIDR[1] * 0.6)) continue; want = 'far'; }
          else if (near < cap && d < (was === 'near' ? 18 : 15)) { want = 'near'; near++; }
          else want = d < (was === 'far' ? MIDR[0] : MIDR[1]) * (crowd ? 0.6 : 1) ? 'mid' : 'far';
          if (want !== was) { DET[n] = want; DETT[n] = t; if (LODF.log.length < 400) LODF.log.push([+t.toFixed(3), n, was, want]); }
        }
      }
      // where a racer looks: the nearest kart within 14 m ahead of or beside it, as a gaze (x: its left, y: up), or
      // nowhere in particular
      function gazeOf(n, x, z, yaw) {
        var best = 196, bx = 0, bz = 0, c = Math.cos(yaw), s0 = Math.sin(yaw);
        for (var m = 0; m < SIM.karts.length; m++) {
          var q = SIM.karts[m]; if (m === n || q.parked) continue;
          var dx = q.x - x, dz = q.z - z, d2 = dx * dx + dz * dz; if (d2 >= best) continue;
          var lz = dx * s0 + dz * c; if (lz < -0.2 * Math.sqrt(d2)) continue;
          best = d2; bx = dx * c - dz * s0; bz = lz;
        }
        if (best >= 196) return null;
        var G0 = GZ[n]; G0[0] = clamp(bx / Math.max(0.6, bz), -1.4, 1.4); G0[1] = -0.04; return G0;
      }
      // an angry racer's face: its own drift face (Bull Run's charge, steam and all; Big Bear's growl; Bike Tyson set;
      // Moon Cat's focus; Doge's side-eye; Pepe's smug; Shiba's grin), The Whale's puffed-up boost face, laid over the
      // face it had (a world's own racer hears angry, 0 to 1, in animate())
      function angryFace(n, amt) {
        var c = CAST[ORDER[n]], H = c.H;
        if (!H || !H.cur || H.cur.level === 'far' || !H.cur.api || !H.cur.api.names) return;
        var R = kartRosterLib().RACERS[c.racer];
        if (!R || !R.face) return;
        var want = (c.racer === 'whale' ? R.face.boost : R.face.drift) || {}, W = H.st.W, api = H.cur.api;
        for (var q = 0; q < api.names.length; q++) { var nm = api.names[q]; W[nm] = (W[nm] || 0) + ((want[nm] || 0) - (W[nm] || 0)) * amt; }
        api.set(W);
      }
      function poseKarts(alpha, dt) {
        var fl = 0, mog = 0;
        FXC.charge = FXC.grind = FXC.steam = 0;
        if (RS.pod) {
          // on the podium: the top three on their blocks, facing the camera, everyone else away
          // (set square on the block, the way the block itself is set: a kart swinging side to side hung its wheels
          // off the 3rd block's corner)
          var Pd = podium(); Pd.g.visible = true;
          for (var n0 = 0; n0 < SIM.karts.length; n0++) {
            var at = RS.pod.indexOf(n0), e0 = ENT[n0];
            FL[n0].visible = false; FL[n0].userData.ring.visible = false; hideItems(n0);
            if (at < 0) { e0.object.visible = false; continue; }
            var B = Pd.blocks[at]; place(e0.object, PD, B.x, B.h);
            e0.object.visible = true;
            // (they celebrate: the faces, a bounce, Bike Tyson's wheelie and his punch at the sky)
            var A0 = AS[n0]; A0.speed = 0; A0.steer = Math.sin(t * 2 + at) * 0.3; A0.drift = 0; A0.tier = 0; A0.boost = 0; A0.air = 0; A0.trick = 0; A0.hit = A0.bump = A0.spun = A0.hop = A0.back = A0.sad = false;
            A0.place = at + 1; A0.finished = true; A0.roll = 0; A0.detail = 'near'; A0.urgent = true; A0.gaze = null; A0.celebrate = true;
            if (e0.animate) try { e0.animate(t, dt, A0); } catch (err) { e0.animate = null; }
          }
          FXS.flames = 0; FXS.mog = 0;
          return;
        }
        if (POD) POD.g.visible = false;
        var fN = RS.film && RS.film.k != null ? clamp(Math.round(RS.film.k), 0, 7) : RS.focus;
        lods(fN);
        for (var n = 0; n < SIM.karts.length; n++) {
          var k = SIM.karts[n], e = ENT[n], P = POSE[n], F = FL[n];
          var claw = k.rescue >= 0 ? clawFor(n) : CLAWS[n];
          if (k.parked) { e.object.visible = false; F.visible = false; F.userData.ring.visible = false; hideItems(n); continue; }
          // (a ghost after the Claw blinks; so does a kart for its second untouchable after an item's hit)
          e.object.visible = !(k.ghost > 0 && Math.floor(k.ghost * 12) % 2) && !(k.iframe > 0 && k.hitT <= 0 && k.moon <= 0 && Math.floor(k.iframe * 14) % 2);
          var x = k.px + (k.x - k.px) * alpha, z = k.pz + (k.z - k.pz) * alpha, y = k.py + (k.y - k.py) * alpha, yaw = k.pyaw + wrapPi(k.yaw - k.pyaw) * alpha;
          // (its height between the last two steps, as x and z are, on the road read between its samples; and the
          // slope it is pitched to read either side of where it is, not at the nearest sample, so neither steps)
          var gy = k.pg + (k.ground - k.pg) * alpha, i = k.i, gd = drawnD(k, alpha);
          var slope = Math.atan2(roadY(gd + 2) - roadY(gd - 2), 4) * (Math.cos(yaw - Math.atan2(TR.tx[i], TR.tz[i])));
          // (a hard knock from the side: a wobble, never a spin; a trick: a full turn, flat, in the air)
          if (k.trick && k.air) P.trick = Math.min(1, P.trick + dt / 0.42); else if (!k.air) P.trick = 0;
          var wob = k.wob > 0 ? Math.sin(k.wob * 46) * 0.14 * (k.wob / RU.wobbleT) : 0;
          // (a bonk spins the kart round once, in the picture only: 0.55 s)
          if (P.spin > 0) { P.spin += dt / 0.55; if (P.spin >= 1) P.spin = 0; }
          // (an item's hit: a rug, or a touch of Diamond Hands or the rocket, spins the kart twice round; a laser rolls it
          // over and up; the Whale flips it end over end, high)
          var hx = 0, hy = 0, hz = 0, lift = 0;
          if (k.hitK && k.hitT > 0) {
            var hT = k.hitT0 || RU.items.diamond.spinT, hu = clamp(1 - k.hitT / hT, 0, 1);
            if (k.hitK === 'laser') { hz = smooth(0, 1, hu) * 2 * PI; lift = Math.sin(hu * PI) * 0.7; }
            else if (k.hitK === 'whale') { hx = -smooth(0.05, 0.85, hu) * 2 * PI; lift = Math.sin(Math.min(1, hu * 1.25) * PI) * 2.6; }
            // (the rolling coin's bonk: knocked round once, and off the road a little)
            else if (k.hitK === 'bonk') { hy = smooth(0, 1, hu) * 2 * PI; lift = Math.sin(hu * PI) * 0.45; }
            else hy = (1 - (1 - hu) * (1 - hu)) * 4 * PI;
          }
          // (on a rail: a lean that rocks with the grind; over a bump, the kart pitched to its slope)
          var grindLean = k.grind >= 0 ? 0.1 * Math.sin(t * 11 + n) + (k.steer || 0) * 0.12 : 0;
          var bumpPitch = k.bmp >= 0 && SIM.course.bumps[k.bmp] ? -(SIM.bumpAt(k.d + 0.6, k.lat) || { h: 0 }).h + (SIM.bumpAt(k.d - 0.6, k.lat) || { h: 0 }).h : 0;
          e.object.position.set(x, gy + y + lift, z);
          e.object.rotation.set(-slope + (k.ramp >= 0 ? -0.09 : k.air ? -clamp(k.vy, -9, 9) * 0.012 : 0) + hx + clamp(bumpPitch * 0.8, -0.3, 0.3), yaw + wob + P.trick * 2 * PI + smooth(0, 1, P.spin) * 2 * PI + hy, hz + grindLean);
          if (dt > 0) {
            var acc = (k.v - P.lastV) / dt; P.lastV = k.v;
            P.roll = damp(P.roll, clamp(k.w * Math.abs(k.v) * 0.006, -0.13, 0.13), 10, dt);
            P.pitch = damp(P.pitch, clamp(-acc * 0.004, -0.06, 0.06), 6, dt);
            // (squashed on landing, the harder the longer the air; stretched taking off: back to rest in a fifth of a second)
            P.sq = P.sq > 0 ? Math.max(0, P.sq - dt * 5) : Math.min(0, P.sq + dt * 5);
          }
          var m = e.model || e.object.children[0], s0 = CAST[ORDER[n]].s0;
          if (m && s0) {
            m.rotation.set(P.pitch, 0, P.roll * 0.4);
            m.scale.set(s0.x * (1 + 0.07 * P.sq), s0.y * (1 - 0.13 * P.sq), s0.z * (1 + 0.07 * P.sq));
          }
          var A = AS[n];
          A.speed = k.v; A.steer = k.steer; A.drift = k.dDir; A.tier = k.tier; A.boost = k.bt > 0 ? 1 : 0; A.air = k.air || k.y > 0.01 ? 1 : 0; A.trick = k.trick ? 1 : 0;
          A.hit = k.bonk > 0 || k.wob > 0 || k.rescue >= 0 || k.hitT > 0; A.bump = k.bump > 0; A.spun = k.stun > 0 || k.spin > 0; A.place = k.place; A.finished = k.fin; A.roll = P.roll; A.hop = k.hop >= 0;
          A.detail = DET[n]; A.urgent = n === fN; A.back = n === 0 && RS.back; A.gaze = DET[n] !== 'far' ? gazeOf(n, k.x, k.z, yaw) : null;
          A.celebrate = k.fin && k.finPlace <= 3 && (n !== 0 || state === 'finish' || demo); A.sad = k.fin && k.finPlace > 3;
          // (7 Oct: angry, 0 to 1; on a rail; a charge jump charging, 0 to 1)
          P.ang = damp(P.ang, k.ai.mad > 0 && !k.fin ? 1 : 0, k.ai.mad > 0 ? 8 : 3, dt);
          A.angry = +P.ang.toFixed(3); A.grind = k.grind >= 0; A.charge = k.cj >= 0 ? Math.min(1, k.cj / RU.cj.full) : 0;
          if (e.animate) try { e.animate(t, dt, A); }
          catch (err) { fail('A racer\'s animate() threw: ' + (err && err.message || err)); e.animate = null; }
          if (P.ang > 0.02 && !A.celebrate) angryFace(n, P.ang);
          // the claw: down to it, then carrying it, then away up
          if (claw) {
            if (k.rescue >= 0 && k.lifted) { claw.g.visible = true; claw.g.position.set(x, gy + y, z); claw.g.rotation.y = yaw; claw.up = 0; claw.fingers.forEach(function (f) { f.rotation.x = 0; }); }
            else if (k.rescue >= 0) { claw.g.visible = true; claw.up = 0; claw.g.position.set(x, gy + RU.claw.high * (1 - k.rescue / RU.claw.fall) + 1, z); }
            else if (claw.g.visible) { claw.up += dt; claw.g.position.y += dt * (4 + claw.up * 10); claw.fingers.forEach(function (f) { f.rotation.x = -0.5; }); if (claw.up > 0.9) claw.g.visible = false; }
            if (claw.g.visible) claw.rotors.forEach(function (r, ri) { r.rotation.y += dt * (30 + ri); });
          }
          // the flame
          var boost = clamp((k.bm - 1) / 0.2, 0, 1);
          // (on the rocket, the rocket's own flame is the boost)
          // (on a phone: the flame's white core only on a racer near the camera, and over 135 draw calls no flame at
          // all on one far off, a few pixels there; the owner's review drives, 7 Oct, peaked at 159 with the pack boosting)
          F.visible = boost > 0.04 && e.object.visible && !(k.moon > 0) && !(CROWD && DET[n] === 'far' && n !== RS.focus);
          F.children[0].visible = !LOW || DET[n] === 'near';
          if (F.visible) {
            fl++;
            var c = k.bSrc === 'drift' ? tierRgb(k.btTier || 1) : FLAME[k.bSrc] || TIER[1].rgb; F.material.color.setRGB(c[0], c[1], c[2]);
            F.scale.set(0.8 + boost * 0.6, 0.8 + boost * 0.6, (0.5 + boost * 1.5) * (0.85 + Math.random() * 0.3));
          }
          // MOG's ring of light on the ground
          // the items this kart carries
          if (ITEMS_ON) poseItems(n, k, e, dt, n === RS.focus || camNear(e.object.position, 60));
          var ring = F.userData.ring, isMog = k.dDir && k.tier === 3 && k.y <= 0.01 && e.object.visible;
          // (and a charge jump's glow: cyan, swelling as it charges, white-gold when it is full)
          var chg = !isMog && k.cj >= 0 && k.y <= 0.4 && e.object.visible ? Math.min(1, k.cj / RU.cj.full) : -1;
          ring.visible = !!isMog || chg >= 0;
          if (isMog) { mog++; var mc = mogHue(t); ring.material.color.setRGB(mc[0], mc[1], mc[2]); ring.material.opacity = 0.55 + 0.3 * Math.sin(t * 22); ring.scale.setScalar(1 + 0.08 * Math.sin(t * 13)); }
          else if (chg >= 0) {
            var full = chg >= 1;
            ring.material.color.setRGB(full ? 2.8 : 0.5 + 1.2 * chg, full ? 2.4 : 2.2 + 0.4 * chg, full ? 1.4 : 2.9);
            ring.material.opacity = (0.35 + 0.45 * chg) * (full ? 0.85 + 0.15 * Math.sin(t * 40) : 1); ring.scale.setScalar(0.62 + 0.45 * chg + (full ? 0.05 * Math.sin(t * 25) : 0));
          }
          if (dt <= 0) continue;
          // sparks and skid marks off the rear wheels while drifting (and a scrape's off the wall side): pale before a
          // tier, then the tier's own: Green Candle's mint pins, Gold's sparks and a trail of embers, MOG's flames
          var lx = Math.cos(yaw), lz = -Math.sin(yaw), fx = Math.sin(yaw), fz = Math.cos(yaw);
          var grounded = k.y <= 0.01 && !k.air, marking = (k.dDir && grounded) || k.scrape > 0;
          for (var w = 0; w < 2; w++) {
            var wx = x + lx * REAR[w][0] + fx * REAR[w][1], wz = z + lz * REAR[w][0] + fz * REAR[w][1];
            if (marking) skid(P.wheels[w], wx, wz, k.ground + 0.035); else P.wheels[w].on = false;
          }
          var near = n === 0 || Math.abs(SIM.relD(k.d, SIM.karts[RS.focus].d)) < 70, rate = LOW ? 0.5 : 1;
          if (near && ((k.dDir && grounded) || k.scrape > 0)) {
            var tier = k.dDir ? k.tier : 0;
            P.emit += dt * (k.scrape > 0 && !k.dDir ? 70 : tier === 1 ? 150 : tier ? 110 : 34) * rate;
            var col = k.scrape > 0 && !k.dDir ? TIER[2].rgb : tierRgb(tier), fast = tier === 1 ? 1.5 : 1;
            while (P.emit >= 1) {
              P.emit -= 1;
              var ww = Math.random() < 0.5 ? 0 : 1, ox = REAR[ww][0], sx = x + lx * ox + fx * REAR[ww][1], sz = z + lz * ox + fz * REAR[ww][1];
              var out = (ox > 0 ? 1 : -1) * (0.6 + Math.random() * 2.2), back = (2 + Math.random() * 4) * fast;
              PIN.emit(sx, k.ground + 0.12, sz, col[0], col[1], col[2], 1, -fx * back + lx * out + (Math.random() - 0.5), (1.2 + Math.random() * 2.6) * fast, -fz * back + lz * out + (Math.random() - 0.5), (tier === 1 ? 0.14 : 0.18) + Math.random() * 0.22);
            }
            if (tier === 2) {
              // Gold: embers that hang behind, a trail along the line
              P.emb += dt * 46 * rate;
              while (P.emb >= 1) { P.emb -= 1; var ew = Math.random() < 0.5 ? 0 : 1; EMB.emit(x + lx * REAR[ew][0] * 0.9 + fx * -0.9, k.ground + 0.25 + Math.random() * 0.2, z + lz * REAR[ew][0] * 0.9 + fz * -0.9, 2.8, 1.9, 0.5, 1, (Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8, 0.55 + Math.random() * 0.35); }
            }
            if (tier === 3) {
              // MOG: flames off both rear wheels, their hue never still
              P.flm += dt * 70 * rate;
              while (P.flm >= 1) { P.flm -= 1; var fw = Math.random() < 0.5 ? 0 : 1, mh = mogHue(t + Math.random() * 0.3); FLM.emit(x + lx * REAR[fw][0] + fx * (REAR[fw][1] - 0.15), k.ground + 0.2, z + lz * REAR[fw][0] + fz * (REAR[fw][1] - 0.15), mh[0], mh[1], mh[2], 0.9, -fx * 2 + (Math.random() - 0.5) * 1.4, 1.5 + Math.random() * 1.5, -fz * 2 + (Math.random() - 0.5) * 1.4, 0.22 + Math.random() * 0.16); }
            }
          } else { P.emit = 0; P.emb = 0; P.flm = 0; }
          // a charge jump charging: pale sparks off the rear wheels, more as it fills
          if (near && chg >= 0) {
            P.chg += dt * (10 + 50 * chg) * rate; FXC.charge++;
            while (P.chg >= 1) { P.chg -= 1; var cw = Math.random() < 0.5 ? 0 : 1; PIN.emit(x + lx * REAR[cw][0] + fx * REAR[cw][1], k.ground + 0.1, z + lz * REAR[cw][0] + fz * REAR[cw][1], 1.2, 2.4, 2.9, 1, -fx * 3 + (Math.random() - 0.5) * 2, 1 + Math.random() * 2, -fz * 3 + (Math.random() - 0.5) * 2, 0.15 + Math.random() * 0.15); }
          } else P.chg = 0;
          // on a rail: a shower of gold sparks off the kart's underside, and embers behind
          if (near && k.grind >= 0) {
            P.grd += dt * 150 * rate; FXC.grind++;
            while (P.grd >= 1) { P.grd -= 1; var gs = (Math.random() - 0.5) * 1.2; PIN.emit(x + lx * gs + fx * (Math.random() - 0.6), k.ground + y - 0.05, z + lz * gs + fz * (Math.random() - 0.6), 2.9, 2.0, 0.6, 1, -fx * (3 + Math.random() * 5) + lx * (Math.random() - 0.5) * 4, 0.5 + Math.random() * 3, -fz * (3 + Math.random() * 5) + lz * (Math.random() - 0.5) * 4, 0.2 + Math.random() * 0.25); }
            if (Math.random() < dt * 30 * rate) EMB.emit(x - fx * 0.8, k.ground + y, z - fz * 0.8, 2.8, 1.9, 0.5, 1, (Math.random() - 0.5), 0.3, (Math.random() - 0.5), 0.5);
          } else P.grd = 0;
          // angry: steam puffing off its head, two jets
          if (near && P.ang > 0.3 && e.object.visible) {
            P.stm += dt * 16 * rate * P.ang; FXC.steam++;
            while (P.stm >= 1) { P.stm -= 1; var ss = Math.random() < 0.5 ? -1 : 1; STM.emit(x + lx * ss * 0.25 - fx * 0.2, k.ground + y + 1.75, z + lz * ss * 0.25 - fz * 0.2, 1, 1, 1, 0.85, lx * ss * 1.4 + (Math.random() - 0.5) * 0.5, 2.2 + Math.random(), lz * ss * 1.4 + (Math.random() - 0.5) * 0.5, 0.45 + Math.random() * 0.2); }
          } else P.stm = 0;
          // the slipstream filling: streaks of air past the kart
          if (near && k.draftC > 0.25) {
            P.slp += dt * 40 * rate * Math.min(1, k.draftC / RU.draft.fill + 0.3);
            while (P.slp >= 1) { P.slp -= 1; var sd = Math.random() < 0.5 ? -1 : 1, up = 0.3 + Math.random() * 0.9, ws = -(8 + Math.random() * 6); PIN.emit(x + lx * sd * (0.9 + Math.random() * 0.6) + fx * 2.2, k.ground + up, z + lz * sd * (0.9 + Math.random() * 0.6) + fz * 2.2, 1.6, 1.7, 1.8, 0.7, Math.sin(k.h) * (k.v + ws) * 0.5, 16 * 0.12, Math.cos(k.h) * (k.v + ws) * 0.5, 0.16); }
          } else P.slp = 0;
        }
        FXS.flames = fl; FXS.mog = mog;
        if (skDirty) { skGeo.attributes.position.needsUpdate = true; skDirty = false; }
      }
      // one-off bursts: a flooded start's puff, a landing's dust, a splash, a pad's flash
      function puffAt(n, kind) {
        var k = SIM.karts[n], fx = Math.sin(k.yaw), fz = Math.cos(k.yaw), m;
        if (kind === 'flood') for (m = 0; m < 22; m++) SMK.emit(k.x - fx * 1.2 + (Math.random() - 0.5) * 0.6, k.ground + 0.5, k.z - fz * 1.2 + (Math.random() - 0.5) * 0.6, 0.5, 0.5, 0.52, 0.8, -fx * 2 + (Math.random() - 0.5) * 2, 1 + Math.random() * 1.6, -fz * 2 + (Math.random() - 0.5) * 2, 0.9 + Math.random() * 0.5);
        // (a landing's dust, and the rolling coin's: thinner since 7 Oct, round 3, "it blocks entire view": met at 31 m/s,
        // ten puffs of it across the road ahead were a wall of dust for a third of a second)
        else if (kind === 'land') for (m = 0; m < 6; m++) SMK.emit(k.x + (Math.random() - 0.5) * 1.6, k.ground + 0.2, k.z + (Math.random() - 0.5) * 1.6, 0.72, 0.68, 0.6, 0.3, (Math.random() - 0.5) * 3, 0.6, (Math.random() - 0.5) * 3, 0.6);
        else if (kind === 'splash') for (m = 0; m < 26; m++) SMK.emit(k.x + (Math.random() - 0.5), k.ground, k.z + (Math.random() - 0.5), 0.85, 0.93, 1, 0.7, (Math.random() - 0.5) * 4, 3 + Math.random() * 3, (Math.random() - 0.5) * 4, 0.7);
        else if (kind === 'pad') for (m = 0; m < 24; m++) EMB.emit(k.x + (Math.random() - 0.5) * 2, k.ground + 0.1, k.z + (Math.random() - 0.5) * 2, TIER[1].rgb[0], TIER[1].rgb[1], TIER[1].rgb[2], 1, (Math.random() - 0.5) * 2, 2 + Math.random() * 3, (Math.random() - 0.5) * 2, 0.4);
        else if (kind === 'launch') for (m = 0; m < 30; m++) { var mh = mogHue(t + m * 0.05); FLM.emit(k.x - fx * 1.2, k.ground + 0.3, k.z - fz * 1.2, mh[0], mh[1], mh[2], 0.9, -fx * 4 + (Math.random() - 0.5) * 3, 1 + Math.random() * 2, -fz * 4 + (Math.random() - 0.5) * 3, 0.35); }
      }
      function confetti(dt) {
        if (!RS.pod || RS.podT > 4.5) return;
        var Pd = podium(), c = pointAt(PD, 0, 9, TV), C4 = [[0.36, 1, 0.75], [1, 0.79, 0.24], [1, 0.24, 0.65], [0.95, 0.95, 0.95]];
        for (var m = 0; m < (LOW ? 60 : 120) * dt; m++) { var cc = C4[(Math.random() * 4) | 0]; CNF.emit(c.x + (Math.random() - 0.5) * 12, c.y + Math.random() * 2, c.z + (Math.random() - 0.5) * 8, cc[0], cc[1], cc[2], 1, (Math.random() - 0.5) * 3, -1 - Math.random(), (Math.random() - 0.5) * 3, 3.5 + Math.random()); }
        void Pd;
      }

      /* -------- the camera -- */
      // chasing: 5.2 m behind and 1.9 m up (6.2 and 2.3 on a phone held upright), aimed as if 1 m up at a point 6 m
      // ahead, at 68 degrees (4 more at speed, 7 more on a boost); it turns after the kart on a spring (7 parts the way
      // it moves to 3 the way it points), swings 5 degrees and half a metre out of a drift and rolls 2; it never falls
      // back from it, whatever the speed. C (or Y) looks back.
      // Its height and its aim (the owner, 7 Oct: "the camera view loses the rider and kart when he drops and dips down
      // on the course"; until then one spring followed the kart's height, slower in the air, and the aim never tipped,
      // so down Buy the Dip's drops the lens trailed 6.5 to 8.8 m over the kart and it fell out of the frame's foot,
      // gone for up to 0.9 s a drop): the road under the kart is followed on its own, fed its rate of climb so a slope
      // costs no lag, and the kart's height over the road (a hop, a jump, the Claw) softly and only 0.6 of it; the lens
      // is held a metre over the road under it and on a leash to the kart; the aim tips down a slope ahead (half of
      // it) and up a climb (a quarter); and last, whatever the springs did, the kart and its rider are kept in the
      // frame: their foot over 0.84 of the screen's height (on a phone held upright, over the touch buttons) and their
      // top under 0.12
      var CAM = { yaw: 0, yv: 0, hy: 0, g: 0, gv: 0, a: 0, av: 0, p: 0, pv: 0, over: 0, lag: 0, side: 0, roll: 0, init: false, cut: -1, foot: 0.84, footT: 0, shake: 0, shT: 0, orbit: 0, near: 0, fog: null }, CV = new THREE.Vector3();
      var CAMR = { air: 0.6, floor: 1.0, low: 1.2, high: 2.5, down: 0.5, up: 0.25, look: 8, foot: 0.84, top: 0.12 };
      var BOX = (function () { var x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (var i = 0; i < TN; i++) { x0 = Math.min(x0, TR.px[i]); x1 = Math.max(x1, TR.px[i]); z0 = Math.min(z0, TR.pz[i]); z1 = Math.max(z1, TR.pz[i]); } return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0 + 2 * TR.wall, h: z1 - z0 + 2 * TR.wall }; })();
      function kartFov() { var across = 2 * Math.atan(Math.tan(30 * PI / 180) / Math.max(0.2, camera.aspect)) * 180 / PI; return clamp(Math.max(68, across), 68, 92); }
      function setFov(f, lam, dt) { var nf = lam ? damp(camera.fov, f, lam, dt) : f; if (Math.abs(camera.fov - nf) > 0.02) { camera.fov = nf; camera.updateProjectionMatrix(); } }
      // where along the road a kart is drawn (between its last two steps)
      function drawnD(k, alpha) { return k.pgd + SIM.relD(k.gd, k.pgd) * alpha; }
      function kartAt(n, alpha, out) { var k = SIM.karts[n]; return out.set(k.px + (k.x - k.px) * alpha, k.pg + (k.ground - k.pg) * alpha + k.py + (k.y - k.py) * alpha, k.pz + (k.z - k.pz) * alpha); }
      // the road's height at d along it (on its centre line), read between the samples
      function roadY(d) { d = ((d % TR.L) + TR.L) % TR.L; var f = d / TR.ds, i0 = Math.floor(f) % TR.n, i1 = (i0 + 1) % TR.n; return TR.py[i0] + (TR.py[i1] - TR.py[i0]) * (f - Math.floor(f)); }
      // a critically damped spring, stepped (in pieces, on a slow frame)
      // (tv: the rate the target itself moves at, if known, so a steady climb is followed with no lag at all)
      function spring(o, key, vkey, target, w, dt, angle, tv) {
        var nS = Math.max(1, Math.ceil(dt * w / 0.25)), h = dt / nS; tv = tv || 0;
        for (var s = 0; s < nS; s++) { var d = angle ? wrapPi(target - o[key]) : target - o[key]; o[vkey] += (w * w * d + 2 * w * (tv - o[vkey])) * h; o[key] += o[vkey] * h; target += tv * h; }
      }
      // a kart's box, its eight corners in its own frame (the API's 1.3 m by 2.4 kart and its racer's head, a little
      // over: measured from its meshes it cost a phone a long frame, and a racer is that size whoever it is), and the
      // kart's matrix as drawn this frame, left in CBM
      var CBV = new THREE.Vector3(), CBM = new THREE.Matrix4(), CBOX = [];
      for (var cbi = 0; cbi < 8; cbi++) CBOX.push(new THREE.Vector3(cbi & 1 ? 0.8 : -0.8, cbi & 2 ? 1.65 : -0.08, cbi & 4 ? 1.15 : -1.15));
      function camBox(o) { o.updateMatrix(); if (o.parent) CBM.multiplyMatrices(o.parent.matrixWorld, o.matrix); else CBM.copy(o.matrix); return CBOX; }
      // where the touch kit's buttons begin (a fraction of the screen's height), for the frame's foot on a phone
      function touchTop() {
        var top = 1;
        root.querySelectorAll('.tpad button').forEach(function (b) { var r = b.getBoundingClientRect(); if (r.width > 2 && r.height > 2 && getComputedStyle(b).display !== 'none') top = Math.min(top, r.top / Math.max(1, innerHeight)); });
        return top;
      }
      function stepCam(dt, alpha) {
        var C = RS.film, n = C && C.k != null ? clamp(Math.round(C.k), 0, 7) : RS.focus, k = SIM.karts[n];
        camera.up.set(0, 1, 0);
        // (from high above the whole circuit the world's fog would be all there is to see: pushed back for the shot)
        var high = !!(C && C.mode === 'overhead');
        // (and the near plane pushed out with it: from 400 m up, the road and the ground under it 7 cm apart would
        // fight for the same depth)
        if (high !== !!CAM.near) { if (high) { CAM.near = camera.near; camera.near = 20; } else { camera.near = CAM.near; CAM.near = 0; } camera.updateProjectionMatrix(); }
        if (scene.fog && high !== !!CAM.fog) { if (high) { CAM.fog = [scene.fog.near, scene.fog.far]; scene.fog.near = 2000; scene.fog.far = 6000; } else { scene.fog.near = CAM.fog[0]; scene.fog.far = CAM.fog[1]; CAM.fog = null; } }
        if (high) {
          var span = Math.max(BOX.w / Math.max(0.5, camera.aspect), BOX.h), Hh = span / (2 * Math.tan((C.fov || 46) * PI / 360)) * 1.02;
          camera.position.set(BOX.cx, Hh * 0.94, BOX.cz + Hh * 0.34); camera.lookAt(BOX.cx, 0, BOX.cz + Hh * 0.02); setFov(C.fov || 46); return;
        }
        if (C && C.mode === 'free') { camera.position.fromArray(C.at); camera.lookAt(C.look[0], C.look[1], C.look[2]); setFov(C.fov || 60); return; }
        if (C && C.mode === 'grid') {
          var g0 = SIM.gridSlot(0), gN = SIM.gridSlot(7), a = pointAt(g0.d + 14, 0, C.height || 2.4), b = pointAt((g0.d + gN.d) / 2, 0, 0.6);
          camera.position.copy(a); camera.lookAt(b); setFov(C.fov || 52); return;
        }
        if (RS.pod) {
          // the podium, from in front, drifting a little side to side
          // (back far enough that the three blocks, 9 m across, fit a phone held upright too)
          frameAt(PD, F0); var sw = Math.sin(RS.podT * 0.35) * 3.2, c0 = pointAt(PD, 0, 1.5, TV), hf = Math.atan(Math.tan(26 * PI / 180) * camera.aspect), back = Math.max(11.5, 5.6 / Math.tan(hf));
          camera.position.set(c0.x + F0.tan.x * back + F0.right.x * sw, c0.y + 2.1 + back * 0.06, c0.z + F0.tan.z * back + F0.right.z * sw); camera.lookAt(c0.x, c0.y + 0.4, c0.z); setFov(52, 3, dt); CAM.init = false; return;
        }
        kartAt(n, alpha, CV);
        var h = k.ph + wrapPi(k.h - k.ph) * alpha, ground = k.ground;
        if (state === 'flyover' && !C) { flyCam(h, dt); return; }
        if (state === 'title' && !C) {
          // the start screen: your racer, close, three-quarters from the front and swaying a little round it, the grid
          // behind; aimed low, so the racer stands in the top half and the card has the bottom
          CAM.orbit += dt * 0.35;
          var tall = camera.aspect < 1, hf = h + 0.85 + Math.sin(CAM.orbit) * 0.3, dd = tall ? 6.4 : 4.6;
          camera.position.set(CV.x + Math.sin(hf) * dd, ground + (tall ? 2.0 : 1.55), CV.z + Math.cos(hf) * dd);
          camera.lookAt(CV.x, ground + (tall ? -0.55 : 0.0), CV.z); setFov(tall ? 52 : 40, 4, dt); CAM.init = false; return;
        }
        if (state === 'finish' && !C) {
          // home: the camera comes round to your front, slowly
          if (!CAM.init) { CAM.orbit = h + PI * 0.75; CAM.init = true; }
          CAM.orbit += dt * 0.35;
          camera.position.set(CV.x + Math.sin(CAM.orbit) * 6.5, ground + 2.1, CV.z + Math.cos(CAM.orbit) * 6.5); camera.lookAt(CV.x, ground + 0.8, CV.z); setFov(60, 3, dt); return;
        }
        if (C && (C.mode === 'side' || C.mode === 'front')) {
          var fx0 = Math.sin(h), fz0 = Math.cos(h), side = C.mode === 'side' ? (C.side || 5) : 0, ahead = C.mode === 'front' ? (C.distance || 7) : (C.ahead || 0);
          camera.position.set(CV.x + fx0 * ahead - fz0 * side, CV.y + (C.height || 1.4), CV.z + fz0 * ahead + fx0 * side);
          camera.lookAt(CV.x + fx0 * (C.look || 0), CV.y + 0.7, CV.z + fz0 * (C.look || 0)); setFov(C.fov || 50, 0, dt); return;
        }
        var upright = camera.aspect < 1, D = C && C.distance ? C.distance : upright ? 6.2 : 5.2, H = C && C.height ? C.height : upright ? 2.3 : 1.9;
        // (the picture's heading between the last two steps: from its own last one, 7 Oct; it was the heading's, so a
        // drift's slip came out alpha times itself and the camera shook on an uneven frame or a 120 Hz screen)
        var yaw = k.pyaw + wrapPi(k.yaw - k.pyaw) * alpha, slip = wrapPi(yaw - h);
        // (and a lead of 0.06 s of its turn: 7 Oct, the kart turns harder, and the spring at 9 trailed it as if it slid)
        var want = h + 0.3 * slip + (k.dDir ? -k.dDir * 5 * KART_D2R : 0) + 0.06 * (k.w || 0);
        // the road under the kart, and the kart's height over it (a hop, a jump, a ramp, the Claw)
        var gK = k.pg + (k.ground - k.pg) * alpha, aK = CV.y - gK, p0 = Math.atan2(1.0 - H, D + 6);
        var kd = drawnD(k, alpha), ti = k.i >= 0 ? k.i : 0, along = Math.cos(h - Math.atan2(TR.tx[ti], TR.tz[ti])), gv = (roadY(kd + 1) - roadY(kd - 1)) / 2 * k.v * along;
        var sl = Math.atan2(roadY(kd + CAMR.look) - roadY(kd), CAMR.look), pw = p0 + CAMR.down * Math.min(0, sl) + CAMR.up * Math.max(0, sl);
        // (the Claw sets the kart down well back down the road: a cut, not a swoop of 15 to 35 m)
        if (CAM.cut === n) { CAM.init = false; CAM.cut = -1; }
        if (!CAM.init) { CAM.yaw = want; CAM.yv = 0; CAM.g = gK; CAM.gv = 0; CAM.a = aK; CAM.av = 0; CAM.p = pw; CAM.pv = 0; CAM.side = 0; CAM.init = true; }
        spring(CAM, 'yaw', 'yv', want, 12, dt, true);
        spring(CAM, 'g', 'gv', gK, 10, dt, false, gv);
        spring(CAM, 'a', 'av', aK, 6, dt, false);
        spring(CAM, 'p', 'pv', pw, 8, dt, false);
        var camY = CAM.g + CAMR.air * CAM.a + H;
        // (a metre over the road under the lens at least, and never far from the kart: 1.2 m under it to 2.5 m over
        // its usual height)
        camY = Math.max(camY, roadY(kd - D) + CAMR.floor);
        camY = clamp(camY, CV.y - CAMR.low, CV.y + H + CAMR.high);
        CAM.hy = camY - H; CAM.over = camY - roadY(kd - D); CAM.lag = camY - gK - H;
        CAM.side = damp(CAM.side, k.dDir ? -k.dDir * 0.5 : 0, 5, dt);
        CAM.roll = damp(CAM.roll, k.dDir ? k.dDir * 2 * KART_D2R : 0, 5, dt);
        var fx = Math.sin(CAM.yaw), fz = Math.cos(CAM.yaw), rx = Math.cos(CAM.yaw), rz = -Math.sin(CAM.yaw);
        if (RS.back) {
          // looking back (7 Oct: square in front of the kart the racer looked straight into the lens, and the turn of
          // the head was lost): over the racer's right shoulder, a little ahead of it and out to the side, looking
          // back down the road past its left, the way its head turns; the racer in the near corner, turned away
          // toward the karts behind
          var LB = RS.backCam || { ahead: 2.4, side: 1.9, up: 1.5, back: 10, across: 1.6, at: 0.75 };
          camera.position.set(CV.x + fx * LB.ahead - rx * LB.side, CAM.hy + LB.up, CV.z + fz * LB.ahead - rz * LB.side);
          camera.lookAt(CV.x - fx * LB.back + rx * LB.across, CAM.hy + LB.at, CV.z - fz * LB.back + rz * LB.across); setFov(kartFov(), 0, dt); return;
        }
        camera.position.set(CV.x - fx * D + rx * CAM.side, camY, CV.z - fz * D + rz * CAM.side);
        // the frame held: the kart's box (its foot and its rider's head, its near and far ends) between the foot and
        // the top of the screen, the aim tipped only as far as that needs (on a phone held upright the foot is the
        // touch buttons', looked up twice a second)
        if ((CAM.footT -= dt) <= 0) { CAM.footT = 0.5; CAM.foot = upright ? clamp(touchTop() - 0.03, 0.6, CAMR.foot) : CAMR.foot; }
        // (the box's eight corners carried by the kart as it is drawn this frame: its slope, a hop, a hit's roll or
        // flip and lift; each one's angle over the lens's level, along the way it looks, is where it lands on the
        // screen for a given aim: y = 0.5 - tan(angle - pitch) / (2 tan(half the field)))
        var lx = CV.x + fx * 6, lz = CV.z + fz * 6, cx = camera.position.x, cz = camera.position.z, hl = Math.hypot(lx - cx, lz - cz) || 1, ux = (lx - cx) / hl, uz = (lz - cz) / hl;
        var th = Math.tan(camera.fov * PI / 360), aF = Math.atan((CAM.foot - 0.5) * 2 * th), aT = Math.atan((0.5 - CAMR.top) * 2 * th), pHi = 9, pLo = -9;
        var cb = camBox(ENT[n].object);
        for (var c = 0; c < 8; c++) {
          CBV.copy(cb[c]).applyMatrix4(CBM);
          var th0 = Math.atan2(CBV.y - camY, Math.max(0.3, (CBV.x - cx) * ux + (CBV.z - cz) * uz));
          pHi = Math.min(pHi, th0 + aF); pLo = Math.max(pLo, th0 - aT);
        }
        var pitch = CAM.p;
        if (pLo > pHi) pitch = (pLo + pHi) / 2;
        else if (pitch > pHi || pitch < pLo) { pitch = clamp(pitch, pLo, pHi); CAM.pv = 0; }
        CAM.p = pitch;
        // (the shake: a rumble, two smooth waves across and up, fading, the lens and its aim moved together so the
        // picture shifts a little and never snaps; until 7 Oct a fresh random offset every frame with the aim held, up
        // to 20 px a frame for a third of a second at every bump, landing and hazard near you: the stutter probe found
        // it 0.3 s after the crates, where the meteors and the pack are, the owner's "suddenly and unexplainably
        // stutter". None at all for a person who asks the page for less motion)
        var shx = 0, shy = 0;
        if (CAM.shake > 0) {
          if (!RM) { CAM.shT += dt; var sa = Math.min(CAM.shake, 0.25) * 0.55, st2 = CAM.shT * 2 * PI; shx = sa * (Math.sin(st2 * 8.3) * 0.7 + Math.sin(st2 * 13.1 + 1.7) * 0.3); shy = sa * (Math.sin(st2 * 10.7 + 0.6) * 0.7 + Math.sin(st2 * 15.9 + 2.9) * 0.3); }
          CAM.shake = Math.max(0, CAM.shake - dt * 0.5);
        }
        camera.position.x += rx * shx; camera.position.z += rz * shx; camera.position.y += shy;
        camera.lookAt(lx + rx * shx * 0.6, camY + Math.tan(pitch) * hl + shy * 0.6, lz + rz * shx * 0.6);
        if (CAM.roll) camera.rotateZ(CAM.roll);
        // (the speed in the lens: the field opens with the speed and more on a boost. 7 Oct, round 3, the owner's
        // "karting is slightly too slow": from half the top speed, not 0.6, and 7 degrees by the top, not 4, so the
        // road streams out of the edges of the screen faster as well as the meter reading more)
        var boost = clamp((k.bm - 1) / 0.2, 0, 1), base = kartFov(), wantF = (C && C.fov) || base + 7 * smooth(0.5, 1, Math.abs(k.v) / k.top) + 7 * boost;
        setFov(wantF, wantF > camera.fov ? 8 : 2.5, dt);
      }

      // the flyover (the playtest, 7 Oct: a clean win's session came in under its 2:35 floor; about 4 s before the count
      // brings it to 2:37 to 2:45): FLY.T seconds down the last FLY.dist m of the lap to the grid, FLY.h m up over the
      // road, the path the road's own averaged over 48 m (no swerve through a chicane), looking down the road ahead;
      // fast to begin with, slowing as it comes down, and at rest where the race's camera stands behind your kart for
      // the count, so the count begins without a cut. The karts wait on the grid; nothing of the race runs
      var FLY = { T: 4, dist: 150, h: 13, look: 40 }, FLP = new THREE.Vector3(), FLL = new THREE.Vector3(), FLQ = new THREE.Vector3();
      function flyCam(h, dt) {
        var k = SIM.karts[0], u = clamp(RS.fly / FLY.T, 0, 1), e = u + u * u - u * u * u;
        // (where the race's camera will be, and what it will look at: chase, behind your kart, at rest)
        var upright = camera.aspect < 1, D = upright ? 6.2 : 5.2, H = upright ? 2.3 : 1.9, fx = Math.sin(h), fz = Math.cos(h);
        var d = k.d - D - FLY.dist * (1 - e), lift = FLY.h + (H - FLY.h) * smooth(0.3, 1, u), q;
        FLP.set(0, 0, 0); FLL.set(0, 0, 0);
        for (q = -2; q <= 2; q++) { FLP.add(pointAt(d + q * 12, 0, 0, FLQ)); FLL.add(pointAt(d + FLY.look + q * 12, 0, 0, FLQ)); }
        FLP.multiplyScalar(0.2); FLP.y += lift; FLL.multiplyScalar(0.2); FLL.y += 1;
        var w = smooth(0.62, 1, u);
        FLP.lerp(FLQ.set(CV.x - fx * D, CV.y + H, CV.z - fz * D), w);
        FLL.lerp(FLQ.set(CV.x + fx * 6, CV.y + 1.0, CV.z + fz * 6), w);
        camera.position.copy(FLP); camera.lookAt(FLL);
        setFov(kartFov() + 8 * (1 - e), 0, dt);
      }

      /* -------- sounds: the countdown, a tier reached, a turbo, a wall, the launch, a coin, the claw -- */
      function sound(kind, tier) {
        if (demo || !audio || KDIAG.nosfx) return;
        // (the score steps back for the big ones, as the runtime's own sounds make it: the platform's duck, in dB)
        if (KDUCK[kind] && audio.music) audio.music.duck(KDUCK[kind], KDUCK[kind] > 3 ? 0.25 : 0.12);
        if (kind === 'tier') tone(520 + tier * 180, 0, 0.12, 'triangle', 0.08, 700 + tier * 220);
        else if (kind === 'boost') { noiseBand(0.5, 0.35, 600, 3200); tone(180, 0, 0.35, 'sawtooth', 0.06, 420); }
        else if (kind === 'bonk') { noise(0.25, 0.5); tone(110, 0, 0.18, 'sine', 0.2, 60); }
        else if (kind === 'scrape') noiseBand(0.22, 0.18, 3400, 1800);
        else if (kind === 'glance') noiseBand(0.12, 0.1, 4200, 2600);
        else if (kind === 'bump') noiseBand(0.12, 0.2, 900, 300);
        else if (kind === 'launch') { [392, 523, 784, 1046].forEach(function (f, i) { tone(f, i * 0.05, 0.25, 'triangle', 0.1); }); noiseBand(0.7, 0.3, 500, 4000); }
        else if (kind === 'flood') { for (var i = 0; i < 4; i++) tone(70 + Math.random() * 30, i * 0.12, 0.1, 'sawtooth', 0.12, 40); noise(0.4, 0.25); }
        else if (kind === 'pad') { tone(660, 0, 0.18, 'triangle', 0.1, 1320); noiseBand(0.35, 0.25, 900, 4200); }
        else if (kind === 'trick') { noiseBand(0.3, 0.25, 2600, 900); tone(880, 0, 0.12, 'square', 0.05, 1320); }
        else if (kind === 'slip') noiseBand(0.6, 0.22, 400, 2600);
        else if (kind === 'claw') { tone(240, 0, 0.6, 'sawtooth', 0.05, 380); noiseBand(0.6, 0.12, 1200, 2200); }
        else if (kind === 'splash') { noise(0.5, 0.45); noiseBand(0.4, 0.3, 1800, 500); }
        // the items: a crate popped, the roulette's ticks and its landing, each item its own, a hit, a block, the
        // Whale's horn and its slam
        else if (kind === 'crate') { noiseBand(0.18, 0.2, 2400, 5200); tone(880, 0, 0.1, 'triangle', 0.06, 1760); }
        else if (kind === 'tick') tone(1500 + Math.random() * 300, 0, 0.03, 'square', 0.025);
        else if (kind === 'got') { tone(784, 0, 0.09, 'triangle', 0.1); tone(1175, 0.08, 0.16, 'triangle', 0.1); }
        else if (kind === 'bag') [1318, 1568, 1976].forEach(function (f, i) { tone(f, i * 0.06, 0.12, 'square', 0.05); });
        else if (kind === 'rug' || kind === 'drag') noiseBand(0.22, 0.2, 700, 260);
        else if (kind === 'yank') { noiseBand(0.35, 0.35, 600, 3600); tone(300, 0, 0.3, 'sawtooth', 0.06, 90); }
        else if (kind === 'wallet') { [1568, 2093, 2637].forEach(function (f, i) { tone(f, i * 0.05, 0.3, 'sine', 0.05); }); noiseBand(0.4, 0.1, 6000, 3000); }
        else if (kind === 'block') { noiseBand(0.3, 0.35, 5200, 2200); tone(2637, 0, 0.2, 'triangle', 0.06, 1318); }
        else if (kind === 'laser') { tone(1800, 0, 0.32, 'sawtooth', 0.07, 220); tone(900, 0.02, 0.3, 'square', 0.04, 160); }
        else if (kind === 'pump') { noiseBand(0.12, 0.3, 1800, 900); noiseBand(0.12, 0.3, 1800, 900); tone(220, 0.12, 0.5, 'sawtooth', 0.07, 520); noiseBand(0.7, 0.3, 500, 3600); }
        else if (kind === 'wow') { tone(660, 0, 0.3, 'triangle', 0.08, 1320); noiseBand(0.5, 0.25, 600, 3800); }
        else if (kind === 'fud') { tone(110, 0, 0.6, 'sawtooth', 0.06, 70); noise(0.6, 0.25); }
        else if (kind === 'diamond') [1046, 1318, 1568, 2093, 2637].forEach(function (f, i) { tone(f, i * 0.05, 0.4, 'sine', 0.05); });
        else if (kind === 'moon') { noiseBand(1.6, 0.4, 300, 2400); tone(90, 0, 1.2, 'sawtooth', 0.08, 240); }
        else if (kind === 'whale') { tone(70, 0, 0.8, 'sawtooth', 0.12, 55); }
        else if (kind === 'horn') { tone(73, 0, 1.4, 'sawtooth', 0.14, 69); tone(110, 0, 1.4, 'sawtooth', 0.08, 104); }
        else if (kind === 'slam') { noise(1.0, 0.9); tone(60, 0, 0.9, 'sine', 0.35, 30); noiseBand(1.2, 0.4, 2000, 300); }
        else if (kind === 'hit') { noise(0.3, 0.5); tone(240, 0, 0.35, 'square', 0.08, 80); }
        // a hop off the springs, and the kart back down (a thump made of a falling sine and a puff of low noise:
        // the owner's rule, no recorded impacts)
        else if (kind === 'hop') { tone(260, 0, 0.11, 'sine', 0.07, 520); noiseBand(0.08, 0.05, 1800, 3600); }
        else if (kind === 'land') { tone(120 + tier * 40, 0, 0.12, 'sine', 0.16, 55); noiseBand(0.1, 0.1, 900, 240); }
        // the chaos (7 Oct), every one made here as the rest are: a kart's BONK into another (a falling sine with a
        // knock of noise, higher and brighter the harder), a bash (a heavy thump with a twang over it), a bonk heard
        // from off, an angry honk (two notes, the heavier the lower), a GM knocked loose, the charge jump (a rising
        // whoop), a pop off a bump, onto a rail (a clank) and off it (a ping), the fall (a long whistle down), the
        // hazards' warnings (a candle's creak, a crossing's chime, a meteor's whistle) and their blows (a thud, a
        // rumble, a boom)
        else if (kind === 'bonk2') { var hb = tier || 0.5; tone(420 + 260 * hb, 0, 0.14, 'sine', 0.1 + 0.08 * hb, 150); tone(840 + 300 * hb, 0, 0.06, 'triangle', 0.04); noiseBand(0.08, 0.12 + 0.12 * hb, 1600, 420); }
        else if (kind === 'bash') { tone(150, 0, 0.24, 'sine', 0.26, 55); noise(0.2, 0.45); tone(330, 0, 0.16, 'square', 0.06, 120); tone(660, 0.05, 0.22, 'triangle', 0.06, 990); }
        else if (kind === 'bonkFar') tone(460, 0, 0.1, 'sine', 0.05, 170);
        else if (kind === 'honk') { var hf = 470 / (tier || 1); [0, 0.17].forEach(function (d0, i) { tone(hf, d0, i ? 0.22 : 0.12, 'square', 0.05); tone(hf * 0.8, d0, i ? 0.22 : 0.12, 'sawtooth', 0.035); }); }
        else if (kind === 'snatch') { tone(1318, 0, 0.07, 'square', 0.05); tone(988, 0.06, 0.12, 'square', 0.05); tone(1568, 0.12, 0.1, 'triangle', 0.04); }
        else if (kind === 'charge') tone(330, 0, 0.12, 'triangle', 0.04, 520);
        else if (kind === 'cjump') { tone(240 + 200 * (tier || 0), 0, 0.22, 'sine', 0.1, 820 + 420 * (tier || 0)); noiseBand(0.28, 0.16, 700, 3400); }
        else if (kind === 'pop') { tone(300, 0, 0.1, 'sine', 0.07, 640); noiseBand(0.1, 0.08, 900, 2400); }
        else if (kind === 'rail') { noiseBand(0.12, 0.3, 5400, 2400); tone(1568, 0, 0.12, 'square', 0.035, 1318); }
        else if (kind === 'railOff') { tone(660, 0, 0.14, 'triangle', 0.07, 1320); noiseBand(0.16, 0.14, 2800, 6200); }
        else if (kind === 'fall') tone(900, 0, 0.75, 'triangle', 0.08, 130);
        else if (kind === 'creak') { tone(92, 0, 1.2, 'sawtooth', 0.045, 66); noiseBand(1.2, 0.07, 320, 160); }
        else if (kind === 'thud') { noise(0.6, 0.75); tone(72, 0, 0.5, 'sine', 0.3, 34); }
        else if (kind === 'alarm') [1046, 784, 1046].forEach(function (f, i) { tone(f, i * 0.18, 0.12, 'square', 0.035); });
        else if (kind === 'rumble') noiseBand(2.6, 0.14, 220, 110);
        else if (kind === 'whistle') tone(2300, 0, 1.55, 'sine', 0.035, 320);
        else if (kind === 'boom') { noise(1.0, 0.85); tone(52, 0, 0.9, 'sine', 0.34, 28); noiseBand(1.0, 0.32, 1600, 200); }
      }
      // how far the score steps back for each (dB): the hits and the slams most, a boost a breath
      var KDUCK = { hit: 4, bonk: 3, slam: 6, launch: 3, boost: 1.5, pad: 1.5, trick: 1.5, laser: 2, pump: 2, wow: 2, moon: 3, whale: 3, horn: 2, yank: 2, block: 2, splash: 3, claw: 1.5, bash: 3, boom: 4, thud: 3, fall: 2 };

      /* -------- the karts' engines, the drift, the crowd: what a race sounds like under the score (7 Oct) --
       * Engines: yours and the two karts nearest it, each a single-cylinder two-stroke, the note it fires at its own
       * revs (a firing a turn: 2,000 rpm idling is 33 Hz, 13,000 at the top 217), a sawtooth with a pulse an octave up
       * and a ring a twelfth up, chopped at the firing rate (the putt of a single), through a soft clipper and a
       * low-pass that opens with the revs and the gas, with a hiss of exhaust. The revs follow the speed (a
       * kart's clutch: 2,000 at a standstill, about 11,500 at its top), climb on a boost and in the air, sag coasting, and
       * fall away on a hit; the two nearest are placed where they are (panned, fading out by 70 m, their pitch bent
       * a little as they close or drop back). The drift: the tyres' scrub, a band of noise that rises a little with
       * each tier, yours only. The crowd: a murmur at the start line (three bands of noise, each breathing on its
       * own), loud on the grid, cheering at GO, as you finish a lap, at the line and on the podium. All of it into
       * the runtime's own buses (the engines', the world's), under its master limiter; the levels below, measured
       * against the score over 30 s of To The Moon (7 Oct, RMS at the master): the score about -25 dB, the engines
       * -32 (seven under it), the effects' loudest -29, the crowd -42 and -28 cheering; the master's peaks -11 dBFS
       * before the limiter, which hardly works. In the demo, the results, a pause and a sped-up race, silence -- */
      var MIX = { engine: 0.8, rival: 0.5, drift: 0.2, crowd: 0.1, cheer: 0.3 };
      var KA = null;
      function kartEngine(ac, out) {
        var bus = ac.createGain(); bus.gain.value = 0;
        var pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
        if (pan) { bus.connect(pan); pan.connect(out); } else bus.connect(out);
        var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2.4; lp.frequency.value = 900;
        var hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 60; hp.Q.value = 0.7;
        var sh = ac.createWaveShaper(), cv = new Float32Array(512);
        for (var i = 0; i < 512; i++) { var x = i / 256 - 1; cv[i] = Math.tanh(x * 3) / Math.tanh(3); }
        sh.curve = cv;
        var pre = ac.createGain(); pre.gain.value = 0.5; pre.connect(sh); sh.connect(lp); lp.connect(hp); hp.connect(bus);
        // the chop: the mix pulsed at the firing rate
        var am = ac.createGain(); am.gain.value = 0.6; am.connect(pre);
        var chop = ac.createOscillator(); chop.type = 'sine'; var depth = ac.createGain(); depth.gain.value = 0.4; chop.connect(depth); depth.connect(am.gain);
        var t0 = ac.currentTime;
        function osc(type, g0) { var o = ac.createOscillator(); o.type = type; var g = ac.createGain(); g.gain.value = g0; o.connect(g); g.connect(am); o.start(t0); return o; }
        var saw = osc('sawtooth', 0.6), pulse = osc('square', 0.2), ring = osc('triangle', 0.07);
        chop.start(t0);
        var nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), nd = nb.getChannelData(0);
        for (i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
        var hiss = ac.createBufferSource(); hiss.buffer = nb; hiss.loop = true;
        var bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1; bp.frequency.value = 900;
        var ng = ac.createGain(); ng.gain.value = 0.08; hiss.connect(bp); bp.connect(ng); ng.connect(am); hiss.start(t0);
        var st = { rpm: 2000, thr: 0, level: 0 };
        return {
          st: st,
          set: function (rpm, thr) {
            var now = ac.currentTime, f = rpm / 60;
            st.rpm = rpm; st.thr = thr;
            saw.frequency.setTargetAtTime(f, now, 0.02); pulse.frequency.setTargetAtTime(f * 2, now, 0.02); ring.frequency.setTargetAtTime(f * 3, now, 0.02); chop.frequency.setTargetAtTime(f, now, 0.02);
            lp.frequency.setTargetAtTime(700 + 4300 * clamp((rpm - 2000) / 11000, 0, 1) * (0.55 + 0.45 * thr), now, 0.03);
            bp.frequency.setTargetAtTime(Math.min(6000, f * 7), now, 0.03);
            ng.gain.setTargetAtTime(0.05 + 0.12 * thr, now, 0.05);
            depth.gain.setTargetAtTime(0.5 - 0.25 * clamp((rpm - 2000) / 11000, 0, 1), now, 0.05);
          },
          mix: function (level, p) {
            var now = ac.currentTime; st.level = level;
            bus.gain.setTargetAtTime(clamp(level, 0, 1.2) * 0.3, now, 0.05);
            if (pan) pan.pan.setTargetAtTime(clamp(p || 0, -1, 1), now, 0.06);
          },
        };
      }
      function kartAudio() {
        if (KA || !audio) return KA;
        var ac = audio.ctx;
        KA = { voices: [kartEngine(ac, audio.engines), kartEngine(ac, audio.engines), kartEngine(ac, audio.engines)], who: [-1, -1, -1], rpm: new Float64Array(ENT.length).fill(2000),
          rev: new Float64Array(ENT.length), drop: new Float64Array(ENT.length), cheer: 0, cheerK: 0, crowdNow: 0, driftNow: 0 };
        KA.rpm.fill(2000);
        // the drift: the tyres' scrub (band-passed noise), and a faint squeal over it
        var nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), nd = nb.getChannelData(0), i;
        for (i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
        var src = ac.createBufferSource(); src.buffer = nb; src.loop = true;
        var dbp = ac.createBiquadFilter(); dbp.type = 'bandpass'; dbp.Q.value = 2.2; dbp.frequency.value = 1300;
        var dg = ac.createGain(); dg.gain.value = 0; src.connect(dbp); dbp.connect(dg); dg.connect(audio.fx);
        var sq = ac.createOscillator(); sq.type = 'triangle'; sq.frequency.value = 1100; var sqg = ac.createGain(); sqg.gain.value = 0.18; sq.connect(sqg); sqg.connect(dg);
        src.start(); sq.start();
        KA.drift = { g: dg, bp: dbp, sq: sq };
        // a grind: the same noise, high and narrow, and a ring over it (yours, on a rail)
        var gbp = ac.createBiquadFilter(); gbp.type = 'bandpass'; gbp.Q.value = 5; gbp.frequency.value = 3200;
        var gg = ac.createGain(); gg.gain.value = 0; src.connect(gbp); gbp.connect(gg); gg.connect(audio.fx);
        var gr = ac.createOscillator(); gr.type = 'triangle'; gr.frequency.value = 1760; var grg = ac.createGain(); grg.gain.value = 0.08; gr.connect(grg); grg.connect(gg); gr.start();
        KA.grind = { g: gg, bp: gbp, now: 0 };
        // the crowd at the line: three bands of the same noise, each breathing on its own
        var cs = ac.createBufferSource(), cb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), cd = cb.getChannelData(0), last = 0;
        for (i = 0; i < cd.length; i++) { last = last * 0.6 + (Math.random() * 2 - 1) * 0.4; cd[i] = last * 2.2; }
        cs.buffer = cb; cs.loop = true;
        var cg = ac.createGain(); cg.gain.value = 0;
        var cpan = ac.createStereoPanner ? ac.createStereoPanner() : null;
        if (cpan) { cg.connect(cpan); cpan.connect(audio.world); } else cg.connect(audio.world);
        KA.bands = [[420, 1.1], [1050, 1.3], [2300, 1.6]].map(function (b) {
          var f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = b[0]; f.Q.value = b[1];
          var g = ac.createGain(); g.gain.value = 0.3; cs.connect(f); f.connect(g); g.connect(cg);
          return { f: f, g: g, base: b[0], v: 0.3 };
        });
        cs.start();
        KA.crowd = { g: cg, pan: cpan };
        return KA;
      }
      // what a kart's engine is doing: revs (with the gas, the speed, a boost, the air, a drift, a hit) and the gas
      function revsOf(n, dt) {
        var k = SIM.karts[n], top = k.top || RU.top, idle = 2000, tgt, thr, lam = 5;
        if (SIM.phase === 'grid') { var gas = !!(k.inp.gas || (n === 0 && (KIN.up || PAD.gas))); tgt = gas ? 9200 + 900 * Math.sin(t * 9 + n) : idle + 140 * Math.sin(t * 5 + n); thr = gas ? 1 : 0.1; lam = gas ? 7 : 4; }
        else {
          // (past the top speed too: the GM in your pocket, the slipstream and a boost each rev it on)
          var sp = clamp(Math.abs(k.v) / top, 0, 1.45);
          thr = k.inp.gas || k.auto || n !== 0 ? 1 : 0.15;
          tgt = idle + 9500 * Math.pow(sp, 0.85) * (thr > 0.5 ? 1 : 0.9);
          if (k.bm > 1.01) tgt += 1300 * clamp((k.bm - 1) / 0.2, 0, 1);
          if (k.air) tgt += 1400;
          if (k.dDir) tgt += 450;
          if (KA.rev[n] > 0) { tgt += 1600; thr = 1; lam = 10; }
          if (KA.drop[n] > 0 || k.stun > 0 || k.hitT > 0 || k.rescue >= 0) { tgt = idle * 1.3; thr = 0; lam = 12; }
          if (k.fin && n !== 0) thr = 0.4;
        }
        KA.rpm[n] = damp(KA.rpm[n], revKnee(tgt), lam, dt);
        return thr;
      }
      // the top of the rev range: straight up to 11,000, then a soft knee to the 13,000 ceiling (11,000 + 2,000 tanh),
      // so a boost on top of the GM and the slipstream still revs it audibly (the playtest, 7 Oct: on a hard ceiling
      // the engine sat within 4% of 13,000 most of the race, and a boost could not lift it)
      function revKnee(r) { return r <= 11000 ? r : 11000 + 2000 * Math.tanh((r - 11000) / 2000); }
      // the events a race sounds out beyond sound(): a boost revs a kart, a hit drops it, a hop and a landing are
      // heard, the crowd cheers
      function audioEvent(ev) {
        if (!KA) return;
        var n = ev[1];
        if (ev[0] === 'boost' && typeof n === 'number') KA.rev[n] = 0.35;
        else if ((ev[0] === 'hit' || ev[0] === 'bonk' || ev[0] === 'slam') && typeof n === 'number' && KA.drop[n] != null) KA.drop[n] = 0.55;
        else if (ev[0] === 'hop' && n === 0) sound('hop');
        else if (ev[0] === 'land' && n === 0 && ev[2] > 0.25) sound('land', clamp(ev[2], 0, 1));
        else if (ev[0] === 'go') cheer(1);
        else if (ev[0] === 'lap' && n === 0) cheer(0.6);
        else if (ev[0] === 'finish' && n === 0) cheer(1);
      }
      function cheer(k) { if (KA) { KA.cheer = Math.max(KA.cheer, 1.6 + k); KA.cheerK = Math.max(KA.cheerK, k); } }
      function stepKartAudio(dt) {
        if (KDIAG.nosfx || !audio || (!KA && !kartAudio())) return;
        var silent = demo || state === 'results' || state === 'paused' || timeScale > 1, fN = RS.focus, me = SIM.karts[fN], v, q;
        for (q = 0; q < ENT.length; q++) { KA.rev[q] = Math.max(0, KA.rev[q] - dt); KA.drop[q] = Math.max(0, KA.drop[q] - dt); }
        var on = !silent && (state === 'title' || state === 'flyover' || state === 'countdown' || state === 'race' || state === 'finish' || state === 'podium');
        // the engines: yours, and the two nearest it (a voice keeps its kart while it stays among the three nearest)
        var thr0 = revsOf(fN, dt), near = [];
        for (q = 0; q < SIM.karts.length; q++) if (q !== fN && !SIM.karts[q].parked) near.push(q);
        near.sort(function (a, b) { return Math.hypot(SIM.karts[a].x - me.x, SIM.karts[a].z - me.z) - Math.hypot(SIM.karts[b].x - me.x, SIM.karts[b].z - me.z); });
        var keep = near.slice(0, 3), want = near.slice(0, 2);
        for (q = 1; q < 3; q++) if (KA.who[q] >= 0 && keep.indexOf(KA.who[q]) < 0) KA.who[q] = -1;
        want.forEach(function (n) { if (KA.who.indexOf(n) < 0) { var free = KA.who[1] < 0 ? 1 : KA.who[2] < 0 ? 2 : -1; if (free > 0) KA.who[free] = n; } });
        KA.who[0] = fN;
        var podium = state === 'podium' ? 0.35 : 1;
        KA.voices[0].set(KA.rpm[fN], thr0);
        KA.voices[0].mix(on && !me.parked ? MIX.engine * (0.55 + 0.45 * thr0) * podium : 0, 0);
        var rx = Math.cos(CAM.yaw), rz = -Math.sin(CAM.yaw);
        for (q = 1; q < 3; q++) {
          var n = KA.who[q], V = KA.voices[q];
          if (n < 0) { V.mix(0, 0); continue; }
          var k = SIM.karts[n], thr = revsOf(n, dt), dx = k.x - me.x, dz = k.z - me.z, dist = Math.hypot(dx, dz);
          // (how fast it closes on you: the two velocities along the line between)
          var closing = -((dx * Math.sin(k.h) * k.v + dz * Math.cos(k.h) * k.v) - (dx * Math.sin(me.h) * me.v + dz * Math.cos(me.h) * me.v)) / Math.max(1, dist);
          v = Math.pow(clamp(1 - dist / 70, 0, 1), 1.6);
          V.set(KA.rpm[n] * clamp((343 + (isFinite(closing) ? closing : 0)) / 343, 0.9, 1.1), thr);
          // (left of the camera is pan left: its left is +x across, rx/rz)
          V.mix(on ? MIX.rival * v * podium : 0, clamp(-(dx * rx + dz * rz) / 10, -0.85, 0.85));
        }
        // the drift: yours, on the ground
        var dr = on && state === 'race' && me.dDir && !me.air && me.y <= 0.01 ? 1 : 0, tg = ac0().currentTime;
        KA.driftNow = damp(KA.driftNow, dr * MIX.drift * (0.7 + 0.12 * me.tier) * clamp(Math.abs(me.v) / 12, 0, 1), dr ? 14 : 9, dt);
        KA.drift.g.gain.setTargetAtTime(KA.driftNow, tg, 0.03);
        KA.drift.bp.frequency.setTargetAtTime(1150 + 260 * me.tier + 40 * Math.sin(t * 13), tg, 0.05);
        KA.drift.sq.frequency.setTargetAtTime(980 + 140 * me.tier + 30 * Math.sin(t * 7), tg, 0.05);
        KA.grind.now = damp(KA.grind.now, on && state === 'race' && me.grind >= 0 ? 0.16 : 0, 14, dt);
        KA.grind.g.gain.setTargetAtTime(KA.grind.now, tg, 0.03); KA.grind.bp.frequency.setTargetAtTime(3000 + 600 * Math.sin(t * 17) + 30 * Math.abs(me.v), tg, 0.04);
        // the crowd: by how near you are to the line, and cheering
        var dd = Math.abs(SIM.relD(me.d, 0)), base = SIM.phase === 'grid' || state === 'podium' ? 1 : Math.pow(clamp(1 - dd / 90, 0, 1), 1.5);
        KA.cheer = Math.max(0, KA.cheer - dt); var ch = KA.cheer > 0 ? smooth(0, 0.6, KA.cheer) * KA.cheerK : 0;
        if (state === 'podium') ch = Math.max(ch, 0.7);
        var cl0 = on ? MIX.crowd * base + MIX.cheer * ch * Math.max(base, 0.35) : 0;
        KA.crowdNow = damp(KA.crowdNow, cl0, ch > 0 ? 10 : 3, dt);
        KA.crowd.g.gain.setTargetAtTime(KA.crowdNow, tg, 0.04);
        for (q = 0; q < 3; q++) {
          var B = KA.bands[q];
          B.v = clamp(B.v + (Math.random() - 0.5) * dt * 3, 0.15, 0.45);
          B.g.gain.setTargetAtTime(B.v * (q ? 1 + ch * 0.9 : 1), tg, 0.08);
          B.f.frequency.setTargetAtTime(B.base * (1 + ch * (q === 2 ? 0.35 : 0.15)), tg, 0.1);
        }
        if (KA.crowd.pan) KA.crowd.pan.pan.setTargetAtTime(clamp(SIM.relD(me.d, 0) / 120, -0.3, 0.3), tg, 0.2);
      }
      function ac0() { return audio.ctx; }

      /* -------- the race's course: the title, the countdown, the race, the finish, the podium, the results; and the demo -- */
      function nextSeed() { if (RS.nextSeed != null) { var s = RS.nextSeed; RS.nextSeed = null; return s; } return (runRandom() * 4294967296) >>> 0; }
      function setup(seed, count) {
        SIM.reset(seed); SIM.start(count);
        SIM.karts.forEach(function (k, n) { if (n && RS.solo) k.parked = true; });
        POSE.forEach(function (P) { P.wheels[0].on = P.wheels[1].on = false; P.sq = 0; P.trick = 0; P.spin = 0; });
        CLAWS.forEach(function (c) { if (c) c.g.visible = false; });
        if (ITEMS_ON) { ENT.forEach(function (e, n) { hideItems(n); }); CLOUDS.forEach(function (c) { c.t = -1; c.g.visible = false; }); BAGS.forEach(function (b) { b.t = -1; b.g.visible = false; }); if (IFX) IFX.reset(); SLOT.icon = null; }
        RS.lapStart = 0; RS.best = 0; RS.goT = 0; RS.lapBanner = 0; RS.endT = 0; RS.final = null; RS.podT = 0; RS.pod = null; RS.launchKind = ''; CAM.init = false; CAM.shake = 0;
        skipEl.style.display = 'none';
        player.alive = true; player.y = 0; player.vy = 0;
        poseKarts(1, 0);
      }
      var CONTROLS_K = '<div class="rules">' +
        // (each control a phrase that never breaks; the line breaks only between them)
        '<div><span class="kc"><kbd>W</kbd> or <kbd>&uarr;</kbd> gas</span> &nbsp; <span class="kc"><kbd>S</kbd> or <kbd>&darr;</kbd> brake, then reverse</span> &nbsp; <span class="kc"><kbd>A</kbd> <kbd>D</kbd> or <kbd>&larr;</kbd> <kbd>&rarr;</kbd> steer</span> &nbsp; <span class="kc"><kbd>Space</kbd> hop (hold it through a turn to drift)</span> &nbsp; ' + (ITEMS_ON ? '<span class="kc"><kbd>X</kbd> item (<kbd>E</kbd> throws it ahead)</span> &nbsp; ' : '') + '<span class="kc"><kbd>C</kbd> look back</span> &nbsp; <span class="kc"><kbd>P</kbd> pause</span></div>' +
        '<div>Hit the gas as the 1 lands for a Moon Launch. Drift to charge a boost: Green Candle, then Gold, then MOG. Let go of Space to fire it. Hold Space driving straight for a charge jump, over a break and onto a rail. Tail a kart to fill your slipstream.</div>' +
        '<div>' + laps + ' laps, ' + ENT.length + ' karts. Bump all you like: contact never ends your run. Hop sideways into a rival to bash it and knock a GM loose. Trick off any ramp, bump or rail for a boost; grab the GM for a little more top speed.' + (ITEMS_ON ? ' Drive through the Airdrop crates for an item; hold it to drag a Rug Pull or Laser Eyes behind you as a shield.' : '') + '</div></div>';
      reset = function () { setup(nextSeed(), 0); SIM.phase = 'grid'; };
      // the start screen: the title, the racers in a row (yours lit; left and right, a tap, the pad's stick choose),
      // the controls, and the camera on the racer you have
      function pickRow() {
        return '<div class="kpick" role="listbox" aria-label="Racer">' + CAST.map(function (c, i) {
          var img = PORTRAIT[i] ? '<img alt="" src="' + PORTRAIT[i] + '">' : '<i style="background:' + esc(c.color || '#888') + '"></i>';
          return '<button type="button" role="option" data-k="' + i + '"' + (i === RS.pick ? ' class="on" aria-selected="true"' : '') + '>' + img + '<span>' + esc(c.name || '') + '</span></button>';
        }).join('') + '</div>';
      }
      function pick(p, save) {
        if (p === RS.pick && !save) return;
        assign(p); setup(SIM.seed, 0); SIM.phase = 'grid'; CAM.init = false; RS.pickT = 0;
        var c = CAST[RS.pick];
        if (c.H) c.H.show('near', true);
        // (kept here if this page may keep anything; and by the page round the game, which may, where it is sandboxed)
        if (save) {
          try { window.localStorage.setItem(PICK_KEY, c.key); } catch (e) { /* (no storage here) */ }
          try { window.parent.postMessage({ source: 'gamemog', gameId: window.GameMog && window.GameMog.id, type: 'kart-racer', racer: c.key }, '*'); } catch (e) { /* (no page round it) */ }
        }
        if (screen && state === 'title') {
          screen.querySelectorAll('.kpick button').forEach(function (b) { var on = +b.getAttribute('data-k') === RS.pick; b.classList.toggle('on', on); if (on) b.setAttribute('aria-selected', 'true'); else b.removeAttribute('aria-selected'); });
          var nm = screen.querySelector('.kwho'); if (nm) nm.textContent = c.name || '';
        }
      }
      // the racer the page round the game kept for you: yours (on the start screen at once; otherwise from the next race)
      window.addEventListener('message', function (e) {
        if (e.source !== window.parent && e.source !== window) return;
        var d = e.data; if (!d || d.source !== 'gamemog-host' || d.type !== 'kart-racer' || typeof d.racer !== 'string') return;
        var i = CAST.findIndex(function (c) { return c.key === d.racer; });
        if (i < 0 || i === RS.pick) return;
        if (state === 'title') pick(i, false); else if (demo || state === 'results') { assign(i); var c = CAST[i]; if (c.H) c.H.show('near', true); }
      });
      // (and asked for as the race boots: the page round a draft's preview does not know it holds a kart race until
      // the race says so, and answers this with the racer it kept, as a published game's page does unasked)
      try { window.parent.postMessage({ source: 'gamemog', gameId: window.GameMog && window.GameMog.id, type: 'kart-hello' }, '*'); } catch (e) { /* (no page round it) */ }
      function wirePick() {
        if (!screen) return;
        screen.querySelectorAll('.kpick button').forEach(function (b) {
          // (a tap on a racer picks it; anywhere else on the screen starts the race)
          b.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); ensureAudio(); pick(+b.getAttribute('data-k'), true); });
        });
      }
      showStart = function () {
        demo = false; root.classList.remove('demo'); root.classList.remove('kend'); root.classList.remove('kfly');
        setup(nextSeed(), 0); SIM.phase = 'grid'; state = 'title'; showHud(false);
        showScreen('<h1>' + esc(meta.title || 'GameMog') + '</h1>' + (meta.tagline ? '<p>' + esc(meta.tagline) + '</p>' : '') +
          '<div class="kchoose">Your racer: <b class="kwho">' + esc(CAST[RS.pick].name || '') + '</b></div>' + pickRow() + CONTROLS_K + '<div class="go">Enter or tap to start</div>', startCountdown, 'kstart');
        wirePick();
        // (the portraits are made ahead, in the demo; one still to come is made in its turn, the lit one now)
        portrait(RS.pick);
      };
      // a race: the flyover (the camera down the last of the lap to the grid, the karts still on it), then the count.
      // A key, a tap or the pad skips it; the tooling's start() (OW.introSkip) goes straight to the count
      startCountdown = function () {
        demo = false; root.classList.remove('demo'); root.classList.remove('kend');
        KIN.left = KIN.right = KIN.up = KIN.down = false;
        hideScreen();
        var sd = nextSeed();
        if (!OW.introSkip) {
          setup(sd, 0); SIM.phase = 'grid'; state = 'flyover'; RS.fly = 0; RS.flySeed = sd; showHud(false);
          skipEl.firstChild.textContent = root.classList.contains('touch') && DEV.last !== 'key' ? 'Tap to skip' : 'Any key to skip';
          root.classList.add('kfly'); skipEl.style.display = 'block'; return;
        }
        OW.introSkip = false;
        beginCount(sd);
      };
      function beginCount(sd) {
        root.classList.remove('kfly'); skipEl.style.display = 'none'; RS.run = null; RS.sc = null;
        setup(sd, 3);
        // (assisted: any test control at any point of this session, before this race or during an earlier one, a time
        // control switched on and off again included, marks this race and every later one as helped, until a reload:
        // 8 Oct, the flag was set afresh at each count, so a slow motion used and let go before the race went unmarked)
        RS.helped = RS.helped || assisted || RS.auto || timeScale !== 1 || !!fixedStep || !!autopilot || !!invincible;
        state = 'countdown'; showHud(true); assisted = RS.helped;
        emit('start', {}); SFX.tick(false); HUDC.beat = 3;
      }
      function endFly() { if (state === 'flyover') beginCount(RS.flySeed); }
      startDemo = function () { hideScreen(); demo = true; root.classList.add('demo'); root.classList.remove('kend'); root.classList.remove('kfly'); setup(nextSeed(), 0); state = 'race'; showHud(false); RS.cut = 0; };
      togglePause = function () {
        if (state === 'race' && !SIM.karts[0].fin) { state = 'paused'; paused = true; if (audio) audio.ctx.suspend(); showScreen('<h1>Paused</h1><p>Lap ' + Math.min(laps, SIM.karts[0].lapsDone + 1) + ' of ' + laps + ', ' + nth(SIM.karts[0].place) + ' place</p><div class="go">P or tap to carry on</div>', togglePause, 'bar'); }
        else if (state === 'paused') { hideScreen(); state = 'race'; paused = false; if (audio) audio.ctx.resume(); }
      };
      // you are home: the rest's times are estimated now (where they are, at the pace they have kept), the camera
      // comes round, and 2.5 s later, the podium
      /* -------- the race's score (the owner, 8 Oct: one number, 0 to 10,000, where 10,000 is the perfect race no run
       * reaches; lib/runtime/kart-score.js, the same file the scores route and the game page score it with), against
       * the world's constants (meta.kartScore, which the host hands the game as GameMog.kartScore) -- */
      // your run as it stood when you crossed the line (or the race was called): the parts the route scores, kept, so
      // a coin or a bash on the cool-down lap after it counts for nothing
      function runOf(k, place) {
        return { timeMs: Math.round(k.finT * 1000), place: place, gm: k.gm, hits: k.dealt, estimated: !!k.est, progress: +SIM.progress(k).toFixed(4), racer: CAST[ORDER[0]].racer || null };
      }
      function scoreC() { var C = GM.kartScore; return C && typeof C === 'object' && typeof KartScore !== 'undefined' && C.tStar ? C : null; }
      // (scored as the route will: the karts the constants say, the racer's own perfect time)
      function scoreOf(run) { var C = scoreC(); if (!C || !run) return null; try { return KartScore.score({ timeMs: run.timeMs, place: run.place, gm: run.gm, hits: run.hits, estimated: run.estimated, progress: run.progress, racer: run.racer }, C); } catch (e) { return null; } }
      function fmtN(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
      function startFinish() {
        RS.final = SIM.standings(); RS.endT = 0; state = 'finish'; CAM.init = false; root.classList.add('kend');
        var k = SIM.karts[0], place = RS.final.findIndex(function (r) { return r.n === 0; }) + 1;
        RS.run = runOf(k, place);
        lapBanner(place === 1 ? 'You win' : nth(place), k.est ? 'The race is over' : clock(k.finT), 2.4);
        // (and the tier your run makes, by your time, a flash of its colour; not on a race called before you finished)
        var P = k.est ? null : scoreOf(RS.run);
        if (P) { var bs = banner.querySelector('span'), t = el('i', 'kbt', esc(P.tier.name), bs); t.style.background = P.tier.color; }
        SFX.level();
      }
      function startPodium() {
        RS.final = RS.final || SIM.standings();
        SIM.stop(); RS.podT = 0; RS.pod = RS.final.slice(0, 3).map(function (r) { return r.n; });
        if (!demo) { state = 'podium'; skipEl.style.display = 'block'; }
        showHud(false); hudPlace.style.display = demo ? 'none' : '';
        var bw = banner.querySelector('b'), bs = banner.querySelector('span');
        banner.classList.add('kpod'); bw.textContent = nameOf(RS.pod[0]) + ' wins'; bs.textContent = '2nd ' + nameOf(RS.pod[1]) + '  ·  3rd ' + nameOf(RS.pod[2]); bs.style.display = ''; RS.lapBanner = 3.2;
        CAM.init = false;
      }
      showResults = function () {
        var k = SIM.karts[0], fin = RS.final || SIM.standings(), place = fin.findIndex(function (r) { return r.n === 0; }) + 1, top3 = fin.slice(0, 3);
        var run = RS.run || runOf(k, place), P = scoreOf(run), C = scoreC();
        state = 'results'; resultsT = 0; showHud(false); hudPlace.style.display = ''; skipEl.style.display = 'none'; RS.lapBanner = 0; RS.sc = null;
        var who = place === 1 ? 'You won the race.' : top3.map(function (r, i) { return (i + 1) + '. ' + esc(nameOf(r.n)); }).join('  ');
        if (!P) {
          // (no constants to score against: the place and the time, as before the score)
          showScreen('<h1>' + nth(place) + ' place</h1><p>' + who + '</p>' +
            '<div class="stats"><div><b>' + nth(place) + '</b><small>Place</small></div><div><b>' + (k.est ? '~' : '') + clock(k.finT) + '</b><small>' + (k.est ? 'Est. time' : 'Time') + '</small></div><div><b>' + (RS.best ? clock(RS.best) : '-') + '</b><small>Best lap</small></div>' + (CO.gm ? '<div><b>' + k.gm + '</b><small>GM</small></div>' : '') + '</div>' +
            '<div class="go">Enter, Space or tap to race again</div>', startCountdown, 'bar');
        } else {
          // the score: the number counting up over 1.6 s, each part lit as the count passes it, the tier stamped at the
          // end; a press while it counts shows it all at once, the next races again
          var gmOn = (+C.gmCap || 0) >= 1, T = KartScore.TIERS, ti = T.indexOf(P.tier), next = ti > 0 ? T[ti - 1] : null, hint;
          if (run.estimated) hint = 'The race was called before you finished: the share of it you drove counts (' + Math.round(run.progress * 100) + '%).';
          else if (!next) hint = 'MOG: as near the perfect race as a run gets. 10,000 is the perfect race.';
          else {
            var tf = KartScore.timeFor(next.min, run, C);
            hint = esc(next.name) + ' at ' + fmtN(next.min) + (tf != null && tf < run.timeMs ? ': ' + Math.max(0.1, (run.timeMs - tf) / 1000).toFixed(1) + ' s faster' : ': a higher place') + '. 10,000 is the perfect race.';
          }
          if (assisted) hint += ' Driven with help (the autopilot or the time controls): not ranked.';
          var cell = function (id, label, raw) { return '<div data-p="' + id + '"><small>' + label + '</small><em>' + raw + '</em><b>0</b></div>'; };
          var ticks = T.filter(function (q) { return q.id === 'mog' || q.id === 'diamond' || q.id === 'candle'; }).map(function (q) { return '<u style="left:' + (q.min / 100).toFixed(2) + '%"></u>'; }).join('');
          showScreen('<div class="khead"><h1>' + nth(place) + ' place</h1><p>' + who + (RS.best ? '  ·  best lap ' + clock(RS.best) : '') + '</p></div>' +
            '<div class="kscore" data-total="' + P.total + '" data-tier="' + P.tier.id + '"><div class="ksrow"><b class="ksn">0</b><span class="ksof">of 10,000</span><i class="ktier' + (P.tier.id === 'mog' ? ' mog' : '') + '" style="background:' + P.tier.color + '">' + esc(P.tier.name) + '</i></div>' +
            '<div class="ksbar"><i></i>' + ticks + '</div>' +
            '<div class="ksparts' + (gmOn ? '' : ' g3') + '">' + cell('time', 'Time', (run.estimated ? '~' : '') + clock(run.timeMs / 1000)) + cell('finish', 'Finish', nth(place)) + (gmOn ? cell('gm', 'GM', run.gm) : '') + cell('hits', 'Hits', run.hits) + '</div>' +
            '<div class="kshint">' + hint + '</div></div>' +
            '<div class="go">Enter, Space or tap to race again</div>', function () { if (RS.sc && !RS.sc.done) { RS.sc.t = 9; stepCount(0); return; } startCountdown(); }, 'bar kres');
          var q = function (sel) { return screen.querySelector(sel); }, cum = 0;
          RS.sc = { P: P, t: 0, done: false, n: q('.ksn'), bar: q('.ksbar i'), tier: q('.ktier'), parts: ['time', 'finish', 'gm', 'hits'].filter(function (id) { return gmOn || id !== 'gm'; }).map(function (id) { cum += P[id]; return { el: q('[data-p="' + id + '"]'), at: cum, v: P[id] }; }) };
          stepCount(0);
        }
        emit('finish', { place: place, time: k.finT, gm: run.gm, score: P ? P.total : null, tier: P ? P.tier.id : null });
        // the result for the page and the scores route: the parts it scores (it never reads the score sent), your racer
        // (its own perfect time), the share of the race driven, and whether the race was called before you finished
        try { GM.finish({ won: place === 1, place: place, timeMs: run.timeMs, score: P ? P.total : (ENT.length + 1 - place) * 100000 - Math.min(99999, Math.round(k.finT * 100)), level: laps, gm: run.gm, laps: laps, kart: true,
          hits: run.hits, karts: ENT.length, progress: run.progress, racer: run.racer, estimated: run.estimated, scoreV: typeof KartScore !== 'undefined' ? KartScore.V : 1, assisted: assisted }); } catch (e) {}
      };
      // the count: up to the total over 1.6 s, easing out; a part lit as the count passes it; the tier at the end
      function stepCount(dt) {
        var R = RS.sc; if (!R || R.done) return;
        R.t += dt; var u = Math.min(1, R.t / 1.6), e = 1 - Math.pow(1 - u, 3), v = Math.round(R.P.total * e);
        R.n.textContent = fmtN(v); R.bar.style.width = (v / 100).toFixed(2) + '%';
        R.parts.forEach(function (p) { var on = v >= p.at || u >= 1; if (on && !p.on) { p.on = true; p.el.classList.add('on'); p.el.querySelector('b').textContent = fmtN(p.v); } });
        if (u >= 1) { R.done = true; R.tier.classList.add('on'); R.bar.style.background = R.P.tier.bar; if (!demo) sound('tier', R.P.tier.id === 'mog' || R.P.tier.id === 'moon' ? 3 : 2); }
      }

      function drain() {
        var E = SIM.events;
        for (var i = 0; i < E.length; i++) {
          var ev = E[i], me = ev[1] === 0, nearMe = typeof ev[1] === 'number' && !!SIM.karts[ev[1]] && (me || Math.abs(SIM.relD(SIM.karts[ev[1]].d, SIM.karts[0].d)) < 40);
          if (!demo) audioEvent(ev);
          if (ev[0] === 'go') { RS.goT = 0.8; if (!demo) SFX.tick(true); themeGo(); if (state === 'countdown') state = 'race'; RS.lapStart = 0; }
          else if (ev[0] === 'land') {
            // (the longer the air, the harder the squash, and a nudge of the camera for yours after a big one)
            POSE[ev[1]].sq = ev[2] > 0.3 ? clamp(0.6 + ev[2] * 0.9, 0.6, 1.6) : 1;
            if (ev[2] > 0.3 && nearMe) puffAt(ev[1], 'land');
            if (me && !demo && ev[2] > 0.55) shake(Math.min(0.09, 0.03 + ev[2] * 0.04));
          }
          else if (ev[0] === 'cjump' || ev[0] === 'air') { POSE[ev[1]].sq = -0.7; if (nearMe) puffAt(ev[1], 'land'); if (me && !demo) sound(ev[0] === 'cjump' ? 'cjump' : 'pop', ev[2]); }
          else if (ev[0] === 'charge') { if (me && !demo) sound('charge'); }
          else if (ev[0] === 'grind') { if (ev[3] && nearMe) { sparkBurst(kartAt(ev[1], 1, IV3), 18); if (me && !demo) { sound('rail'); say('Grind'); } } }
          else if (ev[0] === 'grindEnd') { if (me && !demo) sound(ev[3] === 2 ? 'bonk2' : 'railOff'); }
          else if (ev[0] === 'fall') { if (me && !demo) { sound('fall'); say('Mind the gap'); } }
          else if (ev[0] === 'bash') { if (nearMe || ev[2] === 0) { var bp = kartAt(ev[2], 1, IV3).add(IV4.set(0, 0.7, 0)); sparkBurst(bp, 30, [2.9, 2.4, 1.2], 3); flash(bp, 3.2); } if (!demo && (me || ev[2] === 0)) { sound('bash'); shake(ev[2] === 0 ? 0.16 : 0.08); say(me ? 'Bash' : 'Bashed by ' + nameOf(ev[1])); } }
          else if (ev[0] === 'snatch') { if (!demo && (me || ev[2] === 0)) { sound('snatch'); if (me) say('GM snatched'); else if (ev[1] !== 0) say('-1 GM'); } }
          else if (ev[0] === 'angry') { if (!demo && (nearMe || ev[2] === 0)) sound('honk', clamp(SIM.karts[ev[1]].mass, 0.8, 1.4)); if (!demo && ev[2] === 0) say(nameOf(ev[1]) + ' is coming for you'); }
          else if (ev[0] === 'launch') {
            if (ev[2] === 'perfect' && nearMe) puffAt(ev[1], 'launch');
            if (ev[2] === 'flood') puffAt(ev[1], 'flood');
            if (me && !demo) { RS.launchKind = ev[2]; if (ev[2] === 'perfect') { say('Moon Launch'); sound('launch'); } else if (ev[2] === 'good') say('Good start'); else if (ev[2] === 'flood') { say('Flooded'); sound('flood'); } }
          }
          else if (me && ev[0] === 'tier') sound('tier', ev[2]);
          else if (ev[0] === 'boost') { if (me) sound(ev[2] === 'pad' ? 'pad' : ev[2] === 'draft' ? 'slip' : 'boost'); }
          else if (ev[0] === 'pad') { if (nearMe) puffAt(ev[1], 'pad'); }
          else if (ev[0] === 'trick') { if (me) { sound('trick'); say('Trick'); } }
          else if (ev[0] === 'slip') { if (me && !demo) say('Slipstream'); }
          else if (ev[0] === 'bonk') { POSE[ev[1]].spin = 1e-4; if (me) { sound('bonk'); CAM.shake = 0.1; } }
          else if (me && ev[0] === 'scrape') sound('scrape');
          else if (me && ev[0] === 'glance') sound('glance');
          else if (ev[0] === 'bump') {
            // (sparks and a flash where they met, a bonk, and a little shake when it is yours)
            var mine = ev[1] === 0 || ev[2] === 0, nb = mine || Math.abs(SIM.relD(SIM.karts[ev[1]].d, SIM.karts[RS.focus].d)) < 50;
            if (nb && ev[5] < 0) { var bpa = kartAt(ev[1], 1, IV3), bpb = kartAt(ev[2], 1, IV4); bpa.add(bpb).multiplyScalar(0.5); bpa.y += 0.5; sparkBurst(bpa, 6 + Math.min(20, ev[3] * 2.5)); if (ev[3] > 3) flash(bpa, 1.2 + Math.min(2, ev[3] * 0.18)); }
            if (!demo && mine && ev[5] < 0) { sound('bonk2', Math.min(1, ev[3] / 10)); if (ev[3] > 3) shake(Math.min(0.12, 0.03 + ev[3] * 0.008)); }
            else if (!demo && nb && ev[3] > 4 && ev[5] < 0 && Math.abs(SIM.relD(SIM.karts[ev[1]].d, SIM.karts[0].d)) < 25) sound('bonkFar');
          }
          else if (ev[0] === 'hit' && (ev[2] === 'spin' || ev[2] === 'bonk') && !ITEMS_ON) { if (me) { sound('hit'); shake(0.12); } }
          else if (ev[0] === 'coin') { if (me) SFX.coin(); }
          else if (ITEMS_ON && ITEM_EV[ev[0]]) itemEvent(ev, me, nearMe);
          else if (ev[0] === 'rescue') { if (SIM.karts[ev[1]].wet > 0 && nearMe) { puffAt(ev[1], 'splash'); if (me) sound('splash'); } if (me && !demo) say(ev[2] ? 'Rescue Claw  -' + ev[2] + ' GM' : 'Rescue Claw'); }
          else if (ev[0] === 'claw') { if (me) sound('claw'); CAM.cut = ev[1]; }
          else if (me && ev[0] === 'lap' && !demo) {
            var lt = SIM.time - RS.lapStart; RS.lapStart = SIM.time; if (!RS.best || lt < RS.best) RS.best = lt;
            if (ev[2] < laps) { lapBanner(ev[2] === laps - 1 ? 'Final lap' : 'Lap ' + (ev[2] + 1)); SFX.level(); emit('lap', { lap: ev[2] + 1, place: SIM.karts[0].place, gm: SIM.karts[0].gm }); }
          } else if (me && ev[0] === 'finish' && !demo && (state === 'race' || state === 'paused')) { if (state === 'paused') togglePause(); startFinish(); }
        }
        E.length = 0;
      }
      function sync() {
        // the runtime's own idea of where you are: the shadows and the motion blur follow it
        var k = SIM.karts[0];
        player.d = k.d; player.x = k.lat; player.v = Math.abs(k.v); player.alive = true;
      }
      // a frame's time as the screen shows it: from the frame's own timestamp, not from the moment the runtime's
      // callback was reached, which wanders a millisecond or two either side of it (7 Oct, the stutter probe: the
      // race moved on 4% too far one frame and 4% too short the next on a steady 60, a fine shiver under everything,
      // worse at 120); a film's fixed step, a fast-forward, a second tick in one frame and a time that does not agree
      // with the runtime's (a hidden tab, a stall) keep the runtime's own
      var VS = { t: -1 };
      function displayDt(dt) {
        var tl = document.timeline, now = tl ? Number(tl.currentTime) : NaN;
        if (!(now === now) || fixedStep || timeScale !== 1) { VS.t = -1; return dt; }
        if (now === VS.t) return dt;
        var v = VS.t < 0 ? dt : (now - VS.t) / 1000; VS.t = now;
        return v > 0 && Math.abs(v - dt) <= 0.2 * dt + 0.002 ? Math.min(v, 0.05) : dt;
      }
      function kartTick(dt) {
        pollPad();
        dt = displayDt(dt);
        var sdt = state === 'paused' || RS.freeze ? 0 : dt;
        t += sdt;
        // (a frame something was made in, and the one after it, which is when its time is counted, are not held
        // against the device: the runtime's adapt() would shed resolution for a moment of making, for good)
        if (RS.calm > 0) { RS.calm--; Q.acc = 0; Q.n = 0; }
        readInput();
        var alpha = SIM.advance(sdt);
        drain();
        var me = SIM.karts[0], lead = SIM.order[0];
        if (demo) {
          // the attract: the camera cuts between racers; the race ends 25 s after the leader is home (or with the
          // field home), the podium, and it starts over
          RS.cut += sdt; if (RS.cut > 9) { RS.cut = 0; RS.focus = (RS.focus + 3) % ENT.length; CAM.init = false; }
          if (!RS.pod && ((lead && lead.fin && (SIM.time - lead.finT > RU.endAfter || SIM.finishers >= ENT.length)) || SIM.time > 300)) startPodium();
          if (RS.pod) { RS.podT += sdt; if (RS.podT > 5.5) startDemo(); }
        } else if (RS.focus && !RS.film) RS.focus = 0;
        // the race is over 25 s after the leader is home: a run still out ends there, placed by how far it got
        if (!demo && state === 'race' && !me.fin && lead && lead.fin && SIM.time - lead.finT > RU.endAfter) SIM.finishBy(me);
        // (the score, when the world has one, rises with the laps: the runtime's music energy reads the level, the
        // final lap its top)
        if (!demo && (state === 'race' || state === 'countdown')) level = me.lapsDone + 1 >= laps ? 3 : Math.min(2, me.lapsDone + 1);
        if (state === 'flyover') { RS.fly += dt; if (RS.fly >= FLY.T) endFly(); }
        if (state === 'finish') { RS.endT += sdt; if (RS.endT > 2.5) startPodium(); }
        if (state === 'podium') { RS.podT += sdt; if (RS.podT > 5.5) showResults(); }
        if (state === 'results') { RS.podT += sdt; resultsT += dt; stepCount(dt); if (resultsT > 12) startDemo(); }
        drain();
        sync();
        poseKarts(alpha, sdt);
        // the racers' levels not made yet, made between frames: one a racer is waiting for (shown a level down) at once,
        // the rest on the start screen, in the demo and the results, a third of a second apart; in a race, none
        RS.pumpT -= dt;
        if (kartRosterState().queue.length) {
          var racing = !demo && (state === 'flyover' || state === 'race' || state === 'countdown' || state === 'finish'), wanted = CAST.some(function (c) { return c.H && c.H.wanting; });
          if (wanted || (!racing && RS.pumpT <= 0)) { kartRosterPump(8); RS.pumpT = 0.3; RS.calm = 2; }
        }
        confetti(sdt);
        PIN.step(sdt); EMB.step(sdt); FLM.step(sdt); SMK.step(sdt); CNF.step(sdt); STM.step(sdt);
        stepChaos(sdt);
        if (ITEMS_ON) { stepCrates(t, sdt); stepRugs(sdt); stepShots(sdt); stepWhale(sdt); stepClouds(sdt); stepBags(sdt); if (IFX) IFX.step(sdt); stepSlot(sdt); stepFud(); warmItems(); }
        stepPrep();
        stepScore();
        stepKartAudio(sdt);
        FXS.sparks = PIN.alive; FXS.embers = EMB.alive; FXS.smoke = SMK.alive; FXS.confetti = CNF.alive; FXS.steam = STM.alive; FXS.lines = FXC.lines; FXS.flashes = FLASH.filter(function (F) { return F.t >= 0; }).length;
        stepCoins(t);
        padMat.color.setScalar(1.5 + 0.6 * (0.5 + 0.5 * Math.sin(t * 7)));
        if (typeof def.update === 'function') try { def.update(ctx, t, sdt); } catch (e) { fail('update() threw: ' + (e && e.message || e)); def.update = null; }
        stepCam(dt, alpha);
        if (ITEMS_ON) { myCloud(); lateFx(); }
        // (a rival close behind the camera, or in the way of it, would fill the frame: it steps aside from the
        // picture, as the runtime's lap does with a rival the camera is inside)
        // (a film's own camera, set apart from any kart, hides nobody)
        if (!RS.pod && !(RS.film && (RS.film.mode === 'free' || RS.film.mode === 'grid' || RS.film.mode === 'overhead'))) {
          var fo = ENT[RS.film && RS.film.k != null ? clamp(Math.round(RS.film.k), 0, 7) : RS.focus].object.position, cp = camera.position;
          var sx = fo.x - cp.x, sy = fo.y - cp.y, sz = fo.z - cp.z, sl = sx * sx + sy * sy + sz * sz || 1;
          for (var n2 = 0; n2 < ENT.length; n2++) {
            var o3 = ENT[n2].object; if (!o3.visible || o3.position === fo) continue;
            // (nearer the camera than the kart it follows, and within 1.5 m of the line to it)
            var px = o3.position.x - cp.x, py = o3.position.y + 0.6 - cp.y, pz = o3.position.z - cp.z, u = (px * sx + py * sy + pz * sz) / sl;
            if (u < 0.85 && (px * px + py * py + pz * pz < 2.6 * 2.6 || (u > -0.1 && Math.hypot(px - sx * u, py - sy * u, pz - sz * u) < 1.5))) o3.visible = false;
          }
          // (and so does a coin rolling across the road under the lens behind your kart: crossLens)
          for (var hq = 0; hq < HZV.length; hq++) if (HZV[hq].roll && HZV[hq].roll.visible && crossLens(hq)) HZV[hq].roll.visible = false;
        }
        stepHud(sdt);
        // the beats of the count
        if (SIM.phase === 'grid' && SIM.count > 0) { var b = Math.ceil(SIM.count); if (HUDC.beat !== b) { HUDC.beat = b; if (b < 3) SFX.tick(false); } }
      }

      /* -------- the score's last lap: the same song, faster -- */
      // The runtime's score (music.js) rises with the laps on its own: the energy is the lap (1, 2, then the final
      // lap's 3), and each new lap is a sting. A kart race's last lap also goes faster (the owner: "speeds up on the
      // final lap"), which the score cannot do by itself: the same song composed again at 5% more tempo (160 to 168;
      // the same seed is the same notes) waits silent from the start of the race, and on the final lap is handed the
      // next bar line, the bar it is on and the energy, and plays on from there; the first one's last bar, already
      // under way, plays out. Back to the first for the next race.
      var MUS = { p1: null, p2: null, swapped: false, at: null, tried: false, lifted: 0 };
      function stepScore() {
        if (KSC.on) { stepTheme(); return; }
        if (!MUSIC || !audio || typeof GameMogMusic === 'undefined') return;
        if (!MUS.p1) MUS.p1 = audio.music;
        if (!MUS.p1 || laps < 2) return;
        if (!MUS.tried) {
          MUS.tried = true;
          try {
            MUS.lifted = Math.round(MUSIC.tempo * 1.05);
            var S2 = GameMogMusic.read(Object.assign({}, def.music, { tempo: MUS.lifted }), meta.title || 'GameMog', function () {});
            S2.measured = MUSIC.measured;
            MUS.p2 = GameMogMusic.player(audio.ctx, audio.venue ? audio.venue.input : audio.master, S2, { target: -16 });
          } catch (e) { MUS.p2 = null; warn('the last lap\'s faster score could not be made: ' + (e && e.message || e)); }
        }
        var p1 = MUS.p1, p2 = MUS.p2;
        if (!p2) return;
        if (MUSIC.measured && p2.style.measured !== MUSIC.measured) { p2.style.measured = MUSIC.measured; p2.setLevel(MUSIC.measured.lufs); }
        var racing = !demo && (state === 'race' || state === 'paused' || state === 'finish' || state === 'podium' || state === 'results');
        if (MUS.swapped && !racing) {
          // (a new race: the first song again, from its own start)
          if (p2.state.playing) { p2.state.stopping = false; p2.state.playing = false; p2.stop(0.3); }
          audio.music = p1; MUS.swapped = false; MUS.at = null;
        }
        // (waiting silent from the count: started, its level settled, nothing scheduled)
        if (!MUS.swapped && !demo && (state === 'countdown' || state === 'race') && !p2.state.playing) p2.start(false);
        if (!MUS.swapped && !demo && state === 'race' && level >= 3 && p1.state.playing && !p1.state.stopping) {
          if (!p2.state.playing) p2.start(false);
          p2.state.bar = p1.state.bar; p2.state.nextBar = p1.state.nextBar; p2.state.energy = p1.state.energy; p2.state.want = 3; p2.state.beats = [];
          MUS.at = { bar: p1.state.bar, nextBar: +p1.state.nextBar.toFixed(4), now: +audio.ctx.currentTime.toFixed(4), barDur: +(p1.song.steps * p1.song.stepDur).toFixed(4), barDur2: +(p2.song.steps * p2.song.stepDur).toFixed(4) };
          p1.state.playing = false;
          audio.music = p2; MUS.swapped = true;
        }
      }

      /* -------- the race's own score (kart.score: kart-music.js), played by the race -- */
      // The owner, 7 Oct: the generated score was "too generic, needs to feel upbeat and FUN". A world that asks for
      // kart.score races to the kart theme written out note by note in kart-music.js (a jazz-funk big band, Bb at 160
      // BPM), and the race plays it: the start screen and the flyover hear its groove, quietly; the count its intro,
      // two bars, 3 s, started so the verse's first downbeat lands on GO (a rip, a kick and a crash on it); each lap
      // adds layers; the final lap rips up a semitone to 168 BPM on the next bar line, with its own sting; your finish
      // has one over the score, the podium a fanfare for a place on it (a shrug off it) over the score stopped, then
      // the start screen's groove again as it ends, on into the results. It stands in for the platform's player as audio.music, so every
      // duck the runtime and the race ask for (sound(), the SFX) still reaches it; the platform's own start, stop and
      // energy are not heeded (the race knows its states better), only its beats passed on. A world that names a
      // track, and an options world, keep theirs; one with music of its own as well hears this instead (leave it out).
      var KSC = { on: !!KD.score && !OPTS && !TRACK && typeof kartMusic !== 'undefined' && !KDIAG.nomusic, M: null, mode: '', after: 0, log: [], goAt: null, go: null };
      function themePlayer(M) {
        return {
          state: M.state, kart: true,
          start: function () {}, stop: function () {}, setLevel: function () {},
          update: function (e, onBeat) { M.update(null, onBeat); },
          duck: function (db, sec) { M.duck(db, sec); },
          duckLevel: function () { return M.duckLevel(); },
          // the runtime's lap sting (SFX.level): the final lap's, with the lift to it on the same bar line, or your
          // finish's, by where the race is
          sting: function (kind) {
            var k = SIM.karts[0], name = kind === 'lap' || kind === 'bounty' ? (state === 'finish' ? 'finish' : k.lapsDone + 1 >= laps ? 'final' : 'lap') : kind;
            if (name === 'final') M.setLap(3);
            return themeSting(name);
          },
        };
      }
      function themeSting(name) { var len = KSC.M.sting(name); KSC.log.push([name, +SIM.time.toFixed(2), state]); if (KSC.log.length > 24) KSC.log.shift(); return len; }
      function stepTheme() {
        if (!audio) return;
        if (!KSC.M) {
          kartStep('music: making');
          try { KSC.M = kartMusic.create(audio.ctx, audio.venue ? audio.venue.input : audio.master, { seed: 1607 }); }
          catch (e) { KSC.on = false; warn('the kart score could not start: ' + (e && e.message || e)); return; }
          kartStep('music: made');
          audio.music = themePlayer(KSC.M);
        }
        var M = KSC.M, S = M.state, now = audio.ctx.currentTime;
        var want = demo ? 'off' : state === 'title' || state === 'flyover' ? 'groove' : state === 'countdown' ? 'count' : state === 'race' || state === 'paused' ? 'race' : state === 'finish' || state === 'podium' || state === 'results' ? state : 'off';
        if (want !== KSC.mode) {
          KSC.mode = want;
          if (want === 'off') M.stop(1.2);
          // (the start screen's groove: the drums thinned, 1.5 dB under; already going from the results, it plays on)
          else if (want === 'groove') { M.setLap(0); if (!S.playing || S.stopping) M.start(null, 'loop'); }
          else if (want === 'count') {
            // the intro is the count: its last bar line is GO (a count cut short starts the verse on GO instead)
            var count = SIM.phase === 'grid' ? Math.max(0, SIM.count) / timeScale : 0;
            M.setLap(1); KSC.goAt = now + count; KSC.go = null;
            if (count >= M.introSeconds - 0.05) M.start(now + count - M.introSeconds, 'intro'); else M.start(now + count, 'loop');
          }
          else if (want === 'race') { if (!S.playing || S.stopping) { M.setLap(level); M.start(null, 'loop'); } }
          else if (want === 'podium') {
            var fin = RS.final || SIM.standings(), place = fin.findIndex(function (r) { return r.n === 0; }) + 1;
            M.stop(0.5); KSC.after = now + themeSting(place >= 1 && place <= 3 ? 'win' : 'lose');
            // (and the start screen's groove back in as the sting ends: the podium is not left silent)
            M.setLap(0); M.start(KSC.after, 'loop');
          }
          else if (want === 'results') { M.setLap(0); if (!S.playing || S.stopping) M.start(Math.max(now + 0.05, KSC.after), 'loop'); }
        }
        if (want === 'race') M.setLap(level);
      }
      // GO: the verse's downbeat, with a rip up into it
      function themeGo() { if (KSC.on && KSC.M && !demo && KSC.mode === 'count') { KSC.go = audio.ctx.currentTime; themeSting('go'); } }

      /* -------- for the platform's checks and films, never for players: any use marks the run as assisted -- */
      function sample(k, tt) {
        return { t: +tt.toFixed(4), v: +k.v.toFixed(3), d: +k.d.toFixed(2), x: +k.lat.toFixed(3), y: +k.y.toFixed(3), h: +k.h.toFixed(4), steer: +k.steer.toFixed(4), w: +k.w.toFixed(4), drift: k.dDir, charge: +k.charge.toFixed(4), tier: k.tier,
          boost: +k.bt.toFixed(3), mul: +k.bm.toFixed(3), src: k.bSrc, cap: k.bCap, stun: +Math.max(0, k.stun).toFixed(3), off: k.off, surf: k.surf, wrong: k.wrong, lap: k.lapsDone, place: k.place, hop: k.hop >= 0,
          air: k.air, trick: k.trick, push: +(k.pushZ * Math.sin(k.h) - k.pushX * Math.cos(k.h)).toFixed(3), prog: +k.prog.toFixed(2), gate: k.gate, missed: k.missed, gm: k.gm, dealt: k.dealt, rescue: +k.rescue.toFixed(3), ghost: +Math.max(0, k.ghost).toFixed(3), wet: +k.wet.toFixed(3),
          slip: +k.draftC.toFixed(3), lane: +k.ai.lane.toFixed(3), wob: +k.wob.toFixed(3), spin: +Math.max(0, k.spin).toFixed(3), launch: k.launch, pace: +k.pace.toFixed(4), fin: k.fin,
          // (the chaos: a charge jump charging and made, the rail and how long on it, fallen in a break, the air's time,
          // angry (how long left, at whom, the cool-down), bashed lately, the item's or hazard's hit)
          cj: +k.cj.toFixed(3), cjAir: k.cjAir, grind: k.grind, grindT: +k.grindT.toFixed(3), pit: k.pit, airT: +k.airT.toFixed(3), vy: +k.vy.toFixed(3), mad: +k.ai.mad.toFixed(3), madAt: k.ai.madAt, calm: +k.ai.calm.toFixed(3),
          bashI: +k.bashI.toFixed(3), hit: k.hitT > 0 ? k.hitK : '', iframe: +k.iframe.toFixed(3), hand: +k.clawHand.toFixed(3), clawN: k.clawN, claw3: k.claw3, persona: k.ai.persona, mass: k.mass, aiCj: +k.ai.cj.toFixed(3), cjFor: k.ai.cjFor, railGo: k.ai.railGo, railSeen: k.ai.railSeen };
      }
      function kartState() {
        var k = SIM.karts[0];
        return {
          ready: true, phase: SIM.phase, state: state, demo: demo, laps: laps, lap: Math.min(laps, k.lapsDone + 1), lapsDone: k.lapsDone, place: k.place, time: +SIM.time.toFixed(3), count: +SIM.count.toFixed(2),
          speed: +k.v.toFixed(2), top: k.top, drift: { dir: k.dDir, charge: +k.charge.toFixed(3), tier: k.tier, hop: k.hop >= 0, name: k.dDir ? TIER[k.tier].name : null, most: { charge: +k.dMost.toFixed(3), tier: k.tMost } }, boost: +k.bt.toFixed(3), src: k.bSrc, mul: +k.bm.toFixed(3), stun: +Math.max(0, k.stun).toFixed(3),
          off: k.off, wrong: k.wrong, missed: k.missed, y: +k.y.toFixed(3), air: k.air, trick: k.trick, d: +k.d.toFixed(2), x: +k.lat.toFixed(2), auto: !!k.auto, finished: k.fin, finT: k.fin ? +k.finT.toFixed(3) : null, est: k.est, best: RS.best ? +RS.best.toFixed(3) : null,
          gm: k.gm, hits: k.dealt, run: RS.run, score: RS.sc ? { total: RS.sc.P.total, tier: RS.sc.P.tier.id, parts: { time: RS.sc.P.time, finish: RS.sc.P.finish, gm: RS.sc.P.gm, hits: RS.sc.P.hits }, t: +RS.sc.t.toFixed(3), done: RS.sc.done, shown: RS.sc.n.textContent } : null,
          slip: +k.draftC.toFixed(3), rescue: k.rescue >= 0, launch: k.launch, back: RS.back, assisted: !!assisted, helped: RS.helped,
          L: +L.toFixed(1), hw: hw, wall: TR.wall, seed: SIM.seed, steps: SIM.steps, focus: RS.focus, camera: { fov: +camera.fov.toFixed(1), x: +camera.position.x.toFixed(2), y: +camera.position.y.toFixed(2), z: +camera.position.z.toFixed(2), pitch: +(CAM.p / KART_D2R).toFixed(2), foot: +CAM.foot.toFixed(3), over: +(CAM.over || 0).toFixed(3), lag: +(CAM.lag || 0).toFixed(3) },
          karts: SIM.karts.map(function (q, n) {
            return { n: n, name: nameOf(n), place: q.place, lap: Math.min(laps, q.lapsDone + 1), lapsDone: q.lapsDone, gate: q.gate, prog: +q.prog.toFixed(1), v: +q.v.toFixed(2), d: +q.d.toFixed(1), x: +q.lat.toFixed(2),
              fin: q.fin, finT: q.fin ? +q.finT.toFixed(3) : null, stuck: +q.maxStuck.toFixed(2), drift: q.dDir, tier: q.tier, skill: +q.ai.skill.toFixed(3), cap: +(q.top * q.pace).toFixed(2), top: q.top, maxPace: +q.maxPace.toFixed(4), parked: q.parked, slot: q.slot, visible: ENT[n].object.visible,
              racer: CAST[ORDER[n]].racer, detail: DET[n], level: CAST[ORDER[n]].H && CAST[ORDER[n]].H.cur ? CAST[ORDER[n]].H.cur.level : null,
              persona: q.ai.persona, mad: +q.ai.mad.toFixed(2), madAt: q.ai.madAt, grind: q.grind, gm: q.gm, dealt: q.dealt, claw3: q.claw3 };
          }),
          coins: { laid: SIM.coins.length, left: SIM.coins.filter(function (c) { return c.on; }).length },
          final: RS.final ? RS.final.map(function (r) { return { n: r.n, name: nameOf(r.n), time: +r.time.toFixed(3), est: r.est }; }) : null,
          podium: RS.pod ? RS.pod.slice() : null,
          pick: { index: RS.pick, racer: CAST[RS.pick].racer, name: CAST[RS.pick].name, cast: CAST.map(function (c) { return c.racer || c.name; }), portraits: PORTRAIT.filter(Boolean).length },
          roster: { built: kartRosterState().builds.length, waiting: kartRosterState().queue.length },
          // what is made ahead of a race (stepPrep): done, how far, the milliseconds it took, anything made in a race,
          // and the programs compiled so far
          grade: G ? { preset: G.preset ? G.preset.name : null, curve: G.grade.curve || 'aces', saturation: G.grade.saturation } : null,
          prep: { done: PREP.done, at: PREP.i, of: PREP.jobs ? PREP.jobs.length : 0, ms: Math.round(PREP.ms), inRace: PREP.inRace, made: PREP.made.slice(-8), programs: renderer.info.programs ? renderer.info.programs.length : -1, closed: PREP.closed || 0 },
          fx: { sparks: FXS.sparks, skids: FXS.skids, flames: FXS.flames, embers: FXS.embers, mog: FXS.mog, smoke: FXS.smoke, confetti: FXS.confetti, steam: FXS.steam, lines: FXS.lines, flashes: FXS.flashes, shake: +CAM.shake.toFixed(3), reduced: RM, charging: FXC.charge, grinding: FXC.grind, steaming: FXC.steam,
            rails: RAILS.map(function (R0) { return +R0.mat.emissiveIntensity.toFixed(2); }) },
          hud: { tier: driftWord.textContent, tierColor: driftWord.style.color, mog: hudDrift.classList.contains('mog'), launch: hudLaunch.style.display !== 'none', gm: hudGm.style.display !== 'none' ? hudGm.querySelector('b').textContent : null, slip: hudSlip.style.opacity === '1',
            item: { shown: hudItem.style.display === 'block', icon: SLOT.icon, rolling: hudItem.classList.contains('roll'), drag: hudItem.classList.contains('drag'), badge: SLOT.badge.textContent }, fud: fudCv.style.display === 'block' ? +(+fudCv.style.opacity || 0).toFixed(2) : 0 },
          item: { on: ITEMS_ON, slot: k.item, charges: k.charges, roll: +k.roll.toFixed(3), drag: k.drag, shield: +k.shield.toFixed(2), diamond: +k.diamond.toFixed(2), moon: +k.moon.toFixed(2), iframe: +k.iframe.toFixed(2), hit: k.hitK, fud: +k.fudT.toFixed(2) },
          // (the race's own score, kart.score: what it is playing, and the stings it has played, with the race's time)
          theme: KSC.on && KSC.M ? { mode: KSC.mode, playing: KSC.M.state.playing, stopping: KSC.M.state.stopping, lap: KSC.M.state.lap, bar: KSC.M.state.bar, section: KSC.M.state.section, tempo: KSC.M.state.tempo, key: KSC.M.state.key,
            nextBar: +KSC.M.state.nextBar.toFixed(4), duck: KSC.M.duckLevel(), stings: KSC.log.slice(), goAt: KSC.goAt != null ? +KSC.goAt.toFixed(4) : null, go: KSC.go != null ? +KSC.go.toFixed(4) : null, now: audio ? +audio.ctx.currentTime.toFixed(4) : null } : KSC.on ? { mode: 'waiting' } : null,
          music: MUSIC ? { swapped: MUS.swapped, tempo: audio && audio.music && audio.music.style ? audio.music.style.tempo : MUSIC.tempo, lifted: MUS.lifted, at: MUS.at, energy: audio && audio.music ? audio.music.state.energy : null, bar: audio && audio.music ? audio.music.state.bar : null, nextBar: audio && audio.music ? +audio.music.state.nextBar.toFixed(4) : null, playing: !!(audio && audio.music && audio.music.state.playing), ready: !!MUS.p2 } : null,
        };
      }
      var DEBUG = {
        // you (or kart n), put on the track: d metres along it, x across (right of the centre), at v m/s, turned
        // yaw degrees off the track's own heading (positive: toward the right-hand wall); a clean kart, no drift,
        // hop, stun or boost
        place: function (d, x, v, yaw, n) {
          assisted = true; var k = SIM.karts[clamp(Math.round(+n || 0), 0, ENT.length - 1)];
          SIM.putOn(k, +d || 0, +x || 0, -(+yaw || 0) * PI / 180);
          k.v = +v || 0; k.dDir = 0; k.charge = 0; k.tier = 0; k.hop = -1; k.y = 0; k.stun = 0; k.bt = 0; k.bm = 1; k.bCap = 0; k.bSrc = ''; k.pushX = k.pushZ = 0; k.grace = 0; k.steer = 0; k.wallT = 9;
          k.parked = false; k.ghost = 0; k.dPrev = k.d; k.slowT = 0; k.wedge = 0; k.air = false; k.vy = 0; k.ramp = -1; k.ry = 0; k.abyss = false; k.rescue = -1; k.wet = 0; k.draftC = 0; k.spin = 0; k.wob = 0; k.cut = 0; k.padT = 0; k.trick = false;
          k.clawHand = 0; k.clawT = -99; k.clawN = 0; k.clawLog.length = 0;
          k.moon = 0; k.diamond = 0; k.shield = 0; k.iframe = 0; k.hitT = 0; k.hitK = ''; k.fudT = 0; k.fudAI = 0; k.drag = false;
          k.cj = -1; k.cjAir = false; k.grind = -1; k.grindT = 0; k.bmp = -1; k.pit = false; k.bashI = 0; k.snatchI = 0; k.airT = 0; k.railOffT = 0; k.liftT = 0; k.hop = -1; k.held = false;
          k.ai.mad = 0; k.ai.madAt = -1; k.ai.calm = 0; k.ai.cj = 0; k.ai.ramT = 0; k.ai.bash = 0; k.ai.sling = 0;
          // (and its progress where it now is, on the lap it was on, every checkpoint up to here passed)
          k.wrongT = 0; k.wrong = false; k.missed = false; k.prog = k.lapsDone * L + k.d; k.gate = Math.floor(k.prog / (L / SIM.rules.gates)); SIM.places();
          var ki = SIM.karts.indexOf(k); for (var pq = 0; pq < 8; pq++) SIM.pair[Math.min(pq, ki) * 8 + Math.max(pq, ki)] = 0;
          if (ITEMS_ON) hideItems(ki);
          return sample(k, 0);
        },
        speed: function (v) { assisted = true; SIM.karts[0].v = +v || 0; return SIM.karts[0].v; },
        // your kart on lap l (0 the first), where it is: every checkpoint before here passed
        lap: function (l) { assisted = true; var k = SIM.karts[0]; k.lapsDone = clamp(Math.round(+l || 0), 0, laps - 1); k.prog = k.lapsDone * L + k.d; k.dPrev = k.d; k.gate = Math.floor(k.prog / (L / SIM.rules.gates)); SIM.places(); return k.lapsDone; },
        // your kart moved d metres on along the track as if driven there (a shortcut, for the checkpoint check)
        warp: function (dd, x) { assisted = true; var k = SIM.karts[0], v = k.v, h0 = k.h; SIM.putOn(k, k.d + (+dd || 0), x == null ? k.lat : +x, 0); k.v = v; void h0; return sample(k, 0); },
        // a drift in hand (films): direction and charge, as if held through a turn
        setDrift: function (dir, charge) {
          assisted = true; var k = SIM.karts[0], R0 = SIM.rules;
          k.dDir = dir > 0 ? 1 : dir < 0 ? -1 : 0; k.charge = +charge || 0; k.held = true;
          k.tier = k.charge >= R0.tiers[2] ? 3 : k.charge >= R0.tiers[1] ? 2 : k.charge >= R0.tiers[0] ? 1 : 0;
          return k.tier;
        },
        gm: function (n) { assisted = true; SIM.karts[0].gm = Math.max(0, Math.round(+n || 0)); return SIM.karts[0].gm; },
        // the item slot: an item put in it (by its id or its name; null empties it), yours or kart n's
        give: function (id, n) {
          assisted = true; var k = SIM.karts[clamp(Math.round(+n || 0), 0, ENT.length - 1)], it = id == null ? null : KITEM_ID[String(id).toLowerCase().replace(/[^a-z]/g, '')] || null;
          k.item = it; k.charges = it === 'wow' ? RU.items.wow.n : it ? 1 : 0; k.roll = 0; k.rollPick = null; k.drag = false; k.itemHeld = false;
          return k.item;
        },
        // what the items are doing: the crates, the rugs, the lasers, the Whale, the FUD on its way, the GM spilled,
        // and each kart's slot and effects
        items: function () {
          var r = function (v) { return +(+v).toFixed(3); };
          return { on: ITEMS_ON, weights: IWEIGHTS, crates: SIM.crates.map(function (c) { return { d: r(c.d), x: r(c.x), on: c.on, row: c.row }; }),
            traps: SIM.traps.map(function (t) { return { id: t.id, owner: t.owner, d: r(t.d), x: r(t.x), y: r(t.y), t: r(t.t), fly: r(t.fly), on: t.on }; }),
            shots: SIM.shots.map(function (q) { return { id: q.id, owner: q.owner, d: r(q.d), x: r(q.lat), y: r(q.y), v: r(q.v), t: r(q.t), target: q.target, dir: q.dir }; }),
            whale: SIM.whale ? { owner: SIM.whale.owner, target: SIM.whale.target, t: r(SIM.whale.t), locked: SIM.whale.locked, slam: SIM.whale.slam, hits: SIM.whale.hits, x: r(SIM.whale.x), z: r(SIM.whale.z), shown: !!WH && WH.box.visible, opacity: WH ? r(WH.mat.opacity) : 1 } : null, whaleAt: r(SIM.whaleAt),
            warm: WARM.step,
            fuds: SIM.fuds.length, spill: SIM.spill.filter(function (c) { return c.on; }).length,
            karts: SIM.karts.map(function (k, n) { return { n: n, item: k.item, charges: k.charges, roll: r(k.roll), pick: k.rollPick, drag: k.drag, shield: r(k.shield), diamond: r(k.diamond), moon: r(k.moon), iframe: r(k.iframe), hit: k.hitK, hitT: r(k.hitT), fud: r(k.fudT), fudAI: r(k.fudAI), uses: k.uses, bucket: SIM.bucketOf(k), gm: k.gm, y: r(k.y) }; }) };
        },
        // the odds as they come out: `samples` rolls for kart n from a bucket (1 to 8), what each kind came to
        odds: function (b, samples, n) {
          assisted = true; var k = SIM.karts[clamp(Math.round(+n || 0), 0, ENT.length - 1)], out = {};
          RU.items.ids.forEach(function (id) { out[id] = 0; });
          for (var i = 0; i < (samples || 1000); i++) out[SIM.rollItem(k, clamp(Math.round(+b || 1), 1, 8))]++;
          return out;
        },
        // whether a kind may be rolled for kart n now (the limits), and how many of it are out
        limit: function (id, n) { var k = SIM.karts[clamp(Math.round(+n || 0), 0, ENT.length - 1)]; return { blocked: SIM.blocked(k, id), out: SIM.outOf(id) }; },
        // the item weights as a world would give them (kart.items.weights), on this race from now: what they came to
        weights: function (w) { assisted = true; IWEIGHTS = readWeights(w); SIM.weights = IWEIGHTS; return IWEIGHTS; },
        // kart n uses what is in its slot now (aim 1 ahead, -1 behind), as if it pressed the button
        use: function (n, aim) { assisted = true; var k = SIM.karts[clamp(Math.round(+n || 0), 0, ENT.length - 1)]; k.drag = false; SIM.useItem(k, +aim || 0); return k.item; },
        // the FUD Cloud on you, measured (7 Oct, round 3): the haze round the edges (the most of it over the road
        // ahead, x 0.2 to 0.8 and y 0.3 to 0.88, and its opacity), and your cloud on the screen (its box, from its
        // model's bounds), with the foot of the boards along the top it hangs under
        fud: function () {
          if (fudCv.style.display !== 'block' || !FUD.edge) return null;
          var W = fudCv.width, H = fudCv.height, d = fudCv.getContext('2d').getImageData(0, 0, W, H).data, most = 0, inked = 0, n = 0;
          for (var y = Math.floor(H * 0.3); y < H * 0.88; y++) for (var x = Math.floor(W * 0.2); x < W * 0.8; x++) { var al = d[(y * W + x) * 4 + 3] / 255; most = Math.max(most, al); n++; }
          for (var i = 3; i < d.length; i += 4) if (d[i] > 64) inked++;
          // (the cloud's own body, the arrows raining from it left out)
          var c = CLOUDS.filter(function (q) { return q.t >= 0 && q.mode === 'me'; })[0], box = null;
          if (c && c.g.visible) { c.g.updateMatrixWorld(true); var B = new THREE.Box3().setFromObject(c.g.userData.item.body.children[0], true), P = [], q; for (q = 0; q < 8; q++) P.push(new THREE.Vector3(q & 1 ? B.max.x : B.min.x, q & 2 ? B.max.y : B.min.y, q & 4 ? B.max.z : B.min.z).project(camera)); box = [Math.min.apply(null, P.map(function (v) { return (v.x + 1) / 2; })), Math.max.apply(null, P.map(function (v) { return (v.x + 1) / 2; })), Math.min.apply(null, P.map(function (v) { return (1 - v.y) / 2; })), Math.max.apply(null, P.map(function (v) { return (1 - v.y) / 2; }))].map(function (v) { return +v.toFixed(3); }); }
          return { mid: +most.toFixed(3), edge: +(inked / (W * H)).toFixed(3), opacity: +(+fudCv.style.opacity || 0).toFixed(2), cloud: box, top: +FUD.top.toFixed(3), clouds: CLOUDS.filter(function (q) { return q.t >= 0; }).map(function (q) { return q.mode + ':' + q.n + ':' + q.g.scale.x.toFixed(2); }) };
        },
        // what the effects hide of the picture (7 Oct, round 3, the owner: "it blocks entire view, that shouldn't
        // happen"): the frame drawn twice, small, as it is and with every effect hidden (the clouds, the whale, the
        // particles and sprites, the flashes, the flames, the speed lines, the Claw, the meteors, what
        // flies, what each racer carries; not the marks on the road, the whale's shadow and splash ring and the
        // hazards' rings and the meteor's shock ring, which are the warnings and hide nothing of its shape), and the share of the pixels that differ by more than a
        // quarter of the full scale: in the
        // band the road ahead runs through (x 0.2 to 0.8, y 0.3 down to the foot of the kart followed) and in that
        // kart's own box on the screen; the screen's own overlay (the FUD haze) counted where it is over a quarter
        // opaque. veil: the band's mean difference, 0 to 1
        // (only: one kind of effect hidden, the rest left: 'sparks', 'flames', 'smoke', 'confetti', 'lines', 'flash',
        // 'boost', 'ifx', 'clouds', 'bags', 'whale', 'claw', 'shots', 'rugs', 'meteor', 'kit'; or '-kit,lines': all but
        // those)
        cover: function (only) { return coverNow(only || null); },
        // the score's last-lap handoff, and the two songs' notes side by side (the same, bar for bar?)
        score: function () {
          if (!MUS.p2 || !MUS.p1) return null;
          var a = MUS.p1.song.bars, b = MUS.p2.song.bars, same = a.length === b.length;
          for (var i = 0; same && i < a.length; i++) same = JSON.stringify([a[i].lead, a[i].bass, a[i].chord]) === JSON.stringify([b[i].lead, b[i].bass, b[i].chord]);
          return { same: same, bars: a.length, tempo: [MUS.p1.style.tempo, MUS.p2.style.tempo], at: MUS.at, swapped: MUS.swapped };
        },
        // kart n's newest rug moved to d, x (films: in the path of the kart they show)
        moveTrap: function (n, d, x) { assisted = true; var t = SIM.traps.filter(function (q) { return q.owner === n && q.on; }).pop(); if (!t) return null; t.d = wrapD(+d || 0); t.x = +x || 0; t.d0 = t.d1 = t.d; return t.id; },
        // kart n hit by an item, as if it landed (rug, laser, whale, touch)
        hit: function (kind, n) { assisted = true; return SIM.hit(SIM.karts[clamp(Math.round(+n || 0), 0, ENT.length - 1)], kind, -1); },
        // hold the controls (steer -1 to 1, gas, brake, drift, item, aim, back), in real time, until hold(null); steer: 'auto'
        // steers as the rivals do (gas: 'auto' too), with dir: 1 or -1 the way a held drift hops
        hold: function (inp) { assisted = true; RS.hold = inp ? Object.assign({}, inp) : null; },
        // run the race on, here and now, `sec` seconds of steps with your controls set to `inp` (or a function of
        // the time and your kart; 'auto', the rivals' driving), and what your kart did every `every` seconds
        run: function (sec, inp, every) {
          assisted = true;
          var k = SIM.karts[0], out = [], n = Math.round((+sec || 0) * 120), ev = Math.max(1, Math.round((every || 0.1) * 120));
          for (var s = 0; s < n; s++) {
            var I = typeof inp === 'function' ? inp(s / 120, k) : inp;
            k.auto = I === 'auto'; k.assist = null;
            if (I && I !== 'auto') { k.inp.steer = +I.steer || 0; k.inp.gas = !!I.gas; k.inp.brake = !!I.brake; k.inp.drift = !!I.drift; k.inp.analog = I.analog !== false; k.inp.item = !!I.item; k.inp.touch = !!I.touch; k.inp.aim = +I.aim || 0; }
            SIM.step();
            if ((s + 1) % ev === 0 || s === n - 1) out.push(sample(k, (s + 1) / 120));
          }
          SIM.acc = 0;
          return out;
        },
        // the rivals off the track (tests of your own driving), or back
        solo: function (on) { assisted = true; RS.solo = !!on; SIM.karts.forEach(function (k, n) { if (n) k.parked = RS.solo; }); },
        autopilot: function (on) { assisted = true; RS.auto = !!on; },
        // the camera for a film: { mode: 'chase' | 'side' | 'front' | 'grid' | 'overhead' | 'free', k, distance,
        // height, side, fov, at, look }; null for play's own
        film: function (c) { assisted = true; RS.film = c || null; CAM.init = false; },
        focus: function (n) { RS.focus = clamp(Math.round(+n || 0), 0, ENT.length - 1); CAM.init = false; },
        timeScale: function (n) { timeScale = clamp(Number(n) || 1, 1, 8); assisted = true; },
        // the next race's seed (a race run again from the same seed and the same controls ends the same)
        seed: function (s) { assisted = true; RS.nextSeed = (+s || 0) >>> 0; },
        // a new race from the grid (the countdown, no flyover), whatever is on
        restart: function () { assisted = true; OW.introSkip = true; startCountdown(); },
        // straight to GO (with { gasAt: -0.75 }: as if the gas went down that long before it)
        go: function (o) { assisted = true; endFly(); var k = SIM.karts[0]; if (o && o.gasAt != null) { k.gasOn = true; k.gasAt = +o.gasAt; k.inp.gas = true; } if (SIM.phase === 'grid' && SIM.count > 0) SIM.count = 1e-6; },
        // a whole race of rivals alone, off screen, from a seed (with you on the autopilot, for the catch-up, if
        // withYou): when each finished, the most any was stuck, the most any rival's pace reached, and a fingerprint
        headless: function (seed, maxSec, withYou, watch) {
          var S2 = kartSim(TR, { laps: laps, cls: cls, seed: (+seed || 1) >>> 0, stats: STATS, human: withYou ? 0 : -1, grid: GRID, items: ITEMS_ON, weights: IWEIGHTS, eager: EAGER, persona: PERSONA });
          if (withYou) S2.karts[0].auto = true;
          S2.start(0); var lim = Math.round((+maxSec || 300) * 120), s = 0, IE = { got: {}, used: {}, hits: {}, blocked: 0, dodged: 0, shielded: 0, crates: 0, slams: 0, hopped: 0 };
          // (and the chaos, kart by kart: falls into a break, the Claw, hits, grinds, charge jumps, bashes, bumps, rage)
          var CH = {}; ['fall', 'rescue', 'hit', 'grind', 'cjump', 'bash', 'bump', 'angry', 'snatch', 'bashed', 'snatched', 'angryed'].forEach(function (x) { CH[x] = S2.karts.map(function () { return 0; }); });
          var spread = [], ring0 = [], seen = [], HB = S2.karts.map(function () { return 0; }), HK = {};
          for (; s < lim; s++) {
            S2.step();
            // (what the items did, counted)
            for (var e = 0; e < S2.events.length; e++) {
              var ev = S2.events[e];
              if (ev[0] === 'got') IE.got[ev[2]] = (IE.got[ev[2]] || 0) + 1; else if (ev[0] === 'item') IE.used[ev[2]] = (IE.used[ev[2]] || 0) + 1; else if (ev[0] === 'hit') IE.hits[ev[2]] = (IE.hits[ev[2]] || 0) + 1;
              else if (ev[0] === 'blocked') IE.blocked++; else if (ev[0] === 'dodge') IE.dodged++; else if (ev[0] === 'shielded') IE.shielded++; else if (ev[0] === 'crate') IE.crates++; else if (ev[0] === 'slam') IE.slams++;
              if (CH[ev[0]] && typeof ev[1] === 'number' && (ev[0] !== 'grind' || ev[3])) CH[ev[0]][ev[1]]++;
              // (and who was on the end of it: bashed, a GM snatched off, hunted)
              if (ev[0] === 'bash' || ev[0] === 'snatch' || ev[0] === 'angry') CH[ev[0] + 'ed'][ev[2]]++;
              // (enemies hit, read off the events: each bash by a kart, each hit on a rival with its id as the 'by')
              if (ev[0] === 'bash') { HB[ev[1]]++; HK.bash = (HK.bash || 0) + 1; } else if (ev[0] === 'hit' && ev[3] >= 0 && ev[3] !== ev[1]) { HB[ev[3]]++; HK[ev[2]] = (HK[ev[2]] || 0) + 1; }
              // (a kart watched: the second before each fall of it)
              if (watch != null && ev[0] === 'fall' && ev[1] === watch && seen.length < 8) seen.push(ring0.slice());
            }
            if (watch != null && s % 6 === 0) { var w0 = sample(S2.karts[watch], s / 120); ring0.push([w0.d, w0.x, w0.v, w0.y, w0.cj, w0.aiCj, w0.cjFor, w0.hop ? 'H' : '', w0.grind, w0.air ? 'A' : '', w0.mad, w0.madAt, w0.rescue, w0.stun].join(' ')); if (ring0.length > 30) ring0.shift(); }
            // (the field's spread, first to last of those still racing, every second)
            if (s % 120 === 0) { var pr = S2.karts.filter(function (q) { return !q.fin; }).map(function (q) { return q.prog; }); if (pr.length > 1) spread.push([+(S2.karts.reduce(function (a, q) { return Math.max(a, q.prog); }, 0) / (S2.laps * TR.L)).toFixed(3), +(Math.max.apply(null, pr) - Math.min.apply(null, pr)).toFixed(1)]); }
            S2.events.length = 0; if (S2.finishers >= S2.karts.length) break;
          }
          return { time: +(s / 120).toFixed(3), times: S2.karts.map(function (q) { return q.fin ? +q.finT.toFixed(3) : null; }), stuck: +Math.max.apply(null, S2.karts.map(function (q) { return q.maxStuck; })).toFixed(2),
            pace: +Math.max.apply(null, S2.karts.slice(1).map(function (q) { return q.maxPace; })).toFixed(4), hash: S2.hash(), items: IE, chaos: CH, spread: spread, falls: seen,
            dealt: S2.karts.map(function (q) { return q.dealt; }), claw3: S2.karts.map(function (q) { return q.claw3; }), hitsByEvents: HB, hitKinds: HK, progress: S2.karts.map(function (q) { return +S2.progress(q).toFixed(4); }) };
        },
        // this race run again from its seed and your logged inputs: its fingerprint against the live one's
        replay: function () { var S2 = SIM.replay(); return { live: SIM.hash(), replay: S2.hash(), steps: SIM.steps, logged: SIM.logN, bytes: SIM.logN * 2, liveTimes: SIM.karts.map(function (q) { return q.fin ? +q.finT.toFixed(3) : null; }), replayTimes: S2.karts.map(function (q) { return q.fin ? +q.finT.toFixed(3) : null; }) }; },
        // the racing line at d metres: its offset across the road, its signed radius (positive turns left), and
        // the speeds it allows turning normally and drifting
        lineAt: function (d) { var LN = SIM.line, i = Math.round(wrapD(+d || 0) / TR.ds) % TN; return { off: +LN.off[i].toFixed(2), r: +LN.r[i].toFixed(1), vn: +LN.vn[i].toFixed(1), vd: +LN.vd[i].toFixed(1) }; },
        line: function () {
          var LN = SIM.line, mr = 1e9, at = 0;
          for (var i = 0; i < TN; i++) if (Math.abs(LN.r[i]) < mr) { mr = Math.abs(LN.r[i]); at = i * TR.ds; }
          return { minRadius: +mr.toFixed(1), at: +at.toFixed(0), slowest: +Math.min.apply(null, Array.prototype.slice.call(LN.vn)).toFixed(1), length: +L.toFixed(1) };
        },
        course: function () { return JSON.parse(JSON.stringify(CO)); },
        // the course's hazards as they run (phase, how far through it, where), as ctx.kart.hazards() gives them a world
        hazards: function () { return ctx.kart && ctx.kart.hazards ? ctx.kart.hazards().map(function (h, q) { return Object.assign(h, { hits: SIM.haz[q].hits, cyc: SIM.haz[q].cyc }); }) : []; },
        // the race's clock set (checks of the hazards, which run on it): s seconds since GO
        clock: function (sec) { assisted = true; SIM.time = Math.max(0, +sec || 0); return SIM.time; },
        // kart n angry at kart m (as if bumped), or calm (m < 0)
        rage: function (n, m) { assisted = true; var k = SIM.karts[clamp(Math.round(+n || 0), 0, ENT.length - 1)]; if (m == null || m < 0) { k.ai.mad = 0; k.ai.calm = 0; return 0; } k.ai.mad = SIM.rules.rage.T; k.ai.madAt = clamp(Math.round(+m), 0, ENT.length - 1); k.ai.calm = 0; return k.ai.mad; },
        coins: function () { return SIM.coins.map(function (c) { return { d: +c.d.toFixed(1), x: +c.x.toFixed(2), on: c.on }; }); },
        rules: function () { return JSON.parse(JSON.stringify(SIM.rules)); },
        standings: function () { return SIM.standings(); },
        // what the race said since the frame last read it (and, with clear, from now on)
        events: function (clear) { var e = SIM.events.map(function (x) { return x.slice(); }); if (clear) SIM.events.length = 0; return e; },
        kart: function (n) { var k = SIM.karts[clamp(Math.round(+n || 0), 0, ENT.length - 1)]; return sample(k, SIM.time); },
        state: kartState,
        // the racer you drive, as if picked on the start screen (an index into the cast, or a racer's id or name)
        pick: function (p) {
          var i = typeof p === 'number' ? p : CAST.findIndex(function (c) { return c.racer === p || c.name === p; });
          if (i < 0) return null; pick(i, true); return { index: RS.pick, racer: CAST[RS.pick].racer, name: CAST[RS.pick].name, order: ORDER.slice() };
        },
        // every level of every roster racer built now, and what each is: triangles, draw calls, the milliseconds it
        // took, and whether any vertex came out NaN
        roster: function () {
          var t0 = performance.now();
          CAST.forEach(function (c) { if (c.H) ['far', 'mid', c.H.near].forEach(function (lv) { c.H.build(lv); }); });
          var ms = performance.now() - t0, B = kartRosterState().builds;
          return { ms: Math.round(ms), builds: B.map(function (b) { return { id: b.id, level: b.level, tris: b.tris, draws: b.draws, ms: b.ms, nan: b.nan }; }), near: quality === 'low' ? 'phone' : 'desktop' };
        },
        // how many racers besides the one the camera follows may be near (films), or every racer at one level
        lod: function (o) { o = o || {}; if (o.near != null) RS.near = clamp(Math.round(+o.near || 0), 0, 7); RS.lodAll = o.all === 'near' || o.all === 'mid' || o.all === 'far' ? o.all : null; DETT.fill(-9); return { near: RS.near, all: RS.lodAll }; },
        // every change of a racer's level so far ([time, kart, from, to]; with clear, from now on)
        lodLog: function (clear) { var l = LODF.log.slice(); if (clear) LODF.log.length = 0; return l; },
        // an item shown on every kart, still, at full size, on its mounts (films of the mounts: 'moon', 'pump',
        // 'wallet', 'diamond', 'wow'); null puts them away
        showItem: function (id) { RS.showItem = id && PREP_PARTS.indexOf(id) >= 0 ? id : null; ENT.forEach(function (e, n) { hideItems(n); }); return RS.showItem; },
        // the race held still (films), or let go
        freeze: function (on) { assisted = true; RS.freeze = !!on; return RS.freeze; },
        // a racer's item mount changed in place (films, while fitting them): kart n's, e.g. { rocket: [x, y, z, scale, pitch] }
        setMount: function (n, o) { var K0 = kitOf(clamp(Math.round(+n || 0), 0, ENT.length - 1)); K0.M = Object.assign({}, K0.M, o || {}); var P = K0.parts.moon; if (P && o && o.rocket) { P.g.position.set(o.rocket[0], o.rocket[1], o.rocket[2]); P.g.rotation.x = -(o.rocket[4] || 0); } return K0.M; },
        // how far each racer's To The Moon rocket stands off its kart: from the bottom of its front strap's bracket
        // straight down to the kart (or, Bike Tyson, the racer) at its near level, metres (null: nothing under it)
        mountGaps: function () {
          var rc = new THREE.Raycaster(), out = {};
          ENT.forEach(function (e, n) {
            var c = CAST[ORDER[n]], R0 = kitOf(n).M.rocket, s = R0[3], p = R0[4] || 0, L0 = c.H ? c.H.show('near', true) : null;
            if (!L0) return;
            var y = -0.37 * s, z = 0.12 * s, ly = y * Math.cos(p) + z * Math.sin(p), lz = z * Math.cos(p) - y * Math.sin(p);
            // (the racer as it sits at rest: no squash, roll or pitch of the moment)
            var m = c.model, r0 = m.rotation.clone(), s0 = m.scale.clone(); m.rotation.set(0, 0, 0); if (c.s0) m.scale.copy(c.s0);
            e.object.updateMatrixWorld(true);
            // (the bracket's foot is 6 cm square, and a cage or a rail under it counts: the nearest of five rays)
            var best = null, dn = new THREE.Vector3(0, -1, 0).transformDirection(e.object.matrixWorld);
            [[0, 0], [-0.05, 0], [0.05, 0], [-0.1, 0], [0.1, 0], [0, -0.03], [0, 0.03]].forEach(function (q) {
              rc.set(e.object.localToWorld(new THREE.Vector3(R0[0] + q[0], R0[1] + ly + 0.02, R0[2] + lz + q[1])), dn);
              var h = rc.intersectObject(L0.group, true)[0]; if (h && (best === null || h.distance < best)) best = h.distance;
            });
            out[c.racer || n] = best === null ? null : +(best - 0.02).toFixed(3);
            m.rotation.copy(r0); m.scale.copy(s0); e.object.updateMatrixWorld(true);
          });
          return out;
        },
        // the race's sound: each engine voice (whose kart, its revs, its level), the drift, the crowd and its cheer
        audio: function () { if (!KA) return null; return { voices: KA.voices.map(function (v, q) { return { kart: KA.who[q], rpm: Math.round(v.st.rpm), thr: +v.st.thr.toFixed(2), level: +v.st.level.toFixed(3) }; }), drift: +KA.driftNow.toFixed(3), crowd: +KA.crowdNow.toFixed(3), cheer: +KA.cheer.toFixed(2), mix: MIX }; },
        // the item mounts of kart n's racer, as used
        mount: function (n) { return JSON.parse(JSON.stringify(kitOf(clamp(Math.round(+n || 0), 0, ENT.length - 1)).M)); },
        // kart n's racer driven by hand for `frames` frames (s: what animate() hears; detail 'near' unless said),
        // and how it looks after: its level, its face's weights, the head's turn and roll, the seat's roll, the level's
        // own lean (Bike Tyson's, further off), and Bike Tyson's rig up close (lean: + his left; wheelie: + nose up)
        pose: function (n, s0, frames) {
          n = clamp(Math.round(+n || 0), 0, ENT.length - 1);
          // (from a still kart: nothing of the race's own moment in it but what s says; null: the race's own)
          var e = ENT[n], c = CAST[ORDER[n]], A = s0 === null ? Object.assign({}, AS[n], { detail: 'near', urgent: true }) : Object.assign({ speed: 0, steer: 0, drift: 0, tier: 0, boost: 0, air: 0, trick: 0, hit: false, bump: false, spun: false,
            place: 1, finished: false, roll: 0, hop: false, back: false, gaze: null, celebrate: false, sad: false }, { detail: 'near', urgent: true }, s0 || {});
          for (var f = 0; f < (frames == null ? 30 : frames); f++) e.animate(t, 1 / 60, A);
          if (!c.H || !c.H.cur) return null;
          var L0 = c.H.cur, hd = L0.api && L0.api.bones && L0.api.bones.head, eu = hd ? new THREE.Euler().setFromQuaternion(hd.quaternion, 'YXZ') : null, W = {};
          for (var w in c.H.st.W) W[w] = +c.H.st.W[w].toFixed(3);
          return { racer: c.racer, level: L0.level, face: W, head: eu ? { yaw: +eu.y.toFixed(3), roll: +eu.z.toFixed(3) } : null, seat: +L0.seat.rotation.z.toFixed(3), lean: +(L0.group.rotation.z || 0).toFixed(3),
            rig: (function () { var r = L0.char.getObjectByName('bike-rig'); if (!r) return null; var q = new THREE.Euler().setFromQuaternion(r.quaternion, 'ZXY'); return { lean: +(-q.z).toFixed(3), wheelie: +(-q.x).toFixed(3) }; })() };
        },
      };

      OW = { ready: true, tick: kartTick, shadow: function () {}, state: null, kart: kartState, kartDebug: DEBUG };
      OW.hero = function (out) { return kartAt(0, 1, out); };
      startDemo();
    }
