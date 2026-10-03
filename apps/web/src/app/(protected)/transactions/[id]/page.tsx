"use client";

import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { TransactionForm } from "@/features/transactions/transaction-form";
import { useTransaction } from "@/features/transactions/use-transactions";

export default function EditTransactionPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const tx = useTransaction(id);

  return (
    <>
      <PageHeader title={t("transactions.edit")} back="/transactions" />
      {tx.isPending && <p className="text-muted-foreground">{t("common.loading")}</p>}
      {tx.isError && <p>{t("common.error")}</p>}
      {tx.isSuccess && !tx.data && <p>{t("transactions.not_found")}</p>}
      {tx.isSuccess && tx.data && <TransactionForm key={tx.data.id} existing={tx.data} />}
    </>
  );
}
