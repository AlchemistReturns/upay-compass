"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useTranslation } from "react-i18next";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel: string;
  /** red confirm button for deleting or losing data (the default) */
  destructive?: boolean;
};

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/**
 * App-styled replacement for window.confirm: an action sheet rising from the bottom on phones,
 * a centered card on larger screens. `await confirm({...})` resolves true only on confirm.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>((next) => {
    resolver.current?.(false);
    haptic("warning");
    setOptions(next);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function settle(ok: boolean) {
    resolver.current?.(ok);
    resolver.current = null;
    setOpen(false);
  }

  const destructive = options?.destructive ?? true;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog.Root open={open} onOpenChange={(next) => !next && settle(false)}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-[60] bg-scrim/45 dark:bg-scrim/60 transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0" />
          <AlertDialog.Viewport className="fixed inset-0 z-[60] flex items-end justify-center p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:items-center sm:p-6">
            <AlertDialog.Popup className="w-full max-w-sm space-y-2 outline-none transition-[transform,opacity] duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:translate-y-8 data-ending-style:opacity-0 data-ending-style:duration-200 data-starting-style:translate-y-full sm:data-starting-style:translate-y-4 sm:data-starting-style:scale-95 data-starting-style:opacity-0">
              <div className="bg-elevated overflow-hidden rounded-[1.75rem] shadow-[var(--shadow-pop)]">
                <div className="px-6 pt-6 pb-5 text-center">
                  <AlertDialog.Title className="text-[17px] leading-snug font-bold">
                    {options?.title}
                  </AlertDialog.Title>
                  {options?.description && (
                    <AlertDialog.Description className="text-muted-foreground mt-1.5 text-sm leading-5">
                      {options.description}
                    </AlertDialog.Description>
                  )}
                </div>
                <button
                  type="button"
                  autoFocus
                  onClick={() => settle(true)}
                  className={cn(
                    "h-14 w-full border-t border-hairline text-[16px] font-bold transition-colors active:bg-muted",
                    destructive
                      ? "text-destructive hover:bg-negative-soft"
                      : "text-primary hover:bg-secondary",
                  )}
                >
                  {options?.confirmLabel}
                </button>
              </div>
              <AlertDialog.Close className="bg-elevated text-foreground hover:bg-muted active:bg-muted tap-soft h-14 w-full rounded-[1.75rem] text-[16px] font-semibold shadow-[var(--shadow-pop)]">
                {t("common.cancel")}
              </AlertDialog.Close>
            </AlertDialog.Popup>
          </AlertDialog.Viewport>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside ConfirmProvider");
  return ctx;
}
