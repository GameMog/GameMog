import { builderDeps } from './lib/hometown-build/server';
import { startNightlyBackups } from './lib/backups';

/** instrumentation.ts, Node runtime only: the town builder's queue and dispatcher at boot (when both are switched on). */
export function bootTownBuilder() {
  const b = process.env.HOMETOWN_BUILDER;
  if ((b !== 'owner' && b !== 'on') || process.env.HOMETOWN_RUNS !== 'workflows') return;
  try { builderDeps(); } catch (e) { console.error('hometown-build: boot', String((e as Error)?.message ?? e).slice(0, 300)); }
}

/** The nightly snapshot of the live data (lib/backups.ts): on in production unless GAMEMOG_BACKUPS=off. */
export function bootBackups() {
  try { startNightlyBackups(); } catch (e) { console.error('backups: boot', String((e as Error)?.message ?? e).slice(0, 300)); }
}
