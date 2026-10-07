import { Suspense } from "react";
import { PlanView } from "@/features/plan/plan-view";

export default function Page() {
  // useSearchParams needs a Suspense boundary
  return (
    <Suspense>
      <PlanView />
    </Suspense>
  );
}
