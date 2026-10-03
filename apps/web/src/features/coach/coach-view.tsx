"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Gauge,
  MessageCircleQuestion,
  Loader2,
  Mic,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  TrendingDown,
  Volume2,
  Wallet,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { detectReplyLanguage } from "@compass/shared";
import { useVoiceInput } from "@/features/voice/use-voice-input";
import { COACH_PREFILL_KEY } from "@/features/voice/voice-sheet";
import { useSpeechSynthesis } from "@/features/voice/use-speech-synthesis";
import { OfflineNote } from "@/features/pwa/offline-note";
import { useOnline } from "@/features/pwa/use-online";
import { PageHeader, TOOLBAR_BUTTON } from "@/components/page-header";
import { LoadingCards } from "@/components/compass";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm";
import { toast } from "@/components/toaster";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/features/auth/auth-provider";
import { useProfile } from "@/features/profile/use-profile";
import {
  useClearChat,
  useCoachChat,
  useCoachHistory,
  useGiveConsent,
  type CoachMessage,
} from "./use-coach";

const SUGGESTIONS = ["why_overspend", "can_afford", "improve_score", "money_last"] as const;
const SUGGESTION_ICON = {
  why_overspend: TrendingDown,
  can_afford: Wallet,
  improve_score: Gauge,
  money_last: MessageCircleQuestion,
} as const;

/** The coach's mark: a teal disc with a lime sparkle. */
function CoachMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "text-lime grid size-8 shrink-0 place-items-center rounded-full bg-[image:var(--gradient-teal)] shadow-[0_6px_14px_-8px_rgba(6,47,49,.8)]",
        className,
      )}
      aria-hidden
    >
      <Sparkles className="size-4" />
    </span>
  );
}

/** User messages are teal; coach answers are white cards, so the chat reads as part of the app. */
function Bubble({
  role,
  children,
  action,
}: {
  role: "user" | "assistant";
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const assistant = role === "assistant";
  return (
    <div className={cn("rise flex items-end gap-2.5", assistant ? "justify-start" : "justify-end")}>
      {assistant && <CoachMark />}
      <div
        className={cn(
          "max-w-[85%] px-4 py-3 text-[15px] leading-6 whitespace-pre-wrap sm:max-w-[75%]",
          assistant
            ? "finance-card rounded-[1.4rem] rounded-bl-md"
            : "text-on-dark rounded-[1.4rem] rounded-br-md bg-[image:var(--gradient-teal)] shadow-[0_10px_24px_-14px_rgba(6,47,49,.8)]",
        )}
      >
        {children}
        {action}
      </div>
    </div>
  );
}

/**
 * Suggested questions in one row. Arrow buttons scroll it (a mouse has no swipe); each arrow
 * shows only while there is more in that direction, and the edges fade to hint at hidden chips.
 */
function SuggestionSlider({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (question: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    // 2px slack for sub-pixel widths
    setEdges({
      start: el.scrollLeft <= 2,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
    });
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
    // chip widths change with the language even when the track's own size does not
  }, [measure, i18n.language]);

  function slide(direction: 1 | -1) {
    const el = track.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.7, behavior: "smooth" });
  }

  const fade =
    edges.start && edges.end
      ? undefined
      : `linear-gradient(to right, ${edges.start ? "#000" : "transparent"}, #000 2.5rem, #000 calc(100% - 2.5rem), ${edges.end ? "#000" : "transparent"})`;

  const arrow =
    "bg-card text-foreground tap hidden size-9 shrink-0 place-items-center rounded-full border border-hairline-strong shadow-sm sm:grid";

  return (
    <div className="flex items-center gap-1.5">
      {!edges.start && (
        <button
          type="button"
          className={arrow}
          aria-label={t("coach.suggest_prev")}
          onClick={() => slide(-1)}
        >
          <ChevronLeft className="ic-back size-4" aria-hidden />
        </button>
      )}
      <div
        ref={track}
        onScroll={measure}
        className="no-scrollbar flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto scroll-smooth py-0.5"
        style={{ maskImage: fade, WebkitMaskImage: fade }}
      >
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onPick(t(`coach.suggest_${s}`))}
            // keyboard users tabbing through still bring each chip into view
            onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })}
            className="bg-card/90 hover:bg-lime-soft tap min-h-11 shrink-0 snap-start rounded-full border border-hairline-strong px-4 text-[13px] font-semibold backdrop-blur disabled:opacity-50"
          >
            {t(`coach.suggest_${s}`)}
          </button>
        ))}
      </div>
      {!edges.end && (
        <button
          type="button"
          className={arrow}
          aria-label={t("coach.suggest_next")}
          onClick={() => slide(1)}
        >
          <ChevronRight className="ic-forward size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

function TypingDots() {
  const { t } = useTranslation();
  return (
    <span role="status" aria-label={t("coach.typing")} className="flex gap-1.5 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="bg-primary/55 size-2 rounded-full [animation:typing_1.2s_ease-in-out_infinite]"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </span>
  );
}

/** First visit to an empty chat: a greeting and the suggestions as big tappable cards. */
function Welcome({ disabled, onPick }: { disabled: boolean; onPick: (q: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="rise">
      <div className="flex flex-col items-center px-2 pt-2 pb-6 text-center">
        <CoachMark className="mb-4 size-16 [&_svg]:size-7" />
        <p className="text-muted-foreground max-w-sm text-[15px] leading-6">{t("coach.intro")}</p>
      </div>
      <p className="text-muted-foreground mb-2.5 px-1 text-xs font-bold tracking-wide uppercase">
        {t("coach.try_prompt")}
      </p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {SUGGESTIONS.map((s, i) => {
          const Icon = SUGGESTION_ICON[s];
          return (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => onPick(t(`coach.suggest_${s}`))}
              style={{ "--i": i + 1 } as React.CSSProperties}
              className="finance-card rise flex min-h-16 items-center gap-3 p-3.5 text-left text-sm font-semibold disabled:opacity-50"
            >
              <span className="icon-chip size-10 rounded-xl">
                <Icon className="size-[18px]" aria-hidden />
              </span>
              <span className="flex-1">{t(`coach.suggest_${s}`)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ConsentCard({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const consent = useGiveConsent();
  const items = [
    { key: "coach.consent_item_numbers", Icon: Check, tone: "bg-positive-soft text-positive" },
    { key: "coach.consent_item_goals", Icon: Check, tone: "bg-positive-soft text-positive" },
    { key: "coach.consent_item_never", Icon: EyeOff, tone: "bg-secondary text-primary" },
  ];
  return (
    <section className="finance-card rise mx-auto max-w-2xl overflow-hidden">
      <div className="balance-panel rounded-none p-6 shadow-none sm:p-8">
        <span className="bg-lime text-brand-ink mb-4 grid size-14 place-items-center rounded-[1.25rem]">
          <ShieldCheck className="size-7" aria-hidden />
        </span>
        <h2 className="text-2xl leading-tight font-extrabold tracking-tight">
          {t("coach.consent_title")}
        </h2>
        <p className="text-on-dark-muted mt-2 text-sm leading-6">{t("coach.consent_sends")}</p>
      </div>
      <div className="p-5 sm:p-7">
        <ul className="space-y-3.5 text-sm leading-6">
          {items.map(({ key, Icon, tone }) => (
            <li key={key} className="flex gap-3">
              <span
                className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", tone)}
              >
                <Icon className="size-3.5" strokeWidth={2.5} aria-hidden />
              </span>
              {t(key)}
            </li>
          ))}
        </ul>
        <p className="callout mt-5 text-xs leading-5">{t("coach.consent_how")}</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onDone}>
            {t("coach.consent_decline")}
          </Button>
          <Button
            className="sm:min-w-40"
            loading={consent.isPending}
            onClick={() => consent.mutate()}
          >
            {t("coach.consent_accept")}
          </Button>
        </div>
        {consent.isError && (
          <p role="alert" className="text-destructive mt-3 text-sm">
            {t("common.error")}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * "Listen" under a coach answer. Hidden when this browser has no voice for the answer's language
 * (for example Bangla on a desktop with English voices only), rather than showing a dead button.
 */
function ListenButton({
  id,
  text,
  appLang,
  tts,
}: {
  id: string;
  text: string;
  appLang: "bn" | "en";
  tts: ReturnType<typeof useSpeechSynthesis>;
}) {
  const { t } = useTranslation();
  // an answer is in the language of the question; the app language only breaks a tie
  const lang = detectReplyLanguage(text, appLang);
  if (!tts.canSpeak(lang)) return null;
  const speaking = tts.speakingId === id;
  return (
    <button
      type="button"
      aria-pressed={speaking}
      aria-label={speaking ? t("coach.stop_listening") : t("coach.listen")}
      onClick={() => (speaking ? tts.stop() : tts.speak(text, id, lang))}
      className="text-primary mt-2 -mb-1 flex min-h-11 items-center gap-1.5 text-[13px] font-semibold"
    >
      {speaking ? (
        <Square className="size-3.5" fill="currentColor" aria-hidden />
      ) : (
        <Volume2 className="size-4" aria-hidden />
      )}
      {speaking ? t("coach.stop_listening") : t("coach.listen")}
    </button>
  );
}

export function CoachView() {
  const { t, i18n } = useTranslation();
  const appLang = i18n.language === "bn" ? "bn" : "en";
  const online = useOnline();
  const { userId } = useAuth();
  const profile = useProfile(userId);
  const history = useCoachHistory();
  const clear = useClearChat();
  const chat = useCoachChat();
  const [text, setText] = useState("");
  const [declined, setDeclined] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();
  const tts = useSpeechSynthesis();
  const stt = useVoiceInput({
    lang: appLang,
    onTranscript: (spoken) => setText(spoken),
    onProblem: (problem) =>
      toast.error(
        t(
          // "network" from the browser usually means its speech service could not be reached, not
          // that the device is offline; only say "no internet" when the browser agrees
          problem === "network" && navigator.onLine
            ? "coach.voice_problem_service"
            : `coach.voice_problem_${problem}`,
        ),
      ),
  });

  async function clearChat() {
    const ok = await confirm({ title: t("coach.clear_confirm"), confirmLabel: t("coach.clear") });
    if (!ok) return;
    clear.mutate(undefined, {
      onSuccess: () => toast.success(t("coach.toast_cleared")),
      onError: () => toast.error(t("common.error")),
    });
  }

  const consented = Boolean(profile.data?.coach_consent_at);
  const messages: CoachMessage[] = history.data ?? [];
  const busy = chat.status !== "idle";
  const empty = messages.length === 0 && !chat.pending;

  useEffect(() => {
    if (empty) return;
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, chat.pending?.answer, chat.status, empty]);

  // A question spoken or typed in the voice sheet arrives here: ask it once the coach is ready.
  const prefillTaken = useRef(false);
  useEffect(() => {
    if (prefillTaken.current || !profile.isSuccess) return;
    let question: string | null = null;
    try {
      question = sessionStorage.getItem(COACH_PREFILL_KEY);
      if (question) sessionStorage.removeItem(COACH_PREFILL_KEY);
    } catch {
      // ignore
    }
    prefillTaken.current = true;
    if (!question) return;
    if (profile.data?.coach_consent_at) void chat.send(question);
    else setText(question);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.isSuccess]);

  // A new question or a new answer ends any reading aloud.
  useEffect(() => {
    if (chat.status !== "idle") tts.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.status]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    stt.stop();
    tts.stop();
    setText("");
    haptic("light");
    void chat.send(value);
  }

  return (
    <>
      <PageHeader
        title={t("coach.title")}
        subtitle={t("coach.assistant_tagline")}
        actions={
          consented &&
          messages.length > 0 && (
            <button
              type="button"
              className={TOOLBAR_BUTTON}
              aria-label={t("coach.clear")}
              title={t("coach.clear")}
              disabled={clear.isPending || busy}
              onClick={() => void clearChat()}
            >
              <Trash2 className="ic-delete size-[18px]" aria-hidden />
            </button>
          )
        }
      />

      {profile.isPending && <LoadingCards rows={2} />}

      {profile.isSuccess && !consented && !declined && (
        <ConsentCard onDone={() => setDeclined(true)} />
      )}
      {profile.isSuccess && !consented && declined && (
        <p className="finance-card text-muted-foreground mx-auto max-w-2xl p-5 text-sm leading-6">
          {t("coach.declined")}
        </p>
      )}

      {profile.isSuccess && consented && (
        <div className="mx-auto w-full max-w-2xl">
          <p className="callout mb-5 items-center text-xs font-medium">
            <ShieldCheck className="size-4 shrink-0" aria-hidden />
            {t("coach.context_line")}
          </p>

          {/* room at the bottom for the docked composer */}
          <div
            className="flex flex-col gap-4 pb-52 lg:pb-40"
            role="log"
            aria-live="polite"
            aria-label={t("coach.title")}
          >
            {empty && <Welcome disabled={busy || !online} onPick={(q) => void chat.send(q)} />}

            {messages.map((m) => (
              <Bubble
                key={m.id}
                role={m.role}
                action={
                  m.role === "assistant" ? (
                    <ListenButton id={m.id} text={m.content} appLang={appLang} tts={tts} />
                  ) : undefined
                }
              >
                {m.content}
              </Bubble>
            ))}
            {chat.pending && (
              <>
                <Bubble role="user">{chat.pending.question}</Bubble>
                <Bubble role="assistant">{chat.pending.answer || <TypingDots />}</Bubble>
              </>
            )}
            {chat.error && (
              <div role="alert" className="finance-card ml-10 p-4 text-sm">
                <p className="mb-3">
                  {chat.error === "rate_limited" ? t("coach.rate_limited") : t("coach.failed")}
                </p>
                {chat.error === "failed" && (
                  <Button size="sm" onClick={chat.retry}>
                    {t("common.retry")}
                  </Button>
                )}
              </div>
            )}
            <div ref={bottom} />
          </div>

          {/* Composer docked just above the floating tab bar (or the page bottom on desktop) */}
          <div className="composer-dock from-background via-background/92 fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+var(--nav-gap)+var(--nav-h)+0.25rem)] z-30 bg-gradient-to-t to-transparent px-3 pt-8 pb-2 lg:bottom-0 lg:left-[var(--sidebar-w)] lg:px-10 lg:pb-6">
            <div className="mx-auto max-w-2xl space-y-2">
              {!empty && (
                <SuggestionSlider disabled={busy || !online} onPick={(q) => void chat.send(q)} />
              )}
              <form
                onSubmit={submit}
                className="glass focus-within:ring-ring/30 flex items-center gap-2 rounded-full p-1.5 pl-5 transition-shadow focus-within:ring-4"
              >
                <input
                  aria-label={t("coach.input_label")}
                  placeholder={
                    stt.state === "listening" ? t("coach.listening") : t("coach.input_placeholder")
                  }
                  maxLength={1000}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={busy}
                  className="placeholder:text-muted-foreground/80 h-11 min-w-0 flex-1 bg-transparent text-base outline-none disabled:opacity-60"
                />
                {stt.supported && (
                  <button
                    type="button"
                    aria-pressed={stt.state === "listening"}
                    aria-busy={stt.state === "processing"}
                    aria-label={
                      stt.state === "listening" ? t("coach.mic_stop") : t("coach.mic_start")
                    }
                    title={stt.state === "listening" ? t("coach.mic_stop") : t("coach.mic_start")}
                    disabled={busy || !online || stt.state === "processing"}
                    onClick={() => (stt.state === "listening" ? void stt.stop() : stt.start())}
                    className={cn(
                      "tap grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-35",
                      stt.state === "listening"
                        ? "bg-destructive text-white"
                        : "bg-secondary text-primary hover:bg-secondary/70",
                    )}
                  >
                    {stt.state === "listening" ? (
                      <Square className="size-4" fill="currentColor" aria-hidden />
                    ) : stt.state === "processing" ? (
                      <Loader2 className="size-5 animate-spin" aria-hidden />
                    ) : (
                      <Mic className="size-5" aria-hidden />
                    )}
                  </button>
                )}
                <button
                  type="submit"
                  aria-label={t("coach.send")}
                  title={t("coach.send")}
                  // shrinks back while there is nothing to send, springs up as soon as there is
                  className="bg-brand-deep text-lime hover:bg-brand-ink tap grid size-11 shrink-0 place-items-center rounded-full disabled:scale-[.82] disabled:opacity-35"
                  disabled={busy || !online || !text.trim()}
                >
                  <ArrowUp className="ic-up size-5" strokeWidth={2.5} aria-hidden />
                </button>
              </form>
              <OfflineNote />
              {stt.state !== "idle" && (
                <p role="status" className="text-primary text-center text-xs font-semibold">
                  {stt.state === "processing"
                    ? t("coach.processing")
                    : stt.elapsed > 0
                      ? t("coach.recording", { seconds: stt.elapsed })
                      : t("coach.listening")}
                </p>
              )}
              <p className="text-muted-foreground text-center text-[11px] leading-4">
                {t("coach.disclaimer")}
              </p>
              {stt.supported && (
                <p className="text-muted-foreground text-center text-[11px] leading-4">
                  {t("coach.voice_privacy")}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
