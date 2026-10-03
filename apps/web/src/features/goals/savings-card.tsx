"use client";

import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, PiggyBank } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OfflineNote } from "@/features/pwa/offline-note";
import { useOnline } from "@/features/pwa/use-online";
import { MoneyInput } from "@/components/money-input";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/toaster";
import { formatMoney } from "@/lib/format";
import {
  moneyMoveErrorKey,
  useDepositSavings,
  useSavings,
  useWithdrawSavings,
  type Savings,
} from "./use-savings";

const QUICK_AMOUNTS = [500, 1000, 5000] as const;

/** Move money between the wallet and savings. `mode` decides which way and which messages. */
function MoveForm({
  mode,
  savings,
  onDone,
}: {
  mode: "deposit" | "withdraw";
  savings: Savings;
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  const deposit = useDepositSavings();
  const withdraw = useWithdrawSavings();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lang = i18n.language;
  const run = mode === "deposit" ? deposit : withdraw;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) return setError(t("goals.invalid_amount"));
    setError(null);
    try {
      await run.mutateAsync(value);
      toast.success(
        t(mode === "deposit" ? "savings.toast_added" : "savings.toast_withdrawn", {
          amount: formatMoney(value, lang),
        }),
      );
      onDone();
    } catch (err) {
      setError(t(moneyMoveErrorKey(err)));
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor={`savings-${mode}`}>{t("goals.amount")}</Label>
        <MoneyInput id={`savings-${mode}`} value={amount} onChange={setAmount} decimal size="lg" />
      </div>
      <div className="flex flex-wrap gap-2">
        {QUICK_AMOUNTS.map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={amount === String(a)}
            onClick={() => setAmount(String(a))}
            className="bg-secondary text-secondary-foreground hover:bg-lime-soft aria-pressed:bg-primary aria-pressed:text-primary-foreground tap num h-11 rounded-full px-4 text-[13px] font-bold"
          >
            {formatMoney(a, lang)}
          </button>
        ))}
        {mode === "withdraw" && savings.free > 0 && (
          <button
            type="button"
            aria-pressed={amount === String(Math.floor(savings.free))}
            onClick={() => setAmount(String(Math.floor(savings.free)))}
            className="bg-lime-soft text-brand-ink hover:bg-lime aria-pressed:bg-lime tap num h-11 rounded-full px-4 text-[13px] font-bold"
          >
            {formatMoney(savings.free, lang)}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {error}
        </p>
      )}
      <OfflineNote />
      <Button
        type="submit"
        className="w-full"
        loading={run.isPending}
        disabled={!online || !(Number(amount) > 0)}
      >
        {t(mode === "deposit" ? "savings.add" : "savings.withdraw")}
      </Button>
      <p className="text-muted-foreground px-1 text-xs leading-5">
        {t(mode === "deposit" ? "savings.hint_add" : "savings.hint_withdraw")}
      </p>
    </form>
  );
}

/**
 * The savings account. Money put here leaves the wallet; the part allocated to goals is shown
 * apart from the free part, which is the only part that can be taken back out directly.
 */
export function SavingsCard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const savings = useSavings();
  const [mode, setMode] = useState<"deposit" | "withdraw" | null>(null);
  const data = savings.data;

  return (
    <section aria-labelledby="savings-heading" className="finance-card space-y-4 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="bg-secondary text-primary grid size-11 shrink-0 place-items-center rounded-2xl">
          <PiggyBank className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="savings-heading" className="text-muted-foreground text-[12.5px] font-semibold">
            {t("savings.title")}
          </h2>
          <div className="num text-2xl leading-tight font-extrabold">
            {data ? formatMoney(data.total, lang) : "–"}
          </div>
        </div>
      </div>
      {data && (
        <dl className="text-muted-foreground grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt>{t("savings.in_goals")}</dt>
            <dd className="num text-foreground text-sm font-bold">
              {formatMoney(data.allocated, lang)}
            </dd>
          </div>
          <div>
            <dt>{t("savings.free")}</dt>
            <dd className="num text-foreground text-sm font-bold">
              {formatMoney(data.free, lang)}
            </dd>
          </div>
        </dl>
      )}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => setMode("deposit")} disabled={!data}>
          <ArrowDownToLine aria-hidden />
          {t("savings.add")}
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => setMode("withdraw")}
          disabled={!data || data.free <= 0}
        >
          <ArrowUpFromLine aria-hidden />
          {t("savings.withdraw")}
        </Button>
      </div>
      <p className="text-muted-foreground px-1 text-xs leading-5">{t("savings.explain")}</p>

      <Sheet
        open={mode !== null}
        onOpenChange={(o) => !o && setMode(null)}
        title={t(mode === "withdraw" ? "savings.withdraw" : "savings.add")}
      >
        {mode && data && <MoveForm mode={mode} savings={data} onDone={() => setMode(null)} />}
      </Sheet>
    </section>
  );
}
