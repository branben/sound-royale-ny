#!/usr/bin/env node
/**
 * CLI for the Beads <-> Orca orchestration bridge.
 *
 *   tsx src/orchestration/cli.ts sync   --bead <id> [--lens cto-lens|coo-lens] [--dispatch-student]
 *   tsx src/orchestration/cli.ts close  --bead <id> --task <taskId> [--status completed]
 *   tsx src/orchestration/cli.ts status --bead <id>            # show routing + current mapping
 *
 * DRY-RUN by default: pass --live to actually invoke bd/orca. (Under --live the
 * bridge execs the real binaries.) Reads bead via `bd show --long --json`.
 */
import { execFileSync } from 'node:child_process';
import {
  BeadOrchestrationBridge,
  pickLens,
  parseBead,
  mapBeadStatusToTaskStatus,
  extractId,
  type LensName,
} from './beadOrchestrationBridge';

type ExecFn = (
  command: string,
  args: string[],
  options?: { encoding?: BufferEncoding },
) => Buffer | string;

function usage(): string {
  return [
    'Usage:',
    '  bridge sync   --bead <id> [--lens cto-lens|coo-lens] [--dispatch-student] [--live]',
    '  bridge close  --bead <id> --task <taskId> [--status completed|failed|blocked] [--live]',
    '  bridge status --bead <id]',
  ].join('\n');
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function die(msg: string): never {
  process.stderr.write(`${msg}\n${usage()}\n`);
  process.exit(1);
}

function realExec(
  command: string,
  args: string[],
  options?: { encoding?: BufferEncoding },
): Buffer | string {
  return execFileSync(command, args, { encoding: 'utf8', ...(options as object) });
}

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const live = Boolean(args['live']);

  if (cmd === 'status') {
    const beadId = String(args['bead'] ?? '');
    if (!beadId) die('status requires --bead <id>');
    const out = String(execFileSync('bd', ['show', '--long', '--json', beadId], { encoding: 'utf8' }));
    const bead = parseBead(out);
    const lens = pickLens(bead.labels, args['lens'] as LensName | undefined);
    const taskStatus = mapBeadStatusToTaskStatus(bead.status);
    process.stdout.write(
      JSON.stringify(
        { beadId, title: bead.title, lens, taskStatus, labels: bead.labels, beadStatus: bead.status },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  if (cmd === 'sync') {
    const beadId = String(args['bead'] ?? '');
    if (!beadId) die('sync requires --bead <id>');
    if (!live) {
      process.stderr.write('[DRY-RUN] pass --live to actually create the Orca task. Routing preview:\n');
    }
    const exec = (live ? realExec : () => Buffer.from('')) as unknown as ExecFn;
    const bridge = new BeadOrchestrationBridge({
      exec,
      lens: args['lens'] as LensName | undefined,
      dispatchStudent: Boolean(args['dispatch-student']),
    });
    const out = String(execFileSync('bd', ['show', '--long', '--json', beadId], { encoding: 'utf8' }));
    const bead = parseBead(out);
    const res = bridge.syncToOrca(bead, live);
    process.stdout.write(
      `synced ${res.beadId} -> lens=${res.lens} worktree=${res.worktreeId} task=${res.taskId}\n`,
    );
    return;
  }

  if (cmd === 'close') {
    const beadId = String(args['bead'] ?? '');
    const taskId = args['task'] ? String(args['task']) : null;
    if (!beadId || !taskId) die('close requires --bead <id> --task <taskId>');
    const status = (args['status'] as string) || 'completed';
    if (!live) {
      process.stderr.write('[DRY-RUN] pass --live to actually close the bead + update the task.\n');
    }
    const exec = (live ? realExec : () => Buffer.from('')) as unknown as ExecFn;
    const bridge = new BeadOrchestrationBridge({ exec });
    const res = bridge.closeSync(beadId, taskId, status as never);
    process.stdout.write(
      `closed ${res.beadId} (beadClosed=${res.beadClosed}) -> task ${res.taskId} status=${res.taskStatus}\n`,
    );
    return;
  }

  die(`unknown command: ${cmd ?? '(none)'}`);
}

// Re-export helper for ad-hoc callers/tests.
export { extractId };

main();
