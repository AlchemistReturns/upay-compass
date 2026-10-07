import { redirect } from "next/navigation";

// Goals now live under Plan; old links and bookmarks still work.
export default function Page() {
  redirect("/plan?tab=goals");
}
