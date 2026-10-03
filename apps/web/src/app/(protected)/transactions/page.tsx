"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, ReceiptText, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader, TOOLBAR_BUTTON } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingCards } from "@/components/compass";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { useCategories } from "@/features/categories/use-categories";
import { TransactionList, dhakaDay } from "@/features/transactions/transaction-list";
import type { TransactionRow } from "@/features/transactions/types";
import { useTransactionList } from "@/features/transactions/use-transactions";
import { NAV_FORWARD } from "@/components/page-transition";

type Filter = "all" | "in" | "out";

export default function TransactionsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const list = useTransactionList(200);
  const { data: categories } = useCategories();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const names = new Map(
      (categories ?? []).map((c) => [c.id, `${c.name_en} ${c.name_bn}`.toLowerCase()]),
    );
    const rows = (list.data ?? []).filter(
      (r) =>
        (filter === "all" || r.direction === filter) &&
        (!q ||
          r.counterparty.toLowerCase().includes(q) ||
          r.note.toLowerCase().includes(q) ||
          (r.category_id !== null && names.get(r.category_id)?.includes(q))),
    );
    const byDay = new Map<string, TransactionRow[]>();
    for (const r of rows) {
      const day = dhakaDay(r.occurred_at);
      byDay.set(day, [...(byDay.get(day) ?? []), r]);
    }
    return [...byDay.entries()];
  }, [list.data, categories, query, filter]);

  // read the clock once, so "Today" / "Yesterday" stay stable across renders
  const [{ today, yesterday }] = useState(() => {
    const now = Date.now();
    return {
      today: dhakaDay(new Date(now).toISOString()),
      yesterday: dhakaDay(new Date(now - 86_400_000).toISOString()),
    };
  });
  const dayLabel = (day: string) =>
    day === today
      ? t("transactions.today")
      : day === yesterday
        ? t("transactions.yesterday")
        : new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "UTC",
          }).format(new Date(`${day}T12:00:00Z`));

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: t("transactions.filter_all") },
    { id: "out", label: t("transactions.filter_out") },
    { id: "in", label: t("transactions.filter_in") },
  ];

  return (
    <>
      <PageHeader
        title={t("transactions.list_title")}
        back="/"
        subtitle={list.data ? t("transactions.count", { count: list.data.length }) : undefined}
        actions={
          <Link
            href="/transactions/new"
            transitionTypes={NAV_FORWARD}
            className={TOOLBAR_BUTTON}
            aria-label={t("transactions.add")}
            title={t("transactions.add")}
          >
            <Plus className="size-5" aria-hidden />
          </Link>
        }
      />

      {list.isPending && <LoadingCards rows={5} />}
      {list.isError && <ErrorState onRetry={() => void list.refetch()} />}
      {list.isSuccess && list.data.length === 0 && (
        <EmptyState
          icon={ReceiptText}
          body={t("transactions.empty")}
          action={
            <Link
              href="/transactions/new"
              transitionTypes={NAV_FORWARD}
              className="bg-primary text-primary-foreground inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm font-semibold"
            >
              <Plus className="size-4" aria-hidden />
              {t("transactions.add")}
            </Link>
          }
        />
      )}

      {list.isSuccess && list.data.length > 0 && (
        <div className="space-y-5 pb-4">
          <div className="rise space-y-3">
            <label className="finance-card focus-within:ring-ring/25 flex h-12 items-center gap-2.5 rounded-full px-4 transition-shadow focus-within:ring-4">
              <Search className="text-muted-foreground size-[18px] shrink-0" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("transactions.search")}
                aria-label={t("transactions.search")}
                className="placeholder:text-muted-foreground/80 h-full min-w-0 flex-1 bg-transparent text-base outline-none [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label={t("common.close")}
                  className="bg-muted text-muted-foreground -mr-1.5 grid size-8 place-items-center rounded-full"
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </label>
            <div role="group" aria-label={t("transactions.direction")} className="flex gap-2">
              {filters.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={filter === id}
                  onClick={() => {
                    if (id !== filter) haptic("light");
                    setFilter(id);
                  }}
                  className={cn(
                    "h-11 rounded-full px-4 text-[13px] font-semibold transition-[background-color,color,box-shadow] active:scale-95",
                    filter === id
                      ? "bg-primary text-primary-foreground shadow-[0_6px_14px_-8px_rgba(13,75,76,.8)]"
                      : "bg-card text-muted-foreground hover:text-foreground border border-[rgba(13,75,76,.1)]",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {groups.length === 0 ? (
            <EmptyState icon={Search} body={t("transactions.no_match")} />
          ) : (
            groups.map(([day, rows]) => {
              const spent = rows
                .filter((r) => r.direction === "out")
                .reduce((n, r) => n + r.amount, 0);
              return (
                <section
                  key={day}
                  aria-label={dayLabel(day)}
                  // long histories: let the browser skip laying out days that are off screen
                  className="[contain-intrinsic-size:auto_320px] [content-visibility:auto]"
                >
                  <div className="mb-2 flex items-baseline justify-between px-1">
                    <h2 className="text-muted-foreground text-[12.5px] font-bold tracking-wide uppercase">
                      {dayLabel(day)}
                    </h2>
                    {spent > 0 && (
                      <span className="text-muted-foreground num text-xs font-semibold">
                        −{formatMoney(spent, lang)}
                      </span>
                    )}
                  </div>
                  <TransactionList rows={rows} />
                </section>
              );
            })
          )}
        </div>
      )}
    </>
  );
}
