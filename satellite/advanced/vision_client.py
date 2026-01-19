"""
Mina Vision Satellite Client (Phase 2)
Implements local computer vision features without LLM:
- Motion detection
- Face presence detection
- Person count (rough)
- Brightness/dark room detection
- Screen OCR
- Active window detection
- Idle detection

Requirements:
    pip install python-socketio[client] opencv-python mediapipe numpy pyautogui pillow pynput pytesseract
    Note: pytesseract also requires Tesseract OCR engine installed on your system

Usage:
    set DISCORD_USER_ID=...
    set SATELLITE_SERVER=...
    set SATELLITE_TOKEN=...
    python vision_client.py
"""

import socketio
import os
import sys
import asyncio
import cv2
import numpy as np
import base64
import time
from datetime import datetime, timedelta

# Optional imports with fallbacks
try:
    import mediapipe as mp
    MEDIAPIPE_AVAILABLE = True
except ImportError:
    MEDIAPIPE_AVAILABLE = False
    print("Warning: mediapipe not available. Face detection will use OpenCV only.")

try:
    import pyautogui
    PYAUTOGUI_AVAILABLE = True
except ImportError:
    PYAUTOGUI_AVAILABLE = False
    print("Warning: pyautogui not available. Screen capture will not work.")

try:
    from pynput import mouse, keyboard
    PYNPUT_AVAILABLE = True
except ImportError:
    PYNPUT_AVAILABLE = False
    print("Warning: pynput not available. Idle detection will not work.")

try:
    import pytesseract
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False
    print("Warning: pytesseract not available. OCR features will not work.")

# Configuration - will be set when connecting
# Don't check at import time to allow GUI to set them first
SERVER_URL = os.getenv('SATELLITE_SERVER', '')
USER_ID = os.getenv('DISCORD_USER_ID', '')
TOKEN = os.getenv('SATELLITE_TOKEN', '')

sio = socketio.AsyncClient()

def check_config():
    """Check if configuration is available. Called before connecting."""
    global SERVER_URL, USER_ID, TOKEN
    
    if not USER_ID or not SERVER_URL or not TOKEN:
        # Try to load from config file if env vars not set
        script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        config_dir = os.path.join(script_dir, "config")
        # Check for vision_config.bat first, fallback to satellite_config.bat
        config_file = os.path.join(config_dir, "vision_config.bat")
        if not os.path.exists(config_file):
            config_file = os.path.join(config_dir, "satellite_config.bat")
        
        if os.path.exists(config_file):
            try:
                with open(config_file, 'r') as f:
                    for line in f:
                        if line.startswith('set DISCORD_USER_ID='):
                            os.environ['DISCORD_USER_ID'] = line.split('=', 1)[1].strip()
                        elif line.startswith('set SATELLITE_SERVER='):
                            os.environ['SATELLITE_SERVER'] = line.split('=', 1)[1].strip()
                        elif line.startswith('set SATELLITE_TOKEN='):
                            os.environ['SATELLITE_TOKEN'] = line.split('=', 1)[1].strip()
                
                # Update module-level variables
                SERVER_URL = os.getenv('SATELLITE_SERVER', '')
                USER_ID = os.getenv('DISCORD_USER_ID', '')
                TOKEN = os.getenv('SATELLITE_TOKEN', '')
            except Exception as e:
                print(f"[Vision] Error loading config: {e}")
        
        # Check again after loading from file
        if not USER_ID or not SERVER_URL or not TOKEN:
            raise ValueError(
                "Missing required configuration. "
                "Set environment variables (DISCORD_USER_ID, SATELLITE_SERVER, SATELLITE_TOKEN) "
                "or configure via GUI."
            )
    
    return True

# Vision State
webcam = None
mp_face_detection = None
mp_drawing = None
last_motion_time = 0
last_activity_time = time.time()

# Settings (loaded from vision_settings)
vision_settings_module = None
motion_threshold = 5000
face_detection_enabled = True
motion_detection_enabled = True
brightness_detection_enabled = True
idle_detection_enabled = True

# Idle detection
last_mouse_time = time.time()
last_keyboard_time = time.time()
IDLE_THRESHOLD = 300  # 5 minutes of no activity

def load_vision_settings():
    """Load vision settings from config file"""
    global motion_threshold, face_detection_enabled, motion_detection_enabled
    global brightness_detection_enabled, idle_detection_enabled, IDLE_THRESHOLD
    global vision_settings_module
    
    try:
        import vision_settings
        vision_settings_module = vision_settings
        settings = vision_settings.load_settings()
        
        # Load feature settings
        motion_detection_enabled = settings["features"]["motion_detection"]["enabled"]
        motion_threshold = settings["features"]["motion_detection"]["motion_threshold"]
        
        face_detection_enabled = settings["features"]["face_detection"]["enabled"]
        
        brightness_detection_enabled = settings["features"]["brightness_detection"]["enabled"]
        
        idle_detection_enabled = settings["features"]["idle_detection"]["enabled"]
        IDLE_THRESHOLD = settings["features"]["idle_detection"]["idle_threshold_seconds"]
        
        print("[Vision] Settings loaded from config")
    except Exception as e:
        print(f"[Vision] Error loading settings: {e}. Using defaults.")

# Load settings on import
load_vision_settings()

# Callback for GUI updates (set by vision_gui if available)
vision_event_callback = None

def set_vision_event_callback(callback):
    """Set a callback function to be called when vision events occur"""
    global vision_event_callback
    vision_event_callback = callback

def init_webcam():
    """Initialize webcam capture"""
    global webcam
    try:
        # Release any existing webcam first
        if webcam is not None:
            try:
                webcam.release()
            except:
                pass
        
        webcam = cv2.VideoCapture(0)
        if not webcam.isOpened():
            print("[Vision] Warning: Could not open webcam. Vision features disabled.")
            return False
        
        # Set properties
        webcam.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        webcam.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        
        # Read a test frame to ensure webcam is ready
        ret, test_frame = webcam.read()
        if not ret or test_frame is None:
            print("[Vision] Warning: Webcam opened but cannot read frames. Vision features disabled.")
            webcam.release()
            webcam = None
            return False
        
        print("[Vision] Webcam initialized and tested")
        return True
    except Exception as e:
        print(f"[Vision] Failed to initialize webcam: {e}")
        import traceback
        traceback.print_exc()
        if webcam is not None:
            try:
                webcam.release()
            except:
                pass
            webcam = None
        return False

def init_face_detection():
    """Initialize MediaPipe face detection"""
    global mp_face_detection, mp_drawing
    if not MEDIAPIPE_AVAILABLE:
        return False
    try:
        mp_face_detection = mp.solutions.face_detection
        mp_drawing = mp.solutions.drawing_utils
        print("[Vision] MediaPipe face detection initialized")
        return True
    except Exception as e:
        print(f"[Vision] Failed to initialize MediaPipe: {e}")
        return False

def detect_motion(frame1, frame2):
    """Detect motion between two frames"""
    if frame1 is None or frame2 is None:
        return False, 0
    
    gray1 = cv2.cvtColor(frame1, cv2.COLOR_BGR2GRAY)
    gray2 = cv2.cvtColor(frame2, cv2.COLOR_BGR2GRAY)
    
    diff = cv2.absdiff(gray1, gray2)
    _, thresh = cv2.threshold(diff, 30, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    motion_pixels = np.sum(thresh > 0)
    return motion_pixels > motion_threshold, motion_pixels

def detect_faces(frame):
    """Detect faces in frame using MediaPipe or OpenCV"""
    faces = []
    
    if MEDIAPIPE_AVAILABLE and mp_face_detection:
        try:
            with mp_face_detection.FaceDetection(
                model_selection=0, min_detection_confidence=0.5
            ) as face_detection:
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = face_detection.process(rgb_frame)
                
                if results.detections:
                    for detection in results.detections:
                        bbox = detection.location_data.relative_bounding_box
                        h, w, _ = frame.shape
                        x = int(bbox.xmin * w)
                        y = int(bbox.ymin * h)
                        width = int(bbox.width * w)
                        height = int(bbox.height * h)
                        faces.append((x, y, width, height))
        except Exception as e:
            print(f"[Vision] MediaPipe face detection error: {e}")
    
    # Fallback to OpenCV Haar Cascade
    if not faces:
        try:
            face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            detected = face_cascade.detectMultiScale(gray, 1.1, 4)
            faces = [(x, y, w, h) for (x, y, w, h) in detected]
        except Exception as e:
            print(f"[Vision] OpenCV face detection error: {e}")
    
    return faces

def detect_brightness(frame):
    """Detect average brightness of frame"""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    avg_brightness = np.mean(gray)
    # Convert numpy scalar to Python float
    return float(avg_brightness)

def get_active_window():
    """Get active window name (OS-specific)"""
    if not PYAUTOGUI_AVAILABLE:
        return None
    
    try:
        # This is a simplified version. Full implementation would use platform-specific APIs
        # For Windows: win32gui
        # For Linux: xdotool or wmctrl
        # For macOS: AppleScript
        return "Unknown"  # Placeholder
    except Exception as e:
        print(f"[Vision] Failed to get active window: {e}")
        return None

def capture_screen():
    """Capture screen screenshot"""
    if not PYAUTOGUI_AVAILABLE:
        return None
    
    try:
        screenshot = pyautogui.screenshot()
        frame = np.array(screenshot)
        frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
        return frame
    except Exception as e:
        print(f"[Vision] Failed to capture screen: {e}")
        return None

def frame_to_base64(frame):
    """Convert OpenCV frame to base64 string"""
    if frame is None:
        return None
    _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return base64.b64encode(buffer).decode('utf-8')

async def vision_loop():
    """Main vision processing loop"""
    global last_motion_time, last_activity_time, webcam, vision_running
    
    vision_running = True
    
    # Re-check webcam availability
    if webcam is None or not webcam.isOpened():
        print("[Vision] Webcam not available, skipping vision loop")
        vision_running = False
        return
    
    print("[Vision] Starting vision processing loop...")
    
    # Give webcam a moment to stabilize
    await asyncio.sleep(1.0)
    
    # Test read before starting loop - use executor for async safety
    loop = asyncio.get_event_loop()
    try:
        ret, test_frame = await loop.run_in_executor(None, webcam.read)
        if not ret or test_frame is None:
            print("[Vision] Webcam test read failed. Retrying initialization...")
            if init_webcam():
                await asyncio.sleep(1.0)
                # Test again
                ret, test_frame = await loop.run_in_executor(None, webcam.read)
                if not ret or test_frame is None:
                    print("[Vision] Webcam still failing after reinit. Vision loop exiting.")
                    return
            else:
                print("[Vision] Webcam initialization failed. Vision loop exiting.")
                return
    except Exception as e:
        print(f"[Vision] Error testing webcam: {e}")
        import traceback
        traceback.print_exc()
        return
    
    prev_frame = None
    frame_count = 0
    last_face_check = 0
    last_brightness_check = 0
    last_motion_check = 0
    consecutive_failures = 0
    
    # State tracking for change detection
    last_face_count = -1
    last_brightness = -1
    last_is_dark = None
    
    # Load rate limits from settings
    motion_rate_limit = 2.0
    face_rate_limit = 2.0
    brightness_rate_limit = 1.0
    
    if vision_settings_module:
        try:
            motion_rate_limit = vision_settings_module.get_feature_setting("motion_detection", "rate_limit_seconds", 2.0)
            face_rate_limit = vision_settings_module.get_feature_setting("face_detection", "rate_limit_seconds", 2.0)
            brightness_rate_limit = vision_settings_module.get_feature_setting("brightness_detection", "rate_limit_seconds", 1.0)
        except:
            pass
    
    while vision_running:
        try:
            # Check if webcam is still valid
            if webcam is None or not webcam.isOpened():
                print("[Vision] Webcam lost. Attempting to reinitialize...")
                if init_webcam():
                    await asyncio.sleep(0.5)
                    consecutive_failures = 0
                else:
                    print("[Vision] Failed to reinitialize webcam. Exiting vision loop.")
                    break
            
            # Read frame - run in executor to avoid blocking async loop
            # OpenCV's read() is blocking and can cause issues in async context
            loop = asyncio.get_event_loop()
            try:
                ret, frame = await loop.run_in_executor(None, webcam.read)
            except Exception as e:
                print(f"[Vision] Error reading frame: {e}")
                consecutive_failures += 1
                if consecutive_failures > 5:
                    print(f"[Vision] Multiple frame read failures ({consecutive_failures}). Webcam may be disconnected.")
                    # Try to reinitialize
                    if webcam is not None:
                        try:
                            webcam.release()
                        except:
                            pass
                        webcam = None
                    if not init_webcam():
                        print("[Vision] Cannot recover webcam. Exiting vision loop.")
                        break
                    consecutive_failures = 0
                    await asyncio.sleep(1)
                    continue
                else:
                    await asyncio.sleep(0.5)
                    continue
            
            if not ret or frame is None:
                consecutive_failures += 1
                if consecutive_failures > 5:
                    print(f"[Vision] Multiple frame read failures ({consecutive_failures}). Webcam may be disconnected.")
                    # Try to reinitialize
                    if webcam is not None:
                        try:
                            webcam.release()
                        except:
                            pass
                        webcam = None
                    if not init_webcam():
                        print("[Vision] Cannot recover webcam. Exiting vision loop.")
                        break
                    consecutive_failures = 0
                    await asyncio.sleep(1)
                    continue
                else:
                    await asyncio.sleep(0.5)
                    continue
            
            # Reset failure counter on success
            consecutive_failures = 0
            
            frame_count += 1
            
            # Motion Detection (every frame)
            if motion_detection_enabled and prev_frame is not None:
                has_motion, motion_pixels = detect_motion(prev_frame, frame)
                if has_motion:
                    current_time = time.time()
                    if current_time - last_motion_time > motion_rate_limit:  # Use settings-based rate limit
                        last_motion_time = current_time
                        print(f"[Vision] Motion detected: {motion_pixels} pixels")
                        
                        if vision_running and sio.connected:
                            event_data = {
                                'userId': USER_ID,
                                'eventType': 'motion_detected',
                                'eventData': {
                                    'motionPixels': int(motion_pixels),
                                    'timestamp': float(current_time)
                                }
                            }
                            try:
                                await sio.emit('vision_event', event_data)
                            except Exception as e:
                                if vision_running:  # Only log if we're supposed to be running
                                    print(f"[Vision] Error emitting motion_detected: {e}")
                        
                        # Notify GUI if callback is set
                        if vision_event_callback:
                            try:
                                vision_event_callback('motion_detected', f"Motion: {motion_pixels} pixels")
                            except:
                                pass
            
            # Face Detection (rate limited from settings)
            current_time = time.time()
            if face_detection_enabled and (current_time - last_face_check > face_rate_limit):
                last_face_check = current_time
                faces = detect_faces(frame)
                face_count = len(faces)
                has_face = bool(face_count > 0)  # Ensure Python bool
                
                # Only send if face count changed
                if face_count != last_face_count:
                    last_face_count = face_count
                    print(f"[Vision] Face check: {face_count} face(s) detected")
                    
                    if vision_running and sio.connected:
                        event_data = {
                            'userId': USER_ID,
                            'eventType': 'face_status',
                            'eventData': {
                                'hasFace': bool(has_face),  # Ensure Python bool, not numpy bool
                                'faceCount': int(face_count),
                                'timestamp': float(current_time)
                            }
                        }
                        try:
                            await sio.emit('vision_event', event_data)
                        except Exception as e:
                            if vision_running:  # Only log if we're supposed to be running
                                print(f"[Vision] Error emitting face_status: {e}")
                    
                    # Notify GUI if callback is set
                    if vision_event_callback:
                        try:
                            status = f"{face_count} face(s)" if has_face else "No faces"
                            vision_event_callback('face_status', f"Face: {status}")
                        except:
                            pass
            
            # Brightness Detection (rate limited from settings)
            if current_time - last_brightness_check > brightness_rate_limit:
                last_brightness_check = current_time
                brightness = detect_brightness(frame)
                is_dark = bool(brightness < 50)  # Threshold for "dark room" - ensure Python bool
                
                # Only send if brightness changed significantly (>10%) or dark/light state changed
                brightness_changed = (last_brightness < 0 or abs(brightness - last_brightness) > 10)
                state_changed = (last_is_dark is None or is_dark != last_is_dark)
                
                if brightness_changed or state_changed:
                    last_brightness = brightness
                    last_is_dark = is_dark
                    print(f"[Vision] Brightness: {brightness:.1f} ({'Dark' if is_dark else 'Bright'})")
                    
                    if vision_running and sio.connected:
                        event_data = {
                            'userId': USER_ID,
                            'eventType': 'brightness_status',
                            'eventData': {
                                'brightness': float(brightness),
                                'isDark': bool(is_dark),  # Ensure Python bool, not numpy bool
                                'timestamp': float(current_time)
                            }
                        }
                        try:
                            await sio.emit('vision_event', event_data)
                        except Exception as e:
                            if vision_running:  # Only log if we're supposed to be running
                                print(f"[Vision] Error emitting brightness_status: {e}")
                    
                    # Notify GUI if callback is set
                    if vision_event_callback:
                        try:
                            vision_event_callback('brightness_status', f"Brightness: {brightness:.0f} ({'Dark' if is_dark else 'Bright'})")
                        except:
                            pass
            
            prev_frame = frame.copy()
            await asyncio.sleep(0.5)  # Process ~2 FPS
            
            # Debug: Print status every 20 frames (~10 seconds)
            if frame_count % 20 == 0:
                print(f"[Vision] Processing... ({frame_count} frames processed)")
            
        except Exception as e:
            print(f"[Vision] Error in vision loop: {e}")
            import traceback
            traceback.print_exc()
            await asyncio.sleep(1)

async def idle_detection_loop():
    """Monitor for idle state"""
    global last_mouse_time, last_keyboard_time, last_activity_time, idle_running, IDLE_THRESHOLD
    
    idle_running = True
    
    if not PYNPUT_AVAILABLE:
        idle_running = False
        return
    
    # Load rate limit from settings
    idle_rate_limit = 10.0
    if vision_settings_module:
        try:
            idle_rate_limit = vision_settings_module.get_feature_setting("idle_detection", "rate_limit_seconds", 10.0)
            IDLE_THRESHOLD = vision_settings_module.get_feature_setting("idle_detection", "idle_threshold_seconds", 300)
        except:
            pass
    
    def on_mouse_move(x, y):
        global last_mouse_time, last_activity_time
        last_mouse_time = time.time()
        last_activity_time = time.time()
    
    def on_key_press(key):
        global last_keyboard_time, last_activity_time
        last_keyboard_time = time.time()
        last_activity_time = time.time()
    
    mouse_listener = mouse.Listener(on_move=on_mouse_move)
    keyboard_listener = keyboard.Listener(on_press=on_key_press)
    
    mouse_listener.start()
    keyboard_listener.start()
    
    last_idle_state = None
    
    while idle_running:
        try:
            current_time = time.time()
            idle_duration = current_time - last_activity_time
            
            is_idle = bool(idle_duration > IDLE_THRESHOLD)  # Ensure Python bool
            
            # Only send if idle state changed
            if is_idle != last_idle_state:
                last_idle_state = is_idle
                
                if idle_running and sio.connected:
                    event_data = {
                        'userId': USER_ID,
                        'eventType': 'idle_status',
                        'eventData': {
                            'isIdle': bool(is_idle),  # Ensure Python bool
                            'idleDuration': float(idle_duration),
                            'timestamp': float(current_time)
                        }
                    }
                    try:
                        await sio.emit('vision_event', event_data)
                    except Exception as e:
                        if idle_running:  # Only log if we're supposed to be running
                            print(f"[Vision] Error emitting idle_status: {e}")
                
                # Notify GUI if callback is set
                if vision_event_callback:
                    try:
                        status = f"Idle: {idle_duration:.0f}s" if is_idle else "Active"
                        vision_event_callback('idle_status', status)
                    except:
                        pass
            
            await asyncio.sleep(idle_rate_limit)  # Use settings-based rate limit
            
        except Exception as e:
            if idle_running:  # Only log if we're supposed to be running
                print(f"[Vision] Error in idle detection: {e}")
            await asyncio.sleep(1)
    
    # Cleanup
    idle_running = False
    print("[Vision] Idle detection loop stopped")

@sio.event
async def connect():
    # Ensure config is loaded
    check_config()
    print('[Vision Satellite] Connected to Server!')
    await sio.emit('register', {
        'userId': USER_ID,
        'token': TOKEN,
        'capabilities': ['vision', 'webcam_snapshot', 'screen_snapshot', 'motion_events', 'ocr_text']
    })

@sio.event
async def connect_error(data):
    print(f'[Vision Satellite] Connection Failed: {data}')

@sio.event
async def disconnect():
    print('[Vision Satellite] Disconnected')

@sio.event
async def registered(msg):
    print(f'[Vision Satellite] {msg}')
    print('[Vision Satellite] Ready for vision commands...')
    
    # Start vision loops
    if webcam and webcam.isOpened():
        asyncio.create_task(vision_loop())
    
    if PYNPUT_AVAILABLE:
        asyncio.create_task(idle_detection_loop())

@sio.on('vision_snapshot_request')
async def on_snapshot_request(data):
    """Handle snapshot request from server"""
    request_id = data.get('requestId')
    snapshot_type = data.get('snapshotType', 'webcam')
    include_ocr = data.get('includeOCR', False)  # Phase 3: Optional OCR flag
    
    try:
        # Check if on-demand snapshots are enabled
        if vision_settings_module:
            on_demand = vision_settings_module.get_feature_setting("on_demand_snapshots", "enabled", True)
            if not on_demand:
                await sio.emit('vision_snapshot_response', {
                    'requestId': request_id,
                    'error': 'On-demand snapshots are disabled in settings'
                })
                return
            
            if snapshot_type == 'webcam':
                webcam_enabled = vision_settings_module.get_feature_setting("on_demand_snapshots", "webcam_enabled", True)
                if not webcam_enabled:
                    await sio.emit('vision_snapshot_response', {
                        'requestId': request_id,
                        'error': 'Webcam snapshots are disabled in settings'
                    })
                    return
            elif snapshot_type == 'screen':
                screen_enabled = vision_settings_module.get_feature_setting("on_demand_snapshots", "screen_enabled", True)
                if not screen_enabled:
                    await sio.emit('vision_snapshot_response', {
                        'requestId': request_id,
                        'error': 'Screen snapshots are disabled in settings'
                    })
                    return
        
        if snapshot_type == 'webcam':
            if webcam and webcam.isOpened():
                loop = asyncio.get_event_loop()
                ret, frame = await loop.run_in_executor(None, webcam.read)
                if ret:
                    image_data = frame_to_base64(frame)
                    response = {
                        'requestId': request_id,
                        'snapshotType': 'webcam',
                        'imageData': image_data
                    }
                    
                    # Phase 3: Add OCR if requested
                    if include_ocr and TESSERACT_AVAILABLE:
                        ocr_text = await loop.run_in_executor(None, extract_text_from_image, frame)
                        if ocr_text:
                            response['ocrText'] = ocr_text
                    
                    await sio.emit('vision_snapshot_response', response)
                else:
                    await sio.emit('vision_snapshot_response', {
                        'requestId': request_id,
                        'error': 'Failed to capture webcam frame'
                    })
            else:
                await sio.emit('vision_snapshot_response', {
                    'requestId': request_id,
                    'error': 'Webcam not available'
                })
        
        elif snapshot_type == 'screen':
            loop = asyncio.get_event_loop()
            frame = await loop.run_in_executor(None, capture_screen)
            if frame is not None:
                image_data = frame_to_base64(frame)
                response = {
                    'requestId': request_id,
                    'snapshotType': 'screen',
                    'imageData': image_data
                }
                
                # Phase 3: Add OCR if requested (always for screen)
                if TESSERACT_AVAILABLE:
                    ocr_text = await loop.run_in_executor(None, extract_text_from_image, frame)
                    if ocr_text:
                        response['ocrText'] = ocr_text
                
                await sio.emit('vision_snapshot_response', response)
            else:
                await sio.emit('vision_snapshot_response', {
                    'requestId': request_id,
                    'error': 'Failed to capture screen'
                })
        else:
            await sio.emit('vision_snapshot_response', {
                'requestId': request_id,
                'error': f'Unknown snapshot type: {snapshot_type}'
            })
    except Exception as e:
        print(f"[Vision] Error handling snapshot request: {e}")
        await sio.emit('vision_snapshot_response', {
            'requestId': request_id,
            'error': str(e)
        })

async def main():
    """Main entry point"""
    print('[Vision Satellite] Initializing...')
    
    # Check configuration first
    try:
        check_config()
    except ValueError as e:
        print(f'[Vision Satellite] Configuration error: {e}')
        return
    
    # Initialize components
    webcam_ok = init_webcam()
    face_ok = init_face_detection()
    
    if not webcam_ok:
        print('[Vision Satellite] Warning: Webcam not available. Some features will be disabled.')
    
    # Connect to server
    try:
        await sio.connect(SERVER_URL)
        await sio.wait()
    except Exception as e:
        print(f'[Vision Satellite] Connection error: {e}')
    finally:
        if webcam:
            webcam.release()
        await sio.disconnect()

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print('\n[Vision Satellite] Shutting down...')
        if webcam:
            webcam.release()
