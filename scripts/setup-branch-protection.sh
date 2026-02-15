#!/bin/bash
# Branch Protection Setup Script
# Repository: branben/sound-royale-ny
# Branch: main

set -e

REPO_OWNER="branben"
REPO_NAME="sound-royale-ny"
BRANCH="main"

echo "🔒 Setting up branch protection for ${REPO_OWNER}/${REPO_NAME}:${BRANCH}"

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed"
    echo "Install it with: brew install gh"
    echo "Or visit: https://cli.github.com/"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ Not authenticated with GitHub"
    echo "Run: gh auth login"
    exit 1
fi

echo "✅ GitHub CLI is installed and authenticated"

# Create branch protection rule
echo "📝 Creating branch protection rule..."

gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "/repos/${REPO_OWNER}/${REPO_NAME}/branches/${BRANCH}/protection" \
  -f required_status_checks[strict]=true \
  -f required_status_checks[contexts][]=GAIA\ Guards\ CI \
  -f enforce_admins=true \
  -f required_pull_request_reviews[dismiss_stale_reviews]=true \
  -f required_pull_request_reviews[require_code_owner_reviews]=false \
  -f required_pull_request_reviews[required_approving_review_count]=1 \
  -f restrictions=null \
  -f required_linear_history=true \
  -f allow_force_pushes=false \
  -f allow_deletions=false \
  -f required_signatures=true

echo "✅ Branch protection rule created successfully!"

# Verify the rule
echo ""
echo "📋 Verifying branch protection settings..."
gh api \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "/repos/${REPO_OWNER}/${REPO_NAME}/branches/${BRANCH}/protection" \
  --jq '{
    required_status_checks: .required_status_checks,
    enforce_admins: .enforce_admins,
    required_pull_request_reviews: .required_pull_request_reviews,
    required_signatures: .required_signatures,
    required_linear_history: .required_linear_history,
    allow_force_pushes: .allow_force_pushes,
    allow_deletions: .allow_deletions
  }'

echo ""
echo "✅ Branch protection is now active!"
echo ""
echo "Next steps:"
echo "  1. Test by trying to push directly to main (should fail)"
echo "  2. Create a PR from a feature branch (should require approval)"
echo "  3. Verify GAIA Guards CI runs on PRs"
echo ""
echo "View settings at: https://github.com/${REPO_OWNER}/${REPO_NAME}/settings/branches"
