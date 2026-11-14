import { checkKey, verify } from './base.mjs';

// In-memory backend (tests, load test). Same contract as disk and S3.
export class MemoryStore {
  constructor() { this.objects = new Map(); this.gets = 0; this.puts = 0; }
  async get(key) {
    checkKey(key);
    this.gets++;
    const o = this.objects.get(key);
    return o ? verify(key, Buffer.from(o.body), { ...o.meta }) : null;
  }
  async put(key, body, meta, { ifAbsent = true } = {}) {
    checkKey(key);
    this.puts++;
    if (ifAbsent && this.objects.has(key)) return { created: false };
    this.objects.set(key, { body: Buffer.from(body), meta: { ...meta } });
    return { created: true };
  }
  async delete(key) { this.objects.delete(checkKey(key)); }
  describe() { return 'memory'; }
}
