#!/usr/bin/env python3
"""Write LLM review prompts to files."""
import os

diff = open("/tmp/pr-diff.txt").read()
changed = open("/tmp/changed-files.txt").read().strip()

security_prompt = (
    "You are a security-focused code reviewer for a Django + React + TypeScript + WebSocket application.\n\n"
    "Review this PR diff for security vulnerabilities.\n\n"
    "## Changed Files\n"
    f"{changed}\n\n"
    "## Diff\n"
    "```diff\n"
    f"{diff[:8000]}\n"
    "```\n\n"
    "Check for: injection (SQL, XSS, command), broken auth, hardcoded secrets, insecure deserialization, missing input validation, OWASP Top 10.\n\n"
    "Output ONLY a JSON array. If no findings, output [].\n\n"
    "Format each finding:\n"
    '{"severity":"critical|high|medium|low|info","file":"<filename>","line":<number_or_null>","cwe":"CWE-XXX","description":"<issue>","impact":"<risk>","fix":"<suggestion>"}\n'
)

quality_prompt = (
    "You are a code quality reviewer for a React + TypeScript + Tailwind + Django application.\n\n"
    "Review this PR diff for code quality issues.\n\n"
    "## Changed Files\n"
    f"{changed}\n\n"
    "## Diff\n"
    "```diff\n"
    f"{diff[:6000]}\n"
    "```\n\n"
    "Check for: unused imports, missing cleanup after refactor, accessibility issues, type safety (any, @ts-ignore), code duplication, error handling anti-patterns.\n\n"
    "Output ONLY a JSON array. If no findings, output [].\n\n"
    'Format: {"severity":"low|info","file":"<filename>","line":<number_or_null>","description":"<issue>","fix":"<suggestion>"}\n'
)

arch_prompt = (
    "You are an architecture reviewer for a Django + React + WebSocket multiplayer game.\n\n"
    "Review this PR diff for architectural compliance.\n\n"
    "## Changed Files\n"
    f"{changed}\n\n"
    "## Diff\n"
    "```diff\n"
    f"{diff[:6000]}\n"
    "```\n\n"
    "Check for: broken component contracts, new implicit dependencies, circular imports, state machine violations, mixing of concerns (infra in domain code), WebSocket flow integrity.\n\n"
    "Output ONLY a JSON array. If no findings, output [].\n\n"
    'Format: {"severity":"medium|low|info","file":"<filename>","line":<number_or_null>","description":"<issue>","fix":"<suggestion>"}\n'
)

with open("/tmp/security-prompt.txt", "w") as f:
    f.write(security_prompt)
with open("/tmp/quality-prompt.txt", "w") as f:
    f.write(quality_prompt)
with open("/tmp/arch-prompt.txt", "w") as f:
    f.write(arch_prompt)

print("Prompts written")
