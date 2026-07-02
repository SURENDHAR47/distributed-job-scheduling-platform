// ============================================================================
// Process entry point: boots HTTP server + Socket.IO + cron schedulers.
// ============================================================================
import http from "http";
import { createApp } from "./app.js";
import { initSocket } from "./socket.js";
import { startSchedulers } from "./scheduler.js";
import { env, logger } from "./config.js";

const app = createApp();
const server = http.createServer(app);

initSocket(server);
startSchedulers();

server.listen(env.port, () => {
  logger.info(`Pulsar API listening on port ${env.port} (${env.nodeEnv})`);
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received — shutting down gracefully");
  server.close(() => process.exit(0));
});
