"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { formatShortDate, formatSignedMoney } from "@/lib/format";
import { useCategories } from "@/features/categories/use-categories";
import type { TransactionRow } from "./types";

export function TransactionList({ rows }: { rows: TransactionRow[] }) {
  const { t, i18n } = useTranslation();
  const { data: categories } = useCategories();
  const lang = i18n.language;
  const nameById = new Map(
    (categories ?? []).map((c) => [c.id, lang === "bn" ? c.name_bn : c.name_en]),
  );

  return (
    <ul className="divide-y rounded-xl border">
      {rows.map((tx) => (
        <li key={tx.id}>
          <Link
            href={`/transactions/${tx.id}`}
            className="flex min-h-14 items-center gap-3 px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {tx.counterparty || t(`channel.${tx.channel}`)}
              </div>
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
                <span>{formatShortDate(tx.occurred_at, lang)}</span>
                <span>{tx.category_id ? nameById.get(tx.category_id) : ""}</span>
                {tx.needs_review && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">
                    {t("transactions.check_category")}
                  </span>
                )}
              </div>
            </div>
            <div className="text-sm tabular-nums">
              {formatSignedMoney(tx.direction === "in" ? tx.amount : -tx.amount, lang)}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
