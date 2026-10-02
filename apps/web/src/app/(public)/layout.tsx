import { Guard } from "@/features/auth/guard";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <Guard own="signed-out">
      <main className="mx-auto w-full max-w-md flex-1 px-4">{children}</main>
    </Guard>
  );
}
