"use client";

import Link from "next/link";
import { BellOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useNudgeText } from "./use-nudge-text";
import { useMarkNudgesRead, useNudges } from "./use-nudges";

export function NudgesView() {
  const { t, i18n } = useTranslation();
  const nudges = useNudges();
  const markRead = useMarkNudgesRead();
  const text = useNudgeText();
  const unread = nudges.data?.filter((n) => !n.read).length ?? 0;

  return (
    <>
      <PageHeader title={t("nudges.title")} />

      {nudges.isPending && <p className="text-muted-foreground">{t("common.loading")}</p>}
      {nudges.isError && (
        <div>
          <p className="mb-2">{t("common.error")}</p>
          <Button onClick={() => void nudges.refetch()}>{t("common.retry")}</Button>
        </div>
      )}

      {nudges.isSuccess && (
        <div className="space-y-3 pb-4">
          {unread > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={markRead.isPending}
              onClick={() => markRead.mutate("all")}
            >
              {t("nudges.mark_all")}
            </Button>
          )}
          {nudges.data.length === 0 ? (
            <div className="finance-card flex flex-col items-center gap-3 px-6 py-10 text-center">
              <span className="icon-chip size-12">
                <BellOff className="size-5" aria-hidden />
              </span>
              <p className="text-muted-foreground text-sm">{t("nudges.empty")}</p>
            </div>
          ) : (
            <ul className="finance-card divide-y overflow-hidden">
              {nudges.data.map((n) => {
                const { title, body, href } = text(n);
                return (
                  <li key={n.id}>
                    <Link
                      href={href}
                      onClick={() => !n.read && markRead.mutate([n.id])}
                      className={cn(
                        "hover:bg-muted/60 flex min-h-16 items-start gap-3 px-4 py-3.5 transition-colors",
                        !n.read && "bg-secondary/50",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-1.5 size-2.5 shrink-0 rounded-full",
                          n.read ? "bg-border" : "bg-primary ring-secondary ring-4",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className={cn("text-sm", !n.read && "font-medium")}>
                          {!n.read && <span className="sr-only">{t("nudges.unread")}: </span>}
                          {title}
                        </div>
                        {body && <div className="text-muted-foreground text-xs">{body}</div>}
                        <div className="text-muted-foreground mt-0.5 text-xs">
                          {formatShortDate(n.created_at, i18n.language)}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
