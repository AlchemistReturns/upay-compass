"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { BookOpen, Home, MessageCircle, ReceiptText, Target } from "lucide-react";
import { NAV_TAB } from "@/components/page-transition";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/", key: "home", icon: Home },
  { href: "/transactions", key: "activity", icon: ReceiptText },
  { href: "/plan", key: "plan", icon: Target },
  { href: "/coach", key: "coach", icon: MessageCircle },
  { href: "/learn", key: "learn", icon: BookOpen },
] as const;

export function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const TYPING =
  "input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]), textarea, select, [contenteditable=true]";

/** Marks <html data-keyboard> while a text field has focus, so CSS can move the tab bar out of the way. */
function useKeyboardFlag() {
  useEffect(() => {
    const root = document.documentElement;
    const onIn = (e: FocusEvent) => {
      if (e.target instanceof Element && e.target.matches(TYPING)) root.dataset.keyboard = "";
    };
    const onOut = () => {
      // focus may be moving straight to another field
      requestAnimationFrame(() => {
        if (!document.activeElement?.matches(TYPING)) delete root.dataset.keyboard;
      });
    };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
      delete root.dataset.keyboard;
    };
  }, []);
}

/**
 * Floating dark tab bar for phones and tablets (the sidebar takes over on desktop).
 * A lime capsule slides to the active tab; every tab keeps a visible label.
 */
export function BottomNav() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const index = NAV_ITEMS.findIndex(({ href }) => isActivePath(pathname, href));
  useKeyboardFlag();

  return (
    <nav
      aria-label={t("nav.label")}
      data-vt="tab-bar"
      className="tab-bar fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+var(--nav-gap))] z-40 px-3 transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] lg:hidden"
    >
      <div className="bg-card ring-hairline-strong relative mx-auto max-w-md rounded-[1.75rem] p-1.5 shadow-[var(--shadow-float)] ring-1">
        <span
          aria-hidden
          className={cn(
            "bg-secondary absolute top-1.5 bottom-1.5 left-1.5 w-[calc((100%-0.75rem)/5)] rounded-[1.35rem] transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
            index < 0 && "opacity-0",
          )}
          style={{ transform: `translateX(${Math.max(index, 0) * 100}%)` }}
        />
        <ul className="relative flex">
          {NAV_ITEMS.map(({ href, key, icon: Icon }, i) => {
            const active = i === index;
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  transitionTypes={NAV_TAB}
                  aria-current={active ? "page" : undefined}
                  onClick={() => !active && haptic("light")}
                  className={cn(
                    "flex h-[3.625rem] flex-col items-center justify-center gap-1 rounded-[1.35rem] text-[11px] leading-none font-semibold transition-[color,transform] duration-300 active:scale-90 active:duration-100",
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon
                    // re-keyed on activation so the icon gives one small pop when its tab is chosen
                    key={active ? "on" : "off"}
                    className={cn("size-[21px]", active && "pop")}
                    strokeWidth={active ? 2.3 : 1.8}
                    aria-hidden
                  />
                  <span className="max-w-full truncate px-1">{t(`nav.${key}`)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
