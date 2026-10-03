"use client";

import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatShortDate, formatSignedMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCategories } from "@/features/categories/use-categories";
import type { TransactionRow } from "./types";

/** `framed` draws its own card; pass false when the list already sits inside one. */
export function TransactionList({
  rows,
  framed = true,
}: {
  rows: TransactionRow[];
  framed?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { data: categories } = useCategories();
  const lang = i18n.language;
  const nameById = new Map(
    (categories ?? []).map((c) => [c.id, lang === "bn" ? c.name_bn : c.name_en]),
  );

  return (
    <ul className={cn("divide-y", framed ? "finance-card overflow-hidden" : "-mx-2")}>
      {rows.map((tx) => {
        const incoming = tx.direction === "in";
        const Icon = incoming ? ArrowDownLeft : ArrowUpRight;
        return (
          <li key={tx.id}>
            <Link
              href={`/transactions/${tx.id}`}
              className={cn(
                "hover:bg-muted/60 flex min-h-16 items-center gap-3 py-3 transition-colors",
                framed ? "px-4" : "rounded-xl px-2",
              )}
            >
              <span
                className={cn(
                  "icon-chip",
                  incoming ? "bg-positive-soft text-positive" : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-[18px]" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {tx.counterparty || t(`channel.${tx.channel}`)}
                </div>
                <div className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
                  <span>{formatShortDate(tx.occurred_at, lang)}</span>
                  {tx.category_id && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{nameById.get(tx.category_id)}</span>
                    </>
                  )}
                  {tx.needs_review && (
                    <span className="bg-reward-soft text-reward-ink rounded-md px-1.5 py-0.5 font-medium">
                      {t("transactions.check_category")}
                    </span>
                  )}
                </div>
              </div>
              <div
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  incoming ? "text-positive" : "text-foreground",
                )}
              >
                {formatSignedMoney(incoming ? tx.amount : -tx.amount, lang)}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
