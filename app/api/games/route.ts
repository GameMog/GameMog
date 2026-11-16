import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { insertGame, slugify, listGames, getDraft, publishDraft, publishedGame, nameCreator, db } from '@/lib/db';
import { cleanName, isBlocked } from '@/lib/names';
import { validPlayer } from '@/lib/dare';
import { playtest } from '@/lib/playtest';
import { codeHash, testStatus } from '@/lib/test-drive';
import { isKartWorld } from '@/lib/custom-game';
import { publicMeta } from '@/lib/episode';
import { publishedKartConstants, type KartDriveTrack } from '@/lib/kart-score';
import { dna } from '@/lib/mog-dna';
import { publishedSoundtrack, type Soundtrack, type WorldOptions } from '@/lib/world-options';
import type { WorldSpec } from '@/lib/worldspec';
import { sealStoryDraft, keepStoryWorld, releaseStoryWorld, storeDraftOf, storeDraftInfo, townHold } from '@/lib/storykit-publish';
import { storyStore } from '@/lib/storykit-store';
import { storykitForRequest, ownerRequest } from '@/lib/storykit-http';
import { storykitMode } from '@/lib/storykit-switch';
import { setWorldHidden } from '@/lib/analytics';
import { crossOriginRefusal } from '@/lib/same-origin';

export const runtime = 'nodejs';

/** A published story game's store draft kept with it (a retry of a publish cut short before the keep). Never throws. */
function healStoryKeep(meta: string, gameId: string) {
  const storeId = storeDraftOf(meta);
  if (!storeId) return;
  try { if (storeDraftInfo(storeId)?.state !== 'kept' && keepStoryWorld(storeId, gameId)) console.log(`games: story draft ${storeId} kept with ${gameId} on a retry`); }
  catch (e) { console.error('games: a story draft could not be kept on a retry', String((e as Error)?.message ?? e).slice(0, 200)); }
}

export async function GET() {
  // (a consent record is served as its names only: lib/episode.ts publicMeta)
  return NextResponse.json({ games: listGames().map(({ spec, ...g }) => ({ ...g, meta: publicMeta(g.meta), spec: JSON.parse(spec) })) });
}

export async function POST(req: Request) {
  // (publishing reads the owner's session in owner mode: only from the site's own pages, lib/same-origin.ts)
  const cross = crossOriginRefusal(req);
  if (cross) return cross;
  const body = (await req.json()) as { spec?: unknown; prompt?: string; draftId?: string; creator?: unknown; player?: unknown };

  // A written game publishes from its draft: exactly the code that passed the
  // runtime playtest, never code resent by the client.
  if (body.draftId) {
    const d = getDraft(body.draftId);
    if (!d) return NextResponse.json({ error: 'That draft no longer exists.' }, { status: 404 });
    // who made it (10 Oct, the dare loop; no accounts): the name they gave (public, "Created by") and their browser's
    // id (app/anon.ts playerId; private, never served). Both optional; a name that does not pass is said so before
    // anything is published
    const name = body.creator == null || body.creator === '' ? null : cleanName(body.creator);
    if (name && !name.ok) return NextResponse.json({ error: name.error, field: 'creator' }, { status: 400 });
    const creator = name?.ok ? name.value : null, player = validPlayer(body.player) ? body.player : null;
    // once only: a second publish of the same draft (a double tap, a retry) is the first game, named now if it was not
    const done = publishedGame(d.id);
    if (done) {
      if (creator && !done.creator && nameCreator(done.id, creator, player)) done.creator = creator;
      // (a story world's retry keeps its store draft with the game: a publish cut short before the keep heals here)
      healStoryKeep(d.meta, done.id);
      return NextResponse.json({ id: done.id, slug: done.slug, creator: done.creator, again: true });
    }
    const report = JSON.parse(d.report) as { ok?: boolean; ran?: boolean; status?: string; codeHash?: string; coverHash?: string; kart?: KartDriveTrack; soundtrack?: unknown };
    if (!report.ok) return NextResponse.json({ error: 'This game did not pass playtesting.' }, { status: 400 });
    // a drive that never ran, or ran on other code, publishes as unverified: honest, not held back
    const hash = codeHash(d.code), status = !report.codeHash ? testStatus(report) : report.codeHash === hash ? report.status ?? testStatus(report) : 'unverified';
    const test = d.format === 'world' ? { status, codeHash: hash, cover: !report.coverHash ? 'none' : report.coverHash === hash ? 'current' : 'earlier' } : undefined;
    // a kart race's score constants (8 Oct, lib/kart-score.ts publishedKartConstants): its parent's measured ones when
    // its drive raced the parent's track, else the course's from the lap its drive measured, else none stored (the
    // route's fallback; and never any the draft's meta brought). Only a drive of exactly this code says what this code's
    // track is; one that ran out of time before the finish (unverified) still read the track as it loaded
    let add: { kartScore?: ReturnType<typeof publishedKartConstants>; options?: WorldOptions; soundtrack?: Soundtrack } | undefined;
    if (d.format === 'world' && isKartWorld(d.code)) {
      const parent = d.parent_id ? db.prepare('SELECT id, code, meta FROM games WHERE id = ?').get(d.parent_id) as { id: string; code: string | null; meta: string | null } | undefined : undefined;
      add = { kartScore: publishedKartConstants({
        code: d.code, kart: dna(d.code).kart, drive: report.codeHash === hash ? report.kart : null,
        parent: parent ? { id: parent.id, meta: parent.meta, kart: parent.code ? dna(parent.code).kart : null } : null,
      }) ?? undefined };
    }
    // a Mog that kept its original's soundtrack (9 Oct, lib/world-options.ts publishedSoundtrack): the original's as the
    // database has it, in its options and, when this code plays it, as its own (meta.soundtrack: a Mog of it offers it
    // too); every other draft publishes its music as it was built, with none of its own
    const dm = JSON.parse(d.meta) as { title: string; options?: unknown };
    if (d.format === 'world' && dm.options !== undefined) {
      const parentMeta = d.parent_id ? (db.prepare('SELECT meta FROM games WHERE id = ?').get(d.parent_id) as { meta: string | null } | undefined)?.meta : null;
      const s = publishedSoundtrack({ options: dm.options, parentMeta, kart: isKartWorld(d.code), drive: report.codeHash === hash && 'soundtrack' in report ? { soundtrack: report.soundtrack } : null });
      add = { ...add, ...(s.options ? { options: s.options } : {}), soundtrack: s.soundtrack ?? undefined };
    }
    // a Story Kit world (STORYKIT=on, lib/storykit-publish.ts): its store draft sealed as the world the game plays, and
    // KEPT with the game's id BEFORE the catalog commit (16 Nov): a publish cut short after the commit can no longer
    // leave a listed game whose world the store's sweep takes a day later. Fail closed: a draft the store cannot keep
    // publishes nothing. If the commit then fails, the keep is handed back, but only when this request did it (a draft
    // kept already stays kept). With the switch off a story draft is not published
    // a hometown story publishes only once the play page would serve every place it names (16 Nov, Colter Land: the
    // whole town failed, the spawn district was served for good and 8 of its 14 places never appeared): refused, said
    // why, until the whole town is built (lib/storykit-publish.ts townHold)
    const storeOf = storeDraftOf(d.meta);
    if (storeOf && storykitForRequest(req)) {
      const hold = townHold(d.meta, storyStore().world(storeOf));
      if (hold) return NextResponse.json({ error: hold.error, places: hold.places, field: 'town' }, { status: 409 });
    }
    const story = sealStoryDraft(d, storykitForRequest(req));
    if (story && !story.ok) return NextResponse.json({ error: story.error }, { status: story.status });
    if (story) add = { ...add, ...story.meta };
    const id = randomUUID();
    const slug = slugify(dm.title);
    const before = story ? storeDraftInfo(story.storeId) : null;
    if (story && !keepStoryWorld(story.storeId, id)) return NextResponse.json({ error: 'This story world could not be kept just now. Try again.' }, { status: 503 });
    let published = false;
    try {
      published = publishDraft(d.id, slug, id, test, add, { creator, player });
    } finally {
      // (nothing published: a keep this request made is released; one kept already goes back to the game it had)
      if (story && !published) {
        try { if (before?.state === 'kept') { if (before.gameId) keepStoryWorld(story.storeId, before.gameId); } else releaseStoryWorld(story.storeId); }
        catch (e) { console.error('games: a story keep could not be handed back', String((e as Error)?.message ?? e).slice(0, 200)); }
      }
    }
    if (!published) {
      const first = publishedGame(d.id);
      if (first) { healStoryKeep(d.meta, first.id); return NextResponse.json({ id: first.id, slug: first.slug, creator: first.creator, again: true }); }
      return NextResponse.json({ error: 'That draft no longer exists.' }, { status: 404 });
    }
    // (STORYKIT=owner: the owner's test world goes in hidden, so nobody else sees it in any list; the owner's session
    // opens it at /g/<slug>, lib/storykit-switch.ts. Set it live from /admin only once the switch is on for everyone)
    if (story && storykitMode() === 'owner') setWorldHidden(id, true);
    return NextResponse.json({ id, slug, creator });
  }

  // A raw world spec (the race brief's, which no page sends any more): the owner's only (16 Nov), so nobody can publish
  // straight onto the homepage without a build; anyone else's is not found, as every owner route answers. Without a
  // model key (an open-source fork, a local run) /api/generate returns the offline placeholder spec, which costs
  // nothing to make and is published this way (app/create, scripts/populate.mjs), so the door stays open there.
  const hasModelKey = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  if (hasModelKey && !ownerRequest(req)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  // Publishing revalidates. A client can send anything; nothing reaches the
  // database until it passes the same gate a generation did.
  const report = playtest(body.spec);
  if (!report.ok) {
    return NextResponse.json({ error: 'This world did not pass playtesting.', report }, { status: 400 });
  }

  const spec = body.spec as WorldSpec;
  // and the words every list shows go through the name filter (lib/names.ts)
  const words = [spec.meta.title, spec.meta.tagline, spec.meta.blurb];
  if (words.some((w) => isBlocked(w))) return NextResponse.json({ error: 'Pick another title.', field: 'title' }, { status: 400 });
  const id = randomUUID();
  const slug = slugify(spec.meta.title);
  insertGame({ id, slug, spec, prompt: body.prompt ?? null });
  return NextResponse.json({ id, slug, report });
}
