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
import {
  LOCK_AFTER_HIDDEN_MS,
  MAX_PIN_ATTEMPTS,
  createPinRecord,
  verifyPin,
} from "@compass/shared";
import { UNLOCKED_FLAG, deletePin, loadPin, savePin } from "@/lib/pin-store";
import { useAuth } from "./auth-provider";

export type UnlockResult = { ok: true } | { ok: false; attemptsLeft: number; signedOut: boolean };

type LockContextValue = {
  /** "unknown" until IndexedDB has been read for the current user. */
  pinState: "unknown" | "none" | "set";
  locked: boolean;
  setPin: (pin: string) => Promise<void>;
  unlock: (pin: string) => Promise<UnlockResult>;
};

const LockContext = createContext<LockContextValue | null>(null);

const readFlag = () => {
  try {
    return sessionStorage.getItem(UNLOCKED_FLAG) === "1";
  } catch {
    return false;
  }
};
const writeFlag = (on: boolean) => {
  try {
    if (on) sessionStorage.setItem(UNLOCKED_FLAG, "1");
    else sessionStorage.removeItem(UNLOCKED_FLAG);
  } catch {
    // ignore
  }
};

export function LockProvider({ children }: { children: React.ReactNode }) {
  const { userId, signOut } = useAuth();
  const [pinState, setPinState] = useState<LockContextValue["pinState"]>("unknown");
  const [locked, setLocked] = useState(false);
  const hiddenAt = useRef<number | null>(null);

  // Load the PIN record whenever the signed-in user changes.
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset while the next user's PIN loads
    setPinState("unknown");
    if (!userId) {
      setLocked(false);
      return;
    }
    void loadPin(userId).then((rec) => {
      if (cancelled) return;
      setPinState(rec ? "set" : "none");
      // A fresh browser session (new tab or restart) must enter the PIN again.
      setLocked(Boolean(rec) && !readFlag());
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

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
          writeFlag(false);
          setLocked(true);
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pinState]);

  const setPin = useCallback(
    async (pin: string) => {
      if (!userId) throw new Error("Not signed in");
      const rec = await createPinRecord(pin);
      await savePin(userId, { ...rec, failed: 0 });
      writeFlag(true);
      setPinState("set");
      setLocked(false);
    },
    [userId],
  );

  const unlock = useCallback(
    async (pin: string): Promise<UnlockResult> => {
      if (!userId) return { ok: false, attemptsLeft: 0, signedOut: true };
      const rec = await loadPin(userId);
      if (!rec) return { ok: false, attemptsLeft: 0, signedOut: true };
      if (await verifyPin(pin, rec)) {
        await savePin(userId, { ...rec, failed: 0 });
        writeFlag(true);
        setLocked(false);
        return { ok: true };
      }
      const failed = rec.failed + 1;
      if (failed >= MAX_PIN_ATTEMPTS) {
        // Too many tries: drop the PIN and force a full OTP login.
        await deletePin(userId);
        await signOut();
        return { ok: false, attemptsLeft: 0, signedOut: true };
      }
      await savePin(userId, { ...rec, failed });
      return { ok: false, attemptsLeft: MAX_PIN_ATTEMPTS - failed, signedOut: false };
    },
    [userId, signOut],
  );

  const value = useMemo(
    () => ({ pinState, locked, setPin, unlock }),
    [pinState, locked, setPin, unlock],
  );

  return <LockContext.Provider value={value}>{children}</LockContext.Provider>;
}

export function useLock() {
  const ctx = useContext(LockContext);
  if (!ctx) throw new Error("useLock must be used inside LockProvider");
  return ctx;
}
