import socketio
import os
import sys
import asyncio

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

# Requirements:
# pip install python-socketio[client] pynput winsdk
# (pyautogui is optional fallback)

# Configuration (Edit these or pass via ENV)
SERVER_URL = os.getenv('SATELLITE_SERVER', '') # MUST BE SET
USER_ID = os.getenv('DISCORD_USER_ID', '') # MUST BE SET
TOKEN = os.getenv('SATELLITE_TOKEN', '') # MUST BE SET

if not USER_ID:
    print("Error: DISCORD_USER_ID environment variable not set.")
    print("Usage: set DISCORD_USER_ID=... && python client.py")
    sys.exit(1)

if not SERVER_URL:
    print("Error: SATELLITE_SERVER environment variable not set.")
    print("Contact the bot administrator for the server address.")
    sys.exit(1)

if not TOKEN:
    print("Error: SATELLITE_TOKEN environment variable not set.")
    print("Contact the bot administrator for the authentication token.")
    sys.exit(1)

sio = socketio.AsyncClient()

async def get_media_info():
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
                "status": "Playing" # Ideally we check playback status too but winsdk is tricky there without more mapping
            }
        return None
    except Exception as e:
        print(f"Media Info Error: {e}")
        return None

@sio.event
async def connect():
    print('[Satellite] Connected to Server!')
    await sio.emit('register', {'userId': USER_ID, 'token': TOKEN})

@sio.event
async def connect_error(data):
    print(f'[Satellite] Connection Failed: {data}')

@sio.event
async def auth_error(msg):
    print(f'[Satellite] Authentication Error: {msg}')
    await sio.disconnect()

@sio.event
async def registered(msg):
    print(f'[Satellite] {msg}')
    print('[Satellite] Ready for commands...')

@sio.on('media_command')
async def on_message(data):
    cmd = data.get('command')
    print(f'[Satellite] Received Command: {cmd}')

    try:
        if cmd == 'MEDIA_PAUSE' or cmd == 'MEDIA_PLAY':
            if PYNPUT_AVAILABLE:
                keyboard.press(Key.media_play_pause)
                keyboard.release(Key.media_play_pause)
            elif PYAUTOGUI_AVAILABLE:
                import pyautogui
                pyautogui.press('playpause')
            print("Action: Play/Pause")
        elif cmd == 'MEDIA_NEXT':
            if PYNPUT_AVAILABLE:
                keyboard.press(Key.media_next)
                keyboard.release(Key.media_next)
            elif PYAUTOGUI_AVAILABLE:
                import pyautogui
                pyautogui.press('nexttrack')
            print("Action: Next Track")
        elif cmd == 'MEDIA_PREV':
            if PYNPUT_AVAILABLE:
                keyboard.press(Key.media_previous)
                keyboard.release(Key.media_previous)
            elif PYAUTOGUI_AVAILABLE:
                import pyautogui
                pyautogui.press('prevtrack')
            print("Action: Previous Track")
    except Exception as e:
        print(f"Error executing command: {e}")

@sio.on('media_query')
async def on_query(data):
    # Only support MEDIA_INFO for now
    req_id = data.get('requestId')
    cmd = data.get('command')
    print(f"[Satellite] Query Received: {cmd} (ID: {req_id})")

    if cmd == 'MEDIA_INFO':
        info = await get_media_info()
        print(f"sending info: {info}")
        await sio.emit('media_info_response', {'requestId': req_id, 'info': info})

async def main():
    print(f"Starting Satellite Client for User: {USER_ID}")
    print(f"Server: {SERVER_URL}")
    
    try:
        await sio.connect(SERVER_URL)
        await sio.wait()
    except Exception as e:
        print(f"Connection ended: {e}")

if __name__ == '__main__':
    asyncio.run(main())
