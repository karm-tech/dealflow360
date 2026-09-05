// Live updates. A client joins one room, named for its instance and its user,
// so an event raised in demo data can never reach a live session.

import { Server } from "socket.io";
import { verifyToken } from "./jwt.js";
import { normaliseMode } from "./prisma.js";

let io = null;

function roomFor(mode, userId) {
  return `${mode}:user:${userId}`;
}

export function initRealtime(httpServer, origin) {
  io = new Server(httpServer, { cors: { origin } });

  // The same signed token as the API, so a socket cannot claim another person.
  io.use((socket, next) => {
    try {
      const payload = verifyToken(socket.handshake.auth?.token);
      socket.data.userId = payload.id;
      socket.data.mode = normaliseMode(payload.db);
      next();
    } catch {
      next(new Error("Not authorised"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(roomFor(socket.data.mode, socket.data.userId));
  });

  return io;
}

export function emitToUser(mode, userId, event, payload) {
  if (!io) return;
  io.to(roomFor(mode, userId)).emit(event, payload);
}
