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
