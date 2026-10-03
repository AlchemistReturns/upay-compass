"use client";

import { cn } from "@/lib/utils";
import { FIELD } from "@/components/ui/input";

/** Amount field: a large, tabular number with a fixed ৳ in front. Keeps digits (and one dot if `decimal`). */
export function MoneyInput({
  id,
  value,
  onChange,
  decimal = false,
  autoFocus,
  size = "default",
  placeholder = "0",
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  decimal?: boolean;
  autoFocus?: boolean;
  size?: "default" | "lg";
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <span
        aria-hidden
        className={cn(
          "text-muted-foreground pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 font-bold",
          size === "lg" ? "text-2xl" : "text-lg",
        )}
      >
        ৳
      </span>
      <input
        id={id}
        inputMode={decimal ? "decimal" : "numeric"}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={(e) =>
          onChange(
            decimal
              ? e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1")
              : e.target.value.replace(/\D/g, ""),
          )
        }
        className={cn(
          FIELD,
          "num font-bold",
          size === "lg"
            ? "h-16 pl-11 text-[1.75rem] md:text-[1.75rem]"
            : "pl-10 text-lg md:text-lg",
        )}
      />
    </div>
  );
}
