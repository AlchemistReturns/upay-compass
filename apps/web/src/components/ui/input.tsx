import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "cn";

/** Shared field look: tall, soft, mint-tinted until focused. Used by Input and NativeSelect. */
export const FIELD =
  "h-12 w-full min-w-0 rounded-2xl border border-input bg-[#fbfdfa] px-4 text-base text-foreground transition-[border-color,box-shadow,background-color] duration-150 outline-none placeholder:text-muted-foreground/80 hover:border-[color-mix(in_oklch,var(--input),var(--primary)_18%)] focus-visible:border-primary/60 focus-visible:bg-card focus-visible:ring-4 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/15 md:text-[15px]";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        FIELD,
        "py-1 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
