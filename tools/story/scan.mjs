// Mog City: the story pack's source scanner (Node, for tools/story/extract.mjs and the scrub test). It reads the game's
// own modules with TypeScript's parser (from the GameMog checkout's node_modules: Node finds it up the tree; nothing in
// Mog City depends on it at run time) and answers two questions:
//   literals(file)        every string literal in a module (comments are not literals), with its line and its context:
//                         the call it is an argument of (ui.help, gps.objective, x.fillText, S.t...), the const or the
//                         object key it sits under, and whether it is the speaker id of a say tuple ['Jane', BLUE, '...']
//   copyOf(files)         the moggable copy: the strings that reach the screen through the story's chokepoints (the ui
//                         methods, the GPS's names, canvas text, S.t), each with where it was found
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript'); } catch { throw new Error('tools/story needs the typescript package (run from inside the GameMog checkout, which has it in node_modules)'); }

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
// the modules a Mog's words can live in: the game (wagmi/), less the story runtime itself and the voice build
// (wagmi/storyrun, the Story Kit world runner, is not Mog City's own story: its words are the world's, so it is left
// out here and has its own scrub, tests/storyrun.test.mjs)
export function gameFiles(root = ROOT) {
  const out = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(path.join(root, d)).sort()) {
      const p = path.join(d, f), st = fs.statSync(path.join(root, p));
      if (st.isDirectory()) { if (!/^wagmi\/(story|storyrun|radio\/build|physics|world)$/.test(p)) walk(p); }
      else if (/\.js$/.test(f)) out.push(p);
    }
  };
  walk('wagmi');
  return out;
}

const UI = new Set(['objective', 'help', 'failed', 'passed', 'title', 'place', 'caption', 'dm', 'caller', 'counter', 'offer', 'holdAct', 'call', 'show']);
const GPS = new Set(['objective', 'drive', 'set', 'to']);
const CANVAS = new Set(['fillText', 'strokeText']);
const M2UI = new Set(['chat', 'target', 'prompt', 'banner']);
// colours a part of an objective names its noun with ({ van: 'red' }): never copy
const COLOUR_WORDS = new Set(['yellow', 'green', 'red', 'blue', 'acid', 'white']);

const parse = (file, root) => ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const isStr = (n) => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n);
const lineOf = (sf, n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
const calleeName = (call) => { const e = call.expression; return ts.isPropertyAccessExpression(e) ? e.name.text : ts.isIdentifier(e) ? e.text : null; };
const calleeBase = (call) => { const e = call.expression; return ts.isPropertyAccessExpression(e) ? e.expression.getText() : ''; };

// every string literal of a module, with its context
export function literals(file, root = ROOT) {
  const sf = parse(file, root), out = [];
  const visit = (n) => {
    if (isStr(n)) {
      const p = n.parent;
      // (a property's own name ('Chelsea Park': 'yellow') is a literal too: kept, flagged as a key)
      const key = ts.isPropertyAssignment(p) && p.name === n;
      // (the speaker of a say tuple: ['Jane', BLUE, '...'] (an id, not words); the same in a mission's VOICE map keys)
      const speaker = ts.isArrayLiteralExpression(p) && p.elements[0] === n && p.elements.length >= 3 && p.elements.slice(1).some(isStr);
      let call = null;
      for (let a = p; a && !ts.isSourceFile(a); a = a.parent) if (ts.isCallExpression(a)) { call = `${calleeBase(a)}.${calleeName(a)}`; break; }
      out.push({ file, line: lineOf(sf, n), text: n.text, key, speaker, call });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

// is a literal words a player reads (not a key, a colour, a CSS font, a path, a selector)?
export const wordy = (s) => s.length >= 2 && /[A-Za-z]/.test(s) && !COLOUR_WORDS.has(s) && !/^#[0-9a-f]{3,8}$/i.test(s)
  && !/^[a-z][a-zA-Z0-9_:-]*$/.test(s) && !/\d+px|^(italic |bold )?\d00 /.test(s) && !/^[.#][\w-]/.test(s) && !/^(assets|wagmi|js|media)\//.test(s)
  && !/^[a-z]+(-[a-z0-9]+)+$/.test(s) && !/^(rgba?|hsla?)\(/.test(s) && !/[{}<>`]/.test(s) && !/^\[wagmi\]/.test(s);

// the moggable copy of the given modules: { text, at: 'file:line', ctx } in source order, each text once
// (every: each place a text is found, not only its first)
export function copyOf(files, root = ROOT, { every = false } = {}) {
  const out = [], seen = new Set();
  for (const file of files) {
    const sf = parse(file, root);
    // (the consts of the module by name, for an argument that names one: ui.failed(e.reason, { tip: TIPS[e.reason] }))
    const consts = new Map();
    const collect = (n) => { if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) consts.set(n.name.text, n.initializer); ts.forEachChild(n, collect); };
    collect(sf);
    const take = (n, ctx, done = new Set()) => {
      if (!n || done.has(n)) return; done.add(n);
      if (isStr(n)) {
        const p = n.parent;
        // (an objective's coloured noun: the key is the words, the value the colour)
        if (ts.isPropertyAssignment(p) && p.initializer === n && COLOUR_WORDS.has(n.text)) { if (isStr(p.name) || ts.isIdentifier(p.name)) add(p.name.text, n, ctx, true); return; }
        if (ts.isPropertyAssignment(p) && p.name === n) { if (/:(TIPS|REASONS?)$/.test(ctx)) add(n.text, n, ctx); return; }
        add(n.text, n, ctx); return;
      }
      // (a name, followed to its const; a parameter of a callback over an array, to that array: ARR.forEach((t) => x.fillText(t)))
      if (ts.isIdentifier(n)) {
        const c = consts.get(n.text);
        if (c && (ts.isArrayLiteralExpression(c) || ts.isObjectLiteralExpression(c) || isStr(c))) take(c, `${ctx}:${n.text}`, done);
        const decl = paramArray(n); if (decl) take(decl, ctx, done);
        return;
      }
      if (ts.isElementAccessExpression(n) || ts.isPropertyAccessExpression(n)) { let b = n.expression; while (ts.isElementAccessExpression(b) || ts.isPropertyAccessExpression(b)) b = b.expression; if (ts.isIdentifier(b)) take(b, ctx, done); }
      // (a callback's body is code, not data: skipped, but for its returned literals)
      if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) { if (!ts.isBlock(n.body)) take(n.body, ctx, done); return; }
      if (ts.isCallExpression(n)) { for (const a of n.arguments) take(a, ctx, done); return; }
      ts.forEachChild(n, (k) => take(k, ctx, done));
    };
    const paramArray = (id) => {
      for (let a = id.parent; a && !ts.isSourceFile(a); a = a.parent) {
        if ((ts.isArrowFunction(a) || ts.isFunctionExpression(a)) && a.parameters.some((p) => ts.isIdentifier(p.name) && p.name.text === id.text)) {
          const call = a.parent; if (!call || !ts.isCallExpression(call) || !/^(forEach|map)$/.test(calleeName(call) || '')) return null;
          const arr = call.expression.expression; return arr;
        }
      }
      return null;
    };
    // (a coloured noun may be one plain word: { car: 'blue' })
    const add = (text, n, ctx, noun = false) => {
      const at = `${file}:${lineOf(sf, n)}`;
      if (!(noun ? text.length >= 2 && /^[A-Za-z][\w' .-]*$/.test(text) : wordy(text)) || /^\[\w+\]$/.test(text) || seen.has(every ? `${at}|${text}` : text)) return;
      seen.add(every ? `${at}|${text}` : text); out.push({ text, at, ctx });
    };
    const visit = (n) => {
      if (ts.isCallExpression(n)) {
        const name = calleeName(n), base = calleeBase(n);
        const ui = UI.has(name) && /(^|\.)(ui|U|W\.ui|WAGMI\.ui|phone)\??$/.test(base.replace(/\?$/, ''));
        const gps = GPS.has(name) && /(^|\.)gps$/.test(base);
        const story = name === 't' && /(^|\.)(S|story|Story)$/.test(base);
        // (a mission's own wrappers: objective(parts, target), help(text))
        // (and a fail's reason: fail('Dan got knocked out.'), shown by ui.failed)
        const local = /^(objective|help|fail)$/.test(name) && ts.isIdentifier(n.expression);
        // (Mission 2's overlays, m2-ui.js: Mack's phone, the target's bar, the prompt, the banner, the tail's note)
        const m2 = (M2UI.has(name) && /(^|\.)(U|m2ui)$/.test(base.replace(/\?$/, ''))) || (name === 'set' && /\.tail$/.test(base)) || (name === 'say' && /(^|\.)hud$/.test(base))
          // (a mission's name, act and checkpoints as the pause menu lists them)
          || (name === 'register' && /missions\(W\)$/.test(base));
        if (ui || gps || story || local || m2) for (const a of n.arguments) take(a, m2 ? 'm2ui' : name);
        else if (CANVAS.has(name) && n.arguments[0]) take(n.arguments[0], 'canvas');
      }
      // a step's objective in a definition ({ letter: 'J', name: 'Jane · Bryant Park', objective: [...] }), and the name
      // of a place or a target the GPS shows ({ x, z, name }, { follow, name })
      if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name)) {
        const sib = ts.isObjectLiteralExpression(n.parent) ? n.parent.properties.map((q) => q.name?.getText?.() || '') : [];
        if (n.name.text === 'objective') take(n.initializer, 'objective');
        else if (n.name.text === 'name' && sib.some((k) => /^(x|z|at|follow|letter|objective)$/.test(k))) take(n.initializer, 'name');
        // (a step's DM for when he stalls, and its sign on the street: between missions' { note: [from, text], sign })
        else if (/^(note|sign)$/.test(n.name.text) && sib.includes('objective')) take(n.initializer, n.name.text === 'note' ? 'dm' : 'canvas');
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}
