'use client';
import { useState } from 'react';

/**
 * A real tab bar. Roblox's game page puts About / Store / Servers here, and a
 * tab strip that does not switch anything is worse than no tab strip, so this
 * one holds actual panels rather than decoration.
 */
export function Tabs({ panels }: { panels: { label: string; body: React.ReactNode }[] }) {
  const [on, setOn] = useState(0);
  return (
    <>
      <div className="tabs" role="tablist">
        {panels.map((p, i) => (
          <button
            key={p.label}
            role="tab"
            aria-selected={i === on}
            className={`tab${i === on ? ' on' : ''}`}
            onClick={() => setOn(i)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" style={{ paddingTop: 18 }}>{panels[on].body}</div>
    </>
  );
}
