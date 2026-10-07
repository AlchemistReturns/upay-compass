"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MicIcon } from "./mic-icon";
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
        <MicIcon className="size-[22px]" />
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
        <MicIcon className="size-5" />
        {t("start.try_voice")}
      </button>
      <VoiceSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

/** The coach has its own microphone in the chat box, so the floating one stays off there. */
const NO_FAB_PAGES = ["/coach"];

/**
 * A floating microphone on every signed-in screen except the coach, so adding by voice is one
 * thumb-tap away wherever the person is.
 */
export function VoiceFab() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (NO_FAB_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  return (
    <>
      <button
        type="button"
        aria-label={t("voice.open")}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="tab-bar bg-lime text-brand-ink ring-background/90 fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+var(--nav-gap)+var(--nav-h)+0.75rem)] z-30 grid size-14 place-items-center rounded-full shadow-[0_14px_28px_-10px_rgba(255,194,14,.75),var(--shadow-float)] ring-4 transition-transform active:scale-95 lg:right-8 lg:bottom-8"
      >
        <MicIcon className="size-7" />
      </button>
      <VoiceSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
