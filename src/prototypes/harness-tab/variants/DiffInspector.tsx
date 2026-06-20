// THROWAWAY PROTOTYPE — Variant D: Split-pane Diff Inspector (IDE-style).
// Full-bleed two-pane split: candidate skill (left) vs. proposed-with-edits
// (right). Footer carries the validation evidence + transfer yield + a single
// accept/reject decision row. Promotes a "read the code" reading.

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CURRENT_SKILL_SNIPPET,
  PROPOSALS,
  Proposal,
  TRANSFER_YIELD,
} from '../data';

function applyDiff(skill: string, p: Proposal): string {
  const lines = skill.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (p.diff.some((d) => d.kind === '-' && d.text.includes(line.replace(/^-\s*/, '')))) {
      // skip deleted lines
      continue;
    }
    out.push(line);
  }
  for (const d of p.diff) {
    if (d.kind === '+') out.push(d.text);
  }
  return out.join('\n');
}

export function DiffInspector() {
  const [selectedId, setSelectedId] = useState(PROPOSALS.find((p) => p.status === 'pending')!.id);
  const p = PROPOSALS.find((x) => x.id === selectedId)!;
  const candidate = applyDiff(CURRENT_SKILL_SNIPPET, p);
  const beforeLines = CURRENT_SKILL_SNIPPET.split('\n');
  const afterLines = candidate.split('\n');

  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between bg-muted/40 py-2">
          <div className="flex items-center gap-3">
            <CardTitle className="text-sm">best_skill.md</CardTitle>
            <Badge variant="secondary" className="font-mono">
              e{p.epoch}
            </Badge>
            <Badge>{p.kind}</Badge>
            <span className="text-xs text-muted-foreground">{p.id}</span>
          </div>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded border bg-background px-2 py-1 text-xs"
          >
            {PROPOSALS.map((q) => (
              <option key={q.id} value={q.id}>
                {q.id} · {q.status} · {q.kind}
              </option>
            ))}
          </select>
        </CardHeader>
      </Card>

      <Card className="flex-1 overflow-hidden">
        <CardContent className="grid h-full grid-cols-2 gap-0 p-0">
          {/* BEFORE */}
          <div className="border-r">
            <div className="border-b bg-muted/40 px-3 py-1 text-xs font-mono text-muted-foreground">
              current
            </div>
            <pre className="h-full overflow-auto px-3 py-2 font-mono text-xs leading-relaxed">
              {beforeLines.map((line, i) => (
                <div key={i} className="flex">
                  <span className="mr-3 w-6 select-none text-right text-muted-foreground/50">
                    {i + 1}
                  </span>
                  <span>{line}</span>
                </div>
              ))}
            </pre>
          </div>
          {/* AFTER */}
          <div>
            <div className="border-b bg-muted/40 px-3 py-1 text-xs font-mono text-muted-foreground">
              candidate
            </div>
            <pre className="h-full overflow-auto px-3 py-2 font-mono text-xs leading-relaxed">
              {afterLines.map((line, i) => {
                const wasAdded = p.diff.some((d) => d.kind === '+' && d.text === line);
                const wasDeleted = p.diff.some((d) => d.kind === '-' && d.text.includes(line));
                return (
                  <div
                    key={i}
                    className={cn(
                      'flex',
                      wasAdded &&
                        'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                      wasDeleted &&
                        'bg-rose-500/10 text-rose-700 dark:text-rose-300 line-through opacity-70',
                    )}
                  >
                    <span className="mr-3 w-6 select-none text-right text-muted-foreground/50">
                      {i + 1}
                    </span>
                    <span>{line}</span>
                  </div>
                );
              })}
            </pre>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid grid-cols-12 items-center gap-4 p-3 text-xs">
          <div className="col-span-3">
            <p className="text-muted-foreground">Validation (held-out)</p>
            <p className="font-mono text-base">
              {p.validationBefore.toFixed(1)}{' '}
              <span className="text-muted-foreground">→</span>{' '}
              <span
                className={cn(
                  'font-semibold',
                  p.validationAfter >= p.validationBefore
                    ? 'text-emerald-600'
                    : 'text-rose-600',
                )}
              >
                {p.validationAfter.toFixed(1)}
              </span>
            </p>
          </div>
          <div className="col-span-3">
            <p className="text-muted-foreground">Confidence</p>
            <p>
              {Array.from({ length: 5 }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    'mx-0.5 inline-block h-2 w-2 rounded-full',
                    i < Math.ceil(p.reflectionBatchSize / 5)
                      ? 'bg-primary'
                      : 'bg-muted',
                  )}
                />
              ))}
              <span className="ml-2 text-[10px] text-muted-foreground">
                batch={p.reflectionBatchSize}
              </span>
            </p>
          </div>
          <div className="col-span-3">
            <p className="text-muted-foreground">Transfer yield (cell)</p>
            <p className="font-mono">
              +{TRANSFER_YIELD.crossModel['gpt-5.4-mini']} on GPT-5.4-mini
            </p>
          </div>
          <div className="col-span-3 flex justify-end gap-2">
            <Button size="sm" variant="outline">
              Defer
            </Button>
            <Button size="sm" variant="destructive">
              Reject
            </Button>
            <Button size="sm">Accept</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
