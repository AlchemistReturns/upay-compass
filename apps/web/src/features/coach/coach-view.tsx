"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Send, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OfflineNote } from "@/features/pwa/offline-note";
import { useOnline } from "@/features/pwa/use-online";
import { PageHeader, TOOLBAR_BUTTON } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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

/** The coach's mark: the same sparkle tile the dashboard's "Ask your coach" card uses. */
function CoachMark({ className }: { className?: string }) {
  return (
    <span className={cn("icon-chip size-8 rounded-[0.7rem]", className)} aria-hidden>
      <Sparkles className="size-4" />
    </span>
  );
}

/** User messages are filled blue; coach answers are app cards, so the chat reads as part of the app. */
function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  const assistant = role === "assistant";
  return (
    <div className={cn("flex items-end gap-2.5", assistant ? "justify-start" : "justify-end")}>
      {assistant && <CoachMark />}
      <div
        className={cn(
          "max-w-[85%] px-4 py-3 text-sm leading-6 whitespace-pre-wrap sm:max-w-[75%]",
          assistant
            ? "finance-card rounded-[1.25rem] rounded-bl-md"
            : "bg-primary text-primary-foreground rounded-[1.25rem] rounded-br-md",
        )}
      >
        {children}
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

  return (
    <div className="flex items-center gap-1.5">
      {!edges.start && (
        <Button
          variant="outline"
          size="icon"
          className="shrink-0 rounded-full"
          aria-label={t("coach.suggest_prev")}
          onClick={() => slide(-1)}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
      )}
      <div
        ref={track}
        onScroll={measure}
        className="flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto scroll-smooth py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
            className="glass hover:text-primary min-h-11 shrink-0 snap-start rounded-full px-4 shadow-none text-xs font-medium transition-colors disabled:opacity-50"
          >
            {t(`coach.suggest_${s}`)}
          </button>
        ))}
      </div>
      {!edges.end && (
        <Button
          variant="outline"
          size="icon"
          className="shrink-0 rounded-full"
          aria-label={t("coach.suggest_next")}
          onClick={() => slide(1)}
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      )}
    </div>
  );
}

function TypingDots() {
  const { t } = useTranslation();
  return (
    <span role="status" aria-label={t("coach.typing")} className="flex gap-1 py-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="bg-muted-foreground/50 size-1.5 animate-bounce rounded-full"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

function ConsentCard({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const consent = useGiveConsent();
  return (
    <section className="finance-card mx-auto max-w-2xl p-6 sm:p-8">
      <span className="icon-chip mb-4 size-12 rounded-2xl">
        <ShieldCheck className="size-6" aria-hidden />
      </span>
      <h2 className="text-xl font-bold">{t("coach.consent_title")}</h2>
      <p className="text-muted-foreground mt-1.5 text-sm leading-6">{t("coach.consent_sends")}</p>
      <ul className="my-5 space-y-3 text-sm leading-6">
        {["coach.consent_item_numbers", "coach.consent_item_goals", "coach.consent_item_never"].map(
          (key) => (
            <li key={key} className="flex gap-3">
              <span aria-hidden className="bg-primary mt-2.5 size-1.5 shrink-0 rounded-full" />
              {t(key)}
            </li>
          ),
        )}
      </ul>
      <p className="bg-secondary text-secondary-foreground mb-6 rounded-2xl p-4 text-xs leading-5">
        {t("coach.consent_how")}
      </p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onDone}>
          {t("coach.consent_decline")}
        </Button>
        <Button
          className="sm:min-w-40"
          disabled={consent.isPending}
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
    </section>
  );
}

export function CoachView() {
  const { t } = useTranslation();
  const online = useOnline();
  const { userId } = useAuth();
  const profile = useProfile(userId);
  const history = useCoachHistory();
  const clear = useClearChat();
  const chat = useCoachChat();
  const [text, setText] = useState("");
  const [declined, setDeclined] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const consented = Boolean(profile.data?.coach_consent_at);
  const messages: CoachMessage[] = history.data ?? [];
  const busy = chat.status !== "idle";

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, chat.pending?.answer, chat.status]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText("");
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
            <Button
              variant="ghost"
              size="icon"
              className={TOOLBAR_BUTTON}
              aria-label={t("coach.clear")}
              title={t("coach.clear")}
              disabled={clear.isPending || busy}
              onClick={() => window.confirm(t("coach.clear_confirm")) && clear.mutate()}
            >
              <Trash2 className="size-[18px]" aria-hidden />
            </Button>
          )
        }
      />

      {profile.isPending && (
        <p className="finance-card text-muted-foreground p-5">{t("common.loading")}</p>
      )}

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
          <p className="bg-secondary text-secondary-foreground mb-4 flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-xs font-medium">
            <ShieldCheck className="size-4 shrink-0" aria-hidden />
            {t("coach.context_line")}
          </p>

          {/* room at the bottom for the docked composer */}
          <div
            className="flex flex-col gap-4 pb-52"
            role="log"
            aria-live="polite"
            aria-label={t("coach.title")}
          >
            {messages.length === 0 && !chat.pending && (
              <Bubble role="assistant">{t("coach.intro")}</Bubble>
            )}

            {messages.map((m) => (
              <Bubble key={m.id} role={m.role}>
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
                <p className="mb-2">
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

          {/* Composer docked just above the floating nav, same width, radius and shadow as the nav */}
          <div className="from-background via-background/95 fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-10 bg-gradient-to-t to-transparent px-4 pt-6 pb-2">
            <div className="mx-auto max-w-xl space-y-2">
              <SuggestionSlider disabled={busy} onPick={(q) => void chat.send(q)} />
              <form
                onSubmit={submit}
                className="glass focus-within:ring-ring/40 flex items-center gap-2 rounded-[1.4rem] p-1.5 pl-4 focus-within:ring-3"
              >
                <Input
                  aria-label={t("coach.input_label")}
                  placeholder={t("coach.input_placeholder")}
                  maxLength={1000}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={busy}
                  className="h-11 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                />
                <Button
                  type="submit"
                  size="icon"
                  aria-label={t("coach.send")}
                  title={t("coach.send")}
                  className="bg-brand-ink hover:bg-brand-deep shrink-0 rounded-2xl shadow-none"
                  disabled={busy || !online || !text.trim()}
                >
                  <Send className="size-4" aria-hidden />
                </Button>
              </form>
              <OfflineNote />
              <p className="text-muted-foreground text-center text-[11px] leading-4">
                {t("coach.disclaimer")}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
