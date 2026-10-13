    /* ============================================================================ penalty shootout: the HUD ===== */
    // shootout-hud.js (SHOOTOUT M1, lane H), pasted into boot() at shootout.js's /*@include shootout-hud.js*/ marker.
    // ONE top-level binding, shootHud (design-critique #2): every other name lives inside it, so nothing of v1's
    // boot() (root, ring, screen, TK, tpad, state ...) is shadowed or replaced.
    //
    // The platform's glass (v1.js GLASS, the owner's cornerstone) in a broadcast's grammar, and as little of it as a
    // penalty needs: the kick tracker (five dots a side), the aim reticle on its figure-8 wobble loop (red outside the
    // frame, an edge chevron when it is off the screen), the heat thermometer (TAP is the run-up: COLD, WARM, HOT, ON
    // FIRE), the KICK ring (the run-up's clock, the HOLD arc, the gold sweet spot, a pulse on every tap and step), the
    // KICK label (TAP, HOLD, RELEASE), the grade, the result pill (with the ball's km/h and the heat), the first-kick
    // line, the replay's letterbox and tag, the desktop hint line, the retry bar, and a perf panel behind ?perf.
    //
    // It keeps no game state: it draws what the director (shootout.js) hands it. Every motion here runs on
    // update(dt), real time, called once a frame, so a hit-stop or a slow replay never slows the HUD (the two loops
    // that only decorate, the TAP breath and the heat haze, are CSS, and off under prefers-reduced-motion). The DOM is
    // written only when a value changes (kart.js HUDC pattern).
    //
    //   var hud = shootHud({ teams, camera?, project?, onSkip?, onRetry?, perf?, loopMin? });
    //   hud.phase(p)            demo|start|walk|whistle|set|runup|strike|flight|result|replay|retry|paused: what shows
    //   hud.tracker(tally)      { score:[a,b], dots:[[five],[five]], label, scoreText? }; a dot 'goal'|'miss'|'next'|null
    //   hud.reticle(marker, loop, locked, info?)   world [x,y,z]; loop = [[x,y,z],...] or { aim:[x,y], A, z } or null;
    //                           info = { inFrame, nearWood }: red outside the frame, amber by the woodwork
    //   hud.heat(h|null)        { H 0..1, band 'COLD'|'WARM'|'HOT'|'ON FIRE', deg 0..100, locked, lockDeg }: the gauge
    //   hud.kickState(k)        { label 'TAP'|'HOLD'|'RELEASE'|'KICK'|'AGAIN', tone null|'gold'|'coral', lockIn s }
    //   hud.ring(progress, win, pulse, mark, zones?)   0..1 round the ring (null: idle); win [a,b] the sweet spot;
    //                           pulse 'tap'|'step'|'plant'|'contact', or a list of them (edge-triggered: the frame of the event only);
    //                           mark = the release, 0..1; zones = { hold: [a,b] } the last stride
    //   hud.flash(grade, errMs) the grade by the ring at the strike     hud.result(kind|null, grade, errMs, more?)
    //                           more = { woodwork, held, kmh, heat: { band, deg }, sub }
    //   hud.onboard(text|true|null)  the first kick's line     hud.caption(text)  the KICK button's small line
    //   hud.replay(on)  hud.skip(on)  hud.hint('keys'|'pad'|'stride'|'runup'|text|null)  hud.retry({ goals, kicks }|null)
    //   hud.perf(stats|false)   hud.kick(button)  hud.update(dt)  hud.layout()  hud.state()  hud.dispose()
    function shootHud(o) {
      'use strict';
      o = o || {};
      var D = document, W = innerWidth || 1, H = innerHeight || 1;
      // the glass: v1's own recipe when it is in scope (it is, in boot()), else the same recipe copied
      var GL = typeof GLASS === 'string' ? GLASS : 'background:linear-gradient(150deg,rgba(255,255,255,.15),rgba(255,255,255,.03) 62%) rgba(10,12,18,.34);' +
        '-webkit-backdrop-filter:blur(16px) saturate(170%);backdrop-filter:blur(16px) saturate(170%);' +
        'border:1px solid rgba(255,255,255,.2);box-shadow:inset 0 1px 0 rgba(255,255,255,.24),0 12px 32px rgba(0,0,0,.2)';
      var GOLD = '#F2D27A', CORAL = '#FF5A5F', AMBER = '#FFB020';
      var TEAMS = [0, 1].map(function (i) {
        var tm = (o.teams || [])[i] || {}, nm = String(tm.name || (i ? 'Away' : 'Home'));
        return { name: nm, short: String(tm.short || nm).slice(0, 4).toUpperCase(), color: /^#[0-9a-f]{3,8}$/i.test(tm.color || '') ? tm.color : (i ? '#E4E6EA' : '#FFFFFF') };
      });
      var RM = false; try { RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { RM = false; }
      var PERF = !!o.perf; try { PERF = PERF || /[?&](perf(=[^&]*)?|hud=perf)(&|$)/.test(location.search); } catch (e) {}
      var IDLE = o.idleAfter > 0 ? +o.idleAfter : 20;   // the KICK ring breathes after this long at the mark (s)
      var UID = Math.random().toString(36).slice(2, 8);  // (SVG ids are the document's: one set per HUD)

      // the heat's scale (the contract's bands, K's BANDS): ice-blue, amber, red, white-hot
      var BANDS = [0.35, 0.65, 0.90], BNAME = ['COLD', 'WARM', 'HOT', 'ON FIRE'], BCOL = ['#8FD8FF', '#FFC24A', '#FF5B3D', '#FFF3DF'];
      // (crossing into ON FIRE the liquid flips from red to white-hot: the top band reads at a glance)
      var STOPS = [[0, '#3DA2EE'], [0.30, '#A9E3FF'], [0.35, '#FFD98A'], [0.42, '#FFB840'], [0.62, '#FF8A2A'], [0.72, '#FF4E36'], [0.885, '#FF4430'], [0.90, '#FFC79A'], [0.92, '#FFEFDF'], [1, '#FFFFFF']];

      /* ---------------------------------------------------------------------------------------- the look --- */
      var CSS = [
        '#gm .so{position:absolute;inset:0;pointer-events:none;overflow:hidden;font-variant-numeric:tabular-nums}',
        // (the attract loop runs the same phases with nothing over it: RULES row 18)
        '#gm.demo .so{display:none!important}',
        '#gm .so-g{position:absolute;' + GL + '}',
        '@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){#gm .so-g,#gm .so-st i{background-color:rgba(10,12,18,.66)!important}}',
        // a lit gold edge along the top of the panes that matter (the tracker, a goal)
        '#gm .so-lit::before{content:"";position:absolute;left:18%;right:18%;top:-1px;height:2px;border-radius:2px;background:linear-gradient(90deg,transparent,' + GOLD + ',transparent);box-shadow:0 0 14px rgba(233,196,106,.85)}',
        '#gm .so-cap{font-size:11px;font-weight:600;letter-spacing:.28em;text-transform:uppercase;color:rgba(244,246,250,.74)}',
        '#gm .so-gold{background:linear-gradient(180deg,#FFF3CC 0%,#F6D98A 38%,#D7AE52 72%,' + GOLD + ' 100%);-webkit-background-clip:text;background-clip:text;color:transparent}',
        // the tracker: chip, name, five dots, the score, five dots, name, chip; a line under it
        '#gm .so-trk{left:50%;top:calc(clamp(12px,2.6vh,28px) + env(safe-area-inset-top,0px));transform-origin:50% 0;padding:11px 20px 10px;border-radius:20px;white-space:nowrap;text-align:center}',
        '#gm .so-trk .r{display:flex;align-items:center;justify-content:center;gap:16px}',
        '#gm .so-trk .tm{display:flex;align-items:center;gap:9px;font-size:15px;font-weight:700;letter-spacing:.18em}',
        '#gm .so-chip{width:12px;height:12px;border-radius:4px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.35);flex:none}',
        '#gm .so-dots{display:flex;gap:6px}',
        '#gm .so-d{width:13px;height:13px;border-radius:50%;border:1.5px solid rgba(255,255,255,.5);box-sizing:border-box;position:relative;flex:none}',
        '#gm .so-d.s{background:' + GOLD + ';border-color:#FFE7A6;box-shadow:0 0 9px rgba(233,196,106,.7)}',
        '#gm .so-d.m{border-color:' + CORAL + ';background:rgba(255,90,95,.16)}',
        '#gm .so-d.m::before,#gm .so-d.m::after{content:"";position:absolute;left:50%;top:50%;width:8px;height:1.6px;margin:-.8px 0 0 -4px;background:' + CORAL + ';transform:rotate(45deg)}#gm .so-d.m::after{transform:rotate(-45deg)}',
        '#gm .so-d.n{border-color:#fff;box-shadow:0 0 0 3px rgba(242,210,122,.32),0 0 12px rgba(242,210,122,.55)}',
        '#gm .so-trk .sc{font-size:28px;font-weight:700;letter-spacing:.06em;line-height:1;padding:0 2px}',
        '#gm .so-trk .sc em{font-style:normal;opacity:.55;margin:0 8px}',
        '#gm .so-trk .so-cap{margin-top:7px;font-size:10.5px}',
        '@media (max-width:480px){#gm .so-trk{padding:8px 15px 8px;border-radius:16px}#gm .so-trk .r{gap:11px}#gm .so-trk .tm{font-size:13px;gap:7px}#gm .so-d{width:11px;height:11px}#gm .so-dots{gap:5px}#gm .so-trk .sc{font-size:22px}#gm .so-trk .so-cap{margin-top:5px;font-size:9.5px}' +
          '#gm .so-result{padding:18px 30px 16px;border-radius:24px}#gm .so-result b{font-size:44px}}',
        // the reticle: the dashed loop the marker rides, its centre, the marker (a lit gold ring and a dot); red outside
        // the frame (the ball will go wide or over by physics), amber by the woodwork; a chevron at the edge when off screen
        '#gm .so-ret{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible}',
        '#gm .so-ret .lu{fill:none;stroke:rgba(6,8,14,.3);stroke-width:3.6;stroke-linejoin:round}',
        '#gm .so-ret .lp{fill:none;stroke:' + GOLD + ';stroke-opacity:.9;stroke-width:1.6;stroke-dasharray:3 4.5;stroke-linecap:round}',
        '#gm .so-ret .ct{stroke:rgba(255,255,255,.75);stroke-width:1.4;stroke-linecap:round}',
        '#gm .so-ret .mu{fill:none;stroke:rgba(6,8,14,.4);stroke-width:5}',
        '#gm .so-ret .mg{fill:none;stroke:' + GOLD + ';stroke-opacity:.26;stroke-width:6}',
        '#gm .so-ret .mr{fill:rgba(242,210,122,.12);stroke:' + GOLD + ';stroke-width:2.2}',
        '#gm .so-ret .md{fill:#FFF3CC}',
        '#gm .so-ret .lk{fill:none;stroke:#FFF3CC;stroke-width:1.6}',
        '#gm .so-ret.out .lp,#gm .so-ret.out .mg,#gm .so-ret.out .mr{stroke:' + CORAL + '}#gm .so-ret.out .mr{fill:rgba(255,90,95,.16)}#gm .so-ret.out .md{fill:#FFD9DA}#gm .so-ret.out .mg{stroke-opacity:.34}',
        '#gm .so-ret.wood .mr,#gm .so-ret.wood .mg{stroke:' + AMBER + '}',
        '#gm .so-ret .chv .cb{fill:rgba(10,12,18,.5);stroke:rgba(255,255,255,.28);stroke-width:1}',
        '#gm .so-ret .chv .cp{fill:none;stroke:' + GOLD + ';stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}',
        '#gm .so-ret.out .chv .cp{stroke:' + CORAL + '}#gm .so-ret.out .chv .cb{stroke:rgba(255,90,95,.6)}',
        // KICK: the touch kit's 96 px main button (RULES.md:61; where Meme Kart's DRIFT sits), or on a screen with keys a
        // disc of the same glass; its big label is the move (TAP, HOLD, RELEASE), the small line under it the detail
        '#gm .so-face,#gm .tpad button.so-kick{display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:50%;color:#fff}',
        '#gm .tpad button.so-kick{position:relative;overflow:visible;padding:0}',
        '#gm .so-face b,#gm .so-kick b{display:block;font-size:16px;font-weight:700;letter-spacing:.22em;margin-left:.22em;line-height:1}',
        '#gm .so-face b.l7,#gm .so-kick b.l7{font-size:12.5px;letter-spacing:.14em;margin-left:.14em}',
        '#gm .so-face b.l5,#gm .so-kick b.l5{font-size:14.5px;letter-spacing:.18em;margin-left:.18em}',
        '#gm .so-face small,#gm .so-kick small{display:block;font-size:9px;font-weight:600;letter-spacing:.24em;margin:5px 0 0 .24em;color:rgba(244,246,250,.72);line-height:1;text-transform:uppercase;white-space:nowrap}',
        '#gm .so-face small:empty,#gm .so-kick small:empty{display:none}',
        '#gm .so-face small.lc,#gm .so-kick small.lc{font-size:8px;letter-spacing:.14em;margin-left:.14em}',
        '#gm .so-face.hot,#gm .tpad button.so-kick.hot,#gm .so-face.t-gold,#gm .tpad button.so-kick.t-gold{border-color:rgba(255,231,166,.95);box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 0 26px rgba(233,196,106,.6)}',
        '#gm .so-face.t-gold b,#gm .so-kick.t-gold b{color:#FFE9A8;text-shadow:0 0 12px rgba(242,210,122,.8)}',
        '#gm .so-face.t-coral,#gm .tpad button.so-kick.t-coral{border-color:rgba(255,120,124,.9);box-shadow:inset 0 1px 0 rgba(255,255,255,.24),0 0 22px rgba(255,90,95,.5)}',
        '#gm .so-face.t-coral b,#gm .so-kick.t-coral b{color:#FFB3B5}',
        '#gm .so-face.so-warn,#gm .tpad button.so-kick.so-warn{border-color:rgba(255,255,255,.85);box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 0 20px rgba(255,255,255,.35)}',
        '#gm .so-face.dim b,#gm .so-kick.dim b{opacity:.5}',
        '@keyframes so-tap{0%,100%{opacity:1}50%{opacity:.42}}',
        '#gm .so-face b.br,#gm .so-kick b.br{animation:so-tap 1.15s ease-in-out infinite}',
        '#gm .so-kd{position:absolute;right:calc(54px + env(safe-area-inset-right,0px));bottom:calc(46px + env(safe-area-inset-bottom,0px));width:96px;height:96px}',
        '#gm .so-kd .so-face{inset:0}',
        '#gm .so-rg{position:absolute;left:50%;top:50%;width:132px;height:132px;margin:-66px 0 0 -66px;pointer-events:none;overflow:visible}',
        '#gm .so-rg .tr{fill:none;stroke:rgba(255,255,255,.22);stroke-width:3}',
        '#gm .so-rg .hzg{fill:none;stroke:#fff;stroke-width:8;stroke-linecap:round}',
        '#gm .so-rg .hzn{fill:none;stroke:#EAF3FF;stroke-width:2.2;stroke-linecap:round}',
        '#gm .so-rg .wg{fill:none;stroke:' + GOLD + ';stroke-opacity:.24;stroke-width:10;stroke-linecap:round}',
        '#gm .so-rg .w{fill:none;stroke:' + GOLD + ';stroke-width:4.5;stroke-linecap:round}',
        '#gm .so-rg .p{fill:none;stroke:#fff;stroke-width:3;stroke-linecap:round}',
        '#gm .so-rg .tk{stroke:#fff;stroke-width:2.2;stroke-linecap:round}#gm .so-rg .tk.g{stroke:' + GOLD + ';stroke-width:3}',
        '#gm .so-rg .mk{stroke:#fff;stroke-width:3.2;stroke-linecap:round}',
        '#gm .so-rg .h{fill:none;stroke-width:2}',
        // (fix-i4, review-i3 D6) the approach ring: from the lock it closes on the ring, meeting it on the plant (the
        // sweet spot's middle): the lead-in to RELEASE, read ahead like a rhythm game's, never reacted to
        '#gm .so-rg .ap{fill:none;stroke:' + GOLD + ';stroke-width:2.6}',
        // the heat: a glass thermometer beside KICK (desktop: to its left; touch: above the button)
        '#gm .so-gauge{border-radius:18px;box-sizing:border-box;text-align:center}',
        '#gm .so-gauge .dg{display:flex;align-items:flex-start;justify-content:center;font-weight:700;line-height:1;letter-spacing:.02em;color:' + BCOL[0] + '}',
        '#gm .so-gauge .dg i{font-style:normal;font-size:.6em;margin:.06em 0 0 1px;opacity:.8}',
        '#gm .so-gauge svg{display:block;overflow:visible}',
        '#gm .so-gauge .lb text{font-family:Oxanium,system-ui,sans-serif;font-weight:600;fill:rgba(244,246,250,.56)}',
        '#gm .so-gauge .bt line{stroke:rgba(255,255,255,.34);stroke-width:1}',
        '#gm .so-gauge .gl{fill:rgba(255,255,255,.06);stroke:rgba(255,255,255,.4);stroke-width:1}',
        '#gm .so-gauge .hl{stroke:rgba(255,255,255,.42);stroke-width:1;stroke-linecap:round}',
        '#gm .so-gauge .mn .g{stroke-width:7;stroke-linecap:round;stroke-opacity:.38}#gm .so-gauge .mn .l{stroke-width:1.8;stroke-linecap:round}',
        '#gm .so-gauge .lt line{stroke:' + GOLD + ';stroke-width:2;stroke-linecap:round}#gm .so-gauge .lt path{fill:' + GOLD + '}',
        '#gm .so-gauge .fl{fill:none;stroke:' + GOLD + ';stroke-width:1.6}',
        '#gm .so-gauge .hz path{fill:none;stroke:rgba(255,240,222,.85);stroke-width:1.3;stroke-linecap:round}',
        '@keyframes so-hz{0%{transform:translateY(2px);opacity:0}30%{opacity:.9}100%{transform:translateY(-12px);opacity:0}}',
        '#gm .so-gauge .hz path{animation:so-hz 1.1s linear infinite}#gm .so-gauge .hz path:nth-child(2){animation-delay:-.37s}#gm .so-gauge .hz path:nth-child(3){animation-delay:-.74s}',
        '@keyframes so-sh{0%{transform:translateY(0);opacity:0}25%{opacity:1}100%{transform:translateY(var(--d,-12px));opacity:0}}',
        '#gm .so-gauge .sh{animation:so-sh .9s ease-in infinite}',
        '#gm .so-gauge.fire{border-color:rgba(255,222,190,.8);box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 0 30px rgba(255,128,64,.42),0 12px 32px rgba(0,0,0,.2)}',
        '#gm .so-gauge.fire .dg{color:#FFF7EA;text-shadow:0 0 12px rgba(255,150,80,.95)}',
        '@media (prefers-reduced-motion:reduce){#gm .so-gauge .hz path,#gm .so-gauge .sh,#gm .so-face b.br,#gm .so-kick b.br{animation:none}#gm .so-gauge .hz{display:none}}',
        // the grade, by the ring: two lines (the grade, the release in ms)
        '#gm .so-fl{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 14px 7px;border-radius:14px;white-space:nowrap}',
        '#gm .so-fl b{font-size:13.5px;font-weight:700;letter-spacing:.2em;margin-right:-.2em;text-transform:uppercase;line-height:1}',
        '#gm .so-fl span{font-size:11.5px;font-weight:500;letter-spacing:.06em;color:rgba(244,246,250,.8);line-height:1}#gm .so-fl span:empty{display:none}',
        // the result
        '#gm .so-result{left:50%;top:19%;padding:22px 50px 20px;border-radius:28px;text-align:center;white-space:nowrap}',
        '#gm .so-result b{display:block;font-size:clamp(46px,min(8vw,9vh),92px);line-height:1;font-weight:700;letter-spacing:.12em;margin-right:-.12em;text-transform:uppercase;color:#fff;text-shadow:0 2px 18px rgba(0,0,0,.35)}',
        '#gm .so-result.win b{background:linear-gradient(180deg,#FFF6D0,#F6C33B 55%,#C98A18);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:none;filter:drop-shadow(0 0 22px rgba(246,195,59,.45)) drop-shadow(0 2px 10px rgba(0,0,0,.35))}',
        '#gm .so-result .so-cap{display:block;margin-top:13px}',
        '#gm .so-result .so-cap u{text-decoration:none}',
        '#gm .so-kv{display:flex;justify-content:center;gap:8px;margin-top:12px}#gm .so-kv:empty{display:none}',
        '#gm .so-kv em{display:flex;align-items:baseline;gap:6px;font-style:normal;padding:5px 12px 6px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);font-size:10.5px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:rgba(244,246,250,.74);line-height:1}',
        '#gm .so-kv em strong{font-size:16px;font-weight:700;letter-spacing:.04em;color:#fff}',
        '#gm .so-kv em i{align-self:center;width:7px;height:7px;border-radius:50%;flex:none}',
        // the first kick's line, under the tracker
        '#gm .so-onb{left:50%;padding:9px 18px 10px;border-radius:16px;display:flex;flex-wrap:nowrap;justify-content:center;align-items:center;gap:4px 12px;max-width:calc(100vw - 28px);box-sizing:border-box;text-align:center}',
        // (one line when it fits, else one move a line: never a separator left hanging at a line's end)
        '#gm .so-onb.stack{flex-direction:column;gap:5px;padding:9px 16px}#gm .so-onb.stack i{display:none}',
        '#gm .so-onb span{white-space:nowrap}#gm .so-onb b{color:#fff;font-weight:700}#gm .so-onb b.so-gold{font-weight:700}#gm .so-onb i{font-style:normal;opacity:.45}',
        '@media (max-width:600px){#gm .so-onb.so-cap{font-size:10px;letter-spacing:.22em}}',
        // the line of keys, on a screen with keys only
        '#gm .so-hint{left:50%;bottom:calc(30px + env(safe-area-inset-bottom,0px));padding:11px 22px;border-radius:999px;white-space:nowrap;display:flex;align-items:center;gap:16px}',
        '#gm .so-hint b{color:#fff;font-weight:700}#gm .so-hint i{font-style:normal;opacity:.45}',
        '#gm.touch .so-hint{display:none!important}@media (pointer:coarse){#gm .so-hint{display:none!important}}',
        // where the left thumb aims, until it lands (v1's own stick ring appears under it then)
        '#gm .so-st{position:absolute;left:calc(28px + env(safe-area-inset-left,0px));bottom:calc(46px + env(safe-area-inset-bottom,0px));width:110px;height:110px;border-radius:50%;border:1.5px solid rgba(255,255,255,.26);background:radial-gradient(circle,rgba(255,255,255,.07),rgba(255,255,255,0) 70%);box-sizing:border-box}',
        '#gm .so-st i{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;' + GL + '}',
        '#gm .so-st small{position:absolute;left:0;right:0;bottom:-24px;text-align:center;font-size:10px;margin-left:.28em}',
        // the replay: letterbox, a wipe, the tag, Skip
        '#gm .so-lb{position:absolute;left:0;right:0;height:min(10vh,12vw);background:#000}',
        '#gm .so-lb.t{top:0;transform-origin:50% 0}#gm .so-lb.b{bottom:0;transform-origin:50% 100%}',
        '#gm .so-tag{position:absolute;left:calc(4vw + env(safe-area-inset-left,0px));top:calc(min(10vh,12vw) / 2);margin-top:-8px;display:flex;align-items:center;gap:10px;font-size:13px;line-height:16px;font-weight:600;letter-spacing:.34em;text-transform:uppercase;color:#fff}',
        '#gm .so-tag i{width:8px;height:8px;border-radius:50%;background:' + GOLD + ';box-shadow:0 0 10px rgba(242,210,122,.9)}',
        '#gm .so-wp{position:absolute;top:0;bottom:0;left:0;width:24vw;background:linear-gradient(90deg,rgba(242,210,122,0),rgba(242,210,122,.5) 44%,rgba(255,248,225,.85) 50%,rgba(242,210,122,.5) 56%,rgba(242,210,122,0));mix-blend-mode:screen}',
        '#gm .so-sk{right:calc(3vw + env(safe-area-inset-right,0px));bottom:calc(min(10vh,12vw) + 2vh + env(safe-area-inset-bottom,0px));pointer-events:auto;cursor:pointer;-webkit-appearance:none;appearance:none;margin:0;border-radius:999px;color:#fff;font:600 13px Oxanium,system-ui,sans-serif;letter-spacing:.16em;padding:9px 18px;text-transform:uppercase}',
        // between kicks: the session, and the one action
        '#gm .so-rt{left:50%;bottom:calc(26px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;gap:22px;padding:9px 10px 9px 24px;border-radius:999px;white-space:nowrap}',
        '#gm.touch .so-rt{bottom:calc(140px + env(safe-area-inset-bottom,0px))}@media (pointer:coarse){#gm .so-rt{bottom:calc(140px + env(safe-area-inset-bottom,0px))}}',
        '#gm .so-rt .t{display:flex;align-items:baseline;gap:12px}#gm .so-rt .t b{font-size:26px;font-weight:600;line-height:1}#gm .so-rt .t b i{font-style:normal;opacity:.55;font-size:.66em;margin-left:2px}',
        '#gm .so-go{pointer-events:auto;cursor:pointer;-webkit-appearance:none;appearance:none;margin:0;display:flex;align-items:center;gap:12px;border:1px solid rgba(255,238,180,.95);border-radius:999px;padding:12px 22px;font:700 13px Oxanium,system-ui,sans-serif;letter-spacing:.24em;text-transform:uppercase;color:#1A1406;' +
          'background:linear-gradient(180deg,#FFE9A8,#E9C46A 55%,#C99A3E);box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 0 24px rgba(233,196,106,.45),0 10px 24px rgba(0,0,0,.3)}',
        '#gm .so-go kbd{font:600 10px Oxanium,system-ui,sans-serif;letter-spacing:.12em;padding:3px 7px;border-radius:6px;border:1px solid rgba(26,20,6,.35);background:rgba(255,255,255,.28);color:#1A1406}',
        '#gm.touch .so-go kbd{display:none}@media (pointer:coarse){#gm .so-go kbd{display:none}}',
        // ?perf
        '#gm .so-pf{left:calc(14px + env(safe-area-inset-left,0px));top:calc(96px + env(safe-area-inset-top,0px));padding:9px 13px 10px;border-radius:14px;display:grid;grid-template-columns:auto auto;gap:3px 14px;font-size:11.5px;font-weight:500;letter-spacing:.06em;line-height:1.3}',
        '#gm .so-pf small{color:rgba(244,246,250,.6);letter-spacing:.2em;text-transform:uppercase;font-size:9.5px;line-height:15px}',
        '#gm .so-pf b{font-weight:600;text-align:right}#gm .so-pf b.bad{color:#FF8A8D}',
        // a replay is a scene: the touch kit is put away (RULES.md:92), as open.js does for its intros
        '#gm.so-scene .tpad,#gm.so-scene .stick{visibility:hidden}',
      ].join('\n');

      /* ---------------------------------------------------------------------------------------- the DOM --- */
      var gm = o.root || D.getElementById('gm') || D.body;
      var old = D.getElementById('so-hud-css'); if (old) old.parentNode.removeChild(old);
      var css = D.createElement('style'); css.id = 'so-hud-css'; css.textContent = CSS; D.head.appendChild(css);
      var box = D.createElement('div'); box.className = 'so'; gm.appendChild(box);
      function mk(tag, cls, html, parent) { var e = D.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; (parent || box).appendChild(e); return e; }
      function ex(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
      function q(e, s) { return e.querySelector(s); }
      function cl(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
      function ease(x) { x = cl(x); return x * x * (3 - 2 * x); }
      function fx1(x) { return Math.round(x * 10) / 10; }
      // a pane's box while it may be faded out (display:none): shown for the measure, then put back
      function measure(e) { var d = e.style.display, r; if (d === 'none') e.style.display = ''; r = e.getBoundingClientRect(); if (d === 'none') e.style.display = d; return r; }
      function attr(e, k, v) { v = String(v); if (e.getAttribute(k) !== v) e.setAttribute(k, v); }
      // the heat's colour at h (the scale's stops, mixed in sRGB)
      function hexRgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
      var STOPRGB = STOPS.map(function (s) { return [s[0], hexRgb(s[1])]; });
      function heatRgb(h) {
        h = cl(h); var i = 1; while (i < STOPRGB.length - 1 && STOPRGB[i][0] < h) i++;
        var a = STOPRGB[i - 1], b = STOPRGB[i], u = b[0] > a[0] ? cl((h - a[0]) / (b[0] - a[0])) : 0;
        return [0, 1, 2].map(function (k) { return Math.round(a[1][k] + (b[1][k] - a[1][k]) * u); });
      }
      function rgbS(c, k) { k = k == null ? 1 : k; return 'rgb(' + Math.round(c[0] * k) + ',' + Math.round(c[1] * k) + ',' + Math.round(c[2] * k) + ')'; }
      function mixW(c, t) { return [c[0] + (255 - c[0]) * t, c[1] + (255 - c[1]) * t, c[2] + (255 - c[2]) * t]; }
      function bandOf(h) { return h >= BANDS[2] ? 3 : h >= BANDS[1] ? 2 : h >= BANDS[0] ? 1 : 0; }

      // the replay's band (under everything else), the panes, the reticle on top (the marker is never hidden by a pane)
      var lbT = mk('i', 'so-lb t'), lbB = mk('i', 'so-lb b'), wipe = mk('i', 'so-wp');
      var tag = mk('div', 'so-tag', '<i></i>Replay');
      var SVGN = 'http://www.w3.org/2000/svg';
      var trk = mk('div', 'so-trk so-g so-lit');
      var onb = mk('div', 'so-onb so-g so-cap');
      var hint = mk('div', 'so-hint so-g so-cap');
      var res = mk('div', 'so-result so-g', '<b></b><span class="so-cap"></span><span class="so-kv"></span>');
      var flashEl = mk('div', 'so-fl so-g', '<b></b><span></span>');
      var stickG = mk('div', 'so-st', '<i></i><small class="so-cap">Aim</small>');
      var gauge = mk('div', 'so-gauge so-g', '<div class="dg"><b>0</b><i>&deg;</i></div><svg xmlns="' + SVGN + '"></svg>');
      var kd = mk('div', 'so-kd', '<div class="so-face so-g"><b>KICK</b><small></small></div>');
      var kdFace = q(kd, '.so-face');
      var skipEl = mk('button', 'so-sk so-g', 'Skip &rsaquo;');
      var rt = mk('div', 'so-rt so-g', '<div class="t"><small class="so-cap">Goals</small><b>0<i>/0</i></b></div><button class="so-go">Kick again<kbd>Enter</kbd></button>');
      var pf = mk('div', 'so-pf so-g');
      var ret = mk('div', '', '<svg class="so-ret" xmlns="' + SVGN + '"><path class="lu"/><path class="lp"/><path class="ct" d="M-7 0H-2.5M2.5 0H7M0 -7V-2.5M0 2.5V7"/>' +
        '<circle class="lk" r="10"/><g class="mk"><circle class="mu" r="9"/><circle class="mg" r="9"/><circle class="mr" r="9"/><circle class="md" r="2.6"/></g>' +
        '<g class="chv"><circle class="cb" r="15"/><path class="cp" d="M-3 -6.5L3.5 0L-3 6.5"/></g></svg>').firstChild;
      ret.parentNode.style.cssText = 'position:absolute;inset:0';
      var rLU = q(ret, '.lu'), rLP = q(ret, '.lp'), rCT = q(ret, '.ct'), rLK = q(ret, '.lk'), rMK = q(ret, '.mk'), rMR = [q(ret, '.mu'), q(ret, '.mg'), q(ret, '.mr')], rCH = q(ret, '.chv');
      rLK.style.display = 'none'; rCH.style.display = 'none';
      skipEl.setAttribute('aria-label', 'skip the replay');
      skipEl.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); if (o.onSkip) o.onSkip(); });
      q(rt, '.so-go').addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); if (o.onRetry) o.onRetry(); });

      // the KICK ring: one SVG, moved into the touch button when there is one on screen, else into the disc
      var C = 2 * Math.PI * 56, C2 = 2 * Math.PI * 61.5;
      var rgW = D.createElement('div');
      rgW.innerHTML = '<svg class="so-rg" viewBox="0 0 132 132" xmlns="' + SVGN + '"><g transform="rotate(-90 66 66)">' +
        '<circle class="hzg" cx="66" cy="66" r="61.5"/><circle class="hzn" cx="66" cy="66" r="61.5"/>' +
        '<circle class="tr" cx="66" cy="66" r="56"/><circle class="p" cx="66" cy="66" r="56"/><circle class="wg" cx="66" cy="66" r="56"/>' +
        '<circle class="w" cx="66" cy="66" r="56"/></g><g class="tks"></g><line class="mk" x1="66" y1="4" x2="66" y2="18"/><circle class="h" cx="66" cy="66" r="48"/>' +
        '<circle class="ap" cx="66" cy="66" r="56"/></svg>';
      var rg = rgW.firstChild, gWG = q(rg, '.wg'), gW = q(rg, '.w'), gP = q(rg, '.p'), gTks = q(rg, '.tks'), gMK = q(rg, '.mk'), gH = q(rg, '.h'), gHZ = q(rg, '.hzn'), gHZG = q(rg, '.hzg'), gAP = q(rg, '.ap');
      gHZ.style.display = gHZG.style.display = gAP.style.display = 'none';
      kd.appendChild(rg);
      var kbtn = null, kbtnHtml = '', touchUi = false;

      /* ------------------------------------------------------------- fades: every pane eases in and out --- */
      // (display:none once gone, so a hidden pane costs no blur on a phone)
      function fader(n, dur, fxf) { return { n: n, a: 0, on: false, dur: dur, fx: fxf || null, shown: null, last: -1 }; }
      var FD = {
        trk: fader(trk, 0.25), ret: fader(ret, 0.18), ring: fader(rg, 0.18), kd: fader(kd, 0.18), hint: fader(hint, 0.25),
        flash: fader(flashEl, 0.12, function (a, n) { n.style.transform = 'translateY(' + fx1((1 - ease(a)) * 6) + 'px)'; }),
        res: fader(res, 0.28, function (a, n) { n.style.transform = 'translate(-50%,' + fx1((1 - ease(a)) * 10) + 'px) scale(' + (0.94 + 0.06 * ease(a)).toFixed(3) + ')'; }),
        lbT: fader(lbT, 0.18, function (a, n) { n.style.transform = 'scaleY(' + ease(a).toFixed(3) + ')'; }),
        lbB: fader(lbB, 0.18, function (a, n) { n.style.transform = 'scaleY(' + ease(a).toFixed(3) + ')'; }),
        tag: fader(tag, 0.25), skip: fader(skipEl, 0.2), stick: fader(stickG, 0.3),
        rt: fader(rt, 0.25, function (a, n) { n.style.transform = 'translate(-50%,' + fx1((1 - ease(a)) * 12) + 'px)'; }),
        gauge: fader(gauge, 0.25, function (a, n) { n.style.transform = 'translateY(' + fx1((1 - ease(a)) * 8) + 'px)'; }),
        onb: fader(onb, 0.3, function (a, n) { n.style.transform = 'translate(-50%,' + fx1((1 - ease(a)) * -6) + 'px)'; }),
      };
      function stepFader(f, dt) {
        var a = f.dur > 0 ? f.a + (f.on ? 1 : -1) * dt / f.dur : (f.on ? 1 : 0); a = cl(a);
        if (RM) a = f.on ? 1 : 0;
        f.a = a;
        var vis = a > 0;
        if (vis !== f.shown) { f.shown = vis; f.n.style.display = vis ? '' : 'none'; }
        if (vis && a !== f.last) {
          f.last = a; f.n.style.opacity = a >= 1 ? '' : a.toFixed(3);
          if (f.fx) f.fx(a, f.n);
        }
      }
      for (var fk in FD) { FD[fk].n.style.display = 'none'; FD[fk].shown = false; }
      // the panes with a transform of their own begin where their fade puts them
      FD.res.fx(0, res); FD.rt.fx(0, rt); FD.gauge.fx(0, gauge); FD.onb.fx(0, onb); trk.style.transform = 'translateX(-50%)'; hint.style.transform = 'translateX(-50%)';
      wipe.style.display = 'none'; pf.style.display = PERF ? '' : 'none';

      /* --------------------------------------------------------------------------- what each phase shows --- */
      // (the gauge from set to the result: the contract's 'shown from set to result'; the first-kick line in set and
      // the run-up, until the director lets it go at the lock)
      var SHOW = {
        demo: '', start: '', paused: 'trk',
        walk: 'trk ret hint stick', whistle: 'trk ret hint stick', set: 'trk ret ring hint stick gauge onb',
        runup: 'ret ring hint stick gauge onb', strike: 'ring flash gauge', flight: 'flash gauge',
        result: 'trk res gauge', replay: 'lb skip', retry: 'trk rt',
      };
      // the KICK label a phase has until the director says otherwise (kickState)
      var LABEL = { set: 'TAP', runup: 'TAP', strike: 'KICK', flight: 'KICK', result: 'KICK', retry: 'AGAIN' };
      var P = 'demo', allow = {};
      var CT = { trk: false, ret: false, hint: false, res: false, flash: false, lb: false, skip: false, rt: false, gauge: false, onb: false };
      function apply() {
        var stickOn = touchUi && !(typeof TK !== 'undefined' && TK && TK.on) && (P !== 'runup' || KS.label === 'TAP');
        FD.trk.on = !!(allow.trk && CT.trk);
        FD.ret.on = !!(allow.ret && CT.ret);
        FD.ring.on = !!allow.ring;
        FD.kd.on = !!(allow.ring && !touchUi);
        FD.hint.on = !!(allow.hint && CT.hint);
        FD.flash.on = !!(allow.flash && CT.flash);
        FD.res.on = !!(allow.res && CT.res);
        FD.lbT.on = FD.lbB.on = FD.tag.on = !!(allow.lb && CT.lb);
        FD.skip.on = !!(allow.skip && CT.skip);
        FD.rt.on = !!(allow.rt && CT.rt);
        FD.stick.on = !!(allow.stick && stickOn);
        FD.gauge.on = !!(allow.gauge && CT.gauge);
        FD.onb.on = !!(allow.onb && CT.onb);
      }
      function phase(p) {
        p = String(p || 'demo');
        if (p === P) return;
        P = p; allow = {};
        (SHOW[p] || '').split(' ').forEach(function (k) { if (k) allow[k] = true; });
        if (p === 'set') idleT = 0;
        if (p === 'walk' || p === 'set' || p === 'runup') { RG.ticks = []; RG.mark = null; RG.grade = null; if (p !== 'runup') RG.hold = null; drawRing(true); }
        if (p === 'walk' || p === 'set') { CT.flash = false; FL.key = ''; CT.res = false; RS.key = ''; }
        if (p === 'walk' || p === 'whistle' || p === 'set') { HT.lockFlare = 9; }
        KS.cap = null; KS.tone = null; KS.lockIn = null; KS.explicit = false; KS.warn = 0;
        setLabel(LABEL[p] || 'KICK');
        if (TRK.t && TRK.t.list) tracker(TRK.t);   // (the session's next-kick ring comes and goes with the aim)
        if (gm.classList) gm.classList.toggle('so-scene', p === 'replay');
        apply(); layout();
      }

      /* ------------------------------------------------------------------------------------- the tracker --- */
      var TRK = { key: '', fit: 1 };
      function dotCls(v) { return v === 'goal' || v === 's' || v === true ? 's' : v === 'miss' || v === 'm' || v === false ? 'm' : v === 'next' || v === 'n' ? 'n' : ''; }
      function dotsHtml(list) { var h = ''; for (var i = 0; i < list.length; i++) h += '<span class="so-d ' + dotCls(list[i]) + '"></span>'; return '<span class="so-dots">' + h + '</span>'; }
      function pad5(list) { list = Array.isArray(list) ? list.slice() : []; while (list.length < 5) list.push(null); return list; }
      // Two shapes. A shootout's: { score:[a,b], dots:[[...],[...]], label }. The session's, as the director keeps it
      // in M1 (one kick, again and again): { kicks, goals, list:[outcome kinds], taker }, drawn one-sided: the taking
      // side's last five kicks (the one about to be taken ringed), and goals of kicks where the score goes.
      var AIMING = { walk: 1, whistle: 1, set: 1, runup: 1 };
      function tracker(t) {
        TRK.t = t || null;
        if (!t) { CT.trk = false; apply(); return; }
        if (!t.dots && Array.isArray(t.list)) {
          var aiming = !!AIMING[P], last = t.list.slice(-(aiming ? 4 : 5)).map(function (k) { return k === 'goal' ? 'goal' : 'miss'; });
          if (aiming) last.push('next');
          var kicks = Math.max(0, Math.round(+t.kicks || 0)), side = t.taker === 1 ? 1 : 0;
          t = { dots: side ? [null, last] : [last], one: side ? 1 : 0, scoreText: kicks ? Math.max(0, Math.round(+t.goals || 0)) + '/' + kicks : null, label: kicks ? 'Goals' : 'Kick 1' };
        }
        var key = JSON.stringify(t);
        if (key !== TRK.key) {
          TRK.key = key;
          var dots = t.dots || [], sc = t.score || [0, 0], A = TEAMS[t.one === 1 ? 1 : 0], B = TEAMS[1], one = t.one != null || !dots[1] && t.scoreText != null;
          if (t.one === 1) dots = [dots[1]];
          var score = one && t.scoreText == null ? '' : t.scoreText != null ? '<span class="sc so-gold">' + ex(t.scoreText).replace('/', '<em>/</em>') + '</span>'
            : '<span class="sc so-gold">' + (+sc[0] || 0) + '<em>&ndash;</em>' + (+sc[1] || 0) + '</span>';
          trk.innerHTML = '<div class="r">' +
            '<span class="tm"><i class="so-chip" style="background:' + A.color + '"></i>' + ex(A.short) + '</span>' + dotsHtml(pad5(dots[0])) + score +
            (one ? '' : dotsHtml(pad5(dots[1])) + '<span class="tm">' + ex(B.short) + '<i class="so-chip" style="background:' + B.color + '"></i></span>') +
            '</div>' + (t.label ? '<div class="so-cap">' + ex(t.label) + '</div>' : '');
          fitTracker();
          if (CT.onb) placeOnb();
        }
        CT.trk = true; apply();
      }
      function fitTracker() {
        var w = trk.offsetWidth || 0;   // (unscaled: transforms do not change it)
        if (!w) { var d = trk.style.display; trk.style.display = ''; w = trk.offsetWidth; trk.style.display = d; }
        var k = w ? Math.min(1, (W - 24) / w) : 1;
        if (Math.abs(k - TRK.fit) > 0.002 || !TRK.set) { TRK.fit = k; TRK.set = true; trk.style.transform = 'translateX(-50%)' + (k < 1 ? ' scale(' + k.toFixed(3) + ')' : ''); }
      }

      /* ------------------------------------------------------------------------------------- the reticle --- */
      // A figure-8 of the design's size (A = 0.06 m cold, ~0.19 m on fire) is about 10-30 px across at the Hero Penalty
      // Cam on a 1080p screen, hidden under the marker. So the loop is drawn at least loopMin px from its centre to its
      // side (2.6% of the screen's short side, 20 px at least: 56 px across at 1080p, 40 on a phone), the marker riding it
      // at the same scale; at the lock the loop folds away and the marker settles on its true target (the scale eases
      // back to 1), so the ball is always aimed at what the reticle ends on. Outside the frame (info.inFrame false) the
      // reticle is red; when the marker is off the screen (a phone held upright, |x| up to 7 m) a chevron on the edge
      // points at it.
      var RT = { k: 1, kLock: 1, lockT: 9, locked: false, lockedW: null, c: [0, 0], m: [0, 0], half: 0, cW: null, path: '', tone: '', inFrame: null, off: false, chev: null };
      var PJ = { e: null, p: null };
      function camPrep() {
        if (o.project) return true;
        var cam = o.camera || (typeof camera !== 'undefined' ? camera : null);
        if (!cam || !cam.projectionMatrix) return false;
        if (cam.updateMatrixWorld) cam.updateMatrixWorld();
        PJ.e = cam.matrixWorldInverse.elements; PJ.p = cam.projectionMatrix.elements; return true;
      }
      function v3(a) { return Array.isArray(a) || ArrayBuffer.isView(a) ? a : a && a.x != null ? [a.x, a.y, a.z] : null; }
      function proj(a) {
        a = v3(a); if (!a) return null;
        if (o.project) { var r = o.project(a); return r && isFinite(r[0]) && isFinite(r[1]) ? r : null; }
        var e = PJ.e, p = PJ.p, x = +a[0], y = +a[1], z = +a[2];
        var vx = e[0] * x + e[4] * y + e[8] * z + e[12], vy = e[1] * x + e[5] * y + e[9] * z + e[13], vz = e[2] * x + e[6] * y + e[10] * z + e[14];
        var cx = p[0] * vx + p[4] * vy + p[8] * vz + p[12], cy = p[1] * vx + p[5] * vy + p[9] * vz + p[13], cw = p[3] * vx + p[7] * vy + p[11] * vz + p[15];
        if (!(cw > 1e-6)) return null;
        return [(cx / cw + 1) / 2 * W, (1 - cy / cw) / 2 * H];
      }
      var LOOPN = 48;
      function loopWorld(L) {
        if (!L) return null;
        if (Array.isArray(L)) return L.length > 3 ? L : null;
        if (L.aim && L.A > 0) {
          var pts = [], z = L.z != null ? +L.z : -52.5;
          for (var i = 0; i < LOOPN; i++) { var th = i / LOOPN * Math.PI * 2; pts.push([L.aim[0] + L.A * Math.sin(th), L.aim[1] + 0.5 * L.A * Math.sin(2 * th), z]); }
          return pts;
        }
        return null;
      }
      function reticle(marker, loop, locked, info) {
        if (!marker || !camPrep()) { CT.ret = false; apply(); return; }
        var m = proj(marker); if (!m) { CT.ret = false; apply(); return; }
        locked = !!locked;
        if (locked && !RT.locked) { RT.lockT = 0; RT.kLock = RT.k; RT.lockedW = RT.cW; }
        if (!locked && RT.locked) RT.lockedW = null;
        RT.locked = locked;
        var pts = locked ? null : loopWorld(loop), c = null, half = 0, path = '';
        if (pts) {
          var sp = [], sx = 0, sy = 0, wx = 0, wy = 0, wz = 0, n = 0;
          for (var i = 0; i < pts.length; i++) { var pp = proj(pts[i]); if (!pp) continue; sp.push(pp); sx += pp[0]; sy += pp[1]; var w0 = v3(pts[i]); wx += +w0[0]; wy += +w0[1]; wz += +w0[2]; n++; }
          if (n > 3) {
            c = [sx / n, sy / n]; RT.cW = [wx / n, wy / n, wz / n];
            for (i = 0; i < sp.length; i++) half = Math.max(half, Math.abs(sp[i][0] - c[0]));
          }
          var min = o.loopMin != null ? +o.loopMin : Math.max(20, Math.min(W, H) * 0.026);
          RT.k = half > 0.5 ? Math.min(8, Math.max(1, min / half)) : 1;
          if (c && half > 0.5) {
            for (i = 0; i < sp.length; i++) path += (i ? 'L' : 'M') + fx1(c[0] + RT.k * (sp[i][0] - c[0])) + ' ' + fx1(c[1] + RT.k * (sp[i][1] - c[1]));
            path += 'Z';
          }
        } else if (locked) {
          // the lock: the marker eases from where it was drawn onto its true target
          var cw = RT.lockedW ? proj(RT.lockedW) : null;
          if (cw) c = cw;
          RT.k = 1 + (RT.kLock - 1) * (1 - ease(RT.lockT / 0.22));
        } else RT.k = 1;
        RT.half = half;
        var dm = c ? [c[0] + RT.k * (m[0] - c[0]), c[1] + RT.k * (m[1] - c[1])] : m;
        RT.m = dm; RT.c = c || dm;
        if (path !== RT.path) { RT.path = path; rLU.setAttribute('d', path); rLP.setAttribute('d', path); }
        rLU.style.display = rLP.style.display = rCT.style.display = path ? '' : 'none';
        if (path) rCT.setAttribute('transform', 'translate(' + fx1(c[0]) + ' ' + fx1(c[1]) + ')');
        rMK.setAttribute('transform', 'translate(' + fx1(dm[0]) + ' ' + fx1(dm[1]) + ')');
        var rr = (Math.min(W, H) < 600 ? 7 : 8) * (locked ? 0.8 + 0.2 * (1 - ease(RT.lockT / 0.22)) : 1);
        if (rr !== RT.rr) { RT.rr = rr; for (i = 0; i < 3; i++) rMR[i].setAttribute('r', rr.toFixed(2)); }
        if (RT.lockT < 0.45) { rLK.style.display = ''; rLK.setAttribute('transform', 'translate(' + fx1(dm[0]) + ' ' + fx1(dm[1]) + ')'); }
        // the frame: red outside it, amber by the woodwork (info from ShootBrain.aimInfo; none given, gold)
        var inF = info && info.inFrame != null ? !!info.inFrame : null, tone = inF === false ? 'out' : info && info.nearWood ? 'wood' : '';
        RT.inFrame = inF;
        if (tone !== RT.tone) { RT.tone = tone; ret.setAttribute('class', 'so-ret' + (tone ? ' ' + tone : '')); }
        // off the screen: a chevron on the edge, pointing at the marker
        var e0 = 10, off = dm[0] < e0 || dm[0] > W - e0 || dm[1] < e0 || dm[1] > H - e0;
        if (off) {
          var ins = Math.min(W, H) < 600 ? 22 : 28, ex0 = Math.min(W - ins, Math.max(ins, dm[0])), ey0 = Math.min(H - ins, Math.max(ins, dm[1]));
          var ang = Math.round(Math.atan2(dm[1] - ey0, dm[0] - ex0) * 180 / Math.PI);
          RT.chev = [fx1(ex0), fx1(ey0), ang];
          attr(rCH, 'transform', 'translate(' + fx1(ex0) + ' ' + fx1(ey0) + ') rotate(' + ang + ')');
        } else RT.chev = null;
        if (off !== RT.off) { RT.off = off; rCH.style.display = off ? '' : 'none'; }
        CT.ret = true; apply();
      }

      /* ---------------------------------------------------------------------------------- the heat gauge --- */
      // A vertical glass thermometer: the faint scale in the empty glass (ice-blue, amber, red, white-hot), the liquid in
      // the heat's own colour rising to the meniscus, COLD / WARM / HOT / ON FIRE beside it (the live band lit), the
      // degrees on top, a gold tick where the heat locked, and in the top band a heat haze over the liquid. Desktop: a
      // gauge to the left of the KICK disc, its foot on the disc's. Touch: above the KICK button (shootout.js's touchTop
      // counts '#gm .so-gauge', so the camera keeps the goal line clear of it).
      var GA = { w: 0, h: 0, compact: null, g: null, key: '', band: -1, fire: false, hz: -1, deg: -1, col: '', lockY: null };
      var HT = { H: 0, band: 'COLD', deg: 0, locked: false, lockH: null, lockFlare: 9 };
      var gSvg = q(gauge, 'svg'), gDg = q(gauge, '.dg'), gDgB = q(gauge, '.dg b');
      var GE = {};
      function gaugeSize() {
        var compact = touchUi || Math.min(W, H) < 560;
        var gh = compact ? Math.round(Math.max(128, Math.min(184, H * 0.2))) : Math.round(Math.max(176, Math.min(250, H * 0.225)));
        return { compact: compact, w: compact ? 82 : 100, h: gh };
      }
      function buildGauge() {
        var s = gaugeSize(), key = s.compact + '|' + s.w + '|' + s.h;
        if (key === GA.key) return;
        GA.key = key; GA.compact = s.compact; GA.w = s.w; GA.h = s.h;
        var cmp = s.compact, padT = cmp ? 9 : 11, rh = cmp ? 19 : 24, gap = cmp ? 5 : 7, padB = cmp ? 9 : 11;
        var sw = s.w - 2, sh = s.h - padT - rh - gap - padB - 2;   // (inside the glass's 1 px border)
        var tw = cmp ? 9 : 10, br = cmp ? 8 : 9.5, tx = sw - (cmp ? 21 : 25), by = sh - br - 1, y0 = by - br * 0.72, yT = 1 + tw / 2 + 1.5;
        var g = GA.g = { sw: sw, sh: sh, tw: tw, br: br, tx: tx, by: by, y0: y0, yT: yT, fs: cmp ? 8 : 9 };
        gauge.style.width = sw + 'px'; gauge.style.height = s.h + 'px'; gauge.style.padding = padT + 'px 0 ' + padB + 'px';
        gDg.style.fontSize = (cmp ? 18 : 23) + 'px'; gDg.style.height = rh + 'px'; gDg.style.marginBottom = gap + 'px';
        gSvg.setAttribute('width', sw); gSvg.setAttribute('height', sh); gSvg.setAttribute('viewBox', '0 0 ' + sw + ' ' + fx1(sh));
        // the thermometer's outline: the tube with a round cap, into the bulb (inset for the liquid's clip)
        function outline(ins) {
          var hw = tw / 2 - ins, r = br - ins, yj = by - Math.sqrt(Math.max(0, r * r - hw * hw)), top = 1 + ins;
          return 'M' + fx1(tx - hw) + ' ' + fx1(yj) + 'L' + fx1(tx - hw) + ' ' + fx1(top + hw) + 'A' + fx1(hw) + ' ' + fx1(hw) + ' 0 0 1 ' + fx1(tx + hw) + ' ' + fx1(top + hw) +
            'L' + fx1(tx + hw) + ' ' + fx1(yj) + 'A' + fx1(r) + ' ' + fx1(r) + ' 0 1 1 ' + fx1(tx - hw) + ' ' + fx1(yj) + 'Z';
        }
        var lv = function (h) { return y0 - h * (y0 - yT); };
        var stops = STOPS.map(function (st) { return '<stop offset="' + st[0] + '" stop-color="' + st[1] + '"/>'; }).join('');
        var labels = '', ticks = '';
        for (var i = 0; i < 4; i++) {
          var a = i ? BANDS[i - 1] : 0, b = i < 3 ? BANDS[i] : 1;
          labels += '<text x="' + fx1(tx - tw / 2 - (cmp ? 7 : 9)) + '" y="' + fx1(lv((a + b) / 2) + g.fs * 0.36) + '" text-anchor="end" font-size="' + g.fs + '" letter-spacing="' + (cmp ? 0.8 : 1.1) + '">' + BNAME[i] + '</text>';
          if (i < 3) ticks += '<line x1="' + fx1(tx - tw / 2 - 5) + '" y1="' + fx1(lv(BANDS[i])) + '" x2="' + fx1(tx - tw / 2 - 1.5) + '" y2="' + fx1(lv(BANDS[i])) + '"/>';
        }
        var haze = '';
        for (i = -1; i <= 1; i++) { var hx = tx + i * (tw * 0.42); haze += '<path d="M' + fx1(hx) + ' 0q2 -2.6 0 -5.2t0 -5.2"/>'; }
        gSvg.innerHTML = '<defs>' +
          '<linearGradient id="so-sc-' + UID + '" gradientUnits="userSpaceOnUse" x1="0" y1="' + fx1(y0) + '" x2="0" y2="' + fx1(yT) + '">' + stops + '</linearGradient>' +
          '<linearGradient id="so-lq-' + UID + '" x1="0" y1="1" x2="0" y2="0"><stop offset="0" class="s0"/><stop offset="1" class="s1"/></linearGradient>' +
          '<linearGradient id="so-sh-' + UID + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
          '<clipPath id="so-cp-' + UID + '"><path d="' + outline(1.3) + '"/></clipPath></defs>' +
          '<g class="lb">' + labels + '</g><g class="bt">' + ticks + '</g>' +
          '<path class="gl" d="' + outline(0) + '"/>' +
          '<g clip-path="url(#so-cp-' + UID + ')"><rect class="sc" x="' + fx1(tx - br) + '" y="0" width="' + fx1(br * 2) + '" height="' + fx1(by + br) + '" fill="url(#so-sc-' + UID + ')" opacity=".2"/>' +
          '<rect class="lq" x="' + fx1(tx - br) + '" width="' + fx1(br * 2) + '" fill="url(#so-lq-' + UID + ')"/>' +
          '<rect class="sh" x="' + fx1(tx - tw / 2) + '" y="' + fx1(lv(BANDS[2]) - 5) + '" width="' + tw + '" height="10" fill="url(#so-sh-' + UID + ')"/></g>' +
          '<line class="hl" x1="' + fx1(tx - tw / 2 + 2.2) + '" y1="' + fx1(yT + 2) + '" x2="' + fx1(tx - tw / 2 + 2.2) + '" y2="' + fx1(by - br) + '"/>' +
          '<ellipse cx="' + fx1(tx - br * 0.36) + '" cy="' + fx1(by - br * 0.36) + '" rx="' + fx1(br * 0.26) + '" ry="' + fx1(br * 0.2) + '" fill="#fff" opacity=".42"/>' +
          '<g class="hz">' + haze + '</g>' +
          '<g class="mn"><line class="g" x1="' + fx1(tx - tw / 2 - 1) + '" x2="' + fx1(tx + tw / 2 + 1) + '" y1="0" y2="0"/><line class="l" x1="' + fx1(tx - tw / 2 - 2.5) + '" x2="' + fx1(tx + tw / 2 + 2.5) + '" y1="0" y2="0"/></g>' +
          '<g class="lt"><line x1="' + fx1(tx - tw / 2 - 7) + '" x2="' + fx1(tx + tw / 2 + 6) + '" y1="0" y2="0"/><path d="M' + fx1(tx + tw / 2 + 5) + ' 0L' + fx1(tx + tw / 2 + 11) + ' -3.6L' + fx1(tx + tw / 2 + 11) + ' 3.6Z"/></g>' +
          '<circle class="fl" cx="' + fx1(tx) + '" cy="0" r="4"/>';
        GE = { lb: gSvg.querySelectorAll('.lb text'), lq: q(gSvg, '.lq'), s0: q(gSvg, '.s0'), s1: q(gSvg, '.s1'), sh: q(gSvg, '.sh'), hz: q(gSvg, '.hz'), mn: q(gSvg, '.mn'),
          mnG: q(gSvg, '.mn .g'), mnL: q(gSvg, '.mn .l'), lt: q(gSvg, '.lt'), fl: q(gSvg, '.fl'), lv: lv };
        GE.sh.style.display = 'none'; GE.lt.style.display = 'none'; GE.fl.style.display = 'none';
        GA.band = -1; GA.fire = null; GA.hz = -1; GA.deg = -1; GA.col = ''; GA.lockY = null; GA.y = null;
        drawGauge();
      }
      function heat(h) {
        if (!h) { CT.gauge = false; apply(); return; }
        var Hv = cl(+h.H || 0), bi = typeof h.band === 'string' ? BNAME.indexOf(String(h.band).toUpperCase()) : -1;
        if (bi < 0) bi = bandOf(Hv);
        var deg = h.deg != null && isFinite(h.deg) ? Math.max(0, Math.min(100, Math.floor(+h.deg))) : Math.floor(100 * Hv + 1e-9);
        var locked = !!h.locked;
        if (locked && !HT.locked) HT.lockFlare = 0;
        HT.H = Hv; HT.band = BNAME[bi]; HT.bi = bi; HT.deg = deg; HT.locked = locked;
        HT.lockH = locked ? (h.lockDeg != null && isFinite(h.lockDeg) ? cl(+h.lockDeg / 100) : Hv) : null;
        if (!CT.gauge) { CT.gauge = true; apply(); layout(); }
        drawGauge();
        autoCaption();
      }
      function drawGauge() {
        var g = GA.g; if (!g || !GE.lq) return;
        var Hv = HT.H, bi = HT.bi != null ? HT.bi : bandOf(Hv), y = Math.round(GE.lv(Hv) * 4) / 4;
        if (y !== GA.y) {
          GA.y = y;
          attr(GE.lq, 'y', fx1(y)); attr(GE.lq, 'height', fx1(Math.max(0, g.by + g.br - y)));
          attr(GE.mn, 'transform', 'translate(0 ' + y + ')');
          GE.mn.style.display = Hv > 0.012 ? '' : 'none';
        }
        // the liquid's colour, every 1/100 of the heat
        var cq = Math.round(Hv * 100), ck = String(cq);
        if (ck !== GA.col) {
          GA.col = ck;
          // (the column runs from a cooler colour at the bulb to the heat's at the top: white-hot over red when on fire)
          var c = heatRgb(cq / 100), top = rgbS(mixW(c, 0.12)), base = rgbS(heatRgb(cq / 100 * 0.8), 0.9);
          attr(GE.s0, 'stop-color', base); attr(GE.s1, 'stop-color', top);
          attr(GE.mnG, 'stroke', rgbS(c)); attr(GE.mnL, 'stroke', rgbS(mixW(c, 0.55)));
        }
        if (bi !== GA.band) {
          GA.band = bi;
          for (var i = 0; i < GE.lb.length; i++) { if (i === bi) GE.lb[i].setAttribute('style', 'fill:' + BCOL[i]); else GE.lb[i].removeAttribute('style'); }
          gDg.style.color = BCOL[bi];
        }
        var fire = bi === 3;
        if (fire !== GA.fire) { GA.fire = fire; gauge.classList.toggle('fire', fire); }
        if (HT.deg !== GA.deg) { GA.deg = HT.deg; gDgB.textContent = String(HT.deg); }
        // the haze: over the liquid once it is in the top band (and the sheen through it)
        var hz = RM ? 0 : Math.round(cl((Hv - (BANDS[2] - 0.05)) / 0.07) * 20) / 20;
        if (hz !== GA.hz) {
          GA.hz = hz; GE.hz.style.opacity = String(hz); GE.hz.style.display = hz > 0 ? '' : 'none';
          GE.sh.style.display = hz > 0 ? '' : 'none';
        }
        if (hz > 0) {
          attr(GE.hz, 'transform', 'translate(0 ' + fx1(y - 1) + ')');
          var d = fx1(Math.min(-4, y - (GE.lv(BANDS[2]) - 5) - 2)) + 'px';
          if (GE.sh.style.getPropertyValue('--d') !== d) GE.sh.style.setProperty('--d', d);
        }
        // the lock: a gold tick where the heat froze
        var ly = HT.lockH != null ? Math.round(GE.lv(HT.lockH) * 4) / 4 : null;
        if (ly !== GA.lockY) {
          GA.lockY = ly;
          if (ly == null) GE.lt.style.display = 'none';
          else { GE.lt.style.display = ''; attr(GE.lt, 'transform', 'translate(0 ' + ly + ')'); }
        }
      }
      function stepGauge(dt) {
        if (HT.lockFlare >= 0.5 || !GE.fl) { if (GE.fl && GE.fl.style.display !== 'none') GE.fl.style.display = 'none'; return; }
        HT.lockFlare += dt;
        var u = HT.lockFlare / 0.5;
        if (u >= 1 || RM || GA.lockY == null) { GE.fl.style.display = 'none'; return; }
        GE.fl.style.display = ''; attr(GE.fl, 'cy', fx1(GA.lockY)); attr(GE.fl, 'r', (4 + 14 * ease(u)).toFixed(1)); GE.fl.style.strokeOpacity = (0.95 * (1 - u)).toFixed(3);
      }

      /* ------------------------------------------------------------------------------- the KICK ring --- */
      var RG = { p: null, w: null, mark: null, grade: null, ticks: [], hot: false, halo: null, key: '', hold: null, hg: -1 };
      var idleT = 0, idleBeat = 0;
      // the KICK label (the big line): TAP to run up, HOLD through the last stride, RELEASE in the sweet spot
      var KS = { label: 'KICK', tone: null, lockIn: null, cap: null, explicit: false, cls: '', thump: 0, warn: 0 };
      function labelEls() { var a = [q(kdFace, 'b')]; if (kbtn) { var b = q(kbtn, 'b'); if (b) a.push(b); } return a; }
      function setLabel(s) {
        s = String(s || 'KICK').toUpperCase(); KS.label = s;
        var cls = (s.length >= 6 ? 'l7' : s.length === 5 ? 'l5' : '') + (s === 'TAP' && P === 'set' ? ' br' : '');
        labelEls().forEach(function (b) { if (b.textContent !== s) b.textContent = s; if (b.className !== cls.trim()) b.className = cls.trim(); });
        faceCls(); autoCaption();
      }
      function faceCls() {
        var dim = P === 'strike' || P === 'flight' || P === 'result';
        var c = (KS.tone === 'gold' ? ' t-gold' : KS.tone === 'coral' ? ' t-coral' : '') + (KS.warn > 0.05 && KS.label === 'TAP' ? ' so-warn' : '') + (dim && KS.label === 'KICK' ? ' dim' : '');
        if (c === KS.cls) return;
        var prev = KS.cls; KS.cls = c;
        [kdFace, kbtn].forEach(function (e) {
          if (!e) return;
          prev.split(' ').forEach(function (k) { if (k) e.classList.remove(k); });
          c.split(' ').forEach(function (k) { if (k) e.classList.add(k); });
        });
      }
      function kickState(k) {
        k = k || {};
        KS.explicit = true;
        KS.tone = k.tone === 'gold' || k.tone === 'coral' ? k.tone : null;
        KS.lockIn = k.lockIn != null && isFinite(k.lockIn) ? +k.lockIn : null;
        // the HOLD arc's glow: 0.35 s before the predicted lock it lights (D9's warning), full once in the stride
        var L = String(k.label || KS.label).toUpperCase();
        KS.warn = KS.lockIn != null ? cl(1 - KS.lockIn / 0.35) : L === 'HOLD' || L === 'RELEASE' ? 1 : 0;
        if (L !== KS.label) setLabel(L); else { faceCls(); autoCaption(); }
        drawHold();
        apply();
      }
      // the small line: the director's when it gives one (caption), else the band in TAP, the plant in HOLD
      function autoCaption() {
        var s = KS.cap != null ? KS.cap : KS.label === 'TAP' && CT.gauge && (P === 'runup' || HT.deg > 0) ? HT.band : KS.label === 'HOLD' ? 'to the plant' : KS.label === 'AGAIN' ? '' : '';
        capText(s);
      }
      function capText(s) {
        var cls = s.length > 9 ? 'lc' : '';
        [q(kdFace, 'small'), kbtn ? q(kbtn, 'small') : null].forEach(function (a) { if (!a) return; if (a.textContent !== s) a.textContent = s; if (a.className !== cls) a.className = cls; });
      }
      function caption(s) { KS.cap = s == null ? null : String(s); autoCaption(); }
      function at(p, r) { var th = p * Math.PI * 2 - Math.PI / 2; return [66 + r * Math.cos(th), 66 + r * Math.sin(th)]; }
      function gradeColor(g) { return g === 'perfect' ? GOLD : g === 'good' ? '#FFFFFF' : g === 'early' || g === 'late' ? AMBER : g ? CORAL : '#FFFFFF'; }
      function drawHold() {
        var h = RG.hold, gk = h ? Math.round(KS.warn * 50) / 50 : -1;
        var key = h ? h[0].toFixed(3) + ',' + h[1].toFixed(3) + '|' + gk : '';
        if (key === RG.hk) return;
        RG.hk = key;
        if (!h || !(h[1] > h[0])) { gHZ.style.display = gHZG.style.display = 'none'; return; }
        var len = ((h[1] - h[0]) * C2).toFixed(2), off = (-h[0] * C2).toFixed(2);
        [gHZ, gHZG].forEach(function (e) { e.setAttribute('stroke-dasharray', len + ' ' + C2.toFixed(2)); e.setAttribute('stroke-dashoffset', off); e.style.display = ''; });
        gHZ.style.strokeOpacity = (0.34 + 0.66 * gk).toFixed(2);
        gHZG.style.strokeOpacity = (0.3 * gk).toFixed(2);
      }
      function drawRing(force) {
        var key = (RG.p == null ? 'n' : RG.p.toFixed(3)) + '|' + (RG.w ? RG.w[0].toFixed(3) + ',' + RG.w[1].toFixed(3) : '') + '|' + (RG.mark == null ? '' : RG.mark.toFixed(3)) + '|' + RG.grade + '|' + RG.ticks.length;
        drawHold();
        if (key === RG.key && !force) return;
        RG.key = key;
        if (RG.w && RG.w[1] > RG.w[0]) {
          var len = ((RG.w[1] - RG.w[0]) * C).toFixed(2), off = (-RG.w[0] * C).toFixed(2);
          gW.setAttribute('stroke-dasharray', len + ' ' + C.toFixed(2)); gW.setAttribute('stroke-dashoffset', off);
          gWG.setAttribute('stroke-dasharray', len + ' ' + C.toFixed(2)); gWG.setAttribute('stroke-dashoffset', off);
          gW.style.display = gWG.style.display = '';
        } else gW.style.display = gWG.style.display = 'none';
        if (RG.p != null && RG.p > 0.001) { gP.setAttribute('stroke-dasharray', (RG.p * C).toFixed(2) + ' ' + C.toFixed(2)); gP.style.display = ''; }
        else gP.style.display = 'none';
        var hot = !!(RG.p != null && RG.w && RG.p >= RG.w[0] && RG.p <= RG.w[1]);
        if (hot !== RG.hot) { RG.hot = hot; kdFace.classList.toggle('hot', hot); if (kbtn) kbtn.classList.toggle('hot', hot); }
        gWG.setAttribute('stroke-opacity', hot ? '0.5' : '0.24');
        var h = '';
        for (var i = 0; i < RG.ticks.length; i++) {
          var g = RG.ticks[i].g, t0 = at(RG.ticks[i].p, g ? 59.5 : 60.5), t1 = at(RG.ticks[i].p, g ? 66 : 64.5);
          h += '<line class="tk' + (g ? ' g' : '') + '" x1="' + fx1(t0[0]) + '" y1="' + fx1(t0[1]) + '" x2="' + fx1(t1[0]) + '" y2="' + fx1(t1[1]) + '"/>';
        }
        gTks.innerHTML = h;
        if (RG.mark != null) {
          var a0 = at(RG.mark, 49), a1 = at(RG.mark, 63);
          gMK.setAttribute('x1', fx1(a0[0])); gMK.setAttribute('y1', fx1(a0[1])); gMK.setAttribute('x2', fx1(a1[0])); gMK.setAttribute('y2', fx1(a1[1]));
          gMK.style.stroke = gradeColor(RG.grade); gMK.style.display = '';
        } else gMK.style.display = 'none';
      }
      // the approach ring at u (1 at the lock, 0 on the plant): radius 56 + 40 u, brighter as it closes, gone 0.1 s past
      // the plant (u < 0) or once the strike is released (the ring's mark)
      var APK = '';
      function drawApproach(u) {
        var vis = u != null && u > -0.25 && !RM, key = vis ? u.toFixed(3) : 'off';
        if (key === APK) return;
        APK = key;
        if (!vis) { gAP.style.display = 'none'; return; }
        gAP.setAttribute('r', (56 + 40 * Math.max(0, Math.min(1, u))).toFixed(2));
        gAP.style.strokeOpacity = (u > 0 ? 0.35 + 0.6 * (1 - Math.min(1, u)) : Math.max(0, 0.95 * (1 + 4 * u))).toFixed(3);
        gAP.style.display = '';
      }
      function fire(kind) {
        // (a tap: a quick small white halo and a thump of the label; a step or the plant: a tick on the ring)
        RG.halo = kind === 'tap' ? { t: 0, tap: true } : { t: 0, gold: kind !== 'step' };
        if (kind === 'tap') KS.thump = 1;
        if ((kind === 'step' || kind === 'plant') && RG.p != null && RG.ticks.length < 12) RG.ticks.push({ p: RG.p, g: kind === 'plant' });
      }
      function ring(progress, win, pulse, mark, zones) {
        RG.p = progress == null || !isFinite(progress) ? null : cl(+progress);
        RG.w = win && win.length === 2 && isFinite(win[0]) && isFinite(win[1]) ? [cl(+win[0]), cl(+win[1])] : null;
        RG.mark = mark == null || !isFinite(mark) ? null : cl(+mark);
        var hz = zones && zones.hold;
        RG.hold = hz && hz.length === 2 && isFinite(hz[0]) && isFinite(hz[1]) ? [cl(+hz[0]), cl(+hz[1])] : progress == null ? null : RG.hold;
        drawApproach(zones && zones.approach != null && isFinite(zones.approach) && RG.mark == null && progress != null ? +zones.approach : null);
        if (RG.p != null) idleT = 0;
        if (Array.isArray(pulse)) pulse.forEach(function (k) { if (k) fire(k); }); else if (pulse) fire(pulse);   // (a frame may carry a tap and a step)
        drawRing(false);
      }
      function stepHalo(dt) {
        if (KS.thump > 0) {
          KS.thump = RM ? 0 : Math.max(0, KS.thump - dt / 0.14);
          var sc = KS.thump > 0 ? 'scale(' + (1 + 0.1 * ease(KS.thump)).toFixed(3) + ')' : '';
          labelEls().forEach(function (b) { if (b.style.transform !== sc) b.style.transform = sc; });
        }
        if (!RG.halo) { if (gH.style.display !== 'none') gH.style.display = 'none'; return; }
        RG.halo.t += dt;
        var tap = RG.halo.tap, u = RG.halo.t / (tap ? 0.18 : 0.36);
        if (u >= 1) { RG.halo = null; gH.style.display = 'none'; return; }
        gH.style.display = ''; gH.setAttribute('r', (tap ? 50 + 7 * ease(u) : 48 + 18 * ease(u)).toFixed(2));
        gH.style.stroke = RG.halo.gold ? GOLD : '#FFFFFF'; gH.style.strokeOpacity = ((1 - u) * (RG.halo.gold ? 0.9 : tap ? 0.55 : 0.7)).toFixed(3);
      }
      // the touch kit's KICK (the director makes it with tbtn and keeps its handlers): the ring and the two lines go in
      function dress(btn) {
        if (kbtn && kbtn !== btn) undecorate();
        if (!btn || btn === kbtn) return;
        kbtn = btn; kbtnHtml = kbtn.innerHTML;
        kbtn.classList.add('so-kick');
        kbtn.innerHTML = '<b>KICK</b><small></small>';
        KS.cls.split(' ').forEach(function (k) { if (k) kbtn.classList.add(k); });
        setLabel(KS.label);
        if (RG.hot) kbtn.classList.add('hot');
      }
      function kick(btn) { dress(btn || null); layout(); }
      // (or found: the director's tbtn('KICK') may come after the HUD; it is the pad's button marked so-kick, or KICK)
      function findKick() {
        var b = gm.querySelector('.tpad button.so-kick');
        if (!b) { var all = gm.querySelectorAll('.tpad button'); for (var i = 0; i < all.length; i++) if (/^\s*KICK\s*$/i.test(all[i].textContent)) b = all[i]; }
        return b;
      }
      function undecorate() {
        if (!kbtn) return;
        if (rg.parentNode === kbtn) kd.appendChild(rg);
        ['hot', 't-gold', 't-coral', 'so-warn', 'dim'].forEach(function (k) { kbtn.classList.remove(k); });
        kbtn.innerHTML = kbtnHtml || 'KICK'; kbtn = null;
      }

      /* -------------------------------------------------------------------------------- the grade, the result --- */
      var GRADE = { perfect: 'Perfect', good: 'Good', early: 'Early', late: 'Late', scuffed: 'Scuffed', leaned: 'Leaned back' };
      var KIND = { goal: 'Goal', saved: 'Saved', post: 'Post', bar: 'Bar', wide: 'Wide', over: 'Over', miss: 'Missed', short: 'Short' };
      var FL = { t: 9, key: '' }, RS = { key: '', kmh: null, band: null };
      function ms(errMs) {
        if (errMs == null || !isFinite(errMs)) return '';
        var v = Math.round(+errMs);
        return (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v) + ' ms';
      }
      function flash(grade, errMs) {
        if (!grade) { CT.flash = false; FL.key = ''; apply(); return; }
        var key = grade + '|' + errMs;
        if (key === FL.key) return;   // (called every frame, it shows once)
        FL.key = key; RG.grade = String(grade); drawRing(true);
        var b = q(flashEl, 'b'); b.textContent = GRADE[grade] || String(grade); b.style.color = gradeColor(grade);
        q(flashEl, 'span').textContent = ms(errMs);
        FL.t = 0; CT.flash = true; apply(); layout();
      }
      function result(kind, grade, errMs, more) {
        if (!kind) { CT.res = false; RS.key = ''; apply(); return; }
        more = more || {};
        var hb = more.heat || null, kmh = more.kmh != null && isFinite(more.kmh) && +more.kmh > 0 ? Math.round(+more.kmh) : null;
        var bi = hb && hb.band ? BNAME.indexOf(String(hb.band).toUpperCase()) : -1, deg = hb && hb.deg != null && isFinite(hb.deg) ? Math.max(0, Math.min(100, Math.floor(+hb.deg))) : null;
        var key = [kind, grade, errMs, more.sub, more.woodwork, more.held, kmh, bi, deg].join('|');
        if (key === RS.key && CT.res) return;   // (called every frame, it comes in once)
        RS.key = key; RS.kmh = kmh; RS.band = bi >= 0 ? BNAME[bi] + (deg != null ? ' ' + deg + '°' : '') : null;
        var win = kind === 'goal', line = [];
        if (more.sub) line.push(ex(more.sub));
        else if (win && (more.woodwork === 'post' || more.woodwork === 'bar')) line.push('In off the ' + more.woodwork);
        else if (kind === 'saved' && more.held != null) line.push(more.held ? 'Held' : 'Parried');
        if (grade) line.push('<u style="color:' + (grade === 'good' ? 'rgba(244,246,250,.92)' : gradeColor(grade)) + '">' + ex(GRADE[grade] || grade) + '</u>');
        if (errMs != null && isFinite(errMs)) line.push('Release ' + ex(ms(errMs)));
        res.classList.toggle('win', win); res.classList.toggle('so-lit', win);
        q(res, 'b').textContent = KIND[kind] || String(kind);
        var cap = q(res, '.so-cap'); cap.innerHTML = line.join(' &middot; '); cap.style.display = line.length ? '' : 'none';
        // the ball's speed and the heat it was struck with
        var kv = '';
        if (kmh != null) kv += '<em><strong>' + kmh + '</strong>km/h</em>';
        if (bi >= 0) kv += '<em style="color:' + BCOL[bi] + '"><i style="background:' + BCOL[bi] + ';box-shadow:0 0 8px ' + BCOL[bi] + '"></i>' + BNAME[bi] + (deg != null ? ' ' + deg + '&deg;' : '') + '</em>';
        q(res, '.so-kv').innerHTML = kv;
        CT.res = true; FD.res.a = Math.min(FD.res.a, 0.001); apply();
      }

      /* ------------------------------------------------------------------------------ the first kick's line --- */
      var OB = { text: null };
      var ONBOARD = 'TAP to run up · steer to aim · RELEASE as the gold ring closes';
      function onboard(text) {
        if (text === true) text = ONBOARD;
        if (!text) { CT.onb = false; OB.text = null; apply(); return; }
        text = String(text);
        if (text !== OB.text) {
          OB.text = text;
          // (words in capitals are the moves: bold; 'plant' is the sweet spot: gold)
          onb.innerHTML = text.split(/\s*·\s*/).map(function (seg) {
            return '<span>' + ex(seg).replace(/\b([A-Z]{2,})\b/g, '<b>$1</b>').replace(/\bplant\b/, '<b class="so-gold">plant</b>') + '</span>';
          }).join('<i>&middot;</i>');
          placeOnb();
        }
        CT.onb = true; apply();
      }
      function placeOnb() {
        // one line if it fits the screen, else stacked
        var d = onb.style.display; if (d === 'none') onb.style.display = '';
        if (onb.classList.contains('stack')) onb.classList.remove('stack');
        if (onb.scrollWidth > onb.clientWidth + 1) onb.classList.add('stack');
        if (d === 'none') onb.style.display = d;
        // under the tracker, and under v1's pause button on a phone
        var top = 12, tr = CT.trk ? measure(trk) : { height: 0 }, ps = gm.querySelector('.pause'), ow = measure(onb).width;
        if (tr.height) top = Math.max(top, tr.bottom + 10);
        else top = Math.max(top, 84);
        if (ps) { var pr = ps.getBoundingClientRect(); if (pr.height && pr.left < W / 2 + ow / 2 + 8) top = Math.max(top, pr.bottom + 8); }
        onb.style.top = Math.round(top) + 'px';
      }

      /* --------------------------------------------------------------- the replay, Skip, the hint, retry --- */
      var WP = { t: 9 }, dotT = 0;
      function replay(on) {
        on = !!on;
        if (on && !CT.lb && !RM) WP.t = 0;
        CT.lb = on; apply();
      }
      function skip(on) { CT.skip = !!on; apply(); }
      var HINTS = {
        keys: '<span>Steer <b>&larr; &rarr; &uarr; &darr;</b></span><i>&middot;</i><span><b>TAP Space</b> to run up</span><i>&middot;</i><span><b>RELEASE</b> on the <b class="so-gold">plant</b></span>',
        pad: '<span>Steer with the <b>stick</b></span><i>&middot;</i><span><b>TAP A</b></span><i>&middot;</i><span><b>RELEASE</b> on the <b class="so-gold">plant</b></span>',
        stride: '<span><b>HOLD</b></span><i>&middot;</i><span><b>RELEASE</b> as the <b class="so-gold">ring</b> closes</span>',
        runup: '<span><b>TAP</b> faster, hit harder</span><i>&middot;</i><span><b>RELEASE</b> on the <b class="so-gold">plant</b></span>',
      };
      HINTS.aim = HINTS.mouse = HINTS.keys;   // (no mouse aim any more: the mouse button is KICK, the keys steer)
      var HN = { key: null };
      function setHint(text) {
        if (!text) { CT.hint = false; apply(); return; }
        if (text !== HN.key) { HN.key = text; hint.innerHTML = HINTS[text] || '<span>' + ex(text) + '</span>'; placeHint(); }
        CT.hint = true; apply();
      }
      function placeHint() {
        // centred; slid left on a narrow desktop so it never runs under the gauge
        var hw = hint.offsetWidth || measure(hint).width;
        var lim = touchUi || !GA.left ? W - 12 : GA.left - 14, x = W / 2;
        if (hw && x + hw / 2 > lim) x = Math.max(12 + hw / 2, lim - hw / 2);
        var l = Math.round(x) + 'px'; if (hint.style.left !== l) hint.style.left = l;
      }
      var RTK = { key: '' };
      function retry(t) {
        if (!t) { CT.rt = false; apply(); return; }
        var g = Math.max(0, Math.round(+t.goals || 0)), k = Math.max(0, Math.round(+t.kicks || 0)), key = g + '/' + k;
        if (key !== RTK.key) { RTK.key = key; q(rt, '.t b').innerHTML = g + '<i>/' + k + '</i>'; }
        CT.rt = true; apply();
      }

      /* ------------------------------------------------------------------------------------------ ?perf --- */
      var PF = { dts: new Float32Array(240), n: 0, i: 0, t: 0, stats: null };
      function perf(stats) {
        if (stats === false) { PERF = false; pf.style.display = 'none'; return; }
        PERF = true; pf.style.display = ''; if (stats && typeof stats === 'object') PF.stats = stats;
      }
      // (values as numbers, or as the director's strings: '12.3 ms', 'on'/'off')
      function num(v) { var n = typeof v === 'number' ? v : parseFloat(v); return isFinite(n) ? n : null; }
      function onOff(v) { return typeof v === 'string' ? !/^(off|false|0|no|)$/i.test(v.trim()) : !!v; }
      function drawPerf() {
        var a = Array.prototype.slice.call(PF.dts, 0, PF.n).sort(function (x, y) { return x - y; });
        var p50 = a.length ? a[Math.floor(a.length * 0.5)] * 1000 : 0, p95 = a.length ? a[Math.min(a.length - 1, Math.floor(a.length * 0.95))] * 1000 : 0;
        var S = PF.stats || {}, fps = num(S.fps) != null ? num(S.fps) : p50 > 0 ? 1000 / p50 : 0, rows = [];
        // (red: past the M1 phone budget, design 8.1: 40 fps floor, p95 25 ms, 150 calls, 350k triangles)
        rows.push(['fps', fps ? fps.toFixed(fps < 100 ? 1 : 0) : '-', fps > 0 && fps < 40]);
        if (num(S.ms) != null) rows.push(['mean', num(S.ms).toFixed(1) + ' ms']);
        if (p50) rows.push(['p50', p50.toFixed(1) + ' ms'], ['p95', p95.toFixed(1) + ' ms', p95 > 25]);
        var wv = num(S.worst); if (wv != null) rows.push(['worst', wv.toFixed(1) + ' ms', wv > 50]);
        var cv = num(S.calls); if (cv != null) rows.push(['calls', String(Math.round(cv)), cv > 150]);
        var tv = num(S.tris); if (tv != null) rows.push(['tris', (tv / 1000).toFixed(0) + 'k', tv > 350000]);
        var pr = num(S.pr != null ? S.pr : S.dpr);
        if (pr != null) rows.push(['ratio', pr.toFixed(2)]);
        if (S.msaa != null) rows.push(['msaa', onOff(S.msaa) ? 'on' : 'off']);
        if (S.bloom != null) rows.push(['bloom', onOff(S.bloom) ? 'on' : 'off']);
        if (num(S.heap) != null) rows.push(['heap', Math.round(num(S.heap)) + ' MB']);
        for (var k in S) if (!/^(fps|ms|worst|calls|tris|pr|dpr|msaa|bloom|heap)$/.test(k) && S[k] != null && typeof S[k] !== 'object') rows.push([k, String(S[k])]);
        rows.push(['phase', P]);
        var h = '';
        for (var i = 0; i < rows.length; i++) h += '<small>' + ex(rows[i][0]) + '</small><b' + (rows[i][2] ? ' class="bad"' : '') + '>' + ex(rows[i][1]) + '</b>';
        pf.innerHTML = h;
      }

      /* -------------------------------------------------------------------------------- layout, the frame --- */
      function layout() {
        W = innerWidth || W; H = innerHeight || H;
        if (!(kbtn && kbtn.isConnected)) { var fb = findKick(); if (fb) dress(fb); else if (kbtn) kbtn = null; }
        var t0 = !!(kbtn && kbtn.isConnected && kbtn.getClientRects().length);
        if (t0 !== touchUi) touchUi = t0;
        var host = touchUi ? kbtn : kd;
        if (rg.parentNode !== host) host.appendChild(rg);
        // KICK's box: the touch button, or the disc (the CSS's place: 54 px in, 46 up, 96 across)
        var r = touchUi ? kbtn.getBoundingClientRect() : { left: W - 54 - 96, right: W - 54, top: H - 46 - 96, bottom: H - 46, width: 96, height: 96 };
        if (touchUi) GA.kk = Math.round(r.left) + ',' + Math.round(r.top);
        var cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2, RING = 18;
        // the gauge: touch, centred above the button; desktop, to the left of the disc, its foot on the disc's
        buildGauge();
        var gl, gt;
        if (touchUi) { gl = cx - GA.w / 2; gt = r.top - RING - 10 - GA.h; gl = Math.min(W - 6 - GA.w, gl); }
        else { gl = r.left - RING - 16 - GA.w; gt = r.bottom - GA.h; }
        gl = Math.round(Math.max(6, gl)); gt = Math.round(Math.max(6, gt));
        GA.left = gl; GA.top = gt;
        if (gauge.style.left !== gl + 'px') gauge.style.left = gl + 'px';
        if (gauge.style.top !== gt + 'px') gauge.style.top = gt + 'px';
        // the grade: desktop, centred over the ring; touch, to the ring's left, level with the button
        var fw = flashEl.offsetWidth, fh = flashEl.offsetHeight;
        if (!fw) { var fr = measure(flashEl); fw = fr.width; fh = fr.height; }
        var fl, ft;
        if (touchUi) { fl = r.left - RING - 12 - fw; ft = cy - fh / 2; }
        else { fl = Math.min(W - 10 - fw, cx - fw / 2); ft = r.top - RING - 12 - fh; }
        flashEl.style.left = Math.round(Math.max(8, fl)) + 'px'; flashEl.style.top = Math.round(Math.max(8, ft)) + 'px';
        flashEl.style.right = flashEl.style.bottom = 'auto';
        if (CT.trk) fitTracker();
        if (CT.onb) placeOnb();
        if (CT.hint) placeHint();
        apply();
      }
      function onResize() { layout(); }
      addEventListener('resize', onResize);
      addEventListener('orientationchange', onResize);

      // The director may call update(dt) each frame (then it alone drives the HUD); until it does, the HUD drives itself
      // on the page's frames, so nothing here waits on a call that is not made.
      var EXT = false, raf = 0, lastTs = 0, seekT = 0;
      function selfTick(ts) { raf = requestAnimationFrame(selfTick); var d = lastTs ? (ts - lastTs) / 1000 : 0; lastTs = ts; step(d); }
      if (o.selfDrive !== false && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(selfTick);
      function update(dt) {
        if (!EXT) { EXT = true; if (raf) cancelAnimationFrame(raf); raf = 0; }
        step(dt);
      }
      function step(dt) {
        dt = +dt; if (!(dt > 0)) dt = 0; if (dt > 0.1) dt = 0.1;
        // (twice a second: find the director's KICK if it is new, and follow it if it moved)
        if ((seekT -= dt) <= 0) {
          seekT = 0.5;
          if (!(kbtn && kbtn.isConnected)) layout();
          else if (touchUi) { var kr = kbtn.getBoundingClientRect(), kk = Math.round(kr.left) + ',' + Math.round(kr.top); if (kk !== GA.kk) { GA.kk = kk; layout(); } }
        }
        if (allow.stick) apply();   // (the thumb lands on the stick: its own ring shows, ours goes)
        if (RT.lockT < 1) {
          RT.lockT += dt;
          var u = RT.lockT / 0.45;
          if (u < 1) { rLK.setAttribute('r', (10 + 16 * ease(u)).toFixed(2)); rLK.style.strokeOpacity = (0.9 * (1 - u)).toFixed(3); }
          else rLK.style.display = 'none';
        }
        if (CT.flash && (FL.t += dt) > 1.4) { CT.flash = false; apply(); }
        stepHalo(dt);
        stepGauge(dt);
        if (P === 'set' && RG.p == null && !RM) {
          idleT += dt;
          if (idleT > IDLE && (idleBeat -= dt) <= 0) { idleBeat = 1.6; RG.halo = { t: 0, gold: true }; }
        }
        if (WP.t < 0.4) {
          WP.t += dt;
          var w = WP.t / 0.34;
          if (w < 1) { wipe.style.display = ''; wipe.style.transform = 'translateX(' + fx1(-0.3 * W + w * 1.4 * W) + 'px) skewX(-14deg)'; wipe.style.opacity = (1 - w * w).toFixed(3); }
          else wipe.style.display = 'none';
        }
        if (CT.lb) { dotT += dt; var dot = tag.firstChild; if (dot) dot.style.opacity = (0.75 + 0.25 * Math.cos(dotT * 4)).toFixed(2); }
        for (var k in FD) stepFader(FD[k], dt);
        if (PERF) {
          if (dt > 0) { PF.dts[PF.i] = dt; PF.i = (PF.i + 1) % PF.dts.length; PF.n = Math.min(PF.n + 1, PF.dts.length); }
          if ((PF.t -= dt) <= 0) { PF.t = 0.25; drawPerf(); }
        }
      }

      function state() {
        var shown = {};
        for (var k in FD) shown[k] = FD[k].a > 0;
        return {
          phase: P, touch: touchUi, shown: shown,
          reticle: { at: [fx1(RT.m[0]), fx1(RT.m[1])], centre: [fx1(RT.c[0]), fx1(RT.c[1])], k: +RT.k.toFixed(3), half: fx1(RT.half), locked: RT.locked, loop: !!RT.path,
            inFrame: RT.inFrame, tone: RT.tone || 'gold', offscreen: RT.off, chevron: RT.chev },
          ring: { p: RG.p, win: RG.w, mark: RG.mark, ticks: RG.ticks.length, hot: RG.hot, grade: RG.grade, host: touchUi ? 'button' : 'disc', hold: RG.hold, holdGlow: RG.hold ? +KS.warn.toFixed(2) : null,
            approach: gAP.style.display === 'none' ? null : { r: +gAP.getAttribute('r'), u: APK === 'off' ? null : +APK } },
          heat: CT.gauge ? { H: +HT.H.toFixed(3), band: HT.band, deg: HT.deg, locked: HT.locked, lockDeg: HT.lockH != null ? Math.floor(HT.lockH * 100 + 1e-9) : null, haze: GA.hz > 0, fire: !!GA.fire } : null,
          kick: { label: KS.label, tone: KS.tone, caption: q(kdFace, 'small').textContent, warn: +KS.warn.toFixed(2) },
          result: CT.res ? { kmh: RS.kmh, band: RS.band } : null,
          onboard: CT.onb ? OB.text : null,
          tracker: { fit: +TRK.fit.toFixed(3) }, perf: PERF,
        };
      }
      function dispose() {
        removeEventListener('resize', onResize); removeEventListener('orientationchange', onResize);
        if (raf) cancelAnimationFrame(raf); raf = 0; EXT = true;
        undecorate();
        if (gm.classList) gm.classList.remove('so-scene');
        if (box.parentNode) box.parentNode.removeChild(box);
        if (css.parentNode) css.parentNode.removeChild(css);
      }

      layout();
      return {
        el: box, phase: phase, tracker: tracker, reticle: reticle, ring: ring, flash: flash, result: result,
        replay: replay, skip: skip, hint: setHint, retry: retry, perf: perf, kick: kick, caption: caption,
        heat: heat, kickState: kickState, onboard: onboard,
        update: update, layout: layout, state: state, dispose: dispose,
      };
    }
