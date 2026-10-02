import { BottomNav } from "@/components/bottom-nav";
import { Guard } from "@/features/auth/guard";
import { GamificationProvider } from "@/features/gamification/gamification-provider";

export default function ProtectedLayout({ children }: LayoutProps<"/">) {
  return (
    <Guard own="ready">
      <GamificationProvider>
        <main className="mx-auto w-full max-w-md flex-1 px-4 pb-20">{children}</main>
        <BottomNav />
      </GamificationProvider>
    </Guard>
  );
}
