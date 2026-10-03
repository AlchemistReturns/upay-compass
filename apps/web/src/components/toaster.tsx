"use client";

import { Toast } from "@base-ui/react/toast";
import { AlertCircle, Check, Info } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/** One manager for the whole app, so any code (mutations, handlers) can show feedback. */
const manager = Toast.createToastManager();

type ToastKind = "success" | "error" | "info";

function show(
  kind: ToastKind,
  title: string,
  opts?: { description?: string; undo?: { label: string; onClick: () => void } },
) {
  haptic(kind === "error" ? "warning" : kind === "success" ? "success" : "light");
  return manager.add({
    title,
    description: opts?.description,
    type: kind,
    priority: kind === "error" ? "high" : "low",
    timeout: opts?.undo ? 6000 : 3200,
    actionProps: opts?.undo ? { children: opts.undo.label, onClick: opts.undo.onClick } : undefined,
  });
}

export const toast = {
  success: (title: string, opts?: Parameters<typeof show>[2]) => show("success", title, opts),
  error: (title: string, opts?: Parameters<typeof show>[2]) => show("error", title, opts),
  info: (title: string, opts?: Parameters<typeof show>[2]) => show("info", title, opts),
};

const ICON = {
  // each kind arrives its own way: success draws its tick, an error shakes, info just appears
  success: { Icon: Check, cls: "bg-lime text-brand-ink", motion: "ic-draw" },
  error: { Icon: AlertCircle, cls: "bg-[#ff9b7d] text-[#3d0f05]", motion: "ic-shake" },
  info: { Icon: Info, cls: "bg-white/15 text-on-dark", motion: "pop-spring" },
} as const;

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((t) => {
    const { Icon, cls, motion } = ICON[(t.type as ToastKind) ?? "info"] ?? ICON.info;
    return (
      <Toast.Root
        key={t.id}
        toast={t}
        swipeDirection={["up", "left", "right"]}
        className={cn(
          "absolute inset-x-0 top-0 mx-auto w-fit max-w-full origin-top select-none",
          "[transform:translate(var(--toast-swipe-movement-x),var(--toast-swipe-movement-y))] transition-[transform,opacity,filter] duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
          "data-starting-style:[transform:translateY(-130%)_scale(.92)] data-starting-style:opacity-0",
          "data-ending-style:[transform:translateY(-130%)_scale(.92)] data-ending-style:opacity-0 data-ending-style:duration-300",
          "data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-120%))]",
          "data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+120%))]",
          "data-limited:opacity-0 data-limited:[transform:translateY(-40%)_scale(.94)] data-limited:blur-[2px]",
        )}
      >
        <Toast.Content className="text-on-dark flex min-h-12 items-center gap-2.5 rounded-full border border-white/10 bg-[rgba(6,47,49,.86)] dark:bg-[rgba(36,54,55,.86)] dark:border-white/[.12] py-1.5 pr-2 pl-1.5 shadow-[0_18px_40px_-14px_rgba(6,47,49,.7),0_2px_6px_rgba(6,47,49,.2)] backdrop-blur-xl backdrop-saturate-150">
          <span
            className={cn("pop-spring grid size-8 shrink-0 place-items-center rounded-full", cls)}
          >
            <Icon className={cn("size-[17px]", motion)} strokeWidth={2.6} aria-hidden />
          </span>
          <div className="min-w-0 pr-2">
            <Toast.Title className="truncate text-[14px] leading-5 font-semibold" />
            {t.description && (
              <Toast.Description className="text-on-dark-muted truncate text-xs leading-4" />
            )}
          </div>
          {t.actionProps && (
            <Toast.Action className="bg-lime text-brand-ink tap h-9 shrink-0 rounded-full px-4 text-[13px] font-bold" />
          )}
        </Toast.Content>
      </Toast.Root>
    );
  });
}

export function Toaster({ children }: { children: React.ReactNode }) {
  return (
    <Toast.Provider toastManager={manager} limit={1}>
      {children}
      <Toast.Portal>
        <Toast.Viewport
          data-vt="toasts"
          className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[70] mx-auto w-[min(30rem,calc(100vw-1.5rem))] outline-none [&>*]:pointer-events-auto"
        >
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
