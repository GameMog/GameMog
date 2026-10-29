// Mog City: Jane on the car phone. She rides along on the drives, ONLY while Dan is at the wheel: Mission 1's first
// drive (the backstory), every drive in the missions after it, and the drives between them. Every call's lines are
// here (CALLS) as say() tuples, ['Jane', BLUE, '...'] / ['Dan', WHITE, '...', pause], so the voice build
// (wagmi/radio/build/lines.mjs) finds and records each one; docs/STORY.md has the story they tell. Installed by
// wagmi/game.js as W.calls. The missions start their own calls; the drives between missions start by the step.
//   W.calls.start(id, opt)    a call for this step (ui.step). It rings when its trigger is met ('enter-car': `delay` s
//                             after he is rolling in his car, delay + 4 s if he sits in it; 'phase-start': `delay` s
//                             after this, once he is in his car), then plays its main lines, its extras (a block at a
//                             time, 6 s apart) if the drive runs long, and its wrap when wrapWhen() says (after the main
//                             lines when the call has wrapAfterMain). opt: { wrapWhen() -> bool, hurryWhen() -> bool (no
//                             new extra block begun: near the end), step, delay, mode, once (not again once heard) }. Starting the call that is already on does nothing; a call
//                             carrying its main lines into this step (its `carry`) goes on first and this one counts its
//                             delay from its end; any other call hangs up for it.
//   W.calls.stop({ quiet, of })  hang up now (the hang-up sound unless quiet); of: only a call of steps starting so
//                             ('m2:'). The missions' tidy() does it for their own calls on a fail, a quit, a restart
//   W.calls.wrap()            the wrap now (after the line playing), even before protected main lines are done
//   W.calls.pause()           on hold now (he's out and the mission moves on): its pause line after the line playing
//   W.calls.owes(id)          'main' while the live call id still has protected main lines (wrapAfterMain), 'wrap' while
//                             it has the line playing or its wrap to go, else null: an arrival can wait for it (m1.js)
//   W.calls.react(kind)       the next entry of the call's react pool `kind` between its lines ('tooClose', 'spotted',
//                             'hit', 'seen'...): its cooldown kept, onceReact pools once, an `after` pool only after one
//                             of the pools it names; not before the ring, not on hold
//   W.calls.cue(i)            cue i's line once (its `fled` line in the fast register); not before the ring, not on hold
//   W.calls.mode(m)           the register: 'normal' | 'whisper' | 'fast' (the placeholder voice's pace and level; a call
//                             with fastFrom that rings in the fast register opens there, its 'spotted' exchange first)
//   W.calls.auto(step, id, opt)   the call for a step of free roam ('free:<letter>', the way to the next mission), wrapped
//                             up opt.wrapR m (200) from the corona (W.between.at); once per session. Set here: 'free:J'
//                             m2-handoff and 'free:G' m3-handoff. Mission 3 adds 'free:R' m4-teaser (wrapR 120).
//   W.calls.live              the call ringing, on or on hold (its id), else null · W.calls.talking: a call line is up
//   W.calls.heard             ids heard to the end of their main lines this session · W.calls.state(): what it is doing
// Wiring a drive (as m1.js and m2.js do; Mission 3 next): in the phase, once, W.calls?.start('m3-square', { wrapWhen:
// () => dist(me(), ARCH.x, ARCH.z) < 250 }); from the phase's frame hook, its game-state lines (W.calls?.react('seen'),
// W.calls?.cue(0)); in the mission's tidy(), W.calls?.stop({ quiet: true, of: 'm3:' }); a drive of free roam:
// W.calls?.auto('free:R', 'm4-teaser', { wrapR: 120 }). The call's lines and timings stay here, in CALLS.
// The rules (the writer's calls.json):
//   - only at the wheel: out of the car 1.5 s, the line playing finishes, then a pause line (they cycle) and the card says
//     'On hold'; back in, a resume line, then on from the next line. Never a line on foot (but the pause line) or in a
//     cutscene.
//   - the mission's own lines win: while one is up the call waits, and goes on 0.4 s after it clears (a call line cut
//     short by one is said again). A cutscene starting or the step ending hangs up at once (a call not rung yet waits
//     through a cutscene in its step); a wrap already under way finishes in the car (not into a scene).
//   - a call heard to the end of its main lines is not replayed after a retry: its first unheard extra block instead.
//   - the lines speak with their recordings (assets/voice, by speaker and words: W.voice, from the subtitle; Jane's on
//     the phone, Dan's dry), the placeholder mumble until a line is recorded. The radio ducks under the call. The card is
//     ui.caller (Jane's face in it, her mouth with her lines: jane.js); on a phone it sits by the toolbar (ui.js).
const BLUE = '#6CB8FF', WHITE = '#FFFFFF';
// the pause and resume lines of the ordinary calls (each cycles: one each time he gets out, one each time he's back)
const PAUSE = [['Dan', WHITE, 'Hang on. Getting out.'], ['Jane', BLUE, "You got out. I'll hold."]];
const RESUME = [['Jane', BLUE, 'There you are. Where was I?'], ['Jane', BLUE, 'Welcome back. Seatbelt.']];

export const CALLS = {
  // m1-drive (m1 · drive, normal): The call that introduces Jane and the backstory. Its first ~35 s (owner, 28 Oct) say
  // who she is, since arriving at the park hangs up the rest: they're a couple who love each other; she's in because she
  // cares and knows he didn't do it; she works from home (the tracker on her big screen, so she can stay on all day);
  // she knows the city's streets cold (Sixth goes uptown, Ninth moves at six). Then the frame, Mr. Big, the couch and
  // Moon, the laptop and why it matters (~94 s, protected: the wrap waits for it). The extras carry the rest (the firing
  // and the headline, the printer card, SUNY and the ketchups, Moon, her job, the lawyer). Lines 1-5 and the wrap are
  // the old call, word for word (recorded). Wrap: Dan within 250 m of DEST (Chelsea Park) and the main lines done (an
  // extra block is cut at its next line). Arriving first: the arrival scene hangs up whatever is left.
  'm1-drive': {
    step: 'm1:drive', trigger: 'enter-car', delay: 3, wrapAfterMain: true,
    main: [
      ['Jane', BLUE, 'Dan. Why is your laptop doing forty down Fifth Avenue?'],
      ['Dan', WHITE, 'Because some guys in a van took it.'],
      ['Jane', BLUE, "...Okay. I'm on the tracker. They're cutting west. Who were they?"],
      ['Dan', WHITE, 'Guys from my old job.'],
      ['Jane', BLUE, 'So, JPBank. Great, narrows it down.'],
      ['Dan', WHITE, "Don't you have work?"],
      ['Jane', BLUE, "I work from home. Commute's a hallway. Tracker's on my big screen."],
      ['Dan', WHITE, "I'll take Sixth Avenue."],
      ['Jane', BLUE, 'Sixth goes uptown, babe. Take Ninth. It moves at six.'],
      ['Dan', WHITE, 'Love you. Getting it in before prison.'],
      ['Jane', BLUE, "Love you too. You didn't do this. So we prove it.", 0.6],
      ['Dan', WHITE, 'Then their CEO called me. On video. From a leather chair.'],
      ['Jane', BLUE, 'Mr. Big called you? Himself?'],
      ['Dan', WHITE, "He wants a signed confession. 'Terms by text.' Like a dentist."],
      ['Jane', BLUE, "You're not signing anything."],
      ['Dan', WHITE, 'Somebody at JPBank bought Blimpco a week before the merger. With my login.'],
      ['Jane', BLUE, 'The blimp company.'],
      ['Dan', WHITE, "Airship company. They're sensitive about it."],
      ['Jane', BLUE, 'And the night those trades went in, you were where?'],
      ['Dan', WHITE, 'On your couch. With Moon asleep on my feet.'],
      ['Jane', BLUE, 'I know. I was right there.'],
      ['Jane', BLUE, 'So why do they want the laptop this bad?'],
      ['Dan', WHITE, "The deal room's access log. Keeping it was my job. I kept my own copy."],
      ['Dan', WHITE, 'Whoever logged in as me did it from the fifty-first floor.'],
      ['Jane', BLUE, "What's on fifty-one?"],
      ['Dan', WHITE, "Mr. Big. And his bathroom. It's a very big bathroom."],
      ['Jane', BLUE, 'So yours is the only clean copy. Tell me you backed it up.'],
      ['Dan', WHITE, 'Bank rule. Nothing leaves the laptop.'],
      ['Jane', BLUE, 'Except the laptop.'],
      ['Dan', WHITE, 'Except the laptop.'],
    ],
    extra: [
      [
        ['Dan', WHITE, "Monday they fired me. Wednesday they charged me. Today I'm a headline."],
        ['Jane', BLUE, "'The face of insider trading.' At least it's a good photo."],
        ['Dan', WHITE, "It's my badge photo. I look like a hostage."],
        ['Jane', BLUE, 'You looked like that at SUNY. In the library. Two a.m.'],
        ['Dan', WHITE, 'Printing my JPBank cover letter.'],
        ['Jane', BLUE, "On my printer card. You said you'd pay me back."],
        ['Dan', WHITE, 'Two hot dogs. I was making a statement.'],
        ['Jane', BLUE, "The statement was mustard. It's still on my coat."],
      ],
      [
        ['Dan', WHITE, 'You never asked if I did it.'],
        ['Jane', BLUE, "Since SUNY you haven't done one sneaky thing."],
        ['Dan', WHITE, 'I took two ketchups once.'],
        ['Jane', BLUE, 'And told the cashier.'],
      ],
      [
        ['Dan', WHITE, "How's Moon?"],
        ['Jane', BLUE, 'Asleep on your hoodie. She ate one of your socks.'],
        ['Dan', WHITE, 'The good one?'],
        ['Jane', BLUE, 'She only eats the good ones. She misses you.'],
        ['Dan', WHITE, "Tell her I'm on a business trip. Business is bad."],
      ],
      [
        ['Dan', WHITE, "How's work?"],
        ['Jane', BLUE, "The hospital's billing system thinks a man in Queens is a hundred and twelve and pregnant."],
        ['Dan', WHITE, 'Is he?'],
        ['Jane', BLUE, "He's forty and very confused. I fixed it. Nobody will ever know."],
        ['Dan', WHITE, "I'll know."],
        ['Jane', BLUE, "You're a fugitive. You don't count."],
        ['Dan', WHITE, "I'm not a fugitive. I'm charged. It's different."],
        ['Jane', BLUE, 'How?'],
        ['Dan', WHITE, 'More paperwork.'],
      ],
      [
        ['Jane', BLUE, 'What happened to the lawyer?'],
        ['Dan', WHITE, "She read the paper and said I'm 'not a good fit'."],
        ['Jane', BLUE, 'Lawyers say that?'],
        ['Dan', WHITE, 'They say it to guys whose face is on the paper.'],
        ['Jane', BLUE, "Then we find one who reads logs. I'll bring the logs."],
      ],
      [
        ['Jane', BLUE, 'Are you driving like a banker or like a person?'],
        ['Dan', WHITE, "What's the difference?"],
        ['Jane', BLUE, 'A banker thinks red lights are a suggestion.'],
        ['Dan', WHITE, "I'm stopping at every light."],
        ['Jane', BLUE, 'Liar. I can hear the rockets.'],
      ],
    ],
    wrap: [
      ['Jane', BLUE, "Tracker stopped. Chelsea Park, Ninth and Twenty-Eighth. Don't do anything stupid."],
      ['Dan', WHITE, 'Define stupid.'],
      ['Jane', BLUE, 'Going there alone.'],
      ['Dan', WHITE, "Then I'm already doing it."],
    ],
    pause: PAUSE,
    resume: RESUME,
  },
  // m2-handoff (m2 · handoff, normal): The burner, how Jane will trace its twin, and Dan's mom. Wrap: Dan within 200 m
  // of J_AT (Bryant Park, 6th Ave side). Arriving in the corona starts the Burner scene: hang up.
  'm2-handoff': {
    step: 'free:J', trigger: 'enter-car', delay: 3,
    main: [
      ['Jane', BLUE, 'Okay. The burner. Your new pen pal.'],
      ['Dan', WHITE, "'Nice moves. Your laptop says hi. Keep this phone on.' Signed, Mr. Big."],
      ['Jane', BLUE, 'He signs his texts. Like a birthday card.'],
      ['Dan', WHITE, 'A birthday card that wants me in prison.'],
      ['Jane', BLUE, "Here's the thing. Burners come in batches. Same batch, same buyer."],
      ['Jane', BLUE, "If this one has a twin, it's in somebody's pocket. And it pings."],
      ['Dan', WHITE, 'And you can find the ping.'],
      ['Jane', BLUE, 'I read logs for a living. I can find anything that pings.'],
      ['Dan', WHITE, 'You read hospital logs.'],
      ['Jane', BLUE, 'Hospital logs, bank logs, burner logs. Everybody leaves logs.', 0.8],
      ['Jane', BLUE, 'Also, your mom called me.'],
      ['Dan', WHITE, 'Why did my mom call you?'],
      ['Jane', BLUE, "Because you didn't pick up. She saw the paper."],
      ['Dan', WHITE, 'What did she say?'],
      ['Jane', BLUE, 'That you never did a bad thing in your life. Except the haircut in ninth grade.'],
      ['Dan', WHITE, 'That haircut was a choice.'],
      ['Jane', BLUE, 'She says eat something, and she believes you. In that order.'],
      ['Dan', WHITE, "Tell her I'm eating."],
      ['Jane', BLUE, 'Are you eating?'],
      ['Dan', WHITE, "I'm driving past a hot dog cart. Spiritually, I'm eating."],
    ],
    extra: [
      [
        ['Dan', WHITE, 'You know what the worst part is?'],
        ['Jane', BLUE, 'The prison part?'],
        ['Dan', WHITE, 'The loans. I took this job to pay off the loans.'],
        ['Jane', BLUE, 'Seventy-eight thousand at six point eight percent.'],
        ['Dan', WHITE, 'You know my loans by heart?'],
        ['Jane', BLUE, "I made a dashboard. It's green when you pay. It's been red since Monday."],
      ],
      [
        ['Dan', WHITE, "When this is over, I'm moving in with you."],
        ['Jane', BLUE, "You've said that since graduation."],
        ['Dan', WHITE, 'I was waiting for my bonus.'],
        ['Jane', BLUE, 'You were waiting for my radiator to stop clanking.'],
        ['Dan', WHITE, 'Does it still clank?'],
        ['Jane', BLUE, "Moon sleeps against it. She thinks it's talking to her."],
      ],
      [
        ['Jane', BLUE, 'Where are you?'],
        ['Dan', WHITE, "Behind a bus that says 'Smile, New York.'"],
        ['Jane', BLUE, 'Are you smiling?'],
        ['Dan', WHITE, "I'm behind a bus. I'm doing my best."],
      ],
    ],
    wrap: [
      ['Jane', BLUE, "Bryant Park, Sixth Ave side. I'm at a table. Moon's under it."],
      ['Dan', WHITE, 'Is she guarding you?'],
      ['Jane', BLUE, "She's guarding a pretzel."],
    ],
    pause: PAUSE,
    resume: RESUME,
  },
  // m2-go (m2 · go, normal): Short: the drive is ~840 m. The Occupy sign foreshadows Mission 3 (its payoff is in
  // m3-return). The how-to is the wrap (and the tail's help card). Wrap: Times Square reached (S.square: within 160 m
  // of the van) and the main lines done.
  'm2-go': {
    step: 'm2:go', trigger: 'enter-car', delay: 2.5, wrapAfterMain: true, carry: ['m2:tail'],
    main: [
      ['Jane', BLUE, "Okay, I'm back at my table. Moon says drive safe."],
      ['Dan', WHITE, 'Moon said that?'],
      ['Jane', BLUE, 'She sneezed. Same thing.'],
      ['Jane', BLUE, "The twin's still on. Seventh and Forty-Seventh, idling at the curb."],
      ['Jane', BLUE, 'Also. The Occupy camp in Washington Square made a sign about you.'],
      ['Dan', WHITE, 'Nice or mean?'],
      ['Jane', BLUE, 'It rhymes.'],
      ['Dan', WHITE, 'So, mean.'],
      ['Jane', BLUE, "'Dan, Dan, the greedy man.'"],
      ['Dan', WHITE, "I owe seventy-eight grand in student loans. I'm the least greedy man in Manhattan."],
      ['Jane', BLUE, "I know. They don't. Yet."],
    ],
    extra: [
      [
        ['Jane', BLUE, "When you see the van, don't pull up next to it. Park, wait, let it move first."],
        ['Dan', WHITE, "Wait, then follow. I've seen movies."],
        ['Jane', BLUE, "You've seen one movie. You fell asleep."],
      ],
      [
        ['Jane', BLUE, "You're taking the long way."],
        ['Dan', WHITE, "I'm taking the legal way."],
        ['Jane', BLUE, 'Since when?'],
        ['Dan', WHITE, "Since I got charged with a crime. I'm very law-abiding now."],
      ],
      [
        ['Jane', BLUE, 'Moon finished the pretzel.'],
        ['Dan', WHITE, 'The whole pretzel?'],
        ['Jane', BLUE, 'The whole pretzel, and a napkin. She has no regrets.'],
      ],
    ],
    wrap: [
      ['Jane', BLUE, "That's it. The van at the curb. Stay in the car."],
      ['Jane', BLUE, "Let it pull out first. Then you're a tail."],
    ],
    pause: PAUSE,
    resume: RESUME,
  },
  // m2-tail (m2 · tail, whisper): Jane whispers and coaches the whole tail. Lines 6-11 are the old tail call
  // (recorded); she is whispering in the new ones only, so the old six can stay as recorded or be re-recorded
  // whispered (lines.json lists them as optional re-takes). Wrap: The van within 120 m of the yard gate (or
  // vanD.done): play the wrap. The yard phase then starts on foot (Jane's DM stays).
  'm2-tail': {
    step: 'm2:tail', trigger: 'phase-start', delay: 9, mode: 'whisper', fastFrom: 5, cool: 7, onceReact: ['spotted'], after: { good: ['tooClose', 'falling'] },
    main: [
      ['Jane', BLUE, "Hey. It's me. I'm whispering."],
      ['Dan', WHITE, 'Why are you whispering?'],
      ['Jane', BLUE, "It's a tail. You whisper on a tail."],
      ['Dan', WHITE, "They're in a van, Jane. A block ahead."],
      ['Jane', BLUE, 'Then whisper louder.'],
      ['Jane', BLUE, "I've got the van. 'JPBank Security.' On the side. Subtle."],
      ['Dan', WHITE, 'They took my laptop, Jane. None of this is subtle.'],
      ['Jane', BLUE, "It's registered to a Mack Moneybags. Mack. He runs Midtown for the bank's security."],
      ['Dan', WHITE, 'Mack Moneybags. Did his parents hate him?'],
      ['Jane', BLUE, 'He picked it. He has it tattooed. In cursive.'],
      ['Jane', BLUE, "Hang back. If they make you, they'll bolt."],
      ['Jane', BLUE, "They're heading west. Toward the river. Nothing out there but yards and wind."],
      ['Dan', WHITE, 'Why would bank security need a yard?'],
      ['Jane', BLUE, "Somewhere to put things nobody's supposed to find."],
      ['Jane', BLUE, 'Let a car get between you. Be boring.'],
      ['Dan', WHITE, "I'm in a car with rockets."],
      ['Jane', BLUE, 'Be a boring car with rockets.'],
    ],
    extra: [
      [
        ['Jane', BLUE, "Mack's got a sports sedan too. Plate: MACK ONE."],
        ['Dan', WHITE, 'Of course it is.'],
        ['Jane', BLUE, 'Leased. Everything Mack has is leased.'],
        ['Dan', WHITE, 'Even the tattoo?'],
        ['Jane', BLUE, 'Especially the tattoo.'],
      ],
      [
        ['Dan', WHITE, "What's Moon doing?"],
        ['Jane', BLUE, 'Watching the tracker with me. She growls when the van turns.'],
        ['Dan', WHITE, "She's never growled in her life."],
        ['Jane', BLUE, "She's growling on the inside."],
      ],
    ],
    wrap: [
      ['Jane', BLUE, "They're turning in. The container yard on Twelfth."],
      ['Jane', BLUE, "I'm hanging up before your phone rings in there."],
      ['Dan', WHITE, "It's on silent."],
      ['Jane', BLUE, "It's never on silent."],
    ],
    pause: [['Jane', BLUE, "Get back in your car. The van won't wait."]],
    resume: [['Jane', BLUE, 'Good. Find the van. Stay back.']],
    react: {
      tooClose: [
        [['Jane', BLUE, 'Too close. Ease off.']],
        [['Jane', BLUE, "You're in his mirrors. Drop back."]],
        [['Jane', BLUE, 'Dan. Back. Off.']],
      ],
      falling: [
        [['Jane', BLUE, "You're losing him. Close it up a little."]],
        [['Jane', BLUE, "Don't lose him. He's turning."]],
      ],
      good: [
        [['Jane', BLUE, 'Better. Stay right there.']],
      ],
      spotted: [
        [
          ['Jane', BLUE, "He made you! Go, go, don't lose him!"],
          ['Dan', WHITE, 'Going!'],
        ],
      ],
    },
    cues: [
      { line: ['Jane', BLUE, "He's turning up Tenth. Take the corner easy."], fled: ['Jane', BLUE, 'Up Tenth! Go!'] },
      { line: ['Jane', BLUE, "Left on Fifty-Fifth. That's the river. That's the yards."], fled: ['Jane', BLUE, 'Fifty-Fifth! Left, left!'] },
    ],
  },
  // m2-chase (m2 · chase, fast): Fast and clipped. Lines 1-3 are the old chase call (recorded). Most rams end it in
  // 40-60 s; a pure follow runs ~2.5 min to Greeley Square, hence the extras. Wrap: None: the crash scene hangs the
  // call up (hangup sound). Lines not played are dropped.
  'm2-chase': {
    step: 'm2:chase', trigger: 'phase-start', delay: 5, mode: 'fast', cool: 7, onceReact: ['smoking'],
    main: [
      ['Jane', BLUE, "That's Mack's car. He's heading for Herald Square."],
      ['Jane', BLUE, 'Ram him, Dan. Gently. Ish.'],
      ['Dan', WHITE, "There's no gentle way to ram a car."],
      ['Jane', BLUE, "He's got your door on his phone. Don't let that phone get away."],
      ['Dan', WHITE, 'Not planning to.'],
      ['Jane', BLUE, "He drives like he's late for his bonus."],
      ['Dan', WHITE, "He is late for his bonus. I'm making him later."],
    ],
    extra: [
      [
        ['Jane', BLUE, "How's the car?"],
        ['Dan', WHITE, 'Fast. Loud. Possibly illegal.'],
        ['Jane', BLUE, "Like Mack's tattoo."],
      ],
      [
        ['Jane', BLUE, "Moon's barking at my screen."],
        ['Dan', WHITE, "Tell her I've got him."],
        ['Jane', BLUE, "She says you don't. She's a realist."],
      ],
      [
        ['Jane', BLUE, 'He just ran a red. And a yellow. And somehow a green.'],
        ['Dan', WHITE, 'How do you run a green?'],
        ['Jane', BLUE, 'Ask Mack.'],
      ],
      [
        ['Jane', BLUE, "I've got him on a traffic camera. He's crying."],
        ['Dan', WHITE, 'Real tears?'],
        ['Jane', BLUE, 'Leased.'],
      ],
    ],
    wrap: [
    ],
    pause: [['Jane', BLUE, "You can't catch Mack on foot! Get back in!"]],
    resume: [['Jane', BLUE, "Go! He's getting away!"]],
    react: {
      hit: [
        [
          ['Jane', BLUE, "That's not gentle!"],
          ['Dan', WHITE, 'That was gentle.'],
        ],
        [['Jane', BLUE, 'Okay. That one was ish.']],
      ],
      far: [
        [['Jane', BLUE, "He's pulling away! Boost!"]],
        [['Jane', BLUE, "Don't lose him! Shift, Dan!"]],
      ],
      smoking: [
        [['Jane', BLUE, "He's smoking! One more!"]],
      ],
    },
    cues: [
      { line: ['Jane', BLUE, "He's going down Eleventh. Past the convention center."] },
      { line: ['Jane', BLUE, "Left on Thirty-Fourth! He's going into traffic!"] },
      { line: ['Jane', BLUE, "Herald Square's a mess. He's going to crash. Be there when he does."] },
    ],
  },
  // m3-handoff (m3 · toGarage, normal): Night falls on this drive: tired, warm. The bonus he never got, Rook, Jane's
  // safety. Wrap: Dan within 200 m of Gears' garage (G_AT). Arriving in the corona starts Mission 3: hang up.
  'm3-handoff': {
    step: 'free:G', trigger: 'enter-car', delay: 3,
    main: [
      ['Jane', BLUE, "I saw the chat. They know where you live, so you're not sleeping there tonight."],
      ['Dan', WHITE, 'Where am I sleeping?'],
      ['Jane', BLUE, "Gears has a room over his garage. West Chelsea. He builds rockets for cars. He's nice. Mostly."],
      ['Dan', WHITE, 'Why not your place?'],
      ['Jane', BLUE, "Because they've got your door. Mine's next. I'm not giving them two for one."],
      ['Dan', WHITE, 'So where are you sleeping?'],
      ['Jane', BLUE, "Home. With Moon and a baseball bat. Moon's the scary one."],
      ['Dan', WHITE, "Moon's afraid of pigeons."],
      ['Jane', BLUE, "The bat isn't.", 0.8],
      ['Dan', WHITE, 'Rook says he wants out.'],
      ['Jane', BLUE, "Rook says. Let's see what Rook does."],
      ['Dan', WHITE, "He was the only one in that chat who said 'this is getting weird.'"],
      ['Jane', BLUE, "He's a first-year too. Different floor, same treatment."],
      ['Dan', WHITE, "You know what else was in that chat? A thread called 'bonus pool.'"],
      ['Jane', BLUE, 'Security gets bonuses?'],
      ['Dan', WHITE, 'Security gets bonuses. First-years get fired three weeks before theirs.'],
      ['Jane', BLUE, 'How much was yours going to be?'],
      ['Dan', WHITE, "Enough for a year of the loans. And a couch that isn't yours."],
      ['Jane', BLUE, 'You love my couch.'],
      ['Dan', WHITE, "I love your couch. Moon loves your couch. It's a crowded couch."],
    ],
    extra: [
      [
        ['Dan', WHITE, 'How was your day? Apart from me.'],
        ['Jane', BLUE, "Apart from you, I found out why the hospital's printers print in Portuguese."],
        ['Dan', WHITE, 'Why do they?'],
        ['Jane', BLUE, 'Someone set them to Portuguese. That was the whole mystery. It took four hours.'],
        ['Dan', WHITE, 'You love it.'],
        ['Jane', BLUE, 'I love it.'],
      ],
      [
        ['Jane', BLUE, 'Dan. You okay?'],
        ['Dan', WHITE, "No job, no laptop, a car with rockets. I'm great."],
        ['Jane', BLUE, 'For real.'],
        ['Dan', WHITE, "For real, I'm tired of being blamed. I'd like to be tired of something else."],
        ['Jane', BLUE, "We'll find you something else to be tired of. Promise."],
      ],
    ],
    wrap: [
      ['Jane', BLUE, "That's Gears' place. Big door, loud sign. Knock twice."],
      ['Dan', WHITE, 'Why twice?'],
      ['Jane', BLUE, "Once, he thinks it's a delivery. Twice, he thinks it's me."],
    ],
    pause: PAUSE,
    resume: RESUME,
  },
  // m3-square (m3 · square, normal): The Occupy slant. Main (protected: the wrap waits for it) is the camp, the party,
  // the reel, why, how to kill it, the planted Suits (~75 s). Ms. Bea (who leads the people's mic later) is the first
  // extra: a typical drive (plus the thrusters' practice) hears her. Wrap: Dan within 250 m of the arch (ARCH) or on
  // 5th Ave's last stretch (at5th), and the main lines done. The rally scene hangs up whatever is left.
  'm3-square': {
    step: 'm3:square', trigger: 'phase-start', delay: 7, wrapAfterMain: true,
    main: [
      ['Jane', BLUE, 'Okay. Washington Square. You know about the camp?'],
      ['Dan', WHITE, 'Occupy JPBank. Tents and drums under the arch.'],
      ['Jane', BLUE, 'Forty-one days. Bailouts, bonuses, foreclosures. They want an audit of the bank.'],
      ['Jane', BLUE, 'Every night the news shows the tents, and JPBank looks worse.'],
      ['Dan', WHITE, 'So the bank throws a party next door.'],
      ['Jane', BLUE, "'JPBank Loves New York.' Free hot dogs, a stage, and Fiona on a megaphone."],
      ['Dan', WHITE, "Who's Fiona?"],
      ['Jane', BLUE, 'Head of Community. Her business card has glitter on it. Real glitter.'],
      ['Jane', BLUE, 'And three big screens on rigs on the lawn, pointed right at the tents.'],
      ['Jane', BLUE, "Running a reel on a loop. You, ten feet tall. 'The bad apple.'"],
      ['Dan', WHITE, "Please tell me it's not the badge photo."],
      ['Jane', BLUE, "It's the badge photo.", 0.6],
      ['Jane', BLUE, "That's the pitch. The bank isn't rotten. It had one bad apple, and it caught him."],
      ['Dan', WHITE, "And if it's one bad apple, nobody checks the orchard."],
      ['Jane', BLUE, 'No audit. Nobody looks at the fifty-first floor.'],
      ['Jane', BLUE, 'The reel runs off the three rigs. The big screen under the arch just mirrors them.'],
      ['Jane', BLUE, 'Kill the rigs, the reel dies.'],
      ['Dan', WHITE, 'And no reel, no bad apple.'],
      ['Jane', BLUE, "And no bad apple, Fiona's just a lady with a megaphone and a lot of hot dogs."],
      ['Jane', BLUE, "Careful. The Suits are in the crowd. They'll start something and pin it on you."],
      ['Dan', WHITE, "So if I smash their screens at a community day, I'm the bad apple."],
      ['Jane', BLUE, "You're already the bad apple. Be a fast one."],
    ],
    extra: [
      [
        ['Jane', BLUE, "One more thing. The camp's kitchen is run by Ms. Bea."],
        ['Dan', WHITE, 'Should I know Ms. Bea?'],
        ['Jane', BLUE, 'She taught me seventh-grade science. She will not let you be rude.'],
        ['Dan', WHITE, "I'm never rude."],
        ['Jane', BLUE, 'Two weeks ago you walked past the camp in a suit, and a man with a drum told you to quit your job.'],
        ['Dan', WHITE, "And then I got fired. He's a prophet. I owe him a drum."],
      ],
      [
        ['Dan', WHITE, 'Why is your science teacher living in a tent?'],
        ['Jane', BLUE, 'JPBank took her house. Thirty years of payments, three months late.'],
        ['Dan', WHITE, 'Three months?'],
        ['Jane', BLUE, 'Her husband was sick. The bank sent a letter. Then a locksmith.'],
        ['Dan', WHITE, 'And now a hot dog party.'],
        ['Jane', BLUE, 'And now a hot dog party.'],
      ],
      [
        ['Dan', WHITE, 'You know the bailout paid for my training class?'],
        ['Jane', BLUE, 'Your what?'],
        ['Dan', WHITE, 'First-year training. Six weeks in a hotel ballroom. A man in a vest explaining risk.'],
        ['Jane', BLUE, 'Did he explain it?'],
        ['Dan', WHITE, 'He explained it belongs to other people.'],
      ],
      [
        ['Jane', BLUE, "How's Gears?"],
        ['Dan', WHITE, 'He made me breakfast and showed me a scar from a thruster.'],
        ['Jane', BLUE, 'A big scar?'],
        ['Dan', WHITE, "He said it's a small scar on a big man."],
      ],
    ],
    wrap: [
      ['Jane', BLUE, "That's the arch. Park on Fifth and walk in."],
      ['Jane', BLUE, "I'll be watching the broadcast. Be quick."],
      ['Dan', WHITE, "I'm always quick."],
      ['Jane', BLUE, "You're always late."],
    ],
    pause: PAUSE,
    resume: RESUME,
  },
  // m3-escape (m3 · escape, fast): Fast and clipped. Lines 1-3 are the old escape call (recorded). Wrap: The pursuit's
  // 'lost' event: after the line playing, the wrap (the phase then waits 1.5 s and 'ret' starts; its call waits for
  // this one to end, then rings 8 s later).
  'm3-escape': {
    step: 'm3:escape', trigger: 'phase-start', delay: 9, mode: 'fast', carry: ['m3:ret'], cool: 6,
    main: [
      ['Jane', BLUE, 'Two of their cars on you. The Village is all crooked streets. Use them.'],
      ['Dan', WHITE, 'Gears said the thrusters were very safe.'],
      ['Jane', BLUE, 'Gears says that about everything.'],
      ['Jane', BLUE, 'Break their line. Corners, Dan. Corners.'],
      ['Dan', WHITE, "I'm cornering!"],
      ['Jane', BLUE, 'Corner harder.'],
      ['Jane', BLUE, 'Hop the traffic if you have to.'],
      ['Dan', WHITE, 'Hopping!'],
      ['Jane', BLUE, 'Did you just jump a taxi?'],
      ['Dan', WHITE, 'Very safe. Mostly.'],
    ],
    extra: [
      [
        ['Jane', BLUE, "Bea's people are filming you from the park."],
        ['Dan', WHITE, 'Tell them to get my good side.'],
        ['Jane', BLUE, "You're in a car."],
        ['Dan', WHITE, 'The car is my good side.'],
      ],
    ],
    wrap: [
      ['Jane', BLUE, "They're gone. You lost them."],
      ['Dan', WHITE, 'I lost them.'],
      ['Jane', BLUE, "Don't sound so surprised."],
    ],
    pause: [['Jane', BLUE, 'On foot? Dan, they have cars! Get back in!']],
    resume: [['Jane', BLUE, 'Go, go!']],
    react: {
      seen: [
        [['Jane', BLUE, "They've got you again. Turn!"]],
        [['Jane', BLUE, 'Still on you. Next corner!']],
      ],
      searching: [
        [['Jane', BLUE, 'They lost you. Keep it that way.']],
        [['Jane', BLUE, 'Out of sight. Keep going.']],
      ],
    },
  },
  // m3-return (m3 · ret, normal): The payoff and the hook (protected: the wrap waits for it). "Good." is the old
  // recorded line. Wrap: Dan within 150 m of Gears' door. Arriving starts the home scene: hang up.
  'm3-return': {
    step: 'm3:ret', trigger: 'phase-start', delay: 8, wrapAfterMain: true,
    main: [
      ['Jane', BLUE, "Okay. Breathe. You're clear."],
      ['Dan', WHITE, 'Breathing. Did it work?'],
      ['Jane', BLUE, "The reel died mid-sentence. 'The face of insider trad—' and then black."],
      ['Dan', WHITE, 'Good.'],
      ['Jane', BLUE, 'Better than good. The camp filmed the whole thing. Forty phones.'],
      ['Jane', BLUE, "Bank security jumping the bank's own bad apple, at a free hot dog party."],
      ['Dan', WHITE, 'When you put it like that, I sound innocent.'],
      ['Jane', BLUE, 'You are innocent. Now it looks like it.'],
      ['Jane', BLUE, "Bea got on the people's mic. The whole park was chanting 'Free Dan.'"],
      ['Dan', WHITE, "I've never had a chant."],
      ['Jane', BLUE, "And she crossed out 'greedy' on that sign. Now it says 'Dan, Dan, the fall man.'"],
      ['Dan', WHITE, "That's... actually accurate.", 0.8],
      ['Jane', BLUE, "If the camp gets its audit, the insiders go down with Mr. Big. They're panicking. At him, for once."],
      ['Dan', WHITE, "That's why he moved the laptop up to dawn."],
      ['Jane', BLUE, "And Rook's driving it. The one who wants out."],
      ['Dan', WHITE, 'Either he wants out, or Mr. Big wants me alone in a dark park.'],
      ['Jane', BLUE, "So we're careful."],
      ['Dan', WHITE, "We're never careful."],
      ['Jane', BLUE, 'We start tonight. Go back to Gears. Eat something. Sleep an hour.'],
      ['Dan', WHITE, 'Yes, Ms. Bea.'],
      ['Jane', BLUE, "Don't. She'd like you, by the way. She says you have a polite face."],
      ['Dan', WHITE, "Tell her it's the only one I've got."],
    ],
    extra: [
      [
        ['Jane', BLUE, 'Moon watched the whole thing on my laptop.'],
        ['Dan', WHITE, 'Was she proud?'],
        ['Jane', BLUE, 'She barked at Fiona and slept through the chase.'],
        ['Dan', WHITE, 'Priorities.'],
      ],
      [
        ['Jane', BLUE, 'Your mom saw it on the news.'],
        ['Dan', WHITE, 'Which part?'],
        ['Jane', BLUE, "The chanting. She called the station to say you're a very polite boy."],
        ['Dan', WHITE, 'Did they put her on?'],
        ['Jane', BLUE, 'They put her on. Twice.'],
      ],
      [
        ['Dan', WHITE, 'How many people are we talking? Chanting.'],
        ['Jane', BLUE, "The park. And eleven thousand people watching JPBank's own broadcast."],
        ['Dan', WHITE, 'JPBank broadcast me getting jumped by JPBank.'],
        ['Jane', BLUE, 'Live. They paid for it, too.'],
      ],
    ],
    wrap: [
      ['Jane', BLUE, "There's the garage. Go. Sleep."],
      ['Dan', WHITE, 'Love you.'],
      ['Jane', BLUE, 'Love you. Go.'],
    ],
    pause: PAUSE,
    resume: RESUME,
  },
  // m4-teaser (m3 · toRook, normal): Optional: a short warm call so the drive to the teaser is not silent. Mission 4
  // is coming soon, so the wrap says Rook is not there yet. Wrap: Dan within 120 m of R_AT (the bench).
  'm4-teaser': {
    step: 'free:R', trigger: 'enter-car', delay: 4,
    main: [
      ['Jane', BLUE, "You're going to see Rook."],
      ['Dan', WHITE, 'He said come alone.'],
      ['Jane', BLUE, "He said. I didn't. I'm on the phone. That's alone-ish."],
      ['Dan', WHITE, 'Alone-ish.'],
      ['Jane', BLUE, 'If anything feels off, you drive away. Promise me.'],
      ['Dan', WHITE, 'Promise.'],
    ],
    extra: [
      [
        ['Dan', WHITE, 'What do you think Rook wants?'],
        ['Jane', BLUE, 'Out. Like he said.'],
        ['Dan', WHITE, 'Everybody wants out of something.'],
        ['Jane', BLUE, "I don't. I like my couch."],
      ],
      [
        ['Jane', BLUE, "Moon's asleep on your hoodie again."],
        ['Dan', WHITE, "Tell her I'm coming home soon."],
        ['Jane', BLUE, "She knows. She's keeping it warm."],
      ],
    ],
    wrap: [
      ['Jane', BLUE, 'No Rook yet.'],
      ['Dan', WHITE, "He'll come."],
      ['Jane', BLUE, 'Then we wait. Together. Ish.'],
    ],
    pause: PAUSE,
    resume: RESUME,
  },
};

// the drives between missions: the step of free roam on the way to the next one, its call, wrapped up wrapR m out
const AUTO = { 'free:J': { id: 'm2-handoff', wrapR: 200 }, 'free:G': { id: 'm3-handoff', wrapR: 200 } };
// the placeholder mumble's pitch for a line not recorded yet
const VOICE = { Dan: 120, Jane: 205 };
const OUT_HOLD = 1.5, AFTER_OTHER = 0.4, EXTRA_GAP = 6, RING = 1.5, STALE = 9;

export function install(W) {
  if (!W.calls) W.calls = createCalls(W);
  return W.calls;
}

export function createCalls(W) {
  const heard = new Map(); // id -> { main: heard to the end, extra: the blocks heard, rang }
  const autos = new Map(Object.entries(AUTO));
  let cur = null, next = null, autoAt = null;
  const now = () => (W.clock ? W.clock.now() : performance.now());
  const cm = () => W.app?.controllerManager;
  // (at the wheel: not climbing in or out)
  const inCar = () => cm()?.activeMode === 'car' && !['in', 'out', 'bail', 'walk'].includes(W.ride?.phase);
  const scene = () => !!(W.cutscene || W.directed);
  const me = () => (cm()?.activeMode === 'car' ? W.car?.position : W.person?.position);
  // the line on screen ('JANE' + its words), or null: one that isn't the call's is the mission's
  const subNow = () => { const e = document.querySelector('#wg .wg-sub'); return e && !e.classList.contains('hide') ? e.textContent : null; };
  const heardOf = (id) => { if (!heard.has(id)) heard.set(id, { main: false, extra: new Set(), rang: false }); return heard.get(id); };
  const card = (status) => W.ui?.caller?.('Jane', BLUE, status);
  const mainLeft = (C) => C.mainI < C.def.main.length || C.line?.kind === 'main' || C.again?.kind === 'main';
  // (under the call: the music bus when the game's mixer has the radio, else the radio's own duck)
  const duck = (secs) => { try { if (W.audio?.bus?.music && W.audio?.bus?.voice) W.audio.duck('music', 0.6, secs); else W.radio?.duck?.(0.32, secs); } catch {} };

  // a line not recorded yet: a voice mumbling each phrase of it (Jane's through the phone, softer whispering)
  function mumble(C, who, text, secs) {
    const f0 = VOICE[who]; if (!f0 || !W.sfx) return;
    const phone = who === 'Jane', parts = text.match(/[^.?!]+[.?!']*/g) || [text];
    let at = 0;
    for (const ph of parts) {
      const n = ph.trim().length; if (!n) continue;
      C.timers.push(setTimeout(() => W.sfx.play('mumble', { f0: f0 * (0.96 + Math.random() * 0.08), dur: Math.min(0.5, Math.max(0.2, 0.1 + n * 0.02)), gain: phone ? (C.mode === 'whisper' ? 0.1 : 0.2) : 0.26, q: /\?/.test(ph), lp: phone ? 3200 : 0 }), at * 1000 + 30));
      at += (ph.length / text.length) * secs;
    }
  }
  // a line: its subtitle (its recording plays from it, wagmi/radio/voices.js), held for its reading time (15 characters
  // a second, 1.4 s at least; quicker in the fast register) or as long as its voice takes
  function say(C, tup, kind, again = false) {
    const [who, color, text, gap = 0.25] = tup;
    const fast = C.mode === 'fast', rec = W.voice?.dur?.(who, text) || 0;
    const secs = fast ? Math.max(1.1, text.length / 17, rec + 0.1) : Math.max(1.4, text.length / 15, rec + 0.15);
    W.ui?.sub(who, text, color);
    if (!W.voice?.has?.(who, text)) mumble(C, who, text, secs);
    duck(secs + gap + 0.6);
    const t = now();
    C.line = { tup, kind, again, mine: who.toUpperCase() + text, t0: t, end: t + secs * 1000, gap: (fast ? Math.min(gap, 0.15) : gap) * 1000, cutAt: 0 };
    C.said++; C.log.push(`${kind} ${who}: ${text.slice(0, 32)}`); if (C.log.length > 40) C.log.shift();
  }
  function finish(C, t) {
    const L = C.line; C.line = null;
    if (subNow() === L.mine) W.ui?.sub(null);
    // (cut short by a line of the mission's: said again once it clears)
    else if (L.cutAt && L.cutAt - L.t0 < (L.end - L.t0) * 0.6 && !L.again && /^(main|extra|wrap)$/.test(L.kind)) C.again = { tup: L.tup, kind: L.kind };
    C.gapEnd = t + L.gap;
    if (L.kind === 'main' && !mainLeft(C)) heardOf(C.id).main = true;
  }
  function end(C, sound = true) {
    if (!C || C.dead) return;
    C.dead = true;
    for (const t of C.timers) clearTimeout(t); C.timers.length = 0;
    if (C.line && subNow() === C.line.mine) { W.ui?.sub(null); try { W.voice?.stop?.(0.12); } catch {} }
    C.line = null;
    if (C.rang) { W.ui?.caller?.(null); if (sound) W.sfx?.play('hangup', { gain: 0.12 }); }
    if (next === C) next = null;
    if (cur === C) { cur = next; next = null; if (cur) cur.armedAt = now(); }
  }
  // the step it lives in is over: a call still in its main lines carries them into a step it carries into; a wrap under
  // way finishes in the car; else it hangs up
  function stepGone(C, step) {
    if (C.state !== 'wait' && (C.def.carry || []).includes(step) && mainLeft(C)) { C.carrying = true; C.step = step; return false; }
    if (C.wrapping && C.state === 'talk' && inCar()) { C.step = step; C.wrapOnly = true; return false; }
    return true;
  }

  function start(id, opt = {}) {
    const def = CALLS[id]; if (!def) { console.warn('[calls] no call', id); return null; }
    for (const c of [cur, next]) if (c && !c.dead && c.id === id) return c;
    const H = heardOf(id);
    // (once: not again this session once it has rung)
    if (opt.once && (H.main || H.rang)) return null;
    const C = {
      id, def, opt, step: opt.step || def.step, state: 'wait', armedAt: now(), inAt: 0, rollAt: 0, ringEnd: 0, rang: false, dead: false,
      mode: (typeof opt.mode === 'string' && opt.mode) || def.mode || 'normal', retry: H.main,
      mainI: H.main ? def.main.length : 0, block: -1, blockI: 0, quietFrom: 0, extrasDone: false,
      wrapping: false, wrapI: 0, wrapReq: false, wrapOnly: false, carrying: false,
      held: false, pauseNow: false, outAt: 0, resumeDue: false, said: 0, pauseI: 0, resumeI: 0,
      line: null, again: null, gapEnd: 0, otherAt: -1e9, q: [], reactI: {}, reactAt: -1e9, lastReact: null, reactUsed: new Set(), cueUsed: new Set(),
      timers: [], log: [],
    };
    if (cur && !cur.dead) {
      // (the call before it still carrying its main lines into this step, or finishing its wrap: this one waits for its end)
      if (cur.carrying || cur.wrapOnly || (cur.step !== C.step && !stepGone(cur, C.step))) { if (next && next !== C) end(next, false); next = C; return C; }
      end(cur, cur.rang);
    }
    cur = C;
    return C;
  }

  function waiting(C, t) {
    const d = (C.opt.delay ?? C.def.delay) * 1000;
    if (C.def.trigger === 'enter-car') {
      if (!inCar() || W.ride?.phase) { C.inAt = C.rollAt = 0; return; }
      if (!C.inAt) C.inAt = t;
      if (!C.rollAt && Math.abs(W.car?.speed || 0) > 3) C.rollAt = t;
      if (!((C.rollAt && t - C.rollAt >= d) || t - C.inAt >= d + 4000)) return;
    } else if (t - C.armedAt < d || !inCar() || W.ride?.phase) return;
    // (not over a line of the mission's)
    if (subNow()) return;
    C.state = 'ring'; C.rang = heardOf(C.id).rang = true; C.ringEnd = t + RING * 1000;
    W.sfx?.play('ring', { gain: 0.16, times: 1 });
    card('Incoming call');
  }
  function talk(C, t) {
    const D = C.def, L = C.line;
    if (L) {
      if (!L.cutAt && subNow() !== L.mine) L.cutAt = t;
      if (t >= L.end) finish(C, t);
      return;
    }
    if (t < C.gapEnd) return;
    // out of the car: on hold after 1.5 s, a pause line once he's been talked to
    if (!inCar()) {
      if (C.wrapOnly) { end(C, true); return; }
      if (!C.outAt) C.outAt = t;
      if (!C.held && (C.pauseNow || t - C.outAt >= OUT_HOLD * 1000)) {
        C.held = true; card('On hold');
        if (C.said && D.pause.length && !subNow()) say(C, D.pause[C.pauseI++ % D.pause.length], 'pause');
      }
      return;
    }
    C.outAt = 0; C.pauseNow = false;
    if (C.held) { C.held = false; card('On call'); if (C.said && D.resume.length) C.resumeDue = true; }
    // the mission's own line up: the call waits for it, and goes on 0.4 s after it clears
    if (subNow()) { C.otherAt = t; return; }
    if (t - C.otherAt < AFTER_OTHER * 1000) return;
    if (C.resumeDue) { C.resumeDue = false; say(C, D.resume[C.resumeI++ % D.resume.length], 'resume'); return; }
    if (C.again) { const a = C.again; C.again = null; say(C, a.tup, a.kind, true); return; }
    // react and cue lines, between the call's own (a stale one dropped)
    while (C.q.length && t - C.q[0].at > STALE * 1000) C.q.shift();
    if (C.q.length) { const x = C.q.shift(); say(C, x.tup, x.kind); return; }
    if (!C.wrapping && (C.wrapReq || (C.opt.wrapWhen?.() && !(D.wrapAfterMain && mainLeft(C))))) { C.wrapping = true; C.block = -1; }
    if (C.wrapping) { if (C.wrapI < D.wrap.length) say(C, D.wrap[C.wrapI++], 'wrap'); else end(C, true); return; }
    if (C.mainI < D.main.length) { say(C, D.main[C.mainI++], 'main'); return; }
    if (C.carrying) { end(C, true); return; }
    // the drive runs long: an extra block after 6 s quiet, then the next (a retry: its first unheard one at once, only);
    // near the end of the drive (opt.hurryWhen()) no new block is begun, one under way goes on till the wrap cuts it
    const hurry = !!C.opt.hurryWhen?.();
    if (C.block >= 0) {
      const b = D.extra[C.block];
      if (C.blockI < b.length) { say(C, b[C.blockI++], 'extra'); return; }
      C.block = -1; C.quietFrom = t; if (C.retry) C.extrasDone = true;
    }
    if (!C.quietFrom) C.quietFrom = t;
    if (!C.extrasDone && !hurry && t - C.quietFrom >= EXTRA_GAP * 1000) {
      const H = heardOf(C.id), i = D.extra.findIndex((_, k) => !H.extra.has(k));
      if (i < 0) C.extrasDone = true; else { H.extra.add(i); C.block = i; C.blockI = 0; }
    }
  }
  function frame() {
    if (W.paused || !W.ui) return;
    // (the drives between missions: their call as their step starts)
    const sid = W.ui.stepId || null;
    if (sid !== autoAt) {
      autoAt = sid;
      const a = autos.get(sid);
      if (a) start(a.id, { once: true, ...a.opt, step: sid, wrapWhen: a.opt?.wrapWhen || (() => { const b = W.between?.at, p = me(); return !!b && !!p && Math.hypot(p.x - b.x, p.z - b.z) < a.wrapR; }) });
    }
    const C = cur; if (!C) return;
    const t = now();
    // (a cutscene: a call ringing or on hangs up at once; one still waiting for its ring waits on through it)
    if (scene()) { if (C.state !== 'wait') end(C, C.rang); return; }
    if (sid !== C.step && stepGone(C, sid)) { end(C, C.rang); return; }
    if (C.state === 'wait') { waiting(C, t); return; }
    if (C.state === 'ring') {
      if (t < C.ringEnd) return;
      C.state = 'talk'; C.held = !inCar(); card(C.held ? 'On hold' : 'On call'); C.gapEnd = t;
      if (C.retry) C.quietFrom = t - EXTRA_GAP * 1000;
      // (rung in the fast register: past the quiet opening, its 'spotted' exchange first)
      if (C.mode === 'fast' && C.def.fastFrom != null) { if (!C.retry) C.mainI = Math.max(C.mainI, C.def.fastFrom); react('spotted'); }
      return;
    }
    talk(C, t);
  }
  (function loop() { requestAnimationFrame(loop); try { frame(); } catch (e) { console.warn('[calls]', e); } })();

  // the call a react or a cue is for: the one that has it (a carried call before it may still be on)
  const target = (has) => [cur, next].find((c) => c && !c.dead && has(c.def));
  function react(kind) {
    const C = target((d) => d.react?.[kind]?.length);
    if (!C || C !== cur || C.state !== 'talk' || C.held || !inCar()) return false;
    const pool = C.def.react[kind], once = (C.def.onceReact || []).includes(kind), after = C.def.after?.[kind];
    if (once && C.reactUsed.has(kind)) return false;
    if (after && !after.includes(C.lastReact)) return false;
    const t = now();
    if (!once && (t - C.reactAt < (after ? 3 : C.def.cool ?? 7) * 1000 || C.q.some((x) => x.kind === 'react'))) return false;
    const i = C.reactI[kind] || 0; C.reactI[kind] = i + 1;
    const lines = pool[i % pool.length].map((tup) => ({ tup, kind: 'react', at: t }));
    if (once) C.q.unshift(...lines); else C.q.push(...lines);
    C.reactAt = t; C.lastReact = kind; C.reactUsed.add(kind);
    return true;
  }
  function cue(i) {
    const C = target((d) => d.cues?.length);
    if (!C || C.cueUsed.has(i)) return false;
    C.cueUsed.add(i);
    const c = C.def.cues[i];
    if (!c || C !== cur || C.state !== 'talk' || C.held || !inCar()) return false;
    C.q.push({ tup: C.mode === 'fast' && c.fled ? c.fled : c.line, kind: 'cue', at: now() });
    return true;
  }

  return {
    CALLS, start, react, cue,
    stop({ quiet = false, of = null } = {}) {
      const mine = (c) => c && (!of || c.step.startsWith(of));
      if (mine(next)) end(next, false);
      if (mine(cur)) end(cur, !quiet);
    },
    wrap() { if (cur) cur.wrapReq = true; },
    // (out of the car, the mission moving on: on hold now, its pause line after the line playing, no 1.5 s wait)
    pause() { if (cur && !cur.dead && cur.state === 'talk') cur.pauseNow = true; },
    // what the live call `id` still owes before a scene may cut it: 'main' (its protected main lines, wrapAfterMain),
    // 'wrap' (the line playing and its wrap), null (another call, not rung yet, or over)
    owes(id) { const C = cur; if (!C || C.dead || C.id !== id || C.state === 'wait') return null; return C.def.wrapAfterMain && mainLeft(C) ? 'main' : 'wrap'; },
    // (the fast register, mid-call: a call with fastFrom skips the rest of its quiet opening)
    mode(m) { for (const c of [cur, next]) if (c && !c.dead) { c.mode = m; if (m === 'fast' && c.def.fastFrom != null && c.state !== 'wait' && !c.retry) c.mainI = Math.max(c.mainI, c.def.fastFrom); } },
    auto(step, id, opt = {}) { autos.set(step, { id, wrapR: opt.wrapR ?? 200, opt }); if (W.ui?.stepId === step) autoAt = null; },
    get live() { return cur && !cur.dead && cur.state !== 'wait' ? cur.id : null; },
    get talking() { return !!cur?.line; },
    get heard() { return [...heard].filter(([, h]) => h.main).map(([id]) => id); },
    state() {
      const C = cur;
      return C ? { id: C.id, state: C.state, step: C.step, held: C.held, mode: C.mode, main: `${C.mainI}/${C.def.main.length}`, block: C.block, wrapping: C.wrapping, carrying: C.carrying, retry: C.retry, line: C.line?.mine || null, q: C.q.length, next: next?.id || null, log: C.log.slice(-14) } : { id: null, next: next?.id || null };
    },
    // (for tests: the main lines from line i)
    seek(i) { if (cur) cur.mainI = Math.max(0, Math.min(cur.def.main.length, i)); },
  };
}
