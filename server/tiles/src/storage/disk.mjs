import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { checkKey, verify } from './base.mjs';

// Local-disk backend (the default). One file per object: "HTT1", uint32 BE meta length, meta JSON, body.
// Writes go to a temp file in the same directory, then link(2) into place: link fails with EEXIST if the key exists,
// which makes ifAbsent atomic across processes on one machine, and a reader never sees a half-written file.
const MAGIC = Buffer.from('HTT1');

export class DiskStore {
  constructor({ root }) {
    if (!root) throw new Error('DiskStore needs a root directory');
    this.root = path.resolve(root);
  }
  file(key) { return path.join(this.root, ...checkKey(key).split('/')); }
  async get(key) {
    let buf;
    try { buf = await fs.readFile(this.file(key)); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    if (buf.length < 8 || !buf.subarray(0, 4).equals(MAGIC)) throw new Error(`bad object file for ${key}`);
    const n = buf.readUInt32BE(4);
    const meta = JSON.parse(buf.subarray(8, 8 + n).toString('utf8'));
    return verify(key, buf.subarray(8 + n), meta);
  }
  async put(key, body, meta, { ifAbsent = true } = {}) {
    const file = this.file(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const m = Buffer.from(JSON.stringify(meta), 'utf8');
    const head = Buffer.alloc(8);
    MAGIC.copy(head, 0);
    head.writeUInt32BE(m.length, 4);
    const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
    await fs.writeFile(tmp, Buffer.concat([head, m, body]));
    try {
      if (ifAbsent) {
        try { await fs.link(tmp, file); } catch (e) { if (e.code === 'EEXIST') return { created: false }; throw e; }
        return { created: true };
      }
      await fs.rename(tmp, file);
      return { created: true };
    } finally {
      await fs.rm(tmp, { force: true });
    }
  }
  async delete(key) { await fs.rm(this.file(key), { force: true }); }
  describe() { return `disk:${this.root}`; }
}
