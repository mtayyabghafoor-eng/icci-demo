// Calculates the 6-digit code an authenticator app shows (the public
// standard RFC 6238). Used ONLY by the seed script and the tests, so they can
// sign the fictional test accounts in without a phone. The website itself
// never calculates codes: Supabase checks them.
import { createHmac } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Turns the text key shown under the QR code into raw bytes. */
export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const index = ALPHABET.indexOf(ch);
    if (index === -1) throw new Error("The authenticator key contains a character that is not allowed.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** The code for a given moment (default: now). */
export function totp(secret: string, timeMs = Date.now(), digits = 6, stepSeconds = 30): string {
  const counter = Math.floor(timeMs / 1000 / stepSeconds);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac("sha1", base32Decode(secret)).update(message).digest();
  const offset = hash[hash.length - 1] & 0x0f;
  const number = (hash.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return number.toString().padStart(digits, "0");
}

/** Seconds until the code changes. */
export function secondsLeftInWindow(timeMs = Date.now(), stepSeconds = 30): number {
  return stepSeconds - (Math.floor(timeMs / 1000) % stepSeconds);
}
