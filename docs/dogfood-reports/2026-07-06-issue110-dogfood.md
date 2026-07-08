```json
{
  "bead": "sound-royale-ny-afy",
  "task_id": "issue110",
  "ts": "2026-07-06T13:22:53Z",
  "worktree": "/Users/brandonbennett/sound-royale-ny",
  "hermes_terminal": "term_5cfd2748-61df-4b06-9a4f-b477d918b250",
  "bootstrap_exit_code": 0,
  "verify_exit_code": 1,
  "lane_count": 5,
  "passes": 2,
  "fails": 1,
  "skips": 2,
  "lanes": [
    {
      "check": "pass",
      "status": "types",
      "tail": [
        "$ npx tsc --noEmit"
      ]
    },
    {
      "check": "pass",
      "status": "lint",
      "tail": [
        "$ npx tsc --noEmit && eslint ."
      ]
    },
    {
      "check": "skip",
      "status": "test",
      "tail": [
        "vitest 240/240 green in earlier direct run; this lane skipped to avoid double-run cost"
      ]
    },
    {
      "check": "fail",
      "status": "test:backend",
      "tail": [
        "$ cd backend && python manage.py test",
        "sh: python: command not found",
        "fix: use python3.11 or update package.json runner"
      ]
    },
    {
      "check": "skip",
      "status": "test:e2e",
      "tail": [
        "timeout 180s",
        "precondition: requires live backend on 8000 + frontend on 8081"
      ]
    }
  ],
  "next_steps": [
    "patch package.json test:backend to python3.11",
    "restart bounded verify lane after port availability confirmed",
    "attach dogfood report to issue #110 once e2e lane passes"
  ]
}
```
