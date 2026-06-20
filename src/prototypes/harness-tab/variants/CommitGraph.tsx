// THROWAWAY PROTOTYPE — Variant B: Commit Graph (git-log style).
// Horizontal swimlanes per epoch. Each proposal is a commit node positioned
// by validation-score delta. Hover/click reveals the failure pattern.
// Encourages a "history of evolution" reading rather than "queue of pending work".

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { EPOCHS, PROPOSALS, Proposal } from '../data';

function symbolFor(p: Proposal) {
  if (p.status === 'accepted') return '●';
  if (p.status === 'rejected') return '✗';
  return '◐';
}

function colorFor(p: Proposal) {
  if (p.status === 'accepted') return 'text-emerald-600 dark:text-emerald-400';
  if (p.status === 'rejected') return 'text-rose-600 dark:text-rose-400';
  return 'text-amber-600 dark:text-amber-400';
}

export function CommitGraph() {
  const [focus, setFocus] = useState<string | null>(null);
  const maxDelta = Math.max(
    ...PROPOSALS.map((p) => Math.abs(p.validationAfter - p.validationBefore)),
  );

  return (
    <div className="grid h-full grid-rows-[auto_1fr_auto] gap-3 p-4">
      <Card>
        <CardHeader className="bg-muted/40 py-3">
          <CardTitle className="text-sm">SkillOpt branch · {PROPOSALS.length} proposals</CardTitle>
          <p className="text-xs text-muted-foreground">
            Time flows left → right. Node vertical offset = validation-score delta. Read the
            shape, not the text.
          </p>
        </CardHeader>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="h-full p-0">
          <svg viewBox="0 0 1000 360" className="h-full w-full" preserveAspectRatio="none">
            {/* epoch swimlanes */}
            {EPOCHS.map((e, idx) => {
              const y = 60 + idx * 70;
              return (
                <g key={e.index}>
                  <line
                    x1={40}
                    x2={980}
                    y1={y}
                    y2={y}
                    stroke="hsl(var(--border))"
                    strokeDasharray="2 2"
                  />
                  <text x={20} y={y + 4} fontSize={10} fill="hsl(var(--muted-foreground))">
                    e{e.index}
                  </text>
                  <text
                    x={20}
                    y={y + 18}
                    fontSize={9}
                    fill="hsl(var(--muted-foreground))"
                  >
                    v{e.validationScore.toFixed(1)}
                  </text>
                </g>
              );
            })}

            {/* epoch baselines (best score so far) */}
            {EPOCHS.map((e, idx) => {
              const y = 60 + idx * 70;
              return (
                <line
                  key={`base-${e.index}`}
                  x1={40}
                  x2={980}
                  y1={y - 16}
                  y2={y - 16}
                  stroke="hsl(var(--primary))"
                  strokeOpacity={0.25}
                />
              );
            })}

            {/* proposal nodes */}
            {PROPOSALS.map((p, i) => {
              const epochY = 60 + p.epoch * 70;
              const delta = p.validationAfter - p.validationBefore;
              const x = 80 + i * 110;
              const nodeY = epochY - Math.sign(delta) * Math.min(28, (Math.abs(delta) / maxDelta) * 28);
              return (
                <g
                  key={p.id}
                  className="cursor-pointer"
                  onMouseEnter={() => setFocus(p.id)}
                  onMouseLeave={() => setFocus((f) => (f === p.id ? null : f))}
                >
                  <line
                    x1={x}
                    x2={x}
                    y1={epochY}
                    y2={nodeY}
                    stroke="hsl(var(--border))"
                  />
                  <circle
                    cx={x}
                    cy={nodeY}
                    r={focus === p.id ? 9 : 6}
                    className={cn(colorFor(p))}
                    fill="currentColor"
                  />
                  <text
                    x={x}
                    y={nodeY - 12}
                    fontSize={9}
                    textAnchor="middle"
                    className={cn(colorFor(p), 'font-mono')}
                  >
                    {symbolFor(p)} {delta > 0 ? '+' : ''}
                    {delta.toFixed(1)}
                  </text>
                </g>
              );
            })}
          </svg>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid grid-cols-4 gap-3 p-3 text-xs">
          {PROPOSALS.map((p) => (
            <div
              key={p.id}
              className={cn(
                'rounded-md border p-2 transition-colors',
                focus === p.id && 'border-primary bg-primary/5',
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {p.id} · e{p.epoch}
                </span>
                <Badge
                  variant={
                    p.status === 'accepted'
                      ? 'default'
                      : p.status === 'rejected'
                        ? 'destructive'
                        : 'secondary'
                  }
                  className="px-1.5 py-0 text-[10px]"
                >
                  {p.kind}
                </Badge>
              </div>
              <p className="line-clamp-2 text-foreground/80">{p.failurePattern}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
