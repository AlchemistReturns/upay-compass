"use client";

import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageToggle } from "@/components/language-toggle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";

export function PageHeader({ title }: { title: string }) {
  const { t } = useTranslation();
  const { session, signOut } = useAuth();

  return (
    <header className="flex items-center justify-between py-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="flex items-center gap-2">
        <LanguageToggle />
        {session && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("common.logout")}
            onClick={() => void signOut()}
          >
            <LogOut className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    </header>
  );
}
