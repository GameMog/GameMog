// Single-flight: concurrent do(key, fn) calls for one key share one execution of fn and its result (or error).
// The entry is dropped when fn settles, so a failed compile is retried by the next request, not cached.
export class SingleFlight {
  constructor() { this.inflight = new Map(); this.executions = 0; this.shared = 0; }
  do(key, fn) {
    const p = this.inflight.get(key);
    if (p) { this.shared++; return p; }
    this.executions++;
    const run = Promise.resolve().then(fn).finally(() => { this.inflight.delete(key); });
    this.inflight.set(key, run);
    return run;
  }
  get size() { return this.inflight.size; }
}
