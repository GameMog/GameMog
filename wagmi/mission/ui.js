// Mog City: the mission overlays, the GTA way. The shared style: Barlow Condensed, white with a soft dark shadow,
// accent yellow #FFC93C (places, objectives), green #4ADE80 (objects), red #EF4444 (enemies, danger), blue #6CB8FF
// (friends, Dan's car), acid green #B6FF3B (the Suits, Mr. Big); panels rgba(8,10,14,0.62), 10 px corners.
//   cine(on)                    letterbox bars in, the city's HUD out (and back)
//   gameTitle(on) · title(act, name) · place(name, sub) · caption(name, role, colour)
//   sub(speaker, text, colour) / sub(null)       subtitles (the objective line; above the bar in a cutscene)
//   objective(parts) / objective(null)           parts: ['Get in your ', { car: 'blue' }, '.']; kept in the tracker
//                                                (over the radar) until the next one. The route with it: gps.objective
//   brief(on) · recent()                         [B]: the tracker opened on the last lines; what the pause menu shows
//   pause                                        the pause menu (mission/pause.js: Esc or P), installed with the UI
//   help(text, secs)                             top-left; [F] draws a key cap, [F|TAKE PHONE] one that reads TAKE PHONE
//                                                on a phone (data-touch-as, wagmi/touch.js; never a " in the name)
//   skip(k)                                      'Hold SPACE to skip' with its ring (k 0..1, null hides)
//   phone.show(screen, data) / phone.hide()      feed, incoming, video, ended, tracker
//   caller(name, colour, status) / caller(null) · dm(from, text) · counter(label, value) / counter(null)
//   passed({ title, stats, reward, note }) · ko()
//   failed(reason, { skip, tip, retryLabel, skipLabel, quitLabel }) -> Promise<'retry'|'quit'|'skip'>   the reason, a
//                                                TIP (objective-style parts, key caps and all) and the choices, each label
//                                                'Main: sub' ('Retry: the tail': RETRY big, 'the tail' small under it)
//   fade(to, secs) · gate({ when, onStart, hold, fine }) -> Promise (up once when() is true; any key or a click starts. Over
//                                                the instant title, index.html: up at once in its place, a start
//                                                taken before when() is true kept, resolving the moment it is;
//                                                hold() -> Promise: 'Starting…' kept until that settles too)
//   bootOff()                                    the boot veil (index.html: the key art until the gate is up) away
//   story(on)                                    story mode: the sandbox's toolbar, telemetry, credit pill put away
//   call(on, name) · callTalk(level)             the video call's frame over Mr. Big's study (mission/mrbig.js draws it)
//   step(id)                                     a new step ('m2:tail'): the one source of truth for what is asked of
//                                                him. The help kept for the brief and the pause menu starts over with it
//                                                (an older step's how-to never shows again), the lines said start over
//                                                with a new mission. Instructions follow his mode too: an objective that
//                                                asks him into his car gives way to the step's own once he is in it, a
//                                                help about getting out goes when he is on foot (and getting in, in the car)
//   holdAct({ label, secs }) -> { step(dt, d) }  a hold-F interaction: the ring (with its key) from `show` m off, the hold
//                                                counting within `reach` m; step() true once held through
//   offer({ title, note, options: [{ key, label, run }] }) / offer(null)   a small prompt of real help (top left), its
//                                                options on the number keys (held off the city's own while it is up)
import { createPause } from './pause.js';
import { janePortrait } from './jane.js';
export const COLORS = { yellow: '#FFC93C', green: '#4ADE80', red: '#EF4444', blue: '#6CB8FF', acid: '#B6FF3B', white: '#FFFFFF' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CSS = `
#wg { position: fixed; inset: 0; pointer-events: none; z-index: 30; font-family: 'Barlow Condensed', system-ui, sans-serif; color: #fff; --bar: min(11vh, 9.5vw); }
#wg * { box-sizing: border-box; }
#wg .sh, #wg .wg-sub, #wg .wg-obj, #wg .wg-title, #wg .wg-place, #wg .wg-cap { text-shadow: 0 2px 10px rgba(0,0,0,.55), 0 1px 2px rgba(0,0,0,.85); }
.wg-bar { position: absolute; left: 0; right: 0; height: var(--bar); background: #000; transition: transform .5s cubic-bezier(.2,.7,.2,1); z-index: 1; }
.wg-bar.top { top: 0; transform: translateY(-101%); } .wg-bar.bot { bottom: 0; transform: translateY(101%); }
body.wg-cine .wg-bar { transform: none; }
body.wg-cine .hud, body.wg-cine #touch-controls, body.wg-gating .hud { opacity: 0 !important; visibility: hidden; transition: opacity .3s, visibility 0s .3s; }
body.wg-gating .hud, body.wg-gating #touch-controls { transition: none !important; }
body .hud { transition: opacity .5s; }
body.wg-hidehint #hud-controls-hint { opacity: 0 !important; }
.wg-fade { position: absolute; inset: 0; background: #000; opacity: 0; transition: opacity .6s; z-index: 20; }

.wg-gtitle { position: absolute; left: 0; right: 0; top: 20%; text-align: center; opacity: 0; transform: scale(1.04); transition: opacity 1.2s, transform 7s cubic-bezier(.1,.6,.2,1); z-index: 3; pointer-events: none; }
.wg-gtitle.on { opacity: 1; transform: scale(1); }
.wg-gtitle.now { transition: none; }
.wg-gtitle .logo { position: relative; font: italic 800 clamp(52px, 10vw, 136px)/0.9 'Barlow Condensed', system-ui; letter-spacing: 1px; white-space: nowrap; }
.wg-gtitle .logo b { color: #FFC93C; font-weight: 800; }
.wg-gtitle .tag { display: inline-block; margin-top: 12px; padding: 7px 18px 6px; font: 700 clamp(13px, 1.5vw, 19px)/1 'Barlow Condensed'; letter-spacing: clamp(3px, .5vw, 6px); text-transform: uppercase; color: #fff;
  background: radial-gradient(closest-side, rgba(6,8,12,.62), rgba(6,8,12,.38) 70%, rgba(6,8,12,0)); text-shadow: 0 1px 3px rgba(0,0,0,.8); }
.wg-gtitle .rule { width: 140px; height: 3px; background: #FFC93C; margin: 14px auto 0; }
/* (the lockup letter by letter, as index.html's instant title draws it (#wg-boot, where it is told): the same boxes,
   kerning, shadow layer and glint, and the same arrival under .on (wgG_* here, its wgT_*). Over the instant title the
   gate's takes the boot's clock (gate(): syncTitle), so it neither jumps nor plays twice; without it, it arrives as the
   title did. .punch: a start (the logo punched, the glint across CITY). .out: blown out toward the lens over the
   trailer's black (gameTitle), above it, in under 0.5 s) */
.wg-gtitle .logo::before { content: attr(data-t); content: attr(data-t) / ""; position: absolute; left: 0; right: 0; top: 0; color: transparent; text-shadow: 0 6px 30px rgba(0,0,0,.55), 0 2px 4px rgba(0,0,0,.4); }
.wg-gtitle .logo span, .wg-gtitle .logo b, .wg-gtitle .tag, .wg-gtitle .tag span { display: inline-block; position: relative; }
.wg-gtitle .logo .k { margin-left: -.0171em; } .wg-gtitle .tag .k { margin-left: -.007em; }
.wg-gtitle .logo .g { position: absolute; left: 0; top: -.25em; width: .75em; height: 1.4em; overflow: hidden; font-style: inherit; transform-origin: 0 0; transform: translateX(-.9em) skewX(-18deg); transition: opacity .08s .03s;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 42%, #000 58%, transparent); mask-image: linear-gradient(90deg, transparent, #000 42%, #000 58%, transparent); }
.wg-gtitle .logo .g > i { position: absolute; left: 0; top: 0; padding-top: .25em; font-style: inherit; transform-origin: 0 0; transform: skewX(18deg) translateX(.9em); color: #FFF6DC; text-shadow: 0 0 .12em rgba(255,214,120,.85); }
.wg-gtitle.on .logo::before { animation: wgG_fade .5s .42s backwards; }
.wg-gtitle.on .logo > span { animation: wgG_slam .38s calc((var(--x) + 5) * 60ms) backwards; }
.wg-gtitle.on .logo > b { transform-origin: 10% 58%; animation: wgG_land .46s .3s backwards; }
.wg-gtitle.on .logo .g { animation: wgG_glint 4.6s .6s infinite both; } .wg-gtitle.on .logo .g > i { animation: wgG_glintIn 4.6s .6s infinite both; }
.wg-gtitle.on .rule { animation: wgG_rule .52s .52s cubic-bezier(.2,.7,.2,1) backwards; }
.wg-gtitle.on .tag { animation: wgG_fade .5s .64s backwards; }
.wg-gtitle.on .tag > span { animation: wgG_track .7s .64s cubic-bezier(.16,.7,.2,1) backwards; }
.wg-gtitle.punch .logo { animation: wgG_punch .36s backwards; }
.wg-gtitle.punch .logo .g { animation: wgG_shing .5s cubic-bezier(.4,0,.25,1) backwards; } .wg-gtitle.punch .logo .g > i { animation: wgG_shingIn .5s cubic-bezier(.4,0,.25,1) backwards; }
html.wg-t:not(.wg-type) .wg-gtitle, html.wg-t:not(.wg-type) .wg-gtitle *, html.wg-t:not(.wg-type) .wg-gtitle .logo::before, html.wg-t:not(.wg-type) .wg-gate .go > span, html.wg-t:not(.wg-type) .wg-gate .fine { animation-play-state: paused !important; }
.wg-gtitle.out { opacity: 1; transform: none; transition: none; z-index: 5; }
/* (one push through the lens: the whole logo drawn toward the camera (x1.15, from the first frame, gathering speed) and
   each letter in it pushed out from the middle as far as it grows, as a camera moving through the word would: a letter
   --x from the middle is about .44em of its own from it, so x2.4 is .62em a step further out; the outer ones a hair
   first (12 ms a step), so none overtakes its neighbour on the way out and the word goes as one. The logo's own punch
   gives way to the push) */
.wg-gtitle.out .logo { animation: wgG_push .46s cubic-bezier(.5,0,.8,.4) both; }
.wg-gtitle.out .logo > span, .wg-gtitle.out .logo > b > span { animation: wgG_out .3s calc(60ms + (5 - max(var(--x), var(--x) * -1)) * 12ms) cubic-bezier(.5,0,.75,.3) both; }
.wg-gtitle.out .tag > span { animation: wgG_out2 .26s calc(60ms + (9 - max(var(--x), var(--x) * -1)) * 8ms) cubic-bezier(.5,0,.75,.3) both; }
.wg-gtitle.out .tag, .wg-gtitle.out .logo::before { animation: wgG_gone .22s .06s both; }
.wg-gtitle.out .rule { animation: wgG_shut .16s .04s cubic-bezier(.6,0,.9,.5) both; }
.wg-gtitle.out .logo .g { opacity: 0; }
@keyframes wgG_fade { from { opacity: 0; } }
@keyframes wgG_slam { 0% { opacity: 0; transform: scale(1.34); animation-timing-function: cubic-bezier(.2,.6,.35,1); } 30% { opacity: 1; } 60% { transform: scale(.982); animation-timing-function: cubic-bezier(.4,0,.4,1); } 100% { opacity: 1; transform: none; } }
@keyframes wgG_land { 0% { opacity: 0; transform: scale(1.45); animation-timing-function: cubic-bezier(.2,.6,.3,1); } 28% { opacity: 1; } 62% { transform: scale(.975); animation-timing-function: cubic-bezier(.4,0,.4,1); } 100% { opacity: 1; transform: none; } }
@media (max-width: 340px) { .wg-gtitle.on .logo > b { animation-name: wgG_landN; } }
@keyframes wgG_landN { 0% { opacity: 0; transform: scale(1.2); animation-timing-function: cubic-bezier(.2,.6,.3,1); } 28% { opacity: 1; } 62% { transform: scale(.975); animation-timing-function: cubic-bezier(.4,0,.4,1); } 100% { opacity: 1; transform: none; } }
@keyframes wgG_rule { from { transform: scaleX(0); } }
@keyframes wgG_track { 0% { opacity: 0; transform: translateX(calc(var(--x) * .3em)); } 55% { opacity: 1; } 100% { opacity: 1; transform: none; } }
@keyframes wgG_glint { 0% { transform: translateX(-.9em) skewX(-18deg); animation-timing-function: cubic-bezier(.45,.05,.35,1); } 13%, 100% { transform: translateX(3.3em) skewX(-18deg); } }
@keyframes wgG_glintIn { 0% { transform: skewX(18deg) translateX(.9em); animation-timing-function: cubic-bezier(.45,.05,.35,1); } 13%, 100% { transform: skewX(18deg) translateX(-3.3em); } }
@keyframes wgG_shing { from { transform: translateX(-.9em) skewX(-18deg); } to { transform: translateX(3.3em) skewX(-18deg); } }
@keyframes wgG_shingIn { from { transform: skewX(18deg) translateX(.9em); } to { transform: skewX(18deg) translateX(-3.3em); } }
@keyframes wgG_punch { 0% { transform: none; animation-timing-function: cubic-bezier(.2,.8,.3,1); } 24% { transform: scale(1.065); animation-timing-function: cubic-bezier(.4,0,.3,1); } 100% { transform: none; } }
@keyframes wgG_push { to { transform: scale(1.15); } }
@keyframes wgG_out { to { opacity: 0; transform: translateX(calc(var(--x) * .62em)) scale(2.4); } }
@keyframes wgG_out2 { to { opacity: 0; transform: translateX(calc(var(--x) * .66em)) scale(1.8); } }
@keyframes wgG_gone { to { opacity: 0; } }
@keyframes wgG_shut { from { transform: scaleX(1); } to { transform: scaleX(0); } }
/* (asked for less motion: the lockup only faded in and out, the line after it; no glint, no punch; the fades' own
   durations kept against css/style.css's every-animation-to-0.01ms) */
@media (prefers-reduced-motion: reduce) {
  .wg-gtitle.on { animation: wgG_fade .7s backwards; animation-duration: .7s !important; }
  .wg-gtitle *, .wg-gtitle .logo::before { animation: none !important; }
  .wg-gtitle .logo .g { display: none; }
  .wg-gtitle.out { animation: wgG_gone .3s both; animation-duration: .3s !important; }
}

.wg-title { position: absolute; left: 0; right: 0; top: 64%; transform: translateY(-50%); text-align: center; z-index: 3; }
.wg-title .act { font: 700 18px/1 'Barlow Condensed'; letter-spacing: 3px; color: #FFC93C; text-transform: uppercase; opacity: 0; transform: translateY(8px); transition: opacity .4s, transform .5s; }
.wg-title .name { font: italic 800 64px/1.05 'Barlow Condensed'; letter-spacing: 1px; text-transform: uppercase; opacity: 0; transform: translateY(10px); transition: opacity .4s .1s, transform .6s .1s cubic-bezier(.2,.7,.2,1); }
.wg-title.on .act, .wg-title.on .name { opacity: 1; transform: none; }
.wg-title.out .act, .wg-title.out .name { opacity: 0; transition: opacity .6s; }

.wg-place { position: absolute; right: 26px; bottom: 236px; text-align: right; opacity: 0; transform: translateX(14px); transition: opacity .5s, transform .6s; z-index: 3; }
body.wg-cine .wg-place { bottom: calc(var(--bar) + 3.2vh); }
.wg-place.on { opacity: 1; transform: none; }
.wg-place .n { font: italic 700 30px/1 'Barlow Condensed'; }
.wg-place .s { margin-top: 6px; font: 700 13px/1 'Barlow Condensed'; letter-spacing: 3px; color: #FFC93C; text-transform: uppercase; }

.wg-cap { position: absolute; left: 5vw; bottom: calc(var(--bar) + 10vh); opacity: 0; transform: translateX(-18px); transition: opacity .35s, transform .5s cubic-bezier(.2,.7,.2,1); z-index: 3; border-left: 4px solid var(--c, #fff); padding: 2px 0 2px 14px; }
.wg-cap.on { opacity: 1; transform: none; }
.wg-cap .n { font: italic 800 54px/0.95 'Barlow Condensed'; text-transform: uppercase; letter-spacing: 1px; }
.wg-cap .r { margin-top: 6px; font: 700 15px/1 'Barlow Condensed'; letter-spacing: 3px; text-transform: uppercase; color: var(--c, #fff); }

/* (wrapped at about half the screen: a long line never reaches the speed panel or the radar) */
.wg-line { position: absolute; left: 50%; bottom: 158px; transform: translateX(-50%); width: min(max(52vw, 320px), 820px, calc(100vw - 32px)); text-align: center; z-index: 4; }
body.wg-cine .wg-line { bottom: calc(var(--bar) + 2.4vh); }
/* (down between the radar and the speed panel, each 308 px out from its edge at most: kept 24 px clear of both) */
body.wg-story:not(.wg-cine) .wg-line { bottom: 64px; width: clamp(280px, calc(100vw - 664px), 820px); }
/* story mode: the sandbox's controls and telemetry away (the Map stays; the credit link stays) */
body.wg-story .time-switch, body.wg-story #btn-teleport, body.wg-story #hud-toolbar .toolbar-divider, body.wg-story .brand-subtitle,
body.wg-story #camera-switch, body.wg-story #hud-controls-hint { display: none !important; }
body.wg-story.wg-onfoot .hud-bottom-right { display: none !important; }
/* (the credit pill too: the credit is on the start gate; the help box takes the corner, GTA's place for it) */
body.wg-story .hud-top-left { display: none !important; }
body.wg-story .wg-help { top: 20px; }
/* (a phone: under the toolbar, not over its Map and Pause) */
@media (max-width: 640px) { body.wg-story .wg-help { top: 80px; max-width: calc(100vw - 32px); left: 16px; } }
/* Mr. Big's video call, full frame between the bars */
/* (the study itself is drawn in 3D in place of the city's frame: mission/mrbig.js; this is the call's frame over it, cut
   in and out hard; nothing in the bottom 100 px, where the subtitles are) */
.wg-call { position: absolute; inset: 0; opacity: 0; z-index: 0; overflow: hidden; }
.wg-call.on { opacity: 1; }
.wg-call .scan { position: absolute; inset: 0; background: repeating-linear-gradient(0deg, rgba(255,255,255,.03) 0 1px, transparent 1px 4px); }
/* (no filters or blend modes on the full-frame insert: the city keeps drawing under it) */
.wg-call .vig { position: absolute; inset: 0; background: radial-gradient(80% 70% at 50% 45%, transparent 55%, rgba(0,0,0,.7)); }
/* (the caller's name on a panel of its own: his bookshelves run behind it) */
.wg-call .hd { position: absolute; left: 5vw; top: calc(var(--bar) + 3vh); padding: 10px 14px 11px; background: rgba(8,10,14,0.62); border-radius: 10px; font: 800 clamp(16px, 1.8vw, 24px)/1 'Barlow Condensed'; letter-spacing: 4px; color: #fff; }
.wg-call .hd small { display: block; margin-top: 6px; font: 600 clamp(11px, 1.1vw, 14px)/1 'Barlow Condensed'; letter-spacing: 2px; color: rgba(255,255,255,.55); }
.wg-call .hd small.vc { margin-top: 5px; font-weight: 700; letter-spacing: 4px; color: #B6FF3B; opacity: .85; }
.wg-call .rec { position: absolute; right: 5vw; top: calc(var(--bar) + 3vh); font: 700 clamp(12px, 1.2vw, 15px)/1 'Barlow Condensed'; letter-spacing: 3px; color: #B6FF3B; }
.wg-call .wave { position: absolute; right: 5vw; top: calc(var(--bar) + 3vh + 26px); height: 26px; display: flex; gap: 3px; align-items: center; }
.wg-call .wave i { display: block; width: 3px; border-radius: 2px; background: #B6FF3B; height: 26px; transform: scaleY(.1); transition: transform .08s; will-change: transform; }
.wg-call .frm { position: absolute; left: 3vw; right: 3vw; top: calc(var(--bar) + 1.6vh); bottom: calc(var(--bar) + 1.6vh); border: 1px solid rgba(255,255,255,.12); border-radius: 6px; }
.wg-sub, .wg-obj { font: 600 24px/1.25 'Barlow Condensed'; transition: opacity .25s; }
.wg-obj { font-size: 26px; }
.wg-sub b { font-weight: 700; letter-spacing: .5px; margin-right: 8px; }
.wg-obj.hide, .wg-sub.hide { opacity: 0; }

.wg-help { position: absolute; left: 20px; top: 92px; max-width: 360px; padding: 12px 16px; background: rgba(8,10,14,0.62); border-radius: 10px; font: 600 17px/1.3 'Barlow Condensed'; opacity: 0; transform: translateY(-6px); transition: opacity .3s, transform .3s; z-index: 4; backdrop-filter: blur(6px); }
.wg-help.on { opacity: 1; transform: none; }
#wg kbd { display: inline-block; min-width: 22px; padding: 0 6px; margin: 0 2px; border: 1px solid rgba(255,255,255,.55); border-radius: 5px; background: rgba(255,255,255,.12); font: 700 15px/20px 'Barlow Condensed'; text-align: center; }

.wg-skip { position: absolute; right: 3.2vw; bottom: calc(5.5vh - 11px); display: flex; align-items: center; gap: 10px; font: 600 14px/1 'Barlow Condensed'; letter-spacing: 1px; color: rgba(255,255,255,.6); opacity: 0; transition: opacity .4s; z-index: 5; }
.wg-skip.on { opacity: 1; }
.wg-skip svg { width: 22px; height: 22px; transform: rotate(-90deg); }
.wg-skip circle { fill: none; stroke-width: 3; }

.wg-hold { position: absolute; left: 50%; top: 58%; transform: translate(-50%, -50%); display: flex; align-items: center; gap: 10px; padding: 8px 14px 8px 10px; background: rgba(8,10,14,0.62); border-radius: 10px; font: 700 17px/1 'Barlow Condensed'; opacity: 0; transition: opacity .2s; z-index: 5; }
.wg-hold.on { opacity: 1; }
.wg-hold.far { opacity: .78; }
.wg-hold svg { width: 26px; height: 26px; transform: rotate(-90deg); }
.wg-hold circle { fill: none; stroke-width: 3.5; }
/* (the ring says what to do: the objective line under it would only say it twice) */
body.wg-holding #wg .wg-obj { opacity: 0 !important; }
.wg-offer { position: absolute; left: 20px; top: 92px; max-width: 380px; padding: 12px 14px 10px; background: rgba(8,10,14,0.72); border-radius: 10px; border-left: 3px solid #FFC93C;
  font: 600 17px/1.3 'Barlow Condensed'; opacity: 0; transform: translateY(-6px); transition: opacity .3s, transform .3s; z-index: 5; pointer-events: none; backdrop-filter: blur(6px); }
.wg-offer.on { opacity: 1; transform: none; pointer-events: auto; }
body.wg-story .wg-offer { top: 20px; }
body.wg-offering #wg .wg-help { opacity: 0 !important; }
.wg-offer .h { font: 700 12px/1 'Barlow Condensed'; letter-spacing: 2.5px; text-transform: uppercase; color: #FFC93C; margin-bottom: 6px; }
.wg-offer .n { margin-bottom: 6px; color: rgba(255,255,255,.88); }
.wg-offer button { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; margin: 4px 0 0; padding: 5px 8px 5px 4px; border: 0; border-radius: 7px; background: rgba(255,255,255,.05); color: #fff; font: 600 17px/1.2 'Barlow Condensed'; cursor: pointer; }
.wg-offer button:hover { background: rgba(255,201,60,.16); }
.wg-offer .x { margin-top: 6px; font: 600 13px/1 'Barlow Condensed'; color: rgba(255,255,255,.5); letter-spacing: 1px; }
.wg-ph-burner { position: absolute; inset: 0; background: linear-gradient(#1A2216, #0B0F09); padding: 20% 7% 0; font-family: 'Courier New', monospace; color: #B6FF3B; }
.wg-ph-burner .h { font: 700 13px/1 'Courier New', monospace; letter-spacing: 1px; opacity: .7; margin-bottom: 14px; }
.wg-ph-burner .m { font: 700 17px/1.35 'Courier New', monospace; padding: 10px 12px; border: 1px solid rgba(182,255,59,.4); border-radius: 6px; background: rgba(182,255,59,.06); white-space: pre-wrap; }
.wg-blur { position: absolute; top: 0; bottom: 0; right: 0; width: 62%; background: linear-gradient(to right, rgba(4,5,8,0), rgba(4,5,8,.42) 45%, rgba(4,5,8,.55)); opacity: 0; transition: opacity .5s; z-index: 2; }
/* (a shade, not a backdrop blur: the blur cost a tenth of the frame rate when the call came in) */
.wg-blur.on { opacity: 1; }
.wg-phone { position: absolute; right: 9vw; top: 50%; height: min(60vh, 600px); aspect-ratio: 9 / 19.2; transform: translate(0, -46%) rotate(2deg); opacity: 0; transition: opacity .45s, transform .55s cubic-bezier(.2,.7,.2,1); z-index: 3; }
.wg-phone.on { opacity: 1; transform: translate(0, -50%) rotate(0deg); }
.wg-phone .frame { position: absolute; inset: 0; border-radius: 13% / 6.2%; background: linear-gradient(145deg, #3a3d44, #121316 40%, #26282d); padding: 3.2%; box-shadow: 0 30px 80px rgba(0,0,0,.6), inset 0 0 0 1.5px rgba(255,255,255,.12); }
.wg-phone .screen { position: relative; width: 100%; height: 100%; border-radius: 10.5% / 5%; overflow: hidden; background: #0B0D12; }
.wg-phone .island { position: absolute; top: 1.6%; left: 50%; width: 30%; height: 3.4%; transform: translateX(-50%); background: #000; border-radius: 99px; z-index: 5; }
.wg-phone .status { position: absolute; top: 1.9%; left: 9%; right: 9%; display: flex; justify-content: space-between; font: 700 12px/1 system-ui; z-index: 4; }
.wg-ph-feed { position: absolute; inset: 0; padding: 18% 6% 6%; background: linear-gradient(#0E1118, #0A0C10); }
.wg-ph-feed .hd { font: 800 20px/1 'Barlow Condensed'; letter-spacing: .5px; margin-bottom: 4px; }
.wg-ph-feed .sub { font: 600 12px/1 'Barlow Condensed'; color: rgba(255,255,255,.5); letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px; }
.wg-ph-feed .c { display: flex; gap: 9px; padding: 9px 0; border-top: 1px solid rgba(255,255,255,.07); opacity: 0; transform: translateY(14px); transition: opacity .35s, transform .45s cubic-bezier(.2,.7,.2,1); }
.wg-ph-feed .c.on { opacity: 1; transform: none; }
.wg-ph-feed .av { flex: 0 0 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font: 800 13px/1 'Barlow Condensed'; color: #0A0C10; }
.wg-ph-feed .h { font: 700 14px/1.1 'Barlow Condensed'; color: rgba(255,255,255,.62); }
.wg-ph-feed .t { font: 600 17px/1.15 'Barlow Condensed'; margin-top: 2px; }
.wg-ph-feed .c.hot .t { color: #FF8A8A; }
.wg-ph-call { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; padding-top: 26%; background: radial-gradient(120% 70% at 50% 25%, #23262E, #07080A); }
.wg-ph-call .who { font: 800 30px/1 'Barlow Condensed'; letter-spacing: 1px; margin-top: 14px; }
.wg-ph-call .what { font: 600 14px/1 'Barlow Condensed'; color: rgba(255,255,255,.6); margin-top: 8px; letter-spacing: 1px; }
.wg-ph-call .pic { width: 34%; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle at 50% 38%, #3B3F48, #15171B); display: grid; place-items: center; font: 800 44px/1 'Barlow Condensed'; color: rgba(255,255,255,.5); animation: wgRing 1.1s infinite; }
.wg-ph-call .btns { position: absolute; bottom: 10%; left: 0; right: 0; display: flex; justify-content: space-around; }
.wg-ph-call .b { width: 22%; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; font: 800 12px/1 'Barlow Condensed'; }
.wg-ph-call .b.no { background: #EF4444; } .wg-ph-call .b.yes { background: #22C55E; animation: wgPulse .9s infinite; }
.wg-ph-call .b.yes.press { transform: scale(.86); animation: none; filter: brightness(1.3); transition: transform .12s; }
@keyframes wgRing { 0%,100% { box-shadow: 0 0 0 0 rgba(255,255,255,.18); } 50% { box-shadow: 0 0 0 14px rgba(255,255,255,0); } }
@keyframes wgPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
.wg-ph-video { position: absolute; inset: 0; background: #050507; }
.wg-ph-video svg.boss { position: absolute; inset: 0; width: 100%; height: 100%; }
.wg-ph-video .scan { position: absolute; inset: 0; background: repeating-linear-gradient(0deg, rgba(255,255,255,.035) 0 1px, transparent 1px 3px); mix-blend-mode: overlay; }
.wg-ph-video .label { position: absolute; top: 9%; left: 0; right: 0; text-align: center; font: 800 18px/1 'Barlow Condensed'; letter-spacing: 3px; }
.wg-ph-video .label small { display: block; font: 600 12px/1 'Barlow Condensed'; color: rgba(255,255,255,.55); letter-spacing: 1px; margin-top: 5px; }
.wg-ph-video .wave { position: absolute; left: 12%; right: 12%; bottom: 17%; height: 34px; display: flex; gap: 3px; align-items: center; justify-content: center; }
.wg-ph-video .wave i { display: block; width: 4px; border-radius: 2px; background: #B6FF3B; height: 3px; transition: height .08s; }
.wg-ph-video .vc { position: absolute; left: 0; right: 0; bottom: 27%; text-align: center; font: 700 11px/1 'Barlow Condensed'; letter-spacing: 3px; color: #B6FF3B; opacity: .8; }
.wg-ph-video .pip { position: absolute; right: 6%; bottom: 27%; width: 26%; aspect-ratio: 3 / 4; border-radius: 10px; background: linear-gradient(#2A2E36, #121419); border: 1px solid rgba(255,255,255,.2); overflow: hidden; }
.wg-ph-video .pip:after { content: ''; position: absolute; left: 22%; right: 22%; bottom: -10%; height: 70%; border-radius: 50% 50% 0 0; background: #07080A; box-shadow: 0 -38px 0 -14px #07080A; }
.wg-ph-video .end { position: absolute; bottom: 5%; left: 50%; transform: translateX(-50%); width: 18%; aspect-ratio: 1; border-radius: 50%; background: #EF4444; }
.wg-ph-video.glitch svg.boss { animation: wgGlitch .22s steps(2) infinite; }
@keyframes wgGlitch { 0% { transform: translate(0,0); filter: none; } 50% { transform: translate(1.5px,-1px); filter: hue-rotate(40deg) saturate(1.4); } 100% { transform: translate(-1px,1px); } }
.wg-ph-ended { position: absolute; inset: 0; display: grid; place-items: center; background: #07080A; font: 700 22px/1 'Barlow Condensed'; color: rgba(255,255,255,.7); letter-spacing: 2px; }
.wg-ph-tag { position: absolute; inset: 0; background: #0B1220; }
.wg-ph-tag .map { position: absolute; inset: 0; }
.wg-ph-tag .note { position: absolute; top: 9%; left: 5%; right: 5%; padding: 10px 12px; border-radius: 16px; background: rgba(30,34,44,.9); backdrop-filter: blur(8px); display: flex; gap: 10px; align-items: center; transform: translateY(-20px); opacity: 0; transition: transform .45s cubic-bezier(.2,.7,.2,1), opacity .3s; }
.wg-ph-tag .note.on { transform: none; opacity: 1; }
.wg-ph-tag .ic { flex: 0 0 34px; height: 34px; border-radius: 9px; background: #2F7FD8; display: grid; place-items: center; font-size: 19px; }
.wg-ph-tag .a { font: 700 13px/1.1 'Barlow Condensed'; color: rgba(255,255,255,.6); letter-spacing: 1px; text-transform: uppercase; }
.wg-ph-tag .b { font: 700 18px/1.1 'Barlow Condensed'; }

.wg-caller { position: absolute; right: 24px; bottom: 236px; display: flex; gap: 12px; align-items: center; padding: 10px 16px 10px 10px; background: rgba(8,10,14,0.62); border-radius: 10px; opacity: 0; transform: translateX(16px); transition: opacity .3s, transform .4s; z-index: 4; backdrop-filter: blur(6px); }
.wg-caller.on { opacity: 1; transform: none; }
.wg-caller .av { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; font: 800 22px/1 'Barlow Condensed'; color: #0A0C10; position: relative; overflow: hidden; }
/* (Jane calling: her face on the call, a little video tile, not a letter: jane.js) */
.wg-caller .av.cam { width: 66px; height: 88px; border-radius: 8px; box-shadow: 0 0 0 2px rgba(108,184,255,.55); }
.wg-caller .n { font: 800 20px/1 'Barlow Condensed'; letter-spacing: 1px; }
.wg-caller .s { font: 600 13px/1 'Barlow Condensed'; color: rgba(255,255,255,.6); margin-top: 4px; letter-spacing: 1px; }
.wg-dm { position: absolute; right: 24px; top: 88px; width: 330px; padding: 12px 14px; background: rgba(8,10,14,0.72); border-radius: 10px; opacity: 0; transform: translateY(-10px); transition: opacity .3s, transform .4s; z-index: 4; backdrop-filter: blur(6px); }
.wg-dm.on { opacity: 1; transform: none; }
.wg-dm .a { font: 700 13px/1 'Barlow Condensed'; letter-spacing: 2px; text-transform: uppercase; color: #6CB8FF; }
.wg-dm .b { font: 600 18px/1.2 'Barlow Condensed'; margin-top: 6px; }
.wg-count { position: absolute; right: 24px; bottom: 228px; text-align: right; opacity: 0; transition: opacity .3s; z-index: 4; }
.wg-count.on { opacity: 1; }
.wg-count .l { font: 700 14px/1 'Barlow Condensed'; letter-spacing: 3px; color: rgba(255,255,255,.75); }
.wg-count .v { font: 800 28px/1 'Barlow Condensed'; margin-top: 2px; }

.wg-big { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 8; opacity: 0; transition: opacity .5s; }
.wg-big.on { opacity: 1; }
.wg-big .h { font: italic 800 84px/1 'Barlow Condensed'; letter-spacing: 1px; text-shadow: 0 4px 24px rgba(0,0,0,.6); transform: scale(1.15); transition: transform .6s cubic-bezier(.2,.7,.2,1); }
.wg-big.on .h { transform: none; }
.wg-big .t { font: 700 34px/1.1 'Barlow Condensed'; margin-top: 6px; text-shadow: 0 2px 10px rgba(0,0,0,.6); }
.wg-big .stats { margin-top: 22px; min-width: 340px; padding: 14px 22px; background: rgba(8,10,14,0.62); border-radius: 10px; }
.wg-big .row { display: flex; justify-content: space-between; gap: 40px; font: 700 18px/1.7 'Barlow Condensed'; letter-spacing: 1px; }
.wg-big .row span:first-child { color: rgba(255,255,255,.7); letter-spacing: 2px; }
.wg-big .reward { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,.12); font: 800 26px/1.2 'Barlow Condensed'; color: #FFC93C; display: flex; justify-content: space-between; }
.wg-big .note { font: 600 15px/1.2 'Barlow Condensed'; color: rgba(255,255,255,.7); margin-top: 2px; text-align: right; }
.wg-big .why { font: 600 26px/1.2 'Barlow Condensed'; margin-top: 10px; }
.wg-big .choices { display: flex; gap: 14px; margin-top: 26px; pointer-events: auto; }
.wg-big button { font: 700 20px/1 'Barlow Condensed'; letter-spacing: 2px; text-transform: uppercase; color: #fff; padding: 12px 26px; border-radius: 10px; border: 1px solid rgba(255,255,255,.25); background: rgba(8,10,14,0.62); cursor: pointer; }
.wg-big button.sel, .wg-big button:hover { background: #FFC93C; color: #0A0C10; border-color: #FFC93C; }
/* (the fail screen's tip, and what each choice does, small under its name; not Episode 1's end card, episode.js) */
.wg-big:not(.wg-ep) .tip { margin-top: 12px; max-width: min(620px, calc(100vw - 32px)); padding: 10px 14px; background: rgba(8,10,14,.62); border-left: 3px solid #FFC93C; border-radius: 10px; font: 600 19px/1.3 'Barlow Condensed'; text-align: left; }
.wg-big:not(.wg-ep) .tip b { display: block; font: 700 12px/1 'Barlow Condensed'; letter-spacing: 2.5px; color: #FFC93C; margin-bottom: 5px; }
.wg-big:not(.wg-ep) .why { text-align: center; padding: 0 16px; }
.wg-big:not(.wg-ep) .choices { flex-wrap: wrap; justify-content: center; max-width: calc(100vw - 32px); }
.wg-big:not(.wg-ep) button small { display: block; margin-top: 5px; font: 600 14px/1.15 'Barlow Condensed'; letter-spacing: .5px; text-transform: none; opacity: .85; }
/* (while it is up the fight's own layer goes, its lesson card, prompts and arrows under the words, and a phone's stick) */
body.wg-failing #wf, body.wg-failing #touch-controls, body.wg-failing .touch-look-hint { opacity: 0 !important; visibility: hidden; transition: opacity .3s, visibility 0s .3s; }
body.wg-ko #canvas-container { filter: grayscale(.85) contrast(1.05); transition: filter .6s; }
#canvas-container { transition: filter .8s; }

.wg-gate { position: absolute; inset: 0; z-index: 2; pointer-events: auto; cursor: pointer; opacity: 0; transition: opacity .8s;
  background: radial-gradient(70% 55% at 50% 30%, rgba(255,170,60,.16), rgba(255,170,60,0) 70%), linear-gradient(rgba(5,6,9,.5), rgba(5,6,9,.18) 45%, rgba(5,6,9,.8)), #05060900; }
.wg-gate.on { opacity: 1; }
.wg-gate .go { position: absolute; left: 50%; top: 66%; transform: translateX(-50%); max-width: calc(100% - 32px); padding: 10px 26px; text-align: center; font: 700 clamp(13px, 2vw, 26px)/1.25 'Barlow Condensed'; letter-spacing: clamp(1px, .4vw, 5px); text-transform: uppercase; animation: wgBlink 1.6s ease-in-out infinite; text-shadow: 0 2px 10px rgba(0,0,0,.7);
  background: radial-gradient(closest-side, rgba(6,8,12,.55), rgba(6,8,12,0)); white-space: nowrap; }
@media (max-width: 560px) { .wg-gate .go { font-size: 4.3vw; padding: 8px 12px; top: 60%; } .wg-gate .fine { letter-spacing: 1px; } }
.wg-gate .fine { position: absolute; bottom: calc(var(--bar) + 2.6vh); left: 16px; right: 16px; text-align: center; font: 600 clamp(12px, 1.2vw, 15px)/1.5 'Barlow Condensed'; letter-spacing: 2px; color: rgba(255,255,255,.72); text-shadow: 0 1px 4px rgba(0,0,0,.8); }
@keyframes wgBlink { 0%,100% { opacity: .6; } 50% { opacity: 1; } }
/* (taking over from the instant title, index.html: at once, no fade; started before the city is ready: 'Starting…', calm) */
.wg-gate.now { transition: none; }
.wg-gate.wait .go { animation: none; opacity: .9; }
/* (its line and small print faded up after the lockup has arrived, as the instant title's: on its clock, gate()) */
.wg-gate.on .go > span, .wg-gate.on .fine { animation: wgG_fade .45s 1.15s backwards; }
@media (prefers-reduced-motion: reduce) { .wg-gate.on .go > span, .wg-gate.on .fine { animation: wgG_fade .5s .5s backwards; animation-duration: .5s !important; } }
/* (once it is in, a line shown again (a pad picked up or put down) is shown at once, not faded in from the start) */
.wg-gate.in .go > span, .wg-gate.in .fine { animation: none; }

/* the objective tracker: over the street signs and the radar (the city's HUD column, so it goes with it in a cutscene);
   [B] opens it into the brief: the objective, the last lines said, the last help */
.wg-track { order: -1; max-width: 288px; padding: 8px 12px 9px; background: rgba(8,10,14,0.62); border-radius: 10px; font-family: 'Barlow Condensed', system-ui, sans-serif; color: #fff; cursor: pointer; transition: opacity .3s; }
.wg-track.off { display: none; }
.wg-track .k { display: flex; justify-content: space-between; align-items: center; gap: 12px; font: 700 11px/1 'Barlow Condensed'; letter-spacing: 2.5px; text-transform: uppercase; color: #FFC93C; }
.wg-track .k kbd { font: 700 11px/16px 'Barlow Condensed'; min-width: 18px; padding: 0 5px; border: 1px solid rgba(255,255,255,.4); border-radius: 4px; color: rgba(255,255,255,.75); text-align: center; letter-spacing: 0; }
.wg-track .o { margin-top: 5px; font: 600 18px/1.2 'Barlow Condensed'; text-shadow: 0 1px 2px rgba(0,0,0,.85); }
.wg-track .o.none { color: rgba(255,255,255,.6); }
.wg-track .log { display: none; margin-top: 8px; padding-top: 7px; border-top: 1px solid rgba(255,255,255,.14); }
.wg-track.open .log { display: block; }
.wg-track .log .h { font: 700 11px/1 'Barlow Condensed'; letter-spacing: 2.5px; text-transform: uppercase; color: rgba(255,255,255,.55); margin: 2px 0 5px; }
.wg-track .log .l { font: 600 15px/1.25 'Barlow Condensed'; margin-bottom: 4px; }
.wg-track .log .l b { font-weight: 700; letter-spacing: .5px; margin-right: 6px; }
.wg-track .log .hp { font: 600 15px/1.25 'Barlow Condensed'; color: rgba(255,255,255,.85); }
.wg-track .log kbd, .wg-track .o kbd { display: inline-block; min-width: 18px; padding: 0 5px; margin: 0 2px; border: 1px solid rgba(255,255,255,.55); border-radius: 4px; background: rgba(255,255,255,.12); font: 700 13px/17px 'Barlow Condensed'; text-align: center; }

/* ---- on a phone (touch only: body.touch-enabled), upright or sideways. The zones are css/style.css's (--wg-l/r/t/b
   the safe edges, --wg-radar, --wg-toolbar, --wg-stick and --wg-pad the thumbs' zones sideways, --wg-thumbs their
   height upright): nothing here reaches under a thumb or the toolbar. The top band, sideways: the radar, then the help
   (or an offer, a DM, the tracker) beside it, then a call (or the radio's card) beside the toolbar; upright, the help
   and the rest go under the radar, a call under the toolbar. The objective and the subtitles: between the thumbs
   sideways, above them upright ---- */
body.touch-enabled #wg .wg-help, body.touch-enabled #wg .wg-offer, body.touch-enabled #wg .wg-dm {
  left: calc(var(--wg-l) + var(--wg-radar) + 16px); right: auto; top: var(--wg-t); padding: 10px 13px; font-size: 16px; width: auto;
  max-width: min(360px, calc(100vw - var(--wg-l) - var(--wg-radar) - 16px - var(--wg-r) - var(--wg-toolbar) - 8px)); }
/* (sideways: in the car the car's pills are a row under the toolbar, wagmi/touch.js; a call sits left of the toolbar) */
@media (orientation: landscape) {
  body.touch-enabled[data-mode='car'] #wg .wg-help, body.touch-enabled[data-mode='car'] #wg .wg-offer, body.touch-enabled[data-mode='car'] #wg .wg-dm {
    max-width: min(360px, calc(100vw - var(--wg-l) - var(--wg-radar) - 16px - var(--wg-r) - 248px)); }
  body.touch-enabled.wg-calling #wg .wg-help, body.touch-enabled.wg-calling #wg .wg-offer, body.touch-enabled.wg-calling #wg .wg-dm {
    max-width: min(360px, calc(100vw - var(--wg-l) - var(--wg-radar) - 16px - var(--wg-r) - var(--wg-toolbar) - 196px)); }
}
body.touch-enabled #wg .wg-dm .b { font-size: 16px; }
/* (a DM has the help's place while it is up) */
body.touch-enabled.wg-dmon #wg .wg-help { opacity: 0 !important; }
/* (an offer is tapped: its options side by side, finger-sized; scrolled rather than reaching the stick) */
body.touch-enabled #wg .wg-offer { display: flex; flex-wrap: wrap; gap: 6px; max-height: calc(100% - var(--wg-t) - var(--wg-stick) + 24px); overflow-y: auto; }
body.touch-enabled #wg .wg-offer .h, body.touch-enabled #wg .wg-offer .n { flex: 1 1 100%; margin-bottom: 0; }
body.touch-enabled #wg .wg-offer button { flex: 1 1 auto; width: auto; min-height: 44px; margin: 0; padding: 6px 12px 6px 8px; }
body.touch-enabled #wg .wg-offer .x { display: none; }
body.touch-enabled #wg .wg-offer kbd { display: none; }
body.touch-enabled #wg .wg-caller { right: calc(var(--wg-r) + var(--wg-toolbar)); top: var(--wg-t); bottom: auto; padding: 6px 12px 6px 6px; gap: 10px; transform: translateY(-8px); }
body.touch-enabled #wg .wg-caller.on { transform: none; }
body.touch-enabled #wg .wg-caller .av { width: 34px; height: 34px; font-size: 18px; }
body.touch-enabled #wg .wg-caller .av.cam { width: 33px; height: 44px; border-radius: 6px; }
body.touch-enabled #wg .wg-caller .n { font-size: 17px; }
body.touch-enabled #wg .wg-caller .s { font-size: 12px; margin-top: 3px; }
/* (a count, under the radar and the health bar; a place's name and M2's meters, in the middle of the top band) */
body.touch-enabled #wg .wg-count { left: var(--wg-l); right: auto; top: calc(var(--wg-t) + var(--wg-radar) + 24px); bottom: auto; text-align: left; display: flex; align-items: baseline; gap: 8px; }
body.touch-enabled #wg .wg-count .l { font-size: 13px; }
body.touch-enabled #wg .wg-count .v { font-size: 24px; margin: 0; }
body.touch-enabled:not(.wg-cine) #wg .wg-place { left: calc(var(--wg-l) + var(--wg-radar) + 16px); right: calc(var(--wg-r) + var(--wg-pad)); top: calc(var(--wg-t) + 100px); bottom: auto; text-align: center; }
body.touch-enabled:not(.wg-cine) #wg .wg-place .n { font-size: 26px; }
body.touch-enabled #wg .m2-tail, body.touch-enabled #wg .m2-target { left: calc(var(--wg-l) + var(--wg-radar) + 16px); right: calc(var(--wg-r) + var(--wg-pad)); top: calc(var(--wg-t) + 80px); bottom: auto; width: auto; max-width: 250px; margin: 0 auto; }
/* the line: between the thumbs, sideways (out of a cutscene: there, the buttons are away and it sits over the bar) */
body.touch-enabled:not(.wg-cine) #wg .wg-line { left: calc(var(--wg-l) + var(--wg-stick)); right: calc(var(--wg-r) + var(--wg-pad)); bottom: var(--wg-b); width: auto; max-width: 440px; margin: 0 auto; transform: none; }
body.touch-enabled #wg .wg-obj { font-size: 20px; line-height: 1.2; }
body.touch-enabled #wg .wg-sub { font-size: 19px; line-height: 1.2; }
body.touch-enabled.wg-cine #wg .wg-line { width: min(max(52vw, 320px), 820px, calc(100vw - var(--wg-l) - var(--wg-r))); }
body.touch-enabled.wg-cine #wg .wg-sub { font-size: 21px; }
/* (the safe edges for what sits by them; a cutscene's bars stay full width) */
body.touch-enabled #wg .wg-cap { left: max(5vw, var(--wg-l)); }
body.touch-enabled #wg .wg-skip { right: max(3.2vw, var(--wg-r)); bottom: max(calc(5.5vh - 11px), env(safe-area-inset-bottom)); }
body.touch-enabled #wg .wg-call .hd { left: max(5vw, var(--wg-l)); }
body.touch-enabled #wg .wg-call .rec, body.touch-enabled #wg .wg-call .wave { right: max(5vw, var(--wg-r)); }
body.touch-enabled #wg .wg-gate .go { font-size: 20px; letter-spacing: 3px; padding: 12px 26px; }
body.touch-enabled #wg .wg-gate .fine { left: var(--wg-l); right: var(--wg-r); bottom: calc(var(--bar) + 2.6vh + env(safe-area-inset-bottom)); }
body.touch-enabled #wg .wg-big { padding: var(--wg-t) var(--wg-r) var(--wg-b) var(--wg-l); }
body.touch-enabled #wg .wg-big .h { font-size: min(84px, 12.5vw) !important; text-align: center; }
body.touch-enabled #wg .wg-big .t { text-align: center; }
body.touch-enabled #wg .wg-big .stats { min-width: min(340px, 100%); }
/* (wider than 2:1, a phone on its side: thinner bars, so the picture between them isn't a strip) */
@media (min-aspect-ratio: 2/1) { body.touch-enabled #wg { --bar: min(6vh, 9.5vw); } }
@media (max-height: 500px) {
  body.touch-enabled #wg .wg-big .h { font-size: min(60px, 12.5vw) !important; }
  body.touch-enabled #wg .wg-big .t { font-size: 26px; }
  body.touch-enabled #wg .wg-big .stats { margin-top: 10px; padding: 8px 18px; }
  body.touch-enabled #wg .wg-big .row { line-height: 1.45; }
  body.touch-enabled #wg .wg-big .choices { margin-top: 14px; }
  body.touch-enabled #wg .wg-big:not(.wg-ep) .why { font-size: 22px; margin-top: 4px; }
  body.touch-enabled #wg .wg-big:not(.wg-ep) .tip { font-size: 16px; margin-top: 6px; padding: 6px 10px; }
  body.touch-enabled #wg .wg-big:not(.wg-ep) .choices { margin-top: 10px; gap: 10px; }
  body.touch-enabled #wg .wg-big:not(.wg-ep) button { padding: 9px 18px; min-height: 44px; }
  body.touch-enabled #wg .wg-big:not(.wg-ep) button small { margin-top: 3px; font-size: 13px; }
  body.touch-enabled #wg .wg-title .name { font-size: 48px; }
}
@media (orientation: portrait) {
  body.touch-enabled #wg .wg-help, body.touch-enabled #wg .wg-offer, body.touch-enabled #wg .wg-dm,
  body.touch-enabled.wg-calling #wg .wg-help, body.touch-enabled.wg-calling #wg .wg-offer, body.touch-enabled.wg-calling #wg .wg-dm {
    left: var(--wg-l); right: var(--wg-r); top: calc(var(--wg-t) + var(--wg-radar) + 24px); max-width: none; }
  body.touch-enabled #wg .wg-offer { max-height: calc(100% - var(--wg-t) - var(--wg-radar) - 24px - var(--wg-b) - var(--wg-thumbs) - 120px); }
  /* (in the car, the car's pills are a column down the right edge: wagmi/touch.js) */
  body.touch-enabled[data-mode='car'] #wg .wg-help, body.touch-enabled[data-mode='car'] #wg .wg-offer, body.touch-enabled[data-mode='car'] #wg .wg-dm,
  body.touch-enabled[data-mode='car']:not(.wg-cine) #wg .wg-place, body.touch-enabled[data-mode='car']:not(.wg-cine) #wg .wg-line { right: calc(var(--wg-r) + 128px); }
  body.touch-enabled #wg .wg-caller { right: var(--wg-r); top: calc(var(--wg-t) + 58px); }
  body.touch-enabled #wg .wg-count { left: auto; right: var(--wg-r); top: calc(var(--wg-t) + 58px); }
  body.touch-enabled.wg-calling #wg .wg-count { top: calc(var(--wg-t) + 120px); }
  body.touch-enabled:not(.wg-cine) #wg .wg-place { left: var(--wg-l); right: var(--wg-r); top: auto; bottom: calc(var(--wg-b) + var(--wg-thumbs) + 110px); }
  body.touch-enabled #wg .m2-tail, body.touch-enabled #wg .m2-target { left: var(--wg-l); right: var(--wg-r); top: auto; bottom: calc(var(--wg-b) + var(--wg-thumbs) + 110px); }
  body.touch-enabled:not(.wg-cine) #wg .wg-line { left: var(--wg-l); right: var(--wg-r); bottom: calc(var(--wg-b) + var(--wg-thumbs)); max-width: none; }
  body.touch-enabled #wg .wg-obj { font-size: 22px; }
  body.touch-enabled #wg .wg-sub { font-size: 21px; }
  body.touch-enabled #wg .wg-title .name { font-size: min(64px, 13vw); }
  body.touch-enabled #wg .wg-big .choices { flex-wrap: wrap; justify-content: center; }
  /* (the fail screen upright: the choices a column, one finger-sized button each, the tip as wide as the screen) */
  body.touch-enabled #wg .wg-big:not(.wg-ep) .tip { font-size: 17px; max-width: 100%; }
  body.touch-enabled #wg .wg-big:not(.wg-ep) .choices { flex-direction: column; align-items: stretch; width: min(340px, 100%); margin-top: 18px; gap: 10px; }
  body.touch-enabled #wg .wg-big:not(.wg-ep) button { min-height: 52px; padding: 10px 16px; }
}
`;

export function createUI() {
  if (!document.getElementById('wg-css')) { const st = document.createElement('style'); st.id = 'wg-css'; st.textContent = CSS; document.head.appendChild(st); }
  const root = document.createElement('div'); root.id = 'wg'; document.body.appendChild(root);
  const el = (cls, html = '', parent = root) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; parent.appendChild(d); return d; };
  const callEl = el('wg-call', `<div class="scan"></div><div class="vig"></div><div class="frm"></div>
    <div class="hd"><span class="nm">UNKNOWN</span><small>VIDEO CALL · <span class="clock">00:07</span></small><small class="vc">PRIVATE LINE</small></div><div class="rec">● LIVE</div><div class="wave">${'<i></i>'.repeat(16)}</div>`);
  const barT = el('wg-bar top'), barB = el('wg-bar bot');
  const fadeEl = el('wg-fade');
  // (the lockup's letters, a box each, as index.html's instant title has them: --x a letter's place from the middle, .k
  // a pair the face kerns (P-a), .g CITY's glint)
  const LET = (s, x0, k = []) => [...s].map((c, i) => (c === ' ' ? ' ' : `<span${k.includes(i) ? ' class="k"' : ''} style="--x:${x0 + i}">${c}</span>`)).join('');
  // (read once, as the name: role img with its name for a label, its letters (a box each) and shadow layer not read)
  const gTitle = el('wg-gtitle', `<div class="logo" aria-hidden="true" data-t="MOG CITY">${LET('MOG', -3)} <b>${LET('CITY', 1)}<i class="g" aria-hidden="true"><i>${[...'CITY'].map((c) => `<span>${c}</span>`).join('')}</i></i></b></div><div class="rule"></div><div class="tag" aria-hidden="true">${LET('Unfinished Business', -9, [1])}</div>`);
  gTitle.setAttribute('role', 'img'); gTitle.setAttribute('aria-label', 'MOG CITY: Unfinished Business');
  // (the instant title's lettering clock onto the gate's, by name (index.html's wgT_x, here wgG_x): its arrival, and a
  // punch it took, mid-way or done, so the gate's takes its place without a jump or a second arrival. Its arrival's parts
  // all start together (S): one done and gone (they don't hold their last frame, so the settled title paints as one) takes
  // S too; none of it left, the gate's are finished. Still held for its type (paused): left alone, both go on together)
  const syncTitle = (from, ...to) => {
    const st = {}, src = from?.getAnimations?.({ subtree: true }).filter((a) => (a.animationName || '').startsWith('wgT_')) || [];
    if (src.some((a) => a.playState === 'paused')) return;
    let S = null;
    for (const a of src) { const k = a.animationName.slice(4); if (a.startTime == null) continue; if (st[k] == null) st[k] = a.startTime; if (S == null && !/^(punch|shing)/.test(k)) S = a.startTime; }
    for (const e of to) for (const a of e.getAnimations({ subtree: true })) {
      const n = a.animationName || ''; if (!n.startsWith('wgG_')) continue;
      const s = st[n.slice(4)] ?? S; if (s != null) a.startTime = s; else if (a.effect?.getTiming().iterations !== Infinity) a.finish();
    }
  };
  // (armed by a start on the gate: the next take-down at once (the trailer's black over it, trailer.js cover()) blows the
  // lettering out instead of cutting it)
  let blowOut = false;
  const titleEl = el('wg-title', `<div class="act"></div><div class="name"></div>`);
  const placeEl = el('wg-place', `<div class="n"></div><div class="s"></div>`);
  const capEl = el('wg-cap', `<div class="n"></div><div class="r"></div>`);
  const line = el('wg-line', `<div class="wg-obj hide"></div><div class="wg-sub hide"></div>`);
  const objEl = line.querySelector('.wg-obj'), subEl = line.querySelector('.wg-sub');
  const helpEl = el('wg-help');
  const skipEl = el('wg-skip', `<span>Hold <kbd>SPACE</kbd> to skip</span><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,.25)"/><circle class="p" cx="12" cy="12" r="9" stroke="#FFC93C" stroke-dasharray="56.5" stroke-dashoffset="56.5"/></svg>`);
  const blurEl = el('wg-blur');
  const phoneEl = el('wg-phone', `<div class="frame"><div class="screen"><div class="island"></div><div class="status"><span>5:45</span><span>5G ▮▮▮</span></div><div class="content"></div></div></div>`);
  const callerEl = el('wg-caller', `<div class="av"></div><div><div class="n"></div><div class="s"></div></div>`);
  // Jane's face in the caller's tile while she's on (her frames, jane.js): her mouth with her voice while her line is up
  // (the portrait follows her voice itself, every frame; asked here only whether the line on screen is hers)
  let cam = null;
  function callerCam(av) {
    if (!av) { if (cam) { cam.stop(); cam = null; callerEl.querySelector('.av').classList.remove('cam'); } return; }
    if (cam) return;
    const subB = () => document.querySelector('#wg .wg-sub:not(.hide) b');
    av.textContent = 'J'; av.classList.add('cam'); cam = janePortrait(av, { crop: 'face', speaking: () => /^jane/i.test(subB()?.textContent || '') });
  }
  const dmEl = el('wg-dm', `<div class="a"></div><div class="b"></div>`);
  const countEl = el('wg-count', `<div class="l"></div><div class="v"></div>`);
  const bigEl = el('wg-big');
  const holdEl = el('wg-hold', `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,.25)"/><circle class="p" cx="12" cy="12" r="9" stroke="#FFC93C" stroke-dasharray="56.5" stroke-dashoffset="56.5"/></svg><span></span>`);
  const offerEl = el('wg-offer');
  // (what is up, on the body, for a phone's layout: the help, a call and a DM each move what shares their place)
  const flag = (node, cls) => new MutationObserver(() => document.body.classList.toggle(cls, node.classList.contains('on'))).observe(node, { attributes: true, attributeFilter: ['class'] });
  flag(helpEl, 'wg-helpon'); flag(callerEl, 'wg-calling'); flag(dmEl, 'wg-dmon');

  const timers = new Map();
  const later = (key, ms, fn) => { clearTimeout(timers.get(key)); timers.set(key, setTimeout(fn, ms)); };
  // [F] a key cap; [F|TAKE PHONE] the same cap, named for a phone's button (wagmi/touch.js reads data-touch-as first;
  // not data-k: wagmi/pad.js's restore() deletes that). The input is escaped for & < > but not ", so never a " in a name
  const keycaps = (s) => esc(s).replace(/\[([^\]|]+)(?:\|([^\]]+))?\]/g, (_, k, t) => (t ? `<kbd data-touch-as="${t}">${k}</kbd>` : `<kbd>${k}</kbd>`));
  // objective parts: strings, and { noun: 'yellow' | 'red' | 'blue' | 'green' } for the one coloured noun
  const rich = (parts) => (Array.isArray(parts) ? parts : [parts]).map((p) => {
    if (typeof p === 'string') return keycaps(p);
    const [k, c] = Object.entries(p)[0]; return `<span style="color:${COLORS[c] || c}">${keycaps(k)}</span>`;
  }).join('');

  // the tracker: the objective kept on screen (the line above goes after a few seconds, this one doesn't), and what
  // was said and asked of him lately, for the brief ([B]) and the pause menu
  const trackEl = document.createElement('div'); trackEl.className = 'wg-track off';
  trackEl.innerHTML = `<div class="k"><span>Objective</span><kbd>B</kbd></div><div class="o"></div><div class="log"></div>`;
  (document.querySelector('.hud-bottom-left') || root).prepend(trackEl);
  const trackO = trackEl.querySelector('.o'), trackLog = trackEl.querySelector('.log');
  const said = [], helped = [];
  let trackHtml = null, trackText = '', briefT = 0;
  const plain = (parts) => (Array.isArray(parts) ? parts : [parts]).map((p) => (typeof p === 'string' ? p : Object.keys(p)[0])).join('');
  function track(parts) {
    trackHtml = parts ? rich(parts) : null; trackText = parts ? plain(parts) : '';
    trackO.innerHTML = trackHtml || 'No objective right now.'; trackO.classList.toggle('none', !trackHtml);
    trackEl.classList.toggle('off', !trackHtml && !trackEl.classList.contains('open'));
  }
  function drawLog() {
    const lines = said.slice(-5).map(([w, c, t]) => `<div class="l">${w ? `<b style="color:${c}">${esc(w.toUpperCase())}</b>` : ''}${esc(t)}</div>`).join('');
    const help = helped.slice(-1).map((h) => `<div class="hp">${h}</div>`).join('');
    trackLog.innerHTML = (lines ? `<div class="h">Lately</div>${lines}` : '') + (help ? `<div class="h" style="margin-top:8px">Help</div>${help}` : '') || '<div class="hp">Nothing said yet.</div>';
  }
  trackEl.addEventListener('click', () => ui.brief());

  let objHtml = null, subOn = false;
  // the step and his mode: what is asked of him follows both (see step() at the top)
  let stepId = null, base = null, baseSecs = 7, ask = false, askT = 0, helpMode = null;
  const askText = /^\s*get (back )?in(to)? (your|the|a) (car|vehicle)/i;
  const isCarAsk = (parts) => !!parts && askText.test(plain(parts));
  // (a help about the car's door: getting out is for the car, getting in is for on foot)
  const modeOf = (text) => { const s = plain(text); return /\bget out\b/i.test(s) ? 'car' : /\bget (back )?in(to)? (a|your|the) (car|vehicle)\b/i.test(s) ? 'foot' : null; };
  const modeNow = () => { const cm = window.WAGMI?.app?.controllerManager; return cm ? (cm.activeMode === 'car' ? 'car' : 'foot') : null; };
  let offerKeys = null;
  (function watch() {
    requestAnimationFrame(watch);
    const W = window.WAGMI; if (!W || W.paused) return;
    const m = modeNow(); if (!m) return;
    // in his car with an objective that asks him into it: the step's own objective back (or none)
    if (ask && m === 'car' && !W.cutscene) { if (!askT) askT = performance.now(); else if (performance.now() - askT > 450) ui.objective(base, baseSecs); } else askT = 0;
    if (helpMode && helpMode !== m && helpEl.classList.contains('on')) { helpEl.classList.remove('on'); helpMode = null; }
  })();
  const ui = {
    root, COLORS,
    cine(on) { document.body.classList.toggle('wg-cine', !!on); },
    // (never quite black: a canvas the browser stops drawing under an opaque cover costs a long frame to bring back)
    fade(to = 1, secs = 0.6) { fadeEl.style.transition = `opacity ${secs}s`; fadeEl.style.opacity = String(Math.min(to, 0.985)); return sleep(secs * 1000); },
    // (now: at once, no fade: a skip mustn't leave it over the game)
    // (the first time at once after a start on the gate: the letters blown out toward the lens over the trailer's black,
    // staggered from the edges in, the rule snapped shut, a whoosh and a deep boom, done in 0.5 s; .on goes at once, nothing
    // waits on it, and a second take-down meanwhile leaves it to finish)
    gameTitle(on, now = false) {
      if (!on && gTitle.classList.contains('out')) return;
      if (!on && now && blowOut && gTitle.classList.contains('on')) {
        blowOut = false; gTitle.classList.remove('on'); gTitle.classList.add('out');
        const S = window.WAGMI?.sfx; try { S?.play('whoosh', { gain: 0.4, dur: 0.5 }); S?.play('boom', { gain: 0.32, at: 0.1 }); } catch {}
        setTimeout(() => { gTitle.classList.add('now'); gTitle.classList.remove('out', 'punch'); void gTitle.offsetWidth; gTitle.classList.remove('now'); }, 520);
        return;
      }
      blowOut = false; gTitle.classList.remove('out');
      gTitle.classList.toggle('now', !!now); gTitle.classList.toggle('on', !!on); if (now) { void gTitle.offsetWidth; gTitle.classList.remove('now'); }
    },
    bootOff() { const b = document.getElementById('wg-boot'); if (!b) return; b.classList.add('off'); setTimeout(() => b.remove(), 900); },
    title(act, name, hold = 2.6) {
      window.mcStat?.('mission', name);
      titleEl.querySelector('.act').textContent = act || ''; titleEl.querySelector('.name').textContent = name || '';
      titleEl.classList.remove('out'); void titleEl.offsetWidth; titleEl.classList.add('on');
      later('title', (0.4 + hold) * 1000, () => { titleEl.classList.add('out'); later('title2', 700, () => titleEl.classList.remove('on', 'out')); });
    },
    titleOff() { titleEl.classList.remove('on', 'out'); },
    place(name, sub = '', secs = 3) {
      placeEl.querySelector('.n').textContent = name; placeEl.querySelector('.s').textContent = sub;
      placeEl.classList.add('on'); later('place', secs * 1000, () => placeEl.classList.remove('on'));
    },
    placeOff() { placeEl.classList.remove('on'); },
    caption(name, role = '', color = '#FFFFFF', secs = 2.8) {
      if (!name) { capEl.classList.remove('on'); return; }
      capEl.style.setProperty('--c', color);
      capEl.querySelector('.n').textContent = name; capEl.querySelector('.r').textContent = role;
      capEl.classList.remove('on'); void capEl.offsetWidth; capEl.classList.add('on');
      later('cap', secs * 1000, () => capEl.classList.remove('on'));
    },
    // the objective line: a subtitle takes it while someone speaks, the objective waits for the gap
    sub(speaker, text, color = '#FFFFFF') {
      // (the line's recorded voice, if it has one: wagmi/radio/voices.js plays it once per showing)
      window.WAGMI?.voice?.sub?.(speaker, text);
      if (!text) { subOn = false; subEl.classList.add('hide'); if (objHtml) objEl.classList.remove('hide'); return; }
      subEl.innerHTML = (speaker ? `<b style="color:${color}">${esc(speaker.toUpperCase())}</b>` : '') + esc(text);
      subOn = true; subEl.classList.remove('hide'); objEl.classList.add('hide');
      const last = said[said.length - 1];
      if (!last || last[2] !== text) { said.push([speaker, color, text]); if (said.length > 12) said.shift(); }
    },
    // the objective: the line for a few seconds, the tracker until the next one (track: false leaves the tracker be)
    objective(parts, secs = 7, { track: keep = true } = {}) {
      // (the step's own objective remembered, so one that asks him into his car can give way to it; one asking him in
      // while he is already in never shows)
      if (keep) {
        ask = isCarAsk(parts); askT = 0;
        if (!ask) { base = parts || null; baseSecs = secs; }
        else if (modeNow() === 'car') parts = base;
      }
      if (keep) track(parts || null);
      if (!parts) { objHtml = null; objEl.classList.add('hide'); return; }
      objHtml = rich(parts); objEl.innerHTML = objHtml;
      if (!subOn) objEl.classList.remove('hide');
      later('obj', secs * 1000, () => { objEl.classList.add('hide'); objHtml = null; });
    },
    // the brief: the tracker opened on the last lines and help (on: true / false, or a toggle); shut again after 10 s
    brief(on) {
      const open = on == null ? !trackEl.classList.contains('open') : !!on;
      if (open) drawLog();
      trackEl.classList.toggle('open', open); trackEl.classList.toggle('off', !open && !trackHtml);
      clearTimeout(briefT); if (open) briefT = setTimeout(() => ui.brief(false), 10000);
    },
    // what the pause menu shows: the objective (html and plain), the last lines [speaker, colour, text], the last help
    recent() { return { objective: trackHtml, text: trackText, lines: said.slice(-6), help: helped.slice(-2) }; },
    // (mode: 'car' | 'foot', the help only while he is so; read off the text when not given: a help about getting out is
    // for the car, one about getting in for on foot)
    help(text, secs = 7, { mode } = {}) {
      if (!text) { helpEl.classList.remove('on'); helpMode = null; return; }
      helpMode = mode === undefined ? modeOf(text) : mode;
      if (helpMode && modeNow() && helpMode !== modeNow()) { helpMode = null; return; }
      helpEl.innerHTML = rich(text); helpEl.classList.add('on');
      if (helped[helped.length - 1] !== helpEl.innerHTML) { helped.push(helpEl.innerHTML); if (helped.length > 6) helped.shift(); }
      later('help', secs * 1000, () => helpEl.classList.remove('on'));
    },
    skip(k) {
      if (k == null) { skipEl.classList.remove('on'); return; }
      skipEl.classList.add('on'); skipEl.querySelector('circle.p').setAttribute('stroke-dashoffset', String(56.5 * (1 - Math.min(1, k))));
    },
    // a hold-to-act ring in the middle of the screen (k 0..1; label null hides)
    hold(label, k = 0, far = false) {
      if (label == null) { holdEl.classList.remove('on'); document.body.classList.remove('wg-holding'); return; }
      const html = rich(label), sp = holdEl.querySelector('span'); if (sp.innerHTML !== html) sp.innerHTML = html;
      holdEl.classList.add('on'); holdEl.classList.toggle('far', !!far); document.body.classList.add('wg-holding');
      holdEl.querySelector('circle.p').setAttribute('stroke-dashoffset', String(56.5 * (1 - Math.min(1, k))));
    },
    // a hold-F interaction (the van's search, Mack's phone): the ring comes up `show` m out, saying what to do and how
    // ('Walk up to the van, then hold F' out of reach, 'Hold F to search the van' in it), the hold counting anywhere within `reach`
    // m (d: how far he is from the thing, its outline, not one spot by it). step(dt, d, onFoot) true once held through;
    // stop() puts the ring and the key away
    holdAct({ label, verb = 'Walk up to', noun = '', secs = 1.2, show = 7, reach = 3.2 } = {}) {
      let k = 0, held = false, live = true;
      const onKey = (e) => { if (e.code === 'KeyF' && !e.repeat) held = e.type === 'keydown'; else if (e.code === 'KeyF' && e.type === 'keyup') held = false; };
      addEventListener('keydown', onKey); addEventListener('keyup', onKey);
      return {
        step(dt, d, onFoot = true) {
          if (!live) return false;
          const near = onFoot && d <= reach, seen = onFoot && d <= show;
          k = near && held ? k + dt / secs : Math.max(0, k - dt * 2);
          if (!seen) ui.hold(null);
          else ui.hold(near ? `Hold [F] to ${label}` : `${verb} ${noun || 'it'}, then hold [F]`, k, !near);
          return k >= 1;
        },
        get k() { return k; },
        stop() { live = false; removeEventListener('keydown', onKey); removeEventListener('keyup', onKey); ui.hold(null); },
      };
    },
    // the step (see the top): a new one starts the help over; a new mission, the lines too
    step(id) {
      if (id === stepId) return;
      const mission = (id || '').split(':')[0];
      if (mission !== (stepId || '').split(':')[0]) said.length = 0;
      helped.length = 0; stepId = id || null;
      // (the last step's how-to off the screen too, and any help offered for it)
      helpEl.classList.remove('on'); helpMode = null;
      ui.offer(null);
    },
    get stepId() { return stepId; },
    // real help after a genuine stall: { title, note, options: [{ key: '1', label, run }] }, up for secs (null: down)
    offer(o, secs = 14) {
      if (offerKeys) { removeEventListener('keydown', offerKeys, true); offerKeys = null; }
      clearTimeout(timers.get('offer'));
      if (!o || !o.options?.length) { offerEl.classList.remove('on'); document.body.classList.remove('wg-offering'); return; }
      offerEl.innerHTML = `<div class="h">${esc(o.title || 'Need a hand?')}</div>${o.note ? `<div class="n">${rich(o.note)}</div>` : ''}
        ${o.options.map((p, i) => `<button type="button" data-i="${i}"><kbd>${esc(p.key)}</kbd><span>${rich(p.label)}</span></button>`).join('')}<div class="x">Or just carry on.</div>`;
      offerEl.classList.add('on'); document.body.classList.add('wg-offering');
      const pick = (p) => { ui.offer(null); try { p.run?.(); } catch (e) { console.warn('[wagmi] offer', e); } };
      offerEl.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => pick(o.options[+b.dataset.i])));
      // (its number keys are its own while it is up: the city's mode keys don't hear them)
      offerKeys = (e) => {
        if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || window.WAGMI?.paused) return;
        const p = o.options.find((q) => e.code === 'Digit' + q.key || e.code === 'Numpad' + q.key);
        // (a number that isn't one of its options still never reaches the city's camera-mode keys)
        if (!p) { if (/^Digit[1-4]$/.test(e.code)) e.stopImmediatePropagation(); return; }
        e.stopImmediatePropagation(); e.preventDefault(); pick(p);
      };
      addEventListener('keydown', offerKeys, true);
      later('offer', secs * 1000, () => ui.offer(null));
    },
    caller(name, color = '#6CB8FF', status = 'On call') {
      if (!name) { callerEl.classList.remove('on'); callerCam(null); return; }
      const av = callerEl.querySelector('.av'); av.style.background = color;
      // (Jane: her video feed in the tile, her mouth with her voice; anyone else: their initial)
      if (name === 'Jane') callerCam(av); else { callerCam(null); av.textContent = name[0]; }
      callerEl.querySelector('.n').textContent = name.toUpperCase(); callerEl.querySelector('.s').textContent = status;
      callerEl.classList.add('on');
    },
    dm(from, text, secs = 8) {
      if (!from) { dmEl.classList.remove('on'); return; }
      dmEl.querySelector('.a').textContent = `New message · ${from}`; dmEl.querySelector('.b').textContent = text;
      dmEl.classList.add('on'); later('dm', secs * 1000, () => dmEl.classList.remove('on'));
    },
    counter(label, value) {
      if (label == null) { countEl.classList.remove('on'); return; }
      countEl.querySelector('.l').textContent = label; countEl.querySelector('.v').textContent = value; countEl.classList.add('on');
    },
    passed({ title = '', stats = [], reward = '', note = '' } = {}, secs = 6) {
      window.mcStat?.('pass', title);
      bigEl.innerHTML = `<div class="h" style="color:#FFC93C">MISSION PASSED</div><div class="t">${esc(title)}</div>
        <div class="stats">${stats.map(([a, b]) => `<div class="row"><span>${esc(a)}</span><span>${esc(b)}</span></div>`).join('')}
        ${reward ? `<div class="reward"><span>FOLLOWERS</span><span>${esc(reward)}</span></div>` : ''}${note ? `<div class="note">${esc(note)}</div>` : ''}</div>`;
      bigEl.classList.add('on'); bigEl.style.pointerEvents = 'none';
      return sleep(secs * 1000).then(() => bigEl.classList.remove('on'));
    },
    // tip: what would have helped, for this reason (objective-style parts); each label 'Main: sub', the sub what the
    // choice does ('Retry: the tail', 'Skip the tail: start at the yard'); none: RETRY, QUIT, SKIP as they were
    failed(reason, { skip = false, tip = null, retryLabel = '', skipLabel = '', quitLabel = '' } = {}) {
      window.mcStat?.('fail', reason);
      const opts = ['retry', 'quit', ...(skip ? ['skip'] : [])];
      const labels = { retry: retryLabel, quit: quitLabel, skip: skipLabel };
      const choice = (o, i) => {
        const s = String(labels[o] || ''), at = s.indexOf(': '), main = at < 0 ? s || o : s.slice(0, at), sub = at < 0 ? '' : s.slice(at + 2);
        return `<button data-o="${o}" class="${i === 0 ? 'sel' : ''}"><span class="m">${esc(main)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
      };
      bigEl.innerHTML = `<div class="h" style="color:#EF4444;font-size:72px">MISSION FAILED</div><div class="why">${esc(reason)}</div>
        ${tip ? `<div class="tip"><b>TIP</b>${rich(tip)}</div>` : ''}
        <div class="choices">${opts.map(choice).join('')}</div>`;
      bigEl.classList.add('on'); bigEl.style.pointerEvents = 'auto'; document.body.classList.add('wg-failing');
      return new Promise((res) => {
        let sel = 0;
        const btns = [...bigEl.querySelectorAll('button')], t0 = performance.now();
        const done = (o) => { removeEventListener('keydown', onKey, true); bigEl.classList.remove('on'); bigEl.style.pointerEvents = 'none'; document.body.classList.remove('wg-failing'); res(o); };
        // (the choices move only on fresh presses: a key still held from the fight, repeating, or pressed in the moment the
        // screen comes up moves nothing)
        const onKey = (e) => {
          e.stopImmediatePropagation(); e.preventDefault();
          if (e.repeat || performance.now() - t0 < 450) return;
          if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) { sel = (sel + (/Left|KeyA/.test(e.code) ? -1 : 1) + btns.length) % btns.length; btns.forEach((b, i) => b.classList.toggle('sel', i === sel)); }
          else if (e.code === 'Enter' || e.code === 'Space') done(opts[sel]);
        };
        addEventListener('keydown', onKey, true);
        btns.forEach((b) => b.addEventListener('click', () => done(b.dataset.o)));
      });
    },
    ko(on = true) {
      document.body.classList.toggle('wg-ko', !!on);
      if (!on) { bigEl.classList.remove('on'); return; }
      bigEl.innerHTML = `<div class="h" style="color:#EF4444;font-size:96px">OUT COLD</div>`; bigEl.classList.add('on');
    },
    // the start gate: the logo in the sky over the live city under a veil, 'Click or press any key to start'. It goes up
    // as soon as when() is true (polled on a timer: no frame needed) and a key or a click anywhere starts; the logo
    // stays up into the first shot (gameTitle(false) takes it down).
    // Over the instant title (index.html, #wg-boot: this gate drawn over a still of its aerial from the first paint, the
    // city loading behind it) it is up at once instead, in the title's place without a jump, and a start is taken from
    // then on, the title's own if one was made on it before this: onStart() at once (in the tap: the sound), 'Starting…'
    // until when() is true, then the start, with no second tap. The still fades out over the live city once it is
    // hold(): asked once a start is taken and when() is true (on the next microtask: the caller set up by then); a Promise
    // from it keeps 'Starting…' up until it settles (what comes next needs it in first), nothing lets the start through
    gate({ fine = '', when = () => true, onStart = null, hold = null } = {}) {
      document.body.classList.add('wg-gating');
      const touch = matchMedia('(pointer: coarse)').matches;
      // (with a game pad the last used: its A, wagmi/pad.js)
      const g = el('wg-gate', `<div class="go">${touch ? '<span>Tap to start</span>' : '<span class="wg-nopad">Click or press any key to start</span><span class="wg-padonly">Press <kbd data-pad="A">A</kbd> to start</span>'}</div><div class="fine">${esc(fine)}</div>`);
      const goEl = g.querySelector('.go');
      const T = window.__wgTitle?.adopt?.() || null;
      // (its line blinks on the page's clock, as the title's does)
      try { for (const a of goEl.getAnimations()) a.startTime = 0; } catch {}
      const isReady = () => { try { return !!when(); } catch { return false; } };
      let shown = false, live = !T;
      const show = () => {
        shown = true;
        const boot = T && document.getElementById('wg-boot');
        if (T) { g.classList.add('now'); gTitle.classList.add('now'); if (boot?.querySelector('.wg-boot-title.punch')) gTitle.classList.add('punch'); }
        g.classList.add('on'); gTitle.classList.add('on'); setTimeout(() => g.classList.add('in'), 1700);
        // (its lettering on the title's clock: where the title's arrival (or a punch) is, done or mid-way)
        if (T) { try { syncTitle(boot, gTitle, g); } catch {} void g.offsetWidth; g.classList.remove('now'); gTitle.classList.remove('now'); T.handover(); } else ui.bootOff();
      };
      // (the still out over the live city, two frames on: the opening's camera the one drawn under it by then)
      const goLive = () => { if (live) return; live = true; requestAnimationFrame(() => requestAnimationFrame(() => T.live())); };
      if (T || isReady()) show();
      if (isReady()) goLive();
      else { const poll = setInterval(() => { if (!isReady()) return; clearInterval(poll); if (!shown) show(); goLive(); }, 50); }
      return new Promise((res) => {
        // (a finger starts on its release, a tap's end: on a phone only that lets the opening's first line be heard.
        // A mouse or a pen still starts on the press)
        const EVS = ['keydown', 'pointerdown', 'pointerup', 'touchend', 'click'];
        const finish = () => { g.classList.remove('on'); setTimeout(() => g.remove(), 900); res(); };
        const waiting = () => { g.classList.add('wait'); goEl.className = 'go'; goEl.textContent = 'Starting…'; document.documentElement.classList.add('wg-t-start'); };
        const release = () => Promise.resolve().then(() => {
          let h = null; try { h = hold?.() || null; } catch (err) { console.warn(err); }
          if (!h) { finish(); return; }
          waiting(); Promise.resolve(h).then(finish, finish);
        });
        const begin = () => {
          try { onStart?.(); } catch (err) { console.warn(err); }
          blowOut = true;
          document.body.classList.remove('wg-gating');
          if (isReady()) { release(); return; }
          waiting();
          const wait = setInterval(() => { if (isReady()) { clearInterval(wait); release(); } }, 50);
        };
        const go = (e) => {
          if (!shown) return;
          if (e.type === 'keydown' && (e.metaKey || e.ctrlKey || e.altKey || e.repeat)) return;
          if (e.type === 'pointerdown' && e.pointerType === 'touch') { e.stopImmediatePropagation(); return; }
          if (e.type === 'pointerup' && e.pointerType !== 'touch') return;
          e.stopImmediatePropagation(); if (e.type === 'keydown') e.preventDefault();
          for (const t of EVS) removeEventListener(t, go, true);
          begin();
          // (the start seen and heard at once, in the tap, as on the instant title (index.html): the logo punched, a glint
          // across CITY, a low knock and a metal shing, the game's own (mission/audio.js), woken by onStart just now. The
          // sound a task on: a start the city was ready for has blown the logo out by then (begin(), its microtasks), and
          // that exit's whoosh and boom are the moment's, not a knock 0.1 s ahead of them and a shing with no glint)
          gTitle.classList.remove('punch'); void gTitle.offsetWidth; gTitle.classList.add('punch');
          setTimeout(() => { if (gTitle.classList.contains('out')) return; const S = window.WAGMI?.sfx; try { S?.play('thunk', { gain: 0.5, f: 58, ring: false }); S?.play('shing', { gain: 0.3 }); } catch {} }, 0);
        };
        if (T?.started) begin(); else for (const t of EVS) addEventListener(t, go, true);
      });
    },
    story(on) { document.body.classList.toggle('wg-story', !!on); },
    call(on, name = 'UNKNOWN') { callEl.classList.toggle('on', !!on); if (on) { callEl.querySelector('.nm').textContent = name; if (!callT) callT = performance.now(); } },
    callTalk(level) {
      if (!callEl.classList.contains('on')) return;
      for (const b of callWave.children) b.style.transform = `scaleY(${(0.06 + 0.9 * Math.random() * level * (0.4 + 0.6 * Math.random())).toFixed(3)})`;
      callClock.textContent = `00:${String(7 + Math.floor((performance.now() - callT) / 1000)).padStart(2, '0')}`;
    },
    phone: null,
  };

  /* ---------------------------------------------------------- the phone -- */
  const content = phoneEl.querySelector('.content');
  let wave = null, waveT = 0;
  // (his feed on the phone: Mr. Big in his study, drawn: the panelling, the window's city at night, the lamp's green
  // glow; silver hair swept back, a full silver beard, dark glasses frames, the navy suit and burgundy tie, the cigar)
  const BOSS_SVG = `<svg class="boss" viewBox="0 0 90 192" preserveAspectRatio="xMidYMid slice">
    <defs>
      <radialGradient id="bossRoom" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#3A2214"/><stop offset=".6" stop-color="#170C06"/><stop offset="1" stop-color="#050302"/></radialGradient>
      <linearGradient id="bossNight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050914"/><stop offset="1" stop-color="#1E2440"/></linearGradient>
      <radialGradient id="bossLamp" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFC27E" stop-opacity=".55"/><stop offset="1" stop-color="#FFC27E" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="90" height="192" fill="url(#bossRoom)"/>
    <rect x="27" y="22" width="36" height="78" fill="url(#bossNight)"/>
    <g fill="#FFD58A" opacity=".75"><rect x="30" y="70" width="1.5" height="2"/><rect x="34" y="64" width="1.5" height="2"/><rect x="55" y="74" width="1.5" height="2"/><rect x="58" y="68" width="1.5" height="2"/><rect x="31" y="80" width="1.5" height="2"/><rect x="57" y="84" width="1.5" height="2"/></g>
    <path d="M27 22 H63 V100 H27 Z M45 22 V100 M27 58 H63" stroke="#1E1009" stroke-width="2" fill="none"/>
    <path d="M14 192 L16 152 Q18 128 36 122 L45 132 L54 122 Q72 128 74 152 L76 192 Z" fill="#1B2440"/>
    <path d="M38 121 L45 140 L52 121 Z" fill="#EDEBE6"/><path d="M43.5 127 L45 150 L46.5 127 L45 125 Z" fill="#6E1426"/>
    <path d="M36 122 L45 140 L40 128 Z M54 122 L45 140 L50 128 Z" fill="#141B32"/>
    <path d="M38 104 L38 118 Q45 123 52 118 L52 104 Z" fill="#C99A80"/>
    <ellipse cx="45" cy="84" rx="15.5" ry="19" fill="#D3A488"/>
    <path d="M30 86 Q31 104 45 108 Q59 104 60 86 Q57 97 51 98 Q45 95 39 98 Q33 97 30 86 Z" fill="#B9B9BE"/>
    <path d="M39 96 Q45 93 51 96 Q45 95.5 39 96 Z" fill="#9C9CA2"/>
    <path d="M29.5 80 Q29 60 45 59 Q61 60 60.5 80 Q58 68 45 67 Q32 68 29.5 80 Z" fill="#CFCFD4"/>
    <g fill="none" stroke="#2A160C" stroke-width="1.6"><rect x="33.5" y="78" width="10" height="6.5" rx="1.4"/><rect x="46.5" y="78" width="10" height="6.5" rx="1.4"/><path d="M43.5 80 H46.5"/></g>
    <path d="M35 79.5 L37 79.5 M48 79.5 L50 79.5" stroke="#FFE2B8" stroke-width=".7" opacity=".8"/>
    <path d="M20 124 L31 112" stroke="#5B3920" stroke-width="2.6" stroke-linecap="round"/><circle cx="31.3" cy="111.7" r="1.3" fill="#FF7A2A"/>
    <path d="M32 110 Q30 100 34 92 Q37 84 33 76" stroke="#BDBDC2" stroke-width=".7" fill="none" opacity=".45"/>
    <circle cx="84" cy="150" r="22" fill="url(#bossLamp)"/>
  </svg>`;
  const callWave = callEl.querySelector('.wave'), callClock = callEl.querySelector('.clock');
  let callT = 0;
  function setWave(level) { if (!wave) return; for (const b of wave.children) b.style.height = `${3 + Math.random() * 28 * level}px`; }
  ui.phone = {
    el: phoneEl,
    show(screen, d = {}) {
      phoneEl.classList.add('on'); blurEl.classList.toggle('on', d.blur !== false);
      wave = null;
      if (screen === 'feed') {
        content.innerHTML = `<div class="wg-ph-feed"><div class="hd">@dan</div><div class="sub">Comments · ${esc(d.count || '18.4K')}</div>
          ${(d.items || []).map(([h, t, c, hot]) => `<div class="c${hot ? ' hot' : ''}"><div class="av" style="background:${c}">${esc(h[1].toUpperCase())}</div><div><div class="h">${esc(h)}</div><div class="t">${esc(t)}</div></div></div>`).join('')}</div>`;
        const cs = [...content.querySelectorAll('.c')];
        cs.forEach((c, i) => setTimeout(() => c.classList.add('on'), 150 + i * (d.every || 420)));
      } else if (screen === 'incoming') {
        content.innerHTML = `<div class="wg-ph-call"><div class="pic">?</div><div class="who">${esc(d.name || 'UNKNOWN')}</div><div class="what">${esc(d.what || 'Video call…')}</div>
          <div class="btns"><div class="b no">✕</div><div class="b yes">✓</div></div></div>`;
      } else if (screen === 'video') {
        content.innerHTML = `<div class="wg-ph-video glitch">${BOSS_SVG}<div class="scan"></div><div class="label">${esc(d.name || 'UNKNOWN')}<small class="clock">00:00</small></div>
          <div class="wave">${'<i></i>'.repeat(22)}</div><div class="vc">PRIVATE LINE</div><div class="end"></div></div>`;
        wave = content.querySelector('.wave'); waveT = performance.now();
      } else if (screen === 'ended') {
        content.innerHTML = `<div class="wg-ph-ended">CALL ENDED</div>`;
      } else if (screen === 'burner') {
        content.innerHTML = `<div class="wg-ph-burner"><div class="h">1 NEW MESSAGE · UNKNOWN</div><div class="m">${esc(d.text || '')}</div></div>`;
      } else if (screen === 'tracker') {
        content.innerHTML = `<div class="wg-ph-tag"><svg class="map" viewBox="0 0 90 192" preserveAspectRatio="xMidYMid slice">
          <rect width="90" height="192" fill="#0E1626"/>
          ${[20, 46, 72].map((x) => `<rect x="${x}" y="0" width="6" height="192" fill="#1D2A40"/>`).join('')}
          ${[30, 62, 94, 126, 158].map((y) => `<rect x="0" y="${y}" width="90" height="4" fill="#1D2A40"/>`).join('')}
          <path d="M49 40 L49 150" stroke="#2F7FD8" stroke-width="2" stroke-dasharray="3 3" opacity=".8"/>
          <circle class="dot" cx="49" cy="60" r="6" fill="#2F7FD8" stroke="#fff" stroke-width="1.5"><animate attributeName="cy" values="60;132" dur="5s" fill="freeze"/></circle>
          <text x="54" y="182" font-family="Barlow Condensed" font-weight="700" font-size="7" fill="#7C8AA5">5TH AVE</text></svg>
          <div class="note"><div class="ic">📍</div><div><div class="a">Tracker · now</div><div class="b">${esc(d.text || 'Laptop moving · 5th Ave')}</div></div></div></div>`;
        setTimeout(() => content.querySelector('.note')?.classList.add('on'), 250);
      }
    },
    press() { content.querySelector('.b.yes')?.classList.add('press'); },
    talk(level) { setWave(level); const c = content.querySelector('.clock'); if (c) { const s = Math.floor((performance.now() - waveT) / 1000); c.textContent = `00:${String(s).padStart(2, '0')}`; } },
    hide() { phoneEl.classList.remove('on'); blurEl.classList.remove('on'); },
  };
  // the pause menu (Esc or P), with the brief's key (B)
  try { ui.pause = createPause(ui); } catch (err) { console.warn('[wagmi] pause', err); }
  return ui;
}
