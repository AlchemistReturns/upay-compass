"use client";

import { Drawer } from "@base-ui/react/drawer";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/**
 * Bottom sheet on phones (swipe down or tap outside to dismiss), a centered card from `sm` up.
 * Keyboard-aware, so a form inside stays visible above the software keyboard.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.VirtualKeyboardProvider>
        <Drawer.Portal>
          <Drawer.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-scrim opacity-[calc(var(--scrim-opacity)*(1-var(--drawer-swipe-progress)))] transition-opacity duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:opacity-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-starting-style:opacity-0 data-swiping:duration-0 supports-[-webkit-touch-callout:none]:absolute" />
          <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
            <Drawer.Popup
              className={cn(
                "bg-elevated text-card-foreground relative flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-t-[2rem] shadow-[0_-12px_48px_-12px_rgba(18, 58, 128,.35)] outline-none sm:max-w-lg sm:rounded-[2rem] sm:shadow-[var(--shadow-pop)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_-20px_60px_-10px_rgba(0,0,0,.8)]",
                "[transform:translateY(var(--drawer-swipe-movement-y))] transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform data-swiping:select-none",
                "data-starting-style:[transform:translateY(100%)] data-ending-style:[transform:translateY(100%)] data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)]",
                "sm:data-starting-style:[transform:translateY(2.5rem)_scale(.97)] sm:data-starting-style:opacity-0 sm:data-ending-style:[transform:translateY(2.5rem)_scale(.97)] sm:data-ending-style:opacity-0 sm:transition-[transform,opacity]",
                className,
              )}
            >
              <div className="relative shrink-0 px-5 pt-3 pb-1 select-none sm:px-6 sm:pt-6">
                <div
                  aria-hidden
                  className="bg-foreground/15 mx-auto mb-3 h-1.5 w-10 rounded-full sm:hidden"
                />
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1 pt-1">
                    <Drawer.Title className="text-xl leading-tight font-bold tracking-tight">
                      {title}
                    </Drawer.Title>
                    {description && (
                      <Drawer.Description className="text-muted-foreground mt-1 text-sm leading-5">
                        {description}
                      </Drawer.Description>
                    )}
                  </div>
                  <Drawer.Close
                    aria-label={t("common.close")}
                    className="bg-muted text-muted-foreground hover:text-foreground tap -mr-1 grid size-11 shrink-0 place-items-center rounded-full"
                  >
                    <X className="ic-close size-[18px]" aria-hidden />
                  </Drawer.Close>
                </div>
              </div>
              <Drawer.Content className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
                {children}
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.VirtualKeyboardProvider>
    </Drawer.Root>
  );
}
