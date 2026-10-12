import { Cron } from "croner";
import type { Bot } from "grammy";
import { env } from "./config.js";
import { dayKey } from "./core/calendar.js";
import { rupiah } from "./core/money.js";
import { prisma } from "./db.js";
import { logger } from "./logger.js";
import { currentDailyStatus } from "./services/transactionService.js";

type ScheduledBot = Pick<Bot, "api">;

export function startScheduler(bot?: ScheduledBot): Cron[] {
  const jobs = [
    new Cron("0 7 * * *", { timezone: env.TIMEZONE }, () => void runOnce("morning", sendMorningMessage(bot))),
    new Cron("30 20 * * *", { timezone: env.TIMEZONE }, () => void runOnce("evening", sendEveningCheck(bot))),
    new Cron("0 19 * * 0", { timezone: env.TIMEZONE }, () => void runOnce("weekly", sendWeeklyPrompt(bot)))
  ];
  logger.info({ jobs: jobs.length }, "scheduler started");
  return jobs;
}

async function runOnce(jobKey: string, task: Promise<void>): Promise<void> {
  const today = dayKey();
  try {
    await prisma.scheduledJobRun.create({ data: { jobKey, dayKey: today } });
  } catch {
    return;
  }
  await task;
}

async function sendMorningMessage(bot?: ScheduledBot): Promise<void> {
  if (!bot || !env.TELEGRAM_ALLOWED_USER_ID) return;
  const status = await currentDailyStatus();
  const danger = status.daily.isDanger ? " Danger Mode: tahan Fun dulu hari ini." : "";
  await bot.api.sendMessage(
    env.TELEGRAM_ALLOWED_USER_ID,
    `Pagi. Limit makan hari ini ${rupiah(status.daily.dailyLimit)}. Sisa makan bulan ini ${rupiah(status.daily.makanLeft)}.${danger}`
  );
}

async function sendEveningCheck(bot?: ScheduledBot): Promise<void> {
  if (!bot || !env.TELEGRAM_ALLOWED_USER_ID) return;
  await bot.api.sendMessage(env.TELEGRAM_ALLOWED_USER_ID, "Cek malam: semua sudah dicatat, ada yang lupa, atau hari ini nggak keluar uang?");
}

async function sendWeeklyPrompt(bot?: ScheduledBot): Promise<void> {
  if (!bot || !env.TELEGRAM_ALLOWED_USER_ID) return;
  await bot.api.sendMessage(env.TELEGRAM_ALLOWED_USER_ID, "Rekap mingguan siap. Kirim /saldo nominal Mandiri biar drift-nya dicek.");
}
