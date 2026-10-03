"use client";

import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

/** iOS-style switch (a button with role="switch"); 44px tall hit area around a 32px track. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        haptic("light");
        onChange(!checked);
      }}
      className={cn(
        "group relative flex h-11 w-[3.25rem] shrink-0 items-center disabled:opacity-45",
        className,
      )}
    >
      <span
        className={cn(
          "absolute inset-x-0 h-8 rounded-full transition-colors duration-300",
          checked ? "bg-primary" : "bg-[#cfdcd3]",
        )}
      />
      <span
        className={cn(
          "absolute top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-white shadow-[0_2px_6px_rgba(6,47,49,.25)] transition-[left] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          checked ? "left-[calc(100%-1.875rem)]" : "left-0.5",
        )}
      >
        {checked && <span className="bg-lime size-2 rounded-full" />}
      </span>
    </button>
  );
}
