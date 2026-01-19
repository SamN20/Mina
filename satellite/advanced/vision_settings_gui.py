"""
Vision Settings GUI
Provides a GUI for configuring vision features, toggles, and rate limits
"""

import tkinter as tk
from tkinter import ttk, messagebox
import vision_settings

class VisionSettingsWindow:
    def __init__(self, parent, on_save_callback=None):
        self.parent = parent
        self.on_save_callback = on_save_callback
        self.settings = vision_settings.load_settings()
        
        # Create window
        self.window = tk.Toplevel(parent)
        self.window.title("Vision Settings")
        self.window.geometry("600x700")
        self.window.resizable(True, True)
        
        # Make it modal
        self.window.transient(parent)
        self.window.grab_set()
        
        # Create widgets
        self.create_widgets()
        
        # Center window
        self.center_window()
    
    def center_window(self):
        """Center the window on the parent"""
        self.window.update_idletasks()
        width = self.window.winfo_width()
        height = self.window.winfo_height()
        x = (self.window.winfo_screenwidth() // 2) - (width // 2)
        y = (self.window.winfo_screenheight() // 2) - (height // 2)
        self.window.geometry(f'{width}x{height}+{x}+{y}')
    
    def create_widgets(self):
        """Create all GUI widgets"""
        # Header
        header = tk.Frame(self.window, bg="#5865F2", height=60)
        header.pack(fill="x")
        header.pack_propagate(False)
        
        tk.Label(
            header,
            text="⚙️ Vision Feature Settings",
            font=("Arial", 16, "bold"),
            bg="#5865F2",
            fg="white"
        ).pack(pady=15)
        
        # Scrollable frame
        canvas = tk.Canvas(self.window, highlightthickness=0)
        scrollbar = ttk.Scrollbar(self.window, orient="vertical", command=canvas.yview)
        scrollable_frame = tk.Frame(canvas)
        
        scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        
        canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        
        # Content
        self.create_feature_settings(scrollable_frame)
        
        # Pack scrollable area
        canvas.pack(side="left", fill="both", expand=True, padx=10, pady=10)
        scrollbar.pack(side="right", fill="y", pady=10)
        
        # Footer buttons
        footer = tk.Frame(self.window)
        footer.pack(fill="x", padx=20, pady=10)
        
        tk.Button(
            footer,
            text="Cancel",
            command=self.window.destroy,
            font=("Arial", 10),
            padx=20,
            pady=5
        ).pack(side="right", padx=5)
        
        tk.Button(
            footer,
            text="Save",
            command=self.save_settings,
            font=("Arial", 10, "bold"),
            bg="#43B581",
            fg="white",
            padx=20,
            pady=5
        ).pack(side="right", padx=5)
        
        tk.Button(
            footer,
            text="Reset to Defaults",
            command=self.reset_defaults,
            font=("Arial", 9),
            fg="gray",
            padx=10,
            pady=5
        ).pack(side="left")
    
    def create_feature_settings(self, parent):
        """Create settings for each feature"""
        self.widgets = {}
        
        # Motion Detection
        self.create_feature_section(
            parent,
            "motion_detection",
            "Motion Detection",
            "Detects movement in webcam feed",
            [
                ("enabled", "Enable Motion Detection", "bool"),
                ("rate_limit_seconds", "Rate Limit (seconds)", "float", 0.1, 60.0),
                ("motion_threshold", "Motion Threshold (pixels)", "int", 100, 50000)
            ]
        )
        
        # Face Detection
        self.create_feature_section(
            parent,
            "face_detection",
            "Face Detection",
            "Detects faces and counts people",
            [
                ("enabled", "Enable Face Detection", "bool"),
                ("rate_limit_seconds", "Rate Limit (seconds)", "float", 0.1, 60.0)
            ]
        )
        
        # Brightness Detection
        self.create_feature_section(
            parent,
            "brightness_detection",
            "Brightness Detection",
            "Detects room brightness and dark/light state",
            [
                ("enabled", "Enable Brightness Detection", "bool"),
                ("rate_limit_seconds", "Rate Limit (seconds)", "float", 0.1, 60.0),
                ("dark_threshold", "Dark Threshold", "float", 0, 255),
                ("change_threshold", "Change Threshold", "float", 1, 50)
            ]
        )
        
        # Idle Detection
        self.create_feature_section(
            parent,
            "idle_detection",
            "Idle Detection",
            "Detects when user is idle (no mouse/keyboard activity)",
            [
                ("enabled", "Enable Idle Detection", "bool"),
                ("rate_limit_seconds", "Rate Limit (seconds)", "float", 1.0, 300.0),
                ("idle_threshold_seconds", "Idle Threshold (seconds)", "float", 10, 3600)
            ]
        )
        
        # On-Demand Snapshots
        self.create_feature_section(
            parent,
            "on_demand_snapshots",
            "On-Demand Snapshots",
            "Allow Mina to capture webcam/screen on command",
            [
                ("enabled", "Enable On-Demand Snapshots", "bool"),
                ("webcam_enabled", "Allow Webcam Snapshots", "bool"),
                ("screen_enabled", "Allow Screen Snapshots", "bool")
            ]
        )
    
    def create_feature_section(self, parent, feature_key, title, description, settings):
        """Create a settings section for a feature"""
        frame = tk.LabelFrame(
            parent,
            text=title,
            font=("Arial", 11, "bold"),
            padx=15,
            pady=10
        )
        frame.pack(fill="x", padx=10, pady=5)
        
        # Description
        tk.Label(
            frame,
            text=description,
            font=("Arial", 9),
            fg="gray",
            wraplength=550
        ).pack(anchor="w", pady=(0, 10))
        
        # Settings widgets
        self.widgets[feature_key] = {}
        
        for setting in settings:
            setting_key = setting[0]
            label_text = setting[1]
            setting_type = setting[2]
            
            row = tk.Frame(frame)
            row.pack(fill="x", pady=3)
            
            tk.Label(row, text=label_text + ":", font=("Arial", 9), width=25, anchor="w").pack(side="left")
            
            current_value = self.settings["features"][feature_key].get(setting_key)
            
            if setting_type == "bool":
                var = tk.BooleanVar(value=current_value)
                widget = tk.Checkbutton(row, variable=var)
                widget.pack(side="left")
                self.widgets[feature_key][setting_key] = var
            elif setting_type == "float":
                min_val = setting[3] if len(setting) > 3 else 0.0
                max_val = setting[4] if len(setting) > 4 else 1000.0
                var = tk.DoubleVar(value=current_value)
                widget = tk.Spinbox(
                    row,
                    from_=min_val,
                    to=max_val,
                    increment=0.1,
                    textvariable=var,
                    width=10,
                    format="%.1f"
                )
                widget.pack(side="left", padx=5)
                self.widgets[feature_key][setting_key] = var
            elif setting_type == "int":
                min_val = setting[3] if len(setting) > 3 else 0
                max_val = setting[4] if len(setting) > 4 else 100000
                var = tk.IntVar(value=current_value)
                widget = tk.Spinbox(
                    row,
                    from_=min_val,
                    to=max_val,
                    textvariable=var,
                    width=10
                )
                widget.pack(side="left", padx=5)
                self.widgets[feature_key][setting_key] = var
    
    def save_settings(self):
        """Save all settings to file"""
        try:
            # Update settings from widgets
            for feature_key, feature_widgets in self.widgets.items():
                if feature_key not in self.settings["features"]:
                    self.settings["features"][feature_key] = {}
                
                for setting_key, widget in feature_widgets.items():
                    if isinstance(widget, tk.BooleanVar):
                        value = widget.get()
                    elif isinstance(widget, tk.DoubleVar):
                        value = widget.get()
                    elif isinstance(widget, tk.IntVar):
                        value = widget.get()
                    else:
                        continue
                    
                    self.settings["features"][feature_key][setting_key] = value
            
            # Save to file
            if vision_settings.save_settings(self.settings):
                messagebox.showinfo("Success", "Settings saved successfully!")
                if self.on_save_callback:
                    self.on_save_callback()
                self.window.destroy()
            else:
                messagebox.showerror("Error", "Failed to save settings.")
        except Exception as e:
            messagebox.showerror("Error", f"Error saving settings: {e}")
    
    def reset_defaults(self):
        """Reset all settings to defaults"""
        if messagebox.askyesno("Reset Settings", "Are you sure you want to reset all settings to defaults?"):
            self.settings = vision_settings.DEFAULT_SETTINGS.copy()
            self.window.destroy()
            # Reopen with defaults
            self.__init__(self.parent, self.on_save_callback)
