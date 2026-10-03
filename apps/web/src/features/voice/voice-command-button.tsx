"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Mic } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { VoiceSheet } from "./voice-sheet";

/** The microphone in the header: opens the voice command sheet from any screen. */
export function VoiceCommandButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={t("voice.open")}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Mic className="size-[20px]" strokeWidth={1.9} aria-hidden />
      </button>
      <VoiceSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

/** A labelled button that opens the same sheet, for places that invite the person to try voice. */
export function VoiceTryButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={cn(
          "bg-secondary text-primary inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold",
          className,
        )}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Mic className="size-4" strokeWidth={2} aria-hidden />
        {t("start.try_voice")}
      </button>
      <VoiceSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

const FAB_PAGES = ["/", "/transactions"];

/**
 * A floating microphone for the two screens where people record money (Home and the payments
 * list), so adding by voice is one thumb-tap away. Other screens keep the header microphone.
 */
export function VoiceFab() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (!FAB_PAGES.includes(pathname)) return null;
  return (
    <>
      <button
        type="button"
        aria-label={t("voice.open")}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="tab-bar bg-lime text-primary fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+var(--nav-gap)+var(--nav-h)+0.75rem)] z-30 grid size-14 place-items-center rounded-full shadow-[var(--shadow-float)] transition-transform active:scale-95 lg:right-8 lg:bottom-8"
      >
        <Mic className="size-6" strokeWidth={2} aria-hidden />
      </button>
      <VoiceSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
