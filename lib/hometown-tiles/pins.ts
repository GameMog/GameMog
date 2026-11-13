/**
 * The builds worlds pin (gc.ts never collects them). A hometown world pins its town in base.hometown (lock v2: place,
 * buildId, tile set, frame); a Mog copies its parent's exactly. Rather than follow every place a pack can sit, this
 * reads every text and blob value of every table, and every stored .json, and keeps every buildId it finds anywhere:
 *   data/gamemog.db                     published games and their drafts (lib/db.ts)
 *   data/storykit/store.db              Story Kit drafts, sealed and kept (lib/storykit-store.ts)
 *   data/storykit/blobs/**.json         sealed worlds and packs
 * Over-pinning is safe (a build is kept); missing one is not, so any read error makes `ok` false and the GC refuses.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const FIND = /htc-[0-9][0-9.]{0,9}-hg1-b[0-9a-f]{8}/g;

export type Pins = { builds: Set<string>; ok: boolean; sources: string[]; errors: string[] };

function scanText(s: string, into: Set<string>) { for (const m of s.matchAll(FIND)) into.add(m[0]); }

export function scanDb(file: string, into: Set<string>): number {
  const db = new DatabaseSync(file, { readOnly: true });
  let rows = 0;
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    for (const { name } of tables) {
      const q = db.prepare(`SELECT * FROM "${name.replace(/"/g, '""')}"`);
      for (const row of q.iterate() as Iterable<Record<string, unknown>>) {
        rows++;
        for (const v of Object.values(row)) {
          if (typeof v === 'string') { if (v.includes('-hg1-b')) scanText(v, into); }
          else if (v instanceof Uint8Array && v.length) { const s = Buffer.from(v).toString('latin1'); if (s.includes('-hg1-b')) scanText(s, into); }
        }
      }
    }
  } finally { db.close(); }
  return rows;
}

export function gatherPins(dataDir: string): Pins {
  const builds = new Set<string>(), sources: string[] = [], errors: string[] = [];
  for (const rel of ['gamemog.db', 'storykit/store.db']) {
    const f = path.join(dataDir, rel);
    if (!existsSync(f)) continue;
    try { const n = scanDb(f, builds); sources.push(`${rel} (${n} rows)`); } catch (e) { errors.push(`${rel}: ${(e as Error).message}`); }
  }
  const blobs = path.join(dataDir, 'storykit', 'blobs');
  if (existsSync(blobs)) {
    let n = 0;
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        const p = path.join(d, name);
        const s = statSync(p);
        if (s.isDirectory()) walk(p);
        else if (name.endsWith('.json')) { scanText(readFileSync(p, 'utf8'), builds); n++; }
      }
    };
    try { walk(blobs); sources.push(`storykit/blobs (${n} .json)`); } catch (e) { errors.push(`storykit/blobs: ${(e as Error).message}`); }
  }
  return { builds, ok: errors.length === 0, sources, errors };
}
