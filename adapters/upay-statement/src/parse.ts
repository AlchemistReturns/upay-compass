import { CHANNELS, MAX_STATEMENT_BYTES, type Channel } from "@compass/shared";
import { parseCsv } from "./csv.ts";

export const MAX_STATEMENT_ROWS = 5000;
export { MAX_STATEMENT_BYTES };

const HEADER_ALIASES = {
  date: ["date", "datetime", "date time", "time", "timestamp", "occurred_at", "transaction date"],
  amount: ["amount", "amt", "value", "taka", "bdt"],
  direction: ["direction", "type", "dr/cr", "drcr", "credit/debit", "flow"],
  credit: ["credit", "cr", "money in", "received", "deposit"],
  debit: ["debit", "dr", "money out", "paid", "withdrawal"],
  counterparty: [
    "counterparty",
    "name",
    "merchant",
    "description",
    "details",
    "to/from",
    "party",
    "particulars",
  ],
  channel: ["channel", "service", "transaction type", "category"],
  note: ["note", "reference", "remarks", "memo", "narration"],
  balance: ["balance", "running balance", "closing balance"],
} as const;
type Field = keyof typeof HEADER_ALIASES;

export type StatementRecord = {
  id: string;
  amount: number;
  direction: "in" | "out";
  channel: Channel;
  counterparty: string;
  note: string;
  occurred_at: string;
};

export type StatementRow = {
  /** 1-based line in the file (the header is line 1). */
  line: number;
  record: StatementRecord | null;
  error: string | null;
  /** running balance after this row, when the file has a balance column */
  balance: number | null;
};

export type StatementParse = {
  rows: StatementRow[];
  /** Wallet balance just before the earliest row, when it can be worked out from a balance column. */
  openingBalance: number | null;
};

/** `message` is a stable code: file_too_large, no_rows, too_many_rows, missing_columns, direction_unknown. */
export class StatementError extends Error {}

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const toAscii = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
const clean = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Money like "1,250.50", "৳ 500", "Tk 500", "(500)" or "-500". Returns null if not a number. */
export function parseAmount(raw: string): number | null {
  let s = toAscii(raw).trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
  s = s
    .replace(/[()]/g, "")
    .replace(/bdt|tk\.?|৳|taka/gi, "")
    .replace(/[,\s]/g, "");
  s = s.replace(/^[-+]|-$/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return negative ? -n : n;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Dates as ISO (2026-09-30, 2026-09-30 14:05, 2026-09-30T14:05:00Z) or day-first
 * (30/09/2026 14:05, 30-09-2026). Without a time zone the time is Bangladesh time (+06:00),
 * which is what a upay statement shows. Returns an ISO instant or null.
 */
export function parseStatementDate(raw: string): string | null {
  const s = toAscii(raw).trim();
  let y: number;
  let mo: number;
  let d: number;
  let h = 0;
  let mi = 0;
  let sec = 0;
  let zone: string | null = null;
  let m = s.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/i,
  );
  if (m) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    h = Number(m[4] ?? 0);
    mi = Number(m[5] ?? 0);
    sec = Number(m[6] ?? 0);
    zone = m[7] ?? null;
  } else {
    m = s.match(
      /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i,
    );
    if (!m) return null;
    [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    h = Number(m[4] ?? 0);
    mi = Number(m[5] ?? 0);
    sec = Number(m[6] ?? 0);
    const ampm = m[7]?.toUpperCase();
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 59) return null;
  // reject 31 February style dates that would roll over
  const day = new Date(`${y}-${pad(mo)}-${pad(d)}T00:00:00Z`);
  if (Number.isNaN(day.getTime()) || day.getUTCMonth() + 1 !== mo || day.getUTCDate() !== d) {
    return null;
  }
  const offset = !zone
    ? "+06:00"
    : zone.toUpperCase() === "Z"
      ? "Z"
      : zone.replace(/^([+-]\d{2})(\d{2})$/, "$1:$2");
  const t = new Date(`${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(sec)}${offset}`);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

const DIRECTION_WORDS: Record<string, "in" | "out"> = {
  in: "in",
  credit: "in",
  cr: "in",
  received: "in",
  receive: "in",
  deposit: "in",
  income: "in",
  "cash in": "in",
  "add money": "in",
  out: "out",
  debit: "out",
  dr: "out",
  sent: "out",
  send: "out",
  paid: "out",
  payment: "out",
  withdrawal: "out",
  expense: "out",
  "cash out": "out",
};

function inferChannel(text: string, direction: "in" | "out"): Channel {
  const t = clean(text);
  if (/cash\s*-?out|cashout|withdraw/.test(t)) return "cash_out";
  if (/recharge|top\s*-?up|topup|mobile data|data pack/.test(t)) return "recharge";
  if (/\bbill\b|electricity|desco|dpdc|titas|wasa/.test(t)) return "bill";
  if (/add\s*money|cash\s*-?in|bank to/.test(t)) return "add_money";
  if (/merchant|payment|shop|store|restaurant/.test(t)) return "merchant";
  return direction === "in" ? "send_money" : "merchant";
}

function toChannel(raw: string, fallbackText: string, direction: "in" | "out"): Channel {
  const t = clean(raw).replace(/[\s-]+/g, "_");
  if ((CHANNELS as readonly string[]).includes(t)) return t as Channel;
  return inferChannel(`${raw} ${fallbackText}`, direction);
}

/** Short stable hash (FNV-1a style, two seeds) so ids do not depend on the runtime. */
function hash(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0xdeadbeef;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x85ebca6b) >>> 0;
  }
  return a.toString(36) + b.toString(36);
}

function findColumns(header: string[]): Partial<Record<Field, number>> {
  const cols: Partial<Record<Field, number>> = {};
  header.forEach((h, i) => {
    const name = clean(h);
    for (const field of Object.keys(HEADER_ALIASES) as Field[]) {
      if (
        cols[field] === undefined &&
        (HEADER_ALIASES[field] as readonly string[]).includes(name)
      ) {
        cols[field] = i;
      }
    }
  });
  return cols;
}

/**
 * Reads a upay statement exported as CSV. Needs a header row with a date, an amount (one signed
 * column plus a type column or negative numbers, or separate credit and debit columns) and a name
 * or description. Channel, note and balance are optional. Rows that cannot be read come back with
 * an `error` and no record, so the caller can count and report them instead of losing the file.
 */
export function parseStatement(csv: string): StatementParse {
  if (csv.length > MAX_STATEMENT_BYTES) throw new StatementError("file_too_large");
  const table = parseCsv(csv);
  if (table.length < 2) throw new StatementError("no_rows");
  if (table.length - 1 > MAX_STATEMENT_ROWS) throw new StatementError("too_many_rows");

  const header = table[0]!;
  const col = findColumns(header);
  const splitColumns = col.credit !== undefined && col.debit !== undefined;
  if (
    col.date === undefined ||
    (col.amount === undefined && !splitColumns) ||
    col.counterparty === undefined
  ) {
    throw new StatementError("missing_columns");
  }
  const get = (row: string[], field: Field) =>
    col[field] === undefined ? "" : (row[col[field]!] ?? "").trim();

  // One amount column, no type column: direction can only come from the sign. If nothing is
  // negative the file is ambiguous, and guessing would turn every payment into income.
  const signedOnly = col.amount !== undefined && col.direction === undefined && !splitColumns;
  if (signedOnly) {
    const anyNegative = table.slice(1).some((r) => (parseAmount(get(r, "amount")) ?? 0) < 0);
    if (!anyNegative) throw new StatementError("direction_unknown");
  }

  const seen = new Map<string, number>();
  const rows: StatementRow[] = table.slice(1).map((row, i) => {
    const line = i + 2;
    const fail = (error: string): StatementRow => ({ line, record: null, error, balance: null });

    const occurred_at = parseStatementDate(get(row, "date"));
    if (!occurred_at) return fail("bad_date");

    let amount: number;
    let direction: "in" | "out";
    if (col.amount !== undefined && !(splitColumns && !get(row, "amount"))) {
      const parsed = parseAmount(get(row, "amount"));
      if (parsed === null) return fail("bad_amount");
      const word = clean(get(row, "direction"));
      if (col.direction !== undefined && word) {
        const mapped = DIRECTION_WORDS[word];
        if (!mapped) return fail("bad_direction");
        direction = mapped;
      } else if (col.direction !== undefined) {
        return fail("bad_direction");
      } else direction = parsed < 0 ? "out" : "in";
      amount = Math.abs(parsed);
    } else {
      const credit = parseAmount(get(row, "credit")) ?? 0;
      const debit = parseAmount(get(row, "debit")) ?? 0;
      if (credit > 0 === debit > 0) return fail("bad_amount");
      direction = credit > 0 ? "in" : "out";
      amount = credit > 0 ? credit : debit;
    }
    if (!(amount > 0)) return fail("bad_amount");

    const counterparty = get(row, "counterparty");
    if (!counterparty) return fail("bad_counterparty");
    const note = get(row, "note");
    const channel = toChannel(get(row, "channel"), `${counterparty} ${note}`, direction);

    // The same fields twice (two identical tea payments in one minute) get -2, -3 ... so both
    // import, and importing the file again gives the same ids.
    const base = hash(`${occurred_at}|${amount}|${direction}|${counterparty.toLowerCase()}`);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const id = `csv-${base}${n > 1 ? `-${n}` : ""}`;

    const balanceRaw = get(row, "balance");
    const balance = balanceRaw ? parseAmount(balanceRaw) : null;
    return {
      line,
      record: { id, amount, direction, channel, counterparty, note, occurred_at },
      error: null,
      balance,
    };
  });

  // Opening balance: the balance after the earliest row, with that row undone.
  let openingBalance: number | null = null;
  const withBalance = rows.filter((r) => r.record && r.balance !== null);
  if (withBalance.length > 0) {
    const first = withBalance.reduce((a, b) =>
      a.record!.occurred_at <= b.record!.occurred_at ? a : b,
    );
    const t = first.record!;
    openingBalance = first.balance! - (t.direction === "in" ? t.amount : -t.amount);
  }
  return { rows, openingBalance };
}
