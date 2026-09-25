# Deploying GameMog on Netlify

Written 25 Sep 2026 for the small pilot. Netlify's figures below come from its own docs on that date (links at the end).

## The short version

Netlify can host the **website**, but on its own it cannot run GameMog as the code stands today. Three parts of the app need things Netlify doesn't provide:

| GameMog needs | Netlify provides | Result |
|---|---|---|
| A build to stream progress for **10 to 35 minutes** (`/api/generate`) | Normal functions stop at **60 seconds**, and you can't raise that. Background functions stop at **15 minutes** and can't stream anything back. | Won't fit. The builder has to run somewhere else. |
| A real **Chrome** for the test drive, plus about 70 seconds of WebGL rendering | Short-lived functions, 1 to 4 GB of memory, and no GPU | Won't fit. Same answer: a separate builder. |
| One **SQLite file** on disk (`data/gamemog.db`) | No disk that survives between requests | The database has to move to a hosted service. |

That leaves two sensible ways to launch:

- **A. Netlify for the site, plus a separate builder box, plus a hosted database.** This is the "deploy on Netlify" path. It takes roughly **2 to 4 days of work**, most of it moving the database layer from synchronous `node:sqlite` to an async client.
- **B. The whole app on one always-on server with a disk.** Examples are a Fly.io Machine with a volume, Railway or Render. This works **today with almost no code changes**, and Netlify is then optional (DNS only).

**For a small pilot I recommend B first, then A once the pilot proves people come back.** If Netlify is a firm requirement, A is laid out below step by step.

## Plan A: Netlify, a builder box and a hosted database

```
 browser ──► gamemog.com (Netlify: pages, game frames, votes, scores, plays, /api/hit, /admin)
    │                         │
    │                         └──► hosted database (Turso)
    │
    └──── build stream ────► builder.gamemog.com (one always-on box: /api/generate, Chrome test drive, drafts)
                                  └──► same hosted database
```

### 1. Database: Turso (recommended) or Netlify Database

- **Turso** speaks SQLite's dialect, so every existing query keeps its SQL. Its client (`@libsql/client`) can also open the local file in development (`file:data/gamemog.db`), so local work keeps running off the same file. To import the current data:
  ```bash
  sqlite3 data/gamemog.db "PRAGMA wal_checkpoint(TRUNCATE)"
  ```
  ```bash
  turso db create gamemog --from-file data/gamemog.db
  ```
- **Netlify Database** is managed Postgres. It is only available on credit-based plans, and each deploy preview gets its own database branch automatically, which is a nice feature. The catch is that queries need rewriting for Postgres: `SUM(value = 1)` becomes a `CASE`, `BLOB` becomes `bytea`, and `PRAGMA table_info` goes away.

Either way, every call in `lib/db.ts` and `lib/analytics.ts` becomes `await`ed. **This touches the plumbing you asked me to leave alone**, so it needs your go-ahead. Game covers are stored in the database as BLOBs today. They can stay there, or move to Netlify Blobs.

### 2. The builder box

This is the same repo, run with `npm run build && npm start` on a machine that stays on. It serves only `/api/generate` and the draft routes, and it is the only place `ANTHROPIC_API_KEY` lives. There are two ways to run it:

- **Linux VM or container.** It's cheap, but Chrome renders WebGL in software there (`--use-angle=swiftshader` in `lib/browser.ts`). Heavy worlds such as Speed Skating's mirror ice and 30,000 fans may run too slowly and fail their test drives. **Run `npm run check:runtime` on the box before trusting it.**
- **A cloud Mac mini** (Apple silicon, rented by the hour or month). It runs the exact Chrome setup that has been validated so far (`--use-angle=metal`). It costs more and needs no guesswork.

The browser has to stream a build straight from the builder, because a Netlify function would cut it off at 60 seconds. The create and Mog pages then fetch from `https://builder.gamemog.com/api/generate` instead of `/api/generate`, and the builder allows `https://gamemog.com` through CORS. That changes one address inside the `useGeneration` hook, which is also plumbing and also needs your OK.

### 3. The site on Netlify

1. Push the repo to a **private** GitHub repo. `.env.local` and `data/` are already ignored, so check that before the first push.
2. In Netlify, choose **Add new project, then Import from Git**. Netlify detects Next.js and uses its OpenNext adapter automatically. The build command is `npm run build`, and nothing else needs configuring.
3. Set these environment variables in Netlify (not in the repo):
   - `SITE_URL=https://gamemog.com`. Link previews and the sitemap use this. Without it they fall back to Netlify's own address.
   - `ADMIN_PASSWORD`: a **new** long password, not the local one.
   - `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`, or the Netlify Database connection.
   - `BUILDER_URL=https://builder.gamemog.com`
   - `ANTHROPIC_API_KEY` stays off Netlify. Only the builder needs it.
4. **Domain:** add `gamemog.com` under Domain management. Netlify issues the HTTPS certificate itself. Point `builder.` at the builder box.
5. **Static media:** the 57 MB in `public/media` and 17 MB in `public/assets` deploy to Netlify's CDN as they are. The `/assets/*` CORS header in `next.config.ts` carries over unchanged.

### 4. Credits: watch the homepage film

Netlify now bills in credits. Free includes 300 a month, Personal ($9) 1,000 and Pro ($20) 3,000. Bandwidth costs **20 credits per GB**, and every production deploy costs **15 credits**.

The homepage film is **15.8 MB**. At that size:
- 1,000 desktop homepage visits use about 15.8 GB, or roughly 316 credits. **That is more than the whole Free plan.**
- 20 deploys use another 300 credits.

Before sharing links, re-encode the wide cut at about 3 to 4 MB. The recorder already takes a bitrate (`scripts/media/record-hero.ts`). **Pro** is the realistic plan for a pilot.

## Plan B: one server for everything (fastest)

1. Pick a host that offers a persistent disk and a long-running Node process, such as a Fly.io Machine with a volume, Railway with a volume, or Render with a disk.
2. Install Chrome (or Chromium) in the image, then deploy with `npm run build` and `npm start`. Mount the disk at `data/`.
3. Set `SITE_URL`, `ADMIN_PASSWORD` and `ANTHROPIC_API_KEY` as secrets, then copy `data/gamemog.db` onto the disk once.
4. Run `npm run check:runtime` on the server before inviting anyone, for the same software-rendering reason as the builder box above.
5. Put Netlify or Cloudflare in front for DNS and caching of `/media` and `/assets` if you like.

Nothing in `lib/` changes, and the build stream runs as it does on your Mac. Moving to Plan A later is the same work as now, just done when it has earned it.

## Before the first invite (either plan)

- [ ] A new `ADMIN_PASSWORD` in production. `/admin` is switched off entirely when it isn't set.
- [ ] A hard monthly spend limit in the Anthropic Console. A world costs about $1.30 to $1.90 and a Mog about $2.30 to $3.10.
- [ ] Invite codes and a per-person daily build cap on Create and Mog. These were flagged earlier and aren't built yet.
- [ ] A 3 to 4 MB hero film.
- [ ] `SITE_URL` set, then paste a game link into iMessage or Slack to see the preview card.
- [ ] `npm run check:runtime` passing on whichever machine does the test drives.
- [ ] Sign in to `/admin` once. Your own visits stop counting as traffic while you're signed in.

## Sources

- [Netlify: Configuration for functions](https://docs.netlify.com/build/functions/configuration/). Defaults: 60 s synchronous limit (not configurable), 15 min background, 6 MB buffered and 20 MB streamed responses, 1,024 to 4,096 MB of memory.
- [Netlify: Background Functions](https://docs.netlify.com/build/functions/background-functions/). Up to 15 minutes, no response streaming.
- [Netlify Database](https://docs.netlify.com/build/data-and-storage/netlify-database/). Managed Postgres, credit-based plans only.
- [Netlify pricing](https://www.netlify.com/pricing/). Credits per plan, 20 credits per GB of bandwidth, 15 per production deploy.
- [Next.js on Netlify (OpenNext)](https://opennext.js.org/netlify).
- [Turso: db create --from-file](https://docs.turso.tech/cli/db/create).
