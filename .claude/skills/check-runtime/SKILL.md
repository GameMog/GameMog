---
name: check-runtime
description: Run the GameMog Runtime contract in real Chrome, npm run check:runtime. The full run is about 27 min; ONLY=kart, kart-diag, kart-feel or kart-optin runs one section. Use it after any change to lib/runtime/, lib/custom-game.ts or the runtime's kits and fixtures.
---

# npm run check:runtime

**Needs:** the dev server on `BASE` (default http://localhost:3939; use the running one) and Chrome on this machine.

**Run:**
- Full: `caffeinate -i npm run check:runtime`, alone on a quiet machine. One measured full run (Oct 2026) took about 27 min.
- `ONLY=kart npm run check:runtime`: the kart opt-ins plus the kart section.
- `ONLY=kart-diag` or `ONLY=kart-feel`: "a few minutes" each, by the script's own comments.
- `ONLY=kart-optin`: node only, a few seconds.

**Passing:** `all runtime checks passed`, with exit code 0. Sections print `all kart checks passed` and the like. A failure prints `  FAIL` lines and `<n> FAILED`, exit code 1.

**Gotchas**
- **Keep the machine awake.** Sleep freezes Chrome and this process together (`lib/browser.ts` `HostSlept`): rerun rather than blame the code.
- **Run nothing else in Chrome.** Frame-rate and timing checks fail on a busy machine. If one fails, rerun its section on a quiet machine before calling it a regression, and report both runs.
- **Byte identity is not proven here today.** The "committed runtime (HEAD), byte for byte" check is skipped, because HEAD's `v1.js` already carries the `/*@kart*/` markers. What still runs is structural: the plain runtime equals `v1.js` with the kart and shootout parts cut out. To prove other kinds are unchanged, run `node --import ./scripts/ts-resolve.mjs scripts/world-hash.ts` before and after your edit and compare: it hashes every first-party world's whole served page (host, maps, endoskeleton, runtime, test drive).
- **Leftover drafts.** It inserts drafts with `prompt = 'runtime check'` into the local `data/gamemog.db` and deletes them in `finally` blocks. A killed run can leave some: `SELECT id FROM drafts WHERE prompt = 'runtime check'`.
