"""
Mina Vision Satellite GUI Client
Provides a GUI interface for the vision satellite client with system tray support
"""

import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
import os
import sys
import threading
import subprocess
from datetime import datetime
import ctypes
from pathlib import Path
import json
import urllib.parse
import urllib.request
import urllib.error

try:
    from pystray import Icon, Menu, MenuItem
    from PIL import Image, ImageDraw
    PYSTRAY_AVAILABLE = True
except ImportError:
    PYSTRAY_AVAILABLE = False
    print("Warning: pystray not available. System tray support disabled.")

# Import vision client functionality
# Note: We'll set environment variables after loading config, so vision_client won't exit on import
try:
    # Ensure we're in the right directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)
    
    # Import vision_client (it won't exit on import anymore - checks happen at connect time)
    import vision_client
    MEDIAPIPE_AVAILABLE = vision_client.MEDIAPIPE_AVAILABLE
    PYAUTOGUI_AVAILABLE = vision_client.PYAUTOGUI_AVAILABLE
    PYNPUT_AVAILABLE = vision_client.PYNPUT_AVAILABLE
except ImportError as e:
    error_msg = f"Error: vision_client.py not found or failed to import.\n\nDetails: {str(e)}\n\nPlease ensure vision_client.py is in the same directory as vision_gui.py"
    print(error_msg)
    try:
        # Try to show error in GUI if possible
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("Import Error", error_msg)
    except:
        pass
    sys.exit(1)
except Exception as e:
    error_msg = f"Error importing vision_client: {str(e)}"
    print(error_msg)
    try:
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("Import Error", error_msg)
    except:
        pass
    sys.exit(1)

# Versioning
CLIENT_VERSION = "0.1.0"
REMOTE_VERSION_URL = "https://raw.githubusercontent.com/SamN20/Mina/main/satellite/vision_version.txt"
RELEASE_PAGE_URL = "https://github.com/SamN20/Mina/releases/latest"

def hide_console():
    """Hide the console window on Windows"""
    if sys.platform == 'win32':
        try:
            console_window = ctypes.windll.kernel32.GetConsoleWindow()
            if console_window:
                ctypes.windll.user32.ShowWindow(console_window, 0)
        except Exception as e:
            print(f"Could not hide console: {e}")

class VisionGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Mina Vision Satellite Client")
        self.root.geometry("700x800")
        self.root.resizable(True, True)
        
        # System tray support
        self.tray_icon = None
        self.is_visible = True
        
        # Override window close to minimize to tray
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)
        
        # Configuration
        script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        config_dir = os.path.join(script_dir, "config")
        # Check for vision_config.bat first, fallback to satellite_config.bat (if user copied it)
        vision_config = os.path.join(config_dir, "vision_config.bat")
        satellite_config = os.path.join(config_dir, "satellite_config.bat")
        if os.path.exists(vision_config):
            self.config_file = vision_config
        elif os.path.exists(satellite_config):
            self.config_file = satellite_config
        else:
            self.config_file = vision_config  # Will be created with this name
        self.user_id = ""
        self.server_url = ""
        self.token = ""
        
        # State
        self.connected = False
        self.paused = False
        self.sio_client = None
        self.loop = None
        self.thread = None
        self.vision_thread = None
        self.idle_thread = None
        
        # Load config
        if not self.load_config():
            self.show_setup()
            return
        
        # Create UI
        self.create_widgets()
        
        # Auto-connect on startup
        self.root.after(500, self.connect)
        # Check for updates without blocking UI
        threading.Thread(target=self.check_for_updates, daemon=True).start()
        # Setup system tray if available
        if PYSTRAY_AVAILABLE:
            self.setup_tray_icon()
        else:
            self.log("System tray support disabled (missing dependencies)", "WARNING")
    
    def load_config(self):
        """Load configuration from file"""
        if not os.path.exists(self.config_file):
            return False
        
        try:
            with open(self.config_file, 'r') as f:
                for line in f:
                    if line.startswith('set DISCORD_USER_ID='):
                        self.user_id = line.split('=', 1)[1].strip()
                    elif line.startswith('set SATELLITE_SERVER='):
                        self.server_url = line.split('=', 1)[1].strip()
                    elif line.startswith('set SATELLITE_TOKEN='):
                        self.token = line.split('=', 1)[1].strip()
            
            # Set environment variables immediately so vision_client can use them
            if self.user_id and self.server_url and self.token:
                os.environ['DISCORD_USER_ID'] = self.user_id
                os.environ['SATELLITE_SERVER'] = self.server_url
                os.environ['SATELLITE_TOKEN'] = self.token
                return True
            
            return False
        except Exception as e:
            self.log(f"Error loading config: {e}", "ERROR")
            return False
    
    def show_setup(self):
        """Show setup window if no config exists"""
        self.root.withdraw()
        import vision_setup_gui
        setup_window = tk.Toplevel()
        vision_setup_gui.VisionSetup(setup_window, on_complete=self.on_setup_complete)
    
    def on_setup_complete(self):
        """Called after setup is complete"""
        if self.load_config():
            self.root.deiconify()
            self.create_widgets()
            self.root.after(500, self.connect)
        else:
            self.root.quit()
    
    def create_widgets(self):
        # Header
        header = tk.Frame(self.root, bg="#5865F2", height=80)
        header.pack(fill="x")
        header.pack_propagate(False)
        
        title_label = tk.Label(
            header,
            text="👁️ Mina Vision Satellite Client",
            font=("Arial", 18, "bold"),
            bg="#5865F2",
            fg="white"
        )
        title_label.pack(pady=25)
        
        # Status Section
        status_frame = tk.LabelFrame(self.root, text="Status", font=("Arial", 10, "bold"), padx=20, pady=15)
        status_frame.pack(fill="x", padx=20, pady=(20, 10))
        
        # Connection Status
        conn_frame = tk.Frame(status_frame)
        conn_frame.pack(fill="x", pady=5)
        
        tk.Label(conn_frame, text="Connection:", font=("Arial", 10)).pack(side="left")
        self.status_indicator = tk.Canvas(conn_frame, width=20, height=20, highlightthickness=0)
        self.status_indicator.pack(side="left", padx=10)
        self.status_circle = self.status_indicator.create_oval(2, 2, 18, 18, fill="red", outline="")
        
        self.status_label = tk.Label(conn_frame, text="Disconnected", font=("Arial", 10, "bold"), fg="red")
        self.status_label.pack(side="left")
        
        # User Info
        info_frame = tk.Frame(status_frame)
        info_frame.pack(fill="x", pady=5)
        
        tk.Label(info_frame, text=f"User ID:", font=("Arial", 9)).pack(side="left")
        tk.Label(info_frame, text=self.user_id, font=("Arial", 9, "bold")).pack(side="left", padx=5)
        
        # Vision Features Status
        features_frame = tk.Frame(status_frame)
        features_frame.pack(fill="x", pady=5)
        
        tk.Label(features_frame, text="Features:", font=("Arial", 9)).pack(side="left")
        features = []
        if MEDIAPIPE_AVAILABLE:
            features.append("Face Detection")
        if PYAUTOGUI_AVAILABLE:
            features.append("Screen Capture")
        if PYNPUT_AVAILABLE:
            features.append("Idle Detection")
        if not features:
            features.append("Basic Vision")
        tk.Label(features_frame, text=", ".join(features), font=("Arial", 9, "bold"), fg="green").pack(side="left", padx=5)
        
        # Vision Processing Status
        vision_status_frame = tk.Frame(status_frame)
        vision_status_frame.pack(fill="x", pady=5)
        
        tk.Label(vision_status_frame, text="Vision Status:", font=("Arial", 9)).pack(side="left")
        self.vision_status_label = tk.Label(vision_status_frame, text="Not active", font=("Arial", 9, "bold"), fg="gray")
        self.vision_status_label.pack(side="left", padx=5)
        
        # Last event info
        self.last_event_frame = tk.Frame(status_frame)
        self.last_event_frame.pack(fill="x", pady=5)
        
        tk.Label(self.last_event_frame, text="Last Event:", font=("Arial", 9)).pack(side="left")
        self.last_event_label = tk.Label(self.last_event_frame, text="None", font=("Arial", 9), fg="gray")
        self.last_event_label.pack(side="left", padx=5)
        
        # Controls Section
        control_frame = tk.LabelFrame(self.root, text="Controls", font=("Arial", 10, "bold"), padx=20, pady=15)
        control_frame.pack(fill="x", padx=20, pady=10)
        
        button_frame = tk.Frame(control_frame)
        button_frame.pack()
        
        self.connect_btn = tk.Button(
            button_frame,
            text="Connect",
            command=self.connect,
            font=("Arial", 10, "bold"),
            bg="#43B581",
            fg="white",
            padx=20,
            pady=10,
            width=12,
            cursor="hand2"
        )
        self.connect_btn.grid(row=0, column=0, padx=5)
        
        self.pause_btn = tk.Button(
            button_frame,
            text="Pause",
            command=self.toggle_pause,
            font=("Arial", 10),
            padx=20,
            pady=10,
            width=12,
            cursor="hand2",
            state="disabled"
        )
        self.pause_btn.grid(row=0, column=1, padx=5)
        
        self.disconnect_btn = tk.Button(
            button_frame,
            text="Disconnect",
            command=self.disconnect,
            font=("Arial", 10),
            bg="#F04747",
            fg="white",
            padx=20,
            pady=10,
            width=12,
            cursor="hand2",
            state="disabled"
        )
        self.disconnect_btn.grid(row=0, column=2, padx=5)
        
        # Settings button
        settings_frame = tk.Frame(control_frame)
        settings_frame.pack(pady=(10, 0))
        
        tk.Button(
            settings_frame,
            text="⚙️ Settings",
            command=self.open_settings,
            font=("Arial", 9),
            cursor="hand2"
        ).pack()
        
        # Activity Log
        log_frame = tk.LabelFrame(self.root, text="Activity Log", font=("Arial", 10, "bold"), padx=10, pady=10)
        log_frame.pack(fill="both", expand=True, padx=20, pady=10)
        
        self.log_text = scrolledtext.ScrolledText(
            log_frame,
            font=("Consolas", 9),
            height=15,
            state="disabled",
            bg="#f5f5f5"
        )
        self.log_text.pack(fill="both", expand=True)
        
        # Footer
        footer = tk.Frame(self.root)
        footer.pack(fill="x", padx=20, pady=(0, 10))
        
        tk.Label(
            footer,
            text="Give Mina eyes to see your world - Vision processing happens locally",
            font=("Arial", 8),
            fg="gray"
        ).pack()
        
        # Tray hint
        if PYSTRAY_AVAILABLE:
            tray_hint = tk.Label(
                footer,
                text="💡 Tip: Closing this window minimizes to system tray",
                font=("Arial", 8),
                fg="#5865F2",
                cursor="hand2"
            )
            tray_hint.pack(pady=(5, 0))
        
        # Initial log message
        self.log("Vision satellite client initialized", "INFO")
        self.log(f"Ready to connect to {self.server_url}", "INFO")
    
    def log(self, message, level="INFO"):
        """Add message to activity log"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        colors = {
            "INFO": "#2f3136",
            "SUCCESS": "#43B581",
            "ERROR": "#F04747",
            "WARNING": "#FAA61A",
            "EVENT": "#5865F2"
        }
        
        self.log_text.config(state="normal")
        self.log_text.insert("end", f"[{timestamp}] ", "timestamp")
        self.log_text.insert("end", f"{message}\n", level)
        
        # Configure tags
        self.log_text.tag_config("timestamp", foreground="gray")
        for tag, color in colors.items():
            self.log_text.tag_config(tag, foreground=color)
        
        self.log_text.see("end")
        self.log_text.config(state="disabled")
    
    def update_status(self, connected):
        """Update connection status UI"""
        self.connected = connected
        
        if connected:
            self.status_indicator.itemconfig(self.status_circle, fill="#43B581")
            self.status_label.config(text="Connected", fg="#43B581")
            self.connect_btn.config(state="disabled")
            self.pause_btn.config(state="normal")
            self.disconnect_btn.config(state="normal")
        else:
            self.status_indicator.itemconfig(self.status_circle, fill="#F04747")
            self.status_label.config(text="Disconnected", fg="#F04747")
            self.connect_btn.config(state="normal")
            self.pause_btn.config(state="disabled", text="Pause")
            self.disconnect_btn.config(state="disabled")
            self.paused = False
            self.update_vision_status("Not active", "gray")
    
    def update_vision_status(self, status, color="gray"):
        """Update vision processing status"""
        self.vision_status_label.config(text=status, fg=color)
    
    def update_last_event(self, event_text, level="INFO"):
        """Update last event display"""
        self.last_event_label.config(text=event_text)
        # Also log it
        self.log(f"Vision: {event_text}", level)
    
    def toggle_pause(self):
        """Toggle pause state"""
        self.paused = not self.paused
        
        if self.paused:
            self.pause_btn.config(text="Resume", bg="#FAA61A")
            self.status_label.config(text="Paused", fg="#FAA61A")
            self.status_indicator.itemconfig(self.status_circle, fill="#FAA61A")
            self.log("Vision paused - events will be ignored", "WARNING")
        else:
            self.pause_btn.config(text="Pause", bg="SystemButtonFace")
            self.status_label.config(text="Connected", fg="#43B581")
            self.status_indicator.itemconfig(self.status_circle, fill="#43B581")
            self.log("Vision resumed - ready for events", "SUCCESS")
    
    def connect(self):
        """Connect to satellite server"""
        if not self.server_url:
            self.log("Error: Server URL not configured", "ERROR")
            messagebox.showerror("Configuration Error", "Server URL is not configured.")
            return
        
        if not self.user_id or not self.token:
            self.log("Error: User ID or token not configured", "ERROR")
            messagebox.showerror("Configuration Error", "User ID or token is missing.")
            return
        
        self.log(f"Connecting to {self.server_url}...", "INFO")
        
        # Set environment variables for vision_client
        os.environ['DISCORD_USER_ID'] = self.user_id
        os.environ['SATELLITE_SERVER'] = self.server_url
        os.environ['SATELLITE_TOKEN'] = self.token
        
        # Start asyncio in separate thread
        self.thread = threading.Thread(target=self.run_client, daemon=True)
        self.thread.start()
    
    def disconnect(self):
        """Disconnect from satellite server"""
        if self.sio_client and self.connected:
            self.log("Disconnecting...", "INFO")
            import asyncio
            import vision_client
            
            # Stop vision loops first
            vision_client.vision_running = False
            vision_client.idle_running = False
            
            # Release webcam
            try:
                if vision_client.webcam is not None:
                    vision_client.webcam.release()
                    vision_client.webcam = None
                    self.log("Webcam released", "INFO")
            except Exception as e:
                self.log(f"Error releasing webcam: {e}", "WARNING")
            
            # Wait a moment for loops to stop
            import time
            time.sleep(0.5)
            
            # Disconnect socket
            if self.loop and self.sio_client:
                try:
                    asyncio.run_coroutine_threadsafe(self.sio_client.disconnect(), self.loop)
                except Exception as e:
                    self.log(f"Error disconnecting: {e}", "WARNING")
            
            self.connected = False
            self.update_status(False)
            self.log("Disconnected", "INFO")
    
    def open_settings(self):
        """Open settings window"""
        import vision_settings_gui
        settings_window = vision_settings_gui.VisionSettingsWindow(
            self.root,
            on_save_callback=self.on_settings_saved
        )
    
    def on_settings_saved(self):
        """Handle settings save"""
        self.log("Settings updated. Please reconnect if connected.", "INFO")
        # Reload settings in vision_client
        import vision_client
        vision_client.load_vision_settings()
    
    def run_client(self):
        """Run the socket.io client in asyncio loop"""
        import asyncio
        
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        
        # Set environment variables for vision_client module
        os.environ['DISCORD_USER_ID'] = self.user_id
        os.environ['SATELLITE_SERVER'] = self.server_url
        os.environ['SATELLITE_TOKEN'] = self.token
        
        # Reload vision_client to pick up new env vars
        import importlib
        importlib.reload(vision_client)
        
        sio = vision_client.sio
        
        self.sio_client = sio
        
        @sio.event
        async def connect():
            self.root.after(0, lambda: self.log("Connected to server!", "SUCCESS"))
            self.root.after(0, lambda: self.update_status(True))
            await sio.emit('register', {
                'userId': self.user_id,
                'token': self.token,
                'capabilities': ['vision', 'webcam_snapshot', 'screen_snapshot', 'motion_events', 'ocr_text']
            })
        
        @sio.event
        async def connect_error(data):
            self.root.after(0, lambda: self.log(f"Connection failed: {data}", "ERROR"))
            self.root.after(0, lambda: self.update_status(False))
        
        @sio.event
        async def disconnect():
            self.root.after(0, lambda: self.log("Disconnected from server", "WARNING"))
            self.root.after(0, lambda: self.update_status(False))
        
        @sio.event
        async def registered(msg):
            self.root.after(0, lambda: self.log(msg, "SUCCESS"))
            self.root.after(0, lambda: self.log("Vision features active", "SUCCESS"))
            self.root.after(0, lambda: self.update_vision_status("Active", "green"))
            
            # Initialize webcam
            if vision_client.init_webcam():
                self.root.after(0, lambda: self.log("Webcam initialized - starting vision processing", "SUCCESS"))
                
                # Set up callback for vision events to update GUI
                def on_vision_event(event_type, event_text):
                    self.root.after(0, lambda: self.update_last_event(event_text, "EVENT"))
                
                vision_client.set_vision_event_callback(on_vision_event)
                
                # Start vision loops as tasks in the existing event loop
                # Don't use run_until_complete - the loop is already running
                asyncio.create_task(vision_client.vision_loop())
                self.root.after(0, lambda: self.log("Motion & face detection started", "INFO"))
                
                if PYNPUT_AVAILABLE:
                    asyncio.create_task(vision_client.idle_detection_loop())
                    self.root.after(0, lambda: self.log("Idle detection started", "INFO"))
            else:
                self.root.after(0, lambda: self.log("Warning: Webcam not available", "WARNING"))
                self.root.after(0, lambda: self.update_vision_status("Webcam unavailable", "red"))
        
        @sio.on('vision_event')
        async def on_vision_event(data):
            """Handle vision events from client (for logging/debugging)"""
            event_type = data.get('eventType', 'unknown')
            event_data = data.get('eventData', {})
            
            # Update last event display
            if event_type == 'motion_detected':
                pixels = event_data.get('motionPixels', 0)
                self.root.after(0, lambda: self.update_last_event(f"Motion: {pixels} pixels", "EVENT"))
            elif event_type == 'face_status':
                has_face = event_data.get('hasFace', False)
                count = event_data.get('faceCount', 0)
                status = f"{count} face(s)" if has_face else "No faces"
                self.root.after(0, lambda: self.update_last_event(f"Face: {status}", "EVENT"))
            elif event_type == 'brightness_status':
                brightness = event_data.get('brightness', 0)
                is_dark = event_data.get('isDark', False)
                status = f"{brightness:.0f} ({'Dark' if is_dark else 'Bright'})"
                self.root.after(0, lambda: self.update_last_event(f"Brightness: {status}", "EVENT"))
            elif event_type == 'idle_status':
                is_idle = event_data.get('isIdle', False)
                duration = event_data.get('idleDuration', 0)
                status = f"Idle: {duration:.0f}s" if is_idle else "Active"
                self.root.after(0, lambda: self.update_last_event(status, "EVENT"))
        
        # Hook into vision events for display
        # Note: vision_client emits events directly, but we can monitor them via socket.io
        # Actually, the events are emitted from vision_client, so we need to catch them differently
        # For now, we'll rely on console output and the server logs
        
        try:
            self.loop.run_until_complete(sio.connect(self.server_url))
            self.loop.run_forever()
        except Exception as e:
            self.root.after(0, lambda: self.log(f"Connection error: {e}", "ERROR"))
            self.root.after(0, lambda: self.update_status(False))
    
    def setup_tray_icon(self):
        """Setup system tray icon"""
        if not PYSTRAY_AVAILABLE:
            return
        
        try:
            # Create icon
            image = Image.new('RGB', (64, 64), color='#5865F2')
            draw = ImageDraw.Draw(image)
            draw.ellipse([16, 16, 48, 48], fill='white')
            draw.ellipse([20, 20, 44, 44], fill='#5865F2')
            
            menu = Menu(
                MenuItem('Show', self.show_window),
                MenuItem('Hide', self.hide_window),
                MenuItem('Quit', self.quit_app)
            )
            
            self.tray_icon = Icon("Mina Vision", image, "Mina Vision Satellite", menu)
            threading.Thread(target=self.tray_icon.run, daemon=True).start()
        except Exception as e:
            self.log(f"Failed to setup tray icon: {e}", "WARNING")
    
    def show_window(self):
        """Show the main window"""
        self.root.deiconify()
        self.root.lift()
        self.is_visible = True
    
    def hide_window(self):
        """Hide the main window"""
        self.root.withdraw()
        self.is_visible = False
    
    def quit_app(self):
        """Quit the application"""
        if self.tray_icon:
            self.tray_icon.stop()
        self.root.quit()
    
    def on_closing(self):
        """Handle window close event"""
        if PYSTRAY_AVAILABLE:
            self.hide_window()
        else:
            self.quit_app()
    
    def parse_version(self, version_str):
        parts = []
        for segment in version_str.split('.'):
            try:
                parts.append(int(segment))
            except ValueError:
                parts.append(0)
        return tuple(parts)
    
    def get_local_version(self):
        try:
            script_dir = Path(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            version_file = script_dir / "vision_version.txt"
            if version_file.exists():
                return version_file.read_text(encoding="utf-8").strip()
        except Exception:
            pass
        return CLIENT_VERSION
    
    def check_for_updates(self):
        local_version = self.get_local_version()
        try:
            request = urllib.request.Request(
                REMOTE_VERSION_URL,
                headers={'User-Agent': 'Mina-Vision-Client'}
            )
            with urllib.request.urlopen(request, timeout=5) as resp:
                remote_version = resp.read().decode("utf-8").strip()
        except (urllib.error.URLError, TimeoutError, ValueError):
            return
        
        try:
            if self.parse_version(remote_version) > self.parse_version(local_version):
                self.root.after(0, lambda: self.prompt_update(remote_version, local_version))
        except Exception:
            return
    
    def prompt_update(self, remote_version, local_version):
        try:
            answer = messagebox.askyesnocancel(
                "Update Available",
                f"A new version of Mina Vision Satellite is available!\n\n"
                f"Current version: {local_version}\n"
                f"New version: {remote_version}\n\n"
                f"Would you like to download it now?",
                icon='question'
            )
            
            if answer:
                import webbrowser
                webbrowser.open(RELEASE_PAGE_URL)
        except Exception:
            pass

def main():
    try:
        hide_console()
        root = tk.Tk()
        app = VisionGUI(root)
        root.mainloop()
    except Exception as e:
        # Show error in message box if GUI fails to start
        import traceback
        error_msg = f"Failed to start Vision GUI:\n\n{str(e)}\n\n{traceback.format_exc()}"
        print(error_msg)  # Also print to console if visible
        try:
            root = tk.Tk()
            root.withdraw()  # Hide main window
            from tkinter import messagebox
            messagebox.showerror("Vision GUI Error", error_msg)
        except:
            # If even messagebox fails, just print
            print("Critical error - cannot show GUI")
        sys.exit(1)

if __name__ == "__main__":
    main()
