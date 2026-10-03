"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CategoryIcon, ProgressBar } from "@/components/compass";
import { formatMoney } from "@/lib/format";
import { useCategories } from "@/features/categories/use-categories";
import { ChartToggle } from "./chart-toggle";
import type { CategorySpend } from "./types";

/** Categories sorted high to low: icon and name for identity, one hue for the bars, values written out. */
export function CategoryBars({ data }: { data: CategorySpend[] }) {
  const { t, i18n } = useTranslation();
  const { data: categories } = useCategories();
  const [asTable, setAsTable] = useState(false);
  const lang = i18n.language;
  const byId = new Map((categories ?? []).map((c) => [c.id, c]));
  const name = (id: number | null) => {
    const c = id === null ? undefined : byId.get(id);
    return c ? (lang === "bn" ? c.name_bn : c.name_en) : t("dashboard.uncategorized");
  };

  const total = data.reduce((n, r) => n + r.total, 0);
  const max = Math.max(...data.map((r) => r.total), 1);

  return (
    <section className="finance-card p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold">{t("dashboard.category_title")}</h3>
          <p className="text-muted-foreground text-[12.5px]">{t("dashboard.category_hint")}</p>
        </div>
        {data.length > 0 && (
          <ChartToggle asTable={asTable} onToggle={() => setAsTable((v) => !v)} />
        )}
      </div>

      {data.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("dashboard.no_spending")}</p>
      ) : asTable ? (
        <table className="fade-in w-full text-sm">
          <tbody>
            {data.map((r) => (
              <tr
                key={r.category_id ?? "none"}
                className="border-t border-[rgba(13,75,76,.07)] first:border-t-0"
              >
                <td className="py-2">{name(r.category_id)}</td>
                <td className="num py-2 text-right">{formatMoney(r.total, lang)}</td>
                <td className="text-muted-foreground num py-2 pl-2 text-right text-xs">
                  {Math.round((r.total / total) * 100)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="fade-in space-y-3.5">
          {data.map((r, i) => (
            <li
              key={r.category_id ?? "none"}
              className="flex items-center gap-3"
              title={`${name(r.category_id)}: ${formatMoney(r.total, lang)}`}
            >
              <CategoryIcon
                categoryKey={r.category_id === null ? "other" : byId.get(r.category_id)?.key}
                className="size-10 rounded-[0.85rem]"
                iconClassName="size-[17px]"
              />
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-semibold">{name(r.category_id)}</span>
                  <span className="num shrink-0 font-bold">
                    {formatMoney(r.total, lang)}
                    <span className="text-muted-foreground ml-1.5 text-xs font-medium">
                      {Math.round((r.total / total) * 100)}%
                    </span>
                  </span>
                </div>
                <ProgressBar
                  value={(r.total / max) * 100}
                  color={
                    i === 0
                      ? "var(--chart-bar)"
                      : "color-mix(in oklch, var(--chart-bar) 78%, white)"
                  }
                  className="h-1.5"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
