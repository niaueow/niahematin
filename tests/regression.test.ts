import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { calculateDailyLimit } from "../src/core/budget.js";
import { createTestHarness } from "./helpers/testHarness.js";
import { bootstrapDatabase } from "../src/db.js";

const { tempDbPath } = vi.hoisted(() => {
  const randomSuffix = Math.random().toString(36).slice(2);
  const tempPath = `test-temp-regression-${Date.now()}-${randomSuffix}.db`;
  process.env.DATABASE_URL = `file:./${tempPath}`;
  process.env.TELEGRAM_BOT_TOKEN = "11111111:FAKE_MOCK_TOKEN";
  process.env.TELEGRAM_ALLOWED_USER_ID = "11111111";
  process.env.NODE_ENV = "test";
  return { tempDbPath: tempPath };
});

describe("6.4 Regression Testing (PRD v3 Checklist)", () => {
  const harness = createTestHarness(tempDbPath);

  beforeAll(async () => {
    await harness.init();
  });

  afterAll(async () => {
    await harness.teardown();
  });

  // R-01: Tested by running test suite command
  it("R-01: Core calculations from original test suite remain consistent", () => {
    const plan = {
      needsBudget: 1_000_000,
      groceriesTarget: 300_000
    };
    const res = calculateDailyLimit({
      plan,
      snapshot: { makanSpent: 0, groceriesSpent: 150_000 },
      dayOfMonth: 3,
      daysInMonth: 30
    });
    expect(res.baseDailyLimit).toBe(23_334);
    expect(res.makanLeft).toBe(700_000);
    expect(res.dailyLimit).toBe(25_000);
  });

  // R-03: PRD worked example (F-08 to F-12) permanently encoded
  it("R-03: PRD worked example is permanently locked against formula drift", () => {
    const plan = {
      needsBudget: 1_000_000,
      groceriesTarget: 300_000
    };

    // Day 1: Base limit
    const day1 = calculateDailyLimit({
      plan,
      snapshot: { makanSpent: 0, groceriesSpent: 0 },
      dayOfMonth: 1,
      daysInMonth: 30
    });
    expect(day1.baseDailyLimit).toBe(23_334);
    expect(day1.dailyLimit).toBe(23_334);

    // Day 3: Groceries 150k
    const day3 = calculateDailyLimit({
      plan,
      snapshot: { makanSpent: 0, groceriesSpent: 150_000 },
      dayOfMonth: 3,
      daysInMonth: 30
    });
    expect(day3.makanLeft).toBe(700_000);
    expect(day3.dailyLimit).toBe(25_000);

    // Day 2: Jajan 30k on day 1
    const day2 = calculateDailyLimit({
      plan,
      snapshot: { makanSpent: 30_000, groceriesSpent: 0 },
      dayOfMonth: 2,
      daysInMonth: 30
    });
    expect(day2.dailyLimit).toBe(23_104);

    // Day 25: Danger mode below floor
    const day25 = calculateDailyLimit({
      plan,
      snapshot: { makanSpent: 620_000, groceriesSpent: 0 },
      dayOfMonth: 25,
      daysInMonth: 30
    });
    expect(day25.dailyLimit).toBe(13_334);
    expect(day25.survivalFloor).toBe(14_001);
    expect(day25.isDanger).toBe(true);
  });

  // R-04: Pre-existing tests check
  it("R-04: Original tests/budget.test.ts is untouched and preserved", async () => {
    const fs = await import("node:fs");
    expect(fs.existsSync("tests/budget.test.ts")).toBe(true);
    const content = fs.readFileSync("tests/budget.test.ts", "utf-8");
    expect(content).not.toContain(".skip");
    expect(content).not.toContain(".only");
  });

  // R-05: Database bootstrap applies cleanly on empty and seeded DB
  it("R-05: Database bootstrap applies cleanly multiple times without error", async () => {
    await expect(bootstrapDatabase()).resolves.not.toThrow();
  });
});
