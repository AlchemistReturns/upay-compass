"use client";

import { useTranslation } from "react-i18next";
import data from "./usability-data.json";

const TASK_KEYS = [
  "addPayment",
  "askCoach",
  "setBudget",
  "createGoal",
  "addToGoal",
  "startDps",
] as const;

function Card({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="finance-card rise p-4 sm:p-5">
      <h3 className="text-base font-bold">{title}</h3>
      <p className="text-muted-foreground mt-1 mb-3 text-xs leading-5 sm:text-sm">{note}</p>
      <div className="-mx-1 overflow-x-auto px-1">{children}</div>
    </section>
  );
}

const TH = "text-muted-foreground px-2 py-2 text-start text-xs font-semibold sm:text-sm";
const TD = "px-2 py-2.5 text-sm tabular-nums sm:text-base";
const ROW = "border-hairline-strong border-t";

/** Two read-only tables from the JSON the ux scripts write (pnpm ux:tasks, pnpm ux:personas). */
export function UsabilityEvidence() {
  const { t, i18n } = useTranslation();
  const { tasks, personas } = data;
  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language === "bn" ? "bn-BD" : "en-GB", {
      dateStyle: "medium",
      timeZone: "Asia/Dhaka",
    }).format(new Date(iso));
  const pct = (n: number) => `${n.toFixed(1)}%`;

  return (
    <div className="space-y-4">
      <h2 className="section-title px-1 pt-2">{t("usability.title")}</h2>

      <Card
        title={t("usability.tasks_title")}
        note={`${t("usability.tasks_note")} ${t("usability.generated", { date: date(tasks.generatedAt) })}`}
      >
        <table className="w-full min-w-[32rem]">
          <thead>
            <tr>
              <th className={TH}>{t("usability.col_task")}</th>
              <th className={TH}>{t("usability.col_mode")}</th>
              <th className={TH}>{t("usability.col_steps")}</th>
              <th className={TH}>{t("usability.col_reference")}</th>
              <th className={TH}>{t("usability.col_fewer")}</th>
            </tr>
          </thead>
          <tbody>
            {tasks.rows.map((r) => (
              <tr key={`${r.task}-${r.mode}`} className={ROW}>
                <td className={TD}>
                  {TASK_KEYS.includes(r.task as (typeof TASK_KEYS)[number])
                    ? t(`usability.task.${r.task}`)
                    : r.task}
                </td>
                <td className={TD}>{t(`usability.mode_${r.mode}`)}</td>
                <td className={TD}>{r.total}</td>
                <td className={TD}>{r.reference}</td>
                <td className={`${TD} font-bold`}>{r.fewerPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card
        title={t("usability.personas_title")}
        note={`${t("usability.personas_note")} ${t("usability.generated", { date: date(personas.generatedAt) })}`}
      >
        <table className="w-full min-w-[40rem]">
          <thead>
            <tr>
              <th className={TH}>{t("usability.col_persona")}</th>
              <th className={TH}>{t("usability.col_tap_done")}</th>
              <th className={TH}>{t("usability.col_voice_done")}</th>
              <th className={TH}>{t("usability.col_tap_steps")}</th>
              <th className={TH}>{t("usability.col_voice_steps")}</th>
              <th className={TH}>{t("usability.col_tap_errors")}</th>
              <th className={TH}>{t("usability.col_voice_errors")}</th>
            </tr>
          </thead>
          <tbody>
            <tr className={`${ROW} bg-muted/50 font-bold`}>
              <td className={TD}>{t("usability.all")}</td>
              <td className={TD}>{pct(personas.overall.tap.completionPct)}</td>
              <td className={TD}>{pct(personas.overall.voice.completionPct)}</td>
              <td className={TD}>{personas.overall.tap.avgSteps.toFixed(2)}</td>
              <td className={TD}>{personas.overall.voice.avgSteps.toFixed(2)}</td>
              <td className={TD}>{personas.overall.tap.avgErrors.toFixed(2)}</td>
              <td className={TD}>{personas.overall.voice.avgErrors.toFixed(2)}</td>
            </tr>
            {personas.personas.map((p) => (
              <tr key={p.id} className={ROW}>
                <td className={TD}>{t(`usability.persona.${p.id}`, { defaultValue: p.name })}</td>
                <td className={TD}>{pct(p.tap.completionPct)}</td>
                <td className={TD}>{pct(p.voice.completionPct)}</td>
                <td className={TD}>{p.tap.avgSteps.toFixed(2)}</td>
                <td className={TD}>{p.voice.avgSteps.toFixed(2)}</td>
                <td className={TD}>{p.tap.avgErrors.toFixed(2)}</td>
                <td className={TD}>{p.voice.avgErrors.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
