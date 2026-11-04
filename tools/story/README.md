# Mog City story packs (schema version 1)

A **story pack** is everything a Mog of Mog City may change, as one JSON object: the episode's title, the cast's names,
looks and voices, the brands, the car's paint, every spoken line, the on-screen copy and a few difficulty knobs. The
engine (missions, timing, places, triggers) stays Mog City's; a Mog rewrites words and looks, never structure.

| File | What |
|---|---|
| `tools/story/schema.json` | the JSON Schema (draft 2020-12): structure, types, ranges, allowed characters |
| `wagmi/story/schema.js` | the same schema embedded (`SCHEMA`), plus `validatePack()` (the rules a schema cannot say), `render()` (tokens), `CAST`, `voiceKey()`. No dependencies: GameMog keeps a byte copy |
| `assets/story/default.json` | the **default pack** (base `mog-city@1`): Mog City as it is, generated from the source |
| `assets/story/limits.json` | each line's and copy entry's longest allowed text (`{ lines: {id: n}, copy: {id: n} }`) |
| `assets/story/ids.json` | each id's place in the source (`at`), its source literal (`text`), scene, speaker, an opening line's window |
| `tools/story/extract.mjs` | makes the three files above from the source (`--check`: fails if they are stale) |
| `tools/story/scan.mjs` | the source scanner (TypeScript's parser, found in the GameMog checkout's `node_modules`) |
| `wagmi/story/index.js` | the runtime: loads the pack before the game, exposes `S` (made by `make.js`; addresses checked by `allow.js`; looks put on models by `dress.js`) |
| `tools/story/make-sample.mjs` | writes `test-packs/sample.json`, the test pack (everyone renamed, 22 lines rewritten, looks, car, difficulty) |

## Fields

All fields are required unless marked optional. "Text" means plain text: no `<`, `>`, `` ` ``, no control or invisible
characters (a line break is allowed in copy only), and braces only as **tokens**.

| Field | Type | Meaning |
|---|---|---|
| `pack` | `1` | schema version |
| `base` | `"mog-city@1"` | the default pack whose ids this pack uses |
| `title.episode` | text, 1-40 | the episode title. The game always shows it as **MOG CITY: &lt;episode&gt;** (the lockup, the tab title, the share text, the trailer's slam); MOG CITY itself is not in the pack |
| `names.bank` | name | the bank (`JPBank`): tokens `{bank}`, `{bank:upper}` (JPBANK on the signs), `{bank:lower}` |
| `names.blimp` | name | the airship company (`Blimpco`) |
| `names.occupy` | name | the protest's word (`Occupy`, as in OCCUPY JPBANK) |
| `names.college` | name | Dan's and Jane's college (`SUNY`) |
| `cast.<id>` | object | one per cast member; the ids are fixed (they bind models, voices, faces): `dan` (the hero), `jane`, `mrbig`, `gears`, `fiona` (people with a model), `bea`, `camp` (voices: Ms. Bea and the camp's crowd), `moon` (the dog), the seven Suits `knox`, `hooks`, `tank`, `brick`, `dash`, `mack`, `rook`, and `suits` (the crew's name) |
| `cast.<id>.name` | name, 1-24, one line | the display name: subtitles' speaker label, captions, the call card, DMs, tokens `{jane}`... |
| `cast.<id>.look` | object | people (`jane`, `mrbig`, `gears`, `fiona`): `skin` [r,g,b] multipliers 0.7-1.08 on the skin texture, `hair` `#RRGGBB` or null (as modelled), `outfit` `#RRGGBB` or null (a tint over the clothes), `build` 0.94-1.12 (width), `height` 0.97-1.04. `dan`: `skin`, `hair`, `outfit` only (his height is locked: the car seat, the vault and his hands are tuned to it). Suits: `skin`, `hair`, `suit` (jacket and trousers), `shirt`, `build`, `height`. `moon`: `fur`. The defaults (`[1,1,1]`, null, 1) change nothing |
| `cast.<suit>.body` | one of the seven men | which man's body and face plays this Suit: the seven must be a permutation (each body once). A new face is not possible (faces are baked in the models) |
| `cast.<id>.voice` | object | the browser voice for this character's **changed** lines: `pitch` 0.5-1.6, `rate` 0.7-1.4, `prefer` `male`/`female`/`any` (which of the browser's English voices to pick). Unchanged lines keep their recording |
| `car.paint` | `#RRGGBB` | Dan's car's paint (`#E7E7E3`) |
| `lines.<id>` | `[speaker, text]` | every spoken line (462), by frozen id. The speaker is fixed (a cast id); the text is the pack's. An opening line must fit its window (limits.json); others at most twice the default length (24 at least, 220 at most) |
| `copy.<id>` | text | every other moggable string: objectives (each string part on its own: `"Follow the "`, the coloured noun `"van"`, `". Don't get too close."`), help, fail reasons, tips and choices, place cards, act and mission titles, captions, DMs, the phone's screens, counters, map labels, canvas signs. Ids read `<scene>.<kind>.<first-words>` |
| `difficulty` | object | `enemyHp` 0.6-1.6 and `enemyDamage` 0.6-1.6 (multipliers on every Suit), `heroHp` 60-200 (Dan's health, 100), `crewExtra` -1..2 (men added to each fight's crew, at least one stays), `chaseSpeed` 0.8-1.25 (the getaway's pursuers) |
| `consent` | object, optional | GameMog's consent record (real people, Phase C). Mog City carries it through untouched and never shows it; at most 4000 characters as JSON |

### Tokens

`{key}` is the name as written, `{key:upper}` upper-cased, `{key:lower}` lower-cased; `key` is a cast id or a `names`
key. The default pack uses tokens wherever a cast name or brand is a whole word (`"{dan}. Why is your laptop..."`,
`"OCCUPY {bank:upper} · DAY 41"`, Jane's lower-case DMs `"{gears:lower}' garage"`), so renaming a character renames
them everywhere at once. Ordinary words stay words (`camp` and `tank` lower-case are not tokens; `moon` lower-case is, it is always the dog).

### Rules beyond the schema (`validatePack(pack, base, limits)`)

- `lines`, `copy` and `names` have exactly the base pack's keys: nothing added, nothing removed.
- `lines[id][0]` (the speaker) equals the base's.
- Each text the Mog changed is at most its `limits.json` length, measured in code points as shown: rendered with the pack's own names. An entry left as the base's words is not measured: a rename alone never breaks it.
- Every token names a cast id or a `names` key.
- The seven Suits' `body` values are the seven men, each once.

## How the game uses a pack

`wagmi/story/index.js` loads before the game's modules (top-level await) and exports `S`:

- `S.line(speaker, text)`: a spoken line by its **default** text -> the pack's (tokens filled). `S.t(text)`: the same for
  copy. Both are keyed by the source literal, so the code keeps its literals and only the chokepoints call them; an
  unchanged entry returns the literal itself (the default pack is byte-identical by construction).
- `S.name(id)` (a cast id or a speaker id, `'Mr. Big'`), `S.title()` (`MOG CITY: <episode>`), `S.episode`, `S.look(id)`,
  `S.dress(id, root)`, `S.body(man)`, `S.knob(name)`, `S.changed(speaker, text)`, `S.voiceOf(speaker)`, `S.id`,
  `S.hash`, `S.isDefault`, `S.ok`.
- Voices: a line whose speaker and words are the default's plays its recording (`assets/voice`); any other line is shown
  and spoken by the browser (`speechSynthesis`, the character's `voice`), the mumble standing aside while it speaks.

Loading: `?story=<url>` is accepted only from `https://gamemog.com/g/<slug>/story.json` or
`https://gamemog.com/d/<id>/story.json` (an optional `?v=`); on a local server (localhost) also the test packs under
`/tools/story/test-packs/` and `http://localhost:3939` (GameMog's dev server). Anything else, a failed fetch, or a pack
that fails `validatePack`: the default pack. `?story=off` (local testing only) turns the pack off: every `S` call returns
its input. In a frame, the game posts `{ source: 'gamemog', type: 'ready', gameId, hash, story: { ok, id, hash } }` to its parent
once the pack is loaded, at the origin `?host=` names when it is one of `https://gamemog.com`, `https://www.gamemog.com`,
`http://localhost:<port>`, `http://127.0.0.1:<port>` (else `https://gamemog.com`; nothing when not framed). On a local mc
with a dev `?host=`, the story routes on that host are accepted too (Phase C's dev servers on any port).

## Versioning

- `pack` is the schema version. A change to the schema is `pack: 2`, with a note in
  `MogCity/.scratch/moggable/SCHEMA-FROZEN.md`.
- `base` names the default pack whose ids a pack uses. Ids are frozen in `assets/story/ids.json`: re-running the
  extractor keeps an id for the same speaker and words (a line) or the same literal (copy). When a release adds or
  removes lines or copy, `base` becomes `mog-city@2`, and the game fills a `@1` pack's missing ids from the default.

## Tests

- `node --test tests/story-default.test.mjs`: the default pack renders every source literal exactly; its lines are the
  voice build's (`readLines`), every recording's key is reachable; `extract.mjs --check` is clean; the schema copies match.
- `node --test tests/story-scrub.test.mjs`: no cast name, brand or title literal left in `wagmi/` outside the pack.
- `tools/story/parity.mts` (Chrome): the subtitle and voice logs of the opening and the mission entry points, with and
  without the default pack, are identical.
- `tools/story/sheets.mts` (Chrome): `test-packs/sample.json` (everyone renamed, ~20 lines rewritten, looks and the
  car changed): render sheets, and the changed lines spoken by `speechSynthesis`.
