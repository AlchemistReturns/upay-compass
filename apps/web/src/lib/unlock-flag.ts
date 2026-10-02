/**
 * "This browser session has passed the PIN (or just logged in with an OTP)".
 * Lives in sessionStorage, so a new tab or browser restart asks for the PIN again
 * while a plain reload does not.
 */
const KEY = "compass.unlocked";

export function readUnlockFlag(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function writeUnlockFlag(on: boolean) {
  try {
    if (on) sessionStorage.setItem(KEY, "1");
    else sessionStorage.removeItem(KEY);
  } catch {
    // storage unavailable; the user will just be asked for the PIN
  }
}

/**
 * Remembers (per browser) which user has a PIN set, so the app can still open its last-saved data
 * when the server cannot be asked because the phone is offline. The PIN itself is only ever
 * checked by the server, so an offline browser that has not been unlocked stays locked.
 */
const PIN_KEY = "compass.pin-user";

export function readPinFlag(userId: string): boolean {
  try {
    return localStorage.getItem(PIN_KEY) === userId;
  } catch {
    return false;
  }
}

export function writePinFlag(userId: string) {
  try {
    localStorage.setItem(PIN_KEY, userId);
  } catch {
    // ignore
  }
}

export function forgetPinFlag() {
  try {
    localStorage.removeItem(PIN_KEY);
  } catch {
    // ignore
  }
}
