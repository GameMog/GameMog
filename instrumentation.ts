/**
 * Next's server start hook. Two jobs: with the production town builder on (HOMETOWN_BUILDER owner|on) and on-demand
 * builders (HOMETOWN_RUNS=workflows), open the queue at boot so its dispatcher (lib/hometown-build/dispatch.ts) starts
 * Render Workflows runs for work queued before a restart, without waiting for a request. And the nightly snapshot of the
 * live data (lib/backups.ts, production only unless GAMEMOG_BACKUPS says otherwise). Everything else is lazy, as
 * before. (The import sits inside the NEXT_RUNTIME test, Next's documented pattern, so the edge bundle never sees the
 * Node-only queue.)
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { bootTownBuilder, bootBackups } = await import('./instrumentation-node');
    bootTownBuilder();
    bootBackups();
  }
}
