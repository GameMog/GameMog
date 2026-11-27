# Mog City: checkpoints in a story world

A story world's mission can mark the steps a failed attempt goes back to (a runner pack's `checkpoint`, 20 Nov 2026).
Without one, MISSION FAILED offers **Retry: from the start**, and the player plays the whole mission again. Jensen
Heist's SS-5 replayed about five minutes (a call, a drive, a roadblock, a search and another call) to get back to its
chase (the RC playtest, P3).

## The field (runner pack)

```json
{ "type": "pursuit", "kind": "crew", "name": "the Board's Directors", "level": 3, "goal": "lose", "checkpoint": true }
```

- `checkpoint`: `true` on a **top-level** step of a mission (not inside `during` or `do`). Any other value is refused
  by the runner's check (`wagmi/storyrun/pack.js`: `<mission> steps[i]: checkpoint (true or false)`).
- When the step starts, the runner takes a snapshot (`runner.js` `snapshot(i)`): where the hero stands and in what
  (car, horse, on foot), the story's meters, flags and forks, the mission's timers and stats. A later checkpoint
  replaces it. Continue (the saved game) resumes from the last one too.
- A fail after a checkpoint offers **Retry: from the checkpoint** (that step again, from the snapshot) and **Restart:
  from the start** (the mission from step 0, its title card and its start place). Before any checkpoint, only **Retry:
  from the start**. Quit, and Skip after three fails, are as before. A test drive (`?autopilot`) still retries on its own.
- A direct start (`?step=<id>`, Mission select) counts as a checkpoint at that step.

## Where to put one

- Just before a step that is hard to win and slow to reach: a pursuit, a chase, a timed drive, a fight, a convoy.
- After the talk and the travel that set it up, never in the middle of a scene: a cutscene, a call or a video call
  step replays whole from its start.
- Not on a step whose setup comes from an earlier step that a retry would skip: a `car` or `npc` step that puts
  someone in the world is replayed only from the start. Put the checkpoint on (or before) those steps, or have the
  checkpoint's step put what it needs there itself.

## The GameMog pack side

GameMog's pack v2 already has the field: `checkpoint` is a boolean on every step in `storykit/pack/schema.mjs`
(`checkpoint: B`), and `toRunnerPack` (`storykit/pack/gate.ts`) copies a step's fields through (`{ ...s }`), so a
writer's `"checkpoint": true` reaches the runner unchanged. Two things for the pack side to add: the gate should warn
on `checkpoint` inside a `during` or `do` list (the runner reads it on top-level steps only), and the builder manual
(`storykit/BUILDER.md`) should say where to put one (above).
