"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OfflineNote } from "@/features/pwa/offline-note";
import { useOnline } from "@/features/pwa/use-online";
import { z } from "zod";
import { CHANNELS } from "@compass/shared";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm";
import { toast } from "@/components/toaster";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/money-input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { fromDhakaInputValue, toDhakaInputValue } from "@/lib/format";
import { useCategories } from "@/features/categories/use-categories";
import type { TransactionRow } from "./types";
import { useAddTransaction, useDeleteTransaction, useUpdateTransaction } from "./use-transactions";

const formSchema = z.object({
  amount: z.number().positive().max(100_000_000),
  direction: z.enum(["in", "out"]),
  channel: z.enum(CHANNELS),
  counterparty: z.string().trim().max(80),
  note: z.string().trim().max(200),
});

/** Add (no `existing`) or edit a transaction. Changing the category of an existing one teaches the app. */
export function TransactionForm({ existing }: { existing?: TransactionRow }) {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  const router = useRouter();
  const confirm = useConfirm();
  const { data: categories } = useCategories();
  const add = useAddTransaction();
  const update = useUpdateTransaction(existing?.id ?? "");
  const remove = useDeleteTransaction(existing?.id ?? "");

  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [direction, setDirection] = useState<"in" | "out">(existing?.direction ?? "out");
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>(
    existing?.channel ?? "merchant",
  );
  const [counterparty, setCounterparty] = useState(existing?.counterparty ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [when, setWhen] = useState(
    toDhakaInputValue(existing?.occurred_at ?? new Date().toISOString()),
  );
  const [categoryId, setCategoryId] = useState<number | null>(existing?.category_id ?? null);
  const [error, setError] = useState<string | null>(null);

  const busy = add.isPending || update.isPending || remove.isPending;
  const catName = (c: { name_bn: string; name_en: string }) =>
    i18n.language === "bn" ? c.name_bn : c.name_en;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = formSchema.safeParse({
      amount: Number(amount),
      direction,
      channel,
      counterparty,
      note,
    });
    if (!parsed.success || !when) {
      setError(t("transactions.invalid"));
      return;
    }
    const input = { ...parsed.data, occurred_at: fromDhakaInputValue(when) };
    try {
      if (existing) {
        await update.mutateAsync({
          ...input,
          category_id: categoryId,
          categoryChanged: categoryId !== null && categoryId !== existing.category_id,
        });
      } else {
        await add.mutateAsync(input);
      }
      toast.success(t("transactions.toast_saved"));
      router.push(existing ? "/transactions" : "/");
    } catch {
      setError(t("common.error"));
    }
  }

  async function onDelete() {
    const ok = await confirm({
      title: t("transactions.confirm_delete"),
      confirmLabel: t("transactions.delete"),
    });
    if (!ok) return;
    try {
      await remove.mutateAsync();
      toast.success(t("transactions.toast_deleted"));
      router.push("/transactions");
    } catch {
      setError(t("common.error"));
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl space-y-4 pb-4" noValidate>
      <section className="finance-card rise space-y-4 p-4 sm:p-5">
        <div
          role="group"
          aria-label={t("transactions.direction")}
          className="relative flex rounded-full bg-[#e3ece4] p-1"
        >
          <span
            aria-hidden
            className={cn(
              "absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-full shadow-[0_4px_12px_-4px_rgba(6,47,49,.3)] transition-[transform,background-color] duration-400 ease-[cubic-bezier(0.32,0.72,0,1)]",
              direction === "out" ? "bg-card" : "bg-positive translate-x-full",
            )}
          />
          {(["out", "in"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={direction === d}
              onClick={() => setDirection(d)}
              className={cn(
                "relative min-h-11 flex-1 rounded-full text-sm font-semibold transition-colors duration-300",
                direction === d
                  ? d === "in"
                    ? "text-white"
                    : "text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {t(`transactions.${d === "out" ? "money_out" : "money_in"}`)}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <Label htmlFor="tx-amount">{t("transactions.amount")}</Label>
          <MoneyInput
            id="tx-amount"
            value={amount}
            onChange={setAmount}
            decimal
            size="lg"
            autoFocus={!existing}
          />
        </div>
      </section>

      <section
        className="finance-card rise space-y-4 p-4 sm:p-5"
        style={{ "--i": 1 } as React.CSSProperties}
      >
        <div className="space-y-2">
          <Label htmlFor="tx-counterparty">{t("transactions.counterparty")}</Label>
          <Input
            id="tx-counterparty"
            value={counterparty}
            onChange={(e) => setCounterparty(e.target.value)}
            placeholder={t("transactions.counterparty_hint")}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tx-channel">{t("transactions.channel")}</Label>
            <NativeSelect
              id="tx-channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value as typeof channel)}
            >
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {t(`channel.${c}`)}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tx-when">{t("transactions.date")}</Label>
            <Input
              id="tx-when"
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tx-note">{t("transactions.note")}</Label>
          <Input id="tx-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        {existing && (
          <div className="space-y-2">
            <Label htmlFor="tx-category">{t("transactions.category")}</Label>
            <NativeSelect
              id="tx-category"
              value={categoryId ?? ""}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
            >
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {catName(c)}
                </option>
              ))}
            </NativeSelect>
            <p className="text-muted-foreground px-1 text-xs leading-5">
              {t("transactions.category_teaches")}
            </p>
          </div>
        )}
      </section>

      {existing?.is_simulated && (
        <p className="text-muted-foreground px-1 text-xs">{t("common.simulated_note")}</p>
      )}

      {error && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {error}
        </p>
      )}

      <OfflineNote />
      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={add.isPending || update.isPending}
        disabled={busy || !online}
      >
        {t("transactions.save")}
      </Button>
      {existing && (
        <Button
          type="button"
          variant="destructive"
          className="w-full"
          loading={remove.isPending}
          disabled={busy || !online}
          onClick={() => void onDelete()}
        >
          <Trash2 aria-hidden />
          {t("transactions.delete")}
        </Button>
      )}
    </form>
  );
}
