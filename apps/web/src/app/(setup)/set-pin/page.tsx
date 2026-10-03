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
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-10">
        <PageHeader title={t("pin.title")} />
        <div className="finance-card rise overflow-hidden">
          <div className="balance-panel flex items-center gap-4 rounded-none p-6 shadow-none">
            <span className="bg-lime text-brand-ink grid size-14 shrink-0 place-items-center rounded-[1.25rem]">
              <ShieldCheck className="size-7" aria-hidden />
            </span>
            <p className="text-on-dark-muted text-sm leading-6">{t("login.privacy_line")}</p>
          </div>
          <div className="p-6 sm:p-8">
            <SetPinForm />
          </div>
        </div>
      </main>
    </Guard>
  );
}
