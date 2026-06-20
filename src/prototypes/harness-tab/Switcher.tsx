// THROWAWAY PROTOTYPE — Floating bottom bar that switches variants.
// The skill's UI.md guidance asks for a "floating bottom bar"; this is a
// faithful implementation. Selection is URL-state via ?v=A so the user can
// deep-link to a specific variant.

import { useEffect } from 'react';
import { cn } from '@/lib/utils';

export type VariantId = 'A' | 'B' | 'C' | 'D';

const VARIANTS: { id: VariantId; label: string; tagline: string }[] = [
  { id: 'A', label: 'Three-pane', tagline: 'Stream / Diff / History' },
  { id: 'B', label: 'Commit graph', tagline: 'git-log swimlanes' },
  { id: 'C', label: 'Vertical feed', tagline: 'mobile-first decisions' },
  { id: 'D', label: 'Diff inspector', tagline: 'IDE-style code focus' },
];

export function Switcher({
  current,
  onChange,
}: {
  current: VariantId;
  onChange: (id: VariantId) => void;
}) {
  // keep ?v= in sync so URLs deep-link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('v') !== current) {
      params.set('v', current);
      const next = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState(null, '', next);
    }
  }, [current]);

  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-4 z-50 mx-auto flex w-fit max-w-[92vw] items-center gap-1 rounded-full border bg-background/95 px-2 py-2 text-xs shadow-lg backdrop-blur">
      <span className="px-3 font-medium text-muted-foreground">Prototype ·</span>
      {VARIANTS.map((v) => (
        <button
          key={v.id}
          onClick={() => onChange(v.id)}
          className={cn(
            'rounded-full px-3 py-1.5 transition-colors',
            current === v.id
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted',
          )}
        >
          <span className="mr-1.5 font-mono text-[10px] opacity-70">{v.id}</span>
          {v.label}
          <span className="ml-2 hidden text-[10px] opacity-60 sm:inline">— {v.tagline}</span>
        </button>
      ))}
    </div>
  );
}
