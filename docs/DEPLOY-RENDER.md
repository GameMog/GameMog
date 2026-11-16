# Deploying the play-only beta on Render

What goes live: every world on the site plays in the visitor's browser. Create and every "Mog it" button open a "Coming soon" pop-up, and the two routes that spend model time answer 503 (`middleware.ts`). The server gets no `ANTHROPIC_API_KEY`, so nothing on it can run up a bill.

Everything is described in `render.yaml` at the repository root (a Render Blueprint).

## Cost

| Item | Price |
|---|---|
| Web service, `1c-2g` (Standard, since 7 Nov 2026; was `0.5c-512mb`, "Starter"): 1 CPU, 2 GB | $25 a month |
| Persistent disk, 10 GB (since 7 Nov 2026; was 1 GB), holds `data/gamemog.db` and the Story Kit store (`data/storykit`, `STORYKIT_DISK_MB`, 8,000 MB by default) | $2.50 a month |
| Outbound bandwidth beyond the workspace allowance | billed per GB |

The films are the heavy part: each hero film is about 15 MB. For a small invite beta that is fine. If traffic grows, move `public/media` to Cloudflare R2 (no egress fees) before it shows up on the bill.

## First deploy (the owner, about five minutes)

1. Render dashboard: **New > Blueprint**. The code lives at `GameMog/GameMog` (the GameMog organisation, since 1 Oct; it moved from `whyagents/GameMog`). Render's GitHub app must be installed on the GameMog organisation with access to the repo; then pick `GameMog/GameMog`.
2. Render reads `render.yaml` and asks for one value, `ADMIN_PASSWORD`. Use a new one, not the password on the Mac.
3. Check the plan it shows ($25 service + $2.50 disk), then **Apply**.
4. The first build takes a few minutes. On first boot `deploy/boot.mjs` finds the empty disk and copies in `deploy/seed.db.gz` (all 38 worlds, scores and plays as of the snapshot).
5. Open the `onrender.com` address Render gives you, play a world, and sign in at `/admin` once so your own visits stop counting.

## After that

- **Updates:** every push to `main` redeploys. A service with a disk stops the old instance before starting the new one, so expect a brief outage on each deploy.
- **The database** lives on the disk and survives deploys. `deploy/seed.db.gz` is only read when the disk is empty (a lost database on a disk that holds other data is restored from the newest snapshot instead: Backups and restore, below). To refresh it for a future new disk, run `npm run deploy:snapshot` on the Mac and commit the result.
- **Custom domain:** gamemog.com (live 30 Sep 2026). DNS stays at GoDaddy: one `A` record `@` → `216.24.57.1` and a `CNAME` `www` → `gamemog.onrender.com`, with GoDaddy's domain forwarding off and no `AAAA` records. `render.yaml` lists the domain (www redirects to it) and sets `SITE_URL`. Render issues and renews the certificate; there is nothing to buy.

## Backups and restore

Everything GameMog keeps lives on the one 10 GB Render disk (`data/`): the catalog (`data/gamemog.db`: every published world, scores, plays, builds), the Story Kit store (`data/storykit`: `store.db` and the content-addressed files of every story world) and the town builder's queue (`data/hometown/queue.db`). The town tiles and bundles (`data/hometown/...`) are not backed up: the builder can build them again.

- **Nightly snapshot** (`lib/backups.ts`, `deploy/backups.mjs`): once a UTC day, from 10:00 UTC (about 2 am in Los Angeles), the server takes consistent copies (SQLite `VACUUM INTO`) of the three databases into `data/backups/<UTC date>/` with a `manifest.json` (each file's size, SHA-256 and row counts, and the Story Kit files the published story worlds use). It runs as its own process, so no request waits on it. The last 7 are kept. It is skipped, with a warning in the log, while the disk's free space is under `BACKUP_FREE_FLOOR_GB` (default 2) plus the copies' size. On in production; `GAMEMOG_BACKUPS=off` stops it (`on` runs it in development). `BACKUP_KEEP` and `BACKUP_HOUR_UTC` change how many are kept and when.
- **Download it off the disk** (do this regularly: the snapshots share the disk they protect): sign in at `/admin`, and on the Overview the Backups card has **Download the newest backup** (`/api/admin/backup`, owner only; anyone else gets 404). It is one `.tar.gz`: the newest snapshot and every Story Kit file the published story worlds use (files never change once stored). With no snapshot yet, one is taken first.
- **Restore** onto a new or wiped disk: `node deploy/restore.mjs gamemog-backup-<date>.tar.gz` (or `--data <dir>`). It checks every database against its SHA-256 and every story file against its own name before putting anything in place, refuses a `data/` that already holds anything (`--force` replaces its databases), and refuses a bundle missing story files (`--allow-missing` restores without them). Drafts that were never published are not in a backup. On Render, Shell and SSH only exist on a running instance, and the normal start command (`deploy/boot.mjs`) seeds an empty disk before any shell exists, so never restore under the live server (`--force` would replace databases the running server has open, and its later writes would be lost). Instead: temporarily set the service's Start Command to `sleep 86400` and deploy (Render keeps the disk attached, and nothing opens the databases); upload the bundle over Render SSH (`scp`); run `node deploy/restore.mjs <bundle> --force`; then put the Start Command back and deploy. `--force` is expected there: the seeded disk, or a freshly mounted one, is not empty (a new disk may hold `lost+found`).
- **A lost catalog at boot** (`deploy/boot.mjs`): if `data/gamemog.db` is missing on a disk that still holds the Story Kit store, the town queue or snapshots, the database was lost, not new. The newest snapshot is restored and the log says so loudly (anything published after it is missing; /admin's story reconcile lists kept story worlds with no game). With no snapshot it is seeded from `deploy/seed.db.gz` with a loud warning. Only a disk with no data at all is seeded quietly, as before.
- **Render's own disk snapshots:** Render keeps daily snapshots of a persistent disk. Check on the dashboard (the service, Disks) that they are listed and how far back they go; restoring one replaces the whole disk.
- **Automatic off-disk copies (next step, not built):** a push of each snapshot to an S3-compatible bucket (Cloudflare R2, Backblaze B2, S3). It would read `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_REGION`, `BACKUP_S3_ACCESS_KEY_ID` and `BACKUP_S3_SECRET_ACCESS_KEY` (entered on the Environment page, never in the repository), upload the databases and manifest under `<date>/`, and each story file once under `blobs/<sha256>.<ext>` (they never change). It needs request signing and multipart uploads for files over 5 GB, so it is left for when the owner sets up a bucket; until then, download the backup from /admin.

## Building worlds (Mog mode)

`NEXT_PUBLIC_BUILDS` in `render.yaml` opens it (`on`) or keeps the play-only beta (`off`). Turn it on only after `ANTHROPIC_API_KEY` is set on the service's Environment page; without the key, Create falls back to a placeholder world and Mogs refuse.

- **The model:** builds, Mogs and race briefs use `claude-sonnet-5-5`. The key is `ANTHROPIC_API_KEY`, which the owner enters on the service's Environment page in Render; it never goes in the repository. Set a monthly limit in the Anthropic Console, since the site has no per-person caps (the owner's choice).
- **The test drive runs in the creator's browser.** Render has no graphics card, so where there is no Chrome the build stream asks the creator's page to drive the draft (`/d/<id>/play?drive=1`, `lib/runtime/drive.js`, shown live in the build show) and post what it measured to `/api/generate/drive`. The server judges it with the same rules as its own Chrome test drive (`lib/test-drive.ts`). Frame rate is not held against a phone, and only errors count if the tab was hidden. A drive that never reports is skipped after four minutes. On a machine with Chrome (the Mac), the server still drives; `GAMEMOG_DRIVE=browser` forces the browser drive for testing.
- **Safety limits (9 Oct, `lib/build-limits.ts`, docs/RULES.md 2b):** at most `BUILD_SLOTS` builds run at once, site-wide (default 10; set it on the Environment page to change it, no deploy of code needed, but the service restarts). The next creators wait in line (up to `BUILD_QUEUE_MAX`, default 40), told their place and the wait; beyond that they are told GameMog is busy, before any model call. `BUILD_DAILY_USD` (default 50) is the day's spend ceiling (Los Angeles day): at it, no new build starts and the line is let go; running builds finish. A build stops, model call and all, when its creator's connection closes. Every build is logged in `generations` from its start, with the tokens and real cost of each pass; /admin shows them, the builds running now, and the abandoned and interrupted counts. A deploy still stops builds in flight (one long request each): `deploy/boot.mjs` marks them `interrupted` at the next start, so deploy when /admin shows nothing building. The selfie reader (`/api/me/selfie`, one short call, not a build) is held to `SELFIE_PER_HOUR` reads an hour per address (4) and `SELFIE_SITE_HOUR` for the whole site (200), refused at the day's ceiling, and its cost counts in the day's spend (16 Nov). The race brief and publishing a raw world spec (`POST /api/games` with `spec`), which no page uses, are the owner's only.
- **Media:** a new world's cover and key art are stored in the database, so they survive deploys. Files added under `public/` after a build are not served, so nothing new may be written there.
