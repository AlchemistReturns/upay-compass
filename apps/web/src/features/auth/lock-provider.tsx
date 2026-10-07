"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { LOCK_AFTER_HIDDEN_MS } from "@compass/shared";
import { supabase } from "@/lib/supabase";
import { readPinFlag, readUnlockFlag, writePinFlag, writeUnlockFlag } from "@/lib/unlock-flag";
import { useAuth } from "./auth-provider";

export type UnlockResult =
  | { ok: true }
  | { ok: false; reason: "wrong"; attemptsLeft: number }
  | { ok: false; reason: "locked"; lockedSeconds: number; attemptsLeft: number }
  | { ok: false; reason: "reset" }
  | { ok: false; reason: "error" };

type PinState = "unknown" | "none" | "set" | "error";

type LockContextValue = {
  /** Whether the signed-in user has a PIN on the server ("unknown" while loading). */
  pinState: PinState;
  locked: boolean;
  setPin: (pin: string) => Promise<void>;
  unlock: (pin: string) => Promise<UnlockResult>;
  /** Re-read the PIN state after an error. */
  reload: () => void;
};

const LockContext = createContext<LockContextValue | null>(null);

type VerifyPinResponse = {
  ok: boolean;
  attempts_left: number;
  reset: boolean;
  locked_seconds?: number;
};

export function LockProvider({ children }: { children: React.ReactNode }) {
  const { userId, signOut } = useAuth();
  const [pinState, setPinState] = useState<PinState>("unknown");
  const [locked, setLocked] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const hiddenAt = useRef<number | null>(null);

  // Ask the server whether this user has a PIN whenever the signed-in user changes.
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset while the PIN state loads
    setPinState("unknown");
    if (!userId) {
      setLocked(false);
      return;
    }
    void supabase.rpc("has_pin").then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        // Offline with a known PIN: stay in the app if this browser session was already unlocked.
        if (!navigator.onLine && readPinFlag(userId)) {
          setPinState("set");
          setLocked(!readUnlockFlag());
          return;
        }
        setPinState("error");
        return;
      }
      if (data) writePinFlag(userId);
      setPinState(data ? "set" : "none");
      // An OTP login or earlier unlock in this browser session skips the PIN prompt;
      // a brand-new browser session (new tab or restart) must enter it.
      setLocked(Boolean(data) && !readUnlockFlag());
    });
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  // Lock after 2 minutes in the background.
  useEffect(() => {
    if (pinState !== "set") return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
      } else if (hiddenAt.current !== null) {
        const away = Date.now() - hiddenAt.current;
        hiddenAt.current = null;
        if (away >= LOCK_AFTER_HIDDEN_MS) {
          writeUnlockFlag(false);
          setLocked(true);
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pinState]);

  const setPin = useCallback(
    async (pin: string) => {
      const { error } = await supabase.rpc("set_pin", { new_pin: pin });
      if (error) throw error;
      writeUnlockFlag(true);
      if (userId) writePinFlag(userId);
      setPinState("set");
      setLocked(false);
    },
    [userId],
  );

  const unlock = useCallback(
    async (pin: string): Promise<UnlockResult> => {
      const { data, error } = await supabase.rpc("verify_pin", { pin });
      if (error || !data) return { ok: false, reason: "error" };
      const res = data as VerifyPinResponse;
      if (res.ok) {
        writeUnlockFlag(true);
        setLocked(false);
        return { ok: true };
      }
      if (res.reset) {
        // Too many wrong tries: the server cleared the PIN, so force a full OTP login.
        await signOut();
        return { ok: false, reason: "reset" };
      }
      const lockedSeconds = res.locked_seconds ?? 0;
      return lockedSeconds > 0 && res.attempts_left >= 0
        ? { ok: false, reason: "locked", lockedSeconds, attemptsLeft: res.attempts_left }
        : { ok: false, reason: "wrong", attemptsLeft: res.attempts_left };
    },
    [signOut],
  );

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const value = useMemo(
    () => ({ pinState, locked, setPin, unlock, reload }),
    [pinState, locked, setPin, unlock, reload],
  );

  return <LockContext.Provider value={value}>{children}</LockContext.Provider>;
}

export function useLock() {
  const ctx = useContext(LockContext);
  if (!ctx) throw new Error("useLock must be used inside LockProvider");
  return ctx;
}
