"use client";

import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  lang?: string;
  /** how the icon arrives when its option is chosen; a small spring pop by default */
  iconMotion?: string;
};

/**
 * iOS segmented control: a raised thumb that springs to the chosen option. A radio group, so
 * arrow keys and screen readers treat it as one choice. `onSelect` gets the tapped button too,
 * for effects that start from it (the theme reveal).
 */
export function Segmented<T extends string>({
  value,
  options,
  onSelect,
  label,
  size = "default",
  className,
}: {
  value: T;
  options: readonly SegmentOption<T>[];
  onSelect: (value: T, target: HTMLButtonElement) => void;
  label: string;
  size?: "default" | "sm";
  className?: string;
}) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    const buttons = e.currentTarget.parentElement?.querySelectorAll("button");
    const target = buttons?.[next];
    if (target) {
      target.focus();
      onSelect(options[next]!.value, target);
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("bg-segment relative grid rounded-full p-1", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="bg-thumb absolute top-1 bottom-1 left-1 rounded-full shadow-[var(--shadow-thumb)] transition-[translate] duration-500 ease-[var(--ease-spring)]"
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          translate: `${index * 100}% 0`,
        }}
      />
      {options.map((o, i) => {
        const active = i === index;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            lang={o.lang}
            onKeyDown={onKeyDown}
            onClick={(e) => {
              if (active) return;
              haptic("light");
              onSelect(o.value, e.currentTarget);
            }}
            className={cn(
              "tap relative z-[1] flex min-w-0 items-center justify-center gap-1.5 rounded-full px-2 font-semibold",
              size === "sm" ? "min-h-10 text-[13px]" : "min-h-11 text-sm",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon && (
              <Icon
                // re-keyed so the icon gives one small turn when its option is chosen
                key={active ? "on" : "off"}
                className={cn("size-4 shrink-0", active && (o.iconMotion ?? "pop-spring"))}
                strokeWidth={active ? 2.3 : 1.9}
              />
            )}
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
