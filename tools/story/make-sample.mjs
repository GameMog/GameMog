// Mog City: the test pack tools/story/test-packs/sample.json, made from the default pack (Node, run by hand): everyone
// renamed, the brands and the title changed, 22 lines rewritten, looks and the car's paint changed, harder fights. For
// the render sheets and the voice check (tools/story/sheets.mts); it is a fixture, not a Mog.
import fs from 'node:fs';
import path from 'node:path';
import { validatePack } from '../../wagmi/story/schema.js';
import { ROOT } from './scan.mjs';

const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/story/default.json'), 'utf8'));
const limits = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/story/limits.json'), 'utf8'));
const p = JSON.parse(JSON.stringify(base));
p.title.episode = 'Second Chances';
Object.assign(p.names, { bank: 'OakBank', blimp: 'Zephyrco', occupy: 'Reclaim', college: 'Hudson U' });
const names = { dan: 'Theo', jane: 'Priya', mrbig: 'Mr. Vance', gears: 'Sprocket', fiona: 'Margot', bea: 'Rosa', camp: 'Crowd', moon: 'Biscuit',
  knox: 'Reeve', hooks: 'Dobbs', tank: 'Hale', brick: 'Stone', dash: 'Quill', mack: 'Monty', rook: 'Finch', suits: 'Greys' };
for (const [k, v] of Object.entries(names)) p.cast[k].name = v;
// looks: Theo darker hair and a green jacket, Priya auburn hair, the Greys in navy with pale blue shirts, Biscuit golden
Object.assign(p.cast.dan.look, { hair: '#5A3A22', outfit: '#6FA36F', skin: [0.92, 0.88, 0.86] });
Object.assign(p.cast.jane.look, { hair: '#8A3B1E', outfit: '#C06080' });
Object.assign(p.cast.mrbig.look, { hair: '#202020', outfit: '#7A2A2A', build: 1.08 });
for (const k of ['knox', 'hooks', 'tank', 'brick', 'dash', 'mack', 'rook']) Object.assign(p.cast[k].look, { suit: '#1E2A4A', shirt: '#BFD6F2' });
p.cast.knox.body = 'brick'; p.cast.brick.body = 'knox';
p.cast.moon.look.fur = '#E0B060';
p.car.paint = '#C8102E';
p.difficulty = { enemyHp: 1.2, enemyDamage: 1.1, heroHp: 120, crewExtra: 1, chaseSpeed: 1.1 };
// 22 lines in new words (the opening, Mission 1's arrival and drive, a Mission 3 call)
const L = {
  'intro-dan-delete-your-account-good': "'Log off forever.' Lovely start to the day.",
  'intro-dan-okay-okay-car-then': 'Fine. Car first, then a lawyer, then a long nap.',
  'intro-dan-kidding-obviously': 'Joking. Mostly.',
  'intro-knox-yo-banker-boy-huge': 'Hey! Desk boy! Love your work. Autograph?',
  'intro-dan-i-dont-sign-forms': "I don't sign things on the pavement. Back up, please.",
  'intro-knox-youve-been-let-go': "You're out of a job. So we're taking a little souvenir.",
  'intro-knox-want-it-back-pick': 'Want it back? Answer your phone. Be nice.',
  'intro-mrbig-dan-big-fan-great': '{dan}. Admirer. Lovely trades. Pity none were yours.',
  'intro-dan-who-is-this': 'Who am I talking to?',
  'intro-mrbig-they-call-me-mr': "I'm {mrbig}. I own the bank. You fetched coffee.",
  'intro-mrbig-somebody-has-to-be': "Someone takes the fall. Your login's on all of it.",
  'intro-mrbig-you-sign-the-confession': 'Sign the confession. Details by text. Stop poking.',
  'intro-dan-did-the-ceo-of': 'Did my own CEO just ask me to plead guilty?',
  'intro-dan-okay-you-framed-the': 'Right. Wrong guy to frame.',
  'm1-knox-told-you-to-check': 'We sent you a memo. You never read the memo.',
  'm1-dan-been-a-little-busy': 'I was busy being framed.',
  'm1-knox-nothing-personal-kid-its': "It's just business, kid. Very personal business.",
  'm1-knox-this-is-a-performance': 'Consider this your annual review! It is going badly!',
  'm1-jane-dan-why-is-your': "{dan}, why is your laptop speeding down Fifth Avenue?",
  'm1-dan-because-some-guys-in': 'Because some men in a van took it.',
  'm1-jane-okay-im-on-the': "Right. I've got the tracker. They're heading west. Who were they?",
  'm1-dan-guys-from-my-old': 'People from my last job.',
};
for (const [id, t] of Object.entries(L)) { if (!p.lines[id]) throw new Error('no line ' + id); p.lines[id][1] = t; }
// copy: the opening's place card and a few others in new words
const C = { 'intro.place.murray-hill': 'Murray Hill East', 'intro.caption.the-fall-guy': 'the scapegoat', 'intro.caption.the-laptop': 'The laptop', 'intro.caption.the-evidence': 'the proof' };
for (const [id, t] of Object.entries(C)) { if (!(id in p.copy)) throw new Error('no copy ' + id); p.copy[id] = t; }
const v = validatePack(p, base, limits);
if (!v.ok) { console.error(v.errors.join('\n')); process.exit(1); }
fs.writeFileSync(path.join(ROOT, 'tools/story/test-packs/sample.json'), JSON.stringify(p) + '\n');
console.log('tools/story/test-packs/sample.json:', Object.keys(L).length, 'lines rewritten,', (JSON.stringify(p).length / 1024).toFixed(1), 'KB');
