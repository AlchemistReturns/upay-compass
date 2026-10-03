import { Guard } from "@/features/auth/guard";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <Guard own="signed-out" optimistic>
      {/* edge to edge on phones; a floating card from sm up */}
      <main className="mx-auto flex w-full flex-1 items-center sm:px-8 sm:py-8">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </Guard>
  );
}
