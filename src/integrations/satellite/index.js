const { Server } = require("socket.io");
const { match } = require("assert");
const fs = require('fs');
const path = require('path');

let io;
const activeSatellites = new Map(); // userId -> socketId
const satelliteCapabilities = new Map(); // userId -> { capabilities: [] }
const pendingQueries = new Map(); // requestId -> { resolve, timeout }
const crypto = require('crypto');

// Vision logging setup
const VISION_LOG_FILE = path.join(process.cwd(), 'data', 'logs', 'vision.log');

// Ensure log dir exists
if (!fs.existsSync(path.join(process.cwd(), 'data', 'logs'))) {
    fs.mkdirSync(path.join(process.cwd(), 'data', 'logs'), { recursive: true });
}

function logVisionEvent(header, details) {
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] ${header} ${details ? JSON.stringify(details, null, 2) : ''}\n`;
    try {
        fs.appendFileSync(VISION_LOG_FILE, entry, 'utf8');
    } catch (e) {
        console.error("Failed to write to vision log:", e);
    }
}

function init(httpServer) {
    io = new Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    console.log('[Satellite] Socket.io Server Initialized');

    io.on("connection", (socket) => {
        console.log(`[Satellite] New connection: ${socket.id}`);

        socket.on("register", (data) => {
            const { userId, token, capabilities } = data;

            // Simple Token Auth (Check against env var)
            if (token !== process.env.SATELLITE_TOKEN) {
                console.log(`[Satellite] Auth Failed for ${socket.id}`);
                socket.emit("auth_error", "Invalid Token");
                socket.disconnect();
                return;
            }

            console.log(`[Satellite] User ${userId} registered on ${socket.id}`);
            activeSatellites.set(userId, socket.id);
            
            // Phase 2: Store capabilities (vision, media, etc.)
            if (capabilities && Array.isArray(capabilities)) {
                satelliteCapabilities.set(userId, { capabilities });
                console.log(`[Satellite] Capabilities for ${userId}: ${capabilities.join(', ')}`);
            } else {
                satelliteCapabilities.set(userId, { capabilities: ['media'] }); // Default
            }
            
            socket.emit("registered", "Connected to Mina Satellite Network");
        });

        // Handle Responses from Client
        socket.on("media_info_response", (data) => {
            const { requestId, info } = data;
            if (pendingQueries.has(requestId)) {
                const { resolve, timeout } = pendingQueries.get(requestId);
                clearTimeout(timeout);
                pendingQueries.delete(requestId);
                resolve(info);
            }
        });

        // Phase 2: Handle Vision Snapshot Responses
        socket.on("vision_snapshot_response", (data) => {
            const { requestId, snapshotType, imageData } = data;
            if (pendingQueries.has(requestId)) {
                const { resolve, timeout } = pendingQueries.get(requestId);
                clearTimeout(timeout);
                pendingQueries.delete(requestId);
                resolve({ snapshotType, imageData });
            }
        });

        // Phase 2: Vision Event Handlers
        socket.on("vision_event", (data) => {
            const { userId, eventType, eventData } = data;
            // Log to vision.log instead of bot.log
            logVisionEvent(`[Satellite Vision] Event from ${userId}: ${eventType}`, eventData);
            
            // Handle vision events (motion, face detection, etc.)
            // For now, just log. In Phase 3+, we'll integrate with Mina's pipeline
            handleVisionEvent(userId, eventType, eventData);
        });

        socket.on("vision_snapshot", (data) => {
            const { userId, snapshotType, imageData } = data;
            logVisionEvent(`[Satellite Vision] Snapshot from ${userId}: ${snapshotType}`, { size: imageData?.length || 0 });
            
            // Handle snapshot uploads (webcam/screen)
            // For Phase 2, we just acknowledge. Phase 3+ will process with OpenRouter
            handleVisionSnapshot(userId, snapshotType, imageData);
        });

        socket.on("disconnect", () => {
            // Remove user from map
            for (const [uid, sid] of activeSatellites.entries()) {
                if (sid === socket.id) {
                    activeSatellites.delete(uid);
                    satelliteCapabilities.delete(uid);
                    console.log(`[Satellite] User ${uid} disconnected`);
                    break;
                }
            }
        });
    });
}

function sendCommand(userId, command, payload = {}) {
    const socketId = activeSatellites.get(userId);
    if (!socketId) {
        console.log(`[Satellite] No active satellite for user ${userId}`);
        return false;
    }

    if (io) {
        io.to(socketId).emit("media_command", { command, payload });
        console.log(`[Satellite] Sent '${command}' to ${userId}`);
        return true;
    }
    return false;
}

function broadcast(event, payload) {
    if (io) {
        io.emit(event, payload);
        // console.log(`[Satellite] Broadcast '${event}'`);
        return true;
    }
    return false;
}

function query(userId, command, timeoutMs = 3000) {
    return new Promise((resolve) => {
        const socketId = activeSatellites.get(userId);
        if (!socketId) {
            console.log(`[Satellite] Query failed: User ${userId} not connected.`);
            return resolve(null);
        }

        const requestId = crypto.randomUUID();
        const timeout = setTimeout(() => {
            if (pendingQueries.has(requestId)) {
                pendingQueries.delete(requestId);
                console.log(`[Satellite] Query ${requestId} timed out.`);
                resolve(null);
            }
        }, timeoutMs);

        pendingQueries.set(requestId, { resolve, timeout });

        io.to(socketId).emit("media_query", { requestId, command });
        console.log(`[Satellite] Query sent to ${userId} (ID: ${requestId})`);
    });
}

function hasConnection(userId) {
    return activeSatellites.has(userId);
}

// --- VRM Animation Controls ---

/**
 * Play a gesture animation on the VRM model
 * @param {string} userId - User ID or 'VRM_DISPLAY' for the display client
 * @param {string} gesture - Gesture type: wave, nod, shake, shrug, point, think, jump, cheer
 * @param {number} duration - Duration in seconds (default: 2.0)
 */
function playGesture(userId, gesture, duration = 2.0) {
    if (!io) return false;

    if (!userId) {
        io.emit('gesture', { type: gesture, duration });
        console.log(`[Satellite] Broadcast gesture '${gesture}'`);
        return true;
    }

    const socketId = activeSatellites.get(userId);
    if (!socketId) {
        console.log(`[Satellite] Cannot play gesture: User ${userId} not connected`);
        return false;
    }

    io.to(socketId).emit('gesture', { type: gesture, duration });
    console.log(`[Satellite] Playing gesture '${gesture}' for ${userId}`);
    return true;
}

/**
 * Play an emote animation on the VRM model
 * @param {string} userId - User ID or 'VRM_DISPLAY' for the display client
 * @param {string} emote - Emote type: laugh, surprised, sad, confused
 * @param {number} duration - Duration in seconds (default: 2.0)
 * @param {number} intensity - Intensity 0-1 (default: 0.8)
 */
function playEmote(userId, emote, duration = 2.0, intensity = 0.8) {
    if (!io) return false;

    if (!userId) {
        io.emit('emote', { type: emote, duration, intensity });
        console.log(`[Satellite] Broadcast emote '${emote}'`);
        return true;
    }

    const socketId = activeSatellites.get(userId);
    if (!socketId) {
        console.log(`[Satellite] Cannot play emote: User ${userId} not connected`);
        return false;
    }

    io.to(socketId).emit('emote', { type: emote, duration, intensity });
    console.log(`[Satellite] Playing emote '${emote}' for ${userId}`);
    return true;
}

/**
 * Set a facial expression on the VRM model
 * @param {string} userId - User ID or 'VRM_DISPLAY' for the display client
 * @param {string} expression - Expression type: happy, angry, sad, surprised, relaxed, neutral
 * @param {number} intensity - Intensity 0-1 (default: 0.8)
 * @param {number} duration - Duration in seconds (0 = indefinite, default: 0)
 */
function setExpression(userId, expression, intensity = 0.8, duration = 0) {
    if (!io) return false;

    if (!userId) {
        io.emit('expression', { type: expression, intensity, duration });
        console.log(`[Satellite] Broadcast expression '${expression}'`);
        return true;
    }

    const socketId = activeSatellites.get(userId);
    if (!socketId) {
        console.log(`[Satellite] Cannot set expression: User ${userId} not connected`);
        return false;
    }

    io.to(socketId).emit('expression', { type: expression, intensity, duration });
    console.log(`[Satellite] Setting expression '${expression}' for ${userId}`);
    return true;
}

/**
 * Play a body language animation
 * @param {string} userId - User ID or 'VRM_DISPLAY' for the display client
 * @param {string} pose - Pose type: lean_forward, lean_back, cross_arms, hands_on_hips
 * @param {number} duration - Duration in seconds (default: 3.0)
 */
function playPose(userId, pose, duration = 3.0) {
    if (!io) return false;

    if (!userId) {
        io.emit('gesture', { type: pose, duration });
        console.log(`[Satellite] Broadcast pose '${pose}'`);
        return true;
    }

    const socketId = activeSatellites.get(userId);
    if (!socketId) {
        console.log(`[Satellite] Cannot play pose: User ${userId} not connected`);
        return false;
    }

    io.to(socketId).emit('gesture', { type: pose, duration });
    console.log(`[Satellite] Playing pose '${pose}' for ${userId}`);
    return true;
}

/**
 * Broadcast speaking state to VRM (for lip sync)
 * @param {boolean} speaking - Whether Mina is speaking
 */
function setSpeaking(speaking) {
    if (io) {
        io.emit(speaking ? 'speaking_start' : 'speaking_stop');
        return true;
    }
    return false;
}

// --- Phase 2: Vision Event Handlers ---

/**
 * Handle vision events from satellite clients
 * @param {string} userId - User ID
 * @param {string} eventType - Event type (motion_detected, face_present, etc.)
 * @param {object} eventData - Event data
 */
function handleVisionEvent(userId, eventType, eventData) {
    // Phase 2: Just log events. Phase 3+ will integrate with Mina's pipeline
    logVisionEvent(`[Vision Event] ${userId}: ${eventType}`, eventData);
    
    // Store event in a simple log or queue for future processing
    // For now, we just acknowledge receipt
}

/**
 * Handle vision snapshot uploads
 * @param {string} userId - User ID
 * @param {string} snapshotType - 'webcam' or 'screen'
 * @param {string} imageData - Base64 encoded image or URL
 */
function handleVisionSnapshot(userId, snapshotType, imageData) {
    // Phase 2: Just acknowledge. Phase 3+ will process with OpenRouter vision model
    logVisionEvent(`[Vision Snapshot] ${userId}: ${snapshotType} snapshot received`, { size: imageData?.length || 0 });
    
    // Acknowledge receipt
    const socketId = activeSatellites.get(userId);
    if (socketId && io) {
        io.to(socketId).emit("vision_snapshot_ack", { 
            received: true, 
            timestamp: Date.now() 
        });
    }
}

/**
 * Request a vision snapshot from satellite
 * @param {string} userId - User ID
 * @param {string} snapshotType - 'webcam' or 'screen'
 * @returns {Promise<object|null>} Snapshot data or null if failed
 */
function requestVisionSnapshot(userId, snapshotType, includeOCR = false) {
    return new Promise((resolve) => {
        const socketId = activeSatellites.get(userId);
        if (!socketId) {
            logVisionEvent(`[Satellite Vision] User ${userId} not connected`, null);
            return resolve(null);
        }

        const capabilities = satelliteCapabilities.get(userId);
        if (!capabilities || !capabilities.capabilities.includes('vision')) {
            logVisionEvent(`[Satellite Vision] User ${userId} doesn't have vision capabilities`, null);
            return resolve(null);
        }

        const requestId = crypto.randomUUID();
        const timeout = setTimeout(() => {
            if (pendingQueries.has(requestId)) {
                pendingQueries.delete(requestId);
                logVisionEvent(`[Satellite Vision] Snapshot request ${requestId} timed out`, null);
                resolve(null);
            }
        }, 10000); // 10 second timeout for snapshots (OCR can take time)

        pendingQueries.set(requestId, { resolve, timeout });

        io.to(socketId).emit("vision_snapshot_request", { 
            requestId, 
            snapshotType,
            includeOCR: includeOCR || snapshotType === 'screen'  // Always include OCR for screen
        });
        logVisionEvent(`[Satellite Vision] Requested ${snapshotType} snapshot from ${userId}${includeOCR ? ' (with OCR)' : ''}`, null);
    });
}

/**
 * Check if a satellite has vision capabilities
 * @param {string} userId - User ID
 * @returns {boolean}
 */
function hasVisionCapability(userId) {
    const capabilities = satelliteCapabilities.get(userId);
    return capabilities && capabilities.capabilities.includes('vision');
}

module.exports = { 
    init, 
    sendCommand, 
    broadcast, 
    query, 
    hasConnection,
    // VRM Animation functions
    playGesture,
    playEmote,
    setExpression,
    playPose,
    setSpeaking,
    // Phase 2: Vision functions
    handleVisionEvent,
    handleVisionSnapshot,
    requestVisionSnapshot,
    hasVisionCapability
};
