"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CircleCheck, FileUp, Loader2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MAX_STATEMENT_BYTES } from "@compass/shared";
import { PageHeader } from "@/components/page-header";
import { MoneyInput } from "@/components/money-input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/auth-provider";
import { useProfile } from "@/features/profile/use-profile";
import { useOnline } from "@/features/pwa/use-online";
import {
  ImportError,
  useImportSources,
  useImportStatement,
  useSyncUpay,
  type ImportSummary,
} from "./use-import";

/** Plain-language message for an import problem; falls back to the generic error. */
function useImportMessage() {
  const { t } = useTranslation();
  return (error: unknown): string => {
    const code = error instanceof ImportError ? error.code : "unknown";
    const detail = error instanceof ImportError ? error.detail : "";
    const known = [
      "file_too_large",
      "no_rows",
      "too_many_rows",
      "missing_columns",
      "direction_unknown",
      "not_configured",
      "unauthorized",
      "not_found",
      "unavailable",
    ];
    if (code === "invalid_input" && known.includes(detail)) return t(`import.err_${detail}`);
    if (known.includes(code)) return t(`import.err_${code}`);
    return t("common.error");
  };
}

function Result({ summary }: { summary: ImportSummary }) {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const profile = useProfile(userId);
  // payments the rules could not place are only sent to the AI with the person's agreement
  const askConsent = summary.needs_review > 0 && profile.data && !profile.data.coach_consent_at;
  return (
    <section className="finance-card rise space-y-2 p-5" role="status">
      <h2 className="flex items-center gap-2 text-[17px] font-bold">
        <CircleCheck className="text-positive size-5" aria-hidden />
        {t("import.done")}
      </h2>
      <ul className="text-sm leading-6">
        <li>{t("import.r_inserted", { count: summary.inserted })}</li>
        {summary.duplicates > 0 && (
          <li>{t("import.r_duplicates", { count: summary.duplicates })}</li>
        )}
        {summary.rejected > 0 && <li>{t("import.r_rejected", { count: summary.rejected })}</li>}
        {summary.needs_review > 0 && (
          <li>{t("import.r_review", { count: summary.needs_review })}</li>
        )}
        {askConsent && (
          <li>
            <Link href="/coach" className="text-primary font-semibold underline">
              {t("import.r_review_consent")}
            </Link>
          </li>
        )}
      </ul>
      <Link href="/transactions" className={buttonVariants({ variant: "outline" })}>
        {t("import.see")}
      </Link>
    </section>
  );
}

export function ImportView() {
  const { t } = useTranslation();
  const online = useOnline();
  const message = useImportMessage();
  const sources = useImportSources();
  const importer = useImportStatement();
  const sync = useSyncUpay();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [opening, setOpening] = useState("");
  const [tooBig, setTooBig] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    const csv = await file.text();
    importer.mutate({ csv, ...(opening ? { openingBalance: Number(opening) } : {}) });
  }

  const busy = importer.isPending || sync.isPending;
  const result = importer.data ?? sync.data;
  const error = importer.error ?? sync.error;

  return (
    <>
      <PageHeader title={t("import.title")} back="/transactions" subtitle={t("import.subtitle")} />
      <div className="space-y-4 pb-4">
        {sources.data?.upay_api && (
          <section className="finance-card space-y-3 p-5" aria-labelledby="import-live">
            <h2 id="import-live" className="flex items-center gap-2 text-[17px] font-bold">
              <RefreshCw className="text-primary size-[18px]" aria-hidden />
              {t("import.live_title")}
            </h2>
            <p className="text-muted-foreground text-sm leading-6">{t("import.live_hint")}</p>
            <Button className="w-full" disabled={busy || !online} onClick={() => sync.mutate()}>
              {sync.isPending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <RefreshCw aria-hidden />
              )}
              {t("import.live_button")}
            </Button>
          </section>
        )}

        <form onSubmit={submit} className="finance-card space-y-4 p-5" aria-labelledby="import-csv">
          <h2 id="import-csv" className="flex items-center gap-2 text-[17px] font-bold">
            <FileUp className="text-primary size-[18px]" aria-hidden />
            {t("import.csv_title")}
          </h2>
          <p className="text-muted-foreground text-sm leading-6">{t("import.csv_hint")}</p>

          <div className="space-y-2">
            <Label htmlFor="import-file">{t("import.file")}</Label>
            <input
              ref={fileInput}
              id="import-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                const big = Boolean(f && f.size > MAX_STATEMENT_BYTES);
                setTooBig(big);
                setFile(big ? null : f);
                importer.reset();
              }}
              className="file:bg-secondary file:text-secondary-foreground block w-full text-sm file:mr-3 file:min-h-11 file:rounded-full file:border-0 file:px-4 file:text-sm file:font-semibold"
            />
            {tooBig && (
              <p role="alert" className="text-destructive text-sm font-medium">
                {t("import.err_file_too_large")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="import-opening">{t("import.opening")}</Label>
            <MoneyInput id="import-opening" value={opening} onChange={setOpening} decimal />
            <p className="text-muted-foreground text-xs leading-5">{t("import.opening_hint")}</p>
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={!file || busy || !online}>
            {importer.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {t("import.button")}
          </Button>
        </form>

        {error && (
          <p role="alert" className="text-destructive px-1 text-sm font-medium">
            {message(error)}
          </p>
        )}
        {result && <Result summary={result} />}

        <details className="finance-card p-5 text-sm leading-6">
          <summary className="cursor-pointer font-semibold">{t("import.format_title")}</summary>
          <p className="text-muted-foreground mt-2">{t("import.format_body")}</p>
          <pre className="bg-muted mt-3 overflow-x-auto rounded-xl p-3 text-xs">
            {
              "Date,Type,Amount,Name,Note\n2026-10-01 09:00,Credit,5000,Employer Ltd,salary\n2026-10-02 12:30,Debit,120,Rahim Tea Stall,"
            }
          </pre>
        </details>
      </div>
    </>
  );
}
