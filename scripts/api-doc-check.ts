/**
 * The builder's manual must match the runtime.  `npm run check` runs this, the static part; `npm run check:api` the
 * live part (scripts/api-live-check.ts: the dev server and Chrome).
 *
 * lib/runtime/API.md is the whole of what a world builder is told, so every name in it is a promise: a ctx path, an
 * option key, a value, an asset id, a skin, a clip, a part. A name the runtime does not have makes a world that throws
 * (a paid repair pass for its creator) or an option that silently does nothing. This reads every name the manual names
 * (in backticks, in its code examples and in the lists of values their comments give a key; never in prose) and looks
 * for it where the runtime reads it (scripts/api-doc-runtime.ts follows the runtime's names through its code):
 *
 *   - a ctx path (ctx.a.b) in the ctx the runtime builds for the kind of world its chapter is about: a race (the
 *     chapters before "Open worlds", so the plain runtime without open.js and without what it builds `if (OPEN)`), an
 *     open world, a kart race, a shootout
 *   - an option key on the object it is written in: GameMog.world's own keys, a key inside one (`bloom: { strength }`
 *     is a key the runtime reads on a "bloom"), a key of a ctx call's argument (`ctx.assets.surface(id, { mottle })`),
 *     a key of a three.js constructor's options; `open.*`, `kart.*` and `shootout.*` by that kind's runtime
 *   - a value given to a key against the values the runtime compares that key with (`preset: 'golden'`, a kart's
 *     `class`), and an event name (ctx.on's, ctx.kart.on's) against the names the runtime hears
 *   - an asset id, and the skins, hair, clips, garments and parts named for one, in public/assets/library.json
 *   - `THREE.X` among three.js r157's exports, `GameMog.x` among the members the host and the runtime give it,
 *     KartScore's members on lib/runtime/kart-score.js itself; a file or a map named, on disk
 *   - a name in the "Never" chapter: something the world static check (lib/custom-game.ts) refuses
 *   - every other name (a member, a function, a key or a value the reading cannot place) among the words the runtime's
 *     code reads: its property names, object keys and strings (comments left out), three.js r157's, and the library's
 *   - every code example (```js or no language; ```text and the like are not code): wrapped as the live part runs it,
 *     it parses and names nothing it never defines, or it is a known fragment (FRAGMENTS, with its reason); the live
 *     part then runs each one as a tiny world
 *
 * Words that look like names and are not the runtime's are allowed by name below (ALLOW, ALLOW_VALUES, ALLOW_CTX),
 * each with its reason; an entry nothing in the manual needs any more fails the check, so the lists stay short.
 * Run it alone, on the manual or a copy of it: node --import ./scripts/ts-resolve.mjs scripts/api-doc-check.ts [file]
 */
import ts from 'typescript';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Script } from 'node:vm';
import { pathToFileURL } from 'node:url';
import { runtimeSource, renderWorldGame, staticCheckWorld } from '../lib/custom-game.ts';
import { KartScore } from '../lib/kart-score.ts';
import { readSource, type Reading, type CtxNode, type Guard } from './api-doc-runtime.ts';

export type Kind = 'race' | 'open' | 'kart' | 'shootout';
const KINDS: Kind[] = ['race', 'open', 'kart', 'shootout'];
export type Problem = { line: number; name: string; why: string; where?: string };

/* ----------------------------------------------------------- what is allowed -- */
// Names the manual may say that are not the runtime's own, each for its reason. Keep this short: a name added here is a
// name nothing checks.
const ALLOW: Record<string, string> = {
  // the 2D canvas a world draws on in ctx.textures.canvas (the browser's, not the runtime's)
  shadowBlur: 'CanvasRenderingContext2D',
};
// Values the manual gives a key that the runtime never names, because they are what it does by default
export const ALLOW_VALUES: { key: string; value: string; why: string }[] = [
  { key: 'shape', value: 'almond', why: 'creature.js: a creature\'s eyes are almonds unless shape is \'round\'' },
  { key: 'rear', value: 'spoked', why: 'v1.js wheel(): a bike\'s wheel is the spoked one unless \'disc\', \'five\' or \'deep\'' },
  { key: 'front', value: 'spoked', why: 'v1.js wheel(): as rear' },
  { key: 'project', value: 'ground', why: 'v1.js surfaceMaterial: a surface is laid from above unless project is \'box\'' },
];
// ctx paths a chapter names that its kind's ctx does not have, on purpose
export const ALLOW_CTX: { kind: Kind; path: string; why: string }[] = [
  { kind: 'shootout', path: 'ctx.kart', why: 'named only in "Never, in a shootout" (call ctx.kart)' },
  { kind: 'shootout', path: 'ctx.kart.impostors', why: 'a cross-reference: "as ctx.kart.impostors takes them"' },
];
// String values the manual gives for these keys are free text (a name, a label, a line), not names the runtime reads
const FREE_TEXT = new Set(['name', 'names', 'title', 'tagline', 'text', 'say', 'banner', 'objective', 'label', 'livery', 'sign', 'motto',
  'number', 'code', 'place', 'short', 'font', 'seed', 'key', 'verb', 'mark', 'gm', 'by', 'won', 'down', 'kod', 'kos', 'lines', 'ads', 'signs',
  // a cast member's id, the world's own (vision.track: 'dj'); a library track's id is still checked as an id
  'track']);
// Code examples that are not meant to run on their own, each for its reason (matched by a piece of their text). An
// example that cannot run and is not here fails the check.
export const FRAGMENTS: { has: string; why: string }[] = [
  { has: 'assets,     // optional', why: 'the module\'s keys, named in a list (each one is a section below), not code' },
  { has: 'KartScore.score({ timeMs', why: 'signatures: KartScore\'s calls and what they return, the arguments named, not given' },
];
// Placeholders the examples leave to the reader, bound so an example can run as written (each one reported)
const BIND: Record<string, string> = {
  x: '0', y: '0', z: '0',                      // a spot's coordinates (open.keyArt.at: [x, z])
  TAKER: '{}', KEEPER: '{}', REFEREE: '{}',   // a shootout's kits: the world's own constants
  LAMP_RING: 'new THREE.Group()',             // a shootout's floodlights: the world's own ring of lamps
};
// What a world's code may use without defining it
const GLOBALS = new Set(['THREE', 'GameMog', 'KartScore', 'Math', 'Object', 'Array', 'JSON', 'Number', 'String', 'Boolean', 'Infinity', 'NaN', 'undefined',
  'console', 'window', 'self', 'Map', 'Set', 'WeakMap', 'Float32Array', 'Uint8Array', 'Uint16Array', 'Uint32Array', 'Int32Array', 'Int16Array', 'parseInt',
  'parseFloat', 'isFinite', 'isNaN', 'Date', 'Promise', 'Symbol', 'Error', 'arguments', 'apiBox', 'apiOval', 'apiGround']);
// JavaScript's own objects: a path from one is not the runtime's (Math.PI, document.body)
const JS_ROOTS = new Set(['Math', 'Object', 'Array', 'JSON', 'Number', 'String', 'Date', 'window', 'document', 'console', 'self']);
// The world's keys that are a kind of world: what is under them is read by that kind's runtime, whichever chapter
const KIND_KEYS: Record<string, Kind> = { open: 'open', kart: 'kart', shootout: 'shootout' };
// A library map's build() takes the options an open world writes for it (open.js hands them on: open.city, `mapOpts`)
const MAP_OPTIONS: { file: string; key: string }[] = [{ file: 'lib/runtime/maps/city.js', key: 'city' }];
// Where the runtime's switches for a kind of world are declared (scripts/api-doc-runtime.ts GUARDS), by kind
const GUARDED: Record<Kind, Guard[]> = { race: ['open', 'kart', 'shootout'], open: ['kart', 'shootout'], kart: ['open', 'shootout'], shootout: ['open', 'kart'] };

/* --------------------------------------------------------------- the manual -- */
// of: the ctx path a span is a member of, in a list that names one's members ("`ctx.track`: `length`, `frameAt(d)` ...")
// arg: the call whose first argument it is, in a list of event names ("`ctx.on(name, fn)`: `'lap'` (...), `'swing'`")
// keyOf: the key whose values it is, in a list after one ("`project` (`'ground'` or `'box'`)")
// at, end: where its backticks are in the manual's text
type Span = { text: string; line: number; para: number; at: number; end: number; row?: string[]; clipRow?: boolean; of?: string[]; arg?: string; keyOf?: string };
type Block = { code: string; line: number; lang: string };
export type Manual = { lines: string[]; kindAt: (line: number) => Kind; neverAt: (line: number) => boolean; spans: Span[]; blocks: Block[]; problems: Problem[] };

const ID_RE = /^(?:human|hdri|sky|texture|model|heightfield|audio|music|crowd|city)-[a-z0-9]+(?:-[a-z0-9]+)*$/;
// an id as a builder might mistype it (a capital, an underscore): still an id, checked as one
const ID_LIKE = /^(?:human|hdri|sky|texture|model|heightfield|audio|music|crowd|city)[-_][\w-]+$/i;
const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;
const isId = (s: string) => ID_LIKE.test(s) || KEBAB_RE.test(s);
const JS_LANGS = new Set(['', 'js', 'javascript']);
const QUOTED = /^'([a-z][\w-]*)'$/;

export function readManual(text: string): Manual {
  const lines = text.split('\n');
  const problems: Problem[] = [];
  // chapters: everything before "## Open worlds" is the lap race's (and the general rules every world reads)
  const heads: { line: number; kind: Kind; never: boolean }[] = [{ line: 1, kind: 'race', never: false }];
  const blocks: Block[] = [];
  const prose = lines.slice();
  for (let i = 0; i < lines.length; i++) {
    const h = /^## (.*)/.exec(lines[i]);
    if (h) heads.push({ line: i + 1, kind: /^Open worlds/.test(h[1]) ? 'open' : /^Kart races/.test(h[1]) ? 'kart' : /^Penalty shootouts/.test(h[1]) ? 'shootout' : 'race', never: /^Never\b/.test(h[1]) });
    const f = /^(\s*)(`{3,}|~{3,})\s*([\w+-]*)\s*$/.exec(lines[i]);
    if (f) {
      const pad = f[1].length, start = i, fence = f[2];
      const close = new RegExp(`^\\s*${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`);
      let j = i + 1;
      while (j < lines.length && !close.test(lines[j])) j++;
      if (j >= lines.length) { problems.push({ line: i + 1, name: fence, why: 'a code fence that never closes' }); break; }
      blocks.push({ code: lines.slice(start + 1, j).map((l) => l.slice(Math.min(pad, l.length - l.trimStart().length))).join('\n'), line: start + 2, lang: f[3].toLowerCase() });
      for (let k = start; k <= j; k++) prose[k] = '';
      i = j;
    }
  }
  const headAt = (line: number) => { let at = heads[0]; for (const h of heads) if (h.line <= line) at = h; return at; };
  const kindAt = (line: number) => headAt(line).kind, neverAt = (line: number) => headAt(line).never;

  // inline code, paragraph by paragraph (a span may run over a line break, never over a paragraph)
  const spans: Span[] = [], lineAt: number[] = [];
  for (let i = 0, a = 0; i < lines.length; i++) { lineAt.push(a); a += lines[i].length + 1; }
  let para = 0, clipTable = false;
  for (let i = 0; i < prose.length;) {
    if (!prose[i].trim()) { i++; continue; }
    const from = i;
    while (i < prose.length && prose[i].trim()) i++;
    para++;
    for (let k = from; k < i; k++) {
      // a table under a `| clip |` header lists clips in its first cells (an asset table's first cells are asset ids)
      if (/^\s*\|/.test(prose[k])) {
        const cells = prose[k].split('|').slice(1, -1);
        if (/^\s*clip\s*$/.test(cells[0] ?? '')) clipTable = true;
        else if (!/^\s*-+\s*$/.test(cells[0] ?? '') && !/^\s*`/.test(cells[0] ?? '')) clipTable = false;
      }
    }
    const text = prose.slice(from, i).join('\n');
    // (and its spans are left unread: paired wrongly, they would be prose)
    if (((text.match(/`/g) ?? []).length) % 2) { problems.push({ line: from + 1, name: '`', why: 'an odd number of backticks in this paragraph: a code span never closes' }); continue; }
    // a ctx path then a colon opens a list of its members; commas (and a "(returns `{...}`)" after one) keep it open
    let member: string[] | null = null, pending: string[] | null = null, last = 0;
    // an event list: the quoted names after `ctx.on`, outside the brackets that describe each, to the sentence's end
    let ev: { arg: string; d: number; min: number } | null = null;
    // a key's values: `key` (`'a'`, `'b'` or `'c'`)
    let prevKey: string | null = null, valuesOf: string | null = null;
    for (const m of text.matchAll(/`([^`]+)`/g)) {
      const line = from + 1 + (text.slice(0, m.index).match(/\n/g) ?? []).length;
      const between = text.slice(last, m.index), t = m[1].trim();
      last = m.index + m[0].length;
      if (pending && /:\s*$/.test(between)) member = pending;
      else if (member && !/^\s*(?:,|\),|\(returns)\s*$/.test(between)) member = null;
      pending = /^ctx(?:\.[A-Za-z_$][\w$]*)+$/.test(t) ? t.split('.') : null;
      const of = member && /^[A-Za-z_$][\w$]*(?:\(.*\))?$/.test(t) ? member : undefined;
      if (ev) {
        if (/\n\s*(?:[-*]|\d+\.)\s|\.\s/.test(between)) ev = null;
        else for (const ch of between) { if (ch === '(') ev.d++; else if (ch === ')') { ev.d--; ev.min = Math.min(ev.min, ev.d); } }
      }
      const arg = ev && QUOTED.test(t) && ev.d === ev.min ? ev.arg : undefined;
      const on = /^(ctx(?:\.[A-Za-z_$][\w$]*)*\.on)\b(?:\(.*\))?$/s.exec(t);
      if (on) ev = { arg: `@${on[1]}#0`, d: 0, min: 0 };
      if (valuesOf && !(QUOTED.test(t) && /^\s*(?:,|or|,\s*or)\s*$/.test(between))) valuesOf = null;
      if (!valuesOf && prevKey && QUOTED.test(t) && /^\s*\(\s*$/.test(between)) valuesOf = prevKey;
      prevKey = /^[A-Za-z_]\w*$/.test(t) ? t : null;
      const row = /^\s*\|/.test(lines[line - 1]) ? [...(lines[line - 1].split('|')[1] ?? '').matchAll(/`([^`]+)`/g)].map((r) => r[1]).filter((s) => ID_RE.test(s)) : undefined;
      const first = row && (lines[line - 1].split('|')[1] ?? '').includes(m[0]);
      spans.push({ text: m[1], line, para, at: lineAt[from] + m.index!, end: lineAt[from] + m.index! + m[0].length, row: row && !first ? row : undefined,
        clipRow: clipTable && first && /^\s*\|/.test(lines[line - 1]), of, arg, keyOf: valuesOf ?? undefined });
    }
  }
  return { lines, kindAt, neverAt, spans, blocks, problems };
}

/* -------------------------------------------------- names in a piece of code -- */
type Tok = { k: 'id' | 'str' | 'p' | 'other'; t: string; v: string; pos: number };
function tokens(code: string): Tok[] {
  const sc = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, code);
  const out: Tok[] = [];
  for (let k = sc.scan(); k !== ts.SyntaxKind.EndOfFileToken; k = sc.scan()) {
    const t = sc.getTokenText(), pos = sc.getTokenStart();
    if ((k === ts.SyntaxKind.Identifier || (k >= ts.SyntaxKind.FirstKeyword && k <= ts.SyntaxKind.LastKeyword)) && /^[A-Za-z_$][\w$]*$/.test(t)) out.push({ k: 'id', t, v: t, pos });
    else if (k === ts.SyntaxKind.StringLiteral || k === ts.SyntaxKind.NoSubstitutionTemplateLiteral) out.push({ k: 'str', t, v: sc.getTokenValue(), pos });
    else if (k >= ts.SyntaxKind.FirstPunctuation && k <= ts.SyntaxKind.LastPunctuation) out.push({ k: 'p', t, v: t, pos });
    else out.push({ k: 'other', t, v: t, pos });
  }
  return out;
}
const KEYWORDS = new Set(['var', 'let', 'const', 'function', 'return', 'new', 'if', 'else', 'for', 'while', 'true', 'false', 'null', 'undefined', 'typeof',
  'this', 'in', 'of', 'do', 'break', 'continue', 'switch', 'case', 'default', 'throw', 'try', 'catch', 'finally', 'void', 'delete', 'instanceof']);

/**
 * Where a key is written: root is '@world' (GameMog.world's own object), '@ctx.a.b#i' (a ctx call's i-th argument),
 * '@three' (a three.js constructor's options), '?' (a span of prose: the runtime's options, but whose is unsaid) or
 * null (an object of the world's own); chain the keys it is nested in, outermost first.
 */
export type Owner = { root: string | null; chain: string[] };
export type Found =
  | { what: 'path'; segs: string[]; calls: boolean[]; at: number }
  | { what: 'name'; name: string; role: 'key' | 'member' | 'fn' | 'bare'; at: number; owner?: Owner }
  | { what: 'value'; value: string; key: string | null; at: number; owner?: Owner; arg?: string };

/**
 * The names a span or an example names: paths, keys, shorthand members, functions, a lone name, and string values;
 * each key and value with where it is written. `top` owns the keys written at the top level (an example that is a run
 * of the world's keys: '@world'; a span of prose: '?').
 */
export function namesIn(code: string, top: string | null = null): Found[] {
  const T = tokens(code), out: Found[] = [];
  const isP = (i: number, s: string) => T[i]?.k === 'p' && T[i].t === s;
  const close = (i: number) => { let d = 0; for (let j = i; j < T.length; j++) { if (T[j].k !== 'p') continue; if ('([{'.includes(T[j].t)) d++; else if (')]}'.includes(T[j].t) && --d === 0) return j; } return T.length; };
  // a colon that ends a ternary, not a key
  const ternaryColon = new Set<number>(), tern: number[] = [0];
  for (let i = 0; i < T.length; i++) {
    const t = T[i];
    if (t.k !== 'p') continue;
    if ('([{'.includes(t.t)) tern.push(0);
    else if (')]}'.includes(t.t)) tern.pop();
    else if (t.t === '?' && !(isP(i + 1, ',') || isP(i + 1, '}') || isP(i + 1, ')') || isP(i + 1, ':'))) tern[tern.length - 1]++;
    else if (t.t === ':' && tern[tern.length - 1] > 0) { tern[tern.length - 1]--; ternaryColon.add(i); }
  }
  const isKey = (i: number) => T[i]?.k === 'id' && isP(i + 1, ':') && !ternaryColon.has(i + 1);
  // the callee a bracket at i belongs to: `a.b.c(` (and `new` before it)
  const calleeAt = (i: number) => {
    const segs: string[] = [];
    let j = i - 1;
    while (T[j]?.k === 'id') { segs.unshift(T[j].t); if (isP(j - 1, '.')) j -= 2; else break; }
    return segs.length ? { path: segs.join('.'), isNew: T[j - 1]?.t === 'new' } : null;
  };
  type Frame = { ch: string; owner: Owner | null; call?: string; isNew?: boolean; arg: number };
  const stack: Frame[] = [];
  const topOwner = (): Owner | null => stack.length ? stack[stack.length - 1].owner : top === null ? null : { root: top, chain: [] };
  const rootOf = (call: string, isNew: boolean | undefined, arg: number) =>
    call === 'GameMog.world' && arg === 0 ? '@world' : /^ctx\./.test(call) ? `@${call}#${arg}` : /^(?:THREE|T)\.[A-Z]/.test(call) && isNew && arg === 0 ? '@three' : null;
  const opened = (i: number): Frame => {
    const ch = T[i].t, up = stack[stack.length - 1];
    if (ch === '(') { const c = calleeAt(i); return { ch, owner: null, call: c?.path, isNew: c?.isNew, arg: 0 }; }
    // `key: {` and `key: [` nest in the key; an object in a call's arguments is that call's; in a list, the list's
    if (isP(i - 1, ':') && isKey(i - 2)) {
      const o = up ? up.owner : top === null ? null : { root: top, chain: [] };
      return { ch, owner: o && { root: o.root, chain: [...o.chain, T[i - 2].t] }, arg: 0 };
    }
    if (up?.ch === '(' && up.call) { const r = rootOf(up.call, up.isNew, up.arg); return { ch, owner: r ? { root: r, chain: [] } : null, arg: 0 }; }
    if (up?.ch === '[') return { ch, owner: up.owner, arg: 0 };
    return { ch, owner: null, arg: 0 };
  };
  for (let i = 0; i < T.length; i++) {
    const t = T[i], prev = T[i - 1];
    if (t.k === 'p') {
      if ('([{'.includes(t.t)) stack.push(opened(i));
      else if (')]}'.includes(t.t)) stack.pop();
      else if (t.t === ',' && stack.length) stack[stack.length - 1].arg++;
      continue;
    }
    if (t.k === 'str') {
      // the key it is given to: `key: 'value'`, `key: ['a', 'b']`; or a call's argument `ctx.on('lap', ...)`
      let key: string | null = null, arg: string | undefined;
      const up = stack[stack.length - 1];
      if (isP(i - 1, ':') && T[i - 2]?.k === 'id') key = T[i - 2].t;
      else if (up?.ch === '[' && up.owner?.chain.length) key = up.owner.chain[up.owner.chain.length - 1];
      if (!key && up?.ch === '(' && up.call && /^ctx\./.test(up.call)) arg = `@${up.call}#${up.arg}`;
      out.push({ what: 'value', value: t.v, key, at: t.pos, owner: topOwner() ?? undefined, arg });
      continue;
    }
    if (t.k !== 'id') continue;
    if (isP(i - 1, '.') || isP(i - 1, '?.')) continue;                  // a later part of a path, read with its root
    if (isP(i + 1, '.') && T[i + 2]?.k === 'id' || isP(i + 1, '(') && isP(close(i + 1) + 1, '.')) {
      // a path: a.b.c, with calls along it (ctx.assets.info(id).clips)
      const segs = [t.t], calls = [false];
      let j = i + 1;
      while (j < T.length) {
        if (isP(j, '(')) { calls[calls.length - 1] = true; j = close(j) + 1; continue; }
        if ((isP(j, '.') || isP(j, '?.')) && T[j + 1]?.k === 'id') { segs.push(T[j + 1].t); calls.push(false); j += 2; continue; }
        break;
      }
      // (its later parts are passed over as they come; a call's arguments are read as any code is)
      if (!KEYWORDS.has(t.t) || t.t === 'this') out.push({ what: 'path', segs, calls, at: t.pos });
      continue;
    }
    if (KEYWORDS.has(t.t) && !isKey(i)) continue;
    if (prev?.t === 'new' || prev?.t === 'function' || prev?.t === 'var' || prev?.t === 'let' || prev?.t === 'const') continue;
    if (isKey(i) && (i === 0 || isP(i - 1, '{') || isP(i - 1, ',') || isP(i - 1, '('))) { out.push({ what: 'name', name: t.t, role: 'key', at: t.pos, owner: topOwner() ?? undefined }); continue; }
    if (isP(i + 1, '(')) { if (!GLOBALS.has(t.t)) out.push({ what: 'name', name: t.t, role: 'fn', at: t.pos }); continue; }
    if (stack[stack.length - 1]?.ch === '{' && (isP(i - 1, '{') || isP(i - 1, ',')) && (isP(i + 1, ',') || isP(i + 1, '}') || isP(i + 1, '?'))) { out.push({ what: 'name', name: t.t, role: 'member', at: t.pos, owner: topOwner() ?? undefined }); continue; }
    if (T.length === 1 || T.length === 3 && isP(i + 1, '=')) { if (!GLOBALS.has(t.t)) out.push({ what: 'name', name: t.t, role: 'bare', at: t.pos }); continue; }
  }
  return out;
}

/**
 * The values an example's comments list for a key: `pattern: 'band', // plain, band, sash, stripes` (a list with the
 * line's own value in it), or `// kind: tank, tee, long` (a list under a key the line gives, or one the runtime reads),
 * and every quoted value in a comment (`// 'small' or 'big'`: the line's key's, when the line gives one key a string,
 * except in an aside in brackets). A comment-only line after one with a comment goes on with it. Lists are split on
 * commas and "or"; asides in brackets are left out; only plain single words, two or more, count.
 */
export function commentValues(code: string, isKey: (k: string) => boolean): Found[] {
  const out: Found[] = [], lines = code.split('\n');
  let at = 0, prev: { text: string; at: number; vals: string[]; keys: string[]; strKey: string | null } | null = null;
  const flush = () => {
    if (!prev) return;
    const { text, vals, keys, strKey } = prev, start = prev.at;
    // (a quote opens after no letter: the world's own sky is no string)
    const QUOTE = /(?<![\w'])'([^'\n]*)'(?![\w])/g;
    for (const q of text.matchAll(QUOTE)) {
      let d = 0; for (const ch of text.slice(0, q.index)) d += ch === '(' ? 1 : ch === ')' ? -1 : 0;
      out.push({ what: 'value', value: q[1], key: d > 0 ? null : strKey, at: start, owner: { root: '?', chain: [] } });
    }
    let flat = text.replace(QUOTE, ''), was = '';
    while (was !== flat) { was = flat; flat = flat.replace(/\([^()]*\)/g, ''); }
    for (const seg of flat.split(';')) {
      const c = seg.lastIndexOf(':'), label = c >= 0 ? seg.slice(0, c).trim() : '', list = c >= 0 ? seg.slice(c + 1) : seg;
      const items = list.split(/,|\bor\b/).map((w) => w.trim()).filter((w) => /^[a-z][A-Za-z0-9]+$/.test(w));
      if (items.length < 2) continue;
      // (the values of the line's keys whose own value it lists, or of the key it is labelled with)
      const mine = keys.filter((_, k) => items.includes(vals[k]));
      const owners = mine.length ? mine : /^[A-Za-z_]\w*$/.test(label) && (keys.includes(label) || isKey(label)) ? [label] : [];
      for (const k of owners) for (const w of items) out.push({ what: 'value', value: w, key: k, at: start, owner: { root: '?', chain: [] } });
    }
    prev = null;
  };
  for (const line of lines) {
    const i = commentAt(line);
    if (i >= 0 && !line.slice(0, i).trim() && prev) prev.text += ' ' + line.slice(i + 2);
    else {
      flush();
      if (i >= 0 && line.slice(0, i).trim()) {
        const T = tokens(line.slice(0, i));
        // each key the line writes, and the string it gives it (if it gives one)
        const keys: string[] = [], vals: string[] = [];
        T.forEach((t, k) => { if (t.k === 'id' && T[k + 1]?.t === ':') { keys.push(t.t); vals.push(T[k + 2]?.k === 'str' ? T[k + 2].v : ''); } });
        const given = keys.filter((_, k) => vals[k] !== '');
        prev = { text: line.slice(i + 2), at: at + i, vals, keys, strKey: given.length === 1 ? given[0] : null };
      }
    }
    at += line.length + 1;
  }
  flush();
  return out;
}
/** Where a line's `//` comment starts (not inside a string), or -1. */
function commentAt(line: string) {
  let q = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = ''; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    else if (c === '/' && line[i + 1] === '/') return i;
  }
  return -1;
}

/* ------------------------------------------------------------- the runtime -- */
// A kind of world as the check sees it: what its runtime reads (shared by a race and an open world), the words it
// has, and the ctx its world gets
type KindReading = { r: Reading; names: Set<string>; ctx: CtxNode };
type Known = { kinds: Record<Kind, KindReading>; three: Set<string>; threeExports: Set<string>; gm: Set<string>;
  lib: Set<string>; assets: Record<string, { kind: string; words: Set<string>; parts: string[] }>; maps: Set<string>; problems: Problem[] };
let KNOWN: Known | null = null;
const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');

/** A file's words only (three.js, the endoskeleton): property names, keys, strings, and what it exports. */
function wordsOf(src: string, file: string) {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  const names = new Set<string>(), exports = new Set<string>();
  const words = (s: string) => {
    if (s.length > 80) return;
    if (/^[\w$-]+$/.test(s)) names.add(s);
    else if (/^[a-z_$][\w$-]*(?:[ ,|][a-z_$][\w$-]*)+$/.test(s)) for (const w of s.split(/[ ,|]/)) names.add(w);
  };
  const key = (n: ts.PropertyName | ts.BindingName) => ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n) || ts.isPrivateIdentifier(n) ? n.text : null;
  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAccessExpression(n)) names.add(n.name.text);
    else if (ts.isPropertyAssignment(n) || ts.isMethodDeclaration(n) || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n)) { const k = key(n.name); if (k) names.add(k); }
    else if (ts.isShorthandPropertyAssignment(n)) names.add(n.name.text);
    else if (ts.isObjectBindingPattern(n)) for (const e of n.elements) { const k = key(e.propertyName ?? e.name); if (k) names.add(k); }
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) words(n.text);
    else if (ts.isRegularExpressionLiteral(n)) for (const w of n.text.match(/[A-Za-z_$][\w$]*/g) ?? []) names.add(w);
    else if (ts.isClassDeclaration(n) && n.name) names.add(n.name.text);
    if (ts.isExportSpecifier(n)) { names.add(n.name.text); exports.add(n.name.text); }
    if ((ts.isClassDeclaration(n) || ts.isFunctionDeclaration(n) || ts.isVariableStatement(n)) && n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) { if (ts.isIdentifier(d.name)) exports.add(d.name.text); }
      else if (n.name) exports.add(n.name.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { names, exports };
}

export function known(): Known {
  if (KNOWN) return KNOWN;
  const problems: Problem[] = [];
  const fail = (name: string, why: string) => problems.push({ line: 0, name, why, where: 'scripts/api-doc-check.ts' });
  // the runtime as each kind of world is served it (a race and an open world share one); and the endoskeleton, a
  // script any world gets ahead of it when it asks (a shootout's robot keeper too)
  // (and a test drive's scripts, which read some of the world's options too: open.keyArt's look and tilt)
  const plainSrc = runtimeSource(1), drive = `\n${read('lib/runtime/drive.js')}`, lens = `\n${read('lib/runtime/shoot-lens.js')}`;
  const plain = readSource(plainSrc + drive, 'runtime.js'), kart = readSource(runtimeSource(1, true) + drive, 'runtime-kart.js');
  const shoot = readSource(runtimeSource(1, false, true) + lens + drive, 'runtime-shootout.js');
  // a library map's options, as its build() reads them (open.city: the city map's district, time, ads, ...)
  for (const m of MAP_OPTIONS) {
    if (!existsSync(join(process.cwd(), m.file))) continue;
    let found = false;
    const map = readSource(read(m.file), m.file, { worldCtx: false, seed: (rd) => {
      // the bundle's export `build: () => build2`, and that function's first parameter
      const visit = (n: ts.Node): void => {
        if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && n.name.text === 'build' && ts.isArrowFunction(n.initializer) && ts.isIdentifier(n.initializer.body)) {
          const name = n.initializer.body.text;
          const find = (d: ts.Node): void => { if (ts.isFunctionDeclaration(d) && d.name?.text === name) { const f = rd.fnOf.get(d); if (f !== undefined && rd.fns[f].params[0] !== undefined) { rd.add(rd.fns[f].params[0], m.key); found = true; } } ts.forEachChild(d, find); };
          find(rd.sf);
        }
        ts.forEachChild(n, visit);
      };
      visit(rd.sf);
    } });
    if (!found) fail(`MAP_OPTIONS ${m.file}`, 'the map no longer exports build() as the check reads it: the map\'s options go unchecked');
    if (!plain.keys.get('open')?.has(m.key)) fail(`MAP_OPTIONS ${m.key}`, `open.js no longer reads open.${m.key}: drop it from MAP_OPTIONS`);
    const merge = (into: Map<string, Set<string>>, from: Map<string, Set<string>>, k: string) => { const f = from.get(k); if (f) { const s = into.get(k) ?? new Set<string>(); for (const v of f) s.add(v); into.set(k, s); } };
    merge(plain.keys, map.keys, m.key);
    for (const k of map.keys.get(m.key) ?? []) { merge(plain.values, map.values, k); merge(plain.takes, map.takes, k); }
  }
  // what a race does not run: open.js (inlined at its marker) and what the runtime builds `if (OPEN)`
  const openText = read('lib/runtime/open.js').replace('/*@include derby.js*/', () => read('lib/runtime/derby.js')).replace('/*@include climb.js*/', () => read('lib/runtime/climb.js')).replace('/*@include trav.js*/', () => read('lib/runtime/trav.js'));
  const openAt = plainSrc.indexOf(openText);
  if (openAt < 0) fail('open.js', 'not found in the runtime as lib/custom-game.ts runtimeSource assembles it: the race\'s ctx would carry the open world\'s');
  for (const [r, want] of [[plain, ['OPEN']], [kart, ['OPEN', 'KART']], [shoot, ['OPEN', 'SHOOT']]] as const) for (const g of want) if (!r.guards.has(g)) fail(`GUARDS ${g}`, `the runtime no longer declares ${g}: what it builds for that kind of world is not told apart`);
  const endo = wordsOf(read('lib/runtime/endo.js'), 'endo.js').names;
  const withEndo = (s: Set<string>) => { const o = new Set(s); for (const n of endo) o.add(n); return o; };
  const plainNames = withEndo(plain.names);
  const kinds: Record<Kind, KindReading> = {
    race: { r: plain, names: plainNames, ctx: plain.ctx(GUARDED.race, openAt >= 0 ? [openAt, openAt + openText.length] : undefined) },
    open: { r: plain, names: plainNames, ctx: plain.ctx(GUARDED.open) },
    kart: { r: kart, names: withEndo(kart.names), ctx: kart.ctx(GUARDED.kart) },
    shootout: { r: shoot, names: withEndo(shoot.names), ctx: shoot.ctx(GUARDED.shootout) },
  };
  const three = wordsOf(read('node_modules/three/build/three.module.js'), 'three.module.js');
  // GameMog's members: the host's (lib/custom-game.ts, in front of every world) and the runtime's (GM.world, ...)
  const page = renderWorldGame('GameMog.world({});', { title: 'x', tagline: '' }, 'x');
  const host = readSource(/<script>([\s\S]*?)<\/script>/.exec(page)?.[1] ?? '', 'host.js', { worldCtx: false });
  const gm = new Set([...(host.writes.get('GameMog') ?? []), ...(plain.writes.get('GameMog') ?? [])]);
  const L = JSON.parse(read('public/assets/library.json')) as { assets: Record<string, { kind: string; meta?: Record<string, unknown> }> };
  const lib = new Set<string>(), assets: Known['assets'] = {};
  for (const [id, a] of Object.entries(L.assets)) {
    const words = new Set<string>();
    const walk = (v: unknown): void => { if (typeof v === 'string') words.add(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
    for (const k of ['parts', 'skins', 'hair', 'clips', 'outfits', 'morphs', 'maps', 'slots']) walk(a.meta?.[k]);
    for (const w of words) lib.add(w);
    assets[id] = { kind: a.kind, words, parts: Array.isArray(a.meta?.parts) ? a.meta!.parts as string[] : [] };
  }
  const maps = new Set(['ocean-drive', 'city'].filter((m) => existsSync(join(process.cwd(), 'lib/runtime/maps', `${m}.js`))));
  return (KNOWN = { kinds, three: three.names, threeExports: three.exports, gm, lib, assets, maps, problems });
}

/* -------------------------------------------------------------- the checks -- */
export type Report = { problems: Problem[]; notes: string[]; stats: { spans: number; names: number; scoped: number; ctx: number; assets: number; examples: number; fragments: number; never: number } };

export function checkManual(text: string): Report {
  const K = known(), M = readManual(text);
  const problems: Problem[] = [...K.problems, ...M.problems], notes: string[] = [];
  const stats = { spans: M.spans.length, names: 0, scoped: 0, ctx: 0, assets: 0, examples: 0, fragments: 0, never: 0 };
  const seen = new Set<string>(), used = new Set<string>();
  const fail = (line: number, name: string, why: string) => { const k = `${line}|${name}|${why}`; if (!seen.has(k)) { seen.add(k); problems.push({ line, name, why }); } };
  const label = (kind: Kind) => kind === 'race' ? 'race (and every world\'s)' : kind;

  // anywhere in what the kind's runtime reads: the fallback, where the reading cannot place a name
  const isName = (n: string, kind: Kind) => {
    if (n.length <= 1 || K.kinds[kind].names.has(n) || K.three.has(n) || K.lib.has(n)) return true;
    if (n in ALLOW) { used.add(`ALLOW ${n}`); return true; }
    return false;
  };
  // the runtime that reads an owner's keys: a kind's key (open, kart, shootout) is read by that kind's
  const kindOf = (kind: Kind, owner?: Owner) => owner?.root === '@world' && owner.chain.length && KIND_KEYS[owner.chain[0]] ? KIND_KEYS[owner.chain[0]] : kind;
  const ownerName = (p: string) => p === '@world' ? 'GameMog.world({...})' : /^@ctx/.test(p) ? `${p.slice(1).replace(/#(\d+)$/, (_, i) => `(...)'s argument ${Number(i) + 1}`)}` : `\`${p}\``;
  const list = (s: Set<string>, n = 14) => { const a = [...s].filter((x) => /^[A-Za-z]/.test(x)).sort(); return a.slice(0, n).map((x) => `\`${x}\``).join(', ') + (a.length > n ? ', ...' : ''); };

  /** A key, on the object it is written in. */
  const checkKey = (name: string, kind: Kind, owner: Owner | undefined, role: string): string | null => {
    if (owner?.root === '@three' && !owner.chain.length) { stats.scoped++; return K.three.has(name) ? null : `three.js r157 reads no \`${name}\` (a key of a three.js constructor's options)`; }
    const parent = owner && owner.root !== null ? owner.chain.length ? owner.chain[owner.chain.length - 1] : owner.root : null;
    const k = kindOf(kind, owner), R = K.kinds[k].r;
    // (and an object in a table the runtime looks up by a name, crew[kind], is read as the table: a "crew")
    const up = owner && owner.chain.length >= 2 ? owner.chain[owner.chain.length - 2] : owner?.chain.length === 1 ? owner.root : null;
    const reads = new Set<string>();
    if (parent && R.keys.has(parent) && !R.anyKey.has(parent)) for (const x of R.keys.get(parent)!) reads.add(x);
    if (parent && up && R.anyKey.has(up) && R.keys.has(up) && !R.anyKey.has(parent)) for (const x of R.keys.get(up)!) reads.add(x);
    if (parent && parent !== '?' && reads.size) {
      stats.scoped++;
      const shown = new Set([...(R.own.get(parent) ?? [])].filter((x) => reads.has(x)));
      return reads.has(name) ? null : `the ${label(k)} runtime reads no \`${name}\` on ${ownerName(parent)} (it reads ${list(shown.size ? shown : reads)})`;
    }
    return isName(name, k) ? null : `the ${label(k)} runtime reads no \`${name}\` (a ${role} the manual names)`;
  };
  /** A value, against what the runtime compares its key with (or the names its call hears). */
  const checkValue = (v: string, key: string | null, kind: Kind, owner: Owner | undefined, arg?: string): string | null => {
    const k = kindOf(kind, owner), R = K.kinds[k].r;
    const of = arg ?? (key && owner?.root != null && !FREE_TEXT.has(key) ? key : null);
    const known = of && !R.openValues.has(of) ? R.values.get(of) : undefined;
    const allowed = ALLOW_VALUES.find((a) => a.key === (of ?? key) && a.value === v);
    if (allowed) { used.add(`ALLOW_VALUES ${allowed.key}=${v}`); return null; }
    if (of && known?.size) {
      stats.scoped++;
      // (an event is one the runtime both hears and sends: ctx.on takes it, and something emits it)
      const sent = arg ? R.sends.get(arg) : undefined;
      if (arg && known.has(v) && sent && !sent.has(v)) return `the ${label(k)} runtime hears '${v}' on ${ownerName(arg)} but never sends it (it sends ${list(sent, 30)})`;
      if (known.has(v) || R.takes.get(of)?.has(v)) return null;
      return arg ? `the ${label(k)} runtime hears no '${v}' on ${ownerName(arg)} (it hears ${list(known, 30)})`
        : `the ${label(k)} runtime knows \`${of}\` as ${list(new Set([...known, ...(R.takes.get(of) ?? [])]), 30)}, not '${v}'`;
    }
    if (key && FREE_TEXT.has(key)) return null;
    if (!/^[a-z][A-Za-z0-9_]*$/.test(v)) return null;
    return isName(v, k) ? null : `the ${label(k)} runtime reads no '${v}'${key ? ` (given to ${key})` : ''}`;
  };

  const checkFound = (f: Found, kind: Kind, at: number, prose: boolean, declared?: Set<string>) => {
    if (f.what === 'path') {
      const [root, ...rest] = f.segs;
      if (root === 'ctx') { stats.ctx++; const why = checkCtx(f.segs, f.calls, kind, K, used, isName); if (why) fail(at, f.segs.join('.'), why); return; }
      if (root === 'KartScore') { for (const s of rest.slice(0, 1)) if (!(s in KartScore)) fail(at, `KartScore.${s}`, 'lib/runtime/kart-score.js has no such member'); return; }
      if (root === 'THREE') {
        if (rest[0] && !K.threeExports.has(rest[0])) fail(at, `THREE.${rest[0]}`, 'three.js r157 exports no such name');
        for (const s of rest.slice(1)) if (!K.three.has(s)) fail(at, `THREE.${rest.join('.')}`, `three.js r157 has no \`${s}\``);
        return;
      }
      if (root === 'GameMog') { for (const s of rest.slice(0, 1)) if (!K.gm.has(s)) fail(at, `GameMog.${s}`, `the host and the runtime give GameMog no such member (it has ${list(K.gm)})`); return; }
      if (JS_ROOTS.has(root)) return;
      // in prose, a path from one of the world's own keys is an option (open.kicks, graphics.shadows.follow): each part
      // on the one before it; anything else, a world's own variable (s.brawl.stance): every later part by name
      if (prose && !f.calls.some(Boolean) && K.kinds[kindOf(kind, { root: '@world', chain: [root] })].r.keys.get('@world')?.has(root)) {
        for (let i = 1; i < f.segs.length; i++) { stats.names++; const why = checkKey(f.segs[i], kind, { root: '@world', chain: f.segs.slice(0, i) }, 'key'); if (why) fail(at, f.segs.join('.'), why); }
        return;
      }
      for (const s of rest) { stats.names++; if (!isName(s, kind)) fail(at, f.segs.join('.'), `the ${label(kind)} runtime reads no \`${s}\``); }
      return;
    }
    if (f.what === 'name') {
      // (a function or a name the example itself defines is its own)
      if (declared?.has(f.name) && (f.role === 'fn' || f.role === 'bare')) return;
      stats.names++;
      const why = f.role === 'key' || f.role === 'member' ? checkKey(f.name, kind, f.owner, f.role)
        : isName(f.name, kind) ? null : `the ${label(kind)} runtime reads no \`${f.name}\` (a ${f.role === 'fn' ? 'function' : 'name'} the manual names)`;
      if (why) fail(at, f.name, why);
      return;
    }
    // a string value: an asset or a map id, or a name from a set (a kind, a preset, a clip), unless it is free text
    const v = f.value;
    if (isId(v)) { stats.assets++; const why = checkId(v, K); if (why) fail(at, v, why); if (f.key === 'map' && !K.maps.has(v)) fail(at, v, 'no such map in lib/runtime/maps'); return; }
    if (!f.arg && !/^[a-z][A-Za-z0-9_]*$/.test(v)) return;
    stats.names++;
    const why = checkValue(v, f.key, kind, f.owner, f.arg);
    if (why) fail(at, `'${v}'`, why);
  };
  // the Never chapter: what it names is what the world static check refuses (or the runtime's own)
  const base = new Set(staticCheckWorld('GameMog.world({ build: function (ctx) { } });'));
  const refused = (name: string) => [`var x = ${name};`, `${name}(1);`, `x.${name} = 1; x.${name}(1);`].some((s) => staticCheckWorld(`GameMog.world({ build: function (ctx) { var x = {}; ${s} } });`).some((p) => !base.has(p)));

  for (const s of M.spans) {
    const kind = M.kindAt(s.line), t = s.text.trim();
    // a member in a ctx path's list (`frameAt(d)` after "`ctx.track`:") is that path's
    if (s.of) { const name = t.replace(/\(.*$/, ''); checkFound({ what: 'path', segs: [...s.of, name], calls: [...s.of.map(() => false), t.includes('(')], at: 0 }, kind, s.line, true); continue; }
    if (/^#[0-9A-Fa-f]{6}$|^#RRGGBB$/.test(t)) continue;
    if (/^(?:lib|docs|scripts|worlds|public)\/[\w./-]+$/.test(t)) { if (!existsSync(join(process.cwd(), t))) fail(s.line, t, 'no such file'); continue; }
    if (isId(t)) { stats.assets++; const why = checkId(t, K); if (why) fail(s.line, t, why); continue; }
    // an event's name in a list after ctx.on, a value in a list after its key
    const q = QUOTED.exec(t);
    if (q && (s.arg || s.keyOf)) { stats.names++; const why = checkValue(q[1], s.keyOf ?? null, kind, { root: '?', chain: [] }, s.arg); if (why) fail(s.line, t, why); continue; }
    // a table row's own words: a model's part (or a piece of one: `_02`), a person's skin, hair or clip
    if (s.row?.length && /^[A-Za-z_][\w]*$/.test(t)) {
      const rows = s.row.map((id) => K.assets[id]).filter(Boolean);
      if (rows.some((a) => a.kind === 'model')) { if (!rows.some((a) => a.parts.some((p) => p.includes(t)))) fail(s.line, t, `no part of ${s.row.join(', ')} is named so`); continue; }
      if (rows.some((a) => /^human/.test(a.kind))) { if (!rows.some((a) => a.words.has(t))) fail(s.line, t, `${s.row.join(', ')} has no skin, hair, clip, garment or shape named so`); continue; }
    }
    if (s.clipRow && /^[A-Za-z_]\w*$/.test(t)) {
      if (!Object.values(K.assets).some((a) => a.kind === 'human-moves' && a.words.has(t))) fail(s.line, t, 'no motion pack (human-moves-*) has a clip named so');
      continue;
    }
    if (M.neverAt(s.line)) {
      // (a name the world static check refuses is a promise kept; any other is checked as any name is, and said so)
      const found = namesIn(s.text);
      const names = found.map((f) => f.what === 'path' ? f.segs.join('.') : f.what === 'name' ? f.name : null).filter((n): n is string => !!n);
      if (names.length && names.every(refused)) { stats.never += names.length; continue; }
      const n0 = problems.length;
      for (const f of namesIn(s.text, '?')) checkFound(f, kind, s.line, true);
      for (const p of problems.slice(n0)) p.why += ', and the world static check (lib/custom-game.ts staticCheckWorld) does not refuse it';
      continue;
    }
    for (const f of namesIn(s.text, '?')) checkFound(f, kind, s.line, true);
  }

  // the code examples: every name in them, and each one runnable as the live part runs it
  for (const ex of examples(M)) {
    const kind = ex.kind;
    const lineOf = (at: number) => ex.line + (ex.code.slice(0, at).match(/\n/g) ?? []).length;
    const declared = declaredIn(ex.code);
    const top = ex.shape === 'props' ? '@world' : null;
    for (const f of namesIn(ex.code, top)) checkFound(f, kind, lineOf(f.at), false, declared);
    for (const f of commentValues(ex.code, (k) => K.kinds[kind].names.has(k))) checkFound(f, kind, lineOf(f.at), false, declared);
    if (ex.shape === 'fragment') { stats.fragments++; notes.push(`line ${ex.line}: a fragment, not run: ${ex.why}`); continue; }
    stats.examples++;
    if (ex.shape === 'unknown') { fail(ex.line, 'example', ex.why ?? 'not a shape the check can run'); continue; }
    try { new Script(ex.world!, { filename: `example-${ex.line}.js` }); }
    catch (e) { fail(ex.line, 'example', `does not parse as a world: ${(e as Error).message}`); continue; }
    const free = freeNames(ex.world!);
    if (free.length) fail(ex.line, 'example', `uses ${free.map((n) => `\`${n}\``).join(', ')}, defined nowhere in it (make it runnable, bind it in BIND, or list the example in FRAGMENTS with its reason)`);
  }
  // an allowance nothing needs is a name nothing checks: each one must still be needed
  const stale = (name: string, why: string) => problems.push({ line: 0, name, why, where: 'scripts/api-doc-check.ts' });
  for (const f of FRAGMENTS) if (!M.blocks.some((b) => b.code.includes(f.has))) stale(`FRAGMENTS "${f.has}"`, 'names an example no longer in the manual: remove it');
  for (const n of Object.keys(ALLOW)) if (!used.has(`ALLOW ${n}`)) stale(`ALLOW ${n}`, 'nothing in the manual needs it any more: remove it');
  for (const a of ALLOW_VALUES) if (!used.has(`ALLOW_VALUES ${a.key}=${a.value}`)) stale(`ALLOW_VALUES ${a.key}: '${a.value}'`, 'nothing in the manual needs it any more: remove it');
  for (const a of ALLOW_CTX) if (!used.has(`ALLOW_CTX ${a.kind} ${a.path}`)) stale(`ALLOW_CTX ${a.path}`, 'nothing in the manual needs it any more: remove it');
  return { problems, notes, stats };
}

function checkCtx(segs: string[], calls: boolean[], kind: Kind, K: Known, used: Set<string>, isName: (n: string, k: Kind) => boolean): string | null {
  const path = segs.join('.');
  const allowed = ALLOW_CTX.find((a) => a.kind === kind && a.path === path);
  if (allowed) { used.add(`ALLOW_CTX ${allowed.kind} ${allowed.path}`); return null; }
  let at = K.kinds[kind].ctx;
  for (let i = 1; i < segs.length; i++) {
    const s = segs[i];
    if (calls[i - 1] || at.three || at.open && !at.keys.has(s)) {
      // past a call (what it returns), inside three.js, or inside a value the runtime does not build as a literal: by name
      const miss = segs.slice(i).filter((n) => !isName(n, kind));
      return miss.length ? `${segs.slice(0, i).join('.')}${calls[i - 1] ? '(...)' : ''}: the runtime reads no \`${miss.join('`, `')}\`` : null;
    }
    const next = at.keys.get(s);
    if (!next) {
      const elsewhere = KINDS.filter((o) => o !== kind && resolves(K.kinds[o].ctx, segs));
      return `the ${kind} runtime's ${segs.slice(0, i).join('.')} has no \`${s}\`${elsewhere.length ? ` (only the ${elsewhere.join(' and ')} runtime has ${path})` : ''}`;
    }
    at = next;
  }
  return null;
}
function resolves(root: CtxNode, segs: string[]) { let at: CtxNode | undefined = root; for (const s of segs.slice(1)) { if (!at) return false; if (at.open && !at.keys.has(s)) return true; at = at.keys.get(s); } return !!at; }

function checkId(id: string, K: Known): string | null {
  if (K.assets[id] || K.maps.has(id) || K.lib.has(id)) return null;
  if (!ID_RE.test(id) && ID_LIKE.test(id)) return 'an asset id is lower case, its words joined by hyphens: no such asset in public/assets/library.json';
  return ID_RE.test(id) ? 'no such asset in public/assets/library.json' : 'not a library asset, a library map (lib/runtime/maps) or a name the library gives';
}

/* -------------------------------------------------------------- the examples -- */
export type HostKind = 'race' | 'vehicle' | 'open' | 'derby' | 'kart' | 'shootout';
export type Example = { line: number; code: string; kind: Kind; shape: 'world' | 'props' | 'character' | 'build' | 'fragment' | 'unknown'; why?: string;
  host?: HostKind; world?: string; fills: string[] };

// The worlds an example runs in: as small as each kind allows, lit and grounded so a frame is a frame. `/*@example*/`
// in build is where an example's statements go, `/*@capture*/` where the live part hands itself the ctx.
const RACE_POINTS = '[[0, 0, -110], [70, 1, -95], [115, 3, -40], [100, 2, 30], [55, 0, 60], [30, 1, 110], [-30, 3, 115], [-70, 2, 70], [-110, 1, 20], [-105, 0, -45], [-60, 1, -90]]';
const KART_POINTS = '[[-160.8, 0], [-108, 0], [-55.2, 0], [-2.4, 0], [50.4, 0], [103.2, 0], [156, 0], [174.7, 7.7], [182.4, 26.4], [174.7, 45.1], [156, 52.8], [120, 52.8], [96, 59.3], [78.5, 76.8], [66, 98.4], [53.5, 120], [35.9, 137.6], [11.9, 144], [-38.5, 144], [-88.9, 144], [-139.3, 144], [-189.7, 144], [-240.1, 144], [-279, 132.6], [-305.6, 102], [-311.4, 61.8], [-294.5, 24.8], [-260.4, 3], [-213.6, 0]]';
const LIGHT = "var T = ctx.THREE; ctx.scene.add(new T.HemisphereLight('#EAF6FF', '#5C7A3A', 1.1)); var key = new T.DirectionalLight('#FFF1D6', 2.4); key.position.set(80, 140, 60); key.castShadow = true; ctx.scene.add(key);";
const PRE = [
  "function apiBox(ctx, color, name) { var T = ctx.THREE, g = new T.Group(), m = new T.Mesh(new T.BoxGeometry(0.8, 1.7, 0.6), new T.MeshStandardMaterial({ color: color })); m.position.y = 0.85; g.add(m); return { object: g, name: name, color: color }; }",
  "function apiGround(ctx, size, color) { var T = ctx.THREE, g = new T.Mesh(new T.PlaneGeometry(size, size), new T.MeshStandardMaterial({ color: color, roughness: 1 })); g.rotation.x = -Math.PI / 2; g.position.y = -0.05; ctx.scene.add(g); }",
  'var apiOval = (function () { var pts = [], R = 90, S = 420, PI = Math.PI, per = 2 * S + 2 * PI * R; for (var i = 0; i < 48; i++) { var d = i / 48 * per, x, z; if (d < S) { x = -S / 2 + d; z = -R; } else if (d < S + PI * R) { var a = (d - S) / R; x = S / 2 + Math.sin(a) * R; z = -Math.cos(a) * R; } else if (d < 2 * S + PI * R) { x = S / 2 - (d - S - PI * R); z = R; } else { var b = (d - 2 * S - PI * R) / R; x = -S / 2 - Math.sin(b) * R; z = Math.cos(b) * R; } pts.push([x, 0, -z]); } return pts; })();',
].join('\n');
const THEME = "{ sky: '#9CCBEB', fog: '#BFDCEF', ink: '#23301F', panel: '#FFF8E7', accent: '#F28C28', font: 'Oxanium' }";
const HUMAN = "ctx.assets.human('human-athlete-male', { name: 'Tester', color: '#FF7A3D', skin: 'caucasian', hair: 'short04' })";
export const HOSTS: Record<HostKind, { assets: string[]; keys: Record<string, string> }> = {
  race: { assets: [], keys: {
    theme: THEME, track: `{ width: 13, points: ${RACE_POINTS} }`,
    build: `function (ctx) { /*@capture*/ ${LIGHT} apiGround(ctx, 900, '#7DB356'); ctx.scene.add(ctx.track.ribbon({ color: '#C9A06B', y: 0.03 })); /*@example*/ }`,
    player: "function (ctx) { return apiBox(ctx, '#F2E3C4', 'Pip'); }", rival: "function (ctx, k) { return apiBox(ctx, '#E8674A', 'Rival ' + k); }", obstacles: 'function () { return []; }' } },
  vehicle: { assets: [], keys: {
    play: '{ vehicle: true }', theme: THEME, track: '{ width: 16, points: apiOval }',
    build: `function (ctx) { /*@capture*/ ${LIGHT} apiGround(ctx, 2000, '#3A3F44'); ctx.scene.add(ctx.track.ribbon({ color: '#55585E', y: 0.02 })); /*@example*/ }`,
    player: "function (ctx) { return ctx.assets.car({ kind: 'hypercar', name: 'You' }); }", rival: "function (ctx, k) { var c = ctx.assets.car({ kind: 'formula', paint: '#1B3FA6' }); c.name = 'Rival ' + k; c.color = '#1B3FA6'; return c; }", obstacles: 'function () { return []; }' } },
  open: { assets: ['human-athlete-male'], keys: {
    theme: THEME, camera: '{ distance: 5.2, height: 1.6, fov: 54 }',
    open: "{ bounds: { x: [-30, 30], z: [-30, 30] }, spawn: [0, 0, 90], civilians: 0, weapons: false, maxEnemies: 3, events: true }",
    build: `function (ctx) { /*@capture*/ ${LIGHT} apiGround(ctx, 120, '#A79C88'); /*@example*/ }`, player: `function (ctx) { return ${HUMAN}; }` } },
  derby: { assets: [], keys: {
    theme: THEME, build: `function (ctx) { /*@capture*/ ${LIGHT} apiGround(ctx, 400, '#6E6455'); /*@example*/ }`,
    player: "function (ctx) { return ctx.assets.car({ kind: 'stockcar', armed: true, name: 'You' }); }" } },
  kart: { assets: [], keys: {
    theme: THEME, track: `{ width: 16, points: ${KART_POINTS} }`,
    kart: "{ laps: 3, course: { shoulder: 4, hazards: [{ kind: 'crossing', at: 0.72 }] }, crowd: [{ id: 'main', d: 0.05, x: 14 }] }",
    build: `function (ctx) { /*@capture*/ ${LIGHT} apiGround(ctx, 1400, '#86B05A'); ctx.scene.add(ctx.track.ribbon({ color: '#5B5F66', y: 0.02 })); /*@example*/ }`,
    player: "function (ctx) { return ctx.kart.racer('pepe'); }", rival: "function (ctx, k) { return ctx.kart.racer(['doge', 'shiba', 'bike', 'bull', 'bear', 'whale', 'mooncat'][(k - 1) % 7]); }" } },
  shootout: { assets: ['human-athlete-male', 'human-moves-football-male', 'human-moves-football-female'], keys: {
    shootout: "{ teams: [{ name: 'North', short: 'NOR', color: '#1F4FA8' }, { name: 'South', short: 'SOU', color: '#C8202E' }], taker: 0, body: 'human-athlete-male' }",
    play: '{ coins: false }', theme: THEME,
    build: `function (ctx) { /*@capture*/ ${LIGHT} apiGround(ctx, 300, '#3F7F3A'); /*@example*/ }`,
    player: `function (ctx) { return ${HUMAN}; }`,
    rival: "function (ctx, k, o) { var body = ctx.assets.ready(o.body) ? o.body : 'human-athlete-male'; return ctx.assets.human(body, { name: o.role === 'keeper' ? 'Keeper' : 'Referee', color: '#222222' }); }",
    obstacles: 'function () { return []; }' } },
};

/** A host world, with an example's own keys in place of the host's, its statements in build, and its assets listed. */
export function hostWorld(host: HostKind, o: { props?: string; propKeys?: string[]; player?: string; build?: string; assets?: string[]; capture?: string } = {}) {
  const H = HOSTS[host], keys = { ...H.keys };
  for (const k of o.propKeys ?? []) delete keys[k];
  if (o.player) keys.player = `function (ctx) { return (${o.player}); }`;
  if (keys.build) keys.build = keys.build.replace('/*@example*/', o.build ? `(function () {\n${o.build}\n})();` : '').replace('/*@capture*/', o.capture ?? '');
  const assets = [...new Set([...H.assets, ...(o.assets ?? [])])];
  const body = [`assets: ${JSON.stringify(assets)},`, ...Object.entries(keys).map(([k, v]) => `${k}: ${v},`), o.props ?? ''].join('\n  ');
  return `${PRE}\nGameMog.world({\n  ${body}\n});\n`;
}

const idsIn = (code: string) => [...new Set([...code.matchAll(/['"]((?:human|hdri|sky|texture|model|heightfield|audio|music)-[a-z0-9-]+)['"]/g)].map((m) => m[1]))];

/** Every code example in the manual (a JavaScript block): its shape, the host it runs in, and the world it runs as. */
export function examples(M: Manual): Example[] {
  return M.blocks.filter((b) => JS_LANGS.has(b.lang)).map((b): Example => {
    const kind = M.kindAt(b.line), code = b.code, fills: string[] = [];
    const frag = FRAGMENTS.find((f) => code.includes(f.has));
    if (frag) return { line: b.line, code, kind, shape: 'fragment', why: frag.why, fills };
    // elided parts, filled: `{...}` is an empty object, an elided track the host's loop
    let src = code;
    if (/\{\s*\.\.\.\s*\}/.test(src)) { src = src.replace(/\{\s*\.\.\.\s*\}/g, '{}'); fills.push('{...} as {}'); }
    const ex = { line: b.line, code, kind, fills };
    let host: HostKind, world: string, shape: Example['shape'];
    if (/\bGameMog\.world\s*\(/.test(src)) {
      shape = 'world'; host = kind === 'race' ? 'race' : kind;
      const elided = /(points\s*:\s*)\[\s*(?:\/\*[\s\S]*?\*\/)?\s*\]/;
      if (elided.test(src)) { src = src.replace(elided, (_: string, p: string) => p + (kind === 'kart' ? KART_POINTS : RACE_POINTS)); fills.push('the elided track.points as the host\'s loop'); }
      world = src;
    } else if (/^\s*[A-Za-z_]\w*\s*:\s*[{[]/.test(src)) {
      shape = 'props';
      const top = topKeys(src);
      host = kind === 'open' ? (/\bvehicle\s*:/.test(src) ? 'derby' : 'open') : kind === 'race' ? 'race' : kind;
      const ids = idsIn(src);
      if (ids.length) fills.push(`assets: ${ids.join(', ')}`);
      world = hostWorld(host, { props: src.replace(/,?\s*$/, ','), propKeys: top, assets: ids });
    } else if (/^\s*ctx\.assets\.(human|cyclist|skater|car)\s*\(/.test(src) && isExpression(src)) {
      shape = 'character'; host = /^\s*ctx\.assets\.car\b/.test(src) ? 'vehicle' : kind === 'race' ? 'race' : kind;
      const ids = idsIn(src);
      if (ids.length) fills.push(`assets: ${ids.join(', ')}`);
      world = hostWorld(host, { player: src.trim().replace(/;$/, ''), assets: ids });
    } else if (/\bctx\./.test(src)) {
      shape = 'build'; host = kind === 'race' ? 'race' : kind;
      const ids = idsIn(src);
      if (ids.length) fills.push(`assets: ${ids.join(', ')}`);
      world = hostWorld(host, { build: src, assets: ids });
    } else return { ...ex, shape: 'unknown', why: 'not a world, a world\'s keys, a character or build statements: make it one, or list it in FRAGMENTS with its reason (a block that is not code takes its language: ```text)' };
    // placeholders the reader fills in, bound
    const free = freeNames(world).filter((n) => n in BIND);
    if (free.length) { world = `var ${free.map((n) => `${n} = ${BIND[n]}`).join(', ')};\n${world}`; fills.push(`bound ${free.join(', ')}`); }
    return { ...ex, shape, host, world };
  });
}

/** The keys at an object's top level, from a run of `key: value` pairs. */
function topKeys(src: string) {
  const T = tokens(src), out: string[] = [];
  let d = 0;
  for (let i = 0; i < T.length; i++) {
    const t = T[i];
    if (t.k === 'p' && '([{'.includes(t.t)) d++;
    else if (t.k === 'p' && ')]}'.includes(t.t)) d--;
    else if (d === 0 && t.k === 'id' && T[i + 1]?.t === ':') out.push(t.t);
  }
  return out;
}
function isExpression(src: string) { try { new Script(`(${src.trim().replace(/;$/, '')})`); return true; } catch { return false; } }

/** What a piece of code declares: its functions, variables and parameters (scope-blind). */
function scan(code: string) {
  const sf = ts.createSourceFile('w.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const declared = new Set<string>(), used = new Set<string>();
  const bind = (n: ts.BindingName) => { if (ts.isIdentifier(n)) declared.add(n.text); else n.elements.forEach((e) => { if (!ts.isOmittedExpression(e)) bind(e.name); }); };
  const visit = (n: ts.Node): void => {
    if ((ts.isVariableDeclaration(n) || ts.isParameter(n)) && n.name) bind(n.name);
    else if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isClassDeclaration(n)) && n.name) declared.add(n.name.text);
    else if (ts.isIdentifier(n)) {
      const p = n.parent;
      const notRef = (ts.isPropertyAccessExpression(p) && p.name === n) || ((ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p)) && p.name === n)
        || ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p) || ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isClassDeclaration(p)) && p.name === n)
        || (ts.isBindingElement(p) && p.propertyName === n) || ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p);
      if (!notRef) used.add(n.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { declared, used };
}
const declaredIn = (code: string) => { try { return scan(code).declared; } catch { return new Set<string>(); } };

/** The names a world uses and never defines (scope-blind: a name defined anywhere in it counts as defined). */
export function freeNames(code: string): string[] {
  const { declared, used } = scan(code);
  return [...used].filter((n) => !declared.has(n) && !GLOBALS.has(n));
}

/* ---------------------------------------------- what a call promises to return -- */
/** "`ctx.x.y(...)` returns `{ a, b(...), c }`": each call the manual says returns a shape, and the shape's keys. */
export function promises(M: Manual): { line: number; path: string; keys: { name: string; fn: boolean }[] }[] {
  const out: { line: number; path: string; keys: { name: string; fn: boolean }[] }[] = [];
  const text = M.lines.join('\n');
  const callOf = (s: Span) => {
    const t = s.text.trim(), own = /^(ctx(?:\.\w+)+)\s*\(/.exec(t), mem = s.of && /^(\w+)\s*\(/.exec(t);
    return own ? own[1] : mem ? `${s.of!.join('.')}.${mem[1]}` : null;
  };
  for (let j = 0; j < M.spans.length; j++) {
    const shape = M.spans[j];
    if (!/^\[?\{/.test(shape.text.trim())) continue;
    // the nearest call before it in its paragraph, when the manual says between them that the call returns it (or
    // "is" it), or the paragraph goes on to say "It returns" it
    for (let i = j - 1; i >= 0 && M.spans[i].para === shape.para; i--) {
      const call = callOf(M.spans[i]);
      if (!call) continue;
      const between = text.slice(M.spans[i].end, shape.at);
      if (between.length <= 160 && /\breturns?\b|^\s*is\s*$|\(returns\s*$/.test(between) || /\bIt returns\s*$/.test(between)) {
        const keys: { name: string; fn: boolean }[] = [], T = tokens(shape.text.trim().replace(/^\[/, '').replace(/\]$/, ''));
        let d = 0;
        for (let k = 0; k < T.length; k++) {
          const t = T[k];
          if (t.k === 'p' && '([{'.includes(t.t)) { d++; continue; }
          if (t.k === 'p' && ')]}'.includes(t.t)) { d--; continue; }
          // `part(name)` is a function; `phase ('idle', ...)`, with a space, a name and a note on it
          if (d === 1 && t.k === 'id' && (T[k - 1]?.t === '{' || T[k - 1]?.t === ',')) keys.push({ name: t.t, fn: T[k + 1]?.t === '(' && T[k + 1].pos === t.pos + t.t.length });
        }
        out.push({ line: M.spans[i].line, path: call, keys });
      }
      break;
    }
  }
  return out;
}

/* ------------------------------------------------------------------- alone -- */
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = process.argv[2] ?? 'lib/runtime/API.md';
  const t0 = performance.now();
  const r = checkManual(readFileSync(file, 'utf8'));
  for (const n of r.notes) console.log(`  note  ${n}`);
  for (const p of r.problems) console.log(`  FAIL  ${p.where ?? `${file}:${p.line}`}  ${p.name}: ${p.why}`);
  const s = r.stats;
  console.log(`\n${r.problems.length ? `${r.problems.length} problem(s)` : 'the manual matches the runtime'}: ${s.spans} code spans, ${s.names} names (${s.scoped} on the object or key they belong to), ${s.ctx} ctx paths, ${s.assets} ids, ${s.never} forbidden names, ${s.examples} examples (${s.fragments} fragments not run) in ${Math.round(performance.now() - t0)} ms`);
  process.exit(r.problems.length ? 1 : 0);
}
