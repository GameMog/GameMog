# The cast registry: shipped people and pets

A Story Kit person is usually a Character Forge sheet the forge builds into a body. The **cast registry** is the other
kind: people (and a dog) who already shipped, hand-polished, in a GameMog world. A pack names one by key instead of
writing a sheet, and gets that person exactly as they shipped: their own GLB, their own clips, their face rig with
their own numbers, their props fitted in code, and their **recorded voice lines**. Mog City's cast is the first entry
set (`mogcity/...`): Mr. Big is the quality bar, and nothing in the registry is rebuilt or re-forged.

| file | what |
|---|---|
| `public/storykit/cast/registry.json` | the registry (the gate and the work page read it) |
| `public/storykit/cast/hand/` | the hand-built bodies (`hand/...`, below) and their `CREDITS.md` |
| `public/storykit/cast/mogcity/` | Mog City's bodies (the creator's browser makes their headshots from them), the Suits' clip pack, Fiona's and Gears' moves, the list of their 462 recorded lines (`voice/manifest.json`; the recordings themselves are Mog City's and play there), `CREDITS.md` |
| `storykit/cast/seeds.json` | each shipped person as a Character Forge sheet: where a Mog starts when it changes one |
| `storykit/pack/registry.ts` | the platform's side: `modelOf`, `nearVoice`, `seedSheet`, `recordedClip` |
| Mog City's runner (`wagmi/storyrun/cast/registry.js`, its own repo) | the playing side: every `mogcity/*` key is Mog City's own builder for that person (Dan, `jane.js`, `mrbig.js`, the Suits on `thug.glb`, `moon.js`), never a copy |

## In a pack

```jsonc
"cast": [
  { "id": "dan", "model": "mogcity/dan", "color": "#8FD3C8" },                  // Dan as he shipped
  { "id": "jane", "model": "mogcity/jane", "color": "#E8A0BF", "name": "Jo" },  // Jane's body, renamed
  { "id": "knox", "model": "mogcity/suit-knox", "color": "#9AA0A8" },
  { "id": "bea", "model": "mogcity/bea", "color": "#F2C14E" }                    // voice only (heard, never seen)
],
"pets": [ { "id": "moon", "name": "Moon", "species": "dog", "owner": "dan", "model": "mogcity/moon", "follows": true } ]
```

A model person has **no sheet**. `anchor`, `voice`, `name` and `role` may be left out: the gate fills them from the
registry (and writes them into the passed pack, so inheritance by hash works as for sheets). `name` renames them and
keeps the body. `storykit/packs/test-mogcity-cast.json` is the worked example.

## The registry's format

```jsonc
{ "v": 1,
  "voices": { "mogcity": "cast/mogcity/voice/manifest.json" },   // a world's recorded lines: { lines: [{ id, who, text, file, dur }] }
  "models": {
    "mogcity/mrbig": {
      "kind": "person",                       // person | voice (heard only) | pet
      "world": "Mog City", "name": "Mr. Big", "role": "the bank's CEO",
      "glb": "cast/mogcity/mrbig.glb", "bytes": 1950092,        // relative to the Story Kit page; the check holds the size
      "rig": "cast66",                        // cast66: the forge's 66-bone rig (Dan's) | suit: the Suits' own rig
      "clips": { "from": "own", "idle": "idle", "walk": "walk", "talk": "talk", "sit": "sit", "sitTalk": "sitTalk",
                 "fill": "cast/cast-clips.glb",                  // cast66: any clip they never had comes from the clip pack
                 "moves": "cast/mogcity/gears-moves.glb" },      // (some) their own moves over clips of the same name
      "lift": 0.02,                           // (some) the armature lifted, as their world lifts it (feet on the ground)
      "face": { "open": 0.45, "gaze": 0.18, "fix": { ... }, "hair": true },   // face.js numbers: jaw opening, hand-found landmarks
      "props": ["tortoise-glasses"],          // fitted in code at the eyes (props.js): tortoise-glasses, white-shades,
                                              // suit-shades, earpiece, heather-tee
      "height": 1.78,
      "can": ["stand", "walk", "talk", "sit", "hero"],           // what the gate lets a pack ask of them
      "anchor": "old-boss",                   // the forge's nearest archetype: a forged replacement starts here
      "voice": { "recorded": "mrbig", "lines": 4, "f0": 92,      // their recordings (speaker id in the voice manifest), median Hz
                 "near": { "id": "mogcity-mrbig", "kokoro": "bm_lewis", "speed": 1, "pitch": 0, "description": "..." } },
      "seed": "storykit/cast/seeds.json#mogcity/mrbig",
      "credit": "..." },
    "mogcity/suit-knox": { "kind": "person", "glb": "cast/mogcity/suits.glb", "rig": "suit", "man": "knox", "look": "c",
      "clips": { "from": "cast/mogcity/suits-clips.glb", "idle": "suitIdle", "walk": "suitWalk", "talk": "suitIdleGuide" },
      "props": ["suit-shades"], "can": ["stand", "walk", "talk"], ... },
    "mogcity/moon": { "kind": "pet", "species": "dog", "breed": "mixed", "build": "moon", "can": ["stand", "follow", "sit", "ride"] } } }
```

Mog City's set: `mogcity/dan`, `jane`, `mrbig`, `gears`, `fiona` (cast66: stand, walk, talk, sit, hero);
`mogcity/suit-knox`, `suit-hooks`, `suit-tank`, `suit-brick`, `suit-dash`, `suit-mack`, `suit-rook` (one file, seven
men; stand, walk, talk); `mogcity/bea`, `mogcity/camp` (voice only); `mogcity/moon` (the dog).

## Hand-built people (`hand/...`)

The registry's other set: Story Kit people polished by hand to the shipped cast's standard (Mr. Big is the bar), for
any story in any city. They carry `"built": "hand"` and belong to no world, so Mog City has no builder of its own for
them: the work page never forges one but **stores their GLB as the cast member's file** (as it is), the store counts it
as missing until it is there, and the runner's pack (`toRunnerPack`) draws them as a forged person: `{ glb, idle, walk }`
with no `model` key (the runner reads a model as one of Mog City's people, and a model hero as Dan). They move on the
clip pack (`cast/cast-clips.glb`, rig cast66), have no recorded lines (every line is voiced in their `near` block),
and can be any story's hero.

| key | who | anchor | voice | file |
|---|---|---|---|---|
| `hand/young-hero` | Mateo, a young man in his twenties who carries the story | `young-hero` | `hand-young-hero` (am_puck) | `cast/hand/young-hero.glb` |
| `hand/old-boss` | Augustin, a silver-bearded boss in his sixties who runs the block from a back office, soft-spoken and ruthless | `old-boss` | `hand-old-boss` (bm_george) | `cast/hand/old-boss.glb` |
| `hand/young-mother` | Marisol, a young woman in her twenties who carries the story | `young-mother` | `hand-young-mother` (af_heart) | `cast/hand/young-mother.glb` |
| `hand/pedro` | Pedro Delgado, an underboss in his fifties, black-bearded and silver-haired, controlled and menacing, who lost everything on a job gone wrong and wants it back | `old-boss` | `hand-pedro` (am_onyx) | `cast/hand/pedro.glb` |
| `hand/agnes` | Agnes, a white-haired retired nanny in her seventies, polite, professional and a little apologetic | `grandmother` | `hand-agnes` () | `cast/hand/agnes.glb` |
| `hand/milo` | Milo, a six-year-old boy, a first grader in a hoodie | `teen` | `hand-milo` (af_heart) | `cast/hand/milo.glb` |
| `hand/john` | John, a tired, decent man of thirty-eight in a dark jacket and open-collar shirt, a former getaway planner gone straight who runs a pizza business | `club-promoter` | `hand-john` (am_michael) | `cast/hand/john.glb` |
| `hand/carissa` | Carissa, a warm, quick-witted mother in her mid-thirties, once half of a crime duo | `office-worker` | `hand-carissa` (af_bella) | `cast/hand/carissa.glb` |

To ship a new build of one: copy its GLB to `public/storykit/cast/hand/` and set the registry's `bytes`.

## Voices: recordings for unchanged lines, near voices for the rest

Each registry voice has a `near` block: a Kokoro voice designed to sit near the original, by sex, accent and the
recordings' measured median pitch (Dan 110 Hz on `am_michael`, Jane 180 Hz on `af_bella` pitched down, Mr. Big's own
`bm_lewis`, Gears 82 Hz on an `am_onyx`/`am_michael` blend ...). Recordings follow the **voice**, not the body:

- A spoken line whose speaker's voice block is a registry block, unchanged, and whose words match one of that voice's
  recorded lines (case and punctuation aside, as Mog City matches them) plays the **recording**. The voice plan marks
  it (`rec`: its URL, `recId`, `secs`); the voice pass never renders it, the store never asks for it, and Mog City
  plays its own recording (`W.voice`, by speaker and words) with the jaw on its loudness.
- Any other line in that voice (a changed line, a new one, a renamed person's name in it) is rendered in the `near`
  voice, so a Mog's new lines sit beside the old ones.
- A pack that gives the person another voice block keeps the body and drops the recordings: every line is rendered.

## Changing a shipped person (a Mog)

The body is never edited. A rename (`name`) keeps it. **Any change to how they look** (a new face, clothes, age, build,
a Christmas jumper) replaces the model with a **forged sheet**: start from their seed (`storykit/cast/seeds.json`, a
valid Character Forge sheet describing them; the builder is given the seeds of the shipped people a parent uses), set
the sheet's `id` to the cast id, keep `anchor` the registry's (`old-boss` for Mr. Big, `mechanic` for Gears ...), change
only what the idea asks for, and keep the `voice` block if the voice is not part of the change (then their unchanged
lines keep their recordings). The gate warns when a replacement of a parent's model starts from another anchor.

## What the gate holds (`storykit/pack/gate.ts` rule 9)

- `model` must be a registry key; a model person has no sheet, and a sheet person has no `name`/`role` of its own.
- A model does only what it `can`: a Suit has no seated clips, so it is never a `passenger`, nor the hero.
- A `voice` registry entry is voice only (`voiceOnly` is set).
- A pet's `model` is of its species; a pet that `follows` belongs to the hero (it stays with the player).

## Pets

Every pack dog has a body: `mogcity/moon` is Moon as she shipped in Mog City; any other dog is the same dog in its
`coat` colour and `size` (small 1x, medium 1.45x, large 1.8x), as far as Mog City's runner draws it (its DESIGN). A pet is a body like a person's, so an
`npc` step stands it at the kerb and a `passenger` step seats it. A pet with `follows: true` is the player's companion
from the start: it trots after the hero on foot (a pace that quickens with the gap), jumps into the front seat when
they drive (sitting), jumps out with them, and sits when they stand still; while a step has the same pet out, the
companion stands aside. Moon's copy adds one pose to Mog City's (sit).

## Not done

- Mr. Big's cigar is not on the street (in Mog City it is posed in his hand in his study); his glasses are.
- Jane's fitted teeth and her call portrait, and the Suits' looks for fights (brutes, variants) are not ported.
- The Suits stand on their retargeted idle; they are not checked for every clip.
- Breeds other than Moon's look like Moon in another coat and size.
