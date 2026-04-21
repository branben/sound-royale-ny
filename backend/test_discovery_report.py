#!/usr/bin/env python3
"""
Test Discovery Verification and Analysis Script
This script analyzes the current test discovery configuration and provides recommendations.
"""

import subprocess
import sys
import os
from pathlib import Path


def run_command(cmd):
    """Run a command and return the output"""
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=os.getcwd())
    return result.returncode, result.stdout, result.stderr


def analyze_test_discovery():
    """Analyze current test discovery configuration"""
    print("=== Test Discovery Analysis ===\n")
    
    # 1. Check pytest configuration
    print("1. Pytest Configuration:")
    if os.path.exists("pytest.ini"):
        with open("pytest.ini", "r") as f:
            print(f.read())
    else:
        print("No pytest.ini found")
    
    print("\n" + "="*50 + "\n")
    
    # 2. Collect all tests
    print("2. Test Collection:")
    returncode, stdout, stderr = run_command("pytest --collect-only -q")
    
    if returncode != 0:
        print(f"Error collecting tests: {stderr}")
        return
    
    # Parse test collection output
    test_files = []
    test_count = 0
    
    for line in stdout.split('\n'):
        if '<Module' in line:
            test_files.append(line.strip())
        elif '<TestCaseFunction' in line or '<Function' in line:
            test_count += 1
    
    print(f"Total test files discovered: {len(test_files)}")
    print(f"Total test functions discovered: {test_count}")
    
    print("\nTest Files:")
    for test_file in test_files:
        print(f"  {test_file}")
    
    print("\n" + "="*50 + "\n")
    
    # 3. Analyze test distribution
    print("3. Test Distribution Analysis:")
    
    # Count tests by directory
    test_distribution = {}
    for test_file in test_files:
        module_name = test_file.split('<Module ')[1].split('>')[0]
        if 'game_engine' in module_name:
            test_distribution['game_engine'] = test_distribution.get('game_engine', 0) + 1
        elif 'gaia' in module_name:
            test_distribution['gaia'] = test_distribution.get('gaia', 0) + 1
        else:
            test_distribution['other'] = test_distribution.get('other', 0) + 1
    
    for directory, count in test_distribution.items():
        print(f"  {directory}: {count} test files")
    
    print("\n" + "="*50 + "\n")
    
    # 4. Check for potential issues
    print("4. Test Discovery Health Check:")
    
    issues = []
    
    # Check for test files that might be missed
    all_python_files = list(Path('.').rglob('test_*.py')) + list(Path('.').rglob('*_tests.py'))
    discovered_files = [Path(f.split('<Module ')[1].split('>')[0]) for f in test_files]
    
    missed_files = [f for f in all_python_files if f not in discovered_files]
    if missed_files:
        issues.append(f"Missed test files: {missed_files}")
    
    # Check for duplicate test names
    test_names = []
    for line in stdout.split('\n'):
        if '<TestCaseFunction' in line or '<Function' in line:
            test_name = line.split('test_')[1].split('>')[0] if 'test_' in line else 'unknown'
            test_names.append(test_name)
    
    duplicates = set([name for name in test_names if test_names.count(name) > 1])
    if duplicates:
        issues.append(f"Duplicate test names found: {duplicates}")
    
    if issues:
        print("Issues found:")
        for issue in issues:
            print(f"  - {issue}")
    else:
        print("No issues found!")
    
    print("\n" + "="*50 + "\n")
    
    # 5. Recommendations
    print("5. Recommendations:")
    
    recommendations = []
    
    if len(test_files) < 5:
        recommendations.append("Consider adding more test files for better coverage")
    
    if test_count < 50:
        recommendations.append("Consider adding more test functions for better test coverage")
    
    if test_distribution.get('game_engine', 0) == 0:
        recommendations.append("No tests found in game_engine directory")
    
    if not os.path.exists("pytest.ini"):
        recommendations.append("Create pytest.ini for better test configuration")
    
    if "--maxfail" not in open("pytest.ini", "r").read() if os.path.exists("pytest.ini") else "":
        recommendations.append("Consider adding --maxfail to pytest configuration")
    
    if recommendations:
        for rec in recommendations:
            print(f"  - {rec}")
    else:
        print("Current configuration looks good!")
    
    print("\n" + "="*50 + "\n")
    
    # 6. Test by markers (if configured)
    print("6. Test Markers Analysis:")
    
    markers = ['unit', 'integration', 'slow', 'transaction', 'validation', 'routing']
    
    for marker in markers:
        returncode, stdout, stderr = run_command(f"pytest --collect-only -m {marker} -q")
        if returncode == 0:
            marker_tests = len([line for line in stdout.split('\n') if '<TestCaseFunction' in line or '<Function' in line])
            print(f"  {marker}: {marker_tests} tests")
        else:
            print(f"  {marker}: No tests with this marker")
    
    print(f"\nTotal tests discovered: {test_count}")
    print("Test discovery analysis complete!")


if __name__ == "__main__":
    analyze_test_discovery()
