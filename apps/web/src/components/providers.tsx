"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n, { LANGUAGES, LANGUAGE_STORAGE_KEY, type Language } from "@/i18n";

function readStoredLanguage(): Language | null {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return LANGUAGES.find((l) => l === stored) ?? null;
  } catch {
    return null;
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );

  // Start in the default language for hydration parity, then apply the stored choice.
  useEffect(() => {
    const stored = readStoredLanguage();
    if (stored && stored !== i18n.language) void i18n.changeLanguage(stored);
    const sync = (lng: string) => {
      document.documentElement.lang = lng;
    };
    sync(i18n.language);
    i18n.on("languageChanged", sync);
    return () => i18n.off("languageChanged", sync);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </QueryClientProvider>
  );
}
