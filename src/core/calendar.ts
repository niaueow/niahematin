const jakartaOffsetMinutes = 7 * 60;

export function toJakartaDate(date = new Date()): Date {
  return new Date(date.getTime() + jakartaOffsetMinutes * 60_000);
}

export function monthKey(date = new Date()): string {
  const local = toJakartaDate(date);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function dayKey(date = new Date()): string {
  const local = toJakartaDate(date);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(
    local.getUTCDate()
  ).padStart(2, "0")}`;
}

export function effectiveBusinessDate(date = new Date()): Date {
  const local = toJakartaDate(date);
  if (local.getUTCHours() < 3) {
    local.setUTCDate(local.getUTCDate() - 1);
  }
  return new Date(local.getTime() - jakartaOffsetMinutes * 60_000);
}

export function effectiveDayKey(date = new Date()): string {
  return dayKey(effectiveBusinessDate(date));
}

export function dayOfMonth(date = new Date()): number {
  return toJakartaDate(date).getUTCDate();
}

export function daysInMonth(date = new Date()): number {
  const local = toJakartaDate(date);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate();
}

export function weekKey(date = new Date()): string {
  const local = toJakartaDate(date);
  const day = local.getUTCDay() === 0 ? 7 : local.getUTCDay();
  local.setUTCDate(local.getUTCDate() - day + 1);
  return dayKey(new Date(local.getTime() - jakartaOffsetMinutes * 60_000));
}
