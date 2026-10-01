# Deploying the play-only beta on Render

What goes live: every world on the site plays in the visitor's browser. Create and every "Mog it" button open a "Coming soon" pop-up, and the two routes that spend model time answer 503 (`middleware.ts`). The server gets no `ANTHROPIC_API_KEY`, so nothing on it can run up a bill.

Everything is described in `render.yaml` at the repository root (a Render Blueprint).

## Cost

| Item | Price |
|---|---|
| Web service, `0.5c-512mb` (was "Starter"): 0.5 CPU, 512 MB | $7 a month |
| Persistent disk, 1 GB, holds `data/gamemog.db` | $0.25 a month |
| Outbound bandwidth beyond the workspace allowance | billed per GB |

The films are the heavy part: each hero film is about 15 MB. For a small invite beta that is fine. If traffic grows, move `public/media` to Cloudflare R2 (no egress fees) before it shows up on the bill.

## First deploy (the owner, about five minutes)

1. Render dashboard: **New > Blueprint**. Connect GitHub as `whyagents` if asked, and pick `GameMog`.
2. Render reads `render.yaml` and asks for one value, `ADMIN_PASSWORD`. Use a new one, not the password on the Mac.
3. Check the plan it shows ($7 service + $0.25 disk), then **Apply**.
4. The first build takes a few minutes. On first boot `deploy/boot.mjs` finds the empty disk and copies in `deploy/seed.db.gz` (all 38 worlds, scores and plays as of the snapshot).
5. Open the `onrender.com` address Render gives you, play a world, and sign in at `/admin` once so your own visits stop counting.

## After that

- **Updates:** every push to `main` redeploys. A service with a disk stops the old instance before starting the new one, so expect a brief outage on each deploy.
- **The database** lives on the disk and survives deploys. `deploy/seed.db.gz` is only read when the disk is empty. To refresh it for a future new disk, run `npm run deploy:snapshot` on the Mac and commit the result.
- **Custom domain:** gamemog.com (live 30 Sep 2026). DNS stays at GoDaddy: one `A` record `@` → `216.24.57.1` and a `CNAME` `www` → `gamemog.onrender.com`, with GoDaddy's domain forwarding off and no `AAAA` records. `render.yaml` lists the domain (www redirects to it) and sets `SITE_URL`. Render issues and renews the certificate; there is nothing to buy.

## Building worlds (Mog mode)

`NEXT_PUBLIC_BUILDS` in `render.yaml` opens it (`on`) or keeps the play-only beta (`off`). Turn it on only after `ANTHROPIC_API_KEY` is set on the service's Environment page; without the key, Create falls back to a placeholder world and Mogs refuse.

- **The model:** builds, Mogs and race briefs use `claude-sonnet-5-5`. The key is `ANTHROPIC_API_KEY`, which the owner enters on the service's Environment page in Render; it never goes in the repository. Set a monthly limit in the Anthropic Console, since the site has no per-person caps (the owner's choice).
- **The test drive runs in the creator's browser.** Render has no graphics card, so where there is no Chrome the build stream asks the creator's page to drive the draft (`/d/<id>/play?drive=1`, `lib/runtime/drive.js`, shown live in the build show) and post what it measured to `/api/generate/drive`. The server judges it with the same rules as its own Chrome test drive (`lib/test-drive.ts`). Frame rate is not held against a phone, and only errors count if the tab was hidden. A drive that never reports is skipped after four minutes. On a machine with Chrome (the Mac), the server still drives; `GAMEMOG_DRIVE=browser` forces the browser drive for testing.
- **Media:** a new world's cover and key art are stored in the database, so they survive deploys. Files added under `public/` after a build are not served, so nothing new may be written there.
