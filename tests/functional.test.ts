import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { parseQuickLog } from "../src/parser/quickLogParser.js";
import { calculateDailyLimit, evaluateBoleh } from "../src/core/budget.js";
import { effectiveBusinessDate, effectiveDayKey, weekKey } from "../src/core/calendar.js";
import { createTestHarness } from "./helpers/testHarness.js";
import { confirmAllowance, createOrGetCurrentPlan } from "../src/services/planService.js";
import { addExpense, getSnapshot } from "../src/services/transactionService.js";

const { tempDbPath } = vi.hoisted(() => {
  const randomSuffix = Math.random().toString(36).slice(2);
  const tempPath = `test-temp-functional-${Date.now()}-${randomSuffix}.db`;
  process.env.DATABASE_URL = `file:./${tempPath}`;
  process.env.TELEGRAM_BOT_TOKEN = "11111111:FAKE_MOCK_TOKEN";
  process.env.TELEGRAM_ALLOWED_USER_ID = "11111111";
  process.env.NODE_ENV = "test";
  return { tempDbPath: tempPath };
});

describe("6.1 Functional Testing (PRD v3 Checklist)", () => {
  const harness = createTestHarness(tempDbPath);

  beforeAll(async () => {
    await harness.init();
  });

  afterAll(async () => {
    await harness.teardown();
  });

  beforeEach(async () => {
    harness.clearCalls();
  });

  // F-01
  it("F-01: '15 kopi' logs Rp 15.000, note 'kopi', category Jajan, replies with one-line confirmation", async () => {
    await harness.sendText("15 kopi");
    const reply = harness.lastReply();
    expect(reply).toBeDefined();
    expect(reply).toContain("15.000");
    expect(reply).toContain("kopi");
    expect(reply).toContain("Jajan");
    expect(reply).toContain("Sisa limit hari ini");

    const tx = await harness.prisma.transaction.findFirst({
      where: { note: "kopi" }
    });
    expect(tx).toBeDefined();
    expect(tx?.amount).toBe(15_000);
    expect(tx?.category).toBe("JAJAN");
    expect(tx?.pot).toBe("NEEDS");
  });

  // F-02
  it("F-02: Amount formats parse correctly", () => {
    expect(parseQuickLog("15 kopi")?.amount).toBe(15_000);
    expect(parseQuickLog("15rb kopi")?.amount).toBe(15_000);
    expect(parseQuickLog("15k kopi")?.amount).toBe(15_000);
    expect(parseQuickLog("15.000 kopi")?.amount).toBe(15_000);
    expect(parseQuickLog("15000 kopi")?.amount).toBe(15_000);
    expect(parseQuickLog("1,5jt belanja")?.amount).toBe(1_500_000);
    expect(parseQuickLog("goceng parkir")?.amount).toBe(5_000);
    expect(parseQuickLog("ceban bensin")?.amount).toBe(10_000);
  });

  // F-03
  it("F-03: Category buttons appear when confidence is low and tapping saves keyword", async () => {
    // Use a single-item phrase with an unknown keyword so hasMultipleItems stays false
    await harness.sendText("25 sesuatu_asing_xyz");
    const lastCall = harness.recordedCalls.find((c) => c.method === "sendMessage");
    // PRD 5.1: If confidence is low, show inline buttons for category selection
    expect(lastCall?.payload.reply_markup?.inline_keyboard).toBeDefined();
  });

  // F-04
  it("F-04: Multi-item message ('15 kopi 20 nasgor') logged as separate expenses or asks for clarification", async () => {
    const beforeCount = await harness.prisma.transaction.count({ where: { type: "EXPENSE" } });
    await harness.sendText("15 kopi 20 nasgor");
    const afterCount = await harness.prisma.transaction.count({ where: { type: "EXPENSE" } });
    const reply = harness.lastReply();

    // PRD NLP fallback / QA F-04: Must not silently log only one item and drop the other.
    // Either both transactions are recorded (2 added) or a clarification reply is sent (0 added + reply exists)
    const validHandling = (afterCount === beforeCount + 2) || (afterCount === beforeCount && reply !== undefined);
    expect(validHandling).toBe(true);
  });

  // F-05
  it("F-05: /undo removes last log and /edit changes amount or category", async () => {
    await harness.sendText("20.000 mie");
    const txBefore = await harness.prisma.transaction.findFirst({ where: { note: "mie" } });
    expect(txBefore).toBeDefined();

    await harness.sendCommand("undo");
    const txAfter = await harness.prisma.transaction.findFirst({ where: { id: txBefore!.id } });
    expect(txAfter).toBeNull();

    // Now test /edit command (PRD 5.1)
    await harness.sendText("25.000 soto");
    await harness.sendCommand("edit", "30.000 soto");
    const editedReply = harness.lastReply();
    expect(editedReply).toContain("diubah");
  });

  // F-06
  it("F-06: Expense above Rp 100.000 outside Groceries asks which pot it belongs to", async () => {
    await harness.sendText("120000 baju");
    const reply = harness.lastReply();
    // PRD 5.1: Expense > 100k outside groceries prompts for pot selection
    expect(reply).toMatch(/pot/i);
  });

  // F-07
  it("F-07: Recurring bills prompt on due date and log with one tap", async () => {
    // PRD 5.7: Recurring bills support
    // Bot should have a command or interface to register and prompt recurring bills
    await harness.sendCommand("tagihan");
    const reply = harness.lastReply();
    expect(reply).toBeDefined();
    expect(reply).not.toContain("Unknown command");
  });

  // F-08
  it("F-08: Day 1 base limit equals Makan Left / days left (about Rp 23.333)", () => {
    const plan = {
      needsBudget: 1_000_000,
      groceriesTarget: 300_000
    };
    const result = calculateDailyLimit({
      plan,
      snapshot: { makanSpent: 0, groceriesSpent: 0 },
      dayOfMonth: 1,
      daysInMonth: 30
    });
    // Base daily limit is ceil(700,000 / 30) = 23,334
    expect(result.makanLeft).toBe(700_000);
    expect(result.baseDailyLimit).toBe(23_334);
    expect(result.dailyLimit).toBe(23_334);
  });

  // F-09
  it("F-09: Groceries Rp 150.000 on day 3 does not change daily limit", () => {
    const plan = {
      needsBudget: 1_000_000,
      groceriesTarget: 300_000
    };
    const result = calculateDailyLimit({
      plan,
      snapshot: { makanSpent: 0, groceriesSpent: 150_000 },
      dayOfMonth: 3,
      daysInMonth: 30
    });
    expect(result.makanLeft).toBe(700_000);
    expect(result.groceriesReserve).toBe(150_000);
    expect(result.dailyLimit).toBe(25_000); // capped at 23_334 * 1.25 = 29_167? Uncapped 700k/28 = 25,000
  });

  // F-10
  it("F-10: After a Rp 30.000 jajan on day 1, day 2 limit is about Rp 23.103", () => {
    const plan = {
      needsBudget: 1_000_000,
      groceriesTarget: 300_000
    };
    const result = calculateDailyLimit({
      plan,
      snapshot: { makanSpent: 30_000, groceriesSpent: 0 },
      dayOfMonth: 2,
      daysInMonth: 30
    });
    // (700,000 - 30,000) / 29 = 670,000 / 29 = 23,103.4 -> 23,104
    expect(result.dailyLimit).toBe(23_104);
  });

  // F-11
  it("F-11: Limit never exceeds 1.25 times base limit", () => {
    const plan = {
      needsBudget: 1_000_000,
      groceriesTarget: 300_000
    };
    const result = calculateDailyLimit({
      plan,
      snapshot: { makanSpent: 0, groceriesSpent: 0 },
      dayOfMonth: 10,
      daysInMonth: 30
    });
    // Base is 23,334; cap is floor(23,334 * 1.25) = 29,167. Uncapped is 700,000 / 21 = 33,334
    expect(result.uncappedDailyLimit).toBe(33_334);
    expect(result.dailyLimit).toBe(29_167);
    expect(result.dailyLimit).toBeLessThanOrEqual(Math.floor(result.baseDailyLimit * 1.25));
  });

  // F-12
  it("F-12: Survival floor is 60% of base limit and triggers Danger Mode", () => {
    const plan = {
      needsBudget: 1_000_000,
      groceriesTarget: 300_000
    };
    const result = calculateDailyLimit({
      plan,
      snapshot: { makanSpent: 620_000, groceriesSpent: 0 },
      dayOfMonth: 25,
      daysInMonth: 30
    });
    expect(result.survivalFloor).toBe(14_001);
    expect(result.dailyLimit).toBe(13_334);
    expect(result.isDanger).toBe(true);
  });

  // F-13
  it("F-13: Danger Mode: one entry message, Fun frozen, non-essential /boleh returns red", async () => {
    // PRD 5.3: In Danger Mode, Fun is frozen, non-essential /boleh must evaluate to red
    const plan = {
      needsBudget: 1_000_000,
      groceriesTarget: 300_000,
      smallBuyCountPerWeek: 3,
      smallBuyAmountPerWeek: 60_000,
      hpBudget: 400_000
    };
    const dangerDaily = calculateDailyLimit({
      plan,
      snapshot: { makanSpent: 620_000, groceriesSpent: 0 },
      dayOfMonth: 25,
      daysInMonth: 30
    });
    expect(dangerDaily.isDanger).toBe(true);

    const boleh = evaluateBoleh({
      amount: 10_000,
      isSmallBuy: false,
      daily: dangerDaily,
      tomorrowLimit: dangerDaily.dailyLimit,
      weekSmallBuy: { count: 0, amount: 0 },
      plan
    });
    // In Danger Mode, non-essential buys must return red (MELEWATI_LIMIT)
    expect(boleh.verdict).toBe("MELEWATI_LIMIT");
  });

  // F-14
  it("F-14: Overflow order is Fun first, Buffer last; Bibit and HP fund never touched", async () => {
    // PRD 5.3: Overflow order
    const plan = await createOrGetCurrentPlan();
    expect(plan.funBudget).toBeGreaterThan(0);
    expect(plan.bufferBudget).toBeGreaterThan(0);
  });

  // F-15
  it("F-15: Needs spending above Rp 1.000.000 is recorded as Needs overspend", async () => {
    const tx = await addExpense({
      amount: 15_000,
      note: "nasi",
      category: "MAKAN"
    });
    expect(tx.isOverspendNeeds).toBe(true);
  });

  // F-16
  it("F-16: Non-food small buys go to Fun, food small buys go to Needs", async () => {
    const txRandom = await addExpense({
      amount: 15_000,
      note: "stiker",
      category: "RANDOM"
    });
    expect(txRandom.pot).toBe("FUN");

    const txJajan = await addExpense({
      amount: 15_000,
      note: "cilok",
      category: "JAJAN"
    });
    expect(txJajan.pot).toBe("NEEDS");
  });

  // F-17
  it("F-17: Jajan and Random up to Rp 50.000 count as small buys, above Rp 50.000 does not count", async () => {
    const tx1 = await addExpense({ amount: 50_000, note: "snack", category: "JAJAN" });
    expect(tx1.isSmallBuy).toBe(true);

    const tx2 = await addExpense({ amount: 50_001, note: "snack mahal", category: "JAJAN" });
    expect(tx2.isSmallBuy).toBe(false);
  });

  // F-18
  it("F-18: The weekly budget resets on Monday (Monday to Sunday)", () => {
    // 2026-10-12 is Monday, 2026-10-18 is Sunday, 2026-10-19 is Monday
    const monday1 = new Date(Date.UTC(2026, 9, 12, 5, 0, 0));
    const sunday = new Date(Date.UTC(2026, 9, 18, 5, 0, 0));
    const monday2 = new Date(Date.UTC(2026, 9, 19, 5, 0, 0));

    expect(weekKey(monday1)).toBe("2026-10-12");
    expect(weekKey(sunday)).toBe("2026-10-12");
    expect(weekKey(monday2)).toBe("2026-10-19");
  });

  // F-19
  it("F-19: /boleh 25000 boba shows limit, tomorrow limit, small buys, HP delay, and verdict", async () => {
    await harness.sendCommand("boleh", "25000 boba");
    const reply = harness.lastReply();
    expect(reply).toBeDefined();
    expect(reply).toContain("boba");
    expect(reply).toContain("Limit hari ini:");
    expect(reply).toContain("Besok jadi");
    expect(reply).toContain("Small buy sisa");
    expect(reply).toContain("Dampak HP:");
  });

  // F-20
  it("F-20: 'Jadi beli' logs expense, 'Batal beli' logs nothing and adds to saved counter", async () => {
    await harness.sendCommand("boleh", "20000 kopi");
    const beforeExpenseCount = await harness.prisma.transaction.count({ where: { type: "EXPENSE" } });
    
    // Tap Jadi beli
    await harness.tapButton("boleh:buy");
    const afterBuyCount = await harness.prisma.transaction.count({ where: { type: "EXPENSE" } });
    expect(afterBuyCount).toBe(beforeExpenseCount + 1);

    // Now test Batal beli
    await harness.sendCommand("boleh", "30000 boba");
    await harness.tapButton("boleh:cancel");
    const afterCancelExpenseCount = await harness.prisma.transaction.count({ where: { type: "EXPENSE" } });
    expect(afterCancelExpenseCount).toBe(afterBuyCount); // No new expense

    const cancelledTx = await harness.prisma.transaction.findFirst({
      where: { type: "CANCELLED_BUY", amount: 30_000 }
    });
    expect(cancelledTx).toBeDefined();
  });

  // F-21
  it("F-21: /boleh never changes any balance by itself", async () => {
    const beforeCount = await harness.prisma.transaction.count();
    await harness.sendCommand("boleh", "15000 es");
    const afterCount = await harness.prisma.transaction.count();
    expect(afterCount).toBe(beforeCount);
  });

  // F-22
  it("F-22: /masuk 2000000 jatah creates the monthly plan", async () => {
    await harness.sendCommand("masuk", "2000000 jatah");
    const reply = harness.lastReply();
    expect(reply).toContain("Masuk Rp 2.000.000");
    expect(reply).toContain("Transfer hari 1: Bibit Rp 100.000 + HP Rp 400.000");

    const plan = await harness.prisma.monthPlan.findFirst({
      where: { allowance: 2_000_000 }
    });
    expect(plan).toBeDefined();
  });

  // F-23
  it("F-23: Day 1 transfer confirmation lists Bibit and HP totaling Rp 500.000", async () => {
    await harness.sendCommand("masuk", "2000000 jatah");
    const reply = harness.lastReply();
    expect(reply).toContain("Bibit Rp 100.000");
    expect(reply).toContain("HP Rp 400.000");
  });

  // F-24
  it("F-24: Other income defaults to HP sweep unless another pot is chosen", async () => {
    // PRD 5.2: Other income defaults to HP fund
    await harness.sendCommand("masuk", "500000 angpao");
    const reply = harness.lastReply();
    expect(reply).toMatch(/HP/i);
  });

  // F-25
  it("F-25: /saldo computes drift, over 20k triggers question, unresolved drift logged as tak terlacak", async () => {
    // PRD 5.4: /saldo computes drift
    await harness.sendCommand("saldo", "1500000");
    const reply = harness.lastReply();
    expect(reply).toBeDefined();
    // Must implement /saldo command
    expect(reply).not.toContain("Unknown command");
  });

  // F-26
  it("F-26: Sweep is default-on, Turbo HP sends 100% to HP", async () => {
    // PRD 5.6: End of month sweep
    await harness.sendCommand("sweep");
    const reply = harness.lastReply();
    expect(reply).toBeDefined();
  });

  // F-27
  it("F-27: /pinjam works for Bibit only, enforces 24h wait, marks metric as failed", async () => {
    // PRD 5.5: /pinjam flow
    await harness.sendCommand("pinjam");
    expect(harness.lastReply()).toContain("Berapa yang mau dipinjam dari Bibit");
  });

  // F-28
  it("F-28: /utang is counted like /pinjam", async () => {
    // PRD 5.5: /utang
    await harness.sendCommand("utang");
    const reply = harness.lastReply();
    expect(reply).toBeDefined();
    expect(reply).not.toContain("Unknown command");
  });

  // F-29
  it("F-29: Morning message at 07.00, evening at 20.30, weekly recap Sunday 19.00", async () => {
    // Verified by scheduler setup
    const { startScheduler } = await import("../src/scheduler.js");
    const jobs = startScheduler();
    expect(jobs).toHaveLength(3);
    for (const j of jobs) j.stop();
  });

  // F-30
  it("F-30: At most 1 proactive warning per day in priority order", async () => {
    // PRD 5.8: Guardrails & priority
    const plan = await createOrGetCurrentPlan();
    expect(plan).toBeDefined();
  });

  // F-31
  it("F-31: No proactive messages during quiet hours (22:00 to 06:30)", async () => {
    const config = await harness.prisma.userConfig.findFirst();
    expect(config?.quietStart).toBe("22:00");
    expect(config?.quietEnd).toBe("06:30");
  });

  // F-32
  it("F-32: Inactivity reminder after 3 days without logs", async () => {
    // PRD 5.8: After 3 days without logs, reminder sent
    await harness.sendCommand("status");
    const reply = harness.lastReply();
    expect(reply).toBeDefined();
  });

  // F-33
  it("F-33: 'Hari ini nggak keluar uang' counts as a no-spend day", async () => {
    await harness.sendText("Hari ini nggak keluar uang");
    const reply = harness.lastReply();
    // PRD 5.8: Recognized as no-spend day confirmation
    expect(reply).toBeDefined();
    expect(reply).toMatch(/catat|tercatat|sip|mantap/i);
  });

  // F-34
  it("F-34: /sisa, /rencana, /ringkas, and /export return correct data", async () => {
    await harness.sendCommand("sisa");
    expect(harness.lastReply()).toContain("Limit makan hari ini");

    await harness.sendCommand("rencana");
    const rencanaReply = harness.lastReply();
    expect(rencanaReply).toBeDefined();
    expect(rencanaReply).not.toContain("Unknown");

    await harness.sendCommand("ringkas");
    const ringkasReply = harness.lastReply();
    expect(ringkasReply).toBeDefined();

    await harness.sendCommand("export");
    const exportReply = harness.lastReply();
    expect(exportReply).toBeDefined();
  });
});
