"use client";

import { useEffect, useState } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { I18nextProvider } from "react-i18next";
import { ConfirmProvider } from "@/components/confirm";
import { Toaster } from "@/components/toaster";
import { AuthProvider } from "@/features/auth/auth-provider";
import { LockProvider } from "@/features/auth/lock-provider";
import { PwaShell } from "@/features/pwa/pwa-shell";
import {
  OFFLINE_CACHE_MAX_AGE,
  queryPersister,
  shouldPersistQuery,
} from "@/features/pwa/offline-cache";
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
    () =>
      new QueryClient({
        // gcTime must be at least the persisted max age, or restored data is dropped at once
        defaultOptions: { queries: { staleTime: 30_000, retry: 1, gcTime: OFFLINE_CACHE_MAX_AGE } },
      }),
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
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: OFFLINE_CACHE_MAX_AGE,
        buster: "1",
        dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
      }}
    >
      <I18nextProvider i18n={i18n}>
        <AuthProvider>
          <LockProvider>
            <Toaster>
              <ConfirmProvider>
                <PwaShell />
                {children}
              </ConfirmProvider>
            </Toaster>
          </LockProvider>
        </AuthProvider>
      </I18nextProvider>
    </PersistQueryClientProvider>
  );
}
