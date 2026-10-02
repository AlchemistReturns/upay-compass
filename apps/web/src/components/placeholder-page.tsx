"use client";

import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";

export function PlaceholderPage({ ns }: { ns: "budgets" | "goals" | "coach" | "login" }) {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t(`${ns}.title`)} />
      <p className="text-muted-foreground">{t(`${ns}.empty`)}</p>
    </>
  );
}
