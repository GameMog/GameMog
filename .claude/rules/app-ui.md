---
paths:
  - "app/**/*"
---

# The site (app/)

- **No model names where players look** (the rule and its two exceptions are in `CLAUDE.md`). Raw builder errors reach players only through `scrub` and `friendlyError` in `app/create/generation.tsx`: route any new error path through them.
- **The site is flat.** `scripts/design-check.ts`, which runs inside `npm run check`, forbids:
  - gradients, backdrop blur, transitions and animations;
  - em dashes, emoji, purple and neon colours;
  - radii between 9px and a full pill;
  - Inter, Geist and Space Grotesk;
  - webfont fetches.
- **Glass only on dare and in-game surfaces** (owner, 10 Oct). Its styles live in `app/glass.css`. A file may use glass only if listed by exact path in `GLASS` or `GLASS_HOSTS` in `scripts/design-check.ts`.
- **Simplicity first** (the owner's standing preference).
- **A UI request is not a plumbing change.**
  - When the owner asks for UI or UX changes, leave `app/api/`, `lib/` and the `useGeneration` hook in `app/create/generation.tsx` unchanged.
  - Show that with `git diff --stat -- app/api lib`.
- **The owner's screen** (`app/admin`) is served at a private address (`lib/owner-path.ts`); `/admin` answers 404. Never write the address anywhere.
- **Check it.**
  - Look at the page at desktop and phone widths in real or headless Chrome (`lib/browser.ts`). `npm run media:pages` captures the owner-review set into the tracked `artifacts/screenshots/after/`, so stage those files only when the owner wants them.
  - Then run `npm run check`.
