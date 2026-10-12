import pino from "pino";
import { isProduction } from "./config.js";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: isProduction ? undefined : { target: "pino-pretty" }
});
