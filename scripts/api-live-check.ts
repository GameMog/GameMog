/**
 * The builder's manual, checked on the running runtime.  `npm run check:api` (the static half runs in npm run check:
 * scripts/api-doc-check.ts)
 *
 * The static half finds every name lib/runtime/API.md promises in the runtime's source; this half asks the runtime
 * itself, in real Chrome:
 *
 *   - a small world of each kind (a race, an open world, a kart race, a shootout) is booted, and every ctx path its
 *     chapters name is looked up on the ctx that world was given: there, and a function where the manual calls it
 *   - every call the manual says returns a shape ("`ctx.assets.model(id)` returns `{ object, parts, ... }`") is made
 *     (PROBES) and its result checked for each key, a function where the manual writes one
 *   - every code example runs as a tiny world, wrapped as the static half wraps it (in the smallest world of its kind,
 *     its own keys, character or statements in place of the host's; placeholders bound and reported), and must load
 *     and run with no error and nothing the runtime refused (a warning that is not an ADVISORY); a fragment is skipped,
 *     and says why
 *
 * Uses throwaway drafts in the local database (prompt 'api check'), removed afterwards. Needs the dev server (BASE,
 * default http://localhost:3939, local only) and Chrome, with no other Chrome suite running:
 * npm run check:api [file]
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { withBrowser, type Page } from '../lib/browser.ts';
import { insertDraft, db } from '../lib/db.ts';
import { readManual, namesIn, examples, promises, hostWorld, ALLOW_CTX, type Kind } from './api-doc-check.ts';

const BASE = process.env.BASE ?? 'http://localhost:3939';
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) { console.error(`check:api runs on a local dev server only (BASE is ${BASE})`); process.exit(2); }
const FILE = process.argv[2] ?? 'lib/runtime/API.md';
let failures = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '  ok  ' : '  FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
  if (!cond) failures++;
};
const skip = (name: string, why: string) => console.log(`  skip  ${name}: ${why}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The calls whose result the manual describes, made on the booted world of their kind (the host lists what they load)
const PROBES: Record<string, { kind: Kind; expr: string }> = {
  'ctx.assets.info': { kind: 'race', expr: "ctx.assets.info('human-athlete-male')" },
  'ctx.assets.human': { kind: 'race', expr: "ctx.assets.human('human-athlete-male', {})" },
  'ctx.assets.cyclist': { kind: 'race', expr: "ctx.assets.cyclist('human-athlete-male', {})" },
  'ctx.assets.skater': { kind: 'race', expr: "ctx.assets.skater('human-athlete-male', {})" },
  'ctx.assets.car': { kind: 'race', expr: "ctx.assets.car({ kind: 'formula' })" },
  'ctx.assets.texture': { kind: 'race', expr: "ctx.assets.texture('texture-sand')" },
  'ctx.assets.heightfield': { kind: 'race', expr: "ctx.assets.heightfield('heightfield-massif')" },
  'ctx.assets.model': { kind: 'race', expr: "ctx.assets.model('model-street-lamp')" },
  'ctx.track.frameAt': { kind: 'race', expr: 'ctx.track.frameAt(10)' },
  'ctx.track.nearest': { kind: 'race', expr: 'ctx.track.nearest(0, -110)' },
  'ctx.kart.impostors': { kind: 'kart', expr: 'ctx.kart.impostors({ cast: [{ object: ctx.kart.greybox({}).object, cycle: 1, step: function () {} }], frames: 2 })' },
  'ctx.kart.hazards': { kind: 'kart', expr: 'ctx.kart.hazards()' },
  'ctx.kart.cheer': { kind: 'kart', expr: 'ctx.kart.cheer()' },
  'ctx.shootout.impostors': { kind: 'shootout', expr: "ctx.shootout.impostors({ count: 1, frames: 2, make: function () { return ctx.assets.human('human-athlete-male', {}); } })" },
};
const PROBE_ASSETS = ['human-athlete-male', 'model-street-lamp', 'texture-sand', 'texture-fir-cards', 'heightfield-massif'];
// What the manual says of one asset's maps, in words rather than a shape: "An atlas with a cut-out (`texture-fir-cards`)
// has no `roughnessMap` and gives `alphaMap` and `cards`" (a world that set wrapS on every map it was told of would throw)
const ATLAS = { expr: "ctx.assets.texture('texture-fir-cards')", has: ['map', 'normalMap', 'alphaMap', 'cards', 'size'], lacks: ['roughnessMap'] };
// the ctx, handed to the check as the world builds; and the first frame's update and ambient() counted (a shootout
// writes no ambient())
const CAPTURE = 'window.__api = { ctx: ctx, updates: 0, ambient: 0 };';
// (20 Oct) the race probe calls the nature helpers, as a world that uses them does, so its runtime carries them
// (lib/custom-game.ts usesNature) and the manual's ctx.lava and ctx.ranges are checked on a live ctx that has them
const NATURE = ' window.__api.nature = [ctx.lava({ bank: true }), ctx.ranges({ rings: 1 })];';
const HOOKS = 'update: function (ctx) { if (window.__api) window.__api.updates++; },\n  ambient: function (ctx) { if (window.__api) window.__api.ambient++; },';

const made: string[] = [];
function draft(code: string, title: string) {
  const id = randomUUID();
  insertDraft({ id, prompt: 'api check', format: 'world', code, report: { ok: true, ran: true },
    meta: { title, tagline: 'The builder\'s manual, checked.', blurb: 'Made by the API check and removed after it.', genre: 'Test', cast: [{ name: 'Pip', color: '#F2E3C4' }], palette: { sky: '#9CCBEB', ground: '#7DB356', accent: '#F28C28' }, runtime: 1 } });
  made.push(id);
  return id;
}
type Load = { ready: boolean; errors: string[]; warnings: string[] };
const errorsNow = async (page: Page, e0: number) => [...new Set([...page.errors.slice(e0), ...(await page.eval<string[]>('(window.__gm && window.__gm.errors) || []').catch(() => []))])];
// The runtime's warnings are mostly a refusal: something the world said that it did not take (an asset not in the
// library, a preset it does not have, a handler that threw). From an example of the manual's, that is the manual
// teaching something the runtime refuses, so it fails, unless it is one of these advisories about the world around it
const ADVISORY: [RegExp, string][] = [
  [/^build\(\) added no lights/, 'an example whose build() is elided lights nothing of its own'],
  [/^Hidden \(piece/, 'the host\'s scenery, kept off the racing line'],
  [/on this device|could not start on this device|Live reflections could not start/, 'headless Chrome\'s graphics'],
];
const refusals = (warns: string[]) => warns.filter((w) => !ADVISORY.some(([re]) => re.test(w)));
const warningsNow = (page: Page) => page.eval<string[]>('(window.__gm && window.__gm.warnings) || []').catch(() => [] as string[]);
/** A world as a draft, opened on the dev server, waited for until the runtime says it is ready. */
async function load(page: Page, code: string, title: string, waitMs = 90_000): Promise<Load> {
  const id = draft(code, title), e0 = page.errors.length;
  await page.goto(`${BASE}/d/${id}/play`);
  let ready = false;
  for (let t = 0; t < waitMs && !ready; t += 250) { await sleep(250); ready = await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false); }
  return { ready, errors: await errorsNow(page, e0), warnings: await warningsNow(page) };
}
/** The sound on (ambient() runs), then a run started, as a player's first key would. */
async function settle(page: Page, ms: number) {
  await page.eval('window.__gmRuntime && window.__gmRuntime.debug.audio()').catch(() => null);
  await sleep(ms);
  await page.eval('window.__gmRuntime && window.__gmRuntime.debug.start()').catch(() => null);
  await sleep(ms);
}

const M = readManual(readFileSync(FILE, 'utf8'));
const EX = examples(M), PROMISES = promises(M);

// every ctx path the manual names, by the kind of world its chapter is about (members of a ctx list included)
const skips = new Map<string, string>();
const paths: Record<Kind, Map<string, { segs: string[]; calls: boolean[]; line: number }>> = { race: new Map(), open: new Map(), kart: new Map(), shootout: new Map() };
const addPath = (kind: Kind, segs: string[], calls: boolean[], line: number) => {
  const key = segs.map((s, i) => s + (calls[i] ? '()' : '')).join('.');
  const allowed = ALLOW_CTX.find((a) => a.kind === kind && a.path === segs.join('.'));
  if (allowed) skips.set(`${kind}: ${segs.join('.')}`, `allowed (ALLOW_CTX): ${allowed.why}`);
  else if (!paths[kind].has(key)) paths[kind].set(key, { segs, calls, line });
};
for (const s of M.spans) {
  const kind = M.kindAt(s.line);
  if (s.of) { const t = s.text.trim(); addPath(kind, [...s.of, t.replace(/\(.*$/, '')], [...s.of.map(() => false), t.includes('(')], s.line); continue; }
  for (const f of namesIn(s.text)) if (f.what === 'path' && f.segs[0] === 'ctx') addPath(kind, f.segs, f.calls, s.line);
}
for (const ex of EX) for (const f of namesIn(ex.code)) if (f.what === 'path' && f.segs[0] === 'ctx') addPath(ex.kind, f.segs, f.calls, ex.line + (ex.code.slice(0, f.at).match(/\n/g) ?? []).length);

const HOST_OF: Record<Kind, Parameters<typeof hostWorld>[0]> = { race: 'race', open: 'open', kart: 'kart', shootout: 'shootout' };

try {
  await withBrowser(async (page) => {
    await page.emulate({ width: 1280, height: 720 });
    console.log(`\nthe manual's ctx, on the live ctx of each kind of world (${FILE})`);
    for (const kind of ['race', 'open', 'kart', 'shootout'] as Kind[]) {
      const world = hostWorld(HOST_OF[kind], { capture: kind === 'race' ? CAPTURE + NATURE : CAPTURE, props: kind === 'shootout' ? HOOKS.split('\n')[0] : HOOKS, assets: kind === 'race' ? PROBE_ASSETS : [] });
      const e0 = page.errors.length;
      const L = await load(page, world, `API check ${kind}`);
      if (!L.ready) { ok(`a ${kind} world boots`, false, L.errors.join(' | ') || 'never ready'); continue; }
      await settle(page, 1500);
      for (let t = 0; t < 15_000 && !(await page.eval<number>('window.__api ? window.__api.updates : 0').catch(() => 0)); t += 250) await sleep(250);
      const list = [...paths[kind].values()];
      // (past a call, the path goes on on what the call returns: made by its probe, or reported unchecked)
      type R = { ok: boolean; at?: number; type?: string; want?: string; unprobed?: string };
      const probes = Object.entries(PROBES).filter(([, q]) => q.kind === kind).map(([k, q]) => `${JSON.stringify(k)}: function (ctx) { return ${q.expr}; }`).join(',\n');
      const res = await page.eval<R[] | null>(`(function (paths) {
        var ctx = window.__api && window.__api.ctx; if (!ctx) return null;
        var probes = {${probes}};
        return paths.map(function (p) {
          var v = ctx;
          for (var i = 1; i < p.segs.length; i++) {
            if (p.calls[i - 1]) {
              var pre = p.segs.slice(0, i).join('.');
              if (!probes[pre]) return { ok: true, unprobed: pre };
              try { v = probes[pre](ctx); } catch (e) { return { ok: false, at: i, type: 'a call that threw (' + (e && e.message || e) + ')' }; }
            }
            if (v == null || !(p.segs[i] in Object(v))) return { ok: false, at: i, type: v === null ? 'null' : typeof v };
            v = v[p.segs[i]];
          }
          if (p.calls[p.segs.length - 1] && typeof v !== 'function') return { ok: false, at: p.segs.length - 1, type: typeof v, want: 'function' };
          return { ok: true, type: v === null ? 'null' : typeof v };
        });
      })(${JSON.stringify(list.map((p) => ({ segs: p.segs, calls: p.calls })))})`);
      if (!res) { ok(`a ${kind} world hands its build() a ctx`, false); continue; }
      const bad = list.map((p, i) => ({ p, r: res[i] })).filter((x) => !x.r.ok);
      list.forEach((p, i) => { if (res[i].unprobed) skips.set(`${kind}: ${p.segs.join('.')}`, `API.md:${p.line}: past the call ${res[i].unprobed}(...), which has no probe in PROBES: unchecked`); });
      ok(`${kind}: all ${list.length} ctx paths its chapters name are there${kind === 'race' ? ' (ctx.audio once the sound is on)' : ''}`, !bad.length,
        bad.map(({ p, r }) => `API.md:${p.line} ${p.segs.join('.')}: ${r.want ? `a ${r.type}, not a function` : `${p.segs.slice(0, r.at).join('.')} (${r.type}) has no ${p.segs[r.at!]}`}`).join(' | '));

      // what the manual says its calls return
      for (const pr of PROMISES.filter((q) => (PROBES[q.path]?.kind ?? null) === kind)) {
        const probe = PROBES[pr.path];
        const r = await page.eval<{ err?: string; keys?: [string, boolean, string][] }>(`(function (ctx) {
          try { var v = ${probe.expr}; if (Array.isArray(v)) v = v[0]; if (v == null) return { err: 'it returned ' + v };
            return { keys: ${JSON.stringify(pr.keys.map((k) => k.name))}.map(function (k) { return [k, k in Object(v), typeof v[k]]; }) };
          } catch (e) { return { err: String(e && e.message || e) }; }
        })(window.__api.ctx)`);
        const miss = (r.keys ?? []).filter(([k, has, type]) => !has || (pr.keys.find((q) => q.name === k)!.fn && type !== 'function'));
        ok(`${pr.path}(...) returns what API.md:${pr.line} says ({ ${pr.keys.map((k) => k.name + (k.fn ? '()' : '')).join(', ')} })`, !r.err && !miss.length,
          r.err ?? miss.map(([k, has, type]) => has ? `${k} is a ${type}, not a function` : `no ${k}`).join(', '));
      }
      if (kind === 'race') {
        const a = await page.eval<Record<string, boolean>>(`(function (ctx) { var v = ${ATLAS.expr} || {}; var o = {}; ${JSON.stringify([...ATLAS.has, ...ATLAS.lacks])}.forEach(function (k) { o[k] = v[k] != null; }); return o; })(window.__api.ctx)`);
        ok(`texture-fir-cards gives ${ATLAS.has.join(', ')} and no ${ATLAS.lacks.join(', ')} (the manual's "An atlas with a cut-out")`, ATLAS.has.every((k) => a[k]) && ATLAS.lacks.every((k) => !a[k]), JSON.stringify(a));
      }
      const errs = await errorsNow(page, e0), refused = refusals(await warningsNow(page));
      ok(`the ${kind} world ran with no error or refusal`, !errs.length && !refused.length, [...errs, ...refused].join(' | '));
    }
    for (const pr of PROMISES.filter((q) => !PROBES[q.path])) skip(`${pr.path}(...) at API.md:${pr.line}`, 'no probe for it in PROBES, so what it returns is unchecked: add one');
    for (const [what, why] of skips) skip(what, why);

    console.log('\nevery code example, run as a world');
    for (const ex of EX) {
      const name = `API.md:${ex.line} (${ex.shape}${ex.host ? `, in ${ex.host === 'open' ? 'an' : 'a'} ${ex.host} world` : ''}${ex.fills.length ? `; ${ex.fills.join('; ')}` : ''})`;
      if (ex.shape === 'fragment') { skip(`API.md:${ex.line}`, ex.why!); continue; }
      if (!ex.world) { ok(name, false, ex.why ?? 'it has no shape the check can run'); continue; }
      const e0 = page.errors.length;
      const L = await load(page, ex.world, `API example ${ex.line}`);
      if (L.ready) {
        // an open world on a library map finishes building after the page is ready
        for (let t = 0; t < 30_000; t += 300) { const st = await page.eval<boolean | null>('(function () { var s = window.__gmRuntime && window.__gmRuntime.state().open; return s ? !!s.ready : null; })()').catch(() => null); if (st !== false) break; await sleep(300); }
        await settle(page, 2000);
      }
      const errs = await errorsNow(page, e0), warns = await warningsNow(page), refused = refusals(warns);
      ok(name, L.ready && !errs.length && !refused.length, !L.ready ? `never ready${errs.length ? ': ' + errs.join(' | ') : ''}` : [...errs, ...refused.map((w) => `the runtime warned: ${w}`)].join(' | '));
      for (const w of warns.filter((x) => !refused.includes(x))) console.log(`        advisory: ${w}`);
    }
  }, { timeoutMs: 30 * 60_000 });
} finally {
  for (const id of made) db.prepare('DELETE FROM drafts WHERE id = ?').run(id);
}
console.log(`\n${failures ? `${failures} FAILED` : 'all checks passed'} (${made.length} throwaway drafts made and removed)\n`);
process.exit(failures ? 1 : 0);
