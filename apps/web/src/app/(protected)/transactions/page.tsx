"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TransactionList } from "@/features/transactions/transaction-list";
import { useTransactionList } from "@/features/transactions/use-transactions";

export default function TransactionsPage() {
  const { t } = useTranslation();
  const list = useTransactionList(200);

  return (
    <>
      <PageHeader title={t("transactions.list_title")} />
      <div className="mb-3 flex gap-2">
        <Link href="/" className="text-primary min-h-11 min-w-11 content-center text-sm">
          {t("nav.home")}
        </Link>
        <Link href="/transactions/new" className={cn(buttonVariants(), "ml-auto h-11")}>
          {t("transactions.add")}
        </Link>
      </div>
      {list.isPending && <p className="text-muted-foreground">{t("common.loading")}</p>}
      {list.isError && <p>{t("common.error")}</p>}
      {list.isSuccess && list.data.length === 0 && (
        <p className="text-muted-foreground">{t("transactions.empty")}</p>
      )}
      {list.isSuccess && list.data.length > 0 && <TransactionList rows={list.data} />}
    </>
  );
}
