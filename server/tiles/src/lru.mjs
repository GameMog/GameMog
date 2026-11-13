// A bounded in-memory LRU over Map insertion order, capped by total bytes and by entry count.
export class LRU {
  constructor({ maxBytes = 64 * 1024 * 1024, maxEntries = 10000 } = {}) {
    this.maxBytes = maxBytes;
    this.maxEntries = maxEntries;
    this.map = new Map();
    this.bytes = 0;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }
  get(key) {
    const e = this.map.get(key);
    if (!e) { this.misses++; return undefined; }
    this.map.delete(key);
    this.map.set(key, e);
    this.hits++;
    return e.value;
  }
  set(key, value, size) {
    if (size > this.maxBytes) return false; // never cache something larger than the whole budget
    const old = this.map.get(key);
    if (old) { this.bytes -= old.size; this.map.delete(key); }
    this.map.set(key, { value, size });
    this.bytes += size;
    while (this.bytes > this.maxBytes || this.map.size > this.maxEntries) {
      const [k, e] = this.map.entries().next().value;
      this.map.delete(k);
      this.bytes -= e.size;
      this.evictions++;
    }
    return true;
  }
  clear() { this.map.clear(); this.bytes = 0; }
  get size() { return this.map.size; }
}
