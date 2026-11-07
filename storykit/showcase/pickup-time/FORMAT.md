# Pickup Time pack fragments: the shape

(Written while the story was built in three parallel act passes, one writer per act; kept as the fragments' format.
The paths are the repo's: see `README.md` beside it for how to regenerate the pack.)

Each act is ONE fragment file, written by its generator into the repo's `.scratch/showcase/pickup-time/` (git-ignored;
`PT_OUT` names another folder). `merge.mjs` (this folder) joins them with `top.json` into `storykit/packs/pickup-time.json`
and runs `gatePack(pack, { showcase: true })`, printing every problem. From the GameMog checkout:
`node --import ./scripts/ts-resolve.mjs storykit/showcase/pickup-time/merge.mjs` (`--act act2` gates only top + that
act, as a one-act pack, and never writes the pack).

## The files

| file | generator | holds |
|---|---|---|
| `top.json` | `gen_top.py` | every top-level key of the pack EXCEPT `acts`: storykit, id, title, kicker, tagline, base, dressing, hero, ride, opening, hud, places, cast, vehicles, voices |
| `act1.json` | `gen_act1.py` | PT-1..PT-5 |
| `act2.json` | `gen_act2.mjs` | PT-6..PT-10 |
| `act3.json` | `gen_act3.mjs` | PT-11..PT-15 (incl. the night finale) |

## An act file

```jsonc
{
  "act": {                       // exactly one schema act (storykit/pack/schema.mjs acts[]): id, name, timeline?, end?, missions[]
    "id": "act2",                // act1 | act2 | act3
    "name": "ACT II · CARRYOUT", // <= 24 chars
    "timeline": { "PT-6": { "clock": "4:45 PM", "time": "midday" } },   // optional; BIBLE 3.0 clock/time table
    "end": { ... actEndCard ... },// optional act end card
    "missions": [ { "id": "PT-6", "title": "...", "vehicle": "rides.gt", "verbs": [...], "start": "@teddy-garage",
                    "time": "midday", "traffic": 0.5, "stakes": "...", "passLine": "...",
                    "reward": { "meters": { "ransom": 64000, "clues": 1 } }, "steps": [ ... ] } ]
  },
  "places":   { },               // optional: EXTRA aliases only (key must start with your act: "a2-", "a3-"); max 8 per act
  "cast":     [ ],               // optional: EXTRA people only (new ids; top.json already has the BIBLE §5 cast, below)
  "vehicles": [ ]                // optional: avoid (the vehicle limit is 6 and top uses 4)
}
```

Merge rules: missions are concatenated in act order; `places`/`cast`/`vehicles` are unioned by key/id; the same
key/id with a different value is an ERROR (never redefine a top entry: change top.json through gen_top.py).
Pure JSON (no comments) in the real files.

## What top.json gives you (use these ids; do not redefine)

- **hero** `john` (hand/john). **ride** `rides.gt` = the Vantor GT (stock `gt`, label "Vantor GT", plate "JM 0838"):
  the mission `vehicle` for every car mission unless the BIBLE says the van (`rides.slice-van`) or `on-foot`.
- **vehicles**: `rides.gt`, `rides.slice-van` (Slice Marin delivery van, PT-3/10/11), `rides.carissa-suv` (her cream
  SUV: use as an `ally`/`convoy` `car`), `rides.crew-suv` (black SUV, parked dressing via a `car` step).
- **cast ids** (colours as BIBLE §5): seen: `john`, `carissa` (hand/carissa), `delgado` (hand/pedro), `agnes`
  (hand/agnes), `milo` (hand/milo), `teddy` (mogcity/suit-rook renamed), `rollo` (mogcity/suit-knox renamed), `hooks`,
  `tank`, `mack` (Suits as they are), `lou`, `bunny`, `pell` (forged sheets). Voice only: `okafor`, `headmaster`, `ma`,
  `benny`, `calloway`, `odette`, `marjorie`, `coach`. Voice-only people may only call / say / voicemail / dm, never be
  an npc, enemy, stage or camera `rel`.
- **Lou** is `hand/old-boss` renamed Lou Varga. (When this was written Pell was `mogcity/suit-brick`, Teddy
  `mogcity/suit-rook` and Bunny a forged sheet; all three now wear hand-built bodies: `hand/pell`, `hand/young-hero`,
  `hand/bunny`, as `gen_top.py` writes them.)
- Voice-only people show on the caller card as: Ms. Okafor, Mr. Ashby, Ma, Benny, Det. Calloway, Odette, Marjorie Klee, Coach.
- **meters** (`hud.meters`): `ransom` (money, start 0, goal 1,000,000) and `clues` (count, goal 10). Use them in
  `reward` / `set` only. Keep your act's ransom totals on the BIBLE 3.0 curve: end of PT-5 = 373,000; end of PT-10 =
  775,200; PT-15 ends with `{ "ransom": { "to": 1000000 } }`. A mission's `reward` is added at MISSION PASSED; mid-mission
  `set`s also count toward the pass card's "+$X".
- **places**: the 20 BIBLE 3.0 aliases, exactly: `bank, atm-franklin, store-one, courthouse, store-tribeca, minivan,
  store-soho, agnes-home, teddy-garage, chess-tables, drop-park, pell-condo, lockers, school, lease-office, race-yard,
  toll, plaza, hideout, side-door, odette-door` (`side-door` = @harlem with `offset`; `odette-door` = @bowery), each `"@<alias>"`. A showcase may name up to 48 places in all. Plus any `PLACES.ny` key
  (storykit/pack/cities.ts). No foot places (owtc) or start-only places (fdr, fdr-un) as drive targets.

## Conventions (so the three acts play alike)

- Every mission: `time` pinned (`midday` / `golden`; PT-15 moves to `midnight` with a `transition` step), `stakes`
  (a text from the giver), `passLine`, `reward`, and exactly one main named timer per BIBLE 3.0 (`fail: "hard"` from
  PT-3 on, with `why` and a `checkpoint: true` step before it). Timer names: lowercase slugs, e.g. `"sweep"`, `"deadline"`.
- Carissa's car phone on drives: `during: [{ "at": 1, "type": "call", "who": "carissa", "auto": true, "inCar": true,
  "lines": [...], "extra": [[...]], "wrap": [...], "hold": { "pause": [...], "resume": [...] } }]`. Other callers per
  §3A as `call` with `"interrupts": true` (call waiting) in the same `during`, `at` later than Carissa's.
- Lines <= 200 chars, no em dashes, no real brands/people, "Miami" only in spoken lines. Objectives use `**bold**`.
- The runner lights, places and meters are proven by a headless play of act1; copy act1.json's step
  patterns when unsure.

## Proven patterns (act1.json, gen_act1.py: the generator is the readable source)

- Call waiting: in a drive/stops/tail/pursuit `during`, Carissa's car phone at `at: 1-4`, then
  `{ "at": 40, "type": "call", "who": "ma", "interrupts": true, "ring": 6, "lines": [...], "voicemail": { "text": "..." } }`.
  Carissa's `hold.pause` is the line she says as it beeps ("It's beeping. Who is it?"), `hold.resume` up to 2 lines on return.
- A voice note mid-drive: `{ "at": 100, "type": "call", "who": "benny", "interrupts": true, "auto": true, "role": "Voice note", "lines": [...] }`.
- Walkie beeps: a step `{ "type": "trigger", "cue": "walkie2", "say": { "who": "delgado", "text": "(two soft beeps)" } }` (no area: fires at once).
- A side step cannot carry `do` (no trigger-with-do inside `during`); to stop a timer mid-leg use a side step `{ "at": 150, "type": "timer", "name": "x", "stop": true }`.
- Mid-mission `set`s (stops' `set`, a `set` step after a search) show on MISSION PASSED as the mission's gains; act1 uses no `reward`.
- Cutscene close-ups: cameras `{ "rel": "<cast id>", "right": 0.3, "up": 0.02, "fwd": 1.25 }` looking at `{ "rel": "<cast id>", "up": -0.04 }`, fov 32 (the runner follows the head).
- Runner world for a headless play: `merge.mjs --act actN --runner <a Mog City checkout>/tools/storyrun/test-packs/pickup-time/<file>.json`
  (copy the hand-built GLBs from `public/storykit/cast/hand/` into that folder's `cast/`).
