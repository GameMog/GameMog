// Shared helpers for the storage backends (see index.mjs for the interface).
import { sha256 } from '../util.mjs';

export class IntegrityError extends Error {}

export function verify(key, body, meta) {
  if (meta && meta.hash && sha256(body) !== meta.hash) throw new IntegrityError(`stored object ${key} does not match its hash`);
  return { body, meta };
}

export function checkKey(key) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9._\/-]{1,400}$/.test(key) || key.split('/').some((s) => s === '' || s === '.' || s === '..')) {
    throw new Error(`bad storage key ${key}`);
  }
  return key;
}

