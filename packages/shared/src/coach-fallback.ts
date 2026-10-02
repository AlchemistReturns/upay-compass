import type { ActionId } from "./health.ts";
import { ACTION_WORDS, type CoachContext } from "./coach-context.ts";

/**
 * A plain template answer, used when the language model is unavailable (or no key is set), so the
 * coach never goes silent. Everything it says comes straight from the context numbers.
 */

const TIP: Record<"en" | "bn", Record<ActionId, string>> = {
  en: {
    save_more: "setting aside a bit more each month",
    set_budgets: "setting a budget for your biggest spending category",
    fix_budget: "bringing an over-limit budget back under control",
    build_buffer: "building up an emergency buffer in your wallet",
    smooth_income: "putting some money aside in better weeks to cover leaner ones",
  },
  bn: {
    save_more: "প্রতি মাসে আরও কিছু আলাদা করে রাখা",
    set_budgets: "সবচেয়ে বেশি খরচের ক্যাটাগরির জন্য বাজেট ঠিক করা",
    fix_budget: "সীমা ছাড়ানো বাজেট আবার নিয়ন্ত্রণে আনা",
    build_buffer: "ওয়ালেটে জরুরি তহবিল গড়ে তোলা",
    smooth_income: "ভালো সময়ে কিছু টাকা সরিয়ে রেখে খারাপ সময়ের জন্য প্রস্তুত থাকা",
  },
};

export function fallbackReply(ctx: CoachContext): string {
  const bn = ctx.language === "bn";
  const money = (n: number) =>
    `৳${Math.round(n).toLocaleString(bn ? "bn-BD" : "en-US", { maximumFractionDigits: 0 })}`;
  const lines: string[] = [];

  if (ctx.dataSufficiency === "thin") {
    return bn
      ? "আমার কাছে এখনও যথেষ্ট লেনদেনের তথ্য নেই, তাই আন্দাজে কিছু বলব না। কয়েক সপ্তাহের লেনদেন যোগ করলে আমি আপনার খরচ ও সঞ্চয় নিয়ে সঠিকভাবে বলতে পারব।"
      : "I don't have enough transaction history yet, so I won't guess. Once you have a few weeks of transactions, I can tell you much more about your spending and savings.";
  }

  lines.push(
    bn
      ? `আপনার ওয়ালেটে এখন ${money(ctx.walletBalance)} আছে। গত ৩০ দিনে আয় ${money(ctx.last30Days.income)} আর খরচ ${money(ctx.last30Days.spending)}।`
      : `Your wallet balance is ${money(ctx.walletBalance)}. In the last 30 days you earned ${money(ctx.last30Days.income)} and spent ${money(ctx.last30Days.spending)}.`,
  );

  const top = ctx.last30Days.spendingByCategory[0];
  if (top) {
    lines.push(
      bn
        ? `সবচেয়ে বেশি খরচ হয়েছে "${top.category}" ক্যাটাগরিতে: ${money(top.total)}।`
        : `Your biggest spending category was "${top.category}" at ${money(top.total)}.`,
    );
  }

  const a = ctx.affordability;
  if (a) {
    const verdict = {
      yes: bn
        ? `${money(a.amount)} খরচ করলেও আপনার ব্যালেন্স নিরাপদ সীমার ওপরে থাকবে।`
        : `You can afford ${money(a.amount)}: your balance would stay above your safety buffer.`,
      tight: bn
        ? `${money(a.amount)} খরচ করা সম্ভব, তবে টানাটানি হবে: ব্যালেন্স নিরাপদ সীমার নিচে নামতে পারে।`
        : `${money(a.amount)} is possible but tight: your balance could dip below your safety buffer.`,
      no: bn
        ? `এখন ${money(a.amount)} খরচ করলে আগামী ৩০ দিনের মধ্যে আপনার ব্যালেন্স শূন্যের নিচে নামতে পারে।`
        : `Spending ${money(a.amount)} now could push your balance below zero within the next 30 days.`,
      insufficient: bn
        ? "এটা বলার মতো যথেষ্ট তথ্য আমার কাছে নেই।"
        : "I don't have enough data to say.",
    }[a.verdict];
    lines.push(verdict);
  } else if (ctx.forecast30Days.available && ctx.forecast30Days.daysBelowBuffer > 0) {
    const f = ctx.forecast30Days;
    lines.push(
      bn
        ? `সতর্কতা: আগামী ৩০ দিনে ব্যালেন্স ${f.lowestBalance.day} তারিখে ${money(f.lowestBalance.balance)} পর্যন্ত নামতে পারে, যা আপনার নিরাপদ সীমা ${money(f.safetyBuffer)} এর নিচে।`
        : `Heads up: over the next 30 days your balance may fall to ${money(f.lowestBalance.balance)} on ${f.lowestBalance.day}, below your safety buffer of ${money(f.safetyBuffer)}.`,
    );
  }

  const h = ctx.healthScore;
  if (h) {
    const word = h.topImprovementAreas[0];
    const tip = (Object.keys(ACTION_WORDS) as ActionId[]).find((k) => ACTION_WORDS[k] === word);
    lines.push(
      bn
        ? `আপনার আর্থিক স্বাস্থ্য স্কোর ${h.score}/১০০।${tip ? ` উন্নতির সবচেয়ে ভালো উপায়: ${TIP.bn[tip]}।` : ""}`
        : `Your financial health score is ${h.score}/100.${tip ? ` The best way to improve it is ${TIP.en[tip]}.` : ""}`,
    );
  }

  lines.push(
    bn
      ? "(এআই সহায়ক এখন পাওয়া যাচ্ছে না, তাই এটি আপনার সংখ্যা থেকে তৈরি একটি সংক্ষিপ্ত সারাংশ।)"
      : "(The AI assistant is unavailable right now, so this is a short summary built from your numbers.)",
  );
  return lines.join("\n\n");
}
