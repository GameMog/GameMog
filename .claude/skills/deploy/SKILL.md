---
name: deploy
description: The pre-push checklist for GameMog. A push to main of the public GameMog/GameMog repo deploys gamemog.com on Render and stops builds in flight. Use it before any commit meant for main and before every git push. Push only when the owner asks.
---

# Before a push to main

**1. Know every change.**
- Run `git status --short`, then stage files by name. Never `git add -A`, `git add .` or `git commit -a`.
- Never stage what `CLAUDE.md` lists as git-ignored (`.env.local`, the database, `CLAUDE.local.md`, scratch, ...), even forced.

**2. Scan what is staged (the repo is public).**
- Emails: `git diff --cached | grep -nEio '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' | sort -u`. Only noreply addresses and published third-party credits may appear.
- Secrets: `git diff --cached | grep -nE '^\+.*(sk-ant-[A-Za-z0-9_-]{20,}|(ADMIN_PASSWORD|ANTHROPIC_API_KEY)=[A-Za-z0-9_+/-]{8,})'` must print nothing. It matches a key's or password's value, so the names alone (`.env.example`, this file) pass.
- Also check by eye that no personal name and no private address appears, the owner's admin address included.

**3. Types:** `npx tsc --noEmit -p .` must exit 0 with no output.
- Render's `next build` type-checks every `.ts` file, `scripts/` included, and a type error fails the deploy while the old version stays live.
- Locally the check also covers the git-ignored `scripts/.scratch/*.ts`. An error only there does not reach Render, but fix it or say so.

**4. Checks.**
- `npm run check` must end `all checks passed`.
- If you touched the runtime, also `/check-runtime`. If you touched publishing, Mogs, dares, scores or builds, also `/check-platform`.
- Report any check you did not run as NOT RUN.

**5. Commit**, only when the owner asks:
- With the git identity the owner gives you for this repo; never a personal email.
- End the message with a `Co-Authored-By:` trailer.

**6. Nobody building.** A deploy stops builds in flight (`deploy/boot.mjs` marks them interrupted).
- Confirm on the owner's admin screen that nothing is building or queued.
- Its address is private: ask the owner, and never write it down.

**7. Push.** Only on the owner's word: `git push origin main`.
- Render deploys on the commit (`render.yaml`, `autoDeployTrigger: commit`).
- The service has a disk, so it stops the old instance first. Expect a brief outage.

**8. After.**
- Deploy state without the dashboard:
  - `gh api 'repos/GameMog/GameMog/deployments?per_page=1'`
  - then `gh api repos/GameMog/GameMog/deployments/<id>/statuses`. The first (newest) status is the state now: `in_progress` while it deploys, then `success` or `failure`.
- Then load the changed pages on gamemog.com in headless Chrome and check they boot with no errors.

**Gotchas**
- **Content goes out by migration.** A world or other content change reaches the live database only through a migration in `deploy/migrate.mjs`. `boot.mjs` runs it before `next start`, once per id.
- **Snapshots.** `npm run deploy:snapshot` rewrites `deploy/seed.db.gz` from the local database. That matters only for a fresh disk, so commit it only on purpose.
- **`public/` is fixed at build time.** Production does not serve files added under `public/` after the build.
