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
