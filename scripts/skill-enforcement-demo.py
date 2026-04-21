#!/usr/bin/env python3
"""
Skill Enforcement Demo - Simulates IDE-level enforcement hooks

This demonstrates what the Windsurf/Cascade IDE would implement for:
- Pre-edit validation gates
- Phase timers
- Post-task completion blocking

Usage: python scripts/skill-enforcement-demo.py
"""

import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class AgentContext:
    """Simulates agent session state that IDE would track"""
    file_reads: dict[str, int] = field(default_factory=dict)
    data_flow_verified: bool = False
    type_verified: bool = False
    route_verified: bool = False
    phase: str = "green"  # red, green, refactor
    phase_start_time: float = field(default_factory=lambda: 0.0)
    modified_files: list[str] = field(default_factory=list)
    
    def record_file_read(self, filepath: str):
        """IDE tracks every file read via read_file tool"""
        self.file_reads[filepath] = self.file_reads.get(filepath, 0) + 1
        return self.file_reads[filepath]
    
    def get_file_read_count(self, filepath: str) -> int:
        return self.file_reads.get(filepath, 0)


@dataclass
class ValidationResult:
    passed: bool
    gate_id: str
    severity: str  # 'block', 'warn', 'info'
    message: str
    action: str


class SkillEnforcer:
    """
    Simulates IDE tool interceptor layer
    In real implementation, this wraps edit/multi_edit/todo_list calls
    """
    
    def __init__(self, skill_frontmatter: dict):
        self.frontmatter = skill_frontmatter
        self.context = AgentContext()
    
    def pre_edit_validation(self, filepath: str) -> list[ValidationResult]:
        """
        Called by IDE before every edit/multi_edit tool invocation
        """
        results = []
        validations = self.frontmatter.get('pre_edit_validations', [])
        
        # Simulate file read tracking
        read_count = self.context.record_file_read(filepath)
        
        for validation in validations:
            condition = validation.get('condition', '')
            
            # Check file read limit
            if 'file_read_count >= 3' in condition and read_count >= 3:
                results.append(ValidationResult(
                    passed=False,
                    gate_id=validation['id'],
                    severity=validation['severity'],
                    message=validation['message'].replace('{filename}', filepath),
                    action=validation.get('action_on_fail', 'warn')
                ))
            
            # Check data flow (context files)
            elif 'editing_context_or_components' in condition:
                if ('src/context/' in filepath or 'src/components/' in filepath) and not self.context.data_flow_verified:
                    results.append(ValidationResult(
                        passed=False,
                        gate_id=validation['id'],
                        severity=validation['severity'],
                        message=validation['message'],
                        action=validation.get('action_on_fail', 'warn')
                    ))
            
            # Check type verification
            elif 'accessing_player_or_game_state' in condition:
                if 'PlayerView' in filepath and not self.context.type_verified:
                    results.append(ValidationResult(
                        passed=False,
                        gate_id=validation['id'],
                        severity=validation['severity'],
                        message=validation['message'],
                        action=validation.get('action_on_fail', 'warn')
                    ))
        
        return results
    
    def check_phase_timeout(self) -> Optional[ValidationResult]:
        """
        Called periodically by IDE timer service
        """
        import time
        timeouts = self.frontmatter.get('phase_timeouts', {})
        
        if self.context.phase == 'green':
            green_timeout = timeouts.get('green', 30)  # 30 min default
            elapsed = (time.time() - self.context.phase_start_time) / 60
            
            if elapsed > green_timeout:
                return ValidationResult(
                    passed=False,
                    gate_id='green_timeout',
                    severity='block',
                    message=timeouts.get('green_timeout_message', '30 min in green. Run type check.'),
                    action='force_check'
                )
        
        return None
    
    def post_task_validation(self) -> list[ValidationResult]:
        """
        Called by IDE before allowing todo_list completion
        """
        results = []
        checks = self.frontmatter.get('post_task_checks', [])
        
        for check in checks:
            check_id = check['id']
            command = check.get('command', '')
            must_pass = check.get('must_pass', False)
            expect_empty = check.get('expect_empty', False)
            
            # Simulate command execution
            success, output = self._simulate_command(command, check_id)
            
            failed = False
            if must_pass and not success:
                failed = True
            if expect_empty and output.strip():
                failed = True
            
            if failed:
                results.append(ValidationResult(
                    passed=False,
                    gate_id=check_id,
                    severity='block',
                    message=check.get('failure_message', f'{check_id} failed'),
                    action='block_completion'
                ))
        
        return results
    
    def _simulate_command(self, command: str, check_id: str) -> tuple[bool, str]:
        """Simulate command execution for demo"""
        if check_id == 'type_check':
            # Simulate: would actually run npx tsc --noEmit
            return True, ""
        elif check_id == 'no_console_logs':
            # Simulate: check for console.log in modified files
            return True, ""  # No console.log found
        elif check_id == 'test_pass':
            # Simulate: run playwright tests
            return True, "1 passed"
        return True, ""


def parse_skill_frontmatter(skill_path: Path) -> dict:
    """Parse YAML frontmatter from SKILL.md"""
    content = skill_path.read_text()
    
    if not content.startswith('---'):
        return {}
    
    # Extract frontmatter between --- delimiters
    end_marker = content.find('---', 3)
    if end_marker == -1:
        return {}
    
    frontmatter_text = content[3:end_marker].strip()
    
    # Simple YAML parsing (for demo purposes - real IDE would use proper YAML parser)
    # Just extract key structures we need
    result = {}
    
    # Extract pre_edit_validations
    if 'pre_edit_validations:' in frontmatter_text:
        validations = []
        in_validations = False
        current = {}
        
        for line in frontmatter_text.split('\n'):
            if 'pre_edit_validations:' in line:
                in_validations = True
                continue
            elif in_validations and line.strip().startswith('- id:'):
                if current:
                    validations.append(current)
                current = {'id': line.split(':')[1].strip().strip('"')}
            elif in_validations and line.strip().startswith('condition:'):
                current['condition'] = line.split(':')[1].strip()
            elif in_validations and line.strip().startswith('severity:'):
                current['severity'] = line.split(':')[1].strip()
            elif in_validations and line.strip().startswith('message:'):
                current['message'] = line.split(':')[1].strip().strip('"')
            elif in_validations and line.strip().startswith('action_on_fail:'):
                current['action_on_fail'] = line.split(':')[1].strip()
        
        if current:
            validations.append(current)
        
        result['pre_edit_validations'] = validations
    
    # Extract phase_timeouts
    if 'phase_timeouts:' in frontmatter_text:
        timeouts = {}
        in_timeouts = False
        
        for line in frontmatter_text.split('\n'):
            if 'phase_timeouts:' in line:
                in_timeouts = True
                continue
            elif in_timeouts and ':' in line and not line.strip().startswith('#'):
                parts = line.strip().split(':')
                if len(parts) >= 2:
                    key = parts[0].strip()
                    value_part = parts[1].strip()
                    value_str = value_part.split()[0] if value_part.split() else value_part
                    try:
                        timeouts[key] = int(value_str)
                    except ValueError:
                        timeouts[key] = value_str
        
        result['phase_timeouts'] = timeouts
    
    return result


def demo_pre_edit_gate():
    """Demonstrate pre-edit file read limit gate"""
    print("=" * 70)
    print("DEMO 1: Pre-Edit File Read Limit Gate")
    print("=" * 70)
    
    # Load skill
    skill_path = Path('.gaia_skills/e2e-test-hygiene/SKILL.md')
    frontmatter = parse_skill_frontmatter(skill_path)
    enforcer = SkillEnforcer(frontmatter)
    
    target_file = 'src/components/game/PlayerView.tsx'
    
    # Simulate 3 reads of the same file
    print(f"\nScenario: Reading {target_file} 3 times...")
    
    for i in range(1, 4):
        results = enforcer.pre_edit_validation(target_file)
        
        if results:
            for r in results:
                print(f"\n  [{r.severity.upper()}] Gate '{r.gate_id}' triggered:")
                print(f"  → {r.message}")
                print(f"  → Action: {r.action}")
        else:
            print(f"  Read #{i}: No gates triggered")
    
    print("\n" + "=" * 70)


def demo_data_flow_gate():
    """Demonstrate data flow verification gate"""
    print("\n" + "=" * 70)
    print("DEMO 2: Data Flow Verification Gate")
    print("=" * 70)
    
    skill_path = Path('.gaia_skills/e2e-test-hygiene/SKILL.md')
    frontmatter = parse_skill_frontmatter(skill_path)
    enforcer = SkillEnforcer(frontmatter)
    
    target_file = 'src/context/GameContext.tsx'
    
    print(f"\nScenario: Editing {target_file} without verifying data flow...")
    
    results = enforcer.pre_edit_validation(target_file)
    
    for r in results:
        print(f"\n  [{r.severity.upper()}] Gate '{r.gate_id}' triggered:")
        print(f"  → {r.message}")
        print(f"  → Action: {r.action}")
    
    # Now verify data flow
    print("\n→ Agent confirms data flow verified")
    enforcer.context.data_flow_verified = True
    
    print(f"\n→ Re-validating {target_file}...")
    results = enforcer.pre_edit_validation(target_file)
    
    if not results:
        print("  ✓ No gates triggered - edit allowed")
    
    print("\n" + "=" * 70)


def demo_phase_timer():
    """Demonstrate green phase timeout"""
    print("\n" + "=" * 70)
    print("DEMO 3: Phase Timer (Green Timeout)")
    print("=" * 70)
    
    skill_path = Path('.gaia_skills/e2e-test-hygiene/SKILL.md')
    frontmatter = parse_skill_frontmatter(skill_path)
    enforcer = SkillEnforcer(frontmatter)
    
    import time
    
    print("\nScenario: 35 minutes spent in 'green' phase...")
    enforcer.context.phase = 'green'
    enforcer.context.phase_start_time = time.time() - (35 * 60)  # 35 min ago
    
    result = enforcer.check_phase_timeout()
    
    if result:
        print(f"\n  [{result.severity.upper()}] Timer '{result.gate_id}' triggered:")
        print(f"  → {result.message}")
        print(f"  → Action: {result.action}")
        print("\n  → Agent must run: npx tsc --noEmit")
        print("  → Cannot mark task complete until types pass")
    
    print("\n" + "=" * 70)


def demo_post_task_check():
    """Demonstrate post-task completion blocking"""
    print("\n" + "=" * 70)
    print("DEMO 4: Post-Task Completion Blocking")
    print("=" * 70)
    
    skill_path = Path('.gaia_skills/e2e-test-hygiene/SKILL.md')
    frontmatter = parse_skill_frontmatter(skill_path)
    enforcer = SkillEnforcer(frontmatter)
    
    enforcer.context.modified_files = ['src/components/game/PlayerView.tsx']
    
    print("\nScenario: Agent tries to mark task complete...")
    print("  Modified files:", enforcer.context.modified_files)
    
    results = enforcer.post_task_validation()
    
    if results:
        print("\n  BLOCKED - Post-task checks failed:")
        for r in results:
            print(f"\n    [{r.severity.upper()}] Check '{r.gate_id}':")
            print(f"    → {r.message}")
    else:
        print("\n  ✓ All post-task checks passed - completion allowed")
    
    print("\n" + "=" * 70)


def main():
    print("\n" + "=" * 70)
    print("SKILL ENFORCEMENT DEMO")
    print("Simulates IDE-level enforcement hooks for Windsurf/Cascade")
    print("=" * 70)
    
    # Check if skill file exists
    skill_path = Path('.gaia_skills/e2e-test-hygiene/SKILL.md')
    if not skill_path.exists():
        print(f"\nError: Skill file not found: {skill_path}")
        print("Run from repo root: python scripts/skill-enforcement-demo.py")
        sys.exit(1)
    
    demo_pre_edit_gate()
    demo_data_flow_gate()
    demo_phase_timer()
    demo_post_task_check()
    
    print("\n" + "=" * 70)
    print("DEMO COMPLETE")
    print("=" * 70)
    print("\nThese gates would have prevented the 30-minute time waste:")
    print("  1. File read limit: Stopped 4th read of PlayerView.tsx")
    print("  2. Data flow check: Verified setupPlayerSession → UserContext keys")
    print("  3. Green timeout: Forced type check at 30 min mark")
    print("  4. Post-task: Blocked completion with console.log present")
    print("\nTo implement in Windsurf/Cascade:")
    print("  - Tool interceptor layer (wrap edit/multi_edit/todo_list)")
    print("  - Session state persistence (file reads, phase timers)")
    print("  - YAML frontmatter parser (extract validations from SKILL.md)")
    print("  - User notification system (warnings, modals, auto-fix offers)")
    print("=" * 70)


if __name__ == "__main__":
    main()
