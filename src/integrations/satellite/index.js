const { Server } = require("socket.io");
const { match } = require("assert");

let io;
const activeSatellites = new Map(); // userId -> socketId
const pendingQueries = new Map(); // requestId -> { resolve, timeout }
const crypto = require('crypto');

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
            const { userId, token } = data;

            // Simple Token Auth (Check against env var)
            if (token !== process.env.SATELLITE_TOKEN) {
                console.log(`[Satellite] Auth Failed for ${socket.id}`);
                socket.emit("auth_error", "Invalid Token");
                socket.disconnect();
                return;
            }

            console.log(`[Satellite] User ${userId} registered on ${socket.id}`);
            activeSatellites.set(userId, socket.id);
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

        socket.on("disconnect", () => {
            // Remove user from map
            for (const [uid, sid] of activeSatellites.entries()) {
                if (sid === socket.id) {
                    activeSatellites.delete(uid);
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
    setSpeaking
};
