# PR Hardening - Preventing CI/GAIA Failures

## Problem

PR #26 had multiple issues that caused CI failures:
1. **integrity_scanner.py** - Added `--scan-beads` flag to CI but script didn't support it
2. **Playwright tests** - No server startup steps before running E2E tests
3. **config.yaml** - Duplicate `sync-branch` key (YAML parsing issue)
4. **issues.jsonl** - PII (real names/emails) in git-tracked beads

## Prevention Checklist

Before submitting any PR:

### 1. CI Script Changes

- [ ] If adding CLI flags to CI, verify the script supports them
- [ ] Run the script locally with `--help` to verify arguments
- [ ] Test the full CI command locally before committing
- [ ] Example: `python backend/gaia/integrity_scanner.py --ci --json --scan-beads`

### 2. E2E Test Jobs

- [ ] Add server startup steps before `npx playwright test`
- [ ] Backend: `python backend/manage.py runserver &`
- [ ] Frontend: `npm run dev &`
- [ ] Wait for servers: `npx wait-on http://localhost:8000 http://localhost:5173`
- [ ] Add Python setup if backend needed: `actions/setup-python@v5`

### 3. YAML Configuration

- [ ] Validate YAML: `yamllint .beads/config.yaml`
- [ ] Check for duplicate keys (last one wins, but confusing)
- [ ] Use unique keys only

### 4. Beads/PII

- [ ] Search for `@` in `.beads/issues.jsonl` - should return 0
- [ ] Use role-based IDs: `sound_royale_ny/mayor`, `sound_royale_ny/refinery`
- [ ] Never commit real names: "Brandon Bennett" → "sound_royale_ny/mayor"

## Common CI Failure Patterns

| Failure | Cause | Fix |
|---------|-------|-----|
| `unrecognized arguments: --scan-beads` | CLI flag not in script | Add flag to script or remove from CI |
| E2E tests fail immediately | No servers started | Add webServer config or startup steps |
| YAML parse errors | Duplicate keys | Remove duplicate, validate with yamllint |
| PII compliance fail | Real names in beads | Use role-based identifiers |

## Validation Commands

```bash
# Test integrity scanner locally
python backend/gaia/integrity_scanner.py --ci --json --scan-beads

# Validate YAML
yamllint .beads/config.yaml

# Check for PII
rg "@" .beads/issues.jsonl | wc -l  # Should be 0

# Test Playwright locally
npm run dev:all &  # Start both servers
npx playwright test

# Dry-run CI locally (act needed)
act -l  # List workflows
act --dry-run  # Simulate CI run
```

## CI Job Template

```yaml
  job-name:
    name: Job Name
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: false

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: "pip"

      - name: Install dependencies
        run: |
          npm ci --legacy-peer-deps
          pip install -r backend/requirements.txt

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Start servers
        run: |
          cd backend && python manage.py runserver 8000 &
          npm run dev:frontend &
          npx wait-on http://localhost:8000 http://localhost:5173

      - name: Run tests
        run: npx playwright test --project=chromium
```
