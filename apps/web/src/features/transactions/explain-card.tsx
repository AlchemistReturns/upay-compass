"use client";

import { useQuery } from "@tanstack/react-query";
import { ScanSearch, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { explainTransaction, parseExplainRpc } from "@compass/shared";
import { SectionHeader } from "@/components/compass";
import { formatMoney } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-provider";
import { useCategories } from "@/features/categories/use-categories";
import type { TransactionRow } from "./types";

function useExplainFacts(id: string) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["transactions", userId, "explain", id],
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("transaction_explain", { p_id: id });
      if (error) throw error;
      return parseExplainRpc(data);
    },
  });
}

/**
 * "Why this decision": how the category was decided and whether the payment was flagged as unusual,
 * in plain sentences built from translation templates and the facts behind the decision. Nothing
 * here comes from a language model.
 */
export function ExplainCard({ tx }: { tx: TransactionRow }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const facts = useExplainFacts(tx.id);
  const { data: categories } = useCategories();

  if (facts.isPending || !facts.data) return null;
  const rpc = facts.data;
  const cat = categories?.find((c) => c.id === tx.category_id);
  const category = cat ? (lang === "bn" ? cat.name_bn : cat.name_en) : "";
  const merchant = tx.counterparty || t("transactions.unknown_merchant");
  const money = (n: number) => formatMoney(n, lang);

  const e = explainTransaction({
    tx,
    categoryKey: rpc.category_key,
    categorySource: rpc.category_source,
    needsReview: rpc.needs_review,
    userRuleKeyword: rpc.user_rule_keyword,
    anomaly: rpc.anomaly,
  });
  const c = e.categorization;

  const channelLabel = c.channel ? t(`explain.channel_${c.channel}`, { defaultValue: "" }) : "";
  const suggestedCat = c.suggested ? categories?.find((x) => x.key === c.suggested) : undefined;
  const suggested = suggestedCat
    ? lang === "bn"
      ? suggestedCat.name_bn
      : suggestedCat.name_en
    : "";
  const categoryKeyForText =
    c.kind === "model" && !c.factors?.length ? "explain.cat_model_plain" : `explain.cat_${c.kind}`;
  const categorySentence =
    c.kind === "channel" || c.kind === "channel_default"
      ? t(`explain.cat_${c.kind}`, { category, channel: channelLabel })
      : t(categoryKeyForText, {
          category,
          merchant, // a saved correction always applies to the whole merchant name
          keyword: c.keyword,
          factors: c.factors?.join(", "),
          suggested,
        });

  const a = e.anomaly;
  const anomalySentence = a
    ? a.rule === "new_counterparty"
      ? t("explain.anomaly_new", {
          merchant,
          amount: money(a.amount),
          category,
          typical: money(a.typical),
        })
      : t(a.bucket === "merchant" ? "explain.anomaly_merchant" : "explain.anomaly_weekday", {
          amount: money(a.amount),
          merchant,
          category,
          typical: money(a.typical),
          observations: a.observations,
          z: a.z ?? 0,
        })
    : null;

  return (
    <section aria-labelledby="explain-heading" className="mb-4" data-testid="explain-card">
      <SectionHeader id="explain-heading" title={t("explain.title")} />
      <div className="finance-card space-y-3 p-4">
        <p className="flex gap-3 text-sm leading-6">
          <Sparkles className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
          <span data-testid="explain-category">{categorySentence}</span>
        </p>
        {anomalySentence && (
          <p className="bg-warning-soft text-warning-ink flex gap-3 rounded-xl p-3 text-sm leading-6">
            <ScanSearch className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span data-testid="explain-anomaly">
              <strong>{t("explain.anomaly_title")}.</strong> {anomalySentence}
            </span>
          </p>
        )}
        <p className="text-muted-foreground text-xs leading-5">{t("explain.how")}</p>
      </div>
    </section>
  );
}
