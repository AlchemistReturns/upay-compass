"use client";

import { Check, EyeOff, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGiveConsent } from "./use-coach";

/**
 * The coach consent card: what is shared with OpenAI, and the accept or decline buttons. Used by the
 * coach and by the Learn page (personalized lessons use the same consent).
 */
export function ConsentCard({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const consent = useGiveConsent();
  const items = [
    { key: "coach.consent_item_numbers", Icon: Check, tone: "bg-positive-soft text-positive" },
    { key: "coach.consent_item_goals", Icon: Check, tone: "bg-positive-soft text-positive" },
    { key: "coach.consent_item_learn", Icon: Check, tone: "bg-positive-soft text-positive" },
    { key: "coach.consent_item_merchant", Icon: Check, tone: "bg-positive-soft text-positive" },
    { key: "coach.consent_item_never", Icon: EyeOff, tone: "bg-secondary text-primary" },
  ];
  return (
    <section className="finance-card rise mx-auto max-w-2xl overflow-hidden">
      <div className="balance-panel rounded-none p-6 shadow-none sm:p-8">
        <span className="bg-lime text-brand-ink mb-4 grid size-14 place-items-center rounded-[1.25rem]">
          <ShieldCheck className="size-7" aria-hidden />
        </span>
        <h2 className="text-2xl leading-tight font-extrabold tracking-tight">
          {t("coach.consent_title")}
        </h2>
        <p className="text-on-dark-muted mt-2 text-sm leading-6">{t("coach.consent_sends")}</p>
      </div>
      <div className="p-5 sm:p-7">
        <ul className="space-y-3.5 text-sm leading-6">
          {items.map(({ key, Icon, tone }) => (
            <li key={key} className="flex gap-3">
              <span
                className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", tone)}
              >
                <Icon className="size-3.5" strokeWidth={2.5} aria-hidden />
              </span>
              {t(key)}
            </li>
          ))}
        </ul>
        <p className="callout mt-5 text-xs leading-5">{t("coach.consent_how")}</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onDone}>
            {t("coach.consent_decline")}
          </Button>
          <Button
            className="sm:min-w-40"
            loading={consent.isPending}
            onClick={() => consent.mutate()}
          >
            {t("coach.consent_accept")}
          </Button>
        </div>
        {consent.isError && (
          <p role="alert" className="text-destructive mt-3 text-sm">
            {t("common.error")}
          </p>
        )}
      </div>
    </section>
  );
}
