// GameMog copy of Mog City's story pack rulebook: MogCity wagmi/story/schema.js, schema version 1 (base mog-city@1),
// copied 3 Nov 2026. Everything below the next line is that file byte for byte; never edit it here: copy it again from
// Mog City (npm run check compares the two when a Mog City checkout is beside this one, and the SHA-256 pinned in
// lib/episode.ts always).
// ---- copy below ----
// Mog City: the story pack's one rulebook (schema version 1), a plain ES module with no dependencies, for the game
// (wagmi/story/index.js), its tools (tools/story/) and GameMog's gate (a byte copy, kept in step by its SHA-256).
//   SCHEMA                      the JSON Schema (draft 2020-12), the same object as tools/story/schema.json
//   CAST                        cast id -> the speaker id the game's lines use ('mrbig' -> 'Mr. Big'); NAMES the brand keys
//   render(text, pack)          a pack text with its tokens filled: {jane} the name, {jane:upper}, {jane:lower}
//   validatePack(pack, base, limits) -> { ok, errors }   the schema, then what a schema cannot say: the fixed key sets
//                               of names, lines and copy (the base pack's), each line's speaker, each entry's length
//                               limit (limits.json), the tokens, the Suits' bodies a permutation of the seven men
//   voiceKey(speaker, text)     a line's key in assets/voice/manifest.json (wagmi/radio/voices.js keys it the same)
export const SCHEMA = /*SCHEMA*/{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://mc.gamemog.com/tools/story/schema.json",
  "title": "Mog City story pack",
  "description": "Schema version 1 of a Mog City story pack (see tools/story/README.md). Structure only: the rules a JSON Schema cannot say (the fixed key sets of lines, copy and names against the base pack, each entry's length limit, the speakers, the tokens, the Suits' bodies as a permutation) are enforced by validatePack() in wagmi/story/schema.js, which embeds this same object.",
  "type": "object",
  "additionalProperties": false,
  "required": ["pack", "base", "title", "names", "cast", "car", "lines", "copy", "difficulty"],
  "properties": {
    "pack": { "const": 1 },
    "base": { "const": "mog-city@1" },
    "title": {
      "type": "object",
      "additionalProperties": false,
      "required": ["episode"],
      "properties": { "episode": { "$ref": "#/$defs/text", "maxLength": 40, "minLength": 1 } }
    },
    "names": {
      "type": "object",
      "additionalProperties": false,
      "required": ["bank", "blimp", "occupy", "college"],
      "properties": {
        "bank": { "$ref": "#/$defs/name" },
        "blimp": { "$ref": "#/$defs/name" },
        "occupy": { "$ref": "#/$defs/name" },
        "college": { "$ref": "#/$defs/name" }
      }
    },
    "cast": {
      "type": "object",
      "additionalProperties": false,
      "required": ["dan", "jane", "mrbig", "gears", "fiona", "bea", "camp", "moon", "knox", "hooks", "tank", "brick", "dash", "mack", "rook", "suits"],
      "properties": {
        "dan": { "$ref": "#/$defs/hero" },
        "jane": { "$ref": "#/$defs/person" },
        "mrbig": { "$ref": "#/$defs/person" },
        "gears": { "$ref": "#/$defs/person" },
        "fiona": { "$ref": "#/$defs/person" },
        "bea": { "$ref": "#/$defs/voiced" },
        "camp": { "$ref": "#/$defs/voiced" },
        "moon": { "$ref": "#/$defs/dog" },
        "knox": { "$ref": "#/$defs/suit" },
        "hooks": { "$ref": "#/$defs/suit" },
        "tank": { "$ref": "#/$defs/suit" },
        "brick": { "$ref": "#/$defs/suit" },
        "dash": { "$ref": "#/$defs/suit" },
        "mack": { "$ref": "#/$defs/suit" },
        "rook": { "$ref": "#/$defs/suit" },
        "suits": {
          "type": "object",
          "additionalProperties": false,
          "required": ["name"],
          "properties": { "name": { "$ref": "#/$defs/name" } }
        }
      }
    },
    "car": {
      "type": "object",
      "additionalProperties": false,
      "required": ["paint"],
      "properties": { "paint": { "$ref": "#/$defs/colour" } }
    },
    "lines": {
      "type": "object",
      "propertyNames": { "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$", "maxLength": 64 },
      "additionalProperties": {
        "type": "array",
        "prefixItems": [
          { "enum": ["dan", "jane", "mrbig", "gears", "fiona", "bea", "camp", "knox", "brick", "dash", "mack"] },
          { "$ref": "#/$defs/text", "minLength": 1, "maxLength": 220 }
        ],
        "items": false,
        "minItems": 2
      }
    },
    "copy": {
      "type": "object",
      "propertyNames": { "pattern": "^[a-z0-9]+(\\.[a-z0-9]+(-[a-z0-9]+)*)+$", "maxLength": 80 },
      "additionalProperties": { "$ref": "#/$defs/text", "minLength": 1, "maxLength": 220 }
    },
    "difficulty": {
      "type": "object",
      "additionalProperties": false,
      "required": ["enemyHp", "enemyDamage", "heroHp", "crewExtra", "chaseSpeed"],
      "properties": {
        "enemyHp": { "type": "number", "minimum": 0.6, "maximum": 1.6 },
        "enemyDamage": { "type": "number", "minimum": 0.6, "maximum": 1.6 },
        "heroHp": { "type": "integer", "minimum": 60, "maximum": 200 },
        "crewExtra": { "type": "integer", "minimum": -1, "maximum": 2 },
        "chaseSpeed": { "type": "number", "minimum": 0.8, "maximum": 1.25 }
      }
    },
    "consent": {
      "description": "Carried through untouched for GameMog (its consent step, Phase C). Mog City never reads or shows it.",
      "type": "object"
    }
  },
  "$defs": {
    "text": {
      "description": "Plain text: no < > ` and no control or invisible characters but a line break (in copy); braces only as tokens {key}, {key:upper}, {key:lower}, key a cast id or a names key",
      "type": "string",
      "pattern": "^(?:[^<>`{}\\u0000-\\u0009\\u000B-\\u001F\\u007F-\\u009F\\u00AD\\u0600-\\u0605\\u061C\\u06DD\\u070F\\u180E\\u200B-\\u200F\\u202A-\\u202E\\u2028-\\u2064\\u2066-\\u206F\\uFEFF\\uFFF9-\\uFFFB]|\\{[a-z]+(?::(?:upper|lower))?\\})*$"
    },
    "name": { "$ref": "#/$defs/text", "minLength": 1, "maxLength": 24, "pattern": "^[^{}\\n]*$" },
    "colour": { "type": "string", "pattern": "^#[0-9A-Fa-f]{6}$" },
    "colourOrNull": { "anyOf": [{ "$ref": "#/$defs/colour" }, { "type": "null" }] },
    "skin": {
      "type": "array",
      "items": { "type": "number", "minimum": 0.7, "maximum": 1.08 },
      "minItems": 3,
      "maxItems": 3
    },
    "voice": {
      "type": "object",
      "additionalProperties": false,
      "required": ["pitch", "rate", "prefer"],
      "properties": {
        "pitch": { "type": "number", "minimum": 0.5, "maximum": 1.6 },
        "rate": { "type": "number", "minimum": 0.7, "maximum": 1.4 },
        "prefer": { "enum": ["male", "female", "any"] }
      }
    },
    "hero": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "look", "voice"],
      "properties": {
        "name": { "$ref": "#/$defs/name" },
        "look": {
          "type": "object",
          "additionalProperties": false,
          "required": ["skin", "hair", "outfit"],
          "properties": {
            "skin": { "$ref": "#/$defs/skin" },
            "hair": { "$ref": "#/$defs/colourOrNull" },
            "outfit": { "$ref": "#/$defs/colourOrNull" }
          }
        },
        "voice": { "$ref": "#/$defs/voice" }
      }
    },
    "person": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "look", "voice"],
      "properties": {
        "name": { "$ref": "#/$defs/name" },
        "look": {
          "type": "object",
          "additionalProperties": false,
          "required": ["skin", "hair", "outfit", "build", "height"],
          "properties": {
            "skin": { "$ref": "#/$defs/skin" },
            "hair": { "$ref": "#/$defs/colourOrNull" },
            "outfit": { "$ref": "#/$defs/colourOrNull" },
            "build": { "type": "number", "minimum": 0.94, "maximum": 1.12 },
            "height": { "type": "number", "minimum": 0.97, "maximum": 1.04 }
          }
        },
        "voice": { "$ref": "#/$defs/voice" }
      }
    },
    "voiced": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "voice"],
      "properties": {
        "name": { "$ref": "#/$defs/name" },
        "voice": { "$ref": "#/$defs/voice" }
      }
    },
    "dog": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "look"],
      "properties": {
        "name": { "$ref": "#/$defs/name" },
        "look": {
          "type": "object",
          "additionalProperties": false,
          "required": ["fur"],
          "properties": { "fur": { "$ref": "#/$defs/colourOrNull" } }
        }
      }
    },
    "suit": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "body", "look", "voice"],
      "properties": {
        "name": { "$ref": "#/$defs/name" },
        "body": { "enum": ["knox", "hooks", "tank", "brick", "dash", "mack", "rook"] },
        "look": {
          "type": "object",
          "additionalProperties": false,
          "required": ["skin", "hair", "suit", "shirt", "build", "height"],
          "properties": {
            "skin": { "$ref": "#/$defs/skin" },
            "hair": { "$ref": "#/$defs/colourOrNull" },
            "suit": { "$ref": "#/$defs/colourOrNull" },
            "shirt": { "$ref": "#/$defs/colourOrNull" },
            "build": { "type": "number", "minimum": 0.94, "maximum": 1.12 },
            "height": { "type": "number", "minimum": 0.97, "maximum": 1.04 }
          }
        },
        "voice": { "$ref": "#/$defs/voice" }
      }
    }
  }
}/*/SCHEMA*/;

// the cast: id -> the speaker id the game's code says them by (internal: subtitles show the pack's name)
export const CAST = {
  dan: 'Dan', jane: 'Jane', mrbig: 'Mr. Big', gears: 'Gears', fiona: 'Fiona', bea: 'Bea', camp: 'Camp', moon: 'Moon',
  knox: 'Knox', hooks: 'Hooks', tank: 'Tank', brick: 'Brick', dash: 'Dash', mack: 'Mack', rook: 'Rook', suits: 'Suits',
};
export const SPEAKER = Object.fromEntries(Object.entries(CAST).map(([id, s]) => [s, id]));
export const NAMES = ['bank', 'blimp', 'occupy', 'college'];
export const MEN = ['knox', 'hooks', 'tank', 'brick', 'dash', 'mack', 'rook'];

export const voiceKey = (speaker, text) => `${String(speaker).toLowerCase()}|${String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;

// tokens: {key} the name as written, {key:upper} / {key:lower}; key a cast id or a names key
export const TOKEN = /\{([a-z]+)(?::(upper|lower))?\}/g;
// a text's length as it may be shown: each token counted as the longest name it could be (24); the limits are on this,
// so they hold whatever the names are, and a rename never breaks an entry the Mog left alone
export const NAME_MAX = 24;
export const measure = (text) => [...String(text).replace(TOKEN, 'x'.repeat(NAME_MAX))].length;

// (own keys only, and only strings: a key inherited from Object.prototype ('constructor', 'toString') is never a name)
const own = (o, k) => o != null && typeof o === 'object' && Object.hasOwn(o, k);
export function render(text, pack) {
  return String(text).replace(TOKEN, (m, k, c) => {
    const v = own(pack.cast, k) && own(pack.cast[k], 'name') ? pack.cast[k].name : own(pack.names, k) ? pack.names[k] : null;
    if (typeof v !== 'string') return m;
    return c === 'upper' ? v.toUpperCase() : c === 'lower' ? v.toLowerCase() : v;
  });
}

// a small JSON Schema (2020-12) reader for the keywords SCHEMA uses; errors as 'path: message'
export function checkSchema(v, s, root = SCHEMA, at = '', errs = []) {
  if (s === false) { errs.push(`${at || '/'}: not allowed`); return errs; }
  if (s === true || !s) return errs;
  if (s.$ref) checkSchema(v, s.$ref.split('/').slice(1).reduce((o, k) => o[k], root), root, at, errs);
  const type = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
  const bad = (m) => errs.push(`${at || '/'}: ${m}`);
  if (s.type) {
    const ok = s.type === 'integer' ? Number.isInteger(v) : s.type === 'number' ? typeof v === 'number' && Number.isFinite(v) : s.type === type;
    if (!ok) { bad(`must be ${s.type}`); return errs; }
  }
  if (Object.hasOwn(s, 'const') && v !== s.const) bad(`must be ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.includes(v)) bad(`must be one of ${s.enum.join(', ')}`);
  if (s.anyOf && !s.anyOf.some((x) => !checkSchema(v, x, root, at, []).length)) bad('matches none of its forms');
  if (type === 'string') {
    const n = [...v].length;
    if (s.minLength != null && n < s.minLength) bad(`shorter than ${s.minLength}`);
    if (s.maxLength != null && n > s.maxLength) bad(`longer than ${s.maxLength}`);
    if (s.pattern && !new RegExp(s.pattern, 'u').test(v)) bad('has characters or braces that are not allowed');
  }
  if (type === 'number') {
    if (s.minimum != null && v < s.minimum) bad(`below ${s.minimum}`);
    if (s.maximum != null && v > s.maximum) bad(`above ${s.maximum}`);
  }
  if (type === 'array') {
    if (s.minItems != null && v.length < s.minItems) bad(`fewer than ${s.minItems} items`);
    if (s.maxItems != null && v.length > s.maxItems) bad(`more than ${s.maxItems} items`);
    const pre = s.prefixItems || [];
    v.forEach((x, i) => checkSchema(x, i < pre.length ? pre[i] : s.items ?? true, root, `${at}/${i}`, errs));
  }
  if (type === 'object') {
    for (const k of s.required || []) if (!Object.hasOwn(v, k)) bad(`missing ${k}`);
    for (const [k, x] of Object.entries(v)) {
      if (s.propertyNames) checkSchema(k, s.propertyNames, root, `${at}/${k} (key)`, errs);
      if (s.properties && Object.hasOwn(s.properties, k)) checkSchema(x, s.properties[k], root, `${at}/${k}`, errs);
      else if (Object.hasOwn(s, 'additionalProperties')) checkSchema(x, s.additionalProperties, root, `${at}/${k}`, errs);
    }
  }
  return errs;
}

// a pack against the schema and its base (the default pack it was made from) and the base's limits
export function validatePack(pack, base, limits = {}) {
  const errs = [];
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) return { ok: false, errors: ['/: not an object'] };
  checkSchema(pack, SCHEMA, SCHEMA, '', errs);
  if (errs.length) return { ok: false, errors: errs.slice(0, 40) };
  // (no invisible or control characters, by Unicode class, beyond the schema's ranges; a line break only in copy)
  const INVIS = /[\p{Cc}\p{Cf}\u2028\u2029]/u;
  const text = (at, s, nl = false) => { if (INVIS.test(nl ? s.replace(/\n/g, '') : s)) errs.push(`${at}: has an invisible or control character`); };
  const tokens = (at, s) => { for (const m of s.matchAll(TOKEN)) if (!Object.hasOwn(CAST, m[1]) && !NAMES.includes(m[1])) errs.push(`${at}: unknown token {${m[1]}}`); };
  // (a limit is on the words as they may be shown: each token as a 24-letter name, measure())
  const long = (at, t, max) => { if (max && measure(t) > max) errs.push(`${at}: longer than ${max} (each token counted as ${NAME_MAX} letters)`); };
  const same = (at, a, b) => {
    const A = Object.keys(a), B = new Set(Object.keys(b));
    for (const k of A) if (!B.has(k)) errs.push(`${at}/${k}: not in the base pack`);
    for (const k of B) if (!Object.hasOwn(a, k)) errs.push(`${at}/${k}: missing (every base entry stays)`);
  };
  same('/lines', pack.lines, base.lines); same('/copy', pack.copy, base.copy);
  for (const [id, [who, t]] of Object.entries(pack.lines)) {
    if (Object.hasOwn(base.lines, id) && base.lines[id][0] !== who) errs.push(`/lines/${id}: speaker is ${base.lines[id][0]}, not ${who}`);
    long(`/lines/${id}`, t, own(limits.lines, id) ? limits.lines[id] : 0);
    text(`/lines/${id}`, t); tokens(`/lines/${id}`, t);
  }
  for (const [id, t] of Object.entries(pack.copy)) {
    long(`/copy/${id}`, t, own(limits.copy, id) ? limits.copy[id] : 0);
    text(`/copy/${id}`, t, true); tokens(`/copy/${id}`, t);
  }
  // (the episode is shown as written: no tokens in it)
  text('/title/episode', pack.title.episode); if (/[{}]/.test(pack.title.episode)) errs.push('/title/episode: no tokens or braces in the title');
  for (const [k, v] of Object.entries(pack.names)) text(`/names/${k}`, v);
  for (const [k, c] of Object.entries(pack.cast)) text(`/cast/${k}/name`, c.name);
  const bodies = MEN.map((m) => pack.cast[m].body);
  if (new Set(bodies).size !== MEN.length) errs.push('/cast: the Suits\' bodies must be the seven men, each once');
  if (pack.consent !== undefined && JSON.stringify(pack.consent).length > 4000) errs.push('/consent: larger than 4000 characters');
  return { ok: !errs.length, errors: errs.slice(0, 40) };
}
