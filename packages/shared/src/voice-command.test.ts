import { describe, expect, it } from "vitest";
import { addDays, weekdayOf } from "./dates";
import {
  RAW_COMMAND_JSON_SCHEMA,
  matchGoals,
  rawCommandSchema,
  resolveVoiceDate,
  validateCommand,
  type RawCommand,
  type VoiceContext,
} from "./voice-command";

const TODAY = "2026-10-03";
const GOALS = [
  { id: "g1", title: "Phone fund" },
  { id: "g2", title: "Laptop" },
  { id: "g3", title: "New phone case" },
];

const raw = (over: Partial<RawCommand>): RawCommand => ({
  intent: "unclear",
  amount: null,
  direction: null,
  merchant: null,
  category: null,
  date: null,
  note: null,
  goal: null,
  title: null,
  which: null,
  reason: null,
  ...over,
});
const ctx = (transcript: string, goals = GOALS): VoiceContext => ({
  transcript,
  today: TODAY,
  goals,
});
const ok = (r: ReturnType<typeof validateCommand>) => {
  expect(r.ok).toBe(true);
  return (r as { ok: true; command: never }).command as Record<string, unknown>;
};

describe("resolveVoiceDate", () => {
  it("resolves the fixed tokens in Bangladesh calendar days", () => {
    expect(resolveVoiceDate("today", TODAY)).toBe("2026-10-03");
    expect(resolveVoiceDate("yesterday", TODAY)).toBe("2026-10-02");
    expect(resolveVoiceDate("day_before_yesterday", TODAY)).toBe("2026-10-01");
    expect(resolveVoiceDate("3_days_ago", TODAY)).toBe("2026-09-30");
    expect(resolveVoiceDate("2026-09-15", TODAY)).toBe("2026-09-15");
  });

  it("last_<weekday> is the most recent one BEFORE today (today's own weekday means a week ago)", () => {
    const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    for (const [w, name] of names.entries()) {
      const day = resolveVoiceDate(`last_${name}`, TODAY)!;
      expect(weekdayOf(day)).toBe(w);
      expect(day < TODAY).toBe(true);
      expect(day >= addDays(TODAY, -7)).toBe(true);
    }
    expect(resolveVoiceDate(`last_${names[weekdayOf(TODAY)]}`, TODAY)).toBe(addDays(TODAY, -7));
  });

  it("refuses the future for payments, old dates, impossible dates and unknown words", () => {
    expect(resolveVoiceDate("2026-10-04", TODAY)).toBeNull();
    expect(resolveVoiceDate("2025-09-01", TODAY)).toBeNull(); // more than a year back
    expect(resolveVoiceDate("2026-02-30", TODAY)).toBeNull();
    expect(resolveVoiceDate("61_days_ago", TODAY)).toBeNull();
    expect(resolveVoiceDate("next friday", TODAY)).toBeNull();
    expect(resolveVoiceDate(null, TODAY)).toBeNull();
  });

  it("a goal's target date must be in the future", () => {
    expect(resolveVoiceDate("2027-03-31", TODAY, "future")).toBe("2027-03-31");
    expect(resolveVoiceDate("2026-10-03", TODAY, "future")).toBeNull();
    expect(resolveVoiceDate("yesterday", TODAY, "future")).toBeNull();
  });
});

describe("add_transaction", () => {
  it("accepts an amount the person said, with a model-chosen category", () => {
    const c = ok(
      validateCommand(
        raw({
          intent: "add_transaction",
          amount: 500,
          direction: "out",
          merchant: "Rahim Stall",
          category: "food",
          date: "today",
        }),
        ctx("Add ৳ 500 for tea at Rahim's stall today."),
      ),
    );
    expect(c).toEqual({
      intent: "add_transaction",
      amount: 500,
      direction: "out",
      merchant: "Rahim Stall",
      category: "food",
      date: TODAY,
      note: "",
    });
  });

  it("reads Bangla digits, Bangla words and 5k as spoken amounts", () => {
    expect(
      ok(
        validateCommand(
          raw({ intent: "add_transaction", amount: 50, merchant: "চা" }),
          ctx("Tea stall এ ৫০ টাকা দিয়েছি"),
        ),
      ).amount,
    ).toBe(50);
    expect(
      ok(
        validateCommand(
          raw({ intent: "add_transaction", amount: 500 }),
          ctx("আজ চায়ে পাঁচশো টাকা খরচ"),
        ),
      ).amount,
    ).toBe(500);
    expect(
      ok(
        validateCommand(
          raw({ intent: "add_transaction", amount: 5000 }),
          ctx("spent 5k on groceries"),
        ),
      ).amount,
    ).toBe(5000);
    expect(
      ok(
        validateCommand(
          raw({ intent: "add_transaction", amount: 1500 }),
          ctx("দেড় হাজার টাকা বাজার"),
        ),
      ).amount,
    ).toBe(1500);
  });

  it("REJECTS an amount the person did not say (the model got it wrong)", () => {
    expect(
      validateCommand(
        raw({ intent: "add_transaction", amount: 5000 }),
        ctx("add 500 taka for tea"),
      ),
    ).toEqual({ ok: false, reason: "amount_mismatch" });
    expect(
      validateCommand(raw({ intent: "add_transaction", amount: 50 }), ctx("add 500 taka for tea")),
    ).toEqual({ ok: false, reason: "amount_mismatch" });
  });

  it("rejects when no amount can be read from what was said, or none was given", () => {
    expect(
      validateCommand(
        raw({ intent: "add_transaction", amount: 500 }),
        ctx("add some money for tea"),
      ),
    ).toEqual({ ok: false, reason: "amount_unverified" });
    expect(
      validateCommand(raw({ intent: "add_transaction", amount: null }), ctx("add 500 for tea")),
    ).toEqual({ ok: false, reason: "amount_missing" });
    expect(
      validateCommand(raw({ intent: "add_transaction", amount: -5 }), ctx("add 5 for tea")),
    ).toEqual({ ok: false, reason: "amount_missing" });
  });

  it("rejects an absurd amount even if it was said", () => {
    expect(
      validateCommand(
        raw({ intent: "add_transaction", amount: 50_000_000 }),
        ctx("add 50000000 taka"),
      ),
    ).toEqual({ ok: false, reason: "amount_unreasonable" });
  });

  it("income is always the income category; out defaults to the app's own rules when no category came back", () => {
    expect(
      ok(
        validateCommand(
          raw({
            intent: "add_transaction",
            amount: 20000,
            direction: "in",
            merchant: "Pathao Rides Payout",
            category: "food",
          }),
          ctx("got 20000 from Pathao"),
        ),
      ).category,
    ).toBe("income");
    expect(
      ok(
        validateCommand(
          raw({ intent: "add_transaction", amount: 300, direction: "out", merchant: "Uber" }),
          ctx("paid 300 to Uber"),
        ),
      ).category,
    ).toBe("transport");
    expect(
      ok(
        validateCommand(
          raw({ intent: "add_transaction", amount: 300, direction: "out", merchant: "Zzyzx" }),
          ctx("paid 300 to Zzyzx"),
        ),
      ).category,
    ).toBe("other");
  });

  it("rejects a category outside the allowed list by falling back to the rules, never inventing one", () => {
    expect(
      ok(
        validateCommand(
          raw({ intent: "add_transaction", amount: 300, merchant: "Uber", category: "crypto" }),
          ctx("paid 300 to Uber"),
        ),
      ).category,
    ).toBe("transport");
  });

  it("rejects a future or impossible date", () => {
    expect(
      validateCommand(
        raw({ intent: "add_transaction", amount: 500, date: "2026-12-25" }),
        ctx("add 500"),
      ),
    ).toEqual({ ok: false, reason: "date_invalid" });
  });

  it("strips control characters and phone-like numbers from the merchant", () => {
    const c = ok(
      validateCommand(
        raw({ intent: "add_transaction", amount: 500, merchant: "Rahim\u0007 Stall 01712345678" }),
        ctx("add 500"),
      ),
    );
    expect(c.merchant).toBe("Rahim Stall");
  });
});

describe("delete_transaction", () => {
  it("accepts 'last' with no other detail", () => {
    expect(
      ok(
        validateCommand(
          raw({ intent: "delete_transaction", which: "last" }),
          ctx("remove my last payment"),
        ),
      ),
    ).toEqual({
      intent: "delete_transaction",
      which: "last",
      amount: null,
      merchant: null,
      date: null,
      direction: null,
    });
  });

  it("accepts a match by merchant and day, with its amount cross-checked", () => {
    const c = ok(
      validateCommand(
        raw({
          intent: "delete_transaction",
          which: "match",
          merchant: "tea",
          date: "yesterday",
          amount: 40,
        }),
        ctx("remove the 40 taka tea payment from yesterday"),
      ),
    );
    expect(c).toMatchObject({ which: "match", merchant: "tea", date: "2026-10-02", amount: 40 });
    expect(
      validateCommand(
        raw({ intent: "delete_transaction", which: "match", amount: 400 }),
        ctx("remove the 40 taka payment"),
      ),
    ).toEqual({ ok: false, reason: "amount_mismatch" });
  });

  it("a match with nothing to match on is refused", () => {
    expect(
      validateCommand(raw({ intent: "delete_transaction", which: "match" }), ctx("remove one")),
    ).toEqual({ ok: false, reason: "nothing_to_match" });
  });
});

describe("create_budget and create_goal", () => {
  it("a budget needs a spending category and a spoken limit", () => {
    expect(
      ok(
        validateCommand(
          raw({ intent: "create_budget", category: "food", amount: 4000 }),
          ctx("set a food budget of 4,000"),
        ),
      ),
    ).toEqual({ intent: "create_budget", category: "food", limit: 4000 });
    expect(
      validateCommand(
        raw({ intent: "create_budget", category: "income", amount: 4000 }),
        ctx("budget 4000"),
      ),
    ).toEqual({ ok: false, reason: "category_invalid" });
    expect(
      validateCommand(
        raw({ intent: "create_budget", category: "savings", amount: 4000 }),
        ctx("budget 4000"),
      ),
    ).toEqual({ ok: false, reason: "category_invalid" });
    expect(
      validateCommand(
        raw({ intent: "create_budget", category: null, amount: 4000 }),
        ctx("budget 4000"),
      ),
    ).toEqual({ ok: false, reason: "category_invalid" });
    expect(
      validateCommand(
        raw({ intent: "create_budget", category: "food", amount: 9000 }),
        ctx("food budget of 4,000"),
      ),
    ).toEqual({ ok: false, reason: "amount_mismatch" });
  });

  it("a goal needs a name and a spoken target; a target date must be in the future", () => {
    const c = ok(
      validateCommand(
        raw({ intent: "create_goal", title: "Laptop", amount: 30000, date: "2027-03-31" }),
        ctx("save 30,000 for a laptop by March 31 2027"),
      ),
    );
    expect(c).toEqual({
      intent: "create_goal",
      title: "Laptop",
      target: 30000,
      targetDate: "2027-03-31",
    });
    expect(
      validateCommand(
        raw({ intent: "create_goal", title: "  ", amount: 30000 }),
        ctx("save 30000"),
      ),
    ).toEqual({ ok: false, reason: "name_missing" });
    expect(
      validateCommand(
        raw({ intent: "create_goal", title: "Laptop", amount: 30000, date: "2020-01-01" }),
        ctx("save 30000 for a laptop"),
      ),
    ).toEqual({ ok: false, reason: "date_invalid" });
  });
});

describe("add_to_goal", () => {
  it("picks the goal when exactly one matches", () => {
    const c = ok(
      validateCommand(
        raw({ intent: "add_to_goal", goal: "laptop", amount: 500 }),
        ctx("add 500 to my laptop goal"),
      ),
    );
    expect(c).toMatchObject({ goalId: "g2", goalTitle: "laptop", amount: 500 });
  });

  it("asks the person to choose when several or none match", () => {
    const several = ok(
      validateCommand(
        raw({ intent: "add_to_goal", goal: "phone", amount: 500 }),
        ctx("add 500 to my phone goal"),
      ),
    );
    expect(several.goalId).toBeNull();
    expect((several.goalCandidates as { id: string }[]).map((g) => g.id).sort()).toEqual([
      "g1",
      "g3",
    ]);
    const none = ok(
      validateCommand(
        raw({ intent: "add_to_goal", goal: "holiday", amount: 500 }),
        ctx("add 500 to holiday"),
      ),
    );
    expect(none.goalId).toBeNull();
    expect((none.goalCandidates as unknown[]).length).toBe(3);
  });

  it("refuses when the person has no goals, or the amount was not said", () => {
    expect(
      validateCommand(
        raw({ intent: "add_to_goal", goal: "laptop", amount: 500 }),
        ctx("add 500 to laptop", []),
      ),
    ).toEqual({ ok: false, reason: "no_goals" });
    expect(
      validateCommand(
        raw({ intent: "add_to_goal", goal: "laptop", amount: 700 }),
        ctx("add 500 to laptop"),
      ),
    ).toEqual({ ok: false, reason: "amount_mismatch" });
  });
});

describe("ask_coach and unclear", () => {
  it("passes the person's own words to the coach, not the model's rewrite", () => {
    const c = ok(
      validateCommand(
        raw({ intent: "ask_coach", note: "something else" }),
        ctx("  Can I afford a phone?  "),
      ),
    );
    expect(c).toEqual({ intent: "ask_coach", question: "Can I afford a phone?" });
  });

  it("unclear and malformed model output are refused", () => {
    expect(validateCommand(raw({ intent: "unclear" }), ctx("blah"))).toEqual({
      ok: false,
      reason: "unclear",
    });
    expect(validateCommand({ intent: "hack_the_planet" }, ctx("blah"))).toEqual({
      ok: false,
      reason: "invalid_output",
    });
    expect(validateCommand("delete everything", ctx("blah"))).toEqual({
      ok: false,
      reason: "invalid_output",
    });
  });

  it("the model cannot smuggle in a field or an intent the schema does not have", () => {
    const evil = {
      ...raw({ intent: "add_transaction", amount: 500 }),
      sql: "drop table transactions",
    };
    // extra keys are ignored by the schema; the command carries only the known fields
    const c = ok(validateCommand(evil, ctx("add 500")));
    expect(Object.keys(c)).not.toContain("sql");
  });
});

describe("matchGoals", () => {
  it("prefers exact, then containing, then a shared word", () => {
    expect(matchGoals("Laptop", GOALS).map((g) => g.id)).toEqual(["g2"]);
    expect(matchGoals("phone fund", GOALS).map((g) => g.id)).toEqual(["g1"]);
    expect(matchGoals("my laptop", GOALS).map((g) => g.id)).toEqual(["g2"]);
    expect(matchGoals("case", GOALS).map((g) => g.id)).toEqual(["g3"]);
    expect(matchGoals("", GOALS)).toEqual([]);
  });
});

describe("the schema", () => {
  it("lists every field as required, as strict structured output needs", () => {
    expect(RAW_COMMAND_JSON_SCHEMA.schema.required).toEqual(Object.keys(rawCommandSchema.shape));
    expect(Object.keys(RAW_COMMAND_JSON_SCHEMA.schema.properties).sort()).toEqual(
      [...RAW_COMMAND_JSON_SCHEMA.schema.required].sort(),
    );
  });
});
