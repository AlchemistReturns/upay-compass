"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { Segmented } from "@/components/segmented";
import { BudgetsView } from "@/features/budgets/budgets-view";
import { GoalsView } from "@/features/goals/goals-view";

const TABS = ["budgets", "goals"] as const;
type Tab = (typeof TABS)[number];

/**
 * One home for planning: budgets (limits for the month) and goals with savings and round-ups.
 * The tab lives in the URL (?tab=goals), so old links, reloads and the back button all land
 * on the right one.
 */
export function PlanView() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : "budgets";

  return (
    <>
      <PageHeader title={t("plan.title")} subtitle={t("plan.subtitle")} />
      <div className="space-y-4 pb-4">
        <Segmented
          label={t("plan.sections")}
          value={tab}
          onSelect={(next) => router.replace(`${pathname}?tab=${next}`, { scroll: false })}
          options={[
            { value: "budgets", label: t("plan.budgets") },
            { value: "goals", label: t("plan.goals") },
          ]}
        />
        {tab === "budgets" ? <BudgetsView embedded /> : <GoalsView embedded />}
      </div>
    </>
  );
}
