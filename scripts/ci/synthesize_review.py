#!/usr/bin/env python3
"""Synthesize findings from all agents and post to GitHub PR."""
import json, os, subprocess
from datetime import datetime, timezone

all_findings = []
for agent in ["security", "quality", "architecture"]:
    path = f"/tmp/{agent}-findings.json"
    if os.path.exists(path):
        with open(path) as f:
            findings = json.load(f)
            for item in findings:
                item["agent"] = agent
                all_findings.append(item)

critical = [f for f in all_findings if f.get("severity") == "critical"]
high = [f for f in all_findings if f.get("severity") == "high"]
medium = [f for f in all_findings if f.get("severity") == "medium"]
low = [f for f in all_findings if f.get("severity") == "low"]
info = [f for f in all_findings if f.get("severity") == "info"]

if critical or high:
    verdict = "\U0001f534 **REQUEST_CHANGES**"
elif medium:
    verdict = "\U0001f7e1 **COMMENT**"
elif low:
    verdict = "\U0001f7e2 **APPROVE** with suggestions"
else:
    verdict = "\u2705 **APPROVE** - no issues found"

lines = [verdict, ""]
lines.append("<!-- auto-review:synthesis -->")
lines.append(f"*Automated review at {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}*")
lines.append("")

for severity, items in [
    ("\U0001f534 Critical", critical),
    ("\U0001f7e0 High", high),
    ("\U0001f7e1 Medium", medium),
    ("\U0001f7e2 Low", low),
    ("\u2139\ufe0f Info", info),
]:
    if items:
        lines.append(f"### {severity}")
        for f in items:
            cwe = f.get("cwe", "")
            file_ref = f.get("file", "unknown")
            line_ref = f.get("line", "")
            line_str = f":{line_ref}" if line_ref else ""
            lines.append(f"- **{file_ref}{line_str}** ({cwe}): {f.get('description', '')}")
            if f.get("fix"):
                lines.append(f"  - \U0001f4a1 Fix: {f['fix']}")
        lines.append("")

lines.append("---")
lines.append("*This review was generated automatically by OmniRoute LLM agents. Please verify findings before acting.*")

body = "\n".join(lines)

result = subprocess.run(
    ["gh", "pr", "comment", os.environ["PR_NUMBER"], "--repo", os.environ["REPO"], "--body", body],
    capture_output=True, text=True
)

if result.returncode == 0:
    print(f"posted=true")
    print(f"findings_count={len(all_findings)}")
    print(f"critical={len(critical)}")
    print(f"high={len(high)}")
else:
    print(f"posted=false")
    print(f"error={result.stderr[:200]}")
