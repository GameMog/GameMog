/**
 * What the runtime reads, and on what: the reading the builder's manual is checked against (scripts/api-doc-check.ts).
 *
 * A word that appears somewhere in the runtime is not an option the runtime reads: `bloom: { intensity }` would pass
 * because a light has an intensity. So this follows names through the runtime's code. Every value is named by the
 * key it was read from (`o.bloom` is a "bloom", whatever `o` is), and a variable by everything assigned to it; a
 * parameter by a token for itself, so a call's result is what the function returns with the call's own arguments in
 * place of the tokens (clamp(o.size) is a "size", not every name clamp is ever handed). Then
 *
 *   - a read `X.k` (or `'k' in X`, `X['k']`, a destructured `{ k }`) is a key k of every name X carries
 *   - `X === 'v'`, a `case 'v'`, an anchored `/^(v|w)$/.test(X)`, `['v', 'w'].indexOf(X)`, a lookup `T[X]` or `X in T`
 *     in an object literal T (or one written under T's key: K0.surf[x]) are values of every name X carries: the
 *     values the runtime knows for it, a closed list
 *   - a default (`X || 'v'`, `typeof X === 'string' ? X : 'v'`, `{ k = 'v' }`), a string passed to a parameter and a
 *     lookup that lets other values through (`PARTYW[w] ? { kind: w } : w`) are values it takes too, never a list
 *   - a name looked up in a table the reading cannot see (a clip by its name, `skins[o.skin]`) takes any value; one
 *     read by a computed key that is itself a name (`X[o.kind]`), iterated (a for-in that is not a copy, Object.keys)
 *     or handed to a function the reading cannot see takes any key: nothing below it is checked
 *   - what a lookup finds is named (weakly: for the keys read on it, never for its own values or for reading any key)
 *     by the values its key takes: CREW[kind], kind one of thug, biker, ..., is a "thug", a "biker"
 *   - a table the runtime fills by a value (EVENTS[name] = ..., in ctx.on) is a registry: the strings its own callers
 *     look up in it (emit('lap', ...)) are what it sends
 *
 * The world handed to GameMog.world is "@world", the world's ctx "@ctx", the i-th argument of a ctx call "@ctx.a.b#i"
 * (so `ctx.on`'s event names are the values of "@ctx.on#0", and the events sent its sends). It reads names, not
 * objects: two objects read under one name share their keys (a world's `camera` options and three.js's camera), which
 * errs toward passing a name, never toward failing one. Code under the runtime's switches for a kind of world
 * (`if (OPEN)`, GUARDS) builds that kind's ctx only.
 */
import ts from 'typescript';

export type Guard = 'open' | 'kart' | 'shootout';
// the runtime's own switches: code under `if (OPEN)` (or `if (OPEN && ...)`) runs in an open world only
export const GUARDS: Record<string, Guard> = { OPEN: 'open', KART: 'kart', SHOOT: 'shootout' };

export type CtxNode = { keys: Map<string, CtxNode>; open: boolean; three?: boolean; fns: Set<number> };
const ctxNode = (): CtxNode => ({ keys: new Map(), open: false, fns: new Set() });
// ctx members that are three.js's own objects: a path past them is three.js's
const THREE_LEAVES = new Set(['THREE', 'scene', 'scenery', 'camera', 'renderer']);

/** What one piece of the runtime reads: its words, and its keys and values by name. */
export type Reading = {
  names: Set<string>;                    // every word the code reads: property names, object keys, strings (no comments)
  keys: Map<string, Set<string>>;        // a name -> the keys read on it
  own: Map<string, Set<string>>;         // the same, without what elements named weakly by it add (for a failure's list)
  anyKey: Set<string>;                   // names read with keys the reading cannot follow
  values: Map<string, Set<string>>;      // a name -> the values it is compared with (a closed list)
  takes: Map<string, Set<string>>;       // a name -> defaults and strings passed for it (accepted, never closing a list)
  openValues: Set<string>;               // names whose value is looked up where the reading cannot see (any value)
  sends: Map<string, Set<string> | null>; // a registry's keys the runtime sends (emit('lap', ...)): ctx.on's events
  writes: Map<string, Set<string>>;      // a name -> the keys written on it (GameMog's members)
  /** The world's ctx as a kind of world gets it: `exclude` drops what the runtime builds under those switches, and
   * `where` what lies in the given span of the source (a file inlined into it that a kind does not run). */
  ctx: (exclude: Guard[], drop?: [number, number]) => CtxNode;
  guards: Set<string>;                   // the GUARDS the source declares (a switch renamed is a check that went blind)
  anyAt: (name: string) => number | null; // the line of the source where a name first took any key
};

type VX = { n?: string[]; s?: number[]; f?: number[] };   // a value: names it carries, symbols it takes names from, functions it is
const NONE: VX = {};
const join = (...xs: VX[]): VX => ({ n: xs.flatMap((x) => x.n ?? []), s: xs.flatMap((x) => x.s ?? []), f: xs.flatMap((x) => x.f ?? []) });
type Scope = { vars: Map<string, number>; up: Scope | null; fn: number };
type Fn = { params: number[]; ret: number };
// a call: what is called (a value, or a method by its name: the runtime's own functions written under that key)
type Call = { callee: VX; method?: string; args: VX[]; lits: (string | null)[]; res: number; bound: Set<number>; builtin: boolean; pos: number };

// callees that read no keys of what they are handed (and the array methods, which call back with an element)
const PURE_ROOTS = new Set(['Math', 'JSON', 'Number', 'String', 'Boolean', 'Array', 'console', 'Date', 'Promise', 'parseInt', 'parseFloat',
  'isFinite', 'isNaN', 'encodeURIComponent', 'decodeURIComponent', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame',
  'THREE', 'Symbol', 'Error', 'TypeError', 'RangeError', 'Float32Array', 'Uint8Array', 'Uint16Array', 'Uint32Array', 'Int16Array', 'Int32Array',
  'Uint8ClampedArray', 'Float64Array', 'Map', 'Set', 'WeakMap', 'DataView', 'ArrayBuffer', 'Image', 'Blob', 'URL', 'Audio', 'performance']);
const CALLBACKS: Record<string, number> = { forEach: 0, map: 0, filter: 0, some: 0, every: 0, find: 0, findIndex: 0, findLast: 0, flatMap: 0, sort: 0, reduce: 1, reduceRight: 1 };
const SAME = new Set(['filter', 'slice', 'concat', 'sort', 'reverse', 'find', 'findLast', 'toLowerCase', 'toUpperCase', 'trim', 'flat', 'valueOf', 'toString']);

const keyName = (n: ts.PropertyName | ts.BindingName) => ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n) || ts.isPrivateIdentifier(n) ? n.text : null;
const isFn = (n: ts.Node): n is ts.FunctionLikeDeclaration => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n)
  || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n) || ts.isConstructorDeclaration(n);
const str = (n: ts.Node | undefined) => n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null;
const strip = (n: ts.Expression): ts.Expression => ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) ? strip(n.expression) : n;
/** An anchored alternation's words: /^(a|b|c)$/ or /^a$/ (anything else is not a list of values). */
function regexWords(re: string): string[] | null {
  const m = /^\/\^(?:\((?:\?:)?([\w|-]+)\)|([\w-]+))\$\/[a-z]*$/.exec(re);
  return m ? (m[1] ?? m[2]).split('|').filter(Boolean) : null;
}

/** Read a runtime source: walk it, then follow its names to a fixpoint, in three passes (the ctx and what its calls
 * are handed need the first; the elements a lookup finds, named by its key's values, the second). `seed` names
 * what the caller knows (a map's build() options); `worldCtx: false` for a source with no world ctx (the host). */
export function readSource(src: string, file: string, opts: { worldCtx?: boolean; seed?: (r: Reader) => void } = {}): Reading {
  const r = new Reader(src, file);
  r.run();
  const seedCtx = opts.worldCtx !== false;
  if (seedCtx) r.seedCtx();
  r.solve();
  if (seedCtx) r.seedCalls();
  opts.seed?.(r);
  r.solve();
  r.named();
  r.solve();
  return r.reading();
}

export class Reader {
  sf: ts.SourceFile;
  names = new Set<string>();
  // symbols: a variable, a parameter, a function's return
  symN: Set<string>[] = []; symF: Set<number>[] = []; fedges: number[][] = []; retWatch: [Call, number][][] = []; boundTo: Call[][] = []; init: (ts.Expression | undefined)[] = []; edges: number[][] = []; watch: number[][] = [];
  fns: Fn[] = []; fnOf = new Map<ts.Node, number>(); idSym = new Map<ts.Node, number>(); propFns = new Map<string, VX>();
  globals = new Map<string, number>();
  calls: Call[] = [];
  reads: [VX, string][] = []; anys: [VX, number][] = []; enums: [VX, string[]][] = []; takes: [VX, string[]][] = []; writes: [VX, string][] = [];
  paramKeys: [VX, number, number, number, number, string][] = []; lookups: [VX, VX, number][] = [];
  // a key looked up in a table (T[x], x in T, T.indexOf(x)): the table's keys are x's values, when the table is known
  tables: [VX, VX, ts.Expression, string][] = []; passing = new Set<number>(); fills: [string, VX][] = []; regexes: [VX, ts.Expression][] = []; elems: [number, VX][] = []; litUnder = new Map<string, Set<string>>(); forKeys = new Map<number, string[]>();
  ctxRecs: { root: number; path: string[]; rhs: ts.Expression; guard: Guard | null; pos: number }[] = [];
  gmFns: [VX, string, number[]][] = [];
  links: [string, VX][] = [];   // { style: SO.goal }: what is read on a "style" is read on the "goal"
  ctxSeeds: number[] = [];
  work: number[] = []; queued = new Set<number>();

  constructor(src: string, file: string) { this.sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS); }

  sym(): number { const i = this.symN.length; this.symN.push(new Set()); this.symF.push(new Set()); this.init.push(undefined); this.edges.push([]); this.fedges.push([]); this.watch.push([]); this.retWatch.push([]); return i; }
  lookup(sc: Scope | null, name: string): number {
    for (let s = sc; s; s = s.up) { const v = s.vars.get(name); if (v !== undefined) return v; }
    let g = this.globals.get(name); if (g === undefined) { g = this.sym(); this.globals.set(name, g); } return g;
  }
  /** A scope: its parameters, and every var, let, const, function and class declared in it (hoisted). */
  scope(node: ts.Node, up: Scope | null, fn: number): Scope {
    const sc: Scope = { vars: new Map(), up, fn };
    const add = (name: string) => { if (!sc.vars.has(name)) sc.vars.set(name, this.sym()); };
    const bind = (b: ts.BindingName): void => { if (ts.isIdentifier(b)) add(b.text); else for (const e of b.elements) if (!ts.isOmittedExpression(e)) bind(e.name); };
    const scan = (n: ts.Node): void => {
      if (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) { if (n.name) add(n.name.text); return; }
      if (isFn(n) || ts.isClassExpression(n)) return;
      if (ts.isVariableDeclaration(n)) bind(n.name);
      ts.forEachChild(n, scan);
    };
    if (isFn(node)) {
      if ((ts.isFunctionExpression(node)) && node.name) add(node.name.text);
      for (const p of node.parameters) bind(p.name);
      if (node.body) ts.forEachChild(node.body, scan);
    } else ts.forEachChild(node, scan);
    return sc;
  }

  run() {
    const top = this.scope(this.sf, null, -1);
    for (const st of this.sf.statements) this.visit(st, top, null);
  }

  /* ------------------------------------------------------------- the walk -- */
  visit(n: ts.Node, sc: Scope, g: Guard | null): void {
    if (isFn(n)) { this.fn(n, sc, g); return; }
    if (ts.isClassDeclaration(n) || ts.isClassExpression(n)) { if (n.name) this.names.add(n.name.text); ts.forEachChild(n, (c) => this.visit(c, sc, g)); return; }
    if (ts.isExpression(n)) { this.expr(n, sc, g); return; }
    if (ts.isVariableDeclaration(n)) {
      const v = n.initializer ? this.expr(n.initializer, sc, g) : NONE;
      if (ts.isIdentifier(n.name) && n.initializer) {
        const s = this.lookup(sc, n.name.text);
        if (!this.init[s]) this.init[s] = strip(n.initializer);
        // the world's ctx: the object literal named ctx that holds the scene and the track
        const lit = strip(n.initializer);
        if (n.name.text === 'ctx' && ts.isObjectLiteralExpression(lit)) {
          const ks = new Set(lit.properties.map((p) => p.name && keyName(p.name as ts.PropertyName)));
          if (ks.has('scene') && ks.has('track')) { this.ctxSeeds.push(s); this.ctxRecs.push({ root: s, path: [], rhs: lit, guard: g, pos: n.pos }); }
        }
      }
      this.bind(n.name, v, sc, g);
      return;
    }
    if (ts.isIfStatement(n)) {
      this.expr(n.expression, sc, g);
      this.visit(n.thenStatement, sc, this.guardOf(n.expression) ?? g);
      if (n.elseStatement) this.visit(n.elseStatement, sc, g);
      return;
    }
    if (ts.isReturnStatement(n)) { if (n.expression) this.flow(this.fns[sc.fn]?.ret, this.expr(n.expression, sc, g)); return; }
    if (ts.isSwitchStatement(n)) {
      const v = this.expr(n.expression, sc, g);
      for (const c of n.caseBlock.clauses) {
        if (ts.isCaseClause(c)) { const s = str(c.expression); if (s !== null) this.enums.push([v, [s]]); else this.expr(c.expression, sc, g); }
        for (const st of c.statements) this.visit(st, sc, g);
      }
      return;
    }
    if (ts.isForInStatement(n) || ts.isForOfStatement(n)) {
      const v = this.expr(n.expression, sc, g);
      if (ts.isVariableDeclarationList(n.initializer)) {
        if (ts.isForOfStatement(n)) for (const d of n.initializer.declarations) this.bind(d.name, v, sc, g);   // (an element is named as its list)
      } else this.expr(n.initializer as ts.Expression, sc, g);
      // a for-in that copies (o[k] = g[k]) hands the keys on; any other reads every key there is
      if (ts.isForInStatement(n) && !this.copies(n)) this.anys.push([v, n.pos]);
      // (over a literal: the loop's key is one of its keys, and O[k] reads each: for (k in TX) O.words[k])
      const own = ts.isForInStatement(n) && ts.isVariableDeclarationList(n.initializer) ? this.tableKeys(n.expression) : null;
      if (own) for (const d of (n.initializer as ts.VariableDeclarationList).declarations) if (ts.isIdentifier(d.name)) this.forKeys.set(this.lookup(sc, d.name.text), own);
      this.visit(n.statement, sc, g);
      return;
    }
    ts.forEachChild(n, (c) => this.visit(c, sc, g));
  }

  guardOf(e: ts.Expression): Guard | null {
    e = strip(e);
    if (ts.isIdentifier(e) && GUARDS[e.text]) return GUARDS[e.text];
    if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return this.guardOf(e.left) ?? this.guardOf(e.right);
    return null;
  }
  copies(n: ts.ForInStatement) {
    const over = n.expression.getText(this.sf);
    let found = false;
    const look = (c: ts.Node): void => {
      if (found) return;
      if (ts.isElementAccessExpression(c) && c.expression.getText(this.sf) === over) found = true;
      else ts.forEachChild(c, look);
    };
    const assigns = (c: ts.Node): void => {
      if (found) return;
      if (ts.isBinaryExpression(c) && c.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isElementAccessExpression(c.left)) look(c.right);
      ts.forEachChild(c, assigns);
    };
    assigns(n.statement);
    return found;
  }

  bind(b: ts.BindingName, v: VX, sc: Scope, g: Guard | null) {
    if (ts.isIdentifier(b)) { this.flow(this.lookup(sc, b.text), v); return; }
    for (const e of b.elements) {
      if (ts.isOmittedExpression(e)) continue;
      if (ts.isArrayBindingPattern(b)) { this.bind(e.name, v, sc, g); continue; }
      const k = keyName(e.propertyName ?? e.name);
      if (e.initializer) { const d = str(e.initializer); this.expr(e.initializer, sc, g); if (k && d !== null) this.takes.push([{ n: [k] }, [d]]); }
      if (!k) { this.anys.push([v, e.pos]); continue; }
      this.names.add(k); this.reads.push([v, k]);
      this.bind(e.name, { n: [k] }, sc, g);
    }
  }

  /** A function: its scope, a symbol per parameter and one for its return; its value is itself. */
  fn(n: ts.FunctionLikeDeclaration, sc: Scope, g: Guard | null): VX {
    let id = this.fnOf.get(n);
    if (id !== undefined) return { f: [id] };
    id = this.fns.length;
    const fn: Fn = { params: [], ret: this.sym() };
    this.fns.push(fn); this.fnOf.set(n, id);
    if (n.name && (ts.isMethodDeclaration(n) || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n))) { const k = keyName(n.name); if (k) this.names.add(k); }
    const inner = this.scope(n, sc, id);
    if (ts.isFunctionDeclaration(n) && n.name) this.addF(this.lookup(sc, n.name.text), id);
    if (ts.isFunctionExpression(n) && n.name) this.addF(this.lookup(inner, n.name.text), id);
    for (const p of n.parameters) {
      let slot: number;
      if (ts.isIdentifier(p.name)) slot = this.lookup(inner, p.name.text);
      else { slot = this.sym(); this.bind(p.name, { s: [slot] }, inner, g); }
      if (p.initializer) { const d = str(p.initializer); const v = this.expr(p.initializer, inner, g); this.flow(slot, v); if (d !== null) this.takes.push([{ s: [slot] }, [d]]); }
      fn.params.push(slot);
      this.add(slot, this.token(id, fn.params.length - 1));
    }
    if (n.body) {
      if (ts.isBlock(n.body)) for (const st of n.body.statements) this.visit(st, inner, g);
      else this.flow(fn.ret, this.expr(n.body, inner, g));
    }
    return { f: [id] };
  }

  /** An expression: what it reads and compares, and the value it is. */
  expr(e: ts.Expression, sc: Scope, g: Guard | null): VX {
    if (isFn(e)) return this.fn(e, sc, g);
    if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isAwaitExpression(e) || ts.isTypeAssertionExpression(e) || ts.isSatisfiesExpression(e)) return this.expr(e.expression, sc, g);
    if (ts.isIdentifier(e)) {
      if (e.text === 'undefined') return NONE;
      const s = this.lookup(sc, e.text); this.idSym.set(e, s); return { s: [s] };
    }
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) { this.words(e.text); return NONE; }
    if (ts.isRegularExpressionLiteral(e)) { for (const w of e.text.match(/[A-Za-z_$][\w$]*/g) ?? []) this.names.add(w); return NONE; }
    if (ts.isPropertyAccessExpression(e)) {
      const o = this.expr(e.expression, sc, g), k = e.name.text;
      this.names.add(k); this.reads.push([o, k]);
      return { n: [k] };
    }
    if (ts.isElementAccessExpression(e)) {
      const o = this.expr(e.expression, sc, g), a = strip(e.argumentExpression), k = str(a);
      if (k !== null) { this.words(k); this.reads.push([o, k]); return { n: [k] }; }
      if (ts.isNumericLiteral(a)) return o;
      const x = this.expr(a, sc, g);
      const each = ts.isIdentifier(a) ? this.forKeys.get(this.lookup(sc, a.text)) : undefined;
      if (each) { for (const k of each) this.reads.push([o, k]); return { n: each }; }
      this.tables.push([o, x, e.expression, a.getText(this.sf)]);
      // by a parameter: the strings passed for it are the keys (def[name], name 'build', 'player', ...)
      const fn = this.fns[sc.fn];
      const pi = ts.isIdentifier(a) && fn ? fn.params.indexOf(this.lookup(sc, a.text)) : -1;
      // (and what it finds is named by those strings: CREW[kind] for kind 'thug' is a "thug")
      if (pi >= 0) { const el = this.sym(); this.paramKeys.push([o, sc.fn, pi, e.pos, el, strip(e.expression).getText(this.sf)]); this.elems.push([el, x]); return { s: [el] }; }
      this.lookups.push([o, x, e.pos]);
      // an element is named as its list (rooms[i] is a "rooms"), and by the values its key takes (CREW[kind], kind
      // one of thug, biker, ...: a "thug", a "biker"), once those are known (named)
      const el = this.sym(); this.elems.push([el, x]);
      return join(o, { s: [el] });
    }
    if (ts.isCallExpression(e) || ts.isNewExpression(e)) return this.call(e, sc, g);
    if (ts.isBinaryExpression(e)) {
      const op = e.operatorToken.kind, K = ts.SyntaxKind;
      if (op === K.EqualsToken || op === K.BarBarEqualsToken || op === K.QuestionQuestionEqualsToken) {
        const v = this.expr(e.right, sc, g), L = strip(e.left as ts.Expression);
        if (ts.isIdentifier(L)) this.flow(this.lookup(sc, L.text), v);
        else if (ts.isPropertyAccessExpression(L)) {
          const o = this.expr(L.expression, sc, g), k = L.name.text;
          this.names.add(k); this.writes.push([o, k]);
          const R = strip(e.right);
          if (ts.isObjectLiteralExpression(R)) for (const p of R.properties) { const pk = p.name && keyName(p.name as ts.PropertyName); if (pk) this.writes.push([{ n: [k] }, pk]); }
          if (v.f?.length) this.gmFns.push([o, k, v.f]);
          this.prop(k, v); this.link(k, v);
          const path: string[] = [];
          let root: ts.Expression = L;
          while (ts.isPropertyAccessExpression(root)) { path.unshift(root.name.text); root = strip(root.expression); }
          if (ts.isIdentifier(root)) this.ctxRecs.push({ root: this.lookup(sc, root.text), path, rhs: R, guard: g, pos: e.pos });
        } else if (ts.isElementAccessExpression(L)) {
          // o[k] = v: o holds v (a copy, a table filled by k)
          const t = strip(L.expression), a = strip(L.argumentExpression);
          this.expr(t, sc, g);
          const x = this.expr(a, sc, g);
          if (ts.isIdentifier(t)) this.flow(this.lookup(sc, t.text), v);
          this.fills.push([t.getText(this.sf), x]);
        } else this.expr(L, sc, g);
        return v;
      }
      if (op === K.EqualsEqualsEqualsToken || op === K.EqualsEqualsToken || op === K.ExclamationEqualsEqualsToken || op === K.ExclamationEqualsToken) {
        const a = this.expr(e.left, sc, g), b = this.expr(e.right, sc, g), sa = str(strip(e.left)), sb = str(strip(e.right));
        if (sb !== null && sa === null) this.enums.push([a, [sb]]);
        if (sa !== null && sb === null) this.enums.push([b, [sa]]);
        return NONE;
      }
      if (op === K.BarBarToken || op === K.QuestionQuestionToken) {
        const a = this.expr(e.left, sc, g), b = this.expr(e.right, sc, g), d = this.results(e.right);
        if (d.length) this.takes.push([a, d]);
        return join(a, b);
      }
      if (op === K.AmpersandAmpersandToken) { this.expr(e.left, sc, g); return this.expr(e.right, sc, g); }
      if (op === K.InKeyword) {
        const k = str(strip(e.left)), o = this.expr(e.right, sc, g), x = this.expr(e.left, sc, g);
        if (k !== null) this.reads.push([o, k]);
        else this.tables.push([o, x, e.right, strip(e.left).getText(this.sf)]);
        return NONE;
      }
      if (op === K.CommaToken) { this.expr(e.left, sc, g); return this.expr(e.right, sc, g); }
      this.expr(e.left, sc, g); this.expr(e.right, sc, g);
      return NONE;
    }
    if (ts.isConditionalExpression(e)) {
      const t0 = this.tables.length;
      this.expr(e.condition, sc, g);
      // (a lookup that only picks out some values, the rest passing through as they are, PARTYW[w] ? { kind: w } : w,
      // is no closed list of them)
      const through = [e.whenTrue, e.whenFalse].map((b) => strip(b).getText(this.sf));
      for (let i = t0; i < this.tables.length; i++) if (through.includes(this.tables[i][3])) this.passing.add(i);
      const a = this.expr(e.whenTrue, sc, g), b = this.expr(e.whenFalse, sc, g), da = this.results(e.whenTrue), db = this.results(e.whenFalse);
      if (db.length && (a.n?.length || a.s?.length)) this.takes.push([a, db]);
      if (da.length && (b.n?.length || b.s?.length)) this.takes.push([b, da]);
      return join(a, b);
    }
    if (ts.isObjectLiteralExpression(e)) {
      for (const p of e.properties) {
        if (ts.isPropertyAssignment(p)) {
          const k = keyName(p.name); if (k) this.names.add(k);
          if (ts.isComputedPropertyName(p.name)) this.expr(p.name.expression, sc, g);
          const v = this.expr(p.initializer, sc, g);
          if (k) { this.prop(k, v); this.link(k, v); this.under(k, p.initializer); }
        } else if (ts.isShorthandPropertyAssignment(p)) {
          this.names.add(p.name.text);
          const v = this.expr(p.name, sc, g);
          this.prop(p.name.text, v);
        } else if (ts.isSpreadAssignment(p)) this.expr(p.expression, sc, g);
        else if (isFn(p)) { const v = this.fn(p, sc, g); const k = p.name && keyName(p.name as ts.PropertyName); if (k) this.prop(k, v); }
      }
      return NONE;
    }
    if (ts.isArrayLiteralExpression(e)) return join(...e.elements.map((x) => ts.isSpreadElement(x) ? this.expr(x.expression, sc, g) : this.expr(x, sc, g)));
    if (ts.isTemplateExpression(e)) { this.words(e.head.text); for (const s of e.templateSpans) { this.expr(s.expression, sc, g); this.words(s.literal.text); } return NONE; }
    if (ts.isTypeOfExpression(e) || ts.isVoidExpression(e) || ts.isDeleteExpression(e)) { this.expr(e.expression, sc, g); return NONE; }
    if (ts.isPrefixUnaryExpression(e) || ts.isPostfixUnaryExpression(e)) { this.expr(e.operand, sc, g); return NONE; }
    if (ts.isClassExpression(e)) { this.visit(e, sc, g); return NONE; }
    ts.forEachChild(e, (c) => this.visit(c, sc, g));
    return NONE;
  }

  words(s: string) {
    if (s.length > 80) return;
    if (/^[\w$-]+$/.test(s)) this.names.add(s);
    else if (/^[a-z_$][\w$-]*(?:[ ,|][a-z_$][\w$-]*)+$/.test(s)) for (const w of s.split(/[ ,|]/)) this.names.add(w);
  }
  /** A table written under a key (`surf: { grass, mud }`, `kinds: ['a', 'b']`): what K0.surf[x] may find. */
  under(k: string, e: ts.Expression) {
    const lit = this.literalOf(e);
    if (!lit || ts.isRegularExpressionLiteral(lit)) return;
    const ks = ts.isObjectLiteralExpression(lit) ? lit.properties.map((p) => p.name && keyName(p.name as ts.PropertyName)) : (lit as ts.ArrayLiteralExpression).elements.map((x) => str(x));
    const set = this.litUnder.get(k) ?? new Set<string>();
    for (const x of ks) if (x) set.add(x);
    this.litUnder.set(k, set);
  }
  /** `k: X.j` (or a guarded `X.j`): what is read on a "k" is read on the "j". Only a key read in place: through a
   * variable, a name would carry everything that variable ever held. */
  link(k: string, v: VX) { for (const n of v.n ?? []) if (n !== k) this.links.push([k, { n: [n] }]); }
  /** A function written under a key (in a literal, or X.k = ...): what a method call by that name may call. */
  prop(k: string, v: VX) {
    if (!v.f?.length && !v.s?.length) return;
    const l = this.propFns.get(k) ?? { f: [], s: [] }; l.f!.push(...(v.f ?? [])); l.s!.push(...(v.s ?? [])); this.propFns.set(k, l);
  }
  /** The strings an expression can come out as (a default: `x || 'walk'`, `c ? 'a' : 'b'`). */
  results(e: ts.Expression): string[] {
    e = strip(e);
    const s = str(e); if (s !== null) return [s];
    if (ts.isConditionalExpression(e)) return [...this.results(e.whenTrue), ...this.results(e.whenFalse)];
    if (ts.isBinaryExpression(e) && (e.operatorToken.kind === ts.SyntaxKind.BarBarToken || e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)) return [...this.results(e.left), ...this.results(e.right)];
    return [];
  }
  /** An object literal's keys, where an expression is one (a variable or a member of one that holds it). */
  tableKeys(e: ts.Expression): string[] | null {
    const lit = this.literal(e);
    // (an empty literal is a table filled later: not a closed list)
    const ks = lit && ts.isObjectLiteralExpression(lit) ? lit.properties.map((p) => p.name && keyName(p.name as ts.PropertyName)).filter((k): k is string => !!k) : null;
    return ks?.length ? ks : null;
  }
  literal(e: ts.Expression): ts.Expression | null {
    e = strip(e);
    if (ts.isObjectLiteralExpression(e) || ts.isArrayLiteralExpression(e) || ts.isRegularExpressionLiteral(e)) return e;
    if (ts.isIdentifier(e)) { const s = this.idSym.get(e); return s !== undefined && this.init[s] ? this.literalOf(this.init[s]!) : null; }
    if (ts.isPropertyAccessExpression(e)) {
      const o = this.literal(e.expression);
      if (o && ts.isObjectLiteralExpression(o)) { const p = o.properties.find((q) => q.name && keyName(q.name as ts.PropertyName) === e.name.text); if (p && ts.isPropertyAssignment(p)) return this.literalOf(p.initializer); }
    }
    return null;
  }
  literalOf(e: ts.Expression): ts.Expression | null {
    e = strip(e);
    if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && /^(freeze|seal)$/.test(e.expression.name.text) && e.arguments[0]) return this.literalOf(e.arguments[0]);
    return ts.isObjectLiteralExpression(e) || ts.isArrayLiteralExpression(e) || ts.isRegularExpressionLiteral(e) ? e : null;
  }

  call(e: ts.CallExpression | ts.NewExpression, sc: Scope, g: Guard | null): VX {
    const args = [...(e.arguments ?? [])];
    const c = strip(e.expression);
    const A = () => args.map((a) => ts.isSpreadElement(a) ? this.expr(a.expression, sc, g) : this.expr(a, sc, g));
    const lits = args.map((a) => str(strip(a as ts.Expression)));
    const res = this.sym();
    const push = (callee: VX, as: VX[], ls = lits, method?: string) => { this.calls.push({ callee, method, args: as, lits: ls, res, bound: new Set(), builtin: false, pos: e.pos }); return { s: [res] }; };
    if (ts.isPropertyAccessExpression(c)) {
      const m = c.name.text, recv = strip(c.expression);
      this.names.add(m);
      // a list of values: /^(a|b)$/.test(x), ['a', 'b'].indexOf(x), hasOwnProperty.call(TABLE, x)
      if (m === 'test' && args.length === 1) {
        const v = A()[0]; this.expr(recv, sc, g);
        this.regexes.push([v, recv]);
        return NONE;
      }
      if ((m === 'indexOf' || m === 'includes') && args.length >= 1) {
        const as = A(), o = this.expr(recv, sc, g);
        this.reads.push([o, m]); this.tables.push([o, as[0], recv, strip(args[0] as ts.Expression).getText(this.sf)]);
        return NONE;
      }
      if (m === 'call' || m === 'apply') {
        if (ts.isPropertyAccessExpression(recv) && recv.name.text === 'hasOwnProperty' && args.length === 2) {
          const as = A();
          this.tables.push([as[0], as[1], args[0] as ts.Expression, strip(args[1] as ts.Expression).getText(this.sf)]);   // (a membership test: no key read)
          return NONE;
        }
        const f = this.expr(recv, sc, g), as = A();
        return push(f, m === 'call' ? as.slice(1) : [], m === 'call' ? lits.slice(1) : []);   // (the first is `this`: not read)
      }
      if (m === 'hasOwnProperty' && args.length === 1) {
        const as = A(), o = this.expr(recv, sc, g);
        const k = lits[0];
        if (k !== null) this.reads.push([o, k]); else this.tables.push([o, as[0], recv, strip(args[0] as ts.Expression).getText(this.sf)]);
        return NONE;
      }
      const rootName = (() => { let r: ts.Expression = recv; while (ts.isPropertyAccessExpression(r)) r = strip(r.expression); return ts.isIdentifier(r) ? r.text : null; })();
      if (rootName === 'Object' && ts.isIdentifier(recv)) {
        const as = A();
        if (m === 'assign') { const t = strip(args[0] as ts.Expression); if (ts.isIdentifier(t)) this.flow(this.lookup(sc, t.text), join(...as.slice(1))); return join(...as); }
        if (m === 'freeze' || m === 'seal' || m === 'create') return as[0] ?? NONE;
        if (/^(keys|entries|values|getOwnPropertyNames)$/.test(m)) { if (as[0]) this.anys.push([as[0], e.pos]); return NONE; }
        return NONE;
      }
      if (rootName && PURE_ROOTS.has(rootName)) { A(); this.expr(recv, sc, g); return NONE; }
      const o = this.expr(recv, sc, g);
      this.reads.push([o, m]);
      const as = A();
      if (m in CALLBACKS && as[0]) {
        const at = CALLBACKS[m], cb = as[0], pass: VX[] = [];
        pass[at] = o; if (m === 'sort') pass[1] = o;
        this.calls.push({ callee: cb, args: pass.map((x) => x ?? NONE), lits: [], res: this.sym(), bound: new Set(), builtin: true, pos: e.pos });
      }
      if (m === 'push' || m === 'unshift') { if (ts.isIdentifier(recv)) for (const a of as) this.flow(this.lookup(sc, recv.text), a); return NONE; }
      if (SAME.has(m)) return o;
      if (m in CALLBACKS) return NONE;
      return push(NONE, as, lits, m);
    }
    if (ts.isIdentifier(c) && (c.text === 'String' || c.text === 'Boolean')) return A()[0] ?? NONE;
    if (ts.isIdentifier(c) && PURE_ROOTS.has(c.text)) { A(); return NONE; }
    const f = this.expr(c, sc, g);
    return push(f, A());
  }

  /* ---------------------------------------------------------- the fixpoint -- */
  // A parameter is named by a token for itself ("\0f:i"), not by every argument ever passed to it: a call's result
  // takes what the function returns with the call's own arguments in place of the tokens (so clamp(o.size) is a "size",
  // never every name clamp is ever handed); reading a name through a parameter (a read, a comparison inside the
  // function) takes every argument it was handed, at the end (expand).
  flow(to: number | undefined, v: VX) {
    if (to === undefined) return;
    for (const n of v.n ?? []) this.add(to, n);
    for (const f of v.f ?? []) this.addF(to, f);
    for (const s of v.s ?? []) if (s !== to && !this.edges[s].includes(to)) { this.edges[s].push(to); this.enqueue(s); }
  }
  /** Only the functions a value is (a callback handed to a parameter). */
  flowFns(to: number, v: VX) {
    for (const f of v.f ?? []) this.addF(to, f);
    for (const s of v.s ?? []) if (s !== to && !this.fedges[s].includes(to)) { this.fedges[s].push(to); this.enqueue(s); }
  }
  add(s: number, n: string) { if (!this.symN[s].has(n)) { this.symN[s].add(n); this.enqueue(s); } }
  addF(s: number, f: number) { if (!this.symF[s].has(f)) { this.symF[s].add(f); this.enqueue(s); } }
  enqueue(s: number) { if (!this.queued.has(s)) { this.queued.add(s); this.work.push(s); } }

  callsReady = false;
  solve() {
    if (!this.callsReady) {
      this.callsReady = true;
      while (this.boundTo.length < this.fns.length) this.boundTo.push([]);
      for (let i = 0; i < this.calls.length; i++) {
        const c = this.calls[i];
        const callee = c.method !== undefined ? this.propFns.get(c.method) ?? NONE : c.callee;
        for (const f of callee.f ?? []) this.bindCall(c, f);
        for (const s of callee.s ?? []) { this.watch[s].push(i); for (const f of this.symF[s]) this.bindCall(c, f); }
      }
    }
    while (this.work.length) {
      const s = this.work.pop()!; this.queued.delete(s);
      for (const t of this.edges[s]) { for (const n of this.symN[s]) this.add(t, n); for (const f of this.symF[s]) this.addF(t, f); }
      for (const t of this.fedges[s]) for (const f of this.symF[s]) this.addF(t, f);
      for (const ci of this.watch[s]) for (const f of this.symF[s]) this.bindCall(this.calls[ci], f);
      for (const [c, f] of this.retWatch[s]) this.returned(c, f);
    }
    this.memo.clear();
  }
  bindCall(c: Call, f: number) {
    if (c.bound.has(f)) return;
    c.bound.add(f);
    const fn = this.fns[f];
    this.boundTo[f].push(c);
    fn.params.forEach((p, i) => { if (c.args[i]) this.flowFns(p, c.args[i]); const l = c.lits[i]; if (l != null) this.takes.push([{ s: [p] }, [l]]); });
    this.retWatch[fn.ret].push([c, f]);
    this.returned(c, f);
  }
  /** A call's result: what its function returns, its own arguments in place of the function's parameters. */
  returned(c: Call, f: number) {
    const ret = this.fns[f].ret, mine = `\0${f}:`;
    for (const n of this.symN[ret]) {
      if (n.startsWith(mine)) { const a = c.args[Number(n.slice(mine.length))]; if (a) this.flow(c.res, a); }
      else this.add(c.res, n);
    }
    for (const g of this.symF[ret]) this.addF(c.res, g);
  }
  token(f: number, i: number) { return `\0${f}:${i}`; }
  memo = new Map<string, Set<string>>();
  /** Every name a parameter was handed (a token expanded through every call that bound it). */
  expand(t: string, seen: Set<string>): Set<string> {
    const hit = this.memo.get(t); if (hit) return hit;
    if (seen.has(t)) return new Set();
    seen.add(t);
    const [f, i] = t.slice(1).split(':').map(Number), out = new Set<string>();
    for (const c of this.boundTo[f] ?? []) { const a = c.args[i]; if (a) for (const n of this.raw(a, seen)) out.add(n); }
    seen.delete(t);
    if (!seen.size) this.memo.set(t, out);
    return out;
  }
  raw(v: VX, seen = new Set<string>()): Set<string> {
    const out = new Set<string>();
    const put = (n: string) => { if (n.charCodeAt(0) === 0) { for (const m of this.expand(n, seen)) out.add(m); } else out.add(n); };
    for (const n of v.n ?? []) put(n);
    for (const s of v.s ?? []) for (const n of this.symN[s]) put(n);
    return out;
  }
  /** The names a value carries. A weak name ("\u0001thug": an element named by a value its key takes) counts for the
   * keys read on it and the values compared with it, never for reading any key or being handed away (`strong`): a
   * value's word is not an object's name. */
  namesOf(v: VX, strong = false): Set<string> {
    const out = new Set<string>();
    for (const n of this.raw(v)) if (n.charCodeAt(0) !== 1) out.add(n); else if (!strong) out.add(n.slice(1));
    return out;
  }

  /** The world's ctx: the literal and every member written on it (through any variable or parameter that holds it). */
  seedCtx() { for (const s of this.ctxSeeds) this.add(s, '@ctx'); }
  isCtx(s: number) { return this.namesOf({ s: [s] }, true).has('@ctx'); }
  /** Name what a ctx call and GameMog.world are handed: "@ctx.a.b#i", "@world"; and what a table looked up by a
   * parameter finds, by the strings passed for it. */
  seedCalls() {
    for (const [, f, i, , el] of this.paramKeys) for (const c of this.boundTo[f] ?? []) { const l = c.lits[i]; if (l != null) this.add(el, `\u0001${l}`); }
    const all = this.ctx([]);
    const walk = (n: CtxNode, path: string) => {
      for (const f of n.fns) this.fns[f].params.forEach((p, i) => this.add(p, `@${path}#${i}`));
      for (const [k, c] of n.keys) walk(c, `${path}.${k}`);
    };
    walk(all, 'ctx');
    for (const [o, k, fs] of this.gmFns) if (k === 'world' && this.namesOf(o, true).has('GameMog')) for (const f of fs) { const p = this.fns[f].params[0]; if (p !== undefined) this.add(p, '@world'); }
  }
  ctx(exclude: Guard[], drop?: [number, number]): CtxNode {
    const root = ctxNode();
    const fnsOf = (e: ts.Expression): number[] => {
      e = strip(e);
      if (isFn(e)) { const f = this.fnOf.get(e); return f === undefined ? [] : [f]; }
      if (ts.isIdentifier(e)) { const s = this.idSym.get(e); return s === undefined ? [] : [...this.symF[s]]; }
      return [];
    };
    const merge = (into: CtxNode, e: ts.Expression, top: boolean) => {
      e = strip(e);
      const lit = ts.isObjectLiteralExpression(e) ? e : this.literal(e);
      if (lit && ts.isObjectLiteralExpression(lit)) {
        for (const p of lit.properties) {
          const k = p.name ? keyName(p.name as ts.PropertyName) : null;
          if (!k) { into.open = true; continue; }
          const child = into.keys.get(k) ?? ctxNode();
          if (top && THREE_LEAVES.has(k)) child.three = true;
          if (ts.isPropertyAssignment(p)) merge(child, p.initializer, false);
          else if (ts.isShorthandPropertyAssignment(p)) merge(child, p.name, false);
          else if (isFn(p)) { const f = this.fnOf.get(p); if (f !== undefined) child.fns.add(f); }
          else child.open = true;
          into.keys.set(k, child);
        }
        return;
      }
      const fs = fnsOf(e);
      if (fs.length) for (const f of fs) into.fns.add(f);
      else into.open = true;
    };
    for (const r of this.ctxRecs) {
      if (r.guard && exclude.includes(r.guard)) continue;
      if (drop && r.pos >= drop[0] && r.pos < drop[1]) continue;
      if (!this.isCtx(r.root)) continue;
      let at = root;
      for (const k of r.path) { const next = at.keys.get(k) ?? ctxNode(); if (at === root && THREE_LEAVES.has(k)) next.three = true; at.keys.set(k, next); at = next; }
      merge(at, r.rhs, at === root);
    }
    return root;
  }

  /** Name each element looked up by a key with the values that key takes (a third pass: values need names). */
  named() {
    const { values, takes } = this.reading();
    for (const [el, x] of this.elems) for (const n of this.namesOf(x)) for (const m of [values, takes]) for (const v of m.get(n) ?? []) if (/^[A-Za-z_$][\w$]*$/.test(v)) this.add(el, `\u0001${v}`);
  }
  reading(): Reading {
    // a key written with another's value ({ style: SO.goal }, cfg.arms = O.weapons) is read for it too
    const link = new Map<string, Set<string>>();
    for (const [k, v] of this.links) for (const n of this.namesOf(v)) if (n !== k) { const l = link.get(k); if (l) l.add(n); else link.set(k, new Set([n])); }
    const reach = new Map<string, string[]>();
    const all = (n: string): string[] => {
      const hit = reach.get(n); if (hit) return hit;
      const out = new Set([n]), stack = [n];
      while (stack.length) for (const m of link.get(stack.pop()!) ?? []) if (!out.has(m)) { out.add(m); stack.push(m); }
      const r = [...out]; reach.set(n, r); return r;
    };
    const named = (v: VX) => { const out = new Set<string>(); for (const n of this.namesOf(v)) for (const m of all(n)) out.add(m); return out; };
    const anyAt = new Map<string, number>();
    const keys = new Map<string, Set<string>>(), anyKey = new Set<string>(), values = new Map<string, Set<string>>(), takes = new Map<string, Set<string>>(), writes = new Map<string, Set<string>>();
    const put = (m: Map<string, Set<string>>, n: string, v: string) => { const s = m.get(n); if (s) s.add(v); else m.set(n, new Set([v])); };
    // (but not its reading of any key: names are shared, and a link would hand one object's for-in to every other's)
    const any = (o: VX, pos: number) => { for (const n of this.namesOf(o, true)) { anyKey.add(n); if (!anyAt.has(n)) anyAt.set(n, pos); } };
    // (a weak name's reads count, but the list a failure shows is what is read under the name itself)
    const own = new Map<string, Set<string>>();
    for (const [o, k] of this.reads) { for (const n of named(o)) put(keys, n, k); for (const n of this.namesOf(o, true)) for (const m of all(n)) put(own, m, k); }
    for (const [o, pos] of this.anys) any(o, pos);
    for (const [o, f, i, pos] of this.paramKeys) for (const c of this.boundTo[f] ?? []) { const l = c.lits[i]; if (l == null) any(o, pos); else for (const n of named(o)) put(keys, n, l); }
    // a lookup by a key that is itself a name (X[o.kind]) reads any key of X; by an unnamed one (a counter) an element
    for (const [o, x, pos] of this.lookups) if (this.namesOf(x).size) any(o, pos);
    // (values by a value's own names: not through a link, `{ name: g.preset }` would hand every compared name to the
    // preset, and not by a weak name, an element named by the values of its key is no list of values itself)
    const strong = (v: VX) => this.namesOf(v, true);
    for (const [v, ws] of this.enums) for (const n of strong(v)) for (const w of ws) put(values, n, w);
    for (const [v, ws] of this.takes) for (const n of strong(v)) for (const w of ws) put(takes, n, w);
    for (const [o, k] of this.writes) for (const n of this.namesOf(o, true)) put(writes, n, k);
    // a key looked up in a table: its values are the table's keys, where the table is one written under a key
    // (K0.surf[p.kind]); in a table the reading cannot see (a clip by its name), any value
    const openValues = new Set<string>();
    // (a table the runtime fills by this very value, EVENTS[name] = [...], is a registry: it says nothing of the values)
    const filledBy = new Map<string, Set<string>>();
    for (const [t, x] of this.fills) { const s = filledBy.get(t) ?? new Set<string>(); for (const n of this.namesOf(x, true)) s.add(n); filledBy.set(t, s); }
    for (const [ti, [t, x, node]] of this.tables.entries()) {
      // (resolved now, with every declaration seen: a table may be declared after the code that reads it)
      const lit = this.literal(node), text = strip(node).getText(this.sf);
      let ks: string[] | null = null;
      if (lit && ts.isObjectLiteralExpression(lit)) {
        ks = lit.properties.map((p) => p.name && keyName(p.name as ts.PropertyName)).filter((k): k is string => !!k);
        if (!ks.length && [...this.namesOf(x, true)].some((n) => filledBy.get(text)?.has(n))) continue;
      } else if (lit && ts.isArrayLiteralExpression(lit)) { const ss = lit.elements.map((e) => str(e)); ks = ss.every((e) => e !== null) ? ss as string[] : []; }
      else { const u = new Set<string>(); for (const n of t.n ?? []) for (const k of this.litUnder.get(n) ?? []) u.add(k); ks = [...u]; }
      if (ks.length) { for (const n of strong(x)) for (const k of ks) put(this.passing.has(ti) ? takes : values, n, k); } else for (const n of this.namesOf(x, true)) openValues.add(n);
    }
    // a registry's keys as the runtime sends them: what emit('shatter', ...) looks up in EVENTS, which ctx.on fills
    // (every call naming its key in a string, or the list is not known: null)
    const sends = new Map<string, Set<string> | null>();
    for (const [, f, i, , , text] of this.paramKeys) {
      const by = filledBy.get(text); if (!by) continue;
      const calls = this.boundTo[f] ?? [], lits = calls.map((c) => c.lits[i]);
      for (const n of by) {
        const had = sends.get(n);
        if (had === null) continue;
        if (lits.some((l) => l == null)) { sends.set(n, null); continue; }
        const set = had ?? new Set<string>(); for (const l of lits) set.add(l!); sends.set(n, set);
      }
    }
    for (const [v, node] of this.regexes) {
      const re = this.literal(node), w = re && ts.isRegularExpressionLiteral(re) ? regexWords(re.text) : null;
      if (w) for (const n of strong(v)) for (const k of w) put(values, n, k);
    }
    for (const c of this.calls) if (!c.bound.size && !c.builtin) for (const a of c.args) for (const n of this.namesOf(a, true)) openValues.add(n);
    // handed to a function the reading cannot see: any key
    for (const c of this.calls) if (!c.bound.size && !c.builtin) for (const a of c.args) any(a, c.pos);
    const guards = new Set(Object.keys(GUARDS).filter((g) => new RegExp(`\\b(?:var|let|const)\\s+${g}\\b`).test(this.sf.text)));
    const line = (pos: number) => { const t = this.sf.text; while (pos < t.length && /\s/.test(t[pos])) pos++; return this.sf.getLineAndCharacterOfPosition(pos).line + 1; };
    return { names: this.names, keys, own, anyKey, values, takes, writes, openValues, sends, ctx: (ex, drop) => this.ctx(ex, drop), guards, anyAt: (n) => anyAt.has(n) ? line(anyAt.get(n)!) : null };
  }
}
