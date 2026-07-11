#!/usr/bin/env python3
"""Add labels and set commit status based on review findings."""
import json, os, subprocess

all_findings = []
for agent in ["security", "quality", "architecture", "django"]:
    path = f"/tmp/{agent}-findings.json"
    if os.path.exists(path):
        with open(path) as f:
            all_findings.extend(json.load(f))

critical = [f for f in all_findings if f.get("severity") == "critical"]
high = [f for f in all_findings if f.get("severity") == "high"]

labels = []
if critical or high:
    labels.append("needs-human-review")
if all_findings:
    labels.append("auto-reviewed")

if labels:
    subprocess.run(
        ["gh", "pr", "edit", os.environ["PR_NUMBER"], "--repo", os.environ["REPO"],
         "--add-label", ",".join(labels)],
        capture_output=True, text=True
    )
    print(f"Added labels: {', '.join(labels)}")

sha = subprocess.run(
    ["git", "rev-parse", "HEAD"],
    capture_output=True, text=True
).stdout.strip()

if critical:
    state = "failure"
    desc = f"{len(critical)} critical finding(s) need resolution"
elif high:
    state = "failure"
    desc = f"{len(high)} high-severity finding(s) need human review"
elif all_findings:
    state = "success"
    desc = f"Auto-review: {len(all_findings)} findings (no critical/high)"
else:
    state = "success"
    desc = "Auto-review: no issues found"

payload = json.dumps({
    "state": state,
    "description": desc,
    "context": "auto-review/llm"
})

subprocess.run(
    ["gh", "api", f"repos/{os.environ['REPO']}/statuses/{sha}",
     "-X", "POST", "-H", "Accept: application/vnd.github+json",
     "-d", payload],
    capture_output=True, text=True
)

print(f"Status: {state} - {desc}")
