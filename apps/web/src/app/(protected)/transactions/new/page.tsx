"use client";

import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { TransactionForm } from "@/features/transactions/transaction-form";

export default function NewTransactionPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("transactions.add")} back="/" />
      <TransactionForm />
    </>
  );
}
