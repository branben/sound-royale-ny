// THROWAWAY PROTOTYPE — Top-level Harness Tab page.
// Renders one of four radically different UI variations for visualising a
// SkillOpt-style loop. A floating bottom bar switches between them.
// Question: which variation legibly exposes the proposal-and-test gate?

import { useState, useEffect } from 'react';
import { Switcher, type VariantId } from './Switcher';
import { ThreePane } from './variants/ThreePane';
import { CommitGraph } from './variants/CommitGraph';
import { VerticalFeed } from './variants/VerticalFeed';
import { DiffInspector } from './variants/DiffInspector';

function readInitialVariant(): VariantId {
  if (typeof window === 'undefined') return 'A';
  const v = new URLSearchParams(window.location.search).get('v');
  if (v === 'A' || v === 'B' || v === 'C' || v === 'D') return v;
  return 'A';
}

export default function HarnessTab() {
  const [variant, setVariant] = useState<VariantId>(readInitialVariant);

  useEffect(() => {
    // ESC returns to the prototype index
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.history.back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      <header className="border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Harness Tab · Prototype</span>{' '}
        · 4 UI variants · wired to a static mock of a SkillOpt loop ·{' '}
        <code className="ml-1 font-mono">?v=A|B|C|D</code> ·{' '}
        <span className="italic">throwaway — see PROTOTYPE.md</span>
      </header>
      <main className="relative flex-1 overflow-hidden">
        {variant === 'A' && <ThreePane />}
        {variant === 'B' && <CommitGraph />}
        {variant === 'C' && <VerticalFeed />}
        {variant === 'D' && <DiffInspector />}
      </main>
      <Switcher current={variant} onChange={setVariant} />
    </div>
  );
}
