"use client";

import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LANGUAGE_STORAGE_KEY, type Language } from "@/i18n";
import { useAuth } from "@/features/auth/auth-provider";
import { useUpdateProfile } from "@/features/profile/use-profile";

export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const { userId } = useAuth();
  const updateProfile = useUpdateProfile(userId);
  const next: Language = i18n.language === "bn" ? "en" : "bn";

  function toggle() {
    void i18n.changeLanguage(next);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // storage unavailable; the choice just won't persist
    }
    // Keep the saved profile language in step once signed in (best effort).
    if (userId) updateProfile.mutate({ language: next });
  }

  return (
    <Button variant="outline" size="sm" onClick={toggle} aria-label={t("language.label")}>
      {t(`language.${next}`)}
    </Button>
  );
}
