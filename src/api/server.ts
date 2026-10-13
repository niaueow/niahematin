import express from "express";
import helmet from "helmet";
import { currentDailyStatus } from "../services/transactionService.js";
import { logger } from "../logger.js";

export function createServer() {
  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: "64kb" }));
  app.use((req, res, next) => {
    const started = Date.now();
    res.on("finish", () => {
      logger.info({ method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - started }, "http request");
    });
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "niahematin", phase: 1 });
  });

  // BUG-002 fix: require Bearer token on every route except /health
  app.use((req, res, next) => {
    const apiSecret = process.env.API_SECRET;
    if (!apiSecret) {
      // If no secret configured, deny all protected routes as a safe default
      res.status(401).json({ error: "API_SECRET not configured" });
      return;
    }
    const auth = req.headers.authorization ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token !== apiSecret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  });

  app.get("/summary", async (_req, res, next) => {
    try {
      const status = await currentDailyStatus();
      res.json(status);
    } catch (error) {
      next(error);
    }
  });

  return app;
}
