import { cn } from "@/lib/utils";

/** A shimmering placeholder that holds a block's space while it loads, so the page does not jump. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "rounded-2xl bg-[var(--skeleton)] bg-[linear-gradient(100deg,transparent_30%,var(--skeleton-sheen)_50%,transparent_70%)] bg-[length:200%_100%] [animation:sheen_1.4s_ease-in-out_infinite] motion-reduce:[animation:none]",
        className,
      )}
    />
  );
}
