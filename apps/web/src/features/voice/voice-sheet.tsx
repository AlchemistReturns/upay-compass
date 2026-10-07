"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, SendHorizontal, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Sheet } from "@/components/sheet";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useOnline } from "@/features/pwa/use-online";
import { demoMark } from "@/features/demo/demo-timer";
import { CommandCard } from "./command-card";
import { CommandError, parseCommand, type CommandResult } from "./use-voice-command";
import { useRunCommand, type RunOutcome } from "./use-run-command";
import { useVoiceConsent } from "./use-voice-consent";
import { useVoiceInput } from "./use-voice-input";
import { MicIcon } from "./mic-icon";

type Ok = Extract<CommandResult, { status: "ok" }>;
type Step =
  | { kind: "ask" }
  | { kind: "parsing"; text: string }
  | { kind: "review"; result: Ok }
  | { kind: "refused"; text: string; reason: string }
  | { kind: "error"; message: string };

export const COACH_PREFILL_KEY = "compass.coach.prefill";

/**
 * Do things by voice: say or type a sentence, see what the app understood on a card, and confirm.
 * Nothing runs until the person taps the button on the card.
 */
export function VoiceSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const appLang = i18n.language === "bn" ? "bn" : "en";
  const router = useRouter();
  const online = useOnline();
  const consent = useVoiceConsent();
  const run = useRunCommand();
  const [step, setStep] = useState<Step>({ kind: "ask" });
  const [heard, setHeard] = useState("");
  const [typed, setTyped] = useState("");
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);

  async function submit(text: string) {
    const said = text.trim();
    if (!said) return;
    demoMark("spoke");
    setStep({ kind: "parsing", text: said });
    if (!(await consent.ensure())) {
      setStep({ kind: "ask" });
      return;
    }
    try {
      const result = await parseCommand(said, appLang);
      if (result.status === "rejected") {
        setStep({ kind: "refused", text: said, reason: result.reason });
      } else if (result.command.intent === "ask_coach") {
        demoMark("understood");
        try {
          sessionStorage.setItem(COACH_PREFILL_KEY, result.command.question);
        } catch {
          // the coach will just open empty
        }
        onOpenChange(false);
        router.push("/coach");
      } else {
        demoMark("understood");
        setStep({ kind: "review", result });
      }
    } catch (e) {
      const kind = e instanceof CommandError ? e.kind : "failed";
      setStep({ kind: "error", message: t(`voice.error_${kind}`) });
    }
  }

  const voice = useVoiceInput({
    lang: appLang,
    onTranscript: (text, final) => {
      setHeard(text);
      if (final) void submit(text);
    },
    onProblem: (problem) =>
      setStep({ kind: "error", message: t(`coach.voice_problem_${problem}`) }),
  });

  // Start fresh each time the sheet opens; stop listening when it closes.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the sheet when it opens
      setStep({ kind: "ask" });
      setHeard("");
      setTyped("");
    } else if (voice.state === "listening") {
      void voice.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function confirm(...args: Parameters<typeof run>) {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    try {
      const outcome = await run(...args);
      toast.success(
        doneMessage(outcome),
        outcome.undo
          ? {
              undo: {
                label: t("voice.undo"),
                onClick: () => void outcome.undo!().catch(() => toast.error(t("common.error"))),
              },
            }
          : undefined,
      );
      demoMark("confirmed");
      onOpenChange(false);
    } catch {
      toast.error(t("common.error"));
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }

  function doneMessage(o: RunOutcome): string {
    const amount = o.amount !== undefined ? formatMoney(o.amount, i18n.language) : "";
    return t(`voice.done_${o.kind}`, { amount });
  }

  const busy = step.kind === "parsing" || voice.state === "processing";
  const listening = voice.state === "listening";

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("voice.title")}
      description={step.kind === "ask" ? t("voice.hint") : undefined}
    >
      <div className="space-y-5 px-5 pt-2 pb-6 sm:px-6">
        {step.kind === "review" ? (
          <>
            <p className="text-muted-foreground text-sm" data-testid="voice-heard">
              {t("voice.you_said")}: “{step.result.transcript}”
            </p>
            <CommandCard
              key={JSON.stringify(step.result.command)}
              command={step.result.command as Exclude<Ok["command"], { intent: "ask_coach" }>}
              candidates={step.result.candidates ?? []}
              busy={running}
              onConfirm={(command, extra) => void confirm(command, extra)}
              onCancel={() => setStep({ kind: "ask" })}
            />
          </>
        ) : (
          <>
            {voice.supported && (
              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  aria-pressed={listening}
                  aria-label={listening ? t("coach.mic_stop") : t("voice.tap_to_speak")}
                  disabled={!online || busy}
                  onClick={() =>
                    listening
                      ? void voice.stop()
                      : (setHeard(""), setStep({ kind: "ask" }), voice.start())
                  }
                  className={cn(
                    "tap grid size-20 place-items-center rounded-full text-white shadow-lg transition-colors disabled:opacity-45",
                    listening ? "bg-destructive animate-pulse" : "bg-brand-deep text-lime",
                  )}
                >
                  {busy ? (
                    <Loader2 className="size-8 animate-spin" aria-hidden />
                  ) : listening ? (
                    <Square className="size-7" fill="currentColor" aria-hidden />
                  ) : (
                    <MicIcon className="size-10" />
                  )}
                </button>
                <p role="status" className="text-muted-foreground min-h-5 text-center text-sm">
                  {busy
                    ? t("voice.understanding")
                    : listening
                      ? heard ||
                        (voice.elapsed > 0
                          ? t("coach.recording", { seconds: voice.elapsed })
                          : t("coach.listening"))
                      : !online
                        ? t("pwa.offline_write")
                        : t("voice.tap_to_speak")}
                </p>
              </div>
            )}

            {step.kind === "refused" && (
              <div
                role="alert"
                className="finance-card space-y-1 p-4 text-sm"
                data-testid="voice-refused"
              >
                <p className="text-muted-foreground">
                  {t("voice.you_said")}: “{step.text}”
                </p>
                <p className="font-semibold">
                  {t(`voice.refused_${step.reason}`, { defaultValue: t("voice.refused_unclear") })}
                </p>
              </div>
            )}
            {step.kind === "error" && (
              <p
                role="alert"
                className="finance-card p-4 text-sm font-semibold"
                data-testid="voice-error"
              >
                {step.message}
              </p>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const value = typed;
                setTyped("");
                void submit(value);
              }}
              className="flex gap-2"
            >
              <Input
                aria-label={t("voice.type_label")}
                placeholder={t("voice.type_placeholder")}
                maxLength={500}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={busy || !online}
              />
              <Button
                type="submit"
                size="icon"
                aria-label={t("voice.send")}
                disabled={busy || !online || !typed.trim()}
              >
                <SendHorizontal aria-hidden />
              </Button>
            </form>
            <p className="text-muted-foreground text-xs leading-5">{t("voice.privacy")}</p>
          </>
        )}
      </div>
    </Sheet>
  );
}
