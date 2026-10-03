"use client";

import Link from "next/link";
import { Menu } from "@base-ui/react/menu";
import { Award, ChevronRight, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/auth-provider";
import { Avatar, formatPhone } from "@/features/profile/avatar";
import { useProfile } from "@/features/profile/use-profile";

const ITEM =
  "flex min-h-11 w-full cursor-default items-center gap-3 rounded-xl px-3 text-sm font-medium outline-none select-none data-[highlighted]:bg-secondary data-[highlighted]:text-secondary-foreground";

/** Avatar button in the header toolbar; opens the account menu (who you are, profile, sign out). */
export function UserMenu({ triggerClassName }: { triggerClassName?: string }) {
  const { t, i18n } = useTranslation();
  const { userId, signOut } = useAuth();
  const profile = useProfile(userId);
  const p = profile.data;
  const name = p?.full_name?.trim() || null;

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={t("profile.menu")}
        title={t("profile.menu")}
        className={cn(triggerClassName, "data-[popup-open]:bg-muted")}
      >
        <Avatar name={name} className="size-9" />
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={10} className="z-50 outline-none">
          <Menu.Popup className="glass w-[min(19rem,calc(100vw-1.5rem))] origin-[var(--transform-origin)] rounded-3xl p-2 transition-[transform,opacity] duration-150 outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            {/* who is signed in */}
            <div className="flex items-center gap-3 px-2.5 pt-2 pb-3">
              <Avatar name={name} className="size-12 text-base" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-bold">
                  {name ?? (
                    <span className="text-muted-foreground font-semibold">
                      {t("profile.no_name")}
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground truncate text-[13px] tabular-nums">
                  {formatPhone(p?.phone)}
                </div>
              </div>
              {p?.role === "admin" && (
                <span className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 text-[11px] font-semibold">
                  {t("profile.admin_badge")}
                </span>
              )}
            </div>

            {p?.income_type && (
              <div className="bg-muted/70 mx-1 mb-2 flex items-center justify-between gap-2 rounded-2xl px-3 py-2.5 text-[13px]">
                <span className="text-muted-foreground">{t(`onboarding.${p.income_type}`)}</span>
                {p.monthly_income !== null && (
                  <span className="font-semibold tabular-nums">
                    {t("profile.per_month", {
                      amount: formatMoney(p.monthly_income, i18n.language),
                    })}
                  </span>
                )}
              </div>
            )}

            <Menu.LinkItem render={<Link href="/profile" />} className={ITEM}>
              <UserRound className="text-muted-foreground size-[18px]" aria-hidden />
              <span className="flex-1">{t("profile.open")}</span>
              <ChevronRight className="text-muted-foreground size-4" aria-hidden />
            </Menu.LinkItem>
            <Menu.LinkItem render={<Link href="/learn" />} className={ITEM}>
              <Award className="text-muted-foreground size-[18px]" aria-hidden />
              <span className="flex-1">{t("profile.badges")}</span>
              <ChevronRight className="text-muted-foreground size-4" aria-hidden />
            </Menu.LinkItem>
            {p?.role === "admin" && (
              <Menu.LinkItem render={<Link href="/admin" />} className={ITEM}>
                <ShieldCheck className="text-muted-foreground size-[18px]" aria-hidden />
                <span className="flex-1">{t("admin.open")}</span>
                <ChevronRight className="text-muted-foreground size-4" aria-hidden />
              </Menu.LinkItem>
            )}

            <Menu.Separator className="bg-border mx-2 my-1.5 h-px" />

            <Menu.Item
              onClick={() => void signOut()}
              className={cn(
                ITEM,
                "text-destructive data-[highlighted]:bg-negative-soft data-[highlighted]:text-destructive",
              )}
            >
              <LogOut className="size-[18px]" aria-hidden />
              {t("common.logout")}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
