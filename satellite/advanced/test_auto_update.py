#!/usr/bin/env python3
"""
Comprehensive test of auto-update functionality
Tests version comparison logic and GitHub connectivity
"""
import urllib.request
import urllib.error
from pathlib import Path
import os
import sys

# Configuration - same as satellite_gui.py
CLIENT_VERSION = "0.2.0"
REMOTE_VERSION_URL = "https://raw.githubusercontent.com/SamN20/Mina/main/satellite/version.txt"
RELEASE_PAGE_URL = "https://github.com/SamN20/Mina/releases/latest"

def parse_version(version_str):
    """Parse version string into tuple for comparison"""
    parts = []
    for segment in version_str.split('.'):
        try:
            parts.append(int(segment))
        except ValueError:
            parts.append(0)
    return tuple(parts)

def get_local_version():
    """Get local version from version.txt"""
    try:
        script_dir = Path(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        version_file = script_dir / "version.txt"
        if version_file.exists():
            return version_file.read_text(encoding="utf-8").strip()
    except Exception as e:
        print(f"Error reading local version: {e}")
    return CLIENT_VERSION

def test_version_comparison():
    """Test version comparison logic"""
    print("=" * 60)
    print("TEST 1: Version Comparison Logic")
    print("=" * 60)
    
    test_cases = [
        ("0.2.0", "0.2.0", False, "Same version - no update"),
        ("0.2.0", "0.2.1", True, "Patch version update"),
        ("0.2.0", "0.3.0", True, "Minor version update"),
        ("0.2.0", "1.0.0", True, "Major version update"),
        ("0.1.9", "0.2.0", True, "Higher version"),
        ("0.10.0", "0.9.9", False, "10 > 9 in minor version"),
    ]
    
    all_passed = True
    for local, remote, should_update, description in test_cases:
        local_tuple = parse_version(local)
        remote_tuple = parse_version(remote)
        update_available = remote_tuple > local_tuple
        
        status = "✓" if update_available == should_update else "✗"
        result = "PASS" if update_available == should_update else "FAIL"
        
        if update_available != should_update:
            all_passed = False
        
        print(f"{status} {result}: {description}")
        print(f"   Local {local} ({local_tuple}) vs Remote {remote} ({remote_tuple}) → Update={update_available}")
    
    print()
    return all_passed

def test_github_connectivity():
    """Test ability to fetch remote version from GitHub"""
    print("=" * 60)
    print("TEST 2: GitHub Connectivity")
    print("=" * 60)
    
    local_version = get_local_version()
    print(f"Local version: {local_version}")
    print(f"Remote URL: {REMOTE_VERSION_URL}")
    print()
    
    try:
        print("Attempting to fetch remote version...")
        request = urllib.request.Request(
            REMOTE_VERSION_URL,
            headers={'User-Agent': 'Mina-Satellite-Client'}
        )
        with urllib.request.urlopen(request, timeout=5) as resp:
            remote_version = resp.read().decode("utf-8").strip()
        
        print(f"✓ Successfully fetched: {remote_version}")
        print()
        print("Version Comparison:")
        print(f"  Local:  {local_version}")
        print(f"  Remote: {remote_version}")
        
        if parse_version(remote_version) > parse_version(local_version):
            print(f"  Result: ✓ UPDATE AVAILABLE ({remote_version} > {local_version})")
            print(f"  Download: {RELEASE_PAGE_URL}")
            return True
        else:
            print(f"  Result: ✓ Already on latest version")
            return True
            
    except urllib.error.URLError as e:
        print(f"✗ URL Error: {e}")
        print()
        print("Troubleshooting:")
        print("  - Check internet connection")
        print("  - Verify GitHub is accessible")
        print("  - Ensure version.txt exists on GitHub")
        return False
    except TimeoutError:
        print(f"✗ Timeout: Could not connect within 5 seconds")
        print()
        print("Troubleshooting:")
        print("  - Check internet speed/latency")
        print("  - Try again in a moment (GitHub might be slow)")
        return False
    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        return False

def test_update_prompt_simulation():
    """Simulate what would happen when update is detected"""
    print()
    print("=" * 60)
    print("TEST 3: Update Prompt Simulation")
    print("=" * 60)
    
    # Simulate a new version being available
    current = "0.2.0"
    latest = "0.3.0"
    
    print(f"Current version: {current}")
    print(f"Latest version:  {latest}")
    print()
    
    if parse_version(latest) > parse_version(current):
        print("Prompt that would be shown to user:")
        print("-" * 40)
        print("Update Available")
        print()
        print(f"A newer version of Mina Satellite is available.")
        print()
        print(f"Current: {current}")
        print(f"Latest:  {latest}")
        print()
        print("Open download page?")
        print("-" * 40)
        print()
        print(f"If user clicks Yes, browser opens: {RELEASE_PAGE_URL}")
        return True
    else:
        print("✗ Version comparison failed")
        return False

def main():
    """Run all tests"""
    print()
    print("╔" + "=" * 58 + "╗")
    print("║" + " " * 58 + "║")
    print("║" + "  Mina Satellite - Auto-Update System Test Suite  ".center(58) + "║")
    print("║" + " " * 58 + "║")
    print("╚" + "=" * 58 + "╝")
    print()
    
    test1_pass = test_version_comparison()
    print()
    
    test2_pass = test_github_connectivity()
    print()
    
    test3_pass = test_update_prompt_simulation()
    print()
    
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Test 1 (Version Comparison): {'✓ PASS' if test1_pass else '✗ FAIL'}")
    print(f"Test 2 (GitHub Connectivity): {'✓ PASS' if test2_pass else '✗ FAIL'}")
    print(f"Test 3 (Update Prompt): {'✓ PASS' if test3_pass else '✗ FAIL'}")
    print()
    
    if test1_pass and test2_pass and test3_pass:
        print("✓ ALL TESTS PASSED - Auto-update system is working!")
        return 0
    else:
        print("✗ SOME TESTS FAILED - See details above")
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
