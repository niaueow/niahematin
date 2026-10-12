import { describe, expect, it } from "vitest";
import { calculateDailyLimit, evaluateBoleh } from "../src/core/budget.js";

const plan = {
  monthKey: "2026-11",
  mode: "ACTIVE" as const,
  needsBudget: 1_000_000,
  groceriesTarget: 300_000,
  bibitBudget: 100_000,
  hpBudget: 400_000,
  tagihanBudget: 100_000,
  transportBudget: 150_000,
  funBudget: 100_000,
  otherNeedsBudget: 50_000,
  bufferBudget: 100_000,
  smallBuyCountPerWeek: 3,
  smallBuyAmountPerWeek: 60_000
};

describe("daily limit math", () => {
  it("keeps makan limit stable after groceries spend", () => {
    const result = calculateDailyLimit({
      plan,
      snapshot: { makanSpent: 0, groceriesSpent: 150_000 },
      dayOfMonth: 3,
      daysInMonth: 30
    });

    expect(result.baseDailyLimit).toBe(23_334);
    expect(result.makanLeft).toBe(700_000);
    expect(result.dailyLimit).toBe(25_000);
  });

  it("spreads an early jajan overspend across remaining days", () => {
    const result = calculateDailyLimit({
      plan,
      snapshot: { makanSpent: 30_000, groceriesSpent: 0 },
      dayOfMonth: 2,
      daysInMonth: 30
    });

    expect(result.dailyLimit).toBe(23_104);
  });

  it("enters danger mode below the survival floor", () => {
    const result = calculateDailyLimit({
      plan,
      snapshot: { makanSpent: 620_000, groceriesSpent: 0 },
      dayOfMonth: 25,
      daysInMonth: 30
    });

    expect(result.dailyLimit).toBe(13_334);
    expect(result.survivalFloor).toBe(14_001);
    expect(result.isDanger).toBe(true);
  });
});

describe("/boleh verdict", () => {
  it("turns red when purchase exceeds today's limit", () => {
    const daily = calculateDailyLimit({
      plan,
      snapshot: { makanSpent: 0, groceriesSpent: 0 },
      dayOfMonth: 1,
      daysInMonth: 30
    });

    const result = evaluateBoleh({
      amount: 25_000,
      isSmallBuy: true,
      daily,
      tomorrowLimit: 23_000,
      weekSmallBuy: { count: 0, amount: 0 },
      plan
    });

    expect(result.verdict).toBe("MELEWATI_LIMIT");
    expect(result.hpDelayDaysIfBought).toBe(2);
  });
});
