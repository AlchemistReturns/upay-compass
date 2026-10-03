import * as React from "react";
import { cn } from "@/lib/utils";

/** Native <select>: best mobile behaviour, styled like Input. */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "border-input bg-card h-11 w-full rounded-xl border px-3 text-base outline-none md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3",
        className,
      )}
      {...props}
    />
  );
}
