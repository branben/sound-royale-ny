#!/usr/bin/env python3
"""Run an LLM review via OmniRoute CLI and output findings as JSON."""
import json, os, subprocess, sys

prompt_file = sys.argv[1]
output_file = sys.argv[2]
combo = sys.argv[3]
system_prompt = sys.argv[4]

with open(prompt_file) as f:
    prompt = f.read()

with open(prompt_file) as f:
    prompt = f.read()

cmd = [
    "npx", "omniroute", "chat",
    "--file", prompt_file,
    "--combo", combo,
    "--system", system_prompt,
    "--temperature", "0.1",
    "--max-tokens", "2000",
    "--no-history",
]

result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)

if result.returncode != 0:
    print(f"Error: {result.stderr[:200]}", file=sys.stderr)
    with open(output_file, "w") as f:
        json.dump([], f)
    sys.exit(0)

output = result.stdout.strip()
lines = output.split("\n")
content_lines = []
in_content = False
for line in lines:
    if line.startswith("\U0001f4cb") or ("[" in line and "\u00b7" in line):
        continue
    if line.strip() == "":
        if in_content:
            content_lines.append(line)
        continue
    in_content = True
    content_lines.append(line)

output = "\n".join(content_lines).strip()

if "```" in output:
    output = output.split("```")[1]
    if output.startswith("json"):
        output = output[4:]
    output = output.strip()

for i, c in enumerate(output):
    if c in ("[", "{"):
        output = output[i:]
        break

try:
    findings = json.loads(output)
    if not isinstance(findings, list):
        findings = []
except json.JSONDecodeError:
    findings = []

with open(output_file, "w") as f:
    json.dump(findings, f, indent=2)

print(f"Found {len(findings)} findings")
