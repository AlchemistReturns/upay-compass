"use client";

import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useCategories } from "@/features/categories/use-categories";

export default function HomePage() {
  const { t, i18n } = useTranslation();
  const { data, isPending, isError, refetch } = useCategories();

  return (
    <>
      <PageHeader title={t("app.name")} />
      <p className="text-muted-foreground mb-6">{t("app.tagline")}</p>
      <h2 className="mb-2 font-medium">{t("home.categories")}</h2>
      {isPending && <p>{t("common.loading")}</p>}
      {isError && (
        <div>
          <p className="mb-2">{t("common.error")}</p>
          <Button onClick={() => refetch()}>{t("common.retry")}</Button>
        </div>
      )}
      {data && (
        <ul className="grid grid-cols-2 gap-2">
          {data.map((c) => (
            <li key={c.id} className="rounded-lg border p-3 text-sm">
              <div>{i18n.language === "bn" ? c.name_bn : c.name_en}</div>
              {c.is_essential && (
                <div className="text-muted-foreground text-xs">{t("home.essential")}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
