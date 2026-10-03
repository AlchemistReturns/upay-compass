"use client";

import { Guard } from "@/features/auth/guard";
import { OnboardingWizard } from "@/features/onboarding/onboarding-wizard";

export default function OnboardingPage() {
  return (
    <Guard own="needs-onboarding">
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-8">
        <OnboardingWizard />
      </main>
    </Guard>
  );
}
