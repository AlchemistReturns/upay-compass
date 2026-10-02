/** Salted PBKDF2 PIN hashing on Web Crypto. The raw PIN is never stored. */

export type PinRecord = { salt: string; hash: string; iterations: number };

export const PIN_ITERATIONS = 210_000;

const toHex = (buf: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

const fromHex = (hex: string) =>
  new Uint8Array((hex.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16)));

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return toHex(bits);
}

export async function createPinRecord(
  pin: string,
  iterations: number = PIN_ITERATIONS,
): Promise<PinRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: toHex(salt), hash: await derive(pin, salt, iterations), iterations };
}

export async function verifyPin(pin: string, record: PinRecord): Promise<boolean> {
  const candidate = await derive(pin, fromHex(record.salt), record.iterations);
  if (candidate.length !== record.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ record.hash.charCodeAt(i);
  }
  return diff === 0;
}
