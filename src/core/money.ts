const formatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0
});

export function rupiah(amount: number): string {
  return formatter.format(Math.round(amount)).replace(/\s/g, " ");
}

export function clampRupiah(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, Math.round(amount));
}

export function ceilRupiah(amount: number): number {
  return Math.max(0, Math.ceil(amount));
}

export function hpDays(amount: number, hpMonthlyContribution: number): number {
  if (hpMonthlyContribution <= 0) return 0;
  return Math.ceil(amount / (hpMonthlyContribution / 30));
}
