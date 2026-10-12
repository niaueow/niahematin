import { env } from "./config.js";
import { createServer } from "./api/server.js";
import { createBot } from "./bot/bot.js";
import { bootstrapDatabase, closeDb } from "./db.js";
import { logger } from "./logger.js";
import { startScheduler } from "./scheduler.js";

await bootstrapDatabase();

const app = createServer();
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "api listening");
});

const bot = env.TELEGRAM_BOT_TOKEN ? createBot() : undefined;
if (bot) {
  bot.start({
    onStart: (info) => logger.info({ username: info.username }, "telegram bot started")
  });
} else {
  logger.warn("TELEGRAM_BOT_TOKEN empty; bot is disabled, API only");
}

const jobs = startScheduler(bot);

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down");
  for (const job of jobs) job.stop();
  bot?.stop();
  server.close();
  await closeDb();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
