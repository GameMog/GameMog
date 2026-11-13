/** The server's hometown deps (config, store, compiler), made once per process; routes call hometownDeps(). */
import { hometownConfig, hometownStore } from './config.ts';
import { createCompiler } from './compiler.ts';
import type { Deps } from './http.ts';

const G = globalThis as unknown as { __hometownCompiler?: { key: string; c: ReturnType<typeof createCompiler> } };
export function hometownDeps(): Deps {
  const cfg = hometownConfig();
  const store = hometownStore(cfg);
  let compiler = null;
  if (cfg.compile) {
    const key = [cfg.root, cfg.python, cfg.compilerDir, cfg.sourcesDir].join('|');
    if (G.__hometownCompiler?.key !== key) G.__hometownCompiler = { key, c: createCompiler(cfg, store) };
    compiler = G.__hometownCompiler.c;
  }
  return { cfg, store, compiler };
}
