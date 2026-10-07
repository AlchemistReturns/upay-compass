import { CHANNELS, type Channel } from "@compass/shared";

/**
 * ASSUMED upay partner API shape. upay has not published a transaction API, so this is our best
 * guess at what a partner feed looks like, written down so the real one can be swapped in by
 * changing `FieldMap` / `ServiceMap` (and the endpoint paths in index.ts) instead of rewriting the
 * adapter. Everything here is verified only against fixtures in this repo.
 */
export type FieldMap = {
  /** the array of transactions inside a page response */
  items: string;
  /** cursor for the next page (null / missing when there is no more) */
  nextCursor: string;
  id: string;
  amount: string;
  /** "CREDIT" / "DEBIT" style value (see `directionIn`) */
  direction: string;
  service: string;
  counterpartyName: string;
  counterpartyPhone: string;
  reference: string;
  timestamp: string;
  status: string;
  /** current wallet balance, on the balance endpoint */
  balance: string;
};

export const DEFAULT_FIELD_MAP: FieldMap = {
  items: "data",
  nextCursor: "next_cursor",
  id: "txn_id",
  amount: "amount",
  direction: "type",
  service: "service",
  counterpartyName: "counterparty_name",
  counterpartyPhone: "counterparty_msisdn",
  reference: "reference",
  timestamp: "timestamp",
  status: "status",
  balance: "balance",
};

/** Values (upper-cased) that mean money came in; anything else with a known value is out. */
export const DIRECTION_IN = ["CREDIT", "IN", "CR", "RECEIVED"];
export const DIRECTION_OUT = ["DEBIT", "OUT", "DR", "SENT"];
/** Only completed transactions are real money movement. */
export const STATUS_OK = ["SUCCESS", "COMPLETED", "SUCCESSFUL"];

/** upay service name (upper-cased) to Compass channel. */
export type ServiceMap = Record<string, Channel>;
export const DEFAULT_SERVICE_MAP: ServiceMap = {
  SEND_MONEY: "send_money",
  RECEIVE_MONEY: "send_money",
  CASH_OUT: "cash_out",
  CASH_IN: "add_money",
  ADD_MONEY: "add_money",
  MERCHANT_PAY: "merchant",
  MERCHANT_PAYMENT: "merchant",
  PAYMENT: "merchant",
  MOBILE_RECHARGE: "recharge",
  RECHARGE: "recharge",
  BILL_PAY: "bill",
  BILL_PAYMENT: "bill",
};

export type MapOptions = { fields?: Partial<FieldMap>; services?: ServiceMap };

/** Reads a dotted path ("a.b") from an object; undefined if any step is missing. */
export function pick(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

const str = (v: unknown) =>
  typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";

/** "+8801712345678" becomes "***5678": counterparties are identified, but their number is not stored. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `***${digits.slice(-4)}` : "";
}

export type Mapped =
  | { kind: "record"; record: Record<string, unknown> }
  | { kind: "skip"; reason: "not_completed" }
  | { kind: "broken"; id: string; reason: string };

/**
 * One upay transaction to a Compass record. Failed, pending and reversed transactions are skipped
 * (no money moved). Anything that cannot be understood comes back as `broken`, never a guess.
 */
export function mapTransaction(raw: unknown, options: MapOptions = {}): Mapped {
  const f = { ...DEFAULT_FIELD_MAP, ...options.fields };
  const services = { ...DEFAULT_SERVICE_MAP, ...options.services };
  const idRaw = str(pick(raw, f.id));
  const broken = (reason: string): Mapped => ({
    kind: "broken",
    id: idRaw ? `upay-${idRaw}` : "upay-unknown",
    reason,
  });

  const status = str(pick(raw, f.status)).toUpperCase();
  if (status && !STATUS_OK.includes(status)) return { kind: "skip", reason: "not_completed" };
  if (!idRaw) return broken("missing_id");

  const amountRaw = pick(raw, f.amount);
  const amount =
    typeof amountRaw === "number" ? amountRaw : Number(str(amountRaw).replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return broken("bad_amount");

  const dir = str(pick(raw, f.direction)).toUpperCase();
  const direction = DIRECTION_IN.includes(dir) ? "in" : DIRECTION_OUT.includes(dir) ? "out" : null;
  if (!direction) return broken("bad_direction");

  const serviceKey = str(pick(raw, f.service))
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  const channel: Channel | undefined =
    services[serviceKey] ??
    ((CHANNELS as readonly string[]).includes(serviceKey.toLowerCase())
      ? (serviceKey.toLowerCase() as Channel)
      : undefined);
  if (!channel) return broken("unknown_service");

  const timestamp = str(pick(raw, f.timestamp));
  const when = new Date(timestamp);
  if (!timestamp || Number.isNaN(when.getTime())) return broken("bad_timestamp");

  const name = str(pick(raw, f.counterpartyName));
  const counterparty = name || maskPhone(str(pick(raw, f.counterpartyPhone))) || "Unknown";

  return {
    kind: "record",
    record: {
      id: `upay-${idRaw}`,
      amount,
      direction,
      channel,
      counterparty,
      note: str(pick(raw, f.reference)),
      occurred_at: when.toISOString(),
    },
  };
}
