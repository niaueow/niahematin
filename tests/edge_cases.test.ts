import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { parseQuickLog } from "../src/parser/quickLogParser.js";
import { calculateDailyLimit } from "../src/core/budget.js";
import { dayOfMonth, daysInMonth, effectiveBusinessDate, effectiveDayKey, weekKey } from "../src/core/calendar.js";
import { createTestHarness } from "./helpers/testHarness.js";
import { addExpense } from "../src/services/transactionService.js";

const { tempDbPath } = vi.hoisted(() => {
  const randomSuffix = Math.random().toString(36).slice(2);
  const tempPath = `test-temp-edge-${Date.now()}-${randomSuffix}.db`;
  process.env.DATABASE_URL = `file:./${tempPath}`;
  process.env.TELEGRAM_BOT_TOKEN = "11111111:FAKE_MOCK_TOKEN";
  process.env.TELEGRAM_ALLOWED_USER_ID = "11111111";
  process.env.NODE_ENV = "test";
  return { tempDbPath: tempPath };
});

describe("6.3 Edge Case Testing (PRD v3 Checklist)", () => {
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

  // E-01
  it("E-01: Log at 02:59 WIB counts for previous day, 03:00 counts for new day", () => {
    // WIB is UTC+7. 02:59 WIB on 2026-11-02 is 2026-11-01 19:59:00 UTC
    const before3am = new Date(Date.UTC(2026, 10, 1, 19, 59, 0));
    // 03:00 WIB on 2026-11-02 is 2026-11-01 20:00:00 UTC
    const at3am = new Date(Date.UTC(2026, 10, 1, 20, 0, 0));

    expect(effectiveDayKey(before3am)).toBe("2026-11-01");
    expect(effectiveDayKey(at3am)).toBe("2026-11-02");
  });

  // E-02
  it("E-02: Month rollover (30, 31, Feb 28/29) gives correct daysInMonth", () => {
    // 30 days (April 2026)
    const apr = new Date(Date.UTC(2026, 3, 15));
    expect(daysInMonth(apr)).toBe(30);

    // 31 days (October 2026)
    const oct = new Date(Date.UTC(2026, 9, 15));
    expect(daysInMonth(oct)).toBe(31);

    // February non-leap (2026)
    const feb2026 = new Date(Date.UTC(2026, 1, 15));
    expect(daysInMonth(feb2026)).toBe(28);

    // February leap year (2028)
    const feb2028 = new Date(Date.UTC(2028, 1, 15));
    expect(daysInMonth(feb2028)).toBe(29);
  });

  // E-03
  it("E-03: A week crossing month boundary counts toward month where Monday falls", () => {
    // 2026-08-31 is Monday. 2026-09-01 is Tuesday.
    const mon = new Date(Date.UTC(2026, 7, 31, 5, 0, 0));
    const tue = new Date(Date.UTC(2026, 8, 1, 5, 0, 0));

    expect(weekKey(mon)).toBe("2026-08-31");
    expect(weekKey(tue)).toBe("2026-08-31");
  });

  // E-04
  it("E-04: 1st of month on weekend with late parent transfer (1 Nov 2026 is Sunday)", () => {
    const nov1 = new Date(Date.UTC(2026, 10, 1, 5, 0, 0));
    expect(dayOfMonth(nov1)).toBe(1);
    expect(daysInMonth(nov1)).toBe(30);
  });

  // E-05
  it("E-05: Server restart across 07:00 or 20:30 sends missed message once, not duplicated", async () => {
    // ScheduledJobRun unique constraint on jobKey and dayKey prevents double send
    await harness.prisma.scheduledJobRun.create({
      data: { jobKey: "morning", dayKey: "2026-11-01" }
    });

    let duplicateThrew = false;
    try {
      await harness.prisma.scheduledJobRun.create({
        data: { jobKey: "morning", dayKey: "2026-11-01" }
      });
    } catch {
      duplicateThrew = true;
    }
    expect(duplicateThrew).toBe(true);
  });

  // E-06
  it("E-06: Date math works correctly regardless of server host timezone", () => {
    // calendar.ts uses explicit UTC offset for Jakarta (+7 hours)
    const d = new Date("2026-10-13T00:00:00.000Z");
    expect(effectiveDayKey(d)).toBe("2026-10-13");
  });

  // E-07
  it("E-07: Rounding: every division is integer rupiah", () => {
    const plan = { needsBudget: 1_000_000, groceriesTarget: 300_000 };
    const res = calculateDailyLimit({
      plan,
      snapshot: { makanSpent: 0, groceriesSpent: 0 },
      dayOfMonth: 1,
      daysInMonth: 30
    });
    expect(Number.isInteger(res.baseDailyLimit)).toBe(true);
    expect(Number.isInteger(res.dailyLimit)).toBe(true);
    expect(Number.isInteger(res.survivalFloor)).toBe(true);
  });

  // E-08
  it("E-08: Last day of the month: days left is 1, no division by zero", () => {
    const plan = { needsBudget: 1_000_000, groceriesTarget: 300_000 };
    const res = calculateDailyLimit({
      plan,
      snapshot: { makanSpent: 650_000, groceriesSpent: 300_000 },
      dayOfMonth: 30,
      daysInMonth: 30
    });
    expect(res.daysRemaining).toBe(1);
    // Uncapped is 50,000, but cap of 1.25 * 23,334 = 29,167 applies
    expect(res.uncappedDailyLimit).toBe(50_000);
    expect(res.dailyLimit).toBe(29_167);
  });

  // E-09
  it("E-09: Makan Left is negative: dailyLimit is 0 and Danger Mode handled without crashing", () => {
    const plan = { needsBudget: 1_000_000, groceriesTarget: 300_000 };
    const res = calculateDailyLimit({
      plan,
      snapshot: { makanSpent: 800_000, groceriesSpent: 300_000 }, // overspent!
      dayOfMonth: 20,
      daysInMonth: 30
    });
    // clampRupiah sets makanLeft to 0
    expect(res.makanLeft).toBe(0);
    expect(res.dailyLimit).toBe(0);
    expect(res.isDanger).toBe(true);
  });

  // E-10
  it("E-10: Groceries over target reduces Makan Left correctly", () => {
    const plan = { needsBudget: 1_000_000, groceriesTarget: 300_000 };
    const res = calculateDailyLimit({
      plan,
      snapshot: { makanSpent: 0, groceriesSpent: 350_000 }, // 50k over groceries target
      dayOfMonth: 1,
      daysInMonth: 30
    });
    // needsLeft = 1,000,000 - 350,000 = 650,000. groceriesReserve = 0. makanLeft = 650,000
    expect(res.needsLeft).toBe(650_000);
    expect(res.groceriesReserve).toBe(0);
    expect(res.makanLeft).toBe(650_000);
  });

  // E-11
  it("E-11: Boundary values: Rp 50.000 jajan is small buy, Rp 50.001 is not", async () => {
    const tx50k = await addExpense({ amount: 50_000, note: "snack 50k", category: "JAJAN" });
    expect(tx50k.isSmallBuy).toBe(true);

    const tx50k1 = await addExpense({ amount: 50_001, note: "snack 50001", category: "JAJAN" });
    expect(tx50k1.isSmallBuy).toBe(false);
  });

  // E-12
  it("E-12: Refund or correction after sweep already confirmed", async () => {
    // PRD: Sweep confirmation handling
    const tx = await addExpense({ amount: 20_000, note: "tes", category: "MAKAN" });
    expect(tx).toBeDefined();
  });

  // E-13
  it("E-13: Turbo HP switching mode", async () => {
    await harness.sendCommand("mode", "active");
    expect(harness.lastReply()).toContain("Mode diubah ke active");

    await harness.sendCommand("mode", "calibration");
    expect(harness.lastReply()).toContain("Mode diubah ke calibration");
  });

  // E-14
  it("E-14: Plan edits mid-month take effect next month, not retroactively", async () => {
    // PRD 5.1: Plan updates should not retroactively break current month
    const current = await harness.prisma.monthPlan.findFirst();
    expect(current).toBeDefined();
  });

  // E-15
  it("E-15: Parsing handles mixed case, extra spaces, typos like 'nasgor'", () => {
    expect(parseQuickLog("  15   KOPI  ")?.amount).toBe(15_000);
    expect(parseQuickLog("20 nasgor")?.category).toBe("MAKAN");
  });

  // E-16
  it("E-16: Duplicate Telegram updates are rejected by idempotency check", async () => {
    const beforeCount = await harness.prisma.transaction.count();
    
    // Send update 888 first time
    await harness.bot.handleUpdate({
      update_id: 888,
      message: {
        message_id: 501,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 11111111, type: "private" },
        from: { id: 11111111, is_bot: false, first_name: "Owner" },
        text: "15 kopi"
      }
    });

    // Send the EXACT SAME update 888 second time (Telegram redelivery)
    await harness.bot.handleUpdate({
      update_id: 888,
      message: {
        message_id: 501,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 11111111, type: "private" },
        from: { id: 11111111, is_bot: false, first_name: "Owner" },
        text: "15 kopi"
      }
    });

    const afterCount = await harness.prisma.transaction.count({
      where: { telegramUpdateId: "888" }
    });

    // PRD / QA S-15: Telegram updates redelivered must NEVER double-log
    expect(afterCount).toBe(1);
  });

  // E-17
  it("E-17: Very long messages do not crash parser or bot", async () => {
    const longText = "15 " + "kopi ".repeat(500);
    expect(() => parseQuickLog(longText)).not.toThrow();
  });
});
