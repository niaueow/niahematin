import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().default("file:./dev.db"),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ALLOWED_USER_ID: z.string().optional(),
  BOT_MODE: z.enum(["calibration", "active"]).default("calibration"),
  TIMEZONE: z.string().default("Asia/Jakarta"),
  ENABLE_LLM_FALLBACK: z.coerce.boolean().default(false),
  ANTHROPIC_API_KEY: z.string().optional()
});

export const env = envSchema.parse(process.env);

export const isProduction = env.NODE_ENV === "production";
