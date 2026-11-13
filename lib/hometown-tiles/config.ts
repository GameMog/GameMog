/**
 * Hometown hosting: the switches and the one store of this server (docs/HOMETOWN-HOSTING.md). Everything is off by
 * default, so production is unchanged until the owner sets them on the service's Environment page:
 *
 *   HOMETOWN_TILES=on              serve /api/hometown/* (tiles, descriptors, build records). Off: every public route 404
 *   HOMETOWN_ADMIN_TOKEN           the bearer token for /api/hometown/admin/* (upload, status, GC). Unset: admin is 404.
 *                                  Entered by the owner only (render.yaml sync:false); never written in the repo
 *   HOMETOWN_DISK_CAP_GB=2         the store's own cap on the shared 10 GB disk (Story Kit has 8,000 MB of it)
 *   HOMETOWN_FREE_FLOOR_GB=2       no put when the disk's free space would drop below this
 *   HOMETOWN_BUILD                 the current build (htc-...): never collected, and what /places/{id} answers from.
 *                                  Unset: both the newest build record and the build with the newest file (http.ts
 *                                  currentBuilds); set it once a build is live
 *   HOMETOWN_COMPILE=on            compile a missing tile's L2 block on this server (compiler.ts); off by default, and
 *                                  needs HOMETOWN_PYTHON and HOMETOWN_COMPILER_DIR (see the doc: not on today's plan)
 *   HOMETOWN_DIR                   the store's root (default data/hometown, on the Render disk)
 */
import path from 'node:path';
import { GB, TileStore } from './store.ts';

const num = (v: string | undefined, d: number) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) && n >= 0 ? n : d; };

export type HometownConfig = {
  tiles: boolean; compile: boolean; adminToken: string | null; root: string; dataDir: string; capBytes: number; minFreeBytes: number;
  build: string | null; python: string | null; compilerDir: string | null; sourcesDir: string | null; production: boolean;
};

export function hometownConfig(env: Record<string, string | undefined> = process.env): HometownConfig {
  const dataDir = path.resolve(env.HOMETOWN_DATA_DIR || 'data');
  return {
    tiles: env.HOMETOWN_TILES === 'on',
    compile: env.HOMETOWN_COMPILE === 'on',
    adminToken: env.HOMETOWN_ADMIN_TOKEN && env.HOMETOWN_ADMIN_TOKEN.length >= 24 ? env.HOMETOWN_ADMIN_TOKEN : null,
    root: path.resolve(env.HOMETOWN_DIR || path.join(dataDir, 'hometown')),
    dataDir,
    capBytes: Math.round(num(env.HOMETOWN_DISK_CAP_GB, 2) * GB),
    minFreeBytes: Math.round(num(env.HOMETOWN_FREE_FLOOR_GB, 2) * GB),
    build: env.HOMETOWN_BUILD || null,
    python: env.HOMETOWN_PYTHON || null,
    compilerDir: env.HOMETOWN_COMPILER_DIR || null,
    sourcesDir: env.HOMETOWN_SOURCES_DIR || null,
    production: env.NODE_ENV === 'production',
  };
}

const G = globalThis as unknown as { __hometownStore?: { root: string; store: TileStore } };
/** The server's one store (kept across hot reloads in dev). */
export function hometownStore(cfg = hometownConfig()): TileStore {
  if (G.__hometownStore?.root !== cfg.root) G.__hometownStore = { root: cfg.root, store: new TileStore({ root: cfg.root, capBytes: cfg.capBytes, minFreeBytes: cfg.minFreeBytes }) };
  const s = G.__hometownStore.store;
  s.capBytes = cfg.capBytes; s.minFreeBytes = cfg.minFreeBytes;
  return s;
}
