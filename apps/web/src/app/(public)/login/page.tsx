"use client";

import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { LoginForm } from "@/features/auth/login-form";

export default function LoginPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("login.title")} />
      <p className="text-muted-foreground mb-6 text-sm">{t("login.demo_note")}</p>
      <LoginForm />
    </>
  );
}
