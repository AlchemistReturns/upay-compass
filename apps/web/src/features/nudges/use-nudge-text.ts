import { useTranslation } from "react-i18next";
import { formatMoney } from "@/lib/format";
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
          href: "/budgets",
        };
      case "budget_exceeded":
        return {
          title: t("nudges.budget_exceeded_title", { category }),
          body: t("nudges.budget_exceeded_body", {
            spent: formatMoney(spent, lang),
            over: formatMoney(Math.max(0, spent - limit), lang),
            limit: formatMoney(limit, lang),
          }),
          href: "/budgets",
        };
      default:
        return { title: t("nudges.generic_title"), body: "", href: "/" };
    }
  };
}
