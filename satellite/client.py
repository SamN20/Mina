import socketio
import pyautogui
import os
import sys
import asyncio
from winsdk.windows.media.control import GlobalSystemMediaTransportControlsSessionManager

# Requirements:
# pip install python-socketio[client] pyautogui winsdk

# Configuration (Edit these or pass via ENV)
SERVER_URL = os.getenv('SATELLITE_SERVER', 'http://localhost:3001') # Default to local for testing
USER_ID = os.getenv('DISCORD_USER_ID', '') # MUST BE SET
TOKEN = os.getenv('SATELLITE_TOKEN', 'secret123') 

if not USER_ID:
    print("Error: DISCORD_USER_ID environment variable not set.")
    print("Usage: set DISCORD_USER_ID=... && python client.py")
    sys.exit(1)

sio = socketio.AsyncClient()

async def get_media_info():
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
        if cmd == 'MEDIA_PAUSE':
            pyautogui.press('playpause')
            print("Action: Play/Pause")
        elif cmd == 'MEDIA_PLAY':
            pyautogui.press('playpause')
            print("Action: Play/Pause")
        elif cmd == 'MEDIA_NEXT':
            pyautogui.press('nexttrack')
            print("Action: Next Track")
        elif cmd == 'MEDIA_PREV':
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
