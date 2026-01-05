import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
import socketio
import os
import sys
import asyncio
import threading
import subprocess
from datetime import datetime
import ctypes
import webbrowser
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path
import base64
import io

try:
    from pystray import Icon, Menu, MenuItem
    from PIL import Image, ImageDraw
    PYSTRAY_AVAILABLE = True
except ImportError:
    PYSTRAY_AVAILABLE = False
    print("Warning: pystray not available. System tray support disabled.")

try:
    from pynput.keyboard import Key, Controller
    keyboard = Controller()
    PYNPUT_AVAILABLE = True
except ImportError:
    PYNPUT_AVAILABLE = False
    print("Warning: pynput not available. Using fallback for media controls.")
    try:
        import pyautogui
        PYAUTOGUI_AVAILABLE = True
    except ImportError:
        PYAUTOGUI_AVAILABLE = False
        print("Error: Neither pynput nor pyautogui available. Media control will not work.")

try:
    from winsdk.windows.media.control import GlobalSystemMediaTransportControlsSessionManager
    WINSDK_AVAILABLE = True
except ImportError:
    WINSDK_AVAILABLE = False
    print("Warning: winsdk not available. 'What's playing?' feature will not work.")

# Versioning (module level - always available)
CLIENT_VERSION = "0.2.0"
REMOTE_VERSION_URL = "https://raw.githubusercontent.com/SamN20/Mina/main/satellite/version.txt"
RELEASE_PAGE_URL = "https://github.com/SamN20/Mina/releases/latest"

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

class SatelliteGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Mina Satellite Client")
        self.root.geometry("600x700")
        self.root.resizable(False, False)
        
        # System tray support
        self.tray_icon = None
        self.is_visible = True
        
        # Override window close to minimize to tray
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)
        
        # Configuration
        script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.config_file = os.path.join(script_dir, "config", "satellite_config.bat")
        self.user_id = ""
        self.server_url = ""
        self.token = ""
        
        # State
        self.connected = False
        self.paused = False
        self.sio = None
        self.loop = None
        self.thread = None
        
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
            # Show tray notification on first run
            self.root.after(1000, self.show_tray_notification)
    
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
            
            return bool(self.user_id and self.server_url and self.token)
        except Exception as e:
            self.log(f"Error loading config: {e}", "ERROR")
            return False
    
    def show_setup(self):
        """Show setup window if no config exists"""
        self.root.withdraw()
        import setup_gui
        setup_window = tk.Toplevel()
        setup_app = setup_gui.SatelliteSetup(setup_window, on_complete=self.on_setup_complete)
    
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
            text="🛰️ Mina Satellite Client",
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

        tk.Button(
            settings_frame,
            text="👁️ Open Mina View",
            command=self.open_vrm_viewer,
            font=("Arial", 9),
            cursor="hand2"
        ).pack(pady=(6, 0))

        tk.Button(
            settings_frame,
            text="🔗 Create Shortcuts",
            command=self.create_shortcuts_dialog,
            font=("Arial", 9),
            cursor="hand2"
        ).pack(pady=(6, 0))
        
        tk.Button(
            settings_frame,
            text="🔍 Test Connection",
            command=self.test_connection,
            font=("Arial", 9),
            cursor="hand2"
        ).pack(pady=(6, 0))
        
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
            text="Control your PC media with voice commands through Mina",
            font=("Arial", 8),
            fg="gray"
        ).pack()
        
        # Tray hint
        if PYSTRAY_AVAILABLE:
            tray_hint = tk.Label(
                footer,
                text="💡 Tip: Closing this window minimizes to system tray (hidden icons area)",
                font=("Arial", 8),
                fg="#5865F2",
                cursor="hand2"
            )
            tray_hint.pack(pady=(5, 0))
            tray_hint.bind("<Button-1>", lambda e: self.show_tray_info())
        
        # Initial log message
        self.log("Satellite client initialized", "INFO")
        self.log(f"Ready to connect to {self.server_url}", "INFO")
    
    def log(self, message, level="INFO"):
        """Add message to activity log"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        colors = {
            "INFO": "#2f3136",
            "SUCCESS": "#43B581",
            "ERROR": "#F04747",
            "WARNING": "#FAA61A",
            "COMMAND": "#5865F2"
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
    
    def toggle_pause(self):
        """Toggle pause state"""
        self.paused = not self.paused
        
        if self.paused:
            self.pause_btn.config(text="Resume", bg="#FAA61A")
            self.status_label.config(text="Paused", fg="#FAA61A")
            self.status_indicator.itemconfig(self.status_circle, fill="#FAA61A")
            self.log("Satellite paused - commands will be ignored", "WARNING")
        else:
            self.pause_btn.config(text="Pause", bg="SystemButtonFace")
            self.status_label.config(text="Connected", fg="#43B581")
            self.status_indicator.itemconfig(self.status_circle, fill="#43B581")
            self.log("Satellite resumed - ready for commands", "SUCCESS")
    
    def connect(self):
        """Connect to satellite server"""
        self.log(f"Connecting to {self.server_url}...", "INFO")
        
        # Start asyncio in separate thread
        self.thread = threading.Thread(target=self.run_client, daemon=True)
        self.thread.start()
    
    def disconnect(self):
        """Disconnect from satellite server"""
        if self.sio and self.connected:
            self.log("Disconnecting...", "INFO")
            asyncio.run_coroutine_threadsafe(self.sio.disconnect(), self.loop)
    
    def open_settings(self):
        """Open settings window"""
        import setup_gui
        settings_window = tk.Toplevel(self.root)
        setup_gui.SatelliteSetup(settings_window, on_complete=lambda: self.on_settings_saved(settings_window))
    
    def on_settings_saved(self, window):
        """Handle settings save"""
        window.destroy()
        self.load_config()
        self.log("Settings updated. Please reconnect if connected.", "INFO")

    def open_vrm_viewer(self):
        """Open the VRM viewer in the default browser with current credentials"""
        try:
            vrm_path = Path(os.path.join(os.path.dirname(os.path.abspath(__file__)), "vrm_client.html"))
            if not vrm_path.exists():
                self.log("VRM client file not found.", "ERROR")
                return

            query = urllib.parse.urlencode({
                "server": self.server_url,
                "token": self.token,
                "userId": f"{self.user_id}-vrm"
            })
            url = f"{vrm_path.as_uri()}?{query}"
            webbrowser.open(url)
            self.log("Opening Mina view in browser...", "INFO")
        except Exception as e:
            self.log(f"Failed to open Mina view: {e}", "ERROR")

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
            version_file = script_dir / "version.txt"
            if version_file.exists():
                return version_file.read_text(encoding="utf-8").strip()
        except Exception:
            pass
        return CLIENT_VERSION

    def check_for_updates(self):
        local_version = self.get_local_version()
        try:
            # Add User-Agent header for better GitHub compatibility
            request = urllib.request.Request(
                REMOTE_VERSION_URL,
                headers={'User-Agent': 'Mina-Satellite-Client'}
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
            answer = messagebox.askyesno(
                "Update Available",
                f"A newer version of Mina Satellite is available.\n\nCurrent: {local_version}\nLatest: {remote_version}\n\nOpen download page?"
            )
            if answer:
                webbrowser.open(RELEASE_PAGE_URL)
                self.log("Opening release page for update...", "INFO")
        except Exception as e:
            self.log(f"Failed to show update prompt: {e}", "ERROR")

    def create_shortcuts_dialog(self):
        """Show dialog for creating shortcuts"""
        dialog = tk.Toplevel(self.root)
        dialog.title("Create Shortcuts")
        dialog.geometry("350x200")
        dialog.resizable(False, False)
        dialog.transient(self.root)
        dialog.grab_set()

        tk.Label(
            dialog,
            text="Create Shortcuts",
            font=("Arial", 12, "bold"),
            pady=15
        ).pack()

        tk.Label(
            dialog,
            text="Choose where to create shortcuts:",
            font=("Arial", 9)
        ).pack(pady=(0, 15))

        button_frame = tk.Frame(dialog)
        button_frame.pack(pady=10)

        tk.Button(
            button_frame,
            text="📌 Desktop Only",
            command=lambda: self.create_shortcuts(desktop=True, startmenu=False, dialog=dialog),
            font=("Arial", 10),
            padx=15,
            pady=8,
            cursor="hand2"
        ).pack(pady=5)

        tk.Button(
            button_frame,
            text="📂 Start Menu Only",
            command=lambda: self.create_shortcuts(desktop=False, startmenu=True, dialog=dialog),
            font=("Arial", 10),
            padx=15,
            pady=8,
            cursor="hand2"
        ).pack(pady=5)

        tk.Button(
            button_frame,
            text="✨ Both",
            command=lambda: self.create_shortcuts(desktop=True, startmenu=True, dialog=dialog),
            font=("Arial", 10, "bold"),
            bg="#5865F2",
            fg="white",
            padx=15,
            pady=8,
            cursor="hand2"
        ).pack(pady=5)

    def create_shortcuts(self, desktop=True, startmenu=True, dialog=None):
        """Create shortcuts in specified locations using PowerShell"""
        if dialog:
            dialog.destroy()

        script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        target_path = os.path.join(script_dir, "Start Satellite.bat")
        created = []
        failed = []

        if desktop:
            try:
                desktop_path = os.path.join(os.path.expanduser("~"), "Desktop")
                shortcut_path = os.path.join(desktop_path, "Mina Satellite.lnk")
                
                # Use PowerShell to create shortcut
                ps_script = f'''
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("{shortcut_path}")
$Shortcut.TargetPath = "{target_path}"
$Shortcut.WorkingDirectory = "{script_dir}"
$Shortcut.Description = "Mina Satellite - Voice controlled media"
$Shortcut.Save()
'''
                subprocess.run(
                    ["powershell", "-Command", ps_script],
                    check=True,
                    capture_output=True,
                    text=True
                )
                created.append("Desktop")
                self.log("Desktop shortcut created", "SUCCESS")
            except Exception as e:
                failed.append(f"Desktop: {e}")
                self.log(f"Failed to create desktop shortcut: {e}", "ERROR")

        if startmenu:
            try:
                start_menu = os.path.join(
                    os.environ.get('APPDATA'),
                    'Microsoft', 'Windows', 'Start Menu', 'Programs'
                )
                os.makedirs(start_menu, exist_ok=True)
                shortcut_path = os.path.join(start_menu, "Mina Satellite.lnk")

                # Use PowerShell to create shortcut
                ps_script = f'''
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("{shortcut_path}")
$Shortcut.TargetPath = "{target_path}"
$Shortcut.WorkingDirectory = "{script_dir}"
$Shortcut.Description = "Mina Satellite - Voice controlled media"
$Shortcut.Save()
'''
                subprocess.run(
                    ["powershell", "-Command", ps_script],
                    check=True,
                    capture_output=True,
                    text=True
                )
                created.append("Start Menu")
                self.log("Start Menu shortcut created", "SUCCESS")
            except Exception as e:
                failed.append(f"Start Menu: {e}")
                self.log(f"Failed to create Start Menu shortcut: {e}", "ERROR")

        # Show result
        if created:
            msg = f"Shortcuts created in: {', '.join(created)}"
            if failed:
                msg += f"\n\nFailed: {', '.join(failed)}"
                messagebox.showwarning("Shortcuts Created", msg)
            else:
                messagebox.showinfo("Success", msg)
        else:
            messagebox.showerror("Failed", "Could not create any shortcuts.\n\n" + "\n".join(failed))

    def create_tray_image(self):
        """Create a simple icon for system tray"""
        # Create a 64x64 icon with Mina colors
        img = Image.new('RGB', (64, 64), color='#5865F2')
        draw = ImageDraw.Draw(img)
        
        # Draw a satellite icon (simple representation)
        draw.ellipse([20, 20, 44, 44], fill='white', outline='white')
        draw.rectangle([32, 10, 36, 32], fill='white')
        draw.rectangle([10, 30, 32, 34], fill='white')
        draw.rectangle([32, 30, 54, 34], fill='white')
        
        return img

    def setup_tray_icon(self):
        """Setup system tray icon"""
        try:
            icon_image = self.create_tray_image()
            
            menu = Menu(
                MenuItem('Show', self.show_window, default=True),
                MenuItem('Hide', self.hide_window),
                Menu.SEPARATOR,
                MenuItem('Exit', self.quit_app)
            )
            
            self.tray_icon = Icon("Mina Satellite", icon_image, "Mina Satellite", menu)
            threading.Thread(target=self.tray_icon.run, daemon=True).start()
            self.log("System tray icon enabled - minimize to hide", "INFO")
        except Exception as e:
            self.log(f"Could not setup tray icon: {e}", "WARNING")

    def show_tray_notification(self):
        """Show first-run notification about tray behavior"""
        script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        flag_file = os.path.join(script_dir, "config", ".tray_notified")
        
        # Only show once
        if not os.path.exists(flag_file):
            messagebox.showinfo(
                "System Tray Support",
                "🔕 Mina Satellite minimizes to your system tray!\n\n"
                "When you close this window, it will minimize to the "
                "system tray instead of exiting.\n\n"
                "Look for the Mina icon in your hidden icons area "
                "(bottom-right corner of taskbar).\n\n"
                "Right-click the tray icon to Show, Hide, or Exit.",
                parent=self.root
            )
            # Create flag file
            try:
                os.makedirs(os.path.dirname(flag_file), exist_ok=True)
                open(flag_file, 'a').close()
            except:
                pass

    def show_tray_info(self):
        """Show information about tray functionality"""
        messagebox.showinfo(
            "System Tray Info",
            "🔕 Closing this window minimizes to system tray\n\n"
            "The app keeps running in the background!\n\n"
            "To find it:\n"
            "• Look for the Mina satellite icon\n"
            "• Usually in 'hidden icons' (^ arrow)\n"
            "• Bottom-right corner of taskbar\n\n"
            "Right-click the icon for options:\n"
            "• Show - Restore the window\n"
            "• Hide - Minimize to tray\n"
            "• Exit - Close completely",
            parent=self.root
        )

    def on_closing(self):
        """Handle window close button - minimize to tray instead of exit"""
        if PYSTRAY_AVAILABLE and self.tray_icon:
            self.hide_window()
            self.log("Minimized to system tray (look for 🛰️ icon in hidden icons)", "INFO")
            # Show a brief notification balloon if available
            try:
                if hasattr(self.tray_icon, 'notify'):
                    self.tray_icon.notify(
                        "Mina Satellite is still running",
                        "Click the tray icon to restore the window"
                    )
            except:
                pass
        else:
            self.quit_app()

    def show_window(self, icon=None, item=None):
        """Show the main window"""
        self.root.deiconify()
        self.root.lift()
        self.root.focus_force()
        self.is_visible = True

    def hide_window(self, icon=None, item=None):
        """Hide the main window to system tray"""
        self.root.withdraw()
        self.is_visible = False

    def quit_app(self, icon=None, item=None):
        """Properly quit the application and stop all background services"""
        self.log("Shutting down satellite client...", "INFO")
        
        try:
            # Disconnect from server if connected
            if self.connected and self.sio:
                try:
                    # Schedule disconnect in the event loop
                    future = asyncio.run_coroutine_threadsafe(self.sio.disconnect(), self.loop)
                    # Wait up to 2 seconds for disconnect to complete
                    future.result(timeout=2)
                    self.log("Disconnected from server", "INFO")
                except Exception as e:
                    self.log(f"Error during disconnect: {e}", "WARNING")
            
            # Stop the event loop if it's running
            if self.loop and self.loop.is_running():
                try:
                    self.loop.call_soon_threadsafe(self.loop.stop)
                except Exception as e:
                    self.log(f"Error stopping event loop: {e}", "WARNING")
            
            # Stop system tray icon
            if self.tray_icon:
                try:
                    self.tray_icon.stop()
                except Exception as e:
                    self.log(f"Error stopping tray icon: {e}", "WARNING")
        except Exception as e:
            self.log(f"Error during shutdown: {e}", "ERROR")
        
        # Quit the application
        self.root.quit()
        sys.exit(0)
    
    def test_connection(self):
        """Test connection to server without authentication"""
        self.log("Testing connection to server...", "INFO")
        
        def test():
            try:
                import socket
                import ssl
                
                # Parse URL
                url = self.server_url.replace("wss://", "").replace("ws://", "").split("/")[0]
                host = url.split(":")[0] if ":" in url else url
                port = int(url.split(":")[1]) if ":" in url else (443 if self.server_url.startswith("wss") else 80)
                
                # Test basic connection
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(5)
                
                if self.server_url.startswith("wss"):
                    context = ssl.create_default_context()
                    context.check_hostname = False
                    context.verify_mode = ssl.CERT_NONE
                    sock = context.wrap_socket(sock, server_hostname=host)
                
                result = sock.connect_ex((host, port))
                sock.close()
                
                if result == 0:
                    self.root.after(0, lambda: self.log(f"✓ Server {host}:{port} is reachable", "SUCCESS"))
                    self.root.after(0, lambda: self.log("If connection still fails, check your token or server may not be running", "INFO"))
                else:
                    self.root.after(0, lambda: self.log(f"✗ Cannot reach {host}:{port} - Server may be offline", "ERROR"))
                    
            except Exception as e:
                self.root.after(0, lambda: self.log(f"Connection test failed: {e}", "ERROR"))
        
        threading.Thread(target=test, daemon=True).start()
    
    async def get_media_info(self):
        """Get current media information from Windows"""
        if not WINSDK_AVAILABLE:
            return None
            
        try:
            sessions = await GlobalSystemMediaTransportControlsSessionManager.request_async()
            current_session = sessions.get_current_session()
            
            if current_session:
                media_properties = await current_session.try_get_media_properties_async()
                return {
                    "title": media_properties.title,
                    "artist": media_properties.artist,
                    "status": "Playing"
                }
            return None
        except Exception as e:
            self.log(f"Error getting media info: {e}", "ERROR")
            return None
    
    def run_client(self):
        """Run the socket.io client in asyncio loop"""
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        
        self.sio = socketio.AsyncClient()
        
        @self.sio.event
        async def connect():
            self.root.after(0, lambda: self.log("Connected to server!", "SUCCESS"))
            await self.sio.emit('register', {'userId': self.user_id, 'token': self.token})
        
        @self.sio.event
        async def connect_error(data):
            self.root.after(0, lambda: self.log(f"Connection failed: {data}", "ERROR"))
            self.root.after(0, lambda: self.update_status(False))
        
        @self.sio.event
        async def disconnect():
            self.root.after(0, lambda: self.log("Disconnected from server", "WARNING"))
            self.root.after(0, lambda: self.update_status(False))
        
        @self.sio.event
        async def auth_error(msg):
            self.root.after(0, lambda: self.log(f"Authentication error: {msg}", "ERROR"))
            await self.sio.disconnect()
        
        @self.sio.event
        async def registered(msg):
            self.root.after(0, lambda: self.log(msg, "SUCCESS"))
            self.root.after(0, lambda: self.update_status(True))
        
        @self.sio.on('media_command')
        async def on_message(data):
            if self.paused:
                return
            
            cmd = data.get('command')
            self.root.after(0, lambda: self.log(f"Command received: {cmd}", "COMMAND"))
            
            try:
                if cmd == 'MEDIA_PAUSE' or cmd == 'MEDIA_PLAY':
                    if PYNPUT_AVAILABLE:
                        keyboard.press(Key.media_play_pause)
                        keyboard.release(Key.media_play_pause)
                    elif PYAUTOGUI_AVAILABLE:
                        import pyautogui
                        pyautogui.press('playpause')
                    self.root.after(0, lambda: self.log("Executed: Play/Pause", "SUCCESS"))
                elif cmd == 'MEDIA_NEXT':
                    if PYNPUT_AVAILABLE:
                        keyboard.press(Key.media_next)
                        keyboard.release(Key.media_next)
                    elif PYAUTOGUI_AVAILABLE:
                        import pyautogui
                        pyautogui.press('nexttrack')
                    self.root.after(0, lambda: self.log("Executed: Next Track", "SUCCESS"))
                elif cmd == 'MEDIA_PREV':
                    if PYNPUT_AVAILABLE:
                        keyboard.press(Key.media_previous)
                        keyboard.release(Key.media_previous)
                    elif PYAUTOGUI_AVAILABLE:
                        import pyautogui
                        pyautogui.press('prevtrack')
                    self.root.after(0, lambda: self.log("Executed: Previous Track", "SUCCESS"))
            except Exception as e:
                self.root.after(0, lambda: self.log(f"Error executing command: {e}", "ERROR"))
        
        @self.sio.on('media_query')
        async def on_query(data):
            if self.paused:
                return
            
            req_id = data.get('requestId')
            cmd = data.get('command')
            self.root.after(0, lambda: self.log(f"Query received: {cmd}", "COMMAND"))
            
            if cmd == 'MEDIA_INFO':
                info = await self.get_media_info()
                if info:
                    self.root.after(0, lambda: self.log(f"Media info: {info['title']} - {info['artist']}", "INFO"))
                else:
                    self.root.after(0, lambda: self.log("No media playing", "INFO"))
                await self.sio.emit('media_info_response', {'requestId': req_id, 'info': info})
        
        try:
            self.loop.run_until_complete(self.sio.connect(self.server_url))
            self.loop.run_until_complete(self.sio.wait())
        except Exception as e:
            self.root.after(0, lambda: self.log(f"Connection error: {e}", "ERROR"))
            self.root.after(0, lambda: self.update_status(False))

def main():
    # Hide the console window
    hide_console()
    
    root = tk.Tk()
    app = SatelliteGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()
