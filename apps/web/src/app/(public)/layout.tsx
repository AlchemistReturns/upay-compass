export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-md flex-1 px-4">{children}</main>;
}
