// Builds a tile service from command-line options (bin/serve.mjs, bin/prewarm.mjs). Storage and compiler choices:
//   --store disk (default) --store-dir <dir>      default server/tiles/.cache (git-ignored)
//   --store s3 --s3-endpoint <url> --s3-bucket <b> [--s3-region auto] [--s3-prefix p/]
//        credentials from the environment only: TILES_S3_ACCESS_KEY_ID, TILES_S3_SECRET_ACCESS_KEY
//   --compiler fake (default) [--fake-version fake-1] [--fake-delay-ms 0]
//   --compiler cmd --compiler-version <buildId> --compiler-argv '<json array>' [--compiler-block-argv '<json>']
//        [--compiler-ctx-argv '<json>'] [--compiler-describe-argv '<json>'] [--compiler-encoding gzip] [--compiler-type t]
//        (argv placeholders: src/compilers/subprocess.mjs; the buildId is tools/hometown/compile.py's, e.g. --print-build)
//   --current-version <buildId>   the build manifests/locks default to (default: the last compiler given)
//   --gazetteer <file>      default server/tiles/fixtures/places.json
//   --block-level 2 (0: tile by tile) --max-compiles 4 --lru-mb 64
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { DiskStore, S3Store } from './storage/index.mjs';
import { createFakeCompiler, createSubprocessCompiler, compilerRegistry } from './compilers/index.mjs';
import { loadGazetteer } from './places.mjs';
import { LRU } from './lru.mjs';
import { createTileService } from './service.mjs';

export const TILES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const OPTIONS = {
  store: { type: 'string', default: 'disk' },
  'store-dir': { type: 'string' },
  's3-endpoint': { type: 'string' }, 's3-bucket': { type: 'string' }, 's3-region': { type: 'string', default: 'auto' }, 's3-prefix': { type: 'string', default: '' },
  compiler: { type: 'string', default: 'fake' },
  'fake-version': { type: 'string', default: 'fake-1' }, 'fake-delay-ms': { type: 'string', default: '0' },
  'compiler-version': { type: 'string' }, 'compiler-argv': { type: 'string' }, 'compiler-encoding': { type: 'string', default: 'identity' },
  'compiler-type': { type: 'string', default: 'application/octet-stream' }, 'compiler-cwd': { type: 'string' },
  'compiler-block-argv': { type: 'string' }, 'compiler-ctx-argv': { type: 'string' }, 'compiler-describe-argv': { type: 'string' },
  'current-version': { type: 'string' },
  gazetteer: { type: 'string' },
  'block-level': { type: 'string', default: '2' }, 'max-compiles': { type: 'string', default: '4' }, 'lru-mb': { type: 'string', default: '64' },
};

export function parse(argv, extra = {}) {
  return parseArgs({ args: argv, options: { ...OPTIONS, ...extra }, allowPositionals: false }).values;
}

export function storeFrom(o, env = process.env) {
  if (o.store === 's3') {
    return new S3Store({
      endpoint: o['s3-endpoint'], bucket: o['s3-bucket'], region: o['s3-region'], prefix: o['s3-prefix'],
      accessKeyId: env.TILES_S3_ACCESS_KEY_ID, secretAccessKey: env.TILES_S3_SECRET_ACCESS_KEY,
    });
  }
  if (o.store !== 'disk') throw new Error(`unknown --store ${o.store}`);
  return new DiskStore({ root: o['store-dir'] || path.join(TILES_DIR, '.cache') });
}

export function compilersFrom(o) {
  if (o.compiler === 'fake') return [createFakeCompiler({ version: o['fake-version'], delayMs: Number(o['fake-delay-ms']) })];
  if (o.compiler === 'cmd') {
    return [createSubprocessCompiler({
      version: o['compiler-version'], argv: JSON.parse(o['compiler-argv'] || 'null'),
      blockArgv: o['compiler-block-argv'] ? JSON.parse(o['compiler-block-argv']) : undefined,
      ctxArgv: o['compiler-ctx-argv'] ? JSON.parse(o['compiler-ctx-argv']) : undefined,
      describeArgv: o['compiler-describe-argv'] ? JSON.parse(o['compiler-describe-argv']) : undefined,
      contentEncoding: o['compiler-encoding'], contentType: o['compiler-type'], cwd: o['compiler-cwd'],
    })];
  }
  throw new Error(`unknown --compiler ${o.compiler}`);
}

export async function serviceFrom(o, { log } = {}) {
  const list = compilersFrom(o);
  return createTileService({
    store: storeFrom(o),
    compilers: compilerRegistry(list),
    places: await loadGazetteer(o.gazetteer || path.join(TILES_DIR, 'fixtures', 'places.json')),
    currentVersion: o['current-version'] || list[list.length - 1].version,
    blockLevel: Number(o['block-level']), maxConcurrentCompiles: Number(o['max-compiles']),
    lru: new LRU({ maxBytes: Number(o['lru-mb']) * 1024 * 1024 }),
    log,
  });
}
