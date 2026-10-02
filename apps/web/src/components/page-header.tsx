"use client";

import { LanguageToggle } from "@/components/language-toggle";

export function PageHeader({ title }: { title: string }) {
  return (
    <header className="flex items-center justify-between py-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      <LanguageToggle />
    </header>
  );
}
