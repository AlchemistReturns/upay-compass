"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { BookOpen, Home, MessageCircle, PiggyBank, Target } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", key: "home", icon: Home },
  { href: "/budgets", key: "budgets", icon: PiggyBank },
  { href: "/goals", key: "goals", icon: Target },
  { href: "/coach", key: "coach", icon: MessageCircle },
  { href: "/learn", key: "learn", icon: BookOpen },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    // Floating pill, inset from the edges; the safe-area inset lifts it above the home indicator.
    <nav className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-20 px-3 sm:px-4">
      <ul className="glass mx-auto flex max-w-xl rounded-[1.6rem] px-1.5">
        {ITEMS.map(({ href, key, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex min-h-[4.25rem] flex-col items-center justify-center gap-1 text-[11px] transition-colors",
                  active
                    ? "text-brand-ink font-bold"
                    : "text-muted-foreground hover:text-foreground font-medium",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-12 items-center justify-center rounded-xl transition-colors",
                    active ? "bg-brand-ink text-white" : "group-hover:bg-muted",
                  )}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                </span>
                {t(`nav.${key}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
