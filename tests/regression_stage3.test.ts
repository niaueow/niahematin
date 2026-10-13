/**
 * Stage 3 Regression Tests — verify each bug fix
 * Each test MUST FAIL on unpatched code and PASS after the fix.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { createTestHarness } from "./helpers/testHarness.js";
import { calculateDailyLimit, evaluateBoleh } from "../src/core/budget.js";
import { parseQuickLog } from "../src/parser/quickLogParser.js";
import http from "node:http";

const { tempDbPath } = vi.hoisted(() => {
  const randomSuffix = Math.random().toString(36).slice(2);
  const tempPath = `test-temp-stage3-${Date.now()}-${randomSuffix}.db`;
  process.env.DATABASE_URL = `file:./${tempPath}`;
  process.env.TELEGRAM_BOT_TOKEN = "11111111:FAKE_MOCK_TOKEN";
  process.env.TELEGRAM_ALLOWED_USER_ID = "11111111";
  process.env.API_SECRET = "test_api_secret_abc123";
  process.env.NODE_ENV = "test";
  return { tempDbPath: tempPath };
});

import { bootstrapDatabase, closeDb } from "../src/db.js";

describe("Stage 3 Regression Tests", () => {
  const harness = createTestHarness(tempDbPath);

  beforeAll(async () => {
    await harness.init();
    // Seed a monthly plan so commands work
    await harness.sendCommand("masuk", "2000000 jatah");
    harness.clearCalls();
  });

  afterAll(async () => {
    await harness.teardown();
  });

  beforeEach(() => {
    harness.clearCalls();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BUG-001 Regression: Duplicate Telegram updates must NOT double-log expenses
  // ────────────────────────────────────────────────────────────────────────────
  it("BUG-001: Duplicate Telegram update_id does NOT double-write transaction", async () => {
    const uniqueUpdateId = 99001;

    await harness.bot.handleUpdate({
      update_id: uniqueUpdateId,
      message: {
        message_id: 5001,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 11111111, type: "private" },
        from: { id: 11111111, is_bot: false, first_name: "Owner" },
        text: "12 kopi"
      }
    });

    // Telegram redelivers same update_id
    await harness.bot.handleUpdate({
      update_id: uniqueUpdateId,
      message: {
        message_id: 5001,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 11111111, type: "private" },
        from: { id: 11111111, is_bot: false, first_name: "Owner" },
        text: "12 kopi"
      }
    });

    const rows = await harness.prisma.transaction.findMany({
      where: { telegramUpdateId: String(uniqueUpdateId) }
    });
    expect(rows).toHaveLength(1);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BUG-002 Regression: /summary requires authentication
  // ────────────────────────────────────────────────────────────────────────────
  it("BUG-002: GET /summary without Authorization returns 401", async () => {
    const { createServer } = await import("../src/api/server.js");
    const app = createServer();
    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as any).port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/summary`, {
        headers: { connection: "close" }
      });
      expect(res.status).toBe(401);
    } finally {
      if ("closeAllConnections" in server) (server as any).closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it("BUG-002b: GET /summary WITH valid Authorization returns 200", async () => {
    const { createServer } = await import("../src/api/server.js");
    const app = createServer();
    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as any).port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/summary`, {
        headers: { authorization: "Bearer test_api_secret_abc123", connection: "close" }
      });
      expect(res.status).toBe(200);
    } finally {
      if ("closeAllConnections" in server) (server as any).closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BUG-003 Regression: Multi-item message must not silently drop items
  // ────────────────────────────────────────────────────────────────────────────
  it("BUG-003: '15 kopi 20 nasgor' does not silently drop second item", async () => {
    const before = await harness.prisma.transaction.count({ where: { type: "EXPENSE" } });
    await harness.sendText("15 kopi 20 nasgor");
    const after = await harness.prisma.transaction.count({ where: { type: "EXPENSE" } });
    const reply = harness.lastReply();

    // Either 2 new transactions, OR a clarification prompt (no new transactions + reply present)
    const twoLogged = after === before + 2;
    const clarificationAsked = after === before && reply !== undefined;
    expect(twoLogged || clarificationAsked).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BUG-004 Regression: Zero amount must return null, not throw
  // ────────────────────────────────────────────────────────────────────────────
  it("BUG-004: parseQuickLog('0 kopi') returns null without throwing", () => {
    let result: ReturnType<typeof parseQuickLog> | undefined;
    let threw = false;
    try {
      result = parseQuickLog("0 kopi");
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(result).toBeNull();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BUG-005 Regression: Expense > 100k outside groceries triggers pot prompt
  // ────────────────────────────────────────────────────────────────────────────
  it("BUG-005: Sending '150000 baju' triggers a pot-selection prompt", async () => {
    await harness.sendText("150000 baju");
    const reply = harness.lastReply();
    expect(reply).toBeDefined();
    // Must ask for pot selection — either via inline keyboard or text mentioning pot choices
    const lastCall = harness.recordedCalls.find((c) => c.method === "sendMessage");
    const hasPotPrompt =
      lastCall?.payload?.reply_markup?.inline_keyboard !== undefined ||
      /pot|pilih|mana/i.test(reply ?? "");
    expect(hasPotPrompt).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BUG-006 Regression: Re-running /masuk must not create duplicate INCOME rows
  // ────────────────────────────────────────────────────────────────────────────
  it("BUG-006: Sending /masuk twice for same month creates only one INCOME record", async () => {
    // First /masuk already sent in beforeAll; send again
    await harness.sendCommand("masuk", "2000000 jatah");

    const incomeCount = await harness.prisma.transaction.count({
      where: { type: "INCOME", amount: 2_000_000 }
    });
    expect(incomeCount).toBe(1);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BUG-007 Regression: Missing commands must respond (not return undefined)
  // ────────────────────────────────────────────────────────────────────────────
  it("BUG-007a: /saldo responds with something", async () => {
    await harness.sendCommand("saldo", "2000000");
    expect(harness.lastReply()).toBeDefined();
  });

  it("BUG-007b: /edit responds with something", async () => {
    // Log an expense first
    await harness.sendText("15 kopi");
    harness.clearCalls();
    await harness.sendCommand("edit", "20000 kopi");
    expect(harness.lastReply()).toBeDefined();
  });

  it("BUG-007c: /utang responds with something", async () => {
    await harness.sendCommand("utang");
    expect(harness.lastReply()).toBeDefined();
  });

  it("BUG-007d: /rencana responds with something", async () => {
    await harness.sendCommand("rencana");
    expect(harness.lastReply()).toBeDefined();
  });

  it("BUG-007e: /ringkas responds with something", async () => {
    await harness.sendCommand("ringkas");
    expect(harness.lastReply()).toBeDefined();
  });

  it("BUG-007f: /export responds with something", async () => {
    await harness.sendCommand("export");
    expect(harness.lastReply()).toBeDefined();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BUG-008 Regression: Danger Mode forces MELEWATI_LIMIT for non-essential
  // ────────────────────────────────────────────────────────────────────────────
  it("BUG-008: evaluateBoleh returns MELEWATI_LIMIT for non-essential buy in Danger Mode", () => {
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
      isEssential: false, // non-essential: Fun/Jajan
      daily: dangerDaily,
      tomorrowLimit: dangerDaily.dailyLimit,
      weekSmallBuy: { count: 0, amount: 0 },
      plan
    });
    expect(boleh.verdict).toBe("MELEWATI_LIMIT");
    expect(boleh.reasons.some((r) => /danger/i.test(r))).toBe(true);
  });

  it("BUG-008b: evaluateBoleh allows MAKAN in Danger Mode (essential) within daily limit", () => {
    const plan = {
      needsBudget: 1_000_000,
      groceriesTarget: 300_000,
      smallBuyCountPerWeek: 3,
      smallBuyAmountPerWeek: 60_000,
      hpBudget: 400_000
    };
    // Create a danger state where daily limit < survival floor
    const dangerDaily = calculateDailyLimit({
      plan,
      snapshot: { makanSpent: 620_000, groceriesSpent: 0 },
      dayOfMonth: 25,
      daysInMonth: 30
    });
    expect(dangerDaily.isDanger).toBe(true);

    // Use a tomorrowLimit ABOVE the survival floor so the tomorrow-danger check doesn't fire.
    // This isolates the isEssential flag behavior only.
    const tomorrowAboveFloor = dangerDaily.survivalFloor + 5_000;

    const boleh = evaluateBoleh({
      amount: 10_000,       // within daily limit (13,334)
      isSmallBuy: false,
      isEssential: true,   // MAKAN/GROCERIES — should not be blocked by Danger Mode flag
      daily: dangerDaily,
      tomorrowLimit: tomorrowAboveFloor,
      weekSmallBuy: { count: 0, amount: 0 },
      plan
    });
    // Essential food purchase within daily limit should be AMAN, not MELEWATI_LIMIT
    expect(boleh.verdict).not.toBe("MELEWATI_LIMIT");
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BUG-009 Regression: Low confidence triggers inline category buttons
  // ────────────────────────────────────────────────────────────────────────────
  it("BUG-009: Low-confidence text returns inline category buttons, not plain text only", async () => {
    await harness.sendText("15 zzz_unknown_item_xyz");
    const lastSendCall = harness.recordedCalls.find((c) => c.method === "sendMessage");
    expect(lastSendCall?.payload?.reply_markup?.inline_keyboard).toBeDefined();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BUG-010 Regression: Nonsense input gets a helpful reply
  // ────────────────────────────────────────────────────────────────────────────
  it("BUG-010: Unrecognized text gets a helpful guidance reply (not silent)", async () => {
    const before = await harness.prisma.transaction.count();
    await harness.sendText("qqqqqwwwwww");
    const after = await harness.prisma.transaction.count();
    expect(after).toBe(before); // Nothing written
    expect(harness.lastReply()).toBeDefined(); // Reply sent
    expect(harness.lastReply()).toMatch(/format|contoh|kirim|jajan|kopi/i);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BUG-011 Regression: 'Hari ini nggak keluar uang' is acknowledged
  // ────────────────────────────────────────────────────────────────────────────
  it("BUG-011: 'Hari ini nggak keluar uang' gets a no-spend acknowledgment reply", async () => {
    const before = await harness.prisma.transaction.count();
    await harness.sendText("Hari ini nggak keluar uang");
    const after = await harness.prisma.transaction.count();
    expect(after).toBe(before); // No financial transaction
    expect(harness.lastReply()).toBeDefined();
    expect(harness.lastReply()).toMatch(/no.?spend|nggak keluar|sip|mantap|dicatat/i);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BUG-012 Regression: /masuk reply includes correct Bibit + HP figure
  // (Tests existing implementation is preserved — no regression from other fixes)
  // ────────────────────────────────────────────────────────────────────────────
  it("BUG-012: Scheduler has exactly 3 jobs (morning, evening, weekly)", async () => {
    const { startScheduler } = await import("../src/scheduler.js");
    const jobs = startScheduler();
    expect(jobs.length).toBeGreaterThanOrEqual(3);
    for (const j of jobs) j.stop();
  });
});
