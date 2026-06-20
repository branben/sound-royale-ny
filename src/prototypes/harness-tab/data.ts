// THROWAWAY PROTOTYPE DATA — DO NOT IMPORT FROM PRODUCTION CODE.
//
// Mocks the output of a SkillOpt-style loop:
//   - A frozen, editable skill document (best_skill.md)
//   - A stream of patch proposals (add/delete/replace)
//   - Each proposal carries validation-score evidence from a held-out gate
//   - Epochs accumulate and the slow-update field holds a protected block
//   - A transfer yield indicator summarises cross-model / cross-harness reuse

export type ProposalKind = 'add' | 'delete' | 'replace';
export type ProposalStatus = 'pending' | 'accepted' | 'rejected';

export interface ProposalDiffLine {
  kind: '+' | '-' | ' ' | '~';
  text: string;
}

export interface Proposal {
  id: string;
  epoch: number;
  kind: ProposalKind;
  status: ProposalStatus;
  /** Validation score the *current* skill achieves on the held-out split. */
  validationBefore: number;
  /** Validation score the *candidate* skill achieves on the held-out split. */
  validationAfter: number;
  /** Reflection minibatch size — drives a confidence dot rating in the UI. */
  reflectionBatchSize: number;
  /** Free-form reason the optimizer proposed this edit. */
  reason: string;
  /** Mini-batch failure pattern that motivated the edit. */
  failurePattern: string;
  /** Compact diff representation. */
  diff: ProposalDiffLine[];
  /** One-line summary of expected downstream effect. */
  impact: string;
}

export interface EpochStats {
  index: number;
  accepted: number;
  rejected: number;
  validationScore: number;
  /** Whether the slow-update field was extended this epoch. */
  slowUpdateExtended: boolean;
}

export const SKILL_NAME = 'codebuff-loop-best-skill.md';

export const CURRENT_SKILL_SNIPPET = `# Codebuff Loop — Best Skill

## Tool policies
- Prefer \`ripgrep\` over \`grep\` for any user-facing search.
- For file discovery, run \`fd\` with explicit extensions; never \`find\`.
- Read at most one file before issuing a tool call that depends on its output.

## Output constraints
- Inline diffs only when <40 lines; otherwise reference paths.
- Always cite line numbers from the original file when quoting.

## Common failure modes
- Searching the repo when the answer is in dependency manifests.
- Quoting without line numbers.
`;

/** Protected slow-update field — long-horizon rules the optimizer maintains. */
export const SLOW_UPDATE_BLOCK = [
  'Long-horizon rules (epoch 4):',
  '- Always diff stdout before acting on it (avoid noise from progress bars).',
  '- When the user asks "find X", check package.json + README before repo-wide search.',
  '- Never spawn more than 3 parallel agents on a single user request unless the user',
  '  explicitly invokes /fanout.',
];

export const PROPOSALS: Proposal[] = [
  {
    id: 'p-001',
    epoch: 0,
    kind: 'add',
    status: 'accepted',
    validationBefore: 65.0,
    validationAfter: 71.2,
    reflectionBatchSize: 8,
    reason: 'grep appeared in 7/8 failure traces; ripgrep never appeared in success traces.',
    failurePattern: 'used grep on >500 files, took 12s, user abandoned',
    diff: [
      { kind: '+', text: '- Prefer `ripgrep` over `grep` for any user-facing search.' },
      { kind: '+', text: '- Never use `find`; use `fd` with explicit extensions.' },
    ],
    impact: 'Search time -87%, all matching traces successful',
  },
  {
    id: 'p-002',
    epoch: 0,
    kind: 'add',
    status: 'accepted',
    validationBefore: 71.2,
    validationAfter: 73.4,
    reflectionBatchSize: 4,
    reason: 'When the user asked "find X", agent searched the repo 4/4 times.',
    failurePattern: 'searched 800 files when package.json had the answer',
    diff: [
      { kind: '+', text: '- When the user asks "find X", inspect package.json + README.md first.' },
    ],
    impact: 'Skipped 5 redundant searches, +2.2 points',
  },
  {
    id: 'p-003',
    epoch: 1,
    kind: 'delete',
    status: 'rejected',
    validationBefore: 73.4,
    validationAfter: 69.1,
    reflectionBatchSize: 8,
    reason: 'Optimizer tried removing the line-number rule — caused regressions on OfficeQA.',
    failurePattern: 'none — speculative overfit',
    diff: [{ kind: '-', text: '- Always cite line numbers from the original file when quoting.' }],
    impact: 'REJECTED — drop on OfficeQA: 72.1 → 41.0',
  },
  {
    id: 'p-004',
    epoch: 1,
    kind: 'replace',
    status: 'pending',
    validationBefore: 73.4,
    validationAfter: 75.8,
    reflectionBatchSize: 16,
    reason: 'Diff length rule should be per-language: TypeScript tolerates larger diffs than YAML.',
    failurePattern: '40-line TSX component truncated into chat instead of being path-referenced',
    diff: [
      { kind: '-', text: '- Inline diffs only when <40 lines; otherwise reference paths.' },
      { kind: '+', text: '- Inline diffs only when <40 lines (typed languages) / <15 lines (YAML/JSON/MD).' },
    ],
    impact: 'Pending — expects +2.4 from better diff budgeting',
  },
  {
    id: 'p-005',
    epoch: 2,
    kind: 'add',
    status: 'pending',
    validationBefore: 73.4,
    validationAfter: 74.9,
    reflectionBatchSize: 12,
    reason: 'Output without diff prefix confused Codebuff viewer when quoting file patches.',
    failurePattern: 'output "applied 3 hunks" instead of "hunk 2: ..."',
    diff: [
      { kind: '+', text: '- When describing a multi-hunk patch, enumerate hunk indices.' },
    ],
    impact: 'Pending — small but cheap rule',
  },
  {
    id: 'p-006',
    epoch: 2,
    kind: 'add',
    status: 'pending',
    validationBefore: 73.4,
    validationAfter: 76.2,
    reflectionBatchSize: 24,
    reason: 'When stdout had carriage-return progress bars, downstream regexes consumed garbage.',
    failurePattern: 'carriage return from `npm test` swallowed by parser',
    diff: [
      { kind: '+', text: '- Always diff stdout before acting on it (avoid noise from progress bars).' },
    ],
    impact: 'Pending — high confidence, large reflection batch',
  },
];

export const EPOCHS: EpochStats[] = [
  { index: 0, accepted: 4, rejected: 1, validationScore: 73.4, slowUpdateExtended: true },
  { index: 1, accepted: 2, rejected: 3, validationScore: 75.1, slowUpdateExtended: false },
  { index: 2, accepted: 3, rejected: 2, validationScore: 76.2, slowUpdateExtended: true },
  { index: 3, accepted: 1, rejected: 4, validationScore: 78.3, slowUpdateExtended: false },
];

/** Cross-harness / cross-model transfer yield (from SkillOpt Table 4). */
export const TRANSFER_YIELD = {
  crossModel: { 'gpt-5.4-mini': 9.4, 'gpt-5.4-nano': 3.0 },
  crossHarness: { 'codex→claude-code': 59.7, 'claude-code→codex': 12.8 },
  crossBenchmark: { 'olympiadbench→omni-math': 3.7 },
};
