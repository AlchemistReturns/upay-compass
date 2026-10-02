"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
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

function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  return (
    <div className={cn("flex", role === "user" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap",
          role === "user"
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted rounded-bl-sm",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function TypingDots() {
  const { t } = useTranslation();
  return (
    <span role="status" aria-label={t("coach.typing")} className="flex gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="bg-muted-foreground/60 size-1.5 animate-bounce rounded-full"
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
    <section className="rounded-xl border p-4">
      <h2 className="mb-2 flex items-center gap-2 font-medium">
        <ShieldCheck className="size-5" aria-hidden />
        {t("coach.consent_title")}
      </h2>
      <p className="mb-2 text-sm">{t("coach.consent_sends")}</p>
      <ul className="mb-3 list-disc space-y-1 pl-5 text-sm">
        <li>{t("coach.consent_item_numbers")}</li>
        <li>{t("coach.consent_item_goals")}</li>
        <li>{t("coach.consent_item_never")}</li>
      </ul>
      <p className="text-muted-foreground mb-3 text-xs">{t("coach.consent_how")}</p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onDone}>
          {t("coach.consent_decline")}
        </Button>
        <Button className="flex-1" disabled={consent.isPending} onClick={() => consent.mutate()}>
          {t("coach.consent_accept")}
        </Button>
      </div>
      {consent.isError && (
        <p role="alert" className="text-destructive mt-2 text-sm">
          {t("common.error")}
        </p>
      )}
    </section>
  );
}

export function CoachView() {
  const { t } = useTranslation();
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
      <PageHeader title={t("coach.title")} />

      {profile.isPending && <p className="text-muted-foreground">{t("common.loading")}</p>}

      {profile.isSuccess && !consented && !declined && (
        <ConsentCard onDone={() => setDeclined(true)} />
      )}
      {profile.isSuccess && !consented && declined && (
        <p className="text-muted-foreground text-sm">{t("coach.declined")}</p>
      )}

      {profile.isSuccess && consented && (
        <div className="flex min-h-[calc(100dvh-13rem)] flex-col">
          <div className="flex-1 space-y-3 pb-3">
            {messages.length === 0 && !chat.pending && (
              <div className="text-muted-foreground space-y-2 text-sm">
                <p>{t("coach.intro")}</p>
              </div>
            )}

            {messages.map((m) => (
              <Bubble key={m.id} role={m.role}>
                {m.content}
              </Bubble>
            ))}

            {chat.pending && (
              <>
                <Bubble role="user">{chat.pending.question}</Bubble>
                <Bubble role="assistant">
                  {chat.pending.answer ? chat.pending.answer : <TypingDots />}
                </Bubble>
              </>
            )}

            {chat.error && (
              <div role="alert" className="rounded-lg border p-3 text-sm">
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

          <div className="bg-background sticky bottom-16 space-y-2 pt-2 pb-2">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={chat.status !== "idle"}
                  onClick={() => void chat.send(t(`coach.suggest_${s}`))}
                  className="shrink-0 rounded-full border px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  {t(`coach.suggest_${s}`)}
                </button>
              ))}
            </div>
            <form onSubmit={submit} className="flex gap-2">
              <Input
                aria-label={t("coach.input_label")}
                placeholder={t("coach.input_placeholder")}
                maxLength={1000}
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={chat.status !== "idle"}
                className="h-11"
              />
              <Button
                type="submit"
                className="h-11"
                disabled={chat.status !== "idle" || !text.trim()}
              >
                {t("coach.send")}
              </Button>
            </form>
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-[11px]">{t("coach.disclaimer")}</p>
              {messages.length > 0 && (
                <button
                  type="button"
                  disabled={clear.isPending || chat.status !== "idle"}
                  onClick={() => window.confirm(t("coach.clear_confirm")) && clear.mutate()}
                  className="text-muted-foreground shrink-0 text-[11px] underline"
                >
                  {t("coach.clear")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
