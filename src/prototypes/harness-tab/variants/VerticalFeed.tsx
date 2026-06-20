// THROWAWAY PROTOTYPE — Variant C: Vertical Feed (mobile-first, opinionated).
// Single column. Each proposal is a card with a clear accept/reject action.
// Header collapses the entire model/method into a small status pill.
// Prioritises: speed of decision, not simultaneous comparison.

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CURRENT_SKILL_SNIPPET,
  EPOCHS,
  PROPOSALS,
  Proposal,
  SLOW_UPDATE_BLOCK,
} from '../data';

export function VerticalFeed() {
  const [local, setLocal] = useState<Record<string, Proposal['status']>>({});
  const decisions = Object.keys(local).length;

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col gap-3 p-4">
      <Card>
        <CardHeader className="bg-muted/40 py-3">
          <CardTitle className="text-base">SkillOpt · {SKILL_NAME_KEYWORD()}</CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">e{EPOCHS.at(-1)!.index}</Badge>
            <span>val&nbsp;</span>
            <span className="font-mono font-semibold text-foreground">
              {EPOCHS.at(-1)!.validationScore.toFixed(1)}
            </span>
            <span className="ml-auto">{decisions} decided</span>
          </div>
        </CardHeader>
      </Card>

      <div className="flex-1 space-y-3 overflow-auto">
        {PROPOSALS.map((p) => {
          const status = local[p.id] ?? p.status;
          const delta = p.validationAfter - p.validationBefore;
          return (
            <Card
              key={p.id}
              className={cn(
                'border-l-4 transition-opacity',
                status === 'accepted' && 'border-l-emerald-500',
                status === 'rejected' && 'border-l-rose-500',
                status === 'pending' && 'border-l-amber-500',
                local[p.id] && 'opacity-70',
              )}
            >
              <CardContent className="space-y-2 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-muted-foreground">
                    e{p.epoch} · {p.kind} · {p.id}
                  </span>
                  <Badge
                    variant={
                      status === 'accepted'
                        ? 'default'
                        : status === 'rejected'
                          ? 'destructive'
                          : 'secondary'
                    }
                  >
                    {status}
                  </Badge>
                </div>
                <p className="text-sm font-medium">{p.failurePattern}</p>
                <p className="text-xs text-muted-foreground">{p.reason}</p>
                <details className="rounded-md bg-muted/40 px-2 py-1 text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    Proposed diff ({p.diff.length} {p.diff.length === 1 ? 'line' : 'lines'})
                  </summary>
                  <div className="mt-1 space-y-0.5 font-mono text-[11px]">
                    {p.diff.map((line, i) => (
                      <div
                        key={i}
                        className={cn(
                          line.kind === '+' && 'text-emerald-700 dark:text-emerald-300',
                          line.kind === '-' && 'text-rose-700 dark:text-rose-300',
                        )}
                      >
                        <span className="mr-2 text-muted-foreground">{line.kind}</span>
                        {line.text}
                      </div>
                    ))}
                  </div>
                </details>
                <div className="flex items-center justify-between text-xs">
                  <span>
                    validation{' '}
                    <span className="font-mono">
                      {p.validationBefore.toFixed(1)} → {p.validationAfter.toFixed(1)}
                    </span>
                    <span
                      className={cn(
                        'ml-2 font-semibold',
                        delta >= 0 ? 'text-emerald-600' : 'text-rose-600',
                      )}
                    >
                      ({delta >= 0 ? '+' : ''}
                      {delta.toFixed(1)})
                    </span>
                  </span>
                  {!local[p.id] && status === 'pending' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setLocal((m) => ({ ...m, [p.id]: 'rejected' }))}
                      >
                        Reject
                      </Button>
                      <Button size="sm" onClick={() => setLocal((m) => ({ ...m, [p.id]: 'accepted' }))}>
                        Accept
                      </Button>
                    </div>
                  )}
                  {local[p.id] && (
                    <span className="text-xs text-muted-foreground italic">
                      you decided · {local[p.id]}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <details className="rounded-md border bg-muted/40 p-3 text-xs">
        <summary className="cursor-pointer text-muted-foreground">
          best_skill.md (current skill)
        </summary>
        <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
          {CURRENT_SKILL_SNIPPET}
        </pre>
        <pre className="mt-2 whitespace-pre-wrap rounded bg-amber-500/10 p-2 font-mono text-[11px] leading-relaxed">
          {SLOW_UPDATE_BLOCK.join('\n')}
        </pre>
      </details>
    </div>
  );
}

function SKILL_NAME_KEYWORD() {
  return 'codebuff-loop-best-skill.md';
}
