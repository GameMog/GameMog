/**
 * The workflow deploy this web was made with (docs/HOMETOWN-HOSTING.md, "a compiler upgrade"): its deploy stamp, the files
 * that make the town-builder workflow (deploy/town-builder, exactly render.yaml's buildFilter for the workflow) hashed by
 * name and bytes. The web and the workflow deploy from the same commit, and the workflow rebuilds exactly when these
 * files change, so a run that reports this stamp with its claim (deploy/town-builder/worker.py deploy_stamp, the same
 * algorithm) is a run of the deploy the web expects, and the build it reports is the one new towns are made at.
 *
 *   per file (top level only, sorted by name; dot files and .pyc skipped): "<name>\0<sha256 hex of its bytes>\n"
 *   stamp = the first 16 hex of sha256 of those lines
 *
 * HOMETOWN_DEPLOY_STAMP: 16 hex to set it, `off` to switch the check off (towns.ts buildView then takes the build the
 * runs report, as before 14 Nov). Null when the folder cannot be read (the same as off).
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const STAMP = /^[0-9a-f]{16}$/;

export function deployStamp(dir: string): string | null {
  try {
    const names = readdirSync(dir).filter((n) => !n.startsWith('.') && !n.endsWith('.pyc')).sort();
    const h = createHash('sha256');
    let n = 0;
    for (const name of names) {
      const p = path.join(dir, name);
      if (!statSync(p).isFile()) continue;
      h.update(`${name}\0${createHash('sha256').update(readFileSync(p)).digest('hex')}\n`, 'utf8');
      n++;
    }
    return n ? h.digest('hex').slice(0, 16) : null;
  } catch { return null; }
}

/** The stamp this web expects of the runs: HOMETOWN_DEPLOY_STAMP, else its own checkout's deploy/town-builder. */
export function webStamp(env: Record<string, string | undefined> = process.env, root = process.cwd()): string | null {
  const v = (env.HOMETOWN_DEPLOY_STAMP ?? '').trim();
  if (v === 'off') return null;
  if (STAMP.test(v)) return v;
  return deployStamp(path.join(root, 'deploy', 'town-builder'));
}
