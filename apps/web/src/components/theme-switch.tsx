"use client";

import { Moon, MonitorSmartphone, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Segmented } from "@/components/segmented";
import { setTheme, useTheme, type ThemePreference } from "@/lib/theme";

/**
 * Appearance: Auto / Light / Dark. The sun turns as it comes up, the moon tilts in; the new
 * theme washes over the page from the tapped option.
 */
export function ThemeSwitch({ size, className }: { size?: "default" | "sm"; className?: string }) {
  const { t } = useTranslation();
  const { preference } = useTheme();
  return (
    <Segmented<ThemePreference>
      label={t("appearance.title")}
      value={preference}
      size={size}
      className={className}
      onSelect={(next, target) => {
        const r = target.getBoundingClientRect();
        setTheme(next, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
      }}
      options={[
        { value: "system", label: t("appearance.system"), icon: MonitorSmartphone },
        { value: "light", label: t("appearance.light"), icon: Sun, iconMotion: "ic-spin-in" },
        { value: "dark", label: t("appearance.dark"), icon: Moon, iconMotion: "moon-in" },
      ]}
    />
  );
}
