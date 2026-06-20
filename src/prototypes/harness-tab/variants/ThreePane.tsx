// THROWAWAY PROTOTYPE — Variant A: Three-pane (Stream / Diff / History).
// Left rail lists pending and recent proposals, center is the diff inspector
// for the currently-selected proposal, right rail shows epoch history +
// transfer yields + slow-update field.

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
  TRANSFER_YIELD,
} from '../data';

function statusToVariant(status: Proposal['status']): 'default' | 'secondary' | 'destructive' {
  if (status === 'accepted') return 'default';
  if (status === 'rejected') return 'destructive';
  return 'secondary';
}

function deltaLabel(b: number, a: number, status: Proposal['status']) {
  if (status === 'pending') return `+${(a - b).toFixed(1)}?`;
  if (status === 'rejected') return `${(a - b).toFixed(1)} ✗`;
  return `+${(a - b).toFixed(1)} ✓`;
}

export function ThreePane() {
  const [selectedId, setSelectedId] = useState(PROPOSALS.find((p) => p.status === 'pending')!.id);
  const selected = PROPOSALS.find((p) => p.id === selectedId)!;
  const pendingCount = PROPOSALS.filter((p) => p.status === 'pending').length;

  return (
    <div className="grid h-full grid-cols-12 gap-3 p-4">
      {/* LEFT — proposal stream */}
      <Card className="col-span-3 overflow-hidden">
        <CardHeader className="border-b bg-muted/40 py-3">
          <CardTitle className="text-sm">Stream</CardTitle>
          <p className="text-xs text-muted-foreground">
            {pendingCount} pending · {PROPOSALS.filter((p) => p.status === 'accepted').length}{' '}
            accepted · {PROPOSALS.filter((p) => p.status === 'rejected').length} rejected
          </p>
        </CardHeader>
        <CardContent className="space-y-2 p-3">
          {PROPOSALS.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={cn(
                'w-full rounded-md border p-2 text-left text-xs transition-colors',
                selectedId === p.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/40',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground">
                  e{p.epoch} · {p.kind}
                </span>
                <Badge variant={statusToVariant(p.status)} className="px-1.5 py-0 text-[10px]">
                  {deltaLabel(p.validationBefore, p.validationAfter, p.status)}
                </Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-foreground/90">{p.failurePattern}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* CENTER — diff inspector */}
      <Card className="col-span-6 overflow-hidden">
        <CardHeader className="border-b bg-muted/40 py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Diff · {selected.id}</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                confidence&nbsp;
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'mx-0.5 inline-block h-2 w-2 rounded-full',
                      i < Math.ceil(selected.reflectionBatchSize / 5)
                        ? 'bg-primary'
                        : 'bg-muted',
                    )}
                  />
                ))}
              </span>
              <Badge variant={statusToVariant(selected.status)}>{selected.status}</Badge>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {selected.reason} <span className="italic">— impact:</span> {selected.impact}
          </p>
        </CardHeader>
        <CardContent className="overflow-auto p-0">
          <pre className="px-3 py-1 text-[11px] text-muted-foreground">{'```md'}</pre>
          {selected.diff.map((line, i) => (
            <div
              key={i}
              className={cn(
                'flex px-3 py-0.5 font-mono text-xs leading-relaxed',
                line.kind === '+' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                line.kind === '-' && 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
                line.kind === '~' && 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
              )}
            >
              <span className="mr-3 w-3 select-none text-muted-foreground">{line.kind}</span>
              <span>{line.text}</span>
            </div>
          ))}
          <pre className="px-3 py-1 text-[11px] text-muted-foreground">{'```'}</pre>
          <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-2 text-xs">
            <span>
              validation:&nbsp;
              <span className="font-mono">{selected.validationBefore.toFixed(1)}</span>
              <span className="mx-1 text-muted-foreground">→</span>
              <span className="font-mono font-semibold">
                {selected.validationAfter.toFixed(1)}
              </span>
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline">
                Defer
              </Button>
              <Button size="sm" variant="destructive">
                Reject
              </Button>
              <Button size="sm">Accept</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* RIGHT — history + transfer + slow-update */}
      <Card className="col-span-3 overflow-hidden">
        <CardHeader className="border-b bg-muted/40 py-3">
          <CardTitle className="text-sm">History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-3 text-xs">
          <div>
            <p className="mb-1 text-muted-foreground">Validation per epoch</p>
            <div className="flex h-12 items-end gap-1.5">
              {EPOCHS.map((e) => (
                <div key={e.index} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-sm bg-primary"
                    style={{ height: `${(e.validationScore / 100) * 100}%` }}
                    title={`epoch ${e.index}: ${e.validationScore}`}
                  />
                  <span className="text-[10px] text-muted-foreground">e{e.index}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-muted-foreground">Transfer yield</p>
            <ul className="space-y-0.5">
              <li>
                GPT-5.4 → mini:{' '}
                <span className="font-mono">+{TRANSFER_YIELD.crossModel['gpt-5.4-mini']}</span>
              </li>
              <li>
                GPT-5.4 → nano:{' '}
                <span className="font-mono">+{TRANSFER_YIELD.crossModel['gpt-5.4-nano']}</span>
              </li>
              <li>
                Codex→Claude Code:{' '}
                <span className="font-mono">
                  +{TRANSFER_YIELD.crossHarness['codex→claude-code']}
                </span>
              </li>
            </ul>
          </div>
          <div className="rounded-md border bg-muted/40 p-2">
            <p className="mb-1 flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Slow-update field · protected
            </p>
            <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed">
              {SLOW_UPDATE_BLOCK.join('\n')}
            </pre>
          </div>
          <details className="rounded-md border p-2">
            <summary className="cursor-pointer text-[11px] text-muted-foreground">
              best_skill.md (current)
            </summary>
            <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px] leading-relaxed">
              {CURRENT_SKILL_SNIPPET}
            </pre>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
