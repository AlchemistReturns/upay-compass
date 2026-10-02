/** Helpers for storing snapshots (health scores, forecasts) only when something changed. */

/** Round every number so float noise never creates a "new" snapshot. */
export function roundDeep<T>(value: T): T {
  if (typeof value === "number") return (Math.round(value * 10_000) / 10_000) as T;
  if (Array.isArray(value)) return value.map(roundDeep) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, roundDeep(v)]),
    ) as T;
  }
  return value;
}

/** Key-order-independent text, because jsonb does not keep key order. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
