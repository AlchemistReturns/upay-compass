"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/compass";
import { useAuth } from "@/features/auth/auth-provider";
import { useProfile } from "@/features/profile/use-profile";
import { useOnline } from "@/features/pwa/use-online";
import { formatMoney } from "@/lib/format";
import { isSuppressed, useAdminInsights, useSeedCohort, type AdminInsights } from "./use-admin";

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="finance-card rise p-4 sm:p-5">
      <h2 className="text-[15px] font-bold">{title}</h2>
      {hint && <p className="text-muted-foreground mb-4 text-xs leading-5">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function Hidden({ min }: { min: number }) {
  const { t } = useTranslation();
  return <p className="text-muted-foreground text-sm">{t("admin.hidden", { count: min })}</p>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="num text-[1.75rem] leading-tight font-extrabold">{value}</div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}

function Insights({ data }: { data: AdminInsights }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const k = data.min_group_size;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const { spending, health, goals, roundups, learning } = data;

  return (
    <div className="space-y-4">
      <Section title={t("admin.spending_title")} hint={t("admin.spending_hint")}>
        {isSuppressed(spending) ? (
          <Hidden min={k} />
        ) : (
          <ul className="space-y-2.5">
            {spending.top_categories.map((c) => (
              <li key={c.key}>
                <div className="flex justify-between text-sm">
                  <span>{lang === "bn" ? c.name_bn : c.name_en}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {pct(c.share)} · {formatMoney(c.total, lang)}
                  </span>
                </div>
                <ProgressBar className="mt-1.5 h-1.5" value={c.share * 100} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t("admin.health_title")} hint={t("admin.health_hint")}>
        {isSuppressed(health) ? (
          <Hidden min={k} />
        ) : (
          <div className="space-y-3">
            <Stat
              label={t("admin.avg_score", { count: health.people })}
              value={`${health.avg_score}`}
            />
            {health.by_income_type.length > 0 && (
              <ul className="space-y-1 text-sm">
                {health.by_income_type.map((g) => (
                  <li key={g.income_type} className="flex justify-between">
                    <span>{t(`onboarding.${g.income_type}`)}</span>
                    <span className="tabular-nums">
                      {g.avg_score}
                      <span className="text-muted-foreground">
                        {" "}
                        · {t("admin.people", { count: g.people })}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Section>

      <div className="grid grid-cols-2 gap-3">
        <Section title={t("admin.goals_title")}>
          {isSuppressed(goals) ? (
            <Hidden min={k} />
          ) : (
            <Stat
              label={t("admin.goals_done", { done: goals.completed, total: goals.goals })}
              value={pct(goals.completion_rate)}
            />
          )}
        </Section>
        <Section title={t("admin.roundups_title")}>
          {isSuppressed(roundups) ? (
            <Hidden min={k} />
          ) : (
            <Stat
              label={t("admin.people", { count: roundups.people })}
              value={formatMoney(roundups.total, lang)}
            />
          )}
        </Section>
      </div>

      <Section title={t("admin.learning_title")}>
        {isSuppressed(learning) ? (
          <Hidden min={k} />
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <Stat
              label={t("admin.modules_avg", { count: learning.modules })}
              value={`${learning.avg_modules}`}
            />
            <Stat label={t("admin.graduates")} value={`${learning.graduates}`} />
          </div>
        )}
      </Section>
    </div>
  );
}

export function AdminView() {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const online = useOnline();
  const profile = useProfile(userId);
  const isAdmin = profile.data?.role === "admin";
  const insights = useAdminInsights();
  const seed = useSeedCohort();

  if (profile.isPending) {
    return (
      <>
        <PageHeader title={t("admin.title")} back="/" />
        <p className="text-muted-foreground" role="status">
          {t("common.loading")}
        </p>
      </>
    );
  }

  if (!isAdmin) {
    return (
      <>
        <PageHeader title={t("admin.title")} back="/" />
        <p>{t("admin.not_allowed")}</p>
        <Link href="/" className="text-primary mt-3 inline-flex min-h-11 items-center">
          {t("common.back")}
        </Link>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("admin.title")} back="/" />
      <div className="space-y-4 pb-4">
        <p className="callout">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("admin.privacy", { count: insights.data?.min_group_size ?? 5 })}
        </p>

        {insights.isPending && (
          <p className="text-muted-foreground" role="status">
            {t("common.loading")}
          </p>
        )}
        {insights.isError && <p role="alert">{t("common.error")}</p>}
        {insights.data && <Insights data={insights.data} />}

        <Section title={t("admin.seed_title")} hint={t("admin.seed_hint")}>
          <Button
            className="min-h-11 w-full"
            disabled={seed.isPending || !online}
            onClick={() => seed.mutate()}
          >
            {seed.isPending ? t("admin.seeding") : t("admin.seed")}
          </Button>
          {seed.isSuccess && (
            <p role="status" className="text-muted-foreground mt-2 text-sm">
              {t("admin.seeded", { count: seed.data.people })}
            </p>
          )}
          {seed.isError && (
            <p role="alert" className="text-destructive mt-2 text-sm">
              {t("common.error")}
            </p>
          )}
        </Section>
      </div>
    </>
  );
}
