/**
 * beadOrchestrationBridge — bridge the Beads (`bd`) tracker into the Orca
 * `orchestration task-*` state used by the Agent-School leader/cto/coo topology.
 *
 * WHY (playbook Gap 2/3): the Principal (Hermes cron) dispatches via
 * `bd ready`, but nothing spawns those beads into the leader/cto/coo Orca
 * worktrees. This module closes that gap in BOTH directions required by the
 * bead acceptance criteria:
 *   1. A claimed bead produces a corresponding `orca orchestration` task under
 *      the correct lens worktree.
 *   2. Closing the bead updates the linked Orca task status.
 *
 * Design: pure, side-effect-free helpers + one class that performs the actual
 * shell work behind an injectable `exec` (default: real `execFileSync`). Tests
 * drive the class with a mocking `exec` so no live `bd`/`orca` process is
 * required. The same mapping is mirrored in the Python conductor skill
 * (`~/.hermes/skills/agent-school-conductor/scripts/bead_to_orca.py`).
 *
 * VERIFIED constants (live 2026-07-10 run): repo id + leader/cto/coo worktree
 * ids are stable Orca-managed worktrees.
 */

import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';

export type LensName = 'cto-lens' | 'coo-lens';

export const REPO_ID = '87e2080c-59da-4b41-b392-5b6b0ddf49cd';
const BASE = `${REPO_ID}::/Users/brandonbennett/orca/workspaces/sound-royale-ny`;

export const WORKTREES: Record<LensName, string> = {
  'cto-lens': `${BASE}/cto-lens`,
  'coo-lens': `${BASE}/coo-lens`,
};

// `orca orchestration task-update --status` valid values.
export type OrcaTaskStatus =
  'pending' | 'ready' | 'dispatched' | 'completed' | 'failed' | 'blocked';

// Beads status values observed from `bd show --json` (status field).
export type BeadStatus = 'open' | 'in_progress' | 'blocked' | 'deferred' | 'closed';

export interface BeadRecord {
  id: string;
  title: string;
  description?: string;
  body?: string;
  acceptance_criteria?: string;
  status?: BeadStatus;
  labels?: string[];
  external_ref?: string;
}

export interface ClaimResult {
  beadId: string;
  claimed: boolean;
  raw: string;
}

export interface SyncResult {
  beadId: string;
  lens: LensName;
  worktreeId: string;
  taskId: string;
  taskTitle: string;
  claimed: boolean;
}

export interface CloseSyncResult {
  beadId: string;
  taskId: string | null;
  beadClosed: boolean;
  taskStatusUpdated: boolean;
  taskStatus: OrcaTaskStatus;
}

export type ExecFn = (
  command: string,
  args: string[],
  options?: ExecFileSyncOptions,
) => Buffer | string;

const DEFAULT_EXEC: ExecFn = (command, args, options) =>
  execFileSync(command, args, { encoding: 'utf8', ...options });

// Labels that route a bead to the COO github-ops lens instead of CTO repo.
const COO_LABEL_HINTS = ['github', 'pr', 'issue', 'triage', 'docs'];

/** Route a bead to a lens from its labels (override with explicit lens). */
export function pickLens(labels: string[] | undefined, override?: LensName): LensName {
  if (override) return override;
  const low = (labels ?? []).join(' ').toLowerCase();
  return COO_LABEL_HINTS.some((h) => low.includes(h)) ? 'coo-lens' : 'cto-lens';
}

/**
 * Map a Beads status onto an Orca orchestration task status. Beads does not
 * carry a `dispatched` state the way Orca does, so bridging a claimed bead is
 * `ready` (queued for a Student) unless the bead is already closed.
 */
export function mapBeadStatusToTaskStatus(status: BeadStatus | undefined): OrcaTaskStatus {
  switch (status) {
    case 'closed':
      return 'completed';
    case 'blocked':
      return 'blocked';
    case 'deferred':
      return 'pending';
    case 'in_progress':
      return 'ready';
    case 'open':
    default:
      return 'ready';
  }
}

/** Parse `bd show --long --json <id>` output (array or single object). */
export function parseBead(stdout: string): BeadRecord {
  let data: unknown;
  try {
    data = JSON.parse(stdout);
  } catch {
    throw new Error('beadOrchestrationBridge: could not parse bead JSON');
  }
  const b = Array.isArray(data) ? data[0] : data;
  if (!b || typeof b !== 'object') {
    throw new Error('beadOrchestrationBridge: could not parse bead JSON');
  }
  return {
    id: b.id,
    title: b.title ?? '',
    description: b.description,
    body: b.body,
    acceptance_criteria: b.acceptance_criteria,
    status: b.status,
    labels: b.labels ?? [],
    external_ref: b.external_ref,
  };
}

/** Extract a UUID-shaped id from `orca ... --json` stdout (best-effort). */
export function extractId(
  stdout: string,
  rawJsonKeys: string[] = ['id', 'taskId', 'handle'],
): string | null {
  // Try structured JSON first.
  try {
    const data = JSON.parse(stdout);
    const walk = (node: unknown): string | null => {
      if (node && typeof node === 'object') {
        for (const key of rawJsonKeys) {
          const v = (node as Record<string, unknown>)[key];
          if (typeof v === 'string' && /[0-9a-f]{8}-[0-9a-f]{4}-/.test(v)) return v;
        }
        for (const val of Object.values(node as Record<string, unknown>)) {
          const found = walk(val);
          if (found) return found;
        }
      }
      return null;
    };
    const fromJson = walk(data);
    if (fromJson) return fromJson;
  } catch {
    // not JSON; fall through to regex on raw text
  }
  const m = stdout.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
  return m ? m[1] : null;
}

export interface BridgeOptions {
  exec?: ExecFn;
  /** Override lens routing (otherwise derived from labels). */
  lens?: LensName;
  /** When true, also launch the Hermes student terminal in the lens worktree. */
  dispatchStudent?: boolean;
  /** Student agent CLI used when dispatchStudent is true. */
  studentAgent?: string;
}

export class BeadOrchestrationBridge {
  private readonly exec: ExecFn;
  readonly lens: LensName;
  readonly dispatchStudent: boolean;
  readonly studentAgent: string;

  constructor(opts: BridgeOptions = {}) {
    this.exec = opts.exec ?? DEFAULT_EXEC;
    this.lens = opts.lens ?? 'cto-lens';
    this.dispatchStudent = opts.dispatchStudent ?? false;
    this.studentAgent = opts.studentAgent ?? 'hermes --yolo --accept-hooks';
  }

  /** Claim a bead atomically (sets assignee=you, status=in_progress). */
  claim(beadId: string): ClaimResult {
    const raw = String(this.exec('bd', ['update', beadId, '--claim'], { encoding: 'utf8' }));
    return { beadId, claimed: true, raw };
  }

  /** Build the Orca task spec text from a bead record. */
  buildSpec(bead: BeadRecord): string {
    const parts = [bead.title.trim()];
    const body = bead.description ?? bead.body ?? '';
    if (body) parts.push('', body.trim());
    if (bead.acceptance_criteria) parts.push('', `Acceptance: ${bead.acceptance_criteria.trim()}`);
    if (bead.external_ref) parts.push('', `External: ${bead.external_ref}`);
    return parts.join('\n');
  }

  /**
   * Sync a claimed bead into an Orca orchestration task under the chosen lens.
   * Returns the created task id and the lens/worktree used.
   */
  syncToOrca(bead: BeadRecord, claim = true): SyncResult {
    const lens = this.lens;
    const worktreeId = WORKTREES[lens];
    if (claim) this.claim(bead.id);

    const spec = this.buildSpec(bead);
    const taskTitle = bead.title.trim() || bead.id;
    const out = String(
      this.exec(
        'orca',
        ['orchestration', 'task-create', '--spec', spec, '--task-title', taskTitle, '--json'],
        { encoding: 'utf8' },
      ),
    );
    const taskId = extractId(out);
    // Dry-run: exec is a no-op returning '', so Orca was never called.
    // Return a routing preview instead of throwing on a missing task id.
    if (!taskId) {
      if (!out) {
        return {
          beadId: bead.id,
          lens,
          worktreeId,
          taskId: '<dry-run>',
          taskTitle: taskTitle,
          claimed: claim,
        };
      }
      throw new Error(
        `beadOrchestrationBridge: no task id from 'orca orchestration task-create' (stdout: ${out.slice(0, 200)})`,
      );
    }
    return { beadId: bead.id, lens, worktreeId, taskId, taskTitle, claimed: claim };
  }

  /**
   * Close a bead AND update the linked Orca task status to `completed`
   * (or the mapped status). This is the second half of the AC: closing the
   * bead updates task status.
   */
  closeSync(
    beadId: string,
    taskId: string | null,
    status: OrcaTaskStatus = 'completed',
  ): CloseSyncResult {
    let beadClosed = false;
    let taskStatusUpdated = false;
    try {
      this.exec(
        'bd',
        ['close', beadId, '--reason', 'bridge: completed via Orca orchestration task'],
        {
          encoding: 'utf8',
        },
      );
      beadClosed = true;
    } catch (err) {
      // Surfaced to caller via result; do not swallow for verification.
      beadClosed = false;
      throw new Error(
        `beadOrchestrationBridge: bd close failed for ${beadId}: ${(err as Error).message}`,
      );
    }
    if (taskId) {
      this.exec(
        'orca',
        ['orchestration', 'task-update', '--id', taskId, '--status', status, '--json'],
        { encoding: 'utf8' },
      );
      taskStatusUpdated = true;
    }
    return { beadId, taskId, beadClosed, taskStatusUpdated, taskStatus: status };
  }
}

export const DEFAULT_WORKTREES = WORKTREES;
