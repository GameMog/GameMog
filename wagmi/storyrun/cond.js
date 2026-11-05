// Mog City story runner (from the Story Kit's missions/cond.js, the same semantics): conditions and values, so a mission's branches and numbers stay pure data.
//
// A condition (a step's `if`, a set entry's `if`, a trigger's `if`, a value's `add[].if`) is one of:
//   'flag'  '!flag'                         the flag is set (truthy) / not set
//   'flag == value'  'flag != value'        a flag compared with a word or a number (no quotes)
//   'cash >= 40'  'trust < 30'              a meter (any key of state.meters) with == != < <= > >=
//   (flag and meter names are compared in one spelling, story.js flagName: 'my flag' and 'my_flag' are one flag)
//   'done:M2'  '!done:M2'                   a mission passed earlier (the save)
//   { all: [cond, ...] }  { any: [cond, ...] }  { not: cond }
//   (state) => boolean                       a function (allowed, but then the mission is no longer pure data)
//
// A value (a pursuit's `count`, a timer's `seconds`, a stop's `bonus`) is a number, or
//   { base: 3, add: [{ if: cond, n: 1 }, ...], min: 1, max: 5 }
// so "3 pursuers, +1 if rival_role == bigger" is { base: 3, add: [{ if: 'rival_role == bigger', n: 1 }] }.

// (flag names compared in one spelling: 'my flag' and 'my_flag' are one flag)
export function flagName(s) {
  return String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’`]/g, '')
    .replace(/[^a-z0-9:]+/g, '_').replace(/^_+|_+$/g, '');
}

const OPS = ['==', '!=', '>=', '<=', '>', '<'];

function lit(s) {
  const t = String(s).trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
  return t !== '' && !Number.isNaN(+t) ? +t : t.replace(/^['"]|['"]$/g, '');
}

export function test(cond, state, done = {}) {
  if (cond == null || cond === '') return true;
  if (typeof cond === 'function') return !!cond(state);
  if (Array.isArray(cond)) return cond.every((c) => test(c, state, done));
  if (typeof cond === 'object') {
    if (cond.all) return cond.all.every((c) => test(c, state, done));
    if (cond.any) return cond.any.some((c) => test(c, state, done));
    if ('not' in cond) return !test(cond.not, state, done);
    return true;
  }
  let s = String(cond).trim();
  const neg = s.startsWith('!') && !s.startsWith('!=');
  if (neg) s = s.slice(1).trim();
  let r;
  if (s.startsWith('done:')) r = !!(done && done[s.slice(5).trim()]);
  else {
    const op = OPS.find((o) => s.includes(o));
    if (!op) r = !!(state.flags || {})[flagName(s)];
    else {
      const [k0, v] = s.split(op).map((x) => x.trim()), k = flagName(k0);
      const meters = state.meters || {}, flags = state.flags || {};
      const a = k in flags ? flags[k] : meters[k], b = lit(v);
      switch (op) {
        case '==': r = a == b || (a == null && (b === false || b === 0 || b === null)); break; // eslint-disable-line eqeqeq
        case '!=': r = !(a == b || (a == null && (b === false || b === 0 || b === null))); break; // eslint-disable-line eqeqeq
        case '>=': r = +a >= +b; break;
        case '<=': r = +a <= +b; break;
        case '>': r = +a > +b; break;
        case '<': r = +a < +b; break;
      }
    }
  }
  return neg ? !r : r;
}

export function value(v, state, done) {
  if (v == null) return v;
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'function') return v(state);
  if (typeof v === 'object' && ('base' in v || 'add' in v)) {
    let n = +(v.base || 0);
    for (const a of v.add || []) if (test(a.if, state, done)) n += +(a.n || 0);
    if (v.min != null) n = Math.max(v.min, n);
    if (v.max != null) n = Math.min(v.max, n);
    return n;
  }
  return v;
}
