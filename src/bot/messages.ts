import type { BolehResult, DailyLimitResult, SpendingSnapshot } from "../core/types.js";
import { hpDays, rupiah } from "../core/money.js";

export function formatDailyLine(daily: DailyLimitResult): string {
  return `Limit makan hari ini ${rupiah(daily.dailyLimit)}. Sisa makan bulan ini ${rupiah(daily.makanLeft)}.`;
}

export function formatExpenseReply(input: {
  amount: number;
  note: string;
  category: string;
  daily: DailyLimitResult;
  hpBudget: number;
}): string {
  const delay = hpDays(input.amount, input.hpBudget);
  const hpLine = delay > 0 ? ` Bulan ini HP mundur sekitar ${delay} hari kalau pola ini kejadian terus.` : "";
  return `OK, ${rupiah(input.amount)} ${input.note} (${input.category}). Sisa limit hari ini ${rupiah(input.daily.dailyLimit)}.${hpLine}`;
}

export function formatBoleh(result: BolehResult, amount: number, note: string): string {
  const icon = result.verdict === "AMAN" ? "hijau" : result.verdict === "SEBAIKNYA_JANGAN" ? "kuning" : "merah";
  const reason = result.reasons.length ? `\nCatatan: ${result.reasons.join(", ")}.` : "";
  return [
    `${icon.toUpperCase()}: ${rupiah(amount)} ${note}`,
    `Limit hari ini: ${rupiah(result.currentDailyLimit)}. Besok jadi ${rupiah(result.projectedTomorrowLimit)}.`,
    `Small buy sisa ${result.smallBuyCountLeft}x dan ${rupiah(result.smallBuyAmountLeft)} minggu ini.`,
    `Dampak HP: mundur sekitar ${result.hpDelayDaysIfBought} hari.${reason}`
  ].join("\n");
}

export function formatSummary(input: {
  snapshot: SpendingSnapshot;
  daily: DailyLimitResult;
  plan: { hpBudget: number; transportBudget: number; tagihanBudget: number; funBudget: number; otherNeedsBudget: number; bufferBudget: number };
}): string {
  return [
    formatDailyLine(input.daily),
    `Needs: makan ${rupiah(input.snapshot.makanSpent)}, groceries ${rupiah(input.snapshot.groceriesSpent)}.`,
    `Fun ${rupiah(Math.max(0, input.plan.funBudget - input.snapshot.funSpent))} tersisa. Transport ${rupiah(
      Math.max(0, input.plan.transportBudget - input.snapshot.transportSpent)
    )} tersisa.`,
    `Tagihan ${rupiah(Math.max(0, input.plan.tagihanBudget - input.snapshot.tagihanSpent))} tersisa. Other ${rupiah(
      Math.max(0, input.plan.otherNeedsBudget - input.snapshot.otherNeedsSpent)
    )} tersisa.`,
    `Batal beli: ${input.snapshot.cancelledBuyCount}x = ${rupiah(input.snapshot.cancelledBuyAmount)}.`
  ].join("\n");
}
