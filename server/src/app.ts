// ============================================================================
// Express application factory — separated from index.ts so Supertest can
// import the app without booting the HTTP server or Socket.IO.
// ============================================================================
import express from "express";
import cors from "cors";
import helmet from "helmet";
import router from "./routes.js";
import { errorHandler, notFoundHandler } from "./middleware.js";
import { env } from "./config.js";

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => res.json({ status: "ok", uptime: process.uptime() }));
  app.use("/api/v1", router);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
