"use client";

import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { Guard } from "@/features/auth/guard";
import { SetPinForm } from "@/features/auth/pin-forms";

export default function SetPinPage() {
  const { t } = useTranslation();
  return (
    <Guard own="needs-pin">
      <main className="mx-auto w-full max-w-md flex-1 px-4">
        <PageHeader title={t("pin.title")} />
        <SetPinForm />
      </main>
    </Guard>
  );
}
