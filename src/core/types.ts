export const categories = [
  "MAKAN",
  "GROCERIES",
  "JAJAN",
  "RANDOM",
  "TRANSPORT",
  "FUN",
  "TAGIHAN",
  "LAIN_LAIN",
  "UNTRACKED"
] as const;

export type Category = (typeof categories)[number];

export type Pot =
  | "NEEDS"
  | "BIBIT"
  | "HP"
  | "TAGIHAN"
  | "TRANSPORT"
  | "FUN"
  | "OTHER_NEEDS"
  | "BUFFER";

export type BotMode = "CALIBRATION" | "ACTIVE";

export type MonthPlanInput = {
  monthKey: string;
  mode: BotMode;
  needsBudget: number;
  groceriesTarget: number;
  bibitBudget: number;
  hpBudget: number;
  tagihanBudget: number;
  transportBudget: number;
  funBudget: number;
  otherNeedsBudget: number;
  bufferBudget: number;
  smallBuyCountPerWeek: number;
  smallBuyAmountPerWeek: number;
};

export type SpendingSnapshot = {
  makanSpent: number;
  groceriesSpent: number;
  jajanSpent: number;
  randomSpent: number;
  transportSpent: number;
  funSpent: number;
  tagihanSpent: number;
  otherNeedsSpent: number;
  bufferSpent: number;
  cancelledBuyAmount: number;
  cancelledBuyCount: number;
};

export type DailyLimitInput = {
  plan: Pick<MonthPlanInput, "needsBudget" | "groceriesTarget">;
  snapshot: Pick<SpendingSnapshot, "makanSpent" | "groceriesSpent">;
  dayOfMonth: number;
  daysInMonth: number;
};

export type DailyLimitResult = {
  needsLeft: number;
  groceriesReserve: number;
  makanLeft: number;
  baseDailyLimit: number;
  uncappedDailyLimit: number;
  dailyLimit: number;
  survivalFloor: number;
  isDanger: boolean;
  daysRemaining: number;
};

export type WeekSmallBuySnapshot = {
  count: number;
  amount: number;
};

export type BolehVerdict = "AMAN" | "SEBAIKNYA_JANGAN" | "MELEWATI_LIMIT";

export type BolehResult = {
  verdict: BolehVerdict;
  currentDailyLimit: number;
  projectedTomorrowLimit: number;
  smallBuyCountLeft: number;
  smallBuyAmountLeft: number;
  hpDelayDaysIfBought: number;
  reasons: string[];
};
