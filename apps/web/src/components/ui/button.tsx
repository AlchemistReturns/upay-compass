import type * as React from "react";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap tap [--tap-scale:0.965] outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(6,47,49,.18),0_8px_18px_-8px_rgba(13,75,76,.6)] hover:bg-[color-mix(in_oklch,var(--primary),var(--foreground)_16%)] dark:shadow-[0_8px_20px_-10px_rgba(147,216,194,.35)]",
        lime: "bg-lime text-brand-ink shadow-[0_8px_18px_-10px_rgba(79,158,58,.7)] hover:bg-[#b4e176]",
        outline: "border-border bg-card text-foreground hover:bg-muted aria-expanded:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--primary)_7%)] aria-expanded:bg-secondary",
        ghost: "text-foreground hover:bg-muted aria-expanded:bg-muted",
        destructive:
          "bg-negative-soft text-destructive hover:bg-[color-mix(in_oklch,var(--negative-soft),var(--destructive)_10%)] focus-visible:ring-destructive/25",
        onDark: "bg-white text-brand-ink hover:bg-[#ecf8da]",
        darkGhost: "bg-white/10 text-on-dark ring-1 ring-white/20 hover:bg-white/16",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-12 gap-2 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        xs: "h-7 gap-1 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-11 gap-1.5 px-4 text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-14 gap-2 px-6 text-base",
        icon: "size-11",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-11",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    /** shows a spinner in place of the label (keeping the width) and blocks presses */
    loading?: boolean;
  }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        buttonVariants({ variant, size, className }),
        loading && "relative disabled:opacity-80",
      )}
      {...props}
    >
      {loading ? (
        <>
          <span className="invisible contents">{children as React.ReactNode}</span>
          <span className="absolute inset-0 grid place-items-center" aria-hidden>
            <span className="size-[18px] animate-spin rounded-full border-2 border-current border-r-transparent" />
          </span>
        </>
      ) : (
        (children as React.ReactNode)
      )}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
