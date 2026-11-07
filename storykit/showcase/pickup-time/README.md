# Pickup Time: the pack's sources

`storykit/packs/pickup-time.json` is the committed pack, and the migration ships what is built from it
(`docs/STORYKIT-ARCHITECTURE.md` §3). This folder holds the scripts that generate it. Running them reproduces the
committed pack byte for byte (checked on 7 Nov 2026). Edit the pack through these scripts, so the two never drift apart.

| file | what it writes or holds |
|---|---|
| `gen_top.py` | `top.json`: every top-level key except `acts`. That is the title, base, dressing, hero and ride, the opening, the HUD meters (RANSOM: money with a goal of 1,000,000; CLUES: a count with a goal of 10), the places, the cast, the vehicles. |
| `gen_act1.py` | `act1.json`: ACT I, PT-1 to PT-5 |
| `gen_act2.mjs` | `act2.json`: ACT II, PT-6 to PT-10 |
| `gen_act3.mjs` | `act3.json`: ACT III, PT-11 to PT-15, including the night finale |
| `merge.mjs` | joins `top.json` and the acts, attaches the voices, gates the result as a showcase, and writes `storykit/packs/pickup-time.json` |
| `voice-attach.mjs` | `castVoices`: puts each person's voice block from `casting.json` on the cast. `attachVoice`: the runner world's voice plan, with phone lines marked `fx: 'phone'` (for `--runner`). |
| `casting.json` | the Kokoro voice block for each cast id |
| `FORMAT.md` | the fragment format and the conventions the three acts share (call waiting, timers, the ransom curve, the place aliases) |

The generators keep the dialogue as call sheets (`'CA: text'` or `"CA (4): text"`, one line each), so the scripts
read close to a script. Their comments refer to sections of the story bible ("BIBLE 3.0", "§3A"). The bible is the
owner's working document and is not in the repo. The generated pack is the record of what it says.

## Regenerate the pack

From the GameMog checkout:

```
python3 storykit/showcase/pickup-time/gen_top.py
python3 storykit/showcase/pickup-time/gen_act1.py
node storykit/showcase/pickup-time/gen_act2.mjs
node storykit/showcase/pickup-time/gen_act3.mjs
node --import ./scripts/ts-resolve.mjs storykit/showcase/pickup-time/merge.mjs
git diff --stat storykit/packs/pickup-time.json      # empty when nothing changed
```

The generators write their fragments to `.scratch/showcase/pickup-time/`, which git ignores. Set `PT_OUT` to use
another folder; `merge.mjs` reads from the same place. `merge.mjs` prints the gate's problems, warnings and clamps,
then `GATE OK` and the path it wrote. It never writes a refused pack.

Options:

- `--act act2` gates only the top and that act, as a one-act pack, for fast iteration. This never writes the pack.
- `--no-write` gates without writing.
- `--runner <out.json>` also writes a runner world for a local Mog City. It holds the hand-built GLBs as
  `cast/<file>.glb`, and the clips found in `voice/` beside it. Copy the GLBs from `public/storykit/cast/hand/` into that
  folder's `cast/`, then open `<mog city>/?pack=/tools/storyrun/test-packs/pickup-time/<out>.json`.

## Then ship it

1. Run `npm run storykit:pack -- pickup-time --no-forge`. This rebuilds `public/storykit/packs/pickup-time.json`.
2. Voice the new lines and run `scripts/storykit-showcase.ts --export --voice <folder>`.
3. Write a new migration id.

`docs/STORYKIT-ARCHITECTURE.md` §3 has each step in full.

**Voices.** Every line but John's is Kokoro-82M (a stock voice, or a blend of up to 3), shaped by the Story Kit's own
post-processing (`storykit/voices/voice-design.js`: pitch, trim, level). John's lines use Mog City's own Dan voice,
cloned with Qwen3-TTS. The clips were rendered offline in Node and encoded as Ogg Opus. That renderer is
machine-specific and is not in the repo. The browser voice studio (`storykit/voices/README.md`) is the portable way to
render the Kokoro lines. Clips are named `<line hash>-<voice key>`, so only changed lines need new clips.

## The story in one table

John Marin, once a getaway planner and now the owner of the Slice Marin pizza chain, has one June afternoon to cross
Manhattan from Wall St to W 125th St. He must raise $1,000,000 for Pedro Delgado and find where Delgado is keeping his
six-year-old son, Milo. His wife Carissa is on the phone for nearly every drive. All of it is in daylight except the
last mission.

| # | title | where | ransom after (the planned curve; a choice in 13 changes the path) |
|---|---|---|---|
| 1 | Pickup Time | Wall St to Foley Square | $38,000 |
| 2 | Courthouse Money | Foley Square | $188,000 |
| 3 | Dough Run | Tribeca to Canal St | $240,000 |
| 4 | The Painting | SoHo to the Bowery | $365,000 |
| 5 | The Nanny | Lower East Side | $373,000 |
| 6 | Teddy's Garage | East Village | $437,000 |
| 7 | The Vig | Washington Square | $617,000 |
| 8 | Good Faith | Flatiron to Chelsea | $632,000 |
| 9 | The Banker | Hudson Yards | $772,000 |
| 10 | Show and Tell | Murray Hill | $775,200 |
| 11 | Cielo Azul | Grand Central to the UN | $925,200 |
| 12 | Yard Race | Times Square to Hell's Kitchen | $985,200 |
| 13 | The Toll | Central Park South | $935,200 |
| 14 | The Whale | Lincoln Center | $975,200 |
| 15 | Pickup | Upper East Side to Harlem, at night | $1,000,000 |

Every name, company and event in it is fictional. The streets are Manhattan's own.
