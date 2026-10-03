"use client";

import { useTranslation } from "react-i18next";
import { LANGUAGE_STORAGE_KEY, type Language } from "@/i18n";
import { useAuth } from "@/features/auth/auth-provider";
import { useUpdateProfile } from "@/features/profile/use-profile";
import { cn } from "@/lib/utils";

/** Switch the app language: UI now, the saved choice on this device, and the profile once signed in. */
export function useSetLanguage() {
  const { i18n } = useTranslation();
  const { userId } = useAuth();
  const updateProfile = useUpdateProfile(userId);

  return (lng: Language) => {
    void i18n.changeLanguage(lng);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
    } catch {
      // storage unavailable; the choice just won't persist
    }
    // Keep the saved profile language in step once signed in (best effort).
    if (userId) updateProfile.mutate({ language: lng });
  };
}

/**
 * Shows the short code of the language it switches to (EN / বাং), so it is the same size in both
 * languages; the full name is in the accessible label. Default look is a round glass button.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const setLanguage = useSetLanguage();
  const next: Language = i18n.language === "bn" ? "en" : "bn";
  const label = `${t("language.label")}: ${t(`language.${next}`)}`;

  return (
    <button
      type="button"
      onClick={() => setLanguage(next)}
      aria-label={label}
      title={label}
      lang={next}
      className={cn(
        "glass hover:text-primary flex size-11 items-center justify-center rounded-full transition-colors",
        className,
        "text-[13px] leading-none font-bold",
      )}
    >
      {t(`language.short_${next}`)}
    </button>
  );
}
