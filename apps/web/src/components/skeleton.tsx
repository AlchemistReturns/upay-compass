import { cn } from "@/lib/utils";

/** A pulsing placeholder that holds a block's space while it loads, so the page does not jump. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("bg-muted animate-pulse rounded-xl", className)} />;
}
