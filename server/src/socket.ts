// ============================================================================
// Socket.IO bootstrap. The worker fleet and REST services emit domain events
// (see shared/index.ts SOCKET_EVENTS) which are broadcast verbatim to every
// connected dashboard client for instant UI updates.
// ============================================================================
import type { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";
import { verifyAccessToken } from "./utils.js";
import { env, logger } from "./config.js";

let io: Server | null = null;

export function initSocket(httpServer: HttpServer) {
  io = new Server(httpServer, { cors: { origin: env.corsOrigin } });

  io.use((socket: Socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (token) verifyAccessToken(token); // best-effort; anonymous read-only viewers still allowed
      next();
    } catch {
      next(); // do not hard-fail the socket handshake on an expired token
    }
  });

  io.on("connection", (socket) => {
    logger.info("Socket connected", { id: socket.id });
    socket.on("disconnect", () => logger.info("Socket disconnected", { id: socket.id }));
  });

  return io;
}

export function getIO() {
  return io;
}
