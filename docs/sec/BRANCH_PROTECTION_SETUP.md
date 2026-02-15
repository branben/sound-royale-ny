# Branch Protection Setup Guide

## Repository: `branben/sound-royale-ny`

This guide helps you set up branch protection rules for the `main` branch to ensure code quality and security.

## Quick Setup (Manual)

1. **Navigate to Settings**
   - Go to: https://github.com/branben/sound-royale-ny/settings/branches
   - Click **"Add branch protection rule"**

2. **Configure Branch Pattern**
   - Branch name pattern: `main`

3. **Recommended Protection Rules**

### ✅ Required Settings (CRITICAL)

- [x] **Require a pull request before merging**
  - Require approvals: `1` (minimum)
  - Dismiss stale pull request approvals when new commits are pushed
  - Require review from Code Owners (if CODEOWNERS file exists)

- [x] **Require status checks to pass before merging**
  - Require branches to be up to date before merging
  - Status checks to require:
    - `GAIA Guards CI` (from `.github/workflows/gaia-guards-ci.yml`)
    - `build` (if you have a build workflow)
    - `test` (if you have a test workflow)

- [x] **Require signed commits**
  - Ensures all commits are cryptographically verified
  - Aligns with GAIA Security Policy (Phase 2)

- [x] **Require linear history**
  - Prevents merge commits
  - Keeps git history clean and auditable

- [x] **Do not allow bypassing the above settings**
  - Applies to administrators too
  - Maximum security posture

### 🔒 Additional Security Settings

- [x] **Do not allow force pushes**
  - Prevents history rewriting
  - Protects against accidental data loss

- [x] **Do not allow deletions**
  - Prevents accidental branch deletion

### 📋 Optional Settings (Recommended)

- [ ] **Require deployments to succeed before merging**
  - Enable if you have staging/preview deployments

- [ ] **Lock branch**
  - Makes branch read-only (extreme protection)
  - Only enable if main should never receive direct commits

## Automated Setup (GitHub CLI)

If you have the GitHub CLI installed, you can use this script:

```bash
# Install GitHub CLI if needed
# brew install gh

# Authenticate
gh auth login

# Create branch protection rule
gh api repos/branben/sound-royale-ny/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["GAIA Guards CI"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"dismiss_stale_reviews":true,"require_code_owner_reviews":false,"required_approving_review_count":1}' \
  --field restrictions=null \
  --field required_linear_history=true \
  --field allow_force_pushes=false \
  --field allow_deletions=false \
  --field required_signatures=true
```

## Verification

After setting up branch protection, verify it's working:

1. **Test Direct Push (Should Fail)**
   ```bash
   git checkout main
   echo "test" >> README.md
   git commit -am "test: direct push"
   git push origin main
   # Expected: remote rejected (protected branch)
   ```

2. **Test PR Workflow (Should Succeed)**
   ```bash
   git checkout -b test-branch-protection
   echo "test" >> README.md
   git commit -am "test: via PR"
   git push origin test-branch-protection
   # Create PR on GitHub
   # Verify status checks run
   # Verify approval required
   # Merge via PR interface
   ```

## Integration with GAIA Security

Branch protection complements GAIA's security hardening:

| GAIA Phase | Branch Protection Benefit |
|------------|---------------------------|
| Phase 1: Path Guards | PRs allow review of guard violations before merge |
| Phase 2: CI Integration | Status checks enforce integrity scanner passing |
| Phase 3: Namespace Split | Prevents accidental commits to `.gaia_private/` |
| Phase 4: Signed Commits | Required signatures align with commit verification |

## Troubleshooting

### "Status check not found"
- Ensure the workflow has run at least once
- Check workflow name matches exactly
- Workflows must be on the default branch

### "Cannot enable required signatures"
- Ensure you have commit signing set up locally
- See: https://docs.github.com/en/authentication/managing-commit-signature-verification

### "Administrators can bypass"
- Uncheck "Allow specified actors to bypass required pull requests"
- Check "Do not allow bypassing the above settings"

## References

- [GitHub Branch Protection Documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GAIA Security Policy](./GAIA_SECURITY_POLICY.md)
- [Commit Signing Guide](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits)

---

**Last Updated:** 2026-02-13  
**Owner:** Security Team  
**Status:** Active
