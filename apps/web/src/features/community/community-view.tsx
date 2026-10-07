"use client";

import { ShieldCheck, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { ProgressBar } from "@/components/compass";
import { formatMoney } from "@/lib/format";
import { isHidden, useCommunityInsights, type CommunityInsights } from "./use-community";

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
      {hint && <p className="text-muted-foreground mt-1 text-xs leading-5">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** One figure for "you" and one for "everyone", side by side. */
function Compare({
  mine,
  all,
  extra,
}: {
  mine: string;
  all: string;
  extra?: { label: string; value: string };
}) {
  const { t } = useTranslation();
  const cell = (label: string, value: string, strong = false) => (
    <div>
      <div
        className={`num text-[1.75rem] leading-tight font-extrabold ${strong ? "text-primary" : ""}`}
      >
        {value}
      </div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {cell(t("community.you"), mine, true)}
      {cell(t("community.everyone"), all)}
      {extra && cell(extra.label, extra.value)}
    </div>
  );
}

function Cards({ data }: { data: CommunityInsights }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const hidden = (
    <p className="text-muted-foreground text-sm">
      {t("community.hidden", { count: data.min_group_size })}
    </p>
  );
  const { spending, health, goals, roundups, learning } = data;

  return (
    <div className="space-y-4">
      <Section title={t("community.spending_title")} hint={t("community.spending_hint")}>
        {isHidden(spending) ? (
          hidden
        ) : (
          <ul className="space-y-3">
            {spending.top_categories.map((c) => (
              <li key={c.key}>
                <div className="flex justify-between text-sm">
                  <span>{lang === "bn" ? c.name_bn : c.name_en}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {c.mine_share === null
                      ? pct(c.share)
                      : t("community.you_vs", { mine: pct(c.mine_share), all: pct(c.share) })}
                  </span>
                </div>
                <ProgressBar className="mt-1.5 h-1.5" value={c.share * 100} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t("community.health_title")} hint={t("community.health_hint")}>
        {isHidden(health) ? (
          hidden
        ) : (
          <Compare
            mine={health.mine === null ? "–" : `${Math.round(health.mine)}`}
            all={`${Math.round(health.avg_score)}`}
            extra={
              health.type_avg === null
                ? undefined
                : { label: t("community.same_income"), value: `${Math.round(health.type_avg)}` }
            }
          />
        )}
      </Section>

      <Section title={t("community.goals_title")} hint={t("community.goals_hint")}>
        {isHidden(goals) ? (
          hidden
        ) : (
          <Compare
            mine={
              goals.mine_goals > 0
                ? t("community.goals_mine", { done: goals.mine_completed, total: goals.mine_goals })
                : "–"
            }
            all={pct(goals.completion_rate)}
          />
        )}
      </Section>

      <Section title={t("community.roundups_title")} hint={t("community.roundups_hint")}>
        {isHidden(roundups) ? (
          hidden
        ) : (
          <Compare
            mine={formatMoney(roundups.mine, lang)}
            all={formatMoney(roundups.avg_per_person, lang)}
          />
        )}
      </Section>

      <Section title={t("community.learning_title")} hint={t("community.learning_hint")}>
        {isHidden(learning) ? (
          hidden
        ) : (
          <Compare
            mine={`${learning.mine}/${learning.modules}`}
            all={`${learning.avg_modules}/${learning.modules}`}
          />
        )}
      </Section>
    </div>
  );
}

/** How the person compares with everyone using the app: group figures only, never other people. */
export function CommunityView() {
  const { t } = useTranslation();
  const insights = useCommunityInsights();
  return (
    <>
      <PageHeader
        title={t("community.title")}
        subtitle={t("community.subtitle")}
        icon={<Users className="size-6" aria-hidden />}
        back="/"
      />
      <div className="mx-auto max-w-3xl space-y-4 pb-4">
        <p className="callout">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("community.privacy", { count: insights.data?.min_group_size ?? 5 })}
        </p>
        {insights.isPending && (
          <p className="text-muted-foreground" role="status">
            {t("common.loading")}
          </p>
        )}
        {insights.isError && <p role="alert">{t("common.error")}</p>}
        {insights.data && <Cards data={insights.data} />}
      </div>
    </>
  );
}
