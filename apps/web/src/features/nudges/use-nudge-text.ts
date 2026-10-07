import { useTranslation } from "react-i18next";
import { formatMoney, formatShortDate } from "@/lib/format";
import { useCategories } from "@/features/categories/use-categories";
import type { Nudge } from "./use-nudges";

/** Turns a nudge (type + data) into text in the current language, plus where tapping it should go. */
export function useNudgeText() {
  const { t, i18n } = useTranslation();
  const { data: categories } = useCategories();
  const lang = i18n.language;

  return (nudge: Nudge): { title: string; body: string; href: string } => {
    const d = nudge.data;
    const cat = categories?.find((c) => c.id === Number(d.category_id));
    const category = cat ? (lang === "bn" ? cat.name_bn : cat.name_en) : "";
    const spent = Number(d.spent ?? 0);
    const limit = Number(d.limit ?? 0);
    const money = (n: unknown) => formatMoney(Number(n ?? 0), lang);
    const date = (v: unknown) => (typeof v === "string" ? formatShortDate(v, lang) : "");

    switch (nudge.type) {
      case "budget_threshold":
        return {
          title: t("nudges.budget_threshold_title", {
            category,
            pct: Math.round(Number(d.threshold ?? 0.8) * 100),
          }),
          body: t("nudges.budget_threshold_body", {
            spent: formatMoney(spent, lang),
            limit: formatMoney(limit, lang),
          }),
          href: "/plan?tab=budgets",
        };
      case "budget_exceeded":
        return {
          title: t("nudges.budget_exceeded_title", { category }),
          body: t("nudges.budget_exceeded_body", {
            spent: formatMoney(spent, lang),
            over: formatMoney(Math.max(0, spent - limit), lang),
            limit: formatMoney(limit, lang),
          }),
          href: "/plan?tab=budgets",
        };
      case "overspend":
        return {
          title: t("nudges.overspend_title", { category }),
          body: t("nudges.overspend_body", { spent: money(d.spent), average: money(d.average) }),
          href: "/",
        };
      case "goal_behind":
        return {
          title: t("nudges.goal_behind_title", { title: String(d.title ?? "") }),
          body: d.required_monthly
            ? t("nudges.goal_behind_body", {
                amount: money(d.required_monthly),
                date: date(d.target_date),
              })
            : t("nudges.goal_behind_body_none"),
          href: "/plan?tab=goals",
        };
      case "bill_due": {
        const days = Number(d.days ?? 0);
        return {
          title: t(
            days === 0
              ? "nudges.bill_due_today"
              : days === 1
                ? "nudges.bill_due_tomorrow"
                : "nudges.bill_due_days",
            { name: String(d.name ?? ""), days },
          ),
          body: t("nudges.bill_due_body", { amount: money(d.amount), date: date(d.due) }),
          href: "/forecast",
        };
      }
      case "forecast_risk": {
        const negative = d.level === "negative";
        return {
          title: t("nudges.forecast_risk_title"),
          body: t(negative ? "nudges.forecast_risk_negative" : "nudges.forecast_risk_low", {
            day: date(d.lowest_day ?? d.day),
            amount: money(d.lowest ?? d.balance),
            buffer: money(d.buffer),
          }),
          href: "/forecast",
        };
      }
      case "unusual_transaction": {
        const first = d.rule === "new_counterparty";
        return {
          title: t("nudges.unusual_title", { category }),
          body: t(first ? "nudges.unusual_body_new" : "nudges.unusual_body", {
            amount: money(d.amount),
            typical: money(d.typical),
            name: String(d.counterparty ?? ""),
          }),
          href:
            typeof d.transaction_id === "string"
              ? `/transactions/${d.transaction_id}`
              : "/transactions",
        };
      }
      default:
        return { title: t("nudges.generic_title"), body: "", href: "/" };
    }
  };
}
