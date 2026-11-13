/**
 * Next's server start hook. One job: with the production town builder on (HOMETOWN_BUILDER owner|on) and on-demand
 * builders (HOMETOWN_RUNS=workflows), open the queue at boot so its dispatcher (lib/hometown-build/dispatch.ts) starts
 * Render Workflows runs for work queued before a restart, without waiting for a request. Everything else is lazy, as
 * before; with the builder off this does nothing. (The import sits inside the NEXT_RUNTIME test, Next's documented
 * pattern, so the edge bundle never sees the Node-only queue.)
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { bootTownBuilder } = await import('./instrumentation-node');
    bootTownBuilder();
  }
}
