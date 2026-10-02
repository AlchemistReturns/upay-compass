const locale = (lang: string) => (lang === "bn" ? "bn-BD" : "en-US");

export function formatMoney(amount: number, lang: string): string {
  return `৳${Math.round(amount).toLocaleString(locale(lang))}`;
}

export function formatSignedMoney(amount: number, lang: string): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  return `${sign}${formatMoney(Math.abs(amount), lang)}`;
}

/** 1200 -> "1.2k" for chart axes. */
export function formatCompact(amount: number, lang: string): string {
  return new Intl.NumberFormat(locale(lang), {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

/** "2026-09-28" or an ISO timestamp -> "28 Sep" in Bangladesh time. */
export function formatShortDate(value: string, lang: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat(locale(lang), {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Dhaka",
  }).format(date);
}

/** ISO timestamp -> value for <input type="datetime-local"> in Bangladesh time. */
export function toDhakaInputValue(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + 6 * 3_600_000);
  return shifted.toISOString().slice(0, 16);
}

/** <input type="datetime-local"> value (Bangladesh wall time) -> ISO timestamp. */
export function fromDhakaInputValue(value: string): string {
  return new Date(`${value}:00+06:00`).toISOString();
}

/** "2026-11-16" -> "Nov 2026" */
export function formatMonthYear(value: string, lang: string): string {
  return new Intl.DateTimeFormat(locale(lang), {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}
