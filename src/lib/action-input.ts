// Round C3: strict checks on what a website action is handed besides the
// form itself (a record's id, a yes/no, a kind). A browser can send anything,
// so each action checks these first, before the sign-in or the database is
// touched, and refuses calmly ("could not be found") when one is wrong.
// The database's own rules still decide who may do what; this only stops
// nonsense early. Tested in tests/unit/action-input.test.ts.
import { UUID } from "@/lib/forms";

/** A record id made by the database (uuid). */
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** A numbered record id (1, 2, 3 …). */
export const isId = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;

export const isBool = (v: unknown): v is boolean => typeof v === "boolean";

/** One of a fixed list of words. */
export function isOneOf<T extends string>(v: unknown, list: readonly T[]): v is T {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

/** A calendar date written 2026-11-30. */
export const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v);

/** A month written 2026-11. */
export const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** Optional: empty (null) or passing the check. */
export const orNull =
  <T>(check: (v: unknown) => v is T) =>
  (v: unknown): v is T | null =>
    v === null || check(v);

/** True when any check failed. */
export const anyBad = (...checks: boolean[]): boolean => checks.some((ok) => !ok);

/** The calm reply to an action handed something it does not accept. */
export const NOT_FOUND = "This record could not be found.";

/** A label number exactly as the database writes it: ICCI-000123. */
export const isLabelSerial = (v: unknown): v is string => typeof v === "string" && /^ICCI-\d{6}$/.test(v);
