// Mog City story runner: a world's UI theme, opted into by the world itself (pack field "ui": { "theme": "glass" }).
// Nothing changes for a world that does not ask (Mog City's own New York game, every other pack): the theme is one
// <style> and one class on <html> (html.ui-glass), every rule below scoped under it.
//   applyTheme(def)   as soon as the world is in (pack.js load()); ?uitheme=plain turns it off for an A/B look
//
// "glass" (SF 2040, the owner 11 Nov: "use Glassmorphism and better cooler modern text for mission and subtitles"):
// frosted warm panels (ash-orange dusk: amber for what is asked, red for danger and bosses, teal for friends and the
// radio), Oswald for names, labels, numbers and cards, Manrope for what is said and asked. Both SIL OFL 1.1, self-hosted
// in assets/fonts/ (subset to Latin, woff2; licences beside them, assets/CREDITS.md). Readability first: the glass is
// dark enough (~0.62-0.74) for white text to hold about 4.5:1 over a bright sky, with a soft shadow under the letters.
// Cost: backdrop blur only on the small panels (the line, the tracker, the pill, the meters, a card's slab), motion on
// opacity and transform only (one letter-spacing settle on a card's title, a second long, and nothing else in layout).
import { CREDITS } from '../credits.js';
export const THEMES = ['glass'];
const OFL = 'https://openfontlicense.org';
const TYPE_CREDITS = [
  { what: 'Oswald', who: 'The Oswald Project Authors', note: 'names, labels, numbers and cards; subset to Latin, woff2', licence: 'SIL OFL 1.1', licenceUrl: OFL, src: 'https://github.com/googlefonts/OswaldFont' },
  { what: 'Manrope', who: 'The Manrope Project Authors', note: 'subtitles, objectives and help; subset to Latin, woff2', licence: 'SIL OFL 1.1', licenceUrl: OFL, src: 'https://github.com/googlefonts/manrope' },
];

const FONTS = [
  ['Oswald', 'assets/fonts/oswald/Oswald-Variable.woff2', '200 700'],
  ['Manrope', 'assets/fonts/manrope/Manrope-Variable.woff2', '200 800'],
];

const CSS = `
${FONTS.map(([f, u, w]) => `@font-face { font-family: '${f}'; src: url('${u}') format('woff2'); font-weight: ${w}; font-style: normal; font-display: swap; }`).join('\n')}
html.ui-glass {
  --gl-disp: 'Oswald', 'Barlow Condensed', system-ui, sans-serif;
  --gl-body: 'Manrope', 'Inter', system-ui, sans-serif;
  --gl-amber: #FFB547; --gl-amber2: #FF8A3D; --gl-red: #FF5A4F; --gl-teal: #5FE3BE; --gl-ink: #F8F4EC;
  --gl-bg: linear-gradient(155deg, rgba(64,42,30,.62), rgba(20,17,20,.70) 55%, rgba(12,12,16,.74));
  --gl-bg-soft: linear-gradient(155deg, rgba(60,40,30,.44), rgba(16,14,18,.52));
  --gl-blur: blur(18px) saturate(140%);
  --gl-edge: inset 0 0 0 1px rgba(255,255,255,.16), inset 0 1px 0 rgba(255,255,255,.22);
  --gl-drop: 0 12px 32px -12px rgba(0,0,0,.65), 0 2px 8px rgba(0,0,0,.22);
  --gl-ts: 0 1px 2px rgba(0,0,0,.55), 0 0 12px rgba(0,0,0,.25);
  --gl-ease: cubic-bezier(.2,.8,.2,1);
}
/* the panels' common glass */
html.ui-glass #wg .wg-sub, html.ui-glass #wg .wg-obj, html.ui-glass .wg-track, html.ui-glass #wg .wg-turn, html.ui-glass #wg .wg-help,
html.ui-glass #wg .wg-offer, html.ui-glass #wg .wg-caller, html.ui-glass #wg .wg-count, html.ui-glass #wg .sr-bar, html.ui-glass #wg .sr-meters > div,
html.ui-glass #wg .sr-timer, html.ui-glass #wg .sr-choice, html.ui-glass #wg .sr-pass .box, html.ui-glass #wg .wg-big .stats, html.ui-glass #wg .wg-big:not(.wg-ep) .tip,
html.ui-glass #wf .wf-boss, html.ui-glass #wg .wg-dm {
  background: var(--gl-bg); -webkit-backdrop-filter: var(--gl-blur); backdrop-filter: var(--gl-blur);
  box-shadow: var(--gl-edge), var(--gl-drop); border-radius: 14px; border: 0; color: var(--gl-ink); text-shadow: var(--gl-ts);
}

/* ---- subtitles: the speaker a small tracked label in their colour over the line, a pill sized to the words ---- */
html.ui-glass body.wg-cine #wg .wg-line { width: min(60vw, 900px, calc(100vw - 32px)); }
html.ui-glass #wg .wg-sub, html.ui-glass #wg .wg-obj { width: fit-content; max-width: 100%; margin: 8px auto 0; padding: 10px 20px 12px; position: relative; overflow: hidden;
  font-family: var(--gl-body); font-weight: 600; font-size: 19px; line-height: 1.42; letter-spacing: .003em; text-align: center;
  transition: opacity .28s, transform .38s var(--gl-ease); }
html.ui-glass #wg .wg-sub.hide, html.ui-glass #wg .wg-obj.hide { transform: translateY(8px); }
html.ui-glass #wg .wg-sub b { display: block; margin: 0 0 3px; font: 600 12.5px/1.1 var(--gl-disp); letter-spacing: .26em; text-transform: uppercase; text-shadow: 0 1px 2px rgba(0,0,0,.6); }
html.ui-glass #wg .wg-sub .t { display: block; }
html.ui-glass #wg .wg-sub > b, html.ui-glass #wg .wg-sub > .t { animation: glUp .42s var(--gl-ease) both; }
html.ui-glass #wg .wg-sub > .t { animation-delay: .04s; }
@keyframes glUp { from { opacity: 0; transform: translateY(7px); } }
/* (a line over the radio: a radio glyph by the name, a teal edge, scanlines drifting and a flicker of static as it opens) */
html.ui-glass #wg .wg-sub.radio { box-shadow: inset 0 0 0 1px rgba(95,227,190,.30), inset 0 1px 0 rgba(255,255,255,.18), var(--gl-drop); }
html.ui-glass #wg .wg-sub.radio b::before { content: ''; display: inline-block; width: 13px; height: 13px; margin: 0 7px -2px 0; background: currentColor;
  -webkit-mask: var(--gl-radio) center / contain no-repeat; mask: var(--gl-radio) center / contain no-repeat; }
html.ui-glass #wg .wg-sub.radio::after { content: ''; position: absolute; left: 0; right: 0; top: -12px; height: calc(100% + 24px); pointer-events: none;
  background: repeating-linear-gradient(0deg, rgba(255,255,255,.05) 0 1px, transparent 1px 4px); animation: glScan 2.4s linear infinite; }
html.ui-glass #wg .wg-sub.radio > .t { animation: glUp .42s var(--gl-ease) both, glStatic .5s steps(1) both; }
@keyframes glScan { to { transform: translateY(12px); } }
@keyframes glStatic { 0% { opacity: .2; transform: translateX(1px); } 15% { opacity: .9; transform: none; } 30% { opacity: .45; transform: translateX(-1px); } 45% { opacity: 1; transform: none; } 60% { opacity: .7; } 75%, 100% { opacity: 1; } }
html.ui-glass { --gl-radio: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 13.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z'/%3E%3Cpath fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' d='M8.4 8.4a5 5 0 0 0 0 7.2M15.6 8.4a5 5 0 0 1 0 7.2M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13'/%3E%3C/svg%3E"); }

/* ---- the objective line (bottom, a few seconds) and the tracker (top left, [B]) ---- */
html.ui-glass #wg .wg-obj { font-size: 19px; box-shadow: inset 0 0 0 1px rgba(255,181,71,.30), inset 0 1px 0 rgba(255,255,255,.2), var(--gl-drop); }
html.ui-glass #wg .wg-obj::before { content: 'OBJECTIVE'; display: block; margin: 0 0 3px; font: 600 11.5px/1.1 var(--gl-disp); letter-spacing: .3em; color: var(--gl-amber); }
html.ui-glass #wg .wg-obj > .t { display: block; animation: glUp .42s var(--gl-ease) both, glGlow 1.2s .1s ease-out both; }
@keyframes glGlow { 0% { text-shadow: 0 0 18px rgba(255,181,71,.75), var(--gl-ts); } 100% { text-shadow: var(--gl-ts); } }
html.ui-glass .wg-track { padding: 10px 14px 11px; max-width: 300px; font-family: var(--gl-body); }
html.ui-glass .wg-track .k { font: 600 11px/1 var(--gl-disp); letter-spacing: .3em; color: var(--gl-amber); }
html.ui-glass .wg-track .k span::before { content: ''; display: inline-block; width: 11px; height: 11px; margin: 0 7px -1px 0; background: currentColor;
  -webkit-mask: var(--gl-target) center / contain no-repeat; mask: var(--gl-target) center / contain no-repeat; }
html.ui-glass { --gl-target: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2.4'%3E%3Ccircle cx='12' cy='12' r='8.5'/%3E%3Ccircle cx='12' cy='12' r='3' fill='%23000'/%3E%3C/svg%3E"); }
html.ui-glass .wg-track .k kbd { font: 600 10.5px/16px var(--gl-disp); border-radius: 5px; border-color: rgba(255,255,255,.3); background: rgba(255,255,255,.08); }
html.ui-glass .wg-track .o { margin-top: 6px; font: 600 15.5px/1.35 var(--gl-body); }
html.ui-glass .wg-track .log .h { font: 600 10.5px/1 var(--gl-disp); letter-spacing: .28em; }
html.ui-glass .wg-track .log .l, html.ui-glass .wg-track .log .hp { font: 500 13.5px/1.4 var(--gl-body); }
html.ui-glass .wg-track .log .l b { font: 600 11px/1 var(--gl-disp); letter-spacing: .18em; }
html.ui-glass .wg-track.upd { animation: glPulse 1.1s var(--gl-ease); }
@keyframes glPulse { 0% { box-shadow: inset 0 0 0 1px rgba(255,181,71,.9), 0 0 0 0 rgba(255,181,71,.55), var(--gl-drop); transform: scale(1.025); }
  100% { box-shadow: var(--gl-edge), 0 0 0 14px rgba(255,181,71,0), var(--gl-drop); transform: none; } }
html.ui-glass .wg-track .o kbd, html.ui-glass #wg .wg-help kbd, html.ui-glass #wg .wg-obj kbd, html.ui-glass #wg .wg-big .tip kbd, html.ui-glass #wg .wg-offer kbd {
  font: 600 12.5px/20px var(--gl-disp); letter-spacing: .04em; border-radius: 6px; border: 1px solid rgba(255,255,255,.35); background: rgba(255,255,255,.10); box-shadow: inset 0 -1px 0 rgba(0,0,0,.35); text-shadow: none; }

/* ---- the waypoint pill (top) ---- */
html.ui-glass #wg .wg-turn { padding: 9px 18px 9px 13px; border-radius: 999px; font: 600 19px/1 var(--gl-disp); letter-spacing: .03em; }
html.ui-glass #wg .wg-turn .w { font-weight: 700; color: #fff; }
html.ui-glass #wg .wg-turn .ar, html.ui-glass #wg .wg-turn .d { color: var(--gl-amber); }
html.ui-glass #wg .wg-turn .d { font-weight: 600; font-variant-numeric: tabular-nums; }
html.ui-glass #wg .wg-turn .d::before { content: ''; display: inline-block; width: 1px; height: .9em; margin: 0 12px -1px 2px; background: rgba(255,255,255,.3); }

/* ---- help, offers, a DM ---- */
html.ui-glass #wg .wg-help, html.ui-glass #wg .wg-offer { font: 600 15px/1.45 var(--gl-body); padding: 12px 16px; }
html.ui-glass #wg .wg-offer { border-left: 0; box-shadow: inset 3px 0 0 var(--gl-amber), var(--gl-edge), var(--gl-drop); }
html.ui-glass #wg .wg-offer .h { font: 600 11.5px/1 var(--gl-disp); letter-spacing: .28em; color: var(--gl-amber); }
html.ui-glass #wg .wg-offer button { font: 600 15px/1.3 var(--gl-body); border-radius: 9px; background: rgba(255,255,255,.06); box-shadow: inset 0 0 0 1px rgba(255,255,255,.1); }
html.ui-glass #wg .wg-offer button:hover, html.ui-glass #wg .wg-offer button:focus-visible { background: rgba(255,181,71,.16); box-shadow: inset 0 0 0 1px rgba(255,181,71,.6); outline: 0; }
html.ui-glass #wg .wg-offer .x { font: 500 12px/1 var(--gl-body); }

/* ---- the radio/call card ---- */
html.ui-glass #wg .wg-caller { padding: 10px 18px 10px 10px; }
html.ui-glass #wg .wg-caller .av { font: 600 20px/1 var(--gl-disp); box-shadow: 0 0 0 2px rgba(255,255,255,.18); }
html.ui-glass #wg .wg-caller .av::after { content: ''; position: absolute; inset: 0; border-radius: inherit; box-shadow: 0 0 0 0 rgba(95,227,190,.6); animation: glOnAir 1.6s ease-out infinite; }
@keyframes glOnAir { 0% { box-shadow: inset 0 0 0 2px rgba(95,227,190,.75); } 100% { box-shadow: inset 0 0 0 2px rgba(95,227,190,0); } }
html.ui-glass #wg .wg-caller .n { font: 600 18px/1 var(--gl-disp); letter-spacing: .14em; }
html.ui-glass #wg .wg-caller .s { font: 600 11.5px/1 var(--gl-body); letter-spacing: .08em; text-transform: uppercase; color: var(--gl-teal); margin-top: 6px; }
html.ui-glass #wg .wg-caller .s::before { content: ''; display: inline-block; width: 6px; height: 6px; margin: 0 6px 1px 0; border-radius: 50%; background: currentColor; box-shadow: 0 0 8px currentColor; animation: glBlink 1.2s ease-in-out infinite; }
@keyframes glBlink { 50% { opacity: .3; } }
html.ui-glass #wg .wg-dm .a { font: 600 11px/1 var(--gl-disp); letter-spacing: .24em; } html.ui-glass #wg .wg-dm .b { font: 600 15px/1.4 var(--gl-body); }

/* ---- the meters: a count (WAVE 2/3), a bar (NOISE, CAMP, a chaser's gap), the clock, the world's meters ---- */
html.ui-glass #wg .wg-count, html.ui-glass #wg .sr-timer { padding: 10px 16px 11px; text-align: right; }
html.ui-glass #wg .wg-count .l, html.ui-glass #wg .sr-timer .l, html.ui-glass #wg .sr-meters .l, html.ui-glass #wg .sr-bar .row { font: 600 11px/1 var(--gl-disp); letter-spacing: .3em; color: rgba(248,244,236,.72); }
html.ui-glass #wg .wg-count .v { font: 700 30px/1 var(--gl-disp); margin-top: 4px; font-variant-numeric: tabular-nums; letter-spacing: .02em; }
html.ui-glass #wg .wg-count .v.pop { animation: glPop .45s var(--gl-ease); }
@keyframes glPop { 0% { transform: scale(1.32); color: var(--gl-amber); } 100% { transform: none; } }
html.ui-glass #wg .wg-count .v { display: inline-block; transform-origin: 100% 60%; }
html.ui-glass #wg .sr-timer .v { font: 700 36px/1 var(--gl-disp); margin-top: 4px; }
html.ui-glass #wg .sr-bar { width: 264px; padding: 11px 15px 13px; }
html.ui-glass #wg .sr-bar .row b { font: 700 14px/1 var(--gl-disp); letter-spacing: .1em; color: var(--gl-amber); }
html.ui-glass #wg .sr-bar .row b.low { color: var(--gl-red); }
html.ui-glass #wg .sr-bar i { height: 8px; margin-top: 9px; border-radius: 999px; background: rgba(255,255,255,.12); box-shadow: inset 0 1px 2px rgba(0,0,0,.45); }
html.ui-glass #wg .sr-bar i s { position: relative; border-radius: 999px; transition: width .35s var(--gl-ease), background .4s; box-shadow: 0 0 10px rgba(255,255,255,.18); }
html.ui-glass #wg .sr-bar i s::after, html.ui-glass #wg .sr-meters i s::after, html.ui-glass #wf .wf-boss .wf-bb .wf-fill::after { content: ''; position: absolute; inset: 0; border-radius: inherit;
  background: linear-gradient(180deg, rgba(255,255,255,.38), rgba(255,255,255,0) 55%, rgba(0,0,0,.18)); }
html.ui-glass #wg .sr-meters > div { padding: 8px 14px 8px; }
html.ui-glass #wg .sr-meters .v { font: 700 22px/1 var(--gl-disp); color: var(--gl-amber); }
html.ui-glass #wg .sr-meters > div.goal .v { font-size: 30px; color: var(--gl-teal); }
html.ui-glass #wg .sr-meters > div.goal i { height: 6px; border-radius: 999px; } html.ui-glass #wg .sr-meters > div.goal i s { position: relative; background: var(--gl-teal); border-radius: 999px; }
html.ui-glass #wg .sr-meters .d { font: 700 24px/1 var(--gl-disp); }

/* ---- the boss: its name big and tracked, its health a glowing red bar on glass ---- */
html.ui-glass #wf .wf-boss { padding: 10px 18px 13px; gap: 7px; width: min(600px, calc(100vw - 32px)); box-shadow: inset 0 0 0 1px rgba(255,90,79,.32), inset 0 1px 0 rgba(255,255,255,.18), var(--gl-drop), 0 0 40px -12px rgba(255,90,79,.45); }
html.ui-glass #wf .wf-boss .wf-bk { font: 600 10.5px/1 var(--gl-disp); letter-spacing: .42em; color: var(--gl-red); }
html.ui-glass #wf .wf-boss .wf-bn { font: 600 26px/1 var(--gl-disp); font-style: normal; letter-spacing: .2em; padding-left: .2em; text-shadow: 0 0 18px rgba(255,90,79,.5), 0 2px 4px rgba(0,0,0,.6); }
html.ui-glass #wf .wf-boss .wf-bb { height: 9px; border-radius: 999px; background: rgba(0,0,0,.4); box-shadow: inset 0 0 0 1px rgba(255,255,255,.14), inset 0 1px 3px rgba(0,0,0,.5); }
html.ui-glass #wf .wf-boss .wf-bb .wf-fill { background: linear-gradient(90deg, #B4231C, var(--gl-red) 70%, #FF8A5C); box-shadow: 0 0 12px rgba(255,90,79,.7); }
/* (the way's pill is up top too while a boss runs after him: the boss's card goes under it) */
html.ui-glass body.wg-turnon:not(.touch-enabled) #wf .wf-boss { top: calc(max(16px, 2.4vh) + 56px); }
html.ui-glass #wf .wf-boss.wf-on .wf-bn { animation: glTrackIn .9s var(--gl-ease) both; }

/* ---- the action beats' calls (juice.js: a boss woken, a chase on) and the fight's banner ---- */
html.ui-glass #sr-juice .h, html.ui-glass #wf .wf-banner { font-family: var(--gl-disp); font-style: normal; font-weight: 600; letter-spacing: .18em; padding-left: .18em; }
html.ui-glass #sr-juice .h { font-size: 46px; text-shadow: 0 0 26px rgba(0,0,0,.55), 0 2px 4px rgba(0,0,0,.7); }
html.ui-glass #sr-juice.on .h { animation: glTrackIn .7s var(--gl-ease) both; }
html.ui-glass #sr-juice .s { font: 600 15px/1.3 var(--gl-body); letter-spacing: .06em; margin-top: 8px; }
html.ui-glass #wf .wf-banner { font-size: 34px; }

/* ---- cards: a mission's title (ui.title), an act's or CONTINUE (hud.card), the name card, a place ---- */
@keyframes glTrackIn { from { opacity: 0; letter-spacing: .6em; } }
@keyframes glRule { from { transform: scaleX(0); } }
html.ui-glass #wg .wg-title .act, html.ui-glass #wg .sr-card .k { display: inline-flex; align-items: center; gap: 16px; font: 500 14px/1 var(--gl-disp); letter-spacing: .5em; padding-left: .5em; color: var(--gl-amber); }
html.ui-glass #wg .wg-title .act::before, html.ui-glass #wg .wg-title .act::after, html.ui-glass #wg .sr-card .k::before, html.ui-glass #wg .sr-card .k::after {
  content: ''; width: 56px; height: 1px; background: linear-gradient(90deg, rgba(255,181,71,0), var(--gl-amber)); }
html.ui-glass #wg .wg-title .act::after, html.ui-glass #wg .sr-card .k::after { background: linear-gradient(270deg, rgba(255,181,71,0), var(--gl-amber)); }
html.ui-glass #wg .wg-title .act:empty, html.ui-glass #wg .sr-card .k:empty { display: none; }
html.ui-glass #wg .wg-title .name, html.ui-glass #wg .sr-card .t { font: 600 clamp(40px, 6.4vw, 84px)/1.02 var(--gl-disp); font-style: normal; letter-spacing: .06em; text-transform: uppercase;
  text-shadow: 0 2px 24px rgba(0,0,0,.55), 0 1px 2px rgba(0,0,0,.7); }
html.ui-glass #wg .wg-title { top: 36%; }
html.ui-glass #wg .wg-title .name { margin-top: 10px; }
html.ui-glass #wg .wg-title.on .name { animation: glTrackIn 1s var(--gl-ease) both; }
html.ui-glass #wg .wg-title::before { content: ''; position: absolute; left: 50%; top: 50%; width: min(760px, 92vw); height: calc(100% + 56px); transform: translate(-50%, -50%); z-index: -1; border-radius: 22px;
  background: var(--gl-bg-soft); -webkit-backdrop-filter: blur(16px) saturate(130%); backdrop-filter: blur(16px) saturate(130%); box-shadow: var(--gl-edge), var(--gl-drop); opacity: 0; transition: opacity .4s; }
html.ui-glass #wg .wg-title.on::before { opacity: 1; } html.ui-glass #wg .wg-title.out::before { opacity: 0; transition: opacity .6s; }
html.ui-glass #wg .sr-card { background: radial-gradient(ellipse 60% 45% at 50% 50%, rgba(0,0,0,.22), rgba(0,0,0,0)); }
html.ui-glass #wg .sr-card > div { position: relative; padding: 30px clamp(24px, 5vw, 64px) 28px; max-width: min(860px, calc(100vw - 32px)); border-radius: 24px;
  background: var(--gl-bg-soft); -webkit-backdrop-filter: blur(20px) saturate(130%); backdrop-filter: blur(20px) saturate(130%); box-shadow: var(--gl-edge), var(--gl-drop); }
html.ui-glass #wg .sr-card .r { display: none; }
html.ui-glass #wg .sr-card .t { margin: 14px 0 12px; }
html.ui-glass #wg .sr-card .s { font: 500 17px/1.5 var(--gl-body); color: rgba(248,244,236,.9); margin: 0 auto; max-width: 620px; }
html.ui-glass #wg .sr-card.on .t { animation: glTrackIn 1s var(--gl-ease) both; }
html.ui-glass #wg .sr-card.on .k::before, html.ui-glass #wg .sr-card.on .k::after, html.ui-glass #wg .wg-title.on .act::before, html.ui-glass #wg .wg-title.on .act::after { animation: glRule .8s .15s var(--gl-ease) both; }
html.ui-glass #wg .sr-card.on .s { animation: glUp .6s .35s var(--gl-ease) both; }
html.ui-glass #wg .wg-cap { border-left: 0; padding: 14px 24px 15px 20px; border-radius: 16px; background: var(--gl-bg-soft); -webkit-backdrop-filter: blur(16px) saturate(130%); backdrop-filter: blur(16px) saturate(130%);
  box-shadow: inset 3px 0 0 var(--c, #fff), var(--gl-edge), var(--gl-drop); }
html.ui-glass #wg .wg-cap .n { font: 600 50px/1 var(--gl-disp); font-style: normal; letter-spacing: .08em; }
html.ui-glass #wg .wg-cap .r { margin-top: 8px; font: 700 12.5px/1.2 var(--gl-body); letter-spacing: .2em; }
html.ui-glass #wg .wg-cap.on .n { animation: glTrackIn .9s var(--gl-ease) both; }
html.ui-glass #wg .wg-cap.on .r { animation: glUp .6s .25s var(--gl-ease) both; }
html.ui-glass #wg .wg-place .n { font: 500 30px/1 var(--gl-disp); font-style: normal; letter-spacing: .06em; }
html.ui-glass #wg .wg-place .s { font: 600 11.5px/1 var(--gl-disp); letter-spacing: .34em; color: var(--gl-amber); margin-top: 8px; }

/* ---- MISSION PASSED (the story's, hud.passed) and FAILED (ui.failed) ---- */
html.ui-glass #wg .sr-pass .h, html.ui-glass #wg .wg-big .h { font-family: var(--gl-disp); font-style: normal; font-weight: 700; letter-spacing: .08em; }
html.ui-glass #wg .sr-pass .h { font-size: clamp(52px, 8.6vw, 112px); background: linear-gradient(180deg, #FFE2A6, var(--gl-amber) 45%, var(--gl-amber2)); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 4px 18px rgba(0,0,0,.55)); text-shadow: none; }
html.ui-glass #wg .sr-pass.on .h { animation: glTrackIn 1.1s var(--gl-ease) both; }
html.ui-glass #wg .sr-pass .t { font: 500 clamp(22px, 3vw, 32px)/1.1 var(--gl-disp); letter-spacing: .22em; margin-top: 6px; }
html.ui-glass #wg .sr-pass .box { padding: 16px 24px 18px; border-radius: 18px; }
html.ui-glass #wg .sr-pass.on .box { animation: glUp .6s .3s var(--gl-ease) both; }
html.ui-glass #wg .sr-pass .g, html.ui-glass #wg .sr-pass .st, html.ui-glass #wg .sr-pass .p .row { font: 600 12px/1.8 var(--gl-disp); letter-spacing: .26em; }
html.ui-glass #wg .sr-pass .g b { font: 700 36px/1 var(--gl-disp); letter-spacing: .02em; color: var(--gl-teal); }
html.ui-glass #wg .sr-pass .g b.bad { color: var(--gl-red); }
html.ui-glass #wg .sr-pass .p .row span:last-child { font: 700 20px/1 var(--gl-disp); }
html.ui-glass #wg .sr-pass .p i { border-radius: 999px; height: 8px; }
html.ui-glass #wg .sr-pass .p i u { background: var(--gl-teal); } html.ui-glass #wg .sr-pass .p i s { background: rgba(95,227,190,.4); }
html.ui-glass #wg .sr-pass .ln { font: 500 16px/1.5 var(--gl-body); }
html.ui-glass #wg .sr-pass .nx .k { font: 600 11px/1 var(--gl-disp); letter-spacing: .4em; color: var(--gl-amber); }
html.ui-glass #wg .sr-pass .nx .n { font: 600 22px/1.15 var(--gl-disp); letter-spacing: .08em; }
html.ui-glass #wg .sr-pass .nx .s { font: 500 14px/1.45 var(--gl-body); }
html.ui-glass #wg .wg-big .h { text-shadow: 0 4px 24px rgba(0,0,0,.6); }
html.ui-glass #wg .wg-big.on .h { animation: glTrackIn 1s var(--gl-ease) both; }
html.ui-glass #wg .wg-big .t { font: 500 30px/1.1 var(--gl-disp); letter-spacing: .14em; }
html.ui-glass #wg .wg-big .why { font: 600 20px/1.4 var(--gl-body); max-width: min(680px, calc(100vw - 32px)); text-align: center; text-shadow: 0 2px 12px rgba(0,0,0,.8); }
html.ui-glass #wg .wg-big:not(.wg-ep) .tip { font: 500 16px/1.5 var(--gl-body); border-left: 0; box-shadow: inset 3px 0 0 var(--gl-amber), var(--gl-edge), var(--gl-drop); padding: 12px 16px; }
html.ui-glass #wg .wg-big:not(.wg-ep) .tip b { font: 600 11px/1 var(--gl-disp); letter-spacing: .32em; color: var(--gl-amber); }
html.ui-glass #wg .wg-big .row { font: 600 16px/1.8 var(--gl-body); }
html.ui-glass #wg .wg-big button { font: 600 17px/1 var(--gl-disp); letter-spacing: .2em; padding: 14px 26px; border-radius: 12px; border: 0; color: var(--gl-ink);
  background: var(--gl-bg); -webkit-backdrop-filter: var(--gl-blur); backdrop-filter: var(--gl-blur); box-shadow: var(--gl-edge), var(--gl-drop); transition: box-shadow .2s, transform .2s, background .2s; }
html.ui-glass #wg .wg-big button small { font: 500 12px/1.3 var(--gl-body); letter-spacing: .02em; text-transform: none; opacity: .85; }
html.ui-glass #wg .wg-big button.sel, html.ui-glass #wg .wg-big button:hover { color: #fff; background: linear-gradient(155deg, rgba(255,181,71,.34), rgba(40,26,18,.72)); box-shadow: inset 0 0 0 1px var(--gl-amber), 0 0 24px -4px rgba(255,181,71,.6), var(--gl-drop); transform: translateY(-2px); }

/* ---- a choice: big option cards side by side, the number key on each, what it does under its name ---- */
html.ui-glass #wg .sr-choice { width: min(800px, calc(100vw - 32px)); padding: 18px 20px 16px; border-radius: 20px; font-family: var(--gl-body); }
html.ui-glass #wg .sr-choice .h { font: 600 12px/1 var(--gl-disp); letter-spacing: .32em; }
html.ui-glass #wg .sr-choice .p { font: 600 19px/1.45 var(--gl-body); margin: 8px 0 14px; }
html.ui-glass #wg .sr-choice.n2 .opts { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
html.ui-glass #wg .sr-choice button { position: relative; display: flex; align-items: flex-start; gap: 14px; margin: 0 0 8px; padding: 14px 16px 15px; min-height: 64px; border: 0; border-radius: 14px;
  background: rgba(255,255,255,.06); box-shadow: inset 0 0 0 1px rgba(255,255,255,.14); color: var(--gl-ink); font: 600 15px/1.4 var(--gl-body); text-shadow: var(--gl-ts);
  transition: background .2s, box-shadow .2s, transform .2s var(--gl-ease); }
html.ui-glass #wg .sr-choice.n2 button { margin: 0; flex-direction: column; gap: 10px; }
html.ui-glass #wg .sr-choice button .m { display: block; font: 600 21px/1.1 var(--gl-disp); letter-spacing: .08em; text-transform: uppercase; color: #fff; }
html.ui-glass #wg .sr-choice button .sep { display: none; }
html.ui-glass #wg .sr-choice button .c { display: block; margin-top: 6px; font: 500 14.5px/1.45 var(--gl-body); color: rgba(248,244,236,.86); }
html.ui-glass #wg .sr-choice kbd { flex: none; min-width: 30px; height: 30px; padding: 0; border-radius: 8px; border: 0; display: grid; place-items: center;
  font: 700 16px/1 var(--gl-disp); background: rgba(255,255,255,.12); box-shadow: inset 0 0 0 1px rgba(255,255,255,.3), inset 0 -2px 0 rgba(0,0,0,.3); }
html.ui-glass #wg .sr-choice button:hover, html.ui-glass #wg .sr-choice button:focus-visible, html.ui-glass #wg .sr-choice button.sel { outline: 0; transform: translateY(-2px);
  background: linear-gradient(155deg, rgba(255,181,71,.22), rgba(255,181,71,.05)); box-shadow: inset 0 0 0 1.5px var(--gl-amber), 0 0 28px -6px rgba(255,181,71,.7); }
html.ui-glass #wg .sr-choice button.sel kbd { background: var(--gl-amber); color: #1A1208; box-shadow: none; text-shadow: none; }
html.ui-glass #wg .sr-choice button.lock { opacity: .4; }
html.ui-glass #wg .sr-choice.on button { animation: glUp .45s var(--gl-ease) both; } html.ui-glass #wg .sr-choice.on button + button { animation-delay: .08s; }

/* ---- the title screen (#wg-boot, the instant title, and the start gate's lockup over it, the same rules) ---- */
html.ui-glass #wg-boot .wg-boot-logo, html.ui-glass #wg .wg-gtitle .logo { font-family: var(--gl-disp); font-style: normal; font-weight: 700; letter-spacing: .05em; }
html.ui-glass #wg-boot .wg-boot-logo b span, html.ui-glass #wg .wg-gtitle .logo b span { background: linear-gradient(180deg, #FFE2A6, var(--gl-amber) 48%, var(--gl-amber2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
html.ui-glass #wg-boot .wg-boot-rule, html.ui-glass #wg .wg-gtitle .rule { width: 220px; height: 1px; background: linear-gradient(90deg, rgba(255,181,71,0), var(--gl-amber), rgba(255,181,71,0)); margin-top: 18px; }
html.ui-glass #wg-boot .wg-boot-tag, html.ui-glass #wg .wg-gtitle .tag { margin-top: 16px; padding: 9px 22px 8px; border-radius: 999px; font-family: var(--gl-disp); font-weight: 500; letter-spacing: .5em;
  background: rgba(20,16,18,.42); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); box-shadow: var(--gl-edge); }
html.ui-glass #wg .wg-gate .go { font-family: var(--gl-disp); font-weight: 500; letter-spacing: .4em; }
html.ui-glass #wg .wg-gate .fine { font-family: var(--gl-body); font-weight: 500; letter-spacing: .04em; }
html.ui-glass #wg .wg-skip { font: 600 12.5px/1 var(--gl-body); letter-spacing: .04em; }
html.ui-glass #wg .wg-skip kbd { font: 600 11px/18px var(--gl-disp); }
html.ui-glass #wg .wg-hold { font: 600 16px/1 var(--gl-body); background: var(--gl-bg); -webkit-backdrop-filter: var(--gl-blur); backdrop-filter: var(--gl-blur); box-shadow: var(--gl-edge), var(--gl-drop); border-radius: 999px; }

/* ---- a phone (touch): a size down, as the plain theme does ---- */
html.ui-glass body.touch-enabled #wg .wg-sub, html.ui-glass body.touch-enabled #wg .wg-obj { font-size: 16px; padding: 8px 14px 9px; }
html.ui-glass body.touch-enabled.wg-cine #wg .wg-sub { font-size: 17px; }
html.ui-glass body.touch-enabled #wg .wg-turn { font-size: 16px; padding: 7px 13px 7px 10px; }
html.ui-glass body.touch-enabled #wg .wg-count { display: flex; align-items: baseline; gap: 8px; padding: 6px 12px; }
html.ui-glass body.touch-enabled #wg .wg-count .v { font-size: 22px; margin: 0; }
html.ui-glass body.touch-enabled #wg .wg-cap .n { font-size: 36px; }
@media (max-width: 700px) {
  html.ui-glass #wg .sr-choice.n2 .opts { grid-template-columns: 1fr; gap: 8px; }
  html.ui-glass #wg .sr-choice button .m { font-size: 18px; }
  html.ui-glass #wg .sr-card > div { padding: 22px 18px 20px; }
}

/* ---- asked for less motion: fades only ---- */
@media (prefers-reduced-motion: reduce) {
  html.ui-glass #wg *, html.ui-glass #wg *::before, html.ui-glass #wg *::after, html.ui-glass .wg-track, html.ui-glass #wf .wf-boss * { animation: none !important; }
  html.ui-glass #wg .wg-sub.hide, html.ui-glass #wg .wg-obj.hide { transform: none; }
  html.ui-glass #wg .sr-choice button { transition: background .2s, box-shadow .2s; }
  html.ui-glass #wg .sr-choice button.sel, html.ui-glass #wg .sr-choice button:hover, html.ui-glass #wg .wg-big button.sel, html.ui-glass #wg .wg-big button:hover { transform: none; }
}
`;

let applied = null;
export function applyTheme(def) {
  if (typeof document === 'undefined') return null;
  let t = def?.ui?.theme;
  try { const q = new URLSearchParams(location.search).get('uitheme'); if (q === 'plain' || q === 'off') t = null; else if (THEMES.includes(q)) t = q; } catch {}
  if (!THEMES.includes(t) || applied === t) return applied;
  applied = t;
  for (const [, u] of FONTS) { const l = document.createElement('link'); l.rel = 'preload'; l.as = 'font'; l.type = 'font/woff2'; l.href = u; l.crossOrigin = 'anonymous'; document.head.appendChild(l); }
  const st = document.createElement('style'); st.id = 'ui-theme-' + t; st.textContent = CSS; document.head.appendChild(st);
  document.documentElement.classList.add('ui-' + t);
  { const sec = CREDITS.find((c) => c.heading === 'Type'); if (sec) for (const l of TYPE_CREDITS) if (!sec.lines.includes(l)) sec.lines.push(l); }
  return t;
}
