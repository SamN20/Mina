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

module.exports = { init, sendCommand, query, hasConnection };
