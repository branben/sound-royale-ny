# GAIA Security Policy

## 1. Overview
GAIA (Symbolic Persistence) uses "beads" to store task context and symbolic pointers across agent sessions. This policy ensures the integrity and security of these beads.

## 2. Signing Policy
- **CI Environment**: All GAIA operations in CI must be signed/verified using **Sigstore/Cosign**.
- **Local Development**: Developers should sign their work using GPG keys when pushing significant GAIA structure changes.

## 3. Integrity Scanning
The `integrity_scanner.py` runs in CI to:
- Verify all beads point to locations within the repository root.
- Ensure no beads index files containing secrets (e.g., `.env`, `*.key`, `*.pem`).
- Enforce patterns defined in `.beadsignore`.

## 4. Failure Response
- **Integrity Failure**: CI will block any PR where a bead violates security guards.
- **Remediation**: Remove the offending bead or update `.beadsignore` if the path is safe.

## 5. Audit Log
- All GAIA symbol resolutions are logged in CI artifacts for security auditing.

---

## 6. CI Enforcement Contract
- Scanner exit codes:
  - 0: pass (no violations)
  - 1: policy violations detected (DENY_*)
  - 2: internal scanner error/misconfiguration
- CI must run `python backend/gaia/integrity_scanner.py --ci --json` and capture `integrity_report.json` as an artifact.
- **Security Gate**: As of Phase 2, Cosign verification is active in CI. Builds will fail if valid signatures are not present for the identified subjects.
- Any non-zero exit code must fail the pipeline.

## 7. Secret Pattern Baseline and Allowlist
- Denied secret patterns (non-exhaustive):
  - `.env`, `*.pem`, `*.key`, `id_rsa`, `id_dsa`
- Allowed exceptions (examples):
  - `.env.example`, `README*.md` documenting secrets (no actual keys)
- All exceptions must be documented and justified in PR descriptions.

## 8. Rule Parity: .beadsignore and Guards
- `.beadsignore` is enforced by the scanner alongside hard-coded secret patterns.
- Precedence:
  1) Hard-coded secret denies
  2) `.beadsignore` patterns
  3) Default allow for in-root paths
- The single source of truth for guard decisions is `backend/gaia/guards_adapter.py`. Scanner imports from this adapter to avoid drift.

## 9. Failure Response Mapping
- On failure:
  - CI blocks the PR and attaches the structured JSON report.
  - Developers must remove or relocate offending beads, or update `.beadsignore` (with justification).
  - Security owners may add a temporary allowlist entry in a follow-up PR if necessary, with an issue to remove it.

## 10. Signing (Sigstore/Cosign)
- Default: keyless verification using GitHub OIDC (issuer `https://token.actions.githubusercontent.com`).
- Subject must match the repository identity configured in CI secrets (e.g., `org/repo`).
- If using keyed mode, store only public key in the repo or a secure secret store; never commit private keys.
