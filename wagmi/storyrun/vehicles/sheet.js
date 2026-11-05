// Story Kit vehicles: reading a sheet. checkSheet(sheet) walks it against vehicle-sheet.schema.json (the one source of
// the word lists), clamps what can be clamped and refuses what can't:
//   - a knob outside -1..1, an era out of range, a number of gears: clamped, with a note;
//   - an unknown word, a field the schema doesn't have, a family not built yet: refused (problems);
//   - a real maker's or model's name in the label, nickname, line, livery text or plate: refused (the brand rule).
// fillSheet(sheet) then lays the class preset's defaults under it, so the builder always reads a complete sheet.
//
//   const { ok, sheet, problems, notes } = checkSheet(raw);   // sheet: clamped and filled in (when ok)
import SCHEMA from './vehicle-sheet.schema.json' with { type: 'json' };
import { CLASSES, REAL_NAMES } from './classes.js';

export { SCHEMA };

const ref = (s) => (s && s.$ref ? SCHEMA.$defs[s.$ref.split('/').pop()] : s);

function walk(s, v, path, out) {
  s = ref(s);
  if (s.oneOf) {
    for (const alt of s.oneOf) { const o = { problems: [], notes: [] }; const r = walk(alt, v, path, o); if (!o.problems.length) { out.notes.push(...o.notes); return r; } }
    out.problems.push(`${path}: ${JSON.stringify(v)} is none of the allowed forms`); return v;
  }
  if ('const' in s) { if (v !== s.const) out.problems.push(`${path}: must be ${JSON.stringify(s.const)}`); return v; }
  if (s.enum) {
    if (!s.enum.includes(v)) out.problems.push(`${path}: "${v}" is not one of ${s.enum.join(' | ')}${s['x-planned']?.includes(v) ? ' (planned, not built yet: refused, never faked)' : ''}`);
    return v;
  }
  const t = s.type;
  if (t === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) { out.problems.push(`${path}: must be an object`); return v; }
    for (const k of s.required || []) if (!(k in v)) out.problems.push(`${path}.${k}: required`);
    const res = {};
    for (const [k, x] of Object.entries(v)) {
      if (!s.properties?.[k]) { if (s.additionalProperties === false) out.problems.push(`${path}.${k}: not a field of the sheet`); continue; }
      res[k] = walk(s.properties[k], x, `${path}.${k}`, out);
    }
    return res;
  }
  if (t === 'array') {
    if (!Array.isArray(v)) { out.problems.push(`${path}: must be a list`); return v; }
    let a = v;
    if (s.uniqueItems) a = [...new Set(a)];
    if (s.maxItems && a.length > s.maxItems) { out.notes.push(`${path}: cut to ${s.maxItems}`); a = a.slice(0, s.maxItems); }
    return a.map((x, i) => walk(s.items, x, `${path}[${i}]`, out));
  }
  if (t === 'number' || t === 'integer') {
    if (typeof v !== 'number' || !Number.isFinite(v)) { out.problems.push(`${path}: must be a number`); return v; }
    let n = t === 'integer' ? Math.round(v) : v;
    if (s.minimum != null && n < s.minimum) n = s.minimum;
    if (s.maximum != null && n > s.maximum) n = s.maximum;
    if (n !== v) out.notes.push(`${path}: ${v} clamped to ${n}`);
    return n;
  }
  if (t === 'string') {
    if (typeof v !== 'string') { out.problems.push(`${path}: must be text`); return v; }
    let x = v;
    if (s.maxLength && x.length > s.maxLength) { out.notes.push(`${path}: cut to ${s.maxLength} characters`); x = x.slice(0, s.maxLength); }
    if (s.pattern && !new RegExp(s.pattern).test(x)) out.problems.push(`${path}: "${x}" has characters it can't have`);
    return x;
  }
  if (t === 'boolean') { if (typeof v !== 'boolean') out.problems.push(`${path}: must be true or false`); return v; }
  if (t === 'null') { if (v !== null) out.problems.push(`${path}: must be null`); return v; }
  return v;
}

// the brand rule: no maker's or model's name anywhere a player reads
export function realNameProblems(sheet) {
  const texts = [['label', sheet.label], ['story.nickname', sheet.story?.nickname], ['story.oneLine', sheet.story?.oneLine],
    ['paint.livery.text', sheet.paint?.livery?.text], ['plate', sheet.plate], ['id', sheet.id]];
  const out = [];
  for (const [where, t] of texts) {
    if (!t) continue;
    const low = ' ' + String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
    for (const n of REAL_NAMES) if (low.includes(' ' + n + ' ')) out.push(`${where}: "${n}" is a real maker's or model's name (original names only)`);
  }
  return out;
}

export function checkSheet(raw) {
  const out = { problems: [], notes: [] };
  const clean = walk(SCHEMA, raw, 'sheet', out);
  if (!out.problems.length) out.problems.push(...realNameProblems(clean));
  return { ok: !out.problems.length, sheet: out.problems.length ? null : fillSheet(clean), problems: out.problems, notes: out.notes };
}

// the class preset's defaults under the sheet (only what the sheet leaves out)
export function fillSheet(s) {
  const C = CLASSES[s.class];
  const o = (a, b) => ({ ...(a || {}), ...(b || {}) });
  const era = s.era ?? 2010;
  return {
    ...s,
    era,
    condition: s.condition || 'daily',
    proportions: o({ length: 0, width: 0, height: 0, rideHeight: 0, wheelSize: 0, bonnet: 0, cabinForward: 0, roofline: 0, windscreenRake: 0, beltline: 0, flare: 0, tumblehome: 0 }, s.proportions),
    body: o({ rear: C.rear, doors: C.doors, doorType: C.doorType || 'conventional', roof: C.roof, crease: 'single', hood: 'flat', aero: 'none', cladding: C.clad > 0, sideScoop: false, roofRails: false, trim: C.trim }, s.body),
    face: o({ ...C.face, grilleSize: 0 }, s.face),
    tail: o(C.tail, s.tail),
    paint: o({ base: '#8A8D91', finish: 'metallic', second: null, split: 'none', stripes: 'none', stripeColour: '#F2F2F0', livery: null }, s.paint),
    wheels: o({ ...C.wheels, whitewall: false }, s.wheels),
    interior: o({ partition: false, ...C.interior }, s.interior),
    props: s.props || [],
    sound: o({ ...C.sound, horn: 'twin' }, s.sound),
    handling: o({ pace: 0, pull: 0, grip: 0, weight: 0, turnIn: 0, brakes: 0, ...C.handling }, s.handling),
    abilities: s.abilities || ['boost'],
    story: o({}, s.story),
    plate: s.plate ?? '',
  };
}
