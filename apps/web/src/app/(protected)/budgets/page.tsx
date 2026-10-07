import { redirect } from "next/navigation";

// Budgets now live under Plan; old links and bookmarks still work.
export default function Page() {
  redirect("/plan?tab=budgets");
}
