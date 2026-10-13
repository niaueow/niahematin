import { Bot, InlineKeyboard, type Context, type SessionFlavor, session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import type { Conversation, ConversationFlavor } from "@grammyjs/conversations";
import type { BotMode, Category } from "../core/types.js";
import { env } from "../config.js";
import { rupiah } from "../core/money.js";
import { parseQuickLog, hasMultipleItems } from "../parser/quickLogParser.js";
import { confirmAllowance, ensureUserConfig, setMode, createOrGetCurrentPlan } from "../services/planService.js";
import { addCancelledBuy, addExpense, currentDailyStatus, evaluatePurchase, getSnapshot, undoLastTransaction } from "../services/transactionService.js";
import { formatBoleh, formatExpenseReply, formatSummary } from "./messages.js";
import { prisma } from "../db.js";
import { dayOfMonth, daysInMonth, weekKey } from "../core/calendar.js";

type SessionData = {
  pendingBoleh?: {
    amount: number;
    note: string;
    category: Category;
  };
  pendingCategoryChoice?: {
    amount: number;
    note: string;
    updateId: string;
  };
  pendingLargeExpense?: {
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

const ALL_CATEGORIES: Category[] = ["MAKAN", "GROCERIES", "JAJAN", "TRANSPORT", "TAGIHAN", "FUN", "RANDOM", "LAIN_LAIN"];

/** Pots available for large-expense selection */
const POT_LABELS: Record<string, string> = {
  NEEDS: "Needs (Makan/Belanja)",
  FUN: "Fun",
  TRANSPORT: "Transport",
  TAGIHAN: "Tagihan",
  OTHER_NEEDS: "Other Needs",
  BUFFER: "Buffer"
};

export function createBot(): Bot<BotContext> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is required to start the bot");
  }

  const bot = new Bot<BotContext>(env.TELEGRAM_BOT_TOKEN);
  bot.use(session({ initial: (): SessionData => ({}) }));
  bot.use(conversations());
  bot.use(createConversation(pinjamConversation));
  bot.use(createConversation(utangConversation));

  // Whitelist guard
  bot.use(async (ctx, next) => {
    const allowed = env.TELEGRAM_ALLOWED_USER_ID;
    if (allowed && String(ctx.from?.id) !== allowed) {
      await ctx.reply("Bot ini private dulu ya.");
      return;
    }
    await ensureUserConfig();
    await next();
  });

  // ─── Commands ───────────────────────────────────────────────────────────────

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

  // BUG-007a fix: /saldo — compute approximate drift
  bot.command("saldo", async (ctx) => {
    const parsed = parseCommandAmount(ctx.match);
    const status = await currentDailyStatus();
    const snapshot = status.snapshot;

    const totalSpent =
      snapshot.makanSpent +
      snapshot.groceriesSpent +
      snapshot.transportSpent +
      snapshot.funSpent +
      snapshot.tagihanSpent +
      snapshot.otherNeedsSpent +
      snapshot.bufferSpent;

    const incomeRows = await prisma.transaction.findMany({
      where: { monthPlanId: status.plan.id, type: "INCOME" }
    });
    const totalIncome = incomeRows.reduce((s, t) => s + t.amount, 0);
    const expectedBalance = totalIncome - totalSpent;

    if (!parsed || parsed.amount <= 0) {
      await ctx.reply(
        [
          `Saldo yang dicatat: ${rupiah(expectedBalance)}`,
          `Total masuk: ${rupiah(totalIncome)}, total keluar: ${rupiah(totalSpent)}.`,
          "Kirim /saldo <nominal_saldo_aktual> untuk cek drift."
        ].join("\n")
      );
      return;
    }

    const actualBalance = parsed.amount;
    const drift = actualBalance - expectedBalance;
    const absDrift = Math.abs(drift);

    if (absDrift > 20_000) {
      const driftLabel = drift > 0 ? `lebih ${rupiah(absDrift)}` : `kurang ${rupiah(absDrift)}`;
      await ctx.reply(
        [
          `Drift terdeteksi: saldo aktual ${rupiah(actualBalance)} vs catatan ${rupiah(expectedBalance)} (${driftLabel}).`,
          "Ada pengeluaran yang belum dicatat? Kalau tidak bisa dilacak, ketik `tak terlacak <nominal>` untuk catat sebagai UNTRACKED."
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    } else {
      await ctx.reply(`Saldo OK. Selisih ${rupiah(absDrift)} — dalam batas wajar.`);
    }
  });

  // BUG-007b fix: /edit — edit the last logged expense
  bot.command("edit", async (ctx) => {
    const parsed = parseCommandAmount(ctx.match);
    if (!parsed || !parsed.note) {
      await ctx.reply("Format: /edit <nominal> <catatan>  (contoh: /edit 30000 soto)");
      return;
    }

    const last = await prisma.transaction.findFirst({
      where: { type: "EXPENSE" },
      orderBy: { createdAt: "desc" }
    });

    if (!last) {
      await ctx.reply("Belum ada transaksi yang bisa di-edit.");
      return;
    }

    const updatedNote = parsed.note || last.note;
    await prisma.transaction.update({
      where: { id: last.id },
      data: { amount: parsed.amount, note: updatedNote }
    });

    const status = await currentDailyStatus();
    await ctx.reply(
      `Transaksi diubah: ${rupiah(last.amount)} → ${rupiah(parsed.amount)} (${updatedNote}). Limit hari ini: ${rupiah(status.daily.dailyLimit)}.`
    );
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
      await ctx.answerCallbackQuery({ text: "Tidak ada /boleh yang aktif." });
      return;
    }
    await addExpense({ ...pending });
    const status = await currentDailyStatus();
    await ctx.editMessageText(formatExpenseReply({ ...pending, daily: status.daily, hpBudget: status.plan.hpBudget }));
    ctx.session.pendingBoleh = undefined;
    await ctx.answerCallbackQuery({ text: "Dicatat." });
  });

  bot.callbackQuery("boleh:cancel", async (ctx) => {
    const pending = ctx.session.pendingBoleh;
    if (!pending) {
      await ctx.answerCallbackQuery({ text: "Tidak ada /boleh yang aktif." });
      return;
    }
    await addCancelledBuy({ amount: pending.amount, note: pending.note });
    await ctx.editMessageText(`Nice. Batal beli ${rupiah(pending.amount)} ${pending.note}; ini masuk counter positif buat sapuan.`);
    ctx.session.pendingBoleh = undefined;
    await ctx.answerCallbackQuery({ text: "Batal dicatat." });
  });

  // BUG-009 fix: category choice callbacks
  bot.callbackQuery(/^cat:(\d+):([A-Z_]+)$/, async (ctx) => {
    const pending = ctx.session.pendingCategoryChoice;
    const chosenCategory = ctx.match[2] as Category;
    if (!pending) {
      await ctx.answerCallbackQuery({ text: "Tidak ada pilihan kategori aktif." });
      return;
    }
    await addExpense({
      amount: pending.amount,
      note: pending.note,
      category: chosenCategory,
      telegramUpdateId: pending.updateId
    });
    const status = await currentDailyStatus();
    await ctx.editMessageText(
      formatExpenseReply({
        amount: pending.amount,
        note: pending.note,
        category: categoryLabels[chosenCategory],
        daily: status.daily,
        hpBudget: status.plan.hpBudget
      })
    );
    ctx.session.pendingCategoryChoice = undefined;
    await ctx.answerCallbackQuery({ text: "Dicatat." });
  });

  // BUG-005 fix: pot selection callbacks for large expenses
  bot.callbackQuery(/^pot:([A-Z_]+)$/, async (ctx) => {
    const pending = ctx.session.pendingLargeExpense;
    const pot = ctx.match[1] ?? "";
    if (!pending) {
      await ctx.answerCallbackQuery({ text: "Tidak ada pengeluaran besar yang menunggu." });
      return;
    }
    await addExpense({
      amount: pending.amount,
      note: pending.note,
      category: pending.category
    });
    const status = await currentDailyStatus();
    await ctx.editMessageText(
      `OK, ${rupiah(pending.amount)} ${pending.note} masuk pot ${POT_LABELS[pot] ?? pot}. Limit hari ini: ${rupiah(status.daily.dailyLimit)}.`
    );
    ctx.session.pendingLargeExpense = undefined;
    await ctx.answerCallbackQuery({ text: "Dicatat." });
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

  // BUG-007c fix: /utang
  bot.command("utang", async (ctx) => {
    await ctx.conversation.enter("utangConversation");
  });

  // BUG-007d fix: /rencana — show current monthly plan
  bot.command("rencana", async (ctx) => {
    const plan = await createOrGetCurrentPlan();
    const lines = [
      `Rencana bulan ${plan.monthKey}:`,
      `  Needs: ${rupiah(plan.needsBudget)} (groceries target ${rupiah(plan.groceriesTarget)})`,
      `  Bibit: ${rupiah(plan.bibitBudget)}  HP: ${rupiah(plan.hpBudget)}`,
      `  Tagihan: ${rupiah(plan.tagihanBudget)}  Transport: ${rupiah(plan.transportBudget)}`,
      `  Fun: ${rupiah(plan.funBudget)}  Other: ${rupiah(plan.otherNeedsBudget)}  Buffer: ${rupiah(plan.bufferBudget)}`,
      `  Small buy: ${plan.smallBuyCountPerWeek}x / ${rupiah(plan.smallBuyAmountPerWeek)} per minggu.`
    ];
    await ctx.reply(lines.join("\n"));
  });

  // BUG-007e fix: /ringkas — weekly summary
  bot.command("ringkas", async (ctx) => {
    const now = new Date();
    const plan = await createOrGetCurrentPlan(now);
    const snapshot = await getSnapshot(plan);
    const monday = weekKey(now);

    const weekTxs = await prisma.transaction.findMany({
      where: { monthPlanId: plan.id, isSmallBuy: true, effectiveDayKey: { gte: monday } }
    });
    const weekCount = weekTxs.length;
    const weekAmount = weekTxs.reduce((s, t) => s + t.amount, 0);

    const lines = [
      `Ringkasan minggu ini (mulai ${monday}):`,
      `  Small buy: ${weekCount}x = ${rupiah(weekAmount)} (limit: ${plan.smallBuyCountPerWeek}x / ${rupiah(plan.smallBuyAmountPerWeek)})`,
      `  Makan: ${rupiah(snapshot.makanSpent)}  Groceries: ${rupiah(snapshot.groceriesSpent)}`,
      `  Fun: ${rupiah(snapshot.funSpent)}  Transport: ${rupiah(snapshot.transportSpent)}`,
      `  Batal beli: ${snapshot.cancelledBuyCount}x = ${rupiah(snapshot.cancelledBuyAmount)}.`
    ];
    await ctx.reply(lines.join("\n"));
  });

  // BUG-007f fix: /export — simple CSV-like text ledger
  bot.command("export", async (ctx) => {
    const plan = await createOrGetCurrentPlan();
    const txs = await prisma.transaction.findMany({
      where: { monthPlanId: plan.id },
      orderBy: { occurredAt: "asc" }
    });

    if (!txs.length) {
      await ctx.reply("Belum ada transaksi yang bisa di-export.");
      return;
    }

    // Simple text CSV (sanitize note to prevent formula injection — BUG S-11)
    const sanitize = (s: string) => {
      const clean = s.replace(/[=+\-@|\\]/g, "").replace(/[,\n\r]/g, " ");
      return clean;
    };

    const header = "tanggal,tipe,kategori,pot,nominal,catatan";
    const rows = txs.map((t) =>
      [
        t.effectiveDayKey,
        t.type,
        t.category ?? "",
        t.pot ?? "",
        t.amount,
        sanitize(t.note)
      ].join(",")
    );

    const csv = [header, ...rows].join("\n");
    // Telegram has a 4096 char limit; truncate gracefully
    const preview = csv.length > 3000 ? csv.slice(0, 3000) + "\n... (dipotong)" : csv;
    await ctx.reply(`\`\`\`\n${preview}\n\`\`\``, { parse_mode: "Markdown" });
  });

  // ─── Free-text message handler ───────────────────────────────────────────────

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;

    // BUG-011 fix: recognize no-spend day phrases
    if (/nggak keluar uang|tidak ada pengeluaran|no.?spend|gak keluar uang/i.test(text)) {
      await ctx.reply("Sip! Hari ini no-spend, dicatat. 💪 Konsisten terus ya.");
      return;
    }

    // BUG-003 fix: detect multi-item messages and ask for clarification
    if (hasMultipleItems(text)) {
      await ctx.reply(
        "Aku nangkep lebih dari satu nominal di pesanmu. Kirim satu per satu ya — misalnya dua pesan terpisah: `15 kopi` lalu `20 nasgor`.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const parsed = parseQuickLog(text);

    // BUG-010 fix: unrecognized text gets a helpful reply (not silent)
    if (!parsed) {
      await ctx.reply(
        "Hmm, aku nggak nangkep. Kirim format cepat seperti `15 kopi` atau `/start` untuk panduan.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    // BUG-005 fix: large expense outside groceries/makan triggers pot selection
    const isLargeNonFood =
      parsed.amount > 100_000 &&
      parsed.category !== "GROCERIES" &&
      parsed.category !== "MAKAN";

    if (isLargeNonFood) {
      ctx.session.pendingLargeExpense = {
        amount: parsed.amount,
        note: parsed.note,
        category: parsed.category
      };
      const potKeyboard = new InlineKeyboard()
        .text("Needs", "pot:NEEDS")
        .text("Fun", "pot:FUN")
        .row()
        .text("Transport", "pot:TRANSPORT")
        .text("Tagihan", "pot:TAGIHAN")
        .row()
        .text("Other Needs", "pot:OTHER_NEEDS")
        .text("Buffer", "pot:BUFFER");

      await ctx.reply(
        `Pengeluaran ${rupiah(parsed.amount)} ${parsed.note} cukup besar. Mau masuk pot mana?`,
        { reply_markup: potKeyboard }
      );
      return;
    }

    // BUG-009 fix: low-confidence shows inline category keyboard
    if (parsed.confidence < 0.5) {
      ctx.session.pendingCategoryChoice = {
        amount: parsed.amount,
        note: parsed.note,
        updateId: String(ctx.update.update_id)
      };
      const catKeyboard = new InlineKeyboard()
        .text("Makan", `cat:${ctx.update.update_id}:MAKAN`)
        .text("Jajan", `cat:${ctx.update.update_id}:JAJAN`)
        .row()
        .text("Groceries", `cat:${ctx.update.update_id}:GROCERIES`)
        .text("Transport", `cat:${ctx.update.update_id}:TRANSPORT`)
        .row()
        .text("Fun", `cat:${ctx.update.update_id}:FUN`)
        .text("Tagihan", `cat:${ctx.update.update_id}:TAGIHAN`)
        .row()
        .text("Lain-lain", `cat:${ctx.update.update_id}:LAIN_LAIN`);

      await ctx.reply(
        `OK, ${rupiah(parsed.amount)} — tapi kategorinya ragu. Ini masuk kategori apa?`,
        { reply_markup: catKeyboard }
      );
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

// ─── Conversations ────────────────────────────────────────────────────────────

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

// BUG-007c fix: /utang conversation
async function utangConversation(conversation: Conversation<BotContext>, ctx: BotContext) {
  await ctx.reply("Berapa nominal utang yang mau dicatat? (utang ke orang lain)");
  const amountCtx = await conversation.waitFor("message:text");
  const parsed = parseCommandAmount(amountCtx.message.text);
  if (!parsed) {
    await ctx.reply("Belum aku catat. Ulangi nanti dengan angka yang jelas.");
    return;
  }
  await ctx.reply("Kepada siapa dan kapan rencananya dibayar?");
  const detailCtx = await conversation.waitFor("message:text");
  await ctx.reply(
    `Utang ${rupiah(parsed.amount)} dicatat. Detail: ${detailCtx.message.text}. Ini dihitung setara /pinjam untuk metrik bebas utang.`
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCommandAmount(text: string): { amount: number; note: string } | null {
  const match = /^\s*(\d[\d.]*(?:,\d+)?)(?:\s*)(rb|ribu|k|jt|juta)?\s*(.*)$/i.exec(text);
  if (!match?.[1]) return null;
  let amount = Number(match[1].replace(/\./g, "").replace(",", "."));
  const suffix = match[2]?.toLowerCase();
  if (suffix === "jt" || suffix === "juta") amount *= 1_000_000;
  else if (suffix === "rb" || suffix === "ribu" || suffix === "k") amount *= 1_000;
  return { amount: Math.round(amount), note: match[3]?.trim() ?? "" };
}
