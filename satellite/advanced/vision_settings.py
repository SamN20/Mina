"""
Vision Settings Management
Handles loading, saving, and default settings for vision features
"""

import os
import json
from pathlib import Path

# Default settings
DEFAULT_SETTINGS = {
    "features": {
        "motion_detection": {
            "enabled": True,
            "rate_limit_seconds": 2.0,
            "motion_threshold": 5000
        },
        "face_detection": {
            "enabled": True,
            "rate_limit_seconds": 2.0
        },
        "brightness_detection": {
            "enabled": True,
            "rate_limit_seconds": 1.0,
            "dark_threshold": 50,
            "change_threshold": 10  # Only send if brightness changes by this amount
        },
        "idle_detection": {
            "enabled": True,
            "rate_limit_seconds": 10.0,
            "idle_threshold_seconds": 300  # 5 minutes
        },
        "on_demand_snapshots": {
            "enabled": True,
            "webcam_enabled": True,
            "screen_enabled": True
        }
    }
}

def get_settings_path():
    """Get the path to the vision settings JSON file"""
    script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    config_dir = os.path.join(script_dir, "config")
    os.makedirs(config_dir, exist_ok=True)
    return os.path.join(config_dir, "vision_settings.json")

def load_settings():
    """Load settings from JSON file, or return defaults if file doesn't exist"""
    settings_path = get_settings_path()
    
    if os.path.exists(settings_path):
        try:
            with open(settings_path, 'r') as f:
                loaded = json.load(f)
                # Merge with defaults to ensure all keys exist
                settings = DEFAULT_SETTINGS.copy()
                settings.update(loaded)
                # Deep merge features
                if "features" in loaded:
                    for feature_name, feature_settings in loaded["features"].items():
                        if feature_name in settings["features"]:
                            settings["features"][feature_name].update(feature_settings)
                return settings
        except Exception as e:
            print(f"[Vision Settings] Error loading settings: {e}. Using defaults.")
            return DEFAULT_SETTINGS.copy()
    else:
        # Save defaults on first run
        save_settings(DEFAULT_SETTINGS.copy())
        return DEFAULT_SETTINGS.copy()

def save_settings(settings):
    """Save settings to JSON file"""
    settings_path = get_settings_path()
    try:
        with open(settings_path, 'w') as f:
            json.dump(settings, f, indent=2)
        return True
    except Exception as e:
        print(f"[Vision Settings] Error saving settings: {e}")
        return False

def get_feature_setting(feature_name, setting_key, default=None):
    """Get a specific setting for a feature"""
    settings = load_settings()
    if feature_name in settings.get("features", {}):
        return settings["features"][feature_name].get(setting_key, default)
    return default

def set_feature_setting(feature_name, setting_key, value):
    """Set a specific setting for a feature"""
    settings = load_settings()
    if feature_name not in settings["features"]:
        settings["features"][feature_name] = {}
    settings["features"][feature_name][setting_key] = value
    return save_settings(settings)

def is_feature_enabled(feature_name):
    """Check if a feature is enabled"""
    return get_feature_setting(feature_name, "enabled", False)

def set_feature_enabled(feature_name, enabled):
    """Enable or disable a feature"""
    return set_feature_setting(feature_name, "enabled", enabled)
