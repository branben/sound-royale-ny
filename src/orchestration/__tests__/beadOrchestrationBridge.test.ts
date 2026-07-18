import { describe, expect, it, vi } from 'vitest';
import {
  BeadOrchestrationBridge,
  pickLens,
  parseBead,
  mapBeadStatusToTaskStatus,
  extractId,
  WORKTREES,
  type BeadRecord,
  type ExecFn,
} from '../beadOrchestrationBridge';

const SAMPLE_BEAD_JSON = JSON.stringify([
  {
    id: 'sound-royale-ny-vbv',
    title: 'Bridge Beads tracker into Orca orchestration task state',
    description: 'Gap 2/3: no bridge bd -> orca orchestration task-*',
    acceptance_criteria:
      'A claimed bead produces a corresponding orca task; closing updates status.',
    status: 'in_progress',
    labels: ['GAIA', 'production-readiness', 'ready-for-agent'],
    external_ref: 'kb:school-core',
  },
]);

/** Build a mocking exec that records calls and returns canned JSON. */
const TASK_UUID = '11111111-2222-3333-4444-555555555555';
function makeExec() {
  const calls: Array<{ command: string; args: string[] }> = [];
  const exec: ExecFn = (command: string, args: string[]) => {
    calls.push({ command, args: [...args] });
    if (command === 'bd') {
      if (args[0] === 'close') return Buffer.from('closed');
      if (args[0] === 'update' && args.includes('--claim')) return Buffer.from('claimed');
      if (args[0] === 'show') return Buffer.from(SAMPLE_BEAD_JSON);
    }
    if (command === 'orca') {
      if (args.includes('task-create'))
        return Buffer.from(JSON.stringify({ id: TASK_UUID, ok: true }));
      if (args.includes('task-update'))
        return Buffer.from(JSON.stringify({ id: TASK_UUID, status: 'completed' }));
    }
    return Buffer.from('');
  };
  return { exec, calls };
}

describe('pickLens', () => {
  it('routes github/pr/issue/triage/docs labels to coo-lens', () => {
    expect(pickLens(['github-ops'])).toBe('coo-lens');
    expect(pickLens(['bug', 'triage'])).toBe('coo-lens');
    expect(pickLens(['docs'])).toBe('coo-lens');
  });
  it('routes code/refactor labels to cto-lens', () => {
    expect(pickLens(['bug/regression'])).toBe('cto-lens');
    expect(pickLens(['feature'])).toBe('cto-lens');
    expect(pickLens([])).toBe('cto-lens');
  });
  it('honors explicit override', () => {
    expect(pickLens(['docs'], 'cto-lens')).toBe('cto-lens');
    expect(pickLens([], 'coo-lens')).toBe('coo-lens');
  });
});

describe('mapBeadStatusToTaskStatus', () => {
  it('maps closed -> completed and blocked -> blocked', () => {
    expect(mapBeadStatusToTaskStatus('closed')).toBe('completed');
    expect(mapBeadStatusToTaskStatus('blocked')).toBe('blocked');
    expect(mapBeadStatusToTaskStatus('deferred')).toBe('pending');
  });
  it('maps open/in_progress/unknown -> ready (queued for Student)', () => {
    expect(mapBeadStatusToTaskStatus('open')).toBe('ready');
    expect(mapBeadStatusToTaskStatus('in_progress')).toBe('ready');
    expect(mapBeadStatusToTaskStatus(undefined)).toBe('ready');
  });
});

describe('parseBead', () => {
  it('parses an array-wrapped bd JSON record', () => {
    const b: BeadRecord = parseBead(SAMPLE_BEAD_JSON);
    expect(b.id).toBe('sound-royale-ny-vbv');
    expect(b.title).toContain('Bridge Beads');
    expect(b.labels).toContain('GAIA');
    expect(b.acceptance_criteria).toContain('closing updates status');
  });
  it('throws on unparseable output', () => {
    expect(() => parseBead('not json')).toThrow(/could not parse bead JSON/);
  });
});

describe('extractId', () => {
  it('pulls an id from JSON with nested result', () => {
    expect(
      extractId(
        JSON.stringify({ ok: true, result: { id: 'abcdef01-1234-5678-9abc-def012345678' } }),
      ),
    ).toBe('abcdef01-1234-5678-9abc-def012345678');
  });
  it('falls back to regex on raw text', () => {
    expect(extractId('created task abcdef01-1234-5678-9abc-def012345678 ok')).toBe(
      'abcdef01-1234-5678-9abc-def012345678',
    );
  });
  it('returns null when no uuid present', () => {
    expect(extractId('no id here')).toBeNull();
  });
});

describe('BeadOrchestrationBridge.syncToOrca (AC half 1)', () => {
  it('claims the bead, creates an orca task under the routed lens worktree, and returns ids', () => {
    const { exec, calls } = makeExec();
    const bridge = new BeadOrchestrationBridge({ exec, lens: 'cto-lens' });
    const bead = parseBead(SAMPLE_BEAD_JSON);

    const res = bridge.syncToOrca(bead, true);

    // claim ran
    expect(calls.find((c) => c.command === 'bd' && c.args.includes('--claim'))).toBeTruthy();
    // task created with spec containing title + acceptance
    const createCall = calls.find((c) => c.command === 'orca' && c.args.includes('task-create'));
    expect(createCall).toBeTruthy();
    const specIdx = createCall!.args.indexOf('--spec');
    expect(createCall!.args[specIdx + 1]).toContain('Bridge Beads');
    expect(createCall!.args[specIdx + 1]).toContain('closing updates status');
    // routed to cto-lens worktree constant
    expect(res.worktreeId).toBe(WORKTREES['cto-lens']);
    expect(res.taskId).toBe(TASK_UUID);
    expect(res.lens).toBe('cto-lens');
  });

  it('honors coo-lens override', () => {
    const { exec } = makeExec();
    const bridge = new BeadOrchestrationBridge({ exec, lens: 'coo-lens' });
    const res = bridge.syncToOrca(parseBead(SAMPLE_BEAD_JSON), false);
    expect(res.lens).toBe('coo-lens');
    expect(res.worktreeId).toBe(WORKTREES['coo-lens']);
  });

  it('throws when orca returns no task id', () => {
    const exec: ExecFn = (command, args) => {
      if (command === 'orca' && args.includes('task-create')) return Buffer.from('{}');
      return Buffer.from('');
    };
    const bridge = new BeadOrchestrationBridge({ exec });
    expect(() => bridge.syncToOrca(parseBead(SAMPLE_BEAD_JSON), false)).toThrow(/no task id/);
  });
});

describe('BeadOrchestrationBridge.closeSync (AC half 2)', () => {
  it('closes the bead and updates the linked orca task status to completed', () => {
    const { exec, calls } = makeExec();
    const bridge = new BeadOrchestrationBridge({ exec });

    const res = bridge.closeSync('sound-royale-ny-vbv', 'task-1234-uuid', 'completed');

    expect(res.beadClosed).toBe(true);
    expect(res.taskStatusUpdated).toBe(true);
    expect(res.taskStatus).toBe('completed');
    const closeCall = calls.find((c) => c.command === 'bd' && c.args[0] === 'close');
    expect(closeCall).toBeTruthy();
    expect(closeCall!.args).toContain('sound-royale-ny-vbv');
    const updateCall = calls.find((c) => c.command === 'orca' && c.args.includes('task-update'));
    expect(updateCall).toBeTruthy();
    expect(updateCall!.args).toContain('--status');
    expect(updateCall!.args[updateCall!.args.indexOf('--status') + 1]).toBe('completed');
    expect(updateCall!.args[updateCall!.args.indexOf('--id') + 1]).toBe('task-1234-uuid');
  });

  it('skips task update when taskId is null but still closes the bead', () => {
    const { exec, calls } = makeExec();
    const bridge = new BeadOrchestrationBridge({ exec });
    const res = bridge.closeSync('sound-royale-ny-vbv', null, 'completed');
    expect(res.beadClosed).toBe(true);
    expect(res.taskStatusUpdated).toBe(false);
    expect(calls.find((c) => c.command === 'orca')).toBeFalsy();
  });

  it('propagates bd close failure instead of swallowing it', () => {
    const exec: ExecFn = (command, args) => {
      if (command === 'bd' && args[0] === 'close') {
        throw new Error('bd: gate unsatisfied');
      }
      return Buffer.from('');
    };
    const bridge = new BeadOrchestrationBridge({ exec });
    expect(() =>
      bridge.closeSync('sound-royale-ny-vbv', '99999999-9999-9999-9999-999999999999', 'completed'),
    ).toThrow(/bd close failed/);
  });
});
