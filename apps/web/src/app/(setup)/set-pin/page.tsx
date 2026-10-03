"use client";

import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { Guard } from "@/features/auth/guard";
import { SetPinForm } from "@/features/auth/pin-forms";

export default function SetPinPage() {
  const { t } = useTranslation();
  return (
    <Guard own="needs-pin">
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-8">
        <PageHeader title={t("pin.title")} />
        <div className="finance-card p-6 sm:p-8">
          <span className="from-brand-deep to-primary mb-5 grid size-12 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-[var(--shadow-raised)]">
            <ShieldCheck className="size-6" aria-hidden />
          </span>
          <SetPinForm />
        </div>
      </main>
    </Guard>
  );
}
