import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export async function bootstrapDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserConfig" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
      "telegramUserId" TEXT UNIQUE,
      "mode" TEXT NOT NULL DEFAULT 'CALIBRATION',
      "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
      "quietStart" TEXT NOT NULL DEFAULT '22:00',
      "quietEnd" TEXT NOT NULL DEFAULT '06:30',
      "turboHp" BOOLEAN NOT NULL DEFAULT true,
      "needsBudget" INTEGER NOT NULL DEFAULT 1000000,
      "groceriesTarget" INTEGER NOT NULL DEFAULT 300000,
      "bibitBudget" INTEGER NOT NULL DEFAULT 100000,
      "hpBudget" INTEGER NOT NULL DEFAULT 400000,
      "tagihanBudget" INTEGER NOT NULL DEFAULT 100000,
      "transportBudget" INTEGER NOT NULL DEFAULT 150000,
      "funBudget" INTEGER NOT NULL DEFAULT 100000,
      "otherNeedsBudget" INTEGER NOT NULL DEFAULT 50000,
      "bufferBudget" INTEGER NOT NULL DEFAULT 100000,
      "smallBuyCountPerWeek" INTEGER NOT NULL DEFAULT 3,
      "smallBuyAmountPerWeek" INTEGER NOT NULL DEFAULT 60000,
      "hpGoalTier1" INTEGER NOT NULL DEFAULT 3000000,
      "hpSaved" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "MonthPlan" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "monthKey" TEXT NOT NULL UNIQUE,
      "allowance" INTEGER NOT NULL,
      "mode" TEXT NOT NULL,
      "needsBudget" INTEGER NOT NULL,
      "groceriesTarget" INTEGER NOT NULL,
      "bibitBudget" INTEGER NOT NULL,
      "hpBudget" INTEGER NOT NULL,
      "tagihanBudget" INTEGER NOT NULL,
      "transportBudget" INTEGER NOT NULL,
      "funBudget" INTEGER NOT NULL,
      "otherNeedsBudget" INTEGER NOT NULL,
      "bufferBudget" INTEGER NOT NULL,
      "smallBuyCountPerWeek" INTEGER NOT NULL DEFAULT 3,
      "smallBuyAmountPerWeek" INTEGER NOT NULL DEFAULT 60000,
      "transferredSavings" BOOLEAN NOT NULL DEFAULT false,
      "priorMonthSweepDone" BOOLEAN NOT NULL DEFAULT false,
      "proactiveWarningsSentOn" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Transaction" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "monthPlanId" INTEGER NOT NULL,
      "telegramUpdateId" TEXT,
      "type" TEXT NOT NULL,
      "category" TEXT,
      "pot" TEXT,
      "amount" INTEGER NOT NULL,
      "note" TEXT NOT NULL,
      "occurredAt" DATETIME NOT NULL,
      "effectiveDayKey" TEXT NOT NULL,
      "isSmallBuy" BOOLEAN NOT NULL DEFAULT false,
      "isOverspendNeeds" BOOLEAN NOT NULL DEFAULT false,
      "metadataJson" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Transaction_monthPlanId_fkey" FOREIGN KEY ("monthPlanId") REFERENCES "MonthPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PendingAsk" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "kind" TEXT NOT NULL,
      "payloadJson" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'OPEN',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ScheduledJobRun" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "jobKey" TEXT NOT NULL,
      "dayKey" TEXT NOT NULL,
      "ranAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RecurringBill" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "name" TEXT NOT NULL,
      "amount" INTEGER NOT NULL,
      "dayOfMonth" INTEGER NOT NULL,
      "active" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Transaction_monthPlanId_occurredAt_idx" ON "Transaction"("monthPlanId", "occurredAt");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Transaction_telegramUpdateId_idx" ON "Transaction"("telegramUpdateId");`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ScheduledJobRun_jobKey_dayKey_key" ON "ScheduledJobRun"("jobKey", "dayKey");`);
}

export async function closeDb(): Promise<void> {
  await prisma.$disconnect();
}
