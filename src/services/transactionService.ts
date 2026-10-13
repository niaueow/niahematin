import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { dayOfMonth, daysInMonth, effectiveDayKey, weekKey } from "../core/calendar.js";
import { calculateDailyLimit, evaluateBoleh, projectedTomorrowLimit } from "../core/budget.js";
import type { DailyLimitResult, SpendingSnapshot } from "../core/types.js";
import type { Category, Pot } from "../core/types.js";
import { createOrGetCurrentPlan } from "./planService.js";

type MonthPlan = Prisma.MonthPlanGetPayload<object>;
type Transaction = Prisma.TransactionGetPayload<object>;

export function categoryToPot(category: Category): Pot {
  switch (category) {
    case "MAKAN":
    case "GROCERIES":
    case "JAJAN":
    case "UNTRACKED":
      return "NEEDS";
    case "TRANSPORT":
      return "TRANSPORT";
    case "TAGIHAN":
      return "TAGIHAN";
    case "FUN":
    case "RANDOM":
      return "FUN";
    case "LAIN_LAIN":
      return "OTHER_NEEDS";
  }
}

export function isSmallBuy(category: Category, amount: number): boolean {
  return (category === "JAJAN" || category === "RANDOM") && amount <= 50_000;
}

export async function addExpense(input: {
  amount: number;
  note: string;
  category: Category;
  telegramUpdateId?: string;
  date?: Date;
}): Promise<Transaction> {
  const date = input.date ?? new Date();

  // BUG-001 fix: idempotency — return existing row if update_id already logged
  if (input.telegramUpdateId) {
    const existing = await prisma.transaction.findFirst({
      where: { telegramUpdateId: input.telegramUpdateId }
    });
    if (existing) return existing;
  }

  const plan = await createOrGetCurrentPlan(date);
  return prisma.transaction.create({
    data: {
      monthPlanId: plan.id,
      telegramUpdateId: input.telegramUpdateId,
      type: "EXPENSE",
      category: input.category,
      pot: categoryToPot(input.category),
      amount: input.amount,
      note: input.note,
      occurredAt: date,
      effectiveDayKey: effectiveDayKey(date),
      isSmallBuy: isSmallBuy(input.category, input.amount),
      isOverspendNeeds: input.category === "MAKAN" || input.category === "GROCERIES" || input.category === "JAJAN"
    }
  });
}

export async function addCancelledBuy(input: { amount: number; note: string; date?: Date }): Promise<Transaction> {
  const date = input.date ?? new Date();
  const plan = await createOrGetCurrentPlan(date);
  return prisma.transaction.create({
    data: {
      monthPlanId: plan.id,
      type: "CANCELLED_BUY",
      amount: input.amount,
      note: input.note,
      occurredAt: date,
      effectiveDayKey: effectiveDayKey(date)
    }
  });
}

export async function undoLastTransaction(): Promise<Transaction | null> {
  const last = await prisma.transaction.findFirst({
    where: { type: { not: "INCOME" } },
    orderBy: { createdAt: "desc" }
  });
  if (!last) return null;
  await prisma.transaction.delete({ where: { id: last.id } });
  return last;
}

export async function getSnapshot(plan: MonthPlan): Promise<SpendingSnapshot> {
  const txs = await prisma.transaction.findMany({
    where: { monthPlanId: plan.id }
  });

  const snapshot: SpendingSnapshot = {
    makanSpent: 0,
    groceriesSpent: 0,
    jajanSpent: 0,
    randomSpent: 0,
    transportSpent: 0,
    funSpent: 0,
    tagihanSpent: 0,
    otherNeedsSpent: 0,
    bufferSpent: 0,
    cancelledBuyAmount: 0,
    cancelledBuyCount: 0
  };

  for (const tx of txs) {
    if (tx.type === "CANCELLED_BUY") {
      snapshot.cancelledBuyAmount += tx.amount;
      snapshot.cancelledBuyCount += 1;
      continue;
    }
    if (tx.type !== "EXPENSE") continue;
    switch (tx.category as Category | null) {
      case "MAKAN":
        snapshot.makanSpent += tx.amount;
        break;
      case "GROCERIES":
        snapshot.groceriesSpent += tx.amount;
        break;
      case "JAJAN":
        snapshot.jajanSpent += tx.amount;
        snapshot.makanSpent += tx.amount;
        break;
      case "RANDOM":
        snapshot.randomSpent += tx.amount;
        snapshot.funSpent += tx.amount;
        break;
      case "TRANSPORT":
        snapshot.transportSpent += tx.amount;
        break;
      case "FUN":
        snapshot.funSpent += tx.amount;
        break;
      case "TAGIHAN":
        snapshot.tagihanSpent += tx.amount;
        break;
      case "LAIN_LAIN":
      case "UNTRACKED":
        snapshot.otherNeedsSpent += tx.amount;
        break;
      case null:
        break;
    }
  }

  return snapshot;
}

export async function currentDailyStatus(date = new Date()) {
  const plan = await createOrGetCurrentPlan(date);
  const snapshot = await getSnapshot(plan);

  const todayKey = effectiveDayKey(date);
  const todayTxs = await prisma.transaction.findMany({
    where: {
      monthPlanId: plan.id,
      effectiveDayKey: todayKey,
      type: "EXPENSE"
    }
  });

  const todayMakanSpent = todayTxs
    .filter((t) => t.category === "MAKAN" || t.category === "JAJAN")
    .reduce((s, t) => s + t.amount, 0);

  const todayGroceriesSpent = todayTxs
    .filter((t) => t.category === "GROCERIES")
    .reduce((s, t) => s + t.amount, 0);

  const snapshotBeforeToday = {
    makanSpent: Math.max(0, snapshot.makanSpent - todayMakanSpent),
    groceriesSpent: Math.max(0, snapshot.groceriesSpent - todayGroceriesSpent)
  };

  const dailyStart = calculateDailyLimit({
    plan,
    snapshot: snapshotBeforeToday,
    dayOfMonth: dayOfMonth(date),
    daysInMonth: daysInMonth(date)
  });

  const currentDaily = calculateDailyLimit({
    plan,
    snapshot,
    dayOfMonth: dayOfMonth(date),
    daysInMonth: daysInMonth(date)
  });

  const todayLimitLeft = dailyStart.dailyLimit - todayMakanSpent;

  const daily: DailyLimitResult = {
    ...currentDaily,
    dailyLimit: dailyStart.dailyLimit,
    todayMakanSpent,
    todayLimitLeft
  };

  return { plan, snapshot, daily };
}

export async function evaluatePurchase(input: { amount: number; category: Category; date?: Date }) {
  const date = input.date ?? new Date();
  const { plan, snapshot, daily } = await currentDailyStatus(date);
  const monday = weekKey(date);
  const weekly = await prisma.transaction.aggregate({
    where: {
      monthPlanId: plan.id,
      isSmallBuy: true,
      effectiveDayKey: { gte: monday }
    },
    _count: { id: true },
    _sum: { amount: true }
  });

  const tomorrow = projectedTomorrowLimit({
    plan,
    snapshot,
    dayOfMonth: dayOfMonth(date),
    daysInMonth: daysInMonth(date),
    newMakanSpend: input.category === "MAKAN" || input.category === "JAJAN" ? input.amount : 0
  });

  // BUG-008 fix: pass isEssential so Danger Mode enforces red for non-essentials
  const isEssential = input.category === "MAKAN" || input.category === "GROCERIES";

  return evaluateBoleh({
    amount: input.amount,
    isSmallBuy: isSmallBuy(input.category, input.amount),
    isEssential,
    daily,
    tomorrowLimit: tomorrow,
    weekSmallBuy: {
      count: weekly._count.id,
      amount: weekly._sum.amount ?? 0
    },
    plan
  });
}
