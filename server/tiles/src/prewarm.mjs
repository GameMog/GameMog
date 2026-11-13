// Pre-warm: compile and store whole places ahead of their first visitor. Resumable: each finished place is appended
// to a JSONL state file ({ placeId, version, tileSetHash, ... }) and skipped on the next run; a place that failed or
// was interrupted is not in the file and is retried, and its tiles that did get stored are cache hits the second time.
import fs from 'node:fs/promises';
import path from 'node:path';
import { checkPlace } from './keys.mjs';

export function parsePlaceList(text) {
  const ids = [];
  for (const line of text.split(/\r?\n/)) {
    const s = line.replace(/#.*/, '').trim();
    if (s) ids.push(checkPlace(s));
  }
  return [...new Set(ids)];
}

export async function readState(file, version) {
  const done = new Map();
  let text = '';
  try { text = await fs.readFile(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (r.version === version && r.placeId) done.set(r.placeId, r); } catch { /* a torn last line from a kill: ignore it */ }
  }
  return done;
}

export async function prewarm({ service, placeIds, version, concurrency = 2, stateFile, signal, onEvent = () => {} }) {
  if (!service.compilers.has(version)) throw new Error(`no compiler registered for version ${version}`);
  if (stateFile) await fs.mkdir(path.dirname(stateFile), { recursive: true });
  const done = stateFile ? await readState(stateFile, version) : new Map();
  const todo = placeIds.filter((id) => !done.has(id));
  const result = { version, total: placeIds.length, skipped: placeIds.length - todo.length, warmed: [], failed: [], interrupted: false };
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      if (signal?.aborted) { result.interrupted = true; return; }
      const placeId = todo[i++];
      const t0 = Date.now();
      try {
        const r = await service.prewarmPlace(placeId, version);
        const rec = { ...r, ms: Date.now() - t0 };
        if (stateFile) await fs.appendFile(stateFile, `${JSON.stringify(rec)}\n`);
        result.warmed.push(rec);
        onEvent({ event: 'warmed', ...rec });
      } catch (e) {
        result.failed.push({ placeId, error: e.message });
        onEvent({ event: 'failed', placeId, error: e.message });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, todo.length)) }, worker));
  if (signal?.aborted && result.warmed.length + result.failed.length < todo.length) result.interrupted = true;
  return result;
}
