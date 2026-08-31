# Security Scanning

Sound Royale uses multiple tools for security scanning in CI:

## Tools

| Tool | What | When |
|------|------|------|
| Dependabot | Dependency updates | Continuous |
| Trivy | Container image scanning | On push to main |
| bandit | Python SAST | On push to main |
| npm audit | Node.js dependency audit | On push to main |

## Dependabot

See `.github/dependabot.yml`

- Daily checks for Python and npm
- Auto-merge patch updates
- Manual review for minor/major

## Trivy

Scans Docker images for CVEs:

```bash
# Local scan
trivy image sound-royale-ny:latest

# Scan with severity filter
trivy image --severity HIGH,CRITICAL sound-royale-ny:latest
```

## bandit

Python security linter:

```bash
# Run bandit
bandit -r backend/ -f json -o bandit-report.json

# Check for high severity
bandit -r backend/ -ll
```

## npm audit

```bash
# Check for vulnerabilities
npm audit

# Fix automatically (careful!)
npm audit fix

# Force fix (may break things)
npm audit fix --force
```

## CI Pipeline

See `.github/workflows/security.yml`

Runs on every push to main and weekly.

## Responsibilities

| Role | Responsibility |
|------|---------------|
| CI | Run scans automatically |
| On-call | Review findings daily |
| Team | Fix high/critical within 48 hours |
