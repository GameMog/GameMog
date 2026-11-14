// Storage interface. Objects are immutable: a key is written once and never changes (put with ifAbsent keeps the
// first writer's bytes). Every backend implements:
//   get(key)                          -> Promise<{ body: Buffer, meta: object } | null>
//   put(key, body, meta, { ifAbsent }) -> Promise<{ created: boolean }>   created false = the key already existed
//   delete(key)                       -> Promise<void>                    (tests and operator repair only)
//   describe()                        -> string
// meta is a small JSON object the service owns: { contentType, contentEncoding, hash, contentHash, bytes, rawBytes }.
// hash = sha256 of the stored body (what the ETag is made from); get() re-hashes and throws IntegrityError on a mismatch.
export { IntegrityError, verify, checkKey } from './base.mjs';
export { DiskStore } from './disk.mjs';
export { MemoryStore } from './memory.mjs';
export { S3Store } from './s3.mjs';
