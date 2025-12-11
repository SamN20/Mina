import tkinter as tk
from tkinter import ttk, messagebox
import os
import sys
import subprocess
import ctypes

# Check if winsdk is available
try:
    import winsdk
    WINSDK_AVAILABLE = True
except ImportError:
    WINSDK_AVAILABLE = False

# Check if pynput is available
try:
    import pynput
    PYNPUT_AVAILABLE = True
except ImportError:
    PYNPUT_AVAILABLE = False

class SatelliteSetup:
    def __init__(self, root, on_complete=None):
        self.root = root
        self.root.title("Mina Satellite Client - Setup")
        self.root.geometry("500x500")
        self.root.resizable(False, False)
        self.on_complete = on_complete
        
        # Load existing config if available
        script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.config_file = os.path.join(script_dir, "config", "satellite_config.bat")
        self.load_config()
        
        # Check for pynput and offer to install if missing (for media controls in fullscreen games)
        if not PYNPUT_AVAILABLE:
            self.prompt_pynput_install()
        
        # Check for winsdk and offer to install if missing
        if not WINSDK_AVAILABLE:
            self.prompt_winsdk_install()
        
        # Create UI
        self.create_widgets()
        
    def load_config(self):
        """Load existing configuration from file"""
        self.user_id = ""
        self.server = ""
        self.token = ""
        
        if os.path.exists(self.config_file):
            try:
                with open(self.config_file, 'r') as f:
                    for line in f:
                        if line.startswith('set DISCORD_USER_ID='):
                            self.user_id = line.split('=', 1)[1].strip()
                        elif line.startswith('set SATELLITE_SERVER='):
                            self.server = line.split('=', 1)[1].strip()
                        elif line.startswith('set SATELLITE_TOKEN='):
                            self.token = line.split('=', 1)[1].strip()
            except Exception as e:
                print(f"Error loading config: {e}")
    
    def prompt_pynput_install(self):
        """Prompt user to install pynput if not available"""
        response = messagebox.askyesno(
            "Pynput Not Found",
            "The pynput package is not installed.\n\n"
            "This package is REQUIRED for media control commands to work "
            "reliably, especially during fullscreen games.\n\n"
            "Without it, media controls may not work when playing games.\n\n"
            "Would you like to install it automatically?\n\n"
            "Note: This will run 'pip install pynput'",
            icon='warning'
        )
        
        if response:
            self.install_package('pynput', 
                                'Pynput', 
                                'Media controls will now work in fullscreen games!')
    
    def prompt_winsdk_install(self):
        """Prompt user to install winsdk if not available"""
        response = messagebox.askyesno(
            "Windows SDK Not Found",
            "The Windows SDK (winsdk) package is not installed.\n\n"
            "This package is required for the 'What's playing?' feature "
            "to detect currently playing media.\n\n"
            "Would you like to install it automatically?\n\n"
            "Note: This will run 'pip install winsdk'",
            icon='warning'
        )
        
        if response:
            self.install_package('winsdk',
                                'Windows SDK',
                                "The 'What's playing?' feature will now be available.")
    
    def install_package(self, package_name, display_name, success_message):
        """Install a Python package using pip"""
        try:
            # Show progress message
            progress_window = tk.Toplevel(self.root)
            progress_window.title("Installing...")
            progress_window.geometry("400x150")
            progress_window.resizable(False, False)
            progress_window.transient(self.root)
            progress_window.grab_set()
            
            tk.Label(
                progress_window,
                text=f"Installing {display_name}...",
                font=("Arial", 12, "bold"),
                pady=20
            ).pack()
            
            progress_label = tk.Label(
                progress_window,
                text="Please wait, this may take a minute...",
                font=("Arial", 10)
            )
            progress_label.pack()
            
            # Update the window to show it
            progress_window.update()
            
            # Run pip install
            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", package_name],
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )
            
            progress_window.destroy()
            
            if result.returncode == 0:
                messagebox.showinfo(
                    "Success",
                    f"{display_name} installed successfully!\n\n{success_message}"
                )
                # Update global flags
                global WINSDK_AVAILABLE, PYNPUT_AVAILABLE
                if package_name == 'winsdk':
                    WINSDK_AVAILABLE = True
                elif package_name == 'pynput':
                    PYNPUT_AVAILABLE = True
            else:
                error_msg = result.stderr if result.stderr else result.stdout
                messagebox.showerror(
                    "Installation Failed",
                    f"Failed to install {package_name}:\n\n{error_msg}\n\n"
                    f"You can install it manually later using:\npip install {package_name}"
                )
        except subprocess.TimeoutExpired:
            if 'progress_window' in locals():
                progress_window.destroy()
            messagebox.showerror(
                "Installation Timeout",
                "Installation took too long and was cancelled.\n\n"
                f"Please try installing manually:\npip install {package_name}"
            )
        except Exception as e:
            if 'progress_window' in locals():
                progress_window.destroy()
            messagebox.showerror(
                "Installation Error",
                f"An error occurred during installation:\n\n{e}\n\n"
                f"You can install it manually using:\npip install {package_name}"
            )
    
    def create_widgets(self):
        # Title
        title = tk.Label(
            self.root, 
            text="🛰️ Mina Satellite Client Setup",
            font=("Arial", 16, "bold"),
            pady=20
        )
        title.pack()
        
        # Instructions
        instructions = tk.Label(
            self.root,
            text="Enter your configuration details below:",
            font=("Arial", 10)
        )
        instructions.pack(pady=(0, 20))
        
        # Frame for inputs
        input_frame = tk.Frame(self.root)
        input_frame.pack(padx=40, fill="x")
        
        # Discord User ID
        tk.Label(input_frame, text="Discord User ID:", font=("Arial", 10, "bold")).grid(
            row=0, column=0, sticky="w", pady=(0, 5)
        )
        tk.Label(input_frame, text="Enable Developer Mode, right-click your name, Copy User ID", 
                 font=("Arial", 8), fg="gray").grid(row=1, column=0, sticky="w", pady=(0, 10))
        
        self.user_id_entry = tk.Entry(input_frame, font=("Arial", 10), width=40)
        self.user_id_entry.grid(row=2, column=0, pady=(0, 15))
        self.user_id_entry.insert(0, self.user_id)
        
        # Server Address
        tk.Label(input_frame, text="Server Address:", font=("Arial", 10, "bold")).grid(
            row=3, column=0, sticky="w", pady=(0, 5)
        )
        tk.Label(input_frame, text="Contact bot administrator for this (e.g., wss://server.com)", 
                 font=("Arial", 8), fg="gray").grid(row=4, column=0, sticky="w", pady=(0, 10))
        
        self.server_entry = tk.Entry(input_frame, font=("Arial", 10), width=40)
        self.server_entry.grid(row=5, column=0, pady=(0, 15))
        self.server_entry.insert(0, self.server)
        
        # Token
        tk.Label(input_frame, text="Authentication Token:", font=("Arial", 10, "bold")).grid(
            row=6, column=0, sticky="w", pady=(0, 5)
        )
        tk.Label(input_frame, text="Contact bot administrator for this", 
                 font=("Arial", 8), fg="gray").grid(row=7, column=0, sticky="w", pady=(0, 10))
        
        self.token_entry = tk.Entry(input_frame, font=("Arial", 10), width=40, show="*")
        self.token_entry.grid(row=8, column=0, pady=(0, 10))
        self.token_entry.insert(0, self.token)
        
        # Show/Hide token checkbox
        self.show_token = tk.BooleanVar()
        tk.Checkbutton(
            input_frame, 
            text="Show token", 
            variable=self.show_token,
            command=self.toggle_token_visibility
        ).grid(row=9, column=0, sticky="w")
        
        # Buttons
        button_frame = tk.Frame(self.root)
        button_frame.pack(pady=30)
        
        save_btn = tk.Button(
            button_frame,
            text="Save & Start Client",
            command=self.save_and_start,
            font=("Arial", 10, "bold"),
            bg="#5865F2",
            fg="white",
            padx=20,
            pady=10,
            cursor="hand2"
        )
        save_btn.grid(row=0, column=0, padx=5)
        
        save_only_btn = tk.Button(
            button_frame,
            text="Save Only",
            command=self.save_config,
            font=("Arial", 10),
            padx=20,
            pady=10,
            cursor="hand2"
        )
        save_only_btn.grid(row=0, column=1, padx=5)
    
    def toggle_token_visibility(self):
        if self.show_token.get():
            self.token_entry.config(show="")
        else:
            self.token_entry.config(show="*")
    
    def save_config(self):
        user_id = self.user_id_entry.get().strip()
        server = self.server_entry.get().strip()
        token = self.token_entry.get().strip()
        
        # Validation
        if not user_id:
            messagebox.showerror("Error", "Discord User ID is required!")
            return False
        
        if not server:
            messagebox.showerror("Error", "Server Address is required!")
            return False
            
        if not token:
            messagebox.showerror("Error", "Authentication Token is required!")
            return False
        
        # Save to config file
        try:
            # Create config directory if it doesn't exist
            config_dir = os.path.dirname(self.config_file)
            os.makedirs(config_dir, exist_ok=True)
            
            with open(self.config_file, 'w') as f:
                f.write("@echo off\n")
                f.write(f"set DISCORD_USER_ID={user_id}\n")
                f.write(f"set SATELLITE_SERVER={server}\n")
                f.write(f"set SATELLITE_TOKEN={token}\n")
            
            messagebox.showinfo("Success", "Configuration saved successfully!")
            return True
        except Exception as e:
            messagebox.showerror("Error", f"Failed to save configuration: {e}")
            return False
    
    def save_and_start(self):
        if self.save_config():
            # Close the GUI
            self.root.destroy()
            
            # Call completion callback if provided
            if self.on_complete:
                self.on_complete()
            else:
                # Start the GUI client
                try:
                    subprocess.Popen([sys.executable, "satellite_gui.py"])
                except Exception as e:
                    messagebox.showerror("Error", f"Failed to start client: {e}")

def hide_console():
    """Hide the console window on Windows"""
    if sys.platform == 'win32':
        try:
            # Get the console window handle
            console_window = ctypes.windll.kernel32.GetConsoleWindow()
            if console_window:
                # Hide the window (SW_HIDE = 0)
                ctypes.windll.user32.ShowWindow(console_window, 0)
        except Exception as e:
            print(f"Could not hide console: {e}")

def main():
    # Hide the console window
    hide_console()
    
    root = tk.Tk()
    app = SatelliteSetup(root)
    root.mainloop()

if __name__ == "__main__":
    main()
