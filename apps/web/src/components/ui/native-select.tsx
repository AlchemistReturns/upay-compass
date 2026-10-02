import * as React from "react";
import { cn } from "@/lib/utils";

/** Native <select>: best mobile behaviour, styled like Input. */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "border-input bg-background h-11 w-full rounded-lg border px-3 text-base outline-none",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3",
        className,
      )}
      {...props}
    />
  );
}
