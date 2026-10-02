import type { Channel } from "@compass/shared";
import type { CalendarDay } from "./dates.ts";
import type { Rng } from "./prng.ts";

export type Persona = "student" | "gig" | "salaried";
export const PERSONAS: readonly Persona[] = ["student", "gig", "salaried"];

/** One transaction before it gets an id and a timestamp. `hour` pins the time of day. */
export type Draft = {
  direction: "in" | "out";
  channel: Channel;
  counterparty: string;
  note?: string;
  amount: number;
  hour?: number;
};

type DayFn = (day: CalendarDay, rng: Rng) => Draft[];

export type PersonaConfig = {
  /** Starting wallet balance (৳) before the first generated day. */
  openingBalance: number;
  day: DayFn;
};

const out = (
  channel: Channel,
  counterparty: string,
  amount: number,
  note = "",
  hour?: number,
): Draft => ({ direction: "out", channel, counterparty, amount, note, hour });

const inn = (
  channel: Channel,
  counterparty: string,
  amount: number,
  note = "",
  hour?: number,
): Draft => ({ direction: "in", channel, counterparty, amount, note, hour });

/** Merchants no keyword knows, so the AI fallback and "needs review" flow get exercised. */
function unknownMerchant(rng: Rng, p: number, min: number, max: number): Draft[] {
  if (!rng.chance(p)) return [];
  return [
    out("merchant", rng.pick(["Rahim Store", "Nila Traders", "Sky Lounge"]), rng.amount(min, max)),
  ];
}

const isWorkday = (weekday: number) => weekday >= 0 && weekday <= 4; // Sun-Thu in Bangladesh

const student: DayFn = (day, rng) => {
  const d: Draft[] = [];
  const { dayOfMonth, weekday, epochDay } = day;

  if (dayOfMonth === 5) d.push(inn("send_money", "Abbu", 8000, "monthly allowance", 10));
  if (dayOfMonth === 25)
    d.push(inn("add_money", "Tuition Income", 3000, "private tuition payment", 18));

  if (rng.chance(0.85)) d.push(out("merchant", "Campus Canteen", rng.amount(60, 150)));
  if (rng.chance(0.5)) d.push(out("merchant", "Tea Stall", rng.amount(20, 40)));
  if (rng.chance(0.12)) d.push(out("merchant", "Foodpanda", rng.amount(250, 450)));

  if (isWorkday(weekday) && rng.chance(0.85)) {
    d.push(out("merchant", "Rickshaw", rng.amount(30, 60)));
    if (rng.chance(0.2)) d.push(out("merchant", "Pathao", rng.amount(80, 200), "ride"));
  }

  if (epochDay % 9 === 0) d.push(out("recharge", "Grameenphone", rng.pick([50, 100, 150])));
  if (dayOfMonth === 12) d.push(out("merchant", "Robi", 299, "data pack"));
  if (dayOfMonth === 14) d.push(out("merchant", "Spotify", 149));
  if (dayOfMonth === 2) d.push(out("merchant", "Coaching Center", 1500, "monthly fee"));
  if (dayOfMonth === 20 && rng.chance(0.6))
    d.push(out("merchant", "Rokomari", rng.amount(350, 800), "books"));
  if (dayOfMonth === 15) d.push(out("cash_out", "AB Bank ATM", 1000));
  if ((weekday === 5 || weekday === 6) && rng.chance(0.06)) {
    d.push(out("merchant", "Star Cineplex", 450));
  }
  d.push(...unknownMerchant(rng, 0.05, 100, 300));
  return d;
};

const gig: DayFn = (day, rng) => {
  const d: Draft[] = [];
  const { dayOfMonth, weekday, epochDay } = day;

  // Weekly settlements arrive in uneven chunks; some weeks are thin.
  if (weekday === 4) {
    const thin = rng.chance(0.25);
    d.push(
      inn(
        "add_money",
        "Pathao Rides Payout",
        thin ? rng.amount(1500, 3000, 50) : rng.amount(4500, 8500, 50),
        "weekly payout",
        17,
      ),
    );
  }
  if (weekday === 2 && rng.chance(0.5)) {
    d.push(
      inn("add_money", "Foodpanda Rider Payout", rng.amount(1500, 3500, 50), "delivery payout", 16),
    );
  }
  if (rng.chance(0.1)) {
    d.push(inn("send_money", "Customer Cash Job", rng.amount(500, 1500, 50), "cash job", 15));
  }

  if (rng.chance(0.6)) d.push(out("merchant", "Filling Station", rng.amount(300, 700), "petrol"));
  if (rng.chance(0.9))
    d.push(
      out(
        "merchant",
        rng.pick(["Biryani House", "Tea Stall", "Tong Restaurant"]),
        rng.amount(80, 220),
      ),
    );
  if (rng.chance(0.4)) d.push(out("merchant", "Tea Stall", rng.amount(20, 50)));
  if (epochDay % 7 === 0) d.push(out("recharge", "Robi", rng.pick([100, 150, 200])));

  if (dayOfMonth === 5) d.push(out("send_money", "Karim Mia", 6500, "house rent", 11));
  if (dayOfMonth === 10) d.push(out("send_money", "Ammu", 4000, "", 12));
  if (dayOfMonth === 12) d.push(out("bill", "DESCO", rng.amount(650, 900), "electricity"));
  if (dayOfMonth === 18) d.push(out("bill", "Titas Gas", 400));
  // A fixed commitment that irregular income has to cover: the forecast sees it coming.
  if (dayOfMonth === 20) d.push(out("bill", "Bike Installment", 6500, "emi", 12));
  if (rng.chance(0.03)) d.push(out("merchant", "Lazz Pharma", rng.amount(200, 600), "medicine"));
  d.push(...unknownMerchant(rng, 0.04, 150, 500));
  return d;
};

const salaried: DayFn = (day, rng) => {
  const d: Draft[] = [];
  const { dayOfMonth, weekday } = day;

  if (dayOfMonth === 1) d.push(inn("add_money", "Employer Ltd", 42000, "salary", 10));
  if (dayOfMonth === 3) d.push(out("send_money", "Landlord Hasan", 9000, "house rent", 11));
  if (dayOfMonth === 5) d.push(out("merchant", "DPS Savings", 3000, "", 12));
  if (dayOfMonth === 7) d.push(out("send_money", "Ammu", 4000, "", 12));
  if (dayOfMonth === 8) d.push(out("bill", "Link3", 1000, "wifi"));
  if (dayOfMonth === 10) d.push(out("bill", "DESCO", rng.amount(1100, 1600), "electricity"));
  if (dayOfMonth === 11) d.push(out("recharge", "Grameenphone", 500));
  if (dayOfMonth === 14) d.push(out("bill", "Titas Gas", 800));
  if (dayOfMonth === 18) d.push(out("merchant", "Netflix", 800));

  if (weekday === 5) d.push(out("merchant", "Shwapno", rng.amount(1200, 2000), "groceries", 18));
  if (weekday === 3 && rng.chance(0.15)) d.push(out("merchant", "Chaldal", rng.amount(800, 1500)));

  if (isWorkday(weekday) && rng.chance(0.85)) {
    d.push(
      rng.chance(0.6)
        ? out("merchant", "Uber", rng.amount(150, 400))
        : out("merchant", "Metro Rail", rng.amount(40, 100)),
    );
  }
  if (isWorkday(weekday) && rng.chance(0.4))
    d.push(out("merchant", "Office Canteen", rng.amount(120, 250), "lunch", 13));
  if ((weekday === 5 || weekday === 6) && rng.chance(0.35)) {
    d.push(out("merchant", "Foodpanda", rng.amount(450, 1200)));
  }
  if ((weekday === 5 || weekday === 6) && rng.chance(0.2)) {
    d.push(out("merchant", "Restaurant", rng.amount(800, 1800)));
  }
  if (rng.chance(0.03)) d.push(out("merchant", "Daraz", rng.amount(800, 5000)));
  if (rng.chance(0.015)) d.push(out("merchant", "Square Hospital", rng.amount(500, 2500)));
  d.push(...unknownMerchant(rng, 0.05, 200, 1500));
  return d;
};

export const PERSONA_CONFIGS: Record<Persona, PersonaConfig> = {
  student: { openingBalance: 1500, day: student },
  gig: { openingBalance: 9000, day: gig },
  salaried: { openingBalance: 31400, day: salaried },
};
