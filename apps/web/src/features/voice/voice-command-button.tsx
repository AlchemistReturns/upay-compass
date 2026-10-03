"use client";

import { useState } from "react";
import { Mic } from "lucide-react";
import { useTranslation } from "react-i18next";
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
