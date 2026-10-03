import { AppSidebar } from "@/components/app-sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { PageTransition } from "@/components/page-transition";
import { Guard } from "@/features/auth/guard";
import { VoiceFab } from "@/features/voice/voice-command-button";
import { GamificationProvider } from "@/features/gamification/gamification-provider";

export default function ProtectedLayout({ children }: LayoutProps<"/">) {
  return (
    <Guard own="ready">
      <GamificationProvider>
        <AppSidebar />
        {/* the @container lets the sticky page header bleed to the column edges */}
        <div className="@container flex w-full flex-1 flex-col lg:pl-[var(--sidebar-w)]">
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-36 sm:px-6 lg:px-10 lg:pb-16">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
        <VoiceFab />
        <BottomNav />
      </GamificationProvider>
    </Guard>
  );
}
