import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { monthKey } from "../core/calendar.js";
import type { BotMode } from "../core/types.js";

type MonthPlan = Prisma.MonthPlanGetPayload<object>;

export async function ensureUserConfig() {
  return prisma.userConfig.upsert({
    where: { id: 1 },
    update: {},
    create: {}
  });
}

export async function createOrGetCurrentPlan(date = new Date(), allowance = 2_000_000): Promise<MonthPlan> {
  const config = await ensureUserConfig();
  const key = monthKey(date);
  return prisma.monthPlan.upsert({
    where: { monthKey: key },
    update: {},
    create: {
      monthKey: key,
      allowance,
      mode: config.mode,
      needsBudget: config.needsBudget,
      groceriesTarget: config.groceriesTarget,
      bibitBudget: config.bibitBudget,
      hpBudget: config.hpBudget,
      tagihanBudget: config.tagihanBudget,
      transportBudget: config.transportBudget,
      funBudget: config.funBudget,
      otherNeedsBudget: config.otherNeedsBudget,
      bufferBudget: config.bufferBudget,
      smallBuyCountPerWeek: config.smallBuyCountPerWeek,
      smallBuyAmountPerWeek: config.smallBuyAmountPerWeek
    }
  });
}

export async function confirmAllowance(amount: number, note: string, date = new Date()): Promise<MonthPlan> {
  const config = await ensureUserConfig();
  const key = monthKey(date);
  const planData: Prisma.MonthPlanCreateInput = {
    monthKey: key,
    allowance: amount,
    mode: config.mode,
    needsBudget: config.needsBudget,
    groceriesTarget: config.groceriesTarget,
    bibitBudget: config.bibitBudget,
    hpBudget: config.hpBudget,
    tagihanBudget: config.tagihanBudget,
    transportBudget: config.transportBudget,
    funBudget: config.funBudget,
    otherNeedsBudget: config.otherNeedsBudget,
    bufferBudget: config.bufferBudget,
    smallBuyCountPerWeek: config.smallBuyCountPerWeek,
    smallBuyAmountPerWeek: config.smallBuyAmountPerWeek
  };

  const plan = await prisma.monthPlan.upsert({
    where: { monthKey: key },
    update: {
      allowance: amount,
      mode: config.mode,
      needsBudget: config.needsBudget,
      groceriesTarget: config.groceriesTarget,
      bibitBudget: config.bibitBudget,
      hpBudget: config.hpBudget,
      tagihanBudget: config.tagihanBudget,
      transportBudget: config.transportBudget,
      funBudget: config.funBudget,
      otherNeedsBudget: config.otherNeedsBudget,
      bufferBudget: config.bufferBudget,
      smallBuyCountPerWeek: config.smallBuyCountPerWeek,
      smallBuyAmountPerWeek: config.smallBuyAmountPerWeek
    },
    create: planData
  });

  // BUG-006 fix: only create income record if none exists for this month plan
  const existingIncome = await prisma.transaction.findFirst({
    where: { monthPlanId: plan.id, type: "INCOME" }
  });

  if (!existingIncome) {
    await prisma.transaction.create({
      data: {
        monthPlanId: plan.id,
        type: "INCOME",
        amount,
        note,
        occurredAt: date,
        effectiveDayKey: key
      }
    });
  }

  return plan;
}

export async function setMode(mode: BotMode): Promise<void> {
  await prisma.userConfig.upsert({
    where: { id: 1 },
    create: { mode },
    update: { mode }
  });
}
