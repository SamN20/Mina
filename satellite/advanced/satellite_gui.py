import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
import socketio
import pyautogui
import os
import sys
import asyncio
import threading
from datetime import datetime

try:
    from winsdk.windows.media.control import GlobalSystemMediaTransportControlsSessionManager
    WINSDK_AVAILABLE = True
except ImportError:
    WINSDK_AVAILABLE = False
    print("Warning: winsdk not available. 'What's playing?' feature will not work.")

class SatelliteGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Mina Satellite Client")
        self.root.geometry("600x700")
        self.root.resizable(False, False)
        
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
                    pyautogui.press('playpause')
                    self.root.after(0, lambda: self.log("Executed: Play/Pause", "SUCCESS"))
                elif cmd == 'MEDIA_NEXT':
                    pyautogui.press('nexttrack')
                    self.root.after(0, lambda: self.log("Executed: Next Track", "SUCCESS"))
                elif cmd == 'MEDIA_PREV':
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
    root = tk.Tk()
    app = SatelliteGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()
