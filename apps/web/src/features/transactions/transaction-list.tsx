"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CategoryIcon } from "@/components/compass";
import { formatShortDate, formatSignedMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCategories } from "@/features/categories/use-categories";
import type { TransactionRow } from "./types";
import { NAV_FORWARD } from "@/components/page-transition";

/** "2026-10-03" for a timestamp, in Bangladesh time; used to group rows by day. */
export function dhakaDay(iso: string) {
  return new Date(new Date(iso).getTime() + 6 * 3_600_000).toISOString().slice(0, 10);
}

function Row({ tx, inset }: { tx: TransactionRow; inset: boolean }) {
  const { t, i18n } = useTranslation();
  const { data: categories } = useCategories();
  const lang = i18n.language;
  const cat = categories?.find((c) => c.id === tx.category_id);
  const incoming = tx.direction === "in";

  return (
    <Link
      href={`/transactions/${tx.id}`}
      transitionTypes={NAV_FORWARD}
      className={cn(
        "group flex min-h-[4.25rem] items-center gap-3.5 py-3 transition-colors hover:bg-[#f6faf4] active:bg-muted",
        inset ? "rounded-2xl px-2.5" : "px-4",
      )}
    >
      <CategoryIcon categoryKey={cat?.key ?? (incoming ? "income" : "other")} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">
          {tx.counterparty || t(`channel.${tx.channel}`)}
        </div>
        <div className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-x-1.5 text-[12.5px]">
          <span className="truncate">
            {cat ? (lang === "bn" ? cat.name_bn : cat.name_en) : t(`channel.${tx.channel}`)}
          </span>
          <span aria-hidden>·</span>
          <span className="shrink-0">{formatShortDate(tx.occurred_at, lang)}</span>
        </div>
        {tx.needs_review && (
          <span className="bg-warning-soft text-warning-ink mt-1 inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold">
            {t("transactions.check_category")}
          </span>
        )}
      </div>
      <div
        className={cn(
          "num shrink-0 text-[15px] font-bold",
          incoming ? "text-positive" : "text-foreground",
        )}
      >
        {formatSignedMoney(incoming ? tx.amount : -tx.amount, lang)}
      </div>
      <ChevronRight
        className="text-muted-foreground/50 -mr-1 hidden size-4 shrink-0 transition-transform group-hover:translate-x-0.5 sm:block"
        aria-hidden
      />
    </Link>
  );
}

/** `framed` draws its own card; pass false when the list already sits inside one. */
export function TransactionList({
  rows,
  framed = true,
}: {
  rows: TransactionRow[];
  framed?: boolean;
}) {
  return (
    <ul
      className={cn(
        "divide-y divide-[rgba(13,75,76,.07)]",
        framed ? "finance-card overflow-hidden" : "-mx-2.5",
      )}
    >
      {rows.map((tx) => (
        <li key={tx.id}>
          <Row tx={tx} inset={!framed} />
        </li>
      ))}
    </ul>
  );
}
