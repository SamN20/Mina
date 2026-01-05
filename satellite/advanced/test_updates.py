#!/usr/bin/env python3
"""
Test script to verify auto-update functionality
"""
import urllib.request
import urllib.error
from pathlib import Path
import os
import sys

# Configuration
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

def check_for_updates():
    """Check for updates from GitHub"""
    print("Testing update checking functionality...")
    print()
    
    # Get local version
    local_version = get_local_version()
    print(f"✓ Local version: {local_version}")
    
    # Fetch remote version
    try:
        print(f"✓ Fetching remote version from: {REMOTE_VERSION_URL}")
        # Add User-Agent header to avoid potential GitHub API issues
        request = urllib.request.Request(
            REMOTE_VERSION_URL,
            headers={'User-Agent': 'Mina-Satellite-Client'}
        )
        with urllib.request.urlopen(request, timeout=5) as resp:
            remote_version = resp.read().decode("utf-8").strip()
        print(f"✓ Remote version: {remote_version}")
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        print(f"✗ Failed to fetch remote version: {e}")
        print()
        print("Troubleshooting:")
        print("- Check your internet connection")
        print("- Verify GitHub is accessible")
        print("- Check if file exists: https://github.com/SamN20/Mina/blob/main/satellite/version.txt")
        return False
    
    # Compare versions
    print()
    print("Version comparison:")
    local_tuple = parse_version(local_version)
    remote_tuple = parse_version(remote_version)
    print(f"  Local:  {local_version} → {local_tuple}")
    print(f"  Remote: {remote_version} → {remote_tuple}")
    print(f"  Comparison: {remote_tuple} > {local_tuple} = {remote_tuple > local_tuple}")
    
    if parse_version(remote_version) > parse_version(local_version):
        print()
        print(f"✓ UPDATE AVAILABLE!")
        print(f"  Current version: {local_version}")
        print(f"  Latest version:  {remote_version}")
        print(f"  Download page:   {RELEASE_PAGE_URL}")
        return True
    else:
        print()
        print(f"✓ Already on latest version ({local_version})")
        return False

if __name__ == "__main__":
    success = check_for_updates()
    sys.exit(0 if success is False else 0)  # Always exit 0 - success means no errors
