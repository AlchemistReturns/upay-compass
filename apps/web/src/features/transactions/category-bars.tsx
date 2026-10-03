"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "@/lib/format";
import { useCategories } from "@/features/categories/use-categories";
import type { CategorySpend } from "./types";

/** Horizontal bars, sorted high to low, one hue, direct value labels (identity is on the axis). */
export function CategoryBars({ data }: { data: CategorySpend[] }) {
  const { t, i18n } = useTranslation();
  const { data: categories } = useCategories();
  const [asTable, setAsTable] = useState(false);
  const lang = i18n.language;
  const nameById = new Map(
    (categories ?? []).map((c) => [c.id, lang === "bn" ? c.name_bn : c.name_en]),
  );
  const name = (id: number | null) =>
    id === null ? t("dashboard.uncategorized") : (nameById.get(id) ?? "-");

  const total = data.reduce((n, r) => n + r.total, 0);
  const max = Math.max(...data.map((r) => r.total), 1);

  return (
    <section className="finance-card p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="section-title">{t("dashboard.category_title")}</h2>
          <p className="text-muted-foreground text-xs">{t("dashboard.category_hint")}</p>
        </div>
        {data.length > 0 && (
          <button
            type="button"
            onClick={() => setAsTable((v) => !v)}
            className="text-primary hover:bg-secondary min-h-11 min-w-11 shrink-0 rounded-full px-3 text-xs font-medium transition-colors"
          >
            {asTable ? t("dashboard.show_chart") : t("dashboard.show_table")}
          </button>
        )}
      </div>

      {data.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("dashboard.no_spending")}</p>
      ) : asTable ? (
        <table className="w-full text-sm">
          <tbody>
            {data.map((r) => (
              <tr key={r.category_id ?? "none"} className="border-t first:border-t-0">
                <td className="py-1.5">{name(r.category_id)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatMoney(r.total, lang)}</td>
                <td className="text-muted-foreground py-1.5 pl-2 text-right text-xs tabular-nums">
                  {Math.round((r.total / total) * 100)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="space-y-3">
          {data.map((r) => (
            <li
              key={r.category_id ?? "none"}
              title={`${name(r.category_id)}: ${formatMoney(r.total, lang)}`}
            >
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span>{name(r.category_id)}</span>
                <span className="tabular-nums">
                  {formatMoney(r.total, lang)}
                  <span className="text-muted-foreground ml-1.5 text-xs">
                    {Math.round((r.total / total) * 100)}%
                  </span>
                </span>
              </div>
              <div className="bg-muted h-2.5 rounded-r-full rounded-l-sm">
                <div
                  className="h-full rounded-r-full rounded-l-sm"
                  style={{
                    width: `${Math.max((r.total / max) * 100, 2)}%`,
                    background: "var(--chart-bar)",
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
