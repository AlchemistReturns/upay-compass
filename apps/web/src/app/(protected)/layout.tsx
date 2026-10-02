import { BottomNav } from "@/components/bottom-nav";

// Auth + PIN-lock guard lands in Phase 1.
export default function ProtectedLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-20">{children}</main>
      <BottomNav />
    </>
  );
}
