'use client';
import { useEffect, useState } from 'react';

/**
 * A San Francisco story world (SF 2040, 11 Nov) plays on Mog City's San Francisco, which is WebGPU only (its terrain,
 * fog and crowd: Mog City cities/sf/js/main.js, whose own card says so inside the frame and offers New York). The page
 * says it first, under the frame, on a browser with no WebGPU or no adapter (most phones, Safari before 26, Firefox):
 * nothing shows where it runs. Read once, in the browser only.
 */
export function NeedsWebGPU({ title }: { title: string }) {
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
      let ok = !!gpu;
      if (gpu) { try { ok = !!(await gpu.requestAdapter()); } catch { ok = false; } }
      if (live && !ok) setMissing(true);
    })();
    return () => { live = false; };
  }, []);
  if (!missing) return null;
  return <p className="msg warn" data-needs-webgpu style={{ marginTop: 10 }}>{title} runs on WebGPU, which this browser doesn&apos;t have (or has switched off). Play it in a recent Chrome or Edge on a computer.</p>;
}
