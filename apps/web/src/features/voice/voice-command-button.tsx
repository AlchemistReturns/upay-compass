"use client";

import { useState } from "react";
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
