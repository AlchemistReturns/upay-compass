"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { demoMark } from "@/features/demo/demo-timer";
import { useRunCommand } from "@/features/voice/use-run-command";

/** After a "can I afford X?" answer: one action the person can confirm, saved as a goal. */
export function RecommendCard({
  amount,
  onDone,
}: {
  amount: number;
  verdict: string;
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation();
  const run = useRunCommand();
  const [busy, setBusy] = useState(false);

  useEffect(() => demoMark("recommended"), []);

  async function confirm() {
    setBusy(true);
    try {
      const outcome = await run({
        intent: "create_goal",
        title: t("coach.rec_goal_title"),
        target: amount,
        targetDate: null,
      });
      toast.success(
        t("voice.done_goal", { amount: formatMoney(outcome.amount ?? amount, i18n.language) }),
      );
      demoMark("confirmed");
      onDone();
    } catch {
      toast.error(t("common.error"));
      setBusy(false);
    }
  }

  return (
    <section className="finance-card ml-10 space-y-3 p-4" data-testid="coach-recommend">
      <h3 className="text-[15px] font-bold">{t("coach.rec_title")}</h3>
      <p className="text-sm">
        {t("coach.rec_body", { amount: formatMoney(amount, i18n.language) })}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" disabled={busy} onClick={onDone}>
          {t("coach.rec_skip")}
        </Button>
        <Button className="flex-[1.4]" loading={busy} onClick={() => void confirm()}>
          {t("coach.rec_confirm")}
        </Button>
      </div>
    </section>
  );
}
