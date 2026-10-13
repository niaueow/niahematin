import { ceilRupiah, clampRupiah, hpDays } from "./money.js";
import type { BolehResult, DailyLimitInput, DailyLimitResult, MonthPlanInput, WeekSmallBuySnapshot } from "./types.js";

export function baseDailyLimit(plan: Pick<MonthPlanInput, "needsBudget" | "groceriesTarget">, daysInMonth: number): number {
  return ceilRupiah((plan.needsBudget - plan.groceriesTarget) / daysInMonth);
}

export function calculateDailyLimit(input: DailyLimitInput): DailyLimitResult {
  const daysRemaining = Math.max(1, input.daysInMonth - input.dayOfMonth + 1);
  const needsLeft = clampRupiah(input.plan.needsBudget - input.snapshot.makanSpent - input.snapshot.groceriesSpent);
  const groceriesReserve = clampRupiah(input.plan.groceriesTarget - input.snapshot.groceriesSpent);
  const makanLeft = clampRupiah(needsLeft - groceriesReserve);
  const base = baseDailyLimit(input.plan, input.daysInMonth);
  const uncapped = ceilRupiah(makanLeft / daysRemaining);
  const cap = Math.floor(base * 1.25);
  const dailyLimit = Math.min(uncapped, cap);
  const survivalFloor = Math.ceil(base * 0.6);

  return {
    needsLeft,
    groceriesReserve,
    makanLeft,
    baseDailyLimit: base,
    uncappedDailyLimit: uncapped,
    dailyLimit,
    survivalFloor,
    isDanger: dailyLimit < survivalFloor,
    daysRemaining
  };
}

export function projectedTomorrowLimit(input: DailyLimitInput & { newMakanSpend: number }): number {
  const tomorrowDay = Math.min(input.daysInMonth, input.dayOfMonth + 1);
  return calculateDailyLimit({
    plan: input.plan,
    snapshot: {
      makanSpent: input.snapshot.makanSpent + input.newMakanSpend,
      groceriesSpent: input.snapshot.groceriesSpent
    },
    dayOfMonth: tomorrowDay,
    daysInMonth: input.daysInMonth
  }).dailyLimit;
}

export function evaluateBoleh(input: {
  amount: number;
  isSmallBuy: boolean;
  /** True for MAKAN and GROCERIES. Non-essential buys in Danger Mode are forced red. */
  isEssential?: boolean;
  daily: DailyLimitResult;
  tomorrowLimit: number;
  weekSmallBuy: WeekSmallBuySnapshot;
  plan: Pick<MonthPlanInput, "smallBuyCountPerWeek" | "smallBuyAmountPerWeek" | "hpBudget">;
}): BolehResult {
  const smallBuyCountLeft = Math.max(0, input.plan.smallBuyCountPerWeek - input.weekSmallBuy.count);
  const smallBuyAmountLeft = Math.max(0, input.plan.smallBuyAmountPerWeek - input.weekSmallBuy.amount);
  const reasons: string[] = [];
  let verdict: BolehResult["verdict"] = "AMAN";

  // BUG-008 fix: Danger Mode freezes non-essential (Fun/Jajan) spending
  if (input.daily.isDanger && !input.isEssential) {
    verdict = "MELEWATI_LIMIT";
    reasons.push("Danger Mode aktif: tahan Fun dulu sampai limit pulih");
  }

  if (input.amount > input.daily.dailyLimit) {
    verdict = "MELEWATI_LIMIT";
    reasons.push("melewati limit makan hari ini");
  }

  if (input.isSmallBuy && (smallBuyCountLeft <= 0 || input.amount > smallBuyAmountLeft)) {
    if (verdict !== "MELEWATI_LIMIT") verdict = "SEBAIKNYA_JANGAN";
    reasons.push("jatah small buy minggu ini tipis");
  }

  if (input.tomorrowLimit < input.daily.survivalFloor) {
    verdict = "MELEWATI_LIMIT";
    reasons.push("besok masuk Danger Mode");
  }

  return {
    verdict,
    currentDailyLimit: input.daily.dailyLimit,
    projectedTomorrowLimit: input.tomorrowLimit,
    smallBuyCountLeft,
    smallBuyAmountLeft,
    hpDelayDaysIfBought: hpDays(input.amount, input.plan.hpBudget),
    reasons
  };
}

export function allocatePlan(config: {
  turboHp: boolean;
  allowance?: number;
  needsBudget?: number;
  groceriesTarget?: number;
  tagihanBudget?: number;
  transportBudget?: number;
  funBudget?: number;
  otherNeedsBudget?: number;
  bufferBudget?: number;
}): Omit<MonthPlanInput, "monthKey" | "mode" | "smallBuyCountPerWeek" | "smallBuyAmountPerWeek"> & { allowance: number } {
  const allowance = config.allowance ?? 2_000_000;
  return {
    allowance,
    needsBudget: config.needsBudget ?? 1_000_000,
    groceriesTarget: config.groceriesTarget ?? 300_000,
    bibitBudget: config.turboHp ? 100_000 : 300_000,
    hpBudget: config.turboHp ? 400_000 : 200_000,
    tagihanBudget: config.tagihanBudget ?? 100_000,
    transportBudget: config.transportBudget ?? 150_000,
    funBudget: config.funBudget ?? 100_000,
    otherNeedsBudget: config.otherNeedsBudget ?? 50_000,
    bufferBudget: config.bufferBudget ?? 100_000
  };
}
