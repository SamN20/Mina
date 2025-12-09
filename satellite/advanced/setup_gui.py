import tkinter as tk
from tkinter import ttk, messagebox
import os
import sys
import subprocess

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

def main():
    root = tk.Tk()
    app = SatelliteSetup(root)
    root.mainloop()

if __name__ == "__main__":
    main()
