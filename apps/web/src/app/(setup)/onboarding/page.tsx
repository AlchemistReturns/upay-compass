"use client";

import { Guard } from "@/features/auth/guard";
import { OnboardingWizard } from "@/features/onboarding/onboarding-wizard";

export default function OnboardingPage() {
  return (
    <Guard own="needs-onboarding">
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">
        <OnboardingWizard />
      </main>
    </Guard>
  );
}
