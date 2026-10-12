import { Bot, InlineKeyboard, type Context, type SessionFlavor, session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import type { Conversation, ConversationFlavor } from "@grammyjs/conversations";
import type { BotMode, Category } from "../core/types.js";
import { env } from "../config.js";
import { rupiah } from "../core/money.js";
import { parseQuickLog } from "../parser/quickLogParser.js";
import { confirmAllowance, ensureUserConfig, setMode } from "../services/planService.js";
import { addCancelledBuy, addExpense, currentDailyStatus, evaluatePurchase, undoLastTransaction } from "../services/transactionService.js";
import { formatBoleh, formatExpenseReply, formatSummary } from "./messages.js";

type SessionData = {
  pendingBoleh?: {
    amount: number;
    note: string;
    category: Category;
  };
};

type BotContext = Context & SessionFlavor<SessionData> & ConversationFlavor;

const categoryLabels: Record<Category, string> = {
  MAKAN: "Makan",
  GROCERIES: "Groceries",
  JAJAN: "Jajan",
  RANDOM: "Random",
  TRANSPORT: "Transport",
  FUN: "Fun",
  TAGIHAN: "Tagihan",
  LAIN_LAIN: "Lain-lain",
  UNTRACKED: "Tak terlacak"
};

export function createBot(): Bot<BotContext> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is required to start the bot");
  }

  const bot = new Bot<BotContext>(env.TELEGRAM_BOT_TOKEN);
  bot.use(session({ initial: (): SessionData => ({}) }));
  bot.use(conversations());
  bot.use(createConversation(pinjamConversation));

  bot.use(async (ctx, next) => {
    const allowed = env.TELEGRAM_ALLOWED_USER_ID;
    if (allowed && String(ctx.from?.id) !== allowed) {
      await ctx.reply("Bot ini private dulu ya.");
      return;
    }
    await ensureUserConfig();
    await next();
  });

  bot.command("start", async (ctx) => {
    await ctx.reply(
      [
        "Halo, ini #niahematin fase 1.",
        "Kirim cepat seperti `15 kopi`, pakai /boleh sebelum beli, /sisa buat ringkasan, dan /masuk 2000000 jatah saat uang bulanan masuk."
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  });

  bot.command("mode", async (ctx) => {
    const raw = ctx.match.trim().toLowerCase();
    if (!["calibration", "active"].includes(raw)) {
      await ctx.reply("Pakai /mode calibration atau /mode active.");
      return;
    }
    const mode = (raw === "active" ? "ACTIVE" : "CALIBRATION") as BotMode;
    await setMode(mode);
    await ctx.reply(`Mode diubah ke ${raw}.`);
  });

  bot.command("masuk", async (ctx) => {
    const parsed = parseCommandAmount(ctx.match);
    if (!parsed) {
      await ctx.reply("Format: /masuk 2000000 jatah");
      return;
    }
    const plan = await confirmAllowance(parsed.amount, parsed.note || "jatah bulanan");
    await ctx.reply(`Masuk ${rupiah(parsed.amount)}. Plan ${plan.monthKey} siap. Transfer hari 1: Bibit ${rupiah(plan.bibitBudget)} + HP ${rupiah(plan.hpBudget)}.`);
  });

  bot.command("sisa", async (ctx) => {
    const status = await currentDailyStatus();
    await ctx.reply(formatSummary(status));
  });

  bot.command("boleh", async (ctx) => {
    const parsed = parseQuickLog(ctx.match);
    if (!parsed) {
      await ctx.reply("Format: /boleh 25000 boba");
      return;
    }
    const result = await evaluatePurchase({ amount: parsed.amount, category: parsed.category });
    ctx.session.pendingBoleh = {
      amount: parsed.amount,
      note: parsed.note,
      category: parsed.category
    };
    const keyboard = new InlineKeyboard().text("Jadi beli", "boleh:buy").text("Batal beli", "boleh:cancel");
    await ctx.reply(formatBoleh(result, parsed.amount, parsed.note), { reply_markup: keyboard });
  });

  bot.callbackQuery("boleh:buy", async (ctx) => {
    const pending = ctx.session.pendingBoleh;
    if (!pending) {
      await ctx.answerCallbackQuery("Tidak ada /boleh yang aktif.");
      return;
    }
    await addExpense({ ...pending });
    const status = await currentDailyStatus();
    await ctx.editMessageText(formatExpenseReply({ ...pending, daily: status.daily, hpBudget: status.plan.hpBudget }));
    ctx.session.pendingBoleh = undefined;
    await ctx.answerCallbackQuery("Dicatat.");
  });

  bot.callbackQuery("boleh:cancel", async (ctx) => {
    const pending = ctx.session.pendingBoleh;
    if (!pending) {
      await ctx.answerCallbackQuery("Tidak ada /boleh yang aktif.");
      return;
    }
    await addCancelledBuy({ amount: pending.amount, note: pending.note });
    await ctx.editMessageText(`Nice. Batal beli ${rupiah(pending.amount)} ${pending.note}; ini masuk counter positif buat sapuan.`);
    ctx.session.pendingBoleh = undefined;
    await ctx.answerCallbackQuery("Batal dicatat.");
  });

  bot.command("undo", async (ctx) => {
    const undone = await undoLastTransaction();
    if (!undone) {
      await ctx.reply("Belum ada log yang bisa di-undo.");
      return;
    }
    await ctx.reply(`Undo: ${rupiah(undone.amount)} ${undone.note}.`);
  });

  bot.command("pinjam", async (ctx) => {
    await ctx.conversation.enter("pinjamConversation");
  });

  bot.on("message:text", async (ctx) => {
    const parsed = parseQuickLog(ctx.message.text);
    if (!parsed) return;

    if (parsed.confidence < 0.5) {
      await ctx.reply("Aku nangkep nominalnya, tapi kategorinya ragu. Coba tulis kategori juga, misalnya `15 kopi jajan`.");
      return;
    }

    await addExpense({
      amount: parsed.amount,
      note: parsed.note,
      category: parsed.category,
      telegramUpdateId: String(ctx.update.update_id)
    });
    const status = await currentDailyStatus();
    await ctx.reply(
      formatExpenseReply({
        amount: parsed.amount,
        note: parsed.note,
        category: categoryLabels[parsed.category],
        daily: status.daily,
        hpBudget: status.plan.hpBudget
      })
    );
  });

  return bot;
}

async function pinjamConversation(conversation: Conversation<BotContext>, ctx: BotContext) {
  await ctx.reply("Berapa yang mau dipinjam dari Bibit? Dana HP tidak bisa dipinjam.");
  const amountCtx = await conversation.waitFor("message:text");
  const parsed = parseCommandAmount(amountCtx.message.text);
  if (!parsed) {
    await ctx.reply("Belum aku catat. Ulangi nanti dengan angka yang jelas.");
    return;
  }
  await ctx.reply("Tulis alasan satu kalimat dan tanggal balikinnya.");
  const reasonCtx = await conversation.waitFor("message:text");
  await ctx.reply(
    `Aku tahan dulu 24 jam sesuai aturan. Kalau masih mau, ulangi /pinjam besok. Nominal ${rupiah(parsed.amount)}; alasan: ${reasonCtx.message.text}.`
  );
}

function parseCommandAmount(text: string): { amount: number; note: string } | null {
  const match = /^\s*(\d[\d.]*(?:,\d+)?)(?:\s*)(rb|ribu|k|jt|juta)?\s*(.*)$/i.exec(text);
  if (!match?.[1]) return null;
  let amount = Number(match[1].replace(/\./g, "").replace(",", "."));
  const suffix = match[2]?.toLowerCase();
  if (suffix === "jt" || suffix === "juta") amount *= 1_000_000;
  else if (suffix === "rb" || suffix === "ribu" || suffix === "k") amount *= 1_000;
  return { amount: Math.round(amount), note: match[3]?.trim() ?? "" };
}
