---
name: check-platform
description: Run GameMog's end-to-end platform check, npm run check:platform, against the local dev server in real Chrome. It covers Mog lineage and families, Mog-offs, dares, scores, the owner's controls, the test drive, build limits and soundtracks. Use it after changes to publishing, Mogs, dares, scoring, admin, lib/test-drive.ts, lib/build-limits.ts or lib/world-options.ts.
---

# npm run check:platform

**Needs:**
- The dev server on `BASE` (default http://localhost:3939). Use the one already running; start one with `npm run dev` only if nothing answers there.
- Chrome on this machine (`CHROME_PATH` if it lives somewhere unusual).

**Run:** `npm run check:platform`, with no other Chrome suite running.

**Passing:** the last line is `all platform checks passed`, with exit code 0. A failure prints `  FAIL` lines and `<n> FAILED`, exit code 1.

**Parts you can run alone:**
- `node --import ./scripts/ts-resolve.mjs scripts/test-drive-check.ts`
- `node --import ./scripts/ts-resolve.mjs scripts/build-limits-check.ts`. It makes no paid call: builds go to a stand-in Messages API on 127.0.0.1.
- `NOBROWSER=1 node --import ./scripts/ts-resolve.mjs scripts/soundtrack-check.ts` skips Chrome.

**Gotchas**
- **Throwaway games.** It writes games titled `Mogcheck <id> ...` to the local `data/gamemog.db` and removes them in a `finally`. A killed run can leave some; delete them by that title prefix.
- **The owner's password.** The owner-session check runs only when `ADMIN_PASSWORD` (12+ characters) is in the environment or `.env.local`, and the script reads it itself. Without it, that check is skipped silently. Never print, echo or copy the password.
- **Timing.** A busy or sleeping machine fails timing checks. Rerun on a quiet machine before calling a failure a regression, and report both runs.
