    /* ============================================================ Grand Prix: the HUD (ARTIFICIAL1 M2, lane E) == */
    // gp-hud.js. Pasted into boot() by gp.js at /*@include gp-hud.js*/. ONE top-level binding, GpHud; every other name
    // lives inside it, so nothing of v1's boot() is shadowed. The HUD moved here from gp-race.js (M1, lane R) in M2 and
    // was rebuilt as EXPERIENCE.md X19 asks (a broadcast, not a cockpit of widgets): lane E owns it with gp.js and
    // gp-intro.js.
    //
    // VIEW: the page is reached only through env (the root element's document and that document's window).
    //   GpHud.hud(env) -> hud         the glass HUD (position, lap box, tower, gap readout, speed box, race control,
    //                                 intent chips, the radio, the start's HOLD, the reaction), the screens (results,
    //                                 pause, seat; the start card when there is no intro) and the touch buttons
    //   GpHud.radio(o) -> scheduler   the radio's scheduler alone (X25): pure, deterministic, for the Node tests
    //   GpHud.PIT                     the PIT engineer's default lines (the world's gp.radio.pit replaces any of them)
    //   GpHud.intent(row)             a car's plan as the chips read it, from row.intent and nothing else (X30)
    //
    // Every number on screen is a fact of the race's state or its events (EXPERIENCE 1.5). At most 3 transient texts at
    // once on a desktop and 2 on a phone (1.8): race control first, then the intent chips, the radio, the sector flash and
    // the captions. Colour is never the only signal: a word or a sign comes with it. The fastest is gold, never purple.
    var GpHud = (function () {
      var PI = Math.PI, abs = Math.abs, min = Math.min, max = Math.max, floor = Math.floor, round = Math.round;
      var MODES = ['chase', 'tcam', 'cockpit'];
      var K = { strikes: 3, penalty: 5 };
      function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
      function str(s, d) { return typeof s === 'string' && s.trim() ? s.trim() : d; }
      function hexOr(c, d) { return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c.toUpperCase() : d; }
      function wrapL(L, d) { d = d % L; return d < 0 ? d + L : d; }
      function inSpan(L, d, a, b) { return wrapL(L, d - a) <= wrapL(L, b - a); }
      function pageOf(env) {
        var doc = env.doc || (env.root && env.root.ownerDocument) || null;
        return { doc: doc, win: env.win || (doc && doc.defaultView) || null };
      }
      function nth(n) { var s = ['TH', 'ST', 'ND', 'RD'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
      function clock(s, dp) {
        if (s == null || !isFinite(s)) return '-:--';
        s = max(0, s); dp = dp == null ? 3 : dp;
        var m = floor(s / 60), r = s - m * 60, rs = r.toFixed(dp);
        if (+rs >= 60) { m++; rs = (0).toFixed(dp); }
        return m + ':' + (+rs < 10 ? '0' : '') + rs;
      }
      var MINUS = '−';
      function signed(x, dp) { return (x < 0 ? MINUS : '+') + abs(x).toFixed(dp == null ? 2 : dp); }

      /* ================================================================ the agents' minds, as the chips read them == */
      // (X30) a car's plan from its row.intent and nothing else: the AI's state, so a chip cannot lie. A string ('attack')
      // or { state, side, corner, target } (EXPERIENCE 8's intent). RACE and nothing are no chip.
      var INTENT = { ATTACK: { c: '#FF5A36', w: 'ATTACK', s: 'ATK' }, DEFEND: { c: '#9DB7D5', w: 'DEFEND', s: 'DEF' }, TOW: { c: '#F4F6FA', w: 'TOW', s: 'TOW' },
        PUSH: { c: '#F4F6FA', w: 'PUSH', s: 'PSH' }, SAVE: { c: '#9AA0A6', w: 'SAVE', s: 'SAV' }, LEARN: { c: '#E9B949', w: 'LEARN', s: 'LRN' } };
      function intent(row) {
        var I = row ? row.intent : null;
        if (!I) return null;
        var o = typeof I === 'string' ? { state: I } : typeof I === 'object' ? I : null;
        if (!o) return null;
        var st = String(o.state || '').toUpperCase(); if (!INTENT[st]) return null;
        var side = o.side ? String(o.side).toUpperCase() : '', corner = o.corner == null || o.corner === '' ? '' : typeof o.corner === 'number' ? 'T' + o.corner : String(o.corner).toUpperCase();
        return { state: st, side: side === 'L' ? 'LEFT' : side === 'R' ? 'RIGHT' : side, corner: corner, target: o.target == null ? -1 : o.target, look: INTENT[st] };
      }
      function intentText(tla, I, short) {
        if (!I) return '';
        var t = (tla ? tla + (short ? ' ' : ' · ') : '') + I.look.w;
        if (I.side) t += ' ▸ ' + I.side;
        if (I.corner) t += (short ? ' ' : ' · ') + I.corner;
        return t;
      }

      /* ===================================================================================== the radio (X25) == */
      // the PIT engineer's lines: the tutorial on the first race of a session (each device's own words), then strategy.
      // {name}, {tla}, {side}, {gap} are filled from the race; the world's gp.radio.pit replaces any of them
      var PIT = {
        rev: { touch: 'Hold to rev. Let go when the lights go out.', keys: 'Hold S to rev. Let go when the lights go out.', pad: 'Hold LT to rev. Let go when the lights go out.' },
        steer: { touch: 'Left thumb steers. Brake when the board lights.', keys: 'A and D steer. Brake when the board lights.', pad: 'Left stick steers. Brake when the board lights.' },
        attack: '{name}\'s attacking. Cover the {side}.',
        flap: 'Flap\'s live. Be within a second at the gantry.',
        nemesis: '{name} is your fight. {gap} {where}.',
        final: 'Final lap. Everything now.',
        gap: 'P{place}. {tla} {gap} ahead.',
        early: 'Too early. Hold it again.',
      };
      // the scheduler (pure: no page, no clock but the t it is given; the same calls give the same lines):
      //   one line at a time, shown SHOW s; a line starts at least GAP s after the last one started; at most 6 a lap on
      //   a desktop and 4 on a phone; never during the lights, in the first 4 s after the launch, within 1.5 s of a
      //   braking point, over 2 g sideways, or in the tunnel; the queue in priority order (you 0, the house 1, the
      //   nemesis 2, the leader 3, the rest 4; then the oldest); a line older than 8 s is dropped; no line twice
      var RAD = { SHOW: 2.5, GAP: 4.0, STALE: 8.0, LAPMAX: 6, LAPMAX_PHONE: 4, LAUNCH: 4.0, LATG: 2.0 };
      function radio(o) {
        o = o || {};
        var Q = [], cur = null, lastStart = -1e9, said = {}, perLap = {}, agentLap = {}, log = [], dropped = 0, refused = 0;
        function offer(line) {
          if (!line || !line.text) return false;
          var key = line.key || (line.who + '|' + line.text);
          if (said[key] || Q.some(function (q) { return q.key === key; })) return false;
          Q.push({ who: str(line.who, 'PIT'), text: String(line.text), prio: line.prio == null ? 4 : line.prio, t: +line.t || 0, key: key, agent: !!line.agent, car: line.car == null ? -1 : line.car });
          return true;
        }
        // ctx = { t, phase, lap, sinceLaunch (s, or < 0 before it), brakeNear, latG, tunnel, phone, room (a transient slot free) }
        function why(ctx) {
          if (ctx.phase === 'lights') return 'lights';
          if (ctx.sinceLaunch != null && ctx.sinceLaunch >= 0 && ctx.sinceLaunch < RAD.LAUNCH) return 'launch';
          if (ctx.brakeNear) return 'braking';
          if (abs(ctx.latG || 0) > RAD.LATG) return 'g';
          if (ctx.tunnel) return 'tunnel';
          return '';
        }
        function tick(ctx) {
          var t = +ctx.t || 0;
          if (cur && t >= cur.until - 1e-9) cur = null;
          // (stale lines go)
          for (var i = Q.length - 1; i >= 0; i--) if (t - Q[i].t > RAD.STALE + 1e-9) { Q.splice(i, 1); dropped++; }
          if (cur || !Q.length) return cur;
          if (t - lastStart < RAD.GAP - 1e-9) return null;
          var no = why(ctx); if (no) { refused++; return null; }
          if (ctx.room === false) return null;
          var lap = ctx.lap | 0, cap = ctx.phone ? RAD.LAPMAX_PHONE : RAD.LAPMAX;
          if ((perLap[lap] || 0) >= cap) return null;
          // (the best line: the lowest priority number, then the oldest; with one slot left this lap and no agent line
          // yet, an agent line first)
          var needAgent = !agentLap[lap] && (perLap[lap] || 0) >= cap - 1;
          var best = -1;
          for (var j = 0; j < Q.length; j++) {
            var q = Q[j]; if (needAgent && !q.agent) continue;
            if (best < 0 || q.prio < Q[best].prio || (q.prio === Q[best].prio && q.t < Q[best].t)) best = j;
          }
          if (best < 0) return null;
          var L = Q.splice(best, 1)[0];
          cur = { who: L.who, text: L.text, prio: L.prio, start: t, until: t + RAD.SHOW, agent: L.agent, car: L.car, key: L.key, lap: lap };
          said[L.key] = true; lastStart = t; perLap[lap] = (perLap[lap] || 0) + 1; if (L.agent) agentLap[lap] = true;
          log.push({ t: +t.toFixed(3), who: L.who, text: L.text, prio: L.prio, lap: lap, agent: L.agent });
          return cur;
        }
        return {
          offer: offer, tick: tick, why: why,
          current: function () { return cur; },
          state: function () { return { queued: Q.length, current: cur ? cur.who + ': ' + cur.text : null, log: log.slice(), dropped: dropped, refused: refused, perLap: JSON.parse(JSON.stringify(perLap)) }; },
          reset: function () { Q.length = 0; cur = null; lastStart = -1e9; said = {}; perLap = {}; agentLap = {}; log = []; dropped = 0; refused = 0; },
        };
      }

      /* ======================================================================================== the HUD == */
      // GpHud.hud(env): GameMog's glass (v1's GLASS) in a race's grammar. The DOM is written only when a value changes.
      //   hud.update(dt, state, extra)   extra = { cam, assists, aids, gearbox, kmh, demo, rev, device, hold: { armed, phase },
      //                                  brake: { mine, total }, first (the first race of a session), tunnel, brakeNear,
      //                                  latG, launchAt, intro (the HUD stays down), ceremony }
      //   hud.event(e)                   a race event (launch with rank, pass/overtake, lap, finalLap, limits, penalty,
      //                                  giveBack, sector, flap, finish, end, nemesis, intent, memory, jump)
      //   hud.build(instant)             X05: the HUD builds itself round the car (tower rows at a 20 ms stagger, then
      //                                  position and lap, then the speed box, then the touch kit)
      //   hud.screen(name, data)         'results' | 'pause' | 'seat' | 'start' | null -> { el, go(), pick(d), get(), key(code) }
      //   hud.lights(n), hud.touch(o), hud.show(on), hud.caption(lines, secs), hud.reaction(r, rank, of), hud.radioPool(o)
      //   hud.state() -> { show, screen, lights, tower, transient: { now, max, list }, radio, hold, ... }
      function hud(env) {
        var root = env.root, el = env.el, tpad = env.tpad, tbtn = env.tbtn, T = env.T, cfg = env.cfg || {}, PG = pageOf(env), doc = PG.doc, win = PG.win;
        var theme = env.theme || {}, ACC = hexOr(theme.accent, '#DD6135'), FONT = str(theme.font, 'Oxanium');
        var GOLD = '#E9B949', MINT = '#59F2C8', RED = '#FF453A', AMBER = '#FFB020', COPPER = '#C8743A', VERM = '#E5402A';
        function rgba(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
        function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
        function mk(tag, cls, html, parent) {
          if (typeof el === 'function' && !parent) return el(tag, cls, html);
          var e = doc.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; (parent || root).appendChild(e); return e;
        }
        var GLASS = 'background:linear-gradient(150deg,rgba(255,255,255,.15),rgba(255,255,255,.03) 62%) rgba(10,12,18,.34);' +
          '-webkit-backdrop-filter:blur(16px) saturate(170%);backdrop-filter:blur(16px) saturate(170%);' +
          'border:1px solid rgba(255,255,255,.2);box-shadow:inset 0 1px 0 rgba(255,255,255,.24),0 12px 32px rgba(0,0,0,.2)';
        var TOP = 'calc(14px + env(safe-area-inset-top,0px))', FONTS = FONT + ',system-ui,sans-serif';
        var SB = 'env(safe-area-inset-bottom,0px)', SL = 'env(safe-area-inset-left,0px)', SR = 'env(safe-area-inset-right,0px)';
        var css = doc.createElement('style');
        css.textContent = [
          '#gm .gph{position:absolute;inset:0;pointer-events:none;font-family:' + FONTS + '}',
          '#gm.demo .gph,#gm .gph.off{display:none!important}',
          // (the ceremony's TV shots: the captions and the skip hint only)
          '#gm .gph.tv>*:not(.gpcp):not(.gpnx){display:none!important}',
          // the top-left row: position and the lap box; race control under them
          '#gm .gptl{position:absolute;left:calc(14px + ' + SL + ');top:' + TOP + ';display:flex;gap:10px;align-items:flex-start}',
          '#gm .gptl .board{position:relative;top:auto;left:auto;right:auto}',
          '#gm .gpp b{font-size:34px;font-weight:600}#gm .gpp b i{font-style:normal;font-size:.5em;opacity:.6;margin-left:3px;font-weight:400}',
          '#gm .gpp.pulse{border-color:' + GOLD + ';box-shadow:0 0 0 1px ' + GOLD + ',0 0 26px ' + rgba(GOLD, 0.65) + ',inset 0 1px 0 rgba(255,255,255,.24)}#gm .gpp.pulse b{color:#FFF0C8}',
          '#gm .gpp.slam,#gm .gpl.slam{animation:gpslam .45s cubic-bezier(.2,1.6,.4,1)}',
          '@keyframes gpslam{0%{transform:scale(1.28)}100%{transform:scale(1)}}',
          '#gm .gpl{min-width:118px}#gm .gpl b{font-size:30px;font-weight:600;white-space:nowrap}#gm .gpl b i{font-style:normal;font-size:.55em;opacity:.6;margin-left:2px}',
          '#gm .gpl .dots{display:flex;gap:4px;margin-top:5px}#gm .gpl .dots i{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.13);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}',
          '#gm .gpl .dots i.on{background:#FF2D1E;box-shadow:0 0 8px rgba(255,45,30,.9)}#gm .gpl .dots.gone{display:none}',
          '#gm .gpl.final{border-color:' + GOLD + ';box-shadow:0 0 0 1px ' + GOLD + ',0 0 22px ' + rgba(GOLD, 0.5) + ',inset 0 1px 0 rgba(255,255,255,.24)}#gm .gpl.final b{color:#FFF0C8;font-size:24px;letter-spacing:.06em}',
          '#gm .gpl.flash b{font-size:26px}#gm .gpl.flash.fast b{color:' + GOLD + '}#gm .gpl.flash.del b{color:#FFB4AE;text-decoration:line-through;text-decoration-color:' + RED + '}',
          '#gm .gpl.fin b{font-size:22px;letter-spacing:.04em}',
          '#gm .gpln{position:absolute;left:calc(14px + ' + SL + ');top:calc(84px + env(safe-area-inset-top,0px));font-size:13px;font-weight:600;letter-spacing:.08em;white-space:nowrap;text-shadow:0 1px 8px rgba(0,0,0,.8);display:none}',
          '#gm .gpln.on{display:block}',
          // race control: an amber chip under the lap box (a word always, never the colour alone)
          '#gm .gprc{position:absolute;left:calc(14px + ' + SL + ');top:calc(84px + env(safe-area-inset-top,0px));padding:5px 12px 6px;border-radius:9px;background:' + rgba(AMBER, 0.2) + ';border:1px solid ' + rgba(AMBER, 0.85) + ';color:#FFE7B8;font-size:12.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);display:none}',
          '#gm .gprc.on{display:block}#gm .gprc.red{background:' + rgba(RED, 0.24) + ';border-color:' + rgba(RED, 0.9) + ';color:#FFE1DE}#gm .gprc.flag{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.8);color:#fff}',
          // the timing tower: position, the team bar, the code, the interval, the plan; yours lit; the house's bar in vermilion
          '#gm .gptw{position:absolute;left:calc(14px + ' + SL + ');top:calc(124px + env(safe-area-inset-top,0px));' + GLASS + ';border-radius:14px;padding:6px;width:176px;box-sizing:border-box}',
          '#gm .gptw .h{font-size:9px;font-weight:600;letter-spacing:.26em;text-transform:uppercase;opacity:.6;padding:1px 6px 4px;display:flex;justify-content:space-between}',
          '#gm .gptw .rows{position:relative}',
          '#gm .gptw .row{position:absolute;left:0;right:0;top:0;display:grid;grid-template-columns:18px 4px 34px 1fr 26px;align-items:center;column-gap:5px;height:19px;padding:0 5px;border-radius:7px;font-size:12.5px;font-variant-numeric:tabular-nums;transition:transform .32s cubic-bezier(.3,.9,.3,1),background .2s}',
          '#gm .gptw .row b{font-weight:600;text-align:right;opacity:.85}#gm .gptw .row u{display:block;height:13px;border-radius:2px;text-decoration:none}',
          '#gm .gptw .row span{font-weight:600;letter-spacing:.04em}#gm .gptw .row em{font-style:normal;text-align:right;opacity:.82;font-size:11.5px;white-space:nowrap}',
          '#gm .gptw .row em.sf{opacity:1;font-weight:700}#gm .gptw .row em.sf.up{color:' + MINT + '}#gm .gptw .row em.sf.dn{color:' + AMBER + '}#gm .gptw .row em.sf.gold{color:' + GOLD + '}',
          '#gm .gptw .row i{font-style:normal;font-size:8.5px;font-weight:700;letter-spacing:.06em;text-align:center;border-radius:4px;padding:1px 0;opacity:.95}',
          '#gm .gptw .row i.fast{color:' + GOLD + '}#gm .gptw .row i.pen{color:' + RED + '}',
          '#gm .gptw .row.me{background:' + rgba(ACC, 0.34) + ';box-shadow:inset 0 0 0 1px ' + rgba(ACC, 0.8) + '}',
          '#gm .gptw .row.out{opacity:.5}#gm .gptw .sep{position:absolute;left:6px;right:6px;height:1px;background:rgba(255,255,255,.18)}',
          '#gm .gptw .row.hid,#gm .gptw .sep.hid{display:none}',
          // the gap readout: the car ahead, closing or opening, the car behind (one line; a phone adds the plan)
          '#gm .gpgap{position:absolute;right:calc(14px + ' + SR + ');top:' + TOP + ';' + GLASS + ';border-radius:14px;padding:7px 13px 8px;font-size:15px;font-weight:600;letter-spacing:.04em;white-space:nowrap;font-variant-numeric:tabular-nums;text-align:right}',
          '#gm .gpgap small{display:block;font-size:9.5px;font-weight:600;letter-spacing:.24em;opacity:.6;text-transform:uppercase;margin-bottom:2px}',
          '#gm .gpgap .up{color:' + MINT + '}#gm .gpgap .dn{color:' + AMBER + '}#gm .gpgap .sep{opacity:.45;margin:0 6px}',
          '#gm .gpgap .pl{display:none;margin-top:3px;font-size:12px;letter-spacing:.06em}#gm .gpgap .pl.on{display:block}',
          // the speed box: the rev lights, the gear, the speed; the Flap, the aids, the box; the brake bar (white yours,
          // amber what the aids added)
          '#gm .gpd{position:absolute;left:50%;bottom:calc(16px + ' + SB + ');transform:translateX(-50%);' + GLASS + ';border-radius:18px;padding:8px 16px 9px;display:grid;grid-template-columns:auto auto auto;align-items:end;column-gap:14px;min-width:240px}',
          '#gm .gpd::before{content:"";position:absolute;left:50%;margin-left:-11px;top:-1px;width:22px;height:2px;border-radius:2px;background:' + ACC + ';box-shadow:0 0 10px ' + rgba(ACC, 0.9) + '}',
          '#gm .gpd .leds{grid-column:1/4;display:grid;grid-template-columns:repeat(15,1fr);gap:3px;margin-bottom:5px}',
          '#gm .gpd .leds i{height:5px;border-radius:3px;background:rgba(255,255,255,.12)}',
          '#gm .gpd .leds i.g{background:' + MINT + ';box-shadow:0 0 8px ' + rgba(MINT, 0.8) + '}#gm .gpd .leds i.a{background:' + AMBER + ';box-shadow:0 0 8px rgba(255,176,32,.8)}#gm .gpd .leds i.r{background:' + RED + ';box-shadow:0 0 8px rgba(255,69,58,.85)}',
          '#gm .gpd.lim .leds i{background:#fff;box-shadow:0 0 10px #fff}',
          '#gm .gpd .brk{grid-column:1/4;position:relative;height:3px;border-radius:2px;background:rgba(255,255,255,.08);margin-bottom:7px;overflow:hidden}',
          '#gm .gpd .brk i,#gm .gpd .brk b{position:absolute;top:0;bottom:0;left:0;width:0}#gm .gpd .brk i{background:#F4F6FA}#gm .gpd .brk b{background:' + AMBER + '}',
          '#gm .gpd .gear{font-size:46px;line-height:.9;font-weight:600;min-width:1ch;text-align:center}',
          '#gm .gpd .spd b{display:block;font-size:40px;line-height:.9;font-weight:500;min-width:3ch;text-align:right}#gm .gpd .spd small{display:block;font-size:9.5px;letter-spacing:.26em;opacity:.64;text-align:right;margin-top:3px}',
          '#gm .gpd .side{display:flex;flex-direction:column;gap:4px;align-items:flex-start;padding-bottom:2px}',
          '#gm .gpd .side em{font-style:normal;font-size:9.5px;font-weight:700;letter-spacing:.18em;padding:2px 7px;border-radius:6px;border:1px solid rgba(255,255,255,.22);opacity:.5;white-space:nowrap}',
          '#gm .gpd .side em.fl.armed{opacity:1;border-color:' + MINT + ';color:' + MINT + ';box-shadow:0 0 12px ' + rgba(MINT, 0.45) + '}',
          '#gm .gpd .side em.fl.open{opacity:1;background:' + MINT + ';color:#06231B;border-color:' + MINT + '}#gm .gpd .side em.fl.zone{opacity:.8}',
          '#gm .gpd .side em.fl.set{opacity:1;border-color:' + MINT + ';color:' + MINT + ';background:' + rgba(MINT, 0.14) + '}',
          '#gm .gpd .side em.fl.go{opacity:1;border-color:' + MINT + ';color:#06231B;background:' + rgba(MINT, 0.85) + ';animation:gpflp .5s ease-in-out infinite alternate}',
          '#gm .gpd .side em.fl.last{opacity:1;border-color:' + GOLD + ';color:' + GOLD + '}',
          '@keyframes gpflp{from{box-shadow:0 0 4px ' + rgba(MINT, 0.4) + '}to{box-shadow:0 0 18px ' + rgba(MINT, 0.95) + '}}',
          '@media (prefers-reduced-motion:reduce){#gm .gpd .side em.fl.go,#gm .tpad button.gpfl.go{animation:none}#gm .gpp.slam,#gm .gpl.slam{animation:none}#gm .gptw .row{transition:none}}',
          '#gm .gpd .side em.bx{opacity:.7}#gm .gpd .side em.as{opacity:1;background:' + rgba(ACC, 0.28) + ';border-color:' + rgba(ACC, 0.85) + '}#gm .gpd .side em.as.pro{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.7)}',
          // the five red lights: five pods of two lamps over the middle of the screen
          '#gm .gplt{position:absolute;left:50%;top:calc(96px + env(safe-area-inset-top,0px));transform:translateX(-50%);display:flex;gap:12px;padding:10px 14px;border-radius:16px;' + GLASS + ';background-color:rgba(4,5,8,.62);opacity:0;transition:opacity .25s}',
          '#gm .gplt.on{opacity:1}',
          '#gm .gplt .pod{display:flex;flex-direction:column;gap:7px;padding:7px;border-radius:10px;background:#07080B;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}',
          '#gm .gplt .pod i{width:30px;height:30px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#3A1414,#160707 70%);box-shadow:inset 0 -3px 6px rgba(0,0,0,.6)}',
          '#gm .gplt .pod.lit i{background:radial-gradient(circle at 40% 35%,#FFD7CF,#FF2D1E 34%,#B40C05 72%);box-shadow:0 0 18px rgba(255,45,30,.95),0 0 44px rgba(255,45,30,.55)}',
          // the start's chip (keys and pads): HOLD, then WAIT with the five, EARLY; and the reaction, ranked
          '#gm .gphd{position:absolute;left:50%;top:calc(196px + env(safe-area-inset-top,0px));transform:translateX(-50%);' + GLASS + ';border-radius:999px;padding:7px 16px 8px;font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;white-space:nowrap;display:none;border-color:' + rgba(COPPER, 0.9) + '}',
          '#gm .gphd.on{display:block}#gm .gphd.armed{box-shadow:0 0 0 1px ' + COPPER + ',0 0 22px ' + rgba(COPPER, 0.6) + ',inset 0 1px 0 rgba(255,255,255,.24);background-color:' + rgba(COPPER, 0.22) + '}',
          '#gm .gphd.early{border-color:' + AMBER + ';background-color:' + rgba(AMBER, 0.25) + '}#gm .gphd small{opacity:.75;font-weight:600;letter-spacing:.08em;text-transform:none;margin-left:6px}',
          '#gm .gphd .seg{display:inline-flex;gap:3px;margin-left:8px;vertical-align:1px}#gm .gphd .seg i{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.18)}#gm .gphd .seg i.on{background:#FF2D1E;box-shadow:0 0 6px rgba(255,45,30,.9)}',
          '#gm .gprx{position:absolute;left:50%;top:calc(196px + env(safe-area-inset-top,0px));transform:translateX(-50%);' + GLASS + ';border-radius:12px;padding:7px 16px 8px;font-size:15px;font-weight:700;letter-spacing:.14em;white-space:nowrap;display:none}',
          '#gm .gprx.on{display:block}#gm .gprx.gold{border-color:' + GOLD + ';color:#FFF0C8;box-shadow:0 0 0 1px ' + GOLD + ',0 0 22px ' + rgba(GOLD, 0.5) + '}',
          // the radio: one line, bottom centre over the speed box (a phone: top centre)
          '#gm .gprd{position:absolute;left:50%;bottom:calc(132px + ' + SB + ');transform:translateX(-50%);' + GLASS + ';border-radius:12px;padding:6px 14px 7px;font-size:15px;font-weight:600;letter-spacing:.02em;max-width:min(48ch,92vw);text-align:center;display:none}',
          '#gm .gprd.on{display:block}#gm .gprd b{font-weight:700;letter-spacing:.12em;margin-right:7px;color:' + GOLD + '}#gm .gprd.ag b{color:#fff}',
          // the agents' minds: the chip under the car ahead (projected), the chip at the edge for the car behind
          '#gm .gpia,#gm .gpib{position:absolute;left:0;top:0;padding:4px 10px 5px;border-radius:8px;font-size:12px;font-weight:700;letter-spacing:.12em;white-space:nowrap;background:rgba(8,10,14,.62);border:1px solid rgba(255,255,255,.5);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);display:none}',
          '#gm .gpia.on,#gm .gpib.on{display:block}',
          '#gm .gpib{top:auto;bottom:calc(132px + ' + SB + ')}',
          // proximity: a soft glow at the screen's edge on the side a car is alongside
          '#gm .gppx{position:absolute;top:22%;bottom:22%;width:14px;opacity:0;transition:opacity .15s;pointer-events:none}',
          '#gm .gppx.l{left:0;background:linear-gradient(90deg,rgba(255,255,255,.55),transparent)}#gm .gppx.r{right:0;background:linear-gradient(270deg,rgba(255,255,255,.55),transparent)}#gm .gppx.on{opacity:1}',
          // captions (THE MOMENT's facts, the podium's names): a lower-third
          '#gm .gpcp{position:absolute;left:calc(22px + ' + SL + ');bottom:calc(30px + ' + SB + ');' + GLASS + ';border-radius:16px;padding:9px 16px 10px;max-width:min(620px,calc(100vw - 44px));display:none}',
          '#gm .gpcp.on{display:block}#gm .gpcp b{display:block;font-size:20px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}#gm .gpcp span{display:block;margin-top:3px;font-size:13px;opacity:.86}',
          // after your flag: what a fresh tap or key does
          '#gm .gpnx{position:absolute;left:50%;top:calc(27% + 70px);transform:translateX(-50%);padding:5px 14px 6px;border-radius:999px;' + GLASS + ';font-size:11.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;white-space:nowrap;display:none}',
          '#gm .gpnx.on{display:block}',
          // the build (X05): the tower's rows slide in at 20 ms a row, then position and lap, then the speed box, then the kit
          '#gm .gph.build .gptw .row{animation:gpin .32s cubic-bezier(.2,.9,.3,1) both}',
          '#gm .gph.build .gptl,#gm .gph.build .gpgap{animation:gpup .35s ease-out .45s both}#gm .gph.build .gpd{animation:gpup2 .35s ease-out .75s both}',
          '#gm.gpbuild .tpad,#gm.gpbuild .stick{animation:gpfade .4s ease-out .9s both}',
          '#gm .gph.glass .gpd,#gm .gph.glass .gplt,#gm .gph.glass .gpp{visibility:hidden}',
          '@keyframes gpin{from{opacity:0;translate:-26px 0}to{opacity:1;translate:0 0}}@keyframes gpup{from{opacity:0;translate:0 -10px}to{opacity:1;translate:0 0}}',
          '@keyframes gpup2{from{opacity:0;translate:0 12px}to{opacity:1;translate:0 0}}@keyframes gpfade{from{opacity:0}to{opacity:1}}',
          '@media (prefers-reduced-motion:reduce){#gm .gph.build .gptw .row,#gm .gph.build .gptl,#gm .gph.build .gpgap,#gm .gph.build .gpd,#gm.gpbuild .tpad,#gm.gpbuild .stick{animation-duration:.01s}}',
          // the results: nothing of the race's controls behind the bar
          '#gm.gpres .tpad,#gm.gpres .stick{display:none!important}',
          // touch: the stick left, round glass buttons right (v1's kit); BRAKE reads HOLD on the grid with a copper ring
          // that becomes five segments lit with the gantry, WAIT through the lights
          '#gm .tpad button.gpsm{width:58px;height:58px;font-size:12px}',
          '#gm .tpad button.gpfl{opacity:.42}#gm .tpad button.gpfl.armed{opacity:1;border-color:' + MINT + ';box-shadow:0 0 18px ' + rgba(MINT, 0.55) + ',inset 0 1px 0 rgba(255,255,255,.24)}',
          '#gm .tpad button.gpfl.open{opacity:1;background-color:' + rgba(MINT, 0.5) + '}#gm .tpad button.gpfl.go{opacity:1;border-color:' + MINT + ';background-color:' + rgba(MINT, 0.3) + ';animation:gpflp .5s ease-in-out infinite alternate}',
          '#gm .tpad button.gphold{position:relative;border-color:' + COPPER + ';box-shadow:0 0 0 2px ' + rgba(COPPER, 0.7) + ',0 0 18px ' + rgba(COPPER, 0.45) + '}',
          '#gm .tpad button.gphold.on{background-color:' + rgba(COPPER, 0.42) + '}',
          '#gm .tpad button.gphold::after{content:"";position:absolute;inset:-7px;border-radius:50%;background:conic-gradient(var(--gpseg,transparent));-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 4px),#000 calc(100% - 4px));mask:radial-gradient(farthest-side,transparent calc(100% - 4px),#000 calc(100% - 4px));pointer-events:none}',
          '#gm .tpad button.gphold.early{border-color:' + AMBER + '}',
          // the screens: the results as a bar, the sheets (pause, seat), the start card (no intro)
          '#gm .screen.gps{align-items:flex-end;padding-bottom:calc(14px + ' + SB + ');background:linear-gradient(0deg,rgba(6,8,14,.55),transparent 55%)}',
          '#gm .screen.gps .card{max-width:min(980px,96vw);padding:14px 18px 16px;border-radius:22px;text-align:left}',
          '#gm .screen.gps .card h1{font-size:30px;margin:0}#gm .screen.gps .card p{margin:3px 0 0;font-size:14px}',
          '#gm .gpwho{margin:12px 0 8px;font-size:11px;font-weight:600;letter-spacing:.24em;text-transform:uppercase;opacity:.9}#gm .gpwho b{color:' + ACC + ';letter-spacing:.12em;margin-left:4px}#gm .gpwho span{opacity:.6;letter-spacing:.12em;margin-left:6px}',
          '#gm .gppick{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:5px}',
          '#gm .gppick .tm{display:flex;flex-direction:column;gap:4px;min-width:0}',
          '#gm .gppick .tm small{display:block;font-size:8.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.75;padding-left:2px;border-top:3px solid;padding-top:3px}',
          '#gm .gppick button{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:baseline;justify-content:space-between;gap:4px;padding:4px 7px 5px;border-radius:9px;background:rgba(255,255,255,.06);border:1.5px solid rgba(255,255,255,.12);font:600 12.5px ' + FONTS + ';letter-spacing:.04em}',
          '#gm .gppick button i{font-style:normal;font-size:10px;opacity:.6}#gm .gppick button.on{background:rgba(255,255,255,.16);border-color:' + ACC + '}',
          '#gm .gpopt{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:12px;align-items:center}',
          '#gm .gpseg{display:inline-flex;align-items:center;gap:6px}#gm .gpseg small{font-size:9.5px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;opacity:.65;margin-right:2px}',
          '#gm .gpseg button{all:unset;cursor:pointer;padding:5px 11px 6px;border-radius:999px;font:600 11.5px ' + FONTS + ';letter-spacing:.1em;text-transform:uppercase;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.16)}',
          '#gm .gpseg button.on{background:' + rgba(ACC, 0.32) + ';border-color:' + rgba(ACC, 0.95) + '}',
          '#gm .gpvol{display:inline-flex;align-items:center;gap:6px;font-size:9.5px;font-weight:600;letter-spacing:.2em;text-transform:uppercase}#gm .gpvol span{opacity:.65}#gm .gpvol input{width:96px;accent-color:' + ACC + '}',
          '#gm .screen.gps .card .rules{margin-top:10px;font-size:12.5px;gap:3px}#gm .screen.gps .card .go{margin-top:12px}',
          '#gm.touch .gpkeys{display:none}@media (pointer:coarse){#gm .gpkeys{display:none}}#gm .gptouch{display:none}#gm.touch .gptouch{display:inline}@media (pointer:coarse){#gm .gptouch{display:inline}}',
          '#gm .screen.gpsh{background:radial-gradient(ellipse at center,rgba(6,8,14,.35),rgba(6,8,14,.7))}',
          '#gm .screen.gpsh .card{max-width:min(720px,94vw);text-align:left;padding:16px 20px 18px;max-height:calc(100% - 24px);overflow:auto;box-sizing:border-box}',
          '#gm .screen.gpsh .card h1{font-size:26px}#gm .gpsh .grp{display:flex;flex-wrap:wrap;gap:9px 18px;margin-top:12px;align-items:center}',
          '#gm .gpsh .acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}#gm .gpsh .acts button,#gm .gpr .acts button{all:unset;cursor:pointer;padding:9px 16px;border-radius:999px;font:600 12px ' + FONTS + ';letter-spacing:.16em;text-transform:uppercase;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.22)}',
          '#gm .gpsh .acts button.go,#gm .gpr .acts button.go{background:' + rgba(GOLD, 0.28) + ';border-color:' + GOLD + ';color:#FFF0C8}#gm .gpr .acts button kbd,#gm .gpsh .acts button kbd{font-size:10px;padding:1px 5px;margin-left:6px}',
          '#gm .screen.gpr .card{display:block;max-width:min(760px,96vw);padding:12px 18px 14px;text-align:left;max-height:calc(100% - 20px);overflow:auto;box-sizing:border-box}',
          '#gm .gpr .hd{display:flex;align-items:baseline;justify-content:space-between;gap:4px 14px;flex-wrap:wrap}#gm .screen.gpr .card h1{font-size:30px}#gm .screen.gpr .card h1 small{font-size:15px;letter-spacing:.12em;opacity:.8;margin-left:8px}',
          '#gm .gpr .facts{margin:4px 0 0;font-size:13.5px;letter-spacing:.06em;opacity:.9}#gm .gpr .facts em{font-style:normal;font-size:10.5px;font-weight:700;letter-spacing:.16em;padding:1px 6px;border-radius:5px;margin-left:6px;border:1px solid rgba(255,255,255,.4)}#gm .gpr .facts em.pb{border-color:' + GOLD + ';color:' + GOLD + '}',
          '#gm .gpr table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px;font-variant-numeric:tabular-nums}',
          '#gm .gpr td{padding:2px 6px;white-space:nowrap}#gm .gpr td.n{width:22px;text-align:right;opacity:.75}#gm .gpr td.c{width:4px;padding:0}#gm .gpr td.c i{display:block;width:4px;height:15px;border-radius:2px}',
          '#gm .gpr td.t{text-align:right}#gm .gpr td.b{text-align:right;opacity:.7}#gm .gpr td.b.fast{color:' + GOLD + ';opacity:1}#gm .gpr td.p{color:#FFB4AE;font-size:11.5px}',
          '#gm .gpr tr.me td{background:' + rgba(ACC, 0.26) + '}#gm .gpr td.tm{opacity:.6;font-size:11.5px}',
          '#gm .gpr .more{all:unset;cursor:pointer;font-size:11px;letter-spacing:.16em;text-transform:uppercase;opacity:.7;margin-top:4px;display:inline-block}',
          '#gm .gpr .note{margin-top:6px;font-size:12px;opacity:.75}',
          // phones: smaller boxes; the tower the top three and you +-2; the radio at the top; the results a big gold button
          '@media (max-width:760px),(max-height:500px){#gm .gpp b{font-size:26px}#gm .gpl{min-width:0}#gm .gpl b{font-size:23px}#gm .gpl.final b,#gm .gpl.fin b{font-size:17px}#gm .gptl .board{padding:5px 11px 6px}' +
            '#gm .gptw{top:calc(98px + env(safe-area-inset-top,0px));width:158px;padding:4px}#gm .gptw .h{display:none}#gm .gptw .row{grid-template-columns:17px 4px 32px 1fr 26px;height:17px;font-size:12px;column-gap:4px;padding:0 4px}' +
            '#gm .gptw .row em{font-size:12px}#gm .gptw .row i{font-size:12px;letter-spacing:0;padding:0}' +
            '#gm .gpp small,#gm .gpgap small{display:none}#gm .gpl small{font-size:12px;letter-spacing:.1em}#gm .gpd .spd small{font-size:12px;letter-spacing:.14em}#gm .gpd .side em{font-size:12px;letter-spacing:.08em;padding:1px 6px}' +
            '#gm .gphd small{font-size:12px}#gm .gpcp span{font-size:12.5px}#gm .gpia,#gm .gpib{font-size:12px}#gm .gpnx{font-size:12px}' +
            '#gm .gpd{min-width:0;padding:6px 12px 7px;column-gap:10px}#gm .gpd .gear{font-size:34px}#gm .gpd .spd b{font-size:28px}' +
            '#gm .gplt{top:calc(70px + env(safe-area-inset-top,0px));gap:7px;padding:7px 9px}#gm .gplt .pod{padding:5px;gap:5px}#gm .gplt .pod i{width:20px;height:20px}' +
            '#gm .gpgap{font-size:13px;padding:6px 11px 7px}#gm .gprc,#gm .gpln{top:calc(70px + env(safe-area-inset-top,0px));font-size:12px}' +
            '#gm .gprd{bottom:auto;top:calc(14px + env(safe-area-inset-top,0px));max-width:min(36ch,62vw);font-size:15px}#gm .gphd,#gm .gprx{top:calc(150px + env(safe-area-inset-top,0px));font-size:12px}' +
            '#gm .gpr table{font-size:12px}#gm .screen.gpr .card h1{font-size:24px}#gm .gpr .acts button.go{flex:1 1 100%;text-align:center;padding:13px 16px;font-size:14px}}',
          '@media (max-width:760px){#gm .gppick{grid-template-columns:repeat(5,minmax(0,1fr))}#gm .screen.gps .card h1{font-size:22px}}',
          // (a phone held sideways: the thumbs own the bottom corners, so the speed box takes the top middle)
          '@media (pointer:coarse) and (max-height:500px){#gm .gpd{top:calc(10px + env(safe-area-inset-top,0px));bottom:auto}#gm .gplt{top:calc(92px + env(safe-area-inset-top,0px))}#gm .gprd{top:calc(96px + env(safe-area-inset-top,0px))}}',
          '@media (max-height:500px){#gm.touch .gpd{top:calc(10px + env(safe-area-inset-top,0px));bottom:auto}#gm.touch .gplt{top:calc(92px + env(safe-area-inset-top,0px))}#gm.touch .gprd{top:calc(96px + env(safe-area-inset-top,0px))}' +
            '#gm .gptw{top:calc(74px + env(safe-area-inset-top,0px))}#gm .gptw .row{height:16px;font-size:12px}#gm .gprc,#gm .gpln{top:calc(74px + env(safe-area-inset-top,0px));left:calc(182px + ' + SL + ')}' +
            '#gm .gphd,#gm .gprx{top:calc(138px + env(safe-area-inset-top,0px))}#gm .gpcp{bottom:calc(14px + ' + SB + ')}}',
          // (a phone held upright: the pause button top right, the gap readout under it; the speed box right of centre,
          // above the buttons, out of the road's middle band and the left thumb's half)
          '@media (max-aspect-ratio:1/1){#gm .gpgap{top:calc(68px + env(safe-area-inset-top,0px))}#gm.touch .pause{top:calc(14px + env(safe-area-inset-top,0px))}}',
          '@media (pointer:coarse) and (max-aspect-ratio:1/1){#gm .pause{top:calc(14px + env(safe-area-inset-top,0px))}}',
          '@media (pointer:coarse) and (max-aspect-ratio:1/1){#gm .gpd{left:auto;right:calc(12px + ' + SR + ');transform:none;bottom:calc(150px + ' + SB + ')}#gm .gpib{bottom:calc(240px + ' + SB + ')}#gm .gpcp{bottom:calc(150px + ' + SB + ')}}',
          '@media (max-aspect-ratio:1/1){#gm.touch .gpd{left:auto;right:calc(12px + ' + SR + ');transform:none;bottom:calc(150px + ' + SB + ')}#gm.touch .gpib{bottom:calc(240px + ' + SB + ')}#gm.touch .gpcp{bottom:calc(150px + ' + SB + ')}}',
          '#gm .screen.gps .card,#gm .screen.gpr .card{max-height:calc(100% - 20px);overflow:auto;box-sizing:border-box}',
        ].join('\n');
        doc.head.appendChild(css);

        var wrap = mk('div', 'gph off', '');
        var tl = mk('div', 'gptl', '', wrap);
        var bPos = mk('div', 'board gpp', '<small>Pos</small><b>P1<i>/20</i></b>', tl);
        var bLap = mk('div', 'board gpl', '<small>Lap</small><b>1<i>/3</i></b><div class="dots"><i></i><i></i><i></i><i></i><i></i></div>', tl);
        var lineEl = mk('div', 'gpln', '', wrap);
        var rc = mk('div', 'gprc', '', wrap);
        var tower = mk('div', 'gptw', '<div class="h"><span>Lap 1/3</span><span>Int</span></div><div class="rows"></div>', wrap);
        var towerRowsEl = tower.querySelector('.rows'), towerHead = tower.querySelector('.h');
        var gap = mk('div', 'gpgap', '<small>Gap</small><div class="ln"></div><div class="pl"></div>', wrap);
        var dash = mk('div', 'gpd', '<div class="leds">' + new Array(16).join('<i></i>') + '</div><div class="brk"><i></i><b></b></div><div class="gear">N</div><div class="spd"><b>0</b><small>KM/H</small></div>' +
          '<div class="side"><em class="fl">FLAP</em><em class="bx">AUTO</em><em class="as">AIDS</em></div>', wrap);
        var lightsEl = mk('div', 'gplt', '<div class="pod"><i></i><i></i></div><div class="pod"><i></i><i></i></div><div class="pod"><i></i><i></i></div><div class="pod"><i></i><i></i></div><div class="pod"><i></i><i></i></div>', wrap);
        var holdEl = mk('div', 'gphd', '', wrap), rxEl = mk('div', 'gprx', '', wrap), radEl = mk('div', 'gprd', '<b></b><span></span>', wrap);
        var iaEl = mk('div', 'gpia', '', wrap), ibEl = mk('div', 'gpib', '', wrap), pxL = mk('div', 'gppx l', '', wrap), pxR = mk('div', 'gppx r', '', wrap);
        var capEl = mk('div', 'gpcp', '<b></b><span></span>', wrap), nx = mk('div', 'gpnx', '', wrap);
        [lightsEl, pxL, pxR].forEach(function (e) { e.setAttribute('aria-hidden', 'true'); });
        radEl.setAttribute('aria-live', 'polite'); rc.setAttribute('aria-live', 'polite');
        var leds = dash.querySelectorAll('.leds i'), pods = lightsEl.querySelectorAll('.pod'), dots = bLap.querySelectorAll('.dots i'), dotsEl = bLap.querySelector('.dots');
        var Q = {
          posB: bPos.querySelector('b'), lapB: bLap.querySelector('b'), lapS: bLap.querySelector('small'), gapLn: gap.querySelector('.ln'), gapPl: gap.querySelector('.pl'),
          gear: dash.querySelector('.gear'), spd: dash.querySelector('.spd b'), fl: dash.querySelector('.side .fl'), bx: dash.querySelector('.side .bx'), as: dash.querySelector('.side .as'),
          brkMine: dash.querySelector('.brk i'), brkAid: dash.querySelector('.brk b'), radW: radEl.querySelector('b'), radT: radEl.querySelector('span'), capB: capEl.querySelector('b'), capS: capEl.querySelector('span'),
        };
        // what is on screen now (written only when it changes)
        var H = { t: 0, N: 0, cam: null, show: null, pos: '', lap: '', gear: '', spd: -1, leds: -1, fl: '', bx: '', as: '', lights: -9, lightsOutT: 0, towerT: 0, n: 0, me: null, scr: null, phase: '',
          lapMode: '', lapT: 0, finalT: 0, pulseT: 0, rcT: 0, rcPrio: 9, rxT: 0, capT: 0, gapKey: '', gapPrev: null, gapTrend: '', hold: '', early: 0, armedWas: false, brk: '', px: '',
          secBest: [null, null, null], sfT: 0, sfTxt: '', sfCls: '', fin: null, passSeen: false, iaKey: '', ibKey: '', tmax: 0, tnow: 0, tlist: [], built: false, radioOn: false, facadeLap: -1 };
        var REV = { idle: 4000, redline: 12500 }, LIM = { strikes: cfg.limits && cfg.limits.strikes || K.strikes, penalty: cfg.limits && cfg.limits.penalty != null ? cfg.limits.penalty : K.penalty };
        var SPECS = cfg.specs || cfg.all || [];
        function phone() { return win.innerWidth <= 760 || win.innerHeight <= 500; }

        /* -------- the tower: persistent rows that slide; a phone the top three, then the focus car and its neighbours -- */
        var TR = {}, SEPS = [];
        function rowEl(n) {
          var r = TR[n]; if (r) return r;
          var e = mk('div', 'row hid', '<b></b><u></u><span></span><em></em><i></i>', towerRowsEl);
          r = TR[n] = { el: e, b: e.querySelector('b'), u: e.querySelector('u'), s: e.querySelector('span'), em: e.querySelector('em'), i: e.querySelector('i'), key: '', y: -1, vis: false, me: null };
          return r;
        }
        function towerRows(st) {
          var o = st.order, N = o.length, me = st.focus, rows = [];
          if (!phone() || N <= 7) { for (var i = 0; i < N; i++) rows.push(o[i]); return rows; }
          var pm = st.cars[me] ? st.cars[me].place - 1 : 0, keep = {}, count = 0;
          for (i = 0; i < 3; i++) { keep[i] = 1; count++; }
          var lo = clamp(pm - 2, 0, N - 1), hi = clamp(pm + 2, 0, N - 1);
          for (i = lo; i <= hi; i++) if (!keep[i]) { keep[i] = 1; count++; }
          var prev = -2;
          for (i = 0; i < N; i++) if (keep[i]) { if (prev >= 0 && i !== prev + 1) rows.push(-1); rows.push(o[i]); prev = i; }
          return rows;
        }
        function houseOf(st) { var y = st.you >= 0 ? st.cars[st.you] : null; return y ? y.team : null; }
        function towerDraw(st) {
          var rows = towerRows(st), me = st.focus, fast = st.fast ? st.fast.n : -1, rh = phone() ? (win.innerHeight <= 500 ? 16 : 17) : 19, house = houseOf(st), used = {}, si = 0, y = 0;
          var head = 'Lap ' + st.leaderLap + '/' + st.laps + '|' + (st.phase === 'cooldown' || st.done ? 'Flag' : 'Int');
          if (head !== H.towerHead) { H.towerHead = head; var hp = head.split('|'); towerHead.innerHTML = '<span>' + esc(hp[0]) + '</span><span>' + esc(hp[1]) + '</span>'; }
          for (var k = 0; k < rows.length; k++) {
            var n = rows[k];
            if (n < 0) { var sp = SEPS[si] || (SEPS[si] = mk('div', 'sep hid', '', towerRowsEl)); sp.classList.remove('hid'); sp.style.top = (y + 2).toFixed(0) + 'px'; si++; y += 5; continue; }
            var c = st.cars[n], r = rowEl(n); used[n] = true;
            var ahead = c.place > 1 ? st.cars[st.order[c.place - 2]] : null;
            var intv = c.place === 1 ? (c.fin ? 'FLAG' : 'LEADER') : c.down > 0 ? '+' + c.down + ' LAP' + (c.down > 1 ? 'S' : '') : c.fin && ahead && ahead.fin && c.finT != null && ahead.finT != null ? '+' + (c.finT - ahead.finT).toFixed(1)
              : c.gapAhead != null ? '+' + c.gapAhead.toFixed(1) : '';
            if (n === me && H.sfT > 0) intv = H.sfTxt;
            var I = intent(c), chip = n === fast ? 'FL' : c.penalty ? '+' + c.penalty : I ? I.look.s : '', chipC = n === fast ? 'fast' : c.penalty ? 'pen' : '';
            var bar = c.team === house && house ? VERM : c.color;
            var key = c.place + '|' + bar + '|' + c.tla + '|' + intv + '|' + chip + '|' + (n === me) + '|' + (c.recovers && c.stuck > 0.5) + '|' + (n === me ? H.sfCls : '');
            if (key !== r.key) {
              r.key = key; r.b.textContent = c.place; r.u.style.background = bar; r.s.textContent = c.tla; r.em.textContent = intv;
              r.em.className = n === me && H.sfT > 0 ? 'sf ' + H.sfCls : '';
              r.i.textContent = chip; r.i.className = chipC; r.i.style.color = !chipC && I ? I.look.c : '';
              r.el.classList.toggle('me', n === me); r.el.classList.toggle('out', !!(c.recovers && c.stuck > 0.5));
            }
            if (!r.vis) { r.vis = true; r.el.classList.remove('hid'); r.el.style.transition = 'none'; r.el.style.transform = 'translateY(' + y + 'px)'; r.y = y; void r.el.offsetWidth; r.el.style.transition = ''; }
            else if (r.y !== y) { r.y = y; r.el.style.transform = 'translateY(' + y + 'px)'; }
            r.el.style.animationDelay = (k * 0.02).toFixed(2) + 's';
            y += rh;
          }
          for (var q in TR) if (!used[q] && TR[q].vis) { TR[q].vis = false; TR[q].el.classList.add('hid'); }
          for (; si < SEPS.length; si++) SEPS[si].classList.add('hid');
          var hpx = Math.round(y) + 'px'; if (towerRowsEl.style.height !== hpx) towerRowsEl.style.height = hpx;
        }

        /* -------- the transient texts: at most 3 at once (2 on a phone), by priority (EXPERIENCE 1.8) -- */
        // (each one is asked for with its priority; the frame shows the best ones and hides the rest, never more)
        var TX = { rc: { el: rc, p: 0 }, hold: { el: holdEl, p: 0 }, rx: { el: rxEl, p: 0 }, ia: { el: iaEl, p: 1 }, ib: { el: ibEl, p: 1 }, rad: { el: radEl, p: 2 }, sf: { el: null, p: 3 }, cap: { el: capEl, p: 4 }, nx: { el: nx, p: 4 }, line: { el: lineEl, p: 4 } };
        var WANT = {};
        function want(id, on) { WANT[id] = !!on; }
        function settle() {
          var cap = phone() ? 2 : 3, ids = Object.keys(TX).filter(function (k) { return WANT[k]; });
          ids.sort(function (a, b) { return TX[a].p - TX[b].p; });
          var shown = ids.slice(0, cap), list = [];
          Object.keys(TX).forEach(function (k) {
            var on = shown.indexOf(k) >= 0, X = TX[k];
            if (on) list.push(k);
            if (X.el) { if (X.on !== on) { X.on = on; X.el.classList.toggle('on', on); } }
            else X.on = on;
          });
          H.tnow = list.length; H.tlist = list; if (list.length > H.tmax) H.tmax = list.length;
          return shown;
        }
        function room(id) { var cap = phone() ? 2 : 3, p = TX[id].p, n = 0; for (var k in TX) if (k !== id && WANT[k] && TX[k].p <= p) n++; return n < cap; }

        /* -------- race control, captions, the reaction -- */
        function raceControl(text, secs, kind, prio) {
          prio = prio == null ? 5 : prio;
          if (H.rcT > 0 && prio > H.rcPrio) return;
          rc.textContent = text; rc.className = 'gprc' + (kind ? ' ' + kind : '') + (TX.rc.on ? ' on' : ''); H.rcT = secs || 3; H.rcPrio = prio; H.rcText = text;
        }
        function caption(lines, secs) {
          var a = Array.isArray(lines) ? lines : [lines];
          if (!a.length || !a[0]) { H.capT = 0; return; }
          Q.capB.textContent = a[0] || ''; Q.capS.textContent = a[1] || ''; Q.capS.style.display = a[1] ? '' : 'none'; H.capT = secs || 3; H.capText = a.join(' | ');
        }
        function reaction(r, rank, of) {
          if (r == null || !isFinite(r)) return;
          rxEl.textContent = 'REACTION ' + r.toFixed(3) + (rank ? ' · ' + nth(rank) + ' OF ' + (of || 20) : '');
          rxEl.classList.toggle('gold', r < 0.2); H.rxT = 3; H.rxText = rxEl.textContent;
        }

        /* -------- the radio: the scheduler and its words -- */
        var RADIO = radio(), POOL = { pit: {}, agents: {} }, RS = { first: true, device: 'keys', launchT: -1, attackSaid: false, flapSaid: false, finalSaid: false, nemesis: -1, lapSeen: 0, chatterLap: -1, lapT0: 0 };
        function pit(key) {
          var w = POOL.pit[key] != null ? POOL.pit[key] : PIT[key];
          if (w && typeof w === 'object') w = w[RS.device] || w.touch || w.keys;
          return typeof w === 'string' ? w : '';
        }
        function fill(s, o) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return o && o[k] != null ? String(o[k]) : ''; }); }
        // (an agent's lines for a moment: the world's pool by situation, { beaten, passed, memory, chatter } (I's pool, X25), or
        // a plain list for any moment; else the roster's own radio lines)
        function agentLines(n, slot) {
          var s = SPECS[n] || {}, a = POOL.agents[s.id];
          if (a && !Array.isArray(a) && typeof a === 'object') { var L = Array.isArray(a[slot]) && a[slot].length ? a[slot] : Array.isArray(a.any) ? a.any : []; if (L.length) return L; }
          else if (Array.isArray(a) && a.length) return a;
          return Array.isArray(s.radio) ? s.radio : [];
        }
        function prioOf(n, st) { if (!st) return 4; var c = st.cars[n]; if (!c) return 4; if (c.team === houseOf(st)) return 1; if (n === RS.nemesis) return 2; if (c.place === 1) return 3; return 4; }
        function agentSay(n, st, about, slot) {
          var lines = agentLines(n, slot), s = SPECS[n] || st && st.cars[n] || {}; if (!lines.length) return false;
          for (var i = 0; i < lines.length; i++) if (RADIO.offer({ who: s.tla || '', text: lines[i], prio: about ? 0 : prioOf(n, st), t: st ? st.t : 0, agent: true, car: n, key: s.id + '|' + lines[i] })) return true;
          return false;
        }
        function pitSay(key, data, st, prio) { var w = pit(key); if (!w) return false; return RADIO.offer({ who: 'PIT', text: fill(w, data), prio: prio == null ? 0 : prio, t: st ? st.t : 0, key: 'PIT|' + key }); }
        function radioPool(o) {
          o = o || {};
          if (o.pit && typeof o.pit === 'object') for (var k in o.pit) POOL.pit[k] = o.pit[k];
          var strs = function (l) { return Array.isArray(l) ? l.filter(function (x) { return typeof x === 'string'; }) : null; };
          if (o.agents && typeof o.agents === 'object') for (var a in o.agents) {
            var A0 = o.agents[a];
            if (Array.isArray(A0)) POOL.agents[a] = strs(A0);
            else if (A0 && typeof A0 === 'object') { var by = {}; for (var sl in A0) { var l0 = strs(A0[sl]); if (l0) by[sl] = l0; } POOL.agents[a] = by; }
          }
        }
        // the braking points, from the AI's speed profile (where it starts to slow for a corner): given once a race
        var BRK = [];
        function brakes(list) { BRK = Array.isArray(list) ? list.slice().sort(function (a, b) { return a - b; }) : []; }
        function brakeNear(c) {
          if (!BRK.length || !c || !(c.v > 5)) return false;
          var L = T.L, d = c.d, v = c.v;
          for (var i = 0; i < BRK.length; i++) { var a = wrapL(L, BRK[i] - d), b = wrapL(L, d - BRK[i]); if (a / v < 1.5 || b / v < 1.5) return true; }
          return false;
        }
        function latG(c) { if (!c || !(c.v > 1) || !T.k) return 0; var i = min(T.n - 1, floor(wrapL(T.L, c.d) / T.ds)); return c.v * c.v * abs(T.k[i] || 0) / 9.81; }
        var TUN = [];
        function tunnels(list) { TUN = Array.isArray(list) ? list.filter(function (z) { return z && isFinite(z[0]) && isFinite(z[1]); }) : []; }
        function inTunnel(c) { if (!c) return false; for (var i = 0; i < TUN.length; i++) if (inSpan(T.L, c.d, TUN[i][0], TUN[i][1])) return true; return !!H.tunnelEv; }

        /* -------- the lights: 0..5 lit, -1 out -- */
        function setLights(n) {
          if (n === H.lights) return;
          var was = H.lights; H.lights = n;
          for (var i = 0; i < 5; i++) { pods[i].classList.toggle('lit', n > i); dots[i].classList.toggle('on', n > i); }
          dotsEl.classList.toggle('gone', n < 0 && was !== -9);
          if (n >= 0) { lightsEl.classList.add('on'); H.lightsOutT = 0; }
          else if (was > 0 || was === 0) H.lightsOutT = 1.2;
        }
        function show(on) { if (H.show === on) return; H.show = on; wrap.classList.toggle('off', !on); }

        /* -------- the touch buttons: BRAKE (HOLD on the grid), FLAP, CAM, and - / + in manual -- */
        var TB = null;
        function touch(o) {
          o = o || {};
          var TH = { brake: false, gas: false, flap: false, cam: false, up: false, down: false, presses: { flap: 0, cam: 0, up: 0, down: 0, brake: 0 }, releases: { brake: 0 } };
          if (!tpad || typeof tbtn !== 'function') return TH;
          tpad.innerHTML = ''; tpad.classList.remove('rows');
          function fn(name) { return function (down) { var was = TH[name]; TH[name] = !!down; if (down && TH.presses[name] != null) TH.presses[name]++; if (!down && was && TH.releases[name] != null) TH.releases[name]++; }; }
          TB = {};
          if (o.manual) { TB.down = tbtn('−', 'gpsm', fn('down')); TB.up = tbtn('+', 'gpsm', fn('up')); }
          TB.cam = tbtn('CAM', 'gpsm', fn('cam'));
          TB.flap = tbtn('FLAP', 'gpfl', fn('flap'));
          if (o.gas) { TB.brake = tbtn('BRAKE', '', fn('brake')); TB.gas = tbtn('GAS', 'big', fn('gas')); }
          else TB.brake = tbtn('BRAKE', 'big', fn('brake'));
          H.fl = ''; H.hold = '';
          return TH;
        }
        // the start on the button (touch) and the chip (keys, pad): HOLD in the rev phase, WAIT with the five, EARLY
        function holdUi(st, extra) {
          var c = st.cars[st.focus], hd = extra.hold || {}, dev = extra.device || 'keys', mine = st.you >= 0 && st.you === st.focus;
          // (the race's own start, lane A's RaceState.start, when it has one: armed is the race's HOLD, an EARLY is its
          // count going up, a jump start (Pro) is its flag; the device's hold is the fallback for a race without it)
          var ss = mine && st.start && st.start.armed != null ? st.start : null;
          var ph = st.phase, armed = ss ? !!ss.armed : !!hd.armed, launched = !!(c && c.launched && st.go), jump = !!(ss && ss.jump);
          var mode = !mine || extra.intro || extra.demo ? '' : ph === 'grid' ? 'hold' : ph === 'lights' ? 'wait' : ph === 'race' && st.go && c && !c.launched ? 'go' : '';
          // (an EARLY: armed, then let go before lights out with the aids; the car is held, the player may arm again)
          if (ss) { if ((ss.early | 0) > (H.earlyN | 0)) H.early = 1.6; H.earlyN = ss.early | 0; }
          else if (mode === 'wait' && H.armedWas && !armed && !hd.press) H.early = 1.6;
          if (mode === 'hold' || mode === 'wait') H.armedWas = armed;
          else H.armedWas = false;
          if (H.early > 0 && (mode !== 'wait' || armed || jump)) H.early = mode === 'wait' && !armed && !jump ? H.early : 0;
          var key = mode + '|' + armed + '|' + (H.early > 0) + '|' + jump + '|' + st.lights + '|' + dev;
          if (key !== H.hold) {
            H.hold = key;
            var segs = '<span class="seg">' + [0, 1, 2, 3, 4].map(function (i) { return '<i class="' + (st.lights > i ? 'on' : '') + '"></i>'; }).join('') + '</span>';
            var who = dev === 'pad' ? 'HOLD LT' : 'HOLD S';
            var txt = mode === 'hold' ? (armed ? 'HOLDING' : who) + '<small>let go on lights out</small>' : mode === 'wait' ? (jump ? 'JUMP START' : H.early > 0 ? 'EARLY · HOLD AGAIN' : 'WAIT') + segs : mode === 'go' ? 'GO' : '';
            holdEl.innerHTML = txt; holdEl.classList.toggle('armed', armed && !!mode); holdEl.classList.toggle('early', H.early > 0 || jump && mode === 'wait');
            if (TB && TB.brake) {
              var lab = mode === 'hold' ? 'HOLD' : mode === 'wait' ? (jump ? 'JUMP' : H.early > 0 ? 'EARLY' : 'WAIT') : 'BRAKE';
              if (TB.brake.textContent !== lab) TB.brake.textContent = lab;
              TB.brake.classList.toggle('gphold', mode === 'hold' || mode === 'wait'); TB.brake.classList.toggle('early', H.early > 0 || jump && mode === 'wait');
              var lit = mode === 'wait' ? st.lights : 0, seg = [];
              for (var i = 0; i < 5; i++) seg.push((i < lit ? '#FF2D1E' : mode ? 'rgba(200,116,58,.55)' : 'transparent') + ' ' + (i * 72 + 4) + 'deg ' + (i * 72 + 68) + 'deg', 'transparent ' + (i * 72 + 68) + 'deg ' + (i * 72 + 76) + 'deg');
              TB.brake.style.setProperty('--gpseg', mode ? seg.join(',') : 'transparent 0deg 360deg');
            }
          }
          // (the chip is the keys' and the pad's; on touch the button says it)
          want('hold', !!mode && mode !== 'go' && dev !== 'touch' || H.early > 0 && dev !== 'touch');
          return mode;
        }

        /* -------- the gap readout, the proximity bars, the intent chips -- */
        var V3 = env.three || env['THREE'] ? new (env.three || env['THREE']).Vector3() : null, PP = {};
        function gapUi(st) {
          var c = st.cars[st.focus], N = st.cars.length; if (!c) return;
          var ahead = c.place > 1 ? st.cars[st.order[c.place - 2]] : null, behind = c.place < N ? st.cars[st.order[c.place]] : null;
          var ga = ahead && !c.fin ? c.gapAhead : null, gb = behind && !behind.fin && !c.fin ? behind.gapAhead : null;
          if (ga != null && H.gapPrev != null && H.gapPrevN === (ahead ? ahead.n : -1) && abs(ga - H.gapPrev) > 0.004) H.gapTrend = ga < H.gapPrev ? 'up' : 'dn', H.gapDelta = abs(ga - H.gapPrev);
          if (ga != null && (H.gapPrev == null || abs(ga - H.gapPrev) > 0.004 || H.gapPrevN !== (ahead ? ahead.n : -1))) { if (H.gapPrevN !== (ahead ? ahead.n : -1)) H.gapTrend = ''; H.gapPrev = ga; H.gapPrevN = ahead ? ahead.n : -1; }
          var html = '';
          if (ahead && ga != null) html += esc(ahead.tla) + ' +' + ga.toFixed(2) + (H.gapTrend ? ' <span class="' + H.gapTrend + '">' + (H.gapTrend === 'up' ? '▲' : '▼') + H.gapDelta.toFixed(2) + '</span>' : '');
          if (behind && gb != null) html += (html ? '<span class="sep">·</span>' : '') + esc(behind.tla) + ' ' + MINUS + gb.toFixed(2);
          if (!html) html = c.place === 1 ? 'LEADING' : '—';
          if (html !== H.gapKey) { H.gapKey = html; Q.gapLn.innerHTML = html; }
          // (a phone: the plan of the car ahead, or of the main threat behind, in words)
          var plan = '';
          if (phone()) {
            var Ib = behind ? intent(behind) : null, Ia = ahead ? intent(ahead) : null;
            plan = Ib && Ib.state === 'ATTACK' ? intentText(behind.tla, Ib, true) : Ia ? intentText(ahead.tla, Ia, true) : Ib ? intentText(behind.tla, Ib, true) : '';
          }
          if (plan !== H.gapPlan) { H.gapPlan = plan; Q.gapPl.textContent = plan; Q.gapPl.classList.toggle('on', !!plan); }
        }
        function proximity(st) {
          var c = st.cars[st.focus], L = T.L, side = 0; if (!c || st.phase === 'grid' || st.phase === 'lights') { side = 0; }
          else for (var i = 0; i < st.cars.length; i++) {
            if (i === st.focus) continue; var o = st.cars[i]; if (o.fin && c.fin) continue;
            var dd = wrapL(L, o.d - c.d); if (dd > L / 2) dd -= L;
            if (abs(dd) < 5.5 && abs(o.lat - c.lat) < 3.4 && abs(o.lat - c.lat) > 0.6) side |= o.lat > c.lat ? 2 : 1;
          }
          var k = String(side); if (k !== H.px) { H.px = k; pxL.classList.toggle('on', !!(side & 1)); pxR.classList.toggle('on', !!(side & 2)); }
        }
        function project(n, st, up) {
          var cam = env.camera, c = st.cars[n]; if (!cam || !V3 || !c) return null;
          var p = T.posAt(c.d, c.lat, up, PP); V3.set(p.x, p.y, p.z).project(cam);
          if (V3.z >= 1 || V3.z <= -1 || abs(V3.x) > 0.95 || abs(V3.y) > 0.95) return null;
          return { x: (V3.x + 1) / 2 * win.innerWidth, y: (1 - V3.y) / 2 * win.innerHeight };
        }
        function chips(st, extra) {
          var c = st.cars[st.focus], N = st.cars.length, onA = false, onB = false;
          if (c && !phone() && st.phase === 'race' && !c.fin && !extra.ceremony) {
            var ahead = c.place > 1 ? st.cars[st.order[c.place - 2]] : null, behind = c.place < N ? st.cars[st.order[c.place]] : null, L = T.L;
            var Ia = ahead ? intent(ahead) : null;
            if (Ia && wrapL(L, ahead.d - c.d) < 100) {
              var p = project(ahead.n, st, -0.2);
              if (p) {
                var ta = intentText(ahead.tla, Ia, false);
                if (ta !== H.iaKey) { H.iaKey = ta; iaEl.textContent = ta; iaEl.style.borderColor = Ia.look.c; iaEl.style.color = Ia.look.c; }
                var w = iaEl.offsetWidth || 120; iaEl.style.transform = 'translate(' + (p.x - w / 2).toFixed(0) + 'px,' + (p.y + 14).toFixed(0) + 'px)'; onA = true;
              }
            }
            var Ib = behind ? intent(behind) : null;
            if (Ib && wrapL(L, c.d - behind.d) < 100) {
              var tb = intentText(behind.tla, Ib, false) + (behind.lat > c.lat ? ' ▶' : ' ◀');
              if (tb !== H.ibKey) { H.ibKey = tb; ibEl.textContent = tb; ibEl.style.borderColor = Ib.look.c; ibEl.style.color = Ib.look.c; }
              var wb = ibEl.offsetWidth || 140, xb = win.innerWidth / 2 + (behind.lat > c.lat ? 170 : -170 - wb);
              ibEl.style.left = clamp(xb, 10, win.innerWidth - wb - 10).toFixed(0) + 'px'; onB = true;
            }
          }
          want('ia', onA); want('ib', onB);
        }

        /* -------- the frame: everything from the state, written on change -- */
        function update(dt, st, extra) {
          extra = extra || {};
          dt = clamp(+dt || 0, 0, 0.5);
          if (!st || !st.cars || !st.cars.length) { show(false); return; }
          var demo = !!extra.demo;
          if (extra.device) RS.device = extra.device;
          if (extra.first != null) RS.first = !!extra.first;
          // a new race (the clock went back, or another field): nothing carried over from the last one
          if (st.t < H.t - 1e-9 || st.cars.length !== H.N || st.seed !== H.seed) newRace(st);
          H.t = st.t; H.N = st.cars.length; H.seed = st.seed; H.lastSt = st;
          show(!demo && !extra.intro && (!H.scr || H.scr === 'pause' || H.scr === 'seat'));
          var tv = !!extra.tv; if (tv !== H.tv) { H.tv = tv; wrap.classList.toggle('tv', tv); }
          var me = st.focus, c = st.cars[me]; if (!c) return;
          var spect = st.you < 0;
          // the timers
          if (H.lightsOutT > 0) { H.lightsOutT -= dt; if (H.lightsOutT <= 0) lightsEl.classList.remove('on'); }
          if (H.pulseT > 0) { H.pulseT -= dt; if (H.pulseT <= 0) bPos.classList.remove('pulse'); }
          if (H.rcT > 0) H.rcT -= dt; want('rc', H.rcT > 0);
          if (H.rxT > 0) H.rxT -= dt; want('rx', H.rxT > 0);
          if (H.capT > 0) H.capT -= dt; want('cap', H.capT > 0);
          if (H.early > 0) H.early -= dt;
          if (H.sfT > 0) { H.sfT -= dt; if (H.sfT <= 0) H.towerT = 0; } want('sf', H.sfT > 0);
          if (st.lights !== H.lights && (st.phase === 'lights' || st.phase === 'grid' || H.lights > 0)) setLights(st.phase === 'grid' ? 0 : st.lights);
          // the position box
          var N = st.cars.length, pos = 'P' + c.place + '|' + N; if (pos !== H.pos) { H.pos = pos; Q.posB.innerHTML = 'P' + c.place + '<i>/' + N + '</i>'; }
          // the lap box: LAP n/N; the lap time for 1.5 s at the line; FINAL LAP for 3 s; FINISHED and the race time
          if (H.lapT > 0) H.lapT -= dt;
          if (H.finalT > 0) H.finalT -= dt;
          var lapMode = c.fin && !spect ? 'fin' : H.finalT > 0 ? 'final' : H.lapT > 0 ? 'flash' : 'lap';
          var lapKey = lapMode + '|' + min(st.laps, c.lap + 1) + '|' + st.laps + '|' + (H.lapFlash || '') + '|' + (H.fin ? H.fin.time : '');
          if (lapKey !== H.lap) {
            H.lap = lapKey;
            bLap.classList.toggle('final', lapMode === 'final'); bLap.classList.toggle('flash', lapMode === 'flash'); bLap.classList.toggle('fin', lapMode === 'fin');
            bLap.classList.toggle('fast', lapMode === 'flash' && H.lapFast); bLap.classList.toggle('del', lapMode === 'flash' && H.lapDel);
            if (lapMode === 'fin') { Q.lapS.textContent = 'Finished'; Q.lapB.textContent = H.fin ? clock(H.fin.time) : clock(c.raceT); }
            else if (lapMode === 'final') { Q.lapS.textContent = H.lapFlash ? (H.lapDel ? 'Deleted ' : 'Last ') + H.lapFlash : 'Lap ' + st.laps + '/' + st.laps; Q.lapB.textContent = 'FINAL LAP'; }
            else if (lapMode === 'flash') { Q.lapS.textContent = H.lapDel ? 'Deleted' : 'Lap ' + H.lapDone; Q.lapB.textContent = H.lapFlash; }
            else { Q.lapS.textContent = 'Lap'; Q.lapB.innerHTML = min(st.laps, c.lap + 1) + '<i>/' + st.laps + '</i>'; }
            if (H.lapModeWas !== lapMode && (lapMode === 'final' || lapMode === 'fin')) { bLap.classList.remove('slam'); void bLap.offsetWidth; bLap.classList.add('slam'); }
            H.lapModeWas = lapMode;
          }
          // (the line under them, after your flag: the gap to the car ahead and to the one behind)
          var ln = H.fin && H.fin.line ? H.fin.line : ''; if (ln !== H.lnText) { H.lnText = ln; lineEl.textContent = ln; }
          want('line', !!ln && !(H.rcT > 0));
          // the aids or Pro (D3), the gearbox
          var as = spect ? '' : extra.aids === 'pro' || (extra.assists && !extra.assists.brake && !extra.assists.steer) ? 'PRO' : 'AIDS';
          if (as !== H.as) { H.as = as; Q.as.textContent = as; Q.as.classList.toggle('pro', as === 'PRO'); Q.as.style.display = as ? '' : 'none'; }
          var bx = (extra.gearbox || cfg.gearbox || 'auto') === 'manual' ? 'MANUAL' : 'AUTO'; if (bx !== H.bx) { H.bx = bx; Q.bx.textContent = bx; }
          // the speed box
          var gear = !c.gear ? 'N' : String(c.gear); if (gear !== H.gear) { H.gear = gear; Q.gear.textContent = gear; }
          var kmh = Math.round(extra.kmh != null ? extra.kmh : abs(c.v || 0) * 3.6);
          if ((H.n++ % 3) === 0 && kmh !== H.spd) { H.spd = kmh; Q.spd.textContent = kmh; }
          var rv = extra.rev || REV, u = clamp(((c.rpm || 0) - rv.idle * 1.6) / (rv.redline * 0.985 - rv.idle * 1.6), 0, 1), nl = c.rpm >= rv.redline * 0.985 ? 16 : Math.round(u * 15);
          if (nl !== H.leds) { H.leds = nl; dash.classList.toggle('lim', nl > 15); for (var li = 0; li < 15; li++) leds[li].className = li < min(nl, 15) ? (li < 5 ? 'g' : li < 10 ? 'a' : 'r') : ''; }
          // (the brake bar: white the brake you asked for, amber what the aids added on top: X21)
          var bm = extra.brake ? clamp(+extra.brake.mine || 0, 0, 1) : 0, bt = extra.brake ? clamp(+extra.brake.total || 0, 0, 1) : clamp(c.brk || 0, 0, 1), ba = max(0, bt - bm);
          var bk = Math.round(bm * 50) + '|' + Math.round(ba * 50); if (bk !== H.brk) { H.brk = bk; Q.brkMine.style.width = (bm * 100).toFixed(0) + '%'; Q.brkAid.style.left = (bm * 100).toFixed(0) + '%'; Q.brkAid.style.width = (ba * 100).toFixed(0) + '%'; }
          // the Flap: armed before its zone (the metres to it), set, now, open; on the final lap a zone that runs over the
          // line is the last one (X08)
          var F0 = c.flap || {}, fl = F0.open ? 'open' : F0.armed ? (F0.inZone ? 'go' : F0.set ? 'set' : 'armed') : flapZoneAt(c.d) ? 'zone' : '';
          var lastZone = !c.fin && c.lap + 1 === st.laps && (fl === 'armed' || fl === 'go' || fl === 'open' || fl === 'set') && zoneCrossesLine(c.d);
          var flT = lastZone ? 'LAST FLAP · TO THE FLAG' : fl === 'open' ? 'FLAP OPEN' : fl === 'go' ? 'FLAP NOW' : fl === 'set' ? 'FLAP SET' : fl === 'armed' && F0.to > 0 ? 'FLAP ' + (F0.to >= 1000 ? (F0.to / 1000).toFixed(1) + ' KM' : Math.max(50, Math.round(F0.to / 50) * 50) + ' M') : 'FLAP';
          if (fl + flT !== H.fl) {
            H.fl = fl + flT; Q.fl.className = 'fl' + (fl ? ' ' + fl : '') + (lastZone ? ' last' : ''); Q.fl.textContent = flT;
            if (TB && TB.flap) { TB.flap.classList.toggle('armed', !!fl && fl !== 'zone'); TB.flap.classList.toggle('go', fl === 'go'); TB.flap.classList.toggle('open', fl === 'open'); }
          }
          dash.style.display = spect ? 'none' : '';
          // the start
          var hm = holdUi(st, extra);
          // the tower (four times a second, at once when the order changes), the gap readout, the edges, the chips
          H.towerT -= dt;
          var ok = st.order.join(',');
          if (H.towerT <= 0 || ok !== H.orderKey) { H.towerT = 0.25; H.orderKey = ok; towerDraw(st); gapUi(st); }
          proximity(st);
          chips(st, extra);
          // the radio: the PIT engineer and the agents (X25)
          radioTick(st, extra, hm);
          // after your flag: what a fresh tap or key does
          var nxOn = !!c.fin && !spect && !demo && !H.scr && !!extra.ceremony && extra.ceremony.skippable;
          if (nxOn && H.nxText !== extra.ceremony.hint) { H.nxText = extra.ceremony.hint; nx.textContent = extra.ceremony.hint; }
          want('nx', nxOn);
          // the view named for a moment when it changes (V, CAM): race control's chip, briefly
          var cm = extra.cam == null ? null : typeof extra.cam === 'string' ? extra.cam : extra.cam.mode;
          // a world with a glass cockpit (cfg.cameras.glass) draws speed, gear, lamps, Flap and the start lights itself: the HUD's copies hide in the cockpit view (visibility only, the layout stays)
          if (cm !== H.glass) { H.glass = cm; wrap.classList.toggle('glass', cm === 'cockpit' && !!(cfg.cameras && cfg.cameras.glass)); }
          if (cm && cm !== H.cam) { if (H.cam && st.phase !== 'grid') raceControl(cm === 'tcam' ? 'T-CAM' : cm === 'cockpit' ? 'COCKPIT' : cm === 'tv' ? 'TV' : 'CHASE CAM', 1.2, 'flag', 8); H.cam = cm; }
          // the facade of the Black Box (X23): your code and place, once a lap (the look kit's screen hook)
          facade(st, extra);
          settle();
          H.phase = st.phase;
        }
        function radioTick(st, extra, hm) {
          var c = st.cars[st.focus], mine = st.you >= 0 && st.you === st.focus && !extra.demo && !extra.intro;
          if (!mine) { want('rad', false); return; }
          // the tutorial spine (the first race of a session), then strategy
          if (RS.first && st.phase === 'grid' && !RS.revSaid) { RS.revSaid = true; pitSay('rev', {}, st, 0); }
          if (RS.launchT >= 0 && RS.first && !RS.steerSaid && st.t - RS.launchT >= 4.0) { RS.steerSaid = true; pitSay('steer', {}, st, 0); }
          var since = RS.launchT >= 0 ? st.t - RS.launchT : -1;
          // (the first ATTACK on you, read from the car behind's own plan when the race writes no intent event for it)
          if (RS.first && !RS.attackSaid && c && st.phase === 'race' && c.place < st.cars.length) {
            var bh = st.cars[st.order[c.place]], Ib = intent(bh);
            if (Ib && Ib.state === 'ATTACK' && wrapL(T.L, c.d - bh.d) < 60) { RS.attackSaid = true; pitSay('attack', { name: bh.name, tla: bh.tla, side: (Ib.side || 'inside').toLowerCase() }, st, 0); }
          }
          var ctx = { t: st.t, phase: st.phase, lap: c ? c.lap + 1 : 0, sinceLaunch: since, brakeNear: extra.brakeNear != null ? !!extra.brakeNear : brakeNear(c), latG: extra.latG != null ? extra.latG : latG(c),
            tunnel: extra.tunnel != null ? !!extra.tunnel : inTunnel(c), phone: phone(), room: room('rad') };
          // (an agent nearby talks once a lap when nothing else made it talk: the nearest car ahead or behind)
          if (st.phase === 'race' && c && !c.fin && RS.chatterLap !== c.lap && st.t - RS.lapT0 > 40) {
            RS.chatterLap = c.lap;
            var N = st.cars.length, a = c.place > 1 ? st.order[c.place - 2] : -1, b = c.place < N ? st.order[c.place] : -1;
            if (!(a >= 0 && agentSay(a, st, false, 'chatter'))) if (b >= 0) agentSay(b, st, false, 'chatter');
          }
          var line = RADIO.tick(ctx);
          if (line) {
            var key = line.who + '|' + line.text;
            if (key !== H.radKey) { H.radKey = key; Q.radW.textContent = line.who + ':'; Q.radT.textContent = line.text; radEl.classList.toggle('ag', !!line.agent); }
          }
          want('rad', !!line);
        }
        function finLine() {
          var F = H.fin; if (!F) return;
          var a = F.ga != null && F.atla ? '+' + F.ga.toFixed(3) + ' to ' + F.atla : '', b = F.gb != null && F.btla ? F.gb.toFixed(3) + ' ahead of ' + F.btla : '';
          F.line = [a, b].filter(Boolean).join(' · ');
        }
        function newRace(st) {
          H.me = null; H.orderKey = ''; H.fl = ''; H.cam = null; H.lapT = 0; H.finalT = 0; H.rcT = 0; H.rxT = 0; H.capT = 0; H.sfT = 0; H.early = 0; H.earlyN = 0; H.armedWas = false; H.fin = null; H.lap = ''; H.pos = '';
          H.secBest = [null, null, null]; H.gapPrev = null; H.gapTrend = ''; H.gapKey = ''; H.passSeen = false; H.tunnelEv = false; H.hold = ''; H.facadeLap = -1; H.tmax = 0;
          bPos.classList.remove('pulse'); bLap.classList.remove('final', 'flash', 'fin', 'slam');
          RADIO.reset(); RS.launchT = -1; RS.revSaid = false; RS.steerSaid = false; RS.attackSaid = false; RS.flapSaid = false; RS.finalSaid = false; RS.nemesis = -1; RS.chatterLap = -1; RS.lapT0 = 0; RS.lapGap = false;
          for (var q in TR) { TR[q].vis = false; TR[q].key = ''; TR[q].el.classList.add('hid'); }
        }
        function flapZoneAt(d) { var F = cfg.flaps || []; for (var i = 0; i < F.length; i++) if (inSpan(T.L, d, F[i].from, F[i].to)) return true; return false; }
        // (the zone that is armed or open now, or the next one: does it run over the line?)
        function zoneCrossesLine(d) {
          var F = cfg.flaps || [], best = null, bd = Infinity;
          for (var i = 0; i < F.length; i++) { var z = F[i], w = inSpan(T.L, d, z.from, z.to) ? 0 : wrapL(T.L, z.from - d); if (w < bd) { bd = w; best = z; } }
          return !!best && wrapL(T.L, best.to - best.from) < T.L && best.to < best.from;
        }
        // the gantry's screens (X08 FINAL LAP, X16 WINNER): a canvas for the look kit's hook, kit.screen('gantry', canvas)
        var GAN = null;
        function gantry(a, b) {
          var K = typeof env.kit === 'function' ? env.kit() : null; if (!K || typeof K.screen !== 'function') return;
          try {
            if (!GAN) { GAN = doc.createElement('canvas'); GAN.width = 512; GAN.height = 128; }
            var g = GAN.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 512, 128);
            g.fillStyle = '#fff'; g.font = '700 64px ' + FONT + ',sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
            g.fillText(a, 256, b ? 44 : 66); if (b) { g.font = '600 36px ' + FONT + ',sans-serif'; g.fillStyle = GOLD; g.fillText(b, 256, 98); }
            K.screen('gantry', GAN);
          } catch (e) {}
        }
        // the Black Box's facade: drawn once a lap, your code and place (the leader's on the last lap's run home)
        var FAC = null;
        function facade(st, extra) {
          var K = typeof env.kit === 'function' ? env.kit() : null; if (!K || typeof K.screen !== 'function') return;
          var c = st.cars[st.focus]; if (!c || st.phase !== 'race' || H.facadeLap === c.lap) return;
          H.facadeLap = c.lap;
          try {
            if (!FAC) { FAC = doc.createElement('canvas'); FAC.width = 512; FAC.height = 256; }
            var g = FAC.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 512, 256);
            g.fillStyle = '#fff'; g.font = '700 150px ' + FONT + ',sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
            g.fillText(c.tla + ' P' + c.place, 256, 132);
            K.screen('facade', FAC);
          } catch (e) {}
        }
        function event(e) {
          if (!e) return;
          var st = H.lastSt; if (!st) return;
          var me = st.focus, you = st.you, mine = you >= 0 && you === me;
          if (e.e === 'tunnel' && e.car === me) { H.tunnelEv = e.state === 'in'; return; }
          if (!mine) return;
          var c = st.cars[me];
          if (e.e === 'launch' && e.car === me) { RS.launchT = e.t; return; }
          if (e.e === 'jump' && e.car === me && e.penalty) { raceControl('JUMP START · +' + (e.penalty || LIM.penalty) + ' S', 3.5, 'red', 0); return; }
          // passes: the position pulses gold for an earned one (A's pass { earned }; M1's raw overtake until A writes it),
          // and the beaten agent says something in character
          if (e.e === 'pass' || (e.e === 'overtake' && !H.passSeen)) {
            if (e.e === 'pass') H.passSeen = true;
            if (e.car === me && (e.e === 'overtake' || e.earned !== false)) { bPos.classList.add('pulse'); H.pulseT = 0.4; }
            if (e.car === me && e.passed >= 0) agentSay(e.passed, st, true, 'beaten');
            else if (e.passed === me && e.car >= 0) agentSay(e.car, st, true, 'passed');
            return;
          }
          if (e.e === 'sector' && e.car === me && e.s >= 1 && e.s <= 3 && isFinite(e.time)) {
            var b0 = H.secBest[e.s - 1], fastAll = e.best === true || (e.best && e.best.all);
            H.sfTxt = 'S' + e.s + ' ' + (b0 == null ? e.time.toFixed(2) : signed(e.time - b0)); H.sfCls = fastAll ? 'gold' : b0 == null ? '' : e.time <= b0 ? 'up' : 'dn';
            if (b0 == null || e.time < b0) H.secBest[e.s - 1] = e.time;
            H.sfT = 2; H.towerT = 0; return;
          }
          if (e.e === 'lap' && e.car === me) {
            H.lapDone = e.lap; H.lapFlash = clock(e.time); H.lapDel = !!e.deleted; H.lapFast = !!(st.fast && st.fast.n === me && abs(st.fast.time - e.time) < 1e-6);
            H.lapT = 1.5; RS.lapT0 = e.t;
            // (the final lap: the box slams FINAL LAP with a gold rim for 3 s, the lap just done in its label: X08)
            if (e.lap + 1 === st.laps) { H.finalT = 3.0; H.lapT = 0; gantry('FINAL LAP', ''); if (!RS.finalSaid) { RS.finalSaid = true; pitSay('final', {}, st, 0); } }
            if (e.lap === 1 && !RS.flapSaid) { RS.flapSaid = true; if (RS.first) pitSay('flap', {}, st, 0); else { var a = c && c.place > 1 ? st.cars[st.order[c.place - 2]] : null; if (a && a.gapAhead != null) pitSay('gap', { place: c.place, tla: a.tla, gap: c.gapAhead != null ? c.gapAhead.toFixed(1) : '' }, st, 1); } }
            if (e.deleted) raceControl('LAP ' + e.lap + ' DELETED · TRACK LIMITS', 3, '', 1);
            return;
          }
          if (e.e === 'finalLap' && (e.car === me || e.you)) { if (H.finalT <= 0) H.finalT = 3.0; gantry('FINAL LAP', ''); return; }
          if (e.e === 'limits' && e.car === me) { var per = LIM.strikes, k = e.strikes % per || per; raceControl('TRACK LIMITS · ' + String(e.corner || '').replace(/-.*/, '') + ' · ' + k + '/' + per, 3, '', 1); return; }
          if (e.e === 'penalty' && e.car === me) { raceControl('+' + (e.seconds || LIM.penalty) + ' S PENALTY · TRACK LIMITS', 3.5, 'red', 0); return; }
          if (e.e === 'giveBack' && e.car === me) {
            if (e.state === 'asked') raceControl('GIVE IT BACK', 10, 'red', 0);
            else if (e.state === 'given') raceControl('POSITION GIVEN BACK', 2, '', 1);
            else if (e.state === 'penalty') raceControl('NOT GIVEN BACK · +' + LIM.penalty + ' S', 3.5, 'red', 0);
            return;
          }
          if (e.e === 'nemesis' && e.car >= 0 && e.car !== me) {
            RS.nemesis = e.car; var nm = st.cars[e.car];
            if (nm && c) { var dg = nm.gapLead != null && c.gapLead != null ? c.gapLead - nm.gapLead : null, ahead = nm.place < c.place; pitSay('nemesis', { name: nm.name, tla: nm.tla, gap: dg != null ? abs(dg).toFixed(1) : '', where: ahead ? 'ahead' : 'behind' }, st, 0); }
            return;
          }
          if (e.e === 'intent' && e.target === me && /^attack$/i.test(e.state || '') && !RS.attackSaid && RS.first) {
            RS.attackSaid = true; var ag = st.cars[e.car]; if (ag) pitSay('attack', { name: ag.name, tla: ag.tla, side: String(e.side || 'inside').toLowerCase() }, st, 0); return;
          }
          if (e.e === 'memory' && e.car >= 0) { agentSay(e.car, st, true, 'memory'); return; }
          if (e.e === 'mistake' && e.car !== me) return;
          if (e.e === 'finish') {
            if (e.car === me) {
              // (the line under the boxes: the gap to the car ahead and, once it is home, to the one behind; the race's own
              // crossing times, A's gapAhead / gapBehind when it writes them)
              var ah = c && c.place > 1 ? st.cars[st.order[c.place - 2]] : null, be = c && c.place < st.cars.length ? st.cars[st.order[c.place]] : null;
              var ga = e.gapAhead != null ? +e.gapAhead : ah && ah.fin && ah.raceT != null && e.time != null ? e.time - ah.raceT : null;
              H.fin = { time: e.time, place: e.place, atla: ah ? ah.tla : '', ga: ga, btla: be ? be.tla : '', gb: e.gapBehind != null ? +e.gapBehind : null };
              finLine();
              bPos.classList.remove('slam'); void bPos.offsetWidth; bPos.classList.add('slam'); H.pos = '';
            } else if (H.fin && H.fin.gb == null && e.place === H.fin.place + 1 && e.time != null && H.fin.time != null) {
              var bc = st.cars[e.car]; H.fin.gb = e.time - H.fin.time; H.fin.btla = bc ? bc.tla : H.fin.btla; finLine();
            } else if (e.place === 1 && c && !c.fin) {
              var w = st.cars[e.car]; if (w) { raceControl(String(w.name).toUpperCase() + ' WINS · CHEQUERED FLAG', 4, 'flag', 2); gantry('WINNER', String(w.name).toUpperCase()); }
            }
            return;
          }
          if (e.e === 'end' && c && !c.fin) { raceControl('RACE OVER · CLASSIFIED P' + c.place, 6, 'flag', 0); return; }
        }

        /* -------- the build (X05) -- */
        function build(instant) {
          H.built = true; show(true);
          if (instant || env.reduced) { wrap.classList.remove('build'); root.classList.remove('gpbuild'); return; }
          wrap.classList.remove('build'); void wrap.offsetWidth; wrap.classList.add('build'); root.classList.add('gpbuild');
          if (win && win.setTimeout) win.setTimeout(function () { wrap.classList.remove('build'); root.classList.remove('gpbuild'); }, 1600);
        }

        /* -------- the screens -- */
        var scrEl = null, SCR = null;
        function hideScreen() { if (scrEl) { scrEl.remove(); scrEl = null; } H.scr = null; SCR = null; if (root && root.classList) root.classList.remove('gpres'); }
        function stop(e) { e.preventDefault(); e.stopPropagation(); }
        function screenOf(cls, html, onGo) {
          hideScreen();
          scrEl = mk('div', 'screen ' + cls, '<div class="card">' + html + '</div>');
          scrEl.addEventListener('pointerdown', function (e) { e.preventDefault(); if (onGo) onGo(); });
          var card = scrEl.querySelector('.card'); card.addEventListener('pointerdown', function (e) { if (cls.indexOf('gpsh') >= 0 || cls.indexOf('gpr') >= 0) e.stopPropagation(); });
          return scrEl;
        }
        function seg(name, label, opts, val) {
          return '<span class="gpseg" data-seg="' + name + '"><small>' + esc(label) + '</small>' + opts.map(function (o) { return '<button type="button" data-v="' + esc(o[0]) + '"' + (o[0] === val ? ' class="on"' : '') + '>' + esc(o[1]) + '</button>'; }).join('') + '</span>';
        }
        function slider(name, label, val) { return '<label class="gpvol" data-vol="' + name + '"><span>' + esc(label) + '</span><input type="range" min="0" max="100" step="5" value="' + Math.round(clamp(+val, 0, 100)) + '"></label>'; }
        function wireSegs(s, onOption, S0) {
          s.querySelectorAll('.gpseg').forEach(function (g) {
            var name = g.getAttribute('data-seg');
            g.querySelectorAll('button').forEach(function (b) {
              b.addEventListener('pointerdown', function (e) {
                stop(e); var v = b.getAttribute('data-v');
                g.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
                var val = name === 'pro' ? v === '1' : v === 'on' ? true : v === 'off' ? false : v;
                if (S0) S0[name] = val;
                if (typeof onOption === 'function') onOption(name, val);
              });
            });
          });
          s.querySelectorAll('.gpvol').forEach(function (g) {
            var name = g.getAttribute('data-vol'), inp = g.querySelector('input');
            g.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
            inp.addEventListener('input', function () { if (typeof onOption === 'function') onOption(name, +inp.value / 100); });
          });
        }
        function camOpts() { var camNames = { chase: 'Chase', tcam: 'T-cam', cockpit: 'Cockpit' }; return ((cfg.cameras && cfg.cameras.allow) || MODES).map(function (m) { return [m, camNames[m] || m]; }); }
        // the seat: the agent whose car you drive (D1: Muse's V-07 by default, shown "MUSE · DRIVEN BY YOU")
        function pickGrid(drivers, pick) {
          var teams = [], byTeam = {};
          drivers.forEach(function (d, i) { var k = d.team || ''; if (!byTeam[k]) { byTeam[k] = { name: d.teamName || k, color: d.color, ids: [] }; teams.push(byTeam[k]); } byTeam[k].ids.push(i); });
          return '<div class="gppick" role="listbox" aria-label="Seat">' + teams.map(function (t) {
            return '<div class="tm"><small style="border-color:' + esc(t.color) + '">' + esc(t.name) + '</small>' + t.ids.map(function (i) {
              var d = drivers[i]; return '<button type="button" role="option" data-k="' + i + '"' + (i === pick ? ' class="on" aria-selected="true"' : '') + ' title="' + esc(d.name) + '">' + esc(d.tla) + '<i>' + esc(d.num) + '</i></button>';
            }).join('') + '</div>';
          }).join('') + '</div>';
        }
        function wirePick(s, drivers, S0, onPick, youTag) {
          var pick = drivers.findIndex(function (d) { return d.id === S0.you; }); if (pick < 0) pick = 0;
          function paint() {
            var d = drivers[pick]; if (!d) return;
            s.querySelector('.who').textContent = String(d.name).toUpperCase() + ' · ' + youTag; s.querySelector('.wt').textContent = '#' + d.num + '  ·  ' + (d.teamName || '');
            s.querySelectorAll('.gppick button').forEach(function (b) { var on = +b.getAttribute('data-k') === pick; b.classList.toggle('on', on); if (on) b.setAttribute('aria-selected', 'true'); else b.removeAttribute('aria-selected'); });
          }
          function choose(k) { pick = clamp(k, 0, drivers.length - 1); S0.you = drivers[pick].id; paint(); if (typeof onPick === 'function') onPick(S0.you); }
          s.querySelectorAll('.gppick button').forEach(function (b) { b.addEventListener('pointerdown', function (e) { stop(e); choose(+b.getAttribute('data-k')); }); });
          paint();
          return function (dk) { choose((pick + dk + drivers.length) % drivers.length); return S0.you; };
        }
        // the start card (only when there is no intro; D5 puts Play straight into the intro)
        function startScreen(data) {
          var drivers = data.drivers || cfg.all || cfg.specs || [], tagY = String(data.youTag || cfg.youTag || 'DRIVEN BY YOU').toUpperCase();
          var S0 = { you: data.you, pro: !!data.pro, gearbox: data.gearbox === 'manual' ? 'manual' : 'auto', cam: data.cam || 'chase' };
          if (!drivers.some(function (d) { return d.id === S0.you; }) && drivers[0]) S0.you = drivers[0].id;
          var html = '<h1>' + esc(data.title || 'Grand Prix') + '</h1>' + (data.tagline ? '<p>' + esc(data.tagline) + '</p>' : '') +
            '<div class="gpwho">Your seat <b class="who"></b><span class="wt"></span></div>' + pickGrid(drivers, drivers.findIndex(function (d) { return d.id === S0.you; })) +
            '<div class="gpopt">' + seg('pro', 'Aids', [['0', 'On'], ['1', 'Pro']], S0.pro ? '1' : '0') + seg('gearbox', 'Gears', [['auto', 'Auto'], ['manual', 'Manual']], S0.gearbox) + seg('cam', 'Camera', camOpts(), S0.cam) + '</div>' +
            '<div class="go">Enter or tap to start</div>';
          var go = function () { if (typeof data.onGo === 'function') data.onGo({ you: S0.you, pro: S0.pro, gearbox: S0.gearbox, cam: S0.cam }); };
          var s = screenOf('gps', html, go); H.scr = 'start';
          wireSegs(s, data.onOption, S0); var pick = wirePick(s, drivers, S0, data.onPick, tagY);
          return { el: s, go: go, pick: pick, get: function () { return { you: S0.you, pro: S0.pro, gearbox: S0.gearbox, cam: S0.cam }; } };
        }
        // the seat and the settings, from the intro's chip (the intro waits while it is open)
        function seatScreen(data) {
          var drivers = data.drivers || cfg.all || cfg.specs || [], tagY = String(data.youTag || cfg.youTag || 'DRIVEN BY YOU').toUpperCase();
          var S0 = { you: data.you, pro: !!data.pro, gearbox: data.gearbox === 'manual' ? 'manual' : 'auto', cam: data.cam || 'chase' };
          var html = '<h1>Your seat</h1><div class="gpwho"><b class="who"></b><span class="wt"></span></div>' + pickGrid(drivers, drivers.findIndex(function (d) { return d.id === S0.you; })) +
            '<div class="grp">' + seg('pro', 'Aids', [['0', 'On'], ['1', 'Pro']], S0.pro ? '1' : '0') + seg('gearbox', 'Gears', [['auto', 'Auto'], ['manual', 'Manual']], S0.gearbox) + seg('cam', 'Camera', camOpts(), S0.cam) + '</div>' +
            '<div class="acts"><button type="button" class="go" data-act="done">Done</button></div>';
          var done = function () { if (typeof data.onDone === 'function') data.onDone({ you: S0.you, pro: S0.pro, gearbox: S0.gearbox, cam: S0.cam }); };
          var s = screenOf('gpsh', html, done); H.scr = 'seat';
          wireSegs(s, data.onOption, S0); var pick = wirePick(s, drivers, S0, data.onPick, tagY);
          s.querySelector('[data-act="done"]').addEventListener('pointerdown', function (e) { stop(e); done(); });
          return { el: s, go: done, pick: pick, get: function () { return { you: S0.you, pro: S0.pro, gearbox: S0.gearbox, cam: S0.cam }; } };
        }
        // the pause sheet (X26): resume, restart, the camera, the aids, the gears, the start tones, the haptics, the
        // volumes, the steering, quit to the demo
        function pauseScreen(data) {
          var st = data.state, c = st && st.cars[st.focus], P = data.settings || {};
          var html = '<h1>Paused</h1><p>' + (c ? 'Lap ' + min(st.laps, c.lap + 1) + ' of ' + st.laps + ' · P' + c.place : '') + '</p>' +
            '<div class="acts"><button type="button" class="go" data-act="resume">Resume<kbd>P</kbd></button><button type="button" data-act="restart">Restart race<kbd>R</kbd></button><button type="button" data-act="quit">Quit to the demo</button></div>' +
            '<div class="grp">' + seg('cam', 'Camera', camOpts(), P.cam || 'chase') + seg('pro', 'Aids', [['0', 'On'], ['1', 'Pro']], P.pro ? '1' : '0') + seg('gearbox', 'Gears', [['auto', 'Auto'], ['manual', 'Manual']], P.gearbox === 'manual' ? 'manual' : 'auto') + '</div>' +
            '<div class="grp">' + seg('tones', 'Start tones', [['off', 'Off'], ['on', 'On']], P.tones ? 'on' : 'off') + (P.hapticsOk ? seg('haptics', 'Haptics', [['on', 'On'], ['off', 'Off']], P.haptics ? 'on' : 'off') : '') + '</div>' +
            '<div class="grp">' + slider('master', 'Master', (P.vol && P.vol.master != null ? P.vol.master : 1) * 100) + slider('engine', 'Engines', (P.vol && P.vol.engine != null ? P.vol.engine : 1) * 100) +
            slider('crowd', 'Crowd', (P.vol && P.vol.crowd != null ? P.vol.crowd : 1) * 100) + slider('click', 'Radio click', (P.vol && P.vol.click != null ? P.vol.click : 1) * 100) + '</div>' +
            '<div class="grp">' + slider('steer', 'Steering', ((P.steer != null ? P.steer : 1) - 0.5) * 100) + '</div>';
          var resume = function () { if (typeof data.onResume === 'function') data.onResume(); };
          var s = screenOf('gpsh', html, resume); H.scr = 'pause';
          wireSegs(s, function (name, v) { if (typeof data.onOption === 'function') data.onOption(name, name === 'steer' ? 0.5 + v : v); });
          s.querySelectorAll('[data-act]').forEach(function (b) {
            b.addEventListener('pointerdown', function (e) {
              stop(e); var a = b.getAttribute('data-act');
              if (a === 'resume') resume(); else if (a === 'restart' && typeof data.onRestart === 'function') data.onRestart(); else if (a === 'quit' && typeof data.onQuit === 'function') data.onQuit();
            });
          });
          return { el: s, go: resume, pick: function () {}, get: function () { return {}; }, key: function (code) { if (code === 'KeyR' && typeof data.onRestart === 'function') { data.onRestart(); return true; } return false; } };
        }
        // the results (X27): the bar over the harbour; RACE AGAIN, WATCH THE MOMENT; the full classification on a tap
        function resultsScreen(data) {
          var rows = data.rows || [], you = data.you, st = data.state, me = rows.filter(function (r) { return r.n === you; })[0], R0 = data.report || {};
          var fastT = Infinity; rows.forEach(function (r) { if (r.best != null && r.best < fastT) fastT = r.best; });
          var full = false;
          function table() {
            var many = full ? rows.length : 3, show = rows.slice(0, many);
            if (!full && me) { var at = rows.indexOf(me); for (var k = max(many, at - 1); k <= min(rows.length - 1, at + 1); k++) { if (k === many && k > 0 && show.length && rows.indexOf(show[show.length - 1]) !== k - 1) show.push(null); if (show.indexOf(rows[k]) < 0) show.push(rows[k]); } }
            return '<table>' + show.map(function (r) {
              if (!r) return '<tr><td colspan="7" style="opacity:.4;text-align:center;padding:0">&middot;&middot;&middot;</td></tr>';
              var t = r.pos === 1 ? (r.time != null ? clock(r.time) : '') : typeof r.gap === 'number' ? '+' + r.gap.toFixed(3) : esc(r.gap);
              return '<tr' + (r.n === you ? ' class="me"' : '') + '><td class="n">' + r.pos + '</td><td class="c"><i style="background:' + esc(r.color) + '"></i></td><td>' + esc(r.name) + (r.n === you && data.youTag ? ' <small style="opacity:.65">' + esc(data.youTag) + '</small>' : '') + '</td><td class="tm">' + esc(r.teamName || '') + '</td>' +
                '<td class="t">' + t + '</td><td class="b' + (r.best != null && r.best === fastT ? ' fast' : '') + '">' + (r.best != null ? clock(r.best) : '') + (r.n === you && data.aids ? ' <small>' + (data.aids === 'pro' ? 'PRO' : 'AIDS') + '</small>' : '') + '</td><td class="p">' + (r.penalty ? '+' + r.penalty + ' s' : '') + '</td></tr>';
            }).join('') + '</table>';
          }
          var classified = me && me.status !== 'fin';
          var head = me ? (classified ? 'RACE OVER · CLASSIFIED P' + me.pos : 'P' + me.pos) : (rows[0] ? String(rows[0].name).toUpperCase() + ' WINS' : 'THE RACE IS OVER');
          var gained = me && data.grid ? data.grid - me.pos : null;
          var small = me && !classified && data.grid ? '· FROM P' + data.grid + (gained ? ' · ' + (gained > 0 ? '+' : MINUS) + abs(gained) : '') : '';
          var facts = me ? [me.status === 'fin' ? clock(me.time) + (me.penalty ? ' (+' + me.penalty + ' s)' : '') : '', me.best != null ? 'best lap ' + clock(me.best) + (data.pb ? '<em class="pb">PB</em>' : '') + '<em>' + (data.aids === 'pro' ? 'PRO' : 'AIDS') + '</em>' : ''].filter(Boolean).join(' · ') : '';
          var facts2 = me ? ['EARNED PASSES ' + (R0.earned != null ? R0.earned : R0.passes != null ? R0.passes : 0), (R0.contacts || 0) + (R0.strikes || 0) === 0 ? 'CLEAN' : [R0.contacts ? R0.contacts + ' CONTACT' + (R0.contacts > 1 ? 'S' : '') : '', R0.strikes ? R0.strikes + ' STRIKE' + (R0.strikes > 1 ? 'S' : '') : ''].filter(Boolean).join(' · ')].join(' · ') : '';
          var note = st && st.assisted && you >= 0 ? '<div class="note">Test controls were used: this run is not counted.</div>' : '';
          var html = '<div class="hd"><h1>' + esc(head) + (small ? '<small>' + esc(small) + '</small>' : '') + '</h1></div>' + (facts ? '<p class="facts">' + facts + '</p>' : '') + (facts2 ? '<p class="facts">' + esc(facts2) + '</p>' : '') +
            '<div class="tbl">' + table() + '</div><button type="button" class="more">Full results</button>' + note +
            '<div class="acts"><button type="button" class="go" data-act="again">Race again<kbd class="gpkeys">Enter</kbd></button>' + (data.moment ? '<button type="button" data-act="moment">Watch the moment<kbd class="gpkeys">M</kbd></button>' : '') + '</div>';
          var go = function () { if (typeof data.onGo === 'function') data.onGo(); };
          var s = screenOf('bar gpr', html, null); H.scr = 'results'; if (root && root.classList) root.classList.add('gpres');
          s.querySelector('[data-act="again"]').addEventListener('pointerdown', function (e) { stop(e); go(); });
          var mb = s.querySelector('[data-act="moment"]'); if (mb) mb.addEventListener('pointerdown', function (e) { stop(e); if (typeof data.onMoment === 'function') data.onMoment(); });
          var more = s.querySelector('.more');
          more.addEventListener('pointerdown', function (e) { stop(e); full = !full; s.querySelector('.tbl').innerHTML = table(); more.textContent = full ? 'Fewer' : 'Full results'; if (typeof data.onTouch === 'function') data.onTouch(); });
          return { el: s, go: go, pick: function () {}, get: function () { return { full: full }; }, key: function (code) { if (code === 'KeyM' && data.moment && typeof data.onMoment === 'function') { data.onMoment(); return true; } return false; } };
        }
        function screen(name, data) {
          data = data || {};
          if (!name) { hideScreen(); return null; }
          var h = name === 'start' ? startScreen(data) : name === 'pause' ? pauseScreen(data) : name === 'seat' ? seatScreen(data) : name === 'results' ? resultsScreen(data) : (hideScreen(), null);
          SCR = h; return h;
        }
        function dispose() {
          hideScreen();
          if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
          if (css.parentNode) css.parentNode.removeChild(css);
          if (tpad && TB) { tpad.innerHTML = ''; tpad.classList.remove('rows'); TB = null; }
        }
        // (for the tests: every fixed box's and visible text's rectangle, in CSS pixels)
        function rects() {
          function R(e) { var r = e.getBoundingClientRect(), cs = win.getComputedStyle(e); return { x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), on: cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05 && r.width > 0, fs: parseFloat(cs.fontSize) }; }
          var o = { pos: R(bPos), lap: R(bLap), tower: R(tower), gap: R(gap), dash: R(dash), rc: R(rc), hold: R(holdEl), rx: R(rxEl), radio: R(radEl), ia: R(iaEl), ib: R(ibEl), cap: R(capEl), lights: R(lightsEl), line: R(lineEl), nx: R(nx) };
          var tr = tower.querySelectorAll('.row'), fsMin = 99; tr.forEach(function (r) { if (!r.classList.contains('hid')) fsMin = min(fsMin, parseFloat(win.getComputedStyle(r).fontSize)); }); o.towerFont = fsMin;
          return o;
        }
        return {
          update: update, event: event, screen: screen, lights: setLights, touch: touch, dispose: dispose, build: build,
          show: function (on) { show(!!on); },
          caption: caption, reaction: reaction, raceControl: raceControl, radioPool: radioPool, brakes: brakes, tunnels: tunnels,
          radio: function () { return RADIO; }, rects: rects,
          state: function () {
            return { show: H.show, screen: H.scr, lights: H.lights, tower: towerRowsEl.querySelectorAll('.row:not(.hid)').length, transient: { now: H.tnow, max: H.tmax, list: H.tlist.slice() },
              radio: RADIO.state(), rc: H.rcT > 0 ? H.rcText : null, rx: H.rxT > 0 ? H.rxText : null, cap: H.capT > 0 ? H.capText : null, hold: H.hold, lap: Q.lapB.textContent, lapLabel: Q.lapS.textContent,
              pos: Q.posB.textContent, line: H.lnText || '', gap: Q.gapLn.textContent, plan: H.gapPlan || '', ia: iaEl.classList.contains('on') ? iaEl.textContent : null, ib: ibEl.classList.contains('on') ? ibEl.textContent : null,
              aids: Q.as.textContent, flap: Q.fl.textContent, built: H.built, sector: H.sfT > 0 ? H.sfTxt : null };
          },
        };
      }

      return { hud: hud, radio: radio, PIT: PIT, intent: intent, intentText: intentText, RAD: RAD };
    })();
