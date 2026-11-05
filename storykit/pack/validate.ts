/**
 * Story Kit: a small JSON Schema (2020-12) checker for the pack gate, with clamping. It covers what the pack, Character
 * Forge and vehicle sheet schemas use: type, const, enum, pattern, minLength/maxLength, minimum/maximum, required,
 * properties, additionalProperties (false or a schema), propertyNames, min/maxProperties, items, min/maxItems,
 * uniqueItems, oneOf, anyOf, allOf and $ref (local "#/..." and other registered schemas by $id).
 *
 * A number outside its range is CLAMPED (and an integer rounded) and noted, not refused, except at the paths in
 * `refuseNumbers` (an age: a 12-year-old is never quietly made 16). Everything else that fails is a problem.
 * `oneOf` branches told apart by a `type` const (the steps) or a `stock` key report only the matching branch's errors.
 */
type Json = any;
export type Schema = Record<string, any>;
export type Checked = { value: Json; problems: string[]; clamped: string[] };

const typeOf = (v: Json) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const fits = (t: string, v: Json) => { const k = typeOf(v); return t === k || (t === 'number' && k === 'integer'); };
const len = (s: string) => [...s].length;
const show = (v: Json) => { const s = JSON.stringify(v); return s && s.length > 40 ? s.slice(0, 37) + '...' : s; };

export class Validator {
  private registry = new Map<string, Schema>();
  private refuseNumbers: RegExp[];
  constructor(schemas: Schema[], refuseNumbers: RegExp[] = []) { this.refuseNumbers = refuseNumbers; for (const s of schemas) if (s && s.$id) this.registry.set(s.$id, s); }
  has(id: string) { return this.registry.has(id); }

  check(rootId: string, value: Json): Checked {
    const root = this.registry.get(rootId);
    if (!root) throw new Error(`no schema ${rootId}`);
    const out: Checked = { value: JSON.parse(JSON.stringify(value ?? null)), problems: [], clamped: [] };
    const box = { v: out.value };
    this.walk(root, root, box, 'v', '', out);
    out.value = box.v;
    return out;
  }

  private resolve(ref: string, root: Schema): [Schema, Schema] {
    const [file, frag = ''] = ref.split('#');
    const base = file ? this.registry.get(file) : root;
    if (!base) return [{ 'x-missing': file }, root];
    let s: any = base;
    for (const part of frag.split('/').filter(Boolean)) s = s?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
    return [s ?? { 'x-missing': ref }, base];
  }

  /** errors of `value` against `schema`, with no clamping and no side effects (for oneOf/anyOf branch tests) */
  private errorsOf(schema: Schema, root: Schema, value: Json, at: string): string[] {
    const out: Checked = { value: null, problems: [], clamped: [] };
    const box = { v: JSON.parse(JSON.stringify(value ?? null)) };
    this.walk(schema, root, box, 'v', at, out, true);
    return out.problems;
  }

  private walk(schema: Schema, root: Schema, parent: any, key: string | number, at: string, out: Checked, dry = false): void {
    const where = at || '(the pack)';
    if (schema.$ref) { const [s, r] = this.resolve(schema.$ref, root); if (s['x-missing']) { out.problems.push(`${where}: its schema ${s['x-missing']} is not available`); return; } this.walk({ ...s, ...without(schema, '$ref') }, r, parent, key, at, out, dry); return; }
    const v = parent[key];
    if ('const' in schema && JSON.stringify(v) !== JSON.stringify(schema.const)) { out.problems.push(`${where}: must be ${show(schema.const)}, not ${show(v)}`); return; }
    if (schema.enum && !schema.enum.some((e: Json) => JSON.stringify(e) === JSON.stringify(v))) {
      const list = schema.enum.length > 12 ? `${schema.enum.slice(0, 12).join(', ')} ...` : schema.enum.join(', ');
      out.problems.push(`${where}: ${show(v)} is not one of ${list}`); return;
    }
    if (schema.allOf) for (const s of schema.allOf) this.walk(s, root, parent, key, at, out, dry);
    if (schema.anyOf && !schema.anyOf.some((s: Schema) => this.errorsOf(s, root, v, at).length === 0)) {
      out.problems.push(`${where}: matches none of its forms (${schema.anyOf.map((s: Schema) => (s.required ? `with ${s.required.join(' + ')}` : 'a form')).join(' or ')})`);
      return;
    }
    if (schema.oneOf) { this.oneOf(schema.oneOf, root, parent, key, at, out, dry); return; }
    if (schema.type) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      if (!types.some((t: string) => fits(t, v))) {
        if (types.includes('integer') && typeof v === 'number' && Number.isFinite(v)) {
          if (!dry) { parent[key] = Math.round(v); out.clamped.push(`${where}: ${v} rounded to ${Math.round(v)}`); }
        } else { out.problems.push(`${where}: must be ${types.join(' or ')}, not ${typeOf(v)}`); return; }
      }
    }
    const val = parent[key];
    if (typeof val === 'string') {
      if (schema.maxLength != null && len(val) > schema.maxLength) out.problems.push(`${where}: ${len(val)} characters, the limit is ${schema.maxLength}`);
      if (schema.minLength != null && len(val) < schema.minLength) out.problems.push(`${where}: at least ${schema.minLength} characters`);
      if (schema.pattern && !new RegExp(schema.pattern, 'u').test(val)) out.problems.push(`${where}: ${show(val)} is not written as ${schema.pattern}`);
    }
    if (typeof val === 'number') {
      if (!Number.isFinite(val)) { out.problems.push(`${where}: not a finite number`); return; }
      const lo = schema.minimum ?? -Infinity, hi = schema.maximum ?? Infinity;
      if (val < lo || val > hi) {
        if (this.refuseNumbers.some((re) => re.test(at))) out.problems.push(`${where}: ${val} is outside ${lo}..${hi}`);
        else if (!dry) { const c = Math.min(hi, Math.max(lo, val)); parent[key] = c; out.clamped.push(`${where}: ${val} clamped to ${c}`); }
      }
    }
    if (Array.isArray(val)) {
      if (schema.maxItems != null && val.length > schema.maxItems) out.problems.push(`${where}: ${val.length} items, the limit is ${schema.maxItems}`);
      if (schema.minItems != null && val.length < schema.minItems) out.problems.push(`${where}: needs at least ${schema.minItems}`);
      if (schema.uniqueItems && new Set(val.map((x) => JSON.stringify(x))).size !== val.length) out.problems.push(`${where}: has repeats`);
      if (schema.items) for (let i = 0; i < Math.min(val.length, 1000); i++) this.walk(schema.items, root, val, i, `${at}[${i}]`, out, dry);
    }
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const keys = Object.keys(val), props = schema.properties || {};
      if (schema.maxProperties != null && keys.length > schema.maxProperties) out.problems.push(`${where}: ${keys.length} entries, the limit is ${schema.maxProperties}`);
      if (schema.minProperties != null && keys.length < schema.minProperties) out.problems.push(`${where}: needs at least ${schema.minProperties} entr${schema.minProperties > 1 ? 'ies' : 'y'}`);
      for (const r of schema.required || []) if (!(r in val)) out.problems.push(`${where}: ${r} is missing`);
      for (const k of keys) {
        const p = at ? `${at}.${k}` : k;
        if (schema.propertyNames) { const e = this.errorsOf(schema.propertyNames, root, k, `${p} (the name)`); if (e.length) { out.problems.push(...e); continue; } }
        if (props[k]) this.walk(props[k], root, val, k, p, out, dry);
        else if (schema.additionalProperties === false) out.problems.push(`${where}: "${k}" is not a field here`);
        else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') this.walk(schema.additionalProperties, root, val, k, p, out, dry);
      }
    }
  }

  private oneOf(branches: Schema[], root: Schema, parent: any, key: string | number, at: string, out: Checked, dry: boolean) {
    const v = parent[key];
    const where = at || '(the pack)';
    // a branch picked by its discriminator: { type: { const } } (steps) or a required `stock` (stock cars)
    const deref = (s: Schema): [Schema, Schema] => (s.$ref ? this.resolve(s.$ref, root) : [s, root]);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (typeof v.type === 'string') {
        const hit = branches.find((b) => deref(b)[0]?.properties?.type?.const === v.type);
        if (hit) { this.walk(hit, root, parent, key, at, out, dry); return; }
        if (branches.some((b) => deref(b)[0]?.properties?.type?.const)) { out.problems.push(`${where}: "${v.type}" is not a step kind`); return; }
      }
      const stock = branches.find((b) => deref(b)[0]?.required?.includes('stock'));
      if (stock) { this.walk('stock' in v ? stock : branches.find((b) => b !== stock)!, root, parent, key, at, out, dry); return; }
    }
    const ok = branches.filter((b) => this.errorsOf(b, root, v, at).length === 0);
    if (ok.length === 1) { this.walk(ok[0], root, parent, key, at, out, dry); return; }
    if (ok.length > 1) { this.walk(ok[0], root, parent, key, at, out, dry); return; }
    // none fits: report the closest branch (fewest errors)
    const scored = branches.map((b) => ({ b, e: this.errorsOf(b, root, v, at) })).sort((x, y) => x.e.length - y.e.length);
    const near = scored[0];
    if (near && near.e.length <= 2) out.problems.push(...near.e);
    else out.problems.push(`${where}: ${show(v)} is not a valid value here`);
  }
}

const without = (o: Schema, k: string) => { const c = { ...o }; delete c[k]; return c; };
